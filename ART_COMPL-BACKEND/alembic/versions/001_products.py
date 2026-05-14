"""products table
Revision ID: 001
Revises:
Create Date: 2026-03-03
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("external_id", sa.String(36), nullable=False),
        sa.Column("code", sa.String(64), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("unit", sa.String(16), nullable=True),
        sa.Column("coefficient", sa.Float(), server_default="1"),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id"),
    )
    op.create_index("ix_products_external_id", "products", ["external_id"], unique=True)
    op.create_index("ix_products_code", "products", ["code"])

def downgrade():
    op.drop_index("ix_products_code", table_name="products")
    op.drop_index("ix_products_external_id", table_name="products")
    op.drop_table("products")
