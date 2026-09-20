/* OneByOne's isolated TurboWarp entry point. See README.md for upstream licensing. */
import './import-first';
import React from 'react';
import {compose} from 'redux';
import GUI from '../containers/gui.jsx';
import AppStateHOC from '../lib/app-state-hoc.jsx';
import ErrorBoundaryHOC from '../lib/error-boundary-hoc.jsx';
import {vmInitialState as vm} from '../reducers/vm';
import {setProjectTitle} from '../reducers/project-title';
import {setProjectUnchanged} from '../reducers/project-changed';
import {setPlayer} from '../reducers/mode';
import {setTheme} from '../reducers/theme';
import {Theme, ACCENT_BLUE} from '../lib/themes';
import TWFullScreenHOC from '../lib/tw-embed-fullscreen-hoc.jsx';
import render from './app-target';

// This iframe deliberately has an opaque origin: never enable allow-same-origin.
// No untrusted extension source can reach the VM, including imports from .sb3.
const builtins = new Set(['pen', 'music', 'makeymakey']);
const originalLoad = vm.extensionManager.loadExtensionURL.bind(vm.extensionManager);
vm.extensionManager.loadExtensionURL = id => {
    if (!builtins.has(id)) return Promise.reject(new Error('此课堂未开放该扩展。'));
    return originalLoad(id);
};
const deny = () => false;
const securityManager = {
    canLoadExtensionFromProject: deny,
    canFetch: deny,
    canOpenWindow: deny,
    canRedirect: deny,
    canRecordAudio: deny,
    canRecordVideo: deny,
    canReadClipboard: deny,
    canNotify: deny,
    canGeolocate: deny,
    canEmbed: deny,
    canDownload: deny
};

const params = new URLSearchParams(location.hash.slice(1));
const channel = params.get('channel');
let initialized = false;
let readOnly = true;
let exporting = false;
let previewing = false;
let mode = 'thumbnail';
let defaultProject;
const send = (type, payload = {}, transfer = []) => {
    if (channel && parent !== window) parent.postMessage({channel, type, ...payload}, '*', transfer);
};
// Browser confirm() and the File System Access API are unavailable to an
// opaque sandbox. Keep local imports usable without relaxing that boundary.
window.onebyoneConfirmProjectReplacement = () => new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'onebyone-import-confirm';
    dialog.setAttribute('aria-labelledby', 'onebyone-import-heading');
    dialog.innerHTML = '<h2 id="onebyone-import-heading">打开电脑里的作品？</h2>' +
        '<p>打开后会替换编辑器里的内容，不会创建新的课堂作品。</p>' +
        '<p>还有修改没保存？请先取消，点右上角「保存作品」后再打开。</p>' +
        '<div><button type="button" data-cancel autofocus>先取消</button>' +
        '<button type="button" data-confirm>打开作品</button></div>';
    const finish = accepted => {
        dialog.remove();
        resolve(accepted);
    };
    dialog.querySelector('[data-cancel]').onclick = () => finish(false);
    dialog.querySelector('[data-confirm]').onclick = () => finish(true);
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        finish(false);
    });
    document.body.appendChild(dialog);
    dialog.showModal();
});
const thumbnail = () => new Promise(resolve => {
    const renderer = vm.renderer;
    if (!renderer || !renderer.requestSnapshot) return resolve(null);
    const timer = setTimeout(() => resolve(null), 1500);
    try {
        renderer.requestSnapshot(data => {
            if (!data) {
                clearTimeout(timer);
                resolve(null);
                return;
            }
            const image = new Image();
            image.onload = () => {
                clearTimeout(timer);
                const canvas = document.createElement('canvas');
                canvas.width = 480;
                canvas.height = 360;
                const context = canvas.getContext('2d');
                const scale = Math.min(480 / image.naturalWidth, 360 / image.naturalHeight);
                const width = image.naturalWidth * scale;
                const height = image.naturalHeight * scale;
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, 480, 360);
                context.drawImage(image, (480 - width) / 2, (360 - height) / 2, width, height);
                resolve(canvas.toDataURL('image/png'));
            };
            image.onerror = () => {
                clearTimeout(timer);
                resolve(null);
            };
            image.src = data;
        });
        // Thumbnail mode intentionally has no VM loop to trigger the next draw.
        renderer.draw();
    } catch (error) {
        clearTimeout(timer);
        resolve(null);
    }
});
const loadPreview = async message => {
    if (previewing) return;
    previewing = true;
    try {
        vm.stopAll();
        vm.quit();
        await vm.loadProject(message.project instanceof ArrayBuffer ? message.project : defaultProject.slice(0));
        vm.stopAll();
        // Skin loading can finish just after loadProject resolves. Never run hats
        // or a VM tick merely to make a card cover.
        await new Promise(resolve => setTimeout(resolve, 80));
        send('thumbnail', {id: message.id, thumbnail: await thumbnail()});
    } catch (error) {
        send('thumbnail', {id: message.id, thumbnail: null});
    } finally {
        previewing = false;
    }
};
window.addEventListener('message', async event => {
    if (event.source !== parent || !channel || event.data?.channel !== channel) return;
    const message = event.data;
    try {
        if (message.type === 'init' && !initialized) {
            initialized = true;
            mode = message.mode === 'thumbnail' ? 'thumbnail' :
                (message.mode === 'player' || message.readOnly ? 'player' : 'editor');
            readOnly = Boolean(message.readOnly) || mode !== 'editor';
            document.documentElement.dataset.onebyoneMode = mode;
            const stageOnly = mode !== 'editor';
            window.ReduxStore.dispatch({type: 'onebyone/SET_EMBEDDED', isEmbedded: stageOnly});
            window.ReduxStore.dispatch(setPlayer(stageOnly));
            window.ReduxStore.dispatch(setTheme(Theme.light.set('accent', ACCENT_BLUE)));
            if (mode === 'thumbnail') {
                await loadPreview(message);
                return;
            }
            vm.stopAll();
            if (message.project instanceof ArrayBuffer) await vm.loadProject(message.project);
            window.ReduxStore.dispatch(setProjectTitle(String(message.title || 'Scratch 作品')));
            window.ReduxStore.dispatch(setProjectUnchanged());
            let previousTitle = window.ReduxStore.getState().scratchGui.projectTitle;
            window.ReduxStore.subscribe(() => {
                const title = window.ReduxStore.getState().scratchGui.projectTitle;
                if (title === previousTitle) return;
                previousTitle = title;
                if (!readOnly && mode === 'editor') send('titleChanged', {title});
            });
            vm.start();
            vm.on('PROJECT_CHANGED', () => {
                if (!readOnly && mode === 'editor') send('dirty');
            });
            // Local file import may preserve the title and emits PROJECT_LOADED
            // instead of PROJECT_CHANGED. Register after the initial load only.
            vm.runtime.on('PROJECT_LOADED', () => {
                if (!readOnly && mode === 'editor') send('dirty');
            });
            if (mode === 'player') vm.greenFlag();
            send('loaded');
        } else if (message.type === 'preview' && initialized && mode === 'thumbnail' && readOnly) {
            await loadPreview(message);
        } else if (message.type === 'export' && initialized && mode === 'editor' && !readOnly && !exporting) {
            exporting = true;
            const blob = await vm.saveProjectSb3();
            const file = await blob.arrayBuffer();
            const preview = await thumbnail();
            send('exported', {id: message.id, file, thumbnail: preview}, [file]);
        } else if (message.type === 'saved' && initialized) {
            window.ReduxStore.dispatch(setProjectUnchanged());
        }
    } catch (error) {
        send('error', {id: message.id, message: error.message || '编辑器操作失败'});
    } finally {
        exporting = false;
    }
});

const Editor = compose(AppStateHOC, ErrorBoundaryHOC('Scratch 课堂'), TWFullScreenHOC)(GUI);
let notifiedReady = false;
render(<Editor
    basePath={process.env.ROOT}
    projectId="0"
    isEmbedded
    isPlayerOnly
    canSave={false}
    canCreateNew={false}
    showOpenFilePicker={null}
    showSaveFilePicker={null}
    canEditTitle
    canChangeLanguage={false}
    canChangeTheme={false}
    canUseCloud={false}
    hasCloudPermission={false}
    enableCommunity={false}
    showComingSoon={false}
    securityManager={securityManager}
    onProjectLoaded={async () => {
        if (!notifiedReady) {
            notifiedReady = true;
            defaultProject = await (await vm.saveProjectSb3()).arrayBuffer();
            send('ready');
        }
    }}
/>);
