import { useAppContext } from '../core/AppContext';
import { dbData } from '../core/db';

const API_URL = '/api/productos';

export const useSync = () => {
    const { setProducts, setLastSync, setIsSyncing, setSyncProgress } = useAppContext();

    const updateSyncUI = (msg, percent) => {
        setSyncProgress({ message: msg, percent });
    };

    const synchronize = async () => {
        setIsSyncing(true);
        updateSyncUI('Iniciando sincronización...', 5);
        
        try {
            let start = 0;
            const limit = 30; // Limite Alegra
            let hasMore = true;
            let totalSynced = 0;
            let newBuffer = [];
            const CONCURRENCY = 5;

            await dbData.clearProducts(); // Full reset for clean sync

            while (hasMore) {
                const promises = [];
                for (let i = 0; i < CONCURRENCY; i++) {
                    if (!hasMore) break;
                    
                    const currentStart = start + (i * limit);
                    const p = fetch(`${window.location.origin}${API_URL}?start=${currentStart}&limit=${limit}`)
                        .then(res => res.ok ? res.json() : Promise.reject(`Status ${res.status}`))
                        .then(data => ({ start: currentStart, data, ok: true }))
                        .catch(err => ({ start: currentStart, err, ok: false }));
                    
                    promises.push(p);
                }

                if (promises.length === 0) break;

                const results = await Promise.all(promises);

                for (const result of results) {
                    if (!result.ok) continue;

                    const data = result.data;
                    const batch = data.products || (Array.isArray(data) ? data : []);
                    
                    if (batch.length === 0) {
                        hasMore = false;
                    }

                    const activeBatch = batch.filter(p => p.status === 'active');
                    if (activeBatch.length > 0) {
                        newBuffer.push(...activeBatch);
                        totalSynced += activeBatch.length;
                    }

                    updateSyncUI(`Cargando productos: ${totalSynced} ...`, Math.min(95, (totalSynced / 600) * 100));

                    if (data.debug && typeof data.debug.has_more === 'boolean') {
                        if (!data.debug.has_more) hasMore = false;
                    } else if (batch.length < limit) {
                        hasMore = false;
                    }
                }
                
                start += (promises.length * limit);
            }

            // Save text data
            await dbData.saveProducts(newBuffer);
            
            // Image Cache Process
            updateSyncUI('Preparando descarga de imágenes...', 95);
            const imageUrls = new Set();
            newBuffer.forEach(product => {
                if (product.images && product.images.length > 0) {
                    const favoriteImage = product.images.find(img => img.favorite === true) || product.images[0];
                    if (favoriteImage && favoriteImage.url) {
                        imageUrls.add(favoriteImage.url);
                    }
                }
            });

            const urlsArray = Array.from(imageUrls);
            const totalImages = urlsArray.length;
            let downloadedImages = 0;

            if (totalImages > 0) {
                const PREFETCH_CONCURRENCY = 10;
                for (let i = 0; i < urlsArray.length; i += PREFETCH_CONCURRENCY) {
                    const chunk = urlsArray.slice(i, i + PREFETCH_CONCURRENCY);
                    const promises = chunk.map(url => {
                        return new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => resolve();
                            img.onerror = () => resolve(); 
                            img.src = url; 
                        });
                    });
                    
                    await Promise.all(promises);
                    downloadedImages += chunk.length;
                    const progress = Math.min(100, (downloadedImages / totalImages) * 100);
                    updateSyncUI(`Guardando imágenes: ${Math.min(downloadedImages, totalImages)} / ${totalImages}`, progress);
                }
            }

            // Finalize
            const timestamp = Date.now();
            await dbData.saveLastUpdate(timestamp);
            setProducts(newBuffer);
            setLastSync(timestamp);
            
            setIsSyncing(false);
            return { success: true, count: newBuffer.length };

        } catch (error) {
            console.error("Sync error:", error);
            setIsSyncing(false);
            return { success: false, error: error.message };
        }
    };

    return { synchronize };
};
