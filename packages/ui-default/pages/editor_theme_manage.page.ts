import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';
import { SCRATCHPAD_THEMES, scratchpadReadingStyle, type ThemePalette } from '../components/scratchpad/themes';

type Slot = 'background' | 'toolbar' | 'editor' | 'panel' | 'runButton' | 'submitButton' | 'corner';
type Fit = 'cover' | 'contain' | 'tile' | 'stretch';
type Base = 'cloud' | 'mist' | 'sand' | 'ocean';
interface Asset { id: string; name: string; type: string; url: string }
interface Placement { assetId: string; fit: Fit; position?: string }
interface ImageControl { assetId: string; width: number; height: number; hoverAssetId?: string; activeAssetId?: string }
const controlGroups = {
  工具栏操作: { run: '运行自测', submit: '递交评测', pretestTab: '自测入口', recordsTab: '评测记录入口', theme: '主题入口', language: '语言入口', close: '关闭', problemTab: '题目入口', settingsTab: '设置入口' },
  面板标题: { pretestTitle: '自测标题', recordsTitle: '评测记录标题', inputTitle: '输入标题', outputTitle: '输出标题' },
  记录表头: { recordStatus: '评测结果', recordMemory: '内存', recordTime: '用时', recordDate: '提交时间' },
  空白提示: { emptyRecords: '暂无评测记录', emptyRecordsHint: '提交后查看记录提示', emptyOutput: '等待自测结果提示', inputPlaceholder: '测试数据输入提示' },
};
const controlLabels = Object.assign({}, ...Object.values(controlGroups)) as Record<string, string>;
interface Theme {
  id: string; badgeId?: number; name: string; base: Base; overlay: number;
  palette: Record<string, string>; slots: Partial<Record<Slot, Placement>>; assets: Asset[];
  controls: Record<string, ImageControl>;
  previewAssetId?: string; posterAssetId?: string; thumbnailAssetId?: string; version?: string;
}
const slotLabels: Record<Slot, string> = {
  background: '整体背景', toolbar: '顶部工具栏', editor: '代码面板', panel: '自测与记录',
  runButton: '运行按钮', submitButton: '提交按钮', corner: '透明角饰',
};
const basePalettes = Object.fromEntries(SCRATCHPAD_THEMES.map((theme) => [theme.id, theme.palette])) as Record<Base, ThemePalette>;

export function bindEditorThemeManage() {
  const root = document.querySelector<HTMLElement>('[data-editor-theme-manage]');
  const context = UiContext.editorThemeManage;
  if (!root || !context || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const uploadInput = find<HTMLInputElement>('[data-theme-upload]');
  const form = find<HTMLFormElement>('[data-theme-form]');
  const nameInput = find<HTMLInputElement>('[data-theme-name]');
  const badgeInput = find<HTMLSelectElement>('[data-theme-badge]');
  const baseInput = find<HTMLSelectElement>('[data-theme-base]');
  const overlayInput = find<HTMLInputElement>('[data-theme-overlay]');
  const assetInput = find<HTMLSelectElement>('[data-theme-asset]');
  const fitInput = find<HTMLSelectElement>('[data-theme-fit]');
  const positionInput = find<HTMLSelectElement>('[data-theme-position]');
  const referenceInput = find<HTMLSelectElement>('[data-theme-reference-asset]');
  const posterInput = find<HTMLSelectElement>('[data-theme-poster-asset]');
  const controlInput = find<HTMLSelectElement>('[data-theme-control-select]');
  const controlAssetInput = find<HTMLSelectElement>('[data-theme-control-asset]');
  const controlHoverInput = find<HTMLSelectElement>('[data-theme-control-hover]');
  const controlActiveInput = find<HTMLSelectElement>('[data-theme-control-active]');
  const controlWidthInput = find<HTMLInputElement>('[data-theme-control-width]');
  const controlHeightInput = find<HTMLInputElement>('[data-theme-control-height]');
  const preview = find('[data-theme-preview]');
  const video = find<HTMLVideoElement>('[data-theme-preview-video]');
  const badgeNames = new Map<number, string>();
  const themes = new Map<string, Theme>();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let selected: Theme | null = null;
  let originalThemeId: string | undefined;
  let originalBadgeId: number | undefined;
  let draftId: string | undefined;
  let selectedSlot: Slot = 'background';
  let selectedControl = 'run';
  let previewState = 'empty';
  let busy = false;
  let disposed = false;
  let upload: XMLHttpRequest | null = null;
  let baseline = '';

  const safeUrl = (value: string) => {
    const parsed = new URL(value, window.location.href);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('素材地址无法使用，请重新上传主题包。');
    return parsed.href;
  };
  const endpoint = safeUrl(context.url || window.location.href);
  if (new URL(endpoint).origin !== window.location.origin) throw new Error('主题管理地址无效。');
  const cssUrl = (value: string) => `url(${JSON.stringify(safeUrl(value))})`;
  const message = (text: string, error = false) => {
    const node = find('[data-theme-message]');
    node.textContent = text;
    node.hidden = !text;
    node.classList.toggle('is-error', error);
    node.setAttribute('role', error ? 'alert' : 'status');
  };
  const errorMessage = (result: any) => {
    if (typeof result?.error?.params?.[2] === 'string' && result.error.params[2].trim()) return result.error.params[2];
    const text = result?.error?.message || result?.message;
    return typeof text === 'string' && !/\{\d+\}/.test(text) ? text : '操作没有完成，请检查文件和权限后重试。';
  };
  const normalize = (value: any): Theme => {
    if (!value || !Array.isArray(value.assets) || !value.id) throw new Error('主题资料不完整，请刷新页面后重试。');
    const assets = value.assets.map((asset: any) => {
      if (!asset?.id || typeof asset.name !== 'string' || !/^(image|video)\//.test(asset.type)) throw new Error('主题素材无法读取，请重新上传。');
      return { id: String(asset.id), name: asset.name, type: asset.type, url: safeUrl(asset.url) };
    });
    const slots: Theme['slots'] = {};
    for (const slot of Object.keys(slotLabels) as Slot[]) {
      const mapping = value.slots?.[slot];
      if (!mapping || !assets.some((asset: Asset) => asset.id === mapping.assetId && (slot === 'background' || asset.type.startsWith('image/')))) continue;
      slots[slot] = { assetId: mapping.assetId, fit: ['cover', 'contain', 'tile', 'stretch'].includes(mapping.fit) ? mapping.fit : 'cover', position: mapping.position || 'center' };
    }
    const controls: Theme['controls'] = {};
    const isImage = (id: unknown) => assets.some((asset: Asset) => asset.id === id && asset.type.startsWith('image/'));
    for (const key of Object.keys(controlLabels)) {
      const control = value.controls?.[key];
      if (!control || !isImage(control.assetId)) continue;
      controls[key] = {
        assetId: control.assetId,
        width: Number.isFinite(Number(control.width)) ? Math.max(16, Math.min(320, Number(control.width))) : 120,
        height: Number.isFinite(Number(control.height)) ? Math.max(16, Math.min(120, Number(control.height))) : 40,
        ...(isImage(control.hoverAssetId) ? { hoverAssetId: control.hoverAssetId } : {}),
        ...(isImage(control.activeAssetId) ? { activeAssetId: control.activeAssetId } : {}),
      };
    }
    return {
      ...value, id: String(value.id), name: String(value.name || ''), assets, slots, controls,
      base: Object.hasOwn(basePalettes, value.base) ? value.base : 'ocean',
      overlay: Number.isFinite(Number(value.overlay)) ? Math.max(0.35, Math.min(0.98, Number(value.overlay))) : 0.86,
      palette: Object.fromEntries(Object.entries(value.palette || {}).filter(([, color]) => /^#[\da-f]{6}$/i.test(String(color)))),
    };
  };
  const assetFor = (theme: Theme, id?: string) => theme.assets.find((asset) => asset.id === id);
  const readingStyle = (theme: Theme) => scratchpadReadingStyle({
    badgeId: theme.badgeId || -1, dark: theme.base === 'ocean', overlay: theme.overlay,
    palette: { ...basePalettes[theme.base], ...theme.palette },
  });
  const snapshot = () => selected ? JSON.stringify({ name: selected.name, badgeId: selected.badgeId, base: selected.base, overlay: selected.overlay, palette: selected.palette, slots: selected.slots, controls: selected.controls, previewAssetId: selected.previewAssetId, posterAssetId: selected.posterAssetId }) : '';
  const dirty = () => snapshot() !== baseline;
  const canLeaveDesign = () => !dirty() || window.confirm('当前主题还有未发布的修改。放弃这些修改并继续吗？');
  const badgeTitle = (id?: number) => badgeNames.get(Number(id)) || '请选择关联徽章';
  const setBusy = (value: boolean) => {
    busy = value;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach((node) => { node.disabled = value; });
    badgeInput.disabled = value || !!originalThemeId;
    if (!value) { renderSlot(); renderControl(); }
    find<HTMLButtonElement>('[data-theme-publish]').textContent = value ? '正在处理…' : originalThemeId ? '更新主题' : '发布主题';
  };
  const renderCollection = () => {
    const list = find('[data-theme-list]');
    list.replaceChildren();
    for (const theme of themes.values()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'etm__theme-card';
      button.dataset.themeId = theme.id;
      button.setAttribute('aria-pressed', String(theme.id === originalThemeId));
      const thumbnail = document.createElement('span');
      thumbnail.setAttribute('aria-hidden', 'true');
      thumbnail.textContent = '✦';
      const image = assetFor(theme, theme.thumbnailAssetId) || assetFor(theme, theme.previewAssetId)
        || assetFor(theme, theme.slots.background?.assetId);
      if (image?.type.startsWith('image/')) { thumbnail.style.backgroundImage = cssUrl(image.url); thumbnail.textContent = ''; }
      const title = document.createElement('strong');
      title.textContent = theme.name;
      const detail = document.createElement('small');
      detail.textContent = badgeTitle(theme.badgeId);
      const text = document.createElement('span');
      text.append(title, detail);
      button.append(thumbnail, text);
      button.addEventListener('click', () => { if (!busy && canLeaveDesign()) openDesign(theme, true); });
      list.append(button);
    }
    find('[data-theme-count]').textContent = String(themes.size);
    find('[data-theme-collection-empty]').hidden = themes.size > 0;
  };
  const renderDraftState = () => {
    const state = find('[data-theme-draft-state]');
    state.textContent = dirty() ? '有未发布的修改' : originalThemeId ? '已发布' : '尚未发布';
    state.classList.toggle('is-published', !!originalThemeId && !dirty());
    find('[data-theme-publish-summary]').textContent = selected?.badgeId
      ? `发布后，持有「${badgeTitle(selected.badgeId)}」的学员即可选用。`
      : '选择关联徽章后，即可发布给持有徽章的学员。';
    find('[data-theme-badge-hint]').textContent = selected?.badgeId && themes.has(`badge:${selected.badgeId}`) && `badge:${selected.badgeId}` !== originalThemeId
      ? '这枚徽章已有主题，发布会替换其当前设计。持有徽章的学员将看到新版本。'
      : originalThemeId ? '已发布主题与此徽章绑定。为另一枚徽章设计时，请新建并上传主题包。'
        : '持有有效徽章即可使用，无需佩戴。徽章失效后自动回到基础主题。';
  };
  const paint = (node: HTMLElement, placement?: Placement) => {
    const asset = selected && assetFor(selected, placement?.assetId);
    const region = node.dataset.themeRegion;
    const palette = selected && readingStyle(selected).palette;
    const alpha = region === 'submitButton' ? 0.56 : region === 'toolbar' || region === 'runButton' ? 0.83
      : region === 'panel' ? readingStyle(selected!).overlay : 0;
    const rgb = palette && [1, 3, 5].map((start) => parseInt(palette.surface.slice(start, start + 2), 16));
    const veil = alpha && rgb ? `linear-gradient(rgba(${rgb.join(',')},${alpha}),rgba(${rgb.join(',')},${alpha}))` : '';
    const picture = asset?.type.startsWith('image/') ? cssUrl(asset.url) : 'none';
    node.style.backgroundImage = veil ? `${veil},${picture}` : picture;
    const repeat = placement?.fit === 'tile' ? 'repeat' : 'no-repeat';
    const size = placement?.fit === 'tile' ? 'auto' : placement?.fit === 'stretch' ? '100% 100%' : placement?.fit || 'cover';
    node.style.backgroundRepeat = veil ? `no-repeat,${repeat}` : repeat;
    node.style.backgroundSize = veil ? `100% 100%,${size}` : size;
    node.style.backgroundPosition = veil ? `center,${placement?.position || 'center'}` : placement?.position || 'center';
    if (region === 'toolbar' || region === 'panel') node.style.backgroundColor = 'transparent';
    if (region === 'runButton' || region === 'submitButton') node.style.color = palette?.text || '';
  };
  const renderPreviewControls = () => {
    preview.querySelectorAll<HTMLElement>('[data-theme-control]').forEach((node) => {
      const key = node.dataset.themeControl!;
      let fallback = node.querySelector<HTMLElement>('.etm__control-fallback');
      let image = node.querySelector<HTMLImageElement>('.etm__control-image');
      if (!fallback) {
        fallback = document.createElement('span'); fallback.className = 'etm__control-fallback';
        fallback.append(...Array.from(node.childNodes)); node.append(fallback);
        image = document.createElement('img'); image.className = 'etm__control-image'; image.alt = ''; image.hidden = true;
        image.setAttribute('aria-hidden', 'true'); node.append(image);
        node.setAttribute('aria-label', controlLabels[key]);
        node.title = controlLabels[key];
        image.addEventListener('load', () => { if (node.dataset.controlSource === image!.src) node.classList.add('has-control-image'); });
        image.addEventListener('error', () => { node.classList.remove('has-control-image'); });
        const showState = (state: 'default' | 'hover' | 'active') => {
          const control = selected?.controls[key];
          if (!control || !selected) return;
          const asset = assetFor(selected, state === 'active' ? control.activeAssetId || control.hoverAssetId || control.assetId
            : state === 'hover' ? control.hoverAssetId || control.assetId : control.assetId);
          if (asset) { node.dataset.controlSource = asset.url; image!.src = asset.url; }
        };
        node.addEventListener('pointerenter', () => showState('hover'));
        node.addEventListener('pointerleave', () => showState('default'));
        node.addEventListener('pointerdown', () => showState('active'));
        node.addEventListener('pointerup', () => showState('hover'));
      }
      const control = selected?.controls[key];
      const asset = selected && assetFor(selected, control?.assetId);
      if (!control || !asset) {
        node.classList.remove('has-control-image'); image!.hidden = true; image!.removeAttribute('src'); delete node.dataset.controlSource;
        node.style.removeProperty('--etm-control-width'); node.style.removeProperty('--etm-control-height');
        return;
      }
      node.style.setProperty('--etm-control-width', `${control.width}px`);
      node.style.setProperty('--etm-control-height', `${control.height}px`);
      image!.hidden = false;
      if (image!.getAttribute('src') !== asset.url) { node.classList.remove('has-control-image'); node.dataset.controlSource = asset.url; image!.src = asset.url; }
      if (image!.complete && image!.naturalWidth > 0) node.classList.add('has-control-image');
    });
    preview.querySelectorAll<HTMLElement>('[data-theme-preview-empty]').forEach((node) => { node.hidden = previewState !== 'empty'; });
    preview.querySelectorAll<HTMLElement>('[data-theme-preview-result]').forEach((node) => { node.hidden = previewState !== 'result'; });
    root.querySelectorAll<HTMLElement>('[data-theme-preview-state]').forEach((node) => { node.setAttribute('aria-pressed', String(node.dataset.themePreviewState === previewState)); });
  };
  const renderPreview = () => {
    if (!selected) return;
    const reading = readingStyle(selected);
    const palette = reading.palette;
    for (const [key, color] of Object.entries(palette)) {
      const cssKey = key === 'accent' ? 'preview-accent' : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      preview.style.setProperty(`--etm-${cssKey}`, key === 'accent' ? selected.palette.accent || basePalettes[selected.base].accent : color);
    }
    preview.style.setProperty('--etm-muted-surface', palette.muted);
    preview.style.setProperty('--etm-on-accent', selected.base === 'ocean' ? '#14243b' : '#ffffff');
    paint(preview, selected.slots.background);
    for (const slot of ['toolbar', 'editor', 'panel', 'runButton', 'submitButton'] as Slot[]) {
      paint(find(`[data-theme-region="${slot}"]`), selected.slots[slot]);
    }
    const corner = find<HTMLImageElement>('[data-theme-preview-corner]');
    const decoration = assetFor(selected, selected.slots.corner?.assetId);
    corner.hidden = !decoration;
    if (decoration) corner.src = decoration.url;
    else corner.removeAttribute('src');
    corner.style.objectFit = selected.slots.corner?.fit === 'stretch' ? 'fill' : selected.slots.corner?.fit === 'cover' ? 'cover' : 'contain';
    const background = assetFor(selected, selected.slots.background?.assetId);
    const moving = background?.type.startsWith('video/');
    video.hidden = !moving;
    if (moving) {
      if (video.getAttribute('src') !== background.url) {
        video.src = background.url;
        const poster = assetFor(selected, selected.posterAssetId);
        if (poster) video.poster = poster.url;
        else video.removeAttribute('poster');
        video.load();
      }
      video.style.objectFit = selected.slots.background?.fit === 'stretch' ? 'fill' : selected.slots.background?.fit === 'contain' ? 'contain' : 'cover';
      video.style.objectPosition = selected.slots.background?.position || 'center';
      if (!document.hidden && !reducedMotion?.matches) video.play().catch(() => {});
      else video.pause();
    } else if (video.hasAttribute('src')) { video.pause(); video.removeAttribute('src'); video.load(); }
    find('[data-theme-preview-veil]').style.opacity = String(reading.overlay);
    find('[data-theme-overlay-value]').textContent = `${Math.round(reading.overlay * 100)}%`;
    overlayInput.min = String(Math.min(0.98, readingStyle({ ...selected, overlay: 0.35 }).overlay));
    overlayInput.value = String(Math.min(0.98, reading.overlay));
    find('[data-theme-preview-name]').textContent = selected.name || '专属主题';
    const reference = assetFor(selected, selected.previewAssetId);
    find('[data-theme-reference]').hidden = !reference?.type.startsWith('image/');
    if (reference?.type.startsWith('image/')) {
      find<HTMLImageElement>('[data-theme-reference-image]').src = reference.url;
      find<HTMLAnchorElement>('[data-theme-reference-link]').href = reference.url;
    }
    root.querySelectorAll<HTMLInputElement>('[data-theme-color]').forEach((input) => { input.value = palette[input.dataset.themeColor!]; });
    renderPreviewControls();
    renderDraftState();
  };
  const renderControl = () => {
    if (!selected) return;
    const control = selected.controls[selectedControl];
    controlInput.value = selectedControl;
    const images = selected.assets.filter((asset) => asset.type.startsWith('image/'));
    for (const input of [controlAssetInput, controlHoverInput, controlActiveInput]) {
      input.replaceChildren(new Option(input === controlAssetInput ? '保留原有文字与按钮' : '沿用默认图片', ''));
      for (const asset of images) input.add(new Option(asset.name, asset.id));
    }
    controlAssetInput.value = control?.assetId || '';
    controlHoverInput.value = control?.hoverAssetId || '';
    controlActiveInput.value = control?.activeAssetId || '';
    controlWidthInput.value = String(control?.width || 120); controlHeightInput.value = String(control?.height || 40);
    for (const input of [controlHoverInput, controlActiveInput, controlWidthInput, controlHeightInput]) input.disabled = busy || !control;
    find('[data-theme-control-count]').textContent = `${Object.keys(selected.controls).length} 处已定制`;
    find('[data-theme-control-hint]').textContent = selectedControl === 'language'
      ? '图片装饰语言入口，当前语言名称仍会显示。请为语言文字留出清晰的区域。'
      : '整张图片就是这个控件。文字可直接设计在图中，透明部分不会出现方形底框。图片加载失败会显示原有文字。';
    const sample = find<HTMLImageElement>('[data-theme-control-sample]');
    sample.hidden = !control;
    if (control) { sample.src = assetFor(selected, control.assetId)!.url; sample.style.width = `${control.width}px`; sample.style.height = `${control.height}px`; }
    else sample.removeAttribute('src');
  };
  const renderSlot = () => {
    if (!selected) return;
    find('[data-theme-selected-slot]').textContent = `· ${slotLabels[selectedSlot]}`;
    root.querySelectorAll<HTMLElement>('[data-theme-slot]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.themeSlot === selectedSlot)));
    const placement = selected.slots[selectedSlot];
    const eligibleAssets = selected.assets.filter((asset) => selectedSlot === 'background' || asset.type.startsWith('image/'));
    assetInput.replaceChildren(new Option('不设置，沿用基础主题', ''));
    for (const asset of eligibleAssets) assetInput.add(new Option(`${asset.type.startsWith('video/') ? '视频 · ' : ''}${asset.name}`, asset.id));
    assetInput.value = placement?.assetId || '';
    fitInput.value = placement?.fit || (selectedSlot === 'corner' ? 'contain' : 'cover');
    positionInput.value = placement?.position || 'center';
    fitInput.disabled = busy || !placement;
    positionInput.disabled = busy || !placement;
    const grid = find('[data-theme-assets]');
    grid.replaceChildren();
    for (const asset of eligibleAssets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = asset.name;
      button.setAttribute('aria-label', `将 ${asset.name} 用于${slotLabels[selectedSlot]}`);
      button.setAttribute('aria-pressed', String(asset.id === placement?.assetId));
      if (asset.type.startsWith('image/')) {
        const image = document.createElement('img');
        image.src = asset.url; image.alt = ''; image.loading = 'lazy'; button.append(image);
      } else {
        const placeholder = document.createElement('span'); placeholder.className = 'etm__video-thumb'; placeholder.textContent = '▷'; button.append(placeholder);
      }
      const filename = document.createElement('small'); filename.textContent = asset.name; button.append(filename);
      button.disabled = busy;
      button.addEventListener('click', () => { if (!busy) assignAsset(asset.id); });
      grid.append(button);
    }
    find('[data-theme-slot-hint]').textContent = selectedSlot === 'background'
      ? '背景支持图片或静音循环视频。仅加载正在使用的主题素材。'
      : selectedSlot === 'corner' ? '建议使用透明 PNG，装饰不会挡住点击或代码输入。' : '支持透明图片。按钮上的文字与点击区域会保留。';
  };
  const assignAsset = (id: string) => {
    if (!selected) return;
    if (!id) delete selected.slots[selectedSlot];
    else selected.slots[selectedSlot] = {
      assetId: id, fit: selected.slots[selectedSlot]?.fit || (selectedSlot === 'corner' ? 'contain' : 'cover'),
      position: selected.slots[selectedSlot]?.position || 'center',
    };
    renderSlot(); renderPreview();
  };
  const openDesign = (theme: Theme, published = false) => {
    selected = normalize(JSON.parse(JSON.stringify(theme)));
    originalThemeId = published ? theme.id : undefined;
    originalBadgeId = published ? theme.badgeId : undefined;
    draftId = published ? undefined : theme.id;
    form.hidden = false;
    nameInput.value = selected.name;
    badgeInput.value = selected.badgeId ? String(selected.badgeId) : '';
    badgeInput.disabled = busy || published;
    baseInput.value = selected.base;
    overlayInput.value = String(selected.overlay);
    for (const selector of [referenceInput, posterInput]) {
      selector.replaceChildren(new Option('暂不设置', ''));
      for (const asset of selected.assets.filter((item) => item.type.startsWith('image/'))) selector.add(new Option(asset.name, asset.id));
    }
    referenceInput.value = selected.previewAssetId || '';
    posterInput.value = selected.posterAssetId || '';
    find('[data-theme-design-heading]').textContent = published ? '为徽章，更新一套新设计' : '把素材，变成完整界面';
    find('[data-theme-remove]').hidden = !published;
    const exportLink = find<HTMLAnchorElement>('[data-theme-export]');
    exportLink.hidden = !published;
    if (published) {
      const exportUrl = new URL(endpoint);
      exportUrl.searchParams.set('export', theme.id);
      exportLink.href = exportUrl.href;
    } else exportLink.removeAttribute('href');
    find('[data-theme-remove-confirm]').hidden = true;
    find<HTMLButtonElement>('[data-theme-publish]').textContent = published ? '更新主题' : '发布主题';
    baseline = snapshot();
    renderCollection(); renderSlot(); renderControl(); renderPreview();
  };
  const updateBadges = (badges: { id: number; title: string }[]) => {
    if (!Array.isArray(badges)) return;
    badgeInput.replaceChildren(new Option('请选择徽章', ''));
    badgeNames.clear();
    for (const badge of badges) { badgeNames.set(Number(badge.id), badge.title); badgeInput.add(new Option(badge.title, String(badge.id))); }
  };
  updateBadges(context.badges);
  for (const theme of context.themes || []) {
    try { const valid = normalize(theme); themes.set(valid.id, valid); }
    catch { message('部分主题资料无法读取，请刷新页面后重试。', true); }
  }
  for (const [slot, label] of Object.entries(slotLabels)) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.themeSlot = slot;
    button.addEventListener('click', () => { if (!busy) { selectedSlot = slot as Slot; renderSlot(); } });
    find('[data-theme-slots]').append(button);
  }
  for (const [label, controls] of Object.entries(controlGroups)) {
    const group = document.createElement('optgroup'); group.label = label;
    for (const [key, text] of Object.entries(controls)) group.append(new Option(text, key));
    controlInput.append(group);
  }
  controlInput.addEventListener('change', () => { selectedControl = controlInput.value; renderControl(); });
  controlAssetInput.addEventListener('change', () => {
    if (!selected) return;
    if (!controlAssetInput.value) delete selected.controls[selectedControl];
    else selected.controls[selectedControl] = { ...selected.controls[selectedControl], assetId: controlAssetInput.value, width: selected.controls[selectedControl]?.width || 120, height: selected.controls[selectedControl]?.height || 40 };
    renderControl(); renderPreview();
  });
  for (const [input, field] of [[controlHoverInput, 'hoverAssetId'], [controlActiveInput, 'activeAssetId']] as const) {
    input.addEventListener('change', () => {
      const control = selected?.controls[selectedControl]; if (!control) return;
      if (input.value) control[field] = input.value; else delete control[field];
      renderPreview();
    });
  }
  for (const [input, field, maximum] of [[controlWidthInput, 'width', 320], [controlHeightInput, 'height', 120]] as const) {
    input.addEventListener('change', () => {
      const control = selected?.controls[selectedControl]; if (!control) return;
      const value = Number(input.value); if (!Number.isFinite(value)) return;
      control[field] = Math.round(Math.max(16, Math.min(maximum, value))); renderControl(); renderPreview();
    });
  }
  root.querySelectorAll<HTMLElement>('[data-theme-preview-state]').forEach((button) => button.addEventListener('click', () => {
    previewState = button.dataset.themePreviewState!; renderPreviewControls();
  }));
  renderCollection();
  nameInput.addEventListener('input', () => { if (selected) { selected.name = nameInput.value; renderPreview(); } });
  badgeInput.addEventListener('change', () => { if (selected) { selected.badgeId = Number(badgeInput.value) || undefined; renderDraftState(); } });
  baseInput.addEventListener('change', () => {
    if (!selected) return;
    selected.base = baseInput.value as Base; selected.palette = {}; renderPreview();
  });
  overlayInput.addEventListener('input', () => { if (selected) { selected.overlay = Number(overlayInput.value); renderPreview(); } });
  assetInput.addEventListener('change', () => assignAsset(assetInput.value));
  fitInput.addEventListener('change', () => { if (selected?.slots[selectedSlot]) { selected.slots[selectedSlot]!.fit = fitInput.value as Fit; renderPreview(); } });
  positionInput.addEventListener('change', () => { if (selected?.slots[selectedSlot]) { selected.slots[selectedSlot]!.position = positionInput.value; renderPreview(); } });
  referenceInput.addEventListener('change', () => { if (selected) { selected.previewAssetId = referenceInput.value || undefined; renderPreview(); } });
  posterInput.addEventListener('change', () => { if (selected) { selected.posterAssetId = posterInput.value || undefined; video.removeAttribute('src'); renderPreview(); } });
  root.querySelectorAll<HTMLInputElement>('[data-theme-color]').forEach((input) => input.addEventListener('input', () => {
    if (selected) { selected.palette[input.dataset.themeColor!] = input.value; renderPreview(); }
  }));
  find('[data-theme-reset-palette]').addEventListener('click', () => { if (selected) { selected.palette = {}; renderPreview(); } });
  find('[data-theme-new]').addEventListener('click', () => {
    if (busy || !canLeaveDesign()) return;
    video.pause(); video.removeAttribute('src'); video.load();
    selected = null; baseline = ''; originalThemeId = undefined; originalBadgeId = undefined; draftId = undefined;
    form.hidden = true; renderCollection(); uploadInput.focus();
    find('[data-theme-dropzone]').scrollIntoView?.({ behavior: reducedMotion?.matches ? 'instant' : 'smooth', block: 'center' });
  });

  const uploadFile = async (file?: File) => {
    if (!file || busy) return;
    if (!/\.zip$/i.test(file.name) || !file.size) { message('请选择一个非空 ZIP 主题包。图片和背景视频可以放在同一个压缩包中。', true); return; }
    if (!canLeaveDesign()) return;
    setBusy(true); message('');
    const progress = find<HTMLProgressElement>('[data-theme-upload-progress] progress');
    const status = find('[data-theme-upload-status]');
    const progressPanel = find('[data-theme-upload-progress]');
    progressPanel.hidden = false; progress.value = 0; status.textContent = '正在上传主题包…';
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest(); upload = xhr;
        xhr.open('POST', endpoint); xhr.timeout = 10 * 60 * 1000;
        xhr.setRequestHeader('Accept', 'application/json'); xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          progress.value = Math.min(100, event.loaded / event.total * 100);
          status.textContent = progress.value >= 100 ? '上传完成，正在整理素材…' : `正在上传 ${Math.round(progress.value)}%`;
        };
        xhr.onload = () => {
          let body;
          try { body = JSON.parse(xhr.responseText); } catch { reject(new Error('服务器未返回主题资料，请稍后重试。')); return; }
          if (xhr.status < 200 || xhr.status >= 300 || body.error || body.ok === false) reject(new Error(errorMessage(body)));
          else resolve(body);
        };
        xhr.onerror = () => reject(new Error('上传中断，请检查网络后重试。当前已发布主题不受影响。'));
        xhr.ontimeout = () => reject(new Error('上传时间较长，请稍后重试，或适当压缩主题包中的视频。'));
        xhr.onabort = () => reject(new Error('上传已取消。'));
        const body = new FormData(); body.append('operation', 'upload'); body.append('file', file, file.name); xhr.send(body);
      });
      if (disposed) return;
      const theme = normalize(result.draft);
      updateBadges(result.badges || context.badges);
      openDesign(theme);
      message(`已整理 ${theme.assets.length} 个素材。选择关联徽章，检查预览后即可发布。`);
      status.textContent = `${file.name} · ${theme.assets.length} 个素材`;
      progress.value = 100;
    } catch (error) { if (!disposed) { message(error.message || '主题包未能上传，请稍后重试。', true); status.textContent = '上传未完成'; } }
    finally { upload = null; uploadInput.value = ''; if (!disposed) setBusy(false); }
  };
  uploadInput.addEventListener('change', () => uploadFile(uploadInput.files?.[0]));
  const dropzone = find('[data-theme-dropzone]');
  dropzone.addEventListener('dragover', (event) => { event.preventDefault(); if (!busy) dropzone.classList.add('is-dragging'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
  dropzone.addEventListener('drop', (event: DragEvent) => { event.preventDefault(); dropzone.classList.remove('is-dragging'); uploadFile(event.dataTransfer?.files?.[0]); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !selected || !form.reportValidity()) return;
    if (!selected.name.trim()) { nameInput.focus(); message('请填写主题名称。', true); return; }
    if (!selected.badgeId) { badgeInput.focus(); message('请选择主题关联的徽章。', true); return; }
    setBusy(true); message('');
    try {
      const result = await request.post(endpoint, {
        operation: 'publish', ...(draftId ? { draftId } : { themeId: originalThemeId }),
        badgeId: selected.badgeId, name: selected.name.trim(), base: selected.base, overlay: selected.overlay,
        palette: JSON.stringify(selected.palette), slots: JSON.stringify(selected.slots), controls: JSON.stringify(selected.controls),
        previewAssetId: selected.previewAssetId || '', posterAssetId: selected.posterAssetId || '', thumbnailAssetId: selected.thumbnailAssetId || '',
      });
      if (disposed) return;
      if (result.error || result.ok === false) throw new Error(errorMessage(result));
      const published = normalize(result.theme);
      if (originalThemeId && originalThemeId !== published.id) themes.delete(originalThemeId);
      themes.set(published.id, published); openDesign(published, true);
      message(`「${published.name}」已发布。持有「${badgeTitle(published.badgeId)}」的学员可以在编辑器里选用了。`);
    } catch (error) { if (!disposed) message(error.message || '发布失败，当前设计仍保留，请稍后重试。', true); }
    finally { if (!disposed) setBusy(false); }
  });
  find('[data-theme-remove]').addEventListener('click', () => { find('[data-theme-remove-confirm]').hidden = false; find('[data-theme-remove-apply]').focus(); });
  find('[data-theme-remove-cancel]').addEventListener('click', () => { find('[data-theme-remove-confirm]').hidden = true; find('[data-theme-remove]').focus(); });
  find('[data-theme-remove-apply]').addEventListener('click', async () => {
    if (busy || !originalThemeId || !selected) return;
    setBusy(true); message('');
    try {
      const result = await request.post(endpoint, { operation: 'remove', badgeId: originalBadgeId });
      if (disposed) return;
      if (result.error || result.ok === false) throw new Error(errorMessage(result));
      video.pause(); video.removeAttribute('src'); video.load();
      themes.delete(originalThemeId); selected = null; baseline = ''; originalThemeId = undefined; originalBadgeId = undefined; draftId = undefined;
      form.hidden = true; renderCollection(); message('主题已下架。学员会恢复使用基础主题，代码不受影响。');
    } catch (error) { if (!disposed) message(error.message || '下架未完成，请稍后重试。', true); }
    finally { if (!disposed) setBusy(false); }
  });
  const visibility = () => { if (selected && !form.hidden) renderPreview(); };
  document.addEventListener('visibilitychange', visibility);
  reducedMotion?.addEventListener?.('change', visibility);
  const beforeUnload = (event: BeforeUnloadEvent) => { if (!dirty() && !busy) return; event.preventDefault(); event.returnValue = ''; };
  window.addEventListener('beforeunload', beforeUnload);
  const dispose = () => {
    disposed = true; upload?.abort(); video.pause();
    document.removeEventListener('visibilitychange', visibility);
    reducedMotion?.removeEventListener?.('change', visibility);
    window.removeEventListener('beforeunload', beforeUnload);
  };
  window.addEventListener('pagehide', dispose, { once: true });
  document.addEventListener('vjContentRemove', (event) => { if ((event.target as HTMLElement)?.contains(root)) dispose(); }, { once: true });
}

export default new NamedPage(['editor_theme_manage', 'manage_editor_themes', 'domain_editor_themes'], bindEditorThemeManage);
