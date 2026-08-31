// АРТ-КОМПЛЕКТ - Main JavaScript File

// Базовый URL API бэкенда (можно переопределить в HTML: window.ART_COMPL_API_BASE = '...')
// По умолчанию берется текущий домен, а для локальной разработки — 127.0.0.1:8001
const fallbackOrigin = typeof window !== 'undefined'
    && window.location
    && window.location.origin
    && window.location.origin !== 'null'
    ? window.location.origin
    : 'http://127.0.0.1:8001';
const API_BASE = typeof window !== 'undefined' && window.ART_COMPL_API_BASE
    ? window.ART_COMPL_API_BASE
    : fallbackOrigin;
const CATALOG_PAGE_SIZE = 12;
// Категория «ЛДСП/ЛМДФ/Кромка» — витрина с пошаговым выбором бренда/коллекции
// вместо обычной сетки (см. LdspLmdfStepper ниже). Slug совпадает с бэкендом
// (app/catalog/product_repository.py, LDSP_LMDF_KROMKA_CATEGORY_SLUG).
const LDSP_LMDF_KROMKA_SLUG = 'ldsp-lmdf-kromka';

// ==========================================
// 1. КОРЗИНА (Cart Management)
// ==========================================
class ShoppingCart {
    constructor() {
        this.items = JSON.parse(localStorage.getItem('cart')) || [];
        this.init();
    }

    init() {
        this.updateCartBadge();
        this.renderCartItems();
    }

    addItem(product) {
        const existingItem = this.items.find(item => item.id === product.id);
        
        if (existingItem) {
            existingItem.quantity++;
        } else {
            this.items.push({
                ...product,
                quantity: 1
            });
        }
        
        this.saveCart();
        this.showNotification('Товар добавлен в корзину!');
        this.updateCartBadge();
    }

    removeItem(productId) {
        this.items = this.items.filter(item => item.id !== productId);
        this.saveCart();
        this.renderCartItems();
        this.updateCartBadge();
    }

    updateQuantity(productId, newQuantity) {
        const item = this.items.find(item => item.id === productId);
        if (item) {
            item.quantity = Math.max(1, newQuantity);
            this.saveCart();
            this.renderCartItems();
        }
    }

    getTotal() {
        return this.items.reduce((total, item) => total + (item.price || 0) * item.quantity, 0);
    }

    saveCart() {
        localStorage.setItem('cart', JSON.stringify(this.items));
    }

    updateCartBadge() {
        const badge = document.querySelector('.cart-badge');
        const totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
        
        if (badge) {
            badge.textContent = totalItems;
            badge.style.display = totalItems > 0 ? 'flex' : 'none';
        }
    }

    renderCartItems() {
        const cartContainer = document.getElementById('cart-items-container');
        const cartSummary = document.getElementById('cart-summary');
        
        if (!cartContainer) return;

        if (this.items.length === 0) {
            cartContainer.innerHTML = `
                <div class="alert alert-info text-center">
                    <h4>Корзина пуста</h4>
                    <p>Добавьте товары из <a href="/catalog">каталога</a></p>
                </div>
            `;
            if (cartSummary) cartSummary.style.display = 'none';
            return;
        }

        cartContainer.innerHTML = this.items.map(item => {
            const priceLabel = (item.price && item.price > 0) ? formatMoney(item.price) : 'Цена по запросу';
            const subtotal = (item.price && item.price > 0) ? formatMoney(item.price * item.quantity) : 'По запросу';
            const imgHtml = item.image
                ? `<img src="${item.image}" alt="${item.name}" class="cart-item-image">`
                : '<div class="cart-item-image cart-item-no-image"><i class="fas fa-box"></i></div>';
            return `
            <div class="cart-item" data-id="${escapeHtml(item.id)}">
                ${imgHtml}
                <div class="cart-item-info">
                    <h3>${escapeHtml(item.name)}</h3>
                    <p style="color: #666; font-size: 14px;">${priceLabel} ${item.quantity > 1 ? '× ' + item.quantity : ''}</p>
                </div>
                <div class="quantity-control">
                    <button class="quantity-btn" onclick="cart.updateQuantity('${escapeHtml(item.id)}', ${item.quantity - 1})">−</button>
                    <span class="quantity-value">${item.quantity}</span>
                    <button class="quantity-btn" onclick="cart.updateQuantity('${escapeHtml(item.id)}', ${item.quantity + 1})">+</button>
                </div>
                <div>
                    <div style="font-size: 20px; font-weight: bold; color: #12142B; margin-bottom: 10px;">${subtotal}</div>
                    <button class="btn-remove" onclick="cart.removeItem('${escapeHtml(item.id)}')">🗑️</button>
                </div>
            </div>
            `;
        }).join('');

        if (cartSummary) {
            const totalPrice = this.getTotal();
            const totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
            const hasRequestPrice = this.items.some(item => !item.price || item.price === 0);
            const totalLabel = hasRequestPrice && totalPrice === 0 ? 'По запросу' : formatMoney(totalPrice);
            cartSummary.innerHTML = `
                <div style="background: white; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
                    <div class="summary-row">
                        <span>Товары (${totalItems} шт.)</span>
                        <span>${totalLabel}</span>
                    </div>
                    <div class="summary-row total">
                        <span>Сумма всех товаров:</span>
                        <span>${totalLabel}</span>
                    </div>
                </div>
                <button class="btn btn-yellow" style="width: 100%; padding: 18px; font-size: 18px;" onclick="cart.checkout()">
                    Оформить заказ
                </button>
            `;
            cartSummary.style.display = 'block';
        }
    }

    openCheckoutModal() {
        const modalEl = document.getElementById('checkout-modal');
        if (!modalEl) return;

        if (modalEl.classList.contains('product-modal')) {
            if (!modalEl.dataset.bound) {
                const closeBtn = modalEl.querySelector('.modal-close');
                const cancelBtn = modalEl.querySelector('.checkout-cancel-btn');

                if (closeBtn) {
                    closeBtn.addEventListener('click', () => this.closeCheckoutModal());
                }
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => this.closeCheckoutModal());
                }
                modalEl.addEventListener('click', (event) => {
                    if (event.target === modalEl) this.closeCheckoutModal();
                });
                modalEl.dataset.bound = 'true';
            }

            modalEl.style.display = 'flex';
            modalEl.classList.add('show');
            modalEl.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
            return;
        }

        if (window.bootstrap && window.bootstrap.Modal) {
            const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
            return;
        }

        modalEl.classList.add('show');
        modalEl.style.display = 'block';
        modalEl.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    }

    closeCheckoutModal() {
        const modalEl = document.getElementById('checkout-modal');
        if (!modalEl) return;

        if (modalEl.classList.contains('product-modal')) {
            modalEl.classList.remove('show');
            modalEl.style.display = 'none';
            modalEl.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
            return;
        }

        if (window.bootstrap && window.bootstrap.Modal) {
            const modal = window.bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            return;
        }

        modalEl.classList.remove('show');
        modalEl.style.display = 'none';
        modalEl.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
    }

    checkout() {
        if (this.items.length === 0) {
            alert('Корзина пуста!');
            return;
        }

        this.openCheckoutModal();
    }

    showNotification(message) {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = 'cart-notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        // Показываем с анимацией
        setTimeout(() => notification.classList.add('show'), 10);

        // Скрываем через 3 секунды
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Инициализация корзины
const cart = new ShoppingCart();

// ==========================================
// 2. СЛАЙДЕР НА ГЛАВНОЙ СТРАНИЦЕ
// ==========================================
class HeroSlider {
    constructor() {
        this.currentSlide = 0;
        this.slides = [
            {
                title: 'Безупречная механика',
                subtitle: 'Надежная фурнитура премиум-сегмента. Индивидуальный подбор комплектующих.'
            },
            {
                title: 'Профессиональные решения',
                subtitle: 'Комплексное оснащение для производителей мебели<br>Надежность проверенная временем'
            },
            {
                title: 'Эксклюзивный ассортимент',
                subtitle: 'Прямые поставки от ведущих европейских брендов<br>Гарантия качества и доступные цены'
            }
        ];
        this.init();
    }

    init() {
        this.renderSlides();
        this.startAutoplay();
        this.attachEventListeners();
    }

    renderSlides() {
        const heroContent = document.querySelector('.hero-content');
        if (!heroContent) return;

        const slide = this.slides[this.currentSlide];
        heroContent.innerHTML = `
            <h1 class="fade-in">${slide.title}</h1>
            <p class="fade-in">${slide.subtitle}</p>
        `;

        // Обновляем индикаторы
        document.querySelectorAll('.slider-dot').forEach((dot, index) => {
            dot.classList.toggle('active', index === this.currentSlide);
        });
    }

    nextSlide() {
        this.currentSlide = (this.currentSlide + 1) % this.slides.length;
        this.renderSlides();
    }

    prevSlide() {
        this.currentSlide = (this.currentSlide - 1 + this.slides.length) % this.slides.length;
        this.renderSlides();
    }

    goToSlide(index) {
        this.currentSlide = index;
        this.renderSlides();
    }

    startAutoplay() {
        this.autoplayInterval = setInterval(() => this.nextSlide(), 5000);
    }

    stopAutoplay() {
        clearInterval(this.autoplayInterval);
    }

    attachEventListeners() {
        const nextBtn = document.querySelector('.slider-arrow.next');
        const prevBtn = document.querySelector('.slider-arrow.prev');
        const dots = document.querySelectorAll('.slider-dot');

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.stopAutoplay();
                this.nextSlide();
                this.startAutoplay();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.stopAutoplay();
                this.prevSlide();
                this.startAutoplay();
            });
        }

        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                this.stopAutoplay();
                this.goToSlide(index);
                this.startAutoplay();
            });
        });

        // Свайп-навигация на тач-устройствах
        const hero = document.querySelector('.hero');
        if (hero) {
            let touchStartX = 0;
            hero.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });
            hero.addEventListener('touchend', (e) => {
                const dx = e.changedTouches[0].screenX - touchStartX;
                if (Math.abs(dx) < 40) return; // игнорируем случайные касания
                this.stopAutoplay();
                if (dx < 0) this.nextSlide(); else this.prevSlide();
                this.startAutoplay();
            }, { passive: true });
        }
    }
}

// ==========================================
// 3. ФИЛЬТРАЦИЯ ТОВАРОВ В КАТАЛОГЕ
// ==========================================
class ProductFilter {
    constructor() {
        this.searchInput = document.getElementById('product-search');
        this.categoryFilters = document.querySelectorAll('.filter-group ul li');
        this.products = document.querySelectorAll('.product-card');
        this.init();
    }

    init() {
        if (!this.searchInput) return;

        this.searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            // Поиск на сервере работает поверх обычной сетки — если открыт
            // пошаговый выбор «ЛДСП/ЛМДФ/Кромка», сворачиваем его и возвращаем сетку.
            if (window.ldspStepper) window.ldspStepper.deactivate();
            // Поиск идёт на сервере (параметр q с debounce). Фронтовый фильтр —
            // только запасной путь, если каталог не загружен с API.
            if (window.catalogLoader && typeof window.catalogLoader.setSearch === 'function') {
                window.catalogLoader.setSearch(searchTerm);
                return;
            }
            this.filterProducts(searchTerm.toLowerCase());
        });
        // Категории обрабатываются в initCatalogSidebar (список грузится с бэкенда).
    }

    refreshProducts() {
        this.products = document.querySelectorAll('.product-card');
    }

    showAll() {
        this.products.forEach(product => {
            product.style.display = '';
        });
    }

    filterProducts(searchTerm) {
        this.products.forEach(product => {
            const nameEl = product.querySelector('.product-name');
            const codeEl = product.querySelector('.product-code');
            const name = (nameEl ? nameEl.textContent : '') + (codeEl ? ' ' + codeEl.textContent : '');
            const isVisible = name.toLowerCase().includes(searchTerm);
            product.style.display = isVisible ? 'block' : 'none';
        });
    }
}

// Разметка пагинации — общая для обычной сетки каталога (CatalogLoader) и для
// карточек внутри шагов «ЛДСП/ЛМДФ/Кромка» (LdspLmdfStepper).
function buildPaginationHtml(currentPage, totalPages) {
    const prevDisabled = currentPage <= 1;
    const showNext = currentPage < totalPages;

    const items = [];
    const left = Math.max(1, currentPage - 2);
    const right = Math.min(totalPages, currentPage + 2);

    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) items.push(i);
    } else {
        if (left > 1) items.push(1);
        if (left > 2) items.push('...');
        for (let i = left; i <= right; i++) items.push(i);
        if (right < totalPages - 1) items.push('...');
        if (right < totalPages) items.push(totalPages);
    }

    const pageBtns = items.map(item => {
        if (item === '...') {
            return '<span class="catalog-page-ellipsis">. . .</span>';
        }
        const active = item === currentPage ? ' catalog-page-btn-active' : '';
        return `<button type="button" class="btn catalog-page-btn${active}" data-page="${item}">${item}</button>`;
    }).join('');

    const svgPrev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    const svgNext = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    return `
        <div class="catalog-pagination-inner">
            <button type="button" class="btn btn-pagination-arrow" aria-label="Предыдущая" ${prevDisabled ? 'disabled' : ''} data-dir="prev">${svgPrev}</button>
            <div class="catalog-page-btns">${pageBtns}</div>
            <button type="button" class="btn btn-pagination-arrow" aria-label="Следующая" ${showNext ? '' : 'disabled'} data-dir="next">${svgNext}</button>
        </div>
    `;
}

// Клик по кнопке пагинации (prev/next/номер страницы) -> номер новой страницы,
// либо null, если клик мимо (или по недоступной кнопке). Общий обработчик для
// CatalogLoader и LdspLmdfStepper.
function resolvePaginationClick(e, currentPage) {
    const pageBtn = e.target.closest('.catalog-page-btn');
    if (pageBtn && pageBtn.dataset.page) {
        const page = parseInt(pageBtn.dataset.page, 10);
        return page >= 1 && page !== currentPage ? page : null;
    }
    const prevBtn = e.target.closest('[data-dir="prev"]');
    if (prevBtn && !prevBtn.disabled) {
        return currentPage > 1 ? currentPage - 1 : null;
    }
    const nextBtn = e.target.closest('[data-dir="next"]');
    if (nextBtn && !nextBtn.disabled) {
        return currentPage + 1;
    }
    return null;
}

// ==========================================
// 3.1. ЗАГРУЗКА КАТАЛОГА С API (постранично)
// ==========================================
class CatalogLoader {
    constructor() {
        this.grid = document.getElementById('products-grid');
        this.paginationEl = document.getElementById('catalog-pagination');
        this.loadingEl = document.getElementById('catalog-loading');
        this.searchInput = document.getElementById('product-search');
        this.currentPage = 1;
        this.totalCount = 0;
        this.currentCategory = null;
        this.currentSearch = '';
        this.searchDebounceTimer = null;
        if (this.grid) {
            if (this.searchInput) {
                this.currentSearch = this.searchInput.value.trim();
            }
            this.loadPage(1);
            this.paginationEl && this.paginationEl.addEventListener('click', this.onPaginationClick.bind(this));
        }
    }

    setCategory(categorySlug) {
        this.currentCategory = categorySlug === 'all' || !categorySlug ? null : categorySlug;
        this.loadPage(1);
    }

    setSearch(searchTerm) {
        this.currentSearch = searchTerm.trim();
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }
        this.searchDebounceTimer = setTimeout(() => {
            this.loadPage(1);
        }, 250);
    }

    onPaginationClick(e) {
        const page = resolvePaginationClick(e, this.currentPage);
        if (page !== null) {
            e.preventDefault();
            this.loadPage(page);
        }
    }

    async loadPage(page) {
        if (!this.grid) return;
        if (this.loadingEl) this.loadingEl.style.display = 'block';
        const skip = (page - 1) * CATALOG_PAGE_SIZE;
        const params = new URLSearchParams({ skip: String(skip), limit: String(CATALOG_PAGE_SIZE), active_only: 'true' });
        if (this.currentCategory) params.set('category', this.currentCategory);
        if (this.currentSearch) params.set('q', this.currentSearch);
        try {
            const res = await fetch(`${API_BASE}/api/products?${params.toString()}`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const totalHeader = res.headers.get('X-Total-Count');
            if (totalHeader !== null) this.totalCount = parseInt(totalHeader, 10) || 0;
            const list = await res.json();
            this.currentPage = page;
            this.grid.innerHTML = '';
            this.renderCards(list);
            this.renderPagination();
            if (window.catalogProductFilter) window.catalogProductFilter.refreshProducts();
        } catch (err) {
            const reason = err.message || (err.name === 'TypeError' ? 'нет связи с сервером' : String(err));
            this.grid.innerHTML = '<div class="alert alert-danger">Не удалось загрузить каталог. Проверьте, что бэкенд запущен (<code>' + API_BASE + '</code>).<br><small>Причина: ' + escapeHtml(reason) + '</small></div>';
            if (this.paginationEl) this.paginationEl.innerHTML = '';
        }
        if (this.loadingEl) this.loadingEl.style.display = 'none';
    }

    renderCards(products) {
        if (!this.grid) return;
        if (!products.length) {
            this.grid.innerHTML = this.currentSearch
                ? '<div class="catalog-empty">По вашему запросу ничего не найдено.</div>'
                : '<div class="catalog-empty">В этой категории пока нет товаров.</div>';
            return;
        }
        const fragment = document.createDocumentFragment();
        products.forEach(p => {
            const card = document.createElement('div');
            card.className = 'product-card';
            const name = p.name || 'Без названия';
            const code = p.code ? String(p.code) : '';
            const unit = p.unit ? `Ед.: ${p.unit}` : '';
            const desc = [code, unit].filter(Boolean).join(' · ') || 'Высококачественная фурнитура для мебели.';
            const inStock = p.in_stock !== false;
            const price = typeof p.price === 'number' ? p.price : 0;
            const hasPrice = inStock && price > 0;
            const imageUrl = resolveApiUrl(p.image_url || '');
            const imageHtml = imageUrl
                ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" class="product-image" loading="lazy">`
                : '<div class="product-image product-image-placeholder"><i class="fas fa-box"></i><span>Нет изображения</span></div>';
            const badgeLabel = inStock ? 'В наличии' : 'Нет в наличии';
            const badgeClass = inStock ? 'product-badge' : 'product-badge product-badge-out';
            const priceHtml = !inStock
                ? '<span class="price-unavailable">Нет в наличии</span>'
                : `<span class="price-current">${hasPrice ? formatPrice(price) : 'Цена по запросу'}</span>`;
            card.innerHTML = `
                <div class="${badgeClass}">${badgeLabel}</div>
                ${imageHtml}
                <div class="product-info">
                    <h3 class="product-name">${escapeHtml(name)}</h3>
                    ${code ? `<p class="product-code text-muted small">Артикул: ${escapeHtml(code)}</p>` : ''}
                    <div class="product-price">${priceHtml}</div>
                    <div class="product-actions">
                        <button class="btn btn-orange btn-small btn-add-cart" data-id="${escapeHtml(p.external_id)}" data-name="${escapeHtml(name)}" ${inStock ? '' : 'disabled'}>
                            <i class="fas fa-shopping-cart"></i> ${inStock ? 'В корзину' : 'Нет в наличии'}
                        </button>
                        <button class="btn btn-yellow btn-small btn-details" data-name="${escapeHtml(name)}" data-desc="${escapeHtml(desc)}" data-id="${escapeHtml(p.external_id)}">
                            <i class="fas fa-info-circle"></i> Подробно
                        </button>
                    </div>
                </div>
            `;
            const addBtn = card.querySelector('.btn-add-cart');
            if (inStock) {
                addBtn.addEventListener('click', () => {
                    addToCart(p.external_id, name, hasPrice ? price : 0, imageUrl);
                });
            }
            card.querySelector('.btn-details').addEventListener('click', () => {
                showProductModal(name, hasPrice ? price : 0, imageUrl, desc, p.external_id, inStock);
            });
            const imgEl = card.querySelector('img.product-image');
            if (imgEl) imgEl.addEventListener('error', () => handleProductImageError(imgEl), { once: true });
            fragment.appendChild(card);
        });
        this.grid.appendChild(fragment);
    }

    renderPagination() {
        if (!this.paginationEl) return;
        const totalPages = Math.max(1, Math.ceil(this.totalCount / CATALOG_PAGE_SIZE));
        this.paginationEl.innerHTML = buildPaginationHtml(this.currentPage, totalPages);
    }
}

// ==========================================
// 3.2. БОКОВОЙ СПИСОК КАТЕГОРИЙ (из классификатора, с бэкенда)
// ==========================================
async function initCatalogSidebar() {
    const list = document.getElementById('category-filter-list');
    if (!list) return;

    // Загружаем реальные категории каталога и счётчики товаров.
    try {
        const res = await fetch(`${API_BASE}/api/products/categories?active_only=true`);
        if (res.ok) {
            const data = await res.json();
            const items = Array.isArray(data.items) ? data.items : [];

            const allLi = list.querySelector('li[data-filter="all"]');
            if (allLi && !allLi.querySelector('.filter-count')) {
                const badge = document.createElement('span');
                badge.className = 'filter-count';
                badge.textContent = data.total || 0;
                allLi.appendChild(badge);
            }

            const fragment = document.createDocumentFragment();
            items.forEach(cat => {
                if (!cat || !cat.slug) return;
                const li = document.createElement('li');
                li.dataset.filter = cat.slug;
                li.innerHTML = `<span>${escapeHtml(cat.name || cat.slug)}</span><span class="filter-count">${cat.count || 0}</span>`;
                fragment.appendChild(li);
            });
            list.appendChild(fragment);
        }
    } catch (err) {
        // Сайдбар остаётся с пунктом «Все товары»; каталог всё равно работает.
    }

    // Делегирование кликов: работает и для динамически добавленных пунктов.
    list.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-filter]');
        if (!li) return;
        list.querySelectorAll('li.active').forEach(el => el.classList.remove('active'));
        li.classList.add('active');

        const slug = li.dataset.filter || 'all';
        const searchInput = document.getElementById('product-search');
        if (searchInput) searchInput.value = '';

        // «ЛДСП/ЛМДФ/Кромка» — не обычная сетка, а пошаговый выбор бренда/коллекции.
        if (slug === LDSP_LMDF_KROMKA_SLUG && window.ldspStepper) {
            window.ldspStepper.activate();
            return;
        }
        if (window.ldspStepper) window.ldspStepper.deactivate();

        if (window.catalogLoader) {
            window.catalogLoader.currentSearch = '';
            window.catalogLoader.setCategory(slug);
        }

        // На мобильных сворачиваем список категорий и показываем товары,
        // чтобы выбор давал понятный результат (а не оставлял длинный список).
        if (window.innerWidth <= 767) {
            const fg = li.closest('.filter-group');
            if (fg) {
                fg.classList.remove('is-open');
                const tgl = fg.querySelector('.filter-group-toggle');
                if (tgl) tgl.setAttribute('aria-expanded', 'false');
            }
            const grid = document.getElementById('products-grid');
            if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

// ==========================================
// 3.3. «ЛДСП/ЛМДФ/КРОМКА» — ПОШАГОВЫЙ ВЫБОР БРЕНДА/КОЛЛЕКЦИИ/ДЕКОРА
// ==========================================
// Структура повторяет реальные папки с фото (см. ART_COMPL-BACKEND/scripts/seed_ldsp_lmdf_manual.py,
// FOLDER_MAP) — единственное место, где она захардкожена на фронте, т.к. это
// витрина конкретных брендов, а не данные из 1С.
const LDSP_TREE = {
    ldsp: {
        label: 'ЛДСП',
        brands: [
            { label: 'Lamarty / ЮГРА', collections: null },
            { label: 'Ultradecor', collections: [
                { label: 'G-серия' },
                { label: 'Standart' },
            ] },
        ],
    },
    lmdf: {
        label: 'ЛМДФ',
        brands: [
            { label: 'Moonlight', collections: [
                { label: 'Color' },
                { label: 'Rocks' },
                { label: 'Wood' },
            ] },
        ],
    },
    kromka: { label: 'Кромка', flat: true },
};

class LdspLmdfStepper {
    constructor() {
        this.root = document.getElementById('ldsp-stepper');
        this.breadcrumbsEl = document.getElementById('ldsp-breadcrumbs');
        this.gridEl = document.getElementById('ldsp-step-grid');
        this.paginationEl = document.getElementById('ldsp-step-pagination');
        // Состояние текущего листа (карточек), нужно чтобы перерисовать при смене страницы.
        this.leafFilterParams = null;
        this.leafParentCrumbs = null;
        this.leafLabel = null;
        this.leafPage = 1;
        this.leafTotal = 0;
        if (this.paginationEl) {
            this.paginationEl.addEventListener('click', this.onPaginationClick.bind(this));
        }
    }

    onPaginationClick(e) {
        const page = resolvePaginationClick(e, this.leafPage);
        if (page !== null) {
            e.preventDefault();
            this.loadLeaf(this.leafFilterParams, this.leafParentCrumbs, this.leafLabel, page);
        }
    }

    activate() {
        if (!this.root) return;
        this.root.style.display = 'block';
        const grid = document.getElementById('products-grid');
        const pagination = document.getElementById('catalog-pagination');
        if (grid) grid.style.display = 'none';
        if (pagination) pagination.style.display = 'none';
        this.renderStep1();
    }

    deactivate() {
        if (!this.root || this.root.style.display === 'none') return;
        this.root.style.display = 'none';
        const grid = document.getElementById('products-grid');
        const pagination = document.getElementById('catalog-pagination');
        if (grid) grid.style.display = '';
        if (pagination) pagination.style.display = '';
    }

    renderBreadcrumbs(items) {
        this.breadcrumbsEl.innerHTML = '';
        const fragment = document.createDocumentFragment();
        items.forEach((item, idx) => {
            const isLast = idx === items.length - 1;
            const el = document.createElement(isLast ? 'span' : 'button');
            if (!isLast) el.type = 'button';
            el.className = 'ldsp-breadcrumb' + (isLast ? ' ldsp-breadcrumb-current' : '');
            el.textContent = item.text;
            if (!isLast && item.onClick) el.addEventListener('click', item.onClick);
            fragment.appendChild(el);
            if (!isLast) {
                const sep = document.createElement('span');
                sep.className = 'ldsp-breadcrumb-sep';
                sep.textContent = '›';
                fragment.appendChild(sep);
            }
        });
        this.breadcrumbsEl.appendChild(fragment);
    }

    renderTiles(tiles) {
        this.gridEl.className = 'ldsp-step-grid ldsp-step-grid-tiles';
        this.gridEl.innerHTML = '';
        if (this.paginationEl) this.paginationEl.innerHTML = '';
        const fragment = document.createDocumentFragment();
        tiles.forEach(tile => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'ldsp-tile';
            el.innerHTML = `<span class="ldsp-tile-label">${escapeHtml(tile.label)}</span>`;
            el.addEventListener('click', tile.onClick);
            fragment.appendChild(el);
        });
        this.gridEl.appendChild(fragment);
    }

    renderStep1() {
        this.renderBreadcrumbs([{ text: 'ЛДСП/ЛМДФ/Кромка' }]);
        this.renderTiles([
            { label: 'ЛДСП', onClick: () => this.enterMaterial('ldsp') },
            { label: 'ЛМДФ', onClick: () => this.enterMaterial('lmdf') },
            { label: 'Кромка', onClick: () => this.enterMaterial('kromka') },
        ]);
    }

    rootCrumb() {
        return { text: 'ЛДСП/ЛМДФ/Кромка', onClick: () => this.renderStep1() };
    }

    enterMaterial(materialSlug) {
        const node = LDSP_TREE[materialSlug];
        if (node.flat) {
            // Кромка — сразу список, без шагов бренда/коллекции.
            this.loadLeaf({ subcategory: materialSlug }, [this.rootCrumb()], node.label);
            return;
        }
        if (node.brands.length === 1) {
            // Единственный бренд в материале — шаг выбора бренда не нужен.
            this.enterBrand(materialSlug, node.brands[0]);
            return;
        }
        this.renderBreadcrumbs([this.rootCrumb(), { text: node.label }]);
        this.renderTiles(node.brands.map(brand => ({
            label: brand.label,
            onClick: () => this.enterBrand(materialSlug, brand),
        })));
    }

    enterBrand(materialSlug, brand) {
        const node = LDSP_TREE[materialSlug];
        const crumbs = [this.rootCrumb()];
        if (node.brands.length > 1) {
            crumbs.push({ text: node.label, onClick: () => this.enterMaterial(materialSlug) });
        }
        if (!brand.collections) {
            this.loadLeaf({ subcategory: materialSlug, brand: brand.label }, crumbs, brand.label);
            return;
        }
        this.renderBreadcrumbs(crumbs.concat([{ text: brand.label }]));
        this.renderTiles(brand.collections.map(col => ({
            label: col.label,
            onClick: () => this.loadLeaf(
                { subcategory: materialSlug, brand: brand.label, collection: col.label },
                crumbs.concat([{ text: brand.label, onClick: () => this.enterBrand(materialSlug, brand) }]),
                col.label
            ),
        })));
    }

    async loadLeaf(filterParams, parentCrumbs, leafLabel, page = 1) {
        // Запоминаем — нужно, чтобы клик по пагинации мог перезапросить ту же выборку.
        this.leafFilterParams = filterParams;
        this.leafParentCrumbs = parentCrumbs;
        this.leafLabel = leafLabel;
        this.leafPage = page;

        this.renderBreadcrumbs(parentCrumbs.concat(leafLabel ? [{ text: leafLabel }] : []));
        this.gridEl.className = 'ldsp-step-grid';
        this.gridEl.innerHTML = '<div class="catalog-loading">Загрузка…</div>';
        if (this.paginationEl) this.paginationEl.innerHTML = '';

        const skip = (page - 1) * CATALOG_PAGE_SIZE;
        const params = new URLSearchParams({
            category: LDSP_LMDF_KROMKA_SLUG,
            skip: String(skip),
            limit: String(CATALOG_PAGE_SIZE),
            active_only: 'true',
        });
        if (filterParams.subcategory) params.set('subcategory', filterParams.subcategory);
        if (filterParams.brand) params.set('brand', filterParams.brand);
        if (filterParams.collection) params.set('collection', filterParams.collection);
        try {
            const res = await fetch(`${API_BASE}/api/products?${params.toString()}`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const totalHeader = res.headers.get('X-Total-Count');
            this.leafTotal = totalHeader !== null ? (parseInt(totalHeader, 10) || 0) : 0;
            const list = await res.json();
            this.renderLeafCards(list, filterParams.subcategory === 'kromka');
            this.renderLeafPagination();
        } catch (err) {
            this.gridEl.innerHTML = '<div class="alert alert-danger">Не удалось загрузить список товаров.</div>';
        }
    }

    renderLeafPagination() {
        if (!this.paginationEl) return;
        const totalPages = Math.max(1, Math.ceil(this.leafTotal / CATALOG_PAGE_SIZE));
        this.paginationEl.innerHTML = totalPages > 1 ? buildPaginationHtml(this.leafPage, totalPages) : '';
    }

    renderLeafCards(products, isKromka) {
        if (!products.length) {
            this.gridEl.innerHTML = '<div class="catalog-empty">Пока нет товаров в этом разделе.</div>';
            return;
        }
        const fragment = document.createDocumentFragment();
        products.forEach(p => {
            const name = p.name || 'Без названия';
            const meta = [p.brand, p.collection, p.size_label].filter(Boolean).join(' · ');
            const price = typeof p.price === 'number' ? p.price : 0;
            const inStock = p.in_stock !== false;
            const imageUrl = resolveApiUrl(p.image_url || '');
            const imageHtml = imageUrl
                ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" class="product-image" loading="lazy">`
                : '<div class="product-image product-image-placeholder"><i class="fas fa-box"></i><span>Нет изображения</span></div>';

            // По просьбе заказчика: у кромки не показываем «в наличии»/«нет в наличии» — просто список.
            const badgeHtml = isKromka
                ? ''
                : `<div class="${inStock ? 'product-badge' : 'product-badge product-badge-out'}">${inStock ? 'В наличии' : 'Нет в наличии'}</div>`;
            const priceHtml = (!isKromka && !inStock)
                ? '<span class="price-unavailable">Нет в наличии</span>'
                : `<span class="price-current">${price > 0 ? formatPrice(price) : 'Цена по запросу'}</span>`;

            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                ${badgeHtml}
                ${imageHtml}
                <div class="product-info">
                    <h3 class="product-name">${escapeHtml(name)}</h3>
                    ${meta ? `<p class="product-code text-muted small">${escapeHtml(meta)}</p>` : ''}
                    <div class="product-price">${priceHtml}</div>
                    <div class="product-actions">
                        <button class="btn btn-orange btn-small btn-add-cart" ${(!isKromka && !inStock) ? 'disabled' : ''}>
                            <i class="fas fa-shopping-cart"></i> ${(!isKromka && !inStock) ? 'Нет в наличии' : 'В корзину'}
                        </button>
                        <button class="btn btn-yellow btn-small btn-details">
                            <i class="fas fa-info-circle"></i> Подробно
                        </button>
                    </div>
                </div>
            `;
            const addBtn = card.querySelector('.btn-add-cart');
            if (isKromka || inStock) {
                addBtn.addEventListener('click', () => addToCart(p.external_id, name, price > 0 ? price : 0, imageUrl));
            }
            card.querySelector('.btn-details').addEventListener('click', () => {
                if (p.is_manual) {
                    // У ручных товаров (ЛДСП/ЛМДФ) есть постоянная страница — на неё указывает QR.
                    window.location.href = `/product.html?id=${encodeURIComponent(p.external_id)}`;
                } else {
                    showProductModal(name, price > 0 ? price : 0, imageUrl, meta, p.external_id, inStock);
                }
            });
            const imgEl = card.querySelector('img.product-image');
            if (imgEl) imgEl.addEventListener('error', () => handleProductImageError(imgEl), { once: true });
            fragment.appendChild(card);
        });
        this.gridEl.innerHTML = '';
        this.gridEl.appendChild(fragment);
    }
}

// ==========================================
// 3.4. ПОСТОЯННАЯ СТРАНИЦА ТОВАРА (product.html) — для QR-кодов ЛДСП/ЛМДФ
// ==========================================
async function initProductDetailPage() {
    const root = document.getElementById('product-detail-root');
    if (!root) return;

    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
        root.innerHTML = '<div class="alert alert-danger">Товар не указан.</div>';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/products/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const p = await res.json();
        if (!p) {
            root.innerHTML = '<div class="alert alert-danger">Товар не найден.</div>';
            return;
        }

        const name = p.name || 'Без названия';
        document.title = `${name} — АРТ-КОМПЛЕКТ`;
        const titleTag = document.getElementById('product-title-tag');
        if (titleTag) titleTag.textContent = document.title;

        const crumbs = document.getElementById('product-breadcrumbs');
        if (crumbs) {
            crumbs.innerHTML = `
                <a href="/catalog" class="ldsp-breadcrumb">Каталог</a>
                <span class="ldsp-breadcrumb-sep">›</span>
                <a href="/catalog#ldsp-lmdf-kromka" class="ldsp-breadcrumb">ЛДСП/ЛМДФ/Кромка</a>
                <span class="ldsp-breadcrumb-sep">›</span>
                <span class="ldsp-breadcrumb-current">${escapeHtml(name)}</span>
            `;
        }

        const price = typeof p.price === 'number' ? p.price : 0;
        const inStock = p.in_stock !== false;
        const imageUrl = resolveApiUrl(p.image_url || '');
        const meta = [p.brand, p.collection, p.size_label].filter(Boolean).join(' · ');
        const imageHtml = imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" class="product-detail-image">`
            : '<div class="product-detail-image product-image-placeholder"><i class="fas fa-box"></i><span>Нет изображения</span></div>';

        root.innerHTML = `
            <div class="product-detail">
                <div class="product-detail-media">
                    ${imageHtml}
                </div>
                <div class="product-detail-info">
                    <h1>${escapeHtml(name)}</h1>
                    ${meta ? `<p class="product-detail-meta">${escapeHtml(meta)}</p>` : ''}
                    <div class="product-detail-price">
                        ${!inStock ? '<span class="price-unavailable">Нет в наличии</span>' : `<span class="price-current">${price > 0 ? formatPrice(price) : 'Цена по запросу'}</span>`}
                    </div>
                    <button class="btn btn-orange" id="product-detail-add-cart" ${inStock ? '' : 'disabled'}>
                        <i class="fas fa-shopping-cart"></i> ${inStock ? 'В корзину' : 'Нет в наличии'}
                    </button>
                </div>
            </div>
        `;

        const addBtn = document.getElementById('product-detail-add-cart');
        if (addBtn && inStock) {
            addBtn.addEventListener('click', () => addToCart(p.external_id, name, price > 0 ? price : 0, imageUrl));
        }
        const imgEl = root.querySelector('img.product-detail-image');
        if (imgEl) imgEl.addEventListener('error', () => handleProductImageError(imgEl), { once: true });
    } catch (err) {
        root.innerHTML = '<div class="alert alert-danger">Не удалось загрузить товар. Проверьте, что бэкенд запущен.</div>';
    }
}

// ==========================================
// 4. ДОБАВЛЕНИЕ ТОВАРА В КОРЗИНУ
// ==========================================
function addToCart(productId, productName, productPrice, productImage) {
    cart.addItem({
        id: productId,
        name: productName,
        price: productPrice,
        image: productImage || ''
    });
}

// ==========================================
// 5. ПЛАВНАЯ ПРОКРУТКА
// ==========================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// ==========================================
// 6. АНИМАЦИЯ ПРИ ПРОКРУТКЕ
// ==========================================
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.feature-card, .product-card, .promo-card').forEach(el => {
        observer.observe(el);
    });
}

// ==========================================
// 7. МОДАЛЬНОЕ ОКНО ДЛЯ ТОВАРА
// ==========================================
function showProductModal(productName, productPrice, productImage, productDescription, productId, productInStock = true) {
    const id = productId || '';
    const inStock = productInStock !== false;
    const priceVal = productPrice != null && productPrice > 0 ? productPrice : 0;
    const priceHtml = !inStock
        ? 'Нет в наличии'
        : priceVal > 0
            ? formatMoney(priceVal)
            : 'Цена по запросу';
    const imgHtml = productImage
        ? `<img src="${productImage}" alt="${escapeHtml(productName)}" class="modal-image">`
        : '<div class="modal-image modal-no-image"><i class="fas fa-box"></i><span>Нет изображения</span></div>';
    const actionButton = inStock
        ? `<button class="btn btn-orange add-to-cart-modal-btn" data-id="${escapeHtml(id)}" data-name="${escapeHtml(productName)}" data-price="${priceVal}" data-image="${escapeHtml(productImage || '')}">
                        Добавить в корзину
                    </button>`
        : '<button class="btn btn-orange add-to-cart-modal-btn" disabled>Нет в наличии</button>';
    const modal = document.createElement('div');
    modal.className = 'product-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="modal-close">&times;</span>
            <div class="modal-body">
                ${imgHtml}
                <div class="modal-info">
                    <h2>${escapeHtml(productName)}</h2>
                    <p class="modal-price">${priceHtml}</p>
                    <p class="modal-description">${escapeHtml(productDescription || 'Высококачественная фурнитура для мебели.')}</p>
                    ${actionButton}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);

    const modalImgEl = modal.querySelector('img.modal-image');
    if (modalImgEl) modalImgEl.addEventListener('error', () => handleProductImageError(modalImgEl), { once: true });

    const addToCartBtn = modal.querySelector('.add-to-cart-modal-btn');
    if (addToCartBtn && !addToCartBtn.disabled) {
        addToCartBtn.addEventListener('click', function() {
            addToCart(this.dataset.id, this.dataset.name, Number(this.dataset.price), this.dataset.image || '');
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        });
    }

    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    });
}

// ==========================================
// 7.1. АККОРДЕОН ФИЛЬТРОВ В КАТАЛОГЕ
// ==========================================
function initCatalogAccordion() {
    document.querySelectorAll('.filter-group-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.closest('.filter-group');
            const isOpen = group.classList.contains('is-open');
            group.classList.toggle('is-open', !isOpen);
            btn.setAttribute('aria-expanded', !isOpen);
        });
    });
}

// ==========================================
// 7.3. МОБИЛЬНОЕ МЕНЮ (БУРГЕР)
// ==========================================
function initMobileNav() {
    const toggle = document.querySelector('.nav-toggle');
    const headerTop = document.querySelector('.header-top');
    if (!toggle || !headerTop) return;

    const nav = headerTop.querySelector('nav');

    const closeMenu = () => {
        headerTop.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = headerTop.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Клик по пункту меню — закрываем панель.
    if (nav) {
        nav.addEventListener('click', (e) => {
            if (e.target.closest('a')) closeMenu();
        });
    }

    // Клик вне шапки закрывает меню.
    document.addEventListener('click', (e) => {
        if (headerTop.classList.contains('nav-open') && !headerTop.contains(e.target)) {
            closeMenu();
        }
    });

    // Esc закрывает меню.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });

    // Возврат на десктоп — сбрасываем состояние, чтобы меню не осталось «открытым».
    window.addEventListener('resize', () => {
        if (window.innerWidth > 992) closeMenu();
    });
}

// ==========================================
// 8. STICKY HEADER
// ==========================================
function initStickyHeader() {
    const header = document.querySelector('header');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 100) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        lastScroll = currentScroll;
    });
}

// ==========================================
// 9. ФОРМА ОБРАТНОЙ СВЯЗИ
// ==========================================
function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        
        // Здесь можно добавить отправку на сервер
        console.log('Form data:', data);
        
        alert('Спасибо! Ваше сообщение отправлено. Мы свяжемся с вами в ближайшее время.');
        form.reset();
    });
}

// ==========================================
// 10. СЧЕТЧИК СТАТИСТИКИ
// ==========================================
function animateCounters() {
    const counters = document.querySelectorAll('.achievement-number');
    
    counters.forEach(counter => {
        const target = parseInt(counter.textContent);
        const duration = 2000;
        const step = target / (duration / 16);
        let current = 0;

        const timer = setInterval(() => {
            current += step;
            if (current >= target) {
                counter.textContent = target + '+';
                clearInterval(timer);
            } else {
                counter.textContent = Math.floor(current) + '+';
            }
        }, 16);
    });
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Инициализируем слайдер на главной странице
    if (document.querySelector('.hero')) {
        new HeroSlider();
    }

    // Инициализируем фильтр товаров в каталоге (обновляется после загрузки карточек с API)
    if (document.getElementById('product-search')) {
        window.catalogProductFilter = new ProductFilter();
    }

    // Загрузка каталога с бэкенда (страница каталога)
    if (document.getElementById('products-grid')) {
        window.catalogLoader = new CatalogLoader();
    }

    // Пошаговый выбор для витрины «ЛДСП/ЛМДФ/Кромка» (см. initCatalogSidebar)
    if (document.getElementById('ldsp-stepper')) {
        window.ldspStepper = new LdspLmdfStepper();
    }

    // Постоянная страница товара (product.html?id=...) — для QR-кодов ЛДСП/ЛМДФ
    if (document.getElementById('product-detail-root')) {
        initProductDetailPage();
    }

    // Боковой список категорий каталога (грузится с бэкенда по классификатору)
    if (document.getElementById('category-filter-list')) {
        initCatalogSidebar();
        // На мобильных фильтр категорий стартует свёрнутым, чтобы не оттеснять товары
        if (window.innerWidth <= 767) {
            const fg = document.querySelector('.sidebar .filter-group-all');
            if (fg) {
                fg.classList.remove('is-open');
                const tgl = fg.querySelector('.filter-group-toggle');
                if (tgl) tgl.setAttribute('aria-expanded', 'false');
            }
        }
    }

    // Аккордеон категорий в сайдбаре каталога
    if (document.querySelector('.filter-group-toggle')) {
        initCatalogAccordion();
    }

    // Общие инициализации
    initMobileNav();
    initSmoothScroll();
    initScrollAnimations();
    initStickyHeader();
    initContactForm();

    // Анимация счетчиков на странице "О компании"
    if (document.querySelector('.achievement-card')) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounters();
                    observer.disconnect();
                }
            });
        });
        
        const achievementsSection = document.querySelector('.achievements');
        if (achievementsSection) {
            observer.observe(achievementsSection);
        }
    }

    // Инициализация корзины на странице корзины
    if (document.getElementById('cart-items-container')) {
        cart.renderCartItems();
    }

    // Инициализация tooltips Bootstrap
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

// Если <img> товара не загрузилась (битая/удалённая ссылка на фото) — не оставляем
// сломанную картинку с "переполняющим" alt-текстом (ломает вёрстку карточки),
// а аккуратно подменяем на тот же плейсхолдер "Нет изображения", что и при
// отсутствии фото изначально. Разные места рисуют картинку своим классом
// (карточка каталога/степпера, страница товара, модалка) — у каждого свой класс плейсхолдера.
const IMAGE_ERROR_PLACEHOLDER_CLASS = {
    'product-image': 'product-image product-image-placeholder',
    'product-detail-image': 'product-detail-image product-image-placeholder',
    'modal-image': 'modal-image modal-no-image',
};

function handleProductImageError(img) {
    const baseClass = Array.from(img.classList).find(c => IMAGE_ERROR_PLACEHOLDER_CLASS[c]);
    const placeholder = document.createElement('div');
    placeholder.className = IMAGE_ERROR_PLACEHOLDER_CLASS[baseClass] || IMAGE_ERROR_PLACEHOLDER_CLASS['product-image'];
    placeholder.innerHTML = '<i class="fas fa-box"></i><span>Нет изображения</span>';
    img.replaceWith(placeholder);
}

// Экранирование HTML для безопасной подстановки в атрибуты
function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/'/g, '&#39;');
}

// Форматирование цены
function formatMoney(value) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value) + ' р';
}

function formatPrice(price) {
    if (price == null || price === 0) return 'Цена по запросу';
    return formatMoney(price);
}

function resolveApiUrl(path) {
    if (!path) return '';
    try {
        return new URL(path, API_BASE).toString();
    } catch (err) {
        return path;
    }
}

// Show loading
function showLoading() {
    const loader = document.createElement('div');
    loader.className = 'loading-spinner';
    loader.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loader);
}

// Скрыть loading
function hideLoading() {
    const loader = document.querySelector('.loading-spinner');
    if (loader) loader.remove();
}


