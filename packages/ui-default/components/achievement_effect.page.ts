import { AutoloadPage } from 'vj/misc/Page';
import { request } from 'vj/utils';
import { createAchievementClient } from './achievement_effect';

let current: ReturnType<typeof createAchievementClient> | undefined;
let pendingPresentation = Promise.resolve();
const onPointsEarned = () => {
  const player = current;
  // A points event arriving during a page-load celebration must trigger a
  // fresh read afterwards, because its newly earned awards were not in that
  // earlier response. All calls still share one presentation queue.
  pendingPresentation = pendingPresentation.then(() => {
    if (player === current) return player?.showPending();
    return undefined;
  }).catch(() => undefined);
};

export default new AutoloadPage('achievementCelebration', () => {
  current?.dispose();
  current = undefined;
  pendingPresentation = Promise.resolve();
  window.removeEventListener('hydro:points-earned', onPointsEarned);
  if (!UiContext.achievementPendingUrl) return;
  current = createAchievementClient(UiContext, request);
  window.addEventListener('hydro:points-earned', onPointsEarned);
  if (UiContext.achievementAutoShow === true) pendingPresentation = current.showPending();
});
