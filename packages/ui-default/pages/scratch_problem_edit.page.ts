import { NamedPage } from 'vj/misc/Page';
import { attachMarkdownImagePaste } from '../common/markdown-image-paste';

export default new NamedPage(['scratch_problem_project_create', 'scratch_problem_edit'], () => {
  const form = document.querySelector<HTMLFormElement>('[data-scratch-problem-form]');
  if (!form || form.dataset.imagePasteBound === 'true') return;
  const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
  const status = form.querySelector<HTMLElement>('[data-scratch-description-image-status]');
  if (!textarea || !status) return;
  form.dataset.imagePasteBound = 'true';
  attachMarkdownImagePaste(textarea, status);
});
