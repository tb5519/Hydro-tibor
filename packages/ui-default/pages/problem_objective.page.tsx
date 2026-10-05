/* eslint-disable react-refresh/only-export-components -- Hydro registers page components through NamedPage. */
import MarkdownIt from 'markdown-it';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Katex from 'vj/backendlib/markdown-it-katex';
import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

type Kind = 'single' | 'multiple' | 'judge';
interface Material {
  docId: number;
  pid?: string;
  title: string;
  tag: string[];
  difficulty?: number;
  objectiveKind: Kind;
  objective: {
    version: 1;
    kind: Kind;
    stem: string;
    options: string[];
    answers: string[];
    analysis: string;
  };
  editUrl: string;
  fileBaseUrl: string;
}
interface Selection {
  material: Material;
  score: string;
}
interface ItemsResult {
  items: Material[];
  total: number;
  page: number;
  pageSize: number;
  tags: string[];
}
interface InitialData {
  itemsUrl: string;
  publishUrl: string;
  createUrl: string;
}

const kindLabels: Record<Kind, string> = { single: '单选', multiple: '多选', judge: '判断' };
const letter = (index: number) => String.fromCharCode(65 + index);

function MarkdownPreview({ value, fileBaseUrl }: { value: string, fileBaseUrl: string }) {
  const html = useMemo(() => {
    const markdown = new MarkdownIt({ html: false, linkify: true }).use(Katex);
    const normalizeLink = markdown.normalizeLink.bind(markdown);
    markdown.normalizeLink = (url) => {
      if (!url.startsWith('file://')) return normalizeLink(url);
      let filename = url.slice(7);
      try {
        filename = decodeURIComponent(filename);
      } catch {
        /* Keep malformed escapes as part of the filename. */
      }
      return `${fileBaseUrl}/file/${encodeURIComponent(filename)}?noDisposition=1`;
    };
    return markdown.render(value);
  }, [value, fileBaseUrl]);
  return <div className="typo objective-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

function QuestionPreview({ material }: { material: Material }) {
  const question = material.objective;
  return (
    <div className="objective-material-preview">
      <MarkdownPreview value={question.stem} fileBaseUrl={material.fileBaseUrl} />
      <div className="objective-preview__options">
        {question.options.map((option, index) => (
          <div
            className={`objective-preview__option${question.answers.includes(letter(index)) ? ' is-correct' : ''}`}
            key={index}>
            <span className="objective-preview__letter">{letter(index)}</span>
            <MarkdownPreview value={option} fileBaseUrl={material.fileBaseUrl} />
            {question.answers.includes(letter(index)) && (
              <span className="objective-preview__check" aria-label="正确答案">
                ✓
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="objective-preview__answer">
        <span>正确答案</span>
        <strong>
          {question.answers
            .map((answer) => (question.kind === 'judge' ? question.options[answer.charCodeAt(0) - 65] : answer))
            .join('、')}
        </strong>
      </div>
      {question.analysis && (
        <div className="objective-preview__analysis">
          <h4>答案解析 · 仅老师可见</h4>
          <MarkdownPreview value={question.analysis} fileBaseUrl={material.fileBaseUrl} />
        </div>
      )}
    </div>
  );
}

function ObjectiveWorkbench({ initial }: { initial: InitialData }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<ItemsResult>({ items: [], total: 0, page: 1, pageSize: 20, tags: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selection, setSelection] = useState<Selection[]>([]);
  const [title, setTitle] = useState('');
  const [pid, setPid] = useState('');
  const [intro, setIntro] = useState('');
  const [paperTags, setPaperTags] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [notice, setNotice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const pending = useRef(false);
  const saved = useRef(false);
  const dirty = useRef(false);
  const publishForm = useRef<HTMLFormElement>(null);
  dirty.current = !!(selection.length || title || pid || intro || paperTags);
  const selectedIds = useMemo(() => new Set(selection.map((entry) => entry.material.docId)), [selection]);
  const totalScore = selection.reduce((total, entry) => total + (Number(entry.score) || 0), 0);
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const hasFilters = !!(query.trim() || kind || tag);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError('');
    // Debounce typing; discard stale responses so rapid filter changes cannot replace newer results.
    const timer = window.setTimeout(
      async () => {
        try {
          const url = new URL(initial.itemsUrl, window.location.origin);
          url.searchParams.set('q', query.trim());
          url.searchParams.set('kind', kind);
          url.searchParams.set('tag', tag);
          url.searchParams.set('page', String(page));
          const next: ItemsResult = await request.get(url.toString());
          if (!current) return;
          setResult(next);
          setExpanded(null);
        } catch (error) {
          if (current) setLoadError(error.message || '素材加载失败，请重试。');
        } finally {
          if (current) setLoading(false);
        }
      },
      query ? 250 : 0,
    );
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [initial.itemsUrl, query, kind, tag, page, reload]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current || saved.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  function clearFilters() {
    setQuery('');
    setKind('');
    setTag('');
    setPage(1);
  }

  function clearError(field: string) {
    setErrors((previous) => ({ ...previous, [field]: '' }));
    setServerError('');
  }

  function toggleMaterial(material: Material) {
    if (selectedIds.has(material.docId)) {
      setSelection((previous) => previous.filter((entry) => entry.material.docId !== material.docId));
      setNotice(`已移除「${material.title}」`);
    } else if (selection.length >= 100) {
      setNotice('每份试卷最多可选择 100 道题。');
    } else {
      setSelection((previous) => [...previous, { material, score: '10' }]);
      setNotice(`已加入「${material.title}」`);
    }
    clearError('items');
    clearError('scores');
  }

  function moveItem(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= selection.length) return;
    setSelection((previous) => {
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setNotice(`已将「${selection[index].material.title}」移至第 ${target + 1} 题`);
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const nextErrors: Record<string, string> = {};
    if (!selection.length) nextErrors.items = '先从素材库选入至少一道题。';
    if (selection.length > 100) nextErrors.items = '每份试卷最多可选择 100 道题。';
    if (!title.trim()) nextErrors.title = '给这份试卷起个名字，方便学员找到它。';
    if (selection.some((entry) => !/^\d+$/.test(entry.score) || Number(entry.score) < 1 || Number(entry.score) > 100)) {
      nextErrors.scores = '每道题的分值应为 1–100 的整数。';
    } else if (totalScore > 1000) nextErrors.scores = '试卷总分不能超过 1,000 分，请调整各题分值。';
    if (intro.length > 20000) nextErrors.intro = '试卷说明不能超过 20,000 字。';
    const tags = Array.from(
      new Set(
        paperTags
          .split(/[,，\n]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
    if (tags.length > 20 || tags.some((value) => value.length > 40)) nextErrors.tags = '最多添加 20 个标签，每个不超过 40 字。';
    setErrors(nextErrors);
    setServerError('');
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => {
        const element = publishForm.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-paper-error]');
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element?.focus({ preventScroll: true });
      });
      return;
    }
    pending.current = true;
    setPublishing(true);
    try {
      const response = await request.post(initial.publishUrl, {
        title: title.trim(),
        pid: pid.trim(),
        content: intro.trim(),
        tag: tags.join(', '),
        paper: JSON.stringify({
          version: 1,
          items: selection.map((entry) => ({ id: entry.material.docId, score: Number(entry.score) })),
        }),
      });
      saved.current = true;
      window.location.assign(response.url);
    } catch (error) {
      setServerError(error.message || '发布失败，请重试。已选题目与填写内容均已保留。');
      pending.current = false;
      setPublishing(false);
    }
  }

  return (
    <div className="objective-assembly">
      <section className="objective-library" aria-label="客观题素材库" aria-busy={loading}>
        <div className="objective-card objective-library__toolbar">
          <div className="objective-library__heading">
            <div>
              <h2>题目素材</h2>
              <p>可重复选用，不会直接出现在学员题库</p>
            </div>
            <a className="objective-text-link" href={initial.createUrl}>
              ＋ 新建素材
            </a>
          </div>
          <label className="objective-search" htmlFor="objective-material-search">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              id="objective-material-search"
              placeholder="搜索题目标题或知识点…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
            {query && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => {
                  setQuery('');
                  setPage(1);
                }}>
                ×
              </button>
            )}
          </label>
          <div className="objective-library__filters">
            <div className="objective-kind-filter" role="group" aria-label="筛选题型">
              {[['', '全部题型'], ...Object.entries(kindLabels)].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  className={kind === value ? 'is-active' : ''}
                  onClick={() => {
                    setKind(value);
                    setPage(1);
                  }}>
                  {label}
                </button>
              ))}
            </div>
            <select
              aria-label="筛选知识点"
              value={tag}
              onChange={(event) => {
                setTag(event.target.value);
                setPage(1);
              }}>
              <option value="">全部知识点</option>
              {Array.from(new Set([...result.tags, ...(tag ? [tag] : [])])).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="objective-library__count" aria-live="polite">
          <span>
            {loading
              ? '正在查找题目…'
              : loadError
                ? '素材暂时无法显示'
                : `共 ${result.total} 道${hasFilters ? '匹配的' : ''}素材`}
          </span>
          {hasFilters && (
            <button type="button" onClick={clearFilters}>
              清除筛选
            </button>
          )}
        </div>
        {loadError ? (
          <div className="objective-card objective-empty" role="alert">
            <h3>暂时没能加载素材</h3>
            <p>{loadError}</p>
            <button className="objective-secondary-button" type="button" onClick={() => setReload((value) => value + 1)}>
              重新加载
            </button>
          </div>
        ) : !loading && !result.items.length ? (
          <div className="objective-card objective-empty">
            <span className="objective-empty__icon" aria-hidden="true">
              ▤
            </span>
            <h3>{hasFilters ? '还没有匹配的题目' : '从第一道素材开始'}</h3>
            <p>
              {hasFilters
                ? '试着换一个关键词，或放宽题型与知识点筛选。'
                : '先创建一些选择题或判断题，就能在这里按知识点自由组卷。'}
            </p>
            {hasFilters ? (
              <button className="objective-secondary-button" type="button" onClick={clearFilters}>
                查看全部素材
              </button>
            ) : (
              <a className="objective-secondary-button" href={initial.createUrl}>
                ＋ 创建第一道题目
              </a>
            )}
          </div>
        ) : (
          <div className={`objective-materials${loading ? ' is-loading' : ''}`}>
            {loading && !result.items.length && (
              <div className="objective-card objective-loading" role="status">
                正在加载题目…
              </div>
            )}
            {result.items.map((material) => (
              <article
                className={`objective-card objective-material${selectedIds.has(material.docId) ? ' is-selected' : ''}`}
                key={material.docId}>
                <div className="objective-material__top">
                  <span className={`objective-material__kind objective-material__kind--${material.objectiveKind}`}>
                    {kindLabels[material.objectiveKind]}
                  </span>
                  <span className="objective-material__number">{material.pid || `#${material.docId}`}</span>
                  {!!material.difficulty && <span className="objective-material__difficulty">难度 {material.difficulty}</span>}
                </div>
                <div className="objective-material__main">
                  <button
                    type="button"
                    className="objective-material__title"
                    aria-expanded={expanded === material.docId}
                    aria-controls={`objective-material-${material.docId}`}
                    onClick={() => setExpanded(expanded === material.docId ? null : material.docId)}>
                    {material.title}
                  </button>
                  <button
                    type="button"
                    className={`objective-pick${selectedIds.has(material.docId) ? ' is-selected' : ''}`}
                    disabled={publishing || loading || (!selectedIds.has(material.docId) && selection.length >= 100)}
                    aria-pressed={selectedIds.has(material.docId)}
                    aria-label={`${selectedIds.has(material.docId) ? '移除' : '选入'} ${material.title}`}
                    onClick={() => toggleMaterial(material)}>
                    {selectedIds.has(material.docId) ? '✓ 已选' : '＋ 选入'}
                  </button>
                </div>
                <div className="objective-material__bottom">
                  <div className="objective-material__tags">
                    {material.tag.map((value) => (
                      <button
                        type="button"
                        key={value}
                        onClick={() => {
                          setTag(value);
                          setPage(1);
                        }}>
                        {value}
                      </button>
                    ))}
                  </div>
                  <button
                    className="objective-text-link"
                    type="button"
                    aria-expanded={expanded === material.docId}
                    aria-controls={`objective-material-${material.docId}`}
                    onClick={() => setExpanded(expanded === material.docId ? null : material.docId)}>
                    {expanded === material.docId ? '收起预览 ↑' : '预览 ↓'}
                  </button>
                </div>
                {expanded === material.docId && (
                  <div id={`objective-material-${material.docId}`}>
                    <QuestionPreview material={material} />
                    <div className="objective-material__edit">
                      <span>教师预览，包含答案与解析</span>
                      <a className="objective-text-link" href={material.editUrl}>
                        编辑素材 →
                      </a>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        {result.total > 0 && !loadError && (
          <nav className="objective-pagination" aria-label="素材分页">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>
              ← 上一页
            </button>
            <span>
              第 {page} / {pageCount} 页
            </span>
            <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>
              下一页 →
            </button>
          </nav>
        )}
      </section>

      <form
        className="objective-paper"
        ref={publishForm}
        onSubmit={publish}
        noValidate
        aria-label="组题与发布"
        aria-busy={publishing}>
        <fieldset disabled={publishing}>
          <div className="objective-card objective-paper__card">
            <div className="objective-paper__heading">
              <div>
                <span>正在组建</span>
                <h2>我的试卷</h2>
              </div>
              <span className="objective-paper__status">未发布</span>
            </div>
            <div className="objective-paper__summary" aria-live="polite">
              <div>
                <strong>{selection.length}</strong>
                <span>道题目</span>
              </div>
              <div>
                <strong className={totalScore > 1000 ? 'has-error' : ''}>{totalScore}</strong>
                <span>总分</span>
              </div>
              <p>
                {Object.entries(kindLabels)
                  .map(
                    ([value, label]) => `${label} ${selection.filter((entry) => entry.material.objectiveKind === value).length}`,
                  )
                  .join(' · ')}
              </p>
            </div>
            <div className="objective-selection" aria-label="已选题目">
              {!selection.length ? (
                <div className="objective-selection__empty">
                  <span aria-hidden="true">＋</span>
                  <p>把合适的题目选进来</p>
                  <small>按选入顺序排列，之后可调整顺序与分值</small>
                </div>
              ) : (
                <ol className="objective-selection__list">
                  {selection.map((entry, index) => (
                    <li key={entry.material.docId}>
                      <div className="objective-selection__row">
                        <span className="objective-selection__index">{index + 1}</span>
                        <div className="objective-selection__content">
                          <button
                            type="button"
                            className="objective-selection__title"
                            aria-expanded={selectedPreview === entry.material.docId}
                            onClick={() =>
                              setSelectedPreview(selectedPreview === entry.material.docId ? null : entry.material.docId)}>
                            {entry.material.title}
                          </button>
                          <span>{kindLabels[entry.material.objectiveKind]}题</span>
                        </div>
                        <button
                          type="button"
                          className="objective-selection__remove"
                          aria-label={`移除已选题 ${entry.material.title}`}
                          onClick={() => toggleMaterial(entry.material)}>
                          ×
                        </button>
                      </div>
                      <div className="objective-selection__actions">
                        <label htmlFor={`objective-score-${entry.material.docId}`}>
                          分值{' '}
                          <input
                            id={`objective-score-${entry.material.docId}`}
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            value={entry.score}
                            aria-label={`第 ${index + 1} 题分值`}
                            aria-invalid={
                              !!errors.scores
                              && (!/^\d+$/.test(entry.score) || Number(entry.score) < 1 || Number(entry.score) > 100)
                            }
                            onChange={(event) => {
                              const score = event.target.value;
                              setSelection((previous) =>
                                previous.map((value) =>
                                  value.material.docId === entry.material.docId ? { ...value, score } : value,
                                ),
                              );
                              clearError('scores');
                            }}
                          />
                          分
                        </label>
                        <div>
                          <button
                            type="button"
                            disabled={!index}
                            aria-label={`上移第 ${index + 1} 题`}
                            onClick={() => moveItem(index, -1)}>
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === selection.length - 1}
                            aria-label={`下移第 ${index + 1} 题`}
                            onClick={() => moveItem(index, 1)}>
                            ↓
                          </button>
                        </div>
                      </div>
                      {selectedPreview === entry.material.docId && <QuestionPreview material={entry.material} />}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {(errors.items || errors.scores) && (
              <p className="objective-error" role="alert" data-paper-error tabIndex={-1}>
                {errors.items || errors.scores}
              </p>
            )}
            <div className="objective-paper__details">
              <label className="objective-label" htmlFor="objective-paper-title">
                试卷名称 <span aria-hidden="true">*</span>
              </label>
              <input
                id="objective-paper-title"
                className="objective-input"
                placeholder="例如：循环结构 · 巩固练习"
                maxLength={64}
                value={title}
                required
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? 'objective-paper-title-error' : undefined}
                onChange={(event) => {
                  setTitle(event.target.value);
                  clearError('title');
                }}
              />
              {errors.title && (
                <p className="objective-error" id="objective-paper-title-error">
                  {errors.title}
                </p>
              )}
              <details className="objective-paper__more" open={!!(errors.intro || errors.tags) || undefined}>
                <summary>
                  试卷说明与更多设置 <span aria-hidden="true">⌄</span>
                </summary>
                <div className="objective-field">
                  <label className="objective-label" htmlFor="objective-paper-intro">
                    试卷说明 <small>选填 · Markdown</small>
                  </label>
                  <textarea
                    id="objective-paper-intro"
                    className="objective-input"
                    rows={3}
                    placeholder="写下练习目标或作答提醒…"
                    value={intro}
                    aria-invalid={!!errors.intro}
                    onChange={(event) => {
                      setIntro(event.target.value);
                      clearError('intro');
                    }}
                  />
                  {errors.intro && <p className="objective-error">{errors.intro}</p>}
                </div>
                <div className="objective-field">
                  <label className="objective-label" htmlFor="objective-paper-tags">
                    试卷标签 <small>选填</small>
                  </label>
                  <input
                    id="objective-paper-tags"
                    className="objective-input"
                    placeholder="多个标签用逗号分隔"
                    value={paperTags}
                    aria-invalid={!!errors.tags}
                    onChange={(event) => {
                      setPaperTags(event.target.value);
                      clearError('tags');
                    }}
                  />
                  {errors.tags && <p className="objective-error">{errors.tags}</p>}
                </div>
                <div className="objective-field">
                  <label className="objective-label" htmlFor="objective-paper-pid">
                    题号 <small>选填</small>
                  </label>
                  <input
                    id="objective-paper-pid"
                    className="objective-input"
                    placeholder="留空自动分配"
                    value={pid}
                    onChange={(event) => setPid(event.target.value)}
                  />
                </div>
              </details>
            </div>
            {serverError && (
              <div className="objective-form-error" role="alert">
                {serverError}
                <small>选题与填写内容已保留，请修改后重试。</small>
              </div>
            )}
            <div className="objective-paper__publish">
              <p>发布后，这份试卷将出现在题库，学员可见并可作答。</p>
              <button
                type="submit"
                className="objective-submit"
                disabled={publishing}
                onClick={(event) => event.stopPropagation()}>
                {publishing ? '正在发布…' : '发布到题库'}
                <span aria-hidden="true"> →</span>
              </button>
              <small>素材可反复组卷；后续修改素材不影响已发布试卷</small>
            </div>
          </div>
        </fieldset>
      </form>
      <div className="objective-mobile-basket">
        <span>
          已选 <strong>{selection.length}</strong> 题 <i>·</i> {totalScore} 分
        </span>
        <button type="button" onClick={() => publishForm.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          查看试卷 →
        </button>
      </div>
      <div className="objective-announcement" role="status" aria-live="polite">
        {notice}
      </div>
    </div>
  );
}

export default new NamedPage('problem_objective', () => {
  const container = document.querySelector<HTMLElement>('[data-objective-workbench]');
  if (!container) return;
  const initial: InitialData = JSON.parse(container.dataset.initial);
  createRoot(container).render(<ObjectiveWorkbench initial={initial} />);
});
