import React, { createContext, useContext, useRef, useState } from 'react';
import { isScratchpadThemeImageReady } from './themeAssets';
import type { ScratchpadControlKey, ScratchpadTheme } from './themes';

// Artwork changes the presentation only; the surrounding native control and
// editor tree stay mounted, including when an entitlement expires.
export const ScratchpadArtThemeContext = createContext<ScratchpadTheme | undefined>(undefined);

export function useScratchpadControlArt(control?: ScratchpadControlKey, suppliedTheme?: ScratchpadTheme) {
  const contextTheme = useContext(ScratchpadArtThemeContext);
  const theme = suppliedTheme || contextTheme;
  const assignment = theme?.badgeId && control ? theme.controls?.[control] : undefined;
  const find = (id?: string) => theme?.assets?.find((asset) => asset.id === id && asset.type.startsWith('image/'));
  const base = find(assignment?.assetId);
  const images = base ? [
    { variant: 'base', asset: base },
    { variant: 'hover', asset: find(assignment?.hoverAssetId) },
    { variant: 'active', asset: find(assignment?.activeAssetId) },
  ].filter((image) => image.asset) : [];
  const identity = `${theme?.id}:${theme?.version}:${control}:${images.map((image) => image.asset!.url).join('|')}`;
  const current = useRef(identity);
  current.current = identity;
  const [state, setState] = useState({ identity: '', loaded: [] as string[], failed: [] as string[] });
  const failed = state.identity === identity ? state.failed : [];
  // Prepared themes render every PNG (including hover/active states) on their
  // very first render, rather than each control waiting for its own load event.
  const loaded = images.filter(({ variant, asset }) => !failed.includes(variant)
    && ((state.identity === identity && state.loaded.includes(variant)) || isScratchpadThemeImageReady(asset!.url)))
    .map(({ variant }) => variant);
  const ready = !!base && loaded.includes('base') && !failed.includes('base');
  const settle = (variant: string, success: boolean) => {
    if (current.current !== identity) return;
    setState((previous) => {
      const next = previous.identity === identity ? previous : { identity, loaded: [], failed: [] };
      const field = success ? 'loaded' : 'failed';
      const other = success ? 'failed' : 'loaded';
      if (next[field].includes(variant) && !next[other].includes(variant)) return next;
      return { ...next, [field]: [...next[field].filter((item) => item !== variant), variant], [other]: next[other].filter((item) => item !== variant) };
    });
  };
  const dimensions = assignment ? {
    '--scratchpad-art-width': `${assignment.width}px`,
    '--scratchpad-art-height': `${assignment.height}px`,
  } as React.CSSProperties : undefined;
  const art = assignment && base ? (
    <span
      className="scratchpad__control-art"
      data-ready={ready ? 'true' : undefined}
      data-hover={loaded.includes('hover') && !failed.includes('hover') ? 'true' : undefined}
      data-active={loaded.includes('active') && !failed.includes('active') ? 'true' : undefined}
      aria-hidden="true"
      style={dimensions}
    >
      {images.map(({ variant, asset }) => (
        <img
          key={`${identity}:${variant}`}
          src={asset!.url}
          data-art-variant={variant}
          alt=""
          draggable={false}
          onLoad={() => settle(variant, true)}
          onError={() => settle(variant, false)}
        />
      ))}
    </span>
  ) : null;
  return { ready, art, dimensions };
}

export function ScratchpadControlLabel({ control, children, className = '', fallbackDecoration }: {
  control: ScratchpadControlKey;
  children: React.ReactNode;
  className?: string;
  fallbackDecoration?: React.ReactNode;
}) {
  const { ready, art } = useScratchpadControlArt(control);
  return (
    <>
      {!ready && fallbackDecoration}
      <span className={`scratchpad__image-label ${className}`} data-control-art={control}>
        {art}
        <span className={ready ? 'scratchpad__art-sr-only' : undefined}>{children}</span>
      </span>
    </>
  );
}

export function ScratchpadLanguageArt({ children }: { children: React.ReactNode }) {
  const { ready, art, dimensions } = useScratchpadControlArt('language');
  return (
    <span className={`scratchpad__language-art${ready ? ' scratchpad__language-art--ready' : ''}`} style={ready ? dimensions : undefined}>
      {art}
      {children}
    </span>
  );
}
