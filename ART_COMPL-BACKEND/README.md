# ART-COMPL Backend

Backend on FastAPI + PostgreSQL for the ART-COMPL catalog.

## Clear FTP upload folders
At the project root there are three folders for daily uploads:

- `ftp_product_catalog_xml` - upload the product catalog XML here
- `ftp_price_offers_xml` - upload the prices and stock XML here
- `ftp_product_images` - upload product photos here

Images are matched by product `external_id`: the file name must start with the product id without hyphens.

## Backend structure
The backend is now grouped by meaning:

- `app/catalog` - product model, schemas, feed parsers, category rules, sync logic, image registry
- `app/integrations` - external integrations such as FTP
- `app/api` - HTTP routes for catalog and sync
- `app/core` - config and database
- `app/utils` - logging and small helpers

## Run with Docker
```powershell
cd ART_COMPL-BACKEND
docker-compose up -d --build
```

Main URLs:

- site: [http://127.0.0.1:8001](http://127.0.0.1:8001)
- catalog: [http://127.0.0.1:8001/catalog.html](http://127.0.0.1:8001/catalog.html)
- docs: [http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs)

## Manual catalog sync
```powershell
cd ART_COMPL-BACKEND
.\sync_catalog_from_docker.ps1
```

Or locally without Docker:
```powershell
cd ART_COMPL-BACKEND
python -m scripts.run_catalog_sync
```

## Result of sync
The backend reads the latest files from `ftp_product_catalog_xml` and `ftp_price_offers_xml`, updates products in PostgreSQL, and moves processed XML into `ART_COMPL-BACKEND/data/processed_feeds`.
