import React, { useState } from 'react';
import { Search, X, Loader2, Info } from 'lucide-react';
import { useAppContext } from '../core/AppContext';
import { useSync } from '../hooks/useSync';

export const Header = () => {
    const { searchQuery, setSearchQuery, isSyncing, lastSync, setIsAdminMode } = useAppContext();
    const { synchronize } = useSync();

    // Admin unlock logic
    const [clickCount, setClickCount] = useState(0);

    const handleLogoClick = () => {
        setClickCount(prev => prev + 1);
        setTimeout(() => setClickCount(0), 1000);
        if (clickCount >= 2) { // 3 clicks total req (0, 1, 2)
            setIsAdminMode(prev => !prev);
            setClickCount(0);
        }
    };

    const handleSearch = (e) => {
        setSearchQuery(e.target.value);
    };

    const clearSearch = () => {
        setSearchQuery('');
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'Nunca';
        const date = new Date(timestamp);
        return date.toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <header className="app-header header" id="mainHeader">
            <div className="header-top">
                <div className="logo-section" onClick={handleLogoClick}>
                    <img src="/color2.png" alt="Logo" className="company-logo" />
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-outline"
                        onClick={synchronize}
                        disabled={isSyncing}
                        id="updateBtn"
                    >
                        {isSyncing ? (
                            <>
                                <Loader2 className="btn-icon spin" size={16} />
                                <span className="btn-text">Actualizando...</span>
                            </>
                        ) : (
                            <>
                                <Loader2 className="btn-icon" size={16} style={{ display: 'none' }} /> {/* Placeholder for gap */}
                                <span className="btn-text">Actualizar Catálogo</span>
                            </>
                        )}
                    </button>
                    {/* Placeholder for menu button if needed */}
                </div>
            </div>

            <div className="sync-info">
                <div className="sync-status" id="statusIndicator">
                    {isSyncing ? 'Sincronizando...' : (navigator.onLine ? 'En línea' : 'Modo Offline')}
                </div>
                <div className="last-sync-time">
                    Última act: <span id="lastUpdateSpan">{formatDate(lastSync)}</span>
                </div>
            </div>

            <div className="search-container">
                <div className="search-box">
                    <Search className="search-icon" size={18} />
                    <input
                        type="text"
                        id="mainSearch"
                        className="search-input"
                        placeholder="Buscar por nombre o referencia..."
                        value={searchQuery}
                        onChange={handleSearch}
                    />
                    {searchQuery && (
                        <button className="search-clear" onClick={clearSearch}>
                            <X size={16} />
                        </button>
                    )}
                </div>
                <div id="searchResultsInfo" className="search-results-info">
                    {searchQuery && (
                        <span style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px', display: 'block' }}>
                            Buscando: {searchQuery}
                        </span>
                    )}
                </div>
            </div>

            <div id="offlineBanner" className="offline-banner" style={{ display: navigator.onLine ? 'none' : 'flex' }}>
                <Info size={16} /> Estás viendo la versión offline guardada en este dispositivo
            </div>
        </header>
    );
};
