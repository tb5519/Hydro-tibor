import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('homework_main', () => {
  const refreshCompletedOverflow = (root = document) => {
    $(root).find('[data-homework-completed-line]').each((_, line) => {
      const pills = $(line).find('[data-homework-completed-pills]')[0];
      if (!pills) return;
      $(line).toggleClass('is-overflowing', pills.scrollWidth > pills.clientWidth + 1);
    });
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
      if (!nextSidebar || !nextPanel || requestId !== viewRequestId) return;

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
      window.requestAnimationFrame(() => refreshCompletedOverflow(nextPanel));

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
      if (!expanded) requestAnimationFrame(() => refreshCompletedOverflow());
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

  refreshCompletedOverflow();
  $(window).off('resize.homework-main').on('resize.homework-main', () => refreshCompletedOverflow());
});

export default page;
