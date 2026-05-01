# Image generation: Ollama vs Qwen-Image-2512

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
