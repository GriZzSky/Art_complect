"""CommerceML product catalog parser."""
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from app.catalog.category_classifier import CategoryIndex, build_category_index
from app.catalog.commerceml_xml import NS, TAG_CATALOG, parse_commerceml_root, tag_path
from app.utils.logger import logger

TAG_PRODUCTS = "Товары"
TAG_PRODUCT = "Товар"
TAG_ID = "Ид"
TAG_NAME = "Наименование"
TAG_BASE_UNIT = "БазоваяЕдиница"
TAG_RECALC = "Пересчет"
TAG_UNIT = "Единица"
TAG_COEFFICIENT = "Коэффициент"
TAG_GROUPS = "Группы"
TAG_REQUISITE_VALUES = "ЗначенияРеквизитов"
TAG_REQUISITE_VALUE = "ЗначениеРеквизита"
REQ_CODE = "Код"
REQ_FULL_NAME = "Полное наименование"


@dataclass
class ParsedProduct:
    external_id: str
    code: str | None
    name: str
    unit: str | None
    coefficient: float
    category_slug: str | None = None
    category_name: str | None = None


def _text(element: ET.Element | None) -> str:
    return (element.text or "").strip() if element is not None else ""


def _find_requisite(product_element: ET.Element, name: str) -> str | None:
    values = product_element.find(tag_path(TAG_REQUISITE_VALUES), NS)
    if values is None:
        return None
    for requisite in values.findall(tag_path(TAG_REQUISITE_VALUE), NS):
        if _text(requisite.find(tag_path(TAG_NAME), NS)) != name:
            continue
        return _text(requisite.find(tag_path(TAG_VALUE), NS)) or None
    return None


TAG_VALUE = "Значение"


def _product_group_id(product_element: ET.Element) -> str | None:
    groups = product_element.find(tag_path(TAG_GROUPS), NS)
    if groups is None:
        return None
    return _text(groups.find(tag_path(TAG_ID), NS)) or None


def _parse_one(product_element: ET.Element, category_index: CategoryIndex | None = None) -> ParsedProduct | None:
    try:
        external_id = _text(product_element.find(tag_path(TAG_ID), NS))
        if not external_id:
            return None

        code = _find_requisite(product_element, REQ_CODE)
        name = _find_requisite(product_element, REQ_FULL_NAME) or _text(product_element.find(tag_path(TAG_NAME), NS))
        if not name:
            return None

        unit = None
        coefficient = 1.0
        base_unit = product_element.find(tag_path(TAG_BASE_UNIT), NS)
        if base_unit is not None:
            recalc = base_unit.find(tag_path(TAG_RECALC), NS)
            if recalc is not None:
                unit = _text(recalc.find(tag_path(TAG_UNIT), NS)) or None
                try:
                    coefficient = float(_text(recalc.find(tag_path(TAG_COEFFICIENT), NS)) or "1")
                except ValueError:
                    pass

        category_slug = None
        category_name = None
        if category_index is not None:
            category = category_index.resolve(_product_group_id(product_element))
            if category is not None:
                category_slug = category.slug
                category_name = category.name

        return ParsedProduct(
            external_id=external_id,
            code=code,
            name=name,
            unit=unit,
            coefficient=coefficient,
            category_slug=category_slug,
            category_name=category_name,
        )
    except Exception as exc:
        logger.exception("Product parse error: %s", exc)
        return None


def parse_products_from_file(xml_path: Path) -> Iterator[ParsedProduct]:
    root = parse_commerceml_root(xml_path)
    category_index = build_category_index(root)
    if category_index.size:
        logger.info("Loaded %d category groups from classifier", category_index.size)
    else:
        logger.warning("Classifier groups not found; falling back to keyword categories")

    catalog = root.find(tag_path(TAG_CATALOG), NS)
    if catalog is None:
        logger.error("Catalog XML does not contain a product catalog section")
        return

    products_element = catalog.find(tag_path(TAG_PRODUCTS), NS)
    if products_element is None:
        return

    for product_element in products_element.findall(tag_path(TAG_PRODUCT), NS):
        parsed_product = _parse_one(product_element, category_index)
        if parsed_product is not None:
            yield parsed_product


def parse_products_list(xml_path: Path) -> list[ParsedProduct]:
    return list(parse_products_from_file(xml_path))
