from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import ConnectionStatus, MemberRole, SocialPlatform


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=128)


class CustomerPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=128)


class CustomerOut(BaseModel):
    id: UUID
    name: str
    slug: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SocialConnectionCreate(BaseModel):
    platform: SocialPlatform
    external_account_id: str = Field(..., min_length=1, max_length=255)
    display_label: str | None = Field(default=None, max_length=255)
    status: ConnectionStatus = ConnectionStatus.PENDING
    access_token: str | None = None
    refresh_token: str | None = None
    token_expires_at: datetime | None = None
    connection_metadata: dict[str, Any] = Field(default_factory=dict)


class SocialConnectionPatch(BaseModel):
    display_label: str | None = Field(default=None, max_length=255)
    status: ConnectionStatus | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_expires_at: datetime | None = None
    connection_metadata: dict[str, Any] | None = None


class SocialConnectionOut(BaseModel):
    id: UUID
    customer_id: UUID
    platform: str
    external_account_id: str
    display_label: str | None
    status: str
    has_access_token: bool
    has_refresh_token: bool
    token_expires_at: datetime | None
    connection_metadata: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_masked(cls, row: Any) -> "SocialConnectionOut":
        return cls(
            id=row.id,
            customer_id=row.customer_id,
            platform=row.platform,
            external_account_id=row.external_account_id,
            display_label=row.display_label,
            status=row.status,
            has_access_token=bool(row.access_token),
            has_refresh_token=bool(row.refresh_token),
            token_expires_at=row.token_expires_at,
            connection_metadata=dict(row.extra or {}),
            created_at=row.created_at,
        )


class MemberOut(BaseModel):
    id: UUID
    customer_id: UUID
    principal_id: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerBootstrapOut(BaseModel):
    customer: CustomerOut
    membership: MemberOut
