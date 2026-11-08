import { installPersistentTeacherAssistant } from './teacher_assistant';

/** Keep future camera/RTC tracks here alongside voice, never in page loaders. */
export async function installPlatformCommunications() {
  installPersistentTeacherAssistant();
  let ended = false;
  const started = new Set<string>();
  const ready = () => {
    const shell = (window as any).__onebyonePlatformShell;
    const page = shell?.contentWindow();
    if (page && !ended) shell.pageReady(page);
  };
  async function start(context: any) {
    if (!context || ended) return;
    const jobs: Promise<unknown>[] = [];
    const once = (name: string, load: () => Promise<unknown>) => {
      if (started.has(name) || !context[name]?.enabled) return;
      started.add(name);
      jobs.push(load().catch((error) => {
        started.delete(name); console.warn('Unable to start a classroom connection', error);
      }));
    };
    once('classChat', () => import(/* webpackChunkName: "class-chat" */ './class_chat/controller')
      .then(({ installClassChat }) => { if (!ended) installClassChat(context.classChat); }));
    once('voiceCall', () => import(/* webpackChunkName: "voice-call-controls" */ './voice_call/ui')
      .then(({ installVoiceCall }) => { if (!ended) installVoiceCall(context.voiceCall); }));
    once('liveShare', () => import(/* webpackChunkName: "live-share-controls" */ './live_share/controller')
      .then(({ installLiveShare }) => { if (!ended) { installLiveShare(context.liveShare); ready(); } }));
    if (jobs.length) { await Promise.allSettled(jobs); ready(); }
  }
  const changed = (event: Event) => start((event as CustomEvent).detail?.context);
  window.addEventListener('onebyone:page-change', changed);
  window.addEventListener('onebyone:session-ended', () => {
    ended = true; window.removeEventListener('onebyone:page-change', changed);
  }, { once: true });
  await start(window.UiContext);
  ready();
}
