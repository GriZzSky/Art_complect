from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProductBase(BaseModel):
    code: Optional[str] = None
    name: str
    category_slug: Optional[str] = None
    category_name: Optional[str] = None
    unit: Optional[str] = None
    coefficient: float = 1.0
    price: Optional[float] = None
    quantity: float = 0.0
    in_stock: bool = False
    is_manual: bool = False
    subcategory_slug: Optional[str] = None
    brand: Optional[str] = None
    collection: Optional[str] = None
    size_label: Optional[str] = None


class ProductResponse(ProductBase):
    id: int
    external_id: str
    image_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class CategoryResponse(BaseModel):
    slug: str
    name: str
    count: int


class CategoryListResponse(BaseModel):
    total: int
    items: list[CategoryResponse]
