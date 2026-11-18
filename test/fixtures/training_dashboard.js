const path = require('node:path');
const nunjucks = require('nunjucks');

class DashboardLayoutLoader extends nunjucks.Loader {
    getSource(name) {
        if (name !== 'manage_base.html') return null;
        return { src: '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '</head><body><main>{% block manage_content %}{% endblock %}</main></body></html>', path: name, noCache: true };
    }
}
const templateRoot = path.resolve(__dirname, '../../packages/ui-default/templates');
const env = new nunjucks.Environment([new DashboardLayoutLoader(), new nunjucks.FileSystemLoader(templateRoot)], { autoescape: true, throwOnUndefined: true });
const baseUrl = '/d/python/manage/training-dashboard';
const link = (params) => `${baseUrl}?${new URLSearchParams(params)}`;
const domains = [{ id: 'python', name: 'Python 训练' }, { id: 'cpp', name: 'C++ 训练' }];

function point(label, rangeLabel, trainingMinutes, classMinutes, partial = false) {
    const minutes = trainingMinutes + classMinutes;
    return {
        label, rangeLabel, value: minutes * 60, timeLabel: `${minutes} 分钟`, shortLabel: `${minutes} 分`,
        trainingSeconds: trainingMinutes * 60, trainingLabel: `${trainingMinutes} 分钟`,
        classSeconds: classMinutes * 60, classLabel: `${classMinutes} 分钟`, partial, hasEstimate: false,
    };
}

function studentDetail(overrides = {}) {
    return {
        uid: 12, name: '方全然', uname: 'fang',
        periods: {
            recent: { dateLabel: '11/12–11/18', rangeLabel: '2026-11-12 至 2026-11-18', trainingSeconds: 5400, trainingLabel: '1 小时 30 分', classSeconds: 3600, classLabel: '1 小时', seconds: 9000, timeLabel: '2 小时 30 分', hasEstimate: false },
            week: { dateLabel: '11/16–11/18', rangeLabel: '2026-11-16 至 2026-11-18', trainingSeconds: 1200, trainingLabel: '20 分钟', classSeconds: 600, classLabel: '10 分钟', seconds: 1800, timeLabel: '30 分钟', hasEstimate: false },
        },
        trends: {
            weeks: [
                point('11/2', '2026-11-02 至 2026-11-08', 0, 0),
                point('11/9', '2026-11-09 至 2026-11-15', 70, 50),
                point('11/16', '2026-11-16 至 2026-11-18', 20, 10, true),
            ],
            months: [point('10月', '2026-10-01 至 2026-10-31', 30, 60), point('11月', '2026-11-01 至 2026-11-18', 90, 60, true)],
        },
        problems: [
            { kind: 'problem', domainId: 'python', domainName: 'Python 训练', pid: 'P4097', title: '数字替换', url: '/d/python/p/P4097', seconds: 2700, estimatedSeconds: 2700, timeLabel: '45 分钟', classTrainingLabel: '30 分钟', accepted: false, submits: 4 },
            { kind: 'problem', domainId: 'cpp', domainName: 'C++ 训练', pid: 'P998', title: '四位数是否有重复数字', url: '/d/cpp/p/P998', seconds: 1800, estimatedSeconds: 1800, timeLabel: '30 分钟', classTrainingLabel: '0 分钟', accepted: true, submits: 2 },
            { kind: 'problem', domainId: 'cpp', domainName: 'C++ 训练', pid: null, title: '暂不可查看的题目', url: '', seconds: 900, estimatedSeconds: 900, timeLabel: '15 分钟', accepted: false, submits: 0 },
        ],
        problemLimit: null, otherPracticeSeconds: 600, otherPracticeLabel: '10 分钟', ...overrides,
    };
}

function fixture(overrides = {}) {
    const detail = Object.hasOwn(overrides, 'detail') ? overrides.detail : studentDetail();
    const period = overrides.period || '7d';
    const q = overrides.q || '';
    const currentQuery = {
        period, q, domains: overrides.allDomains ? 'all' : 'python,cpp', start: '2026-11-12', end: '2026-11-18',
        page: '1', ...(detail && { student: String(detail.uid) }), ...overrides.currentQuery,
    };
    const rows = [['方全然', 'fang', 12], ['秦济舟', 'qin', 13], ['周烁', 'zhou', 10]].map(([name, uname, uid]) => ({
        name, uname, uid, detailUrl: `${link({ ...currentQuery, student: uid })}#training-student`, selected: uid === detail?.uid,
    }));
    const pageQuery = { ...currentQuery, page: '2' };
    delete pageQuery.student;
    const result = {
        period, periodLabel: period === 'thisWeek' ? '本周' : '近 7 天', start: currentQuery.start, end: currentQuery.end,
        allDomains: false, scopeLabel: '所选课堂', selectedDomainIds: ['python', 'cpp'], queryDomains: ['python', 'cpp'],
        domains: domains.map((domain) => ({ ...domain, selected: true })), q, rows, detail,
        periodLinks: [['7d', '近 7 天'], ['thisWeek', '本周']].map(([id, label]) => ({
            id, label, active: id === period, url: `${link({ ...currentQuery, period: id })}#training-problems`,
        })),
        pagination: { page: 1, pageCount: 2, total: 28, prevUrl: '', nextUrl: link(pageQuery) },
        integration: {
            url: 'https://onebyone.test/d/python/training-time/classes', manageUrl: link(currentQuery),
            status: { active: true, prefix: 'cls_demo', expiresLabel: '2027-10-27', domainIds: ['python', 'cpp'] },
            domains, token: '',
        },
        ...overrides, currentQuery,
    };
    return result;
}
function render(dashboard = fixture()) {
    return env.render('manage_training_dashboard.html', { dashboard });
}
module.exports = { fixture, studentDetail, render };
