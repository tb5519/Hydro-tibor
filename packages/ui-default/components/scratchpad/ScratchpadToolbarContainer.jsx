import _ from 'lodash';
import PropTypes from 'prop-types';
import React from 'react';
import { connect } from 'react-redux';
import Icon from 'vj/components/react/IconComponent';
import { getAvailableLangs, i18n, request } from 'vj/utils';
import Toolbar, {
  ToolbarButtonComponent as ToolbarButton,
  ToolbarItemComponent as ToolbarItem,
  ToolbarSplitComponent as ToolbarSplit,
} from './ToolbarComponent';

function normalizeRecordId(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number') return `${value}`;
  if (value.$oid) return `${value.$oid}`;
  if (value.oid) return `${value.oid}`;
  if (typeof value.toHexString === 'function') return value.toHexString();
  return '';
}

function getSubmitRecordId(payload) {
  const values = [
    payload,
    payload?.data,
    payload?.data?.data,
    payload?.body,
    payload?.body?.data,
    payload?.response,
    payload?.response?.data,
  ];
  for (const value of values) {
    if (typeof value === 'string' || typeof value === 'number') {
      const directRecordId = normalizeRecordId(value);
      if (directRecordId) return directRecordId;
    }
    const recordId = normalizeRecordId(value?.rid || value?.recordId || value?._id);
    if (recordId) return recordId;
  }
  return '';
}

const mapStateToProps = (state) => ({
  pretestVisible: state.ui.pretest.visible,
  recordsVisible: state.ui.records.visible,
  isPosting: state.ui.isPosting,
  isRunning: state.pretest.isRunning,
  pretestWaitSec: state.ui.pretestWaitSec,
  submitWaitSec: state.ui.submitWaitSec,
  formalSubmitCount: state.ui.formalSubmitRids.length,
  editorLang: state.editor.lang,
  editorCode: state.editor.code,
  pretestInput: state.pretest.input,
});

const mapDispatchToProps = (dispatch) => ({
  togglePanel(uiElement) {
    dispatch({
      type: 'SCRATCHPAD_UI_TOGGLE_VISIBILITY',
      payload: { uiElement },
    });
  },
  setEditorLanguage(lang) {
    dispatch({
      type: 'SCRATCHPAD_EDITOR_SET_LANG',
      payload: lang,
    });
  },
  postPretest(props) {
    const req = request.post(UiContext.postSubmitUrl, {
      lang: props.editorLang,
      code: props.editorCode,
      input: [props.pretestInput],
      pretest: true,
      source: 'scratchpad',
    });
    dispatch({
      type: 'SCRATCHPAD_POST_PRETEST',
      payload: req,
    });
  },
  postSubmit(props) {
    const req = request.post(UiContext.postSubmitUrl, {
      lang: props.editorLang,
      code: props.editorCode,
      source: 'scratchpad',
    }).then((payload) => {
      // Register the record as soon as the submit endpoint returns. The
      // WebSocket result may arrive before the promise middleware updates
      // Redux, especially for fast full-score submissions.
      const recordId = getSubmitRecordId(payload);
      if (recordId) {
        dispatch({
          type: 'SCRATCHPAD_FORMAL_SUBMIT_REGISTER',
          payload: { rid: recordId },
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('hydro:formal-submit', {
            detail: { rid: recordId },
          }));
        }
      }
      return payload;
    });
    dispatch({
      type: 'SCRATCHPAD_POST_SUBMIT',
      payload: req,
    });
  },
  loadSubmissions() {
    dispatch({
      type: 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS',
      payload: request.get(UiContext.getSubmissionsUrl),
    });
  },
  tick() {
    dispatch({
      type: 'SCRATCHPAD_WAITING_TICK',
    });
  },
});

const availableLangs = getAvailableLangs(UiContext.pdoc.config.langs);
const keys = Object.keys(availableLangs);

export default connect(mapStateToProps, mapDispatchToProps)(class ScratchpadToolbarContainer extends React.PureComponent {
  static contextTypes = {
    store: PropTypes.object,
  };

  constructor(props) {
    super(props);
    if (!availableLangs[this.props.editorLang]) {
      // preference not allowed
      const key = this.props.editorLang ? keys.filter((i) => availableLangs[i].pretest)
        .find((i) => availableLangs[i].pretest.split('.')[0] === this.props.editorLang.split('.')[0]) : '';
      this.props.setEditorLanguage(key || keys[0]);
    }
  }

  componentDidMount() {
    if (this.props.recordsVisible) this.props.loadSubmissions();
  }

  componentDidUpdate(prevProps) {
    if (this.props.recordsVisible && (
      !prevProps.recordsVisible
      || this.props.formalSubmitCount > prevProps.formalSubmitCount
    )) {
      this.props.loadSubmissions();
    }
    if (this.props.pretestWaitSec > 0 || this.props.submitWaitSec > 0) {
      setTimeout(() => this.props.tick(), 1000);
    }
  }

  render() {
    let canUsePretest = UiContext.pdoc.config?.type === 'default';
    const langInfo = availableLangs[this.props.editorLang];
    if (UiContext.pdoc.config?.type === 'remote_judge' && langInfo) {
      if (langInfo.pretest) canUsePretest = true;
      if (langInfo.validAs && !langInfo.hidden) canUsePretest = true;
    }
    if (langInfo?.pretest === false) canUsePretest = false;
    if (UiContext.ideMode) {
      return (
        <Toolbar>
          <ToolbarItem>
            <select
              className="select"
              disabled={this.props.isPosting}
              value={this.props.editorLang}
              onChange={(ev) => this.props.setEditorLanguage(ev.target.value)}
            >
              {_.map(availableLangs, (val, key) => (
                <option value={key} key={key}>{val.display}</option>
              ))}
            </select>
          </ToolbarItem>
          {canUsePretest && (
            <ToolbarButton
              disabled={this.props.isPosting || this.props.isRunning || !!this.props.pretestWaitSec}
              className="scratchpad__toolbar__pretest"
              onClick={() => this.props.postPretest(this.props)}
              data-global-hotkey="f9"
              data-tooltip="运行代码 (F9)"
            >
              <Icon name="debug" />
              {' '}
              运行代码
              {' '}
              {this.props.pretestWaitSec ? `(${this.props.pretestWaitSec}s)` : '(F9)'}
            </ToolbarButton>
          )}
          {canUsePretest && (
            <ToolbarButton
              activated={this.props.pretestVisible}
              onClick={() => this.props.togglePanel('pretest')}
              data-global-hotkey="alt+p"
              data-tooltip={`${i18n('Toggle Pretest Panel')} (Alt+P)`}
            >
              <Icon name="edit" />
              {' '}
              {i18n('Pretest')}
            </ToolbarButton>
          )}
        </Toolbar>
      );
    }
    return (
      <Toolbar>
        {canUsePretest && (
          <ToolbarButton
            disabled={this.props.isPosting || this.props.isRunning || !!this.props.pretestWaitSec}
            className="scratchpad__toolbar__pretest"
            onClick={() => this.props.postPretest(this.props)}
            data-global-hotkey="f9"
            data-tooltip={`${i18n('Pretest Your Code')} (F9)`}
          >
            <Icon name="debug" />
            {' '}
            {i18n('Run Pretest')}
            {' '}
            {this.props.pretestWaitSec ? `(${this.props.pretestWaitSec}s)` : '(F9)'}
          </ToolbarButton>
        )}
        <ToolbarButton
          disabled={this.props.isPosting || !!this.props.submitWaitSec}
          className="scratchpad__toolbar__submit"
          onClick={() => this.props.postSubmit(this.props)}
          data-global-hotkey="f10"
          data-tooltip={`${i18n('Submit Your Code')} (F10)`}
        >
          <Icon name="play" />
          {' '}
          {i18n('Submit Solution')}
          {' '}
          {this.props.submitWaitSec ? `(${this.props.submitWaitSec}s)` : '(F10)'}
        </ToolbarButton>
        <ToolbarButton
          data-global-hotkey="alt+q"
          data-tooltip={`${i18n('Quit Scratchpad')} (Alt+Q)`}
          name="problem-sidebar__quit-scratchpad"
        >
          <Icon name="close" />
          {' '}
          {i18n('Exit')}
          {' '}
          (Alt+Q)
        </ToolbarButton>
        <ToolbarItem>
          <select
            className="select"
            disabled={this.props.isPosting}
            value={this.props.editorLang}
            onChange={(ev) => this.props.setEditorLanguage(ev.target.value)}
          >
            {_.map(availableLangs, (val, key) => (
              <option value={key} key={key}>{val.display}</option>
            ))}
          </select>
        </ToolbarItem>
        <ToolbarSplit />
        {canUsePretest && (
          <ToolbarButton
            activated={this.props.pretestVisible}
            onClick={() => this.props.togglePanel('pretest')}
            data-global-hotkey="alt+p"
            data-tooltip={`${i18n('Toggle Pretest Panel')} (Alt+P)`}
          >
            <Icon name="edit" />
            {' '}
            {i18n('Pretest')}
          </ToolbarButton>
        )}
        {UiContext.canViewRecord && (
          <ToolbarButton
            activated={this.props.recordsVisible}
            onClick={() => this.props.togglePanel('records')}
            data-global-hotkey="alt+r"
            data-tooltip={`${i18n('Toggle Records Panel')} (Alt+R)`}
          >
            <Icon name="flag" />
            {' '}
            {i18n('Records')}
          </ToolbarButton>
        )}
      </Toolbar>
    );
  }
});
