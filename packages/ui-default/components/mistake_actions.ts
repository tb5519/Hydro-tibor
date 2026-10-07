type MistakeStatus = 'review' | 'mastered';
type PostMistake = (url: string, data: { operation: string }) => Promise<any>;

// Keep the editor and its draft in place while changing the current learner's mistake book.
export function bindMistakeActions(
  root: Document,
  post: PostMistake,
  notify: { success: (message: string) => void, error: (message: string) => void },
) {
  let pending = false;
  const forms = () => [...root.querySelectorAll<HTMLFormElement>('form[data-mistake-action]')];
  const onClick = (event: MouseEvent) => {
    const target = event.target as Element;
    if (target.closest?.('form[data-mistake-action] button[type="submit"]')) {
      // This action has its own pending guard and should remain retryable after a failure.
      event.stopPropagation();
    }
  };
  const onSubmit = async (event: Event) => {
    const form = event.target as HTMLFormElement;
    if (!form.matches?.('form[data-mistake-action]')) return;
    event.preventDefault();
    if (pending) return;
    const operation = form.querySelector<HTMLInputElement>('[name="operation"]')?.value;
    if (!['add_mistake', 'master_mistake'].includes(operation)) return;
    pending = true;
    const buttons = forms().flatMap((item) => [...item.querySelectorAll<HTMLButtonElement>('button[type="submit"]')]);
    buttons.forEach((button) => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    });
    try {
      const response = await post(form.action, { operation });
      const status: MistakeStatus = response?.mistakeStatus ?? response?.data?.mistakeStatus;
      if (!['review', 'mastered'].includes(status)) throw new Error('暂未确认保存结果，请稍后重试。');
      const reviewing = status === 'review';
      forms().forEach((item) => {
        item.querySelector<HTMLInputElement>('[name="operation"]').value = reviewing ? 'master_mistake' : 'add_mistake';
        const button = item.querySelector<HTMLButtonElement>('button[type="submit"]');
        const label = button.querySelector<HTMLElement>('[data-mistake-action-label]');
        const text = reviewing ? '标记已掌握' : '重新加入错题集';
        if (label) label.textContent = text;
        else button.textContent = text;
        if (button.classList.contains('problem-mistake-float__button')) button.classList.toggle('secondary', reviewing);
      });
      const panel = root.querySelector<HTMLElement>('.problem-mistake-float');
      if (panel) {
        panel.dataset.mistakeState = status;
        panel.querySelector<HTMLElement>('.problem-mistake-float__title').textContent = reviewing ? '已加入错题集' : '已掌握本题';
        panel.querySelector<HTMLElement>('.problem-mistake-float__text').textContent = reviewing
          ? '复盘完成后可以标记已掌握。' : '还想再巩固一下？可以重新加入错题集。';
      }
      notify.success(reviewing ? '已加入错题集' : '已标记掌握');
    } catch (error) {
      notify.error(error?.message || '暂时未能保存，请稍后重试。');
    } finally {
      pending = false;
      buttons.forEach((button) => {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      });
    }
  };
  root.addEventListener('click', onClick, true);
  root.addEventListener('submit', onSubmit);
  return () => {
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('submit', onSubmit);
  };
}
