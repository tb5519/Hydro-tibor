import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScratchpadControlArt } from './ScratchpadControlArt';
import {
  hasScratchpadAdministratorThemeAccess, refreshScratchpadThemes, SCRATCHPAD_THEMES, SCRATCHPAD_THEME_PICKER_EVENT,
  ScratchpadBuiltinThemeId, ScratchpadTheme,
  scratchpadThemeVariables, selectScratchpadTheme, useScratchpadTheme, useScratchpadThemes,
} from './themes';

const PALETTE_LABELS: Record<string, string> = { cloud: '明亮', mist: '柔和', sand: '温暖', ocean: '深色' };

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
  const [detailId, setDetailId] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<HTMLButtonElement | null>(null);
  const menuId = React.useId();
  const variables = scratchpadThemeVariables(theme) as React.CSSProperties;
  const detail = choices.find((option) => option.id === detailId && option.badgeId);
  const showPicker = () => {
    setDetailId(theme.badgeId ? theme.id : '');
    setSaveState('idle');
    setOpen(true);
  };

  useEffect(() => {
    const onOpen = () => {
      if (trigger.current?.getClientRects().length) showPicker();
    };
    window.addEventListener(SCRATCHPAD_THEME_PICKER_EVENT, onOpen);
    return () => window.removeEventListener(SCRATCHPAD_THEME_PICKER_EVENT, onOpen);
  }, [theme.id]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    refreshScratchpadThemes().catch(() => false).then((success) => {
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
      const height = Math.min(menu.current?.offsetHeight || 410, window.innerHeight - 24);
      const width = Math.min(360, window.innerWidth - 24);
      const top = rect.bottom + 8 + height <= window.innerHeight - 12
        ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
      setPosition({ top: Math.max(12, Math.min(top, window.innerHeight - height - 12)), left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)) });
    };
    updatePosition();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
    if (menu.current) observer?.observe(menu.current);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, detailId]);

  useLayoutEffect(() => {
    if (!open) return;
    (menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      || menu.current?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [open, detailId]);

  useLayoutEffect(() => {
    if (pending || !pendingFocus.current) return;
    const previous = pendingFocus.current;
    pendingFocus.current = null;
    // Browsers may blur a button when it becomes disabled during the save.
    // Restore that focus only if the student has not moved elsewhere.
    if (open && document.activeElement === document.body && previous.isConnected) previous.focus();
  }, [pending, open]);

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
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const group = (event.target as HTMLElement).closest('[role="radiogroup"]');
      if (!group) return;
      event.preventDefault();
      const options = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'));
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      const step = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + step + options.length) % options.length;
      options[next]?.focus();
    }
  };

  const chooseTheme = async (option: ScratchpadTheme, base?: ScratchpadBuiltinThemeId | 'default', source?: HTMLButtonElement) => {
    if (pending) return;
    if (option.badgeId) setDetailId(option.id);
    setSaveState('idle');
    // Opening the current badge is navigation, not another write to preferences.
    if (option.id === theme.id && base === undefined && option.badgeId) return;
    pendingFocus.current = source || null;
    setPending(base ? `${option.id}:${base}` : option.id);
    let success = false;
    try { success = await selectScratchpadTheme(option.id, base); } catch { /* Keep the last complete theme on failure. */ }
    setPending('');
    setSaveState(success ? 'saved' : 'error');
    if (success && !option.badgeId) {
      setOpen(false);
      trigger.current?.focus();
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
        role="radio"
        aria-checked={selected}
        aria-busy={pending === option.id}
        disabled={!!pending}
        key={option.id}
        className={option.badgeId ? 'scratchpad__theme-badge-option' : undefined}
        onClick={(event) => chooseTheme(option, undefined, event.currentTarget)}
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
        <span className="scratchpad__theme-check" aria-hidden="true">{pending === option.id ? '…' : option.badgeId ? '›' : selected ? '✓' : ''}</span>
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
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : showPicker())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            showPicker();
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
          role="dialog"
          aria-label={detail ? `${detail.name} · 选择配色` : '代码区主题'}
          style={{ ...variables, ...position }}
          onKeyDown={onKeyDown}
        >
          {detail ? (
            <>
              <div className="scratchpad__theme-detail-top">
                <button type="button" className="scratchpad__theme-back" onClick={() => { setDetailId(''); setSaveState('idle'); }}>
                  <span aria-hidden="true">‹</span> 全部主题
                </button>
                <span className="scratchpad__theme-personal">专属你的配色</span>
              </div>
              <div className="scratchpad__theme-detail-title">
                <span className="scratchpad__theme-thumbnail" style={{ backgroundColor: detail.palette.surface }}>
                  {detail.thumbnailUrl ? <img src={detail.thumbnailUrl} alt="" /> : <span aria-hidden="true">✦</span>}
                </span>
                <div><strong>{detail.name}</strong><p>换个配色，让专属主题更合心意</p></div>
              </div>
              <div role="radiogroup" aria-label={`${detail.name}的配色`} className="scratchpad__theme-palettes">
                {SCRATCHPAD_THEMES.map((base) => {
                  const selected = theme.id === detail.id && theme.preferredBase === base.id;
                  return (
                    <button
                      type="button" role="radio" aria-checked={selected} key={base.id}
                      data-theme-palette={base.id} disabled={!!pending}
                      aria-label={`${base.name} · ${PALETTE_LABELS[base.id]}`}
                      className="scratchpad__theme-palette" onClick={(event) => chooseTheme(detail, base.id as ScratchpadBuiltinThemeId, event.currentTarget)}
                    >
                      <span className="scratchpad__theme-palette-preview" style={{ background: base.palette.surface, borderColor: base.palette.border }} aria-hidden="true">
                        <span className="scratchpad__theme-palette-dots"><i /><i /><i /></span>
                        <span className="scratchpad__theme-palette-line" style={{ background: base.palette.keyword, width: '40%' }} />
                        <span className="scratchpad__theme-palette-line" style={{ background: base.palette.string, width: '64%', marginLeft: 9 }} />
                        <span className="scratchpad__theme-palette-line" style={{ background: base.palette.textMuted, width: '48%', marginLeft: 9 }} />
                        <span className="scratchpad__theme-palette-line" style={{ background: base.palette.keyword, width: '30%' }} />
                        <span className="scratchpad__theme-palette-accent" style={{ background: base.palette.accent }} />
                      </span>
                      <span className="scratchpad__theme-palette-label"><strong>{base.name}</strong><small>{PALETTE_LABELS[base.id]}</small>
                        {selected && <span className="scratchpad__theme-palette-check" aria-hidden="true">✓</span>}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button" role="radio" data-theme-palette="default"
                  className="scratchpad__theme-original" aria-checked={theme.id === detail.id && !theme.preferredBase}
                  disabled={!!pending} onClick={(event) => chooseTheme(detail, 'default', event.currentTarget)}
                >
                  <PaletteIcon /><span><strong>主题原配</strong><small>跟随主题设计的原始配色</small></span>
                  {theme.id === detail.id && !theme.preferredBase && <span className="scratchpad__theme-check" aria-hidden="true">✓</span>}
                </button>
              </div>
              <p className="scratchpad__theme-palette-hint">主题图片保持不变，每款主题都记住你的选择</p>
            </>
          ) : (
            <>
              <div className="scratchpad__theme-menu-heading">基础主题</div>
              <div className="scratchpad__theme-options" role="radiogroup" aria-label="编辑器主题">
                <div className="scratchpad__theme-builtins">{SCRATCHPAD_THEMES.map(optionButton)}</div>
                <div className="scratchpad__theme-menu-heading scratchpad__theme-menu-heading--badges">
                  <span>{administratorAccess ? '全部徽章主题' : '我的徽章主题'}</span><small>{loading ? '正在验证' : `${choices.filter((option) => option.badgeId).length} 款`}</small>
                </div>
                {choices.filter((option) => option.badgeId).map(optionButton)}
              </div>
              {!choices.some((option) => option.badgeId) && (
                <p className="scratchpad__theme-empty">{loading ? '正在加载可用的图片皮肤…'
                  : !verified ? '暂时无法验证徽章，请联网后重新打开。'
                    : administratorAccess ? '当前域还没有已发布的徽章主题。' : '获得带有专属主题的徽章后，即可在这里选择。'}</p>
              )}
            </>
          )}
          <div className={`scratchpad__theme-menu-footer${saveState === 'error' ? ' scratchpad__theme-menu-footer--error' : ''}`} role="status" aria-live="polite" aria-atomic="true">
            {pending ? (detail ? '正在保存配色，稍等一下…' : '正在准备完整主题…')
              : saveState === 'error' ? '暂时没有保存成功，请再试一次'
                : saveState === 'saved' ? '✓ 已记住，下次打开自动使用'
                  : detail ? '点选即可保存，随时可以换回来'
                    : administratorAccess ? '管理员可使用当前域的全部已发布主题' : '持有徽章即可使用，无需佩戴'}
          </div>
        </div>, document.body,
      )}
    </div>
  );
}
