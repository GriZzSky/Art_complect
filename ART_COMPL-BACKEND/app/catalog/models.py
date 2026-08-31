from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # 1С отдаёт GUID (36 симв.), но ручные товары (ЛДСП/ЛМДФ/Кромка) используют
    # человекочитаемый slug вида "man-ldsp-ultradecor-..." — колонка расширена под них.
    external_id = Column(String(160), unique=True, nullable=False, index=True)
    code = Column(String(64), nullable=True, index=True)
    name = Column(Text, nullable=False)
    category_slug = Column(String(64), nullable=True, index=True)
    category_name = Column(String(255), nullable=True)
    unit = Column(String(16), nullable=True)
    coefficient = Column(Float, default=1.0)
    price = Column(Float, nullable=True)
    quantity = Column(Float, default=0.0, nullable=False)
    in_stock = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    # Ручные товары (не из 1С) — например декоры ЛДСП/ЛМДФ с фото и ценой
    # из папки "ЛДСП_ЛМДФ_Кромка". Синхронизация с 1С их не гасит и не перезаписывает.
    is_manual = Column(Boolean, default=False, nullable=False)
    subcategory_slug = Column(String(30), nullable=True, index=True)
    brand = Column(String(120), nullable=True)
    collection = Column(String(120), nullable=True)
    size_label = Column(String(60), nullable=True)
    image_url = Column(String(500), nullable=True)
    # Путь к основному фото товара, как явно указано в 1С (первый тег <Картинка>
    # в import0_1.xml, путь относительно PRODUCT_IMAGES_DIR). Это авторитетный
    # источник — раньше фото подбиралось угадыванием по имени файла в папке
    # (см. product_image_registry.py), из-за чего у товаров с несколькими
    # картинками в 1С иногда показывалось чужое фото (см. ИЗМЕНЕНИЯ_2026-08-28.md).
    image_ref = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
