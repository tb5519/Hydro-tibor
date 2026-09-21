interface WarmupConfig { poster?: string; posters?: string[]; backgrounds?: string[]; catalog?: string; scope?: string }
interface WarmupImage { url: string; size?: number }

/** HTTP-cache warming only: no image bytes or private signed URLs go into a service worker. */
export function startImageWarmup(config: WarmupConfig, env: any = window) {
  if (!config || !env.fetch || !env.AbortController) return;
  const connection = env.navigator?.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
  const doc = env.document;
  const mobile = connection?.effectiveType === '3g';
  const limit = mobile ? 8 * 1024 * 1024 : 20 * 1024 * 1024;
  const deadline = Date.now() + 90_000;
  const controller = new env.AbortController();
  let spent = 0;
  let count = 0;
  let stopped = false;
  env.addEventListener('pagehide', () => { stopped = true; controller.abort(); }, { once: true });
  const key = `onebyone-image-warmup:v1:${config.scope || 'guest'}`;
  let remembered: Record<string, number> = {};
  try { remembered = JSON.parse(env.sessionStorage.getItem(key) || '{}'); } catch { /* Optional. */ }
  const idle = () => new Promise<void>((resolveIdle) => {
    if (env.requestIdleCallback) env.requestIdleCallback(() => resolveIdle(), { timeout: 2000 });
    else env.setTimeout(resolveIdle, 300);
  });
  const canContinue = () => !stopped && !doc.hidden && Date.now() < deadline && count < 64 && spent < limit;
  const warm = async (item: WarmupImage) => {
    if (!canContinue() || !item.url || (item.size && item.size > limit - spent)) return false;
    if (remembered[item.url] > Date.now() - 240_000) return true;
    let parsed: URL;
    try { parsed = new URL(item.url, env.location.href); } catch { return true; }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return true;
    count++;
    const timeout = env.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await env.fetch(parsed.toString(), {
        credentials: 'same-origin', priority: 'low', signal: controller.signal,
      });
      if (!response.ok || !/^image\//i.test(response.headers.get('Content-Type') || '')) return true;
      const length = Number(response.headers.get('Content-Length'));
      if (length > 8 * 1024 * 1024 || length > limit - spent) { controller.abort(); return false; }
      const reader = response.body?.getReader();
      let bytes = 0;
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 8 * 1024 * 1024 || bytes > limit - spent) { controller.abort(); return false; }
        }
      } else bytes = (await response.arrayBuffer()).byteLength;
      spent += bytes;
      if (bytes > 0) {
        remembered[item.url] = Date.now();
        remembered = Object.fromEntries(Object.entries(remembered)
          .filter(([, time]) => time > Date.now() - 240_000).slice(-128));
        try { env.sessionStorage.setItem(key, JSON.stringify(remembered)); } catch { /* Optional. */ }
      }
      return true;
    } catch { return false; } finally { env.clearTimeout(timeout); }
  };
  const run = async () => {
    // Start the public poster on every page, including login, without waiting for authentication or main UI startup.
    await idle();
    const posters = config.posters || (config.poster ? [config.poster] : []);
    for (const url of posters.slice(0, 2)) {
      if (!canContinue() || controller.signal.aborted) return;
      await warm({ url, size: 8 * 1024 * 1024 });
    }
    if (mobile || controller.signal.aborted || !canContinue()) return;
    if (doc.readyState !== 'complete') await new Promise<void>((done) => env.addEventListener('load', () => done(), { once: true }));
    for (const url of (config.backgrounds || []).slice(0, 21)) {
      await idle();
      if (!canContinue() || controller.signal.aborted) return;
      await warm({ url, size: 160 * 1024 });
    }
    if (!config.catalog || !canContinue()) return;
    // The endpoint is authenticated and emits only current-domain image URLs, sizes and an opaque page cursor.
    const catalog = new URL(config.catalog, env.location.href);
    if (catalog.origin !== env.location.origin) return;
    let after = 0;
    for (let page = 0; page < 8 && canContinue() && !controller.signal.aborted; page++) {
      await idle();
      const url = new URL(catalog);
      if (after) url.searchParams.set('after', `${after}`);
      const response = await env.fetch(url.toString(), { credentials: 'same-origin', priority: 'low', signal: controller.signal });
      if (!response.ok || !/^application\/json/i.test(response.headers.get('Content-Type') || '')) return;
      const data = await response.json();
      for (const item of (Array.isArray(data.items) ? data.items : []).slice(0, 16)) {
        if (!Number.isSafeInteger(item.size) || item.size <= 0 || item.size > 8 * 1024 * 1024) continue;
        if (new URL(item.url, env.location.href).origin !== env.location.origin) continue;
        await idle();
        if (!await warm(item) || controller.signal.aborted) return;
      }
      if (!Number.isSafeInteger(data.next) || data.next <= after) return;
      after = data.next;
    }
  };
  run().catch(() => {}); // Prefetch failures never affect login, navigation, or the visible page.
}
