import { installBadgeIcons } from '../components/badge_icon';
import { AutoloadPage } from '../misc/Page';

let dispose: (() => void) | undefined;
export default new AutoloadPage('badgeIcons', () => {
  dispose?.();
  dispose = installBadgeIcons();
});
