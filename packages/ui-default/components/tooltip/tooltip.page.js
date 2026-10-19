import $ from 'jquery';
import { AutoloadPage } from 'vj/misc/Page';
import Tooltip from './Tooltip';

export function getClosestTooltipElement(node) {
  // Icons may contain nested SVG elements; text nodes can be event targets too.
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return element?.closest?.('[data-tooltip]:not([data-tooltip=""])') || null;
}

const tooltipPage = new AutoloadPage('tooltipPage', () => {
  $(document).on('mouseover', (e) => {
    const element = getClosestTooltipElement(e.target);
    if (!element) return;
    const $element = $(element);
    const options = {};
    if ($element.attr('data-tooltip-pos')) {
      options.position = $element.attr('data-tooltip-pos');
    }
    const tooltip = Tooltip.getOrConstruct($element, options);
    tooltip.open();
  });
});

export default tooltipPage;
