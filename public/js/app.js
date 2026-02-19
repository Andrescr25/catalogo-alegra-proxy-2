import { dbData } from './core/db.js';
import { state } from './core/state.js';
import { renderer } from './ui/render.js';
import { startBackgroundSync } from './services/sync.js';
import { applyGestureBlocks } from './utils/security.js';
import * as admin from './features/admin.js';

// Inicialización Global
console.log('📜 Cargando app.js...');

async function initApp() {
    console.log('🚀 Iniciando App Modular...');
    
    try {
        await dbData.connect();
        const loaded = await state.loadFromDB();
        
        if (loaded) {
            renderer.renderInitial();
            const lastUpdate = await dbData.getLastUpdate();
            console.log('📦 Datos locales cargados. Última actualización:', lastUpdate);
        } else {
            console.log('📦 Sin datos locales. Iniciando sync...');
            if (!navigator.onLine) {
                renderer.showError('No hay datos descargados y no tienes conexión a internet. Conéctate para la primera sincronización.');
            }
        }

        // Si hay red, sincronizar
        if (navigator.onLine) {
            startBackgroundSync();
        }
        
        // Limpieza proactiva de cache
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAN_CACHE' });
        }

        setupEventListeners();
        
        // Seguridad
        setTimeout(applyGestureBlocks, 1000);

    } catch (error) {
        console.error('Error init:', error);
        renderer.showError('Error iniciando aplicación: ' + error.message);
    }
}

// Timeout de seguridad por si se cuelga la carga
setTimeout(() => {
    const loading = document.getElementById('loading');
    if (loading && document.body.contains(loading)) {
        console.warn('⚠️ Safety Timeout: App taking too long to load.');
        if (state.products.length > 0) {
             renderer.renderInitial(); // Si ya hay algo, mostrarlo
        } else {
             renderer.showError('La carga está tardando demasiado. Por favor recarga la página.');
        }
    }
}, 8000);

function setupEventListeners() {
    // Scroll infinito
    const content = document.getElementById('content');
    content.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = content;
        if (scrollHeight - scrollTop - clientHeight < 500) {
            renderer.renderNextBatch();
        }
    });

    // Eventos de estado de red
    window.addEventListener('online', () => startBackgroundSync());
    window.addEventListener('offline', () => console.log('Modo Offline'));
}

// Exponer funciones globales para el HTML (onclick handlers)
// Asignación explícita al objeto window
// Exponer funciones globales para el HTML (onclick handlers)
try {
    console.log('🔗 Asignando funciones globales...');
    window.resetHiddenProducts = () => admin.resetHidden();
    window.forceUpdateCatalog = () => admin.forceUpdate();
    window.openProductModal = () => admin.openProductModal();
    window.performMainSearch = (val) => admin.performSearch(val);
    window.clearMainSearch = () => {
        const input = document.getElementById('mainSearch');
        if(input) input.value = '';
        admin.performSearch('');
    };
    
    // Asignar también al objeto globalThis por si acaso
    globalThis.forceUpdateCatalog = window.forceUpdateCatalog;
    
    console.log('✅ Funciones globales asignadas correctamente.');
    console.log('TEST: forceUpdateCatalog es:', typeof window.forceUpdateCatalog);
} catch (e) {
    console.error('❌ Error asignando funciones globales:', e);
}
window.toggleAdminAccess = () => {
    // Lógica simple de 3 clicks
    if (!window.clickCount) window.clickCount = 0;
    window.clickCount++;
    setTimeout(() => window.clickCount = 0, 1000);
    if (window.clickCount >= 3) {
        const controls = document.getElementById('hiddenControls');
        if(controls) controls.style.display = 'flex';
        
        const refreshBtn = document.getElementById('refreshBtn');
        if(refreshBtn) refreshBtn.style.display = 'block';
    }
};
window.toggleAdminPanel = () => admin.toggleAdmin();

// Arrancar
initApp();
