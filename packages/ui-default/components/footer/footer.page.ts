import { AutoloadPage } from 'vj/misc/Page';
import { initHonorWall } from './honor-wall';

const footerPage = new AutoloadPage('footerPage', () => {
  document.querySelectorAll<HTMLElement>('[data-honor-wall]').forEach(initHonorWall);
});

export default footerPage;
