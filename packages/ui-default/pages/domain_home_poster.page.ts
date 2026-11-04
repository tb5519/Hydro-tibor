import { bindHomePosterAutosave } from '../components/home_poster_autosave';
import { NamedPage } from '../misc/Page';

export default new NamedPage('domain_home_poster', () => {
  bindHomePosterAutosave(document.querySelector('[data-poster-settings]'));
});
