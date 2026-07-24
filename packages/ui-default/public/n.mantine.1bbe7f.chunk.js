!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"d20716eb55585a31549f949f536d330bb1d762d6"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="5c08b09d-72dc-442f-9df1-12c72472850e",e._sentryDebugIdIdentifier="sentry-dbid-5c08b09d-72dc-442f-9df1-12c72472850e");}catch(e){}}();
"use strict";
(self["webpackChunk_hydrooj_ui_default"] = self["webpackChunk_hydrooj_ui_default"] || []).push([["n.mantine"],{

/***/ "../../node_modules/@mantine/core/esm/components/Button/Button.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Button/Button.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Button: () => (/* binding */ Button)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/factory/polymorphic-factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _UnstyledButton_UnstyledButton_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../UnstyledButton/UnstyledButton.mjs */ "../../node_modules/@mantine/core/esm/components/UnstyledButton/UnstyledButton.mjs");
/* harmony import */ var _Transition_Transition_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../Transition/Transition.mjs */ "../../node_modules/@mantine/core/esm/components/Transition/Transition.mjs");
/* harmony import */ var _Loader_Loader_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../Loader/Loader.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/Loader.mjs");
/* harmony import */ var _Button_module_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./Button.module.mjs */ "../../node_modules/@mantine/core/esm/components/Button/Button.module.mjs");
/* harmony import */ var _ButtonGroup_ButtonGroup_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./ButtonGroup/ButtonGroup.mjs */ "../../node_modules/@mantine/core/esm/components/Button/ButtonGroup/ButtonGroup.mjs");
/* harmony import */ var _ButtonGroupSection_ButtonGroupSection_mjs__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./ButtonGroupSection/ButtonGroupSection.mjs */ "../../node_modules/@mantine/core/esm/components/Button/ButtonGroupSection/ButtonGroupSection.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";














const loaderTransition = {
  in: {
    opacity: 1,
    transform: `translate(-50%, calc(-50% + ${(0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)}))`
  },
  out: {
    opacity: 0,
    transform: "translate(-50%, -200%)"
  },
  common: { transformOrigin: "center" },
  transitionProperty: "transform, opacity"
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.createVarsResolver)((theme, { radius, color, gradient, variant, size, justify, autoContrast }) => {
  const colors = theme.variantColorResolver({
    color: color || theme.primaryColor,
    theme,
    gradient,
    variant: variant || "filled",
    autoContrast
  });
  return { root: {
    "--button-justify": justify,
    "--button-height": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getSize)(size, "button-height"),
    "--button-padding-x": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getSize)(size, "button-padding-x"),
    "--button-fz": (size == null ? void 0 : size.includes("compact")) ? (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getFontSize)(size.replace("compact-", "")) : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getFontSize)(size),
    "--button-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getRadius)(radius),
    "--button-bg": color || variant ? colors.background : void 0,
    "--button-hover": color || variant ? colors.hover : void 0,
    "--button-color": colors.color,
    "--button-bd": color || variant ? colors.border : void 0,
    "--button-hover-color": color || variant ? colors.hoverColor : void 0
  } };
});
const Button = (0,_core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_5__.polymorphicFactory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("Button", null, _props);
  const { style, vars, className, color, disabled, children, leftSection, rightSection, fullWidth, variant, radius, loading, loaderProps, gradient, classNames, styles, unstyled, "data-disabled": dataDisabled, autoContrast, mod, attributes, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.useStyles)({
    name: "Button",
    props,
    classes: _Button_module_mjs__WEBPACK_IMPORTED_MODULE_10__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  const hasLeftSection = !!leftSection;
  const hasRightSection = !!rightSection;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsxs)(_UnstyledButton_UnstyledButton_mjs__WEBPACK_IMPORTED_MODULE_7__.UnstyledButton, {
    ...getStyles("root", { active: !disabled && !loading && !dataDisabled }),
    unstyled,
    variant,
    disabled: disabled || loading,
    mod: [{
      disabled: disabled || dataDisabled,
      loading,
      block: fullWidth,
      "with-left-section": hasLeftSection,
      "with-right-section": hasRightSection
    }, mod],
    ...others,
    children: [typeof loading === "boolean" && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_Transition_Transition_mjs__WEBPACK_IMPORTED_MODULE_8__.Transition, {
      mounted: loading,
      transition: loaderTransition,
      duration: 150,
      children: (transitionStyles) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
        component: "span",
        ...getStyles("loader", { style: transitionStyles }),
        "aria-hidden": true,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_Loader_Loader_mjs__WEBPACK_IMPORTED_MODULE_9__.Loader, {
          color: "var(--button-color)",
          size: "calc(var(--button-height) / 1.8)",
          ...loaderProps
        })
      })
    }), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsxs)("span", {
      ...getStyles("inner"),
      children: [
        leftSection && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
          component: "span",
          ...getStyles("section"),
          mod: { position: "left" },
          children: leftSection
        }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
          component: "span",
          mod: { loading },
          ...getStyles("label"),
          children
        }),
        rightSection && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
          component: "span",
          ...getStyles("section"),
          mod: { position: "right" },
          children: rightSection
        })
      ]
    })]
  });
});
Button.classes = _Button_module_mjs__WEBPACK_IMPORTED_MODULE_10__["default"];
Button.varsResolver = varsResolver;
Button.displayName = "@mantine/core/Button";
Button.Group = _ButtonGroup_ButtonGroup_mjs__WEBPACK_IMPORTED_MODULE_11__.ButtonGroup;
Button.GroupSection = _ButtonGroupSection_ButtonGroupSection_mjs__WEBPACK_IMPORTED_MODULE_12__.ButtonGroupSection;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Button/Button.module.mjs"
/*!********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Button/Button.module.mjs ***!
  \********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Button_module_default)
/* harmony export */ });
"use client";
var Button_module_default = {
  "root": "m_77c9d27d",
  "inner": "m_80f1301b",
  "label": "m_811560b9",
  "section": "m_a74036a",
  "loader": "m_a25b86ee",
  "group": "m_80d6d844",
  "groupSection": "m_70be2a01"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Button/ButtonGroup/ButtonGroup.mjs"
/*!******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Button/ButtonGroup/ButtonGroup.mjs ***!
  \******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ButtonGroup: () => (/* binding */ ButtonGroup)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Button_module_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../Button.module.mjs */ "../../node_modules/@mantine/core/esm/components/Button/Button.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";








const defaultProps = { orientation: "horizontal" };
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((_, { borderWidth }) => ({ group: { "--button-border-width": (0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(borderWidth) } }));
const ButtonGroup = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("ButtonGroup", defaultProps, _props);
  const { className, style, classNames, styles, unstyled, orientation, vars, borderWidth, mod, attributes, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("ButtonGroup", defaultProps, _props);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__.Box, {
    ...(0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__.useStyles)({
      name: "ButtonGroup",
      props,
      classes: _Button_module_mjs__WEBPACK_IMPORTED_MODULE_6__["default"],
      className,
      style,
      classNames,
      styles,
      unstyled,
      attributes,
      vars,
      varsResolver,
      rootSelector: "group"
    })("group"),
    mod: [{ "data-orientation": orientation }, mod],
    role: "group",
    ...others
  });
});
ButtonGroup.classes = _Button_module_mjs__WEBPACK_IMPORTED_MODULE_6__["default"];
ButtonGroup.varsResolver = varsResolver;
ButtonGroup.displayName = "@mantine/core/ButtonGroup";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Button/ButtonGroupSection/ButtonGroupSection.mjs"
/*!********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Button/ButtonGroupSection/ButtonGroupSection.mjs ***!
  \********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ButtonGroupSection: () => (/* binding */ ButtonGroupSection)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Button_module_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../Button.module.mjs */ "../../node_modules/@mantine/core/esm/components/Button/Button.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";








const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((theme, { radius, color, gradient, variant, autoContrast, size }) => {
  const colors = theme.variantColorResolver({
    color: color || theme.primaryColor,
    theme,
    gradient,
    variant: variant || "filled",
    autoContrast
  });
  return { groupSection: {
    "--section-height": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "section-height"),
    "--section-padding-x": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "section-padding-x"),
    "--section-fz": (size == null ? void 0 : size.includes("compact")) ? (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getFontSize)(size.replace("compact-", "")) : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getFontSize)(size),
    "--section-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getRadius)(radius),
    "--section-bg": color || variant ? colors.background : void 0,
    "--section-color": colors.color,
    "--section-bd": color || variant ? colors.border : void 0
  } };
});
const ButtonGroupSection = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("ButtonGroupSection", null, _props);
  const { className, style, classNames, styles, unstyled, vars, gradient, radius, autoContrast, attributes, ...others } = props;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__.Box, {
    ...(0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__.useStyles)({
      name: "ButtonGroupSection",
      props,
      classes: _Button_module_mjs__WEBPACK_IMPORTED_MODULE_6__["default"],
      className,
      style,
      classNames,
      styles,
      unstyled,
      attributes,
      vars,
      varsResolver,
      rootSelector: "groupSection"
    })("groupSection"),
    ...others
  });
});
ButtonGroupSection.classes = _Button_module_mjs__WEBPACK_IMPORTED_MODULE_6__["default"];
ButtonGroupSection.varsResolver = varsResolver;
ButtonGroupSection.displayName = "@mantine/core/ButtonGroupSection";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Card/Card.context.mjs"
/*!*****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Card/Card.context.mjs ***!
  \*****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CardProvider: () => (/* binding */ CardProvider),
/* harmony export */   useCardContext: () => (/* binding */ useCardContext)
/* harmony export */ });
/* harmony import */ var _core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/create-safe-context/create-safe-context.mjs */ "../../node_modules/@mantine/core/esm/core/utils/create-safe-context/create-safe-context.mjs");
"use client";

const [CardProvider, useCardContext] = (0,_core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__.createSafeContext)("Card component was not found in tree");



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Card/Card.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Card/Card.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Card: () => (/* binding */ Card)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/factory/polymorphic-factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs");
/* harmony import */ var _Paper_Paper_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../Paper/Paper.mjs */ "../../node_modules/@mantine/core/esm/components/Paper/Paper.mjs");
/* harmony import */ var _Card_context_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./Card.context.mjs */ "../../node_modules/@mantine/core/esm/components/Card/Card.context.mjs");
/* harmony import */ var _Card_module_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./Card.module.mjs */ "../../node_modules/@mantine/core/esm/components/Card/Card.module.mjs");
/* harmony import */ var _CardSection_CardSection_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./CardSection/CardSection.mjs */ "../../node_modules/@mantine/core/esm/components/Card/CardSection/CardSection.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_9__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";











const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((_, { padding }) => ({ root: { "--card-padding": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSpacing)(padding) } }));
const defaultProps = { orientation: "vertical" };
const Card = (0,_core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.polymorphicFactory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("Card", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, vars, children, padding, attributes, orientation, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__.useStyles)({
    name: "Card",
    props,
    classes: _Card_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  const _children = react__WEBPACK_IMPORTED_MODULE_9__.Children.toArray(children);
  const content = _children.map((child, index) => {
    var _a;
    if (typeof child === "object" && child && "type" in child && (child.type === _CardSection_CardSection_mjs__WEBPACK_IMPORTED_MODULE_8__.CardSection || ((_a = child.type) == null ? void 0 : _a.displayName) === "@mantine/core/CardSection")) return (0,react__WEBPACK_IMPORTED_MODULE_9__.cloneElement)(child, {
      "data-orientation": orientation,
      "data-first-section": index === 0 || void 0,
      "data-last-section": index === _children.length - 1 || void 0
    });
    return child;
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)(_Card_context_mjs__WEBPACK_IMPORTED_MODULE_6__.CardProvider, {
    value: { getStyles },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)(_Paper_Paper_mjs__WEBPACK_IMPORTED_MODULE_5__.Paper, {
      unstyled,
      "data-orientation": orientation,
      ...getStyles("root"),
      ...others,
      children: content
    })
  });
});
Card.classes = _Card_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"];
Card.varsResolver = varsResolver;
Card.displayName = "@mantine/core/Card";
Card.Section = _CardSection_CardSection_mjs__WEBPACK_IMPORTED_MODULE_8__.CardSection;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Card/Card.module.mjs"
/*!****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Card/Card.module.mjs ***!
  \****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Card_module_default)
/* harmony export */ });
"use client";
var Card_module_default = {
  "root": "m_e615b15f",
  "section": "m_599a2148"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Card/CardSection/CardSection.mjs"
/*!****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Card/CardSection/CardSection.mjs ***!
  \****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CardSection: () => (/* binding */ CardSection)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/factory/polymorphic-factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Card_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../Card.context.mjs */ "../../node_modules/@mantine/core/esm/components/Card/Card.context.mjs");
/* harmony import */ var _Card_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../Card.module.mjs */ "../../node_modules/@mantine/core/esm/components/Card/Card.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const CardSection = (0,_core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.polymorphicFactory)((_props) => {
  const { classNames, className, style, styles, vars, withBorder, inheritPadding, mod, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("CardSection", null, _props);
  const ctx = (0,_Card_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useCardContext)();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__.Box, {
    mod: [{
      "with-border": withBorder,
      "inherit-padding": inheritPadding
    }, mod],
    ...ctx.getStyles("section", {
      className,
      style,
      styles,
      classNames
    }),
    ...others
  });
});
CardSection.classes = _Card_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
CardSection.displayName = "@mantine/core/CardSection";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/CloseButton/CloseButton.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/CloseButton/CloseButton.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CloseButton: () => (/* binding */ CloseButton)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/factory/polymorphic-factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs");
/* harmony import */ var _UnstyledButton_UnstyledButton_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../UnstyledButton/UnstyledButton.mjs */ "../../node_modules/@mantine/core/esm/components/UnstyledButton/UnstyledButton.mjs");
/* harmony import */ var _CloseIcon_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./CloseIcon.mjs */ "../../node_modules/@mantine/core/esm/components/CloseButton/CloseIcon.mjs");
/* harmony import */ var _CloseButton_module_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./CloseButton.module.mjs */ "../../node_modules/@mantine/core/esm/components/CloseButton/CloseButton.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";










const defaultProps = { variant: "subtle" };
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.createVarsResolver)((_, { size, radius, iconSize }) => ({ root: {
  "--cb-size": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getSize)(size, "cb-size"),
  "--cb-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getRadius)(radius),
  "--cb-icon-size": (0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(iconSize)
} }));
const CloseButton = (0,_core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_5__.polymorphicFactory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("CloseButton", defaultProps, _props);
  const { iconSize, children, vars, radius, className, classNames, style, styles, unstyled, "data-disabled": dataDisabled, disabled, variant, icon, mod, attributes, __staticSelector, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.useStyles)({
    name: __staticSelector || "CloseButton",
    props,
    className,
    style,
    classes: _CloseButton_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"],
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__.jsxs)(_UnstyledButton_UnstyledButton_mjs__WEBPACK_IMPORTED_MODULE_6__.UnstyledButton, {
    ...others,
    unstyled,
    variant,
    disabled,
    mod: [{ disabled: disabled || dataDisabled }, mod],
    ...getStyles("root", {
      variant,
      active: !disabled && !dataDisabled
    }),
    children: [icon || /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__.jsx)(_CloseIcon_mjs__WEBPACK_IMPORTED_MODULE_7__.CloseIcon, {}), children]
  });
});
CloseButton.classes = _CloseButton_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"];
CloseButton.varsResolver = varsResolver;
CloseButton.displayName = "@mantine/core/CloseButton";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/CloseButton/CloseButton.module.mjs"
/*!******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/CloseButton/CloseButton.module.mjs ***!
  \******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ CloseButton_module_default)
/* harmony export */ });
"use client";
var CloseButton_module_default = {
  "root": "m_86a44da5",
  "root--subtle": "m_220c80f2"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/CloseButton/CloseIcon.mjs"
/*!*********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/CloseButton/CloseIcon.mjs ***!
  \*********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CloseIcon: () => (/* binding */ CloseIcon)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";


function CloseIcon({ size = "var(--cb-icon-size, 70%)", style, ...others }) {
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_1__.jsx)("svg", {
    viewBox: "0 0 15 15",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    style: {
      ...style,
      width: size,
      height: size
    },
    ...others,
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_1__.jsx)("path", {
      d: "M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z",
      fill: "currentColor",
      fillRule: "evenodd",
      clipRule: "evenodd"
    })
  });
}
CloseIcon.displayName = "@mantine/core/CloseIcon";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/FloatingIndicator/FloatingIndicator.mjs"
/*!***********************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/FloatingIndicator/FloatingIndicator.mjs ***!
  \***********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   FloatingIndicator: () => (/* binding */ FloatingIndicator)
/* harmony export */ });
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _use_floating_indicator_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./use-floating-indicator.mjs */ "../../node_modules/@mantine/core/esm/components/FloatingIndicator/use-floating-indicator.mjs");
/* harmony import */ var _FloatingIndicator_module_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./FloatingIndicator.module.mjs */ "../../node_modules/@mantine/core/esm/components/FloatingIndicator/FloatingIndicator.module.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_7___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_7__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-reduced-motion/use-reduced-motion.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";










const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_0__.createVarsResolver)((theme, { transitionDuration }, { shouldReduceMotion }) => {
  return { root: { "--transition-duration": (theme.respectReducedMotion ? shouldReduceMotion : false) ? "0ms" : typeof transitionDuration === "number" ? `${transitionDuration}ms` : transitionDuration || "150ms" } };
});
const FloatingIndicator = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_3__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_1__.useProps)("FloatingIndicator", null, _props);
  const { classNames, className, style, styles, unstyled, vars, target, parent, transitionDuration, mod, displayAfterTransitionEnd, onTransitionStart, onTransitionEnd, attributes, ref, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_2__.useStyles)({
    name: "FloatingIndicator",
    classes: _FloatingIndicator_module_mjs__WEBPACK_IMPORTED_MODULE_6__["default"],
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver,
    stylesCtx: { shouldReduceMotion: (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_9__.useReducedMotion)() }
  });
  const innerRef = (0,react__WEBPACK_IMPORTED_MODULE_7__.useRef)(null);
  const { initialized, hidden } = (0,_use_floating_indicator_mjs__WEBPACK_IMPORTED_MODULE_5__.useFloatingIndicator)({
    target,
    parent,
    ref: innerRef,
    displayAfterTransitionEnd,
    onTransitionStart,
    onTransitionEnd
  });
  const mergedRef = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_8__.useMergedRef)(ref, innerRef);
  if (!target || !parent) return null;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_4__.Box, {
    ref: mergedRef,
    mod: [{
      initialized,
      hidden
    }, mod],
    ...getStyles("root"),
    ...others
  });
});
FloatingIndicator.displayName = "@mantine/core/FloatingIndicator";
FloatingIndicator.classes = _FloatingIndicator_module_mjs__WEBPACK_IMPORTED_MODULE_6__["default"];
FloatingIndicator.varsResolver = varsResolver;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/FloatingIndicator/FloatingIndicator.module.mjs"
/*!******************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/FloatingIndicator/FloatingIndicator.module.mjs ***!
  \******************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ FloatingIndicator_module_default)
/* harmony export */ });
"use client";
var FloatingIndicator_module_default = { "root": "m_96b553a6" };



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/FloatingIndicator/use-floating-indicator.mjs"
/*!****************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/FloatingIndicator/use-floating-indicator.mjs ***!
  \****************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useFloatingIndicator: () => (/* binding */ useFloatingIndicator)
/* harmony export */ });
/* harmony import */ var _core_utils_get_env_get_env_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-env/get-env.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-env/get-env.mjs");
/* harmony import */ var _ScrollArea_utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../ScrollArea/utils/to-int.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/to-int.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-timeout/use-timeout.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-mutation-observer/use-mutation-observer.mjs");
"use client";




function isParent(parentElement, childElement) {
  if (!childElement || !parentElement) return false;
  let parent = childElement.parentNode;
  while (parent != null) {
    if (parent === parentElement) return true;
    parent = parent.parentNode;
  }
  return false;
}
function useFloatingIndicator({ target, parent, ref, displayAfterTransitionEnd, onTransitionStart, onTransitionEnd }) {
  const transitionTimeout = (0,react__WEBPACK_IMPORTED_MODULE_2__.useRef)(-1);
  const previousTarget = (0,react__WEBPACK_IMPORTED_MODULE_2__.useRef)(target);
  const [initialized, setInitialized] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(false);
  const [hidden, setHidden] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(typeof displayAfterTransitionEnd === "boolean" ? displayAfterTransitionEnd : false);
  const updatePosition = () => {
    if (!target || !parent || !ref.current) return;
    const targetRect = target.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const targetComputedStyle = window.getComputedStyle(target);
    const parentComputedStyle = window.getComputedStyle(parent);
    const borderTopWidth = (0,_ScrollArea_utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_1__.toInt)(targetComputedStyle.borderTopWidth) + (0,_ScrollArea_utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_1__.toInt)(parentComputedStyle.borderTopWidth);
    const borderLeftWidth = (0,_ScrollArea_utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_1__.toInt)(targetComputedStyle.borderLeftWidth) + (0,_ScrollArea_utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_1__.toInt)(parentComputedStyle.borderLeftWidth);
    const position = {
      top: targetRect.top - parentRect.top - borderTopWidth,
      left: targetRect.left - parentRect.left - borderLeftWidth,
      width: targetRect.width,
      height: targetRect.height
    };
    ref.current.style.transform = `translateY(${position.top}px) translateX(${position.left}px)`;
    ref.current.style.width = `${position.width}px`;
    ref.current.style.height = `${position.height}px`;
  };
  const updatePositionWithoutAnimation = () => {
    window.clearTimeout(transitionTimeout.current);
    if (ref.current) ref.current.style.transitionDuration = "0ms";
    updatePosition();
    transitionTimeout.current = window.setTimeout(() => {
      if (ref.current) ref.current.style.transitionDuration = "";
    }, 30);
  };
  const targetResizeObserver = (0,react__WEBPACK_IMPORTED_MODULE_2__.useRef)(null);
  const parentResizeObserver = (0,react__WEBPACK_IMPORTED_MODULE_2__.useRef)(null);
  (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(() => {
    if (initialized && previousTarget.current !== target && onTransitionStart) onTransitionStart();
    previousTarget.current = target;
    updatePosition();
    if (target) {
      targetResizeObserver.current = new ResizeObserver(updatePositionWithoutAnimation);
      targetResizeObserver.current.observe(target);
      if (parent) {
        parentResizeObserver.current = new ResizeObserver(updatePositionWithoutAnimation);
        parentResizeObserver.current.observe(parent);
      }
      return () => {
        var _a, _b;
        (_a = targetResizeObserver.current) == null ? void 0 : _a.disconnect();
        (_b = parentResizeObserver.current) == null ? void 0 : _b.disconnect();
      };
    }
  }, [parent, target]);
  (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(() => {
    if (parent) {
      const handleTransitionEnd = (event) => {
        if (isParent(event.target, parent)) {
          updatePositionWithoutAnimation();
          setHidden(false);
        }
      };
      parent.addEventListener("transitionend", handleTransitionEnd);
      return () => {
        parent.removeEventListener("transitionend", handleTransitionEnd);
      };
    }
  }, [parent]);
  (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(() => {
    if (ref.current && onTransitionEnd) {
      const handleIndicatorTransitionEnd = (event) => {
        if (event.propertyName === "transform") onTransitionEnd();
      };
      ref.current.addEventListener("transitionend", handleIndicatorTransitionEnd);
      return () => {
        var _a;
        (_a = ref.current) == null ? void 0 : _a.removeEventListener("transitionend", handleIndicatorTransitionEnd);
      };
    }
  }, [onTransitionEnd]);
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_3__.useTimeout)(() => {
    if ((0,_core_utils_get_env_get_env_mjs__WEBPACK_IMPORTED_MODULE_0__.getEnv)() !== "test") setInitialized(true);
  }, 20, { autoInvoke: true });
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_4__.useMutationObserverTarget)((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes" && mutation.attributeName === "dir") updatePositionWithoutAnimation();
    });
  }, {
    attributes: true,
    attributeFilter: ["dir"]
  }, () => document.documentElement);
  return {
    initialized,
    hidden
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/FocusTrap/FocusTrap.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/FocusTrap/FocusTrap.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   FocusTrap: () => (/* binding */ FocusTrap)
/* harmony export */ });
/* unused harmony export FocusTrapInitialFocus */
/* harmony import */ var _core_utils_get_single_element_child_get_single_element_child_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-single-element-child/get-single-element-child.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-single-element-child/get-single-element-child.mjs");
/* harmony import */ var _VisuallyHidden_VisuallyHidden_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../VisuallyHidden/VisuallyHidden.mjs */ "../../node_modules/@mantine/core/esm/components/VisuallyHidden/VisuallyHidden.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-focus-trap/use-focus-trap.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";





function FocusTrap({ children, active = true, refProp = "ref", innerRef }) {
  const ref = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_4__.useMergedRef)((0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_3__.useFocusTrap)(active), innerRef);
  const child = (0,_core_utils_get_single_element_child_get_single_element_child_mjs__WEBPACK_IMPORTED_MODULE_0__.getSingleElementChild)(children);
  if (!child) return children;
  return (0,react__WEBPACK_IMPORTED_MODULE_2__.cloneElement)(child, { [refProp]: ref });
}
function FocusTrapInitialFocus(props) {
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_VisuallyHidden_VisuallyHidden_mjs__WEBPACK_IMPORTED_MODULE_1__.VisuallyHidden, {
    tabIndex: -1,
    "data-autofocus": true,
    ...props
  });
}
FocusTrap.displayName = "@mantine/core/FocusTrap";
FocusTrapInitialFocus.displayName = "@mantine/core/FocusTrapInitialFocus";
FocusTrap.InitialFocus = FocusTrapInitialFocus;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Group/Group.mjs"
/*!***********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Group/Group.mjs ***!
  \***********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Group: () => (/* binding */ Group)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _filter_falsy_children_filter_falsy_children_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./filter-falsy-children/filter-falsy-children.mjs */ "../../node_modules/@mantine/core/esm/components/Group/filter-falsy-children/filter-falsy-children.mjs");
/* harmony import */ var _Group_module_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./Group.module.mjs */ "../../node_modules/@mantine/core/esm/components/Group/Group.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";









const defaultProps = {
  preventGrowOverflow: true,
  gap: "md",
  align: "center",
  justify: "flex-start",
  wrap: "wrap"
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((_, { grow, preventGrowOverflow, gap, align, justify, wrap }, { childWidth }) => ({ root: {
  "--group-child-width": grow && preventGrowOverflow ? childWidth : void 0,
  "--group-gap": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSpacing)(gap),
  "--group-align": align,
  "--group-justify": justify,
  "--group-wrap": wrap
} }));
const Group = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("Group", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, children, gap, align, justify, wrap, grow, preventGrowOverflow, vars, variant, __size, mod, attributes, ...others } = props;
  const filteredChildren = (0,_filter_falsy_children_filter_falsy_children_mjs__WEBPACK_IMPORTED_MODULE_6__.filterFalsyChildren)(children);
  const childrenCount = filteredChildren.length;
  const resolvedGap = (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSpacing)(gap != null ? gap : "md");
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__.Box, {
    ...(0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__.useStyles)({
      name: "Group",
      props,
      stylesCtx: { childWidth: `calc(${100 / childrenCount}% - (${resolvedGap} - ${resolvedGap} / ${childrenCount}))` },
      className,
      style,
      classes: _Group_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"],
      classNames,
      styles,
      unstyled,
      attributes,
      vars,
      varsResolver
    })("root"),
    variant,
    mod: [{ grow }, mod],
    size: __size,
    ...others,
    children: filteredChildren
  });
});
Group.classes = _Group_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"];
Group.varsResolver = varsResolver;
Group.displayName = "@mantine/core/Group";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Group/Group.module.mjs"
/*!******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Group/Group.module.mjs ***!
  \******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Group_module_default)
/* harmony export */ });
"use client";
var Group_module_default = { "root": "m_4081bf90" };



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Group/filter-falsy-children/filter-falsy-children.mjs"
/*!*************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Group/filter-falsy-children/filter-falsy-children.mjs ***!
  \*************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   filterFalsyChildren: () => (/* binding */ filterFalsyChildren)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function filterFalsyChildren(children) {
  return react__WEBPACK_IMPORTED_MODULE_0__.Children.toArray(children).filter(Boolean);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/Input.context.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/Input.context.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputContext: () => (/* binding */ InputContext)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

const InputContext = (0,react__WEBPACK_IMPORTED_MODULE_0__.createContext)({ size: "sm" });



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/Input.mjs"
/*!***********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/Input.mjs ***!
  \***********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Input: () => (/* binding */ Input)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_Box_style_props_extract_style_props_extract_style_props_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/Box/style-props/extract-style-props/extract-style-props.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/extract-style-props/extract-style-props.mjs");
/* harmony import */ var _core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/factory/polymorphic-factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Loader_Loader_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../Loader/Loader.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/Loader.mjs");
/* harmony import */ var _Input_context_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./Input.context.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.context.mjs");
/* harmony import */ var _InputClearButton_InputClearButton_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./InputClearButton/InputClearButton.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputClearButton/InputClearButton.mjs");
/* harmony import */ var _InputClearSection_InputClearSection_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./InputClearSection/InputClearSection.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputClearSection/InputClearSection.mjs");
/* harmony import */ var _InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./InputWrapper.context.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper.context.mjs");
/* harmony import */ var _Input_module_mjs__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! ./Input.module.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.module.mjs");
/* harmony import */ var _InputDescription_InputDescription_mjs__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! ./InputDescription/InputDescription.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputDescription/InputDescription.mjs");
/* harmony import */ var _InputError_InputError_mjs__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! ./InputError/InputError.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputError/InputError.mjs");
/* harmony import */ var _InputLabel_InputLabel_mjs__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! ./InputLabel/InputLabel.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputLabel/InputLabel.mjs");
/* harmony import */ var _InputPlaceholder_InputPlaceholder_mjs__WEBPACK_IMPORTED_MODULE_17__ = __webpack_require__(/*! ./InputPlaceholder/InputPlaceholder.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputPlaceholder/InputPlaceholder.mjs");
/* harmony import */ var _InputWrapper_InputWrapper_mjs__WEBPACK_IMPORTED_MODULE_18__ = __webpack_require__(/*! ./InputWrapper/InputWrapper.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper/InputWrapper.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_19__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_19___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_19__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";





















const defaultProps = {
  variant: "default",
  leftSectionPointerEvents: "none",
  rightSectionPointerEvents: "none",
  withAria: true,
  withErrorStyles: true,
  size: "sm",
  loading: false,
  loadingPosition: "right"
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.createVarsResolver)((_, props, ctx) => ({ wrapper: {
  "--input-margin-top": ctx.offsetTop ? "calc(var(--mantine-spacing-xs) / 2)" : void 0,
  "--input-margin-bottom": ctx.offsetBottom ? "calc(var(--mantine-spacing-xs) / 2)" : void 0,
  "--input-height": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getSize)(props.size, "input-height"),
  "--input-fz": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getFontSize)(props.size),
  "--input-radius": props.radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getRadius)(props.radius),
  "--input-left-section-width": props.leftSectionWidth !== void 0 ? (0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(props.leftSectionWidth) : void 0,
  "--input-right-section-width": props.rightSectionWidth !== void 0 ? (0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(props.rightSectionWidth) : void 0,
  "--input-padding-y": props.multiline ? (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getSize)(props.size, "input-padding-y") : void 0,
  "--input-left-section-pointer-events": props.leftSectionPointerEvents,
  "--input-right-section-pointer-events": props.rightSectionPointerEvents
} }));
const Input = (0,_core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_6__.polymorphicFactory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("Input", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, required, __staticSelector, __stylesApiProps, size, wrapperProps, error, disabled, leftSection, leftSectionProps, leftSectionWidth, rightSection, rightSectionProps, rightSectionWidth, rightSectionPointerEvents, leftSectionPointerEvents, variant, vars, pointer, multiline, radius, id, withAria, withErrorStyles, mod, inputSize, attributes, __clearSection, __clearable, __clearSectionMode, __defaultRightSection, loading, loadingPosition, rootRef, ...others } = props;
  const { styleProps, rest } = (0,_core_Box_style_props_extract_style_props_extract_style_props_mjs__WEBPACK_IMPORTED_MODULE_5__.extractStyleProps)(others);
  const ctx = (0,react__WEBPACK_IMPORTED_MODULE_19__.use)(_InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_12__.InputWrapperContext);
  const stylesCtx = {
    offsetBottom: ctx == null ? void 0 : ctx.offsetBottom,
    offsetTop: ctx == null ? void 0 : ctx.offsetTop
  };
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.useStyles)({
    name: ["Input", __staticSelector],
    props: __stylesApiProps || props,
    classes: _Input_module_mjs__WEBPACK_IMPORTED_MODULE_13__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    stylesCtx,
    rootSelector: "wrapper",
    vars,
    varsResolver
  });
  const ariaAttributes = withAria ? {
    required,
    disabled,
    "aria-invalid": error ? true : void 0,
    "aria-describedby": ctx == null ? void 0 : ctx.describedBy,
    id: (ctx == null ? void 0 : ctx.inputId) || id
  } : {};
  const loadingIndicator = loading ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsx)(_Loader_Loader_mjs__WEBPACK_IMPORTED_MODULE_8__.Loader, { size: loadingPosition === "left" ? "calc(var(--input-left-section-size) / 2)" : "calc(var(--input-right-section-size) / 2)" }) : null;
  const _leftSection = loading && loadingPosition === "left" ? loadingIndicator : leftSection;
  const _rightSection = (0,_InputClearSection_InputClearSection_mjs__WEBPACK_IMPORTED_MODULE_11__.InputClearSection)({
    __clearable,
    __clearSection,
    rightSection: loading && loadingPosition === "right" ? loadingIndicator : rightSection,
    __defaultRightSection,
    size,
    __clearSectionMode
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsx)(_Input_context_mjs__WEBPACK_IMPORTED_MODULE_9__.InputContext, {
    value: { size: size || "sm" },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsxs)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_7__.Box, {
      ref: rootRef,
      ...getStyles("wrapper"),
      ...styleProps,
      ...wrapperProps,
      mod: [{
        error: !!error && withErrorStyles,
        pointer,
        disabled,
        multiline,
        "data-with-right-section": !!_rightSection,
        "data-with-left-section": !!_leftSection
      }, mod],
      variant,
      size,
      children: [
        _leftSection && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsx)("div", {
          ...leftSectionProps,
          "data-position": "left",
          ...getStyles("section", {
            className: leftSectionProps == null ? void 0 : leftSectionProps.className,
            style: leftSectionProps == null ? void 0 : leftSectionProps.style
          }),
          children: _leftSection
        }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_7__.Box, {
          component: "input",
          ...rest,
          ...ariaAttributes,
          required,
          mod: {
            disabled,
            error: !!error && withErrorStyles
          },
          variant,
          __size: inputSize,
          ...getStyles("input")
        }),
        _rightSection && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsx)("div", {
          ...rightSectionProps,
          "data-position": "right",
          ...getStyles("section", {
            className: rightSectionProps == null ? void 0 : rightSectionProps.className,
            style: rightSectionProps == null ? void 0 : rightSectionProps.style
          }),
          children: _rightSection
        })
      ]
    })
  });
});
Input.classes = _Input_module_mjs__WEBPACK_IMPORTED_MODULE_13__["default"];
Input.varsResolver = varsResolver;
Input.Wrapper = _InputWrapper_InputWrapper_mjs__WEBPACK_IMPORTED_MODULE_18__.InputWrapper;
Input.Label = _InputLabel_InputLabel_mjs__WEBPACK_IMPORTED_MODULE_16__.InputLabel;
Input.Error = _InputError_InputError_mjs__WEBPACK_IMPORTED_MODULE_15__.InputError;
Input.Description = _InputDescription_InputDescription_mjs__WEBPACK_IMPORTED_MODULE_14__.InputDescription;
Input.Placeholder = _InputPlaceholder_InputPlaceholder_mjs__WEBPACK_IMPORTED_MODULE_17__.InputPlaceholder;
Input.ClearButton = _InputClearButton_InputClearButton_mjs__WEBPACK_IMPORTED_MODULE_10__.InputClearButton;
Input.displayName = "@mantine/core/Input";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/Input.module.mjs"
/*!******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/Input.module.mjs ***!
  \******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Input_module_default)
/* harmony export */ });
"use client";
var Input_module_default = {
  "wrapper": "m_6c018570",
  "input": "m_8fb7ebe7",
  "section": "m_82577fc2",
  "placeholder": "m_88bacfd0",
  "root": "m_46b77525",
  "label": "m_8fdc1311",
  "required": "m_78a94662",
  "error": "m_8f816625",
  "description": "m_fe47ce59"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/InputClearButton/InputClearButton.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/InputClearButton/InputClearButton.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputClearButton: () => (/* binding */ InputClearButton)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_resolved_styles_api_use_resolved_styles_api_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/styles-api/use-resolved-styles-api/use-resolved-styles-api.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-resolved-styles-api/use-resolved-styles-api.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _CloseButton_CloseButton_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../CloseButton/CloseButton.mjs */ "../../node_modules/@mantine/core/esm/components/CloseButton/CloseButton.mjs");
/* harmony import */ var _Input_context_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../Input.context.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.context.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";







const InputClearButton = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("InputClearButton", null, _props);
  const { size, variant, vars, classNames, styles, ...others } = props;
  const ctx = (0,react__WEBPACK_IMPORTED_MODULE_5__.use)(_Input_context_mjs__WEBPACK_IMPORTED_MODULE_4__.InputContext);
  const { resolvedClassNames, resolvedStyles } = (0,_core_styles_api_use_resolved_styles_api_use_resolved_styles_api_mjs__WEBPACK_IMPORTED_MODULE_1__.useResolvedStylesApi)({
    classNames,
    styles,
    props
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_CloseButton_CloseButton_mjs__WEBPACK_IMPORTED_MODULE_3__.CloseButton, {
    variant: variant || "transparent",
    size: size || (ctx == null ? void 0 : ctx.size) || "sm",
    classNames: resolvedClassNames,
    styles: resolvedStyles,
    __staticSelector: "InputClearButton",
    style: {
      pointerEvents: "all",
      background: "var(--input-bg)",
      ...others.style
    },
    ...others
  });
});
InputClearButton.displayName = "@mantine/core/InputClearButton";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/InputClearSection/InputClearSection.mjs"
/*!*****************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/InputClearSection/InputClearSection.mjs ***!
  \*****************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputClearSection: () => (/* binding */ InputClearSection)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";

const clearSectionOffset = {
  xs: 7,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 15
};
function InputClearSection({ __clearable, __clearSection, rightSection, __defaultRightSection, size = "sm", __clearSectionMode = "both" }) {
  const clearSection = __clearable && __clearSection;
  if (__clearSectionMode === "rightSection") return rightSection === null ? null : rightSection || __defaultRightSection;
  if (__clearSectionMode === "clear") return rightSection === null ? null : clearSection || __defaultRightSection;
  if (clearSection && (rightSection || __defaultRightSection)) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", {
    "data-combined-clear-section": true,
    style: {
      display: "flex",
      gap: 2,
      alignItems: "center",
      paddingInlineEnd: clearSectionOffset[size]
    },
    children: [clearSection, rightSection || __defaultRightSection]
  });
  return rightSection === null ? null : rightSection || clearSection || __defaultRightSection;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/InputDescription/InputDescription.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/InputDescription/InputDescription.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputDescription: () => (/* binding */ InputDescription)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../InputWrapper.context.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper.context.mjs");
/* harmony import */ var _Input_module_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../Input.module.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.module.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_9__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";











const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.createVarsResolver)((_, { size }) => ({ description: { "--input-description-size": size === void 0 ? void 0 : `calc(${(0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getFontSize)(size)} - ${(0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(2)})` } }));
const InputDescription = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("InputDescription", null, _props);
  const { classNames, className, style, styles, unstyled, vars, __staticSelector, __inheritStyles = true, attributes, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("InputDescription", null, props);
  const ctx = (0,react__WEBPACK_IMPORTED_MODULE_9__.use)(_InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_7__.InputWrapperContext);
  const _getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.useStyles)({
    name: ["InputWrapper", __staticSelector],
    props,
    classes: _Input_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    rootSelector: "description",
    vars,
    varsResolver
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
    component: "p",
    ...(__inheritStyles && (ctx == null ? void 0 : ctx.getStyles) || _getStyles)("description", (ctx == null ? void 0 : ctx.getStyles) ? {
      className,
      style
    } : void 0),
    ...others
  });
});
InputDescription.classes = _Input_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"];
InputDescription.varsResolver = varsResolver;
InputDescription.displayName = "@mantine/core/InputDescription";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/InputError/InputError.mjs"
/*!***************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/InputError/InputError.mjs ***!
  \***************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputError: () => (/* binding */ InputError)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../InputWrapper.context.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper.context.mjs");
/* harmony import */ var _Input_module_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../Input.module.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.module.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_9__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";











const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.createVarsResolver)((_, { size }) => ({ error: { "--input-error-size": size === void 0 ? void 0 : `calc(${(0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getFontSize)(size)} - ${(0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(2)})` } }));
const InputError = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("InputError", null, _props);
  const { classNames, className, style, styles, unstyled, vars, attributes, __staticSelector, __inheritStyles = true, ...others } = props;
  const _getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.useStyles)({
    name: ["InputWrapper", __staticSelector],
    props,
    classes: _Input_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    rootSelector: "error",
    vars,
    varsResolver
  });
  const ctx = (0,react__WEBPACK_IMPORTED_MODULE_9__.use)(_InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_7__.InputWrapperContext);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
    component: "p",
    ...(__inheritStyles && (ctx == null ? void 0 : ctx.getStyles) || _getStyles)("error", (ctx == null ? void 0 : ctx.getStyles) ? {
      className,
      style
    } : void 0),
    ...others
  });
});
InputError.classes = _Input_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"];
InputError.varsResolver = varsResolver;
InputError.displayName = "@mantine/core/InputError";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/InputLabel/InputLabel.mjs"
/*!***************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/InputLabel/InputLabel.mjs ***!
  \***************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputLabel: () => (/* binding */ InputLabel)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../InputWrapper.context.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper.context.mjs");
/* harmony import */ var _Input_module_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../Input.module.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.module.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_8___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_8__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";










const defaultProps = { labelElement: "label" };
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((_, { size }) => ({ label: {
  "--input-label-size": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getFontSize)(size),
  "--input-asterisk-color": void 0
} }));
const InputLabel = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("InputLabel", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, vars, labelElement, required, htmlFor, onMouseDown, children, __staticSelector, mod, attributes, ...others } = props;
  const _getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__.useStyles)({
    name: ["InputWrapper", __staticSelector],
    props,
    classes: _Input_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    rootSelector: "label",
    vars,
    varsResolver
  });
  const ctx = (0,react__WEBPACK_IMPORTED_MODULE_8__.use)(_InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_6__.InputWrapperContext);
  const getStyles = (ctx == null ? void 0 : ctx.getStyles) || _getStyles;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__.jsxs)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__.Box, {
    ...getStyles("label", (ctx == null ? void 0 : ctx.getStyles) ? {
      className,
      style
    } : void 0),
    component: labelElement,
    htmlFor: labelElement === "label" ? htmlFor : void 0,
    mod: [{ required }, mod],
    onMouseDown: (event) => {
      onMouseDown == null ? void 0 : onMouseDown(event);
      if (!event.defaultPrevented && event.detail > 1) event.preventDefault();
    },
    ...others,
    children: [children, required && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__.jsx)("span", {
      ...getStyles("required"),
      "aria-hidden": true,
      children: " *"
    })]
  });
});
InputLabel.classes = _Input_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"];
InputLabel.varsResolver = varsResolver;
InputLabel.displayName = "@mantine/core/InputLabel";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/InputPlaceholder/InputPlaceholder.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/InputPlaceholder/InputPlaceholder.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputPlaceholder: () => (/* binding */ InputPlaceholder)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Input_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../Input.module.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const InputPlaceholder = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("InputPlaceholder", null, _props);
  const { classNames, className, style, styles, unstyled, vars, __staticSelector, error, mod, attributes, ...others } = props;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_3__.Box, {
    ...(0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_1__.useStyles)({
      name: ["InputPlaceholder", __staticSelector],
      props,
      classes: _Input_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"],
      className,
      style,
      classNames,
      styles,
      unstyled,
      attributes,
      rootSelector: "placeholder"
    })("placeholder"),
    mod: [{ error: !!error }, mod],
    component: "span",
    ...others
  });
});
InputPlaceholder.classes = _Input_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
InputPlaceholder.displayName = "@mantine/core/InputPlaceholder";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper.context.mjs"
/*!**************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/InputWrapper.context.mjs ***!
  \**************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputWrapperContext: () => (/* binding */ InputWrapperContext)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

const InputWrapperContext = (0,react__WEBPACK_IMPORTED_MODULE_0__.createContext)({
  offsetBottom: false,
  offsetTop: false,
  describedBy: void 0,
  getStyles: null,
  inputId: void 0,
  labelId: void 0
});



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper/InputWrapper.mjs"
/*!*******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/InputWrapper/InputWrapper.mjs ***!
  \*******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputWrapper: () => (/* binding */ InputWrapper)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../InputWrapper.context.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper.context.mjs");
/* harmony import */ var _Input_module_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../Input.module.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.module.mjs");
/* harmony import */ var _InputDescription_InputDescription_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../InputDescription/InputDescription.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputDescription/InputDescription.mjs");
/* harmony import */ var _InputError_InputError_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ../InputError/InputError.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputError/InputError.mjs");
/* harmony import */ var _InputLabel_InputLabel_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ../InputLabel/InputLabel.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputLabel/InputLabel.mjs");
/* harmony import */ var _get_input_offsets_get_input_offsets_mjs__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./get-input-offsets/get-input-offsets.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper/get-input-offsets/get-input-offsets.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_13___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_13__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-id/use-id.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";
















const defaultProps = {
  labelElement: "label",
  inputContainer: (children) => children,
  inputWrapperOrder: [
    "label",
    "description",
    "input",
    "error"
  ]
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.createVarsResolver)((_, { size }) => ({
  label: {
    "--input-label-size": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getFontSize)(size),
    "--input-asterisk-color": void 0
  },
  error: { "--input-error-size": size === void 0 ? void 0 : `calc(${(0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getFontSize)(size)} - ${(0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(2)})` },
  description: { "--input-description-size": size === void 0 ? void 0 : `calc(${(0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getFontSize)(size)} - ${(0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(2)})` }
}));
const InputWrapper = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("InputWrapper", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, vars, size, variant, __staticSelector, inputContainer, inputWrapperOrder, label, error, description, labelProps, descriptionProps, errorProps, labelElement, children, withAsterisk, id, required, __stylesApiProps, mod, attributes, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.useStyles)({
    name: ["InputWrapper", __staticSelector],
    props: __stylesApiProps || props,
    classes: _Input_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  const sharedProps = {
    size,
    variant,
    __staticSelector
  };
  const idBase = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_14__.useId)(id);
  const isRequired = typeof withAsterisk === "boolean" ? withAsterisk : required;
  const errorId = (errorProps == null ? void 0 : errorProps.id) || `${idBase}-error`;
  const descriptionId = (descriptionProps == null ? void 0 : descriptionProps.id) || `${idBase}-description`;
  const inputId = idBase;
  const hasError = !!error && typeof error !== "boolean";
  const hasDescription = !!description;
  const _describedBy = `${hasError ? errorId : ""} ${hasDescription ? descriptionId : ""}`;
  const describedBy = _describedBy.trim().length > 0 ? _describedBy.trim() : void 0;
  const labelId = (labelProps == null ? void 0 : labelProps.id) || `${idBase}-label`;
  const _label = label && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_InputLabel_InputLabel_mjs__WEBPACK_IMPORTED_MODULE_11__.InputLabel, {
    labelElement,
    id: labelId,
    htmlFor: inputId,
    required: isRequired,
    ...sharedProps,
    ...labelProps,
    children: label
  }, "label");
  const _description = hasDescription && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_InputDescription_InputDescription_mjs__WEBPACK_IMPORTED_MODULE_9__.InputDescription, {
    ...descriptionProps,
    ...sharedProps,
    size: (descriptionProps == null ? void 0 : descriptionProps.size) || sharedProps.size,
    id: (descriptionProps == null ? void 0 : descriptionProps.id) || descriptionId,
    children: description
  }, "description");
  const _input = /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(react__WEBPACK_IMPORTED_MODULE_13__.Fragment, { children: inputContainer(children) }, "input");
  const _error = hasError && /* @__PURE__ */ (0,react__WEBPACK_IMPORTED_MODULE_13__.createElement)(_InputError_InputError_mjs__WEBPACK_IMPORTED_MODULE_10__.InputError, {
    ...errorProps,
    ...sharedProps,
    size: (errorProps == null ? void 0 : errorProps.size) || sharedProps.size,
    key: "error",
    id: (errorProps == null ? void 0 : errorProps.id) || errorId
  }, error);
  const content = inputWrapperOrder.map((part) => {
    switch (part) {
      case "label":
        return _label;
      case "input":
        return _input;
      case "description":
        return _description;
      case "error":
        return _error;
      default:
        return null;
    }
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_7__.InputWrapperContext, {
    value: {
      getStyles,
      describedBy,
      inputId,
      labelId,
      ...(0,_get_input_offsets_get_input_offsets_mjs__WEBPACK_IMPORTED_MODULE_12__.getInputOffsets)(inputWrapperOrder, {
        hasDescription,
        hasError
      })
    },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
      variant,
      size,
      mod: [{ error: !!error }, mod],
      id: labelElement === "label" ? void 0 : id,
      ...getStyles("root"),
      ...others,
      children: content
    })
  });
});
InputWrapper.classes = _Input_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"];
InputWrapper.varsResolver = varsResolver;
InputWrapper.displayName = "@mantine/core/InputWrapper";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper/get-input-offsets/get-input-offsets.mjs"
/*!******************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/InputWrapper/get-input-offsets/get-input-offsets.mjs ***!
  \******************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getInputOffsets: () => (/* binding */ getInputOffsets)
/* harmony export */ });
"use client";
function getInputOffsets(inputWrapperOrder, { hasDescription, hasError }) {
  const inputIndex = inputWrapperOrder.findIndex((part) => part === "input");
  const aboveInput = inputWrapperOrder.slice(0, inputIndex);
  const belowInput = inputWrapperOrder.slice(inputIndex + 1);
  const offsetTop = hasDescription && aboveInput.includes("description") || hasError && aboveInput.includes("error");
  return {
    offsetBottom: hasDescription && belowInput.includes("description") || hasError && belowInput.includes("error"),
    offsetTop
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Input/use-input-props.mjs"
/*!*********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Input/use-input-props.mjs ***!
  \*********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useInputProps: () => (/* binding */ useInputProps)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_Box_style_props_extract_style_props_extract_style_props_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/Box/style-props/extract-style-props/extract-style-props.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/extract-style-props/extract-style-props.mjs");
"use client";


function useInputProps(component, defaultProps, _props) {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)(component, defaultProps, _props);
  const { label, description, error, required, classNames, styles, className, unstyled, __staticSelector, __stylesApiProps, errorProps, labelProps, descriptionProps, wrapperProps: _wrapperProps, id, size, style, inputContainer, inputWrapperOrder, withAsterisk, variant, vars, mod, attributes, ...others } = props;
  const { styleProps, rest } = (0,_core_Box_style_props_extract_style_props_extract_style_props_mjs__WEBPACK_IMPORTED_MODULE_1__.extractStyleProps)(others);
  const wrapperProps = {
    label,
    description,
    error,
    required,
    classNames,
    className,
    __staticSelector,
    __stylesApiProps: __stylesApiProps || props,
    errorProps,
    labelProps,
    descriptionProps,
    unstyled,
    styles,
    size,
    style,
    inputContainer,
    inputWrapperOrder,
    withAsterisk,
    variant,
    id,
    mod,
    attributes,
    ..._wrapperProps
  };
  return {
    ...rest,
    classNames,
    styles,
    unstyled,
    wrapperProps: {
      ...wrapperProps,
      ...styleProps
    },
    inputProps: {
      required,
      classNames,
      styles,
      unstyled,
      size,
      __staticSelector,
      __stylesApiProps: __stylesApiProps || props,
      error,
      variant,
      id,
      attributes
    }
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/InputBase/InputBase.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/InputBase/InputBase.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputBase: () => (/* binding */ InputBase)
/* harmony export */ });
/* harmony import */ var _core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/factory/polymorphic-factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs");
/* harmony import */ var _Input_Input_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../Input/Input.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.mjs");
/* harmony import */ var _Input_use_input_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../Input/use-input-props.mjs */ "../../node_modules/@mantine/core/esm/components/Input/use-input-props.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




const defaultProps = {
  __staticSelector: "InputBase",
  withAria: true,
  size: "sm"
};
const InputBase = (0,_core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_0__.polymorphicFactory)((props) => {
  const { inputProps, wrapperProps, ...others } = (0,_Input_use_input_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useInputProps)("InputBase", defaultProps, props);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(_Input_Input_mjs__WEBPACK_IMPORTED_MODULE_1__.Input.Wrapper, {
    ...wrapperProps,
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(_Input_Input_mjs__WEBPACK_IMPORTED_MODULE_1__.Input, {
      ...inputProps,
      ...others
    })
  });
});
InputBase.classes = {
  ..._Input_Input_mjs__WEBPACK_IMPORTED_MODULE_1__.Input.classes,
  ..._Input_Input_mjs__WEBPACK_IMPORTED_MODULE_1__.Input.Wrapper.classes
};
InputBase.displayName = "@mantine/core/InputBase";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Loader/Loader.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Loader/Loader.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Loader: () => (/* binding */ Loader)
/* harmony export */ });
/* unused harmony export defaultLoaders */
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./Loader.module.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/Loader.module.mjs");
/* harmony import */ var _loaders_Bars_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./loaders/Bars.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/loaders/Bars.mjs");
/* harmony import */ var _loaders_Dots_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./loaders/Dots.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/loaders/Dots.mjs");
/* harmony import */ var _loaders_Oval_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./loaders/Oval.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/loaders/Oval.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";












const defaultLoaders = {
  bars: _loaders_Bars_mjs__WEBPACK_IMPORTED_MODULE_8__.Bars,
  oval: _loaders_Oval_mjs__WEBPACK_IMPORTED_MODULE_10__.Oval,
  dots: _loaders_Dots_mjs__WEBPACK_IMPORTED_MODULE_9__.Dots
};
const defaultProps = {
  loaders: defaultLoaders,
  type: "oval"
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((theme, { size, color }) => ({ root: {
  "--loader-size": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "loader-size"),
  "--loader-color": color ? (0,_core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_2__.getThemeColor)(color, theme) : void 0
} }));
const Loader = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("Loader", defaultProps, _props);
  const { size, color, type, vars, className, style, classNames, styles, unstyled, loaders, variant, children, attributes, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.useStyles)({
    name: "Loader",
    props,
    classes: _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  if (children) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_11__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
    ...getStyles("root"),
    ...others,
    children
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_11__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
    ...getStyles("root"),
    component: loaders[type],
    variant,
    size,
    ...others
  });
});
Loader.defaultLoaders = defaultLoaders;
Loader.classes = _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"];
Loader.varsResolver = varsResolver;
Loader.displayName = "@mantine/core/Loader";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Loader/Loader.module.mjs"
/*!********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Loader/Loader.module.mjs ***!
  \********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Loader_module_default)
/* harmony export */ });
"use client";
var Loader_module_default = {
  "root": "m_5ae2e3c",
  "barsLoader": "m_7a2bd4cd",
  "bar": "m_870bb79",
  "bars-loader-animation": "m_5d2b3b9d",
  "dotsLoader": "m_4e3f22d7",
  "dot": "m_870c4af",
  "loader-dots-animation": "m_aac34a1",
  "ovalLoader": "m_b34414df",
  "oval-loader-animation": "m_f8e89c4b"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Loader/loaders/Bars.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Loader/loaders/Bars.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Bars: () => (/* binding */ Bars)
/* harmony export */ });
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../Loader.module.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/Loader.module.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




const Bars = ({ className, ...others }) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsxs)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__.Box, {
  component: "span",
  className: (0,clsx__WEBPACK_IMPORTED_MODULE_2__["default"])(_Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__["default"].barsLoader, className),
  ...others,
  children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)("span", { className: _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__["default"].bar }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)("span", { className: _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__["default"].bar }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)("span", { className: _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__["default"].bar })
  ]
});
Bars.displayName = "@mantine/core/Bars";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Loader/loaders/Dots.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Loader/loaders/Dots.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Dots: () => (/* binding */ Dots)
/* harmony export */ });
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../Loader.module.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/Loader.module.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




const Dots = ({ className, ...others }) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsxs)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__.Box, {
  component: "span",
  className: (0,clsx__WEBPACK_IMPORTED_MODULE_2__["default"])(_Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__["default"].dotsLoader, className),
  ...others,
  children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)("span", { className: _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__["default"].dot }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)("span", { className: _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__["default"].dot }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)("span", { className: _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__["default"].dot })
  ]
});
Dots.displayName = "@mantine/core/Dots";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Loader/loaders/Oval.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Loader/loaders/Oval.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Oval: () => (/* binding */ Oval)
/* harmony export */ });
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../Loader.module.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/Loader.module.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




const Oval = ({ className, ...others }) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__.Box, {
  component: "span",
  className: (0,clsx__WEBPACK_IMPORTED_MODULE_2__["default"])(_Loader_module_mjs__WEBPACK_IMPORTED_MODULE_1__["default"].ovalLoader, className),
  ...others
});
Oval.displayName = "@mantine/core/Oval";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/Modal.context.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/Modal.context.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalProvider: () => (/* binding */ ModalProvider),
/* harmony export */   useModalContext: () => (/* binding */ useModalContext)
/* harmony export */ });
/* harmony import */ var _core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/create-safe-context/create-safe-context.mjs */ "../../node_modules/@mantine/core/esm/core/utils/create-safe-context/create-safe-context.mjs");
"use client";

const [ModalProvider, useModalContext] = (0,_core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__.createSafeContext)("Modal component was not found in tree");



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/Modal.mjs"
/*!***********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/Modal.mjs ***!
  \***********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Modal: () => (/* binding */ Modal)
/* harmony export */ });
/* harmony import */ var _core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-default-z-index/get-default-z-index.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-default-z-index/get-default-z-index.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Modal.module.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.module.mjs");
/* harmony import */ var _ModalBody_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./ModalBody.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/ModalBody.mjs");
/* harmony import */ var _ModalCloseButton_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./ModalCloseButton.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/ModalCloseButton.mjs");
/* harmony import */ var _ModalContent_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./ModalContent.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/ModalContent.mjs");
/* harmony import */ var _ModalHeader_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./ModalHeader.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/ModalHeader.mjs");
/* harmony import */ var _ModalOverlay_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./ModalOverlay.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/ModalOverlay.mjs");
/* harmony import */ var _ModalRoot_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./ModalRoot.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/ModalRoot.mjs");
/* harmony import */ var _ModalStack_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./ModalStack.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/ModalStack.mjs");
/* harmony import */ var _ModalTitle_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./ModalTitle.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/ModalTitle.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_12___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_12__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";














const defaultProps = {
  closeOnClickOutside: true,
  withinPortal: true,
  lockScroll: true,
  trapFocus: true,
  returnFocus: true,
  closeOnEscape: true,
  keepMounted: false,
  zIndex: (0,_core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_0__.getDefaultZIndex)("modal"),
  transitionProps: {
    duration: 200,
    transition: "fade-down"
  },
  withOverlay: true,
  withCloseButton: true
};
const Modal = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__.factory)((_props) => {
  const { title, withOverlay, overlayProps, withCloseButton, closeButtonProps, children, radius, opened, stackId, zIndex, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_1__.useProps)("Modal", defaultProps, _props);
  const ctx = (0,react__WEBPACK_IMPORTED_MODULE_12__.use)(_ModalStack_mjs__WEBPACK_IMPORTED_MODULE_10__.ModalStackContext);
  const hasHeader = !!title || withCloseButton;
  const stackProps = ctx && stackId ? {
    closeOnEscape: ctx.currentId === stackId,
    trapFocus: ctx.currentId === stackId,
    zIndex: ctx.getZIndex(stackId)
  } : {};
  const overlayVisible = withOverlay === false ? false : stackId && ctx ? ctx.currentId === stackId : opened;
  (0,react__WEBPACK_IMPORTED_MODULE_12__.useEffect)(() => {
    if (ctx && stackId) opened ? ctx.addModal(stackId, zIndex || (0,_core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_0__.getDefaultZIndex)("modal")) : ctx.removeModal(stackId);
  }, [
    opened,
    stackId,
    zIndex
  ]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsxs)(_ModalRoot_mjs__WEBPACK_IMPORTED_MODULE_9__.ModalRoot, {
    radius,
    opened,
    zIndex: ctx && stackId ? ctx.getZIndex(stackId) : zIndex,
    ...others,
    ...stackProps,
    children: [withOverlay && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_ModalOverlay_mjs__WEBPACK_IMPORTED_MODULE_8__.ModalOverlay, {
      visible: overlayVisible,
      transitionProps: ctx && stackId ? { duration: 0 } : void 0,
      ...overlayProps
    }), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsxs)(_ModalContent_mjs__WEBPACK_IMPORTED_MODULE_6__.ModalContent, {
      radius,
      __hidden: ctx && stackId && opened ? stackId !== ctx.currentId : false,
      children: [hasHeader && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsxs)(_ModalHeader_mjs__WEBPACK_IMPORTED_MODULE_7__.ModalHeader, { children: [title && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_ModalTitle_mjs__WEBPACK_IMPORTED_MODULE_11__.ModalTitle, { children: title }), withCloseButton && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_ModalCloseButton_mjs__WEBPACK_IMPORTED_MODULE_5__.ModalCloseButton, { ...closeButtonProps })] }), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_ModalBody_mjs__WEBPACK_IMPORTED_MODULE_4__.ModalBody, { children })]
    })]
  });
});
Modal.classes = _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_3__["default"];
Modal.displayName = "@mantine/core/Modal";
Modal.Root = _ModalRoot_mjs__WEBPACK_IMPORTED_MODULE_9__.ModalRoot;
Modal.Overlay = _ModalOverlay_mjs__WEBPACK_IMPORTED_MODULE_8__.ModalOverlay;
Modal.Content = _ModalContent_mjs__WEBPACK_IMPORTED_MODULE_6__.ModalContent;
Modal.Body = _ModalBody_mjs__WEBPACK_IMPORTED_MODULE_4__.ModalBody;
Modal.Header = _ModalHeader_mjs__WEBPACK_IMPORTED_MODULE_7__.ModalHeader;
Modal.Title = _ModalTitle_mjs__WEBPACK_IMPORTED_MODULE_11__.ModalTitle;
Modal.CloseButton = _ModalCloseButton_mjs__WEBPACK_IMPORTED_MODULE_5__.ModalCloseButton;
Modal.Stack = _ModalStack_mjs__WEBPACK_IMPORTED_MODULE_10__.ModalStack;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/Modal.module.mjs"
/*!******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/Modal.module.mjs ***!
  \******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Modal_module_default)
/* harmony export */ });
"use client";
var Modal_module_default = {
  "root": "m_9df02822",
  "content": "m_54c44539",
  "inner": "m_1f958f16",
  "header": "m_d0e2b9cd"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/ModalBody.mjs"
/*!***************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/ModalBody.mjs ***!
  \***************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalBody: () => (/* binding */ ModalBody)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _ModalBase_ModalBaseBody_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../ModalBase/ModalBaseBody.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseBody.mjs");
/* harmony import */ var _Modal_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Modal.context.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.context.mjs");
/* harmony import */ var _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./Modal.module.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const ModalBody = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.factory)((_props) => {
  const { classNames, className, style, styles, vars, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("ModalBody", null, _props);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_ModalBase_ModalBaseBody_mjs__WEBPACK_IMPORTED_MODULE_2__.ModalBaseBody, {
    ...(0,_Modal_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useModalContext)().getStyles("body", {
      classNames,
      style,
      styles,
      className
    }),
    ...others
  });
});
ModalBody.classes = _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
ModalBody.displayName = "@mantine/core/ModalBody";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/ModalCloseButton.mjs"
/*!**********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/ModalCloseButton.mjs ***!
  \**********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalCloseButton: () => (/* binding */ ModalCloseButton)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _ModalBase_ModalBaseCloseButton_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../ModalBase/ModalBaseCloseButton.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseCloseButton.mjs");
/* harmony import */ var _Modal_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Modal.context.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.context.mjs");
/* harmony import */ var _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./Modal.module.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const ModalCloseButton = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.factory)((_props) => {
  const { classNames, className, style, styles, vars, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("ModalCloseButton", null, _props);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_ModalBase_ModalBaseCloseButton_mjs__WEBPACK_IMPORTED_MODULE_2__.ModalBaseCloseButton, {
    ...(0,_Modal_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useModalContext)().getStyles("close", {
      classNames,
      style,
      styles,
      className
    }),
    ...others
  });
});
ModalCloseButton.classes = _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
ModalCloseButton.displayName = "@mantine/core/ModalCloseButton";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/ModalContent.mjs"
/*!******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/ModalContent.mjs ***!
  \******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalContent: () => (/* binding */ ModalContent)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _ModalBase_ModalBaseContent_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../ModalBase/ModalBaseContent.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseContent.mjs");
/* harmony import */ var _ModalBase_NativeScrollArea_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../ModalBase/NativeScrollArea.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/NativeScrollArea.mjs");
/* harmony import */ var _Modal_context_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./Modal.context.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.context.mjs");
/* harmony import */ var _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./Modal.module.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";








const ModalContent = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__.factory)((_props) => {
  const { classNames, className, style, styles, vars, children, __hidden, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_1__.useProps)("ModalContent", null, _props);
  const ctx = (0,_Modal_context_mjs__WEBPACK_IMPORTED_MODULE_5__.useModalContext)();
  const Scroll = ctx.scrollAreaComponent || _ModalBase_NativeScrollArea_mjs__WEBPACK_IMPORTED_MODULE_4__.NativeScrollArea;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_ModalBase_ModalBaseContent_mjs__WEBPACK_IMPORTED_MODULE_3__.ModalBaseContent, {
    ...ctx.getStyles("content", {
      className,
      style,
      styles,
      classNames
    }),
    innerProps: ctx.getStyles("inner", {
      className,
      style,
      styles,
      classNames
    }),
    "data-full-screen": ctx.fullScreen || void 0,
    "data-modal-content": true,
    "data-hidden": __hidden || void 0,
    ...others,
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(Scroll, {
      style: { maxHeight: ctx.fullScreen ? "100dvh" : `calc(100dvh - (${(0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(ctx.yOffset)} * 2))` },
      children
    })
  });
});
ModalContent.classes = _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_6__["default"];
ModalContent.displayName = "@mantine/core/ModalContent";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/ModalHeader.mjs"
/*!*****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/ModalHeader.mjs ***!
  \*****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalHeader: () => (/* binding */ ModalHeader)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _ModalBase_ModalBaseHeader_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../ModalBase/ModalBaseHeader.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseHeader.mjs");
/* harmony import */ var _Modal_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Modal.context.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.context.mjs");
/* harmony import */ var _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./Modal.module.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const ModalHeader = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.factory)((_props) => {
  const { classNames, className, style, styles, vars, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("ModalHeader", null, _props);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_ModalBase_ModalBaseHeader_mjs__WEBPACK_IMPORTED_MODULE_2__.ModalBaseHeader, {
    ...(0,_Modal_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useModalContext)().getStyles("header", {
      classNames,
      style,
      styles,
      className
    }),
    ...others
  });
});
ModalHeader.classes = _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
ModalHeader.displayName = "@mantine/core/ModalHeader";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/ModalOverlay.mjs"
/*!******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/ModalOverlay.mjs ***!
  \******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalOverlay: () => (/* binding */ ModalOverlay)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _ModalBase_ModalBaseOverlay_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../ModalBase/ModalBaseOverlay.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseOverlay.mjs");
/* harmony import */ var _Modal_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Modal.context.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.context.mjs");
/* harmony import */ var _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./Modal.module.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const ModalOverlay = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.factory)((_props) => {
  const { classNames, className, style, styles, vars, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("ModalOverlay", null, _props);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_ModalBase_ModalBaseOverlay_mjs__WEBPACK_IMPORTED_MODULE_2__.ModalBaseOverlay, {
    ...(0,_Modal_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useModalContext)().getStyles("overlay", {
      classNames,
      style,
      styles,
      className
    }),
    ...others
  });
});
ModalOverlay.classes = _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
ModalOverlay.displayName = "@mantine/core/ModalOverlay";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/ModalRoot.mjs"
/*!***************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/ModalRoot.mjs ***!
  \***************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalRoot: () => (/* binding */ ModalRoot)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/utils/get-default-z-index/get-default-z-index.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-default-z-index/get-default-z-index.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _ScrollArea_ScrollArea_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../ScrollArea/ScrollArea.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.mjs");
/* harmony import */ var _ModalBase_ModalBase_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../ModalBase/ModalBase.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.mjs");
/* harmony import */ var _Modal_context_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./Modal.context.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.context.mjs");
/* harmony import */ var _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./Modal.module.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";












const defaultProps = {
  __staticSelector: "Modal",
  closeOnClickOutside: true,
  withinPortal: true,
  lockScroll: true,
  trapFocus: true,
  returnFocus: true,
  closeOnEscape: true,
  keepMounted: false,
  zIndex: (0,_core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_1__.getDefaultZIndex)("modal"),
  transitionProps: {
    duration: 200,
    transition: "fade-down"
  },
  yOffset: "5dvh"
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_3__.createVarsResolver)((_, { radius, size, yOffset, xOffset }) => ({ root: {
  "--modal-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_2__.getRadius)(radius),
  "--modal-size": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_2__.getSize)(size, "modal-size"),
  "--modal-y-offset": (0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(yOffset),
  "--modal-x-offset": (0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(xOffset)
} }));
const ModalRoot = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_6__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_4__.useProps)("ModalRoot", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, vars, yOffset, scrollAreaComponent, radius, fullScreen, centered, xOffset, __staticSelector, attributes, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_5__.useStyles)({
    name: __staticSelector,
    classes: _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_10__["default"],
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_11__.jsx)(_Modal_context_mjs__WEBPACK_IMPORTED_MODULE_9__.ModalProvider, {
    value: {
      yOffset,
      scrollAreaComponent,
      getStyles,
      fullScreen
    },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_11__.jsx)(_ModalBase_ModalBase_mjs__WEBPACK_IMPORTED_MODULE_8__.ModalBase, {
      ...getStyles("root"),
      "data-full-screen": fullScreen || void 0,
      "data-centered": centered || void 0,
      "data-offset-scrollbars": scrollAreaComponent === _ScrollArea_ScrollArea_mjs__WEBPACK_IMPORTED_MODULE_7__.ScrollArea.Autosize || void 0,
      unstyled,
      ...others
    })
  });
});
ModalRoot.classes = _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_10__["default"];
ModalRoot.varsResolver = varsResolver;
ModalRoot.displayName = "@mantine/core/ModalRoot";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/ModalStack.mjs"
/*!****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/ModalStack.mjs ***!
  \****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalStack: () => (/* binding */ ModalStack),
/* harmony export */   ModalStackContext: () => (/* binding */ ModalStackContext)
/* harmony export */ });
/* harmony import */ var _core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-default-z-index/get-default-z-index.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-default-z-index/get-default-z-index.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";



const ModalStackContext = (0,react__WEBPACK_IMPORTED_MODULE_1__.createContext)(null);
function ModalStack({ children }) {
  const [stack, setStack] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)([]);
  const [maxZIndex, setMaxZIndex] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)((0,_core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_0__.getDefaultZIndex)("modal"));
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(ModalStackContext, {
    value: {
      stack,
      addModal: (id, zIndex) => {
        setStack((current) => [.../* @__PURE__ */ new Set([...current, id])]);
        setMaxZIndex((current) => typeof zIndex === "number" && typeof current === "number" ? Math.max(current, zIndex) : current);
      },
      removeModal: (id) => setStack((current) => current.filter((currentId) => currentId !== id)),
      getZIndex: (id) => `calc(${maxZIndex} + ${stack.indexOf(id)} + 1)`,
      currentId: stack[stack.length - 1],
      maxZIndex
    },
    children
  });
}
ModalStack.displayName = "@mantine/core/ModalStack";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Modal/ModalTitle.mjs"
/*!****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Modal/ModalTitle.mjs ***!
  \****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalTitle: () => (/* binding */ ModalTitle)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _ModalBase_ModalBaseTitle_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../ModalBase/ModalBaseTitle.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseTitle.mjs");
/* harmony import */ var _Modal_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Modal.context.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.context.mjs");
/* harmony import */ var _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./Modal.module.mjs */ "../../node_modules/@mantine/core/esm/components/Modal/Modal.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const ModalTitle = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.factory)((_props) => {
  const { classNames, className, style, styles, vars, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("ModalTitle", null, _props);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_ModalBase_ModalBaseTitle_mjs__WEBPACK_IMPORTED_MODULE_2__.ModalBaseTitle, {
    ...(0,_Modal_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useModalContext)().getStyles("title", {
      classNames,
      style,
      styles,
      className
    }),
    ...others
  });
});
ModalTitle.classes = _Modal_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
ModalTitle.displayName = "@mantine/core/ModalTitle";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs"
/*!***************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs ***!
  \***************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalBaseProvider: () => (/* binding */ ModalBaseProvider),
/* harmony export */   useModalBaseContext: () => (/* binding */ useModalBaseContext)
/* harmony export */ });
/* harmony import */ var _core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/create-safe-context/create-safe-context.mjs */ "../../node_modules/@mantine/core/esm/core/utils/create-safe-context/create-safe-context.mjs");
"use client";

const [ModalBaseProvider, useModalBaseContext] = (0,_core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__.createSafeContext)("ModalBase component was not found in tree");



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalBase: () => (/* binding */ ModalBase)
/* harmony export */ });
/* harmony import */ var _core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-default-z-index/get-default-z-index.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-default-z-index/get-default-z-index.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Portal_OptionalPortal_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../Portal/OptionalPortal.mjs */ "../../node_modules/@mantine/core/esm/components/Portal/OptionalPortal.mjs");
/* harmony import */ var _ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./ModalBase.context.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs");
/* harmony import */ var _use_modal_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./use-modal.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/use-modal.mjs");
/* harmony import */ var react_remove_scroll__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react-remove-scroll */ "../../node_modules/react-remove-scroll/dist/es2015/Combination.js");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";








function ModalBase({ keepMounted, opened, onClose, id, transitionProps, onExitTransitionEnd, onEnterTransitionEnd, trapFocus, closeOnEscape, returnFocus, closeOnClickOutside, withinPortal, portalProps, lockScroll, children, zIndex, shadow, padding, __vars, unstyled, removeScrollProps, ...others }) {
  const { _id, titleMounted, bodyMounted, shouldLockScroll, setTitleMounted, setBodyMounted } = (0,_use_modal_mjs__WEBPACK_IMPORTED_MODULE_5__.useModal)({
    id,
    transitionProps,
    opened,
    trapFocus,
    closeOnEscape,
    onClose,
    returnFocus
  });
  const { key: removeScrollKey, ...otherRemoveScrollProps } = removeScrollProps || {};
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_Portal_OptionalPortal_mjs__WEBPACK_IMPORTED_MODULE_3__.OptionalPortal, {
    ...portalProps,
    withinPortal,
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_4__.ModalBaseProvider, {
      value: {
        opened,
        onClose,
        closeOnClickOutside,
        onExitTransitionEnd,
        onEnterTransitionEnd,
        transitionProps: {
          ...transitionProps,
          keepMounted
        },
        getTitleId: () => `${_id}-title`,
        getBodyId: () => `${_id}-body`,
        titleMounted,
        bodyMounted,
        setTitleMounted,
        setBodyMounted,
        trapFocus,
        closeOnEscape,
        zIndex,
        unstyled
      },
      children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(react_remove_scroll__WEBPACK_IMPORTED_MODULE_6__["default"], {
        enabled: shouldLockScroll && lockScroll,
        ...otherRemoveScrollProps,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__.Box, {
          ...others,
          id: _id,
          __vars: {
            ...__vars,
            "--mb-z-index": (zIndex || (0,_core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_0__.getDefaultZIndex)("modal")).toString(),
            "--mb-shadow": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getShadow)(shadow),
            "--mb-padding": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getSpacing)(padding)
          },
          children
        })
      }, removeScrollKey)
    })
  });
}
ModalBase.displayName = "@mantine/core/ModalBase";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.module.mjs"
/*!**************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.module.mjs ***!
  \**************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ ModalBase_module_default)
/* harmony export */ });
"use client";
var ModalBase_module_default = {
  "title": "m_615af6c9",
  "header": "m_b5489c3c",
  "inner": "m_60c222c7",
  "content": "m_fd1ab0aa",
  "close": "m_606cb269",
  "body": "m_5df29311"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseBody.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseBody.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalBaseBody: () => (/* binding */ ModalBaseBody)
/* harmony export */ });
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ModalBase.context.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs");
/* harmony import */ var _use_modal_body_id_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./use-modal-body-id.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/use-modal-body-id.mjs");
/* harmony import */ var _ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./ModalBase.module.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.module.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






function ModalBaseBody({ className, ...others }) {
  const bodyId = (0,_use_modal_body_id_mjs__WEBPACK_IMPORTED_MODULE_2__.useModalBodyId)();
  const ctx = (0,_ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_1__.useModalBaseContext)();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__.Box, {
    id: bodyId,
    className: (0,clsx__WEBPACK_IMPORTED_MODULE_4__["default"])({ [_ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_3__["default"].body]: !ctx.unstyled }, className),
    ...others
  });
}
ModalBaseBody.displayName = "@mantine/core/ModalBaseBody";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseCloseButton.mjs"
/*!******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseCloseButton.mjs ***!
  \******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalBaseCloseButton: () => (/* binding */ ModalBaseCloseButton)
/* harmony export */ });
/* harmony import */ var _CloseButton_CloseButton_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../CloseButton/CloseButton.mjs */ "../../node_modules/@mantine/core/esm/components/CloseButton/CloseButton.mjs");
/* harmony import */ var _ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ModalBase.context.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs");
/* harmony import */ var _ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./ModalBase.module.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.module.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";





function ModalBaseCloseButton({ className, onClick, ...others }) {
  const ctx = (0,_ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_1__.useModalBaseContext)();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.jsx)(_CloseButton_CloseButton_mjs__WEBPACK_IMPORTED_MODULE_0__.CloseButton, {
    ...others,
    onClick: (event) => {
      ctx.onClose();
      onClick == null ? void 0 : onClick(event);
    },
    className: (0,clsx__WEBPACK_IMPORTED_MODULE_3__["default"])({ [_ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_2__["default"].close]: !ctx.unstyled }, className),
    unstyled: ctx.unstyled
  });
}
ModalBaseCloseButton.displayName = "@mantine/core/ModalBaseCloseButton";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseContent.mjs"
/*!**************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseContent.mjs ***!
  \**************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalBaseContent: () => (/* binding */ ModalBaseContent)
/* harmony export */ });
/* harmony import */ var _Paper_Paper_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../Paper/Paper.mjs */ "../../node_modules/@mantine/core/esm/components/Paper/Paper.mjs");
/* harmony import */ var _Transition_Transition_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../Transition/Transition.mjs */ "../../node_modules/@mantine/core/esm/components/Transition/Transition.mjs");
/* harmony import */ var _FocusTrap_FocusTrap_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../FocusTrap/FocusTrap.mjs */ "../../node_modules/@mantine/core/esm/components/FocusTrap/FocusTrap.mjs");
/* harmony import */ var _ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./ModalBase.context.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs");
/* harmony import */ var _ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./ModalBase.module.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.module.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";







function ModalBaseContent({ transitionProps, className, innerProps, onKeyDown, style, ref, ...others }) {
  const ctx = (0,_ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useModalBaseContext)();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_Transition_Transition_mjs__WEBPACK_IMPORTED_MODULE_1__.Transition, {
    mounted: ctx.opened,
    transition: "pop",
    ...ctx.transitionProps,
    onExited: () => {
      var _a, _b, _c;
      (_a = ctx.onExitTransitionEnd) == null ? void 0 : _a.call(ctx);
      (_c = (_b = ctx.transitionProps) == null ? void 0 : _b.onExited) == null ? void 0 : _c.call(_b);
    },
    onEntered: () => {
      var _a, _b, _c;
      (_a = ctx.onEnterTransitionEnd) == null ? void 0 : _a.call(ctx);
      (_c = (_b = ctx.transitionProps) == null ? void 0 : _b.onEntered) == null ? void 0 : _c.call(_b);
    },
    ...transitionProps,
    children: (transitionStyles) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)("div", {
      ...innerProps,
      className: (0,clsx__WEBPACK_IMPORTED_MODULE_5__["default"])({ [_ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"].inner]: !ctx.unstyled }, innerProps.className),
      children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_FocusTrap_FocusTrap_mjs__WEBPACK_IMPORTED_MODULE_2__.FocusTrap, {
        active: ctx.opened && ctx.trapFocus,
        innerRef: ref,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_Paper_Paper_mjs__WEBPACK_IMPORTED_MODULE_0__.Paper, {
          ...others,
          component: "section",
          role: "dialog",
          tabIndex: -1,
          "aria-modal": true,
          "aria-describedby": ctx.bodyMounted ? ctx.getBodyId() : void 0,
          "aria-labelledby": ctx.titleMounted ? ctx.getTitleId() : void 0,
          style: [style, transitionStyles],
          className: (0,clsx__WEBPACK_IMPORTED_MODULE_5__["default"])({ [_ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"].content]: !ctx.unstyled }, className),
          unstyled: ctx.unstyled,
          children: others.children
        })
      })
    })
  });
}
ModalBaseContent.displayName = "@mantine/core/ModalBaseContent";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseHeader.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseHeader.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalBaseHeader: () => (/* binding */ ModalBaseHeader)
/* harmony export */ });
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ModalBase.context.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs");
/* harmony import */ var _ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./ModalBase.module.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.module.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";





function ModalBaseHeader({ className, ...others }) {
  const ctx = (0,_ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_1__.useModalBaseContext)();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__.Box, {
    component: "header",
    className: (0,clsx__WEBPACK_IMPORTED_MODULE_3__["default"])({ [_ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_2__["default"].header]: !ctx.unstyled }, className),
    ...others
  });
}
ModalBaseHeader.displayName = "@mantine/core/ModalBaseHeader";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseOverlay.mjs"
/*!**************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseOverlay.mjs ***!
  \**************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalBaseOverlay: () => (/* binding */ ModalBaseOverlay)
/* harmony export */ });
/* harmony import */ var _Overlay_Overlay_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../Overlay/Overlay.mjs */ "../../node_modules/@mantine/core/esm/components/Overlay/Overlay.mjs");
/* harmony import */ var _Transition_Transition_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../Transition/Transition.mjs */ "../../node_modules/@mantine/core/esm/components/Transition/Transition.mjs");
/* harmony import */ var _ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./ModalBase.context.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs");
/* harmony import */ var _use_modal_transition_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./use-modal-transition.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/use-modal-transition.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";





function ModalBaseOverlay({ onClick, transitionProps, style, visible, ...others }) {
  const ctx = (0,_ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_2__.useModalBaseContext)();
  const transition = (0,_use_modal_transition_mjs__WEBPACK_IMPORTED_MODULE_3__.useModalTransition)(transitionProps);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.jsx)(_Transition_Transition_mjs__WEBPACK_IMPORTED_MODULE_1__.Transition, {
    mounted: visible !== void 0 ? visible : ctx.opened,
    ...transition,
    transition: "fade",
    children: (transitionStyles) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.jsx)(_Overlay_Overlay_mjs__WEBPACK_IMPORTED_MODULE_0__.Overlay, {
      fixed: true,
      style: [style, transitionStyles],
      zIndex: ctx.zIndex,
      unstyled: ctx.unstyled,
      onClick: (event) => {
        onClick == null ? void 0 : onClick(event);
        ctx.closeOnClickOutside && ctx.onClose();
      },
      ...others
    })
  });
}
ModalBaseOverlay.displayName = "@mantine/core/ModalBaseOverlay";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseTitle.mjs"
/*!************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/ModalBaseTitle.mjs ***!
  \************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ModalBaseTitle: () => (/* binding */ ModalBaseTitle)
/* harmony export */ });
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ModalBase.context.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs");
/* harmony import */ var _ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./ModalBase.module.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.module.mjs");
/* harmony import */ var _use_modal_title_id_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./use-modal-title-id.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/use-modal-title-id.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






function ModalBaseTitle({ className, ...others }) {
  const id = (0,_use_modal_title_id_mjs__WEBPACK_IMPORTED_MODULE_3__.useModalTitle)();
  const ctx = (0,_ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_1__.useModalBaseContext)();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__.Box, {
    component: "h2",
    className: (0,clsx__WEBPACK_IMPORTED_MODULE_4__["default"])({ [_ModalBase_module_mjs__WEBPACK_IMPORTED_MODULE_2__["default"].title]: !ctx.unstyled }, className),
    id,
    ...others
  });
}
ModalBaseTitle.displayName = "@mantine/core/ModalBaseTitle";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/NativeScrollArea.mjs"
/*!**************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/NativeScrollArea.mjs ***!
  \**************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   NativeScrollArea: () => (/* binding */ NativeScrollArea)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";

function NativeScrollArea({ children }) {
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children });
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/use-lock-scroll.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/use-lock-scroll.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useLockScroll: () => (/* binding */ useLockScroll)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-reduced-motion/use-reduced-motion.mjs");
"use client";


function useLockScroll({ opened, transitionDuration }) {
  const [shouldLockScroll, setShouldLockScroll] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(opened);
  const timeout = (0,react__WEBPACK_IMPORTED_MODULE_0__.useRef)(-1);
  const _transitionDuration = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_1__.useReducedMotion)() ? 0 : transitionDuration;
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
    if (opened) {
      setShouldLockScroll(true);
      window.clearTimeout(timeout.current);
    } else if (_transitionDuration === 0) setShouldLockScroll(false);
    else timeout.current = window.setTimeout(() => setShouldLockScroll(false), _transitionDuration);
    return () => window.clearTimeout(timeout.current);
  }, [opened, _transitionDuration]);
  return shouldLockScroll;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/use-modal-body-id.mjs"
/*!***************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/use-modal-body-id.mjs ***!
  \***************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useModalBodyId: () => (/* binding */ useModalBodyId)
/* harmony export */ });
/* harmony import */ var _ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ModalBase.context.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
"use client";


function useModalBodyId() {
  const ctx = (0,_ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useModalBaseContext)();
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    ctx.setBodyMounted(true);
    return () => ctx.setBodyMounted(false);
  }, []);
  return ctx.getBodyId();
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/use-modal-title-id.mjs"
/*!****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/use-modal-title-id.mjs ***!
  \****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useModalTitle: () => (/* binding */ useModalTitle)
/* harmony export */ });
/* harmony import */ var _ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ModalBase.context.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
"use client";


function useModalTitle() {
  const ctx = (0,_ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useModalBaseContext)();
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    ctx.setTitleMounted(true);
    return () => ctx.setTitleMounted(false);
  }, []);
  return ctx.getTitleId();
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/use-modal-transition.mjs"
/*!******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/use-modal-transition.mjs ***!
  \******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useModalTransition: () => (/* binding */ useModalTransition)
/* harmony export */ });
/* harmony import */ var _ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ModalBase.context.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/ModalBase.context.mjs");
"use client";

const DEFAULT_TRANSITION = {
  duration: 200,
  timingFunction: "ease",
  transition: "fade"
};
function useModalTransition(transitionOverride) {
  const ctx = (0,_ModalBase_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useModalBaseContext)();
  return {
    ...DEFAULT_TRANSITION,
    ...ctx.transitionProps,
    ...transitionOverride
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ModalBase/use-modal.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ModalBase/use-modal.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useModal: () => (/* binding */ useModal)
/* harmony export */ });
/* harmony import */ var _use_lock_scroll_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./use-lock-scroll.mjs */ "../../node_modules/@mantine/core/esm/components/ModalBase/use-lock-scroll.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-focus-return/use-focus-return.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-id/use-id.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-window-event/use-window-event.mjs");
"use client";



function useModal({ id, transitionProps, opened, trapFocus, closeOnEscape, onClose, returnFocus }) {
  const _id = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_3__.useId)(id);
  const [titleMounted, setTitleMounted] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false);
  const [bodyMounted, setBodyMounted] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false);
  const shouldLockScroll = (0,_use_lock_scroll_mjs__WEBPACK_IMPORTED_MODULE_0__.useLockScroll)({
    opened,
    transitionDuration: typeof (transitionProps == null ? void 0 : transitionProps.duration) === "number" ? transitionProps == null ? void 0 : transitionProps.duration : 200
  });
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_4__.useWindowEvent)("keydown", (event) => {
    var _a;
    if (event.key === "Escape" && closeOnEscape && !event.isComposing && opened) ((_a = event.target) == null ? void 0 : _a.getAttribute("data-mantine-stop-propagation")) !== "true" && onClose();
  }, { capture: true });
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_2__.useFocusReturn)({
    opened,
    shouldReturnFocus: trapFocus && returnFocus
  });
  return {
    _id,
    titleMounted,
    bodyMounted,
    shouldLockScroll,
    setTitleMounted,
    setBodyMounted
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Notification/Notification.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Notification/Notification.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Notification: () => (/* binding */ Notification)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Loader_Loader_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../Loader/Loader.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/Loader.mjs");
/* harmony import */ var _CloseButton_CloseButton_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../CloseButton/CloseButton.mjs */ "../../node_modules/@mantine/core/esm/components/CloseButton/CloseButton.mjs");
/* harmony import */ var _Notification_module_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./Notification.module.mjs */ "../../node_modules/@mantine/core/esm/components/Notification/Notification.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";











const defaultProps = { withCloseButton: true };
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((theme, { radius, color }) => ({ root: {
  "--notification-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getRadius)(radius),
  "--notification-color": color ? (0,_core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_2__.getThemeColor)(color, theme) : void 0
} }));
const Notification = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("Notification", defaultProps, _props);
  const { className, color, radius, loading, withCloseButton, withBorder, title, icon, children, onClose, closeButtonProps, classNames, style, styles, unstyled, vars, mod, loaderProps, role, attributes, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.useStyles)({
    name: "Notification",
    classes: _Notification_module_mjs__WEBPACK_IMPORTED_MODULE_9__["default"],
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsxs)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
    ...getStyles("root"),
    mod: [{
      "data-with-icon": !!icon || loading,
      "data-with-border": withBorder
    }, mod],
    role: role || "alert",
    ...others,
    children: [
      icon && !loading && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)("div", {
        ...getStyles("icon"),
        children: icon
      }),
      loading && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)(_Loader_Loader_mjs__WEBPACK_IMPORTED_MODULE_7__.Loader, {
        size: 28,
        color,
        ...getStyles("loader"),
        ...loaderProps
      }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsxs)("div", {
        ...getStyles("body"),
        children: [title && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)("div", {
          ...getStyles("title"),
          children: title
        }), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
          ...getStyles("description"),
          mod: { "data-with-title": !!title },
          children
        })]
      }),
      withCloseButton && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)(_CloseButton_CloseButton_mjs__WEBPACK_IMPORTED_MODULE_8__.CloseButton, {
        iconSize: 16,
        color: "gray",
        ...closeButtonProps,
        unstyled,
        onClick: (event) => {
          var _a;
          (_a = closeButtonProps == null ? void 0 : closeButtonProps.onClick) == null ? void 0 : _a.call(closeButtonProps, event);
          onClose == null ? void 0 : onClose();
        },
        ...getStyles("closeButton")
      })
    ]
  });
});
Notification.classes = _Notification_module_mjs__WEBPACK_IMPORTED_MODULE_9__["default"];
Notification.varsResolver = varsResolver;
Notification.displayName = "@mantine/core/Notification";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Notification/Notification.module.mjs"
/*!********************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Notification/Notification.module.mjs ***!
  \********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Notification_module_default)
/* harmony export */ });
"use client";
var Notification_module_default = {
  "root": "m_a513464",
  "icon": "m_a4ceffb",
  "loader": "m_b0920b15",
  "body": "m_a49ed24",
  "title": "m_3feedf16",
  "description": "m_3d733a3a",
  "closeButton": "m_919a4d88"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Overlay/Overlay.mjs"
/*!***************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Overlay/Overlay.mjs ***!
  \***************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Overlay: () => (/* binding */ Overlay)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/utils/get-default-z-index/get-default-z-index.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-default-z-index/get-default-z-index.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/MantineProvider/color-functions/rgba/rgba.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/rgba/rgba.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../../core/factory/polymorphic-factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Overlay_module_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./Overlay.module.mjs */ "../../node_modules/@mantine/core/esm/components/Overlay/Overlay.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";











const defaultProps = { zIndex: (0,_core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_1__.getDefaultZIndex)("modal") };
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_3__.createVarsResolver)((_, { gradient, color, backgroundOpacity, blur, radius, zIndex }) => ({ root: {
  "--overlay-bg": gradient || (color !== void 0 || backgroundOpacity !== void 0) && (0,_core_MantineProvider_color_functions_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_4__.rgba)(color || "#000", backgroundOpacity != null ? backgroundOpacity : 0.6) || void 0,
  "--overlay-filter": blur ? `blur(${(0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(blur)})` : void 0,
  "--overlay-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_2__.getRadius)(radius),
  "--overlay-z-index": zIndex == null ? void 0 : zIndex.toString()
} }));
const Overlay = (0,_core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_7__.polymorphicFactory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_5__.useProps)("Overlay", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, vars, fixed, center, children, radius, zIndex, gradient, blur, color, backgroundOpacity, mod, attributes, ...others } = props;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_10__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_8__.Box, {
    ...(0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_6__.useStyles)({
      name: "Overlay",
      props,
      classes: _Overlay_module_mjs__WEBPACK_IMPORTED_MODULE_9__["default"],
      className,
      style,
      classNames,
      styles,
      unstyled,
      attributes,
      vars,
      varsResolver
    })("root"),
    mod: [{
      center,
      fixed
    }, mod],
    ...others,
    children
  });
});
Overlay.classes = _Overlay_module_mjs__WEBPACK_IMPORTED_MODULE_9__["default"];
Overlay.varsResolver = varsResolver;
Overlay.displayName = "@mantine/core/Overlay";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Overlay/Overlay.module.mjs"
/*!**********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Overlay/Overlay.module.mjs ***!
  \**********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Overlay_module_default)
/* harmony export */ });
"use client";
var Overlay_module_default = { "root": "m_9814e45f" };



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Paper/Paper.mjs"
/*!***********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Paper/Paper.mjs ***!
  \***********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Paper: () => (/* binding */ Paper)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/factory/polymorphic-factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Paper_module_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./Paper.module.mjs */ "../../node_modules/@mantine/core/esm/components/Paper/Paper.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";








const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((_, { radius, shadow }) => ({ root: {
  "--paper-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getRadius)(radius),
  "--paper-shadow": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getShadow)(shadow)
} }));
const Paper = (0,_core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.polymorphicFactory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("Paper", null, _props);
  const { classNames, className, style, styles, unstyled, withBorder, vars, radius, shadow, variant, mod, attributes, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__.useStyles)({
    name: "Paper",
    props,
    classes: _Paper_module_mjs__WEBPACK_IMPORTED_MODULE_6__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__.Box, {
    mod: [{ "data-with-border": withBorder }, mod],
    ...getStyles("root"),
    variant,
    ...others
  });
});
Paper.classes = _Paper_module_mjs__WEBPACK_IMPORTED_MODULE_6__["default"];
Paper.varsResolver = varsResolver;
Paper.displayName = "@mantine/core/Paper";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Paper/Paper.module.mjs"
/*!******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Paper/Paper.module.mjs ***!
  \******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Paper_module_default)
/* harmony export */ });
"use client";
var Paper_module_default = { "root": "m_1b7284a3" };



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Popover/Popover.context.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Popover/Popover.context.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PopoverContextProvider: () => (/* binding */ PopoverContextProvider),
/* harmony export */   usePopoverContext: () => (/* binding */ usePopoverContext)
/* harmony export */ });
/* harmony import */ var _core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/create-safe-context/create-safe-context.mjs */ "../../node_modules/@mantine/core/esm/core/utils/create-safe-context/create-safe-context.mjs");
"use client";

const [PopoverContextProvider, usePopoverContext] = (0,_core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__.createSafeContext)("Popover component was not found in the tree");



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Popover/Popover.mjs"
/*!***************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Popover/Popover.mjs ***!
  \***************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Popover: () => (/* binding */ Popover)
/* harmony export */ });
/* harmony import */ var _core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-default-z-index/get-default-z-index.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-default-z-index/get-default-z-index.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/MantineProvider/Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_resolved_styles_api_use_resolved_styles_api_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/styles-api/use-resolved-styles-api/use-resolved-styles-api.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-resolved-styles-api/use-resolved-styles-api.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_DirectionProvider_DirectionProvider_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../../core/DirectionProvider/DirectionProvider.mjs */ "../../node_modules/@mantine/core/esm/core/DirectionProvider/DirectionProvider.mjs");
/* harmony import */ var _utils_Floating_get_floating_position_get_floating_position_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../../utils/Floating/get-floating-position/get-floating-position.mjs */ "../../node_modules/@mantine/core/esm/utils/Floating/get-floating-position/get-floating-position.mjs");
/* harmony import */ var _Overlay_Overlay_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../Overlay/Overlay.mjs */ "../../node_modules/@mantine/core/esm/components/Overlay/Overlay.mjs");
/* harmony import */ var _Portal_OptionalPortal_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ../Portal/OptionalPortal.mjs */ "../../node_modules/@mantine/core/esm/components/Portal/OptionalPortal.mjs");
/* harmony import */ var _Transition_Transition_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ../Transition/Transition.mjs */ "../../node_modules/@mantine/core/esm/components/Transition/Transition.mjs");
/* harmony import */ var _Popover_context_mjs__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./Popover.context.mjs */ "../../node_modules/@mantine/core/esm/components/Popover/Popover.context.mjs");
/* harmony import */ var _Popover_module_mjs__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! ./Popover.module.mjs */ "../../node_modules/@mantine/core/esm/components/Popover/Popover.module.mjs");
/* harmony import */ var _PopoverDropdown_PopoverDropdown_mjs__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! ./PopoverDropdown/PopoverDropdown.mjs */ "../../node_modules/@mantine/core/esm/components/Popover/PopoverDropdown/PopoverDropdown.mjs");
/* harmony import */ var _PopoverTarget_PopoverTarget_mjs__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! ./PopoverTarget/PopoverTarget.mjs */ "../../node_modules/@mantine/core/esm/components/Popover/PopoverTarget/PopoverTarget.mjs");
/* harmony import */ var _use_popover_mjs__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! ./use-popover.mjs */ "../../node_modules/@mantine/core/esm/components/Popover/use-popover.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_17__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_17___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_17__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_18__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-click-outside/use-click-outside.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_19__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-id/use-id.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




















const defaultProps = {
  position: "bottom",
  offset: 8,
  transitionProps: {
    transition: "fade",
    duration: 150
  },
  middlewares: {
    flip: true,
    shift: true,
    inline: false
  },
  arrowSize: 7,
  arrowOffset: 5,
  arrowRadius: 0,
  arrowPosition: "side",
  closeOnClickOutside: true,
  withinPortal: true,
  closeOnEscape: true,
  trapFocus: false,
  withRoles: true,
  returnFocus: false,
  withOverlay: false,
  hideDetached: true,
  clickOutsideEvents: ["mousedown", "touchstart"],
  zIndex: (0,_core_utils_get_default_z_index_get_default_z_index_mjs__WEBPACK_IMPORTED_MODULE_0__.getDefaultZIndex)("popover"),
  __staticSelector: "Popover",
  width: "max-content"
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.createVarsResolver)((_, { radius, shadow }) => ({ dropdown: {
  "--popover-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getRadius)(radius),
  "--popover-shadow": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getShadow)(shadow)
} }));
function Popover(_props) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_4__.useProps)("Popover", defaultProps, _props);
  const { children, position, offset, onPositionChange, opened, transitionProps, onExitTransitionEnd, onEnterTransitionEnd, width, middlewares, withArrow, arrowSize, arrowOffset, arrowRadius, arrowPosition, unstyled, classNames, styles, closeOnClickOutside, withinPortal, portalProps, closeOnEscape, clickOutsideEvents, trapFocus, onClose, onDismiss, onOpen, onChange, zIndex, radius, shadow, id, defaultOpened, __staticSelector, withRoles, disabled, returnFocus, variant, keepMounted, vars, floatingStrategy, withOverlay, overlayProps, hideDetached, attributes, preventPositionChangeWhenVisible, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_6__.useStyles)({
    name: __staticSelector,
    props,
    classes: _Popover_module_mjs__WEBPACK_IMPORTED_MODULE_13__["default"],
    classNames,
    styles,
    unstyled,
    attributes,
    rootSelector: "dropdown",
    vars,
    varsResolver
  });
  const { resolvedStyles } = (0,_core_styles_api_use_resolved_styles_api_use_resolved_styles_api_mjs__WEBPACK_IMPORTED_MODULE_5__.useResolvedStylesApi)({
    classNames,
    styles,
    props
  });
  const [dropdownVisible, setDropdownVisible] = (0,react__WEBPACK_IMPORTED_MODULE_17__.useState)((_a = opened != null ? opened : defaultOpened) != null ? _a : false);
  const positionRef = (0,react__WEBPACK_IMPORTED_MODULE_17__.useRef)(position);
  const arrowRef = (0,react__WEBPACK_IMPORTED_MODULE_17__.useRef)(null);
  const [targetNode, setTargetNode] = (0,react__WEBPACK_IMPORTED_MODULE_17__.useState)(null);
  const [dropdownNode, setDropdownNode] = (0,react__WEBPACK_IMPORTED_MODULE_17__.useState)(null);
  const { dir } = (0,_core_DirectionProvider_DirectionProvider_mjs__WEBPACK_IMPORTED_MODULE_7__.useDirection)();
  const env = (0,_core_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useMantineEnv)();
  const uid = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_19__.useId)(id);
  const popover = (0,_use_popover_mjs__WEBPACK_IMPORTED_MODULE_16__.usePopover)({
    middlewares,
    width,
    position: (0,_utils_Floating_get_floating_position_get_floating_position_mjs__WEBPACK_IMPORTED_MODULE_8__.getFloatingPosition)(dir, position),
    offset: typeof offset === "number" ? offset + (withArrow ? arrowSize / 2 : 0) : offset,
    arrowRef,
    arrowOffset,
    onPositionChange,
    opened,
    defaultOpened,
    onChange,
    onOpen,
    onClose,
    onDismiss,
    strategy: floatingStrategy,
    dropdownVisible,
    setDropdownVisible,
    positionRef,
    disabled,
    preventPositionChangeWhenVisible,
    keepMounted
  });
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_18__.useClickOutside)(() => {
    if (closeOnClickOutside) {
      popover.onClose();
      onDismiss == null ? void 0 : onDismiss();
    }
  }, clickOutsideEvents, [targetNode, dropdownNode]);
  const reference = (0,react__WEBPACK_IMPORTED_MODULE_17__.useCallback)((node) => {
    setTargetNode(node);
    popover.floating.refs.setReference(node);
  }, [popover.floating.refs.setReference]);
  const floating = (0,react__WEBPACK_IMPORTED_MODULE_17__.useCallback)((node) => {
    setDropdownNode(node);
    popover.floating.refs.setFloating(node);
  }, [popover.floating.refs.setFloating]);
  const onExited = (0,react__WEBPACK_IMPORTED_MODULE_17__.useCallback)(() => {
    var _a2;
    (_a2 = transitionProps == null ? void 0 : transitionProps.onExited) == null ? void 0 : _a2.call(transitionProps);
    onExitTransitionEnd == null ? void 0 : onExitTransitionEnd();
    setDropdownVisible(false);
    if (!preventPositionChangeWhenVisible) positionRef.current = position;
  }, [
    transitionProps == null ? void 0 : transitionProps.onExited,
    onExitTransitionEnd,
    preventPositionChangeWhenVisible,
    position
  ]);
  const onEntered = (0,react__WEBPACK_IMPORTED_MODULE_17__.useCallback)(() => {
    var _a2;
    (_a2 = transitionProps == null ? void 0 : transitionProps.onEntered) == null ? void 0 : _a2.call(transitionProps);
    onEnterTransitionEnd == null ? void 0 : onEnterTransitionEnd();
  }, [transitionProps == null ? void 0 : transitionProps.onEntered, onEnterTransitionEnd]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsxs)(_Popover_context_mjs__WEBPACK_IMPORTED_MODULE_12__.PopoverContextProvider, {
    value: {
      returnFocus,
      disabled,
      controlled: popover.controlled,
      reference,
      floating,
      x: popover.floating.x,
      y: popover.floating.y,
      arrowX: (_d = (_c = (_b = popover.floating) == null ? void 0 : _b.middlewareData) == null ? void 0 : _c.arrow) == null ? void 0 : _d.x,
      arrowY: (_g = (_f = (_e = popover.floating) == null ? void 0 : _e.middlewareData) == null ? void 0 : _f.arrow) == null ? void 0 : _g.y,
      opened: popover.opened,
      arrowRef,
      transitionProps: {
        ...transitionProps,
        onExited,
        onEntered
      },
      width,
      withArrow,
      arrowSize,
      arrowOffset,
      arrowRadius,
      arrowPosition,
      placement: popover.floating.placement,
      trapFocus,
      withinPortal,
      portalProps,
      zIndex,
      radius,
      shadow,
      closeOnEscape,
      onDismiss,
      onClose: popover.onClose,
      onToggle: popover.onToggle,
      getTargetId: () => uid,
      getDropdownId: () => `${uid}-dropdown`,
      withRoles,
      targetProps: others,
      __staticSelector,
      classNames,
      styles,
      unstyled,
      variant,
      keepMounted,
      getStyles,
      resolvedStyles,
      floatingStrategy,
      referenceHidden: hideDetached && env !== "test" ? (_h = popover.floating.middlewareData.hide) == null ? void 0 : _h.referenceHidden : false
    },
    children: [children, withOverlay && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsx)(_Transition_Transition_mjs__WEBPACK_IMPORTED_MODULE_11__.Transition, {
      transition: "fade",
      mounted: popover.opened,
      duration: (transitionProps == null ? void 0 : transitionProps.duration) || 250,
      exitDuration: (transitionProps == null ? void 0 : transitionProps.exitDuration) || 250,
      children: (transitionStyles) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsx)(_Portal_OptionalPortal_mjs__WEBPACK_IMPORTED_MODULE_10__.OptionalPortal, {
        withinPortal,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsx)(_Overlay_Overlay_mjs__WEBPACK_IMPORTED_MODULE_9__.Overlay, {
          ...overlayProps,
          ...getStyles("overlay", {
            className: overlayProps == null ? void 0 : overlayProps.className,
            style: [transitionStyles, overlayProps == null ? void 0 : overlayProps.style]
          })
        })
      })
    })]
  });
}
Popover.Target = _PopoverTarget_PopoverTarget_mjs__WEBPACK_IMPORTED_MODULE_15__.PopoverTarget;
Popover.Dropdown = _PopoverDropdown_PopoverDropdown_mjs__WEBPACK_IMPORTED_MODULE_14__.PopoverDropdown;
Popover.varsResolver = varsResolver;
Popover.displayName = "@mantine/core/Popover";
Popover.extend = (input) => input;
Popover.withProps = (fixedProps) => {
  const Extended = (props) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_20__.jsx)(Popover, {
    ...fixedProps,
    ...props
  });
  Extended.extend = Popover.extend;
  Extended.displayName = `WithProps(${Popover.displayName})`;
  return Extended;
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Popover/Popover.module.mjs"
/*!**********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Popover/Popover.module.mjs ***!
  \**********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Popover_module_default)
/* harmony export */ });
"use client";
var Popover_module_default = {
  "dropdown": "m_38a85659",
  "arrow": "m_a31dc6c1",
  "overlay": "m_3d7bc908"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Popover/PopoverDropdown/PopoverDropdown.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Popover/PopoverDropdown/PopoverDropdown.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PopoverDropdown: () => (/* binding */ PopoverDropdown)
/* harmony export */ });
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_utils_close_on_escape_close_on_escape_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/utils/close-on-escape/close-on-escape.mjs */ "../../node_modules/@mantine/core/esm/core/utils/close-on-escape/close-on-escape.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _utils_Floating_FloatingArrow_FloatingArrow_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../../utils/Floating/FloatingArrow/FloatingArrow.mjs */ "../../node_modules/@mantine/core/esm/utils/Floating/FloatingArrow/FloatingArrow.mjs");
/* harmony import */ var _Portal_OptionalPortal_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../Portal/OptionalPortal.mjs */ "../../node_modules/@mantine/core/esm/components/Portal/OptionalPortal.mjs");
/* harmony import */ var _Transition_Transition_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../../Transition/Transition.mjs */ "../../node_modules/@mantine/core/esm/components/Transition/Transition.mjs");
/* harmony import */ var _Popover_context_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../Popover.context.mjs */ "../../node_modules/@mantine/core/esm/components/Popover/Popover.context.mjs");
/* harmony import */ var _FocusTrap_FocusTrap_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../../FocusTrap/FocusTrap.mjs */ "../../node_modules/@mantine/core/esm/components/FocusTrap/FocusTrap.mjs");
/* harmony import */ var _Popover_module_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ../Popover.module.mjs */ "../../node_modules/@mantine/core/esm/components/Popover/Popover.module.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-focus-return/use-focus-return.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";













const PopoverDropdown = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_3__.factory)((_props) => {
  var _a, _b, _c, _d, _e;
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("PopoverDropdown", null, _props);
  const { className, style, vars, children, onKeyDownCapture, variant, classNames, styles, ref, ...others } = props;
  const ctx = (0,_Popover_context_mjs__WEBPACK_IMPORTED_MODULE_8__.usePopoverContext)();
  const returnFocus = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_11__.useFocusReturn)({
    opened: ctx.opened,
    shouldReturnFocus: ctx.returnFocus
  });
  const accessibleProps = ctx.withRoles ? {
    "aria-labelledby": ctx.getTargetId(),
    id: ctx.getDropdownId(),
    role: "dialog",
    tabIndex: -1
  } : {};
  const mergedRef = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_12__.useMergedRef)(ref, ctx.floating);
  if (ctx.disabled) return null;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_Portal_OptionalPortal_mjs__WEBPACK_IMPORTED_MODULE_6__.OptionalPortal, {
    ...ctx.portalProps,
    withinPortal: ctx.withinPortal,
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_Transition_Transition_mjs__WEBPACK_IMPORTED_MODULE_7__.Transition, {
      mounted: ctx.opened,
      ...ctx.transitionProps,
      transition: ((_a = ctx.transitionProps) == null ? void 0 : _a.transition) || "fade",
      duration: (_c = (_b = ctx.transitionProps) == null ? void 0 : _b.duration) != null ? _c : 150,
      keepMounted: ctx.keepMounted,
      exitDuration: typeof ((_d = ctx.transitionProps) == null ? void 0 : _d.exitDuration) === "number" ? ctx.transitionProps.exitDuration : (_e = ctx.transitionProps) == null ? void 0 : _e.duration,
      children: (transitionStyles) => {
        var _a2, _b2, _c2;
        return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_FocusTrap_FocusTrap_mjs__WEBPACK_IMPORTED_MODULE_9__.FocusTrap, {
          active: ctx.trapFocus && ctx.opened,
          innerRef: mergedRef,
          children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsxs)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_4__.Box, {
            ...accessibleProps,
            ...others,
            variant,
            onKeyDownCapture: (0,_core_utils_close_on_escape_close_on_escape_mjs__WEBPACK_IMPORTED_MODULE_1__.closeOnEscape)(() => {
              var _a3, _b3;
              (_a3 = ctx.onClose) == null ? void 0 : _a3.call(ctx);
              (_b3 = ctx.onDismiss) == null ? void 0 : _b3.call(ctx);
            }, {
              active: ctx.closeOnEscape,
              onTrigger: returnFocus,
              onKeyDown: onKeyDownCapture
            }),
            "data-position": ctx.placement,
            "data-fixed": ctx.floatingStrategy === "fixed" || void 0,
            ...ctx.getStyles("dropdown", {
              className,
              props,
              classNames,
              styles,
              style: [
                {
                  ...transitionStyles,
                  zIndex: ctx.zIndex,
                  top: (_a2 = ctx.y) != null ? _a2 : 0,
                  left: (_b2 = ctx.x) != null ? _b2 : 0,
                  width: ctx.width === "target" ? void 0 : (0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(ctx.width),
                  ...ctx.referenceHidden ? { display: "none" } : null
                },
                (_c2 = ctx.resolvedStyles) == null ? void 0 : _c2.dropdown,
                styles == null ? void 0 : styles.dropdown,
                style
              ]
            }),
            children: [children, /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_utils_Floating_FloatingArrow_FloatingArrow_mjs__WEBPACK_IMPORTED_MODULE_5__.FloatingArrow, {
              ref: ctx.arrowRef,
              arrowX: ctx.arrowX,
              arrowY: ctx.arrowY,
              visible: ctx.withArrow,
              position: ctx.placement,
              arrowSize: ctx.arrowSize,
              arrowRadius: ctx.arrowRadius,
              arrowOffset: ctx.arrowOffset,
              arrowPosition: ctx.arrowPosition,
              ...ctx.getStyles("arrow", {
                props,
                classNames,
                styles
              })
            })]
          })
        });
      }
    })
  });
});
PopoverDropdown.classes = _Popover_module_mjs__WEBPACK_IMPORTED_MODULE_10__["default"];
PopoverDropdown.displayName = "@mantine/core/PopoverDropdown";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Popover/PopoverTarget/PopoverTarget.mjs"
/*!***********************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Popover/PopoverTarget/PopoverTarget.mjs ***!
  \***********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PopoverTarget: () => (/* binding */ PopoverTarget)
/* harmony export */ });
/* harmony import */ var _core_utils_get_ref_prop_get_ref_prop_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/get-ref-prop/get-ref-prop.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-ref-prop/get-ref-prop.mjs");
/* harmony import */ var _core_utils_get_single_element_child_get_single_element_child_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/utils/get-single-element-child/get-single-element-child.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-single-element-child/get-single-element-child.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _Popover_context_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../Popover.context.mjs */ "../../node_modules/@mantine/core/esm/components/Popover/Popover.context.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
"use client";








const defaultProps = {
  refProp: "ref",
  popupType: "dialog"
};
const PopoverTarget = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_3__.factory)((props) => {
  const { children, refProp, popupType, ref, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("PopoverTarget", defaultProps, props);
  const child = (0,_core_utils_get_single_element_child_get_single_element_child_mjs__WEBPACK_IMPORTED_MODULE_1__.getSingleElementChild)(children);
  if (!child) throw new Error("Popover.Target component children should be an element or a component that accepts ref. Fragments, strings, numbers and other primitive values are not supported");
  const forwardedProps = others;
  const ctx = (0,_Popover_context_mjs__WEBPACK_IMPORTED_MODULE_4__.usePopoverContext)();
  const targetRef = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_6__.useMergedRef)(ctx.reference, (0,_core_utils_get_ref_prop_get_ref_prop_mjs__WEBPACK_IMPORTED_MODULE_0__.getRefProp)(child), ref);
  const accessibleProps = ctx.withRoles ? {
    "aria-haspopup": popupType,
    "aria-expanded": ctx.opened,
    "aria-controls": ctx.opened ? ctx.getDropdownId() : void 0,
    id: ctx.getTargetId()
  } : {};
  const childProps = child.props;
  return (0,react__WEBPACK_IMPORTED_MODULE_5__.cloneElement)(child, {
    ...forwardedProps,
    ...accessibleProps,
    ...ctx.targetProps,
    className: (0,clsx__WEBPACK_IMPORTED_MODULE_7__["default"])(ctx.targetProps.className, forwardedProps.className, childProps.className),
    [refProp]: targetRef,
    ...!ctx.controlled ? { onClick: (event) => {
      var _a;
      ctx.onToggle();
      (_a = childProps.onClick) == null ? void 0 : _a.call(childProps, event);
    } } : null
  });
});
PopoverTarget.displayName = "@mantine/core/PopoverTarget";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Popover/use-popover.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Popover/use-popover.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   usePopover: () => (/* binding */ usePopover)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-did-update/use-did-update.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-uncontrolled/use-uncontrolled.mjs");
/* harmony import */ var _floating_ui_react__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @floating-ui/react */ "../../node_modules/@floating-ui/react/dist/floating-ui.react.mjs");
/* harmony import */ var _floating_ui_react__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @floating-ui/react */ "../../node_modules/@floating-ui/react-dom/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs");
/* harmony import */ var _floating_ui_react__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! @floating-ui/react */ "../../node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs");
"use client";




function getDefaultMiddlewares(middlewares) {
  if (middlewares === void 0) return {
    shift: true,
    flip: true
  };
  const result = { ...middlewares };
  if (middlewares.shift === void 0) result.shift = true;
  if (middlewares.flip === void 0) result.flip = true;
  return result;
}
function getPopoverMiddlewares(options, getFloating, env) {
  const middlewaresOptions = getDefaultMiddlewares(options.middlewares);
  const middlewares = [(0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.offset)(options.offset), (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.hide)()];
  if (options.dropdownVisible && env !== "test" && options.preventPositionChangeWhenVisible) middlewaresOptions.flip = false;
  if (middlewaresOptions.flip) middlewares.push(typeof middlewaresOptions.flip === "boolean" ? (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.flip)() : (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.flip)(middlewaresOptions.flip));
  if (middlewaresOptions.shift) middlewares.push((0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.shift)(typeof middlewaresOptions.shift === "boolean" ? {
    limiter: (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.limitShift)(),
    padding: 5
  } : {
    limiter: (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.limitShift)(),
    padding: 5,
    ...middlewaresOptions.shift
  }));
  if (middlewaresOptions.inline) middlewares.push(typeof middlewaresOptions.inline === "boolean" ? (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.inline)() : (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.inline)(middlewaresOptions.inline));
  middlewares.push((0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.arrow)({
    element: options.arrowRef,
    padding: options.arrowOffset
  }));
  if (middlewaresOptions.size || options.width === "target") middlewares.push((0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_7__.size)({
    ...typeof middlewaresOptions.size === "boolean" ? {} : middlewaresOptions.size,
    apply({ rects, availableWidth, availableHeight, ...rest }) {
      var _a, _b;
      const styles = (_b = (_a = getFloating().refs.floating.current) == null ? void 0 : _a.style) != null ? _b : {};
      if (middlewaresOptions.size) if (typeof middlewaresOptions.size === "object" && !!middlewaresOptions.size.apply) middlewaresOptions.size.apply({
        rects,
        availableWidth,
        availableHeight,
        ...rest
      });
      else Object.assign(styles, {
        maxWidth: `${availableWidth}px`,
        maxHeight: `${availableHeight}px`
      });
      if (options.width === "target") Object.assign(styles, { width: `${rects.reference.width}px` });
    }
  }));
  return middlewares;
}
function usePopover(options) {
  const env = (0,_core_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useMantineEnv)();
  const [_opened, setOpened] = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_4__.useUncontrolled)({
    value: options.opened,
    defaultValue: options.defaultOpened,
    finalValue: false,
    onChange: options.onChange
  });
  const previouslyOpened = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(_opened);
  const onClose = () => {
    if (_opened && !options.disabled) setOpened(false);
  };
  const onToggle = () => {
    if (!options.disabled) setOpened(!_opened);
  };
  const floating = (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_5__.useFloating)({
    strategy: options.strategy,
    placement: options.preventPositionChangeWhenVisible ? options.positionRef.current : options.position,
    middleware: getPopoverMiddlewares(options, () => floating, env),
    whileElementsMounted: !options.keepMounted ? _floating_ui_react__WEBPACK_IMPORTED_MODULE_6__.autoUpdate : void 0
  });
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    if (!floating.refs.reference.current || !floating.refs.floating.current) return;
    if (_opened) return (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_6__.autoUpdate)(floating.refs.reference.current, floating.refs.floating.current, floating.update);
  }, [_opened, floating.update]);
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_3__.useDidUpdate)(() => {
    var _a;
    (_a = options.onPositionChange) == null ? void 0 : _a.call(options, floating.placement);
    options.positionRef.current = floating.placement;
  }, [floating.placement, options.preventPositionChangeWhenVisible]);
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_3__.useDidUpdate)(() => {
    var _a, _b;
    if (_opened !== previouslyOpened.current) if (!_opened) (_a = options.onClose) == null ? void 0 : _a.call(options);
    else (_b = options.onOpen) == null ? void 0 : _b.call(options);
    previouslyOpened.current = _opened;
  }, [
    _opened,
    options.onClose,
    options.onOpen
  ]);
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_2__.useIsomorphicEffect)(() => {
    let timeout = -1;
    if (_opened) timeout = window.setTimeout(() => options.setDropdownVisible(true), 4);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [_opened, options.position]);
  return {
    floating,
    controlled: typeof options.opened === "boolean",
    opened: _opened,
    onClose,
    onToggle
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Portal/OptionalPortal.mjs"
/*!*********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Portal/OptionalPortal.mjs ***!
  \*********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   OptionalPortal: () => (/* binding */ OptionalPortal)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _Portal_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./Portal.mjs */ "../../node_modules/@mantine/core/esm/components/Portal/Portal.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




const OptionalPortal = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.factory)(({ withinPortal = true, children, ...others }) => {
  if ((0,_core_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useMantineEnv)() === "test" || !withinPortal) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.Fragment, { children });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(_Portal_mjs__WEBPACK_IMPORTED_MODULE_2__.Portal, {
    ...others,
    children
  });
});
OptionalPortal.displayName = "@mantine/core/OptionalPortal";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Portal/Portal.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Portal/Portal.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Portal: () => (/* binding */ Portal)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var react_dom__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react-dom */ "../../node_modules/react-dom/index.js");
"use client";






function createPortalNode(props) {
  const node = document.createElement("div");
  node.setAttribute("data-portal", "true");
  typeof props.className === "string" && node.classList.add(...props.className.split(" ").filter(Boolean));
  typeof props.style === "object" && Object.assign(node.style, props.style);
  typeof props.id === "string" && node.setAttribute("id", props.id);
  return node;
}
function getTargetNode({ target, reuseTargetNode, ...others }) {
  if (target) {
    if (typeof target === "string") return document.querySelector(target) || createPortalNode(others);
    return target;
  }
  if (reuseTargetNode) {
    const existingNode = document.querySelector("[data-mantine-shared-portal-node]");
    if (existingNode) return existingNode;
    const node = createPortalNode(others);
    node.setAttribute("data-mantine-shared-portal-node", "true");
    document.body.appendChild(node);
    return node;
  }
  return createPortalNode(others);
}
const defaultProps = { reuseTargetNode: true };
const Portal = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.factory)((props) => {
  const { children, target, reuseTargetNode, ref, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("Portal", defaultProps, props);
  const [mounted, setMounted] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(false);
  const nodeRef = (0,react__WEBPACK_IMPORTED_MODULE_2__.useRef)(null);
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_3__.useIsomorphicEffect)(() => {
    setMounted(true);
    nodeRef.current = getTargetNode({
      target,
      reuseTargetNode,
      ...others
    });
    (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_4__.assignRef)(ref, nodeRef.current);
    if (!target && !reuseTargetNode && nodeRef.current) document.body.appendChild(nodeRef.current);
    return () => {
      if (!target && !reuseTargetNode && nodeRef.current) document.body.removeChild(nodeRef.current);
    };
  }, [target]);
  if (!mounted || !nodeRef.current) return null;
  return (0,react_dom__WEBPACK_IMPORTED_MODULE_6__.createPortal)(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.Fragment, { children }), nodeRef.current);
});
Portal.displayName = "@mantine/core/Portal";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Progress/Progress.context.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Progress/Progress.context.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ProgressProvider: () => (/* binding */ ProgressProvider),
/* harmony export */   useProgressContext: () => (/* binding */ useProgressContext)
/* harmony export */ });
/* harmony import */ var _core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/create-safe-context/create-safe-context.mjs */ "../../node_modules/@mantine/core/esm/core/utils/create-safe-context/create-safe-context.mjs");
"use client";

const [ProgressProvider, useProgressContext] = (0,_core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__.createSafeContext)("Progress.Root component was not found in tree");



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Progress/Progress.mjs"
/*!*****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Progress/Progress.mjs ***!
  \*****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Progress: () => (/* binding */ Progress)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_resolved_styles_api_use_resolved_styles_api_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/use-resolved-styles-api/use-resolved-styles-api.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-resolved-styles-api/use-resolved-styles-api.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _Progress_module_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Progress.module.mjs */ "../../node_modules/@mantine/core/esm/components/Progress/Progress.module.mjs");
/* harmony import */ var _ProgressLabel_ProgressLabel_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./ProgressLabel/ProgressLabel.mjs */ "../../node_modules/@mantine/core/esm/components/Progress/ProgressLabel/ProgressLabel.mjs");
/* harmony import */ var _ProgressRoot_ProgressRoot_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./ProgressRoot/ProgressRoot.mjs */ "../../node_modules/@mantine/core/esm/components/Progress/ProgressRoot/ProgressRoot.mjs");
/* harmony import */ var _ProgressSection_ProgressSection_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./ProgressSection/ProgressSection.mjs */ "../../node_modules/@mantine/core/esm/components/Progress/ProgressSection/ProgressSection.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";








const Progress = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("Progress", null, _props);
  const { value, classNames, styles, vars, color, striped, animated, "aria-label": label, ...others } = props;
  const { resolvedClassNames, resolvedStyles } = (0,_core_styles_api_use_resolved_styles_api_use_resolved_styles_api_mjs__WEBPACK_IMPORTED_MODULE_1__.useResolvedStylesApi)({
    classNames,
    styles,
    props
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_ProgressRoot_ProgressRoot_mjs__WEBPACK_IMPORTED_MODULE_5__.ProgressRoot, {
    classNames: resolvedClassNames,
    styles: resolvedStyles,
    vars,
    ...others,
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_ProgressSection_ProgressSection_mjs__WEBPACK_IMPORTED_MODULE_6__.ProgressSection, {
      value,
      color,
      striped,
      animated,
      "aria-label": label
    })
  });
});
Progress.classes = _Progress_module_mjs__WEBPACK_IMPORTED_MODULE_3__["default"];
Progress.displayName = "@mantine/core/Progress";
Progress.Section = _ProgressSection_ProgressSection_mjs__WEBPACK_IMPORTED_MODULE_6__.ProgressSection;
Progress.Root = _ProgressRoot_ProgressRoot_mjs__WEBPACK_IMPORTED_MODULE_5__.ProgressRoot;
Progress.Label = _ProgressLabel_ProgressLabel_mjs__WEBPACK_IMPORTED_MODULE_4__.ProgressLabel;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Progress/Progress.module.mjs"
/*!************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Progress/Progress.module.mjs ***!
  \************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Progress_module_default)
/* harmony export */ });
"use client";
var Progress_module_default = {
  "root": "m_db6d6462",
  "section": "m_2242eb65",
  "stripes-animation": "m_81a374bd",
  "stripes-animation-vertical": "m_e0fb7a86",
  "label": "m_91e40b74"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Progress/ProgressLabel/ProgressLabel.mjs"
/*!************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Progress/ProgressLabel/ProgressLabel.mjs ***!
  \************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ProgressLabel: () => (/* binding */ ProgressLabel)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Progress_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../Progress.context.mjs */ "../../node_modules/@mantine/core/esm/components/Progress/Progress.context.mjs");
/* harmony import */ var _Progress_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../Progress.module.mjs */ "../../node_modules/@mantine/core/esm/components/Progress/Progress.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const ProgressLabel = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.factory)((props) => {
  const { classNames, className, style, styles, vars, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("ProgressLabel", null, props);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__.Box, {
    ...(0,_Progress_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useProgressContext)().getStyles("label", {
      className,
      style,
      classNames,
      styles
    }),
    ...others
  });
});
ProgressLabel.classes = _Progress_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
ProgressLabel.displayName = "@mantine/core/ProgressLabel";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Progress/ProgressRoot/ProgressRoot.mjs"
/*!**********************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Progress/ProgressRoot/ProgressRoot.mjs ***!
  \**********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ProgressRoot: () => (/* binding */ ProgressRoot)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Progress_context_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../Progress.context.mjs */ "../../node_modules/@mantine/core/esm/components/Progress/Progress.context.mjs");
/* harmony import */ var _Progress_module_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../Progress.module.mjs */ "../../node_modules/@mantine/core/esm/components/Progress/Progress.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";









const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((_, { size, radius, transitionDuration }) => ({ root: {
  "--progress-size": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "progress-size"),
  "--progress-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getRadius)(radius),
  "--progress-transition-duration": typeof transitionDuration === "number" ? `${transitionDuration}ms` : void 0
} }));
const ProgressRoot = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("ProgressRoot", null, _props);
  const { classNames, className, style, styles, unstyled, vars, autoContrast, transitionDuration, orientation, attributes, mod, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__.useStyles)({
    name: "Progress",
    classes: _Progress_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"],
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__.jsx)(_Progress_context_mjs__WEBPACK_IMPORTED_MODULE_6__.ProgressProvider, {
    value: {
      getStyles,
      autoContrast
    },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__.Box, {
      mod: [{ orientation }, mod],
      ...getStyles("root"),
      ...others
    })
  });
});
ProgressRoot.classes = _Progress_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"];
ProgressRoot.varsResolver = varsResolver;
ProgressRoot.displayName = "@mantine/core/ProgressRoot";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Progress/ProgressSection/ProgressSection.mjs"
/*!****************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Progress/ProgressSection/ProgressSection.mjs ***!
  \****************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ProgressSection: () => (/* binding */ ProgressSection)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_contrast_color_get_contrast_color_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/MantineProvider/color-functions/get-contrast-color/get-contrast-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-contrast-color/get-contrast-color.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_auto_contrast_value_get_auto_contrast_value_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/MantineProvider/color-functions/get-auto-contrast-value/get-auto-contrast-value.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-auto-contrast-value/get-auto-contrast-value.mjs");
/* harmony import */ var _core_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Progress_context_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../Progress.context.mjs */ "../../node_modules/@mantine/core/esm/components/Progress/Progress.context.mjs");
/* harmony import */ var _Progress_module_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../Progress.module.mjs */ "../../node_modules/@mantine/core/esm/components/Progress/Progress.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";










const defaultProps = { withAria: true };
const ProgressSection = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_5__.factory)((props) => {
  const { classNames, className, style, styles, vars, value, withAria, color, striped, animated, mod, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_4__.useProps)("ProgressSection", defaultProps, props);
  const ctx = (0,_Progress_context_mjs__WEBPACK_IMPORTED_MODULE_7__.useProgressContext)();
  const theme = (0,_core_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_3__.useMantineTheme)();
  const ariaAttributes = withAria ? {
    role: "progressbar",
    "aria-valuemax": 100,
    "aria-valuemin": 0,
    "aria-valuenow": value,
    "aria-valuetext": `${value}%`
  } : {};
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
    ...ctx.getStyles("section", {
      className,
      classNames,
      styles,
      style
    }),
    ...others,
    ...ariaAttributes,
    mod: [{
      striped: striped || animated,
      animated
    }, mod],
    __vars: {
      "--progress-section-size": `${value}%`,
      "--progress-section-color": (0,_core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_0__.getThemeColor)(color, theme),
      "--progress-label-color": (0,_core_MantineProvider_color_functions_get_auto_contrast_value_get_auto_contrast_value_mjs__WEBPACK_IMPORTED_MODULE_2__.getAutoContrastValue)(ctx.autoContrast, theme) ? (0,_core_MantineProvider_color_functions_get_contrast_color_get_contrast_color_mjs__WEBPACK_IMPORTED_MODULE_1__.getContrastColor)({
        color,
        theme,
        autoContrast: ctx.autoContrast
      }) : void 0
    }
  });
});
ProgressSection.classes = _Progress_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"];
ProgressSection.displayName = "@mantine/core/ProgressSection";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs"
/*!*****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs ***!
  \*****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaProvider: () => (/* binding */ ScrollAreaProvider),
/* harmony export */   useScrollAreaContext: () => (/* binding */ useScrollAreaContext)
/* harmony export */ });
/* harmony import */ var _core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/create-safe-context/create-safe-context.mjs */ "../../node_modules/@mantine/core/esm/core/utils/create-safe-context/create-safe-context.mjs");
"use client";

const [ScrollAreaProvider, useScrollAreaContext] = (0,_core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__.createSafeContext)("ScrollArea.Root component was not found in tree");



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.mjs"
/*!*********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.mjs ***!
  \*********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollArea: () => (/* binding */ ScrollArea)
/* harmony export */ });
/* unused harmony export ScrollAreaAutosize */
/* harmony import */ var _core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./use-resize-observer.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/use-resize-observer.mjs");
/* harmony import */ var _ScrollAreaCorner_ScrollAreaCorner_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./ScrollAreaCorner/ScrollAreaCorner.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaCorner/ScrollAreaCorner.mjs");
/* harmony import */ var _ScrollAreaRoot_ScrollAreaRoot_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./ScrollAreaRoot/ScrollAreaRoot.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaRoot/ScrollAreaRoot.mjs");
/* harmony import */ var _ScrollAreaScrollbar_ScrollAreaScrollbar_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./ScrollAreaScrollbar/ScrollAreaScrollbar.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbar.mjs");
/* harmony import */ var _ScrollAreaThumb_ScrollAreaThumb_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./ScrollAreaThumb/ScrollAreaThumb.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaThumb/ScrollAreaThumb.mjs");
/* harmony import */ var _ScrollAreaViewport_ScrollAreaViewport_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./ScrollAreaViewport/ScrollAreaViewport.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaViewport/ScrollAreaViewport.mjs");
/* harmony import */ var _ScrollArea_module_mjs__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./ScrollArea.module.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.module.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_13___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_13__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _floating_ui_react__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! @floating-ui/react */ "../../node_modules/@floating-ui/react/dist/floating-ui.react.mjs");
"use client";

















const defaultProps = {
  scrollHideDelay: 1e3,
  type: "hover",
  scrollbars: "xy"
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((_, { scrollbarSize, overscrollBehavior, scrollbars }) => {
  let overrideOverscrollBehavior = overscrollBehavior;
  if (overscrollBehavior && scrollbars) {
    if (scrollbars === "x") overrideOverscrollBehavior = `${overscrollBehavior} auto`;
    else if (scrollbars === "y") overrideOverscrollBehavior = `auto ${overscrollBehavior}`;
  }
  return { root: {
    "--scrollarea-scrollbar-size": (0,_core_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(scrollbarSize),
    "--scrollarea-over-scroll-behavior": overrideOverscrollBehavior
  } };
});
const ScrollArea = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("ScrollArea", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, scrollbarSize, vars, type, scrollHideDelay, viewportProps, viewportRef, onScrollPositionChange, children, offsetScrollbars, scrollbars, onBottomReached, onTopReached, onLeftReached, onRightReached, overscrollBehavior, startScrollPosition, attributes, ...others } = props;
  const [scrollbarHovered, setScrollbarHovered] = (0,react__WEBPACK_IMPORTED_MODULE_13__.useState)(false);
  const [verticalThumbVisible, setVerticalThumbVisible] = (0,react__WEBPACK_IMPORTED_MODULE_13__.useState)(false);
  const [horizontalThumbVisible, setHorizontalThumbVisible] = (0,react__WEBPACK_IMPORTED_MODULE_13__.useState)(false);
  const prevAtTopRef = (0,react__WEBPACK_IMPORTED_MODULE_13__.useRef)(true);
  const prevAtBottomRef = (0,react__WEBPACK_IMPORTED_MODULE_13__.useRef)(false);
  const prevAtLeftRef = (0,react__WEBPACK_IMPORTED_MODULE_13__.useRef)(true);
  const prevAtRightRef = (0,react__WEBPACK_IMPORTED_MODULE_13__.useRef)(false);
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__.useStyles)({
    name: "ScrollArea",
    props,
    classes: _ScrollArea_module_mjs__WEBPACK_IMPORTED_MODULE_12__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  const localViewportRef = (0,react__WEBPACK_IMPORTED_MODULE_13__.useRef)(null);
  const [viewportElement, setViewportElement] = (0,react__WEBPACK_IMPORTED_MODULE_13__.useState)(null);
  const combinedViewportRef = (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_16__.useMergeRefs)([
    viewportRef,
    localViewportRef,
    (0,react__WEBPACK_IMPORTED_MODULE_13__.useCallback)((node) => {
      setViewportElement((current) => current === node ? current : node);
    }, [])
  ]);
  (0,_use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_6__.useResizeObserver)(offsetScrollbars === "present" ? viewportElement : null, () => {
    const element = localViewportRef.current;
    if (element) {
      setVerticalThumbVisible(element.scrollHeight > element.clientHeight);
      setHorizontalThumbVisible(element.scrollWidth > element.clientWidth);
    }
  });
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_14__.useIsomorphicEffect)(() => {
    var _a, _b;
    if (startScrollPosition && localViewportRef.current) localViewportRef.current.scrollTo({
      left: (_a = startScrollPosition.x) != null ? _a : 0,
      top: (_b = startScrollPosition.y) != null ? _b : 0
    });
  }, []);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsxs)(_ScrollAreaRoot_ScrollAreaRoot_mjs__WEBPACK_IMPORTED_MODULE_8__.ScrollAreaRoot, {
    getStyles,
    type: type === "never" ? "always" : type,
    scrollHideDelay,
    scrollbars,
    ...getStyles("root"),
    ...others,
    children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_ScrollAreaViewport_ScrollAreaViewport_mjs__WEBPACK_IMPORTED_MODULE_11__.ScrollAreaViewport, {
        ...viewportProps,
        ...getStyles("viewport", { style: viewportProps == null ? void 0 : viewportProps.style }),
        ref: combinedViewportRef,
        "data-offset-scrollbars": offsetScrollbars === true ? "xy" : offsetScrollbars || void 0,
        "data-scrollbars": scrollbars || void 0,
        "data-horizontal-hidden": offsetScrollbars === "present" && !horizontalThumbVisible ? "true" : void 0,
        "data-vertical-hidden": offsetScrollbars === "present" && !verticalThumbVisible ? "true" : void 0,
        onScroll: (e) => {
          var _a;
          (_a = viewportProps == null ? void 0 : viewportProps.onScroll) == null ? void 0 : _a.call(viewportProps, e);
          onScrollPositionChange == null ? void 0 : onScrollPositionChange({
            x: e.currentTarget.scrollLeft,
            y: e.currentTarget.scrollTop
          });
          const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = e.currentTarget;
          const isAtBottom = scrollTop - (scrollHeight - clientHeight) >= -0.8;
          const isAtTop = scrollTop === 0;
          if (isAtBottom && !prevAtBottomRef.current) onBottomReached == null ? void 0 : onBottomReached();
          if (isAtTop && !prevAtTopRef.current) onTopReached == null ? void 0 : onTopReached();
          prevAtBottomRef.current = isAtBottom;
          prevAtTopRef.current = isAtTop;
          const isAtRight = scrollLeft - (scrollWidth - clientWidth) >= -0.8;
          const isAtLeft = scrollLeft === 0;
          if (isAtRight && !prevAtRightRef.current) onRightReached == null ? void 0 : onRightReached();
          if (isAtLeft && !prevAtLeftRef.current) onLeftReached == null ? void 0 : onLeftReached();
          prevAtRightRef.current = isAtRight;
          prevAtLeftRef.current = isAtLeft;
        },
        children
      }),
      (scrollbars === "xy" || scrollbars === "x") && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_ScrollAreaScrollbar_ScrollAreaScrollbar_mjs__WEBPACK_IMPORTED_MODULE_9__.ScrollAreaScrollbar, {
        ...getStyles("scrollbar"),
        orientation: "horizontal",
        "data-hidden": type === "never" || offsetScrollbars === "present" && !horizontalThumbVisible ? true : void 0,
        forceMount: true,
        onMouseEnter: () => setScrollbarHovered(true),
        onMouseLeave: () => setScrollbarHovered(false),
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_ScrollAreaThumb_ScrollAreaThumb_mjs__WEBPACK_IMPORTED_MODULE_10__.ScrollAreaThumb, { ...getStyles("thumb") })
      }),
      (scrollbars === "xy" || scrollbars === "y") && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_ScrollAreaScrollbar_ScrollAreaScrollbar_mjs__WEBPACK_IMPORTED_MODULE_9__.ScrollAreaScrollbar, {
        ...getStyles("scrollbar"),
        orientation: "vertical",
        "data-hidden": type === "never" || offsetScrollbars === "present" && !verticalThumbVisible ? true : void 0,
        forceMount: true,
        onMouseEnter: () => setScrollbarHovered(true),
        onMouseLeave: () => setScrollbarHovered(false),
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_ScrollAreaThumb_ScrollAreaThumb_mjs__WEBPACK_IMPORTED_MODULE_10__.ScrollAreaThumb, { ...getStyles("thumb") })
      }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_ScrollAreaCorner_ScrollAreaCorner_mjs__WEBPACK_IMPORTED_MODULE_7__.ScrollAreaCorner, {
        ...getStyles("corner"),
        "data-hovered": scrollbarHovered || void 0,
        "data-hidden": type === "never" || void 0
      })
    ]
  });
});
ScrollArea.displayName = "@mantine/core/ScrollArea";
const ScrollAreaAutosize = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.factory)((props) => {
  const { children, classNames, styles, scrollbarSize, scrollHideDelay, type, dir, offsetScrollbars, overscrollBehavior, viewportRef, onScrollPositionChange, unstyled, variant, viewportProps, scrollbars, style, vars, onBottomReached, onTopReached, startScrollPosition, onOverflowChange, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("ScrollAreaAutosize", defaultProps, props);
  const viewportObserverRef = (0,react__WEBPACK_IMPORTED_MODULE_13__.useRef)(null);
  const [viewportObserverElement, setViewportObserverElement] = (0,react__WEBPACK_IMPORTED_MODULE_13__.useState)(null);
  const combinedViewportRef = (0,_floating_ui_react__WEBPACK_IMPORTED_MODULE_16__.useMergeRefs)([
    viewportRef,
    viewportObserverRef,
    (0,react__WEBPACK_IMPORTED_MODULE_13__.useCallback)((node) => {
      setViewportObserverElement((current) => current === node ? current : node);
    }, [])
  ]);
  const overflowingRef = (0,react__WEBPACK_IMPORTED_MODULE_13__.useRef)(false);
  const didMountRef = (0,react__WEBPACK_IMPORTED_MODULE_13__.useRef)(false);
  const handleOverflowCheck = (0,react__WEBPACK_IMPORTED_MODULE_13__.useEffectEvent)(() => {
    const el = viewportObserverRef.current;
    if (!el || !onOverflowChange) return;
    const isOverflowing = el.scrollHeight > el.clientHeight;
    if (isOverflowing !== overflowingRef.current) {
      if (didMountRef.current) onOverflowChange(isOverflowing);
      else {
        didMountRef.current = true;
        if (isOverflowing) onOverflowChange(true);
      }
      overflowingRef.current = isOverflowing;
    }
  });
  (0,_use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_6__.useResizeObserver)(onOverflowChange ? viewportObserverElement : null, handleOverflowCheck);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__.Box, {
    ...others,
    variant,
    style: [{
      display: "flex",
      overflow: "hidden"
    }, style],
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__.Box, {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
        ...scrollbars === "y" && { minWidth: 0 },
        ...scrollbars === "x" && { minHeight: 0 },
        ...scrollbars === "xy" && {
          minWidth: 0,
          minHeight: 0
        },
        ...scrollbars === false && {
          minWidth: 0,
          minHeight: 0
        }
      },
      children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_15__.jsx)(ScrollArea, {
        classNames,
        styles,
        scrollHideDelay,
        scrollbarSize,
        type,
        dir,
        offsetScrollbars,
        overscrollBehavior,
        viewportRef: combinedViewportRef,
        onScrollPositionChange,
        unstyled,
        variant,
        viewportProps,
        vars,
        scrollbars,
        onBottomReached,
        onTopReached,
        startScrollPosition,
        "data-autosize": "true",
        children
      })
    })
  });
});
ScrollArea.classes = _ScrollArea_module_mjs__WEBPACK_IMPORTED_MODULE_12__["default"];
ScrollArea.varsResolver = varsResolver;
ScrollAreaAutosize.displayName = "@mantine/core/ScrollAreaAutosize";
ScrollAreaAutosize.classes = _ScrollArea_module_mjs__WEBPACK_IMPORTED_MODULE_12__["default"];
ScrollArea.Autosize = ScrollAreaAutosize;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.module.mjs"
/*!****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.module.mjs ***!
  \****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ ScrollArea_module_default)
/* harmony export */ });
"use client";
var ScrollArea_module_default = {
  "root": "m_d57069b5",
  "content": "m_b1336c6",
  "viewport": "m_c0783ff9",
  "viewportInner": "m_f8f631dd",
  "scrollbar": "m_c44ba933",
  "thumb": "m_d8b5e363",
  "corner": "m_21657268"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaCorner/ScrollAreaCorner.mjs"
/*!********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaCorner/ScrollAreaCorner.mjs ***!
  \********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaCorner: () => (/* binding */ ScrollAreaCorner)
/* harmony export */ });
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../use-resize-observer.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/use-resize-observer.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




function Corner(props) {
  const { style, ...others } = props;
  const ctx = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useScrollAreaContext)();
  const [width, setWidth] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(0);
  const [height, setHeight] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(0);
  const hasSize = Boolean(width && height);
  (0,_use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_1__.useResizeObserver)(ctx.scrollbarX, () => {
    var _a;
    const h = ((_a = ctx.scrollbarX) == null ? void 0 : _a.offsetHeight) || 0;
    ctx.onCornerHeightChange(h);
    setHeight(h);
  });
  (0,_use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_1__.useResizeObserver)(ctx.scrollbarY, () => {
    var _a;
    const w = ((_a = ctx.scrollbarY) == null ? void 0 : _a.offsetWidth) || 0;
    ctx.onCornerWidthChange(w);
    setWidth(w);
  });
  return hasSize ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)("div", {
    ...others,
    style: {
      ...style,
      width,
      height
    }
  }) : null;
}
function ScrollAreaCorner(props) {
  const ctx = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useScrollAreaContext)();
  const hasBothScrollbarsVisible = Boolean(ctx.scrollbarX && ctx.scrollbarY);
  return ctx.type !== "scroll" && hasBothScrollbarsVisible ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(Corner, { ...props }) : null;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaRoot/ScrollAreaRoot.mjs"
/*!****************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaRoot/ScrollAreaRoot.mjs ***!
  \****************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaRoot: () => (/* binding */ ScrollAreaRoot)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const defaultProps = {
  scrollHideDelay: 1e3,
  type: "hover"
};
function ScrollAreaRoot(_props) {
  const { type, scrollHideDelay, scrollbars, getStyles, ref, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("ScrollAreaRoot", defaultProps, _props);
  const [scrollArea, setScrollArea] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(null);
  const [viewport, setViewport] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(null);
  const [content, setContent] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(null);
  const [scrollbarX, setScrollbarX] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(null);
  const [scrollbarY, setScrollbarY] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(null);
  const [cornerWidth, setCornerWidth] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(0);
  const [cornerHeight, setCornerHeight] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(0);
  const [scrollbarXEnabled, setScrollbarXEnabled] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(false);
  const [scrollbarYEnabled, setScrollbarYEnabled] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(false);
  const rootRef = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_4__.useMergedRef)(ref, (node) => setScrollArea(node));
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_2__.ScrollAreaProvider, {
    value: {
      type,
      scrollHideDelay,
      scrollArea,
      viewport,
      onViewportChange: setViewport,
      content,
      onContentChange: setContent,
      scrollbarX,
      onScrollbarXChange: setScrollbarX,
      scrollbarXEnabled,
      onScrollbarXEnabledChange: setScrollbarXEnabled,
      scrollbarY,
      onScrollbarYChange: setScrollbarY,
      scrollbarYEnabled,
      onScrollbarYEnabledChange: setScrollbarYEnabled,
      onCornerWidthChange: setCornerWidth,
      onCornerHeightChange: setCornerHeight,
      getStyles
    },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_1__.Box, {
      ...others,
      ref: rootRef,
      __vars: {
        "--sa-corner-width": scrollbars !== "xy" ? "0px" : `${cornerWidth}px`,
        "--sa-corner-height": scrollbars !== "xy" ? "0px" : `${cornerHeight}px`
      }
    })
  });
}
ScrollAreaRoot.displayName = "@mantine/core/ScrollAreaRoot";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbar.mjs"
/*!**************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbar.mjs ***!
  \**************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaScrollbar: () => (/* binding */ ScrollAreaScrollbar)
/* harmony export */ });
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _ScrollAreaScrollbarVisible_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ScrollAreaScrollbarVisible.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarVisible.mjs");
/* harmony import */ var _ScrollAreaScrollbarAuto_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./ScrollAreaScrollbarAuto.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarAuto.mjs");
/* harmony import */ var _ScrollAreaScrollbarHover_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./ScrollAreaScrollbarHover.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarHover.mjs");
/* harmony import */ var _ScrollAreaScrollbarScroll_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./ScrollAreaScrollbarScroll.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarScroll.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";







function ScrollAreaScrollbar(props) {
  const { forceMount, ...scrollbarProps } = props;
  const context = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useScrollAreaContext)();
  const { onScrollbarXEnabledChange, onScrollbarYEnabledChange } = context;
  const isHorizontal = props.orientation === "horizontal";
  (0,react__WEBPACK_IMPORTED_MODULE_5__.useEffect)(() => {
    isHorizontal ? onScrollbarXEnabledChange(true) : onScrollbarYEnabledChange(true);
    return () => {
      isHorizontal ? onScrollbarXEnabledChange(false) : onScrollbarYEnabledChange(false);
    };
  }, [
    isHorizontal,
    onScrollbarXEnabledChange,
    onScrollbarYEnabledChange
  ]);
  return context.type === "hover" ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_ScrollAreaScrollbarHover_mjs__WEBPACK_IMPORTED_MODULE_3__.ScrollAreaScrollbarHover, {
    ...scrollbarProps,
    forceMount
  }) : context.type === "scroll" ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_ScrollAreaScrollbarScroll_mjs__WEBPACK_IMPORTED_MODULE_4__.ScrollAreaScrollbarScroll, {
    ...scrollbarProps,
    forceMount
  }) : context.type === "auto" ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_ScrollAreaScrollbarAuto_mjs__WEBPACK_IMPORTED_MODULE_2__.ScrollAreaScrollbarAuto, {
    ...scrollbarProps,
    forceMount
  }) : context.type === "always" ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_ScrollAreaScrollbarVisible_mjs__WEBPACK_IMPORTED_MODULE_1__.ScrollAreaScrollbarVisible, { ...scrollbarProps }) : null;
}
ScrollAreaScrollbar.displayName = "@mantine/core/ScrollAreaScrollbar";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarAuto.mjs"
/*!******************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarAuto.mjs ***!
  \******************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaScrollbarAuto: () => (/* binding */ ScrollAreaScrollbarAuto)
/* harmony export */ });
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../use-resize-observer.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/use-resize-observer.mjs");
/* harmony import */ var _ScrollAreaScrollbarVisible_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./ScrollAreaScrollbarVisible.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarVisible.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-debounced-callback/use-debounced-callback.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






function ScrollAreaScrollbarAuto(props) {
  const context = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useScrollAreaContext)();
  const { forceMount, ...scrollbarProps } = props;
  const [visible, setVisible] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(false);
  const isHorizontal = props.orientation === "horizontal";
  const handleResize = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_4__.useDebouncedCallback)(() => {
    if (context.viewport) {
      const isOverflowX = context.viewport.offsetWidth < context.viewport.scrollWidth;
      const isOverflowY = context.viewport.offsetHeight < context.viewport.scrollHeight;
      setVisible(isHorizontal ? isOverflowX : isOverflowY);
    }
  }, 10);
  (0,_use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_1__.useResizeObserver)(context.viewport, handleResize);
  (0,_use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_1__.useResizeObserver)(context.content, handleResize);
  if (forceMount || visible) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_ScrollAreaScrollbarVisible_mjs__WEBPACK_IMPORTED_MODULE_2__.ScrollAreaScrollbarVisible, {
    "data-state": visible ? "visible" : "hidden",
    ...scrollbarProps
  });
  return null;
}
ScrollAreaScrollbarAuto.displayName = "@mantine/core/ScrollAreaScrollbarAuto";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarHover.mjs"
/*!*******************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarHover.mjs ***!
  \*******************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaScrollbarHover: () => (/* binding */ ScrollAreaScrollbarHover)
/* harmony export */ });
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _ScrollAreaScrollbarAuto_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ScrollAreaScrollbarAuto.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarAuto.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




function ScrollAreaScrollbarHover(props) {
  const { forceMount, ...scrollbarProps } = props;
  const context = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useScrollAreaContext)();
  const [visible, setVisible] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(false);
  (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(() => {
    const { scrollArea } = context;
    let hideTimer = 0;
    if (scrollArea) {
      const handlePointerEnter = () => {
        window.clearTimeout(hideTimer);
        setVisible(true);
      };
      const handlePointerLeave = () => {
        hideTimer = window.setTimeout(() => setVisible(false), context.scrollHideDelay);
      };
      scrollArea.addEventListener("pointerenter", handlePointerEnter);
      scrollArea.addEventListener("pointerleave", handlePointerLeave);
      return () => {
        window.clearTimeout(hideTimer);
        scrollArea.removeEventListener("pointerenter", handlePointerEnter);
        scrollArea.removeEventListener("pointerleave", handlePointerLeave);
      };
    }
  }, [context.scrollArea, context.scrollHideDelay]);
  if (forceMount || visible) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(_ScrollAreaScrollbarAuto_mjs__WEBPACK_IMPORTED_MODULE_1__.ScrollAreaScrollbarAuto, {
    "data-state": visible ? "visible" : "hidden",
    ...scrollbarProps
  });
  return null;
}
ScrollAreaScrollbarHover.displayName = "@mantine/core/ScrollAreaScrollbarHover";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarScroll.mjs"
/*!********************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarScroll.mjs ***!
  \********************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaScrollbarScroll: () => (/* binding */ ScrollAreaScrollbarScroll)
/* harmony export */ });
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _utils_compose_event_handlers_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../utils/compose-event-handlers.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/compose-event-handlers.mjs");
/* harmony import */ var _ScrollAreaScrollbarVisible_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./ScrollAreaScrollbarVisible.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarVisible.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-debounced-callback/use-debounced-callback.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






function ScrollAreaScrollbarScroll(props) {
  const { forceMount, ...scrollbarProps } = props;
  const context = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useScrollAreaContext)();
  const isHorizontal = props.orientation === "horizontal";
  const [state, setState] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)("hidden");
  const debounceScrollEnd = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_4__.useDebouncedCallback)(() => setState("idle"), 100);
  (0,react__WEBPACK_IMPORTED_MODULE_3__.useEffect)(() => {
    if (state === "idle") {
      const hideTimer = window.setTimeout(() => setState("hidden"), context.scrollHideDelay);
      return () => window.clearTimeout(hideTimer);
    }
  }, [state, context.scrollHideDelay]);
  (0,react__WEBPACK_IMPORTED_MODULE_3__.useEffect)(() => {
    const { viewport } = context;
    const scrollDirection = isHorizontal ? "scrollLeft" : "scrollTop";
    if (viewport) {
      let prevScrollPos = viewport[scrollDirection];
      const handleScroll = () => {
        const scrollPos = viewport[scrollDirection];
        if (prevScrollPos !== scrollPos) {
          setState("scrolling");
          debounceScrollEnd();
        }
        prevScrollPos = scrollPos;
      };
      viewport.addEventListener("scroll", handleScroll);
      return () => viewport.removeEventListener("scroll", handleScroll);
    }
  }, [
    context.viewport,
    isHorizontal,
    debounceScrollEnd
  ]);
  if (forceMount || state !== "hidden") return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_ScrollAreaScrollbarVisible_mjs__WEBPACK_IMPORTED_MODULE_2__.ScrollAreaScrollbarVisible, {
    "data-state": state === "hidden" ? "hidden" : "visible",
    ...scrollbarProps,
    onPointerEnter: (0,_utils_compose_event_handlers_mjs__WEBPACK_IMPORTED_MODULE_1__.composeEventHandlers)(props.onPointerEnter, () => setState("interacting")),
    onPointerLeave: (0,_utils_compose_event_handlers_mjs__WEBPACK_IMPORTED_MODULE_1__.composeEventHandlers)(props.onPointerLeave, () => setState("idle"))
  });
  return null;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarVisible.mjs"
/*!*********************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollAreaScrollbarVisible.mjs ***!
  \*********************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaScrollbarVisible: () => (/* binding */ ScrollAreaScrollbarVisible)
/* harmony export */ });
/* harmony import */ var _core_DirectionProvider_DirectionProvider_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/DirectionProvider/DirectionProvider.mjs */ "../../node_modules/@mantine/core/esm/core/DirectionProvider/DirectionProvider.mjs");
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _utils_get_thumb_ratio_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../utils/get-thumb-ratio.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-ratio.mjs");
/* harmony import */ var _utils_get_thumb_offset_from_scroll_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../utils/get-thumb-offset-from-scroll.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-offset-from-scroll.mjs");
/* harmony import */ var _utils_get_scroll_position_from_pointer_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../utils/get-scroll-position-from-pointer.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-scroll-position-from-pointer.mjs");
/* harmony import */ var _ScrollbarX_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./ScrollbarX.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollbarX.mjs");
/* harmony import */ var _ScrollbarY_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./ScrollbarY.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollbarY.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_7___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_7__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";









function ScrollAreaScrollbarVisible(props) {
  const { orientation = "vertical", ...scrollbarProps } = props;
  const { dir } = (0,_core_DirectionProvider_DirectionProvider_mjs__WEBPACK_IMPORTED_MODULE_0__.useDirection)();
  const context = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_1__.useScrollAreaContext)();
  const thumbRef = (0,react__WEBPACK_IMPORTED_MODULE_7__.useRef)(null);
  const pointerOffsetRef = (0,react__WEBPACK_IMPORTED_MODULE_7__.useRef)(0);
  const [sizes, setSizes] = (0,react__WEBPACK_IMPORTED_MODULE_7__.useState)({
    content: 0,
    viewport: 0,
    scrollbar: {
      size: 0,
      paddingStart: 0,
      paddingEnd: 0
    }
  });
  const thumbRatio = (0,_utils_get_thumb_ratio_mjs__WEBPACK_IMPORTED_MODULE_2__.getThumbRatio)(sizes.viewport, sizes.content);
  const commonProps = {
    ...scrollbarProps,
    sizes,
    onSizesChange: setSizes,
    hasThumb: Boolean(thumbRatio > 0 && thumbRatio < 1),
    onThumbChange: (thumb) => {
      thumbRef.current = thumb;
    },
    onThumbPointerUp: () => {
      pointerOffsetRef.current = 0;
    },
    onThumbPointerDown: (pointerPos) => {
      pointerOffsetRef.current = pointerPos;
    }
  };
  const getScrollPosition = (pointerPos, direction) => (0,_utils_get_scroll_position_from_pointer_mjs__WEBPACK_IMPORTED_MODULE_4__.getScrollPositionFromPointer)(pointerPos, pointerOffsetRef.current, sizes, direction);
  if (orientation === "horizontal") return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__.jsx)(_ScrollbarX_mjs__WEBPACK_IMPORTED_MODULE_5__.ScrollAreaScrollbarX, {
    ...commonProps,
    onThumbPositionChange: () => {
      if (context.viewport && thumbRef.current) {
        const scrollPos = context.viewport.scrollLeft;
        const offset = (0,_utils_get_thumb_offset_from_scroll_mjs__WEBPACK_IMPORTED_MODULE_3__.getThumbOffsetFromScroll)(scrollPos, sizes, dir);
        thumbRef.current.style.transform = `translate3d(${offset}px, 0, 0)`;
      }
    },
    onWheelScroll: (scrollPos) => {
      if (context.viewport) context.viewport.scrollLeft = scrollPos;
    },
    onDragScroll: (pointerPos) => {
      if (context.viewport) context.viewport.scrollLeft = getScrollPosition(pointerPos, dir);
    }
  });
  if (orientation === "vertical") return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__.jsx)(_ScrollbarY_mjs__WEBPACK_IMPORTED_MODULE_6__.ScrollAreaScrollbarY, {
    ...commonProps,
    onThumbPositionChange: () => {
      if (context.viewport && thumbRef.current) {
        const scrollPos = context.viewport.scrollTop;
        const offset = (0,_utils_get_thumb_offset_from_scroll_mjs__WEBPACK_IMPORTED_MODULE_3__.getThumbOffsetFromScroll)(scrollPos, sizes);
        if (sizes.scrollbar.size === 0) thumbRef.current.style.setProperty("--thumb-opacity", "0");
        else thumbRef.current.style.setProperty("--thumb-opacity", "1");
        thumbRef.current.style.transform = `translate3d(0, ${offset}px, 0)`;
      }
    },
    onWheelScroll: (scrollPos) => {
      if (context.viewport) context.viewport.scrollTop = scrollPos;
    },
    onDragScroll: (pointerPos) => {
      if (context.viewport) context.viewport.scrollTop = getScrollPosition(pointerPos);
    }
  });
  return null;
}
ScrollAreaScrollbarVisible.displayName = "@mantine/core/ScrollAreaScrollbarVisible";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/Scrollbar.context.mjs"
/*!************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/Scrollbar.context.mjs ***!
  \************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollbarProvider: () => (/* binding */ ScrollbarProvider),
/* harmony export */   useScrollbarContext: () => (/* binding */ useScrollbarContext)
/* harmony export */ });
/* harmony import */ var _core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/create-safe-context/create-safe-context.mjs */ "../../node_modules/@mantine/core/esm/core/utils/create-safe-context/create-safe-context.mjs");
"use client";

const [ScrollbarProvider, useScrollbarContext] = (0,_core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__.createSafeContext)("ScrollAreaScrollbar was not found in tree");



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/Scrollbar.mjs"
/*!****************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/Scrollbar.mjs ***!
  \****************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Scrollbar: () => (/* binding */ Scrollbar)
/* harmony export */ });
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../use-resize-observer.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/use-resize-observer.mjs");
/* harmony import */ var _utils_compose_event_handlers_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../utils/compose-event-handlers.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/compose-event-handlers.mjs");
/* harmony import */ var _Scrollbar_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Scrollbar.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/Scrollbar.context.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/utils/use-callback-ref/use-callback-ref.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-debounced-callback/use-debounced-callback.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";







function Scrollbar(props) {
  const { sizes, hasThumb, onThumbChange, onThumbPointerUp, onThumbPointerDown, onThumbPositionChange, onDragScroll, onWheelScroll, onResize, ref, ...scrollbarProps } = props;
  const context = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useScrollAreaContext)();
  const [scrollbar, setScrollbar] = (0,react__WEBPACK_IMPORTED_MODULE_4__.useState)(null);
  const composeRefs = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_7__.useMergedRef)(ref, (node) => setScrollbar(node));
  const rectRef = (0,react__WEBPACK_IMPORTED_MODULE_4__.useRef)(null);
  const prevWebkitUserSelectRef = (0,react__WEBPACK_IMPORTED_MODULE_4__.useRef)("");
  const { viewport } = context;
  const maxScrollPos = sizes.content - sizes.viewport;
  const handleWheelScroll = (0,react__WEBPACK_IMPORTED_MODULE_4__.useEffectEvent)(onWheelScroll);
  const handleThumbPositionChange = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_5__.useCallbackRef)(onThumbPositionChange);
  const handleResize = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_6__.useDebouncedCallback)(onResize, 10);
  const handleDragScroll = (event) => {
    if (rectRef.current) onDragScroll({
      x: event.clientX - rectRef.current.left,
      y: event.clientY - rectRef.current.top
    });
  };
  (0,react__WEBPACK_IMPORTED_MODULE_4__.useEffect)(() => {
    const handleWheel = (event) => {
      const element = event.target;
      if (scrollbar == null ? void 0 : scrollbar.contains(element)) handleWheelScroll(event, maxScrollPos);
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel, { passive: false });
  }, [
    viewport,
    scrollbar,
    maxScrollPos
  ]);
  (0,react__WEBPACK_IMPORTED_MODULE_4__.useEffect)(handleThumbPositionChange, [sizes, handleThumbPositionChange]);
  (0,_use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_1__.useResizeObserver)(scrollbar, handleResize);
  (0,_use_resize_observer_mjs__WEBPACK_IMPORTED_MODULE_1__.useResizeObserver)(context.content, handleResize);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__.jsx)(_Scrollbar_context_mjs__WEBPACK_IMPORTED_MODULE_3__.ScrollbarProvider, {
    value: {
      scrollbar,
      hasThumb,
      onThumbChange: (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_5__.useCallbackRef)(onThumbChange),
      onThumbPointerUp: (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_5__.useCallbackRef)(onThumbPointerUp),
      onThumbPositionChange: handleThumbPositionChange,
      onThumbPointerDown: (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_5__.useCallbackRef)(onThumbPointerDown)
    },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__.jsx)("div", {
      ...scrollbarProps,
      ref: composeRefs,
      "data-mantine-scrollbar": true,
      style: {
        position: "absolute",
        ...scrollbarProps.style
      },
      onPointerDown: (0,_utils_compose_event_handlers_mjs__WEBPACK_IMPORTED_MODULE_2__.composeEventHandlers)(props.onPointerDown, (event) => {
        event.preventDefault();
        if (event.button === 0) {
          event.target.setPointerCapture(event.pointerId);
          rectRef.current = scrollbar.getBoundingClientRect();
          prevWebkitUserSelectRef.current = document.body.style.webkitUserSelect;
          document.body.style.webkitUserSelect = "none";
          handleDragScroll(event);
        }
      }),
      onPointerMove: (0,_utils_compose_event_handlers_mjs__WEBPACK_IMPORTED_MODULE_2__.composeEventHandlers)(props.onPointerMove, handleDragScroll),
      onPointerUp: (0,_utils_compose_event_handlers_mjs__WEBPACK_IMPORTED_MODULE_2__.composeEventHandlers)(props.onPointerUp, (event) => {
        const element = event.target;
        if (element.hasPointerCapture(event.pointerId)) {
          event.preventDefault();
          element.releasePointerCapture(event.pointerId);
        }
      }),
      onLostPointerCapture: () => {
        document.body.style.webkitUserSelect = prevWebkitUserSelectRef.current;
        rectRef.current = null;
      }
    })
  });
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollbarX.mjs"
/*!*****************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollbarX.mjs ***!
  \*****************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaScrollbarX: () => (/* binding */ ScrollAreaScrollbarX)
/* harmony export */ });
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _utils_is_scrolling_within_scrollbar_bounds_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../utils/is-scrolling-within-scrollbar-bounds.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/is-scrolling-within-scrollbar-bounds.mjs");
/* harmony import */ var _utils_get_thumb_size_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../utils/get-thumb-size.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-size.mjs");
/* harmony import */ var _utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../utils/to-int.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/to-int.mjs");
/* harmony import */ var _Scrollbar_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./Scrollbar.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/Scrollbar.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";








const ScrollAreaScrollbarX = (props) => {
  const { sizes, onSizesChange, style, ref: forwardedRef, ...others } = props;
  const ctx = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useScrollAreaContext)();
  const [computedStyle, setComputedStyle] = (0,react__WEBPACK_IMPORTED_MODULE_5__.useState)();
  const ref = (0,react__WEBPACK_IMPORTED_MODULE_5__.useRef)(null);
  const composeRefs = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_6__.useMergedRef)(forwardedRef, ref, ctx.onScrollbarXChange);
  (0,react__WEBPACK_IMPORTED_MODULE_5__.useEffect)(() => {
    if (ref.current) setComputedStyle(getComputedStyle(ref.current));
  }, [ref]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_Scrollbar_mjs__WEBPACK_IMPORTED_MODULE_4__.Scrollbar, {
    "data-orientation": "horizontal",
    ...others,
    ref: composeRefs,
    sizes,
    style: {
      ...style,
      ["--sa-thumb-width"]: `${(0,_utils_get_thumb_size_mjs__WEBPACK_IMPORTED_MODULE_2__.getThumbSize)(sizes)}px`
    },
    onThumbPointerDown: (pointerPos) => props.onThumbPointerDown(pointerPos.x),
    onDragScroll: (pointerPos) => props.onDragScroll(pointerPos.x),
    onWheelScroll: (event, maxScrollPos) => {
      if (ctx.viewport) {
        const scrollPos = ctx.viewport.scrollLeft + event.deltaX;
        props.onWheelScroll(scrollPos);
        if ((0,_utils_is_scrolling_within_scrollbar_bounds_mjs__WEBPACK_IMPORTED_MODULE_1__.isScrollingWithinScrollbarBounds)(scrollPos, maxScrollPos)) event.preventDefault();
      }
    },
    onResize: () => {
      if (ref.current && ctx.viewport && computedStyle) onSizesChange({
        content: ctx.viewport.scrollWidth,
        viewport: ctx.viewport.offsetWidth,
        scrollbar: {
          size: ref.current.clientWidth,
          paddingStart: (0,_utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_3__.toInt)(computedStyle.paddingLeft),
          paddingEnd: (0,_utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_3__.toInt)(computedStyle.paddingRight)
        }
      });
    }
  });
};
ScrollAreaScrollbarX.displayName = "@mantine/core/ScrollAreaScrollbarX";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollbarY.mjs"
/*!*****************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/ScrollbarY.mjs ***!
  \*****************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaScrollbarY: () => (/* binding */ ScrollAreaScrollbarY)
/* harmony export */ });
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _utils_is_scrolling_within_scrollbar_bounds_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../utils/is-scrolling-within-scrollbar-bounds.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/is-scrolling-within-scrollbar-bounds.mjs");
/* harmony import */ var _utils_get_thumb_size_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../utils/get-thumb-size.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-size.mjs");
/* harmony import */ var _utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../utils/to-int.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/to-int.mjs");
/* harmony import */ var _Scrollbar_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./Scrollbar.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/Scrollbar.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";








function ScrollAreaScrollbarY(props) {
  const { sizes, onSizesChange, style, ref: forwardedRef, ...others } = props;
  const context = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useScrollAreaContext)();
  const [computedStyle, setComputedStyle] = (0,react__WEBPACK_IMPORTED_MODULE_5__.useState)();
  const ref = (0,react__WEBPACK_IMPORTED_MODULE_5__.useRef)(null);
  const composeRefs = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_6__.useMergedRef)(forwardedRef, ref, context.onScrollbarYChange);
  (0,react__WEBPACK_IMPORTED_MODULE_5__.useEffect)(() => {
    if (ref.current) setComputedStyle(window.getComputedStyle(ref.current));
  }, []);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_Scrollbar_mjs__WEBPACK_IMPORTED_MODULE_4__.Scrollbar, {
    ...others,
    "data-orientation": "vertical",
    ref: composeRefs,
    sizes,
    style: {
      ["--sa-thumb-height"]: `${(0,_utils_get_thumb_size_mjs__WEBPACK_IMPORTED_MODULE_2__.getThumbSize)(sizes)}px`,
      ...style
    },
    onThumbPointerDown: (pointerPos) => props.onThumbPointerDown(pointerPos.y),
    onDragScroll: (pointerPos) => props.onDragScroll(pointerPos.y),
    onWheelScroll: (event, maxScrollPos) => {
      if (context.viewport) {
        const scrollPos = context.viewport.scrollTop + event.deltaY;
        props.onWheelScroll(scrollPos);
        if ((0,_utils_is_scrolling_within_scrollbar_bounds_mjs__WEBPACK_IMPORTED_MODULE_1__.isScrollingWithinScrollbarBounds)(scrollPos, maxScrollPos)) event.preventDefault();
      }
    },
    onResize: () => {
      if (ref.current && context.viewport && computedStyle) onSizesChange({
        content: context.viewport.scrollHeight,
        viewport: context.viewport.offsetHeight,
        scrollbar: {
          size: ref.current.clientHeight,
          paddingStart: (0,_utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_3__.toInt)(computedStyle.paddingTop),
          paddingEnd: (0,_utils_to_int_mjs__WEBPACK_IMPORTED_MODULE_3__.toInt)(computedStyle.paddingBottom)
        }
      });
    }
  });
}
ScrollAreaScrollbarY.displayName = "@mantine/core/ScrollAreaScrollbarY";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaThumb/ScrollAreaThumb.mjs"
/*!******************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaThumb/ScrollAreaThumb.mjs ***!
  \******************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaThumb: () => (/* binding */ ScrollAreaThumb)
/* harmony export */ });
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _utils_compose_event_handlers_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../utils/compose-event-handlers.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/compose-event-handlers.mjs");
/* harmony import */ var _utils_add_unlinked_scroll_listener_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../utils/add-unlinked-scroll-listener.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/add-unlinked-scroll-listener.mjs");
/* harmony import */ var _ScrollAreaScrollbar_Scrollbar_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../ScrollAreaScrollbar/Scrollbar.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaScrollbar/Scrollbar.context.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-debounced-callback/use-debounced-callback.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";







function Thumb(props) {
  const { style, ref: forwardedRef, ...others } = props;
  const scrollAreaContext = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useScrollAreaContext)();
  const scrollbarContext = (0,_ScrollAreaScrollbar_Scrollbar_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useScrollbarContext)();
  const { onThumbPositionChange } = scrollbarContext;
  const composedRef = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_6__.useMergedRef)(forwardedRef, (node) => scrollbarContext.onThumbChange(node));
  const removeUnlinkedScrollListenerRef = (0,react__WEBPACK_IMPORTED_MODULE_4__.useRef)(void 0);
  const debounceScrollEnd = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_5__.useDebouncedCallback)(() => {
    if (removeUnlinkedScrollListenerRef.current) {
      removeUnlinkedScrollListenerRef.current();
      removeUnlinkedScrollListenerRef.current = void 0;
    }
  }, 100);
  (0,react__WEBPACK_IMPORTED_MODULE_4__.useEffect)(() => {
    const { viewport } = scrollAreaContext;
    if (viewport) {
      const handleScroll = () => {
        debounceScrollEnd();
        if (!removeUnlinkedScrollListenerRef.current) {
          removeUnlinkedScrollListenerRef.current = (0,_utils_add_unlinked_scroll_listener_mjs__WEBPACK_IMPORTED_MODULE_2__.addUnlinkedScrollListener)(viewport, onThumbPositionChange);
          onThumbPositionChange();
        }
      };
      onThumbPositionChange();
      viewport.addEventListener("scroll", handleScroll);
      return () => viewport.removeEventListener("scroll", handleScroll);
    }
  }, [
    scrollAreaContext.viewport,
    debounceScrollEnd,
    onThumbPositionChange
  ]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)("div", {
    "data-state": scrollbarContext.hasThumb ? "visible" : "hidden",
    ...others,
    ref: composedRef,
    style: {
      width: "var(--sa-thumb-width)",
      height: "var(--sa-thumb-height)",
      ...style
    },
    onPointerDownCapture: (0,_utils_compose_event_handlers_mjs__WEBPACK_IMPORTED_MODULE_1__.composeEventHandlers)(props.onPointerDownCapture, (event) => {
      const thumbRect = event.target.getBoundingClientRect();
      const x = event.clientX - thumbRect.left;
      const y = event.clientY - thumbRect.top;
      scrollbarContext.onThumbPointerDown({
        x,
        y
      });
    }),
    onPointerUp: (0,_utils_compose_event_handlers_mjs__WEBPACK_IMPORTED_MODULE_1__.composeEventHandlers)(props.onPointerUp, scrollbarContext.onThumbPointerUp)
  });
}
Thumb.displayName = "@mantine/core/ScrollAreaThumb";
function ScrollAreaThumb(props) {
  const { forceMount, ...thumbProps } = props;
  const scrollbarContext = (0,_ScrollAreaScrollbar_Scrollbar_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useScrollbarContext)();
  if (forceMount || scrollbarContext.hasThumb) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(Thumb, { ...thumbProps });
  return null;
}
ScrollAreaThumb.displayName = "@mantine/core/ScrollAreaThumb";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaViewport/ScrollAreaViewport.mjs"
/*!************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollAreaViewport/ScrollAreaViewport.mjs ***!
  \************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ScrollAreaViewport: () => (/* binding */ ScrollAreaViewport)
/* harmony export */ });
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../ScrollArea.context.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/ScrollArea.context.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




function ScrollAreaViewport({ children, style, ref, onWheel, ...others }) {
  const ctx = (0,_ScrollArea_context_mjs__WEBPACK_IMPORTED_MODULE_1__.useScrollAreaContext)();
  const rootRef = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_2__.useMergedRef)(ref, ctx.onViewportChange);
  const handleWheel = (event) => {
    onWheel == null ? void 0 : onWheel(event);
    if (ctx.scrollbarXEnabled && ctx.viewport && event.shiftKey) {
      const { scrollTop, scrollHeight, clientHeight, scrollWidth, clientWidth } = ctx.viewport;
      const isAtTop = scrollTop < 1;
      const isAtBottom = scrollTop >= scrollHeight - clientHeight - 1;
      if (scrollWidth > clientWidth && (isAtTop || isAtBottom)) event.stopPropagation();
    }
  };
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_0__.Box, {
    ...others,
    ref: rootRef,
    onWheel: handleWheel,
    style: {
      overflowX: ctx.scrollbarXEnabled ? "scroll" : "hidden",
      overflowY: ctx.scrollbarYEnabled ? "scroll" : "hidden",
      ...style
    },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)("div", {
      ...ctx.getStyles("content"),
      ref: ctx.onContentChange,
      children
    })
  });
}
ScrollAreaViewport.displayName = "@mantine/core/ScrollAreaViewport";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/use-resize-observer.mjs"
/*!******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/use-resize-observer.mjs ***!
  \******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useResizeObserver: () => (/* binding */ useResizeObserver)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs");
"use client";


function useResizeObserver(element, onResize) {
  const handleResize = (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffectEvent)(onResize);
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_1__.useIsomorphicEffect)(() => {
    let rAF = 0;
    if (element) {
      const resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(rAF);
        rAF = window.requestAnimationFrame(handleResize);
      });
      resizeObserver.observe(element);
      return () => {
        window.cancelAnimationFrame(rAF);
        resizeObserver.unobserve(element);
      };
    }
  }, [element]);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/add-unlinked-scroll-listener.mjs"
/*!*********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/utils/add-unlinked-scroll-listener.mjs ***!
  \*********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   addUnlinkedScrollListener: () => (/* binding */ addUnlinkedScrollListener)
/* harmony export */ });
"use client";
function addUnlinkedScrollListener(node, handler = () => {
}) {
  let prevPosition = {
    left: node.scrollLeft,
    top: node.scrollTop
  };
  let rAF = 0;
  (function loop() {
    const position = {
      left: node.scrollLeft,
      top: node.scrollTop
    };
    const isHorizontalScroll = prevPosition.left !== position.left;
    const isVerticalScroll = prevPosition.top !== position.top;
    if (isHorizontalScroll || isVerticalScroll) handler();
    prevPosition = position;
    rAF = window.requestAnimationFrame(loop);
  })();
  return () => window.cancelAnimationFrame(rAF);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/compose-event-handlers.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/utils/compose-event-handlers.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   composeEventHandlers: () => (/* binding */ composeEventHandlers)
/* harmony export */ });
"use client";
function composeEventHandlers(originalEventHandler, ourEventHandler, { checkForDefaultPrevented = true } = {}) {
  return (event) => {
    originalEventHandler == null ? void 0 : originalEventHandler(event);
    if (checkForDefaultPrevented === false || !event.defaultPrevented) ourEventHandler == null ? void 0 : ourEventHandler(event);
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-scroll-position-from-pointer.mjs"
/*!*************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-scroll-position-from-pointer.mjs ***!
  \*************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getScrollPositionFromPointer: () => (/* binding */ getScrollPositionFromPointer)
/* harmony export */ });
/* harmony import */ var _get_thumb_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./get-thumb-size.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-size.mjs");
/* harmony import */ var _linear_scale_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./linear-scale.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/linear-scale.mjs");
"use client";


function getScrollPositionFromPointer(pointerPos, pointerOffset, sizes, dir = "ltr") {
  const thumbSizePx = (0,_get_thumb_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getThumbSize)(sizes);
  const thumbCenter = thumbSizePx / 2;
  const offset = pointerOffset || thumbCenter;
  const thumbOffsetFromEnd = thumbSizePx - offset;
  const minPointerPos = sizes.scrollbar.paddingStart + offset;
  const maxPointerPos = sizes.scrollbar.size - sizes.scrollbar.paddingEnd - thumbOffsetFromEnd;
  const maxScrollPos = sizes.content - sizes.viewport;
  const scrollRange = dir === "ltr" ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
  return (0,_linear_scale_mjs__WEBPACK_IMPORTED_MODULE_1__.linearScale)([minPointerPos, maxPointerPos], scrollRange)(pointerPos);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-offset-from-scroll.mjs"
/*!*********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-offset-from-scroll.mjs ***!
  \*********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getThumbOffsetFromScroll: () => (/* binding */ getThumbOffsetFromScroll)
/* harmony export */ });
/* harmony import */ var _get_thumb_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./get-thumb-size.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-size.mjs");
/* harmony import */ var _linear_scale_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./linear-scale.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/linear-scale.mjs");
"use client";


function clamp(value, [min, max]) {
  return Math.min(max, Math.max(min, value));
}
function getThumbOffsetFromScroll(scrollPos, sizes, dir = "ltr") {
  const thumbSizePx = (0,_get_thumb_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getThumbSize)(sizes);
  const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
  const scrollbar = sizes.scrollbar.size - scrollbarPadding;
  const maxScrollPos = sizes.content - sizes.viewport;
  const maxThumbPos = scrollbar - thumbSizePx;
  const scrollWithoutMomentum = clamp(scrollPos, dir === "ltr" ? [0, maxScrollPos] : [maxScrollPos * -1, 0]);
  return (0,_linear_scale_mjs__WEBPACK_IMPORTED_MODULE_1__.linearScale)([0, maxScrollPos], [0, maxThumbPos])(scrollWithoutMomentum);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-ratio.mjs"
/*!********************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-ratio.mjs ***!
  \********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getThumbRatio: () => (/* binding */ getThumbRatio)
/* harmony export */ });
"use client";
function getThumbRatio(viewportSize, contentSize) {
  const ratio = viewportSize / contentSize;
  return Number.isNaN(ratio) ? 0 : ratio;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-size.mjs"
/*!*******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-size.mjs ***!
  \*******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getThumbSize: () => (/* binding */ getThumbSize)
/* harmony export */ });
/* harmony import */ var _get_thumb_ratio_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./get-thumb-ratio.mjs */ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/get-thumb-ratio.mjs");
"use client";

function getThumbSize(sizes) {
  const ratio = (0,_get_thumb_ratio_mjs__WEBPACK_IMPORTED_MODULE_0__.getThumbRatio)(sizes.viewport, sizes.content);
  const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
  const thumbSize = (sizes.scrollbar.size - scrollbarPadding) * ratio;
  return Math.max(thumbSize, 18);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/is-scrolling-within-scrollbar-bounds.mjs"
/*!*****************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/utils/is-scrolling-within-scrollbar-bounds.mjs ***!
  \*****************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isScrollingWithinScrollbarBounds: () => (/* binding */ isScrollingWithinScrollbarBounds)
/* harmony export */ });
"use client";
function isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos) {
  return scrollPos > 0 && scrollPos < maxScrollPos;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/linear-scale.mjs"
/*!*****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/utils/linear-scale.mjs ***!
  \*****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   linearScale: () => (/* binding */ linearScale)
/* harmony export */ });
"use client";
function linearScale(input, output) {
  return (value) => {
    if (input[0] === input[1] || output[0] === output[1]) return output[0];
    const ratio = (output[1] - output[0]) / (input[1] - input[0]);
    return output[0] + ratio * (value - input[0]);
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/ScrollArea/utils/to-int.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/ScrollArea/utils/to-int.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   toInt: () => (/* binding */ toInt)
/* harmony export */ });
"use client";
function toInt(value) {
  return value ? parseInt(value, 10) : 0;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/SegmentedControl/SegmentedControl.mjs"
/*!*********************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/SegmentedControl/SegmentedControl.mjs ***!
  \*********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   SegmentedControl: () => (/* binding */ SegmentedControl)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_utils_primitive_primitive_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/utils/primitive/primitive.mjs */ "../../node_modules/@mantine/core/esm/core/utils/primitive/primitive.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_contrast_color_get_contrast_color_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/MantineProvider/color-functions/get-contrast-color/get-contrast-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-contrast-color/get-contrast-color.mjs");
/* harmony import */ var _core_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _FloatingIndicator_FloatingIndicator_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ../FloatingIndicator/FloatingIndicator.mjs */ "../../node_modules/@mantine/core/esm/components/FloatingIndicator/FloatingIndicator.mjs");
/* harmony import */ var _SegmentedControl_module_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./SegmentedControl.module.mjs */ "../../node_modules/@mantine/core/esm/components/SegmentedControl/SegmentedControl.module.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_12___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_12__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/utils/random-id/random-id.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-id/use-id.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-uncontrolled/use-uncontrolled.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_17__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-shallow-effect/use-shallow-effect.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_18__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-mounted/use-mounted.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_19__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";















const defaultProps = { withItemsBorders: true };
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.createVarsResolver)((theme, { radius, color, transitionDuration, size, transitionTimingFunction }) => ({ root: {
  "--sc-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getRadius)(radius),
  "--sc-color": color ? (0,_core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_3__.getThemeColor)(color, theme) : void 0,
  "--sc-shadow": color ? void 0 : "var(--mantine-shadow-xs)",
  "--sc-transition-duration": transitionDuration === void 0 ? void 0 : `${transitionDuration}ms`,
  "--sc-transition-timing-function": transitionTimingFunction,
  "--sc-padding": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "sc-padding"),
  "--sc-font-size": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getFontSize)(size)
} }));
const SegmentedControl = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_8__.genericFactory)((_props) => {
  var _a, _b, _c, _d;
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_6__.useProps)("SegmentedControl", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, vars, data, value, defaultValue, onChange, size, name, disabled, readOnly, fullWidth, orientation, radius, color, transitionDuration, transitionTimingFunction, variant, autoContrast, withItemsBorders, mod, attributes, ref, ...others } = props;
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_7__.useStyles)({
    name: "SegmentedControl",
    props,
    classes: _SegmentedControl_module_mjs__WEBPACK_IMPORTED_MODULE_11__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  const theme = (0,_core_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_5__.useMantineTheme)();
  const _data = data.map((item) => (0,_core_utils_primitive_primitive_mjs__WEBPACK_IMPORTED_MODULE_1__.isPrimitive)(item) ? {
    label: `${item}`,
    value: item
  } : item);
  const initialized = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_18__.useMounted)();
  const [key, setKey] = (0,react__WEBPACK_IMPORTED_MODULE_12__.useState)((0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_13__.randomId)());
  const [parent, setParent] = (0,react__WEBPACK_IMPORTED_MODULE_12__.useState)(null);
  const [refs, setRefs] = (0,react__WEBPACK_IMPORTED_MODULE_12__.useState)({});
  const setElementRef = (element, val) => {
    refs[val] = element;
    setRefs(refs);
  };
  const [_value, handleValueChange] = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_16__.useUncontrolled)({
    value,
    defaultValue,
    finalValue: Array.isArray(data) ? (_d = (_c = (_a = _data.find((item) => !item.disabled)) == null ? void 0 : _a.value) != null ? _c : (_b = data[0]) == null ? void 0 : _b.value) != null ? _d : null : null,
    onChange
  });
  const uuid = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_14__.useId)(name);
  const controls = _data.map((item) => /* @__PURE__ */ (0,react__WEBPACK_IMPORTED_MODULE_12__.createElement)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_9__.Box, {
    ...getStyles("control"),
    mod: {
      active: _value === item.value,
      orientation
    },
    key: `${item.value}`
  }, /* @__PURE__ */ (0,react__WEBPACK_IMPORTED_MODULE_12__.createElement)("input", {
    ...getStyles("input"),
    disabled: disabled || item.disabled,
    type: "radio",
    name: uuid,
    value: `${item.value}`,
    id: `${uuid}-${item.value}`,
    checked: _value === item.value,
    onChange: () => !readOnly && handleValueChange(item.value),
    "data-focus-ring": theme.focusRing,
    key: `${item.value}-input`
  }), /* @__PURE__ */ (0,react__WEBPACK_IMPORTED_MODULE_12__.createElement)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_9__.Box, {
    component: "label",
    ...getStyles("label"),
    mod: {
      active: _value === item.value && !(disabled || item.disabled),
      disabled: disabled || item.disabled,
      "read-only": readOnly
    },
    htmlFor: `${uuid}-${item.value}`,
    ref: (node) => setElementRef(node, `${item.value}`),
    __vars: { "--sc-label-color": color !== void 0 ? (0,_core_MantineProvider_color_functions_get_contrast_color_get_contrast_color_mjs__WEBPACK_IMPORTED_MODULE_4__.getContrastColor)({
      color,
      theme,
      autoContrast
    }) : void 0 },
    key: `${item.value}-label`
  }, /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_19__.jsx)("span", {
    ...getStyles("innerLabel"),
    children: item.label
  }))));
  const mergedRef = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_15__.useMergedRef)(ref, (node) => setParent(node));
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_17__.useShallowEffect)(() => {
    setKey((0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_13__.randomId)());
  }, [data.length]);
  if (data.length === 0) return null;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_19__.jsxs)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_9__.Box, {
    ...getStyles("root"),
    variant,
    size,
    ref: mergedRef,
    mod: [{
      "full-width": fullWidth,
      orientation,
      initialized,
      "with-items-borders": withItemsBorders
    }, mod],
    ...others,
    role: "radiogroup",
    "data-disabled": disabled,
    children: [typeof _value !== "undefined" && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_19__.jsx)(_FloatingIndicator_FloatingIndicator_mjs__WEBPACK_IMPORTED_MODULE_10__.FloatingIndicator, {
      target: refs[`${_value}`],
      parent,
      component: "span",
      transitionDuration: "var(--sc-transition-duration)",
      ...getStyles("indicator")
    }, key), controls]
  });
});
SegmentedControl.classes = _SegmentedControl_module_mjs__WEBPACK_IMPORTED_MODULE_11__["default"];
SegmentedControl.varsResolver = varsResolver;
SegmentedControl.displayName = "@mantine/core/SegmentedControl";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/SegmentedControl/SegmentedControl.module.mjs"
/*!****************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/SegmentedControl/SegmentedControl.module.mjs ***!
  \****************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ SegmentedControl_module_default)
/* harmony export */ });
"use client";
var SegmentedControl_module_default = {
  "root": "m_cf365364",
  "indicator": "m_9e182ccd",
  "label": "m_1738fcb2",
  "input": "m_1714d588",
  "control": "m_69686b9b",
  "innerLabel": "m_78882f40"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Switch/Switch.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Switch/Switch.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Switch: () => (/* binding */ Switch)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_Box_style_props_extract_style_props_extract_style_props_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/Box/style-props/extract-style-props/extract-style-props.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/extract-style-props/extract-style-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _utils_InlineInput_InlineInput_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../../utils/InlineInput/InlineInput.mjs */ "../../node_modules/@mantine/core/esm/utils/InlineInput/InlineInput.mjs");
/* harmony import */ var _SwitchGroup_SwitchGroup_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./SwitchGroup/SwitchGroup.mjs */ "../../node_modules/@mantine/core/esm/components/Switch/SwitchGroup/SwitchGroup.mjs");
/* harmony import */ var _Switch_module_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./Switch.module.mjs */ "../../node_modules/@mantine/core/esm/components/Switch/Switch.module.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_11___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_11__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-id/use-id.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-uncontrolled/use-uncontrolled.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";














const defaultProps = {
  labelPosition: "right",
  withThumbIndicator: true
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((theme, { radius, color, size }) => ({ root: {
  "--switch-radius": radius === void 0 ? void 0 : (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getRadius)(radius),
  "--switch-height": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "switch-height"),
  "--switch-width": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "switch-width"),
  "--switch-thumb-size": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "switch-thumb-size"),
  "--switch-label-font-size": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "switch-label-font-size"),
  "--switch-track-label-padding": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "switch-track-label-padding"),
  "--switch-color": color ? (0,_core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_2__.getThemeColor)(color, theme) : void 0
} }));
const Switch = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_6__.factory)((_props) => {
  var _a, _b, _c;
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("Switch", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, vars, color, label, offLabel, onLabel, id, size, radius, wrapperProps, thumbIcon, checked, defaultChecked, onChange, labelPosition, description, error, disabled, variant, rootRef, mod, withThumbIndicator, attributes, ...others } = props;
  const ctx = (0,react__WEBPACK_IMPORTED_MODULE_11__.use)(_SwitchGroup_SwitchGroup_mjs__WEBPACK_IMPORTED_MODULE_9__.SwitchGroupContext);
  const _size = size || (ctx == null ? void 0 : ctx.size);
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.useStyles)({
    name: "Switch",
    props,
    classes: _Switch_module_mjs__WEBPACK_IMPORTED_MODULE_10__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  const { styleProps, rest } = (0,_core_Box_style_props_extract_style_props_extract_style_props_mjs__WEBPACK_IMPORTED_MODULE_5__.extractStyleProps)(others);
  const uuid = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_12__.useId)(id);
  const withContextProps = {
    checked: (_a = ctx == null ? void 0 : ctx.value.includes(rest.value)) != null ? _a : checked,
    onChange: (event) => {
      ctx == null ? void 0 : ctx.onChange(event);
      onChange == null ? void 0 : onChange(event);
    }
  };
  const _disabled = disabled || ((_b = ctx == null ? void 0 : ctx.isDisabled) == null ? void 0 : _b.call(ctx, rest.value));
  const [_checked, handleChange] = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_13__.useUncontrolled)({
    value: (_c = withContextProps.checked) != null ? _c : checked,
    defaultValue: defaultChecked,
    finalValue: false
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)(_utils_InlineInput_InlineInput_mjs__WEBPACK_IMPORTED_MODULE_8__.InlineInput, {
    ...getStyles("root"),
    __staticSelector: "Switch",
    __stylesApiProps: props,
    id: uuid,
    size: _size,
    labelPosition,
    label,
    description,
    error,
    disabled: _disabled,
    bodyElement: "label",
    labelElement: "span",
    classNames,
    styles,
    unstyled,
    "data-checked": withContextProps.checked,
    variant,
    ref: rootRef,
    mod,
    attributes,
    inert: rest.inert,
    ...styleProps,
    ...wrapperProps,
    children: [/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("input", {
      ...rest,
      ...withContextProps,
      disabled: _disabled,
      checked: _checked,
      "data-checked": withContextProps.checked,
      onChange: (event) => {
        var _a2;
        (_a2 = withContextProps.onChange) == null ? void 0 : _a2.call(withContextProps, event);
        handleChange(event.currentTarget.checked);
      },
      id: uuid,
      type: "checkbox",
      role: "switch",
      inert: rest.inert,
      ...getStyles("input")
    }), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_7__.Box, {
      "aria-hidden": "true",
      component: "span",
      mod: {
        error,
        "label-position": labelPosition,
        "without-labels": !onLabel && !offLabel
      },
      ...getStyles("track"),
      children: [/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_7__.Box, {
        component: "span",
        mod: {
          "reduce-motion": true,
          "with-thumb-indicator": withThumbIndicator && !thumbIcon
        },
        ...getStyles("thumb"),
        children: thumbIcon
      }), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("span", {
        ...getStyles("trackLabel"),
        children: _checked ? onLabel : offLabel
      })]
    })]
  });
});
Switch.classes = {
  ..._Switch_module_mjs__WEBPACK_IMPORTED_MODULE_10__["default"],
  ..._utils_InlineInput_InlineInput_mjs__WEBPACK_IMPORTED_MODULE_8__.InlineInputClasses
};
Switch.varsResolver = varsResolver;
Switch.displayName = "@mantine/core/Switch";
Switch.Group = _SwitchGroup_SwitchGroup_mjs__WEBPACK_IMPORTED_MODULE_9__.SwitchGroup;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Switch/Switch.module.mjs"
/*!********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Switch/Switch.module.mjs ***!
  \********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Switch_module_default)
/* harmony export */ });
"use client";
var Switch_module_default = {
  "root": "m_5f93f3bb",
  "input": "m_926b4011",
  "track": "m_9307d992",
  "thumb": "m_93039a1d",
  "trackLabel": "m_8277e082"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Switch/SwitchGroup/SwitchGroup.mjs"
/*!******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Switch/SwitchGroup/SwitchGroup.mjs ***!
  \******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   SwitchGroup: () => (/* binding */ SwitchGroup),
/* harmony export */   SwitchGroupContext: () => (/* binding */ SwitchGroupContext)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _Input_Input_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../Input/Input.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.mjs");
/* harmony import */ var _utils_InputsGroupFieldset_InputsGroupFieldset_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../utils/InputsGroupFieldset/InputsGroupFieldset.mjs */ "../../node_modules/@mantine/core/esm/utils/InputsGroupFieldset/InputsGroupFieldset.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-uncontrolled/use-uncontrolled.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";







const SwitchGroupContext = (0,react__WEBPACK_IMPORTED_MODULE_4__.createContext)(null);
const defaultProps = { hiddenInputValuesSeparator: "," };
const SwitchGroup = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.genericFactory)(((props) => {
  const { value, defaultValue, onChange, size, wrapperProps, children, readOnly, name, hiddenInputValuesSeparator, hiddenInputProps, maxSelectedValues, disabled, ...others } = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("SwitchGroup", defaultProps, props);
  const [_value, setValue] = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_5__.useUncontrolled)({
    value,
    defaultValue,
    finalValue: [],
    onChange
  });
  const handleChange = (event) => {
    const itemValue = event.currentTarget.value;
    if (readOnly) return;
    const isCurrentlySelected = _value.includes(itemValue);
    if (!isCurrentlySelected && maxSelectedValues && _value.length >= maxSelectedValues) return;
    setValue(isCurrentlySelected ? _value.filter((item) => item !== itemValue) : [..._value, itemValue]);
  };
  const isDisabled = (switchValue) => {
    if (disabled) return true;
    if (!maxSelectedValues) return false;
    const isCurrentlySelected = _value.includes(switchValue);
    const hasReachedLimit = _value.length >= maxSelectedValues;
    return !isCurrentlySelected && hasReachedLimit;
  };
  const hiddenInputValue = _value.join(hiddenInputValuesSeparator);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(SwitchGroupContext, {
    value: {
      value: _value,
      onChange: handleChange,
      size,
      isDisabled
    },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_Input_Input_mjs__WEBPACK_IMPORTED_MODULE_2__.Input.Wrapper, {
      size,
      ...wrapperProps,
      ...others,
      labelElement: "div",
      __staticSelector: "SwitchGroup",
      children: [/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_utils_InputsGroupFieldset_InputsGroupFieldset_mjs__WEBPACK_IMPORTED_MODULE_3__.InputsGroupFieldset, {
        role: "group",
        children
      }), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)("input", {
        type: "hidden",
        name,
        value: hiddenInputValue,
        ...hiddenInputProps
      })]
    })
  });
}));
SwitchGroup.classes = _Input_Input_mjs__WEBPACK_IMPORTED_MODULE_2__.Input.Wrapper.classes;
SwitchGroup.displayName = "@mantine/core/SwitchGroup";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.context.mjs"
/*!*****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tabs/Tabs.context.mjs ***!
  \*****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   TabsProvider: () => (/* binding */ TabsProvider),
/* harmony export */   useTabsContext: () => (/* binding */ useTabsContext)
/* harmony export */ });
/* harmony import */ var _core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/create-safe-context/create-safe-context.mjs */ "../../node_modules/@mantine/core/esm/core/utils/create-safe-context/create-safe-context.mjs");
"use client";

const [TabsProvider, useTabsContext] = (0,_core_utils_create_safe_context_create_safe_context_mjs__WEBPACK_IMPORTED_MODULE_0__.createSafeContext)("Tabs component was not found in the tree");



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tabs/Tabs.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Tabs: () => (/* binding */ Tabs)
/* harmony export */ });
/* harmony import */ var _core_utils_get_safe_id_get_safe_id_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-safe-id/get-safe-id.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-safe-id/get-safe-id.mjs");
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_contrast_color_get_contrast_color_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/MantineProvider/color-functions/get-contrast-color/get-contrast-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-contrast-color/get-contrast-color.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_auto_contrast_value_get_auto_contrast_value_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/MantineProvider/color-functions/get-auto-contrast-value/get-auto-contrast-value.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-auto-contrast-value/get-auto-contrast-value.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Tabs_context_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./Tabs.context.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.context.mjs");
/* harmony import */ var _Tabs_module_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./Tabs.module.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.module.mjs");
/* harmony import */ var _TabsList_TabsList_mjs__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./TabsList/TabsList.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/TabsList/TabsList.mjs");
/* harmony import */ var _TabsPanel_TabsPanel_mjs__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! ./TabsPanel/TabsPanel.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/TabsPanel/TabsPanel.mjs");
/* harmony import */ var _TabsTab_TabsTab_mjs__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! ./TabsTab/TabsTab.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/TabsTab/TabsTab.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-id/use-id.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-uncontrolled/use-uncontrolled.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_17__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";

















const VALUE_ERROR = "Tabs.Tab or Tabs.Panel component was rendered with invalid value or without value";
const defaultProps = {
  keepMounted: true,
  keepMountedMode: "activity",
  orientation: "horizontal",
  loop: true,
  activateTabWithKeyboard: true,
  variant: "default",
  placement: "left"
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.createVarsResolver)((theme, { radius, color, autoContrast }) => ({ root: {
  "--tabs-radius": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_1__.getRadius)(radius),
  "--tabs-color": (0,_core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_3__.getThemeColor)(color, theme),
  "--tabs-text-color": (0,_core_MantineProvider_color_functions_get_auto_contrast_value_get_auto_contrast_value_mjs__WEBPACK_IMPORTED_MODULE_5__.getAutoContrastValue)(autoContrast, theme) ? (0,_core_MantineProvider_color_functions_get_contrast_color_get_contrast_color_mjs__WEBPACK_IMPORTED_MODULE_4__.getContrastColor)({
    color,
    theme,
    autoContrast
  }) : void 0
} }));
const Tabs = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_8__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_6__.useProps)("Tabs", defaultProps, _props);
  const { defaultValue, value, onChange, orientation, children, loop, id, activateTabWithKeyboard, allowTabDeactivation, variant, color, radius, inverted, placement, keepMounted, keepMountedMode, classNames, styles, unstyled, className, style, vars, autoContrast, mod, attributes, ...others } = props;
  const uid = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_15__.useId)(id);
  const [currentTab, setCurrentTab] = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_16__.useUncontrolled)({
    value,
    defaultValue,
    finalValue: null,
    onChange
  });
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_7__.useStyles)({
    name: "Tabs",
    props,
    classes: _Tabs_module_mjs__WEBPACK_IMPORTED_MODULE_11__["default"],
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_17__.jsx)(_Tabs_context_mjs__WEBPACK_IMPORTED_MODULE_10__.TabsProvider, {
    value: {
      placement,
      value: currentTab,
      orientation,
      id: uid,
      loop,
      activateTabWithKeyboard,
      getTabId: (0,_core_utils_get_safe_id_get_safe_id_mjs__WEBPACK_IMPORTED_MODULE_0__.getSafeId)(`${uid}-tab`, VALUE_ERROR),
      getPanelId: (0,_core_utils_get_safe_id_get_safe_id_mjs__WEBPACK_IMPORTED_MODULE_0__.getSafeId)(`${uid}-panel`, VALUE_ERROR),
      onChange: setCurrentTab,
      allowTabDeactivation,
      variant,
      color,
      radius,
      inverted,
      keepMounted,
      keepMountedMode,
      unstyled,
      getStyles
    },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_17__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_9__.Box, {
      id: uid,
      variant,
      mod: [{
        orientation,
        inverted: orientation === "horizontal" && inverted,
        placement: orientation === "vertical" && placement
      }, mod],
      ...getStyles("root"),
      ...others,
      children
    })
  });
});
Tabs.classes = _Tabs_module_mjs__WEBPACK_IMPORTED_MODULE_11__["default"];
Tabs.varsResolver = varsResolver;
Tabs.displayName = "@mantine/core/Tabs";
Tabs.Tab = _TabsTab_TabsTab_mjs__WEBPACK_IMPORTED_MODULE_14__.TabsTab;
Tabs.Panel = _TabsPanel_TabsPanel_mjs__WEBPACK_IMPORTED_MODULE_13__.TabsPanel;
Tabs.List = _TabsList_TabsList_mjs__WEBPACK_IMPORTED_MODULE_12__.TabsList;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.module.mjs"
/*!****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tabs/Tabs.module.mjs ***!
  \****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Tabs_module_default)
/* harmony export */ });
"use client";
var Tabs_module_default = {
  "root": "m_89d60db1",
  "list--default": "m_576c9d4",
  "list": "m_89d33d6d",
  "tab": "m_4ec4dce6",
  "panel": "m_b0c91715",
  "tabSection": "m_fc420b1f",
  "tabLabel": "m_42bbd1ae",
  "tab--default": "m_539e827b",
  "list--outline": "m_6772fbd5",
  "tab--outline": "m_b59ab47c",
  "tab--pills": "m_c3381914"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tabs/TabsList/TabsList.mjs"
/*!**********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tabs/TabsList/TabsList.mjs ***!
  \**********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   TabsList: () => (/* binding */ TabsList)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Tabs_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../Tabs.context.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.context.mjs");
/* harmony import */ var _Tabs_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../Tabs.module.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const TabsList = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("TabsList", null, _props);
  const { children, className, grow, justify, classNames, styles, style, mod, ...others } = props;
  const ctx = (0,_Tabs_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useTabsContext)();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__.Box, {
    ...ctx.getStyles("list", {
      className,
      style,
      classNames,
      styles,
      props,
      variant: ctx.variant
    }),
    role: "tablist",
    variant: ctx.variant,
    mod: [{
      grow,
      orientation: ctx.orientation,
      placement: ctx.orientation === "vertical" && ctx.placement,
      inverted: ctx.inverted
    }, mod],
    "aria-orientation": ctx.orientation,
    __vars: { "--tabs-justify": justify },
    ...others,
    children
  });
});
TabsList.classes = _Tabs_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
TabsList.displayName = "@mantine/core/TabsList";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tabs/TabsPanel/TabsPanel.mjs"
/*!************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tabs/TabsPanel/TabsPanel.mjs ***!
  \************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   TabsPanel: () => (/* binding */ TabsPanel)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/MantineProvider/Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Tabs_context_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../Tabs.context.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.context.mjs");
/* harmony import */ var _Tabs_module_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../Tabs.module.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.module.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_6___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_6__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";








const TabsPanel = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_1__.useProps)("TabsPanel", null, _props);
  const { children, className, value, classNames, styles, style, mod, keepMounted, ...others } = props;
  const env = (0,_core_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useMantineEnv)();
  const ctx = (0,_Tabs_context_mjs__WEBPACK_IMPORTED_MODULE_4__.useTabsContext)();
  const active = ctx.value === value;
  const shouldKeepMounted = ctx.keepMounted || keepMounted;
  const useActivity = ctx.keepMountedMode !== "display-none";
  const content = shouldKeepMounted && useActivity && env !== "test" ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(react__WEBPACK_IMPORTED_MODULE_6__.Activity, {
    mode: active ? "visible" : "hidden",
    children
  }) : shouldKeepMounted ? children : active ? children : null;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_3__.Box, {
    ...ctx.getStyles("panel", {
      className,
      classNames,
      styles,
      style: [style, !active ? { display: "none" } : void 0],
      props
    }),
    mod: [{ orientation: ctx.orientation }, mod],
    role: "tabpanel",
    id: ctx.getPanelId(value),
    "aria-labelledby": ctx.getTabId(value),
    ...others,
    children: content
  });
});
TabsPanel.classes = _Tabs_module_mjs__WEBPACK_IMPORTED_MODULE_5__["default"];
TabsPanel.displayName = "@mantine/core/TabsPanel";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tabs/TabsTab/TabsTab.mjs"
/*!********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tabs/TabsTab/TabsTab.mjs ***!
  \********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   TabsTab: () => (/* binding */ TabsTab)
/* harmony export */ });
/* harmony import */ var _core_utils_create_scoped_keydown_handler_create_scoped_keydown_handler_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/create-scoped-keydown-handler/create-scoped-keydown-handler.mjs */ "../../node_modules/@mantine/core/esm/core/utils/create-scoped-keydown-handler/create-scoped-keydown-handler.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs");
/* harmony import */ var _core_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_DirectionProvider_DirectionProvider_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../../core/DirectionProvider/DirectionProvider.mjs */ "../../node_modules/@mantine/core/esm/core/DirectionProvider/DirectionProvider.mjs");
/* harmony import */ var _UnstyledButton_UnstyledButton_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../UnstyledButton/UnstyledButton.mjs */ "../../node_modules/@mantine/core/esm/components/UnstyledButton/UnstyledButton.mjs");
/* harmony import */ var _Tabs_context_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../Tabs.context.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.context.mjs");
/* harmony import */ var _Tabs_module_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../Tabs.module.mjs */ "../../node_modules/@mantine/core/esm/components/Tabs/Tabs.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";










const TabsTab = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("TabsTab", null, _props);
  const { className, children, rightSection, leftSection, value, onClick, onKeyDown, disabled, color, style, classNames, styles, vars, mod, tabIndex, ...others } = props;
  const theme = (0,_core_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_2__.useMantineTheme)();
  const { dir } = (0,_core_DirectionProvider_DirectionProvider_mjs__WEBPACK_IMPORTED_MODULE_5__.useDirection)();
  const ctx = (0,_Tabs_context_mjs__WEBPACK_IMPORTED_MODULE_7__.useTabsContext)();
  const active = value === ctx.value;
  const activateTab = (event) => {
    ctx.onChange(ctx.allowTabDeactivation ? value === ctx.value ? null : value : value);
    onClick == null ? void 0 : onClick(event);
  };
  const stylesApiProps = {
    classNames,
    styles,
    props
  };
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__.jsxs)(_UnstyledButton_UnstyledButton_mjs__WEBPACK_IMPORTED_MODULE_6__.UnstyledButton, {
    ...ctx.getStyles("tab", {
      className,
      style,
      variant: ctx.variant,
      ...stylesApiProps
    }),
    disabled,
    unstyled: ctx.unstyled,
    variant: ctx.variant,
    mod: [{
      active,
      disabled,
      orientation: ctx.orientation,
      inverted: ctx.inverted,
      placement: ctx.orientation === "vertical" && ctx.placement
    }, mod],
    role: "tab",
    id: ctx.getTabId(value),
    "aria-selected": active,
    tabIndex: tabIndex !== void 0 ? tabIndex : active || ctx.value === null ? 0 : -1,
    "aria-controls": ctx.getPanelId(value),
    onClick: activateTab,
    __vars: { "--tabs-color": color ? (0,_core_MantineProvider_color_functions_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_1__.getThemeColor)(color, theme) : void 0 },
    onKeyDown: (0,_core_utils_create_scoped_keydown_handler_create_scoped_keydown_handler_mjs__WEBPACK_IMPORTED_MODULE_0__.createScopedKeydownHandler)({
      siblingSelector: '[role="tab"]',
      parentSelector: '[role="tablist"]',
      activateOnFocus: ctx.activateTabWithKeyboard,
      loop: ctx.loop,
      orientation: ctx.orientation || "horizontal",
      dir,
      onKeyDown
    }),
    ...others,
    children: [
      leftSection && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__.jsx)("span", {
        ...ctx.getStyles("tabSection", stylesApiProps),
        "data-position": "left",
        children: leftSection
      }),
      children && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__.jsx)("span", {
        ...ctx.getStyles("tabLabel", stylesApiProps),
        children
      }),
      rightSection && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_9__.jsx)("span", {
        ...ctx.getStyles("tabSection", stylesApiProps),
        "data-position": "right",
        children: rightSection
      })
    ]
  });
});
TabsTab.classes = _Tabs_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"];
TabsTab.displayName = "@mantine/core/TabsTab";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Text/Text.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Text/Text.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Text: () => (/* binding */ Text)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_color_functions_get_gradient_get_gradient_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/MantineProvider/color-functions/get-gradient/get-gradient.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-gradient/get-gradient.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/factory/polymorphic-factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Text_module_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./Text.module.mjs */ "../../node_modules/@mantine/core/esm/components/Text/Text.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";









function getTextTruncate(truncate) {
  if (truncate === "start") return "start";
  if (truncate === "end" || truncate) return "end";
}
const defaultProps = { inherit: false };
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((theme, { variant, lineClamp, gradient, size }) => ({ root: {
  "--text-fz": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getFontSize)(size),
  "--text-lh": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getLineHeight)(size),
  "--text-gradient": variant === "gradient" ? (0,_core_MantineProvider_color_functions_get_gradient_get_gradient_mjs__WEBPACK_IMPORTED_MODULE_2__.getGradient)(gradient, theme) : void 0,
  "--text-line-clamp": typeof lineClamp === "number" ? lineClamp.toString() : void 0
} }));
const Text = (0,_core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_5__.polymorphicFactory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_3__.useProps)("Text", defaultProps, _props);
  const { lineClamp, truncate, inline, inherit, gradient, span, __staticSelector, vars, className, style, classNames, styles, unstyled, variant, mod, size, attributes, ...others } = props;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_8__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_6__.Box, {
    ...(0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.useStyles)({
      name: ["Text", __staticSelector],
      props,
      classes: _Text_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"],
      className,
      style,
      classNames,
      styles,
      unstyled,
      attributes,
      vars,
      varsResolver
    })("root", { focusable: true }),
    component: span ? "span" : "p",
    variant,
    mod: [{
      "data-truncate": getTextTruncate(truncate),
      "data-line-clamp": typeof lineClamp === "number",
      "data-inline": inline,
      "data-inherit": inherit
    }, mod],
    size,
    ...others
  });
});
Text.classes = _Text_module_mjs__WEBPACK_IMPORTED_MODULE_7__["default"];
Text.varsResolver = varsResolver;
Text.displayName = "@mantine/core/Text";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Text/Text.module.mjs"
/*!****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Text/Text.module.mjs ***!
  \****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Text_module_default)
/* harmony export */ });
"use client";
var Text_module_default = { "root": "m_b6d8b162" };



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/TextInput/TextInput.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/TextInput/TextInput.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   TextInput: () => (/* binding */ TextInput)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _InputBase_InputBase_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../InputBase/InputBase.mjs */ "../../node_modules/@mantine/core/esm/components/InputBase/InputBase.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




const TextInput = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_1__.factory)((props) => {
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(_InputBase_InputBase_mjs__WEBPACK_IMPORTED_MODULE_2__.InputBase, {
    component: "input",
    ...(0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("TextInput", null, props),
    __staticSelector: "TextInput"
  });
});
TextInput.classes = _InputBase_InputBase_mjs__WEBPACK_IMPORTED_MODULE_2__.InputBase.classes;
TextInput.displayName = "@mantine/core/TextInput";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Transition/Transition.mjs"
/*!*********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Transition/Transition.mjs ***!
  \*********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Transition: () => (/* binding */ Transition)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var _get_transition_styles_get_transition_styles_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./get-transition-styles/get-transition-styles.mjs */ "../../node_modules/@mantine/core/esm/components/Transition/get-transition-styles/get-transition-styles.mjs");
/* harmony import */ var _use_transition_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./use-transition.mjs */ "../../node_modules/@mantine/core/esm/components/Transition/use-transition.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";





function Transition({ keepMounted, transition = "fade", duration = 250, exitDuration = duration, mounted, children, timingFunction = "ease", onExit, onEntered, onEnter, onExited, enterDelay, exitDelay }) {
  const env = (0,_core_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useMantineEnv)();
  const { transitionDuration, transitionStatus, transitionTimingFunction } = (0,_use_transition_mjs__WEBPACK_IMPORTED_MODULE_2__.useTransition)({
    mounted,
    exitDuration,
    duration,
    timingFunction,
    onExit,
    onEntered,
    onEnter,
    onExited,
    enterDelay,
    exitDelay
  });
  if (env === "test") return mounted ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.jsx)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.Fragment, { children: children({}) }) : keepMounted ? children({ display: "none" }) : null;
  if (transitionDuration === 0) {
    if (keepMounted) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.jsx)(react__WEBPACK_IMPORTED_MODULE_3__.Activity, {
      mode: mounted ? "visible" : "hidden",
      children: children({})
    });
    return mounted ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.jsx)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.Fragment, { children: children({}) }) : null;
  }
  const isExited = transitionStatus === "exited";
  if (keepMounted) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.jsx)(react__WEBPACK_IMPORTED_MODULE_3__.Activity, {
    mode: isExited ? "hidden" : "visible",
    children: children(isExited ? {} : (0,_get_transition_styles_get_transition_styles_mjs__WEBPACK_IMPORTED_MODULE_1__.getTransitionStyles)({
      transition,
      duration: transitionDuration,
      state: transitionStatus,
      timingFunction: transitionTimingFunction
    }))
  });
  return isExited ? null : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.jsx)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_4__.Fragment, { children: children((0,_get_transition_styles_get_transition_styles_mjs__WEBPACK_IMPORTED_MODULE_1__.getTransitionStyles)({
    transition,
    duration: transitionDuration,
    state: transitionStatus,
    timingFunction: transitionTimingFunction
  })) });
}
Transition.displayName = "@mantine/core/Transition";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Transition/get-transition-styles/get-transition-styles.mjs"
/*!******************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Transition/get-transition-styles/get-transition-styles.mjs ***!
  \******************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getTransitionStyles: () => (/* binding */ getTransitionStyles)
/* harmony export */ });
/* harmony import */ var _transitions_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../transitions.mjs */ "../../node_modules/@mantine/core/esm/components/Transition/transitions.mjs");
"use client";

const transitionStatuses = {
  entering: "in",
  entered: "in",
  exiting: "out",
  exited: "out",
  "pre-exiting": "out",
  "pre-entering": "out"
};
function getTransitionStyles({ transition, state, duration, timingFunction }) {
  const shared = {
    WebkitBackfaceVisibility: "hidden",
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: timingFunction
  };
  if (typeof transition === "string") {
    if (!(transition in _transitions_mjs__WEBPACK_IMPORTED_MODULE_0__.transitions)) return {};
    return {
      transitionProperty: _transitions_mjs__WEBPACK_IMPORTED_MODULE_0__.transitions[transition].transitionProperty,
      ...shared,
      ..._transitions_mjs__WEBPACK_IMPORTED_MODULE_0__.transitions[transition].common,
      ..._transitions_mjs__WEBPACK_IMPORTED_MODULE_0__.transitions[transition][transitionStatuses[state]]
    };
  }
  return {
    transitionProperty: transition.transitionProperty,
    ...shared,
    ...transition.common,
    ...transition[transitionStatuses[state]]
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Transition/transitions.mjs"
/*!**********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Transition/transitions.mjs ***!
  \**********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   transitions: () => (/* binding */ transitions)
/* harmony export */ });
"use client";
const popIn = (from) => ({
  in: {
    opacity: 1,
    transform: "scale(1)"
  },
  out: {
    opacity: 0,
    transform: `scale(.9) translateY(${from === "bottom" ? 10 : -10}px)`
  },
  transitionProperty: "transform, opacity"
});
const transitions = {
  fade: {
    in: { opacity: 1 },
    out: { opacity: 0 },
    transitionProperty: "opacity"
  },
  "fade-up": {
    in: {
      opacity: 1,
      transform: "translateY(0)"
    },
    out: {
      opacity: 0,
      transform: "translateY(30px)"
    },
    transitionProperty: "opacity, transform"
  },
  "fade-down": {
    in: {
      opacity: 1,
      transform: "translateY(0)"
    },
    out: {
      opacity: 0,
      transform: "translateY(-30px)"
    },
    transitionProperty: "opacity, transform"
  },
  "fade-left": {
    in: {
      opacity: 1,
      transform: "translateX(0)"
    },
    out: {
      opacity: 0,
      transform: "translateX(30px)"
    },
    transitionProperty: "opacity, transform"
  },
  "fade-right": {
    in: {
      opacity: 1,
      transform: "translateX(0)"
    },
    out: {
      opacity: 0,
      transform: "translateX(-30px)"
    },
    transitionProperty: "opacity, transform"
  },
  scale: {
    in: {
      opacity: 1,
      transform: "scale(1)"
    },
    out: {
      opacity: 0,
      transform: "scale(0)"
    },
    common: { transformOrigin: "top" },
    transitionProperty: "transform, opacity"
  },
  "scale-y": {
    in: {
      opacity: 1,
      transform: "scaleY(1)"
    },
    out: {
      opacity: 0,
      transform: "scaleY(0)"
    },
    common: { transformOrigin: "top" },
    transitionProperty: "transform, opacity"
  },
  "scale-x": {
    in: {
      opacity: 1,
      transform: "scaleX(1)"
    },
    out: {
      opacity: 0,
      transform: "scaleX(0)"
    },
    common: { transformOrigin: "left" },
    transitionProperty: "transform, opacity"
  },
  "skew-up": {
    in: {
      opacity: 1,
      transform: "translateY(0) skew(0deg, 0deg)"
    },
    out: {
      opacity: 0,
      transform: "translateY(-20px) skew(-10deg, -5deg)"
    },
    common: { transformOrigin: "top" },
    transitionProperty: "transform, opacity"
  },
  "skew-down": {
    in: {
      opacity: 1,
      transform: "translateY(0) skew(0deg, 0deg)"
    },
    out: {
      opacity: 0,
      transform: "translateY(20px) skew(-10deg, -5deg)"
    },
    common: { transformOrigin: "bottom" },
    transitionProperty: "transform, opacity"
  },
  "rotate-left": {
    in: {
      opacity: 1,
      transform: "translateY(0) rotate(0deg)"
    },
    out: {
      opacity: 0,
      transform: "translateY(20px) rotate(-5deg)"
    },
    common: { transformOrigin: "bottom" },
    transitionProperty: "transform, opacity"
  },
  "rotate-right": {
    in: {
      opacity: 1,
      transform: "translateY(0) rotate(0deg)"
    },
    out: {
      opacity: 0,
      transform: "translateY(20px) rotate(5deg)"
    },
    common: { transformOrigin: "top" },
    transitionProperty: "transform, opacity"
  },
  "slide-down": {
    in: {
      opacity: 1,
      transform: "translateY(0)"
    },
    out: {
      opacity: 0,
      transform: "translateY(-100%)"
    },
    common: { transformOrigin: "top" },
    transitionProperty: "transform, opacity"
  },
  "slide-up": {
    in: {
      opacity: 1,
      transform: "translateY(0)"
    },
    out: {
      opacity: 0,
      transform: "translateY(100%)"
    },
    common: { transformOrigin: "bottom" },
    transitionProperty: "transform, opacity"
  },
  "slide-left": {
    in: {
      opacity: 1,
      transform: "translateX(0)"
    },
    out: {
      opacity: 0,
      transform: "translateX(100%)"
    },
    common: { transformOrigin: "left" },
    transitionProperty: "transform, opacity"
  },
  "slide-right": {
    in: {
      opacity: 1,
      transform: "translateX(0)"
    },
    out: {
      opacity: 0,
      transform: "translateX(-100%)"
    },
    common: { transformOrigin: "right" },
    transitionProperty: "transform, opacity"
  },
  pop: {
    ...popIn("bottom"),
    common: { transformOrigin: "center center" }
  },
  "pop-bottom-left": {
    ...popIn("bottom"),
    common: { transformOrigin: "bottom left" }
  },
  "pop-bottom-right": {
    ...popIn("bottom"),
    common: { transformOrigin: "bottom right" }
  },
  "pop-top-left": {
    ...popIn("top"),
    common: { transformOrigin: "top left" }
  },
  "pop-top-right": {
    ...popIn("top"),
    common: { transformOrigin: "top right" }
  }
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Transition/use-transition.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Transition/use-transition.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useTransition: () => (/* binding */ useTransition)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-did-update/use-did-update.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-reduced-motion/use-reduced-motion.mjs");
/* harmony import */ var react_dom__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react-dom */ "../../node_modules/react-dom/index.js");
"use client";




function useTransition({ duration, exitDuration, timingFunction, mounted, onEnter, onExit, onEntered, onExited, enterDelay, exitDelay }) {
  const theme = (0,_core_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_0__.useMantineTheme)();
  const shouldReduceMotion = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_3__.useReducedMotion)();
  const reduceMotion = theme.respectReducedMotion ? shouldReduceMotion : false;
  const [transitionDuration, setTransitionDuration] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(reduceMotion ? 0 : duration);
  const [transitionStatus, setStatus] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(mounted ? "entered" : "exited");
  const transitionTimeoutRef = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(-1);
  const delayTimeoutRef = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(-1);
  const rafRef = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(-1);
  function clearAllTimeouts() {
    window.clearTimeout(transitionTimeoutRef.current);
    window.clearTimeout(delayTimeoutRef.current);
    cancelAnimationFrame(rafRef.current);
  }
  const handleStateChange = (shouldMount) => {
    clearAllTimeouts();
    const preHandler = shouldMount ? onEnter : onExit;
    const handler = shouldMount ? onEntered : onExited;
    const newTransitionDuration = reduceMotion ? 0 : shouldMount ? duration : exitDuration;
    setTransitionDuration(newTransitionDuration);
    if (newTransitionDuration === 0) {
      typeof preHandler === "function" && preHandler();
      typeof handler === "function" && handler();
      setStatus(shouldMount ? "entered" : "exited");
    } else rafRef.current = requestAnimationFrame(() => {
      react_dom__WEBPACK_IMPORTED_MODULE_4__.flushSync(() => {
        setStatus(shouldMount ? "pre-entering" : "pre-exiting");
      });
      rafRef.current = requestAnimationFrame(() => {
        typeof preHandler === "function" && preHandler();
        setStatus(shouldMount ? "entering" : "exiting");
        transitionTimeoutRef.current = window.setTimeout(() => {
          typeof handler === "function" && handler();
          setStatus(shouldMount ? "entered" : "exited");
        }, newTransitionDuration);
      });
    });
  };
  const handleTransitionWithDelay = (shouldMount) => {
    clearAllTimeouts();
    if (typeof (shouldMount ? enterDelay : exitDelay) !== "number") {
      handleStateChange(shouldMount);
      return;
    }
    delayTimeoutRef.current = window.setTimeout(() => {
      handleStateChange(shouldMount);
    }, shouldMount ? enterDelay : exitDelay);
  };
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_2__.useDidUpdate)(() => {
    handleTransitionWithDelay(mounted);
  }, [mounted]);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => () => {
    clearAllTimeouts();
  }, []);
  return {
    transitionDuration,
    transitionStatus,
    transitionTimingFunction: timingFunction || "ease"
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tree/Tree.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tree/Tree.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Tree: () => (/* binding */ Tree)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/create-vars-resolver/create-vars-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _TreeNode_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./TreeNode.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/TreeNode.mjs");
/* harmony import */ var _use_tree_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./use-tree.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/use-tree.mjs");
/* harmony import */ var _Tree_module_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./Tree.module.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/Tree.module.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_9___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_9__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-click-outside/use-click-outside.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";












function getFlatValues(data) {
  return data.reduce((acc, item) => {
    acc.push(item.value);
    if (item.children) acc.push(...getFlatValues(item.children));
    return acc;
  }, []);
}
const defaultProps = {
  expandOnClick: true,
  allowRangeSelection: true,
  expandOnSpace: true
};
const varsResolver = (0,_core_styles_api_create_vars_resolver_create_vars_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.createVarsResolver)((_theme, { levelOffset }) => ({ root: { "--level-offset": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSpacing)(levelOffset) } }));
const Tree = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_4__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_2__.useProps)("Tree", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, vars, data, expandOnClick, tree, renderNode, selectOnClick, clearSelectionOnOutsideClick, allowRangeSelection, expandOnSpace, levelOffset, checkOnSpace, keepMounted, onDragDrop, allowDrop, withDragHandle, withLines, attributes, ref, ...others } = props;
  const defaultController = (0,_use_tree_mjs__WEBPACK_IMPORTED_MODULE_7__.useTree)();
  const controller = tree || defaultController;
  const dragStateRef = (0,react__WEBPACK_IMPORTED_MODULE_9__.useRef)({
    draggedValue: null,
    currentDropTarget: null
  });
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_3__.useStyles)({
    name: "Tree",
    classes: _Tree_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"],
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  const mergedRef = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_11__.useMergedRef)(ref, (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_10__.useClickOutside)(() => clearSelectionOnOutsideClick && controller.clearSelected()));
  const flatValues = (0,react__WEBPACK_IMPORTED_MODULE_9__.useMemo)(() => getFlatValues(data), [data]);
  (0,react__WEBPACK_IMPORTED_MODULE_9__.useEffect)(() => {
    controller.initialize(data);
  }, [data]);
  const nodes = data.map((node, index) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_12__.jsx)(_TreeNode_mjs__WEBPACK_IMPORTED_MODULE_6__.TreeNode, {
    node,
    getStyles,
    rootIndex: index,
    expandOnClick,
    selectOnClick,
    controller,
    renderNode,
    flatValues,
    allowRangeSelection,
    expandOnSpace,
    checkOnSpace,
    keepMounted,
    onDragDrop,
    allowDrop,
    withDragHandle,
    dragStateRef,
    data
  }, node.value));
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_12__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_5__.Box, {
    component: "ul",
    ref: mergedRef,
    ...getStyles("root"),
    ...others,
    role: "tree",
    "aria-multiselectable": controller.multiple,
    "data-tree-root": true,
    "data-with-lines": withLines || void 0,
    children: nodes
  });
});
Tree.displayName = "@mantine/core/Tree";
Tree.classes = _Tree_module_mjs__WEBPACK_IMPORTED_MODULE_8__["default"];
Tree.varsResolver = varsResolver;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tree/Tree.module.mjs"
/*!****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tree/Tree.module.mjs ***!
  \****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Tree_module_default)
/* harmony export */ });
"use client";
var Tree_module_default = {
  "root": "m_f698e191",
  "subtree": "m_75f3ecf",
  "node": "m_f6970eb1",
  "label": "m_dc283425"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tree/TreeNode.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tree/TreeNode.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   TreeNode: () => (/* binding */ TreeNode)
/* harmony export */ });
/* harmony import */ var _core_utils_find_element_ancestor_find_element_ancestor_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/find-element-ancestor/find-element-ancestor.mjs */ "../../node_modules/@mantine/core/esm/core/utils/find-element-ancestor/find-element-ancestor.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _Loader_Loader_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../Loader/Loader.mjs */ "../../node_modules/@mantine/core/esm/components/Loader/Loader.mjs");
/* harmony import */ var _use_tree_node_drag_drop_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./use-tree-node-drag-drop.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/use-tree-node-drag-drop.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






function getValuesRange(anchor, value, flatValues) {
  if (!anchor || !value) return [];
  const anchorIndex = flatValues.indexOf(anchor);
  const valueIndex = flatValues.indexOf(value);
  const start = Math.min(anchorIndex, valueIndex);
  const end = Math.max(anchorIndex, valueIndex);
  return flatValues.slice(start, end + 1);
}
function TreeNode({ node, getStyles, rootIndex, controller, expandOnClick, selectOnClick, isSubtree, level = 1, renderNode, flatValues, allowRangeSelection, expandOnSpace, checkOnSpace, keepMounted, onDragDrop, allowDrop, withDragHandle, dragStateRef, data }) {
  const ref = (0,react__WEBPACK_IMPORTED_MODULE_4__.useRef)(null);
  const hasLoadedChildren = Array.isArray(node.children);
  const hasAsyncChildren = !!node.hasChildren && !hasLoadedChildren;
  const hasChildren = hasLoadedChildren || hasAsyncChildren;
  const isLoading = controller.isNodeLoading(node.value);
  const loadError = controller.getNodeLoadError(node.value);
  const isExpanded = controller.expandedState[node.value] || false;
  const nested = (node.children || []).map((child) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(TreeNode, {
    node: child,
    flatValues,
    getStyles,
    rootIndex: void 0,
    level: level + 1,
    controller,
    expandOnClick,
    isSubtree: true,
    renderNode,
    selectOnClick,
    allowRangeSelection,
    expandOnSpace,
    checkOnSpace,
    keepMounted,
    onDragDrop,
    allowDrop,
    withDragHandle,
    dragStateRef,
    data
  }, child.value));
  const { elementProps: dragElementProps, dragHandleProps } = (0,_use_tree_node_drag_drop_mjs__WEBPACK_IMPORTED_MODULE_3__.useTreeNodeDragDrop)({
    nodeValue: node.value,
    hasChildren,
    data,
    onDragDrop,
    dragStateRef,
    allowDrop,
    withDragHandle
  });
  const handleKeyDown = (event) => {
    var _a, _b, _c;
    if (event.nativeEvent.code === "ArrowRight") {
      event.stopPropagation();
      event.preventDefault();
      if (isExpanded) (_a = event.currentTarget.querySelector("[role=treeitem]")) == null ? void 0 : _a.focus();
      else controller.expand(node.value);
    }
    if (event.nativeEvent.code === "ArrowLeft") {
      event.stopPropagation();
      event.preventDefault();
      if (isExpanded && hasChildren) controller.collapse(node.value);
      else if (isSubtree) (_b = (0,_core_utils_find_element_ancestor_find_element_ancestor_mjs__WEBPACK_IMPORTED_MODULE_0__.findElementAncestor)(event.currentTarget, "[role=treeitem]")) == null ? void 0 : _b.focus();
    }
    if (event.nativeEvent.code === "ArrowDown" || event.nativeEvent.code === "ArrowUp") {
      const root = (0,_core_utils_find_element_ancestor_find_element_ancestor_mjs__WEBPACK_IMPORTED_MODULE_0__.findElementAncestor)(event.currentTarget, "[data-tree-root]");
      if (!root) return;
      event.stopPropagation();
      event.preventDefault();
      const nodes = Array.from(root.querySelectorAll("[role=treeitem]")).filter((treeNode) => treeNode.style.display !== "none");
      const index = nodes.indexOf(event.currentTarget);
      if (index === -1) return;
      const nextIndex = event.nativeEvent.code === "ArrowDown" ? index + 1 : index - 1;
      (_c = nodes[nextIndex]) == null ? void 0 : _c.focus();
      if (event.shiftKey) {
        const selectNode = nodes[nextIndex];
        if (selectNode) controller.setSelectedState(getValuesRange(controller.anchorNode, selectNode.dataset.value, flatValues));
      }
    }
    if (event.nativeEvent.code === "Space") {
      if (expandOnSpace) {
        event.stopPropagation();
        event.preventDefault();
        controller.toggleExpanded(node.value);
      }
      if (checkOnSpace) {
        event.stopPropagation();
        event.preventDefault();
        controller.isNodeChecked(node.value) ? controller.uncheckNode(node.value) : controller.checkNode(node.value);
      }
    }
  };
  const handleNodeClick = (event) => {
    var _a, _b;
    event.stopPropagation();
    if (allowRangeSelection && event.shiftKey && controller.anchorNode) {
      controller.setSelectedState(getValuesRange(controller.anchorNode, node.value, flatValues));
      (_a = ref.current) == null ? void 0 : _a.focus();
    } else {
      if (expandOnClick) controller.toggleExpanded(node.value);
      selectOnClick && controller.select(node.value);
      (_b = ref.current) == null ? void 0 : _b.focus();
    }
  };
  const selected = controller.selectedState.includes(node.value);
  const elementProps = {
    ...getStyles("label"),
    onClick: handleNodeClick,
    "data-selected": selected || void 0,
    "data-value": node.value,
    ...dragElementProps
  };
  const withLoadingIndicator = isExpanded && isLoading && nested.length === 0;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsxs)("li", {
    ...getStyles("node", { style: { "--label-offset": `calc(var(--level-offset) * ${level - 1})` } }),
    role: "treeitem",
    "aria-selected": selected,
    "data-value": node.value,
    "data-selected": selected || void 0,
    "data-level": level,
    tabIndex: rootIndex === 0 ? 0 : -1,
    onKeyDown: handleKeyDown,
    ref,
    children: [
      typeof renderNode === "function" ? renderNode({
        node,
        level,
        selected,
        tree: controller,
        expanded: isExpanded,
        hasChildren,
        isLoading,
        loadError,
        elementProps,
        dragHandleProps
      }) : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)("div", {
        ...elementProps,
        children: node.label
      }),
      withLoadingIndicator && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_1__.Box, {
        component: "ul",
        role: "group",
        ...getStyles("subtree"),
        "data-level": level,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)("li", {
          ...getStyles("node", { style: { "--label-offset": `calc(var(--level-offset) * ${level})` } }),
          children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)("div", {
            ...getStyles("label"),
            children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_Loader_Loader_mjs__WEBPACK_IMPORTED_MODULE_2__.Loader, { size: 16 })
          })
        })
      }),
      keepMounted && nested.length > 0 ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(react__WEBPACK_IMPORTED_MODULE_4__.Activity, {
        mode: isExpanded ? "visible" : "hidden",
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_1__.Box, {
          component: "ul",
          role: "group",
          ...getStyles("subtree"),
          "data-level": level,
          children: nested
        })
      }) : isExpanded && nested.length > 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_1__.Box, {
        component: "ul",
        role: "group",
        ...getStyles("subtree"),
        "data-level": level,
        children: nested
      })
    ]
  });
}
TreeNode.displayName = "@mantine/core/TreeNode";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tree/get-all-checked-nodes/get-all-checked-nodes.mjs"
/*!************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tree/get-all-checked-nodes/get-all-checked-nodes.mjs ***!
  \************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getAllCheckedNodes: () => (/* binding */ getAllCheckedNodes)
/* harmony export */ });
"use client";
function getAllCheckedNodes(data, checkedState, acc = []) {
  const currentTreeChecked = [];
  for (const node of data) if (Array.isArray(node.children) && node.children.length > 0) {
    const innerChecked = getAllCheckedNodes(node.children, checkedState, acc);
    if (innerChecked.currentTreeChecked.length === node.children.length) {
      const isChecked = innerChecked.currentTreeChecked.every((item2) => item2.checked);
      const item = {
        checked: isChecked,
        indeterminate: !isChecked,
        value: node.value,
        hasChildren: true
      };
      currentTreeChecked.push(item);
      acc.push(item);
    } else if (innerChecked.currentTreeChecked.length > 0) {
      const item = {
        checked: false,
        indeterminate: true,
        value: node.value,
        hasChildren: true
      };
      currentTreeChecked.push(item);
      acc.push(item);
    }
  } else if (checkedState.includes(node.value)) {
    const item = {
      checked: true,
      indeterminate: false,
      value: node.value,
      hasChildren: false
    };
    currentTreeChecked.push(item);
    acc.push(item);
  }
  return {
    result: acc,
    currentTreeChecked
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tree/get-children-nodes-values/get-children-nodes-values.mjs"
/*!********************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tree/get-children-nodes-values/get-children-nodes-values.mjs ***!
  \********************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   findTreeNode: () => (/* binding */ findTreeNode),
/* harmony export */   getAllChildrenNodes: () => (/* binding */ getAllChildrenNodes),
/* harmony export */   getChildrenNodesValues: () => (/* binding */ getChildrenNodesValues)
/* harmony export */ });
"use client";
function findTreeNode(value, data) {
  for (const node of data) {
    if (node.value === value) return node;
    if (Array.isArray(node.children)) {
      const childNode = findTreeNode(value, node.children);
      if (childNode) return childNode;
    }
  }
  return null;
}
function getChildrenNodesValues(value, data, acc = []) {
  const node = findTreeNode(value, data);
  if (!node) return acc;
  if (!Array.isArray(node.children) || node.children.length === 0) return [node.value];
  node.children.forEach((child) => {
    if (Array.isArray(child.children) && child.children.length > 0) getChildrenNodesValues(child.value, data, acc);
    else acc.push(child.value);
  });
  return acc;
}
function getAllChildrenNodes(data) {
  return data.reduce((acc, node) => {
    if (Array.isArray(node.children) && node.children.length > 0) acc.push(...getAllChildrenNodes(node.children));
    else acc.push(node.value);
    return acc;
  }, []);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tree/is-node-checked/is-node-checked.mjs"
/*!************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tree/is-node-checked/is-node-checked.mjs ***!
  \************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   memoizedIsNodeChecked: () => (/* binding */ memoizedIsNodeChecked)
/* harmony export */ });
/* harmony import */ var _core_utils_memoize_memoize_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/memoize/memoize.mjs */ "../../node_modules/@mantine/core/esm/core/utils/memoize/memoize.mjs");
/* harmony import */ var _get_all_checked_nodes_get_all_checked_nodes_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../get-all-checked-nodes/get-all-checked-nodes.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/get-all-checked-nodes/get-all-checked-nodes.mjs");
"use client";


function isNodeChecked(value, data, checkedState) {
  if (checkedState.length === 0) return false;
  if (checkedState.includes(value)) return true;
  return (0,_get_all_checked_nodes_get_all_checked_nodes_mjs__WEBPACK_IMPORTED_MODULE_1__.getAllCheckedNodes)(data, checkedState).result.some((node) => node.value === value && node.checked);
}
const memoizedIsNodeChecked = (0,_core_utils_memoize_memoize_mjs__WEBPACK_IMPORTED_MODULE_0__.memoize)(isNodeChecked);



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tree/is-node-indeterminate/is-node-indeterminate.mjs"
/*!************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tree/is-node-indeterminate/is-node-indeterminate.mjs ***!
  \************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   memoizedIsNodeIndeterminate: () => (/* binding */ memoizedIsNodeIndeterminate)
/* harmony export */ });
/* harmony import */ var _core_utils_memoize_memoize_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/utils/memoize/memoize.mjs */ "../../node_modules/@mantine/core/esm/core/utils/memoize/memoize.mjs");
/* harmony import */ var _get_all_checked_nodes_get_all_checked_nodes_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../get-all-checked-nodes/get-all-checked-nodes.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/get-all-checked-nodes/get-all-checked-nodes.mjs");
"use client";


function isNodeIndeterminate(value, data, checkedState) {
  if (checkedState.length === 0) return false;
  return (0,_get_all_checked_nodes_get_all_checked_nodes_mjs__WEBPACK_IMPORTED_MODULE_1__.getAllCheckedNodes)(data, checkedState).result.some((node) => node.value === value && node.indeterminate);
}
const memoizedIsNodeIndeterminate = (0,_core_utils_memoize_memoize_mjs__WEBPACK_IMPORTED_MODULE_0__.memoize)(isNodeIndeterminate);



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tree/use-tree-node-drag-drop.mjs"
/*!****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tree/use-tree-node-drag-drop.mjs ***!
  \****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useTreeNodeDragDrop: () => (/* binding */ useTreeNodeDragDrop)
/* harmony export */ });
/* harmony import */ var _get_children_nodes_values_get_children_nodes_values_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./get-children-nodes-values/get-children-nodes-values.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/get-children-nodes-values/get-children-nodes-values.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
"use client";


function isDescendantOf(data, ancestorValue, descendantValue) {
  const ancestor = (0,_get_children_nodes_values_get_children_nodes_values_mjs__WEBPACK_IMPORTED_MODULE_0__.findTreeNode)(ancestorValue, data);
  if (!ancestor || !ancestor.children) return false;
  function check(nodes) {
    for (const node of nodes) {
      if (node.value === descendantValue) return true;
      if (node.children && check(node.children)) return true;
    }
    return false;
  }
  return check(ancestor.children);
}
function getDragDropPosition(event, element, hasChildren) {
  const rect = element.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const height = rect.height;
  if (hasChildren) {
    if (y < height * 0.25) return "before";
    if (y > height * 0.75) return "after";
    return "inside";
  }
  if (y < height * 0.5) return "before";
  return "after";
}
const EMPTY_DRAG_PROPS = {
  elementProps: {},
  dragHandleProps: void 0
};
function useTreeNodeDragDrop({ nodeValue, hasChildren, data, onDragDrop, dragStateRef, allowDrop, withDragHandle }) {
  const [isDragHandleActive, setIsDragHandleActive] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    if (!withDragHandle || !isDragHandleActive) return;
    const handleWindowMouseUp = () => setIsDragHandleActive(false);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [withDragHandle, isDragHandleActive]);
  if (!onDragDrop) return EMPTY_DRAG_PROPS;
  const handleDragStart = (event) => {
    if (withDragHandle && !isDragHandleActive) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeValue);
    dragStateRef.current.draggedValue = nodeValue;
    const target = event.currentTarget;
    requestAnimationFrame(() => {
      target.setAttribute("data-dragging", "true");
    });
  };
  const handleDragOver = (event) => {
    const draggedValue = dragStateRef.current.draggedValue;
    if (!draggedValue || draggedValue === nodeValue) return;
    if (isDescendantOf(data, draggedValue, nodeValue)) return;
    const target = event.currentTarget;
    const position = getDragDropPosition(event, target, hasChildren);
    if (allowDrop && !allowDrop({
      draggedNode: draggedValue,
      targetNode: nodeValue,
      position
    })) {
      const prevTarget2 = dragStateRef.current.currentDropTarget;
      if (prevTarget2 && prevTarget2 !== target) prevTarget2.removeAttribute("data-drag-over");
      target.removeAttribute("data-drag-over");
      dragStateRef.current.currentDropTarget = null;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const prevTarget = dragStateRef.current.currentDropTarget;
    if (prevTarget && prevTarget !== target) prevTarget.removeAttribute("data-drag-over");
    target.setAttribute("data-drag-over", position);
    dragStateRef.current.currentDropTarget = target;
  };
  const handleDragLeave = (event) => {
    const target = event.currentTarget;
    const related = event.relatedTarget;
    if (related && target.contains(related)) return;
    target.removeAttribute("data-drag-over");
    if (dragStateRef.current.currentDropTarget === target) dragStateRef.current.currentDropTarget = null;
  };
  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    const position = target.getAttribute("data-drag-over");
    target.removeAttribute("data-drag-over");
    const draggedValue = dragStateRef.current.draggedValue;
    if (draggedValue && position && draggedValue !== nodeValue) {
      const payload = {
        draggedNode: draggedValue,
        targetNode: nodeValue,
        position
      };
      if (!allowDrop || allowDrop(payload)) onDragDrop(payload);
    }
    dragStateRef.current.draggedValue = null;
    dragStateRef.current.currentDropTarget = null;
  };
  const handleDragEnd = (event) => {
    event.currentTarget.removeAttribute("data-dragging");
    const prevTarget = dragStateRef.current.currentDropTarget;
    if (prevTarget) prevTarget.removeAttribute("data-drag-over");
    dragStateRef.current.draggedValue = null;
    dragStateRef.current.currentDropTarget = null;
    if (withDragHandle) setIsDragHandleActive(false);
  };
  return {
    elementProps: {
      draggable: withDragHandle ? isDragHandleActive : true,
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      onDragEnd: handleDragEnd
    },
    dragHandleProps: withDragHandle ? { onMouseDown: () => setIsDragHandleActive(true) } : void 0
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/Tree/use-tree.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/Tree/use-tree.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useTree: () => (/* binding */ useTree)
/* harmony export */ });
/* unused harmony export getTreeExpandedState */
/* harmony import */ var _get_children_nodes_values_get_children_nodes_values_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./get-children-nodes-values/get-children-nodes-values.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/get-children-nodes-values/get-children-nodes-values.mjs");
/* harmony import */ var _get_all_checked_nodes_get_all_checked_nodes_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./get-all-checked-nodes/get-all-checked-nodes.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/get-all-checked-nodes/get-all-checked-nodes.mjs");
/* harmony import */ var _is_node_checked_is_node_checked_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./is-node-checked/is-node-checked.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/is-node-checked/is-node-checked.mjs");
/* harmony import */ var _is_node_indeterminate_is_node_indeterminate_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./is-node-indeterminate/is-node-indeterminate.mjs */ "../../node_modules/@mantine/core/esm/components/Tree/is-node-indeterminate/is-node-indeterminate.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-uncontrolled/use-uncontrolled.mjs");
"use client";






function getInitialTreeExpandedState(initialState, data, value, acc = {}) {
  data.forEach((node) => {
    acc[node.value] = node.value in initialState ? initialState[node.value] : node.value === value;
    if (Array.isArray(node.children)) getInitialTreeExpandedState(initialState, node.children, value, acc);
  });
  return acc;
}
function getTreeExpandedState(data, expandedNodesValues) {
  const state = getInitialTreeExpandedState({}, data, []);
  if (expandedNodesValues === "*") {
    const result = {};
    const keys = Object.keys(state);
    for (let i = 0; i < keys.length; i++) result[keys[i]] = true;
    return result;
  }
  expandedNodesValues.forEach((node) => {
    state[node] = true;
  });
  return state;
}
function getInitialCheckedState(initialState, data, checkStrictly) {
  if (checkStrictly) return initialState;
  const acc = [];
  initialState.forEach((node) => acc.push(...(0,_get_children_nodes_values_get_children_nodes_values_mjs__WEBPACK_IMPORTED_MODULE_0__.getChildrenNodesValues)(node, data)));
  return Array.from(new Set(acc));
}
function getAllNodeValues(data) {
  const acc = [];
  for (const node of data) {
    acc.push(node.value);
    if (Array.isArray(node.children) && node.children.length > 0) acc.push(...getAllNodeValues(node.children));
  }
  return acc;
}
function useTree({ initialSelectedState = [], expandedState, initialCheckedState = [], checkedState, initialExpandedState = {}, selectedState, multiple = false, onNodeCollapse, onNodeExpand, onCheckedStateChange, onSelectedStateChange, onExpandedStateChange, onLoadChildren, checkStrictly = false } = {}) {
  const [data, setData] = (0,react__WEBPACK_IMPORTED_MODULE_4__.useState)([]);
  const [_expandedState, setExpandedState] = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_5__.useUncontrolled)({
    value: expandedState,
    defaultValue: initialExpandedState,
    finalValue: {},
    onChange: onExpandedStateChange
  });
  const [_selectedState, setSelectedState] = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_5__.useUncontrolled)({
    value: selectedState,
    defaultValue: initialSelectedState,
    finalValue: [],
    onChange: onSelectedStateChange
  });
  const [_checkedState, setCheckedState] = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_5__.useUncontrolled)({
    value: checkedState,
    defaultValue: initialCheckedState,
    finalValue: [],
    onChange: onCheckedStateChange
  });
  const [anchorNode, setAnchorNode] = (0,react__WEBPACK_IMPORTED_MODULE_4__.useState)(null);
  const loadingNodesRef = (0,react__WEBPACK_IMPORTED_MODULE_4__.useRef)(/* @__PURE__ */ new Set());
  const loadedNodesRef = (0,react__WEBPACK_IMPORTED_MODULE_4__.useRef)(/* @__PURE__ */ new Set());
  const [loadingNodes, setLoadingNodes] = (0,react__WEBPACK_IMPORTED_MODULE_4__.useState)([]);
  const [loadErrors, setLoadErrors] = (0,react__WEBPACK_IMPORTED_MODULE_4__.useState)({});
  const initialize = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((_data) => {
    setExpandedState(getInitialTreeExpandedState(_expandedState, _data, _selectedState));
    setCheckedState(getInitialCheckedState(_checkedState, _data, checkStrictly));
    setData(_data);
  }, [
    _selectedState,
    _checkedState,
    _expandedState,
    checkStrictly
  ]);
  const loadNodeImpl = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)(async (value) => {
    if (!onLoadChildren) return;
    if (loadingNodesRef.current.has(value) || loadedNodesRef.current.has(value)) return;
    loadingNodesRef.current.add(value);
    setLoadingNodes(Array.from(loadingNodesRef.current));
    setLoadErrors((prev) => {
      if (!(value in prev)) return prev;
      const next = { ...prev };
      delete next[value];
      return next;
    });
    try {
      await onLoadChildren(value);
      loadedNodesRef.current.add(value);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setLoadErrors((prev) => ({
        ...prev,
        [value]: err
      }));
    } finally {
      loadingNodesRef.current.delete(value);
      setLoadingNodes(Array.from(loadingNodesRef.current));
    }
  }, [onLoadChildren]);
  const tryLoadAsync = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    if (!onLoadChildren) return;
    const node = (0,_get_children_nodes_values_get_children_nodes_values_mjs__WEBPACK_IMPORTED_MODULE_0__.findTreeNode)(value, data);
    if (node && node.hasChildren && !Array.isArray(node.children)) loadNodeImpl(value);
  }, [
    onLoadChildren,
    data,
    loadNodeImpl
  ]);
  const toggleExpanded = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    const nextState = {
      ..._expandedState,
      [value]: !_expandedState[value]
    };
    nextState[value] ? onNodeExpand == null ? void 0 : onNodeExpand(value) : onNodeCollapse == null ? void 0 : onNodeCollapse(value);
    if (nextState[value]) tryLoadAsync(value);
    setExpandedState(nextState);
  }, [
    onNodeCollapse,
    onNodeExpand,
    _expandedState,
    tryLoadAsync
  ]);
  const collapse = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    if (_expandedState[value] !== false) onNodeCollapse == null ? void 0 : onNodeCollapse(value);
    setExpandedState({
      ..._expandedState,
      [value]: false
    });
  }, [onNodeCollapse, _expandedState]);
  const expand = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    if (_expandedState[value] !== true) onNodeExpand == null ? void 0 : onNodeExpand(value);
    tryLoadAsync(value);
    setExpandedState({
      ..._expandedState,
      [value]: true
    });
  }, [
    onNodeExpand,
    _expandedState,
    tryLoadAsync
  ]);
  const expandAllNodes = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)(() => {
    const nextState = { ..._expandedState };
    Object.keys(nextState).forEach((key) => {
      nextState[key] = true;
      tryLoadAsync(key);
    });
    setExpandedState(nextState);
  }, [_expandedState, tryLoadAsync]);
  const collapseAllNodes = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)(() => {
    const nextState = { ..._expandedState };
    Object.keys(nextState).forEach((key) => {
      nextState[key] = false;
    });
    setExpandedState(nextState);
  }, [_expandedState]);
  const toggleSelected = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    if (!multiple) {
      if (_selectedState.includes(value)) {
        setAnchorNode(null);
        return [];
      }
      setAnchorNode(value);
      return [value];
    }
    if (_selectedState.includes(value)) {
      setAnchorNode(null);
      return _selectedState.filter((item) => item !== value);
    }
    setAnchorNode(value);
    setSelectedState([..._selectedState, value]);
  }, [_selectedState]);
  const select = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    setAnchorNode(value);
    setSelectedState(multiple ? _selectedState.includes(value) ? _selectedState : [..._selectedState, value] : [value]);
  }, [_selectedState]);
  const deselect = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    anchorNode === value && setAnchorNode(null);
    setSelectedState(_selectedState.filter((item) => item !== value));
  }, [_selectedState]);
  const clearSelected = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)(() => {
    setSelectedState([]);
    setAnchorNode(null);
  }, []);
  const checkNode = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    if (checkStrictly) {
      if (!_checkedState.includes(value)) setCheckedState([..._checkedState, value]);
    } else {
      const checkedNodes = (0,_get_children_nodes_values_get_children_nodes_values_mjs__WEBPACK_IMPORTED_MODULE_0__.getChildrenNodesValues)(value, data);
      setCheckedState(Array.from(/* @__PURE__ */ new Set([..._checkedState, ...checkedNodes])));
    }
  }, [
    data,
    _checkedState,
    checkStrictly
  ]);
  const uncheckNode = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    if (checkStrictly) setCheckedState(_checkedState.filter((item) => item !== value));
    else {
      const checkedNodes = (0,_get_children_nodes_values_get_children_nodes_values_mjs__WEBPACK_IMPORTED_MODULE_0__.getChildrenNodesValues)(value, data);
      setCheckedState(_checkedState.filter((item) => !checkedNodes.includes(item)));
    }
  }, [
    data,
    _checkedState,
    checkStrictly
  ]);
  const checkAllNodes = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)(() => {
    if (checkStrictly) setCheckedState(getAllNodeValues(data));
    else setCheckedState((0,_get_children_nodes_values_get_children_nodes_values_mjs__WEBPACK_IMPORTED_MODULE_0__.getAllChildrenNodes)(data));
  }, [data, checkStrictly]);
  const uncheckAllNodes = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)(() => {
    setCheckedState([]);
  }, []);
  const getCheckedNodes = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)(() => {
    if (checkStrictly) return _checkedState.map((value) => {
      const node = (0,_get_children_nodes_values_get_children_nodes_values_mjs__WEBPACK_IMPORTED_MODULE_0__.findTreeNode)(value, data);
      return {
        checked: true,
        indeterminate: false,
        value,
        hasChildren: node ? Array.isArray(node.children) && node.children.length > 0 || !!node.hasChildren : false
      };
    });
    return (0,_get_all_checked_nodes_get_all_checked_nodes_mjs__WEBPACK_IMPORTED_MODULE_1__.getAllCheckedNodes)(data, _checkedState).result;
  }, [
    checkStrictly,
    _checkedState,
    data
  ]);
  const isNodeChecked = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    if (checkStrictly) return _checkedState.includes(value);
    return (0,_is_node_checked_is_node_checked_mjs__WEBPACK_IMPORTED_MODULE_2__.memoizedIsNodeChecked)(value, data, _checkedState);
  }, [
    checkStrictly,
    _checkedState,
    data
  ]);
  const isNodeIndeterminate = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    if (checkStrictly) return false;
    return (0,_is_node_indeterminate_is_node_indeterminate_mjs__WEBPACK_IMPORTED_MODULE_3__.memoizedIsNodeIndeterminate)(value, data, _checkedState);
  }, [
    checkStrictly,
    _checkedState,
    data
  ]);
  const isNodeLoading = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => loadingNodes.includes(value), [loadingNodes]);
  const getNodeLoadError = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => loadErrors[value] || null, [loadErrors]);
  const invalidateNode = (0,react__WEBPACK_IMPORTED_MODULE_4__.useCallback)((value) => {
    loadedNodesRef.current.delete(value);
    setLoadErrors((prev) => {
      if (!(value in prev)) return prev;
      const next = { ...prev };
      delete next[value];
      return next;
    });
  }, []);
  return (0,react__WEBPACK_IMPORTED_MODULE_4__.useMemo)(() => ({
    checkStrictly,
    multiple,
    expandedState: _expandedState,
    selectedState: _selectedState,
    checkedState: _checkedState,
    anchorNode,
    initialize,
    toggleExpanded,
    collapse,
    expand,
    expandAllNodes,
    collapseAllNodes,
    setExpandedState,
    checkNode,
    uncheckNode,
    checkAllNodes,
    uncheckAllNodes,
    setCheckedState,
    toggleSelected,
    select,
    deselect,
    clearSelected,
    setSelectedState,
    getCheckedNodes,
    isNodeChecked,
    isNodeIndeterminate,
    isNodeLoading,
    getNodeLoadError,
    loadNode: loadNodeImpl,
    invalidateNode
  }), [
    checkStrictly,
    multiple,
    _expandedState,
    _selectedState,
    _checkedState,
    anchorNode,
    initialize,
    toggleExpanded,
    collapse,
    expand,
    expandAllNodes,
    collapseAllNodes,
    setExpandedState,
    checkNode,
    uncheckNode,
    checkAllNodes,
    uncheckAllNodes,
    setCheckedState,
    toggleSelected,
    select,
    deselect,
    clearSelected,
    setSelectedState,
    getCheckedNodes,
    isNodeChecked,
    isNodeIndeterminate,
    isNodeLoading,
    getNodeLoadError,
    loadNodeImpl,
    invalidateNode
  ]);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/UnstyledButton/UnstyledButton.mjs"
/*!*****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/UnstyledButton/UnstyledButton.mjs ***!
  \*****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   UnstyledButton: () => (/* binding */ UnstyledButton)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/factory/polymorphic-factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _UnstyledButton_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./UnstyledButton.module.mjs */ "../../node_modules/@mantine/core/esm/components/UnstyledButton/UnstyledButton.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const defaultProps = { __staticSelector: "UnstyledButton" };
const UnstyledButton = (0,_core_factory_polymorphic_factory_mjs__WEBPACK_IMPORTED_MODULE_2__.polymorphicFactory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("UnstyledButton", defaultProps, _props);
  const { className, component = "button", __staticSelector, unstyled, classNames, styles, style, attributes, ...others } = props;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_3__.Box, {
    ...(0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_1__.useStyles)({
      name: __staticSelector,
      props,
      classes: _UnstyledButton_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"],
      className,
      style,
      classNames,
      styles,
      unstyled,
      attributes
    })("root", { focusable: true }),
    component,
    type: component === "button" ? "button" : void 0,
    ...others
  });
});
UnstyledButton.classes = _UnstyledButton_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
UnstyledButton.displayName = "@mantine/core/UnstyledButton";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/UnstyledButton/UnstyledButton.module.mjs"
/*!************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/UnstyledButton/UnstyledButton.module.mjs ***!
  \************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ UnstyledButton_module_default)
/* harmony export */ });
"use client";
var UnstyledButton_module_default = { "root": "m_87cf2631" };



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/VisuallyHidden/VisuallyHidden.mjs"
/*!*****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/VisuallyHidden/VisuallyHidden.mjs ***!
  \*****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   VisuallyHidden: () => (/* binding */ VisuallyHidden)
/* harmony export */ });
/* harmony import */ var _core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/MantineProvider/use-props/use-props.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/factory/factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _VisuallyHidden_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./VisuallyHidden.module.mjs */ "../../node_modules/@mantine/core/esm/components/VisuallyHidden/VisuallyHidden.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const VisuallyHidden = (0,_core_factory_factory_mjs__WEBPACK_IMPORTED_MODULE_2__.factory)((_props) => {
  const props = (0,_core_MantineProvider_use_props_use_props_mjs__WEBPACK_IMPORTED_MODULE_0__.useProps)("VisuallyHidden", null, _props);
  const { classNames, className, style, styles, unstyled, vars, attributes, ...others } = props;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_3__.Box, {
    component: "span",
    ...(0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_1__.useStyles)({
      name: "VisuallyHidden",
      classes: _VisuallyHidden_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"],
      props,
      className,
      style,
      classNames,
      styles,
      unstyled,
      attributes
    })("root"),
    ...others
  });
});
VisuallyHidden.classes = _VisuallyHidden_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
VisuallyHidden.displayName = "@mantine/core/VisuallyHidden";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/components/VisuallyHidden/VisuallyHidden.module.mjs"
/*!************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/components/VisuallyHidden/VisuallyHidden.module.mjs ***!
  \************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ VisuallyHidden_module_default)
/* harmony export */ });
"use client";
var VisuallyHidden_module_default = { "root": "m_515a97f8" };



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs"
/*!*************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/Box.mjs ***!
  \*************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Box: () => (/* binding */ Box)
/* harmony export */ });
/* harmony import */ var _utils_is_number_like_is_number_like_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/is-number-like/is-number-like.mjs */ "../../node_modules/@mantine/core/esm/core/utils/is-number-like/is-number-like.mjs");
/* harmony import */ var _MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../MantineProvider/Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var _MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
/* harmony import */ var _InlineStyles_InlineStyles_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../InlineStyles/InlineStyles.mjs */ "../../node_modules/@mantine/core/esm/core/InlineStyles/InlineStyles.mjs");
/* harmony import */ var _InlineStyles_hash_styles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../InlineStyles/hash-styles.mjs */ "../../node_modules/@mantine/core/esm/core/InlineStyles/hash-styles.mjs");
/* harmony import */ var _style_props_extract_style_props_extract_style_props_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./style-props/extract-style-props/extract-style-props.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/extract-style-props/extract-style-props.mjs");
/* harmony import */ var _style_props_style_props_data_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./style-props/style-props-data.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/style-props-data.mjs");
/* harmony import */ var _style_props_parse_style_props_parse_style_props_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./style-props/parse-style-props/parse-style-props.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/parse-style-props/parse-style-props.mjs");
/* harmony import */ var _use_random_classname_use_random_classname_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./use-random-classname/use-random-classname.mjs */ "../../node_modules/@mantine/core/esm/core/Box/use-random-classname/use-random-classname.mjs");
/* harmony import */ var _factory_create_polymorphic_component_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../factory/create-polymorphic-component.mjs */ "../../node_modules/@mantine/core/esm/core/factory/create-polymorphic-component.mjs");
/* harmony import */ var _get_box_mod_get_box_mod_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./get-box-mod/get-box-mod.mjs */ "../../node_modules/@mantine/core/esm/core/Box/get-box-mod/get-box-mod.mjs");
/* harmony import */ var _get_box_style_get_box_style_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./get-box-style/get-box-style.mjs */ "../../node_modules/@mantine/core/esm/core/Box/get-box-style/get-box-style.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";














function _Box({ component, style, __vars, className, variant, mod, size, hiddenFrom, visibleFrom, lightHidden, darkHidden, renderRoot, __size, ref, ...others }) {
  var _a, _b;
  const theme = (0,_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_2__.useMantineTheme)();
  const Element = component || "div";
  const { styleProps, rest } = (0,_style_props_extract_style_props_extract_style_props_mjs__WEBPACK_IMPORTED_MODULE_5__.extractStyleProps)(others);
  const transformedSx = (_b = (_a = (0,_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_1__.useMantineSxTransform)()) == null ? void 0 : _a()) == null ? void 0 : _b(styleProps.sx);
  const randomClassName = (0,_use_random_classname_use_random_classname_mjs__WEBPACK_IMPORTED_MODULE_8__.useRandomClassName)();
  const parsedStyleProps = (0,_style_props_parse_style_props_parse_style_props_mjs__WEBPACK_IMPORTED_MODULE_7__.parseStyleProps)({
    styleProps,
    theme,
    data: _style_props_style_props_data_mjs__WEBPACK_IMPORTED_MODULE_6__.STYlE_PROPS_DATA
  });
  const deduplicateInlineStyles = (0,_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_1__.useMantineDeduplicateInlineStyles)();
  const responsiveClassName = deduplicateInlineStyles && parsedStyleProps.hasResponsiveStyles ? (0,_InlineStyles_hash_styles_mjs__WEBPACK_IMPORTED_MODULE_4__.hashStyleProps)(parsedStyleProps.styles, parsedStyleProps.media) : randomClassName;
  const props = {
    ref,
    style: (0,_get_box_style_get_box_style_mjs__WEBPACK_IMPORTED_MODULE_11__.getBoxStyle)({
      theme,
      style,
      vars: __vars,
      styleProps: parsedStyleProps.inlineStyles
    }),
    className: (0,clsx__WEBPACK_IMPORTED_MODULE_12__["default"])(className, transformedSx, {
      [responsiveClassName]: parsedStyleProps.hasResponsiveStyles,
      "mantine-light-hidden": lightHidden,
      "mantine-dark-hidden": darkHidden,
      [`mantine-hidden-from-${hiddenFrom}`]: hiddenFrom,
      [`mantine-visible-from-${visibleFrom}`]: visibleFrom
    }),
    "data-variant": variant,
    "data-size": (0,_utils_is_number_like_is_number_like_mjs__WEBPACK_IMPORTED_MODULE_0__.isNumberLike)(size) ? void 0 : size || void 0,
    size: __size,
    ...(0,_get_box_mod_get_box_mod_mjs__WEBPACK_IMPORTED_MODULE_10__.getBoxMod)(mod),
    ...rest
  };
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.Fragment, { children: [parsedStyleProps.hasResponsiveStyles && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(_InlineStyles_InlineStyles_mjs__WEBPACK_IMPORTED_MODULE_3__.InlineStyles, {
    selector: `.${responsiveClassName}`,
    styles: parsedStyleProps.styles,
    media: parsedStyleProps.media,
    deduplicate: deduplicateInlineStyles
  }), typeof renderRoot === "function" ? renderRoot(props) : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_13__.jsx)(Element, { ...props })] });
}
_Box.displayName = "@mantine/core/Box";
const Box = (0,_factory_create_polymorphic_component_mjs__WEBPACK_IMPORTED_MODULE_9__.polymorphic)(_Box);



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/get-box-mod/get-box-mod.mjs"
/*!*********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/get-box-mod/get-box-mod.mjs ***!
  \*********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getBoxMod: () => (/* binding */ getBoxMod)
/* harmony export */ });
"use client";
function transformModKey(key) {
  return `data-${(key.startsWith("data-") ? key.slice(5) : key).replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;
}
function getMod(props) {
  return Object.keys(props).reduce((acc, key) => {
    const value = props[key];
    if (value === void 0 || value === "" || value === false || value === null) return acc;
    acc[transformModKey(key)] = props[key];
    return acc;
  }, {});
}
function getBoxMod(mod) {
  if (!mod) return null;
  if (typeof mod === "string") return { [transformModKey(mod)]: true };
  if (Array.isArray(mod)) return [...mod].reduce((acc, value) => ({
    ...acc,
    ...getBoxMod(value)
  }), {});
  return getMod(mod);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/get-box-style/get-box-style.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/get-box-style/get-box-style.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getBoxStyle: () => (/* binding */ getBoxStyle)
/* harmony export */ });
"use client";
function mergeStyles(styles, theme) {
  if (Array.isArray(styles)) return [...styles].reduce((acc, item) => ({
    ...acc,
    ...mergeStyles(item, theme)
  }), {});
  if (typeof styles === "function") return styles(theme);
  if (styles == null) return {};
  return styles;
}
function getBoxStyle({ theme, style, vars, styleProps }) {
  const _style = mergeStyles(style, theme);
  const _vars = mergeStyles(vars, theme);
  return {
    ..._style,
    ..._vars,
    ...styleProps
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/extract-style-props/extract-style-props.mjs"
/*!*************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/extract-style-props/extract-style-props.mjs ***!
  \*************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   extractStyleProps: () => (/* binding */ extractStyleProps)
/* harmony export */ });
/* harmony import */ var _utils_filter_props_filter_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../utils/filter-props/filter-props.mjs */ "../../node_modules/@mantine/core/esm/core/utils/filter-props/filter-props.mjs");
"use client";

function extractStyleProps(others) {
  const { m, mx, my, mt, mb, ml, mr, me, ms, mis, mie, p, px, py, pt, pb, pl, pr, pe, ps, pis, pie, bd, bdrs, bg, c, opacity, ff, fz, fw, lts, ta, lh, fs, tt, td, w, miw, maw, h, mih, mah, bgsz, bgp, bgr, bga, pos, top, left, bottom, right, inset, display, flex, hiddenFrom, visibleFrom, lightHidden, darkHidden, sx, ...rest } = others;
  return {
    styleProps: (0,_utils_filter_props_filter_props_mjs__WEBPACK_IMPORTED_MODULE_0__.filterProps)({
      m,
      mx,
      my,
      mt,
      mb,
      ml,
      mr,
      me,
      ms,
      mis,
      mie,
      p,
      px,
      py,
      pt,
      pb,
      pl,
      pr,
      pis,
      pie,
      pe,
      ps,
      bd,
      bg,
      c,
      opacity,
      ff,
      fz,
      fw,
      lts,
      ta,
      lh,
      fs,
      tt,
      td,
      w,
      miw,
      maw,
      h,
      mih,
      mah,
      bgsz,
      bgp,
      bgr,
      bga,
      pos,
      top,
      left,
      bottom,
      right,
      inset,
      display,
      flex,
      bdrs,
      hiddenFrom,
      visibleFrom,
      lightHidden,
      darkHidden,
      sx
    }),
    rest
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/parse-style-props/parse-style-props.mjs"
/*!*********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/parse-style-props/parse-style-props.mjs ***!
  \*********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   parseStyleProps: () => (/* binding */ parseStyleProps)
/* harmony export */ });
/* harmony import */ var _utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../utils/keys/keys.mjs */ "../../node_modules/@mantine/core/esm/core/utils/keys/keys.mjs");
/* harmony import */ var _resolvers_index_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../resolvers/index.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/index.mjs");
/* harmony import */ var _sort_media_queries_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./sort-media-queries.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/parse-style-props/sort-media-queries.mjs");
"use client";



function hasResponsiveStyles(styleProp) {
  if (typeof styleProp !== "object" || styleProp === null) return false;
  const breakpoints = Object.keys(styleProp);
  if (breakpoints.length === 1 && breakpoints[0] === "base") return false;
  return true;
}
function getBaseValue(value) {
  if (typeof value === "object" && value !== null) {
    if ("base" in value) return value.base;
    return;
  }
  return value;
}
function getBreakpointKeys(value) {
  if (typeof value === "object" && value !== null) return (0,_utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__.keys)(value).filter((key) => key !== "base");
  return [];
}
function getBreakpointValue(value, breakpoint) {
  if (typeof value === "object" && value !== null && breakpoint in value) return value[breakpoint];
  return value;
}
function parseStyleProps({ styleProps, data, theme }) {
  return (0,_sort_media_queries_mjs__WEBPACK_IMPORTED_MODULE_2__.sortMediaQueries)((0,_utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__.keys)(styleProps).reduce((acc, styleProp) => {
    if (styleProp === "hiddenFrom" || styleProp === "visibleFrom" || styleProp === "sx") return acc;
    const propertyData = data[styleProp];
    const properties = Array.isArray(propertyData.property) ? propertyData.property : [propertyData.property];
    const baseValue = getBaseValue(styleProps[styleProp]);
    if (!hasResponsiveStyles(styleProps[styleProp])) {
      properties.forEach((property) => {
        acc.inlineStyles[property] = _resolvers_index_mjs__WEBPACK_IMPORTED_MODULE_1__.resolvers[propertyData.type](baseValue, theme);
      });
      return acc;
    }
    acc.hasResponsiveStyles = true;
    const breakpoints = getBreakpointKeys(styleProps[styleProp]);
    properties.forEach((property) => {
      if (baseValue != null) acc.styles[property] = _resolvers_index_mjs__WEBPACK_IMPORTED_MODULE_1__.resolvers[propertyData.type](baseValue, theme);
      breakpoints.forEach((breakpoint) => {
        const bp = `(min-width: ${theme.breakpoints[breakpoint]})`;
        acc.media[bp] = {
          ...acc.media[bp],
          [property]: _resolvers_index_mjs__WEBPACK_IMPORTED_MODULE_1__.resolvers[propertyData.type](getBreakpointValue(styleProps[styleProp], breakpoint), theme)
        };
      });
    });
    return acc;
  }, {
    hasResponsiveStyles: false,
    styles: {},
    inlineStyles: {},
    media: {}
  }));
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/parse-style-props/sort-media-queries.mjs"
/*!**********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/parse-style-props/sort-media-queries.mjs ***!
  \**********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   sortMediaQueries: () => (/* binding */ sortMediaQueries)
/* harmony export */ });
"use client";
function replaceMediaQuery(query) {
  return query.replace("(min-width: ", "").replace("em)", "");
}
function sortMediaQueries({ media, ...props }) {
  const sortedMedia = Object.keys(media).sort((a, b) => Number(replaceMediaQuery(a)) - Number(replaceMediaQuery(b))).map((query) => ({
    query,
    styles: media[query]
  }));
  return {
    ...props,
    media: sortedMedia
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/border-resolver/border-resolver.mjs"
/*!***************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/border-resolver/border-resolver.mjs ***!
  \***************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   borderResolver: () => (/* binding */ borderResolver)
/* harmony export */ });
/* harmony import */ var _utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../../utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _color_resolver_color_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../color-resolver/color-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/color-resolver/color-resolver.mjs");
"use client";


function borderResolver(value, theme) {
  if (typeof value === "number") return (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(value);
  if (typeof value === "string") {
    const [size, style, ...colorTuple] = value.split(" ").filter((val) => val.trim() !== "");
    let result = `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(size)}`;
    style && (result += ` ${style}`);
    colorTuple.length > 0 && (result += ` ${(0,_color_resolver_color_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.colorResolver)(colorTuple.join(" "), theme)}`);
    return result.trim();
  }
  return value;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/color-resolver/color-resolver.mjs"
/*!*************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/color-resolver/color-resolver.mjs ***!
  \*************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   colorResolver: () => (/* binding */ colorResolver),
/* harmony export */   textColorResolver: () => (/* binding */ textColorResolver)
/* harmony export */ });
/* harmony import */ var _MantineProvider_color_functions_parse_theme_color_parse_theme_color_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../../MantineProvider/color-functions/parse-theme-color/parse-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/parse-theme-color/parse-theme-color.mjs");
"use client";

function colorResolver(color, theme) {
  const parsedColor = (0,_MantineProvider_color_functions_parse_theme_color_parse_theme_color_mjs__WEBPACK_IMPORTED_MODULE_0__.parseThemeColor)({
    color,
    theme
  });
  if (parsedColor.color === "dimmed") return "var(--mantine-color-dimmed)";
  if (parsedColor.color === "bright") return "var(--mantine-color-bright)";
  return parsedColor.variable ? `var(${parsedColor.variable})` : parsedColor.color;
}
function textColorResolver(color, theme) {
  const parsedColor = (0,_MantineProvider_color_functions_parse_theme_color_parse_theme_color_mjs__WEBPACK_IMPORTED_MODULE_0__.parseThemeColor)({
    color,
    theme
  });
  if (parsedColor.isThemeColor && parsedColor.shade === void 0) return `var(--mantine-color-${parsedColor.color}-text)`;
  return colorResolver(color, theme);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/font-family-resolver/font-family-resolver.mjs"
/*!*************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/font-family-resolver/font-family-resolver.mjs ***!
  \*************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   fontFamilyResolver: () => (/* binding */ fontFamilyResolver)
/* harmony export */ });
"use client";
const values = {
  text: "var(--mantine-font-family)",
  mono: "var(--mantine-font-family-monospace)",
  monospace: "var(--mantine-font-family-monospace)",
  heading: "var(--mantine-font-family-headings)",
  headings: "var(--mantine-font-family-headings)"
};
function fontFamilyResolver(fontFamily) {
  if (typeof fontFamily === "string" && fontFamily in values) return values[fontFamily];
  return fontFamily;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/font-size-resolver/font-size-resolver.mjs"
/*!*********************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/font-size-resolver/font-size-resolver.mjs ***!
  \*********************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   fontSizeResolver: () => (/* binding */ fontSizeResolver)
/* harmony export */ });
/* harmony import */ var _utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../../utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
"use client";

const headings = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6"
];
function fontSizeResolver(value, theme) {
  if (typeof value === "string" && value in theme.fontSizes) return `var(--mantine-font-size-${value})`;
  if (typeof value === "string" && headings.includes(value)) return `var(--mantine-${value}-font-size)`;
  if (typeof value === "number") return (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(value);
  if (typeof value === "string") return (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(value);
  return value;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/identity-resolver/identity-resolver.mjs"
/*!*******************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/identity-resolver/identity-resolver.mjs ***!
  \*******************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   identityResolver: () => (/* binding */ identityResolver)
/* harmony export */ });
"use client";
function identityResolver(value) {
  return value;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/index.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/index.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   resolvers: () => (/* binding */ resolvers)
/* harmony export */ });
/* harmony import */ var _color_resolver_color_resolver_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./color-resolver/color-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/color-resolver/color-resolver.mjs");
/* harmony import */ var _border_resolver_border_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./border-resolver/border-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/border-resolver/border-resolver.mjs");
/* harmony import */ var _font_family_resolver_font_family_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./font-family-resolver/font-family-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/font-family-resolver/font-family-resolver.mjs");
/* harmony import */ var _font_size_resolver_font_size_resolver_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./font-size-resolver/font-size-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/font-size-resolver/font-size-resolver.mjs");
/* harmony import */ var _identity_resolver_identity_resolver_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./identity-resolver/identity-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/identity-resolver/identity-resolver.mjs");
/* harmony import */ var _line_height_resolver_line_height_resolver_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./line-height-resolver/line-height-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/line-height-resolver/line-height-resolver.mjs");
/* harmony import */ var _radius_resolver_radius_resolver_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./radius-resolver/radius-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/radius-resolver/radius-resolver.mjs");
/* harmony import */ var _size_resolver_size_resolver_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./size-resolver/size-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/size-resolver/size-resolver.mjs");
/* harmony import */ var _spacing_resolver_spacing_resolver_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./spacing-resolver/spacing-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/spacing-resolver/spacing-resolver.mjs");
"use client";









const resolvers = {
  color: _color_resolver_color_resolver_mjs__WEBPACK_IMPORTED_MODULE_0__.colorResolver,
  textColor: _color_resolver_color_resolver_mjs__WEBPACK_IMPORTED_MODULE_0__.textColorResolver,
  fontSize: _font_size_resolver_font_size_resolver_mjs__WEBPACK_IMPORTED_MODULE_3__.fontSizeResolver,
  spacing: _spacing_resolver_spacing_resolver_mjs__WEBPACK_IMPORTED_MODULE_8__.spacingResolver,
  radius: _radius_resolver_radius_resolver_mjs__WEBPACK_IMPORTED_MODULE_6__.radiusResolver,
  identity: _identity_resolver_identity_resolver_mjs__WEBPACK_IMPORTED_MODULE_4__.identityResolver,
  size: _size_resolver_size_resolver_mjs__WEBPACK_IMPORTED_MODULE_7__.sizeResolver,
  lineHeight: _line_height_resolver_line_height_resolver_mjs__WEBPACK_IMPORTED_MODULE_5__.lineHeightResolver,
  fontFamily: _font_family_resolver_font_family_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.fontFamilyResolver,
  border: _border_resolver_border_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.borderResolver
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/line-height-resolver/line-height-resolver.mjs"
/*!*************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/line-height-resolver/line-height-resolver.mjs ***!
  \*************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   lineHeightResolver: () => (/* binding */ lineHeightResolver)
/* harmony export */ });
"use client";
const headings = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6"
];
function lineHeightResolver(value, theme) {
  if (typeof value === "string" && value in theme.lineHeights) return `var(--mantine-line-height-${value})`;
  if (typeof value === "string" && headings.includes(value)) return `var(--mantine-${value}-line-height)`;
  return value;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/radius-resolver/radius-resolver.mjs"
/*!***************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/radius-resolver/radius-resolver.mjs ***!
  \***************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   radiusResolver: () => (/* binding */ radiusResolver)
/* harmony export */ });
/* harmony import */ var _utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../../utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
"use client";

function radiusResolver(value, theme) {
  if (typeof value === "string" && value in theme.radius) return `var(--mantine-radius-${value})`;
  if (typeof value === "number") return (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(value);
  if (typeof value === "string") return (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(value);
  return value;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/size-resolver/size-resolver.mjs"
/*!***********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/size-resolver/size-resolver.mjs ***!
  \***********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   sizeResolver: () => (/* binding */ sizeResolver)
/* harmony export */ });
/* harmony import */ var _utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../../utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
"use client";

function sizeResolver(value) {
  if (typeof value === "number") return (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(value);
  return value;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/spacing-resolver/spacing-resolver.mjs"
/*!*****************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/resolvers/spacing-resolver/spacing-resolver.mjs ***!
  \*****************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   spacingResolver: () => (/* binding */ spacingResolver)
/* harmony export */ });
/* harmony import */ var _utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../../utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
"use client";

function spacingResolver(value, theme) {
  if (typeof value === "number") return (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(value);
  if (typeof value === "string") {
    const mod = value.replace("-", "");
    if (!(mod in theme.spacing)) return (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(value);
    const variable = `--mantine-spacing-${mod}`;
    return value.startsWith("-") ? `calc(var(${variable}) * -1)` : `var(${variable})`;
  }
  return value;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/style-props/style-props-data.mjs"
/*!**************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/style-props/style-props-data.mjs ***!
  \**************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   STYlE_PROPS_DATA: () => (/* binding */ STYlE_PROPS_DATA)
/* harmony export */ });
"use client";
const STYlE_PROPS_DATA = {
  m: {
    type: "spacing",
    property: "margin"
  },
  mt: {
    type: "spacing",
    property: "marginTop"
  },
  mb: {
    type: "spacing",
    property: "marginBottom"
  },
  ml: {
    type: "spacing",
    property: "marginLeft"
  },
  mr: {
    type: "spacing",
    property: "marginRight"
  },
  ms: {
    type: "spacing",
    property: "marginInlineStart"
  },
  me: {
    type: "spacing",
    property: "marginInlineEnd"
  },
  mis: {
    type: "spacing",
    property: "marginInlineStart"
  },
  mie: {
    type: "spacing",
    property: "marginInlineEnd"
  },
  mx: {
    type: "spacing",
    property: "marginInline"
  },
  my: {
    type: "spacing",
    property: "marginBlock"
  },
  p: {
    type: "spacing",
    property: "padding"
  },
  pt: {
    type: "spacing",
    property: "paddingTop"
  },
  pb: {
    type: "spacing",
    property: "paddingBottom"
  },
  pl: {
    type: "spacing",
    property: "paddingLeft"
  },
  pr: {
    type: "spacing",
    property: "paddingRight"
  },
  ps: {
    type: "spacing",
    property: "paddingInlineStart"
  },
  pe: {
    type: "spacing",
    property: "paddingInlineEnd"
  },
  pis: {
    type: "spacing",
    property: "paddingInlineStart"
  },
  pie: {
    type: "spacing",
    property: "paddingInlineEnd"
  },
  px: {
    type: "spacing",
    property: "paddingInline"
  },
  py: {
    type: "spacing",
    property: "paddingBlock"
  },
  bd: {
    type: "border",
    property: "border"
  },
  bdrs: {
    type: "radius",
    property: "borderRadius"
  },
  bg: {
    type: "color",
    property: "background"
  },
  c: {
    type: "textColor",
    property: "color"
  },
  opacity: {
    type: "identity",
    property: "opacity"
  },
  ff: {
    type: "fontFamily",
    property: "fontFamily"
  },
  fz: {
    type: "fontSize",
    property: "fontSize"
  },
  fw: {
    type: "identity",
    property: "fontWeight"
  },
  lts: {
    type: "size",
    property: "letterSpacing"
  },
  ta: {
    type: "identity",
    property: "textAlign"
  },
  lh: {
    type: "lineHeight",
    property: "lineHeight"
  },
  fs: {
    type: "identity",
    property: "fontStyle"
  },
  tt: {
    type: "identity",
    property: "textTransform"
  },
  td: {
    type: "identity",
    property: "textDecoration"
  },
  w: {
    type: "spacing",
    property: "width"
  },
  miw: {
    type: "spacing",
    property: "minWidth"
  },
  maw: {
    type: "spacing",
    property: "maxWidth"
  },
  h: {
    type: "spacing",
    property: "height"
  },
  mih: {
    type: "spacing",
    property: "minHeight"
  },
  mah: {
    type: "spacing",
    property: "maxHeight"
  },
  bgsz: {
    type: "size",
    property: "backgroundSize"
  },
  bgp: {
    type: "identity",
    property: "backgroundPosition"
  },
  bgr: {
    type: "identity",
    property: "backgroundRepeat"
  },
  bga: {
    type: "identity",
    property: "backgroundAttachment"
  },
  pos: {
    type: "identity",
    property: "position"
  },
  top: {
    type: "size",
    property: "top"
  },
  left: {
    type: "size",
    property: "left"
  },
  bottom: {
    type: "size",
    property: "bottom"
  },
  right: {
    type: "size",
    property: "right"
  },
  inset: {
    type: "size",
    property: "inset"
  },
  display: {
    type: "identity",
    property: "display"
  },
  flex: {
    type: "identity",
    property: "flex"
  }
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/Box/use-random-classname/use-random-classname.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/Box/use-random-classname/use-random-classname.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useRandomClassName: () => (/* binding */ useRandomClassName)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function useRandomClassName() {
  return `__m__-${(0,react__WEBPACK_IMPORTED_MODULE_0__.useId)().replace(/[:«»]/g, "")}`;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/DirectionProvider/DirectionProvider.mjs"
/*!*****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/DirectionProvider/DirectionProvider.mjs ***!
  \*****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useDirection: () => (/* binding */ useDirection)
/* harmony export */ });
/* unused harmony exports DirectionContext, DirectionProvider */
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-mutation-observer/use-mutation-observer.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";



const DirectionContext = (0,react__WEBPACK_IMPORTED_MODULE_0__.createContext)({
  dir: "ltr",
  toggleDirection: () => {
  },
  setDirection: () => {
  }
});
function useDirection() {
  return (0,react__WEBPACK_IMPORTED_MODULE_0__.use)(DirectionContext);
}
function DirectionProvider({ children, initialDirection = "ltr", detectDirection = true }) {
  const [dir, setDir] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(initialDirection);
  const setDirection = (0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)((direction) => {
    setDir(direction);
    if (document.documentElement.getAttribute("dir") !== direction) document.documentElement.setAttribute("dir", direction);
  }, []);
  const toggleDirection = () => setDirection(dir === "ltr" ? "rtl" : "ltr");
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_1__.useIsomorphicEffect)(() => {
    if (detectDirection) {
      const direction = document.documentElement.getAttribute("dir");
      if (direction === "rtl" || direction === "ltr") setDir(direction);
    }
  }, []);
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_2__.useMutationObserverTarget)((0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)(() => {
    if (typeof document === "undefined") return;
    const direction = document.documentElement.getAttribute("dir");
    if (direction === "rtl" || direction === "ltr") setDir((prev) => prev !== direction ? direction : prev);
  }, []), detectDirection ? {
    attributes: true,
    attributeFilter: ["dir"]
  } : {}, typeof document !== "undefined" && detectDirection ? document.documentElement : null);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(DirectionContext, {
    value: {
      dir,
      toggleDirection,
      setDirection
    },
    children
  });
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/InlineStyles/InlineStyles.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/InlineStyles/InlineStyles.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InlineStyles: () => (/* binding */ InlineStyles)
/* harmony export */ });
/* harmony import */ var _MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../MantineProvider/Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var _styles_to_string_styles_to_string_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./styles-to-string/styles-to-string.mjs */ "../../node_modules/@mantine/core/esm/core/InlineStyles/styles-to-string/styles-to-string.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";



function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) + hash + str.charCodeAt(i) & 4294967295;
  return (hash >>> 0).toString(36);
}
function InlineStyles({ deduplicate, ...props }) {
  const nonce = (0,_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useMantineStyleNonce)();
  const css = (0,_styles_to_string_styles_to_string_mjs__WEBPACK_IMPORTED_MODULE_1__.stylesToString)(props);
  if (deduplicate) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("style", {
    href: `mantine-${simpleHash(css)}`,
    precedence: "mantine",
    nonce: nonce == null ? void 0 : nonce(),
    children: css
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("style", {
    "data-mantine-styles": "inline",
    nonce: nonce == null ? void 0 : nonce(),
    dangerouslySetInnerHTML: { __html: css }
  });
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/InlineStyles/css-object-to-string/css-object-to-string.mjs"
/*!************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/InlineStyles/css-object-to-string/css-object-to-string.mjs ***!
  \************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   cssObjectToString: () => (/* binding */ cssObjectToString)
/* harmony export */ });
/* harmony import */ var _utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../utils/keys/keys.mjs */ "../../node_modules/@mantine/core/esm/core/utils/keys/keys.mjs");
/* harmony import */ var _utils_camel_to_kebab_case_camel_to_kebab_case_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../utils/camel-to-kebab-case/camel-to-kebab-case.mjs */ "../../node_modules/@mantine/core/esm/core/utils/camel-to-kebab-case/camel-to-kebab-case.mjs");
"use client";


function cssObjectToString(css) {
  return (0,_utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__.keys)(css).reduce((acc, rule) => css[rule] !== void 0 ? `${acc}${(0,_utils_camel_to_kebab_case_camel_to_kebab_case_mjs__WEBPACK_IMPORTED_MODULE_1__.camelToKebabCase)(rule)}:${css[rule]};` : acc, "").trim();
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/InlineStyles/hash-styles.mjs"
/*!******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/InlineStyles/hash-styles.mjs ***!
  \******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   hashStyleProps: () => (/* binding */ hashStyleProps)
/* harmony export */ });
/* harmony import */ var _css_object_to_string_css_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./css-object-to-string/css-object-to-string.mjs */ "../../node_modules/@mantine/core/esm/core/InlineStyles/css-object-to-string/css-object-to-string.mjs");
"use client";

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) + hash + str.charCodeAt(i) & 4294967295;
  return (hash >>> 0).toString(36);
}
function hashStyleProps(styles, media) {
  return `__mdi__-${djb2Hash(`${styles ? (0,_css_object_to_string_css_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__.cssObjectToString)(styles) : ""}|${Array.isArray(media) ? media.map((m) => `${m.query}:${(0,_css_object_to_string_css_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__.cssObjectToString)(m.styles)}`).join("|") : ""}`)}`;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/InlineStyles/styles-to-string/styles-to-string.mjs"
/*!****************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/InlineStyles/styles-to-string/styles-to-string.mjs ***!
  \****************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   stylesToString: () => (/* binding */ stylesToString)
/* harmony export */ });
/* harmony import */ var _css_object_to_string_css_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../css-object-to-string/css-object-to-string.mjs */ "../../node_modules/@mantine/core/esm/core/InlineStyles/css-object-to-string/css-object-to-string.mjs");
"use client";

function stylesToString({ selector, styles, media, container }) {
  const baseStyles = styles ? (0,_css_object_to_string_css_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__.cssObjectToString)(styles) : "";
  const mediaQueryStyles = !Array.isArray(media) ? [] : media.map((item) => `@media${item.query}{${selector}{${(0,_css_object_to_string_css_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__.cssObjectToString)(item.styles)}}}`);
  const containerStyles = !Array.isArray(container) ? [] : container.map((item) => `@container ${item.query}{${selector}{${(0,_css_object_to_string_css_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__.cssObjectToString)(item.styles)}}}`);
  return `${baseStyles ? `${selector}{${baseStyles}}` : ""}${mediaQueryStyles.join("")}${containerStyles.join("")}`.trim();
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MantineContext: () => (/* binding */ MantineContext),
/* harmony export */   useMantineClassNamesPrefix: () => (/* binding */ useMantineClassNamesPrefix),
/* harmony export */   useMantineCssVariablesResolver: () => (/* binding */ useMantineCssVariablesResolver),
/* harmony export */   useMantineDeduplicateInlineStyles: () => (/* binding */ useMantineDeduplicateInlineStyles),
/* harmony export */   useMantineEnv: () => (/* binding */ useMantineEnv),
/* harmony export */   useMantineIsHeadless: () => (/* binding */ useMantineIsHeadless),
/* harmony export */   useMantineStyleNonce: () => (/* binding */ useMantineStyleNonce),
/* harmony export */   useMantineStylesTransform: () => (/* binding */ useMantineStylesTransform),
/* harmony export */   useMantineSxTransform: () => (/* binding */ useMantineSxTransform),
/* harmony export */   useMantineWithStaticClasses: () => (/* binding */ useMantineWithStaticClasses)
/* harmony export */ });
/* unused harmony export useMantineContext */
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

const MantineContext = (0,react__WEBPACK_IMPORTED_MODULE_0__.createContext)(null);
function useMantineContext() {
  const ctx = (0,react__WEBPACK_IMPORTED_MODULE_0__.use)(MantineContext);
  if (!ctx) throw new Error("[@mantine/core] MantineProvider was not found in tree");
  return ctx;
}
function useMantineCssVariablesResolver() {
  return useMantineContext().cssVariablesResolver;
}
function useMantineClassNamesPrefix() {
  return useMantineContext().classNamesPrefix;
}
function useMantineStyleNonce() {
  return useMantineContext().getStyleNonce;
}
function useMantineWithStaticClasses() {
  return useMantineContext().withStaticClasses;
}
function useMantineIsHeadless() {
  return useMantineContext().headless;
}
function useMantineSxTransform() {
  var _a;
  return (_a = useMantineContext().stylesTransform) == null ? void 0 : _a.sx;
}
function useMantineStylesTransform() {
  var _a;
  return (_a = useMantineContext().stylesTransform) == null ? void 0 : _a.styles;
}
function useMantineEnv() {
  return useMantineContext().env || "default";
}
function useMantineDeduplicateInlineStyles() {
  return useMantineContext().deduplicateInlineStyles;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineClasses/MantineClasses.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/MantineClasses/MantineClasses.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MantineClasses: () => (/* binding */ MantineClasses)
/* harmony export */ });
/* harmony import */ var _utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../utils/keys/keys.mjs */ "../../node_modules/@mantine/core/esm/core/utils/keys/keys.mjs");
/* harmony import */ var _utils_units_converters_px_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../utils/units-converters/px.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/px.mjs");
/* harmony import */ var _utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var _MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






function MantineClasses() {
  const theme = (0,_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_4__.useMantineTheme)();
  const nonce = (0,_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_3__.useMantineStyleNonce)();
  const classes = (0,_utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__.keys)(theme.breakpoints).reduce((acc, breakpoint) => {
    const isPxBreakpoint = theme.breakpoints[breakpoint].includes("px");
    const pxValue = (0,_utils_units_converters_px_mjs__WEBPACK_IMPORTED_MODULE_1__.px)(theme.breakpoints[breakpoint]);
    return `${acc}@media (max-width: ${isPxBreakpoint ? `${pxValue - 0.1}px` : (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_2__.em)(pxValue - 0.1)}) {.mantine-visible-from-${breakpoint} {display: none !important;}}@media (min-width: ${isPxBreakpoint ? `${pxValue}px` : (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_2__.em)(pxValue)}) {.mantine-hidden-from-${breakpoint} {display: none !important;}}`;
  }, "");
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)("style", {
    "data-mantine-styles": "classes",
    nonce: nonce == null ? void 0 : nonce(),
    dangerouslySetInnerHTML: { __html: classes }
  });
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/MantineCssVariables.mjs"
/*!*************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/MantineCssVariables.mjs ***!
  \*************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MantineCssVariables: () => (/* binding */ MantineCssVariables)
/* harmony export */ });
/* harmony import */ var _Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var _MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
/* harmony import */ var _convert_css_variables_convert_css_variables_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../convert-css-variables/convert-css-variables.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/convert-css-variables/convert-css-variables.mjs");
/* harmony import */ var _get_merged_variables_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./get-merged-variables.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/get-merged-variables.mjs");
/* harmony import */ var _remove_default_variables_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./remove-default-variables.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/remove-default-variables.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






function getColorSchemeCssVariables(selectorOverride) {
  return (0,_convert_css_variables_convert_css_variables_mjs__WEBPACK_IMPORTED_MODULE_2__.convertCssVariables)({
    variables: {},
    dark: { "--mantine-color-scheme": "dark" },
    light: { "--mantine-color-scheme": "light" }
  }, selectorOverride);
}
function MantineCssVariables({ cssVariablesSelector, deduplicateCssVariables }) {
  const theme = (0,_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_1__.useMantineTheme)();
  const nonce = (0,_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useMantineStyleNonce)();
  const mergedVariables = (0,_get_merged_variables_mjs__WEBPACK_IMPORTED_MODULE_3__.getMergedVariables)({
    theme,
    generator: (0,_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useMantineCssVariablesResolver)()
  });
  const shouldCleanVariables = (cssVariablesSelector === void 0 || cssVariablesSelector === ":root" || cssVariablesSelector === ":host") && deduplicateCssVariables;
  const css = (0,_convert_css_variables_convert_css_variables_mjs__WEBPACK_IMPORTED_MODULE_2__.convertCssVariables)(shouldCleanVariables ? (0,_remove_default_variables_mjs__WEBPACK_IMPORTED_MODULE_4__.removeDefaultVariables)(mergedVariables) : mergedVariables, cssVariablesSelector);
  if (css) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)("style", {
    "data-mantine-styles": true,
    nonce: nonce == null ? void 0 : nonce(),
    dangerouslySetInnerHTML: { __html: `${css}${shouldCleanVariables ? "" : getColorSchemeCssVariables(cssVariablesSelector)}` }
  });
  return null;
}
MantineCssVariables.displayName = "@mantine/CssVariables";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/default-css-variables-resolver.mjs"
/*!************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/default-css-variables-resolver.mjs ***!
  \************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   defaultCssVariablesResolver: () => (/* binding */ defaultCssVariablesResolver)
/* harmony export */ });
/* harmony import */ var _utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../utils/keys/keys.mjs */ "../../node_modules/@mantine/core/esm/core/utils/keys/keys.mjs");
/* harmony import */ var _utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _color_functions_get_primary_shade_get_primary_shade_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../color-functions/get-primary-shade/get-primary-shade.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-primary-shade/get-primary-shade.mjs");
/* harmony import */ var _color_functions_get_contrast_color_get_contrast_color_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../color-functions/get-contrast-color/get-contrast-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-contrast-color/get-contrast-color.mjs");
/* harmony import */ var _get_css_color_variables_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./get-css-color-variables.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/get-css-color-variables.mjs");
/* harmony import */ var _virtual_color_virtual_color_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./virtual-color/virtual-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/virtual-color/virtual-color.mjs");
"use client";






function assignSizeVariables(variables, sizes, name) {
  (0,_utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__.keys)(sizes).forEach((size) => Object.assign(variables, { [`--mantine-${name}-${size}`]: sizes[size] }));
}
const defaultCssVariablesResolver = (theme) => {
  const lightPrimaryShade = (0,_color_functions_get_primary_shade_get_primary_shade_mjs__WEBPACK_IMPORTED_MODULE_2__.getPrimaryShade)(theme, "light");
  const defaultRadius = theme.defaultRadius in theme.radius ? theme.radius[theme.defaultRadius] : (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_1__.rem)(theme.defaultRadius);
  const result = {
    variables: {
      "--mantine-z-index-app": "100",
      "--mantine-z-index-modal": "200",
      "--mantine-z-index-popover": "300",
      "--mantine-z-index-overlay": "400",
      "--mantine-z-index-max": "9999",
      "--mantine-scale": theme.scale.toString(),
      "--mantine-cursor-type": theme.cursorType,
      "--mantine-webkit-font-smoothing": theme.fontSmoothing ? "antialiased" : "unset",
      "--mantine-moz-font-smoothing": theme.fontSmoothing ? "grayscale" : "unset",
      "--mantine-color-white": theme.white,
      "--mantine-color-black": theme.black,
      "--mantine-line-height": theme.lineHeights.md,
      "--mantine-font-family": theme.fontFamily,
      "--mantine-font-family-monospace": theme.fontFamilyMonospace,
      "--mantine-font-family-headings": theme.headings.fontFamily,
      "--mantine-heading-font-weight": theme.headings.fontWeight,
      "--mantine-heading-text-wrap": theme.headings.textWrap,
      "--mantine-radius-default": defaultRadius,
      "--mantine-primary-color-filled": `var(--mantine-color-${theme.primaryColor}-filled)`,
      "--mantine-primary-color-filled-hover": `var(--mantine-color-${theme.primaryColor}-filled-hover)`,
      "--mantine-primary-color-light": `var(--mantine-color-${theme.primaryColor}-light)`,
      "--mantine-primary-color-light-hover": `var(--mantine-color-${theme.primaryColor}-light-hover)`,
      "--mantine-primary-color-light-color": `var(--mantine-color-${theme.primaryColor}-light-color)`
    },
    light: {
      "--mantine-color-scheme": "light",
      "--mantine-primary-color-contrast": (0,_color_functions_get_contrast_color_get_contrast_color_mjs__WEBPACK_IMPORTED_MODULE_3__.getPrimaryContrastColor)(theme, "light"),
      "--mantine-color-bright": "var(--mantine-color-black)",
      "--mantine-color-text": theme.black,
      "--mantine-color-body": theme.white,
      "--mantine-color-error": "var(--mantine-color-red-6)",
      "--mantine-color-placeholder": "var(--mantine-color-gray-5)",
      "--mantine-color-anchor": `var(--mantine-color-${theme.primaryColor}-${lightPrimaryShade})`,
      "--mantine-color-default": "var(--mantine-color-white)",
      "--mantine-color-default-hover": "var(--mantine-color-gray-0)",
      "--mantine-color-default-color": "var(--mantine-color-black)",
      "--mantine-color-default-border": "var(--mantine-color-gray-4)",
      "--mantine-color-dimmed": "var(--mantine-color-gray-6)",
      "--mantine-color-disabled": "var(--mantine-color-gray-2)",
      "--mantine-color-disabled-color": "var(--mantine-color-gray-5)",
      "--mantine-color-disabled-border": "var(--mantine-color-gray-3)"
    },
    dark: {
      "--mantine-color-scheme": "dark",
      "--mantine-primary-color-contrast": (0,_color_functions_get_contrast_color_get_contrast_color_mjs__WEBPACK_IMPORTED_MODULE_3__.getPrimaryContrastColor)(theme, "dark"),
      "--mantine-color-bright": "var(--mantine-color-white)",
      "--mantine-color-text": "var(--mantine-color-dark-0)",
      "--mantine-color-body": "var(--mantine-color-dark-7)",
      "--mantine-color-error": "var(--mantine-color-red-8)",
      "--mantine-color-placeholder": "var(--mantine-color-dark-3)",
      "--mantine-color-anchor": `var(--mantine-color-${theme.primaryColor}-4)`,
      "--mantine-color-default": "var(--mantine-color-dark-6)",
      "--mantine-color-default-hover": "var(--mantine-color-dark-5)",
      "--mantine-color-default-color": "var(--mantine-color-white)",
      "--mantine-color-default-border": "var(--mantine-color-dark-4)",
      "--mantine-color-dimmed": "var(--mantine-color-dark-2)",
      "--mantine-color-disabled": "var(--mantine-color-dark-6)",
      "--mantine-color-disabled-color": "var(--mantine-color-dark-3)",
      "--mantine-color-disabled-border": "var(--mantine-color-dark-4)"
    }
  };
  assignSizeVariables(result.variables, theme.breakpoints, "breakpoint");
  assignSizeVariables(result.variables, theme.spacing, "spacing");
  assignSizeVariables(result.variables, theme.fontSizes, "font-size");
  assignSizeVariables(result.variables, theme.lineHeights, "line-height");
  assignSizeVariables(result.variables, theme.shadows, "shadow");
  assignSizeVariables(result.variables, theme.radius, "radius");
  assignSizeVariables(result.variables, theme.fontWeights, "font-weight");
  theme.colors[theme.primaryColor].forEach((_, index) => {
    result.variables[`--mantine-primary-color-${index}`] = `var(--mantine-color-${theme.primaryColor}-${index})`;
  });
  (0,_utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__.keys)(theme.colors).forEach((color) => {
    const value = theme.colors[color];
    if ((0,_virtual_color_virtual_color_mjs__WEBPACK_IMPORTED_MODULE_5__.isVirtualColor)(value)) {
      Object.assign(result.light, (0,_get_css_color_variables_mjs__WEBPACK_IMPORTED_MODULE_4__.getCSSColorVariables)({
        theme,
        name: value.name,
        color: value.light,
        colorScheme: "light",
        withColorValues: true
      }));
      Object.assign(result.dark, (0,_get_css_color_variables_mjs__WEBPACK_IMPORTED_MODULE_4__.getCSSColorVariables)({
        theme,
        name: value.name,
        color: value.dark,
        colorScheme: "dark",
        withColorValues: true
      }));
      return;
    }
    value.forEach((shade, index) => {
      result.variables[`--mantine-color-${color}-${index}`] = shade;
    });
    Object.assign(result.light, (0,_get_css_color_variables_mjs__WEBPACK_IMPORTED_MODULE_4__.getCSSColorVariables)({
      theme,
      color,
      colorScheme: "light",
      withColorValues: false
    }));
    Object.assign(result.dark, (0,_get_css_color_variables_mjs__WEBPACK_IMPORTED_MODULE_4__.getCSSColorVariables)({
      theme,
      color,
      colorScheme: "dark",
      withColorValues: false
    }));
  });
  const headings = theme.headings.sizes;
  (0,_utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__.keys)(headings).forEach((heading) => {
    result.variables[`--mantine-${heading}-font-size`] = headings[heading].fontSize;
    result.variables[`--mantine-${heading}-line-height`] = headings[heading].lineHeight;
    result.variables[`--mantine-${heading}-font-weight`] = headings[heading].fontWeight || theme.headings.fontWeight;
  });
  return result;
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/get-css-color-variables.mjs"
/*!*****************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/get-css-color-variables.mjs ***!
  \*****************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getCSSColorVariables: () => (/* binding */ getCSSColorVariables)
/* harmony export */ });
/* harmony import */ var _color_functions_get_primary_shade_get_primary_shade_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../color-functions/get-primary-shade/get-primary-shade.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-primary-shade/get-primary-shade.mjs");
/* harmony import */ var _color_functions_darken_darken_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../color-functions/darken/darken.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/darken/darken.mjs");
/* harmony import */ var _color_functions_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../color-functions/rgba/rgba.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/rgba/rgba.mjs");
"use client";



function getCSSColorVariables({ theme, color, colorScheme, name = color, withColorValues = true }) {
  if (!theme.colors[color]) return {};
  if (colorScheme === "light") {
    const primaryShade2 = (0,_color_functions_get_primary_shade_get_primary_shade_mjs__WEBPACK_IMPORTED_MODULE_0__.getPrimaryShade)(theme, "light");
    const dynamicVariables2 = {
      [`--mantine-color-${name}-text`]: `var(--mantine-color-${name}-filled)`,
      [`--mantine-color-${name}-filled`]: `var(--mantine-color-${name}-${primaryShade2})`,
      [`--mantine-color-${name}-filled-hover`]: `var(--mantine-color-${name}-${primaryShade2 === 9 ? 8 : primaryShade2 + 1})`,
      [`--mantine-color-${name}-light`]: `var(--mantine-color-${name}-1)`,
      [`--mantine-color-${name}-light-hover`]: `var(--mantine-color-${name}-2)`,
      [`--mantine-color-${name}-light-color`]: `var(--mantine-color-${name}-9)`,
      [`--mantine-color-${name}-outline`]: `var(--mantine-color-${name}-${primaryShade2})`,
      [`--mantine-color-${name}-outline-hover`]: (0,_color_functions_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_2__.alpha)(theme.colors[color][primaryShade2], 0.05)
    };
    if (!withColorValues) return dynamicVariables2;
    return {
      [`--mantine-color-${name}-0`]: theme.colors[color][0],
      [`--mantine-color-${name}-1`]: theme.colors[color][1],
      [`--mantine-color-${name}-2`]: theme.colors[color][2],
      [`--mantine-color-${name}-3`]: theme.colors[color][3],
      [`--mantine-color-${name}-4`]: theme.colors[color][4],
      [`--mantine-color-${name}-5`]: theme.colors[color][5],
      [`--mantine-color-${name}-6`]: theme.colors[color][6],
      [`--mantine-color-${name}-7`]: theme.colors[color][7],
      [`--mantine-color-${name}-8`]: theme.colors[color][8],
      [`--mantine-color-${name}-9`]: theme.colors[color][9],
      ...dynamicVariables2
    };
  }
  const primaryShade = (0,_color_functions_get_primary_shade_get_primary_shade_mjs__WEBPACK_IMPORTED_MODULE_0__.getPrimaryShade)(theme, "dark");
  const dynamicVariables = {
    [`--mantine-color-${name}-text`]: `var(--mantine-color-${name}-4)`,
    [`--mantine-color-${name}-filled`]: `var(--mantine-color-${name}-${primaryShade})`,
    [`--mantine-color-${name}-filled-hover`]: `var(--mantine-color-${name}-${primaryShade === 9 ? 8 : primaryShade + 1})`,
    [`--mantine-color-${name}-light`]: (0,_color_functions_darken_darken_mjs__WEBPACK_IMPORTED_MODULE_1__.darken)(theme.colors[color][9], 0.5),
    [`--mantine-color-${name}-light-hover`]: (0,_color_functions_darken_darken_mjs__WEBPACK_IMPORTED_MODULE_1__.darken)(theme.colors[color][9], 0.3),
    [`--mantine-color-${name}-light-color`]: `var(--mantine-color-${name}-0)`,
    [`--mantine-color-${name}-outline`]: `var(--mantine-color-${name}-${Math.max(primaryShade - 4, 0)})`,
    [`--mantine-color-${name}-outline-hover`]: (0,_color_functions_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_2__.alpha)(theme.colors[color][Math.max(primaryShade - 4, 0)], 0.05)
  };
  if (!withColorValues) return dynamicVariables;
  return {
    [`--mantine-color-${name}-0`]: theme.colors[color][0],
    [`--mantine-color-${name}-1`]: theme.colors[color][1],
    [`--mantine-color-${name}-2`]: theme.colors[color][2],
    [`--mantine-color-${name}-3`]: theme.colors[color][3],
    [`--mantine-color-${name}-4`]: theme.colors[color][4],
    [`--mantine-color-${name}-5`]: theme.colors[color][5],
    [`--mantine-color-${name}-6`]: theme.colors[color][6],
    [`--mantine-color-${name}-7`]: theme.colors[color][7],
    [`--mantine-color-${name}-8`]: theme.colors[color][8],
    [`--mantine-color-${name}-9`]: theme.colors[color][9],
    ...dynamicVariables
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/get-merged-variables.mjs"
/*!**************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/get-merged-variables.mjs ***!
  \**************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getMergedVariables: () => (/* binding */ getMergedVariables)
/* harmony export */ });
/* harmony import */ var _utils_deep_merge_deep_merge_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../utils/deep-merge/deep-merge.mjs */ "../../node_modules/@mantine/core/esm/core/utils/deep-merge/deep-merge.mjs");
/* harmony import */ var _default_css_variables_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./default-css-variables-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/default-css-variables-resolver.mjs");
"use client";


function getMergedVariables({ theme, generator }) {
  const defaultResolver = (0,_default_css_variables_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.defaultCssVariablesResolver)(theme);
  const providerGenerator = generator == null ? void 0 : generator(theme);
  return providerGenerator ? (0,_utils_deep_merge_deep_merge_mjs__WEBPACK_IMPORTED_MODULE_0__.deepMerge)(defaultResolver, providerGenerator) : defaultResolver;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/remove-default-variables.mjs"
/*!******************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/remove-default-variables.mjs ***!
  \******************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   removeDefaultVariables: () => (/* binding */ removeDefaultVariables)
/* harmony export */ });
/* harmony import */ var _utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../utils/keys/keys.mjs */ "../../node_modules/@mantine/core/esm/core/utils/keys/keys.mjs");
/* harmony import */ var _default_theme_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../default-theme.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/default-theme.mjs");
/* harmony import */ var _default_css_variables_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./default-css-variables-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/default-css-variables-resolver.mjs");
"use client";



const defaultCssVariables = (0,_default_css_variables_resolver_mjs__WEBPACK_IMPORTED_MODULE_2__.defaultCssVariablesResolver)(_default_theme_mjs__WEBPACK_IMPORTED_MODULE_1__.DEFAULT_THEME);
function removeDefaultVariables(input) {
  const cleaned = {
    variables: {},
    light: {},
    dark: {}
  };
  (0,_utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__.keys)(input.variables).forEach((key) => {
    if (defaultCssVariables.variables[key] !== input.variables[key]) cleaned.variables[key] = input.variables[key];
  });
  (0,_utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__.keys)(input.light).forEach((key) => {
    if (defaultCssVariables.light[key] !== input.light[key]) cleaned.light[key] = input.light[key];
  });
  (0,_utils_keys_keys_mjs__WEBPACK_IMPORTED_MODULE_0__.keys)(input.dark).forEach((key) => {
    if (defaultCssVariables.dark[key] !== input.dark[key]) cleaned.dark[key] = input.dark[key];
  });
  return cleaned;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/virtual-color/virtual-color.mjs"
/*!*********************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/virtual-color/virtual-color.mjs ***!
  \*********************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isVirtualColor: () => (/* binding */ isVirtualColor)
/* harmony export */ });
/* unused harmony export virtualColor */
/* harmony import */ var _color_functions_colors_tuple_colors_tuple_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../color-functions/colors-tuple/colors-tuple.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/colors-tuple/colors-tuple.mjs");

function virtualColor(input) {
  const result = (0,_color_functions_colors_tuple_colors_tuple_mjs__WEBPACK_IMPORTED_MODULE_0__.colorsTuple)(Array.from({ length: 10 }).map((_, i) => `var(--mantine-color-${input.name}-${i})`));
  Object.defineProperty(result, "mantine-virtual-color", {
    enumerable: false,
    writable: false,
    configurable: false,
    value: true
  });
  Object.defineProperty(result, "dark", {
    enumerable: false,
    writable: false,
    configurable: false,
    value: input.dark
  });
  Object.defineProperty(result, "light", {
    enumerable: false,
    writable: false,
    configurable: false,
    value: input.light
  });
  Object.defineProperty(result, "name", {
    enumerable: false,
    writable: false,
    configurable: false,
    value: input.name
  });
  return result;
}
function isVirtualColor(value) {
  return !!value && typeof value === "object" && "mantine-virtual-color" in value;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineProvider.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/MantineProvider.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MantineProvider: () => (/* binding */ MantineProvider)
/* harmony export */ });
/* unused harmony export HeadlessMantineProvider */
/* harmony import */ var _color_scheme_managers_local_storage_manager_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./color-scheme-managers/local-storage-manager.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-scheme-managers/local-storage-manager.mjs");
/* harmony import */ var _Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var _use_mantine_color_scheme_use_provider_color_scheme_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./use-mantine-color-scheme/use-provider-color-scheme.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-mantine-color-scheme/use-provider-color-scheme.mjs");
/* harmony import */ var _MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
/* harmony import */ var _MantineClasses_MantineClasses_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./MantineClasses/MantineClasses.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineClasses/MantineClasses.mjs");
/* harmony import */ var _MantineCssVariables_MantineCssVariables_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./MantineCssVariables/MantineCssVariables.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineCssVariables/MantineCssVariables.mjs");
/* harmony import */ var _use_respect_reduce_motion_use_respect_reduce_motion_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./use-respect-reduce-motion/use-respect-reduce-motion.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-respect-reduce-motion/use-respect-reduce-motion.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";











function MantineProvider({ theme, children, getStyleNonce, withStaticClasses = true, withGlobalClasses = true, deduplicateCssVariables = true, withCssVariables = true, cssVariablesSelector, classNamesPrefix = "mantine", colorSchemeManager = (0,_color_scheme_managers_local_storage_manager_mjs__WEBPACK_IMPORTED_MODULE_0__.localStorageColorSchemeManager)(), defaultColorScheme = "light", getRootElement = () => document.documentElement, cssVariablesResolver, forceColorScheme, stylesTransform, env, deduplicateInlineStyles = false }) {
  const { colorScheme, setColorScheme, clearColorScheme } = (0,_use_mantine_color_scheme_use_provider_color_scheme_mjs__WEBPACK_IMPORTED_MODULE_2__.useProviderColorScheme)({
    defaultColorScheme,
    forceColorScheme,
    manager: colorSchemeManager,
    getRootElement
  });
  (0,_use_respect_reduce_motion_use_respect_reduce_motion_mjs__WEBPACK_IMPORTED_MODULE_6__.useRespectReduceMotion)({
    respectReducedMotion: (theme == null ? void 0 : theme.respectReducedMotion) || false,
    getRootElement
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_1__.MantineContext, {
    value: {
      colorScheme,
      setColorScheme,
      clearColorScheme,
      getRootElement,
      classNamesPrefix,
      getStyleNonce,
      cssVariablesResolver,
      cssVariablesSelector: cssVariablesSelector != null ? cssVariablesSelector : ":root",
      withStaticClasses,
      stylesTransform,
      env,
      deduplicateInlineStyles
    },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsxs)(_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_3__.MantineThemeProvider, {
      theme,
      children: [
        withCssVariables && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_MantineCssVariables_MantineCssVariables_mjs__WEBPACK_IMPORTED_MODULE_5__.MantineCssVariables, {
          cssVariablesSelector,
          deduplicateCssVariables
        }),
        withGlobalClasses && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_MantineClasses_MantineClasses_mjs__WEBPACK_IMPORTED_MODULE_4__.MantineClasses, {}),
        children
      ]
    })
  });
}
MantineProvider.displayName = "@mantine/core/MantineProvider";
function HeadlessMantineProvider({ children, theme, env }) {
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_1__.MantineContext, {
    value: {
      colorScheme: "auto",
      setColorScheme: () => {
      },
      clearColorScheme: () => {
      },
      getRootElement: () => document.documentElement,
      classNamesPrefix: "mantine",
      cssVariablesSelector: ":root",
      withStaticClasses: false,
      headless: true,
      env
    },
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_7__.jsx)(_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_3__.MantineThemeProvider, {
      theme,
      children
    })
  });
}
HeadlessMantineProvider.displayName = "@mantine/core/HeadlessMantineProvider";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs"
/*!***************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs ***!
  \***************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MantineThemeProvider: () => (/* binding */ MantineThemeProvider),
/* harmony export */   useMantineTheme: () => (/* binding */ useMantineTheme)
/* harmony export */ });
/* unused harmony exports MantineThemeContext, useSafeMantineTheme */
/* harmony import */ var _default_theme_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../default-theme.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/default-theme.mjs");
/* harmony import */ var _merge_mantine_theme_merge_mantine_theme_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../merge-mantine-theme/merge-mantine-theme.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/merge-mantine-theme/merge-mantine-theme.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




const MantineThemeContext = (0,react__WEBPACK_IMPORTED_MODULE_2__.createContext)(null);
const useSafeMantineTheme = () => (0,react__WEBPACK_IMPORTED_MODULE_2__.use)(MantineThemeContext) || _default_theme_mjs__WEBPACK_IMPORTED_MODULE_0__.DEFAULT_THEME;
function useMantineTheme() {
  const ctx = (0,react__WEBPACK_IMPORTED_MODULE_2__.use)(MantineThemeContext);
  if (!ctx) throw new Error("@mantine/core: MantineProvider was not found in component tree, make sure you have it in your app");
  return ctx;
}
function MantineThemeProvider({ theme, children, inherit = true }) {
  const parentTheme = useSafeMantineTheme();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(MantineThemeContext, {
    value: (0,react__WEBPACK_IMPORTED_MODULE_2__.useMemo)(() => (0,_merge_mantine_theme_merge_mantine_theme_mjs__WEBPACK_IMPORTED_MODULE_1__.mergeMantineTheme)(inherit ? parentTheme : _default_theme_mjs__WEBPACK_IMPORTED_MODULE_0__.DEFAULT_THEME, theme), [
      theme,
      parentTheme,
      inherit
    ]),
    children
  });
}
MantineThemeProvider.displayName = "@mantine/core/MantineThemeProvider";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/colors-tuple/colors-tuple.mjs"
/*!***************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/colors-tuple/colors-tuple.mjs ***!
  \***************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   colorsTuple: () => (/* binding */ colorsTuple)
/* harmony export */ });
function colorsTuple(input) {
  if (Array.isArray(input)) return input;
  return Array(10).fill(input);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/darken/darken.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/darken/darken.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   darken: () => (/* binding */ darken)
/* harmony export */ });
/* harmony import */ var _to_rgba_to_rgba_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../to-rgba/to-rgba.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/to-rgba/to-rgba.mjs");

function darken(color, alpha) {
  if (color.startsWith("var(")) return `color-mix(in srgb, ${color}, black ${alpha * 100}%)`;
  const { r, g, b, a } = (0,_to_rgba_to_rgba_mjs__WEBPACK_IMPORTED_MODULE_0__.toRgba)(color);
  const f = 1 - alpha;
  const dark = (input) => Math.round(input * f);
  return `rgba(${dark(r)}, ${dark(g)}, ${dark(b)}, ${a})`;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/default-variant-colors-resolver/default-variant-colors-resolver.mjs"
/*!*****************************************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/default-variant-colors-resolver/default-variant-colors-resolver.mjs ***!
  \*****************************************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   defaultVariantColorsResolver: () => (/* binding */ defaultVariantColorsResolver)
/* harmony export */ });
/* harmony import */ var _utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _parse_theme_color_parse_theme_color_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../parse-theme-color/parse-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/parse-theme-color/parse-theme-color.mjs");
/* harmony import */ var _darken_darken_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../darken/darken.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/darken/darken.mjs");
/* harmony import */ var _get_gradient_get_gradient_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../get-gradient/get-gradient.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-gradient/get-gradient.mjs");
/* harmony import */ var _rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../rgba/rgba.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/rgba/rgba.mjs");
"use client";





const defaultVariantColorsResolver = ({ color, theme, variant, gradient, autoContrast }) => {
  const parsed = (0,_parse_theme_color_parse_theme_color_mjs__WEBPACK_IMPORTED_MODULE_1__.parseThemeColor)({
    color,
    theme
  });
  const _autoContrast = typeof autoContrast === "boolean" ? autoContrast : theme.autoContrast;
  if (variant === "none") return {
    background: "transparent",
    hover: "transparent",
    color: "inherit",
    border: "none"
  };
  if (variant === "filled") {
    const textColor = _autoContrast ? parsed.isLight ? "var(--mantine-color-black)" : "var(--mantine-color-white)" : "var(--mantine-color-white)";
    if (parsed.isThemeColor) {
      if (parsed.shade === void 0) return {
        background: `var(--mantine-color-${color}-filled)`,
        hover: `var(--mantine-color-${color}-filled-hover)`,
        color: textColor,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
      };
      return {
        background: `var(--mantine-color-${parsed.color}-${parsed.shade})`,
        hover: `var(--mantine-color-${parsed.color}-${parsed.shade === 9 ? 8 : parsed.shade + 1})`,
        color: textColor,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
      };
    }
    return {
      background: color,
      hover: (0,_darken_darken_mjs__WEBPACK_IMPORTED_MODULE_2__.darken)(color, 0.1),
      color: textColor,
      border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
    };
  }
  if (variant === "light") {
    if (parsed.isThemeColor) {
      if (parsed.shade === void 0) return {
        background: `var(--mantine-color-${color}-light)`,
        hover: `var(--mantine-color-${color}-light-hover)`,
        color: `var(--mantine-color-${color}-light-color)`,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
      };
      const parsedColor = theme.colors[parsed.color][parsed.shade];
      return {
        background: parsedColor,
        hover: (0,_darken_darken_mjs__WEBPACK_IMPORTED_MODULE_2__.darken)(parsedColor, 0.1),
        color: `var(--mantine-color-${parsed.color}-light-color)`,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
      };
    }
    return {
      background: (0,_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_4__.rgba)(color, 0.1),
      hover: (0,_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_4__.rgba)(color, 0.12),
      color,
      border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
    };
  }
  if (variant === "outline") {
    if (parsed.isThemeColor) {
      if (parsed.shade === void 0) return {
        background: "transparent",
        hover: `var(--mantine-color-${color}-outline-hover)`,
        color: `var(--mantine-color-${color}-outline)`,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid var(--mantine-color-${color}-outline)`
      };
      return {
        background: "transparent",
        hover: (0,_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_4__.rgba)(theme.colors[parsed.color][parsed.shade], 0.05),
        color: `var(--mantine-color-${parsed.color}-${parsed.shade})`,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid var(--mantine-color-${parsed.color}-${parsed.shade})`
      };
    }
    return {
      background: "transparent",
      hover: (0,_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_4__.rgba)(color, 0.05),
      color,
      border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid ${color}`
    };
  }
  if (variant === "subtle") {
    if (parsed.isThemeColor) {
      if (parsed.shade === void 0) return {
        background: "transparent",
        hover: `var(--mantine-color-${color}-light-hover)`,
        color: `var(--mantine-color-${color}-light-color)`,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
      };
      const parsedColor = theme.colors[parsed.color][parsed.shade];
      return {
        background: "transparent",
        hover: (0,_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_4__.rgba)(parsedColor, 0.12),
        color: `var(--mantine-color-${parsed.color}-${Math.min(parsed.shade, 6)})`,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
      };
    }
    return {
      background: "transparent",
      hover: (0,_rgba_rgba_mjs__WEBPACK_IMPORTED_MODULE_4__.rgba)(color, 0.12),
      color,
      border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
    };
  }
  if (variant === "transparent") {
    if (parsed.isThemeColor) {
      if (parsed.shade === void 0) return {
        background: "transparent",
        hover: "transparent",
        color: `var(--mantine-color-${color}-light-color)`,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
      };
      return {
        background: "transparent",
        hover: "transparent",
        color: `var(--mantine-color-${parsed.color}-${Math.min(parsed.shade, 6)})`,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
      };
    }
    return {
      background: "transparent",
      hover: "transparent",
      color,
      border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
    };
  }
  if (variant === "white") {
    if (parsed.isThemeColor) {
      if (parsed.shade === void 0) return {
        background: "var(--mantine-color-white)",
        hover: (0,_darken_darken_mjs__WEBPACK_IMPORTED_MODULE_2__.darken)(theme.white, 0.01),
        color: `var(--mantine-color-${color}-filled)`,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
      };
      return {
        background: "var(--mantine-color-white)",
        hover: (0,_darken_darken_mjs__WEBPACK_IMPORTED_MODULE_2__.darken)(theme.white, 0.01),
        color: `var(--mantine-color-${parsed.color}-${parsed.shade})`,
        border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
      };
    }
    return {
      background: "var(--mantine-color-white)",
      hover: (0,_darken_darken_mjs__WEBPACK_IMPORTED_MODULE_2__.darken)(theme.white, 0.01),
      color,
      border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid transparent`
    };
  }
  if (variant === "gradient") return {
    background: (0,_get_gradient_get_gradient_mjs__WEBPACK_IMPORTED_MODULE_3__.getGradient)(gradient, theme),
    hover: (0,_get_gradient_get_gradient_mjs__WEBPACK_IMPORTED_MODULE_3__.getGradient)(gradient, theme),
    color: "var(--mantine-color-white)",
    border: "none"
  };
  if (variant === "default") return {
    background: "var(--mantine-color-default)",
    hover: "var(--mantine-color-default-hover)",
    color: "var(--mantine-color-default-color)",
    border: `${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} solid var(--mantine-color-default-border)`
  };
  return {};
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-auto-contrast-value/get-auto-contrast-value.mjs"
/*!*************************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-auto-contrast-value/get-auto-contrast-value.mjs ***!
  \*************************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getAutoContrastValue: () => (/* binding */ getAutoContrastValue)
/* harmony export */ });
"use client";
function getAutoContrastValue(autoContrast, theme) {
  return typeof autoContrast === "boolean" ? autoContrast : theme.autoContrast;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-contrast-color/get-contrast-color.mjs"
/*!***************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-contrast-color/get-contrast-color.mjs ***!
  \***************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getContrastColor: () => (/* binding */ getContrastColor),
/* harmony export */   getPrimaryContrastColor: () => (/* binding */ getPrimaryContrastColor)
/* harmony export */ });
/* harmony import */ var _get_primary_shade_get_primary_shade_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../get-primary-shade/get-primary-shade.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-primary-shade/get-primary-shade.mjs");
/* harmony import */ var _parse_theme_color_parse_theme_color_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../parse-theme-color/parse-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/parse-theme-color/parse-theme-color.mjs");
"use client";


function getContrastColor({ color, theme, autoContrast }) {
  if (!(typeof autoContrast === "boolean" ? autoContrast : theme.autoContrast)) return "var(--mantine-color-white)";
  return (0,_parse_theme_color_parse_theme_color_mjs__WEBPACK_IMPORTED_MODULE_1__.parseThemeColor)({
    color: color || theme.primaryColor,
    theme
  }).isLight ? "var(--mantine-color-black)" : "var(--mantine-color-white)";
}
function getPrimaryContrastColor(theme, colorScheme) {
  return getContrastColor({
    color: theme.colors[theme.primaryColor][(0,_get_primary_shade_get_primary_shade_mjs__WEBPACK_IMPORTED_MODULE_0__.getPrimaryShade)(theme, colorScheme)],
    theme,
    autoContrast: null
  });
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-gradient/get-gradient.mjs"
/*!***************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-gradient/get-gradient.mjs ***!
  \***************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getGradient: () => (/* binding */ getGradient)
/* harmony export */ });
/* harmony import */ var _get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../get-theme-color/get-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs");
"use client";

function getGradient(gradient, theme) {
  var _a, _b;
  const merged = {
    from: (gradient == null ? void 0 : gradient.from) || theme.defaultGradient.from,
    to: (gradient == null ? void 0 : gradient.to) || theme.defaultGradient.to,
    deg: (_b = (_a = gradient == null ? void 0 : gradient.deg) != null ? _a : theme.defaultGradient.deg) != null ? _b : 0
  };
  const fromColor = (0,_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_0__.getThemeColor)(merged.from, theme);
  const toColor = (0,_get_theme_color_get_theme_color_mjs__WEBPACK_IMPORTED_MODULE_0__.getThemeColor)(merged.to, theme);
  return `linear-gradient(${merged.deg}deg, ${fromColor} 0%, ${toColor} 100%)`;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-primary-shade/get-primary-shade.mjs"
/*!*************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-primary-shade/get-primary-shade.mjs ***!
  \*************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getPrimaryShade: () => (/* binding */ getPrimaryShade)
/* harmony export */ });
"use client";
function getPrimaryShade(theme, colorScheme) {
  if (typeof theme.primaryShade === "number") return theme.primaryShade;
  if (colorScheme === "dark") return theme.primaryShade.dark;
  return theme.primaryShade.light;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs"
/*!*********************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-theme-color/get-theme-color.mjs ***!
  \*********************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getThemeColor: () => (/* binding */ getThemeColor)
/* harmony export */ });
/* harmony import */ var _parse_theme_color_parse_theme_color_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../parse-theme-color/parse-theme-color.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/parse-theme-color/parse-theme-color.mjs");
"use client";

function getThemeColor(color, theme) {
  const parsed = (0,_parse_theme_color_parse_theme_color_mjs__WEBPACK_IMPORTED_MODULE_0__.parseThemeColor)({
    color: color || theme.primaryColor,
    theme
  });
  return parsed.variable ? `var(${parsed.variable})` : color;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/luminance/luminance.mjs"
/*!*********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/luminance/luminance.mjs ***!
  \*********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isLightColor: () => (/* binding */ isLightColor)
/* harmony export */ });
/* unused harmony export luminance */
/* harmony import */ var _to_rgba_to_rgba_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../to-rgba/to-rgba.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/to-rgba/to-rgba.mjs");

function gammaCorrect(c) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function getLightnessFromOklch(oklchColor) {
  const match = oklchColor.match(/oklch\((.*?)%\s/);
  return match ? parseFloat(match[1]) : null;
}
function luminance(color) {
  if (color.startsWith("oklch(")) return (getLightnessFromOklch(color) || 0) / 100;
  const { r, g, b } = (0,_to_rgba_to_rgba_mjs__WEBPACK_IMPORTED_MODULE_0__.toRgba)(color);
  const sR = r / 255;
  const sG = g / 255;
  const sB = b / 255;
  const rLinear = gammaCorrect(sR);
  const gLinear = gammaCorrect(sG);
  const bLinear = gammaCorrect(sB);
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}
function isLightColor(color, luminanceThreshold = 0.179) {
  if (color.startsWith("var(")) return false;
  return luminance(color) > luminanceThreshold;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/parse-theme-color/parse-theme-color.mjs"
/*!*************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/parse-theme-color/parse-theme-color.mjs ***!
  \*************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   parseThemeColor: () => (/* binding */ parseThemeColor)
/* harmony export */ });
/* harmony import */ var _get_primary_shade_get_primary_shade_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../get-primary-shade/get-primary-shade.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/get-primary-shade/get-primary-shade.mjs");
/* harmony import */ var _luminance_luminance_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../luminance/luminance.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/luminance/luminance.mjs");
"use client";


function parseThemeColor({ color, theme, colorScheme }) {
  if (typeof color !== "string") throw new Error(`[@mantine/core] Failed to parse color. Expected color to be a string, instead got ${typeof color}`);
  if (color === "bright") return {
    color,
    value: colorScheme === "dark" ? theme.white : theme.black,
    shade: void 0,
    isThemeColor: false,
    isLight: (0,_luminance_luminance_mjs__WEBPACK_IMPORTED_MODULE_1__.isLightColor)(colorScheme === "dark" ? theme.white : theme.black, theme.luminanceThreshold),
    variable: "--mantine-color-bright"
  };
  if (color === "dimmed") return {
    color,
    value: colorScheme === "dark" ? theme.colors.dark[2] : theme.colors.gray[7],
    shade: void 0,
    isThemeColor: false,
    isLight: (0,_luminance_luminance_mjs__WEBPACK_IMPORTED_MODULE_1__.isLightColor)(colorScheme === "dark" ? theme.colors.dark[2] : theme.colors.gray[6], theme.luminanceThreshold),
    variable: "--mantine-color-dimmed"
  };
  if (color === "white" || color === "black") return {
    color,
    value: color === "white" ? theme.white : theme.black,
    shade: void 0,
    isThemeColor: false,
    isLight: (0,_luminance_luminance_mjs__WEBPACK_IMPORTED_MODULE_1__.isLightColor)(color === "white" ? theme.white : theme.black, theme.luminanceThreshold),
    variable: `--mantine-color-${color}`
  };
  const [_color, shade] = color.split(".");
  const colorShade = shade ? Number(shade) : void 0;
  const isThemeColor = _color in theme.colors;
  if (isThemeColor) {
    const colorValue = colorShade !== void 0 ? theme.colors[_color][colorShade] : theme.colors[_color][(0,_get_primary_shade_get_primary_shade_mjs__WEBPACK_IMPORTED_MODULE_0__.getPrimaryShade)(theme, colorScheme || "light")];
    return {
      color: _color,
      value: colorValue,
      shade: colorShade,
      isThemeColor,
      isLight: (0,_luminance_luminance_mjs__WEBPACK_IMPORTED_MODULE_1__.isLightColor)(colorValue, theme.luminanceThreshold),
      variable: shade ? `--mantine-color-${_color}-${colorShade}` : `--mantine-color-${_color}-filled`
    };
  }
  return {
    color,
    value: color,
    isThemeColor,
    isLight: (0,_luminance_luminance_mjs__WEBPACK_IMPORTED_MODULE_1__.isLightColor)(color, theme.luminanceThreshold),
    shade: colorShade,
    variable: void 0
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/rgba/rgba.mjs"
/*!***********************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/rgba/rgba.mjs ***!
  \***********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   alpha: () => (/* binding */ alpha),
/* harmony export */   rgba: () => (/* binding */ rgba)
/* harmony export */ });
/* harmony import */ var _to_rgba_to_rgba_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../to-rgba/to-rgba.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/to-rgba/to-rgba.mjs");

function rgba(color, alpha2) {
  if (typeof color !== "string" || alpha2 > 1 || alpha2 < 0) return "rgba(0, 0, 0, 1)";
  if (color.startsWith("var(")) return `color-mix(in srgb, ${color}, transparent ${(1 - alpha2) * 100}%)`;
  if (color.startsWith("oklch")) {
    if (color.includes("/")) return color.replace(/\/\s*[\d.]+\s*\)/, `/ ${alpha2})`);
    return color.replace(")", ` / ${alpha2})`);
  }
  const { r, g, b } = (0,_to_rgba_to_rgba_mjs__WEBPACK_IMPORTED_MODULE_0__.toRgba)(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha2})`;
}
const alpha = rgba;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/to-rgba/to-rgba.mjs"
/*!*****************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/to-rgba/to-rgba.mjs ***!
  \*****************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   toRgba: () => (/* binding */ toRgba)
/* harmony export */ });
function isHexColor(hex) {
  return /^#?([0-9A-F]{3}){1,2}([0-9A-F]{2})?$/i.test(hex);
}
function hexToRgba(color) {
  let hexString = color.replace("#", "");
  if (hexString.length === 3) {
    const shorthandHex = hexString.split("");
    hexString = [
      shorthandHex[0],
      shorthandHex[0],
      shorthandHex[1],
      shorthandHex[1],
      shorthandHex[2],
      shorthandHex[2]
    ].join("");
  }
  if (hexString.length === 8) {
    const alpha = parseInt(hexString.slice(6, 8), 16) / 255;
    return {
      r: parseInt(hexString.slice(0, 2), 16),
      g: parseInt(hexString.slice(2, 4), 16),
      b: parseInt(hexString.slice(4, 6), 16),
      a: alpha
    };
  }
  const parsed = parseInt(hexString, 16);
  return {
    r: parsed >> 16 & 255,
    g: parsed >> 8 & 255,
    b: parsed & 255,
    a: 1
  };
}
function rgbStringToRgba(color) {
  const [r, g, b, a] = color.replace(/[^0-9,./]/g, "").split(/[/,]/).map(Number);
  return {
    r,
    g,
    b,
    a: a === void 0 ? 1 : a
  };
}
function hslStringToRgba(hslaString) {
  const matches = hslaString.match(/^hsla?\(\s*(\d+)\s*,\s*(\d+%)\s*,\s*(\d+%)\s*(,\s*(0?\.\d+|\d+(\.\d+)?))?\s*\)$/i);
  if (!matches) return {
    r: 0,
    g: 0,
    b: 0,
    a: 1
  };
  const h = parseInt(matches[1], 10);
  const s = parseInt(matches[2], 10) / 100;
  const l = parseInt(matches[3], 10) / 100;
  const a = matches[5] ? parseFloat(matches[5]) : void 0;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const huePrime = h / 60;
  const x = chroma * (1 - Math.abs(huePrime % 2 - 1));
  const m = l - chroma / 2;
  let r;
  let g;
  let b;
  if (huePrime >= 0 && huePrime < 1) {
    r = chroma;
    g = x;
    b = 0;
  } else if (huePrime >= 1 && huePrime < 2) {
    r = x;
    g = chroma;
    b = 0;
  } else if (huePrime >= 2 && huePrime < 3) {
    r = 0;
    g = chroma;
    b = x;
  } else if (huePrime >= 3 && huePrime < 4) {
    r = 0;
    g = x;
    b = chroma;
  } else if (huePrime >= 4 && huePrime < 5) {
    r = x;
    g = 0;
    b = chroma;
  } else {
    r = chroma;
    g = 0;
    b = x;
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a: a || 1
  };
}
function toRgba(color) {
  if (isHexColor(color)) return hexToRgba(color);
  if (color.startsWith("rgb")) return rgbStringToRgba(color);
  if (color.startsWith("hsl")) return hslStringToRgba(color);
  return {
    r: 0,
    g: 0,
    b: 0,
    a: 1
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-scheme-managers/is-mantine-color-scheme.mjs"
/*!*******************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-scheme-managers/is-mantine-color-scheme.mjs ***!
  \*******************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isMantineColorScheme: () => (/* binding */ isMantineColorScheme)
/* harmony export */ });
"use client";
function isMantineColorScheme(value) {
  return value === "auto" || value === "dark" || value === "light";
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-scheme-managers/local-storage-manager.mjs"
/*!*****************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/color-scheme-managers/local-storage-manager.mjs ***!
  \*****************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   localStorageColorSchemeManager: () => (/* binding */ localStorageColorSchemeManager)
/* harmony export */ });
/* harmony import */ var _is_mantine_color_scheme_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./is-mantine-color-scheme.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-scheme-managers/is-mantine-color-scheme.mjs");
"use client";

function localStorageColorSchemeManager({ key = "mantine-color-scheme-value" } = {}) {
  let handleStorageEvent;
  return {
    get: (defaultValue) => {
      if (typeof window === "undefined") return defaultValue;
      try {
        const storedColorScheme = window.localStorage.getItem(key);
        return (0,_is_mantine_color_scheme_mjs__WEBPACK_IMPORTED_MODULE_0__.isMantineColorScheme)(storedColorScheme) ? storedColorScheme : defaultValue;
      } catch {
        return defaultValue;
      }
    },
    set: (value) => {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        console.warn("[@mantine/core] Local storage color scheme manager was unable to save color scheme.", error);
      }
    },
    subscribe: (onUpdate) => {
      handleStorageEvent = (event) => {
        if (event.storageArea === window.localStorage && event.key === key) (0,_is_mantine_color_scheme_mjs__WEBPACK_IMPORTED_MODULE_0__.isMantineColorScheme)(event.newValue) && onUpdate(event.newValue);
      };
      window.addEventListener("storage", handleStorageEvent);
    },
    unsubscribe: () => {
      window.removeEventListener("storage", handleStorageEvent);
    },
    clear: () => {
      window.localStorage.removeItem(key);
    }
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/convert-css-variables/convert-css-variables.mjs"
/*!*****************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/convert-css-variables/convert-css-variables.mjs ***!
  \*****************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   convertCssVariables: () => (/* binding */ convertCssVariables)
/* harmony export */ });
/* harmony import */ var _css_variables_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./css-variables-object-to-string.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/convert-css-variables/css-variables-object-to-string.mjs");
"use client";

function convertCssVariables(input, selectorOverride) {
  const selectors = selectorOverride ? [selectorOverride] : [":root", ":host"];
  const sharedVariables = (0,_css_variables_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__.cssVariablesObjectToString)(input.variables);
  const shared = sharedVariables ? `${selectors.join(", ")}{${sharedVariables}}` : "";
  const dark = (0,_css_variables_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__.cssVariablesObjectToString)(input.dark);
  const light = (0,_css_variables_object_to_string_mjs__WEBPACK_IMPORTED_MODULE_0__.cssVariablesObjectToString)(input.light);
  const selectorsWithScheme = (scheme) => selectors.map((selector) => selector === ":host" ? `${selector}([data-mantine-color-scheme="${scheme}"])` : `${selector}[data-mantine-color-scheme="${scheme}"]`).join(", ");
  return `${shared}

${dark ? `${selectorsWithScheme("dark")}{${dark}}` : ""}

${light ? `${selectorsWithScheme("light")}{${light}}` : ""}`;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/convert-css-variables/css-variables-object-to-string.mjs"
/*!**************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/convert-css-variables/css-variables-object-to-string.mjs ***!
  \**************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   cssVariablesObjectToString: () => (/* binding */ cssVariablesObjectToString)
/* harmony export */ });
"use client";
function cssVariablesObjectToString(variables) {
  return Object.entries(variables).map(([name, value]) => `${name}: ${value};`).join("");
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/create-theme/create-theme.mjs"
/*!***********************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/create-theme/create-theme.mjs ***!
  \***********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createTheme: () => (/* binding */ createTheme)
/* harmony export */ });
function createTheme(theme) {
  return theme;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/default-colors.mjs"
/*!************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/default-colors.mjs ***!
  \************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   DEFAULT_COLORS: () => (/* binding */ DEFAULT_COLORS)
/* harmony export */ });
const DEFAULT_COLORS = {
  dark: [
    "#C9C9C9",
    "#b8b8b8",
    "#828282",
    "#696969",
    "#424242",
    "#3b3b3b",
    "#2e2e2e",
    "#242424",
    "#1f1f1f",
    "#141414"
  ],
  gray: [
    "#f8f9fa",
    "#f1f3f5",
    "#e9ecef",
    "#dee2e6",
    "#ced4da",
    "#adb5bd",
    "#868e96",
    "#495057",
    "#343a40",
    "#212529"
  ],
  red: [
    "#fff5f5",
    "#ffe3e3",
    "#ffc9c9",
    "#ffa8a8",
    "#ff8787",
    "#ff6b6b",
    "#fa5252",
    "#f03e3e",
    "#e03131",
    "#c92a2a"
  ],
  pink: [
    "#fff0f6",
    "#ffdeeb",
    "#fcc2d7",
    "#faa2c1",
    "#f783ac",
    "#f06595",
    "#e64980",
    "#d6336c",
    "#c2255c",
    "#a61e4d"
  ],
  grape: [
    "#f8f0fc",
    "#f3d9fa",
    "#eebefa",
    "#e599f7",
    "#da77f2",
    "#cc5de8",
    "#be4bdb",
    "#ae3ec9",
    "#9c36b5",
    "#862e9c"
  ],
  violet: [
    "#f3f0ff",
    "#e5dbff",
    "#d0bfff",
    "#b197fc",
    "#9775fa",
    "#845ef7",
    "#7950f2",
    "#7048e8",
    "#6741d9",
    "#5f3dc4"
  ],
  indigo: [
    "#edf2ff",
    "#dbe4ff",
    "#bac8ff",
    "#91a7ff",
    "#748ffc",
    "#5c7cfa",
    "#4c6ef5",
    "#4263eb",
    "#3b5bdb",
    "#364fc7"
  ],
  blue: [
    "#e7f5ff",
    "#d0ebff",
    "#a5d8ff",
    "#74c0fc",
    "#4dabf7",
    "#339af0",
    "#228be6",
    "#1c7ed6",
    "#1971c2",
    "#1864ab"
  ],
  cyan: [
    "#e3fafc",
    "#c5f6fa",
    "#99e9f2",
    "#66d9e8",
    "#3bc9db",
    "#22b8cf",
    "#15aabf",
    "#1098ad",
    "#0c8599",
    "#0b7285"
  ],
  teal: [
    "#e6fcf5",
    "#c3fae8",
    "#96f2d7",
    "#63e6be",
    "#38d9a9",
    "#20c997",
    "#12b886",
    "#0ca678",
    "#099268",
    "#087f5b"
  ],
  green: [
    "#ebfbee",
    "#d3f9d8",
    "#b2f2bb",
    "#8ce99a",
    "#69db7c",
    "#51cf66",
    "#40c057",
    "#37b24d",
    "#2f9e44",
    "#2b8a3e"
  ],
  lime: [
    "#f4fce3",
    "#e9fac8",
    "#d8f5a2",
    "#c0eb75",
    "#a9e34b",
    "#94d82d",
    "#82c91e",
    "#74b816",
    "#66a80f",
    "#5c940d"
  ],
  yellow: [
    "#fff9db",
    "#fff3bf",
    "#ffec99",
    "#ffe066",
    "#ffd43b",
    "#fcc419",
    "#fab005",
    "#f59f00",
    "#f08c00",
    "#e67700"
  ],
  orange: [
    "#fff4e6",
    "#ffe8cc",
    "#ffd8a8",
    "#ffc078",
    "#ffa94d",
    "#ff922b",
    "#fd7e14",
    "#f76707",
    "#e8590c",
    "#d9480f"
  ]
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/default-theme.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/default-theme.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   DEFAULT_THEME: () => (/* binding */ DEFAULT_THEME)
/* harmony export */ });
/* harmony import */ var _utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _color_functions_default_variant_colors_resolver_default_variant_colors_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./color-functions/default-variant-colors-resolver/default-variant-colors-resolver.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/color-functions/default-variant-colors-resolver/default-variant-colors-resolver.mjs");
/* harmony import */ var _default_colors_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./default-colors.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/default-colors.mjs");



const DEFAULT_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji";
const DEFAULT_THEME = {
  scale: 1,
  fontSmoothing: true,
  focusRing: "auto",
  white: "#fff",
  black: "#000",
  colors: _default_colors_mjs__WEBPACK_IMPORTED_MODULE_2__.DEFAULT_COLORS,
  primaryShade: {
    light: 6,
    dark: 8
  },
  primaryColor: "blue",
  variantColorResolver: _color_functions_default_variant_colors_resolver_default_variant_colors_resolver_mjs__WEBPACK_IMPORTED_MODULE_1__.defaultVariantColorsResolver,
  autoContrast: false,
  luminanceThreshold: 0.3,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
  respectReducedMotion: false,
  cursorType: "default",
  defaultGradient: {
    from: "blue",
    to: "cyan",
    deg: 45
  },
  defaultRadius: "md",
  activeClassName: "mantine-active",
  focusClassName: "",
  headings: {
    fontFamily: DEFAULT_FONT_FAMILY,
    fontWeight: "700",
    textWrap: "wrap",
    sizes: {
      h1: {
        fontSize: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(34),
        lineHeight: "1.3"
      },
      h2: {
        fontSize: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(26),
        lineHeight: "1.35"
      },
      h3: {
        fontSize: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(22),
        lineHeight: "1.4"
      },
      h4: {
        fontSize: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(18),
        lineHeight: "1.45"
      },
      h5: {
        fontSize: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(16),
        lineHeight: "1.5"
      },
      h6: {
        fontSize: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(14),
        lineHeight: "1.5"
      }
    }
  },
  fontSizes: {
    xs: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(12),
    sm: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(14),
    md: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(16),
    lg: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(18),
    xl: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(20)
  },
  lineHeights: {
    xs: "1.4",
    sm: "1.45",
    md: "1.55",
    lg: "1.6",
    xl: "1.65"
  },
  fontWeights: {
    regular: "400",
    medium: "600",
    bold: "700"
  },
  radius: {
    xs: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(2),
    sm: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(4),
    md: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(8),
    lg: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(16),
    xl: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(32)
  },
  spacing: {
    xs: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(10),
    sm: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(12),
    md: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(16),
    lg: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(20),
    xl: (0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(32)
  },
  breakpoints: {
    xs: "36em",
    sm: "48em",
    md: "62em",
    lg: "75em",
    xl: "88em"
  },
  shadows: {
    xs: `0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(3)} rgba(0, 0, 0, 0.05), 0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(2)} rgba(0, 0, 0, 0.1)`,
    sm: `0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(3)} rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.05) 0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(10)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(15)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(-5)}, rgba(0, 0, 0, 0.04) 0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(7)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(7)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(-5)}`,
    md: `0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(3)} rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.05) 0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(20)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(25)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(-5)}, rgba(0, 0, 0, 0.04) 0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(10)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(10)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(-5)}`,
    lg: `0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(3)} rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.05) 0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(28)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(23)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(-7)}, rgba(0, 0, 0, 0.04) 0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(12)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(12)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(-7)}`,
    xl: `0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(1)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(3)} rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.05) 0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(36)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(28)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(-7)}, rgba(0, 0, 0, 0.04) 0 ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(17)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(17)} ${(0,_utils_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(-7)}`
  },
  other: {},
  components: {}
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/merge-mantine-theme/merge-mantine-theme.mjs"
/*!*************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/merge-mantine-theme/merge-mantine-theme.mjs ***!
  \*************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   mergeMantineTheme: () => (/* binding */ mergeMantineTheme)
/* harmony export */ });
/* unused harmony export validateMantineTheme */
/* harmony import */ var _utils_deep_merge_deep_merge_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../utils/deep-merge/deep-merge.mjs */ "../../node_modules/@mantine/core/esm/core/utils/deep-merge/deep-merge.mjs");

const INVALID_PRIMARY_COLOR_ERROR = "[@mantine/core] MantineProvider: Invalid theme.primaryColor, it accepts only key of theme.colors, learn more \u2013 https://mantine.dev/theming/colors/#primary-color";
const INVALID_PRIMARY_SHADE_ERROR = "[@mantine/core] MantineProvider: Invalid theme.primaryShade, it accepts only 0-9 integers or an object { light: 0-9, dark: 0-9 }";
function isValidPrimaryShade(shade) {
  if (shade < 0 || shade > 9) return false;
  return parseInt(shade.toString(), 10) === shade;
}
function validateMantineTheme(theme) {
  if (!(theme.primaryColor in theme.colors)) throw new Error(INVALID_PRIMARY_COLOR_ERROR);
  if (typeof theme.primaryShade === "object") {
    if (!isValidPrimaryShade(theme.primaryShade.dark) || !isValidPrimaryShade(theme.primaryShade.light)) throw new Error(INVALID_PRIMARY_SHADE_ERROR);
  }
  if (typeof theme.primaryShade === "number" && !isValidPrimaryShade(theme.primaryShade)) throw new Error(INVALID_PRIMARY_SHADE_ERROR);
}
function mergeMantineTheme(currentTheme, themeOverride) {
  var _a;
  if (!themeOverride) {
    validateMantineTheme(currentTheme);
    return currentTheme;
  }
  const result = (0,_utils_deep_merge_deep_merge_mjs__WEBPACK_IMPORTED_MODULE_0__.deepMerge)(currentTheme, themeOverride);
  if (themeOverride.fontFamily && !((_a = themeOverride.headings) == null ? void 0 : _a.fontFamily)) result.headings.fontFamily = themeOverride.fontFamily;
  validateMantineTheme(result);
  return result;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-mantine-color-scheme/use-provider-color-scheme.mjs"
/*!************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/use-mantine-color-scheme/use-provider-color-scheme.mjs ***!
  \************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useProviderColorScheme: () => (/* binding */ useProviderColorScheme)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs");
"use client";


function setColorSchemeAttribute(colorScheme, getRootElement) {
  var _a, _b;
  const hasDarkColorScheme = typeof window !== "undefined" && "matchMedia" in window && ((_a = window.matchMedia("(prefers-color-scheme: dark)")) == null ? void 0 : _a.matches);
  const computedColorScheme = colorScheme !== "auto" ? colorScheme : hasDarkColorScheme ? "dark" : "light";
  (_b = getRootElement()) == null ? void 0 : _b.setAttribute("data-mantine-color-scheme", computedColorScheme);
}
function useProviderColorScheme({ manager, defaultColorScheme, getRootElement, forceColorScheme }) {
  const media = (0,react__WEBPACK_IMPORTED_MODULE_0__.useRef)(null);
  const [value, setValue] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(() => manager.get(defaultColorScheme));
  const colorSchemeValue = forceColorScheme || value;
  const setColorScheme = (0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)((colorScheme) => {
    if (!forceColorScheme) {
      setColorSchemeAttribute(colorScheme, getRootElement);
      setValue(colorScheme);
      manager.set(colorScheme);
    }
  }, [
    manager.set,
    colorSchemeValue,
    forceColorScheme
  ]);
  const clearColorScheme = (0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)(() => {
    setValue(defaultColorScheme);
    setColorSchemeAttribute(defaultColorScheme, getRootElement);
    manager.clear();
  }, [manager.clear, defaultColorScheme]);
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
    manager.subscribe(setColorScheme);
    return manager.unsubscribe;
  }, [manager.subscribe, manager.unsubscribe]);
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_1__.useIsomorphicEffect)(() => {
    setColorSchemeAttribute(manager.get(defaultColorScheme), getRootElement);
  }, []);
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
    var _a;
    if (forceColorScheme) {
      setColorSchemeAttribute(forceColorScheme, getRootElement);
      return () => {
      };
    }
    if (forceColorScheme === void 0) setColorSchemeAttribute(value, getRootElement);
    if (typeof window !== "undefined" && "matchMedia" in window) media.current = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event) => {
      if (value === "auto") setColorSchemeAttribute(event.matches ? "dark" : "light", getRootElement);
    };
    (_a = media.current) == null ? void 0 : _a.addEventListener("change", listener);
    return () => {
      var _a2;
      return (_a2 = media.current) == null ? void 0 : _a2.removeEventListener("change", listener);
    };
  }, [value, forceColorScheme]);
  return {
    colorScheme: colorSchemeValue,
    setColorScheme,
    clearColorScheme
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs"
/*!*****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs ***!
  \*****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useProps: () => (/* binding */ useProps)
/* harmony export */ });
/* harmony import */ var _utils_filter_props_filter_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../utils/filter-props/filter-props.mjs */ "../../node_modules/@mantine/core/esm/core/utils/filter-props/filter-props.mjs");
/* harmony import */ var _MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
"use client";


function useProps(component, defaultProps, props) {
  var _a;
  const theme = (0,_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_1__.useMantineTheme)();
  const contextPropsPayload = (_a = theme.components[component]) == null ? void 0 : _a.defaultProps;
  const contextProps = typeof contextPropsPayload === "function" ? contextPropsPayload(theme) : contextPropsPayload;
  return {
    ...defaultProps,
    ...contextProps,
    ...(0,_utils_filter_props_filter_props_mjs__WEBPACK_IMPORTED_MODULE_0__.filterProps)(props)
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-respect-reduce-motion/use-respect-reduce-motion.mjs"
/*!*************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/MantineProvider/use-respect-reduce-motion/use-respect-reduce-motion.mjs ***!
  \*************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useRespectReduceMotion: () => (/* binding */ useRespectReduceMotion)
/* harmony export */ });
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs");
"use client";

function useRespectReduceMotion({ respectReducedMotion, getRootElement }) {
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_0__.useIsomorphicEffect)(() => {
    var _a;
    if (respectReducedMotion) (_a = getRootElement()) == null ? void 0 : _a.setAttribute("data-respect-reduced-motion", "true");
  }, [respectReducedMotion]);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/factory/create-polymorphic-component.mjs"
/*!******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/factory/create-polymorphic-component.mjs ***!
  \******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   polymorphic: () => (/* binding */ polymorphic)
/* harmony export */ });
/* unused harmony export createPolymorphicComponent */
function createPolymorphicComponent(component) {
  return component;
}
const polymorphic = createPolymorphicComponent;



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/factory/factory.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   factory: () => (/* binding */ factory),
/* harmony export */   genericFactory: () => (/* binding */ genericFactory),
/* harmony export */   identity: () => (/* binding */ identity)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";

function identity(value) {
  return value;
}
function factory(ui) {
  const Component = ui;
  Component.extend = identity;
  Component.withProps = (fixedProps) => {
    const Extended = (props) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Component, {
      ...fixedProps,
      ...props
    });
    Extended.extend = Component.extend;
    Extended.displayName = `WithProps(${Component.displayName})`;
    return Extended;
  };
  return Component;
}
function genericFactory(ui) {
  return factory(ui);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs"
/*!*********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/factory/polymorphic-factory.mjs ***!
  \*********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   polymorphicFactory: () => (/* binding */ polymorphicFactory)
/* harmony export */ });
/* harmony import */ var _factory_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./factory.mjs */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";


function polymorphicFactory(ui) {
  const Component = ui;
  Component.withProps = (fixedProps) => {
    const Extended = (props) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_1__.jsx)(Component, {
      ...fixedProps,
      ...props
    });
    Extended.extend = Component.extend;
    Extended.displayName = `WithProps(${Component.displayName})`;
    return Extended;
  };
  Component.extend = _factory_mjs__WEBPACK_IMPORTED_MODULE_0__.identity;
  return Component;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs"
/*!**********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs ***!
  \**********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createVarsResolver: () => (/* binding */ createVarsResolver)
/* harmony export */ });
"use client";
function createVarsResolver(resolver) {
  return resolver;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-resolved-styles-api/use-resolved-styles-api.mjs"
/*!****************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-resolved-styles-api/use-resolved-styles-api.mjs ***!
  \****************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useResolvedStylesApi: () => (/* binding */ useResolvedStylesApi)
/* harmony export */ });
/* harmony import */ var _use_styles_get_class_name_resolve_class_names_resolve_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../use-styles/get-class-name/resolve-class-names/resolve-class-names.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/resolve-class-names/resolve-class-names.mjs");
/* harmony import */ var _use_styles_get_style_resolve_styles_resolve_styles_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../use-styles/get-style/resolve-styles/resolve-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-styles/resolve-styles.mjs");
/* harmony import */ var _MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
"use client";



function useResolvedStylesApi({ classNames, styles, props, stylesCtx }) {
  const theme = (0,_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_2__.useMantineTheme)();
  return {
    resolvedClassNames: classNames === void 0 ? void 0 : (0,_use_styles_get_class_name_resolve_class_names_resolve_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__.resolveClassNames)({
      theme,
      classNames,
      props,
      stylesCtx: stylesCtx || void 0
    }),
    resolvedStyles: styles === void 0 ? void 0 : (0,_use_styles_get_style_resolve_styles_resolve_styles_mjs__WEBPACK_IMPORTED_MODULE_1__.resolveStyles)({
      theme,
      styles,
      props,
      stylesCtx: stylesCtx || void 0
    })
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-class-name.mjs"
/*!*********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-class-name.mjs ***!
  \*********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getClassName: () => (/* binding */ getClassName)
/* harmony export */ });
/* harmony import */ var _get_global_class_names_get_global_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./get-global-class-names/get-global-class-names.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-global-class-names/get-global-class-names.mjs");
/* harmony import */ var _get_options_class_names_get_options_class_names_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./get-options-class-names/get-options-class-names.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-options-class-names/get-options-class-names.mjs");
/* harmony import */ var _get_resolved_class_names_get_resolved_class_names_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./get-resolved-class-names/get-resolved-class-names.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-resolved-class-names/get-resolved-class-names.mjs");
/* harmony import */ var _get_root_class_name_get_root_class_name_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./get-root-class-name/get-root-class-name.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-root-class-name/get-root-class-name.mjs");
/* harmony import */ var _get_selector_class_name_get_selector_class_name_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./get-selector-class-name/get-selector-class-name.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-selector-class-name/get-selector-class-name.mjs");
/* harmony import */ var _get_static_class_names_get_static_class_names_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./get-static-class-names/get-static-class-names.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-static-class-names/get-static-class-names.mjs");
/* harmony import */ var _get_variant_class_name_get_variant_class_name_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./get-variant-class-name/get-variant-class-name.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-variant-class-name/get-variant-class-name.mjs");
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
"use client";








function getClassName({ theme, options, themeName, selector, classNamesPrefix, resolvedClassNames, resolvedThemeClassNames, classes, unstyled, className, rootSelector, props, stylesCtx, withStaticClasses, headless, transformedStyles }) {
  return (0,clsx__WEBPACK_IMPORTED_MODULE_7__["default"])((0,_get_global_class_names_get_global_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__.getGlobalClassNames)({
    theme,
    options,
    unstyled: unstyled || headless
  }), resolvedThemeClassNames.map((m) => m[selector]), (0,_get_variant_class_name_get_variant_class_name_mjs__WEBPACK_IMPORTED_MODULE_6__.getVariantClassName)({
    options,
    classes,
    selector,
    unstyled: unstyled || headless
  }), resolvedClassNames[selector], (0,_get_resolved_class_names_get_resolved_class_names_mjs__WEBPACK_IMPORTED_MODULE_2__.getResolvedClassNames)({
    selector,
    stylesCtx,
    theme,
    classNames: transformedStyles,
    props
  }), (0,_get_options_class_names_get_options_class_names_mjs__WEBPACK_IMPORTED_MODULE_1__.getOptionsClassNames)({
    selector,
    stylesCtx,
    options,
    props,
    theme
  }), (0,_get_root_class_name_get_root_class_name_mjs__WEBPACK_IMPORTED_MODULE_3__.getRootClassName)({
    rootSelector,
    selector,
    className
  }), (0,_get_selector_class_name_get_selector_class_name_mjs__WEBPACK_IMPORTED_MODULE_4__.getSelectorClassName)({
    selector,
    classes,
    unstyled: unstyled || headless
  }), withStaticClasses && !headless && (0,_get_static_class_names_get_static_class_names_mjs__WEBPACK_IMPORTED_MODULE_5__.getStaticClassNames)({
    themeName,
    classNamesPrefix,
    selector,
    withStaticClass: options == null ? void 0 : options.withStaticClass
  }), options == null ? void 0 : options.className);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-global-class-names/get-global-class-names.mjs"
/*!****************************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-global-class-names/get-global-class-names.mjs ***!
  \****************************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getGlobalClassNames: () => (/* binding */ getGlobalClassNames)
/* harmony export */ });
/* unused harmony export FOCUS_CLASS_NAMES */
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
"use client";

const FOCUS_CLASS_NAMES = {
  always: "mantine-focus-always",
  auto: "mantine-focus-auto",
  never: "mantine-focus-never"
};
function getGlobalClassNames({ theme, options, unstyled }) {
  return (0,clsx__WEBPACK_IMPORTED_MODULE_0__["default"])((options == null ? void 0 : options.focusable) && !unstyled && (theme.focusClassName || FOCUS_CLASS_NAMES[theme.focusRing]), (options == null ? void 0 : options.active) && !unstyled && theme.activeClassName);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-options-class-names/get-options-class-names.mjs"
/*!******************************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-options-class-names/get-options-class-names.mjs ***!
  \******************************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getOptionsClassNames: () => (/* binding */ getOptionsClassNames)
/* harmony export */ });
/* harmony import */ var _resolve_class_names_resolve_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../resolve-class-names/resolve-class-names.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/resolve-class-names/resolve-class-names.mjs");
"use client";

function getOptionsClassNames({ selector, stylesCtx, options, props, theme }) {
  return (0,_resolve_class_names_resolve_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__.resolveClassNames)({
    theme,
    classNames: options == null ? void 0 : options.classNames,
    props: (options == null ? void 0 : options.props) || props,
    stylesCtx
  })[selector];
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-resolved-class-names/get-resolved-class-names.mjs"
/*!********************************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-resolved-class-names/get-resolved-class-names.mjs ***!
  \********************************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getResolvedClassNames: () => (/* binding */ getResolvedClassNames)
/* harmony export */ });
/* harmony import */ var _resolve_class_names_resolve_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../resolve-class-names/resolve-class-names.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/resolve-class-names/resolve-class-names.mjs");
"use client";

function getResolvedClassNames({ selector, stylesCtx, theme, classNames, props }) {
  return (0,_resolve_class_names_resolve_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__.resolveClassNames)({
    theme,
    classNames,
    props,
    stylesCtx
  })[selector];
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-root-class-name/get-root-class-name.mjs"
/*!**********************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-root-class-name/get-root-class-name.mjs ***!
  \**********************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getRootClassName: () => (/* binding */ getRootClassName)
/* harmony export */ });
"use client";
function getRootClassName({ rootSelector, selector, className }) {
  return rootSelector === selector ? className : void 0;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-selector-class-name/get-selector-class-name.mjs"
/*!******************************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-selector-class-name/get-selector-class-name.mjs ***!
  \******************************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getSelectorClassName: () => (/* binding */ getSelectorClassName)
/* harmony export */ });
"use client";
function getSelectorClassName({ selector, classes, unstyled }) {
  return unstyled ? void 0 : classes[selector];
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-static-class-names/get-static-class-names.mjs"
/*!****************************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-static-class-names/get-static-class-names.mjs ***!
  \****************************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getStaticClassNames: () => (/* binding */ getStaticClassNames)
/* harmony export */ });
"use client";
function getStaticClassNames({ themeName, classNamesPrefix, selector, withStaticClass }) {
  if (withStaticClass === false) return [];
  return themeName.map((n) => `${classNamesPrefix}-${n}-${selector}`);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-variant-class-name/get-variant-class-name.mjs"
/*!****************************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-variant-class-name/get-variant-class-name.mjs ***!
  \****************************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getVariantClassName: () => (/* binding */ getVariantClassName)
/* harmony export */ });
"use client";
function getVariantClassName({ options, classes, selector, unstyled }) {
  return (options == null ? void 0 : options.variant) && !unstyled ? classes[`${selector}--${options.variant}`] : void 0;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/resolve-class-names/resolve-class-names.mjs"
/*!**********************************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/resolve-class-names/resolve-class-names.mjs ***!
  \**********************************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   resolveClassNames: () => (/* binding */ resolveClassNames)
/* harmony export */ });
/* harmony import */ var clsx__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! clsx */ "../../node_modules/clsx/dist/clsx.mjs");
"use client";

const EMPTY_CLASS_NAMES = {};
function mergeClassNames(objects) {
  const merged = {};
  objects.forEach((obj) => {
    Object.entries(obj).forEach(([key, value]) => {
      if (merged[key]) merged[key] = (0,clsx__WEBPACK_IMPORTED_MODULE_0__["default"])(merged[key], value);
      else merged[key] = value;
    });
  });
  return merged;
}
function resolveClassNames({ theme, classNames, props, stylesCtx }) {
  return mergeClassNames((Array.isArray(classNames) ? classNames : [classNames]).map((item) => typeof item === "function" ? item(theme, props, stylesCtx) : item || EMPTY_CLASS_NAMES));
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/get-style.mjs"
/*!***********************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/get-style.mjs ***!
  \***********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getStyle: () => (/* binding */ getStyle)
/* harmony export */ });
/* harmony import */ var _resolve_styles_resolve_styles_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./resolve-styles/resolve-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-styles/resolve-styles.mjs");
/* harmony import */ var _resolve_style_resolve_style_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./resolve-style/resolve-style.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-style/resolve-style.mjs");
"use client";


function getStyle({ theme, selector, options, props, stylesCtx, rootSelector, withStylesTransform, resolvedStyles, resolvedThemeStyles, resolvedVars, resolvedRootStyle }) {
  return {
    ...resolvedThemeStyles[selector],
    ...resolvedStyles[selector],
    ...!withStylesTransform && (0,_resolve_styles_resolve_styles_mjs__WEBPACK_IMPORTED_MODULE_0__.resolveStyles)({
      theme,
      styles: options == null ? void 0 : options.styles,
      props: (options == null ? void 0 : options.props) || props,
      stylesCtx
    })[selector],
    ...resolvedVars[selector],
    ...rootSelector === selector ? resolvedRootStyle : null,
    ...(0,_resolve_style_resolve_style_mjs__WEBPACK_IMPORTED_MODULE_1__.resolveStyle)({
      style: options == null ? void 0 : options.style,
      theme
    })
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-style/resolve-style.mjs"
/*!*****************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-style/resolve-style.mjs ***!
  \*****************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   resolveStyle: () => (/* binding */ resolveStyle)
/* harmony export */ });
"use client";
function resolveStyle({ style, theme }) {
  if (Array.isArray(style)) return style.reduce((acc, item) => ({
    ...acc,
    ...resolveStyle({
      style: item,
      theme
    })
  }), {});
  if (typeof style === "function") return style(theme);
  if (style == null) return {};
  return style;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-styles/resolve-styles.mjs"
/*!*******************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-styles/resolve-styles.mjs ***!
  \*******************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   resolveStyles: () => (/* binding */ resolveStyles)
/* harmony export */ });
"use client";
function resolveStyles({ theme, styles, props, stylesCtx }) {
  const arrayStyles = Array.isArray(styles) ? styles : [styles];
  const result = {};
  for (const style of arrayStyles) if (typeof style === "function") Object.assign(result, style(theme, props, stylesCtx));
  else if (style) Object.assign(result, style);
  return result;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-vars/merge-vars.mjs"
/*!*************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-vars/merge-vars.mjs ***!
  \*************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   mergeVars: () => (/* binding */ mergeVars)
/* harmony export */ });
/* harmony import */ var _utils_filter_props_filter_props_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../../utils/filter-props/filter-props.mjs */ "../../node_modules/@mantine/core/esm/core/utils/filter-props/filter-props.mjs");
"use client";

function mergeVars(vars) {
  return vars.reduce((acc, current) => {
    if (current) Object.keys(current).forEach((key) => {
      acc[key] = {
        ...acc[key],
        ...(0,_utils_filter_props_filter_props_mjs__WEBPACK_IMPORTED_MODULE_0__.filterProps)(current[key])
      };
    });
    return acc;
  }, {});
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs"
/*!**************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs ***!
  \**************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useStyles: () => (/* binding */ useStyles)
/* harmony export */ });
/* harmony import */ var _get_class_name_resolve_class_names_resolve_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./get-class-name/resolve-class-names/resolve-class-names.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/resolve-class-names/resolve-class-names.mjs");
/* harmony import */ var _get_style_resolve_styles_resolve_styles_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./get-style/resolve-styles/resolve-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-styles/resolve-styles.mjs");
/* harmony import */ var _MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../MantineProvider/Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
/* harmony import */ var _MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
/* harmony import */ var _get_class_name_get_class_name_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./get-class-name/get-class-name.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-class-name/get-class-name.mjs");
/* harmony import */ var _get_style_resolve_style_resolve_style_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./get-style/resolve-style/resolve-style.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-style/resolve-style.mjs");
/* harmony import */ var _get_style_get_style_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./get-style/get-style.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/get-style.mjs");
/* harmony import */ var _get_style_resolve_vars_merge_vars_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./get-style/resolve-vars/merge-vars.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/get-style/resolve-vars/merge-vars.mjs");
/* harmony import */ var _use_transformed_styles_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./use-transformed-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-transformed-styles.mjs");
"use client";









function useStyles({ name, classes, props, stylesCtx, className, style, rootSelector = "root", unstyled, classNames, styles, vars, varsResolver, attributes }) {
  var _a;
  const theme = (0,_MantineProvider_MantineThemeProvider_MantineThemeProvider_mjs__WEBPACK_IMPORTED_MODULE_3__.useMantineTheme)();
  const classNamesPrefix = (0,_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_2__.useMantineClassNamesPrefix)();
  const withStaticClasses = (0,_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_2__.useMantineWithStaticClasses)();
  const headless = (0,_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_2__.useMantineIsHeadless)();
  const themeName = (Array.isArray(name) ? name : [name]).filter((n) => n);
  const { withStylesTransform, getTransformedStyles } = (0,_use_transformed_styles_mjs__WEBPACK_IMPORTED_MODULE_8__.useStylesTransform)({
    props,
    stylesCtx,
    themeName,
    theme
  });
  const resolvedClassNames = (0,_get_class_name_resolve_class_names_resolve_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__.resolveClassNames)({
    theme,
    classNames,
    props,
    stylesCtx
  });
  const resolvedThemeClassNames = themeName.map((n) => {
    var _a2;
    return (0,_get_class_name_resolve_class_names_resolve_class_names_mjs__WEBPACK_IMPORTED_MODULE_0__.resolveClassNames)({
      theme,
      classNames: (_a2 = theme.components[n]) == null ? void 0 : _a2.classNames,
      props,
      stylesCtx
    });
  });
  const resolvedComponentStyles = withStylesTransform ? {} : (0,_get_style_resolve_styles_resolve_styles_mjs__WEBPACK_IMPORTED_MODULE_1__.resolveStyles)({
    theme,
    styles,
    props,
    stylesCtx
  });
  const resolvedThemeStyles = {};
  if (!withStylesTransform) for (const n of themeName) {
    const resolved = (0,_get_style_resolve_styles_resolve_styles_mjs__WEBPACK_IMPORTED_MODULE_1__.resolveStyles)({
      theme,
      styles: (_a = theme.components[n]) == null ? void 0 : _a.styles,
      props,
      stylesCtx
    });
    for (const key of Object.keys(resolved)) resolvedThemeStyles[key] = {
      ...resolvedThemeStyles[key],
      ...resolved[key]
    };
  }
  const resolvedVars = (0,_get_style_resolve_vars_merge_vars_mjs__WEBPACK_IMPORTED_MODULE_7__.mergeVars)([
    headless ? {} : varsResolver == null ? void 0 : varsResolver(theme, props, stylesCtx),
    ...themeName.map((n) => {
      var _a2, _b, _c;
      return (_c = (_b = (_a2 = theme.components) == null ? void 0 : _a2[n]) == null ? void 0 : _b.vars) == null ? void 0 : _c.call(_b, theme, props, stylesCtx);
    }),
    vars == null ? void 0 : vars(theme, props, stylesCtx)
  ]);
  const resolvedRootStyle = (0,_get_style_resolve_style_resolve_style_mjs__WEBPACK_IMPORTED_MODULE_5__.resolveStyle)({
    style,
    theme
  });
  return (selector, options) => ({
    ...attributes == null ? void 0 : attributes[selector],
    className: (0,_get_class_name_get_class_name_mjs__WEBPACK_IMPORTED_MODULE_4__.getClassName)({
      theme,
      options,
      themeName,
      selector,
      classNamesPrefix,
      resolvedClassNames,
      resolvedThemeClassNames,
      classes,
      unstyled,
      className,
      rootSelector,
      props,
      stylesCtx,
      withStaticClasses,
      headless,
      transformedStyles: getTransformedStyles([options == null ? void 0 : options.styles, styles])
    }),
    style: (0,_get_style_get_style_mjs__WEBPACK_IMPORTED_MODULE_6__.getStyle)({
      theme,
      selector,
      options,
      props,
      stylesCtx,
      rootSelector,
      withStylesTransform,
      resolvedStyles: resolvedComponentStyles,
      resolvedThemeStyles,
      resolvedVars,
      resolvedRootStyle
    })
  });
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-transformed-styles.mjs"
/*!**************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-transformed-styles.mjs ***!
  \**************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useStylesTransform: () => (/* binding */ useStylesTransform)
/* harmony export */ });
/* harmony import */ var _MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../MantineProvider/Mantine.context.mjs */ "../../node_modules/@mantine/core/esm/core/MantineProvider/Mantine.context.mjs");
"use client";

function useStylesTransform({ props, stylesCtx, themeName, theme }) {
  var _a;
  const stylesTransform = (_a = (0,_MantineProvider_Mantine_context_mjs__WEBPACK_IMPORTED_MODULE_0__.useMantineStylesTransform)()) == null ? void 0 : _a();
  const getTransformedStyles = (styles) => {
    if (!stylesTransform) return [];
    return [...styles.map((style) => stylesTransform(style, {
      props,
      theme,
      ctx: stylesCtx
    })), ...themeName.map((n) => {
      var _a2;
      return stylesTransform((_a2 = theme.components[n]) == null ? void 0 : _a2.styles, {
        props,
        theme,
        ctx: stylesCtx
      });
    })].filter(Boolean);
  };
  return {
    getTransformedStyles,
    withStylesTransform: !!stylesTransform
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/camel-to-kebab-case/camel-to-kebab-case.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/camel-to-kebab-case/camel-to-kebab-case.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   camelToKebabCase: () => (/* binding */ camelToKebabCase)
/* harmony export */ });
"use client";
function camelToKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/close-on-escape/close-on-escape.mjs"
/*!*******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/close-on-escape/close-on-escape.mjs ***!
  \*******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   closeOnEscape: () => (/* binding */ closeOnEscape)
/* harmony export */ });
/* harmony import */ var _noop_noop_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../noop/noop.mjs */ "../../node_modules/@mantine/core/esm/core/utils/noop/noop.mjs");
"use client";

function closeOnEscape(callback, options = { active: true }) {
  if (typeof callback !== "function" || !options.active) return options.onKeyDown || _noop_noop_mjs__WEBPACK_IMPORTED_MODULE_0__.noop;
  return (event) => {
    var _a;
    if (event.key === "Escape") {
      callback(event);
      (_a = options.onTrigger) == null ? void 0 : _a.call(options);
    }
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/create-safe-context/create-safe-context.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/create-safe-context/create-safe-context.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createSafeContext: () => (/* binding */ createSafeContext)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function createSafeContext(errorMessage) {
  const Context = (0,react__WEBPACK_IMPORTED_MODULE_0__.createContext)(null);
  const useSafeContext = () => {
    const ctx = (0,react__WEBPACK_IMPORTED_MODULE_0__.use)(Context);
    if (ctx === null) throw new Error(errorMessage);
    return ctx;
  };
  return [Context, useSafeContext];
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/create-scoped-keydown-handler/create-scoped-keydown-handler.mjs"
/*!***********************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/create-scoped-keydown-handler/create-scoped-keydown-handler.mjs ***!
  \***********************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createScopedKeydownHandler: () => (/* binding */ createScopedKeydownHandler)
/* harmony export */ });
/* harmony import */ var _find_element_ancestor_find_element_ancestor_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../find-element-ancestor/find-element-ancestor.mjs */ "../../node_modules/@mantine/core/esm/core/utils/find-element-ancestor/find-element-ancestor.mjs");
"use client";

function getPreviousIndex(current, elements, loop) {
  for (let i = current - 1; i >= 0; i -= 1) if (!elements[i].disabled) return i;
  if (loop) {
    for (let i = elements.length - 1; i > -1; i -= 1) if (!elements[i].disabled) return i;
  }
  return current;
}
function getNextIndex(current, elements, loop) {
  for (let i = current + 1; i < elements.length; i += 1) if (!elements[i].disabled) return i;
  if (loop) {
    for (let i = 0; i < elements.length; i += 1) if (!elements[i].disabled) return i;
  }
  return current;
}
function onSameLevel(target, sibling, parentSelector) {
  return (0,_find_element_ancestor_find_element_ancestor_mjs__WEBPACK_IMPORTED_MODULE_0__.findElementAncestor)(target, parentSelector) === (0,_find_element_ancestor_find_element_ancestor_mjs__WEBPACK_IMPORTED_MODULE_0__.findElementAncestor)(sibling, parentSelector);
}
function createScopedKeydownHandler({ parentSelector, siblingSelector, onKeyDown, loop = true, activateOnFocus = false, dir = "rtl", orientation }) {
  return (event) => {
    var _a;
    onKeyDown == null ? void 0 : onKeyDown(event);
    const elements = Array.from(((_a = (0,_find_element_ancestor_find_element_ancestor_mjs__WEBPACK_IMPORTED_MODULE_0__.findElementAncestor)(event.currentTarget, parentSelector)) == null ? void 0 : _a.querySelectorAll(siblingSelector)) || []).filter((node) => onSameLevel(event.currentTarget, node, parentSelector));
    const current = elements.findIndex((el) => event.currentTarget === el);
    const _nextIndex = getNextIndex(current, elements, loop);
    const _previousIndex = getPreviousIndex(current, elements, loop);
    const nextIndex = dir === "rtl" ? _previousIndex : _nextIndex;
    const previousIndex = dir === "rtl" ? _nextIndex : _previousIndex;
    switch (event.key) {
      case "ArrowRight":
        if (orientation === "horizontal") {
          event.stopPropagation();
          event.preventDefault();
          elements[nextIndex].focus();
          activateOnFocus && elements[nextIndex].click();
        }
        break;
      case "ArrowLeft":
        if (orientation === "horizontal") {
          event.stopPropagation();
          event.preventDefault();
          elements[previousIndex].focus();
          activateOnFocus && elements[previousIndex].click();
        }
        break;
      case "ArrowUp":
        if (orientation === "vertical") {
          event.stopPropagation();
          event.preventDefault();
          elements[_previousIndex].focus();
          activateOnFocus && elements[_previousIndex].click();
        }
        break;
      case "ArrowDown":
        if (orientation === "vertical") {
          event.stopPropagation();
          event.preventDefault();
          elements[_nextIndex].focus();
          activateOnFocus && elements[_nextIndex].click();
        }
        break;
      case "Home":
        event.stopPropagation();
        event.preventDefault();
        !elements[0].disabled && elements[0].focus();
        break;
      case "End": {
        event.stopPropagation();
        event.preventDefault();
        const last = elements.length - 1;
        !elements[last].disabled && elements[last].focus();
        break;
      }
    }
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/deep-merge/deep-merge.mjs"
/*!*********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/deep-merge/deep-merge.mjs ***!
  \*********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   deepMerge: () => (/* binding */ deepMerge)
/* harmony export */ });
function isObject(item) {
  return item && typeof item === "object" && !Array.isArray(item);
}
function deepMerge(target, source) {
  const result = { ...target };
  const _source = source;
  if (isObject(target) && isObject(source)) Object.keys(source).forEach((key) => {
    if (isObject(_source[key])) if (!(key in target)) result[key] = _source[key];
    else result[key] = deepMerge(result[key], _source[key]);
    else result[key] = _source[key];
  });
  return result;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/filter-props/filter-props.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/filter-props/filter-props.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   filterProps: () => (/* binding */ filterProps)
/* harmony export */ });
"use client";
function filterProps(props) {
  return Object.keys(props).reduce((acc, key) => {
    if (props[key] !== void 0) acc[key] = props[key];
    return acc;
  }, {});
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/find-element-ancestor/find-element-ancestor.mjs"
/*!*******************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/find-element-ancestor/find-element-ancestor.mjs ***!
  \*******************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   findElementAncestor: () => (/* binding */ findElementAncestor)
/* harmony export */ });
"use client";
function findElementAncestor(element, selector) {
  let _element = element;
  while ((_element = _element.parentElement) && !_element.matches(selector)) ;
  return _element;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/get-default-z-index/get-default-z-index.mjs"
/*!***************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/get-default-z-index/get-default-z-index.mjs ***!
  \***************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getDefaultZIndex: () => (/* binding */ getDefaultZIndex)
/* harmony export */ });
"use client";
const elevations = {
  app: 100,
  modal: 200,
  popover: 300,
  overlay: 400,
  max: 9999
};
function getDefaultZIndex(level) {
  return elevations[level];
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/get-env/get-env.mjs"
/*!***************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/get-env/get-env.mjs ***!
  \***************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getEnv: () => (/* binding */ getEnv)
/* harmony export */ });
"use client";
function getEnv() {
  if (typeof process !== "undefined" && process.env && "development") return "development";
  return "development";
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/get-ref-prop/get-ref-prop.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/get-ref-prop/get-ref-prop.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getRefProp: () => (/* binding */ getRefProp)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function getRefProp(element) {
  var _a;
  const version = (react__WEBPACK_IMPORTED_MODULE_0___default().version);
  if (typeof (react__WEBPACK_IMPORTED_MODULE_0___default().version) !== "string") return element == null ? void 0 : element.ref;
  if (version.startsWith("18.")) return element == null ? void 0 : element.ref;
  return (_a = element == null ? void 0 : element.props) == null ? void 0 : _a.ref;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/get-safe-id/get-safe-id.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/get-safe-id/get-safe-id.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getSafeId: () => (/* binding */ getSafeId)
/* harmony export */ });
"use client";
function getSafeId(uid, errorMessage) {
  return (value) => {
    if (typeof value !== "string" || value.trim().length === 0) throw new Error(errorMessage);
    return `${uid}-${value}`;
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/get-single-element-child/get-single-element-child.mjs"
/*!*************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/get-single-element-child/get-single-element-child.mjs ***!
  \*************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getSingleElementChild: () => (/* binding */ getSingleElementChild)
/* harmony export */ });
/* harmony import */ var _is_element_is_element_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../is-element/is-element.mjs */ "../../node_modules/@mantine/core/esm/core/utils/is-element/is-element.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
"use client";


function getSingleElementChild(children) {
  const _children = react__WEBPACK_IMPORTED_MODULE_1__.Children.toArray(children);
  if (_children.length !== 1 || !(0,_is_element_is_element_mjs__WEBPACK_IMPORTED_MODULE_0__.isElement)(_children[0])) return null;
  return _children[0];
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs"
/*!*****************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs ***!
  \*****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getFontSize: () => (/* binding */ getFontSize),
/* harmony export */   getLineHeight: () => (/* binding */ getLineHeight),
/* harmony export */   getRadius: () => (/* binding */ getRadius),
/* harmony export */   getShadow: () => (/* binding */ getShadow),
/* harmony export */   getSize: () => (/* binding */ getSize),
/* harmony export */   getSpacing: () => (/* binding */ getSpacing)
/* harmony export */ });
/* harmony import */ var _units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../units-converters/rem.mjs */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _is_number_like_is_number_like_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../is-number-like/is-number-like.mjs */ "../../node_modules/@mantine/core/esm/core/utils/is-number-like/is-number-like.mjs");
"use client";


function getSize(size, prefix = "size", convertToRem = true) {
  if (size === void 0) return;
  return (0,_is_number_like_is_number_like_mjs__WEBPACK_IMPORTED_MODULE_1__.isNumberLike)(size) ? convertToRem ? (0,_units_converters_rem_mjs__WEBPACK_IMPORTED_MODULE_0__.rem)(size) : size : `var(--${prefix}-${size})`;
}
function getSpacing(size) {
  return getSize(size, "mantine-spacing");
}
function getRadius(size) {
  if (size === void 0) return "var(--mantine-radius-default)";
  return getSize(size, "mantine-radius");
}
function getFontSize(size) {
  return getSize(size, "mantine-font-size");
}
function getLineHeight(size) {
  return getSize(size, "mantine-line-height", false);
}
function getShadow(size) {
  if (!size) return;
  return getSize(size, "mantine-shadow", false);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/is-element/is-element.mjs"
/*!*********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/is-element/is-element.mjs ***!
  \*********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isElement: () => (/* binding */ isElement)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function isElement(value) {
  if (Array.isArray(value) || value === null) return false;
  if (typeof value === "object") {
    if (value.type === react__WEBPACK_IMPORTED_MODULE_0__.Fragment) return false;
    return true;
  }
  return false;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/is-number-like/is-number-like.mjs"
/*!*****************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/is-number-like/is-number-like.mjs ***!
  \*****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isNumberLike: () => (/* binding */ isNumberLike)
/* harmony export */ });
"use client";
function isNumberLike(value) {
  if (typeof value === "number") return true;
  if (typeof value === "string") {
    if (value.startsWith("calc(") || value.startsWith("var(") || value.includes(" ") && value.trim() !== "") return true;
    const cssUnitsRegex = /^[+-]?[0-9]+(\.[0-9]+)?(px|em|rem|ex|ch|lh|rlh|vw|vh|vmin|vmax|vb|vi|svw|svh|lvw|lvh|dvw|dvh|cm|mm|in|pt|pc|q|cqw|cqh|cqi|cqb|cqmin|cqmax|%)?$/;
    return value.trim().split(/\s+/).every((val) => cssUnitsRegex.test(val));
  }
  return false;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/keys/keys.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/keys/keys.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   keys: () => (/* binding */ keys)
/* harmony export */ });
"use client";
function keys(object) {
  return Object.keys(object);
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/memoize/memoize.mjs"
/*!***************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/memoize/memoize.mjs ***!
  \***************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   memoize: () => (/* binding */ memoize)
/* harmony export */ });
"use client";
function memoize(func) {
  const cache = /* @__PURE__ */ new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = func(...args);
    cache.set(key, result);
    return result;
  };
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/noop/noop.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/noop/noop.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   noop: () => (/* binding */ noop)
/* harmony export */ });
"use client";
const noop = () => {
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/primitive/primitive.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/primitive/primitive.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isPrimitive: () => (/* binding */ isPrimitive)
/* harmony export */ });
"use client";
function isPrimitive(value) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint";
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/units-converters/px.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/units-converters/px.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   px: () => (/* binding */ px)
/* harmony export */ });
function getTransformedScaledValue(value) {
  var _a;
  if (typeof value !== "string" || !value.includes("var(--mantine-scale)")) return value;
  return (_a = value.match(/^calc\((.*?)\)$/)) == null ? void 0 : _a[1].split("*")[0].trim();
}
function px(value) {
  const transformedValue = getTransformedScaledValue(value);
  if (typeof transformedValue === "number") return transformedValue;
  if (typeof transformedValue === "string") {
    if (transformedValue.includes("calc") || transformedValue.includes("var")) return transformedValue;
    if (transformedValue.includes("px")) return Number(transformedValue.replace("px", ""));
    if (transformedValue.includes("rem")) return Number(transformedValue.replace("rem", "")) * 16;
    if (transformedValue.includes("em")) return Number(transformedValue.replace("em", "")) * 16;
    return Number(transformedValue);
  }
  return NaN;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs"
/*!********************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs ***!
  \********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   em: () => (/* binding */ em),
/* harmony export */   rem: () => (/* binding */ rem)
/* harmony export */ });
function scaleRem(remValue) {
  if (remValue === "0rem") return "0rem";
  return `calc(${remValue} * var(--mantine-scale))`;
}
function createConverter(units, { shouldScale = false } = {}) {
  function converter(value) {
    if (value === 0 || value === "0") return `0${units}`;
    if (typeof value === "number") {
      const val = `${value / 16}${units}`;
      return shouldScale ? scaleRem(val) : val;
    }
    if (typeof value === "string") {
      if (value === "") return value;
      if (value.startsWith("calc(") || value.startsWith("clamp(") || value.includes("rgba(")) return value;
      if (value.includes(",")) return value.split(",").map((val) => converter(val)).join(",");
      if (value.includes(" ")) return value.split(" ").map((val) => converter(val)).join(" ");
      const replaced = value.replace("px", "");
      if (!Number.isNaN(Number(replaced))) {
        const val = `${Number(replaced) / 16}${units}`;
        return shouldScale ? scaleRem(val) : val;
      }
    }
    return value;
  }
  return converter;
}
const rem = createConverter("rem", { shouldScale: true });
const em = createConverter("em");



/***/ },

/***/ "../../node_modules/@mantine/core/esm/utils/Floating/FloatingArrow/FloatingArrow.mjs"
/*!*******************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/utils/Floating/FloatingArrow/FloatingArrow.mjs ***!
  \*******************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   FloatingArrow: () => (/* binding */ FloatingArrow)
/* harmony export */ });
/* harmony import */ var _core_DirectionProvider_DirectionProvider_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../../core/DirectionProvider/DirectionProvider.mjs */ "../../node_modules/@mantine/core/esm/core/DirectionProvider/DirectionProvider.mjs");
/* harmony import */ var _get_arrow_position_styles_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./get-arrow-position-styles.mjs */ "../../node_modules/@mantine/core/esm/utils/Floating/FloatingArrow/get-arrow-position-styles.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";



function FloatingArrow({ position, arrowSize, arrowOffset, arrowRadius, arrowPosition, visible, arrowX, arrowY, style, ...others }) {
  const { dir } = (0,_core_DirectionProvider_DirectionProvider_mjs__WEBPACK_IMPORTED_MODULE_0__.useDirection)();
  if (!visible) return null;
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("div", {
    ...others,
    style: {
      ...style,
      ...(0,_get_arrow_position_styles_mjs__WEBPACK_IMPORTED_MODULE_1__.getArrowPositionStyles)({
        position,
        arrowSize,
        arrowOffset,
        arrowRadius,
        arrowPosition,
        dir,
        arrowX,
        arrowY
      })
    }
  });
}
FloatingArrow.displayName = "@mantine/core/FloatingArrow";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/utils/Floating/FloatingArrow/get-arrow-position-styles.mjs"
/*!*******************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/utils/Floating/FloatingArrow/get-arrow-position-styles.mjs ***!
  \*******************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getArrowPositionStyles: () => (/* binding */ getArrowPositionStyles)
/* harmony export */ });
"use client";
function horizontalSide(placement, arrowY, arrowOffset, arrowPosition) {
  if (placement === "center" || arrowPosition === "center") return { top: arrowY };
  if (placement === "end") return { bottom: arrowOffset };
  if (placement === "start") return { top: arrowOffset };
  return {};
}
function verticalSide(placement, arrowX, arrowOffset, arrowPosition, dir) {
  if (placement === "center" || arrowPosition === "center") return { left: arrowX };
  if (placement === "end") return { [dir === "ltr" ? "right" : "left"]: arrowOffset };
  if (placement === "start") return { [dir === "ltr" ? "left" : "right"]: arrowOffset };
  return {};
}
const radiusByFloatingSide = {
  bottom: "borderTopLeftRadius",
  left: "borderTopRightRadius",
  right: "borderBottomLeftRadius",
  top: "borderBottomRightRadius"
};
function getArrowPositionStyles({ position, arrowSize, arrowOffset, arrowRadius, arrowPosition, arrowX, arrowY, dir }) {
  const [side, placement = "center"] = position.split("-");
  const baseStyles = {
    width: arrowSize,
    height: arrowSize,
    transform: "rotate(45deg)",
    position: "absolute",
    [radiusByFloatingSide[side]]: arrowRadius
  };
  const arrowPlacement = -arrowSize / 2;
  if (side === "left") return {
    ...baseStyles,
    ...horizontalSide(placement, arrowY, arrowOffset, arrowPosition),
    right: arrowPlacement,
    borderLeftColor: "transparent",
    borderBottomColor: "transparent",
    clipPath: "polygon(100% 0, 0 0, 100% 100%)"
  };
  if (side === "right") return {
    ...baseStyles,
    ...horizontalSide(placement, arrowY, arrowOffset, arrowPosition),
    left: arrowPlacement,
    borderRightColor: "transparent",
    borderTopColor: "transparent",
    clipPath: "polygon(0 100%, 0 0, 100% 100%)"
  };
  if (side === "top") return {
    ...baseStyles,
    ...verticalSide(placement, arrowX, arrowOffset, arrowPosition, dir),
    bottom: arrowPlacement,
    borderTopColor: "transparent",
    borderLeftColor: "transparent",
    clipPath: "polygon(0 100%, 100% 100%, 100% 0)"
  };
  if (side === "bottom") return {
    ...baseStyles,
    ...verticalSide(placement, arrowX, arrowOffset, arrowPosition, dir),
    top: arrowPlacement,
    borderBottomColor: "transparent",
    borderRightColor: "transparent",
    clipPath: "polygon(0 100%, 0 0, 100% 0)"
  };
  return {};
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/utils/Floating/get-floating-position/get-floating-position.mjs"
/*!***********************************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/utils/Floating/get-floating-position/get-floating-position.mjs ***!
  \***********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getFloatingPosition: () => (/* binding */ getFloatingPosition)
/* harmony export */ });
"use client";
function getFloatingPosition(dir, position) {
  if (dir === "rtl" && (position.includes("right") || position.includes("left"))) {
    const [side, placement] = position.split("-");
    const flippedPosition = side === "right" ? "left" : "right";
    return placement === void 0 ? flippedPosition : `${flippedPosition}-${placement}`;
  }
  return position;
}



/***/ },

/***/ "../../node_modules/@mantine/core/esm/utils/InlineInput/InlineInput.mjs"
/*!******************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/utils/InlineInput/InlineInput.mjs ***!
  \******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InlineInput: () => (/* binding */ InlineInput),
/* harmony export */   InlineInputClasses: () => (/* binding */ InlineInputClasses)
/* harmony export */ });
/* harmony import */ var _core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../core/utils/get-size/get-size.mjs */ "../../node_modules/@mantine/core/esm/core/utils/get-size/get-size.mjs");
/* harmony import */ var _core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../core/styles-api/use-styles/use-styles.mjs */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../core/Box/Box.mjs */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _components_Input_Input_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../components/Input/Input.mjs */ "../../node_modules/@mantine/core/esm/components/Input/Input.mjs");
/* harmony import */ var _InlineInput_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./InlineInput.module.mjs */ "../../node_modules/@mantine/core/esm/utils/InlineInput/InlineInput.module.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";






const InlineInputClasses = _InlineInput_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
function InlineInput({ __staticSelector, __stylesApiProps, className, classNames, styles, unstyled, children, label, description, id, disabled, error, size, labelPosition = "left", bodyElement = "div", labelElement = "label", variant, style, vars, mod, attributes, ...others }) {
  const getStyles = (0,_core_styles_api_use_styles_use_styles_mjs__WEBPACK_IMPORTED_MODULE_1__.useStyles)({
    name: __staticSelector,
    props: __stylesApiProps,
    className,
    style,
    classes: _InlineInput_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"],
    classNames,
    styles,
    unstyled,
    attributes
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__.Box, {
    ...getStyles("root"),
    __vars: {
      "--label-fz": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getFontSize)(size),
      "--label-lh": (0,_core_utils_get_size_get_size_mjs__WEBPACK_IMPORTED_MODULE_0__.getSize)(size, "label-lh")
    },
    mod: [{ "label-position": labelPosition }, mod],
    variant,
    size,
    ...others,
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsxs)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__.Box, {
      component: bodyElement,
      htmlFor: bodyElement === "label" ? id : void 0,
      ...getStyles("body"),
      children: [children, /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsxs)("div", {
        ...getStyles("labelWrapper"),
        "data-disabled": disabled || void 0,
        children: [
          label && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_core_Box_Box_mjs__WEBPACK_IMPORTED_MODULE_2__.Box, {
            component: labelElement,
            htmlFor: labelElement === "label" ? id : void 0,
            ...getStyles("label"),
            "data-disabled": disabled || void 0,
            children: label
          }),
          description && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_components_Input_Input_mjs__WEBPACK_IMPORTED_MODULE_3__.Input.Description, {
            size,
            __inheritStyles: false,
            ...getStyles("description"),
            children: description
          }),
          error && typeof error !== "boolean" && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_5__.jsx)(_components_Input_Input_mjs__WEBPACK_IMPORTED_MODULE_3__.Input.Error, {
            size,
            __inheritStyles: false,
            ...getStyles("error"),
            children: error
          })
        ]
      })]
    })
  });
}
InlineInput.displayName = "@mantine/core/InlineInput";



/***/ },

/***/ "../../node_modules/@mantine/core/esm/utils/InlineInput/InlineInput.module.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/utils/InlineInput/InlineInput.module.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ InlineInput_module_default)
/* harmony export */ });
"use client";
var InlineInput_module_default = {
  "root": "m_5f75b09e",
  "body": "m_5f6e695e",
  "labelWrapper": "m_d3ea56bb",
  "label": "m_8ee546b8",
  "description": "m_328f68c0",
  "error": "m_8e8a99cc"
};



/***/ },

/***/ "../../node_modules/@mantine/core/esm/utils/InputsGroupFieldset/InputsGroupFieldset.mjs"
/*!**********************************************************************************************!*\
  !*** ../../node_modules/@mantine/core/esm/utils/InputsGroupFieldset/InputsGroupFieldset.mjs ***!
  \**********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InputsGroupFieldset: () => (/* binding */ InputsGroupFieldset)
/* harmony export */ });
/* harmony import */ var _components_Input_InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../components/Input/InputWrapper.context.mjs */ "../../node_modules/@mantine/core/esm/components/Input/InputWrapper.context.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";



function InputsGroupFieldset({ children, role }) {
  const ctx = (0,react__WEBPACK_IMPORTED_MODULE_1__.use)(_components_Input_InputWrapper_context_mjs__WEBPACK_IMPORTED_MODULE_0__.InputWrapperContext);
  if (!ctx) return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.Fragment, { children });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("div", {
    role,
    "aria-labelledby": ctx.labelId,
    "aria-describedby": ctx.describedBy,
    children
  });
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-click-outside/use-click-outside.mjs"
/*!*************************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-click-outside/use-click-outside.mjs ***!
  \*************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useClickOutside: () => (/* binding */ useClickOutside)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

const DEFAULT_EVENTS = ["mousedown", "touchstart"];
function useClickOutside(callback, events, nodes, enabled = true) {
  const ref = (0,react__WEBPACK_IMPORTED_MODULE_0__.useRef)(null);
  const eventsList = events || DEFAULT_EVENTS;
  const listener = (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffectEvent)((event) => {
    const { target } = event != null ? event : {};
    if (!document.body.contains(target) && (target == null ? void 0 : target.tagName) !== "HTML") return;
    const path = event.composedPath();
    if (Array.isArray(nodes)) nodes.every((node) => !!node && !path.includes(node)) && callback(event);
    else if (ref.current && !path.includes(ref.current)) callback(event);
  });
  const eventsKey = eventsList.join(",");
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
    if (!enabled) return;
    const events2 = eventsKey.split(",");
    events2.forEach((fn) => document.addEventListener(fn, listener));
    return () => {
      events2.forEach((fn) => document.removeEventListener(fn, listener));
    };
  }, [eventsKey, enabled]);
  return ref;
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-debounced-callback/use-debounced-callback.mjs"
/*!***********************************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-debounced-callback/use-debounced-callback.mjs ***!
  \***********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useDebouncedCallback: () => (/* binding */ useDebouncedCallback)
/* harmony export */ });
/* harmony import */ var _utils_use_callback_ref_use_callback_ref_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/use-callback-ref/use-callback-ref.mjs */ "../../node_modules/@mantine/hooks/esm/utils/use-callback-ref/use-callback-ref.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
"use client";


function useDebouncedCallback(callback, options) {
  const { delay, flushOnUnmount, leading, maxWait } = typeof options === "number" ? {
    delay: options,
    flushOnUnmount: false,
    leading: false,
    maxWait: void 0
  } : options;
  const handleCallback = (0,_utils_use_callback_ref_use_callback_ref_mjs__WEBPACK_IMPORTED_MODULE_0__.useCallbackRef)(callback);
  const debounceTimerRef = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(0);
  const maxWaitTimerRef = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(0);
  const latestArgsRef = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null);
  const lastCallback = (0,react__WEBPACK_IMPORTED_MODULE_1__.useMemo)(() => {
    const currentCallback = Object.assign((...args) => {
      window.clearTimeout(debounceTimerRef.current);
      latestArgsRef.current = args;
      const isFirstCall = currentCallback._isFirstCall;
      currentCallback._isFirstCall = false;
      function clearTimeoutAndLeadingRef() {
        window.clearTimeout(debounceTimerRef.current);
        window.clearTimeout(maxWaitTimerRef.current);
        debounceTimerRef.current = 0;
        maxWaitTimerRef.current = 0;
        currentCallback._isFirstCall = true;
        currentCallback._hasPendingCallback = false;
      }
      function startMaxWaitTimer() {
        if (maxWait !== void 0 && maxWaitTimerRef.current === 0) maxWaitTimerRef.current = window.setTimeout(() => {
          if (debounceTimerRef.current !== 0) {
            const latestArgs = latestArgsRef.current;
            clearTimeoutAndLeadingRef();
            handleCallback(...latestArgs);
          }
        }, maxWait);
      }
      if (leading && isFirstCall) {
        handleCallback(...args);
        const resetLeadingState = () => {
          clearTimeoutAndLeadingRef();
        };
        const flush2 = () => {
          if (debounceTimerRef.current !== 0) {
            clearTimeoutAndLeadingRef();
            handleCallback(...args);
          }
        };
        const cancel2 = () => {
          clearTimeoutAndLeadingRef();
        };
        currentCallback.flush = flush2;
        currentCallback.cancel = cancel2;
        debounceTimerRef.current = window.setTimeout(resetLeadingState, delay);
        startMaxWaitTimer();
        return;
      }
      if (leading && !isFirstCall) {
        currentCallback._hasPendingCallback = true;
        const flush2 = () => {
          if (debounceTimerRef.current !== 0) {
            clearTimeoutAndLeadingRef();
            handleCallback(...args);
          }
        };
        const cancel2 = () => {
          clearTimeoutAndLeadingRef();
        };
        currentCallback.flush = flush2;
        currentCallback.cancel = cancel2;
        const resetLeadingState = () => {
          clearTimeoutAndLeadingRef();
        };
        debounceTimerRef.current = window.setTimeout(resetLeadingState, delay);
        startMaxWaitTimer();
        return;
      }
      currentCallback._hasPendingCallback = true;
      const flush = () => {
        if (debounceTimerRef.current !== 0) {
          clearTimeoutAndLeadingRef();
          handleCallback(...args);
        }
      };
      const cancel = () => {
        clearTimeoutAndLeadingRef();
      };
      currentCallback.flush = flush;
      currentCallback.cancel = cancel;
      debounceTimerRef.current = window.setTimeout(flush, delay);
      startMaxWaitTimer();
    }, {
      flush: () => {
      },
      cancel: () => {
      },
      isPending: () => currentCallback._hasPendingCallback,
      _isFirstCall: true,
      _hasPendingCallback: false
    });
    return currentCallback;
  }, [
    handleCallback,
    delay,
    leading,
    maxWait
  ]);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => () => {
    if (flushOnUnmount) lastCallback.flush();
    else lastCallback.cancel();
  }, [lastCallback, flushOnUnmount]);
  return lastCallback;
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-did-update/use-did-update.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-did-update/use-did-update.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useDidUpdate: () => (/* binding */ useDidUpdate)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function useDidUpdate(fn, dependencies) {
  const mounted = (0,react__WEBPACK_IMPORTED_MODULE_0__.useRef)(false);
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => () => {
    mounted.current = false;
  }, []);
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
    if (mounted.current) return fn();
    mounted.current = true;
  }, dependencies);
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-focus-return/use-focus-return.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-focus-return/use-focus-return.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useFocusReturn: () => (/* binding */ useFocusReturn)
/* harmony export */ });
/* harmony import */ var _use_did_update_use_did_update_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../use-did-update/use-did-update.mjs */ "../../node_modules/@mantine/hooks/esm/use-did-update/use-did-update.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
"use client";


function useFocusReturn({ opened, shouldReturnFocus = true }) {
  const lastActiveElement = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null);
  const returnFocus = () => {
    var _a;
    if (lastActiveElement.current && "focus" in lastActiveElement.current && typeof lastActiveElement.current.focus === "function") (_a = lastActiveElement.current) == null ? void 0 : _a.focus({ preventScroll: true });
  };
  (0,_use_did_update_use_did_update_mjs__WEBPACK_IMPORTED_MODULE_0__.useDidUpdate)(() => {
    let timeout = -1;
    const clearFocusTimeout = (event) => {
      if (event.key === "Tab") window.clearTimeout(timeout);
    };
    document.addEventListener("keydown", clearFocusTimeout);
    if (opened) lastActiveElement.current = document.activeElement;
    else if (shouldReturnFocus) {
      const activeElementAtClose = document.activeElement;
      timeout = window.setTimeout(() => {
        const currentActiveElement = document.activeElement;
        if (currentActiveElement === null || currentActiveElement === document.body || currentActiveElement === activeElementAtClose) returnFocus();
      }, 10);
    }
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("keydown", clearFocusTimeout);
    };
  }, [opened, shouldReturnFocus]);
  return returnFocus;
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-focus-trap/scope-tab.mjs"
/*!**************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-focus-trap/scope-tab.mjs ***!
  \**************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   scopeTab: () => (/* binding */ scopeTab)
/* harmony export */ });
/* harmony import */ var _tabbable_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./tabbable.mjs */ "../../node_modules/@mantine/hooks/esm/use-focus-trap/tabbable.mjs");
"use client";

function scopeTab(node, event) {
  const tabbable = (0,_tabbable_mjs__WEBPACK_IMPORTED_MODULE_0__.findTabbableDescendants)(node);
  if (!tabbable.length) {
    event.preventDefault();
    return;
  }
  const finalTabbable = tabbable[event.shiftKey ? 0 : tabbable.length - 1];
  const root = node.getRootNode();
  let leavingFinalTabbable = finalTabbable === root.activeElement || node === root.activeElement;
  const activeElement = root.activeElement;
  if (activeElement.tagName === "INPUT" && activeElement.getAttribute("type") === "radio") leavingFinalTabbable = tabbable.filter((element) => element.getAttribute("type") === "radio" && element.getAttribute("name") === activeElement.getAttribute("name")).includes(finalTabbable);
  if (!leavingFinalTabbable) return;
  event.preventDefault();
  const target = tabbable[event.shiftKey ? tabbable.length - 1 : 0];
  if (target) target.focus();
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-focus-trap/tabbable.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-focus-trap/tabbable.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   FOCUS_SELECTOR: () => (/* binding */ FOCUS_SELECTOR),
/* harmony export */   findTabbableDescendants: () => (/* binding */ findTabbableDescendants),
/* harmony export */   focusable: () => (/* binding */ focusable),
/* harmony export */   tabbable: () => (/* binding */ tabbable)
/* harmony export */ });
"use client";
const TABBABLE_NODES = /input|select|textarea|button|object/;
const FOCUS_SELECTOR = "a, input, select, textarea, button, object, [tabindex]";
function hidden(element) {
  return element.style.display === "none";
}
function visible(element) {
  if (element.getAttribute("aria-hidden") || element.getAttribute("hidden") || element.getAttribute("type") === "hidden") return false;
  let parentElement = element;
  while (parentElement) {
    if (parentElement === document.body || parentElement.nodeType === 11) break;
    if (hidden(parentElement)) return false;
    parentElement = parentElement.parentNode;
  }
  return true;
}
function getElementTabIndex(element) {
  let tabIndex = element.getAttribute("tabindex");
  if (tabIndex === null) tabIndex = void 0;
  return parseInt(tabIndex, 10);
}
function focusable(element) {
  const nodeName = element.nodeName.toLowerCase();
  const isTabIndexNotNaN = !Number.isNaN(getElementTabIndex(element));
  return (TABBABLE_NODES.test(nodeName) && !element.disabled || (element instanceof HTMLAnchorElement ? element.href || isTabIndexNotNaN : isTabIndexNotNaN)) && visible(element);
}
function tabbable(element) {
  const tabIndex = getElementTabIndex(element);
  return (Number.isNaN(tabIndex) || tabIndex >= 0) && focusable(element);
}
function findTabbableDescendants(element) {
  return Array.from(element.querySelectorAll(FOCUS_SELECTOR)).filter(tabbable);
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-focus-trap/use-focus-trap.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-focus-trap/use-focus-trap.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useFocusTrap: () => (/* binding */ useFocusTrap)
/* harmony export */ });
/* harmony import */ var _tabbable_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./tabbable.mjs */ "../../node_modules/@mantine/hooks/esm/use-focus-trap/tabbable.mjs");
/* harmony import */ var _scope_tab_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./scope-tab.mjs */ "../../node_modules/@mantine/hooks/esm/use-focus-trap/scope-tab.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
"use client";



function useFocusTrap(active = true) {
  const ref = (0,react__WEBPACK_IMPORTED_MODULE_2__.useRef)(null);
  const focusNode = (node) => {
    let focusElement = node.querySelector("[data-autofocus]");
    if (!focusElement) {
      const children = Array.from(node.querySelectorAll(_tabbable_mjs__WEBPACK_IMPORTED_MODULE_0__.FOCUS_SELECTOR));
      focusElement = children.find(_tabbable_mjs__WEBPACK_IMPORTED_MODULE_0__.tabbable) || children.find(_tabbable_mjs__WEBPACK_IMPORTED_MODULE_0__.focusable) || null;
      if (!focusElement && (0,_tabbable_mjs__WEBPACK_IMPORTED_MODULE_0__.focusable)(node)) focusElement = node;
    }
    if (focusElement) focusElement.focus({ preventScroll: true });
    else console.warn("[@mantine/hooks/use-focus-trap] Failed to find focusable element within provided node", node);
  };
  const setRef = (0,react__WEBPACK_IMPORTED_MODULE_2__.useCallback)((node) => {
    if (!active) return;
    if (node === null) {
      ref.current = null;
      return;
    }
    if (ref.current === node) return;
    setTimeout(() => {
      if (node.getRootNode()) focusNode(node);
      else console.warn("[@mantine/hooks/use-focus-trap] Ref node is not part of the dom", node);
    });
    ref.current = node;
  }, [active]);
  (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(() => {
    if (!active) return;
    if (ref.current) setTimeout(() => {
      if (ref.current) focusNode(ref.current);
    });
    const handleKeyDown = (event) => {
      if (event.key === "Tab" && ref.current) (0,_scope_tab_mjs__WEBPACK_IMPORTED_MODULE_1__.scopeTab)(ref.current, event);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);
  return setRef;
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-force-update/use-force-update.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-force-update/use-force-update.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useForceUpdate: () => (/* binding */ useForceUpdate)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

const reducer = (value) => (value + 1) % 1e6;
function useForceUpdate() {
  const [, update] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useReducer)(reducer, 0);
  return update;
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-hotkeys/parse-hotkey.mjs"
/*!**************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-hotkeys/parse-hotkey.mjs ***!
  \**************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getHotkeyMatcher: () => (/* binding */ getHotkeyMatcher)
/* harmony export */ });
/* unused harmony export getHotkeyHandler */
"use client";
const keyNameMap = {
  " ": "space",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  Escape: "escape",
  Esc: "escape",
  esc: "escape",
  Enter: "enter",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  Insert: "insert",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  "+": "plus",
  "-": "minus",
  "*": "asterisk",
  "/": "slash"
};
function normalizeKey(key) {
  const lowerKey = key.replace("Key", "").toLowerCase();
  return keyNameMap[key] || lowerKey;
}
function parseHotkey(hotkey) {
  const keys = hotkey.toLowerCase().split("+").map((part) => part.trim());
  const modifiers = {
    alt: keys.includes("alt"),
    ctrl: keys.includes("ctrl"),
    meta: keys.includes("meta"),
    mod: keys.includes("mod"),
    shift: keys.includes("shift")
  };
  const reservedKeys = [
    "alt",
    "ctrl",
    "meta",
    "shift",
    "mod"
  ];
  const freeKey = keys.find((key) => !reservedKeys.includes(key));
  return {
    ...modifiers,
    key: freeKey === "[plus]" ? "+" : freeKey
  };
}
function isExactHotkey(hotkey, event, usePhysicalKeys) {
  const { alt, ctrl, meta, mod, shift, key } = hotkey;
  const { altKey, ctrlKey, metaKey, shiftKey, key: pressedKey, code: pressedCode } = event;
  if (alt !== altKey) return false;
  if (mod) {
    if (!ctrlKey && !metaKey) return false;
  } else {
    if (ctrl !== ctrlKey) return false;
    if (meta !== metaKey) return false;
  }
  if (shift !== shiftKey) return false;
  if (key && (usePhysicalKeys ? normalizeKey(pressedCode) === normalizeKey(key) : normalizeKey(pressedKey != null ? pressedKey : pressedCode) === normalizeKey(key))) return true;
  return false;
}
function getHotkeyMatcher(hotkey, usePhysicalKeys) {
  return (event) => isExactHotkey(parseHotkey(hotkey), event, usePhysicalKeys);
}
function getHotkeyHandler(hotkeys) {
  return (event) => {
    const _event = "nativeEvent" in event ? event.nativeEvent : event;
    hotkeys.forEach(([hotkey, handler, options = {
      preventDefault: true,
      usePhysicalKeys: false
    }]) => {
      if (getHotkeyMatcher(hotkey, options.usePhysicalKeys)(_event)) {
        if (options.preventDefault) event.preventDefault();
        handler(_event);
      }
    });
  };
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-hotkeys/use-hotkeys.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-hotkeys/use-hotkeys.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useHotkeys: () => (/* binding */ useHotkeys)
/* harmony export */ });
/* harmony import */ var _parse_hotkey_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./parse-hotkey.mjs */ "../../node_modules/@mantine/hooks/esm/use-hotkeys/parse-hotkey.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
"use client";


function shouldFireEvent(event, tagsToIgnore, triggerOnContentEditable = false) {
  if (event.target instanceof HTMLElement) {
    if (triggerOnContentEditable) return !tagsToIgnore.includes(event.target.tagName);
    return !event.target.isContentEditable && !tagsToIgnore.includes(event.target.tagName);
  }
  return true;
}
function useHotkeys(hotkeys, tagsToIgnore = [
  "INPUT",
  "TEXTAREA",
  "SELECT"
], triggerOnContentEditable = false) {
  const handleKeydown = (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((event) => {
    hotkeys.forEach(([hotkey, handler, options = {
      preventDefault: true,
      usePhysicalKeys: false
    }]) => {
      if ((0,_parse_hotkey_mjs__WEBPACK_IMPORTED_MODULE_0__.getHotkeyMatcher)(hotkey, options.usePhysicalKeys)(event) && shouldFireEvent(event, tagsToIgnore, triggerOnContentEditable)) {
        if (options.preventDefault) event.preventDefault();
        handler(event);
      }
    });
  });
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    document.documentElement.addEventListener("keydown", handleKeydown);
    return () => document.documentElement.removeEventListener("keydown", handleKeydown);
  }, []);
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-id/use-id.mjs"
/*!***************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-id/use-id.mjs ***!
  \***************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useId: () => (/* binding */ useId$1)
/* harmony export */ });
/* harmony import */ var _utils_random_id_random_id_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/random-id/random-id.mjs */ "../../node_modules/@mantine/hooks/esm/utils/random-id/random-id.mjs");
/* harmony import */ var _use_isomorphic_effect_use_isomorphic_effect_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../use-isomorphic-effect/use-isomorphic-effect.mjs */ "../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
"use client";



function useId$1(staticId) {
  const [uuid, setUuid] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(`mantine-${(0,react__WEBPACK_IMPORTED_MODULE_2__.useId)().replace(/:/g, "")}`);
  (0,_use_isomorphic_effect_use_isomorphic_effect_mjs__WEBPACK_IMPORTED_MODULE_1__.useIsomorphicEffect)(() => {
    setUuid((0,_utils_random_id_random_id_mjs__WEBPACK_IMPORTED_MODULE_0__.randomId)());
  }, []);
  if (typeof staticId === "string") return staticId;
  return uuid;
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs"
/*!*********************************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs ***!
  \*********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useIsomorphicEffect: () => (/* binding */ useIsomorphicEffect)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

const useIsomorphicEffect = typeof document !== "undefined" ? react__WEBPACK_IMPORTED_MODULE_0__.useLayoutEffect : react__WEBPACK_IMPORTED_MODULE_0__.useEffect;



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-media-query/use-media-query.mjs"
/*!*********************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-media-query/use-media-query.mjs ***!
  \*********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useMediaQuery: () => (/* binding */ useMediaQuery)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function getInitialValue(query, initialValue) {
  if (typeof initialValue === "boolean") return initialValue;
  if (typeof window !== "undefined" && "matchMedia" in window) return window.matchMedia(query).matches;
  return false;
}
function useMediaQuery(query, initialValue, { getInitialValueInEffect } = { getInitialValueInEffect: true }) {
  const [matches, setMatches] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(getInitialValueInEffect ? initialValue : getInitialValue(query));
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
    try {
      if ("matchMedia" in window) {
        const mediaQuery = window.matchMedia(query);
        setMatches(mediaQuery.matches);
        const callback = (event) => setMatches(event.matches);
        mediaQuery.addEventListener("change", callback);
        return () => {
          mediaQuery.removeEventListener("change", callback);
        };
      }
    } catch (e) {
      return;
    }
  }, [query]);
  return matches || false;
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   assignRef: () => (/* binding */ assignRef),
/* harmony export */   useMergedRef: () => (/* binding */ useMergedRef)
/* harmony export */ });
/* unused harmony export mergeRefs */
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function assignRef(ref, value) {
  if (typeof ref === "function") return ref(value);
  else if (typeof ref === "object" && ref !== null && "current" in ref) ref.current = value;
}
function mergeRefs(...refs) {
  const cleanupMap = /* @__PURE__ */ new Map();
  return (node) => {
    refs.forEach((ref) => {
      const cleanup = assignRef(ref, node);
      if (cleanup) cleanupMap.set(ref, cleanup);
    });
    if (cleanupMap.size > 0) return () => {
      refs.forEach((ref) => {
        const cleanup = cleanupMap.get(ref);
        if (cleanup && typeof cleanup === "function") cleanup();
        else assignRef(ref, null);
      });
      cleanupMap.clear();
    };
  };
}
function useMergedRef(...refs) {
  return (0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)(mergeRefs(...refs), refs);
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-mounted/use-mounted.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-mounted/use-mounted.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useMounted: () => (/* binding */ useMounted)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function useMounted() {
  const [mounted, setMounted] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(false);
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => setMounted(true), []);
  return mounted;
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-mutation-observer/use-mutation-observer.mjs"
/*!*********************************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-mutation-observer/use-mutation-observer.mjs ***!
  \*********************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useMutationObserverTarget: () => (/* binding */ useMutationObserverTarget)
/* harmony export */ });
/* unused harmony export useMutationObserver */
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function useMutationObserver(callback, options) {
  const observer = (0,react__WEBPACK_IMPORTED_MODULE_0__.useRef)(null);
  return (0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)((node) => {
    if (observer.current) {
      observer.current.disconnect();
      observer.current = null;
    }
    if (node) {
      observer.current = new MutationObserver(callback);
      observer.current.observe(node, options);
    }
    return () => {
      if (observer.current) {
        observer.current.disconnect();
        observer.current = null;
      }
    };
  }, [callback, options]);
}
function useMutationObserverTarget(callback, options, target) {
  const observer = (0,react__WEBPACK_IMPORTED_MODULE_0__.useRef)(null);
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
    if (observer.current) {
      observer.current.disconnect();
      observer.current = null;
    }
    const targetElement = typeof target === "function" ? target() : target;
    if (targetElement) {
      observer.current = new MutationObserver(callback);
      observer.current.observe(targetElement, options);
    }
    return () => {
      if (observer.current) {
        observer.current.disconnect();
        observer.current = null;
      }
    };
  }, [
    callback,
    options,
    target
  ]);
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-reduced-motion/use-reduced-motion.mjs"
/*!***************************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-reduced-motion/use-reduced-motion.mjs ***!
  \***************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useReducedMotion: () => (/* binding */ useReducedMotion)
/* harmony export */ });
/* harmony import */ var _use_media_query_use_media_query_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../use-media-query/use-media-query.mjs */ "../../node_modules/@mantine/hooks/esm/use-media-query/use-media-query.mjs");
"use client";

function useReducedMotion(initialValue, options) {
  return (0,_use_media_query_use_media_query_mjs__WEBPACK_IMPORTED_MODULE_0__.useMediaQuery)("(prefers-reduced-motion: reduce)", initialValue, options);
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-resize-observer/use-resize-observer.mjs"
/*!*****************************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-resize-observer/use-resize-observer.mjs ***!
  \*****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useResizeObserver: () => (/* binding */ useResizeObserver)
/* harmony export */ });
/* unused harmony export useElementSize */
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

const defaultState = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0
};
function useResizeObserver(options) {
  const frameID = (0,react__WEBPACK_IMPORTED_MODULE_0__.useRef)(0);
  const [rect, setRect] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(defaultState);
  const observerRef = (0,react__WEBPACK_IMPORTED_MODULE_0__.useRef)(null);
  return [(0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (frameID.current) cancelAnimationFrame(frameID.current);
    if (!node) return;
    observerRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        cancelAnimationFrame(frameID.current);
        frameID.current = requestAnimationFrame(() => {
          var _a, _b;
          const boxSize = ((_a = entry.borderBoxSize) == null ? void 0 : _a[0]) || ((_b = entry.contentBoxSize) == null ? void 0 : _b[0]);
          if (boxSize) {
            const width = boxSize.inlineSize;
            const height = boxSize.blockSize;
            setRect({
              width,
              height,
              x: entry.contentRect.x,
              y: entry.contentRect.y,
              top: entry.contentRect.top,
              left: entry.contentRect.left,
              bottom: entry.contentRect.bottom,
              right: entry.contentRect.right
            });
          } else setRect(entry.contentRect);
        });
      }
    });
    observerRef.current.observe(node, options);
  }, [options]), rect];
}
function useElementSize(options) {
  const [ref, { width, height }] = useResizeObserver(options);
  return {
    ref,
    width,
    height
  };
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-shallow-effect/use-shallow-effect.mjs"
/*!***************************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-shallow-effect/use-shallow-effect.mjs ***!
  \***************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useShallowEffect: () => (/* binding */ useShallowEffect)
/* harmony export */ });
/* harmony import */ var _utils_shallow_equal_shallow_equal_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/shallow-equal/shallow-equal.mjs */ "../../node_modules/@mantine/hooks/esm/utils/shallow-equal/shallow-equal.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
"use client";


function shallowCompare(prevValue, currValue) {
  if (!prevValue || !currValue) return false;
  if (prevValue === currValue) return true;
  if (prevValue.length !== currValue.length) return false;
  for (let i = 0; i < prevValue.length; i += 1) if (!(0,_utils_shallow_equal_shallow_equal_mjs__WEBPACK_IMPORTED_MODULE_0__.shallowEqual)(prevValue[i], currValue[i])) return false;
  return true;
}
function useShallowCompare(dependencies) {
  const ref = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)([]);
  const updateRef = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(0);
  if (!shallowCompare(ref.current, dependencies)) {
    ref.current = dependencies;
    updateRef.current += 1;
  }
  return [updateRef.current];
}
function useShallowEffect(cb, dependencies) {
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(cb, useShallowCompare(dependencies));
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-timeout/use-timeout.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-timeout/use-timeout.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useTimeout: () => (/* binding */ useTimeout)
/* harmony export */ });
/* harmony import */ var _utils_use_callback_ref_use_callback_ref_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/use-callback-ref/use-callback-ref.mjs */ "../../node_modules/@mantine/hooks/esm/utils/use-callback-ref/use-callback-ref.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
"use client";


function useTimeout(callback, delay, options = { autoInvoke: false }) {
  const timeoutRef = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(null);
  const handleCallback = (0,_utils_use_callback_ref_use_callback_ref_mjs__WEBPACK_IMPORTED_MODULE_0__.useCallbackRef)(callback);
  const start = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)((...args) => {
    if (!timeoutRef.current) timeoutRef.current = window.setTimeout(() => {
      handleCallback(...args);
      timeoutRef.current = null;
    }, delay);
  }, [delay]);
  const clear = (0,react__WEBPACK_IMPORTED_MODULE_1__.useCallback)(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    if (options.autoInvoke) start();
    return clear;
  }, [clear, start]);
  return {
    start,
    clear
  };
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-uncontrolled/use-uncontrolled.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-uncontrolled/use-uncontrolled.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useUncontrolled: () => (/* binding */ useUncontrolled)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function useUncontrolled({ value, defaultValue, finalValue, onChange = () => {
} }) {
  const [uncontrolledValue, setUncontrolledValue] = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(defaultValue !== void 0 ? defaultValue : finalValue);
  const handleUncontrolledChange = (val, ...payload) => {
    setUncontrolledValue(val);
    onChange == null ? void 0 : onChange(val, ...payload);
  };
  if (value !== void 0) return [
    value,
    onChange,
    true
  ];
  return [
    uncontrolledValue,
    handleUncontrolledChange,
    false
  ];
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/use-window-event/use-window-event.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/use-window-event/use-window-event.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useWindowEvent: () => (/* binding */ useWindowEvent)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function useWindowEvent(type, listener, options) {
  const stableListener = (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffectEvent)(listener);
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
    window.addEventListener(type, stableListener, options);
    return () => window.removeEventListener(type, stableListener, options);
  }, [type]);
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/utils/random-id/random-id.mjs"
/*!***************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/utils/random-id/random-id.mjs ***!
  \***************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   randomId: () => (/* binding */ randomId)
/* harmony export */ });
"use client";
function randomId(prefix = "mantine-") {
  return `${prefix}${Math.random().toString(36).slice(2, 11)}`;
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/utils/shallow-equal/shallow-equal.mjs"
/*!***********************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/utils/shallow-equal/shallow-equal.mjs ***!
  \***********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   shallowEqual: () => (/* binding */ shallowEqual)
/* harmony export */ });
"use client";
function shallowEqual(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (!(a instanceof Object) || !(b instanceof Object)) return false;
  const keys = Object.keys(a);
  const { length } = keys;
  if (length !== Object.keys(b).length) return false;
  for (let i = 0; i < length; i += 1) {
    const key = keys[i];
    if (!(key in b)) return false;
    if (a[key] !== b[key] && !(Number.isNaN(a[key]) && Number.isNaN(b[key]))) return false;
  }
  return true;
}



/***/ },

/***/ "../../node_modules/@mantine/hooks/esm/utils/use-callback-ref/use-callback-ref.mjs"
/*!*****************************************************************************************!*\
  !*** ../../node_modules/@mantine/hooks/esm/utils/use-callback-ref/use-callback-ref.mjs ***!
  \*****************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useCallbackRef: () => (/* binding */ useCallbackRef)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function useCallbackRef(callback) {
  const callbackRef = (0,react__WEBPACK_IMPORTED_MODULE_0__.useRef)(callback);
  (0,react__WEBPACK_IMPORTED_MODULE_0__.useEffect)(() => {
    callbackRef.current = callback;
  });
  return (0,react__WEBPACK_IMPORTED_MODULE_0__.useMemo)(() => ((...args) => {
    var _a;
    return (_a = callbackRef.current) == null ? void 0 : _a.call(callbackRef, ...args);
  }), []);
}



/***/ },

/***/ "../../node_modules/@mantine/notifications/esm/NotificationContainer.mjs"
/*!*******************************************************************************!*\
  !*** ../../node_modules/@mantine/notifications/esm/NotificationContainer.mjs ***!
  \*******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   NotificationContainer: () => (/* binding */ NotificationContainer)
/* harmony export */ });
/* harmony import */ var _get_auto_close_get_auto_close_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./get-auto-close/get-auto-close.mjs */ "../../node_modules/@mantine/notifications/esm/get-auto-close/get-auto-close.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/components/Notification/Notification.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";




function NotificationContainer({ data, onHide, autoClose, paused, onHoverStart, onHoverEnd, ...others }) {
  const { autoClose: _autoClose, message, onOpen: _onOpen, ...notificationProps } = data;
  const autoCloseDuration = (0,_get_auto_close_get_auto_close_mjs__WEBPACK_IMPORTED_MODULE_0__.getAutoClose)(autoClose, data.autoClose);
  const autoCloseTimeout = (0,react__WEBPACK_IMPORTED_MODULE_1__.useRef)(-1);
  const [hovered, setHovered] = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false);
  const cancelAutoClose = () => window.clearTimeout(autoCloseTimeout.current);
  const handleHide = () => {
    onHide(data.id);
    cancelAutoClose();
  };
  const handleAutoClose = () => {
    cancelAutoClose();
    if (typeof autoCloseDuration === "number") autoCloseTimeout.current = window.setTimeout(handleHide, autoCloseDuration);
  };
  const handleMouseEnter = () => {
    setHovered(true);
    onHoverStart == null ? void 0 : onHoverStart();
  };
  const handleMouseLeave = () => {
    setHovered(false);
    onHoverEnd == null ? void 0 : onHoverEnd();
  };
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    var _a;
    (_a = data.onOpen) == null ? void 0 : _a.call(data, data);
  }, []);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    handleAutoClose();
    return cancelAutoClose;
  }, [autoCloseDuration]);
  (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(() => {
    if (paused || hovered) cancelAutoClose();
    else handleAutoClose();
    return cancelAutoClose;
  }, [paused, hovered]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_3__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_2__.Notification, {
    ...others,
    ...notificationProps,
    onClose: handleHide,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    children: message
  });
}
NotificationContainer.displayName = "@mantine/notifications/NotificationContainer";



/***/ },

/***/ "../../node_modules/@mantine/notifications/esm/Notifications.mjs"
/*!***********************************************************************!*\
  !*** ../../node_modules/@mantine/notifications/esm/Notifications.mjs ***!
  \***********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Notifications: () => (/* binding */ Notifications)
/* harmony export */ });
/* harmony import */ var _notifications_store_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./notifications.store.mjs */ "../../node_modules/@mantine/notifications/esm/notifications.store.mjs");
/* harmony import */ var _get_grouped_notifications_get_grouped_notifications_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./get-grouped-notifications/get-grouped-notifications.mjs */ "../../node_modules/@mantine/notifications/esm/get-grouped-notifications/get-grouped-notifications.mjs");
/* harmony import */ var _get_notification_state_styles_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./get-notification-state-styles.mjs */ "../../node_modules/@mantine/notifications/esm/get-notification-state-styles.mjs");
/* harmony import */ var _NotificationContainer_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./NotificationContainer.mjs */ "../../node_modules/@mantine/notifications/esm/NotificationContainer.mjs");
/* harmony import */ var _Notifications_module_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./Notifications.module.mjs */ "../../node_modules/@mantine/notifications/esm/Notifications.module.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-did-update/use-did-update.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-force-update/use-force-update.mjs");
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/use-reduced-motion/use-reduced-motion.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_8___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_8__);
/* harmony import */ var react_transition_group__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! react-transition-group */ "../../node_modules/react-transition-group/esm/TransitionGroup.js");
/* harmony import */ var react_transition_group__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! react-transition-group */ "../../node_modules/react-transition-group/esm/Transition.js");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/react-remove-scroll/dist/es2015/Combination.js");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/utils/units-converters/rem.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/utils/get-default-z-index/get-default-z-index.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/styles-api/create-vars-resolver/create-vars-resolver.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineThemeProvider/MantineThemeProvider.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/MantineProvider/use-props/use-props.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_17__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/styles-api/use-styles/use-styles.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_18__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/factory/factory.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_19__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/Box/Box.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_20__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/components/Portal/OptionalPortal.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
"use client";










const Transition$1 = react_transition_group__WEBPACK_IMPORTED_MODULE_10__["default"];
const defaultProps = {
  position: "bottom-right",
  autoClose: 4e3,
  transitionDuration: 250,
  containerWidth: 440,
  notificationMaxHeight: 200,
  limit: 5,
  zIndex: (0,_mantine_core__WEBPACK_IMPORTED_MODULE_13__.getDefaultZIndex)("overlay"),
  store: _notifications_store_mjs__WEBPACK_IMPORTED_MODULE_0__.notificationsStore,
  withinPortal: true,
  pauseResetOnHover: "all"
};
const varsResolver = (0,_mantine_core__WEBPACK_IMPORTED_MODULE_14__.createVarsResolver)((_, { zIndex, containerWidth }) => ({ root: {
  "--notifications-z-index": zIndex == null ? void 0 : zIndex.toString(),
  "--notifications-container-width": (0,_mantine_core__WEBPACK_IMPORTED_MODULE_12__.rem)(containerWidth)
} }));
const Notifications = (0,_mantine_core__WEBPACK_IMPORTED_MODULE_18__.factory)((_props) => {
  const props = (0,_mantine_core__WEBPACK_IMPORTED_MODULE_16__.useProps)("Notifications", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, vars, attributes, position, autoClose, transitionDuration, containerWidth, notificationMaxHeight, limit, zIndex, store, portalProps, withinPortal, pauseResetOnHover, ...others } = props;
  const theme = (0,_mantine_core__WEBPACK_IMPORTED_MODULE_15__.useMantineTheme)();
  const data = (0,_notifications_store_mjs__WEBPACK_IMPORTED_MODULE_0__.useNotifications)(store);
  const forceUpdate = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_6__.useForceUpdate)();
  const shouldReduceMotion = (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_7__.useReducedMotion)();
  const refs = (0,react__WEBPACK_IMPORTED_MODULE_8__.useRef)({});
  const previousLength = (0,react__WEBPACK_IMPORTED_MODULE_8__.useRef)(0);
  const [hoveredCount, setHoveredCount] = (0,react__WEBPACK_IMPORTED_MODULE_8__.useState)(0);
  const handleHoverStart = (0,react__WEBPACK_IMPORTED_MODULE_8__.useCallback)(() => setHoveredCount((c) => c + 1), []);
  const handleHoverEnd = (0,react__WEBPACK_IMPORTED_MODULE_8__.useCallback)(() => setHoveredCount((c) => Math.max(0, c - 1)), []);
  const duration = (theme.respectReducedMotion ? shouldReduceMotion : false) ? 1 : transitionDuration;
  const getStyles = (0,_mantine_core__WEBPACK_IMPORTED_MODULE_17__.useStyles)({
    name: "Notifications",
    classes: _Notifications_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"],
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
    varsResolver
  });
  (0,react__WEBPACK_IMPORTED_MODULE_8__.useEffect)(() => {
    store == null ? void 0 : store.updateState((current) => ({
      ...current,
      limit: limit || 5,
      defaultPosition: position
    }));
  }, [limit, position]);
  (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_5__.useDidUpdate)(() => {
    if (data.notifications.length > previousLength.current) setTimeout(() => forceUpdate(), 0);
    previousLength.current = data.notifications.length;
  }, [data.notifications]);
  const grouped = (0,_get_grouped_notifications_get_grouped_notifications_mjs__WEBPACK_IMPORTED_MODULE_1__.getGroupedNotifications)(data.notifications, position);
  const groupedComponents = _get_grouped_notifications_get_grouped_notifications_mjs__WEBPACK_IMPORTED_MODULE_1__.positions.reduce((acc, pos) => {
    acc[pos] = grouped[pos].map(({ style: notificationStyle, ...notification }) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(Transition$1, {
      timeout: duration,
      onEnter: () => refs.current[notification.id].offsetHeight,
      nodeRef: { current: refs.current[notification.id] },
      children: (state) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(_NotificationContainer_mjs__WEBPACK_IMPORTED_MODULE_3__.NotificationContainer, {
        ref: (node) => {
          if (node) refs.current[notification.id] = node;
        },
        data: notification,
        onHide: (id) => (0,_notifications_store_mjs__WEBPACK_IMPORTED_MODULE_0__.hideNotification)(id, store),
        autoClose,
        paused: pauseResetOnHover === "all" ? hoveredCount > 0 : false,
        onHoverStart: handleHoverStart,
        onHoverEnd: handleHoverEnd,
        ...getStyles("notification", { style: {
          ...(0,_get_notification_state_styles_mjs__WEBPACK_IMPORTED_MODULE_2__.getNotificationStateStyles)({
            state,
            position: pos,
            transitionDuration: duration,
            maxHeight: notificationMaxHeight
          }),
          ...notificationStyle
        } })
      })
    }, notification.id));
    return acc;
  }, {});
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsxs)(_mantine_core__WEBPACK_IMPORTED_MODULE_20__.OptionalPortal, {
    withinPortal,
    ...portalProps,
    children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_19__.Box, {
        ...getStyles("root"),
        "data-position": "top-center",
        ...others,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(react_transition_group__WEBPACK_IMPORTED_MODULE_9__["default"], { children: groupedComponents["top-center"] })
      }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_19__.Box, {
        ...getStyles("root"),
        "data-position": "top-left",
        ...others,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(react_transition_group__WEBPACK_IMPORTED_MODULE_9__["default"], { children: groupedComponents["top-left"] })
      }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_19__.Box, {
        ...getStyles("root", { className: _mantine_core__WEBPACK_IMPORTED_MODULE_11__["default"].classNames.fullWidth }),
        "data-position": "top-right",
        ...others,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(react_transition_group__WEBPACK_IMPORTED_MODULE_9__["default"], { children: groupedComponents["top-right"] })
      }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_19__.Box, {
        ...getStyles("root", { className: _mantine_core__WEBPACK_IMPORTED_MODULE_11__["default"].classNames.fullWidth }),
        "data-position": "bottom-right",
        ...others,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(react_transition_group__WEBPACK_IMPORTED_MODULE_9__["default"], { children: groupedComponents["bottom-right"] })
      }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_19__.Box, {
        ...getStyles("root"),
        "data-position": "bottom-left",
        ...others,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(react_transition_group__WEBPACK_IMPORTED_MODULE_9__["default"], { children: groupedComponents["bottom-left"] })
      }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_19__.Box, {
        ...getStyles("root"),
        "data-position": "bottom-center",
        ...others,
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_21__.jsx)(react_transition_group__WEBPACK_IMPORTED_MODULE_9__["default"], { children: groupedComponents["bottom-center"] })
      })
    ]
  });
});
Notifications.classes = _Notifications_module_mjs__WEBPACK_IMPORTED_MODULE_4__["default"];
Notifications.varsResolver = varsResolver;
Notifications.displayName = "@mantine/notifications/Notifications";
Notifications.show = _notifications_store_mjs__WEBPACK_IMPORTED_MODULE_0__.notifications.show;
Notifications.hide = _notifications_store_mjs__WEBPACK_IMPORTED_MODULE_0__.notifications.hide;
Notifications.update = _notifications_store_mjs__WEBPACK_IMPORTED_MODULE_0__.notifications.update;
Notifications.clean = _notifications_store_mjs__WEBPACK_IMPORTED_MODULE_0__.notifications.clean;
Notifications.cleanQueue = _notifications_store_mjs__WEBPACK_IMPORTED_MODULE_0__.notifications.cleanQueue;
Notifications.updateState = _notifications_store_mjs__WEBPACK_IMPORTED_MODULE_0__.notifications.updateState;



/***/ },

/***/ "../../node_modules/@mantine/notifications/esm/Notifications.module.mjs"
/*!******************************************************************************!*\
  !*** ../../node_modules/@mantine/notifications/esm/Notifications.module.mjs ***!
  \******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Notifications_module_default)
/* harmony export */ });
"use client";
var Notifications_module_default = {
  "root": "m_b37d9ac7",
  "notification": "m_5ed0edd0"
};



/***/ },

/***/ "../../node_modules/@mantine/notifications/esm/get-auto-close/get-auto-close.mjs"
/*!***************************************************************************************!*\
  !*** ../../node_modules/@mantine/notifications/esm/get-auto-close/get-auto-close.mjs ***!
  \***************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getAutoClose: () => (/* binding */ getAutoClose)
/* harmony export */ });
"use client";
function getAutoClose(autoClose, notificationAutoClose) {
  if (typeof notificationAutoClose === "number") return notificationAutoClose;
  if (notificationAutoClose === false || autoClose === false) return false;
  return autoClose;
}



/***/ },

/***/ "../../node_modules/@mantine/notifications/esm/get-grouped-notifications/get-grouped-notifications.mjs"
/*!*************************************************************************************************************!*\
  !*** ../../node_modules/@mantine/notifications/esm/get-grouped-notifications/get-grouped-notifications.mjs ***!
  \*************************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getGroupedNotifications: () => (/* binding */ getGroupedNotifications),
/* harmony export */   positions: () => (/* binding */ positions)
/* harmony export */ });
"use client";
const positions = [
  "bottom-center",
  "bottom-left",
  "bottom-right",
  "top-center",
  "top-left",
  "top-right"
];
function getGroupedNotifications(notifications, defaultPosition) {
  return notifications.reduce((acc, notification) => {
    acc[notification.position || defaultPosition].push(notification);
    return acc;
  }, positions.reduce((acc, item) => {
    acc[item] = [];
    return acc;
  }, {}));
}



/***/ },

/***/ "../../node_modules/@mantine/notifications/esm/get-notification-state-styles.mjs"
/*!***************************************************************************************!*\
  !*** ../../node_modules/@mantine/notifications/esm/get-notification-state-styles.mjs ***!
  \***************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getNotificationStateStyles: () => (/* binding */ getNotificationStateStyles)
/* harmony export */ });
"use client";
const transforms = {
  left: "translateX(-100%)",
  right: "translateX(100%)",
  "top-center": "translateY(-100%)",
  "bottom-center": "translateY(100%)"
};
const noTransform = {
  left: "translateX(0)",
  right: "translateX(0)",
  "top-center": "translateY(0)",
  "bottom-center": "translateY(0)"
};
function getNotificationStateStyles({ state, maxHeight, position, transitionDuration }) {
  const [vertical, horizontal] = position.split("-");
  const property = horizontal === "center" ? `${vertical}-center` : horizontal;
  const commonStyles = {
    opacity: 0,
    maxHeight,
    transform: transforms[property],
    transitionDuration: `${transitionDuration}ms, ${transitionDuration}ms, ${transitionDuration}ms`,
    transitionTimingFunction: "cubic-bezier(.51,.3,0,1.21), cubic-bezier(.51,.3,0,1.21), linear",
    transitionProperty: "opacity, transform, max-height"
  };
  const inState = {
    opacity: 1,
    transform: noTransform[property]
  };
  const outState = {
    opacity: 0,
    maxHeight: 0,
    transform: transforms[property]
  };
  const transitionStyles = {
    entering: inState,
    entered: inState,
    exiting: outState,
    exited: outState
  };
  return {
    ...commonStyles,
    ...transitionStyles[state]
  };
}



/***/ },

/***/ "../../node_modules/@mantine/notifications/esm/notifications.store.mjs"
/*!*****************************************************************************!*\
  !*** ../../node_modules/@mantine/notifications/esm/notifications.store.mjs ***!
  \*****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   hideNotification: () => (/* binding */ hideNotification),
/* harmony export */   notifications: () => (/* binding */ notifications),
/* harmony export */   notificationsStore: () => (/* binding */ notificationsStore),
/* harmony export */   useNotifications: () => (/* binding */ useNotifications)
/* harmony export */ });
/* unused harmony exports cleanNotifications, cleanNotificationsQueue, createNotificationsStore, showNotification, updateNotification, updateNotificationsState */
/* harmony import */ var _mantine_hooks__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @mantine/hooks */ "../../node_modules/@mantine/hooks/esm/utils/random-id/random-id.mjs");
/* harmony import */ var _mantine_store__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @mantine/store */ "../../node_modules/@mantine/store/esm/store.mjs");
"use client";


function getDistributedNotifications(data, defaultPosition, limit) {
  const queue = [];
  const notifications2 = [];
  const count = {};
  for (const item of data) {
    const position = item.position || defaultPosition;
    count[position] = count[position] || 0;
    count[position] += 1;
    if (count[position] <= limit) notifications2.push(item);
    else queue.push(item);
  }
  return {
    notifications: notifications2,
    queue
  };
}
const createNotificationsStore = () => (0,_mantine_store__WEBPACK_IMPORTED_MODULE_1__.createStore)({
  notifications: [],
  queue: [],
  defaultPosition: "bottom-right",
  limit: 5
});
const notificationsStore = createNotificationsStore();
const useNotifications = (store = notificationsStore) => (0,_mantine_store__WEBPACK_IMPORTED_MODULE_1__.useStore)(store);
function updateNotificationsState(store, update) {
  const state = store.getState();
  const updated = getDistributedNotifications(update([...state.notifications, ...state.queue]), state.defaultPosition, state.limit);
  store.setState({
    notifications: updated.notifications,
    queue: updated.queue,
    limit: state.limit,
    defaultPosition: state.defaultPosition
  });
}
function showNotification(notification, store = notificationsStore) {
  const id = notification.id || (0,_mantine_hooks__WEBPACK_IMPORTED_MODULE_0__.randomId)();
  updateNotificationsState(store, (notifications2) => {
    if (notification.id && notifications2.some((n) => n.id === notification.id)) return notifications2;
    return [...notifications2, {
      ...notification,
      id
    }];
  });
  return id;
}
function hideNotification(id, store = notificationsStore) {
  updateNotificationsState(store, (notifications2) => notifications2.filter((notification) => {
    var _a;
    if (notification.id === id) {
      (_a = notification.onClose) == null ? void 0 : _a.call(notification, notification);
      return false;
    }
    return true;
  }));
  return id;
}
function updateNotification(notification, store = notificationsStore) {
  updateNotificationsState(store, (notifications2) => notifications2.map((item) => {
    if (item.id === notification.id) return {
      ...item,
      ...notification
    };
    return item;
  }));
  return notification.id;
}
function cleanNotifications(store = notificationsStore) {
  updateNotificationsState(store, () => []);
}
function cleanNotificationsQueue(store = notificationsStore) {
  updateNotificationsState(store, (notifications2) => notifications2.slice(0, store.getState().limit));
}
const notifications = {
  show: showNotification,
  hide: hideNotification,
  update: updateNotification,
  clean: cleanNotifications,
  cleanQueue: cleanNotificationsQueue,
  updateState: updateNotificationsState
};



/***/ },

/***/ "../../node_modules/@mantine/store/esm/store.mjs"
/*!*******************************************************!*\
  !*** ../../node_modules/@mantine/store/esm/store.mjs ***!
  \*******************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createStore: () => (/* binding */ createStore),
/* harmony export */   useStore: () => (/* binding */ useStore)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
"use client";

function createStore(initialState) {
  let state = initialState;
  let initialized = false;
  const listeners = /* @__PURE__ */ new Set();
  return {
    getState() {
      return state;
    },
    updateState(value) {
      state = typeof value === "function" ? value(state) : value;
    },
    setState(value) {
      this.updateState(value);
      listeners.forEach((listener) => listener(state));
    },
    initialize(value) {
      if (!initialized) {
        state = value;
        initialized = true;
      }
    },
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  };
}
function useStore(store) {
  return (0,react__WEBPACK_IMPORTED_MODULE_0__.useSyncExternalStore)(store.subscribe, () => store.getState(), () => store.getState());
}



/***/ }

}]);