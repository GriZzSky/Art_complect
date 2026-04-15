from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5433/artcomplect"
    FTP_HOST: str = "localhost"
    FTP_PORT: int = 21
    FTP_USER: str = ""
    FTP_PASSWORD: str = ""
    FTP_REMOTE_PATH: str = "/"
    FTP_PRODUCT_XML_FILENAME: str = "import0_1.xml"
    FTP_PRICE_XML_FILENAME: str = "offers0_1.xml"

    # Понятные папки для входящих FTP-загрузок.
    PRODUCT_CATALOG_XML_DIR: str = "../ftp_product_catalog_xml"
    PRICE_OFFERS_XML_DIR: str = "../ftp_price_offers_xml"
    PRODUCT_IMAGES_DIR: str = "../ftp_product_images"

    # Внутренние архивы обработанных XML.
    PROCESSED_PRODUCT_XML_DIR: str = "data/processed_feeds/product_catalog_xml"
    PROCESSED_PRICE_XML_DIR: str = "data/processed_feeds/price_offers_xml"

    LOGS_DIR: str = "data/logs"
    SYNC_LOCK_FILE: str = "data/sync/catalog_sync.lock"
    SYNC_LOCK_TIMEOUT_SEC: int = 3600

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
