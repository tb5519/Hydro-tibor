import { escapeAttrValue, FilterXSS } from 'xss';
import { ensureTag } from './markdown-it-xss';

const sanitizer = new FilterXSS({
  whiteList: {
    p: ['style'], br: [], div: ['style'], span: ['style'],
    h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'],
    strong: [], b: [], em: [], i: [], u: [], s: [], del: [], sub: [], sup: [],
    ul: [], ol: ['start'], li: [], blockquote: [], pre: [], code: [], hr: [],
    a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'],
    table: [], thead: [], tbody: [], tr: [], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'],
  },
  css: {
    whiteList: {
      'text-align': /^(left|center|right|justify)$/,
      'font-weight': /^(normal|bold|[1-9]00)$/,
      'font-style': /^(normal|italic)$/,
      'text-decoration': /^(none|underline|line-through)$/,
      color: /^(#[a-f\d]{3,8}|[a-z]+|rgba?\([\d\s,.%]+\))$/i,
      'background-color': /^(#[a-f\d]{3,8}|[a-z]+|rgba?\([\d\s,.%]+\))$/i,
    },
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template'],
  allowCommentTag: false,
  onTagAttr(tag, name, value) {
    if (name === 'href' || name === 'src') {
      const normalized = value.trim();
      const valid = /^(?:https?:\/\/|\/(?!\/)|#)/i.test(normalized)
        || (tag === 'a' && /^mailto:/i.test(normalized));
      // eslint-disable-next-line no-control-regex
      if (!valid || /[\u0000-\u0020\\]/u.test(normalized)) return '';
      return `${name}="${escapeAttrValue(normalized)}"`;
    }
    if (['width', 'height', 'rowspan', 'colspan', 'start'].includes(name)) {
      return /^\d{1,4}$/.test(value) ? `${name}="${value}"` : '';
    }
    return undefined;
  },
});

export function sanitizeBroadcastHtml(html: string) {
  return ensureTag(sanitizer.process(html)).replace(/<a\b([^>]*)>/g, '<a$1 target="_blank" rel="noopener noreferrer">');
}
