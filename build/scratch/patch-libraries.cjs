// Checked replacements against the pinned upstream checkout. A source change
// must be reviewed instead of silently dropping a classroom reliability patch.
module.exports = (file, input) => {
    let source = input;
    const replace = (before, after) => {
        if (!source.includes(before)) throw new Error(`Pinned library patch no longer matches ${file}: ${before.slice(0, 70)}`);
        source = source.replace(before, after);
    };
    if (file === 'src/lib/storage.js') {
        replace("import ScratchStorage from '@turbowarp/scratch-storage';", "import ScratchStorage from '@turbowarp/scratch-storage';\nimport {assetURL} from './onebyone-library-loader';");
        replace('return `${this.assetHost}/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`;',
            'return assetURL(`${asset.assetId}.${asset.dataFormat}`);');
    } else if (file === 'src/containers/library-item.jsx') {
        replace("import bindAll from 'lodash.bindall';", "import bindAll from 'lodash.bindall';\nimport {assetURL} from '../lib/onebyone-library-loader';");
        replace('`https://cdn.assets.scratch.mit.edu/internalapi/asset/${iconMd5}/get/`', 'assetURL(iconMd5)');
    } else if (file === 'src/components/library/library.jsx') {
        replace('    componentDidMount () {', '    componentWillUnmount () {\n        this.onebyoneMounted = false;\n    }\n    componentDidMount () {\n        this.onebyoneMounted = true;');
        replace('handleSelect (id) {\n        this.handleClose();\n        this.props.onItemSelected(this.getFilteredData()[id]);\n    }', `async handleSelect (id) {
        if (this.onebyoneSelecting) return;
        this.onebyoneSelecting = true;
        this.setState({selecting: true, selectionError: null});
        try {
            await this.props.onItemSelected(this.getFilteredData()[id]);
            this.handleClose();
        } catch (error) {
            this.setState({selectionError: '素材没有添加成功，请再点一次重试。已有作品不会丢失。'});
        } finally {
            this.onebyoneSelecting = false;
            if (this.onebyoneMounted) this.setState({selecting: false});
        }
    }`);
        // Do not allow closing the chooser while an insertion is pending. This
        // also keeps retries associated with the original editing target.
        replace('handleClose () {\n        this.props.onRequestClose();\n    }', 'handleClose () {\n        if (!this.onebyoneSelecting) this.props.onRequestClose();\n    }');
        replace('await this.props.onItemSelected(this.getFilteredData()[id]);\n            this.handleClose();',
            'await this.props.onItemSelected(this.getFilteredData()[id]);\n            this.onebyoneSelecting = false;\n            this.handleClose();');
        replace('                <div\n                    className={classNames(styles.libraryScrollGrid, {', `                {this.props.onOpenPresetLibrary && (
                    <div className="onebyone-preset-library">
                        <button type="button" disabled={!!this.state.selecting} onClick={this.props.onOpenPresetLibrary}>老师素材</button>
                        <span>看看老师为这个课堂准备了什么</span>
                    </div>
                )}
                {(this.state.selecting || this.state.selectionError || this.props.libraryError || this.props.previewError) && (
                    <div className="onebyone-library-notice" role="status" aria-live="polite">
                        {this.state.selecting ? '正在添加素材，请稍等…' : (this.state.selectionError || this.props.libraryError || this.props.previewError)}
                        {this.props.libraryError && <button type="button" onClick={this.props.onRetryLoad}>重新加载</button>}
                    </div>
                )}
                <div
                    aria-busy={!!this.state.selecting}
                    className={classNames(styles.libraryScrollGrid, {`);
        replace('{!filteredData && (', '{!filteredData && !this.props.libraryError && (');
    } else {
        const kind = /src\/containers\/(costume|sprite|backdrop|sound)-library\.jsx/.exec(file)?.[1];
        if (!kind) throw new Error(`Unexpected library source: ${file}`);
        const getter = `get${kind[0].toUpperCase()}${kind.slice(1)}Library`;
        replace("import bindAll from 'lodash.bindall';", "import bindAll from 'lodash.bindall';\nimport {loadLibrary, prepareAssets} from '../lib/onebyone-library-loader';");
        if (kind !== 'sound') {
            replace(`data: ${getter}()`, 'data: null');
            replace(`componentDidMount () {
        if (this.state.data.then) {
            this.state.data.then(data => this.setState({
                data
            }));
        }
    }`, `componentDidMount () {
        this.loadLibrary = () => loadLibrary(this, ${getter});
        this.loadLibrary();
    }
    componentWillUnmount () {
        this.onebyoneLoadToken = null;
    }`);
            replace('data={this.state.data.then ? null : this.state.data}', 'data={this.state.data}');
        } else {
            replace(`        const soundLibrary = getSoundLibrary();
        if (soundLibrary.then) {
            soundLibrary.then(data => this.setState({
                data: getSoundLibraryThumbnailData(data, this.props.isRtl)
            }));
        } else {
            this.setState({
                data: getSoundLibraryThumbnailData(soundLibrary, this.props.isRtl)
            });
        }`, `        this.loadLibrary = () => loadLibrary(this, getSoundLibrary,
            data => getSoundLibraryThumbnailData(data, this.props.isRtl));
        this.loadLibrary();`);
            replace('componentWillUnmount () {\n        this.stopPlayingSound();', 'componentWillUnmount () {\n        this.onebyoneLoadToken = null;\n        this.stopPlayingSound();');
            replace('this.playingSoundPromise = vm.runtime.storage.load(vm.runtime.storage.AssetType.Sound, md5)',
                "this.setState({previewError: null});\n        this.playingSoundPromise = prepareAssets(vm, [md5ext])\n            .then(() => vm.runtime.storage.load(vm.runtime.storage.AssetType.Sound, md5))");
            replace('            });\n    }\n    handleItemMouseLeave', `            }).catch(() => {
                if (this.onebyoneLoadToken) this.setState({previewError: '暂时无法试听，请再点一次。'});
                if (this.handleStop) this.handleStop();
                return null;
            });
    }
    handleItemMouseLeave`);
        }
        replace('                onRequestClose={this.props.onRequestClose}', `                libraryError={this.state.libraryError}
                previewError={this.state.previewError}
                onRetryLoad={this.loadLibrary}
                onOpenPresetLibrary={() => {
                    if (window.onebyoneOpenPresetLibrary && window.onebyoneOpenPresetLibrary('${kind}')) this.props.onRequestClose();
                }}
                onRequestClose={this.props.onRequestClose}`);
        if (kind === 'costume') replace('this.props.vm.addCostumeFromLibrary(item.md5ext, vmCostume);',
            'return prepareAssets(this.props.vm, [item.md5ext]).then(() =>\n            this.props.vm.addCostumeFromLibrary(item.md5ext, vmCostume));');
        if (kind === 'backdrop') replace('this.props.vm.addBackdrop(item.md5ext, vmBackdrop);',
            'return prepareAssets(this.props.vm, [item.md5ext]).then(() =>\n            this.props.vm.addBackdrop(item.md5ext, vmBackdrop));');
        if (kind === 'sprite') replace('this.props.vm.addSprite(JSON.stringify(item)).then(() => {',
            'return prepareAssets(this.props.vm, [...item.costumes, ...item.sounds].map(asset => asset.md5ext))\n            .then(() => this.props.vm.addSprite(JSON.stringify(item))).then(() => {');
        if (kind === 'sound') replace('this.props.vm.addSound(vmSound).then(() => {',
            'return prepareAssets(this.props.vm, [soundItem._md5]).then(() => this.props.vm.addSound(vmSound)).then(() => {');
    }
    return source;
};
