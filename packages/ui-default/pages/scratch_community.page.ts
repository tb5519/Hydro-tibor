import { NamedPage } from 'vj/misc/Page';

interface CommunityMetrics {
  likes: number;
  runtimeSeconds: number;
  likedToday?: boolean;
  canLike?: boolean;
  isTeacher?: boolean;
}
interface CommunityAnalytics extends CommunityMetrics {
  actualRuntimeSeconds: number;
  manualRuntimeSeconds: number;
  studentLikes: number;
  teacherLikes: number;
  participants: { uid: number; name: string; isTeacher: boolean; likes: number; runtimeSeconds: number }[];
}

function formatDuration(value: number) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} 小时${seconds % 3600 >= 60 ? ` ${Math.floor((seconds % 3600) / 60)} 分` : ''}`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)} 分${seconds % 60 ? ` ${seconds % 60} 秒` : ''}`;
  return `${seconds} 秒`;
}

function initMetrics() {
  const root = document.querySelector<HTMLElement>('[data-community-metrics]');
  if (!root) return;
  const like = root.querySelector<HTMLButtonElement>('[data-community-like]');
  const likeLabel = root.querySelector<HTMLElement>('[data-community-like-label]');
  const likeHint = root.querySelector<HTMLElement>('[data-community-like-hint]');
  const likeStatus = root.querySelector<HTMLElement>('[data-community-like-status]');
  const teacher = root.dataset.isTeacher === 'true';
  let canLike = root.dataset.canLike !== 'false';
  let likedToday = root.dataset.likedToday === 'true';
  let liking = false;
  let likeRequestId = '';
  let latestLikes = Number(root.querySelector('[data-community-like-count]')?.textContent) || 0;
  let latestRuntime = Number(root.dataset.runtimeSeconds) || 0;
  const controllers = new Set<AbortController>();
  const writeText = (selector: string, text: string) => document.querySelectorAll<HTMLElement>(selector).forEach((el) => { el.textContent = text; });
  const setStatus = (element: HTMLElement | null, message: string, error = false) => {
    if (element) { element.textContent = message; element.dataset.error = String(error); }
  };
  const renderMetrics = (metrics: Partial<CommunityMetrics>) => {
    if (Number.isFinite(metrics.likes)) { latestLikes = Math.max(latestLikes, metrics.likes); writeText('[data-community-like-count]', String(latestLikes)); }
    if (Number.isFinite(metrics.runtimeSeconds)) { latestRuntime = Math.max(latestRuntime, metrics.runtimeSeconds); writeText('[data-community-runtime]', formatDuration(latestRuntime)); }
    if (typeof metrics.canLike === 'boolean') canLike = metrics.canLike;
    if (typeof metrics.likedToday === 'boolean') likedToday = metrics.likedToday;
    if (like) { like.disabled = liking || !canLike; like.setAttribute('aria-pressed', String(likedToday)); }
    if (likeLabel) likeLabel.textContent = likedToday && !teacher ? '今天已点赞' : '给创意点赞';
    if (likeHint) likeHint.textContent = teacher ? '老师可多次送出鼓励' : `${likedToday ? '明天再来送一份鼓励吧' : '每件作品每天可点赞一次'} · 北京时间`;
  };
  async function api<T>(rawUrl: string, data?: Record<string, string>, controller = new AbortController()): Promise<T> {
    const endpoint = new URL(rawUrl, location.href);
    if (!rawUrl || endpoint.origin !== location.origin || !['http:', 'https:'].includes(endpoint.protocol)) throw new Error('作品地址无效，请刷新后重试。');
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(endpoint.href, {
        method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        ...(data ? { body: new URLSearchParams(data) } : {}),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(response.status === 403 ? '暂时无法操作，请刷新页面确认登录状态。' : '暂时无法完成，请重试。');
      return result;
    } catch (error) {
      if (['AbortError', 'TypeError', 'SyntaxError'].includes(error.name)) throw new Error('网络有点慢，请重试。');
      throw error;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  like?.addEventListener('click', async () => {
    if (liking || !canLike) return;
    liking = true;
    likeRequestId ||= crypto.randomUUID();
    renderMetrics({});
    setStatus(likeStatus, '正在送出鼓励…');
    try {
      const metrics = await api<CommunityMetrics>(root.dataset.metricsUrl, { operation: 'like', requestId: likeRequestId });
      likeRequestId = '';
      renderMetrics(metrics);
      setStatus(likeStatus, '鼓励已送达！');
    } catch (error) { setStatus(likeStatus, `${error.message} 再次点击可重试，不会重复计数。`, true); }
    finally { liking = false; renderMetrics({}); }
  });
  window.addEventListener('scratch-community-metrics', (event: CustomEvent<CommunityMetrics>) => {
    if (event.detail && typeof event.detail === 'object') {
      // A heartbeat may have started before a just-completed like request.
      renderMetrics({ likes: event.detail.likes, runtimeSeconds: event.detail.runtimeSeconds });
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !liking) {
      api<CommunityMetrics>(root.dataset.metricsUrl).then(renderMetrics).catch(() => {});
    }
  });

  const analyticsTrigger = document.querySelector<HTMLButtonElement>('[data-community-analytics]');
  const analyticsDialog = document.querySelector<HTMLDialogElement>('[data-community-analytics-dialog]');
  const analyticsContent = analyticsDialog?.querySelector<HTMLElement>('[data-community-analytics-content]');
  const analyticsStatus = analyticsDialog?.querySelector<HTMLElement>('[data-community-analytics-status]');
  const retry = analyticsDialog?.querySelector<HTMLButtonElement>('[data-community-analytics-retry]');
  const closeButtons = Array.from(analyticsDialog?.querySelectorAll<HTMLButtonElement>('[data-community-analytics-close]') || []);
  const form = analyticsDialog?.querySelector<HTMLFormElement>('[data-community-adjust-form]');
  const inputs = Array.from(form?.querySelectorAll<HTMLInputElement>('input') || []);
  const submit = form?.querySelector<HTMLButtonElement>('[data-community-adjust-submit]');
  const adjustStatus = form?.querySelector<HTMLElement>('[data-community-adjust-status]');
  let analyticsRequest: AbortController | null = null;
  let adjusting = false;
  let pendingAdjustment: { operation: string; requestId: string; likes: string; runtimeSeconds: string } | null = null;
  const renderAnalytics = (data: CommunityAnalytics) => {
    renderMetrics(data);
    const values = {
      likes: String(data.likes), 'student-likes': String(data.studentLikes), 'teacher-likes': String(data.teacherLikes),
      runtime: formatDuration(data.runtimeSeconds), 'actual-runtime': formatDuration(data.actualRuntimeSeconds),
      'manual-runtime': formatDuration(data.manualRuntimeSeconds),
    };
    Object.entries(values).forEach(([key, value]) => writeText(`[data-analytics-${key}]`, value));
    const rows = analyticsDialog?.querySelector<HTMLElement>('[data-community-participants]');
    const participants = Array.isArray(data.participants) ? data.participants : [];
    if (rows) {
      rows.replaceChildren();
      participants.forEach((participant) => {
        const row = document.createElement('tr');
        const name = document.createElement('td');
        name.textContent = participant.name || '课堂小伙伴';
        if (participant.isTeacher) {
          const role = document.createElement('span');
          role.className = 'sc-community-participant-role';
          role.textContent = '老师';
          name.append(role);
        }
        const likes = document.createElement('td');
        likes.textContent = String(participant.likes);
        const runtime = document.createElement('td');
        runtime.textContent = formatDuration(participant.runtimeSeconds);
        row.append(name, likes, runtime);
        rows.append(row);
      });
    }
    const empty = analyticsDialog?.querySelector<HTMLElement>('[data-community-participants-empty]');
    const table = analyticsDialog?.querySelector<HTMLElement>('[data-community-participants-table]');
    if (empty) empty.hidden = Boolean(participants.length);
    if (table) table.hidden = !participants.length;
    if (analyticsContent) analyticsContent.hidden = false;
  };
  const setAdjustBusy = () => {
    if (submit) { submit.disabled = adjusting; submit.textContent = adjusting ? '正在增加…' : pendingAdjustment ? '重试本次增加' : '确认增加'; }
    inputs.forEach((input) => { input.disabled = adjusting || Boolean(pendingAdjustment); });
    closeButtons.forEach((button) => { button.disabled = adjusting; });
  };
  const loadAnalytics = async () => {
    if (!teacher || !analyticsTrigger || !analyticsDialog?.open) return;
    analyticsRequest?.abort();
    const controller = new AbortController();
    analyticsRequest = controller;
    if (analyticsContent) analyticsContent.hidden = true;
    if (retry) retry.hidden = true;
    setStatus(analyticsStatus, '正在读取作品数据…');
    try {
      const data = await api<CommunityAnalytics>(analyticsTrigger.dataset.communityAnalytics, undefined, controller);
      if (analyticsRequest !== controller || !analyticsDialog.open) return;
      renderAnalytics(data);
      setStatus(analyticsStatus, '');
      setAdjustBusy();
    } catch (error) {
      if (analyticsRequest !== controller || !analyticsDialog.open) return;
      setStatus(analyticsStatus, error.message, true);
      if (retry) retry.hidden = false;
    } finally { if (analyticsRequest === controller) analyticsRequest = null; }
  };
  analyticsTrigger?.addEventListener('click', () => {
    if (!teacher || !analyticsDialog) return;
    analyticsDialog.showModal();
    closeButtons[0]?.focus();
    loadAnalytics();
  });
  retry?.addEventListener('click', loadAnalytics);
  closeButtons.forEach((button) => button.addEventListener('click', () => { if (!adjusting) analyticsDialog?.close(); }));
  analyticsDialog?.addEventListener('cancel', (event) => { if (adjusting) event.preventDefault(); });
  analyticsDialog?.addEventListener('close', () => {
    analyticsRequest?.abort();
    analyticsRequest = null;
    analyticsTrigger?.focus();
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (adjusting || !teacher || !analyticsDialog?.open || !analyticsTrigger) return;
    if (!pendingAdjustment) {
      if (!form.reportValidity()) return;
      const likes = Number(form.querySelector<HTMLInputElement>('[data-community-adjust-likes]').value);
      const minutes = Number(form.querySelector<HTMLInputElement>('[data-community-adjust-minutes]').value);
      const seconds = Number(form.querySelector<HTMLInputElement>('[data-community-adjust-seconds]').value);
      if (![likes, minutes, seconds].every((value) => Number.isSafeInteger(value) && value >= 0) || seconds > 59 || !(likes || minutes || seconds)) {
        setStatus(adjustStatus, '请填写要增加的点赞次数或运行时长，至少有一项大于 0。', true);
        return;
      }
      pendingAdjustment = { operation: 'adjust', requestId: crypto.randomUUID(), likes: String(likes), runtimeSeconds: String(minutes * 60 + seconds) };
    }
    adjusting = true;
    setAdjustBusy();
    setStatus(adjustStatus, '正在增加，完成后小伙伴就能看到…');
    try {
      const data = await api<CommunityAnalytics>(analyticsTrigger.dataset.communityAnalytics, pendingAdjustment);
      pendingAdjustment = null;
      renderAnalytics(data);
      form.reset();
      setStatus(adjustStatus, '已增加，社区里的数据也已更新。');
    } catch (error) {
      setStatus(adjustStatus, `${error.message} 点击“重试本次增加”会继续刚才的操作，不会重复计数。`, true);
    } finally { adjusting = false; setAdjustBusy(); }
  });
  window.addEventListener('pagehide', () => controllers.forEach((controller) => controller.abort()));
}

export default new NamedPage('scratch_community_detail', () => {
  initMetrics();
  const trigger = document.querySelector<HTMLButtonElement>('[data-scratch-community-unpublish]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-scratch-community-unpublish-dialog]');
  const confirm = document.querySelector<HTMLButtonElement>('[data-scratch-community-unpublish-confirm]');
  const status = document.querySelector<HTMLElement>('[data-scratch-community-unpublish-status]');
  const cancelButtons = Array.from(dialog?.querySelectorAll<HTMLButtonElement>(
    '[data-scratch-community-unpublish-cancel], [data-scratch-dialog-close]',
  ) || []);
  const cancel = cancelButtons.find((button) => button.closest('.sc-dialog-actions')) || cancelButtons[0];
  let busy = false;
  let request: AbortController | null = null;
  trigger?.addEventListener('click', () => {
    if (!dialog) return;
    if (status) status.textContent = '';
    dialog.showModal();
    cancel?.focus();
  });
  cancelButtons.forEach((button) => {
    button.addEventListener('click', () => { if (!busy) dialog?.close(); });
  });
  dialog?.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog?.addEventListener('close', () => trigger?.focus());
  confirm?.addEventListener('click', async () => {
    if (busy || !trigger || !dialog?.open) return;
    busy = true;
    confirm.disabled = true;
    cancelButtons.forEach((button) => { button.disabled = true; });
    if (status) { status.textContent = '正在从社区撤下…'; status.dataset.error = 'false'; }
    const current = new AbortController();
    request = current;
    const timer = setTimeout(() => current.abort(), 30000);
    try {
      const endpoint = new URL(trigger.dataset.scratchCommunityUnpublish || '', location.href);
      if (endpoint.origin !== location.origin || !['http:', 'https:'].includes(endpoint.protocol)) throw new Error('作品地址无效，请刷新后重试。');
      const response = await fetch(endpoint.href, {
        method: 'POST', credentials: 'same-origin', signal: current.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ operation: 'unpublish' }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('暂时无法撤下作品，请重试。');
      const next = new URL(result.url || trigger.dataset.communityReturn || './', location.href);
      if (next.origin !== location.origin || !['http:', 'https:'].includes(next.protocol)) throw new Error('作品已撤下，请返回社区。');
      location.assign(next.href);
    } catch (error) {
      if (status) {
        status.textContent = ['AbortError', 'TypeError'].includes(error.name) ? '网络有点慢，请重试。' : error.message;
        status.dataset.error = 'true';
      }
    } finally {
      clearTimeout(timer);
      if (request === current) request = null;
      busy = false;
      confirm.disabled = false;
      cancelButtons.forEach((button) => { button.disabled = false; });
    }
  });
  window.addEventListener('pagehide', () => request?.abort());
});
