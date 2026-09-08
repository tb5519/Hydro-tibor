import { ActiveContestTimer, ContestTimerSnapshot, formatContestCountdown } from 'vj/common/contest-timer';
import { AutoloadPage } from 'vj/misc/Page';

export default new AutoloadPage('activeContestTimer', () => {
  const endpoint = UiContext.contestTimerEndpoint;
  if (!UserContext._id || !endpoint || document.querySelector('.contest-clock')) return;
  const storageKey = `hydro:contest-clock:${UserContext._id}:${UiContext.domain?.workspaceId || 'tang'}`;
  let contests: ActiveContestTimer[] = [];
  let selectedId = '';
  let serverNow = Date.now();
  let syncedAt = performance.now();
  let lastRefresh = -Infinity;
  let fetching = false;
  let position: { x: number, y: number } | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) position = saved;
    selectedId = sessionStorage.getItem(`${storageKey}:selected`) || '';
  } catch { /* Browser privacy settings may disable storage. */ }

  const root = document.createElement('aside');
  root.className = 'contest-clock';
  root.hidden = true;
  root.setAttribute('aria-label', '比赛计时器');
  root.innerHTML = `
    <div class="contest-clock__top">
      <span class="contest-clock__state"><span class="contest-clock__dot"></span>比赛进行中</span>
      <div class="contest-clock__tools">
        <button type="button" class="contest-clock__switch" hidden></button>
        <button type="button" class="contest-clock__drag" title="拖动调整位置 · 双击复位" aria-label="移动计时器，方向键调整位置，Home 键复位">
          <svg viewBox="0 0 12 18" width="12" height="18" aria-hidden="true"><g fill="currentColor">
            <circle cx="3" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/>
            <circle cx="3" cy="9" r="1.3"/><circle cx="9" cy="9" r="1.3"/>
            <circle cx="3" cy="15" r="1.3"/><circle cx="9" cy="15" r="1.3"/>
          </g></svg>
        </button>
      </div>
    </div>
    <a class="contest-clock__link">
      <span class="contest-clock__title"></span>
      <span class="contest-clock__bottom">
        <span class="contest-clock__time" role="timer" aria-live="off"></span>
        <span class="contest-clock__return">返回比赛 <span aria-hidden="true">↗</span></span>
      </span>
    </a>
    <div class="contest-clock__track" aria-hidden="true"><span class="contest-clock__progress"></span></div>`;
  document.body.append(root);
  const link = root.querySelector<HTMLAnchorElement>('.contest-clock__link');
  const title = root.querySelector<HTMLElement>('.contest-clock__title');
  const countdown = root.querySelector<HTMLElement>('.contest-clock__time');
  const progress = root.querySelector<HTMLElement>('.contest-clock__progress');
  const switchButton = root.querySelector<HTMLButtonElement>('.contest-clock__switch');
  const dragButton = root.querySelector<HTMLButtonElement>('.contest-clock__drag');

  const bounds = () => {
    const viewport = window.visualViewport;
    const margin = window.innerWidth <= 600 ? 12 : 24;
    const bottom = Math.max(margin, Number.parseFloat(getComputedStyle(root).bottom) || 0);
    return {
      left: (viewport?.offsetLeft || 0) + margin,
      top: (viewport?.offsetTop || 0) + margin,
      width: Math.max(0, (viewport?.width || window.innerWidth) - root.offsetWidth - margin * 2),
      height: Math.max(0, (viewport?.height || window.innerHeight) - root.offsetHeight - margin - bottom),
    };
  };
  const applyPosition = () => {
    if (root.hidden) return;
    const box = bounds();
    const desired = position || { x: 1, y: 1 };
    root.style.left = `${box.left + Math.max(0, Math.min(1, desired.x)) * box.width}px`;
    root.style.top = `${box.top + Math.max(0, Math.min(1, desired.y)) * box.height}px`;
  };
  const savePosition = () => {
    try {
      if (position) localStorage.setItem(storageKey, JSON.stringify(position));
      else localStorage.removeItem(storageKey);
    } catch { /* The timer remains usable without persistence. */ }
  };
  const moveTo = (x: number, y: number) => {
    const box = bounds();
    position = {
      x: box.width ? Math.max(0, Math.min(1, (x - box.left) / box.width)) : 0,
      y: box.height ? Math.max(0, Math.min(1, (y - box.top) / box.height)) : 0,
    };
    applyPosition();
  };

  const render = () => {
    const now = serverNow + performance.now() - syncedAt;
    const active = contests.filter((contest) => contest.beginAt <= now && contest.endAt > now);
    const current = active.find((contest) => contest.id === selectedId) || active[0];
    const wasHidden = root.hidden;
    root.hidden = !current;
    if (!current) return;
    selectedId = current.id;
    title.textContent = current.title;
    title.title = current.title;
    link.href = current.url;
    link.setAttribute('aria-label', `${current.title}，返回比赛题目列表`);
    countdown.textContent = formatContestCountdown(current.endAt - now);
    root.classList.toggle('contest-clock--urgent', current.endAt - now <= 5 * 60000);
    progress.style.transform = `scaleX(${Math.max(0, Math.min(1, (current.endAt - now) / (current.endAt - current.beginAt)))})`;
    switchButton.hidden = active.length < 2;
    switchButton.textContent = `${active.indexOf(current) + 1} / ${active.length}`;
    switchButton.setAttribute('aria-label', `已参加 ${active.length} 场比赛，切换到下一场`);
    switchButton.title = '切换比赛 · 默认显示最早结束的比赛';
    if (wasHidden) applyPosition();
  };
  const useSnapshot = (snapshot: ContestTimerSnapshot, elapsed = 0) => {
    if (!Number.isFinite(snapshot?.serverNow) || !Array.isArray(snapshot?.contests)) return;
    serverNow = snapshot.serverNow + elapsed;
    syncedAt = performance.now();
    contests = snapshot.contests;
    render();
  };
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  useSnapshot(UiContext.activeContestTimers, navigation?.responseStart ? Math.max(0, performance.now() - navigation.responseStart) : 0);

  async function refresh() {
    if (fetching || document.hidden || performance.now() - lastRefresh < 5000) return;
    fetching = true;
    lastRefresh = performance.now();
    const start = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(endpoint, {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        contests = [];
        render();
      } else if (response.ok) useSnapshot(await response.json(), (performance.now() - start) / 2);
    } catch { /* Keep the last authoritative deadline through brief disconnects. */ } finally {
      clearTimeout(timeout);
      fetching = false;
    }
  }

  switchButton.addEventListener('click', () => {
    const now = serverNow + performance.now() - syncedAt;
    const active = contests.filter((contest) => contest.endAt > now);
    selectedId = active[(active.findIndex((contest) => contest.id === selectedId) + 1) % active.length]?.id || '';
    try { sessionStorage.setItem(`${storageKey}:selected`, selectedId); } catch { /* Optional preference. */ }
    render();
  });

  let drag: { id: number, x: number, y: number, left: number, top: number, moved: boolean, target: Element } | null = null;
  let suppressClick = false;
  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || (event.target as Element).closest('.contest-clock__switch')) return;
    const rect = root.getBoundingClientRect();
    const target = (event.target as Element).closest('a, button') || root;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false, target };
    suppressClick = false;
    target.setPointerCapture(event.pointerId);
  });
  root.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    root.classList.add('contest-clock--dragging');
    event.preventDefault();
    moveTo(drag.left + dx, drag.top + dy);
  });
  const stopDrag = () => {
    if (!drag) return;
    suppressClick = drag.moved;
    if (drag.moved) savePosition();
    drag = null;
    root.classList.remove('contest-clock--dragging');
  };
  root.addEventListener('pointerup', stopDrag);
  root.addEventListener('pointercancel', stopDrag);
  root.addEventListener('lostpointercapture', stopDrag);
  root.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, true);
  root.addEventListener('dragstart', (event) => event.preventDefault());
  const resetPosition = () => {
    position = null;
    savePosition();
    applyPosition();
  };
  dragButton.addEventListener('dblclick', resetPosition);
  dragButton.addEventListener('keydown', (event) => {
    if (event.key === 'Home') {
      event.preventDefault();
      resetPosition();
      return;
    }
    const directions = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
    if (!directions[event.key]) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    const [dx, dy] = directions[event.key];
    moveTo(rect.left + dx, rect.top + dy);
    savePosition();
  });
  window.addEventListener('resize', applyPosition);
  window.visualViewport?.addEventListener('resize', applyPosition);
  window.visualViewport?.addEventListener('scroll', applyPosition);
  document.addEventListener('visibilitychange', () => {
    render();
    refresh();
  });
  document.addEventListener('fullscreenchange', () => {
    (document.fullscreenElement || document.body).append(root);
    applyPosition();
  });
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', () => {
    applyPosition();
    refresh();
  });
  window.addEventListener('online', refresh);
  window.setInterval(render, 1000);
  window.setInterval(refresh, 30000);
});
