# AWS deployment (low-cost baseline)

This stack targets **minimum viable cost** while staying **AWS-native**, **secure by default**, and aligned with the app today:

- **Amazon Cognito** — mandatory hosted sign-in / PKCE (matches the SPA `VITE_COGNITO_*` env vars).
- **RDS PostgreSQL** — durable storage for tenant/workspace data (same role as local Postgres + Alembic).
- **AWS Secrets Manager** — `DATABASE_URL` injected into ECS (extend the same pattern for `OPENAI_API_KEY`, etc.).
- **ECS Fargate (1 task) + ALB (HTTPS)** — no NAT Gateway (saves ~\$32/mo); tasks run in **public subnets** with a **public IP** so they can reach the internet (Ollama cloud APIs, Anthropic, …) while **RDS stays private**.
- **ECR** — you push the image built from the repo `Dockerfile`.
- **CloudWatch Logs** — container stdout (30-day retention).
- **Coralogix** — use **OpenTelemetry OTLP** from the app (see below); optional log shipping from CloudWatch to Coralogix is a separate subscription.

## Cost notes (order of magnitude)

Exact pricing depends on region, data transfer, and RDS hours.

- **NAT Gateway**: intentionally **not** used (major savings).
- **Fargate**: smallest **0.25 vCPU / 0.5 GB** task, `desired_count = 1`.
- **RDS**: **`db.t4g.micro`** Single-AZ, 20 GB `gp3` (raise for production traffic).
- **ALB**: has a **baseline hourly cost**; it is the practical way to terminate **TLS** for the API+SPA on standard HTTPS. For an even cheaper lab, you could swap to a single EC2 + Caddy (not included here).

## Prerequisites

1. AWS CLI + Terraform ≥ 1.5 configured for your account.
2. An **ACM certificate** in the **same region** as the ALB (DNS validation in Route 53 or your DNS provider).
3. A **globally unique** Cognito hosted UI domain prefix (`cognito_hosted_ui_domain_prefix`).

## One-time: build and push the container

From the **repository root**:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker build -t gigi-api:latest .
docker tag gigi-api:latest <ecr_url_from_terraform_output>:latest
docker push <ecr_url_from_terraform_output>:latest
```

Apply Terraform **after** the first image exists, or the ECS service will fail health checks until `:latest` is present.

## Terraform

```bash
cd deploy/aws/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars (ACM ARN, Cognito URLs, CORS origin).

terraform init
terraform plan
terraform apply
```

### First deploy order (recommended)

1. `terraform apply` — if ECS cannot pull a healthy task, push `:latest` to ECR and **force new deployment** in the ECS console (or re-apply).
2. **Database migrations** (Alembic) — run once against RDS from a trusted runner (CI job, bastion, or `aws ecs run-task` using the same image with command override `alembic upgrade head`). Do **not** skip migrations before sending traffic.

## Cognito → frontend build

After apply, note Terraform outputs:

- `cognito_user_pool_id` → `VITE_COGNITO_USER_POOL_ID`
- `cognito_client_id` → `VITE_COGNITO_CLIENT_ID`
- `cognito_hosted_ui_base` → `VITE_COGNITO_DOMAIN` (no trailing slash)
- `cognito_region` → `VITE_COGNITO_REGION`

Rebuild the SPA with those values so production **requires** Cognito.

## Secrets beyond `DATABASE_URL`

Terraform wires **only** `DATABASE_URL` from Secrets Manager. For OpenAI / Anthropic / Gemini in production:

1. Create **additional** secrets in Secrets Manager (plain string or JSON key).
2. Grant **ecs_execution** role `secretsmanager:GetSecretValue` on those ARNs.
3. Add `secrets` entries to the ECS task definition (Terraform or console), mapping to env vars the backend already reads (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`).

Never bake production keys into the Docker image.

## CORS

Set **`CORS_ORIGINS`** on the task to your public `https://` origin (comma-separated if multiple). The backend reads `CORS_ORIGINS` from the environment (see `backend/app/settings.py`).

## Coralogix (traces via OTLP)

The API enables OpenTelemetry **only if** `OTEL_EXPORTER_OTLP_ENDPOINT` is set. In Coralogix, copy their **OTLP HTTP** endpoint and **authorization header**, then add to the ECS task (as env or as a secret):

- `OTEL_SERVICE_NAME` — e.g. `gigi-api`
- `OTEL_EXPORTER_OTLP_ENDPOINT` — Coralogix ingest URL for traces
- `OTEL_EXPORTER_OTLP_HEADERS` — e.g. `Authorization=Bearer <your_coralogix_private_key>` (format: comma-separated `Key=Value` pairs)

Optional: forward **CloudWatch log groups** to Coralogix with a subscription filter / Lambda / FireLens — not wired in Terraform here.

## Hardening checklist (before real users)

- [ ] Turn on **RDS deletion protection** and larger backups for production.
- [ ] Restrict **ALB** ingress to known office IPs if the product is internal.
- [ ] Enable **AWS WAF** on the ALB if exposed to the public internet.
- [ ] Move **presets/templates** off ephemeral container disk into Postgres or S3 (multi-instance safe).
- [ ] Persist **Studio history** server-side if you need auditability (today: browser `localStorage`).
- [ ] MFA / advanced security in Cognito for admin users.

## Destroy

`terraform destroy` will delete RDS if `skip_final_snapshot = true` (as in this baseline). Change snapshot settings before destroying anything with real data.
