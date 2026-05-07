# Production image: FastAPI + built SPA (served from / by app.main).
# Build: docker build -t gigi-api:latest .
# Run:  docker run -p 8000:8000 -e DATABASE_URL=... gigi-api:latest

FROM node:22-alpine AS frontend-build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY data/presets.json data/templates.json /app/data/
COPY --from=frontend-build /src/dist /app/frontend/dist

ENV PRESETS_PATH=/app/data/presets.json \
    TEMPLATES_PATH=/app/data/templates.json

WORKDIR /app/backend
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
