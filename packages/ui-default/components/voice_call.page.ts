import { AutoloadPage } from 'vj/misc/Page';

export default new AutoloadPage('voiceCall', null, () => {
  if (!UiContext.voiceCall?.enabled || window.top !== window) return;
  import(/* webpackChunkName: "voice-call-controls" */ './voice_call/ui')
    .then(({ installVoiceCall }) => installVoiceCall(UiContext.voiceCall))
    .catch((error) => console.warn('Unable to start voice calls', error));
});
