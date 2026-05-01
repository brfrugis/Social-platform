from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DbSession, PrincipalId
from app.models.customer import Customer
from app.models.customer_member import CustomerMember
from app.models.enums import MemberRole, SocialPlatform
from app.models.social_connection import SocialConnection
from app.schemas.social_platforms import (
    OAUTH_SCOPES_OMITTED,
    count_identity_patch_fragments,
    materialize_connection,
    merge_identity_patch,
)
from app.schemas.tenants import (
    CustomerBootstrapOut,
    CustomerCreate,
    CustomerOut,
    CustomerPatch,
    MemberOut,
    SocialConnectionCreate,
    SocialConnectionOut,
    SocialConnectionPatch,
    TokenUsageBucketOut,
    WorkspaceTokenUsageOut,
)
from app.services.workspace_token_usage import (
    UsageWindow,
    fetch_workspace_usage_summary,
    window_start_utc,
)

router = APIRouter(prefix="/api/tenants", tags=["tenants"])


async def _get_membership(
    session: AsyncSession, customer_id: uuid.UUID, principal_id: str
) -> CustomerMember | None:
    q = await session.execute(
        select(CustomerMember).where(
            CustomerMember.customer_id == customer_id,
            CustomerMember.principal_id == principal_id,
        )
    )
    return q.scalar_one_or_none()


async def _require_membership(
    session: AsyncSession, customer_id: uuid.UUID, principal_id: str
) -> CustomerMember:
    m = await _get_membership(session, customer_id, principal_id)
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return m


async def _require_admin(session: AsyncSession, customer_id: uuid.UUID, principal_id: str) -> CustomerMember:
    m = await _require_membership(session, customer_id, principal_id)
    if m.role != MemberRole.ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return m


_DB_UNAVAILABLE = (
    "Cannot reach PostgreSQL. From the repo root run `docker compose up -d`, "
    "then `cd backend && alembic upgrade head`. Override URL with DATABASE_URL if needed."
)


@router.get("/db-health")
async def db_health(session: DbSession) -> dict[str, str]:
    try:
        await session.execute(text("SELECT 1"))
    except OperationalError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=_DB_UNAVAILABLE) from e
    return {"database": "ok"}


@router.post("/customers", response_model=CustomerBootstrapOut, status_code=status.HTTP_201_CREATED)
async def create_customer(body: CustomerCreate, session: DbSession, principal: PrincipalId):
    slug = (body.slug or "").strip() or None
    customer = Customer(name=body.name.strip(), slug=slug)
    session.add(customer)
    await session.flush()
    member = CustomerMember(
        customer_id=customer.id,
        principal_id=principal,
        role=MemberRole.ADMIN.value,
    )
    session.add(member)
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Slug already in use or constraint violation",
        ) from e
    await session.refresh(customer)
    await session.refresh(member)
    return CustomerBootstrapOut(
        customer=CustomerOut.model_validate(customer),
        membership=MemberOut.model_validate(member),
    )


@router.get("/customers", response_model=list[CustomerOut])
async def list_customers(session: DbSession, principal: PrincipalId):
    q = await session.execute(
        select(Customer)
        .join(CustomerMember, CustomerMember.customer_id == Customer.id)
        .where(CustomerMember.principal_id == principal)
        .order_by(Customer.created_at.desc())
    )
    rows = q.scalars().unique().all()
    return [CustomerOut.model_validate(r) for r in rows]


@router.get("/customers/{customer_id}", response_model=CustomerOut)
async def get_customer(customer_id: uuid.UUID, session: DbSession, principal: PrincipalId):
    await _require_membership(session, customer_id, principal)
    q = await session.execute(select(Customer).where(Customer.id == customer_id))
    row = q.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return CustomerOut.model_validate(row)


@router.get("/customers/{customer_id}/usage/tokens", response_model=WorkspaceTokenUsageOut)
async def workspace_token_usage(
    customer_id: uuid.UUID,
    session: DbSession,
    principal: PrincipalId,
    window: UsageWindow = Query(default=UsageWindow.h24),
):
    await _require_membership(session, customer_id, principal)
    until = datetime.now(timezone.utc)
    since = window_start_utc(window)
    raw = await fetch_workspace_usage_summary(session, customer_id, since, until)
    by_op = {
        k: TokenUsageBucketOut(prompt_tokens=v[0], completion_tokens=v[1])
        for k, v in raw.by_operation.items()
    }
    return WorkspaceTokenUsageOut(
        window=window.value,
        since=since,
        until=until,
        totals=TokenUsageBucketOut(
            prompt_tokens=raw.totals_prompt,
            completion_tokens=raw.totals_completion,
        ),
        by_operation=by_op,
        event_count=raw.event_count,
    )


@router.patch("/customers/{customer_id}", response_model=CustomerOut)
async def patch_customer(
    customer_id: uuid.UUID, body: CustomerPatch, session: DbSession, principal: PrincipalId
):
    await _require_admin(session, customer_id, principal)
    q = await session.execute(select(Customer).where(Customer.id == customer_id))
    row = q.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    if body.name is not None:
        row.name = body.name.strip()
    if body.slug is not None:
        s = body.slug.strip()
        row.slug = s or None
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Slug already in use"
        ) from e
    await session.refresh(row)
    return CustomerOut.model_validate(row)


@router.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(customer_id: uuid.UUID, session: DbSession, principal: PrincipalId):
    await _require_admin(session, customer_id, principal)
    q = await session.execute(select(Customer).where(Customer.id == customer_id))
    row = q.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    await session.delete(row)
    await session.commit()


@router.post(
    "/customers/{customer_id}/connections",
    response_model=SocialConnectionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_connection(
    customer_id: uuid.UUID, body: SocialConnectionCreate, session: DbSession, principal: PrincipalId
):
    await _require_membership(session, customer_id, principal)
    try:
        external_account_id, extra = materialize_connection(
            body.platform,
            linkedin=body.linkedin,
            x=body.x,
            instagram=body.instagram,
            facebook=body.facebook,
            oauth_scopes_granted=body.oauth_scopes_granted,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    conn = SocialConnection(
        customer_id=customer_id,
        platform=body.platform.value,
        external_account_id=external_account_id,
        display_label=(body.display_label or "").strip() or None,
        status=body.status.value,
        access_token=body.access_token,
        refresh_token=body.refresh_token,
        token_expires_at=body.token_expires_at,
        extra=extra,
    )
    session.add(conn)
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connection already exists for this platform and external account id",
        ) from e
    await session.refresh(conn)
    return SocialConnectionOut.from_orm_masked(conn)


@router.get("/customers/{customer_id}/connections", response_model=list[SocialConnectionOut])
async def list_connections(customer_id: uuid.UUID, session: DbSession, principal: PrincipalId):
    await _require_membership(session, customer_id, principal)
    q = await session.execute(
        select(SocialConnection)
        .where(SocialConnection.customer_id == customer_id)
        .order_by(SocialConnection.created_at.desc())
    )
    rows = q.scalars().all()
    return [SocialConnectionOut.from_orm_masked(r) for r in rows]


@router.get("/customers/{customer_id}/connections/{connection_id}", response_model=SocialConnectionOut)
async def get_connection(
    customer_id: uuid.UUID, connection_id: uuid.UUID, session: DbSession, principal: PrincipalId
):
    await _require_membership(session, customer_id, principal)
    q = await session.execute(
        select(SocialConnection).where(
            SocialConnection.id == connection_id,
            SocialConnection.customer_id == customer_id,
        )
    )
    row = q.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    return SocialConnectionOut.from_orm_masked(row)


@router.patch("/customers/{customer_id}/connections/{connection_id}", response_model=SocialConnectionOut)
async def patch_connection(
    customer_id: uuid.UUID,
    connection_id: uuid.UUID,
    body: SocialConnectionPatch,
    session: DbSession,
    principal: PrincipalId,
):
    await _require_membership(session, customer_id, principal)
    q = await session.execute(
        select(SocialConnection).where(
            SocialConnection.id == connection_id,
            SocialConnection.customer_id == customer_id,
        )
    )
    row = q.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    plat = SocialPlatform(row.platform)
    data = body.model_dump(exclude_unset=True)
    linkedin = body.linkedin if "linkedin" in data else None
    x_spec = body.x if "x" in data else None
    instagram = body.instagram if "instagram" in data else None
    facebook = body.facebook if "facebook" in data else None
    oauth_kw: str | None | object = OAUTH_SCOPES_OMITTED
    if "oauth_scopes_granted" in data:
        oauth_kw = body.oauth_scopes_granted

    if linkedin and plat != SocialPlatform.LINKEDIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`linkedin` identity is only valid for linkedin connections.",
        )
    if x_spec and plat != SocialPlatform.X:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`x` identity is only valid for x connections.",
        )
    if instagram and plat != SocialPlatform.INSTAGRAM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`instagram` identity is only valid for instagram connections.",
        )
    if facebook and plat != SocialPlatform.FACEBOOK:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`facebook` identity is only valid for facebook connections.",
        )
    identity_n = count_identity_patch_fragments(
        linkedin=linkedin,
        x=x_spec,
        instagram=instagram,
        facebook=facebook,
    )
    if identity_n >= 1 or "oauth_scopes_granted" in data:
        try:
            new_ext, merged = merge_identity_patch(
                plat,
                dict(row.extra or {}),
                linkedin=linkedin,
                x=x_spec,
                instagram=instagram,
                facebook=facebook,
                oauth_scopes_granted=oauth_kw,
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
        row.extra = merged
        if new_ext is not None:
            row.external_account_id = new_ext
    if body.display_label is not None:
        row.display_label = body.display_label.strip() or None
    if body.status is not None:
        row.status = body.status.value
    if body.access_token is not None:
        row.access_token = body.access_token
    if body.refresh_token is not None:
        row.refresh_token = body.refresh_token
    if body.token_expires_at is not None:
        row.token_expires_at = body.token_expires_at
    await session.commit()
    await session.refresh(row)
    return SocialConnectionOut.from_orm_masked(row)


@router.delete(
    "/customers/{customer_id}/connections/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_connection(
    customer_id: uuid.UUID, connection_id: uuid.UUID, session: DbSession, principal: PrincipalId
):
    await _require_membership(session, customer_id, principal)
    q = await session.execute(
        select(SocialConnection).where(
            SocialConnection.id == connection_id,
            SocialConnection.customer_id == customer_id,
        )
    )
    row = q.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    await session.delete(row)
    await session.commit()
