import { NamedPage } from 'vj/misc/Page';

// Character interactions adapted from arsh342/careercompass (MIT), commit
// fade6f4a83ebc8ca3790ae56d06f1fcd9a43b1f1, animated-characters.tsx.
// Copyright (c) 2025 arsh342. See third-party-notices/careercompass.txt.
export default new NamedPage('user_login', () => {
  const scene = document.querySelector('[data-login-scene]');
  const form = document.querySelector('.one-login__form');
  const username = form?.querySelector('input[name="uname"]');
  const password = form?.querySelector('input[name="password"]');
  const toggle = form?.querySelector('[data-password-toggle]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const characters = scene ? [...scene.querySelectorAll('[data-character]')].map((element) => ({
    element,
    name: element.dataset.character,
    eyes: [...element.querySelectorAll('[data-eye]')].map((eye) => ({
      element: eye,
      range: Math.min(8, Math.max(1, Number(eye.dataset.eyeRange) || (element.dataset.character === 'navy' ? 4 : 5))),
    })),
  })) : [];
  const timers = new Map();
  let pageActive = true;
  let sceneVisible = false;
  let motionEnabled = false;
  let frame = null;
  let pointer = null;
  let state = 'idle';
  let glancing = false;
  let peeking = false;

  const clearTimer = (name) => {
    if (!timers.has(name)) return;
    clearTimeout(timers.get(name));
    timers.delete(name);
  };
  const later = (name, callback, delay) => {
    clearTimer(name);
    timers.set(name, setTimeout(() => {
      timers.delete(name);
      if (motionEnabled) callback();
    }, delay));
  };
  const setFlag = (name, value) => { if (scene) scene.dataset[name] = String(value); };
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  const px = (value) => `${Math.round(value * 100) / 100}px`;

  const render = () => {
    frame = null;
    if (!scene || !pageActive) return;
    const lookingAway = state === 'password-visible';
    // Read geometry before writing styles, once per requested frame.
    const geometry = characters.map((character) => ({
      ...character,
      bounds: character.element.getBoundingClientRect(),
      eyes: character.eyes.map((eye) => ({ ...eye, bounds: eye.element.getBoundingClientRect() })),
    }));
    for (const character of geometry) {
      const { element, name, bounds } = character;
      let faceX = 0;
      let faceY = 0;
      let skew = 0;
      if (pointer && motionEnabled && !lookingAway) {
        const dx = pointer.x - (bounds.left + bounds.width / 2);
        const dy = pointer.y - (bounds.top + bounds.height / 3);
        faceX = clamp(dx / 20, 15);
        faceY = clamp(dy / 30, 10);
        skew = clamp(-dx / 120, 6);
      }
      if (lookingAway) {
        [faceX, faceY] = { blue: [-25, -5], navy: [-16, -4], peach: [-32, -5], yellow: [-32, -5] }[name] || [0, 0];
      } else if (glancing && name === 'blue') {
        [faceX, faceY] = [10, 25];
      } else if (glancing && name === 'navy') {
        [faceX, faceY] = [6, -20];
      }
      element.style.setProperty('--face-x', px(faceX));
      element.style.setProperty('--face-y', px(faceY));
      element.style.setProperty('--body-skew', `${Math.round(skew * 100) / 100}deg`);
      for (const eye of character.eyes) {
        let x = 0;
        let y = 0;
        if (lookingAway) {
          [x, y] = name === 'blue' && peeking ? [4, 5] : [name === 'peach' || name === 'yellow' ? -5 : -4, -4];
        } else if (glancing && name === 'blue') {
          [x, y] = [3, 4];
        } else if (glancing && name === 'navy') {
          [x, y] = [0, -4];
        } else if (pointer && motionEnabled) {
          const dx = pointer.x - (eye.bounds.left + eye.bounds.width / 2);
          const dy = pointer.y - (eye.bounds.top + eye.bounds.height / 2);
          const distance = Math.hypot(dx, dy);
          const scale = distance ? Math.min(distance, eye.range) / distance : 0;
          x = dx * scale;
          y = dy * scale;
        }
        eye.element.style.setProperty('--pupil-x', px(x));
        eye.element.style.setProperty('--pupil-y', px(y));
      }
    }
  };
  const requestRender = () => {
    if (!scene || !sceneVisible || !pageActive || document.hidden || frame !== null) return;
    frame = requestAnimationFrame(render);
  };
  const handleMouseMove = (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    requestRender();
  };
  const scheduleBlink = (character) => {
    if (!motionEnabled || !['blue', 'navy'].includes(character.name)) return;
    const name = `${character.name}-blink`;
    if (timers.has(name) || timers.has(`${name}-open`)) return;
    later(name, () => {
      character.element.dataset.blink = 'true';
      later(`${name}-open`, () => {
        character.element.dataset.blink = 'false';
        scheduleBlink(character);
      }, 150);
    }, 3000 + Math.random() * 4000);
  };
  const schedulePeek = () => {
    if (!motionEnabled || state !== 'password-visible' || timers.has('peek') || timers.has('peek-end')) return;
    later('peek', () => {
      peeking = true;
      setFlag('loginPeek', true);
      requestRender();
      later('peek-end', () => {
        peeking = false;
        setFlag('loginPeek', false);
        requestRender();
        schedulePeek();
      }, 800);
    }, 2000 + Math.random() * 3000);
  };
  const stopGlance = () => {
    clearTimer('glance');
    glancing = false;
    setFlag('loginGlance', false);
  };
  const syncState = () => {
    // Only a boolean is retained. Password text never leaves the input or
    // enters animation state, attributes, storage, logs, or a network request.
    const hasPassword = Boolean(password && password.value.length > 0);
    const revealed = password?.type === 'text';
    state = hasPassword && revealed ? 'password-visible'
      : document.activeElement === username ? 'typing' : hasPassword ? 'password-hidden' : 'idle';
    if (scene) scene.dataset.loginState = state;
    if (state !== 'typing') stopGlance();
    if (state !== 'password-visible') {
      clearTimer('peek');
      clearTimer('peek-end');
      peeking = false;
      setFlag('loginPeek', false);
    }
    if (toggle && password) {
      toggle.hidden = false;
      const label = revealed ? '隐藏密码' : '显示密码';
      toggle.setAttribute('aria-pressed', String(revealed));
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
      toggle.querySelectorAll('[data-eye-open]').forEach((icon) => { icon.toggleAttribute('hidden', revealed); });
      toggle.querySelectorAll('[data-eye-closed]').forEach((icon) => { icon.toggleAttribute('hidden', !revealed); });
    }
    schedulePeek();
    requestRender();
  };
  const clearMotion = () => {
    for (const name of [...timers.keys()]) clearTimer(name);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    pointer = null;
    glancing = false;
    peeking = false;
    setFlag('loginGlance', false);
    setFlag('loginPeek', false);
    characters.forEach(({ element }) => { element.dataset.blink = 'false'; });
  };
  const updateAvailability = () => {
    const bounds = scene?.getBoundingClientRect();
    sceneVisible = Boolean(bounds?.width && bounds?.height);
    const enabled = Boolean(pageActive && sceneVisible && !document.hidden && !reducedMotion.matches);
    if (enabled !== motionEnabled) {
      motionEnabled = enabled;
      window[enabled ? 'addEventListener' : 'removeEventListener']('mousemove', handleMouseMove);
    }
    setFlag('loginMotion', enabled ? 'on' : 'off');
    if (!enabled) clearMotion();
    if (enabled) characters.forEach(scheduleBlink);
    syncState();
  };
  const startGlance = () => {
    syncState();
    if (!motionEnabled || state !== 'typing') return;
    glancing = true;
    setFlag('loginGlance', true);
    later('glance', () => { stopGlance(); requestRender(); }, 800);
    requestRender();
  };

  username?.addEventListener('focus', startGlance);
  username?.addEventListener('blur', () => { stopGlance(); syncState(); });
  for (const input of [username, password]) {
    input?.addEventListener('input', syncState);
    input?.addEventListener('change', syncState);
  }
  password?.addEventListener('focus', syncState);
  toggle?.addEventListener('click', (event) => {
    event.preventDefault();
    if (!password) return;
    password.type = password.type === 'password' ? 'text' : 'password';
    syncState();
  });
  window.addEventListener('resize', updateAvailability);
  document.addEventListener('visibilitychange', updateAvailability);
  reducedMotion.addEventListener('change', updateAvailability);
  window.addEventListener('pagehide', () => { pageActive = false; updateAvailability(); });
  window.addEventListener('pageshow', () => { pageActive = true; updateAvailability(); });
  updateAvailability();
  if (document.activeElement === username) startGlance();
});
