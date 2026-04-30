import httpx

from .settings import settings


async def chat_completion(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    num_predict: int | None = None,
) -> str:
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
        return content.strip()
