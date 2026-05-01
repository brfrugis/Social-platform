# GIGI-AI — Installation and dependencies

Everything below is what the project **expects** on your machine. Versions are **minimum guidance**; slightly older Node may work but is not tested with the current Vite toolchain.

---

## 1. Operating system

| OS | Notes |
|----|--------|
| **macOS** (Apple Silicon or Intel) | Primary target; `scripts/install-all.sh` is tuned for it. |
| **Linux** (x86_64 or arm64) | Supported; use the same script on many distros, or follow manual steps. |
| **Windows** | Use **WSL2** (Ubuntu) and follow the Linux path, or install each tool manually (see §8). |

---

## 2. Git

Used to clone the repository.

- **Website:** [https://git-scm.com](https://git-scm.com)  
- **Check:** `git --version`

---

## 3. Ollama (local LLM runtime)

Runs the **Qwen** model and exposes HTTP **`/api/chat`** on port **11434** by default.

- **Website:** [https://ollama.com](https://ollama.com)  
- **Install:** official installer or package manager (e.g. `brew install ollama` on macOS).  
- **Check:** `ollama --version`  
- **Service:** on macOS the menu app usually keeps the server up; otherwise `ollama serve`.  
- **Docs:** [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)

**Disk:** model weights are large (many GB for **qwen2.5:14b**). Ensure free space.

---

## 4. Model weights (Qwen 2.5)

GIGI-AI defaults to **`qwen2.5:14b`** (see `backend/.env.example` and `backend/app/settings.py`).

```bash
ollama pull qwen2.5:14b
```

- **List:** `ollama list`  
- **Other tags:** set `OLLAMA_MODEL` in `backend/.env` (e.g. `qwen2.5:8b`).

---

## 5. Python (backend)

| Requirement | Reason |
|-------------|--------|
| **Python 3.11 or 3.12** | Pinned stack (FastAPI, Pydantic) has reliable wheels. **3.14** often fails to build `pydantic-core` from source. |
| **`venv` + `pip`** | Isolated dependencies under `backend/.venv`. |

- **Website:** [https://www.python.org](https://www.python.org)  
- **Check:** `python3.11 --version` or `python3.12 --version`

**Backend Python packages** (installed via `pip install -r backend/requirements.txt`):

| Package | Role |
|---------|------|
| `fastapi` | HTTP API framework |
| `uvicorn[standard]` | ASGI server (dev `--reload`) |
| `httpx` | Async HTTP client to Ollama |
| `pydantic` | Request/response models |
| `pydantic-settings` | `backend/.env` loading |
| `python-multipart` | Form/file support (reserved for future use) |

---

## 6. Node.js and npm (frontend)

| Requirement | Reason |
|-------------|--------|
| **Node.js 20+** (recommended **20 LTS** or **22 LTS**) | **Vite 8** and the current toolchain expect a modern runtime. |
| **npm** | Ships with Node; used for `npm install` / `npm run dev`. |

- **Website:** [https://nodejs.org](https://nodejs.org)  
- **Check:** `node -v` and `npm -v`

**Frontend npm dependencies** (see `frontend/package.json`):

**Runtime**

| Package | Role |
|---------|------|
| `react` | UI library |
| `react-dom` | DOM renderer |

**Development / build**

| Package | Role |
|---------|------|
| `vite` | Dev server, HMR, build |
| `@vitejs/plugin-react` | React + SWC/Babel integration |
| `typescript` | Type checking |
| `@types/node`, `@types/react`, `@types/react-dom` | TypeScript types |
| `eslint`, `typescript-eslint`, plugins | Linting |

**Optional fonts:** the UI loads **DM Sans** from Google Fonts (see `frontend/index.html`). Offline use still works with system fallbacks.

---

## 7. Shell / curl (for scripts)

- **`bash`** for `scripts/install-all.sh` and `scripts/dev.sh`.  
- **`curl`** for the official Ollama install script (when used).

---

## 8. Windows without WSL

Install manually:

1. **Python 3.11/3.12** from python.org — create `backend\.venv`, then `pip install -r backend\requirements.txt`.
2. **Node** from nodejs.org — in `frontend`, `npm install`.
3. **Ollama for Windows** from ollama.com — pull the model from PowerShell or cmd.
4. Run Uvicorn and Vite in **two terminals** (paths differ from Unix).

---

## 9. Automated install (macOS / Linux)

From the **repository root**:

```bash
chmod +x scripts/install-all.sh
./scripts/install-all.sh
```

Options (environment variables):

| Variable | Default | Meaning |
|----------|---------|---------|
| `INSTALL_MODEL` | `qwen2.5:14b` | Tag passed to `ollama pull`. |
| `SKIP_OLLAMA_INSTALL` | unset | If `1`, do not run the Ollama installer (only pull if Ollama exists). |
| `SKIP_MODEL_PULL` | unset | If `1`, skip `ollama pull` (you already have the model). |

Example:

```bash
SKIP_OLLAMA_INSTALL=1 INSTALL_MODEL=qwen2.5:8b ./scripts/install-all.sh
```

Then start the app:

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

Open **`http://127.0.0.1:5173`**.

---

## 10. Verify installation

```bash
# Ollama
curl -s http://127.0.0.1:11434/api/tags | head

# API (with venv activated, from backend/)
curl -s http://127.0.0.1:8000/api/health
```

---

## 11. Documentation index

| Doc | Content |
|-----|---------|
| **[USER_GUIDE.md](./USER_GUIDE.md)** | Walkthrough aligned with the WebUI. |
| **README.md** (repo root) | Quick overview, links, config table. |
