export function applyGestureBlocks() {
    if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return;
    
    console.log('🛡️ Aplicando bloqueos de gestos...');
    
    const preventDefault = (e) => { e.preventDefault(); e.stopPropagation(); };
    
    document.querySelectorAll('img').forEach(img => {
        img.addEventListener('contextmenu', preventDefault);
        img.addEventListener('dragstart', preventDefault);
        img.style.pointerEvents = 'none';
        img.style.userSelect = 'none';
    });
    
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });

    // Bloquear context menu globalmente
    document.addEventListener('contextmenu', event => event.preventDefault());
}
