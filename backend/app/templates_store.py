import json
import re
import uuid
from pathlib import Path

from .settings import settings


def _resolve_path() -> Path:
    p = Path(settings.templates_path)
    if not p.is_absolute():
        p = Path(__file__).resolve().parent.parent / p
    return p


def load_templates_doc() -> dict:
    path = _resolve_path()
    if not path.exists():
        return {"templates": []}
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_templates_doc(data: dict) -> None:
    path = _resolve_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def slug_from_name(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "template"


def ensure_unique_id(doc: dict, base: str) -> str:
    ids = {t.get("id") for t in doc.get("templates", [])}
    if base not in ids:
        return base
    for i in range(2, 10_000):
        cand = f"{base}-{i}"
        if cand not in ids:
            return cand
    return f"{base}-{uuid.uuid4().hex[:8]}"


def list_templates() -> list[dict]:
    return list(load_templates_doc().get("templates", []))


def get_template(template_id: str) -> dict | None:
    for t in list_templates():
        if t.get("id") == template_id:
            return t
    return None


def upsert_template(template: dict, *, template_id: str | None = None) -> dict:
    doc = load_templates_doc()
    items = doc.setdefault("templates", [])
    if template_id:
        for i, t in enumerate(items):
            if t.get("id") == template_id:
                merged = {**t, **template, "id": template_id}
                items[i] = merged
                save_templates_doc(doc)
                return merged
        raise KeyError(template_id)
    base = slug_from_name(template.get("name", "template"))
    new_id = ensure_unique_id(doc, base)
    new = {**template, "id": new_id}
    items.append(new)
    save_templates_doc(doc)
    return new


def delete_template(template_id: str) -> bool:
    doc = load_templates_doc()
    items = doc.get("templates", [])
    n = len(items)
    doc["templates"] = [t for t in items if t.get("id") != template_id]
    if len(doc["templates"]) == n:
        return False
    save_templates_doc(doc)
    return True
