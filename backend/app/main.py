from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import httpx

from .llm_providers import complete_text_chat, fetch_ollama_tags
from .ollama import generate_image_t2i
from .presets import load_presets, save_presets
from .prompts import (
    build_article_generation_messages,
    build_generation_messages,
    build_image_prompt_messages,
    build_translation_messages,
)
from .db.session import close_engine, init_engine
from .deps import CloudKeys, PrincipalId
from .settings import settings
from .services.workspace_token_usage import try_record_workspace_tokens
from . import templates_store
from .routers import news as news_router
from .routers import tenants as tenants_router
from .telemetry import init_opentelemetry


def _cors_allow_origins() -> list[str]:
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    return origins if origins else ["http://localhost:5173", "http://127.0.0.1:5173"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_opentelemetry(app)
    init_engine()
    yield
    try:
        from opentelemetry import trace

        tp = trace.get_tracer_provider()
        if tp is not None and hasattr(tp, "shutdown"):
            tp.shutdown()  # type: ignore[union-attr]
    except Exception:
        pass
    await close_engine()


app = FastAPI(title="GIGI-AI API", lifespan=lifespan)
app.include_router(tenants_router.router)
app.include_router(news_router.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    ok: bool
    ollama_model: str
    ollama_image_model: str
    ollama_base_url: str


TextProvider = Literal["ollama", "openai", "anthropic", "gemini"]


class LlmProviderInfo(BaseModel):
    id: str
    label: str
    configured: bool


class LlmPublicSettingsResponse(BaseModel):
    """Safe defaults + Ollama tag list for the Settings UI (no API keys exposed)."""

    ollama_base_url: str
    ollama_default_text: str
    ollama_default_image: str
    ollama_tags: list[str]
    ollama_tags_error: str | None = None
    providers: list[LlmProviderInfo]


@app.get("/api/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        ok=True,
        ollama_model=settings.ollama_model,
        ollama_image_model=settings.ollama_image_model,
        ollama_base_url=settings.ollama_base_url,
    )


@app.get("/api/llm/settings-public", response_model=LlmPublicSettingsResponse)
async def llm_settings_public():
    tags, err = await fetch_ollama_tags()
    providers = [
        LlmProviderInfo(id="ollama", label="Ollama (local)", configured=True),
        LlmProviderInfo(id="openai", label="OpenAI", configured=bool(settings.openai_api_key)),
        LlmProviderInfo(id="anthropic", label="Anthropic Claude", configured=bool(settings.anthropic_api_key)),
        LlmProviderInfo(id="gemini", label="Google Gemini", configured=bool(settings.google_api_key)),
    ]
    return LlmPublicSettingsResponse(
        ollama_base_url=settings.ollama_base_url,
        ollama_default_text=settings.ollama_model,
        ollama_default_image=settings.ollama_image_model,
        ollama_tags=tags,
        ollama_tags_error=err,
        providers=providers,
    )


@app.get("/api/presets")
async def get_presets():
    return load_presets()


class PresetsUpdate(BaseModel):
    formats: list | None = None
    tones: list | None = None
    article_formats: list | None = None
    article_tones: list | None = None


@app.put("/api/presets")
async def put_presets(body: PresetsUpdate):
    current = load_presets()
    if body.formats is not None:
        current["formats"] = body.formats
    if body.tones is not None:
        current["tones"] = body.tones
    if body.article_formats is not None:
        current["article_formats"] = body.article_formats
    if body.article_tones is not None:
        current["article_tones"] = body.article_tones
    save_presets(current)
    return current


StudioMode = Literal["social", "article"]

# Enough completion budget for ~1,800+ word articles across providers (truncation still possible on small local models).
ARTICLE_COMPLETION_BUDGET_TOKENS = 8192


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
    text_provider: TextProvider = Field(
        default="ollama",
        description="Text backend: ollama (local), openai, anthropic, gemini (requires API keys on server).",
    )
    text_model: str | None = Field(
        default=None,
        max_length=200,
        description="Override model id/tag for the selected text_provider (optional).",
    )
    customer_id: UUID | None = Field(
        default=None,
        description="Optional workspace customer to attribute token totals (requires X-Principal-Id membership).",
    )
    studio_mode: StudioMode = Field(
        default="social",
        description="social = short-form presets; article = blog/long-form presets with SEO-oriented prompting.",
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
async def generate(req: GenerateRequest, principal: PrincipalId, cloud_keys: CloudKeys):
    presets = load_presets()
    if req.studio_mode == "article":
        formats = {f["id"]: f for f in presets.get("article_formats", [])}
        tones = {t["id"]: t for t in presets.get("article_tones", [])}
    else:
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
                detail=(
                    f"Unknown format_id={item.format_id} or tone_id={item.tone_id} "
                    f"for studio_mode={req.studio_mode!r}"
                ),
            )
        tone_instructions = tone.get("instructions") or fmt.get("tone_instructions") or ""
        if req.studio_mode == "article":
            messages = build_article_generation_messages(
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
            num_predict = ARTICLE_COMPLETION_BUDGET_TOKENS
        else:
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
            num_predict = None
        chat = await complete_text_chat(
            provider=req.text_provider,
            model=req.text_model,
            messages=messages,
            temperature=req.temperature,
            num_predict=num_predict,
            key_overrides=cloud_keys,
        )
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
    text_provider: TextProvider = Field(default="ollama")
    text_model: str | None = Field(default=None, max_length=200)
    customer_id: UUID | None = Field(
        default=None,
        description="Optional workspace customer to attribute token usage (requires X-Principal-Id membership).",
    )


class TranslateResponse(BaseModel):
    translated: str
    usage: TokenUsage = Field(default_factory=TokenUsage)
    usage_notes: str = ""


@app.post("/api/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest, principal: PrincipalId, cloud_keys: CloudKeys):
    messages = build_translation_messages(text=req.text, source_language=req.source_language)
    chat = await complete_text_chat(
        provider=req.text_provider,
        model=req.text_model,
        messages=messages,
        temperature=req.temperature,
        num_predict=4096,
        key_overrides=cloud_keys,
    )
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
    text_provider: TextProvider = Field(default="ollama")
    text_model: str | None = Field(default=None, max_length=200)
    customer_id: UUID | None = Field(
        default=None,
        description="Optional workspace customer to attribute token usage (requires X-Principal-Id membership).",
    )


class StudioImagePromptResponse(BaseModel):
    image_prompt: str
    usage: TokenUsage = Field(default_factory=TokenUsage)
    usage_notes: str = ""


@app.post("/api/studio/image-prompt", response_model=StudioImagePromptResponse)
async def studio_image_prompt(body: StudioImagePromptRequest, principal: PrincipalId, cloud_keys: CloudKeys):
    messages = build_image_prompt_messages(
        social_text=body.social_text,
        format_name=body.format_name.strip() or "social",
        tone_name=body.tone_name.strip() or "default",
        output_language=body.output_language,
    )
    chat = await complete_text_chat(
        provider=body.text_provider,
        model=body.text_model,
        messages=messages,
        temperature=body.temperature,
        num_predict=2048,
        key_overrides=cloud_keys,
    )
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
    usage_notes: str = ""


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
    incomplete = u.prompt_eval_count is None or u.eval_count is None
    resp = StudioGenerateImageResponse(
        image_base64=out.image_base64,
        mime_type="image/png",
        usage=TokenUsage(prompt_eval_count=u.prompt_eval_count, eval_count=u.eval_count),
        usage_notes=(
            "Ollama did not return prompt_eval_count / eval_count for this image run (some image builds omit them)."
            if incomplete
            else ""
        ),
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
