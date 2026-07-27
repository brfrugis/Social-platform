from typing import Optional, Dict, Any
from pydantic import BaseModel, field_validator
from enum import Enum


class ProviderName(str, Enum):
    OLLAMA = "ollama"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    BEDROCK = "bedrock"
    OPENROUTER = "openrouter"


class LLMConfig(BaseModel):
    provider: ProviderName
    model: str
    extra_config: Optional[Dict[str, Any]] = None


class LLMConfigInDB(LLMConfig):
    id: int
    customer_id: int
    capability: str


class TenantLLMConfigUpdate(BaseModel):
    llm_configs: Dict[str, LLMConfig]


class TenantLLMConfigResponse(BaseModel):
    llm_configs: Dict[str, LLMConfig]


class CapabilityName(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
