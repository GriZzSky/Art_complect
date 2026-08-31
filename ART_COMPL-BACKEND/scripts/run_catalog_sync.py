#!/usr/bin/env python3
"""Run catalog sync: python -m scripts.run_catalog_sync [--ftp | --file path.xml | --dir folder]"""
import argparse
import asyncio
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.catalog.catalog_sync_service import run_sync

# Этот скрипт запускается отдельным процессом (docker-compose exec) — его
# refresh_image_index() сбрасывает кэш ТОЛЬКО в своей памяти, а не в процессе
# uvicorn, который реально отвечает на запросы сайта. Поэтому после успешной
# синхронизации дополнительно зовём эндпоинт, который сбросит кэш там же (иначе
# сайт мог показывать старые/неверные фото до перезапуска контейнера).
REFRESH_IMAGES_URL = "http://127.0.0.1:8000/api/sync/refresh-images"


def _refresh_live_image_cache() -> None:
    try:
        req = urllib.request.Request(REFRESH_IMAGES_URL, method="POST")
        urllib.request.urlopen(req, timeout=10)
    except Exception as exc:
        print(f"Warning: could not refresh live image cache ({exc}). "
              "Restart the api container if photos still look stale.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", help="Path to a product catalog XML file")
    parser.add_argument("--dir", help="Directory with product catalog XML files (latest .xml wins)")
    parser.add_argument("--ftp", action="store_true", help="Download product and price XML files from FTP, then sync")
    args = parser.parse_args()

    xml_path = None
    if args.file:
        xml_path = Path(args.file)
        if not xml_path.exists():
            print("File not found:", xml_path)
            sys.exit(1)
    elif args.dir:
        directory = Path(args.dir)
        files = sorted(
            [path for path in directory.rglob("*.xml") if path.is_file()],
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if not files:
            print("No .xml files in", directory)
            sys.exit(1)
        xml_path = files[0]
    # Без аргументов оставляем xml_path=None: резолвер сам выберет каталог по имени
    # (FTP_PRODUCT_XML_FILENAME, например import0_1.xml). Иначе при папке, где рядом
    # лежат и каталог, и прайс (webdata), выбор «самого свежего .xml» мог взять offers.

    result = asyncio.run(run_sync(download_from_ftp=args.ftp, xml_path=xml_path))
    if result["success"]:
        print(
            result["message"],
            "| parsed:", result.get("parsed", 0),
            "| upserted:", result.get("upserted", 0),
            "| price_feed:", result.get("price_feed_applied", 0),
        )
        _refresh_live_image_cache()
    else:
        print("Error:", result["message"])
        sys.exit(1)


if __name__ == "__main__":
    main()
