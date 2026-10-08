/* eslint-disable react-refresh/only-export-components -- Hydro registers page components through NamedPage. */
import MarkdownIt from 'markdown-it';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Katex from 'vj/backendlib/markdown-it-katex';
import { NamedPage } from 'vj/misc/Page';
import { request } from 'vj/utils';

interface Feedback {
  correct: boolean;
  answers: string[];
  selectedAnswers: string[];
  analysis: string;
  earnedPoints: number;
}
interface Question {
  id: number;
  position: number;
  total: number;
  domainId: string;
  domainName: string;
  kind: 'single' | 'multiple' | 'judge';
  title: string;
  stem: string;
  options: string[];
  tags: string[];
  points: number;
  feedback?: Feedback;
}
interface QuizState {
  sessionId: string;
  day: string;
  round: number;
  enabled: boolean;
  required: boolean;
  completed: boolean;
  total: number;
  answered: number;
  earnedPoints: number;
  possiblePoints: number;
  current: Question | null;
  shortage: number;
}
interface InitialData {
  state: QuizState;
  actionUrl: string;
  statusUrl: string;
  returnUrl: string;
}
type Post = (url: string, data: Record<string, any>) => Promise<{ state: QuizState }>;

// Match the existing objective editor: disable raw HTML and retain safe Markdown and math.
const markdown = new MarkdownIt({ html: false, linkify: true }).use(Katex);
const letter = (index: number) => String.fromCharCode(65 + index);

function Markdown({ value, id }: { value: string, id?: string }) {
  const html = useMemo(() => markdown.render(value || ''), [value]);
  return <div id={id} className="typo" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function safeQuizReturnUrl(value: string, origin: string) {
  try {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

function dateLabel(value: string) {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? `${Number(match[1])} 月 ${Number(match[2])} 日` : '今天';
}

export function DailyQuiz({ initial, post = request.post.bind(request) }: { initial: InitialData, post?: Post }) {
  const [state, setState] = useState(initial.state);
  const [selection, setSelection] = useState<string[]>(initial.state.current?.feedback?.selectedAnswers || []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const hasFocused = useRef(false);
  const questionRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef<HTMLHeadingElement>(null);
  const current = state.current;
  const feedback = current?.feedback;
  const needsAcknowledgement = !!feedback && !feedback.correct && !!feedback.analysis?.trim();
  const continueLabel = needsAcknowledgement ? '知道了' : state.completed ? '完成今日问答' : '下一题';
  const actionHint = !feedback ? '不着急，先想清楚再提交。'
    : needsAcknowledgement ? '看懂题解后，点击“知道了”继续。'
      : feedback.correct ? '答对了，继续吧。' : '记住正确答案，下次再试试。';
  const complete = !current && (state.completed || !state.required);
  const multiple = current?.kind === 'multiple';
  const judge = current?.kind === 'judge';
  const answerText = (answers: string[]) => answers.map((answer) => (judge ? { A: '正确', B: '错误' }[answer] || answer : answer)).join('、');
  const activeAnswers = feedback?.selectedAnswers || selection;
  const returnUrl = safeQuizReturnUrl(initial.returnUrl, window.location.origin);

  useEffect(() => {
    const options = { preventScroll: !hasFocused.current };
    if (feedback) feedbackRef.current?.focus(options);
    else if (complete) completedRef.current?.focus(options);
    else questionRef.current?.focus(options);
    hasFocused.current = true;
  }, [current?.id, !!feedback, complete]);

  function choose(answer: string) {
    if (inFlight.current || feedback) return;
    setError('');
    setSelection((previous) => (multiple
      ? previous.includes(answer) ? previous.filter((item) => item !== answer) : [...previous, answer].sort()
      : [answer]));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || !current) return;
    if (!feedback && !selection.length) {
      setError(multiple ? '先选出你认为正确的选项，再提交答案。' : '先选择一个答案，再提交。');
      questionRef.current?.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const result = await post(initial.actionUrl, {
        operation: feedback ? 'next' : 'answer',
        sessionId: state.sessionId,
        questionId: current.id,
        ...(!feedback ? { answers: selection } : {}),
      });
      const next = result?.state;
      if (!next || next.sessionId !== state.sessionId || typeof next.answered !== 'number'
        || (next.current && (!Array.isArray(next.current.options) || !next.current.id))
        || (!feedback && !next.current?.feedback && !next.completed)) {
        throw new Error('暂未确认保存结果，请再试一次。');
      }
      setState(next);
      setSelection(next.current?.feedback?.selectedAnswers || []);
    } catch (cause) {
      setError(cause?.message || '暂时未能连接，请再试一次。');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <main className="daily-quiz">
      <header className="daily-quiz__topbar">
        <div className="daily-quiz__brand"><strong>OneByOne</strong><span>每日问答</span></div>
        <span className="daily-quiz__date">{dateLabel(state.day)}{state.round > 1 ? ` · 第 ${state.round} 轮` : ''}</span>
      </header>
      <div className="daily-quiz__main">
        {!complete && (
          <header className="daily-quiz__intro">
            <h1>每天一点，慢慢进步</h1>
            <p>认真想一想，再带着新的收获开始今天的学习。</p>
          </header>
        )}
        {state.total > 0 && (
          <div className="daily-quiz__progress-region">
            <div className="daily-quiz__progress-heading">
              <span>今日进度 <strong>{state.answered} / {state.total}</strong></span>
              <span>已获得 <strong>{state.earnedPoints}</strong> 积分</span>
            </div>
            <div
              className="daily-quiz__progress"
              role="progressbar"
              aria-label="今日问答进度"
              aria-valuemin={0}
              aria-valuemax={state.total}
              aria-valuenow={state.answered}>
              <span style={{ width: `${Math.min(100, (state.answered / state.total) * 100)}%` }} />
            </div>
          </div>
        )}
        {current ? (
          <form className="daily-quiz__card" onSubmit={submit} aria-busy={pending} data-daily-quiz-form>
            <div className="daily-quiz__meta">
              <span className="daily-quiz__kind">{judge ? '判断题' : multiple ? '多选题' : '单选题'}</span>
              <span>{current.domainName}</span>
              <span className="daily-quiz__question-number">第 {current.position} 题</span>
            </div>
            <div className="daily-quiz__question" ref={questionRef} tabIndex={-1} role="group" aria-label={`第 ${current.position} 题`}>
              <Markdown value={current.stem || current.title} />
              <fieldset className={`daily-quiz__choices${multiple ? ' is-multiple' : ''}`} disabled={pending || !!feedback}>
                <legend>{judge ? '判断这句话是否正确' : multiple ? '选择所有正确答案' : '选择一个正确答案'} · 本题 {current.points} 积分</legend>
                {current.options.map((option, index) => {
                  const value = letter(index);
                  const selected = activeAnswers.includes(value);
                  const correct = feedback?.answers.includes(value);
                  const incorrect = feedback && selected && !correct;
                  const optionClass = `daily-quiz__option${selected ? ' is-selected' : ''}${feedback ? ' is-locked' : ''}`
                    + `${correct ? ' is-correct' : ''}${incorrect ? ' is-incorrect' : ''}`;
                  return (
                    <label className={optionClass} key={value} data-daily-quiz-option={value}>
                      <input
                        type={multiple ? 'checkbox' : 'radio'}
                        name="daily-quiz-answer"
                        value={value}
                        checked={selected}
                        onChange={() => choose(value)}
                        aria-label={judge ? answerText([value]) : `选项 ${value}`}
                        aria-describedby={`daily-quiz-option-${current.id}-${value}`} />
                      <span className="daily-quiz__letter" aria-hidden="true">{judge ? index === 0 ? '✓' : '×' : value}</span>
                      <Markdown id={`daily-quiz-option-${current.id}-${value}`} value={option} />
                      {(correct || incorrect) && (
                        <span className="daily-quiz__option-note">{correct ? selected ? '你的选择 · 正确' : '正确答案' : '你的选择'}</span>
                      )}
                    </label>
                  );
                })}
              </fieldset>
            </div>
            {feedback && (
              <div
                className={`daily-quiz__feedback ${feedback.correct ? 'is-correct' : 'is-incorrect'}`}
                ref={feedbackRef}
                tabIndex={-1}
                role="region"
                aria-label="本题结果"
                data-daily-quiz-feedback>
                <div className="daily-quiz__feedback-heading">
                  <span className="daily-quiz__feedback-icon" aria-hidden="true">
                    {feedback.correct ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path
                          className="daily-quiz__checkmark"
                          d="m5 12 4.5 4.5L19 7"
                          stroke="currentColor"
                          strokeWidth="2.3"
                          strokeLinecap="round"
                          strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 6v13M4 5.5c3-1 5.5-.7 8 1.1 2.5-1.8 5-2.1 8-1.1v12.7c-3-1-5.5-.7-8 1.1-2.5-1.8-5-2.1-8-1.1V5.5Z"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <div><span className="daily-quiz__feedback-eyebrow">{feedback.correct ? '小小积累，也值得肯定' : '发现一个可以进步的地方'}</span>
                    <h2>{feedback.correct ? '答对了，继续积累！' : '这次没答对，一起弄懂它'}</h2>
                  </div>
                  <div className="daily-quiz__award" aria-label={`本题获得 ${feedback.earnedPoints} 积分`}>
                    <strong>+{feedback.earnedPoints}</strong><span> 积分</span>
                  </div>
                </div>
                <dl className="daily-quiz__answer-summary">
                  <div><dt>你的选择</dt><dd className={feedback.correct ? 'is-correct' : 'is-incorrect'}>{answerText(feedback.selectedAnswers)}</dd></div>
                  <div><dt>正确答案</dt><dd className="is-correct">{answerText(feedback.answers)}</dd></div>
                </dl>
                {needsAcknowledgement && (
                  <div className="daily-quiz__analysis"><h3>题解</h3><Markdown value={feedback.analysis} /></div>
                )}
              </div>
            )}
            {error && <div className="daily-quiz__error" role="alert">{error}<small>当前选择已保留，可以直接重试。</small></div>}
            <div className="daily-quiz__actions">
              <p>{actionHint}</p>
              <button
                className="daily-quiz__primary"
                type="submit"
                disabled={pending}
                aria-busy={pending}
                onClick={(event) => event.stopPropagation()}>
                {pending ? feedback ? '正在继续…' : '正在保存…' : feedback ? continueLabel : '提交答案'}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>
        ) : complete ? (
          <section className="daily-quiz__card daily-quiz__complete" data-daily-quiz-complete>
            <div className="daily-quiz__complete-icon" aria-hidden="true">{state.total > 0 ? '✓' : '☀'}</div>
            <h1 ref={completedRef} tabIndex={-1}>{state.total > 0 ? '今日问答，完成了' : '今天暂时没有问答'}</h1>
            <p>{state.total > 0 ? '又积累了一点新知识，继续今天的学习吧。' : '准备好了，就继续今天的学习吧。'}</p>
            {state.total > 0 && (
              <div className="daily-quiz__stats">
                <div><strong>{state.answered}</strong><span>完成题目</span></div>
                <div><strong>+{state.earnedPoints}</strong><span>今日积分</span></div>
              </div>
            )}
            <a className="daily-quiz__primary" href={returnUrl} data-no-instant>继续学习<span aria-hidden="true">→</span></a>
          </section>
        ) : (
          <section className="daily-quiz__card daily-quiz__complete" role="alert">
            <h1>问答暂时没有准备好</h1><p>请刷新页面，再试一次。</p>
            <button type="button" className="daily-quiz__primary" onClick={() => window.location.reload()}>重新加载</button>
          </section>
        )}
        <p className="daily-quiz__footnote">{complete ? '每天一点好习惯，每天都有新收获。' : '作答进度会自动保存，完成全部题目即可继续学习。'}</p>
      </div>
    </main>
  );
}

export default new NamedPage('daily_quiz', () => {
  const container = document.querySelector<HTMLElement>('[data-daily-quiz]');
  if (!container) return;
  const initial: InitialData = JSON.parse(container.dataset.initial);
  createRoot(container).render(<DailyQuiz
    initial={initial}
    post={(url, data) => request.post(url, data, { timeout: 20000 })} />);
});
