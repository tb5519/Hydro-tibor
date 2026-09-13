import React from 'react';
import { mergedResultLabel, ObjectiveMergedQuestion } from '../../common/objective-merged-review';

const attemptResultLabel = { correct: '正确', incorrect: '错误', pending: '评测中', error: '评测未完成' };

export default function ObjectiveMergedHistory({ question }: { question: ObjectiveMergedQuestion }) {
  return <section className="objective-merged-history" aria-label={`第 ${question.id} 题作答历程`}>
    <header className="objective-merged-history__heading">
      <strong>作答历程 <span>{question.attempts.length} 次</span></strong>
      <span className={`objective-merged-history__outcome is-${question.result}`}>{mergedResultLabel[question.result]}</span>
    </header>
    {question.attempts.length ? <ol className="objective-merged-history__attempts">
      {question.attempts.map((attempt, index) => {
        const time = new Date(attempt.submittedAt);
        return <li key={`${attempt.rid}:${index}`} className={`objective-merged-history__attempt is-${attempt.result}`}>
          <span className="objective-merged-history__index">第 {index + 1} 次</span>
          <span className="objective-merged-history__answer">{Array.isArray(attempt.answer) ? attempt.answer.join(' + ') : attempt.answer}</span>
          <span className="objective-merged-history__result">{attemptResultLabel[attempt.result]}</span>
          {!Number.isNaN(time.getTime()) && <time className="objective-merged-history__time" dateTime={attempt.submittedAt}>
            {time.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
          </time>}
        </li>;
      })}
    </ol> : <p className="objective-merged-history__empty">该学员尚未填写本题答案。</p>}
  </section>;
}
