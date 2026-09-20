import $ from 'jquery';
import responsiveCutoff from 'vj/breakpoints.json';
import Dropdown from 'vj/components/dropdown/Dropdown';
import Notification from 'vj/components/notification';
import selectUser from 'vj/components/selectUser';
import { AutoloadPage } from 'vj/misc/Page';
import { i18n, request, tpl } from 'vj/utils';

async function handleNavLogoutClick(ev) {
  const $logoutLink = $(ev.currentTarget);
  ev.preventDefault();
  try {
    const res = await request.post($logoutLink.attr('href'));
    window.location.href = res.url || window.location.href;
  } catch (error) {
    Notification.error(error.message);
  }
}

async function handlerSwitchAccount(ev) {
  ev.preventDefault();
  const target = await selectUser('Hint::icon::switch_account');
  if (!target) return;
  try {
    const res = await request.get(`/account/${target._id}`);
    if (res.url) window.location.href = res.url;
    else window.location.reload();
  } catch (error) {
    Notification.error(error.message);
  }
}

let $trigger;
let $menu;

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
  const isMobile = () => $(document).width() <= responsiveCutoff.mobile;
  const dropdown = () => (isMobile() ? null : Dropdown.getOrConstruct($domainTrigger)?.dropInstance);
  const syncExpanded = () => $button.attr('aria-expanded', String(isMobile() || !!Dropdown.get($domainTrigger)?.dropInstance?.isOpened()));
  let restoringFocus = false;
  const open = () => {
    dropdown()?.open();
    syncExpanded();
  };
  const close = () => {
    dropdown()?.close();
    syncExpanded();
  };

  $domainTrigger.on('vjDropdownShow vjDropdownHide', syncExpanded);
  $button.on('click', open).on('focus', () => { if (!restoringFocus) open(); });
  $button.add($domainMenu).on('keydown', (event) => {
    if (event.key === 'Escape' && !isMobile()) {
      event.preventDefault();
      close();
      restoringFocus = true;
      $button[0].focus();
      restoringFocus = false;
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
    if (isMobile()) {
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
  let fromHide = false;
  if ($(document).width() <= responsiveCutoff.mobile) {
    $menu.children().each(function () {
      const $ele = $(this);
      $ele.addClass('nav__list-item').removeClass('menu__item');
      $ele.children('a').addClass('nav__item').removeClass('menu__link');
      $ele.insertBefore($trigger, null);
    });
    $trigger.hide();
    return;
  }
  $trigger.show();

  const base = 70;

  let navItems = $('.nav__list--main > .nav__list-item');
  let navItem = navItems.length - 2;
  while (navItem && $('#menu').children('div').height() > base) {
    if (!$(navItems[navItem]).children('a').hasClass('nav--active')) {
      $(navItems[navItem]).removeClass('nav__list-item').addClass('menu__item');
      $(navItems[navItem]).children('a').removeClass('nav__item').addClass('menu__link');
      $menu.prepend($(navItems[navItem]));
    }
    navItem--;
    fromHide = true;
  }

  if (!fromHide && $menu.children().length) {
    while ($('#menu').children('div').height() <= base && $menu.children().length) {
      const $ele = $menu.children().first();
      $ele.addClass('nav__list-item').removeClass('menu__item');
      $ele.children('a').addClass('nav__item').removeClass('menu__link');
      $ele.insertBefore($trigger, null);
    }
  }

  navItems = $('.nav__list--main > .nav__list-item');
  navItem = navItems.length - 2;
  if ($('#menu').children('div').height() > base) {
    while (navItem && $('#menu').children('div').height() > base) {
      if (!$(navItems[navItem]).children('a').hasClass('nav--active')) {
        $(navItems[navItem]).removeClass('nav__list-item').addClass('menu__item');
        $(navItems[navItem]).children('a').removeClass('nav__item').addClass('menu__link');
        $menu.prepend($(navItems[navItem]));
      }
      navItem--;
    }
  }

  if (!$menu.children().length) $trigger.hide();
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

  function isMobileLayout() {
    return $(document).width() <= responsiveCutoff.mobile;
  }

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

  $slideoutOverlay.on('click', close);
  $('.header__hamburger').on('click', () => (isOpen ? close() : open()));
  $(window).on('resize', () => {
    handleNavbar();
    if (!isMobileLayout()) close();
  });
  setInterval(handleNavbar, 3000);
}, () => {
  $trigger = $(tpl`
    <li class="nav__list-item nav_more" data-dropdown-pos="bottom right" data-dropdown-target="#menu-nav-more">
      <a href="javascript:;" class="nav__item">
        ${i18n('More')} <span class="icon icon-expand_more"></span>
      </a>
    </li>
  `);
  $menu = $('<ol class="dropdown-target menu menu_more" id="menu-nav-more">');
  $trigger.append($menu);
  $('.nav__list--main').append($trigger);

  handleNavbar();
});

export default navigationPage;
