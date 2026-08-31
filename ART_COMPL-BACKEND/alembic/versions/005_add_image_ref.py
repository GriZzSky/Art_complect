"""add explicit image_ref from 1C <Картинка> tag
Revision ID: 005
Revises: 004
Create Date: 2026-08-28

"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("image_ref", sa.String(length=500), nullable=True))


def downgrade():
    op.drop_column("products", "image_ref")
