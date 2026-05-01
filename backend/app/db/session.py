from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.settings import settings

_engine = None
_async_session_maker: async_sessionmaker[AsyncSession] | None = None


def init_engine() -> None:
    """Create async engine and session maker when DATABASE_URL is set."""
    global _engine, _async_session_maker
    if not settings.database_url or _engine is not None:
        return
    _engine = create_async_engine(
        settings.database_url,
        pool_pre_ping=True,
    )
    _async_session_maker = async_sessionmaker(_engine, expire_on_commit=False)


async def close_engine() -> None:
    global _engine, _async_session_maker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _async_session_maker = None


def engine_configured() -> bool:
    return _async_session_maker is not None


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if _async_session_maker is None:
        raise RuntimeError("Database session requested but DATABASE_URL is not configured")
    async with _async_session_maker() as session:
        yield session


@asynccontextmanager
async def async_session_scope() -> AsyncIterator[AsyncSession | None]:
    """Short-lived session for optional side effects (e.g. usage logging). Yields None if DB is disabled."""
    if _async_session_maker is None:
        yield None
        return
    async with _async_session_maker() as session:
        yield session
