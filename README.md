# Qwen Social Studio

Local-first **WebUI** to generate social content with **Qwen 8B** (via [Ollama](https://ollama.com)): **formats** and **tones** from `data/presets.json`, plus optional **guardrail templates** from `data/templates.json`. Includes **Translate to pt-BR** for **English or Spanish** source text.

## Prerequisites

1. **Ollama** installed and running (`ollama serve` is usually automatic after install).
2. Pull a Qwen 8B-class model (name must match your env):

   ```bash
   ollama pull qwen2.5:8b
   ```

   Other tags (for example `qwen2.5:7b`) work if you set `OLLAMA_MODEL` accordingly.

## Backend

Use **Python 3.11 or 3.12** (3.14 may lack wheels for some dependencies).

```bash
cd backend
python3.11 -m venv .venv   # or: python3.12 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # optional: edit OLLAMA_MODEL / OLLAMA_BASE_URL
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Frontend (portal UI)

The **React app** is served by **Vite on port 5173** only. The API on **8000** is JSON (`/api/...`) and `/` redirects to **`/docs`** unless you have built `frontend/dist/index.html`.

### Easiest: one terminal for both

From the repo root (after `backend/.venv` and `frontend/node_modules` exist):

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

Then open **`http://127.0.0.1:5173`** — you should see the **Qwen Social Studio** WebUI (sidebar: Studio, Translate, Templates, Formats and tones).

### If port 5173 shows Swagger or `/docs` instead of the React UI

Something else is already using **5173** (often **uvicorn started on the wrong port**). The Vite config uses **`strictPort: true`**, so `npm run dev` should print an error like “Port 5173 is in use”. Fix it by:

1. Stopping whatever is bound to **5173** (check with `lsof -i :5173`).
2. Starting **uvicorn only on 8000**: `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
3. Running **`npm run dev`** again in `frontend/`.

### If `http://127.0.0.1:8000/` is 404

- Open **`http://127.0.0.1:8000/docs`** (Swagger) or **`/api/health`** — those always exist.
- If you ran `npm run build` and have a broken or empty `frontend/dist/` folder, remove it or fix the build; the API only mounts the SPA when **`frontend/dist/index.html`** exists.

## Frontend (manual two terminals)

```bash
cd frontend
npm install
npm run dev
```

Use **`http://127.0.0.1:5173`**. Ensure the API is already running on **8000** so the `/api` proxy works.

## Presets (formats, tones, samples)

Edit **`data/presets.json`** or use **Formats and tones** in the sidebar (JSON editor). Each format and tone supports a `sample` string: paste reference copy so the model can mirror structure and voice without copying verbatim.

## Templates (guardrails)

Ingest reusable **guardrail** packs under **Templates** in the UI (stored in **`data/templates.json`**). Each template has **Guardrails** (mandatory rules), optional **Structure** (skeleton / placeholders), and optional **Sample**. In **Studio**, select which templates apply to the batch; the model is told these rules win over format or tone when they conflict on compliance or brand safety.

## Translation

**Translate** in the sidebar sends pasted text to the same local model with a pt-BR translation prompt. Source language is **English** or **Spanish**.

## Production-style single server

Build the frontend (`npm run build` in `frontend`), then run the API: if **`frontend/dist/index.html`** exists, the backend serves the SPA at `/` (API remains under `/api/...`).

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama HTTP API |
| `OLLAMA_MODEL` | `qwen2.5:8b` | Model tag |
| `PRESETS_PATH` | `../data/presets.json` | Path relative to `backend/` unless absolute |
| `TEMPLATES_PATH` | `../data/templates.json` | Guardrail templates store |
| `REQUEST_TIMEOUT_S` | `600` | Long generations on CPU |
