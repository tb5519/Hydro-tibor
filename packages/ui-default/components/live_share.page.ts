import { AutoloadPage } from 'vj/misc/Page';

// Presence is light; recording, replay and collaborative editors load only for
// the two participants of an active session.
export default new AutoloadPage('liveShare', null, () => {
  if (!UiContext.liveShare?.enabled || window.top !== window) return;
  import(/* webpackChunkName: "live-share-controls" */ './live_share/controller').then(({ installLiveShare }) => installLiveShare(UiContext.liveShare))
    .catch((error) => console.warn('Unable to start classroom sharing', error));
});
