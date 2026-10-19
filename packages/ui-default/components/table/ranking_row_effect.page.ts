import { AutoloadPage } from 'vj/misc/Page';
import { installRankingRowEffects } from './ranking_row_effect';

let initialized = false;

export default new AutoloadPage('rankingRowEffects', () => {
  if (initialized) return;
  initialized = true;
  installRankingRowEffects();
});
