import React, { useEffect } from 'react';
import { useAppContext } from './core/AppContext';
import { Header } from './components/Header';
import { CategorySection } from './components/CategorySection';
import { SyncOverlay } from './components/SyncOverlay';
import { applyGestureBlocks } from './utils/security'; // Will create this next
import './index.css';

export const AppLayout = () => {
    const { filteredData, isLoading } = useAppContext();

    useEffect(() => {
        applyGestureBlocks();
    }, []);

    if (isLoading) {
        return (
            <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
                <div className="sync-spinner"></div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <Header />

            <main className="content" id="content">
                {filteredData.flat.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <h3>Catálogo Vacío</h3>
                        <p>No hay productos disponibles actualmente.</p>
                        <p style={{ fontSize: '0.9rem', color: '#888', marginTop: '10px' }}>
                            Conéctate a internet y presiona "Actualizar Catálogo"
                        </p>
                    </div>
                ) : (
                    filteredData.sortedKeys.map(category => (
                        <CategorySection
                            key={category}
                            title={category}
                            products={filteredData.grouped[category]}
                        />
                    ))
                )}
            </main>

            <SyncOverlay />
        </div>
    );
};
