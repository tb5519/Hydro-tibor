import { createHash } from 'crypto';
import { extname } from 'path';
import AdmZip from 'adm-zip';

export const EDITOR_THEME_BASES = ['cloud', 'mist', 'sand', 'ocean'] as const;
export const EDITOR_THEME_SLOTS = ['background', 'toolbar', 'editor', 'panel', 'runButton', 'submitButton', 'corner'] as const;
export const EDITOR_THEME_CONTROLS = [
    'run', 'submit', 'pretestTab', 'recordsTab', 'pretestTitle', 'recordsTitle', 'inputTitle', 'outputTitle',
    'theme', 'language', 'close', 'problemTab', 'settingsTab', 'recordStatus', 'recordMemory', 'recordTime', 'recordDate',
    'emptyRecords', 'emptyRecordsHint', 'emptyOutput', 'inputPlaceholder',
] as const;
export const EDITOR_THEME_PALETTE = [
    'surface', 'muted', 'border', 'borderStrong', 'text', 'textMuted', 'accent',
    'accentSoft', 'selection', 'comment', 'keyword', 'string', 'number',
] as const;
export const EDITOR_THEME_POSITIONS = ['center', 'left', 'right', 'top', 'bottom', 'right top', 'right bottom', 'left top', 'left bottom'];
export const EDITOR_THEME_ZIP_LIMIT = 64 * 1024 * 1024;
export const EDITOR_THEME_TOTAL_LIMIT = 120 * 1024 * 1024;
export const EDITOR_THEME_ASSET_LIMIT = 80 * 1024 * 1024;
const IMAGE_LIMIT = 16 * 1024 * 1024;
const FILE_LIMIT = 64;
const MANIFEST_LIMIT = 64 * 1024;

export interface EditorThemeAsset { id: string; name: string; type: string; path?: string; size?: number; url?: string }
export interface EditorThemeSlot {
    assetId: string;
    fit: 'cover' | 'contain' | 'tile' | 'stretch';
    position?: string;
}
export interface EditorThemeControl {
    assetId: string;
    width: number;
    height: number;
    hoverAssetId?: string;
    activeAssetId?: string;
}
export interface EditorThemeDesign {
    name: string;
    base: typeof EDITOR_THEME_BASES[number];
    overlay: number;
    palette: Record<string, string>;
    slots: Partial<Record<typeof EDITOR_THEME_SLOTS[number], EditorThemeSlot>>;
    controls?: Partial<Record<typeof EDITOR_THEME_CONTROLS[number], EditorThemeControl>>;
    previewAssetId?: string;
    thumbnailAssetId?: string;
    posterAssetId?: string;
}
export interface ParsedEditorTheme {
    design: EditorThemeDesign;
    files: (EditorThemeAsset & { data: Buffer })[];
}

function fail(message: string): never { throw new Error(message); }
function plain(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}
export function safeEditorThemeFilename(name: string) {
    return typeof name === 'string' && name.length > 0 && name.length <= 240
        && !/^[a-zA-Z]:/.test(name) && !/[\\\u0000-\u001f\u007f?#%]/.test(name)
        && !name.startsWith('/') && name.split('/').every((part) => part && part !== '.' && part !== '..');
}

/** Passive media only. Matching the file's signature prevents disguised executable uploads. */
export function editorThemeMediaType(name: string, bytes: Buffer) {
    const ext = extname(name).toLowerCase();
    if (ext === '.png' && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        && bytes.toString('ascii', 12, 16) === 'IHDR') return 'image/png';
    if (['.jpg', '.jpeg'].includes(ext) && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (ext === '.gif' && bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
    if (ext === '.webp' && bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF'
        && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (ext === '.avif' && bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp'
        && /avif|avis/.test(bytes.toString('ascii', 8, 64))) return 'image/avif';
    if (ext === '.mp4' && bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp'
        && /isom|iso[2-9]|mp4[12]|avc1|M4V |dash/.test(bytes.toString('ascii', 8, 80))) return 'video/mp4';
    if (ext === '.webm' && bytes.length >= 16 && bytes.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'))
        && bytes.subarray(0, 1024).includes(Buffer.from('webm'))) return 'video/webm';
    return '';
}

function optionalAsset(value: unknown, assets: Map<string, EditorThemeAsset>, label: string) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string' || !assets.has(value) || !assets.get(value).type.startsWith('image/')) {
        return fail(`${label}必须选择主题包里的图片。`);
    }
    return value;
}

/** Normalize each editable field, never accepting URLs, CSS, HTML, paths or script from clients. */
export function normalizeEditorThemeDesign(value: unknown, files: EditorThemeAsset[]): EditorThemeDesign {
    if (!plain(value)) fail('主题配置必须是一个对象。');
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) fail('请填写 1–60 个字的主题名称。');
    const base = value.base === undefined ? 'ocean' : value.base;
    if (!EDITOR_THEME_BASES.includes(base)) fail('请选择有效的基础主题。');
    const overlay = value.overlay === undefined ? 0.86 : Number(value.overlay);
    if (!Number.isFinite(overlay) || overlay < 0.35 || overlay > 0.98) fail('代码遮罩透明度应在 0.35–0.98 之间。');
    const palette: Record<string, string> = {};
    if (value.palette !== undefined && !plain(value.palette)) fail('配色配置无效。');
    for (const [key, color] of Object.entries(value.palette || {})) {
        if (!(EDITOR_THEME_PALETTE as readonly string[]).includes(key) || typeof color !== 'string'
            || !/^#[a-f\d]{6}$/i.test(color)) fail('主题配色只支持六位十六进制颜色。');
        palette[key] = color;
    }
    const assets = new Map(files.map((asset) => [asset.id, asset]));
    if (value.slots !== undefined && !plain(value.slots)) fail('素材区域配置无效。');
    const slots: EditorThemeDesign['slots'] = {};
    for (const [key, slot] of Object.entries(value.slots || {})) {
        if (!(EDITOR_THEME_SLOTS as readonly string[]).includes(key) || !plain(slot)) fail('不支持的主题区域。');
        if (typeof slot.assetId !== 'string' || !assets.has(slot.assetId)) fail('请选择主题包内的素材。');
        if (!['cover', 'contain', 'tile', 'stretch'].includes(slot.fit || 'cover')) fail('图片适配方式无效。');
        if (slot.position !== undefined && !EDITOR_THEME_POSITIONS.includes(slot.position)) fail('图片位置无效。');
        if (key !== 'background' && assets.get(slot.assetId).type.startsWith('video/')) fail('视频只能用于整个编辑区的背景。');
        slots[key] = { assetId: slot.assetId, fit: slot.fit || 'cover', ...(slot.position ? { position: slot.position } : {}) };
    }
    if (value.controls !== undefined && !plain(value.controls)) fail('图片控件配置无效。');
    const controls: EditorThemeDesign['controls'] = {};
    const controlAsset = (id: unknown) => {
        if (typeof id !== 'string' || !assets.get(id)?.type.startsWith('image/')) fail('图片控件必须使用主题包内的图片。');
        return id as string;
    };
    for (const [key, control] of Object.entries(value.controls || {})) {
        if (!(EDITOR_THEME_CONTROLS as readonly string[]).includes(key) || !plain(control)) fail('不支持的图片控件。');
        if (Object.keys(control).some((field) => !['assetId', 'width', 'height', 'hoverAssetId', 'activeAssetId'].includes(field))) {
            fail('图片控件包含不支持的配置。');
        }
        const width = control.width === undefined ? 120 : control.width;
        const height = control.height === undefined ? 40 : control.height;
        if (!Number.isInteger(width) || width < 16 || width > 320 || !Number.isInteger(height) || height < 16 || height > 120) {
            fail('图片控件宽度应为 16–320 像素，高度应为 16–120 像素，且必须是整数。');
        }
        controls[key] = { assetId: controlAsset(control.assetId), width, height,
            ...(control.hoverAssetId !== undefined ? { hoverAssetId: controlAsset(control.hoverAssetId) } : {}),
            ...(control.activeAssetId !== undefined ? { activeAssetId: controlAsset(control.activeAssetId) } : {}),
        };
    }
    return {
        name, base, overlay, palette, slots, controls,
        previewAssetId: optionalAsset(value.previewAssetId, assets, '完整界面预览'),
        thumbnailAssetId: optionalAsset(value.thumbnailAssetId, assets, '主题缩略图'),
        posterAssetId: optionalAsset(value.posterAssetId, assets, '视频封面'),
    };
}

function resolveManifest(raw: any, files: EditorThemeAsset[], defaultName: string) {
    if (!plain(raw) || raw.version !== 1) fail('theme.json 的 version 必须为 1。');
    const byName = new Map(files.map((file) => [file.name, file.id]));
    const resolve = (value: any) => typeof value === 'string' ? (byName.get(value) || value) : value;
    const slots: Record<string, any> = {};
    if (raw.slots !== undefined && !plain(raw.slots)) fail('theme.json 的 slots 配置无效。');
    for (const [key, slot] of Object.entries(raw.slots || {})) {
        slots[key] = typeof slot === 'string' ? { assetId: resolve(slot) }
            : plain(slot) ? { ...slot, assetId: resolve(slot.assetId || slot.asset || slot.file) } : slot;
    }
    const controls: Record<string, any> = {};
    if (raw.controls !== undefined && !plain(raw.controls)) fail('theme.json 的 controls 配置无效。');
    for (const [key, control] of Object.entries(raw.controls || {})) {
        if (!(EDITOR_THEME_CONTROLS as readonly string[]).includes(key)) fail('不支持的图片控件。');
        if (typeof control === 'string') controls[key] = { assetId: resolve(control) };
        else if (plain(control)) {
            if (Object.keys(control).some((field) => ![
                'assetId', 'asset', 'file', 'width', 'height', 'hoverAssetId', 'hover', 'activeAssetId', 'active',
            ].includes(field))) fail('图片控件包含不支持的配置。');
            controls[key] = { assetId: resolve(control.assetId ?? control.asset ?? control.file),
                width: control.width, height: control.height,
                ...(control.hoverAssetId !== undefined || control.hover !== undefined
                    ? { hoverAssetId: resolve(control.hoverAssetId ?? control.hover) } : {}),
                ...(control.activeAssetId !== undefined || control.active !== undefined
                    ? { activeAssetId: resolve(control.activeAssetId ?? control.active) } : {}),
            };
        } else controls[key] = control;
    }
    return normalizeEditorThemeDesign({
        ...raw, name: raw.name || defaultName, slots, controls,
        previewAssetId: resolve(raw.previewAssetId || raw.preview),
        thumbnailAssetId: resolve(raw.thumbnailAssetId || raw.thumbnail),
        posterAssetId: resolve(raw.posterAssetId || raw.poster),
    }, files);
}

export function parseEditorThemeZip(data: Buffer, filename = '图片主题.zip'): ParsedEditorTheme {
    if (!Buffer.isBuffer(data) || data.length < 22 || data.length > EDITOR_THEME_ZIP_LIMIT) fail('主题包必须是 64 MB 以内的 ZIP 文件。');
    let entries: ReturnType<AdmZip['getEntries']>;
    try { entries = new AdmZip(data).getEntries(); } catch { return fail('无法读取这个 ZIP 文件，请重新压缩后上传。'); }
    if (entries.length > FILE_LIMIT + 16) fail('主题包最多包含 64 个素材文件。');
    const seen = new Set<string>();
    const files: ParsedEditorTheme['files'] = [];
    let manifest: any;
    let total = 0;
    for (const entry of entries) {
        const name = entry.entryName.normalize('NFC');
        const checked = entry.isDirectory ? name.replace(/\/$/, '') : name;
        if (!safeEditorThemeFilename(checked)) fail('主题包包含不安全的文件路径。');
        const folded = name.toLowerCase();
        if (seen.has(folded)) fail('主题包内有重复文件名，请重命名后上传。');
        seen.add(folded);
        // UNIX type bits are in the upper half of the ZIP external attributes.
        const mode = (entry.attr >>> 16) & 0xf000;
        if (mode && mode !== 0x8000 && mode !== 0x4000) fail('主题包不能包含符号链接或特殊文件。');
        if (entry.isDirectory || name.startsWith('__MACOSX/') || /(?:^|\/)\.DS_Store$/.test(name)) continue;
        if (entry.header.flags & 1) fail('主题包不能加密，请移除压缩包密码。');
        const isManifest = folded === 'theme.json';
        const documentation = /^(?:readme|使用说明)\.(?:txt|md)$/i.test(name);
        const limit = isManifest || documentation ? MANIFEST_LIMIT : EDITOR_THEME_ASSET_LIMIT;
        total += entry.header.size;
        if (!Number.isSafeInteger(entry.header.size) || entry.header.size < 1 || entry.header.size > limit
            || total > EDITOR_THEME_TOTAL_LIMIT) fail('主题包解压后的文件过大。');
        let bytes: Buffer;
        try { bytes = entry.getData(); } catch { return fail(`文件 ${name} 已损坏，请重新打包。`); }
        if (bytes.length !== entry.header.size || bytes.length > limit) fail('主题包内文件大小不一致。');
        if (documentation) continue;
        if (isManifest) {
            try { manifest = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { return fail('theme.json 不是有效的 JSON。'); }
            continue;
        }
        const type = editorThemeMediaType(name, bytes);
        if (!type) fail(`不支持 ${name}，请只放入 PNG、JPG、WebP、GIF、AVIF 图片，或 MP4、WebM 视频。`);
        if (type.startsWith('image/') && bytes.length > IMAGE_LIMIT) fail(`图片 ${name} 超过 16 MB。`);
        if (files.length >= FILE_LIMIT) fail('主题包最多包含 64 个素材文件。');
        files.push({ id: createHash('sha256').update(name).digest('hex').slice(0, 24), name, type, size: bytes.length, data: bytes });
    }
    if (!files.length) fail('主题包里没有可以使用的图片或视频。');
    const defaultName = filename.replace(/\.zip$/i, '').trim().slice(0, 60) || '图片主题';
    if (manifest !== undefined) return { files, design: resolveManifest(manifest, files, defaultName) };
    // A complete-interface screenshot belongs in the preview slot, never in the live background.
    const preview = files.find((file) => /(?:^|\/)(?:preview|screenshot|完整界面|界面预览)\.(?:png|jpe?g|webp|avif)$/i.test(file.name));
    const thumbnail = files.find((file) => /(?:^|\/)(?:thumbnail|thumb|缩略图)\./i.test(file.name));
    const background = files.find((file) => /(?:background|背景|backdrop)/i.test(file.name) && file !== preview && file !== thumbnail)
        || files.find((file) => file !== preview && file !== thumbnail && file.type.startsWith('image/'));
    return { files, design: normalizeEditorThemeDesign({ name: defaultName,
        previewAssetId: preview?.id, thumbnailAssetId: thumbnail?.id,
        slots: background ? { background: { assetId: background.id, fit: 'cover' } } : {},
    }, files) };
}

export function editorThemeStoragePath(scope: string, version: string, asset: Pick<EditorThemeAsset, 'id' | 'name'>) {
    const scopeHash = createHash('sha256').update(scope).digest('hex').slice(0, 24);
    if (!/^[a-f\d]{32}$/.test(version) || !/^[a-f\d]{24}$/.test(asset.id)) fail('主题素材位置无效。');
    return `editor-theme/${scopeHash}/${version}/${asset.id}${extname(asset.name).toLowerCase()}`;
}

/** Export passive originals and a portable filename manifest, without domain or badge bindings. */
export async function exportEditorThemeZip(
    design: EditorThemeDesign,
    assets: EditorThemeAsset[],
    load: (asset: EditorThemeAsset) => Promise<AsyncIterable<Uint8Array> | Buffer>,
) {
    if (!Array.isArray(assets) || !assets.length || assets.length > FILE_LIMIT) fail('主题素材数量无效。');
    const normalized = normalizeEditorThemeDesign(design, assets);
    const names = new Set<string>();
    let total = 0;
    for (const asset of assets) {
        const name = asset.name?.normalize('NFC');
        if (!safeEditorThemeFilename(name) || name.toLowerCase() === 'theme.json' || names.has(name.toLowerCase())) fail('主题素材文件名无效。');
        names.add(name.toLowerCase());
        if (!Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > EDITOR_THEME_ASSET_LIMIT
            || (asset.type.startsWith('image/') && asset.size > IMAGE_LIMIT)) fail('主题素材大小无效。');
        total += asset.size;
        if (total > EDITOR_THEME_TOTAL_LIMIT) fail('导出素材总量超过 120 MB，请精简主题后重试。');
    }
    const zip = new AdmZip();
    for (const asset of assets) {
        const stream = await load(asset);
        if (!stream || (!Buffer.isBuffer(stream) && typeof stream[Symbol.asyncIterator] !== 'function')) fail('主题素材无法读取。');
        const chunks: Buffer[] = [];
        let size = 0;
        try {
            for await (const chunk of Buffer.isBuffer(stream) ? [stream] : stream) {
                if (!(chunk instanceof Uint8Array)) fail('主题素材内容无效。');
                size += chunk.byteLength;
                if (size > asset.size || size > EDITOR_THEME_ASSET_LIMIT) fail('主题素材大小与保存记录不一致。');
                chunks.push(Buffer.from(chunk));
            }
            if (size !== asset.size) fail('主题素材尚未完整读取，请重试导出。');
            const bytes = Buffer.concat(chunks, size);
            if (editorThemeMediaType(asset.name, bytes) !== asset.type) fail('主题素材格式与保存记录不一致。');
            zip.addFile(asset.name, bytes);
        } finally {
            if (!Buffer.isBuffer(stream) && typeof (stream as any).destroy === 'function') (stream as any).destroy();
        }
    }
    const byId = new Map(assets.map((asset) => [asset.id, asset.name]));
    const manifest = {
        version: 1, name: normalized.name, base: normalized.base, overlay: normalized.overlay, palette: normalized.palette,
        slots: Object.fromEntries(Object.entries(normalized.slots).map(([slot, placement]) => [slot, {
            asset: byId.get(placement.assetId), fit: placement.fit, ...(placement.position ? { position: placement.position } : {}),
        }])),
        ...(Object.keys(normalized.controls || {}).length ? { controls: Object.fromEntries(
            Object.entries(normalized.controls).map(([key, control]) => [key, {
                asset: byId.get(control.assetId), width: control.width, height: control.height,
                ...(control.hoverAssetId ? { hover: byId.get(control.hoverAssetId) } : {}),
                ...(control.activeAssetId ? { active: byId.get(control.activeAssetId) } : {}),
            }]),
        ) } : {}),
        preview: byId.get(normalized.previewAssetId), thumbnail: byId.get(normalized.thumbnailAssetId), poster: byId.get(normalized.posterAssetId),
    };
    zip.addFile('theme.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    const result = zip.toBuffer();
    if (result.length > EDITOR_THEME_ZIP_LIMIT) fail('导出的主题包超过 64 MB，请精简素材后重试。');
    return result;
}
