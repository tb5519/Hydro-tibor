import { AutoloadPage } from 'vj/misc/Page';

export default new AutoloadPage('lesson', null, () => {
  if (!UiContext.lesson?.enabled || window.top !== window || (window as any).__onebyonePlatformShell) return;
  import(/* webpackChunkName: "lesson-controls" */ './lesson/controller')
    .then(({ installLesson }) => installLesson(UiContext.lesson))
    .catch(error => console.warn('Unable to start lessons', error));
});
