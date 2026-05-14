"""add price and stock fields to products
Revision ID: 003
Revises: 002
Create Date: 2026-04-14

"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("price", sa.Float(), nullable=True))
    op.add_column("products", sa.Column("quantity", sa.Float(), nullable=False, server_default="0"))
    op.add_column("products", sa.Column("in_stock", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade():
    op.drop_column("products", "in_stock")
    op.drop_column("products", "quantity")
    op.drop_column("products", "price")
