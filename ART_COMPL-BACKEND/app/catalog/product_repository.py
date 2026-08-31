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


# Товары с этим паттерном в названии — это кромка (ПВХ/меламиновая), где бы она
# ни числилась по классификатору 1С. Переносим её в единый мини-каталог
# «ЛДСП/ЛМДФ/Кромка» на каждой синхронизации, чтобы решение переживало новые выгрузки.
KROMKA_NAME_PATTERN = "кромк"
LDSP_LMDF_KROMKA_CATEGORY_SLUG = "ldsp-lmdf-kromka"
LDSP_LMDF_KROMKA_CATEGORY_NAME = "ЛДСП/ЛМДФ/Кромка"


async def deactivate_all(session: AsyncSession) -> None:
    # Ручные товары (витрина ЛДСП/ЛМДФ/Кромка, is_manual=True) не приходят из 1С —
    # синхронизация их не гасит и не переписывает.
    await session.execute(update(Product).where(Product.is_manual.is_(False)).values(is_active=False))
    logger.info("All non-manual products marked inactive before sync")


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
            if existing is not None and existing.is_manual:
                # Ручные товары ведутся отдельным скриптом (seed_ldsp_lmdf_manual.py),
                # 1С их не описывает — пропускаем, чтобы не затереть цену/фото/категорию.
                continue

            # Категория берётся из классификатора (product.category_slug); если товар
            # не привязан к группе, падаем на старый подбор по ключевым словам.
            category_slug = product.category_slug or get_category_slug(product.name)
            category_name = product.category_name
            subcategory_slug = None
            if KROMKA_NAME_PATTERN in product.name.lower():
                category_slug = LDSP_LMDF_KROMKA_CATEGORY_SLUG
                category_name = LDSP_LMDF_KROMKA_CATEGORY_NAME
                subcategory_slug = "kromka"
            offer = offers_by_id.get(product.external_id) if offers_by_id else None

            if existing:
                existing.code = product.code
                existing.name = product.name
                existing.unit = product.unit
                existing.coefficient = product.coefficient
                existing.category_slug = category_slug
                existing.category_name = category_name
                existing.subcategory_slug = subcategory_slug
                existing.image_ref = product.image_path
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
                        category_name=category_name,
                        subcategory_slug=subcategory_slug,
                        image_ref=product.image_path,
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
