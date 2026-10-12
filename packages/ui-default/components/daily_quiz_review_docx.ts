import { createObjectiveMarkdown } from '../common/objective-markdown';
import type { LearningQuestion } from './daily_quiz_learning';

export interface DailyQuizReviewDocument {
  studentName: string;
  uid: number;
  classroomName?: string;
  questions: LearningQuestion[];
  exportedAt?: Date;
}
interface ExportOptions { fetch?: typeof fetch; signal?: AbortSignal; origin?: string }
interface Media { bytes: Uint8Array; extension: string; mime: string; width: number; height: number; id: number }
interface RunStyle { bold?: boolean; italic?: boolean; code?: boolean; strike?: boolean }
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_MEDIA = 32 * 1024 * 1024;
const encode = (value: string) => new TextEncoder().encode(value);
const escape = (value: string) => String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function cancelled(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('导出已取消', 'AbortError'); }
function run(text: string, style: RunStyle = {}) {
  const properties = `${style.bold ? '<w:b/>' : ''}${style.italic ? '<w:i/>' : ''}${style.strike ? '<w:strike/>' : ''}${style.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="宋体"/><w:sz w:val="20"/><w:shd w:fill="F2F5F7"/>' : ''}`;
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}${text.split('\n').map((line) => `<w:t xml:space="preserve">${escape(line)}</w:t>`).join('<w:br/>')}</w:r>`;
}
function paragraph(content: string, style = '', properties = '') {
  return `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${properties}</w:pPr>${content}</w:p>`;
}
const mathRun = (value: string) => `<m:r><m:t xml:space="preserve">${escape(value)}</m:t></m:r>`;

/** Convert the semantic MathML produced by KaTeX, never its duplicated visual DOM. */
function math(node: Element): string {
  const children = Array.from(node.children).filter((item) => item.localName !== 'annotation');
  const child = (index: number) => children[index] ? math(children[index]) : '';
  const argument = (tag: string, value: string) => `<m:${tag}>${value}</m:${tag}>`;
  switch (node.localName) {
    case 'annotation': return '';
    case 'mi': case 'mn': case 'mo': case 'mtext': return mathRun(node.textContent || '');
    case 'mspace': return mathRun(' ');
    case 'msup': return `<m:sSup>${argument('e', child(0))}${argument('sup', child(1))}</m:sSup>`;
    case 'msub': return `<m:sSub>${argument('e', child(0))}${argument('sub', child(1))}</m:sSub>`;
    case 'msubsup': return `<m:sSubSup>${argument('e', child(0))}${argument('sub', child(1))}${argument('sup', child(2))}</m:sSubSup>`;
    case 'mfrac': return `<m:f>${argument('num', child(0))}${argument('den', child(1))}</m:f>`;
    case 'msqrt': return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${argument('e', children.map(math).join(''))}</m:rad>`;
    case 'mroot': return `<m:rad>${argument('deg', child(1))}${argument('e', child(0))}</m:rad>`;
    case 'mover':
      if (node.getAttribute('accent') === 'true') return `<m:acc><m:accPr><m:chr m:val="${escape(children[1]?.textContent || '¯')}"/></m:accPr>${argument('e', child(0))}</m:acc>`;
      return `<m:limUpp>${argument('e', child(0))}${argument('lim', child(1))}</m:limUpp>`;
    case 'munder': return `<m:limLow>${argument('e', child(0))}${argument('lim', child(1))}</m:limLow>`;
    case 'munderover': return `<m:limUpp>${argument('e', `<m:limLow>${argument('e', child(0))}${argument('lim', child(1))}</m:limLow>`)}${argument('lim', child(2))}</m:limUpp>`;
    case 'mfenced': return `<m:d><m:dPr><m:begChr m:val="${escape(node.getAttribute('open') || '(')}"/><m:endChr m:val="${escape(node.getAttribute('close') || ')')}"/></m:dPr>${argument('e', children.map(math).join(''))}</m:d>`;
    case 'mtable': return `<m:m>${children.map((row) => `<m:mr>${Array.from(row.children).map((cell) => argument('e', math(cell))).join('')}</m:mr>`).join('')}</m:m>`;
    default: return children.length ? children.map(math).join('') : mathRun(node.textContent || '');
  }
}

function imageInfo(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 33 && bytes[0] === 137 && ascii(1, 8) === 'PNG\r\n\x1a\n' && ascii(12, 16) === 'IHDR') {
    return { extension: 'png', mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 14 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) {
    return { extension: 'gif', mime: 'image/gif', width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let position = 2;
    while (position + 4 <= bytes.length) {
      if (bytes[position] !== 255) break;
      while (bytes[position] === 255) position++;
      const marker = bytes[position++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = view.getUint16(position);
      if (length < 2 || position + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) {
        return { extension: 'jpeg', mime: 'image/jpeg', width: view.getUint16(position + 5), height: view.getUint16(position + 3) };
      }
      position += length;
    }
  }
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    if (ascii(12, 16) === 'VP8X') return { extension: 'webp', mime: 'image/webp', width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1, height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1 };
    if (ascii(12, 16) === 'VP8L' && bytes[20] === 0x2F) {
      const packed = view.getUint32(21, true);
      return { extension: 'webp', mime: 'image/webp', width: (packed & 0x3FFF) + 1, height: ((packed >>> 14) & 0x3FFF) + 1 };
    }
    if (ascii(12, 16) === 'VP8 ' && bytes[23] === 0x9D && bytes[24] === 0x01 && bytes[25] === 0x2A) return { extension: 'webp', mime: 'image/webp', width: view.getUint16(26, true) & 0x3FFF, height: view.getUint16(28, true) & 0x3FFF };
  }
  if (bytes.length >= 32 && ascii(4, 8) === 'ftyp' && view.getUint32(0) <= bytes.length) {
    const brandEnd = Math.min(view.getUint32(0), 256);
    const brands = [ascii(8, 12)];
    for (let offset = 16; offset + 4 <= brandEnd; offset += 4) brands.push(ascii(offset, offset + 4));
    if (brands.includes('avif') || brands.includes('avis')) {
      // ispe is the full-box spatial extent property of an AVIF image.
      for (let offset = 4; offset + 16 <= bytes.length; offset++) {
        if (ascii(offset, offset + 4) === 'ispe' && view.getUint32(offset - 4) === 20) return { extension: 'avif', mime: 'image/avif', width: view.getUint32(offset + 8), height: view.getUint32(offset + 12) };
      }
    }
  }
  throw new Error('题目图片格式无法导出，请使用 PNG、JPG、GIF、WebP 或 AVIF 图片。');
}

async function convertBrowserImage(bytes: Uint8Array, mime: string, signal?: AbortSignal) {
  if (typeof createImageBitmap !== 'function') throw new Error('当前浏览器无法转换题目图片，请使用新版 Chrome 后重试。');
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mime }));
  try {
    cancelled(signal);
    if (!bitmap.width || !bitmap.height || bitmap.width > 20000 || bitmap.height > 20000 || bitmap.width * bitmap.height > 50000000) throw new Error('题目图片尺寸过大，请缩小图片后重试。');
    const scale = Math.min(1, 1800 / bitmap.width, 2280 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法转换题目图片，请使用新版 Chrome 后重试。');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('题目图片转换失败，请检查图片后重试。')), 'image/png'));
    cancelled(signal);
    return new Uint8Array(await png.arrayBuffer());
  } finally { bitmap.close(); }
}

/** A dependency-free ZIP writer. Every member is stored with a CRC, without macros or remote relationships. */
function zip(files: { name: string; data: Uint8Array }[]): Blob {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value;
  }
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encode(file.name);
    let crc = 0xFFFFFFFF;
    for (const byte of file.data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xFFFFFFFF) >>> 0;
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(12, 33, true); // 1980-01-01, a valid deterministic DOS date.
    localView.setUint32(14, crc, true);
    localView.setUint32(18, file.data.length, true);
    localView.setUint32(22, file.data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014B50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(8, 0x0800, true);
    entryView.setUint16(14, 33, true);
    entryView.setUint32(16, crc, true);
    entryView.setUint32(20, file.data.length, true);
    entryView.setUint32(24, file.data.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(local, new Uint8Array(file.data));
    central.push(entry);
    offset += local.length + file.data.length;
  }
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054B50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, central.reduce((sum, item) => sum + item.length, 0), true);
  view.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export async function createDailyQuizReviewDocx(input: DailyQuizReviewDocument, options: ExportOptions = {}) {
  cancelled(options.signal);
  if (!Number.isSafeInteger(input.uid) || input.uid <= 0) throw new Error('学员信息不完整，请刷新后重试。');
  if (!input.questions.length) throw new Error('这位学员目前没有待复习题目。');
  if (input.questions.length > 2000) throw new Error('待复习题目过多，请缩小课堂范围后重试。');
  const date = input.exportedAt || new Date();
  const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const day = ['year', 'month', 'day'].map((part) => dateParts.find((item) => item.type === part)?.value).join('-');
  const studentName = input.studentName.trim() || `学员 ${input.uid}`;
  const filename = `${studentName.replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, '_').replace(/[. ]+$/g, '').slice(0, 60) || '学员'}_${input.uid}_待复习题_${day}.docx`;
  const base = new URL(options.origin || window.location.origin);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('请在平台页面中导出题目。');
  const fetchImage = options.fetch || globalThis.fetch.bind(globalThis);
  const media: Media[] = [];
  const mediaBySource = new Map<string, Promise<Media>>();
  let mediaSize = 0;
  let drawingId = 0;
  const markdown = createObjectiveMarkdown();

  async function loadImage(source: string): Promise<Media> {
    if (!mediaBySource.has(source)) mediaBySource.set(source, (async () => {
      cancelled(options.signal);
      let bytes: Uint8Array;
      let contentType: string;
      const data = /^data:(image\/(?:png|jpeg|gif|webp|avif));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(source);
      if (data) {
        if (data[2].length > Math.ceil(MAX_IMAGE * 4 / 3) + 8) throw new Error('题目图片过大，单张图片不能超过 8 MB。');
        try { bytes = Uint8Array.from(atob(data[2]), (char) => char.charCodeAt(0)); } catch { throw new Error('题目图片数据损坏，请检查后重试。'); }
        contentType = data[1].toLowerCase();
      } else {
        const url = new URL(source, base);
        if (!['https:', 'http:'].includes(url.protocol) || url.origin !== base.origin || url.username || url.password) {
          throw new Error('题目包含站外或不安全的图片，请将图片上传到平台后再导出。');
        }
        const controller = new AbortController();
        const abort = () => controller.abort();
        options.signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, 20000);
        try {
          let response: Response;
          try {
            response = await fetchImage(url.href, { credentials: 'same-origin', redirect: 'error', signal: controller.signal });
          } catch (error) {
            cancelled(options.signal);
            if (controller.signal.aborted) throw error;
            throw new Error('题目图片下载失败，请确认图片可访问且已完成身份验证后重试。');
          }
          if ([401, 403].includes(response.status)) throw new Error('题目图片需要身份验证，请完成身份验证后重试。');
          if (!response.ok || (response.url && new URL(response.url).origin !== base.origin)) throw new Error('题目图片下载失败，请检查图片访问权限后重试。');
          contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (['text/html', 'application/xhtml+xml'].includes(contentType)) throw new Error('题目图片未能加载，可能需要重新完成身份验证后重试。');
          if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(contentType)) throw new Error('题目图片格式无法导出，请使用 PNG、JPG、GIF、WebP 或 AVIF 图片。');
          if (Number(response.headers.get('content-length')) > MAX_IMAGE) throw new Error('题目图片过大，单张图片不能超过 8 MB。');
          if (response.body) {
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
              while (true) {
                cancelled(options.signal);
                const next = await reader.read();
                if (next.done) break;
                size += next.value.length;
                if (size > MAX_IMAGE || mediaSize + size > MAX_MEDIA) throw new Error('题目图片过大，请减少图片大小后重试。');
                chunks.push(next.value);
              }
            } catch (error) { await reader.cancel().catch(() => {}); throw error; }
            bytes = new Uint8Array(size);
            let cursor = 0;
            for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
          } else bytes = new Uint8Array(await response.arrayBuffer());
        } catch (error) {
          cancelled(options.signal);
          if (controller.signal.aborted) throw new Error('题目图片下载超时，请稍后重试。');
          throw error;
        } finally {
          clearTimeout(timer);
          options.signal?.removeEventListener('abort', abort);
        }
      }
      cancelled(options.signal);
      if (bytes.length > MAX_IMAGE || mediaSize + bytes.length > MAX_MEDIA) throw new Error('题目图片过大，请减少图片大小后重试。');
      let info = imageInfo(bytes);
      if (info.mime !== contentType || !info.width || !info.height || info.width > 20000 || info.height > 20000 || info.width * info.height > 50000000) {
        throw new Error('题目图片数据异常，请检查图片后重试。');
      }
      if (['image/webp', 'image/avif'].includes(info.mime)) {
        try { bytes = await convertBrowserImage(bytes, info.mime, options.signal); } catch (error) {
          cancelled(options.signal);
          throw new Error('题目图片转换失败，请确认图片可正常显示后重试。');
        }
        info = imageInfo(bytes);
        if (info.mime !== 'image/png' || bytes.length > MAX_IMAGE || mediaSize + bytes.length > MAX_MEDIA) throw new Error('题目图片过大，请减少图片大小后重试。');
      }
      mediaSize += bytes.length;
      const item = { ...info, bytes, id: media.length + 1 };
      media.push(item);
      return item;
    })());
    return mediaBySource.get(source);
  }

  async function image(node: Element) {
    const item = await loadImage(node.getAttribute('src') || '');
    const scale = Math.min(1, 600 / item.width, 760 / item.height);
    const width = Math.round(item.width * scale * 9525);
    const height = Math.round(item.height * scale * 9525);
    const id = ++drawingId;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${id}" name="题目图片 ${id}" descr="${escape(node.getAttribute('alt') || '题目图片')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="image${item.id}.${item.extension}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image${item.id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  async function inline(node: Node, style: RunStyle = {}): Promise<string> {
    cancelled(options.signal);
    if (node.nodeType === 3) return run(node.textContent || '', style);
    if (node.nodeType !== 1) return '';
    const element = node as Element;
    if (element.classList.contains('katex-error')) throw new Error('题目中有无法识别的公式，请修正公式后再导出。');
    const mathElement = element.matches('math') ? element : element.classList.contains('katex') ? element.querySelector('math') : null;
    if (mathElement) return `<m:oMath>${math(mathElement)}</m:oMath>`;
    if (element.tagName === 'IMG') return image(element);
    if (element.tagName === 'BR') return '<w:r><w:br/></w:r>';
    const nextStyle = { ...style };
    if (['B', 'STRONG'].includes(element.tagName)) nextStyle.bold = true;
    if (['I', 'EM'].includes(element.tagName)) nextStyle.italic = true;
    if (['S', 'DEL'].includes(element.tagName)) nextStyle.strike = true;
    if (element.tagName === 'CODE') nextStyle.code = true;
    let output = '';
    for (const child of Array.from(node.childNodes)) output += await inline(child, nextStyle);
    return output;
  }
  async function blocks(parent: Node, prefix = '', depth = 0): Promise<string> {
    let output = '';
    let pendingPrefix = prefix;
    let inlineContent = '';
    const indent = depth ? `<w:ind w:left="${depth * 300}"/>` : '';
    const flush = () => {
      if (!inlineContent) return;
      output += paragraph(`${pendingPrefix ? run(pendingPrefix) : ''}${inlineContent}`, '', indent);
      pendingPrefix = '';
      inlineContent = '';
    };
    for (const node of Array.from(parent.childNodes)) {
      cancelled(options.signal);
      if (node.nodeType === 3 && !node.textContent?.trim() && !inlineContent) continue;
      const tag = node.nodeType === 1 ? (node as Element).tagName : '';
      if (!/^(P|H[1-6]|PRE|UL|OL|TABLE|BLOCKQUOTE|HR|DIV)$/.test(tag)) {
        inlineContent += await inline(node);
        continue;
      }
      flush();
      if (tag === 'UL' || tag === 'OL') {
        let index = Number((node as Element).getAttribute('start')) || 1;
        for (const item of Array.from((node as Element).children)) output += await blocks(item, tag === 'OL' ? `${index++}. ` : '• ', depth + 1);
      } else if (tag === 'TABLE') {
        const rows = Array.from((node as Element).querySelectorAll('tr'));
        const columns = Math.max(1, ...rows.map((row) => row.children.length));
        output += `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} w:val="single" w:sz="4" w:color="DCE5E9"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${'<w:gridCol w:w="'.concat(String(Math.floor(9600 / columns)), '"/>').repeat(columns)}</w:tblGrid>`;
        for (const row of rows) {
          output += '<w:tr>';
          for (const cell of Array.from(row.children)) output += `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9600 / columns)}" w:type="dxa"/>${cell.tagName === 'TH' ? '<w:shd w:fill="F0F5F5"/>' : ''}</w:tcPr>${paragraph(await inline(cell, { bold: cell.tagName === 'TH' }))}</w:tc>`;
          output += '</w:tr>';
        }
        output += '</w:tbl>' + paragraph('');
      } else if (tag === 'BLOCKQUOTE') {
        output += await blocks(node, pendingPrefix, depth + 1);
        pendingPrefix = '';
      } else if (tag === 'PRE') {
        if (pendingPrefix) { output += paragraph(run(pendingPrefix), '', '<w:keepNext/>'); pendingPrefix = ''; }
        output += paragraph(run(node.textContent || '', { code: true }), 'Code', indent);
      } else if (tag === 'HR') {
        output += paragraph('', '', '<w:pBdr><w:bottom w:val="single" w:sz="4" w:color="DCE5E9"/></w:pBdr>');
      } else if (tag === 'DIV') {
        output += await blocks(node, pendingPrefix, depth);
        pendingPrefix = '';
      } else {
        output += paragraph(`${pendingPrefix ? run(pendingPrefix) : ''}${await inline(node)}`, /^H[1-6]$/.test(tag) ? 'Subheading' : '', indent);
        pendingPrefix = '';
      }
    }
    flush();
    return output;
  }
  async function rich(value: string, prefix = '') {
    const root = document.createElement('template');
    root.innerHTML = markdown.render(value || '');
    return (await blocks(root.content, prefix)) || paragraph(run(prefix));
  }
  const answer = (question: LearningQuestion, selections: string[] | null) => (selections || []).map((value) => question.kind === 'judge' ? ({ A: '正确', B: '错误' }[value] || value) : value).join('、') || '未作答';
  let body = paragraph(run(`${studentName} 待复习题`), 'Title');
  body += paragraph(run([`UID ${input.uid}`, input.classroomName, `共 ${input.questions.length} 题`, `${day} 导出`].filter(Boolean).join('  ·  ')), 'Subtitle');
  body += paragraph(run('先独立完成题目，再到文末核对答案与解析。'), 'Note');
  for (let index = 0; index < input.questions.length; index++) {
    const question = input.questions[index];
    let content = '';
    content += paragraph(run(`${index + 1}. ${question.title || '待复习题目'}`), 'Question');
    const kind = { single: '单选题', multiple: '多选题', judge: '判断题' }[question.kind] || question.kind;
    content += paragraph(run([kind, question.domainName].filter(Boolean).join('  ·  ')), 'Metadata');
    content += await rich(question.stem);
    for (let optionIndex = 0; optionIndex < question.options.length; optionIndex++) content += await rich(question.options[optionIndex], `${String.fromCharCode(65 + optionIndex)}. `);
    // Keep a question's prompt and options on the same page when they fit.
    // Word can still split an oversized question across pages.
    body += content.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/g, (_match, properties: string) => `<w:pPr><w:keepNext/><w:keepLines/>${properties.replace(/<w:keepNext\/>|<w:keepLines\/>/g, '')}</w:pPr>`);
    body += paragraph(run('作答：________________'), 'Response', '<w:keepLines/>');
  }
  body += paragraph(run('答案与解析'), 'Title', '<w:pageBreakBefore/>');
  body += paragraph(run('题号与前面的练习题一一对应。'), 'Note');
  for (let index = 0; index < input.questions.length; index++) {
    const question = input.questions[index];
    body += paragraph(run(`${index + 1}. ${question.title || '待复习题目'}`), 'Question');
    body += paragraph(run(`正确答案：${answer(question, question.answers)}`, { bold: true }));
    body += paragraph(run(`上次作答：${answer(question, question.selected)}`), 'Metadata');
    body += question.analysis?.trim() ? await rich(question.analysis) : paragraph(run('本题暂无解析。'), 'Metadata');
  }
  body += '<w:sectPr><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/><w:cols w:space="708"/></w:sectPr>';
  const namespaces = `xmlns:w="${W}" xmlns:r="${R}" xmlns:m="${M}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
  const style = (id: string, size: number, color: string, bold = false, extra = '', spacing = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="${id === 'Question' ? 220 : 0}" w:after="${spacing || '130'}"/>${extra}</w:pPr><w:rPr>${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  const styles = `${XML}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="253541"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="130" w:line="310" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${style('Title', 40, '000000', true, '<w:keepNext/>', '180')}${style('Subtitle', 19, '647780')}${style('Note', 20, '526A73', false, '', '240')}${style('Question', 24, '000000', true, '<w:keepNext/>')}${style('Subheading', 23, '000000', true, '<w:keepNext/>')}${style('Metadata', 18, '657781', false, '', '100')}${style('Response', 22, '536770', false, '', '220')}${style('Code', 20, '253541', false, '<w:shd w:fill="F2F5F7"/><w:ind w:left="140" w:right="140"/>')}</w:styles>`;
  const relationship = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`;
  const relationships = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship('styles', 'styles', 'styles.xml')}${relationship('footer', 'footer', 'footer1.xml')}${media.map((item) => relationship(`image${item.id}`, 'image', `media/image${item.id}.${item.extension}`)).join('')}</Relationships>`;
  const files = [
    { name: '[Content_Types].xml', data: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${Array.from(new Map(media.map((item) => [item.extension, item])).values()).map((item) => `<Default Extension="${item.extension}" ContentType="${item.mime}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>` },
    { name: '_rels/.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship('document', 'officeDocument', 'word/document.xml')}</Relationships>` },
    { name: 'word/document.xml', data: `${XML}<w:document ${namespaces}><w:body>${body}</w:body></w:document>` },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/_rels/document.xml.rels', data: relationships },
    { name: 'word/footer1.xml', data: `${XML}<w:ftr xmlns:w="${W}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="8A969C"/><w:sz w:val="18"/></w:rPr><w:t>— </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t> —</w:t></w:r></w:p></w:ftr>` },
  ].map((file) => ({ name: file.name, data: encode(file.data) }));
  cancelled(options.signal);
  return { blob: zip([...files, ...media.map((item) => ({ name: `word/media/image${item.id}.${item.extension}`, data: item.bytes }))]), filename, questionCount: input.questions.length };
}
