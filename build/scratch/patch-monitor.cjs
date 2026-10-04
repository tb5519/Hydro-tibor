// Pinned upstream integration: leave editor layout and list sizes untouched.
module.exports = function patchMonitor(source) {
    const replacements = [
        ["import monitorAdapter from '../lib/monitor-adapter.js';", "import monitorAdapter from '../lib/monitor-adapter.js';\nimport installPlayerMonitorLayout from '../lib/onebyone-player-monitor-layout.js';"],
        ['        this.element.style.left = `${rect.upperStart.x}px`;', '        this.element.style.left = `${rect.upperStart.x}px`;\n        this.onebyoneStopMonitorLayout = installPlayerMonitorLayout(this.element, this.props);'],
        ['    componentWillUnmount () {\n        this.props.removeMonitorRect(this.props.id);', '    componentWillUnmount () {\n        if (this.onebyoneStopMonitorLayout) this.onebyoneStopMonitorLayout();\n        this.props.removeMonitorRect(this.props.id);']
    ];
    for (const [before, after] of replacements) {
        if (source.split(before).length !== 2) throw new Error('Pinned player monitor layout patch no longer matches.');
        source = source.replace(before, after);
    }
    return source;
};
