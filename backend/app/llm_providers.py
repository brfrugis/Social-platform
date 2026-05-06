"""Route text chat to Ollama, OpenAI, Anthropic, or Gemini based on request + server API keys."""

from __future__ import annotations

import json
import httpx
from fastapi import HTTPException

from .ollama import ChatResult, OllamaUsage, chat_completion
from .settings import settings

DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-20241022"
DEFAULT_GEMINI_MODEL = "gemini-1.5-flash"


def _split_system(messages: list[dict[str, str]]) -> tuple[str | None, list[dict[str, str]]]:
    systems: list[str] = []
    rest: list[dict[str, str]] = []
    for m in messages:
        role = (m.get("role") or "user").strip()
        content = (m.get("content") or "").strip()
        if role == "system":
            if content:
                systems.append(content)
        else:
            rest.append({"role": role, "content": content})
    sys = "\n\n".join(systems) if systems else None
    return sys, rest


def _usage_from_counts(prompt: int | None, completion: int | None) -> OllamaUsage:
    return OllamaUsage(prompt_eval_count=prompt, eval_count=completion)


async def _openai_chat(
    *,
    model: str,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int | None,
) -> ChatResult:
    key = settings.openai_api_key
    if not key or not key.strip():
        raise HTTPException(status_code=400, detail="OpenAI is not configured (set OPENAI_API_KEY in backend/.env).")
    body: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens is not None:
        body["max_tokens"] = max_tokens
    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        r = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key.strip()}", "Content-Type": "application/json"},
            json=body,
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=_short_http_error("OpenAI", r))
        data = r.json()
    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    content = (msg.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=502, detail="OpenAI returned empty content.")
    usage = data.get("usage") or {}
    pu = usage.get("prompt_tokens")
    cu = usage.get("completion_tokens")
    return ChatResult(
        content=content,
        usage=_usage_from_counts(int(pu) if pu is not None else None, int(cu) if cu is not None else None),
    )


async def _anthropic_chat(
    *,
    model: str,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int | None,
) -> ChatResult:
    key = settings.anthropic_api_key
    if not key or not key.strip():
        raise HTTPException(
            status_code=400,
            detail="Anthropic is not configured (set ANTHROPIC_API_KEY in backend/.env).",
        )
    system, rest = _split_system(messages)
    if not rest:
        raise HTTPException(status_code=400, detail="Anthropic requires at least one non-system message.")
    max_out = max_tokens if max_tokens is not None else 4096
    body: dict = {
        "model": model,
        "max_tokens": min(max_out, 8192),
        "temperature": temperature,
        "messages": [{"role": m["role"], "content": m["content"]} for m in rest if m.get("content")],
    }
    if system:
        body["system"] = system
    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key.strip(),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=body,
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=_short_http_error("Anthropic", r))
        data = r.json()
    parts = (data.get("content") or [])
    texts: list[str] = []
    for p in parts:
        if isinstance(p, dict) and p.get("type") == "text" and p.get("text"):
            texts.append(str(p["text"]))
    content = "\n".join(texts).strip()
    if not content:
        raise HTTPException(status_code=502, detail="Anthropic returned empty content.")
    usage = data.get("usage") or {}
    inp = usage.get("input_tokens")
    out = usage.get("output_tokens")
    return ChatResult(
        content=content,
        usage=_usage_from_counts(int(inp) if inp is not None else None, int(out) if out is not None else None),
    )


async def _gemini_chat(
    *,
    model: str,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int | None,
) -> ChatResult:
    key = settings.google_api_key
    if not key or not key.strip():
        raise HTTPException(
            status_code=400,
            detail="Gemini is not configured (set GOOGLE_API_KEY in backend/.env).",
        )
    system, rest = _split_system(messages)
    user_parts: list[str] = []
    if system:
        user_parts.append("### Instructions (system)\n" + system)
    for m in rest:
        role = m.get("role", "user")
        user_parts.append(f"### {role}\n{m.get('content', '')}")
    combined = "\n\n".join(user_parts).strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    gen_cfg: dict = {"temperature": temperature}
    if max_tokens is not None:
        gen_cfg["maxOutputTokens"] = max_tokens
    body: dict = {
        "contents": [{"role": "user", "parts": [{"text": combined}]}],
        "generationConfig": gen_cfg,
    }
    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        r = await client.post(url, params={"key": key.strip()}, json=body)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=_short_http_error("Gemini", r))
        data = r.json()
    cands = data.get("candidates") or []
    if not cands:
        raise HTTPException(status_code=502, detail=f"Gemini returned no candidates: {json.dumps(data)[:400]}")
    parts_out = ((cands[0].get("content") or {}).get("parts")) or []
    texts: list[str] = []
    for p in parts_out:
        if isinstance(p, dict) and p.get("text"):
            texts.append(str(p["text"]))
    content = "\n".join(texts).strip()
    if not content:
        raise HTTPException(status_code=502, detail="Gemini returned empty text.")
    um = data.get("usageMetadata") or {}
    pt = um.get("promptTokenCount")
    ct = um.get("candidatesTokenCount")
    return ChatResult(
        content=content,
        usage=_usage_from_counts(int(pt) if pt is not None else None, int(ct) if ct is not None else None),
    )


def _short_http_error(label: str, r: httpx.Response) -> str:
    t = (r.text or "")[:500]
    return f"{label} HTTP {r.status_code}: {t or r.reason_phrase}"


def resolve_text_model(provider: str, model: str | None) -> str:
    m = (model or "").strip()
    if m:
        return m
    if provider == "openai":
        return DEFAULT_OPENAI_MODEL
    if provider == "anthropic":
        return DEFAULT_ANTHROPIC_MODEL
    if provider == "gemini":
        return DEFAULT_GEMINI_MODEL
    return settings.ollama_model


async def complete_text_chat(
    *,
    provider: str,
    model: str | None,
    messages: list[dict[str, str]],
    temperature: float,
    num_predict: int | None = None,
) -> ChatResult:
    """Dispatch to the configured text provider."""
    pid = (provider or "ollama").strip().lower()
    if pid not in ("ollama", "openai", "anthropic", "gemini"):
        raise HTTPException(status_code=400, detail=f"Unknown text_provider={provider!r}")
    if pid == "ollama":
        return await chat_completion(
            messages,
            temperature=temperature,
            num_predict=num_predict,
            model=model,
        )
    resolved = resolve_text_model(pid, model)
    if pid == "openai":
        return await _openai_chat(
            model=resolved,
            messages=messages,
            temperature=temperature,
            max_tokens=num_predict,
        )
    if pid == "anthropic":
        return await _anthropic_chat(
            model=resolved,
            messages=messages,
            temperature=temperature,
            max_tokens=num_predict,
        )
    return await _gemini_chat(
        model=resolved,
        messages=messages,
        temperature=temperature,
        max_tokens=num_predict,
    )


async def fetch_ollama_tags() -> tuple[list[str], str | None]:
    """Return (model_names, error_message)."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{settings.ollama_base_url.rstrip('/')}/api/tags")
            r.raise_for_status()
            data = r.json()
        names: list[str] = []
        for m in data.get("models") or []:
            n = m.get("name")
            if isinstance(n, str) and n.strip():
                names.append(n.strip())
        return names, None
    except Exception as e:
        return [], str(e)[:300]
