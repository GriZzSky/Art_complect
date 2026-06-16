"""Категории каталога из классификатора CommerceML (webdata/import0_1.xml).

Раньше категория угадывалась по ключевым словам в названии (`category_rules`).
Теперь верхнеуровневая группа товара берётся напрямую из секции
``<Классификатор><Группы>``: каждый товар ссылается на свою группу через
``<Группы><Ид>``, а мы поднимаемся до группы первого уровня.
"""
import xml.etree.ElementTree as ET
from dataclasses import dataclass

from app.catalog.commerceml_xml import NS, tag_path

TAG_CLASSIFIER = "Классификатор"
TAG_GROUPS = "Группы"
TAG_GROUP = "Группа"
TAG_ID = "Ид"
TAG_NAME = "Наименование"

# Транслитерация кириллицы для построения slug категории.
_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def _text(element: ET.Element | None) -> str:
    return (element.text or "").strip() if element is not None else ""


def slugify_category(name: str) -> str:
    """Стабильный URL-безопасный slug из названия группы."""
    result: list[str] = []
    for char in (name or "").lower():
        if char in _TRANSLIT:
            result.append(_TRANSLIT[char])
        elif char.isalnum() and char.isascii():
            result.append(char)
        else:
            result.append("-")
    slug = "".join(result)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "other"


@dataclass
class CategoryInfo:
    slug: str
    name: str


class CategoryIndex:
    """Сопоставление ИД любой группы (на любом уровне) -> категория первого уровня."""

    def __init__(self, group_to_top: dict[str, CategoryInfo]):
        self._group_to_top = group_to_top

    def resolve(self, group_id: str | None) -> CategoryInfo | None:
        if not group_id:
            return None
        return self._group_to_top.get(group_id)

    @property
    def size(self) -> int:
        return len(self._group_to_top)


def _walk_group(group_el: ET.Element, top: CategoryInfo, mapping: dict[str, CategoryInfo]) -> None:
    group_id = _text(group_el.find(tag_path(TAG_ID), NS))
    if group_id:
        mapping[group_id] = top
    nested = group_el.find(tag_path(TAG_GROUPS), NS)
    if nested is not None:
        for child in nested.findall(tag_path(TAG_GROUP), NS):
            _walk_group(child, top, mapping)


def build_category_index(root: ET.Element) -> CategoryIndex:
    """Из корня import-XML строит индекс групп -> верхнеуровневая категория."""
    mapping: dict[str, CategoryInfo] = {}
    classifier = root.find(tag_path(TAG_CLASSIFIER), NS)
    if classifier is None:
        return CategoryIndex(mapping)

    groups = classifier.find(tag_path(TAG_GROUPS), NS)
    if groups is None:
        return CategoryIndex(mapping)

    for top_group in groups.findall(tag_path(TAG_GROUP), NS):
        name = _text(top_group.find(tag_path(TAG_NAME), NS))
        if not name:
            continue
        top = CategoryInfo(slug=slugify_category(name), name=name)
        _walk_group(top_group, top, mapping)

    return CategoryIndex(mapping)
