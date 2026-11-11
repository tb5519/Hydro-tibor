export interface TeacherShareStudent { uid: number; name: string; online?: boolean }
export interface TeacherShareControlState {
  mode: 'assist' | 'broadcast';
  studentName?: string;
  label?: string;
  status?: string;
  busy?: boolean;
  switchDisabled?: boolean;
  canChooseStudent?: boolean;
  students?: TeacherShareStudent[];
}

/** Persistent teacher-only controls. Switching direction is owned by the caller;
 * this surface never creates, disconnects or changes classroom permissions. */
export function createTeacherShareControls(actions: {
  userId?: number;
  onSwitch(studentUid?: number): void;
  onEnd(): void;
  onChooseStudent?(): void;
}, doc: Document = document) {
  const win = doc.defaultView!;
  const make = (tag: string, className: string, text = '') => {
    const node = doc.createElement(tag); node.className = className; node.textContent = text; return node;
  };
  const icon = (path: string) => {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('aria-hidden', 'true');
    const shape = doc.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', path);
    svg.append(shape); return svg;
  };
  const root = make('aside', 'teacher-share-controls');
  root.dataset.liveSharePrivate = ''; root.dataset.teacherShareControls = '';
  root.setAttribute('aria-label', '课堂共享控制'); root.hidden = true;
  const heading = make('div', 'teacher-share-controls__heading');
  heading.dataset.shareDragHandle = ''; heading.tabIndex = 0;
  heading.setAttribute('aria-label', '拖动共享控制，或使用方向键移动');
  const title = make('div', 'teacher-share-controls__title');
  const mode = make('span', 'teacher-share-controls__mode');
  const name = make('strong', 'teacher-share-controls__name live-share-controls__name');
  const choose = make('button', 'teacher-share-controls__choose') as HTMLButtonElement;
  choose.type = 'button'; choose.title = '切换学员'; choose.setAttribute('aria-label', '切换学员');
  choose.append(icon('M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M2 17v-1a5 5 0 0 1 10 0v1M14 4a3 3 0 0 1 0 6m1 3a4 4 0 0 1 3 4'));
  const collapse = make('button', 'teacher-share-controls__collapse') as HTMLButtonElement;
  collapse.type = 'button'; collapse.dataset.shareCollapse = '';
  collapse.append(icon('m6 12 4-4 4 4'));
  const headingActions = make('div', 'teacher-share-controls__heading-actions');
  title.append(mode, name); headingActions.append(choose, collapse); heading.append(title, headingActions);
  const status = make('span', 'teacher-share-controls__status'); status.dataset.shareStatus = '';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const switchButton = make('button', 'teacher-share-controls__switch') as HTMLButtonElement;
  switchButton.type = 'button'; switchButton.dataset.shareSwitchMode = '';
  const switchText = make('span', '');
  switchButton.append(icon('M3 6h13m-3-3 3 3-3 3M17 14H4m3-3-3 3 3 3'), switchText);
  const end = make('button', 'teacher-share-controls__end') as HTMLButtonElement;
  end.type = 'button'; end.dataset.shareEnd = '';
  end.append(icon('M10 2v7M5 4.5a7 7 0 1 0 10 0'), make('span', '', '结束'));
  const actionRow = make('div', 'teacher-share-controls__actions'); actionRow.append(switchButton, end);
  const picker = make('div', 'teacher-share-controls__picker'); picker.hidden = true;
  picker.setAttribute('role', 'group'); picker.setAttribute('aria-label', '选择要查看的学员');
  const pickerHeading = make('div', 'teacher-share-controls__picker-heading', '查看谁的画面');
  const list = make('div', 'teacher-share-controls__students'); picker.append(pickerHeading, list);
  root.append(heading, status, actionRow, picker); doc.body.append(root);
  let state: TeacherShareControlState | null = null;
  let disposed = false;
  const storageKey = Number.isSafeInteger(actions.userId) && actions.userId! > 0
    ? `onebyone.teacher-share-controls.v1:${actions.userId}` : null;
  let position = { x: 1, y: 0.5 }; let collapsed = false;
  let drag: { id: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null = null;
  let suppressClick = false;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  try {
    const saved = storageKey && JSON.parse(win.localStorage.getItem(storageKey) || 'null');
    if (saved?.version === 1 && [saved.x, saved.y].every((value) => typeof value === 'number' && Number.isFinite(value))) {
      position = { x: clamp(saved.x, 0, 1), y: clamp(saved.y, 0, 1) }; collapsed = saved.collapsed === true;
    }
  } catch { /* A blocked/full store must not prevent dragging or connecting. */ }
  const persist = () => {
    if (storageKey) try { win.localStorage.setItem(storageKey, JSON.stringify({ version: 1, ...position, collapsed })); } catch { /* Keep the in-memory position. */ }
  };
  const placementBounds = () => {
    const area = win.visualViewport;
    return { left: (area?.offsetLeft || 0) + 12, top: (area?.offsetTop || 0) + 12,
      width: Math.max(0, (area?.width || win.innerWidth) - root.offsetWidth - 24),
      height: Math.max(0, (area?.height || win.innerHeight) - root.offsetHeight - 24) };
  };
  const place = () => {
    if (disposed || root.hidden) return;
    const area = placementBounds();
    root.style.left = `${Math.round(area.left + position.x * area.width)}px`;
    root.style.top = `${Math.round(area.top + position.y * area.height)}px`;
    placePicker();
  };
  const moveTo = (left: number, top: number) => {
    const area = placementBounds();
    position = { x: area.width ? clamp((left - area.left) / area.width, 0, 1) : 0,
      y: area.height ? clamp((top - area.top) / area.height, 0, 1) : 0 };
    place();
  };
  let pickerOpen = false;
  let pickerKey = '';
  const closePicker = (restoreFocus = false) => {
    pickerOpen = false; picker.hidden = true;
    switchButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !root.hidden) switchButton.focus({ preventScroll: true });
  };
  function renderCollapse() {
    root.classList.toggle('is-collapsed', collapsed);
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.setAttribute('aria-label', collapsed ? '展开共享控制' : '收起共享控制');
    collapse.title = collapsed ? '展开共享控制' : '收起共享控制';
    mode.textContent = state?.mode === 'assist' ? (collapsed ? '协助' : '正在协助') : (collapsed ? '分享' : '正在分享');
    root.title = collapsed ? `${state?.mode === 'assist' ? '正在协助' : '正在分享'} · ${name.textContent}${status.textContent ? ` · ${status.textContent}` : ''}` : '';
    place();
  }
  collapse.addEventListener('click', () => {
    if (!state || disposed) return;
    collapsed = !collapsed; closePicker(); renderCollapse(); persist();
  });
  const dragStart = (event: PointerEvent) => {
    if (!state || disposed || event.button !== 0 || (event.target as Element).closest('button')) return;
    const rect = root.getBoundingClientRect();
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
    try { heading.setPointerCapture(event.pointerId); } catch { /* Synthetic input has no captured pointer. */ }
  };
  const dragMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX; const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true; closePicker(); root.classList.add('is-dragging');
    event.preventDefault(); event.stopPropagation(); moveTo(drag.left + dx, drag.top + dy);
  };
  const dragEnd = (event?: PointerEvent) => {
    if (!drag || event && event.pointerId !== drag.id) return;
    const current = drag; drag = null; root.classList.remove('is-dragging');
    if (current.moved) { suppressClick = true; persist(); }
    try { heading.releasePointerCapture(current.id); } catch { /* Capture may already be lost. */ }
  };
  const resetClick = () => { suppressClick = false; };
  const guardClick = (event: MouseEvent) => {
    if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const moveByKey = (event: KeyboardEvent) => {
    if (event.target !== heading || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const rect = root.getBoundingClientRect(); const step = event.shiftKey ? 32 : 12;
    moveTo(rect.left + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
      rect.top + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)); persist();
  };
  const availableStudents = () => (state?.students || []).filter((student) => Number.isSafeInteger(student.uid) && student.uid > 0);
  const placePicker = () => {
    if (!pickerOpen) return;
    const bounds = root.getBoundingClientRect();
    const viewTop = win.visualViewport?.offsetTop || 0;
    const viewHeight = win.visualViewport?.height || win.innerHeight;
    const beside = bounds.left >= picker.offsetWidth + 18;
    picker.style.right = beside ? 'calc(100% + 10px)' : '0';
    picker.style.bottom = 'auto';
    const desiredTop = beside ? bounds.top : bounds.top - picker.offsetHeight - 8;
    const top = Math.max(viewTop + 8, Math.min(desiredTop, viewTop + viewHeight - picker.offsetHeight - 8));
    picker.style.top = `${top - bounds.top}px`;
  };
  function renderPicker() {
    const students = availableStudents();
    const nextKey = JSON.stringify(students);
    if (nextKey === pickerKey) return;
    pickerKey = nextKey; list.replaceChildren();
    for (const student of students) {
      const button = make('button', 'teacher-share-controls__student') as HTMLButtonElement;
      button.type = 'button'; button.disabled = student.online === false; button.dataset.studentUid = String(student.uid);
      const label = make('span', '', student.name || '学员'); label.title = student.name;
      button.append(make('i', student.online === false ? 'is-offline' : ''), label);
      if (student.online === false) button.append(make('small', '', '离线'));
      button.addEventListener('click', () => {
        if (!state || state.busy || state.switchDisabled || !availableStudents().some((item) => item.uid === student.uid && item.online !== false)) return;
        closePicker(); actions.onSwitch(student.uid);
      });
      list.append(button);
    }
  }
  switchButton.addEventListener('click', () => {
    if (!state || state.busy || state.switchDisabled) return;
    const students = availableStudents();
    if (state.mode === 'broadcast' && students.length > 1) {
      if (pickerOpen) { closePicker(); return; }
      renderPicker(); pickerOpen = true; picker.hidden = false; switchButton.setAttribute('aria-expanded', 'true');
      placePicker();
      list.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    } else actions.onSwitch(state.mode === 'broadcast' ? students[0]?.uid : undefined);
  });
  end.addEventListener('click', () => { if (state && !state.busy) { closePicker(); actions.onEnd(); } });
  choose.addEventListener('click', () => { if (state?.canChooseStudent && !state.busy) { closePicker(); actions.onChooseStudent?.(); } });
  const outside = (event: Event) => { if (!root.contains(event.target as Node)) closePicker(); };
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && pickerOpen) { event.preventDefault(); event.stopPropagation(); closePicker(true); }
  };
  const pageGesture = () => closePicker();
  doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', escape, true);
  root.addEventListener('pointerdown', resetClick, true); root.addEventListener('click', guardClick, true);
  heading.addEventListener('pointerdown', dragStart); heading.addEventListener('keydown', moveByKey);
  win.addEventListener('pointermove', dragMove, true); win.addEventListener('pointerup', dragEnd, true);
  win.addEventListener('pointercancel', dragEnd, true); heading.addEventListener('lostpointercapture', dragEnd);
  win.addEventListener('onebyone:platform-gesture', pageGesture);
  win.addEventListener('resize', place); win.visualViewport?.addEventListener('resize', place); win.visualViewport?.addEventListener('scroll', place);
  return {
    update(next: TeacherShareControlState | null) {
      if (disposed) return;
      const changedMode = state?.mode !== next?.mode;
      state = next ? { ...next, students: next.students?.map((student) => ({ ...student })) } : null;
      root.hidden = !state;
      if (!state) { dragEnd(); closePicker(); return; }
      root.dataset.mode = state.mode; root.classList.toggle('is-busy', !!state.busy);
      root.setAttribute('aria-busy', String(!!state.busy));
      name.textContent = state.label || state.studentName || (state.mode === 'broadcast' ? '我的画面' : '学员');
      name.title = name.textContent;
      const nextStatus = state.status || (state.busy ? '正在切换…' : '');
      if (status.textContent !== nextStatus) status.textContent = nextStatus;
      status.title = nextStatus;
      status.hidden = !nextStatus;
      switchText.textContent = state.mode === 'assist' ? '分享我的画面' : '查看学员画面';
      switchButton.setAttribute('aria-label', switchText.textContent);
      const students = availableStudents();
      const nobodyOnline = state.mode === 'broadcast' && students.length > 0 && students.every((student) => student.online === false);
      switchButton.disabled = !!(state.busy || state.switchDisabled || nobodyOnline);
      switchButton.title = nobodyOnline ? '学员上线后可查看画面' : state.switchDisabled ? '当前页面暂不能切换分享' : switchText.textContent;
      if (state.mode === 'broadcast' && students.length > 1) switchButton.setAttribute('aria-haspopup', 'true');
      else switchButton.removeAttribute('aria-haspopup');
      end.setAttribute('aria-label', state.mode === 'assist' ? '断开共享' : '结束分享'); end.disabled = !!state.busy;
      if (state.mode === 'broadcast') end.dataset.broadcastStop = '';
      else delete end.dataset.broadcastStop;
      choose.hidden = !state.canChooseStudent || !actions.onChooseStudent; choose.disabled = !!state.busy;
      renderCollapse();
      if (changedMode || state.busy || switchButton.disabled || students.length <= 1) closePicker();
      else if (pickerOpen) { renderPicker(); placePicker(); }
    },
    dispose() {
      if (disposed) return;
      dragEnd(); disposed = true; state = null; root.remove();
      doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', escape, true);
      win.removeEventListener('onebyone:platform-gesture', pageGesture);
      root.removeEventListener('pointerdown', resetClick, true); root.removeEventListener('click', guardClick, true);
      heading.removeEventListener('pointerdown', dragStart); heading.removeEventListener('keydown', moveByKey);
      win.removeEventListener('pointermove', dragMove, true); win.removeEventListener('pointerup', dragEnd, true);
      win.removeEventListener('pointercancel', dragEnd, true); heading.removeEventListener('lostpointercapture', dragEnd);
      win.removeEventListener('resize', place); win.visualViewport?.removeEventListener('resize', place); win.visualViewport?.removeEventListener('scroll', place);
    },
  };
}
