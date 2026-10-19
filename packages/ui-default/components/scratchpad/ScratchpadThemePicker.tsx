import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScratchpadControlArt } from './ScratchpadControlArt';
import {
  hasScratchpadAdministratorThemeAccess, refreshScratchpadThemes, SCRATCHPAD_THEMES, SCRATCHPAD_THEME_PICKER_EVENT, ScratchpadTheme,
  scratchpadThemeVariables, selectScratchpadTheme, useScratchpadTheme, useScratchpadThemes,
} from './themes';

function PaletteIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
      <path
        d="M17.5 9.6a7.5 7.5 0 1 0-7.5 7.9h1a1.7 1.7 0 0 0 1.3-2.8 1.5 1.5 0 0 1 1.2-2.4h1.5a2.5 2.5 0 0 0 2.5-2.7Z"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <circle cx="6" cy="9" r="1" fill="currentColor" />
      <circle cx="8" cy="5.8" r="1" fill="currentColor" />
      <circle cx="11.8" cy="5.7" r="1" fill="currentColor" />
      <circle cx="14" cy="8.5" r="1" fill="currentColor" />
    </svg>
  );
}

export default function ScratchpadThemePicker({ expanded = false }: { expanded?: boolean }) {
  const theme = useScratchpadTheme();
  const choices = useScratchpadThemes();
  const administratorAccess = hasScratchpadAdministratorThemeAccess();
  const { ready: artReady, art } = useScratchpadControlArt('theme', theme);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(true);
  const [pending, setPending] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = React.useId();
  const variables = scratchpadThemeVariables(theme) as React.CSSProperties;

  useEffect(() => {
    const onOpen = () => {
      if (trigger.current?.getClientRects().length) setOpen(true);
    };
    window.addEventListener(SCRATCHPAD_THEME_PICKER_EVENT, onOpen);
    return () => window.removeEventListener(SCRATCHPAD_THEME_PICKER_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    refreshScratchpadThemes().then((success) => {
      if (!active) return;
      setVerified(success || !UiContext.codeEditorThemesUrl || !UserContext._id);
      setLoading(false);
    });
    return () => { active = false; };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const height = menu.current?.offsetHeight || 410;
      const width = Math.min(320, window.innerWidth - 24);
      const top = rect.bottom + 8 + height <= window.innerHeight - 12
        ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
      setPosition({ top, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)) });
    };
    updatePosition();
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, choices]);

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event: Event) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('focusin', onOutside);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('focusin', onOutside);
    };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const options = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)') || []);
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  };

  const optionButton = (option: ScratchpadTheme) => {
    const selected = theme.id === option.id;
    const until = option.expiresAt && new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai',
    }).format(new Date(option.expiresAt));
    return (
      <button
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        aria-busy={pending === option.id}
        disabled={!!pending}
        tabIndex={selected ? 0 : -1}
        key={option.id}
        className={option.badgeId ? 'scratchpad__theme-badge-option' : undefined}
        onClick={async () => {
          setPending(option.id);
          const success = await selectScratchpadTheme(option.id);
          setPending('');
          if (success) {
            setOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        {option.badgeId ? (
          <span className="scratchpad__theme-thumbnail" style={{ backgroundColor: option.palette.surface }}>
            {option.thumbnailUrl ? <img src={option.thumbnailUrl} alt="" loading="lazy" />
              : <span aria-hidden="true" style={{ color: option.palette.accent }}>✦</span>}
          </span>
        ) : (
          <span className="scratchpad__theme-swatch" style={{ background: option.palette.surface, borderColor: option.palette.borderStrong }}>
            <i style={{ background: option.palette.accent }} />
            <i style={{ background: option.palette.textMuted }} />
            <i style={{ background: option.palette.accent, opacity: 0.45 }} />
          </span>
        )}
        <span className="scratchpad__theme-option-label">
          <strong>{option.name}</strong>
          <small>{option.badgeId ? option.badgeTitle || '徽章专属图片皮肤' : option.description}</small>
          {option.badgeId && <small className="scratchpad__theme-validity">{option.administratorAccess ? '管理员可用' : until ? `有效至 ${until}` : '永久'}</small>}
        </span>
        <span className="scratchpad__theme-check" aria-hidden="true">{pending === option.id ? '…' : selected ? '✓' : ''}</span>
      </button>
    );
  };

  return (
    <div className={`scratchpad__theme-picker${expanded ? ' scratchpad__theme-picker--expanded' : ''}`} style={variables}>
      <button
        type="button"
        className={`scratchpad__theme-trigger${artReady ? ' scratchpad__image-control' : ''}`}
        data-control-art="theme"
        title={`代码区主题：${theme.name}`}
        ref={trigger}
        aria-label={`代码区主题：${theme.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {art}
        <span className={artReady ? 'scratchpad__art-sr-only' : 'scratchpad__control-fallback'}>
          <PaletteIcon />
          <span>{theme.name}</span>
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
            <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && createPortal(
        <div
          ref={menu}
          id={menuId}
          className="scratchpad__theme-menu"
          role="menu"
          aria-label="代码区主题"
          style={{ ...variables, ...position }}
          onKeyDown={onKeyDown}
        >
          <div className="scratchpad__theme-menu-heading">基础主题</div>
          <div className="scratchpad__theme-builtins">{SCRATCHPAD_THEMES.map(optionButton)}</div>
          <div className="scratchpad__theme-menu-heading scratchpad__theme-menu-heading--badges">
            <span>{administratorAccess ? '全部徽章主题' : '我的徽章主题'}</span><small>{loading ? '正在验证' : `${choices.filter((option) => option.badgeId).length} 款`}</small>
          </div>
          {choices.filter((option) => option.badgeId).map(optionButton)}
          {!choices.some((option) => option.badgeId) && (
            <p className="scratchpad__theme-empty">{loading ? '正在加载可用的图片皮肤…'
              : !verified ? '暂时无法验证徽章，请联网后重新打开。'
                : administratorAccess ? '当前域还没有已发布的徽章主题。' : '获得带有专属主题的徽章后，即可在这里选择。'}</p>
          )}
          <div className="scratchpad__theme-menu-footer">{administratorAccess ? '管理员可使用当前域的全部已发布主题' : '持有徽章即可使用，无需佩戴'}</div>
        </div>, document.body,
      )}
    </div>
  );
}
