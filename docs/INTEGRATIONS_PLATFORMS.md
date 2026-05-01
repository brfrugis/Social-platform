# Social integrations — platform requirements (mandatory contract)

GIGI-AI stores each **social connection** as one row per `(customer, platform, canonical external id)`. The API **does not** accept a free-form `external_account_id` + arbitrary JSON anymore: you must send the **typed identity block** for the selected `platform`, which we validate and normalize into `connection_metadata` (see `backend/app/schemas/social_platforms.py`).

This document is the **operator-facing** summary. Always treat the **vendor documentation** as authoritative for OAuth, scopes, app review, rate limits, and endpoint paths — those change over time.

---

## Common concepts

| Concept | How GIGI-AI uses it |
|--------|----------------------|
| **`platform`** | One of `linkedin`, `x`, `instagram`, `facebook`. |
| **`external_account_id`** | Internal **uniqueness key** derived from the platform contract (e.g. LinkedIn URN, X `user_id`, Instagram `instagram_user_id`, Facebook `page_id`). |
| **`connection_metadata`** | Canonical JSON including a typed subtree (`linkedin`, `x`, …), `gigi_platform_contract`, `_spec_version`, and optional `oauth.scopes_granted`. |
| **Tokens** | Optional on create/patch for local testing. **Never** returned by the API (only booleans). Production must use encryption / Secrets Manager (see roadmap). |
| **`oauth_scopes_granted`** | Optional string you record at grant time (space- or comma-separated) for **audit**; the server does not validate it against vendor catalogs. |

---

## LinkedIn

### What the vendor requires

- LinkedIn REST / Marketing APIs identify **people** and **organizations** with **URNs**, not arbitrary URLs.  
- Canonical formats: `urn:li:person:{id}` and `urn:li:organization:{id}`.

### Authoritative references

- [URNs and IDs (Microsoft Learn)](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/urns)  
- [Organizations overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations)  
- [Organization Lookup API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-lookup-api)

### GIGI-AI API (`platform: "linkedin"`)

| Field | Required | Rule |
|-------|----------|------|
| `linkedin.author_urn` | Yes | Must match `urn:li:person:{id}` or `urn:li:organization:{id}` (single line, no spaces). |

**Uniqueness:** `external_account_id` is set to the same URN.

**OAuth / products:** Which Marketing products (Community Management, etc.), partner program, and member consent are **outside** this table — follow LinkedIn’s developer portal for your use case.

---

## X (Twitter)

### What the vendor requires

- X API **v2** uses **numeric User IDs** (snowflakes) as stable identifiers for users.  
- User-context authentication uses **OAuth 2.0 Authorization Code with PKCE** (public clients do not use a client secret the same way as confidential server apps).

### Authoritative references

- [OAuth 2.0 Authorization Code with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)  
- [Authentication mapping (which endpoints accept which auth)](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping)  
- [GET /2/users/:id](https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference/get-users-id)

### GIGI-AI API (`platform: "x"`)

| Field | Required | Rule |
|-------|----------|------|
| `x.user_id` | Yes | Digits only — the v2 **User ID** (e.g. from `GET /2/users/me`). |
| `x.username` | No | Handle for UI only; APIs still key off `user_id`. |

**Uniqueness:** `external_account_id` = `user_id`.

**Scopes:** Request only what you need (e.g. `tweet.read`, `users.read`, `offline.access` for refresh tokens). Record what you received in `oauth_scopes_granted`.

---

## Instagram (Meta — Instagram Platform / Graph)

### What the vendor requires

- Publishing targets an **Instagram professional** account represented as an **IG User** node.  
- That account is **linked to a Facebook Page**; discovery uses the Page + Graph API (`instagram_business_account`).  
- Publishing flows, permissions, and **Page Publishing Authorization (PPA)** are documented by Meta.

### Authoritative references

- [Get Started — Instagram API with Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started/)  
- [Content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/)  
- [Page `instagram_accounts` edge](https://developers.facebook.com/docs/graph-api/reference/page/instagram_accounts/)

### GIGI-AI API (`platform: "instagram"`)

| Field | Required | Rule |
|-------|----------|------|
| `instagram.facebook_page_id` | Yes | Numeric **Facebook Page ID** connected to the Instagram professional account. |
| `instagram.instagram_user_id` | Yes | Numeric **IG User ID** (from `GET /{page-id}?fields=instagram_business_account`). |

**Uniqueness:** `external_account_id` = `instagram_user_id` (the actor you call for `/media` and `/media_publish`).

**Tokens:** Meta distinguishes **Page** vs **Instagram User** access tokens depending on product path; store the active token you use in `access_token` / `refresh_token` and document internally which flavor it is until we add explicit `token_kind` in a later revision.

---

## Facebook (Meta — Graph API Pages)

### What the vendor requires

- Many Page operations are addressed with the **Page ID** and a **Page access token** with appropriate Page tasks / permissions.

### Authoritative references

- [Graph API — Page](https://developers.facebook.com/docs/graph-api/reference/page/)  
- [Permissions reference](https://developers.facebook.com/docs/permissions/reference)

### GIGI-AI API (`platform: "facebook"`)

| Field | Required | Rule |
|-------|----------|------|
| `facebook.page_id` | Yes | Numeric **Facebook Page ID**. |

**Uniqueness:** `external_account_id` = `page_id`.

---

## API examples (JSON)

### Create — LinkedIn

```json
{
  "platform": "linkedin",
  "display_label": "Acme company page",
  "status": "pending",
  "linkedin": { "author_urn": "urn:li:organization:2414183" },
  "oauth_scopes_granted": "r_organization_social …"
}
```

### Create — Instagram

```json
{
  "platform": "instagram",
  "instagram": {
    "facebook_page_id": "134895793791914",
    "instagram_user_id": "17841405822304914"
  }
}
```

### Create — X

```json
{
  "platform": "x",
  "x": { "user_id": "2244994945", "username": "TwitterDev" }
}
```

### Create — Facebook

```json
{
  "platform": "facebook",
  "facebook": { "page_id": "134895793791914" }
}
```

### Patch — update identity + scopes

Send only the fields you want to change. Identity blocks **must** match the row’s existing `platform`.

```json
{
  "linkedin": { "author_urn": "urn:li:organization:999" },
  "oauth_scopes_granted": "updated scopes string"
}
```

---

## Legacy rows

Connections created before this contract may lack `gigi_platform_contract` / typed subtrees. The API still returns `connection_metadata` as stored; typed `linkedin` / `x` / … mirrors may be empty until you **PATCH** or recreate the connection with the new shape.

---

## Change control

When a vendor changes identifier rules or adds mandatory fields:

1. Update **this document** and the official links.  
2. Update **`backend/app/schemas/social_platforms.py`** validators and `materialize_connection` / `merge_identity_patch`.  
3. Add an Alembic migration only if **new columns** are required; prefer `connection_metadata` for forward-compatible additions until volume or indexing demands columns.
