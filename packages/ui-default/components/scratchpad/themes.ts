import type * as Monaco from 'monaco-editor';
import { useSyncExternalStore } from 'react';
import Notification from 'vj/components/notification';
import { request } from 'vj/utils';

export type ScratchpadThemeId = 'cloud' | 'mist' | 'sand' | 'ocean';

interface ThemePalette {
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
  return SCRATCHPAD_THEMES.find((theme) => theme.id === id) || SCRATCHPAD_THEMES[0];
}

export function scratchpadThemeVariables(theme: ScratchpadTheme): Record<string, string> {
  const { palette: p } = theme;
  return {
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
      'editor.background': p.surface,
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
      'editorGutter.background': p.surface,
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
      'minimap.background': p.surface,
    },
  };
}

export function scratchpadThemeStorageKey(uid: unknown): string {
  return `scratchpad/theme/v1/${uid || 'guest'}`;
}

const themeEvent = 'hydro:scratchpad-theme';
const memory = new Map<string, ScratchpadThemeId>();
const saveQueues = new Map<string, Promise<boolean>>();
const saveRevisions = new Map<string, number>();
function accountId(): number {
  return typeof UserContext === 'undefined' ? 0 : Number(UserContext._id) || 0;
}

function storageKey() {
  return scratchpadThemeStorageKey(accountId());
}

function isThemeId(value: unknown): value is ScratchpadThemeId {
  return SCRATCHPAD_THEMES.some((theme) => theme.id === value);
}

export function currentScratchpadTheme(): ScratchpadTheme {
  const key = storageKey();
  if (memory.has(key)) return getScratchpadTheme(memory.get(key));
  // The account preference is authoritative on every fresh page, including
  // another browser. Local storage remains a fallback for signed-out users.
  if (accountId() && isThemeId(UserContext.scratchpadTheme)) return getScratchpadTheme(UserContext.scratchpadTheme);
  try {
    return getScratchpadTheme(window.localStorage.getItem(key));
  } catch (e) {
    return SCRATCHPAD_THEMES[0];
  }
}

export function selectScratchpadTheme(id: ScratchpadThemeId): Promise<boolean> {
  const theme = getScratchpadTheme(id);
  const key = storageKey();
  memory.set(key, theme.id);
  try {
    window.localStorage.setItem(key, theme.id);
  } catch (e) { /* Theme changes still work when browser storage is unavailable. */ }
  window.dispatchEvent(new Event(themeEvent));
  const uid = accountId();
  if (!uid) return Promise.resolve(true);
  const endpoint = typeof UiContext === 'undefined' ? '' : UiContext.scratchpadThemePreferenceUrl;
  const revision = (saveRevisions.get(key) || 0) + 1;
  saveRevisions.set(key, revision);
  // Serialize writes and skip superseded queued choices. An older, slower
  // request must finish before the newest choice is sent to the account.
  const saved = (saveQueues.get(key) || Promise.resolve(true)).then(async () => {
    if (accountId() !== uid || saveRevisions.get(key) !== revision) return false;
    try {
      if (!endpoint) throw new Error('Preference endpoint unavailable');
      await request.post(endpoint, { scratchpadTheme: theme.id });
      if (accountId() === uid) UserContext.scratchpadTheme = theme.id;
      return true;
    } catch (e) {
      if (accountId() === uid && saveRevisions.get(key) === revision) {
        Notification.error('主题已在当前页面应用，但未能保存到账号。请重新选择该主题重试。', 6000);
      }
      return false;
    }
  });
  saveQueues.set(key, saved);
  return saved;
}

export function subscribeScratchpadTheme(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== storageKey()) return;
    if (isThemeId(event.newValue)) memory.set(storageKey(), event.newValue);
    else memory.delete(storageKey());
    listener();
  };
  window.addEventListener(themeEvent, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(themeEvent, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useScratchpadTheme(): ScratchpadTheme {
  return useSyncExternalStore(subscribeScratchpadTheme, currentScratchpadTheme, () => SCRATCHPAD_THEMES[0]);
}

export function attachScratchpadMonacoTheme(monaco: typeof Monaco, restoreTheme: () => string): () => void {
  for (const theme of SCRATCHPAD_THEMES) {
    monaco.editor.defineTheme(`hydro-scratchpad-${theme.id}`, scratchpadMonacoTheme(theme));
  }
  const apply = () => monaco.editor.setTheme(`hydro-scratchpad-${currentScratchpadTheme().id}`);
  apply();
  const unsubscribe = subscribeScratchpadTheme(apply);
  return () => {
    unsubscribe();
    monaco.editor.setTheme(restoreTheme());
  };
}
