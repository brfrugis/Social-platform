from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_scope
from app.models.customer_member import CustomerMember
from app.models.workspace_token_usage import WorkspaceTokenEvent

logger = logging.getLogger(__name__)


class UsageWindow(str, Enum):
    h24 = "24h"
    h48 = "48h"
    d7 = "7d"
    d30 = "30d"


def window_start_utc(window: UsageWindow) -> datetime:
    now = datetime.now(timezone.utc)
    if window == UsageWindow.h24:
        return now - timedelta(hours=24)
    if window == UsageWindow.h48:
        return now - timedelta(hours=48)
    if window == UsageWindow.d7:
        return now - timedelta(days=7)
    return now - timedelta(days=30)


@dataclass(frozen=True)
class UsageSummaryRaw:
    totals_prompt: int
    totals_completion: int
    by_operation: dict[str, tuple[int, int]]
    event_count: int


async def fetch_workspace_usage_summary(
    session: AsyncSession,
    customer_id: uuid.UUID,
    since: datetime,
    until: datetime,
) -> UsageSummaryRaw:
    q_total = select(
        func.count(WorkspaceTokenEvent.id),
        func.coalesce(func.sum(WorkspaceTokenEvent.prompt_tokens), 0),
        func.coalesce(func.sum(WorkspaceTokenEvent.completion_tokens), 0),
    ).where(
        WorkspaceTokenEvent.customer_id == customer_id,
        WorkspaceTokenEvent.created_at >= since,
        WorkspaceTokenEvent.created_at <= until,
    )
    row_total = (await session.execute(q_total)).one()
    event_count = int(row_total[0])
    totals_prompt = int(row_total[1])
    totals_completion = int(row_total[2])

    q_grp = (
        select(
            WorkspaceTokenEvent.operation,
            func.coalesce(func.sum(WorkspaceTokenEvent.prompt_tokens), 0),
            func.coalesce(func.sum(WorkspaceTokenEvent.completion_tokens), 0),
        )
        .where(
            WorkspaceTokenEvent.customer_id == customer_id,
            WorkspaceTokenEvent.created_at >= since,
            WorkspaceTokenEvent.created_at <= until,
        )
        .group_by(WorkspaceTokenEvent.operation)
    )
    by_op: dict[str, tuple[int, int]] = {}
    for op, sp, sc in await session.execute(q_grp):
        by_op[str(op)] = (int(sp), int(sc))

    return UsageSummaryRaw(
        totals_prompt=totals_prompt,
        totals_completion=totals_completion,
        by_operation=by_op,
        event_count=event_count,
    )

Operation = Literal["studio_generate", "translate", "studio_image_prompt", "studio_image_generate"]


async def _is_member(session: AsyncSession, customer_id: uuid.UUID, principal_id: str) -> bool:
    q = await session.execute(
        select(CustomerMember.id).where(
            CustomerMember.customer_id == customer_id,
            CustomerMember.principal_id == principal_id,
        )
    )
    return q.scalar_one_or_none() is not None


async def try_record_workspace_tokens(
    *,
    principal_id: str,
    customer_id: uuid.UUID | None,
    operation: Operation,
    prompt_tokens: int | None,
    completion_tokens: int | None,
) -> None:
    """Best-effort insert; never raises to callers."""
    if customer_id is None:
        return
    pid = (principal_id or "").strip() or "local-dev"
    try:
        async with async_session_scope() as session:
            if session is None:
                return
            if not await _is_member(session, customer_id, pid):
                return
            session.add(
                WorkspaceTokenEvent(
                    customer_id=customer_id,
                    principal_id=pid,
                    operation=operation,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                )
            )
            await session.commit()
    except Exception:
        logger.exception("workspace token usage log failed")
