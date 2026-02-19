// АРТ-КОМПЛЕКТ - Main JavaScript File

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
        return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
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

        cartContainer.innerHTML = this.items.map(item => `
            <div class="cart-item" data-id="${item.id}">
                <img src="${item.image}" alt="${item.name}" class="cart-item-image">
                <div class="cart-item-info">
                    <h3>${item.name}</h3>
                    <p style="color: #666; font-size: 14px;">${item.price} ₽ x ${item.quantity}</p>
                </div>
                <div class="quantity-control">
                    <button class="quantity-btn" onclick="cart.updateQuantity('${item.id}', ${item.quantity - 1})">−</button>
                    <span class="quantity-value">${item.quantity}</span>
                    <button class="quantity-btn" onclick="cart.updateQuantity('${item.id}', ${item.quantity + 1})">+</button>
                </div>
                <div>
                    <div style="font-size: 20px; font-weight: bold; color: #1e2845; margin-bottom: 10px;">
                        ${(item.price * item.quantity).toLocaleString('ru-RU')} ₽
                    </div>
                    <button class="btn-remove" onclick="cart.removeItem('${item.id}')">🗑️</button>
                </div>
            </div>
        `).join('');

        if (cartSummary) {
            const totalPrice = this.getTotal();
            const totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
            
            cartSummary.innerHTML = `
                <div style="background: white; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
                    <div class="summary-row">
                        <span>Товары (${totalItems} шт.)</span>
                        <span>${totalPrice.toLocaleString('ru-RU')} ₽</span>
                    </div>
                    <div class="summary-row total">
                        <span>Итого:</span>
                        <span>${totalPrice.toLocaleString('ru-RU')} ₽</span>
                    </div>
                </div>
                <button class="btn btn-yellow" style="width: 100%; padding: 18px; font-size: 18px;" onclick="cart.checkout()">
                    Оформить заказ
                </button>
            `;
            cartSummary.style.display = 'block';
        }
    }

    checkout() {
        if (this.items.length === 0) {
            alert('Корзина пуста!');
            return;
        }
        
        alert(`Спасибо за заказ!\n\nВсего товаров: ${this.items.reduce((sum, item) => sum + item.quantity, 0)}\nСумма: ${this.getTotal().toLocaleString('ru-RU')} ₽\n\nМы свяжемся с вами в ближайшее время.`);
        this.items = [];
        this.saveCart();
        this.renderCartItems();
        this.updateCartBadge();
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
                subtitle: 'Высококачественная мебель и фурнитура мировых брендов<br>Индивидуальный подход к каждому клиенту'
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
                this.filterByCategory(filter.textContent.trim());
            });
        });
    }

    filterProducts(searchTerm) {
        this.products.forEach(product => {
            const productName = product.querySelector('.product-name').textContent.toLowerCase();
            const isVisible = productName.includes(searchTerm);
            product.style.display = isVisible ? 'block' : 'none';
        });
    }

    filterByCategory(category) {
        // Здесь можно добавить логику фильтрации по категориям
        // Пока просто показываем все товары
        this.products.forEach(product => {
            product.style.display = 'block';
        });
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
        image: productImage
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
function showProductModal(productName, productPrice, productImage, productDescription) {
    const modal = document.createElement('div');
    modal.className = 'product-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="modal-close">&times;</span>
            <div class="modal-body">
                <img src="${productImage}" alt="${productName}" class="modal-image">
                <div class="modal-info">
                    <h2>${productName}</h2>
                    <p class="modal-price">${productPrice} ₽</p>
                    <p class="modal-description">${productDescription || 'Высококачественная фурнитура для мебели.'}</p>
                    <button class="btn btn-orange" onclick="addToCart('${productName}', '${productName}', ${productPrice}, '${productImage}'); this.closest('.product-modal').remove();">
                        Добавить в корзину
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);

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

    // Инициализируем фильтр товаров в каталоге
    if (document.getElementById('product-search')) {
        new ProductFilter();
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

// Форматирование цены
function formatPrice(price) {
    return price.toLocaleString('ru-RU') + ' ₽';
}

// Показать loading
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
