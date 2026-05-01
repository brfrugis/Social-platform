from dataclasses import dataclass
from typing import Any

import httpx

from .settings import settings

IMAGE_GEN_TIMEOUT_S = 1200.0


@dataclass(frozen=True)
class OllamaUsage:
    """Token-ish counts from Ollama's final /api/chat object. See https://github.com/ollama/ollama/blob/main/docs/api.md"""

    prompt_eval_count: int | None
    eval_count: int | None
    total_duration_ns: int | None = None
    load_duration_ns: int | None = None
    prompt_eval_duration_ns: int | None = None
    eval_duration_ns: int | None = None


@dataclass(frozen=True)
class ChatResult:
    content: str
    usage: OllamaUsage


def _parse_usage(data: dict[str, Any]) -> OllamaUsage:
    return OllamaUsage(
        prompt_eval_count=data.get("prompt_eval_count"),
        eval_count=data.get("eval_count"),
        total_duration_ns=data.get("total_duration"),
        load_duration_ns=data.get("load_duration"),
        prompt_eval_duration_ns=data.get("prompt_eval_duration"),
        eval_duration_ns=data.get("eval_duration"),
    )


def _parse_usage_merged(data: dict[str, Any]) -> OllamaUsage:
    """Merge top-level and nested `usage` objects (Ollama /api/chat and /api/generate may differ by version)."""
    merged: dict[str, Any] = dict(data)
    nested = data.get("usage")
    if isinstance(nested, dict):
        for key, val in nested.items():
            if val is not None and merged.get(key) is None:
                merged[key] = val
    return _parse_usage(merged)


async def chat_completion(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    num_predict: int | None = None,
) -> ChatResult:
    payload: dict = {
        "model": settings.ollama_model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature},
    }
    if num_predict is not None:
        payload["options"]["num_predict"] = num_predict

    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        r = await client.post(
            f"{settings.ollama_base_url.rstrip('/')}/api/chat",
            json=payload,
        )
        r.raise_for_status()
        data = r.json()
        msg = data.get("message") or {}
        content = msg.get("content")
        if not content:
            raise RuntimeError(f"Unexpected Ollama response: {data!r}")
        return ChatResult(content=content.strip(), usage=_parse_usage_merged(data))


@dataclass(frozen=True)
class ImageGenResult:
    """Base64 PNG (or model-native) from Ollama /api/generate for image models."""

    image_base64: str
    usage: OllamaUsage


async def generate_image_t2i(
    prompt: str,
    *,
    model: str | None = None,
) -> ImageGenResult:
    """Call Ollama image generation. Requires a T2I-capable model (see Ollama image generation docs)."""
    tag = (model or settings.ollama_image_model).strip()
    if not tag:
        raise RuntimeError("ollama_image_model is empty")
    payload: dict = {
        "model": tag,
        "prompt": prompt.strip(),
        "stream": False,
    }
    timeout = max(float(settings.request_timeout_s), IMAGE_GEN_TIMEOUT_S)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            f"{settings.ollama_base_url.rstrip('/')}/api/generate",
            json=payload,
        )
        r.raise_for_status()
        data = r.json()
    b64 = data.get("image")
    if not b64 and isinstance(data.get("images"), list) and data["images"]:
        b64 = data["images"][0]
    if not isinstance(b64, str) or not b64.strip():
        raise RuntimeError(
            "Ollama returned no image field. Is this an image-generation model? "
            f"model={tag!r} response_keys={sorted(data.keys())!r}"
        )
    return ImageGenResult(image_base64=b64.strip(), usage=_parse_usage_merged(data))
