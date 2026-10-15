import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('homework_main', () => {
  const rosterState = { search: '', filter: 'all' };
  const studentState = { search: '', view: 'pending' };
  const normalizeSearch = (value) => String(value || '').normalize('NFKC').trim().toLocaleLowerCase();

  const refreshRoster = () => {
    const root = document.querySelector('[data-homework-admin-panel]');
    if (!root) return;
    const cards = [...root.querySelectorAll('[data-homework-roster-card]')];
    const search = root.querySelector('[data-homework-roster-search]');
    if (search) search.value = rosterState.search;
    const query = normalizeSearch(rosterState.search);
    let visible = 0;
    for (const card of cards) {
      const done = card.dataset.homeworkDone === 'true';
      const matchesState = rosterState.filter === 'all' || (rosterState.filter === 'done' ? done : !done);
      card.hidden = !matchesState || !normalizeSearch(card.dataset.homeworkSearch).includes(query);
      if (!card.hidden) visible++;
    }
    root.querySelectorAll('[data-homework-roster-filter]').forEach((button) => {
      const active = button.dataset.homeworkRosterFilter === rosterState.filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    root.querySelectorAll('[data-homework-filter-count]').forEach((element) => {
      const done = element.dataset.homeworkFilterCount === 'done';
      element.textContent = String(cards.filter((card) => (card.dataset.homeworkDone === 'true') === done).length);
    });
    const count = root.querySelector('[data-homework-visible-count]');
    if (count) count.textContent = `${visible} 位学员`;
    const empty = root.querySelector('[data-homework-filter-empty]');
    if (empty) empty.hidden = visible > 0;
  };

  const refreshStudent = () => {
    const root = document.querySelector('[data-homework-student-workspace]');
    if (!root) return;
    const query = normalizeSearch(studentState.search);
    let visible = 0;
    root.querySelectorAll('[data-homework-student-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.homeworkStudentPanel !== studentState.view;
      panel.querySelectorAll('[data-homework-student-card]').forEach((card) => {
        card.hidden = !normalizeSearch(card.dataset.homeworkSearch).includes(query);
        if (!panel.hidden && !card.hidden) visible++;
      });
      // A search empty state replaces the normal unassigned/completed message.
      panel.querySelectorAll('.homework-hub__empty').forEach((empty) => { empty.hidden = !!query; });
    });
    root.querySelectorAll('[data-homework-student-view]').forEach((button) => {
      const active = button.dataset.homeworkStudentView === studentState.view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    root.querySelector('[data-homework-student-filter-empty]').hidden = !query || visible > 0;
  };

  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const leaveDuration = reducedMotion ? 0 : 160;
  const enterDuration = reducedMotion ? 0 : 300;
  const adminViewLink = '[data-homework-admin-view-link]';
  let viewRequest;
  let viewRequestId = 0;

  const setViewLoading = (admin, url, loading) => {
    admin.querySelectorAll(adminViewLink).forEach((link) => {
      const isTarget = new URL(link.href, window.location.href).href === url.href;
      link.classList.toggle('is-loading', loading && isTarget);
    });
  };

  const loadHomeworkView = async (href, { pushHistory = true, restoreFocus = false } = {}) => {
    const url = new URL(href, window.location.href);
    const admin = document.querySelector('[data-homework-admin]');
    if (!admin || url.origin !== window.location.origin) {
      window.location.assign(url.href);
      return;
    }

    const requestId = ++viewRequestId;
    viewRequest?.abort();
    const controller = new AbortController();
    viewRequest = controller;
    admin.setAttribute('aria-busy', 'true');
    setViewLoading(admin, url, true);

    try {
      const response = await fetch(url.href, {
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok || response.redirected) throw new Error('Unable to load homework view');

      const pageDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextAdmin = pageDocument.querySelector('[data-homework-admin]');
      const nextSidebar = nextAdmin?.querySelector('[data-homework-admin-sidebar]');
      const nextPanel = nextAdmin?.querySelector('[data-homework-admin-panel]');
      if (requestId !== viewRequestId) return;
      if (!nextSidebar || !nextPanel) throw new Error('Homework view is unavailable');

      const currentAdmin = document.querySelector('[data-homework-admin]');
      const currentSidebar = currentAdmin?.querySelector('[data-homework-admin-sidebar]');
      const currentPanel = currentAdmin?.querySelector('[data-homework-admin-panel]');
      if (!currentAdmin || !currentSidebar || !currentPanel) throw new Error('Homework view is unavailable');

      currentSidebar.classList.add('is-homework-view-leaving');
      currentPanel.classList.add('is-homework-view-leaving');
      await wait(leaveDuration);
      if (requestId !== viewRequestId) return;

      currentSidebar.replaceWith(nextSidebar);
      currentPanel.replaceWith(nextPanel);
      currentAdmin.dataset.homeworkView = nextAdmin.dataset.homeworkView;
      nextSidebar.classList.add('is-homework-view-entering');
      nextPanel.classList.add('is-homework-view-entering');
      window.setTimeout(() => {
        nextSidebar.classList.remove('is-homework-view-entering');
        nextPanel.classList.remove('is-homework-view-entering');
      }, enterDuration);
      refreshRoster();

      if (pushHistory) window.history.pushState({ homeworkView: url.href }, '', url.href);
      if (restoreFocus) nextSidebar.querySelector(`${adminViewLink}.is-active`)?.focus({ preventScroll: true });
    } catch {
      if (controller.signal.aborted || requestId !== viewRequestId) return;
      window.location.assign(url.href);
    } finally {
      if (requestId === viewRequestId) {
        const currentAdmin = document.querySelector('[data-homework-admin]');
        if (currentAdmin) {
          currentAdmin.setAttribute('aria-busy', 'false');
          setViewLoading(currentAdmin, url, false);
        }
        if (viewRequest === controller) viewRequest = undefined;
      }
    }
  };

  $(document).off('change.homework-main-filter', '[name="filter-form"] select').on(
    'change.homework-main-filter',
    '[name="filter-form"] select',
    function onFilterChange() {
      $(this).closest('[name="filter-form"]').trigger('submit');
    },
  );

  $(document).off(
    'click.homework-main-toggle',
    '[data-homework-student-toggle], [data-homework-assignment-toggle]',
  ).on(
    'click.homework-main-toggle',
    '[data-homework-student-toggle], [data-homework-assignment-toggle]',
    function onToggle() {
      const $trigger = $(this);
      const expanded = $trigger.attr('aria-expanded') === 'true';
      const id = $trigger.attr('aria-controls');
      const details = id ? document.getElementById(id) : undefined;
      if (!details) return;
      $trigger.attr('aria-expanded', String(!expanded));
      details.hidden = expanded;

    },
  );

  $(document).off('click.homework-main-view', adminViewLink).on('click.homework-main-view', adminViewLink, function onViewClick(event) {
    const nonPrimaryPointer = typeof event.button === 'number' && event.button !== 0;
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || nonPrimaryPointer) return;
    event.preventDefault();
    if (this.classList.contains('is-active')) return;
    void loadHomeworkView(this.href, { restoreFocus: document.activeElement === this });
  });

  $(window).off('popstate.homework-main').on('popstate.homework-main', () => {
    if (!window.location.pathname.endsWith('/homework')) return;
    void loadHomeworkView(window.location.href, { pushHistory: false });
  });

  $(document).off('input.homework-roster', '[data-homework-roster-search]').on('input.homework-roster', '[data-homework-roster-search]', function onRosterSearch() {
    rosterState.search = this.value;
    refreshRoster();
  });
  $(document).off('click.homework-roster', '[data-homework-roster-filter]').on('click.homework-roster', '[data-homework-roster-filter]', function onRosterFilter() {
    rosterState.filter = this.dataset.homeworkRosterFilter;
    refreshRoster();
  });
  $(document).off('click.homework-roster-clear', '[data-homework-clear-filters]').on('click.homework-roster-clear', '[data-homework-clear-filters]', () => {
    rosterState.search = '';
    rosterState.filter = 'all';
    refreshRoster();
    document.querySelector('[data-homework-roster-search]')?.focus();
  });
  $(document).off('input.homework-student', '[data-homework-student-search]').on('input.homework-student', '[data-homework-student-search]', function onStudentSearch() {
    studentState.search = this.value;
    refreshStudent();
  });
  $(document).off('click.homework-student-view', '[data-homework-student-view]').on('click.homework-student-view', '[data-homework-student-view]', function onStudentView() {
    studentState.view = this.dataset.homeworkStudentView;
    refreshStudent();
  });
  $(document).off('click.homework-student-clear', '[data-homework-student-clear]').on('click.homework-student-clear', '[data-homework-student-clear]', () => {
    studentState.search = '';
    const input = document.querySelector('[data-homework-student-search]');
    if (input) { input.value = ''; input.focus(); }
    refreshStudent();
  });
  refreshRoster();
  refreshStudent();
});

export default page;
