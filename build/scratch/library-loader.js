// Stock library files are prepared and verified at build time. Never accept a
// project-supplied host, credentials or arbitrary URL here.
export const assetURL = md5ext => {
    if (!/^[a-f0-9]{32}\.(svg|png|wav)$/.test(md5ext)) throw new Error('Invalid library asset');
    return `${process.env.ROOT || '/scratch-editor/'}library-assets/${md5ext}`;
};

export const loadLibrary = (component, getLibrary, transform = value => value) => {
    const token = {};
    component.onebyoneLoadToken = token;
    component.setState({data: null, libraryError: null});
    return Promise.resolve().then(getLibrary).then(data => {
        if (component.onebyoneLoadToken === token) component.setState({data: transform(data)});
    }).catch(() => {
        if (component.onebyoneLoadToken === token) {
            component.setState({libraryError: '素材列表没有加载成功，请重试。'});
        }
    });
};

// Preload before mutating the VM: its project importer intentionally substitutes
// default assets on download failure, which is inappropriate for a new selection.
export const prepareAssets = async (vm, names) => {
    const storage = vm.runtime.storage;
    await Promise.all([...new Set(names)].map(async name => {
        const url = assetURL(name);
        const [id, extension] = name.split('.');
        if (storage.get(id)) return;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch(url, {credentials: 'omit', signal: controller.signal});
            if (!response.ok) throw new Error('Library download failed');
            const data = new Uint8Array(await response.arrayBuffer());
            if (!data.length) throw new Error('Empty library asset');
            const type = extension === 'wav' ? storage.AssetType.Sound :
                extension === 'svg' ? storage.AssetType.ImageVector : storage.AssetType.ImageBitmap;
            storage.cache(type, extension, data, id);
        } finally {
            clearTimeout(timeout);
        }
    }));
};
