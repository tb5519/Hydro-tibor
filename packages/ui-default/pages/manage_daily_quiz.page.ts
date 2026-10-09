import $ from 'jquery';
import { bindDailyQuizDashboard } from '../components/daily_quiz_dashboard';
import { NamedPage } from '../misc/Page';

let dashboard: ReturnType<typeof bindDailyQuizDashboard>;
let dashboardRoot: HTMLElement;

function bind(container: ParentNode) {
  const root = container instanceof HTMLElement && container.matches('[data-daily-quiz-dashboard]')
    ? container : container.querySelector<HTMLElement>('[data-daily-quiz-dashboard]');
  if (!root || root === dashboardRoot) return;
  dashboard?.dispose();
  dashboardRoot = root;
  dashboard = bindDailyQuizDashboard(root);
}

export default new NamedPage('manage_daily_quiz', () => {
  dashboard?.dispose();
  dashboardRoot = null;
  bind(document);
  $(document).off('.dailyQuizDashboard')
    .on('vjContentNew.dailyQuizDashboard', (event) => bind(event.target as ParentNode))
    .on('vjContentRemove.dailyQuizDashboard', (event) => {
      if (dashboardRoot && (event.target as Node).contains(dashboardRoot)) {
        dashboard?.dispose();
        dashboard = null;
        dashboardRoot = null;
      }
    });
});
