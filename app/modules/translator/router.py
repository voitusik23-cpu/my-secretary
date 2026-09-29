import json
import re
import base64
import urllib.parse
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, status
from fastapi.responses import Response
from app.auth import verify_secret_key
from app.config import settings
from app.modules.translator.schemas import TranslateTextRequest, TranslateTextResponse

logger = logging.getLogger("my_secretary.translator")

router = APIRouter(prefix="/translator", tags=["Live Translator"])

TRANSLATE_SYSTEM_INSTRUCTION = """Ти — професійний синхронний перекладач для живого діалогу віч-на-віч.
Твоє завдання — швидко, точно та природно перекласти наданий текст з мови оригіналу ({source_lang}) на цільову мову ({target_lang}).
Зберігай розмовний тон, контекст, інтонацію та сленг.
Якщо {source_lang}="auto", точно визнач мову оригіналу (наприклад, uk, ru, en, pl, de, es, fr, it).

Формат відповіді СУВОРО JSON:
{{
  "translated_text": "...",
  "detected_source_lang": "..."
}}
Поверни ТІЛЬКИ валідний JSON без markdown."""


async def perform_translation(text: str, source_lang: str = "auto", target_lang: str = "en") -> Dict[str, str]:
    """Виконує швидкий переклад (<0.3с) через перевірені високошвидкісні шлюзи з failover на Gemini 3.1."""
    sl = (source_lang or "auto").lower()
    tl = (target_lang or "en").lower().split("-")[0]

    # Tier 1: Ultra-fast Google client=dict-chrome-ex (~0.25-0.4s)
    try:
        import httpx
        q = urllib.parse.quote(text)
        url = f"https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl={sl}&tl={tl}&dt=t&q={q}"
        async with httpx.AsyncClient(timeout=1.8) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            if resp.status_code == 200:
                data = resp.json()
                translated = "".join([part[0] for part in data[0] if part and part[0]]).strip()
                detected = data[2] if len(data) > 2 and isinstance(data[2], str) else sl
                if translated:
                    return {
                        "translated_text": translated,
                        "detected_source_lang": detected
                    }
    except Exception as e:
        logger.info(f"Fast Google translate tier failed: {e}")

    # Tier 2: MyMemory fast API fallback (~0.4s)
    try:
        import httpx
        pair = f"{sl}|{tl}" if sl != "auto" else f"autodetect|{tl}"
        q = urllib.parse.quote(text)
        url = f"https://api.mymemory.translated.net/get?q={q}&langpair={pair}"
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                mm_data = resp.json()
                res_text = mm_data.get("responseData", {}).get("translatedText")
                if res_text and not res_text.startswith("MYMEMORY WARNING"):
                    return {
                        "translated_text": res_text.strip(),
                        "detected_source_lang": sl
                    }
    except Exception as e:
        logger.info(f"MyMemory tier failed: {e}")

    # Tier 3: Gemini 3.1 Flash Lite fast AI translation
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    if not api_key:
        return {
            "translated_text": text,
            "detected_source_lang": source_lang if source_lang != "auto" else "unknown"
        }

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        prompt = TRANSLATE_SYSTEM_INSTRUCTION.format(source_lang=source_lang, target_lang=target_lang)
        res = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=text,
            config=types.GenerateContentConfig(
                system_instruction=prompt,
                response_mime_type="application/json",
                temperature=0.1,
            )
        )
        raw_text = res.text or ""
        clean_json = raw_text.strip()
        if "```" in clean_json:
            m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", clean_json)
            if m:
                clean_json = m.group(1).strip()

        parsed = json.loads(clean_json)
        return {
            "translated_text": parsed.get("translated_text", text),
            "detected_source_lang": parsed.get("detected_source_lang", source_lang)
        }
    except Exception as e:
        logger.error(f"Gemini translation error: {e}")

    return {
        "translated_text": text,
        "detected_source_lang": source_lang if source_lang != "auto" else "unknown"
    }


@router.post("/translate-text", response_model=TranslateTextResponse, dependencies=[Depends(verify_secret_key)])
async def translate_text_endpoint(payload: TranslateTextRequest):
    """
    Синхронний переклад тексту або розпізнаної мови для екрана віч-на-віч.
    """
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст для перекладу не може бути порожнім")

    res = await perform_translation(
        text=text,
        source_lang=payload.source_lang,
        target_lang=payload.target_lang
    )

    audio_b64 = None
    translated = res.get("translated_text", "").strip()
    if translated and not translated.startswith("["):
        try:
            import httpx
            async with httpx.AsyncClient(timeout=2.5) as client:
                clean_lang = (payload.target_lang or "en").lower().split("-")[0]
                q = urllib.parse.quote(translated[:300])
                url = f"https://translate.google.com/translate_tts?ie=UTF-8&q={q}&tl={clean_lang}&client=tw-ob"
                tts_resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                if tts_resp.status_code == 200 and tts_resp.content:
                    audio_b64 = base64.b64encode(tts_resp.content).decode("ascii")
        except Exception as e:
            logger.warning(f"Inline TTS generation failed: {e}")

    return TranslateTextResponse(
        original_text=text,
        translated_text=res["translated_text"],
        detected_source_lang=res["detected_source_lang"],
        target_lang=payload.target_lang,
        audio_base64=audio_b64
    )


@router.get("/tts", dependencies=[Depends(verify_secret_key)])
async def text_to_speech(text: str, lang: str = "en"):
    """
    Генерує аудіо вимови (MP3) для перекладеного тексту через Google TTS.
    """
    clean_text = text.strip()[:300]
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    encoded_text = urllib.parse.quote(clean_text)
    clean_lang = (lang or "en").lower().split("-")[0]
    url = f"https://translate.google.com/translate_tts?ie=UTF-8&q={encoded_text}&tl={clean_lang}&client=tw-ob"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)"}
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200 and resp.content:
                return Response(
                    content=resp.content,
                    media_type="audio/mpeg",
                    headers={"Cache-Control": "public, max-age=86400"}
                )
    except Exception as e:
        logger.warning(f"TTS fetch failed: {e}")

    raise HTTPException(status_code=502, detail="TTS generation failed")


@router.websocket("/ws/live-translate")
async def live_translate_websocket(websocket: WebSocket):
    """
    WebSocket endpoint для синхронного перекладу мовного потоку в реальному часі.
    """
    await websocket.accept()
    try:
        while True:
            data_str = await websocket.receive_text()
            try:
                data = json.loads(data_str)
                text = data.get("text", "").strip()
                if not text:
                    continue
                s_lang = data.get("source_lang", "auto")
                t_lang = data.get("target_lang", "en")

                res = await perform_translation(text=text, source_lang=s_lang, target_lang=t_lang)
                await websocket.send_json({
                    "original_text": text,
                    "translated_text": res["translated_text"],
                    "detected_source_lang": res["detected_source_lang"],
                    "target_lang": t_lang
                })
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON payload"})
    except WebSocketDisconnect:
        logger.info("Live translate WebSocket disconnected.")
