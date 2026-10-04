// A saved monitor uses `left`, while dragging in the editor uses a transform.
// At the right edge, the browser can shrink an auto-width monitor and wrap CJK
// labels. Keep the player's scalar monitors at their natural width, then fit
// their display position within the stage without changing the saved project.
export default function installPlayerMonitorLayout (element, {mode, draggable}) {
    if (draggable || mode === 'list' || document.documentElement.dataset.onebyoneMode !== 'player') return () => {};
    const overlay = element.closest('.monitor-overlay');
    if (!overlay) return () => {};
    const savedLeft = Number.parseFloat(element.style.left) || 0;
    element.dataset.onebyoneScalarMonitor = '';
    const fit = () => {
        const available = overlay.clientWidth;
        if (!available) return;
        const left = Math.max(0, Math.min(savedLeft, available - element.offsetWidth));
        if (Number.parseFloat(element.style.left) !== left) element.style.left = `${left}px`;
    };
    fit();
    // Run only when geometry changes, rather than measuring on every VM tick.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    if (observer) {
        observer.observe(element);
        observer.observe(overlay);
    }
    return () => {
        if (observer) observer.disconnect();
        delete element.dataset.onebyoneScalarMonitor;
    };
}
