import type { Context } from '../context';
import { ForbiddenError } from '../error';
import { acknowledgeOpeningMessage, ensureOpeningMessageIndexes } from '../lib/opening_message';
import { PRIV } from '../model/builtin';
import { Handler, post, Types } from '../service/server';

export class OpeningMessageAcknowledgeHandler extends Handler {
    noCheckPermView = true;

    async prepare() {
        this.response.addHeader('Cache-Control', 'private, no-store');
    }

    @post('revision', Types.String)
    async post(domainId: string, revision: string) {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        // Account inspection must leave the actual student's unread message intact.
        if (this.session.sudoUid) throw new ForbiddenError('老师查看学员账号时不能确认学员的开屏消息');
        await acknowledgeOpeningMessage(this.user, revision);
        this.response.body = { acknowledged: true };
    }
}

export async function apply(ctx: Context) {
    await ensureOpeningMessageIndexes();
    ctx.Route('student_message_ack', '/student-message/ack', OpeningMessageAcknowledgeHandler, PRIV.PRIV_USER_PROFILE);
}
