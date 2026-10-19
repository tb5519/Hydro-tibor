import _ from 'lodash';
import Drop from 'tether-drop';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';

export default class Tooltip extends DOMAttachedObject {
  static DOMAttachKey = 'vjTooltipInstance';

  constructor($dom, options = {}) {
    super($dom, true);
    this.dropRemoved = false;
    this.drop = new Drop({
      target: $dom[0],
      classes: 'tooltip',
      position: options.position || 'top center',
      openOn: 'hover',
      constrainToWindow: true,
      constrainToScrollParent: false,
      addTargetClasses: false,
      tetherOptions: {
        constraints: [{
          // Tether's default center-to-center constraint can overflow at either
          // edge. Use the visible document viewport, including existing scrollbars.
          get to() {
            const { clientWidth, clientHeight } = document.documentElement;
            return [
              window.pageXOffset, window.pageYOffset,
              window.pageXOffset + (clientWidth || window.innerWidth),
              window.pageYOffset + (clientHeight || window.innerHeight),
            ];
          },
          attachment: 'both',
          pin: true,
        }],
      },
      content: $dom.attr('data-tooltip'),
    });
    this.isOpen = false;
    this.drop.on('open', this.onOpen, this);
    this.drop.on('close', this.onClose, this);
    this.delayDetach = _.debounce(this.detach.bind(this), 200);
  }

  onOpen() {
    this.delayDetach.cancel();
  }

  onClose() {
    this.delayDetach();
  }

  detach() {
    if (this.detached) {
      return;
    }
    super.detach();
    this.drop.destroy();
  }

  close() {
    this.drop.close();
  }

  open() {
    this.drop.open();
  }
}
