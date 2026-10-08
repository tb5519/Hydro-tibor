import MarkdownIt from 'markdown-it';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Katex from 'vj/backendlib/markdown-it-katex';
import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

interface Question {
  id: string | number;
  paperTitle: string;
  kind: 'single' | 'multiple' | 'judge';
  stem: string;
  options: string[];
  score: number;
  selected?: string[];
  correct?: boolean;
  answers?: string[];
  analysis?: string;
}
interface QuizState {
  title: string;
  revision: string;
  studentName?: string;
  deadline?: string;
  actionUrl: string;
  backUrl: string;
  items: Question[];
  completed: boolean;
  score: number;
  totalScore: number;
  readOnly: boolean;
}
type Post = (url: string, body: any) => Promise<{ state: QuizState }>;
const markdown = new MarkdownIt({ html: false, linkify: true }).use(Katex);
const kinds = { single: '单选题', multiple: '多选题', judge: '判断题' };
const answered = (item: Question) => typeof item.correct === 'boolean';
const letter = (index: number) => String.fromCharCode(65 + index);
function RichText({ value, id }: { value: string, id?: string }) {
  const html = useMemo(() => markdown.render(value || ''), [value]);
  return <div className="typo" id={id} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ScratchObjectiveQuiz({ initial, post = request.post.bind(request) }: { initial: QuizState, post?: Post }) {
  const [state, setState] = useState(initial);
  const [index, setIndex] = useState(() => Math.max(0, initial.items.findIndex((item) => !answered(item))));
  const [selection, setSelection] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(initial.completed && !initial.readOnly);
  const lock = useRef(false);
  const questionRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const question = state.items[index];
  const locked = !question || answered(question);
  const count = state.items.filter(answered).length;
  const needsAcknowledgement = locked && question?.correct === false && !!question.analysis?.trim();
  const expired = !!state.deadline && new Date(state.deadline).getTime() < Date.now();
  const actionHint = state.readOnly ? '点击题号，可以切换查看。'
    : locked ? needsAcknowledgement ? '看懂题解后，点击“知道了”继续。' : '把新知识记在心里，继续吧。'
      : '提交后答案会锁定，请检查后再提交。';
  const actionLabel = pending ? '正在保存…'
    : locked ? needsAcknowledgement ? '知道了' : state.completed ? '查看完成情况' : '下一题 →' : '提交答案';
  const answers = locked ? question?.answers || [] : [];
  const selected = locked ? question?.selected || [] : selection;
  const answerLabel = (values?: string[]) => values?.map((value) => (question.kind === 'judge'
    ? question.options[value.charCodeAt(0) - 65] : value)).join('、') || '—';

  useEffect(() => {
    const target = locked ? feedbackRef.current : questionRef.current;
    target?.focus({ preventScroll: !focused.current });
    focused.current = true;
  }, [index, locked, summary]);

  function go(next: number) {
    if (lock.current) return;
    setIndex(next);
    setSelection([]);
    setError('');
    setSummary(false);
  }
  function choose(value: string) {
    if (locked || lock.current || state.readOnly) return;
    setError('');
    setSelection((previous) => (question.kind === 'multiple'
      ? previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value].sort()
      : [value]));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!question || lock.current || state.readOnly) return;
    if (locked) {
      if (state.completed) setSummary(true);
      else {
        const next = state.items.findIndex((item, position) => position > index && !answered(item));
        go(next >= 0 ? next : state.items.findIndex((item) => !answered(item)));
      }
      return;
    }
    if (expired) return;
    if (!selection.length) {
      setError('先选好答案，再提交吧。');
      questionRef.current?.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    lock.current = true;
    setPending(true);
    setError('');
    try {
      const result = await post(state.actionUrl, { operation: 'answer', revision: state.revision, questionId: question.id, answers: selection });
      const next = result?.state;
      const saved = next?.items?.find((item) => item.id === question.id);
      if (!saved || !answered(saved) || next.revision !== state.revision) throw new Error('还没有确认保存成功，请再试一次。');
      setState(next);
      setIndex(next.items.findIndex((item) => item.id === question.id));
    } catch (cause) {
      setError(cause.message || '网络暂时没有连接上，当前选择已保留，请重试。');
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <div className="sc-quiz">
      <header className="sc-heading">
        <div><div className="sc-eyebrow">{state.readOnly ? `${state.studentName || '学员'} · 作答详情` : '课堂练习 · 想一想，选一选'}</div>
          <h1>{state.title}</h1><p className="sc-muted">{state.readOnly ? '逐题查看学员的选择、正确答案和作答结果。' : '每完成一道题，都会自动保存。不着急，认真想一想。'}</p></div>
        <a className="sc-button" href={state.backUrl}>返回作业</a>
      </header>
      <div className="sc-quiz__layout">
        <section className="sc-quiz__body">
          {summary || !question ? (
            <div className="sc-panel sc-quiz__complete">
              <span className="sc-quiz__celebrate" aria-hidden="true">✓</span>
              <h2>{state.completed ? '练习完成啦！' : '暂时没有练习题'}</h2>
              <p className="sc-muted">{state.completed ? '认真思考的每一步，都是小小的进步。' : '返回作业，看看老师的其他安排吧。'}</p>
              {!!state.items.length && <div className="sc-quiz__stats"><div><strong>{count}</strong><span>完成题目</span></div>
                <div><strong>{state.items.filter((item) => item.correct).length}</strong><span>答对题目</span></div>
                <div><strong>{state.score}<small> / {state.totalScore}</small></strong><span>本次得分</span></div></div>}
              <div className="sc-actions"><a className="sc-button sc-button-primary" href={state.backUrl}>返回作业</a>
                {!!state.items.length && <button className="sc-button" type="button" onClick={() => go(0)}>回顾题目</button>}</div>
            </div>
          ) : (
            <form className="sc-panel sc-quiz__card" onSubmit={submit} aria-busy={pending}>
              {expired && !state.readOnly && <p className="sc-quiz__notice">作业已截止，可以继续回顾已答题目。</p>}
              <div className="sc-quiz__meta"><span className="sc-badge">{kinds[question.kind]}</span><span>{question.paperTitle}</span>
                <strong>第 {index + 1} 题 / {state.items.length}</strong></div>
              <div ref={questionRef} tabIndex={-1} className="sc-quiz__question" role="group" aria-label={`第 ${index + 1} 题`}>
                <RichText value={question.stem} />
                <fieldset className="sc-quiz__options" disabled={pending || locked || state.readOnly || expired}>
                  <legend>{question.kind === 'multiple' ? '选择所有正确答案' : '选择一个正确答案'} · 本题 {question.score} 分</legend>
                  {question.options.map((option, position) => {
                    const value = letter(position);
                    const correct = answers.includes(value);
                    const wrong = locked && selected.includes(value) && !correct;
                    const optionClass = `sc-quiz__option${selected.includes(value) ? ' is-selected' : ''}`
                      + `${correct ? ' is-correct' : ''}${wrong ? ' is-wrong' : ''}`;
                    return <label key={value} className={optionClass}>
                      <input
                        type={question.kind === 'multiple' ? 'checkbox' : 'radio'}
                        name="scratch-quiz-answer"
                        value={value}
                        checked={selected.includes(value)}
                        onChange={() => choose(value)}
                        aria-label={`选项 ${value}`}
                        aria-describedby={`sc-quiz-option-${index}-${value}`} />
                      <span className="sc-quiz__letter" aria-hidden="true">{question.kind === 'judge' ? position === 0 ? '✓' : '×' : value}</span>
                      <RichText id={`sc-quiz-option-${index}-${value}`} value={option} />
                      {(correct || wrong) && <span className="sc-quiz__option-note">{correct ? '正确答案' : '你的选择'}</span>}
                    </label>;
                  })}
                </fieldset>
              </div>
              {locked ? (
                <div
                  className={`sc-quiz__feedback${question.correct ? ' is-correct' : ' is-wrong'}`}
                  ref={feedbackRef}
                  tabIndex={-1}
                  role="region"
                  aria-label="本题结果">
                  <div className="sc-quiz__feedback-title"><span aria-hidden="true">{question.correct ? '✓' : '☀'}</span>
                    <div><h2>{state.readOnly ? question.correct ? '回答正确' : '这道题需要再复习' : question.correct ? '答对啦，做得真棒！' : '没关系，一起弄懂它'}</h2>
                      <p>{state.readOnly ? '学员' : '你'}的选择：{answerLabel(question.selected)}<span>正确答案：{answerLabel(answers)}</span></p></div></div>
                  {needsAcknowledgement && <div className="sc-quiz__analysis"><h3>题解</h3><RichText value={question.analysis} /></div>}
                </div>
              ) : state.readOnly && (
                <div className="sc-quiz__notice">
                  <p>这道题还没有作答。</p>
                  <p>正确答案：{answerLabel(question.answers)}</p>
                  {!!question.analysis?.trim() && <div className="sc-quiz__analysis"><h3>题解</h3><RichText value={question.analysis} /></div>}
                </div>
              )}
              {error && <p className="sc-quiz__error" role="alert">{error}</p>}
              <div className="sc-quiz__actions">
                <p className="sc-muted">{actionHint}</p>
                {state.readOnly ? (
                  <button
                    type="button"
                    className="sc-button sc-button-primary"
                    disabled={index === state.items.length - 1}
                    onClick={() => go(index + 1)}>下一题 →</button>
                ) : (
                  <button className="sc-button sc-button-primary" type="submit" disabled={pending || (expired && !locked)}>
                    {actionLabel}
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
        <aside className="sc-panel sc-quiz__overview" aria-label="练习进度">
          <h2>{state.readOnly ? '作答概览' : '我的进度'}</h2>
          <div className="sc-quiz__progress-heading"><span>已完成</span><strong>{count} / {state.items.length}</strong></div>
          <div
            className="sc-quiz__progress"
            role="progressbar"
            aria-label="练习完成进度"
            aria-valuemin={0}
            aria-valuemax={state.items.length || 1}
            aria-valuenow={count}>
            <span style={{ width: `${state.items.length ? count / state.items.length * 100 : 0}%` }} /></div>
          <div className="sc-quiz__numbers">{state.items.map((item, position) => <button
            key={item.id}
            type="button"
            className={`${!summary && position === index ? 'is-current ' : ''}${answered(item) ? item.correct ? 'is-correct' : 'is-wrong' : ''}`}
            aria-label={`第 ${position + 1} 题，${answered(item) ? item.correct ? '答对' : '答错' : '未答'}`}
            aria-current={!summary && position === index ? 'step' : undefined}
            disabled={pending}
            onClick={() => go(position)}>{position + 1}</button>)}</div>
          <div className="sc-quiz__legend">
            <span><i className="is-correct" />答对</span><span><i className="is-wrong" />待巩固</span><span><i />未答</span>
          </div>
          <p className="sc-muted">{state.readOnly ? `已得 ${state.score} / ${state.totalScore} 分` : '一步一步来，你可以的。'}</p>
        </aside>
      </div>
    </div>
  );
}

export default new NamedPage('scratch_objective_quiz', () => {
  const host = document.querySelector<HTMLElement>('[data-scratch-objective-quiz]');
  if (!host) return;
  createRoot(host).render(<ScratchObjectiveQuiz
    initial={JSON.parse(host.dataset.initial)}
    post={(url, body) => request.post(url, body, { timeout: 20000 })} />);
});
