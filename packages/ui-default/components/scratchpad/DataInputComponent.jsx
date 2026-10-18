import classNames from 'classnames';
import PropTypes from 'prop-types';
import { ScratchpadControlLabel, useScratchpadControlArt } from './ScratchpadControlArt';

export default function DataInputComponent(props) {
  const {
    html,
    title,
    titleArt,
    metadata,
    hasResult,
    value,
    onChange,
    className,
    ...rest
  } = props;
  const placeholderArt = useScratchpadControlArt(html ? undefined : 'inputPlaceholder');
  return (
    <div {...rest} className={classNames(className, 'scratchpad__data-pane')}>
      <div className="scratchpad__data-label">
        <span>{titleArt ? <ScratchpadControlLabel control={titleArt}>{title}</ScratchpadControlLabel> : title}</span>
        {metadata && <span className="scratchpad__data-metadata" role="status">（{metadata}）</span>}
      </div>
      {html ? (
        <div className="scratchpad__data-input scratchpad__data-output" role="log" aria-label={title}>
          {value
            ? <pre dangerouslySetInnerHTML={{ __html: value }} />
            : !hasResult && <span className="scratchpad__data-placeholder"><ScratchpadControlLabel control="emptyOutput">运行自测后，结果会显示在这里</ScratchpadControlLabel></span>}
        </div>
      ) : (
        <div className="scratchpad__data-entry">
          {!value && <span className="scratchpad__input-art-placeholder" aria-hidden="true">{placeholderArt.art}</span>}
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
            placeholder={placeholderArt.ready ? '' : '在这里输入测试数据'}
          />
        </div>
      )}
    </div>
  );
}

DataInputComponent.propTypes = {
  html: PropTypes.bool,
  title: PropTypes.string,
  titleArt: PropTypes.string,
  metadata: PropTypes.string,
  hasResult: PropTypes.bool,
  value: PropTypes.string,
  onChange: PropTypes.func,
  className: PropTypes.string,
};
