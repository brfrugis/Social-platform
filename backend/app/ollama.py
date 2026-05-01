from dataclasses import dataclass
from typing import Any

import httpx

from .settings import settings


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
        return ChatResult(content=content.strip(), usage=_parse_usage(data))
