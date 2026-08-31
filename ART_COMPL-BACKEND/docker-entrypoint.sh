#!/bin/sh
set -e
# Применяем миграции БД при старте (если уже применены — ничего не делаем)
alembic upgrade head 2>/dev/null || true
exec "$@"
