import $ from 'jquery';
import { bindLiveRanking } from '../components/ranking_live';
import { AutoloadPage } from '../misc/Page';

export default new AutoloadPage('rankingLive', async () => {
  if (!document.querySelector('[data-ranking-live]') || !UiContext.rankingLiveUrl || !UiContext.rankingLiveSocket) return;
  const { default: Socket } = await import('../components/socket');
  bindLiveRanking({
    socket: new Socket(UiContext.ws_prefix + UiContext.rankingLiveSocket, false, true),
    url: UiContext.rankingLiveUrl,
    onRemove: (element) => { $(element).trigger('vjContentRemove'); },
    onNew: (element) => { $(element).trigger('vjContentNew'); },
  });
});
