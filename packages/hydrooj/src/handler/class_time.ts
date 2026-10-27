import type { Context } from '../context';
import { UserFacingError, ValidationError } from '../error';
import { ClassTimeTokenError, ingest } from '../model/class_time';
import { Handler } from '../service/server';

export class ClassTimeIngestHandler extends Handler {
    noCheckPermView = true;
    // This endpoint uses its own write-only secret, independently of cookies.
    allowCors = true;

    async prepare() {
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Cookie, Authorization');
        await this.limitRate('class_time_ingest', 60, 120);
    }

    async post() {
        if (this.request.query?.token !== undefined) throw new ValidationError('token');
        if (!/^application\/json(?:\s*;|$)/i.test(String(this.request.headers['content-type'] || ''))) throw new ValidationError('Content-Type');
        const body = this.request.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('classTime');
        const authorization = this.request.headers.authorization;
        let secret: unknown = body.token;
        if (authorization !== undefined) {
            const match = typeof authorization === 'string' && /^Bearer (\S+)$/i.exec(authorization);
            if (!match || (secret !== undefined && secret !== match[1])) throw new ClassTimeTokenError();
            secret = match[1];
        }
        const payload = { ...body };
        delete payload.token;
        this.response.body = await ingest(secret, payload, this.domain);
    }

    async onerror(error: Error & { code?: number, msg?: () => string }) {
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.status = error instanceof ValidationError ? 400 : error instanceof UserFacingError ? error.code : 500;
        this.response.body = { error: error.name, message: error instanceof UserFacingError ? error.msg() : '课时同步暂不可用，请稍后重试。' };
    }
}

export function apply(ctx: Context) {
    ctx.Route('training_time_classes', '/training-time/classes', ClassTimeIngestHandler);
}
