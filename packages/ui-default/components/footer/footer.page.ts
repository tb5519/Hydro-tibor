import { AutoloadPage } from 'vj/misc/Page';

const pending = new WeakSet<HTMLElement>();

function deferHonorWall(wall: HTMLElement) {
  if (pending.has(wall)) return;
  pending.add(wall);
  let loading = false;
  const retry = wall.querySelector<HTMLButtonElement>('[data-honor-wall-retry]');
  const load = () => {
    if (loading || !wall.isConnected) return;
    loading = true;
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => {
        loading = false;
        load();
      }, { once: true });
      return;
    }
    if (retry) retry.hidden = true;
    // Do not return this promise to the page loader: decoration is independent
    // of the editor, language controls, and submit handlers becoming ready.
    void import('./honor-wall').then(({ initHonorWall }) => {
      retry?.removeEventListener('click', load);
      if (wall.isConnected) initHonorWall(wall);
    }).catch(() => {
      loading = false;
      const status = wall.querySelector<HTMLElement>('[data-honor-wall-status]');
      if (status) status.textContent = '荣誉墙暂时未能加载，不影响做题。';
      if (retry) retry.hidden = false;
    });
  };
  retry?.addEventListener('click', load);
  // Warm the wall after the original page is ready, even while it is below
  // the fold. Scrolling should reveal finished artwork, not start its download.
  load();
}

const footerPage = new AutoloadPage('footerPage', () => {
  document.querySelectorAll<HTMLElement>('[data-honor-wall]').forEach(deferHonorWall);
});

export default footerPage;
