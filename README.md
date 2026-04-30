# Qwen Social Studio

Local-first portal to generate social content with **Qwen 8B** (via [Ollama](https://ollama.com)), combining **formats** and **tones** you define in `data/presets.json`. Includes a **Translate to pt-BR** flow for **English or Spanish** source text.

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

### If `localhost:8000` fails in the browser

- **Use the portal on port 5173** – During development the React UI runs on Vite (`npm run dev`), not on 8000. Open `http://127.0.0.1:5173` so `/api` calls are proxied to this backend.
- **`http://localhost:8000/` used to 404** – The API has no HTML homepage unless you run `npm run build` in `frontend`. You should now see a short landing page at `/`, or use `http://127.0.0.1:8000/docs` for Swagger.
- **Connection refused with `localhost` but `127.0.0.1` works** – Some systems resolve `localhost` to IPv6 first; bind explicitly, for example:
  `uvicorn app.main:app --reload --host ::1 --port 8000`
  or open `http://127.0.0.1:8000/` instead of `localhost`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (typically `http://127.0.0.1:5173`). API calls are proxied to the backend on port 8000.

## Presets (formats, tones, samples)

Edit **`data/presets.json`** or use the **Formats & tones** tab in the UI. Each format and tone supports a `sample` string: paste your reference copy there so the model can mirror structure and voice without copying verbatim.

After editing on disk, use **Refresh** in the app (or restart the API if you bypass the file the API reads).

## Translation

The **Translate to pt-BR** tab sends the pasted text to the same local model with a dedicated Brazilian Portuguese translation prompt. Source language is selectable (**English** or **Spanish**).

## Production-style single server

Build the frontend (`npm run build` in `frontend`), then run the API: if `frontend/dist` exists, the backend serves it at `/` (API remains under `/api/...`).

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama HTTP API |
| `OLLAMA_MODEL` | `qwen2.5:8b` | Model tag |
| `PRESETS_PATH` | `../data/presets.json` | Path relative to `backend/` unless absolute |
| `REQUEST_TIMEOUT_S` | `600` | Long generations on CPU |
