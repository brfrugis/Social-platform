from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import Column, String, Enum, JSON, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from .enums import LLMCapability, LLMProvider
from .database import Base


class LLMProviderConfig(Base):
    """Per-customer LLM provider and model configuration per capability."""

    __tablename__ = "llm_provider_configs"

    id = Column(String, primary_key=True, index=True)
    customer_id = Column(String, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    capability = Column(Enum(LLMCapability), nullable=False)
    provider = Column(Enum(LLMProvider), nullable=False)
    model_id = Column(String, nullable=False)
    extra_config = Column(JSON, nullable=True, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship("Customer", back_populates="llm_provider_configs")
