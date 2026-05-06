from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NewsSourceCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=255)
    feed_url: str = Field(..., min_length=8, max_length=4000)


class NewsSourceOut(BaseModel):
    id: UUID
    customer_id: UUID
    label: str
    feed_url: str
    created_at: datetime
    last_fetched_at: datetime | None

    model_config = {"from_attributes": True}


class NewsItemOut(BaseModel):
    id: UUID
    source_id: UUID
    title: str
    link: str
    summary: str
    published_at: datetime | None
    fetched_at: datetime

    model_config = {"from_attributes": True}


class NewsFetchResult(BaseModel):
    inserted: int
    updated: int
    fetched_entries: int
