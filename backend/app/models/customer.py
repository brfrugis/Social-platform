import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.customer_member import CustomerMember
    from app.models.social_connection import SocialConnection
    from app.models.workspace_token_usage import WorkspaceTokenEvent


class Customer(Base):
    """Tenant: Customer A in the roadmap; scopes Studio and connections."""

    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    members: Mapped[list["CustomerMember"]] = relationship(
        "CustomerMember", back_populates="customer", cascade="all, delete-orphan"
    )
    connections: Mapped[list["SocialConnection"]] = relationship(
        "SocialConnection", back_populates="customer", cascade="all, delete-orphan"
    )
    token_events: Mapped[list["WorkspaceTokenEvent"]] = relationship(
        "WorkspaceTokenEvent", back_populates="customer", cascade="all, delete-orphan"
    )
