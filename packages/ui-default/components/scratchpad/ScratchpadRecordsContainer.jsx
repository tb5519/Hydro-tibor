import classNames from 'classnames';
import React from 'react';
import { connect } from 'react-redux';
import Icon from 'vj/components/react/IconComponent';
import { i18n } from 'vj/utils';
import Panel from './PanelComponent';
import { ScratchpadControlLabel } from './ScratchpadControlArt';
import ScratchpadRecordsRow from './ScratchpadRecordsRowContainer';

const mapStateToProps = (state) => ({
  rows: state.records.rows.filter((id) => state.records.items[id]?.contest?.toString() !== '000000000000000000000000'),
  isLoading: state.ui.records.isLoading,
  scrollRevision: state.ui.records.scrollRevision,
});

export default connect(mapStateToProps)(class ScratchpadRecordsContainer extends React.PureComponent {
  scrollContainer = React.createRef();

  componentDidUpdate(prevProps) {
    if (this.props.scrollRevision !== prevProps.scrollRevision || this.props.rows[0] !== prevProps.rows[0]) {
      // A new submission belongs at the top. Live judging updates to the same
      // record should leave the student's reading position alone.
      if (this.scrollContainer.current) this.scrollContainer.current.scrollTop = 0;
    }
  }

  render() {
    const cn = classNames('data-table is--full-row scratchpad__records__table', {
      loading: this.props.isLoading,
    });
    return (
      <Panel
        title={(
          <ScratchpadControlLabel control="recordsTitle">
            <Icon name="flag" />
            {' '}
            {i18n('Records')}
          </ScratchpadControlLabel>
        )}
      >
        <div ref={this.scrollContainer} className="scratchpad__records-scroll" aria-busy={this.props.isLoading}>
          {this.props.rows.length ? (
            <table className={cn}>
              <colgroup>
                <col className="col--detail" />
                <col className="col--memory" />
                <col className="col--time" />
                <col className="col--at" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col"><ScratchpadControlLabel control="recordStatus">评测结果</ScratchpadControlLabel></th>
                  <th scope="col"><ScratchpadControlLabel control="recordMemory">{i18n('Memory')}</ScratchpadControlLabel></th>
                  <th scope="col"><ScratchpadControlLabel control="recordTime">用时</ScratchpadControlLabel></th>
                  <th scope="col"><ScratchpadControlLabel control="recordDate">提交时间</ScratchpadControlLabel></th>
                </tr>
              </thead>
              <tbody>
                {this.props.rows.map((rowId) => (
                  <ScratchpadRecordsRow key={rowId} id={rowId} />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="scratchpad__records-empty" role="status">
              {this.props.isLoading ? (
                <><Icon name="flag" /><span>正在加载评测记录</span></>
              ) : (
                <ScratchpadControlLabel control="emptyRecords" fallbackDecoration={<Icon name="flag" />}>暂无评测记录</ScratchpadControlLabel>
              )}
              {!this.props.isLoading && (
                <small>{UiContext.homeworkReview ? '该学员尚未提交这道题' : <ScratchpadControlLabel control="emptyRecordsHint">递交代码后，在这里查看评测结果</ScratchpadControlLabel>}</small>
              )}
            </div>
          )}
        </div>
      </Panel>
    );
  }
});
