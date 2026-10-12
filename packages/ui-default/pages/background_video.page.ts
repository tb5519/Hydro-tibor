import $ from 'jquery';
import { bindBackgroundMedia, disposeBackgroundMedia } from '../components/background_video';
import { AutoloadPage } from '../misc/Page';

export default new AutoloadPage('backgroundVideo', () => {
  bindBackgroundMedia(document);
  $(document)
    .off('.backgroundVideo')
    .on('vjContentNew.backgroundVideo', (event) => bindBackgroundMedia(event.target as ParentNode))
    .on('vjContentRemove.backgroundVideo', (event) => disposeBackgroundMedia(event.target as ParentNode));
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) disposeBackgroundMedia(document);
  });
});
