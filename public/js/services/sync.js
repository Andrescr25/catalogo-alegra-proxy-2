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

        // Optimización: Fetch en paralelo con ventana deslizante
        const CONCURRENCY = 5; // Cantidad de peticiones simultáneas
        let batchIndex = 0;
        let activeRequests = 0;

        while (hasMore) {
            // Preparar lote de promesas
            const promises = [];
            const starts = [];

            for (let i = 0; i < CONCURRENCY; i++) {
                if (!hasMore) break;
                
                const currentStart = start + (i * limit);
                starts.push(currentStart);
                
                const p = fetch(`${config.apiUrl}?start=${currentStart}&limit=${limit}`)
                    .then(res => res.ok ? res.json() : Promise.reject(`Status ${res.status}`))
                    .then(data => ({ start: currentStart, data, ok: true }))
                    .catch(err => ({ start: currentStart, err, ok: false }));
                
                promises.push(p);
            }

            if (promises.length === 0) break;

            updateStatus(`📥 Descargando lote ${Math.floor(start/limit) + 1}...`);
            
            // Esperar a que el lote completo termine (Promise.all)
            // Nota: Podríamos hacerlo más sofisticado con un pool dinámico, 
            // pero por lotes es más seguro para mantener el orden de "hasMore"
            const results = await Promise.all(promises);

            // Procesar resultados en orden
            for (const result of results) {
                if (!result.ok) {
                    console.error(`Error en batch ${result.start}:`, result.err);
                    continue; 
                }

                const data = result.data;
                const batch = data.products || (Array.isArray(data) ? data : []);
                
                if (batch.length === 0) {
                    hasMore = false;
                    // No break aquí para procesar los otros del lote que quizás sí trajeron algo (raro pero posible)
                }

                const activeBatch = batch.filter(p => p.status === 'active');
                if (activeBatch.length > 0) {
                    await dbData.saveProducts(activeBatch);
                    newBuffer.push(...activeBatch);
                    totalSynced += activeBatch.length;
                }

                // Actualizar UI
                updateStatus(`📥 Sincronizados: ${totalSynced} productos...`);

                // Dibujado progresivo inicial
                if (state.products.length === 0 && newBuffer.length >= 50) {
                    state.setProducts([...newBuffer]); // Copia para no romper ref
                    renderer.renderInitial();
                }

                // Chequeo de fin
                if (batch.length < limit) {
                    hasMore = false;
                }
            }

            // Preparar siguiente ventana
            start += (promises.length * limit);
            
            // Pequeña pausa para dar respiro al UI y red
            await new Promise(r => setTimeout(r, 100));
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
