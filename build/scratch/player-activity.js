// Report physical input from the opaque player frame without sending key,
// pointer or project data. The authenticated parent owns all runtime accounting.
export const createPlayerActivityBridge = (canReport, send, env = window) => {
    const inputEvents = [
        'keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup',
        'mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'wheel'
    ];
    const options = {capture: true, passive: true};
    let disposed = false;
    let lastReport = -Infinity;
    const report = event => {
        if (disposed || event.isTrusted !== true || !canReport()) return;
        const now = env.performance.now();
        // Multiple compatibility events can describe the same physical input.
        // Leading delivery also lets the first input resume accounting at once.
        if (now - lastReport < 500) return;
        lastReport = now;
        send('userActivity');
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        inputEvents.forEach(name => env.document.removeEventListener(name, report, options));
        env.removeEventListener('pagehide', dispose);
    };
    inputEvents.forEach(name => env.document.addEventListener(name, report, options));
    env.addEventListener('pagehide', dispose);
    return {dispose};
};
