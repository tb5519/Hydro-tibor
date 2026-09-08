import React from 'react';

export function ContestPoints({ award }: { award: any }) {
  if (!award) return null;
  const badges = award.badges || [];
  const badgeChip = (badge) => (
    <span className="contest-points__badge" key={badge.id} title={badge.name}>
      <i style={{ backgroundColor: badge.backgroundColor }} aria-hidden="true" />
      <span>{badge.name}</span><b>+5%</b>
    </span>
  );
  return (
    <section className="contest-points" aria-label="本次比赛积分">
      <div className="contest-points__heading">
        <span>{award.points > 0 ? '本次积分到账' : '本次积分'}</span>
        <strong>+{award.points}<small> 积分</small></strong>
      </div>
      {award.points > 0 ? (
        <>
          <div className="contest-points__breakdown">
            <span>比赛得分奖励 <b>+{award.basePoints}</b></span>
            {badges.length > 0 && <span>勋章额外加成 <b>+{award.bonusPoints}</b></span>}
          </div>
          {badges.length > 0 && (
            <div className="contest-points__bonus">
              <div className="contest-points__bonus-title">
                <span>{badges.length} 枚勋章带来 <b>+{award.badgePercent}%</b> 加成</span>
                <small>满分后仍可额外获得</small>
              </div>
              <div className="contest-points__badges">{badges.slice(0, 4).map(badgeChip)}</div>
              {badges.length > 4 && (
                <details className="contest-points__more">
                  <summary>查看其余 {badges.length - 4} 枚勋章</summary>
                  <div className="contest-points__badges">{badges.slice(4).map(badgeChip)}</div>
                </details>
              )}
              <p className="contest-points__note">按本次新增得分计算；不足 1 积分的加成在本场比赛中累计。</p>
            </div>
          )}
        </>
      ) : <p className="contest-points__note">本次未产生新的得分奖励，已获得的积分保留。</p>}
      <div className="contest-points__total">本场已获得 <b>{award.contestPoints}</b> 积分</div>
    </section>
  );
}
