#!/usr/bin/env bash
# GIGI-AI — install system deps + Ollama + model + Python venv + npm packages.
# Tested on macOS and typical Linux (bash). For Windows, use WSL2 or docs/INSTALLATION.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

INSTALL_MODEL="${INSTALL_MODEL:-qwen2.5:14b}"
INSTALL_IMAGE_MODEL="${INSTALL_IMAGE_MODEL:-x/z-image-turbo}"
SKIP_OLLAMA_INSTALL="${SKIP_OLLAMA_INSTALL:-0}"
SKIP_MODEL_PULL="${SKIP_MODEL_PULL:-0}"
SKIP_IMAGE_MODEL_PULL="${SKIP_IMAGE_MODEL_PULL:-0}"

echo "==> GIGI-AI installer (repo: $ROOT)"
echo "    Text model:  $INSTALL_MODEL"
echo "    Image model: $INSTALL_IMAGE_MODEL"
echo ""

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: '$1' not found in PATH. Install it and re-run this script." >&2
    exit 1
  fi
}

# --- Node + npm ---
need_cmd node
need_cmd npm
NODE_MAJOR="$(node -p "parseInt(process.versions.node.split('.')[0],10)" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ] 2>/dev/null; then
  echo "WARNING: Node $(node -v) detected. GIGI-AI recommends Node 20 or newer (Vite 8)." >&2
fi

# --- Python 3.11+ ---
PY=""
if command -v python3.12 >/dev/null 2>&1; then
  PY="python3.12"
elif command -v python3.11 >/dev/null 2>&1; then
  PY="python3.11"
elif command -v python3 >/dev/null 2>&1; then
  PY="python3"
fi
if [ -z "$PY" ]; then
  echo "ERROR: Need python3.11 or python3.12 (or python3 >= 3.11). Install from https://www.python.org" >&2
  exit 1
fi
"$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' \
  || { echo "ERROR: Python 3.11+ required." >&2; exit 1; }
echo "    Using Python: $($PY --version)"

# --- Ollama: install CLI if missing ---
if ! command -v ollama >/dev/null 2>&1; then
  if [ "$SKIP_OLLAMA_INSTALL" = "1" ]; then
    echo "ERROR: Ollama not found and SKIP_OLLAMA_INSTALL=1. Install Ollama from https://ollama.com" >&2
    exit 1
  fi
  echo "==> Installing Ollama (official install script)…"
  echo "    If this fails, install manually from https://ollama.com/download"
  curl -fsSL https://ollama.com/install.sh | sh
fi
need_cmd ollama
echo "    Ollama: $(ollama --version 2>/dev/null || echo ok)"

# --- Pull model ---
if [ "$SKIP_MODEL_PULL" != "1" ]; then
  echo "==> Pulling Ollama text model '$INSTALL_MODEL' (large download)…"
  ollama pull "$INSTALL_MODEL"
else
  echo "==> Skipping text model ollama pull (SKIP_MODEL_PULL=1)"
fi

if [ "$SKIP_IMAGE_MODEL_PULL" != "1" ]; then
  echo "==> Pulling Ollama image model '$INSTALL_IMAGE_MODEL' (Studio — large download)…"
  ollama pull "$INSTALL_IMAGE_MODEL"
else
  echo "==> Skipping image model ollama pull (SKIP_IMAGE_MODEL_PULL=1)"
fi

# --- Python venv + pip ---
echo "==> Python venv + pip dependencies…"
if [ ! -d "$ROOT/backend/.venv" ]; then
  (cd "$ROOT/backend" && "$PY" -m venv .venv)
fi
"$ROOT/backend/.venv/bin/pip" install -q --upgrade pip
"$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"

# --- npm ---
echo "==> npm install (frontend)…"
(cd "$ROOT/frontend" && npm install)

# --- .env ---
if [ ! -f "$ROOT/backend/.env" ]; then
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "==> Created backend/.env from .env.example (edit OLLAMA_MODEL / OLLAMA_IMAGE_MODEL if needed)"
fi

echo ""
echo "==> Done."
echo "    Start everything:  chmod +x scripts/dev.sh && ./scripts/dev.sh"
echo "    Then open:         http://127.0.0.1:5173"
echo "    API docs:          http://127.0.0.1:8000/docs"
echo ""
echo "    Full dependency list: docs/INSTALLATION.md"
echo "    WebUI walkthrough:    docs/USER_GUIDE.md"
