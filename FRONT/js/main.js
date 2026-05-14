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
                    <p>Добавьте товары из <a href="catalog.html">каталога</a></p>
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
            this.filterProducts(e.target.value.toLowerCase());
        });

        this.categoryFilters.forEach(filter => {
            filter.addEventListener('click', () => {
                const slug = filter.dataset.filter;
                if (window.catalogLoader) window.catalogLoader.setCategory(slug || 'all');
                if (slug === 'all' && this.searchInput) this.searchInput.value = '';
            });
        });
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

// ==========================================
// 3.1. ЗАГРУЗКА КАТАЛОГА С API (постранично)
// ==========================================
class CatalogLoader {
    constructor() {
        this.grid = document.getElementById('products-grid');
        this.paginationEl = document.getElementById('catalog-pagination');
        this.loadingEl = document.getElementById('catalog-loading');
        this.currentPage = 1;
        this.totalCount = 0;
        this.currentCategory = null;
        if (this.grid) {
            this.loadPage(1);
            this.paginationEl && this.paginationEl.addEventListener('click', this.onPaginationClick.bind(this));
        }
    }

    setCategory(categorySlug) {
        this.currentCategory = categorySlug === 'all' || !categorySlug ? null : categorySlug;
        this.loadPage(1);
    }

    onPaginationClick(e) {
        const pageBtn = e.target.closest('.catalog-page-btn');
        if (pageBtn && pageBtn.dataset.page) {
            e.preventDefault();
            const page = parseInt(pageBtn.dataset.page, 10);
            if (page >= 1 && page !== this.currentPage) this.loadPage(page);
            return;
        }
        const prevBtn = e.target.closest('[data-dir="prev"]');
        if (prevBtn && !prevBtn.disabled) {
            e.preventDefault();
            if (this.currentPage > 1) this.loadPage(this.currentPage - 1);
            return;
        }
        const nextBtn = e.target.closest('[data-dir="next"]');
        if (nextBtn && !nextBtn.disabled) {
            e.preventDefault();
            this.loadPage(this.currentPage + 1);
        }
    }

    async loadPage(page) {
        if (!this.grid) return;
        if (this.loadingEl) this.loadingEl.style.display = 'block';
        const skip = (page - 1) * CATALOG_PAGE_SIZE;
        const params = new URLSearchParams({ skip: String(skip), limit: String(CATALOG_PAGE_SIZE), active_only: 'true' });
        if (this.currentCategory) params.set('category', this.currentCategory);
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
            this.grid.innerHTML = '<div class="catalog-empty">В этой категории пока нет товаров.</div>';
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
                ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" class="product-image">`
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
            fragment.appendChild(card);
        });
        this.grid.appendChild(fragment);
    }

    renderPagination() {
        if (!this.paginationEl) return;
        const cur = this.currentPage;
        const totalPages = Math.max(1, Math.ceil(this.totalCount / CATALOG_PAGE_SIZE));
        const prevDisabled = cur <= 1;
        const showNext = cur < totalPages;

        const items = [];
        const left = Math.max(1, cur - 2);
        const right = Math.min(totalPages, cur + 2);

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
            const active = item === cur ? ' catalog-page-btn-active' : '';
            return `<button type="button" class="btn catalog-page-btn${active}" data-page="${item}">${item}</button>`;
        }).join('');

        const svgPrev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
        const svgNext = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
        this.paginationEl.innerHTML = `
            <div class="catalog-pagination-inner">
                <button type="button" class="btn btn-pagination-arrow" aria-label="Предыдущая" ${prevDisabled ? 'disabled' : ''} data-dir="prev">${svgPrev}</button>
                <div class="catalog-page-btns">${pageBtns}</div>
                <button type="button" class="btn btn-pagination-arrow" aria-label="Следующая" ${showNext ? '' : 'disabled'} data-dir="next">${svgNext}</button>
            </div>
        `;
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

    // Аккордеон категорий в сайдбаре каталога
    if (document.querySelector('.filter-group-toggle')) {
        initCatalogAccordion();
    }

    // Общие инициализации
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


