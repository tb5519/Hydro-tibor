import { attachSourceMirror } from './mirror';

/** Loaded only by our controlled Scratch HTML; it never grants parent access to the sandbox. */
export function installFrameCapture() {
  if (parent === window) return () => {};
  const channel = new URLSearchParams(location.hash.slice(1)).get('channel');
  if (!channel || !/^[a-zA-Z0-9_-]{8,96}$/.test(channel)) return () => {};
  const parentOrigin = new URL(location.href).origin;
  let id = '';
  let lease = 0;
  let capture: ReturnType<typeof attachSourceMirror> | undefined;
  const stop = () => { capture?.dispose(); capture = undefined; id = ''; };
  const receive = (event: MessageEvent) => {
    const message = event.data;
    if (event.source !== parent || event.origin !== parentOrigin || message?.channel !== channel
      || message.type !== 'live-share-capture' || !/^[a-zA-Z0-9_-]{8,96}$/.test(message.id || '')) return;
    if (message.action === 'stop') { if (id === message.id) stop(); return; }
    if (!['start', 'snapshot'].includes(message.action)) return;
    lease = Date.now() + 12000;
    if (capture && id === message.id) { if (message.action === 'snapshot') capture.snapshot(); return; }
    stop(); id = message.id;
    const capturedId = id;
    parent.postMessage({ type: 'live-share-frame-start', channel, id }, parentOrigin);
    capture = attachSourceMirror({ pageId: id, inlineLocalImages: true, showNonSensitiveInputs: true,
      beforeRasterCapture: (canvas) => {
        // Scratch's WebGL buffer is discarded after presentation. Redraw only
        // its existing scene immediately before sampling; never advance the VM.
        const renderer = (window as any).ReduxStore?.getState?.()?.scratchGui?.vm?.renderer;
        if (renderer?.canvas === canvas && typeof renderer.draw === 'function') {
          // TurboWarp skips draw() when this display-only flag is clear.
          // It is unrelated to project edits or the unsaved-work indicator.
          renderer.dirty = true;
          renderer.draw();
        }
      },
      send: (packet) => {
        if (id !== capturedId || Date.now() >= lease) return false;
        parent.postMessage({ type: 'live-share-frame', channel, id, packet }, parentOrigin);
        return true;
      } });
  };
  window.addEventListener('message', receive);
  const timer = window.setInterval(() => { if (capture && Date.now() >= lease) stop(); }, 1000);
  const hidden = (event: PageTransitionEvent) => { if (event.persisted) stop(); else dispose(); };
  const dispose = () => { stop(); clearInterval(timer); window.removeEventListener('message', receive); window.removeEventListener('pagehide', hidden); };
  window.addEventListener('pagehide', hidden);
  return dispose;
}

installFrameCapture();
