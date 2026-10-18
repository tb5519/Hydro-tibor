import type * as Monaco from 'monaco-editor';
import { useSyncExternalStore } from 'react';
import Notification from 'vj/components/notification';
import { request } from 'vj/utils';

export type ScratchpadBuiltinThemeId = 'cloud' | 'mist' | 'sand' | 'ocean';
export type ScratchpadThemeId = ScratchpadBuiltinThemeId | `badge:${number}`;

export interface ThemePalette {
  surface: string;
  muted: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  selection: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
}

export interface ScratchpadTheme {
  id: ScratchpadThemeId;
  name: string;
  description: string;
  dark: boolean;
  palette: ThemePalette;
  badgeId?: number;
  badgeTitle?: string;
  expiresAt?: string | null;
  version?: string;
  overlay?: number;
  assets?: ScratchpadThemeAsset[];
  slots?: Partial<Record<ScratchpadSkinSlot, ScratchpadThemeSlot>>;
  controls?: Partial<Record<ScratchpadControlKey, ScratchpadControlImage>>;
  posterAssetId?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
}

export type ScratchpadSkinSlot = 'background' | 'toolbar' | 'editor' | 'panel' | 'runButton' | 'submitButton' | 'corner';
export interface ScratchpadThemeAsset {
  id: string;
  name?: string;
  type: string;
  url: string;
}
export interface ScratchpadThemeSlot {
  assetId: string;
  fit: 'cover' | 'contain' | 'tile' | 'stretch';
  position?: string;
}

export const SCRATCHPAD_CONTROL_KEYS = [
  'run', 'submit', 'pretestTab', 'recordsTab', 'pretestTitle', 'recordsTitle', 'inputTitle', 'outputTitle',
  'theme', 'language', 'close', 'problemTab', 'settingsTab', 'recordStatus', 'recordMemory', 'recordTime', 'recordDate',
  'emptyRecords', 'emptyRecordsHint', 'emptyOutput', 'inputPlaceholder',
] as const;
export type ScratchpadControlKey = typeof SCRATCHPAD_CONTROL_KEYS[number];
export interface ScratchpadControlImage {
  assetId: string;
  width: number;
  height: number;
  hoverAssetId?: string;
  activeAssetId?: string;
}

export const SCRATCHPAD_THEMES: ScratchpadTheme[] = [
  {
    id: 'cloud', name: '云白', description: '清透蓝白', dark: false,
    palette: {
      surface: '#ffffff', muted: '#f6f8fc', border: '#e0e7f1', borderStrong: '#bfcee4',
      text: '#22304a', textMuted: '#63728a', accent: '#3568e8', accentSoft: '#edf3ff',
      selection: '#dbe7ff', comment: '#63728a', keyword: '#6b54c1', string: '#247663', number: '#a86528',
    },
  },
  {
    id: 'mist', name: '雾青', description: '柔和青绿', dark: false,
    palette: {
      surface: '#f7fbf9', muted: '#eef5f2', border: '#d7e5de', borderStrong: '#b5cdc1',
      text: '#2d4740', textMuted: '#597267', accent: '#347d69', accentSoft: '#e2f0e9',
      selection: '#cce6d9', comment: '#597267', keyword: '#6a60a1', string: '#387754', number: '#9b632f',
    },
  },
  {
    id: 'sand', name: '暖砂', description: '温润米色', dark: false,
    palette: {
      surface: '#fffcf5', muted: '#f6f0e5', border: '#e8dfcf', borderStrong: '#d5c5ab',
      text: '#4b443a', textMuted: '#7d705e', accent: '#976f3c', accentSoft: '#f3e8d5',
      selection: '#eddbb9', comment: '#7d705e', keyword: '#846391', string: '#657536', number: '#a26132',
    },
  },
  {
    id: 'ocean', name: '深海', description: '静谧深蓝', dark: true,
    palette: {
      surface: '#182332', muted: '#1e2c3e', border: '#2d3e54', borderStrong: '#425a77',
      text: '#dce6f3', textMuted: '#99abc2', accent: '#729eed', accentSoft: '#283e5b',
      selection: '#344f74', comment: '#8194ad', keyword: '#c2a5ee', string: '#9bc6ae', number: '#e7bd85',
    },
  },
];

export function getScratchpadTheme(id: unknown): ScratchpadTheme {
  return SCRATCHPAD_THEMES.find((theme) => theme.id === id)
    || catalogForAccount()?.themes.find((theme) => theme.id === id && isUnexpired(theme))
    || SCRATCHPAD_THEMES[0];
}

export function scratchpadSkinAsset(theme: ScratchpadTheme, slot: ScratchpadSkinSlot): ScratchpadThemeAsset | undefined {
  const assignment = theme.slots?.[slot];
  return assignment && theme.assets?.find((asset) => asset.id === assignment.assetId);
}

function rgba(hex: string, alpha: number) {
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${rgb.join(',')},${alpha})`;
}

function cssAssetUrl(url: string) {
  // JSON quoting also escapes quotes and control characters in uploaded names.
  return `url(${JSON.stringify(url)})`;
}

export function scratchpadThemeVariables(theme: ScratchpadTheme): Record<string, string> {
  const { palette: p } = theme;
  const variables: Record<string, string> = {
    '--ui-v2-surface': p.surface,
    '--ui-v2-surface-muted': p.muted,
    '--ui-v2-border': p.border,
    '--ui-v2-border-strong': p.borderStrong,
    '--ui-v2-text': p.text,
    '--ui-v2-text-muted': p.textMuted,
    '--ui-v2-accent': p.accent,
    '--ui-v2-accent-soft': p.accentSoft,
    '--separator-border': p.border,
    '--focus-border': p.accent,
    '--scratchpad-color-scheme': theme.dark ? 'dark' : 'light',
    '--scratchpad-on-accent': theme.dark ? '#14243b' : '#ffffff',
  };
  if (theme.badgeId) {
    // A readable scrim stays under live code and labels, never over controls.
    const overlay = Math.max(0.35, Math.min(0.98, Number(theme.overlay) || 0.84));
    variables['--scratchpad-skin-veil'] = rgba(p.surface, overlay);
    variables['--scratchpad-skin-panel-veil'] = rgba(p.surface, Math.max(0.84, overlay));
    variables['--scratchpad-skin-toolbar-veil'] = rgba(p.surface, 0.83);
    variables['--scratchpad-skin-button-veil'] = rgba(p.surface, 0.56);
    for (const slot of ['toolbar', 'editor', 'panel', 'runButton', 'submitButton', 'corner'] as ScratchpadSkinSlot[]) {
      const asset = scratchpadSkinAsset(theme, slot);
      const mapping = theme.slots?.[slot];
      const prefix = `--scratchpad-skin-${slot}`;
      variables[`${prefix}-image`] = asset?.type.startsWith('image/') ? cssAssetUrl(asset.url) : 'none';
      variables[`${prefix}-size`] = mapping?.fit === 'stretch' ? '100% 100%' : mapping?.fit === 'tile' ? 'auto' : mapping?.fit || 'cover';
      variables[`${prefix}-repeat`] = mapping?.fit === 'tile' ? 'repeat' : 'no-repeat';
      variables[`${prefix}-position`] = mapping?.position || 'center';
    }
  }
  return variables;
}

export function scratchpadMonacoTheme(theme: ScratchpadTheme): Monaco.editor.IStandaloneThemeData {
  const { palette: p } = theme;
  return {
    base: theme.dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: p.text.slice(1) },
      { token: 'comment', foreground: p.comment.slice(1), fontStyle: 'italic' },
      { token: 'keyword', foreground: p.keyword.slice(1) },
      { token: 'string', foreground: p.string.slice(1) },
      { token: 'number', foreground: p.number.slice(1) },
      { token: 'type', foreground: p.accent.slice(1) },
    ],
    colors: {
      'editor.background': theme.badgeId ? '#00000000' : p.surface,
      'editor.foreground': p.text,
      'editor.lineHighlightBackground': p.muted,
      'editorLineNumber.foreground': p.comment,
      'editorLineNumber.activeForeground': p.textMuted,
      'editorCursor.foreground': p.accent,
      'editor.selectionBackground': p.selection,
      'editor.inactiveSelectionBackground': `${p.selection}99`,
      'editor.selectionHighlightBackground': `${p.selection}66`,
      'editorIndentGuide.background1': p.border,
      'editorIndentGuide.activeBackground1': p.borderStrong,
      'editorGutter.background': theme.badgeId ? '#00000000' : p.surface,
      'editorWhitespace.foreground': p.borderStrong,
      'editorWidget.background': p.muted,
      'editorWidget.border': p.border,
      'editorSuggestWidget.background': p.surface,
      'editorSuggestWidget.border': p.border,
      'editorSuggestWidget.foreground': p.text,
      'editorSuggestWidget.selectedBackground': p.accentSoft,
      'editorHoverWidget.background': p.muted,
      'editorHoverWidget.foreground': p.text,
      'editorHoverWidget.border': p.border,
      'input.background': p.surface,
      'input.foreground': p.text,
      'input.border': p.border,
      focusBorder: p.accent,
      'list.activeSelectionBackground': p.accentSoft,
      'list.activeSelectionForeground': p.text,
      'list.hoverBackground': p.muted,
      'scrollbarSlider.background': `${p.textMuted}33`,
      'scrollbarSlider.hoverBackground': `${p.textMuted}55`,
      'scrollbarSlider.activeBackground': `${p.textMuted}77`,
      'minimap.background': theme.badgeId ? '#00000000' : p.surface,
      // Without an explicit color Monaco paints this canvas from the token
      // registry, which strips alpha and leaves a black gutter beside artwork.
      'editorOverviewRuler.background': theme.badgeId ? '#00000000' : p.surface,
    },
  };
}

export function scratchpadThemeStorageKey(uid: unknown, domainScope = ''): string {
  return domainScope ? `scratchpad/theme/v2/${encodeURIComponent(domainScope)}/${uid || 'guest'}`
    : `scratchpad/theme/v1/${uid || 'guest'}`;
}

interface ThemeCatalog {
  themes: ScratchpadTheme[];
  choices: ScratchpadTheme[];
  fallback: ScratchpadBuiltinThemeId;
  clockOffset: number;
}
const themeEvent = 'hydro:scratchpad-theme';
export const SCRATCHPAD_THEME_PICKER_EVENT = 'hydro:open-scratchpad-themes';
const memory = new Map<string, ScratchpadThemeId>();
const catalogs = new Map<string, ThemeCatalog>();
const fetches = new Map<string, Promise<boolean>>();
const pendingSelection = new Map<string, ScratchpadThemeId>();
const saveQueues = new Map<string, Promise<boolean>>();
const saveRevisions = new Map<string, number>();
let subscribers = 0;
let pollTimer: number;
let expiryTimer: number;

function accountId(): number {
  return typeof UserContext === 'undefined' ? 0 : Number(UserContext._id) || 0;
}

function workspaceEndpoint(): string {
  return typeof UiContext === 'undefined' ? '' : UiContext.codeEditorThemesUrl || '';
}

function storageKey() {
  return scratchpadThemeStorageKey(accountId(), workspaceEndpoint());
}

function catalogForAccount() {
  return catalogs.get(storageKey());
}

function isBuiltin(value: unknown): value is ScratchpadBuiltinThemeId {
  return SCRATCHPAD_THEMES.some((theme) => theme.id === value);
}

function isUnexpired(theme: ScratchpadTheme, catalog = catalogForAccount()) {
  return !theme.expiresAt || Date.parse(theme.expiresAt) > Date.now() + (catalog?.clockOffset || 0);
}

function fallbackTheme(): ScratchpadTheme {
  const id = catalogForAccount()?.fallback || (accountId() && UserContext.scratchpadTheme);
  return SCRATCHPAD_THEMES.find((theme) => theme.id === id) || SCRATCHPAD_THEMES[0];
}

function isAvailable(id: unknown): id is ScratchpadThemeId {
  return isBuiltin(id) || !!catalogForAccount()?.themes.some((theme) => theme.id === id && isUnexpired(theme));
}

function emit() {
  window.dispatchEvent(new Event(themeEvent));
}

function remember(id: ScratchpadThemeId) {
  memory.set(storageKey(), id);
  try {
    window.localStorage.setItem(storageKey(), id);
  } catch (e) { /* Theme changes still work when browser storage is unavailable. */ }
}

export function currentScratchpadTheme(): ScratchpadTheme {
  const id = memory.get(storageKey());
  if (id) return isAvailable(id) ? getScratchpadTheme(id) : fallbackTheme();
  // Custom IDs in local storage never establish badge ownership. The first
  // server catalog must verify the selection before any artwork is applied.
  if (accountId() && isBuiltin(UserContext.scratchpadTheme)) return getScratchpadTheme(UserContext.scratchpadTheme);
  try {
    const stored = window.localStorage.getItem(storageKey());
    return isBuiltin(stored) ? getScratchpadTheme(stored) : fallbackTheme();
  } catch (e) {
    return fallbackTheme();
  }
}

export function availableScratchpadThemes(): ScratchpadTheme[] {
  return catalogForAccount()?.choices || SCRATCHPAD_THEMES;
}

function safeUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f]/.test(value)) return false;
  try {
    return ['https:', 'http:'].includes(new URL(value, window.location.href).protocol);
  } catch (e) {
    return false;
  }
}

function normalizeTheme(value: any): ScratchpadTheme | null {
  if (!value || !/^badge:[1-9]\d*$/.test(value.id) || Number(value.badgeId) !== Number(value.id.slice(6))) return null;
  if (value.expiresAt && !Number.isFinite(Date.parse(value.expiresAt))) return null;
  const base = SCRATCHPAD_THEMES.find((theme) => theme.id === value.base) || SCRATCHPAD_THEMES[3];
  const palette = { ...base.palette };
  for (const key of Object.keys(palette)) {
    if (/^#[\da-f]{6}$/i.test(value.palette?.[key])) palette[key] = value.palette[key];
  }
  const assets: ScratchpadThemeAsset[] = Array.isArray(value.assets) ? value.assets
    .filter((asset) => asset && typeof asset.id === 'string' && safeUrl(asset.url)
      && /^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm))$/.test(asset.type))
    .map((asset) => ({ id: asset.id, url: asset.url, name: asset.name, type: asset.type })) : [];
  const slots: ScratchpadTheme['slots'] = {};
  for (const slot of ['background', 'toolbar', 'editor', 'panel', 'runButton', 'submitButton', 'corner'] as ScratchpadSkinSlot[]) {
    const assignment = value.slots?.[slot];
    const asset = assets.find((item) => item.id === assignment?.assetId);
    if (!asset || (slot !== 'background' && !asset.type.startsWith('image/'))) continue;
    slots[slot] = {
      assetId: asset.id,
      fit: ['cover', 'contain', 'tile', 'stretch'].includes(assignment.fit) ? assignment.fit : 'cover',
      position: typeof assignment.position === 'string' && /^(left|right|top|bottom|center|\d{1,3}%)( (left|right|top|bottom|center|\d{1,3}%))?$/.test(assignment.position)
        ? assignment.position : 'center',
    };
  }
  const controls: ScratchpadTheme['controls'] = {};
  for (const key of SCRATCHPAD_CONTROL_KEYS) {
    const assignment = value.controls?.[key];
    const asset = assets.find((item) => item.id === assignment?.assetId && item.type.startsWith('image/'));
    if (!asset) continue;
    const imageId = (id: unknown) => assets.find((item) => item.id === id && item.type.startsWith('image/'))?.id;
    controls[key] = {
      assetId: asset.id,
      width: Math.max(16, Math.min(320, Number(assignment.width) || 120)),
      height: Math.max(16, Math.min(120, Number(assignment.height) || 40)),
      hoverAssetId: imageId(assignment.hoverAssetId),
      activeAssetId: imageId(assignment.activeAssetId),
    };
  }
  return {
    id: value.id, badgeId: Number(value.badgeId), name: String(value.name || value.badgeTitle || '徽章主题').slice(0, 80),
    description: String(value.badgeTitle || '').slice(0, 80), badgeTitle: String(value.badgeTitle || '').slice(0, 80),
    dark: base.dark, palette, expiresAt: value.expiresAt || null, assets, slots, controls,
    overlay: Math.max(0.35, Math.min(0.98, Number(value.overlay) || 0.84)),
    posterAssetId: assets.some((asset) => asset.id === value.posterAssetId && asset.type.startsWith('image/')) ? value.posterAssetId : undefined,
    version: String(value.version || ''),
    thumbnailUrl: safeUrl(value.thumbnailUrl) ? value.thumbnailUrl
      : assets.find((asset) => asset.id === value.thumbnailAssetId && asset.type.startsWith('image/'))?.url,
    previewUrl: safeUrl(value.previewUrl) ? value.previewUrl
      : assets.find((asset) => asset.id === value.previewAssetId && asset.type.startsWith('image/'))?.url,
  };
}

function scheduleExpiry() {
  window.clearTimeout(expiryTimer);
  const catalog = catalogForAccount();
  if (!catalog) return;
  const deadlines = catalog.themes.filter((theme) => theme.expiresAt && isUnexpired(theme, catalog))
    .map((theme) => Date.parse(theme.expiresAt!) - Date.now() - catalog.clockOffset);
  if (!deadlines.length) return;
  expiryTimer = window.setTimeout(() => {
    const active = catalogForAccount();
    if (!active) return;
    active.choices = [...SCRATCHPAD_THEMES, ...active.themes.filter((theme) => isUnexpired(theme, active))];
    const id = memory.get(storageKey());
    if (id && !isAvailable(id)) remember(fallbackTheme().id);
    emit();
    scheduleExpiry();
    void refreshScratchpadThemes();
  }, Math.min(2147483647, Math.max(1, Math.min(...deadlines) + 20)));
}

function applyCatalog(data: any, applySelection = true) {
  if (!data || !Array.isArray(data.themes)) return false;
  const now = typeof data.serverNow === 'number' ? data.serverNow : Date.parse(data.serverNow);
  const catalog: ThemeCatalog = {
    themes: data.themes.map(normalizeTheme).filter(Boolean), choices: [],
    fallback: isBuiltin(data.fallback) ? data.fallback : (isBuiltin(UserContext.scratchpadTheme) ? UserContext.scratchpadTheme : 'cloud'),
    clockOffset: Number.isFinite(now) ? now - Date.now() : 0,
  };
  catalog.choices = [...SCRATCHPAD_THEMES, ...catalog.themes.filter((theme) => isUnexpired(theme, catalog))];
  catalogs.set(storageKey(), catalog);
  const pending = pendingSelection.get(storageKey());
  if (applySelection && !pending) remember(isAvailable(data.selectedId) ? data.selectedId : catalog.fallback);
  else {
    const id = memory.get(storageKey());
    if (id && !isAvailable(id)) remember(catalog.fallback);
  }
  scheduleExpiry();
  emit();
  return true;
}

/** Permissions are never restored from a cached manifest or a saved theme ID. */
export function refreshScratchpadThemes(): Promise<boolean> {
  const endpoint = workspaceEndpoint();
  if (!accountId() || !endpoint) return Promise.resolve(false);
  const key = storageKey();
  if (fetches.has(key)) return fetches.get(key)!;
  const revision = saveRevisions.get(key) || 0;
  const job = Promise.resolve().then(async () => {
    try {
      const data = await request.get(endpoint);
      // An older GET cannot replace a catalog/version that was returned by a
      // more recent verified selection, nor undo a selection still saving.
      if (storageKey() !== key || (saveRevisions.get(key) || 0) !== revision) return false;
      return applyCatalog(data);
    } catch (e) {
      // Keep the last verified theme only until its known expiry. An offline
      // response cannot unlock another badge or extend an existing deadline.
      return false;
    } finally {
      fetches.delete(key);
    }
  });
  fetches.set(key, job);
  return job;
}

export function selectScratchpadTheme(id: ScratchpadThemeId): Promise<boolean> {
  if (!isAvailable(id)) return Promise.resolve(false);
  const key = storageKey();
  const builtin = isBuiltin(id);
  if (builtin) {
    remember(id);
    emit();
  }
  const uid = accountId();
  if (!uid) return Promise.resolve(true);
  const endpoint = workspaceEndpoint();
  const legacyEndpoint = typeof UiContext === 'undefined' ? '' : UiContext.scratchpadThemePreferenceUrl;
  const revision = (saveRevisions.get(key) || 0) + 1;
  saveRevisions.set(key, revision);
  pendingSelection.set(key, id);
  // Serialize writes and skip superseded queued choices. A slow selection of
  // one skin cannot overwrite a newer theme or another student's account.
  const saved = (saveQueues.get(key) || Promise.resolve(true)).then(async () => {
    if (storageKey() !== key || saveRevisions.get(key) !== revision) {
      if (saveRevisions.get(key) === revision) pendingSelection.delete(key);
      return false;
    }
    try {
      if (!endpoint && (!legacyEndpoint || !builtin)) throw new Error('Preference endpoint unavailable');
      const data = await request.post(endpoint || legacyEndpoint, endpoint ? { id, operation: 'select' } : { scratchpadTheme: id });
      if (storageKey() !== key || saveRevisions.get(key) !== revision) {
        if (saveRevisions.get(key) === revision) pendingSelection.delete(key);
        return false;
      }
      pendingSelection.delete(key);
      if (endpoint) {
        if (!applyCatalog(data)) throw new Error('Theme verification unavailable');
        // A badge may have expired between opening the menu and saving.
        return currentScratchpadTheme().id === id;
      }
      UserContext.scratchpadTheme = id;
      return true;
    } catch (e) {
      if (storageKey() === key && saveRevisions.get(key) === revision) {
        pendingSelection.delete(key);
        if (!builtin) {
          remember(fallbackTheme().id);
          emit();
          void refreshScratchpadThemes();
          Notification.error('该徽章主题暂时无法使用，已保留基础主题。请刷新后重试。', 6000);
        } else Notification.error('主题已在当前页面应用，但未能保存到账号。请重新选择该主题重试。', 6000);
      }
      return false;
    }
  });
  saveQueues.set(key, saved);
  return saved;
}

function onRefresh() {
  if (window.document.visibilityState !== 'hidden') void refreshScratchpadThemes();
}

export function subscribeScratchpadTheme(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== storageKey()) return;
    if (isBuiltin(event.newValue)) memory.set(storageKey(), event.newValue);
    else if (!workspaceEndpoint()) memory.delete(storageKey());
    else void refreshScratchpadThemes();
    listener();
  };
  window.addEventListener(themeEvent, listener);
  window.addEventListener('storage', onStorage);
  subscribers += 1;
  if (subscribers === 1) {
    window.addEventListener('focus', onRefresh);
    window.addEventListener('online', onRefresh);
    window.document.addEventListener('visibilitychange', onRefresh);
    pollTimer = window.setInterval(onRefresh, 60000);
    void refreshScratchpadThemes();
  }
  return () => {
    window.removeEventListener(themeEvent, listener);
    window.removeEventListener('storage', onStorage);
    subscribers -= 1;
    if (!subscribers) {
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('online', onRefresh);
      window.document.removeEventListener('visibilitychange', onRefresh);
      window.clearInterval(pollTimer);
    }
  };
}

export function useScratchpadTheme(): ScratchpadTheme {
  return useSyncExternalStore(subscribeScratchpadTheme, currentScratchpadTheme, () => SCRATCHPAD_THEMES[0]);
}

export function useScratchpadThemes(): ScratchpadTheme[] {
  return useSyncExternalStore(subscribeScratchpadTheme, availableScratchpadThemes, () => SCRATCHPAD_THEMES);
}

export function scratchpadMonacoThemeName(theme: ScratchpadTheme): string {
  // Monaco rejects colons and underscores even though a catalog ID may contain
  // them. Keep its internal name separate from the server's badge identifier.
  return `hydro-scratchpad-${theme.id.replace(/[^a-z0-9-]/gi, '-')}${theme.badgeId ? `-${String(theme.version).replace(/[^a-z0-9-]/gi, '-')}` : ''}`;
}

export function attachScratchpadMonacoTheme(monaco: typeof Monaco, restoreTheme: () => string): () => void {
  for (const theme of SCRATCHPAD_THEMES) {
    monaco.editor.defineTheme(scratchpadMonacoThemeName(theme), scratchpadMonacoTheme(theme));
  }
  const apply = () => {
    const theme = currentScratchpadTheme();
    if (theme.badgeId) monaco.editor.defineTheme(scratchpadMonacoThemeName(theme), scratchpadMonacoTheme(theme));
    monaco.editor.setTheme(scratchpadMonacoThemeName(theme));
  };
  apply();
  const unsubscribe = subscribeScratchpadTheme(apply);
  return () => {
    unsubscribe();
    monaco.editor.setTheme(restoreTheme());
  };
}
