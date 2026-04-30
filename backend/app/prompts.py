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
) -> list[dict[str, str]]:
    sample_block = ""
    if format_sample:
        sample_block += f"\n### Reference example for this format (match structure and length class, do not copy verbatim):\n{format_sample.strip()}\n"
    if tone_sample:
        sample_block += f"\n### Reference example for this tone (voice only; adapt to the brief and format):\n{tone_sample.strip()}\n"

    system = f"""You are a senior social media strategist and copywriter.
Write content strictly in {output_language}.
Follow the format constraints and the tone/voice instructions.
Do not include meta-commentary, preambles, or markdown fences unless the format explicitly requires markdown."""

    user = f"""### Brief / topic
{brief.strip()}

### Format: {format_name}
{format_description.strip()}
{sample_block}
### Tone: {tone_name}
{tone_instructions.strip()}

Produce the final piece(s) only."""

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
