import { bindDomainJoinSettings } from '../components/domain_join_controls';
import { NamedPage } from '../misc/Page';
import { request } from '../utils';

export default new NamedPage('domain_join_applications', () => {
  bindDomainJoinSettings(document, {
    post: (url, data) => request.post(url, data, { timeout: 15000 }),
  });
});
