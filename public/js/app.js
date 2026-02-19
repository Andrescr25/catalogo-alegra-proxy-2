import { dbData } from './core/db.js';
import { state } from './core/state.js';
import { renderer } from './ui/render.js';
import { startBackgroundSync } from './services/sync.js';
import { applyGestureBlocks } from './utils/security.js';
import * as admin from './features/admin.js';

// Inicialización Global
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
        }

        // Si hay red, sincronizar
        if (navigator.onLine) {
            startBackgroundSync();
        }

        setupEventListeners();
        
        // Seguridad
        setTimeout(applyGestureBlocks, 1000);

    } catch (error) {
        console.error('Error init:', error);
    }
}

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
window.refreshProducts = () => admin.forceUpdate();
window.toggleAdminPanel = () => admin.toggleAdmin();
window.performMainSearch = (val) => admin.performSearch(val);
window.clearMainSearch = () => {
    document.getElementById('mainSearch').value = '';
    admin.performSearch('');
};


window.resetHiddenProducts = () => admin.resetHidden();
window.forceUpdateCatalog = () => admin.forceUpdate();
window.openProductModal = () => admin.openProductModal();

window.toggleAdminAccess = () => {
    // Lógica simple de 3 clicks
    if (!window.clickCount) window.clickCount = 0;
    window.clickCount++;
    setTimeout(() => window.clickCount = 0, 1000);
    if (window.clickCount >= 3) {
        document.getElementById('hiddenControls').style.display = 'flex';
        // Mostrar también el botón de forzar actualización si estaba oculto
        const refreshBtn = document.getElementById('refreshBtn');
        if(refreshBtn) refreshBtn.style.display = 'block';
    }
};

// Arrancar
initApp();
