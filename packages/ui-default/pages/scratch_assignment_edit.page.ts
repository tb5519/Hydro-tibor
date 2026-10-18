import { NamedPage } from 'vj/misc/Page';
import { attachMarkdownImagePaste } from '../common/markdown-image-paste';
import { createObjectiveMarkdown } from '../common/objective-markdown';

interface ProjectProblem {
  id: string;
  title: string;
  description: string;
  templateFileId?: string;
  url: string;
}

export default new NamedPage(['scratch_assignment_create', 'scratch_assignment_edit'], () => {
  const form = document.querySelector<HTMLFormElement>('[data-scratch-assignment-form]');
  if (!form) return;
  const audienceModes = [...form.querySelectorAll<HTMLInputElement>('input[name=audience]')];
  const recipientIds = form.querySelector<HTMLInputElement>('[data-assignment-recipient-ids]');
  const recipientPicker = form.querySelector<HTMLElement>('[data-assignment-recipient-picker]');
  const recipientInputs = [...form.querySelectorAll<HTMLInputElement>('[data-assignment-recipient]')];
  const recipientRows = [...form.querySelectorAll<HTMLElement>('[data-assignment-recipient-row]')];
  const recipientSearch = form.querySelector<HTMLInputElement>('[data-assignment-recipient-search]');
  const recipientChips = form.querySelector<HTMLElement>('[data-assignment-recipient-chips]');
  const recipientCount = form.querySelector<HTMLElement>('[data-assignment-recipient-count]');
  const recipientMatches = form.querySelector<HTMLElement>('[data-assignment-recipient-matches]');
  const recipientEmpty = form.querySelector<HTMLElement>('[data-assignment-recipient-empty]');
  const recipientClear = form.querySelector<HTMLButtonElement>('[data-assignment-recipient-clear]');
  const recipientSelectAll = form.querySelector<HTMLButtonElement>('[data-assignment-recipient-select-all]');
  const audienceError = form.querySelector<HTMLElement>('[data-assignment-audience-error]');
  const isSelectedAudience = () => audienceModes.some((input) => input.checked && input.value === 'selected');
  const selectedRecipients = () => recipientInputs.filter((input) => input.checked);
  const recipientError = () => {
    if (!isSelectedAudience()) return '';
    const checked = selectedRecipients();
    if (!checked.length) return '请至少选择一位学员，或改为发送给全体学员。';
    if (checked.some((input) => input.dataset.unavailable === 'true')) return '已选名单中有离开课堂的学员，请移除后再保存。';
    return '';
  };
  const showAudienceError = (message: string) => {
    if (!audienceError) return;
    audienceError.textContent = message;
    audienceError.hidden = !message;
  };
  const filterRecipients = () => {
    const term = recipientSearch?.value.trim().toLocaleLowerCase() || '';
    let visible = 0;
    let selectable = 0;
    for (const row of recipientRows) {
      row.hidden = !row.dataset.search?.toLocaleLowerCase().includes(term);
      if (row.hidden) continue;
      visible++;
      const input = row.querySelector<HTMLInputElement>('[data-assignment-recipient]');
      if (input && !input.checked && input.dataset.unavailable !== 'true') selectable++;
    }
    if (recipientMatches) recipientMatches.textContent = term ? `找到 ${visible} 位学员` : `共 ${recipientRows.length} 位学员`;
    if (recipientEmpty) recipientEmpty.hidden = visible > 0;
    if (recipientSelectAll) {
      recipientSelectAll.textContent = term ? '选中搜索结果' : '全选当前名单';
      recipientSelectAll.disabled = !selectable;
    }
  };
  const updateRecipients = () => {
    const checked = selectedRecipients();
    const selected = isSelectedAudience();
    if (recipientIds) recipientIds.value = JSON.stringify(selected ? checked.map((input) => Number(input.value)) : []);
    if (recipientPicker) recipientPicker.hidden = !selected;
    if (recipientCount) recipientCount.textContent = `已选 ${checked.length} 位学员`;
    if (recipientClear) recipientClear.disabled = !checked.length;
    recipientInputs.forEach((input) => { input.disabled = input.dataset.unavailable === 'true' && !input.checked; });
    if (recipientChips) {
      recipientChips.replaceChildren();
      recipientChips.hidden = !checked.length;
      for (const input of checked) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sc-assignment-recipient-chip';
        if (input.dataset.unavailable === 'true') chip.classList.add('is-unavailable');
        const label = input.dataset.label || input.value;
        chip.textContent = `${label} ×`;
        chip.setAttribute('aria-label', `移除学员 ${label}`);
        chip.addEventListener('click', () => {
          input.checked = false;
          updateRecipients();
          recipientSearch?.focus();
        });
        recipientChips.appendChild(chip);
      }
    }
    filterRecipients();
    if (audienceError && !audienceError.hidden) showAudienceError(recipientError());
  };
  audienceModes.forEach((input) => input.addEventListener('change', updateRecipients));
  recipientInputs.forEach((input) => input.addEventListener('change', updateRecipients));
  recipientSearch?.addEventListener('input', filterRecipients);
  recipientClear?.addEventListener('click', () => {
    recipientInputs.forEach((input) => { input.checked = false; });
    updateRecipients();
  });
  recipientSelectAll?.addEventListener('click', () => {
    for (const row of recipientRows) {
      const input = row.querySelector<HTMLInputElement>('[data-assignment-recipient]');
      if (!row.hidden && input && input.dataset.unavailable !== 'true') input.checked = true;
    }
    updateRecipients();
  });
  updateRecipients();
  const modes = [...form.querySelectorAll<HTMLInputElement>('input[name=assignmentMode]')];
  const project = form.querySelector<HTMLElement>('[data-assignment-project]');
  const objective = form.querySelector<HTMLElement>('[data-assignment-objective]');
  const template = form.querySelector<HTMLInputElement>('input[name=template]');
  const title = form.querySelector<HTMLInputElement>('input[name=title]');
  const description = form.querySelector<HTMLTextAreaElement>('textarea[name=description]');
  const imageStatus = form.querySelector<HTMLElement>('[data-assignment-description-image-status]');
  if (description && imageStatus) attachMarkdownImagePaste(description, imageStatus);
  const projectId = form.querySelector<HTMLInputElement>('[data-assignment-project-id]');
  const projectRows = [...form.querySelectorAll<HTMLElement>('[data-assignment-project-item]')];
  const projectPicker = form.querySelector<HTMLElement>('[data-assignment-project-picker]');
  const projectToggle = form.querySelector<HTMLButtonElement>('[data-assignment-project-toggle]');
  const projectClear = form.querySelector<HTMLButtonElement>('[data-assignment-project-clear]');
  const projectSearch = form.querySelector<HTMLInputElement>('[data-assignment-project-search]');
  const projectTitle = form.querySelector<HTMLElement>('[data-assignment-project-title]');
  const projectKind = form.querySelector<HTMLElement>('[data-assignment-project-kind]');
  const projectCopy = form.querySelector<HTMLElement>('[data-assignment-project-copy]');
  const projectNotice = form.querySelector<HTMLElement>('[data-assignment-project-notice]');
  const projectNoticeCopy = form.querySelector<HTMLElement>('[data-assignment-project-notice-copy]');
  const projectApply = form.querySelector<HTMLButtonElement>('[data-assignment-project-apply]');
  const projectPreview = form.querySelector<HTMLDetailsElement>('[data-assignment-project-selected-preview]');
  const projectPreviewBody = form.querySelector<HTMLElement>('[data-assignment-project-preview-body]');
  const projectLink = form.querySelector<HTMLAnchorElement>('[data-assignment-project-link]');
  const projectTemplateHint = form.querySelector<HTMLElement>('[data-assignment-project-template-hint]');
  const originalTemplate = form.querySelector<HTMLElement>('[data-assignment-original-template]');
  const submitButton = form.querySelector<HTMLButtonElement>('button[type=submit]');
  const submitLabel = submitButton?.textContent || '发布作业';
  const originalProjectId = form.dataset.originalProjectId || '';
  const isEditing = form.dataset.editing === 'true';
  const projectCache = new Map<string, ProjectProblem>();
  const projectRequests = new Map<string, Promise<ProjectProblem>>();
  const projectControllers = new Set<AbortController>();
  const markdown = createObjectiveMarkdown();
  let projectGeneration = 0;
  let projectLoading = false;
  let autoTitle: string | undefined;
  let autoDescription: string | undefined;
  let selectedProject: ProjectProblem | null = null;
  let papers: HTMLInputElement[] = [];
  let summary: HTMLElement | null;
  let hint: HTMLElement | null;
  const readLibrary = () => {
    papers = [...form.querySelectorAll<HTMLInputElement>('input[type=checkbox][name=objectivePaperIds]')];
    summary = form.querySelector<HTMLElement>('[data-assignment-selection-summary]');
    hint = form.querySelector<HTMLElement>('[data-assignment-selection-hint]');
  };
  readLibrary();
  const validation = form.querySelector<HTMLElement>('[data-assignment-validation]');
  const refresh = form.querySelector<HTMLButtonElement>('[data-assignment-refresh]');
  const refreshStatus = form.querySelector<HTMLElement>('[data-assignment-refresh-status]');
  let request: AbortController | null = null;
  const publishSummary = form.querySelector<HTMLElement>('[data-assignment-publish-summary]');
  const currentMode = () => modes.find((input) => input.checked)?.value || 'project';
  const projectRow = (id: string) => projectRows.find((row) => row.dataset.id === id);
  const setProjectLoading = (loading: boolean) => {
    projectLoading = loading;
    form.setAttribute('aria-busy', String(loading));
    if (submitButton) {
      submitButton.disabled = loading;
      submitButton.textContent = loading ? '正在载入创作题…' : submitLabel;
    }
  };
  const setProjectNotice = (message: string, canApply = false) => {
    if (projectNotice) projectNotice.hidden = !message;
    if (projectNoticeCopy) projectNoticeCopy.textContent = message;
    if (projectApply) projectApply.hidden = !canApply;
  };
  const setPickerOpen = (open: boolean) => {
    if (projectPicker) projectPicker.hidden = !open;
    projectToggle?.setAttribute('aria-expanded', String(open));
    if (open) projectSearch?.focus();
  };
  const updateProject = () => {
    const id = projectId?.value || '';
    const row = projectRow(id);
    if (projectTitle) projectTitle.textContent = row?.dataset.title || (id ? title.value || '已布置的创作题' : '按这次课堂的想法，布置一个作品');
    if (projectKind) projectKind.textContent = id ? '来自题库' : '自由创作';
    if (projectCopy) projectCopy.textContent = id
      ? '标题和任务说明可在上方调整，修改只影响这份作业。'
      : '直接填写上方任务，或从题库挑选已经准备好的创作题。';
    if (projectToggle) projectToggle.textContent = id ? '更换题目' : '从题库选择';
    if (projectClear) projectClear.hidden = !id;
    if (projectPreview) projectPreview.hidden = !row;
    if (projectLink && row) projectLink.href = row.dataset.url;
    for (const item of projectRows) {
      const chosen = item.dataset.id === id;
      item.classList.toggle('is-selected', chosen);
      const button = item.querySelector<HTMLButtonElement>('[data-assignment-project-select]');
      button?.setAttribute('aria-pressed', String(chosen));
      if (button) button.textContent = chosen ? '已选择' : '选择这题';
    }
    const keepsTemplate = form.dataset.originalTemplate === 'true' && id === originalProjectId;
    if (originalTemplate) originalTemplate.hidden = !keepsTemplate;
    if (projectTemplateHint) {
      projectTemplateHint.textContent = template?.files?.length
        ? '将使用你上传的 .sb3 文件作为起始项目，优先于题库中的起始作品。'
        : keepsTemplate ? '已保留这份作业现有的起始项目；上传新的 .sb3 文件可替换，最大 20MB。'
          : (selectedProject?.id === id ? !!selectedProject.templateFileId : row?.dataset.template === 'true')
            ? '将沿用这道创作题的起始作品；也可以上传 .sb3 文件替换，最大 20MB。'
            : '孩子将从空白作品开始。也可以上传 .sb3 文件作为起点，最大 20MB。';
    }
  };
  const loadProject = (row: HTMLElement) => {
    const id = row.dataset.id;
    if (projectCache.has(id)) return Promise.resolve(projectCache.get(id));
    if (projectRequests.has(id)) return projectRequests.get(id);
    const controller = new AbortController();
    projectControllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    const pending = (async () => {
      try {
        const response = await fetch(row.dataset.previewUrl, {
          credentials: 'same-origin', signal: controller.signal,
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!response.ok) throw new Error('这道创作题暂时无法读取，请重试或选择其他题目。');
        const data = (await response.json()).projectProblem;
        if (!data || String(data.id) !== id || typeof data.title !== 'string' || typeof data.description !== 'string') {
          throw new Error('题目内容未完整加载，请重试。');
        }
        projectCache.set(id, data);
        return data as ProjectProblem;
      } finally {
        clearTimeout(timer);
        projectControllers.delete(controller);
        projectRequests.delete(id);
      }
    })();
    projectRequests.set(id, pending);
    return pending;
  };
  const previewProjectRow = async (row: HTMLElement) => {
    const status = row.querySelector<HTMLElement>('[data-assignment-project-row-status]');
    const content = row.querySelector<HTMLElement>('[data-assignment-project-row-preview]');
    const retry = row.querySelector<HTMLButtonElement>('[data-assignment-project-preview-retry]');
    if (status) status.textContent = '正在载入任务…';
    if (retry) retry.hidden = true;
    try {
      const data = await loadProject(row);
      if (content) content.innerHTML = markdown.render(data.description);
      if (status) status.textContent = '';
    } catch {
      if (status) status.textContent = '暂时无法加载，请重试。';
      if (retry) retry.hidden = false;
    }
  };
  const fillProject = (data: ProjectProblem, force = false) => {
    const filled: string[] = [];
    const kept: string[] = [];
    if (force || !title.value.trim() || title.value === autoTitle) {
      title.value = data.title;
      autoTitle = data.title;
      filled.push('标题');
    } else kept.push('标题');
    if (force || !description.value.trim() || description.value === autoDescription) {
      description.value = data.description;
      autoDescription = data.description;
      description.dispatchEvent(new Event('input', { bubbles: true }));
      filled.push('任务说明（含图片）');
    } else kept.push('任务说明');
    const message = [filled.length ? `已将${filled.join('、')}带入上方。` : '',
      kept.length ? `已保留你填写的${kept.join('、')}。` : '',
      data.templateFileId ? '起始作品会一起用于这份作业。' : '这道题从空白作品开始。'].filter(Boolean).join('');
    setProjectNotice(message, kept.length > 0);
  };
  const selectProject = async (row: HTMLElement) => {
    const generation = ++projectGeneration;
    setProjectLoading(true);
    setProjectNotice(`正在载入「${row.dataset.title}」…`);
    try {
      const data = await loadProject(row);
      if (generation !== projectGeneration || currentMode() === 'objective') return;
      selectedProject = data;
      projectId.value = data.id;
      fillProject(data);
      if (projectPreviewBody) projectPreviewBody.innerHTML = markdown.render(data.description);
      if (projectPreview) projectPreview.open = false;
      setPickerOpen(false);
      updateProject();
      projectToggle?.focus();
    } catch {
      if (generation !== projectGeneration) return;
      setProjectNotice('这道题暂时无法加载，已保留原来的任务。请再次点击“选择这题”重试。');
    } finally {
      if (generation === projectGeneration) setProjectLoading(false);
    }
  };
  const selected = () => papers.filter((input) => input.checked);
  const questionCount = () => selected().reduce((total, input) => total + Number(input.dataset.questionCount || 0), 0);
  const selectionError = () => {
    if (currentMode() === 'project') return '';
    if (!selected().length) return '请至少选择一份客观题卷，再发布作业。';
    if (selected().some((input) => input.dataset.unavailable)) return '有已选题卷不再可用，请取消选择后再发布作业。';
    if (selected().length > 10) return '一份作业最多选择 10 份题卷，请减少所选题卷。';
    if (questionCount() > 100) return '一份作业最多包含 100 道题，请减少所选题卷。';
    return '';
  };
  const showError = (message: string) => {
    if (!validation) return;
    validation.textContent = message;
    validation.hidden = !message;
  };
  const update = () => {
    const mode = currentMode();
    const includesProject = mode !== 'objective';
    const includesObjective = mode !== 'project';
    if (project) project.hidden = !includesProject;
    if (objective) objective.hidden = !includesObjective;
    if (template) template.disabled = !includesProject;
    if (projectId) projectId.disabled = !includesProject;
    if (!includesProject && projectLoading) {
      projectGeneration++;
      setProjectLoading(false);
      setProjectNotice('已保留原来的创作任务，切回作品创作后可以继续选择。');
    }
    papers.forEach((input) => { input.disabled = !includesObjective; });
    const chosen = selected();
    const score = chosen.reduce((total, input) => total + Number(input.dataset.totalScore || 0), 0);
    if (summary) summary.textContent = chosen.length ? `已选 ${chosen.length} 份 · ${questionCount()} 题 · ${score} 分` : '请选择题卷';
    if (hint) hint.textContent = chosen.length ? '发布后，每位孩子都会收到这份练习。' : '可组合多份题卷，组成这次的小练习。';
    if (publishSummary) {
      const content = includesObjective ? `${includesProject ? '一份 Scratch 作品 + ' : ''}${questionCount()} 道客观题` : '一份 Scratch 作品';
      publishSummary.textContent = `本次作业：${content}。`;
    }
    showError(chosen.length ? selectionError() : '');
  };
  form.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (['assignmentMode', 'objectivePaperIds'].includes(input.name)) update();
    if (input.name === 'template') updateProject();
  });
  projectToggle?.addEventListener('click', () => setPickerOpen(projectPicker?.hidden));
  projectClear?.addEventListener('click', () => {
    projectGeneration++;
    setProjectLoading(false);
    projectId.value = '';
    selectedProject = null;
    autoTitle = undefined;
    autoDescription = undefined;
    setPickerOpen(false);
    if (projectPreview) projectPreview.open = false;
    setProjectNotice('已改为自由创作，填写的标题与任务说明已保留。可在下方自行准备起始项目。');
    updateProject();
  });
  projectApply?.addEventListener('click', () => {
    if (selectedProject) fillProject(selectedProject, true);
  });
  projectSearch?.addEventListener('input', () => {
    const query = projectSearch.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of projectRows) {
      row.hidden = !(row.dataset.search || '').toLocaleLowerCase().includes(query);
      if (!row.hidden) visible++;
    }
    const empty = form.querySelector<HTMLElement>('[data-assignment-project-no-results]');
    if (empty) empty.hidden = visible > 0;
  });
  for (const row of projectRows) {
    row.querySelector('[data-assignment-project-select]')?.addEventListener('click', () => { void selectProject(row); });
    row.querySelector('[data-assignment-project-preview]')?.addEventListener('toggle', (event) => {
      if ((event.target as HTMLDetailsElement).open) void previewProjectRow(row);
    });
    row.querySelector('[data-assignment-project-preview-retry]')?.addEventListener('click', () => { void previewProjectRow(row); });
  }
  projectPreview?.addEventListener('toggle', async () => {
    if (!projectPreview.open) return;
    const id = projectId?.value;
    const row = projectRow(id);
    if (!row || !projectPreviewBody) return;
    projectPreviewBody.textContent = '正在载入题库原题…';
    try {
      const data = await loadProject(row);
      if (projectId.value === id) projectPreviewBody.innerHTML = markdown.render(data.description);
    } catch {
      if (projectId.value === id) projectPreviewBody.textContent = '暂时无法加载，收起后再次展开即可重试。';
    }
  });
  form.addEventListener('input', (event) => {
    const search = event.target as HTMLInputElement;
    if (!search.matches('[data-assignment-search]')) return;
    const query = search.value.trim().toLocaleLowerCase();
    const empty = form.querySelector<HTMLElement>('[data-assignment-no-results]');
    let visible = 0;
    form.querySelectorAll<HTMLElement>('[data-assignment-paper]').forEach((row) => {
      row.hidden = !(row.dataset.search || '').toLocaleLowerCase().includes(query);
      if (!row.hidden) visible++;
    });
    if (empty) empty.hidden = visible > 0;
  });
  refresh?.addEventListener('click', async () => {
    if (request) return;
    request = new AbortController();
    const timer = setTimeout(() => request?.abort(), 20000);
    refresh.disabled = true;
    if (refreshStatus) refreshStatus.textContent = '正在更新题卷…';
    try {
      const response = await fetch(location.href, { credentials: 'same-origin', cache: 'no-store', signal: request.signal });
      if (!response.ok) throw new Error('题卷列表暂时无法更新，请重试。');
      const next = new DOMParser().parseFromString(await response.text(), 'text/html').querySelector('[data-assignment-library]');
      const current = form.querySelector('[data-assignment-library]');
      if (!next || !current) throw new Error('题卷列表暂时无法更新，请重试。');
      const selectedIds = new Set(selected().map((input) => input.value));
      const missing = selected().filter((input) => ![...next.querySelectorAll<HTMLInputElement>('input[type=checkbox][name=objectivePaperIds]')]
        .some((item) => item.value === input.value));
      if (missing.length) {
        let list = next.querySelector('[data-assignment-papers]');
        if (!list) {
          list = document.createElement('div');
          list.className = 'sc-assignment-papers';
          list.setAttribute('data-assignment-papers', '');
          next.appendChild(list);
        }
        for (const input of missing) {
          const row = input.closest<HTMLElement>('[data-assignment-paper]')?.cloneNode(true) as HTMLElement | undefined;
          const copy = row?.querySelector<HTMLInputElement>('input');
          if (!row || !copy) continue;
          row.hidden = false;
          copy.dataset.unavailable = 'true';
          const meta = row.querySelector<HTMLElement>('.sc-assignment-paper-meta');
          if (meta) meta.textContent = '这份题卷已不可用，请取消选择';
          list.appendChild(row);
        }
      }
      next.querySelectorAll<HTMLInputElement>('input[type=checkbox][name=objectivePaperIds]').forEach((input) => {
        input.checked = selectedIds.has(input.value);
      });
      current.replaceWith(document.importNode(next, true));
      readLibrary();
      update();
      const unavailable = missing.length;
      if (refreshStatus) {
        refreshStatus.textContent = unavailable
          ? `列表已更新；${unavailable} 份已选题卷已不可用，已保留在列表中，请取消选择。`
          : '题卷已更新，正在填写的作业内容已保留。';
      }
    } catch (error) {
      if (refreshStatus) refreshStatus.textContent = error.name === 'AbortError' ? '更新超时，请重试。' : '题卷列表暂时无法更新，请重试。';
    } finally {
      clearTimeout(timer);
      request = null;
      refresh.disabled = false;
    }
  });
  window.addEventListener('pagehide', () => {
    request?.abort();
    projectControllers.forEach((controller) => controller.abort());
  });
  form.addEventListener('submit', (event) => {
    if (projectLoading) {
      event.preventDefault();
      setProjectNotice('创作题正在载入，完成后即可发布。');
      return;
    }
    const audienceMessage = recipientError();
    if (audienceMessage) {
      event.preventDefault();
      showAudienceError(audienceMessage);
      audienceError?.focus();
      return;
    }
    const message = selectionError();
    if (!message) return;
    event.preventDefault();
    showError(message);
    validation?.focus();
  });
  if (form.dataset.initialProject) {
    try {
      const data: ProjectProblem = JSON.parse(form.dataset.initialProject);
      if (data?.id === projectId?.value && typeof data.description === 'string') {
        projectCache.set(data.id, data);
        selectedProject = data;
        if (!isEditing) fillProject(data);
      }
    } catch { /* Keep the draft usable if an optional preview is unavailable. */ }
  }
  updateProject();
  update();
});
