import { bindDomainJoinPicker } from '../components/domain_join_controls';
import { NamedPage } from '../misc/Page';
import { request } from '../utils';

export default new NamedPage('home_domain', () => {
  bindDomainJoinPicker(document, {
    get: (url) => request.get(url, {}, { timeout: 15000 }),
    post: (url, data) => request.post(url, data, { timeout: 15000 }),
    navigate: (url) => { window.location.href = url; },
  });
});
