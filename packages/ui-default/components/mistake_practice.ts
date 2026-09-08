type PostPractice = (url: string, data: { operation: string, practiceToken: string }) => Promise<any>;

// Delegation also works when the statement is moved into/out of scratchpad.
export function bindMistakePracticeActions(root: Document, post: PostPractice) {
  const onSubmit = async (event: Event) => {
    const form = event.target as HTMLFormElement;
    if (!form?.matches?.('.mistake-practice__form')) return;
    event.preventDefault();
    const panel = form.closest<HTMLElement>('.mistake-practice');
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const token = form.querySelector<HTMLInputElement>('[name="practiceToken"]')?.value;
    if (!panel || !button || button.disabled || !token) return;
    const feedback = panel.querySelector<HTMLElement>('.mistake-practice__feedback');
    button.disabled = true;
    button.textContent = '正在标记…';
    if (feedback) feedback.textContent = '';
    try {
      const response = await post(form.action, { operation: 'deepen_mistake', practiceToken: token });
      const importance = response?.importance ?? response?.data?.importance;
      if (!Number.isSafeInteger(importance) || importance < 1) throw new Error('暂未确认标记结果，请返回错题集查看。');
      const counter = panel.querySelector<HTMLElement>('[data-mistake-importance]');
      const hint = panel.querySelector<HTMLElement>('[data-mistake-practice-hint]');
      if (counter) counter.textContent = `${importance}`;
      if (hint) hint.textContent = '本轮已加深标记，下次重新练习后可以再次标记。';
      button.textContent = '本轮已加深';
      if (feedback) feedback.textContent = `重要性已提升到 ${importance}，这道题会优先排在前面。`;
    } catch (error) {
      button.disabled = false;
      button.textContent = '加深标记';
      if (feedback) feedback.textContent = error?.message || '暂时未能保存，请稍后重试。';
    }
  };
  root.addEventListener('submit', onSubmit);
  return () => root.removeEventListener('submit', onSubmit);
}
