import type { Context } from '../context';
import { IdeError } from '../lib/ide_protocol';
import { PERM, PRIV } from '../model/builtin';
import { deleteIdeFile, DuplicateIdeFileError, getIdeFile, listIdeFiles, saveIdeFile } from '../model/ide_file';
import { Handler } from '../service/server';
import { authorizeIdeAccess, checkIdeHttpOrigin } from './ide_runtime';

export class IdeFilesHandler extends Handler {
    private async handle(mutation: boolean) {
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Cookie, Authorization');
        try {
            this.checkPriv(PRIV.PRIV_USER_PROFILE);
            this.checkPerm(PERM.PERM_SUBMIT_PROBLEM);
            checkIdeHttpOrigin(this, mutation);
            const access = await authorizeIdeAccess(this);
            await this.limitRate('ide_files', 60, mutation ? 60 : 180);
            const { id, action, revision } = this.args;
            if (!mutation) this.response.body = id
                ? { file: await getIdeFile(this.user._id, this.domain._id, String(id)) }
                : { files: await listIdeFiles(this.user._id, this.domain._id) };
            else if (action === 'save') this.response.body = {
                file: await saveIdeFile(this.user._id, this.domain._id, this.args, access.languages),
            };
            else if (action === 'delete') {
                await deleteIdeFile(this.user._id, this.domain._id, String(id), revision);
                this.response.body = { ok: true };
            } else throw new IdeError('INVALID_MESSAGE', '操作无效。');
        } catch (error) {
            this.response.status = error instanceof IdeError
                ? ({ FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, DUPLICATE_NAME: 409, FILE_LIMIT: 413 }[error.code] || 400) : 503;
            this.response.body = { error: error instanceof IdeError ? error.code : 'UNAVAILABLE',
                message: error instanceof IdeError ? error.message : '暂时无法访问云端文件，请稍后重试。',
                ...(error instanceof DuplicateIdeFileError ? { existing: error.existing } : {}) };
        }
    }
    async get() { await this.handle(false); }
    async post() { await this.handle(true); }
}
export function apply(ctx: Context) {
    ctx.Route('ide_files', '/ide/files', IdeFilesHandler, PERM.PERM_SUBMIT_PROBLEM);
}
