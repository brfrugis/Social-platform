# GIGI-AI — User guide (matches the WebUI)

This guide follows the **same structure and labels** as the app so you can read it side‑by‑side with **`http://127.0.0.1:5173`**.

---

## Before you open the app

1. **Ollama** is running (menu bar app on macOS, or `ollama serve` where you use it).
2. **API** is on **`http://127.0.0.1:8000`** (FastAPI / Uvicorn from `backend/`).
3. **WebUI** is on **`http://127.0.0.1:5173`** (`npm run dev` in `frontend/`), or use **`./scripts/dev.sh`** from the repo root to start both.

**Tip:** Use **`127.0.0.1`** in the browser if `localhost` misbehaves (IPv4 vs IPv6).

---

## Top bar (every screen)

| Element | What it does |
|--------|----------------|
| **Title + subtitle** | Reminds you which area you are in and what it is for. |
| **Status pill** (green dot) | Shows the **Ollama model tag** (e.g. `qwen2.5:14b`). Hover for full text including the Ollama base URL. |
| **Refresh** | Re‑calls **`/api/health`**. Use this after changing `backend/.env` or restarting Ollama. |
| **Red banner** | API unreachable — start Uvicorn on **8000**, not on 5173. |

---

## Sidebar (main navigation)

| Item | Purpose |
|------|---------|
| **Studio** | End‑to‑end **generate** workflow: guardrails → brief → formats/tones → output. |
| **Translate** | **English or Spanish → Brazilian Portuguese** in one shot. |
| **Templates** | **Create, edit, delete** guardrail packs used in Studio. |
| **Workspace** | Phase 4 **tenant**: set **Principal ID** (`X-Principal-Id`), create/select **customers**, optional slug. Requires Postgres + **`DATABASE_URL`** (see [LOCAL_POSTGRES.md](./LOCAL_POSTGRES.md)). |
| **Integrations** | Per **active customer**: add/edit/remove **social connections** with **vendor-mandatory fields** only (see [INTEGRATIONS_PLATFORMS.md](./INTEGRATIONS_PLATFORMS.md)). Same DB requirement as Workspace. |
| **Formats and tones** | **JSON editor** for `data/presets.json` (channels and voice presets). |

Footer line: short reminder of ports and **`backend/.env`**.

**Top bar:** when the tenant API is up and a customer is selected, its **name** appears as a pill next to the model status. If the DB is offline, a muted **Tenant DB offline** pill shows instead.

Studio shows a soft banner naming the **active workspace** when set (generation still uses local presets until tenant‑scoped flows are wired).

---

## Studio (suggested workflow)

The **strip at the top** (1 → 4) is a **suggested order**, not a hard lock — you can jump back to change templates or formats anytime before you click **Generate**.

### Step 1 — Guardrail templates

- **Cards** are selectable templates from **Templates**.
- **Badge** shows how many are selected.
- If the library is empty, the **empty state** tells you to open **Templates** first.
- Selected templates are sent as **`template_ids`** on **every** format×tone variant in this run. They act as **mandatory rules** in the prompt (over format/tone when safety or brand conflicts).

### Step 2 — Brief and creativity

- **Large text area:** topic, audience, must‑include facts, words to avoid, etc.
- **Bring from translation:** when you used **Export to Studio** on the Translate tab, click here to paste the queued pt‑BR text into the brief and set output language to **Portuguese (Brazil)**. **Discard queued translation** clears the queue without changing the brief.
- **Output language:** Portuguese (Brazil), English, or Spanish.
- **Temperature:** **slider** + **number** — lower = steadier, higher = more varied.
- **Generate:** runs all checked **format × tone** pairs (see badge **N variant(s)**).
- **Reload presets:** refetches formats/tones/templates from the API (e.g. after editing JSON on disk and restarting the API, or after saving in **Templates** / **Formats and tones**).

### Step 3 — Formats and tones

- **Rows** = formats (hover the **format name** for the full description from presets).
- **Chips** = tones for that format. Toggle any combination.
- **Select all / Clear** for the matrix.

### Step 4 — Output

- After **Generate**, each **card** shows format, tone, optional guardrail names, **per‑call token counts** (`in … · out …`), and **Copy**.
- **Image for this post:** **Suggest image prompt** (text model) → edit → check **approve** → **Generate image** (Ollama **`OLLAMA_IMAGE_MODEL`**, e.g. `x/z-image-turbo`). **Qwen-Image-2512** is not a built‑in Ollama tag; use an Ollama image model or run Qwen via Hugging Face — see **[IMAGE_GENERATION.md](./IMAGE_GENERATION.md)**.
- **Publish:** copy caption, optional PNG download, open the network composer.
- **Token usage (this run)** summarizes **prompt**, **completion**, and **total** across variants (Ollama may omit some counts when caching — see note under the panel).

---

## Translate

1. Choose **English** or **Spanish**.
2. Paste text.
3. **Translate to pt-BR**.
4. **Token usage** appears above the result when Ollama returns counts.
5. **Copy translation** copies only the Portuguese text.
6. **Export to Studio** queues the result for the Studio brief and opens **Studio** — use **Bring from translation** in Studio → Brief to paste it (output language switches to Brazilian Portuguese).

---

## Templates

**Left — Library**

- **Refresh** reloads the list from the server.
- **New template** clears the editor for a new entry.
- Click a row to **edit**; active row is highlighted.
- **Empty state** when there are no templates yet.

**Right — Editor**

- **Quick ingest:** paste a blob, then **Append into guardrails** to stack text into the **Guardrails** field (review before save).
- **Name / Description** — short labels for Studio cards.
- **Guardrails (mandatory)** — rules enforced when the template is selected in Studio.
- **Structure** — optional layout / placeholders.
- **Sample** — optional reference output (model is told not to copy verbatim).
- **Save** / **Delete** as labeled.

Data file on disk: **`data/templates.json`**.

---

## Formats and tones (Library)

- Large **JSON** editor for **`data/presets.json`**.
- Toolbar shows **line count** as a rough size hint.
- **Save presets** validates JSON and writes via the API.
- **Reload from server** discards local edits in the editor and fetches again.

Each **format** and **tone** can include a **`sample`** string for on‑brand references in generation prompts.

---

## Token usage (short)

After **Studio** or **Translate** runs, panels show **Ollama** `prompt_eval_count` and `eval_count`. Numbers may be missing when Ollama **caches** the prompt — the UI explains that when it happens.

---

## Where things live on disk

| Path | Role |
|------|------|
| `data/presets.json` | Formats and tones (also editable in **Formats and tones**). |
| `data/templates.json` | Guardrail templates (also editable in **Templates**). |
| `backend/.env` | `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, paths, timeouts. |

---

## Common issues

| Symptom | What to check |
|--------|----------------|
| Swagger on **5173** | Wrong process on 5173 — stop it; API must be **8000**; Vite uses **`strictPort: true`**. |
| **Cannot reach API** | Uvicorn running? `curl http://127.0.0.1:8000/api/health` |
| **Model errors** | `ollama list` includes your **`OLLAMA_MODEL`** tag; `ollama pull …` if missing. |
| **Slow generation** | Normal on CPU; fewer variants or smaller model. |

For a **full dependency list** and automated setup, see **`docs/INSTALLATION.md`** and **`scripts/install-all.sh`**.
