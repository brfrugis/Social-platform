import json
from pathlib import Path

from .settings import settings


def _resolve_presets_path() -> Path:
    p = Path(settings.presets_path)
    if not p.is_absolute():
        p = Path(__file__).resolve().parent.parent / p
    return p


def load_presets() -> dict:
    path = _resolve_presets_path()
    if not path.exists():
        return {"formats": [], "tones": []}
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_presets(data: dict) -> None:
    path = _resolve_presets_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
