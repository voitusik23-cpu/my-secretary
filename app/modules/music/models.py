from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from app.database import Base, EncryptedString


class MusicTrack(Base):
    __tablename__ = "music_tracks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(EncryptedString(255), nullable=False, index=True)
    artist = Column(EncryptedString(255), nullable=False, index=True)
    album = Column(EncryptedString(255), nullable=True)
    duration = Column(Integer, default=0)  # duration in seconds
    cover_url = Column(String(1000), nullable=True)
    audio_path = Column(String(500), nullable=True)  # cached audio file path or stream url
    source = Column(String(50), default="search")  # shazam, voice, search, manual
    source_url = Column(String(1000), nullable=True)
    is_favorite = Column(Boolean, default=False, index=True)
    playlist = Column(String(100), default="Всі треки", index=True)
    play_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class MusicPlaylist(Base):
    __tablename__ = "music_playlists"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    icon = Column(String(20), default="🎵")
    created_at = Column(DateTime, default=datetime.utcnow)
