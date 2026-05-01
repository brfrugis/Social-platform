"""
Platform-shaped payloads for social connections.

These models mirror what each vendor documents for API identity and (where applicable)
OAuth-bound resources. See docs/INTEGRATIONS_PLATFORMS.md for authoritative links and
how GIGI-AI maps fields into `connection_metadata` + `external_account_id`.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import SocialPlatform

LINKEDIN_URN = re.compile(r"^urn:li:(person|organization):[A-Za-z0-9_-]+$")

SPEC_VERSION = 2
CONTRACT_KEY = "gigi_platform_contract"
CONTRACT_VALUE = "phase4-v1"

# merge_identity_patch: pass this default for oauth_scopes_granted to leave existing oauth metadata unchanged.
OAUTH_SCOPES_OMITTED = object()


class LinkedInConnectionSpec(BaseModel):
    """LinkedIn REST / Marketing APIs reference members and organizations with URNs."""

    author_urn: str = Field(
        ...,
        min_length=16,
        max_length=255,
        description="urn:li:person:{id} or urn:li:organization:{id} (Microsoft Learn: URNs and IDs).",
    )

    @field_validator("author_urn")
    @classmethod
    def urn_shape(cls, v: str) -> str:
        s = v.strip()
        if not LINKEDIN_URN.match(s):
            raise ValueError(
                "author_urn must match urn:li:person:{id} or urn:li:organization:{id} "
                "(no spaces). See docs/INTEGRATIONS_PLATFORMS.md."
            )
        return s


class XConnectionSpec(BaseModel):
    """X API v2 uses numeric User IDs; user-context auth uses OAuth 2.0 Authorization Code with PKCE."""

    user_id: str = Field(..., min_length=1, max_length=32, description="Numeric User ID from /2/users/me or /2/users/:id.")
    username: str | None = Field(
        default=None,
        max_length=100,
        description="Optional handle for UI only; APIs key off user_id.",
    )

    @field_validator("user_id")
    @classmethod
    def user_id_numeric(cls, v: str) -> str:
        s = v.strip()
        if not s.isdigit():
            raise ValueError("user_id must be digits only (X API v2 snowflake User ID).")
        return s

    @field_validator("username")
    @classmethod
    def trim_username(cls, v: str | None) -> str | None:
        if v is None:
            return None
        t = v.strip().lstrip("@")
        return t or None


class InstagramConnectionSpec(BaseModel):
    """Instagram Platform / Graph: professional IG account is linked to a Facebook Page."""

    facebook_page_id: str = Field(
        ...,
        max_length=32,
        description="Facebook Page ID that owns the Instagram professional account.",
    )
    instagram_user_id: str = Field(
        ...,
        max_length=32,
        description="IG User ID returned by GET /{page-id}?fields=instagram_business_account (Graph API).",
    )

    @field_validator("facebook_page_id", "instagram_user_id")
    @classmethod
    def numeric_graph_ids(cls, v: str) -> str:
        s = v.strip()
        if not s.isdigit():
            raise ValueError("facebook_page_id and instagram_user_id must be numeric Meta Graph IDs.")
        return s


class FacebookConnectionSpec(BaseModel):
    """Facebook Graph API Page publishing is addressed with the Page node ID."""

    page_id: str = Field(..., max_length=32, description="Numeric Facebook Page ID (Page node).")

    @field_validator("page_id")
    @classmethod
    def page_numeric(cls, v: str) -> str:
        s = v.strip()
        if not s.isdigit():
            raise ValueError("page_id must be digits only (Facebook Page ID).")
        return s


def _wrap_metadata(platform_key: str, payload: dict[str, Any], oauth_scopes: str | None) -> dict[str, Any]:
    meta: dict[str, Any] = {
        CONTRACT_KEY: CONTRACT_VALUE,
        "_spec_version": SPEC_VERSION,
        platform_key: payload,
    }
    if oauth_scopes and oauth_scopes.strip():
        meta.setdefault("oauth", {})["scopes_granted"] = oauth_scopes.strip()
    return meta


def materialize_connection(
    platform: SocialPlatform,
    *,
    linkedin: LinkedInConnectionSpec | None = None,
    x: XConnectionSpec | None = None,
    instagram: InstagramConnectionSpec | None = None,
    facebook: FacebookConnectionSpec | None = None,
    oauth_scopes_granted: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Return (external_account_id for uniqueness, connection_metadata blob)."""
    if platform == SocialPlatform.LINKEDIN:
        if not linkedin:
            raise ValueError("linkedin is required for platform=linkedin")
        urn = linkedin.author_urn
        return urn, _wrap_metadata("linkedin", {"author_urn": urn}, oauth_scopes_granted)
    if platform == SocialPlatform.X:
        if not x:
            raise ValueError("x is required for platform=x")
        uid = x.user_id
        payload: dict[str, Any] = {"user_id": uid}
        if x.username:
            payload["username"] = x.username
        return uid, _wrap_metadata("x", payload, oauth_scopes_granted)
    if platform == SocialPlatform.INSTAGRAM:
        if not instagram:
            raise ValueError("instagram is required for platform=instagram")
        payload = {
            "facebook_page_id": instagram.facebook_page_id,
            "instagram_user_id": instagram.instagram_user_id,
        }
        return instagram.instagram_user_id, _wrap_metadata("instagram", payload, oauth_scopes_granted)
    if platform == SocialPlatform.FACEBOOK:
        if not facebook:
            raise ValueError("facebook is required for platform=facebook")
        pid = facebook.page_id
        return pid, _wrap_metadata("facebook", {"page_id": pid}, oauth_scopes_granted)
    if platform == SocialPlatform.OTHER:
        raise ValueError(
            "platform=other is not supported for structured integrations. "
            "Add a first-class platform or extend the contract in code + docs."
        )
    raise ValueError(f"Unsupported platform: {platform}")


def merge_identity_patch(
    platform: SocialPlatform,
    existing_meta: dict[str, Any],
    *,
    linkedin: LinkedInConnectionSpec | None = None,
    x: XConnectionSpec | None = None,
    instagram: InstagramConnectionSpec | None = None,
    facebook: FacebookConnectionSpec | None = None,
    oauth_scopes_granted: str | None | object = OAUTH_SCOPES_OMITTED,
) -> tuple[str | None, dict[str, Any]]:
    """
    Apply typed identity patch. Returns (new_external_id or None if unchanged, merged metadata).
    Pass oauth_scopes_granted=None to clear; omit it (default OAUTH_SCOPES_OMITTED) to leave oauth metadata unchanged.
    """
    meta = dict(existing_meta or {})
    new_ext: str | None = None
    if oauth_scopes_granted is not OAUTH_SCOPES_OMITTED:
        if oauth_scopes_granted is None or (
            isinstance(oauth_scopes_granted, str) and not oauth_scopes_granted.strip()
        ):
            meta.get("oauth", {}).pop("scopes_granted", None)
            if meta.get("oauth") == {}:
                meta.pop("oauth", None)
        elif isinstance(oauth_scopes_granted, str):
            meta.setdefault("oauth", {})["scopes_granted"] = oauth_scopes_granted.strip()

    if platform == SocialPlatform.LINKEDIN and linkedin:
        urn = linkedin.author_urn
        meta["linkedin"] = {"author_urn": urn}
        new_ext = urn
    elif platform == SocialPlatform.X and x:
        payload: dict[str, Any] = {"user_id": x.user_id}
        if x.username:
            payload["username"] = x.username
        meta["x"] = payload
        new_ext = x.user_id
    elif platform == SocialPlatform.INSTAGRAM and instagram:
        meta["instagram"] = {
            "facebook_page_id": instagram.facebook_page_id,
            "instagram_user_id": instagram.instagram_user_id,
        }
        new_ext = instagram.instagram_user_id
    elif platform == SocialPlatform.FACEBOOK and facebook:
        meta["facebook"] = {"page_id": facebook.page_id}
        new_ext = facebook.page_id

    if new_ext is not None:
        meta[CONTRACT_KEY] = CONTRACT_VALUE
        meta["_spec_version"] = SPEC_VERSION
    return new_ext, meta


def count_identity_patch_fragments(
    *,
    linkedin: LinkedInConnectionSpec | None,
    x: XConnectionSpec | None,
    instagram: InstagramConnectionSpec | None,
    facebook: FacebookConnectionSpec | None,
) -> int:
    return sum(1 for v in (linkedin, x, instagram, facebook) if v is not None)


# --- Response DTOs (read model) ---


class LinkedInConnectionOut(BaseModel):
    author_urn: str


class XConnectionOut(BaseModel):
    user_id: str
    username: str | None = None


class InstagramConnectionOut(BaseModel):
    facebook_page_id: str
    instagram_user_id: str


class FacebookConnectionOut(BaseModel):
    page_id: str


def decode_identity_for_response(platform: str, meta: dict[str, Any]) -> dict[str, Any]:
    """Build optional typed fragments for SocialConnectionOut."""
    out: dict[str, Any] = {}
    if platform == SocialPlatform.LINKEDIN.value:
        li = meta.get("linkedin")
        if isinstance(li, dict) and li.get("author_urn"):
            out["linkedin"] = LinkedInConnectionOut(author_urn=str(li["author_urn"]))
    elif platform == SocialPlatform.X.value:
        xi = meta.get("x")
        if isinstance(xi, dict) and xi.get("user_id"):
            out["x"] = XConnectionOut(
                user_id=str(xi["user_id"]),
                username=xi.get("username") if isinstance(xi.get("username"), str) else None,
            )
    elif platform == SocialPlatform.INSTAGRAM.value:
        ig = meta.get("instagram")
        if isinstance(ig, dict) and ig.get("facebook_page_id") and ig.get("instagram_user_id"):
            out["instagram"] = InstagramConnectionOut(
                facebook_page_id=str(ig["facebook_page_id"]),
                instagram_user_id=str(ig["instagram_user_id"]),
            )
    elif platform == SocialPlatform.FACEBOOK.value:
        fb = meta.get("facebook")
        if isinstance(fb, dict) and fb.get("page_id"):
            out["facebook"] = FacebookConnectionOut(page_id=str(fb["page_id"]))
    return out
