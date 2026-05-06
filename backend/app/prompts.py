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


def build_article_generation_messages(
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
    """Long-form blog content with SEO metadata, tags, and structured headings."""
    sample_block = ""
    if format_sample:
        sample_block += f"\n### Reference example for this article format (match structure class and depth, do not copy verbatim):\n{format_sample.strip()}\n"
    if tone_sample:
        sample_block += f"\n### Reference example for this tone (voice only; adapt to the brief and format):\n{tone_sample.strip()}\n"

    tmpl_block = _template_guardrail_block(active_templates or [])

    system = f"""You are a senior SEO content strategist and blog editor.
Write in {output_language} unless the brief explicitly requests another language for quotations only.
Produce one complete blog article suitable for publishing on a company or editorial blog.

Hard requirements (non-negotiable):
- Minimum length: **at least 1,800 words** of substantive body copy (excluding the SEO metadata block). If you risk running long, prioritize depth and clarity over repetition.
- **SEO metadata block** must appear first (see user structure), then the article body.
- **Tags**: provide **8–15 tags** as a single comma-separated line in the metadata block. Tags must reflect concrete topics, entities, sections, and themes actually covered in the article (not generic filler).
- Use a clear hierarchy: exactly **one H1** in the article body (markdown `#`), logical **H2** sections, and **H3** where useful. No skipped heading levels.
- Include a compelling introduction and a conclusion with a natural call-to-action where appropriate.
- Avoid keyword stuffing; use primary and secondary terms naturally. Prefer readable, trustworthy prose (EEAT-friendly).
- Do not include meta-commentary about the prompt, the model, or word counts inside the article narrative.
You must satisfy every mandatory rule in any ingested template (guardrails) section."""

    user = f"""### Brief / assignment
{brief.strip()}
{tmpl_block}
### Article format: {format_name}
{format_description.strip()}
{sample_block}
### Tone: {tone_name}
{tone_instructions.strip()}

### Required output structure (use Markdown)

1) Start with this block (fill all fields):

## SEO metadata
- **Title**: (≤70 characters recommended for SERP)
- **Meta description**: (150–160 characters; persuasive, accurate)
- **URL slug suggestion**: (lowercase, hyphens, no spaces)
- **Primary topic / focus keyword phrase**: (natural language)
- **Secondary keywords / phrases** (optional bullet list, 3–8 items)
- **Tags**: tag-one, tag-two, tag-three, … (8–15 tags, comma-separated, specific to this piece)

2) Then a horizontal rule line: ---

3) Then the **article body** (minimum 1,800 words):
- Start with `# ` followed by the article title (same as SEO Title unless the brief says otherwise).
- Use `##` for main sections and `###` for subsections where needed.
- Optional: short **FAQ** subsection near the end if it fits the format.
- Optional: **Suggested internal links** as a short bullet list at the very end (topics only, not URLs), unless guardrails forbid it.

Produce the full article only — no preamble."""

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
