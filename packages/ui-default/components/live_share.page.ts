import { AutoloadPage } from 'vj/misc/Page';

// Presence is light; recording, replay and collaborative editors load only for
// the two participants of an active session.
export default new AutoloadPage('liveShare', null, () => {
  // These factories execute in the page's own realm: Monaco registries, Scratch
  // bridges and recorder DOM must follow the content document, not the shell.
  (window as any).__onebyoneLiveShareSources = {
    loadAdapters: () => Promise.all([
      import(/* webpackChunkName: "live-share" */ './live_share/mirror'),
      import(/* webpackChunkName: "live-share" */ './live_share/editor'),
      import(/* webpackChunkName: "live-share" */ './live_share/frames'),
      import(/* webpackChunkName: "live-share-drawing" */ './live_share/drawing'),
      import(/* webpackChunkName: "live-share-ide" */ './live_share/ide'),
    ]).then(([mirror, editor, frames, drawing, ide]) => ({ ...mirror, ...editor, ...frames, ...drawing, ...ide })),
    loadBroadcastAdapters: () => import(/* webpackChunkName: "teacher-broadcast" */ './live_share/broadcast_adapters'),
    loadDrawing: () => import(/* webpackChunkName: "live-share-drawing" */ './live_share/drawing'),
  };
  if (!UiContext.liveShare?.enabled || window.top !== window) return;
  import(/* webpackChunkName: "live-share-controls" */ './live_share/controller').then(({ installLiveShare }) => installLiveShare(UiContext.liveShare))
    .catch((error) => console.warn('Unable to start classroom sharing', error));
});
