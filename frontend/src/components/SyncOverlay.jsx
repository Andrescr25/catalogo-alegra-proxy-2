import React from 'react';
import { useAppContext } from '../core/AppContext';

export const SyncOverlay = () => {
    const { isSyncing, syncProgress } = useAppContext();

    if (!isSyncing) return null;

    return (
        <div className="sync-overlay" style={{ display: 'flex' }}>
            <div className="sync-spinner"></div>
            <div className="sync-text">Sincronizando Catálogo...</div>
            <div className="sync-description" id="syncMessage">{syncProgress.message || 'Por favor espera...'}</div>
            <div className="sync-progress">
                <div className="sync-progress-fill" id="syncProgressFill" style={{ width: `${syncProgress.percent}%` }}></div>
            </div>
            <div className="sync-warning">No cierres esta pestaña durante la actualización.</div>
        </div>
    );
};
