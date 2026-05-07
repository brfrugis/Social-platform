from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import engine_configured, get_session


async def require_database() -> None:
    if not engine_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "Tenant database is disabled (DATABASE_URL is empty). Remove DATABASE_URL from "
                "backend/.env to use the default local Postgres URL, or set DATABASE_URL explicitly — "
                "see docs/LOCAL_POSTGRES.md."
            ),
        )


async def db_session(
    _: None = Depends(require_database),
) -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


DbSession = Annotated[AsyncSession, Depends(db_session)]


async def principal_id(
    x_principal_id: Annotated[str | None, Header(alias="X-Principal-Id")] = None,
) -> str:
    """Local / dev identity until Cognito is wired; use X-Principal-Id to simulate multiple users."""
    return (x_principal_id or "").strip() or "local-dev"


PrincipalId = Annotated[str, Depends(principal_id)]


@dataclass(frozen=True)
class CloudApiKeyOverrides:
    """Optional per-request API keys from the Settings UI (browser headers). Prefer over server .env when set."""

    openai: str | None = None
    anthropic: str | None = None
    google: str | None = None


def _strip_or_none(s: str | None) -> str | None:
    t = (s or "").strip()
    return t or None


def cloud_api_key_overrides(
    x_gigi_openai_key: Annotated[str | None, Header(alias="X-Gigi-OpenAI-Key")] = None,
    x_gigi_anthropic_key: Annotated[str | None, Header(alias="X-Gigi-Anthropic-Key")] = None,
    x_gigi_google_key: Annotated[str | None, Header(alias="X-Gigi-Google-Key")] = None,
) -> CloudApiKeyOverrides:
    return CloudApiKeyOverrides(
        openai=_strip_or_none(x_gigi_openai_key),
        anthropic=_strip_or_none(x_gigi_anthropic_key),
        google=_strip_or_none(x_gigi_google_key),
    )


CloudKeys = Annotated[CloudApiKeyOverrides, Depends(cloud_api_key_overrides)]
