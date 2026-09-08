interface HonorStudent {
  uid: number;
  displayName: string;
  avatar?: string;
  href: string;
}

interface HonorBadge {
  id: number;
  name: string;
  acImage?: string;
  badgeHref: string;
  backgroundColor?: string;
  fontColor?: string;
  students: HonorStudent[];
}

const initialized = new WeakMap<HTMLElement, () => void>();

function safeUrl(value: unknown, sameOrigin = false) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (sameOrigin && url.origin !== window.location.origin) return '';
    return url.href;
  } catch {
    return '';
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function studentChip(student: HonorStudent) {
  const href = safeUrl(student.href, true);
  const chip = element(href ? 'a' : 'span', 'honor-wall__student');
  if (chip instanceof HTMLAnchorElement) chip.href = href;
  chip.dataset.honorWallStudent = String(student.uid);
  const name = String(student.displayName || `学员 ${student.uid}`);
  chip.title = name;
  chip.setAttribute('aria-label', name);
  const avatar = element('span', 'honor-wall__avatar', Array.from(name)[0] || '★');
  avatar.setAttribute('aria-hidden', 'true');
  const avatarUrl = safeUrl(student.avatar);
  if (avatarUrl) {
    const img = element('img', 'honor-wall__avatar-image');
    img.src = avatarUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true });
    avatar.append(img);
  }
  chip.append(avatar, element('span', 'honor-wall__student-name', name));
  return chip;
}

function badgeCard(badge: HonorBadge, students: HonorStudent[], order: number) {
  const card = element('article', 'honor-wall__card');
  card.dataset.honorWallBadge = String(badge.id);
  card.style.setProperty('--honor-light', ['#e7c480', '#b7a8e8'][order] || '#95bafa');
  const badgeName = String(badge.name || '荣誉徽章');
  const href = safeUrl(badge.badgeHref, true);
  const art = element(href ? 'a' : 'div', 'honor-wall__art');
  art.title = badgeName;
  if (art instanceof HTMLAnchorElement) {
    art.href = href;
    art.setAttribute('aria-label', `查看${badgeName}徽章`);
  }
  const fallback = element('span', 'honor-wall__art-fallback', '✦');
  fallback.setAttribute('aria-hidden', 'true');
  art.append(fallback);
  const imageUrl = safeUrl(badge.acImage);
  if (imageUrl) {
    const img = element('img', 'honor-wall__ac-image');
    img.src = imageUrl;
    img.alt = `${badgeName} AC 徽章展示图`;
    img.loading = 'lazy';
    img.decoding = 'async';
    fallback.hidden = true;
    img.addEventListener('error', () => {
      img.remove();
      fallback.hidden = false;
    }, { once: true });
    art.append(img);
  }
  const constellation = element('div', 'honor-wall__constellation');
  const holders = element('div', 'honor-wall__orbit');
  holders.classList.toggle('honor-wall__orbit--single', students.length === 1);
  holders.setAttribute('aria-label', `${badgeName}的荣誉获得者`);
  // Keep everyone in the DOM. Separate large groups vertically instead of
  // hiding students behind pagination or continually replacing focused links.
  const rows = Math.ceil(students.length / 8);
  constellation.style.setProperty('--orbit-rows', String(rows));
  students.forEach((student, index) => {
    const row = Math.floor(index * rows / students.length);
    const rowStart = Math.ceil(row * students.length / rows);
    const rowSize = Math.ceil((row + 1) * students.length / rows) - rowStart;
    const slot = element('div', 'honor-wall__orbit-slot');
    slot.style.setProperty('--orbit-angle', `${(index - rowStart) * 360 / rowSize + row * 27}deg`);
    slot.style.setProperty('--orbit-y', `${(row - (rows - 1) / 2) * 3}rem`);
    const person = element('div', 'honor-wall__orbit-person');
    person.append(studentChip(student));
    slot.append(person);
    holders.append(slot);
  });
  constellation.append(art, holders);
  card.append(constellation);
  return card;
}

function initHonorMarquee(viewport: HTMLElement, track: HTMLElement, motionPaused: () => boolean) {
  const looping = track.children.length > 6;
  viewport.classList.toggle('is-looping', looping);
  if (!looping) return () => {};
  let disposed = false;
  let hovered = false;
  let focused = false;
  let stride = 0;
  let offset = 0;
  let previousTime: number | undefined;
  let frame: number;
  const position = () => { track.style.transform = `translate3d(${-offset}px, 0, 0)`; };
  const measure = () => {
    if (disposed) return;
    const width = track.firstElementChild?.getBoundingClientRect().width || 0;
    offset = stride ? offset * width / stride : 0;
    stride = width;
    position();
  };
  const onEnter = () => { hovered = true; };
  const onLeave = () => { hovered = false; };
  const onFocus = (event: FocusEvent) => {
    focused = true;
    offset = 0;
    position();
    // Keep DOM order fixed during keyboard navigation so Tab can leave the
    // wall normally. The scrollable viewport reveals off-screen recipients.
    (event.target as HTMLElement)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  const onBlur = (event: FocusEvent) => {
    focused = !!event.relatedTarget && viewport.contains(event.relatedTarget as Node);
  };
  const tick = (time: number) => {
    if (disposed) return;
    if (motionPaused() && offset) {
      const scroll = viewport.scrollLeft + offset;
      offset = 0;
      position();
      viewport.scrollLeft = scroll;
    }
    if (!motionPaused() && !hovered && !focused && !document.hidden && stride > 0 && track.isConnected) {
      // Eight pixels per second: roughly 20–25 seconds per badge on desktop.
      // Cap a resumed/background frame to avoid a sudden jump after a stall.
      offset += viewport.scrollLeft + (previousTime === undefined ? 0 : Math.min(time - previousTime, 100) * 0.008);
      viewport.scrollLeft = 0;
      while (offset >= stride) {
        offset -= stride;
        track.append(track.firstElementChild!);
      }
      position();
    }
    previousTime = time;
    frame = requestAnimationFrame(tick);
  };
  viewport.addEventListener('mouseenter', onEnter);
  viewport.addEventListener('mouseleave', onLeave);
  viewport.addEventListener('focusin', onFocus);
  viewport.addEventListener('focusout', onBlur);
  const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
  if (resizeObserver) resizeObserver.observe(viewport);
  else window.addEventListener('resize', measure);
  measure();
  frame = requestAnimationFrame(tick);
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    window.removeEventListener('resize', measure);
    viewport.removeEventListener('mouseenter', onEnter);
    viewport.removeEventListener('mouseleave', onLeave);
    viewport.removeEventListener('focusin', onFocus);
    viewport.removeEventListener('focusout', onBlur);
    viewport.classList.remove('is-looping');
    track.style.removeProperty('transform');
  };
}

export function initHonorWall(wall: HTMLElement): () => void {
  if (initialized.has(wall)) return initialized.get(wall)!;
  const grid = wall.querySelector<HTMLElement>('[data-honor-wall-grid]');
  const status = wall.querySelector<HTMLElement>('[data-honor-wall-status]');
  const count = wall.querySelector<HTMLElement>('[data-honor-wall-count]');
  const retry = wall.querySelector<HTMLButtonElement>('[data-honor-wall-retry]');
  const motionButton = wall.querySelector<HTMLButtonElement>('[data-honor-wall-motion]');
  if (!grid || !status || !count || !retry) return () => {};
  let loading = false;
  let disposed = false;
  let controller: AbortController | undefined;
  let observer: IntersectionObserver | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopMarquee = () => {};
  let paused = false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const motionPaused = () => paused || !!reducedMotion?.matches;
  const syncMotion = () => {
    wall.classList.toggle('is-motion-paused', motionPaused());
    if (!motionButton) return;
    motionButton.setAttribute('aria-pressed', String(motionPaused()));
    motionButton.textContent = reducedMotion?.matches ? '动画已暂停' : paused ? '继续动画' : '暂停动画';
    motionButton.disabled = !!reducedMotion?.matches;
  };
  const toggleMotion = () => {
    paused = !paused;
    syncMotion();
  };
  motionButton?.addEventListener('click', toggleMotion);
  reducedMotion?.addEventListener?.('change', syncMotion);
  syncMotion();

  async function load() {
    if (loading || disposed) return;
    loading = true;
    wall.setAttribute('aria-busy', 'true');
    retry!.hidden = true;
    status!.hidden = false;
    status!.textContent = '正在点亮荣誉星光…';
    controller = new AbortController();
    timeout = setTimeout(() => controller?.abort(), 15000);
    try {
      const url = safeUrl(wall.dataset.honorWallUrl, true);
      if (!url) throw new Error('Invalid honor wall URL');
      const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal });
      if (disposed || !wall.isConnected) return;
      if (response.status === 401 || response.status === 403) {
        stopMarquee();
        grid!.replaceChildren();
        wall.hidden = true;
        return;
      }
      if (!response.ok) throw new Error('Honor wall unavailable');
      const data = await response.json();
      if (disposed || !wall.isConnected) return;
      if (!Array.isArray(data.badges)) throw new Error('Invalid honor wall data');
      const fragment = document.createDocumentFragment();
      const seenBadges = new Set<number>();
      data.badges.forEach((badge: HonorBadge) => {
        if (!badge || !Number.isSafeInteger(badge.id) || badge.id <= 0 || seenBadges.has(badge.id)) return;
        const seenStudents = new Set<number>();
        const students = (Array.isArray(badge.students) ? badge.students : []).filter((student) => {
          if (!student || !Number.isSafeInteger(student.uid) || student.uid <= 0 || seenStudents.has(student.uid)) return false;
          seenStudents.add(student.uid);
          return true;
        });
        if (!students.length) return;
        seenBadges.add(badge.id);
        fragment.append(badgeCard(badge, students, seenBadges.size - 1));
      });
      stopMarquee();
      grid!.replaceChildren(fragment);
      const viewport = wall.querySelector<HTMLElement>('[data-honor-wall-viewport]');
      stopMarquee = viewport ? initHonorMarquee(viewport, grid!, motionPaused) : () => {};
      count!.textContent = `${seenBadges.size} 枚荣誉已点亮`;
      count!.hidden = !seenBadges.size;
      if (motionButton) motionButton.hidden = !seenBadges.size;
      status!.textContent = '还没有徽章被点亮，期待第一位荣誉获得者。';
      status!.hidden = !!seenBadges.size;
    } catch {
      if (disposed || !wall.isConnected) return;
      status!.textContent = '荣誉墙暂时未能加载，请稍后重试。';
      retry!.hidden = false;
    } finally {
      clearTimeout(timeout);
      loading = false;
      if (!disposed && wall.isConnected) wall.setAttribute('aria-busy', 'false');
    }
  }

  const onRetry = () => { void load(); };
  retry.addEventListener('click', onRetry);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timeout);
    controller?.abort();
    observer?.disconnect();
    stopMarquee();
    motionButton?.removeEventListener('click', toggleMotion);
    reducedMotion?.removeEventListener?.('change', syncMotion);
    retry.removeEventListener('click', onRetry);
    initialized.delete(wall);
  };
  initialized.set(wall, dispose);
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer?.disconnect();
      void load();
    }, { rootMargin: '240px' });
    observer.observe(wall);
  } else void load();
  return dispose;
}
