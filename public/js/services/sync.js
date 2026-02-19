import { config } from '../config.js';
import { dbData } from '../core/db.js';
import { state } from '../core/state.js';
import { renderer } from '../ui/render.js';
import { showBanner } from '../ui/components.js';

export async function startBackgroundSync(force = false) {
    if (state.isSyncing) return;
    state.isSyncing = true;
    
    const updateStatus = (msg) => {
        const indicator = document.getElementById('statusIndicator');
        if (indicator) indicator.textContent = msg;
    };

    updateStatus('🔄 Sincronizando...');
    
    try {
        let start = 0;
        const limit = 50; 
        let hasMore = true;
        let totalSynced = 0;
        let newBuffer = [];

        if (force) {
            state.setProducts([]);
            renderer.clear();
            await dbData.clearProducts();
        }

        while (hasMore) {
            const response = await fetch(`${config.apiUrl}?start=${start}&limit=${limit}`);
            if (!response.ok) throw new Error(`API Error ${response.status}`);
            
            const data = await response.json();
            const batch = data.products || (Array.isArray(data) ? data : []);
            
            if (batch.length === 0) {
                hasMore = false;
                break;
            }

            // Filtrar activos si es necesario, o guardar todo y filtrar en memoria
            const activeBatch = batch.filter(p => p.status === 'active');

            await dbData.saveProducts(activeBatch);
            newBuffer.push(...activeBatch);
            totalSynced += activeBatch.length;
            
            updateStatus(`📥 Descargando... (${totalSynced})`);

            // Si es la primera carga visual, dibujar algo rápido
            if (state.products.length === 0 && newBuffer.length > 0) {
                state.setProducts(newBuffer);
                renderer.renderInitial();
            }

            if (data.debug && !data.debug.has_more) hasMore = false;
            if (batch.length < limit) hasMore = false;

            start += limit;
            await new Promise(r => setTimeout(r, 50));
        }

        await dbData.saveLastUpdate();
        
        // Recargar todo limpio de DB para asegurar consistencia
        const allProducts = await dbData.getAllProducts();
        state.setProducts(allProducts);
        
        // Refrescar UI si no hay búsqueda activa
        if (!document.getElementById('mainSearch').value.trim()) {
            renderer.updateCategoryCounts();
            if (renderer.renderedCount === 0) renderer.renderInitial();
        }

        updateStatus(`✅ Sincronizado (${allProducts.length})`);
        showBanner('Sincronización completada', 'success');

    } catch (error) {
        console.error('Sync Error:', error);
        updateStatus('⚠️ Offline / Error');
    } finally {
        state.isSyncing = false;
    }
}
