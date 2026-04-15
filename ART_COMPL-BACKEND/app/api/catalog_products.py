from typing import List

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Product
from app.catalog.product_image_registry import get_product_image_url
from app.catalog.schemas import ProductResponse
from app.core.database import get_db

router = APIRouter(prefix="/products", tags=["catalog-products"])


def serialize_product(product: Product) -> ProductResponse:
    payload = ProductResponse.model_validate(product).model_dump()
    payload["image_url"] = get_product_image_url(product.external_id)
    return ProductResponse(**payload)


@router.get("", response_model=List[ProductResponse])
async def list_products(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    category: str | None = Query(None, description="?????? ?? category_slug"),
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    count_query = select(func.count()).select_from(Product)
    if active_only:
        count_query = count_query.where(Product.is_active == True)
    if category:
        count_query = count_query.where(Product.category_slug == category)
    total = (await db.execute(count_query)).scalar() or 0
    response.headers["X-Total-Count"] = str(total)

    query = select(Product).offset(skip).limit(limit)
    if active_only:
        query = query.where(Product.is_active == True)
    if category:
        query = query.where(Product.category_slug == category)

    products = (await db.execute(query)).scalars().all()
    return [serialize_product(product) for product in products]


@router.get("/{external_id}", response_model=ProductResponse | None)
async def get_product(external_id: str, db: AsyncSession = Depends(get_db)):
    product = (await db.execute(select(Product).where(Product.external_id == external_id))).scalars().first()
    if product is None:
        return None
    return serialize_product(product)
