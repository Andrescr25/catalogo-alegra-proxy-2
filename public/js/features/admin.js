import { state } from '../core/state.js';
import { renderer } from '../ui/render.js';
import { startBackgroundSync } from '../services/sync.js';

export function performSearch(query) {
    const term = query.toLowerCase().trim();
    if (!term) {
        state.visibleProducts = [...state.products];
    } else {
        state.visibleProducts = state.products.filter(p => {
            const name = p.name ? p.name.toLowerCase() : '';
            const ref = p.reference?.reference ? p.reference.reference.toLowerCase() : '';
            return name.includes(term) || ref.includes(term);
        });
    }
    
    state.organizeByCategories();
    renderer.renderInitial();
    
    updateSearchResultsInfo(term, state.visibleProducts.length);
}

function updateSearchResultsInfo(query, count) {
    const info = document.getElementById('searchResultsInfo');
    if (!info) return;
    if (!query) {
        info.textContent = '';
        return;
    }
    info.innerHTML = count === 0 
        ? `❌ Sin resultados para "${query}"` 
        : `✅ ${count} resultados`;
}

// --- Admin Features ---

export function toggleAdmin() {
    state.isAdminMode = !state.isAdminMode;
    document.body.classList.toggle('admin-mode', state.isAdminMode);
    document.getElementById('adminPanel').classList.toggle('active', state.isAdminMode);
    updateAdminStats();
}

export function updateAdminStats() {
    if (!state.isAdminMode) return;
    document.getElementById('totalProducts').textContent = state.products.length;
    document.getElementById('hiddenProducts').textContent = state.hiddenProducts.size;
    document.getElementById('visibleProducts').textContent = state.products.length - state.hiddenProducts.size;
}

export function forceUpdate() {
    startBackgroundSync(true);
}

export function resetHidden() {
    state.resetHidden();
    // Renderizar de nuevo para mostrar los ocultos
    const currentScroll = document.getElementById('content').scrollTop;
    renderer.renderInitial(); 
    // Intentar restaurar scroll (aproximado)
    // document.getElementById('content').scrollTop = currentScroll; 
    updateAdminStats();
}

export function openProductModal() {
    alert('Funcionalidad de gestión detallada en desarrollo para versión DB');
}
