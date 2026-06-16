from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    external_id = Column(String(36), unique=True, nullable=False, index=True)
    code = Column(String(64), nullable=True, index=True)
    name = Column(Text, nullable=False)
    category_slug = Column(String(64), nullable=True, index=True)
    category_name = Column(String(255), nullable=True)
    unit = Column(String(16), nullable=True)
    coefficient = Column(Float, default=1.0)
    price = Column(Float, nullable=True)
    quantity = Column(Float, default=0.0, nullable=False)
    in_stock = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
