import {
  ContestModel, Context, DocumentModel, DomainModel, Handler, PERM, PRIV, UserModel,
} from 'hydrooj';
import type { Tdoc } from 'hydrooj/src/interface';
import { canViewContestLevel } from 'hydrooj/src/lib/contest_access';
import workspace from 'hydrooj/src/model/workspace';
import { ActiveContestTimer, ContestTimerSnapshot, getContestTimerWindow } from '../common/contest-timer';

type TimerContest = Pick<Tdoc,
  'docId' | 'domainId' | 'title' | 'rule' | 'beginAt' | 'endAt' | 'duration'
  | 'allDomains' | 'owner' | 'assign' | 'maintainer' | 'targetStudentLevels'>;

export async function getActiveContestTimers(that: Handler): Promise<ContestTimerSnapshot> {
  const empty = () => ({ serverNow: Date.now(), contests: [] });
  if (!that.user.hasPriv(PRIV.PRIV_USER_PROFILE)) return empty();
  const entryDomain = that.contestEntryContext?.domain || that.domain;
  const entryUser = await UserModel.getById(entryDomain._id, that.user._id, that.session.scope);
  if (!entryUser?.hasPerm(PERM.PERM_VIEW)) return empty();

  // A timer follows its participant between banks, but never across workspaces.
  const domains = await DomainModel.coll.find(workspace.getDomainQuery(workspace.resolveDomainWorkspaceId(entryDomain)))
    .project({ _id: 1 }).toArray();
  const domainIds = domains.map((domain) => domain._id);
  const statuses = await DocumentModel.getMultiStatusWithoutDomain(DocumentModel.TYPE_CONTEST, {
    uid: that.user._id, attend: { $gt: 0 }, domainId: { $in: domainIds },
    $or: [{ endAt: { $exists: false } }, { endAt: null }, { endAt: { $gt: new Date() } }],
  }).project({ docId: 1, domainId: 1, attend: 1, startAt: 1, endAt: 1, entryDomainId: 1 }).toArray();
  if (!statuses.length) return empty();
  const now = Date.now();
  const contests = await DocumentModel.coll.find({
    docType: DocumentModel.TYPE_CONTEST,
    domainId: { $in: domainIds },
    docId: { $in: statuses.map((status) => status.docId) },
    rule: { $ne: 'homework' }, beginAt: { $lte: new Date(now) }, endAt: { $gt: new Date(now) },
  }).project<TimerContest>({
    docId: 1, domainId: 1, title: 1, rule: 1, beginAt: 1, endAt: 1, duration: 1, allDomains: 1, owner: 1, assign: 1,
    maintainer: 1, targetStudentLevels: 1,
  }).toArray();
  const statusMap = new Map(statuses.map((status) => [`${status.domainId}/${status.docId}`, status]));
  const users = new Map<string, ReturnType<typeof UserModel.getById>>();
  const getUser = (domainId: string) => {
    if (!users.has(domainId)) users.set(domainId, UserModel.getById(domainId, that.user._id, that.session.scope));
    return users.get(domainId);
  };
  const timers = await Promise.all(contests.map(async (contest): Promise<ActiveContestTimer | null> => {
    const status = statusMap.get(`${contest.domainId}/${contest.docId}`);
    const window = getContestTimerWindow(contest, status, now);
    if (!window || !ContestModel.RULES[contest.rule] || ContestModel.RULES[contest.rule].hidden) return null;
    const sourceUser = await getUser(contest.domainId);
    if (!sourceUser || !canViewContestLevel(sourceUser, contest)) return null;
    // Shared contests use the current accessible bank; private contests return
    // to their source bank only while the student can still view it.
    const linkDomain = contest.allDomains ? entryDomain._id : contest.domainId;
    const linkUser = contest.allDomains ? entryUser : sourceUser;
    if (!linkUser.hasPerm(PERM.PERM_VIEW | PERM.PERM_VIEW_CONTEST)) return null;
    if (contest.assign?.length && !sourceUser.own(contest) && !sourceUser.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST)) {
      const groups = await UserModel.listGroup(contest.domainId, that.user._id);
      if (!groups.some((group) => contest.assign.includes(group.name))) return null;
    }
    return {
      id: `${contest.domainId}/${contest.docId}`,
      title: contest.title,
      url: that.url('contest_problemlist', { domainId: linkDomain, tid: contest.docId.toString() }),
      ...window,
    };
  }));
  return {
    serverNow: Date.now(),
    contests: timers.filter((timer): timer is ActiveContestTimer => !!timer)
      .sort((a, b) => a.endAt - b.endAt || a.id.localeCompare(b.id)),
  };
}

class ActiveContestTimerHandler extends Handler {
  async get() {
    this.checkPriv(PRIV.PRIV_USER_PROFILE);
    this.response.addHeader('Cache-Control', 'private, no-store');
    this.response.body = await getActiveContestTimers(this);
  }
}

export function apply(ctx: Context) {
  ctx.Route('active_contest_timers', '/active-contest-timers', ActiveContestTimerHandler);
  ctx.on('handler/after', async (that) => {
    if (that.request.json || !that.response.template || !that.user.hasPriv(PRIV.PRIV_USER_PROFILE)) return;
    that.UiContext.contestTimerEndpoint = that.url('active_contest_timers', {
      domainId: that.contestEntryContext?.domain._id || that.domain._id,
    });
    that.UiContext.activeContestTimers = await getActiveContestTimers(that);
  });
}
