export function applyGestureBlocks() {
    console.log('🛡️ Aplicando bloqueos de seguridad PWA...');
    
    // Bloquear click derecho preventivo global
    document.addEventListener('contextmenu', (e) => {
        // En Vite dev mode suele molestar, desactivado en dev
        if (import.meta.env.PROD) {
            e.preventDefault();
        }
    }, { capture: true });

    // Prevenir Selection y Drag
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.WebkitTouchCallout = 'none';

    // Deshabilitar double-tap to zoom (Critical for iOS)
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });

    // Evitar zoom con gestos
    document.addEventListener('gesturestart', function(e) {
        e.preventDefault();
    });
}
