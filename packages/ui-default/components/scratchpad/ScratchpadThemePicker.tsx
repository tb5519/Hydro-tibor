import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  SCRATCHPAD_THEMES, scratchpadThemeVariables, selectScratchpadTheme, useScratchpadTheme,
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
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = React.useId();
  const variables = scratchpadThemeVariables(theme) as React.CSSProperties;

  useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const height = menu.current?.offsetHeight || 276;
      const top = rect.bottom + 8 + height <= window.innerHeight - 12
        ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
      setPosition({ top, left: Math.max(12, Math.min(rect.right - 230, window.innerWidth - 242)) });
    };
    updatePosition();
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

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
      const options = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') || []);
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  };

  return (
    <div className={`scratchpad__theme-picker${expanded ? ' scratchpad__theme-picker--expanded' : ''}`} style={variables}>
      <button
        type="button"
        className="scratchpad__theme-trigger"
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
        <PaletteIcon />
        <span>{theme.name}</span>
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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
          <div className="scratchpad__theme-menu-heading">代码区主题</div>
          {SCRATCHPAD_THEMES.map((option) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={theme.id === option.id}
              tabIndex={theme.id === option.id ? 0 : -1}
              key={option.id}
              onClick={() => {
                selectScratchpadTheme(option.id);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <span className="scratchpad__theme-swatch" style={{ background: option.palette.surface, borderColor: option.palette.borderStrong }}>
                <i style={{ background: option.palette.accent }} />
                <i style={{ background: option.palette.textMuted }} />
                <i style={{ background: option.palette.accent, opacity: 0.45 }} />
              </span>
              <span className="scratchpad__theme-option-label"><strong>{option.name}</strong><small>{option.description}</small></span>
              <span className="scratchpad__theme-check" aria-hidden="true">{theme.id === option.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>, document.body,
      )}
    </div>
  );
}
