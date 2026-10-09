const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const uiRoot = path.resolve(__dirname, '../../packages/ui-default');
const source = fs.readFileSync(path.join(uiRoot, 'templates/manage_user_management.html'), 'utf8');
class Loader extends nunjucks.Loader {
    getSource(name) {
        const templates = {
            'manage_user_management.html': source,
            'manage_base.html': '<!doctype html><html><body>{% block manage_content %}{% endblock %}</body></html>',
            'layout/basic.html': '<!doctype html><html><body>{% block content %}{% endblock %}</body></html>',
        };
        return templates[name] ? { src: templates[name], path: name, noCache: true } : null;
    }
}
const env = new nunjucks.Environment(new Loader(), { autoescape: true });
env.addFilter('json', (value) => JSON.stringify(value));
const code = buildSync({ entryPoints: [path.join(uiRoot, 'components/student_management.ts')], bundle: true,
    write: false, format: 'iife', globalName: 'studentManagement', target: 'es2022' }).outputFiles[0].text;
const students = [
    { uid: 44, uname: 'leo', displayName: 'Leo', mail: 'leo@invalid.local', studentLevel: 1,
        cppEditorMode: 'proficient', submitCount: 4, acceptedCount: 2, domainIds: ['system', 'S0001'],
        domainNames: ['Python 训练', 'Scratch 创作'], searchText: 'leo 44', dailyQuizEnabled: false },
    { uid: 45, uname: 'amy', displayName: 'Amy', mail: 'amy@invalid.local', studentLevel: 1,
        cppEditorMode: 'beginner', submitCount: 7, acceptedCount: 1, domainIds: ['C0001'],
        domainNames: ['C++ 训练'], searchText: 'amy 45', dailyQuizEnabled: true },
];
const domains = [ { id: 'system', name: 'Python 训练' }, { id: 'S0001', name: 'Scratch 创作' }, { id: 'C0001', name: 'C++ 训练' } ];
const daily = {
    policy: { version: 1, enabled: false, cooldownRounds: 3, domains: [
        { domainId: 'system', enabled: true, count: 2, tags: [], points: [0, 3] },
        { domainId: 'S0001', enabled: true, count: 1, tags: [], points: [2] },
    ] },
    domains: domains.slice(0, 2).map((domain) => ({ ...domain, availableCount: 3,
        tags: [{ name: '循环', count: 2 }, { name: '变量', count: 2 }],
        questionTags: [['循环'], ['循环', '变量'], ['变量']], createUrl: '/d/' + domain.id + '/problem/objective',
    })),
    summary: { completedDays: 2, answeredCount: 6, correctCount: 4, wrongCount: 2, earnedPoints: 8,
        masteredCount: 4, recentSessions: [{ day: '2026-10-07', total: 3, answered: 3, earnedPoints: 2, completed: true }] },
    report: { day: '2026-10-08', total: 3, answered: 2, correctCount: 1, wrongCount: 1, earnedPoints: 3, completed: false,
        items: [true, false, null].map((correct, i) => ({
            id: 'q' + i, index: i + 1, domainId: 'system', domainName: 'Python 训练', title: '第' + (i + 1) + '道题',
            stem: '**题干** <img src=x onerror=alert(1)>\n\n![示意图](/manage/quiz/file/diagram.png)', kind: 'single', tags: ['循环'],
            options: ['选项 **一**', '选项二'], answers: ['A'], selected: correct === null ? null : (correct ? ['A'] : ['B']),
            correct, points: 3, earnedPoints: correct ? 3 : 0, analysis: '使用循环完成。',
        })),
    },
};
daily.learning = {
    summary: { total: 3, answered: 2, correctCount: 1, wrongCount: 1, unseenCount: 1, accuracy: 50, participationCount: 2, earnedPoints: 8 },
    tags: [{ domainId: 'system', domainName: 'Python 训练', name: '循环', total: 3, answered: 2, correctCount: 1, wrongCount: 1, accuracy: 50 }],
    questions: daily.report.items.filter((item) => item.correct !== null),
    sessions: [
        { id: 'round-2', round: 2, day: '2026-10-08', total: 3, answered: 2, correctCount: 1, wrongCount: 1, earnedPoints: 3, completed: false, detailUrl: '/manage/daily-quiz/student/44/session/round-2' },
        { id: 'round-1', round: 1, day: '2026-10-07', total: 3, answered: 3, correctCount: 2, wrongCount: 1, earnedPoints: 5, completed: true, detailUrl: '/manage/daily-quiz/student/44/session/round-1' },
    ],
};
function render(overrides = {}, joinedCount = 2) {
    const selected = overrides.selectedStudent || students[0];
    return env.render('manage_user_management.html', {
        _: (value) => value, url: (name, options) => '/manage/users?' + new URLSearchParams(options?.query || {}),
        avatarUrl: () => '/avatar.png', students, selectedStudent: selected,
        selectedStudentDomains: domains.slice(0, joinedCount === 1 ? 1 : 2),
        selectedStudentJoinedDomainCount: joinedCount, selectedStudentDefaultDomain: 'system',
        allDomains: domains, studentLevels: [{ value: 1, label: '1 级' }],
        sort: 'submit', order: 'desc', saved: 0, selectedDailyQuiz: daily, ...overrides,
    });
}
function page(joinedCount = 2, overrides = {}, query = 'uid=44') {
    const dom = new JSDOM(render(overrides, joinedCount), {
        runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/manage/users?' + query,
    });
    dom.window.eval(code);
    dom.window.studentManagement.bindStudentManagement(dom.window.document);
    return dom;
}
module.exports = { page, render, students, daily, settle: () => new Promise((resolve) => setImmediate(resolve)) };
