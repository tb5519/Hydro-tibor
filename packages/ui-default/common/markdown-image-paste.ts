import { request } from '../utils/base';
import './markdown-image-paste.styl';

const imageTypes = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const maxSize = 10 * 1024 * 1024;

interface Options {
  onChange?: (value: string) => void;
  onPendingChange?: (pending: boolean) => void;
}
interface ImageJob {
  file: File;
  marker: string;
  filename: string;
  state: 'queued' | 'uploading' | 'error' | 'done' | 'removed';
  progress: number;
  error?: string;
  url?: string;
  xhr?: XMLHttpRequest;
}

/** A textarea keeps its text/selection while uploads replace only their own marker. */
export function attachMarkdownImagePaste(textarea: HTMLTextAreaElement, statusHost: HTMLElement, options: Options = {}) {
  const form = textarea.form;
  const jobs: ImageJob[] = [];
  let disposed = false;
  let draining = false;
  let notice = '';
  let sequence = 0;
  const session = Math.random().toString(36).slice(2, 9);
  const fileBase = UiContext.domainId ? `/d/${encodeURIComponent(UiContext.domainId)}/file` : '/file';
  const hasPending = () => jobs.some((job) => job.state === 'queued' || job.state === 'uploading');
  const hasErrors = () => jobs.some((job) => job.state === 'error' && textarea.value.includes(job.marker));
  const changed = () => {
    options.onChange?.(textarea.value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };

  function replaceMarker(marker: string, replacement: string) {
    const index = textarea.value.indexOf(marker);
    if (index < 0) return false; // The teacher deleted it while uploading.
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const scroll = textarea.scrollTop;
    const direction = textarea.selectionDirection;
    const shift = (position: number) => (position <= index ? position
      : position < index + marker.length ? index + replacement.length : position + replacement.length - marker.length);
    textarea.setRangeText(replacement, index, index + marker.length, 'preserve');
    textarea.setSelectionRange(shift(start), shift(end), direction);
    textarea.scrollTop = scroll;
    changed();
    return true;
  }

  function render() {
    if (disposed) return;
    if (!hasPending() && !hasErrors() && ['图片还在上传，完成后即可保存。', '有图片尚未上传成功，请重试或移除后再保存。'].includes(notice)) notice = '';
    const active = document.activeElement as HTMLElement;
    const focusAction = statusHost.contains(active) ? active.dataset.imageAction : null;
    statusHost.classList.add('markdown-image-paste');
    statusHost.replaceChildren();
    const hint = document.createElement('p');
    hint.className = `markdown-image-paste__hint${notice ? ' is-notice' : ''}`;
    hint.textContent = notice || '可直接粘贴截图或复制的图片 · 每张不超过 10 MB';
    hint.setAttribute('role', 'status');
    statusHost.append(hint);
    for (const job of jobs.filter((item) => item.state !== 'removed' && item.state !== 'done')) {
      const row = document.createElement('div');
      row.className = `markdown-image-paste__row${job.state === 'error' ? ' is-error' : ''}`;
      const text = document.createElement('span');
      text.textContent = job.state === 'error' ? job.error : job.state === 'queued'
        ? '图片等待上传…' : job.progress < 100 ? `图片上传中 ${job.progress}%` : '正在保存图片…';
      row.append(text);
      if (job.state === 'error') {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.dataset.imageAction = `${job.filename}:retry`;
        retry.textContent = '重试';
        retry.addEventListener('click', () => {
          if (!textarea.value.includes(job.marker)) {
            notice = '图片位置已删除，请重新粘贴图片。';
            job.state = 'removed';
            render();
            return;
          }
          job.state = 'queued';
          notice = '';
          render();
          void drain();
        });
        row.append(retry);
      } else {
        const progress = document.createElement('progress');
        progress.max = 100;
        progress.value = job.progress;
        progress.setAttribute('aria-label', '图片上传进度');
        row.append(progress);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.imageAction = `${job.filename}:remove`;
      remove.textContent = '移除';
      remove.addEventListener('click', () => {
        job.state = 'removed';
        job.xhr?.abort();
        replaceMarker(job.marker, '');
        notice = '';
        render();
      });
      row.append(remove);
      statusHost.append(row);
    }
    const completed = jobs.filter((job) => job.state === 'done' && textarea.value.includes(job.url)).slice(-3);
    if (completed.length) {
      const previews = document.createElement('div');
      previews.className = 'markdown-image-paste__previews';
      for (const job of completed) {
        const image = document.createElement('img');
        image.src = job.url;
        image.alt = '已粘贴的图片';
        previews.append(image);
      }
      const caption = document.createElement('span');
      caption.textContent = '已插入图片';
      previews.append(caption);
      statusHost.append(previews);
    }
    options.onPendingChange?.(hasPending());
    textarea.setAttribute('aria-busy', String(hasPending()));
    if (focusAction) statusHost.querySelector<HTMLElement>(`[data-image-action="${focusAction}"]`)?.focus({ preventScroll: true });
  }

  async function drain() {
    if (draining || disposed) return;
    draining = true;
    try {
      let job: ImageJob;
      while (!disposed && (job = jobs.find((item) => item.state === 'queued'))) {
        if (!textarea.value.includes(job.marker)) {
          job.state = 'removed';
          render();
          continue;
        }
        job.state = 'uploading';
        job.progress = 0;
        // An event handler may cancel this job while the request is awaiting.
        const cancelled = () => disposed || job.state === 'removed';
        render();
        const data = new FormData();
        data.append('operation', 'upload_file');
        data.append('filename', job.filename);
        data.append('file', job.file, job.filename);
        try {
          await request.postFile(fileBase, data, {
            dataType: 'json',
            timeout: 120000,
            xhr() {
              job.xhr = new XMLHttpRequest();
              job.xhr.upload.addEventListener('progress', (event) => {
                if (!event.lengthComputable || disposed) return;
                job.progress = Math.round(event.loaded / event.total * 100);
                render();
              });
              return job.xhr;
            },
          });
          if (cancelled()) continue;
          // Keep the durable application URL, never the expiring object-store redirect.
          const url = `${fileBase}/${UserContext._id}/${job.filename}?noDisposition=1`;
          if (replaceMarker(job.marker, `![截图](${url})`)) {
            job.url = url;
            job.state = 'done';
          } else job.state = 'removed';
        } catch (error) {
          if (cancelled()) continue;
          job.state = 'error';
          job.error = `图片上传失败：${error.message || '请检查网络后重试。'}`;
        }
        render();
      }
    } finally {
      draining = false;
    }
  }

  function paste(event: ClipboardEvent) {
    if (textarea.disabled || textarea.readOnly) return;
    const clipboard = event.clipboardData;
    const items = Array.from(clipboard?.items || []).filter((item) => item.kind === 'file' && item.type.startsWith('image/'));
    const files = items.length ? items.map((item) => item.getAsFile()).filter(Boolean)
      : Array.from(clipboard?.files || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return; // Leave ordinary text paste and keyboard shortcuts untouched.
    event.preventDefault();
    notice = '';
    if (files.some((file) => !imageTypes[file.type])) notice = '请粘贴 PNG、JPG、GIF 或 WebP 图片。';
    else if (files.some((file) => file.size > maxSize)) notice = '图片超过 10 MB，请缩小图片后重新粘贴。';
    else if (files.length > 10) notice = '一次最多粘贴 10 张图片，请分批粘贴。';
    if (notice) { render(); return; }
    const incoming: ImageJob[] = files.map((file) => {
      sequence += 1;
      const id = `${session}-${sequence}`;
      return { file, marker: `【待插入图片·${id}】`, filename: `pasted-${Date.now()}-${id}.${imageTypes[file.type]}`,
        state: 'queued', progress: 0 };
    });
    const insertion = `\n${incoming.map((job) => job.marker).join('\n')}\n`;
    const maxLength = textarea.maxLength > 0 ? textarea.maxLength : 20000;
    // Leave room for each final URL, which is longer than its upload marker.
    const finalLength = textarea.value.length - (textarea.selectionEnd - textarea.selectionStart) + insertion.length + incoming.length * 140;
    if (finalLength > maxLength) {
      notice = '文字接近长度上限，请精简内容后再粘贴图片。';
      render();
      return;
    }
    textarea.setRangeText(insertion, textarea.selectionStart, textarea.selectionEnd, 'end');
    jobs.push(...incoming);
    changed();
    render();
    void drain();
  }

  function guardSubmit(event: Event) {
    if (!hasPending() && !hasErrors()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notice = hasPending() ? '图片还在上传，完成后即可保存。' : '有图片尚未上传成功，请重试或移除后再保存。';
    render();
    statusHost.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (!hasPending() && !hasErrors()) return;
    event.preventDefault();
    event.returnValue = '';
  }
  function guardClick(event: Event) {
    const button = (event.target as HTMLElement)?.closest?.('button, input') as HTMLButtonElement;
    if (button?.form === form && button.type === 'submit') guardSubmit(event);
  }
  function input() {
    for (const job of jobs) {
      if (job.state !== 'done' && job.state !== 'removed' && !textarea.value.includes(job.marker)) {
        job.state = 'removed';
        job.xhr?.abort();
      }
    }
    render();
  }
  textarea.addEventListener('paste', paste);
  textarea.addEventListener('input', input);
  form?.addEventListener('submit', guardSubmit, true);
  form?.addEventListener('click', guardClick, true);
  window.addEventListener('beforeunload', beforeUnload);
  render();
  return {
    hasPending,
    dispose() {
      disposed = true;
      jobs.forEach((job) => job.xhr?.abort());
      textarea.removeEventListener('paste', paste);
      textarea.removeEventListener('input', input);
      form?.removeEventListener('submit', guardSubmit, true);
      form?.removeEventListener('click', guardClick, true);
      window.removeEventListener('beforeunload', beforeUnload);
    },
  };
}
