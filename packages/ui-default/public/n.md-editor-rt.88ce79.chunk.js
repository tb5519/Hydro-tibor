!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"970d75aa8607cff89eb0648ee23d6fafc2d8eca2"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="1df5bb4a-5133-4904-946e-84d99522696f",e._sentryDebugIdIdentifier="sentry-dbid-1df5bb4a-5133-4904-946e-84d99522696f");}catch(e){}}();
"use strict";
(self["webpackChunk_hydrooj_ui_default"] = self["webpackChunk_hydrooj_ui_default"] || []).push([["n.md-editor-rt"],{

/***/ "../../node_modules/md-editor-rt/lib/es/chunks/Editor.mjs"
/*!****************************************************************!*\
  !*** ../../node_modules/md-editor-rt/lib/es/chunks/Editor.mjs ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   E: () => (/* binding */ ca)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _config_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./config.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/config.mjs");
/* harmony import */ var _vavt_util__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @vavt/util */ "../../node_modules/@vavt/util/lib/es/index.mjs");
/* harmony import */ var _index2_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./index2.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/index2.mjs");
/* harmony import */ var _context_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./context.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/context.mjs");
/* harmony import */ var _index3_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./index3.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/index3.mjs");
/* harmony import */ var _hooks_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./hooks.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/hooks.mjs");
/* harmony import */ var _codemirror_commands__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! @codemirror/commands */ "../../node_modules/@codemirror/commands/dist/index.js");
/* harmony import */ var _codemirror_lang_markdown__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! @codemirror/lang-markdown */ "../../node_modules/@codemirror/lang-markdown/dist/index.js");
/* harmony import */ var _codemirror_language_data__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! @codemirror/language-data */ "../../node_modules/@codemirror/language-data/dist/index.js");
/* harmony import */ var _codemirror_state__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! @codemirror/state */ "../../node_modules/@codemirror/state/dist/index.js");
/* harmony import */ var _codemirror_view__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! @codemirror/view */ "../../node_modules/@codemirror/view/dist/index.js");
/* harmony import */ var _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! ./event-bus.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/event-bus.mjs");
/* harmony import */ var _codemirror_language__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! @codemirror/language */ "../../node_modules/@codemirror/language/dist/index.js");
/* harmony import */ var _codemirror_autocomplete__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! @codemirror/autocomplete */ "../../node_modules/@codemirror/autocomplete/dist/index.js");
/* harmony import */ var _codemirror_search__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! @codemirror/search */ "../../node_modules/@codemirror/search/dist/index.js");
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_17__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var _dom_mjs__WEBPACK_IMPORTED_MODULE_18__ = __webpack_require__(/*! ./dom.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/dom.mjs");
/* harmony import */ var _index_mjs__WEBPACK_IMPORTED_MODULE_19__ = __webpack_require__(/*! ./index.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/index.mjs");
/* harmony import */ var _index4_mjs__WEBPACK_IMPORTED_MODULE_20__ = __webpack_require__(/*! ./index4.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/index4.mjs");
/* harmony import */ var _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__ = __webpack_require__(/*! @lezer/highlight */ "../../node_modules/@lezer/highlight/dist/index.js");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);






















const uo = (e) => {
  const t = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), r = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), o = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), l = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), i = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(false), s = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(0), d = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(0), b = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    if (!r.current || !t.current || !o.current || !l.current)
      return;
    const v = t.current.clientHeight, k = r.current.scrollHeight, I = r.current.scrollTop;
    if (k <= v) {
      o.current.style.display = "none", e.alwaysShowTrack || (l.current.style.display = "none");
      return;
    } else
      o.current.style.display = "block", l.current.style.display = "block";
    const H = v / k, z = Math.max(v * H, 20), B = v - z, P = Math.min(I * H, B);
    o.current.style.height = `${z}px`, o.current.style.top = `${P}px`;
  }, [e.alwaysShowTrack]), c = b, u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)((v) => {
    i.current = true, s.current = v.clientY, d.current = r.current.scrollTop, document.body.style.userSelect = "none";
  }, []), g = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (v) => {
      if (!i.current || !r.current || !t.current) return;
      const k = v.clientY - s.current, I = r.current.scrollHeight / t.current.clientHeight;
      r.current.scrollTop = d.current + k * I;
    },
    [d, s]
  ), h = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    i.current = false, document.body.style.userSelect = "";
  }, []), p = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (v) => {
      r.current && r.current.removeEventListener("scroll", c), r.current = v, r.current ? (r.current.addEventListener("scroll", c), b()) : l.current && !e.alwaysShowTrack && (l.current.style.display = "none");
    },
    [c, e.alwaysShowTrack, b]
  ), T = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    if (!t.current) return;
    const v = e.scrollTarget ? t.current.querySelector(e.scrollTarget) : t.current.firstElementChild;
    p(v);
  }, [p, e.scrollTarget]);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    T();
    const v = o.current;
    let k = null;
    const I = new MutationObserver(() => {
      k && cancelAnimationFrame(k), k = requestAnimationFrame(() => {
        T();
      });
    });
    return I.observe(t.current, {
      childList: true,
      subtree: true
    }), window.addEventListener("resize", b), v == null ? void 0 : v.addEventListener("mousedown", u), document.addEventListener("mousemove", g), document.addEventListener("mouseup", h), () => {
      I == null ? void 0 : I.disconnect(), r.current && r.current.removeEventListener("scroll", c), window.removeEventListener("resize", b), v == null ? void 0 : v.removeEventListener("mousedown", u), document.removeEventListener("mousemove", g), document.removeEventListener("mouseup", h);
    };
  }, [T, u, g, h, c, b]), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "div",
    {
      id: e.id,
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-custom-scrollbar`, e.className]),
      style: e.style,
      ref: t,
      onMouseEnter: e.onMouseEnter,
      onMouseLeave: e.onMouseLeave,
      children: [
        e.children,
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-custom-scrollbar__track`, ref: l, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-custom-scrollbar__thumb`, ref: o }) })
      ]
    }
  );
}, pe = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(uo), mo = (e, t, r) => {
  const { editorId: o, setting: l } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), [i, s] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({
    clear() {
    },
    init() {
    }
  });
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a;
    const d = (_a = r.current) == null ? void 0 : _a.view.contentDOM.getRootNode(), b = d == null ? void 0 : d.querySelector(
      `#${o} .cm-scroller`
    ), c = d == null ? void 0 : d.querySelector(
      `[id="${o}-preview-wrapper"]`
    ), u = d == null ? void 0 : d.querySelector(
      `[id="${o}-html-wrapper"]`
    );
    if (c || u) {
      const g = c ? _index3_mjs__WEBPACK_IMPORTED_MODULE_6__.s : _index3_mjs__WEBPACK_IMPORTED_MODULE_6__.a, h = c || u, [p, T] = g(b, h, r.current);
      s({
        init: p,
        clear: T
      });
    }
  }, [
    t,
    l.fullscreen,
    l.pageFullscreen,
    l.preview,
    l.htmlPreview,
    o,
    r
  ]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => (e.scrollAuto && !l.previewOnly && (l.preview || l.htmlPreview) ? i.init() : i.clear(), () => {
    i.clear();
  }), [
    i,
    e.scrollAuto,
    l.preview,
    l.htmlPreview,
    l.previewOnly
  ]);
}, Te = async (e, t, r) => {
  if (/^h[1-6]$/.test(e))
    return bo(e, t);
  if (e === "prettier")
    return await ho(t, r);
  switch (e) {
    case "bold":
    case "underline":
    case "italic":
    case "strikeThrough":
    case "sub":
    case "sup":
    case "codeRow":
    case "katexInline":
    case "katexBlock":
      return fo(e, t);
    case "quote":
    case "orderedList":
    case "unorderedList":
    case "task":
      return To(e, t);
    case "code":
      return vo(r, t);
    case "table":
      return Co(r);
    case "link": {
      const o = t.getSelectedText(), { desc: l = o, url: i = "" } = r, s = `[${l}](${i})`;
      return {
        text: s,
        options: {
          select: i === "",
          deviationStart: s.length - i.length - 1,
          deviationEnd: -1
        }
      };
    }
    case "image":
      return $o(r, t);
    case "flow":
    case "sequence":
    case "gantt":
    case "class":
    case "state":
    case "pie":
    case "relationship":
    case "journey":
      return wo(e);
    case "universal":
      return xo(t.getSelectedText(), r);
    default:
      return { text: "", options: {} };
  }
}, bo = (e, t) => {
  const r = e.slice(1), o = "#".repeat(Number(r)), [l, i, s] = ke(t, {
    wholeLine: true
  });
  return {
    text: `${o} ${l}`,
    options: { deviationStart: o.length + 1, replaceStart: i, replaceEnd: s }
  };
}, ho = async (e, t) => {
  var _a, _b, _c;
  const r = window.prettier || ((_a = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensions.prettier) == null ? void 0 : _a.prettierInstance), o = [
    ((_b = window.prettierPlugins) == null ? void 0 : _b.markdown) || ((_c = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensions.prettier) == null ? void 0 : _c.parserMarkdownInstance)
  ];
  return !r || !o[0] ? (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(t.editorId, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.E, {
    name: "prettier",
    message: "prettier is undefined"
  }), {
    text: e.getValue(),
    options: { select: false, replaceAll: true }
  }) : {
    text: await r.format(e.getValue(), {
      parser: "markdown",
      plugins: o
    }),
    options: { select: false, replaceAll: true }
  };
}, go = {
  bold: ["**", "**", 2, -2],
  underline: ["<u>", "</u>", 3, -4],
  italic: ["*", "*", 1, -1],
  strikeThrough: ["~~", "~~", 2, -2],
  sub: ["~", "~", 1, -1],
  sup: ["^", "^", 1, -1],
  codeRow: ["`", "`", 1, -1],
  katexInline: ["$", "$", 1, -1],
  katexBlock: [`
$$
`, `
$$
`, 4, -4]
}, fo = (e, t) => {
  const r = t.getSelectedText(), [o, l, i, s] = go[e];
  return {
    text: `${o}${r}${l}`,
    options: {
      deviationStart: i,
      deviationEnd: s
      // replaceStart, replaceEnd
    }
  };
}, po = {
  quote: "> ",
  unorderedList: "- ",
  orderedList: 1,
  task: "- [ ] "
}, To = (e, t) => {
  const [r, o, l] = ke(t, {
    wholeLine: true
  }), i = r.split(`
`), s = po[e], d = e === "orderedList" ? i.map((u, g) => `${s + g}. ${u}`) : i.map((u) => `${s}${u}`), b = e === "orderedList" ? "1. " : s.toString(), c = i.length === 1 ? b.length : 0;
  return {
    text: d.join(`
`),
    options: {
      deviationStart: c,
      replaceStart: o,
      replaceEnd: l
    }
  };
}, vo = (e, t) => {
  const [r, o, l] = ke(t), i = e.mode || "language", s = `
\`\`\`${i}
${e.text || r || ""}
\`\`\`
`;
  return {
    text: s,
    options: {
      deviationStart: 4,
      deviationEnd: 4 + i.length - s.length,
      replaceStart: o,
      replaceEnd: l
    }
  };
}, wo = (e) => ({
  text: `
\`\`\`mermaid
${{
    flow: `flowchart TD 
  Start --> Stop`,
    sequence: `sequenceDiagram
  A->>B: hello!
  B-->>A: hi!`,
    gantt: `gantt
title Gantt Chart
dateFormat  YYYY-MM-DD`,
    class: `classDiagram
  class Animal`,
    state: `stateDiagram-v2
  s1 --> s2`,
    pie: `pie
  "Dogs" : 386
  "Cats" : 85
  "Rats" : 15`,
    relationship: `erDiagram
  CAR ||--o{ NAMED-DRIVER : allows`,
    journey: `journey
  title My Journey`,
    ..._config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorConfig.mermaidTemplate
  }[e]}
\`\`\`
`,
  options: { deviationStart: 12, deviationEnd: -5 }
}), $o = (e, t) => {
  const r = t.getSelectedText(), { desc: o = r, url: l = "", urls: i } = e;
  let s = "";
  const d = l === "" && (!i || i instanceof Array && i.length === 0);
  return i instanceof Array ? s = i.reduce((b, c) => {
    const {
      url: u = "",
      alt: g = "",
      title: h = ""
    } = typeof c == "object" ? c : { url: c };
    return b + `![${g}](${u}${h ? " '" + h + "'" : ""})
`;
  }, "") : s = `![${o}](${l})
`, {
    text: s,
    options: {
      select: l === "",
      deviationStart: d ? s.length - l.length - 2 : s.length,
      deviationEnd: d ? -2 : 0
    }
  };
}, Co = (e) => {
  const { selectedShape: t = { x: 1, y: 1 } } = e, { x: r, y: o } = t;
  let l = `
| Column`;
  for (let i = 0; i <= o; i++)
    l += " |";
  l += `
|`;
  for (let i = 0; i <= o; i++)
    l += " - |";
  for (let i = 0; i <= r; i++) {
    l += `
|`;
    for (let s = 0; s <= o; s++)
      l += " |";
  }
  return l += `
`, {
    text: l,
    options: {
      deviationStart: 3,
      deviationEnd: 10 - l.length
    }
  };
}, xo = (e, t) => {
  var _a;
  const { generate: r } = t, o = r(e);
  return {
    text: o.targetValue,
    options: {
      select: (_a = o.select) != null ? _a : true,
      deviationStart: o.deviationStart || 0,
      deviationEnd: o.deviationEnd || 0
    }
  };
}, ke = (e, t = {
  wholeLine: false
}) => {
  const r = e.view.state, o = r.selection.main;
  if (o.empty) {
    const l = r.doc.lineAt(o.from);
    return [r.doc.lineAt(o.from).text, l.from, l.to];
  } else if (t.wholeLine) {
    const l = r.doc.lineAt(o.from), i = r.doc.lineAt(o.to);
    return [
      r.doc.sliceString(l.from, i.to),
      l.from,
      i.to
    ];
  }
  return [
    r.doc.sliceString(o.from, o.to),
    o.from,
    o.to
  ];
}, oe = (e) => {
  const t = new _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.Compartment();
  return (o) => (t.get(e.state) ? e.dispatch({ effects: t.reconfigure(o) }) : e.dispatch({
    effects: _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.StateEffect.appendConfig.of(t.of(o))
  }), true);
};
class yo {
  constructor(t) {
    __publicField(this, "view");
    __publicField(this, "maxLength", Number.MAX_SAFE_INTEGER);
    // 切换tabSize的执行方法。切换时，Compartment实例需要相同
    __publicField(this, "toggleTabSize");
    __publicField(this, "togglePlaceholder");
    /**
     * 设置全部的扩展
     */
    __publicField(this, "setExtensions");
    __publicField(this, "toggleDisabled");
    __publicField(this, "toggleReadOnly");
    __publicField(this, "toggleMaxlength");
    this.view = t, this.toggleTabSize = oe(this.view), this.togglePlaceholder = oe(this.view), this.setExtensions = oe(this.view), this.toggleDisabled = oe(this.view), this.toggleReadOnly = oe(this.view), this.toggleMaxlength = oe(this.view);
  }
  getValue() {
    return this.view.state.doc.toString();
  }
  /**
   * 设置内容
   *
   * @param insert 待插入内容
   * @param from 插入开始位置
   * @param to 插入结束位置
   */
  setValue(t, r = 0, o = this.view.state.doc.length) {
    this.view.dispatch({
      changes: {
        from: r,
        to: o,
        insert: t
      }
    });
  }
  /**
   * 获取选中的文本
   */
  getSelectedText() {
    const { from: t, to: r } = this.view.state.selection.main;
    return this.view.state.sliceDoc(t, r);
  }
  /**
   * 使用新的内容替换选中的内容
   *
   * @param text 待替换内容
   * @param options 替换后是否选中
   */
  replaceSelectedText(t, r, o) {
    const l = {
      // 是否选中
      select: true,
      // 选中时，开始位置的偏移量
      deviationStart: 0,
      // 结束的偏移量
      deviationEnd: 0,
      // 直接替换所有文本
      replaceAll: false,
      // 替换旧文本的开始位置
      replaceStart: -1,
      // 替换旧文本的结束位置
      replaceEnd: -1,
      ...r
    };
    try {
      if (l.replaceAll) {
        if (this.setValue(t), t.length > this.maxLength)
          throw new Error("The input text is too long");
        return;
      }
      if (this.view.state.doc.length - this.getSelectedText().length + t.length > this.maxLength)
        throw new Error("The input text is too long");
      const { from: i } = this.view.state.selection.main;
      l.replaceStart !== -1 ? this.view.dispatch({
        changes: {
          from: l.replaceStart,
          to: l.replaceEnd,
          insert: t
        }
      }) : this.view.dispatch(this.view.state.replaceSelection(t)), l.select && this.view.dispatch({
        selection: {
          anchor: l.replaceStart === -1 ? i + l.deviationStart : l.replaceStart + l.deviationStart,
          head: l.replaceStart === -1 ? i + t.length + l.deviationEnd : l.replaceStart + t.length + l.deviationEnd
        }
      }), this.view.focus();
    } catch (i) {
      if (i.message === "The input text is too long")
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(o, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.E, {
          name: "overlength",
          message: i.message,
          data: t
        });
      else
        throw i;
    }
  }
  /**
   * 设置tabSize
   *
   * @param tabSize 需要切换的大小
   */
  setTabSize(t) {
    this.toggleTabSize([
      _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.EditorState.tabSize.of(t),
      _codemirror_language__WEBPACK_IMPORTED_MODULE_14__.indentUnit.of(" ".repeat(t))
    ]);
  }
  /**
   * 设置placeholder
   *
   * @param t 目标内容
   */
  setPlaceholder(t) {
    this.togglePlaceholder((0,_codemirror_view__WEBPACK_IMPORTED_MODULE_12__.placeholder)(t));
  }
  focus(t) {
    if (this.view.focus(), !t)
      return;
    let r = 0, o = 0, l = 0;
    switch (t) {
      case "start":
        break;
      case "end": {
        r = o = l = this.getValue().length;
        break;
      }
      default:
        r = t.rangeAnchor || t.cursorPos, o = t.rangeHead || t.cursorPos, l = t.cursorPos;
    }
    this.view.dispatch({
      scrollIntoView: true,
      selection: _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.EditorSelection.create(
        [_codemirror_state__WEBPACK_IMPORTED_MODULE_11__.EditorSelection.range(r, o), _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.EditorSelection.cursor(l)],
        1
      )
    });
  }
  setDisabled(t) {
    this.toggleDisabled([_codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.editable.of(!t)]);
  }
  setReadOnly(t) {
    this.toggleReadOnly([_codemirror_state__WEBPACK_IMPORTED_MODULE_11__.EditorState.readOnly.of(t)]);
  }
  setMaxLength(t) {
    this.maxLength = t, this.toggleMaxlength([
      _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.EditorState.changeFilter.of((r) => r.newDoc.length <= t)
    ]);
  }
}
const ko = (e, t) => {
  const { editorId: r } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), o = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (i) => {
      i instanceof Promise ? i.then((s) => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(r, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "universal", {
          generate() {
            return {
              targetValue: s
            };
          }
        });
      }).catch((s) => {
        console.error(s);
      }) : _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(r, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "universal", {
        generate() {
          return {
            targetValue: i
          };
        }
      });
    },
    [r]
  );
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (i) => {
      var _a, _b, _c;
      if (!i.clipboardData)
        return;
      if (i.clipboardData.files.length > 0) {
        const { files: h } = i.clipboardData;
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(
          r,
          _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.U,
          Array.from(h).filter((p) => /image\/.*/.test(p.type))
        ), i.preventDefault();
        return;
      }
      const s = i.clipboardData.getData("text/plain"), d = ((_a = t.current) == null ? void 0 : _a.view.state.selection.main.to) || 0, b = ((_b = t.current) == null ? void 0 : _b.view.state.doc.lineAt(d).from) || 0, c = ((_c = t.current) == null ? void 0 : _c.view.state.doc.sliceString(b, d)) || "", u = /!\[.*\]\(\s*$/.test(c), g = /!\[.*\]\((.*)\s?.*\)/.test(s);
      if (u) {
        const h = e.transformImgUrl(s);
        o(h), i.preventDefault();
        return;
      } else if (g) {
        const h = s.match(
          new RegExp(`(?<=!\\[.*\\]\\()([^)\\s]+)(?=\\s?["']?.*["']?\\))`, "g")
        );
        h ? Promise.all(
          h.map((p) => e.transformImgUrl(p))
        ).then((p) => {
          o(
            p.reduce((T, v, k) => T.replace(h[k], v), s)
          );
        }).catch((p) => {
          console.error(p);
        }) : o(s), i.preventDefault();
        return;
      }
      if (e.autoDetectCode && i.clipboardData.types.includes("vscode-editor-data")) {
        const h = JSON.parse(i.clipboardData.getData("vscode-editor-data"));
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(r, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "code", {
          mode: h.mode,
          text: i.clipboardData.getData("text/plain")
        }), i.preventDefault();
        return;
      }
      e.maxLength && s.length + e.modelValue.length > e.maxLength && _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(r, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.E, {
        name: "overlength",
        message: "The input text is too long",
        data: s
      });
    },
    [t, r, o, e]
  );
}, de = (e, t, r, o, l) => (i, s, d, b) => {
  const c = `${e}${t}${r}${o}`, u = d + s.label.length + (l === "title" ? r.length : 0);
  i.dispatch({
    changes: { from: d, to: b, insert: c },
    selection: _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.EditorSelection.create(
      [
        _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.EditorSelection.range(
          d + s.label.length + (l === "title" ? 1 : -t.length),
          u
        ),
        _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.EditorSelection.cursor(u)
      ],
      1
    )
  }), i.focus();
}, _e = (e) => (t, r, o, l) => {
  const i = e.slice(l - o);
  t.dispatch(t.state.replaceSelection(`${i} `));
}, We = (e) => {
  const t = (r) => {
    const o = r.matchBefore(
      /^#+|^-\s*\[*\s*\]*|`+|\[|!\[*|^\|\s?\|?|\$\$?|!+\s*\w*/
    );
    return o === null || o.from == o.to && r.explicit ? null : {
      from: o.from,
      options: [
        // 标题
        ...["h2", "h3", "h4", "h5", "h6"].map((l, i) => {
          const s = new Array(i + 2).fill("#").join("");
          return {
            label: s,
            type: "text",
            apply: _e(s)
          };
        }),
        // 任务列表
        ...["unchecked", "checked"].map((l) => {
          const i = l === "checked" ? "- [x]" : "- [ ]";
          return {
            label: i,
            type: "text",
            apply: _e(i)
          };
        }),
        // 代码
        ...[
          ["`", ""],
          ["```", "language"],
          ["```mermaid\n", ""],
          ["```echarts\n", ""]
        ].map((l) => ({
          label: `${l[0]}${l[1]}`,
          type: "text",
          apply: de(l[0], l[1], "", l[0] === "`" ? "`" : "\n```", "type")
        })),
        // 链接
        {
          label: "[]()",
          type: "text"
        },
        {
          label: "![]()",
          type: "text"
        },
        // 表格
        {
          label: "| |",
          type: "text",
          detail: "table",
          apply: `| col | col | col |
| - | - | - |
| content | content | content |
| content | content | content |`
        },
        // 公式
        {
          label: "$",
          type: "text",
          apply: de("$", "", "", "$", "type")
        },
        {
          label: "$$",
          type: "text",
          apply: de("$$", "", `
`, `
$$`, "title")
        },
        // 那啥？
        ...[
          "note",
          "abstract",
          "info",
          "tip",
          "success",
          "question",
          "warning",
          "failure",
          "danger",
          "bug",
          "example",
          "quote",
          "hint",
          "caution",
          "error",
          "attention"
        ].map((l) => ({
          label: `!!! ${l}`,
          type: "text",
          apply: de("!!!", ` ${l}`, " Title", `

!!!`, "title")
        }))
      ]
    };
  };
  return (0,_codemirror_autocomplete__WEBPACK_IMPORTED_MODULE_15__.autocompletion)({
    override: e ? [t, ...e] : [t]
  });
}, No = (e, t) => [
  {
    key: "Ctrl-b",
    mac: "Cmd-b",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "bold"), true)
  },
  {
    key: "Ctrl-d",
    mac: "Cmd-d",
    run: _codemirror_commands__WEBPACK_IMPORTED_MODULE_8__.deleteLine,
    preventDefault: true
  },
  {
    key: "Ctrl-s",
    mac: "Cmd-s",
    run: (B) => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.O, B.state.doc.toString()), true),
    shift: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "strikeThrough"), true)
  },
  {
    key: "Ctrl-u",
    mac: "Cmd-u",
    preventDefault: true,
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "underline"), true),
    shift: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "unorderedList"), true)
  },
  {
    key: "Ctrl-i",
    mac: "Cmd-i",
    preventDefault: true,
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "italic"), true),
    shift: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "image"), true)
  },
  {
    key: "Ctrl-1",
    mac: "Cmd-1",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "h1"), true)
  },
  {
    key: "Ctrl-2",
    mac: "Cmd-2",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "h2"), true)
  },
  {
    key: "Ctrl-3",
    mac: "Cmd-3",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "h3"), true)
  },
  {
    key: "Ctrl-4",
    mac: "Cmd-4",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "h4"), true)
  },
  {
    key: "Ctrl-5",
    mac: "Cmd-5",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "h5"), true)
  },
  {
    key: "Ctrl-6",
    mac: "Cmd-6",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "h6"), true)
  },
  {
    key: "Ctrl-ArrowUp",
    mac: "Cmd-ArrowUp",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "sup"), true)
  },
  {
    key: "Ctrl-ArrowDown",
    mac: "Cmd-ArrowDown",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "sub"), true)
  },
  {
    key: "Ctrl-o",
    mac: "Cmd-o",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "orderedList"), true)
  },
  {
    key: "Ctrl-c",
    mac: "Cmd-c",
    shift: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "code"), true),
    any(B, P) {
      return (P.ctrlKey || P.metaKey) && P.altKey && P.code === "KeyC" ? (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "codeRow"), true) : false;
    }
  },
  {
    key: "Ctrl-l",
    mac: "Cmd-l",
    run: () => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "link"), true)
  },
  {
    key: "Ctrl-f",
    mac: "Cmd-f",
    shift: () => t.noPrettier ? false : (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "prettier"), true)
  },
  {
    any: (B, P) => (P.ctrlKey || P.metaKey) && P.altKey && P.shiftKey && P.code === "KeyT" ? (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "table"), true) : false
  },
  ..._codemirror_search__WEBPACK_IMPORTED_MODULE_16__.searchKeymap
], So = () => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-divider` }), Eo = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.bold,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.bold,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "bold");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "bold" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.bold })
      ]
    }
  );
}, Io = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Eo), Lo = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o,
    catalogVisible: l
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
        l && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-active`,
        o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
      ]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.catalog,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.catalog,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.C);
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "catalog" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.catalog })
      ]
    },
    "bar-catalog"
  );
}, Ao = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Lo), Do = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.code,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.code,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "code");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "code" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.code })
      ]
    }
  );
}, Ro = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Do), Mo = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.codeRow,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.codeRow,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "codeRow");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "code-row" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.codeRow })
      ]
    }
  );
}, Fo = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Mo), Ho = () => {
  var _a, _b, _c;
  const {
    setting: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), { fullscreenHandler: l } = Br();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
        e.fullscreen && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-active`,
        o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
      ]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.fullscreen,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.fullscreen,
      disabled: o,
      onClick: () => {
        l();
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: e.fullscreen ? "fullscreen-exit" : "fullscreen" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.fullscreen })
      ]
    }
  );
}, Po = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Ho), Oo = () => {
  var _a, _b, _c;
  const { usedLanguageText: e, showToolbarName: t, disabled: r } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, r && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = e.toolbarTips) == null ? void 0 : _a.github,
      "aria-label": (_b = e.toolbarTips) == null ? void 0 : _b.github,
      disabled: r,
      onClick: () => {
        (0,_vavt_util__WEBPACK_IMPORTED_MODULE_3__.linkTo)("https://github.com/imzbf/md-editor-rt");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "github" }),
        t && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = e.toolbarTips) == null ? void 0 : _c.github })
      ]
    }
  );
}, Vo = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Oo), Bo = () => {
  var _a, _b, _c;
  const {
    usedLanguageText: e,
    setting: t,
    updateSetting: r,
    showToolbarName: o,
    disabled: l
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
        t.htmlPreview && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-active`,
        l && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
      ]),
      title: (_a = e.toolbarTips) == null ? void 0 : _a.htmlPreview,
      "aria-label": (_b = e.toolbarTips) == null ? void 0 : _b.htmlPreview,
      disabled: l,
      onClick: () => {
        r("htmlPreview");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "preview-html" }),
        o && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = e.toolbarTips) == null ? void 0 : _c.htmlPreview })
      ]
    }
  );
}, zo = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Bo), _o = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.image,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.image,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "image");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "image" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.image })
      ]
    }
  );
}, Wo = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(_o);
let X = null;
const qo = (e) => {
  var _a, _b, _c;
  const t = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), { editorId: r, usedLanguageText: o, rootRef: l } = t, i = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensions.cropper.instance, s = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), d = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), b = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), [c, u] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({
    cropperInited: false,
    imgSelected: false,
    imgSrc: "",
    // 是否全屏
    isFullscreen: false
  });
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    e.visible && !c.cropperInited && (window.Cropper = i || window.Cropper, s.current.onchange = () => {
      if (!window.Cropper) {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(r, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.E, {
          name: "Cropper",
          message: "Cropper is undefined"
        });
        return;
      }
      const T = s.current.files || [];
      if ((T == null ? void 0 : T.length) > 0) {
        const v = new FileReader();
        v.onload = (k) => {
          u((I) => ({
            ...I,
            imgSelected: true,
            imgSrc: k.target.result
          }));
        }, v.readAsDataURL(T[0]);
      }
    });
  }, [e.visible, c.cropperInited, i, r]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a2;
    (_a2 = b.current) == null ? void 0 : _a2.setAttribute("style", "");
  }, [c.imgSelected]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a2, _b2;
    X == null ? void 0 : X.destroy(), (_a2 = b.current) == null ? void 0 : _a2.setAttribute("style", ""), d.current && c.imgSrc && (X = new window.Cropper(d.current, {
      viewMode: 2,
      preview: ((_b2 = l.current) == null ? void 0 : _b2.getRootNode()).querySelector(
        `.${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-clip-preview-target`
      )
    }));
  }, [c.imgSrc, c.isFullscreen, l]);
  const g = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => c.isFullscreen ? {
    width: "100%",
    height: "100%"
  } : {
    width: "668px",
    height: "392px"
  }, [c.isFullscreen]), h = () => {
    X.clear(), X.destroy(), X = null, s.current.value = "", u((T) => ({
      ...T,
      imgSrc: "",
      imgSelected: false
    }));
  }, p = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)((T) => {
    u((v) => ({
      ...v,
      isFullscreen: T
    }));
  }, []);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a2, _b2, _c2;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
      _index_mjs__WEBPACK_IMPORTED_MODULE_19__.M,
      {
        className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-modal-clip`,
        title: (_a2 = o.clipModalTips) == null ? void 0 : _a2.title,
        visible: e.visible,
        onClose: e.onCancel,
        showAdjust: true,
        isFullscreen: c.isFullscreen,
        onAdjust: p,
        ...g,
        children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-form-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-clip`, children: [
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-clip-main`, children: c.imgSelected ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-clip-cropper`, children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
                "img",
                {
                  src: c.imgSrc,
                  ref: d,
                  style: { display: "none" },
                  alt: ""
                }
              ),
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-clip-delete`, onClick: h, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "delete" }) })
            ] }) : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
              "div",
              {
                className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-clip-upload`,
                onClick: () => {
                  s.current.click();
                },
                role: "button",
                tabIndex: 0,
                "aria-label": (_b2 = o.imgTitleItem) == null ? void 0 : _b2.upload,
                children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "upload" })
              }
            ) }),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-clip-preview`, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-clip-preview-target`, ref: b }) })
          ] }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-form-item`, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "button",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-btn`,
              type: "button",
              onClick: () => {
                if (X) {
                  const T = X.getCroppedCanvas();
                  _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(
                    r,
                    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.U,
                    [(0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.b)(T.toDataURL("image/png"))],
                    e.onOk
                  ), h();
                }
              },
              children: (_c2 = o.linkModalTips) == null ? void 0 : _c2.buttonOK
            }
          ) }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "input",
            {
              ref: s,
              accept: "image/*",
              type: "file",
              multiple: false,
              style: { display: "none" },
              "aria-hidden": "true"
            }
          )
        ]
      }
    );
  }, [
    (_a = o.clipModalTips) == null ? void 0 : _a.title,
    (_b = o.linkModalTips) == null ? void 0 : _b.buttonOK,
    (_c = o.imgTitleItem) == null ? void 0 : _c.upload,
    e.visible,
    e.onCancel,
    e.onOk,
    c.isFullscreen,
    c.imgSelected,
    c.imgSrc,
    p,
    g,
    r
  ]);
}, Ko = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(qo), Uo = (e) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Ko, { visible: e.clipVisible, onOk: e.onOk, onCancel: e.onCancel }), Go = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Uo), jo = () => {
  var _a, _b;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), l = `${e}-toolbar-wrapper`, [i, s] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false), [d, b] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false), c = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    var _a2;
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.U, Array.from(((_a2 = c.current) == null ? void 0 : _a2.files) || [])), c.current.value = "";
  }, [e]), g = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (k, I) => {
      o || _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, k, I);
    },
    [e, o]
  ), h = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    b(false);
  }, []), p = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (k) => {
      k && g("image", {
        desc: k.desc,
        url: k.url,
        transform: true
      }), b(false);
    },
    [g]
  ), T = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a2, _b2, _c;
    const k = [
      {
        key: "link",
        label: (_a2 = t.imgTitleItem) == null ? void 0 : _a2.link,
        onClick: () => g("image")
      },
      {
        key: "upload",
        label: (_b2 = t.imgTitleItem) == null ? void 0 : _b2.upload,
        onClick: () => {
          var _a3;
          return (_a3 = c.current) == null ? void 0 : _a3.click();
        }
      },
      {
        key: "clip",
        label: (_c = t.imgTitleItem) == null ? void 0 : _c.clip2upload,
        onClick: () => b(true)
      }
    ];
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      "ul",
      {
        className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu`,
        onClick: () => {
          s(false);
        },
        role: "menu",
        children: k.map((I) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
          "li",
          {
            className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-image`,
            onClick: I.onClick,
            role: "menuitem",
            tabIndex: 0,
            children: I.label
          },
          I.key
        ))
      }
    );
  }, [g, t.imgTitleItem]), v = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a2, _b2, _c;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
      "button",
      {
        className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
          `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
          o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
        ]),
        title: (_a2 = t.toolbarTips) == null ? void 0 : _a2.image,
        "aria-label": (_b2 = t.toolbarTips) == null ? void 0 : _b2.image,
        disabled: o,
        type: "button",
        children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "image" }),
          r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.image })
        ]
      }
    );
  }, [o, r, (_a = t.toolbarTips) == null ? void 0 : _a.image]);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const k = c.current;
    return k == null ? void 0 : k.addEventListener("change", u), () => {
      k == null ? void 0 : k.removeEventListener("change", u);
    };
  }, [u]), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      "label",
      {
        htmlFor: `${l}_label`,
        style: { display: "none" },
        "aria-label": (_b = t.imgTitleItem) == null ? void 0 : _b.upload
      }
    ),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      "input",
      {
        id: `${l}_label`,
        ref: c,
        accept: "image/*",
        type: "file",
        multiple: true,
        style: { display: "none" }
      }
    ),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Go, { clipVisible: d, onCancel: h, onOk: p }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      _index4_mjs__WEBPACK_IMPORTED_MODULE_20__.D,
      {
        relative: `#${l}`,
        visible: i,
        onChange: s,
        disabled: o,
        overlay: T,
        children: v
      }
    )
  ] });
}, Yo = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(jo), Zo = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.italic,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.italic,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "italic");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "italic" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.italic })
      ]
    }
  );
}, Xo = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Zo), Jo = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), l = `${e}-toolbar-wrapper`, [i, s] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false), d = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (u) => {
      o || _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, u);
    },
    [o, e]
  ), b = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a2, _b2;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
      "ul",
      {
        className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu`,
        onClick: () => {
          s(false);
        },
        role: "menu",
        children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-katex`,
              onClick: () => {
                d("katexInline");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_a2 = t.katex) == null ? void 0 : _a2.inline
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-katex`,
              onClick: () => {
                d("katexBlock");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_b2 = t.katex) == null ? void 0 : _b2.block
            }
          )
        ]
      }
    );
  }, [d, (_a = t.katex) == null ? void 0 : _a.block, (_b = t.katex) == null ? void 0 : _b.inline]), c = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a2, _b2, _c2;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
      "button",
      {
        className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
          `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
          o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
        ]),
        title: (_a2 = t.toolbarTips) == null ? void 0 : _a2.katex,
        "aria-label": (_b2 = t.toolbarTips) == null ? void 0 : _b2.katex,
        disabled: o,
        type: "button",
        children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "formula" }),
          r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c2 = t.toolbarTips) == null ? void 0 : _c2.katex })
        ]
      }
    );
  }, [o, r, (_c = t.toolbarTips) == null ? void 0 : _c.katex]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    _index4_mjs__WEBPACK_IMPORTED_MODULE_20__.D,
    {
      relative: `#${l}`,
      visible: i,
      onChange: s,
      disabled: o,
      overlay: b,
      children: c
    },
    "bar-katex"
  );
}, Qo = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Jo), er = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.link,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.link,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "link");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "link" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.link })
      ]
    }
  );
}, tr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(er), or = () => {
  var _a, _b, _c, _d, _e2, _f, _g, _h, _i;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), l = `${e}-toolbar-wrapper`, [i, s] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false), d = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (u) => {
      o || _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, u);
    },
    [o, e]
  ), b = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a2, _b2, _c2, _d2, _e3, _f2, _g2, _h2;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
      "ul",
      {
        className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu`,
        onClick: () => {
          s(false);
        },
        role: "menu",
        children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-mermaid`,
              onClick: () => {
                d("flow");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_a2 = t.mermaid) == null ? void 0 : _a2.flow
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-mermaid`,
              onClick: () => {
                d("sequence");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_b2 = t.mermaid) == null ? void 0 : _b2.sequence
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-mermaid`,
              onClick: () => {
                d("gantt");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_c2 = t.mermaid) == null ? void 0 : _c2.gantt
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-mermaid`,
              onClick: () => {
                d("class");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_d2 = t.mermaid) == null ? void 0 : _d2.class
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-mermaid`,
              onClick: () => {
                d("state");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_e3 = t.mermaid) == null ? void 0 : _e3.state
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-mermaid`,
              onClick: () => {
                d("pie");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_f2 = t.mermaid) == null ? void 0 : _f2.pie
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-mermaid`,
              onClick: () => {
                d("relationship");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_g2 = t.mermaid) == null ? void 0 : _g2.relationship
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-mermaid`,
              onClick: () => {
                d("journey");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_h2 = t.mermaid) == null ? void 0 : _h2.journey
            }
          )
        ]
      }
    );
  }, [
    d,
    (_a = t.mermaid) == null ? void 0 : _a.class,
    (_b = t.mermaid) == null ? void 0 : _b.flow,
    (_c = t.mermaid) == null ? void 0 : _c.gantt,
    (_d = t.mermaid) == null ? void 0 : _d.journey,
    (_e2 = t.mermaid) == null ? void 0 : _e2.pie,
    (_f = t.mermaid) == null ? void 0 : _f.relationship,
    (_g = t.mermaid) == null ? void 0 : _g.sequence,
    (_h = t.mermaid) == null ? void 0 : _h.state
  ]), c = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a2, _b2, _c2;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
      "button",
      {
        className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
          `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
          o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
        ]),
        title: (_a2 = t.toolbarTips) == null ? void 0 : _a2.mermaid,
        "aria-label": (_b2 = t.toolbarTips) == null ? void 0 : _b2.mermaid,
        disabled: o,
        type: "button",
        children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "mermaid" }),
          r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c2 = t.toolbarTips) == null ? void 0 : _c2.mermaid })
        ]
      }
    );
  }, [o, r, (_i = t.toolbarTips) == null ? void 0 : _i.mermaid]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    _index4_mjs__WEBPACK_IMPORTED_MODULE_20__.D,
    {
      relative: `#${l}`,
      visible: i,
      onChange: s,
      disabled: o,
      overlay: b,
      children: c
    },
    "bar-mermaid"
  );
}, rr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(or), nr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.next,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.next,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.a);
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "next" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.next })
      ]
    }
  );
}, ar = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(nr), lr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.orderedList,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.orderedList,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "orderedList");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "ordered-list" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.orderedList })
      ]
    }
  );
}, ir = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(lr), sr = () => {
  var _a, _b, _c;
  const {
    setting: e,
    usedLanguageText: t,
    updateSetting: r,
    showToolbarName: o,
    disabled: l
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
        e.pageFullscreen && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-active`,
        l && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
      ]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.pageFullscreen,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.pageFullscreen,
      disabled: l,
      onClick: () => {
        r("pageFullscreen");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: e.pageFullscreen ? "minimize" : "maximize" }),
        o && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.pageFullscreen })
      ]
    }
  );
}, cr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(sr), dr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.prettier,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.prettier,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "prettier");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "prettier" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.prettier })
      ]
    }
  );
}, ur = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(dr), mr = () => {
  var _a, _b, _c;
  const {
    usedLanguageText: e,
    showToolbarName: t,
    disabled: r,
    setting: o,
    updateSetting: l
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
        o.preview && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-active`,
        r && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
      ]),
      title: (_a = e.toolbarTips) == null ? void 0 : _a.preview,
      "aria-label": (_b = e.toolbarTips) == null ? void 0 : _b.preview,
      disabled: r,
      onClick: () => {
        l("preview");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "preview" }),
        t && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = e.toolbarTips) == null ? void 0 : _c.preview })
      ]
    }
  );
}, br = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(mr), hr = () => {
  var _a, _b, _c;
  const {
    usedLanguageText: e,
    showToolbarName: t,
    disabled: r,
    setting: o,
    updateSetting: l
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
        o.previewOnly && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-active`,
        r && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
      ]),
      title: (_a = e.toolbarTips) == null ? void 0 : _a.previewOnly,
      "aria-label": (_b = e.toolbarTips) == null ? void 0 : _b.previewOnly,
      disabled: r,
      onClick: () => {
        l("previewOnly");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "preview-only" }),
        t && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = e.toolbarTips) == null ? void 0 : _c.previewOnly })
      ]
    }
  );
}, gr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(hr), fr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.quote,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.quote,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "quote");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "quote" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.quote })
      ]
    }
  );
}, pr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(fr), Tr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.revoke,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.revoke,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.c);
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "revoke" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.revoke })
      ]
    }
  );
}, vr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Tr), wr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.save,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.save,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.O);
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "save" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.save })
      ]
    }
  );
}, $r = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(wr), Cr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.strikeThrough,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.strikeThrough,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "strikeThrough");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "strike-through" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.strikeThrough })
      ]
    }
  );
}, xr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Cr), yr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.sub,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.sub,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "sub");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "sub" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.sub })
      ]
    }
  );
}, kr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(yr), Nr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.sup,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.sup,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "sup");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "sup" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.sup })
      ]
    }
  );
}, Sr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Nr), Er = (e) => {
  const [t, r] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({
    x: -1,
    y: -1
  }), o = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => JSON.stringify(e.tableShape), [e.tableShape]), l = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    const d = [...JSON.parse(o)];
    return (!d[2] || d[2] < d[0]) && (d[2] = d[0]), (!d[3] || d[3] < d[3]) && (d[3] = d[1]), d;
  }, [o]), [i, s] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(l);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    s(l), r({
      x: -1,
      y: -1
    });
  }, [l]), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    "div",
    {
      className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-table-shape`,
      onMouseLeave: () => {
        s(l), r({
          x: -1,
          y: -1
        });
      },
      children: new Array(i[1]).fill("").map((d, b) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-table-shape-row`, children: new Array(i[0]).fill("").map((c, u) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        "div",
        {
          className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-table-shape-col`,
          onMouseEnter: () => {
            r({
              x: b,
              y: u
            }), u + 1 === i[0] && u + 1 < i[2] ? s((g) => {
              const h = [...g];
              return h[0] = g[0] + 1, h;
            }) : u + 2 < i[0] && i[0] > e.tableShape[0] && s((g) => {
              const h = [...g];
              return h[0] = g[0] - 1, h;
            }), b + 1 === i[1] && b + 1 < i[3] ? s((g) => {
              const h = [...g];
              return h[1] = g[1] + 1, h;
            }) : b + 2 < i[1] && i[1] > e.tableShape[1] && s((g) => {
              const h = [...g];
              return h[1] = g[1] - 1, h;
            });
          },
          onClick: () => {
            e.onSelected(t);
          },
          children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "div",
            {
              className: [
                `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-table-shape-col-default`,
                b <= t.x && u <= t.y && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-table-shape-col-include`
              ].filter((g) => !!g).join(" ")
            }
          )
        },
        `table-shape-col-${u}`
      )) }, `table-shape-row-${b}`))
    }
  );
}, Ir = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Er), Lr = () => {
  var _a;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o,
    tableShape: l
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), i = `${e}-toolbar-wrapper`, [s, d] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false), b = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (g) => {
      o || _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "table", { selectedShape: g });
    },
    [o, e]
  ), c = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Ir, { tableShape: l, onSelected: b }), [b, l]), u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a2, _b, _c;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
      "button",
      {
        className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
          `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
          o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
        ]),
        title: (_a2 = t.toolbarTips) == null ? void 0 : _a2.table,
        "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.table,
        disabled: o,
        type: "button",
        children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "table" }),
          r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.table })
        ]
      }
    );
  }, [o, r, (_a = t.toolbarTips) == null ? void 0 : _a.table]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    _index4_mjs__WEBPACK_IMPORTED_MODULE_20__.D,
    {
      relative: `#${i}`,
      visible: s,
      onChange: d,
      disabled: o,
      overlay: c,
      children: u
    },
    "bar-table"
  );
}, Ar = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Lr), Dr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.task,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.task,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "task");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "task" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.task })
      ]
    }
  );
}, Rr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Dr), Mr = () => {
  var _a, _b, _c, _d, _e2, _f, _g;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), l = `${e}-toolbar-wrapper`, [i, s] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false), d = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (u) => {
      o || _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, u);
    },
    [o, e]
  ), b = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a2, _b2, _c2, _d2, _e3, _f2;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
      "ul",
      {
        className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu`,
        onClick: () => {
          s(false);
        },
        role: "menu",
        children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-title`,
              onClick: () => {
                d("h1");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_a2 = t.titleItem) == null ? void 0 : _a2.h1
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-title`,
              onClick: () => {
                d("h2");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_b2 = t.titleItem) == null ? void 0 : _b2.h2
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-title`,
              onClick: () => {
                d("h3");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_c2 = t.titleItem) == null ? void 0 : _c2.h3
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-title`,
              onClick: () => {
                d("h4");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_d2 = t.titleItem) == null ? void 0 : _d2.h4
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-title`,
              onClick: () => {
                d("h5");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_e3 = t.titleItem) == null ? void 0 : _e3.h5
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "li",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-menu-item-title`,
              onClick: () => {
                d("h6");
              },
              role: "menuitem",
              tabIndex: 0,
              children: (_f2 = t.titleItem) == null ? void 0 : _f2.h6
            }
          )
        ]
      }
    );
  }, [
    d,
    (_a = t.titleItem) == null ? void 0 : _a.h1,
    (_b = t.titleItem) == null ? void 0 : _b.h2,
    (_c = t.titleItem) == null ? void 0 : _c.h3,
    (_d = t.titleItem) == null ? void 0 : _d.h4,
    (_e2 = t.titleItem) == null ? void 0 : _e2.h5,
    (_f = t.titleItem) == null ? void 0 : _f.h6
  ]), c = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a2, _b2, _c2;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
      "button",
      {
        className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
          `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`,
          o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
        ]),
        disabled: o,
        title: (_a2 = t.toolbarTips) == null ? void 0 : _a2.title,
        "aria-label": (_b2 = t.toolbarTips) == null ? void 0 : _b2.title,
        type: "button",
        children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "title" }),
          r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c2 = t.toolbarTips) == null ? void 0 : _c2.title })
        ]
      }
    );
  }, [o, r, (_g = t.toolbarTips) == null ? void 0 : _g.title]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    _index4_mjs__WEBPACK_IMPORTED_MODULE_20__.D,
    {
      relative: `#${l}`,
      visible: i,
      onChange: s,
      disabled: o,
      overlay: b,
      children: c
    }
  );
}, Fr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Mr), Hr = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.underline,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.underline,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "underline");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "underline" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.underline })
      ]
    }
  );
}, Pr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Hr), Or = () => {
  var _a, _b, _c;
  const {
    editorId: e,
    usedLanguageText: t,
    showToolbarName: r,
    disabled: o
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "button",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item`, o && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      title: (_a = t.toolbarTips) == null ? void 0 : _a.unorderedList,
      "aria-label": (_b = t.toolbarTips) == null ? void 0 : _b.unorderedList,
      disabled: o,
      onClick: () => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "unorderedList");
      },
      type: "button",
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_index_mjs__WEBPACK_IMPORTED_MODULE_19__.I, { name: "unordered-list" }),
        r && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-item-name`, children: (_c = t.toolbarTips) == null ? void 0 : _c.unorderedList })
      ]
    }
  );
}, Vr = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Or), Br = () => {
  const { editorId: e, updateSetting: t } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), r = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(_config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensions.screenfull.instance), o = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(false), l = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (i) => {
      if (!r.current) {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.E, {
          name: "fullscreen",
          message: "fullscreen is undefined"
        });
        return;
      }
      r.current.isEnabled ? (o.current = !o.current, (i === void 0 ? !r.current.isFullscreen : i) ? r.current.request() : r.current.exit()) : console.error("browser does not support screenfull!");
    },
    [e]
  );
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const i = () => {
      t("fullscreen", o.current);
    };
    let s = -1;
    if (!r.current) {
      const { editorExtensions: d, editorExtensionsAttrs: b } = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g;
      s = requestAnimationFrame(() => {
        var _a;
        (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_18__.a)(
          "script",
          {
            ...(_a = b.screenfull) == null ? void 0 : _a.js,
            src: d.screenfull.js,
            id: _hooks_mjs__WEBPACK_IMPORTED_MODULE_7__.C.screenfull,
            onload() {
              r.current = window.screenfull, r.current && r.current.isEnabled && r.current.on("change", i);
            }
          },
          "screenfull"
        );
      });
    }
    return r.current && r.current.isEnabled && r.current.on("change", i), () => {
      r.current || cancelAnimationFrame(s), r.current && r.current.isEnabled && r.current.off("change", i);
    };
  }, [t]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.on(e, {
    name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.d,
    callback: l
  }), () => {
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.remove(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.d, l);
  }), [e, l]), { fullscreenHandler: l };
}, ut = () => {
  const {
    editorId: e,
    theme: t,
    previewTheme: r,
    language: o,
    disabled: l,
    noUploadImg: i,
    noPrettier: s,
    codeTheme: d,
    showToolbarName: b,
    setting: c,
    defToolbars: u
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return { barRender: (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (h, p) => {
      var _a, _b, _c, _d, _e2, _f;
      if (_config_mjs__WEBPACK_IMPORTED_MODULE_2__.a.includes(h)) {
        const T = `bar-divider-${p != null ? p : e}`;
        switch (h) {
          case "-":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(So, {}, T);
          case "bold":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Io, {}, "bar-bold");
          case "underline":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Pr, {}, "bar-unorderline");
          case "italic":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Xo, {}, "bar-italic");
          case "strikeThrough":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(xr, {}, "bar-strikeThrough");
          case "title":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Fr, {}, "bar-title");
          case "sub":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(kr, {}, "bar-sub");
          case "sup":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Sr, {}, "bar-sup");
          case "quote":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(pr, {}, "bar-quote");
          case "unorderedList":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Vr, {}, "bar-unorderedList");
          case "orderedList":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ir, {}, "bar-orderedList");
          case "task":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Rr, {}, "bar-task");
          case "codeRow":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Fo, {}, "bar-codeRow");
          case "code":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Ro, {}, "bar-code");
          case "link":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(tr, {}, "bar-link");
          case "image":
            return i ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Wo, {}, "bar-image") : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Yo, {}, "bar-imageDropdown");
          case "table":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Ar, {}, "bar-table");
          case "revoke":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(vr, {}, "bar-revoke");
          case "next":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ar, {}, "bar-next");
          case "save":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)($r, {}, "bar-save");
          case "prettier":
            return !s && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ur, {}, "bar-prettier");
          case "pageFullscreen":
            return !c.fullscreen && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(cr, {}, "bar-pageFullscreen");
          case "fullscreen":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Po, {}, "bar-fullscreen");
          case "catalog":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Ao, {}, "bar-catalog");
          case "preview":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(br, {}, "bar-preview");
          case "previewOnly":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(gr, {}, "bar-previewOnly");
          case "htmlPreview":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(zo, {}, "bar-htmlPreview");
          case "github":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Vo, {}, "bar-github");
          case "mermaid":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(rr, {}, "bar-mermaid");
          case "katex":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Qo, {}, "bar-katex");
          default:
            return null;
        }
      }
      if (u) {
        const T = u[h];
        if (T)
          return (0,react__WEBPACK_IMPORTED_MODULE_1__.cloneElement)(T, {
            theme: ((_a = T.props) == null ? void 0 : _a.theme) || t,
            codeTheme: ((_b = T.props) == null ? void 0 : _b.codeTheme) || d,
            previewTheme: ((_c = T.props) == null ? void 0 : _c.previewTheme) || r,
            language: ((_d = T.props) == null ? void 0 : _d.language) || o,
            disabled: ((_e2 = T.props) == null ? void 0 : _e2.disabled) || l,
            showToolbarName: ((_f = T.props) == null ? void 0 : _f.showToolbarName) || b,
            insert(v) {
              _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, "universal", { generate: v });
            }
          });
      }
      return null;
    },
    [
      d,
      u,
      l,
      e,
      o,
      s,
      i,
      r,
      c.fullscreen,
      b,
      t
    ]
  ) };
}, zr = () => {
  const e = _r(), { barRender: t } = ut();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E.Provider, { value: e, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-floating-toolbar`, children: e.floatingToolbars.map((r, o) => t(r, `floating-${o}`)) }) });
}, mt = (0,react__WEBPACK_IMPORTED_MODULE_1__.createContext)({
  getValue: () => _context_mjs__WEBPACK_IMPORTED_MODULE_5__.d,
  subscribe: () => () => {
  }
}), _r = () => {
  const e = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(mt);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useSyncExternalStore)(e.subscribe, e.getValue);
}, xe = _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.StateEffect.define(), Wr = _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.StateField.define({
  create() {
    return null;
  },
  update(e, t) {
    for (const r of t.effects) r.is(xe) && (e = r.value);
    return e;
  },
  provide: (e) => _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.showTooltip.from(e)
}), qr = (e) => {
  let t = null;
  const r = (i, s) => {
    t && t.kind === s.kind && t.pos === s.pos || (t = s, i.dispatch({
      effects: xe.of({
        pos: s.pos,
        above: true,
        arrow: true,
        create: () => {
          const d = document.createElement("div"), b = `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-floating-toolbar-container`;
          d.classList.add(b), d.dataset.state = "hidden", requestAnimationFrame(() => {
            d.dataset.state = "visible";
          });
          const c = document.createElement("div");
          d.appendChild(c);
          const u = (0,react_dom_client__WEBPACK_IMPORTED_MODULE_17__.createRoot)(c);
          return u.render(
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(mt.Provider, { value: e.contextValue, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(zr, {}) })
          ), { dom: d, destroy: () => u.unmount() };
        }
      })
    }));
  }, o = (i) => {
    t && (t = null, i.dispatch({ effects: xe.of(null) }));
  }, l = _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.updateListener.of((i) => {
    if (i.selectionSet || i.docChanged) {
      const s = i.state, d = s.selection.main;
      if (!d.empty)
        r(i.view, { kind: "selection", pos: d.anchor });
      else {
        const b = d.head, c = s.doc.lineAt(b);
        /^\s*$/.test(c.text) ? r(i.view, { kind: "emptyLine", pos: b }) : o(i.view);
      }
    }
  });
  return [Wr, l];
}, Kr = /[a-z][a-z0-9.+-]*:\/\/[^\s<>"'`()]+(?:\([^\s<>"'`]*\)[^\s<>"'`]*)*/i, Ur = /\/\/[^\s<>"'`()]+/i, Gr = /data:[a-z]+\/[a-z0-9.+-]+(?:;base64)?,[a-z0-9+/=%]+/i, jr = /\/(?!\/)[^\s<>"'`()]+/i, me = new RegExp(
  `(${Kr.source}|${Ur.source}|${Gr.source}|${jr.source})`,
  "gi"
), Yr = /[a-z0-9.+-]/i, Zr = (e) => {
  var _a;
  const t = [];
  me.lastIndex = 0;
  let r;
  for (; r = me.exec(e); ) {
    const o = (_a = r.index) != null ? _a : 0, l = o > 0 ? e[o - 1] : "";
    if (l && Yr.test(l) || l === "<" && e[o] === "/")
      continue;
    const s = o + r[0].length;
    t.push([o, s]);
  }
  return t;
}, Xr = (e, t, r) => e.some((o) => o.from === t && o.to === r), Jr = (e) => {
  const t = e.shortenText || (() => "..."), r = _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.StateEffect.define(), o = _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.StateEffect.define(), l = (b, c) => {
    var _a, _b;
    const u = new _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.RangeSetBuilder(), g = [];
    for (let h = 1; h <= b.doc.lines; h++) {
      const p = b.doc.line(h), T = p.text;
      me.lastIndex = 0;
      const v = (_b = (_a = e.findTexts) == null ? void 0 : _a.call(e, {
        state: b,
        lineText: T,
        lineNumber: p.number,
        lineFrom: p.from,
        lineTo: p.to,
        defaultTextRegex: me
      })) != null ? _b : Zr(T);
      for (const k of v) {
        if (!k) continue;
        const [I, H] = k;
        if (typeof I != "number" || typeof H != "number" || I < 0 || H <= I || I >= T.length || H > T.length)
          continue;
        const z = T.slice(I, H);
        if (!z || z.length <= e.maxLength)
          continue;
        const B = p.from + I, P = p.from + H;
        if (Xr(c, B, P)) {
          g.push({ from: B, to: P });
          continue;
        }
        const Z = t(z);
        u.add(
          B,
          P,
          _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.Decoration.replace({ widget: new i(Z, z, B, P) })
        );
      }
    }
    return { deco: u.finish(), expanded: g };
  };
  class i extends _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.WidgetType {
    constructor(c, u, g, h) {
      super(), this.short = c, this.raw = u, this.from = g, this.to = h;
    }
    toDOM(c) {
      const u = document.createElement("span");
      return u.textContent = this.short, u.className = "cm-short-text", u.title = this.raw, u.style.display = "inline", u.style.textDecoration = "underline", u.addEventListener("mousedown", (g) => {
        g.preventDefault(), g.stopPropagation(), c.dispatch({
          selection: _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.EditorSelection.cursor(this.from),
          effects: r.of({
            from: this.from,
            to: this.to,
            expand: true
          })
        }), c.focus();
      }), u.addEventListener("click", (g) => {
        g.preventDefault();
      }), u;
    }
    ignoreEvent() {
      return false;
    }
    eq(c) {
      return this.short === c.short && this.raw === c.raw && this.from === c.from && this.to === c.to;
    }
  }
  const s = _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.StateField.define({
    create(b) {
      return l(b, []);
    },
    update(b, c) {
      let u = b.expanded;
      c.docChanged && u.length && (u = u.map(({ from: h, to: p }) => ({
        from: c.changes.mapPos(h, 1),
        to: c.changes.mapPos(p, -1)
      })).filter(({ from: h, to: p }) => h < p));
      let g = u !== b.expanded;
      for (const h of c.effects)
        h.is(r) ? h.value.expand ? u = [{ from: h.value.from, to: h.value.to }] : u = u.filter(
          ({ from: p, to: T }) => p !== h.value.from || T !== h.value.to
        ) : h.is(o) && u.length > 0 && (u = []);
      return !g && u !== b.expanded && (g = true), c.docChanged || g ? l(c.state, u) : b;
    },
    provide: (b) => _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.decorations.compute([b], (c) => c.field(b).deco)
  }), d = _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.domEventHandlers({
    mousedown(b, c) {
      const u = c.state.field(s, false);
      if (!u || u.expanded.length === 0)
        return false;
      const g = b.target;
      if (g && c.dom.contains(g)) {
        const h = c.posAtDOM(g, 0);
        if (h != null && h !== -1 && u.expanded.some(
          ({ from: T, to: v }) => h >= T && h <= v
        ))
          return false;
      }
      return c.dispatch({ effects: o.of(void 0) }), false;
    }
  });
  return [s, d];
}, Qr = "#e5c07b", qe = "var(--md-color)", en = "#56b6c2", tn = "#fff", ae = "#3f4a54", Ke = "#2d8cf0", on = "#2d8cf0", rn = "#3f4a54", Ue = "#d19a66", nn = "#c678dd", an = "#f6f6f6", ln = "#ceedfa33", Ge = "var(--md-bk-color)", ve = "var(--md-bk-color)", sn = "#bad5fa", je = "#3f4a54", cn = _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.theme(
  {
    "&": {
      color: ae,
      backgroundColor: Ge
    },
    ".cm-content": {
      caretColor: je
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: je },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: sn },
    ".cm-panels": { backgroundColor: an, color: ae },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--md-border-color)" },
    ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--md-border-color)" },
    ".cm-searchMatch": {
      backgroundColor: "#72a1ff59",
      outline: "1px solid #457dff"
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#6199ff2f"
    },
    ".cm-activeLine": { backgroundColor: "#ceedfa33" },
    ".cm-selectionMatch": { backgroundColor: "#aafe661a" },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "#bad0f847"
    },
    ".cm-gutters": {
      backgroundColor: Ge,
      color: ae,
      borderRight: "1px solid",
      borderColor: "var(--md-border-color)"
    },
    ".cm-activeLineGutter": {
      backgroundColor: ln
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "transparent",
      border: "none",
      color: "#ddd"
    },
    ".cm-tooltip": {
      border: "1px solid var(--md-border-color)",
      backgroundColor: ve
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: "var(--md-border-color)",
      //'transparent',
      borderBottomColor: "var(--md-border-color)"
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: ve,
      borderBottomColor: ve
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        color: ae
      }
    }
  }
  // { dark: true }
), dn = _codemirror_language__WEBPACK_IMPORTED_MODULE_14__.HighlightStyle.define([
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.keyword, color: nn },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.name, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.deleted, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.character, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.propertyName, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.macroName], color: qe },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.function(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.variableName), _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.labelName], color: on },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.color, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.constant(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.name), _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.standard(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.name)], color: Ue },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.definition(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.name), _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.separator], color: ae },
  {
    tag: [
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.typeName,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.className,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.number,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.changed,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.annotation,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.modifier,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.self,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.namespace
    ],
    color: Qr
  },
  {
    tag: [
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.operator,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.operatorKeyword,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.url,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.escape,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.regexp,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.link,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.special(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.string)
    ],
    color: en
  },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.meta, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.comment], color: Ke },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.strong, fontWeight: "bold" },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.emphasis, fontStyle: "italic" },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.strikethrough, textDecoration: "line-through" },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.link, color: Ke, textDecoration: "underline" },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.heading, fontWeight: "bold", color: qe },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.atom, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.bool, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.special(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.variableName)], color: Ue },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.processingInstruction, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.string, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.inserted], color: rn },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.invalid, color: tn }
]), Ye = [
  cn,
  (0,_codemirror_language__WEBPACK_IMPORTED_MODULE_14__.syntaxHighlighting)(dn)
], un = "#e5c07b", Ze = "var(--md-color)", mn = "#56b6c2", bn = "#ffffff", le = "var(--md-color)", Xe = "#e5c07b", hn = "#e5c07b", gn = "var(--md-color)", Je = "#d19a66", fn = "#c678dd", pn = "#21252b", Tn = "#2c313a", Qe = "var(--md-bk-color)", we = "var(--md-bk-color)", vn = "#ceedfa33", et = "#528bff", wn = _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.theme(
  {
    "&": {
      color: le,
      backgroundColor: Qe
    },
    ".cm-content": {
      caretColor: et
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: et },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: vn },
    ".cm-panels": { backgroundColor: pn, color: le },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--md-border-color)" },
    ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--md-border-color)" },
    ".cm-searchMatch": {
      backgroundColor: "#72a1ff59",
      outline: "1px solid #457dff"
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#6199ff2f"
    },
    ".cm-activeLine": { backgroundColor: "#ceedfa33" },
    ".cm-selectionMatch": { backgroundColor: "#aafe661a" },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "#bad0f847"
    },
    ".cm-gutters": {
      backgroundColor: Qe,
      color: le,
      borderRight: "1px solid",
      borderColor: "var(--md-border-color)"
    },
    ".cm-activeLineGutter": {
      backgroundColor: Tn
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "transparent",
      border: "none",
      color: "#ddd"
    },
    ".cm-tooltip": {
      border: "1px solid var(--md-border-color)",
      backgroundColor: we
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: "var(--md-border-color)",
      //'transparent',
      borderBottomColor: "var(--md-border-color)"
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: we,
      borderBottomColor: we
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        color: le
      }
    }
  },
  { dark: true }
), $n = _codemirror_language__WEBPACK_IMPORTED_MODULE_14__.HighlightStyle.define([
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.keyword, color: fn },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.name, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.deleted, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.character, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.propertyName, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.macroName], color: Ze },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.function(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.variableName), _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.labelName], color: hn },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.color, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.constant(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.name), _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.standard(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.name)], color: Je },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.definition(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.name), _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.separator], color: le },
  {
    tag: [
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.typeName,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.className,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.number,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.changed,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.annotation,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.modifier,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.self,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.namespace
    ],
    color: un
  },
  {
    tag: [
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.operator,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.operatorKeyword,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.url,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.escape,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.regexp,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.link,
      _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.special(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.string)
    ],
    color: mn
  },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.meta, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.comment], color: Xe },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.strong, fontWeight: "bold" },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.emphasis, fontStyle: "italic" },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.strikethrough, textDecoration: "line-through" },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.link, color: Xe, textDecoration: "underline" },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.heading, fontWeight: "bold", color: Ze },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.atom, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.bool, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.special(_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.variableName)], color: Je },
  { tag: [_lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.processingInstruction, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.string, _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.inserted], color: gn },
  { tag: _lezer_highlight__WEBPACK_IMPORTED_MODULE_21__.tags.invalid, color: bn }
]), tt = [
  wn,
  (0,_codemirror_language__WEBPACK_IMPORTED_MODULE_14__.syntaxHighlighting)($n)
], Cn = (e, t) => {
  if (e === t) return true;
  if (e.length !== t.length) return false;
  for (let r = 0; r < e.length; r++)
    if (e[r] !== t[r]) return false;
  return true;
}, xn = (e, t) => {
  const r = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)([]);
  (!r.current || !Cn(r.current, t)) && (r.current = t, e());
};
_codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.EDIT_CONTEXT = false;
const bt = (e) => e.extension instanceof Function ? e.extension(e.options) : e.extension, yn = (e) => {
  const t = bt(e);
  return e.compartment ? e.compartment.of(t) : t;
}, kn = (e) => {
  const t = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), { tabWidth: r, editorId: o, theme: l, noPrettier: i, disabled: s, floatingToolbars: d } = t, b = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), c = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(true), [g] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => ({
    theme: new _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.Compartment(),
    autocompletion: new _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.Compartment(),
    update: new _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.Compartment(),
    domEvent: new _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.Compartment(),
    history: new _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.Compartment(),
    floatingToolbar: new _codemirror_state__WEBPACK_IMPORTED_MODULE_11__.Compartment()
  })), [h] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => No(o, { noPrettier: i })), p = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    () => [...h, ..._codemirror_commands__WEBPACK_IMPORTED_MODULE_8__.defaultKeymap, ..._codemirror_commands__WEBPACK_IMPORTED_MODULE_8__.historyKeymap, _codemirror_commands__WEBPACK_IMPORTED_MODULE_8__.indentWithTab],
    [h]
  ), T = ko(e, c), [v, k] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({}), I = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    const x = {
      paste: T,
      blur: e.onBlur,
      focus: e.onFocus,
      drop: e.onDrop,
      input: (_) => {
        e.onInput && e.onInput(_);
        const { data: F } = _;
        e.maxLength && e.modelValue.length + F.length > e.maxLength && _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(o, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.E, {
          name: "overlength",
          message: "The input text is too long",
          data: F
        });
      }
    }, M = {
      ...x
    }, W = Object.keys(x);
    for (const _ in v) {
      const F = _;
      W.includes(F) ? M[F] = (U, j) => {
        v[F](
          U,
          j
        ), U.defaultPrevented || x[F](U, j);
      } : M[F] = v[F];
    }
    return M;
  }, [v, o, T, e]), H = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(/* @__PURE__ */ new Set()), z = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(t);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    z.current = t, H.current.forEach((x) => x());
  }, [t]);
  const [B] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => qr({
    contextValue: {
      getValue: () => z.current,
      subscribe: (x) => (H.current.add(x), () => H.current.delete(x))
    }
  })), [P] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => [
    {
      type: "theme",
      extension: ({ theme: x }) => x === "light" ? Ye : tt,
      compartment: g.theme,
      options: {
        theme: l
      }
    },
    {
      type: "updateListener",
      extension: _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.updateListener.of((x) => {
        x.docChanged && e.onChange(x.state.doc.toString());
      }),
      compartment: g.update
    },
    {
      type: "domEventHandlers",
      extension: _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.domEventHandlers(I),
      compartment: g.domEvent
    },
    {
      type: "completions",
      extension: We(e.completions),
      compartment: g.autocompletion
    },
    {
      type: "history",
      extension: (0,_codemirror_commands__WEBPACK_IMPORTED_MODULE_8__.history)(),
      compartment: g.history
    }
  ]), [Z] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.codeMirrorExtensions(
    [
      // 横向换行
      {
        type: "lineWrapping",
        extension: _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.lineWrapping
      },
      {
        type: "keymap",
        extension: _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.keymap.of(p())
      },
      // 解决多行placeholder时，光标异常的情况
      {
        type: "drawSelection",
        extension: (0,_codemirror_view__WEBPACK_IMPORTED_MODULE_12__.drawSelection)()
      },
      {
        type: "markdown",
        extension: (0,_codemirror_lang_markdown__WEBPACK_IMPORTED_MODULE_9__.markdown)({ codeLanguages: _codemirror_language_data__WEBPACK_IMPORTED_MODULE_10__.languages })
      },
      {
        type: "linkShortener",
        extension: (x) => Jr(x),
        options: {
          maxLength: 30
        }
      },
      {
        type: "floatingToolbar",
        extension: d.length > 0 ? B : [],
        compartment: g.floatingToolbar
      }
    ],
    { editorId: o, theme: l, keyBindings: p() }
  )), [te] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => [...Z, ...P].map(yn)), G = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    var _a, _b;
    (_a = c.current) == null ? void 0 : _a.view.dispatch({
      effects: g.history.reconfigure([])
    }), (_b = c.current) == null ? void 0 : _b.view.dispatch({
      effects: g.history.reconfigure((0,_codemirror_commands__WEBPACK_IMPORTED_MODULE_8__.history)())
    });
  }, [g.history]);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const x = new _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView({
      doc: e.modelValue,
      parent: b.current,
      extensions: te
    }), M = new yo(x);
    c.current = M, setTimeout(() => {
      M.setTabSize(r), M.setDisabled(!!s), M.setReadOnly(e.readOnly), e.placeholder && M.setPlaceholder(e.placeholder), typeof e.maxLength == "number" && M.setMaxLength(e.maxLength), e.autoFocus && x.focus(), u.current = false;
    }, 0);
    const W = () => (0,_codemirror_commands__WEBPACK_IMPORTED_MODULE_8__.undo)(x), _ = () => (0,_codemirror_commands__WEBPACK_IMPORTED_MODULE_8__.redo)(x), F = (ne) => {
      k(ne);
    }, U = (ne, be) => {
      const se = x.state.doc.line(ne);
      x.dispatch(
        x.state.update({
          changes: { from: se.from, to: se.to, insert: be }
        })
      );
    }, j = () => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(o, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.G, x);
    };
    return _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.on(o, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.c,
      callback: W
    }), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.on(o, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.a,
      callback: _
    }), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.on(o, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.e,
      callback: F
    }), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.on(o, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.T,
      callback: U
    }), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.on(o, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.S,
      callback: j
    }), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.emit(o, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.G, x), () => {
      x.destroy(), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.remove(o, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.c, W), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.remove(o, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.a, _), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.remove(o, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.e, F), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.remove(o, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.T, U), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.remove(o, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.S, j), u.current = true;
    };
  }, []), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const x = async (M, W = {}) => {
      var _a, _b;
      if (M === "image" && W.transform) {
        const _ = e.transformImgUrl(W.url);
        if (_ instanceof Promise)
          _.then(async (F) => {
            var _a2;
            const { text: U, options: j } = await Te(
              M,
              c.current,
              {
                ...W,
                url: F
              }
            );
            (_a2 = c.current) == null ? void 0 : _a2.replaceSelectedText(U, j, o);
          }).catch((F) => {
            console.error(F);
          });
        else {
          const { text: F, options: U } = await Te(M, c.current, {
            ...W,
            url: _
          });
          (_a = c.current) == null ? void 0 : _a.replaceSelectedText(F, U, o);
        }
      } else {
        const { text: _, options: F } = await Te(
          M,
          c.current,
          W
        );
        (_b = c.current) == null ? void 0 : _b.replaceSelectedText(_, F, o);
      }
    };
    return _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.on(o, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R,
      callback: x
    }), () => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.remove(o, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.R, x);
    };
  }, [o, e]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    setTimeout(() => {
      var _a;
      (_a = c.current) == null ? void 0 : _a.view.dispatch({
        effects: g.theme.reconfigure(l === "light" ? Ye : tt)
      });
    }, 0);
  }, [g.theme, l]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    setTimeout(() => {
      var _a;
      (_a = c.current) == null ? void 0 : _a.view.dispatch({
        effects: [
          g.update.reconfigure(
            _codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.updateListener.of((x) => {
              x.docChanged && e.onChange(x.state.doc.toString());
            })
          ),
          g.domEvent.reconfigure(_codemirror_view__WEBPACK_IMPORTED_MODULE_12__.EditorView.domEventHandlers(I)),
          g.autocompletion.reconfigure(We(e.completions))
        ]
      });
    }, 0);
  }, [g.autocompletion, g.domEvent, g.update, I, e]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a, _b;
    ((_a = c.current) == null ? void 0 : _a.getValue()) !== e.modelValue && ((_b = c.current) == null ? void 0 : _b.setValue(e.modelValue));
  }, [e.modelValue]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a;
    u.current || ((_a = c.current) == null ? void 0 : _a.setTabSize(r));
  }, [r]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a;
    u.current || ((_a = c.current) == null ? void 0 : _a.setPlaceholder(e.placeholder));
  }, [e.placeholder]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a;
    u.current || ((_a = c.current) == null ? void 0 : _a.setDisabled(!!s));
  }, [s]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a;
    u.current || ((_a = c.current) == null ? void 0 : _a.setDisabled(e.readOnly));
  }, [e.readOnly]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a;
    u.current || typeof e.maxLength == "number" && ((_a = c.current) == null ? void 0 : _a.setMaxLength(e.maxLength));
  }, [e.maxLength]), xn(() => {
    var _a, _b;
    const x = Z.find(
      (M) => M.type === "floatingToolbar"
    );
    (x == null ? void 0 : x.compartment) && (d.length > 0 ? (_a = c.current) == null ? void 0 : _a.view.dispatch({
      effects: x.compartment.reconfigure(
        bt(x)
      )
    }) : (_b = c.current) == null ? void 0 : _b.view.dispatch({
      effects: x.compartment.reconfigure([])
    }));
  }, d), {
    inputWrapperRef: b,
    codeMirrorUt: c,
    resetHistory: G
  };
}, Nn = (e, t, r) => {
  const { setting: o } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), { inputBoxWidth: l, onInputBoxWidthChange: i } = e, s = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => /px$/.test(`${l}`) ? "50%" : l, [l]), [d, b] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({
    width: s
  }), [c, u] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({
    insetInlineStart: s
  }), g = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(s);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const h = (v) => {
      var _a, _b;
      const k = ((_a = t.current) == null ? void 0 : _a.offsetWidth) || 0, I = ((_b = t.current) == null ? void 0 : _b.getBoundingClientRect().x) || 0;
      let H = v.x - I;
      H / k < _config_mjs__WEBPACK_IMPORTED_MODULE_2__.M ? H = k * _config_mjs__WEBPACK_IMPORTED_MODULE_2__.M : H > k - k * _config_mjs__WEBPACK_IMPORTED_MODULE_2__.M && (H = k - k * _config_mjs__WEBPACK_IMPORTED_MODULE_2__.M);
      const z = `${H / k * 100}%`;
      b((B) => ({
        ...B,
        width: z
      })), u((B) => ({
        ...B,
        insetInlineStart: z
      })), g.current = z, i == null ? void 0 : i(z);
    }, p = (v) => {
      v.target === r.current && (u((k) => ({
        ...k
      })), document.addEventListener("mousemove", h));
    }, T = () => {
      u((v) => ({
        ...v
      })), document.removeEventListener("mousemove", h);
    };
    return document.addEventListener("mousedown", p), document.addEventListener("mouseup", T), () => {
      document.removeEventListener("mousedown", p), document.removeEventListener("mouseup", T), document.removeEventListener("mousemove", h);
    };
  }, [t, i, r]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    g.current = s, b((h) => ({
      ...h,
      width: s
    })), u((h) => ({
      ...h,
      insetInlineStart: s
    }));
  }, [s]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const h = o.previewOnly;
    let p = "", T = "";
    h ? (p = "0%", T = "none") : !o.htmlPreview && !o.preview ? (p = "100%", T = "none") : (p = g.current, T = "initial"), b((v) => ({
      ...v,
      width: p
    })), u((v) => ({
      ...v,
      display: T
    }));
  }, [o.htmlPreview, o.preview, o.previewOnly]), {
    inputWrapperStyle: d,
    resizeOperateStyle: c
  };
}, ot = (0,_vavt_util__WEBPACK_IMPORTED_MODULE_3__.createSmoothScroll)(), Sn = () => {
  const { editorId: e } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), t = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(true), r = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (i, s) => {
      const d = document.querySelector(
        `#${e} .${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-catalog-editor`
      );
      if (!s || !t.current || !d)
        return;
      const b = s.offsetTop - d.scrollTop;
      (b > 100 || b < 100) && ot(d, s.offsetTop - 100);
    },
    [e]
  ), o = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => t.current = false, []), l = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => t.current = true, []);
  return {
    onCatalogActive: r,
    onMouseEnter: o,
    onMouseLeave: l
  };
}, En = (0,_vavt_util__WEBPACK_IMPORTED_MODULE_3__.createSmoothScroll)(), In = { flex: 1 }, Ln = (0,react__WEBPACK_IMPORTED_MODULE_1__.forwardRef)((e, t) => {
  const { onHtmlChanged: r } = e, { editorId: o, theme: l, catalogVisible: i, setting: s } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), [d, b] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(""), c = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), g = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (G) => {
      b(G), r == null ? void 0 : r(G);
    },
    [r]
  ), { inputWrapperRef: h, codeMirrorUt: p, resetHistory: T } = kn(e), { inputWrapperStyle: v, resizeOperateStyle: k } = Nn(
    e,
    c,
    u
  );
  mo(e, d, p);
  const { onCatalogActive: I, onMouseEnter: H, onMouseLeave: z } = Sn();
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useImperativeHandle)(t, () => ({
    getSelectedText() {
      var _a;
      return (_a = p.current) == null ? void 0 : _a.getSelectedText();
    },
    focus(G) {
      var _a;
      (_a = p.current) == null ? void 0 : _a.focus(G);
    },
    resetHistory: T,
    getEditorView() {
      var _a;
      return (_a = p.current) == null ? void 0 : _a.view;
    }
  }), [p, T]);
  const B = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (G, x) => {
      var _a, _b;
      if (!s.preview && x.line !== void 0) {
        G.preventDefault();
        const M = (_a = p.current) == null ? void 0 : _a.view;
        if (M) {
          const W = M.state.doc.line(x.line + 1), _ = (_b = M.lineBlockAt(W.from)) == null ? void 0 : _b.top, F = M.scrollDOM;
          En(F, _);
        }
      }
    },
    [p, s.preview]
  ), P = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-input-wrapper`, ref: h }), [h]), Z = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    _hooks_mjs__WEBPACK_IMPORTED_MODULE_7__.a,
    {
      modelValue: e.modelValue,
      onChange: e.onChange,
      setting: s,
      onHtmlChanged: g,
      onGetCatalog: e.onGetCatalog,
      mdHeadingId: e.mdHeadingId,
      noMermaid: e.noMermaid,
      sanitize: e.sanitize,
      noKatex: e.noKatex,
      formatCopiedText: e.formatCopiedText,
      noHighlight: e.noHighlight,
      noImgZoomIn: e.noImgZoomIn,
      sanitizeMermaid: e.sanitizeMermaid,
      codeFoldable: e.codeFoldable,
      autoFoldThreshold: e.autoFoldThreshold,
      onRemount: e.onRemount,
      previewComponent: e.previewComponent,
      noEcharts: e.noEcharts
    }
  ), [
    g,
    e.autoFoldThreshold,
    e.codeFoldable,
    e.formatCopiedText,
    e.mdHeadingId,
    e.modelValue,
    e.noEcharts,
    e.noHighlight,
    e.noImgZoomIn,
    e.noKatex,
    e.noMermaid,
    e.onChange,
    e.onGetCatalog,
    e.onRemount,
    e.previewComponent,
    e.sanitize,
    e.sanitizeMermaid,
    s
  ]), te = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    _index3_mjs__WEBPACK_IMPORTED_MODULE_6__.M,
    {
      theme: l,
      className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-catalog-editor`,
      editorId: o,
      mdHeadingId: e.mdHeadingId,
      scrollElementOffsetTop: 2,
      syncWith: s.preview ? "preview" : "editor",
      onClick: B,
      catalogMaxDepth: e.catalogMaxDepth,
      onActive: I
    },
    "internal-catalog"
  ), [
    o,
    I,
    B,
    e.catalogMaxDepth,
    e.mdHeadingId,
    s.preview,
    l
  ]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-content`, children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-content-wrapper`, ref: c, children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        pe,
        {
          alwaysShowTrack: true,
          scrollTarget: `#${o} .cm-scroller`,
          style: v,
          children: P
        }
      ),
      (s.htmlPreview || s.preview) && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        "div",
        {
          className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-resize-operate`,
          style: k,
          ref: u
        }
      ),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(pe, { style: In, children: Z })
    ] }),
    i && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      pe,
      {
        className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-catalog-${e.catalogLayout}`,
        onMouseEnter: H,
        onMouseLeave: z,
        children: te
      }
    )
  ] });
}), An = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Ln), Dn = ({ modelValue: e }) => {
  const { usedLanguageText: t } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    var _a;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-footer-item`, children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("label", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-footer-label`, children: `${(_a = t.footer) == null ? void 0 : _a.markdownTotal}:` }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { children: e.length || 0 })
    ] });
  }, [t, e]);
}, Rn = (e) => {
  const t = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    e.disabled || e.onChange(!e.checked);
  }, [e]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    "div",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-checkbox`,
        e.checked && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-checkbox-checked`,
        e.disabled && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`
      ]),
      onClick: t
    }
  );
}, Mn = (e) => {
  var _a;
  const { usedLanguageText: t, disabled: r } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "div",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-footer-item`, r && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-disabled`]),
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
          "label",
          {
            className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-footer-label`,
            onClick: () => {
              r || e.onScrollAutoChange(!e.scrollAuto);
            },
            children: (_a = t.footer) == null ? void 0 : _a.scrollAuto
          }
        ),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
          Rn,
          {
            disabled: r,
            checked: e.scrollAuto,
            onChange: e.onScrollAutoChange
          }
        )
      ]
    }
  );
}, Fn = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Mn), Hn = (e) => {
  const { theme: t, language: r, disabled: o } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), l = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (d) => {
      var _a, _b, _c;
      if (_config_mjs__WEBPACK_IMPORTED_MODULE_2__.b.includes(d))
        switch (d) {
          case "markdownTotal":
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Dn, { modelValue: e.modelValue }, "markdown-total");
          case "scrollSwitch":
            return !e.noScrollAuto && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
              Fn,
              {
                scrollAuto: e.scrollAuto,
                onScrollAutoChange: e.onScrollAutoChange
              },
              "scroll-auto"
            );
        }
      else {
        const b = e.defFooters[d];
        return typeof b != "string" ? (0,react__WEBPACK_IMPORTED_MODULE_1__.cloneElement)(b, {
          theme: ((_a = b.props) == null ? void 0 : _a.theme) || t,
          language: ((_b = b.props) == null ? void 0 : _b.language) || r,
          disabled: ((_c = b.props) == null ? void 0 : _c.disabled) || o
        }) : b || "";
      }
    },
    [
      e.modelValue,
      e.noScrollAuto,
      e.scrollAuto,
      e.onScrollAutoChange,
      e.defFooters,
      t,
      r,
      o
    ]
  ), [i, s] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    const d = e.footers.indexOf("="), b = d === -1 ? e.footers : e.footers.slice(0, d), c = d === -1 ? [] : e.footers.slice(d, Number.MAX_SAFE_INTEGER);
    return [
      b.map((u) => l(u)),
      c.map((u) => l(u))
    ];
  }, [e.footers, l]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-footer`, children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-footer-left`, children: i }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-footer-right`, children: s })
  ] });
}, Pn = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Hn), On = (e) => {
  const { toolbars: t, toolbarsExclude: r } = e, { editorId: o, showToolbarName: l } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E), [i] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => `${o}-toolbar-wrapper`), s = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), { barRender: d } = ut(), b = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    const c = t.filter((p) => !r.includes(p)), u = c.indexOf("="), g = u === -1 ? c : c.slice(0, u + 1), h = u === -1 ? [] : c.slice(u, Number.MAX_SAFE_INTEGER);
    return [
      g.map((p, T) => d(p, `left-${T}`)),
      h.map((p, T) => d(p, `right-${T}`))
    ];
  }, [t, r, d]);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    let c = () => {
    };
    return s.current && (c = (0,_vavt_util__WEBPACK_IMPORTED_MODULE_3__.draggingScroll)(s.current)), () => {
      c();
    };
  }, [t]), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: t.length > 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-wrapper`, ref: s, id: i, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "div",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar`,
        l && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-stn`
      ]),
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-left`, children: b[0] }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-toolbar-right`, children: b[1] })
      ]
    }
  ) }) });
}, Vn = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(On), Bn = (0,react__WEBPACK_IMPORTED_MODULE_1__.forwardRef)((e, t) => {
  const {
    value: r = e.modelValue || _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.modelValue,
    theme: o = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.theme,
    codeTheme: l = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.codeTheme,
    className: i = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.className,
    toolbars: s = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.toolbars,
    toolbarsExclude: d = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.toolbarsExclude,
    defToolbars: b = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.defToolbars,
    tabWidth: c = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.tabWidth,
    showCodeRowNumber: u = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.showCodeRowNumber,
    previewTheme: g = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.previewTheme,
    noPrettier: h = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.noPrettier,
    tableShape: p = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.tableShape,
    noMermaid: T = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.noMermaid,
    noKatex: v = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.noKatex,
    placeholder: k = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.placeholder,
    onChange: I = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.onChange,
    onHtmlChanged: H = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.onHtmlChanged,
    onGetCatalog: z = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.onGetCatalog,
    sanitize: B = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.sanitize,
    onError: P = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.onError,
    mdHeadingId: Z = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.mdHeadingId,
    footers: te = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.footers,
    defFooters: G = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.defFooters,
    noUploadImg: x = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.noUploadImg,
    noHighlight: M = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.noHighlight,
    noImgZoomIn: W = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.noImgZoomIn,
    language: _ = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.language,
    inputBoxWidth: F = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.inputBoxWidth,
    sanitizeMermaid: U = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.sanitizeMermaid,
    transformImgUrl: j = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.transformImgUrl,
    codeFoldable: ne = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.codeFoldable,
    autoFoldThreshold: be = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.autoFoldThreshold,
    catalogLayout: se = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.catalogLayout,
    floatingToolbars: Ne = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.floatingToolbars,
    customIcon: Se = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.customIcon,
    previewComponent: ht,
    disabled: Ee,
    showToolbarName: Ie
  } = e, gt = (0,_hooks_mjs__WEBPACK_IMPORTED_MODULE_7__.u)(e), [q] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => ({
    editorId: gt,
    noKatex: v,
    noMermaid: T,
    noPrettier: h,
    noUploadImg: x,
    noHighlight: M
  })), [Le, Ae] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => ({
    scrollAuto: e.scrollAuto === void 0 ? true : e.scrollAuto
  })), De = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), Re = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(void 0), ft = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (Tt) => {
      Ae((vt) => ({
        ...vt,
        scrollAuto: Tt
      }));
    },
    [Ae]
  );
  (0,_hooks_mjs__WEBPACK_IMPORTED_MODULE_7__.b)(e, q), (0,_hooks_mjs__WEBPACK_IMPORTED_MODULE_7__.c)(q), (0,_hooks_mjs__WEBPACK_IMPORTED_MODULE_7__.d)(e, q), (0,_hooks_mjs__WEBPACK_IMPORTED_MODULE_7__.e)(q.editorId, P);
  const he = (0,_hooks_mjs__WEBPACK_IMPORTED_MODULE_7__.f)(e, q), [Me, Fe, Y, ge] = (0,_hooks_mjs__WEBPACK_IMPORTED_MODULE_7__.g)(e);
  (0,_hooks_mjs__WEBPACK_IMPORTED_MODULE_7__.h)(t, q, he, Y, ge, Re);
  const pt = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => ({
    editorId: q.editorId,
    tabWidth: c,
    theme: o,
    language: _,
    highlight: Me,
    showCodeRowNumber: u,
    usedLanguageText: Fe,
    previewTheme: g,
    customIcon: Se,
    rootRef: De,
    disabled: Ee,
    showToolbarName: Ie,
    setting: Y,
    updateSetting: ge,
    tableShape: p,
    catalogVisible: he,
    noUploadImg: x,
    noPrettier: h,
    codeTheme: l,
    defToolbars: b,
    floatingToolbars: Ne
  }), [
    he,
    l,
    Se,
    b,
    Ee,
    Ne,
    Me,
    _,
    h,
    x,
    g,
    Y,
    u,
    Ie,
    q.editorId,
    c,
    p,
    o,
    ge,
    Fe
  ]);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => () => {
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_13__.b.clear(q.editorId);
  }, [q.editorId]), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_context_mjs__WEBPACK_IMPORTED_MODULE_5__.E.Provider, { value: pt, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "div",
    {
      id: q.editorId,
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        _config_mjs__WEBPACK_IMPORTED_MODULE_2__.p,
        !!i && i,
        o === "dark" && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-dark`,
        (Y.fullscreen || Y.pageFullscreen) && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-fullscreen`
      ]),
      style: e.style,
      ref: De,
      children: [
        s.length > 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Vn, { toolbars: s, toolbarsExclude: d }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
          An,
          {
            ref: Re,
            modelValue: r,
            onChange: I,
            setting: Y,
            mdHeadingId: Z,
            onHtmlChanged: H,
            onGetCatalog: z,
            sanitize: B,
            noMermaid: q.noMermaid,
            noHighlight: q.noHighlight,
            placeholder: k,
            noKatex: q.noKatex,
            scrollAuto: Le.scrollAuto,
            formatCopiedText: e.formatCopiedText,
            autoFocus: e.autoFocus,
            readOnly: e.readOnly,
            maxLength: e.maxLength,
            autoDetectCode: e.autoDetectCode,
            onBlur: e.onBlur,
            onFocus: e.onFocus,
            onInput: e.onInput,
            completions: e.completions,
            noImgZoomIn: W,
            onDrop: e.onDrop,
            inputBoxWidth: F,
            onInputBoxWidthChange: e.onInputBoxWidthChange,
            sanitizeMermaid: U,
            transformImgUrl: j,
            codeFoldable: ne,
            autoFoldThreshold: be,
            onRemount: e.onRemount,
            catalogLayout: se,
            catalogMaxDepth: e.catalogMaxDepth,
            noEcharts: e.noEcharts,
            previewComponent: ht
          }
        ),
        te.length > 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
          Pn,
          {
            modelValue: r,
            footers: te,
            defFooters: G,
            noScrollAuto: !Y.preview && !Y.htmlPreview || Y.previewOnly,
            scrollAuto: Le.scrollAuto,
            onScrollAutoChange: ft
          }
        )
      ]
    }
  ) });
}), ca = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Bn);



/***/ },

/***/ "../../node_modules/md-editor-rt/lib/es/chunks/config.mjs"
/*!****************************************************************!*\
  !*** ../../node_modules/md-editor-rt/lib/es/chunks/config.mjs ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   M: () => (/* binding */ w),
/* harmony export */   a: () => (/* binding */ h),
/* harmony export */   b: () => (/* binding */ m),
/* harmony export */   c: () => (/* binding */ v),
/* harmony export */   d: () => (/* binding */ f),
/* harmony export */   f: () => (/* binding */ c),
/* harmony export */   g: () => (/* binding */ u),
/* harmony export */   p: () => (/* binding */ y),
/* harmony export */   s: () => (/* binding */ b)
/* harmony export */ });
/* unused harmony export e */
/* harmony import */ var _vavt_util__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @vavt/util */ "../../node_modules/@vavt/util/lib/es/index.mjs");

const y = "md-editor", e = "https://unpkg.com", a = `${e}/@highlightjs/cdn-assets@11.11.1/highlight.min.js`, i = {
  main: `${e}/prettier@3.8.1/standalone.js`,
  markdown: `${e}/prettier@3.8.1/plugins/markdown.js`
}, o = {
  css: `${e}/cropperjs@1.6.2/dist/cropper.min.css`,
  js: `${e}/cropperjs@1.6.2/dist/cropper.min.js`
}, n = `${e}/screenfull@5.2.0/dist/screenfull.js`, l = `${e}/mermaid@11.12.3/dist/mermaid.min.js`, d = {
  js: `${e}/katex@0.16.33/dist/katex.min.js`,
  css: `${e}/katex@0.16.33/dist/katex.min.css`
}, c = {
  a11y: {
    light: `${e}/@highlightjs/cdn-assets@11.11.1/styles/a11y-light.min.css`,
    dark: `${e}/@highlightjs/cdn-assets@11.11.1/styles/a11y-dark.min.css`
  },
  atom: {
    light: `${e}/@highlightjs/cdn-assets@11.11.1/styles/atom-one-light.min.css`,
    dark: `${e}/@highlightjs/cdn-assets@11.11.1/styles/atom-one-dark.min.css`
  },
  github: {
    light: `${e}/@highlightjs/cdn-assets@11.11.1/styles/github.min.css`,
    dark: `${e}/@highlightjs/cdn-assets@11.11.1/styles/github-dark.min.css`
  },
  gradient: {
    light: `${e}/@highlightjs/cdn-assets@11.11.1/styles/gradient-light.min.css`,
    dark: `${e}/@highlightjs/cdn-assets@11.11.1/styles/gradient-dark.min.css`
  },
  kimbie: {
    light: `${e}/@highlightjs/cdn-assets@11.11.1/styles/kimbie-light.min.css`,
    dark: `${e}/@highlightjs/cdn-assets@11.11.1/styles/kimbie-dark.min.css`
  },
  paraiso: {
    light: `${e}/@highlightjs/cdn-assets@11.11.1/styles/paraiso-light.min.css`,
    dark: `${e}/@highlightjs/cdn-assets@11.11.1/styles/paraiso-dark.min.css`
  },
  qtcreator: {
    light: `${e}/@highlightjs/cdn-assets@11.11.1/styles/qtcreator-light.min.css`,
    dark: `${e}/@highlightjs/cdn-assets@11.11.1/styles/qtcreator-dark.min.css`
  },
  stackoverflow: {
    light: `${e}/@highlightjs/cdn-assets@11.11.1/styles/stackoverflow-light.min.css`,
    dark: `${e}/@highlightjs/cdn-assets@11.11.1/styles/stackoverflow-dark.min.css`
  }
}, g = `${e}/echarts@6.0.0/dist/echarts.min.js`, k = {
  highlight: {
    js: {
      integrity: "sha384-RH2xi4eIQ/gjtbs9fUXM68sLSi99C7ZWBRX1vDrVv6GQXRibxXLbwO2NGZB74MbU",
      crossOrigin: "anonymous"
    },
    css: {
      a11y: {
        light: {
          integrity: "sha384-qdZDAN3jffvh670RHw1wxLekabidEFaNRninYgIzBvMbL6WlHdXeHS/Bt+vx33lN",
          crossOrigin: "anonymous"
        },
        dark: {
          integrity: "sha384-2QAAjX8pqaM5azX68KWI2wExF6Q13kY4kEiQFY4b/1zPe6rpgmTByNpDEllH3sb+",
          crossOrigin: "anonymous"
        }
      },
      atom: {
        light: {
          integrity: "sha384-w6Ujm1VWa9HYFqGc89oAPn/DWDi2gUamjNrq9DRvEYm2X3ClItg9Y9xs1ViVo5b5",
          crossOrigin: "anonymous"
        },
        dark: {
          integrity: "sha384-oaMLBGEzBOJx3UHwac0cVndtX5fxGQIfnAeFZ35RTgqPcYlbprH9o9PUV/F8Le07",
          crossOrigin: "anonymous"
        }
      },
      github: {
        light: {
          integrity: "sha384-eFTL69TLRZTkNfYZOLM+G04821K1qZao/4QLJbet1pP4tcF+fdXq/9CdqAbWRl/L",
          crossOrigin: "anonymous"
        },
        dark: {
          integrity: "sha384-wH75j6z1lH97ZOpMOInqhgKzFkAInZPPSPlZpYKYTOqsaizPvhQZmAtLcPKXpLyH",
          crossOrigin: "anonymous"
        }
      },
      gradient: {
        light: {
          integrity: "sha384-yErHBR8aEZPxRl3XmR8dGSRAclMlnSRRw8sXQLcmPWzWUvb56BzQmBw3EWHl7QGI",
          crossOrigin: "anonymous"
        },
        dark: {
          integrity: "sha384-lUCvtSOdvDbp5hLWKgwz/taFu1HxlpqES2OVP5UG2JMTfnU481gXcBhGF9lAGoSr",
          crossOrigin: "anonymous"
        }
      },
      kimbie: {
        light: {
          integrity: "sha384-tloeSLUPczAvoZ48TUz+OxRie0oYLCRwlkadUXovGzzJEIbNQB2TkfUuvJ6SW5Mi",
          crossOrigin: "anonymous"
        },
        dark: {
          integrity: "sha384-o5F1vUaMNOmou1sQrsWiFo4/QUGSV0svqNZW+EesmKxWC8MpFJcveBhAyfvTHbGb",
          crossOrigin: "anonymous"
        }
      },
      paraiso: {
        light: {
          integrity: "sha384-5j6QHU2Hwg1ehtlIQNDebhETDB8bga3/88hzBFsMRaGmgQHCftqIN7GZNDNw0vTL",
          crossOrigin: "anonymous"
        },
        dark: {
          integrity: "sha384-I5vnnMQu0LWDQnHpT61xyoMwKarAB8jpZkB2ioFOlmzUFnIFaV4QbUwlBBOMKhTH",
          crossOrigin: "anonymous"
        }
      },
      qtcreator: {
        light: {
          integrity: "sha384-iEBgHrwi8Hv4dSZBz+MOGvS05rF7I7fGKM2fASQyE9jn2Istg9Qd5dSoK18WyRTB",
          crossOrigin: "anonymous"
        },
        dark: {
          integrity: "sha384-D6LXJGWNR4QV7gnpuP3ccbvOYoR02td3cU0y7lESABPg/tzCSC4m+y+M2TtrmpHc",
          crossOrigin: "anonymous"
        }
      },
      stackoverflow: {
        light: {
          integrity: "sha384-FMwt7cTGo4aLxZnno5k0xTj0W4gmi48Kwept+y/oQmE6cFk36Kr+QJZOKNOQwORe",
          crossOrigin: "anonymous"
        },
        dark: {
          integrity: "sha384-iL+x+BroCyHm/p2c6sMA9umXhdCWp2cKe4QUjPeMzHgwXAk+ZxHyIGP3NZTZensU",
          crossOrigin: "anonymous"
        }
      }
    }
  },
  prettier: {
    standaloneJs: {
      integrity: "sha384-Q+dEbdxfNurK4ryC0T77wU8G3EYhxdAierqqKOppGHnJ4e/85wVnMXDNWbaYYghP",
      crossOrigin: "anonymous"
    },
    parserMarkdownJs: {
      integrity: "sha384-UGdkYlLyq47VQhe9mHyNzuPhBTL9GA9YO5Vb0sXf2fnMYGuSMGAbZ8upsQj1+u4O",
      crossOrigin: "anonymous"
    }
  },
  cropper: {
    js: {
      integrity: "sha384-jrOgQzBlDeUNdmQn3rUt/PZD+pdcRBdWd/HWRqRo+n2OR2QtGyjSaJC0GiCeH+ir",
      crossOrigin: "anonymous"
    },
    css: {
      integrity: "sha384-6LFfkTKLRlzFtgx8xsWyBdKGpcMMQTkv+dB7rAbugeJAu1Ym2q1Aji1cjHBG12Xh",
      crossOrigin: "anonymous"
    }
  },
  screenfull: {
    js: {
      integrity: "sha384-Qfbv8upMDu/ikv42M0Jnym2hahbDQ77Nm8PGU0G+iA6UIwt1+scE6P1qKXA0anWU",
      crossOrigin: "anonymous"
    }
  },
  mermaid: {
    js: {
      integrity: "sha384-jFhLSLFn4m565eRAS0CDMWubMqOtfZWWbE8kqgGdU+VHbJ3B2G/4X8u+0BM8MtdU",
      crossOrigin: "anonymous"
    }
  },
  katex: {
    js: {
      integrity: "sha384-YPHNAPyrxGS8BNnA7Q4ommqra8WQPEjooVSLzFgwgs8OXJBvadbyvx4QpfiFurGr",
      crossOrigin: "anonymous"
    },
    css: {
      integrity: "sha384-fgYS3VC1089n2J3rVcEbXDHlnDLQ9B2Y1hvpQ720q1NvxCduQqT4JoGc4u2QCnzE",
      crossOrigin: "anonymous"
    }
  },
  echarts: {
    js: {
      integrity: "sha384-F07Cpw5v8spSU0H113F33m2NQQ/o6GqPTnTjf45ssG4Q6q58ZwhxBiQtIaqvnSpR",
      crossOrigin: "anonymous"
    }
  }
}, h = [
  "bold",
  "underline",
  "italic",
  "strikeThrough",
  "-",
  "title",
  "sub",
  "sup",
  "quote",
  "unorderedList",
  "orderedList",
  "task",
  "-",
  "codeRow",
  "code",
  "link",
  "image",
  "table",
  "mermaid",
  "katex",
  "-",
  "revoke",
  "next",
  "save",
  "=",
  "prettier",
  "pageFullscreen",
  "fullscreen",
  "preview",
  "previewOnly",
  "htmlPreview",
  "catalog",
  "github"
], m = ["markdownTotal", "=", "scrollSwitch"], b = {
  "zh-CN": {
    toolbarTips: {
      bold: "\u52A0\u7C97",
      underline: "\u4E0B\u5212\u7EBF",
      italic: "\u659C\u4F53",
      strikeThrough: "\u5220\u9664\u7EBF",
      title: "\u6807\u9898",
      sub: "\u4E0B\u6807",
      sup: "\u4E0A\u6807",
      quote: "\u5F15\u7528",
      unorderedList: "\u65E0\u5E8F\u5217\u8868",
      orderedList: "\u6709\u5E8F\u5217\u8868",
      task: "\u4EFB\u52A1\u5217\u8868",
      codeRow: "\u884C\u5185\u4EE3\u7801",
      code: "\u5757\u7EA7\u4EE3\u7801",
      link: "\u94FE\u63A5",
      image: "\u56FE\u7247",
      table: "\u8868\u683C",
      mermaid: "mermaid\u56FE",
      katex: "katex\u516C\u5F0F",
      revoke: "\u540E\u9000",
      next: "\u524D\u8FDB",
      save: "\u4FDD\u5B58",
      prettier: "\u7F8E\u5316",
      pageFullscreen: "\u6D4F\u89C8\u5668\u5168\u5C4F",
      fullscreen: "\u5C4F\u5E55\u5168\u5C4F",
      preview: "\u9884\u89C8",
      previewOnly: "\u4EC5\u9884\u89C8",
      htmlPreview: "html\u4EE3\u7801\u9884\u89C8",
      catalog: "\u76EE\u5F55",
      github: "\u6E90\u7801\u5730\u5740"
    },
    titleItem: {
      h1: "\u4E00\u7EA7\u6807\u9898",
      h2: "\u4E8C\u7EA7\u6807\u9898",
      h3: "\u4E09\u7EA7\u6807\u9898",
      h4: "\u56DB\u7EA7\u6807\u9898",
      h5: "\u4E94\u7EA7\u6807\u9898",
      h6: "\u516D\u7EA7\u6807\u9898"
    },
    imgTitleItem: {
      link: "\u6DFB\u52A0\u94FE\u63A5",
      upload: "\u4E0A\u4F20\u56FE\u7247",
      clip2upload: "\u88C1\u526A\u4E0A\u4F20"
    },
    linkModalTips: {
      linkTitle: "\u6DFB\u52A0\u94FE\u63A5",
      imageTitle: "\u6DFB\u52A0\u56FE\u7247",
      descLabel: "\u94FE\u63A5\u63CF\u8FF0\uFF1A",
      descLabelPlaceHolder: "\u8BF7\u8F93\u5165\u63CF\u8FF0...",
      urlLabel: "\u94FE\u63A5\u5730\u5740\uFF1A",
      urlLabelPlaceHolder: "\u8BF7\u8F93\u5165\u94FE\u63A5...",
      buttonOK: "\u786E\u5B9A"
    },
    clipModalTips: {
      title: "\u88C1\u526A\u56FE\u7247\u4E0A\u4F20",
      buttonUpload: "\u4E0A\u4F20"
    },
    copyCode: {
      text: "\u590D\u5236\u4EE3\u7801",
      successTips: "\u5DF2\u590D\u5236\uFF01",
      failTips: "\u590D\u5236\u5931\u8D25\uFF01"
    },
    mermaid: {
      flow: "\u6D41\u7A0B\u56FE",
      sequence: "\u65F6\u5E8F\u56FE",
      gantt: "\u7518\u7279\u56FE",
      class: "\u7C7B\u56FE",
      state: "\u72B6\u6001\u56FE",
      pie: "\u997C\u56FE",
      relationship: "\u5173\u7CFB\u56FE",
      journey: "\u65C5\u7A0B\u56FE"
    },
    katex: {
      inline: "\u884C\u5185\u516C\u5F0F",
      block: "\u5757\u7EA7\u516C\u5F0F"
    },
    footer: {
      markdownTotal: "\u5B57\u6570",
      scrollAuto: "\u540C\u6B65\u6EDA\u52A8"
    }
  },
  "en-US": {
    toolbarTips: {
      bold: "bold",
      underline: "underline",
      italic: "italic",
      strikeThrough: "strikeThrough",
      title: "title",
      sub: "subscript",
      sup: "superscript",
      quote: "quote",
      unorderedList: "unordered list",
      orderedList: "ordered list",
      task: "task list",
      codeRow: "inline code",
      code: "block-level code",
      link: "link",
      image: "image",
      table: "table",
      mermaid: "mermaid",
      katex: "formula",
      revoke: "revoke",
      next: "undo revoke",
      save: "save",
      prettier: "prettier",
      pageFullscreen: "fullscreen in page",
      fullscreen: "fullscreen",
      preview: "preview",
      previewOnly: "preview only",
      htmlPreview: "html preview",
      catalog: "catalog",
      github: "source code"
    },
    titleItem: {
      h1: "Lv1 Heading",
      h2: "Lv2 Heading",
      h3: "Lv3 Heading",
      h4: "Lv4 Heading",
      h5: "Lv5 Heading",
      h6: "Lv6 Heading"
    },
    imgTitleItem: {
      link: "Add Image Link",
      upload: "Upload Images",
      clip2upload: "Crop And Upload"
    },
    linkModalTips: {
      linkTitle: "Add Link",
      imageTitle: "Add Image",
      descLabel: "Desc:",
      descLabelPlaceHolder: "Enter a description...",
      urlLabel: "Link:",
      urlLabelPlaceHolder: "Enter a link...",
      buttonOK: "OK"
    },
    clipModalTips: {
      title: "Crop Image",
      buttonUpload: "Upload"
    },
    copyCode: {
      text: "Copy",
      successTips: "Copied!",
      failTips: "Copy failed!"
    },
    mermaid: {
      flow: "flow",
      sequence: "sequence",
      gantt: "gantt",
      class: "class",
      state: "state",
      pie: "pie",
      relationship: "relationship",
      journey: "journey"
    },
    katex: {
      inline: "inline",
      block: "block"
    },
    footer: {
      markdownTotal: "Character Count",
      scrollAuto: "Scroll Auto"
    }
  }
}, f = {
  modelValue: "",
  theme: "light",
  className: "",
  onChange: () => {
  },
  pageFullscreen: false,
  preview: true,
  htmlPreview: false,
  language: "zh-CN",
  toolbars: h,
  toolbarsExclude: [],
  noPrettier: false,
  onHtmlChanged: () => {
  },
  onGetCatalog: () => {
  },
  tabWidth: 2,
  showCodeRowNumber: true,
  previewTheme: "default",
  mdHeadingId: (({ text: s }) => s),
  tableShape: [6, 4],
  noMermaid: false,
  sanitize: (s) => s,
  placeholder: "",
  noKatex: false,
  defToolbars: [],
  onError: () => {
  },
  codeTheme: "atom",
  footers: m,
  defFooters: [],
  noUploadImg: false,
  codeStyleReverse: true,
  codeStyleReverseList: ["default", "mk-cute"],
  noHighlight: false,
  noImgZoomIn: false,
  inputBoxWidth: "50%",
  sanitizeMermaid: (s) => Promise.resolve(s),
  transformImgUrl: (s) => s,
  codeFoldable: true,
  autoFoldThreshold: 30,
  catalogLayout: "fixed",
  floatingToolbars: [],
  customIcon: {}
}, u = {
  editorExtensions: {
    highlight: {
      js: a,
      css: c
    },
    prettier: {
      standaloneJs: i.main,
      parserMarkdownJs: i.markdown
    },
    cropper: {
      ...o
    },
    screenfull: {
      js: n
    },
    mermaid: {
      js: l,
      enableZoom: true
    },
    katex: {
      ...d
    },
    echarts: {
      js: g
    }
  },
  editorExtensionsAttrs: {},
  editorConfig: {
    languageUserDefined: {},
    mermaidTemplate: {},
    renderDelay: 500,
    zIndex: 2e4
  },
  codeMirrorExtensions: (s) => s,
  markdownItConfig: () => {
  },
  markdownItPlugins: (s) => s,
  mermaidConfig: (s) => s,
  katexConfig: (s) => s,
  echartsConfig: (s) => s
}, v = (s) => (0,_vavt_util__WEBPACK_IMPORTED_MODULE_0__.deepMerge)(u, s, {
  excludeKeys(t) {
    return /[iI]{1}nstance/.test(t);
  }
}), w = 0.1;



/***/ },

/***/ "../../node_modules/md-editor-rt/lib/es/chunks/context.mjs"
/*!*****************************************************************!*\
  !*** ../../node_modules/md-editor-rt/lib/es/chunks/context.mjs ***!
  \*****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   E: () => (/* binding */ s),
/* harmony export */   d: () => (/* binding */ a)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _config_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./config.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/config.mjs");


const a = {
  editorId: "",
  tabWidth: 2,
  theme: "light",
  language: "zh-CN",
  highlight: {
    css: "",
    js: ""
  },
  showCodeRowNumber: false,
  usedLanguageText: _config_mjs__WEBPACK_IMPORTED_MODULE_1__.s["zh-CN"],
  previewTheme: "default",
  customIcon: {},
  rootRef: null,
  disabled: void 0,
  showToolbarName: false,
  setting: {
    preview: false,
    htmlPreview: false,
    previewOnly: false,
    pageFullscreen: false,
    fullscreen: false
  },
  updateSetting: () => {
  },
  tableShape: [6, 4],
  catalogVisible: false,
  noUploadImg: false,
  noPrettier: false,
  codeTheme: "default",
  defToolbars: [],
  floatingToolbars: []
}, s = (0,react__WEBPACK_IMPORTED_MODULE_0__.createContext)(a);



/***/ },

/***/ "../../node_modules/md-editor-rt/lib/es/chunks/dom.mjs"
/*!*************************************************************!*\
  !*** ../../node_modules/md-editor-rt/lib/es/chunks/dom.mjs ***!
  \*************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   S: () => (/* binding */ p),
/* harmony export */   a: () => (/* binding */ A),
/* harmony export */   c: () => (/* binding */ V),
/* harmony export */   k: () => (/* binding */ z),
/* harmony export */   u: () => (/* binding */ b),
/* harmony export */   z: () => (/* binding */ R)
/* harmony export */ });
/* harmony import */ var _vavt_copy2clipboard__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @vavt/copy2clipboard */ "../../node_modules/@vavt/copy2clipboard/index.mjs");
/* harmony import */ var _config_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./config.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/config.mjs");


const j = {
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy ${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  "collapse-tips": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-chevron-left ${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-icon"><circle cx="12" cy="12" r="10"/><path d="m14 16-4-4 4-4"/></svg>`,
  pin: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pin ${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-icon"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>`,
  "pin-off": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pin-off ${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-icon"><path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check ${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-icon"><path d="M20 6 9 17l-5-5"/></svg>`
}, p = (d, s) => typeof s[d] == "string" ? s[d] : j[d], z = (d, s) => {
  const e = (c) => {
    const t = d.parentElement || document.body, n = t.offsetWidth, r = t.offsetHeight, { clientWidth: l, clientHeight: u } = document.documentElement, a = c.offsetX, w = c.offsetY, g = (y) => {
      let h = y.x + document.body.scrollLeft - document.body.clientLeft - a, m = y.y + document.body.scrollTop - document.body.clientTop - w;
      h = h < 1 ? 1 : h < l - n - 1 ? h : l - n - 1, m = m < 1 ? 1 : m < u - r - 1 ? m : u - r - 1, s ? s(h, m) : (t.style.left = h + "px", t.style.top = m + "px");
    };
    document.addEventListener("mousemove", g);
    const v = () => {
      document.removeEventListener("mousemove", g), document.removeEventListener("mouseup", v);
    };
    document.addEventListener("mouseup", v);
  };
  return d.addEventListener("mousedown", e), () => {
    d.removeEventListener("mousedown", e);
  };
}, A = (d, s, e = "") => {
  var _a;
  const c = document.getElementById(s.id);
  if (c)
    e !== "" && (Reflect.get(window, e) ? (_a = s.onload) == null ? void 0 : _a.call(c, new Event("load")) : s.onload && c.addEventListener("load", s.onload));
  else {
    const t = { ...s };
    t.onload = null;
    const n = D(d, t);
    s.onload && n.addEventListener("load", s.onload), document.head.appendChild(n);
  }
}, b = (d, s) => {
  var _a;
  (_a = document.getElementById(s.id)) == null ? void 0 : _a.remove(), A(d, s);
}, D = (d, s) => {
  const e = document.createElement(d);
  return Object.keys(s).forEach((c) => {
    s[c] !== void 0 && (e[c] = s[c]);
  }), e;
}, V = (d, s) => {
  const e = /* @__PURE__ */ new Map();
  return d == null ? void 0 : d.forEach((c) => {
    let t = c.querySelector(`.${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-action`);
    t ? t.querySelector(`.${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-copy`) || t.insertAdjacentHTML(
      "beforeend",
      `<span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-copy">${p("copy", s.customIcon)}</span>`
    ) : (c.insertAdjacentHTML(
      "beforeend",
      `<div class="${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-action"><span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-copy">${p("copy", s.customIcon)}</span></div>`
    ), t = c.querySelector(`.${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-action`));
    const n = t.querySelector(`.${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-copy`);
    let r = -1;
    const l = () => {
      clearTimeout(r), (0,_vavt_copy2clipboard__WEBPACK_IMPORTED_MODULE_0__["default"])(c.dataset.content || "").then(() => {
        n.innerHTML = p("check", s.customIcon);
      }).catch(() => {
        n.innerHTML = p("copy", s.customIcon);
      }).finally(() => {
        r = window.setTimeout(() => {
          n.innerHTML = p("copy", s.customIcon);
        }, 1500);
      });
    };
    n.addEventListener("click", l), e.set(c, {
      removeClick: () => {
        n.removeEventListener("click", l);
      }
    });
  }), () => {
    e.forEach(({ removeClick: c }) => {
      c == null ? void 0 : c();
    }), e.clear();
  };
}, R = /* @__PURE__ */ (() => {
  const d = (e) => {
    if (!e)
      return () => {
      };
    const c = e.firstChild;
    let t = 1, n = 0, r = 0, l = false, u, a, w, g = 1;
    const v = () => {
      c.style.transform = `translate(${n}px, ${r}px) scale(${t})`;
    }, y = (o) => {
      o.touches.length === 1 ? (l = true, u = o.touches[0].clientX - n, a = o.touches[0].clientY - r) : o.touches.length === 2 && (w = Math.hypot(
        o.touches[0].clientX - o.touches[1].clientX,
        o.touches[0].clientY - o.touches[1].clientY
      ), g = t);
    }, h = (o) => {
      if (o.preventDefault(), l && o.touches.length === 1)
        n = o.touches[0].clientX - u, r = o.touches[0].clientY - a, v();
      else if (o.touches.length === 2) {
        const E = Math.hypot(
          o.touches[0].clientX - o.touches[1].clientX,
          o.touches[0].clientY - o.touches[1].clientY
        ) / w, f = t;
        t = g * (1 + (E - 1));
        const M = (o.touches[0].clientX + o.touches[1].clientX) / 2, k = (o.touches[0].clientY + o.touches[1].clientY) / 2, H = c.getBoundingClientRect(), X = (M - H.left) / f, S = (k - H.top) / f;
        n -= X * (t - f), r -= S * (t - f), v();
      }
    }, m = () => {
      l = false;
    }, $ = (o) => {
      o.preventDefault();
      const L = 0.02, E = t;
      o.deltaY < 0 ? t += L : t = Math.max(0.1, t - L);
      const f = c.getBoundingClientRect(), M = o.clientX - f.left, k = o.clientY - f.top;
      n -= M / E * (t - E), r -= k / E * (t - E), v();
    }, x = (o) => {
      l = true, u = o.clientX - n, a = o.clientY - r;
    }, C = (o) => {
      l && (n = o.clientX - u, r = o.clientY - a, v());
    }, T = () => {
      l = false;
    }, Y = () => {
      l = false;
    };
    return e.addEventListener("touchstart", y, { passive: false }), e.addEventListener("touchmove", h, { passive: false }), e.addEventListener("touchend", m), e.addEventListener("wheel", $, { passive: false }), e.addEventListener("mousedown", x), e.addEventListener("mousemove", C), e.addEventListener("mouseup", T), e.addEventListener("mouseleave", Y), () => {
      e.removeEventListener("touchstart", y), e.removeEventListener("touchmove", h), e.removeEventListener("touchend", m), e.removeEventListener("wheel", $), e.removeEventListener("mousedown", x), e.removeEventListener("mousemove", C), e.removeEventListener("mouseup", T), e.removeEventListener("mouseleave", Y);
    };
  };
  return (e, c) => {
    const t = /* @__PURE__ */ new Map();
    return e == null ? void 0 : e.forEach((n) => {
      let r = n.querySelector(`.${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-action`);
      r ? r.querySelector(`.${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-zoom`) || r.insertAdjacentHTML(
        "beforeend",
        `<span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-zoom">${p("pin-off", c.customIcon)}</span>`
      ) : (n.insertAdjacentHTML(
        "beforeend",
        `<div class="${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-action"><span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-zoom">${p("pin-off", c.customIcon)}</span></div>`
      ), r = n.querySelector(`.${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-action`));
      const l = r.querySelector(`.${_config_mjs__WEBPACK_IMPORTED_MODULE_1__.p}-mermaid-zoom`), u = () => {
        const a = t.get(n);
        if (a == null ? void 0 : a.removeEvent)
          a.removeEvent(), n.removeAttribute("data-grab"), t.set(n, { removeClick: a.removeClick }), l.innerHTML = p("pin-off", c.customIcon);
        else {
          const w = d(n);
          n.setAttribute("data-grab", ""), t.set(n, { removeEvent: w, removeClick: a == null ? void 0 : a.removeClick }), l.innerHTML = p("pin", c.customIcon);
        }
      };
      l.addEventListener("click", u), t.set(n, {
        removeClick: () => l.removeEventListener("click", u)
      });
    }), () => {
      t.forEach(({ removeEvent: n, removeClick: r }) => {
        n == null ? void 0 : n(), r == null ? void 0 : r();
      }), t.clear();
    };
  };
})();



/***/ },

/***/ "../../node_modules/md-editor-rt/lib/es/chunks/event-bus.mjs"
/*!*******************************************************************!*\
  !*** ../../node_modules/md-editor-rt/lib/es/chunks/event-bus.mjs ***!
  \*******************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   B: () => (/* binding */ L),
/* harmony export */   C: () => (/* binding */ C),
/* harmony export */   E: () => (/* binding */ N),
/* harmony export */   F: () => (/* binding */ r),
/* harmony export */   G: () => (/* binding */ f),
/* harmony export */   H: () => (/* binding */ p),
/* harmony export */   O: () => (/* binding */ i),
/* harmony export */   P: () => (/* binding */ H),
/* harmony export */   R: () => (/* binding */ G),
/* harmony export */   S: () => (/* binding */ u),
/* harmony export */   T: () => (/* binding */ O),
/* harmony export */   U: () => (/* binding */ I),
/* harmony export */   a: () => (/* binding */ d),
/* harmony export */   b: () => (/* binding */ F),
/* harmony export */   c: () => (/* binding */ T),
/* harmony export */   d: () => (/* binding */ h),
/* harmony export */   e: () => (/* binding */ V),
/* harmony export */   f: () => (/* binding */ D),
/* harmony export */   g: () => (/* binding */ S),
/* harmony export */   h: () => (/* binding */ _),
/* harmony export */   i: () => (/* binding */ A),
/* harmony export */   j: () => (/* binding */ R),
/* harmony export */   k: () => (/* binding */ g)
/* harmony export */ });
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const i = "onSave", C = "changeCatalogVisible", h = "changeFullscreen", _ = "pageFullscreenChanged", r = "fullscreenChanged", A = "previewChanged", R = "previewOnlyChanged", p = "htmlPreviewChanged", g = "catalogVisibleChanged", L = "buildFinished", N = "errorCatcher", G = "replace", I = "uploadImage", T = "ctrlZ", d = "ctrlShiftZ", S = "catalogChanged", H = "pushCatalog", D = "rerender", V = "eventListener", O = "taskStateChanged", u = "sendEditorView", f = "getEditorView";
class c {
  constructor() {
    // 事件池
    __publicField(this, "pools", {});
  }
  // 移除事件监听
  remove(s, o, a) {
    const t = this.pools[s] && this.pools[s][o];
    t && (this.pools[s][o] = t.filter((e) => e !== a));
  }
  // 清空全部事件，由于单一实例，多次注册会被共享内容
  clear(s) {
    this.pools[s] = {};
  }
  // 注册事件监听
  on(s, o) {
    return this.pools[s] || (this.pools[s] = {}), this.pools[s][o.name] || (this.pools[s][o.name] = []), this.pools[s][o.name].push(o.callback), this.pools[s][o.name].includes(o.callback);
  }
  // 触发事件
  emit(s, o, ...a) {
    this.pools[s] || (this.pools[s] = {});
    const t = this.pools[s][o];
    t && t.forEach((e) => {
      try {
        e(...a);
      } catch (E) {
        console.error(`${o} monitor event exception\uFF01`, E);
      }
    });
  }
}
const F = new c();



/***/ },

/***/ "../../node_modules/md-editor-rt/lib/es/chunks/hooks.mjs"
/*!***************************************************************!*\
  !*** ../../node_modules/md-editor-rt/lib/es/chunks/hooks.mjs ***!
  \***************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   C: () => (/* binding */ M),
/* harmony export */   a: () => (/* binding */ nn),
/* harmony export */   b: () => (/* binding */ rn),
/* harmony export */   c: () => (/* binding */ sn),
/* harmony export */   d: () => (/* binding */ cn),
/* harmony export */   e: () => (/* binding */ on),
/* harmony export */   f: () => (/* binding */ an),
/* harmony export */   g: () => (/* binding */ ln),
/* harmony export */   h: () => (/* binding */ dn),
/* harmony export */   u: () => (/* binding */ un)
/* harmony export */ });
/* unused harmony export i */
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _config_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./config.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/config.mjs");
/* harmony import */ var _context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./context.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/context.mjs");
/* harmony import */ var _index2_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./index2.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/index2.mjs");
/* harmony import */ var _vavt_copy2clipboard__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @vavt/copy2clipboard */ "../../node_modules/@vavt/copy2clipboard/index.mjs");
/* harmony import */ var _vavt_util__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @vavt/util */ "../../node_modules/@vavt/util/lib/es/index.mjs");
/* harmony import */ var markdown_it__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! markdown-it */ "../../node_modules/markdown-it/index.mjs");
/* harmony import */ var markdown_it_image_figures__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! markdown-it-image-figures */ "../../node_modules/markdown-it-image-figures/dist/markdown-it-images-figures.mjs");
/* harmony import */ var markdown_it_sub__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! markdown-it-sub */ "../../node_modules/markdown-it-sub/index.mjs");
/* harmony import */ var markdown_it_sup__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! markdown-it-sup */ "../../node_modules/markdown-it-sup/index.mjs");
/* harmony import */ var _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./event-bus.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/event-bus.mjs");
/* harmony import */ var _dom_mjs__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./dom.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/dom.mjs");
/* harmony import */ var medium_zoom__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! medium-zoom */ "../../node_modules/medium-zoom/dist/medium-zoom.esm.js");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);














const M = {
  hljs: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-hljs`,
  hlcss: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-hlCss`,
  prettier: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-prettier`,
  prettierMD: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-prettierMD`,
  cropperjs: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-cropper`,
  croppercss: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-cropperCss`,
  screenfull: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-screenfull`,
  mermaidM: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-mermaid-m`,
  mermaid: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-mermaid`,
  katexjs: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-katex`,
  katexcss: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-katexCss`,
  echarts: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-echarts`
}, ot = (t, e, r) => {
  const { editorId: n, usedLanguageText: s, customIcon: d, rootRef: c, setting: l } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_3__.E), { formatCopiedText: o = (u) => u } = t;
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a;
    l.preview && ((_a = c.current) == null ? void 0 : _a.querySelectorAll(`#${n} .${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-preview .${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code`).forEach((u) => {
      let i = -1;
      const a = u.querySelector(
        `.${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-copy-button:not([data-processed])`
      );
      a && (a.onclick = (m) => {
        m.preventDefault(), clearTimeout(i);
        const p = (u.querySelector("input:checked + pre code") || u.querySelector("pre code")).textContent || "", { text: g, successTips: h, failTips: x } = s.copyCode;
        let $ = h;
        (0,_vavt_copy2clipboard__WEBPACK_IMPORTED_MODULE_5__["default"])(o(p)).catch(() => {
          $ = x;
        }).finally(() => {
          a.dataset.isIcon ? a.dataset.tips = $ : a.innerHTML = $, i = window.setTimeout(() => {
            a.dataset.isIcon ? a.dataset.tips = g : a.innerHTML = g;
          }, 1500);
        });
      }, a.setAttribute("data-processed", "true"));
    }));
  }, [
    d,
    n,
    o,
    e,
    r,
    l.preview,
    c,
    s.copyCode
  ]);
}, ct = (t) => {
  var _a;
  const { editorId: e, theme: r, rootRef: n } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_3__.E), s = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)((_a = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensions.echarts) == null ? void 0 : _a.instance), [d, c] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(0), l = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)([]), o = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)([]), u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)([]), i = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    !t.noEcharts && s.current && c((v) => v + 1);
  }, [t.noEcharts]);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    i();
  }, [r, i]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a2;
    if (t.noEcharts || s.current) return;
    const { editorExtensions: v, editorExtensionsAttrs: p } = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g, g = v.echarts.js;
    (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.a)(
      "script",
      {
        ...(_a2 = p.echarts) == null ? void 0 : _a2.js,
        src: g,
        id: M.echarts,
        onload() {
          s.current = window.echarts, i();
        }
      },
      "echarts"
    );
  }, [t.noEcharts, i]);
  const a = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (v = false) => {
      const p = u.current;
      if (!p.length) {
        v && (l.current.forEach(($) => {
          var _a2;
          return (_a2 = $ == null ? void 0 : $.dispose) == null ? void 0 : _a2.call($);
        }), o.current.forEach(($) => {
          var _a2;
          return (_a2 = $ == null ? void 0 : $.disconnect) == null ? void 0 : _a2.call($);
        }), l.current = [], o.current = [], u.current = []);
        return;
      }
      const g = [], h = [], x = [];
      p.forEach(($, w) => {
        var _a2, _b;
        const T = l.current[w], y = o.current[w];
        if (v || !$ || !$.isConnected || ((n == null ? void 0 : n.current) ? !n.current.contains($) : false)) {
          (_a2 = T == null ? void 0 : T.dispose) == null ? void 0 : _a2.call(T), (_b = y == null ? void 0 : y.disconnect) == null ? void 0 : _b.call(y);
          return;
        }
        g.push($), T && h.push(T), y && x.push(y);
      }), u.current = g, l.current = h, o.current = x;
    },
    [n]
  ), m = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    a(), !t.noEcharts && s.current && (n == null ? void 0 : n.current) && Array.from(
      n.current.querySelectorAll(
        `#${e} div.${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-echarts:not([data-processed])`
      )
    ).forEach((p) => {
      if (p.dataset.closed !== "false")
        try {
          const g = new Function(`return ${p.innerText}`)(), h = s.current.init(p, r);
          h.setOption(g), p.setAttribute("data-processed", ""), u.current.push(p), l.current.push(h);
          const x = new ResizeObserver(() => {
            h.resize();
          });
          x.observe(p), o.current.push(x);
        } catch (g) {
          _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.E, {
            name: "echarts",
            message: g == null ? void 0 : g.message,
            error: g
          });
        }
    });
  }, [t.noEcharts, n, e, r, a]);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => () => {
    a(true);
  }, [a]), { reRenderEcharts: d, replaceEcharts: m };
}, it = (t) => {
  const { highlight: e } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_3__.E), r = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(_config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensions.highlight.instance), [n, s] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(!!r.current);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    t.noHighlight || _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensions.highlight.instance || (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.u)("link", {
      ...e.css,
      rel: "stylesheet",
      id: M.hlcss
    });
  }, [e.css, t.noHighlight]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    t.noHighlight || r.current || (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.a)(
      "script",
      {
        ...e.js,
        id: M.hljs,
        onload() {
          r.current = window.hljs, s(true);
        }
      },
      "hljs"
    );
  }, []), { hljsRef: r, hljsInited: n };
}, at = (t) => {
  const e = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(_config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensions.katex.instance), [r, n] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(!!e.current);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a, _b;
    if (t.noKatex || e.current)
      return;
    const { editorExtensions: s, editorExtensionsAttrs: d } = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g;
    (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.a)(
      "script",
      {
        ...(_a = d.katex) == null ? void 0 : _a.js,
        src: s.katex.js,
        id: M.katexjs,
        onload() {
          e.current = window.katex, n(true);
        }
      },
      "katex"
    ), (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.a)("link", {
      ...(_b = d.katex) == null ? void 0 : _b.css,
      rel: "stylesheet",
      href: s.katex.css,
      id: M.katexcss
    });
  }, [t.noKatex]), { katexRef: e, katexInited: r };
};
class lt {
  constructor(e) {
    __publicField(this, "cache", /* @__PURE__ */ new Map());
    this.options = e;
  }
  isExpired(e) {
    return e.expiresAt <= Date.now();
  }
  deleteExpired(e, r) {
    const n = r != null ? r : this.cache.get(e);
    return !n || !this.isExpired(n) ? false : (this.cache.delete(e), true);
  }
  trim() {
    for (const [e, r] of this.cache)
      if (!this.deleteExpired(e, r))
        break;
    for (; this.cache.size > this.options.max; ) {
      const e = this.cache.keys().next().value;
      if (e === void 0)
        break;
      this.cache.delete(e);
    }
  }
  get(e) {
    const r = this.cache.get(e);
    if (!(!r || this.deleteExpired(e, r)))
      return this.cache.delete(e), this.cache.set(e, r), r.value;
  }
  set(e, r) {
    this.cache.delete(e), this.cache.set(e, {
      value: r,
      expiresAt: Date.now() + this.options.ttl
    }), this.trim();
  }
  clear() {
    this.cache.clear();
  }
}
const ie = new lt({
  max: 1e3,
  // 缓存10分钟
  ttl: 6e5
}), dt = (t) => {
  const { editorId: e, theme: r, rootRef: n } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_3__.E), { noMermaid: s, sanitizeMermaid: d } = t, c = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(_config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensions.mermaid.instance), [l, o] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(-1), u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    ie.clear();
    const a = c.current;
    if (!s && a) {
      const m = r === "dark" ? {
        startOnLoad: false,
        theme: "dark"
      } : {
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          background: "#ffffff",
          primaryColor: "#ffffff",
          primaryTextColor: "#1f2329",
          primaryBorderColor: "#b7c0cc",
          secondaryColor: "#f7f8fa",
          tertiaryColor: "#f7f8fa",
          lineColor: "#596273",
          edgeLabelBackground: "#ffffff",
          clusterBkg: "#ffffff",
          clusterBorder: "#b7c0cc"
        }
      };
      a.initialize(_config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.mermaidConfig(m)), o((v) => v + 1);
    }
  }, [s, r]);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(u, [u]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a, _b;
    const { editorExtensions: a, editorExtensionsAttrs: m } = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g;
    if (s || c.current)
      return;
    const v = a.mermaid.js;
    /\.mjs/.test(v) ? ((0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.a)("link", {
      ...(_a = m.mermaid) == null ? void 0 : _a.js,
      rel: "modulepreload",
      href: v,
      id: M.mermaidM
    }), import(
      /* @vite-ignore */
      /* webpackIgnore: true */
      v
    ).then((p) => {
      c.current = p.default, u();
    }).catch((p) => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.E, {
        name: "mermaid",
        message: `Failed to load mermaid module: ${p.message}`,
        error: p
      });
    })) : (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.a)(
      "script",
      {
        ...(_b = m.mermaid) == null ? void 0 : _b.js,
        src: v,
        id: M.mermaid,
        onload() {
          c.current = window.mermaid, u();
        }
      },
      "mermaid"
    );
  }, [u, e, s]);
  const i = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(async () => {
    var _a;
    if (!s && c.current) {
      const a = ((_a = n.current) == null ? void 0 : _a.querySelectorAll(`div.${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-mermaid`)) || [], m = document.createElement("div"), v = document.body.offsetWidth > 1366 ? document.body.offsetWidth : 1366, p = document.body.offsetHeight > 768 ? document.body.offsetHeight : 768;
      m.style.width = v + "px", m.style.height = p + "px", m.style.position = "fixed", m.style.zIndex = "-10000", m.style.top = "-10000";
      let g = a.length;
      g > 0 && document.body.appendChild(m), await Promise.allSettled(
        Array.from(a).map((h) => (async ($) => {
          var _a2;
          if ($.dataset.closed === "false")
            return false;
          const w = $.innerText;
          let T = ie.get(w);
          if (!T) {
            const y = (0,_vavt_util__WEBPACK_IMPORTED_MODULE_6__.randomId)();
            let A = { svg: "" };
            try {
              A = await c.current.render(
                y,
                w,
                m
              ), T = await d(A.svg);
              const C = document.createElement("p");
              C.className = `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-mermaid`, C.setAttribute("data-processed", ""), C.setAttribute("data-content", w), C.innerHTML = T, (_a2 = C.children[0]) == null ? void 0 : _a2.removeAttribute("height"), ie.set(w, C.innerHTML), $.dataset.line !== void 0 && (C.dataset.line = $.dataset.line), $.replaceWith(C);
            } catch (C) {
              _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.E, {
                name: "mermaid",
                message: C.message,
                error: C
              });
            }
            --g === 0 && m.remove();
          }
        })(h))
      );
    }
  }, [e, s, n, d]);
  return { reRender: l, replaceMermaid: i };
}, ut = (t, e) => {
  e = e || {};
  const r = 3, n = e.marker || "!", s = n.charCodeAt(0), d = n.length;
  let c = "", l = "";
  const o = (i, a, m, v, p) => {
    const g = i[a];
    return g.type === "admonition_open" ? i[a].attrPush([
      "class",
      `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-admonition ${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-admonition-${g.info}`
    ]) : g.type === "admonition_title_open" && i[a].attrPush(["class", `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-admonition-title`]), p.renderToken(i, a, m);
  }, u = (i) => {
    const a = i.trim().split(" ", 2);
    l = "", c = a[0], a.length > 1 && (l = i.substring(c.length + 2));
  };
  t.block.ruler.before(
    "code",
    "admonition",
    (i, a, m, v) => {
      let p, g, h, x = false, $ = i.bMarks[a] + i.tShift[a], w = i.eMarks[a];
      if (s !== i.src.charCodeAt($))
        return false;
      for (p = $ + 1; p <= w && n[(p - $) % d] === i.src[p]; p++)
        ;
      const T = Math.floor((p - $) / d);
      if (T !== r)
        return false;
      p -= (p - $) % d;
      const y = i.src.slice($, p), A = i.src.slice(p, w);
      if (u(A), v)
        return true;
      for (g = a; g++, !(g >= m || ($ = i.bMarks[g] + i.tShift[g], w = i.eMarks[g], $ < w && i.sCount[g] < i.blkIndent)); )
        if (s === i.src.charCodeAt($) && !(i.sCount[g] - i.blkIndent >= 4)) {
          for (p = $ + 1; p <= w && n[(p - $) % d] === i.src[p]; p++)
            ;
          if (!(Math.floor((p - $) / d) < T) && (p -= (p - $) % d, p = i.skipSpaces(p), !(p < w))) {
            x = true;
            break;
          }
        }
      const C = i.parentType, I = i.lineMax;
      return i.parentType = "root", i.lineMax = g, h = i.push("admonition_open", "div", 1), h.markup = y, h.block = true, h.info = c, h.map = [a, g], l && (h = i.push("admonition_title_open", "p", 1), h.markup = y + " " + c, h.map = [a, g], h = i.push("inline", "", 0), h.content = l, h.map = [a, i.line - 1], h.children = [], h = i.push("admonition_title_close", "p", -1), h.markup = y + " " + c), i.md.block.tokenize(i, a + 1, g), h = i.push("admonition_close", "div", -1), h.markup = i.src.slice($, p), h.block = true, i.parentType = C, i.lineMax = I, i.line = g + (x ? 1 : 0), true;
    },
    {
      alt: ["paragraph", "reference", "blockquote", "list"]
    }
  ), t.renderer.rules.admonition_open = o, t.renderer.rules.admonition_title_open = o, t.renderer.rules.admonition_title_close = o, t.renderer.rules.admonition_close = o;
}, ve = (t, e) => {
  const r = t.attrs ? t.attrs.slice() : [];
  return e.forEach((n) => {
    const s = t.attrIndex(n[0]);
    s < 0 ? r.push(n) : (r[s] = r[s].slice(), r[s][1] += ` ${n[1]}`);
  }), r;
}, mt = (t, e) => {
  const r = t.renderer.rules.fence, n = t.utils.unescapeAll, s = /\[(\w*)(?::([\w ]*))?\]/, d = /::(open|close)/, c = (a) => a.info ? n(a.info).trim() : "", l = (a) => {
    const m = c(a), [v = null, p = ""] = (s.exec(m) || []).slice(1);
    return [v, p];
  }, o = (a) => {
    const m = c(a);
    return m ? m.split(/(\s+)/g)[0] : "";
  }, u = (a) => {
    const m = a.info.match(d) || [], v = m[1] === "open" || m[1] !== "close" && e.codeFoldable && a.content.trim().split(`
`).length < e.autoFoldThreshold, p = m[1] || e.codeFoldable ? "details" : "div", g = m[1] || e.codeFoldable ? "summary" : "div";
    return { open: v, tagContainer: p, tagHeader: g };
  }, i = (a, m, v, p, g) => {
    if (a[m].hidden)
      return "";
    const h = e.usedLanguageTextRef.current.copyCode.text, x = e.customIconRef.current.copy || h, $ = !!e.customIconRef.current.copy, w = `<span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-collapse-tips">${(0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.S)("collapse-tips", e.customIconRef.current)}</span>`, [T] = l(a[m]);
    if (T === null) {
      const { open: H, tagContainer: P, tagHeader: U } = u(a[m]), q = [["class", `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code`]];
      H && q.push(["open", ""]);
      const J = {
        attrs: ve(a[m], q)
      };
      a[m].info = a[m].info.replace(d, "");
      const de = r(a, m, v, p, g);
      return `
        <${P} ${g.renderAttrs(J)}>
          <${U} class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code-head">
            <div class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code-flag"><span></span><span></span><span></span></div>
            <div class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code-action">
              <span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code-lang">${t.utils.escapeHtml(a[m].info.trim())}</span>
              <span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-copy-button" data-tips="${h}"${$ ? " data-is-icon=true" : ""}>${x}</span>
              ${e.extraTools instanceof Function ? e.extraTools({ lang: a[m].info.trim() }) : e.extraTools || ""}
              ${P === "details" ? w : ""}
            </div>
          </${U}>
          ${de}
        </${P}>
      `;
    }
    let y, A, C, I, V = "", Z = "", z = "";
    const { open: W, tagContainer: K, tagHeader: se } = u(a[m]), B = [["class", `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code`]];
    W && B.push(["open", ""]);
    const le = {
      attrs: ve(a[m], B)
    };
    for (let H = m; H < a.length && (y = a[H], [A, C] = l(y), A === T); H++) {
      y.info = y.info.replace(s, "").replace(d, ""), y.hidden = true;
      const P = `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-codetab-${e.editorId}-${m}-${H - m}`;
      I = H - m > 0 ? "" : "checked", V += `
        <li>
          <input
            type="radio"
            id="label-${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-codetab-label-1-${e.editorId}-${m}-${H - m}"
            name="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-codetab-label-${e.editorId}-${m}"
            class="${P}"
            ${I}
          >
          <label
            for="label-${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-codetab-label-1-${e.editorId}-${m}-${H - m}"
            onclick="this.getRootNode().querySelectorAll('.${P}').forEach(e => e.click())"
          >
            ${t.utils.escapeHtml(C || o(y))}
          </label>
        </li>`, Z += `
        <div role="tabpanel">
          <input
            type="radio"
            name="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-codetab-pre-${e.editorId}-${m}"
            class="${P}"
            ${I}
            role="presentation">
          ${r(a, H, v, p, g)}
        </div>`, z += `
        <input
          type="radio"
          name="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-codetab-lang-${e.editorId}-${m}"
          class="${P}"
          ${I}
          role="presentation">
        <span class=${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code-lang role="note">${t.utils.escapeHtml(o(y))}</span>`;
    }
    return `
      <${K} ${g.renderAttrs(le)}>
        <${se} class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code-head">
          <div class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code-flag">
            <ul class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-codetab-label" role="tablist">${V}</ul>
          </div>
          <div class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code-action">
            <span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-codetab-lang">${z}</span>
            <span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-copy-button" data-tips="${h}"${$ ? " data-is-icon=true" : ""}>${x}</span>
            ${e.extraTools instanceof Function ? e.extraTools({ lang: a[m].info.trim() }) : e.extraTools || ""}
            ${K === "details" ? w : ""}
          </div>
        </${se}>
        ${Z}
      </${K}>
    `;
  };
  t.renderer.rules.fence = i, t.renderer.rules.code_block = i;
}, pt = (t, e) => {
  const r = t.renderer.rules.fence.bind(t.renderer.rules);
  t.renderer.rules.fence = (n, s, d, c, l) => {
    var _a, _b;
    const o = n[s], u = o.content.trim();
    if (o.info === "echarts") {
      if (o.attrSet("class", `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-echarts`), o.attrSet("data-echarts-theme", e.themeRef.current), o.map && o.level === 0) {
        const i = o.map[1] - 1, m = !!((_b = (_a = c.srcLines[i]) == null ? void 0 : _a.trim()) == null ? void 0 : _b.startsWith("```"));
        o.attrSet("data-closed", `${m}`), o.attrSet("data-line", String(o.map[0]));
      }
      return `<div ${l.renderAttrs(o)} style="width: 100%; aspect-ratio: 4 / 3;">${t.utils.escapeHtml(u)}</div>`;
    }
    return r(n, s, d, c, l);
  };
}, ht = (t, e) => {
  t.renderer.rules.heading_open = (r, n) => {
    var _a;
    const s = r[n], d = ((_a = r[n + 1].children) == null ? void 0 : _a.reduce((l, o) => l + (["text", "code_inline", "math_inline"].includes(o.type) && o.content || ""), "")) || "", c = s.markup.length;
    return e.headsRef.current.push({
      text: d,
      level: c,
      line: s.map[0],
      currentToken: s,
      nextToken: r[n + 1]
    }), s.map && s.level === 0 && s.attrSet(
      "id",
      e.mdHeadingId({
        text: d,
        level: c,
        index: e.headsRef.current.length,
        currentToken: s,
        nextToken: r[n + 1]
      })
    ), t.renderer.renderToken(r, n, e);
  }, t.renderer.rules.heading_close = (r, n, s, d, c) => c.renderToken(r, n, s);
}, He = {
  block: [
    { open: "$$", close: "$$" },
    { open: "\\[", close: "\\]" }
  ],
  inline: [
    { open: "$$", close: "$$" },
    { open: "$", close: "$" },
    { open: "\\[", close: "\\]" },
    { open: "\\(", close: "\\)" }
  ]
}, ft = (t) => (e, r) => {
  const n = t.delimiters;
  for (const s of n) {
    if (!e.src.startsWith(s.open, e.pos))
      continue;
    const d = e.pos + s.open.length;
    let c = d;
    for (; (c = e.src.indexOf(s.close, c)) !== -1; ) {
      let l = 0, o = c - 1;
      for (; o >= 0 && e.src[o] === "\\"; )
        l++, o--;
      if (l % 2 === 0)
        break;
      c += s.close.length;
    }
    if (c !== -1) {
      if (c - d === 0)
        return r || (e.pending += s.open + s.close), e.pos = c + s.close.length, true;
      if (!r) {
        const l = e.push("math_inline", "math", 0);
        l.markup = s.open, l.content = e.src.slice(d, c);
      }
      return e.pos = c + s.close.length, true;
    }
  }
  return false;
}, gt = (t) => (e, r, n, s) => {
  const d = t.delimiters, c = e.bMarks[r] + e.tShift[r], l = e.eMarks[r], o = (u, i, a) => {
    e.line = i;
    const m = e.push("math_block", "math", 0);
    return m.block = true, m.content = u, m.map = [r, e.line], m.markup = a, true;
  };
  for (const u of d) {
    const i = c;
    if (e.src.slice(i, i + u.open.length) !== u.open)
      continue;
    const a = i + u.open.length, m = e.src.slice(a, l).trim(), v = m === "", p = m === u.close, g = m.endsWith(u.close);
    if (!v && !p && !g)
      continue;
    if (s)
      return true;
    if (p)
      return o("", r + 1, u.open);
    if (!v && g) {
      const y = m.slice(0, -u.close.length);
      return o(y, r + 1, u.open);
    }
    let h = r + 1, x = false, $ = "";
    for (; h < n; h++) {
      const y = e.bMarks[h] + e.tShift[h], A = e.eMarks[h];
      if (y < A && e.tShift[h] < e.blkIndent)
        break;
      if (e.src.slice(y, A).trim().endsWith(u.close)) {
        const I = e.src.slice(0, A).lastIndexOf(u.close);
        $ = e.src.slice(y, I), x = true;
        break;
      }
    }
    if (!x)
      continue;
    const T = e.getLines(r + 1, h, e.tShift[r], true) + ($.trim() ? $ : "");
    return o(T, h + 1, u.open);
  }
  return false;
}, bt = (t, { katexRef: e, inlineDelimiters: r, blockDelimiters: n }) => {
  const s = (l, o, u, i, a = false) => {
    const m = {
      attrs: ve(l, [["class", o]])
    }, v = i.renderAttrs(m);
    if (!e.current)
      return `<${u} ${v}>${l.content}</${u}>`;
    const p = e.current.renderToString(
      l.content,
      _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.katexConfig({
        throwOnError: false,
        displayMode: a
      })
    );
    return `<${u} ${v} data-processed>${p}</${u}>`;
  }, d = (l, o, u, i, a) => s(l[o], `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-katex-inline`, "span", a), c = (l, o, u, i, a) => s(l[o], `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-katex-block`, "p", a, true);
  t.inline.ruler.before(
    "escape",
    "math_inline",
    ft({
      delimiters: r || He.inline
    })
  ), t.block.ruler.after(
    "blockquote",
    "math_block",
    gt({
      delimiters: n || He.block
    }),
    {
      alt: ["paragraph", "reference", "blockquote", "list"]
    }
  ), t.renderer.rules.math_inline = d, t.renderer.rules.math_block = c;
}, vt = (t, e) => {
  const r = t.renderer.rules.fence.bind(t.renderer.rules);
  t.renderer.rules.fence = (n, s, d, c, l) => {
    var _a, _b;
    const o = n[s], u = o.content.trim();
    if (o.info === "mermaid") {
      if (o.attrSet("class", `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-mermaid`), o.attrSet("data-mermaid-theme", e.themeRef.current), o.map && o.level === 0) {
        const a = o.map[1] - 1, v = !!((_b = (_a = c.srcLines[a]) == null ? void 0 : _a.trim()) == null ? void 0 : _b.startsWith("```"));
        o.attrSet("data-closed", `${v}`), o.attrSet("data-line", String(o.map[0]));
      }
      const i = ie.get(u);
      return i ? (o.attrSet("data-processed", ""), o.attrSet("data-content", u), `<p ${l.renderAttrs(o)}>${i}</p>`) : `<div ${l.renderAttrs(o)}>${t.utils.escapeHtml(u)}</div>`;
    }
    return r(n, s, d, c, l);
  };
}, Le = (t, e, r) => {
  const n = t.attrIndex(e), s = [e, r];
  n < 0 ? t.attrPush(s) : (t.attrs = t.attrs || [], t.attrs[n] = s);
}, $t = (t) => t.type === "inline", Et = (t) => t.type === "paragraph_open", yt = (t) => t.type === "list_item_open", kt = (t) => t.content.indexOf("[ ] ") === 0 || t.content.indexOf("[x] ") === 0 || t.content.indexOf("[X] ") === 0, wt = (t, e) => $t(t[e]) && Et(t[e - 1]) && yt(t[e - 2]) && kt(t[e]), xt = (t, e) => {
  const r = t[e].level - 1;
  for (let n = e - 1; n >= 0; n--)
    if (t[n].level === r)
      return n;
  return -1;
}, Ct = (t) => {
  const e = new t("html_inline", "", 0);
  return e.content = "<label>", e;
}, Tt = (t) => {
  const e = new t("html_inline", "", 0);
  return e.content = "</label>", e;
}, It = (t, e, r) => {
  const n = new r("html_inline", "", 0);
  return n.content = '<label class="task-list-item-label" for="' + e + '">' + t + "</label>", n.attrs = [{ for: e }], n;
}, St = (t, e, r) => {
  const n = new e("html_inline", "", 0), s = r.enabled ? " " : ' disabled="" ';
  return t.content.indexOf("[ ] ") === 0 ? n.content = '<input class="task-list-item-checkbox"' + s + 'type="checkbox">' : (t.content.indexOf("[x] ") === 0 || t.content.indexOf("[X] ") === 0) && (n.content = '<input class="task-list-item-checkbox" checked=""' + s + 'type="checkbox">'), n;
}, At = (t, e, r) => {
  if (t.children = t.children || [], t.children.unshift(St(t, e, r)), t.children[1].content = t.children[1].content.slice(3), t.content = t.content.slice(3), r.label)
    if (r.labelAfter) {
      t.children.pop();
      const n = "task-item-" + Math.ceil(Math.random() * (1e4 * 1e3) - 1e3);
      t.children[0].content = t.children[0].content.slice(0, -1) + ' id="' + n + '">', t.children.push(It(t.content, n, e));
    } else
      t.children.unshift(Ct(e)), t.children.push(Tt(e));
}, Ht = (t, e = {}) => {
  t.core.ruler.after("inline", "github-task-lists", (r) => {
    const n = r.tokens;
    for (let s = 2; s < n.length; s++)
      wt(n, s) && (At(n[s], r.Token, e), Le(
        n[s - 2],
        "class",
        "task-list-item" + (e.enabled ? " enabled" : " ")
      ), Le(n[xt(n, s - 2)], "class", "contains-task-list"));
  });
}, Lt = (t) => {
  t.core.ruler.push("init-line-number", (e) => (e.tokens.forEach((r) => {
    r.map && (r.attrs || (r.attrs = []), r.attrs.push(["data-line", r.map[0].toString()]));
  }), true));
}, Rt = (t, e) => {
  var _a;
  const {
    modelValue: r,
    sanitize: n,
    mdHeadingId: s,
    codeFoldable: d,
    autoFoldThreshold: c,
    noKatex: l,
    noMermaid: o,
    noHighlight: u,
    onHtmlChanged: i,
    onGetCatalog: a
  } = t, { editorConfig: m, markdownItConfig: v, markdownItPlugins: p, editorExtensions: g } = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g, {
    editorId: h,
    language: x,
    showCodeRowNumber: $,
    theme: w,
    usedLanguageText: T,
    customIcon: y,
    rootRef: A,
    setting: C
  } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_3__.E), I = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)([]), V = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(w);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    V.current = w;
  }, [w]);
  const Z = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(T);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    Z.current = T;
  }, [T]);
  const z = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(y);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    z.current = y;
  }, [y]);
  const { hljsRef: W, hljsInited: K } = it(t), { katexRef: se, katexInited: B } = at(t), { reRender: le, replaceMermaid: H } = dt(t), { reRenderEcharts: P, replaceEcharts: U } = ct(t), [q] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => {
    const k = (0,markdown_it__WEBPACK_IMPORTED_MODULE_7__["default"])({
      html: true,
      breaks: true,
      linkify: true
    });
    v(k, {
      editorId: h
    });
    const R = [
      {
        type: "image",
        plugin: markdown_it_image_figures__WEBPACK_IMPORTED_MODULE_8__["default"],
        options: { figcaption: true, classes: "md-zoom" }
      },
      {
        type: "admonition",
        plugin: ut,
        options: {}
      },
      {
        type: "taskList",
        plugin: Ht,
        options: {}
      },
      {
        type: "heading",
        plugin: ht,
        options: { mdHeadingId: s, headsRef: I }
      },
      {
        type: "code",
        plugin: mt,
        options: {
          editorId: h,
          usedLanguageTextRef: Z,
          // showCodeRowNumber,
          codeFoldable: d,
          autoFoldThreshold: c,
          customIconRef: z
        }
      },
      {
        type: "sub",
        plugin: markdown_it_sub__WEBPACK_IMPORTED_MODULE_9__["default"],
        options: {}
      },
      {
        type: "sup",
        plugin: markdown_it_sup__WEBPACK_IMPORTED_MODULE_10__["default"],
        options: {}
      }
    ];
    l || R.push({
      type: "katex",
      plugin: bt,
      options: { katexRef: se }
    }), o || R.push({
      type: "mermaid",
      plugin: vt,
      options: { themeRef: V }
    }), t.noEcharts || R.push({
      type: "echarts",
      plugin: pt,
      options: { themeRef: V }
    }), p(R, {
      editorId: h
    }).forEach((N) => {
      k.use(N.plugin, N.options);
    });
    const Y = k.options.highlight;
    return k.set({
      highlight: (N, Q, Fe) => {
        if (Y) {
          const ue = Y(N, Q, Fe);
          if (ue)
            return ue;
        }
        let ee;
        !u && W.current ? W.current.getLanguage(Q) ? ee = W.current.highlight(N, {
          language: Q,
          ignoreIllegals: true
        }).value : ee = W.current.highlightAuto(N).value : ee = q.utils.escapeHtml(N);
        const De = $ ? (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.g)(
          ee.replace(/^\n+|\n+$/g, ""),
          N.replace(/^\n+|\n+$/g, "")
        ) : `<span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-code-block">${ee.replace(/^\n+|\n+$/g, "")}</span>`;
        return `<pre><code class="language-${Q}" language=${Q}>${De}</code></pre>`;
      }
    }), Lt(k), k;
  }), [J, de] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(`_article-key_${(0,_vavt_util__WEBPACK_IMPORTED_MODULE_6__.randomId)()}`), [X, Oe] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => (I.current = [], n(
    q.render(r, {
      srcLines: r.split(`
`)
    })
  ))), je = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => (u || K) && (l || B), [K, B, u, l]), $e = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(true), oe = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    I.current = [];
    const k = n(
      q.render(r, {
        srcLines: r.split(`
`)
      })
    );
    Oe(k);
  }, [q, r, n]), ce = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    var _a2, _b;
    let k = () => {
    }, R = () => {
    };
    const Y = (_a2 = A.current) == null ? void 0 : _a2.querySelectorAll(
      `#${h} p.${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-mermaid:not([data-closed=false])`
    );
    return R = (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.c)(Y, {
      customIcon: z.current
    }), ((_b = g.mermaid) == null ? void 0 : _b.enableZoom) && (k = (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.z)(Y, {
      customIcon: z.current
    })), [k, R];
  }, [(_a = g.mermaid) == null ? void 0 : _a.enableZoom, h, A]);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(h, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.B, X), i == null ? void 0 : i(X), a == null ? void 0 : a(I.current), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(h, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.g, I.current);
  }, [h, X, J, a, i]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    let k = () => {
    }, R = () => {
    };
    return C.preview && (H().then(() => {
      [k, R] = ce();
    }), U(), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(h, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.g, I.current)), () => {
      k(), R();
    };
  }, [h, ce, U, H, C.preview]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    if ($e.current) {
      $e.current = false;
      return;
    }
    const k = setTimeout(
      () => {
        oe();
      },
      e ? 0 : m.renderDelay
    );
    return () => {
      clearTimeout(k);
    };
  }, [je, w, oe, x, e, m.renderDelay]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    let k = () => {
    }, R = () => {
    };
    return H().then(() => {
      [k, R] = ce();
    }), U(), () => {
      k(), R();
    };
  }, [
    ce,
    X,
    J,
    le,
    H,
    P,
    U
  ]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const k = () => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(h, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.g, I.current);
    };
    return _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(h, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.P,
      callback: k
    }), () => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.remove(h, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.P, k);
    };
  }, [h]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const k = () => {
      de(`_article-key_${(0,_vavt_util__WEBPACK_IMPORTED_MODULE_6__.randomId)()}`), oe();
    };
    return _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(h, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.f,
      callback: k
    }), () => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.remove(h, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.f, k);
    };
  }, [h, oe]), { html: X, key: J };
}, Mt = (t, e) => {
  const { editorId: r, setting: n } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_3__.E);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => t.noImgZoomIn ? void 0 : (() => {
    const d = document.querySelectorAll(
      `#${r}-preview img:not(.not-zoom):not(.medium-zoom-image)`
    ), c = (0,medium_zoom__WEBPACK_IMPORTED_MODULE_13__["default"])(d, {
      background: "#00000073"
    });
    return () => {
      c.detach();
    };
  })(), [r, e, t.noImgZoomIn, n]);
}, Re = {
  checked: {
    regexp: /- \[x\]/,
    value: "- [ ]"
  },
  unChecked: {
    regexp: /- \[\s\]/,
    value: "- [x]"
  }
}, Pt = (t, e) => {
  const { editorId: r, rootRef: n } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_3__.E);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a;
    const s = ((_a = n.current) == null ? void 0 : _a.querySelectorAll(".task-list-item.enabled")) || [], d = (c) => {
      var _a2;
      c.preventDefault();
      const l = c.target.checked ? "unChecked" : "checked", o = (_a2 = c.target.parentElement) == null ? void 0 : _a2.dataset.line;
      if (!o)
        return;
      const u = Number(o), i = t.modelValue.split(`
`), a = i[Number(u)].replace(
        Re[l].regexp,
        Re[l].value
      );
      t.previewOnly ? (i[Number(u)] = a, t.onChange(i.join(`
`))) : _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(r, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.T, u + 1, a);
    };
    return s.forEach((c) => {
      c.addEventListener("click", d);
    }), () => {
      s.forEach((c) => {
        c.removeEventListener("click", d);
      });
    };
  }, [r, e, t, n]);
}, _t = (t, e, r) => {
  const { onRemount: n } = t, { setting: s } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_3__.E);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    n == null ? void 0 : n();
  }, [e, r, n]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    (s.preview || s.htmlPreview) && (n == null ? void 0 : n());
  }, [s.preview, s.htmlPreview, n]);
}, Me = (t) => {
  const r = new DOMParser().parseFromString(t, "text/html");
  return Array.from(r.body.childNodes);
}, Ot = (t, e) => t.nodeType !== e.nodeType ? false : t.nodeType === Node.TEXT_NODE || t.nodeType === Node.COMMENT_NODE ? t.textContent === e.textContent : t.nodeType === Node.ELEMENT_NODE ? t.outerHTML === e.outerHTML : t.isEqualNode ? t.isEqualNode(e) : false, jt = (t, e, r) => {
  const n = Array.from(t.childNodes), s = Math.min(e.length, r.length);
  let d = -1;
  for (let l = 0; l < s; l += 1)
    if (!Ot(e[l], r[l])) {
      d = l;
      break;
    }
  if (d === -1)
    if (r.length > e.length)
      d = e.length;
    else if (e.length > r.length)
      d = r.length;
    else
      return;
  const c = Math.min(d, n.length);
  for (let l = n.length - 1; l >= c; l -= 1)
    n[l].remove();
  for (let l = d; l < e.length; l += 1)
    t.appendChild(e[l].cloneNode(true));
}, Ft = ({ html: t, id: e, className: r }) => {
  const n = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), s = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)({ __html: t }), d = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(t);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const c = n.current;
    if (!c)
      return;
    const l = d.current;
    if (l === t)
      return;
    const o = Me(t), u = Me(l);
    jt(c, o, u), d.current = t;
  }, [t]), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    "div",
    {
      id: e,
      className: r,
      dangerouslySetInnerHTML: s.current,
      ref: n
    }
  );
}, Dt = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Ft), Nt = (t) => {
  const {
    previewOnly: e = false,
    setting: r = { preview: true },
    previewComponent: n = Dt
  } = t, { editorId: s, previewTheme: d, showCodeRowNumber: c } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_3__.E), { html: l, key: o } = Rt(t, !!e);
  ot(t, l, o), Mt(t, l), Pt(t, l), _t(t, l, o);
  const u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    n,
    {
      html: l,
      id: `${s}-preview`,
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-preview`,
        `${d || "default"}-theme`,
        c && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-scrn`
      ])
    },
    o
  ), [n, s, l, o, d, c]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
    r.preview && (e ? u : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      "div",
      {
        id: `${s}-preview-wrapper`,
        className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-preview-wrapper`,
        children: u
      },
      "content-preview-wrapper"
    )),
    r.htmlPreview && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      "div",
      {
        id: `${s}-html-wrapper`,
        className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-preview-wrapper`,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-html`, children: l })
      },
      "html-preview-wrapper"
    )
  ] });
}, nn = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Nt), rn = (t, e) => {
  const { value: r, modelValue: n, onSave: s } = t, { editorId: d } = e, [c, l] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({
    // 是否已编译成html
    buildFinished: false,
    // 存储当前最新的html
    html: ""
  });
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const o = (u) => {
      l(() => ({
        buildFinished: true,
        html: u
      }));
    };
    return _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(d, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.B,
      callback: o
    }), () => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.remove(d, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.B, o);
    };
  }, [d]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const o = () => {
      if (s) {
        const u = new Promise((i) => {
          if (c.buildFinished)
            i(c.html);
          else {
            const a = (m) => {
              i(m), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.remove(d, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.B, a);
            };
            _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(d, {
              name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.B,
              callback: a
            });
          }
        });
        s(r || n || "", u);
      }
    };
    return _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(d, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.O,
      callback: o
    }), () => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.remove(d, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.O, o);
    };
  }, [d, n, s, c.buildFinished, c.html, r]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    l((o) => ({
      ...o,
      buildFinished: false
    }));
  }, [r, n]);
}, sn = (t) => {
  const { noPrettier: e, noUploadImg: r } = t;
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const { editorExtensions: n, editorExtensionsAttrs: s } = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g, d = e || !!n.prettier.prettierInstance, c = e || !!n.prettier.parserMarkdownInstance;
    if (!(r || !!n.cropper.instance)) {
      const { js: o = {}, css: u = {} } = s.cropper || {};
      (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.a)("link", {
        ...u,
        rel: "stylesheet",
        href: n.cropper.css,
        id: M.croppercss
      }), (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.a)("script", {
        ...o,
        src: n.cropper.js,
        id: M.cropperjs
      });
    }
    if (!d) {
      const { standaloneJs: o = {} } = s.prettier || {};
      (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.a)("script", {
        ...o,
        src: n.prettier.standaloneJs,
        id: M.prettier
      });
    }
    if (!c) {
      const { parserMarkdownJs: o = {} } = s.prettier || {};
      (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_12__.a)("script", {
        ...o,
        src: n.prettier.parserMarkdownJs,
        id: M.prettierMD
      });
    }
  }, [e, r]);
}, on = (t, e) => {
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => (_event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(t, {
    name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.E,
    callback: e
  }), () => {
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.remove(t, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.E, e);
  }), [t, e]);
}, cn = (t, e) => {
  const { editorId: r } = e, { onUploadImg: n } = t;
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const s = (d, c) => {
      n == null ? void 0 : n(d, (o) => {
        _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(r, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.R, "image", {
          desc: "",
          urls: o
        }), c == null ? void 0 : c();
      });
    };
    return _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(r, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.U,
      callback: s
    }), () => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.remove(r, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.U, s);
    };
  }, [r, n]);
}, an = (t, e) => {
  const { editorId: r } = e, [n, s] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const d = (c) => {
      s(c === void 0 ? (l) => !l : c);
    };
    return _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(r, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.C,
      callback: d
    }), () => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.remove(r, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.C, d);
    };
  }, [r]), n;
};
let Pe = "";
const Gt = (t) => {
  const {
    theme: e = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.theme,
    previewTheme: r = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.previewTheme,
    codeTheme: n = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.codeTheme,
    language: s = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.language,
    codeStyleReverse: d = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.codeStyleReverse,
    codeStyleReverseList: c = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.codeStyleReverseList
  } = t, l = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    const u = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensions.highlight, i = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorExtensionsAttrs.highlight, { js: a } = u, m = {
      ..._config_mjs__WEBPACK_IMPORTED_MODULE_2__.f,
      ...u.css
    }, { js: v, css: p = {} } = i || {}, g = d && c.includes(r) ? "dark" : e, h = m[n] ? m[n][g] : _config_mjs__WEBPACK_IMPORTED_MODULE_2__.f.atom[g], x = m[n] && p[n] ? p[n][g] : p.atom ? p.atom[g] : {};
    return {
      js: {
        src: a,
        ...v
      },
      css: {
        href: h,
        ...x
      }
    };
  }, [d, c, r, e, n]), o = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    const u = {
      ..._config_mjs__WEBPACK_IMPORTED_MODULE_2__.s,
      ..._config_mjs__WEBPACK_IMPORTED_MODULE_2__.g.editorConfig.languageUserDefined
    };
    return u[s] ? u[s] : _config_mjs__WEBPACK_IMPORTED_MODULE_2__.s["zh-CN"];
  }, [s]);
  return [l, o];
}, ln = (t) => {
  const {
    preview: e = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.preview,
    htmlPreview: r = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.htmlPreview,
    pageFullscreen: n = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.pageFullscreen
  } = t, [s, d] = Gt(t), [c, l] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({
    pageFullscreen: n,
    fullscreen: false,
    preview: e,
    htmlPreview: e ? false : r,
    previewOnly: false
  }), o = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(c), u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)((i, a) => {
    l((m) => {
      const v = a === void 0 ? !m[i] : a, p = {
        ...m
      };
      switch (i) {
        case "preview": {
          p.htmlPreview = false, p.previewOnly = false;
          break;
        }
        case "htmlPreview": {
          p.preview = false, p.previewOnly = false;
          break;
        }
        case "previewOnly": {
          v ? !p.preview && !p.htmlPreview && (p.preview = true) : (o.current.preview || (p.preview = false), o.current.htmlPreview || (p.htmlPreview = false));
          break;
        }
      }
      return o.current[i] = v, p[i] = v, p;
    });
  }, []);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    Pe = document.body.style.overflow;
  }, []), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    c.pageFullscreen || c.fullscreen ? document.body.style.overflow = "hidden" : document.body.style.overflow = Pe;
  }, [c.pageFullscreen, c.fullscreen]), [s, d, c, u];
}, dn = (t, e, r, n, s, d) => {
  const { editorId: c } = e;
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.h, n.pageFullscreen);
  }, [c, n.pageFullscreen]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.F, n.fullscreen);
  }, [c, n.fullscreen]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.i, n.preview);
  }, [c, n.preview]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.j, n.previewOnly);
  }, [c, n.previewOnly]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.H, n.htmlPreview);
  }, [c, n.htmlPreview]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.k, r);
  }, [r, c]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useImperativeHandle)(t, () => ({
    on(o, u) {
      switch (o) {
        case "pageFullscreen": {
          _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(c, {
            name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.h,
            callback(i) {
              u(i);
            }
          });
          break;
        }
        case "fullscreen": {
          _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(c, {
            name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.F,
            callback(i) {
              u(i);
            }
          });
          break;
        }
        case "preview": {
          _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(c, {
            name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.i,
            callback(i) {
              u(i);
            }
          });
          break;
        }
        case "previewOnly": {
          _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(c, {
            name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.j,
            callback(i) {
              u(i);
            }
          });
          break;
        }
        case "htmlPreview": {
          _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(c, {
            name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.H,
            callback(i) {
              u(i);
            }
          });
          break;
        }
        case "catalog": {
          _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.on(c, {
            name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.k,
            callback(i) {
              u(i);
            }
          });
          break;
        }
      }
    },
    togglePageFullscreen(o) {
      s("pageFullscreen", o);
    },
    toggleFullscreen(o) {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.d, o);
    },
    togglePreview(o) {
      s("preview", o);
    },
    togglePreviewOnly(o) {
      s("previewOnly", o);
    },
    toggleHtmlPreview(o) {
      s("htmlPreview", o);
    },
    toggleCatalog(o) {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.C, o);
    },
    triggerSave() {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.O);
    },
    insert(o) {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.R, "universal", { generate: o });
    },
    focus(o) {
      var _a;
      (_a = d.current) == null ? void 0 : _a.focus(o);
    },
    rerender() {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.f);
    },
    getSelectedText() {
      var _a;
      return (_a = d.current) == null ? void 0 : _a.getSelectedText();
    },
    resetHistory() {
      var _a;
      (_a = d.current) == null ? void 0 : _a.resetHistory();
    },
    domEventHandlers(o) {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.e, o);
    },
    execCommand(o) {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.b.emit(c, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_11__.R, o);
    },
    getEditorView() {
      var _a;
      return (_a = d.current) == null ? void 0 : _a.getEditorView();
    }
  }), [d, c, s]);
}, un = (t) => {
  const e = (0,react__WEBPACK_IMPORTED_MODULE_1__.useId)();
  return t.id || t.editorId || _config_mjs__WEBPACK_IMPORTED_MODULE_2__.p + "-" + e.replaceAll(":", "");
};



/***/ },

/***/ "../../node_modules/md-editor-rt/lib/es/chunks/index.mjs"
/*!***************************************************************!*\
  !*** ../../node_modules/md-editor-rt/lib/es/chunks/index.mjs ***!
  \***************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   I: () => (/* binding */ M),
/* harmony export */   M: () => (/* binding */ Ee)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react_dom__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react-dom */ "../../node_modules/react-dom/index.js");
/* harmony import */ var _config_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./config.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/config.mjs");
/* harmony import */ var _context_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./context.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/context.mjs");
/* harmony import */ var _index2_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./index2.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/index2.mjs");
/* harmony import */ var _dom_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./dom.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/dom.mjs");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/chart-area.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/code-xml.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/square-code.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/square-sigma.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/bold.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/code.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/expand.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/eye.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/forward.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/heading.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_17__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/image.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_18__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/italic.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_19__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/link.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_20__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/list-ordered.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_21__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/list-todo.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_22__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/list-tree.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_23__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/list.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_24__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/maximize-2.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_25__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/minimize-2.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_26__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/quote.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_27__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/reply.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_28__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/save.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_29__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/shrink.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_30__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/strikethrough.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_31__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/subscript.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_32__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/superscript.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_33__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/table.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_34__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/trash-2.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_35__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/underline.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_36__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/upload.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_37__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/view.js");
/* harmony import */ var lucide_react__WEBPACK_IMPORTED_MODULE_38__ = __webpack_require__(/*! lucide-react */ "../../node_modules/lucide-react/dist/esm/icons/x.js");








const Se = (e) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: `lucide lucide-github-icon ${e.className}`,
    children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("path", { d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("path", { d: "M9 18c-4.51 2-5-2-7-2" })
    ]
  }
), ve = {
  bold: lucide_react__WEBPACK_IMPORTED_MODULE_11__["default"],
  underline: lucide_react__WEBPACK_IMPORTED_MODULE_35__["default"],
  italic: lucide_react__WEBPACK_IMPORTED_MODULE_18__["default"],
  "strike-through": lucide_react__WEBPACK_IMPORTED_MODULE_30__["default"],
  title: lucide_react__WEBPACK_IMPORTED_MODULE_16__["default"],
  sub: lucide_react__WEBPACK_IMPORTED_MODULE_31__["default"],
  sup: lucide_react__WEBPACK_IMPORTED_MODULE_32__["default"],
  quote: lucide_react__WEBPACK_IMPORTED_MODULE_26__["default"],
  "unordered-list": lucide_react__WEBPACK_IMPORTED_MODULE_23__["default"],
  "ordered-list": lucide_react__WEBPACK_IMPORTED_MODULE_20__["default"],
  task: lucide_react__WEBPACK_IMPORTED_MODULE_21__["default"],
  "code-row": lucide_react__WEBPACK_IMPORTED_MODULE_12__["default"],
  code: lucide_react__WEBPACK_IMPORTED_MODULE_9__["default"],
  link: lucide_react__WEBPACK_IMPORTED_MODULE_19__["default"],
  image: lucide_react__WEBPACK_IMPORTED_MODULE_17__["default"],
  table: lucide_react__WEBPACK_IMPORTED_MODULE_33__["default"],
  revoke: lucide_react__WEBPACK_IMPORTED_MODULE_27__["default"],
  next: lucide_react__WEBPACK_IMPORTED_MODULE_15__["default"],
  save: lucide_react__WEBPACK_IMPORTED_MODULE_28__["default"],
  prettier: lucide_react__WEBPACK_IMPORTED_MODULE_9__["default"],
  minimize: lucide_react__WEBPACK_IMPORTED_MODULE_25__["default"],
  maximize: lucide_react__WEBPACK_IMPORTED_MODULE_24__["default"],
  "fullscreen-exit": lucide_react__WEBPACK_IMPORTED_MODULE_29__["default"],
  fullscreen: lucide_react__WEBPACK_IMPORTED_MODULE_13__["default"],
  "preview-only": lucide_react__WEBPACK_IMPORTED_MODULE_37__["default"],
  preview: lucide_react__WEBPACK_IMPORTED_MODULE_14__["default"],
  "preview-html": lucide_react__WEBPACK_IMPORTED_MODULE_8__["default"],
  catalog: lucide_react__WEBPACK_IMPORTED_MODULE_22__["default"],
  github: Se,
  mermaid: lucide_react__WEBPACK_IMPORTED_MODULE_7__["default"],
  formula: lucide_react__WEBPACK_IMPORTED_MODULE_10__["default"],
  close: lucide_react__WEBPACK_IMPORTED_MODULE_38__["default"],
  delete: lucide_react__WEBPACK_IMPORTED_MODULE_34__["default"],
  upload: lucide_react__WEBPACK_IMPORTED_MODULE_36__["default"]
}, ye = (e) => (0,react__WEBPACK_IMPORTED_MODULE_1__.createElement)(ve[e.name], {
  className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-icon`
}), Ce = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(ye), M = (e) => {
  const { customIcon: u } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_4__.E), l = u[e.name];
  if (typeof l == "object") {
    const s = l.component;
    return typeof s == "function" ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(s, { ...l.props }) : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      "span",
      {
        dangerouslySetInnerHTML: {
          __html: l.component
        }
      }
    );
  }
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Ce, { name: e.name });
}, Ie = `${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-modal-container`, be = (e) => {
  const { theme: u, rootRef: l } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(_context_mjs__WEBPACK_IMPORTED_MODULE_4__.E), { onClose: s = () => {
  }, onAdjust: v = () => {
  }, style: F = {}, showMask: j = true } = e, [h, y] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(e.visible), [E, C] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)([`${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-modal`]), f = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), I = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), a = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), L = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), [g, r] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({
    maskStyle: {
      zIndex: -1
    },
    modalStyle: {
      zIndex: -1
    },
    initPos: {
      insetInlineStart: "0px",
      insetBlockStart: "0px"
    },
    historyPos: {
      insetInlineStart: "0px",
      insetBlockStart: "0px"
    }
  }), R = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => e.isFullscreen ? {
    width: "100%",
    height: "100%"
  } : {
    width: e.width,
    height: e.height
  }, [e.height, e.isFullscreen, e.width]);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a;
    const t = (_a = l == null ? void 0 : l.current) == null ? void 0 : _a.getRootNode();
    return a.current = t instanceof Document ? document.body : t, () => {
      a.current = null;
    };
  }, [l]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    let t = () => {
    };
    return !e.isFullscreen && e.visible && (t = (0,_dom_mjs__WEBPACK_IMPORTED_MODULE_6__.k)(
      I.current,
      (o, x) => {
        r((k) => ({
          ...k,
          initPos: {
            insetInlineStart: o + "px",
            insetBlockStart: x + "px"
          }
        }));
      }
    )), t;
  }, [e.isFullscreen, e.visible]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    if (h) {
      const t = f.current.offsetWidth / 2, o = f.current.offsetHeight / 2, x = document.documentElement.clientWidth / 2, k = document.documentElement.clientHeight / 2;
      r((B) => ({
        ...B,
        maskStyle: {
          zIndex: _config_mjs__WEBPACK_IMPORTED_MODULE_3__.g.editorConfig.zIndex + (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_5__.d)()
        },
        modalStyle: {
          zIndex: _config_mjs__WEBPACK_IMPORTED_MODULE_3__.g.editorConfig.zIndex + (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_5__.d)()
        },
        initPos: {
          insetInlineStart: x - t + "px",
          insetBlockStart: k - o + "px"
        }
      }));
    }
  }, [h]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const t = e.visible;
    t ? (C(() => [`${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-modal`, "zoom-in"]), y(t)) : (C(() => [`${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-modal`, "zoom-out"]), setTimeout(() => {
      y(t);
    }, 150));
  }, [e.visible]), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: a.current && (0,react_dom__WEBPACK_IMPORTED_MODULE_2__.createPortal)(
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { ref: L, className: Ie, "data-theme": u, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
      "div",
      {
        className: e.className,
        style: { ...F, display: h ? "block" : "none" },
        children: [
          j && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "div",
            {
              className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-modal-mask`,
              style: g.maskStyle,
              onClick: s
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
            "div",
            {
              className: E.join(" "),
              style: {
                ...g.modalStyle,
                ...g.initPos,
                ...R
              },
              ref: f,
              children: [
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-modal-header`, ref: I, children: e.title || "" }),
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-modal-func`, children: [
                  e.showAdjust && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
                    "div",
                    {
                      className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-modal-adjust`,
                      onClick: (t) => {
                        t.stopPropagation(), e.isFullscreen ? r((o) => ({
                          ...o,
                          initPos: o.historyPos
                        })) : r((o) => ({
                          ...o,
                          historyPos: o.initPos,
                          initPos: {
                            insetInlineStart: "0",
                            insetBlockStart: "0"
                          }
                        })), v instanceof Function && v(!e.isFullscreen);
                      },
                      children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(M, { name: e.isFullscreen ? "minimize" : "maximize" })
                    }
                  ),
                  /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
                    "div",
                    {
                      className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-modal-close`,
                      onClick: (t) => {
                        t.stopPropagation(), e.onClose && e.onClose();
                      },
                      children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(M, { name: "close" })
                    }
                  )
                ] }),
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_3__.p}-modal-body`, children: e.children })
              ]
            }
          )
        ]
      }
    ) }),
    a.current
  ) });
}, Ee = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(be);



/***/ },

/***/ "../../node_modules/md-editor-rt/lib/es/chunks/index2.mjs"
/*!****************************************************************!*\
  !*** ../../node_modules/md-editor-rt/lib/es/chunks/index2.mjs ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   a: () => (/* binding */ m),
/* harmony export */   b: () => (/* binding */ l),
/* harmony export */   c: () => (/* binding */ g),
/* harmony export */   d: () => (/* binding */ d),
/* harmony export */   g: () => (/* binding */ u)
/* harmony export */ });
/* harmony import */ var _config_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./config.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/config.mjs");

const l = (t, e = "image.png") => {
  const r = t.split(","), n = r[0].match(/:(.*?);/);
  if (n) {
    const c = n[1], o = atob(r[1]);
    let s = o.length;
    const a = new Uint8Array(s);
    for (; s--; )
      a[s] = o.charCodeAt(s);
    return new File([a], e, { type: c });
  }
  return null;
}, u = (t, e) => {
  if (!t)
    return t;
  const r = e.split(`
`), n = ['<span rn-wrapper aria-hidden="true">'];
  return r.forEach(() => {
    n.push("<span></span>");
  }), n.push("</span>"), `<span class="${_config_mjs__WEBPACK_IMPORTED_MODULE_0__.p}-code-block">${t}</span>${n.join("")}`;
}, g = (t) => t.filter(Boolean).join(" "), m = (t, e) => {
  if (!t || !e)
    return 0;
  const r = t == null ? void 0 : t.getBoundingClientRect();
  if (e === document.documentElement)
    return r.top - e.clientTop;
  const n = e == null ? void 0 : e.getBoundingClientRect();
  return r.top - n.top;
}, d = /* @__PURE__ */ (() => {
  let t = 0;
  return () => ++t;
})();



/***/ },

/***/ "../../node_modules/md-editor-rt/lib/es/chunks/index3.mjs"
/*!****************************************************************!*\
  !*** ../../node_modules/md-editor-rt/lib/es/chunks/index3.mjs ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   M: () => (/* binding */ ke),
/* harmony export */   a: () => (/* binding */ He),
/* harmony export */   s: () => (/* binding */ Ee)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _config_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./config.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/config.mjs");
/* harmony import */ var _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./event-bus.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/event-bus.mjs");
/* harmony import */ var _index2_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./index2.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/index2.mjs");
/* harmony import */ var _vavt_util__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @vavt/util */ "../../node_modules/@vavt/util/lib/es/index.mjs");






const fe = `.${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-preview > [data-line]`, V = (t, e) => +getComputedStyle(t).getPropertyValue(e).replace("px", ""), He = (t, e) => {
  const S = (0,_vavt_util__WEBPACK_IMPORTED_MODULE_5__.debounce)(() => {
    t.removeEventListener("scroll", r), t.addEventListener("scroll", r), e.removeEventListener("scroll", r), e.addEventListener("scroll", r);
  }, 50), r = (M) => {
    const b = t.clientHeight, E = e.clientHeight, u = t.scrollHeight, i = e.scrollHeight, g = (u - b) / (i - E);
    M.target === t ? (e.removeEventListener("scroll", r), e.scrollTo({
      top: t.scrollTop / g
      // behavior: 'smooth'
    }), S()) : (t.removeEventListener("scroll", r), t.scrollTo({
      top: e.scrollTop * g
      // behavior: 'smooth'
    }), S());
  };
  return [
    () => {
      S().finally(() => {
        t.dispatchEvent(new Event("scroll"));
      });
    },
    () => {
      t.removeEventListener("scroll", r), e.removeEventListener("scroll", r);
    }
  ];
}, Ee = (t, e, S) => {
  const { view: r } = S, M = (0,_vavt_util__WEBPACK_IMPORTED_MODULE_5__.createSmoothScroll)(), b = (c) => r.lineBlockAt(r.state.doc.line(c + 1).from).top, E = (c) => r.lineBlockAt(r.state.doc.line(c + 1).from).bottom;
  let u = [], i = [], g = [];
  const $ = () => {
    u = [], i = Array.from(
      e.querySelectorAll(fe)
    ), g = i.map((a) => Number(a.dataset.line));
    const c = [...g], { lines: v } = r.state.doc;
    let H = c.shift() || 0, s = c.shift() || v;
    for (let a = 0; a < v; a++)
      a === s && (H = a, s = c.shift() || v), u.push({
        start: H,
        end: s - 1
      });
  }, A = (c, v) => {
    let H = 1;
    for (let s = i.length - 1; s - 1 >= 0; s--) {
      const a = i[s], f = i[s - 1];
      if (a.offsetTop + a.offsetHeight > v && f.offsetTop < v) {
        H = Number(f.dataset.line);
        break;
      }
    }
    for (let s = u.length - 1; s >= 0; s--) {
      const a = E(u[s].end), f = b(u[s].start);
      if (a > c && f <= c) {
        H = H < u[s].start ? H : u[s].start;
        break;
      }
    }
    return H;
  };
  let C = 0, w = 0;
  const R = () => {
    var _a, _b, _c;
    if (w !== 0)
      return false;
    C++;
    const { scrollDOM: c, contentHeight: v } = r;
    let H = V(e, "padding-block-start");
    const s = r.lineBlockAtHeight(c.scrollTop), { number: a } = r.state.doc.lineAt(s.from), f = u[a - 1];
    if (!f)
      return false;
    let k = 1;
    const y = e.querySelector(`[data-line="${f.start}"]`) || ((_a = e.firstElementChild) == null ? void 0 : _a.firstElementChild), l = e.querySelector(`[data-line="${f.end + 1}"]`) || ((_b = e.lastElementChild) == null ? void 0 : _b.lastElementChild), h = c.scrollHeight - c.clientHeight, x = e.scrollHeight - e.clientHeight;
    let L = b(f.start), m = E(f.end), T = y.offsetTop, p = l.offsetTop - T;
    L === 0 && (T = 0, y === l ? (H = 0, m = v - c.offsetHeight, p = x) : p = l.offsetTop), k = (c.scrollTop - L) / (m - L);
    const d = l == ((_c = e.lastElementChild) == null ? void 0 : _c.lastElementChild) ? l.offsetTop + l.clientHeight : l.offsetTop;
    if (m >= h || d > x) {
      const n = A(h, x);
      L = b(n), k = (c.scrollTop - L) / (h - L);
      const P = e.querySelector(`[data-line="${n}"]`);
      L > 0 && P && (T = P.offsetTop), p = x - T + V(e, "padding-block-start");
    }
    const o = T - H + p * k;
    M(e, o, () => {
      C--;
    });
  }, O = () => {
    var _a, _b, _c, _d, _e, _f;
    if (C !== 0)
      return;
    w++;
    const { scrollDOM: c } = r, v = e.scrollTop, H = e.scrollHeight, s = c.scrollHeight - c.clientHeight, a = e.scrollHeight - e.clientHeight;
    let f = (_a = e.firstElementChild) == null ? void 0 : _a.firstElementChild, k = (_b = e.firstElementChild) == null ? void 0 : _b.lastElementChild;
    if (g.length > 0) {
      let d = Math.ceil(
        g[g.length - 1] * (v / H)
      ), o = g.findLastIndex((n) => n <= d);
      o = o === -1 ? 0 : o, d = g[o];
      for (let n = o; n >= 0 && n < g.length; )
        if (i[n].offsetTop > v) {
          if (n - 1 >= 0) {
            n--;
            continue;
          }
          d = -1, o = n;
          break;
        } else {
          if (n + 1 < g.length && i[n + 1].offsetTop < v) {
            n++;
            continue;
          }
          d = g[n], o = n;
          break;
        }
      switch (o) {
        case -1: {
          f = (_c = e.firstElementChild) == null ? void 0 : _c.firstElementChild, k = i[o];
          break;
        }
        case g.length - 1: {
          f = i[o], k = (_d = e.firstElementChild) == null ? void 0 : _d.lastElementChild;
          break;
        }
        default:
          f = i[o], k = i[o + 1 === i.length ? o : o + 1];
      }
    }
    let y = f === ((_e = e.firstElementChild) == null ? void 0 : _e.firstElementChild) ? 0 : f.offsetTop - V(f, "margin-block-start"), l = k.offsetTop, h = 0;
    const { start: x, end: L } = u[Number(f.dataset.line || 0)];
    let m = b(x);
    const T = b(
      L + 1 === r.state.doc.lines ? L : L + 1
    );
    let p = 0;
    if (T > s || k.offsetTop + k.offsetHeight > a) {
      const d = A(s, a), o = e.querySelector(`[data-line="${d}"]`);
      y = o ? o.offsetTop - V(o, "margin-block-start") : y, m = b(d), h = (v - y) / (a - y), p = s - m;
    } else f === ((_f = e.firstElementChild) == null ? void 0 : _f.firstElementChild) ? (f === k && (l = k.offsetTop + k.offsetHeight + +getComputedStyle(k).marginBlockEnd.replace("px", "")), p = T, h = Math.max(v / l, 0)) : (h = Math.max(
      (v - y) / (l - y),
      0
    ), p = T - m);
    M(t, m + p * h, () => {
      w--;
    });
  }, N = (c) => {
    var _a;
    const { scrollDOM: v, contentHeight: H } = r, s = v.clientHeight;
    if (H <= s || e.firstElementChild.clientHeight <= e.clientHeight || r.state.doc.lines <= ((_a = u[u.length - 1]) == null ? void 0 : _a.end))
      return false;
    c.target === t ? R() : O();
  };
  return [
    () => {
      $(), t.addEventListener("scroll", N), e.addEventListener("scroll", N), t.dispatchEvent(new Event("scroll"));
    },
    () => {
      t.removeEventListener("scroll", N), e.removeEventListener("scroll", N);
    }
  ];
}, Y = (0,react__WEBPACK_IMPORTED_MODULE_1__.createContext)({
  scrollElementRef: void 0,
  rootNodeRef: void 0
}), Z = ({
  tocItem: t,
  mdHeadingId: e,
  onActive: S,
  onClick: r,
  scrollElementOffsetTop: M = 0
}) => {
  const { scrollElementRef: b, rootNodeRef: E } = (0,react__WEBPACK_IMPORTED_MODULE_1__.useContext)(Y), u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    t.active && S(t, u.current);
  }, [S, t, t.active]), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
    "div",
    {
      ref: u,
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-catalog-link`,
        t.active && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-catalog-active`
      ]),
      onClick: (i) => {
        if (i.stopPropagation(), r == null ? void 0 : r(i, t), i.defaultPrevented)
          return;
        const g = e({
          text: t.text,
          level: t.level,
          index: t.index,
          currentToken: t.currentToken,
          nextToken: t.nextToken
        }), $ = E == null ? void 0 : E.current.getElementById(g), A = b == null ? void 0 : b.current;
        if ($ && A) {
          let C = $.offsetParent, w = $.offsetTop;
          if (A.contains(C))
            for (; C && A != C; )
              w += C == null ? void 0 : C.offsetTop, C = C == null ? void 0 : C.offsetParent;
          const R = $.previousElementSibling;
          let O = 0;
          R || (O = V($, "margin-block-start")), A == null ? void 0 : A.scrollTo({
            top: w - M - O,
            behavior: "smooth"
          });
        }
      },
      children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { title: t.text, children: t.text }),
        t.children && t.children.length > 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-catalog-wrapper`, children: t.children.map((i) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
          Z,
          {
            mdHeadingId: e,
            tocItem: i,
            onActive: S,
            onClick: r,
            scrollElementOffsetTop: M
          },
          `${t.text}-link-${i.level}-${i.text}`
        )) })
      ]
    }
  );
}, de = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(Z), he = (t) => {
  const {
    editorId: e,
    mdHeadingId: S = _config_mjs__WEBPACK_IMPORTED_MODULE_2__.d.mdHeadingId,
    theme: r = "light",
    offsetTop: M = 20,
    syncWith: b = "preview",
    catalogMaxDepth: E
  } = t, u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => `#${e}-preview-wrapper`, [e]), [i, g] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)([]), [$, A] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(), C = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), w = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), R = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(void 0), O = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), [N, c] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(), [v, H] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({}), s = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    const l = [];
    return i.forEach((h, x) => {
      if (E && h.level > E)
        return;
      const { text: L, level: m, line: T } = h, p = {
        level: m,
        text: L,
        line: T,
        index: x + 1,
        active: $ === h
      };
      if (l.length === 0)
        l.push(p);
      else {
        let d = l[l.length - 1];
        if (p.level > d.level)
          for (let o = d.level + 1; o <= 6; o++) {
            const { children: n } = d;
            if (!n) {
              d.children = [p];
              break;
            }
            if (d = n[n.length - 1], p.level <= d.level) {
              n.push(p);
              break;
            }
          }
        else
          l.push(p);
      }
    }), l;
  }, [$, i, E]), [a] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(() => t.scrollElement || `#${e}-preview-wrapper`), f = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    var _a;
    if (a instanceof HTMLElement)
      return a;
    let l = document;
    return (a === u || t.isScrollElementInShadow) && (l = (_a = C.current) == null ? void 0 : _a.getRootNode()), l.querySelector(a);
  }, [u, t.isScrollElementInShadow, a]), k = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (l, h) => {
      var _a;
      H({
        top: h.offsetTop + V(h, "padding-block-start") + "px"
      }), (_a = t.onActive) == null ? void 0 : _a.call(t, l, h);
    },
    [t]
  );
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    O.current = C.current.getRootNode();
  }, []), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    let l = [];
    const h = (m) => {
      if (m.length === 0)
        return A(void 0), g([]), l = m, false;
      const { activeHead: T, activeIndex: p } = m.reduce(
        (o, n, P) => {
          var _a;
          let q = 0;
          if (b === "preview") {
            const W = (_a = O.current) == null ? void 0 : _a.getElementById(
              S({
                text: n.text,
                level: n.level,
                index: P + 1,
                currentToken: n.currentToken,
                nextToken: n.nextToken
              })
            );
            W instanceof HTMLElement && (q = (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.a)(W, w.current));
          } else if (N) {
            const W = N.lineBlockAt(
              N.state.doc.line(n.line + 1).from
            ).top, ee = N.scrollDOM.scrollTop;
            q = W - ee;
          }
          return q < M && q > o.minTop ? {
            activeHead: n,
            activeIndex: P,
            minTop: q
          } : o;
        },
        {
          activeHead: m[0],
          activeIndex: 0,
          minTop: Number.MIN_SAFE_INTEGER
        }
      );
      let d = T;
      if (E && d.level > E) {
        for (let o = p; o >= 0; o--) {
          const n = m[o];
          if (n.level <= E) {
            d = n;
            break;
          }
        }
        if (d.level > E) {
          const o = m.find((n) => n.level <= E);
          o && (d = o);
        }
      }
      A(d), g(m), l = m;
    }, x = () => {
      h(l);
    }, L = (m) => {
      var _a, _b;
      if ((_a = R.current) == null ? void 0 : _a.removeEventListener("scroll", x), b === "editor")
        R.current = N == null ? void 0 : N.scrollDOM;
      else {
        const T = f();
        w.current = T, R.current = T === document.documentElement ? document : T;
      }
      h(m), (_b = R.current) == null ? void 0 : _b.addEventListener("scroll", x);
    };
    return _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.b.on(e, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.g,
      callback: L
    }), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.P), () => {
      var _a;
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.b.remove(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.g, L), (_a = R.current) == null ? void 0 : _a.removeEventListener("scroll", x);
    };
  }, [
    M,
    S,
    f,
    e,
    b,
    N,
    E
  ]);
  const y = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => ({
    scrollElementRef: w,
    rootNodeRef: O
  }), []);
  return (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const l = (h) => {
      c(h);
    };
    return _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.b.on(e, {
      name: _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.G,
      callback: l
    }), _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.b.emit(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.S), () => {
      _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.b.remove(e, _event_bus_mjs__WEBPACK_IMPORTED_MODULE_3__.G, l);
    };
  }, [e]), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Y.Provider, { value: y, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    "div",
    {
      className: (0,_index2_mjs__WEBPACK_IMPORTED_MODULE_4__.c)([
        `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-catalog`,
        r === "dark" && `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-catalog-dark`,
        t.className || ""
      ]),
      style: t.style,
      ref: C,
      children: s.length > 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-catalog-indicator`, style: v }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-catalog-container`, children: s.map((l) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
          de,
          {
            mdHeadingId: S,
            tocItem: l,
            onActive: k,
            onClick: t.onClick,
            scrollElementOffsetTop: t.scrollElementOffsetTop
          },
          `link-${l.level}-${l.text}`
        )) })
      ] })
    }
  ) });
}, ke = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(he);



/***/ },

/***/ "../../node_modules/md-editor-rt/lib/es/chunks/index4.mjs"
/*!****************************************************************!*\
  !*** ../../node_modules/md-editor-rt/lib/es/chunks/index4.mjs ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   D: () => (/* binding */ J)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _config_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./config.mjs */ "../../node_modules/md-editor-rt/lib/es/chunks/config.mjs");



const x = `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-dropdown-hidden`, F = (n) => {
  const { relative: v = "html", onChange: i, disabled: t } = n, [H, f] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)({
    overlayClass: x,
    overlayStyle: {}
  }), o = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)({
    triggerHover: false,
    overlayHover: false
  }), a = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), d = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null), u = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    var _a, _b;
    if (t)
      return false;
    o.current.triggerHover = true;
    const e = a.current, r = d.current;
    if (!e || !r)
      return;
    const S = e.getBoundingClientRect(), T = e.offsetTop, b = e.offsetLeft, $ = S.height, k = S.width, w = e.getRootNode(), y = ((_a = w.querySelector(v)) == null ? void 0 : _a.scrollLeft) || 0, C = ((_b = w.querySelector(v)) == null ? void 0 : _b.clientWidth) || 0;
    let l = b - r.offsetWidth / 2 + k / 2 - y;
    l + r.offsetWidth > y + C && (l = y + C - r.offsetWidth), l < 0 && (l = 0), f((I) => ({
      ...I,
      overlayStyle: {
        insetBlockStart: T + $ + "px",
        insetInlineStart: l + "px"
      }
    })), i(true);
  }, [t, i, v]), g = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    if (t)
      return false;
    o.current.overlayHover = true;
  }, [t]), L = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(-1), s = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(
    (e) => {
      var _a;
      if (t)
        return false;
      ((_a = a.current) == null ? void 0 : _a.contains(e.target)) ? o.current.triggerHover = false : o.current.overlayHover = false, clearTimeout(L.current), L.current = window.setTimeout(() => {
        !o.current.overlayHover && !o.current.triggerHover && i(false);
      }, 10);
    },
    [t, i]
  ), W = n.children, m = n.overlay, N = (0,react__WEBPACK_IMPORTED_MODULE_1__.cloneElement)(W, {
    ref: a,
    key: "cloned-dropdown-trigger"
  });
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    n.visible ? f((e) => ({
      ...e,
      overlayClass: ""
    })) : f((e) => ({
      ...e,
      overlayClass: x
    }));
  }, [n.visible]), (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    const e = a.current, r = d.current;
    return e == null ? void 0 : e.addEventListener("mouseenter", u), e == null ? void 0 : e.addEventListener("mouseleave", s), r == null ? void 0 : r.addEventListener("mouseenter", g), r == null ? void 0 : r.addEventListener("mouseleave", s), () => {
      e == null ? void 0 : e.removeEventListener("mouseenter", u), e == null ? void 0 : e.removeEventListener("mouseleave", s), r == null ? void 0 : r.removeEventListener("mouseenter", g), r == null ? void 0 : r.removeEventListener("mouseleave", s);
    };
  }, [s, g, u]);
  const R = /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    "div",
    {
      className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-dropdown ${H.overlayClass}`,
      style: H.overlayStyle,
      ref: d,
      children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `${_config_mjs__WEBPACK_IMPORTED_MODULE_2__.p}-dropdown-overlay`, children: m instanceof Array ? m[0] : m })
    }
  );
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
    N,
    R
  ] });
}, J = (0,react__WEBPACK_IMPORTED_MODULE_1__.memo)(F);



/***/ }

}]);