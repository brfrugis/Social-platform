from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .ollama import chat_completion
from .presets import load_presets, save_presets
from .prompts import build_generation_messages, build_translation_messages
from .settings import settings

app = FastAPI(title="Qwen Social Studio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    ok: bool
    ollama_model: str
    ollama_base_url: str


@app.get("/api/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        ok=True,
        ollama_model=settings.ollama_model,
        ollama_base_url=settings.ollama_base_url,
    )


@app.get("/api/presets")
async def get_presets():
    return load_presets()


class PresetsUpdate(BaseModel):
    formats: list | None = None
    tones: list | None = None


@app.put("/api/presets")
async def put_presets(body: PresetsUpdate):
    current = load_presets()
    if body.formats is not None:
        current["formats"] = body.formats
    if body.tones is not None:
        current["tones"] = body.tones
    save_presets(current)
    return current


class GenerateItem(BaseModel):
    format_id: str
    tone_id: str


class GenerateRequest(BaseModel):
    brief: str = Field(..., min_length=1)
    items: list[GenerateItem] = Field(..., min_length=1)
    output_language: str = Field(default="English", description="Language label for generated copy")
    temperature: float = Field(default=0.7, ge=0, le=2)


class GenerateResultItem(BaseModel):
    format_id: str
    tone_id: str
    format_name: str
    tone_name: str
    content: str


class GenerateResponse(BaseModel):
    results: list[GenerateResultItem]


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    presets = load_presets()
    formats = {f["id"]: f for f in presets.get("formats", [])}
    tones = {t["id"]: t for t in presets.get("tones", [])}

    results: list[GenerateResultItem] = []
    for item in req.items:
        fmt = formats.get(item.format_id)
        tone = tones.get(item.tone_id)
        if not fmt or not tone:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown format_id={item.format_id} or tone_id={item.tone_id}",
            )
        tone_instructions = tone.get("instructions") or fmt.get("tone_instructions") or ""
        messages = build_generation_messages(
            brief=req.brief,
            format_name=fmt.get("name", item.format_id),
            format_description=fmt.get("description", ""),
            format_sample=fmt.get("sample"),
            tone_name=tone.get("name", item.tone_id),
            tone_instructions=tone_instructions,
            tone_sample=tone.get("sample"),
            output_language=req.output_language,
        )
        content = await chat_completion(messages, temperature=req.temperature)
        results.append(
            GenerateResultItem(
                format_id=item.format_id,
                tone_id=item.tone_id,
                format_name=fmt.get("name", item.format_id),
                tone_name=tone.get("name", item.tone_id),
                content=content,
            )
        )
    return GenerateResponse(results=results)


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    source_language: str = Field(..., description='e.g. "Spanish" or "English"')
    temperature: float = Field(default=0.3, ge=0, le=2)


class TranslateResponse(BaseModel):
    translated: str


@app.post("/api/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest):
    messages = build_translation_messages(text=req.text, source_language=req.source_language)
    translated = await chat_completion(messages, temperature=req.temperature, num_predict=4096)
    return TranslateResponse(translated=translated)


# Optional: serve built frontend from ../frontend/dist in production
_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
else:

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def root_landing() -> str:
        return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Qwen Social Studio API</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    code { background: #f4f4f5; padding: 0.15em 0.35em; border-radius: 4px; }
    a { color: #6d28d9; }
  </style>
</head>
<body>
  <h1>Qwen Social Studio API</h1>
  <p>This server exposes JSON under <code>/api/…</code>. There is no page at the root unless you build the frontend into <code>frontend/dist</code>.</p>
  <ul>
    <li><a href="/docs">OpenAPI docs (Swagger)</a></li>
    <li><a href="/api/health">GET /api/health</a></li>
  </ul>
  <p><strong>Portal UI:</strong> run <code>npm run dev</code> in the <code>frontend</code> folder and open <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a> (the dev server proxies <code>/api</code> here).</p>
</body>
</html>"""
