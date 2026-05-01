# GIGI-AI — product and platform roadmap

This roadmap describes how **GIGI-AI** can evolve from today’s **local-first** stack (Ollama, FastAPI, Vite) toward a **multi-tenant, high-throughput** platform on **AWS**, with **social publishing** and a **customer-centric account model**.

**Two supported usage modes** are part of the product strategy—not an afterthought:

1. **Local** — Small-scale jobs on the user’s machine (same spirit as running Ollama + API + WebUI today), with a **documented, repeatable “professional local”** setup.
2. **Cloud** — EKS-backed scale, identity, queues, and shared caching for teams and production throughput.

It is a planning document: priorities and sequencing should be revisited as usage and constraints become clear.

---

## North star

- **Dual deployment:** Users can choose **local** for low volume, privacy, or experimentation, or **cloud** for concurrency and shared org features—both remain **supported and sustained**, not “cloud only with hacks for local.”
- **Scale (cloud):** Run many **concurrent generation jobs** in the cloud so the team can **produce more structured data and content**, not limited by a single machine’s GPU or CPU.
- **Reliability:** Predictable behavior under load through **orchestration**, **caching**, and **clear failure modes** (retries, backoff, observability)—with **simpler but honest** behavior on local (clear limits, no fake scale).
- **Trust (cloud and optional local):** **Authenticated access** where it matters (Cognito in cloud; optional auth or single-user profiles locally as the product matures); architecture behind a **load balancer** in cloud.
- **Throughput target (cloud):** Design toward **on the order of 10 million tokens consumed per day** (aggregate across users and batch jobs), with headroom for spikes.
- **Distribution:** Eventually **publish** approved copy from the tool to **LinkedIn, X (Twitter), Instagram, Facebook**, and other channels, under a **multi-account, multi-customer** model.

---

## Dual deployment model — Local and Cloud

**Intent:** Anyone who runs GIGI-AI **today** on a laptop should still have a **first-class path** after cloud work lands: small batches, solo or small team, **Ollama (or compatible) on localhost**, without needing EKS to get value.

| Dimension | **Local tier** | **Cloud tier** |
|-----------|----------------|----------------|
| **Audience** | Individual power users, pilots, contributors, “air-gapped” style setups | Teams, production SLAs, multi-customer operations |
| **Inference** | Typically **Ollama on the same host** (or user-provided endpoint) | Cluster or managed inference, autoscaling workers |
| **Identity** | Optional: dev bypass, API key, or later **same Cognito** pointed at local callback URLs only if you choose | **Cognito User Pool**, JWT validation, tenant-scoped APIs |
| **Jobs** | **Low concurrency**, in-process or lightweight queue (or synchronous with backpressure in UI) | **Queues**, workers, idempotency, high concurrency |
| **Caching** | In-memory / optional single-node Redis in **Docker Compose** for parity with cloud semantics | **ElastiCache** (or equivalent), shared tenant-scoped keys |
| **Publishing** | Can be **disabled**, mock adapters, or “dry run” until OAuth is configured | Full OAuth, refresh workers, rate limits, audit |

**Professional local environment (what “sustained local” means):**

- **Documented golden paths** — Pinned or stated Python/Node versions, one-command bootstrap (`install-all` pulls **text + image** Ollama models by default, `dev.sh`), and troubleshooting in **INSTALLATION** / **IMAGE_GENERATION** / runbooks so “works on my machine” shrinks over time.
- **Reproducible packaging** — Optional **Docker Compose** (or similar) for API + UI + optional dependencies so local matches **API contracts and env variable names** used in cloud, without pretending to be EKS.
- **Explicit deployment profile** — A single concept such as `DEPLOYMENT=local` vs `DEPLOYMENT=cloud` (or feature flags) so code paths for Cognito, queues, and Redis are **swapped cleanly** rather than scattered `if os.getenv` checks.
- **Honest limits** — UI and docs state **recommended max concurrency** and behavior under overload for local (queue vs reject vs degrade), aligned with how you run it today.
- **CI parity** — Automated checks that **local bootstrap** and **core API + UI smoke** still pass as cloud code evolves.

Cloud phases below **reuse the same product surfaces** (Studio, templates, presets) wherever possible; only **plumbing** (auth, queue backend, cache backend) should differ by tier.

---

## Current baseline (today)

- **Studio / Translate / Templates** against **Ollama**; presets and guardrails in repo data files.
- **Single-tenant mental model:** one operator, one machine, no cloud identity or org boundaries in the product layer.
- This baseline is the **seed of the Local tier**; the roadmap adds a **deliberate Cloud tier** without retiring local usage.

---

## Phase 1 — Cloud foundation (EKS + ingress + identity)

**Goal:** A production-shaped deployment that is **secure at the edge** and **ready to grow** worker capacity.

| Theme | Direction |
|--------|-----------|
| **Kubernetes (EKS)** | Containerize **API**, **Web UI** (static or SSR as you choose later), and **background workers**. Separate **stateless** app pods from **GPU or high-CPU** inference if you split “control plane” API from “inference workers.” |
| **Load balancing** | **Application Load Balancer** in front of the ingress controller; TLS termination, health checks, and optional **AWS WAF** for abuse protection. |
| **Authentication** | **Amazon Cognito User Pool** for human users: sign-up/sign-in, MFA optional, groups for roles (e.g. admin vs editor). API validates **JWTs** (or use **ALB authenticate** with Cognito OIDC** where it fits your frontend architecture). |
| **Authorization** | Introduce a first-class **tenant id** (customer) on every API request after auth, enforced in middleware and in data access layers (see Phase 4). |
| **Secrets** | **AWS Secrets Manager** / SSM Parameter Store for model keys, OAuth client secrets, and DB credentials — not baked into images. |

**Exit criteria:** Authenticated users can reach the app through the ALB; horizontal pod autoscaling is possible for stateless tiers; no anonymous access to privileged APIs.

**Local tier note:** Cloud identity and ALB do not replace local; **Local** may skip ALB entirely and use **optional auth** or **API keys** until you decide to unify on Cognito for all environments.

---

## Phase 2 — Orchestration and job scale (LLM-driven workflows)

**Goal:** Turn ad-hoc “call Ollama once” flows into **durable, concurrent pipelines** suitable for EKS.

| Theme | Direction |
|--------|-----------|
| **LLM-driven orchestration** | Model **multi-step Studio** flows as explicit **graphs or state machines**: steps (brief → draft → refine), branching (language, format), and **tool-style** side effects (load template, fetch preset). A small **orchestrator service** (or workflow engine) owns retries, timeouts, and partial outputs. |
| **Work queues** | **SQS** (or similar) between API and workers so bursts do not overwhelm inference. **Idempotency keys** per job to avoid duplicate spend on retries. |
| **Observability** | Structured logs, traces (OpenTelemetry), and **per-job metrics**: latency, token counts, failure reason — essential before chasing 10M tokens/day. |
| **Inference topology** | Decide early: **Ollama on GPU nodes in-cluster**, **managed inference**, or **hybrid**. Token economics and latency differ; the orchestration layer should abstract **which backend** fulfills a step. |

**Exit criteria:** N concurrent jobs run safely; operators can see job status and failures; changing one step does not require redeploying the entire monolith if you split services later.

**Local tier note:** The **same orchestration model** (steps, state, retries) can run with a **local adapter**: in-process executor, SQLite or file-backed state, or a single-worker queue so small-scale jobs behave like cloud jobs without SQS.

---

## Phase 3 — Caching and cost control (solid under load)

**Goal:** Reduce redundant work and stabilize latency when many users or automations hit the same patterns.

| Theme | Direction |
|--------|-----------|
| **Response caching** | Cache **deterministic** or **near-deterministic** sub-results (for example template-expanded system prompts, glossary snippets) with explicit **TTL** and **tenant-scoped keys** so Customer A never reads Customer B’s cache entries. |
| **Prompt / embedding caches** | Where you use RAG or fixed corpora, cache **retrieval results** and **chunk embeddings** in a shared store (**ElastiCache Redis** is a common choice on AWS). |
| **Application cache** | Short-lived cache for **presets, templates, and read-heavy metadata** with invalidation on admin updates. |
| **Rate shaping** | Per-tenant and per-user **quotas** aligned with your **10M tokens/day** target so one customer cannot starve others. |

**Exit criteria:** Measurable cache hit rate on hot paths; documented cache key conventions and invalidation rules; quotas visible to admins or in internal dashboards.

**Local tier note:** Use a **cache abstraction** (same interface) with **no-op / in-memory / optional Redis** implementations so local users get correctness and speedups where cheap; **per-tenant keys** still apply when multi-customer exists locally.

---

## Phase 4 — Multi-customer “profiles” and account hierarchy

**Goal:** Match the product to how you sell and operate: **Customer A** owns many **social accounts** across platforms; **Studio and publishing** default to **only that customer’s** assets.

| Concept | Description |
|---------|-------------|
| **Customer (tenant)** | Top-level boundary: billing, quotas, data residency choices, admin users. |
| **Platform account** | A connected identity on **LinkedIn / X / Instagram / Facebook / …** with OAuth tokens, refresh handling, and health status. |
| **Volume** | Design for **20+ accounts per platform per customer** without special-case UI: search, filters, bulk actions, and clear naming (labels, internal IDs). |
| **Workspace context** | After login, user selects (or has a default) **active customer**; all lists, jobs, and caches are **scoped** to that context unless the user has cross-tenant admin rights. |

**Data model sketch:** `Customer` → `SocialConnection` (platform, external account id, encrypted tokens, status) → `ContentItem` / `PublishJob` linked to connections and to Studio outputs.

**Local implementation (started):** PostgreSQL schema and `/api/tenants/*` REST surface (customers, members, connections) with Docker Compose and Alembic — see **[LOCAL_POSTGRES.md](./LOCAL_POSTGRES.md)**. **Integrations** enforce per-vendor identity shapes — see **[INTEGRATIONS_PLATFORMS.md](./INTEGRATIONS_PLATFORMS.md)**. Studio UI scoping by active customer is a follow-up.

**Exit criteria:** API and UI never leak cross-customer data; adding a new platform is “one more connection type,” not a fork of the app.

---

## Phase 5 — Social publishing and integrations

**Goal:** Move from “generate text in the tool” to **scheduled or manual publish** to many accounts, with auditability.

| Theme | Direction |
|--------|-----------|
| **OAuth and compliance** | Per-platform **app registration**, redirect URLs, and **token refresh** workers; store **minimal scopes** and document what each integration can do. |
| **Publish pipeline** | Queue-based **publish jobs**: validate media constraints (image sizes, video length), respect platform rate limits, capture **post id** and permalink back into GIGI-AI. |
| **Failure handling** | Dead-letter queues, user-visible errors (“token revoked”, “policy violation”), and **retry policies** that differ by platform. |
| **Audit** | Who published what, when, to which account — for support and compliance. |

**Exit criteria:** At least one production integration end-to-end; pattern repeatable for additional networks without redesigning the tenant model.

---

## Sizing note: “~10 million tokens per day”

Ten million tokens per day is a **planning anchor**, not a guarantee from a single configuration. Rough considerations:

- **Average tokens per job** × **jobs per second** × **seconds per day** must fit your **inference capacity** and **provider limits**.
- **Peak / valley:** If traffic is bursty, you need either **queue depth** plus **worker scale-out** or **strict queuing** so user experience stays honest (“your job is queued”).
- **Cost:** Token-based billing for cloud LLMs, or **GPU node-hours** for self-hosted models — caching and deduplication directly affect margin.

Treat this as a **capacity model** exercise once you have baseline metrics from Phase 2 (tokens/job, p95 latency, error rate).

---

## Principles across all phases

1. **Two sustained tiers** — **Local** and **Cloud** are both product commitments: document them, test them in CI, and avoid cloud-only refactors that break the **professional local** path without an explicit deprecation.
2. **Tenant isolation first** — especially before broad OAuth and publishing (cloud; local may stay single-tenant longer).
3. **Observable by default** — you cannot operate 10M tokens/day on logs alone; local should still emit **structured logs** and clear errors for debugging.
4. **Progressive delivery** — ship Cognito + EKS + queues before optimizing every cache line; ship **deployment profiles** early so local does not lag structurally.
5. **Shared contracts, swappable backends** — HTTP APIs, job definitions, and cache keys stay stable; only **adapters** (queue, cache, auth) change between Local and Cloud.

---

## Document maintenance

When phases complete, add a short **“Done / superseded by …”** note under each phase and link to ADRs or runbooks. Update this file when the north star metrics or tenant model changes.
