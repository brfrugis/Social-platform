# Local PostgreSQL (Phase 4 tenant schema)

## Why PostgreSQL (not MongoDB) for this layer

Phase 4 is **relational by nature**: a **customer (tenant)** owns many **social connections**, and you need **unique constraints** (for example one row per customer + platform + external account id), **foreign keys** for cascade deletes, and **join-heavy** queries for “list my customers” and “list connections for customer A.”

MongoDB fits flexible documents and huge sharded blobs well, but you would still model **customer → connections** as references and enforce uniqueness in application code. For **tenant isolation, constraints, and reporting**, a relational database is the default choice here.

You can still store **semi-structured** fields per connection in **`connection_metadata` (JSONB)** on PostgreSQL when a platform needs extra attributes without schema churn.

## Prerequisites

- **Docker** (or another runtime) for the database container only — the API still runs on the host with your existing Python venv.

## 1. Start Postgres

From the repository root:

```bash
docker compose up -d
```

Default credentials match `backend/.env.example`:

| Variable | Value |
|----------|--------|
| User | `gigi` |
| Password | `gigi` |
| Database | `gigi` |
| Port | `5432` |

## 2. Configure the API

The backend **defaults** `DATABASE_URL` to `postgresql+asyncpg://gigi:gigi@127.0.0.1:5432/gigi` (same as Docker Compose), so you often need **no** `backend/.env` line for local Postgres.

Override only if your database differs. To **turn off** the tenant API entirely, set an empty value:

```env
DATABASE_URL=
```

If the tenant API is disabled or Postgres is down, **Studio / generate / translate** keep working; only **`/api/tenants/*`** fails / returns **503**.

## 3. Run migrations

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
```

Alembic uses a **sync** driver (`psycopg`); `env.py` rewrites `+asyncpg` in `DATABASE_URL` to `+psycopg` for migrations.

## 4. Smoke test

Start the API (`uvicorn` or `./scripts/dev.sh`), then:

```bash
curl -sS http://127.0.0.1:8000/api/tenants/db-health
```

Create a customer (creator becomes **admin** for that customer):

```bash
curl -sS -X POST http://127.0.0.1:8000/api/tenants/customers \
  -H 'Content-Type: application/json' \
  -H 'X-Principal-Id: alice' \
  -d '{"name":"Customer A","slug":"customer-a"}'
```

Simulate another user without access (empty list):

```bash
curl -sS http://127.0.0.1:8000/api/tenants/customers -H 'X-Principal-Id: bob'
```

## Web UI

After migrations and `DATABASE_URL`, open the app (`npm run dev` or `./scripts/dev.sh`) and use the sidebar:

- **Workspace** — principal ID, reload customers, radio **active customer**, create/delete customers.
- **Integrations** — manage connections for the active customer (tokens are write‑only from the UI perspective; the API never echoes secret values).

## API surface (summary)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/tenants/db-health` | `SELECT 1` |
| POST | `/api/tenants/customers` | Body: `name`, optional `slug`; adds membership **admin** for `X-Principal-Id` |
| GET | `/api/tenants/customers` | Customers where caller is a member |
| GET/PATCH/DELETE | `/api/tenants/customers/{id}` | PATCH/DELETE need **admin** |
| CRUD | `/api/tenants/customers/{id}/connections` | Platform + `external_account_id`; tokens never returned in JSON (only `has_*` flags) |

**Local identity:** header **`X-Principal-Id`** (defaults to `local-dev` if omitted). Replace with Cognito **`sub`** when auth lands.

**Secrets:** `access_token` / `refresh_token` columns are for **local testing** only. In production, use **encryption** or **Secrets Manager** and avoid returning secrets in any API.

## Schema (tables)

- **`customers`** — tenant row (`name`, optional `slug`).
- **`customer_members`** — `(customer_id, principal_id, role)`; unique per customer + principal.
- **`social_connections`** — linked account per platform; unique `(customer_id, platform, external_account_id)`; optional OAuth fields + `connection_metadata` JSONB.

See `backend/app/models/` and Alembic revision `20250501_0001_phase4_tenants.py`.
