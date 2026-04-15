from datetime import datetime
from pathlib import Path
import shutil

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.category_rules import get_category_slug
from app.catalog.models import Product
from app.catalog.price_feed_parser import ParsedOffer
from app.catalog.product_feed_parser import ParsedProduct
from app.utils.logger import logger


async def deactivate_all(session: AsyncSession) -> None:
    await session.execute(update(Product).values(is_active=False))
    logger.info("All products marked inactive before sync")


async def bulk_upsert(
    session: AsyncSession,
    products: list[ParsedProduct],
    offers_by_id: dict[str, ParsedOffer] | None = None,
) -> tuple[int, int]:
    if not products:
        return 0, 0

    count = 0
    offers_applied = 0
    for product in products:
        try:
            existing = (
                await session.execute(select(Product).where(Product.external_id == product.external_id))
            ).scalars().first()
            category_slug = get_category_slug(product.name)
            offer = offers_by_id.get(product.external_id) if offers_by_id else None

            if existing:
                existing.code = product.code
                existing.name = product.name
                existing.unit = product.unit
                existing.coefficient = product.coefficient
                existing.category_slug = category_slug
                if offer is not None:
                    existing.price = offer.price
                    existing.quantity = offer.quantity
                    existing.in_stock = offer.in_stock
                    offers_applied += 1
                existing.is_active = True
                session.add(existing)
            else:
                session.add(
                    Product(
                        external_id=product.external_id,
                        code=product.code,
                        name=product.name,
                        category_slug=category_slug,
                        unit=product.unit,
                        coefficient=product.coefficient,
                        price=offer.price if offer is not None else None,
                        quantity=offer.quantity if offer is not None else 0.0,
                        in_stock=offer.in_stock if offer is not None else False,
                        is_active=True,
                    )
                )
                if offer is not None:
                    offers_applied += 1
            count += 1
        except Exception as exc:
            logger.exception("UPSERT %s: %s", product.external_id, exc)

    await session.flush()
    return count, offers_applied


def archive_file(file_path: Path, archive_dir: Path) -> Path | None:
    if not file_path.exists():
        return None

    archive_dir.mkdir(parents=True, exist_ok=True)
    destination = archive_dir / f"{file_path.stem}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}{file_path.suffix}"
    try:
        shutil.move(str(file_path), str(destination))
        return destination
    except Exception as exc:
        logger.exception("Archive failed for %s: %s", file_path, exc)
        return None
