import React from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'react-redux';
import { getAvailableLangs } from 'vj/utils';
import { CodeFile, codeFileName, fileLanguage, IDE_FILE_BYTES, validateLocalCode } from './files';

type OverwriteTarget = { name: string; existing?: Pick<CodeFile, 'id' | 'revision'> };

function Glyph({ kind }: { kind: 'cloud' | 'local' | 'save' | 'open' | 'file' | 'trash' }) {
  const paths = {
    cloud: 'M7 17H6a4 4 0 1 1 .5-8A6 6 0 0 1 18 8a4.5 4.5 0 0 1 0 9h-1M12 12v8m-3-3 3 3 3-3',
    local: 'M4 4h16v12H4zM8 20h8m-4-4v4',
    save: 'M5 3h12l4 4v14H3V3zm2 0v6h10V3M7 21v-8h10v8',
    open: 'M3 18V5h6l2 3h10v10M3 20l3-9h16l-3 9z',
    file: 'M5 3h9l5 5v13H5zm9 0v6h5M8 13h8m-8 4h6',
    trash: 'M4 6h16M9 3h6M6 6l1 15h10l1-15M10 10v7m4-7v7',
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

export default function IdeFilesControl() {
  const store = useStore();
  const [mode, setMode] = React.useState<'cloud' | 'local'>('cloud');
  const [active, setActive] = React.useState<CodeFile | null>(null);
  const [modal, setModal] = React.useState<'save' | 'open' | null>(null);
  const [files, setFiles] = React.useState<CodeFile[]>([]);
  const [name, setName] = React.useState('');
  const [overwrite, setOverwrite] = React.useState<OverwriteTarget | null>(null);
  const [search, setSearch] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const dialog = React.useRef<HTMLDialogElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const localHandle = React.useRef<FileSystemFileHandle | null>(null);
  const localName = React.useRef('');
  const savedCode = React.useRef<string | null>(null);
  const available = getAvailableLangs(UiContext.pdoc.config.langs);
  const source = () => (store.getState() as any).editor as { code: string; lang: string };
  async function api(body?: Record<string, any>, id?: string) {
    const endpoint = new URL(UiContext.ideFilesUrl, window.location.href);
    if (id) endpoint.searchParams.set('id', id);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint.toString(), { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw Object.assign(new Error(data.message || '暂时无法访问云端，请稍后重试。'), {
          code: data.error, existing: data.existing,
        });
      }
      return data;
    } catch (cause) {
      if (cause.name === 'AbortError') throw new Error('连接云端超时，请稍后重试。');
      throw cause;
    } finally { window.clearTimeout(timeout); }
  }
  React.useEffect(() => {
    if (!modal || !dialog.current) return undefined;
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, [modal]);
  React.useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => setMessage(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [message]);
  function notifyFailure(cause: any) { setError(cause?.message || '操作没有完成，请重试。'); }
  function closeModal() { setModal(null); setOverwrite(null); setError(''); }
  function rename() { setOverwrite(null); setError('请换一个程序名称。'); }
  async function list() {
    setLoading(true);
    try { setFiles((await api()).files); }
    catch (cause) { notifyFailure(cause); }
    finally { setLoading(false); }
  }
  function open() {
    setError('');
    if (mode === 'local') { input.current?.click(); return; }
    setSearch(''); setModal('open'); void list();
  }
  function replace(code: string, lang: string) {
    if (!available[lang]) throw new Error('这个文件的语言当前不可用，请先联系老师调整。');
    if (source().code && source().code !== code && source().code !== savedCode.current && !window.confirm('打开文件会替换编辑器中的代码。请确认当前代码已保存。')) return false;
    store.dispatch({ type: 'SCRATCHPAD_EDITOR_SET_LANG', payload: lang });
    store.dispatch({ type: 'SCRATCHPAD_EDITOR_UPDATE_CODE', payload: code });
    return true;
  }
  async function openCloud(file: CodeFile) {
    if (busy) return; setBusy(true); setError('');
    try {
      const value = (await api(undefined, file.id)).file as CodeFile;
      if (replace(value.code || '', value.lang)) {
        // A different document must never inherit permission to overwrite the
        // local file that was saved before opening this cloud document.
        localHandle.current = null; localName.current = value.name;
        savedCode.current = value.code || ''; setActive(value); closeModal(); setMessage(`已打开 ${value.name}`);
      }
    } catch (cause) { notifyFailure(cause); } finally { setBusy(false); }
  }
  async function remove(file: CodeFile) {
    if (busy || !window.confirm(`删除云端文件「${file.name}」？编辑器里的代码会保留。`)) return;
    setBusy(true); setError('');
    try { await api({ action: 'delete', id: file.id, revision: file.revision });
      setFiles((items) => items.filter((item) => item.id !== file.id));
      if (active?.id === file.id) setActive(null);
    } catch (cause) { notifyFailure(cause); } finally { setBusy(false); }
  }
  async function saveFile(target?: OverwriteTarget) {
    if (busy) return;
    const current = source();
    if (new TextEncoder().encode(current.code).length > IDE_FILE_BYTES) { setError('代码文件不能超过 128 KB。'); return; }
    const fileName = target?.name || codeFileName(name, current.lang);
    const handle = localHandle.current?.name === fileName ? localHandle.current : null;
    if (mode === 'local' && handle && !target) {
      setError(''); setOverwrite({ name: fileName }); return;
    }
    setBusy(true); setError('');
    try {
      if (mode === 'cloud') {
        const { file } = await api({ action: 'save', name: fileName, code: current.code, lang: current.lang, ...target?.existing });
        setActive(file);
      } else if ('showSaveFilePicker' in window && window.isSecureContext) {
        const destination = handle || await (window as any).showSaveFilePicker({ suggestedName: fileName }) as FileSystemFileHandle;
        const writable = await destination.createWritable();
        await writable.write(current.code);
        await writable.close();
        localHandle.current = destination;
        localName.current = destination.name;
      } else {
        const url = URL.createObjectURL(new Blob([current.code], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 3000); localName.current = fileName;
      }
      savedCode.current = current.code;
      closeModal();
      setMessage(mode === 'cloud' ? '已保存到云端' : '已保存到本地');
    } catch (cause) {
      if (cause.code === 'DUPLICATE_NAME' && cause.existing) setOverwrite({ name: fileName, existing: cause.existing });
      else if (cause.name !== 'AbortError') {
        if (target) setOverwrite(null);
        if (mode === 'local' && cause.name === 'NotFoundError') localHandle.current = null;
        notifyFailure(cause);
      }
    } finally { setBusy(false); }
  }
  function showSave(initialName: string) {
    setError('');
    setName(codeFileName(initialName, source().lang)); setModal('save');
  }
  function save() {
    const cloudName = active?.name || '';
    showSave(mode === 'cloud' ? cloudName || localName.current : localName.current || cloudName);
  }
  async function readLocal(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      if (file.size > IDE_FILE_BYTES) throw new Error('代码文件不能超过 128 KB。');
      const code = validateLocalCode(file, await file.text());
      const lang = fileLanguage(file.name, source().lang, available);
      if (!lang) throw new Error('当前课堂不支持这个文件的语言。');
      if (replace(code, lang)) {
        localHandle.current = null; localName.current = file.name; savedCode.current = code; setActive(null); setMessage(`已打开 ${file.name}`);
      }
    } catch (cause) { notifyFailure(cause); } finally { setBusy(false); }
  }
  const shown = files.filter((file) => file.name.toLowerCase().includes(search.toLowerCase()));
  return <div className="ide-files" data-live-share-private="" role="group" aria-label="代码文件">
    <button type="button" className={`ide-files__mode is-${mode}`} disabled={busy} title={mode === 'cloud' ? '当前操作云端文件，点击切换到本地' : '当前操作本地文件，点击切换到云端'} aria-label={mode === 'cloud' ? '云端文件，点击切换本地' : '本地文件，点击切换云端'} onClick={() => { setMode(mode === 'cloud' ? 'local' : 'cloud'); setError(''); }}><Glyph kind={mode}/><span>{mode === 'cloud' ? '云端' : '本地'}</span></button>
    <button type="button" disabled={busy} title={active && mode === 'cloud' ? `保存 ${active.name}` : '保存代码'} onClick={save}><Glyph kind="save"/><span>{busy ? '处理中' : '保存'}</span></button>
    <button type="button" disabled={busy} onClick={open}><Glyph kind="open"/><span>打开</span></button>
    <input ref={input} type="file" hidden accept=".py,.cpp,.cc,.cxx,.c,.h,.hpp,.txt" onChange={readLocal}/>
    {!modal && (message || error) && <div className={`ide-files__notice ${error ? 'is-error' : ''}`} role="status">{error || message}{error && <button type="button" aria-label="收起提示" onClick={() => setError('')}>×</button>}</div>}
    {modal && createPortal(<dialog ref={dialog} className="ide-files-dialog" data-live-share-private="" aria-labelledby="ide-files-title" onClick={(event) => { if (event.target === event.currentTarget && !busy) closeModal(); }} onCancel={(event) => {
      event.preventDefault();
      if (busy) return;
      if (overwrite) rename(); else closeModal();
    }}>
      <header><div className="ide-files-dialog__heading-icon"><Glyph kind={mode}/></div><div><h2 id="ide-files-title">{overwrite ? '覆盖同名程序？' : modal === 'save' ? (mode === 'cloud' ? '保存到云端' : '保存到本地') : '我的云端文件'}</h2>
        <p>{overwrite ? '覆盖后将保存为当前编辑器中的代码。' : modal === 'open' ? '当前课堂 · 仅自己可见' : mode === 'cloud' ? '换一台电脑，也能接着写。' : '保存在当前设备上。'}</p></div><button type="button" className="ide-files-dialog__close" aria-label="关闭" disabled={busy} onClick={closeModal}>×</button></header>
      {overwrite ? <>
        <p className="ide-files-dialog__duplicate">已存在 <strong>{overwrite.name}</strong></p>
        <footer><button type="button" autoFocus disabled={busy} onClick={rename}>换个名字</button><button type="button" className="is-primary" disabled={busy} onClick={() => void saveFile(overwrite)}>{busy ? '正在保存…' : '确认覆盖'}</button></footer>
      </> : modal === 'save' ? <form onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void saveFile(); }}>
        <label htmlFor="ide-file-name">程序名称</label><input id="ide-file-name" autoFocus required readOnly={busy} maxLength={80} value={name} onChange={(event) => { setName(event.target.value); setError(''); }} onFocus={(event) => event.target.select()} placeholder="给程序起个名字" />
        {error && <p className="ide-files-dialog__error" role="alert">{error}</p>}
        <footer><button type="button" disabled={busy} onClick={closeModal}>取消</button><button type="submit" className="is-primary" disabled={busy || !name.trim()} onClick={(event) => event.stopPropagation()}>{busy ? '正在保存…' : '保存'}</button></footer>
      </form> : <><div className="ide-files-dialog__search"><input aria-label="搜索云端文件" placeholder="搜索文件名" value={search} onChange={(event) => setSearch(event.target.value)}/><span>{files.length} / 50</span></div>
        {error && <p className="ide-files-dialog__error" role="alert">{error}<button type="button" onClick={() => { setError(''); void list(); }}>重试</button></p>}
        <div className="ide-files-dialog__list">{loading ? <p className="ide-files-dialog__empty">正在整理文件…</p> : !shown.length ? <div className="ide-files-dialog__empty"><Glyph kind="file"/><p>{files.length ? '没有找到这个文件' : '写好第一个程序，点「保存」留在这里。'}</p></div> : shown.map((file) => <div className="ide-files-dialog__row" key={file.id}><button type="button" className="ide-files-dialog__file" disabled={busy} onClick={() => void openCloud(file)}><Glyph kind="file"/><span><strong>{file.name}</strong><small>{file.lang.startsWith('py') ? 'Python' : 'C++'} · {new Date(file.updatedAt).toLocaleDateString('zh-CN')} 更新</small></span><span className="ide-files-dialog__arrow">↗</span></button><button type="button" className="ide-files-dialog__delete" disabled={busy} aria-label={`删除 ${file.name}`} title="删除文件" onClick={() => void remove(file)}><Glyph kind="trash"/></button></div>)}</div>
        <footer><span>每个文件最多 128 KB</span><button type="button" disabled={busy} onClick={() => showSave('')}>另存当前代码</button></footer></>}
    </dialog>, document.body)}
  </div>;
}
