"""RSS/Atom news feeds scoped to tenant customers."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, select
from app.deps import DbSession, PrincipalId
from app.models.news_item import NewsItem
from app.models.news_source import NewsSource
from app.rss_ingest import fetch_feed_entries
from app.routers.tenants import _require_membership
from app.schemas.news import NewsFetchResult, NewsItemOut, NewsSourceCreate, NewsSourceOut

router = APIRouter(prefix="/api/tenants/customers/{customer_id}/news", tags=["news"])


@router.post("/sources", response_model=NewsSourceOut, status_code=status.HTTP_201_CREATED)
async def create_news_source(
    customer_id: uuid.UUID,
    body: NewsSourceCreate,
    session: DbSession,
    principal: PrincipalId,
):
    await _require_membership(session, customer_id, principal)
    src = NewsSource(
        customer_id=customer_id,
        label=body.label.strip(),
        feed_url=body.feed_url.strip(),
    )
    session.add(src)
    await session.commit()
    await session.refresh(src)
    return src


@router.get("/sources", response_model=list[NewsSourceOut])
async def list_news_sources(
    customer_id: uuid.UUID,
    session: DbSession,
    principal: PrincipalId,
):
    await _require_membership(session, customer_id, principal)
    q = await session.execute(
        select(NewsSource).where(NewsSource.customer_id == customer_id).order_by(NewsSource.created_at.desc())
    )
    return list(q.scalars().all())


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_news_source(
    customer_id: uuid.UUID,
    source_id: uuid.UUID,
    session: DbSession,
    principal: PrincipalId,
):
    await _require_membership(session, customer_id, principal)
    q = await session.execute(
        select(NewsSource).where(NewsSource.id == source_id, NewsSource.customer_id == customer_id)
    )
    src = q.scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="News source not found")
    await session.delete(src)
    await session.commit()


@router.post("/sources/{source_id}/fetch", response_model=NewsFetchResult)
async def fetch_news_source(
    customer_id: uuid.UUID,
    source_id: uuid.UUID,
    session: DbSession,
    principal: PrincipalId,
):
    await _require_membership(session, customer_id, principal)
    q = await session.execute(
        select(NewsSource).where(NewsSource.id == source_id, NewsSource.customer_id == customer_id)
    )
    src = q.scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="News source not found")

    try:
        entries = await fetch_feed_entries(src.feed_url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch or parse feed: {e}") from e

    inserted = 0
    updated = 0
    now = datetime.now(timezone.utc)

    for row in entries:
        ek = row["external_key"]
        title = row["title"][:512]
        link = row["link"]
        summary = (row.get("summary") or "")[:16000]
        pub = row.get("published_at")

        ex = await session.execute(
            select(NewsItem).where(NewsItem.source_id == src.id, NewsItem.external_key == ek)
        )
        existing = ex.scalar_one_or_none()
        if existing:
            existing.title = title
            existing.link = link
            existing.summary = summary
            existing.published_at = pub
            existing.fetched_at = now
            updated += 1
        else:
            session.add(
                NewsItem(
                    source_id=src.id,
                    title=title,
                    link=link,
                    summary=summary,
                    external_key=ek[:512],
                    published_at=pub,
                    fetched_at=now,
                )
            )
            inserted += 1

    src.last_fetched_at = now
    await session.commit()

    return NewsFetchResult(inserted=inserted, updated=updated, fetched_entries=len(entries))


@router.get("/items", response_model=list[NewsItemOut])
async def list_news_items(
    customer_id: uuid.UUID,
    session: DbSession,
    principal: PrincipalId,
    limit: int = Query(default=80, ge=1, le=300),
    source_id: uuid.UUID | None = None,
):
    await _require_membership(session, customer_id, principal)
    stmt = (
        select(NewsItem)
        .join(NewsSource, NewsItem.source_id == NewsSource.id)
        .where(NewsSource.customer_id == customer_id)
        .order_by(NewsItem.fetched_at.desc())
        .limit(limit)
    )
    if source_id is not None:
        stmt = stmt.where(NewsItem.source_id == source_id)
    q = await session.execute(stmt)
    return list(q.scalars().all())


@router.delete("/items", status_code=status.HTTP_204_NO_CONTENT)
async def clear_news_items(
    customer_id: uuid.UUID,
    session: DbSession,
    principal: PrincipalId,
    source_id: uuid.UUID | None = Query(default=None),
):
    """Remove cached items (optional: only for one source)."""
    await _require_membership(session, customer_id, principal)
    sub = select(NewsSource.id).where(NewsSource.customer_id == customer_id)
    if source_id is not None:
        sub = sub.where(NewsSource.id == source_id)
    await session.execute(delete(NewsItem).where(NewsItem.source_id.in_(sub)))
    await session.commit()
