from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api import catalog_products, catalog_sync
from app.catalog.catalog_sync_service import run_sync
from app.catalog.product_image_registry import (
    PRODUCT_IMAGES_ROUTE_PREFIX,
    get_product_images_dir,
    refresh_image_index,
)
from app.core.config import get_settings
from app.core.database import Base, engine
from app.utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS category_slug VARCHAR(64)"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS price DOUBLE PRECISION"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity DOUBLE PRECISION NOT NULL DEFAULT 0"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN NOT NULL DEFAULT FALSE"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS category_name VARCHAR(255)"))
        await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_products_category_slug ON products (category_slug)"))
        # Ручные товары (ЛДСП/ЛМДФ/Кромка витрина) — не из 1С, синхронизация их не трогает.
        # external_id для них — человекочитаемый slug длиннее GUID из 1С (был VARCHAR(36)).
        await connection.execute(text("ALTER TABLE products ALTER COLUMN external_id TYPE VARCHAR(160)"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_slug VARCHAR(30)"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(120)"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS collection VARCHAR(120)"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS size_label VARCHAR(60)"))
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)"))
        # Основное фото товара по данным 1С (первый <Картинка> из import0_1.xml) —
        # авторитетнее угадывания по файлам в папке (см. product_image_registry.py).
        await connection.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS image_ref VARCHAR(500)"))
        await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_products_subcategory_slug ON products (subcategory_slug)"))

        # Категории берутся из классификатора во время синхронизации каталога,
        # поэтому больше не переопределяем их по ключевым словам на старте.

    async with engine.connect() as connection:
        total_products = (await connection.execute(text("SELECT COUNT(*) FROM products"))).scalar() or 0

    if total_products == 0:
        logger.info("Product table is empty, running initial catalog sync")
        result = await run_sync(download_from_ftp=False)
        if result.get("success"):
            logger.info(result.get("message", "Initial catalog sync completed"))
        else:
            logger.warning("Initial catalog sync failed: %s", result.get("message", "unknown error"))

    refresh_image_index()
    yield
    await engine.dispose()


app = FastAPI(title="ART-COMPL Backend", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)
app.include_router(catalog_products.router, prefix="/api")
app.include_router(catalog_sync.router, prefix="/api")

settings = get_settings()
product_images_dir = get_product_images_dir()
# Хранилище может ещё не существовать — например, при первом запуске после
# переезда на накопительный каталог. Создаём заранее: если папки нет в момент
# старта, маршрут не регистрируется, и все фото отдают 404 до перезапуска,
# даже когда файлы уже появились.
try:
    product_images_dir.mkdir(parents=True, exist_ok=True)
except OSError as exc:
    logger.warning("Could not create product images directory %s: %s", product_images_dir, exc)
if product_images_dir.exists():
    app.mount(PRODUCT_IMAGES_ROUTE_PREFIX, StaticFiles(directory=str(product_images_dir)), name="product-images")
else:
    logger.warning("Product images directory was not found: %s", product_images_dir)

static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    @app.get("/")
    async def root():
        return RedirectResponse("/index.html", status_code=301)

    pretty_pages = {
        "/index": "/index.html",
        "/catalog": "/catalog.html",
        "/services": "/services.html",
        "/promo": "/promo.html",
        "/about": "/about.html",
        "/contact": "/contact.html",
        "/cart": "/cart.html",
        "/404": "/404.html",
    }

    for path, target in pretty_pages.items():
        @app.get(path, include_in_schema=False)
        async def _redirect(target=target):
            return RedirectResponse(target, status_code=301)

    # Постоянная ссылка на карточку товара (для статичных QR-кодов ЛДСП/ЛМДФ):
    # печатается как /product/<id>, редиректит на статичную страницу с ?id=.
    @app.get("/product/{external_id}", include_in_schema=False)
    async def _redirect_product(external_id: str):
        return RedirectResponse(f"/product.html?id={external_id}", status_code=301)

    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
else:
    @app.get("/")
    async def root():
        return {
            "service": "art-complect-api",
            "docs": "/docs",
            "product_catalog_xml_dir": settings.PRODUCT_CATALOG_XML_DIR,
            "price_offers_xml_dir": settings.PRICE_OFFERS_XML_DIR,
            "product_images_dir": settings.PRODUCT_IMAGES_DIR,
        }
