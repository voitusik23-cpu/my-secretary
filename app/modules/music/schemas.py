from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class TrackBase(BaseModel):
    title: str
    artist: str
    album: Optional[str] = None
    duration: Optional[int] = 0
    cover_url: Optional[str] = None
    source: Optional[str] = "search"
    source_url: Optional[str] = None
    playlist: Optional[str] = "Всі треки"
    is_favorite: Optional[bool] = False


class TrackCreate(TrackBase):
    pass


class TrackResponse(TrackBase):
    id: int
    play_count: int
    created_at: datetime
    stream_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ShazamImportRequest(BaseModel):
    url_or_text: str
    playlist: Optional[str] = "Shazam"


class SearchMusicRequest(BaseModel):
    query: str
    limit: Optional[int] = 10


class PlaylistResponse(BaseModel):
    id: int
    name: str
    icon: str
    tracks_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)
