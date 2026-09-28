"""
Service for movies module: AI search, torrents, online streaming links,
and voice command processing.
"""
import json
import logging
import urllib.parse
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.models.media_notes import MediaNote

logger = logging.getLogger("my_secretary.movies.service")

MOVIE_SEARCH_PROMPT = """Ти — кіноексперт-асистент. Шукаєш інформацію про фільм або серіал.
Назва або запит: "{title}"

Поверни СТРОГО валідний JSON (без markdown, без лапок ```):
{{
  "found": true,
  "title": "Офіційна назва українською або російською",
  "original_title": "Original Title",
  "year": 1996,
  "type": "movie",
  "genre": ["Бойовик", "Трилер"],
  "director": "Майкл Бей",
  "cast": ["Шон Коннері", "Ніколас Кейдж", "Ед Гарріс"],
  "rating_imdb": 7.4,
  "rating_kinopoisk": 7.9,
  "duration_min": 136,
  "country": "США",
  "description": "Докладний опис фільму українською мовою (3-4 речення).",
  "review": "Короткий відгук, чому варто подивитись (2-3 речення). Якщо фільм доступний на Netflix (або це оригінал Netflix) — обов'язково окремо зазнач це у відгуку, оскільки у користувача є активний акаунт Netflix."
}}
Якщо фільм/серіал не знайдено: {{"found": false, "title": "{title}", "description": "Не знайдено"}}.
"""


def build_watch_links(title: str, original_title: Optional[str] = None, year: Optional[int] = None) -> List[Dict[str, str]]:
    """Генерує робочі посилання на онлайн-перегляд, торренти та стрімінги з пріоритетом Netflix."""
    clean_title = title.strip()
    year_str = f" {year}" if year else ""
    search_query = f"{clean_title}{year_str}"
    encoded_title = urllib.parse.quote(clean_title)
    encoded_query = urllib.parse.quote(search_query)
    
    # Використовуємо оригінальну назву як альт-пошук для точних торрентів та Netflix
    orig = (original_title or "").strip()
    encoded_orig = urllib.parse.quote(f"{orig}{year_str}") if orig else encoded_query
    netflix_q = urllib.parse.quote(orig if orig else clean_title)

    return [
        # Офіційні стрімінги (Перший пріоритет: Netflix, оскільки у користувача є акаунт)
        {"category": "official", "platform": "🔴 Netflix (Мій акаунт)", "url": f"https://www.netflix.com/search?q={netflix_q}"},
        {"category": "official", "platform": "📺 Megogo", "url": f"https://megogo.net/ua/search?q={encoded_title}"},

        # Онлайн кінотеатри (безкоштовно)
        {"category": "online", "platform": "🎬 Kinogo", "url": f"https://www.google.com/search?q={encoded_query}+смотреть+онлайн+kinogo"},
        {"category": "online", "platform": "🍿 HDRezka", "url": f"https://rezka.ag/search/?q={encoded_title}"},
        {"category": "online", "platform": "🇺🇦 UAKino (укр)", "url": f"https://uakino.me/index.php?do=search&subaction=search&story={encoded_title}"},
        {"category": "online", "platform": "🎥 Baskino", "url": f"https://baskino.org/index.php?do=search&subaction=search&story={encoded_title}"},
        
        # Торренти (завантажити)
        {"category": "torrent", "platform": "🧲 Toloka (Гуртом, укр)", "url": f"https://toloka.to/tracker.php?nm={encoded_title}"},
        {"category": "torrent", "platform": "⚡ Rutor (без реєстрації)", "url": f"https://rutor.info/search/0/0/0/0/{encoded_orig}"},
        {"category": "torrent", "platform": "💾 Rutracker", "url": f"https://rutracker.org/forum/tracker.php?nm={encoded_orig}"},

        # Трейлер
        {"category": "trailer", "platform": "▶️ YouTube Трейлер", "url": f"https://www.youtube.com/results?search_query={encoded_query}+трейлер"}
    ]


async def search_movie_ai(title: str) -> Dict[str, Any]:
    """Шукає фільм через Gemini і доповнює посиланнями на перегляд та торренти."""
    clean_t = title.strip()
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    if not api_key:
        links = build_watch_links(clean_t)
        return {
            "found": True, "title": clean_t, "type": "movie",
            "description": f"Пошук фільму «{clean_t}». Посилання на перегляд доступні нижче.",
            "watch_links": links
        }

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        prompt = MOVIE_SEARCH_PROMPT.format(title=clean_t)
        res = client.models.generate_content(model=settings.AI_MODEL, contents=prompt)
        raw = (res.text or "").strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
            raw = raw.rstrip("`").strip()
        data = json.loads(raw)
        if not data.get("found"):
            data["found"] = True
            data["title"] = clean_t
            data["description"] = f"Фільм «{clean_t}»."

        data["watch_links"] = build_watch_links(
            data.get("title", clean_t),
            data.get("original_title"),
            data.get("year")
        )
        data["trailer_search"] = f"https://www.youtube.com/results?search_query={urllib.parse.quote(clean_t)}+трейлер"
        return data

    except Exception as e:
        logger.warning(f"AI movie search failed: {e}. Fallback to direct links.")
        return {
            "found": True, "title": clean_t, "type": "movie",
            "description": f"Фільм «{clean_t}».",
            "watch_links": build_watch_links(clean_t),
            "trailer_search": f"https://www.youtube.com/results?search_query={urllib.parse.quote(clean_t)}+трейлер"
        }


async def process_voice_movie(data: Dict[str, Any], db: Session) -> Optional[Dict[str, Any]]:
    """Обробляє голосову команду додавання фільму, шукає інфо і зберігає в список перегляду."""
    raw_title = data.get("title") or data.get("item") or data.get("name") or ""
    if not raw_title:
        return None

    movie_info = await search_movie_ai(raw_title)
    main_title = movie_info.get("title") or raw_title
    year = movie_info.get("year")
    orig = movie_info.get("original_title")
    imdb = movie_info.get("rating_imdb")
    rev = movie_info.get("review") or movie_info.get("description") or ""

    comment_parts = []
    if orig: comment_parts.append(f"Оригінал: {orig}")
    if year: comment_parts.append(f"Рік: {year}")
    if imdb: comment_parts.append(f"IMDb: {imdb}")
    if rev: comment_parts.append(rev[:250])

    trailer_url = movie_info.get("trailer_search") or ""
    # Зберігаємо посилання на Netflix як головне, оскільки у користувача є акаунт
    netflix_q = urllib.parse.quote(orig if orig else main_title)
    main_url = f"https://www.netflix.com/search?q={netflix_q}"

    note = MediaNote(
        title=main_title,
        type=movie_info.get("type", "movie"),
        url=main_url,
        author_creator=movie_info.get("director"),
        comment=" | ".join(comment_parts) if comment_parts else None,
        status="to_watch",
        rating=None,
    )
    db.add(note)
    db.flush()

    return {
        "id": note.id,
        "title": main_title,
        "year": year,
        "original_title": orig,
        "movie_info": movie_info
    }
