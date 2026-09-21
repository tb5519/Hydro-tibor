import {costumeUpload, soundUpload} from './file-uploader';
import {loadCostume} from 'scratch-vm/src/import/load-costume';
import {deserialize} from 'scratch-vm/src/serialization/sb3';
import validate from 'scratch-parser';

const kinds = new Set(['sprite', 'costume', 'sound', 'backdrop']);
const images = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml'};
const sounds = {mp3: ['audio/mpeg', 'audio/mp3'], wav: ['audio/wav', 'audio/wave', 'audio/x-wav']};
const spriteMimes = new Set(['application/octet-stream', 'application/zip', 'application/x.scratch.sprite3',
    'application/x-scratch3-sprite', 'application/x.scratch3.sprite']);
const builtins = new Set(['pen', 'music', 'makeymakey']);
const blockCategories = new Set(['motion', 'looks', 'sound', 'event', 'control', 'sensing', 'operator', 'data',
    'procedures', 'argument', ...builtins]);
const limit = 20 * 1024 * 1024;
const failure = message => { throw new Error(message); };
const liveTarget = (vm, kind, targetId) => {
    const target = kind === 'backdrop' ? vm.runtime.getTargetForStage() : vm.runtime.getTargetById(targetId);
    if (!target || !target.isOriginal) failure('原来的角色已不在作品里，请重新选择角色。');
    if (kind === 'costume' && target.isStage) failure('请先选择一个角色，再添加造型。');
    return target;
};
const convert = (method, ...args) => new Promise((resolve, reject) => method(...args, resolve, reject));

// The parent sends only server-authorized bytes. Validate again before the VM
// can fall back to fetching a missing archive asset or loading an extension.
const readSprite = async file => {
    const [sprite, zip] = await new Promise((resolve, reject) => {
        validate(new Uint8Array(file), true, (error, result) => error ? reject(error) : resolve(result));
    });
    if (sprite.projectVersion !== 3 || sprite.isStage || !zip || !Array.isArray(sprite.costumes)
        || !Array.isArray(sprite.sounds) || !sprite.costumes.length) failure('请选择完整的 Scratch 3 角色文件。');
    const pending = [sprite];
    let nodes = 0;
    while (pending.length) {
        const value = pending.pop();
        if (!value || typeof value !== 'object') continue;
        if (++nodes > 200000) failure('角色文件过于复杂。');
        for (const [key, child] of Object.entries(value)) {
            if (/^(extensionurls|customextensions|extensionurl|extensioncode|customfonts)$/i.test(key)
                && child && (typeof child !== 'object' || Object.keys(child).length)) failure('这个角色包含暂不支持的扩展或字体。');
            if (key === 'extensions' && (!Array.isArray(child) || child.some(id => !builtins.has(id)))) {
                failure('这个角色包含暂不支持的扩展。');
            }
            if (key === 'opcode' && (typeof child !== 'string' || !blockCategories.has(child.split('_')[0]))) {
                failure('这个角色包含暂不支持的积木。');
            }
            if (child && typeof child === 'object') pending.push(child);
        }
    }
    for (const asset of [...sprite.costumes, ...sprite.sounds]) {
        const name = `${asset.assetId}.${asset.dataFormat}`;
        if (!/^[a-f0-9]{32}\.(svg|png|jpg|jpeg|wav|mp3)$/.test(name) || !zip.file(name)
            || (asset.md5ext && asset.md5ext !== name) || asset.asset) {
            failure('角色文件缺少造型或声音，请重新上传完整文件。');
        }
    }
    return {sprite, zip};
};

const addSprite = async (vm, sprite, zip, title) => {
    sprite.name = title;
    const previousOrigin = vm.runtime.origin;
    const originalStage = vm.runtime.getTargetForStage();
    let targets = [];
    try {
        const result = await deserialize(sprite, vm.runtime, zip, true);
        targets = result.targets;
        if (targets.length !== 1 || targets[0].isStage
            || targets.some(target => [...target.getCostumes(), ...target.getSounds()].some(asset => asset.broken))) {
            failure('角色里的素材无法读取，请老师检查后重新上传。');
        }
        if ([...result.extensions.extensionIDs].some(id => !builtins.has(id))) failure('这个角色包含暂不支持的扩展。');
        if (vm.runtime.getTargetForStage() !== originalStage) failure('作品已发生切换，请重新选择素材。');
        await vm.installTargets(targets, result.extensions, false);
        vm.runtime.emitProjectChanged();
    } catch (error) {
        // Deserialization creates temporary render targets before installation.
        // Failed imports must not leave an extra sprite or replace this project.
        for (const target of targets) if (!vm.runtime.targets.includes(target)) target.dispose();
        throw error;
    } finally {
        vm.runtime.origin = previousOrigin;
    }
};

export const importPreset = async (vm, message) => {
    const {kind, filename, targetId} = message;
    let {file} = message;
    let mime = typeof message.mime === 'string' ? message.mime.split(';')[0].trim().toLowerCase() : '';
    const extension = typeof filename === 'string' ? filename.split('.').pop().toLowerCase() : '';
    if (!kinds.has(kind) || !(file instanceof ArrayBuffer) || !file.byteLength || file.byteLength > limit) {
        failure('素材无效或超过 20 MB，请重新选择。');
    }
    const title = String(message.title || filename || '老师素材').trim().slice(0, 120) || '老师素材';
    if (kind === 'sprite' && extension === 'sprite3' && spriteMimes.has(mime)) {
        const {sprite, zip} = await readSprite(file);
        await addSprite(vm, sprite, zip, title);
        return;
    }
    const target = kind === 'sprite' ? null : liveTarget(vm, kind, targetId);
    if (kind === 'sound') {
        if (!sounds[extension]?.includes(mime)) failure('声音素材须为 MP3 或 WAV。');
        const sound = await convert(soundUpload, file, mime, vm.runtime.storage);
        sound.name = title;
        // Decode without attaching to the live sound bank. A decode error must
        // not turn into the VM's default sound and be reported as a success.
        const player = await vm.runtime.audioEngine.decodeSoundPlayer({...sound, data: sound.asset.data});
        try {
            if (liveTarget(vm, kind, targetId) !== target) failure('原来的角色已不在作品里，请重新选择角色。');
        } catch (error) { player.dispose(); throw error; }
        sound.soundId = player.id;
        sound.rate = player.buffer.sampleRate;
        sound.sampleCount = player.buffer.length;
        target.sprite.soundBank.addSoundPlayer(player);
        target.addSound(sound);
        vm.emitTargetsUpdate();
        return;
    }
    if (images[extension] !== mime) failure('图片素材格式不匹配，请重新选择。');
    if (mime === 'image/webp') {
        // The pinned webp helper has no image.onerror. Decode explicitly so an
        // invalid picture rejects rather than leaving the preset queue stuck.
        const image = await createImageBitmap(new Blob([file], {type: mime}));
        try {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            canvas.getContext('2d').drawImage(image, 0, 0);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) failure('图片无法转换，请重新选择。');
            file = await blob.arrayBuffer();
            mime = 'image/png';
        } finally { image.close(); }
    }
    const [costume] = await convert(costumeUpload, file, mime, vm);
    costume.name = title;
    if (kind === 'sprite') {
        await addSprite(vm, {name: title, isStage: false, x: 0, y: 0, visible: true, size: 100,
            rotationStyle: 'all around', direction: 90, draggable: false, currentCostume: 0,
            blocks: {}, variables: {}, lists: {}, broadcasts: {}, costumes: [costume], sounds: []}, null, title);
        return;
    }
    await loadCostume(costume.md5, costume, vm.runtime);
    try {
        if (costume.broken) failure('图片无法读取，请老师检查后重新上传。');
        if (liveTarget(vm, kind, targetId) !== target) failure('原来的角色已不在作品里，请重新选择角色。');
        target.addCostume(costume);
        target.setCostume(target.getCostumes().length - 1);
        vm.runtime.emitProjectChanged();
    } catch (error) {
        if (costume.skinId !== undefined && costume.skinId !== null) vm.runtime.renderer.destroySkin(costume.skinId);
        throw error;
    }
};

export const createPresetBridge = (vm, canImport, send) => {
    const completed = new Set();
    let pending = null;
    const open = (kind = 'sprite') => {
        if (!canImport() || pending || !kinds.has(kind)) return false;
        send('openPresetLibrary', {kind, targetId: vm.editingTarget?.id || null});
        return true;
    };
    const receive = async message => {
        if (message.type === 'requestPresetLibrary') { open(); return; }
        const id = message.id;
        let ownsPending = false;
        try {
            if (!canImport()) failure('请等待作品打开后，再添加老师素材。');
            if (typeof id !== 'string' || !id || id.length > 128) failure('素材请求无效，请重新选择。');
            if (completed.has(id)) { send('presetImported', {id}); return; }
            if (pending) {
                if (pending.id === id) return;
                failure('正在添加另一个素材，请稍等。');
            }
            pending = {id};
            ownsPending = true;
            await importPreset(vm, message);
            completed.add(id);
            send('presetImported', {id});
        } catch (error) {
            send('presetImportError', {id, message: error?.message || '素材暂时没有添加成功，请重新选择。'});
        } finally {
            if (ownsPending && pending?.id === id) pending = null;
        }
    };
    return {open, receive};
};
