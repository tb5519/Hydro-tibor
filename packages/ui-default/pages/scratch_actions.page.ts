import { NamedPage } from 'vj/misc/Page';

export default new NamedPage(['scratch_main', 'scratch_works', 'scratch_assignment', 'scratch_community', 'scratch_community_detail'], () => {
  const createDialog = document.querySelector<HTMLDialogElement>('[data-scratch-create-dialog]');
  const shareDialog = document.querySelector<HTMLDialogElement>('[data-scratch-share-dialog]');
  const createForm = document.querySelector<HTMLFormElement>('[data-scratch-create-form]');
  const shareText = document.querySelector<HTMLTextAreaElement>('[data-scratch-share-text]');
  const shareStatus = document.querySelector<HTMLElement>('[data-scratch-share-status]');
  const copyButton = document.querySelector<HTMLButtonElement>('[data-scratch-copy-share]');
  const revokeButton = document.querySelector<HTMLButtonElement>('[data-scratch-revoke-share]');
  const communityForm = document.querySelector<HTMLFormElement>('[data-scratch-community-form]');
  const instructions = document.querySelector<HTMLTextAreaElement>('[data-scratch-community-instructions]');
  const publishButton = document.querySelector<HTMLButtonElement>('[data-scratch-community-submit]');
  const communityStatus = document.querySelector<HTMLElement>('[data-scratch-community-status]');
  let trigger: HTMLElement | null = null;
  let shareEndpoint = '';
  let communityEndpoint = '';
  let request: AbortController | null = null;
  let sequence = 0;
  let stopped = false;
  let creating = false;
  let publishing = false;
  let pane = 'choice';

  const localUrl = (value: string) => {
    if (!value) throw new Error('分享地址无效，请刷新后重试。');
    const url = new URL(value, location.href);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('分享地址无效，请刷新后重试。');
    return url.href;
  };
  const setStatus = (element: HTMLElement | null, message: string, error = false) => {
    if (!element) return;
    element.textContent = message;
    element.dataset.error = String(error);
  };
  const status = (message: string, error = false) => setStatus(shareStatus, message, error);
  const alive = (id: number) => !stopped && id === sequence && shareDialog?.open;
  const requestShare = async (endpoint: string, fields: Record<string, string> | null = {}) => {
    request?.abort();
    const current = new AbortController();
    request = current;
    const timer = setTimeout(() => current.abort(), 30000);
    try {
      const response = await fetch(localUrl(endpoint), {
        method: fields === null ? 'GET' : 'POST', credentials: 'same-origin', signal: current.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        ...(fields === null ? {} : { body: new URLSearchParams(fields) }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        const detail = Array.isArray(result.error?.params) ? result.error.params.join(' ') : '';
        throw new Error(detail || result.error?.message || result.message || '暂时无法分享，请重试。');
      }
      return result;
    } finally {
      clearTimeout(timer);
      if (request === current) request = null;
    }
  };
  const showPane = (next: string) => {
    pane = next;
    shareDialog?.querySelectorAll<HTMLElement>('[data-scratch-share-pane]').forEach((element) => {
      element.hidden = element.dataset.scratchSharePane !== next;
    });
    const heading = shareDialog?.querySelector<HTMLElement>('[data-scratch-share-heading]');
    const description = shareDialog?.querySelector<HTMLElement>('[data-scratch-share-description]');
    if (heading) heading.textContent = ({ choice: '选一个分享方式', community: '分享到创作社区', external: '分享到站外', success: '创意已经登场' })[next];
    if (description) description.textContent = ({
      choice: '让更多人发现你的小创意。', community: '当前 Scratch 课堂的小伙伴可以看到和游玩。',
      external: '复制链接，发给家人和朋友。', success: '邀请课堂里的小伙伴来玩吧。',
    })[next];
  };
  const updateCount = () => {
    const counter = document.querySelector<HTMLElement>('[data-scratch-community-count]');
    if (counter) counter.textContent = `${instructions?.value.length || 0}`;
    instructions?.setCustomValidity('');
  };
  const openCommunity = async () => {
    const id = ++sequence;
    publishing = false;
    showPane('community');
    if (publishButton) { publishButton.disabled = true; publishButton.textContent = '发布到社区'; }
    if (instructions) { instructions.disabled = true; instructions.value = ''; }
    updateCount();
    const note = document.querySelector<HTMLElement>('[data-scratch-community-update-note]');
    if (note) note.hidden = true;
    setStatus(communityStatus, '正在读取已保存的作品…');
    try {
      const result = await requestShare(communityEndpoint, null);
      if (!alive(id)) return;
      if (typeof result.title !== 'string') throw new Error('无法读取作品，请返回后重试。');
      const title = document.querySelector<HTMLElement>('[data-scratch-community-title]');
      if (title) title.textContent = result.title;
      const preview = document.querySelector<HTMLImageElement>('[data-scratch-community-preview]');
      if (preview) {
        preview.hidden = !result.thumbnailUrl;
        const placeholder = document.querySelector<HTMLElement>('[data-scratch-community-preview-placeholder]');
        if (placeholder) placeholder.hidden = !!result.thumbnailUrl;
        if (result.thumbnailUrl) preview.src = localUrl(result.thumbnailUrl);
        else preview.removeAttribute('src');
        preview.alt = `${result.title} 的舞台截图`;
      }
      if (instructions) { instructions.disabled = false; instructions.value = result.publication?.instructions || ''; }
      updateCount();
      if (note) note.hidden = !result.publication;
      if (publishButton) {
        publishButton.disabled = false;
        publishButton.textContent = result.publication ? '更新社区作品' : '发布到社区';
      }
      setStatus(communityStatus, '');
      instructions?.focus();
    } catch (error) {
      if (!alive(id)) return;
      setStatus(communityStatus, ['AbortError', 'TypeError'].includes(error.name) ? '网络有点慢，请返回后重试。' : error.message, true);
    }
  };
  const openExternal = async () => {
    const id = ++sequence;
    showPane('external');
    if (shareText) shareText.value = '';
    if (copyButton) copyButton.disabled = true;
    if (revokeButton) revokeButton.hidden = true;
    status('正在准备分享链接…');
    try {
      const result = await requestShare(shareEndpoint);
      if (!alive(id)) return;
      if (typeof result.url !== 'string' || typeof result.title !== 'string') throw new Error('分享响应无效，请重试。');
      const url = localUrl(result.url);
      if (shareText) shareText.value = `我在 OneByOne 创作了《${result.title}》，快来看看吧！\n点击链接就能玩，无需登录：\n${url}`;
      if (copyButton) copyButton.disabled = false;
      if (revokeButton) { revokeButton.hidden = false; revokeButton.disabled = false; }
      status('链接准备好啦，复制后发给家人或朋友吧。');
    } catch (error) {
      if (!alive(id)) return;
      status(['AbortError', 'TypeError'].includes(error.name) ? '网络有点慢，请返回后重试。' : error.message, true);
    }
  };

  for (const dialog of [createDialog, shareDialog]) {
    if (!dialog) continue;
    dialog.querySelectorAll<HTMLElement>('[data-scratch-dialog-close]').forEach((button) => {
      button.addEventListener('click', () => dialog.close());
    });
    dialog.addEventListener('close', () => {
      if (dialog === shareDialog) { sequence += 1; request?.abort(); publishing = false; }
      trigger?.focus();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  const titleInput = createForm?.querySelector<HTMLInputElement>('input[name=title]');
  document.querySelectorAll<HTMLElement>('[data-scratch-create]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!createDialog || !createForm) return;
      trigger = button;
      creating = false;
      createForm.reset();
      titleInput?.setCustomValidity('');
      createForm.querySelectorAll<HTMLButtonElement>('button[type=submit]').forEach((submit) => { submit.disabled = false; });
      createDialog.showModal();
      titleInput?.focus();
    });
  });
  titleInput?.addEventListener('input', () => titleInput.setCustomValidity(''));
  createForm?.addEventListener('submit', (event) => {
    if (!titleInput) return;
    if (creating) { event.preventDefault(); return; }
    titleInput.value = titleInput.value.trim();
    if (!titleInput.value || titleInput.value.length > 120) {
      event.preventDefault();
      titleInput.setCustomValidity('给作品起一个 1～120 字的名字吧。');
      titleInput.reportValidity();
      return;
    }
    creating = true;
    createForm.querySelectorAll<HTMLButtonElement>('button[type=submit]').forEach((submit) => { submit.disabled = true; });
  });
  window.addEventListener('pageshow', () => {
    stopped = false;
    creating = false;
    createForm?.querySelectorAll<HTMLButtonElement>('button[type=submit]').forEach((submit) => { submit.disabled = false; });
  });

  document.querySelectorAll<HTMLElement>('[data-scratch-share]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!shareDialog) return;
      trigger = button;
      sequence += 1;
      request?.abort();
      shareEndpoint = button.dataset.scratchShare || '';
      communityEndpoint = button.dataset.communityUrl || '';
      publishing = false;
      if (shareText) shareText.value = '';
      if (copyButton) copyButton.disabled = true;
      if (revokeButton) revokeButton.hidden = true;
      status('');
      setStatus(communityStatus, '');
      showPane('choice');
      shareDialog.showModal();
      if (button.hasAttribute('data-community-direct')) openCommunity();
      else shareDialog.querySelector<HTMLButtonElement>('[data-scratch-share-destination="community"]')?.focus();
    });
  });
  document.querySelectorAll<HTMLElement>('[data-scratch-share-destination]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!shareDialog?.open || pane !== 'choice') return;
      if (button.dataset.scratchShareDestination === 'community') openCommunity();
      else openExternal();
    });
  });
  document.querySelectorAll<HTMLElement>('[data-scratch-share-back]').forEach((button) => {
    button.addEventListener('click', () => {
      sequence += 1;
      request?.abort();
      publishing = false;
      showPane('choice');
      shareDialog?.querySelector<HTMLButtonElement>('[data-scratch-share-destination="community"]')?.focus();
    });
  });
  instructions?.addEventListener('input', updateCount);
  communityForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (publishing || publishButton?.disabled || !instructions || pane !== 'community' || !shareDialog?.open) return;
    const value = instructions.value.trim();
    if (value.length > 300) {
      instructions.setCustomValidity('玩法说明最多写 300 字。');
      instructions.reportValidity();
      return;
    }
    const id = ++sequence;
    publishing = true;
    if (publishButton) publishButton.disabled = true;
    setStatus(communityStatus, '正在把创意送到社区…');
    try {
      const result = await requestShare(communityEndpoint, { instructions: value });
      if (!alive(id)) return;
      if (typeof result.url !== 'string') throw new Error('分享可能已完成，请到社区查看后再试。');
      const url = localUrl(result.url);
      const title = document.querySelector<HTMLElement>('[data-scratch-community-success-title]');
      const message = document.querySelector<HTMLElement>('[data-scratch-community-success-message]');
      const view = document.querySelector<HTMLAnchorElement>('[data-scratch-community-view]');
      if (title) title.textContent = result.updated ? '作品已更新！' : '分享成功！';
      if (message) message.textContent = result.updated ? '原来的作品卡片已经换成这次保存的版本，快邀请小伙伴体验吧。' : '小伙伴现在可以在创作社区发现你的作品啦。';
      if (view) view.href = url;
      showPane('success');
      view?.focus();
    } catch (error) {
      if (!alive(id)) return;
      setStatus(communityStatus, ['AbortError', 'TypeError'].includes(error.name) ? '网络有点慢，可以重试；同名作品不会重复出现。' : error.message, true);
    } finally {
      if (alive(id)) { publishing = false; if (publishButton) publishButton.disabled = false; }
    }
  });
  copyButton?.addEventListener('click', async () => {
    if (!shareText?.value) return;
    const id = sequence;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(shareText.value);
      if (alive(id)) status('已复制，去分享你的创意吧！');
    } catch {
      if (!alive(id)) return;
      shareText.focus();
      shareText.select();
      status('分享文字已选中，请按 Ctrl+C（Mac 按 ⌘C）复制。');
    }
  });
  revokeButton?.addEventListener('click', async () => {
    const id = ++sequence;
    revokeButton.disabled = true;
    if (copyButton) copyButton.disabled = true;
    status('正在关闭分享…');
    try {
      await requestShare(shareEndpoint, { operation: 'revoke' });
      if (!alive(id)) return;
      if (shareText) shareText.value = '';
      revokeButton.hidden = true;
      status('分享已关闭，以前发出的链接已失效。');
    } catch (error) {
      if (!alive(id)) return;
      revokeButton.disabled = false;
      if (copyButton) copyButton.disabled = !shareText?.value;
      status('暂时无法关闭分享，请重试。', true);
    }
  });
  window.addEventListener('pagehide', () => {
    stopped = true;
    sequence += 1;
    request?.abort();
    if (shareDialog?.open) shareDialog.close();
  });
});
