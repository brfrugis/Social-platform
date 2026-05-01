"""Phase 4: customers, members, social_connections.

Revision ID: 20250501_0001
Revises:
Create Date: 2026-05-01

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20250501_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "customer_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("principal_id", sa.String(length=128), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id", "principal_id", name="uq_member_customer_principal"),
    )
    op.create_index(op.f("ix_customer_members_customer_id"), "customer_members", ["customer_id"], unique=False)
    op.create_index(op.f("ix_customer_members_principal_id"), "customer_members", ["principal_id"], unique=False)

    op.create_table(
        "social_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("external_account_id", sa.String(length=255), nullable=False),
        sa.Column("display_label", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "connection_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "customer_id",
            "platform",
            "external_account_id",
            name="uq_social_customer_platform_external",
        ),
    )
    op.create_index(
        op.f("ix_social_connections_customer_id"), "social_connections", ["customer_id"], unique=False
    )
    op.create_index(op.f("ix_social_connections_platform"), "social_connections", ["platform"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_social_connections_platform"), table_name="social_connections")
    op.drop_index(op.f("ix_social_connections_customer_id"), table_name="social_connections")
    op.drop_table("social_connections")
    op.drop_index(op.f("ix_customer_members_principal_id"), table_name="customer_members")
    op.drop_index(op.f("ix_customer_members_customer_id"), table_name="customer_members")
    op.drop_table("customer_members")
    op.drop_table("customers")
