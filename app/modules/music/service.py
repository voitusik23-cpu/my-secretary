import os
import re
import asyncio
import logging
import urllib.parse
from typing import Dict, Any, List, Optional
import httpx
import yt_dlp
from sqlalchemy.orm import Session

from app.modules.music.models import MusicTrack, MusicPlaylist

logger = logging.getLogger("my_secretary.music.service")
MUSIC_CACHE_DIR = r"C:\Users\Administrator\music_cache"
os.makedirs(MUSIC_CACHE_DIR, exist_ok=True)


async def search_music(query: str, limit: int = 6) -> List[Dict[str, Any]]:
    """Шукає музику через iTunes Search API для отримання офіційних метаданих та Ultra-HD обкладинок."""
    clean_q = query.strip()
    if not clean_q:
        return []

    results = []
    # 1. Search iTunes
    try:
        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(clean_q)}&entity=song&limit={limit}"
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("results", []):
                    art = item.get("artworkUrl100", "")
                    if art:
                        art = art.replace("100x100bb", "600x600bb")
                    dur_ms = item.get("trackTimeMillis", 0)
                    results.append({
                        "title": item.get("trackName", clean_q),
                        "artist": item.get("artistName", "Невідомий виконавець"),
                        "album": item.get("collectionName", ""),
                        "duration": round(dur_ms / 1000) if dur_ms else 0,
                        "cover_url": art or "/static/icons/icon.svg",
                        "preview_url": item.get("previewUrl"),
                        "source": "itunes",
                    })
    except Exception as e:
        logger.warning(f"iTunes search failed: {e}")

    # Fallback if nothing found via iTunes: query yt-dlp search
    if not results:
        loop = asyncio.get_running_loop()
        try:
            def yt_search():
                ydl_opts = {
                    "format": "bestaudio/best",
                    "noplaylist": True,
                    "quiet": True,
                    "skip_download": True,
                    "extract_flat": True,
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(f"ytsearch{limit}:{clean_q}", download=False)
                    return info.get("entries", [])

            entries = await loop.run_in_executor(None, yt_search)
            for en in entries:
                t = en.get("title", clean_q)
                results.append({
                    "title": t,
                    "artist": en.get("uploader") or "YouTube Music",
                    "album": "",
                    "duration": int(en.get("duration") or 0),
                    "cover_url": en.get("thumbnail") or "/static/icons/icon.svg",
                    "preview_url": None,
                    "source": "youtube",
                })
        except Exception as e:
            logger.error(f"yt-dlp search failed: {e}")

    return results


def _extract_audio_stream_sync(artist: str, title: str) -> Optional[str]:
    """Витягує пряме аудіопосилання з YouTube Music без завантаження."""
    search_query = f"ytsearch1:{artist} - {title} audio"
    ydl_opts = {
        "format": "bestaudio/best",
        "noplaylist": True,
        "quiet": True,
        "skip_download": True,
        "extract_flat": False,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_query, download=False)
            if info and "entries" in info and len(info["entries"]) > 0:
                entry = info["entries"][0]
                return entry.get("url")
    except Exception as e:
        logger.error(f"Direct stream extract failed for '{artist} - {title}': {e}")
    return None


def _download_and_cache_track_sync(track_id: int, artist: str, title: str) -> Optional[str]:
    """Завантажує трек у локальний кеш сервера для миттєвого відтворення в авто."""
    target_path = os.path.join(MUSIC_CACHE_DIR, f"{track_id}.m4a")
    if os.path.exists(target_path) and os.path.getsize(target_path) > 10000:
        return target_path

    search_query = f"ytsearch1:{artist} - {title} audio"
    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "outtmpl": os.path.join(MUSIC_CACHE_DIR, f"{track_id}.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([search_query])

        # Check downloaded file
        for ext in ["m4a", "webm", "mp3", "opus"]:
            p = os.path.join(MUSIC_CACHE_DIR, f"{track_id}.{ext}")
            if os.path.exists(p) and os.path.getsize(p) > 10000:
                return p
    except Exception as e:
        logger.error(f"Failed to cache track {track_id}: {e}")
    return None


def is_track_cached(track_id: int) -> bool:
    """Перевіряє, чи завантажено трек у локальний кеш для миттєвого офлайн-відтворення."""
    for ext in ["m4a", "webm", "mp3", "opus"]:
        p = os.path.join(MUSIC_CACHE_DIR, f"{track_id}.{ext}")
        if os.path.exists(p) and os.path.getsize(p) > 10000:
            return True
    return False


def delete_track_cache(track_id: int) -> int:
    """Видаляє всі кешовані аудіофайли треку з диска, щоб видалений трек не міг грати."""
    removed = 0
    for ext in ["m4a", "webm", "mp3", "opus", "part", "temp"]:
        target_path = os.path.join(MUSIC_CACHE_DIR, f"{track_id}.{ext}")
        if os.path.exists(target_path):
            try:
                os.remove(target_path)
                removed += 1
                logger.info(f"Deleted cached audio file: {target_path}")
            except Exception as e:
                logger.warning(f"Could not remove {target_path}: {e}")
    return removed


def clean_orphan_cache(db: Session) -> int:
    """Видаляє будь-які файли з папки music_cache, для яких вже немає запису в базі даних."""
    valid_ids = {str(row[0]) for row in db.query(MusicTrack.id).all()}
    purged = 0
    if not os.path.exists(MUSIC_CACHE_DIR):
        return 0
    for filename in os.listdir(MUSIC_CACHE_DIR):
        base, ext = os.path.splitext(filename)
        if ext.lower() in [".m4a", ".webm", ".mp3", ".opus", ".part"]:
            if base not in valid_ids:
                full_path = os.path.join(MUSIC_CACHE_DIR, filename)
                try:
                    os.remove(full_path)
                    purged += 1
                    logger.info(f"Purged orphan music cache file: {full_path}")
                except Exception as e:
                    logger.warning(f"Failed to remove orphan file {full_path}: {e}")
    return purged


async def get_track_audio_url(track: MusicTrack) -> Optional[str]:
    """Повертає локальний кешований файл або прямий стрім."""
    # 1. Check local cached file
    for ext in ["m4a", "webm", "mp3", "opus"]:
        local_f = os.path.join(MUSIC_CACHE_DIR, f"{track.id}.{ext}")
        if os.path.exists(local_f) and os.path.getsize(local_f) > 10000:
            return local_f

    # 2. Extract direct stream
    loop = asyncio.get_running_loop()
    direct_url = await loop.run_in_executor(None, _extract_audio_stream_sync, track.artist, track.title)
    
    # 3. Trigger background cache download for next time
    asyncio.create_task(asyncio.to_thread(_download_and_cache_track_sync, track.id, track.artist, track.title))
    
    return direct_url


async def parse_and_import_shazam(url_or_text: str, playlist: str = "Shazam", db: Optional[Session] = None) -> Dict[str, Any]:
    """Парсить посилання або повідомлення Shazam і зберігає повну інформацію про трек."""
    raw = url_or_text.strip()
    artist = ""
    title = ""

    # Check if raw text format from Shazam Share: "I used Shazam to discover Title by Artist."
    shazam_text_match = re.search(r"(?:discover|знайти|послухати)\s+([^\n\r]+?)\s+(?:by|від)\s+([^\n\r\.]+)", raw, re.IGNORECASE)
    if shazam_text_match:
        title = shazam_text_match.group(1).strip()
        artist = shazam_text_match.group(2).strip()

    # Check if Shazam URL: https://www.shazam.com/track/... or shazam.com/...
    shazam_url_match = re.search(r"https?://(?:www\.)?shazam\.com/[^\s]+", raw)
    if shazam_url_match:
        url = shazam_url_match.group(0)
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)"})
                if resp.status_code == 200:
                    html = resp.text
                    # Extract title tag
                    m = re.search(r"<title>([^<]+)</title>", html)
                    if m:
                        page_title = m.group(1)
                        # Usually "Song Title - Artist | Shazam"
                        page_title = re.sub(r"\s*\|\s*Shazam.*$", "", page_title)
                        if " - " in page_title:
                            parts = page_title.split(" - ", 1)
                            title = parts[0].strip()
                            artist = parts[1].strip()
                        elif " by " in page_title:
                            parts = page_title.split(" by ", 1)
                            title = parts[0].strip()
                            artist = parts[1].strip()
        except Exception as e:
            logger.warning(f"Failed to fetch Shazam page: {e}")

    if not title:
        # Just clean string
        cleaned = re.sub(r"https?://[^\s]+", "", raw).strip()
        if " - " in cleaned:
            parts = cleaned.split(" - ", 1)
            artist = parts[0].strip()
            title = parts[1].strip()
        else:
            title = cleaned or raw

    # Enrich metadata from Apple Music
    search_q = f"{artist} {title}".strip()
    candidates = await search_music(search_q, limit=1)
    meta = candidates[0] if candidates else {
        "title": title,
        "artist": artist or "Shazam",
        "album": "",
        "duration": 0,
        "cover_url": "/static/icons/icon.svg",
    }

    if db:
        track = MusicTrack(
            title=meta["title"],
            artist=meta["artist"],
            album=meta.get("album"),
            duration=meta.get("duration", 0),
            cover_url=meta.get("cover_url"),
            source="shazam",
            source_url=url_or_text,
            playlist=playlist or "Shazam",
            is_favorite=False,
        )
        db.add(track)
        db.commit()
        db.refresh(track)
        
        # Start background caching of the audio stream
        asyncio.create_task(asyncio.to_thread(_download_and_cache_track_sync, track.id, track.artist, track.title))
        
        return {
            "id": track.id,
            "title": track.title,
            "artist": track.artist,
            "cover_url": track.cover_url,
            "duration": track.duration,
            "playlist": track.playlist,
            "status": "added",
        }

    return meta
