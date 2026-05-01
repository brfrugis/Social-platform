def _template_guardrail_block(templates: list[dict]) -> str:
    if not templates:
        return ""
    parts: list[str] = []
    for t in templates:
        name = (t.get("name") or t.get("id") or "template").strip()
        desc = (t.get("description") or "").strip()
        guard = (t.get("guardrails") or "").strip()
        skel = (t.get("skeleton") or "").strip()
        samp = (t.get("sample") or "").strip()
        chunk = [f"#### {name}"]
        if desc:
            chunk.append(f"Purpose: {desc}")
        if guard:
            chunk.append("Rules (mandatory):\n" + guard)
        if skel:
            chunk.append("Output structure / placeholders (follow closely):\n" + skel)
        if samp:
            chunk.append("Reference sample (do not copy verbatim; match constraints only):\n" + samp)
        parts.append("\n".join(chunk))
    return (
        "\n### Ingested templates (guardrails — satisfy all; if anything conflicts with format or tone, "
        "these rules win for compliance, safety, and brand constraints)\n\n" + "\n\n".join(parts) + "\n"
    )


def build_generation_messages(
    *,
    brief: str,
    format_name: str,
    format_description: str,
    format_sample: str | None,
    tone_name: str,
    tone_instructions: str,
    tone_sample: str | None,
    output_language: str,
    active_templates: list[dict] | None = None,
) -> list[dict[str, str]]:
    sample_block = ""
    if format_sample:
        sample_block += f"\n### Reference example for this format (match structure and length class, do not copy verbatim):\n{format_sample.strip()}\n"
    if tone_sample:
        sample_block += f"\n### Reference example for this tone (voice only; adapt to the brief and format):\n{tone_sample.strip()}\n"

    tmpl_block = _template_guardrail_block(active_templates or [])

    system = f"""You are a senior social media strategist and copywriter.
Write content strictly in {output_language}.
Follow the format constraints and the tone/voice instructions.
You must satisfy every mandatory rule in any ingested template (guardrails) section.
Do not include meta-commentary, preambles, or markdown fences unless the format explicitly requires markdown."""

    user = f"""### Brief / topic
{brief.strip()}
{tmpl_block}
### Format: {format_name}
{format_description.strip()}
{sample_block}
### Tone: {tone_name}
{tone_instructions.strip()}

Produce the final piece(s) only."""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_image_prompt_messages(
    *,
    social_text: str,
    format_name: str,
    tone_name: str,
    output_language: str,
) -> list[dict[str, str]]:
    """Ask the text LLM for a single diffusion-style image prompt for the social post."""
    system = """You write concise text-to-image prompts for diffusion models (e.g. Qwen-Image, FLUX, Z-Image).
Output exactly one flowing paragraph in English (even if the social post is in another language).
Describe subject, setting, lighting, camera or illustration style, mood, and colors.
If the post implies on-image text or a logo, mention it clearly.
No title, no bullet list, no quotation marks around the whole prompt, no markdown fences — only the prompt text."""

    user = f"""### Social post ({format_name} · {tone_name}; copy is written for {output_language.strip()})
{social_text.strip()}

### Task
Write one image-generation prompt for a hero or feed image that fits this post. Keep it under 120 words."""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_translation_messages(
    *,
    text: str,
    source_language: str,
) -> list[dict[str, str]]:
    lang = source_language.strip().lower()
    system = """You are a professional translator specializing in Brazilian Portuguese (pt-BR).
Preserve meaning, nuance, idioms adapted naturally to Brazilian usage, and line breaks where sensible.
Output only the translated text, no notes."""

    user = f"""Translate the following text from {lang} into natural Brazilian Portuguese (pt-BR).

---
{text.strip()}
---"""

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]
