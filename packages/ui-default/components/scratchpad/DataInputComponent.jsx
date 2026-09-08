import classNames from 'classnames';
import PropTypes from 'prop-types';

export default function DataInputComponent(props) {
  const {
    html,
    title,
    value,
    onChange,
    className,
    ...rest
  } = props;
  return (
    <div {...rest} className={classNames(className, 'scratchpad__data-pane')}>
      <div className="scratchpad__data-label">{title}</div>
      {html ? (
        <div className="scratchpad__data-input scratchpad__data-output" role="log" aria-label={title}>
          {value
            ? <pre dangerouslySetInnerHTML={{ __html: value }} />
            : <span className="scratchpad__data-placeholder">运行自测后，结果会显示在这里</span>}
        </div>
      ) : (
        <textarea
          className="scratchpad__data-input"
          aria-label={title}
          wrap="off"
          spellCheck="false"
          value={value}
          onChange={(ev) => {
            ev.stopPropagation();
            onChange(ev.target.value);
          }}
          placeholder="在这里输入测试数据"
        />
      )}
    </div>
  );
}

DataInputComponent.propTypes = {
  html: PropTypes.bool,
  title: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func,
  className: PropTypes.string,
};
