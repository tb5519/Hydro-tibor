import $ from 'jquery';
import _ from 'lodash';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { i18n, request } from 'vj/utils';
import { slideDown, slideUp } from 'vj/utils/slide';

type SectionState = 'expanded' | 'collapsed';

let drawerRestoreFocus: HTMLElement | null = null;

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function syncSectionAccessibility($section: JQuery<HTMLElement>, state: SectionState) {
  const expanded = state === 'expanded';
  $section.find('[data-training-section-toggle]').first().attr('aria-expanded', String(expanded));
  $section.find('.training__section__detail').first().attr('aria-hidden', String(!expanded));
}

async function setSectionState(
  $section: JQuery<HTMLElement>,
  state: SectionState,
  animate = true,
) {
  if (!$section.length || $section.hasClass('animating')) return;
  if ($section.hasClass(state)) {
    syncSectionAccessibility($section, state);
    return;
  }

  const $detail = $section.find('.training__section__detail').first();
  const reduceMotion = prefersReducedMotion() || !animate;
  $section.addClass('animating');
  syncSectionAccessibility($section, state);

  try {
    if (state === 'expanded') {
      if (reduceMotion) $detail.show();
      else await slideDown($detail, 200, { opacity: 0 }, { opacity: 1 });
      $section.removeClass('collapsed').addClass('expanded');
    } else {
      if (reduceMotion) $detail.hide();
      else await slideUp($detail, 200, { opacity: 1 }, { opacity: 0 });
      $section.removeClass('expanded').addClass('collapsed');
    }
  } finally {
    $section.removeClass('animating');
  }
}

async function handleSectionToggle(ev: JQuery.ClickEvent<Document>) {
  const $toggle = $(ev.currentTarget);
  const $section = $toggle.closest<HTMLElement>('.training__section');
  const state: SectionState = $toggle.attr('aria-expanded') === 'true' ? 'collapsed' : 'expanded';
  await setSectionState($section, state);
}

async function setAllSections(state: SectionState) {
  const tasks = $('.training__section').get().map((section) => (
    setSectionState($(section), state)
  ));
  await Promise.all(tasks);
}

function setActiveOutline(hash: string) {
  $('#menu-item-training_detail > ul > li > a[href^="#"]').each((index, link) => {
    $(link).toggleClass('is-current', $(link).attr('href') === hash);
  });
}

async function revealAndScroll(hash: string, smooth = true) {
  if (!hash.startsWith('#node-')) return;
  const heading = document.getElementById(hash.slice(1));
  if (!heading) return;
  const $section = $(heading).closest<HTMLElement>('.training__section');
  await setSectionState($section, 'expanded');
  heading.scrollIntoView({
    behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto',
    block: 'start',
  });
  setActiveOutline(hash);
}

async function handleSectionLink(ev: MouseEvent) {
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
  const target = ev.target instanceof Element ? ev.target : null;
  const link = target?.closest<HTMLAnchorElement>(
    '[data-training-section-link], [data-training-prerequisite-link], #menu-item-training_detail > ul > li > a[href^="#"]',
  );
  if (!link) return;
  const hash = link.hash;
  if (!hash.startsWith('#node-')) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (window.location.hash !== hash) {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }
  await revealAndScroll(hash);
}

async function handleHashChange() {
  await revealAndScroll(window.location.hash, false);
}

function initializeSections() {
  $('.training__section').each((index, section) => {
    const $section = $(section);
    const state: SectionState = $section.hasClass('expanded') ? 'expanded' : 'collapsed';
    $section.find('.training__section__detail').first().toggle(state === 'expanded');
    syncSectionAccessibility($section, state);
  });

  const $preferredSection = $('[data-training-section-state="progress"]').first().length
    ? $('[data-training-section-state="progress"]').first()
    : $('[data-training-section-state="open"]').first();
  const $fallbackSection = $preferredSection.length ? $preferredSection : $('.training__section').first();
  const preferredHeadingId = $fallbackSection.find('[data-heading]').first().attr('id');
  if (preferredHeadingId) $('[data-training-section-link]').attr('href', `#${preferredHeadingId}`);
}

function initializeDescription() {
  $('[data-training-description]').each((index, element) => {
    const $section = $(element);
    const content = $section.find<HTMLElement>('[data-training-description-content]').get(0);
    const preview = $section.find<HTMLElement>('[data-training-description-preview]').get(0);
    const $toggle = $section.find<HTMLButtonElement>('[data-training-description-toggle]');
    if (!content || !preview || !$toggle.length) return;
    content.hidden = false;
    const hasLongContent = content.scrollHeight > 110;
    // Use actual instructions for the preview, rather than repeating the document title.
    const excerpt = Array.from(content.querySelectorAll('p, li'))
      .map((item) => item.textContent?.trim()).filter(Boolean).join(' ')
      || content.textContent?.trim() || '';
    preview.textContent = excerpt;
    preview.hidden = !hasLongContent;
    content.hidden = hasLongContent;
    $section.removeClass('is-expanded');
    $toggle.attr('aria-expanded', String(!hasLongContent));
    $toggle.find('[data-training-description-toggle-label]').text(i18n('Expand description'));
    $toggle.prop('hidden', !hasLongContent);
  });
}

function toggleDescription(ev: JQuery.ClickEvent<Document>) {
  const $toggle = $(ev.currentTarget);
  const $section = $toggle.closest('[data-training-description]');
  const expanded = !$section.hasClass('is-expanded');
  $section.toggleClass('is-expanded', expanded);
  $section.find('[data-training-description-content]').prop('hidden', !expanded);
  $section.find('[data-training-description-preview]').prop('hidden', expanded);
  $toggle.attr('aria-expanded', String(expanded));
  $toggle.find('[data-training-description-toggle-label]').text(i18n(expanded ? 'Collapse description' : 'Expand description'));
}

function searchUser() {
  const $drawer = $('[data-training-user-drawer]');
  const val = String($drawer.find('input[name=uid]').val() || '').trim().toLowerCase();
  const group = String($drawer.find('select[name=group]').val() || 'all').toLowerCase();
  const groupUids = group === 'all' ? [] : group.split(',');

  $drawer.find('.enroll_user_menu_item').each((index, element) => {
    const $item = $(element);
    const username = String($item.data('uname') || '').toLowerCase();
    const displayName = String($item.data('displayname') || '').toLowerCase();
    const uid = String($item.data('uid') || '');
    const matchesText = !val || displayName.includes(val) || username.includes(val) || uid === val;
    const matchesGroup = group === 'all' || groupUids.includes(uid);
    const visible = matchesText && matchesGroup;
    $item.toggleClass('is-filtered-out', !visible).attr('aria-hidden', String(!visible));
  });
}

function selectUser(ev: JQuery.SubmitEvent) {
  ev.preventDefault();
  const $visible = $('[data-training-user-drawer] .enroll_user_menu_item:not(.is-filtered-out)');
  if ($visible.length !== 1) return;
  const link = $visible.first().find('a').get(0) as HTMLAnchorElement | undefined;
  if (link) window.location.assign(link.href);
}

function openUserDrawer(ev: JQuery.ClickEvent<Document>) {
  const $drawer = $('[data-training-user-drawer]');
  if (!$drawer.length) return;
  drawerRestoreFocus = ev.currentTarget as HTMLElement;
  $drawer.addClass('is-open').attr('aria-hidden', 'false');
  $('[data-training-user-drawer-open]').attr('aria-expanded', 'true');
  document.body.classList.add('training-user-drawer-open');
  window.setTimeout(() => {
    // The autocomplete replaces the original input with a visible React input.
    const $search = $drawer.find<HTMLInputElement>('[data-training-add-users] input').filter(':visible').first();
    $search.attr('aria-label', i18n('Select students to add')).attr('placeholder', i18n('Select students to add'));
    const search = $search.get(0) || $drawer.find<HTMLInputElement>('input[name=uid]').get(0);
    (search || $drawer.find<HTMLElement>('[role=dialog]').get(0))?.focus();
  }, 0);
}

function closeUserDrawer() {
  const $drawer = $('[data-training-user-drawer]');
  if (!$drawer.hasClass('is-open')) return;
  $drawer.removeClass('is-open').attr('aria-hidden', 'true');
  $('[data-training-user-drawer-open]').attr('aria-expanded', 'false');
  document.body.classList.remove('training-user-drawer-open');
  drawerRestoreFocus?.focus();
  drawerRestoreFocus = null;
}

function handleDrawerKeydown(ev: JQuery.KeyDownEvent<Document>) {
  const $drawer = $('[data-training-user-drawer].is-open');
  if (!$drawer.length) return;
  if (ev.key === 'Escape') {
    ev.preventDefault();
    closeUserDrawer();
    return;
  }
  if (ev.key !== 'Tab') return;

  const $focusable = $drawer.find('.ui-v2-training-detail__drawer-panel')
    .find<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
    .filter(':visible');
  if (!$focusable.length) return;
  const first = $focusable.get(0);
  const last = $focusable.get($focusable.length - 1);
  if (ev.shiftKey && document.activeElement === first) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && document.activeElement === last) {
    ev.preventDefault();
    first.focus();
  }
}

function navigateToUser(ev: JQuery.ClickEvent<Document>) {
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
  ev.preventDefault();
  const destination = new URL((ev.currentTarget as HTMLAnchorElement).href, window.location.href);
  if (window.location.hash.startsWith('#node-')) destination.hash = window.location.hash;
  window.location.assign(destination.href);
}

const page = new NamedPage('training_detail', () => {
  initializeSections();
  initializeDescription();
  if (typeof window.matchMedia === 'function') {
    $('[data-training-outline]').prop('open', !window.matchMedia('(max-width: 1100px)').matches);
  }

  const $document = $(document);
  const $addUsersInput = $('[data-training-add-users-input]');
  const addUsersSelect = $addUsersInput.length
    ? UserSelectAutoComplete.getOrConstruct<UserSelectAutoComplete<true>>(
      $addUsersInput, { multi: true, height: 'auto', joinedOnly: true },
    )
    : null;
  $document.off('.trainingDetail');
  document.removeEventListener('click', handleSectionLink, true);
  document.addEventListener('click', handleSectionLink, true);
  $document.on('click.trainingDetail', '[data-training-section-toggle]', handleSectionToggle);
  $document.on('click.trainingDetail', '[data-training-expand-all]', () => setAllSections('expanded'));
  $document.on('click.trainingDetail', '[data-training-collapse-all]', () => setAllSections('collapsed'));
  $document.on('click.trainingDetail', '[data-training-description-toggle]', toggleDescription);
  $document.on('click.trainingDetail', '[data-training-user-drawer-open]', openUserDrawer);
  $document.on('click.trainingDetail', '[data-training-user-drawer-close]', closeUserDrawer);
  $document.on('click.trainingDetail', '.enroll_user_menu_item > a', navigateToUser);
  $document.on('keydown.trainingDetail', handleDrawerKeydown);
  $document.on('submit.trainingDetail', '[data-training-add-users]', async (ev) => {
    ev.preventDefault();
    const uids = addUsersSelect?.value() || [];
    if (!uids.length) {
      addUsersSelect?.focus();
      return;
    }
    const $form = $(ev.currentTarget);
    const $button = $form.find<HTMLButtonElement>('button[type=submit]');
    $button.prop('disabled', true);
    try {
      await request.post('', { operation: 'add_user', uids: uids.join(',') });
      Notification.success(i18n('Students added.'));
      closeUserDrawer();
      window.location.reload();
    } catch (error) {
      Notification.error([error.message, ...(error.params || [])].join(' '));
      $button.prop('disabled', false);
    }
  });
  $('#searchForm').off('.trainingDetail').on('submit.trainingDetail', selectUser);
  $('[data-training-user-drawer] .search__input')
    .off('.trainingDetail')
    .on('input.trainingDetail', _.debounce(searchUser, 200));
  $('[data-training-user-drawer] select[name=group]')
    .off('.trainingDetail')
    .on('change.trainingDetail', searchUser);
  $(window).off('hashchange.trainingDetail').on('hashchange.trainingDetail', handleHashChange);
  handleHashChange();
});

export default page;
