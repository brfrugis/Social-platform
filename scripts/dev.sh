#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f backend/.venv/bin/uvicorn ]]; then
  echo "Missing backend/.venv — from backend/: python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting API on http://127.0.0.1:8000 (docs: /docs)"
(
  cd "$ROOT/backend"
  exec .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) &
API_PID=$!

# Wait until /docs responds (avoids Vite proxy errors on first paint)
for _ in {1..40}; do
  if curl -sf "http://127.0.0.1:8000/api/health" >/dev/null; then
    break
  fi
  sleep 0.25
done

echo "Starting UI on http://127.0.0.1:5173"
cd "$ROOT/frontend"
exec npm run dev
