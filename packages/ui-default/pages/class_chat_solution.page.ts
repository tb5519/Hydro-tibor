import { NamedPage } from 'vj/misc/Page';

export default new NamedPage('class_chat_solution', async () => {
  const root = document.querySelector<HTMLElement>('[data-solution-workspace]');
  const config = (UiContext as any).classChatSolution;
  if (!root || !config) return;
  try {
    const { installSolutionWorkspace } = await import(/* webpackChunkName: "teaching-solution" */ '../components/class_chat/solution_workspace');
    await installSolutionWorkspace(root, config);
  } catch (error) {
    const status = root.querySelector<HTMLElement>('[data-solution-status]');
    if (status) status.textContent = '编辑器未能加载，请刷新重试';
    console.warn('Unable to prepare teaching solution', error);
  }
});
