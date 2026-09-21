const MAX_BYTES = 20 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_FRAMES = 100;
const imageTypes: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
interface Entry { name: string; method: number; flags: number; size: number; compressed: number; offset: number; crc: number }

const invalid = () => new Error('角色预览暂时不可用，可以重新加载或直接加入作品。');
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
const checksum = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
};

/** Read only costume images from an already validated sprite3, without starting a Scratch VM. */
export async function loadScratchSpritePreview(blob: Blob, signal?: AbortSignal): Promise<{ frames: string[]; dispose(): void }> {
  const check = () => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };
  check();
  if (blob.size < 22 || blob.size > MAX_BYTES) throw invalid();
  const buffer = await blob.arrayBuffer();
  check();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let end = -1;
  for (let at = buffer.byteLength - 22; at >= Math.max(0, buffer.byteLength - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === buffer.byteLength) { end = at; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw invalid();
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (!count || count > 3000 || count !== view.getUint16(end + 8, true)
    || directorySize > 1024 * 1024 || directoryOffset + directorySize > end) throw invalid();
  const entries = new Map<string, Entry>();
  let at = directoryOffset;
  let totalSize = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > directoryOffset + directorySize || view.getUint32(at, true) !== 0x02014b50) throw invalid();
    const nameSize = view.getUint16(at + 28, true);
    const next = at + 46 + nameSize + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (next > directoryOffset + directorySize || view.getUint16(at + 34, true)) throw invalid();
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameSize));
    const entry: Entry = { name, flags: view.getUint16(at + 8, true), method: view.getUint16(at + 10, true),
      crc: view.getUint32(at + 16, true), compressed: view.getUint32(at + 20, true), size: view.getUint32(at + 24, true),
      offset: view.getUint32(at + 42, true) };
    totalSize += entry.size;
    if (entries.has(name) || (name !== 'sprite.json' && !/^[a-f0-9]{32}\.(svg|png|jpe?g|wav|mp3)$/.test(name))
      || (entry.flags & 1) || ![0, 8].includes(entry.method) || totalSize > MAX_BYTES
      || entry.compressed > MAX_BYTES || (name === 'sprite.json' && entry.size > MAX_JSON_BYTES)) throw invalid();
    entries.set(name, entry);
    at = next;
  }
  if (at !== directoryOffset + directorySize) throw invalid();

  const extract = async (name: string) => {
    check();
    const entry = entries.get(name);
    if (!entry) throw invalid();
    const start = entry.offset;
    if (start + 30 > directoryOffset || view.getUint32(start, true) !== 0x04034b50
      || view.getUint16(start + 6, true) !== entry.flags || view.getUint16(start + 8, true) !== entry.method) throw invalid();
    const nameSize = view.getUint16(start + 26, true);
    const dataStart = start + 30 + nameSize + view.getUint16(start + 28, true);
    if (dataStart + entry.compressed > directoryOffset
      || decoder.decode(bytes.subarray(start + 30, start + 30 + nameSize)) !== name) throw invalid();
    const compressed = blob.slice(dataStart, dataStart + entry.compressed);
    let result: Uint8Array;
    if (!entry.method) {
      if (entry.compressed !== entry.size) throw invalid();
      result = new Uint8Array(await compressed.arrayBuffer());
    } else {
      const reader = compressed.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const abort = () => { void reader.cancel().catch(() => {}); };
      signal?.addEventListener('abort', abort, { once: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          check();
          const chunk = await reader.read();
          check();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > entry.size || size > MAX_BYTES) throw invalid();
          chunks.push(chunk.value);
        }
        if (size !== entry.size) throw invalid();
        result = new Uint8Array(size);
        let cursor = 0;
        for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.byteLength; }
      } finally {
        signal?.removeEventListener('abort', abort);
        await reader.cancel().catch(() => {});
      }
    }
    check();
    if (checksum(result) !== entry.crc) throw invalid();
    return result;
  };

  const sprite = JSON.parse(decoder.decode(await extract('sprite.json')));
  if (!sprite || sprite.isStage || !Array.isArray(sprite.costumes) || !sprite.costumes.length) throw invalid();
  const urls = new Map<string, string>();
  const frames: string[] = [];
  const dispose = () => { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); };
  try {
    for (const costume of sprite.costumes.slice(0, MAX_FRAMES)) {
      check();
      const format = String(costume?.dataFormat || '').toLowerCase();
      const name = costume?.md5ext || `${costume?.assetId}.${format}`;
      if (!imageTypes[format] || typeof name !== 'string' || !name.endsWith(`.${format}`)) throw invalid();
      if (!urls.has(name)) {
        const data = await extract(name);
        check();
        // SVG stays an inert image resource: never insert its markup into the page.
        urls.set(name, URL.createObjectURL(new Blob([data], { type: imageTypes[format] })));
      }
      frames.push(urls.get(name)!);
    }
    check();
    return { frames, dispose };
  } catch (error) { dispose(); throw error; }
}
