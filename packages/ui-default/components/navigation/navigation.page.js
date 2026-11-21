import $ from 'jquery';
import responsiveCutoff from 'vj/breakpoints.json';
import Dropdown from 'vj/components/dropdown/Dropdown';
import Notification from 'vj/components/notification';
import selectUser from 'vj/components/selectUser';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

function lessonExitEvent(name, reason, cancelable = false) {
  let host = window;
  try {
    while (host.parent !== host && host.parent.location.origin === window.location.origin) host = host.parent;
  } catch { /* A different-origin parent cannot own this platform's classroom. */ }
  const event = new host.CustomEvent(name, { cancelable, detail: { reason } });
  return host.dispatchEvent(event) && !event.defaultPrevented;
}

function lessonExitFailed(reason) {
  try { lessonExitEvent('onebyone:lesson-exit-failed', reason); } catch { /* The source page may already be gone. */ }
}

async function handleNavLogoutClick(ev) {
  const $logoutLink = $(ev.currentTarget);
  ev.preventDefault();
  try {
    if (!lessonExitEvent('onebyone:lesson-before-exit', 'logout', true)) return;
    const res = await request.post($logoutLink.attr('href'));
    window.location.href = res.url || window.location.href;
  } catch (error) {
    lessonExitFailed('logout');
    Notification.error(error.message);
  }
}

async function handlerSwitchAccount(ev) {
  ev.preventDefault();
  const target = await selectUser('Hint::icon::switch_account');
  if (!target) return;
  try {
    if (!lessonExitEvent('onebyone:lesson-before-exit', 'switch-account', true)) return;
    const res = await request.get(`/account/${target._id}`);
    if (res.url) window.location.href = res.url;
    else window.location.reload();
  } catch (error) {
    lessonExitFailed('switch-account');
    Notification.error(error.message);
  }
}

let $trigger;
let $menu;
let navItems;

function isMobileLayout() {
  return window.matchMedia?.(`(max-width: ${responsiveCutoff.mobile}px)`).matches
    ?? document.documentElement.clientWidth <= responsiveCutoff.mobile;
}

export function bindDomainSwitcher() {
  const $domainTrigger = $('.domain-switcher');
  const $button = $domainTrigger.find('.domain-switcher__trigger');
  if (!$button.length || $button.data('domain-switcher-bound')) return;
  let $domainMenu = $('#menu-nav-domain');
  if (!$domainMenu.length) {
    // Global dropdown initialization can move the menu into a detached drop
    // before navigation binds; the drop joins the document on its first open.
    $domainMenu = $(Dropdown.get($domainTrigger)?.dropInstance?.drop).find('#menu-nav-domain');
  }
  if (!$domainMenu.length) return;
  $button.data('domain-switcher-bound', true);
  const dropdown = () => (isMobileLayout() ? null : Dropdown.getOrConstruct($domainTrigger)?.dropInstance);
  const syncExpanded = () => $button.attr('aria-expanded', String(isMobileLayout() || !!Dropdown.get($domainTrigger)?.dropInstance?.isOpened()));
  const open = () => {
    dropdown()?.open();
    syncExpanded();
  };
  const close = () => {
    dropdown()?.close();
    syncExpanded();
  };

  $domainTrigger.on('vjDropdownShow', () => {
    // Safari leaves focus on the document when a button is clicked.
    $button[0].focus({ preventScroll: true });
    syncExpanded();
  }).on('vjDropdownHide', syncExpanded);
  // The click-only Drop instance handles pointer/native button activation and
  // outside clicks. Focus and hover must never open the classroom switcher.
  $button.add($domainMenu).on('keydown', (event) => {
    if (event.key === 'Escape' && !isMobileLayout()) {
      event.preventDefault();
      close();
      $button[0].focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
      const links = $domainMenu.find('a[href]').get();
      const current = links.indexOf(document.activeElement);
      const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1)
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links[next]?.focus();
    }
  });
  $button.add($domainMenu).on('focusout', () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (!$domainTrigger[0].contains(active) && !$domainMenu[0].contains(active)) close();
    }, 0);
  });
  const updateViewport = () => {
    if (isMobileLayout()) {
      const instance = Dropdown.get($domainTrigger);
      if (instance) {
        instance.detach();
        $domainMenu.appendTo($domainTrigger);
      }
    } else {
      Dropdown.getOrConstruct($domainTrigger);
    }
    syncExpanded();
  };
  $(window).on('resize.domain-switcher', updateViewport);
  updateViewport();
}

function handleNavbar() {
  if (!navItems?.length) return;
  const main = $trigger[0].parentElement;
  const mobile = isMobileLayout();
  // Restore each link beside its original neighbour, including the active title.
  let next = $trigger[0];
  for (const item of [...navItems].reverse()) {
    if (item.parentElement !== main) {
      item.classList.replace('menu__item', 'nav__list-item');
      item.firstElementChild.classList.replace('menu__link', 'nav__item');
      main.insertBefore(item, next);
    }
    next = item;
  }
  $trigger.hide();
  if (mobile) {
    Dropdown.get($trigger)?.dropInstance?.close();
    return;
  }

  const clipped = () => main.scrollWidth > main.clientWidth
    || navItems.some((item) => {
      const link = item.firstElementChild;
      return item.parentElement === main && link.classList.contains('nav--active') && link.scrollWidth > link.clientWidth;
    });
  if (clipped()) {
    $trigger.show();
    for (const item of [...navItems].reverse()) {
      const link = item.firstElementChild;
      if (link.matches('.nav--active, .nav__logo')) continue;
      item.classList.replace('nav__list-item', 'menu__item');
      link.classList.replace('nav__item', 'menu__link');
      $menu.prepend(item);
      if (!clipped()) break;
    }
  }
  if (!$menu.children().length) {
    $trigger.hide();
    Dropdown.get($trigger)?.dropInstance?.close();
  }
}

const navigationPage = new AutoloadPage('navigationPage', () => {
  if (!document.getElementById('panel') || !document.getElementById('menu')) return;

  bindDomainSwitcher();
  $(document).on('click', '[name="nav_logout"]', handleNavLogoutClick);
  $(document).on('click', '[name="nav_switch_account"]', handlerSwitchAccount);

  let isOpen = false;
  const panel = document.getElementById('panel');
  const $slideoutOverlay = $('.slideout-overlay');
  const $hamburger = $('.header__hamburger .hamburger');
  const PADDING = 200;
  const TOLERANCE = 70;

  function setTranslateX(x) {
    panel.style.transform = x ? `translateX(${x}px)` : '';
  }

  function open() {
    if (!isMobileLayout()) return;
    isOpen = true;
    $('html').addClass('slideout-open');
    setTranslateX(-PADDING);
    $hamburger.addClass('is-active');
    $slideoutOverlay.show();
  }

  // Touch swipe support
  let touchStartX = 0;
  let touchStartY = 0;
  let touchCurrentX = 0;
  let isSwiping = false;
  let isScrolling = false;

  function close() {
    isOpen = false;
    isSwiping = false;
    isScrolling = false;
    panel.style.transition = '';
    setTranslateX(0);
    $hamburger.removeClass('is-active');
    $slideoutOverlay.hide();
    $('html').removeClass('slideout-open');
  }

  panel.addEventListener('touchstart', (e) => {
    if (!isMobileLayout() || e.target.closest('[data-slideout-ignore]')) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchCurrentX = touchStartX;
    isSwiping = false;
    isScrolling = false;
  }, { passive: true });

  panel.addEventListener('touchmove', (e) => {
    if (!isMobileLayout()) return;
    touchCurrentX = e.touches[0].clientX;
    const dx = touchStartX - touchCurrentX;
    if (!isSwiping) {
      if (isScrolling) return;
      const dy = touchStartY - e.touches[0].clientY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < 10 && absDy < 10) return;
      // Lock to scroll if vertical movement dominates
      if (absDy > absDx) {
        isScrolling = true;
        return;
      }
      isSwiping = true;
      if (!isOpen) $slideoutOverlay.show();
      $('html').addClass('slideout-open');
      panel.style.transition = 'none';
    }
    setTranslateX(isOpen
      ? Math.max(-PADDING, Math.min(0, -PADDING - dx))
      : Math.max(-PADDING, Math.min(0, -dx)));
  }, { passive: true });

  panel.addEventListener('touchend', () => {
    if (!isMobileLayout() || !isSwiping) return;
    panel.style.transition = '';
    const dx = touchStartX - touchCurrentX;
    if (isOpen) {
      if (-dx > TOLERANCE) close();
      else open();
    } else {
      if (dx > TOLERANCE) open();
      else close();
    }
    isSwiping = false;
  });

  const dismissMenus = () => {
    close();
    Dropdown.get($('.domain-switcher'))?.dropInstance?.close();
    Dropdown.get($trigger)?.dropInstance?.close();
  };
  $(window).on('blur', dismissMenus);
  document.addEventListener('visibilitychange', () => { if (document.hidden) dismissMenus(); });
  $slideoutOverlay.on('click', close);
  $('.header__hamburger').on('click', () => (isOpen ? close() : open()));
  $(window).on('resize', () => {
    handleNavbar();
    if (!isMobileLayout()) close();
  });
}, () => {
  $trigger = $(tpl`
    <li class="nav__list-item nav_more" data-dropdown-pos="bottom right" data-dropdown-custom-class="nav-more-dropdown" data-dropdown-target="#menu-nav-more">
      <a href="javascript:;" class="nav__item">
        ${i18n('More')} <span class="icon icon-expand_more"></span>
      </a>
    </li>
  `);
  $menu = $('<ol class="dropdown-target menu menu_more" id="menu-nav-more">');
  $trigger.append($menu);
  const $main = $('.nav__list--main');
  navItems = $main.children('.nav__list-item').get();
  $main.append($trigger);
  if (!$main.length) return;
  handleNavbar();
  if (window.ResizeObserver) new ResizeObserver(handleNavbar).observe($main[0]);
  document.fonts?.ready.then(handleNavbar);
});

export default navigationPage;
