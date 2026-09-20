const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const base = require('./webpack.config.js')[0];
// Only ship the editor. No homepage, gallery, addons, cloud or external embed.
base.entry = { editor: './src/playground/editor.jsx' };
base.plugins = base.plugins.filter(plugin => !(plugin instanceof HtmlWebpackPlugin));
base.plugins.push(new HtmlWebpackPlugin({
    chunks: ['editor'], template: 'src/playground/onebyone.ejs', filename: 'editor.html'
}));
base.plugins.push(new webpack.NormalModuleReplacementPlugin(
    /lib[\\/]libraries[\\/]extensions[\\/]index\.jsx$/,
    resource => { resource.request = path.resolve(__dirname, 'src/lib/libraries/extensions/onebyone.jsx'); }
));
base.plugins.push(new webpack.NormalModuleReplacementPlugin(
    /containers[\\/]tw-restore-point-manager\.jsx$/,
    resource => { resource.request = path.resolve(__dirname, 'src/playground/onebyone-noop.jsx'); }
));
module.exports = base;
