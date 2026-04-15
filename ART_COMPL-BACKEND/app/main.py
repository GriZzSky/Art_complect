from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api import catalog_products, catalog_sync
from app.catalog.category_rules import get_category_slug
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
        await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_products_category_slug ON products (category_slug)"))

        rows = await connection.execute(text("SELECT id, name FROM products"))
        for row in rows.fetchall():
            product_id, name = row[0], (row[1] or "")
            slug = get_category_slug(name)
            await connection.execute(
                text("UPDATE products SET category_slug = :slug WHERE id = :id"),
                {"slug": slug, "id": product_id},
            )

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
if product_images_dir.exists():
    app.mount(PRODUCT_IMAGES_ROUTE_PREFIX, StaticFiles(directory=str(product_images_dir)), name="product-images")
else:
    logger.warning("Product images directory was not found: %s", product_images_dir)

static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    @app.get("/")
    async def root():
        return RedirectResponse("/index.html")

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
