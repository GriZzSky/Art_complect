from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProductBase(BaseModel):
    code: Optional[str] = None
    name: str
    category_slug: Optional[str] = None
    unit: Optional[str] = None
    coefficient: float = 1.0
    price: Optional[float] = None
    quantity: float = 0.0
    in_stock: bool = False


class ProductResponse(ProductBase):
    id: int
    external_id: str
    image_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}
