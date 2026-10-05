/* eslint-disable react-refresh/only-export-components -- Hydro registers page components through NamedPage. */
import MarkdownIt from 'markdown-it';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Katex from 'vj/backendlib/markdown-it-katex';
import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

type Kind = 'single' | 'multiple' | 'judge';
interface Objective {
  version: 1;
  kind: Kind;
  stem: string;
  options: string[];
  answers: string[];
  analysis: string;
}
interface InitialData {
  objective?: Partial<Objective>;
  title?: string;
  pid?: string;
  tags?: string[];
  hidden?: boolean;
  difficulty?: number | string;
  editing: boolean;
  cancelUrl: string;
}

const kinds: { value: Kind, label: string, description: string }[] = [
  { value: 'single', label: '单选题', description: '只有一个正确答案' },
  { value: 'multiple', label: '多选题', description: '有两个或更多正确答案' },
  { value: 'judge', label: '判断题', description: '判断说法是否正确' },
];
const suggestedTags = ['编程基础', '变量与数据类型', '条件判断', '循环结构', '数组', '函数', '逻辑推理'];
const letter = (index: number) => String.fromCharCode(65 + index);
const parseTags = (value: string) =>
  value
    .split(/[,，\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
// Raw HTML is disabled; MarkdownIt also rejects unsafe link protocols.
const markdown = new MarkdownIt({ html: false, linkify: true }).use(Katex);

function MarkdownPreview({ value, placeholder }: { value: string, placeholder?: string }) {
  const html = useMemo(() => markdown.render(value), [value]);
  if (!value.trim()) return <p className="objective-preview__placeholder">{placeholder}</p>;
  return <div className="typo objective-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

function ObjectiveEditor({ initial }: { initial: InitialData }) {
  const source = initial.objective || {};
  const [kind, setKind] = useState<Kind>(source.kind || 'single');
  const [title, setTitle] = useState(initial.title || '');
  const [stem, setStem] = useState(source.stem || '');
  const [options, setOptions] = useState(source.kind !== 'judge' && source.options?.length ? source.options : ['', '', '', '']);
  const [choiceAnswers, setChoiceAnswers] = useState(source.kind !== 'judge' ? source.answers || [] : []);
  const [judgeAnswers, setJudgeAnswers] = useState(source.kind === 'judge' ? source.answers || [] : []);
  const [analysis, setAnalysis] = useState(source.analysis || '');
  const [tags, setTags] = useState(Array.from(new Set(initial.tags || [])));
  const [tagInput, setTagInput] = useState('');
  const [pid, setPid] = useState(initial.pid || '');
  const [hidden, setHidden] = useState(!!initial.hidden);
  const [difficulty, setDifficulty] = useState(String(initial.difficulty || ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const saved = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const tagRef = useRef<HTMLInputElement>(null);
  const activeOptions = kind === 'judge' ? ['正确', '错误'] : options;
  const activeAnswers = kind === 'judge' ? judgeAnswers : choiceAnswers;
  const kindLabel = kinds.find((item) => item.value === kind).label;
  const snapshot = JSON.stringify({
    kind,
    title,
    stem,
    options,
    choiceAnswers,
    judgeAnswers,
    analysis,
    tags,
    tagInput,
    pid,
    hidden,
    difficulty,
  });
  const original = useRef(snapshot);
  const dirty = useRef(false);
  dirty.current = snapshot !== original.current;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current || saved.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  function clearError(field: string) {
    setErrors((previous) => ({ ...previous, [field]: '' }));
    setServerError('');
  }

  function changeKind(next: Kind) {
    setKind(next);
    if (next === 'single') setChoiceAnswers((previous) => previous.slice(0, 1));
    setErrors({});
    setServerError('');
  }

  function toggleAnswer(answer: string) {
    if (kind === 'judge') setJudgeAnswers([answer]);
    else if (kind === 'single') setChoiceAnswers([answer]);
    else {
      setChoiceAnswers((previous) =>
        previous.includes(answer) ? previous.filter((value) => value !== answer) : [...previous, answer].sort(),
      );
    }
    clearError('answers');
  }

  function removeOption(index: number) {
    setOptions((previous) => previous.filter((_, optionIndex) => optionIndex !== index));
    setChoiceAnswers((previous) =>
      previous
        .filter((answer) => answer !== letter(index))
        .map((answer) => (answer > letter(index) ? letter(answer.charCodeAt(0) - 66) : answer)),
    );
    clearError('options');
    clearError('answers');
  }

  function addTags(value: string) {
    const incoming = parseTags(value);
    if (!incoming.length) return;
    setTags((previous) => Array.from(new Set([...previous, ...incoming])));
    setTagInput('');
    clearError('tags');
  }

  function focusError(field: string) {
    requestAnimationFrame(() => {
      const element = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element?.focus({ preventScroll: true });
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const submittedTags = Array.from(new Set([...tags, ...parseTags(tagInput)]));
    setTags(submittedTags);
    setTagInput('');
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = '请填写题目标题，方便在题库中找到它。';
    if (!stem.trim()) nextErrors.stem = '请填写题干。';
    if (stem.length > 20000) nextErrors.stem = '题干不能超过 20,000 字。';
    if (activeOptions.some((option) => !option.trim())) nextErrors.options = '请补全每个选项，或删除不需要的选项。';
    else if (new Set(activeOptions.map((option) => option.trim())).size !== activeOptions.length) { nextErrors.options = '选项内容不能重复。'; }
    if (activeOptions.some((option) => option.length > 4000)) nextErrors.options = '每个选项不能超过 4,000 字。';
    if (kind === 'multiple' ? activeAnswers.length < 2 : activeAnswers.length !== 1) {
      nextErrors.answers = kind === 'multiple' ? '多选题至少需要勾选两个正确答案。' : '请选择一个正确答案。';
    }
    if (!submittedTags.length) nextErrors.tags = '请至少添加一个知识点标签。';
    else if (submittedTags.length > 20 || submittedTags.some((tag) => tag.length > 40)) {
      nextErrors.tags = '最多添加 20 个知识点标签，每个不超过 40 字。';
    }
    if (analysis.length > 20000) nextErrors.analysis = '答案解析不能超过 20,000 字。';
    setErrors(nextErrors);
    setServerError('');
    if (Object.keys(nextErrors).length) {
      focusError(Object.keys(nextErrors)[0]);
      return;
    }
    const objective: Objective = {
      version: 1,
      kind,
      stem: stem.trim(),
      options: activeOptions.map((option) => option.trim()),
      answers: [...activeAnswers].sort(),
      analysis: analysis.trim(),
    };
    if (JSON.stringify(objective).length >= 65536) {
      setServerError('题目内容过长，请适当精简题干、选项或解析后重试。');
      focusError('server');
      return;
    }
    pending.current = true;
    setSubmitting(true);
    try {
      const result = await request.post(window.location.href, {
        title: title.trim(),
        pid: pid.trim(),
        hidden: hidden ? 'on' : '',
        difficulty: difficulty || '',
        tag: submittedTags.join(', '),
        objective: JSON.stringify(objective),
      });
      saved.current = true;
      window.location.assign(result.url);
    } catch (error) {
      setServerError(error.message || '保存失败，请重试。填写的内容已保留。');
      focusError('server');
      pending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="objective-workspace" ref={formRef} onSubmit={submit} noValidate aria-busy={submitting}>
      <fieldset className="objective-editor" disabled={submitting}>
        <div className="objective-card">
          <div className="objective-section-heading">
            <span className="objective-step">01</span>
            <h2>题目内容</h2>
            <span>必填项以 * 标记</span>
          </div>
          <fieldset className="objective-kind-fieldset">
            <legend className="objective-label">
              题型 <span aria-hidden="true">*</span>
            </legend>
            <div className="objective-kinds">
              {kinds.map((item) => (
                <label className={`objective-kind${kind === item.value ? ' is-selected' : ''}`} key={item.value}>
                  <input
                    type="radio"
                    name="objective-kind"
                    value={item.value}
                    checked={kind === item.value}
                    onChange={() => changeKind(item.value)}
                  />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="objective-field">
            <label className="objective-label" htmlFor="objective-title">
              题目标题 <span aria-hidden="true">*</span>
            </label>
            <input
              id="objective-title"
              data-field="title"
              className="objective-input"
              value={title}
              required
              maxLength={64}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'objective-title-error' : undefined}
              placeholder="例如：理解 for 循环的执行次数"
              onChange={(event) => {
                setTitle(event.target.value);
                clearError('title');
              }}
            />
            {errors.title && (
              <p className="objective-error" id="objective-title-error">
                {errors.title}
              </p>
            )}
          </div>
          <div className="objective-field">
            <div className="objective-label-row">
              <label className="objective-label" htmlFor="objective-stem">
                题干 <span aria-hidden="true">*</span>
              </label>
              <span>支持 Markdown 与数学公式</span>
            </div>
            <textarea
              id="objective-stem"
              data-field="stem"
              className="objective-input objective-stem"
              rows={7}
              value={stem}
              required
              aria-invalid={!!errors.stem}
              aria-describedby={errors.stem ? 'objective-stem-error' : undefined}
              placeholder={'在这里写下问题…\n\n可以使用 **加粗**、代码块或 $数学公式$。'}
              onChange={(event) => {
                setStem(event.target.value);
                clearError('stem');
              }}
            />
            {errors.stem && (
              <p className="objective-error" id="objective-stem-error">
                {errors.stem}
              </p>
            )}
          </div>
          <fieldset
            className="objective-options-fieldset"
            data-field="answers"
            tabIndex={-1}
            aria-describedby={errors.answers ? 'objective-answers-error' : 'objective-options-help'}>
            <legend className="objective-label">
              {kind === 'judge' ? '正确答案' : '选项与答案'} <span aria-hidden="true">*</span>
            </legend>
            <p className="objective-help" id="objective-options-help">
              {kind === 'judge'
                ? '选出这道判断题的正确答案。'
                : `点击选项左侧${kind === 'multiple' ? '方框' : '圆圈'}标记正确答案；选项支持 Markdown。`}
            </p>
            <div
              className={`objective-options${kind === 'judge' ? ' objective-options--judge' : ''}`}
              data-field="options"
              tabIndex={-1}>
              {activeOptions.map((option, index) => (
                <div className={`objective-option${activeAnswers.includes(letter(index)) ? ' is-correct' : ''}`} key={index}>
                  <label className="objective-answer-toggle">
                    <input
                      type={kind === 'multiple' ? 'checkbox' : 'radio'}
                      name="objective-answer"
                      value={letter(index)}
                      checked={activeAnswers.includes(letter(index))}
                      onChange={() => toggleAnswer(letter(index))}
                      aria-label={`设${kind === 'judge' ? option : `选项 ${letter(index)}`}为正确答案`}
                    />
                    <span className="objective-option-letter">{kind === 'judge' ? option : letter(index)}</span>
                  </label>
                  {kind !== 'judge' && (
                    <textarea
                      className="objective-option-input"
                      rows={2}
                      value={option}
                      required
                      aria-label={`选项 ${letter(index)} 内容`}
                      placeholder={`填写选项 ${letter(index)}`}
                      aria-invalid={!!errors.options && !option.trim()}
                      onChange={(event) => {
                        setOptions((previous) => previous.map((value, position) => (position === index ? event.target.value : value)));
                        clearError('options');
                      }}
                    />
                  )}
                  {kind !== 'judge' && (
                    <button
                      className="objective-remove-option"
                      type="button"
                      onClick={() => removeOption(index)}
                      disabled={options.length <= 2}
                      aria-label={`删除选项 ${letter(index)}`}
                      title={options.length <= 2 ? '至少保留两个选项' : `删除选项 ${letter(index)}`}>
                      ×
                    </button>
                  )}
                  {kind === 'judge' && activeAnswers.includes(letter(index)) && (
                    <span className="objective-judge-correct">正确答案</span>
                  )}
                </div>
              ))}
            </div>
            {errors.options && <p className="objective-error">{errors.options}</p>}
            {errors.answers && (
              <p className="objective-error" id="objective-answers-error">
                {errors.answers}
              </p>
            )}
            {kind !== 'judge' && (
              <div className="objective-option-footer">
                <button
                  className="objective-add-option"
                  type="button"
                  disabled={options.length >= 8}
                  onClick={() => setOptions((previous) => [...previous, ''])}>
                  ＋ 添加选项
                </button>
                <span>
                  {options.length} / 8 个选项{activeAnswers.length ? ` · 正确答案：${[...activeAnswers].sort().join('、')}` : ''}
                </span>
              </div>
            )}
          </fieldset>
        </div>

        <div className="objective-card">
          <div className="objective-section-heading">
            <span className="objective-step">02</span>
            <h2>知识点与解析</h2>
          </div>
          <div className="objective-field">
            <label className="objective-label" htmlFor="objective-tags">
              知识点标签 <span aria-hidden="true">*</span>
            </label>
            <p className="objective-help" id="objective-tags-help">
              为这道题标记考查的知识点，方便以后按类别查找与组题。
            </p>
            <div className={`objective-tag-editor${errors.tags ? ' has-error' : ''}`}>
              {tags.map((tag) => (
                <span className="objective-tag" key={tag}>
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags((previous) => previous.filter((value) => value !== tag))}
                    aria-label={`移除标签 ${tag}`}>
                    ×
                  </button>
                </span>
              ))}
              <input
                ref={tagRef}
                id="objective-tags"
                data-field="tags"
                value={tagInput}
                placeholder={tags.length ? '继续添加…' : '输入知识点，按回车添加'}
                aria-invalid={!!errors.tags}
                aria-describedby={errors.tags ? 'objective-tags-error' : 'objective-tags-help'}
                onChange={(event) => {
                  const value = event.target.value;
                  if (/[,，\n]/.test(value) && !(event.nativeEvent as InputEvent).isComposing) addTags(value);
                  else setTagInput(value);
                }}
                onBlur={() => addTags(tagInput)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                  if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
                    event.preventDefault();
                    addTags(tagInput);
                  }
                  if (event.key === 'Backspace' && !tagInput && tags.length) setTags((previous) => previous.slice(0, -1));
                }}
              />
            </div>
            {errors.tags && (
              <p className="objective-error" id="objective-tags-error">
                {errors.tags}
              </p>
            )}
            <div className="objective-tag-suggestions">
              <span>常用知识点</span>
              {suggestedTags
                .filter((tag) => !tags.includes(tag))
                .map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => {
                      addTags(tag);
                      tagRef.current?.focus();
                    }}>
                    ＋ {tag}
                  </button>
                ))}
            </div>
          </div>
          <div className="objective-field">
            <div className="objective-label-row">
              <label className="objective-label" htmlFor="objective-analysis">
                答案解析
              </label>
              <span>选填 · 支持 Markdown</span>
            </div>
            <textarea
              id="objective-analysis"
              data-field="analysis"
              className="objective-input"
              rows={4}
              value={analysis}
              placeholder="说明解题思路，也可以补充容易混淆的地方。"
              onChange={(event) => setAnalysis(event.target.value)}
            />
            {errors.analysis && <p className="objective-error">{errors.analysis}</p>}
          </div>
        </div>

        <div className="objective-card objective-settings">
          <details open={initial.editing || undefined}>
            <summary>
              <span className="objective-step">03</span>
              <span>更多设置</span>
              <small>选填</small>
              <span className="objective-settings-chevron" aria-hidden="true">
                ⌄
              </span>
            </summary>
            <div className="objective-settings-fields">
              <div className="objective-field">
                <label className="objective-label" htmlFor="objective-pid">
                  题号
                </label>
                <input
                  id="objective-pid"
                  className="objective-input"
                  value={pid}
                  placeholder="留空自动分配"
                  onChange={(event) => setPid(event.target.value)}
                />
              </div>
              <div className="objective-field">
                <label className="objective-label" htmlFor="objective-difficulty">
                  难度
                </label>
                <select
                  id="objective-difficulty"
                  className="objective-input"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}>
                  <option value="">暂不设置</option>
                  {Array.from({ length: 10 }, (_, index) => (
                    <option key={index} value={index + 1}>
                      {index + 1}
                      {index === 0 ? ' · 入门' : index === 9 ? ' · 挑战' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <label className="objective-hidden">
                <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
                <span>
                  暂时隐藏这道题<small>开启后，普通学员不会在题库中看到它。</small>
                </span>
              </label>
            </div>
          </details>
        </div>
        {serverError && (
          <div className="objective-form-error" role="alert" data-field="server" tabIndex={-1}>
            {serverError}
            <small>你填写的内容已保留，可修改后再次保存。</small>
          </div>
        )}
        <div className="objective-submit-bar">
          <span>{initial.editing ? '保存后返回题目详情' : '创建后即可在题库中查看这道题'}</span>
          <div>
            <a
              href={initial.cancelUrl}
              className="objective-cancel"
              aria-disabled={submitting}
              onClick={(event) => {
                if (submitting) event.preventDefault();
              }}>
              取消
            </a>
            <button
              type="submit"
              className="objective-submit"
              disabled={submitting}
              // This form owns its pending state; bypass the legacy document-wide five-second click lock.
              onClick={(event) => event.stopPropagation()}>
              {submitting ? '正在保存…' : initial.editing ? '保存修改' : '创建客观题'}
              <span aria-hidden="true">{submitting ? '' : ' →'}</span>
            </button>
          </div>
        </div>
      </fieldset>

      <aside className="objective-preview-column" aria-label="题目即时预览">
        <div className="objective-preview-sticky">
          <div className="objective-card objective-preview">
            <div className="objective-preview__header">
              <h2>即时预览</h2>
              <span>
                <i /> 随输入更新
              </span>
            </div>
            <div className="objective-preview__body">
              <span className="objective-preview__kind">{kindLabel}</span>
              <h3 className={title.trim() ? '' : 'objective-preview__placeholder'}>{title.trim() || '你的题目标题'}</h3>
              <MarkdownPreview value={stem} placeholder="题干会显示在这里。先写下你想让孩子思考的问题。" />
              <div className="objective-preview__options">
                {activeOptions.map((option, index) => (
                  <div
                    className={`objective-preview__option${activeAnswers.includes(letter(index)) ? ' is-correct' : ''}`}
                    key={index}>
                    <span className="objective-preview__letter">{kind === 'judge' ? (index ? '×' : '✓') : letter(index)}</span>
                    <MarkdownPreview value={option} placeholder={`选项 ${letter(index)}`} />
                    {activeAnswers.includes(letter(index)) && (
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
                  {activeAnswers.length
                    ? [...activeAnswers]
                      .sort()
                      .map((answer) => (kind === 'judge' ? activeOptions[answer.charCodeAt(0) - 65] : answer))
                      .join('、')
                    : '尚未选择'}
                </strong>
              </div>
              {!!tags.length && (
                <div className="objective-preview__tags">
                  {tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}
              {analysis.trim() && (
                <div className="objective-preview__analysis">
                  <h4>答案解析</h4>
                  <MarkdownPreview value={analysis} />
                </div>
              )}
            </div>
            <p className="objective-preview__note">此处展示教师预览，包含正确答案与解析。</p>
          </div>
          <div className="objective-preview-tip">
            <span aria-hidden="true">✧</span>
            <p>
              <strong>让知识点更具体一点</strong>“循环的执行次数”比“循环”更明确，也能为后续的针对性练习积累更有用的题目。
            </p>
          </div>
        </div>
      </aside>
    </form>
  );
}

export default new NamedPage(['problem_create_objective', 'problem_edit_objective'], () => {
  const container = document.querySelector<HTMLElement>('[data-objective-editor]');
  if (!container) return;
  const initial: InitialData = JSON.parse(container.dataset.initial);
  createRoot(container).render(<ObjectiveEditor initial={initial} />);
});
