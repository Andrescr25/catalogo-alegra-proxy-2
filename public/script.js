class ProductCatalog {
    constructor() {
        this.products = [];
        this.hiddenProducts = new Set(JSON.parse(localStorage.getItem('hiddenProducts') || '[]'));
        this.currentPage = 0;
        this.itemsPerPage = 30;
        this.isLoading = false;
        this.hasMorePages = true;
        this.adminMode = false;
        this.categories = new Map();
        this.autoLoadInterval = null;
        this.totalProductsLoaded = 0;
        this.isInitialLoad = true;
        
        // API Configuration
        this.apiUrl = window.location.origin + '/api/productos';
        this.authHeader = '';
        
        // Handlers para bloqueos de gestos
        this.gestureBlockHandler = null;
        this.touchStartHandler = null;
        this.touchMoveHandler = null;
        
        this.init();
    }

    init() {
        this.loadFromCache();
    }

    loadFromCache() {
        const savedProducts = localStorage.getItem('products');
        const savedCategories = localStorage.getItem('categories'); // NUEVO
        const lastUpdate = localStorage.getItem('lastUpdate');
        
        if (savedProducts) {
            try {
                this.products = JSON.parse(savedProducts);
                this.totalProductsLoaded = this.products.length;
                
                // RESTAURAR CATEGORÍAS SI EXISTEN
                if (savedCategories) {
                    try {
                        const categoriesArray = JSON.parse(savedCategories);
                        this.categories = new Map(categoriesArray);
                        console.log('📂 Categorías restauradas desde cache');
                    } catch (e) {
                        console.warn('Error restaurando categorías, regenerando...');
                        this.organizeByCategories();
                    }
                } else {
                    this.organizeByCategories();
                }
                
                if (this.products.length > 0) {
                    console.log(`📦 Cargando ${this.products.length} productos desde caché`);
                    this.updateStatus('offline', `📦 Catálogo cargado (${this.products.length} productos)`);
                    this.hasMorePages = false;
                    this.isInitialLoad = false;
                    this.renderProducts();
                    this.showCacheInfo(lastUpdate);
                    
                    // APLICAR BLOQUEOS DE GESTOS INMEDIATAMENTE
                    setTimeout(() => {
                        this.applyGestureBlocks();
                    }, 500);
                    
                    return;
                }
            } catch (error) {
                console.error('Error cargando desde caché:', error);
            }
        }
        
        this.startFreshLoad();
    }

    startFreshLoad() {
        console.log('🔄 Iniciando carga fresca desde la API...');
        this.updateStatus('loading', 'Conectando...');
        this.setupScrollListener();
        this.loadProducts(true);
    }

    showCacheInfo(lastUpdate) {
        const content = document.getElementById('content');
        
        const cacheInfo = document.createElement('div');
        cacheInfo.className = 'cache-info';
        cacheInfo.innerHTML = `
            <div class="cache-banner">
                <p>✅ <strong>Catálogo cargado desde memoria</strong></p>
                <p><small>Última actualización: ${this.formatDate(lastUpdate)}</small></p>
                <p><small>Funciona sin conexión a internet</small></p>
            </div>
        `;
        content.insertBefore(cacheInfo, content.firstChild);
        
        setTimeout(() => {
            if (cacheInfo.parentNode) {
                cacheInfo.remove();
            }
        }, 8000);
    }

    formatDate(dateString) {
        if (!dateString) return 'Desconocida';
        const date = new Date(dateString);
        return date.toLocaleString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Método para calcular precio con impuestos - CON REDONDEO
    calculatePriceWithTax(product) {
        const basePrice = product.price?.[0]?.price || 0;
        let taxRate = 0;
        
        // Obtener la tasa de impuesto del producto
        if (product.tax && product.tax.length > 0) {
            // Sumar todas las tasas de impuesto
            taxRate = product.tax.reduce((total, tax) => {
                return total + (tax.percentage || 0);
            }, 0);
        }
        
        const taxAmount = (basePrice * taxRate) / 100;
        // REDONDEAR el precio final
        const finalPrice = Math.round(basePrice + taxAmount);
        
        return {
            basePrice,
            taxRate,
            taxAmount,
            finalPrice
        };
    }

    async forceRefreshFromAdmin() {
        console.log('🔄 Actualización forzada desde panel admin...');
        
        this.products = [];
        this.categories.clear();
        this.totalProductsLoaded = 0;
        this.currentPage = 0;
        this.hasMorePages = true;
        this.isInitialLoad = true;
        this.stopAutoLoading();
        
        localStorage.removeItem('products');
        localStorage.removeItem('categories'); // NUEVO
        localStorage.removeItem('lastUpdate');
        
        document.getElementById('content').innerHTML = `
            <div class="loading" id="loading">
                <div class="loading-spinner"></div>
                <p>🔄 Actualizando catálogo desde Alegra...</p>
                <p><small>Esta actualización puede tomar varios minutos</small></p>
            </div>
        `;
        
        if (this.adminMode) {
            this.toggleAdminMode();
        }
        
        this.startFreshLoad();
    }

    startAutoLoading() {
        if (this.autoLoadInterval) {
            clearInterval(this.autoLoadInterval);
        }
        
        // CONFIGURACIÓN OPTIMIZADA PARA KIOSK BROWSERS
        const isKioskBrowser = /Fully|Kiosk|SureLock/i.test(navigator.userAgent) || 
                              window.outerHeight === screen.height; // Detectar pantalla completa
        
        const loadInterval = isKioskBrowser ? 4000 : 2000; // Más lento en kiosk
        const maxProductsPerBatch = isKioskBrowser ? 20 : 30; // Menos productos por lote
        
        console.log(`🔄 Modo de carga: ${isKioskBrowser ? 'KIOSK' : 'NORMAL'} (${loadInterval}ms interval)`);
        
        this.autoLoadInterval = setInterval(() => {
            if (this.hasMorePages && !this.isLoading) {
                // VERIFICAR MEMORIA DISPONIBLE
                if (this.checkMemoryUsage()) {
                    console.log('🔄 Carga automática de siguiente lote...');
                    this.loadMoreProducts();
                } else {
                    console.warn('⚠️ Pausando carga automática - memoria limitada');
                    this.stopAutoLoading();
                    this.showMemoryWarning();
                }
            } else if (!this.hasMorePages) {
                clearInterval(this.autoLoadInterval);
                this.updateStatus('online', `✅ Todos los productos cargados (${this.totalProductsLoaded} productos)`);
                console.log('✅ Carga automática completada - todos los productos cargados');
            }
        }, loadInterval);
    }

    // NUEVO MÉTODO: Verificar uso de memoria
    checkMemoryUsage() {
        // Verificar si hay API de memoria disponible
        if ('memory' in performance) {
            const memInfo = performance.memory;
            const usedPercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;
            
            console.log(`📊 Memoria: ${Math.round(usedPercent)}% usado (${Math.round(memInfo.usedJSHeapSize/1024/1024)}MB)`);
            
            // Si usa más del 80% de memoria, pausar
            if (usedPercent > 80) {
                return false;
            }
        }
        
        // Verificar número de productos cargados
        const productCards = document.querySelectorAll('.product-card').length;
        
        // Límite para kiosk browsers
        const isKioskBrowser = /Fully|Kiosk|SureLock/i.test(navigator.userAgent);
        const maxProducts = isKioskBrowser ? 500 : 1000;
        
        if (productCards > maxProducts) {
            console.warn(`⚠️ Muchos productos cargados: ${productCards}/${maxProducts}`);
            return false;
        }
        
        return true;
    }

    // NUEVO MÉTODO: Mostrar advertencia de memoria
    showMemoryWarning() {
        const content = document.getElementById('content');
        
        const existingWarning = document.querySelector('.memory-warning');
        if (existingWarning) {
            existingWarning.remove();
        }
        
        const memoryWarning = document.createElement('div');
        memoryWarning.className = 'memory-warning';
        memoryWarning.innerHTML = `
            <div class="warning-banner">
                <h3>⚠️ Carga pausada por memoria limitada</h3>
                <p>Se han cargado <strong>${this.totalProductsLoaded} productos</strong></p>
                <p><small>El navegador ha alcanzado su límite de memoria</small></p>
                <button class="btn btn-primary" onclick="catalog.continueLoadingForced()">
                    🔄 Continuar carga (puede ser lento)
                </button>
                <button class="btn btn-admin" onclick="catalog.optimizeForMemory()">
                    🧹 Optimizar memoria
                </button>
            </div>
        `;
        content.appendChild(memoryWarning);
    }

    // NUEVO MÉTODO: Forzar continuación de carga
    continueLoadingForced() {
        const memoryWarning = document.querySelector('.memory-warning');
        if (memoryWarning) {
            memoryWarning.remove();
        }
        
        this.updateStatus('loading', '⚠️ Carga forzada - puede ser lenta...');
        this.startAutoLoading();
    }

    // NUEVO MÉTODO: Optimizar memoria
    optimizeForMemory() {
        console.log('🧹 Optimizando memoria...');
        
        // Remover imágenes que no están visibles
        const productCards = document.querySelectorAll('.product-card');
        let removedImages = 0;
        
        productCards.forEach((card) => {
            const rect = card.getBoundingClientRect();
            const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
            
            if (!isVisible) {
                const img = card.querySelector('img');
                if (img) {
                    // Guardar URL y remover imagen
                    img.setAttribute('data-original-src', img.src);
                    img.removeAttribute('src');
                    img.style.display = 'none';
                    removedImages++;
                }
            }
        });
        
        // Forzar garbage collection si está disponible
        if (window.gc) {
            window.gc();
        }
        
        const memoryWarning = document.querySelector('.memory-warning');
        if (memoryWarning) {
            memoryWarning.remove();
        }
        
        this.showSuccessMessage(`🧹 Memoria optimizada - ${removedImages} imágenes liberadas`);
        
        // Reiniciar carga después de optimizar
        setTimeout(() => {
            this.startAutoLoading();
        }, 2000);
    }

    stopAutoLoading() {
        if (this.autoLoadInterval) {
            clearInterval(this.autoLoadInterval);
            this.autoLoadInterval = null;
        }
    }

    updateStatus(type, message) {
        const indicator = document.getElementById('statusIndicator');
        indicator.className = `status-indicator status-${type}`;
        indicator.textContent = message;
    }

    setupScrollListener() {
        const content = document.getElementById('content');
        content.addEventListener('scroll', () => {
            if (content.scrollTop + content.clientHeight >= content.scrollHeight - 300) {
                this.showEndOfCatalogMessage();
            }
        });
    }

    showEndOfCatalogMessage() {
        if (document.querySelector('.end-catalog-message')) return;
        
        const content = document.getElementById('content');
        const message = document.createElement('div');
        message.className = 'end-catalog-message';
        message.innerHTML = `
            <div class="info-banner">
                <p>Has llegado al final del catálogo actual</p>
                <p><small>Los productos siguen cargándose automáticamente en segundo plano</small></p>
            </div>
        `;
        content.appendChild(message);
        
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 5000);
    }

    async loadProducts(reset = false) {
        if (this.isLoading) return;

        this.isLoading = true;
        
        if (reset) {
            this.currentPage = 0;
            this.hasMorePages = true;
            this.products = [];
            this.categories.clear();
            this.totalProductsLoaded = 0;
            this.stopAutoLoading();
            
            if (this.isInitialLoad) {
                document.getElementById('content').innerHTML = `
                    <div class="loading" id="loading">
                        <div class="loading-spinner"></div>
                        <p>Conectando con el servidor proxy...</p>
                    </div>
                `;
            }
        }

        try {
            await this.tryLoadFromAPI(reset);
            
            if (reset && this.hasMorePages && this.isInitialLoad) {
                this.startAutoLoading();
            }

        } catch (error) {
            console.error('Error loading from proxy:', error);
            
            const savedProducts = localStorage.getItem('products');
            if (savedProducts) {
                this.products = JSON.parse(savedProducts);
                this.totalProductsLoaded = this.products.length;
                this.updateStatus('offline', `Sin conexión (${this.products.length} productos guardados)`);
                this.organizeByCategories();
                this.renderProducts();
            } else {
                this.showConnectionError(error);
            }
        }

        this.isLoading = false;
    }

    async tryLoadFromAPI(reset) {
        const start = this.currentPage * this.itemsPerPage;
        
        const response = await fetch(`${this.apiUrl}?start=${start}&limit=${this.itemsPerPage}`, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error del proxy: ${response.status}`);
        }

        const data = await response.json();
        this.processAPIData(data, reset);
    }

    processAPIData(data, reset) {
        let activeProducts = [];
        
        if (data.products && data.debug) {
            activeProducts = data.products;
            
            console.log('🔍 Debug info from server:', data.debug);
            console.log(`📊 Start: ${data.debug.start}, Recibidos: ${data.debug.total_received}, Activos: ${data.debug.active_filtered}`);
            
            const hasMore = data.debug.has_more && data.debug.active_filtered > 0;
            
            if (!hasMore && data.debug.total_received < 30) {
                console.log('🏁 No hay más productos en Alegra (respuesta < 30)');
                this.hasMorePages = false;
            } else if (!hasMore && data.debug.active_filtered === 0) {
                console.log('🏁 No hay más productos activos (0 productos activos en respuesta)');
                this.hasMorePages = false;
            }
        } else {
            activeProducts = data.filter ? data.filter(product => product.status === 'active') : [];
        }
        
        if (reset) {
            this.products = activeProducts;
            this.totalProductsLoaded = activeProducts.length;
            this.organizeByCategories();
            this.renderProducts();
        } else {
            this.products.push(...activeProducts);
            this.totalProductsLoaded += activeProducts.length;
            this.renderNewProducts(activeProducts);
        }

        if (this.isInitialLoad) {
            localStorage.setItem('products', JSON.stringify(this.products));
            localStorage.setItem('lastUpdate', new Date().toISOString());
            
            // APLICAR BLOQUEOS DESPUÉS DE CARGAR DATOS
            setTimeout(() => {
                this.applyGestureBlocks();
            }, 1000);
        }

        this.updateStatus('online', `🔄 Cargando... (${this.totalProductsLoaded} productos)`);
        
        if (data.debug) {
            if (!data.debug.has_more || data.debug.active_filtered === 0) {
                this.hasMorePages = false;
                this.stopAutoLoading();
                
                if (this.isInitialLoad) {
                    localStorage.setItem('products', JSON.stringify(this.products));
                    localStorage.setItem('lastUpdate', new Date().toISOString());
                    this.updateStatus('online', `✅ Catálogo actualizado (${this.totalProductsLoaded} productos)`);
                    this.showCompletionMessage();
                } else {
                    this.updateStatus('online', `✅ Carga completa (${this.totalProductsLoaded} productos)`);
                }
                console.log('🏁 Carga completada basada en debug info del servidor');
            } else {
                this.currentPage++;
                console.log(`➡️ Continuando con página ${this.currentPage + 1}`);
            }
        } else {
            if (activeProducts.length < this.itemsPerPage) {
                this.hasMorePages = false;
                this.stopAutoLoading();
                
                if (this.isInitialLoad) {
                    localStorage.setItem('products', JSON.stringify(this.products));
                    localStorage.setItem('lastUpdate', new Date().toISOString());
                    this.updateStatus('online', `✅ Catálogo actualizado (${this.totalProductsLoaded} productos)`);
                    this.showCompletionMessage();
                } else {
                    this.updateStatus('online', `✅ Carga completa (${this.totalProductsLoaded} productos)`);
                }
            } else {
                this.currentPage++;
            }
        }
    }

    async loadMoreProducts() {
        if (!this.hasMorePages || this.isLoading) return;
        
        await this.loadProducts(false);
    }

    organizeByCategories() {
        this.categories.clear();
        
        this.products.forEach(product => {
            const categoryName = product.itemCategory?.name || 'Sin Categoría';
            
            if (!this.categories.has(categoryName)) {
                this.categories.set(categoryName, []);
            }
            
            this.categories.get(categoryName).push(product);
        });

        this.categories = new Map([...this.categories.entries()].sort());
        
        // GUARDAR CATEGORÍAS EN LOCALSTORAGE
        try {
            const categoriesArray = Array.from(this.categories.entries());
            localStorage.setItem('categories', JSON.stringify(categoriesArray));
            console.log('📂 Categorías guardadas en cache');
        } catch (error) {
            console.warn('Error guardando categorías:', error);
        }
    }

    renderProducts() {
        const content = document.getElementById('content');
        const loading = document.getElementById('loading');
        
        if (loading) loading.remove();

        content.innerHTML = '';

        this.organizeByCategories();
        this.renderAllCategories();
    }

    renderAllCategories() {
        const content = document.getElementById('content');

        this.categories.forEach((products, categoryName) => {
            let categorySection = document.querySelector(`[data-category="${categoryName}"]`);
            
            if (!categorySection) {
                categorySection = document.createElement('div');
                categorySection.className = 'category-section';
                categorySection.setAttribute('data-category', categoryName);
                
                const categoryTitle = document.createElement('h2');
                categoryTitle.className = 'category-title';
                categoryTitle.innerHTML = `
                    <span class="category-name">${categoryName}</span>
                    <span class="category-count">${products.length}</span>
                `;
                categorySection.appendChild(categoryTitle);

                const productsGrid = document.createElement('div');
                productsGrid.className = 'products-grid';
                categorySection.appendChild(productsGrid);

                content.appendChild(categorySection);
            } else {
                const categoryTitle = categorySection.querySelector('.category-title');
                const countElement = categoryTitle.querySelector('.category-count');
                if (countElement) {
                    countElement.textContent = products.length;
                }
            }

            const productsGrid = categorySection.querySelector('.products-grid');
            
            products.forEach(product => {
                if (!productsGrid.querySelector(`[data-product-id="${product.id}"]`)) {
                    const productCard = this.createProductCard(product);
                    productsGrid.appendChild(productCard);
                }
            });
        });
    }

    renderNewProducts(newProducts) {
        const newCategories = new Map();
        
        newProducts.forEach(product => {
            const categoryName = product.itemCategory?.name || 'Sin Categoría';
            
            if (!newCategories.has(categoryName)) {
                newCategories.set(categoryName, []);
            }
            
            newCategories.get(categoryName).push(product);
        });

        const content = document.getElementById('content');

        const loadingMore = content.querySelector('.loading-more');
        if (loadingMore) loadingMore.remove();

        newCategories.forEach((products, categoryName) => {
            let categorySection = document.querySelector(`[data-category="${categoryName}"]`);
            
            if (!categorySection) {
                categorySection = document.createElement('div');
                categorySection.className = 'category-section';
                categorySection.setAttribute('data-category', categoryName);
                
                const categoryTitle = document.createElement('h2');
                categoryTitle.className = 'category-title';
                categoryTitle.innerHTML = `
                    <span class="category-name">${categoryName}</span>
                    <span class="category-count">${products.length}</span>
                `;
                categorySection.appendChild(categoryTitle);

                const productsGrid = document.createElement('div');
                productsGrid.className = 'products-grid';
                categorySection.appendChild(productsGrid);

                let inserted = false;
                const existingSections = content.querySelectorAll('.category-section');
                for (let section of existingSections) {
                    if (categoryName < section.getAttribute('data-category')) {
                        content.insertBefore(categorySection, section);
                        inserted = true;
                        break;
                    }
                }
                if (!inserted) {
                    content.appendChild(categorySection);
                }
            }

            const productsGrid = categorySection.querySelector('.products-grid');
            
            products.forEach(product => {
                if (!productsGrid.querySelector(`[data-product-id="${product.id}"]`)) {
                    const productCard = this.createProductCard(product);
                    productsGrid.appendChild(productCard);
                    
                    productCard.style.opacity = '0';
                    productCard.style.transform = 'translateY(20px)';
                    
                    setTimeout(() => {
                        productCard.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                        productCard.style.opacity = '1';
                        productCard.style.transform = 'translateY(0)';
                    }, 100);
                }
            });
        });

        if (this.hasMorePages) {
            this.addProgressIndicator();
        }
    }

    addProgressIndicator() {
        const content = document.getElementById('content');
        
        const existingIndicator = content.querySelector('.auto-load-progress');
        if (existingIndicator) existingIndicator.remove();
        
        const progressIndicator = document.createElement('div');
        progressIndicator.className = 'auto-load-progress';
        progressIndicator.innerHTML = `
            <div class="progress-info">
                <div class="loading-spinner-small"></div>
                <p>Cargando más productos automáticamente...</p>
                <p><small>${this.totalProductsLoaded} productos cargados</small></p>
                <button class="btn btn-primary btn-small" onclick="catalog.stopAutoLoading()">
                    Pausar carga automática
                </button>
            </div>
        `;
        content.appendChild(progressIndicator);
    }

    createProductCard(product) {
        const isHidden = this.hiddenProducts.has(product.id);
        const priceInfo = this.calculatePriceWithTax(product);
        const currency = product.price?.[0]?.currency?.symbol || '₡';
        const stock = product.inventory?.availableQuantity || 0;
        
        const card = document.createElement('div');
        card.className = `product-card ${isHidden ? 'hidden' : ''}`;
        card.setAttribute('data-product-id', product.id);

        let stockClass = 'stock-out';
        let stockText = 'Sin stock';
        
        if (stock > 10) {
            stockClass = 'stock-available';
            stockText = `${stock} disponibles`;
        } else if (stock > 0) {
            stockClass = 'stock-low';
            stockText = `${stock} disponibles`;
        }

        let imageHtml = `<div class="product-image-placeholder">📦 ${product.name.substring(0, 20)}...</div>`;
        
        if (product.images && product.images.length > 0) {
            const favoriteImage = product.images.find(img => img.favorite === true);
            const imageToUse = favoriteImage || product.images[0];
            
            if (imageToUse && imageToUse.url) {
                imageHtml = `
                    <img class="product-image" 
                         src="${imageToUse.url}" 
                         alt="${product.name}"
                         title="${imageToUse.name || 'Imagen del producto'}"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="product-image-placeholder" style="display:none;">
                        📦 ${product.name.substring(0, 20)}...
                    </div>
                `;
            }
        } else if (product.image) {
            imageHtml = `
                <img class="product-image" 
                     src="${product.image}" 
                     alt="${product.name}"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="product-image-placeholder" style="display:none;">
                    📦 ${product.name.substring(0, 20)}...
                </div>
            `;
        }

        // Crear breakdown de precio con impuestos
        let priceBreakdown = '';
        if (priceInfo.taxRate > 0) {
            priceBreakdown = `
                <div class="product-price-breakdown">
                    Base: ${currency}${priceInfo.basePrice.toLocaleString()} + ${priceInfo.taxRate}% imp.
                </div>
            `;
        }

        card.innerHTML = `
            ${isHidden ? '<div class="hidden-indicator">Oculto</div>' : ''}
            <div class="product-image-container">
                ${imageHtml}
                ${product.images && product.images.length > 1 ? 
                    `<div class="image-count">📷 ${product.images.length}</div>` : ''}
            </div>
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-reference">Ref: ${product.reference?.reference || 'N/A'}</div>
                <div class="product-price">${currency}${priceInfo.finalPrice.toLocaleString()}</div>
                ${priceBreakdown}
                <div class="product-stock ${stockClass}">${stockText}</div>
            </div>
        `;

        return card;
    }

    showConnectionError(error) {
        const content = document.getElementById('content');
        const loading = document.getElementById('loading');
        if (loading) loading.remove();

        const errorMessage = document.createElement('div');
        errorMessage.className = 'connection-error';
        errorMessage.innerHTML = `
            <div class="error-info">
                <h3>Error de Conexión con el Proxy</h3>
                <p><strong>No se pudo conectar con el servidor proxy local.</strong></p>
                
                <div class="error-details">
                    <h4>¿Está ejecutándose el servidor proxy?</h4>
                    <div class="steps">
                        <p><strong>1.</strong> Asegúrate de que el servidor esté corriendo:</p>
                        <code>npm run dev</code>
                        
                        <p><strong>2.</strong> Verifica que esté en el puerto correcto:</p>
                        <code>http://localhost:3001</code>
                        
                        <p><strong>3.</strong> Prueba la conexión directa:</p>
                        <a href="http://localhost:3001/health" target="_blank">http://localhost:3001/health</a>
                    </div>
                </div>

                <div class="fallback-demo">
                    <h4>Mientras tanto...</h4>
                    <p>Puedes probar la interfaz con productos demo:</p>
                    <button class="btn btn-primary" onclick="catalog.loadDemoProducts(); catalog.showFallbackMessage();">
                        Cargar Productos Demo
                    </button>
                </div>

                <div class="error-technical">
                    <details>
                        <summary>Detalles técnicos del error</summary>
                        <pre>${error.message}</pre>
                    </details>
                </div>
            </div>
        `;
        content.appendChild(errorMessage);
        
        this.updateStatus('offline', 'Proxy desconectado');
    }

    showFallbackMessage() {
        const connectionError = document.querySelector('.connection-error');
        if (connectionError) {
            connectionError.style.display = 'none';
        }
        
        const content = document.getElementById('content');
        const fallbackMessage = document.createElement('div');
        fallbackMessage.className = 'fallback-message';
        fallbackMessage.innerHTML = `
            <div class="info-banner">
                <p><strong>Modo Demo Activado</strong> - Ejecuta el servidor proxy para conectar con datos reales de Alegra</p>
            </div>
        `;
        content.insertBefore(fallbackMessage, content.firstChild);
    }

    loadDemoProducts() {
        this.products = [
            {
                id: "demo1",
                name: "Producto Demo 1 - LAMINAS FUSIBLE 1X25 N-30",
                itemCategory: { name: "FERRETEROS" },
                reference: { reference: "0390" },
                status: "active",
                price: [{ price: 881, currency: { symbol: "₡" } }],
                inventory: { availableQuantity: 15 },
                tax: [{ percentage: 13 }]
            },
            {
                id: "demo2", 
                name: "Producto Demo 2 - CABLES ELECTRICOS 2.5MM",
                itemCategory: { name: "ELECTRICOS" },
                reference: { reference: "0391" },
                status: "active",
                price: [{ price: 1250, currency: { symbol: "₡" } }],
                inventory: { availableQuantity: 8 },
                tax: [{ percentage: 13 }]
            },
            {
                id: "demo3",
                name: "Producto Demo 3 - TORNILLOS HEXAGONALES M8",
                itemCategory: { name: "FERRETEROS" },
                reference: { reference: "0392" },
                status: "active", 
                price: [{ price: 350, currency: { symbol: "₡" } }],
                inventory: { availableQuantity: 50 },
                tax: [{ percentage: 1 }]
            },
            {
                id: "demo4",
                name: "Producto Demo 4 - PINTURA LATEX BLANCA 1GL",
                itemCategory: { name: "PINTURAS" },
                reference: { reference: "0393" },
                status: "active",
                price: [{ price: 2800, currency: { symbol: "₡" } }],
                inventory: { availableQuantity: 3 },
                tax: [{ percentage: 13 }]
            }
        ];

        this.hasMorePages = false;
        this.updateStatus('offline', 'Modo Demo - Conecta la API para datos reales');
        this.organizeByCategories();
        this.renderProducts();
    }

    showError(message) {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="error">
                <h3>Error</h3>
                <p>${message}</p>
                <br>
                <button class="btn btn-primary" onclick="refreshProducts()">Reintentar</button>
            </div>
        `;
    }

    showCompletionMessage() {
        const content = document.getElementById('content');
        
        const completionMessage = document.createElement('div');
        completionMessage.className = 'completion-message';
        completionMessage.innerHTML = `
            <div class="completion-banner">
                <h3>🎉 ¡Catálogo completamente actualizado!</h3>
                <p>✅ ${this.totalProductsLoaded} productos cargados desde Alegra</p>
                <p>📱 El catálogo ahora funciona sin conexión a internet</p>
                <p>🔄 Para actualizar nuevamente, usa el botón "Actualizar Catálogo" del Panel Admin</p>
            </div>
        `;
        content.insertBefore(completionMessage, content.firstChild);
        
        setTimeout(() => {
            if (completionMessage.parentNode) {
                completionMessage.remove();
            }
        }, 10000);
    }

    toggleProductVisibility(productId) {
        const card = document.querySelector(`[data-product-id="${productId}"]`);
        const isHidden = this.hiddenProducts.has(productId);

        if (isHidden) {
            this.hiddenProducts.delete(productId);
            card.classList.remove('hidden');
            card.querySelector('.hidden-indicator')?.remove();
        } else {
            this.hiddenProducts.add(productId);
            card.classList.add('hidden');
            card.insertAdjacentHTML('afterbegin', '<div class="hidden-indicator">Oculto</div>');
        }

        // Guardar permanentemente los cambios
        localStorage.setItem('hiddenProducts', JSON.stringify([...this.hiddenProducts]));
        
        // Actualizar stats si el panel admin está abierto
        if (this.adminMode) {
            this.updateAdminStats();
            this.renderCategoryManagement();
        }
    }

    toggleAdminMode() {
        this.adminMode = !this.adminMode;
        document.body.classList.toggle('admin-mode', this.adminMode);
        
        const adminPanel = document.getElementById('adminPanel');
        adminPanel.classList.toggle('active', this.adminMode);
        
        const adminBtn = document.getElementById('adminBtn');
        adminBtn.textContent = this.adminMode ? 'Cerrar Admin' : 'Panel Admin';
        
        if (this.adminMode) {
            this.updateAdminStats();
            this.renderCategoryManagement();
        }
    }

    updateAdminStats() {
        const totalProducts = this.products.length;
        const hiddenProducts = this.hiddenProducts.size;
        const visibleProducts = totalProducts - hiddenProducts;
        
        document.getElementById('totalProducts').textContent = totalProducts;
        document.getElementById('visibleProducts').textContent = visibleProducts;
        document.getElementById('hiddenProducts').textContent = hiddenProducts;
    }

    // Función de gestión de categorías mejorada
    renderCategoryManagement() {
        const categoryList = document.getElementById('categoryList');
        categoryList.innerHTML = '';
        
        this.categories.forEach((products, categoryName) => {
            const totalInCategory = products.length;
            const hiddenInCategory = products.filter(p => this.hiddenProducts.has(p.id)).length;
            const visibleInCategory = totalInCategory - hiddenInCategory;
            
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-item';
            categoryItem.innerHTML = `
                <div class="category-header">
                    <span class="category-name">${categoryName}</span>
                    <span class="category-count">${visibleInCategory}/${totalInCategory}</span>
                </div>
                <div class="category-actions">
                    <button class="btn-small-admin" onclick="openCategoryModal('${categoryName}')" style="background: #17a2b8; color: white; border-color: #17a2b8;">
                        📋 Gestionar
                    </button>
                </div>
            `;
            categoryList.appendChild(categoryItem);
        });
    }

    showAllProducts() {
        this.products.forEach(product => {
            if (this.hiddenProducts.has(product.id)) {
                this.hiddenProducts.delete(product.id);
                const card = document.querySelector(`[data-product-id="${product.id}"]`);
                if (card) {
                    card.classList.remove('hidden');
                    card.querySelector('.hidden-indicator')?.remove();
                }
            }
        });
        
        localStorage.setItem('hiddenProducts', JSON.stringify([...this.hiddenProducts]));
        
        if (this.adminMode) {
            this.updateAdminStats();
            this.renderCategoryManagement();
        }
    }

    hideAllProducts() {
        this.products.forEach(product => {
            if (!this.hiddenProducts.has(product.id)) {
                this.hiddenProducts.add(product.id);
                const card = document.querySelector(`[data-product-id="${product.id}"]`);
                if (card) {
                    card.classList.add('hidden');
                    card.insertAdjacentHTML('afterbegin', '<div class="hidden-indicator">Oculto</div>');
                }
            }
        });
        
        localStorage.setItem('hiddenProducts', JSON.stringify([...this.hiddenProducts]));
        
        if (this.adminMode) {
            this.updateAdminStats();
            this.renderCategoryManagement();
        }
    }

    resetHiddenProducts() {
        this.hiddenProducts.clear();
        localStorage.removeItem('hiddenProducts');
        this.showAllProducts();
    }

    // Función de búsqueda mejorada
    searchProducts(query) {
        if (!query.trim()) {
            document.querySelectorAll('.product-card').forEach(card => {
                card.style.display = '';
                card.classList.remove('search-match');
            });
            this.updateSearchResultsInfo('');
            this.hideSearchResultsActions();
            return;
        }
        
        const searchTerm = query.toLowerCase();
        let matchCount = 0;
        
        document.querySelectorAll('.product-card').forEach(card => {
            const productName = card.querySelector('.product-name').textContent.toLowerCase();
            const productRef = card.querySelector('.product-reference').textContent.toLowerCase();
            
            if (productName.includes(searchTerm) || productRef.includes(searchTerm)) {
                card.style.display = '';
                card.classList.add('search-match');
                matchCount++;
            } else {
                card.style.display = 'none';
                card.classList.remove('search-match');
            }
        });
        
        this.updateSearchResultsInfo(query, matchCount);
        
        // Mostrar sugerencia para usar el modal
        if (matchCount > 0) {
            this.showSearchResultsActions();
        } else {
            this.hideSearchResultsActions();
        }
    }

    // Nueva función para mostrar acciones de búsqueda
    showSearchResultsActions() {
        const actionsDiv = document.getElementById('searchResultsActions');
        if (actionsDiv) {
            actionsDiv.style.display = 'block';
        }
    }

    // Nueva función para ocultar acciones de búsqueda
    hideSearchResultsActions() {
        const actionsDiv = document.getElementById('searchResultsActions');
        if (actionsDiv) {
            actionsDiv.style.display = 'none';
        }
    }

    updateSearchResultsInfo(query, matchCount = 0) {
        const resultsInfo = document.getElementById('searchResultsInfo');
        if (!resultsInfo) return;
        
        if (!query) {
            resultsInfo.textContent = '';
            return;
        }
        
        if (matchCount === 0) {
            resultsInfo.innerHTML = `❌ No se encontraron productos para "<span class="search-highlight">${query}</span>"`;
            resultsInfo.style.color = '#dc3545';
        } else {
            resultsInfo.innerHTML = `✅ ${matchCount} producto${matchCount === 1 ? '' : 's'} encontrado${matchCount === 1 ? '' : 's'} para "<span class="search-highlight">${query}</span>"`;
            resultsInfo.style.color = '#28a745';
        }
    }

    // Métodos para el modal de gestión de productos

    // Función mejorada para abrir el modal con búsqueda previa
    openProductModal(searchQuery = '') {
        const modal = document.getElementById('productModal');
        modal.classList.add('active');
        this.populateProductModal();
        document.body.style.overflow = 'hidden';
        
        // Si hay una búsqueda activa, aplicarla en el modal
        if (searchQuery) {
            const modalSearch = document.getElementById('modalSearch');
            modalSearch.value = searchQuery;
            this.filterModalProducts(searchQuery);
        }
    }

    closeProductModal() {
        const modal = document.getElementById('productModal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    populateProductModal() {
        const modalList = document.getElementById('modalProductsList');
        const modalStats = document.getElementById('modalStats');
        
        modalList.innerHTML = '';
        
        // Crear lista de productos ordenados por categoría y nombre
        const sortedProducts = [...this.products].sort((a, b) => {
            const catA = a.itemCategory?.name || 'Sin Categoría';
            const catB = b.itemCategory?.name || 'Sin Categoría';
            
            if (catA !== catB) {
                return catA.localeCompare(catB);
            }
            
            return a.name.localeCompare(b.name);
        });

        sortedProducts.forEach(product => {
            const isHidden = this.hiddenProducts.has(product.id);
            const productItem = document.createElement('div');
            productItem.className = `product-item ${isHidden ? 'hidden-product' : ''}`;
            productItem.setAttribute('data-product-id', product.id);
            
            productItem.innerHTML = `
                <input type="checkbox" 
                       class="product-checkbox" 
                       ${isHidden ? 'checked' : ''} 
                       onchange="toggleProductFromModal('${product.id}')">
                <div class="product-details">
                    <div class="product-name-ref">
                        <div class="product-modal-name">${product.name}</div>
                        <div class="product-modal-ref">Ref: ${product.reference?.reference || 'N/A'}</div>
                    </div>
                    <div class="product-modal-category">
                        ${product.itemCategory?.name || 'Sin Categoría'}
                    </div>
                </div>
            `;
            
            modalList.appendChild(productItem);
        });

        this.updateModalStats();
    }

    updateModalStats() {
        const modalStats = document.getElementById('modalStats');
        const totalProducts = this.products.length;
        const hiddenProducts = this.hiddenProducts.size;
        const visibleProducts = totalProducts - hiddenProducts;
        
        modalStats.textContent = `${totalProducts} productos | ${visibleProducts} visibles | ${hiddenProducts} ocultos`;
    }

    filterModalProducts(query) {
        const searchTerm = query.toLowerCase();
        const productItems = document.querySelectorAll('.product-item');
        
        productItems.forEach(item => {
            const productName = item.querySelector('.product-modal-name').textContent.toLowerCase();
            const productRef = item.querySelector('.product-modal-ref').textContent.toLowerCase();
            
            if (!query || productName.includes(searchTerm) || productRef.includes(searchTerm)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    showAllModalProducts() {
        const checkboxes = document.querySelectorAll('.product-checkbox');
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                checkbox.checked = false;
                const productId = checkbox.closest('.product-item').getAttribute('data-product-id');
                this.hiddenProducts.delete(productId);
                checkbox.closest('.product-item').classList.remove('hidden-product');
            }
        });
        this.updateModalStats();
    }

    hideAllModalProducts() {
        const checkboxes = document.querySelectorAll('.product-checkbox');
        checkboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                checkbox.checked = true;
                const productId = checkbox.closest('.product-item').getAttribute('data-product-id');
                this.hiddenProducts.add(productId);
                checkbox.closest('.product-item').classList.add('hidden-product');
            }
        });
        this.updateModalStats();
    }

    toggleSelectedProducts() {
        const checkboxes = document.querySelectorAll('.product-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = !checkbox.checked;
            const productId = checkbox.closest('.product-item').getAttribute('data-product-id');
            
            if (checkbox.checked) {
                this.hiddenProducts.add(productId);
                checkbox.closest('.product-item').classList.add('hidden-product');
            } else {
                this.hiddenProducts.delete(productId);
                checkbox.closest('.product-item').classList.remove('hidden-product');
            }
        });
        this.updateModalStats();
    }

    applyProductChanges() {
        // Guardar cambios permanentemente
        localStorage.setItem('hiddenProducts', JSON.stringify([...this.hiddenProducts]));
        
        // Actualizar la vista principal
        this.products.forEach(product => {
            const card = document.querySelector(`[data-product-id="${product.id}"]`);
            if (card) {
                const isHidden = this.hiddenProducts.has(product.id);
                
                if (isHidden) {
                    card.classList.add('hidden');
                    if (!card.querySelector('.hidden-indicator')) {
                        card.insertAdjacentHTML('afterbegin', '<div class="hidden-indicator">Oculto</div>');
                    }
                } else {
                    card.classList.remove('hidden');
                    card.querySelector('.hidden-indicator')?.remove();
                }
            }
        });
        
        // Actualizar estadísticas del panel admin
        if (this.adminMode) {
            this.updateAdminStats();
            this.renderCategoryManagement();
        }
        
        // Cerrar modal
        this.closeProductModal();
        
        // Mostrar mensaje de confirmación
        this.showSuccessMessage(`✅ Cambios aplicados: ${this.hiddenProducts.size} productos ocultos`);
    }

    showSuccessMessage(message) {
        const existingMessage = document.querySelector('.success-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'success-message';
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 1001;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.style.opacity = '1';
        }, 100);
        
        setTimeout(() => {
            messageDiv.style.opacity = '0';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.remove();
                }
            }, 300);
        }, 3000);
    }

    // NUEVO MÉTODO: Aplicar bloqueos de gestos - SIN MENSAJES
    applyGestureBlocks() {
        console.log('🛡️ Aplicando bloqueos de gestos...');
        
        // Solo aplicar en dispositivos móviles
        if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            return;
        }
        
        // Variables para control
        let touchStartY = 0;
        let consecutiveRefreshAttempts = 0;
        let activeTouchEvents = new Set();
        
        // FUNCIÓN NUCLEAR: Detectar si es imagen o relacionado
        const isImageRelated = (element) => {
            if (!element) return false;
            
            return element.tagName === 'IMG' || 
                   element.classList.contains('product-image') ||
                   element.classList.contains('company-logo') ||
                   element.classList.contains('product-image-container') ||
                   element.classList.contains('product-image-placeholder') ||
                   element.closest('.product-image-container') !== null ||
                   element.closest('.product-card') !== null ||
                   element.closest('.logo-section') !== null;
        };
        
        // 1. BLOQUEO NUCLEAR DE EVENTOS CONTEXTUALES - SIN MENSAJES
        const nuclearBlocker = (e) => {
            if (isImageRelated(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }
        };
        
        // Remover TODOS los listeners anteriores
        ['contextmenu', 'selectstart', 'dragstart', 'drag', 'dragend', 'copy'].forEach(eventType => {
            document.removeEventListener(eventType, nuclearBlocker, true);
            document.removeEventListener(eventType, nuclearBlocker, false);
        });
        
        // Aplicar bloqueo con MÁXIMA prioridad
        ['contextmenu', 'selectstart', 'dragstart', 'drag', 'dragend', 'copy'].forEach(eventType => {
            document.addEventListener(eventType, nuclearBlocker, { 
                passive: false, 
                capture: true 
            });
            document.addEventListener(eventType, nuclearBlocker, { 
                passive: false, 
                capture: false 
            });
        });
        
        // 2. BLOQUEO NUCLEAR DE TOUCH EVENTS - SIN MENSAJES
        let touchTimers = new Map();
        let preventNextClick = false;
        
        const nuclearTouchStart = (e) => {
            // Procesar cada touch
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                const element = document.elementFromPoint(touch.clientX, touch.clientY);
                
                if (isImageRelated(element)) {
                    const touchId = touch.identifier;
                    activeTouchEvents.add(touchId);
                    
                    // Timer súper agresivo (200ms)
                    const timer = setTimeout(() => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        preventNextClick = true;
                        
                        // Forzar que se suelte el touch
                        element.style.transform = 'scale(0.95)';
                        setTimeout(() => {
                            element.style.transform = '';
                        }, 100);
                        
                    }, 200); // MUY agresivo - 200ms
                    
                    touchTimers.set(touchId, timer);
                }
            }
        };
        
        const nuclearTouchEnd = (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                
                if (touchTimers.has(touchId)) {
                    clearTimeout(touchTimers.get(touchId));
                    touchTimers.delete(touchId);
                }
                
                if (activeTouchEvents.has(touchId)) {
                    const element = document.elementFromPoint(touch.clientX, touch.clientY);
                    if (isImageRelated(element)) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                    }
                    activeTouchEvents.delete(touchId);
                }
            }
            
            // Reset preventNextClick después de un momento
            setTimeout(() => {
                preventNextClick = false;
            }, 500);
        };
        
        const nuclearTouchMove = (e) => {
            // Cancelar TODOS los timers en cualquier movimiento
            touchTimers.forEach((timer) => clearTimeout(timer));
            touchTimers.clear();
        };
        
        const nuclearTouchCancel = (e) => {
            touchTimers.forEach((timer) => clearTimeout(timer));
            touchTimers.clear();
            activeTouchEvents.clear();
        };
        
        // Limpiar listeners anteriores
        ['touchstart', 'touchend', 'touchmove', 'touchcancel'].forEach(eventType => {
            document.removeEventListener(eventType, nuclearTouchStart);
            document.removeEventListener(eventType, nuclearTouchEnd);
            document.removeEventListener(eventType, nuclearTouchMove);
            document.removeEventListener(eventType, nuclearTouchCancel);
        });
        
        // Aplicar nuevos listeners
        document.addEventListener('touchstart', nuclearTouchStart, { passive: false, capture: true });
        document.addEventListener('touchend', nuclearTouchEnd, { passive: false, capture: true });
        document.addEventListener('touchmove', nuclearTouchMove, { passive: false, capture: true });
        document.addEventListener('touchcancel', nuclearTouchCancel, { passive: false, capture: true });
        
        // 3. BLOQUEO DE CLICKS PREVENIR DOBLE ACCIÓN - SIN MENSAJES
        const nuclearClickBlock = (e) => {
            if (preventNextClick && isImageRelated(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }
        };
        
        document.addEventListener('click', nuclearClickBlock, { passive: false, capture: true });
        
        // 4. REEMPLAZAR TODAS LAS IMÁGENES CON VERSIONES SÚPER PROTEGIDAS - SIN MENSAJES
        const nuclearImageProtection = () => {
            const allImages = document.querySelectorAll('img');
            allImages.forEach((img) => {
                // Aplicar estilos directamente
                img.style.webkitTouchCallout = 'none';
                img.style.webkitUserSelect = 'none';
                img.style.webkitUserDrag = 'none';
                img.style.userSelect = 'none';
                img.style.touchAction = 'manipulation';
                img.style.pointerEvents = 'auto';
                img.draggable = false;
                
                // Remover atributos problemáticos
                img.removeAttribute('oncontextmenu');
                img.removeAttribute('ondragstart');
                img.removeAttribute('onselectstart');
                
                // Evento directo en cada imagen
                const imageBlocker = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return false;
                };
                
                ['contextmenu', 'dragstart', 'selectstart', 'copy', 'cut'].forEach(eventType => {
                    img.removeEventListener(eventType, imageBlocker);
                    img.addEventListener(eventType, imageBlocker, { passive: false, capture: true });
                });
                
                // Marcar como protegida
                img.setAttribute('data-protected', 'true');
            });
        };
        
        // Aplicar protección inmediatamente
        nuclearImageProtection();
        
        // Reaplícar cuando se agreguen nuevas imágenes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'IMG' || node.querySelector('img')) {
                            setTimeout(nuclearImageProtection, 100);
                        }
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 5. BLOQUEAR PULL-TO-REFRESH - SIN MENSAJES
        document.removeEventListener('touchstart', this.touchStartHandler);
        document.removeEventListener('touchmove', this.touchMoveHandler);
        
        this.touchStartHandler = (e) => {
            touchStartY = e.touches[0].clientY;
        };
        
        this.touchMoveHandler = (e) => {
            const touchY = e.touches[0].clientY;
            const deltaY = touchY - touchStartY;
            const content = document.getElementById('content');
            const isAtTop = content ? content.scrollTop <= 0 : window.scrollY <= 0;
            
            if (isAtTop && deltaY > 0 && deltaY > 30) {
                e.preventDefault();
                e.stopPropagation();
                consecutiveRefreshAttempts++;
                return false;
            }
        };
        
        document.addEventListener('touchstart', this.touchStartHandler, { passive: false });
        document.addEventListener('touchmove', this.touchMoveHandler, { passive: false });
        
        // 6. BLOQUEAR GESTOS DE ZOOM - SIN MENSAJES
        ['gesturestart', 'gesturechange', 'gestureend'].forEach(eventType => {
            document.addEventListener(eventType, (e) => {
                e.preventDefault();
            }, { passive: false });
        });
        
        // 7. BLOQUEAR DOBLE TAP ZOOM - SIN MENSAJES
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
        
        console.log('✅ Bloqueos de gestos aplicados correctamente (modo silencioso)');
    }
}

// Sistema de acceso administrativo seguro
let adminAccessClicks = 0;
let adminAccessTimer = null;
let adminControlsVisible = false;

function toggleAdminAccess() {
    adminAccessClicks++;
    
    const trigger = document.querySelector('.admin-trigger');
    trigger.classList.add('active');
    
    setTimeout(() => {
        trigger.classList.remove('active');
    }, 200);
    
    if (adminAccessClicks === 1) {
        adminAccessTimer = setTimeout(() => {
            adminAccessClicks = 0;
        }, 3000);
    }
    
    if (adminAccessClicks >= 3) {
        clearTimeout(adminAccessTimer);
        adminAccessClicks = 0;
        
        const hiddenControls = document.getElementById('hiddenControls');
        adminControlsVisible = !adminControlsVisible;
        
        if (adminControlsVisible) {
            hiddenControls.classList.add('visible');
            showAdminAccessMessage('✅ Controles administrativos activados');
            
            setTimeout(() => {
                if (adminControlsVisible) {
                    hideAdminControls();
                }
            }, 30000);
        } else {
            hideAdminControls();
        }
    }
}

function hideAdminControls() {
    const hiddenControls = document.getElementById('hiddenControls');
    hiddenControls.classList.remove('visible');
    adminControlsVisible = false;
    showAdminAccessMessage('🔒 Controles administrativos ocultos');
}

function showAdminAccessMessage(message) {
    const existingMessage = document.querySelector('.admin-access-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'admin-access-message';
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: #333;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 1001;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.opacity = '1';
    }, 100);
    
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 300);
    }, 2000);
}

// Funciones globales
let catalog;

function refreshProducts() {
    if (catalog.adminMode) {
        catalog.forceRefreshFromAdmin();
    } else {
        catalog.toggleAdminMode();
    }
    
    if (adminControlsVisible) {
        setTimeout(hideAdminControls, 1000);
    }
}

function forceUpdateCatalog() {
    catalog.forceRefreshFromAdmin();
}

function toggleAdminPanel() {
    catalog.toggleAdminMode();
    
    if (adminControlsVisible) {
        setTimeout(hideAdminControls, 1000);
    }
}

function toggleProductVisibility(productId) {
    catalog.toggleProductVisibility(productId);
}

function resetHiddenProducts() {
    catalog.resetHiddenProducts();
}

// Funciones de búsqueda principal
function performMainSearch(query) {
    catalog.searchProducts(query);
    
    const clearButton = document.getElementById('searchClear');
    if (query.trim()) {
        clearButton.classList.add('visible');
    } else {
        clearButton.classList.remove('visible');
    }
}

function clearMainSearch() {
    const mainSearch = document.getElementById('mainSearch');
    mainSearch.value = '';
    performMainSearch('');
    mainSearch.focus();
}

function syncSearches(query) {
    const mainSearch = document.getElementById('mainSearch');
    const adminSearch = document.getElementById('productSearch');
    
    if (mainSearch && mainSearch.value !== query) {
        mainSearch.value = query;
        performMainSearch(query);
    }
    
    if (adminSearch && adminSearch.value !== query) {
        adminSearch.value = query;
    }
}

function searchProducts(query) {
    catalog.searchProducts(query);
    syncSearches(query);
}

// Funciones del modal
function openProductModal() {
    catalog.openProductModal();
}

function closeProductModal() {
    catalog.closeProductModal();
}

function filterModalProducts(query) {
    catalog.filterModalProducts(query);
}

function showAllModalProducts() {
    catalog.showAllModalProducts();
}

function hideAllModalProducts() {
    catalog.hideAllModalProducts();
}

function toggleSelectedProducts() {
    catalog.toggleSelectedProducts();
}

function applyProductChanges() {
    catalog.applyProductChanges();
}

function toggleProductFromModal(productId) {
    const checkbox = event.target;
    const productItem = checkbox.closest('.product-item');
    
    if (checkbox.checked) {
        catalog.hiddenProducts.add(productId);
        productItem.classList.add('hidden-product');
    } else {
        catalog.hiddenProducts.delete(productId);
        productItem.classList.remove('hidden-product');
    }
    
    catalog.updateModalStats();
}

// Función para abrir modal con categoría específica
function openCategoryModal(categoryName) {
    catalog.openProductModal();
    
    // Filtrar por categoría en el modal
    setTimeout(() => {
        const modalSearch = document.getElementById('modalSearch');
        modalSearch.value = categoryName;
        catalog.filterModalProducts(categoryName);
    }, 100);
}

// Función mejorada para abrir modal desde búsqueda
function openModalWithSearch() {
    const currentSearch = document.getElementById('productSearch').value;
    catalog.openProductModal(currentSearch);
}

// Cerrar modal al hacer click fuera
document.addEventListener('click', function(event) {
    const modal = document.getElementById('productModal');
    if (event.target === modal) {
        catalog.closeProductModal();
    }
});

// Cerrar modal con ESC
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('productModal');
        if (modal.classList.contains('active')) {
            catalog.closeProductModal();
        }
    }
});


// Handle online/offline status
window.addEventListener('online', () => {
    if (catalog) {
        catalog.updateStatus('online', 'En línea');
    }
});

window.addEventListener('offline', () => {
    if (catalog) {
        catalog.updateStatus('offline', 'Sin conexión');
    }
});

// Header scroll behavior - REEMPLAZAR TODO EL CÓDIGO ANTERIOR
let lastScrollTop = 0;
let isScrolling = false;

function handleHeaderScroll() {
    if (!isScrolling) {
        window.requestAnimationFrame(() => {
            const header = document.querySelector('.header');
            const container = document.querySelector('.container');
            if (!header || !container) return;
            
            const content = document.getElementById('content');
            const scrollTop = content ? content.scrollTop : 0;
            
            // Solo ocultar si scroll hacia abajo y después de 80px
            if (scrollTop > lastScrollTop && scrollTop > 80) {
                header.classList.add('hidden');
                container.classList.add('header-hidden'); 
            } else {
                header.classList.remove('hidden');
                container.classList.remove('header-hidden');
            }
            
            lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
            isScrolling = false;
        });
    }
    isScrolling = true;
}

// REGISTRO DEL SERVICE WORKER - CÓDIGO NUEVO

// Función para registrar Service Worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            console.log('🔄 Registrando Service Worker...');
            
            const registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/'
            });
            
            console.log('✅ Service Worker registrado:', registration.scope);
            
            // Escuchar actualizaciones
            registration.addEventListener('updatefound', () => {
                console.log('🔄 Nueva versión del Service Worker disponible');
                const newWorker = registration.installing;
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            // Hay una nueva versión
                            showUpdateAvailable();
                        }
                    }
                });
            });
            
            // Escuchar cuando el SW toma control
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('🔄 Service Worker tomó control - recargando...');
                window.location.reload();
            });
            
            // Configurar limpieza automática de cache
            setInterval(() => {
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'CLEAN_CACHE'
                    });
                }
            }, 24 * 60 * 60 * 1000); // Cada 24 horas
            
        } catch (error) {
            console.error('❌ Error registrando Service Worker:', error);
        }
    } else {
        console.warn('⚠️ Service Workers no soportados en este navegador');
    }
}

// Función para mostrar notificación de actualización disponible
function showUpdateAvailable() {
    const updateNotification = document.createElement('div');
    updateNotification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #17a2b8;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
    `;
    updateNotification.innerHTML = `
        🔄 Nueva versión disponible<br>
        <small>Toque para actualizar</small>
    `;
    
    updateNotification.onclick = () => {
        window.location.reload();
    };
    
    document.body.appendChild(updateNotification);
    
    setTimeout(() => {
        if (updateNotification.parentNode) {
            updateNotification.remove();
        }
    }, 10000);
}

// Verificar estado del Service Worker
async function checkServiceWorkerStatus() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        try {
            const channel = new MessageChannel();
            
            channel.port1.onmessage = (event) => {
                if (event.data.type === 'STATUS_RESPONSE') {
                    console.log('📊 Service Worker status:', event.data);
                    
                    if (!event.data.online && event.data.cacheReady) {
                        catalog.updateStatus('offline', '📱 Funcionando sin conexión');
                    }
                }
            };
            
            navigator.serviceWorker.controller.postMessage({
                type: 'GET_STATUS'
            }, [channel.port2]);
            
        } catch (error) {
            console.error('Error checking SW status:', error);
        }
    }
}

// INICIALIZACIÓN PRINCIPAL - MODIFICADA
document.addEventListener('DOMContentLoaded', function() {
    // Registrar Service Worker PRIMERO
    registerServiceWorker();
    
    // Inicializar catálogo
    catalog = new ProductCatalog();
    
    // Configurar scroll listener para header
    const content = document.getElementById('content');
    if (content) {
        content.addEventListener('scroll', handleHeaderScroll, { passive: true });
    }
    
    // Verificar estado del SW después de un momento
    setTimeout(checkServiceWorkerStatus, 2000);
});

// FORZAR MODO QUIOSCO EN CHROME
function enableKioskMode() {
    // 1. Ir a pantalla completa automáticamente
    function requestFullscreen() {
        const element = document.documentElement;
        
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    }
    
    // 2. Bloquear salida de pantalla completa
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            setTimeout(requestFullscreen, 500);
        }
    });
    
    document.addEventListener('webkitfullscreenchange', () => {
        if (!document.webkitFullscreenElement) {
            setTimeout(requestFullscreen, 500);
        }
    });
    
    // 3. Bloquear teclas de escape
    document.addEventListener('keydown', (e) => {
        // Bloquear F11, Esc, Alt+Tab, etc.
        if (e.key === 'Escape' || e.key === 'F11' || 
            (e.altKey && e.key === 'Tab') ||
            (e.ctrlKey && e.key === 'w') ||
            (e.ctrlKey && e.key === 'q')) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });
    
    // 4. Ocultar cursor después de inactividad
    let cursorTimer;
    function hideCursor() {
        document.body.style.cursor = 'none';
    }
    
    function showCursor() {
        document.body.style.cursor = 'default';
        clearTimeout(cursorTimer);
        cursorTimer = setTimeout(hideCursor, 5000); // 5 segundos
    }
    
    document.addEventListener('mousemove', showCursor);
    document.addEventListener('touchstart', showCursor);
    
    // 5. Prevenir zoom con rueda del mouse
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }, { passive: false });
    
    // 6. Activar pantalla completa al cargar
    document.addEventListener('click', requestFullscreen, { once: true });
    
    // 7. Auto-pantalla completa después de 3 segundos si no hay interacción
    setTimeout(() => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            requestFullscreen();
        }
    }, 3000);
    
    console.log('🖥️ Modo quiosco activado');
}

// Activar al cargar la página
document.addEventListener('DOMContentLoaded', enableKioskMode);

// AGREGAR AL FINAL DE TU script.js: