import { NamedPage } from 'vj/misc/Page';
import { attachMarkdownImagePaste } from '../common/markdown-image-paste';

export default new NamedPage(['scratch_problem_project_create', 'scratch_problem_edit', 'scratch_problem_paper_edit'], () => {
  const form = document.querySelector<HTMLFormElement>('[data-scratch-problem-form]');
  if (!form) return;
  const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
  const status = form.querySelector<HTMLElement>('[data-scratch-description-image-status]');
  if (textarea && status && form.dataset.imagePasteBound !== 'true') {
    form.dataset.imagePasteBound = 'true';
    attachMarkdownImagePaste(textarea, status);
  }
  const errorStatus = form.querySelector<HTMLElement>('[data-scratch-problem-error]');
  if (!errorStatus || form.dataset.problemSaveBound === 'true') return;
  form.dataset.problemSaveBound = 'true';
  let saving = false;
  let stopped = false;
  let revision = 0;
  let current: AbortController | null = null;
  const errorText = (result: any) => {
    const detail = Array.isArray(result?.error?.params) ? result.error.params.filter((value: unknown) => typeof value === 'string').join(' ') : '';
    return detail || result?.error?.message || result?.message || '保存暂时未完成，请稍后重试。';
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || stopped || !form.reportValidity()) return;
    const codeInput = form.querySelector<HTMLInputElement>('input[name="problemCode"]');
    const problemCode = codeInput?.value.trim().toUpperCase() || '';
    if (problemCode && (problemCode.length > 32 || !/^(?:[1-9][0-9]*|[A-Z][A-Z0-9_-]*)$/.test(problemCode))) {
      errorStatus.textContent = '题目 ID 最多 32 个字符，可使用正整数，或字母开头的字母、数字、短横线和下划线组合。';
      errorStatus.hidden = false; codeInput?.focus(); return;
    }
    const endpoint = new URL(form.action || location.href, location.href);
    if (endpoint.origin !== location.origin || !['http:', 'https:'].includes(endpoint.protocol)) return;
    const body = new FormData(form);
    if (codeInput) body.set('problemCode', problemCode);
    saving = true;
    errorStatus.hidden = true;
    form.setAttribute('aria-busy', 'true');
    const buttons = [...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')];
    for (const button of buttons) button.disabled = true;
    const controller = new AbortController(); current = controller;
    const version = ++revision;
    const alive = () => !stopped && version === revision;
    const timer = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(endpoint.href, {
        method: 'POST', credentials: 'same-origin', signal: controller.signal, redirect: 'error',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body,
      });
      let result: any;
      try { result = await response.json(); }
      catch { throw new Error('保存结果暂时无法确认，请重试。'); }
      if (!response.ok || result?.error) throw new Error(errorText(result));
      const destination = new URL(result?.url || '', location.href);
      if (typeof result?.url !== 'string' || !result.url || destination.origin !== location.origin
        || !['http:', 'https:'].includes(destination.protocol)) throw new Error('保存结果暂时无法确认，请重试。');
      if (alive()) window.location.assign(destination.href);
    } catch (error: any) {
      if (alive()) {
        errorStatus.textContent = `${['AbortError', 'TypeError'].includes(error?.name) ? '网络不稳定，请重试。' : error?.message || '保存暂时未完成，请重试。'} 已填写的内容和文件已保留。`;
        errorStatus.hidden = false;
        errorStatus.focus();
      }
    } finally {
      window.clearTimeout(timer);
      if (current === controller) current = null;
      if (alive()) {
        saving = false;
        form.removeAttribute('aria-busy');
        for (const button of buttons) button.disabled = false;
      }
    }
  });
  window.addEventListener('pagehide', () => { stopped = true; revision++; current?.abort(); });
  window.addEventListener('pageshow', () => {
    stopped = false; saving = false; form.removeAttribute('aria-busy');
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((button) => { button.disabled = false; });
  });
});
