from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:8b"
    presets_path: str = "../data/presets.json"
    templates_path: str = "../data/templates.json"
    request_timeout_s: float = 600.0


settings = Settings()
