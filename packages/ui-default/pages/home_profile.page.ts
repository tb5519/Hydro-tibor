import { ConfirmDialog } from 'vj/components/dialog';
import { NamedPage } from 'vj/misc/Page';
import { request, tpl } from 'vj/utils';
import { prepareDomainAvatar as prepareProfileAvatar } from 'vj/utils/domain_avatar';

export default new NamedPage('home_profile', () => {
  const form = document.querySelector<HTMLFormElement>('[data-profile-editor]');
  if (!form) return;
  const image = form.querySelector<HTMLImageElement>('[data-profile-avatar]');
  const fileInput = form.querySelector<HTMLInputElement>('[data-profile-file]');
  const upload = form.querySelector<HTMLButtonElement>('[data-profile-upload]');
  const undo = form.querySelector<HTMLButtonElement>('[data-profile-avatar-undo]');
  const avatarStatus = form.querySelector<HTMLElement>('[data-profile-avatar-status]');
  const status = form.querySelector<HTMLElement>('[data-profile-status]');
  const save = form.querySelector<HTMLButtonElement>('[data-profile-save]');
  const bio = form.querySelector<HTMLTextAreaElement>('[name=bio]');
  const count = form.querySelector<HTMLElement>('[data-profile-count]');
  const gender = () => form.querySelector<HTMLInputElement>('[name=gender]:checked').value;
  let savedBio = bio.value;
  let savedGender = gender();
  let savedAvatar = image.src;
  let pendingAvatar: Blob | null = null;
  let previewUrl = '';
  let busy = false;
  let preparing = false;
  let confirming = false;
  let leaving = false;
  const dirty = () => bio.value !== savedBio || gender() !== savedGender || !!pendingAvatar;
  const showStatus = (message: string, type = '') => {
    status.textContent = message;
    status.className = `profile-editor__status ${type ? `is-${type}` : ''}`;
  };
  const update = () => {
    count.textContent = `${bio.value.length.toLocaleString()} / 10,000`;
    if (!busy && !preparing) showStatus(dirty() ? '有修改尚未保存。' : '修改后记得保存。');
  };
  const lock = (value: boolean) => {
    for (const control of Array.from(form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>('input, button, textarea'))) {
      control.disabled = value;
    }
    form.setAttribute('aria-busy', String(value));
  };
  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  };
  upload.addEventListener('click', () => fileInput.click());
  undo.addEventListener('click', () => {
    clearPreview();
    pendingAvatar = null;
    image.src = savedAvatar;
    undo.hidden = true;
    avatarStatus.textContent = '';
    update();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file || busy || preparing) return;
    preparing = true;
    lock(true);
    avatarStatus.classList.remove('is-error');
    avatarStatus.textContent = '正在准备头像…';
    try {
      const prepared = await prepareProfileAvatar(file);
      clearPreview();
      pendingAvatar = prepared;
      previewUrl = URL.createObjectURL(prepared);
      image.src = previewUrl;
      undo.hidden = false;
      avatarStatus.textContent = '新头像已就绪，保存资料后生效。';
    } catch (error) {
      avatarStatus.classList.add('is-error');
      avatarStatus.textContent = error.message || '图片无法读取，请换一张重试。';
    } finally {
      fileInput.value = '';
      preparing = false;
      lock(false);
      update();
    }
  });
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || preparing) return;
    const submittedBio = bio.value;
    const submittedGender = gender();
    const data = new FormData();
    data.append('bio', submittedBio);
    data.append('gender', submittedGender);
    if (pendingAvatar) data.append('file', pendingAvatar, 'avatar.png');
    busy = true;
    lock(true);
    save.textContent = '正在保存…';
    showStatus('正在保存你的资料…');
    try {
      const result = await request.postFile(form.action, data, { dataType: 'json' });
      if (result?.saved !== true || typeof result.avatarUrl !== 'string') throw new Error('未收到保存结果，请重试。');
      savedBio = submittedBio;
      savedGender = submittedGender;
      savedAvatar = result.avatarUrl;
      image.src = savedAvatar;
      pendingAvatar = null;
      clearPreview();
      undo.hidden = true;
      avatarStatus.textContent = '';
      showStatus('资料已保存，回到主页就能看到啦。', 'success');
      form.querySelector<HTMLAnchorElement>('[data-profile-cancel]').textContent = '返回主页';
    } catch (error) {
      showStatus(error.message || '保存失败，你的修改仍然保留，请重试。', 'error');
    } finally {
      busy = false;
      lock(false);
      save.textContent = '保存资料';
    }
  });
  document.addEventListener('click', async (event) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if (!link || event.ctrlKey || event.metaKey || link.target === '_blank'
      || link.href.startsWith('javascript:') || link.getAttribute('href').startsWith('#')) return;
    if (busy || preparing) {
      event.preventDefault();
      return;
    }
    if (!dirty()) return;
    event.preventDefault();
    if (confirming) return;
    confirming = true;
    const action = await new ConfirmDialog({
      $body: tpl.typoMsg('资料还没有保存，离开后这次修改不会保留。'),
      $action: '<button class="rounded button" data-action="no">继续编辑</button>'
        + '<button class="rounded primary button" data-action="yes">放弃修改并离开</button>',
      cancelByEsc: true,
      cancelByClickingBack: true,
    }).open();
    confirming = false;
    if (action !== 'yes') return;
    leaving = true;
    window.location.assign(link.href);
  });
  window.addEventListener('beforeunload', (event) => {
    if (leaving || (!dirty() && !busy && !preparing)) return;
    event.preventDefault();
    event.returnValue = '';
  });
  update();
});
