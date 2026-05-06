from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Matches docker-compose.yml — works locally without editing .env once Postgres is up.
DEFAULT_DATABASE_URL = "postgresql+asyncpg://gigi:gigi@127.0.0.1:5432/gigi"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:14b"
    ollama_image_model: str = Field(
        default="x/z-image-turbo",
        description=(
            "Ollama /api/generate image model (see docs/IMAGE_GENERATION.md). "
            "Qwen-Image-2512 is not an official Ollama library tag — use HF/diffusers or pick an Ollama image model."
        ),
    )
    presets_path: str = "../data/presets.json"
    templates_path: str = "../data/templates.json"
    request_timeout_s: float = 600.0
    database_url: str | None = Field(
        default=DEFAULT_DATABASE_URL,
        description="Postgres for Phase 4 tenant API. Set DATABASE_URL to empty string to disable.",
    )
    openai_api_key: str | None = Field(default=None, description="Optional OpenAI API key for cloud text models.")
    anthropic_api_key: str | None = Field(default=None, description="Optional Anthropic API key for Claude text models.")
    google_api_key: str | None = Field(
        default=None,
        description="Optional Google AI Studio / Gemini API key (generativelanguage.googleapis.com).",
    )

    @field_validator("openai_api_key", "anthropic_api_key", "google_api_key", mode="before")
    @classmethod
    def strip_blank_api_keys(cls, v: object) -> object:
        if v is None or v == "":
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("database_url", mode="before")
    @classmethod
    def database_url_blank_disabled(cls, v: object) -> object:
        if v == "":
            return None
        return v


settings = Settings()
