/* eslint-disable no-await-in-loop */
import { randomBytes } from 'crypto';
import { readFile, stat } from 'fs/promises';
import type { Context } from '../context';
import { NotFoundError, PermissionError, ValidationError } from '../error';
import { tryRedirectAsset } from '../lib/asset_delivery';
import assetStorage from '../lib/asset_storage';
import {
    EDITOR_THEME_BASES, EDITOR_THEME_ZIP_LIMIT, EditorThemeAsset, EditorThemeDesign,
    editorThemeStoragePath, exportEditorThemeZip, normalizeEditorThemeDesign, parseEditorThemeZip,
} from '../lib/editor_image_theme';
import { getUserBadgeGallery } from '../lib/user_badge_gallery';
import { PERM, PRIV } from '../model/builtin';
import storage from '../model/storage';
import user from '../model/user';
import workspace from '../model/workspace';
import { Handler, param, Types } from '../service/server';

const DRAFT_LIFETIME = 24 * 60 * 60 * 1000;
const VERSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const PUBLISH_LEASE = 5 * 60 * 1000;
const randomId = () => randomBytes(16).toString('hex');
export function editorThemeScope(domain: any) {
    return workspace.resolveDomainWorkspaceId(domain) === workspace.LEGACY_WORKSPACE_ID ? 'global' : `domain:${domain._id}`;
}
function badgeScope(domain: any) {
    return editorThemeScope(domain) === 'global' ? { domainId: { $exists: false } } : { domainId: domain._id };
}
function collections(handler: Handler) {
    const db = handler.ctx.db as any;
    return {
        themes: db.collection('editor.theme'), drafts: db.collection('editor.themeDraft'),
        versions: db.collection('editor.themeVersion'), selections: db.collection('editor.themeSelection'),
        badges: db.collection('badge'),
    };
}
export async function canManageEditorThemes(handler: Handler) {
    if (editorThemeScope(handler.domain) === 'global') return (await workspace.getLegacyWorkspace()).ownerUid === handler.user._id;
    return handler.user.hasPerm(PERM.PERM_EDIT_DOMAIN);
}
/** Theme access never grants a badge or changes the account's real collection. */
export async function canUseAllEditorThemes(handler: Handler) {
    return handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM, PRIV.PRIV_MANAGE_ALL_DOMAIN)
        || workspace.isPlatformAdmin(handler.user._id)
        || await canManageEditorThemes(handler);
}
async function assertManage(handler: Handler) {
    handler.checkPriv(PRIV.PRIV_USER_PROFILE);
    if (!await canManageEditorThemes(handler)) throw new PermissionError(PERM.PERM_EDIT_DOMAIN);
}
function privateResponse(handler: Handler) {
    handler.response.addHeader('Cache-Control', 'private, no-store');
    handler.response.addHeader('Vary', 'Cookie, Authorization');
    handler.response.addHeader('X-Content-Type-Options', 'nosniff');
}
function assetUrl(handler: Handler, version: string, assetId: string) {
    return handler.url('code_editor_theme_asset', { domainId: handler.domain._id, version, asset: assetId });
}
function present(handler: Handler, theme: any, expiresAt?: string | null, badgeTitle?: string) {
    const assets = theme.assets.map((asset: EditorThemeAsset) => ({
        id: asset.id, name: asset.name, type: asset.type, size: asset.size,
        url: assetUrl(handler, theme.version || theme._id, asset.id),
    }));
    const result = {
        ...theme.design,
        id: theme.badgeId ? `badge:${theme.badgeId}` : theme._id,
        badgeId: theme.badgeId, version: theme.version || theme._id, assets,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        ...(badgeTitle ? { badgeTitle } : {}),
        previewUrl: assets.find((asset: any) => asset.id === theme.design.previewAssetId)?.url || '',
        thumbnailUrl: assets.find((asset: any) => asset.id === theme.design.thumbnailAssetId)?.url || '',
    };
    return result;
}
function jsonObject(value: any, fallback: any) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string') return value;
    if (value.length > 65536) throw new ValidationError('theme', null, '主题配置过大。');
    try { return JSON.parse(value); } catch { throw new ValidationError('theme', null, '主题配置格式无效。'); }
}
function designFromArgs(args: any, previous: EditorThemeDesign, assets: EditorThemeAsset[]) {
    try {
        return normalizeEditorThemeDesign({
            name: args.name ?? previous.name, base: args.base ?? previous.base, overlay: args.overlay ?? previous.overlay,
            palette: jsonObject(args.palette, previous.palette), slots: jsonObject(args.slots, previous.slots),
            controls: jsonObject(args.controls, previous.controls),
            previewAssetId: args.previewAssetId ?? previous.previewAssetId,
            thumbnailAssetId: args.thumbnailAssetId ?? previous.thumbnailAssetId,
            posterAssetId: args.posterAssetId ?? previous.posterAssetId,
        }, assets);
    } catch (error) { throw new ValidationError('theme', null, error.message); }
}

/** Claim expired drafts before retiring objects. A publish lease cannot be claimed by cleanup. */
export async function cleanEditorThemeDrafts(ctx: Context, now = new Date()) {
    const db = ctx.db as any;
    const drafts = db.collection('editor.themeDraft');
    const query = { expiresAt: { $lte: now }, $and: [
        { $or: [{ publishLeaseUntil: { $exists: false } }, { publishLeaseUntil: { $lte: now } }] },
        { $or: [{ cleanupStartedAt: { $exists: false } }, { cleanupStartedAt: { $lte: new Date(now.getTime() - 5 * 60 * 1000) } }] },
    ] };
    const expired = await drafts.find(query).limit(30).toArray();
    for (const candidate of expired) {
        const draft = await drafts.findOneAndUpdate({ _id: candidate._id, ...query }, { $set: { cleanupStartedAt: now } });
        if (!draft) continue;
        const paths = draft.assets.map((asset: EditorThemeAsset) => asset.path);
        const [published, version] = await Promise.all([
            db.collection('editor.theme').findOne({ 'assets.path': { $in: paths } }),
            db.collection('editor.themeVersion').findOne({ 'assets.path': { $in: paths } }),
        ]);
        // Published snapshots own their source objects independently of the upload draft.
        if (!published && !version) await storage.del(paths, draft.owner);
        await drafts.deleteOne({ _id: draft._id, cleanupStartedAt: now });
    }
    await cleanEditorThemeVersions(ctx, now);
}

/** Keep the current publication and seven days of history; retire only unreachable artwork. */
export async function cleanEditorThemeVersions(ctx: Context, now = new Date()) {
    const db = ctx.db as any;
    const versions = db.collection('editor.themeVersion');
    const themes = db.collection('editor.theme');
    const drafts = db.collection('editor.themeDraft');
    const query = { updatedAt: { $lte: new Date(now.getTime() - VERSION_LIFETIME) }, $and: [
        { $or: [{ publishLeaseUntil: { $exists: false } }, { publishLeaseUntil: { $lte: now } }] },
        { $or: [{ gcClaimedAt: { $exists: false } }, { gcClaimedAt: { $lte: new Date(now.getTime() - PUBLISH_LEASE) } }] },
    ] };
    const expired = await versions.find(query).limit(100).toArray();
    for (const candidate of expired) {
        if (await themes.findOne({ version: candidate._id })) continue;
        const token = randomId();
        const version = await versions.findOneAndUpdate({ _id: candidate._id, ...query }, {
            $set: { gcClaimedAt: now, gcToken: token },
        });
        if (!version) continue;
        // Recheck after claiming. A marked version can no longer acquire an edit lease.
        if (await themes.findOne({ version: candidate._id })) {
            await versions.updateOne({ _id: candidate._id, gcToken: token }, { $unset: { gcClaimedAt: '', gcToken: '' } });
            continue;
        }
        for (const asset of version.assets as EditorThemeAsset[]) {
            const [current, retained, draft] = await Promise.all([
                themes.findOne({ 'assets.path': asset.path }),
                versions.findOne({ 'assets.path': asset.path, $or: [
                    { gcClaimedAt: { $exists: false } }, { publishLeaseUntil: { $gt: now } },
                ] }),
                drafts.findOne({ 'assets.path': asset.path, $or: [
                    { expiresAt: { $gt: now } }, { publishLeaseUntil: { $gt: now } },
                ] }),
            ]);
            // Other GC-marked snapshots are no longer editable. Ignoring them
            // prevents parallel collectors from mutually retaining orphaned media.
            if (!current && !retained && !draft) await storage.del([asset.path], version.updatedBy);
        }
        // Keep the snapshot and its asset list if storage retirement fails, so
        // another worker can recover it instead of losing the last cleanup reference.
        await versions.deleteOne({ _id: version._id, gcToken: token });
    }
}

export class EditorThemeManageHandler extends Handler {
    async prepare() {
        privateResponse(this);
        await assertManage(this);
    }

    async get() {
        if (this.request.query?.export !== undefined) {
            const value = this.request.query.export;
            const match = typeof value === 'string' && /^badge:([1-9]\d*)$/.exec(value);
            const badgeId = match ? Number(match[1]) : 0;
            if (!Number.isSafeInteger(badgeId) || badgeId <= 0) throw new ValidationError('export');
            const scope = editorThemeScope(this.domain);
            const { badges, themes, versions } = collections(this);
            const [badge, theme] = await Promise.all([
                badges.findOne({ _id: badgeId, ...badgeScope(this.domain) }),
                themes.findOne({ _id: `${scope}:${badgeId}`, scope }),
            ]);
            if (!badge || !theme) throw new NotFoundError('theme');
            const lease = await versions.findOneAndUpdate({ _id: theme.version, scope, gcClaimedAt: { $exists: false } }, {
                $max: { publishLeaseUntil: new Date(Date.now() + PUBLISH_LEASE) },
            });
            if (!lease) throw new ValidationError('theme', null, '主题正在更新，请刷新后重新导出。');
            let bytes: Buffer;
            try {
                bytes = await exportEditorThemeZip(theme.design, theme.assets, async (asset) => {
                    const meta = await storage.getMeta(asset.path);
                    if (!meta?.remoteAsset || meta['Content-Type'] !== asset.type || meta.remoteAsset.contentType !== asset.type
                        || meta.size !== asset.size || meta.remoteAsset.size !== asset.size) throw new Error('主题素材未保存在对象存储中。');
                    return storage.get(asset.path);
                });
            } catch (error) { throw new ValidationError('theme', null, error.message); }
            this.binary(bytes, `${theme.design.name}.zip`);
            this.response.type = 'application/zip';
            return;
        }
        const { badges, themes } = collections(this);
        const [rows, published] = await Promise.all([
            badges.find(badgeScope(this.domain)).project({ _id: 1, title: 1, short: 1 }).sort({ _id: 1 }).toArray(),
            themes.find({ scope: editorThemeScope(this.domain) }).sort({ updatedAt: -1 }).toArray(),
        ]);
        const titleById = new Map(rows.map((badge: any) => [badge._id, `${badge.title || badge.short || `徽章 ${badge._id}`}`]));
        const data = {
            url: this.url(editorThemeScope(this.domain) === 'global' ? 'manage_editor_themes' : 'domain_editor_themes'),
            badges: rows.map((badge: any) => ({ id: badge._id, title: titleById.get(badge._id) })),
            themes: published.filter((theme: any) => titleById.has(theme.badgeId))
                .map((theme: any) => present(this, theme, undefined, titleById.get(theme.badgeId) as string)),
        };
        this.response.body = {
            badges: data.badges, themes: data.themes, editorThemeManage: data,
            editorThemeBaseTemplate: editorThemeScope(this.domain) === 'global' ? 'manage_base.html' : 'domain_base.html',
        };
        if (this.request.json || this.request.query?.data === '1') return;
        this.response.template = 'editor_theme_manage.html';
        this.UiContext.editorThemeManage = data;
    }

    async postUpload() {
        const candidate = this.request.files?.file;
        const file = Array.isArray(candidate) ? candidate[0] : candidate;
        if (!file?.filepath || !/\.zip$/i.test(file.originalFilename || '')) throw new ValidationError('file', null, '请选择 ZIP 主题包。');
        const info = await stat(file.filepath);
        if (!info.isFile() || info.size < 22 || info.size > EDITOR_THEME_ZIP_LIMIT) {
            throw new ValidationError('file', null, '主题包必须是 64 MB 以内的 ZIP 文件。');
        }
        let parsed: ReturnType<typeof parseEditorThemeZip>;
        try { parsed = parseEditorThemeZip(await readFile(file.filepath), file.originalFilename); } catch (error) {
            throw new ValidationError('file', null, error.message);
        }
        const scope = editorThemeScope(this.domain);
        const id = randomId();
        const paths: string[] = [];
        const assets: EditorThemeAsset[] = [];
        const { drafts, badges } = collections(this);
        const draft = { _id: id, scope, owner: this.user._id, createdAt: new Date(),
            expiresAt: new Date(Date.now() + DRAFT_LIFETIME), design: parsed.design, assets };
        try {
            for (const source of parsed.files) {
                const path = editorThemeStoragePath(scope, id, source);
                paths.push(path);
                // No website-local fallback, even if OSS configuration changes during the upload.
                await storage.put(path, source.data, this.user._id, { remoteOnly: true });
                assets.push({ id: source.id, name: source.name, type: source.type, size: source.size, path });
            }
            await drafts.insertOne(draft);
        } catch (error) {
            // A write acknowledgement may be lost after the database accepted it.
            let persisted: boolean;
            try { persisted = !!await drafts.findOne({ _id: id }); } catch { /* Keep uncertain references intact. */ }
            if (persisted === false) await storage.del(paths, this.user._id).catch(() => undefined);
            throw new ValidationError('file', null, `主题包未发布，现有主题不受影响。${error.message}`);
        }
        const rows = await badges.find(badgeScope(this.domain)).project({ _id: 1, title: 1, short: 1 }).sort({ _id: 1 }).toArray();
        this.response.body = { draft: { ...present(this, draft), id },
            badges: rows.map((badge: any) => ({ id: badge._id, title: `${badge.title || badge.short || `徽章 ${badge._id}`}` })) };
    }

    async postPublish() {
        const args = this.args;
        const badgeId = Number(args.badgeId);
        if (!Number.isSafeInteger(badgeId) || badgeId <= 0) throw new ValidationError('badgeId', null, '请选择关联的徽章。');
        const { badges, drafts, themes, versions } = collections(this);
        const badge = await badges.findOne({ _id: badgeId, ...badgeScope(this.domain) });
        if (!badge) throw new NotFoundError('badge');
        const scope = editorThemeScope(this.domain);
        let source: any;
        if (args.draftId) {
            if (!/^[a-f\d]{32}$/.test(args.draftId)) throw new ValidationError('draftId');
            source = await drafts.findOneAndUpdate({ _id: args.draftId, scope, owner: this.user._id,
                expiresAt: { $gt: new Date() }, cleanupStartedAt: { $exists: false } }, {
                $max: { publishLeaseUntil: new Date(Date.now() + PUBLISH_LEASE) },
            });
        } else if (args.themeId) {
            const previousId = /^badge:(\d+)$/.exec(args.themeId)?.[1];
            if (!previousId || Number(previousId) !== badgeId) throw new ValidationError('themeId');
            source = await themes.findOne({ _id: `${scope}:${badgeId}`, scope });
            if (source && !await versions.findOneAndUpdate({ _id: source.version, scope, gcClaimedAt: { $exists: false } }, {
                $max: { publishLeaseUntil: new Date(Date.now() + PUBLISH_LEASE) },
            })) source = null;
        }
        if (!source) throw new ValidationError('draftId', null, '请先上传主题包；未发布的素材保留 24 小时。');
        const design = designFromArgs(args, source.design, source.assets);
        // Verify all objects before replacing a working published version.
        for (const asset of source.assets as EditorThemeAsset[]) {
            const meta = await storage.getMeta(asset.path);
            if (!meta?.remoteAsset || meta['Content-Type'] !== asset.type || meta.size !== asset.size
                || meta.remoteAsset.contentType !== asset.type || meta.remoteAsset.size !== asset.size) {
                throw new ValidationError('theme', null, '主题素材尚未完整保存到对象存储，请重新上传。');
            }
        }
        // A slow storage verification must not outlive its lease and then
        // publish artwork that cleanup has already claimed. Refresh atomically
        // immediately before recording the new immutable publication.
        const renewed = args.draftId
            ? await drafts.updateOne({ _id: args.draftId, scope, owner: this.user._id,
                expiresAt: { $gt: new Date() }, cleanupStartedAt: { $exists: false } }, {
                $max: { publishLeaseUntil: new Date(Date.now() + PUBLISH_LEASE) },
            })
            : await versions.updateOne({ _id: source.version, scope, gcClaimedAt: { $exists: false } }, {
                $max: { publishLeaseUntil: new Date(Date.now() + PUBLISH_LEASE) },
            });
        if (!renewed.matchedCount) throw new ValidationError('theme', null, '这份主题素材已过期，请刷新设计或重新上传后发布。');
        const version = randomId();
        const now = new Date();
        const theme = { _id: `${scope}:${badgeId}`, scope, badgeId, version, design, assets: source.assets,
            updatedAt: now, updatedBy: this.user._id };
        await versions.insertOne({ ...theme, _id: version });
        // One atomic pointer replacement. Failed validation/upload never alters the published theme.
        const { _id, ...publishedFields } = theme;
        try { await themes.updateOne({ _id }, { $set: publishedFields }, { upsert: true }); } catch (error) {
            if (!await themes.findOne({ _id, version })) throw error;
        }
        // Draft bookkeeping must not turn a successful publication into a reported failure.
        if (args.draftId) await drafts.updateOne({ _id: args.draftId }, { $set: { publishedAt: now, badgeId } }).catch(() => undefined);
        this.response.body = { theme: present(this, theme, undefined, `${badge.title || badge.short || `徽章 ${badgeId}`}`), saved: true };
    }

    async postRemove() {
        const badgeId = Number(this.args.badgeId);
        if (!Number.isSafeInteger(badgeId) || badgeId <= 0) throw new ValidationError('badgeId');
        await collections(this).themes.deleteOne({ _id: `${editorThemeScope(this.domain)}:${badgeId}` });
        this.response.body = { removed: true };
    }
}

export async function getEditorThemeCatalog(handler: Handler) {
    const now = new Date();
    const scope = editorThemeScope(handler.domain);
    const { badges, themes, selections } = collections(handler);
    const administrator = await canUseAllEditorThemes(handler);
    const eligible = administrator
        ? (await badges.find(badgeScope(handler.domain)).project({ _id: 1, title: 1, short: 1 }).toArray())
            .map((badge: any) => ({ id: badge._id, title: `${badge.title || badge.short || `徽章 ${badge._id}`}`, expiresAt: null }))
        : (await getUserBadgeGallery(handler.ctx, handler.domain, handler.user._id, now)).badgeCards;
    const byId = new Map<number, { title: string; expiresAt: string | null }>(eligible.map((badge: any) => [badge.id, badge]));
    const [rows, selection] = await Promise.all([
        byId.size ? themes.find({ scope, badgeId: { $in: [...byId.keys()] } }).sort({ updatedAt: -1 }).toArray() : Promise.resolve([]),
        selections.findOne({ _id: `${scope}:${handler.user._id}` }),
    ]);
    const fallback = EDITOR_THEME_BASES.includes(handler.user['scratchpadTheme']) ? handler.user['scratchpadTheme'] : 'ocean';
    const available = rows.map((theme: any) => ({
        ...present(handler, theme, byId.get(theme.badgeId)!.expiresAt, byId.get(theme.badgeId)!.title),
        ...(administrator ? { administratorAccess: true } : {}),
    }));
    const selectedId = available.some((theme: any) => theme.id === selection?.themeId) ? selection.themeId : fallback;
    if (selection?.themeId && selectedId !== selection.themeId) {
        await selections.updateOne({ _id: selection._id, themeId: selection.themeId }, { $unset: { themeId: '' } });
    }
    return { themes: available, selectedId, fallback, administratorAccess: administrator, serverNow: now.toISOString() };
}

export class EditorThemeCatalogHandler extends Handler {
    async prepare() { this.checkPriv(PRIV.PRIV_USER_PROFILE); privateResponse(this); }
    async get() { this.response.body = await getEditorThemeCatalog(this); }
    async postSelect() {
        const id = this.args.id;
        const catalog = await getEditorThemeCatalog(this);
        const builtin = (EDITOR_THEME_BASES as readonly string[]).includes(id);
        if (!builtin && !catalog.themes.some((theme: any) => theme.id === id)) {
            throw new ValidationError('theme', null, '你暂未持有这个主题对应的有效徽章，请选择其他主题。');
        }
        const scope = editorThemeScope(this.domain);
        if (builtin) await user.setById(this.user._id, { scratchpadTheme: id } as any);
        await collections(this).selections.updateOne({ _id: `${scope}:${this.user._id}` }, {
            $set: { scope, uid: this.user._id, updatedAt: new Date(), ...(builtin ? {} : { themeId: id }) },
            ...(builtin ? { $unset: { themeId: '' } } : {}),
        }, { upsert: true });
        this.response.body = { ...catalog, selectedId: id, fallback: builtin ? id : catalog.fallback };
    }
    async post() { await this.postSelect(); }
}

/** Authorized decorative media redirects straight to object storage; Hydro never streams large artwork. */
export class EditorThemeAssetHandler extends Handler {
    @param('version', Types.String)
    @param('asset', Types.String)
    async get(domainId: string, version: string, assetId: string) {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (!/^[a-f\d]{32}$/.test(version) || !/^[a-f\d]{24}$/.test(assetId)) throw new NotFoundError('theme asset');
        const scope = editorThemeScope(this.domain);
        const { badges, drafts, versions, themes } = collections(this);
        const manager = await canManageEditorThemes(this);
        const administrator = manager || await canUseAllEditorThemes(this);
        let source = await versions.findOne({ _id: version, scope });
        if (source) {
            if (!manager) {
                const [current, gallery, badge] = await Promise.all([
                    themes.findOne({ _id: `${scope}:${source.badgeId}`, version }),
                    administrator ? Promise.resolve(null) : getUserBadgeGallery(this.ctx, this.domain, this.user._id),
                    administrator ? badges.findOne({ _id: source.badgeId, ...badgeScope(this.domain) }) : Promise.resolve(null),
                ]);
                if (!current || (administrator ? !badge : !gallery.badgeCards.some((item) => item.id === source.badgeId))) {
                    throw new NotFoundError('theme asset');
                }
            }
        } else if (manager) source = await drafts.findOne({ _id: version, scope, owner: this.user._id, expiresAt: { $gt: new Date() } });
        if (!source) throw new NotFoundError('theme asset');
        const asset = source.assets.find((item: EditorThemeAsset) => item.id === assetId);
        if (!asset) throw new NotFoundError('theme asset');
        const meta = await storage.getMeta(asset.path);
        if (!meta?.remoteAsset || meta['Content-Type'] !== asset.type || meta.remoteAsset.contentType !== asset.type
            || meta.size !== asset.size || meta.remoteAsset.size !== asset.size) throw new NotFoundError('theme asset');
        this.response.type = 'application/json';
        this.response.addHeader('X-Content-Type-Options', 'nosniff');
        this.response.addHeader('Referrer-Policy', 'no-referrer');
        this.response.addHeader('Vary', 'Cookie, Authorization');
        this.response.addHeader('Cache-Control', 'private, max-age=300');
        if (!tryRedirectAsset(this, { path: asset.path, meta })) {
            this.response.redirect = await assetStorage.signDownloadLink(meta.remoteAsset);
            this.response.status = 302;
        }
    }
}

export async function apply(ctx: Context) {
    ctx.Route('manage_editor_themes', '/manage/editor-themes', EditorThemeManageHandler);
    ctx.Route('domain_editor_themes', '/domain/editor-themes', EditorThemeManageHandler);
    ctx.Route('code_editor_themes', '/code-editor/themes', EditorThemeCatalogHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('code_editor_theme_asset', '/code-editor/theme-asset/:version/:asset', EditorThemeAssetHandler, PRIV.PRIV_USER_PROFILE);
    const ownerUid = (await workspace.getLegacyWorkspace()).ownerUid;
    // Multiple workers may run this task; atomic draft claims make it safe to overlap.
    ctx.interval(() => cleanEditorThemeDrafts(ctx).catch((error) => ctx.logger.warn('Editor theme draft cleanup failed: %s', error.message)), 60 * 60 * 1000);
    ctx.injectUI('ControlPanel', 'manage_editor_themes', { before: 'manage_setting' }, (handler) => handler.user._id === ownerUid);
    ctx.injectUI('DomainManage', 'domain_editor_themes', { family: 'Properties', icon: 'info', before: 'domain_edit' }, PERM.PERM_EDIT_DOMAIN);
    ctx.on('handler/after', (handler: Handler) => {
        if (handler.response.template && !handler.request.json && handler.user?._id > 0) {
            handler.UiContext.codeEditorThemesUrl = handler.url('code_editor_themes', { domainId: handler.domain._id });
        }
    });
}
