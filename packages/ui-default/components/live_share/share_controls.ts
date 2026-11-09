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
  const mode = make('span', 'teacher-share-controls__mode');
  const name = make('strong', 'teacher-share-controls__name live-share-controls__name');
  const choose = make('button', 'teacher-share-controls__choose') as HTMLButtonElement;
  choose.type = 'button'; choose.title = '切换学员'; choose.setAttribute('aria-label', '切换学员');
  choose.append(icon('m7 8 3 3 3-3'));
  heading.append(mode, choose);
  const status = make('span', 'teacher-share-controls__status'); status.dataset.shareStatus = '';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const switchButton = make('button', 'teacher-share-controls__switch') as HTMLButtonElement;
  switchButton.type = 'button'; switchButton.dataset.shareSwitchMode = '';
  const switchText = make('span', '');
  switchButton.append(icon('M3 6h13m-3-3 3 3-3 3M17 14H4m3-3-3 3 3 3'), switchText);
  const end = make('button', 'teacher-share-controls__end') as HTMLButtonElement;
  end.type = 'button'; end.dataset.shareEnd = '';
  end.append(icon('M10 2v7M5 4.5a7 7 0 1 0 10 0'), make('span', '', '结束连接'));
  const picker = make('div', 'teacher-share-controls__picker'); picker.hidden = true;
  picker.setAttribute('role', 'group'); picker.setAttribute('aria-label', '选择要查看的学员');
  const pickerHeading = make('div', 'teacher-share-controls__picker-heading', '查看谁的画面');
  const list = make('div', 'teacher-share-controls__students'); picker.append(pickerHeading, list);
  root.append(heading, name, status, switchButton, end, picker); doc.body.append(root);
  let state: TeacherShareControlState | null = null;
  let disposed = false;
  let pickerOpen = false;
  let pickerKey = '';
  const closePicker = (restoreFocus = false) => {
    pickerOpen = false; picker.hidden = true;
    switchButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !root.hidden) switchButton.focus({ preventScroll: true });
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
  win.addEventListener('onebyone:platform-gesture', pageGesture);
  win.addEventListener('resize', placePicker); win.visualViewport?.addEventListener('resize', placePicker);
  return {
    update(next: TeacherShareControlState | null) {
      if (disposed) return;
      const changedMode = state?.mode !== next?.mode;
      state = next ? { ...next, students: next.students?.map((student) => ({ ...student })) } : null;
      root.hidden = !state;
      if (!state) { closePicker(); return; }
      root.dataset.mode = state.mode; root.classList.toggle('is-busy', !!state.busy);
      root.setAttribute('aria-busy', String(!!state.busy));
      mode.textContent = state.mode === 'assist' ? '正在协助' : '正在分享';
      name.textContent = state.label || state.studentName || (state.mode === 'broadcast' ? '我的画面' : '学员');
      name.title = name.textContent;
      const nextStatus = state.status || (state.busy ? '正在切换…' : '');
      if (status.textContent !== nextStatus) status.textContent = nextStatus;
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
      if (changedMode || state.busy || switchButton.disabled || students.length <= 1) closePicker();
      else if (pickerOpen) { renderPicker(); placePicker(); }
    },
    dispose() {
      if (disposed) return;
      disposed = true; state = null; root.remove();
      doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', escape, true);
      win.removeEventListener('onebyone:platform-gesture', pageGesture);
      win.removeEventListener('resize', placePicker); win.visualViewport?.removeEventListener('resize', placePicker);
    },
  };
}
