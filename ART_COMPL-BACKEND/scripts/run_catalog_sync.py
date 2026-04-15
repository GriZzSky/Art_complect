#!/usr/bin/env python3
"""Run catalog sync: python -m scripts.run_catalog_sync [--ftp | --file path.xml | --dir folder]"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.catalog.catalog_sync_service import run_sync
from app.core.config import get_settings


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
    else:
        default_dir = Path(get_settings().PRODUCT_CATALOG_XML_DIR)
        if default_dir.exists():
            files = sorted(
                [path for path in default_dir.rglob("*.xml") if path.is_file()],
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
            if files:
                xml_path = files[0]

    result = asyncio.run(run_sync(download_from_ftp=args.ftp, xml_path=xml_path))
    if result["success"]:
        print(
            result["message"],
            "| parsed:", result.get("parsed", 0),
            "| upserted:", result.get("upserted", 0),
            "| price_feed:", result.get("price_feed_applied", 0),
        )
    else:
        print("Error:", result["message"])
        sys.exit(1)


if __name__ == "__main__":
    main()
