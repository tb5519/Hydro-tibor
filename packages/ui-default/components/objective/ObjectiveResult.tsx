import React from 'react';
import { ContestPoints } from '../contest_points';

interface ObjectiveResultProps {
  score: number;
  totalScore: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  award?: any;
}

export function ObjectiveResult({
  score, totalScore, correct, incorrect, unanswered, award,
}: ObjectiveResultProps) {
  return (
    <section className="objective-result" aria-label="客观题成绩">
      <div className="objective-result__heading">
        <span className="objective-result__eyebrow">本次答题</span>
        <h1 className="objective-result__title">客观题成绩</h1>
      </div>
      <div className="objective-result__score-card">
        <span className="objective-result__score-label">我的得分</span>
        <div className="objective-result__score">
          <strong>{score}</strong><span>分</span>
        </div>
        <div className="objective-result__total">总分 <b>{totalScore}</b> 分</div>
      </div>
      <dl className="objective-result__counts">
        <div className="objective-result__count objective-result__count--correct">
          <dt><i aria-hidden="true" />答对</dt><dd>{correct}<span>题</span></dd>
        </div>
        <div className="objective-result__count objective-result__count--incorrect">
          <dt><i aria-hidden="true" />答错</dt><dd>{incorrect}<span>题</span></dd>
        </div>
        <div className="objective-result__count">
          <dt><i aria-hidden="true" />未答</dt><dd>{unanswered}<span>题</span></dd>
        </div>
      </dl>
      <p className="objective-result__note">答题卡与已选答案已标记本次结果。</p>
      {award && <ContestPoints award={award} />}
    </section>
  );
}
