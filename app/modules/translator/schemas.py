from pydantic import BaseModel, Field


class TranslateTextRequest(BaseModel):
    text: str = Field(..., description="Текст для синхронного перекладу")
    source_lang: str = Field(default="auto", description="Мова оригіналу: auto, uk, ru, en, pl, de, es, fr, it тощо")
    target_lang: str = Field(default="en", description="Цільова мова: en, uk, ru, pl, de, es, fr, it тощо")


class TranslateTextResponse(BaseModel):
    original_text: str
    translated_text: str
    detected_source_lang: str
    target_lang: str
