import ProblemIcon from '@vscode/codicons/src/icons/file.svg?react';
import SettingsIcon from '@vscode/codicons/src/icons/settings-gear.svg?react';
import { Allotment } from 'allotment';
import $ from 'jquery';
import _ from 'lodash';
import type * as monaco from 'monaco-editor';
import React from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import Dom from 'vj/components/react/DomComponent';
import { ctx, Service } from 'vj/context';
import RecordReplaySource from './RecordReplaySource';
import ScratchpadEditor from './ScratchpadEditorContainer';
import { ScratchpadArtThemeContext, ScratchpadControlLabel } from './ScratchpadControlArt';
import ScratchpadPretest from './ScratchpadPretestContainer';
import ScratchpadRecords from './ScratchpadRecordsContainer';
import ScratchpadSettings from './ScratchpadSettings';
import ScratchpadSkin from './ScratchpadSkin';
import ScratchpadToolbar from './ScratchpadToolbarContainer';
import { scratchpadThemeVariables, useScratchpadTheme } from './themes';

const pages = {
  problem: {
    icon: () => <ProblemIcon />,
    component: () => <Dom childDom={$('.problem-content').get(0)} />,
  },
  settings: {
    icon: () => <SettingsIcon />,
    component: () => <ScratchpadSettings />,
  },
};

let rerenderCallback = null;
class ScratchpadService extends Service {
  constructor(public store) {
    super(ctx, 'scratchpad');
    this.load = new Promise((resolve) => {
      this.loadCallback = resolve;
    });
  }

  pages = pages;
  load: Promise<void>;
  loadCallback: () => void;
  editor: monaco.editor.IStandaloneCodeEditor;
  monaco: typeof import('monaco-editor');

  init(editor: monaco.editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) {
    this.editor = editor;
    this.monaco = monaco;
    this.loadCallback();
  }

  addPage(key, icon, component) {
    pages[key] = {
      icon,
      component,
    };
    rerenderCallback?.();
  }
}
declare module 'cordis' {
  interface Context {
    scratchpad: ScratchpadService;
  }
}

let scratchpad: ScratchpadService;

export default function ScratchpadContainer() {
  const store = useStore();
  const theme = useScratchpadTheme();
  scratchpad ||= new ScratchpadService(store);
  const [, updateState] = React.useState<any>();
  const forceUpdate = React.useCallback(() => updateState({}), []);
  React.useEffect(() => {
    rerenderCallback = forceUpdate;
  }, []);
  const dispatch = useDispatch();
  const ui = useSelector<any, any>((state) => state.ui, _.isEqual);

  const relayoutFrame = React.useRef<number | null>(null);
  const handleChangeSize = React.useCallback(() => {
    if (relayoutFrame.current !== null) return;
    relayoutFrame.current = window.requestAnimationFrame(() => {
      relayoutFrame.current = null;
      // Monaco observes its actual container. Split-pane changes only need to
      // reposition outside overlays, without re-rendering the editor tree.
      $('#scratchpad').trigger('vjScratchpadRelayout');
    });
  }, []);
  React.useEffect(() => () => {
    if (relayoutFrame.current !== null) window.cancelAnimationFrame(relayoutFrame.current);
    relayoutFrame.current = null;
  }, []);
  const switchToPage = (target) => {
    dispatch({
      type: 'SCRATCHPAD_SWITCH_TO_PAGE',
      payload: target,
    });
  };
  const ideMode = !!UiContext.ideMode;

  return (
    <ScratchpadArtThemeContext.Provider value={theme}>
      <Allotment onChange={handleChangeSize}>
        <Allotment.Pane visible={!ideMode && Object.keys(pages).length > 1} minSize={50} maxSize={50}>
          <div className="scratchpad__tablist">
            {Object.keys(pages).map((key) => {
              const Component = pages[key].icon;
              return (
                <button
                  type="button"
                  aria-label={key === 'problem' ? '题目' : key === 'settings' ? '设置' : key}
                  aria-pressed={key === ui.activePage}
                  key={key}
                  className={`scratchpad__tabicon-${key}${key === ui.activePage ? ' scratchpad__tab-active' : ''}`}
                  onClick={() => switchToPage(key)}
                >
                  {key === 'problem' || key === 'settings' ? (
                    <ScratchpadControlLabel control={key === 'problem' ? 'problemTab' : 'settingsTab'}><Component /></ScratchpadControlLabel>
                  ) : <Component />}
                </button>
              );
            })}
          </div>
        </Allotment.Pane>
        <Allotment.Pane visible={!ideMode && !!ui.activePage}>
          <div className="scratchpad__problem">
            {Object.keys(pages).map((key) => {
              const Component = pages[key].component;
              return (
                <div key={key} style={{ display: key === ui.activePage ? 'block' : 'none' }}>
                  <Component />
                </div>
              );
            })}
          </div>
        </Allotment.Pane>
        <div
          className="scratchpad__coding-area"
          data-scratchpad-theme={theme.id}
          data-scratchpad-skin={theme.badgeId ? 'true' : undefined}
          style={scratchpadThemeVariables(theme) as React.CSSProperties}
        >
          <ScratchpadSkin theme={theme} />
          <Allotment vertical defaultSizes={UiContext.homeworkReview ? [730, 0, 270] : [450, 280, 270]} onChange={handleChangeSize}>
            <div key="editor" className="scratchpad__workspace flex-col splitpane-fill">
              <ScratchpadToolbar />
              <RecordReplaySource />
              {UiContext.homeworkReview && !UiContext.homeworkReview.rid && (
                <p className="scratchpad__review-empty">该学员尚未提交这道题。</p>
              )}
              <ScratchpadEditor />
            </div>
            <Allotment.Pane visible={ui.pretest.visible}>
              <ScratchpadPretest key="pretest" />
            </Allotment.Pane>
            <Allotment.Pane visible={ui.records.visible}>
              <ScratchpadRecords key="records" />
            </Allotment.Pane>
          </Allotment>
        </div>
      </Allotment>
    </ScratchpadArtThemeContext.Provider>
  );
}
