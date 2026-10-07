interface ReviewMistakeContext {
  url: string;
  studentName: string;
  added: boolean;
}

export function bindHomeworkReviewMistake(
  root: Document,
  context: ReviewMistakeContext | undefined,
  post: (url: string, data: { operation: string }) => Promise<any>,
  notify: { success: (message: string) => void, error: (message: string) => void },
) {
  if (!context?.url) return () => {};
  let pending = false;
  const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('[data-homework-review-mistake]')];
  const save = async () => {
    if (pending || context.added) return;
    pending = true;
    buttons().forEach((button) => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    });
    try {
      const response = await post(context.url, { operation: 'add_review_mistake' });
      if (response?.reviewMistakeAdded !== true) throw new Error('暂未确认保存结果，请稍后重试。');
      context.added = true;
      root.querySelectorAll<HTMLElement>('[data-homework-review-mistake-label]').forEach((label) => {
        label.textContent = `已加入${context.studentName}的错题集`;
      });
      notify.success(`已加入「${context.studentName}」的错题集`);
    } catch (error) {
      notify.error(error?.message || '暂时未能保存，请稍后重试。');
    } finally {
      pending = false;
      buttons().forEach((button) => {
        button.disabled = context.added;
        button.removeAttribute('aria-busy');
      });
    }
  };
  const onClick = (event: MouseEvent) => {
    const button = (event.target as Element).closest?.('[data-homework-review-mistake]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    save();
  };
  const onSubmit = (event: Event) => {
    if (!(event.target as Element).matches?.('form[data-homework-review-mistake-form]')) return;
    event.preventDefault();
    save();
  };
  root.addEventListener('click', onClick, true);
  root.addEventListener('submit', onSubmit);
  return () => {
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('submit', onSubmit);
  };
}
