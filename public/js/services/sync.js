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
        const limit = 30; // ⚠️ IMPORTANTE: Alegra tiene límite duro de 30. No subir.
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

                if (activeBatch.length > 0) {
                    await dbData.saveProducts(activeBatch);
                    newBuffer.push(...activeBatch);
                    totalSynced += activeBatch.length;
                }

                // Actualizar UI
                updateStatus(`📥 Sincronizados: ${totalSynced} productos...`);
                
                // Actualizar Overlay (estimado, ya que no sabemos el total exacto al inicio)
                // Usamos un logaritmo inverso o simplemente mostramos contador
                updateSyncUI(`Cargados: ${totalSynced} productos`, Math.min(95, (totalSynced / 500) * 100));

                // Dibujado progresivo inicial
                if (state.products.length === 0 && newBuffer.length >= 50) {
                    state.setProducts([...newBuffer]); // Copia para no romper ref
                    renderer.renderInitial();
                }

                // Chequeo de fin ROBUSTO
                // El server filtra productos inactivos, por lo que un batch puede ser < limit
                // pero aún haber más datos en Alegra.
                // Usamos la bandera 'has_more' del servidor si existe.
                
                if (data.debug && typeof data.debug.has_more === 'boolean') {
                    if (!data.debug.has_more) {
                        hasMore = false;
                        console.log(`🏁 Fin detectado por servidor en start=${result.start}`);
                    }
                } else {
                    // Fallback legacy por si el server no manda debug info
                    if (batch.length < limit) {
                        hasMore = false;
                        console.log(`🏁 Fin detectado por tamaño de batch (${batch.length} < ${limit}) en start=${result.start}`);
                    }
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

        updateStatus('⚠️ Offline / Error');
    } finally {
        state.isSyncing = false;
        // Ocultar overlay
        const overlay = document.getElementById('syncOverlay');
        if (overlay) overlay.style.display = 'none';
    }
}

function updateSyncUI(message, percentage) {
    const overlay = document.getElementById('syncOverlay');
    const msgEl = document.getElementById('syncMessage');
    const fillEl = document.getElementById('syncProgressFill');
    
    if (overlay && overlay.style.display === 'none') {
        overlay.style.display = 'flex';
    }
    
    if (msgEl) msgEl.textContent = message;
    if (fillEl && percentage !== undefined) {
        fillEl.style.width = `${percentage}%`;
    }
}
