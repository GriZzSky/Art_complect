#!/usr/bin/env python3
"""Заводит "ручные" товары ЛДСП/ЛМДФ (не из 1С) из папки ЛДСП_ЛМДФ_Кромка/.

Читает фото из <workspace_root>/ЛДСП_ЛМДФ_Кромка (декор/размер/цена зашиты в имени
файла), копирует их в FRONT/images/ldsp-lmdf-kromka/... и апсертит товары в БД
(is_manual=True — синхронизация с 1С их не трогает).

Печатные QR-карточки генерируются отдельным скриптом: scripts/generate_qr_cards.py
(запускать после этого скрипта).

Запуск (на хосте, Postgres пробрасывается docker-compose.yml на localhost:5434):
    cd ART_COMPL-BACKEND
    python -m scripts.seed_ldsp_lmdf_manual
    python -m scripts.seed_ldsp_lmdf_manual --database-url postgresql+asyncpg://user:password@localhost:5434/artcomplect

Идемпотентно: повторный запуск обновляет те же external_id, а не дублирует записи.
"""
import argparse
import asyncio
import re
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.catalog.category_classifier import slugify_category
from app.catalog.models import Product

DEFAULT_DATABASE_URL = "postgresql+asyncpg://user:password@localhost:5434/artcomplect"

CATEGORY_SLUG = "ldsp-lmdf-kromka"
CATEGORY_NAME = "ЛДСП/ЛМДФ/Кромка"

# Соответствие структуры папок -> (subcategory_slug, бренд, slug бренда, коллекция, slug коллекции).
# Ключ — относительный путь папки (posix, от корня ЛДСП_ЛМДФ_Кромка/).
FOLDER_MAP: dict[str, tuple[str, str, str, str | None, str | None]] = {
    "ЛДСП/Lamarty,ЮГРА": ("ldsp", "Lamarty / ЮГРА", "lamarty-yugra", None, None),
    "ЛДСП/Ultradecor/G-серия": ("ldsp", "Ultradecor", "ultradecor", "G-серия", "g-seriya"),
    "ЛДСП/Ultradecor/Standart": ("ldsp", "Ultradecor", "ultradecor", "Standart", "standart"),
    "ЛМДФ Moonlight/Color": ("lmdf", "Moonlight", "moonlight", "Color", "color"),
    "ЛМДФ Moonlight/Rocks": ("lmdf", "Moonlight", "moonlight", "Rocks", "rocks"),
    "ЛМДФ Moonlight/Wood": ("lmdf", "Moonlight", "moonlight", "Wood", "wood"),
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

SIZE_RE = re.compile(r"(\d{3,4})\s*[×xXх]\s*(\d{3,4})\s*[×xXх]\s*(\d{1,3})(?:\s*мм)?")
PRICE_RE = re.compile(r"\(\s*([\d\s]+(?:[.,]\d+)?)\s*р\.?\s*\)")
# «(Цена по запросу)» вместо суммы: цену не знаем, но и в названии декора этой
# пометке не место — фронт сам подставит «Цена по запросу», когда price пустая.
PRICE_ON_REQUEST_RE = re.compile(r"\(\s*цена\s+по\s+запросу\s*\)", re.IGNORECASE)


@dataclass
class ParsedItem:
    source_path: Path
    subcategory_slug: str
    brand: str
    brand_slug: str
    collection: str | None
    collection_slug: str | None
    name: str
    size_label: str | None
    price: float | None
    external_id: str
    image_rel_path: str


def parse_filename(stem: str) -> tuple[str | None, float | None, str]:
    price_match = PRICE_RE.search(stem)
    size_match = SIZE_RE.search(stem)
    on_request_match = PRICE_ON_REQUEST_RE.search(stem)

    spans = []
    if price_match:
        spans.append((price_match.start(), price_match.end()))
    if size_match:
        spans.append((size_match.start(), size_match.end()))
    if on_request_match:
        spans.append((on_request_match.start(), on_request_match.end()))
    spans.sort(key=lambda span: span[0], reverse=True)

    name = stem
    for start, end in spans:
        name = name[:start] + " " + name[end:]
    name = re.sub(r"\s+", " ", name).strip(" ,.-—")

    size_label = None
    if size_match:
        size_label = f"{size_match.group(1)}×{size_match.group(2)}×{size_match.group(3)} мм"

    price = None
    if price_match:
        raw = price_match.group(1).replace(" ", "").replace(",", ".")
        try:
            price = float(raw)
        except ValueError:
            price = None

    return size_label, price, name or stem


def collect_items(source_dir: Path) -> tuple[list[ParsedItem], list[Path]]:
    items: list[ParsedItem] = []
    skipped: list[Path] = []
    used_ids: set[str] = set()

    for path in sorted(source_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        rel_dir = path.parent.relative_to(source_dir).as_posix()
        mapping = FOLDER_MAP.get(rel_dir)
        if mapping is None:
            skipped.append(path)
            continue
        subcategory_slug, brand, brand_slug, collection, collection_slug = mapping

        size_label, price, name = parse_filename(path.stem)
        item_slug = slugify_category(name) or "item"

        slug_core = "-".join(filter(None, [subcategory_slug, brand_slug, collection_slug, item_slug]))
        external_id = f"man-{slug_core}"[:160]
        base_id = external_id
        suffix = 2
        while external_id in used_ids:
            external_id = f"{base_id[:150]}-{suffix}"
            suffix += 1
        used_ids.add(external_id)

        image_rel_path = "/".join(filter(None, [
            "ldsp-lmdf-kromka",
            subcategory_slug,
            brand_slug,
            collection_slug or "osnovnaya",
            f"{slug_core}{path.suffix.lower()}",
        ]))

        items.append(ParsedItem(
            source_path=path,
            subcategory_slug=subcategory_slug,
            brand=brand,
            brand_slug=brand_slug,
            collection=collection,
            collection_slug=collection_slug,
            name=name,
            size_label=size_label,
            price=price,
            external_id=external_id,
            image_rel_path=image_rel_path,
        ))

    return items, skipped


def copy_images(items: list[ParsedItem], front_dir: Path) -> None:
    for item in items:
        dest = front_dir / "images" / item.image_rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(item.source_path.read_bytes())


async def upsert_items(items: list[ParsedItem], database_url: str) -> None:
    engine = create_async_engine(database_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    created = 0
    updated = 0
    async with session_factory() as session:
        for item in items:
            existing = (
                await session.execute(select(Product).where(Product.external_id == item.external_id))
            ).scalars().first()
            image_url = f"/images/{item.image_rel_path}"
            if existing:
                existing.name = item.name
                existing.category_slug = CATEGORY_SLUG
                existing.category_name = CATEGORY_NAME
                existing.subcategory_slug = item.subcategory_slug
                existing.brand = item.brand
                existing.collection = item.collection
                existing.size_label = item.size_label
                existing.price = item.price
                existing.image_url = image_url
                existing.is_manual = True
                existing.is_active = True
                existing.in_stock = True
                session.add(existing)
                updated += 1
            else:
                session.add(Product(
                    external_id=item.external_id,
                    code=None,
                    name=item.name,
                    category_slug=CATEGORY_SLUG,
                    category_name=CATEGORY_NAME,
                    subcategory_slug=item.subcategory_slug,
                    brand=item.brand,
                    collection=item.collection,
                    size_label=item.size_label,
                    unit=None,
                    coefficient=1.0,
                    price=item.price,
                    quantity=0.0,
                    in_stock=True,
                    is_active=True,
                    is_manual=True,
                    image_url=image_url,
                ))
                created += 1
        await session.commit()
    await engine.dispose()
    print(f"БД: создано {created}, обновлено {updated}")


async def main_async(args: argparse.Namespace) -> None:
    workspace_root = Path(__file__).resolve().parents[2]
    source_dir = Path(args.source) if args.source else workspace_root / "ЛДСП_ЛМДФ_Кромка"
    front_dir = Path(args.front_dir) if args.front_dir else workspace_root / "FRONT"

    if not source_dir.exists():
        print("Не найдена папка с фото:", source_dir)
        sys.exit(1)
    if not front_dir.exists():
        print("Не найдена папка FRONT:", front_dir)
        sys.exit(1)

    items, skipped = collect_items(source_dir)
    print(f"Найдено {len(items)} товаров для загрузки.")
    if skipped:
        print(f"Пропущено {len(skipped)} файлов (папка не сопоставлена в FOLDER_MAP):")
        for path in skipped:
            print("  -", path.relative_to(source_dir))

    if not items:
        print("Нечего загружать — выхожу.")
        return

    copy_images(items, front_dir)
    print(f"Фото скопированы в {front_dir / 'images' / 'ldsp-lmdf-kromka'}")

    await upsert_items(items, args.database_url)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", help="Путь к папке ЛДСП_ЛМДФ_Кромка (по умолчанию — рядом с ART_COMPL-BACKEND)")
    parser.add_argument("--front-dir", help="Путь к папке FRONT (по умолчанию — рядом с ART_COMPL-BACKEND)")
    parser.add_argument("--database-url", default=DEFAULT_DATABASE_URL, help="SQLAlchemy async URL до Postgres")
    args = parser.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
