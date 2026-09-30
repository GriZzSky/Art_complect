"""Catalog synchronization from FTP/upload folders into the product database."""
import time
from pathlib import Path

from app.catalog.price_feed_parser import parse_offers_map
from app.catalog.product_feed_parser import catalog_contains_only_changes, parse_products_list
from app.catalog.product_image_registry import merge_incoming_images, refresh_image_index
from app.catalog.product_repository import archive_file, bulk_upsert, deactivate_all
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.integrations.ftp_client import (
    download_price_offers_xml_from_ftp,
    download_product_catalog_xml_from_ftp,
)
from app.utils.logger import logger

LEGACY_PRODUCT_FILENAME = "import0_1.xml"
LEGACY_PRICE_FILENAME = "offers0_1.xml"


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _workspace_root() -> Path:
    return _backend_root().parent


def _legacy_product_catalog_dirs() -> list[Path]:
    backend_root = _backend_root()
    workspace_root = _workspace_root()
    return [
        backend_root / "imports_xml",
        backend_root / "price_photo",
        workspace_root / "imports_xml",
        workspace_root / "price_photo",
    ]


def _legacy_price_feed_dirs() -> list[Path]:
    backend_root = _backend_root()
    workspace_root = _workspace_root()
    return [
        backend_root / "price_photo",
        backend_root / "imports_xml",
        backend_root / "imports_xml" / "archive",
        workspace_root / "price_photo",
        workspace_root / "imports_xml",
        workspace_root / "imports_xml" / "archive",
    ]


def _acquire_lock() -> bool:
    settings = get_settings()
    lock = Path(settings.SYNC_LOCK_FILE)
    if lock.exists():
        if time.time() - lock.stat().st_mtime > settings.SYNC_LOCK_TIMEOUT_SEC:
            lock.unlink()
        else:
            logger.error("Sync lock is already active")
            return False

    lock.parent.mkdir(parents=True, exist_ok=True)
    lock.write_text(str(int(time.time())), encoding="utf-8")
    return True


def _release_lock() -> None:
    lock = Path(get_settings().SYNC_LOCK_FILE)
    if lock.exists():
        lock.unlink(missing_ok=True)


def _iter_existing_files(paths: list[Path]) -> list[Path]:
    existing: list[Path] = []
    seen: set[Path] = set()
    for path in paths:
        try:
            resolved = path.resolve()
        except Exception:
            resolved = path
        if resolved in seen:
            continue
        seen.add(resolved)
        if resolved.exists() and resolved.is_file():
            existing.append(resolved)
    return existing


def _sorted_xml_files(directory: Path, pattern: str = "*.xml") -> list[Path]:
    if not directory.exists():
        return []
    return sorted(
        [path for path in directory.glob(pattern) if path.is_file()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )


def _resolve_product_catalog_path(xml_path: Path | None = None) -> Path | None:
    settings = get_settings()
    upload_dir = Path(settings.PRODUCT_CATALOG_XML_DIR)
    archive_dir = Path(settings.PROCESSED_PRODUCT_XML_DIR)

    candidates: list[Path] = []
    if xml_path is not None:
        candidates.append(xml_path)
        if not xml_path.is_absolute():
            candidates.append(upload_dir / xml_path)

    candidates.append(upload_dir / settings.FTP_PRODUCT_XML_FILENAME)
    candidates.append(upload_dir / LEGACY_PRODUCT_FILENAME)
    candidates.extend(_sorted_xml_files(upload_dir))
    candidates.append(archive_dir / settings.FTP_PRODUCT_XML_FILENAME)
    candidates.append(archive_dir / LEGACY_PRODUCT_FILENAME)
    candidates.extend(_sorted_xml_files(archive_dir))

    for legacy_dir in _legacy_product_catalog_dirs():
        candidates.append(legacy_dir / settings.FTP_PRODUCT_XML_FILENAME)
        candidates.append(legacy_dir / LEGACY_PRODUCT_FILENAME)
        candidates.extend(_sorted_xml_files(legacy_dir, "import*.xml"))
        candidates.extend(_sorted_xml_files(legacy_dir))

    existing = _iter_existing_files(candidates)
    return existing[0] if existing else None


def _resolve_price_offers_path(product_catalog_path: Path | None = None) -> Path | None:
    settings = get_settings()
    upload_dir = Path(settings.PRICE_OFFERS_XML_DIR)
    archive_dir = Path(settings.PROCESSED_PRICE_XML_DIR)

    candidates: list[Path] = []
    if product_catalog_path is not None:
        candidates.append(product_catalog_path.with_name(settings.FTP_PRICE_XML_FILENAME))
        candidates.append(product_catalog_path.with_name(LEGACY_PRICE_FILENAME))

    candidates.append(upload_dir / settings.FTP_PRICE_XML_FILENAME)
    candidates.append(upload_dir / LEGACY_PRICE_FILENAME)
    candidates.extend(_sorted_xml_files(upload_dir))
    candidates.append(archive_dir / settings.FTP_PRICE_XML_FILENAME)
    candidates.append(archive_dir / LEGACY_PRICE_FILENAME)
    candidates.extend(_sorted_xml_files(archive_dir))

    for legacy_dir in _legacy_price_feed_dirs():
        candidates.append(legacy_dir / settings.FTP_PRICE_XML_FILENAME)
        candidates.append(legacy_dir / LEGACY_PRICE_FILENAME)
        candidates.extend(_sorted_xml_files(legacy_dir, "offers*.xml"))
        candidates.extend(_sorted_xml_files(legacy_dir))

    existing = _iter_existing_files(candidates)
    return existing[0] if existing else None


def _should_archive_source(source_path: Path, upload_dir: Path, archive_dir: Path) -> bool:
    try:
        source = source_path.resolve()
        upload_root = upload_dir.resolve()
        archive_root = archive_dir.resolve()
    except Exception:
        return False
    return upload_root == source.parent or (upload_root in source.parents and archive_root not in source.parents)


async def run_sync(download_from_ftp: bool = True, xml_path: Path | None = None) -> dict:
    result = {
        "success": False,
        "message": "",
        "parsed": 0,
        "upserted": 0,
        "price_feed_parsed": 0,
        "price_feed_applied": 0,
        "images_copied": 0,
    }
    if not _acquire_lock():
        result["message"] = "Failed to acquire sync lock"
        return result

    try:
        settings = get_settings()
        product_upload_dir = Path(settings.PRODUCT_CATALOG_XML_DIR)
        price_upload_dir = Path(settings.PRICE_OFFERS_XML_DIR)
        product_archive_dir = Path(settings.PROCESSED_PRODUCT_XML_DIR)
        price_archive_dir = Path(settings.PROCESSED_PRICE_XML_DIR)

        if download_from_ftp:
            product_catalog_path = download_product_catalog_xml_from_ftp(product_upload_dir)
            if product_catalog_path is None:
                result["message"] = "FTP error: product catalog XML was not downloaded"
                return result
            price_offers_path = download_price_offers_xml_from_ftp(price_upload_dir)
        else:
            product_catalog_path = _resolve_product_catalog_path(xml_path)
            if product_catalog_path is None:
                result["message"] = "Product catalog XML was not found"
                return result
            price_offers_path = _resolve_price_offers_path(product_catalog_path)

        contains_only_changes = catalog_contains_only_changes(product_catalog_path)
        products = parse_products_list(product_catalog_path)
        result["parsed"] = len(products)
        if not products:
            result["message"] = f"Product catalog XML did not pass validation: {product_catalog_path}"
            return result

        offers_by_id = {}
        if price_offers_path is not None and price_offers_path.exists():
            offers_by_id = parse_offers_map(price_offers_path)
            result["price_feed_parsed"] = len(offers_by_id)
        else:
            logger.warning("Price XML not found; current prices and stock values will be kept")

        async with AsyncSessionLocal() as session:
            await session.begin()
            try:
                if contains_only_changes:
                    logger.info(
                        "Incremental product feed detected; existing products remain active"
                    )
                else:
                    await deactivate_all(session)
                result["upserted"], result["price_feed_applied"] = await bulk_upsert(
                    session, products, offers_by_id
                )
                await session.commit()
            except Exception as exc:
                await session.rollback()
                result["message"] = str(exc)
                return result

        if settings.ARCHIVE_SOURCE_FILES:
            if _should_archive_source(product_catalog_path, product_upload_dir, product_archive_dir):
                archive_file(product_catalog_path, product_archive_dir)
            if price_offers_path is not None and _should_archive_source(price_offers_path, price_upload_dir, price_archive_dir):
                archive_file(price_offers_path, price_archive_dir)

        # Фото докладываем в хранилище до пересборки индекса, иначе новые
        # картинки не попадут в него до следующей синхронизации.
        result["images_copied"], _ = merge_incoming_images()
        refresh_image_index()
        result["success"] = True
        result["message"] = (
            f"Catalog sync: {result['upserted']} products, price and stock updated for "
            f"{result['price_feed_applied']}, images added {result['images_copied']}"
        )
    except Exception as exc:
        result["message"] = str(exc)
        logger.exception("Catalog sync failed: %s", exc)
    finally:
        _release_lock()
    return result
