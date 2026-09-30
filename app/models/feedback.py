from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database import Base


class SystemFeedback(Base):
    __tablename__ = "system_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_phone = Column(String(50), nullable=True, index=True)
    feedback_type = Column(String(30), default="idea")  # "idea", "bug", "thanks"
    message = Column(Text, nullable=False)
    client_info = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
