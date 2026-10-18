import classNames from 'classnames';
import PropTypes from 'prop-types';
import { useScratchpadControlArt } from './ScratchpadControlArt';

export default function ToolbarComponent(props) {
  const {
    className,
    children,
    ...rest
  } = props;
  const cn = classNames(className, 'scratchpad__toolbar flex-row flex-cross-center');
  return (
    <div {...rest} className={cn}>{children}</div>
  );
}

ToolbarComponent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

export function ToolbarButtonComponent(props) {
  const {
    controlArt,
    artLabel,
    artStatus,
    activated = false,
    disabled = false,
    onClick,
    className,
    children,
    ...rest
  } = props;
  const { ready, art } = useScratchpadControlArt(controlArt);
  const cn = classNames(className, 'scratchpad__toolbar__item scratchpad__toolbar__button', {
    'scratchpad__image-control': ready,
    activated,
    disabled,
    enabled: !disabled,
  });
  return (
    <button
      {...rest}
      type="button"
      aria-label={artLabel || rest['aria-label']}
      data-control-art={controlArt}
      disabled={disabled}
      aria-pressed={props.activated === undefined ? undefined : activated}
      className={cn}
      onClick={() => !disabled && onClick && onClick()}
    >
      <div>
        {art}
        <span className={ready ? 'scratchpad__art-sr-only' : 'scratchpad__control-fallback'}>{children}</span>
        {ready && artStatus && <span className="scratchpad__art-status" role="status">{artStatus}</span>}
      </div>
    </button>
  );
}

ToolbarButtonComponent.propTypes = {
  controlArt: PropTypes.string,
  artLabel: PropTypes.string,
  artStatus: PropTypes.node,
  activated: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
  className: PropTypes.string,
  children: PropTypes.node,
};

export function ToolbarSplitComponent(props) {
  const {
    className,
    ...rest
  } = props;
  const cn = classNames(className, 'scratchpad__toolbar__item scratchpad__toolbar__split');
  return (
    <div {...rest} className={cn} />
  );
}

ToolbarSplitComponent.propTypes = {
  className: PropTypes.string,
};

export function ToolbarItemComponent(props) {
  const {
    className,
    children,
    ...rest
  } = props;
  const cn = classNames(className, 'scratchpad__toolbar__item');
  return (
    <div {...rest} className={cn}>{children}</div>
  );
}

ToolbarItemComponent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};
