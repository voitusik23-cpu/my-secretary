from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class AIChatRequest(BaseModel):
    message: str
    include_history: bool = True


class AIChatMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class AIChatHistoryResponse(BaseModel):
    messages: List[AIChatMessageResponse]
