!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"970d75aa8607cff89eb0648ee23d6fafc2d8eca2"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="4e49ced0-8c79-49cc-b8f7-333b35daa1dc",e._sentryDebugIdIdentifier="sentry-dbid-4e49ced0-8c79-49cc-b8f7-333b35daa1dc");}catch(e){}}();
"use strict";
(self["webpackChunk_hydrooj_ui_default"] = self["webpackChunk_hydrooj_ui_default"] || []).push([["n.floating-ui"],{

/***/ "../../node_modules/@floating-ui/core/dist/floating-ui.core.mjs"
/*!**********************************************************************!*\
  !*** ../../node_modules/@floating-ui/core/dist/floating-ui.core.mjs ***!
  \**********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   arrow: () => (/* binding */ arrow),
/* harmony export */   autoPlacement: () => (/* binding */ autoPlacement),
/* harmony export */   computePosition: () => (/* binding */ computePosition),
/* harmony export */   detectOverflow: () => (/* binding */ detectOverflow),
/* harmony export */   flip: () => (/* binding */ flip),
/* harmony export */   hide: () => (/* binding */ hide),
/* harmony export */   inline: () => (/* binding */ inline),
/* harmony export */   limitShift: () => (/* binding */ limitShift),
/* harmony export */   offset: () => (/* binding */ offset),
/* harmony export */   shift: () => (/* binding */ shift),
/* harmony export */   size: () => (/* binding */ size)
/* harmony export */ });
/* harmony import */ var _floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @floating-ui/utils */ "../../node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs");


function computeCoordsFromPlacement(_ref, placement, rtl) {
  let {
    reference,
    floating
  } = _ref;
  const sideAxis = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSideAxis)(placement);
  const alignmentAxis = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignmentAxis)(placement);
  const alignLength = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAxisLength)(alignmentAxis);
  const side = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(placement);
  const isVertical = sideAxis === "y";
  const commonX = reference.x + reference.width / 2 - floating.width / 2;
  const commonY = reference.y + reference.height / 2 - floating.height / 2;
  const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
  let coords;
  switch (side) {
    case "top":
      coords = {
        x: commonX,
        y: reference.y - floating.height
      };
      break;
    case "bottom":
      coords = {
        x: commonX,
        y: reference.y + reference.height
      };
      break;
    case "right":
      coords = {
        x: reference.x + reference.width,
        y: commonY
      };
      break;
    case "left":
      coords = {
        x: reference.x - floating.width,
        y: commonY
      };
      break;
    default:
      coords = {
        x: reference.x,
        y: reference.y
      };
  }
  switch ((0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignment)(placement)) {
    case "start":
      coords[alignmentAxis] -= commonAlign * (rtl && isVertical ? -1 : 1);
      break;
    case "end":
      coords[alignmentAxis] += commonAlign * (rtl && isVertical ? -1 : 1);
      break;
  }
  return coords;
}
async function detectOverflow(state, options) {
  var _await$platform$isEle;
  if (options === void 0) {
    options = {};
  }
  const {
    x,
    y,
    platform,
    rects,
    elements,
    strategy
  } = state;
  const {
    boundary = "clippingAncestors",
    rootBoundary = "viewport",
    elementContext = "floating",
    altBoundary = false,
    padding = 0
  } = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(options, state);
  const paddingObject = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getPaddingObject)(padding);
  const altContext = elementContext === "floating" ? "reference" : "floating";
  const element = elements[altBoundary ? altContext : elementContext];
  const clippingClientRect = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.rectToClientRect)(await platform.getClippingRect({
    element: ((_await$platform$isEle = await (platform.isElement == null ? void 0 : platform.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform.getDocumentElement == null ? void 0 : platform.getDocumentElement(elements.floating)),
    boundary,
    rootBoundary,
    strategy
  }));
  const rect = elementContext === "floating" ? {
    x,
    y,
    width: rects.floating.width,
    height: rects.floating.height
  } : rects.reference;
  const offsetParent = await (platform.getOffsetParent == null ? void 0 : platform.getOffsetParent(elements.floating));
  const offsetScale = await (platform.isElement == null ? void 0 : platform.isElement(offsetParent)) ? await (platform.getScale == null ? void 0 : platform.getScale(offsetParent)) || {
    x: 1,
    y: 1
  } : {
    x: 1,
    y: 1
  };
  const elementClientRect = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.rectToClientRect)(platform.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements,
    rect,
    offsetParent,
    strategy
  }) : rect);
  return {
    top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
    bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
    left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
    right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
  };
}
const MAX_RESET_COUNT = 50;
const computePosition = async (reference, floating, config) => {
  const {
    placement = "bottom",
    strategy = "absolute",
    middleware = [],
    platform
  } = config;
  const platformWithDetectOverflow = platform.detectOverflow ? platform : {
    ...platform,
    detectOverflow
  };
  const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(floating));
  let rects = await platform.getElementRects({
    reference,
    floating,
    strategy
  });
  let {
    x,
    y
  } = computeCoordsFromPlacement(rects, placement, rtl);
  let statefulPlacement = placement;
  let resetCount = 0;
  const middlewareData = {};
  for (let i = 0; i < middleware.length; i++) {
    const currentMiddleware = middleware[i];
    if (!currentMiddleware) {
      continue;
    }
    const {
      name,
      fn
    } = currentMiddleware;
    const {
      x: nextX,
      y: nextY,
      data,
      reset
    } = await fn({
      x,
      y,
      initialPlacement: placement,
      placement: statefulPlacement,
      strategy,
      middlewareData,
      rects,
      platform: platformWithDetectOverflow,
      elements: {
        reference,
        floating
      }
    });
    x = nextX != null ? nextX : x;
    y = nextY != null ? nextY : y;
    middlewareData[name] = {
      ...middlewareData[name],
      ...data
    };
    if (reset && resetCount < MAX_RESET_COUNT) {
      resetCount++;
      if (typeof reset === "object") {
        if (reset.placement) {
          statefulPlacement = reset.placement;
        }
        if (reset.rects) {
          rects = reset.rects === true ? await platform.getElementRects({
            reference,
            floating,
            strategy
          }) : reset.rects;
        }
        ({
          x,
          y
        } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
      }
      i = -1;
    }
  }
  return {
    x,
    y,
    placement: statefulPlacement,
    strategy,
    middlewareData
  };
};
const arrow = (options) => ({
  name: "arrow",
  options,
  async fn(state) {
    const {
      x,
      y,
      placement,
      rects,
      platform,
      elements,
      middlewareData
    } = state;
    const {
      element,
      padding = 0
    } = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(options, state) || {};
    if (element == null) {
      return {};
    }
    const paddingObject = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getPaddingObject)(padding);
    const coords = {
      x,
      y
    };
    const axis = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignmentAxis)(placement);
    const length = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAxisLength)(axis);
    const arrowDimensions = await platform.getDimensions(element);
    const isYAxis = axis === "y";
    const minProp = isYAxis ? "top" : "left";
    const maxProp = isYAxis ? "bottom" : "right";
    const clientProp = isYAxis ? "clientHeight" : "clientWidth";
    const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
    const startDiff = coords[axis] - rects.reference[axis];
    const arrowOffsetParent = await (platform.getOffsetParent == null ? void 0 : platform.getOffsetParent(element));
    let clientSize = arrowOffsetParent ? arrowOffsetParent[clientProp] : 0;
    if (!clientSize || !await (platform.isElement == null ? void 0 : platform.isElement(arrowOffsetParent))) {
      clientSize = elements.floating[clientProp] || rects.floating[length];
    }
    const centerToReference = endDiff / 2 - startDiff / 2;
    const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
    const minPadding = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.min)(paddingObject[minProp], largestPossiblePadding);
    const maxPadding = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.min)(paddingObject[maxProp], largestPossiblePadding);
    const min$1 = minPadding;
    const max2 = clientSize - arrowDimensions[length] - maxPadding;
    const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
    const offset2 = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.clamp)(min$1, center, max2);
    const shouldAddOffset = !middlewareData.arrow && (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignment)(placement) != null && center !== offset2 && rects.reference[length] / 2 - (center < min$1 ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
    const alignmentOffset = shouldAddOffset ? center < min$1 ? center - min$1 : center - max2 : 0;
    return {
      [axis]: coords[axis] + alignmentOffset,
      data: {
        [axis]: offset2,
        centerOffset: center - offset2 - alignmentOffset,
        ...shouldAddOffset && {
          alignmentOffset
        }
      },
      reset: shouldAddOffset
    };
  }
});
function getPlacementList(alignment, autoAlignment, allowedPlacements) {
  const allowedPlacementsSortedByAlignment = alignment ? [...allowedPlacements.filter((placement) => (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignment)(placement) === alignment), ...allowedPlacements.filter((placement) => (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignment)(placement) !== alignment)] : allowedPlacements.filter((placement) => (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(placement) === placement);
  return allowedPlacementsSortedByAlignment.filter((placement) => {
    if (alignment) {
      return (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignment)(placement) === alignment || (autoAlignment ? (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getOppositeAlignmentPlacement)(placement) !== placement : false);
    }
    return true;
  });
}
const autoPlacement = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "autoPlacement",
    options,
    async fn(state) {
      var _middlewareData$autoP, _middlewareData$autoP2, _placementsThatFitOnE;
      const {
        rects,
        middlewareData,
        placement,
        platform,
        elements
      } = state;
      const {
        crossAxis = false,
        alignment,
        allowedPlacements = _floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.placements,
        autoAlignment = true,
        ...detectOverflowOptions
      } = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(options, state);
      const placements$1 = alignment !== void 0 || allowedPlacements === _floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.placements ? getPlacementList(alignment || null, autoAlignment, allowedPlacements) : allowedPlacements;
      const overflow = await platform.detectOverflow(state, detectOverflowOptions);
      const currentIndex = ((_middlewareData$autoP = middlewareData.autoPlacement) == null ? void 0 : _middlewareData$autoP.index) || 0;
      const currentPlacement = placements$1[currentIndex];
      if (currentPlacement == null) {
        return {};
      }
      const alignmentSides = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignmentSides)(currentPlacement, rects, await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating)));
      if (placement !== currentPlacement) {
        return {
          reset: {
            placement: placements$1[0]
          }
        };
      }
      const currentOverflows = [overflow[(0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(currentPlacement)], overflow[alignmentSides[0]], overflow[alignmentSides[1]]];
      const allOverflows = [...((_middlewareData$autoP2 = middlewareData.autoPlacement) == null ? void 0 : _middlewareData$autoP2.overflows) || [], {
        placement: currentPlacement,
        overflows: currentOverflows
      }];
      const nextPlacement = placements$1[currentIndex + 1];
      if (nextPlacement) {
        return {
          data: {
            index: currentIndex + 1,
            overflows: allOverflows
          },
          reset: {
            placement: nextPlacement
          }
        };
      }
      const placementsSortedByMostSpace = allOverflows.map((d) => {
        const alignment2 = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignment)(d.placement);
        return [d.placement, alignment2 && crossAxis ? (
          // Check along the mainAxis and main crossAxis side.
          d.overflows.slice(0, 2).reduce((acc, v) => acc + v, 0)
        ) : (
          // Check only the mainAxis.
          d.overflows[0]
        ), d.overflows];
      }).sort((a, b) => a[1] - b[1]);
      const placementsThatFitOnEachSide = placementsSortedByMostSpace.filter((d) => d[2].slice(
        0,
        // Aligned placements should not check their opposite crossAxis
        // side.
        (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignment)(d[0]) ? 2 : 3
      ).every((v) => v <= 0));
      const resetPlacement = ((_placementsThatFitOnE = placementsThatFitOnEachSide[0]) == null ? void 0 : _placementsThatFitOnE[0]) || placementsSortedByMostSpace[0][0];
      if (resetPlacement !== placement) {
        return {
          data: {
            index: currentIndex + 1,
            overflows: allOverflows
          },
          reset: {
            placement: resetPlacement
          }
        };
      }
      return {};
    }
  };
};
const flip = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "flip",
    options,
    async fn(state) {
      var _middlewareData$arrow, _middlewareData$flip;
      const {
        placement,
        middlewareData,
        rects,
        initialPlacement,
        platform,
        elements
      } = state;
      const {
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = true,
        fallbackPlacements: specifiedFallbackPlacements,
        fallbackStrategy = "bestFit",
        fallbackAxisSideDirection = "none",
        flipAlignment = true,
        ...detectOverflowOptions
      } = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(options, state);
      if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
        return {};
      }
      const side = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(placement);
      const initialSideAxis = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSideAxis)(initialPlacement);
      const isBasePlacement = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(initialPlacement) === initialPlacement;
      const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating));
      const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [(0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getOppositePlacement)(initialPlacement)] : (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getExpandedPlacements)(initialPlacement));
      const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
      if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) {
        fallbackPlacements.push(...(0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getOppositeAxisPlacements)(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
      }
      const placements2 = [initialPlacement, ...fallbackPlacements];
      const overflow = await platform.detectOverflow(state, detectOverflowOptions);
      const overflows = [];
      let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
      if (checkMainAxis) {
        overflows.push(overflow[side]);
      }
      if (checkCrossAxis) {
        const sides2 = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignmentSides)(placement, rects, rtl);
        overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
      }
      overflowsData = [...overflowsData, {
        placement,
        overflows
      }];
      if (!overflows.every((side2) => side2 <= 0)) {
        var _middlewareData$flip2, _overflowsData$filter;
        const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
        const nextPlacement = placements2[nextIndex];
        if (nextPlacement) {
          const ignoreCrossAxisOverflow = checkCrossAxis === "alignment" ? initialSideAxis !== (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSideAxis)(nextPlacement) : false;
          if (!ignoreCrossAxisOverflow || // We leave the current main axis only if every placement on that axis
          // overflows the main axis.
          overflowsData.every((d) => (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSideAxis)(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) {
            return {
              data: {
                index: nextIndex,
                overflows: overflowsData
              },
              reset: {
                placement: nextPlacement
              }
            };
          }
        }
        let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
        if (!resetPlacement) {
          switch (fallbackStrategy) {
            case "bestFit": {
              var _overflowsData$filter2;
              const placement2 = (_overflowsData$filter2 = overflowsData.filter((d) => {
                if (hasFallbackAxisSideDirection) {
                  const currentSideAxis = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSideAxis)(d.placement);
                  return currentSideAxis === initialSideAxis || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  currentSideAxis === "y";
                }
                return true;
              }).map((d) => [d.placement, d.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
              if (placement2) {
                resetPlacement = placement2;
              }
              break;
            }
            case "initialPlacement":
              resetPlacement = initialPlacement;
              break;
          }
        }
        if (placement !== resetPlacement) {
          return {
            reset: {
              placement: resetPlacement
            }
          };
        }
      }
      return {};
    }
  };
};
function getSideOffsets(overflow, rect) {
  return {
    top: overflow.top - rect.height,
    right: overflow.right - rect.width,
    bottom: overflow.bottom - rect.height,
    left: overflow.left - rect.width
  };
}
function isAnySideFullyClipped(overflow) {
  return _floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.sides.some((side) => overflow[side] >= 0);
}
const hide = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "hide",
    options,
    async fn(state) {
      const {
        rects,
        platform
      } = state;
      const {
        strategy = "referenceHidden",
        ...detectOverflowOptions
      } = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(options, state);
      switch (strategy) {
        case "referenceHidden": {
          const overflow = await platform.detectOverflow(state, {
            ...detectOverflowOptions,
            elementContext: "reference"
          });
          const offsets = getSideOffsets(overflow, rects.reference);
          return {
            data: {
              referenceHiddenOffsets: offsets,
              referenceHidden: isAnySideFullyClipped(offsets)
            }
          };
        }
        case "escaped": {
          const overflow = await platform.detectOverflow(state, {
            ...detectOverflowOptions,
            altBoundary: true
          });
          const offsets = getSideOffsets(overflow, rects.floating);
          return {
            data: {
              escapedOffsets: offsets,
              escaped: isAnySideFullyClipped(offsets)
            }
          };
        }
        default: {
          return {};
        }
      }
    }
  };
};
function getBoundingRect(rects) {
  const minX = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.min)(...rects.map((rect) => rect.left));
  const minY = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.min)(...rects.map((rect) => rect.top));
  const maxX = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.max)(...rects.map((rect) => rect.right));
  const maxY = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.max)(...rects.map((rect) => rect.bottom));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
function getRectsByLine(rects) {
  const sortedRects = rects.slice().sort((a, b) => a.y - b.y);
  const groups = [];
  let prevRect = null;
  for (let i = 0; i < sortedRects.length; i++) {
    const rect = sortedRects[i];
    if (!prevRect || rect.y - prevRect.y > prevRect.height / 2) {
      groups.push([rect]);
    } else {
      groups[groups.length - 1].push(rect);
    }
    prevRect = rect;
  }
  return groups.map((rect) => (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.rectToClientRect)(getBoundingRect(rect)));
}
const inline = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "inline",
    options,
    async fn(state) {
      const {
        placement,
        elements,
        rects,
        platform,
        strategy
      } = state;
      const {
        padding = 2,
        x,
        y
      } = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(options, state);
      const nativeClientRects = Array.from(await (platform.getClientRects == null ? void 0 : platform.getClientRects(elements.reference)) || []);
      const clientRects = getRectsByLine(nativeClientRects);
      const fallback = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.rectToClientRect)(getBoundingRect(nativeClientRects));
      const paddingObject = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getPaddingObject)(padding);
      function getBoundingClientRect() {
        if (clientRects.length === 2 && clientRects[0].left > clientRects[1].right && x != null && y != null) {
          return clientRects.find((rect) => x > rect.left - paddingObject.left && x < rect.right + paddingObject.right && y > rect.top - paddingObject.top && y < rect.bottom + paddingObject.bottom) || fallback;
        }
        if (clientRects.length >= 2) {
          if ((0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSideAxis)(placement) === "y") {
            const firstRect = clientRects[0];
            const lastRect = clientRects[clientRects.length - 1];
            const isTop = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(placement) === "top";
            const top2 = firstRect.top;
            const bottom2 = lastRect.bottom;
            const left2 = isTop ? firstRect.left : lastRect.left;
            const right2 = isTop ? firstRect.right : lastRect.right;
            const width2 = right2 - left2;
            const height2 = bottom2 - top2;
            return {
              top: top2,
              bottom: bottom2,
              left: left2,
              right: right2,
              width: width2,
              height: height2,
              x: left2,
              y: top2
            };
          }
          const isLeftSide = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(placement) === "left";
          const maxRight = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.max)(...clientRects.map((rect) => rect.right));
          const minLeft = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.min)(...clientRects.map((rect) => rect.left));
          const measureRects = clientRects.filter((rect) => isLeftSide ? rect.left === minLeft : rect.right === maxRight);
          const top = measureRects[0].top;
          const bottom = measureRects[measureRects.length - 1].bottom;
          const left = minLeft;
          const right = maxRight;
          const width = right - left;
          const height = bottom - top;
          return {
            top,
            bottom,
            left,
            right,
            width,
            height,
            x: left,
            y: top
          };
        }
        return fallback;
      }
      const resetRects = await platform.getElementRects({
        reference: {
          getBoundingClientRect
        },
        floating: elements.floating,
        strategy
      });
      if (rects.reference.x !== resetRects.reference.x || rects.reference.y !== resetRects.reference.y || rects.reference.width !== resetRects.reference.width || rects.reference.height !== resetRects.reference.height) {
        return {
          reset: {
            rects: resetRects
          }
        };
      }
      return {};
    }
  };
};
const originSides = /* @__PURE__ */ new Set(["left", "top"]);
async function convertValueToCoords(state, options) {
  const {
    placement,
    platform,
    elements
  } = state;
  const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating));
  const side = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(placement);
  const alignment = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignment)(placement);
  const isVertical = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSideAxis)(placement) === "y";
  const mainAxisMulti = originSides.has(side) ? -1 : 1;
  const crossAxisMulti = rtl && isVertical ? -1 : 1;
  const rawValue = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(options, state);
  let {
    mainAxis,
    crossAxis,
    alignmentAxis
  } = typeof rawValue === "number" ? {
    mainAxis: rawValue,
    crossAxis: 0,
    alignmentAxis: null
  } : {
    mainAxis: rawValue.mainAxis || 0,
    crossAxis: rawValue.crossAxis || 0,
    alignmentAxis: rawValue.alignmentAxis
  };
  if (alignment && typeof alignmentAxis === "number") {
    crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
  }
  return isVertical ? {
    x: crossAxis * crossAxisMulti,
    y: mainAxis * mainAxisMulti
  } : {
    x: mainAxis * mainAxisMulti,
    y: crossAxis * crossAxisMulti
  };
}
const offset = function(options) {
  if (options === void 0) {
    options = 0;
  }
  return {
    name: "offset",
    options,
    async fn(state) {
      var _middlewareData$offse, _middlewareData$arrow;
      const {
        x,
        y,
        placement,
        middlewareData
      } = state;
      const diffCoords = await convertValueToCoords(state, options);
      if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
        return {};
      }
      return {
        x: x + diffCoords.x,
        y: y + diffCoords.y,
        data: {
          ...diffCoords,
          placement
        }
      };
    }
  };
};
const shift = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "shift",
    options,
    async fn(state) {
      const {
        x,
        y,
        placement,
        platform
      } = state;
      const {
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = false,
        limiter = {
          fn: (_ref) => {
            let {
              x: x2,
              y: y2
            } = _ref;
            return {
              x: x2,
              y: y2
            };
          }
        },
        ...detectOverflowOptions
      } = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(options, state);
      const coords = {
        x,
        y
      };
      const overflow = await platform.detectOverflow(state, detectOverflowOptions);
      const crossAxis = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSideAxis)((0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(placement));
      const mainAxis = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getOppositeAxis)(crossAxis);
      let mainAxisCoord = coords[mainAxis];
      let crossAxisCoord = coords[crossAxis];
      if (checkMainAxis) {
        const minSide = mainAxis === "y" ? "top" : "left";
        const maxSide = mainAxis === "y" ? "bottom" : "right";
        const min2 = mainAxisCoord + overflow[minSide];
        const max2 = mainAxisCoord - overflow[maxSide];
        mainAxisCoord = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.clamp)(min2, mainAxisCoord, max2);
      }
      if (checkCrossAxis) {
        const minSide = crossAxis === "y" ? "top" : "left";
        const maxSide = crossAxis === "y" ? "bottom" : "right";
        const min2 = crossAxisCoord + overflow[minSide];
        const max2 = crossAxisCoord - overflow[maxSide];
        crossAxisCoord = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.clamp)(min2, crossAxisCoord, max2);
      }
      const limitedCoords = limiter.fn({
        ...state,
        [mainAxis]: mainAxisCoord,
        [crossAxis]: crossAxisCoord
      });
      return {
        ...limitedCoords,
        data: {
          x: limitedCoords.x - x,
          y: limitedCoords.y - y,
          enabled: {
            [mainAxis]: checkMainAxis,
            [crossAxis]: checkCrossAxis
          }
        }
      };
    }
  };
};
const limitShift = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    options,
    fn(state) {
      const {
        x,
        y,
        placement,
        rects,
        middlewareData
      } = state;
      const {
        offset: offset2 = 0,
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = true
      } = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(options, state);
      const coords = {
        x,
        y
      };
      const crossAxis = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSideAxis)(placement);
      const mainAxis = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getOppositeAxis)(crossAxis);
      let mainAxisCoord = coords[mainAxis];
      let crossAxisCoord = coords[crossAxis];
      const rawOffset = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(offset2, state);
      const computedOffset = typeof rawOffset === "number" ? {
        mainAxis: rawOffset,
        crossAxis: 0
      } : {
        mainAxis: 0,
        crossAxis: 0,
        ...rawOffset
      };
      if (checkMainAxis) {
        const len = mainAxis === "y" ? "height" : "width";
        const limitMin = rects.reference[mainAxis] - rects.floating[len] + computedOffset.mainAxis;
        const limitMax = rects.reference[mainAxis] + rects.reference[len] - computedOffset.mainAxis;
        if (mainAxisCoord < limitMin) {
          mainAxisCoord = limitMin;
        } else if (mainAxisCoord > limitMax) {
          mainAxisCoord = limitMax;
        }
      }
      if (checkCrossAxis) {
        var _middlewareData$offse, _middlewareData$offse2;
        const len = mainAxis === "y" ? "width" : "height";
        const isOriginSide = originSides.has((0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(placement));
        const limitMin = rects.reference[crossAxis] - rects.floating[len] + (isOriginSide ? ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse[crossAxis]) || 0 : 0) + (isOriginSide ? 0 : computedOffset.crossAxis);
        const limitMax = rects.reference[crossAxis] + rects.reference[len] + (isOriginSide ? 0 : ((_middlewareData$offse2 = middlewareData.offset) == null ? void 0 : _middlewareData$offse2[crossAxis]) || 0) - (isOriginSide ? computedOffset.crossAxis : 0);
        if (crossAxisCoord < limitMin) {
          crossAxisCoord = limitMin;
        } else if (crossAxisCoord > limitMax) {
          crossAxisCoord = limitMax;
        }
      }
      return {
        [mainAxis]: mainAxisCoord,
        [crossAxis]: crossAxisCoord
      };
    }
  };
};
const size = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "size",
    options,
    async fn(state) {
      var _state$middlewareData, _state$middlewareData2;
      const {
        placement,
        rects,
        platform,
        elements
      } = state;
      const {
        apply = () => {
        },
        ...detectOverflowOptions
      } = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.evaluate)(options, state);
      const overflow = await platform.detectOverflow(state, detectOverflowOptions);
      const side = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSide)(placement);
      const alignment = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getAlignment)(placement);
      const isYAxis = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.getSideAxis)(placement) === "y";
      const {
        width,
        height
      } = rects.floating;
      let heightSide;
      let widthSide;
      if (side === "top" || side === "bottom") {
        heightSide = side;
        widthSide = alignment === (await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
      } else {
        widthSide = side;
        heightSide = alignment === "end" ? "top" : "bottom";
      }
      const maximumClippingHeight = height - overflow.top - overflow.bottom;
      const maximumClippingWidth = width - overflow.left - overflow.right;
      const overflowAvailableHeight = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.min)(height - overflow[heightSide], maximumClippingHeight);
      const overflowAvailableWidth = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.min)(width - overflow[widthSide], maximumClippingWidth);
      const noShift = !state.middlewareData.shift;
      let availableHeight = overflowAvailableHeight;
      let availableWidth = overflowAvailableWidth;
      if ((_state$middlewareData = state.middlewareData.shift) != null && _state$middlewareData.enabled.x) {
        availableWidth = maximumClippingWidth;
      }
      if ((_state$middlewareData2 = state.middlewareData.shift) != null && _state$middlewareData2.enabled.y) {
        availableHeight = maximumClippingHeight;
      }
      if (noShift && !alignment) {
        const xMin = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.max)(overflow.left, 0);
        const xMax = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.max)(overflow.right, 0);
        const yMin = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.max)(overflow.top, 0);
        const yMax = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.max)(overflow.bottom, 0);
        if (isYAxis) {
          availableWidth = width - 2 * (xMin !== 0 || xMax !== 0 ? xMin + xMax : (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.max)(overflow.left, overflow.right));
        } else {
          availableHeight = height - 2 * (yMin !== 0 || yMax !== 0 ? yMin + yMax : (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_0__.max)(overflow.top, overflow.bottom));
        }
      }
      await apply({
        ...state,
        availableWidth,
        availableHeight
      });
      const nextDimensions = await platform.getDimensions(elements.floating);
      if (width !== nextDimensions.width || height !== nextDimensions.height) {
        return {
          reset: {
            rects: true
          }
        };
      }
      return {};
    }
  };
};



/***/ },

/***/ "../../node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs"
/*!********************************************************************************!*\
  !*** ../../node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs ***!
  \********************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   arrow: () => (/* binding */ arrow),
/* harmony export */   flip: () => (/* binding */ flip),
/* harmony export */   hide: () => (/* binding */ hide),
/* harmony export */   inline: () => (/* binding */ inline),
/* harmony export */   limitShift: () => (/* binding */ limitShift),
/* harmony export */   offset: () => (/* binding */ offset),
/* harmony export */   shift: () => (/* binding */ shift),
/* harmony export */   size: () => (/* binding */ size),
/* harmony export */   useFloating: () => (/* binding */ useFloating)
/* harmony export */ });
/* unused harmony export autoPlacement */
/* harmony import */ var _floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @floating-ui/dom */ "../../node_modules/@floating-ui/react-dom/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react_dom__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react-dom */ "../../node_modules/react-dom/index.js");





var isClient = typeof document !== "undefined";
var noop = function noop2() {
};
var index = isClient ? react__WEBPACK_IMPORTED_MODULE_1__.useLayoutEffect : noop;
function deepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (typeof a === "function" && a.toString() === b.toString()) {
    return true;
  }
  let length;
  let i;
  let keys;
  if (a && b && typeof a === "object") {
    if (Array.isArray(a)) {
      length = a.length;
      if (length !== b.length) return false;
      for (i = length; i-- !== 0; ) {
        if (!deepEqual(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }
    keys = Object.keys(a);
    length = keys.length;
    if (length !== Object.keys(b).length) {
      return false;
    }
    for (i = length; i-- !== 0; ) {
      if (!{}.hasOwnProperty.call(b, keys[i])) {
        return false;
      }
    }
    for (i = length; i-- !== 0; ) {
      const key = keys[i];
      if (key === "_owner" && a.$$typeof) {
        continue;
      }
      if (!deepEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }
  return a !== a && b !== b;
}
function getDPR(element) {
  if (typeof window === "undefined") {
    return 1;
  }
  const win = element.ownerDocument.defaultView || window;
  return win.devicePixelRatio || 1;
}
function roundByDPR(element, value) {
  const dpr = getDPR(element);
  return Math.round(value * dpr) / dpr;
}
function useLatestRef(value) {
  const ref = react__WEBPACK_IMPORTED_MODULE_1__.useRef(value);
  index(() => {
    ref.current = value;
  });
  return ref;
}
function useFloating(options) {
  if (options === void 0) {
    options = {};
  }
  const {
    placement = "bottom",
    strategy = "absolute",
    middleware = [],
    platform: platform2,
    elements: {
      reference: externalReference,
      floating: externalFloating
    } = {},
    transform = true,
    whileElementsMounted,
    open
  } = options;
  const [data, setData] = react__WEBPACK_IMPORTED_MODULE_1__.useState({
    x: 0,
    y: 0,
    strategy,
    placement,
    middlewareData: {},
    isPositioned: false
  });
  const [latestMiddleware, setLatestMiddleware] = react__WEBPACK_IMPORTED_MODULE_1__.useState(middleware);
  if (!deepEqual(latestMiddleware, middleware)) {
    setLatestMiddleware(middleware);
  }
  const [_reference, _setReference] = react__WEBPACK_IMPORTED_MODULE_1__.useState(null);
  const [_floating, _setFloating] = react__WEBPACK_IMPORTED_MODULE_1__.useState(null);
  const setReference = react__WEBPACK_IMPORTED_MODULE_1__.useCallback((node) => {
    if (node !== referenceRef.current) {
      referenceRef.current = node;
      _setReference(node);
    }
  }, []);
  const setFloating = react__WEBPACK_IMPORTED_MODULE_1__.useCallback((node) => {
    if (node !== floatingRef.current) {
      floatingRef.current = node;
      _setFloating(node);
    }
  }, []);
  const referenceEl = externalReference || _reference;
  const floatingEl = externalFloating || _floating;
  const referenceRef = react__WEBPACK_IMPORTED_MODULE_1__.useRef(null);
  const floatingRef = react__WEBPACK_IMPORTED_MODULE_1__.useRef(null);
  const dataRef = react__WEBPACK_IMPORTED_MODULE_1__.useRef(data);
  const hasWhileElementsMounted = whileElementsMounted != null;
  const whileElementsMountedRef = useLatestRef(whileElementsMounted);
  const platformRef = useLatestRef(platform2);
  const openRef = useLatestRef(open);
  const update = react__WEBPACK_IMPORTED_MODULE_1__.useCallback(() => {
    if (!referenceRef.current || !floatingRef.current) {
      return;
    }
    const config = {
      placement,
      strategy,
      middleware: latestMiddleware
    };
    if (platformRef.current) {
      config.platform = platformRef.current;
    }
    (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.computePosition)(referenceRef.current, floatingRef.current, config).then((data2) => {
      const fullData = {
        ...data2,
        // The floating element's position may be recomputed while it's closed
        // but still mounted (such as when transitioning out). To ensure
        // `isPositioned` will be `false` initially on the next open, avoid
        // setting it to `true` when `open === false` (must be specified).
        isPositioned: openRef.current !== false
      };
      if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
        dataRef.current = fullData;
        react_dom__WEBPACK_IMPORTED_MODULE_2__.flushSync(() => {
          setData(fullData);
        });
      }
    });
  }, [latestMiddleware, placement, strategy, platformRef, openRef]);
  index(() => {
    if (open === false && dataRef.current.isPositioned) {
      dataRef.current.isPositioned = false;
      setData((data2) => ({
        ...data2,
        isPositioned: false
      }));
    }
  }, [open]);
  const isMountedRef = react__WEBPACK_IMPORTED_MODULE_1__.useRef(false);
  index(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  index(() => {
    if (referenceEl) referenceRef.current = referenceEl;
    if (floatingEl) floatingRef.current = floatingEl;
    if (referenceEl && floatingEl) {
      if (whileElementsMountedRef.current) {
        return whileElementsMountedRef.current(referenceEl, floatingEl, update);
      }
      update();
    }
  }, [referenceEl, floatingEl, update, whileElementsMountedRef, hasWhileElementsMounted]);
  const refs = react__WEBPACK_IMPORTED_MODULE_1__.useMemo(() => ({
    reference: referenceRef,
    floating: floatingRef,
    setReference,
    setFloating
  }), [setReference, setFloating]);
  const elements = react__WEBPACK_IMPORTED_MODULE_1__.useMemo(() => ({
    reference: referenceEl,
    floating: floatingEl
  }), [referenceEl, floatingEl]);
  const floatingStyles = react__WEBPACK_IMPORTED_MODULE_1__.useMemo(() => {
    const initialStyles = {
      position: strategy,
      left: 0,
      top: 0
    };
    if (!elements.floating) {
      return initialStyles;
    }
    const x = roundByDPR(elements.floating, data.x);
    const y = roundByDPR(elements.floating, data.y);
    if (transform) {
      return {
        ...initialStyles,
        transform: "translate(" + x + "px, " + y + "px)",
        ...getDPR(elements.floating) >= 1.5 && {
          willChange: "transform"
        }
      };
    }
    return {
      position: strategy,
      left: x,
      top: y
    };
  }, [strategy, transform, elements.floating, data.x, data.y]);
  return react__WEBPACK_IMPORTED_MODULE_1__.useMemo(() => ({
    ...data,
    update,
    refs,
    elements,
    floatingStyles
  }), [data, update, refs, elements, floatingStyles]);
}
const arrow$1 = (options) => {
  function isRef(value) {
    return {}.hasOwnProperty.call(value, "current");
  }
  return {
    name: "arrow",
    options,
    fn(state) {
      const {
        element,
        padding
      } = typeof options === "function" ? options(state) : options;
      if (element && isRef(element)) {
        if (element.current != null) {
          return (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.arrow)({
            element: element.current,
            padding
          }).fn(state);
        }
        return {};
      }
      if (element) {
        return (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.arrow)({
          element,
          padding
        }).fn(state);
      }
      return {};
    }
  };
};
const offset = (options, deps) => {
  const result = (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.offset)(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};
const shift = (options, deps) => {
  const result = (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.shift)(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};
const limitShift = (options, deps) => {
  const result = (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.limitShift)(options);
  return {
    fn: result.fn,
    options: [options, deps]
  };
};
const flip = (options, deps) => {
  const result = (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.flip)(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};
const size = (options, deps) => {
  const result = (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.size)(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};
const autoPlacement = (options, deps) => {
  const result = (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.autoPlacement)(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};
const hide = (options, deps) => {
  const result = (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.hide)(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};
const inline = (options, deps) => {
  const result = (0,_floating_ui_dom__WEBPACK_IMPORTED_MODULE_0__.inline)(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};
const arrow = (options, deps) => {
  const result = arrow$1(options);
  return {
    name: result.name,
    fn: result.fn,
    options: [options, deps]
  };
};



/***/ },

/***/ "../../node_modules/@floating-ui/react-dom/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs"
/*!********************************************************************************************************!*\
  !*** ../../node_modules/@floating-ui/react-dom/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs ***!
  \********************************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   arrow: () => (/* binding */ arrow),
/* harmony export */   autoPlacement: () => (/* binding */ autoPlacement),
/* harmony export */   autoUpdate: () => (/* binding */ autoUpdate),
/* harmony export */   computePosition: () => (/* binding */ computePosition),
/* harmony export */   flip: () => (/* binding */ flip),
/* harmony export */   hide: () => (/* binding */ hide),
/* harmony export */   inline: () => (/* binding */ inline),
/* harmony export */   limitShift: () => (/* binding */ limitShift),
/* harmony export */   offset: () => (/* binding */ offset),
/* harmony export */   shift: () => (/* binding */ shift),
/* harmony export */   size: () => (/* binding */ size)
/* harmony export */ });
/* unused harmony exports detectOverflow, platform */
/* harmony import */ var _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @floating-ui/core */ "../../node_modules/@floating-ui/core/dist/floating-ui.core.mjs");
/* harmony import */ var _floating_ui_core__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @floating-ui/utils */ "../../node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs");
/* harmony import */ var _floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @floating-ui/utils/dom */ "../../node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs");




function getCssDimensions(element) {
  const css = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getComputedStyle)(element);
  let width = parseFloat(css.width) || 0;
  let height = parseFloat(css.height) || 0;
  const hasOffset = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isHTMLElement)(element);
  const offsetWidth = hasOffset ? element.offsetWidth : width;
  const offsetHeight = hasOffset ? element.offsetHeight : height;
  const shouldFallback = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.round)(width) !== offsetWidth || (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.round)(height) !== offsetHeight;
  if (shouldFallback) {
    width = offsetWidth;
    height = offsetHeight;
  }
  return {
    width,
    height,
    $: shouldFallback
  };
}
function unwrapElement(element) {
  return !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isElement)(element) ? element.contextElement : element;
}
function getScale(element) {
  const domElement = unwrapElement(element);
  if (!(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isHTMLElement)(domElement)) {
    return (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.createCoords)(1);
  }
  const rect = domElement.getBoundingClientRect();
  const {
    width,
    height,
    $
  } = getCssDimensions(domElement);
  let x = ($ ? (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.round)(rect.width) : rect.width) / width;
  let y = ($ ? (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.round)(rect.height) : rect.height) / height;
  if (!x || !Number.isFinite(x)) {
    x = 1;
  }
  if (!y || !Number.isFinite(y)) {
    y = 1;
  }
  return {
    x,
    y
  };
}
const noOffsets = /* @__PURE__ */ (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.createCoords)(0);
function getVisualOffsets(element) {
  const win = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getWindow)(element);
  if (!(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isWebKit)() || !win.visualViewport) {
    return noOffsets;
  }
  return {
    x: win.visualViewport.offsetLeft,
    y: win.visualViewport.offsetTop
  };
}
function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
  if (isFixed === void 0) {
    isFixed = false;
  }
  if (!floatingOffsetParent || isFixed && floatingOffsetParent !== (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getWindow)(element)) {
    return false;
  }
  return isFixed;
}
function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
  if (includeScale === void 0) {
    includeScale = false;
  }
  if (isFixedStrategy === void 0) {
    isFixedStrategy = false;
  }
  const clientRect = element.getBoundingClientRect();
  const domElement = unwrapElement(element);
  let scale = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.createCoords)(1);
  if (includeScale) {
    if (offsetParent) {
      if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isElement)(offsetParent)) {
        scale = getScale(offsetParent);
      }
    } else {
      scale = getScale(element);
    }
  }
  const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.createCoords)(0);
  let x = (clientRect.left + visualOffsets.x) / scale.x;
  let y = (clientRect.top + visualOffsets.y) / scale.y;
  let width = clientRect.width / scale.x;
  let height = clientRect.height / scale.y;
  if (domElement) {
    const win = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getWindow)(domElement);
    const offsetWin = offsetParent && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isElement)(offsetParent) ? (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getWindow)(offsetParent) : offsetParent;
    let currentWin = win;
    let currentIFrame = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getFrameElement)(currentWin);
    while (currentIFrame && offsetParent && offsetWin !== currentWin) {
      const iframeScale = getScale(currentIFrame);
      const iframeRect = currentIFrame.getBoundingClientRect();
      const css = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getComputedStyle)(currentIFrame);
      const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
      const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
      x *= iframeScale.x;
      y *= iframeScale.y;
      width *= iframeScale.x;
      height *= iframeScale.y;
      x += left;
      y += top;
      currentWin = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getWindow)(currentIFrame);
      currentIFrame = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getFrameElement)(currentWin);
    }
  }
  return (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.rectToClientRect)({
    width,
    height,
    x,
    y
  });
}
function getWindowScrollBarX(element, rect) {
  const leftScroll = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getNodeScroll)(element).scrollLeft;
  if (!rect) {
    return getBoundingClientRect((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getDocumentElement)(element)).left + leftScroll;
  }
  return rect.left + leftScroll;
}
function getHTMLOffset(documentElement, scroll) {
  const htmlRect = documentElement.getBoundingClientRect();
  const x = htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect);
  const y = htmlRect.top + scroll.scrollTop;
  return {
    x,
    y
  };
}
function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
  let {
    elements,
    rect,
    offsetParent,
    strategy
  } = _ref;
  const isFixed = strategy === "fixed";
  const documentElement = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getDocumentElement)(offsetParent);
  const topLayer = elements ? (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isTopLayer)(elements.floating) : false;
  if (offsetParent === documentElement || topLayer && isFixed) {
    return rect;
  }
  let scroll = {
    scrollLeft: 0,
    scrollTop: 0
  };
  let scale = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.createCoords)(1);
  const offsets = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.createCoords)(0);
  const isOffsetParentAnElement = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isHTMLElement)(offsetParent);
  if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
    if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getNodeName)(offsetParent) !== "body" || (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isOverflowElement)(documentElement)) {
      scroll = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getNodeScroll)(offsetParent);
    }
    if (isOffsetParentAnElement) {
      const offsetRect = getBoundingClientRect(offsetParent);
      scale = getScale(offsetParent);
      offsets.x = offsetRect.x + offsetParent.clientLeft;
      offsets.y = offsetRect.y + offsetParent.clientTop;
    }
  }
  const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.createCoords)(0);
  return {
    width: rect.width * scale.x,
    height: rect.height * scale.y,
    x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
    y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
  };
}
function getClientRects(element) {
  return Array.from(element.getClientRects());
}
function getDocumentRect(element) {
  const html = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getDocumentElement)(element);
  const scroll = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getNodeScroll)(element);
  const body = element.ownerDocument.body;
  const width = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.max)(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
  const height = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.max)(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
  let x = -scroll.scrollLeft + getWindowScrollBarX(element);
  const y = -scroll.scrollTop;
  if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getComputedStyle)(body).direction === "rtl") {
    x += (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.max)(html.clientWidth, body.clientWidth) - width;
  }
  return {
    width,
    height,
    x,
    y
  };
}
const SCROLLBAR_MAX = 25;
function getViewportRect(element, strategy) {
  const win = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getWindow)(element);
  const html = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getDocumentElement)(element);
  const visualViewport = win.visualViewport;
  let width = html.clientWidth;
  let height = html.clientHeight;
  let x = 0;
  let y = 0;
  if (visualViewport) {
    width = visualViewport.width;
    height = visualViewport.height;
    const visualViewportBased = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isWebKit)();
    if (!visualViewportBased || visualViewportBased && strategy === "fixed") {
      x = visualViewport.offsetLeft;
      y = visualViewport.offsetTop;
    }
  }
  const windowScrollbarX = getWindowScrollBarX(html);
  if (windowScrollbarX <= 0) {
    const doc = html.ownerDocument;
    const body = doc.body;
    const bodyStyles = getComputedStyle(body);
    const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
    const clippingStableScrollbarWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
    if (clippingStableScrollbarWidth <= SCROLLBAR_MAX) {
      width -= clippingStableScrollbarWidth;
    }
  } else if (windowScrollbarX <= SCROLLBAR_MAX) {
    width += windowScrollbarX;
  }
  return {
    width,
    height,
    x,
    y
  };
}
function getInnerBoundingClientRect(element, strategy) {
  const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
  const top = clientRect.top + element.clientTop;
  const left = clientRect.left + element.clientLeft;
  const scale = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isHTMLElement)(element) ? getScale(element) : (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.createCoords)(1);
  const width = element.clientWidth * scale.x;
  const height = element.clientHeight * scale.y;
  const x = left * scale.x;
  const y = top * scale.y;
  return {
    width,
    height,
    x,
    y
  };
}
function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
  let rect;
  if (clippingAncestor === "viewport") {
    rect = getViewportRect(element, strategy);
  } else if (clippingAncestor === "document") {
    rect = getDocumentRect((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getDocumentElement)(element));
  } else if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isElement)(clippingAncestor)) {
    rect = getInnerBoundingClientRect(clippingAncestor, strategy);
  } else {
    const visualOffsets = getVisualOffsets(element);
    rect = {
      x: clippingAncestor.x - visualOffsets.x,
      y: clippingAncestor.y - visualOffsets.y,
      width: clippingAncestor.width,
      height: clippingAncestor.height
    };
  }
  return (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.rectToClientRect)(rect);
}
function hasFixedPositionAncestor(element, stopNode) {
  const parentNode = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getParentNode)(element);
  if (parentNode === stopNode || !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isElement)(parentNode) || (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isLastTraversableNode)(parentNode)) {
    return false;
  }
  return (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getComputedStyle)(parentNode).position === "fixed" || hasFixedPositionAncestor(parentNode, stopNode);
}
function getClippingElementAncestors(element, cache) {
  const cachedResult = cache.get(element);
  if (cachedResult) {
    return cachedResult;
  }
  let result = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getOverflowAncestors)(element, [], false).filter((el) => (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isElement)(el) && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getNodeName)(el) !== "body");
  let currentContainingBlockComputedStyle = null;
  const elementIsFixed = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getComputedStyle)(element).position === "fixed";
  let currentNode = elementIsFixed ? (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getParentNode)(element) : element;
  while ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isElement)(currentNode) && !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isLastTraversableNode)(currentNode)) {
    const computedStyle = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getComputedStyle)(currentNode);
    const currentNodeIsContaining = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isContainingBlock)(currentNode);
    if (!currentNodeIsContaining && computedStyle.position === "fixed") {
      currentContainingBlockComputedStyle = null;
    }
    const shouldDropCurrentNode = elementIsFixed ? !currentNodeIsContaining && !currentContainingBlockComputedStyle : !currentNodeIsContaining && computedStyle.position === "static" && !!currentContainingBlockComputedStyle && (currentContainingBlockComputedStyle.position === "absolute" || currentContainingBlockComputedStyle.position === "fixed") || (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isOverflowElement)(currentNode) && !currentNodeIsContaining && hasFixedPositionAncestor(element, currentNode);
    if (shouldDropCurrentNode) {
      result = result.filter((ancestor) => ancestor !== currentNode);
    } else {
      currentContainingBlockComputedStyle = computedStyle;
    }
    currentNode = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getParentNode)(currentNode);
  }
  cache.set(element, result);
  return result;
}
function getClippingRect(_ref) {
  let {
    element,
    boundary,
    rootBoundary,
    strategy
  } = _ref;
  const elementClippingAncestors = boundary === "clippingAncestors" ? (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isTopLayer)(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary);
  const clippingAncestors = [...elementClippingAncestors, rootBoundary];
  const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
  let top = firstRect.top;
  let right = firstRect.right;
  let bottom = firstRect.bottom;
  let left = firstRect.left;
  for (let i = 1; i < clippingAncestors.length; i++) {
    const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i], strategy);
    top = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.max)(rect.top, top);
    right = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.min)(rect.right, right);
    bottom = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.min)(rect.bottom, bottom);
    left = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.max)(rect.left, left);
  }
  return {
    width: right - left,
    height: bottom - top,
    x: left,
    y: top
  };
}
function getDimensions(element) {
  const {
    width,
    height
  } = getCssDimensions(element);
  return {
    width,
    height
  };
}
function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
  const isOffsetParentAnElement = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isHTMLElement)(offsetParent);
  const documentElement = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getDocumentElement)(offsetParent);
  const isFixed = strategy === "fixed";
  const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
  let scroll = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const offsets = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.createCoords)(0);
  function setLeftRTLScrollbarOffset() {
    offsets.x = getWindowScrollBarX(documentElement);
  }
  if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
    if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getNodeName)(offsetParent) !== "body" || (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isOverflowElement)(documentElement)) {
      scroll = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getNodeScroll)(offsetParent);
    }
    if (isOffsetParentAnElement) {
      const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
      offsets.x = offsetRect.x + offsetParent.clientLeft;
      offsets.y = offsetRect.y + offsetParent.clientTop;
    } else if (documentElement) {
      setLeftRTLScrollbarOffset();
    }
  }
  if (isFixed && !isOffsetParentAnElement && documentElement) {
    setLeftRTLScrollbarOffset();
  }
  const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.createCoords)(0);
  const x = rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x;
  const y = rect.top + scroll.scrollTop - offsets.y - htmlOffset.y;
  return {
    x,
    y,
    width: rect.width,
    height: rect.height
  };
}
function isStaticPositioned(element) {
  return (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getComputedStyle)(element).position === "static";
}
function getTrueOffsetParent(element, polyfill) {
  if (!(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isHTMLElement)(element) || (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getComputedStyle)(element).position === "fixed") {
    return null;
  }
  if (polyfill) {
    return polyfill(element);
  }
  let rawOffsetParent = element.offsetParent;
  if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getDocumentElement)(element) === rawOffsetParent) {
    rawOffsetParent = rawOffsetParent.ownerDocument.body;
  }
  return rawOffsetParent;
}
function getOffsetParent(element, polyfill) {
  const win = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getWindow)(element);
  if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isTopLayer)(element)) {
    return win;
  }
  if (!(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isHTMLElement)(element)) {
    let svgOffsetParent = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getParentNode)(element);
    while (svgOffsetParent && !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isLastTraversableNode)(svgOffsetParent)) {
      if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isElement)(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) {
        return svgOffsetParent;
      }
      svgOffsetParent = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getParentNode)(svgOffsetParent);
    }
    return win;
  }
  let offsetParent = getTrueOffsetParent(element, polyfill);
  while (offsetParent && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isTableElement)(offsetParent) && isStaticPositioned(offsetParent)) {
    offsetParent = getTrueOffsetParent(offsetParent, polyfill);
  }
  if (offsetParent && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isLastTraversableNode)(offsetParent) && isStaticPositioned(offsetParent) && !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isContainingBlock)(offsetParent)) {
    return win;
  }
  return offsetParent || (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getContainingBlock)(element) || win;
}
const getElementRects = async function(data) {
  const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
  const getDimensionsFn = this.getDimensions;
  const floatingDimensions = await getDimensionsFn(data.floating);
  return {
    reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
    floating: {
      x: 0,
      y: 0,
      width: floatingDimensions.width,
      height: floatingDimensions.height
    }
  };
};
function isRTL(element) {
  return (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getComputedStyle)(element).direction === "rtl";
}
const platform = {
  convertOffsetParentRelativeRectToViewportRelativeRect,
  getDocumentElement: _floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getDocumentElement,
  getClippingRect,
  getOffsetParent,
  getElementRects,
  getClientRects,
  getDimensions,
  getScale,
  isElement: _floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.isElement,
  isRTL
};
function rectsAreEqual(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
function observeMove(element, onMove) {
  let io = null;
  let timeoutId;
  const root = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getDocumentElement)(element);
  function cleanup() {
    var _io;
    clearTimeout(timeoutId);
    (_io = io) == null || _io.disconnect();
    io = null;
  }
  function refresh(skip, threshold) {
    if (skip === void 0) {
      skip = false;
    }
    if (threshold === void 0) {
      threshold = 1;
    }
    cleanup();
    const elementRectForRootMargin = element.getBoundingClientRect();
    const {
      left,
      top,
      width,
      height
    } = elementRectForRootMargin;
    if (!skip) {
      onMove();
    }
    if (!width || !height) {
      return;
    }
    const insetTop = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.floor)(top);
    const insetRight = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.floor)(root.clientWidth - (left + width));
    const insetBottom = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.floor)(root.clientHeight - (top + height));
    const insetLeft = (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.floor)(left);
    const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
    const options = {
      rootMargin,
      threshold: (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.max)(0, (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_1__.min)(1, threshold)) || 1
    };
    let isFirstUpdate = true;
    function handleObserve(entries) {
      const ratio = entries[0].intersectionRatio;
      if (ratio !== threshold) {
        if (!isFirstUpdate) {
          return refresh();
        }
        if (!ratio) {
          timeoutId = setTimeout(() => {
            refresh(false, 1e-7);
          }, 1e3);
        } else {
          refresh(false, ratio);
        }
      }
      if (ratio === 1 && !rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) {
        refresh();
      }
      isFirstUpdate = false;
    }
    try {
      io = new IntersectionObserver(handleObserve, {
        ...options,
        // Handle <iframe>s
        root: root.ownerDocument
      });
    } catch (_e) {
      io = new IntersectionObserver(handleObserve, options);
    }
    io.observe(element);
  }
  refresh(true);
  return cleanup;
}
function autoUpdate(reference, floating, update, options) {
  if (options === void 0) {
    options = {};
  }
  const {
    ancestorScroll = true,
    ancestorResize = true,
    elementResize = typeof ResizeObserver === "function",
    layoutShift = typeof IntersectionObserver === "function",
    animationFrame = false
  } = options;
  const referenceEl = unwrapElement(reference);
  const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getOverflowAncestors)(referenceEl) : [], ...floating ? (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_2__.getOverflowAncestors)(floating) : []] : [];
  ancestors.forEach((ancestor) => {
    ancestorScroll && ancestor.addEventListener("scroll", update, {
      passive: true
    });
    ancestorResize && ancestor.addEventListener("resize", update);
  });
  const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update) : null;
  let reobserveFrame = -1;
  let resizeObserver = null;
  if (elementResize) {
    resizeObserver = new ResizeObserver((_ref) => {
      let [firstEntry] = _ref;
      if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
        resizeObserver.unobserve(floating);
        cancelAnimationFrame(reobserveFrame);
        reobserveFrame = requestAnimationFrame(() => {
          var _resizeObserver;
          (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
        });
      }
      update();
    });
    if (referenceEl && !animationFrame) {
      resizeObserver.observe(referenceEl);
    }
    if (floating) {
      resizeObserver.observe(floating);
    }
  }
  let frameId;
  let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
  if (animationFrame) {
    frameLoop();
  }
  function frameLoop() {
    const nextRefRect = getBoundingClientRect(reference);
    if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) {
      update();
    }
    prevRefRect = nextRefRect;
    frameId = requestAnimationFrame(frameLoop);
  }
  update();
  return () => {
    var _resizeObserver2;
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.removeEventListener("scroll", update);
      ancestorResize && ancestor.removeEventListener("resize", update);
    });
    cleanupIo == null || cleanupIo();
    (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
    resizeObserver = null;
    if (animationFrame) {
      cancelAnimationFrame(frameId);
    }
  };
}
const detectOverflow = _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.detectOverflow;
const offset = _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.offset;
const autoPlacement = _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.autoPlacement;
const shift = _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.shift;
const flip = _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.flip;
const size = _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.size;
const hide = _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.hide;
const arrow = _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.arrow;
const inline = _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.inline;
const limitShift = _floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.limitShift;
const computePosition = (reference, floating, options) => {
  const cache = /* @__PURE__ */ new Map();
  const mergedOptions = {
    platform,
    ...options
  };
  const platformWithCache = {
    ...mergedOptions.platform,
    _c: cache
  };
  return (0,_floating_ui_core__WEBPACK_IMPORTED_MODULE_0__.computePosition)(reference, floating, {
    ...mergedOptions,
    platform: platformWithCache
  });
};



/***/ },

/***/ "../../node_modules/@floating-ui/react/dist/floating-ui.react.mjs"
/*!************************************************************************!*\
  !*** ../../node_modules/@floating-ui/react/dist/floating-ui.react.mjs ***!
  \************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useFloating: () => (/* binding */ useFloating),
/* harmony export */   useMergeRefs: () => (/* binding */ useMergeRefs)
/* harmony export */ });
/* unused harmony exports Composite, CompositeItem, FloatingArrow, FloatingDelayGroup, FloatingFocusManager, FloatingList, FloatingNode, FloatingOverlay, FloatingPortal, FloatingTree, NextFloatingDelayGroup, inner, safePolygon, useClick, useClientPoint, useDelayGroup, useDelayGroupContext, useDismiss, useFloatingNodeId, useFloatingParentNodeId, useFloatingPortalNode, useFloatingRootContext, useFloatingTree, useFocus, useHover, useId, useInnerOffset, useInteractions, useListItem, useListNavigation, useNextDelayGroup, useRole, useTransitionStatus, useTransitionStyles, useTypeahead */
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @floating-ui/react/utils */ "../../node_modules/@floating-ui/react/dist/floating-ui.react.utils.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @floating-ui/react-dom */ "../../node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs");
/* harmony import */ var tabbable__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! tabbable */ "../../node_modules/tabbable/dist/index.esm.js");
/* harmony import */ var react_dom__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react-dom */ "../../node_modules/react-dom/index.js");
/* harmony import */ var _floating_ui_react_dom__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @floating-ui/react-dom */ "../../node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs");
/* harmony import */ var _floating_ui_utils__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! @floating-ui/utils */ "../../node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs");









function useMergeRefs(refs) {
  const cleanupRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(void 0);
  const refEffect = react__WEBPACK_IMPORTED_MODULE_0__.useCallback((instance) => {
    const cleanups = refs.map((ref) => {
      if (ref == null) {
        return;
      }
      if (typeof ref === "function") {
        const refCallback = ref;
        const refCleanup = refCallback(instance);
        return typeof refCleanup === "function" ? refCleanup : () => {
          refCallback(null);
        };
      }
      ref.current = instance;
      return () => {
        ref.current = null;
      };
    });
    return () => {
      cleanups.forEach((refCleanup) => refCleanup == null ? void 0 : refCleanup());
    };
  }, refs);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    if (refs.every((ref) => ref == null)) {
      return null;
    }
    return (value) => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = void 0;
      }
      if (value != null) {
        cleanupRef.current = refEffect(value);
      }
    };
  }, refs);
}
function sortByDocumentPosition(a, b) {
  const position = a.compareDocumentPosition(b);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING || position & Node.DOCUMENT_POSITION_CONTAINED_BY) {
    return -1;
  }
  if (position & Node.DOCUMENT_POSITION_PRECEDING || position & Node.DOCUMENT_POSITION_CONTAINS) {
    return 1;
  }
  return 0;
}
const FloatingListContext = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.createContext({
  register: () => {
  },
  unregister: () => {
  },
  map: /* @__PURE__ */ new Map(),
  elementsRef: {
    current: []
  }
});
function FloatingList(props) {
  const {
    children,
    elementsRef,
    labelsRef
  } = props;
  const [nodes, setNodes] = react__WEBPACK_IMPORTED_MODULE_0__.useState(() => /* @__PURE__ */ new Set());
  const register = react__WEBPACK_IMPORTED_MODULE_0__.useCallback((node) => {
    setNodes((prevSet) => new Set(prevSet).add(node));
  }, []);
  const unregister = react__WEBPACK_IMPORTED_MODULE_0__.useCallback((node) => {
    setNodes((prevSet) => {
      const set = new Set(prevSet);
      set.delete(node);
      return set;
    });
  }, []);
  const map = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    const newMap = /* @__PURE__ */ new Map();
    const sortedNodes = Array.from(nodes.keys()).sort(sortByDocumentPosition);
    sortedNodes.forEach((node, index) => {
      newMap.set(node, index);
    });
    return newMap;
  }, [nodes]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(FloatingListContext.Provider, {
    value: react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
      register,
      unregister,
      map,
      elementsRef,
      labelsRef
    }), [register, unregister, map, elementsRef, labelsRef]),
    children
  });
}
function useListItem(props) {
  if (props === void 0) {
    props = {};
  }
  const {
    label
  } = props;
  const {
    register,
    unregister,
    map,
    elementsRef,
    labelsRef
  } = react__WEBPACK_IMPORTED_MODULE_0__.useContext(FloatingListContext);
  const [index, setIndex] = react__WEBPACK_IMPORTED_MODULE_0__.useState(null);
  const componentRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const ref = react__WEBPACK_IMPORTED_MODULE_0__.useCallback((node) => {
    componentRef.current = node;
    if (index !== null) {
      elementsRef.current[index] = node;
      if (labelsRef) {
        var _node$textContent;
        const isLabelDefined = label !== void 0;
        labelsRef.current[index] = isLabelDefined ? label : (_node$textContent = node == null ? void 0 : node.textContent) != null ? _node$textContent : null;
      }
    }
  }, [index, elementsRef, labelsRef, label]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    const node = componentRef.current;
    if (node) {
      register(node);
      return () => {
        unregister(node);
      };
    }
  }, [register, unregister]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    const index2 = componentRef.current ? map.get(componentRef.current) : null;
    if (index2 != null) {
      setIndex(index2);
    }
  }, [map]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    ref,
    index: index == null ? -1 : index
  }), [index, ref]);
}
const FOCUSABLE_ATTRIBUTE = "data-floating-ui-focusable";
const ACTIVE_KEY = "active";
const SELECTED_KEY = "selected";
const ARROW_LEFT = "ArrowLeft";
const ARROW_RIGHT = "ArrowRight";
const ARROW_UP = "ArrowUp";
const ARROW_DOWN = "ArrowDown";
function renderJsx(render, computedProps) {
  if (typeof render === "function") {
    return render(computedProps);
  }
  if (render) {
    return /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.cloneElement(render, computedProps);
  }
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("div", {
    ...computedProps
  });
}
const CompositeContext = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.createContext({
  activeIndex: 0,
  onNavigate: () => {
  }
});
const horizontalKeys = [ARROW_LEFT, ARROW_RIGHT];
const verticalKeys = [ARROW_UP, ARROW_DOWN];
const allKeys = [...horizontalKeys, ...verticalKeys];
const Composite = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.forwardRef(function Composite2(props, forwardedRef) {
  const {
    render,
    orientation = "both",
    loop = true,
    rtl = false,
    cols = 1,
    disabledIndices,
    activeIndex: externalActiveIndex,
    onNavigate: externalSetActiveIndex,
    itemSizes,
    dense = false,
    ...domProps
  } = props;
  const [internalActiveIndex, internalSetActiveIndex] = react__WEBPACK_IMPORTED_MODULE_0__.useState(0);
  const activeIndex = externalActiveIndex != null ? externalActiveIndex : internalActiveIndex;
  const onNavigate = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(externalSetActiveIndex != null ? externalSetActiveIndex : internalSetActiveIndex);
  const elementsRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef([]);
  const renderElementProps = render && typeof render !== "function" ? render.props : {};
  const contextValue = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    activeIndex,
    onNavigate
  }), [activeIndex, onNavigate]);
  const isGrid = cols > 1;
  function handleKeyDown(event) {
    if (!allKeys.includes(event.key)) return;
    let nextIndex = activeIndex;
    const minIndex = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getMinListIndex)(elementsRef, disabledIndices);
    const maxIndex = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getMaxListIndex)(elementsRef, disabledIndices);
    const horizontalEndKey = rtl ? ARROW_LEFT : ARROW_RIGHT;
    const horizontalStartKey = rtl ? ARROW_RIGHT : ARROW_LEFT;
    if (isGrid) {
      const sizes = itemSizes || Array.from({
        length: elementsRef.current.length
      }, () => ({
        width: 1,
        height: 1
      }));
      const cellMap = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.createGridCellMap)(sizes, cols, dense);
      const minGridIndex = cellMap.findIndex((index) => index != null && !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isListIndexDisabled)(elementsRef, index, disabledIndices));
      const maxGridIndex = cellMap.reduce((foundIndex, index, cellIndex) => index != null && !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isListIndexDisabled)(elementsRef, index, disabledIndices) ? cellIndex : foundIndex, -1);
      const maybeNextIndex = cellMap[(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getGridNavigatedIndex)({
        current: cellMap.map((itemIndex) => itemIndex ? elementsRef.current[itemIndex] : null)
      }, {
        event,
        orientation,
        loop,
        rtl,
        cols,
        // treat undefined (empty grid spaces) as disabled indices so we
        // don't end up in them
        disabledIndices: (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getGridCellIndices)([...(typeof disabledIndices !== "function" ? disabledIndices : null) || elementsRef.current.map((_, index) => (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isListIndexDisabled)(elementsRef, index, disabledIndices) ? index : void 0), void 0], cellMap),
        minIndex: minGridIndex,
        maxIndex: maxGridIndex,
        prevIndex: (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getGridCellIndexOfCorner)(
          activeIndex > maxIndex ? minIndex : activeIndex,
          sizes,
          cellMap,
          cols,
          // use a corner matching the edge closest to the direction we're
          // moving in so we don't end up in the same item. Prefer
          // top/left over bottom/right.
          event.key === ARROW_DOWN ? "bl" : event.key === horizontalEndKey ? "tr" : "tl"
        )
      })];
      if (maybeNextIndex != null) {
        nextIndex = maybeNextIndex;
      }
    }
    const toEndKeys = {
      horizontal: [horizontalEndKey],
      vertical: [ARROW_DOWN],
      both: [horizontalEndKey, ARROW_DOWN]
    }[orientation];
    const toStartKeys = {
      horizontal: [horizontalStartKey],
      vertical: [ARROW_UP],
      both: [horizontalStartKey, ARROW_UP]
    }[orientation];
    const preventedKeys = isGrid ? allKeys : {
      horizontal: horizontalKeys,
      vertical: verticalKeys,
      both: allKeys
    }[orientation];
    if (nextIndex === activeIndex && [...toEndKeys, ...toStartKeys].includes(event.key)) {
      if (loop && nextIndex === maxIndex && toEndKeys.includes(event.key)) {
        nextIndex = minIndex;
      } else if (loop && nextIndex === minIndex && toStartKeys.includes(event.key)) {
        nextIndex = maxIndex;
      } else {
        nextIndex = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.findNonDisabledListIndex)(elementsRef, {
          startingIndex: nextIndex,
          decrement: toStartKeys.includes(event.key),
          disabledIndices
        });
      }
    }
    if (nextIndex !== activeIndex && !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isIndexOutOfListBounds)(elementsRef, nextIndex)) {
      var _elementsRef$current$;
      event.stopPropagation();
      if (preventedKeys.includes(event.key)) {
        event.preventDefault();
      }
      onNavigate(nextIndex);
      (_elementsRef$current$ = elementsRef.current[nextIndex]) == null || _elementsRef$current$.focus();
    }
  }
  const computedProps = {
    ...domProps,
    ...renderElementProps,
    ref: forwardedRef,
    "aria-orientation": orientation === "both" ? void 0 : orientation,
    onKeyDown(e) {
      domProps.onKeyDown == null || domProps.onKeyDown(e);
      renderElementProps.onKeyDown == null || renderElementProps.onKeyDown(e);
      handleKeyDown(e);
    }
  };
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(CompositeContext.Provider, {
    value: contextValue,
    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(FloatingList, {
      elementsRef,
      children: renderJsx(render, computedProps)
    })
  });
});
const CompositeItem = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.forwardRef(function CompositeItem2(props, forwardedRef) {
  const {
    render,
    ...domProps
  } = props;
  const renderElementProps = render && typeof render !== "function" ? render.props : {};
  const {
    activeIndex,
    onNavigate
  } = react__WEBPACK_IMPORTED_MODULE_0__.useContext(CompositeContext);
  const {
    ref,
    index
  } = useListItem();
  const mergedRef = useMergeRefs([ref, forwardedRef, renderElementProps.ref]);
  const isActive = activeIndex === index;
  const computedProps = {
    ...domProps,
    ...renderElementProps,
    ref: mergedRef,
    tabIndex: isActive ? 0 : -1,
    "data-active": isActive ? "" : void 0,
    onFocus(e) {
      domProps.onFocus == null || domProps.onFocus(e);
      renderElementProps.onFocus == null || renderElementProps.onFocus(e);
      onNavigate(index);
    }
  };
  return renderJsx(render, computedProps);
});
const SafeReact = {
  ...react__WEBPACK_IMPORTED_MODULE_0__
};
let serverHandoffComplete = false;
let count = 0;
const genId = () => (
  // Ensure the id is unique with multiple independent versions of Floating UI
  // on <React 18
  "floating-ui-" + Math.random().toString(36).slice(2, 6) + count++
);
function useFloatingId() {
  const [id, setId] = react__WEBPACK_IMPORTED_MODULE_0__.useState(() => serverHandoffComplete ? genId() : void 0);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (id == null) {
      setId(genId());
    }
  }, []);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    serverHandoffComplete = true;
  }, []);
  return id;
}
const useReactId = SafeReact.useId;
const useId = useReactId || useFloatingId;
let devMessageSet;
if (true) {
  devMessageSet = /* @__PURE__ */ new Set();
}
function warn() {
  var _devMessageSet;
  for (var _len = arguments.length, messages = new Array(_len), _key = 0; _key < _len; _key++) {
    messages[_key] = arguments[_key];
  }
  const message = "Floating UI: " + messages.join(" ");
  if (!((_devMessageSet = devMessageSet) != null && _devMessageSet.has(message))) {
    var _devMessageSet2;
    (_devMessageSet2 = devMessageSet) == null || _devMessageSet2.add(message);
    console.warn(message);
  }
}
function error() {
  var _devMessageSet3;
  for (var _len2 = arguments.length, messages = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
    messages[_key2] = arguments[_key2];
  }
  const message = "Floating UI: " + messages.join(" ");
  if (!((_devMessageSet3 = devMessageSet) != null && _devMessageSet3.has(message))) {
    var _devMessageSet4;
    (_devMessageSet4 = devMessageSet) == null || _devMessageSet4.add(message);
    console.error(message);
  }
}
const FloatingArrow = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.forwardRef(function FloatingArrow2(props, ref) {
  const {
    context: {
      placement,
      elements: {
        floating
      },
      middlewareData: {
        arrow: arrow2,
        shift: shift2
      }
    },
    width = 14,
    height = 7,
    tipRadius = 0,
    strokeWidth = 0,
    staticOffset,
    stroke,
    d,
    style: {
      transform,
      ...restStyle
    } = {},
    ...rest
  } = props;
  if (true) {
    if (!ref) {
      warn("The `ref` prop is required for `FloatingArrow`.");
    }
  }
  const clipPathId = useId();
  const [isRTL, setIsRTL] = react__WEBPACK_IMPORTED_MODULE_0__.useState(false);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!floating) return;
    const isRTL2 = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.getComputedStyle)(floating).direction === "rtl";
    if (isRTL2) {
      setIsRTL(true);
    }
  }, [floating]);
  if (!floating) {
    return null;
  }
  const [side, alignment] = placement.split("-");
  const isVerticalSide = side === "top" || side === "bottom";
  let computedStaticOffset = staticOffset;
  if (isVerticalSide && shift2 != null && shift2.x || !isVerticalSide && shift2 != null && shift2.y) {
    computedStaticOffset = null;
  }
  const computedStrokeWidth = strokeWidth * 2;
  const halfStrokeWidth = computedStrokeWidth / 2;
  const svgX = width / 2 * (tipRadius / -8 + 1);
  const svgY = height / 2 * tipRadius / 4;
  const isCustomShape = !!d;
  const yOffsetProp = computedStaticOffset && alignment === "end" ? "bottom" : "top";
  let xOffsetProp = computedStaticOffset && alignment === "end" ? "right" : "left";
  if (computedStaticOffset && isRTL) {
    xOffsetProp = alignment === "end" ? "left" : "right";
  }
  const arrowX = (arrow2 == null ? void 0 : arrow2.x) != null ? computedStaticOffset || arrow2.x : "";
  const arrowY = (arrow2 == null ? void 0 : arrow2.y) != null ? computedStaticOffset || arrow2.y : "";
  const dValue = d || "M0,0" + (" H" + width) + (" L" + (width - svgX) + "," + (height - svgY)) + (" Q" + width / 2 + "," + height + " " + svgX + "," + (height - svgY)) + " Z";
  const rotation = {
    top: isCustomShape ? "rotate(180deg)" : "",
    left: isCustomShape ? "rotate(90deg)" : "rotate(-90deg)",
    bottom: isCustomShape ? "" : "rotate(180deg)",
    right: isCustomShape ? "rotate(-90deg)" : "rotate(90deg)"
  }[side];
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsxs)("svg", {
    ...rest,
    "aria-hidden": true,
    ref,
    width: isCustomShape ? width : width + computedStrokeWidth,
    height: width,
    viewBox: "0 0 " + width + " " + (height > width ? height : width),
    style: {
      position: "absolute",
      pointerEvents: "none",
      [xOffsetProp]: arrowX,
      [yOffsetProp]: arrowY,
      [side]: isVerticalSide || isCustomShape ? "100%" : "calc(100% - " + computedStrokeWidth / 2 + "px)",
      transform: [rotation, transform].filter((t) => !!t).join(" "),
      ...restStyle
    },
    children: [computedStrokeWidth > 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("path", {
      clipPath: "url(#" + clipPathId + ")",
      fill: "none",
      stroke,
      strokeWidth: computedStrokeWidth + (d ? 0 : 1),
      d: dValue
    }), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("path", {
      stroke: computedStrokeWidth && !d ? rest.fill : "none",
      d: dValue
    }), /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("clipPath", {
      id: clipPathId,
      children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("rect", {
        x: -halfStrokeWidth,
        y: halfStrokeWidth * (isCustomShape ? -1 : 1),
        width: width + computedStrokeWidth,
        height: width
      })
    })]
  });
});
function createEventEmitter() {
  const map = /* @__PURE__ */ new Map();
  return {
    emit(event, data) {
      var _map$get;
      (_map$get = map.get(event)) == null || _map$get.forEach((listener) => listener(data));
    },
    on(event, listener) {
      if (!map.has(event)) {
        map.set(event, /* @__PURE__ */ new Set());
      }
      map.get(event).add(listener);
    },
    off(event, listener) {
      var _map$get2;
      (_map$get2 = map.get(event)) == null || _map$get2.delete(listener);
    }
  };
}
const FloatingNodeContext = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.createContext(null);
const FloatingTreeContext = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.createContext(null);
const useFloatingParentNodeId = () => {
  var _React$useContext;
  return ((_React$useContext = react__WEBPACK_IMPORTED_MODULE_0__.useContext(FloatingNodeContext)) == null ? void 0 : _React$useContext.id) || null;
};
const useFloatingTree = () => react__WEBPACK_IMPORTED_MODULE_0__.useContext(FloatingTreeContext);
function useFloatingNodeId(customParentId) {
  const id = useId();
  const tree = useFloatingTree();
  const reactParentId = useFloatingParentNodeId();
  const parentId = customParentId || reactParentId;
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!id) return;
    const node = {
      id,
      parentId
    };
    tree == null || tree.addNode(node);
    return () => {
      tree == null || tree.removeNode(node);
    };
  }, [tree, id, parentId]);
  return id;
}
function FloatingNode(props) {
  const {
    children,
    id
  } = props;
  const parentId = useFloatingParentNodeId();
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(FloatingNodeContext.Provider, {
    value: react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
      id,
      parentId
    }), [id, parentId]),
    children
  });
}
function FloatingTree(props) {
  const {
    children
  } = props;
  const nodesRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef([]);
  const addNode = react__WEBPACK_IMPORTED_MODULE_0__.useCallback((node) => {
    nodesRef.current = [...nodesRef.current, node];
  }, []);
  const removeNode = react__WEBPACK_IMPORTED_MODULE_0__.useCallback((node) => {
    nodesRef.current = nodesRef.current.filter((n) => n !== node);
  }, []);
  const [events] = react__WEBPACK_IMPORTED_MODULE_0__.useState(() => createEventEmitter());
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(FloatingTreeContext.Provider, {
    value: react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
      nodesRef,
      addNode,
      removeNode,
      events
    }), [addNode, removeNode, events]),
    children
  });
}
function createAttribute(name) {
  return "data-floating-ui-" + name;
}
function clearTimeoutIfSet(timeoutRef) {
  if (timeoutRef.current !== -1) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = -1;
  }
}
const safePolygonIdentifier = /* @__PURE__ */ createAttribute("safe-polygon");
function getDelay(value, prop, pointerType) {
  if (pointerType && !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isMouseLikePointerType)(pointerType)) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "function") {
    const result = value();
    if (typeof result === "number") {
      return result;
    }
    return result == null ? void 0 : result[prop];
  }
  return value == null ? void 0 : value[prop];
}
function getRestMs(value) {
  if (typeof value === "function") {
    return value();
  }
  return value;
}
function useHover(context, props) {
  if (props === void 0) {
    props = {};
  }
  const {
    open,
    onOpenChange,
    dataRef,
    events,
    elements
  } = context;
  const {
    enabled = true,
    delay = 0,
    handleClose = null,
    mouseOnly = false,
    restMs = 0,
    move = true
  } = props;
  const tree = useFloatingTree();
  const parentId = useFloatingParentNodeId();
  const handleCloseRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(handleClose);
  const delayRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(delay);
  const openRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(open);
  const restMsRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(restMs);
  const pointerTypeRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef();
  const timeoutRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(-1);
  const handlerRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef();
  const restTimeoutRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(-1);
  const blockMouseMoveRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(true);
  const performedPointerEventsMutationRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const unbindMouseMoveRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(() => {
  });
  const restTimeoutPendingRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const isHoverOpen = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(() => {
    var _dataRef$current$open;
    const type = (_dataRef$current$open = dataRef.current.openEvent) == null ? void 0 : _dataRef$current$open.type;
    return (type == null ? void 0 : type.includes("mouse")) && type !== "mousedown";
  });
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!enabled) return;
    function onOpenChange2(_ref) {
      let {
        open: open2
      } = _ref;
      if (!open2) {
        clearTimeoutIfSet(timeoutRef);
        clearTimeoutIfSet(restTimeoutRef);
        blockMouseMoveRef.current = true;
        restTimeoutPendingRef.current = false;
      }
    }
    events.on("openchange", onOpenChange2);
    return () => {
      events.off("openchange", onOpenChange2);
    };
  }, [enabled, events]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!enabled) return;
    if (!handleCloseRef.current) return;
    if (!open) return;
    function onLeave(event) {
      if (isHoverOpen()) {
        onOpenChange(false, event, "hover");
      }
    }
    const html = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(elements.floating).documentElement;
    html.addEventListener("mouseleave", onLeave);
    return () => {
      html.removeEventListener("mouseleave", onLeave);
    };
  }, [elements.floating, open, onOpenChange, enabled, handleCloseRef, isHoverOpen]);
  const closeWithDelay = react__WEBPACK_IMPORTED_MODULE_0__.useCallback(function(event, runElseBranch, reason) {
    if (runElseBranch === void 0) {
      runElseBranch = true;
    }
    if (reason === void 0) {
      reason = "hover";
    }
    const closeDelay = getDelay(delayRef.current, "close", pointerTypeRef.current);
    if (closeDelay && !handlerRef.current) {
      clearTimeoutIfSet(timeoutRef);
      timeoutRef.current = window.setTimeout(() => onOpenChange(false, event, reason), closeDelay);
    } else if (runElseBranch) {
      clearTimeoutIfSet(timeoutRef);
      onOpenChange(false, event, reason);
    }
  }, [delayRef, onOpenChange]);
  const cleanupMouseMoveHandler = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(() => {
    unbindMouseMoveRef.current();
    handlerRef.current = void 0;
  });
  const clearPointerEvents = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(() => {
    if (performedPointerEventsMutationRef.current) {
      const body = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(elements.floating).body;
      body.style.pointerEvents = "";
      body.removeAttribute(safePolygonIdentifier);
      performedPointerEventsMutationRef.current = false;
    }
  });
  const isClickLikeOpenEvent = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(() => {
    return dataRef.current.openEvent ? ["click", "mousedown"].includes(dataRef.current.openEvent.type) : false;
  });
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!enabled) return;
    function onReferenceMouseEnter(event) {
      clearTimeoutIfSet(timeoutRef);
      blockMouseMoveRef.current = false;
      if (mouseOnly && !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isMouseLikePointerType)(pointerTypeRef.current) || getRestMs(restMsRef.current) > 0 && !getDelay(delayRef.current, "open")) {
        return;
      }
      const openDelay = getDelay(delayRef.current, "open", pointerTypeRef.current);
      if (openDelay) {
        timeoutRef.current = window.setTimeout(() => {
          if (!openRef.current) {
            onOpenChange(true, event, "hover");
          }
        }, openDelay);
      } else if (!open) {
        onOpenChange(true, event, "hover");
      }
    }
    function onReferenceMouseLeave(event) {
      if (isClickLikeOpenEvent()) {
        clearPointerEvents();
        return;
      }
      unbindMouseMoveRef.current();
      const doc = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(elements.floating);
      clearTimeoutIfSet(restTimeoutRef);
      restTimeoutPendingRef.current = false;
      if (handleCloseRef.current && dataRef.current.floatingContext) {
        if (!open) {
          clearTimeoutIfSet(timeoutRef);
        }
        handlerRef.current = handleCloseRef.current({
          ...dataRef.current.floatingContext,
          tree,
          x: event.clientX,
          y: event.clientY,
          onClose() {
            clearPointerEvents();
            cleanupMouseMoveHandler();
            if (!isClickLikeOpenEvent()) {
              closeWithDelay(event, true, "safe-polygon");
            }
          }
        });
        const handler = handlerRef.current;
        doc.addEventListener("mousemove", handler);
        unbindMouseMoveRef.current = () => {
          doc.removeEventListener("mousemove", handler);
        };
        return;
      }
      const shouldClose = pointerTypeRef.current === "touch" ? !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(elements.floating, event.relatedTarget) : true;
      if (shouldClose) {
        closeWithDelay(event);
      }
    }
    function onScrollMouseLeave(event) {
      if (isClickLikeOpenEvent()) return;
      if (!dataRef.current.floatingContext) return;
      handleCloseRef.current == null || handleCloseRef.current({
        ...dataRef.current.floatingContext,
        tree,
        x: event.clientX,
        y: event.clientY,
        onClose() {
          clearPointerEvents();
          cleanupMouseMoveHandler();
          if (!isClickLikeOpenEvent()) {
            closeWithDelay(event);
          }
        }
      })(event);
    }
    function onFloatingMouseEnter() {
      clearTimeoutIfSet(timeoutRef);
    }
    function onFloatingMouseLeave(event) {
      if (!isClickLikeOpenEvent()) {
        closeWithDelay(event, false);
      }
    }
    if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(elements.domReference)) {
      const reference2 = elements.domReference;
      const floating = elements.floating;
      if (open) {
        reference2.addEventListener("mouseleave", onScrollMouseLeave);
      }
      if (move) {
        reference2.addEventListener("mousemove", onReferenceMouseEnter, {
          once: true
        });
      }
      reference2.addEventListener("mouseenter", onReferenceMouseEnter);
      reference2.addEventListener("mouseleave", onReferenceMouseLeave);
      if (floating) {
        floating.addEventListener("mouseleave", onScrollMouseLeave);
        floating.addEventListener("mouseenter", onFloatingMouseEnter);
        floating.addEventListener("mouseleave", onFloatingMouseLeave);
      }
      return () => {
        if (open) {
          reference2.removeEventListener("mouseleave", onScrollMouseLeave);
        }
        if (move) {
          reference2.removeEventListener("mousemove", onReferenceMouseEnter);
        }
        reference2.removeEventListener("mouseenter", onReferenceMouseEnter);
        reference2.removeEventListener("mouseleave", onReferenceMouseLeave);
        if (floating) {
          floating.removeEventListener("mouseleave", onScrollMouseLeave);
          floating.removeEventListener("mouseenter", onFloatingMouseEnter);
          floating.removeEventListener("mouseleave", onFloatingMouseLeave);
        }
      };
    }
  }, [elements, enabled, context, mouseOnly, move, closeWithDelay, cleanupMouseMoveHandler, clearPointerEvents, onOpenChange, open, openRef, tree, delayRef, handleCloseRef, dataRef, isClickLikeOpenEvent, restMsRef]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    var _handleCloseRef$curre;
    if (!enabled) return;
    if (open && (_handleCloseRef$curre = handleCloseRef.current) != null && (_handleCloseRef$curre = _handleCloseRef$curre.__options) != null && _handleCloseRef$curre.blockPointerEvents && isHoverOpen()) {
      performedPointerEventsMutationRef.current = true;
      const floatingEl = elements.floating;
      if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(elements.domReference) && floatingEl) {
        var _tree$nodesRef$curren;
        const body = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(elements.floating).body;
        body.setAttribute(safePolygonIdentifier, "");
        const ref = elements.domReference;
        const parentFloating = tree == null || (_tree$nodesRef$curren = tree.nodesRef.current.find((node) => node.id === parentId)) == null || (_tree$nodesRef$curren = _tree$nodesRef$curren.context) == null ? void 0 : _tree$nodesRef$curren.elements.floating;
        if (parentFloating) {
          parentFloating.style.pointerEvents = "";
        }
        body.style.pointerEvents = "none";
        ref.style.pointerEvents = "auto";
        floatingEl.style.pointerEvents = "auto";
        return () => {
          body.style.pointerEvents = "";
          ref.style.pointerEvents = "";
          floatingEl.style.pointerEvents = "";
        };
      }
    }
  }, [enabled, open, parentId, elements, tree, handleCloseRef, isHoverOpen]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!open) {
      pointerTypeRef.current = void 0;
      restTimeoutPendingRef.current = false;
      cleanupMouseMoveHandler();
      clearPointerEvents();
    }
  }, [open, cleanupMouseMoveHandler, clearPointerEvents]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    return () => {
      cleanupMouseMoveHandler();
      clearTimeoutIfSet(timeoutRef);
      clearTimeoutIfSet(restTimeoutRef);
      clearPointerEvents();
    };
  }, [enabled, elements.domReference, cleanupMouseMoveHandler, clearPointerEvents]);
  const reference = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    function setPointerRef(event) {
      pointerTypeRef.current = event.pointerType;
    }
    return {
      onPointerDown: setPointerRef,
      onPointerEnter: setPointerRef,
      onMouseMove(event) {
        const {
          nativeEvent
        } = event;
        function handleMouseMove() {
          if (!blockMouseMoveRef.current && !openRef.current) {
            onOpenChange(true, nativeEvent, "hover");
          }
        }
        if (mouseOnly && !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isMouseLikePointerType)(pointerTypeRef.current)) {
          return;
        }
        if (open || getRestMs(restMsRef.current) === 0) {
          return;
        }
        if (restTimeoutPendingRef.current && event.movementX ** 2 + event.movementY ** 2 < 2) {
          return;
        }
        clearTimeoutIfSet(restTimeoutRef);
        if (pointerTypeRef.current === "touch") {
          handleMouseMove();
        } else {
          restTimeoutPendingRef.current = true;
          restTimeoutRef.current = window.setTimeout(handleMouseMove, getRestMs(restMsRef.current));
        }
      }
    };
  }, [mouseOnly, onOpenChange, open, openRef, restMsRef]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => enabled ? {
    reference
  } : {}, [enabled, reference]);
}
const NOOP = () => {
};
const FloatingDelayGroupContext = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.createContext({
  delay: 0,
  initialDelay: 0,
  timeoutMs: 0,
  currentId: null,
  setCurrentId: NOOP,
  setState: NOOP,
  isInstantPhase: false
});
const useDelayGroupContext = () => react__WEBPACK_IMPORTED_MODULE_0__.useContext(FloatingDelayGroupContext);
function FloatingDelayGroup(props) {
  const {
    children,
    delay,
    timeoutMs = 0
  } = props;
  const [state, setState] = react__WEBPACK_IMPORTED_MODULE_0__.useReducer((prev, next) => ({
    ...prev,
    ...next
  }), {
    delay,
    timeoutMs,
    initialDelay: delay,
    currentId: null,
    isInstantPhase: false
  });
  const initialCurrentIdRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const setCurrentId = react__WEBPACK_IMPORTED_MODULE_0__.useCallback((currentId) => {
    setState({
      currentId
    });
  }, []);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (state.currentId) {
      if (initialCurrentIdRef.current === null) {
        initialCurrentIdRef.current = state.currentId;
      } else if (!state.isInstantPhase) {
        setState({
          isInstantPhase: true
        });
      }
    } else {
      if (state.isInstantPhase) {
        setState({
          isInstantPhase: false
        });
      }
      initialCurrentIdRef.current = null;
    }
  }, [state.currentId, state.isInstantPhase]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(FloatingDelayGroupContext.Provider, {
    value: react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
      ...state,
      setState,
      setCurrentId
    }), [state, setCurrentId]),
    children
  });
}
function useDelayGroup(context, options) {
  if (options === void 0) {
    options = {};
  }
  const {
    open,
    onOpenChange,
    floatingId
  } = context;
  const {
    id: optionId,
    enabled = true
  } = options;
  const id = optionId != null ? optionId : floatingId;
  const groupContext = useDelayGroupContext();
  const {
    currentId,
    setCurrentId,
    initialDelay,
    setState,
    timeoutMs
  } = groupContext;
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!enabled) return;
    if (!currentId) return;
    setState({
      delay: {
        open: 1,
        close: getDelay(initialDelay, "close")
      }
    });
    if (currentId !== id) {
      onOpenChange(false);
    }
  }, [enabled, id, onOpenChange, setState, currentId, initialDelay]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    function unset() {
      onOpenChange(false);
      setState({
        delay: initialDelay,
        currentId: null
      });
    }
    if (!enabled) return;
    if (!currentId) return;
    if (!open && currentId === id) {
      if (timeoutMs) {
        const timeout = window.setTimeout(unset, timeoutMs);
        return () => {
          clearTimeout(timeout);
        };
      }
      unset();
    }
  }, [enabled, open, setState, currentId, id, onOpenChange, initialDelay, timeoutMs]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!enabled) return;
    if (setCurrentId === NOOP || !open) return;
    setCurrentId(id);
  }, [enabled, open, setCurrentId, id]);
  return groupContext;
}
const NextFloatingDelayGroupContext = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.createContext({
  hasProvider: false,
  timeoutMs: 0,
  delayRef: {
    current: 0
  },
  initialDelayRef: {
    current: 0
  },
  timeoutIdRef: {
    current: -1
  },
  currentIdRef: {
    current: null
  },
  currentContextRef: {
    current: null
  }
});
function NextFloatingDelayGroup(props) {
  const {
    children,
    delay,
    timeoutMs = 0
  } = props;
  const delayRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(delay);
  const initialDelayRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(delay);
  const currentIdRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const currentContextRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const timeoutIdRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(-1);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(NextFloatingDelayGroupContext.Provider, {
    value: react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
      hasProvider: true,
      delayRef,
      initialDelayRef,
      currentIdRef,
      timeoutMs,
      currentContextRef,
      timeoutIdRef
    }), [timeoutMs]),
    children
  });
}
function useNextDelayGroup(context, options) {
  if (options === void 0) {
    options = {};
  }
  const {
    open,
    onOpenChange,
    floatingId
  } = context;
  const {
    enabled = true
  } = options;
  const groupContext = react__WEBPACK_IMPORTED_MODULE_0__.useContext(NextFloatingDelayGroupContext);
  const {
    currentIdRef,
    delayRef,
    timeoutMs,
    initialDelayRef,
    currentContextRef,
    hasProvider,
    timeoutIdRef
  } = groupContext;
  const [isInstantPhase, setIsInstantPhase] = react__WEBPACK_IMPORTED_MODULE_0__.useState(false);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    function unset() {
      var _currentContextRef$cu;
      setIsInstantPhase(false);
      (_currentContextRef$cu = currentContextRef.current) == null || _currentContextRef$cu.setIsInstantPhase(false);
      currentIdRef.current = null;
      currentContextRef.current = null;
      delayRef.current = initialDelayRef.current;
    }
    if (!enabled) return;
    if (!currentIdRef.current) return;
    if (!open && currentIdRef.current === floatingId) {
      setIsInstantPhase(false);
      if (timeoutMs) {
        timeoutIdRef.current = window.setTimeout(unset, timeoutMs);
        return () => {
          clearTimeout(timeoutIdRef.current);
        };
      }
      unset();
    }
  }, [enabled, open, floatingId, currentIdRef, delayRef, timeoutMs, initialDelayRef, currentContextRef, timeoutIdRef]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!enabled) return;
    if (!open) return;
    const prevContext = currentContextRef.current;
    const prevId = currentIdRef.current;
    currentContextRef.current = {
      onOpenChange,
      setIsInstantPhase
    };
    currentIdRef.current = floatingId;
    delayRef.current = {
      open: 0,
      close: getDelay(initialDelayRef.current, "close")
    };
    if (prevId !== null && prevId !== floatingId) {
      clearTimeoutIfSet(timeoutIdRef);
      setIsInstantPhase(true);
      prevContext == null || prevContext.setIsInstantPhase(true);
      prevContext == null || prevContext.onOpenChange(false);
    } else {
      setIsInstantPhase(false);
      prevContext == null || prevContext.setIsInstantPhase(false);
    }
  }, [enabled, open, floatingId, onOpenChange, currentIdRef, delayRef, timeoutMs, initialDelayRef, currentContextRef, timeoutIdRef]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    return () => {
      currentContextRef.current = null;
    };
  }, [currentContextRef]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    hasProvider,
    delayRef,
    isInstantPhase
  }), [hasProvider, delayRef, isInstantPhase]);
}
let rafId = 0;
function enqueueFocus(el, options) {
  if (options === void 0) {
    options = {};
  }
  const {
    preventScroll = false,
    cancelPrevious = true,
    sync = false
  } = options;
  cancelPrevious && cancelAnimationFrame(rafId);
  const exec = () => el == null ? void 0 : el.focus({
    preventScroll
  });
  if (sync) {
    exec();
  } else {
    rafId = requestAnimationFrame(exec);
  }
}
function contains(parent, child) {
  if (!parent || !child) {
    return false;
  }
  const rootNode = child.getRootNode == null ? void 0 : child.getRootNode();
  if (parent.contains(child)) {
    return true;
  }
  if (rootNode && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isShadowRoot)(rootNode)) {
    let next = child;
    while (next) {
      if (parent === next) {
        return true;
      }
      next = next.parentNode || next.host;
    }
  }
  return false;
}
function getTarget(event) {
  if ("composedPath" in event) {
    return event.composedPath()[0];
  }
  return event.target;
}
function getDocument(node) {
  return (node == null ? void 0 : node.ownerDocument) || document;
}
const counters = {
  inert: /* @__PURE__ */ new WeakMap(),
  "aria-hidden": /* @__PURE__ */ new WeakMap(),
  none: /* @__PURE__ */ new WeakMap()
};
function getCounterMap(control) {
  if (control === "inert") return counters.inert;
  if (control === "aria-hidden") return counters["aria-hidden"];
  return counters.none;
}
let uncontrolledElementsSet = /* @__PURE__ */ new WeakSet();
let markerMap = {};
let lockCount$1 = 0;
const supportsInert = () => typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype;
function unwrapHost(node) {
  if (!node) {
    return null;
  }
  return (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isShadowRoot)(node) ? node.host : unwrapHost(node.parentNode);
}
const correctElements = (parent, targets) => targets.map((target) => {
  if (parent.contains(target)) {
    return target;
  }
  const correctedTarget = unwrapHost(target);
  if (parent.contains(correctedTarget)) {
    return correctedTarget;
  }
  return null;
}).filter((x) => x != null);
function applyAttributeToOthers(uncorrectedAvoidElements, body, ariaHidden, inert) {
  const markerName = "data-floating-ui-inert";
  const controlAttribute = inert ? "inert" : ariaHidden ? "aria-hidden" : null;
  const avoidElements = correctElements(body, uncorrectedAvoidElements);
  const elementsToKeep = /* @__PURE__ */ new Set();
  const elementsToStop = new Set(avoidElements);
  const hiddenElements = [];
  if (!markerMap[markerName]) {
    markerMap[markerName] = /* @__PURE__ */ new WeakMap();
  }
  const markerCounter = markerMap[markerName];
  avoidElements.forEach(keep);
  deep(body);
  elementsToKeep.clear();
  function keep(el) {
    if (!el || elementsToKeep.has(el)) {
      return;
    }
    elementsToKeep.add(el);
    el.parentNode && keep(el.parentNode);
  }
  function deep(parent) {
    if (!parent || elementsToStop.has(parent)) {
      return;
    }
    [].forEach.call(parent.children, (node) => {
      if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.getNodeName)(node) === "script") return;
      if (elementsToKeep.has(node)) {
        deep(node);
      } else {
        const attr2 = controlAttribute ? node.getAttribute(controlAttribute) : null;
        const alreadyHidden = attr2 !== null && attr2 !== "false";
        const counterMap = getCounterMap(controlAttribute);
        const counterValue = (counterMap.get(node) || 0) + 1;
        const markerValue = (markerCounter.get(node) || 0) + 1;
        counterMap.set(node, counterValue);
        markerCounter.set(node, markerValue);
        hiddenElements.push(node);
        if (counterValue === 1 && alreadyHidden) {
          uncontrolledElementsSet.add(node);
        }
        if (markerValue === 1) {
          node.setAttribute(markerName, "");
        }
        if (!alreadyHidden && controlAttribute) {
          node.setAttribute(controlAttribute, controlAttribute === "inert" ? "" : "true");
        }
      }
    });
  }
  lockCount$1++;
  return () => {
    hiddenElements.forEach((element) => {
      const counterMap = getCounterMap(controlAttribute);
      const currentCounterValue = counterMap.get(element) || 0;
      const counterValue = currentCounterValue - 1;
      const markerValue = (markerCounter.get(element) || 0) - 1;
      counterMap.set(element, counterValue);
      markerCounter.set(element, markerValue);
      if (!counterValue) {
        if (!uncontrolledElementsSet.has(element) && controlAttribute) {
          element.removeAttribute(controlAttribute);
        }
        uncontrolledElementsSet.delete(element);
      }
      if (!markerValue) {
        element.removeAttribute(markerName);
      }
    });
    lockCount$1--;
    if (!lockCount$1) {
      counters.inert = /* @__PURE__ */ new WeakMap();
      counters["aria-hidden"] = /* @__PURE__ */ new WeakMap();
      counters.none = /* @__PURE__ */ new WeakMap();
      uncontrolledElementsSet = /* @__PURE__ */ new WeakSet();
      markerMap = {};
    }
  };
}
function markOthers(avoidElements, ariaHidden, inert) {
  if (ariaHidden === void 0) {
    ariaHidden = false;
  }
  if (inert === void 0) {
    inert = false;
  }
  const body = getDocument(avoidElements[0]).body;
  return applyAttributeToOthers(avoidElements.concat(Array.from(body.querySelectorAll('[aria-live],[role="status"],output'))), body, ariaHidden, inert);
}
const HIDDEN_STYLES = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: 0,
  position: "fixed",
  whiteSpace: "nowrap",
  width: "1px",
  top: 0,
  left: 0
};
const FocusGuard = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.forwardRef(function FocusGuard2(props, ref) {
  const [role, setRole] = react__WEBPACK_IMPORTED_MODULE_0__.useState();
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isSafari)()) {
      setRole("button");
    }
  }, []);
  const restProps = {
    ref,
    tabIndex: 0,
    // Role is only for VoiceOver
    role,
    "aria-hidden": role ? void 0 : true,
    [createAttribute("focus-guard")]: "",
    style: HIDDEN_STYLES
  };
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("span", {
    ...props,
    ...restProps
  });
});
const HIDDEN_OWNER_STYLES = {
  clipPath: "inset(50%)",
  position: "fixed",
  top: 0,
  left: 0
};
const PortalContext = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.createContext(null);
const attr = /* @__PURE__ */ createAttribute("portal");
function useFloatingPortalNode(props) {
  if (props === void 0) {
    props = {};
  }
  const {
    id,
    root
  } = props;
  const uniqueId = useId();
  const portalContext = usePortalContext();
  const [portalNode, setPortalNode] = react__WEBPACK_IMPORTED_MODULE_0__.useState(null);
  const portalNodeRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    return () => {
      portalNode == null || portalNode.remove();
      queueMicrotask(() => {
        portalNodeRef.current = null;
      });
    };
  }, [portalNode]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!uniqueId) return;
    if (portalNodeRef.current) return;
    const existingIdRoot = id ? document.getElementById(id) : null;
    if (!existingIdRoot) return;
    const subRoot = document.createElement("div");
    subRoot.id = uniqueId;
    subRoot.setAttribute(attr, "");
    existingIdRoot.appendChild(subRoot);
    portalNodeRef.current = subRoot;
    setPortalNode(subRoot);
  }, [id, uniqueId]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (root === null) return;
    if (!uniqueId) return;
    if (portalNodeRef.current) return;
    let container = root || (portalContext == null ? void 0 : portalContext.portalNode);
    if (container && !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isNode)(container)) container = container.current;
    container = container || document.body;
    let idWrapper = null;
    if (id) {
      idWrapper = document.createElement("div");
      idWrapper.id = id;
      container.appendChild(idWrapper);
    }
    const subRoot = document.createElement("div");
    subRoot.id = uniqueId;
    subRoot.setAttribute(attr, "");
    container = idWrapper || container;
    container.appendChild(subRoot);
    portalNodeRef.current = subRoot;
    setPortalNode(subRoot);
  }, [id, root, uniqueId, portalContext]);
  return portalNode;
}
function FloatingPortal(props) {
  const {
    children,
    id,
    root,
    preserveTabOrder = true
  } = props;
  const portalNode = useFloatingPortalNode({
    id,
    root
  });
  const [focusManagerState, setFocusManagerState] = react__WEBPACK_IMPORTED_MODULE_0__.useState(null);
  const beforeOutsideRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const afterOutsideRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const beforeInsideRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const afterInsideRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const modal = focusManagerState == null ? void 0 : focusManagerState.modal;
  const open = focusManagerState == null ? void 0 : focusManagerState.open;
  const shouldRenderGuards = (
    // The FocusManager and therefore floating element are currently open/
    // rendered.
    !!focusManagerState && // Guards are only for non-modal focus management.
    !focusManagerState.modal && // Don't render if unmount is transitioning.
    focusManagerState.open && preserveTabOrder && !!(root || portalNode)
  );
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!portalNode || !preserveTabOrder || modal) {
      return;
    }
    function onFocus(event) {
      if (portalNode && (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isOutsideEvent)(event)) {
        const focusing = event.type === "focusin";
        const manageFocus = focusing ? _floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.enableFocusInside : _floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.disableFocusInside;
        manageFocus(portalNode);
      }
    }
    portalNode.addEventListener("focusin", onFocus, true);
    portalNode.addEventListener("focusout", onFocus, true);
    return () => {
      portalNode.removeEventListener("focusin", onFocus, true);
      portalNode.removeEventListener("focusout", onFocus, true);
    };
  }, [portalNode, preserveTabOrder, modal]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!portalNode) return;
    if (open) return;
    (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.enableFocusInside)(portalNode);
  }, [open, portalNode]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsxs)(PortalContext.Provider, {
    value: react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
      preserveTabOrder,
      beforeOutsideRef,
      afterOutsideRef,
      beforeInsideRef,
      afterInsideRef,
      portalNode,
      setFocusManagerState
    }), [preserveTabOrder, portalNode]),
    children: [shouldRenderGuards && portalNode && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(FocusGuard, {
      "data-type": "outside",
      ref: beforeOutsideRef,
      onFocus: (event) => {
        if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isOutsideEvent)(event, portalNode)) {
          var _beforeInsideRef$curr;
          (_beforeInsideRef$curr = beforeInsideRef.current) == null || _beforeInsideRef$curr.focus();
        } else {
          const domReference = focusManagerState ? focusManagerState.domReference : null;
          const prevTabbable = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getPreviousTabbable)(domReference);
          prevTabbable == null || prevTabbable.focus();
        }
      }
    }), shouldRenderGuards && portalNode && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("span", {
      "aria-owns": portalNode.id,
      style: HIDDEN_OWNER_STYLES
    }), portalNode && /* @__PURE__ */ react_dom__WEBPACK_IMPORTED_MODULE_5__.createPortal(children, portalNode), shouldRenderGuards && portalNode && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(FocusGuard, {
      "data-type": "outside",
      ref: afterOutsideRef,
      onFocus: (event) => {
        if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isOutsideEvent)(event, portalNode)) {
          var _afterInsideRef$curre;
          (_afterInsideRef$curre = afterInsideRef.current) == null || _afterInsideRef$curre.focus();
        } else {
          const domReference = focusManagerState ? focusManagerState.domReference : null;
          const nextTabbable = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getNextTabbable)(domReference);
          nextTabbable == null || nextTabbable.focus();
          (focusManagerState == null ? void 0 : focusManagerState.closeOnFocusOut) && (focusManagerState == null ? void 0 : focusManagerState.onOpenChange(false, event.nativeEvent, "focus-out"));
        }
      }
    })]
  });
}
const usePortalContext = () => react__WEBPACK_IMPORTED_MODULE_0__.useContext(PortalContext);
function useLiteMergeRefs(refs) {
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    return (value) => {
      refs.forEach((ref) => {
        if (ref) {
          ref.current = value;
        }
      });
    };
  }, refs);
}
const LIST_LIMIT = 20;
let previouslyFocusedElements = [];
function clearDisconnectedPreviouslyFocusedElements() {
  previouslyFocusedElements = previouslyFocusedElements.filter((elementRef) => {
    var _elementRef$deref;
    return (_elementRef$deref = elementRef.deref()) == null ? void 0 : _elementRef$deref.isConnected;
  });
}
function addPreviouslyFocusedElement(element) {
  clearDisconnectedPreviouslyFocusedElements();
  if (element && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.getNodeName)(element) !== "body") {
    previouslyFocusedElements.push(new WeakRef(element));
    if (previouslyFocusedElements.length > LIST_LIMIT) {
      previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
    }
  }
}
function getPreviouslyFocusedElement() {
  clearDisconnectedPreviouslyFocusedElements();
  const elementRef = previouslyFocusedElements[previouslyFocusedElements.length - 1];
  return elementRef == null ? void 0 : elementRef.deref();
}
function getFirstTabbableElement(container) {
  const tabbableOptions = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTabbableOptions)();
  if ((0,tabbable__WEBPACK_IMPORTED_MODULE_4__.isTabbable)(container, tabbableOptions)) {
    return container;
  }
  return (0,tabbable__WEBPACK_IMPORTED_MODULE_4__.tabbable)(container, tabbableOptions)[0] || container;
}
function handleTabIndex(floatingFocusElement, orderRef) {
  var _floatingFocusElement;
  if (!orderRef.current.includes("floating") && !((_floatingFocusElement = floatingFocusElement.getAttribute("role")) != null && _floatingFocusElement.includes("dialog"))) {
    return;
  }
  const options = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTabbableOptions)();
  const focusableElements = (0,tabbable__WEBPACK_IMPORTED_MODULE_4__.focusable)(floatingFocusElement, options);
  const tabbableContent = focusableElements.filter((element) => {
    const dataTabIndex = element.getAttribute("data-tabindex") || "";
    return (0,tabbable__WEBPACK_IMPORTED_MODULE_4__.isTabbable)(element, options) || element.hasAttribute("data-tabindex") && !dataTabIndex.startsWith("-");
  });
  const tabIndex = floatingFocusElement.getAttribute("tabindex");
  if (orderRef.current.includes("floating") || tabbableContent.length === 0) {
    if (tabIndex !== "0") {
      floatingFocusElement.setAttribute("tabindex", "0");
    }
  } else if (tabIndex !== "-1" || floatingFocusElement.hasAttribute("data-tabindex") && floatingFocusElement.getAttribute("data-tabindex") !== "-1") {
    floatingFocusElement.setAttribute("tabindex", "-1");
    floatingFocusElement.setAttribute("data-tabindex", "-1");
  }
}
const VisuallyHiddenDismiss = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.forwardRef(function VisuallyHiddenDismiss2(props, ref) {
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("button", {
    ...props,
    type: "button",
    ref,
    tabIndex: -1,
    style: HIDDEN_STYLES
  });
});
function FloatingFocusManager(props) {
  const {
    context,
    children,
    disabled = false,
    order = ["content"],
    guards: _guards = true,
    initialFocus = 0,
    returnFocus = true,
    restoreFocus = false,
    modal = true,
    visuallyHiddenDismiss = false,
    closeOnFocusOut = true,
    outsideElementsInert = false,
    getInsideElements: _getInsideElements = () => []
  } = props;
  const {
    open,
    onOpenChange,
    events,
    dataRef,
    elements: {
      domReference,
      floating
    }
  } = context;
  const getNodeId = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(() => {
    var _dataRef$current$floa;
    return (_dataRef$current$floa = dataRef.current.floatingContext) == null ? void 0 : _dataRef$current$floa.nodeId;
  });
  const getInsideElements = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(_getInsideElements);
  const ignoreInitialFocus = typeof initialFocus === "number" && initialFocus < 0;
  const isUntrappedTypeableCombobox = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isTypeableCombobox)(domReference) && ignoreInitialFocus;
  const inertSupported = supportsInert();
  const guards = inertSupported ? _guards : true;
  const useInert = !guards || inertSupported && outsideElementsInert;
  const orderRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(order);
  const initialFocusRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(initialFocus);
  const returnFocusRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(returnFocus);
  const tree = useFloatingTree();
  const portalContext = usePortalContext();
  const startDismissButtonRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const endDismissButtonRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const preventReturnFocusRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const isPointerDownRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const tabbableIndexRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(-1);
  const blurTimeoutRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(-1);
  const isInsidePortal = portalContext != null;
  const floatingFocusElement = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getFloatingFocusElement)(floating);
  const getTabbableContent = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(function(container) {
    if (container === void 0) {
      container = floatingFocusElement;
    }
    return container ? (0,tabbable__WEBPACK_IMPORTED_MODULE_4__.tabbable)(container, (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTabbableOptions)()) : [];
  });
  const getTabbableElements = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((container) => {
    const content = getTabbableContent(container);
    return orderRef.current.map((type) => {
      if (domReference && type === "reference") {
        return domReference;
      }
      if (floatingFocusElement && type === "floating") {
        return floatingFocusElement;
      }
      return content;
    }).filter(Boolean).flat();
  });
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (disabled) return;
    if (!modal) return;
    function onKeyDown(event) {
      if (event.key === "Tab") {
        if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(floatingFocusElement, (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.activeElement)((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(floatingFocusElement))) && getTabbableContent().length === 0 && !isUntrappedTypeableCombobox) {
          (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
        }
        const els = getTabbableElements();
        const target = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTarget)(event);
        if (orderRef.current[0] === "reference" && target === domReference) {
          (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
          if (event.shiftKey) {
            enqueueFocus(els[els.length - 1]);
          } else {
            enqueueFocus(els[1]);
          }
        }
        if (orderRef.current[1] === "floating" && target === floatingFocusElement && event.shiftKey) {
          (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
          enqueueFocus(els[0]);
        }
      }
    }
    const doc = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(floatingFocusElement);
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [disabled, domReference, floatingFocusElement, modal, orderRef, isUntrappedTypeableCombobox, getTabbableContent, getTabbableElements]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (disabled) return;
    if (!floating) return;
    function handleFocusIn(event) {
      const target = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTarget)(event);
      const tabbableContent = getTabbableContent();
      const tabbableIndex = tabbableContent.indexOf(target);
      if (tabbableIndex !== -1) {
        tabbableIndexRef.current = tabbableIndex;
      }
    }
    floating.addEventListener("focusin", handleFocusIn);
    return () => {
      floating.removeEventListener("focusin", handleFocusIn);
    };
  }, [disabled, floating, getTabbableContent]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (disabled) return;
    if (!closeOnFocusOut) return;
    function handlePointerDown() {
      isPointerDownRef.current = true;
      setTimeout(() => {
        isPointerDownRef.current = false;
      });
    }
    function handleFocusOutside(event) {
      const relatedTarget = event.relatedTarget;
      const currentTarget = event.currentTarget;
      const target = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTarget)(event);
      queueMicrotask(() => {
        const nodeId = getNodeId();
        const movedToUnrelatedNode = !((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(domReference, relatedTarget) || (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(floating, relatedTarget) || (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(relatedTarget, floating) || (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(portalContext == null ? void 0 : portalContext.portalNode, relatedTarget) || relatedTarget != null && relatedTarget.hasAttribute(createAttribute("focus-guard")) || tree && ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getNodeChildren)(tree.nodesRef.current, nodeId).find((node) => {
          var _node$context, _node$context2;
          return (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)((_node$context = node.context) == null ? void 0 : _node$context.elements.floating, relatedTarget) || (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)((_node$context2 = node.context) == null ? void 0 : _node$context2.elements.domReference, relatedTarget);
        }) || (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getNodeAncestors)(tree.nodesRef.current, nodeId).find((node) => {
          var _node$context3, _node$context4, _node$context5;
          return [(_node$context3 = node.context) == null ? void 0 : _node$context3.elements.floating, (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getFloatingFocusElement)((_node$context4 = node.context) == null ? void 0 : _node$context4.elements.floating)].includes(relatedTarget) || ((_node$context5 = node.context) == null ? void 0 : _node$context5.elements.domReference) === relatedTarget;
        })));
        if (currentTarget === domReference && floatingFocusElement) {
          handleTabIndex(floatingFocusElement, orderRef);
        }
        if (restoreFocus && currentTarget !== domReference && !(target != null && target.isConnected) && (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.activeElement)((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(floatingFocusElement)) === (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(floatingFocusElement).body) {
          if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isHTMLElement)(floatingFocusElement)) {
            floatingFocusElement.focus();
          }
          const prevTabbableIndex = tabbableIndexRef.current;
          const tabbableContent = getTabbableContent();
          const nodeToFocus = tabbableContent[prevTabbableIndex] || tabbableContent[tabbableContent.length - 1] || floatingFocusElement;
          if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isHTMLElement)(nodeToFocus)) {
            nodeToFocus.focus();
          }
        }
        if (dataRef.current.insideReactTree) {
          dataRef.current.insideReactTree = false;
          return;
        }
        if ((isUntrappedTypeableCombobox ? true : !modal) && relatedTarget && movedToUnrelatedNode && !isPointerDownRef.current && // Fix React 18 Strict Mode returnFocus due to double rendering.
        relatedTarget !== getPreviouslyFocusedElement()) {
          preventReturnFocusRef.current = true;
          onOpenChange(false, event, "focus-out");
        }
      });
    }
    const shouldHandleBlurCapture = Boolean(!tree && portalContext);
    function markInsideReactTree() {
      clearTimeoutIfSet(blurTimeoutRef);
      dataRef.current.insideReactTree = true;
      blurTimeoutRef.current = window.setTimeout(() => {
        dataRef.current.insideReactTree = false;
      });
    }
    if (floating && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isHTMLElement)(domReference)) {
      domReference.addEventListener("focusout", handleFocusOutside);
      domReference.addEventListener("pointerdown", handlePointerDown);
      floating.addEventListener("focusout", handleFocusOutside);
      if (shouldHandleBlurCapture) {
        floating.addEventListener("focusout", markInsideReactTree, true);
      }
      return () => {
        domReference.removeEventListener("focusout", handleFocusOutside);
        domReference.removeEventListener("pointerdown", handlePointerDown);
        floating.removeEventListener("focusout", handleFocusOutside);
        if (shouldHandleBlurCapture) {
          floating.removeEventListener("focusout", markInsideReactTree, true);
        }
      };
    }
  }, [disabled, domReference, floating, floatingFocusElement, modal, tree, portalContext, onOpenChange, closeOnFocusOut, restoreFocus, getTabbableContent, isUntrappedTypeableCombobox, getNodeId, orderRef, dataRef]);
  const beforeGuardRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const afterGuardRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const mergedBeforeGuardRef = useLiteMergeRefs([beforeGuardRef, portalContext == null ? void 0 : portalContext.beforeInsideRef]);
  const mergedAfterGuardRef = useLiteMergeRefs([afterGuardRef, portalContext == null ? void 0 : portalContext.afterInsideRef]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    var _portalContext$portal, _ancestors$find;
    if (disabled) return;
    if (!floating) return;
    const portalNodes = Array.from((portalContext == null || (_portalContext$portal = portalContext.portalNode) == null ? void 0 : _portalContext$portal.querySelectorAll("[" + createAttribute("portal") + "]")) || []);
    const ancestors = tree ? (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getNodeAncestors)(tree.nodesRef.current, getNodeId()) : [];
    const rootAncestorComboboxDomReference = (_ancestors$find = ancestors.find((node) => {
      var _node$context6;
      return (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isTypeableCombobox)(((_node$context6 = node.context) == null ? void 0 : _node$context6.elements.domReference) || null);
    })) == null || (_ancestors$find = _ancestors$find.context) == null ? void 0 : _ancestors$find.elements.domReference;
    const insideElements = [floating, rootAncestorComboboxDomReference, ...portalNodes, ...getInsideElements(), startDismissButtonRef.current, endDismissButtonRef.current, beforeGuardRef.current, afterGuardRef.current, portalContext == null ? void 0 : portalContext.beforeOutsideRef.current, portalContext == null ? void 0 : portalContext.afterOutsideRef.current, orderRef.current.includes("reference") || isUntrappedTypeableCombobox ? domReference : null].filter((x) => x != null);
    const cleanup2 = modal || isUntrappedTypeableCombobox ? markOthers(insideElements, !useInert, useInert) : markOthers(insideElements);
    return () => {
      cleanup2();
    };
  }, [disabled, domReference, floating, modal, orderRef, portalContext, isUntrappedTypeableCombobox, guards, useInert, tree, getNodeId, getInsideElements]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (disabled || !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isHTMLElement)(floatingFocusElement)) return;
    const doc = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(floatingFocusElement);
    const previouslyFocusedElement = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.activeElement)(doc);
    queueMicrotask(() => {
      const focusableElements = getTabbableElements(floatingFocusElement);
      const initialFocusValue = initialFocusRef.current;
      const elToFocus = (typeof initialFocusValue === "number" ? focusableElements[initialFocusValue] : initialFocusValue.current) || floatingFocusElement;
      const focusAlreadyInsideFloatingEl = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(floatingFocusElement, previouslyFocusedElement);
      if (!ignoreInitialFocus && !focusAlreadyInsideFloatingEl && open) {
        enqueueFocus(elToFocus, {
          preventScroll: elToFocus === floatingFocusElement
        });
      }
    });
  }, [disabled, open, floatingFocusElement, ignoreInitialFocus, getTabbableElements, initialFocusRef]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (disabled || !floatingFocusElement) return;
    const doc = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(floatingFocusElement);
    const previouslyFocusedElement = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.activeElement)(doc);
    addPreviouslyFocusedElement(previouslyFocusedElement);
    function onOpenChange2(_ref) {
      let {
        reason,
        event,
        nested
      } = _ref;
      if (["hover", "safe-polygon"].includes(reason) && event.type === "mouseleave") {
        preventReturnFocusRef.current = true;
      }
      if (reason !== "outside-press") return;
      if (nested) {
        preventReturnFocusRef.current = false;
      } else if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isVirtualClick)(event) || (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isVirtualPointerEvent)(event)) {
        preventReturnFocusRef.current = false;
      } else {
        let isPreventScrollSupported = false;
        document.createElement("div").focus({
          get preventScroll() {
            isPreventScrollSupported = true;
            return false;
          }
        });
        if (isPreventScrollSupported) {
          preventReturnFocusRef.current = false;
        } else {
          preventReturnFocusRef.current = true;
        }
      }
    }
    events.on("openchange", onOpenChange2);
    const fallbackEl = doc.createElement("span");
    fallbackEl.setAttribute("tabindex", "-1");
    fallbackEl.setAttribute("aria-hidden", "true");
    Object.assign(fallbackEl.style, HIDDEN_STYLES);
    if (isInsidePortal && domReference) {
      domReference.insertAdjacentElement("afterend", fallbackEl);
    }
    function getReturnElement() {
      if (typeof returnFocusRef.current === "boolean") {
        const el = domReference || getPreviouslyFocusedElement();
        return el && el.isConnected ? el : fallbackEl;
      }
      return returnFocusRef.current.current || fallbackEl;
    }
    return () => {
      events.off("openchange", onOpenChange2);
      const activeEl = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.activeElement)(doc);
      const isFocusInsideFloatingTree = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(floating, activeEl) || tree && (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getNodeChildren)(tree.nodesRef.current, getNodeId(), false).some((node) => {
        var _node$context7;
        return (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)((_node$context7 = node.context) == null ? void 0 : _node$context7.elements.floating, activeEl);
      });
      const returnElement = getReturnElement();
      queueMicrotask(() => {
        const tabbableReturnElement = getFirstTabbableElement(returnElement);
        if (
          // eslint-disable-next-line react-hooks/exhaustive-deps
          returnFocusRef.current && !preventReturnFocusRef.current && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isHTMLElement)(tabbableReturnElement) && // If the focus moved somewhere else after mount, avoid returning focus
          // since it likely entered a different element which should be
          // respected: https://github.com/floating-ui/floating-ui/issues/2607
          (tabbableReturnElement !== activeEl && activeEl !== doc.body ? isFocusInsideFloatingTree : true)
        ) {
          tabbableReturnElement.focus({
            preventScroll: true
          });
        }
        fallbackEl.remove();
      });
    };
  }, [disabled, floating, floatingFocusElement, returnFocusRef, dataRef, events, tree, isInsidePortal, domReference, getNodeId]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    queueMicrotask(() => {
      preventReturnFocusRef.current = false;
    });
    return () => {
      queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
    };
  }, [disabled]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (disabled) return;
    if (!portalContext) return;
    portalContext.setFocusManagerState({
      modal,
      closeOnFocusOut,
      open,
      onOpenChange,
      domReference
    });
    return () => {
      portalContext.setFocusManagerState(null);
    };
  }, [disabled, portalContext, modal, open, onOpenChange, closeOnFocusOut, domReference]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (disabled) return;
    if (!floatingFocusElement) return;
    handleTabIndex(floatingFocusElement, orderRef);
  }, [disabled, floatingFocusElement, orderRef]);
  function renderDismissButton(location) {
    if (disabled || !visuallyHiddenDismiss || !modal) {
      return null;
    }
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(VisuallyHiddenDismiss, {
      ref: location === "start" ? startDismissButtonRef : endDismissButtonRef,
      onClick: (event) => onOpenChange(false, event.nativeEvent),
      children: typeof visuallyHiddenDismiss === "string" ? visuallyHiddenDismiss : "Dismiss"
    });
  }
  const shouldRenderGuards = !disabled && guards && (modal ? !isUntrappedTypeableCombobox : true) && (isInsidePortal || modal);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.Fragment, {
    children: [shouldRenderGuards && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(FocusGuard, {
      "data-type": "inside",
      ref: mergedBeforeGuardRef,
      onFocus: (event) => {
        if (modal) {
          const els = getTabbableElements();
          enqueueFocus(order[0] === "reference" ? els[0] : els[els.length - 1]);
        } else if (portalContext != null && portalContext.preserveTabOrder && portalContext.portalNode) {
          preventReturnFocusRef.current = false;
          if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isOutsideEvent)(event, portalContext.portalNode)) {
            const nextTabbable = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getNextTabbable)(domReference);
            nextTabbable == null || nextTabbable.focus();
          } else {
            var _portalContext$before;
            (_portalContext$before = portalContext.beforeOutsideRef.current) == null || _portalContext$before.focus();
          }
        }
      }
    }), !isUntrappedTypeableCombobox && renderDismissButton("start"), children, renderDismissButton("end"), shouldRenderGuards && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(FocusGuard, {
      "data-type": "inside",
      ref: mergedAfterGuardRef,
      onFocus: (event) => {
        if (modal) {
          enqueueFocus(getTabbableElements()[0]);
        } else if (portalContext != null && portalContext.preserveTabOrder && portalContext.portalNode) {
          if (closeOnFocusOut) {
            preventReturnFocusRef.current = true;
          }
          if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isOutsideEvent)(event, portalContext.portalNode)) {
            const prevTabbable = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getPreviousTabbable)(domReference);
            prevTabbable == null || prevTabbable.focus();
          } else {
            var _portalContext$afterO;
            (_portalContext$afterO = portalContext.afterOutsideRef.current) == null || _portalContext$afterO.focus();
          }
        }
      }
    })]
  });
}
let lockCount = 0;
const scrollbarProperty = "--floating-ui-scrollbar-width";
function enableScrollLock() {
  const platform2 = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getPlatform)();
  const isIOS = /iP(hone|ad|od)|iOS/.test(platform2) || // iPads can claim to be MacIntel
  platform2 === "MacIntel" && navigator.maxTouchPoints > 1;
  const bodyStyle = document.body.style;
  const scrollbarX = Math.round(document.documentElement.getBoundingClientRect().left) + document.documentElement.scrollLeft;
  const paddingProp = scrollbarX ? "paddingLeft" : "paddingRight";
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  const scrollX = bodyStyle.left ? parseFloat(bodyStyle.left) : window.scrollX;
  const scrollY = bodyStyle.top ? parseFloat(bodyStyle.top) : window.scrollY;
  bodyStyle.overflow = "hidden";
  bodyStyle.setProperty(scrollbarProperty, scrollbarWidth + "px");
  if (scrollbarWidth) {
    bodyStyle[paddingProp] = scrollbarWidth + "px";
  }
  if (isIOS) {
    var _window$visualViewpor, _window$visualViewpor2;
    const offsetLeft = ((_window$visualViewpor = window.visualViewport) == null ? void 0 : _window$visualViewpor.offsetLeft) || 0;
    const offsetTop = ((_window$visualViewpor2 = window.visualViewport) == null ? void 0 : _window$visualViewpor2.offsetTop) || 0;
    Object.assign(bodyStyle, {
      position: "fixed",
      top: -(scrollY - Math.floor(offsetTop)) + "px",
      left: -(scrollX - Math.floor(offsetLeft)) + "px",
      right: "0"
    });
  }
  return () => {
    Object.assign(bodyStyle, {
      overflow: "",
      [paddingProp]: ""
    });
    bodyStyle.removeProperty(scrollbarProperty);
    if (isIOS) {
      Object.assign(bodyStyle, {
        position: "",
        top: "",
        left: "",
        right: ""
      });
      window.scrollTo(scrollX, scrollY);
    }
  };
}
let cleanup = () => {
};
const FloatingOverlay = /* @__PURE__ */ react__WEBPACK_IMPORTED_MODULE_0__.forwardRef(function FloatingOverlay2(props, ref) {
  const {
    lockScroll = false,
    ...rest
  } = props;
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!lockScroll) return;
    lockCount++;
    if (lockCount === 1) {
      cleanup = enableScrollLock();
    }
    return () => {
      lockCount--;
      if (lockCount === 0) {
        cleanup();
      }
    };
  }, [lockScroll]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)("div", {
    ref,
    ...rest,
    style: {
      position: "fixed",
      overflow: "auto",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...rest.style
    }
  });
});
function isButtonTarget(event) {
  return (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isHTMLElement)(event.target) && event.target.tagName === "BUTTON";
}
function isAnchorTarget(event) {
  return (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isHTMLElement)(event.target) && event.target.tagName === "A";
}
function isSpaceIgnored(element) {
  return (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isTypeableElement)(element);
}
function useClick(context, props) {
  if (props === void 0) {
    props = {};
  }
  const {
    open,
    onOpenChange,
    dataRef,
    elements: {
      domReference
    }
  } = context;
  const {
    enabled = true,
    event: eventOption = "click",
    toggle = true,
    ignoreMouse = false,
    keyboardHandlers = true,
    stickIfOpen = true
  } = props;
  const pointerTypeRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef();
  const didKeyDownRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const reference = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    onPointerDown(event) {
      pointerTypeRef.current = event.pointerType;
    },
    onMouseDown(event) {
      const pointerType = pointerTypeRef.current;
      if (event.button !== 0) return;
      if (eventOption === "click") return;
      if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isMouseLikePointerType)(pointerType, true) && ignoreMouse) return;
      if (open && toggle && (dataRef.current.openEvent && stickIfOpen ? dataRef.current.openEvent.type === "mousedown" : true)) {
        onOpenChange(false, event.nativeEvent, "click");
      } else {
        event.preventDefault();
        onOpenChange(true, event.nativeEvent, "click");
      }
    },
    onClick(event) {
      const pointerType = pointerTypeRef.current;
      if (eventOption === "mousedown" && pointerTypeRef.current) {
        pointerTypeRef.current = void 0;
        return;
      }
      if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isMouseLikePointerType)(pointerType, true) && ignoreMouse) return;
      if (open && toggle && (dataRef.current.openEvent && stickIfOpen ? dataRef.current.openEvent.type === "click" : true)) {
        onOpenChange(false, event.nativeEvent, "click");
      } else {
        onOpenChange(true, event.nativeEvent, "click");
      }
    },
    onKeyDown(event) {
      pointerTypeRef.current = void 0;
      if (event.defaultPrevented || !keyboardHandlers || isButtonTarget(event)) {
        return;
      }
      if (event.key === " " && !isSpaceIgnored(domReference)) {
        event.preventDefault();
        didKeyDownRef.current = true;
      }
      if (isAnchorTarget(event)) {
        return;
      }
      if (event.key === "Enter") {
        if (open && toggle) {
          onOpenChange(false, event.nativeEvent, "click");
        } else {
          onOpenChange(true, event.nativeEvent, "click");
        }
      }
    },
    onKeyUp(event) {
      if (event.defaultPrevented || !keyboardHandlers || isButtonTarget(event) || isSpaceIgnored(domReference)) {
        return;
      }
      if (event.key === " " && didKeyDownRef.current) {
        didKeyDownRef.current = false;
        if (open && toggle) {
          onOpenChange(false, event.nativeEvent, "click");
        } else {
          onOpenChange(true, event.nativeEvent, "click");
        }
      }
    }
  }), [dataRef, domReference, eventOption, ignoreMouse, keyboardHandlers, onOpenChange, open, stickIfOpen, toggle]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => enabled ? {
    reference
  } : {}, [enabled, reference]);
}
function createVirtualElement(domElement, data) {
  let offsetX = null;
  let offsetY = null;
  let isAutoUpdateEvent = false;
  return {
    contextElement: domElement || void 0,
    getBoundingClientRect() {
      var _data$dataRef$current;
      const domRect = (domElement == null ? void 0 : domElement.getBoundingClientRect()) || {
        width: 0,
        height: 0,
        x: 0,
        y: 0
      };
      const isXAxis = data.axis === "x" || data.axis === "both";
      const isYAxis = data.axis === "y" || data.axis === "both";
      const canTrackCursorOnAutoUpdate = ["mouseenter", "mousemove"].includes(((_data$dataRef$current = data.dataRef.current.openEvent) == null ? void 0 : _data$dataRef$current.type) || "") && data.pointerType !== "touch";
      let width = domRect.width;
      let height = domRect.height;
      let x = domRect.x;
      let y = domRect.y;
      if (offsetX == null && data.x && isXAxis) {
        offsetX = domRect.x - data.x;
      }
      if (offsetY == null && data.y && isYAxis) {
        offsetY = domRect.y - data.y;
      }
      x -= offsetX || 0;
      y -= offsetY || 0;
      width = 0;
      height = 0;
      if (!isAutoUpdateEvent || canTrackCursorOnAutoUpdate) {
        width = data.axis === "y" ? domRect.width : 0;
        height = data.axis === "x" ? domRect.height : 0;
        x = isXAxis && data.x != null ? data.x : x;
        y = isYAxis && data.y != null ? data.y : y;
      } else if (isAutoUpdateEvent && !canTrackCursorOnAutoUpdate) {
        height = data.axis === "x" ? domRect.height : height;
        width = data.axis === "y" ? domRect.width : width;
      }
      isAutoUpdateEvent = true;
      return {
        width,
        height,
        x,
        y,
        top: y,
        right: x + width,
        bottom: y + height,
        left: x
      };
    }
  };
}
function isMouseBasedEvent(event) {
  return event != null && event.clientX != null;
}
function useClientPoint(context, props) {
  if (props === void 0) {
    props = {};
  }
  const {
    open,
    dataRef,
    elements: {
      floating,
      domReference
    },
    refs
  } = context;
  const {
    enabled = true,
    axis = "both",
    x = null,
    y = null
  } = props;
  const initialRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const cleanupListenerRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const [pointerType, setPointerType] = react__WEBPACK_IMPORTED_MODULE_0__.useState();
  const [reactive, setReactive] = react__WEBPACK_IMPORTED_MODULE_0__.useState([]);
  const setReference = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((x2, y2) => {
    if (initialRef.current) return;
    if (dataRef.current.openEvent && !isMouseBasedEvent(dataRef.current.openEvent)) {
      return;
    }
    refs.setPositionReference(createVirtualElement(domReference, {
      x: x2,
      y: y2,
      axis,
      dataRef,
      pointerType
    }));
  });
  const handleReferenceEnterOrMove = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((event) => {
    if (x != null || y != null) return;
    if (!open) {
      setReference(event.clientX, event.clientY);
    } else if (!cleanupListenerRef.current) {
      setReactive([]);
    }
  });
  const openCheck = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isMouseLikePointerType)(pointerType) ? floating : open;
  const addListener = react__WEBPACK_IMPORTED_MODULE_0__.useCallback(() => {
    if (!openCheck || !enabled || x != null || y != null) return;
    const win = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.getWindow)(floating);
    function handleMouseMove(event) {
      const target = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTarget)(event);
      if (!(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(floating, target)) {
        setReference(event.clientX, event.clientY);
      } else {
        win.removeEventListener("mousemove", handleMouseMove);
        cleanupListenerRef.current = null;
      }
    }
    if (!dataRef.current.openEvent || isMouseBasedEvent(dataRef.current.openEvent)) {
      win.addEventListener("mousemove", handleMouseMove);
      const cleanup2 = () => {
        win.removeEventListener("mousemove", handleMouseMove);
        cleanupListenerRef.current = null;
      };
      cleanupListenerRef.current = cleanup2;
      return cleanup2;
    }
    refs.setPositionReference(domReference);
  }, [openCheck, enabled, x, y, floating, dataRef, refs, domReference, setReference]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    return addListener();
  }, [addListener, reactive]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (enabled && !floating) {
      initialRef.current = false;
    }
  }, [enabled, floating]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!enabled && open) {
      initialRef.current = true;
    }
  }, [enabled, open]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (enabled && (x != null || y != null)) {
      initialRef.current = false;
      setReference(x, y);
    }
  }, [enabled, x, y, setReference]);
  const reference = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    function setPointerTypeRef(_ref) {
      let {
        pointerType: pointerType2
      } = _ref;
      setPointerType(pointerType2);
    }
    return {
      onPointerDown: setPointerTypeRef,
      onPointerEnter: setPointerTypeRef,
      onMouseMove: handleReferenceEnterOrMove,
      onMouseEnter: handleReferenceEnterOrMove
    };
  }, [handleReferenceEnterOrMove]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => enabled ? {
    reference
  } : {}, [enabled, reference]);
}
const bubbleHandlerKeys = {
  pointerdown: "onPointerDown",
  mousedown: "onMouseDown",
  click: "onClick"
};
const captureHandlerKeys = {
  pointerdown: "onPointerDownCapture",
  mousedown: "onMouseDownCapture",
  click: "onClickCapture"
};
const normalizeProp = (normalizable) => {
  var _normalizable$escapeK, _normalizable$outside;
  return {
    escapeKey: typeof normalizable === "boolean" ? normalizable : (_normalizable$escapeK = normalizable == null ? void 0 : normalizable.escapeKey) != null ? _normalizable$escapeK : false,
    outsidePress: typeof normalizable === "boolean" ? normalizable : (_normalizable$outside = normalizable == null ? void 0 : normalizable.outsidePress) != null ? _normalizable$outside : true
  };
};
function useDismiss(context, props) {
  if (props === void 0) {
    props = {};
  }
  const {
    open,
    onOpenChange,
    elements,
    dataRef
  } = context;
  const {
    enabled = true,
    escapeKey = true,
    outsidePress: unstable_outsidePress = true,
    outsidePressEvent = "pointerdown",
    referencePress = false,
    referencePressEvent = "pointerdown",
    ancestorScroll = false,
    bubbles,
    capture
  } = props;
  const tree = useFloatingTree();
  const outsidePressFn = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(typeof unstable_outsidePress === "function" ? unstable_outsidePress : () => false);
  const outsidePress = typeof unstable_outsidePress === "function" ? outsidePressFn : unstable_outsidePress;
  const endedOrStartedInsideRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const {
    escapeKey: escapeKeyBubbles,
    outsidePress: outsidePressBubbles
  } = normalizeProp(bubbles);
  const {
    escapeKey: escapeKeyCapture,
    outsidePress: outsidePressCapture
  } = normalizeProp(capture);
  const isComposingRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const closeOnEscapeKeyDown = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((event) => {
    var _dataRef$current$floa;
    if (!open || !enabled || !escapeKey || event.key !== "Escape") {
      return;
    }
    if (isComposingRef.current) {
      return;
    }
    const nodeId = (_dataRef$current$floa = dataRef.current.floatingContext) == null ? void 0 : _dataRef$current$floa.nodeId;
    const children = tree ? (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getNodeChildren)(tree.nodesRef.current, nodeId) : [];
    if (!escapeKeyBubbles) {
      event.stopPropagation();
      if (children.length > 0) {
        let shouldDismiss = true;
        children.forEach((child) => {
          var _child$context;
          if ((_child$context = child.context) != null && _child$context.open && !child.context.dataRef.current.__escapeKeyBubbles) {
            shouldDismiss = false;
            return;
          }
        });
        if (!shouldDismiss) {
          return;
        }
      }
    }
    onOpenChange(false, (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isReactEvent)(event) ? event.nativeEvent : event, "escape-key");
  });
  const closeOnEscapeKeyDownCapture = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((event) => {
    var _getTarget2;
    const callback = () => {
      var _getTarget;
      closeOnEscapeKeyDown(event);
      (_getTarget = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTarget)(event)) == null || _getTarget.removeEventListener("keydown", callback);
    };
    (_getTarget2 = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTarget)(event)) == null || _getTarget2.addEventListener("keydown", callback);
  });
  const closeOnPressOutside = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((event) => {
    var _dataRef$current$floa2;
    const insideReactTree = dataRef.current.insideReactTree;
    dataRef.current.insideReactTree = false;
    const endedOrStartedInside = endedOrStartedInsideRef.current;
    endedOrStartedInsideRef.current = false;
    if (outsidePressEvent === "click" && endedOrStartedInside) {
      return;
    }
    if (insideReactTree) {
      return;
    }
    if (typeof outsidePress === "function" && !outsidePress(event)) {
      return;
    }
    const target = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTarget)(event);
    const inertSelector = "[" + createAttribute("inert") + "]";
    const markers = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(elements.floating).querySelectorAll(inertSelector);
    let targetRootAncestor = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(target) ? target : null;
    while (targetRootAncestor && !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isLastTraversableNode)(targetRootAncestor)) {
      const nextParent = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.getParentNode)(targetRootAncestor);
      if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isLastTraversableNode)(nextParent) || !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(nextParent)) {
        break;
      }
      targetRootAncestor = nextParent;
    }
    if (markers.length && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(target) && !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isRootElement)(target) && // Clicked on a direct ancestor (e.g. FloatingOverlay).
    !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(target, elements.floating) && // If the target root element contains none of the markers, then the
    // element was injected after the floating element rendered.
    Array.from(markers).every((marker) => !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(targetRootAncestor, marker))) {
      return;
    }
    if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isHTMLElement)(target) && floating) {
      const lastTraversableNode = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isLastTraversableNode)(target);
      const style = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.getComputedStyle)(target);
      const scrollRe = /auto|scroll/;
      const isScrollableX = lastTraversableNode || scrollRe.test(style.overflowX);
      const isScrollableY = lastTraversableNode || scrollRe.test(style.overflowY);
      const canScrollX = isScrollableX && target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
      const canScrollY = isScrollableY && target.clientHeight > 0 && target.scrollHeight > target.clientHeight;
      const isRTL = style.direction === "rtl";
      const pressedVerticalScrollbar = canScrollY && (isRTL ? event.offsetX <= target.offsetWidth - target.clientWidth : event.offsetX > target.clientWidth);
      const pressedHorizontalScrollbar = canScrollX && event.offsetY > target.clientHeight;
      if (pressedVerticalScrollbar || pressedHorizontalScrollbar) {
        return;
      }
    }
    const nodeId = (_dataRef$current$floa2 = dataRef.current.floatingContext) == null ? void 0 : _dataRef$current$floa2.nodeId;
    const targetIsInsideChildren = tree && (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getNodeChildren)(tree.nodesRef.current, nodeId).some((node) => {
      var _node$context;
      return (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isEventTargetWithin)(event, (_node$context = node.context) == null ? void 0 : _node$context.elements.floating);
    });
    if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isEventTargetWithin)(event, elements.floating) || (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isEventTargetWithin)(event, elements.domReference) || targetIsInsideChildren) {
      return;
    }
    const children = tree ? (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getNodeChildren)(tree.nodesRef.current, nodeId) : [];
    if (children.length > 0) {
      let shouldDismiss = true;
      children.forEach((child) => {
        var _child$context2;
        if ((_child$context2 = child.context) != null && _child$context2.open && !child.context.dataRef.current.__outsidePressBubbles) {
          shouldDismiss = false;
          return;
        }
      });
      if (!shouldDismiss) {
        return;
      }
    }
    onOpenChange(false, event, "outside-press");
  });
  const closeOnPressOutsideCapture = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((event) => {
    var _getTarget4;
    const callback = () => {
      var _getTarget3;
      closeOnPressOutside(event);
      (_getTarget3 = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTarget)(event)) == null || _getTarget3.removeEventListener(outsidePressEvent, callback);
    };
    (_getTarget4 = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTarget)(event)) == null || _getTarget4.addEventListener(outsidePressEvent, callback);
  });
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!open || !enabled) {
      return;
    }
    dataRef.current.__escapeKeyBubbles = escapeKeyBubbles;
    dataRef.current.__outsidePressBubbles = outsidePressBubbles;
    let compositionTimeout = -1;
    function onScroll(event) {
      onOpenChange(false, event, "ancestor-scroll");
    }
    function handleCompositionStart() {
      window.clearTimeout(compositionTimeout);
      isComposingRef.current = true;
    }
    function handleCompositionEnd() {
      compositionTimeout = window.setTimeout(
        () => {
          isComposingRef.current = false;
        },
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isWebKit)() ? 5 : 0
      );
    }
    const doc = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(elements.floating);
    if (escapeKey) {
      doc.addEventListener("keydown", escapeKeyCapture ? closeOnEscapeKeyDownCapture : closeOnEscapeKeyDown, escapeKeyCapture);
      doc.addEventListener("compositionstart", handleCompositionStart);
      doc.addEventListener("compositionend", handleCompositionEnd);
    }
    outsidePress && doc.addEventListener(outsidePressEvent, outsidePressCapture ? closeOnPressOutsideCapture : closeOnPressOutside, outsidePressCapture);
    let ancestors = [];
    if (ancestorScroll) {
      if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(elements.domReference)) {
        ancestors = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.getOverflowAncestors)(elements.domReference);
      }
      if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(elements.floating)) {
        ancestors = ancestors.concat((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.getOverflowAncestors)(elements.floating));
      }
      if (!(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(elements.reference) && elements.reference && elements.reference.contextElement) {
        ancestors = ancestors.concat((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.getOverflowAncestors)(elements.reference.contextElement));
      }
    }
    ancestors = ancestors.filter((ancestor) => {
      var _doc$defaultView;
      return ancestor !== ((_doc$defaultView = doc.defaultView) == null ? void 0 : _doc$defaultView.visualViewport);
    });
    ancestors.forEach((ancestor) => {
      ancestor.addEventListener("scroll", onScroll, {
        passive: true
      });
    });
    return () => {
      if (escapeKey) {
        doc.removeEventListener("keydown", escapeKeyCapture ? closeOnEscapeKeyDownCapture : closeOnEscapeKeyDown, escapeKeyCapture);
        doc.removeEventListener("compositionstart", handleCompositionStart);
        doc.removeEventListener("compositionend", handleCompositionEnd);
      }
      outsidePress && doc.removeEventListener(outsidePressEvent, outsidePressCapture ? closeOnPressOutsideCapture : closeOnPressOutside, outsidePressCapture);
      ancestors.forEach((ancestor) => {
        ancestor.removeEventListener("scroll", onScroll);
      });
      window.clearTimeout(compositionTimeout);
    };
  }, [dataRef, elements, escapeKey, outsidePress, outsidePressEvent, open, onOpenChange, ancestorScroll, enabled, escapeKeyBubbles, outsidePressBubbles, closeOnEscapeKeyDown, escapeKeyCapture, closeOnEscapeKeyDownCapture, closeOnPressOutside, outsidePressCapture, closeOnPressOutsideCapture]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    dataRef.current.insideReactTree = false;
  }, [dataRef, outsidePress, outsidePressEvent]);
  const reference = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    onKeyDown: closeOnEscapeKeyDown,
    ...referencePress && {
      [bubbleHandlerKeys[referencePressEvent]]: (event) => {
        onOpenChange(false, event.nativeEvent, "reference-press");
      },
      ...referencePressEvent !== "click" && {
        onClick(event) {
          onOpenChange(false, event.nativeEvent, "reference-press");
        }
      }
    }
  }), [closeOnEscapeKeyDown, onOpenChange, referencePress, referencePressEvent]);
  const floating = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    function setMouseDownOrUpInside(event) {
      if (event.button !== 0) {
        return;
      }
      endedOrStartedInsideRef.current = true;
    }
    return {
      onKeyDown: closeOnEscapeKeyDown,
      onMouseDown: setMouseDownOrUpInside,
      onMouseUp: setMouseDownOrUpInside,
      [captureHandlerKeys[outsidePressEvent]]: () => {
        dataRef.current.insideReactTree = true;
      }
    };
  }, [closeOnEscapeKeyDown, outsidePressEvent, dataRef]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => enabled ? {
    reference,
    floating
  } : {}, [enabled, reference, floating]);
}
function useFloatingRootContext(options) {
  const {
    open = false,
    onOpenChange: onOpenChangeProp,
    elements: elementsProp
  } = options;
  const floatingId = useId();
  const dataRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef({});
  const [events] = react__WEBPACK_IMPORTED_MODULE_0__.useState(() => createEventEmitter());
  const nested = useFloatingParentNodeId() != null;
  if (true) {
    const optionDomReference = elementsProp.reference;
    if (optionDomReference && !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(optionDomReference)) {
      error("Cannot pass a virtual element to the `elements.reference` option,", "as it must be a real DOM element. Use `refs.setPositionReference()`", "instead.");
    }
  }
  const [positionReference, setPositionReference] = react__WEBPACK_IMPORTED_MODULE_0__.useState(elementsProp.reference);
  const onOpenChange = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((open2, event, reason) => {
    dataRef.current.openEvent = open2 ? event : void 0;
    events.emit("openchange", {
      open: open2,
      event,
      reason,
      nested
    });
    onOpenChangeProp == null || onOpenChangeProp(open2, event, reason);
  });
  const refs = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    setPositionReference
  }), []);
  const elements = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    reference: positionReference || elementsProp.reference || null,
    floating: elementsProp.floating || null,
    domReference: elementsProp.reference
  }), [positionReference, elementsProp.reference, elementsProp.floating]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    dataRef,
    open,
    onOpenChange,
    elements,
    events,
    floatingId,
    refs
  }), [open, onOpenChange, elements, events, floatingId, refs]);
}
function useFloating(options) {
  if (options === void 0) {
    options = {};
  }
  const {
    nodeId
  } = options;
  const internalRootContext = useFloatingRootContext({
    ...options,
    elements: {
      reference: null,
      floating: null,
      ...options.elements
    }
  });
  const rootContext = options.rootContext || internalRootContext;
  const computedElements = rootContext.elements;
  const [_domReference, setDomReference] = react__WEBPACK_IMPORTED_MODULE_0__.useState(null);
  const [positionReference, _setPositionReference] = react__WEBPACK_IMPORTED_MODULE_0__.useState(null);
  const optionDomReference = computedElements == null ? void 0 : computedElements.domReference;
  const domReference = optionDomReference || _domReference;
  const domReferenceRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const tree = useFloatingTree();
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (domReference) {
      domReferenceRef.current = domReference;
    }
  }, [domReference]);
  const position = (0,_floating_ui_react_dom__WEBPACK_IMPORTED_MODULE_6__.useFloating)({
    ...options,
    elements: {
      ...computedElements,
      ...positionReference && {
        reference: positionReference
      }
    }
  });
  const setPositionReference = react__WEBPACK_IMPORTED_MODULE_0__.useCallback((node) => {
    const computedPositionReference = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(node) ? {
      getBoundingClientRect: () => node.getBoundingClientRect(),
      getClientRects: () => node.getClientRects(),
      contextElement: node
    } : node;
    _setPositionReference(computedPositionReference);
    position.refs.setReference(computedPositionReference);
  }, [position.refs]);
  const setReference = react__WEBPACK_IMPORTED_MODULE_0__.useCallback((node) => {
    if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(node) || node === null) {
      domReferenceRef.current = node;
      setDomReference(node);
    }
    if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(position.refs.reference.current) || position.refs.reference.current === null || // Don't allow setting virtual elements using the old technique back to
    // `null` to support `positionReference` + an unstable `reference`
    // callback ref.
    node !== null && !(0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(node)) {
      position.refs.setReference(node);
    }
  }, [position.refs]);
  const refs = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    ...position.refs,
    setReference,
    setPositionReference,
    domReference: domReferenceRef
  }), [position.refs, setReference, setPositionReference]);
  const elements = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    ...position.elements,
    domReference
  }), [position.elements, domReference]);
  const context = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    ...position,
    ...rootContext,
    refs,
    elements,
    nodeId
  }), [position, refs, elements, nodeId, rootContext]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    rootContext.dataRef.current.floatingContext = context;
    const node = tree == null ? void 0 : tree.nodesRef.current.find((node2) => node2.id === nodeId);
    if (node) {
      node.context = context;
    }
  });
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    ...position,
    context,
    refs,
    elements
  }), [position, refs, elements, context]);
}
function isMacSafari() {
  return (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isMac)() && (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isSafari)();
}
function useFocus(context, props) {
  if (props === void 0) {
    props = {};
  }
  const {
    open,
    onOpenChange,
    events,
    dataRef,
    elements
  } = context;
  const {
    enabled = true,
    visibleOnly = true
  } = props;
  const blockFocusRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const timeoutRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(-1);
  const keyboardModalityRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(true);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!enabled) return;
    const win = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.getWindow)(elements.domReference);
    function onBlur() {
      if (!open && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isHTMLElement)(elements.domReference) && elements.domReference === (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.activeElement)((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(elements.domReference))) {
        blockFocusRef.current = true;
      }
    }
    function onKeyDown() {
      keyboardModalityRef.current = true;
    }
    function onPointerDown() {
      keyboardModalityRef.current = false;
    }
    win.addEventListener("blur", onBlur);
    if (isMacSafari()) {
      win.addEventListener("keydown", onKeyDown, true);
      win.addEventListener("pointerdown", onPointerDown, true);
    }
    return () => {
      win.removeEventListener("blur", onBlur);
      if (isMacSafari()) {
        win.removeEventListener("keydown", onKeyDown, true);
        win.removeEventListener("pointerdown", onPointerDown, true);
      }
    };
  }, [elements.domReference, open, enabled]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!enabled) return;
    function onOpenChange2(_ref) {
      let {
        reason
      } = _ref;
      if (reason === "reference-press" || reason === "escape-key") {
        blockFocusRef.current = true;
      }
    }
    events.on("openchange", onOpenChange2);
    return () => {
      events.off("openchange", onOpenChange2);
    };
  }, [events, enabled]);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    return () => {
      clearTimeoutIfSet(timeoutRef);
    };
  }, []);
  const reference = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    onMouseLeave() {
      blockFocusRef.current = false;
    },
    onFocus(event) {
      if (blockFocusRef.current) return;
      const target = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getTarget)(event.nativeEvent);
      if (visibleOnly && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(target)) {
        if (isMacSafari() && !event.relatedTarget) {
          if (!keyboardModalityRef.current && !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isTypeableElement)(target)) {
            return;
          }
        } else if (!(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.matchesFocusVisible)(target)) {
          return;
        }
      }
      onOpenChange(true, event.nativeEvent, "focus");
    },
    onBlur(event) {
      blockFocusRef.current = false;
      const relatedTarget = event.relatedTarget;
      const nativeEvent = event.nativeEvent;
      const movedToFocusGuard = (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(relatedTarget) && relatedTarget.hasAttribute(createAttribute("focus-guard")) && relatedTarget.getAttribute("data-type") === "outside";
      timeoutRef.current = window.setTimeout(() => {
        var _dataRef$current$floa;
        const activeEl = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.activeElement)(elements.domReference ? elements.domReference.ownerDocument : document);
        if (!relatedTarget && activeEl === elements.domReference) return;
        if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)((_dataRef$current$floa = dataRef.current.floatingContext) == null ? void 0 : _dataRef$current$floa.refs.floating.current, activeEl) || (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(elements.domReference, activeEl) || movedToFocusGuard) {
          return;
        }
        onOpenChange(false, nativeEvent, "focus");
      });
    }
  }), [dataRef, elements.domReference, onOpenChange, visibleOnly]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => enabled ? {
    reference
  } : {}, [enabled, reference]);
}
function mergeProps(userProps, propsList, elementKey) {
  const map = /* @__PURE__ */ new Map();
  const isItem = elementKey === "item";
  let domUserProps = userProps;
  if (isItem && userProps) {
    const {
      [ACTIVE_KEY]: _,
      [SELECTED_KEY]: __,
      ...validProps
    } = userProps;
    domUserProps = validProps;
  }
  return {
    ...elementKey === "floating" && {
      tabIndex: -1,
      [FOCUSABLE_ATTRIBUTE]: ""
    },
    ...domUserProps,
    ...propsList.map((value) => {
      const propsOrGetProps = value ? value[elementKey] : null;
      if (typeof propsOrGetProps === "function") {
        return userProps ? propsOrGetProps(userProps) : null;
      }
      return propsOrGetProps;
    }).concat(userProps).reduce((acc, props) => {
      if (!props) {
        return acc;
      }
      Object.entries(props).forEach((_ref) => {
        let [key, value] = _ref;
        if (isItem && [ACTIVE_KEY, SELECTED_KEY].includes(key)) {
          return;
        }
        if (key.indexOf("on") === 0) {
          if (!map.has(key)) {
            map.set(key, []);
          }
          if (typeof value === "function") {
            var _map$get;
            (_map$get = map.get(key)) == null || _map$get.push(value);
            acc[key] = function() {
              var _map$get2;
              for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
                args[_key] = arguments[_key];
              }
              return (_map$get2 = map.get(key)) == null ? void 0 : _map$get2.map((fn) => fn(...args)).find((val) => val !== void 0);
            };
          }
        } else {
          acc[key] = value;
        }
      });
      return acc;
    }, {})
  };
}
function useInteractions(propsList) {
  if (propsList === void 0) {
    propsList = [];
  }
  const referenceDeps = propsList.map((key) => key == null ? void 0 : key.reference);
  const floatingDeps = propsList.map((key) => key == null ? void 0 : key.floating);
  const itemDeps = propsList.map((key) => key == null ? void 0 : key.item);
  const getReferenceProps = react__WEBPACK_IMPORTED_MODULE_0__.useCallback(
    (userProps) => mergeProps(userProps, propsList, "reference"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    referenceDeps
  );
  const getFloatingProps = react__WEBPACK_IMPORTED_MODULE_0__.useCallback(
    (userProps) => mergeProps(userProps, propsList, "floating"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    floatingDeps
  );
  const getItemProps = react__WEBPACK_IMPORTED_MODULE_0__.useCallback(
    (userProps) => mergeProps(userProps, propsList, "item"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    itemDeps
  );
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    getReferenceProps,
    getFloatingProps,
    getItemProps
  }), [getReferenceProps, getFloatingProps, getItemProps]);
}
const ESCAPE = "Escape";
function doSwitch(orientation, vertical, horizontal) {
  switch (orientation) {
    case "vertical":
      return vertical;
    case "horizontal":
      return horizontal;
    default:
      return vertical || horizontal;
  }
}
function isMainOrientationKey(key, orientation) {
  const vertical = key === ARROW_UP || key === ARROW_DOWN;
  const horizontal = key === ARROW_LEFT || key === ARROW_RIGHT;
  return doSwitch(orientation, vertical, horizontal);
}
function isMainOrientationToEndKey(key, orientation, rtl) {
  const vertical = key === ARROW_DOWN;
  const horizontal = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  return doSwitch(orientation, vertical, horizontal) || key === "Enter" || key === " " || key === "";
}
function isCrossOrientationOpenKey(key, orientation, rtl) {
  const vertical = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  const horizontal = key === ARROW_DOWN;
  return doSwitch(orientation, vertical, horizontal);
}
function isCrossOrientationCloseKey(key, orientation, rtl, cols) {
  const vertical = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
  const horizontal = key === ARROW_UP;
  if (orientation === "both" || orientation === "horizontal" && cols && cols > 1) {
    return key === ESCAPE;
  }
  return doSwitch(orientation, vertical, horizontal);
}
function useListNavigation(context, props) {
  const {
    open,
    onOpenChange,
    elements,
    floatingId
  } = context;
  const {
    listRef,
    activeIndex,
    onNavigate: unstable_onNavigate = () => {
    },
    enabled = true,
    selectedIndex = null,
    allowEscape = false,
    loop = false,
    nested = false,
    rtl = false,
    virtual = false,
    focusItemOnOpen = "auto",
    focusItemOnHover = true,
    openOnArrowKeyDown = true,
    disabledIndices = void 0,
    orientation = "vertical",
    parentOrientation,
    cols = 1,
    scrollItemIntoView = true,
    virtualItemRef,
    itemSizes,
    dense = false
  } = props;
  if (true) {
    if (allowEscape) {
      if (!loop) {
        warn("`useListNavigation` looping must be enabled to allow escaping.");
      }
      if (!virtual) {
        warn("`useListNavigation` must be virtual to allow escaping.");
      }
    }
    if (orientation === "vertical" && cols > 1) {
      warn("In grid list navigation mode (`cols` > 1), the `orientation` should", 'be either "horizontal" or "both".');
    }
  }
  const floatingFocusElement = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getFloatingFocusElement)(elements.floating);
  const floatingFocusElementRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(floatingFocusElement);
  const parentId = useFloatingParentNodeId();
  const tree = useFloatingTree();
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    context.dataRef.current.orientation = orientation;
  }, [context, orientation]);
  const onNavigate = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(() => {
    unstable_onNavigate(indexRef.current === -1 ? null : indexRef.current);
  });
  const typeableComboboxReference = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isTypeableCombobox)(elements.domReference);
  const focusItemOnOpenRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(focusItemOnOpen);
  const indexRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(selectedIndex != null ? selectedIndex : -1);
  const keyRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const isPointerModalityRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(true);
  const previousOnNavigateRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(onNavigate);
  const previousMountedRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(!!elements.floating);
  const previousOpenRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(open);
  const forceSyncFocusRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const forceScrollIntoViewRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const disabledIndicesRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(disabledIndices);
  const latestOpenRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(open);
  const scrollItemIntoViewRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(scrollItemIntoView);
  const selectedIndexRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(selectedIndex);
  const [activeId, setActiveId] = react__WEBPACK_IMPORTED_MODULE_0__.useState();
  const [virtualId, setVirtualId] = react__WEBPACK_IMPORTED_MODULE_0__.useState();
  const focusItem = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(() => {
    function runFocus(item2) {
      if (virtual) {
        var _item$id;
        if ((_item$id = item2.id) != null && _item$id.endsWith("-fui-option")) {
          item2.id = floatingId + "-" + Math.random().toString(16).slice(2, 10);
        }
        setActiveId(item2.id);
        tree == null || tree.events.emit("virtualfocus", item2);
        if (virtualItemRef) {
          virtualItemRef.current = item2;
        }
      } else {
        enqueueFocus(item2, {
          sync: forceSyncFocusRef.current,
          preventScroll: true
        });
      }
    }
    const initialItem = listRef.current[indexRef.current];
    const forceScrollIntoView = forceScrollIntoViewRef.current;
    if (initialItem) {
      runFocus(initialItem);
    }
    const scheduler = forceSyncFocusRef.current ? (v) => v() : requestAnimationFrame;
    scheduler(() => {
      const waitedItem = listRef.current[indexRef.current] || initialItem;
      if (!waitedItem) return;
      if (!initialItem) {
        runFocus(waitedItem);
      }
      const scrollIntoViewOptions = scrollItemIntoViewRef.current;
      const shouldScrollIntoView = scrollIntoViewOptions && item && (forceScrollIntoView || !isPointerModalityRef.current);
      if (shouldScrollIntoView) {
        waitedItem.scrollIntoView == null || waitedItem.scrollIntoView(typeof scrollIntoViewOptions === "boolean" ? {
          block: "nearest",
          inline: "nearest"
        } : scrollIntoViewOptions);
      }
    });
  });
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!enabled) return;
    if (open && elements.floating) {
      if (focusItemOnOpenRef.current && selectedIndex != null) {
        forceScrollIntoViewRef.current = true;
        indexRef.current = selectedIndex;
        onNavigate();
      }
    } else if (previousMountedRef.current) {
      indexRef.current = -1;
      previousOnNavigateRef.current();
    }
  }, [enabled, open, elements.floating, selectedIndex, onNavigate]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!enabled) return;
    if (!open) return;
    if (!elements.floating) return;
    if (activeIndex == null) {
      forceSyncFocusRef.current = false;
      if (selectedIndexRef.current != null) {
        return;
      }
      if (previousMountedRef.current) {
        indexRef.current = -1;
        focusItem();
      }
      if ((!previousOpenRef.current || !previousMountedRef.current) && focusItemOnOpenRef.current && (keyRef.current != null || focusItemOnOpenRef.current === true && keyRef.current == null)) {
        let runs = 0;
        const waitForListPopulated = () => {
          if (listRef.current[0] == null) {
            if (runs < 2) {
              const scheduler = runs ? requestAnimationFrame : queueMicrotask;
              scheduler(waitForListPopulated);
            }
            runs++;
          } else {
            indexRef.current = keyRef.current == null || isMainOrientationToEndKey(keyRef.current, orientation, rtl) || nested ? (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getMinListIndex)(listRef, disabledIndicesRef.current) : (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getMaxListIndex)(listRef, disabledIndicesRef.current);
            keyRef.current = null;
            onNavigate();
          }
        };
        waitForListPopulated();
      }
    } else if (!(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isIndexOutOfListBounds)(listRef, activeIndex)) {
      indexRef.current = activeIndex;
      focusItem();
      forceScrollIntoViewRef.current = false;
    }
  }, [enabled, open, elements.floating, activeIndex, selectedIndexRef, nested, listRef, orientation, rtl, onNavigate, focusItem, disabledIndicesRef]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    var _nodes$find;
    if (!enabled || elements.floating || !tree || virtual || !previousMountedRef.current) {
      return;
    }
    const nodes = tree.nodesRef.current;
    const parent = (_nodes$find = nodes.find((node) => node.id === parentId)) == null || (_nodes$find = _nodes$find.context) == null ? void 0 : _nodes$find.elements.floating;
    const activeEl = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.activeElement)((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDocument)(elements.floating));
    const treeContainsActiveEl = nodes.some((node) => node.context && (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.contains)(node.context.elements.floating, activeEl));
    if (parent && !treeContainsActiveEl && isPointerModalityRef.current) {
      parent.focus({
        preventScroll: true
      });
    }
  }, [enabled, elements.floating, tree, parentId, virtual]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!enabled) return;
    if (!tree) return;
    if (!virtual) return;
    if (parentId) return;
    function handleVirtualFocus(item2) {
      setVirtualId(item2.id);
      if (virtualItemRef) {
        virtualItemRef.current = item2;
      }
    }
    tree.events.on("virtualfocus", handleVirtualFocus);
    return () => {
      tree.events.off("virtualfocus", handleVirtualFocus);
    };
  }, [enabled, tree, virtual, parentId, virtualItemRef]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    previousOnNavigateRef.current = onNavigate;
    previousOpenRef.current = open;
    previousMountedRef.current = !!elements.floating;
  });
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!open) {
      keyRef.current = null;
      focusItemOnOpenRef.current = focusItemOnOpen;
    }
  }, [open, focusItemOnOpen]);
  const hasActiveIndex = activeIndex != null;
  const item = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    function syncCurrentTarget(currentTarget) {
      if (!latestOpenRef.current) return;
      const index = listRef.current.indexOf(currentTarget);
      if (index !== -1 && indexRef.current !== index) {
        indexRef.current = index;
        onNavigate();
      }
    }
    const props2 = {
      onFocus(_ref) {
        let {
          currentTarget
        } = _ref;
        forceSyncFocusRef.current = true;
        syncCurrentTarget(currentTarget);
      },
      onClick: (_ref2) => {
        let {
          currentTarget
        } = _ref2;
        return currentTarget.focus({
          preventScroll: true
        });
      },
      // Safari
      onMouseMove(_ref3) {
        let {
          currentTarget
        } = _ref3;
        forceSyncFocusRef.current = true;
        forceScrollIntoViewRef.current = false;
        if (focusItemOnHover) {
          syncCurrentTarget(currentTarget);
        }
      },
      onPointerLeave(_ref4) {
        let {
          pointerType
        } = _ref4;
        if (!isPointerModalityRef.current || pointerType === "touch") {
          return;
        }
        forceSyncFocusRef.current = true;
        if (!focusItemOnHover) {
          return;
        }
        indexRef.current = -1;
        onNavigate();
        if (!virtual) {
          var _floatingFocusElement;
          (_floatingFocusElement = floatingFocusElementRef.current) == null || _floatingFocusElement.focus({
            preventScroll: true
          });
        }
      }
    };
    return props2;
  }, [latestOpenRef, floatingFocusElementRef, focusItemOnHover, listRef, onNavigate, virtual]);
  const getParentOrientation = react__WEBPACK_IMPORTED_MODULE_0__.useCallback(() => {
    var _tree$nodesRef$curren;
    return parentOrientation != null ? parentOrientation : tree == null || (_tree$nodesRef$curren = tree.nodesRef.current.find((node) => node.id === parentId)) == null || (_tree$nodesRef$curren = _tree$nodesRef$curren.context) == null || (_tree$nodesRef$curren = _tree$nodesRef$curren.dataRef) == null ? void 0 : _tree$nodesRef$curren.current.orientation;
  }, [parentId, tree, parentOrientation]);
  const commonOnKeyDown = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((event) => {
    isPointerModalityRef.current = false;
    forceSyncFocusRef.current = true;
    if (event.which === 229) {
      return;
    }
    if (!latestOpenRef.current && event.currentTarget === floatingFocusElementRef.current) {
      return;
    }
    if (nested && isCrossOrientationCloseKey(event.key, orientation, rtl, cols)) {
      if (!isMainOrientationKey(event.key, getParentOrientation())) {
        (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
      }
      onOpenChange(false, event.nativeEvent, "list-navigation");
      if ((0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isHTMLElement)(elements.domReference)) {
        if (virtual) {
          tree == null || tree.events.emit("virtualfocus", elements.domReference);
        } else {
          elements.domReference.focus();
        }
      }
      return;
    }
    const currentIndex = indexRef.current;
    const minIndex = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getMinListIndex)(listRef, disabledIndices);
    const maxIndex = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getMaxListIndex)(listRef, disabledIndices);
    if (!typeableComboboxReference) {
      if (event.key === "Home") {
        (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
        indexRef.current = minIndex;
        onNavigate();
      }
      if (event.key === "End") {
        (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
        indexRef.current = maxIndex;
        onNavigate();
      }
    }
    if (cols > 1) {
      const sizes = itemSizes || Array.from({
        length: listRef.current.length
      }, () => ({
        width: 1,
        height: 1
      }));
      const cellMap = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.createGridCellMap)(sizes, cols, dense);
      const minGridIndex = cellMap.findIndex((index2) => index2 != null && !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isListIndexDisabled)(listRef, index2, disabledIndices));
      const maxGridIndex = cellMap.reduce((foundIndex, index2, cellIndex) => index2 != null && !(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isListIndexDisabled)(listRef, index2, disabledIndices) ? cellIndex : foundIndex, -1);
      const index = cellMap[(0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getGridNavigatedIndex)({
        current: cellMap.map((itemIndex) => itemIndex != null ? listRef.current[itemIndex] : null)
      }, {
        event,
        orientation,
        loop,
        rtl,
        cols,
        // treat undefined (empty grid spaces) as disabled indices so we
        // don't end up in them
        disabledIndices: (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getGridCellIndices)([...(typeof disabledIndices !== "function" ? disabledIndices : null) || listRef.current.map((_, index2) => (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isListIndexDisabled)(listRef, index2, disabledIndices) ? index2 : void 0), void 0], cellMap),
        minIndex: minGridIndex,
        maxIndex: maxGridIndex,
        prevIndex: (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getGridCellIndexOfCorner)(
          indexRef.current > maxIndex ? minIndex : indexRef.current,
          sizes,
          cellMap,
          cols,
          // use a corner matching the edge closest to the direction
          // we're moving in so we don't end up in the same item. Prefer
          // top/left over bottom/right.
          event.key === ARROW_DOWN ? "bl" : event.key === (rtl ? ARROW_LEFT : ARROW_RIGHT) ? "tr" : "tl"
        ),
        stopEvent: true
      })];
      if (index != null) {
        indexRef.current = index;
        onNavigate();
      }
      if (orientation === "both") {
        return;
      }
    }
    if (isMainOrientationKey(event.key, orientation)) {
      (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
      if (open && !virtual && (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.activeElement)(event.currentTarget.ownerDocument) === event.currentTarget) {
        indexRef.current = isMainOrientationToEndKey(event.key, orientation, rtl) ? minIndex : maxIndex;
        onNavigate();
        return;
      }
      if (isMainOrientationToEndKey(event.key, orientation, rtl)) {
        if (loop) {
          indexRef.current = currentIndex >= maxIndex ? allowEscape && currentIndex !== listRef.current.length ? -1 : minIndex : (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.findNonDisabledListIndex)(listRef, {
            startingIndex: currentIndex,
            disabledIndices
          });
        } else {
          indexRef.current = Math.min(maxIndex, (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.findNonDisabledListIndex)(listRef, {
            startingIndex: currentIndex,
            disabledIndices
          }));
        }
      } else {
        if (loop) {
          indexRef.current = currentIndex <= minIndex ? allowEscape && currentIndex !== -1 ? listRef.current.length : maxIndex : (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.findNonDisabledListIndex)(listRef, {
            startingIndex: currentIndex,
            decrement: true,
            disabledIndices
          });
        } else {
          indexRef.current = Math.max(minIndex, (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.findNonDisabledListIndex)(listRef, {
            startingIndex: currentIndex,
            decrement: true,
            disabledIndices
          }));
        }
      }
      if ((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isIndexOutOfListBounds)(listRef, indexRef.current)) {
        indexRef.current = -1;
      }
      onNavigate();
    }
  });
  const ariaActiveDescendantProp = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    return virtual && open && hasActiveIndex && {
      "aria-activedescendant": virtualId || activeId
    };
  }, [virtual, open, hasActiveIndex, virtualId, activeId]);
  const floating = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    return {
      "aria-orientation": orientation === "both" ? void 0 : orientation,
      ...!typeableComboboxReference ? ariaActiveDescendantProp : {},
      onKeyDown: commonOnKeyDown,
      onPointerMove() {
        isPointerModalityRef.current = true;
      }
    };
  }, [ariaActiveDescendantProp, commonOnKeyDown, orientation, typeableComboboxReference]);
  const reference = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    function checkVirtualMouse(event) {
      if (focusItemOnOpen === "auto" && (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isVirtualClick)(event.nativeEvent)) {
        focusItemOnOpenRef.current = true;
      }
    }
    function checkVirtualPointer(event) {
      focusItemOnOpenRef.current = focusItemOnOpen;
      if (focusItemOnOpen === "auto" && (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.isVirtualPointerEvent)(event.nativeEvent)) {
        focusItemOnOpenRef.current = true;
      }
    }
    return {
      ...ariaActiveDescendantProp,
      onKeyDown(event) {
        isPointerModalityRef.current = false;
        const isArrowKey = event.key.startsWith("Arrow");
        const isHomeOrEndKey = ["Home", "End"].includes(event.key);
        const isMoveKey = isArrowKey || isHomeOrEndKey;
        const isCrossOpenKey = isCrossOrientationOpenKey(event.key, orientation, rtl);
        const isCrossCloseKey = isCrossOrientationCloseKey(event.key, orientation, rtl, cols);
        const isParentCrossOpenKey = isCrossOrientationOpenKey(event.key, getParentOrientation(), rtl);
        const isMainKey = isMainOrientationKey(event.key, orientation);
        const isNavigationKey = (nested ? isParentCrossOpenKey : isMainKey) || event.key === "Enter" || event.key.trim() === "";
        if (virtual && open) {
          const rootNode = tree == null ? void 0 : tree.nodesRef.current.find((node) => node.parentId == null);
          const deepestNode = tree && rootNode ? (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getDeepestNode)(tree.nodesRef.current, rootNode.id) : null;
          if (isMoveKey && deepestNode && virtualItemRef) {
            const eventObject = new KeyboardEvent("keydown", {
              key: event.key,
              bubbles: true
            });
            if (isCrossOpenKey || isCrossCloseKey) {
              var _deepestNode$context, _deepestNode$context2;
              const isCurrentTarget = ((_deepestNode$context = deepestNode.context) == null ? void 0 : _deepestNode$context.elements.domReference) === event.currentTarget;
              const dispatchItem = isCrossCloseKey && !isCurrentTarget ? (_deepestNode$context2 = deepestNode.context) == null ? void 0 : _deepestNode$context2.elements.domReference : isCrossOpenKey ? listRef.current.find((item2) => (item2 == null ? void 0 : item2.id) === activeId) : null;
              if (dispatchItem) {
                (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
                dispatchItem.dispatchEvent(eventObject);
                setVirtualId(void 0);
              }
            }
            if ((isMainKey || isHomeOrEndKey) && deepestNode.context) {
              if (deepestNode.context.open && deepestNode.parentId && event.currentTarget !== deepestNode.context.elements.domReference) {
                var _deepestNode$context$;
                (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
                (_deepestNode$context$ = deepestNode.context.elements.domReference) == null || _deepestNode$context$.dispatchEvent(eventObject);
                return;
              }
            }
          }
          return commonOnKeyDown(event);
        }
        if (!open && !openOnArrowKeyDown && isArrowKey) {
          return;
        }
        if (isNavigationKey) {
          const isParentMainKey = isMainOrientationKey(event.key, getParentOrientation());
          keyRef.current = nested && isParentMainKey ? null : event.key;
        }
        if (nested) {
          if (isParentCrossOpenKey) {
            (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
            if (open) {
              indexRef.current = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getMinListIndex)(listRef, disabledIndicesRef.current);
              onNavigate();
            } else {
              onOpenChange(true, event.nativeEvent, "list-navigation");
            }
          }
          return;
        }
        if (isMainKey) {
          if (selectedIndex != null) {
            indexRef.current = selectedIndex;
          }
          (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
          if (!open && openOnArrowKeyDown) {
            onOpenChange(true, event.nativeEvent, "list-navigation");
          } else {
            commonOnKeyDown(event);
          }
          if (open) {
            onNavigate();
          }
        }
      },
      onFocus() {
        if (open && !virtual) {
          indexRef.current = -1;
          onNavigate();
        }
      },
      onPointerDown: checkVirtualPointer,
      onPointerEnter: checkVirtualPointer,
      onMouseDown: checkVirtualMouse,
      onClick: checkVirtualMouse
    };
  }, [activeId, ariaActiveDescendantProp, cols, commonOnKeyDown, disabledIndicesRef, focusItemOnOpen, listRef, nested, onNavigate, onOpenChange, open, openOnArrowKeyDown, orientation, getParentOrientation, rtl, selectedIndex, tree, virtual, virtualItemRef]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => enabled ? {
    reference,
    floating,
    item
  } : {}, [enabled, reference, floating, item]);
}
const componentRoleToAriaRoleMap = /* @__PURE__ */ new Map([["select", "listbox"], ["combobox", "listbox"], ["label", false]]);
function useRole(context, props) {
  var _elements$domReferenc, _componentRoleToAriaR;
  if (props === void 0) {
    props = {};
  }
  const {
    open,
    elements,
    floatingId: defaultFloatingId
  } = context;
  const {
    enabled = true,
    role = "dialog"
  } = props;
  const defaultReferenceId = useId();
  const referenceId = ((_elements$domReferenc = elements.domReference) == null ? void 0 : _elements$domReferenc.id) || defaultReferenceId;
  const floatingId = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    var _getFloatingFocusElem;
    return ((_getFloatingFocusElem = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getFloatingFocusElement)(elements.floating)) == null ? void 0 : _getFloatingFocusElem.id) || defaultFloatingId;
  }, [elements.floating, defaultFloatingId]);
  const ariaRole = (_componentRoleToAriaR = componentRoleToAriaRoleMap.get(role)) != null ? _componentRoleToAriaR : role;
  const parentId = useFloatingParentNodeId();
  const isNested = parentId != null;
  const reference = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    if (ariaRole === "tooltip" || role === "label") {
      return {
        ["aria-" + (role === "label" ? "labelledby" : "describedby")]: open ? floatingId : void 0
      };
    }
    return {
      "aria-expanded": open ? "true" : "false",
      "aria-haspopup": ariaRole === "alertdialog" ? "dialog" : ariaRole,
      "aria-controls": open ? floatingId : void 0,
      ...ariaRole === "listbox" && {
        role: "combobox"
      },
      ...ariaRole === "menu" && {
        id: referenceId
      },
      ...ariaRole === "menu" && isNested && {
        role: "menuitem"
      },
      ...role === "select" && {
        "aria-autocomplete": "none"
      },
      ...role === "combobox" && {
        "aria-autocomplete": "list"
      }
    };
  }, [ariaRole, floatingId, isNested, open, referenceId, role]);
  const floating = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    const floatingProps = {
      id: floatingId,
      ...ariaRole && {
        role: ariaRole
      }
    };
    if (ariaRole === "tooltip" || role === "label") {
      return floatingProps;
    }
    return {
      ...floatingProps,
      ...ariaRole === "menu" && {
        "aria-labelledby": referenceId
      }
    };
  }, [ariaRole, floatingId, referenceId, role]);
  const item = react__WEBPACK_IMPORTED_MODULE_0__.useCallback((_ref) => {
    let {
      active,
      selected
    } = _ref;
    const commonProps = {
      role: "option",
      ...active && {
        id: floatingId + "-fui-option"
      }
    };
    switch (role) {
      case "select":
      case "combobox":
        return {
          ...commonProps,
          "aria-selected": selected
        };
    }
    return {};
  }, [floatingId, role]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => enabled ? {
    reference,
    floating,
    item
  } : {}, [enabled, reference, floating, item]);
}
const camelCaseToKebabCase = (str) => str.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? "-" : "") + $.toLowerCase());
function execWithArgsOrReturn(valueOrFn, args) {
  return typeof valueOrFn === "function" ? valueOrFn(args) : valueOrFn;
}
function useDelayUnmount(open, durationMs) {
  const [isMounted, setIsMounted] = react__WEBPACK_IMPORTED_MODULE_0__.useState(open);
  if (open && !isMounted) {
    setIsMounted(true);
  }
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!open && isMounted) {
      const timeout = setTimeout(() => setIsMounted(false), durationMs);
      return () => clearTimeout(timeout);
    }
  }, [open, isMounted, durationMs]);
  return isMounted;
}
function useTransitionStatus(context, props) {
  if (props === void 0) {
    props = {};
  }
  const {
    open,
    elements: {
      floating
    }
  } = context;
  const {
    duration = 250
  } = props;
  const isNumberDuration = typeof duration === "number";
  const closeDuration = (isNumberDuration ? duration : duration.close) || 0;
  const [status, setStatus] = react__WEBPACK_IMPORTED_MODULE_0__.useState("unmounted");
  const isMounted = useDelayUnmount(open, closeDuration);
  if (!isMounted && status === "close") {
    setStatus("unmounted");
  }
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (!floating) return;
    if (open) {
      setStatus("initial");
      const frame = requestAnimationFrame(() => {
        react_dom__WEBPACK_IMPORTED_MODULE_5__.flushSync(() => {
          setStatus("open");
        });
      });
      return () => {
        cancelAnimationFrame(frame);
      };
    }
    setStatus("close");
  }, [open, floating]);
  return {
    isMounted,
    status
  };
}
function useTransitionStyles(context, props) {
  if (props === void 0) {
    props = {};
  }
  const {
    initial: unstable_initial = {
      opacity: 0
    },
    open: unstable_open,
    close: unstable_close,
    common: unstable_common,
    duration = 250
  } = props;
  const placement = context.placement;
  const side = placement.split("-")[0];
  const fnArgs = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    side,
    placement
  }), [side, placement]);
  const isNumberDuration = typeof duration === "number";
  const openDuration = (isNumberDuration ? duration : duration.open) || 0;
  const closeDuration = (isNumberDuration ? duration : duration.close) || 0;
  const [styles, setStyles] = react__WEBPACK_IMPORTED_MODULE_0__.useState(() => ({
    ...execWithArgsOrReturn(unstable_common, fnArgs),
    ...execWithArgsOrReturn(unstable_initial, fnArgs)
  }));
  const {
    isMounted,
    status
  } = useTransitionStatus(context, {
    duration
  });
  const initialRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(unstable_initial);
  const openRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(unstable_open);
  const closeRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(unstable_close);
  const commonRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(unstable_common);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    const initialStyles = execWithArgsOrReturn(initialRef.current, fnArgs);
    const closeStyles = execWithArgsOrReturn(closeRef.current, fnArgs);
    const commonStyles = execWithArgsOrReturn(commonRef.current, fnArgs);
    const openStyles = execWithArgsOrReturn(openRef.current, fnArgs) || Object.keys(initialStyles).reduce((acc, key) => {
      acc[key] = "";
      return acc;
    }, {});
    if (status === "initial") {
      setStyles((styles2) => ({
        transitionProperty: styles2.transitionProperty,
        ...commonStyles,
        ...initialStyles
      }));
    }
    if (status === "open") {
      setStyles({
        transitionProperty: Object.keys(openStyles).map(camelCaseToKebabCase).join(","),
        transitionDuration: openDuration + "ms",
        ...commonStyles,
        ...openStyles
      });
    }
    if (status === "close") {
      const styles2 = closeStyles || initialStyles;
      setStyles({
        transitionProperty: Object.keys(styles2).map(camelCaseToKebabCase).join(","),
        transitionDuration: closeDuration + "ms",
        ...commonStyles,
        ...styles2
      });
    }
  }, [closeDuration, closeRef, initialRef, openRef, commonRef, openDuration, status, fnArgs]);
  return {
    isMounted,
    styles
  };
}
function useTypeahead(context, props) {
  var _ref;
  const {
    open,
    dataRef
  } = context;
  const {
    listRef,
    activeIndex,
    onMatch: unstable_onMatch,
    onTypingChange: unstable_onTypingChange,
    enabled = true,
    findMatch = null,
    resetMs = 750,
    ignoreKeys = [],
    selectedIndex = null
  } = props;
  const timeoutIdRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(-1);
  const stringRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef("");
  const prevIndexRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef((_ref = selectedIndex != null ? selectedIndex : activeIndex) != null ? _ref : -1);
  const matchIndexRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const onMatch = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(unstable_onMatch);
  const onTypingChange = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(unstable_onTypingChange);
  const findMatchRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(findMatch);
  const ignoreKeysRef = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useLatestRef)(ignoreKeys);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (open) {
      clearTimeoutIfSet(timeoutIdRef);
      matchIndexRef.current = null;
      stringRef.current = "";
    }
  }, [open]);
  (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useModernLayoutEffect)(() => {
    if (open && stringRef.current === "") {
      var _ref2;
      prevIndexRef.current = (_ref2 = selectedIndex != null ? selectedIndex : activeIndex) != null ? _ref2 : -1;
    }
  }, [open, selectedIndex, activeIndex]);
  const setTypingChange = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((value) => {
    if (value) {
      if (!dataRef.current.typing) {
        dataRef.current.typing = value;
        onTypingChange(value);
      }
    } else {
      if (dataRef.current.typing) {
        dataRef.current.typing = value;
        onTypingChange(value);
      }
    }
  });
  const onKeyDown = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)((event) => {
    function getMatchingIndex(list, orderedList, string) {
      const str = findMatchRef.current ? findMatchRef.current(orderedList, string) : orderedList.find((text) => (text == null ? void 0 : text.toLocaleLowerCase().indexOf(string.toLocaleLowerCase())) === 0);
      return str ? list.indexOf(str) : -1;
    }
    const listContent = listRef.current;
    if (stringRef.current.length > 0 && stringRef.current[0] !== " ") {
      if (getMatchingIndex(listContent, listContent, stringRef.current) === -1) {
        setTypingChange(false);
      } else if (event.key === " ") {
        (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
      }
    }
    if (listContent == null || ignoreKeysRef.current.includes(event.key) || // Character key.
    event.key.length !== 1 || // Modifier key.
    event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (open && event.key !== " ") {
      (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.stopEvent)(event);
      setTypingChange(true);
    }
    const allowRapidSuccessionOfFirstLetter = listContent.every((text) => {
      var _text$, _text$2;
      return text ? ((_text$ = text[0]) == null ? void 0 : _text$.toLocaleLowerCase()) !== ((_text$2 = text[1]) == null ? void 0 : _text$2.toLocaleLowerCase()) : true;
    });
    if (allowRapidSuccessionOfFirstLetter && stringRef.current === event.key) {
      stringRef.current = "";
      prevIndexRef.current = matchIndexRef.current;
    }
    stringRef.current += event.key;
    clearTimeoutIfSet(timeoutIdRef);
    timeoutIdRef.current = window.setTimeout(() => {
      stringRef.current = "";
      prevIndexRef.current = matchIndexRef.current;
      setTypingChange(false);
    }, resetMs);
    const prevIndex = prevIndexRef.current;
    const index = getMatchingIndex(listContent, [...listContent.slice((prevIndex || 0) + 1), ...listContent.slice(0, (prevIndex || 0) + 1)], stringRef.current);
    if (index !== -1) {
      onMatch(index);
      matchIndexRef.current = index;
    } else if (event.key !== " ") {
      stringRef.current = "";
      setTypingChange(false);
    }
  });
  const reference = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    onKeyDown
  }), [onKeyDown]);
  const floating = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    return {
      onKeyDown,
      onKeyUp(event) {
        if (event.key === " ") {
          setTypingChange(false);
        }
      }
    };
  }, [onKeyDown, setTypingChange]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => enabled ? {
    reference,
    floating
  } : {}, [enabled, reference, floating]);
}
function getArgsWithCustomFloatingHeight(state, height) {
  return {
    ...state,
    rects: {
      ...state.rects,
      floating: {
        ...state.rects.floating,
        height
      }
    }
  };
}
const inner = (props) => ({
  name: "inner",
  options: props,
  async fn(state) {
    const {
      listRef,
      overflowRef,
      onFallbackChange,
      offset: innerOffset = 0,
      index = 0,
      minItemsVisible = 4,
      referenceOverflowThreshold = 0,
      scrollRef,
      ...detectOverflowOptions
    } = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_7__.evaluate)(props, state);
    const {
      rects,
      platform: platform2,
      elements: {
        floating
      }
    } = state;
    const item = listRef.current[index];
    const scrollEl = (scrollRef == null ? void 0 : scrollRef.current) || floating;
    const clientTop = floating.clientTop || scrollEl.clientTop;
    const floatingIsBordered = floating.clientTop !== 0;
    const scrollElIsBordered = scrollEl.clientTop !== 0;
    const floatingIsScrollEl = floating === scrollEl;
    if (true) {
      if (!state.placement.startsWith("bottom")) {
        warn('`placement` side must be "bottom" when using the `inner`', "middleware.");
      }
    }
    if (!item) {
      return {};
    }
    const nextArgs = {
      ...state,
      ...await (0,_floating_ui_react_dom__WEBPACK_IMPORTED_MODULE_6__.offset)(-item.offsetTop - floating.clientTop - rects.reference.height / 2 - item.offsetHeight / 2 - innerOffset).fn(state)
    };
    const overflow = await platform2.detectOverflow(getArgsWithCustomFloatingHeight(nextArgs, scrollEl.scrollHeight + clientTop + floating.clientTop), detectOverflowOptions);
    const refOverflow = await platform2.detectOverflow(nextArgs, {
      ...detectOverflowOptions,
      elementContext: "reference"
    });
    const diffY = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_7__.max)(0, overflow.top);
    const nextY = nextArgs.y + diffY;
    const isScrollable = scrollEl.scrollHeight > scrollEl.clientHeight;
    const rounder = isScrollable ? (v) => v : _floating_ui_utils__WEBPACK_IMPORTED_MODULE_7__.round;
    const maxHeight = rounder((0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_7__.max)(0, scrollEl.scrollHeight + (floatingIsBordered && floatingIsScrollEl || scrollElIsBordered ? clientTop * 2 : 0) - diffY - (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_7__.max)(0, overflow.bottom)));
    scrollEl.style.maxHeight = maxHeight + "px";
    scrollEl.scrollTop = diffY;
    if (onFallbackChange) {
      const shouldFallback = scrollEl.offsetHeight < item.offsetHeight * (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_7__.min)(minItemsVisible, listRef.current.length) - 1 || refOverflow.top >= -referenceOverflowThreshold || refOverflow.bottom >= -referenceOverflowThreshold;
      react_dom__WEBPACK_IMPORTED_MODULE_5__.flushSync(() => onFallbackChange(shouldFallback));
    }
    if (overflowRef) {
      overflowRef.current = await platform2.detectOverflow(getArgsWithCustomFloatingHeight({
        ...nextArgs,
        y: nextY
      }, scrollEl.offsetHeight + clientTop + floating.clientTop), detectOverflowOptions);
    }
    return {
      y: nextY
    };
  }
});
function useInnerOffset(context, props) {
  const {
    open,
    elements
  } = context;
  const {
    enabled = true,
    overflowRef,
    scrollRef,
    onChange: unstable_onChange
  } = props;
  const onChange = (0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.useEffectEvent)(unstable_onChange);
  const controlledScrollingRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(false);
  const prevScrollTopRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  const initialOverflowRef = react__WEBPACK_IMPORTED_MODULE_0__.useRef(null);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    if (!enabled) return;
    function onWheel(e) {
      if (e.ctrlKey || !el || overflowRef.current == null) {
        return;
      }
      const dY = e.deltaY;
      const isAtTop = overflowRef.current.top >= -0.5;
      const isAtBottom = overflowRef.current.bottom >= -0.5;
      const remainingScroll = el.scrollHeight - el.clientHeight;
      const sign = dY < 0 ? -1 : 1;
      const method = dY < 0 ? "max" : "min";
      if (el.scrollHeight <= el.clientHeight) {
        return;
      }
      if (!isAtTop && dY > 0 || !isAtBottom && dY < 0) {
        e.preventDefault();
        react_dom__WEBPACK_IMPORTED_MODULE_5__.flushSync(() => {
          onChange((d) => d + Math[method](dY, remainingScroll * sign));
        });
      } else if (/firefox/i.test((0,_floating_ui_react_utils__WEBPACK_IMPORTED_MODULE_1__.getUserAgent)())) {
        el.scrollTop += dY;
      }
    }
    const el = (scrollRef == null ? void 0 : scrollRef.current) || elements.floating;
    if (open && el) {
      el.addEventListener("wheel", onWheel);
      requestAnimationFrame(() => {
        prevScrollTopRef.current = el.scrollTop;
        if (overflowRef.current != null) {
          initialOverflowRef.current = {
            ...overflowRef.current
          };
        }
      });
      return () => {
        prevScrollTopRef.current = null;
        initialOverflowRef.current = null;
        el.removeEventListener("wheel", onWheel);
      };
    }
  }, [enabled, open, elements.floating, overflowRef, scrollRef, onChange]);
  const floating = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    onKeyDown() {
      controlledScrollingRef.current = true;
    },
    onWheel() {
      controlledScrollingRef.current = false;
    },
    onPointerMove() {
      controlledScrollingRef.current = false;
    },
    onScroll() {
      const el = (scrollRef == null ? void 0 : scrollRef.current) || elements.floating;
      if (!overflowRef.current || !el || !controlledScrollingRef.current) {
        return;
      }
      if (prevScrollTopRef.current !== null) {
        const scrollDiff = el.scrollTop - prevScrollTopRef.current;
        if (overflowRef.current.bottom < -0.5 && scrollDiff < -1 || overflowRef.current.top < -0.5 && scrollDiff > 1) {
          react_dom__WEBPACK_IMPORTED_MODULE_5__.flushSync(() => onChange((d) => d + scrollDiff));
        }
      }
      requestAnimationFrame(() => {
        prevScrollTopRef.current = el.scrollTop;
      });
    }
  }), [elements.floating, onChange, overflowRef, scrollRef]);
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => enabled ? {
    floating
  } : {}, [enabled, floating]);
}
function getNodeChildren(nodes, id, onlyOpenChildren) {
  if (onlyOpenChildren === void 0) {
    onlyOpenChildren = true;
  }
  const directChildren = nodes.filter((node) => {
    var _node$context;
    return node.parentId === id && (!onlyOpenChildren || ((_node$context = node.context) == null ? void 0 : _node$context.open));
  });
  return directChildren.flatMap((child) => [child, ...getNodeChildren(nodes, child.id, onlyOpenChildren)]);
}
function isPointInPolygon(point, polygon) {
  const [x, y] = point;
  let isInside2 = false;
  const length = polygon.length;
  for (let i = 0, j = length - 1; i < length; j = i++) {
    const [xi, yi] = polygon[i] || [0, 0];
    const [xj, yj] = polygon[j] || [0, 0];
    const intersect = yi >= y !== yj >= y && x <= (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (intersect) {
      isInside2 = !isInside2;
    }
  }
  return isInside2;
}
function isInside(point, rect) {
  return point[0] >= rect.x && point[0] <= rect.x + rect.width && point[1] >= rect.y && point[1] <= rect.y + rect.height;
}
function safePolygon(options) {
  if (options === void 0) {
    options = {};
  }
  const {
    buffer = 0.5,
    blockPointerEvents = false,
    requireIntent = true
  } = options;
  const timeoutRef = {
    current: -1
  };
  let hasLanded = false;
  let lastX = null;
  let lastY = null;
  let lastCursorTime = typeof performance !== "undefined" ? performance.now() : 0;
  function getCursorSpeed(x, y) {
    const currentTime = performance.now();
    const elapsedTime = currentTime - lastCursorTime;
    if (lastX === null || lastY === null || elapsedTime === 0) {
      lastX = x;
      lastY = y;
      lastCursorTime = currentTime;
      return null;
    }
    const deltaX = x - lastX;
    const deltaY = y - lastY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const speed = distance / elapsedTime;
    lastX = x;
    lastY = y;
    lastCursorTime = currentTime;
    return speed;
  }
  const fn = (_ref) => {
    let {
      x,
      y,
      placement,
      elements,
      onClose,
      nodeId,
      tree
    } = _ref;
    return function onMouseMove(event) {
      function close() {
        clearTimeoutIfSet(timeoutRef);
        onClose();
      }
      clearTimeoutIfSet(timeoutRef);
      if (!elements.domReference || !elements.floating || placement == null || x == null || y == null) {
        return;
      }
      const {
        clientX,
        clientY
      } = event;
      const clientPoint = [clientX, clientY];
      const target = getTarget(event);
      const isLeave = event.type === "mouseleave";
      const isOverFloatingEl = contains(elements.floating, target);
      const isOverReferenceEl = contains(elements.domReference, target);
      const refRect = elements.domReference.getBoundingClientRect();
      const rect = elements.floating.getBoundingClientRect();
      const side = placement.split("-")[0];
      const cursorLeaveFromRight = x > rect.right - rect.width / 2;
      const cursorLeaveFromBottom = y > rect.bottom - rect.height / 2;
      const isOverReferenceRect = isInside(clientPoint, refRect);
      const isFloatingWider = rect.width > refRect.width;
      const isFloatingTaller = rect.height > refRect.height;
      const left = (isFloatingWider ? refRect : rect).left;
      const right = (isFloatingWider ? refRect : rect).right;
      const top = (isFloatingTaller ? refRect : rect).top;
      const bottom = (isFloatingTaller ? refRect : rect).bottom;
      if (isOverFloatingEl) {
        hasLanded = true;
        if (!isLeave) {
          return;
        }
      }
      if (isOverReferenceEl) {
        hasLanded = false;
      }
      if (isOverReferenceEl && !isLeave) {
        hasLanded = true;
        return;
      }
      if (isLeave && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_3__.isElement)(event.relatedTarget) && contains(elements.floating, event.relatedTarget)) {
        return;
      }
      if (tree && getNodeChildren(tree.nodesRef.current, nodeId).length) {
        return;
      }
      if (side === "top" && y >= refRect.bottom - 1 || side === "bottom" && y <= refRect.top + 1 || side === "left" && x >= refRect.right - 1 || side === "right" && x <= refRect.left + 1) {
        return close();
      }
      let rectPoly = [];
      switch (side) {
        case "top":
          rectPoly = [[left, refRect.top + 1], [left, rect.bottom - 1], [right, rect.bottom - 1], [right, refRect.top + 1]];
          break;
        case "bottom":
          rectPoly = [[left, rect.top + 1], [left, refRect.bottom - 1], [right, refRect.bottom - 1], [right, rect.top + 1]];
          break;
        case "left":
          rectPoly = [[rect.right - 1, bottom], [rect.right - 1, top], [refRect.left + 1, top], [refRect.left + 1, bottom]];
          break;
        case "right":
          rectPoly = [[refRect.right - 1, bottom], [refRect.right - 1, top], [rect.left + 1, top], [rect.left + 1, bottom]];
          break;
      }
      function getPolygon(_ref2) {
        let [x2, y2] = _ref2;
        switch (side) {
          case "top": {
            const cursorPointOne = [isFloatingWider ? x2 + buffer / 2 : cursorLeaveFromRight ? x2 + buffer * 4 : x2 - buffer * 4, y2 + buffer + 1];
            const cursorPointTwo = [isFloatingWider ? x2 - buffer / 2 : cursorLeaveFromRight ? x2 + buffer * 4 : x2 - buffer * 4, y2 + buffer + 1];
            const commonPoints = [[rect.left, cursorLeaveFromRight ? rect.bottom - buffer : isFloatingWider ? rect.bottom - buffer : rect.top], [rect.right, cursorLeaveFromRight ? isFloatingWider ? rect.bottom - buffer : rect.top : rect.bottom - buffer]];
            return [cursorPointOne, cursorPointTwo, ...commonPoints];
          }
          case "bottom": {
            const cursorPointOne = [isFloatingWider ? x2 + buffer / 2 : cursorLeaveFromRight ? x2 + buffer * 4 : x2 - buffer * 4, y2 - buffer];
            const cursorPointTwo = [isFloatingWider ? x2 - buffer / 2 : cursorLeaveFromRight ? x2 + buffer * 4 : x2 - buffer * 4, y2 - buffer];
            const commonPoints = [[rect.left, cursorLeaveFromRight ? rect.top + buffer : isFloatingWider ? rect.top + buffer : rect.bottom], [rect.right, cursorLeaveFromRight ? isFloatingWider ? rect.top + buffer : rect.bottom : rect.top + buffer]];
            return [cursorPointOne, cursorPointTwo, ...commonPoints];
          }
          case "left": {
            const cursorPointOne = [x2 + buffer + 1, isFloatingTaller ? y2 + buffer / 2 : cursorLeaveFromBottom ? y2 + buffer * 4 : y2 - buffer * 4];
            const cursorPointTwo = [x2 + buffer + 1, isFloatingTaller ? y2 - buffer / 2 : cursorLeaveFromBottom ? y2 + buffer * 4 : y2 - buffer * 4];
            const commonPoints = [[cursorLeaveFromBottom ? rect.right - buffer : isFloatingTaller ? rect.right - buffer : rect.left, rect.top], [cursorLeaveFromBottom ? isFloatingTaller ? rect.right - buffer : rect.left : rect.right - buffer, rect.bottom]];
            return [...commonPoints, cursorPointOne, cursorPointTwo];
          }
          case "right": {
            const cursorPointOne = [x2 - buffer, isFloatingTaller ? y2 + buffer / 2 : cursorLeaveFromBottom ? y2 + buffer * 4 : y2 - buffer * 4];
            const cursorPointTwo = [x2 - buffer, isFloatingTaller ? y2 - buffer / 2 : cursorLeaveFromBottom ? y2 + buffer * 4 : y2 - buffer * 4];
            const commonPoints = [[cursorLeaveFromBottom ? rect.left + buffer : isFloatingTaller ? rect.left + buffer : rect.right, rect.top], [cursorLeaveFromBottom ? isFloatingTaller ? rect.left + buffer : rect.right : rect.left + buffer, rect.bottom]];
            return [cursorPointOne, cursorPointTwo, ...commonPoints];
          }
        }
      }
      if (isPointInPolygon([clientX, clientY], rectPoly)) {
        return;
      }
      if (hasLanded && !isOverReferenceRect) {
        return close();
      }
      if (!isLeave && requireIntent) {
        const cursorSpeed = getCursorSpeed(event.clientX, event.clientY);
        const cursorSpeedThreshold = 0.1;
        if (cursorSpeed !== null && cursorSpeed < cursorSpeedThreshold) {
          return close();
        }
      }
      if (!isPointInPolygon([clientX, clientY], getPolygon([x, y]))) {
        close();
      } else if (!hasLanded && requireIntent) {
        timeoutRef.current = window.setTimeout(close, 40);
      }
    };
  };
  fn.__options = {
    blockPointerEvents
  };
  return fn;
}



/***/ },

/***/ "../../node_modules/@floating-ui/react/dist/floating-ui.react.utils.mjs"
/*!******************************************************************************!*\
  !*** ../../node_modules/@floating-ui/react/dist/floating-ui.react.utils.mjs ***!
  \******************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   activeElement: () => (/* binding */ activeElement),
/* harmony export */   contains: () => (/* binding */ contains),
/* harmony export */   createGridCellMap: () => (/* binding */ createGridCellMap),
/* harmony export */   disableFocusInside: () => (/* binding */ disableFocusInside),
/* harmony export */   enableFocusInside: () => (/* binding */ enableFocusInside),
/* harmony export */   findNonDisabledListIndex: () => (/* binding */ findNonDisabledListIndex),
/* harmony export */   getDeepestNode: () => (/* binding */ getDeepestNode),
/* harmony export */   getDocument: () => (/* binding */ getDocument),
/* harmony export */   getFloatingFocusElement: () => (/* binding */ getFloatingFocusElement),
/* harmony export */   getGridCellIndexOfCorner: () => (/* binding */ getGridCellIndexOfCorner),
/* harmony export */   getGridCellIndices: () => (/* binding */ getGridCellIndices),
/* harmony export */   getGridNavigatedIndex: () => (/* binding */ getGridNavigatedIndex),
/* harmony export */   getMaxListIndex: () => (/* binding */ getMaxListIndex),
/* harmony export */   getMinListIndex: () => (/* binding */ getMinListIndex),
/* harmony export */   getNextTabbable: () => (/* binding */ getNextTabbable),
/* harmony export */   getNodeAncestors: () => (/* binding */ getNodeAncestors),
/* harmony export */   getNodeChildren: () => (/* binding */ getNodeChildren),
/* harmony export */   getPlatform: () => (/* binding */ getPlatform),
/* harmony export */   getPreviousTabbable: () => (/* binding */ getPreviousTabbable),
/* harmony export */   getTabbableOptions: () => (/* binding */ getTabbableOptions),
/* harmony export */   getTarget: () => (/* binding */ getTarget),
/* harmony export */   getUserAgent: () => (/* binding */ getUserAgent),
/* harmony export */   isEventTargetWithin: () => (/* binding */ isEventTargetWithin),
/* harmony export */   isIndexOutOfListBounds: () => (/* binding */ isIndexOutOfListBounds),
/* harmony export */   isListIndexDisabled: () => (/* binding */ isListIndexDisabled),
/* harmony export */   isMac: () => (/* binding */ isMac),
/* harmony export */   isMouseLikePointerType: () => (/* binding */ isMouseLikePointerType),
/* harmony export */   isOutsideEvent: () => (/* binding */ isOutsideEvent),
/* harmony export */   isReactEvent: () => (/* binding */ isReactEvent),
/* harmony export */   isRootElement: () => (/* binding */ isRootElement),
/* harmony export */   isSafari: () => (/* binding */ isSafari),
/* harmony export */   isTypeableCombobox: () => (/* binding */ isTypeableCombobox),
/* harmony export */   isTypeableElement: () => (/* binding */ isTypeableElement),
/* harmony export */   isVirtualClick: () => (/* binding */ isVirtualClick),
/* harmony export */   isVirtualPointerEvent: () => (/* binding */ isVirtualPointerEvent),
/* harmony export */   matchesFocusVisible: () => (/* binding */ matchesFocusVisible),
/* harmony export */   stopEvent: () => (/* binding */ stopEvent),
/* harmony export */   useEffectEvent: () => (/* binding */ useEffectEvent),
/* harmony export */   useLatestRef: () => (/* binding */ useLatestRef),
/* harmony export */   useModernLayoutEffect: () => (/* binding */ index)
/* harmony export */ });
/* unused harmony exports isAndroid, isDifferentGridRow, isJSDOM */
/* harmony import */ var _floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @floating-ui/utils/dom */ "../../node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _floating_ui_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @floating-ui/utils */ "../../node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs");
/* harmony import */ var tabbable__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! tabbable */ "../../node_modules/tabbable/dist/index.esm.js");





function getPlatform() {
  const uaData = navigator.userAgentData;
  if (uaData != null && uaData.platform) {
    return uaData.platform;
  }
  return navigator.platform;
}
function getUserAgent() {
  const uaData = navigator.userAgentData;
  if (uaData && Array.isArray(uaData.brands)) {
    return uaData.brands.map((_ref) => {
      let {
        brand,
        version
      } = _ref;
      return brand + "/" + version;
    }).join(" ");
  }
  return navigator.userAgent;
}
function isSafari() {
  return /apple/i.test(navigator.vendor);
}
function isAndroid() {
  const re = /android/i;
  return re.test(getPlatform()) || re.test(getUserAgent());
}
function isMac() {
  return getPlatform().toLowerCase().startsWith("mac") && !navigator.maxTouchPoints;
}
function isJSDOM() {
  return getUserAgent().includes("jsdom/");
}
const FOCUSABLE_ATTRIBUTE = "data-floating-ui-focusable";
const TYPEABLE_SELECTOR = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
const ARROW_LEFT = "ArrowLeft";
const ARROW_RIGHT = "ArrowRight";
const ARROW_UP = "ArrowUp";
const ARROW_DOWN = "ArrowDown";
function activeElement(doc) {
  let activeElement2 = doc.activeElement;
  while (((_activeElement = activeElement2) == null || (_activeElement = _activeElement.shadowRoot) == null ? void 0 : _activeElement.activeElement) != null) {
    var _activeElement;
    activeElement2 = activeElement2.shadowRoot.activeElement;
  }
  return activeElement2;
}
function contains(parent, child) {
  if (!parent || !child) {
    return false;
  }
  const rootNode = child.getRootNode == null ? void 0 : child.getRootNode();
  if (parent.contains(child)) {
    return true;
  }
  if (rootNode && (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_0__.isShadowRoot)(rootNode)) {
    let next = child;
    while (next) {
      if (parent === next) {
        return true;
      }
      next = next.parentNode || next.host;
    }
  }
  return false;
}
function getTarget(event) {
  if ("composedPath" in event) {
    return event.composedPath()[0];
  }
  return event.target;
}
function isEventTargetWithin(event, node) {
  if (node == null) {
    return false;
  }
  if ("composedPath" in event) {
    return event.composedPath().includes(node);
  }
  const e = event;
  return e.target != null && node.contains(e.target);
}
function isRootElement(element) {
  return element.matches("html,body");
}
function getDocument(node) {
  return (node == null ? void 0 : node.ownerDocument) || document;
}
function isTypeableElement(element) {
  return (0,_floating_ui_utils_dom__WEBPACK_IMPORTED_MODULE_0__.isHTMLElement)(element) && element.matches(TYPEABLE_SELECTOR);
}
function isTypeableCombobox(element) {
  if (!element) return false;
  return element.getAttribute("role") === "combobox" && isTypeableElement(element);
}
function matchesFocusVisible(element) {
  if (!element || isJSDOM()) return true;
  try {
    return element.matches(":focus-visible");
  } catch (_e) {
    return true;
  }
}
function getFloatingFocusElement(floatingElement) {
  if (!floatingElement) {
    return null;
  }
  return floatingElement.hasAttribute(FOCUSABLE_ATTRIBUTE) ? floatingElement : floatingElement.querySelector("[" + FOCUSABLE_ATTRIBUTE + "]") || floatingElement;
}
function getNodeChildren(nodes, id, onlyOpenChildren) {
  if (onlyOpenChildren === void 0) {
    onlyOpenChildren = true;
  }
  const directChildren = nodes.filter((node) => {
    var _node$context;
    return node.parentId === id && (!onlyOpenChildren || ((_node$context = node.context) == null ? void 0 : _node$context.open));
  });
  return directChildren.flatMap((child) => [child, ...getNodeChildren(nodes, child.id, onlyOpenChildren)]);
}
function getDeepestNode(nodes, id) {
  let deepestNodeId;
  let maxDepth = -1;
  function findDeepest(nodeId, depth) {
    if (depth > maxDepth) {
      deepestNodeId = nodeId;
      maxDepth = depth;
    }
    const children = getNodeChildren(nodes, nodeId);
    children.forEach((child) => {
      findDeepest(child.id, depth + 1);
    });
  }
  findDeepest(id, 0);
  return nodes.find((node) => node.id === deepestNodeId);
}
function getNodeAncestors(nodes, id) {
  var _nodes$find;
  let allAncestors = [];
  let currentParentId = (_nodes$find = nodes.find((node) => node.id === id)) == null ? void 0 : _nodes$find.parentId;
  while (currentParentId) {
    const currentNode = nodes.find((node) => node.id === currentParentId);
    currentParentId = currentNode == null ? void 0 : currentNode.parentId;
    if (currentNode) {
      allAncestors = allAncestors.concat(currentNode);
    }
  }
  return allAncestors;
}
function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}
function isReactEvent(event) {
  return "nativeEvent" in event;
}
function isVirtualClick(event) {
  if (event.mozInputSource === 0 && event.isTrusted) {
    return true;
  }
  if (isAndroid() && event.pointerType) {
    return event.type === "click" && event.buttons === 1;
  }
  return event.detail === 0 && !event.pointerType;
}
function isVirtualPointerEvent(event) {
  if (isJSDOM()) return false;
  return !isAndroid() && event.width === 0 && event.height === 0 || isAndroid() && event.width === 1 && event.height === 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "mouse" || // iOS VoiceOver returns 0.333• for width/height.
  event.width < 1 && event.height < 1 && event.pressure === 0 && event.detail === 0 && event.pointerType === "touch";
}
function isMouseLikePointerType(pointerType, strict) {
  const values = ["mouse", "pen"];
  if (!strict) {
    values.push("", void 0);
  }
  return values.includes(pointerType);
}
var isClient = typeof document !== "undefined";
var noop = function noop2() {
};
var index = isClient ? react__WEBPACK_IMPORTED_MODULE_1__.useLayoutEffect : noop;
const SafeReact = {
  ...react__WEBPACK_IMPORTED_MODULE_1__
};
function useLatestRef(value) {
  const ref = react__WEBPACK_IMPORTED_MODULE_1__.useRef(value);
  index(() => {
    ref.current = value;
  });
  return ref;
}
const useInsertionEffect = SafeReact.useInsertionEffect;
const useSafeInsertionEffect = useInsertionEffect || ((fn) => fn());
function useEffectEvent(callback) {
  const ref = react__WEBPACK_IMPORTED_MODULE_1__.useRef(() => {
    if (true) {
      throw new Error("Cannot call an event handler while rendering.");
    }
  });
  useSafeInsertionEffect(() => {
    ref.current = callback;
  });
  return react__WEBPACK_IMPORTED_MODULE_1__.useCallback(function() {
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    return ref.current == null ? void 0 : ref.current(...args);
  }, []);
}
function isDifferentGridRow(index2, cols, prevRow) {
  return Math.floor(index2 / cols) !== prevRow;
}
function isIndexOutOfListBounds(listRef, index2) {
  return index2 < 0 || index2 >= listRef.current.length;
}
function getMinListIndex(listRef, disabledIndices) {
  return findNonDisabledListIndex(listRef, {
    disabledIndices
  });
}
function getMaxListIndex(listRef, disabledIndices) {
  return findNonDisabledListIndex(listRef, {
    decrement: true,
    startingIndex: listRef.current.length,
    disabledIndices
  });
}
function findNonDisabledListIndex(listRef, _temp) {
  let {
    startingIndex = -1,
    decrement = false,
    disabledIndices,
    amount = 1
  } = _temp === void 0 ? {} : _temp;
  let index2 = startingIndex;
  do {
    index2 += decrement ? -amount : amount;
  } while (index2 >= 0 && index2 <= listRef.current.length - 1 && isListIndexDisabled(listRef, index2, disabledIndices));
  return index2;
}
function getGridNavigatedIndex(listRef, _ref) {
  let {
    event,
    orientation,
    loop,
    rtl,
    cols,
    disabledIndices,
    minIndex,
    maxIndex,
    prevIndex,
    stopEvent: stop = false
  } = _ref;
  let nextIndex = prevIndex;
  if (event.key === ARROW_UP) {
    stop && stopEvent(event);
    if (prevIndex === -1) {
      nextIndex = maxIndex;
    } else {
      nextIndex = findNonDisabledListIndex(listRef, {
        startingIndex: nextIndex,
        amount: cols,
        decrement: true,
        disabledIndices
      });
      if (loop && (prevIndex - cols < minIndex || nextIndex < 0)) {
        const col = prevIndex % cols;
        const maxCol = maxIndex % cols;
        const offset = maxIndex - (maxCol - col);
        if (maxCol === col) {
          nextIndex = maxIndex;
        } else {
          nextIndex = maxCol > col ? offset : offset - cols;
        }
      }
    }
    if (isIndexOutOfListBounds(listRef, nextIndex)) {
      nextIndex = prevIndex;
    }
  }
  if (event.key === ARROW_DOWN) {
    stop && stopEvent(event);
    if (prevIndex === -1) {
      nextIndex = minIndex;
    } else {
      nextIndex = findNonDisabledListIndex(listRef, {
        startingIndex: prevIndex,
        amount: cols,
        disabledIndices
      });
      if (loop && prevIndex + cols > maxIndex) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex % cols - cols,
          amount: cols,
          disabledIndices
        });
      }
    }
    if (isIndexOutOfListBounds(listRef, nextIndex)) {
      nextIndex = prevIndex;
    }
  }
  if (orientation === "both") {
    const prevRow = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_2__.floor)(prevIndex / cols);
    if (event.key === (rtl ? ARROW_LEFT : ARROW_RIGHT)) {
      stop && stopEvent(event);
      if (prevIndex % cols !== cols - 1) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex,
          disabledIndices
        });
        if (loop && isDifferentGridRow(nextIndex, cols, prevRow)) {
          nextIndex = findNonDisabledListIndex(listRef, {
            startingIndex: prevIndex - prevIndex % cols - 1,
            disabledIndices
          });
        }
      } else if (loop) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex - prevIndex % cols - 1,
          disabledIndices
        });
      }
      if (isDifferentGridRow(nextIndex, cols, prevRow)) {
        nextIndex = prevIndex;
      }
    }
    if (event.key === (rtl ? ARROW_RIGHT : ARROW_LEFT)) {
      stop && stopEvent(event);
      if (prevIndex % cols !== 0) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex,
          decrement: true,
          disabledIndices
        });
        if (loop && isDifferentGridRow(nextIndex, cols, prevRow)) {
          nextIndex = findNonDisabledListIndex(listRef, {
            startingIndex: prevIndex + (cols - prevIndex % cols),
            decrement: true,
            disabledIndices
          });
        }
      } else if (loop) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex + (cols - prevIndex % cols),
          decrement: true,
          disabledIndices
        });
      }
      if (isDifferentGridRow(nextIndex, cols, prevRow)) {
        nextIndex = prevIndex;
      }
    }
    const lastRow = (0,_floating_ui_utils__WEBPACK_IMPORTED_MODULE_2__.floor)(maxIndex / cols) === prevRow;
    if (isIndexOutOfListBounds(listRef, nextIndex)) {
      if (loop && lastRow) {
        nextIndex = event.key === (rtl ? ARROW_RIGHT : ARROW_LEFT) ? maxIndex : findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex - prevIndex % cols - 1,
          disabledIndices
        });
      } else {
        nextIndex = prevIndex;
      }
    }
  }
  return nextIndex;
}
function createGridCellMap(sizes, cols, dense) {
  const cellMap = [];
  let startIndex = 0;
  sizes.forEach((_ref2, index2) => {
    let {
      width,
      height
    } = _ref2;
    if (width > cols) {
      if (true) {
        throw new Error("[Floating UI]: Invalid grid - item width at index " + index2 + " is greater than grid columns");
      }
    }
    let itemPlaced = false;
    if (dense) {
      startIndex = 0;
    }
    while (!itemPlaced) {
      const targetCells = [];
      for (let i = 0; i < width; i++) {
        for (let j = 0; j < height; j++) {
          targetCells.push(startIndex + i + j * cols);
        }
      }
      if (startIndex % cols + width <= cols && targetCells.every((cell) => cellMap[cell] == null)) {
        targetCells.forEach((cell) => {
          cellMap[cell] = index2;
        });
        itemPlaced = true;
      } else {
        startIndex++;
      }
    }
  });
  return [...cellMap];
}
function getGridCellIndexOfCorner(index2, sizes, cellMap, cols, corner) {
  if (index2 === -1) return -1;
  const firstCellIndex = cellMap.indexOf(index2);
  const sizeItem = sizes[index2];
  switch (corner) {
    case "tl":
      return firstCellIndex;
    case "tr":
      if (!sizeItem) {
        return firstCellIndex;
      }
      return firstCellIndex + sizeItem.width - 1;
    case "bl":
      if (!sizeItem) {
        return firstCellIndex;
      }
      return firstCellIndex + (sizeItem.height - 1) * cols;
    case "br":
      return cellMap.lastIndexOf(index2);
  }
}
function getGridCellIndices(indices, cellMap) {
  return cellMap.flatMap((index2, cellIndex) => indices.includes(index2) ? [cellIndex] : []);
}
function isListIndexDisabled(listRef, index2, disabledIndices) {
  if (typeof disabledIndices === "function") {
    return disabledIndices(index2);
  } else if (disabledIndices) {
    return disabledIndices.includes(index2);
  }
  const element = listRef.current[index2];
  return element == null || element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
}
const getTabbableOptions = () => ({
  getShadowRoot: true,
  displayCheck: (
    // JSDOM does not support the `tabbable` library. To solve this we can
    // check if `ResizeObserver` is a real function (not polyfilled), which
    // determines if the current environment is JSDOM-like.
    typeof ResizeObserver === "function" && ResizeObserver.toString().includes("[native code]") ? "full" : "none"
  )
});
function getTabbableIn(container, dir) {
  const list = (0,tabbable__WEBPACK_IMPORTED_MODULE_3__.tabbable)(container, getTabbableOptions());
  const len = list.length;
  if (len === 0) return;
  const active = activeElement(getDocument(container));
  const index2 = list.indexOf(active);
  const nextIndex = index2 === -1 ? dir === 1 ? 0 : len - 1 : index2 + dir;
  return list[nextIndex];
}
function getNextTabbable(referenceElement) {
  return getTabbableIn(getDocument(referenceElement).body, 1) || referenceElement;
}
function getPreviousTabbable(referenceElement) {
  return getTabbableIn(getDocument(referenceElement).body, -1) || referenceElement;
}
function isOutsideEvent(event, container) {
  const containerElement = container || event.currentTarget;
  const relatedTarget = event.relatedTarget;
  return !relatedTarget || !contains(containerElement, relatedTarget);
}
function disableFocusInside(container) {
  const tabbableElements = (0,tabbable__WEBPACK_IMPORTED_MODULE_3__.tabbable)(container, getTabbableOptions());
  tabbableElements.forEach((element) => {
    element.dataset.tabindex = element.getAttribute("tabindex") || "";
    element.setAttribute("tabindex", "-1");
  });
}
function enableFocusInside(container) {
  const elements = container.querySelectorAll("[data-tabindex]");
  elements.forEach((element) => {
    const tabindex = element.dataset.tabindex;
    delete element.dataset.tabindex;
    if (tabindex) {
      element.setAttribute("tabindex", tabindex);
    } else {
      element.removeAttribute("tabindex");
    }
  });
}



/***/ },

/***/ "../../node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs"
/*!****************************************************************************!*\
  !*** ../../node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs ***!
  \****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getComputedStyle: () => (/* binding */ getComputedStyle),
/* harmony export */   getContainingBlock: () => (/* binding */ getContainingBlock),
/* harmony export */   getDocumentElement: () => (/* binding */ getDocumentElement),
/* harmony export */   getFrameElement: () => (/* binding */ getFrameElement),
/* harmony export */   getNodeName: () => (/* binding */ getNodeName),
/* harmony export */   getNodeScroll: () => (/* binding */ getNodeScroll),
/* harmony export */   getOverflowAncestors: () => (/* binding */ getOverflowAncestors),
/* harmony export */   getParentNode: () => (/* binding */ getParentNode),
/* harmony export */   getWindow: () => (/* binding */ getWindow),
/* harmony export */   isContainingBlock: () => (/* binding */ isContainingBlock),
/* harmony export */   isElement: () => (/* binding */ isElement),
/* harmony export */   isHTMLElement: () => (/* binding */ isHTMLElement),
/* harmony export */   isLastTraversableNode: () => (/* binding */ isLastTraversableNode),
/* harmony export */   isNode: () => (/* binding */ isNode),
/* harmony export */   isOverflowElement: () => (/* binding */ isOverflowElement),
/* harmony export */   isShadowRoot: () => (/* binding */ isShadowRoot),
/* harmony export */   isTableElement: () => (/* binding */ isTableElement),
/* harmony export */   isTopLayer: () => (/* binding */ isTopLayer),
/* harmony export */   isWebKit: () => (/* binding */ isWebKit)
/* harmony export */ });
/* unused harmony export getNearestOverflowAncestor */
function hasWindow() {
  return typeof window !== "undefined";
}
function getNodeName(node) {
  if (isNode(node)) {
    return (node.nodeName || "").toLowerCase();
  }
  return "#document";
}
function getWindow(node) {
  var _node$ownerDocument;
  return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
}
function getDocumentElement(node) {
  var _ref;
  return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
}
function isNode(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof Node || value instanceof getWindow(value).Node;
}
function isElement(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof Element || value instanceof getWindow(value).Element;
}
function isHTMLElement(value) {
  if (!hasWindow()) {
    return false;
  }
  return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
}
function isShadowRoot(value) {
  if (!hasWindow() || typeof ShadowRoot === "undefined") {
    return false;
  }
  return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
}
function isOverflowElement(element) {
  const {
    overflow,
    overflowX,
    overflowY,
    display
  } = getComputedStyle(element);
  return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
}
function isTableElement(element) {
  return /^(table|td|th)$/.test(getNodeName(element));
}
function isTopLayer(element) {
  try {
    if (element.matches(":popover-open")) {
      return true;
    }
  } catch (_e) {
  }
  try {
    return element.matches(":modal");
  } catch (_e) {
    return false;
  }
}
const willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
const containRe = /paint|layout|strict|content/;
const isNotNone = (value) => !!value && value !== "none";
let isWebKitValue;
function isContainingBlock(elementOrCss) {
  const css = isElement(elementOrCss) ? getComputedStyle(elementOrCss) : elementOrCss;
  return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
}
function getContainingBlock(element) {
  let currentNode = getParentNode(element);
  while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
    if (isContainingBlock(currentNode)) {
      return currentNode;
    } else if (isTopLayer(currentNode)) {
      return null;
    }
    currentNode = getParentNode(currentNode);
  }
  return null;
}
function isWebKit() {
  if (isWebKitValue == null) {
    isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
  }
  return isWebKitValue;
}
function isLastTraversableNode(node) {
  return /^(html|body|#document)$/.test(getNodeName(node));
}
function getComputedStyle(element) {
  return getWindow(element).getComputedStyle(element);
}
function getNodeScroll(element) {
  if (isElement(element)) {
    return {
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop
    };
  }
  return {
    scrollLeft: element.scrollX,
    scrollTop: element.scrollY
  };
}
function getParentNode(node) {
  if (getNodeName(node) === "html") {
    return node;
  }
  const result = (
    // Step into the shadow DOM of the parent of a slotted node.
    node.assignedSlot || // DOM Element detected.
    node.parentNode || // ShadowRoot detected.
    isShadowRoot(node) && node.host || // Fallback.
    getDocumentElement(node)
  );
  return isShadowRoot(result) ? result.host : result;
}
function getNearestOverflowAncestor(node) {
  const parentNode = getParentNode(node);
  if (isLastTraversableNode(parentNode)) {
    return node.ownerDocument ? node.ownerDocument.body : node.body;
  }
  if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) {
    return parentNode;
  }
  return getNearestOverflowAncestor(parentNode);
}
function getOverflowAncestors(node, list, traverseIframes) {
  var _node$ownerDocument2;
  if (list === void 0) {
    list = [];
  }
  if (traverseIframes === void 0) {
    traverseIframes = true;
  }
  const scrollableAncestor = getNearestOverflowAncestor(node);
  const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
  const win = getWindow(scrollableAncestor);
  if (isBody) {
    const frameElement = getFrameElement(win);
    return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
  } else {
    return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
  }
}
function getFrameElement(win) {
  return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
}



/***/ },

/***/ "../../node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs"
/*!************************************************************************!*\
  !*** ../../node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs ***!
  \************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   clamp: () => (/* binding */ clamp),
/* harmony export */   createCoords: () => (/* binding */ createCoords),
/* harmony export */   evaluate: () => (/* binding */ evaluate),
/* harmony export */   floor: () => (/* binding */ floor),
/* harmony export */   getAlignment: () => (/* binding */ getAlignment),
/* harmony export */   getAlignmentAxis: () => (/* binding */ getAlignmentAxis),
/* harmony export */   getAlignmentSides: () => (/* binding */ getAlignmentSides),
/* harmony export */   getAxisLength: () => (/* binding */ getAxisLength),
/* harmony export */   getExpandedPlacements: () => (/* binding */ getExpandedPlacements),
/* harmony export */   getOppositeAlignmentPlacement: () => (/* binding */ getOppositeAlignmentPlacement),
/* harmony export */   getOppositeAxis: () => (/* binding */ getOppositeAxis),
/* harmony export */   getOppositeAxisPlacements: () => (/* binding */ getOppositeAxisPlacements),
/* harmony export */   getOppositePlacement: () => (/* binding */ getOppositePlacement),
/* harmony export */   getPaddingObject: () => (/* binding */ getPaddingObject),
/* harmony export */   getSide: () => (/* binding */ getSide),
/* harmony export */   getSideAxis: () => (/* binding */ getSideAxis),
/* harmony export */   max: () => (/* binding */ max),
/* harmony export */   min: () => (/* binding */ min),
/* harmony export */   placements: () => (/* binding */ placements),
/* harmony export */   rectToClientRect: () => (/* binding */ rectToClientRect),
/* harmony export */   round: () => (/* binding */ round),
/* harmony export */   sides: () => (/* binding */ sides)
/* harmony export */ });
/* unused harmony exports alignments, expandPaddingObject */
const sides = ["top", "right", "bottom", "left"];
const alignments = ["start", "end"];
const placements = /* @__PURE__ */ sides.reduce((acc, side) => acc.concat(side, side + "-" + alignments[0], side + "-" + alignments[1]), []);
const min = Math.min;
const max = Math.max;
const round = Math.round;
const floor = Math.floor;
const createCoords = (v) => ({
  x: v,
  y: v
});
const oppositeSideMap = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function clamp(start, value, end) {
  return max(start, min(value, end));
}
function evaluate(value, param) {
  return typeof value === "function" ? value(param) : value;
}
function getSide(placement) {
  return placement.split("-")[0];
}
function getAlignment(placement) {
  return placement.split("-")[1];
}
function getOppositeAxis(axis) {
  return axis === "x" ? "y" : "x";
}
function getAxisLength(axis) {
  return axis === "y" ? "height" : "width";
}
function getSideAxis(placement) {
  const firstChar = placement[0];
  return firstChar === "t" || firstChar === "b" ? "y" : "x";
}
function getAlignmentAxis(placement) {
  return getOppositeAxis(getSideAxis(placement));
}
function getAlignmentSides(placement, rects, rtl) {
  if (rtl === void 0) {
    rtl = false;
  }
  const alignment = getAlignment(placement);
  const alignmentAxis = getAlignmentAxis(placement);
  const length = getAxisLength(alignmentAxis);
  let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
  if (rects.reference[length] > rects.floating[length]) {
    mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
  }
  return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
}
function getExpandedPlacements(placement) {
  const oppositePlacement = getOppositePlacement(placement);
  return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
}
function getOppositeAlignmentPlacement(placement) {
  return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
}
const lrPlacement = ["left", "right"];
const rlPlacement = ["right", "left"];
const tbPlacement = ["top", "bottom"];
const btPlacement = ["bottom", "top"];
function getSideList(side, isStart, rtl) {
  switch (side) {
    case "top":
    case "bottom":
      if (rtl) return isStart ? rlPlacement : lrPlacement;
      return isStart ? lrPlacement : rlPlacement;
    case "left":
    case "right":
      return isStart ? tbPlacement : btPlacement;
    default:
      return [];
  }
}
function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
  const alignment = getAlignment(placement);
  let list = getSideList(getSide(placement), direction === "start", rtl);
  if (alignment) {
    list = list.map((side) => side + "-" + alignment);
    if (flipAlignment) {
      list = list.concat(list.map(getOppositeAlignmentPlacement));
    }
  }
  return list;
}
function getOppositePlacement(placement) {
  const side = getSide(placement);
  return oppositeSideMap[side] + placement.slice(side.length);
}
function expandPaddingObject(padding) {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...padding
  };
}
function getPaddingObject(padding) {
  return typeof padding !== "number" ? expandPaddingObject(padding) : {
    top: padding,
    right: padding,
    bottom: padding,
    left: padding
  };
}
function rectToClientRect(rect) {
  const {
    x,
    y,
    width,
    height
  } = rect;
  return {
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    x,
    y
  };
}



/***/ }

}]);