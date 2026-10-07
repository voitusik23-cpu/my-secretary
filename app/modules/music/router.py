import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, BackgroundTasks
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.database import get_db, get_user_sessionmaker
from app.auth import verify_secret_key
from app.services.media_token import generate_media_token, verify_media_token
from app.modules.music.models import MusicTrack, MusicPlaylist
from app.modules.music.schemas import (
    TrackResponse,
    TrackCreate,
    ShazamImportRequest,
    SearchMusicRequest,
    PlaylistResponse,
)
from app.modules.music.service import (
    search_music,
    get_track_audio_url,
    parse_and_import_shazam,
    is_track_cached,
    delete_track_cache,
    clean_orphan_cache,
)

router = APIRouter(
    prefix="/music",
    tags=["Music Hub & Player"],
)


def _get_current_user_from_req(request: Request) -> str:
    user = request.headers.get("x-secretary-user") or request.query_params.get("user") or "admin"
    return user.strip().lower()


@router.get("/tracks")
def get_tracks(
    playlist: Optional[str] = None,
    favorite_only: bool = False,
    q: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: bool = Depends(verify_secret_key),
):
    """Повертає список збережених треків для плеєра з пошуком у пам'яті (захист encrypted полів)."""
    limit = min(max(1, limit), 200)
    query = db.query(MusicTrack)

    if favorite_only:
        query = query.filter(MusicTrack.is_favorite == True)
    elif playlist == "Shazam":
        query = query.filter((MusicTrack.playlist == "Shazam") | (MusicTrack.source == "shazam"))
    elif playlist and playlist != "Всі треки":
        query = query.filter(MusicTrack.playlist == playlist)

    tracks = query.order_by(desc(MusicTrack.created_at)).all()

    # Filter in Python memory because title and artist are EncryptedString
    if q:
        clean_q = q.strip().lower()
        tracks = [t for t in tracks if (t.title and clean_q in t.title.lower()) or (t.artist and clean_q in t.artist.lower())]

    tracks = tracks[:limit]

    res = []
    for t in tracks:
        res.append({
            "id": t.id,
            "title": t.title,
            "artist": t.artist,
            "album": t.album,
            "duration": t.duration,
            "cover_url": t.cover_url or "/static/icons/icon.svg",
            "is_favorite": t.is_favorite,
            "playlist": t.playlist,
            "play_count": t.play_count,
            "is_cached": is_track_cached(t.id),
        })
    return res


@router.get("/token/{track_id}")
def get_stream_token(track_id: int, request: Request, _: bool = Depends(verify_secret_key)):
    """Генерує короткоживучий підписаний HMAC токен (5 хв) для відтворення через <audio src>."""
    user = _get_current_user_from_req(request)
    token = generate_media_token(action="stream", resource_id=str(track_id), user=user)
    return {"token": token, "track_id": track_id, "user": user}


@router.get("/stream/{track_id}")
async def stream_track(
    track_id: int,
    request: Request,
    token: Optional[str] = Query(None, description="HMAC signed media token")
):
    """
    Потокове аудіо. Авторизація через:
    1. Підписаний токен ?token=... (для браузерного <audio src>), або
    2. Стандартний заголовок X-Secret-Key / Bearer.
    """
    user = "admin"
    if token:
        # Verify HMAC token
        token_data = verify_media_token(token, expected_action="stream", expected_resource_id=str(track_id))
        user = token_data.get("user", "admin")
    else:
        # Header-based auth
        await verify_secret_key(request)
        user = _get_current_user_from_req(request)

    # Resolve database for the target user/tenant
    sm = get_user_sessionmaker(user)
    with sm() as db:
        track = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
        if not track:
            raise HTTPException(status_code=404, detail="Трек не знайдено")

        track.play_count += 1
        db.commit()

        audio_res = await get_track_audio_url(track, user=user)
        if not audio_res:
            raise HTTPException(status_code=502, detail="Не вдалося отримати аудіопотік")

        if os.path.exists(audio_res) and os.path.isfile(audio_res):
            media_type = "audio/mp4" if audio_res.endswith(".m4a") else ("audio/webm" if audio_res.endswith(".webm") else "audio/mpeg")
            return FileResponse(
                path=audio_res,
                media_type=media_type,
                headers={"Cache-Control": "private, max-age=3600"}
            )

        # Stream remote URL through server proxy to bypass YouTube 403 Forbidden IP-binding
        import httpx

        client_range = request.headers.get("range")
        req_headers = {"User-Agent": "Mozilla/5.0"}
        if client_range:
            req_headers["Range"] = client_range

        async def stream_remote_audio():
            try:
                async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
                    async with client.stream("GET", audio_res, headers=req_headers) as resp:
                        async for chunk in resp.aiter_bytes(chunk_size=65536):
                            yield chunk
            except Exception as e:
                import logging
                logging.getLogger("my_secretary.music").warning(f"Remote stream error for track {track_id}: {e}")

        resp_headers = {
            "Cache-Control": "private, max-age=300",
            "Accept-Ranges": "bytes",
        }
        status_code = 206 if client_range else 200
        return StreamingResponse(
            stream_remote_audio(),
            status_code=status_code,
            media_type="audio/mp4",
            headers=resp_headers
        )


@router.post("/tracks")
def add_track(payload: TrackCreate, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _: bool = Depends(verify_secret_key)):
    """Додає трек у медіатеку та запускає фонове кешування аудіофайлу."""
    user = _get_current_user_from_req(request)
    track = MusicTrack(
        title=payload.title,
        artist=payload.artist,
        album=payload.album,
        duration=payload.duration or 0,
        cover_url=payload.cover_url,
        source=payload.source or "manual",
        source_url=payload.source_url,
        playlist=payload.playlist or "Всі треки",
        is_favorite=payload.is_favorite or False,
    )
    db.add(track)
    db.commit()
    db.refresh(track)

    from app.modules.music.service import _download_and_cache_track_sync
    background_tasks.add_task(_download_and_cache_track_sync, track.id, track.artist, track.title, track.duration, user)

    return {
        "id": track.id,
        "title": track.title,
        "artist": track.artist,
        "cover_url": track.cover_url,
    }


@router.post("/search")
async def search_online_music(payload: SearchMusicRequest, _: bool = Depends(verify_secret_key)):
    """Шукає треки в Apple Music та YouTube."""
    results = await search_music(payload.query, limit=payload.limit or 8)
    return {"status": "success", "results": results}


@router.post("/shazam")
async def import_from_shazam(payload: ShazamImportRequest, request: Request, db: Session = Depends(get_db), _: bool = Depends(verify_secret_key)):
    """Імпортує трек із Shazam."""
    user = _get_current_user_from_req(request)
    res = await parse_and_import_shazam(payload.url_or_text, playlist=payload.playlist, db=db, user=user)
    return {"status": "success", "track": res}


@router.post("/tracks/{track_id}/favorite")
def toggle_favorite(track_id: int, db: Session = Depends(get_db), _: bool = Depends(verify_secret_key)):
    """Перемикає статус 'Улюблене'."""
    track = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Трек не знайдено")
    track.is_favorite = not track.is_favorite
    db.commit()
    return {"id": track.id, "is_favorite": track.is_favorite}


@router.delete("/tracks/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_track(track_id: int, request: Request, db: Session = Depends(get_db), _: bool = Depends(verify_secret_key)):
    """Видаляє трек із медіатеки та його кешовані файли."""
    user = _get_current_user_from_req(request)
    track = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Трек не знайдено")
    db.delete(track)
    db.commit()
    delete_track_cache(track_id, user=user)
    clean_orphan_cache(db, user=user)
    return None
