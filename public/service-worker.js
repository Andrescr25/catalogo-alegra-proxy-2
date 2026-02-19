const CACHE_NAME = 'catalogo-v1.4';
const STATIC_ASSETS = [
    '/',
    '/index.html', 
    '/styles.css',
    '/script.js',
    '/db.js',
    '/color2.png',
    // Agregará automáticamente las fuentes del sistema
];

// URLs de API que deben funcionar offline
const API_PATTERNS = [
    '/api/productos'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log('📦 Service Worker: Instalando...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Service Worker: Cacheando archivos estáticos');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('✅ Service Worker: Instalación completa');
                // Forzar activación inmediata
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Service Worker: Error en instalación:', error);
            })
    );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    console.log('🔄 Service Worker: Activando...');
    
    event.waitUntil(
        // Limpiar caches antiguos
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('🗑️ Service Worker: Eliminando cache antiguo:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Service Worker: Activado y tomando control');
                // Tomar control inmediato de todas las pestañas
                return self.clients.claim();
            })
    );
});

// Interceptar todas las peticiones
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Solo manejar peticiones HTTP/HTTPS
    if (!request.url.startsWith('http')) {
        return;
    }
    
    // Estrategia para archivos estáticos: Cache First
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request));
        return;
    }
    
    // Estrategia para API: Network First con fallback a cache
    if (isAPIRequest(url)) {
        event.respondWith(networkFirstAPI(request));
        return;
    }
    
    // Para todo lo demás: Cache First con fallback a network
    event.respondWith(cacheFirst(request));
});

// Detectar si es un archivo estático
function isStaticAsset(url) {
    const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
    const pathname = url.pathname.toLowerCase();
    
    return staticExtensions.some(ext => pathname.endsWith(ext)) ||
           pathname === '/' ||
           pathname === '/index.html';
}

// Detectar si es una petición a la API
function isAPIRequest(url) {
    return API_PATTERNS.some(pattern => url.pathname.startsWith(pattern));
}

// Estrategia Cache First (para archivos estáticos)
async function cacheFirst(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Manejo especial para imágenes de CDN (Alegra)
        if (request.destination === 'image' && request.url.includes('cdn3.alegra.com')) {
            // Si la petición original es 'no-cors' (<img> normal), podemos devolver opaco
            // Si es 'cors', NO podemos devolver opaco.
            // Pero las imágenes en HTML son no-cors por defecto.
            
            if (request.mode === 'no-cors' || request.mode === 'navigate') { 
                try {
                    const fetchOptions = {
                        mode: 'no-cors',
                        credentials: 'omit'
                    };
                    const networkResponse = await fetch(request.url, fetchOptions);
                    if (networkResponse) {
                        const cache = await caches.open(CACHE_NAME);
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    }
                } catch (e) {
                    console.warn('Fallo imagen CDN (no-cors):', request.url);
                }
            }
            // Si es cors, intentamos fetch normal, si falla (CORS), devolvemos fallback
        }

        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;

    } catch (error) {
        // Fallback para imágenes si falla todo (incluyendo CORS)
        if (request.destination === 'image') {
             // SVG transparente de 1x1
             return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', { 
                 headers: { 'Content-Type': 'image/svg+xml' } 
             });
        }

        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        throw error;
    }
}

// Estrategia Network First para API (con cache como fallback)
async function networkFirstAPI(request) {
    try {
        console.log('🌐 API request:', request.url);
        
        // Intentar red primero
        const networkResponse = await fetch(request, {
            // Configuración específica para API
            cache: 'no-cache',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (networkResponse.ok) {
            // Guardar respuesta exitosa en cache
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
            console.log('✅ API response cached:', request.url);
            return networkResponse;
        } else {
            throw new Error(`API error: ${networkResponse.status}`);
        }
        
    } catch (error) {
        console.warn('⚠️ Network failed for API, trying cache:', error.message);
        
        // Si falla la red, intentar cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('📦 Using cached API response for:', request.url);
            
            // Agregar headers para indicar que viene de cache
            const response = cachedResponse.clone();
            response.headers.set('X-Served-By', 'Service-Worker-Cache');
            
            return response;
        }
        
        // Si no hay cache, re-lanzar el error
        console.error('❌ No cached data available for:', request.url);
        throw error;
    }
}

// Limpiar cache periódicamente (cada 24 horas)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLEAN_CACHE') {
        cleanOldCache();
    }
});

async function cleanOldCache() {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    
    for (const request of requests) {
        const response = await cache.match(request);
        const cacheDate = response.headers.get('date');
        
        if (cacheDate) {
            const age = Date.now() - new Date(cacheDate).getTime();
            const maxAge = 24 * 60 * 60 * 1000; // 24 horas
            
            if (age > maxAge && !isStaticAsset(new URL(request.url))) {
                await cache.delete(request);
                console.log('🗑️ Cleaned old cache entry:', request.url);
            }
        }
    }
}

// Notificar estado a la aplicación
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_STATUS') {
        event.ports[0].postMessage({
            type: 'STATUS_RESPONSE',
            online: navigator.onLine,
            cacheReady: true
        });
    }
});

console.log('🚀 Service Worker cargado correctamente');