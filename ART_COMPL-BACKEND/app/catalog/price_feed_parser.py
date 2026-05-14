"""CommerceML offers parser: website price and stock by product external id."""
from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET

from app.catalog.commerceml_xml import NS, TAG_OFFERS_PACKET, parse_commerceml_root, tag_path
from app.utils.logger import logger

TAG_OFFERS = "Предложения"
TAG_OFFER = "Предложение"
TAG_ID = "Ид"
TAG_PRICE_TYPES = "ТипыЦен"
TAG_PRICE_TYPE = "ТипЦены"
TAG_NAME = "Наименование"
TAG_PRICES = "Цены"
TAG_PRICE = "Цена"
TAG_PRICE_PER_UNIT = "ЦенаЗаЕдиницу"
TAG_PRICE_TYPE_ID = "ИдТипаЦены"
TAG_QUANTITY = "Количество"
WEBSITE_PRICE_NAME = "Для сайта"


@dataclass
class ParsedOffer:
    external_id: str
    price: float | None
    quantity: float
    in_stock: bool


def _text(element: ET.Element | None) -> str:
    return (element.text or "").strip() if element is not None else ""


def _parse_float(value: str | None, default: float = 0.0) -> float:
    if not value:
        return default
    try:
        return float(value.replace(",", "."))
    except ValueError:
        return default


def _resolve_price_type_id(packet_element: ET.Element) -> str | None:
    price_types = packet_element.find(tag_path(TAG_PRICE_TYPES), NS)
    if price_types is None:
        return None

    first_type_id: str | None = None
    for price_type in price_types.findall(tag_path(TAG_PRICE_TYPE), NS):
        type_id = _text(price_type.find(tag_path(TAG_ID), NS)) or None
        if first_type_id is None:
            first_type_id = type_id
        if _text(price_type.find(tag_path(TAG_NAME), NS)) == WEBSITE_PRICE_NAME:
            return type_id
    return first_type_id


def _extract_price(offer_element: ET.Element, target_price_type_id: str | None) -> float | None:
    prices = offer_element.find(tag_path(TAG_PRICES), NS)
    if prices is None:
        return None

    first_value: float | None = None
    for price_element in prices.findall(tag_path(TAG_PRICE), NS):
        normalized = _parse_float(_text(price_element.find(tag_path(TAG_PRICE_PER_UNIT), NS)), default=0.0)
        value = normalized if normalized > 0 else None
        if first_value is None:
            first_value = value
        if target_price_type_id and _text(price_element.find(tag_path(TAG_PRICE_TYPE_ID), NS)) == target_price_type_id:
            return value
    return first_value


def parse_offers_map(xml_path: Path) -> dict[str, ParsedOffer]:
    root = parse_commerceml_root(xml_path)
    packet = root.find(tag_path(TAG_OFFERS_PACKET), NS)
    if packet is None:
        logger.warning("Offers XML does not contain an offers packet: %s", xml_path)
        return {}

    offers_element = packet.find(tag_path(TAG_OFFERS), NS)
    if offers_element is None:
        logger.warning("Offers XML does not contain offers: %s", xml_path)
        return {}

    target_price_type_id = _resolve_price_type_id(packet)
    result: dict[str, ParsedOffer] = {}
    for offer_element in offers_element.findall(tag_path(TAG_OFFER), NS):
        external_id = _text(offer_element.find(tag_path(TAG_ID), NS))
        if not external_id:
            continue

        quantity = _parse_float(_text(offer_element.find(tag_path(TAG_QUANTITY), NS)), default=0.0)
        result[external_id] = ParsedOffer(
            external_id=external_id,
            price=_extract_price(offer_element, target_price_type_id),
            quantity=quantity,
            in_stock=quantity > 0,
        )
    return result
