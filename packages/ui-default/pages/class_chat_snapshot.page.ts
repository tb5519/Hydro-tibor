import { NamedPage } from 'vj/misc/Page';

export default new NamedPage('class_chat_snapshot', () => {
  const button = document.querySelector<HTMLButtonElement>('[data-copy-chat-code]');
  const code = document.querySelector<HTMLElement>('[data-chat-snapshot-code]');
  if (!button || !code) return;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent || '');
      button.textContent = '已复制';
      window.setTimeout(() => { button.textContent = '复制代码'; }, 1800);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange(); range.selectNodeContents(code);
      selection?.removeAllRanges(); selection?.addRange(range);
      button.textContent = '已选中，按 Ctrl / ⌘ C 复制';
    }
  });
});
