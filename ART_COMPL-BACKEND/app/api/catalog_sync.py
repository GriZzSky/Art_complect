from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, UploadFile

from app.catalog.catalog_sync_service import run_sync
from app.catalog.product_image_registry import refresh_image_index
from app.core.config import get_settings

router = APIRouter(prefix="/sync", tags=["catalog-sync"])


@router.post("/refresh-images")
async def refresh_images():
    # Индекс фото (product_image_registry) кэшируется в памяти процесса.
    # scripts/run_catalog_sync.py запускается отдельным процессом (docker exec) —
    # его собственный вызов refresh_image_index() не затрагивает кэш процесса
    # uvicorn, который реально отвечает на запросы сайта. Поэтому скрипт зовёт
    # этот эндпоинт по HTTP после синхронизации, чтобы сбросить кэш именно там.
    refresh_image_index()
    return {"success": True}


@router.post("/from-ftp")
async def sync_from_ftp():
    result = await run_sync(download_from_ftp=True)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.post("/from-file")
async def sync_from_file(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".xml"):
        raise HTTPException(status_code=400, detail="A product catalog .xml file is required")

    product_upload_dir = Path(get_settings().PRODUCT_CATALOG_XML_DIR)
    product_upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = product_upload_dir / file.filename
    file_path.write_bytes(await file.read())

    result = await run_sync(download_from_ftp=False, xml_path=file_path)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


@router.post("/from-path")
async def sync_from_path(xml_path: str = Query("import0_1.xml")):
    base_dir = Path(get_settings().PRODUCT_CATALOG_XML_DIR).resolve()
    file_path = (base_dir / xml_path).resolve()
    if not file_path.exists() or not str(file_path).startswith(str(base_dir)):
        raise HTTPException(status_code=400, detail="Product catalog file was not found")

    result = await run_sync(download_from_ftp=False, xml_path=file_path)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result
