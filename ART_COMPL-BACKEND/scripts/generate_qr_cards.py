#!/usr/bin/env python3
"""Генерирует печатные карточки с QR-кодом для товаров ЛДСП/ЛМДФ (is_manual=True).

Каждая карточка — картинка для печати и размещения в магазине рядом с образцом:
артикул + буквенный код отделки (SN/CB/PW/SU и т.п.) сверху, название декора
под ним, QR-код справа (ведёт на постоянную страницу /product/<id>). Без
логотипов и названий брендов — только эти данные, по просьбе заказчика.

Кромка сюда не входит (у неё нет персональных страниц — см. seed_ldsp_lmdf_manual.py).

Карточки складываются в <корень проекта>/Qr-коды/<ЛДСП|ЛМДФ>/<бренд>/<коллекция>/.

Запуск (на хосте, после seed_ldsp_lmdf_manual.py; нужен Pillow + qrcode[pil]):
    cd ART_COMPL-BACKEND
    python -m pip install "qrcode[pil]"
    python -m scripts.generate_qr_cards
    python -m scripts.generate_qr_cards --base-url https://art-komplekt.shop

Идемпотентно: перезаписывает те же файлы при повторном запуске.
"""
import argparse
import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.catalog.models import Product

try:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_M
    from PIL import Image, ImageDraw, ImageFont
    ASSETS_AVAILABLE = True
except ImportError:
    ASSETS_AVAILABLE = False

DEFAULT_DATABASE_URL = "postgresql+asyncpg://user:password@localhost:5434/artcomplect"
DEFAULT_BASE_URL = "https://art-komplekt.shop"

MATERIAL_LABELS = {"ldsp": "ЛДСП", "lmdf": "ЛМДФ"}

# Артикул в начале названия: "G 700", "C312", "0112", "5981", "К385"...
CODE_RE = re.compile(r"^([A-ZА-Я]{1,2}\s?\d{2,4}|\d{3,4})\s*")
# Буквенный код отделки (SN/CB/PW/SU/РЕ, иногда через запятую "SU,BS") —
# стоит либо сразу после артикула, либо в конце названия.
SUFFIX_TOKEN_RE = re.compile(r"(?:^|\s)([A-ZА-Я]{2,3}(?:,[A-ZА-Я]{2,3})?)(?=\s|$)")

CARD_WIDTH = 1050
CARD_HEIGHT = 380
QR_SIZE = 300
PADDING = 36
BORDER_WIDTH = 3
FONT_DIR = Path("C:/Windows/Fonts")


def split_article(name: str) -> tuple[str | None, str | None, str]:
    """Разбирает название на (артикул, код отделки, декор) — см. пример карточки заказчика."""
    remaining = name.strip()

    code = None
    code_match = CODE_RE.match(remaining)
    if code_match:
        code = code_match.group(1).strip()
        remaining = remaining[code_match.end():].strip()

    suffix = None
    suffix_match = SUFFIX_TOKEN_RE.search(remaining)
    if suffix_match:
        suffix = suffix_match.group(1)
        start, end = suffix_match.span(1)
        remaining = (remaining[:start] + remaining[end:])
        remaining = re.sub(r"\s+", " ", remaining).strip(" ,")

    return code, suffix, (remaining or name)


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', "", name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or "item"


async def fetch_manual_products(database_url: str) -> list[Product]:
    engine = create_async_engine(database_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(Product)
                .where(Product.is_manual.is_(True), Product.subcategory_slug.in_(["ldsp", "lmdf"]))
                .order_by(Product.subcategory_slug, Product.brand, Product.collection, Product.name)
            )
        ).scalars().all()
    await engine.dispose()
    return rows


def _wrap_text(draw: "ImageDraw.ImageDraw", text: str, font: "ImageFont.FreeTypeFont", max_width: int, max_lines: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if not current or draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines[:max_lines]


def render_card(product: Product, base_url: str) -> "Image.Image":
    code, suffix, decor = split_article(product.name)

    img = Image.new("RGB", (CARD_WIDTH, CARD_HEIGHT), "white")
    draw = ImageDraw.Draw(img)
    half_border = BORDER_WIDTH // 2
    draw.rectangle(
        [half_border, half_border, CARD_WIDTH - half_border - 1, CARD_HEIGHT - half_border - 1],
        outline="black",
        width=BORDER_WIDTH,
    )

    title_font = ImageFont.truetype(str(FONT_DIR / "arialbd.ttf"), 64)
    decor_font = ImageFont.truetype(str(FONT_DIR / "arialbd.ttf"), 44)
    title_line_height = 80
    decor_line_height = 54

    text_area_width = CARD_WIDTH - QR_SIZE - PADDING * 3
    title_text = " ".join(part for part in [code, suffix] if part)
    decor_lines = _wrap_text(draw, decor, decor_font, text_area_width, max_lines=3)

    block_height = (title_line_height if title_text else 0) + len(decor_lines) * decor_line_height
    y = max(PADDING, (CARD_HEIGHT - block_height) // 2)

    if title_text:
        draw.text((PADDING, y), title_text, font=title_font, fill="black")
        y += title_line_height

    for line in decor_lines:
        draw.text((PADDING, y), line, font=decor_font, fill="black")
        y += decor_line_height

    url = f"{base_url.rstrip('/')}/product/{product.external_id}"
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    qr_img = qr_img.resize((QR_SIZE, QR_SIZE), Image.NEAREST)

    qr_x = CARD_WIDTH - QR_SIZE - PADDING
    qr_y = (CARD_HEIGHT - QR_SIZE) // 2
    img.paste(qr_img, (qr_x, qr_y))

    return img


async def main_async(args: argparse.Namespace) -> None:
    workspace_root = Path(__file__).resolve().parents[2]
    out_dir = Path(args.output) if args.output else workspace_root / "Qr-коды"

    products = await fetch_manual_products(args.database_url)
    if not products:
        print("Нет ручных товаров ЛДСП/ЛМДФ в БД — сначала запустите scripts.seed_ldsp_lmdf_manual")
        return

    count = 0
    for product in products:
        material_dir = MATERIAL_LABELS.get(product.subcategory_slug, product.subcategory_slug or "Прочее")
        parts = [material_dir, product.brand or "Без бренда"]
        if product.collection:
            parts.append(product.collection)
        # sanitize_filename тоже убирает "/" — важно для брендов вроде "Lamarty / ЮГРА".
        target_dir = out_dir.joinpath(*(sanitize_filename(part) for part in parts))
        target_dir.mkdir(parents=True, exist_ok=True)

        img = render_card(product, args.base_url)
        img.save(target_dir / f"{sanitize_filename(product.name)}.png")
        count += 1

    print(f"Готово: {count} карточек в {out_dir}")


def main() -> None:
    if not ASSETS_AVAILABLE:
        print('Нужны пакеты: python -m pip install "qrcode[pil]"')
        sys.exit(1)

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=DEFAULT_DATABASE_URL, help="SQLAlchemy async URL до Postgres")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Публичный домен сайта для ссылок в QR")
    parser.add_argument("--output", help="Куда сохранять карточки (по умолчанию — Qr-коды/ в корне проекта)")
    args = parser.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
