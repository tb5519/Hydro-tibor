import './polyfill';

import $ from 'jquery';
import { startImageWarmup } from './utils/image-warmup';
import { startBackgroundVideoWarmup } from './utils/background-video-warmup';
import { installAchievementWallReadiness } from './components/achievement_wall';
import { startAchievementAssetWarmup } from './components/achievement_assets';
import { startDailyQuizGate } from './components/daily_quiz_gate';
import { attachPlatformPage, installPlatformShell, notifyPlatformPageReady } from './utils/persistent-navigation';
import { registerPlatformServiceWorker } from './utils/service-worker-registration';

installAchievementWallReadiness();

window.Hydro = {
  extraPages: [],
  components: {},
  version: process.env.VERSION,
};
window.externalModules = {};
window.lazyModuleResolver = {};

console.log(
  '%c%s%c%s',
  'color:red;font-size:24px;',
  '   Welcome to\n',
  'color:blue;font-weight:bold;',
  `\
    __  __          __         
   / / / /_  ______/ /________ 
  / /_/ / / / / __  / ___/ __ \\
 / __  / /_/ / /_/ / /  / /_/ /
/_/ /_/\\__, /\\__,_/_/   \\____/ 
      /____/                   
`,
);

window.UiContext = JSON.parse(window.UiContext);
window.UserContext = JSON.parse(window.UserContext);
const contentPage = attachPlatformPage(window);
const communicationHost = window.top === window && document.documentElement.dataset.platformShell === 'host';
if (!communicationHost) {
  startDailyQuizGate(window.UiContext);
  $(document).on('vjContentNew.dailyQuizGate', () => startDailyQuizGate(window.UiContext));
  startAchievementAssetWarmup(window.UiContext);
  $(document).on('vjContentNew.achievementAssets', () => startAchievementAssetWarmup(window.UiContext));
  startImageWarmup(window.UiContext.imageWarmup);
  startBackgroundVideoWarmup(window.UiContext.backgroundVideoWarmup);
}
try {
  __webpack_public_path__ = UiContext.cdn_prefix;
} catch (e) { }
if (!communicationHost && window.UiContext.learningMediaWarmup) {
  void import('./utils/learning-media-warmup').then(({ startLearningMediaWarmup }) => {
    startLearningMediaWarmup(window.UiContext.learningMediaWarmup);
  }).catch(() => {});
}
if (!contentPage && 'serviceWorker' in navigator) {
  const sendConfig = () => fetch('/service-worker-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(UiContext.SWConfig),
  });
  registerPlatformServiceWorker(navigator.serviceWorker, UiContext.serviceWorkerVersion, sendConfig).then((registration) => {
    console.log('SW registered: ', registration);
  }).catch((registrationError) => {
    console.log('SW registration failed: ', registrationError);
  });
}

const PageLoader = '<div class="page-loader nojs--hide" style="display:none;"><div class="loader"></div></div>';
$('body').prepend(PageLoader);
$('.page-loader').fadeIn(500);
if (process.env.NODE_ENV === 'production' && UiContext.sentry_dsn) {
  window._sentryEvents = [];
  window.captureException = (e) => {
    if (!e.isUserFacingError) window._sentryEvents.push(e);
  };
  const script = document.createElement('script');
  script.src = '/sentry.js';
  document.body.appendChild(script);
}

document.addEventListener('DOMContentLoaded', async () => {
  Object.assign(window.UiContext, JSON.parse(window.UiContextNew));
  Object.assign(window.UserContext, JSON.parse(window.UserContextNew));
  if (communicationHost && installPlatformShell(window)) {
    // No page-specific handlers run in the connection host. Each content document
    // retains its own editor, event handlers and normal browser cleanup lifecycle.
    await import('./components/platform_shell').then(({ installPlatformCommunications }) => installPlatformCommunications());
    return;
  }
  if (contentPage) notifyPlatformPageReady(window);
  startDailyQuizGate(window.UiContext);
  startAchievementAssetWarmup(window.UiContext);
  window.HydroExports = await import('./api');
  await window._hydroLoad();
  await window.HydroExports.initPageLoader();
  if (contentPage) notifyPlatformPageReady(window);
}, false);
