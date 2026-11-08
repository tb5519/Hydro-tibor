import { AutoloadPage } from 'vj/misc/Page';

export default new AutoloadPage('classChat', null, () => {
  if (!(UiContext as any).classChat?.enabled || window.top !== window) return;
  import(/* webpackChunkName: "class-chat" */ './class_chat/controller')
    .then(({ installClassChat }) => installClassChat((UiContext as any).classChat))
    .catch((error) => console.warn('Unable to start classroom chat', error));
});
