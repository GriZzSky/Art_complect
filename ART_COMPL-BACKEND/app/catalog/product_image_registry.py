from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings

PRODUCT_IMAGES_ROUTE_PREFIX = "/product-images"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@lru_cache
def _build_image_index() -> dict[str, str]:
    images_dir = get_product_images_dir()
    if not images_dir.exists():
        return {}

    index: dict[str, str] = {}
    files = sorted(
        path for path in images_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )
    for path in files:
        product_key = path.stem.lower().split("_", 1)[0]
        relative_path = path.relative_to(images_dir).as_posix()
        index.setdefault(product_key, relative_path)
    return index


def refresh_image_index() -> None:
    _build_image_index.cache_clear()


def get_product_images_dir() -> Path:
    return Path(get_settings().PRODUCT_IMAGES_DIR)


def get_product_image_url(external_id: str | None) -> str | None:
    if not external_id:
        return None

    product_key = external_id.replace("-", "").lower()
    relative_path = _build_image_index().get(product_key)
    if not relative_path:
        return None
    return f"{PRODUCT_IMAGES_ROUTE_PREFIX}/{relative_path}"


def get_product_image_url_from_ref(image_ref: str | None) -> str | None:
    """URL фото, явно указанного в 1С (Product.image_ref — первый <Картинка> из
    import0_1.xml). Авторитетнее get_product_image_url(): та угадывает файл
    сортировкой по имени и путает фото у товаров с несколькими картинками —
    здесь используется порядок, который задаёт сама 1С.
    """
    if not image_ref:
        return None

    normalized = image_ref.strip().strip("/\\")
    if not normalized:
        return None
    relative = Path(normalized)
    if relative.is_absolute() or ".." in relative.parts:
        return None

    full_path = get_product_images_dir() / relative
    if not full_path.is_file():
        # 1С сослалась на файл, которого нет в выгруженной папке — не показываем
        # битую ссылку, вызывающий код сам решит, откатываться ли на эвристику.
        return None
    return f"{PRODUCT_IMAGES_ROUTE_PREFIX}/{relative.as_posix()}"
