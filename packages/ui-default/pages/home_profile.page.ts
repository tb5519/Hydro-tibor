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
  const passwordForm = document.querySelector<HTMLFormElement>('[data-profile-password-form]');
  const passwordInputs = Array.from(passwordForm?.querySelectorAll<HTMLInputElement>('input[type=password]') || []);
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
  let passwordBusy = false;
  let passwordChanged = false;
  const dirty = () => bio.value !== savedBio || gender() !== savedGender || !!pendingAvatar;
  const passwordDirty = () => passwordInputs.some((input) => !!input.value);
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
    if (busy || preparing || passwordBusy || passwordChanged) return;
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
    if (leaving) return;
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    const actionLink = link?.matches('[name=nav_logout], [name=nav_switch_account]');
    if (!link || event.ctrlKey || event.metaKey || link.target === '_blank'
      || (!actionLink && (link.href.startsWith('javascript:') || link.getAttribute('href').startsWith('#')))) return;
    if (busy || preparing || passwordBusy) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (passwordChanged || (!dirty() && !passwordDirty())) return;
    event.preventDefault();
    event.stopPropagation();
    if (confirming) return;
    confirming = true;
    const action = await new ConfirmDialog({
      $body: tpl.typoMsg('还有未保存的修改，离开后这次修改不会保留。'),
      $action: '<button class="rounded button" data-action="no">继续编辑</button>'
        + '<button class="rounded primary button" data-action="yes">放弃修改并离开</button>',
      cancelByEsc: true,
      cancelByClickingBack: true,
    }).open();
    confirming = false;
    if (action !== 'yes') return;
    leaving = true;
    if (actionLink) link.click();
    else window.location.assign(link.href);
  }, true);
  window.addEventListener('beforeunload', (event) => {
    if (leaving || passwordChanged || (!dirty() && !passwordDirty() && !busy && !preparing && !passwordBusy)) return;
    event.preventDefault();
    event.returnValue = '';
  });
  if (passwordForm) {
    const passwordPanel = document.querySelector<HTMLDetailsElement>('[data-profile-password-panel]');
    const passwordSave = passwordForm.querySelector<HTMLButtonElement>('[data-profile-password-save]');
    const passwordCancel = passwordForm.querySelector<HTMLButtonElement>('[data-profile-password-cancel]');
    const passwordFeedback = passwordForm.querySelector<HTMLElement>('[data-profile-password-feedback]');
    const passwordStatus = passwordForm.querySelector<HTMLElement>('[data-profile-password-status]');
    const passwordVerify = passwordForm.querySelector<HTMLAnchorElement>('[data-profile-password-verify]');
    const passwordLogin = passwordForm.querySelector<HTMLAnchorElement>('[data-profile-password-login]');
    const securityUrl = passwordForm.dataset.securityUrl;
    const passwordMessage = (message: string, type = '') => {
      passwordFeedback.hidden = false;
      passwordStatus.textContent = message;
      passwordStatus.className = `profile-editor__status ${type ? `is-${type}` : ''}`;
    };
    const needsVerification = (response: any) => typeof response?.url === 'string'
      && new URL(response.url, window.location.href).pathname.endsWith('/user/sudo');
    const showVerification = () => {
      passwordVerify.hidden = false;
      passwordMessage('请先验证身份。验证会在新窗口打开，完成后回到这里，再点击“更新密码”；已填写的内容会保留。');
    };
    passwordCancel.addEventListener('click', () => {
      if (passwordBusy) return;
      passwordForm.reset();
      passwordFeedback.hidden = true;
      passwordVerify.hidden = true;
      passwordPanel.open = false;
    });
    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || preparing || passwordBusy || passwordChanged) return;
      passwordVerify.hidden = true;
      passwordLogin.hidden = true;
      if (dirty()) {
        passwordMessage('上方还有未保存的资料，请先保存资料，再修改密码。', 'error');
        return;
      }
      const [current, password, verifyPassword] = passwordInputs.map((input) => input.value);
      if (!current || password.length < 6 || password.length > 255) {
        passwordMessage('请填写当前密码，并设置至少 6 个字符的新密码。', 'error');
        return;
      }
      if (password !== verifyPassword) {
        passwordMessage('两次输入的新密码不一致，请再检查一下。', 'error');
        passwordInputs[2].focus();
        return;
      }
      passwordBusy = true;
      lock(true);
      passwordForm.setAttribute('aria-busy', 'true');
      passwordInputs.forEach((input) => { input.disabled = true; });
      passwordSave.disabled = passwordCancel.disabled = true;
      passwordSave.textContent = '正在更新…';
      passwordMessage('正在确认身份并更新密码…');
      try {
        // Only a GET is saved as the pending sudo action. Never stage passwords
        // for automatic replay while the user is completing identity checks.
        const access = await request.get(securityUrl);
        if (needsVerification(access)) {
          showVerification();
          return;
        }
        if (access?.url) {
          passwordMessage('登录状态已失效，请重新登录后再修改密码。', 'error');
          passwordLogin.hidden = false;
          return;
        }
        const result = await request.post(passwordForm.action, { current, password, verifyPassword });
        if (result?.verificationRequired === true) {
          // The endpoint rechecks the same authorization window atomically at
          // entry and does not stage a sensitive POST if the window has expired.
          showVerification();
          return;
        }
        if (result?.passwordChanged !== true) throw new Error('未收到修改结果，请重新登录后确认。');
        passwordForm.reset();
        passwordChanged = true;
        passwordSave.hidden = passwordCancel.hidden = true;
        passwordLogin.hidden = false;
        passwordMessage('密码已修改，所有设备已退出登录。请使用新密码重新登录。', 'success');
      } catch (error) {
        passwordMessage(error.message || '修改失败，已填写的内容仍然保留，请重试。', 'error');
      } finally {
        passwordBusy = false;
        passwordForm.setAttribute('aria-busy', 'false');
        lock(passwordChanged);
        passwordInputs.forEach((input) => { input.disabled = passwordChanged; });
        passwordSave.disabled = passwordCancel.disabled = passwordChanged;
        passwordSave.textContent = '更新密码';
      }
    });
  }
  update();
});
