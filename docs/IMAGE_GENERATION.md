# Image generation: Ollama vs Qwen-Image-2512

## Deployment checklist (smooth rollout)

1. **Install Ollama** on the inference host and keep it running (`ollama serve` or the menu app).  
2. **`ollama pull`** the **text** model (`OLLAMA_MODEL`, e.g. `qwen2.5:14b`) and the **image** model (`OLLAMA_IMAGE_MODEL`, default **`x/z-image-turbo`**).  
3. Copy **`backend/.env.example`** → **`backend/.env`** (or merge) so **`OLLAMA_IMAGE_MODEL`** matches the tag you pulled.  
4. Set **`REQUEST_TIMEOUT_S`** high enough for slow CPUs/GPUs on image runs (default `600`; increase if Studio times out).  
5. **Restart the FastAPI process** after any `.env` change.  
6. Confirm **`GET /api/health`** returns matching **`ollama_model`** and **`ollama_image_model`**.  
7. **Optional:** `curl` smoke test below; then Studio → **Generate image** on a variant.

For a full machine bootstrap (both pulls, venv, npm, `.env`), use **`./scripts/install-all.sh`** from the repo root — see [INSTALLATION.md](./INSTALLATION.md) for `INSTALL_IMAGE_MODEL` / `SKIP_IMAGE_MODEL_PULL`.

---

Studio calls Ollama’s **`POST /api/generate`** with the model name from **`OLLAMA_IMAGE_MODEL`**. That only works for models Ollama actually runs as **text-to-image** endpoints (response includes an `image` field).

## Qwen-Image-2512 is not a default Ollama model

**[Qwen-Image-2512](https://github.com/QwenLM/Qwen-Image)** (and related checkpoints) are distributed for **PyTorch / diffusers** (e.g. Hugging Face `Qwen/Qwen-Image-2512`). They are **not** published under a simple `ollama pull qwen-image:2512` flow like chat models.

What you might see on Ollama search (e.g. LoRAs or unrelated repos) is **not** the same as a first-class, one-command image pipeline from the Qwen team inside Ollama’s curated image stack.

### If you specifically need Qwen-Image-2512

1. Follow the **[official Qwen-Image README](https://github.com/QwenLM/Qwen-Image)** (Python, GPU, diffusers).
2. Either:
   - **Keep Studio on Ollama** for captions and use Qwen only in a **separate script or service** you run locally, then attach images manually, or  
   - **Extend GIGI-AI** later with an optional HTTP backend that wraps the diffusers pipeline (out of scope for the stock Ollama-only path).

## What works today with Ollama (recommended)

Ollama’s **image generation** support is documented here: **[Image generation (experimental)](https://ollama.com/blog/image-generation)**.

Examples that match Studio’s API shape:

```bash
ollama pull x/z-image-turbo
# or
ollama pull x/flux2-klein
```

Set in **`backend/.env`**:

```env
OLLAMA_IMAGE_MODEL=x/z-image-turbo
```

Restart the API, then use **Generate image** in Studio.

**Platform notes (from Ollama’s blog):** image generation started as **macOS-first**; check the blog and your Ollama version for **Windows/Linux** support before assuming it works on your OS.

## Quick verification

```bash
curl -s http://127.0.0.1:11434/api/generate -d '{
  "model": "x/z-image-turbo",
  "prompt": "A red apple on a wooden table, soft light",
  "stream": false
}' | head -c 400
```

You should see JSON containing a long **`"image":"..."`** base64 field. If you get an error or no `image` key, the model tag or Ollama build does not support image generation on your machine.

## Related env vars

| Variable | Role |
|----------|------|
| `OLLAMA_BASE_URL` | Where Ollama listens (default `http://127.0.0.1:11434`) |
| `OLLAMA_IMAGE_MODEL` | Tag passed to `/api/generate` for Studio images |
| `REQUEST_TIMEOUT_S` | Image runs can be slow; increase if needed |
