import { Context } from '../context';
import { ValidationError } from '../error';
import { isScratchDomain } from '../lib/domain_type';
import { SCRATCH_MAX_FILE_SIZE, SCRATCH_PRESET_KINDS } from '../lib/scratch_files';
import { PERM, PRIV } from '../model/builtin';
import * as scratch from '../model/scratch';
import { ScratchHandler } from './scratch';

function itemFor(handler: ScratchHandler, preset: scratch.ScratchPreset) {
    const fileUrl = handler.url('scratch_file', { fileId: preset.fileId });
    return {
        id: preset._id.toHexString(), title: preset.title, kind: preset.kind,
        filename: preset.filename, mime: preset.mime, size: preset.size, fileUrl,
        ...(preset.mime.startsWith('image/') ? { previewUrl: fileUrl } : {}),
    };
}

export class ScratchLibraryHandler extends ScratchHandler {
    async get() {
        const docs = await scratch.listPresets(this.actor).toArray();
        this.response.type = 'application/json';
        this.response.body = { items: docs.map((doc) => itemFor(this, doc)) };
    }
}

export class ScratchLibraryManageHandler extends ScratchHandler {
    async prepare() {
        await super.prepare();
        scratch.requireTeacher(this.actor);
    }

    async get() {
        const docs = await scratch.listPresets(this.actor).toArray();
        this.response.template = 'scratch_library_manage.html';
        this.response.body = {
            presets: docs.map((doc) => itemFor(this, doc)), isTeacher: true,
            maxFileSize: SCRATCH_MAX_FILE_SIZE, presetKinds: SCRATCH_PRESET_KINDS,
        };
    }

    async post() {
        await this.limitRate('scratch_preset_upload', 60, 40);
        const upload = this.upload();
        if (Array.isArray(upload) || typeof upload.filepath !== 'string') throw new ValidationError('file', null, '请每次上传一个素材。');
        const doc = await scratch.createPreset(this.actor, this.request.body, upload);
        this.response.type = 'application/json';
        this.response.body = { ok: true, item: itemFor(this, doc) };
    }
}

export class ScratchLibraryItemHandler extends ScratchHandler {
    async prepare() {
        await super.prepare();
        scratch.requireTeacher(this.actor);
    }

    async post() {
        if (!['rename', 'delete'].includes(this.request.body.operation)) throw new ValidationError('operation');
    }

    async postRename() {
        const doc = await scratch.renamePreset(this.actor, this.routeId('presetId'), this.request.body.title);
        this.response.type = 'application/json';
        this.response.body = { ok: true, item: itemFor(this, doc) };
    }

    async postDelete() {
        await scratch.deletePreset(this.actor, this.routeId('presetId'));
        this.response.type = 'application/json';
        this.response.body = { ok: true };
    }
}

// entry/worker loads every handler module once, including this module.
export function apply(ctx: Context) {
    ctx.Route('scratch_library', '/scratch/library', ScratchLibraryHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('domain_scratch_library', '/domain/scratch-library', ScratchLibraryManageHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('domain_scratch_library_item', '/domain/scratch-library/:presetId', ScratchLibraryItemHandler, PRIV.PRIV_USER_PROFILE);
    ctx.injectUI('DomainManage', 'domain_scratch_library', { family: 'Properties', icon: 'image', before: 'domain_edit' },
        (handler) => isScratchDomain(handler.domain) && handler.user.hasPerm(PERM.PERM_EDIT_DOMAIN));
}
