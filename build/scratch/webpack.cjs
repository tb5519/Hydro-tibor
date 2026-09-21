const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const base = require('./webpack.config.js')[0];
// ROOT is also compiled into the early runtime public-path initializer and
// GUI basePath (blocks-media). All three must point to the same asset directory.
base.output.publicPath = process.env.ROOT || '/scratch-editor/';
base.output.crossOriginLoading = 'anonymous';
// Only ship the editor. No homepage, gallery, addons, cloud or external embed.
base.entry = { editor: './src/playground/editor.jsx' };
base.plugins = base.plugins.filter(plugin => !(plugin instanceof HtmlWebpackPlugin));
base.plugins.push(new HtmlWebpackPlugin({
    chunks: ['editor'], template: 'src/playground/onebyone.ejs', filename: 'editor.html'
}));
base.plugins.push({
    apply(compiler) {
        compiler.hooks.compilation.tap('OneByOneAnonymousScripts', compilation => {
            HtmlWebpackPlugin.getHooks(compilation).alterAssetTags.tap('OneByOneAnonymousScripts', data => {
                for (const script of data.assetTags.scripts) script.attributes.crossorigin = 'anonymous';
                return data;
            });
        });
    }
});
base.plugins.push(new webpack.NormalModuleReplacementPlugin(
    /lib[\\/]libraries[\\/]extensions[\\/]index\.jsx$/,
    resource => { resource.request = path.resolve(__dirname, 'src/lib/libraries/extensions/onebyone.jsx'); }
));
base.plugins.push(new webpack.NormalModuleReplacementPlugin(
    /containers[\\/]tw-restore-point-manager\.jsx$/,
    resource => { resource.request = path.resolve(__dirname, 'src/playground/onebyone-noop.jsx'); }
));
// A nested sandbox gets a distinct opaque origin, so Paper cannot call
// iframe.contentDocument.open(). Parse SVG in an inert document instead.
// Apply at compilation so npm ci and the published source archive reproduce it.
base.module.rules.push({
    test: /node_modules[\\/]@turbowarp[\\/]paper[\\/]dist[\\/]paper-(?:full|core)\.js$/,
    loader: path.resolve(__dirname, 'src/playground/onebyone-paper-sandbox-loader.cjs')
});
module.exports = base;
