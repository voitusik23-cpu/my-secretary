import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.database import get_db
from app.auth import verify_secret_key
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
    _download_and_cache_track_sync,
    is_track_cached,
    delete_track_cache,
    clean_orphan_cache,
)

router = APIRouter(
    prefix="/music",
    tags=["Music Hub & Player"],
    dependencies=[Depends(verify_secret_key)],
)


@router.get("/tracks")
def get_tracks(
    playlist: Optional[str] = None,
    favorite_only: bool = False,
    q: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """Повертає список збережених треків для плеєра."""
    query = db.query(MusicTrack)

    if favorite_only:
        query = query.filter(MusicTrack.is_favorite == True)
    elif playlist == "Shazam":
        query = query.filter((MusicTrack.playlist == "Shazam") | (MusicTrack.source == "shazam"))
    elif playlist and playlist != "Всі треки":
        query = query.filter(MusicTrack.playlist == playlist)

    if q:
        query = query.filter(
            (MusicTrack.title.ilike(f"%{q}%")) | (MusicTrack.artist.ilike(f"%{q}%"))
        )

    tracks = query.order_by(desc(MusicTrack.created_at)).limit(limit).all()

    res = []
    for t in tracks:
        res.append({
            "id": t.id,
            "title": t.title,
            "artist": t.artist,
            "album": t.album,
            "duration": t.duration,
            "cover_url": t.cover_url or "/static/icons/icon.svg",
            "source": t.source,
            "playlist": t.playlist,
            "is_favorite": t.is_favorite,
            "is_cached": is_track_cached(t.id),
            "play_count": t.play_count,
            "created_at": t.created_at,
            "stream_url": f"/api/v1/music/stream/{t.id}",
        })
    return res


@router.post("/tracks/clean-orphans")
def trigger_clean_orphans(db: Session = Depends(get_db)):
    """Очищає залишки видалених треків на диску."""
    purged = clean_orphan_cache(db)
    return {"status": "success", "purged_files": purged}


@router.post("/tracks", status_code=status.HTTP_201_CREATED)
def add_track(payload: TrackCreate, db: Session = Depends(get_db)):
    """Додає новий трек до медіатеки."""
    track = MusicTrack(
        title=payload.title.strip(),
        artist=payload.artist.strip(),
        album=payload.album,
        duration=payload.duration or 0,
        cover_url=payload.cover_url or "/static/icons/icon.svg",
        source=payload.source or "search",
        source_url=payload.source_url,
        playlist=payload.playlist or "Всі треки",
        is_favorite=payload.is_favorite or False,
    )
    db.add(track)
    db.commit()
    db.refresh(track)

    # Trigger background download
    import asyncio
    asyncio.create_task(asyncio.to_thread(_download_and_cache_track_sync, track.id, track.artist, track.title))

    return {
        "id": track.id,
        "title": track.title,
        "artist": track.artist,
        "cover_url": track.cover_url,
        "stream_url": f"/api/v1/music/stream/{track.id}",
    }


@router.post("/search")
async def search_online_music(payload: SearchMusicRequest):
    """Шукає треки в Apple Music та YouTube для додавання в 1 клік."""
    results = await search_music(payload.query, limit=payload.limit or 8)
    return {"status": "success", "results": results}


@router.post("/shazam")
async def import_from_shazam(payload: ShazamImportRequest, db: Session = Depends(get_db)):
    """Імпортує трек із Shazam за посиланням або повідомленням."""
    res = await parse_and_import_shazam(payload.url_or_text, playlist=payload.playlist, db=db)
    return {"status": "success", "track": res}


@router.get("/stream/{track_id}")
async def stream_track(track_id: int, request: Request, db: Session = Depends(get_db)):
    """Потокове аудіо для відтворення в браузері та CarPlay з підтримкою Range перемотки."""
    track = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Трек не знайдено")

    track.play_count += 1
    db.commit()

    audio_res = await get_track_audio_url(track)
    if not audio_res:
        raise HTTPException(status_code=502, detail="Не вдалося отримати аудіопотік")

    # If it's a local cached file, serve with FileResponse (natively supports HTTP 206 Range seeking)
    if os.path.exists(audio_res) and os.path.isfile(audio_res):
        media_type = "audio/mp4" if audio_res.endswith(".m4a") else ("audio/webm" if audio_res.endswith(".webm") else "audio/mpeg")
        return FileResponse(
            path=audio_res,
            media_type=media_type,
            filename=f"{track.artist} - {track.title}.m4a",
        )

    # Otherwise redirect to high-speed CDN audio stream
    return RedirectResponse(audio_res, status_code=307)


@router.post("/tracks/{track_id}/favorite")
def toggle_favorite(track_id: int, db: Session = Depends(get_db)):
    """Перемикає статус 'Улюблене' (лайк)."""
    track = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Трек не знайдено")
    track.is_favorite = not track.is_favorite
    db.commit()
    return {"id": track.id, "is_favorite": track.is_favorite}


@router.delete("/tracks/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_track(track_id: int, db: Session = Depends(get_db)):
    """Видаляє трек із медіатеки та видаляє всі аудіофайли з диска."""
    track = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Трек не знайдено")
    db.delete(track)
    db.commit()
    # Remove physical files from disk so deleted track can NEVER play
    delete_track_cache(track_id)
    clean_orphan_cache(db)
    return None


@router.post("/tracks/{track_id}/playlist")
def set_track_playlist(track_id: int, payload: dict, db: Session = Depends(get_db)):
    """Встановлює або переносить трек у вибраний плейліст (наприклад, 'В авто 🚗')."""
    track = db.query(MusicTrack).filter(MusicTrack.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Трек не знайдено")
    target_pl = payload.get("playlist", "В авто 🚗")
    track.playlist = target_pl
    db.commit()
    return {"id": track.id, "playlist": track.playlist}


@router.post("/playlists/add-all-to-car")
def add_all_tracks_to_car(db: Session = Depends(get_db)):
    """Додає всі наявні треки бібліотеки у плейліст 'В авто 🚗'."""
    tracks = db.query(MusicTrack).all()
    count = 0
    for t in tracks:
        t.playlist = "В авто 🚗"
        count += 1
    db.commit()
    return {"status": "success", "updated_count": count, "message": f"{count} треків додано у плейліст 'В авто'"}


@router.get("/playlists")
def get_playlists(db: Session = Depends(get_db)):
    """Повертає список усіх плейлістів."""
    default_playlists = [
        {"name": "Всі треки", "icon": "🎵"},
        {"name": "Улюблені", "icon": "❤️"},
        {"name": "Shazam", "icon": "⚡"},
        {"name": "В авто 🚗", "icon": "🚗"},
        {"name": "Релакс 🌙", "icon": "🌙"},
    ]

    # Count tracks in each playlist
    counts = dict(
        db.query(MusicTrack.playlist, func.count(MusicTrack.id))
        .group_by(MusicTrack.playlist)
        .all()
    )
    fav_count = db.query(func.count(MusicTrack.id)).filter(MusicTrack.is_favorite == True).scalar() or 0
    total_count = db.query(func.count(MusicTrack.id)).scalar() or 0

    res = []
    for p in default_playlists:
        c = total_count if p["name"] == "Всі треки" else (fav_count if p["name"] == "Улюблені" else counts.get(p["name"], 0))
        res.append({
            "name": p["name"],
            "icon": p["icon"],
            "tracks_count": c
        })

    # Custom playlists from DB
    custom = db.query(MusicPlaylist).all()
    existing_names = [p["name"] for p in default_playlists]
    for cp in custom:
        if cp.name not in existing_names:
            res.append({
                "name": cp.name,
                "icon": cp.icon,
                "tracks_count": counts.get(cp.name, 0)
            })

    return res
