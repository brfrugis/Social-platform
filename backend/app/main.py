from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import httpx

from .ollama import chat_completion, generate_image_t2i
from .presets import load_presets, save_presets
from .prompts import (
    build_generation_messages,
    build_image_prompt_messages,
    build_translation_messages,
)
from .db.session import close_engine, init_engine
from .deps import PrincipalId
from .settings import settings
from .services.workspace_token_usage import try_record_workspace_tokens
from . import templates_store
from .routers import tenants as tenants_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_engine()
    yield
    await close_engine()


app = FastAPI(title="GIGI-AI API", lifespan=lifespan)
app.include_router(tenants_router.router)

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
    ollama_image_model: str
    ollama_base_url: str


@app.get("/api/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        ok=True,
        ollama_model=settings.ollama_model,
        ollama_image_model=settings.ollama_image_model,
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
    template_ids: list[str] = Field(
        default_factory=list,
        description="Ingested template IDs whose guardrails are enforced for every generation item",
    )
    output_language: str = Field(default="English", description="Language label for generated copy")
    temperature: float = Field(default=0.7, ge=0, le=2)
    customer_id: UUID | None = Field(
        default=None,
        description="Optional workspace customer to attribute token totals (requires X-Principal-Id membership).",
    )


class TokenUsage(BaseModel):
    """Ollama-reported counts per request (see Ollama /api/chat docs). May be null if omitted (e.g. prompt cache)."""

    prompt_eval_count: int | None = None
    eval_count: int | None = None


class GenerateResultItem(BaseModel):
    format_id: str
    tone_id: str
    format_name: str
    tone_name: str
    content: str
    template_ids: list[str] = Field(default_factory=list)
    template_names: list[str] = Field(default_factory=list)
    usage: TokenUsage = Field(default_factory=TokenUsage)


class GenerateResponse(BaseModel):
    results: list[GenerateResultItem]
    session_totals: TokenUsage = Field(default_factory=TokenUsage)
    usage_notes: str = Field(
        default="",
        description="Set when some counts were missing from Ollama (e.g. cached prompt)",
    )


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest, principal: PrincipalId):
    presets = load_presets()
    formats = {f["id"]: f for f in presets.get("formats", [])}
    tones = {t["id"]: t for t in presets.get("tones", [])}

    active_templates: list[dict] = []
    for tid in req.template_ids:
        row = templates_store.get_template(tid)
        if not row:
            raise HTTPException(status_code=400, detail=f"Unknown template_id={tid}")
        active_templates.append(row)

    results: list[GenerateResultItem] = []
    tmpl_ids = [t.get("id", "") for t in active_templates]
    tmpl_names = [str(t.get("name") or t.get("id") or "") for t in active_templates]
    usage_incomplete = False
    sum_prompt = 0
    sum_completion = 0
    any_prompt_count = False
    any_completion_count = False

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
            active_templates=active_templates,
        )
        chat = await chat_completion(messages, temperature=req.temperature)
        u = chat.usage
        pu, eu = u.prompt_eval_count, u.eval_count
        if pu is None or eu is None:
            usage_incomplete = True
        if pu is not None:
            sum_prompt += pu
            any_prompt_count = True
        if eu is not None:
            sum_completion += eu
            any_completion_count = True
        results.append(
            GenerateResultItem(
                format_id=item.format_id,
                tone_id=item.tone_id,
                format_name=fmt.get("name", item.format_id),
                tone_name=tone.get("name", item.tone_id),
                content=chat.content,
                template_ids=list(tmpl_ids),
                template_names=list(tmpl_names),
                usage=TokenUsage(prompt_eval_count=pu, eval_count=eu),
            )
        )
    resp = GenerateResponse(
        results=results,
        session_totals=TokenUsage(
            prompt_eval_count=sum_prompt if any_prompt_count else None,
            eval_count=sum_completion if any_completion_count else None,
        ),
        usage_notes=(
            "Some prompt or completion counts were omitted by Ollama (common with prompt caching). "
            "Totals sum only fields Ollama returned."
            if usage_incomplete
            else ""
        ),
    )
    await try_record_workspace_tokens(
        principal_id=principal,
        customer_id=req.customer_id,
        operation="studio_generate",
        prompt_tokens=resp.session_totals.prompt_eval_count,
        completion_tokens=resp.session_totals.eval_count,
    )
    return resp


class TemplatePayload(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""
    guardrails: str = ""
    skeleton: str = ""
    sample: str = ""


@app.get("/api/templates")
async def get_templates():
    return {"templates": templates_store.list_templates()}


@app.post("/api/templates")
async def create_template(body: TemplatePayload):
    row = body.model_dump()
    created = templates_store.upsert_template(row, template_id=None)
    return created


@app.put("/api/templates/{template_id}")
async def update_template(template_id: str, body: TemplatePayload):
    try:
        return templates_store.upsert_template(body.model_dump(), template_id=template_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Template not found") from None


@app.delete("/api/templates/{template_id}")
async def remove_template(template_id: str):
    if not templates_store.delete_template(template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    return {"ok": True}


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    source_language: str = Field(..., description='e.g. "Spanish" or "English"')
    temperature: float = Field(default=0.3, ge=0, le=2)
    customer_id: UUID | None = Field(
        default=None,
        description="Optional workspace customer to attribute token usage (requires X-Principal-Id membership).",
    )


class TranslateResponse(BaseModel):
    translated: str
    usage: TokenUsage = Field(default_factory=TokenUsage)
    usage_notes: str = ""


@app.post("/api/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest, principal: PrincipalId):
    messages = build_translation_messages(text=req.text, source_language=req.source_language)
    chat = await chat_completion(messages, temperature=req.temperature, num_predict=4096)
    u = chat.usage
    incomplete = u.prompt_eval_count is None or u.eval_count is None
    resp = TranslateResponse(
        translated=chat.content,
        usage=TokenUsage(prompt_eval_count=u.prompt_eval_count, eval_count=u.eval_count),
        usage_notes=(
            "Ollama omitted a count (e.g. prompt cache). See Ollama API docs for prompt_eval_count / eval_count."
            if incomplete
            else ""
        ),
    )
    await try_record_workspace_tokens(
        principal_id=principal,
        customer_id=req.customer_id,
        operation="translate",
        prompt_tokens=u.prompt_eval_count,
        completion_tokens=u.eval_count,
    )
    return resp


class StudioImagePromptRequest(BaseModel):
    social_text: str = Field(..., min_length=1)
    format_name: str = Field(default="", max_length=200)
    tone_name: str = Field(default="", max_length=200)
    output_language: str = Field(default="English", max_length=80)
    temperature: float = Field(default=0.6, ge=0, le=2)
    customer_id: UUID | None = Field(
        default=None,
        description="Optional workspace customer to attribute token usage (requires X-Principal-Id membership).",
    )


class StudioImagePromptResponse(BaseModel):
    image_prompt: str
    usage: TokenUsage = Field(default_factory=TokenUsage)
    usage_notes: str = ""


@app.post("/api/studio/image-prompt", response_model=StudioImagePromptResponse)
async def studio_image_prompt(body: StudioImagePromptRequest, principal: PrincipalId):
    messages = build_image_prompt_messages(
        social_text=body.social_text,
        format_name=body.format_name.strip() or "social",
        tone_name=body.tone_name.strip() or "default",
        output_language=body.output_language,
    )
    chat = await chat_completion(messages, temperature=body.temperature, num_predict=2048)
    u = chat.usage
    incomplete = u.prompt_eval_count is None or u.eval_count is None
    resp = StudioImagePromptResponse(
        image_prompt=chat.content.strip(),
        usage=TokenUsage(prompt_eval_count=u.prompt_eval_count, eval_count=u.eval_count),
        usage_notes=(
            "Ollama omitted a count (e.g. prompt cache)."
            if incomplete
            else ""
        ),
    )
    await try_record_workspace_tokens(
        principal_id=principal,
        customer_id=body.customer_id,
        operation="studio_image_prompt",
        prompt_tokens=u.prompt_eval_count,
        completion_tokens=u.eval_count,
    )
    return resp


class StudioGenerateImageRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=8000)
    model: str | None = Field(default=None, max_length=200)
    customer_id: UUID | None = Field(
        default=None,
        description="Optional workspace customer to attribute token usage (requires X-Principal-Id membership).",
    )


class StudioGenerateImageResponse(BaseModel):
    image_base64: str
    mime_type: str = "image/png"
    usage: TokenUsage = Field(default_factory=TokenUsage)


@app.post("/api/studio/generate-image", response_model=StudioGenerateImageResponse)
async def studio_generate_image(body: StudioGenerateImageRequest, principal: PrincipalId):
    try:
        out = await generate_image_t2i(body.prompt, model=body.model)
    except httpx.HTTPStatusError as e:
        detail = (e.response.text or str(e))[:800]
        raise HTTPException(status_code=502, detail=f"Ollama image request failed: {detail}") from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach Ollama: {e}") from e
    u = out.usage
    resp = StudioGenerateImageResponse(
        image_base64=out.image_base64,
        mime_type="image/png",
        usage=TokenUsage(prompt_eval_count=u.prompt_eval_count, eval_count=u.eval_count),
    )
    await try_record_workspace_tokens(
        principal_id=principal,
        customer_id=body.customer_id,
        operation="studio_image_generate",
        prompt_tokens=u.prompt_eval_count,
        completion_tokens=u.eval_count,
    )
    return resp


# Serve production build only when index.html exists (empty dist/ would otherwise 404 on /)
_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
_dist_index = _dist / "index.html"
if _dist_index.is_file():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
else:

    @app.get("/", include_in_schema=False)
    async def root_redirect():
        return RedirectResponse(url="/docs")
