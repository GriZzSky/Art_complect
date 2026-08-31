from typing import List

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Product
from app.catalog.product_image_registry import get_product_image_url, get_product_image_url_from_ref
from app.catalog.schemas import CategoryListResponse, CategoryResponse, ProductResponse
from app.core.database import get_db

router = APIRouter(prefix="/products", tags=["catalog-products"])

# Сырая категория «ЛДСП и ХДФ» из классификатора 1С (258 товаров без фото/цены)
# скрыта из каталога — эта вкладка теперь отдаётся под витрину «ЛДСП/ЛМДФ/Кромка»
# (ручные товары + перенесённая кромка, см. product_repository.py). Товары физически
# остаются в БД (это данные 1С), просто не показываются в сайдбаре/каталоге.
HIDDEN_CATEGORY_SLUGS = {"ldsp-i-hdf"}

CATEGORY_LABELS = {
    "kley": "Клей",
    "styazhki": "Стяжки",
    "napravlyayushchie-sistemy": "Направляющие системы",
    "napravlyayushchie": "Направляющие",
    "petli": "Петли",
    "ruchki": "Ручки",
    "gazlifty": "Газлифты",
    "kromka-ldsp": "Кромка ЛДСП",
    "moyki": "Мойки",
    "smesiteli": "Смесители",
    "profili": "Профили",
    "stopory": "Стопоры",
    "polkoderzhateli": "Полкодержатели",
    "plunzhery": "Плунжеры",
    "ugolki": "Уголки",
    "sushki": "Сушки",
    "paneli-zadnie": "Панели задние",
    "krepezh": "Крепеж",
    "samorezy": "Саморезы",
    "podstavki": "Подставки",
    "nozhki": "Ножки",
    "stoleshnitsy": "Столешницы",
    "pilomaterialy": "Пиломатериалы",
    "elektroinstrument": "Электроинструмент",
    "zaglushki": "Заглушки",
    "plintusy": "Плинтусы",
    "vnutrennee-napolnenie": "Наполнение шкафов",
    "truby-flantsy": "Трубы и фланцы",
    "paneli-plity": "Панели и плиты",
    "razdvizhnye": "Раздвижные системы",
    "konstruktorskaya": "Конструкторские системы",
}


def get_category_label(slug: str | None) -> str:
    if not slug:
        return "Другое"
    return CATEGORY_LABELS.get(slug, slug.replace("-", " ").title())


def serialize_product(product: Product) -> ProductResponse:
    payload = ProductResponse.model_validate(product).model_dump()
    # Приоритет: 1) image_url — ручные товары ЛДСП/ЛМДФ/Кромка, путь задан
    # напрямую при заведении. 2) image_ref — основное фото по данным самой 1С
    # (первый <Картинка> из import0_1.xml); авторитетнее эвристики, т.к. не
    # зависит от того, как файлы отсортировались на диске — раньше это путало
    # фото у товаров с несколькими картинками в 1С. 3) get_product_image_url —
    # угадывание по external_id в имени файла, запасной вариант для товаров,
    # где 1С почему-то не прислала <Картинка>.
    payload["image_url"] = (
        product.image_url
        or get_product_image_url_from_ref(product.image_ref)
        or get_product_image_url(product.external_id)
    )
    return ProductResponse(**payload)


def _build_search_clause(query: str):
    # Каждое слово запроса должно встретиться (AND), но в любом из полей —
    # имя, код или внешний ИД (OR). Это даёт нормальный полнотекстовый поиск
    # по нескольким словам в произвольном порядке.
    terms = [term.strip() for term in query.split() if term.strip()]
    if not terms:
        return None

    term_clauses = []
    for term in terms:
        pattern = f"%{term}%"
        term_clauses.append(
            or_(
                Product.name.ilike(pattern),
                Product.code.ilike(pattern),
                Product.external_id.ilike(pattern),
            )
        )
    return and_(*term_clauses)


# Товары в наличии всегда выше отсутствующих — это первичный ключ сортировки
# и в поиске, и при просмотре категории, несмотря на алфавитный порядок.
_IN_STOCK_FIRST = case((Product.in_stock == True, 0), else_=1)


def _build_search_ordering(query: str):
    normalized = query.strip().lower()
    if not normalized:
        return [_IN_STOCK_FIRST, Product.name.asc()]

    prefix = f"{normalized}%"
    word_prefix = f"% {normalized}%"
    exact = normalized
    relevance = case(
        (func.lower(Product.code) == exact, 0),
        (func.lower(Product.name) == exact, 1),
        (func.lower(Product.name).like(prefix), 2),
        (func.lower(Product.name).like(word_prefix), 3),
        (func.lower(Product.code).like(prefix), 4),
        else_=5,
    )
    return [_IN_STOCK_FIRST, relevance, Product.name.asc()]


@router.get("", response_model=List[ProductResponse])
async def list_products(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    category: str | None = Query(None, description="?????? ?? category_slug"),
    subcategory: str | None = Query(None, description="Filter by subcategory_slug (ldsp/lmdf/kromka)"),
    brand: str | None = Query(None, description="Filter by brand (manual LDSP/LMDF products)"),
    collection: str | None = Query(None, description="Filter by collection (manual LDSP/LMDF products)"),
    q: str | None = Query(None, description="Search by name, code, or external id"),
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if active_only:
        filters.append(Product.is_active == True)
    if category:
        filters.append(Product.category_slug == category)
    if subcategory:
        filters.append(Product.subcategory_slug == subcategory)
    if brand:
        filters.append(Product.brand == brand)
    if collection:
        filters.append(Product.collection == collection)
    if q:
        search_clause = _build_search_clause(q)
        if search_clause is not None:
            filters.append(search_clause)

    count_query = select(func.count()).select_from(Product)
    if filters:
        count_query = count_query.where(*filters)
    total = (await db.execute(count_query)).scalar() or 0
    response.headers["X-Total-Count"] = str(total)

    query = select(Product)
    if filters:
        query = query.where(*filters)
    query = query.order_by(*_build_search_ordering(q or "")).offset(skip).limit(limit)

    products = (await db.execute(query)).scalars().all()
    return [serialize_product(product) for product in products]


@router.get("/categories", response_model=CategoryListResponse)
async def list_categories(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    query = select(
        Product.category_slug,
        func.max(Product.category_name),
        func.count(),
    ).select_from(Product)
    if active_only:
        query = query.where(Product.is_active == True)
    query = query.group_by(Product.category_slug)

    rows = (await db.execute(query)).all()
    items: list[CategoryResponse] = []
    total = 0
    for slug, name, count in rows:
        if slug in HIDDEN_CATEGORY_SLUGS:
            continue
        total += count or 0
        items.append(CategoryResponse(
            slug=slug or "other",
            # Имя категории берём из классификатора (category_name); для старых
            # записей без него — из словаря меток по slug.
            name=name or get_category_label(slug),
            count=int(count or 0),
        ))

    items.sort(key=lambda item: item.count, reverse=True)
    return CategoryListResponse(total=total, items=items)


@router.get("/{external_id}", response_model=ProductResponse | None)
async def get_product(external_id: str, db: AsyncSession = Depends(get_db)):
    product = (await db.execute(select(Product).where(Product.external_id == external_id))).scalars().first()
    if product is None:
        return None
    return serialize_product(product)
