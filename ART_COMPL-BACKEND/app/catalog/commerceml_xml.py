import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"c": "urn:1C.ru:commerceml_2"}
TAG_CATALOG = "Каталог"
TAG_OFFERS_PACKET = "ПакетПредложений"


def tag_path(tag_name: str) -> str:
    return f"c:{tag_name}"


def parse_commerceml_root(xml_path: Path) -> ET.Element:
    root = ET.parse(xml_path).getroot()
    if has_known_catalog_nodes(root):
        return root

    raw_bytes = xml_path.read_bytes()
    for encoding in ("cp1251", "windows-1251"):
        try:
            decoded = raw_bytes.decode(encoding)
            fallback_root = ET.fromstring(decoded)
            if has_known_catalog_nodes(fallback_root):
                return fallback_root
        except Exception:
            continue
    return root


def has_known_catalog_nodes(root: ET.Element) -> bool:
    if root.find(tag_path(TAG_CATALOG), NS) is not None:
        return True
    if root.find(tag_path(TAG_OFFERS_PACKET), NS) is not None:
        return True
    return False
