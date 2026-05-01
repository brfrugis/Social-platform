from __future__ import annotations

from datetime import datetime
from typing import Any, Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.enums import ConnectionStatus, SocialPlatform
from app.schemas.social_platforms import (
    FacebookConnectionOut,
    FacebookConnectionSpec,
    InstagramConnectionOut,
    InstagramConnectionSpec,
    LinkedInConnectionOut,
    LinkedInConnectionSpec,
    XConnectionOut,
    XConnectionSpec,
    count_identity_patch_fragments,
    decode_identity_for_response,
)


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
    """
    Create a connection with a **platform-native identity block** (mandatory).
    Arbitrary JSON blobs are not accepted here — see docs/INTEGRATIONS_PLATFORMS.md.
    """

    platform: SocialPlatform
    display_label: str | None = Field(default=None, max_length=255)
    status: ConnectionStatus = ConnectionStatus.PENDING
    access_token: str | None = None
    refresh_token: str | None = None
    token_expires_at: datetime | None = None
    oauth_scopes_granted: str | None = Field(
        default=None,
        max_length=4000,
        description="Space- or comma-separated scopes you obtained at token grant time (audit / support).",
    )
    linkedin: LinkedInConnectionSpec | None = None
    x: XConnectionSpec | None = None
    instagram: InstagramConnectionSpec | None = None
    facebook: FacebookConnectionSpec | None = None

    @model_validator(mode="after")
    def strict_platform_payload(self) -> Self:
        if self.platform == SocialPlatform.OTHER:
            raise ValueError(
                "platform must be linkedin, x, instagram, or facebook. "
                "Extend enums + docs before using other providers."
            )
        n = count_identity_patch_fragments(
            linkedin=self.linkedin,
            x=self.x,
            instagram=self.instagram,
            facebook=self.facebook,
        )
        if n != 1:
            raise ValueError(
                "Provide exactly one identity block matching `platform`: "
                "`linkedin`, `x`, `instagram`, or `facebook`."
            )
        if self.platform == SocialPlatform.LINKEDIN and (
            not self.linkedin or self.x or self.instagram or self.facebook
        ):
            raise ValueError("For platform=linkedin, send only `linkedin`.")
        if self.platform == SocialPlatform.X and (
            not self.x or self.linkedin or self.instagram or self.facebook
        ):
            raise ValueError("For platform=x, send only `x`.")
        if self.platform == SocialPlatform.INSTAGRAM and (
            not self.instagram or self.linkedin or self.x or self.facebook
        ):
            raise ValueError("For platform=instagram, send only `instagram`.")
        if self.platform == SocialPlatform.FACEBOOK and (
            not self.facebook or self.linkedin or self.x or self.instagram
        ):
            raise ValueError("For platform=facebook, send only `facebook`.")
        return self


class SocialConnectionPatch(BaseModel):
    """Partial update. Identity blocks must match the connection's existing `platform`."""

    display_label: str | None = Field(default=None, max_length=255)
    status: ConnectionStatus | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_expires_at: datetime | None = None
    oauth_scopes_granted: str | None = Field(default=None, max_length=4000)
    linkedin: LinkedInConnectionSpec | None = None
    x: XConnectionSpec | None = None
    instagram: InstagramConnectionSpec | None = None
    facebook: FacebookConnectionSpec | None = None

    @model_validator(mode="after")
    def at_most_one_identity(self) -> Self:
        n = count_identity_patch_fragments(
            linkedin=self.linkedin,
            x=self.x,
            instagram=self.instagram,
            facebook=self.facebook,
        )
        if n > 1:
            raise ValueError("At most one of linkedin, x, instagram, facebook may be set per request.")
        return self


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
    oauth_scopes_granted: str | None = None
    linkedin: LinkedInConnectionOut | None = None
    x: XConnectionOut | None = None
    instagram: InstagramConnectionOut | None = None
    facebook: FacebookConnectionOut | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_masked(cls, row: Any) -> SocialConnectionOut:
        raw_meta = dict(row.extra or {})
        decoded = decode_identity_for_response(row.platform, raw_meta)
        oauth = raw_meta.get("oauth")
        scopes: str | None = None
        if isinstance(oauth, dict) and isinstance(oauth.get("scopes_granted"), str):
            scopes = oauth["scopes_granted"]
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
            connection_metadata=raw_meta,
            oauth_scopes_granted=scopes,
            created_at=row.created_at,
            **decoded,
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


class TokenUsageBucketOut(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0


class WorkspaceTokenUsageOut(BaseModel):
    window: str
    since: datetime
    until: datetime
    totals: TokenUsageBucketOut
    by_operation: dict[str, TokenUsageBucketOut]
    event_count: int
