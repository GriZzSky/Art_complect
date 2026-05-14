"""add category_slug to products
Revision ID: 002
Revises: 001
Create Date: 2026-03-04

"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("category_slug", sa.String(64), nullable=True))
    op.create_index("ix_products_category_slug", "products", ["category_slug"], unique=False)


def downgrade():
    op.drop_index("ix_products_category_slug", table_name="products")
    op.drop_column("products", "category_slug")
