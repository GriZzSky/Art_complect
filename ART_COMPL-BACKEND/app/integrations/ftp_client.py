from ftplib import FTP
from pathlib import Path

from app.core.config import get_settings
from app.utils.logger import logger


def download_file_from_ftp(local_dir: Path, filename: str) -> Path | None:
    settings = get_settings()
    local_dir.mkdir(parents=True, exist_ok=True)
    local_path = local_dir / filename
    try:
        with FTP() as ftp:
            ftp.connect(settings.FTP_HOST, settings.FTP_PORT)
            ftp.login(settings.FTP_USER, settings.FTP_PASSWORD)
            if settings.FTP_REMOTE_PATH and settings.FTP_REMOTE_PATH != "/":
                ftp.cwd(settings.FTP_REMOTE_PATH)
            with open(local_path, "wb") as file_handle:
                ftp.retrbinary(f"RETR {filename}", file_handle.write)
        logger.info("?????? ????: %s", local_path)
        return local_path
    except Exception as exc:
        logger.exception("?????? FTP: %s", exc)
        return None


def download_product_catalog_xml_from_ftp(local_dir: Path) -> Path | None:
    settings = get_settings()
    return download_file_from_ftp(local_dir, settings.FTP_PRODUCT_XML_FILENAME)


def download_price_offers_xml_from_ftp(local_dir: Path) -> Path | None:
    settings = get_settings()
    return download_file_from_ftp(local_dir, settings.FTP_PRICE_XML_FILENAME)
