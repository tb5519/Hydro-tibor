// Problem attachments are displayed with the learner's session. A replay must
// not resolve a Blob URL or interpret a signed attachment URL as the teacher.
export const problemImageContainers = '.scratch-problem-description,.scb-description,.sc-assignment-markdown,.ui-v2-problem-statement,[data-fragment-id="problem-description"],.sc-quiz__card .typo';
export const missingProblemImageStyle = 'img[data-live-share-image-size]:not([src]){display:var(--share-img-display,inline-block)!important;width:var(--share-img-width)!important;height:var(--share-img-height)!important}';
const rasterLimit = 96 * 1024;
const fileLimit = 10 * 1024 * 1024;
const imageAddresses = /^(?:src|srcset|sizes|crossorigin|referrerpolicy|loading|attributionsrc|rr_dataURL|data-(?:src|srcset|original|lazy-src|lazy-srcset))$/i;
const rasterMime = /^image\/(?:png|jpeg|webp|gif|avif)$/i;

function publicImageAddress(source: string) {
  try {
    const url = new URL(source);
    if (url.origin === location.origin || !/^https?:$/.test(url.protocol) || url.username || url.password || /[?#]/.test(url.href)
      || url.port || !url.hostname.includes('.') || /^(?:[\d.]+|\[)|\.(?:local|localhost|internal)$/i.test(url.hostname)) return '';
    const path = decodeURIComponent(url.pathname);
    if (!/\.(?:png|jpe?g|webp|gif|avif)$/i.test(path) || /[?&#=;%:@\\]/.test(path) || /[a-f0-9]{48,}|[\w-]{96,}/i.test(path)
      || /(?:^|[\/_.-])(?:auth|private|token|signed?|signature|secret|session|protected|credential|jwt|ticket|expires)(?:[\/_.-]|$)/i.test(path)) return '';
    return url.href;
  } catch { return ''; }
}

function dimensions(image: HTMLImageElement) {
  const css = getComputedStyle(image);
  const width = parseFloat(css.width);
  const height = parseFloat(css.height);
  // rrweb accepts string attribute mutations. Numbers leave the old alt box in place.
  return width > 0 && height > 0 ? { width: String(width), height: String(height) } : {};
}

// Chromium lays out a source-less inline image with alt text as a text run,
// even with width and height attributes. Reserve its original CSS box while
// waiting for pixels or when the original host does not permit sharing them.
function reserveBox(image: HTMLImageElement, attributes: Record<string, any>, size = dimensions(image), initial = false) {
  if (size.width && size.height) {
    const display = getComputedStyle(image).display;
    const rules = { '--share-img-width': size.width + 'px', '--share-img-height': size.height + 'px',
      '--share-img-display': display === 'inline' ? 'inline-block' : display };
    Object.assign(attributes, size);
    attributes['data-live-share-image-size'] = '';
    if (initial || typeof attributes.style === 'string') {
      attributes.style = (attributes.style || '') + ';' + Object.entries(rules).map(([name, value]) => name + ':' + value).join(';');
    } else attributes.style = { ...attributes.style, ...rules };
  }
  return attributes;
}

function visible(image: HTMLImageElement) {
  if (document.hidden || (image.checkVisibility && !image.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))) return false;
  const rect = image.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
    && getComputedStyle(image).visibility !== 'hidden';
}

function rasterize(image: HTMLImageElement | ImageBitmap, width: number, height: number) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx || !width || !height) return '';
  let scale = Math.min(1, 1600 / width, 1200 / height);
  for (let attempt = 0; attempt < 5; attempt++) {
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/webp', .82);
    if (result.length <= rasterLimit && /^data:image\/(?:webp|png|jpeg);base64,/.test(result)) return result;
    scale *= .65;
  }
  return '';
}

async function readableImage(source: string, signal: AbortSignal) {
  const url = new URL(source, document.baseURI);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
  const local = url.origin === location.origin;
  const attachment = local && /^\/(?:d\/[^/]+\/)?(?:file\/\d+|p\/[^/]+\/file)\/[^/]+$/.test(url.pathname);
  // A cross-origin image can be displayed without being readable. Ask only
  // its original host for anonymous CORS access. Hydro attachments additionally
  // support same-origin reads after the original user's permission check.
  const response = await fetch(url.href, { signal, mode: 'cors', cache: 'no-store', credentials: local ? 'same-origin' : 'omit',
    referrerPolicy: 'no-referrer', ...(attachment && { headers: { 'X-Hydro-Media-Cache': 'share-raster-v1' }, redirect: 'error' }) });
  const type = response.headers.get('Content-Type')?.split(';')[0].trim() || '';
  const reader = response.body?.getReader();
  if (!reader) return '';
  if (!response.ok || !rasterMime.test(type) || Number(response.headers.get('Content-Length')) > fileLimit) {
    await reader.cancel(); return '';
  }
  let size = 0;
  const parts: Uint8Array<ArrayBuffer>[] = [];
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > fileLimit) { await reader.cancel(); return ''; }
    parts.push(new Uint8Array(value));
  }
  const bitmap = await createImageBitmap(new Blob(parts, { type }));
  try { return signal.aborted ? '' : rasterize(bitmap, bitmap.width, bitmap.height); } finally { bitmap.close(); }
}

export function attachProblemImages(blocked: (element: Element) => boolean,
  publish: (id: number, attributes: Record<string, unknown>) => void) {
  type Entry = { id: number; source: string; geometry: string; sent: boolean; retryAt: number };
  const images = new Map<HTMLImageElement, Entry>();
  let reading: AbortController | null = null;
  const eligible = (node: Element) => node.ownerDocument === document && !!node.closest(problemImageContainers) && !blocked(node);
  function reset() { reading?.abort(); reading = null; images.clear(); }
  function rewrite(node: Element, id: number, attributes: Record<string, any>, initial: boolean) {
    if (!node || !['IMG', 'SOURCE', 'A'].includes(node.tagName) || !node.closest(problemImageContainers)) return;
    if (node.tagName === 'A') {
      // Markdown may wrap a diagram in a full-size link to the same attachment.
      const img = node.querySelector('img');
      if (!img || !attributes.href) return;
      try {
        const link = new URL(attributes.href, document.baseURI);
        if ([img.currentSrc, img.src].filter(Boolean).some(value => {
          const url = new URL(value, document.baseURI); return url.origin === link.origin && url.pathname === link.pathname;
        })) { if (initial) delete attributes.href; else attributes.href = null; }
      } catch { /* The normal replay sanitizer handles malformed links. */ }
      return;
    }
    if (node.tagName === 'SOURCE' && !node.closest('picture')) return;
    const changed = Object.keys(attributes).some(key => imageAddresses.test(key));
    for (const key of Object.keys(attributes)) {
      if (imageAddresses.test(key)) delete attributes[key];
    }
    if (node.tagName !== 'IMG' || !eligible(node)) return;
    const image = node as HTMLImageElement;
    let entry = images.get(image);
    if (!entry || entry.id !== id) {
      entry = { id, source: '', geometry: '', sent: false, retryAt: 0 };
      images.set(image, entry);
    }
    if (initial || changed) {
      entry.sent = false; entry.retryAt = 0; entry.source = '';
      if (!initial) attributes.src = null;
      const size = dimensions(image);
      reserveBox(image, attributes, size, initial); entry.geometry = JSON.stringify(size);
    }
  }
  function capture() {
    if (document.hidden) return;
    for (const [image, entry] of images) {
      if (!image.isConnected || !eligible(image)) { images.delete(image); continue; }
      const geometry = dimensions(image);
      const signature = JSON.stringify(geometry);
      if (signature !== entry.geometry && geometry.width && geometry.height) {
        publish(entry.id, reserveBox(image, {}, geometry)); entry.geometry = signature;
      }
      const source = image.currentSrc || image.src;
      if (source !== entry.source) {
        if (entry.sent) publish(entry.id, { src: null });
        entry.source = source; entry.sent = false; entry.retryAt = 0;
      }
      if (!source || entry.sent || Date.now() < entry.retryAt || !image.complete || !image.naturalWidth) continue;
      if (!visible(image)) continue;
      function finish(raster: string) {
        if (images.get(image) !== entry || !image.isConnected || !eligible(image)
          || (image.currentSrc || image.src) !== source) return;
        if (!visible(image)) { entry.retryAt = 0; return; }
        const address = raster || publicImageAddress(source);
        if (address) {
          publish(entry.id, { referrerpolicy: 'no-referrer', alt: image.getAttribute('alt'), src: address, ...dimensions(image) }); entry.sent = true;
        } else publish(entry.id, reserveBox(image, { alt: image.alt || '题目图片暂时无法共享' }));
      }
      entry.retryAt = Date.now() + 30000;
      try { finish(rasterize(image, image.naturalWidth, image.naturalHeight)); }
      catch (error) {
        if ((error as DOMException).name !== 'SecurityError') continue;
        if (reading) { entry.retryAt = Date.now() + 1000; continue; }
        const controller = new AbortController(); reading = controller;
        const timeout = setTimeout(() => controller.abort(), 8000);
        void readableImage(source, controller.signal).then(finish).catch(() => finish('')).finally(() => {
          clearTimeout(timeout); if (reading === controller) reading = null;
        });
      }
      break; // At most one image per capture tick, including after a snapshot.
    }
  }
  return { reset, rewrite, capture };
}
