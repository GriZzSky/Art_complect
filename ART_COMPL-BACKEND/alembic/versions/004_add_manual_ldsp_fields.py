"""add manual product fields for LDSP/LMDF/Kromka catalog
Revision ID: 004
Revises: 003
Create Date: 2026-08-27

"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade():
    # Ручные товары используют человекочитаемый slug (например
    # "man-ldsp-ultradecor-g-seriya-g700-oreh-garmoniya"), который длиннее GUID из 1С.
    op.alter_column("products", "external_id", type_=sa.String(length=160))
    op.add_column("products", sa.Column("is_manual", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("products", sa.Column("subcategory_slug", sa.String(length=30), nullable=True))
    op.add_column("products", sa.Column("brand", sa.String(length=120), nullable=True))
    op.add_column("products", sa.Column("collection", sa.String(length=120), nullable=True))
    op.add_column("products", sa.Column("size_label", sa.String(length=60), nullable=True))
    op.add_column("products", sa.Column("image_url", sa.String(length=500), nullable=True))
    op.create_index("ix_products_subcategory_slug", "products", ["subcategory_slug"])


def downgrade():
    op.drop_index("ix_products_subcategory_slug", table_name="products")
    op.drop_column("products", "image_url")
    op.drop_column("products", "size_label")
    op.drop_column("products", "collection")
    op.drop_column("products", "brand")
    op.drop_column("products", "subcategory_slug")
    op.drop_column("products", "is_manual")
    op.alter_column("products", "external_id", type_=sa.String(length=36))
