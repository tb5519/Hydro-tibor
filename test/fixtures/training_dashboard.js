const path = require('node:path');
const nunjucks = require('nunjucks');

class DashboardLayoutLoader extends nunjucks.Loader {
    getSource(name) {
        if (name !== 'manage_base.html') return null;
        return { src: '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<style>body{margin:0;background:#f1f4f7}main{max-width:870px;margin:0 auto;padding:40px 24px}@media(max-width:620px){main{padding:22px 14px}}</style>'
            + '</head><body><main>{% block manage_content %}{% endblock %}</main></body></html>', path: name, noCache: true };
    }
}
const templateRoot = path.resolve(__dirname, '../../packages/ui-default/templates');
const env = new nunjucks.Environment([new DashboardLayoutLoader(), new nunjucks.FileSystemLoader(templateRoot)], { autoescape: true, throwOnUndefined: true });
const baseUrl = '/manage/training-dashboard';
const link = (query = {}) => `${baseUrl}?${new URLSearchParams({ period: '7d', domains: 'python,cpp', ...query })}`;
const classMinutes = [30, 90, 0, 120, 30, 90, 90];
const daily = [180, 240, 160, 300, 150, 260, 200].map((minutes, index) => ({
    date: `2026-10-${18 + index}`, label: `10/${18 + index}`, seconds: minutes * 60,
    timeLabel: `${minutes} 分钟`, barPercent: minutes / 300 * 100,
    trainingSeconds: (minutes - classMinutes[index]) * 60, trainingLabel: `${minutes - classMinutes[index]} 分钟`,
    classSeconds: classMinutes[index] * 60, classLabel: `${classMinutes[index]} 分钟`, legacySeconds: 0,
}));
const domainRows = [
    { id: 'python', name: 'Python 训练', selected: true, seconds: 54000, timeLabel: '15 小时', trainingSeconds: 36000, trainingLabel: '10 小时', classSeconds: 18000, classLabel: '5 小时', color: '#6b9fab', barPercent: 100 },
    { id: 'cpp', name: 'C++ 训练', selected: true, seconds: 35400, timeLabel: '9 小时 50 分', trainingSeconds: 26400, trainingLabel: '7 小时 20 分', classSeconds: 9000, classLabel: '2 小时 30 分', color: '#8a91bb', barPercent: 66 },
];
function fixture(overrides = {}) {
    const rows = ['周烁', '颂严', '方全然', '秦济舟', '宇智波佐助', '子恒'].map((name, index) => ({
        uid: 10 + index, name, seconds: index === 4 ? 0 : 12600 - index * 1800,
        timeLabel: index === 4 ? '暂无记录' : ['3 小时 30 分', '3 小时', '2 小时 30 分', '2 小时', '暂无记录', '1 小时'][index],
        trainingSeconds: [7200, 7200, 5400, 3600, 0, 3600][index], trainingLabel: ['2 小时', '2 小时', '1 小时 30 分', '1 小时', '0 分钟', '1 小时'][index],
        classSeconds: [5400, 3600, 3600, 3600, 0, 0][index], classLabel: ['1 小时 30 分', '1 小时', '1 小时', '1 小时', '0 分钟', '0 分钟'][index],
        submits: index === 4 ? 0 : [14, 9, 6, 5, 0, 8][index], acceptedProblems: index === 2 || index === 4 ? 0 : [8, 6, 0, 4, 0, 5][index],
        lastActiveLabel: index === 4 ? '暂无记录' : ['12 分钟前', '28 分钟前', '1 小时前', '昨天', '暂无记录', '2 天前'][index],
        attentionKind: index === 2 ? 'stuck' : index === 4 ? 'quiet' : 'normal',
        attentionLabel: index === 2 ? '投入较多，待了解' : index === 4 ? '暂无记录' : '—',
        detailUrl: `${link({ student: 10 + index })}#training-student`,
    }));
    const query = { period: '7d', domains: 'python,cpp', sort: 'time', attention: 'all', q: '', start: '2026-10-18', end: '2026-10-24' };
    const result = {
        period: '7d', periodLabel: '近 7 天', start: '2026-10-18', end: '2026-10-24', allDomains: false,
        domains: domainRows.map((row) => ({ ...row })), q: '', sort: 'time', attention: 'all', currentQuery: query,
        periodLinks: [['today', '今天'], ['7d', '近 7 天'], ['30d', '近 30 天'], ['thisWeek', '本周'], ['thisMonth', '本月']].map(([id, label]) => ({ id, label, active: id === '7d', url: link({ period: id }) })),
        sortLinks: [['time', '训练时长'], ['accepted', '通过题目'], ['submit', '代码提交'], ['lastActive', '最近活跃']].map(([id, label]) => ({ id, label, active: id === 'time', url: link({ sort: id }) })),
        attentionLinks: [['all', '全部学员', 24], ['stuck', '待了解', 2], ['quiet', '暂无记录', 5]].map(([id, label, count]) => ({ id, label, count, active: id === 'all', url: link({ attention: id }) })),
        summary: { seconds: 89400, timeLabel: '24 小时 50 分', trainingSeconds: 62400, trainingLabel: '17 小时 20 分', classSeconds: 27000, classLabel: '7 小时 30 分', overlapSeconds: 3600, overlapLabel: '1 小时', legacySeconds: 0, activeStudents: 19, studentCount: 24, acceptedProblems: 68, submits: 124 },
        daily, rows, pagination: { page: 1, pageCount: 3, total: 24, prevUrl: '', nextUrl: link({ page: 2 }) },
        closeDetailUrl: link(),
        detail: null,
        integration: { url: 'https://onebyone.test/training-time/classes', manageUrl: baseUrl,
            status: { active: true, prefix: 'cls_demo', expiresLabel: '2027-10-27', domainIds: ['python', 'cpp'] },
            domains: domainRows.map(({ id, name }) => ({ id, name })), token: null },
        ...overrides,
    };
    return result;
}
function studentDetail(overrides = {}) {
    return {
        uid: 12, name: '方全然',
        timeBreakdown: { seconds: 9000, timeLabel: '2 小时 30 分', trainingSeconds: 5400, trainingLabel: '1 小时 30 分', classSeconds: 3600, classLabel: '1 小时', overlapSeconds: 3600, overlapLabel: '1 小时', legacySeconds: 0 },
        overview: [
            { label: '本期训练', value: '2 小时 30 分', helper: '近 7 天' },
            { label: '最近 7 天', value: '2 小时 30 分', helper: '今天及之前 6 天' },
            { label: '本月训练', value: '12 小时 45 分', helper: '10 月 1 日至今' },
            { label: '平均每周', value: '3 小时 12 分', helper: '最近 4 个完整自然周' },
        ],
        domains: domainRows.map((row) => ({ ...row })), daily,
        problems: [
            { domainName: 'Python 训练', pid: 'P4097', title: '数字替换', url: '/d/python/p/P4097', seconds: 2700, timeLabel: '45 分钟', classTrainingLabel: '30 分钟', accepted: false, submits: 4 },
            { domainName: 'Python 训练', pid: 'P998', title: '四位数是否有重复数字', url: '/d/python/p/P998', seconds: 1800, timeLabel: '30 分钟', classTrainingLabel: '15 分钟', accepted: true, submits: 2 },
            { domainName: 'C++ 训练', pid: null, title: '每日一练', url: null, seconds: 900, timeLabel: '15 分钟', classTrainingLabel: '15 分钟', accepted: false, submits: 0 },
        ], problemLimit: 50,
        lessons: [{ externalId: 'classflow-lesson-123-student-12', title: '循环结构与课堂练习', domainName: 'Python 训练', startLabel: '2026-10-24 10:00', endLabel: '2026-10-24 11:00', timeLabel: '1 小时' }], lessonLimit: false,
        ...overrides,
    };
}
function render(dashboard = fixture()) {
    return env.render('manage_training_dashboard.html', { dashboard });
}
module.exports = { fixture, studentDetail, render };
