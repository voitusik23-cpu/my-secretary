import json
import re
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, status
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
    """Виконує переклад через Gemini з автоматичним перемиканням моделей (failover)."""
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    if not api_key:
        return {
            "translated_text": text,
            "detected_source_lang": source_lang if source_lang != "auto" else "unknown"
        }

    prompt = TRANSLATE_SYSTEM_INSTRUCTION.format(source_lang=source_lang, target_lang=target_lang)
    candidate_models = [settings.AI_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
    models_to_try = []
    for m in candidate_models:
        if m and m not in models_to_try:
            models_to_try.append(m)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        for model_name in models_to_try:
            try:
                res = client.models.generate_content(
                    model=model_name,
                    contents=text,
                    config=types.GenerateContentConfig(
                        system_instruction=prompt,
                        response_mime_type="application/json",
                        temperature=0.2,
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
                logger.warning(f"Translation model {model_name} failed: {e}. Trying fallback...")
                continue
    except Exception as e:
        logger.error(f"Translation error: {e}")

    return {
        "translated_text": f"[{text}]",
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

    return TranslateTextResponse(
        original_text=text,
        translated_text=res["translated_text"],
        detected_source_lang=res["detected_source_lang"],
        target_lang=payload.target_lang
    )


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
