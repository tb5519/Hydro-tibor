!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"970d75aa8607cff89eb0648ee23d6fafc2d8eca2"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="02152608-84d3-4b82-b60e-f9cbe7c5abb0",e._sentryDebugIdIdentifier="sentry-dbid-02152608-84d3-4b82-b60e-f9cbe7c5abb0");}catch(e){}}();
"use strict";
(self["webpackChunk_hydrooj_ui_default"] = self["webpackChunk_hydrooj_ui_default"] || []).push([["n.timeago.js"],{

/***/ "../../node_modules/diff-dom/dist/module.js"
/*!**************************************************!*\
  !*** ../../node_modules/diff-dom/dist/module.js ***!
  \**************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   DiffDOM: () => (/* binding */ DiffDOM),
/* harmony export */   TraceLogger: () => (/* binding */ TraceLogger),
/* harmony export */   nodeToObj: () => (/* binding */ nodeToObj),
/* harmony export */   stringToObj: () => (/* binding */ stringToObj)
/* harmony export */ });
var __assign = function() {
  __assign = Object.assign || function __assign2(t) {
    var arguments$1 = arguments;
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments$1[i];
      for (var p in s) {
        if (Object.prototype.hasOwnProperty.call(s, p)) {
          t[p] = s[p];
        }
      }
    }
    return t;
  };
  return __assign.apply(this, arguments);
};
function __spreadArray(to, from, pack) {
  if (pack || arguments.length === 2) {
    for (var i = 0, l = from.length, ar; i < l; i++) {
      if (ar || !(i in from)) {
        if (!ar) {
          ar = Array.prototype.slice.call(from, 0, i);
        }
        ar[i] = from[i];
      }
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
}
typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
  var e = new Error(message);
  return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};
var Diff = (
  /** @class */
  (function() {
    function Diff2(options) {
      if (options === void 0) {
        options = {};
      }
      var _this = this;
      Object.entries(options).forEach(function(_a) {
        var key = _a[0], value = _a[1];
        return _this[key] = value;
      });
    }
    Diff2.prototype.toString = function() {
      return JSON.stringify(this);
    };
    Diff2.prototype.setValue = function(aKey, aValue) {
      this[aKey] = aValue;
      return this;
    };
    return Diff2;
  })()
);
function checkElementType(element, simplifiedCheck) {
  var arguments$1 = arguments;
  if (simplifiedCheck === void 0) {
    simplifiedCheck = false;
  }
  var elementTypeNames = [];
  for (var _i = 2; _i < arguments.length; _i++) {
    elementTypeNames[_i - 2] = arguments$1[_i];
  }
  if (typeof element === "undefined" || element === null) {
    return false;
  }
  if (simplifiedCheck) {
    var simplifiedResult = elementTypeNames.some(function(elementTypeName) {
      if (elementTypeName === "Element") {
        return element.nodeType === 1 || typeof element.nodeName === "string" && element.nodeName !== "#text" && element.nodeName !== "#comment" || // Additional check for real DOM elements that might not have nodeType
        element.tagName && typeof element.tagName === "string" || // Check if it has DOM element-like properties (fallback)
        element.setAttribute && typeof element.setAttribute === "function";
      }
      if (elementTypeName === "Text") {
        return element.nodeType === 3 || element.nodeName === "#text";
      }
      if (elementTypeName === "Comment") {
        return element.nodeType === 8 || element.nodeName === "#comment";
      }
      if (elementTypeName.startsWith("HTML") && elementTypeName.endsWith("Element")) {
        var tagName = elementTypeName.slice(4, -7).toLowerCase();
        return element.nodeName && element.nodeName.toLowerCase() === tagName || element.tagName && element.tagName.toLowerCase() === tagName;
      }
      return false;
    });
    if (simplifiedResult) {
      return true;
    }
    if (element.ownerDocument) {
      return elementTypeNames.some(function(elementTypeName) {
        var _a, _b;
        return typeof ((_b = (_a = element === null || element === void 0 ? void 0 : element.ownerDocument) === null || _a === void 0 ? void 0 : _a.defaultView) === null || _b === void 0 ? void 0 : _b[elementTypeName]) === "function" && element instanceof element.ownerDocument.defaultView[elementTypeName];
      });
    }
    return false;
  }
  return elementTypeNames.some(function(elementTypeName) {
    var _a, _b;
    return typeof ((_b = (_a = element === null || element === void 0 ? void 0 : element.ownerDocument) === null || _a === void 0 ? void 0 : _a.defaultView) === null || _b === void 0 ? void 0 : _b[elementTypeName]) === "function" && element instanceof element.ownerDocument.defaultView[elementTypeName];
  });
}
function objToNode(objNode, insideSvg, options) {
  var node;
  if (objNode.nodeName === "#text") {
    node = options.document.createTextNode(objNode.data);
  } else if (objNode.nodeName === "#comment") {
    node = options.document.createComment(objNode.data);
  } else {
    if (insideSvg) {
      node = options.document.createElementNS("http://www.w3.org/2000/svg", objNode.nodeName);
      if (objNode.nodeName === "foreignObject") {
        insideSvg = false;
      }
    } else if (objNode.nodeName.toLowerCase() === "svg") {
      node = options.document.createElementNS("http://www.w3.org/2000/svg", "svg");
      insideSvg = true;
    } else {
      node = options.document.createElement(objNode.nodeName);
    }
    if (objNode.attributes) {
      Object.entries(objNode.attributes).forEach(function(_a) {
        var key = _a[0], value = _a[1];
        return node.setAttribute(key, value);
      });
    }
    if (objNode.childNodes) {
      node = node;
      objNode.childNodes.forEach(function(childNode) {
        return node.appendChild(objToNode(childNode, insideSvg, options));
      });
    }
    if (options.valueDiffing) {
      if (objNode.value && checkElementType(node, options.simplifiedElementCheck, "HTMLButtonElement", "HTMLDataElement", "HTMLInputElement", "HTMLLIElement", "HTMLMeterElement", "HTMLOptionElement", "HTMLProgressElement", "HTMLParamElement")) {
        node.value = objNode.value;
      }
      if (objNode.checked && checkElementType(node, options.simplifiedElementCheck, "HTMLInputElement")) {
        node.checked = objNode.checked;
      }
      if (objNode.selected && checkElementType(node, options.simplifiedElementCheck, "HTMLOptionElement")) {
        node.selected = objNode.selected;
      }
    }
  }
  return node;
}
var getFromRoute = function(node, route) {
  route = route.slice();
  while (route.length > 0) {
    var c = route.splice(0, 1)[0];
    node = node.childNodes[c];
  }
  return node;
};
function applyDiff(tree, diff, options) {
  var action = diff[options._const.action];
  var route = diff[options._const.route];
  var node;
  if (![options._const.addElement, options._const.addTextElement].includes(action)) {
    node = getFromRoute(tree, route);
  }
  var newNode;
  var reference;
  var nodeArray;
  var info = {
    diff,
    node
  };
  if (options.preDiffApply(info)) {
    return true;
  }
  switch (action) {
    case options._const.addAttribute:
      if (!node || !checkElementType(node, options.simplifiedElementCheck, "Element")) {
        return false;
      }
      node.setAttribute(diff[options._const.name], diff[options._const.value]);
      break;
    case options._const.modifyAttribute:
      if (!node || !checkElementType(node, options.simplifiedElementCheck, "Element")) {
        return false;
      }
      node.setAttribute(diff[options._const.name], diff[options._const.newValue]);
      if (checkElementType(node, options.simplifiedElementCheck, "HTMLInputElement") && diff[options._const.name] === "value") {
        node.value = diff[options._const.newValue];
      }
      break;
    case options._const.removeAttribute:
      if (!node || !checkElementType(node, options.simplifiedElementCheck, "Element")) {
        return false;
      }
      node.removeAttribute(diff[options._const.name]);
      break;
    case options._const.modifyTextElement:
      if (!node || !checkElementType(node, options.simplifiedElementCheck, "Text")) {
        return false;
      }
      options.textDiff(node, node.data, diff[options._const.oldValue], diff[options._const.newValue]);
      if (checkElementType(node.parentNode, options.simplifiedElementCheck, "HTMLTextAreaElement")) {
        node.parentNode.value = diff[options._const.newValue];
      }
      break;
    case options._const.modifyValue:
      if (!node || typeof node.value === "undefined") {
        return false;
      }
      node.value = diff[options._const.newValue];
      break;
    case options._const.modifyComment:
      if (!node || !checkElementType(node, options.simplifiedElementCheck, "Comment")) {
        return false;
      }
      options.textDiff(node, node.data, diff[options._const.oldValue], diff[options._const.newValue]);
      break;
    case options._const.modifyChecked:
      if (!node || typeof node.checked === "undefined") {
        return false;
      }
      node.checked = diff[options._const.newValue];
      break;
    case options._const.modifySelected:
      if (!node || typeof node.selected === "undefined") {
        return false;
      }
      node.selected = diff[options._const.newValue];
      break;
    case options._const.replaceElement: {
      var insideSvg = diff[options._const.newValue].nodeName.toLowerCase() === "svg" || node.parentNode.namespaceURI === "http://www.w3.org/2000/svg";
      node.parentNode.replaceChild(objToNode(diff[options._const.newValue], insideSvg, options), node);
      break;
    }
    case options._const.relocateGroup:
      nodeArray = __spreadArray([], new Array(diff[options._const.groupLength]), true).map(function() {
        return node.removeChild(node.childNodes[diff[options._const.from]]);
      });
      nodeArray.forEach(function(childNode, index) {
        if (index === 0) {
          reference = node.childNodes[diff[options._const.to]];
        }
        node.insertBefore(childNode, reference || null);
      });
      break;
    case options._const.removeElement:
      node.parentNode.removeChild(node);
      break;
    case options._const.addElement: {
      var parentRoute = route.slice();
      var c = parentRoute.splice(parentRoute.length - 1, 1)[0];
      node = getFromRoute(tree, parentRoute);
      if (!checkElementType(node, options.simplifiedElementCheck, "Element")) {
        return false;
      }
      node.insertBefore(objToNode(diff[options._const.element], node.namespaceURI === "http://www.w3.org/2000/svg", options), node.childNodes[c] || null);
      break;
    }
    case options._const.removeTextElement: {
      if (!node || node.nodeType !== 3) {
        return false;
      }
      var parentNode = node.parentNode;
      parentNode.removeChild(node);
      if (checkElementType(parentNode, options.simplifiedElementCheck, "HTMLTextAreaElement")) {
        parentNode.value = "";
      }
      break;
    }
    case options._const.addTextElement: {
      var parentRoute = route.slice();
      var c = parentRoute.splice(parentRoute.length - 1, 1)[0];
      newNode = options.document.createTextNode(diff[options._const.value]);
      node = getFromRoute(tree, parentRoute);
      if (!node.childNodes) {
        return false;
      }
      node.insertBefore(newNode, node.childNodes[c] || null);
      if (checkElementType(node.parentNode, options.simplifiedElementCheck, "HTMLTextAreaElement")) {
        node.parentNode.value = diff[options._const.value];
      }
      break;
    }
    default:
      console.log("unknown action");
  }
  options.postDiffApply({
    diff: info.diff,
    node: info.node,
    newNode
  });
  return true;
}
function applyDOM(tree, diffs, options) {
  return diffs.every(function(diff) {
    return applyDiff(tree, diff, options);
  });
}
function swap(obj, p1, p2) {
  var tmp = obj[p1];
  obj[p1] = obj[p2];
  obj[p2] = tmp;
}
function undoDiff(tree, diff, options) {
  switch (diff[options._const.action]) {
    case options._const.addAttribute:
      diff[options._const.action] = options._const.removeAttribute;
      applyDiff(tree, diff, options);
      break;
    case options._const.modifyAttribute:
      swap(diff, options._const.oldValue, options._const.newValue);
      applyDiff(tree, diff, options);
      break;
    case options._const.removeAttribute:
      diff[options._const.action] = options._const.addAttribute;
      applyDiff(tree, diff, options);
      break;
    case options._const.modifyTextElement:
      swap(diff, options._const.oldValue, options._const.newValue);
      applyDiff(tree, diff, options);
      break;
    case options._const.modifyValue:
      swap(diff, options._const.oldValue, options._const.newValue);
      applyDiff(tree, diff, options);
      break;
    case options._const.modifyComment:
      swap(diff, options._const.oldValue, options._const.newValue);
      applyDiff(tree, diff, options);
      break;
    case options._const.modifyChecked:
      swap(diff, options._const.oldValue, options._const.newValue);
      applyDiff(tree, diff, options);
      break;
    case options._const.modifySelected:
      swap(diff, options._const.oldValue, options._const.newValue);
      applyDiff(tree, diff, options);
      break;
    case options._const.replaceElement:
      swap(diff, options._const.oldValue, options._const.newValue);
      applyDiff(tree, diff, options);
      break;
    case options._const.relocateGroup:
      swap(diff, options._const.from, options._const.to);
      applyDiff(tree, diff, options);
      break;
    case options._const.removeElement:
      diff[options._const.action] = options._const.addElement;
      applyDiff(tree, diff, options);
      break;
    case options._const.addElement:
      diff[options._const.action] = options._const.removeElement;
      applyDiff(tree, diff, options);
      break;
    case options._const.removeTextElement:
      diff[options._const.action] = options._const.addTextElement;
      applyDiff(tree, diff, options);
      break;
    case options._const.addTextElement:
      diff[options._const.action] = options._const.removeTextElement;
      applyDiff(tree, diff, options);
      break;
    default:
      console.log("unknown action");
  }
}
function undoDOM(tree, diffs, options) {
  diffs = diffs.slice();
  diffs.reverse();
  diffs.forEach(function(diff) {
    undoDiff(tree, diff, options);
  });
}
var elementDescriptors = function(el) {
  var output = [];
  output.push(el.nodeName);
  if (el.nodeName !== "#text" && el.nodeName !== "#comment") {
    el = el;
    if (el.attributes) {
      if (el.attributes["class"]) {
        output.push("".concat(el.nodeName, ".").concat(el.attributes["class"].replace(/ /g, ".")));
      }
      if (el.attributes.id) {
        output.push("".concat(el.nodeName, "#").concat(el.attributes.id));
      }
    }
  }
  return output;
};
var findUniqueDescriptors = function(li) {
  var uniqueDescriptors = {};
  var duplicateDescriptors = {};
  li.forEach(function(node) {
    elementDescriptors(node).forEach(function(descriptor) {
      var inUnique = descriptor in uniqueDescriptors;
      var inDupes = descriptor in duplicateDescriptors;
      if (!inUnique && !inDupes) {
        uniqueDescriptors[descriptor] = true;
      } else if (inUnique) {
        delete uniqueDescriptors[descriptor];
        duplicateDescriptors[descriptor] = true;
      }
    });
  });
  return uniqueDescriptors;
};
var uniqueInBoth = function(l1, l2) {
  var l1Unique = findUniqueDescriptors(l1);
  var l2Unique = findUniqueDescriptors(l2);
  var inBoth = {};
  Object.keys(l1Unique).forEach(function(key) {
    if (l2Unique[key]) {
      inBoth[key] = true;
    }
  });
  return inBoth;
};
var removeDone = function(tree) {
  delete tree.outerDone;
  delete tree.innerDone;
  delete tree.valueDone;
  if (tree.childNodes) {
    return tree.childNodes.every(removeDone);
  } else {
    return true;
  }
};
var cleanNode = function(diffNode) {
  if (Object.prototype.hasOwnProperty.call(diffNode, "data")) {
    var textNode = {
      nodeName: diffNode.nodeName === "#text" ? "#text" : "#comment",
      data: diffNode.data
    };
    return textNode;
  } else {
    var elementNode = {
      nodeName: diffNode.nodeName
    };
    diffNode = diffNode;
    if (Object.prototype.hasOwnProperty.call(diffNode, "attributes")) {
      elementNode.attributes = __assign({}, diffNode.attributes);
    }
    if (Object.prototype.hasOwnProperty.call(diffNode, "checked")) {
      elementNode.checked = diffNode.checked;
    }
    if (Object.prototype.hasOwnProperty.call(diffNode, "value")) {
      elementNode.value = diffNode.value;
    }
    if (Object.prototype.hasOwnProperty.call(diffNode, "selected")) {
      elementNode.selected = diffNode.selected;
    }
    if (Object.prototype.hasOwnProperty.call(diffNode, "childNodes")) {
      elementNode.childNodes = diffNode.childNodes.map(function(diffChildNode) {
        return cleanNode(diffChildNode);
      });
    }
    return elementNode;
  }
};
var isEqual = function(e1, e2) {
  if (!["nodeName", "value", "checked", "selected", "data"].every(function(element) {
    if (e1[element] !== e2[element]) {
      return false;
    }
    return true;
  })) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(e1, "data")) {
    return true;
  }
  e1 = e1;
  e2 = e2;
  if (Boolean(e1.attributes) !== Boolean(e2.attributes)) {
    return false;
  }
  if (Boolean(e1.childNodes) !== Boolean(e2.childNodes)) {
    return false;
  }
  if (e1.attributes) {
    var e1Attributes = Object.keys(e1.attributes);
    var e2Attributes = Object.keys(e2.attributes);
    if (e1Attributes.length !== e2Attributes.length) {
      return false;
    }
    if (!e1Attributes.every(function(attribute) {
      if (e1.attributes[attribute] !== e2.attributes[attribute]) {
        return false;
      }
      return true;
    })) {
      return false;
    }
  }
  if (e1.childNodes) {
    if (e1.childNodes.length !== e2.childNodes.length) {
      return false;
    }
    if (!e1.childNodes.every(function(childNode, index) {
      return isEqual(childNode, e2.childNodes[index]);
    })) {
      return false;
    }
  }
  return true;
};
var roughlyEqual = function(e1, e2, uniqueDescriptors, sameSiblings, preventRecursion) {
  if (preventRecursion === void 0) {
    preventRecursion = false;
  }
  if (!e1 || !e2) {
    return false;
  }
  if (e1.nodeName !== e2.nodeName) {
    return false;
  }
  if (["#text", "#comment"].includes(e1.nodeName)) {
    return preventRecursion ? true : e1.data === e2.data;
  }
  e1 = e1;
  e2 = e2;
  if (e1.nodeName in uniqueDescriptors) {
    return true;
  }
  if (e1.attributes && e2.attributes) {
    if (e1.attributes.id) {
      if (e1.attributes.id !== e2.attributes.id) {
        return false;
      } else {
        var idDescriptor = "".concat(e1.nodeName, "#").concat(e1.attributes.id);
        if (idDescriptor in uniqueDescriptors) {
          return true;
        }
      }
    }
    if (e1.attributes["class"] && e1.attributes["class"] === e2.attributes["class"]) {
      var classDescriptor = "".concat(e1.nodeName, ".").concat(e1.attributes["class"].replace(/ /g, "."));
      if (classDescriptor in uniqueDescriptors) {
        return true;
      }
    }
  }
  if (sameSiblings) {
    return true;
  }
  var nodeList1 = e1.childNodes ? e1.childNodes.slice().reverse() : [];
  var nodeList2 = e2.childNodes ? e2.childNodes.slice().reverse() : [];
  if (nodeList1.length !== nodeList2.length) {
    return false;
  }
  if (preventRecursion) {
    return nodeList1.every(function(element, index) {
      return element.nodeName === nodeList2[index].nodeName;
    });
  } else {
    var childUniqueDescriptors_1 = uniqueInBoth(nodeList1, nodeList2);
    return nodeList1.every(function(element, index) {
      return roughlyEqual(element, nodeList2[index], childUniqueDescriptors_1, true, true);
    });
  }
};
var findCommonSubsets = function(c1, c2, marked1, marked2) {
  var lcsSize = 0;
  var index = [];
  var c1Length = c1.length;
  var c2Length = c2.length;
  var matches = __spreadArray([], new Array(c1Length + 1), true).map(function() {
    return [];
  });
  var uniqueDescriptors = uniqueInBoth(c1, c2);
  var subsetsSame = c1Length === c2Length;
  if (subsetsSame) {
    c1.some(function(element, i) {
      var c1Desc = elementDescriptors(element);
      var c2Desc = elementDescriptors(c2[i]);
      if (c1Desc.length !== c2Desc.length) {
        subsetsSame = false;
        return true;
      }
      c1Desc.some(function(description, i2) {
        if (description !== c2Desc[i2]) {
          subsetsSame = false;
          return true;
        }
      });
      if (!subsetsSame) {
        return true;
      }
    });
  }
  for (var c1Index = 0; c1Index < c1Length; c1Index++) {
    var c1Element = c1[c1Index];
    for (var c2Index = 0; c2Index < c2Length; c2Index++) {
      var c2Element = c2[c2Index];
      if (!marked1[c1Index] && !marked2[c2Index] && roughlyEqual(c1Element, c2Element, uniqueDescriptors, subsetsSame)) {
        matches[c1Index + 1][c2Index + 1] = matches[c1Index][c2Index] ? matches[c1Index][c2Index] + 1 : 1;
        if (matches[c1Index + 1][c2Index + 1] >= lcsSize) {
          lcsSize = matches[c1Index + 1][c2Index + 1];
          index = [c1Index + 1, c2Index + 1];
        }
      } else {
        matches[c1Index + 1][c2Index + 1] = 0;
      }
    }
  }
  if (lcsSize === 0) {
    return false;
  }
  return {
    oldValue: index[0] - lcsSize,
    newValue: index[1] - lcsSize,
    length: lcsSize
  };
};
var makeBooleanArray = function(n, v) {
  return __spreadArray([], new Array(n), true).map(function() {
    return v;
  });
};
var getGapInformation = function(t1, t2, stable) {
  var gaps1 = t1.childNodes ? makeBooleanArray(t1.childNodes.length, true) : [];
  var gaps2 = t2.childNodes ? makeBooleanArray(t2.childNodes.length, true) : [];
  var group = 0;
  stable.forEach(function(subset) {
    var endOld = subset.oldValue + subset.length;
    var endNew = subset.newValue + subset.length;
    for (var j = subset.oldValue; j < endOld; j += 1) {
      gaps1[j] = group;
    }
    for (var j = subset.newValue; j < endNew; j += 1) {
      gaps2[j] = group;
    }
    group += 1;
  });
  return {
    gaps1,
    gaps2
  };
};
var markBoth = function(marked1, marked2, subset, i) {
  marked1[subset.oldValue + i] = true;
  marked2[subset.newValue + i] = true;
};
var markSubTrees = function(oldTree, newTree) {
  var oldChildren = oldTree.childNodes ? oldTree.childNodes : [];
  var newChildren = newTree.childNodes ? newTree.childNodes : [];
  var marked1 = makeBooleanArray(oldChildren.length, false);
  var marked2 = makeBooleanArray(newChildren.length, false);
  var subsets = [];
  var returnIndex = function() {
    return arguments[1];
  };
  var foundAllSubsets = false;
  var _loop_1 = function() {
    var subset = findCommonSubsets(oldChildren, newChildren, marked1, marked2);
    if (subset) {
      subsets.push(subset);
      var subsetArray = __spreadArray([], new Array(subset.length), true).map(returnIndex);
      subsetArray.forEach(function(item) {
        return markBoth(marked1, marked2, subset, item);
      });
    } else {
      foundAllSubsets = true;
    }
  };
  while (!foundAllSubsets) {
    _loop_1();
  }
  oldTree.subsets = subsets;
  oldTree.subsetsAge = 100;
  return subsets;
};
var DiffTracker = (
  /** @class */
  (function() {
    function DiffTracker2() {
      this.list = [];
    }
    DiffTracker2.prototype.add = function(diffs) {
      var _a;
      (_a = this.list).push.apply(_a, diffs);
    };
    DiffTracker2.prototype.forEach = function(fn) {
      this.list.forEach(function(li) {
        return fn(li);
      });
    };
    return DiffTracker2;
  })()
);
function getFromVirtualRoute(tree, route) {
  var node = tree;
  var parentNode;
  var nodeIndex;
  route = route.slice();
  while (route.length > 0) {
    nodeIndex = route.splice(0, 1)[0];
    parentNode = node;
    node = node.childNodes ? node.childNodes[nodeIndex] : void 0;
  }
  return {
    node,
    parentNode,
    nodeIndex
  };
}
function applyVirtualDiff(tree, diff, options) {
  var _a;
  var node, parentNode, nodeIndex;
  if (![options._const.addElement, options._const.addTextElement].includes(diff[options._const.action])) {
    var routeInfo = getFromVirtualRoute(tree, diff[options._const.route]);
    node = routeInfo.node;
    parentNode = routeInfo.parentNode;
    nodeIndex = routeInfo.nodeIndex;
  }
  var newSubsets = [];
  var info = {
    diff,
    node
  };
  if (options.preVirtualDiffApply(info)) {
    return true;
  }
  var newNode;
  var nodeArray;
  var route;
  switch (diff[options._const.action]) {
    case options._const.addAttribute:
      if (!node.attributes) {
        node.attributes = {};
      }
      node.attributes[diff[options._const.name]] = diff[options._const.value];
      if (diff[options._const.name] === "checked") {
        node.checked = true;
      } else if (diff[options._const.name] === "selected") {
        node.selected = true;
      } else if (node.nodeName === "INPUT" && diff[options._const.name] === "value") {
        node.value = diff[options._const.value];
      }
      break;
    case options._const.modifyAttribute:
      node.attributes[diff[options._const.name]] = diff[options._const.newValue];
      break;
    case options._const.removeAttribute:
      delete node.attributes[diff[options._const.name]];
      if (Object.keys(node.attributes).length === 0) {
        delete node.attributes;
      }
      if (diff[options._const.name] === "checked") {
        node.checked = false;
      } else if (diff[options._const.name] === "selected") {
        delete node.selected;
      } else if (node.nodeName === "INPUT" && diff[options._const.name] === "value") {
        delete node.value;
      }
      break;
    case options._const.modifyTextElement:
      node.data = diff[options._const.newValue];
      if (parentNode.nodeName === "TEXTAREA") {
        parentNode.value = diff[options._const.newValue];
      }
      break;
    case options._const.modifyValue:
      node.value = diff[options._const.newValue];
      break;
    case options._const.modifyComment:
      node.data = diff[options._const.newValue];
      break;
    case options._const.modifyChecked:
      node.checked = diff[options._const.newValue];
      break;
    case options._const.modifySelected:
      node.selected = diff[options._const.newValue];
      break;
    case options._const.replaceElement:
      newNode = cleanNode(diff[options._const.newValue]);
      parentNode.childNodes[nodeIndex] = newNode;
      break;
    case options._const.relocateGroup:
      nodeArray = node.childNodes.splice(diff[options._const.from], diff[options._const.groupLength]).reverse();
      nodeArray.forEach(function(movedNode) {
        return node.childNodes.splice(diff[options._const.to], 0, movedNode);
      });
      if (node.subsets) {
        node.subsets.forEach(function(map) {
          if (diff[options._const.from] < diff[options._const.to] && map.oldValue <= diff[options._const.to] && map.oldValue > diff[options._const.from]) {
            map.oldValue -= diff[options._const.groupLength];
            var splitLength = map.oldValue + map.length - diff[options._const.to];
            if (splitLength > 0) {
              newSubsets.push({
                oldValue: diff[options._const.to] + diff[options._const.groupLength],
                newValue: map.newValue + map.length - splitLength,
                length: splitLength
              });
              map.length -= splitLength;
            }
          } else if (diff[options._const.from] > diff[options._const.to] && map.oldValue > diff[options._const.to] && map.oldValue < diff[options._const.from]) {
            map.oldValue += diff[options._const.groupLength];
            var splitLength = map.oldValue + map.length - diff[options._const.to];
            if (splitLength > 0) {
              newSubsets.push({
                oldValue: diff[options._const.to] + diff[options._const.groupLength],
                newValue: map.newValue + map.length - splitLength,
                length: splitLength
              });
              map.length -= splitLength;
            }
          } else if (map.oldValue === diff[options._const.from]) {
            map.oldValue = diff[options._const.to];
          }
        });
      }
      break;
    case options._const.removeElement:
      parentNode.childNodes.splice(nodeIndex, 1);
      if (parentNode.subsets) {
        parentNode.subsets.forEach(function(map) {
          if (map.oldValue > nodeIndex) {
            map.oldValue -= 1;
          } else if (map.oldValue === nodeIndex) {
            map["delete"] = true;
          } else if (map.oldValue < nodeIndex && map.oldValue + map.length > nodeIndex) {
            if (map.oldValue + map.length - 1 === nodeIndex) {
              map.length--;
            } else {
              newSubsets.push({
                newValue: map.newValue + nodeIndex - map.oldValue,
                oldValue: nodeIndex,
                length: map.length - nodeIndex + map.oldValue - 1
              });
              map.length = nodeIndex - map.oldValue;
            }
          }
        });
      }
      node = parentNode;
      break;
    case options._const.addElement: {
      route = diff[options._const.route].slice();
      var c_1 = route.splice(route.length - 1, 1)[0];
      node = (_a = getFromVirtualRoute(tree, route)) === null || _a === void 0 ? void 0 : _a.node;
      newNode = cleanNode(diff[options._const.element]);
      if (!node.childNodes) {
        node.childNodes = [];
      }
      if (c_1 >= node.childNodes.length) {
        node.childNodes.push(newNode);
      } else {
        node.childNodes.splice(c_1, 0, newNode);
      }
      if (node.subsets) {
        node.subsets.forEach(function(map) {
          if (map.oldValue >= c_1) {
            map.oldValue += 1;
          } else if (map.oldValue < c_1 && map.oldValue + map.length > c_1) {
            var splitLength = map.oldValue + map.length - c_1;
            newSubsets.push({
              newValue: map.newValue + map.length - splitLength,
              oldValue: c_1 + 1,
              length: splitLength
            });
            map.length -= splitLength;
          }
        });
      }
      break;
    }
    case options._const.removeTextElement:
      parentNode.childNodes.splice(nodeIndex, 1);
      if (parentNode.nodeName === "TEXTAREA") {
        delete parentNode.value;
      }
      if (parentNode.subsets) {
        parentNode.subsets.forEach(function(map) {
          if (map.oldValue > nodeIndex) {
            map.oldValue -= 1;
          } else if (map.oldValue === nodeIndex) {
            map["delete"] = true;
          } else if (map.oldValue < nodeIndex && map.oldValue + map.length > nodeIndex) {
            if (map.oldValue + map.length - 1 === nodeIndex) {
              map.length--;
            } else {
              newSubsets.push({
                newValue: map.newValue + nodeIndex - map.oldValue,
                oldValue: nodeIndex,
                length: map.length - nodeIndex + map.oldValue - 1
              });
              map.length = nodeIndex - map.oldValue;
            }
          }
        });
      }
      node = parentNode;
      break;
    case options._const.addTextElement: {
      route = diff[options._const.route].slice();
      var c_2 = route.splice(route.length - 1, 1)[0];
      newNode = {
        nodeName: "#text",
        data: diff[options._const.value]
      };
      node = getFromVirtualRoute(tree, route).node;
      if (!node.childNodes) {
        node.childNodes = [];
      }
      if (c_2 >= node.childNodes.length) {
        node.childNodes.push(newNode);
      } else {
        node.childNodes.splice(c_2, 0, newNode);
      }
      if (node.nodeName === "TEXTAREA") {
        node.value = diff[options._const.newValue];
      }
      if (node.subsets) {
        node.subsets.forEach(function(map) {
          if (map.oldValue >= c_2) {
            map.oldValue += 1;
          }
          if (map.oldValue < c_2 && map.oldValue + map.length > c_2) {
            var splitLength = map.oldValue + map.length - c_2;
            newSubsets.push({
              newValue: map.newValue + map.length - splitLength,
              oldValue: c_2 + 1,
              length: splitLength
            });
            map.length -= splitLength;
          }
        });
      }
      break;
    }
    default:
      console.log("unknown action");
  }
  if (node.subsets) {
    node.subsets = node.subsets.filter(function(map) {
      return !map["delete"] && map.oldValue !== map.newValue;
    });
    if (newSubsets.length) {
      node.subsets = node.subsets.concat(newSubsets);
    }
  }
  options.postVirtualDiffApply({
    node: info.node,
    diff: info.diff,
    newNode
  });
  return;
}
function applyVirtual(tree, diffs, options) {
  diffs.forEach(function(diff) {
    applyVirtualDiff(tree, diff, options);
  });
  return true;
}
function nodeToObj(aNode, options) {
  if (options === void 0) {
    options = {
      valueDiffing: true,
      simplifiedElementCheck: true
    };
  }
  var objNode = {
    nodeName: aNode.nodeName
  };
  if (checkElementType(aNode, options.simplifiedElementCheck, "Text", "Comment")) {
    objNode.data = aNode.data;
  } else {
    if (aNode.attributes && aNode.attributes.length > 0) {
      objNode.attributes = {};
      var nodeArray = Array.prototype.slice.call(aNode.attributes);
      nodeArray.forEach(function(attribute) {
        return objNode.attributes[attribute.name] = attribute.value;
      });
    }
    if (aNode.childNodes && aNode.childNodes.length > 0) {
      objNode.childNodes = [];
      var nodeArray = Array.prototype.slice.call(aNode.childNodes);
      nodeArray.forEach(function(childNode) {
        return objNode.childNodes.push(nodeToObj(childNode, options));
      });
    }
    if (options.valueDiffing) {
      if (checkElementType(aNode, options.simplifiedElementCheck, "HTMLTextAreaElement")) {
        objNode.value = aNode.value;
      }
      if (checkElementType(aNode, options.simplifiedElementCheck, "HTMLInputElement") && ["radio", "checkbox"].includes(aNode.type.toLowerCase()) && aNode.checked !== void 0) {
        objNode.checked = aNode.checked;
      } else if (checkElementType(aNode, options.simplifiedElementCheck, "HTMLButtonElement", "HTMLDataElement", "HTMLInputElement", "HTMLLIElement", "HTMLMeterElement", "HTMLOptionElement", "HTMLProgressElement", "HTMLParamElement")) {
        objNode.value = aNode.value;
      }
      if (checkElementType(aNode, options.simplifiedElementCheck, "HTMLOptionElement")) {
        objNode.selected = aNode.selected;
      }
    }
  }
  return objNode;
}
var tagRE = /<\s*\/*[a-zA-Z:_][a-zA-Z0-9:_\-.]*\s*(?:"[^"]*"['"]*|'[^']*'['"]*|[^'"/>])*\/*\s*>|<!--(?:.|\n|\r)*?-->/g;
var attrRE = /\s([^'"/\s><]+?)[\s/>]|([^\s=]+)=\s?("[^"]*"|'[^']*')/g;
function unescape(string) {
  return string.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
var lookup = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  keygen: true,
  link: true,
  menuItem: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true
};
var parseTag = function(tag, caseSensitive) {
  var res = {
    nodeName: "",
    attributes: {}
  };
  var voidElement = false;
  var type = "tag";
  var tagMatch = tag.match(/<\/?([^\s]+?)[/\s>]/);
  if (tagMatch) {
    res.nodeName = caseSensitive || tagMatch[1] === "svg" ? tagMatch[1] : tagMatch[1].toUpperCase();
    if (lookup[tagMatch[1]] || tag.charAt(tag.length - 2) === "/") {
      voidElement = true;
    }
    if (res.nodeName.startsWith("!--")) {
      var endIndex = tag.indexOf("-->");
      return {
        type: "comment",
        node: {
          nodeName: "#comment",
          data: endIndex !== -1 ? tag.slice(4, endIndex) : ""
        },
        voidElement
      };
    }
  }
  var reg = new RegExp(attrRE);
  var result = null;
  var done = false;
  while (!done) {
    result = reg.exec(tag);
    if (result === null) {
      done = true;
    } else if (result[0].trim()) {
      if (result[1]) {
        var attr = result[1].trim();
        var arr = [attr, ""];
        if (attr.indexOf("=") > -1) {
          arr = attr.split("=");
        }
        res.attributes[arr[0]] = arr[1];
        reg.lastIndex--;
      } else if (result[2]) {
        res.attributes[result[2]] = result[3].trim().substring(1, result[3].length - 1);
      }
    }
  }
  return {
    type,
    node: res,
    voidElement
  };
};
var stringToObj = function(html, options) {
  if (options === void 0) {
    options = {
      valueDiffing: true,
      caseSensitive: false
    };
  }
  var result = [];
  var current;
  var level = -1;
  var arr = [];
  var inComponent = false, insideSvg = false;
  if (html.indexOf("<") !== 0) {
    var end = html.indexOf("<");
    result.push({
      nodeName: "#text",
      data: end === -1 ? html : html.substring(0, end)
    });
  }
  html.replace(tagRE, function(tag, index) {
    var isOpen = tag.charAt(1) !== "/";
    var isComment = tag.startsWith("<!--");
    var start = index + tag.length;
    var nextChar = html.charAt(start);
    if (isComment) {
      var comment = parseTag(tag, options.caseSensitive).node;
      if (level < 0) {
        result.push(comment);
        return "";
      }
      var parent_1 = arr[level];
      if (parent_1 && comment.nodeName) {
        if (!parent_1.node.childNodes) {
          parent_1.node.childNodes = [];
        }
        parent_1.node.childNodes.push(comment);
      }
      return "";
    }
    if (isOpen) {
      current = parseTag(tag, options.caseSensitive || insideSvg);
      if (current.node.nodeName === "svg") {
        insideSvg = true;
      }
      level++;
      if (!current.voidElement && !inComponent && nextChar && nextChar !== "<") {
        if (!current.node.childNodes) {
          current.node.childNodes = [];
        }
        var data = unescape(html.slice(start, html.indexOf("<", start)));
        current.node.childNodes.push({
          nodeName: "#text",
          data
        });
        if (options.valueDiffing && current.node.nodeName === "TEXTAREA") {
          current.node.value = data;
        }
      }
      if (level === 0 && current.node.nodeName) {
        result.push(current.node);
      }
      var parent_2 = arr[level - 1];
      if (parent_2 && current.node.nodeName) {
        if (!parent_2.node.childNodes) {
          parent_2.node.childNodes = [];
        }
        parent_2.node.childNodes.push(current.node);
      }
      arr[level] = current;
    }
    if (!isOpen || current.voidElement) {
      if (level > -1 && (current.voidElement || options.caseSensitive && current.node.nodeName === tag.slice(2, -1) || !options.caseSensitive && current.node.nodeName.toUpperCase() === tag.slice(2, -1).toUpperCase())) {
        level--;
        if (level > -1) {
          if (current.node.nodeName === "svg") {
            insideSvg = false;
          }
          current = arr[level];
        }
      }
      if (nextChar !== "<" && nextChar) {
        var childNodes = level === -1 ? result : arr[level].node.childNodes || [];
        var end2 = html.indexOf("<", start);
        var data = unescape(html.slice(start, end2 === -1 ? void 0 : end2));
        childNodes.push({
          nodeName: "#text",
          data
        });
      }
    }
    return "";
  });
  return result[0];
};
var DiffFinder = (
  /** @class */
  (function() {
    function DiffFinder2(t1Node, t2Node, options) {
      this.options = options;
      this.t1 = typeof Element !== "undefined" && checkElementType(t1Node, this.options.simplifiedElementCheck, "Element") ? nodeToObj(t1Node, this.options) : typeof t1Node === "string" ? stringToObj(t1Node, this.options) : JSON.parse(JSON.stringify(t1Node));
      this.t2 = typeof Element !== "undefined" && checkElementType(t2Node, this.options.simplifiedElementCheck, "Element") ? nodeToObj(t2Node, this.options) : typeof t2Node === "string" ? stringToObj(t2Node, this.options) : JSON.parse(JSON.stringify(t2Node));
      this.diffcount = 0;
      this.foundAll = false;
      if (this.debug) {
        this.t1Orig = typeof Element !== "undefined" && checkElementType(t1Node, this.options.simplifiedElementCheck, "Element") ? nodeToObj(t1Node, this.options) : typeof t1Node === "string" ? stringToObj(t1Node, this.options) : JSON.parse(JSON.stringify(t1Node));
        this.t2Orig = typeof Element !== "undefined" && checkElementType(t2Node, this.options.simplifiedElementCheck, "Element") ? nodeToObj(t2Node, this.options) : typeof t2Node === "string" ? stringToObj(t2Node, this.options) : JSON.parse(JSON.stringify(t2Node));
      }
      this.tracker = new DiffTracker();
    }
    DiffFinder2.prototype.init = function() {
      return this.findDiffs(this.t1, this.t2);
    };
    DiffFinder2.prototype.findDiffs = function(t1, t2) {
      var diffs;
      do {
        if (this.options.debug) {
          this.diffcount += 1;
          if (this.diffcount > this.options.diffcap) {
            throw new Error("surpassed diffcap:".concat(JSON.stringify(this.t1Orig), " -> ").concat(JSON.stringify(this.t2Orig)));
          }
        }
        diffs = this.findNextDiff(t1, t2, []);
        if (diffs.length === 0) {
          if (!isEqual(t1, t2)) {
            if (this.foundAll) {
              console.error("Could not find remaining diffs!");
            } else {
              this.foundAll = true;
              removeDone(t1);
              diffs = this.findNextDiff(t1, t2, []);
            }
          }
        }
        if (diffs.length > 0) {
          this.foundAll = false;
          this.tracker.add(diffs);
          applyVirtual(t1, diffs, this.options);
        }
      } while (diffs.length > 0);
      return this.tracker.list;
    };
    DiffFinder2.prototype.findNextDiff = function(t1, t2, route) {
      var diffs;
      var fdiffs;
      if (this.options.maxDepth && route.length > this.options.maxDepth) {
        return [];
      }
      if (!t1.outerDone) {
        diffs = this.findOuterDiff(t1, t2, route);
        if (this.options.filterOuterDiff) {
          fdiffs = this.options.filterOuterDiff(t1, t2, diffs);
          if (fdiffs) {
            diffs = fdiffs;
          }
        }
        if (diffs.length > 0) {
          t1.outerDone = true;
          return diffs;
        } else {
          t1.outerDone = true;
        }
      }
      if (Object.prototype.hasOwnProperty.call(t1, "data")) {
        return [];
      }
      t1 = t1;
      t2 = t2;
      if (!t1.innerDone) {
        diffs = this.findInnerDiff(t1, t2, route);
        if (diffs.length > 0) {
          return diffs;
        } else {
          t1.innerDone = true;
        }
      }
      if (this.options.valueDiffing && !t1.valueDone) {
        diffs = this.findValueDiff(t1, t2, route);
        if (diffs.length > 0) {
          t1.valueDone = true;
          return diffs;
        } else {
          t1.valueDone = true;
        }
      }
      return [];
    };
    DiffFinder2.prototype.findOuterDiff = function(t1, t2, route) {
      var diffs = [];
      var attr;
      var attr1;
      var attr2;
      var attrLength;
      var pos;
      var i;
      if (t1.nodeName !== t2.nodeName) {
        if (!route.length) {
          throw new Error("Top level nodes have to be of the same kind.");
        }
        return [
          new Diff().setValue(this.options._const.action, this.options._const.replaceElement).setValue(this.options._const.oldValue, cleanNode(t1)).setValue(this.options._const.newValue, cleanNode(t2)).setValue(this.options._const.route, route)
        ];
      }
      if (route.length && this.options.diffcap < Math.abs((t1.childNodes || []).length - (t2.childNodes || []).length)) {
        return [
          new Diff().setValue(this.options._const.action, this.options._const.replaceElement).setValue(this.options._const.oldValue, cleanNode(t1)).setValue(this.options._const.newValue, cleanNode(t2)).setValue(this.options._const.route, route)
        ];
      }
      if (Object.prototype.hasOwnProperty.call(t1, "data") && t1.data !== t2.data) {
        if (t1.nodeName === "#text") {
          return [
            new Diff().setValue(this.options._const.action, this.options._const.modifyTextElement).setValue(this.options._const.route, route).setValue(this.options._const.oldValue, t1.data).setValue(this.options._const.newValue, t2.data)
          ];
        } else {
          return [
            new Diff().setValue(this.options._const.action, this.options._const.modifyComment).setValue(this.options._const.route, route).setValue(this.options._const.oldValue, t1.data).setValue(this.options._const.newValue, t2.data)
          ];
        }
      }
      t1 = t1;
      t2 = t2;
      attr1 = t1.attributes ? Object.keys(t1.attributes).sort() : [];
      attr2 = t2.attributes ? Object.keys(t2.attributes).sort() : [];
      attrLength = attr1.length;
      for (i = 0; i < attrLength; i++) {
        attr = attr1[i];
        pos = attr2.indexOf(attr);
        if (pos === -1) {
          diffs.push(new Diff().setValue(this.options._const.action, this.options._const.removeAttribute).setValue(this.options._const.route, route).setValue(this.options._const.name, attr).setValue(this.options._const.value, t1.attributes[attr]));
        } else {
          attr2.splice(pos, 1);
          if (t1.attributes[attr] !== t2.attributes[attr]) {
            diffs.push(new Diff().setValue(this.options._const.action, this.options._const.modifyAttribute).setValue(this.options._const.route, route).setValue(this.options._const.name, attr).setValue(this.options._const.oldValue, t1.attributes[attr]).setValue(this.options._const.newValue, t2.attributes[attr]));
          }
        }
      }
      attrLength = attr2.length;
      for (i = 0; i < attrLength; i++) {
        attr = attr2[i];
        diffs.push(new Diff().setValue(this.options._const.action, this.options._const.addAttribute).setValue(this.options._const.route, route).setValue(this.options._const.name, attr).setValue(this.options._const.value, t2.attributes[attr]));
      }
      return diffs;
    };
    DiffFinder2.prototype.findInnerDiff = function(t1, t2, route) {
      var t1ChildNodes = t1.childNodes ? t1.childNodes.slice() : [];
      var t2ChildNodes = t2.childNodes ? t2.childNodes.slice() : [];
      var last = Math.max(t1ChildNodes.length, t2ChildNodes.length);
      var childNodesLengthDifference = Math.abs(t1ChildNodes.length - t2ChildNodes.length);
      var diffs = [];
      var index = 0;
      if (!this.options.maxChildCount || last < this.options.maxChildCount) {
        var cachedSubtrees = Boolean(t1.subsets && t1.subsetsAge--);
        var subtrees = cachedSubtrees ? t1.subsets : t1.childNodes && t2.childNodes ? markSubTrees(t1, t2) : [];
        if (subtrees.length > 0) {
          diffs = this.attemptGroupRelocation(t1, t2, subtrees, route, cachedSubtrees);
          if (diffs.length > 0) {
            return diffs;
          }
        }
      }
      for (var i = 0; i < last; i += 1) {
        var e1 = t1ChildNodes[i];
        var e2 = t2ChildNodes[i];
        if (childNodesLengthDifference) {
          if (e1 && !e2) {
            if (e1.nodeName === "#text") {
              diffs.push(new Diff().setValue(this.options._const.action, this.options._const.removeTextElement).setValue(this.options._const.route, route.concat(index)).setValue(this.options._const.value, e1.data));
              index -= 1;
            } else {
              diffs.push(new Diff().setValue(this.options._const.action, this.options._const.removeElement).setValue(this.options._const.route, route.concat(index)).setValue(this.options._const.element, cleanNode(e1)));
              index -= 1;
            }
          } else if (e2 && !e1) {
            if (e2.nodeName === "#text") {
              diffs.push(new Diff().setValue(this.options._const.action, this.options._const.addTextElement).setValue(this.options._const.route, route.concat(index)).setValue(this.options._const.value, e2.data));
            } else {
              diffs.push(new Diff().setValue(this.options._const.action, this.options._const.addElement).setValue(this.options._const.route, route.concat(index)).setValue(this.options._const.element, cleanNode(e2)));
            }
          }
        }
        if (e1 && e2) {
          if (!this.options.maxChildCount || last < this.options.maxChildCount) {
            diffs = diffs.concat(this.findNextDiff(e1, e2, route.concat(index)));
          } else if (!isEqual(e1, e2)) {
            if (t1ChildNodes.length > t2ChildNodes.length) {
              if (e1.nodeName === "#text") {
                diffs.push(new Diff().setValue(this.options._const.action, this.options._const.removeTextElement).setValue(this.options._const.route, route.concat(index)).setValue(this.options._const.value, e1.data));
              } else {
                diffs.push(new Diff().setValue(this.options._const.action, this.options._const.removeElement).setValue(this.options._const.element, cleanNode(e1)).setValue(this.options._const.route, route.concat(index)));
              }
              t1ChildNodes.splice(i, 1);
              i -= 1;
              index -= 1;
              childNodesLengthDifference -= 1;
            } else if (t1ChildNodes.length < t2ChildNodes.length) {
              diffs = diffs.concat([
                new Diff().setValue(this.options._const.action, this.options._const.addElement).setValue(this.options._const.element, cleanNode(e2)).setValue(this.options._const.route, route.concat(index))
              ]);
              t1ChildNodes.splice(i, 0, cleanNode(e2));
              childNodesLengthDifference -= 1;
            } else {
              diffs = diffs.concat([
                new Diff().setValue(this.options._const.action, this.options._const.replaceElement).setValue(this.options._const.oldValue, cleanNode(e1)).setValue(this.options._const.newValue, cleanNode(e2)).setValue(this.options._const.route, route.concat(index))
              ]);
            }
          }
        }
        index += 1;
      }
      t1.innerDone = true;
      return diffs;
    };
    DiffFinder2.prototype.attemptGroupRelocation = function(t1, t2, subtrees, route, cachedSubtrees) {
      var gapInformation = getGapInformation(t1, t2, subtrees);
      var gaps1 = gapInformation.gaps1;
      var gaps2 = gapInformation.gaps2;
      var t1ChildNodes = t1.childNodes.slice();
      var t2ChildNodes = t2.childNodes.slice();
      var shortest = Math.min(gaps1.length, gaps2.length);
      var destinationDifferent;
      var toGroup;
      var group;
      var node;
      var similarNode;
      var diffs = [];
      for (var index2 = 0, index1 = 0; index2 < shortest; index1 += 1, index2 += 1) {
        if (cachedSubtrees && (gaps1[index2] === true || gaps2[index2] === true)) ;
        else if (gaps1[index1] === true) {
          node = t1ChildNodes[index1];
          if (node.nodeName === "#text") {
            if (t2ChildNodes[index2].nodeName === "#text") {
              if (node.data !== t2ChildNodes[index2].data) {
                var testI = index1;
                while (t1ChildNodes.length > testI + 1 && t1ChildNodes[testI + 1].nodeName === "#text") {
                  testI += 1;
                  if (t2ChildNodes[index2].data === t1ChildNodes[testI].data) {
                    similarNode = true;
                    break;
                  }
                }
                if (!similarNode) {
                  diffs.push(new Diff().setValue(this.options._const.action, this.options._const.modifyTextElement).setValue(this.options._const.route, route.concat(index1)).setValue(this.options._const.oldValue, node.data).setValue(this.options._const.newValue, t2ChildNodes[index2].data));
                }
              }
            } else {
              diffs.push(new Diff().setValue(this.options._const.action, this.options._const.removeTextElement).setValue(this.options._const.route, route.concat(index1)).setValue(this.options._const.value, node.data));
              gaps1.splice(index1, 1);
              t1ChildNodes.splice(index1, 1);
              shortest = Math.min(gaps1.length, gaps2.length);
              index1 -= 1;
              index2 -= 1;
            }
          } else if (gaps2[index2] === true) {
            diffs.push(new Diff().setValue(this.options._const.action, this.options._const.replaceElement).setValue(this.options._const.oldValue, cleanNode(node)).setValue(this.options._const.newValue, cleanNode(t2ChildNodes[index2])).setValue(this.options._const.route, route.concat(index1)));
          } else {
            diffs.push(new Diff().setValue(this.options._const.action, this.options._const.removeElement).setValue(this.options._const.route, route.concat(index1)).setValue(this.options._const.element, cleanNode(node)));
            gaps1.splice(index1, 1);
            t1ChildNodes.splice(index1, 1);
            shortest = Math.min(gaps1.length, gaps2.length);
            index1 -= 1;
            index2 -= 1;
          }
        } else if (gaps2[index2] === true) {
          node = t2ChildNodes[index2];
          if (node.nodeName === "#text") {
            diffs.push(new Diff().setValue(this.options._const.action, this.options._const.addTextElement).setValue(this.options._const.route, route.concat(index1)).setValue(this.options._const.value, node.data));
            gaps1.splice(index1, 0, true);
            t1ChildNodes.splice(index1, 0, {
              nodeName: "#text",
              data: node.data
            });
            shortest = Math.min(gaps1.length, gaps2.length);
          } else {
            diffs.push(new Diff().setValue(this.options._const.action, this.options._const.addElement).setValue(this.options._const.route, route.concat(index1)).setValue(this.options._const.element, cleanNode(node)));
            gaps1.splice(index1, 0, true);
            t1ChildNodes.splice(index1, 0, cleanNode(node));
            shortest = Math.min(gaps1.length, gaps2.length);
          }
        } else if (gaps1[index1] !== gaps2[index2]) {
          if (diffs.length > 0) {
            return diffs;
          }
          group = subtrees[gaps1[index1]];
          toGroup = Math.min(group.newValue, t1ChildNodes.length - group.length);
          if (toGroup !== group.oldValue && toGroup > -1) {
            destinationDifferent = false;
            for (var j = 0; j < group.length; j += 1) {
              if (!roughlyEqual(t1ChildNodes[toGroup + j], t1ChildNodes[group.oldValue + j], {}, false, true)) {
                destinationDifferent = true;
              }
            }
            if (destinationDifferent) {
              return [
                new Diff().setValue(this.options._const.action, this.options._const.relocateGroup).setValue(this.options._const.groupLength, group.length).setValue(this.options._const.from, group.oldValue).setValue(this.options._const.to, toGroup).setValue(this.options._const.route, route)
              ];
            }
          }
        }
      }
      return diffs;
    };
    DiffFinder2.prototype.findValueDiff = function(t1, t2, route) {
      var diffs = [];
      if (t1.selected !== t2.selected) {
        diffs.push(new Diff().setValue(this.options._const.action, this.options._const.modifySelected).setValue(this.options._const.oldValue, t1.selected).setValue(this.options._const.newValue, t2.selected).setValue(this.options._const.route, route));
      }
      if ((t1.value || t2.value) && t1.value !== t2.value && t1.nodeName !== "OPTION") {
        diffs.push(new Diff().setValue(this.options._const.action, this.options._const.modifyValue).setValue(this.options._const.oldValue, t1.value || "").setValue(this.options._const.newValue, t2.value || "").setValue(this.options._const.route, route));
      }
      if (t1.checked !== t2.checked) {
        diffs.push(new Diff().setValue(this.options._const.action, this.options._const.modifyChecked).setValue(this.options._const.oldValue, t1.checked).setValue(this.options._const.newValue, t2.checked).setValue(this.options._const.route, route));
      }
      return diffs;
    };
    return DiffFinder2;
  })()
);
var DEFAULT_OPTIONS = {
  debug: false,
  diffcap: 10,
  maxDepth: false,
  maxChildCount: 50,
  valueDiffing: true,
  simplifiedElementCheck: false,
  // syntax: textDiff: function (node, currentValue, expectedValue, newValue)
  textDiff: function(node, currentValue, expectedValue, newValue) {
    node.data = newValue;
    return;
  },
  // empty functions were benchmarked as running faster than both
  // `f && f()` and `if (f) { f(); }`
  preVirtualDiffApply: function() {
  },
  postVirtualDiffApply: function() {
  },
  preDiffApply: function() {
  },
  postDiffApply: function() {
  },
  filterOuterDiff: null,
  compress: false,
  _const: false,
  document: typeof window !== "undefined" && window.document ? window.document : false,
  components: []
};
var DiffDOM = (
  /** @class */
  (function() {
    function DiffDOM2(options) {
      if (options === void 0) {
        options = {};
      }
      Object.entries(DEFAULT_OPTIONS).forEach(function(_a) {
        var key = _a[0], value = _a[1];
        if (!Object.prototype.hasOwnProperty.call(options, key)) {
          options[key] = value;
        }
      });
      if (!options._const) {
        var varNames = [
          "addAttribute",
          "modifyAttribute",
          "removeAttribute",
          "modifyTextElement",
          "relocateGroup",
          "removeElement",
          "addElement",
          "removeTextElement",
          "addTextElement",
          "replaceElement",
          "modifyValue",
          "modifyChecked",
          "modifySelected",
          "modifyComment",
          "action",
          "route",
          "oldValue",
          "newValue",
          "element",
          "group",
          "groupLength",
          "from",
          "to",
          "name",
          "value",
          "data",
          "attributes",
          "nodeName",
          "childNodes",
          "checked",
          "selected"
        ];
        var constNames_1 = {};
        if (options.compress) {
          varNames.forEach(function(varName, index) {
            return constNames_1[varName] = index;
          });
        } else {
          varNames.forEach(function(varName) {
            return constNames_1[varName] = varName;
          });
        }
        options._const = constNames_1;
      }
      this.options = options;
    }
    DiffDOM2.prototype.apply = function(tree, diffs) {
      return applyDOM(tree, diffs, this.options);
    };
    DiffDOM2.prototype.undo = function(tree, diffs) {
      return undoDOM(tree, diffs, this.options);
    };
    DiffDOM2.prototype.diff = function(t1Node, t2Node) {
      var finder = new DiffFinder(t1Node, t2Node, this.options);
      return finder.init();
    };
    return DiffDOM2;
  })()
);
var TraceLogger = (
  /** @class */
  (function() {
    function TraceLogger2(obj) {
      if (obj === void 0) {
        obj = {};
      }
      var _this = this;
      this.pad = "\u2502   ";
      this.padding = "";
      this.tick = 1;
      this.messages = [];
      var wrapkey = function(obj2, key2) {
        var oldfn = obj2[key2];
        obj2[key2] = function() {
          var arguments$1 = arguments;
          var args = [];
          for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments$1[_i];
          }
          _this.fin(key2, Array.prototype.slice.call(args));
          var result = oldfn.apply(obj2, args);
          _this.fout(key2, result);
          return result;
        };
      };
      for (var key in obj) {
        if (typeof obj[key] === "function") {
          wrapkey(obj, key);
        }
      }
      this.log("\u250C TRACELOG START");
    }
    TraceLogger2.prototype.fin = function(fn, args) {
      this.padding += this.pad;
      this.log("\u251C\u2500> entering ".concat(fn), args);
    };
    TraceLogger2.prototype.fout = function(fn, result) {
      this.log("\u2502<\u2500\u2500\u2518 generated return value", result);
      this.padding = this.padding.substring(0, this.padding.length - this.pad.length);
    };
    TraceLogger2.prototype.format = function(s, tick) {
      var nf = function(t) {
        var tStr = "".concat(t);
        while (tStr.length < 4) {
          tStr = "0".concat(t);
        }
        return tStr;
      };
      return "".concat(nf(tick), "> ").concat(this.padding).concat(s);
    };
    TraceLogger2.prototype.log = function() {
      var arguments$1 = arguments;
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments$1[_i];
      }
      var stringCollapse = function(v) {
        if (!v) {
          return "<falsey>";
        }
        if (typeof v === "string") {
          return v;
        }
        if (checkElementType(v, true, "HTMLElement")) {
          return v.outerHTML || "<empty>";
        }
        if (v instanceof Array) {
          return "[".concat(v.map(stringCollapse).join(","), "]");
        }
        return v.toString() || v.valueOf() || "<unknown>";
      };
      var s = args.map(stringCollapse).join(", ");
      this.messages.push(this.format(s, this.tick++));
    };
    TraceLogger2.prototype.toString = function() {
      var cap = "\xD7   ";
      var terminator = "\u2514\u2500\u2500\u2500";
      while (terminator.length <= this.padding.length + this.pad.length) {
        terminator += cap;
      }
      var _ = this.padding;
      this.padding = "";
      terminator = this.format(terminator, this.tick);
      this.padding = _;
      return "".concat(this.messages.join("\n"), "\n").concat(terminator);
    };
    return TraceLogger2;
  })()
);



/***/ },

/***/ "../../node_modules/markdown-it/index.mjs"
/*!************************************************!*\
  !*** ../../node_modules/markdown-it/index.mjs ***!
  \************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* reexport safe */ _lib_index_mjs__WEBPACK_IMPORTED_MODULE_0__["default"])
/* harmony export */ });
/* harmony import */ var _lib_index_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./lib/index.mjs */ "../../node_modules/markdown-it/lib/index.mjs");



/***/ },

/***/ "../../node_modules/markdown-it/lib/common/html_blocks.mjs"
/*!*****************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/common/html_blocks.mjs ***!
  \*****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ([
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "search",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul"
]);


/***/ },

/***/ "../../node_modules/markdown-it/lib/common/html_re.mjs"
/*!*************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/common/html_re.mjs ***!
  \*************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   HTML_OPEN_CLOSE_TAG_RE: () => (/* binding */ HTML_OPEN_CLOSE_TAG_RE),
/* harmony export */   HTML_TAG_RE: () => (/* binding */ HTML_TAG_RE)
/* harmony export */ });
const attr_name = "[a-zA-Z_:][a-zA-Z0-9:._-]*";
const unquoted = "[^\"'=<>`\\x00-\\x20]+";
const single_quoted = "'[^']*'";
const double_quoted = '"[^"]*"';
const attr_value = "(?:" + unquoted + "|" + single_quoted + "|" + double_quoted + ")";
const attribute = "(?:\\s+" + attr_name + "(?:\\s*=\\s*" + attr_value + ")?)";
const open_tag = "<[A-Za-z][A-Za-z0-9\\-]*" + attribute + "*\\s*\\/?>";
const close_tag = "<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>";
const comment = "<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->";
const processing = "<[?][\\s\\S]*?[?]>";
const declaration = "<![A-Za-z][^>]*>";
const cdata = "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>";
const HTML_TAG_RE = new RegExp("^(?:" + open_tag + "|" + close_tag + "|" + comment + "|" + processing + "|" + declaration + "|" + cdata + ")");
const HTML_OPEN_CLOSE_TAG_RE = new RegExp("^(?:" + open_tag + "|" + close_tag + ")");



/***/ },

/***/ "../../node_modules/markdown-it/lib/common/utils.mjs"
/*!***********************************************************!*\
  !*** ../../node_modules/markdown-it/lib/common/utils.mjs ***!
  \***********************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   arrayReplaceAt: () => (/* binding */ arrayReplaceAt),
/* harmony export */   assign: () => (/* binding */ assign),
/* harmony export */   escapeHtml: () => (/* binding */ escapeHtml),
/* harmony export */   escapeRE: () => (/* binding */ escapeRE),
/* harmony export */   fromCodePoint: () => (/* binding */ fromCodePoint),
/* harmony export */   has: () => (/* binding */ has),
/* harmony export */   isMdAsciiPunct: () => (/* binding */ isMdAsciiPunct),
/* harmony export */   isPunctChar: () => (/* binding */ isPunctChar),
/* harmony export */   isSpace: () => (/* binding */ isSpace),
/* harmony export */   isString: () => (/* binding */ isString),
/* harmony export */   isValidEntityCode: () => (/* binding */ isValidEntityCode),
/* harmony export */   isWhiteSpace: () => (/* binding */ isWhiteSpace),
/* harmony export */   lib: () => (/* binding */ lib),
/* harmony export */   normalizeReference: () => (/* binding */ normalizeReference),
/* harmony export */   unescapeAll: () => (/* binding */ unescapeAll),
/* harmony export */   unescapeMd: () => (/* binding */ unescapeMd)
/* harmony export */ });
/* harmony import */ var mdurl__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! mdurl */ "../../node_modules/mdurl/index.mjs");
/* harmony import */ var uc_micro__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! uc.micro */ "../../node_modules/uc.micro/index.mjs");
/* harmony import */ var entities__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! entities */ "../../node_modules/entities/lib/esm/index.js");



function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function isString(obj) {
  return _class(obj) === "[object String]";
}
const _hasOwnProperty = Object.prototype.hasOwnProperty;
function has(object, key) {
  return _hasOwnProperty.call(object, key);
}
function assign(obj) {
  const sources = Array.prototype.slice.call(arguments, 1);
  sources.forEach(function(source) {
    if (!source) {
      return;
    }
    if (typeof source !== "object") {
      throw new TypeError(source + "must be object");
    }
    Object.keys(source).forEach(function(key) {
      obj[key] = source[key];
    });
  });
  return obj;
}
function arrayReplaceAt(src, pos, newElements) {
  return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
}
function isValidEntityCode(c) {
  if (c >= 55296 && c <= 57343) {
    return false;
  }
  if (c >= 64976 && c <= 65007) {
    return false;
  }
  if ((c & 65535) === 65535 || (c & 65535) === 65534) {
    return false;
  }
  if (c >= 0 && c <= 8) {
    return false;
  }
  if (c === 11) {
    return false;
  }
  if (c >= 14 && c <= 31) {
    return false;
  }
  if (c >= 127 && c <= 159) {
    return false;
  }
  if (c > 1114111) {
    return false;
  }
  return true;
}
function fromCodePoint(c) {
  if (c > 65535) {
    c -= 65536;
    const surrogate1 = 55296 + (c >> 10);
    const surrogate2 = 56320 + (c & 1023);
    return String.fromCharCode(surrogate1, surrogate2);
  }
  return String.fromCharCode(c);
}
const UNESCAPE_MD_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
const ENTITY_RE = /&([a-z#][a-z0-9]{1,31});/gi;
const UNESCAPE_ALL_RE = new RegExp(UNESCAPE_MD_RE.source + "|" + ENTITY_RE.source, "gi");
const DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i;
function replaceEntityPattern(match, name) {
  if (name.charCodeAt(0) === 35 && DIGITAL_ENTITY_TEST_RE.test(name)) {
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    if (isValidEntityCode(code)) {
      return fromCodePoint(code);
    }
    return match;
  }
  const decoded = (0,entities__WEBPACK_IMPORTED_MODULE_2__.decodeHTML)(match);
  if (decoded !== match) {
    return decoded;
  }
  return match;
}
function unescapeMd(str) {
  if (str.indexOf("\\") < 0) {
    return str;
  }
  return str.replace(UNESCAPE_MD_RE, "$1");
}
function unescapeAll(str) {
  if (str.indexOf("\\") < 0 && str.indexOf("&") < 0) {
    return str;
  }
  return str.replace(UNESCAPE_ALL_RE, function(match, escaped, entity) {
    if (escaped) {
      return escaped;
    }
    return replaceEntityPattern(match, entity);
  });
}
const HTML_ESCAPE_TEST_RE = /[&<>"]/;
const HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
const HTML_REPLACEMENTS = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;"
};
function replaceUnsafeChar(ch) {
  return HTML_REPLACEMENTS[ch];
}
function escapeHtml(str) {
  if (HTML_ESCAPE_TEST_RE.test(str)) {
    return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
  }
  return str;
}
const REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;
function escapeRE(str) {
  return str.replace(REGEXP_ESCAPE_RE, "\\$&");
}
function isSpace(code) {
  switch (code) {
    case 9:
    case 32:
      return true;
  }
  return false;
}
function isWhiteSpace(code) {
  if (code >= 8192 && code <= 8202) {
    return true;
  }
  switch (code) {
    case 9:
    // \t
    case 10:
    // \n
    case 11:
    // \v
    case 12:
    // \f
    case 13:
    // \r
    case 32:
    case 160:
    case 5760:
    case 8239:
    case 8287:
    case 12288:
      return true;
  }
  return false;
}
function isPunctChar(ch) {
  return uc_micro__WEBPACK_IMPORTED_MODULE_1__.P.test(ch) || uc_micro__WEBPACK_IMPORTED_MODULE_1__.S.test(ch);
}
function isMdAsciiPunct(ch) {
  switch (ch) {
    case 33:
    case 34:
    case 35:
    case 36:
    case 37:
    case 38:
    case 39:
    case 40:
    case 41:
    case 42:
    case 43:
    case 44:
    case 45:
    case 46:
    case 47:
    case 58:
    case 59:
    case 60:
    case 61:
    case 62:
    case 63:
    case 64:
    case 91:
    case 92:
    case 93:
    case 94:
    case 95:
    case 96:
    case 123:
    case 124:
    case 125:
    case 126:
      return true;
    default:
      return false;
  }
}
function normalizeReference(str) {
  str = str.trim().replace(/\s+/g, " ");
  if ("\u1E9E".toLowerCase() === "\u1E7E") {
    str = str.replace(/ẞ/g, "\xDF");
  }
  return str.toLowerCase().toUpperCase();
}
const lib = { mdurl: mdurl__WEBPACK_IMPORTED_MODULE_0__, ucmicro: uc_micro__WEBPACK_IMPORTED_MODULE_1__ };



/***/ },

/***/ "../../node_modules/markdown-it/lib/helpers/index.mjs"
/*!************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/helpers/index.mjs ***!
  \************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   parseLinkDestination: () => (/* reexport safe */ _parse_link_destination_mjs__WEBPACK_IMPORTED_MODULE_1__["default"]),
/* harmony export */   parseLinkLabel: () => (/* reexport safe */ _parse_link_label_mjs__WEBPACK_IMPORTED_MODULE_0__["default"]),
/* harmony export */   parseLinkTitle: () => (/* reexport safe */ _parse_link_title_mjs__WEBPACK_IMPORTED_MODULE_2__["default"])
/* harmony export */ });
/* harmony import */ var _parse_link_label_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./parse_link_label.mjs */ "../../node_modules/markdown-it/lib/helpers/parse_link_label.mjs");
/* harmony import */ var _parse_link_destination_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./parse_link_destination.mjs */ "../../node_modules/markdown-it/lib/helpers/parse_link_destination.mjs");
/* harmony import */ var _parse_link_title_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./parse_link_title.mjs */ "../../node_modules/markdown-it/lib/helpers/parse_link_title.mjs");






/***/ },

/***/ "../../node_modules/markdown-it/lib/helpers/parse_link_destination.mjs"
/*!*****************************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/helpers/parse_link_destination.mjs ***!
  \*****************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ parseLinkDestination)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function parseLinkDestination(str, start, max) {
  let code;
  let pos = start;
  const result = {
    ok: false,
    pos: 0,
    str: ""
  };
  if (str.charCodeAt(pos) === 60) {
    pos++;
    while (pos < max) {
      code = str.charCodeAt(pos);
      if (code === 10) {
        return result;
      }
      if (code === 60) {
        return result;
      }
      if (code === 62) {
        result.pos = pos + 1;
        result.str = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.unescapeAll)(str.slice(start + 1, pos));
        result.ok = true;
        return result;
      }
      if (code === 92 && pos + 1 < max) {
        pos += 2;
        continue;
      }
      pos++;
    }
    return result;
  }
  let level = 0;
  while (pos < max) {
    code = str.charCodeAt(pos);
    if (code === 32) {
      break;
    }
    if (code < 32 || code === 127) {
      break;
    }
    if (code === 92 && pos + 1 < max) {
      if (str.charCodeAt(pos + 1) === 32) {
        break;
      }
      pos += 2;
      continue;
    }
    if (code === 40) {
      level++;
      if (level > 32) {
        return result;
      }
    }
    if (code === 41) {
      if (level === 0) {
        break;
      }
      level--;
    }
    pos++;
  }
  if (start === pos) {
    return result;
  }
  if (level !== 0) {
    return result;
  }
  result.str = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.unescapeAll)(str.slice(start, pos));
  result.pos = pos;
  result.ok = true;
  return result;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/helpers/parse_link_label.mjs"
/*!***********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/helpers/parse_link_label.mjs ***!
  \***********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ parseLinkLabel)
/* harmony export */ });
function parseLinkLabel(state, start, disableNested) {
  let level, found, marker, prevPos;
  const max = state.posMax;
  const oldPos = state.pos;
  state.pos = start + 1;
  level = 1;
  while (state.pos < max) {
    marker = state.src.charCodeAt(state.pos);
    if (marker === 93) {
      level--;
      if (level === 0) {
        found = true;
        break;
      }
    }
    prevPos = state.pos;
    state.md.inline.skipToken(state);
    if (marker === 91) {
      if (prevPos === state.pos - 1) {
        level++;
      } else if (disableNested) {
        state.pos = oldPos;
        return -1;
      }
    }
  }
  let labelEnd = -1;
  if (found) {
    labelEnd = state.pos;
  }
  state.pos = oldPos;
  return labelEnd;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/helpers/parse_link_title.mjs"
/*!***********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/helpers/parse_link_title.mjs ***!
  \***********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ parseLinkTitle)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function parseLinkTitle(str, start, max, prev_state) {
  let code;
  let pos = start;
  const state = {
    // if `true`, this is a valid link title
    ok: false,
    // if `true`, this link can be continued on the next line
    can_continue: false,
    // if `ok`, it's the position of the first character after the closing marker
    pos: 0,
    // if `ok`, it's the unescaped title
    str: "",
    // expected closing marker character code
    marker: 0
  };
  if (prev_state) {
    state.str = prev_state.str;
    state.marker = prev_state.marker;
  } else {
    if (pos >= max) {
      return state;
    }
    let marker = str.charCodeAt(pos);
    if (marker !== 34 && marker !== 39 && marker !== 40) {
      return state;
    }
    start++;
    pos++;
    if (marker === 40) {
      marker = 41;
    }
    state.marker = marker;
  }
  while (pos < max) {
    code = str.charCodeAt(pos);
    if (code === state.marker) {
      state.pos = pos + 1;
      state.str += (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.unescapeAll)(str.slice(start, pos));
      state.ok = true;
      return state;
    } else if (code === 40 && state.marker === 41) {
      return state;
    } else if (code === 92 && pos + 1 < max) {
      pos++;
    }
    pos++;
  }
  state.can_continue = true;
  state.str += (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.unescapeAll)(str.slice(start, pos));
  return state;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/index.mjs"
/*!****************************************************!*\
  !*** ../../node_modules/markdown-it/lib/index.mjs ***!
  \****************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");
/* harmony import */ var _helpers_index_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./helpers/index.mjs */ "../../node_modules/markdown-it/lib/helpers/index.mjs");
/* harmony import */ var _renderer_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./renderer.mjs */ "../../node_modules/markdown-it/lib/renderer.mjs");
/* harmony import */ var _parser_core_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./parser_core.mjs */ "../../node_modules/markdown-it/lib/parser_core.mjs");
/* harmony import */ var _parser_block_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./parser_block.mjs */ "../../node_modules/markdown-it/lib/parser_block.mjs");
/* harmony import */ var _parser_inline_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./parser_inline.mjs */ "../../node_modules/markdown-it/lib/parser_inline.mjs");
/* harmony import */ var linkify_it__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! linkify-it */ "../../node_modules/linkify-it/index.mjs");
/* harmony import */ var mdurl__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! mdurl */ "../../node_modules/mdurl/index.mjs");
/* harmony import */ var punycode_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! punycode.js */ "../../node_modules/punycode.js/punycode.es6.js");
/* harmony import */ var _presets_default_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./presets/default.mjs */ "../../node_modules/markdown-it/lib/presets/default.mjs");
/* harmony import */ var _presets_zero_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./presets/zero.mjs */ "../../node_modules/markdown-it/lib/presets/zero.mjs");
/* harmony import */ var _presets_commonmark_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./presets/commonmark.mjs */ "../../node_modules/markdown-it/lib/presets/commonmark.mjs");












const config = {
  default: _presets_default_mjs__WEBPACK_IMPORTED_MODULE_9__["default"],
  zero: _presets_zero_mjs__WEBPACK_IMPORTED_MODULE_10__["default"],
  commonmark: _presets_commonmark_mjs__WEBPACK_IMPORTED_MODULE_11__["default"]
};
const BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
const GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;
function validateLink(url) {
  const str = url.trim().toLowerCase();
  return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true;
}
const RECODE_HOSTNAME_FOR = ["http:", "https:", "mailto:"];
function normalizeLink(url) {
  const parsed = mdurl__WEBPACK_IMPORTED_MODULE_7__.parse(url, true);
  if (parsed.hostname) {
    if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
      try {
        parsed.hostname = punycode_js__WEBPACK_IMPORTED_MODULE_8__["default"].toASCII(parsed.hostname);
      } catch (er) {
      }
    }
  }
  return mdurl__WEBPACK_IMPORTED_MODULE_7__.encode(mdurl__WEBPACK_IMPORTED_MODULE_7__.format(parsed));
}
function normalizeLinkText(url) {
  const parsed = mdurl__WEBPACK_IMPORTED_MODULE_7__.parse(url, true);
  if (parsed.hostname) {
    if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
      try {
        parsed.hostname = punycode_js__WEBPACK_IMPORTED_MODULE_8__["default"].toUnicode(parsed.hostname);
      } catch (er) {
      }
    }
  }
  return mdurl__WEBPACK_IMPORTED_MODULE_7__.decode(mdurl__WEBPACK_IMPORTED_MODULE_7__.format(parsed), mdurl__WEBPACK_IMPORTED_MODULE_7__.decode.defaultChars + "%");
}
function MarkdownIt(presetName, options) {
  if (!(this instanceof MarkdownIt)) {
    return new MarkdownIt(presetName, options);
  }
  if (!options) {
    if (!_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isString(presetName)) {
      options = presetName || {};
      presetName = "default";
    }
  }
  this.inline = new _parser_inline_mjs__WEBPACK_IMPORTED_MODULE_5__["default"]();
  this.block = new _parser_block_mjs__WEBPACK_IMPORTED_MODULE_4__["default"]();
  this.core = new _parser_core_mjs__WEBPACK_IMPORTED_MODULE_3__["default"]();
  this.renderer = new _renderer_mjs__WEBPACK_IMPORTED_MODULE_2__["default"]();
  this.linkify = new linkify_it__WEBPACK_IMPORTED_MODULE_6__["default"]();
  this.validateLink = validateLink;
  this.normalizeLink = normalizeLink;
  this.normalizeLinkText = normalizeLinkText;
  this.utils = _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__;
  this.helpers = _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.assign({}, _helpers_index_mjs__WEBPACK_IMPORTED_MODULE_1__);
  this.options = {};
  this.configure(presetName);
  if (options) {
    this.set(options);
  }
}
MarkdownIt.prototype.set = function(options) {
  _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.assign(this.options, options);
  return this;
};
MarkdownIt.prototype.configure = function(presets) {
  const self = this;
  if (_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isString(presets)) {
    const presetName = presets;
    presets = config[presetName];
    if (!presets) {
      throw new Error('Wrong `markdown-it` preset "' + presetName + '", check name');
    }
  }
  if (!presets) {
    throw new Error("Wrong `markdown-it` preset, can't be empty");
  }
  if (presets.options) {
    self.set(presets.options);
  }
  if (presets.components) {
    Object.keys(presets.components).forEach(function(name) {
      if (presets.components[name].rules) {
        self[name].ruler.enableOnly(presets.components[name].rules);
      }
      if (presets.components[name].rules2) {
        self[name].ruler2.enableOnly(presets.components[name].rules2);
      }
    });
  }
  return this;
};
MarkdownIt.prototype.enable = function(list, ignoreInvalid) {
  let result = [];
  if (!Array.isArray(list)) {
    list = [list];
  }
  ["core", "block", "inline"].forEach(function(chain) {
    result = result.concat(this[chain].ruler.enable(list, true));
  }, this);
  result = result.concat(this.inline.ruler2.enable(list, true));
  const missed = list.filter(function(name) {
    return result.indexOf(name) < 0;
  });
  if (missed.length && !ignoreInvalid) {
    throw new Error("MarkdownIt. Failed to enable unknown rule(s): " + missed);
  }
  return this;
};
MarkdownIt.prototype.disable = function(list, ignoreInvalid) {
  let result = [];
  if (!Array.isArray(list)) {
    list = [list];
  }
  ["core", "block", "inline"].forEach(function(chain) {
    result = result.concat(this[chain].ruler.disable(list, true));
  }, this);
  result = result.concat(this.inline.ruler2.disable(list, true));
  const missed = list.filter(function(name) {
    return result.indexOf(name) < 0;
  });
  if (missed.length && !ignoreInvalid) {
    throw new Error("MarkdownIt. Failed to disable unknown rule(s): " + missed);
  }
  return this;
};
MarkdownIt.prototype.use = function(plugin) {
  const args = [this].concat(Array.prototype.slice.call(arguments, 1));
  plugin.apply(plugin, args);
  return this;
};
MarkdownIt.prototype.parse = function(src, env) {
  if (typeof src !== "string") {
    throw new Error("Input data should be a String");
  }
  const state = new this.core.State(src, this, env);
  this.core.process(state);
  return state.tokens;
};
MarkdownIt.prototype.render = function(src, env) {
  env = env || {};
  return this.renderer.render(this.parse(src, env), this.options, env);
};
MarkdownIt.prototype.parseInline = function(src, env) {
  const state = new this.core.State(src, this, env);
  state.inlineMode = true;
  this.core.process(state);
  return state.tokens;
};
MarkdownIt.prototype.renderInline = function(src, env) {
  env = env || {};
  return this.renderer.render(this.parseInline(src, env), this.options, env);
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (MarkdownIt);


/***/ },

/***/ "../../node_modules/markdown-it/lib/parser_block.mjs"
/*!***********************************************************!*\
  !*** ../../node_modules/markdown-it/lib/parser_block.mjs ***!
  \***********************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _ruler_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ruler.mjs */ "../../node_modules/markdown-it/lib/ruler.mjs");
/* harmony import */ var _rules_block_state_block_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./rules_block/state_block.mjs */ "../../node_modules/markdown-it/lib/rules_block/state_block.mjs");
/* harmony import */ var _rules_block_table_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./rules_block/table.mjs */ "../../node_modules/markdown-it/lib/rules_block/table.mjs");
/* harmony import */ var _rules_block_code_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./rules_block/code.mjs */ "../../node_modules/markdown-it/lib/rules_block/code.mjs");
/* harmony import */ var _rules_block_fence_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./rules_block/fence.mjs */ "../../node_modules/markdown-it/lib/rules_block/fence.mjs");
/* harmony import */ var _rules_block_blockquote_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./rules_block/blockquote.mjs */ "../../node_modules/markdown-it/lib/rules_block/blockquote.mjs");
/* harmony import */ var _rules_block_hr_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./rules_block/hr.mjs */ "../../node_modules/markdown-it/lib/rules_block/hr.mjs");
/* harmony import */ var _rules_block_list_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./rules_block/list.mjs */ "../../node_modules/markdown-it/lib/rules_block/list.mjs");
/* harmony import */ var _rules_block_reference_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./rules_block/reference.mjs */ "../../node_modules/markdown-it/lib/rules_block/reference.mjs");
/* harmony import */ var _rules_block_html_block_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./rules_block/html_block.mjs */ "../../node_modules/markdown-it/lib/rules_block/html_block.mjs");
/* harmony import */ var _rules_block_heading_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./rules_block/heading.mjs */ "../../node_modules/markdown-it/lib/rules_block/heading.mjs");
/* harmony import */ var _rules_block_lheading_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./rules_block/lheading.mjs */ "../../node_modules/markdown-it/lib/rules_block/lheading.mjs");
/* harmony import */ var _rules_block_paragraph_mjs__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./rules_block/paragraph.mjs */ "../../node_modules/markdown-it/lib/rules_block/paragraph.mjs");













const _rules = [
  // First 2 params - rule name & source. Secondary array - list of rules,
  // which can be terminated by this one.
  ["table", _rules_block_table_mjs__WEBPACK_IMPORTED_MODULE_2__["default"], ["paragraph", "reference"]],
  ["code", _rules_block_code_mjs__WEBPACK_IMPORTED_MODULE_3__["default"]],
  ["fence", _rules_block_fence_mjs__WEBPACK_IMPORTED_MODULE_4__["default"], ["paragraph", "reference", "blockquote", "list"]],
  ["blockquote", _rules_block_blockquote_mjs__WEBPACK_IMPORTED_MODULE_5__["default"], ["paragraph", "reference", "blockquote", "list"]],
  ["hr", _rules_block_hr_mjs__WEBPACK_IMPORTED_MODULE_6__["default"], ["paragraph", "reference", "blockquote", "list"]],
  ["list", _rules_block_list_mjs__WEBPACK_IMPORTED_MODULE_7__["default"], ["paragraph", "reference", "blockquote"]],
  ["reference", _rules_block_reference_mjs__WEBPACK_IMPORTED_MODULE_8__["default"]],
  ["html_block", _rules_block_html_block_mjs__WEBPACK_IMPORTED_MODULE_9__["default"], ["paragraph", "reference", "blockquote"]],
  ["heading", _rules_block_heading_mjs__WEBPACK_IMPORTED_MODULE_10__["default"], ["paragraph", "reference", "blockquote"]],
  ["lheading", _rules_block_lheading_mjs__WEBPACK_IMPORTED_MODULE_11__["default"]],
  ["paragraph", _rules_block_paragraph_mjs__WEBPACK_IMPORTED_MODULE_12__["default"]]
];
function ParserBlock() {
  this.ruler = new _ruler_mjs__WEBPACK_IMPORTED_MODULE_0__["default"]();
  for (let i = 0; i < _rules.length; i++) {
    this.ruler.push(_rules[i][0], _rules[i][1], { alt: (_rules[i][2] || []).slice() });
  }
}
ParserBlock.prototype.tokenize = function(state, startLine, endLine) {
  const rules = this.ruler.getRules("");
  const len = rules.length;
  const maxNesting = state.md.options.maxNesting;
  let line = startLine;
  let hasEmptyLines = false;
  while (line < endLine) {
    state.line = line = state.skipEmptyLines(line);
    if (line >= endLine) {
      break;
    }
    if (state.sCount[line] < state.blkIndent) {
      break;
    }
    if (state.level >= maxNesting) {
      state.line = endLine;
      break;
    }
    const prevLine = state.line;
    let ok = false;
    for (let i = 0; i < len; i++) {
      ok = rules[i](state, line, endLine, false);
      if (ok) {
        if (prevLine >= state.line) {
          throw new Error("block rule didn't increment state.line");
        }
        break;
      }
    }
    if (!ok) throw new Error("none of the block rules matched");
    state.tight = !hasEmptyLines;
    if (state.isEmpty(state.line - 1)) {
      hasEmptyLines = true;
    }
    line = state.line;
    if (line < endLine && state.isEmpty(line)) {
      hasEmptyLines = true;
      line++;
      state.line = line;
    }
  }
};
ParserBlock.prototype.parse = function(src, md, env, outTokens) {
  if (!src) {
    return;
  }
  const state = new this.State(src, md, env, outTokens);
  this.tokenize(state, state.line, state.lineMax);
};
ParserBlock.prototype.State = _rules_block_state_block_mjs__WEBPACK_IMPORTED_MODULE_1__["default"];
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (ParserBlock);


/***/ },

/***/ "../../node_modules/markdown-it/lib/parser_core.mjs"
/*!**********************************************************!*\
  !*** ../../node_modules/markdown-it/lib/parser_core.mjs ***!
  \**********************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _ruler_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ruler.mjs */ "../../node_modules/markdown-it/lib/ruler.mjs");
/* harmony import */ var _rules_core_state_core_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./rules_core/state_core.mjs */ "../../node_modules/markdown-it/lib/rules_core/state_core.mjs");
/* harmony import */ var _rules_core_normalize_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./rules_core/normalize.mjs */ "../../node_modules/markdown-it/lib/rules_core/normalize.mjs");
/* harmony import */ var _rules_core_block_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./rules_core/block.mjs */ "../../node_modules/markdown-it/lib/rules_core/block.mjs");
/* harmony import */ var _rules_core_inline_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./rules_core/inline.mjs */ "../../node_modules/markdown-it/lib/rules_core/inline.mjs");
/* harmony import */ var _rules_core_linkify_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./rules_core/linkify.mjs */ "../../node_modules/markdown-it/lib/rules_core/linkify.mjs");
/* harmony import */ var _rules_core_replacements_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./rules_core/replacements.mjs */ "../../node_modules/markdown-it/lib/rules_core/replacements.mjs");
/* harmony import */ var _rules_core_smartquotes_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./rules_core/smartquotes.mjs */ "../../node_modules/markdown-it/lib/rules_core/smartquotes.mjs");
/* harmony import */ var _rules_core_text_join_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./rules_core/text_join.mjs */ "../../node_modules/markdown-it/lib/rules_core/text_join.mjs");









const _rules = [
  ["normalize", _rules_core_normalize_mjs__WEBPACK_IMPORTED_MODULE_2__["default"]],
  ["block", _rules_core_block_mjs__WEBPACK_IMPORTED_MODULE_3__["default"]],
  ["inline", _rules_core_inline_mjs__WEBPACK_IMPORTED_MODULE_4__["default"]],
  ["linkify", _rules_core_linkify_mjs__WEBPACK_IMPORTED_MODULE_5__["default"]],
  ["replacements", _rules_core_replacements_mjs__WEBPACK_IMPORTED_MODULE_6__["default"]],
  ["smartquotes", _rules_core_smartquotes_mjs__WEBPACK_IMPORTED_MODULE_7__["default"]],
  // `text_join` finds `text_special` tokens (for escape sequences)
  // and joins them with the rest of the text
  ["text_join", _rules_core_text_join_mjs__WEBPACK_IMPORTED_MODULE_8__["default"]]
];
function Core() {
  this.ruler = new _ruler_mjs__WEBPACK_IMPORTED_MODULE_0__["default"]();
  for (let i = 0; i < _rules.length; i++) {
    this.ruler.push(_rules[i][0], _rules[i][1]);
  }
}
Core.prototype.process = function(state) {
  const rules = this.ruler.getRules("");
  for (let i = 0, l = rules.length; i < l; i++) {
    rules[i](state);
  }
};
Core.prototype.State = _rules_core_state_core_mjs__WEBPACK_IMPORTED_MODULE_1__["default"];
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Core);


/***/ },

/***/ "../../node_modules/markdown-it/lib/parser_inline.mjs"
/*!************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/parser_inline.mjs ***!
  \************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _ruler_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ruler.mjs */ "../../node_modules/markdown-it/lib/ruler.mjs");
/* harmony import */ var _rules_inline_state_inline_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./rules_inline/state_inline.mjs */ "../../node_modules/markdown-it/lib/rules_inline/state_inline.mjs");
/* harmony import */ var _rules_inline_text_mjs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./rules_inline/text.mjs */ "../../node_modules/markdown-it/lib/rules_inline/text.mjs");
/* harmony import */ var _rules_inline_linkify_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./rules_inline/linkify.mjs */ "../../node_modules/markdown-it/lib/rules_inline/linkify.mjs");
/* harmony import */ var _rules_inline_newline_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./rules_inline/newline.mjs */ "../../node_modules/markdown-it/lib/rules_inline/newline.mjs");
/* harmony import */ var _rules_inline_escape_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./rules_inline/escape.mjs */ "../../node_modules/markdown-it/lib/rules_inline/escape.mjs");
/* harmony import */ var _rules_inline_backticks_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./rules_inline/backticks.mjs */ "../../node_modules/markdown-it/lib/rules_inline/backticks.mjs");
/* harmony import */ var _rules_inline_strikethrough_mjs__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./rules_inline/strikethrough.mjs */ "../../node_modules/markdown-it/lib/rules_inline/strikethrough.mjs");
/* harmony import */ var _rules_inline_emphasis_mjs__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./rules_inline/emphasis.mjs */ "../../node_modules/markdown-it/lib/rules_inline/emphasis.mjs");
/* harmony import */ var _rules_inline_link_mjs__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./rules_inline/link.mjs */ "../../node_modules/markdown-it/lib/rules_inline/link.mjs");
/* harmony import */ var _rules_inline_image_mjs__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./rules_inline/image.mjs */ "../../node_modules/markdown-it/lib/rules_inline/image.mjs");
/* harmony import */ var _rules_inline_autolink_mjs__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./rules_inline/autolink.mjs */ "../../node_modules/markdown-it/lib/rules_inline/autolink.mjs");
/* harmony import */ var _rules_inline_html_inline_mjs__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./rules_inline/html_inline.mjs */ "../../node_modules/markdown-it/lib/rules_inline/html_inline.mjs");
/* harmony import */ var _rules_inline_entity_mjs__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! ./rules_inline/entity.mjs */ "../../node_modules/markdown-it/lib/rules_inline/entity.mjs");
/* harmony import */ var _rules_inline_balance_pairs_mjs__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! ./rules_inline/balance_pairs.mjs */ "../../node_modules/markdown-it/lib/rules_inline/balance_pairs.mjs");
/* harmony import */ var _rules_inline_fragments_join_mjs__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! ./rules_inline/fragments_join.mjs */ "../../node_modules/markdown-it/lib/rules_inline/fragments_join.mjs");
















const _rules = [
  ["text", _rules_inline_text_mjs__WEBPACK_IMPORTED_MODULE_2__["default"]],
  ["linkify", _rules_inline_linkify_mjs__WEBPACK_IMPORTED_MODULE_3__["default"]],
  ["newline", _rules_inline_newline_mjs__WEBPACK_IMPORTED_MODULE_4__["default"]],
  ["escape", _rules_inline_escape_mjs__WEBPACK_IMPORTED_MODULE_5__["default"]],
  ["backticks", _rules_inline_backticks_mjs__WEBPACK_IMPORTED_MODULE_6__["default"]],
  ["strikethrough", _rules_inline_strikethrough_mjs__WEBPACK_IMPORTED_MODULE_7__["default"].tokenize],
  ["emphasis", _rules_inline_emphasis_mjs__WEBPACK_IMPORTED_MODULE_8__["default"].tokenize],
  ["link", _rules_inline_link_mjs__WEBPACK_IMPORTED_MODULE_9__["default"]],
  ["image", _rules_inline_image_mjs__WEBPACK_IMPORTED_MODULE_10__["default"]],
  ["autolink", _rules_inline_autolink_mjs__WEBPACK_IMPORTED_MODULE_11__["default"]],
  ["html_inline", _rules_inline_html_inline_mjs__WEBPACK_IMPORTED_MODULE_12__["default"]],
  ["entity", _rules_inline_entity_mjs__WEBPACK_IMPORTED_MODULE_13__["default"]]
];
const _rules2 = [
  ["balance_pairs", _rules_inline_balance_pairs_mjs__WEBPACK_IMPORTED_MODULE_14__["default"]],
  ["strikethrough", _rules_inline_strikethrough_mjs__WEBPACK_IMPORTED_MODULE_7__["default"].postProcess],
  ["emphasis", _rules_inline_emphasis_mjs__WEBPACK_IMPORTED_MODULE_8__["default"].postProcess],
  // rules for pairs separate '**' into its own text tokens, which may be left unused,
  // rule below merges unused segments back with the rest of the text
  ["fragments_join", _rules_inline_fragments_join_mjs__WEBPACK_IMPORTED_MODULE_15__["default"]]
];
function ParserInline() {
  this.ruler = new _ruler_mjs__WEBPACK_IMPORTED_MODULE_0__["default"]();
  for (let i = 0; i < _rules.length; i++) {
    this.ruler.push(_rules[i][0], _rules[i][1]);
  }
  this.ruler2 = new _ruler_mjs__WEBPACK_IMPORTED_MODULE_0__["default"]();
  for (let i = 0; i < _rules2.length; i++) {
    this.ruler2.push(_rules2[i][0], _rules2[i][1]);
  }
}
ParserInline.prototype.skipToken = function(state) {
  const pos = state.pos;
  const rules = this.ruler.getRules("");
  const len = rules.length;
  const maxNesting = state.md.options.maxNesting;
  const cache = state.cache;
  if (typeof cache[pos] !== "undefined") {
    state.pos = cache[pos];
    return;
  }
  let ok = false;
  if (state.level < maxNesting) {
    for (let i = 0; i < len; i++) {
      state.level++;
      ok = rules[i](state, true);
      state.level--;
      if (ok) {
        if (pos >= state.pos) {
          throw new Error("inline rule didn't increment state.pos");
        }
        break;
      }
    }
  } else {
    state.pos = state.posMax;
  }
  if (!ok) {
    state.pos++;
  }
  cache[pos] = state.pos;
};
ParserInline.prototype.tokenize = function(state) {
  const rules = this.ruler.getRules("");
  const len = rules.length;
  const end = state.posMax;
  const maxNesting = state.md.options.maxNesting;
  while (state.pos < end) {
    const prevPos = state.pos;
    let ok = false;
    if (state.level < maxNesting) {
      for (let i = 0; i < len; i++) {
        ok = rules[i](state, false);
        if (ok) {
          if (prevPos >= state.pos) {
            throw new Error("inline rule didn't increment state.pos");
          }
          break;
        }
      }
    }
    if (ok) {
      if (state.pos >= end) {
        break;
      }
      continue;
    }
    state.pending += state.src[state.pos++];
  }
  if (state.pending) {
    state.pushPending();
  }
};
ParserInline.prototype.parse = function(str, md, env, outTokens) {
  const state = new this.State(str, md, env, outTokens);
  this.tokenize(state);
  const rules = this.ruler2.getRules("");
  const len = rules.length;
  for (let i = 0; i < len; i++) {
    rules[i](state);
  }
};
ParserInline.prototype.State = _rules_inline_state_inline_mjs__WEBPACK_IMPORTED_MODULE_1__["default"];
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (ParserInline);


/***/ },

/***/ "../../node_modules/markdown-it/lib/presets/commonmark.mjs"
/*!*****************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/presets/commonmark.mjs ***!
  \*****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  options: {
    // Enable HTML tags in source
    html: true,
    // Use '/' to close single tags (<br />)
    xhtmlOut: true,
    // Convert '\n' in paragraphs into <br>
    breaks: false,
    // CSS language prefix for fenced blocks
    langPrefix: "language-",
    // autoconvert URL-like texts to links
    linkify: false,
    // Enable some language-neutral replacements + quotes beautification
    typographer: false,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: "\u201C\u201D\u2018\u2019",
    /* “”‘’ */
    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,
    // Internal protection, recursion limit
    maxNesting: 20
  },
  components: {
    core: {
      rules: [
        "normalize",
        "block",
        "inline",
        "text_join"
      ]
    },
    block: {
      rules: [
        "blockquote",
        "code",
        "fence",
        "heading",
        "hr",
        "html_block",
        "lheading",
        "list",
        "reference",
        "paragraph"
      ]
    },
    inline: {
      rules: [
        "autolink",
        "backticks",
        "emphasis",
        "entity",
        "escape",
        "html_inline",
        "image",
        "link",
        "newline",
        "text"
      ],
      rules2: [
        "balance_pairs",
        "emphasis",
        "fragments_join"
      ]
    }
  }
});


/***/ },

/***/ "../../node_modules/markdown-it/lib/presets/default.mjs"
/*!**************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/presets/default.mjs ***!
  \**************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  options: {
    // Enable HTML tags in source
    html: false,
    // Use '/' to close single tags (<br />)
    xhtmlOut: false,
    // Convert '\n' in paragraphs into <br>
    breaks: false,
    // CSS language prefix for fenced blocks
    langPrefix: "language-",
    // autoconvert URL-like texts to links
    linkify: false,
    // Enable some language-neutral replacements + quotes beautification
    typographer: false,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: "\u201C\u201D\u2018\u2019",
    /* “”‘’ */
    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,
    // Internal protection, recursion limit
    maxNesting: 100
  },
  components: {
    core: {},
    block: {},
    inline: {}
  }
});


/***/ },

/***/ "../../node_modules/markdown-it/lib/presets/zero.mjs"
/*!***********************************************************!*\
  !*** ../../node_modules/markdown-it/lib/presets/zero.mjs ***!
  \***********************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  options: {
    // Enable HTML tags in source
    html: false,
    // Use '/' to close single tags (<br />)
    xhtmlOut: false,
    // Convert '\n' in paragraphs into <br>
    breaks: false,
    // CSS language prefix for fenced blocks
    langPrefix: "language-",
    // autoconvert URL-like texts to links
    linkify: false,
    // Enable some language-neutral replacements + quotes beautification
    typographer: false,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: "\u201C\u201D\u2018\u2019",
    /* “”‘’ */
    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,
    // Internal protection, recursion limit
    maxNesting: 20
  },
  components: {
    core: {
      rules: [
        "normalize",
        "block",
        "inline",
        "text_join"
      ]
    },
    block: {
      rules: [
        "paragraph"
      ]
    },
    inline: {
      rules: [
        "text"
      ],
      rules2: [
        "balance_pairs",
        "fragments_join"
      ]
    }
  }
});


/***/ },

/***/ "../../node_modules/markdown-it/lib/renderer.mjs"
/*!*******************************************************!*\
  !*** ../../node_modules/markdown-it/lib/renderer.mjs ***!
  \*******************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

const default_rules = {};
default_rules.code_inline = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  return "<code" + slf.renderAttrs(token) + ">" + (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.escapeHtml)(token.content) + "</code>";
};
default_rules.code_block = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  return "<pre" + slf.renderAttrs(token) + "><code>" + (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.escapeHtml)(tokens[idx].content) + "</code></pre>\n";
};
default_rules.fence = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  const info = token.info ? (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.unescapeAll)(token.info).trim() : "";
  let langName = "";
  let langAttrs = "";
  if (info) {
    const arr = info.split(/(\s+)/g);
    langName = arr[0];
    langAttrs = arr.slice(2).join("");
  }
  let highlighted;
  if (options.highlight) {
    highlighted = options.highlight(token.content, langName, langAttrs) || (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.escapeHtml)(token.content);
  } else {
    highlighted = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.escapeHtml)(token.content);
  }
  if (highlighted.indexOf("<pre") === 0) {
    return highlighted + "\n";
  }
  if (info) {
    const i = token.attrIndex("class");
    const tmpAttrs = token.attrs ? token.attrs.slice() : [];
    if (i < 0) {
      tmpAttrs.push(["class", options.langPrefix + langName]);
    } else {
      tmpAttrs[i] = tmpAttrs[i].slice();
      tmpAttrs[i][1] += " " + options.langPrefix + langName;
    }
    const tmpToken = {
      attrs: tmpAttrs
    };
    return `<pre><code${slf.renderAttrs(tmpToken)}>${highlighted}</code></pre>
`;
  }
  return `<pre><code${slf.renderAttrs(token)}>${highlighted}</code></pre>
`;
};
default_rules.image = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  token.attrs[token.attrIndex("alt")][1] = slf.renderInlineAsText(token.children, options, env);
  return slf.renderToken(tokens, idx, options);
};
default_rules.hardbreak = function(tokens, idx, options) {
  return options.xhtmlOut ? "<br />\n" : "<br>\n";
};
default_rules.softbreak = function(tokens, idx, options) {
  return options.breaks ? options.xhtmlOut ? "<br />\n" : "<br>\n" : "\n";
};
default_rules.text = function(tokens, idx) {
  return (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.escapeHtml)(tokens[idx].content);
};
default_rules.html_block = function(tokens, idx) {
  return tokens[idx].content;
};
default_rules.html_inline = function(tokens, idx) {
  return tokens[idx].content;
};
function Renderer() {
  this.rules = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.assign)({}, default_rules);
}
Renderer.prototype.renderAttrs = function renderAttrs(token) {
  let i, l, result;
  if (!token.attrs) {
    return "";
  }
  result = "";
  for (i = 0, l = token.attrs.length; i < l; i++) {
    result += " " + (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.escapeHtml)(token.attrs[i][0]) + '="' + (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.escapeHtml)(token.attrs[i][1]) + '"';
  }
  return result;
};
Renderer.prototype.renderToken = function renderToken(tokens, idx, options) {
  const token = tokens[idx];
  let result = "";
  if (token.hidden) {
    return "";
  }
  if (token.block && token.nesting !== -1 && idx && tokens[idx - 1].hidden) {
    result += "\n";
  }
  result += (token.nesting === -1 ? "</" : "<") + token.tag;
  result += this.renderAttrs(token);
  if (token.nesting === 0 && options.xhtmlOut) {
    result += " /";
  }
  let needLf = false;
  if (token.block) {
    needLf = true;
    if (token.nesting === 1) {
      if (idx + 1 < tokens.length) {
        const nextToken = tokens[idx + 1];
        if (nextToken.type === "inline" || nextToken.hidden) {
          needLf = false;
        } else if (nextToken.nesting === -1 && nextToken.tag === token.tag) {
          needLf = false;
        }
      }
    }
  }
  result += needLf ? ">\n" : ">";
  return result;
};
Renderer.prototype.renderInline = function(tokens, options, env) {
  let result = "";
  const rules = this.rules;
  for (let i = 0, len = tokens.length; i < len; i++) {
    const type = tokens[i].type;
    if (typeof rules[type] !== "undefined") {
      result += rules[type](tokens, i, options, env, this);
    } else {
      result += this.renderToken(tokens, i, options);
    }
  }
  return result;
};
Renderer.prototype.renderInlineAsText = function(tokens, options, env) {
  let result = "";
  for (let i = 0, len = tokens.length; i < len; i++) {
    switch (tokens[i].type) {
      case "text":
        result += tokens[i].content;
        break;
      case "image":
        result += this.renderInlineAsText(tokens[i].children, options, env);
        break;
      case "html_inline":
      case "html_block":
        result += tokens[i].content;
        break;
      case "softbreak":
      case "hardbreak":
        result += "\n";
        break;
      default:
    }
  }
  return result;
};
Renderer.prototype.render = function(tokens, options, env) {
  let result = "";
  const rules = this.rules;
  for (let i = 0, len = tokens.length; i < len; i++) {
    const type = tokens[i].type;
    if (type === "inline") {
      result += this.renderInline(tokens[i].children, options, env);
    } else if (typeof rules[type] !== "undefined") {
      result += rules[type](tokens, i, options, env, this);
    } else {
      result += this.renderToken(tokens, i, options, env);
    }
  }
  return result;
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Renderer);


/***/ },

/***/ "../../node_modules/markdown-it/lib/ruler.mjs"
/*!****************************************************!*\
  !*** ../../node_modules/markdown-it/lib/ruler.mjs ***!
  \****************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
function Ruler() {
  this.__rules__ = [];
  this.__cache__ = null;
}
Ruler.prototype.__find__ = function(name) {
  for (let i = 0; i < this.__rules__.length; i++) {
    if (this.__rules__[i].name === name) {
      return i;
    }
  }
  return -1;
};
Ruler.prototype.__compile__ = function() {
  const self = this;
  const chains = [""];
  self.__rules__.forEach(function(rule) {
    if (!rule.enabled) {
      return;
    }
    rule.alt.forEach(function(altName) {
      if (chains.indexOf(altName) < 0) {
        chains.push(altName);
      }
    });
  });
  self.__cache__ = {};
  chains.forEach(function(chain) {
    self.__cache__[chain] = [];
    self.__rules__.forEach(function(rule) {
      if (!rule.enabled) {
        return;
      }
      if (chain && rule.alt.indexOf(chain) < 0) {
        return;
      }
      self.__cache__[chain].push(rule.fn);
    });
  });
};
Ruler.prototype.at = function(name, fn, options) {
  const index = this.__find__(name);
  const opt = options || {};
  if (index === -1) {
    throw new Error("Parser rule not found: " + name);
  }
  this.__rules__[index].fn = fn;
  this.__rules__[index].alt = opt.alt || [];
  this.__cache__ = null;
};
Ruler.prototype.before = function(beforeName, ruleName, fn, options) {
  const index = this.__find__(beforeName);
  const opt = options || {};
  if (index === -1) {
    throw new Error("Parser rule not found: " + beforeName);
  }
  this.__rules__.splice(index, 0, {
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });
  this.__cache__ = null;
};
Ruler.prototype.after = function(afterName, ruleName, fn, options) {
  const index = this.__find__(afterName);
  const opt = options || {};
  if (index === -1) {
    throw new Error("Parser rule not found: " + afterName);
  }
  this.__rules__.splice(index + 1, 0, {
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });
  this.__cache__ = null;
};
Ruler.prototype.push = function(ruleName, fn, options) {
  const opt = options || {};
  this.__rules__.push({
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });
  this.__cache__ = null;
};
Ruler.prototype.enable = function(list, ignoreInvalid) {
  if (!Array.isArray(list)) {
    list = [list];
  }
  const result = [];
  list.forEach(function(name) {
    const idx = this.__find__(name);
    if (idx < 0) {
      if (ignoreInvalid) {
        return;
      }
      throw new Error("Rules manager: invalid rule name " + name);
    }
    this.__rules__[idx].enabled = true;
    result.push(name);
  }, this);
  this.__cache__ = null;
  return result;
};
Ruler.prototype.enableOnly = function(list, ignoreInvalid) {
  if (!Array.isArray(list)) {
    list = [list];
  }
  this.__rules__.forEach(function(rule) {
    rule.enabled = false;
  });
  this.enable(list, ignoreInvalid);
};
Ruler.prototype.disable = function(list, ignoreInvalid) {
  if (!Array.isArray(list)) {
    list = [list];
  }
  const result = [];
  list.forEach(function(name) {
    const idx = this.__find__(name);
    if (idx < 0) {
      if (ignoreInvalid) {
        return;
      }
      throw new Error("Rules manager: invalid rule name " + name);
    }
    this.__rules__[idx].enabled = false;
    result.push(name);
  }, this);
  this.__cache__ = null;
  return result;
};
Ruler.prototype.getRules = function(chainName) {
  if (this.__cache__ === null) {
    this.__compile__();
  }
  return this.__cache__[chainName] || [];
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Ruler);


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/blockquote.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/blockquote.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ blockquote)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function blockquote(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  const oldLineMax = state.lineMax;
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  if (state.src.charCodeAt(pos) !== 62) {
    return false;
  }
  if (silent) {
    return true;
  }
  const oldBMarks = [];
  const oldBSCount = [];
  const oldSCount = [];
  const oldTShift = [];
  const terminatorRules = state.md.block.ruler.getRules("blockquote");
  const oldParentType = state.parentType;
  state.parentType = "blockquote";
  let lastLineEmpty = false;
  let nextLine;
  for (nextLine = startLine; nextLine < endLine; nextLine++) {
    const isOutdented = state.sCount[nextLine] < state.blkIndent;
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos >= max) {
      break;
    }
    if (state.src.charCodeAt(pos++) === 62 && !isOutdented) {
      let initial = state.sCount[nextLine] + 1;
      let spaceAfterMarker;
      let adjustTab;
      if (state.src.charCodeAt(pos) === 32) {
        pos++;
        initial++;
        adjustTab = false;
        spaceAfterMarker = true;
      } else if (state.src.charCodeAt(pos) === 9) {
        spaceAfterMarker = true;
        if ((state.bsCount[nextLine] + initial) % 4 === 3) {
          pos++;
          initial++;
          adjustTab = false;
        } else {
          adjustTab = true;
        }
      } else {
        spaceAfterMarker = false;
      }
      let offset = initial;
      oldBMarks.push(state.bMarks[nextLine]);
      state.bMarks[nextLine] = pos;
      while (pos < max) {
        const ch = state.src.charCodeAt(pos);
        if ((0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch)) {
          if (ch === 9) {
            offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
          } else {
            offset++;
          }
        } else {
          break;
        }
        pos++;
      }
      lastLineEmpty = pos >= max;
      oldBSCount.push(state.bsCount[nextLine]);
      state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);
      oldSCount.push(state.sCount[nextLine]);
      state.sCount[nextLine] = offset - initial;
      oldTShift.push(state.tShift[nextLine]);
      state.tShift[nextLine] = pos - state.bMarks[nextLine];
      continue;
    }
    if (lastLineEmpty) {
      break;
    }
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      state.lineMax = nextLine;
      if (state.blkIndent !== 0) {
        oldBMarks.push(state.bMarks[nextLine]);
        oldBSCount.push(state.bsCount[nextLine]);
        oldTShift.push(state.tShift[nextLine]);
        oldSCount.push(state.sCount[nextLine]);
        state.sCount[nextLine] -= state.blkIndent;
      }
      break;
    }
    oldBMarks.push(state.bMarks[nextLine]);
    oldBSCount.push(state.bsCount[nextLine]);
    oldTShift.push(state.tShift[nextLine]);
    oldSCount.push(state.sCount[nextLine]);
    state.sCount[nextLine] = -1;
  }
  const oldIndent = state.blkIndent;
  state.blkIndent = 0;
  const token_o = state.push("blockquote_open", "blockquote", 1);
  token_o.markup = ">";
  const lines = [startLine, 0];
  token_o.map = lines;
  state.md.block.tokenize(state, startLine, nextLine);
  const token_c = state.push("blockquote_close", "blockquote", -1);
  token_c.markup = ">";
  state.lineMax = oldLineMax;
  state.parentType = oldParentType;
  lines[1] = state.line;
  for (let i = 0; i < oldTShift.length; i++) {
    state.bMarks[i + startLine] = oldBMarks[i];
    state.tShift[i + startLine] = oldTShift[i];
    state.sCount[i + startLine] = oldSCount[i];
    state.bsCount[i + startLine] = oldBSCount[i];
  }
  state.blkIndent = oldIndent;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/code.mjs"
/*!***************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/code.mjs ***!
  \***************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ code)
/* harmony export */ });
function code(state, startLine, endLine) {
  if (state.sCount[startLine] - state.blkIndent < 4) {
    return false;
  }
  let nextLine = startLine + 1;
  let last = nextLine;
  while (nextLine < endLine) {
    if (state.isEmpty(nextLine)) {
      nextLine++;
      continue;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      nextLine++;
      last = nextLine;
      continue;
    }
    break;
  }
  state.line = last;
  const token = state.push("code_block", "code", 0);
  token.content = state.getLines(startLine, last, 4 + state.blkIndent, false) + "\n";
  token.map = [startLine, state.line];
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/fence.mjs"
/*!****************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/fence.mjs ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ fence)
/* harmony export */ });
function fence(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  if (pos + 3 > max) {
    return false;
  }
  const marker = state.src.charCodeAt(pos);
  if (marker !== 126 && marker !== 96) {
    return false;
  }
  let mem = pos;
  pos = state.skipChars(pos, marker);
  let len = pos - mem;
  if (len < 3) {
    return false;
  }
  const markup = state.src.slice(mem, pos);
  const params = state.src.slice(pos, max);
  if (marker === 96) {
    if (params.indexOf(String.fromCharCode(marker)) >= 0) {
      return false;
    }
  }
  if (silent) {
    return true;
  }
  let nextLine = startLine;
  let haveEndMarker = false;
  for (; ; ) {
    nextLine++;
    if (nextLine >= endLine) {
      break;
    }
    pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos < max && state.sCount[nextLine] < state.blkIndent) {
      break;
    }
    if (state.src.charCodeAt(pos) !== marker) {
      continue;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      continue;
    }
    pos = state.skipChars(pos, marker);
    if (pos - mem < len) {
      continue;
    }
    pos = state.skipSpaces(pos);
    if (pos < max) {
      continue;
    }
    haveEndMarker = true;
    break;
  }
  len = state.sCount[startLine];
  state.line = nextLine + (haveEndMarker ? 1 : 0);
  const token = state.push("fence", "code", 0);
  token.info = params;
  token.content = state.getLines(startLine + 1, nextLine, len, true);
  token.markup = markup;
  token.map = [startLine, state.line];
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/heading.mjs"
/*!******************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/heading.mjs ***!
  \******************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ heading)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function heading(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  let ch = state.src.charCodeAt(pos);
  if (ch !== 35 || pos >= max) {
    return false;
  }
  let level = 1;
  ch = state.src.charCodeAt(++pos);
  while (ch === 35 && pos < max && level <= 6) {
    level++;
    ch = state.src.charCodeAt(++pos);
  }
  if (level > 6 || pos < max && !(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch)) {
    return false;
  }
  if (silent) {
    return true;
  }
  max = state.skipSpacesBack(max, pos);
  const tmp = state.skipCharsBack(max, 35, pos);
  if (tmp > pos && (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(state.src.charCodeAt(tmp - 1))) {
    max = tmp;
  }
  state.line = startLine + 1;
  const token_o = state.push("heading_open", "h" + String(level), 1);
  token_o.markup = "########".slice(0, level);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = state.src.slice(pos, max).trim();
  token_i.map = [startLine, state.line];
  token_i.children = [];
  const token_c = state.push("heading_close", "h" + String(level), -1);
  token_c.markup = "########".slice(0, level);
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/hr.mjs"
/*!*************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/hr.mjs ***!
  \*************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ hr)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function hr(state, startLine, endLine, silent) {
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const marker = state.src.charCodeAt(pos++);
  if (marker !== 42 && marker !== 45 && marker !== 95) {
    return false;
  }
  let cnt = 1;
  while (pos < max) {
    const ch = state.src.charCodeAt(pos++);
    if (ch !== marker && !(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch)) {
      return false;
    }
    if (ch === marker) {
      cnt++;
    }
  }
  if (cnt < 3) {
    return false;
  }
  if (silent) {
    return true;
  }
  state.line = startLine + 1;
  const token = state.push("hr", "hr", 0);
  token.map = [startLine, state.line];
  token.markup = Array(cnt + 1).join(String.fromCharCode(marker));
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/html_block.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/html_block.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ html_block)
/* harmony export */ });
/* harmony import */ var _common_html_blocks_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/html_blocks.mjs */ "../../node_modules/markdown-it/lib/common/html_blocks.mjs");
/* harmony import */ var _common_html_re_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../common/html_re.mjs */ "../../node_modules/markdown-it/lib/common/html_re.mjs");


const HTML_SEQUENCES = [
  [/^<(script|pre|style|textarea)(?=(\s|>|$))/i, /<\/(script|pre|style|textarea)>/i, true],
  [/^<!--/, /-->/, true],
  [/^<\?/, /\?>/, true],
  [/^<![A-Z]/, />/, true],
  [/^<!\[CDATA\[/, /\]\]>/, true],
  [new RegExp("^</?(" + _common_html_blocks_mjs__WEBPACK_IMPORTED_MODULE_0__["default"].join("|") + ")(?=(\\s|/?>|$))", "i"), /^$/, true],
  [new RegExp(_common_html_re_mjs__WEBPACK_IMPORTED_MODULE_1__.HTML_OPEN_CLOSE_TAG_RE.source + "\\s*$"), /^$/, false]
];
function html_block(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  if (!state.md.options.html) {
    return false;
  }
  if (state.src.charCodeAt(pos) !== 60) {
    return false;
  }
  let lineText = state.src.slice(pos, max);
  let i = 0;
  for (; i < HTML_SEQUENCES.length; i++) {
    if (HTML_SEQUENCES[i][0].test(lineText)) {
      break;
    }
  }
  if (i === HTML_SEQUENCES.length) {
    return false;
  }
  if (silent) {
    return HTML_SEQUENCES[i][2];
  }
  let nextLine = startLine + 1;
  if (!HTML_SEQUENCES[i][1].test(lineText)) {
    for (; nextLine < endLine; nextLine++) {
      if (state.sCount[nextLine] < state.blkIndent) {
        break;
      }
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      lineText = state.src.slice(pos, max);
      if (HTML_SEQUENCES[i][1].test(lineText)) {
        if (lineText.length !== 0) {
          nextLine++;
        }
        break;
      }
    }
  }
  state.line = nextLine;
  const token = state.push("html_block", "", 0);
  token.map = [startLine, nextLine];
  token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/lheading.mjs"
/*!*******************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/lheading.mjs ***!
  \*******************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ lheading)
/* harmony export */ });
function lheading(state, startLine, endLine) {
  const terminatorRules = state.md.block.ruler.getRules("paragraph");
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  const oldParentType = state.parentType;
  state.parentType = "paragraph";
  let level = 0;
  let marker;
  let nextLine = startLine + 1;
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    if (state.sCount[nextLine] - state.blkIndent > 3) {
      continue;
    }
    if (state.sCount[nextLine] >= state.blkIndent) {
      let pos = state.bMarks[nextLine] + state.tShift[nextLine];
      const max = state.eMarks[nextLine];
      if (pos < max) {
        marker = state.src.charCodeAt(pos);
        if (marker === 45 || marker === 61) {
          pos = state.skipChars(pos, marker);
          pos = state.skipSpaces(pos);
          if (pos >= max) {
            level = marker === 61 ? 1 : 2;
            break;
          }
        }
      }
    }
    if (state.sCount[nextLine] < 0) {
      continue;
    }
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      break;
    }
  }
  if (!level) {
    return false;
  }
  const content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
  state.line = nextLine + 1;
  const token_o = state.push("heading_open", "h" + String(level), 1);
  token_o.markup = String.fromCharCode(marker);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = content;
  token_i.map = [startLine, state.line - 1];
  token_i.children = [];
  const token_c = state.push("heading_close", "h" + String(level), -1);
  token_c.markup = String.fromCharCode(marker);
  state.parentType = oldParentType;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/list.mjs"
/*!***************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/list.mjs ***!
  \***************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ list)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function skipBulletListMarker(state, startLine) {
  const max = state.eMarks[startLine];
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const marker = state.src.charCodeAt(pos++);
  if (marker !== 42 && marker !== 45 && marker !== 43) {
    return -1;
  }
  if (pos < max) {
    const ch = state.src.charCodeAt(pos);
    if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch)) {
      return -1;
    }
  }
  return pos;
}
function skipOrderedListMarker(state, startLine) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  let pos = start;
  if (pos + 1 >= max) {
    return -1;
  }
  let ch = state.src.charCodeAt(pos++);
  if (ch < 48 || ch > 57) {
    return -1;
  }
  for (; ; ) {
    if (pos >= max) {
      return -1;
    }
    ch = state.src.charCodeAt(pos++);
    if (ch >= 48 && ch <= 57) {
      if (pos - start >= 10) {
        return -1;
      }
      continue;
    }
    if (ch === 41 || ch === 46) {
      break;
    }
    return -1;
  }
  if (pos < max) {
    ch = state.src.charCodeAt(pos);
    if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch)) {
      return -1;
    }
  }
  return pos;
}
function markTightParagraphs(state, idx) {
  const level = state.level + 2;
  for (let i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
    if (state.tokens[i].level === level && state.tokens[i].type === "paragraph_open") {
      state.tokens[i + 2].hidden = true;
      state.tokens[i].hidden = true;
      i += 2;
    }
  }
}
function list(state, startLine, endLine, silent) {
  let max, pos, start, token;
  let nextLine = startLine;
  let tight = true;
  if (state.sCount[nextLine] - state.blkIndent >= 4) {
    return false;
  }
  if (state.listIndent >= 0 && state.sCount[nextLine] - state.listIndent >= 4 && state.sCount[nextLine] < state.blkIndent) {
    return false;
  }
  let isTerminatingParagraph = false;
  if (silent && state.parentType === "paragraph") {
    if (state.sCount[nextLine] >= state.blkIndent) {
      isTerminatingParagraph = true;
    }
  }
  let isOrdered;
  let markerValue;
  let posAfterMarker;
  if ((posAfterMarker = skipOrderedListMarker(state, nextLine)) >= 0) {
    isOrdered = true;
    start = state.bMarks[nextLine] + state.tShift[nextLine];
    markerValue = Number(state.src.slice(start, posAfterMarker - 1));
    if (isTerminatingParagraph && markerValue !== 1) return false;
  } else if ((posAfterMarker = skipBulletListMarker(state, nextLine)) >= 0) {
    isOrdered = false;
  } else {
    return false;
  }
  if (isTerminatingParagraph) {
    if (state.skipSpaces(posAfterMarker) >= state.eMarks[nextLine]) return false;
  }
  if (silent) {
    return true;
  }
  const markerCharCode = state.src.charCodeAt(posAfterMarker - 1);
  const listTokIdx = state.tokens.length;
  if (isOrdered) {
    token = state.push("ordered_list_open", "ol", 1);
    if (markerValue !== 1) {
      token.attrs = [["start", markerValue]];
    }
  } else {
    token = state.push("bullet_list_open", "ul", 1);
  }
  const listLines = [nextLine, 0];
  token.map = listLines;
  token.markup = String.fromCharCode(markerCharCode);
  let prevEmptyEnd = false;
  const terminatorRules = state.md.block.ruler.getRules("list");
  const oldParentType = state.parentType;
  state.parentType = "list";
  while (nextLine < endLine) {
    pos = posAfterMarker;
    max = state.eMarks[nextLine];
    const initial = state.sCount[nextLine] + posAfterMarker - (state.bMarks[nextLine] + state.tShift[nextLine]);
    let offset = initial;
    while (pos < max) {
      const ch = state.src.charCodeAt(pos);
      if (ch === 9) {
        offset += 4 - (offset + state.bsCount[nextLine]) % 4;
      } else if (ch === 32) {
        offset++;
      } else {
        break;
      }
      pos++;
    }
    const contentStart = pos;
    let indentAfterMarker;
    if (contentStart >= max) {
      indentAfterMarker = 1;
    } else {
      indentAfterMarker = offset - initial;
    }
    if (indentAfterMarker > 4) {
      indentAfterMarker = 1;
    }
    const indent = initial + indentAfterMarker;
    token = state.push("list_item_open", "li", 1);
    token.markup = String.fromCharCode(markerCharCode);
    const itemLines = [nextLine, 0];
    token.map = itemLines;
    if (isOrdered) {
      token.info = state.src.slice(start, posAfterMarker - 1);
    }
    const oldTight = state.tight;
    const oldTShift = state.tShift[nextLine];
    const oldSCount = state.sCount[nextLine];
    const oldListIndent = state.listIndent;
    state.listIndent = state.blkIndent;
    state.blkIndent = indent;
    state.tight = true;
    state.tShift[nextLine] = contentStart - state.bMarks[nextLine];
    state.sCount[nextLine] = offset;
    if (contentStart >= max && state.isEmpty(nextLine + 1)) {
      state.line = Math.min(state.line + 2, endLine);
    } else {
      state.md.block.tokenize(state, nextLine, endLine, true);
    }
    if (!state.tight || prevEmptyEnd) {
      tight = false;
    }
    prevEmptyEnd = state.line - nextLine > 1 && state.isEmpty(state.line - 1);
    state.blkIndent = state.listIndent;
    state.listIndent = oldListIndent;
    state.tShift[nextLine] = oldTShift;
    state.sCount[nextLine] = oldSCount;
    state.tight = oldTight;
    token = state.push("list_item_close", "li", -1);
    token.markup = String.fromCharCode(markerCharCode);
    nextLine = state.line;
    itemLines[1] = nextLine;
    if (nextLine >= endLine) {
      break;
    }
    if (state.sCount[nextLine] < state.blkIndent) {
      break;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      break;
    }
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      break;
    }
    if (isOrdered) {
      posAfterMarker = skipOrderedListMarker(state, nextLine);
      if (posAfterMarker < 0) {
        break;
      }
      start = state.bMarks[nextLine] + state.tShift[nextLine];
    } else {
      posAfterMarker = skipBulletListMarker(state, nextLine);
      if (posAfterMarker < 0) {
        break;
      }
    }
    if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) {
      break;
    }
  }
  if (isOrdered) {
    token = state.push("ordered_list_close", "ol", -1);
  } else {
    token = state.push("bullet_list_close", "ul", -1);
  }
  token.markup = String.fromCharCode(markerCharCode);
  listLines[1] = nextLine;
  state.line = nextLine;
  state.parentType = oldParentType;
  if (tight) {
    markTightParagraphs(state, listTokIdx);
  }
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/paragraph.mjs"
/*!********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/paragraph.mjs ***!
  \********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ paragraph)
/* harmony export */ });
function paragraph(state, startLine, endLine) {
  const terminatorRules = state.md.block.ruler.getRules("paragraph");
  const oldParentType = state.parentType;
  let nextLine = startLine + 1;
  state.parentType = "paragraph";
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    if (state.sCount[nextLine] - state.blkIndent > 3) {
      continue;
    }
    if (state.sCount[nextLine] < 0) {
      continue;
    }
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      break;
    }
  }
  const content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
  state.line = nextLine;
  const token_o = state.push("paragraph_open", "p", 1);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = content;
  token_i.map = [startLine, state.line];
  token_i.children = [];
  state.push("paragraph_close", "p", -1);
  state.parentType = oldParentType;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/reference.mjs"
/*!********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/reference.mjs ***!
  \********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ reference)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function reference(state, startLine, _endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  let nextLine = startLine + 1;
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  if (state.src.charCodeAt(pos) !== 91) {
    return false;
  }
  function getNextLine(nextLine2) {
    const endLine = state.lineMax;
    if (nextLine2 >= endLine || state.isEmpty(nextLine2)) {
      return null;
    }
    let isContinuation = false;
    if (state.sCount[nextLine2] - state.blkIndent > 3) {
      isContinuation = true;
    }
    if (state.sCount[nextLine2] < 0) {
      isContinuation = true;
    }
    if (!isContinuation) {
      const terminatorRules = state.md.block.ruler.getRules("reference");
      const oldParentType = state.parentType;
      state.parentType = "reference";
      let terminate = false;
      for (let i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine2, endLine, true)) {
          terminate = true;
          break;
        }
      }
      state.parentType = oldParentType;
      if (terminate) {
        return null;
      }
    }
    const pos2 = state.bMarks[nextLine2] + state.tShift[nextLine2];
    const max2 = state.eMarks[nextLine2];
    return state.src.slice(pos2, max2 + 1);
  }
  let str = state.src.slice(pos, max + 1);
  max = str.length;
  let labelEnd = -1;
  for (pos = 1; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 91) {
      return false;
    } else if (ch === 93) {
      labelEnd = pos;
      break;
    } else if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (ch === 92) {
      pos++;
      if (pos < max && str.charCodeAt(pos) === 10) {
        const lineContent = getNextLine(nextLine);
        if (lineContent !== null) {
          str += lineContent;
          max = str.length;
          nextLine++;
        }
      }
    }
  }
  if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 58) {
    return false;
  }
  for (pos = labelEnd + 2; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if ((0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch)) {
    } else {
      break;
    }
  }
  const destRes = state.md.helpers.parseLinkDestination(str, pos, max);
  if (!destRes.ok) {
    return false;
  }
  const href = state.md.normalizeLink(destRes.str);
  if (!state.md.validateLink(href)) {
    return false;
  }
  pos = destRes.pos;
  const destEndPos = pos;
  const destEndLineNo = nextLine;
  const start = pos;
  for (; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if ((0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch)) {
    } else {
      break;
    }
  }
  let titleRes = state.md.helpers.parseLinkTitle(str, pos, max);
  while (titleRes.can_continue) {
    const lineContent = getNextLine(nextLine);
    if (lineContent === null) break;
    str += lineContent;
    pos = max;
    max = str.length;
    nextLine++;
    titleRes = state.md.helpers.parseLinkTitle(str, pos, max, titleRes);
  }
  let title;
  if (pos < max && start !== pos && titleRes.ok) {
    title = titleRes.str;
    pos = titleRes.pos;
  } else {
    title = "";
    pos = destEndPos;
    nextLine = destEndLineNo;
  }
  while (pos < max) {
    const ch = str.charCodeAt(pos);
    if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch)) {
      break;
    }
    pos++;
  }
  if (pos < max && str.charCodeAt(pos) !== 10) {
    if (title) {
      title = "";
      pos = destEndPos;
      nextLine = destEndLineNo;
      while (pos < max) {
        const ch = str.charCodeAt(pos);
        if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch)) {
          break;
        }
        pos++;
      }
    }
  }
  if (pos < max && str.charCodeAt(pos) !== 10) {
    return false;
  }
  const label = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.normalizeReference)(str.slice(1, labelEnd));
  if (!label) {
    return false;
  }
  if (silent) {
    return true;
  }
  if (typeof state.env.references === "undefined") {
    state.env.references = {};
  }
  if (typeof state.env.references[label] === "undefined") {
    state.env.references[label] = { title, href };
  }
  state.line = nextLine;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/state_block.mjs"
/*!**********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/state_block.mjs ***!
  \**********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _token_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../token.mjs */ "../../node_modules/markdown-it/lib/token.mjs");
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");


function StateBlock(src, md, env, tokens) {
  this.src = src;
  this.md = md;
  this.env = env;
  this.tokens = tokens;
  this.bMarks = [];
  this.eMarks = [];
  this.tShift = [];
  this.sCount = [];
  this.bsCount = [];
  this.blkIndent = 0;
  this.line = 0;
  this.lineMax = 0;
  this.tight = false;
  this.ddIndent = -1;
  this.listIndent = -1;
  this.parentType = "root";
  this.level = 0;
  const s = this.src;
  for (let start = 0, pos = 0, indent = 0, offset = 0, len = s.length, indent_found = false; pos < len; pos++) {
    const ch = s.charCodeAt(pos);
    if (!indent_found) {
      if ((0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isSpace)(ch)) {
        indent++;
        if (ch === 9) {
          offset += 4 - offset % 4;
        } else {
          offset++;
        }
        continue;
      } else {
        indent_found = true;
      }
    }
    if (ch === 10 || pos === len - 1) {
      if (ch !== 10) {
        pos++;
      }
      this.bMarks.push(start);
      this.eMarks.push(pos);
      this.tShift.push(indent);
      this.sCount.push(offset);
      this.bsCount.push(0);
      indent_found = false;
      indent = 0;
      offset = 0;
      start = pos + 1;
    }
  }
  this.bMarks.push(s.length);
  this.eMarks.push(s.length);
  this.tShift.push(0);
  this.sCount.push(0);
  this.bsCount.push(0);
  this.lineMax = this.bMarks.length - 1;
}
StateBlock.prototype.push = function(type, tag, nesting) {
  const token = new _token_mjs__WEBPACK_IMPORTED_MODULE_0__["default"](type, tag, nesting);
  token.block = true;
  if (nesting < 0) this.level--;
  token.level = this.level;
  if (nesting > 0) this.level++;
  this.tokens.push(token);
  return token;
};
StateBlock.prototype.isEmpty = function isEmpty(line) {
  return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
};
StateBlock.prototype.skipEmptyLines = function skipEmptyLines(from) {
  for (let max = this.lineMax; from < max; from++) {
    if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) {
      break;
    }
  }
  return from;
};
StateBlock.prototype.skipSpaces = function skipSpaces(pos) {
  for (let max = this.src.length; pos < max; pos++) {
    const ch = this.src.charCodeAt(pos);
    if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isSpace)(ch)) {
      break;
    }
  }
  return pos;
};
StateBlock.prototype.skipSpacesBack = function skipSpacesBack(pos, min) {
  if (pos <= min) {
    return pos;
  }
  while (pos > min) {
    if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isSpace)(this.src.charCodeAt(--pos))) {
      return pos + 1;
    }
  }
  return pos;
};
StateBlock.prototype.skipChars = function skipChars(pos, code) {
  for (let max = this.src.length; pos < max; pos++) {
    if (this.src.charCodeAt(pos) !== code) {
      break;
    }
  }
  return pos;
};
StateBlock.prototype.skipCharsBack = function skipCharsBack(pos, code, min) {
  if (pos <= min) {
    return pos;
  }
  while (pos > min) {
    if (code !== this.src.charCodeAt(--pos)) {
      return pos + 1;
    }
  }
  return pos;
};
StateBlock.prototype.getLines = function getLines(begin, end, indent, keepLastLF) {
  if (begin >= end) {
    return "";
  }
  const queue = new Array(end - begin);
  for (let i = 0, line = begin; line < end; line++, i++) {
    let lineIndent = 0;
    const lineStart = this.bMarks[line];
    let first = lineStart;
    let last;
    if (line + 1 < end || keepLastLF) {
      last = this.eMarks[line] + 1;
    } else {
      last = this.eMarks[line];
    }
    while (first < last && lineIndent < indent) {
      const ch = this.src.charCodeAt(first);
      if ((0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isSpace)(ch)) {
        if (ch === 9) {
          lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
        } else {
          lineIndent++;
        }
      } else if (first - lineStart < this.tShift[line]) {
        lineIndent++;
      } else {
        break;
      }
      first++;
    }
    if (lineIndent > indent) {
      queue[i] = new Array(lineIndent - indent + 1).join(" ") + this.src.slice(first, last);
    } else {
      queue[i] = this.src.slice(first, last);
    }
  }
  return queue.join("");
};
StateBlock.prototype.Token = _token_mjs__WEBPACK_IMPORTED_MODULE_0__["default"];
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (StateBlock);


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_block/table.mjs"
/*!****************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_block/table.mjs ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ table)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

const MAX_AUTOCOMPLETED_CELLS = 65536;
function getLine(state, line) {
  const pos = state.bMarks[line] + state.tShift[line];
  const max = state.eMarks[line];
  return state.src.slice(pos, max);
}
function escapedSplit(str) {
  const result = [];
  const max = str.length;
  let pos = 0;
  let ch = str.charCodeAt(pos);
  let isEscaped = false;
  let lastPos = 0;
  let current = "";
  while (pos < max) {
    if (ch === 124) {
      if (!isEscaped) {
        result.push(current + str.substring(lastPos, pos));
        current = "";
        lastPos = pos + 1;
      } else {
        current += str.substring(lastPos, pos - 1);
        lastPos = pos;
      }
    }
    isEscaped = ch === 92;
    pos++;
    ch = str.charCodeAt(pos);
  }
  result.push(current + str.substring(lastPos));
  return result;
}
function table(state, startLine, endLine, silent) {
  if (startLine + 2 > endLine) {
    return false;
  }
  let nextLine = startLine + 1;
  if (state.sCount[nextLine] < state.blkIndent) {
    return false;
  }
  if (state.sCount[nextLine] - state.blkIndent >= 4) {
    return false;
  }
  let pos = state.bMarks[nextLine] + state.tShift[nextLine];
  if (pos >= state.eMarks[nextLine]) {
    return false;
  }
  const firstCh = state.src.charCodeAt(pos++);
  if (firstCh !== 124 && firstCh !== 45 && firstCh !== 58) {
    return false;
  }
  if (pos >= state.eMarks[nextLine]) {
    return false;
  }
  const secondCh = state.src.charCodeAt(pos++);
  if (secondCh !== 124 && secondCh !== 45 && secondCh !== 58 && !(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(secondCh)) {
    return false;
  }
  if (firstCh === 45 && (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(secondCh)) {
    return false;
  }
  while (pos < state.eMarks[nextLine]) {
    const ch = state.src.charCodeAt(pos);
    if (ch !== 124 && ch !== 45 && ch !== 58 && !(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch)) {
      return false;
    }
    pos++;
  }
  let lineText = getLine(state, startLine + 1);
  let columns = lineText.split("|");
  const aligns = [];
  for (let i = 0; i < columns.length; i++) {
    const t = columns[i].trim();
    if (!t) {
      if (i === 0 || i === columns.length - 1) {
        continue;
      } else {
        return false;
      }
    }
    if (!/^:?-+:?$/.test(t)) {
      return false;
    }
    if (t.charCodeAt(t.length - 1) === 58) {
      aligns.push(t.charCodeAt(0) === 58 ? "center" : "right");
    } else if (t.charCodeAt(0) === 58) {
      aligns.push("left");
    } else {
      aligns.push("");
    }
  }
  lineText = getLine(state, startLine).trim();
  if (lineText.indexOf("|") === -1) {
    return false;
  }
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  columns = escapedSplit(lineText);
  if (columns.length && columns[0] === "") columns.shift();
  if (columns.length && columns[columns.length - 1] === "") columns.pop();
  const columnCount = columns.length;
  if (columnCount === 0 || columnCount !== aligns.length) {
    return false;
  }
  if (silent) {
    return true;
  }
  const oldParentType = state.parentType;
  state.parentType = "table";
  const terminatorRules = state.md.block.ruler.getRules("blockquote");
  const token_to = state.push("table_open", "table", 1);
  const tableLines = [startLine, 0];
  token_to.map = tableLines;
  const token_tho = state.push("thead_open", "thead", 1);
  token_tho.map = [startLine, startLine + 1];
  const token_htro = state.push("tr_open", "tr", 1);
  token_htro.map = [startLine, startLine + 1];
  for (let i = 0; i < columns.length; i++) {
    const token_ho = state.push("th_open", "th", 1);
    if (aligns[i]) {
      token_ho.attrs = [["style", "text-align:" + aligns[i]]];
    }
    const token_il = state.push("inline", "", 0);
    token_il.content = columns[i].trim();
    token_il.children = [];
    state.push("th_close", "th", -1);
  }
  state.push("tr_close", "tr", -1);
  state.push("thead_close", "thead", -1);
  let tbodyLines;
  let autocompletedCells = 0;
  for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
    if (state.sCount[nextLine] < state.blkIndent) {
      break;
    }
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      break;
    }
    lineText = getLine(state, nextLine).trim();
    if (!lineText) {
      break;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      break;
    }
    columns = escapedSplit(lineText);
    if (columns.length && columns[0] === "") columns.shift();
    if (columns.length && columns[columns.length - 1] === "") columns.pop();
    autocompletedCells += columnCount - columns.length;
    if (autocompletedCells > MAX_AUTOCOMPLETED_CELLS) {
      break;
    }
    if (nextLine === startLine + 2) {
      const token_tbo = state.push("tbody_open", "tbody", 1);
      token_tbo.map = tbodyLines = [startLine + 2, 0];
    }
    const token_tro = state.push("tr_open", "tr", 1);
    token_tro.map = [nextLine, nextLine + 1];
    for (let i = 0; i < columnCount; i++) {
      const token_tdo = state.push("td_open", "td", 1);
      if (aligns[i]) {
        token_tdo.attrs = [["style", "text-align:" + aligns[i]]];
      }
      const token_il = state.push("inline", "", 0);
      token_il.content = columns[i] ? columns[i].trim() : "";
      token_il.children = [];
      state.push("td_close", "td", -1);
    }
    state.push("tr_close", "tr", -1);
  }
  if (tbodyLines) {
    state.push("tbody_close", "tbody", -1);
    tbodyLines[1] = nextLine;
  }
  state.push("table_close", "table", -1);
  tableLines[1] = nextLine;
  state.parentType = oldParentType;
  state.line = nextLine;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_core/block.mjs"
/*!***************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_core/block.mjs ***!
  \***************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ block)
/* harmony export */ });
function block(state) {
  let token;
  if (state.inlineMode) {
    token = new state.Token("inline", "", 0);
    token.content = state.src;
    token.map = [0, 1];
    token.children = [];
    state.tokens.push(token);
  } else {
    state.md.block.parse(state.src, state.md, state.env, state.tokens);
  }
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_core/inline.mjs"
/*!****************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_core/inline.mjs ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ inline)
/* harmony export */ });
function inline(state) {
  const tokens = state.tokens;
  for (let i = 0, l = tokens.length; i < l; i++) {
    const tok = tokens[i];
    if (tok.type === "inline") {
      state.md.inline.parse(tok.content, state.md, state.env, tok.children);
    }
  }
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_core/linkify.mjs"
/*!*****************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_core/linkify.mjs ***!
  \*****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ linkify)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function isLinkOpen(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose(str) {
  return /^<\/a\s*>/i.test(str);
}
function linkify(state) {
  const blockTokens = state.tokens;
  if (!state.md.options.linkify) {
    return;
  }
  for (let j = 0, l = blockTokens.length; j < l; j++) {
    if (blockTokens[j].type !== "inline" || !state.md.linkify.pretest(blockTokens[j].content)) {
      continue;
    }
    let tokens = blockTokens[j].children;
    let htmlLinkLevel = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const currentToken = tokens[i];
      if (currentToken.type === "link_close") {
        i--;
        while (tokens[i].level !== currentToken.level && tokens[i].type !== "link_open") {
          i--;
        }
        continue;
      }
      if (currentToken.type === "html_inline") {
        if (isLinkOpen(currentToken.content) && htmlLinkLevel > 0) {
          htmlLinkLevel--;
        }
        if (isLinkClose(currentToken.content)) {
          htmlLinkLevel++;
        }
      }
      if (htmlLinkLevel > 0) {
        continue;
      }
      if (currentToken.type === "text" && state.md.linkify.test(currentToken.content)) {
        const text = currentToken.content;
        let links = state.md.linkify.match(text);
        const nodes = [];
        let level = currentToken.level;
        let lastPos = 0;
        if (links.length > 0 && links[0].index === 0 && i > 0 && tokens[i - 1].type === "text_special") {
          links = links.slice(1);
        }
        for (let ln = 0; ln < links.length; ln++) {
          const url = links[ln].url;
          const fullUrl = state.md.normalizeLink(url);
          if (!state.md.validateLink(fullUrl)) {
            continue;
          }
          let urlText = links[ln].text;
          if (!links[ln].schema) {
            urlText = state.md.normalizeLinkText("http://" + urlText).replace(/^http:\/\//, "");
          } else if (links[ln].schema === "mailto:" && !/^mailto:/i.test(urlText)) {
            urlText = state.md.normalizeLinkText("mailto:" + urlText).replace(/^mailto:/, "");
          } else {
            urlText = state.md.normalizeLinkText(urlText);
          }
          const pos = links[ln].index;
          if (pos > lastPos) {
            const token = new state.Token("text", "", 0);
            token.content = text.slice(lastPos, pos);
            token.level = level;
            nodes.push(token);
          }
          const token_o = new state.Token("link_open", "a", 1);
          token_o.attrs = [["href", fullUrl]];
          token_o.level = level++;
          token_o.markup = "linkify";
          token_o.info = "auto";
          nodes.push(token_o);
          const token_t = new state.Token("text", "", 0);
          token_t.content = urlText;
          token_t.level = level;
          nodes.push(token_t);
          const token_c = new state.Token("link_close", "a", -1);
          token_c.level = --level;
          token_c.markup = "linkify";
          token_c.info = "auto";
          nodes.push(token_c);
          lastPos = links[ln].lastIndex;
        }
        if (lastPos < text.length) {
          const token = new state.Token("text", "", 0);
          token.content = text.slice(lastPos);
          token.level = level;
          nodes.push(token);
        }
        blockTokens[j].children = tokens = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.arrayReplaceAt)(tokens, i, nodes);
      }
    }
  }
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_core/normalize.mjs"
/*!*******************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_core/normalize.mjs ***!
  \*******************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ normalize)
/* harmony export */ });
const NEWLINES_RE = /\r\n?|\n/g;
const NULL_RE = /\0/g;
function normalize(state) {
  let str;
  str = state.src.replace(NEWLINES_RE, "\n");
  str = str.replace(NULL_RE, "\uFFFD");
  state.src = str;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_core/replacements.mjs"
/*!**********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_core/replacements.mjs ***!
  \**********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ replace)
/* harmony export */ });
const RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;
const SCOPED_ABBR_TEST_RE = /\((c|tm|r)\)/i;
const SCOPED_ABBR_RE = /\((c|tm|r)\)/ig;
const SCOPED_ABBR = {
  c: "\xA9",
  r: "\xAE",
  tm: "\u2122"
};
function replaceFn(match, name) {
  return SCOPED_ABBR[name.toLowerCase()];
}
function replace_scoped(inlineTokens) {
  let inside_autolink = 0;
  for (let i = inlineTokens.length - 1; i >= 0; i--) {
    const token = inlineTokens[i];
    if (token.type === "text" && !inside_autolink) {
      token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
    }
    if (token.type === "link_open" && token.info === "auto") {
      inside_autolink--;
    }
    if (token.type === "link_close" && token.info === "auto") {
      inside_autolink++;
    }
  }
}
function replace_rare(inlineTokens) {
  let inside_autolink = 0;
  for (let i = inlineTokens.length - 1; i >= 0; i--) {
    const token = inlineTokens[i];
    if (token.type === "text" && !inside_autolink) {
      if (RARE_RE.test(token.content)) {
        token.content = token.content.replace(/\+-/g, "\xB1").replace(/\.{2,}/g, "\u2026").replace(/([?!])…/g, "$1..").replace(/([?!]){4,}/g, "$1$1$1").replace(/,{2,}/g, ",").replace(/(^|[^-])---(?=[^-]|$)/mg, "$1\u2014").replace(/(^|\s)--(?=\s|$)/mg, "$1\u2013").replace(/(^|[^-\s])--(?=[^-\s]|$)/mg, "$1\u2013");
      }
    }
    if (token.type === "link_open" && token.info === "auto") {
      inside_autolink--;
    }
    if (token.type === "link_close" && token.info === "auto") {
      inside_autolink++;
    }
  }
}
function replace(state) {
  let blkIdx;
  if (!state.md.options.typographer) {
    return;
  }
  for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== "inline") {
      continue;
    }
    if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) {
      replace_scoped(state.tokens[blkIdx].children);
    }
    if (RARE_RE.test(state.tokens[blkIdx].content)) {
      replace_rare(state.tokens[blkIdx].children);
    }
  }
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_core/smartquotes.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_core/smartquotes.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ smartquotes)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

const QUOTE_TEST_RE = /['"]/;
const QUOTE_RE = /['"]/g;
const APOSTROPHE = "\u2019";
function replaceAt(str, index, ch) {
  return str.slice(0, index) + ch + str.slice(index + 1);
}
function process_inlines(tokens, state) {
  let j;
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const thisLevel = tokens[i].level;
    for (j = stack.length - 1; j >= 0; j--) {
      if (stack[j].level <= thisLevel) {
        break;
      }
    }
    stack.length = j + 1;
    if (token.type !== "text") {
      continue;
    }
    let text = token.content;
    let pos = 0;
    let max = text.length;
    OUTER:
      while (pos < max) {
        QUOTE_RE.lastIndex = pos;
        const t = QUOTE_RE.exec(text);
        if (!t) {
          break;
        }
        let canOpen = true;
        let canClose = true;
        pos = t.index + 1;
        const isSingle = t[0] === "'";
        let lastChar = 32;
        if (t.index - 1 >= 0) {
          lastChar = text.charCodeAt(t.index - 1);
        } else {
          for (j = i - 1; j >= 0; j--) {
            if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
            if (!tokens[j].content) continue;
            lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
            break;
          }
        }
        let nextChar = 32;
        if (pos < max) {
          nextChar = text.charCodeAt(pos);
        } else {
          for (j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
            if (!tokens[j].content) continue;
            nextChar = tokens[j].content.charCodeAt(0);
            break;
          }
        }
        const isLastPunctChar = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isMdAsciiPunct)(lastChar) || (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isPunctChar)(String.fromCharCode(lastChar));
        const isNextPunctChar = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isMdAsciiPunct)(nextChar) || (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isPunctChar)(String.fromCharCode(nextChar));
        const isLastWhiteSpace = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isWhiteSpace)(lastChar);
        const isNextWhiteSpace = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isWhiteSpace)(nextChar);
        if (isNextWhiteSpace) {
          canOpen = false;
        } else if (isNextPunctChar) {
          if (!(isLastWhiteSpace || isLastPunctChar)) {
            canOpen = false;
          }
        }
        if (isLastWhiteSpace) {
          canClose = false;
        } else if (isLastPunctChar) {
          if (!(isNextWhiteSpace || isNextPunctChar)) {
            canClose = false;
          }
        }
        if (nextChar === 34 && t[0] === '"') {
          if (lastChar >= 48 && lastChar <= 57) {
            canClose = canOpen = false;
          }
        }
        if (canOpen && canClose) {
          canOpen = isLastPunctChar;
          canClose = isNextPunctChar;
        }
        if (!canOpen && !canClose) {
          if (isSingle) {
            token.content = replaceAt(token.content, t.index, APOSTROPHE);
          }
          continue;
        }
        if (canClose) {
          for (j = stack.length - 1; j >= 0; j--) {
            let item = stack[j];
            if (stack[j].level < thisLevel) {
              break;
            }
            if (item.single === isSingle && stack[j].level === thisLevel) {
              item = stack[j];
              let openQuote;
              let closeQuote;
              if (isSingle) {
                openQuote = state.md.options.quotes[2];
                closeQuote = state.md.options.quotes[3];
              } else {
                openQuote = state.md.options.quotes[0];
                closeQuote = state.md.options.quotes[1];
              }
              token.content = replaceAt(token.content, t.index, closeQuote);
              tokens[item.token].content = replaceAt(
                tokens[item.token].content,
                item.pos,
                openQuote
              );
              pos += closeQuote.length - 1;
              if (item.token === i) {
                pos += openQuote.length - 1;
              }
              text = token.content;
              max = text.length;
              stack.length = j;
              continue OUTER;
            }
          }
        }
        if (canOpen) {
          stack.push({
            token: i,
            pos: t.index,
            single: isSingle,
            level: thisLevel
          });
        } else if (canClose && isSingle) {
          token.content = replaceAt(token.content, t.index, APOSTROPHE);
        }
      }
  }
}
function smartquotes(state) {
  if (!state.md.options.typographer) {
    return;
  }
  for (let blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== "inline" || !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) {
      continue;
    }
    process_inlines(state.tokens[blkIdx].children, state);
  }
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_core/state_core.mjs"
/*!********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_core/state_core.mjs ***!
  \********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _token_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../token.mjs */ "../../node_modules/markdown-it/lib/token.mjs");

function StateCore(src, md, env) {
  this.src = src;
  this.env = env;
  this.tokens = [];
  this.inlineMode = false;
  this.md = md;
}
StateCore.prototype.Token = _token_mjs__WEBPACK_IMPORTED_MODULE_0__["default"];
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (StateCore);


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_core/text_join.mjs"
/*!*******************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_core/text_join.mjs ***!
  \*******************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ text_join)
/* harmony export */ });
function text_join(state) {
  let curr, last;
  const blockTokens = state.tokens;
  const l = blockTokens.length;
  for (let j = 0; j < l; j++) {
    if (blockTokens[j].type !== "inline") continue;
    const tokens = blockTokens[j].children;
    const max = tokens.length;
    for (curr = 0; curr < max; curr++) {
      if (tokens[curr].type === "text_special") {
        tokens[curr].type = "text";
      }
    }
    for (curr = last = 0; curr < max; curr++) {
      if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") {
        tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
      } else {
        if (curr !== last) {
          tokens[last] = tokens[curr];
        }
        last++;
      }
    }
    if (curr !== last) {
      tokens.length = last;
    }
  }
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/autolink.mjs"
/*!********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/autolink.mjs ***!
  \********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ autolink)
/* harmony export */ });
const EMAIL_RE = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
const AUTOLINK_RE = /^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/;
function autolink(state, silent) {
  let pos = state.pos;
  if (state.src.charCodeAt(pos) !== 60) {
    return false;
  }
  const start = state.pos;
  const max = state.posMax;
  for (; ; ) {
    if (++pos >= max) return false;
    const ch = state.src.charCodeAt(pos);
    if (ch === 60) return false;
    if (ch === 62) break;
  }
  const url = state.src.slice(start + 1, pos);
  if (AUTOLINK_RE.test(url)) {
    const fullUrl = state.md.normalizeLink(url);
    if (!state.md.validateLink(fullUrl)) {
      return false;
    }
    if (!silent) {
      const token_o = state.push("link_open", "a", 1);
      token_o.attrs = [["href", fullUrl]];
      token_o.markup = "autolink";
      token_o.info = "auto";
      const token_t = state.push("text", "", 0);
      token_t.content = state.md.normalizeLinkText(url);
      const token_c = state.push("link_close", "a", -1);
      token_c.markup = "autolink";
      token_c.info = "auto";
    }
    state.pos += url.length + 2;
    return true;
  }
  if (EMAIL_RE.test(url)) {
    const fullUrl = state.md.normalizeLink("mailto:" + url);
    if (!state.md.validateLink(fullUrl)) {
      return false;
    }
    if (!silent) {
      const token_o = state.push("link_open", "a", 1);
      token_o.attrs = [["href", fullUrl]];
      token_o.markup = "autolink";
      token_o.info = "auto";
      const token_t = state.push("text", "", 0);
      token_t.content = state.md.normalizeLinkText(url);
      const token_c = state.push("link_close", "a", -1);
      token_c.markup = "autolink";
      token_c.info = "auto";
    }
    state.pos += url.length + 2;
    return true;
  }
  return false;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/backticks.mjs"
/*!*********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/backticks.mjs ***!
  \*********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ backtick)
/* harmony export */ });
function backtick(state, silent) {
  let pos = state.pos;
  const ch = state.src.charCodeAt(pos);
  if (ch !== 96) {
    return false;
  }
  const start = pos;
  pos++;
  const max = state.posMax;
  while (pos < max && state.src.charCodeAt(pos) === 96) {
    pos++;
  }
  const marker = state.src.slice(start, pos);
  const openerLength = marker.length;
  if (state.backticksScanned && (state.backticks[openerLength] || 0) <= start) {
    if (!silent) state.pending += marker;
    state.pos += openerLength;
    return true;
  }
  let matchEnd = pos;
  let matchStart;
  while ((matchStart = state.src.indexOf("`", matchEnd)) !== -1) {
    matchEnd = matchStart + 1;
    while (matchEnd < max && state.src.charCodeAt(matchEnd) === 96) {
      matchEnd++;
    }
    const closerLength = matchEnd - matchStart;
    if (closerLength === openerLength) {
      if (!silent) {
        const token = state.push("code_inline", "code", 0);
        token.markup = marker;
        token.content = state.src.slice(pos, matchStart).replace(/\n/g, " ").replace(/^ (.+) $/, "$1");
      }
      state.pos = matchEnd;
      return true;
    }
    state.backticks[closerLength] = matchStart;
  }
  state.backticksScanned = true;
  if (!silent) state.pending += marker;
  state.pos += openerLength;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/balance_pairs.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/balance_pairs.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ link_pairs)
/* harmony export */ });
function processDelimiters(delimiters) {
  const openersBottom = {};
  const max = delimiters.length;
  if (!max) return;
  let headerIdx = 0;
  let lastTokenIdx = -2;
  const jumps = [];
  for (let closerIdx = 0; closerIdx < max; closerIdx++) {
    const closer = delimiters[closerIdx];
    jumps.push(0);
    if (delimiters[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) {
      headerIdx = closerIdx;
    }
    lastTokenIdx = closer.token;
    closer.length = closer.length || 0;
    if (!closer.close) continue;
    if (!openersBottom.hasOwnProperty(closer.marker)) {
      openersBottom[closer.marker] = [-1, -1, -1, -1, -1, -1];
    }
    const minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + closer.length % 3];
    let openerIdx = headerIdx - jumps[headerIdx] - 1;
    let newMinOpenerIdx = openerIdx;
    for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
      const opener = delimiters[openerIdx];
      if (opener.marker !== closer.marker) continue;
      if (opener.open && opener.end < 0) {
        let isOddMatch = false;
        if (opener.close || closer.open) {
          if ((opener.length + closer.length) % 3 === 0) {
            if (opener.length % 3 !== 0 || closer.length % 3 !== 0) {
              isOddMatch = true;
            }
          }
        }
        if (!isOddMatch) {
          const lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0;
          jumps[closerIdx] = closerIdx - openerIdx + lastJump;
          jumps[openerIdx] = lastJump;
          closer.open = false;
          opener.end = closerIdx;
          opener.close = false;
          newMinOpenerIdx = -1;
          lastTokenIdx = -2;
          break;
        }
      }
    }
    if (newMinOpenerIdx !== -1) {
      openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length || 0) % 3] = newMinOpenerIdx;
    }
  }
}
function link_pairs(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  processDelimiters(state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      processDelimiters(tokens_meta[curr].delimiters);
    }
  }
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/emphasis.mjs"
/*!********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/emphasis.mjs ***!
  \********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
function emphasis_tokenize(state, silent) {
  const start = state.pos;
  const marker = state.src.charCodeAt(start);
  if (silent) {
    return false;
  }
  if (marker !== 95 && marker !== 42) {
    return false;
  }
  const scanned = state.scanDelims(state.pos, marker === 42);
  for (let i = 0; i < scanned.length; i++) {
    const token = state.push("text", "", 0);
    token.content = String.fromCharCode(marker);
    state.delimiters.push({
      // Char code of the starting marker (number).
      //
      marker,
      // Total length of these series of delimiters.
      //
      length: scanned.length,
      // A position of the token this delimiter corresponds to.
      //
      token: state.tokens.length - 1,
      // If this delimiter is matched as a valid opener, `end` will be
      // equal to its position, otherwise it's `-1`.
      //
      end: -1,
      // Boolean flags that determine if this delimiter could open or close
      // an emphasis.
      //
      open: scanned.can_open,
      close: scanned.can_close
    });
  }
  state.pos += scanned.length;
  return true;
}
function postProcess(state, delimiters) {
  const max = delimiters.length;
  for (let i = max - 1; i >= 0; i--) {
    const startDelim = delimiters[i];
    if (startDelim.marker !== 95 && startDelim.marker !== 42) {
      continue;
    }
    if (startDelim.end === -1) {
      continue;
    }
    const endDelim = delimiters[startDelim.end];
    const isStrong = i > 0 && delimiters[i - 1].end === startDelim.end + 1 && // check that first two markers match and adjacent
    delimiters[i - 1].marker === startDelim.marker && delimiters[i - 1].token === startDelim.token - 1 && // check that last two markers are adjacent (we can safely assume they match)
    delimiters[startDelim.end + 1].token === endDelim.token + 1;
    const ch = String.fromCharCode(startDelim.marker);
    const token_o = state.tokens[startDelim.token];
    token_o.type = isStrong ? "strong_open" : "em_open";
    token_o.tag = isStrong ? "strong" : "em";
    token_o.nesting = 1;
    token_o.markup = isStrong ? ch + ch : ch;
    token_o.content = "";
    const token_c = state.tokens[endDelim.token];
    token_c.type = isStrong ? "strong_close" : "em_close";
    token_c.tag = isStrong ? "strong" : "em";
    token_c.nesting = -1;
    token_c.markup = isStrong ? ch + ch : ch;
    token_c.content = "";
    if (isStrong) {
      state.tokens[delimiters[i - 1].token].content = "";
      state.tokens[delimiters[startDelim.end + 1].token].content = "";
      i--;
    }
  }
}
function emphasis_post_process(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  postProcess(state, state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      postProcess(state, tokens_meta[curr].delimiters);
    }
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  tokenize: emphasis_tokenize,
  postProcess: emphasis_post_process
});


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/entity.mjs"
/*!******************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/entity.mjs ***!
  \******************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ entity)
/* harmony export */ });
/* harmony import */ var entities__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! entities */ "../../node_modules/entities/lib/esm/index.js");
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");


const DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
const NAMED_RE = /^&([a-z][a-z0-9]{1,31});/i;
function entity(state, silent) {
  const pos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(pos) !== 38) return false;
  if (pos + 1 >= max) return false;
  const ch = state.src.charCodeAt(pos + 1);
  if (ch === 35) {
    const match = state.src.slice(pos).match(DIGITAL_RE);
    if (match) {
      if (!silent) {
        const code = match[1][0].toLowerCase() === "x" ? parseInt(match[1].slice(1), 16) : parseInt(match[1], 10);
        const token = state.push("text_special", "", 0);
        token.content = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isValidEntityCode)(code) ? (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.fromCodePoint)(code) : (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.fromCodePoint)(65533);
        token.markup = match[0];
        token.info = "entity";
      }
      state.pos += match[0].length;
      return true;
    }
  } else {
    const match = state.src.slice(pos).match(NAMED_RE);
    if (match) {
      const decoded = (0,entities__WEBPACK_IMPORTED_MODULE_0__.decodeHTML)(match[0]);
      if (decoded !== match[0]) {
        if (!silent) {
          const token = state.push("text_special", "", 0);
          token.content = decoded;
          token.markup = match[0];
          token.info = "entity";
        }
        state.pos += match[0].length;
        return true;
      }
    }
  }
  return false;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/escape.mjs"
/*!******************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/escape.mjs ***!
  \******************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ escape)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

const ESCAPED = [];
for (let i = 0; i < 256; i++) {
  ESCAPED.push(0);
}
"\\!\"#$%&'()*+,./:;<=>?@[]^_`{|}~-".split("").forEach(function(ch) {
  ESCAPED[ch.charCodeAt(0)] = 1;
});
function escape(state, silent) {
  let pos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(pos) !== 92) return false;
  pos++;
  if (pos >= max) return false;
  let ch1 = state.src.charCodeAt(pos);
  if (ch1 === 10) {
    if (!silent) {
      state.push("hardbreak", "br", 0);
    }
    pos++;
    while (pos < max) {
      ch1 = state.src.charCodeAt(pos);
      if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(ch1)) break;
      pos++;
    }
    state.pos = pos;
    return true;
  }
  let escapedStr = state.src[pos];
  if (ch1 >= 55296 && ch1 <= 56319 && pos + 1 < max) {
    const ch2 = state.src.charCodeAt(pos + 1);
    if (ch2 >= 56320 && ch2 <= 57343) {
      escapedStr += state.src[pos + 1];
      pos++;
    }
  }
  const origStr = "\\" + escapedStr;
  if (!silent) {
    const token = state.push("text_special", "", 0);
    if (ch1 < 256 && ESCAPED[ch1] !== 0) {
      token.content = escapedStr;
    } else {
      token.content = origStr;
    }
    token.markup = origStr;
    token.info = "escape";
  }
  state.pos = pos + 1;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/fragments_join.mjs"
/*!**************************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/fragments_join.mjs ***!
  \**************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ fragments_join)
/* harmony export */ });
function fragments_join(state) {
  let curr, last;
  let level = 0;
  const tokens = state.tokens;
  const max = state.tokens.length;
  for (curr = last = 0; curr < max; curr++) {
    if (tokens[curr].nesting < 0) level--;
    tokens[curr].level = level;
    if (tokens[curr].nesting > 0) level++;
    if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") {
      tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
    } else {
      if (curr !== last) {
        tokens[last] = tokens[curr];
      }
      last++;
    }
  }
  if (curr !== last) {
    tokens.length = last;
  }
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/html_inline.mjs"
/*!***********************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/html_inline.mjs ***!
  \***********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ html_inline)
/* harmony export */ });
/* harmony import */ var _common_html_re_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/html_re.mjs */ "../../node_modules/markdown-it/lib/common/html_re.mjs");

function isLinkOpen(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose(str) {
  return /^<\/a\s*>/i.test(str);
}
function isLetter(ch) {
  const lc = ch | 32;
  return lc >= 97 && lc <= 122;
}
function html_inline(state, silent) {
  if (!state.md.options.html) {
    return false;
  }
  const max = state.posMax;
  const pos = state.pos;
  if (state.src.charCodeAt(pos) !== 60 || pos + 2 >= max) {
    return false;
  }
  const ch = state.src.charCodeAt(pos + 1);
  if (ch !== 33 && ch !== 63 && ch !== 47 && !isLetter(ch)) {
    return false;
  }
  const match = state.src.slice(pos).match(_common_html_re_mjs__WEBPACK_IMPORTED_MODULE_0__.HTML_TAG_RE);
  if (!match) {
    return false;
  }
  if (!silent) {
    const token = state.push("html_inline", "", 0);
    token.content = match[0];
    if (isLinkOpen(token.content)) state.linkLevel++;
    if (isLinkClose(token.content)) state.linkLevel--;
  }
  state.pos += match[0].length;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/image.mjs"
/*!*****************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/image.mjs ***!
  \*****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ image)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function image(state, silent) {
  let code, content, label, pos, ref, res, title, start;
  let href = "";
  const oldPos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(state.pos) !== 33) {
    return false;
  }
  if (state.src.charCodeAt(state.pos + 1) !== 91) {
    return false;
  }
  const labelStart = state.pos + 2;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);
  if (labelEnd < 0) {
    return false;
  }
  pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 40) {
    pos++;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(code) && code !== 10) {
        break;
      }
    }
    if (pos >= max) {
      return false;
    }
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) {
        pos = res.pos;
      } else {
        href = "";
      }
    }
    start = pos;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(code) && code !== 10) {
        break;
      }
    }
    res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
    if (pos < max && start !== pos && res.ok) {
      title = res.str;
      pos = res.pos;
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(code) && code !== 10) {
          break;
        }
      }
    } else {
      title = "";
    }
    if (pos >= max || state.src.charCodeAt(pos) !== 41) {
      state.pos = oldPos;
      return false;
    }
    pos++;
  } else {
    if (typeof state.env.references === "undefined") {
      return false;
    }
    if (pos < max && state.src.charCodeAt(pos) === 91) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) {
        label = state.src.slice(start, pos++);
      } else {
        pos = labelEnd + 1;
      }
    } else {
      pos = labelEnd + 1;
    }
    if (!label) {
      label = state.src.slice(labelStart, labelEnd);
    }
    ref = state.env.references[(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.normalizeReference)(label)];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }
  if (!silent) {
    content = state.src.slice(labelStart, labelEnd);
    const tokens = [];
    state.md.inline.parse(
      content,
      state.md,
      state.env,
      tokens
    );
    const token = state.push("image", "img", 0);
    const attrs = [["src", href], ["alt", ""]];
    token.attrs = attrs;
    token.children = tokens;
    token.content = content;
    if (title) {
      attrs.push(["title", title]);
    }
  }
  state.pos = pos;
  state.posMax = max;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/link.mjs"
/*!****************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/link.mjs ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ link)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function link(state, silent) {
  let code, label, res, ref;
  let href = "";
  let title = "";
  let start = state.pos;
  let parseReference = true;
  if (state.src.charCodeAt(state.pos) !== 91) {
    return false;
  }
  const oldPos = state.pos;
  const max = state.posMax;
  const labelStart = state.pos + 1;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);
  if (labelEnd < 0) {
    return false;
  }
  let pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 40) {
    parseReference = false;
    pos++;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(code) && code !== 10) {
        break;
      }
    }
    if (pos >= max) {
      return false;
    }
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) {
        pos = res.pos;
      } else {
        href = "";
      }
      start = pos;
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(code) && code !== 10) {
          break;
        }
      }
      res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;
        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);
          if (!(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(code) && code !== 10) {
            break;
          }
        }
      }
    }
    if (pos >= max || state.src.charCodeAt(pos) !== 41) {
      parseReference = true;
    }
    pos++;
  }
  if (parseReference) {
    if (typeof state.env.references === "undefined") {
      return false;
    }
    if (pos < max && state.src.charCodeAt(pos) === 91) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) {
        label = state.src.slice(start, pos++);
      } else {
        pos = labelEnd + 1;
      }
    } else {
      pos = labelEnd + 1;
    }
    if (!label) {
      label = state.src.slice(labelStart, labelEnd);
    }
    ref = state.env.references[(0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.normalizeReference)(label)];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }
  if (!silent) {
    state.pos = labelStart;
    state.posMax = labelEnd;
    const token_o = state.push("link_open", "a", 1);
    const attrs = [["href", href]];
    token_o.attrs = attrs;
    if (title) {
      attrs.push(["title", title]);
    }
    state.linkLevel++;
    state.md.inline.tokenize(state);
    state.linkLevel--;
    state.push("link_close", "a", -1);
  }
  state.pos = pos;
  state.posMax = max;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/linkify.mjs"
/*!*******************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/linkify.mjs ***!
  \*******************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ linkify)
/* harmony export */ });
const SCHEME_RE = /(?:^|[^a-z0-9.+-])([a-z][a-z0-9.+-]*)$/i;
function linkify(state, silent) {
  if (!state.md.options.linkify) return false;
  if (state.linkLevel > 0) return false;
  const pos = state.pos;
  const max = state.posMax;
  if (pos + 3 > max) return false;
  if (state.src.charCodeAt(pos) !== 58) return false;
  if (state.src.charCodeAt(pos + 1) !== 47) return false;
  if (state.src.charCodeAt(pos + 2) !== 47) return false;
  const match = state.pending.match(SCHEME_RE);
  if (!match) return false;
  const proto = match[1];
  const link = state.md.linkify.matchAtStart(state.src.slice(pos - proto.length));
  if (!link) return false;
  let url = link.url;
  if (url.length <= proto.length) return false;
  let urlEnd = url.length;
  while (urlEnd > 0 && url.charCodeAt(urlEnd - 1) === 42) {
    urlEnd--;
  }
  if (urlEnd !== url.length) {
    url = url.slice(0, urlEnd);
  }
  const fullUrl = state.md.normalizeLink(url);
  if (!state.md.validateLink(fullUrl)) return false;
  if (!silent) {
    state.pending = state.pending.slice(0, -proto.length);
    const token_o = state.push("link_open", "a", 1);
    token_o.attrs = [["href", fullUrl]];
    token_o.markup = "linkify";
    token_o.info = "auto";
    const token_t = state.push("text", "", 0);
    token_t.content = state.md.normalizeLinkText(url);
    const token_c = state.push("link_close", "a", -1);
    token_c.markup = "linkify";
    token_c.info = "auto";
  }
  state.pos += url.length - proto.length;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/newline.mjs"
/*!*******************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/newline.mjs ***!
  \*******************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ newline)
/* harmony export */ });
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");

function newline(state, silent) {
  let pos = state.pos;
  if (state.src.charCodeAt(pos) !== 10) {
    return false;
  }
  const pmax = state.pending.length - 1;
  const max = state.posMax;
  if (!silent) {
    if (pmax >= 0 && state.pending.charCodeAt(pmax) === 32) {
      if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 32) {
        let ws = pmax - 1;
        while (ws >= 1 && state.pending.charCodeAt(ws - 1) === 32) ws--;
        state.pending = state.pending.slice(0, ws);
        state.push("hardbreak", "br", 0);
      } else {
        state.pending = state.pending.slice(0, -1);
        state.push("softbreak", "br", 0);
      }
    } else {
      state.push("softbreak", "br", 0);
    }
  }
  pos++;
  while (pos < max && (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_0__.isSpace)(state.src.charCodeAt(pos))) {
    pos++;
  }
  state.pos = pos;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/state_inline.mjs"
/*!************************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/state_inline.mjs ***!
  \************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _token_mjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../token.mjs */ "../../node_modules/markdown-it/lib/token.mjs");
/* harmony import */ var _common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../common/utils.mjs */ "../../node_modules/markdown-it/lib/common/utils.mjs");


function StateInline(src, md, env, outTokens) {
  this.src = src;
  this.env = env;
  this.md = md;
  this.tokens = outTokens;
  this.tokens_meta = Array(outTokens.length);
  this.pos = 0;
  this.posMax = this.src.length;
  this.level = 0;
  this.pending = "";
  this.pendingLevel = 0;
  this.cache = {};
  this.delimiters = [];
  this._prev_delimiters = [];
  this.backticks = {};
  this.backticksScanned = false;
  this.linkLevel = 0;
}
StateInline.prototype.pushPending = function() {
  const token = new _token_mjs__WEBPACK_IMPORTED_MODULE_0__["default"]("text", "", 0);
  token.content = this.pending;
  token.level = this.pendingLevel;
  this.tokens.push(token);
  this.pending = "";
  return token;
};
StateInline.prototype.push = function(type, tag, nesting) {
  if (this.pending) {
    this.pushPending();
  }
  const token = new _token_mjs__WEBPACK_IMPORTED_MODULE_0__["default"](type, tag, nesting);
  let token_meta = null;
  if (nesting < 0) {
    this.level--;
    this.delimiters = this._prev_delimiters.pop();
  }
  token.level = this.level;
  if (nesting > 0) {
    this.level++;
    this._prev_delimiters.push(this.delimiters);
    this.delimiters = [];
    token_meta = { delimiters: this.delimiters };
  }
  this.pendingLevel = this.level;
  this.tokens.push(token);
  this.tokens_meta.push(token_meta);
  return token;
};
StateInline.prototype.scanDelims = function(start, canSplitWord) {
  const max = this.posMax;
  const marker = this.src.charCodeAt(start);
  const lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 32;
  let pos = start;
  while (pos < max && this.src.charCodeAt(pos) === marker) {
    pos++;
  }
  const count = pos - start;
  const nextChar = pos < max ? this.src.charCodeAt(pos) : 32;
  const isLastPunctChar = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isMdAsciiPunct)(lastChar) || (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isPunctChar)(String.fromCharCode(lastChar));
  const isNextPunctChar = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isMdAsciiPunct)(nextChar) || (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isPunctChar)(String.fromCharCode(nextChar));
  const isLastWhiteSpace = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isWhiteSpace)(lastChar);
  const isNextWhiteSpace = (0,_common_utils_mjs__WEBPACK_IMPORTED_MODULE_1__.isWhiteSpace)(nextChar);
  const left_flanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
  const right_flanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);
  const can_open = left_flanking && (canSplitWord || !right_flanking || isLastPunctChar);
  const can_close = right_flanking && (canSplitWord || !left_flanking || isNextPunctChar);
  return { can_open, can_close, length: count };
};
StateInline.prototype.Token = _token_mjs__WEBPACK_IMPORTED_MODULE_0__["default"];
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (StateInline);


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/strikethrough.mjs"
/*!*************************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/strikethrough.mjs ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
function strikethrough_tokenize(state, silent) {
  const start = state.pos;
  const marker = state.src.charCodeAt(start);
  if (silent) {
    return false;
  }
  if (marker !== 126) {
    return false;
  }
  const scanned = state.scanDelims(state.pos, true);
  let len = scanned.length;
  const ch = String.fromCharCode(marker);
  if (len < 2) {
    return false;
  }
  let token;
  if (len % 2) {
    token = state.push("text", "", 0);
    token.content = ch;
    len--;
  }
  for (let i = 0; i < len; i += 2) {
    token = state.push("text", "", 0);
    token.content = ch + ch;
    state.delimiters.push({
      marker,
      length: 0,
      // disable "rule of 3" length checks meant for emphasis
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close
    });
  }
  state.pos += scanned.length;
  return true;
}
function postProcess(state, delimiters) {
  let token;
  const loneMarkers = [];
  const max = delimiters.length;
  for (let i = 0; i < max; i++) {
    const startDelim = delimiters[i];
    if (startDelim.marker !== 126) {
      continue;
    }
    if (startDelim.end === -1) {
      continue;
    }
    const endDelim = delimiters[startDelim.end];
    token = state.tokens[startDelim.token];
    token.type = "s_open";
    token.tag = "s";
    token.nesting = 1;
    token.markup = "~~";
    token.content = "";
    token = state.tokens[endDelim.token];
    token.type = "s_close";
    token.tag = "s";
    token.nesting = -1;
    token.markup = "~~";
    token.content = "";
    if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "~") {
      loneMarkers.push(endDelim.token - 1);
    }
  }
  while (loneMarkers.length) {
    const i = loneMarkers.pop();
    let j = i + 1;
    while (j < state.tokens.length && state.tokens[j].type === "s_close") {
      j++;
    }
    j--;
    if (i !== j) {
      token = state.tokens[j];
      state.tokens[j] = state.tokens[i];
      state.tokens[i] = token;
    }
  }
}
function strikethrough_postProcess(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  postProcess(state, state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      postProcess(state, tokens_meta[curr].delimiters);
    }
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  tokenize: strikethrough_tokenize,
  postProcess: strikethrough_postProcess
});


/***/ },

/***/ "../../node_modules/markdown-it/lib/rules_inline/text.mjs"
/*!****************************************************************!*\
  !*** ../../node_modules/markdown-it/lib/rules_inline/text.mjs ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ text)
/* harmony export */ });
function isTerminatorChar(ch) {
  switch (ch) {
    case 10:
    case 33:
    case 35:
    case 36:
    case 37:
    case 38:
    case 42:
    case 43:
    case 45:
    case 58:
    case 60:
    case 61:
    case 62:
    case 64:
    case 91:
    case 92:
    case 93:
    case 94:
    case 95:
    case 96:
    case 123:
    case 125:
    case 126:
      return true;
    default:
      return false;
  }
}
function text(state, silent) {
  let pos = state.pos;
  while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) {
    pos++;
  }
  if (pos === state.pos) {
    return false;
  }
  if (!silent) {
    state.pending += state.src.slice(state.pos, pos);
  }
  state.pos = pos;
  return true;
}


/***/ },

/***/ "../../node_modules/markdown-it/lib/token.mjs"
/*!****************************************************!*\
  !*** ../../node_modules/markdown-it/lib/token.mjs ***!
  \****************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
function Token(type, tag, nesting) {
  this.type = type;
  this.tag = tag;
  this.attrs = null;
  this.map = null;
  this.nesting = nesting;
  this.level = 0;
  this.children = null;
  this.content = "";
  this.markup = "";
  this.info = "";
  this.meta = null;
  this.block = false;
  this.hidden = false;
}
Token.prototype.attrIndex = function attrIndex(name) {
  if (!this.attrs) {
    return -1;
  }
  const attrs = this.attrs;
  for (let i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i][0] === name) {
      return i;
    }
  }
  return -1;
};
Token.prototype.attrPush = function attrPush(attrData) {
  if (this.attrs) {
    this.attrs.push(attrData);
  } else {
    this.attrs = [attrData];
  }
};
Token.prototype.attrSet = function attrSet(name, value) {
  const idx = this.attrIndex(name);
  const attrData = [name, value];
  if (idx < 0) {
    this.attrPush(attrData);
  } else {
    this.attrs[idx] = attrData;
  }
};
Token.prototype.attrGet = function attrGet(name) {
  const idx = this.attrIndex(name);
  let value = null;
  if (idx >= 0) {
    value = this.attrs[idx][1];
  }
  return value;
};
Token.prototype.attrJoin = function attrJoin(name, value) {
  const idx = this.attrIndex(name);
  if (idx < 0) {
    this.attrPush([name, value]);
  } else {
    this.attrs[idx][1] = this.attrs[idx][1] + " " + value;
  }
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Token);


/***/ },

/***/ "../../node_modules/timeago.js/esm/format.js"
/*!***************************************************!*\
  !*** ../../node_modules/timeago.js/esm/format.js ***!
  \***************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   format: () => (/* binding */ format)
/* harmony export */ });
/* harmony import */ var _utils_date__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utils/date */ "../../node_modules/timeago.js/esm/utils/date.js");
/* harmony import */ var _register__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./register */ "../../node_modules/timeago.js/esm/register.js");


var format = function(date, locale, opts) {
  var sec = (0,_utils_date__WEBPACK_IMPORTED_MODULE_0__.diffSec)(date, opts && opts.relativeDate);
  return (0,_utils_date__WEBPACK_IMPORTED_MODULE_0__.formatDiff)(sec, (0,_register__WEBPACK_IMPORTED_MODULE_1__.getLocale)(locale));
};


/***/ },

/***/ "../../node_modules/timeago.js/esm/index.js"
/*!**************************************************!*\
  !*** ../../node_modules/timeago.js/esm/index.js ***!
  \**************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   cancel: () => (/* reexport safe */ _realtime__WEBPACK_IMPORTED_MODULE_4__.cancel),
/* harmony export */   format: () => (/* reexport safe */ _format__WEBPACK_IMPORTED_MODULE_3__.format),
/* harmony export */   register: () => (/* reexport safe */ _register__WEBPACK_IMPORTED_MODULE_2__.register),
/* harmony export */   render: () => (/* reexport safe */ _realtime__WEBPACK_IMPORTED_MODULE_4__.render)
/* harmony export */ });
/* harmony import */ var _lang_en_US__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./lang/en_US */ "../../node_modules/timeago.js/esm/lang/en_US.js");
/* harmony import */ var _lang_zh_CN__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./lang/zh_CN */ "../../node_modules/timeago.js/esm/lang/zh_CN.js");
/* harmony import */ var _register__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./register */ "../../node_modules/timeago.js/esm/register.js");
/* harmony import */ var _format__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./format */ "../../node_modules/timeago.js/esm/format.js");
/* harmony import */ var _realtime__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./realtime */ "../../node_modules/timeago.js/esm/realtime.js");



(0,_register__WEBPACK_IMPORTED_MODULE_2__.register)("en_US", _lang_en_US__WEBPACK_IMPORTED_MODULE_0__["default"]);
(0,_register__WEBPACK_IMPORTED_MODULE_2__.register)("zh_CN", _lang_zh_CN__WEBPACK_IMPORTED_MODULE_1__["default"]);





/***/ },

/***/ "../../node_modules/timeago.js/esm/lang/en_US.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/esm/lang/en_US.js ***!
  \*******************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* export default binding */ __WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
Object.defineProperty(__WEBPACK_DEFAULT_EXPORT__, "name", { value: "default", configurable: true });
var EN_US = ["second", "minute", "hour", "day", "week", "month", "year"];
/* harmony default export */ function __WEBPACK_DEFAULT_EXPORT__(diff, idx) {
  if (idx === 0)
    return ["just now", "right now"];
  var unit = EN_US[Math.floor(idx / 2)];
  if (diff > 1)
    unit += "s";
  return [diff + " " + unit + " ago", "in " + diff + " " + unit];
}


/***/ },

/***/ "../../node_modules/timeago.js/esm/lang/zh_CN.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/esm/lang/zh_CN.js ***!
  \*******************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* export default binding */ __WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
Object.defineProperty(__WEBPACK_DEFAULT_EXPORT__, "name", { value: "default", configurable: true });
var ZH_CN = ["\u79D2", "\u5206\u949F", "\u5C0F\u65F6", "\u5929", "\u5468", "\u4E2A\u6708", "\u5E74"];
/* harmony default export */ function __WEBPACK_DEFAULT_EXPORT__(diff, idx) {
  if (idx === 0)
    return ["\u521A\u521A", "\u7247\u523B\u540E"];
  var unit = ZH_CN[~~(idx / 2)];
  return [diff + " " + unit + "\u524D", diff + " " + unit + "\u540E"];
}


/***/ },

/***/ "../../node_modules/timeago.js/esm/realtime.js"
/*!*****************************************************!*\
  !*** ../../node_modules/timeago.js/esm/realtime.js ***!
  \*****************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   cancel: () => (/* binding */ cancel),
/* harmony export */   render: () => (/* binding */ render)
/* harmony export */ });
/* harmony import */ var _utils_dom__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utils/dom */ "../../node_modules/timeago.js/esm/utils/dom.js");
/* harmony import */ var _utils_date__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./utils/date */ "../../node_modules/timeago.js/esm/utils/date.js");
/* harmony import */ var _register__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./register */ "../../node_modules/timeago.js/esm/register.js");



var TIMER_POOL = {};
var clear = function(tid) {
  clearTimeout(tid);
  delete TIMER_POOL[tid];
};
function run(node, date, localeFunc, opts) {
  clear((0,_utils_dom__WEBPACK_IMPORTED_MODULE_0__.getTimerId)(node));
  var relativeDate = opts.relativeDate, minInterval = opts.minInterval;
  var diff = (0,_utils_date__WEBPACK_IMPORTED_MODULE_1__.diffSec)(date, relativeDate);
  node.innerText = (0,_utils_date__WEBPACK_IMPORTED_MODULE_1__.formatDiff)(diff, localeFunc);
  var tid = setTimeout(function() {
    run(node, date, localeFunc, opts);
  }, Math.min(Math.max((0,_utils_date__WEBPACK_IMPORTED_MODULE_1__.nextInterval)(diff), minInterval || 1) * 1e3, 2147483647));
  TIMER_POOL[tid] = 0;
  (0,_utils_dom__WEBPACK_IMPORTED_MODULE_0__.setTimerId)(node, tid);
}
function cancel(node) {
  if (node)
    clear((0,_utils_dom__WEBPACK_IMPORTED_MODULE_0__.getTimerId)(node));
  else
    Object.keys(TIMER_POOL).forEach(clear);
}
function render(nodes, locale, opts) {
  var nodeList = nodes.length ? nodes : [nodes];
  nodeList.forEach(function(node) {
    run(node, (0,_utils_dom__WEBPACK_IMPORTED_MODULE_0__.getDateAttribute)(node), (0,_register__WEBPACK_IMPORTED_MODULE_2__.getLocale)(locale), opts || {});
  });
  return nodeList;
}


/***/ },

/***/ "../../node_modules/timeago.js/esm/register.js"
/*!*****************************************************!*\
  !*** ../../node_modules/timeago.js/esm/register.js ***!
  \*****************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getLocale: () => (/* binding */ getLocale),
/* harmony export */   register: () => (/* binding */ register)
/* harmony export */ });
var Locales = {};
var register = function(locale, func) {
  Locales[locale] = func;
};
var getLocale = function(locale) {
  return Locales[locale] || Locales["en_US"];
};


/***/ },

/***/ "../../node_modules/timeago.js/esm/utils/date.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/esm/utils/date.js ***!
  \*******************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   diffSec: () => (/* binding */ diffSec),
/* harmony export */   formatDiff: () => (/* binding */ formatDiff),
/* harmony export */   nextInterval: () => (/* binding */ nextInterval)
/* harmony export */ });
/* unused harmony export toDate */
var SEC_ARRAY = [
  60,
  60,
  24,
  7,
  365 / 7 / 12,
  12
];
function toDate(input) {
  if (input instanceof Date)
    return input;
  if (!isNaN(input) || /^\d+$/.test(input))
    return new Date(parseInt(input));
  input = (input || "").trim().replace(/\.\d+/, "").replace(/-/, "/").replace(/-/, "/").replace(/(\d)T(\d)/, "$1 $2").replace(/Z/, " UTC").replace(/([+-]\d\d):?(\d\d)/, " $1$2");
  return new Date(input);
}
function formatDiff(diff, localeFunc) {
  var agoIn = diff < 0 ? 1 : 0;
  diff = Math.abs(diff);
  var totalSec = diff;
  var idx = 0;
  for (; diff >= SEC_ARRAY[idx] && idx < SEC_ARRAY.length; idx++) {
    diff /= SEC_ARRAY[idx];
  }
  diff = Math.floor(diff);
  idx *= 2;
  if (diff > (idx === 0 ? 9 : 1))
    idx += 1;
  return localeFunc(diff, idx, totalSec)[agoIn].replace("%s", diff.toString());
}
function diffSec(date, relativeDate) {
  var relDate = relativeDate ? toDate(relativeDate) : /* @__PURE__ */ new Date();
  return (+relDate - +toDate(date)) / 1e3;
}
function nextInterval(diff) {
  var rst = 1, i = 0, d = Math.abs(diff);
  for (; diff >= SEC_ARRAY[i] && i < SEC_ARRAY.length; i++) {
    diff /= SEC_ARRAY[i];
    rst *= SEC_ARRAY[i];
  }
  d = d % rst;
  d = d ? rst - d : rst;
  return Math.ceil(d);
}


/***/ },

/***/ "../../node_modules/timeago.js/esm/utils/dom.js"
/*!******************************************************!*\
  !*** ../../node_modules/timeago.js/esm/utils/dom.js ***!
  \******************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getDateAttribute: () => (/* binding */ getDateAttribute),
/* harmony export */   getTimerId: () => (/* binding */ getTimerId),
/* harmony export */   setTimerId: () => (/* binding */ setTimerId)
/* harmony export */ });
var ATTR_TIMEAGO_TID = "timeago-id";
function getDateAttribute(node) {
  return node.getAttribute("datetime");
}
function setTimerId(node, timerId) {
  node.setAttribute(ATTR_TIMEAGO_TID, timerId);
}
function getTimerId(node) {
  return parseInt(node.getAttribute(ATTR_TIMEAGO_TID));
}


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/ar.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/ar.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
var timeTypes = [
  ["\u062B\u0627\u0646\u064A\u0629", "\u062B\u0627\u0646\u064A\u062A\u064A\u0646", "%s \u062B\u0648\u0627\u0646", "%s \u062B\u0627\u0646\u064A\u0629"],
  ["\u062F\u0642\u064A\u0642\u0629", "\u062F\u0642\u064A\u0642\u062A\u064A\u0646", "%s \u062F\u0642\u0627\u0626\u0642", "%s \u062F\u0642\u064A\u0642\u0629"],
  ["\u0633\u0627\u0639\u0629", "\u0633\u0627\u0639\u062A\u064A\u0646", "%s \u0633\u0627\u0639\u0627\u062A", "%s \u0633\u0627\u0639\u0629"],
  ["\u064A\u0648\u0645", "\u064A\u0648\u0645\u064A\u0646", "%s \u0623\u064A\u0627\u0645", "%s \u064A\u0648\u0645\u0627\u064B"],
  ["\u0623\u0633\u0628\u0648\u0639", "\u0623\u0633\u0628\u0648\u0639\u064A\u0646", "%s \u0623\u0633\u0627\u0628\u064A\u0639", "%s \u0623\u0633\u0628\u0648\u0639\u0627\u064B"],
  ["\u0634\u0647\u0631", "\u0634\u0647\u0631\u064A\u0646", "%s \u0623\u0634\u0647\u0631", "%s \u0634\u0647\u0631\u0627\u064B"],
  ["\u0639\u0627\u0645", "\u0639\u0627\u0645\u064A\u0646", "%s \u0623\u0639\u0648\u0627\u0645", "%s \u0639\u0627\u0645\u0627\u064B"]
];
function formatTime(type, n) {
  if (n < 3)
    return timeTypes[type][n - 1];
  if (n >= 3 && n <= 10)
    return timeTypes[type][2];
  return timeTypes[type][3];
}
function default_1(number, index) {
  if (index === 0) {
    return ["\u0645\u0646\u0630 \u0644\u062D\u0638\u0627\u062A", "\u0628\u0639\u062F \u0644\u062D\u0638\u0627\u062A"];
  }
  var timeStr = formatTime(Math.floor(index / 2), number);
  return ["\u0645\u0646\u0630 " + timeStr, "\u0628\u0639\u062F " + timeStr];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/be.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/be.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function formatNum(f1, f, s, t, n) {
  var n10 = n % 10;
  var str = t;
  if (n === 1) {
    str = f1;
  } else if (n10 === 1 && n > 20) {
    str = f;
  } else if (n10 > 1 && n10 < 5 && (n > 20 || n < 10)) {
    str = s;
  }
  return str;
}
var seconds = formatNum.bind(null, "\u0441\u0435\u043A\u0443\u043D\u0434\u0443", "%s \u0441\u0435\u043A\u0443\u043D\u0434\u0443", "%s \u0441\u0435\u043A\u0443\u043D\u0434\u044B", "%s \u0441\u0435\u043A\u0443\u043D\u0434"), minutes = formatNum.bind(null, "\u0445\u0432\u0456\u043B\u0456\u043D\u0443", "%s \u0445\u0432\u0456\u043B\u0456\u043D\u0443", "%s \u0445\u0432\u0456\u043B\u0456\u043D\u044B", "%s \u0445\u0432\u0456\u043B\u0456\u043D"), hours = formatNum.bind(null, "\u0433\u0430\u0434\u0437\u0456\u043D\u0443", "%s \u0433\u0430\u0434\u0437\u0456\u043D\u0443", "%s \u0433\u0430\u0434\u0437\u0456\u043D\u044B", "%s \u0433\u0430\u0434\u0437\u0456\u043D"), days = formatNum.bind(null, "\u0434\u0437\u0435\u043D\u044C", "%s \u0434\u0437\u0435\u043D\u044C", "%s \u0434\u043D\u0456", "%s \u0434\u0437\u0451\u043D"), weeks = formatNum.bind(null, "\u0442\u044B\u0434\u0437\u0435\u043D\u044C", "%s \u0442\u044B\u0434\u0437\u0435\u043D\u044C", "%s \u0442\u044B\u0434\u043D\u0456", "%s \u0442\u044B\u0434\u043D\u044F\u045E"), months = formatNum.bind(null, "\u043C\u0435\u0441\u044F\u0446", "%s \u043C\u0435\u0441\u044F\u0446", "%s \u043C\u0435\u0441\u044F\u0446\u044B", "%s \u043C\u0435\u0441\u044F\u0446\u0430\u045E"), years = formatNum.bind(null, "\u0433\u043E\u0434", "%s \u0433\u043E\u0434", "%s \u0433\u0430\u0434\u044B", "%s \u0433\u0430\u0434\u043E\u045E");
function default_1(number, index) {
  switch (index) {
    case 0:
      return ["\u0442\u043E\u043B\u044C\u043A\u0456 \u0448\u0442\u043E", "\u043F\u0440\u0430\u0437 \u043D\u0435\u043A\u0430\u043B\u044C\u043A\u0456 \u0441\u0435\u043A\u0443\u043D\u0434"];
    case 1:
      return [seconds(number) + " \u0442\u0430\u043C\u0443", "\u043F\u0440\u0430\u0437 " + seconds(number)];
    case 2:
    case 3:
      return [minutes(number) + " \u0442\u0430\u043C\u0443", "\u043F\u0440\u0430\u0437 " + minutes(number)];
    case 4:
    case 5:
      return [hours(number) + " \u0442\u0430\u043C\u0443", "\u043F\u0440\u0430\u0437 " + hours(number)];
    case 6:
    case 7:
      return [days(number) + " \u0442\u0430\u043C\u0443", "\u043F\u0440\u0430\u0437 " + days(number)];
    case 8:
    case 9:
      return [weeks(number) + " \u0442\u0430\u043C\u0443", "\u043F\u0440\u0430\u0437 " + weeks(number)];
    case 10:
    case 11:
      return [months(number) + " \u0442\u0430\u043C\u0443", "\u043F\u0440\u0430\u0437 " + months(number)];
    case 12:
    case 13:
      return [years(number) + " \u0442\u0430\u043C\u0443", "\u043F\u0440\u0430\u0437 " + years(number)];
    default:
      return ["", ""];
  }
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/bg.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/bg.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u0442\u043E\u043A\u0443 \u0449\u043E", "\u0441\u044A\u0432\u0441\u0435\u043C \u0441\u043A\u043E\u0440\u043E"],
    ["\u043F\u0440\u0435\u0434\u0438 %s \u0441\u0435\u043A\u0443\u043D\u0434\u0438", "\u0441\u043B\u0435\u0434 %s \u0441\u0435\u043A\u0443\u043D\u0434\u0438"],
    ["\u043F\u0440\u0435\u0434\u0438 1 \u043C\u0438\u043D\u0443\u0442\u0430", "\u0441\u043B\u0435\u0434 1 \u043C\u0438\u043D\u0443\u0442\u0430"],
    ["\u043F\u0440\u0435\u0434\u0438 %s \u043C\u0438\u043D\u0443\u0442\u0438", "\u0441\u043B\u0435\u0434 %s \u043C\u0438\u043D\u0443\u0442\u0438"],
    ["\u043F\u0440\u0435\u0434\u0438 1 \u0447\u0430\u0441", "\u0441\u043B\u0435\u0434 1 \u0447\u0430\u0441"],
    ["\u043F\u0440\u0435\u0434\u0438 %s \u0447\u0430\u0441\u0430", "\u0441\u043B\u0435\u0434 %s \u0447\u0430\u0441\u0430"],
    ["\u043F\u0440\u0435\u0434\u0438 1 \u0434\u0435\u043D", "\u0441\u043B\u0435\u0434 1 \u0434\u0435\u043D"],
    ["\u043F\u0440\u0435\u0434\u0438 %s \u0434\u043D\u0438", "\u0441\u043B\u0435\u0434 %s \u0434\u043D\u0438"],
    ["\u043F\u0440\u0435\u0434\u0438 1 \u0441\u0435\u0434\u043C\u0438\u0446\u0430", "\u0441\u043B\u0435\u0434 1 \u0441\u0435\u0434\u043C\u0438\u0446\u0430"],
    ["\u043F\u0440\u0435\u0434\u0438 %s \u0441\u0435\u0434\u043C\u0438\u0446\u0438", "\u0441\u043B\u0435\u0434 %s \u0441\u0435\u0434\u043C\u0438\u0446\u0438"],
    ["\u043F\u0440\u0435\u0434\u0438 1 \u043C\u0435\u0441\u0435\u0446", "\u0441\u043B\u0435\u0434 1 \u043C\u0435\u0441\u0435\u0446"],
    ["\u043F\u0440\u0435\u0434\u0438 %s \u043C\u0435\u0441\u0435\u0446\u0430", "\u0441\u043B\u0435\u0434 %s \u043C\u0435\u0441\u0435\u0446\u0430"],
    ["\u043F\u0440\u0435\u0434\u0438 1 \u0433\u043E\u0434\u0438\u043D\u0430", "\u0441\u043B\u0435\u0434 1 \u0433\u043E\u0434\u0438\u043D\u0430"],
    ["\u043F\u0440\u0435\u0434\u0438 %s \u0433\u043E\u0434\u0438\u043D\u0438", "\u0441\u043B\u0435\u0434 %s \u0433\u043E\u0434\u0438\u043D\u0438"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/bn_IN.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/bn_IN.js ***!
  \*******************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u098F\u0987\u09AE\u09BE\u09A4\u09CD\u09B0", "\u098F\u0995\u099F\u09BE \u09B8\u09AE\u09AF\u09BC"],
    ["%s \u09B8\u09C7\u0995\u09C7\u09A8\u09CD\u09A1 \u0986\u0997\u09C7", "%s \u098F\u09B0 \u09B8\u09C7\u0995\u09C7\u09A8\u09CD\u09A1\u09C7\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7"],
    ["1 \u09AE\u09BF\u09A8\u09BF\u099F \u0986\u0997\u09C7", "1 \u09AE\u09BF\u09A8\u09BF\u099F\u09C7"],
    ["%s \u098F\u09B0 \u09AE\u09BF\u09A8\u09BF\u099F \u0986\u0997\u09C7", "%s \u098F\u09B0 \u09AE\u09BF\u09A8\u09BF\u099F\u09C7\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7"],
    ["1 \u0998\u09A8\u09CD\u099F\u09BE \u0986\u0997\u09C7", "1 \u0998\u09A8\u09CD\u099F\u09BE"],
    ["%s \u0998\u09A3\u09CD\u099F\u09BE \u0986\u0997\u09C7", "%s \u098F\u09B0 \u0998\u09A8\u09CD\u099F\u09BE\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7"],
    ["1 \u09A6\u09BF\u09A8 \u0986\u0997\u09C7", "1 \u09A6\u09BF\u09A8\u09C7\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7"],
    ["%s \u098F\u09B0 \u09A6\u09BF\u09A8 \u0986\u0997\u09C7", "%s \u098F\u09B0 \u09A6\u09BF\u09A8"],
    ["1 \u09B8\u09AA\u09CD\u09A4\u09BE\u09B9 \u0986\u0997\u09C7", "1 \u09B8\u09AA\u09CD\u09A4\u09BE\u09B9\u09C7\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7"],
    ["%s \u098F\u09B0 \u09B8\u09AA\u09CD\u09A4\u09BE\u09B9 \u0986\u0997\u09C7", "%s \u09B8\u09AA\u09CD\u09A4\u09BE\u09B9\u09C7\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7"],
    ["1 \u09AE\u09BE\u09B8 \u0986\u0997\u09C7", "1 \u09AE\u09BE\u09B8\u09C7"],
    ["%s \u09AE\u09BE\u09B8 \u0986\u0997\u09C7", "%s \u09AE\u09BE\u09B8\u09C7"],
    ["1 \u09AC\u099B\u09B0 \u0986\u0997\u09C7", "1 \u09AC\u099B\u09B0\u09C7\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7"],
    ["%s \u09AC\u099B\u09B0 \u0986\u0997\u09C7", "%s \u09AC\u099B\u09B0\u09C7"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/ca.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/ca.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["fa un moment", "d'aqu\xED un moment"],
    ["fa %s segons", "d'aqu\xED %s segons"],
    ["fa 1 minut", "d'aqu\xED 1 minut"],
    ["fa %s minuts", "d'aqu\xED %s minuts"],
    ["fa 1 hora", "d'aqu\xED 1 hora"],
    ["fa %s hores", "d'aqu\xED %s hores"],
    ["fa 1 dia", "d'aqu\xED 1 dia"],
    ["fa %s dies", "d'aqu\xED %s dies"],
    ["fa 1 setmana", "d'aqu\xED 1 setmana"],
    ["fa %s setmanes", "d'aqu\xED %s setmanes"],
    ["fa 1 mes", "d'aqu\xED 1 mes"],
    ["fa %s mesos", "d'aqu\xED %s mesos"],
    ["fa 1 any", "d'aqu\xED 1 any"],
    ["fa %s anys", "d'aqu\xED %s anys"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/cs.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/cs.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  var inflectionIndex = 0;
  var isInflectionNeeded = index == 1 || index == 3 || index == 5 || index == 7 || index == 9 || index == 11 || index == 13;
  if (isInflectionNeeded && number >= 5) {
    inflectionIndex = 1;
  }
  return [
    [["pr\xE1v\u011B te\u010F", "pr\xE1v\u011B te\u010F"]],
    [["p\u0159ed %s vte\u0159inami", "za %s vte\u0159iny"], ["p\u0159ed %s vte\u0159inami", "za %s vte\u0159in"]],
    [["p\u0159ed minutou", "za minutu"]],
    [["p\u0159ed %s minutami", "za %s minuty"], ["p\u0159ed %s minutami", "za %s minut"]],
    [["p\u0159ed hodinou", "za hodinu"]],
    [["p\u0159ed %s hodinami", "za %s hodiny"], ["p\u0159ed %s hodinami", "za %s hodin"]],
    [["v\u010Dera", "z\xEDtra"]],
    [["p\u0159ed %s dny", "za %s dny"], ["p\u0159ed %s dny", "za %s dn\u016F"]],
    [["minul\xFD t\xFDden", "p\u0159\xED\u0161t\xED t\xFDden"]],
    [["p\u0159ed %s t\xFDdny", "za %s t\xFDdny"], ["p\u0159ed %s t\xFDdny", "za %s t\xFDdn\u016F"]],
    [["minul\xFD m\u011Bs\xEDc", "p\u0159\xEDst\xED m\u011Bs\xEDc"]],
    [["p\u0159ed %s m\u011Bs\xEDci", "za %s m\u011Bs\xEDce"], ["p\u0159ed %s m\u011Bs\xEDci", "za %s m\u011Bs\xEDc\u016F"]],
    [["p\u0159ed rokem", "p\u0159\xEDst\xED rok"]],
    [["p\u0159ed %s lety", "za %s roky"], ["p\u0159ed %s lety", "za %s let"]]
  ][index][inflectionIndex];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/da.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/da.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["for et \xF8jeblik siden", "om et \xF8jeblik"],
    ["for %s sekunder siden", "om %s sekunder"],
    ["for 1 minut siden", "om 1 minut"],
    ["for %s minutter siden", "om %s minutter"],
    ["for 1 time siden", "om 1 time"],
    ["for %s timer siden", "om %s timer"],
    ["for 1 dag siden", "om 1 dag"],
    ["for %s dage siden", "om %s dage"],
    ["for 1 uge siden", "om 1 uge"],
    ["for %s uger siden", "om %s uger"],
    ["for 1 m\xE5ned siden", "om 1 m\xE5ned"],
    ["for %s m\xE5neder siden", "om %s m\xE5neder"],
    ["for 1 \xE5r siden", "om 1 \xE5r"],
    ["for %s \xE5r siden", "om %s \xE5r"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/de.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/de.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["gerade eben", "vor einer Weile"],
    ["vor %s Sekunden", "in %s Sekunden"],
    ["vor 1 Minute", "in 1 Minute"],
    ["vor %s Minuten", "in %s Minuten"],
    ["vor 1 Stunde", "in 1 Stunde"],
    ["vor %s Stunden", "in %s Stunden"],
    ["vor 1 Tag", "in 1 Tag"],
    ["vor %s Tagen", "in %s Tagen"],
    ["vor 1 Woche", "in 1 Woche"],
    ["vor %s Wochen", "in %s Wochen"],
    ["vor 1 Monat", "in 1 Monat"],
    ["vor %s Monaten", "in %s Monaten"],
    ["vor 1 Jahr", "in 1 Jahr"],
    ["vor %s Jahren", "in %s Jahren"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/el.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/el.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u03BC\u03CC\u03BB\u03B9\u03C2 \u03C4\u03CE\u03C1\u03B1", "\u03C3\u03B5 \u03BB\u03AF\u03B3\u03BF"],
    ["%s \u03B4\u03B5\u03C5\u03C4\u03B5\u03C1\u03CC\u03BB\u03B5\u03C0\u03C4\u03B1 \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 %s \u03B4\u03B5\u03C5\u03C4\u03B5\u03C1\u03CC\u03BB\u03B5\u03C0\u03C4\u03B1"],
    ["1 \u03BB\u03B5\u03C0\u03C4\u03CC \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 1 \u03BB\u03B5\u03C0\u03C4\u03CC"],
    ["%s \u03BB\u03B5\u03C0\u03C4\u03AC \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 %s \u03BB\u03B5\u03C0\u03C4\u03AC"],
    ["1 \u03CE\u03C1\u03B1 \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 1 \u03CE\u03C1\u03B1"],
    ["%s \u03CE\u03C1\u03B5\u03C2 \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 %s \u03CE\u03C1\u03B5\u03C2"],
    ["1 \u03BC\u03AD\u03C1\u03B1 \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 1 \u03BC\u03AD\u03C1\u03B1"],
    ["%s \u03BC\u03AD\u03C1\u03B5\u03C2 \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 %s \u03BC\u03AD\u03C1\u03B5\u03C2"],
    ["1 \u03B5\u03B2\u03B4\u03BF\u03BC\u03AC\u03B4\u03B1 \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 1 \u03B5\u03B2\u03B4\u03BF\u03BC\u03AC\u03B4\u03B1"],
    ["%s \u03B5\u03B2\u03B4\u03BF\u03BC\u03AC\u03B4\u03B5\u03C2 \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 %s \u03B5\u03B2\u03B4\u03BF\u03BC\u03AC\u03B4\u03B5\u03C2"],
    ["1 \u03BC\u03AE\u03BD\u03B1 \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 1 \u03BC\u03AE\u03BD\u03B1"],
    ["%s \u03BC\u03AE\u03BD\u03B5\u03C2 \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 %s \u03BC\u03AE\u03BD\u03B5\u03C2"],
    ["1 \u03C7\u03C1\u03CC\u03BD\u03BF \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 1 \u03C7\u03C1\u03CC\u03BD\u03BF"],
    ["%s \u03C7\u03C1\u03CC\u03BD\u03B9\u03B1 \u03C0\u03C1\u03B9\u03BD", "\u03C3\u03B5 %s \u03C7\u03C1\u03CC\u03BD\u03B9\u03B1"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/en_US.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/en_US.js ***!
  \*******************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
var EN_US = ["second", "minute", "hour", "day", "week", "month", "year"];
function default_1(diff, idx) {
  if (idx === 0)
    return ["just now", "right now"];
  var unit = EN_US[Math.floor(idx / 2)];
  if (diff > 1)
    unit += "s";
  return [diff + " " + unit + " ago", "in " + diff + " " + unit];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/en_short.js"
/*!**********************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/en_short.js ***!
  \**********************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["just now", "right now"],
    ["%ss ago", "in %ss"],
    ["1m ago", "in 1m"],
    ["%sm ago", "in %sm"],
    ["1h ago", "in 1h"],
    ["%sh ago", "in %sh"],
    ["1d ago", "in 1d"],
    ["%sd ago", "in %sd"],
    ["1w ago", "in 1w"],
    ["%sw ago", "in %sw"],
    ["1mo ago", "in 1mo"],
    ["%smo ago", "in %smo"],
    ["1yr ago", "in 1yr"],
    ["%syr ago", "in %syr"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/es.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/es.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["justo ahora", "en un rato"],
    ["hace %s segundos", "en %s segundos"],
    ["hace 1 minuto", "en 1 minuto"],
    ["hace %s minutos", "en %s minutos"],
    ["hace 1 hora", "en 1 hora"],
    ["hace %s horas", "en %s horas"],
    ["hace 1 d\xEDa", "en 1 d\xEDa"],
    ["hace %s d\xEDas", "en %s d\xEDas"],
    ["hace 1 semana", "en 1 semana"],
    ["hace %s semanas", "en %s semanas"],
    ["hace 1 mes", "en 1 mes"],
    ["hace %s meses", "en %s meses"],
    ["hace 1 a\xF1o", "en 1 a\xF1o"],
    ["hace %s a\xF1os", "en %s a\xF1os"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/eu.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/eu.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["orain", "denbora bat barru"],
    ["duela %s segundu", "%s segundu barru"],
    ["duela minutu 1", "minutu 1 barru"],
    ["duela %s minutu", "%s minutu barru"],
    ["duela ordu 1", "ordu 1 barru"],
    ["duela %s ordu", "%s ordu barru"],
    ["duela egun 1", "egun 1 barru"],
    ["duela %s egun", "%s egun barru"],
    ["duela aste 1", "aste 1 barru"],
    ["duela %s aste", "%s aste barru"],
    ["duela hillabete 1", "hillabete 1 barru"],
    ["duela %s hillabete", "%s hillabete barru"],
    ["duela urte 1", "urte 1 barru"],
    ["duela %s urte", "%s urte barru"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/fa.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/fa.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function toPersianNumber(number) {
  var persianDigits = ["\u06F0", "\u06F1", "\u06F2", "\u06F3", "\u06F4", "\u06F5", "\u06F6", "\u06F7", "\u06F8", "\u06F9"];
  return number.toString().replace(/\d/g, function(x) {
    return persianDigits[x];
  });
}
function default_1(number, index) {
  var formattedString = [
    ["\u0644\u062D\u0638\u0627\u062A\u06CC \u067E\u06CC\u0634", "\u0647\u0645\u06CC\u0646 \u062D\u0627\u0644\u0627"],
    ["%s \u062B\u0627\u0646\u06CC\u0647 \u067E\u06CC\u0634", "%s \u062B\u0627\u0646\u06CC\u0647 \u062F\u06CC\u06AF\u0631"],
    ["\u06F1 \u062F\u0642\u06CC\u0642\u0647 \u067E\u06CC\u0634", "\u06F1 \u062F\u0642\u06CC\u0642\u0647 \u062F\u06CC\u06AF\u0631"],
    ["%s \u062F\u0642\u06CC\u0642\u0647 \u067E\u06CC\u0634", "%s \u062F\u0642\u06CC\u0642\u0647 \u062F\u06CC\u06AF\u0631"],
    ["\u06F1 \u0633\u0627\u0639\u062A \u067E\u06CC\u0634", "\u06F1 \u0633\u0627\u0639\u062A \u062F\u06CC\u06AF\u0631"],
    ["%s \u0633\u0627\u0639\u062A \u067E\u06CC\u0634", "%s \u0633\u0627\u0639\u062A \u062F\u06CC\u06AF\u0631"],
    ["\u06F1 \u0631\u0648\u0632 \u067E\u06CC\u0634", "\u06F1 \u0631\u0648\u0632 \u062F\u06CC\u06AF\u0631"],
    ["%s \u0631\u0648\u0632 \u067E\u06CC\u0634", "%s \u0631\u0648\u0632 \u062F\u06CC\u06AF\u0631"],
    ["\u06F1 \u0647\u0641\u062A\u0647 \u067E\u06CC\u0634", "\u06F1 \u0647\u0641\u062A\u0647 \u062F\u06CC\u06AF\u0631"],
    ["%s \u0647\u0641\u062A\u0647 \u067E\u06CC\u0634", "%s \u0647\u0641\u062A\u0647 \u062F\u06CC\u06AF\u0631"],
    ["\u06F1 \u0645\u0627\u0647 \u067E\u06CC\u0634", "\u06F1 \u0645\u0627\u0647 \u062F\u06CC\u06AF\u0631"],
    ["%s \u0645\u0627\u0647 \u067E\u06CC\u0634", "%s \u0645\u0627\u0647 \u062F\u06CC\u06AF\u0631"],
    ["\u06F1 \u0633\u0627\u0644 \u067E\u06CC\u0634", "\u06F1 \u0633\u0627\u0644 \u062F\u06CC\u06AF\u0631"],
    ["%s \u0633\u0627\u0644 \u067E\u06CC\u0634", "%s \u0633\u0627\u0644 \u062F\u06CC\u06AF\u0631"]
  ][index];
  return [
    formattedString[0].replace("%s", toPersianNumber(number)),
    formattedString[1].replace("%s", toPersianNumber(number))
  ];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/fi.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/fi.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["juuri \xE4sken", "juuri nyt"],
    ["%s sekuntia sitten", "%s sekunnin p\xE4\xE4st\xE4"],
    ["minuutti sitten", "minuutin p\xE4\xE4st\xE4"],
    ["%s minuuttia sitten", "%s minuutin p\xE4\xE4st\xE4"],
    ["tunti sitten", "tunnin p\xE4\xE4st\xE4"],
    ["%s tuntia sitten", "%s tunnin p\xE4\xE4st\xE4"],
    ["p\xE4iv\xE4 sitten", "p\xE4iv\xE4n p\xE4\xE4st\xE4"],
    ["%s p\xE4iv\xE4\xE4 sitten", "%s p\xE4iv\xE4n p\xE4\xE4st\xE4"],
    ["viikko sitten", "viikon p\xE4\xE4st\xE4"],
    ["%s viikkoa sitten", "%s viikon p\xE4\xE4st\xE4"],
    ["kuukausi sitten", "kuukauden p\xE4\xE4st\xE4"],
    ["%s kuukautta sitten", "%s kuukauden p\xE4\xE4st\xE4"],
    ["vuosi sitten", "vuoden p\xE4\xE4st\xE4"],
    ["%s vuotta sitten", "%s vuoden p\xE4\xE4st\xE4"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/fr.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/fr.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\xE0 l'instant", "dans un instant"],
    ["il y a %s secondes", "dans %s secondes"],
    ["il y a 1 minute", "dans 1 minute"],
    ["il y a %s minutes", "dans %s minutes"],
    ["il y a 1 heure", "dans 1 heure"],
    ["il y a %s heures", "dans %s heures"],
    ["il y a 1 jour", "dans 1 jour"],
    ["il y a %s jours", "dans %s jours"],
    ["il y a 1 semaine", "dans 1 semaine"],
    ["il y a %s semaines", "dans %s semaines"],
    ["il y a 1 mois", "dans 1 mois"],
    ["il y a %s mois", "dans %s mois"],
    ["il y a 1 an", "dans 1 an"],
    ["il y a %s ans", "dans %s ans"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/gl.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/gl.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["xusto agora", "daqu\xED a un pouco"],
    ["hai %s segundos", "en %s segundos"],
    ["hai 1 minuto", "nun minuto"],
    ["hai %s minutos", "en %s minutos"],
    ["hai 1 hora", "nunha hora"],
    ["hai %s horas", "en %s horas"],
    ["hai 1 d\xEDa", "nun d\xEDa"],
    ["hai %s d\xEDas", "en %s d\xEDas"],
    ["hai 1 semana", "nunha semana"],
    ["hai %s semanas", "en %s semanas"],
    ["hai 1 mes", "nun mes"],
    ["hai %s meses", "en %s meses"],
    ["hai 1 ano", "nun ano"],
    ["hai %s anos", "en %s anos"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/he.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/he.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u05D6\u05D4 \u05E2\u05EA\u05D4", "\u05E2\u05DB\u05E9\u05D9\u05D5"],
    ["\u05DC\u05E4\u05E0\u05D9 %s \u05E9\u05E0\u05D9\u05D5\u05EA", "\u05D1\u05E2\u05D5\u05D3 %s \u05E9\u05E0\u05D9\u05D5\u05EA"],
    ["\u05DC\u05E4\u05E0\u05D9 \u05D3\u05E7\u05D4", "\u05D1\u05E2\u05D5\u05D3 \u05D3\u05E7\u05D4"],
    ["\u05DC\u05E4\u05E0\u05D9 %s \u05D3\u05E7\u05D5\u05EA", "\u05D1\u05E2\u05D5\u05D3 %s \u05D3\u05E7\u05D5\u05EA"],
    ["\u05DC\u05E4\u05E0\u05D9 \u05E9\u05E2\u05D4", "\u05D1\u05E2\u05D5\u05D3 \u05E9\u05E2\u05D4"],
    number === 2 ? ["\u05DC\u05E4\u05E0\u05D9 \u05E9\u05E2\u05EA\u05D9\u05D9\u05DD", "\u05D1\u05E2\u05D5\u05D3 \u05E9\u05E2\u05EA\u05D9\u05D9\u05DD"] : ["\u05DC\u05E4\u05E0\u05D9 %s \u05E9\u05E2\u05D5\u05EA", "\u05D1\u05E2\u05D5\u05D3 %s \u05E9\u05E2\u05D5\u05EA"],
    ["\u05D0\u05EA\u05DE\u05D5\u05DC", "\u05DE\u05D7\u05E8"],
    number === 2 ? ["\u05DC\u05E4\u05E0\u05D9 \u05D9\u05D5\u05DE\u05D9\u05D9\u05DD", "\u05D1\u05E2\u05D5\u05D3 \u05D9\u05D5\u05DE\u05D9\u05D9\u05DD"] : ["\u05DC\u05E4\u05E0\u05D9 %s \u05D9\u05DE\u05D9\u05DD", "\u05D1\u05E2\u05D5\u05D3 %s \u05D9\u05DE\u05D9\u05DD"],
    ["\u05DC\u05E4\u05E0\u05D9 \u05E9\u05D1\u05D5\u05E2", "\u05D1\u05E2\u05D5\u05D3 \u05E9\u05D1\u05D5\u05E2"],
    number === 2 ? ["\u05DC\u05E4\u05E0\u05D9 \u05E9\u05D1\u05D5\u05E2\u05D9\u05D9\u05DD", "\u05D1\u05E2\u05D5\u05D3 \u05E9\u05D1\u05D5\u05E2\u05D9\u05D9\u05DD"] : ["\u05DC\u05E4\u05E0\u05D9 %s \u05E9\u05D1\u05D5\u05E2\u05D5\u05EA", "\u05D1\u05E2\u05D5\u05D3 %s \u05E9\u05D1\u05D5\u05E2\u05D5\u05EA"],
    ["\u05DC\u05E4\u05E0\u05D9 \u05D7\u05D5\u05D3\u05E9", "\u05D1\u05E2\u05D5\u05D3 \u05D7\u05D5\u05D3\u05E9"],
    number === 2 ? ["\u05DC\u05E4\u05E0\u05D9 \u05D7\u05D5\u05D3\u05E9\u05D9\u05D9\u05DD", "\u05D1\u05E2\u05D5\u05D3 \u05D7\u05D5\u05D3\u05E9\u05D9\u05D9\u05DD"] : ["\u05DC\u05E4\u05E0\u05D9 %s \u05D7\u05D5\u05D3\u05E9\u05D9\u05DD", "\u05D1\u05E2\u05D5\u05D3 %s \u05D7\u05D5\u05D3\u05E9\u05D9\u05DD"],
    ["\u05DC\u05E4\u05E0\u05D9 \u05E9\u05E0\u05D4", "\u05D1\u05E2\u05D5\u05D3 \u05E9\u05E0\u05D4"],
    number === 2 ? ["\u05DC\u05E4\u05E0\u05D9 \u05E9\u05E0\u05EA\u05D9\u05D9\u05DD", "\u05D1\u05E2\u05D5\u05D3 \u05E9\u05E0\u05EA\u05D9\u05D9\u05DD"] : ["\u05DC\u05E4\u05E0\u05D9 %s \u05E9\u05E0\u05D9\u05DD", "\u05D1\u05E2\u05D5\u05D3 %s \u05E9\u05E0\u05D9\u05DD"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/hi_IN.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/hi_IN.js ***!
  \*******************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u0905\u092D\u0940", "\u0915\u0941\u091B \u0938\u092E\u092F"],
    ["%s \u0938\u0947\u0915\u0902\u0921 \u092A\u0939\u0932\u0947", "%s \u0938\u0947\u0915\u0902\u0921 \u092E\u0947\u0902"],
    ["1 \u092E\u093F\u0928\u091F \u092A\u0939\u0932\u0947", "1 \u092E\u093F\u0928\u091F \u092E\u0947\u0902"],
    ["%s \u092E\u093F\u0928\u091F \u092A\u0939\u0932\u0947", "%s \u092E\u093F\u0928\u091F \u092E\u0947\u0902"],
    ["1 \u0918\u0902\u091F\u0947 \u092A\u0939\u0932\u0947", "1 \u0918\u0902\u091F\u0947 \u092E\u0947\u0902"],
    ["%s \u0918\u0902\u091F\u0947 \u092A\u0939\u0932\u0947", "%s \u0918\u0902\u091F\u0947 \u092E\u0947\u0902"],
    ["1 \u0926\u093F\u0928 \u092A\u0939\u0932\u0947", "1 \u0926\u093F\u0928 \u092E\u0947\u0902"],
    ["%s \u0926\u093F\u0928 \u092A\u0939\u0932\u0947", "%s \u0926\u093F\u0928\u094B\u0902 \u092E\u0947\u0902"],
    ["1 \u0938\u092A\u094D\u0924\u093E\u0939 \u092A\u0939\u0932\u0947", "1 \u0938\u092A\u094D\u0924\u093E\u0939 \u092E\u0947\u0902"],
    ["%s \u0939\u092B\u094D\u0924\u0947 \u092A\u0939\u0932\u0947", "%s \u0939\u092B\u094D\u0924\u094B\u0902 \u092E\u0947\u0902"],
    ["1 \u092E\u0939\u0940\u0928\u0947 \u092A\u0939\u0932\u0947", "1 \u092E\u0939\u0940\u0928\u0947 \u092E\u0947\u0902"],
    ["%s \u092E\u0939\u0940\u0928\u0947 \u092A\u0939\u0932\u0947", "%s \u092E\u0939\u0940\u0928\u094B\u0902 \u092E\u0947\u0902"],
    ["1 \u0938\u093E\u0932 \u092A\u0939\u0932\u0947", "1 \u0938\u093E\u0932 \u092E\u0947\u0902"],
    ["%s \u0938\u093E\u0932 \u092A\u0939\u0932\u0947", "%s \u0938\u093E\u0932 \u092E\u0947\u0902"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/hu.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/hu.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\xE9ppen most", "\xE9ppen most"],
    ["%s m\xE1sodperce", "%s m\xE1sodpercen bel\xFCl"],
    ["1 perce", "1 percen bel\xFCl"],
    ["%s perce", "%s percen bel\xFCl"],
    ["1 \xF3r\xE1ja", "1 \xF3r\xE1n bel\xFCl"],
    ["%s \xF3r\xE1ja", "%s \xF3r\xE1n bel\xFCl"],
    ["1 napja", "1 napon bel\xFCl"],
    ["%s napja", "%s napon bel\xFCl"],
    ["1 hete", "1 h\xE9ten bel\xFCl"],
    ["%s hete", "%s h\xE9ten bel\xFCl"],
    ["1 h\xF3napja", "1 h\xF3napon bel\xFCl"],
    ["%s h\xF3napja", "%s h\xF3napon bel\xFCl"],
    ["1 \xE9ve", "1 \xE9ven bel\xFCl"],
    ["%s \xE9ve", "%s \xE9ven bel\xFCl"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/id_ID.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/id_ID.js ***!
  \*******************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["baru saja", "sebentar"],
    ["%s detik yang lalu", "dalam %s detik"],
    ["1 menit yang lalu", "dalam 1 menit"],
    ["%s menit yang lalu", "dalam %s menit"],
    ["1 jam yang lalu", "dalam 1 jam"],
    ["%s jam yang lalu", "dalam %s jam"],
    ["1 hari yang lalu", "dalam 1 hari"],
    ["%s hari yang lalu", "dalam %s hari"],
    ["1 minggu yang lalu", "dalam 1 minggu"],
    ["%s minggu yang lalu", "dalam %s minggu"],
    ["1 bulan yang lalu", "dalam 1 bulan"],
    ["%s bulan yang lalu", "dalam %s bulan"],
    ["1 tahun yang lalu", "dalam 1 tahun"],
    ["%s tahun yang lalu", "dalam %s tahun"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/index.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/index.js ***!
  \*******************************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
var ar_1 = __webpack_require__(/*! ./ar */ "../../node_modules/timeago.js/lib/lang/ar.js");
exports.ar = ar_1.default;
var be_1 = __webpack_require__(/*! ./be */ "../../node_modules/timeago.js/lib/lang/be.js");
exports.be = be_1.default;
var bg_1 = __webpack_require__(/*! ./bg */ "../../node_modules/timeago.js/lib/lang/bg.js");
exports.bg = bg_1.default;
var bn_IN_1 = __webpack_require__(/*! ./bn_IN */ "../../node_modules/timeago.js/lib/lang/bn_IN.js");
exports.bn_IN = bn_IN_1.default;
var ca_1 = __webpack_require__(/*! ./ca */ "../../node_modules/timeago.js/lib/lang/ca.js");
exports.ca = ca_1.default;
var de_1 = __webpack_require__(/*! ./de */ "../../node_modules/timeago.js/lib/lang/de.js");
exports.de = de_1.default;
var el_1 = __webpack_require__(/*! ./el */ "../../node_modules/timeago.js/lib/lang/el.js");
exports.el = el_1.default;
var en_short_1 = __webpack_require__(/*! ./en_short */ "../../node_modules/timeago.js/lib/lang/en_short.js");
exports.en_short = en_short_1.default;
var en_US_1 = __webpack_require__(/*! ./en_US */ "../../node_modules/timeago.js/lib/lang/en_US.js");
exports.en_US = en_US_1.default;
var es_1 = __webpack_require__(/*! ./es */ "../../node_modules/timeago.js/lib/lang/es.js");
exports.es = es_1.default;
var eu_1 = __webpack_require__(/*! ./eu */ "../../node_modules/timeago.js/lib/lang/eu.js");
exports.eu = eu_1.default;
var fa_1 = __webpack_require__(/*! ./fa */ "../../node_modules/timeago.js/lib/lang/fa.js");
exports.fa = fa_1.default;
var fi_1 = __webpack_require__(/*! ./fi */ "../../node_modules/timeago.js/lib/lang/fi.js");
exports.fi = fi_1.default;
var fr_1 = __webpack_require__(/*! ./fr */ "../../node_modules/timeago.js/lib/lang/fr.js");
exports.fr = fr_1.default;
var gl_1 = __webpack_require__(/*! ./gl */ "../../node_modules/timeago.js/lib/lang/gl.js");
exports.gl = gl_1.default;
var he_1 = __webpack_require__(/*! ./he */ "../../node_modules/timeago.js/lib/lang/he.js");
exports.he = he_1.default;
var hi_IN_1 = __webpack_require__(/*! ./hi_IN */ "../../node_modules/timeago.js/lib/lang/hi_IN.js");
exports.hi_IN = hi_IN_1.default;
var hu_1 = __webpack_require__(/*! ./hu */ "../../node_modules/timeago.js/lib/lang/hu.js");
exports.hu = hu_1.default;
var id_ID_1 = __webpack_require__(/*! ./id_ID */ "../../node_modules/timeago.js/lib/lang/id_ID.js");
exports.id_ID = id_ID_1.default;
var it_1 = __webpack_require__(/*! ./it */ "../../node_modules/timeago.js/lib/lang/it.js");
exports.it = it_1.default;
var ja_1 = __webpack_require__(/*! ./ja */ "../../node_modules/timeago.js/lib/lang/ja.js");
exports.ja = ja_1.default;
var ko_1 = __webpack_require__(/*! ./ko */ "../../node_modules/timeago.js/lib/lang/ko.js");
exports.ko = ko_1.default;
var ml_1 = __webpack_require__(/*! ./ml */ "../../node_modules/timeago.js/lib/lang/ml.js");
exports.ml = ml_1.default;
var my_1 = __webpack_require__(/*! ./my */ "../../node_modules/timeago.js/lib/lang/my.js");
exports.my = my_1.default;
var nb_NO_1 = __webpack_require__(/*! ./nb_NO */ "../../node_modules/timeago.js/lib/lang/nb_NO.js");
exports.nb_NO = nb_NO_1.default;
var nl_1 = __webpack_require__(/*! ./nl */ "../../node_modules/timeago.js/lib/lang/nl.js");
exports.nl = nl_1.default;
var nn_NO_1 = __webpack_require__(/*! ./nn_NO */ "../../node_modules/timeago.js/lib/lang/nn_NO.js");
exports.nn_NO = nn_NO_1.default;
var pl_1 = __webpack_require__(/*! ./pl */ "../../node_modules/timeago.js/lib/lang/pl.js");
exports.pl = pl_1.default;
var pt_BR_1 = __webpack_require__(/*! ./pt_BR */ "../../node_modules/timeago.js/lib/lang/pt_BR.js");
exports.pt_BR = pt_BR_1.default;
var ro_1 = __webpack_require__(/*! ./ro */ "../../node_modules/timeago.js/lib/lang/ro.js");
exports.ro = ro_1.default;
var ru_1 = __webpack_require__(/*! ./ru */ "../../node_modules/timeago.js/lib/lang/ru.js");
exports.ru = ru_1.default;
var sq_1 = __webpack_require__(/*! ./sq */ "../../node_modules/timeago.js/lib/lang/sq.js");
exports.sq = sq_1.default;
var sr_1 = __webpack_require__(/*! ./sr */ "../../node_modules/timeago.js/lib/lang/sr.js");
exports.sr = sr_1.default;
var sv_1 = __webpack_require__(/*! ./sv */ "../../node_modules/timeago.js/lib/lang/sv.js");
exports.sv = sv_1.default;
var ta_1 = __webpack_require__(/*! ./ta */ "../../node_modules/timeago.js/lib/lang/ta.js");
exports.ta = ta_1.default;
var th_1 = __webpack_require__(/*! ./th */ "../../node_modules/timeago.js/lib/lang/th.js");
exports.th = th_1.default;
var tr_1 = __webpack_require__(/*! ./tr */ "../../node_modules/timeago.js/lib/lang/tr.js");
exports.tr = tr_1.default;
var uk_1 = __webpack_require__(/*! ./uk */ "../../node_modules/timeago.js/lib/lang/uk.js");
exports.uk = uk_1.default;
var vi_1 = __webpack_require__(/*! ./vi */ "../../node_modules/timeago.js/lib/lang/vi.js");
exports.vi = vi_1.default;
var zh_CN_1 = __webpack_require__(/*! ./zh_CN */ "../../node_modules/timeago.js/lib/lang/zh_CN.js");
exports.zh_CN = zh_CN_1.default;
var zh_TW_1 = __webpack_require__(/*! ./zh_TW */ "../../node_modules/timeago.js/lib/lang/zh_TW.js");
exports.zh_TW = zh_TW_1.default;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/it.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/it.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["poco fa", "fra poco"],
    ["%s secondi fa", "fra %s secondi"],
    ["un minuto fa", "fra un minuto"],
    ["%s minuti fa", "fra %s minuti"],
    ["un'ora fa", "fra un'ora"],
    ["%s ore fa", "fra %s ore"],
    ["un giorno fa", "fra un giorno"],
    ["%s giorni fa", "fra %s giorni"],
    ["una settimana fa", "fra una settimana"],
    ["%s settimane fa", "fra %s settimane"],
    ["un mese fa", "fra un mese"],
    ["%s mesi fa", "fra %s mesi"],
    ["un anno fa", "fra un anno"],
    ["%s anni fa", "fra %s anni"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/ja.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/ja.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u3059\u3053\u3057\u524D", "\u3059\u3050\u306B"],
    ["%s\u79D2\u524D", "%s\u79D2\u4EE5\u5185"],
    ["1\u5206\u524D", "1\u5206\u4EE5\u5185"],
    ["%s\u5206\u524D", "%s\u5206\u4EE5\u5185"],
    ["1\u6642\u9593\u524D", "1\u6642\u9593\u4EE5\u5185"],
    ["%s\u6642\u9593\u524D", "%s\u6642\u9593\u4EE5\u5185"],
    ["1\u65E5\u524D", "1\u65E5\u4EE5\u5185"],
    ["%s\u65E5\u524D", "%s\u65E5\u4EE5\u5185"],
    ["1\u9031\u9593\u524D", "1\u9031\u9593\u4EE5\u5185"],
    ["%s\u9031\u9593\u524D", "%s\u9031\u9593\u4EE5\u5185"],
    ["1\u30F6\u6708\u524D", "1\u30F6\u6708\u4EE5\u5185"],
    ["%s\u30F6\u6708\u524D", "%s\u30F6\u6708\u4EE5\u5185"],
    ["1\u5E74\u524D", "1\u5E74\u4EE5\u5185"],
    ["%s\u5E74\u524D", "%s\u5E74\u4EE5\u5185"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/ka.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/ka.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u10D0\u10DB \u10EC\u10D0\u10DB\u10E1", "\u10D0\u10EE\u10DA\u10D0"],
    ["%s \u10EC\u10D0\u10DB\u10D8\u10E1 \u10EC\u10D8\u10DC", "%s \u10EC\u10D0\u10DB\u10E8\u10D8"],
    ["1 \u10EC\u10E3\u10D7\u10D8\u10E1 \u10EC\u10D8\u10DC", "1 \u10EC\u10E3\u10D7\u10E8\u10D8"],
    ["%s \u10EC\u10E3\u10D7\u10D8\u10E1 \u10EC\u10D8\u10DC", "%s \u10EC\u10E3\u10D7\u10E8\u10D8"],
    ["1 \u10E1\u10D0\u10D0\u10D7\u10D8\u10E1 \u10EC\u10D8\u10DC", "1 \u10E1\u10D0\u10D0\u10D7\u10E8\u10D8"],
    ["%s \u10E1\u10D0\u10D0\u10D7\u10D8\u10E1 \u10EC\u10D8\u10DC", "%s \u10E1\u10D0\u10D0\u10D7\u10E8\u10D8"],
    ["1 \u10D3\u10E6\u10D8\u10E1 \u10EC\u10D8\u10DC", "1 \u10D3\u10E6\u10D4\u10E8\u10D8"],
    ["%s \u10D3\u10E6\u10D8\u10E1 \u10EC\u10D8\u10DC", "%s \u10D3\u10E6\u10D4\u10E8\u10D8"],
    ["1 \u10D9\u10D5\u10D8\u10E0\u10D8\u10E1 \u10EC\u10D8\u10DC", "1 \u10D9\u10D5\u10D8\u10E0\u10D0\u10E8\u10D8"],
    ["%s \u10D9\u10D5\u10D8\u10E0\u10D8\u10E1 \u10EC\u10D8\u10DC", "%s \u10D9\u10D5\u10D8\u10E0\u10D0\u10E8\u10D8"],
    ["1 \u10D7\u10D5\u10D8\u10E1 \u10EC\u10D8\u10DC", "1 \u10D7\u10D5\u10D4\u10E8\u10D8"],
    ["%s \u10D7\u10D5\u10D8\u10E1 \u10EC\u10D8\u10DC", "%s \u10D7\u10D5\u10D4\u10E8\u10D8"],
    ["1 \u10EC\u10DA\u10D8\u10E1 \u10EC\u10D8\u10DC", "1 \u10EC\u10D4\u10DA\u10D8\u10EC\u10D0\u10D3\u10E8\u10D8"],
    ["%s \u10EC\u10DA\u10D8\u10E1 \u10EC\u10D8\u10DC", "%s \u10EC\u10D4\u10DA\u10D8\u10EC\u10D0\u10D3\u10E8\u10D8"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/ko.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/ko.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\uBC29\uAE08", "\uACE7"],
    ["%s\uCD08 \uC804", "%s\uCD08 \uD6C4"],
    ["1\uBD84 \uC804", "1\uBD84 \uD6C4"],
    ["%s\uBD84 \uC804", "%s\uBD84 \uD6C4"],
    ["1\uC2DC\uAC04 \uC804", "1\uC2DC\uAC04 \uD6C4"],
    ["%s\uC2DC\uAC04 \uC804", "%s\uC2DC\uAC04 \uD6C4"],
    ["1\uC77C \uC804", "1\uC77C \uD6C4"],
    ["%s\uC77C \uC804", "%s\uC77C \uD6C4"],
    ["1\uC8FC\uC77C \uC804", "1\uC8FC\uC77C \uD6C4"],
    ["%s\uC8FC\uC77C \uC804", "%s\uC8FC\uC77C \uD6C4"],
    ["1\uAC1C\uC6D4 \uC804", "1\uAC1C\uC6D4 \uD6C4"],
    ["%s\uAC1C\uC6D4 \uC804", "%s\uAC1C\uC6D4 \uD6C4"],
    ["1\uB144 \uC804", "1\uB144 \uD6C4"],
    ["%s\uB144 \uC804", "%s\uB144 \uD6C4"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/ml.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/ml.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u0D07\u0D2A\u0D4D\u0D2A\u0D4B\u0D33\u0D4D\u200D", "\u0D15\u0D41\u0D31\u0D1A\u0D4D\u0D1A\u0D41 \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D"],
    ["%s \u0D38\u0D46\u0D15\u0D4D\u0D15\u0D28\u0D4D\u0D31\u0D4D\u200C\u0D15\u0D33\u0D4D\u200D\u0D15\u0D4D\u0D15\u0D4D \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "%s \u0D38\u0D46\u0D15\u0D4D\u0D15\u0D28\u0D4D\u0D31\u0D3F\u0D32\u0D4D\u200D"],
    ["1 \u0D2E\u0D3F\u0D28\u0D3F\u0D31\u0D4D\u0D31\u0D3F\u0D28\u0D41 \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "1 \u0D2E\u0D3F\u0D28\u0D3F\u0D31\u0D4D\u0D31\u0D3F\u0D32\u0D4D\u200D"],
    ["%s \u0D2E\u0D3F\u0D28\u0D3F\u0D31\u0D4D\u0D31\u0D41\u0D15\u0D33\u0D4D\u200D\u0D15\u0D4D\u0D15\u0D4D \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A", "%s \u0D2E\u0D3F\u0D28\u0D3F\u0D31\u0D4D\u0D31\u0D3F\u0D32\u0D4D\u200D"],
    ["1 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D31\u0D3F\u0D28\u0D41 \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "1 \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D31\u0D3F\u0D32\u0D4D\u200D"],
    ["%s \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D31\u0D41\u0D15\u0D33\u0D4D\u200D\u0D15\u0D4D\u0D15\u0D41 \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "%s \u0D2E\u0D23\u0D3F\u0D15\u0D4D\u0D15\u0D42\u0D31\u0D3F\u0D32\u0D4D\u200D"],
    ["1 \u0D12\u0D30\u0D41 \u0D26\u0D3F\u0D35\u0D38\u0D02 \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "1 \u0D26\u0D3F\u0D35\u0D38\u0D24\u0D4D\u0D24\u0D3F\u0D32\u0D4D\u200D"],
    ["%s \u0D26\u0D3F\u0D35\u0D38\u0D19\u0D4D\u0D19\u0D33\u0D4D\u200D\u0D15\u0D4D \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "%s \u0D26\u0D3F\u0D35\u0D38\u0D19\u0D4D\u0D19\u0D33\u0D4D\u200D\u0D15\u0D4D\u0D15\u0D41\u0D33\u0D4D\u0D33\u0D3F\u0D32\u0D4D\u200D"],
    ["1 \u0D06\u0D34\u0D4D\u0D1A \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "1 \u0D06\u0D34\u0D4D\u0D1A\u0D2F\u0D3F\u0D32\u0D4D\u200D"],
    ["%s \u0D06\u0D34\u0D4D\u0D1A\u0D15\u0D33\u0D4D\u200D\u0D15\u0D4D\u0D15\u0D4D \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "%s \u0D06\u0D34\u0D4D\u0D1A\u0D15\u0D33\u0D4D\u200D\u0D15\u0D4D\u0D15\u0D41\u0D33\u0D4D\u0D33\u0D3F\u0D32\u0D4D\u200D"],
    ["1 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D3F\u0D28\u0D41 \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "1 \u0D2E\u0D3E\u0D38\u0D24\u0D4D\u0D24\u0D3F\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D3F\u0D32\u0D4D\u200D"],
    ["%s \u0D2E\u0D3E\u0D38\u0D19\u0D4D\u0D19\u0D33\u0D4D\u200D\u0D15\u0D4D\u0D15\u0D4D \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "%s \u0D2E\u0D3E\u0D38\u0D19\u0D4D\u0D19\u0D33\u0D4D\u200D\u0D15\u0D4D\u0D15\u0D41\u0D33\u0D4D\u0D33\u0D3F\u0D32\u0D4D\u200D"],
    ["1 \u0D35\u0D30\u0D4D\u200D\u0D37\u0D24\u0D4D\u0D24\u0D3F\u0D28\u0D41  \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "1 \u0D35\u0D30\u0D4D\u200D\u0D37\u0D24\u0D4D\u0D24\u0D3F\u0D28\u0D41\u0D33\u0D4D\u0D33\u0D3F\u0D32\u0D4D\u200D"],
    ["%s \u0D35\u0D30\u0D4D\u200D\u0D37\u0D19\u0D4D\u0D19\u0D33\u0D4D\u200D\u0D15\u0D4D\u0D15\u0D41 \u0D2E\u0D41\u0D28\u0D4D\u200D\u0D2A\u0D4D", "%s \u0D35\u0D30\u0D4D\u200D\u0D37\u0D19\u0D4D\u0D19\u0D33\u0D4D\u200D\u0D15\u0D4D\u0D15\u0D41\u0D32\u0D4D\u0D32\u0D4D\u0D33\u0D3F\u0D32\u0D4D\u200D"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/my.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/my.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u101A\u1001\u102F\u1021\u1010\u103D\u1004\u103A\u1038", "\u101A\u1001\u102F"],
    ["%s \u1005\u1000\u1039\u1000\u1014\u1037\u103A \u1021\u1000\u103C\u102C\u1000", "%s \u1005\u1000\u1039\u1000\u1014\u1037\u103A\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["1 \u1019\u102D\u1014\u1005\u103A \u1021\u1000\u103C\u102C\u1000", "1 \u1019\u102D\u1014\u1005\u103A\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["%s \u1019\u102D\u1014\u1005\u103A \u1021\u1000\u103C\u102C\u1000", "%s \u1019\u102D\u1014\u1005\u103A\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["1 \u1014\u102C\u101B\u102E \u1021\u1000\u103C\u102C\u1000", "1 \u1014\u102C\u101B\u102E\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["%s \u1014\u102C\u101B\u102E \u1021\u1000\u103C\u102C\u1000", "%s \u1014\u102C\u101B\u102E\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["1 \u101B\u1000\u103A \u1021\u1000\u103C\u102C\u1000", "1 \u101B\u1000\u103A\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["%s \u101B\u1000\u103A \u1021\u1000\u103C\u102C\u1000", "%s \u101B\u1000\u103A\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["1 \u1015\u1010\u103A \u1021\u1000\u103C\u102C\u1000", "1 \u1015\u1010\u103A\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["%s \u1015\u1010\u103A \u1021\u1000\u103C\u102C\u1000", "%s \u1015\u1010\u103A\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["1 \u101C \u1021\u1000\u103C\u102C\u1000", "1 \u101C\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["%s \u101C \u1021\u1000\u103C\u102C\u1000", "%s \u101C\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["1 \u1014\u103E\u1005\u103A \u1021\u1000\u103C\u102C\u1000", "1 \u1014\u103E\u1005\u103A\u1021\u1010\u103D\u1004\u103A\u1038"],
    ["%s \u1014\u103E\u1005\u103A \u1021\u1000\u103C\u102C\u1000", "%s \u1014\u103E\u1005\u103A\u1021\u1010\u103D\u1004\u103A\u1038"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/nb_NO.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/nb_NO.js ***!
  \*******************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["akkurat n\xE5", "om litt"],
    ["%s sekunder siden", "om %s sekunder"],
    ["1 minutt siden", "om 1 minutt"],
    ["%s minutter siden", "om %s minutter"],
    ["1 time siden", "om 1 time"],
    ["%s timer siden", "om %s timer"],
    ["1 dag siden", "om 1 dag"],
    ["%s dager siden", "om %s dager"],
    ["1 uke siden", "om 1 uke"],
    ["%s uker siden", "om %s uker"],
    ["1 m\xE5ned siden", "om 1 m\xE5ned"],
    ["%s m\xE5neder siden", "om %s m\xE5neder"],
    ["1 \xE5r siden", "om 1 \xE5r"],
    ["%s \xE5r siden", "om %s \xE5r"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/nl.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/nl.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["recent", "binnenkort"],
    ["%s seconden geleden", "binnen %s seconden"],
    ["1 minuut geleden", "binnen 1 minuut"],
    ["%s minuten geleden", "binnen %s minuten"],
    ["1 uur geleden", "binnen 1 uur"],
    ["%s uur geleden", "binnen %s uur"],
    ["1 dag geleden", "binnen 1 dag"],
    ["%s dagen geleden", "binnen %s dagen"],
    ["1 week geleden", "binnen 1 week"],
    ["%s weken geleden", "binnen %s weken"],
    ["1 maand geleden", "binnen 1 maand"],
    ["%s maanden geleden", "binnen %s maanden"],
    ["1 jaar geleden", "binnen 1 jaar"],
    ["%s jaar geleden", "binnen %s jaar"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/nn_NO.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/nn_NO.js ***!
  \*******************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["nett no", "om litt"],
    ["%s sekund sidan", "om %s sekund"],
    ["1 minutt sidan", "om 1 minutt"],
    ["%s minutt sidan", "om %s minutt"],
    ["1 time sidan", "om 1 time"],
    ["%s timar sidan", "om %s timar"],
    ["1 dag sidan", "om 1 dag"],
    ["%s dagar sidan", "om %s dagar"],
    ["1 veke sidan", "om 1 veke"],
    ["%s veker sidan", "om %s veker"],
    ["1 m\xE5nad sidan", "om 1 m\xE5nad"],
    ["%s m\xE5nadar sidan", "om %s m\xE5nadar"],
    ["1 \xE5r sidan", "om 1 \xE5r"],
    ["%s \xE5r sidan", "om %s \xE5r"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/oc.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/oc.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["fa un moment", "d'aqu\xED un moment"],
    ["fa %s segondas", "d'aqu\xED %s segondas"],
    ["fa 1 minuta", "d'aqu\xED 1 minuta"],
    ["fa %s minutas", "d'aqu\xED %s minutas"],
    ["fa 1 ora", "d'aqu\xED 1 ora"],
    ["fa %s oras", "d'aqu\xED %s oras"],
    ["fa 1 jorn", "d'aqu\xED 1 jorn"],
    ["fa %s jorns", "d'aqu\xED %s jorns"],
    ["fa 1 setmana", "d'aqu\xED 1 setmana"],
    ["fa %s setmanas", "d'aqu\xED %s setmanas"],
    ["fa 1 mes", "d'aqu\xED 1 mes"],
    ["fa %s meses", "d'aqu\xED %s meses"],
    ["fa 1 an", "d'aqu\xED 1 an"],
    ["fa %s ans", "d'aqu\xED %s ans"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/pl.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/pl.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
var l = [
  ["w tej chwili", "za chwil\u0119"],
  ["%s sekund temu", "za %s sekund"],
  ["1 minut\u0119 temu", "za 1 minut\u0119"],
  ["%s minut temu", "za %s minut"],
  ["1 godzin\u0119 temu", "za 1 godzin\u0119"],
  ["%s godzin temu", "za %s godzin"],
  ["1 dzie\u0144 temu", "za 1 dzie\u0144"],
  ["%s dni temu", "za %s dni"],
  ["1 tydzie\u0144 temu", "za 1 tydzie\u0144"],
  ["%s tygodni temu", "za %s tygodni"],
  ["1 miesi\u0105c temu", "za 1 miesi\u0105c"],
  ["%s miesi\u0119cy temu", "za %s miesi\u0119cy"],
  ["1 rok temu", "za 1 rok"],
  ["%s lat temu", "za %s lat"],
  ["%s sekundy temu", "za %s sekundy"],
  ["%s minuty temu", "za %s minuty"],
  ["%s godziny temu", "za %s godziny"],
  ["%s dni temu", "za %s dni"],
  ["%s tygodnie temu", "za %s tygodnie"],
  ["%s miesi\u0105ce temu", "za %s miesi\u0105ce"],
  ["%s lata temu", "za %s lata"]
];
function default_1(number, index) {
  return l[index & 1 ? number % 10 > 4 || number % 10 < 2 || 1 === ~~(number / 10) % 10 ? index : ++index / 2 + 13 : index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/pt_BR.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/pt_BR.js ***!
  \*******************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["agora mesmo", "agora"],
    ["h\xE1 %s segundos", "em %s segundos"],
    ["h\xE1 um minuto", "em um minuto"],
    ["h\xE1 %s minutos", "em %s minutos"],
    ["h\xE1 uma hora", "em uma hora"],
    ["h\xE1 %s horas", "em %s horas"],
    ["h\xE1 um dia", "em um dia"],
    ["h\xE1 %s dias", "em %s dias"],
    ["h\xE1 uma semana", "em uma semana"],
    ["h\xE1 %s semanas", "em %s semanas"],
    ["h\xE1 um m\xEAs", "em um m\xEAs"],
    ["h\xE1 %s meses", "em %s meses"],
    ["h\xE1 um ano", "em um ano"],
    ["h\xE1 %s anos", "em %s anos"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/ro.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/ro.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  var langTable = [
    ["chiar acum", "chiar acum"],
    ["acum %s secunde", "peste %s secunde"],
    ["acum un minut", "peste un minut"],
    ["acum %s minute", "peste %s minute"],
    ["acum o or\u0103", "peste o or\u0103"],
    ["acum %s ore", "peste %s ore"],
    ["acum o zi", "peste o zi"],
    ["acum %s zile", "peste %s zile"],
    ["acum o s\u0103pt\u0103m\xE2n\u0103", "peste o s\u0103pt\u0103m\xE2n\u0103"],
    ["acum %s s\u0103pt\u0103m\xE2ni", "peste %s s\u0103pt\u0103m\xE2ni"],
    ["acum o lun\u0103", "peste o lun\u0103"],
    ["acum %s luni", "peste %s luni"],
    ["acum un an", "peste un an"],
    ["acum %s ani", "peste %s ani"]
  ];
  if (number < 20) {
    return langTable[index];
  }
  return [langTable[index][0].replace("%s", "%s de"), langTable[index][1].replace("%s", "%s de")];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/ru.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/ru.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function formatNum(f1, f, s, t, n) {
  var n10 = n % 10;
  var str = t;
  if (n === 1) {
    str = f1;
  } else if (n10 === 1 && n > 20) {
    str = f;
  } else if (n10 > 1 && n10 < 5 && (n > 20 || n < 10)) {
    str = s;
  }
  return str;
}
var seconds = formatNum.bind(null, "\u0441\u0435\u043A\u0443\u043D\u0434\u0443", "%s \u0441\u0435\u043A\u0443\u043D\u0434\u0443", "%s \u0441\u0435\u043A\u0443\u043D\u0434\u044B", "%s \u0441\u0435\u043A\u0443\u043D\u0434"), minutes = formatNum.bind(null, "\u043C\u0438\u043D\u0443\u0442\u0443", "%s \u043C\u0438\u043D\u0443\u0442\u0443", "%s \u043C\u0438\u043D\u0443\u0442\u044B", "%s \u043C\u0438\u043D\u0443\u0442"), hours = formatNum.bind(null, "\u0447\u0430\u0441", "%s \u0447\u0430\u0441", "%s \u0447\u0430\u0441\u0430", "%s \u0447\u0430\u0441\u043E\u0432"), days = formatNum.bind(null, "\u0434\u0435\u043D\u044C", "%s \u0434\u0435\u043D\u044C", "%s \u0434\u043D\u044F", "%s \u0434\u043D\u0435\u0439"), weeks = formatNum.bind(null, "\u043D\u0435\u0434\u0435\u043B\u044E", "%s \u043D\u0435\u0434\u0435\u043B\u044E", "%s \u043D\u0435\u0434\u0435\u043B\u0438", "%s \u043D\u0435\u0434\u0435\u043B\u044C"), months = formatNum.bind(null, "\u043C\u0435\u0441\u044F\u0446", "%s \u043C\u0435\u0441\u044F\u0446", "%s \u043C\u0435\u0441\u044F\u0446\u0430", "%s \u043C\u0435\u0441\u044F\u0446\u0435\u0432"), years = formatNum.bind(null, "\u0433\u043E\u0434", "%s \u0433\u043E\u0434", "%s \u0433\u043E\u0434\u0430", "%s \u043B\u0435\u0442");
function default_1(number, index) {
  switch (index) {
    case 0:
      return ["\u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u043E", "\u0447\u0435\u0440\u0435\u0437 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0435\u043A\u0443\u043D\u0434"];
    case 1:
      return [seconds(number) + " \u043D\u0430\u0437\u0430\u0434", "\u0447\u0435\u0440\u0435\u0437 " + seconds(number)];
    case 2:
    // ['минуту назад', 'через минуту'];
    case 3:
      return [minutes(number) + " \u043D\u0430\u0437\u0430\u0434", "\u0447\u0435\u0440\u0435\u0437 " + minutes(number)];
    case 4:
    // ['час назад', 'через час'];
    case 5:
      return [hours(number) + " \u043D\u0430\u0437\u0430\u0434", "\u0447\u0435\u0440\u0435\u0437 " + hours(number)];
    case 6:
      return ["\u0432\u0447\u0435\u0440\u0430", "\u0437\u0430\u0432\u0442\u0440\u0430"];
    case 7:
      return [days(number) + " \u043D\u0430\u0437\u0430\u0434", "\u0447\u0435\u0440\u0435\u0437 " + days(number)];
    case 8:
    // ['неделю назад', 'через неделю'];
    case 9:
      return [weeks(number) + " \u043D\u0430\u0437\u0430\u0434", "\u0447\u0435\u0440\u0435\u0437 " + weeks(number)];
    case 10:
    // ['месяц назад', 'через месяц'];
    case 11:
      return [months(number) + " \u043D\u0430\u0437\u0430\u0434", "\u0447\u0435\u0440\u0435\u0437 " + months(number)];
    case 12:
    // ['год назад', 'через год'];
    case 13:
      return [years(number) + " \u043D\u0430\u0437\u0430\u0434", "\u0447\u0435\u0440\u0435\u0437 " + years(number)];
    default:
      return ["", ""];
  }
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/sq.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/sq.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["pak m\xEB par\xEB", "pas pak"],
    ["para %s sekondash", "pas %s sekondash"],
    ["para nj\xEB minute", "pas nj\xEB minute"],
    ["para %s minutash", "pas %s minutash"],
    ["para nj\xEB ore", "pas nj\xEB ore"],
    ["para %s or\xEBsh", "pas %s or\xEBsh"],
    ["dje", "nes\xEBr"],
    ["para %s dit\xEBsh", "pas %s dit\xEBsh"],
    ["para nj\xEB jave", "pas nj\xEB jave"],
    ["para %s jav\xEBsh", "pas %s jav\xEBsh"],
    ["para nj\xEB muaji", "pas nj\xEB muaji"],
    ["para %s muajsh", "pas %s muajsh"],
    ["para nj\xEB viti", "pas nj\xEB viti"],
    ["para %s vjet\xEBsh", "pas %s vjet\xEBsh"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/sr.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/sr.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function formatNum(single, one, few, other, n) {
  var rem10 = n % 10;
  var rem100 = n % 100;
  if (n == 1) {
    return single;
  } else if (rem10 == 1 && rem100 != 11) {
    return one;
  } else if (rem10 >= 2 && rem10 <= 4 && !(rem100 >= 12 && rem100 <= 14)) {
    return few;
  } else {
    return other;
  }
}
var seconds = formatNum.bind(null, "1 \u0441\u0435\u043A\u0443\u043D\u0434", "%s \u0441\u0435\u043A\u0443\u043D\u0434", "%s \u0441\u0435\u043A\u0443\u043D\u0434\u0435", "%s \u0441\u0435\u043A\u0443\u043D\u0434\u0438"), minutes = formatNum.bind(null, "1 \u043C\u0438\u043D\u0443\u0442", "%s \u043C\u0438\u043D\u0443\u0442", "%s \u043C\u0438\u043D\u0443\u0442\u0435", "%s \u043C\u0438\u043D\u0443\u0442\u0430"), hours = formatNum.bind(null, "\u0441\u0430\u0442 \u0432\u0440\u0435\u043C\u0435\u043D\u0430", "%s \u0441\u0430\u0442", "%s \u0441\u0430\u0442\u0430", "%s \u0441\u0430\u0442\u0438"), days = formatNum.bind(null, "1 \u0434\u0430\u043D", "%s \u0434\u0430\u043D", "%s \u0434\u0430\u043D\u0430", "%s \u0434\u0430\u043D\u0430"), weeks = formatNum.bind(null, "\u043D\u0435\u0434\u0435\u0459\u0443 \u0434\u0430\u043D\u0430", "%s \u043D\u0435\u0434\u0435\u0459\u0443", "%s \u043D\u0435\u0434\u0435\u0459\u0435", "%s \u043D\u0435\u0434\u0435\u0459\u0430"), months = formatNum.bind(null, "\u043C\u0435\u0441\u0435\u0446 \u0434\u0430\u043D\u0430", "%s \u043C\u0435\u0441\u0435\u0446", "%s \u043C\u0435\u0441\u0435\u0446\u0430", "%s \u043C\u0435\u0441\u0435\u0446\u0438"), years = formatNum.bind(null, "\u0433\u043E\u0434\u0438\u043D\u0443 \u0434\u0430\u043D\u0430", "%s \u0433\u043E\u0434\u0438\u043D\u0443", "%s \u0433\u043E\u0434\u0438\u043D\u0435", "%s \u0433\u043E\u0434\u0438\u043D\u0430");
function default_1(number, index) {
  switch (index) {
    case 0:
      return ["\u043C\u0430\u043B\u043E\u043F\u0440\u0435", "\u0443\u043F\u0440\u0430\u0432\u043E \u0441\u0430\u0434"];
    case 1:
      return ["\u043F\u0440\u0435 " + seconds(number), "\u0437\u0430 " + seconds(number)];
    case 2:
    case 3:
      return ["\u043F\u0440\u0435 " + minutes(number), "\u0437\u0430 " + minutes(number)];
    case 4:
    case 5:
      return ["\u043F\u0440\u0435 " + hours(number), "\u0437\u0430 " + hours(number)];
    case 6:
    case 7:
      return ["\u043F\u0440\u0435 " + days(number), "\u0437\u0430 " + days(number)];
    case 8:
    case 9:
      return ["\u043F\u0440\u0435 " + weeks(number), "\u0437\u0430 " + weeks(number)];
    case 10:
    case 11:
      return ["\u043F\u0440\u0435 " + months(number), "\u0437\u0430 " + months(number)];
    case 12:
    case 13:
      return ["\u043F\u0440\u0435 " + years(number), "\u0437\u0430 " + years(number)];
    default:
      return ["", ""];
  }
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/sv.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/sv.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["just nu", "om en stund"],
    ["%s sekunder sedan", "om %s sekunder"],
    ["1 minut sedan", "om 1 minut"],
    ["%s minuter sedan", "om %s minuter"],
    ["1 timme sedan", "om 1 timme"],
    ["%s timmar sedan", "om %s timmar"],
    ["1 dag sedan", "om 1 dag"],
    ["%s dagar sedan", "om %s dagar"],
    ["1 vecka sedan", "om 1 vecka"],
    ["%s veckor sedan", "om %s veckor"],
    ["1 m\xE5nad sedan", "om 1 m\xE5nad"],
    ["%s m\xE5nader sedan", "om %s m\xE5nader"],
    ["1 \xE5r sedan", "om 1 \xE5r"],
    ["%s \xE5r sedan", "om %s \xE5r"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/ta.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/ta.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u0B87\u0BAA\u0BCD\u0BAA\u0BC7\u0BBE\u0BA4\u0BC1", "\u0B9A\u0BB1\u0BCD\u0BB1\u0BC1 \u0BA8\u0BC7\u0BB0\u0BAE\u0BCD \u0BAE\u0BC1\u0BA9\u0BCD\u0BAA\u0BC1"],
    ["%s \u0BA8\u0BCA\u0B9F\u0BBF\u0B95\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "%s \u0BA8\u0BCA\u0B9F\u0BBF\u0B95\u0BB3\u0BBF\u0BB2\u0BCD"],
    ["1 \u0BA8\u0BBF\u0BAE\u0BBF\u0B9F\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "1 \u0BA8\u0BBF\u0BAE\u0BBF\u0B9F\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD"],
    ["%s \u0BA8\u0BBF\u0BAE\u0BBF\u0B9F\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "%s \u0BA8\u0BBF\u0BAE\u0BBF\u0B9F\u0B99\u0BCD\u0B95\u0BB3\u0BBF\u0BB2\u0BCD"],
    ["1 \u0BAE\u0BA3\u0BBF \u0BA8\u0BC7\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "1 \u0BAE\u0BA3\u0BBF \u0BA8\u0BC7\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1\u0BB3\u0BCD"],
    ["%s \u0BAE\u0BA3\u0BBF \u0BA8\u0BC7\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "%s \u0BAE\u0BA3\u0BBF \u0BA8\u0BC7\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1\u0BB3\u0BCD"],
    ["1 \u0BA8\u0BBE\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "1 \u0BA8\u0BBE\u0BB3\u0BBF\u0BB2\u0BCD"],
    ["%s \u0BA8\u0BBE\u0B9F\u0BCD\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "%s \u0BA8\u0BBE\u0B9F\u0BCD\u0B95\u0BB3\u0BBF\u0BB2\u0BCD"],
    ["1 \u0BB5\u0BBE\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "1 \u0BB5\u0BBE\u0BB0\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD"],
    ["%s \u0BB5\u0BBE\u0BB0\u0B99\u0BCD\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "%s \u0BB5\u0BBE\u0BB0\u0B99\u0BCD\u0B95\u0BB3\u0BBF\u0BB2\u0BCD"],
    ["1 \u0BAE\u0BBE\u0BA4\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "1 \u0BAE\u0BBE\u0BA4\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD"],
    ["%s \u0BAE\u0BBE\u0BA4\u0B99\u0BCD\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "%s \u0BAE\u0BBE\u0BA4\u0B99\u0BCD\u0B95\u0BB3\u0BBF\u0BB2\u0BCD"],
    ["1 \u0BB5\u0BB0\u0BC1\u0B9F\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "1 \u0BB5\u0BB0\u0BC1\u0B9F\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD"],
    ["%s \u0BB5\u0BB0\u0BC1\u0B9F\u0B99\u0BCD\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1 \u0BAE\u0BC1\u0BA9\u0BCD", "%s \u0BB5\u0BB0\u0BC1\u0B9F\u0B99\u0BCD\u0B95\u0BB3\u0BBF\u0BB2\u0BCD"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/th.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/th.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E2A\u0E31\u0E01\u0E04\u0E23\u0E39\u0E48\u0E19\u0E35\u0E49", "\u0E2D\u0E35\u0E01\u0E2A\u0E31\u0E01\u0E04\u0E23\u0E39\u0E48"],
    ["%s \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 %s \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35"],
    ["1 \u0E19\u0E32\u0E17\u0E35\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 1 \u0E19\u0E32\u0E17\u0E35"],
    ["%s \u0E19\u0E32\u0E17\u0E35\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 %s \u0E19\u0E32\u0E17\u0E35"],
    ["1 \u0E0A\u0E31\u0E48\u0E27\u0E42\u0E21\u0E07\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 1 \u0E0A\u0E31\u0E48\u0E27\u0E42\u0E21\u0E07"],
    ["%s \u0E0A\u0E31\u0E48\u0E27\u0E42\u0E21\u0E07\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 %s \u0E0A\u0E31\u0E48\u0E27\u0E42\u0E21\u0E07"],
    ["1 \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 1 \u0E27\u0E31\u0E19"],
    ["%s \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 %s \u0E27\u0E31\u0E19"],
    ["1 \u0E2D\u0E32\u0E17\u0E34\u0E15\u0E22\u0E4C\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 1 \u0E2D\u0E32\u0E17\u0E34\u0E15\u0E22\u0E4C"],
    ["%s \u0E2D\u0E32\u0E17\u0E34\u0E15\u0E22\u0E4C\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 %s \u0E2D\u0E32\u0E17\u0E34\u0E15\u0E22\u0E4C"],
    ["1 \u0E40\u0E14\u0E37\u0E2D\u0E19\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 1 \u0E40\u0E14\u0E37\u0E2D\u0E19"],
    ["%s \u0E40\u0E14\u0E37\u0E2D\u0E19\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 %s \u0E40\u0E14\u0E37\u0E2D\u0E19"],
    ["1 \u0E1B\u0E35\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 1 \u0E1B\u0E35"],
    ["%s \u0E1B\u0E35\u0E17\u0E35\u0E48\u0E41\u0E25\u0E49\u0E27", "\u0E43\u0E19 %s \u0E1B\u0E35"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/tr.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/tr.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["az \xF6nce", "\u015Fimdi"],
    ["%s saniye \xF6nce", "%s saniye i\xE7inde"],
    ["1 dakika \xF6nce", "1 dakika i\xE7inde"],
    ["%s dakika \xF6nce", "%s dakika i\xE7inde"],
    ["1 saat \xF6nce", "1 saat i\xE7inde"],
    ["%s saat \xF6nce", "%s saat i\xE7inde"],
    ["1 g\xFCn \xF6nce", "1 g\xFCn i\xE7inde"],
    ["%s g\xFCn \xF6nce", "%s g\xFCn i\xE7inde"],
    ["1 hafta \xF6nce", "1 hafta i\xE7inde"],
    ["%s hafta \xF6nce", "%s hafta i\xE7inde"],
    ["1 ay \xF6nce", "1 ay i\xE7inde"],
    ["%s ay \xF6nce", "%s ay i\xE7inde"],
    ["1 y\u0131l \xF6nce", "1 y\u0131l i\xE7inde"],
    ["%s y\u0131l \xF6nce", "%s y\u0131l i\xE7inde"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/uk.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/uk.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function formatNum(f1, f, s, t, n) {
  var n10 = n % 10;
  var str = t;
  if (n === 1) {
    str = f1;
  } else if (n10 === 1 && n > 20) {
    str = f;
  } else if (n10 > 1 && n10 < 5 && (n > 20 || n < 10)) {
    str = s;
  }
  return str;
}
var seconds = formatNum.bind(null, "\u0441\u0435\u043A\u0443\u043D\u0434\u0443", "%s \u0441\u0435\u043A\u0443\u043D\u0434\u0443", "%s \u0441\u0435\u043A\u0443\u043D\u0434\u0438", "%s \u0441\u0435\u043A\u0443\u043D\u0434"), minutes = formatNum.bind(null, "\u0445\u0432\u0438\u043B\u0438\u043D\u0443", "%s \u0445\u0432\u0438\u043B\u0438\u043D\u0443", "%s \u0445\u0432\u0438\u043B\u0438\u043D\u0438", "%s \u0445\u0432\u0438\u043B\u0438\u043D"), hours = formatNum.bind(null, "\u0433\u043E\u0434\u0438\u043D\u0443", "%s \u0433\u043E\u0434\u0438\u043D\u0443", "%s \u0433\u043E\u0434\u0438\u043D\u0438", "%s \u0433\u043E\u0434\u0438\u043D"), days = formatNum.bind(null, "\u0434\u0435\u043D\u044C", "%s \u0434\u0435\u043D\u044C", "%s \u0434\u043D\u0456", "%s \u0434\u043D\u0456\u0432"), weeks = formatNum.bind(null, "\u0442\u0438\u0436\u0434\u0435\u043D\u044C", "%s \u0442\u0438\u0436\u0434\u0435\u043D\u044C", "%s \u0442\u0438\u0436\u0434\u043D\u0456", "%s \u0442\u0438\u0436\u0434\u043D\u0456\u0432"), months = formatNum.bind(null, "\u043C\u0456\u0441\u044F\u0446\u044C", "%s \u043C\u0456\u0441\u044F\u0446\u044C", "%s \u043C\u0456\u0441\u044F\u0446\u0456", "%s \u043C\u0456\u0441\u044F\u0446\u0456\u0432"), years = formatNum.bind(null, "\u0440\u0456\u043A", "%s \u0440\u0456\u043A", "%s \u0440\u043E\u043A\u0438", "%s \u0440\u043E\u043A\u0456\u0432");
function default_1(number, index) {
  switch (index) {
    case 0:
      return ["\u0449\u043E\u0439\u043D\u043E", "\u0447\u0435\u0440\u0435\u0437 \u0434\u0435\u043A\u0456\u043B\u044C\u043A\u0430 \u0441\u0435\u043A\u0443\u043D\u0434"];
    case 1:
      return [seconds(number) + " \u0442\u043E\u043C\u0443", "\u0447\u0435\u0440\u0435\u0437 " + seconds(number)];
    case 2:
    case 3:
      return [minutes(number) + " \u0442\u043E\u043C\u0443", "\u0447\u0435\u0440\u0435\u0437 " + minutes(number)];
    case 4:
    case 5:
      return [hours(number) + " \u0442\u043E\u043C\u0443", "\u0447\u0435\u0440\u0435\u0437 " + hours(number)];
    case 6:
    case 7:
      return [days(number) + " \u0442\u043E\u043C\u0443", "\u0447\u0435\u0440\u0435\u0437 " + days(number)];
    case 8:
    case 9:
      return [weeks(number) + " \u0442\u043E\u043C\u0443", "\u0447\u0435\u0440\u0435\u0437 " + weeks(number)];
    case 10:
    case 11:
      return [months(number) + " \u0442\u043E\u043C\u0443", "\u0447\u0435\u0440\u0435\u0437 " + months(number)];
    case 12:
    case 13:
      return [years(number) + " \u0442\u043E\u043C\u0443", "\u0447\u0435\u0440\u0435\u0437 " + years(number)];
    default:
      return ["", ""];
  }
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/vi.js"
/*!****************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/vi.js ***!
  \****************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["v\u1EEBa xong", "m\u1ED9t l\xFAc"],
    ["%s gi\xE2y tr\u01B0\u1EDBc", "trong %s gi\xE2y"],
    ["1 ph\xFAt tr\u01B0\u1EDBc", "trong 1 ph\xFAt"],
    ["%s ph\xFAt tr\u01B0\u1EDBc", "trong %s ph\xFAt"],
    ["1 gi\u1EDD tr\u01B0\u1EDBc", "trong 1 gi\u1EDD"],
    ["%s gi\u1EDD tr\u01B0\u1EDBc", "trong %s gi\u1EDD"],
    ["1 ng\xE0y tr\u01B0\u1EDBc", "trong 1 ng\xE0y"],
    ["%s ng\xE0y tr\u01B0\u1EDBc", "trong %s ng\xE0y"],
    ["1 tu\u1EA7n tr\u01B0\u1EDBc", "trong 1 tu\u1EA7n"],
    ["%s tu\u1EA7n tr\u01B0\u1EDBc", "trong %s tu\u1EA7n"],
    ["1 th\xE1ng tr\u01B0\u1EDBc", "trong 1 th\xE1ng"],
    ["%s th\xE1ng tr\u01B0\u1EDBc", "trong %s th\xE1ng"],
    ["1 n\u0103m tr\u01B0\u1EDBc", "trong 1 n\u0103m"],
    ["%s n\u0103m tr\u01B0\u1EDBc", "trong %s n\u0103m"]
  ][index];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/zh_CN.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/zh_CN.js ***!
  \*******************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
var ZH_CN = ["\u79D2", "\u5206\u949F", "\u5C0F\u65F6", "\u5929", "\u5468", "\u4E2A\u6708", "\u5E74"];
function default_1(diff, idx) {
  if (idx === 0)
    return ["\u521A\u521A", "\u7247\u523B\u540E"];
  var unit = ZH_CN[~~(idx / 2)];
  return [diff + " " + unit + "\u524D", diff + " " + unit + "\u540E"];
}
exports["default"] = default_1;


/***/ },

/***/ "../../node_modules/timeago.js/lib/lang/zh_TW.js"
/*!*******************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/zh_TW.js ***!
  \*******************************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
function default_1(number, index) {
  return [
    ["\u525B\u525B", "\u7247\u523B\u5F8C"],
    ["%s \u79D2\u524D", "%s \u79D2\u5F8C"],
    ["1 \u5206\u9418\u524D", "1 \u5206\u9418\u5F8C"],
    ["%s \u5206\u9418\u524D", "%s \u5206\u9418\u5F8C"],
    ["1 \u5C0F\u6642\u524D", "1 \u5C0F\u6642\u5F8C"],
    ["%s \u5C0F\u6642\u524D", "%s \u5C0F\u6642\u5F8C"],
    ["1 \u5929\u524D", "1 \u5929\u5F8C"],
    ["%s \u5929\u524D", "%s \u5929\u5F8C"],
    ["1 \u9031\u524D", "1 \u9031\u5F8C"],
    ["%s \u9031\u524D", "%s \u9031\u5F8C"],
    ["1 \u500B\u6708\u524D", "1 \u500B\u6708\u5F8C"],
    ["%s \u500B\u6708\u524D", "%s \u500B\u6708\u5F8C"],
    ["1 \u5E74\u524D", "1 \u5E74\u5F8C"],
    ["%s \u5E74\u524D", "%s \u5E74\u5F8C"]
  ][index];
}
exports["default"] = default_1;


/***/ }

}]);