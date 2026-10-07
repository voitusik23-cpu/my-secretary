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

BASE_MUSIC_CACHE_DIR = r"C:\Users\Administrator\music_cache"
os.makedirs(BASE_MUSIC_CACHE_DIR, exist_ok=True)

# Lock per (user, track_id) to prevent duplicate concurrent downloads
_active_downloads_lock = asyncio.Lock()
_active_downloads: Dict[str, asyncio.Future] = {}


def get_user_cache_dir(user: str = "admin") -> str:
    """Returns isolated cache directory for the specific user/tenant."""
    clean_user = re.sub(r"[^a-zA-Z0-9_-]", "", (user or "admin").lower())
    path = os.path.join(BASE_MUSIC_CACHE_DIR, clean_user)
    os.makedirs(path, exist_ok=True)
    return path


def _get_audio_file_duration(file_path: str) -> Optional[float]:
    """Helper using mutagen to verify duration."""
    try:
        from mutagen import File as MutagenFile
        audio = MutagenFile(file_path)
        if audio and audio.info and getattr(audio.info, "length", None):
            return float(audio.info.length)
    except Exception:
        pass
    return None


def _is_cache_duration_valid(file_path: str, expected_duration: int) -> bool:
    """Validates downloaded file length against expected track duration."""
    if not expected_duration or expected_duration <= 0:
        return True
    dur = _get_audio_file_duration(file_path)
    if dur is None or dur <= 0:
        return True
    if expected_duration > 600 and dur < 300:
        return False
    if expected_duration < 300 and dur > 1200:
        return False
    if abs(dur - expected_duration) > 45 and (dur < expected_duration * 0.5 or dur > expected_duration * 1.8):
        return False
    return True


def _extract_audio_stream_sync(artist: str, title: str) -> Optional[str]:
    """Extract direct stream URL."""
    search_query = f"ytsearch1:{artist} - {title} audio"
    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "noplaylist": True,
        "quiet": True,
        "skip_download": True,
        "match_filter": yt_dlp.utils.match_filter_func("duration <= 600"),
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_query, download=False)
            if info and "entries" in info and len(info["entries"]) > 0:
                entry = info["entries"][0]
                return entry.get("url")
    except Exception as e:
        logger.error(f"Failed to extract stream: {e}")
    return None


def _download_and_cache_track_sync(track_id: int, artist: str, title: str, expected_duration: int = 0, user: str = "admin") -> Optional[str]:
    """Downloads audio track directly into user's isolated cache directory."""
    user_dir = get_user_cache_dir(user)
    target_path = os.path.join(user_dir, f"{track_id}.m4a")

    if os.path.exists(target_path) and os.path.getsize(target_path) > 10000:
        if _is_cache_duration_valid(target_path, expected_duration):
            return target_path
        else:
            try:
                os.remove(target_path)
            except Exception:
                pass

    if expected_duration > 3600:
        return None

    temp_template = os.path.join(user_dir, f"{track_id}_tmp.%(ext)s")
    search_query = f"ytsearch1:{artist} - {title} audio"
    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "outtmpl": temp_template,
        "noplaylist": True,
        "quiet": True,
        "match_filter": yt_dlp.utils.match_filter_func("duration <= 600"),
        "max_filesize": 25 * 1024 * 1024,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([search_query])

        downloaded = None
        for ext in ["m4a", "webm", "mp3", "opus"]:
            p = os.path.join(user_dir, f"{track_id}_tmp.{ext}")
            if os.path.exists(p) and os.path.getsize(p) > 10000:
                downloaded = p
                break

        if downloaded:
            if _is_cache_duration_valid(downloaded, expected_duration):
                _, ext = os.path.splitext(downloaded)
                final_path = os.path.join(user_dir, f"{track_id}{ext}")
                if os.path.exists(final_path):
                    try:
                        os.remove(final_path)
                    except Exception:
                        pass
                os.replace(downloaded, final_path)
                logger.info(f"Cached track {track_id} for user '{user}' to {final_path}")
                return final_path
            else:
                try:
                    os.remove(downloaded)
                except Exception:
                    pass
    except Exception as e:
        logger.error(f"Failed to cache track {track_id} for user '{user}': {e}")
    return None


def is_track_cached(track_id: int, user: str = "admin") -> bool:
    """Checks if track is cached in user's isolated directory."""
    user_dir = get_user_cache_dir(user)
    for ext in ["m4a", "webm", "mp3", "opus"]:
        p = os.path.join(user_dir, f"{track_id}.{ext}")
        if os.path.exists(p) and os.path.getsize(p) > 10000:
            return True
    return False


def delete_track_cache(track_id: int, user: str = "admin") -> int:
    """Deletes cached track files only in the specified user's directory."""
    user_dir = get_user_cache_dir(user)
    removed = 0
    for ext in ["m4a", "webm", "mp3", "opus", "part", "temp", "tmp", "ytdl"]:
        for pattern in [f"{track_id}.{ext}", f"{track_id}_tmp.{ext}"]:
            target_path = os.path.join(user_dir, pattern)
            if os.path.exists(target_path):
                try:
                    os.remove(target_path)
                    removed += 1
                except Exception:
                    pass
    return removed


def clean_orphan_cache(db: Session, user: str = "admin") -> int:
    """Cleans orphaned tracks only for the current user's cache folder."""
    tracks = db.query(MusicTrack.id, MusicTrack.duration).all()
    valid_map = {str(row[0]): (row[1] or 0) for row in tracks}
    purged = 0
    user_dir = get_user_cache_dir(user)

    for filename in os.listdir(user_dir):
        base, ext = os.path.splitext(filename)
        ext_clean = ext.lower()
        full_path = os.path.join(user_dir, filename)

        if ext_clean in [".part", ".temp", ".tmp", ".ytdl"] or "_tmp" in base:
            try:
                os.remove(full_path)
                purged += 1
            except Exception:
                pass
            continue

        if ext_clean in [".m4a", ".webm", ".mp3", ".opus"]:
            if base not in valid_map:
                try:
                    os.remove(full_path)
                    purged += 1
                except Exception:
                    pass
            else:
                expected_dur = valid_map[base]
                if not _is_cache_duration_valid(full_path, expected_dur):
                    try:
                        os.remove(full_path)
                        purged += 1
                    except Exception:
                        pass
    return purged


async def get_track_audio_url(track: MusicTrack, user: str = "admin") -> Optional[str]:
    """Returns verified local cached file or direct stream URL, with download deduplication lock."""
    user_dir = get_user_cache_dir(user)

    # 1. Check local cached file
    for ext in ["m4a", "webm", "mp3", "opus"]:
        local_f = os.path.join(user_dir, f"{track.id}.{ext}")
        if os.path.exists(local_f) and os.path.getsize(local_f) > 10000:
            if _is_cache_duration_valid(local_f, track.duration):
                return local_f
            else:
                try:
                    os.remove(local_f)
                except Exception:
                    pass

    # 2. Extract direct stream
    loop = asyncio.get_running_loop()
    direct_url = await loop.run_in_executor(None, _extract_audio_stream_sync, track.artist, track.title)

    # 3. Deduplicated background download
    if track.duration and track.duration <= 3600:
        download_key = f"{user}:{track.id}"
        async with _active_downloads_lock:
            if download_key not in _active_downloads:
                task = asyncio.create_task(
                    asyncio.to_thread(_download_and_cache_track_sync, track.id, track.artist, track.title, track.duration, user)
                )
                _active_downloads[download_key] = task
                task.add_done_callback(lambda _: _active_downloads.pop(download_key, None))

    return direct_url


async def search_music(query: str, limit: int = 6) -> List[Dict[str, Any]]:
    """Searches tracks via iTunes and yt-dlp."""
    clean_q = query.strip()
    if not clean_q:
        return []
    limit = min(max(1, limit), 25)  # Enforce bounds
    results = []
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
            logger.error(f"yt-dlp search error: {e}")

    return results


async def parse_and_import_shazam(url_or_text: str, playlist: str = "Shazam", db: Optional[Session] = None, user: str = "admin") -> Dict[str, Any]:
    """Parse and import from Shazam with isolated caching."""
    raw = url_or_text.strip()
    artist = ""
    title = ""

    shazam_text_match = re.search(r"(?:discover|знайти|послухати)\s+([^\n\r]+?)\s+(?:by|від)\s+([^\n\r\.]+)", raw, re.IGNORECASE)
    if shazam_text_match:
        title = shazam_text_match.group(1).strip()
        artist = shazam_text_match.group(2).strip()

    shazam_url_match = re.search(r"https?://(?:www\.)?shazam\.com/[^\s]+", raw)
    if shazam_url_match:
        url = shazam_url_match.group(0)
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)"})
                if resp.status_code == 200:
                    html = resp.text
                    m = re.search(r"<title>([^<]+)</title>", html)
                    if m:
                        page_title = m.group(1)
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
        cleaned = re.sub(r"https?://[^\s]+", "", raw).strip()
        if " - " in cleaned:
            parts = cleaned.split(" - ", 1)
            artist = parts[0].strip()
            title = parts[1].strip()
        else:
            title = cleaned or raw

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

        asyncio.create_task(
            asyncio.to_thread(_download_and_cache_track_sync, track.id, track.artist, track.title, track.duration, user)
        )

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
