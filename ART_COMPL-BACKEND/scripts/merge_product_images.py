#!/usr/bin/env python3
"""Докладывает фото из входящей папки 1С в постоянное хранилище.

Отдельно от полной синхронизации каталога: нужен, когда пришла только пачка
фотографий без нового XML, и для первичного переноса при переезде на
накопительное хранилище.

Запуск внутри контейнера:
    docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml \
      exec api python -m scripts.merge_product_images

Идемпотентно: уже перенесённые файлы пропускаются по размеру и дате.
"""
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.catalog.product_image_registry import (
    get_incoming_images_dir,
    get_product_images_dir,
    merge_incoming_images,
)

# Скрипт запускается отдельным процессом (docker compose exec), поэтому сброс
# кэша внутри него не влияет на процесс uvicorn, который отвечает сайту.
# Тот же приём, что в run_catalog_sync.py.
REFRESH_IMAGES_URL = "http://127.0.0.1:8000/api/sync/refresh-images"


def _refresh_live_image_cache() -> None:
    try:
        urllib.request.urlopen(urllib.request.Request(REFRESH_IMAGES_URL, method="POST"), timeout=10)
    except Exception as exc:
        print(f"Warning: could not refresh live image cache ({exc}). "
              "Restart the api container if photos still look stale.")


def main() -> None:
    incoming = get_incoming_images_dir()
    store = get_product_images_dir()
    print(f"Входящая папка: {incoming}")
    print(f"Хранилище:      {store}")

    if incoming.resolve() == store.resolve():
        print("Хранилище не выделено (пути совпадают) — копировать нечего.")
        return
    if not incoming.exists():
        print("Входящая папка не найдена — нечего переносить.")
        sys.exit(1)

    copied, unchanged = merge_incoming_images()
    total = sum(1 for path in store.rglob("*") if path.is_file())
    print(f"Скопировано: {copied}, без изменений: {unchanged}")
    print(f"Всего фото в хранилище: {total}")

    if copied:
        _refresh_live_image_cache()


if __name__ == "__main__":
    main()
