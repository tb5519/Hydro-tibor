/* eslint-disable react-refresh/only-export-components */
import type { AutoCompleteHandle } from '@hydrooj/components';
import type { Udoc } from 'hydrooj/src/interface';
import $ from 'jquery';
import React from 'react';
import ReactDOM from 'react-dom/client';
import UserSelectAutoComplete from 'vj/components/autocomplete/components/UserSelectAutoComplete';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { api, i18n } from 'vj/utils';

interface StudentFilterHistory {
  uid: number;
  count: number;
  lastUsed: number;
}

function historyKey() {
  return `hydro:problem-filter-students:${UserContext._id}:${UiContext.domainId}`;
}

function readHistory(): StudentFilterHistory[] {
  try {
    const stored = JSON.parse(localStorage.getItem(historyKey()) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((item) => item && Number.isSafeInteger(item.uid) && item.uid > 1
      && Number.isSafeInteger(item.count) && item.count > 0 && Number.isFinite(item.lastUsed))
      .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).slice(0, 24);
  } catch {
    return [];
  }
}

function rememberStudent(uid: number) {
  const history = readHistory();
  const previous = history.find((item) => item.uid === uid);
  const updated = [
    { uid, count: (previous?.count || 0) + 1, lastUsed: Date.now() },
    ...history.filter((item) => item.uid !== uid),
  ].sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).slice(0, 24);
  try {
    // Keep only identifiers and usage counts; names are fetched with current permissions on every open.
    localStorage.setItem(historyKey(), JSON.stringify(updated));
  } catch { /* Filtering also works when browser storage is unavailable. */ }
}

const studentKey = (student: Udoc) => (/^[+-]?\d+$/.test(student.uname.trim()) ? String(student._id) : student.uname);

function StudentFilterPicker({ onSelect }: { onSelect: (student: Udoc | null) => void }) {
  const picker = React.useRef<AutoCompleteHandle<Udoc>>(null);
  const [students, setStudents] = React.useState<Udoc[]>([]);
  const [selected, setSelected] = React.useState<Udoc | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [hasHistory, setHasHistory] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const history = readHistory().slice(0, 10);
    const projection = ['_id', 'uname', 'displayName', 'avatarUrl'];
    Promise.allSettled([
      history.length
        ? api('problemFilterStudents', { auto: history.map((item) => String(item.uid)) }, projection)
        : Promise.resolve([]),
      api('problemFilterStudents', {}, projection),
    ]).then(([frequentResult, defaultResult]) => {
      if (!active) return;
      const frequent: Udoc[] = frequentResult.status === 'fulfilled' ? frequentResult.value : [];
      const defaults: Udoc[] = defaultResult.status === 'fulfilled' ? defaultResult.value : [];
      const byId = new Map([...frequent, ...defaults].map((student) => [student._id, student]));
      setStudents([...byId.values()].slice(0, 10));
      setHasHistory(frequent.length > 0);
      setFailed(defaultResult.status === 'rejected' && !frequent.length);
      setLoading(false);
    });
    picker.current?.focus();
    return () => { active = false; };
  }, []);

  const chooseStudent = (student: Udoc | null) => {
    setSelected(student);
    onSelect(student);
  };

  return <div className="problem-student-picker">
    <div className="row"><div className="columns">
      <h1>{i18n('筛选学员未 AC 题目')}</h1>
      <p className="problem-student-picker__description">选择学员，查看还未通过的题目。</p>
      <label>
        {i18n('选择学员账号')}
        <div className="textbox-container">
          <UserSelectAutoComplete
            ref={picker}
            apiMethod="problemFilterStudents"
            placeholder="搜索学员账号或姓名"
            onChange={(value) => {
              const fromPicker = picker.current?.getSelectedItems()[0];
              const student = fromPicker && studentKey(fromPicker) === value
                ? fromPicker : students.find((item) => studentKey(item) === value);
              chooseStudent(student || null);
            }}
          />
        </div>
      </label>
      <div className="problem-student-picker__suggestions" aria-busy={loading}>
        <div className="problem-student-picker__heading">
          <span>{hasHistory ? '常用学员' : '快捷选择'}</span>
          <span className="problem-student-picker__hint">{hasHistory ? '按筛选频次排序' : '点击标签即可选择'}</span>
        </div>
        {loading ? <p className="problem-student-picker__empty" role="status">正在加载学员…</p>
          : students.length ? <div className="problem-student-picker__chips" aria-label="快捷选择学员">
            {students.map((student) => <button
              key={student._id}
              type="button"
              className={`problem-student-picker__chip${selected?._id === student._id ? ' is-selected' : ''}`}
              aria-pressed={selected?._id === student._id}
              title={student.displayName ? `${student.displayName}（${student.uname}）` : student.uname}
              onClick={() => {
                picker.current?.setSelectedItems([student]);
                picker.current?.closeList();
                chooseStudent(student);
              }}
            >
              <span className="problem-student-picker__chip-name">{student.displayName || student.uname}</span>
              {selected?._id === student._id && <span className="icon icon-check" aria-hidden="true" />}
            </button>)}
          </div> : <p className="problem-student-picker__empty" role="status">
            {failed ? '快捷学员暂未加载，请使用上方搜索。' : '暂无可选学员。'}
          </p>}
      </div>
    </div></div>
  </div>;
}

export default async function selectStudentForUnacceptedFilter(): Promise<Udoc | null> {
  let selectedStudent: Udoc | null = null;
  const body = document.createElement('div');
  const root = ReactDOM.createRoot(body);
  root.render(<StudentFilterPicker onSelect={(student) => { selectedStudent = student; }} />);
  const result = await new ActionDialog({
    $body: $(body),
    classes: 'dialog--student-unaccepted',
    width: 'min(520px, calc(100vw - 32px))',
    onDispatch(action) {
      if (action === 'ok' && !selectedStudent) {
        Notification.error(i18n('请选择一个学员账号'));
        return false;
      }
      return true;
    },
  }).open();
  root.unmount();
  if (result !== 'ok' || !selectedStudent) return null;
  rememberStudent(selectedStudent._id);
  return selectedStudent;
}
