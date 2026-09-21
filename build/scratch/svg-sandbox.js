/* OneByOne replacement for @turbowarp/scratch-svg-renderer's MPL-2.0
 * tw-svg-sandbox. Only a sanitized measurement copy enters this closed shadow
 * tree. The original SVG still goes through the upstream rendering pipeline.
 * A nested iframe cannot be synchronously accessed from our opaque sandbox.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const tags = new Set(('svg g defs path rect circle ellipse line polyline polygon text tspan textpath use ' +
    'image lineargradient radialgradient stop clippath mask pattern switch symbol title desc marker').split(' '));
const attributes = new Set(('id class x y x1 y1 x2 y2 dx dy width height rx ry r cx cy fx fy fr d points transform viewbox ' +
    'preserveaspectratio pathlength rotate textlength lengthadjust gradientunits gradienttransform spreadmethod ' +
    'offset clippathunits maskunits maskcontentunits patternunits patterncontentunits patterntransform ' +
    'markerunits markerwidth markerheight refx refy orient href').split(' '));
// Native CSSOM parses declarations. Only SVG presentation properties can be
// copied; layout, custom properties, animation and arbitrary CSS never enter.
const presentation = new Set(('fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap ' +
    'stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color display visibility ' +
    'font-family font-size font-style font-weight font-stretch font-variant letter-spacing word-spacing ' +
    'text-anchor text-decoration dominant-baseline alignment-baseline baseline-shift direction unicode-bidi ' +
    'writing-mode white-space clip-path clip-rule mask stop-color stop-opacity vector-effect paint-order ' +
    'marker-start marker-mid marker-end').split(' '));
const fragment = /^#[A-Za-z0-9_.:-]+$/;
const safeValue = value => {
    if (/[\\@\u0000-\u0008\u000b\u000c\u000e-\u001f]|\/\*|(?:https?|data|javascript|vbscript|file):|\b(?:var|env|attr|image|image-set|paint)\s*\(/i.test(value)) return false;
    // Gradients, clipping and <use> may refer only to a node in this SVG.
    return !/url\s*\(/i.test(value) || /^url\(\s*(['"]?)#[A-Za-z0-9_.:-]+\1\s*\)(?:\s+(?:none|#[a-f0-9]+|[a-z]+))?$/i.test(value);
};

const safeStylesheet = text => {
    // A constructed stylesheet parses without attaching to a document. Only
    // ordinary selector rules survive; @import/font-face/keyframes never do.
    // The resulting rules live inside a closed shadow tree, not the editor.
    if (typeof CSSStyleSheet !== 'function' || !CSSStyleSheet.prototype.replaceSync) return '';
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    return Array.from(sheet.cssRules).filter(rule => rule.type === 1).map(rule => {
        const values = [];
        for (let index = 0; index < rule.style.length; index++) {
            const name = rule.style[index];
            const value = rule.style.getPropertyValue(name);
            if (presentation.has(name) && safeValue(value)) values.push(`${name}:${value}`);
        }
        return values.length ? `${rule.selectorText}{${values.join(';')}}` : '';
    }).join('\n');
};

const clean = root => {
    for (const node of Array.from(root.children)) {
        const tag = node.localName.toLowerCase();
        if (node.namespaceURI === SVG_NS && tag === 'style') {
            node.textContent = safeStylesheet(node.textContent);
            for (const attribute of Array.from(node.attributes)) node.removeAttributeNode(attribute);
            continue;
        }
        if (node.namespaceURI !== SVG_NS || !tags.has(tag)) {
            node.remove();
            continue;
        }
        const styles = [];
        for (let index = 0; index < node.style.length; index++) {
            const name = node.style[index];
            const value = node.style.getPropertyValue(name);
            if (presentation.has(name) && safeValue(value)) styles.push([name, value]);
        }
        for (const attribute of Array.from(node.attributes)) {
            const name = attribute.localName.toLowerCase();
            if ((!attributes.has(name) && !presentation.has(name)) || !safeValue(attribute.value) ||
                (name === 'href' && !fragment.test(attribute.value))) node.removeAttributeNode(attribute);
        }
        for (const [name, value] of styles) node.style.setProperty(name, value);
        if (tag === 'image') {
            // Image pixels are irrelevant to getBBox: its x/y/width/height are
            // enough. A rect also avoids any resource request, including data SVG.
            const rect = root.ownerDocument.createElementNS(SVG_NS, 'rect');
            for (const attribute of Array.from(node.attributes)) {
                if (attribute.localName !== 'href') rect.setAttribute(attribute.name, attribute.value);
            }
            node.replaceWith(rect);
        } else clean(node);
    }
};

let sandbox;
module.exports = () => {
    if (sandbox) return sandbox;
    const host = document.createElement('div');
    host.className = 'onebyone-svg-measurement';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'all:initial!important;position:fixed!important;left:-100000px!important;top:-100000px!important;' +
        'width:1px!important;height:1px!important;visibility:hidden!important;pointer-events:none!important;overflow:hidden!important';
    const shadow = host.attachShadow({mode: 'closed'});
    document.body.appendChild(host);
    sandbox = {
        appendChild(node) {
            clean(node);
            if (!node.firstElementChild || node.firstElementChild.localName !== 'svg') throw new Error('Invalid SVG measurement');
            return shadow.appendChild(node);
        },
        removeChild(node) {
            if (node.parentNode === shadow) return shadow.removeChild(node);
            return node;
        }
    };
    return sandbox;
};
