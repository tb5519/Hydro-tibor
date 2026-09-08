import classNames from 'classnames';
import React from 'react';
import { connect } from 'react-redux';
import Icon from 'vj/components/react/IconComponent';
import { i18n } from 'vj/utils';
import Panel from './PanelComponent';
import ScratchpadRecordsRow from './ScratchpadRecordsRowContainer';

const mapStateToProps = (state) => ({
  rows: state.records.rows.filter((id) => state.records.items[id]?.contest?.toString() !== '000000000000000000000000'),
  isLoading: state.ui.records.isLoading,
});

export default connect(mapStateToProps)(class ScratchpadRecordsContainer extends React.PureComponent {
  render() {
    const cn = classNames('data-table is--full-row scratchpad__records__table', {
      loading: this.props.isLoading,
    });
    return (
      <Panel
        title={(
          <span>
            <Icon name="flag" />
            {' '}
            {i18n('Records')}
          </span>
        )}
      >
        <div className="scratchpad__records-scroll" aria-busy={this.props.isLoading}>
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
                  <th scope="col">评测结果</th>
                  <th scope="col">{i18n('Memory')}</th>
                  <th scope="col">用时</th>
                  <th scope="col">提交时间</th>
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
              <Icon name="flag" />
              <span>{this.props.isLoading ? '正在加载评测记录' : '暂无评测记录'}</span>
              {!this.props.isLoading && <small>递交代码后，在这里查看评测结果</small>}
            </div>
          )}
        </div>
      </Panel>
    );
  }
});
