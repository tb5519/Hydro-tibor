!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"d20716eb55585a31549f949f536d330bb1d762d6"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="64a94dc8-61de-4a96-8948-4e8ebfafac19",e._sentryDebugIdIdentifier="sentry-dbid-64a94dc8-61de-4a96-8948-4e8ebfafac19");}catch(e){}}();
"use strict";
(self["webpackChunk_hydrooj_ui_default"] = self["webpackChunk_hydrooj_ui_default"] || []).push([["n.js-yaml"],{

/***/ "../../node_modules/js-yaml/dist/js-yaml.mjs"
/*!***************************************************!*\
  !*** ../../node_modules/js-yaml/dist/js-yaml.mjs ***!
  \***************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ jsYaml),
/* harmony export */   dump: () => (/* binding */ dump)
/* harmony export */ });
/* unused harmony exports CORE_SCHEMA, DEFAULT_SCHEMA, FAILSAFE_SCHEMA, JSON_SCHEMA, Schema, Type, YAMLException, load, loadAll, safeDump, safeLoad, safeLoadAll, types */
/*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT */
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (var i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1, QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1, STYLE_SINGLE = 2, STYLE_LITERAL = 3, STYLE_FOLDED = 4, STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = (function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  })();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var Type = type;
var Schema = schema;
var FAILSAFE_SCHEMA = failsafe;
var JSON_SCHEMA = json;
var CORE_SCHEMA = core;
var DEFAULT_SCHEMA = _default;
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var YAMLException = exception;
var types = {
  binary,
  float,
  map,
  null: _null,
  pairs,
  set,
  timestamp,
  bool,
  int,
  merge,
  omap,
  seq,
  str
};
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");
var jsYaml = {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
};



/***/ },

/***/ "../../node_modules/web-streams-polyfill/dist/ponyfill.mjs"
/*!*****************************************************************!*\
  !*** ../../node_modules/web-streams-polyfill/dist/ponyfill.mjs ***!
  \*****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   WritableStream: () => (/* binding */ WritableStream)
/* harmony export */ });
/* unused harmony exports ByteLengthQueuingStrategy, CountQueuingStrategy, ReadableByteStreamController, ReadableStream, ReadableStreamBYOBReader, ReadableStreamBYOBRequest, ReadableStreamDefaultController, ReadableStreamDefaultReader, TransformStream, TransformStreamDefaultController, WritableStreamDefaultController, WritableStreamDefaultWriter */
/**
 * @license
 * web-streams-polyfill v4.2.0
 * Copyright 2025 Mattias Buelens, Diwank Singh Tomer and other contributors.
 * This code is released under the MIT license.
 * SPDX-License-Identifier: MIT
 */
function e() {
}
function t(e2) {
  return "object" == typeof e2 && null !== e2 || "function" == typeof e2;
}
const r = e;
function o(e2, t2) {
  try {
    Object.defineProperty(e2, "name", { value: t2, configurable: true });
  } catch (e3) {
  }
}
const n = Promise, a = Promise.resolve.bind(n), i = Promise.prototype.then, l = Promise.reject.bind(n), s = a;
function u(e2) {
  return new n(e2);
}
function c(e2) {
  return u((t2) => t2(e2));
}
function d(e2) {
  return l(e2);
}
function f(e2, t2, r2) {
  return i.call(e2, t2, r2);
}
function b(e2, t2, o2) {
  f(f(e2, t2, o2), void 0, r);
}
function h(e2, t2) {
  b(e2, t2);
}
function m(e2, t2) {
  b(e2, void 0, t2);
}
function _(e2, t2, r2) {
  return f(e2, t2, r2);
}
function p(e2) {
  f(e2, void 0, r);
}
let y = (e2) => {
  if ("function" == typeof queueMicrotask) y = queueMicrotask;
  else {
    const e3 = c(void 0);
    y = (t2) => f(e3, t2);
  }
  return y(e2);
};
function S(e2, t2, r2) {
  if ("function" != typeof e2) throw new TypeError("Argument is not a function");
  return Function.prototype.apply.call(e2, t2, r2);
}
function g(e2, t2, r2) {
  try {
    return c(S(e2, t2, r2));
  } catch (e3) {
    return d(e3);
  }
}
class v {
  constructor() {
    this._cursor = 0, this._size = 0, this._front = { _elements: [], _next: void 0 }, this._back = this._front, this._cursor = 0, this._size = 0;
  }
  get length() {
    return this._size;
  }
  push(e2) {
    const t2 = this._back;
    let r2 = t2;
    16383 === t2._elements.length && (r2 = { _elements: [], _next: void 0 }), t2._elements.push(e2), r2 !== t2 && (this._back = r2, t2._next = r2), ++this._size;
  }
  shift() {
    const e2 = this._front;
    let t2 = e2;
    const r2 = this._cursor;
    let o2 = r2 + 1;
    const n2 = e2._elements, a2 = n2[r2];
    return 16384 === o2 && (t2 = e2._next, o2 = 0), --this._size, this._cursor = o2, e2 !== t2 && (this._front = t2), n2[r2] = void 0, a2;
  }
  forEach(e2) {
    let t2 = this._cursor, r2 = this._front, o2 = r2._elements;
    for (; !(t2 === o2.length && void 0 === r2._next || t2 === o2.length && (r2 = r2._next, o2 = r2._elements, t2 = 0, 0 === o2.length)); ) e2(o2[t2]), ++t2;
  }
  peek() {
    const e2 = this._front, t2 = this._cursor;
    return e2._elements[t2];
  }
}
const w = /* @__PURE__ */ Symbol("[[AbortSteps]]"), R = /* @__PURE__ */ Symbol("[[ErrorSteps]]"), T = /* @__PURE__ */ Symbol("[[CancelSteps]]"), C = /* @__PURE__ */ Symbol("[[PullSteps]]"), P = /* @__PURE__ */ Symbol("[[ReleaseSteps]]");
function q(e2, t2) {
  e2._ownerReadableStream = t2, t2._reader = e2, "readable" === t2._state ? B(e2) : "closed" === t2._state ? (function(e3) {
    B(e3), A(e3);
  })(e2) : k(e2, t2._storedError);
}
function E(e2, t2) {
  return Or(e2._ownerReadableStream, t2);
}
function W(e2) {
  const t2 = e2._ownerReadableStream;
  "readable" === t2._state ? j(e2, new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")) : (function(e3, t3) {
    k(e3, t3);
  })(e2, new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")), t2._readableStreamController[P](), t2._reader = void 0, e2._ownerReadableStream = void 0;
}
function O(e2) {
  return new TypeError("Cannot " + e2 + " a stream using a released reader");
}
function B(e2) {
  e2._closedPromise = u((t2, r2) => {
    e2._closedPromise_resolve = t2, e2._closedPromise_reject = r2;
  });
}
function k(e2, t2) {
  B(e2), j(e2, t2);
}
function j(e2, t2) {
  void 0 !== e2._closedPromise_reject && (p(e2._closedPromise), e2._closedPromise_reject(t2), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0);
}
function A(e2) {
  void 0 !== e2._closedPromise_resolve && (e2._closedPromise_resolve(void 0), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0);
}
const z = Number.isFinite || function(e2) {
  return "number" == typeof e2 && isFinite(e2);
}, D = Math.trunc || function(e2) {
  return e2 < 0 ? Math.ceil(e2) : Math.floor(e2);
};
function L(e2, t2) {
  if (void 0 !== e2 && ("object" != typeof (r2 = e2) && "function" != typeof r2)) throw new TypeError(`${t2} is not an object.`);
  var r2;
}
function F(e2, t2) {
  if ("function" != typeof e2) throw new TypeError(`${t2} is not a function.`);
}
function I(e2, t2) {
  if (!/* @__PURE__ */ (function(e3) {
    return "object" == typeof e3 && null !== e3 || "function" == typeof e3;
  })(e2)) throw new TypeError(`${t2} is not an object.`);
}
function $(e2, t2, r2) {
  if (void 0 === e2) throw new TypeError(`Parameter ${t2} is required in '${r2}'.`);
}
function M(e2, t2, r2) {
  if (void 0 === e2) throw new TypeError(`${t2} is required in '${r2}'.`);
}
function Y(e2) {
  return Number(e2);
}
function x(e2) {
  return 0 === e2 ? 0 : e2;
}
function Q(e2, t2) {
  const r2 = Number.MAX_SAFE_INTEGER;
  let o2 = Number(e2);
  if (o2 = x(o2), !z(o2)) throw new TypeError(`${t2} is not a finite number`);
  if (o2 = (function(e3) {
    return x(D(e3));
  })(o2), o2 < 0 || o2 > r2) throw new TypeError(`${t2} is outside the accepted range of 0 to ${r2}, inclusive`);
  return z(o2) && 0 !== o2 ? o2 : 0;
}
function N(e2, t2) {
  if (!Er(e2)) throw new TypeError(`${t2} is not a ReadableStream.`);
}
function H(e2) {
  return new ReadableStreamDefaultReader(e2);
}
function V(e2, t2) {
  e2._reader._readRequests.push(t2);
}
function U(e2, t2, r2) {
  const o2 = e2._reader._readRequests.shift();
  r2 ? o2._closeSteps() : o2._chunkSteps(t2);
}
function G(e2) {
  return e2._reader._readRequests.length;
}
function X(e2) {
  const t2 = e2._reader;
  return void 0 !== t2 && !!J(t2);
}
class ReadableStreamDefaultReader {
  constructor(e2) {
    if ($(e2, 1, "ReadableStreamDefaultReader"), N(e2, "First parameter"), Wr(e2)) throw new TypeError("This stream has already been locked for exclusive reading by another reader");
    q(this, e2), this._readRequests = new v();
  }
  get closed() {
    return J(this) ? this._closedPromise : d(ee("closed"));
  }
  cancel(e2 = void 0) {
    return J(this) ? void 0 === this._ownerReadableStream ? d(O("cancel")) : E(this, e2) : d(ee("cancel"));
  }
  read() {
    if (!J(this)) return d(ee("read"));
    if (void 0 === this._ownerReadableStream) return d(O("read from"));
    let e2, t2;
    const r2 = u((r3, o2) => {
      e2 = r3, t2 = o2;
    });
    return K(this, { _chunkSteps: (t3) => e2({ value: t3, done: false }), _closeSteps: () => e2({ value: void 0, done: true }), _errorSteps: (e3) => t2(e3) }), r2;
  }
  releaseLock() {
    if (!J(this)) throw ee("releaseLock");
    void 0 !== this._ownerReadableStream && (function(e2) {
      W(e2);
      const t2 = new TypeError("Reader was released");
      Z(e2, t2);
    })(this);
  }
}
function J(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readRequests") && e2 instanceof ReadableStreamDefaultReader);
}
function K(e2, t2) {
  const r2 = e2._ownerReadableStream;
  r2._disturbed = true, "closed" === r2._state ? t2._closeSteps() : "errored" === r2._state ? t2._errorSteps(r2._storedError) : r2._readableStreamController[C](t2);
}
function Z(e2, t2) {
  const r2 = e2._readRequests;
  e2._readRequests = new v(), r2.forEach((e3) => {
    e3._errorSteps(t2);
  });
}
function ee(e2) {
  return new TypeError(`ReadableStreamDefaultReader.prototype.${e2} can only be used on a ReadableStreamDefaultReader`);
}
var te, re, oe;
function ne(e2) {
  return e2.slice();
}
function ae(e2, t2, r2, o2, n2) {
  new Uint8Array(e2).set(new Uint8Array(r2, o2, n2), t2);
}
Object.defineProperties(ReadableStreamDefaultReader.prototype, { cancel: { enumerable: true }, read: { enumerable: true }, releaseLock: { enumerable: true }, closed: { enumerable: true } }), o(ReadableStreamDefaultReader.prototype.cancel, "cancel"), o(ReadableStreamDefaultReader.prototype.read, "read"), o(ReadableStreamDefaultReader.prototype.releaseLock, "releaseLock"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableStreamDefaultReader.prototype, Symbol.toStringTag, { value: "ReadableStreamDefaultReader", configurable: true });
let ie = (e2) => (ie = "function" == typeof e2.transfer ? (e3) => e3.transfer() : "function" == typeof structuredClone ? (e3) => structuredClone(e3, { transfer: [e3] }) : (e3) => e3, ie(e2)), le = (e2) => (le = "boolean" == typeof e2.detached ? (e3) => e3.detached : (e3) => 0 === e3.byteLength, le(e2));
function se(e2, t2, r2) {
  if (e2.slice) return e2.slice(t2, r2);
  const o2 = r2 - t2, n2 = new ArrayBuffer(o2);
  return ae(n2, 0, e2, t2, o2), n2;
}
function ue(e2, t2) {
  const r2 = e2[t2];
  if (null != r2) {
    if ("function" != typeof r2) throw new TypeError(`${String(t2)} is not a function`);
    return r2;
  }
}
function ce(e2) {
  try {
    const t2 = e2.done, r2 = e2.value;
    return f(s(r2), (e3) => ({ done: t2, value: e3 }));
  } catch (e3) {
    return d(e3);
  }
}
const de = null !== (oe = null !== (te = Symbol.asyncIterator) && void 0 !== te ? te : null === (re = Symbol.for) || void 0 === re ? void 0 : re.call(Symbol, "Symbol.asyncIterator")) && void 0 !== oe ? oe : "@@asyncIterator";
function fe(e2, r2 = "sync", o2) {
  if (void 0 === o2) if ("async" === r2) {
    if (void 0 === (o2 = ue(e2, de))) {
      return (function(e3) {
        const r3 = { next() {
          let t2;
          try {
            t2 = be(e3);
          } catch (e4) {
            return d(e4);
          }
          return ce(t2);
        }, return(r4) {
          let o3;
          try {
            const t2 = ue(e3.iterator, "return");
            if (void 0 === t2) return c({ done: true, value: r4 });
            o3 = S(t2, e3.iterator, [r4]);
          } catch (e4) {
            return d(e4);
          }
          return t(o3) ? ce(o3) : d(new TypeError("The iterator.return() method must return an object"));
        } };
        return { iterator: r3, nextMethod: r3.next, done: false };
      })(fe(e2, "sync", ue(e2, Symbol.iterator)));
    }
  } else o2 = ue(e2, Symbol.iterator);
  if (void 0 === o2) throw new TypeError("The object is not iterable");
  const n2 = S(o2, e2, []);
  if (!t(n2)) throw new TypeError("The iterator method must return an object");
  return { iterator: n2, nextMethod: n2.next, done: false };
}
function be(e2) {
  const r2 = S(e2.nextMethod, e2.iterator, []);
  if (!t(r2)) throw new TypeError("The iterator.next() method must return an object");
  return r2;
}
class he {
  constructor(e2, t2) {
    this._ongoingPromise = void 0, this._isFinished = false, this._reader = e2, this._preventCancel = t2;
  }
  next() {
    const e2 = () => this._nextSteps();
    return this._ongoingPromise = this._ongoingPromise ? _(this._ongoingPromise, e2, e2) : e2(), this._ongoingPromise;
  }
  return(e2) {
    const t2 = () => this._returnSteps(e2);
    return this._ongoingPromise = this._ongoingPromise ? _(this._ongoingPromise, t2, t2) : t2(), this._ongoingPromise;
  }
  _nextSteps() {
    if (this._isFinished) return Promise.resolve({ value: void 0, done: true });
    const e2 = this._reader;
    let t2, r2;
    const o2 = u((e3, o3) => {
      t2 = e3, r2 = o3;
    });
    return K(e2, { _chunkSteps: (e3) => {
      this._ongoingPromise = void 0, y(() => t2({ value: e3, done: false }));
    }, _closeSteps: () => {
      this._ongoingPromise = void 0, this._isFinished = true, W(e2), t2({ value: void 0, done: true });
    }, _errorSteps: (t3) => {
      this._ongoingPromise = void 0, this._isFinished = true, W(e2), r2(t3);
    } }), o2;
  }
  _returnSteps(e2) {
    if (this._isFinished) return Promise.resolve({ value: e2, done: true });
    this._isFinished = true;
    const t2 = this._reader;
    if (!this._preventCancel) {
      const r2 = E(t2, e2);
      return W(t2), _(r2, () => ({ value: e2, done: true }));
    }
    return W(t2), c({ value: e2, done: true });
  }
}
const me = { next() {
  return _e(this) ? this._asyncIteratorImpl.next() : d(pe("next"));
}, return(e2) {
  return _e(this) ? this._asyncIteratorImpl.return(e2) : d(pe("return"));
}, [de]() {
  return this;
} };
function _e(e2) {
  if (!t(e2)) return false;
  if (!Object.prototype.hasOwnProperty.call(e2, "_asyncIteratorImpl")) return false;
  try {
    return e2._asyncIteratorImpl instanceof he;
  } catch (e3) {
    return false;
  }
}
function pe(e2) {
  return new TypeError(`ReadableStreamAsyncIterator.${e2} can only be used on a ReadableSteamAsyncIterator`);
}
Object.defineProperty(me, de, { enumerable: false });
const ye = Number.isNaN || function(e2) {
  return e2 != e2;
};
function Se(e2) {
  const t2 = se(e2.buffer, e2.byteOffset, e2.byteOffset + e2.byteLength);
  return new Uint8Array(t2);
}
function ge(e2) {
  const t2 = e2._queue.shift();
  return e2._queueTotalSize -= t2.size, e2._queueTotalSize < 0 && (e2._queueTotalSize = 0), t2.value;
}
function ve(e2, t2, r2) {
  if ("number" != typeof (o2 = r2) || ye(o2) || o2 < 0 || r2 === 1 / 0) throw new RangeError("Size must be a finite, non-NaN, non-negative number.");
  var o2;
  e2._queue.push({ value: t2, size: r2 }), e2._queueTotalSize += r2;
}
function we(e2) {
  e2._queue = new v(), e2._queueTotalSize = 0;
}
function Re(e2) {
  return e2 === DataView;
}
class ReadableStreamBYOBRequest {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get view() {
    if (!Ce(this)) throw Ke("view");
    return this._view;
  }
  respond(e2) {
    if (!Ce(this)) throw Ke("respond");
    if ($(e2, 1, "respond"), e2 = Q(e2, "First parameter"), void 0 === this._associatedReadableByteStreamController) throw new TypeError("This BYOB request has been invalidated");
    if (le(this._view.buffer)) throw new TypeError("The BYOB request's buffer has been detached and so cannot be used as a response");
    Ge(this._associatedReadableByteStreamController, e2);
  }
  respondWithNewView(e2) {
    if (!Ce(this)) throw Ke("respondWithNewView");
    if ($(e2, 1, "respondWithNewView"), !ArrayBuffer.isView(e2)) throw new TypeError("You can only respond with array buffer views");
    if (void 0 === this._associatedReadableByteStreamController) throw new TypeError("This BYOB request has been invalidated");
    if (le(e2.buffer)) throw new TypeError("The given view's buffer has been detached and so cannot be used as a response");
    Xe(this._associatedReadableByteStreamController, e2);
  }
}
Object.defineProperties(ReadableStreamBYOBRequest.prototype, { respond: { enumerable: true }, respondWithNewView: { enumerable: true }, view: { enumerable: true } }), o(ReadableStreamBYOBRequest.prototype.respond, "respond"), o(ReadableStreamBYOBRequest.prototype.respondWithNewView, "respondWithNewView"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableStreamBYOBRequest.prototype, Symbol.toStringTag, { value: "ReadableStreamBYOBRequest", configurable: true });
class ReadableByteStreamController {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get byobRequest() {
    if (!Te(this)) throw Ze("byobRequest");
    return Ve(this);
  }
  get desiredSize() {
    if (!Te(this)) throw Ze("desiredSize");
    return Ue(this);
  }
  close() {
    if (!Te(this)) throw Ze("close");
    if (this._closeRequested) throw new TypeError("The stream has already been closed; do not close it again!");
    const e2 = this._controlledReadableByteStream._state;
    if ("readable" !== e2) throw new TypeError(`The stream (in ${e2} state) is not in the readable state and cannot be closed`);
    xe(this);
  }
  enqueue(e2) {
    if (!Te(this)) throw Ze("enqueue");
    if ($(e2, 1, "enqueue"), !ArrayBuffer.isView(e2)) throw new TypeError("chunk must be an array buffer view");
    if (0 === e2.byteLength) throw new TypeError("chunk must have non-zero byteLength");
    if (0 === e2.buffer.byteLength) throw new TypeError("chunk's buffer must have non-zero byteLength");
    if (this._closeRequested) throw new TypeError("stream is closed or draining");
    const t2 = this._controlledReadableByteStream._state;
    if ("readable" !== t2) throw new TypeError(`The stream (in ${t2} state) is not in the readable state and cannot be enqueued to`);
    Qe(this, e2);
  }
  error(e2 = void 0) {
    if (!Te(this)) throw Ze("error");
    Ne(this, e2);
  }
  [T](e2) {
    qe(this), we(this);
    const t2 = this._cancelAlgorithm(e2);
    return Ye(this), t2;
  }
  [C](e2) {
    const t2 = this._controlledReadableByteStream;
    if (this._queueTotalSize > 0) return void He(this, e2);
    const r2 = this._autoAllocateChunkSize;
    if (void 0 !== r2) {
      let t3;
      try {
        t3 = new ArrayBuffer(r2);
      } catch (t4) {
        return void e2._errorSteps(t4);
      }
      const o2 = { buffer: t3, bufferByteLength: r2, byteOffset: 0, byteLength: r2, bytesFilled: 0, minimumFill: 1, elementSize: 1, viewConstructor: Uint8Array, readerType: "default" };
      this._pendingPullIntos.push(o2);
    }
    V(t2, e2), Pe(this);
  }
  [P]() {
    if (this._pendingPullIntos.length > 0) {
      const e2 = this._pendingPullIntos.peek();
      e2.readerType = "none", this._pendingPullIntos = new v(), this._pendingPullIntos.push(e2);
    }
  }
}
function Te(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledReadableByteStream") && e2 instanceof ReadableByteStreamController);
}
function Ce(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_associatedReadableByteStreamController") && e2 instanceof ReadableStreamBYOBRequest);
}
function Pe(e2) {
  const t2 = (function(e3) {
    const t3 = e3._controlledReadableByteStream;
    if ("readable" !== t3._state) return false;
    if (e3._closeRequested) return false;
    if (!e3._started) return false;
    if (X(t3) && G(t3) > 0) return true;
    if (nt(t3) && ot(t3) > 0) return true;
    const r2 = Ue(e3);
    if (r2 > 0) return true;
    return false;
  })(e2);
  if (!t2) return;
  if (e2._pulling) return void (e2._pullAgain = true);
  e2._pulling = true;
  b(e2._pullAlgorithm(), () => (e2._pulling = false, e2._pullAgain && (e2._pullAgain = false, Pe(e2)), null), (t3) => (Ne(e2, t3), null));
}
function qe(e2) {
  Le(e2), e2._pendingPullIntos = new v();
}
function Ee(e2, t2) {
  let r2 = false;
  "closed" === e2._state && (r2 = true);
  const o2 = Oe(t2);
  "default" === t2.readerType ? U(e2, o2, r2) : (function(e3, t3, r3) {
    const o3 = e3._reader, n2 = o3._readIntoRequests.shift();
    r3 ? n2._closeSteps(t3) : n2._chunkSteps(t3);
  })(e2, o2, r2);
}
function We(e2, t2) {
  for (let r2 = 0; r2 < t2.length; ++r2) Ee(e2, t2[r2]);
}
function Oe(e2) {
  const t2 = e2.bytesFilled, r2 = e2.elementSize;
  return new e2.viewConstructor(e2.buffer, e2.byteOffset, t2 / r2);
}
function Be(e2, t2, r2, o2) {
  e2._queue.push({ buffer: t2, byteOffset: r2, byteLength: o2 }), e2._queueTotalSize += o2;
}
function ke(e2, t2, r2, o2) {
  let n2;
  try {
    n2 = se(t2, r2, r2 + o2);
  } catch (t3) {
    throw Ne(e2, t3), t3;
  }
  Be(e2, n2, 0, o2);
}
function je(e2, t2) {
  t2.bytesFilled > 0 && ke(e2, t2.buffer, t2.byteOffset, t2.bytesFilled), Me(e2);
}
function Ae(e2, t2) {
  const r2 = Math.min(e2._queueTotalSize, t2.byteLength - t2.bytesFilled), o2 = t2.bytesFilled + r2;
  let n2 = r2, a2 = false;
  const i2 = o2 - o2 % t2.elementSize;
  i2 >= t2.minimumFill && (n2 = i2 - t2.bytesFilled, a2 = true);
  const l2 = e2._queue;
  for (; n2 > 0; ) {
    const r3 = l2.peek(), o3 = Math.min(n2, r3.byteLength), a3 = t2.byteOffset + t2.bytesFilled;
    ae(t2.buffer, a3, r3.buffer, r3.byteOffset, o3), r3.byteLength === o3 ? l2.shift() : (r3.byteOffset += o3, r3.byteLength -= o3), e2._queueTotalSize -= o3, ze(e2, o3, t2), n2 -= o3;
  }
  return a2;
}
function ze(e2, t2, r2) {
  r2.bytesFilled += t2;
}
function De(e2) {
  0 === e2._queueTotalSize && e2._closeRequested ? (Ye(e2), Br(e2._controlledReadableByteStream)) : Pe(e2);
}
function Le(e2) {
  null !== e2._byobRequest && (e2._byobRequest._associatedReadableByteStreamController = void 0, e2._byobRequest._view = null, e2._byobRequest = null);
}
function Fe(e2) {
  const t2 = [];
  for (; e2._pendingPullIntos.length > 0 && 0 !== e2._queueTotalSize; ) {
    const r2 = e2._pendingPullIntos.peek();
    Ae(e2, r2) && (Me(e2), t2.push(r2));
  }
  return t2;
}
function Ie(e2, t2, r2, o2) {
  const n2 = e2._controlledReadableByteStream, a2 = t2.constructor, i2 = (function(e3) {
    return Re(e3) ? 1 : e3.BYTES_PER_ELEMENT;
  })(a2), { byteOffset: l2, byteLength: s2 } = t2, u2 = r2 * i2;
  let c2;
  try {
    c2 = ie(t2.buffer);
  } catch (e3) {
    return void o2._errorSteps(e3);
  }
  const d2 = { buffer: c2, bufferByteLength: c2.byteLength, byteOffset: l2, byteLength: s2, bytesFilled: 0, minimumFill: u2, elementSize: i2, viewConstructor: a2, readerType: "byob" };
  if (e2._pendingPullIntos.length > 0) return e2._pendingPullIntos.push(d2), void rt(n2, o2);
  if ("closed" === n2._state) {
    const e3 = new a2(d2.buffer, d2.byteOffset, 0);
    return void o2._closeSteps(e3);
  }
  if (e2._queueTotalSize > 0) {
    if (Ae(e2, d2)) {
      const t3 = Oe(d2);
      return De(e2), void o2._chunkSteps(t3);
    }
    if (e2._closeRequested) {
      const t3 = new TypeError("Insufficient bytes to fill elements in the given buffer");
      return Ne(e2, t3), void o2._errorSteps(t3);
    }
  }
  e2._pendingPullIntos.push(d2), rt(n2, o2), Pe(e2);
}
function $e(e2, t2) {
  const r2 = e2._pendingPullIntos.peek();
  Le(e2);
  "closed" === e2._controlledReadableByteStream._state ? (function(e3, t3) {
    "none" === t3.readerType && Me(e3);
    const r3 = e3._controlledReadableByteStream;
    if (nt(r3)) {
      const t4 = [];
      for (; t4.length < ot(r3); ) t4.push(Me(e3));
      We(r3, t4);
    }
  })(e2, r2) : (function(e3, t3, r3) {
    if (ze(0, t3, r3), "none" === r3.readerType) {
      je(e3, r3);
      const t4 = Fe(e3);
      return void We(e3._controlledReadableByteStream, t4);
    }
    if (r3.bytesFilled < r3.minimumFill) return;
    Me(e3);
    const o2 = r3.bytesFilled % r3.elementSize;
    if (o2 > 0) {
      const t4 = r3.byteOffset + r3.bytesFilled;
      ke(e3, r3.buffer, t4 - o2, o2);
    }
    r3.bytesFilled -= o2;
    const n2 = Fe(e3);
    Ee(e3._controlledReadableByteStream, r3), We(e3._controlledReadableByteStream, n2);
  })(e2, t2, r2), Pe(e2);
}
function Me(e2) {
  return e2._pendingPullIntos.shift();
}
function Ye(e2) {
  e2._pullAlgorithm = void 0, e2._cancelAlgorithm = void 0;
}
function xe(e2) {
  const t2 = e2._controlledReadableByteStream;
  if (!e2._closeRequested && "readable" === t2._state) if (e2._queueTotalSize > 0) e2._closeRequested = true;
  else {
    if (e2._pendingPullIntos.length > 0) {
      const t3 = e2._pendingPullIntos.peek();
      if (t3.bytesFilled % t3.elementSize !== 0) {
        const t4 = new TypeError("Insufficient bytes to fill elements in the given buffer");
        throw Ne(e2, t4), t4;
      }
    }
    Ye(e2), Br(t2);
  }
}
function Qe(e2, t2) {
  const r2 = e2._controlledReadableByteStream;
  if (e2._closeRequested || "readable" !== r2._state) return;
  const { buffer: o2, byteOffset: n2, byteLength: a2 } = t2;
  if (le(o2)) throw new TypeError("chunk's buffer is detached and so cannot be enqueued");
  const i2 = ie(o2);
  if (e2._pendingPullIntos.length > 0) {
    const t3 = e2._pendingPullIntos.peek();
    if (le(t3.buffer)) throw new TypeError("The BYOB request's buffer has been detached and so cannot be filled with an enqueued chunk");
    Le(e2), t3.buffer = ie(t3.buffer), "none" === t3.readerType && je(e2, t3);
  }
  if (X(r2)) if ((function(e3) {
    const t3 = e3._controlledReadableByteStream._reader;
    for (; t3._readRequests.length > 0; ) {
      if (0 === e3._queueTotalSize) return;
      He(e3, t3._readRequests.shift());
    }
  })(e2), 0 === G(r2)) Be(e2, i2, n2, a2);
  else {
    e2._pendingPullIntos.length > 0 && Me(e2);
    U(r2, new Uint8Array(i2, n2, a2), false);
  }
  else if (nt(r2)) {
    Be(e2, i2, n2, a2);
    We(r2, Fe(e2));
  } else Be(e2, i2, n2, a2);
  Pe(e2);
}
function Ne(e2, t2) {
  const r2 = e2._controlledReadableByteStream;
  "readable" === r2._state && (qe(e2), we(e2), Ye(e2), kr(r2, t2));
}
function He(e2, t2) {
  const r2 = e2._queue.shift();
  e2._queueTotalSize -= r2.byteLength, De(e2);
  const o2 = new Uint8Array(r2.buffer, r2.byteOffset, r2.byteLength);
  t2._chunkSteps(o2);
}
function Ve(e2) {
  if (null === e2._byobRequest && e2._pendingPullIntos.length > 0) {
    const t2 = e2._pendingPullIntos.peek(), r2 = new Uint8Array(t2.buffer, t2.byteOffset + t2.bytesFilled, t2.byteLength - t2.bytesFilled), o2 = Object.create(ReadableStreamBYOBRequest.prototype);
    !(function(e3, t3, r3) {
      e3._associatedReadableByteStreamController = t3, e3._view = r3;
    })(o2, e2, r2), e2._byobRequest = o2;
  }
  return e2._byobRequest;
}
function Ue(e2) {
  const t2 = e2._controlledReadableByteStream._state;
  return "errored" === t2 ? null : "closed" === t2 ? 0 : e2._strategyHWM - e2._queueTotalSize;
}
function Ge(e2, t2) {
  const r2 = e2._pendingPullIntos.peek();
  if ("closed" === e2._controlledReadableByteStream._state) {
    if (0 !== t2) throw new TypeError("bytesWritten must be 0 when calling respond() on a closed stream");
  } else {
    if (0 === t2) throw new TypeError("bytesWritten must be greater than 0 when calling respond() on a readable stream");
    if (r2.bytesFilled + t2 > r2.byteLength) throw new RangeError("bytesWritten out of range");
  }
  r2.buffer = ie(r2.buffer), $e(e2, t2);
}
function Xe(e2, t2) {
  const r2 = e2._pendingPullIntos.peek();
  if ("closed" === e2._controlledReadableByteStream._state) {
    if (0 !== t2.byteLength) throw new TypeError("The view's length must be 0 when calling respondWithNewView() on a closed stream");
  } else if (0 === t2.byteLength) throw new TypeError("The view's length must be greater than 0 when calling respondWithNewView() on a readable stream");
  if (r2.byteOffset + r2.bytesFilled !== t2.byteOffset) throw new RangeError("The region specified by view does not match byobRequest");
  if (r2.bufferByteLength !== t2.buffer.byteLength) throw new RangeError("The buffer of view has different capacity than byobRequest");
  if (r2.bytesFilled + t2.byteLength > r2.byteLength) throw new RangeError("The region specified by view is larger than byobRequest");
  const o2 = t2.byteLength;
  r2.buffer = ie(t2.buffer), $e(e2, o2);
}
function Je(e2, t2, r2, o2, n2, a2, i2) {
  t2._controlledReadableByteStream = e2, t2._pullAgain = false, t2._pulling = false, t2._byobRequest = null, t2._queue = t2._queueTotalSize = void 0, we(t2), t2._closeRequested = false, t2._started = false, t2._strategyHWM = a2, t2._pullAlgorithm = o2, t2._cancelAlgorithm = n2, t2._autoAllocateChunkSize = i2, t2._pendingPullIntos = new v(), e2._readableStreamController = t2;
  b(c(r2()), () => (t2._started = true, Pe(t2), null), (e3) => (Ne(t2, e3), null));
}
function Ke(e2) {
  return new TypeError(`ReadableStreamBYOBRequest.prototype.${e2} can only be used on a ReadableStreamBYOBRequest`);
}
function Ze(e2) {
  return new TypeError(`ReadableByteStreamController.prototype.${e2} can only be used on a ReadableByteStreamController`);
}
function et(e2, t2) {
  if ("byob" !== (e2 = `${e2}`)) throw new TypeError(`${t2} '${e2}' is not a valid enumeration value for ReadableStreamReaderMode`);
  return e2;
}
function tt(e2) {
  return new ReadableStreamBYOBReader(e2);
}
function rt(e2, t2) {
  e2._reader._readIntoRequests.push(t2);
}
function ot(e2) {
  return e2._reader._readIntoRequests.length;
}
function nt(e2) {
  const t2 = e2._reader;
  return void 0 !== t2 && !!at(t2);
}
Object.defineProperties(ReadableByteStreamController.prototype, { close: { enumerable: true }, enqueue: { enumerable: true }, error: { enumerable: true }, byobRequest: { enumerable: true }, desiredSize: { enumerable: true } }), o(ReadableByteStreamController.prototype.close, "close"), o(ReadableByteStreamController.prototype.enqueue, "enqueue"), o(ReadableByteStreamController.prototype.error, "error"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableByteStreamController.prototype, Symbol.toStringTag, { value: "ReadableByteStreamController", configurable: true });
class ReadableStreamBYOBReader {
  constructor(e2) {
    if ($(e2, 1, "ReadableStreamBYOBReader"), N(e2, "First parameter"), Wr(e2)) throw new TypeError("This stream has already been locked for exclusive reading by another reader");
    if (!Te(e2._readableStreamController)) throw new TypeError("Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte source");
    q(this, e2), this._readIntoRequests = new v();
  }
  get closed() {
    return at(this) ? this._closedPromise : d(st("closed"));
  }
  cancel(e2 = void 0) {
    return at(this) ? void 0 === this._ownerReadableStream ? d(O("cancel")) : E(this, e2) : d(st("cancel"));
  }
  read(e2, t2 = {}) {
    if (!at(this)) return d(st("read"));
    if (!ArrayBuffer.isView(e2)) return d(new TypeError("view must be an array buffer view"));
    if (0 === e2.byteLength) return d(new TypeError("view must have non-zero byteLength"));
    if (0 === e2.buffer.byteLength) return d(new TypeError("view's buffer must have non-zero byteLength"));
    if (le(e2.buffer)) return d(new TypeError("view's buffer has been detached"));
    let r2;
    try {
      r2 = (function(e3, t3) {
        var r3;
        return L(e3, t3), { min: Q(null !== (r3 = null == e3 ? void 0 : e3.min) && void 0 !== r3 ? r3 : 1, `${t3} has member 'min' that`) };
      })(t2, "options");
    } catch (e3) {
      return d(e3);
    }
    const o2 = r2.min;
    if (0 === o2) return d(new TypeError("options.min must be greater than 0"));
    if ((function(e3) {
      return Re(e3.constructor);
    })(e2)) {
      if (o2 > e2.byteLength) return d(new RangeError("options.min must be less than or equal to view's byteLength"));
    } else if (o2 > e2.length) return d(new RangeError("options.min must be less than or equal to view's length"));
    if (void 0 === this._ownerReadableStream) return d(O("read from"));
    let n2, a2;
    const i2 = u((e3, t3) => {
      n2 = e3, a2 = t3;
    });
    return it(this, e2, o2, { _chunkSteps: (e3) => n2({ value: e3, done: false }), _closeSteps: (e3) => n2({ value: e3, done: true }), _errorSteps: (e3) => a2(e3) }), i2;
  }
  releaseLock() {
    if (!at(this)) throw st("releaseLock");
    void 0 !== this._ownerReadableStream && (function(e2) {
      W(e2);
      const t2 = new TypeError("Reader was released");
      lt(e2, t2);
    })(this);
  }
}
function at(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readIntoRequests") && e2 instanceof ReadableStreamBYOBReader);
}
function it(e2, t2, r2, o2) {
  const n2 = e2._ownerReadableStream;
  n2._disturbed = true, "errored" === n2._state ? o2._errorSteps(n2._storedError) : Ie(n2._readableStreamController, t2, r2, o2);
}
function lt(e2, t2) {
  const r2 = e2._readIntoRequests;
  e2._readIntoRequests = new v(), r2.forEach((e3) => {
    e3._errorSteps(t2);
  });
}
function st(e2) {
  return new TypeError(`ReadableStreamBYOBReader.prototype.${e2} can only be used on a ReadableStreamBYOBReader`);
}
function ut(e2, t2) {
  const { highWaterMark: r2 } = e2;
  if (void 0 === r2) return t2;
  if (ye(r2) || r2 < 0) throw new RangeError("Invalid highWaterMark");
  return r2;
}
function ct(e2) {
  const { size: t2 } = e2;
  return t2 || (() => 1);
}
function dt(e2, t2) {
  L(e2, t2);
  const r2 = null == e2 ? void 0 : e2.highWaterMark, o2 = null == e2 ? void 0 : e2.size;
  return { highWaterMark: void 0 === r2 ? void 0 : Y(r2), size: void 0 === o2 ? void 0 : ft(o2, `${t2} has member 'size' that`) };
}
function ft(e2, t2) {
  return F(e2, t2), (t3) => Y(e2(t3));
}
function bt(e2, t2, r2) {
  return F(e2, r2), (r3) => g(e2, t2, [r3]);
}
function ht(e2, t2, r2) {
  return F(e2, r2), () => g(e2, t2, []);
}
function mt(e2, t2, r2) {
  return F(e2, r2), (r3) => S(e2, t2, [r3]);
}
function _t(e2, t2, r2) {
  return F(e2, r2), (r3, o2) => g(e2, t2, [r3, o2]);
}
function pt(e2, t2) {
  if (!gt(e2)) throw new TypeError(`${t2} is not a WritableStream.`);
}
Object.defineProperties(ReadableStreamBYOBReader.prototype, { cancel: { enumerable: true }, read: { enumerable: true }, releaseLock: { enumerable: true }, closed: { enumerable: true } }), o(ReadableStreamBYOBReader.prototype.cancel, "cancel"), o(ReadableStreamBYOBReader.prototype.read, "read"), o(ReadableStreamBYOBReader.prototype.releaseLock, "releaseLock"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableStreamBYOBReader.prototype, Symbol.toStringTag, { value: "ReadableStreamBYOBReader", configurable: true });
class WritableStream {
  constructor(e2 = {}, t2 = {}) {
    void 0 === e2 ? e2 = null : I(e2, "First parameter");
    const r2 = dt(t2, "Second parameter"), o2 = (function(e3, t3) {
      L(e3, t3);
      const r3 = null == e3 ? void 0 : e3.abort, o3 = null == e3 ? void 0 : e3.close, n3 = null == e3 ? void 0 : e3.start, a2 = null == e3 ? void 0 : e3.type, i2 = null == e3 ? void 0 : e3.write;
      return { abort: void 0 === r3 ? void 0 : bt(r3, e3, `${t3} has member 'abort' that`), close: void 0 === o3 ? void 0 : ht(o3, e3, `${t3} has member 'close' that`), start: void 0 === n3 ? void 0 : mt(n3, e3, `${t3} has member 'start' that`), write: void 0 === i2 ? void 0 : _t(i2, e3, `${t3} has member 'write' that`), type: a2 };
    })(e2, "First parameter");
    St(this);
    if (void 0 !== o2.type) throw new RangeError("Invalid type is specified");
    const n2 = ct(r2);
    !(function(e3, t3, r3, o3) {
      const n3 = Object.create(WritableStreamDefaultController.prototype);
      let a2, i2, l2, s2;
      a2 = void 0 !== t3.start ? () => t3.start(n3) : () => {
      };
      i2 = void 0 !== t3.write ? (e4) => t3.write(e4, n3) : () => c(void 0);
      l2 = void 0 !== t3.close ? () => t3.close() : () => c(void 0);
      s2 = void 0 !== t3.abort ? (e4) => t3.abort(e4) : () => c(void 0);
      Ft(e3, n3, a2, i2, l2, s2, r3, o3);
    })(this, o2, ut(r2, 1), n2);
  }
  get locked() {
    if (!gt(this)) throw Nt("locked");
    return vt(this);
  }
  abort(e2 = void 0) {
    return gt(this) ? vt(this) ? d(new TypeError("Cannot abort a stream that already has a writer")) : wt(this, e2) : d(Nt("abort"));
  }
  close() {
    return gt(this) ? vt(this) ? d(new TypeError("Cannot close a stream that already has a writer")) : qt(this) ? d(new TypeError("Cannot close an already-closing stream")) : Rt(this) : d(Nt("close"));
  }
  getWriter() {
    if (!gt(this)) throw Nt("getWriter");
    return yt(this);
  }
}
function yt(e2) {
  return new WritableStreamDefaultWriter(e2);
}
function St(e2) {
  e2._state = "writable", e2._storedError = void 0, e2._writer = void 0, e2._writableStreamController = void 0, e2._writeRequests = new v(), e2._inFlightWriteRequest = void 0, e2._closeRequest = void 0, e2._inFlightCloseRequest = void 0, e2._pendingAbortRequest = void 0, e2._backpressure = false;
}
function gt(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_writableStreamController") && e2 instanceof WritableStream);
}
function vt(e2) {
  return void 0 !== e2._writer;
}
function wt(e2, t2) {
  var r2;
  if ("closed" === e2._state || "errored" === e2._state) return c(void 0);
  e2._writableStreamController._abortReason = t2, null === (r2 = e2._writableStreamController._abortController) || void 0 === r2 || r2.abort(t2);
  const o2 = e2._state;
  if ("closed" === o2 || "errored" === o2) return c(void 0);
  if (void 0 !== e2._pendingAbortRequest) return e2._pendingAbortRequest._promise;
  let n2 = false;
  "erroring" === o2 && (n2 = true, t2 = void 0);
  const a2 = u((r3, o3) => {
    e2._pendingAbortRequest = { _promise: void 0, _resolve: r3, _reject: o3, _reason: t2, _wasAlreadyErroring: n2 };
  });
  return e2._pendingAbortRequest._promise = a2, n2 || Ct(e2, t2), a2;
}
function Rt(e2) {
  const t2 = e2._state;
  if ("closed" === t2 || "errored" === t2) return d(new TypeError(`The stream (in ${t2} state) is not in the writable state and cannot be closed`));
  const r2 = u((t3, r3) => {
    const o3 = { _resolve: t3, _reject: r3 };
    e2._closeRequest = o3;
  }), o2 = e2._writer;
  var n2;
  return void 0 !== o2 && e2._backpressure && "writable" === t2 && or(o2), ve(n2 = e2._writableStreamController, Dt, 0), Mt(n2), r2;
}
function Tt(e2, t2) {
  "writable" !== e2._state ? Pt(e2) : Ct(e2, t2);
}
function Ct(e2, t2) {
  const r2 = e2._writableStreamController;
  e2._state = "erroring", e2._storedError = t2;
  const o2 = e2._writer;
  void 0 !== o2 && jt(o2, t2), !(function(e3) {
    if (void 0 === e3._inFlightWriteRequest && void 0 === e3._inFlightCloseRequest) return false;
    return true;
  })(e2) && r2._started && Pt(e2);
}
function Pt(e2) {
  e2._state = "errored", e2._writableStreamController[R]();
  const t2 = e2._storedError;
  if (e2._writeRequests.forEach((e3) => {
    e3._reject(t2);
  }), e2._writeRequests = new v(), void 0 === e2._pendingAbortRequest) return void Et(e2);
  const r2 = e2._pendingAbortRequest;
  if (e2._pendingAbortRequest = void 0, r2._wasAlreadyErroring) return r2._reject(t2), void Et(e2);
  b(e2._writableStreamController[w](r2._reason), () => (r2._resolve(), Et(e2), null), (t3) => (r2._reject(t3), Et(e2), null));
}
function qt(e2) {
  return void 0 !== e2._closeRequest || void 0 !== e2._inFlightCloseRequest;
}
function Et(e2) {
  void 0 !== e2._closeRequest && (e2._closeRequest._reject(e2._storedError), e2._closeRequest = void 0);
  const t2 = e2._writer;
  void 0 !== t2 && Jt(t2, e2._storedError);
}
function Wt(e2, t2) {
  const r2 = e2._writer;
  void 0 !== r2 && t2 !== e2._backpressure && (t2 ? (function(e3) {
    Zt(e3);
  })(r2) : or(r2)), e2._backpressure = t2;
}
Object.defineProperties(WritableStream.prototype, { abort: { enumerable: true }, close: { enumerable: true }, getWriter: { enumerable: true }, locked: { enumerable: true } }), o(WritableStream.prototype.abort, "abort"), o(WritableStream.prototype.close, "close"), o(WritableStream.prototype.getWriter, "getWriter"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(WritableStream.prototype, Symbol.toStringTag, { value: "WritableStream", configurable: true });
class WritableStreamDefaultWriter {
  constructor(e2) {
    if ($(e2, 1, "WritableStreamDefaultWriter"), pt(e2, "First parameter"), vt(e2)) throw new TypeError("This stream has already been locked for exclusive writing by another writer");
    this._ownerWritableStream = e2, e2._writer = this;
    const t2 = e2._state;
    if ("writable" === t2) !qt(e2) && e2._backpressure ? Zt(this) : tr(this), Gt(this);
    else if ("erroring" === t2) er(this, e2._storedError), Gt(this);
    else if ("closed" === t2) tr(this), Gt(r2 = this), Kt(r2);
    else {
      const t3 = e2._storedError;
      er(this, t3), Xt(this, t3);
    }
    var r2;
  }
  get closed() {
    return Ot(this) ? this._closedPromise : d(Vt("closed"));
  }
  get desiredSize() {
    if (!Ot(this)) throw Vt("desiredSize");
    if (void 0 === this._ownerWritableStream) throw Ut("desiredSize");
    return (function(e2) {
      const t2 = e2._ownerWritableStream, r2 = t2._state;
      if ("errored" === r2 || "erroring" === r2) return null;
      if ("closed" === r2) return 0;
      return $t(t2._writableStreamController);
    })(this);
  }
  get ready() {
    return Ot(this) ? this._readyPromise : d(Vt("ready"));
  }
  abort(e2 = void 0) {
    return Ot(this) ? void 0 === this._ownerWritableStream ? d(Ut("abort")) : (function(e3, t2) {
      return wt(e3._ownerWritableStream, t2);
    })(this, e2) : d(Vt("abort"));
  }
  close() {
    if (!Ot(this)) return d(Vt("close"));
    const e2 = this._ownerWritableStream;
    return void 0 === e2 ? d(Ut("close")) : qt(e2) ? d(new TypeError("Cannot close an already-closing stream")) : Bt(this);
  }
  releaseLock() {
    if (!Ot(this)) throw Vt("releaseLock");
    void 0 !== this._ownerWritableStream && At(this);
  }
  write(e2 = void 0) {
    return Ot(this) ? void 0 === this._ownerWritableStream ? d(Ut("write to")) : zt(this, e2) : d(Vt("write"));
  }
}
function Ot(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_ownerWritableStream") && e2 instanceof WritableStreamDefaultWriter);
}
function Bt(e2) {
  return Rt(e2._ownerWritableStream);
}
function kt(e2, t2) {
  "pending" === e2._closedPromiseState ? Jt(e2, t2) : (function(e3, t3) {
    Xt(e3, t3);
  })(e2, t2);
}
function jt(e2, t2) {
  "pending" === e2._readyPromiseState ? rr(e2, t2) : (function(e3, t3) {
    er(e3, t3);
  })(e2, t2);
}
function At(e2) {
  const t2 = e2._ownerWritableStream, r2 = new TypeError("Writer was released and can no longer be used to monitor the stream's closedness");
  jt(e2, r2), kt(e2, r2), t2._writer = void 0, e2._ownerWritableStream = void 0;
}
function zt(e2, t2) {
  const r2 = e2._ownerWritableStream, o2 = r2._writableStreamController, n2 = (function(e3, t3) {
    if (void 0 === e3._strategySizeAlgorithm) return 1;
    try {
      return e3._strategySizeAlgorithm(t3);
    } catch (t4) {
      return Yt(e3, t4), 1;
    }
  })(o2, t2);
  if (r2 !== e2._ownerWritableStream) return d(Ut("write to"));
  const a2 = r2._state;
  if ("errored" === a2) return d(r2._storedError);
  if (qt(r2) || "closed" === a2) return d(new TypeError("The stream is closing or closed and cannot be written to"));
  if ("erroring" === a2) return d(r2._storedError);
  const i2 = (function(e3) {
    return u((t3, r3) => {
      const o3 = { _resolve: t3, _reject: r3 };
      e3._writeRequests.push(o3);
    });
  })(r2);
  return (function(e3, t3, r3) {
    try {
      ve(e3, t3, r3);
    } catch (t4) {
      return void Yt(e3, t4);
    }
    const o3 = e3._controlledWritableStream;
    if (!qt(o3) && "writable" === o3._state) {
      Wt(o3, xt(e3));
    }
    Mt(e3);
  })(o2, t2, n2), i2;
}
Object.defineProperties(WritableStreamDefaultWriter.prototype, { abort: { enumerable: true }, close: { enumerable: true }, releaseLock: { enumerable: true }, write: { enumerable: true }, closed: { enumerable: true }, desiredSize: { enumerable: true }, ready: { enumerable: true } }), o(WritableStreamDefaultWriter.prototype.abort, "abort"), o(WritableStreamDefaultWriter.prototype.close, "close"), o(WritableStreamDefaultWriter.prototype.releaseLock, "releaseLock"), o(WritableStreamDefaultWriter.prototype.write, "write"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(WritableStreamDefaultWriter.prototype, Symbol.toStringTag, { value: "WritableStreamDefaultWriter", configurable: true });
const Dt = {};
class WritableStreamDefaultController {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get abortReason() {
    if (!Lt(this)) throw Ht("abortReason");
    return this._abortReason;
  }
  get signal() {
    if (!Lt(this)) throw Ht("signal");
    if (void 0 === this._abortController) throw new TypeError("WritableStreamDefaultController.prototype.signal is not supported");
    return this._abortController.signal;
  }
  error(e2 = void 0) {
    if (!Lt(this)) throw Ht("error");
    "writable" === this._controlledWritableStream._state && Qt(this, e2);
  }
  [w](e2) {
    const t2 = this._abortAlgorithm(e2);
    return It(this), t2;
  }
  [R]() {
    we(this);
  }
}
function Lt(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledWritableStream") && e2 instanceof WritableStreamDefaultController);
}
function Ft(e2, t2, r2, o2, n2, a2, i2, l2) {
  t2._controlledWritableStream = e2, e2._writableStreamController = t2, t2._queue = void 0, t2._queueTotalSize = void 0, we(t2), t2._abortReason = void 0, t2._abortController = (function() {
    if ("function" == typeof AbortController) return new AbortController();
  })(), t2._started = false, t2._strategySizeAlgorithm = l2, t2._strategyHWM = i2, t2._writeAlgorithm = o2, t2._closeAlgorithm = n2, t2._abortAlgorithm = a2;
  const s2 = xt(t2);
  Wt(e2, s2);
  b(c(r2()), () => (t2._started = true, Mt(t2), null), (r3) => (t2._started = true, Tt(e2, r3), null));
}
function It(e2) {
  e2._writeAlgorithm = void 0, e2._closeAlgorithm = void 0, e2._abortAlgorithm = void 0, e2._strategySizeAlgorithm = void 0;
}
function $t(e2) {
  return e2._strategyHWM - e2._queueTotalSize;
}
function Mt(e2) {
  const t2 = e2._controlledWritableStream;
  if (!e2._started) return;
  if (void 0 !== t2._inFlightWriteRequest) return;
  if ("erroring" === t2._state) return void Pt(t2);
  if (0 === e2._queue.length) return;
  const r2 = e2._queue.peek().value;
  r2 === Dt ? (function(e3) {
    const t3 = e3._controlledWritableStream;
    (function(e4) {
      e4._inFlightCloseRequest = e4._closeRequest, e4._closeRequest = void 0;
    })(t3), ge(e3);
    const r3 = e3._closeAlgorithm();
    It(e3), b(r3, () => ((function(e4) {
      e4._inFlightCloseRequest._resolve(void 0), e4._inFlightCloseRequest = void 0, "erroring" === e4._state && (e4._storedError = void 0, void 0 !== e4._pendingAbortRequest && (e4._pendingAbortRequest._resolve(), e4._pendingAbortRequest = void 0)), e4._state = "closed";
      const t4 = e4._writer;
      void 0 !== t4 && Kt(t4);
    })(t3), null), (e4) => ((function(e5, t4) {
      e5._inFlightCloseRequest._reject(t4), e5._inFlightCloseRequest = void 0, void 0 !== e5._pendingAbortRequest && (e5._pendingAbortRequest._reject(t4), e5._pendingAbortRequest = void 0), Tt(e5, t4);
    })(t3, e4), null));
  })(e2) : (function(e3, t3) {
    const r3 = e3._controlledWritableStream;
    !(function(e4) {
      e4._inFlightWriteRequest = e4._writeRequests.shift();
    })(r3);
    const o2 = e3._writeAlgorithm(t3);
    b(o2, () => {
      !(function(e4) {
        e4._inFlightWriteRequest._resolve(void 0), e4._inFlightWriteRequest = void 0;
      })(r3);
      const t4 = r3._state;
      if (ge(e3), !qt(r3) && "writable" === t4) {
        const t5 = xt(e3);
        Wt(r3, t5);
      }
      return Mt(e3), null;
    }, (t4) => ("writable" === r3._state && It(e3), (function(e4, t5) {
      e4._inFlightWriteRequest._reject(t5), e4._inFlightWriteRequest = void 0, Tt(e4, t5);
    })(r3, t4), null));
  })(e2, r2);
}
function Yt(e2, t2) {
  "writable" === e2._controlledWritableStream._state && Qt(e2, t2);
}
function xt(e2) {
  return $t(e2) <= 0;
}
function Qt(e2, t2) {
  const r2 = e2._controlledWritableStream;
  It(e2), Ct(r2, t2);
}
function Nt(e2) {
  return new TypeError(`WritableStream.prototype.${e2} can only be used on a WritableStream`);
}
function Ht(e2) {
  return new TypeError(`WritableStreamDefaultController.prototype.${e2} can only be used on a WritableStreamDefaultController`);
}
function Vt(e2) {
  return new TypeError(`WritableStreamDefaultWriter.prototype.${e2} can only be used on a WritableStreamDefaultWriter`);
}
function Ut(e2) {
  return new TypeError("Cannot " + e2 + " a stream using a released writer");
}
function Gt(e2) {
  e2._closedPromise = u((t2, r2) => {
    e2._closedPromise_resolve = t2, e2._closedPromise_reject = r2, e2._closedPromiseState = "pending";
  });
}
function Xt(e2, t2) {
  Gt(e2), Jt(e2, t2);
}
function Jt(e2, t2) {
  void 0 !== e2._closedPromise_reject && (p(e2._closedPromise), e2._closedPromise_reject(t2), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0, e2._closedPromiseState = "rejected");
}
function Kt(e2) {
  void 0 !== e2._closedPromise_resolve && (e2._closedPromise_resolve(void 0), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0, e2._closedPromiseState = "resolved");
}
function Zt(e2) {
  e2._readyPromise = u((t2, r2) => {
    e2._readyPromise_resolve = t2, e2._readyPromise_reject = r2;
  }), e2._readyPromiseState = "pending";
}
function er(e2, t2) {
  Zt(e2), rr(e2, t2);
}
function tr(e2) {
  Zt(e2), or(e2);
}
function rr(e2, t2) {
  void 0 !== e2._readyPromise_reject && (p(e2._readyPromise), e2._readyPromise_reject(t2), e2._readyPromise_resolve = void 0, e2._readyPromise_reject = void 0, e2._readyPromiseState = "rejected");
}
function or(e2) {
  void 0 !== e2._readyPromise_resolve && (e2._readyPromise_resolve(void 0), e2._readyPromise_resolve = void 0, e2._readyPromise_reject = void 0, e2._readyPromiseState = "fulfilled");
}
Object.defineProperties(WritableStreamDefaultController.prototype, { abortReason: { enumerable: true }, signal: { enumerable: true }, error: { enumerable: true } }), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(WritableStreamDefaultController.prototype, Symbol.toStringTag, { value: "WritableStreamDefaultController", configurable: true });
const nr = "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : "undefined" != typeof __webpack_require__.g ? __webpack_require__.g : void 0;
const ar = (function() {
  const e2 = null == nr ? void 0 : nr.DOMException;
  return (function(e3) {
    if ("function" != typeof e3 && "object" != typeof e3) return false;
    if ("DOMException" !== e3.name) return false;
    try {
      return new e3(), true;
    } catch (e4) {
      return false;
    }
  })(e2) ? e2 : void 0;
})() || (function() {
  const e2 = function(e3, t2) {
    this.message = e3 || "", this.name = t2 || "Error", Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
  };
  return o(e2, "DOMException"), e2.prototype = Object.create(Error.prototype), Object.defineProperty(e2.prototype, "constructor", { value: e2, writable: true, configurable: true }), e2;
})();
function ir(t2, r2, o2, n2, a2, i2) {
  const l2 = H(t2), s2 = yt(r2);
  t2._disturbed = true;
  let _2 = false, y2 = c(void 0);
  return u((S2, g2) => {
    let v2;
    if (void 0 !== i2) {
      if (v2 = () => {
        const e2 = void 0 !== i2.reason ? i2.reason : new ar("Aborted", "AbortError"), o3 = [];
        n2 || o3.push(() => "writable" === r2._state ? wt(r2, e2) : c(void 0)), a2 || o3.push(() => "readable" === t2._state ? Or(t2, e2) : c(void 0)), q2(() => Promise.all(o3.map((e3) => e3())), true, e2);
      }, i2.aborted) return void v2();
      i2.addEventListener("abort", v2);
    }
    var w2, R2, T2;
    if (P2(t2, l2._closedPromise, (e2) => (n2 ? E2(true, e2) : q2(() => wt(r2, e2), true, e2), null)), P2(r2, s2._closedPromise, (e2) => (a2 ? E2(true, e2) : q2(() => Or(t2, e2), true, e2), null)), w2 = t2, R2 = l2._closedPromise, T2 = () => (o2 ? E2() : q2(() => (function(e2) {
      const t3 = e2._ownerWritableStream, r3 = t3._state;
      return qt(t3) || "closed" === r3 ? c(void 0) : "errored" === r3 ? d(t3._storedError) : Bt(e2);
    })(s2)), null), "closed" === w2._state ? T2() : h(R2, T2), qt(r2) || "closed" === r2._state) {
      const e2 = new TypeError("the destination writable stream closed before all data could be piped to it");
      a2 ? E2(true, e2) : q2(() => Or(t2, e2), true, e2);
    }
    function C2() {
      const e2 = y2;
      return f(y2, () => e2 !== y2 ? C2() : void 0);
    }
    function P2(e2, t3, r3) {
      "errored" === e2._state ? r3(e2._storedError) : m(t3, r3);
    }
    function q2(e2, t3, o3) {
      function n3() {
        return b(e2(), () => O2(t3, o3), (e3) => O2(true, e3)), null;
      }
      _2 || (_2 = true, "writable" !== r2._state || qt(r2) ? n3() : h(C2(), n3));
    }
    function E2(e2, t3) {
      _2 || (_2 = true, "writable" !== r2._state || qt(r2) ? O2(e2, t3) : h(C2(), () => O2(e2, t3)));
    }
    function O2(e2, t3) {
      return At(s2), W(l2), void 0 !== i2 && i2.removeEventListener("abort", v2), e2 ? g2(t3) : S2(void 0), null;
    }
    p(u((t3, r3) => {
      !(function o3(n3) {
        n3 ? t3() : f(_2 ? c(true) : f(s2._readyPromise, () => u((t4, r4) => {
          K(l2, { _chunkSteps: (r5) => {
            y2 = f(zt(s2, r5), void 0, e), t4(false);
          }, _closeSteps: () => t4(true), _errorSteps: r4 });
        })), o3, r3);
      })(false);
    }));
  });
}
class ReadableStreamDefaultController {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get desiredSize() {
    if (!lr(this)) throw pr("desiredSize");
    return hr(this);
  }
  close() {
    if (!lr(this)) throw pr("close");
    if (!mr(this)) throw new TypeError("The stream is not in a state that permits close");
    dr(this);
  }
  enqueue(e2 = void 0) {
    if (!lr(this)) throw pr("enqueue");
    if (!mr(this)) throw new TypeError("The stream is not in a state that permits enqueue");
    return fr(this, e2);
  }
  error(e2 = void 0) {
    if (!lr(this)) throw pr("error");
    br(this, e2);
  }
  [T](e2) {
    we(this);
    const t2 = this._cancelAlgorithm(e2);
    return cr(this), t2;
  }
  [C](e2) {
    const t2 = this._controlledReadableStream;
    if (this._queue.length > 0) {
      const r2 = ge(this);
      this._closeRequested && 0 === this._queue.length ? (cr(this), Br(t2)) : sr(this), e2._chunkSteps(r2);
    } else V(t2, e2), sr(this);
  }
  [P]() {
  }
}
function lr(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledReadableStream") && e2 instanceof ReadableStreamDefaultController);
}
function sr(e2) {
  if (!ur(e2)) return;
  if (e2._pulling) return void (e2._pullAgain = true);
  e2._pulling = true;
  b(e2._pullAlgorithm(), () => (e2._pulling = false, e2._pullAgain && (e2._pullAgain = false, sr(e2)), null), (t2) => (br(e2, t2), null));
}
function ur(e2) {
  const t2 = e2._controlledReadableStream;
  if (!mr(e2)) return false;
  if (!e2._started) return false;
  if (Wr(t2) && G(t2) > 0) return true;
  return hr(e2) > 0;
}
function cr(e2) {
  e2._pullAlgorithm = void 0, e2._cancelAlgorithm = void 0, e2._strategySizeAlgorithm = void 0;
}
function dr(e2) {
  if (!mr(e2)) return;
  const t2 = e2._controlledReadableStream;
  e2._closeRequested = true, 0 === e2._queue.length && (cr(e2), Br(t2));
}
function fr(e2, t2) {
  if (!mr(e2)) return;
  const r2 = e2._controlledReadableStream;
  if (Wr(r2) && G(r2) > 0) U(r2, t2, false);
  else {
    let r3;
    try {
      r3 = e2._strategySizeAlgorithm(t2);
    } catch (t3) {
      throw br(e2, t3), t3;
    }
    try {
      ve(e2, t2, r3);
    } catch (t3) {
      throw br(e2, t3), t3;
    }
  }
  sr(e2);
}
function br(e2, t2) {
  const r2 = e2._controlledReadableStream;
  "readable" === r2._state && (we(e2), cr(e2), kr(r2, t2));
}
function hr(e2) {
  const t2 = e2._controlledReadableStream._state;
  return "errored" === t2 ? null : "closed" === t2 ? 0 : e2._strategyHWM - e2._queueTotalSize;
}
function mr(e2) {
  const t2 = e2._controlledReadableStream._state;
  return !e2._closeRequested && "readable" === t2;
}
function _r(e2, t2, r2, o2, n2, a2, i2) {
  t2._controlledReadableStream = e2, t2._queue = void 0, t2._queueTotalSize = void 0, we(t2), t2._started = false, t2._closeRequested = false, t2._pullAgain = false, t2._pulling = false, t2._strategySizeAlgorithm = i2, t2._strategyHWM = a2, t2._pullAlgorithm = o2, t2._cancelAlgorithm = n2, e2._readableStreamController = t2;
  b(c(r2()), () => (t2._started = true, sr(t2), null), (e3) => (br(t2, e3), null));
}
function pr(e2) {
  return new TypeError(`ReadableStreamDefaultController.prototype.${e2} can only be used on a ReadableStreamDefaultController`);
}
function yr(e2, t2) {
  return Te(e2._readableStreamController) ? (function(e3) {
    let t3, r2, o2, n2, a2, i2 = H(e3), l2 = false, s2 = false, d2 = false, f2 = false, b2 = false;
    const h2 = u((e4) => {
      a2 = e4;
    });
    function _2(e4) {
      m(e4._closedPromise, (t4) => (e4 !== i2 || (Ne(o2._readableStreamController, t4), Ne(n2._readableStreamController, t4), f2 && b2 || a2(void 0)), null));
    }
    function p2() {
      at(i2) && (W(i2), i2 = H(e3), _2(i2));
      K(i2, { _chunkSteps: (t4) => {
        y(() => {
          s2 = false, d2 = false;
          const r3 = t4;
          let i3 = t4;
          if (!f2 && !b2) try {
            i3 = Se(t4);
          } catch (t5) {
            return Ne(o2._readableStreamController, t5), Ne(n2._readableStreamController, t5), void a2(Or(e3, t5));
          }
          f2 || Qe(o2._readableStreamController, r3), b2 || Qe(n2._readableStreamController, i3), l2 = false, s2 ? g2() : d2 && v2();
        });
      }, _closeSteps: () => {
        l2 = false, f2 || xe(o2._readableStreamController), b2 || xe(n2._readableStreamController), o2._readableStreamController._pendingPullIntos.length > 0 && Ge(o2._readableStreamController, 0), n2._readableStreamController._pendingPullIntos.length > 0 && Ge(n2._readableStreamController, 0), f2 && b2 || a2(void 0);
      }, _errorSteps: () => {
        l2 = false;
      } });
    }
    function S2(t4, r3) {
      J(i2) && (W(i2), i2 = tt(e3), _2(i2));
      const u2 = r3 ? n2 : o2, c2 = r3 ? o2 : n2;
      it(i2, t4, 1, { _chunkSteps: (t5) => {
        y(() => {
          s2 = false, d2 = false;
          const o3 = r3 ? b2 : f2;
          if (r3 ? f2 : b2) o3 || Xe(u2._readableStreamController, t5);
          else {
            let r4;
            try {
              r4 = Se(t5);
            } catch (t6) {
              return Ne(u2._readableStreamController, t6), Ne(c2._readableStreamController, t6), void a2(Or(e3, t6));
            }
            o3 || Xe(u2._readableStreamController, t5), Qe(c2._readableStreamController, r4);
          }
          l2 = false, s2 ? g2() : d2 && v2();
        });
      }, _closeSteps: (e4) => {
        l2 = false;
        const t5 = r3 ? b2 : f2, o3 = r3 ? f2 : b2;
        t5 || xe(u2._readableStreamController), o3 || xe(c2._readableStreamController), void 0 !== e4 && (t5 || Xe(u2._readableStreamController, e4), !o3 && c2._readableStreamController._pendingPullIntos.length > 0 && Ge(c2._readableStreamController, 0)), t5 && o3 || a2(void 0);
      }, _errorSteps: () => {
        l2 = false;
      } });
    }
    function g2() {
      if (l2) return s2 = true, c(void 0);
      l2 = true;
      const e4 = Ve(o2._readableStreamController);
      return null === e4 ? p2() : S2(e4._view, false), c(void 0);
    }
    function v2() {
      if (l2) return d2 = true, c(void 0);
      l2 = true;
      const e4 = Ve(n2._readableStreamController);
      return null === e4 ? p2() : S2(e4._view, true), c(void 0);
    }
    function w2(o3) {
      if (f2 = true, t3 = o3, b2) {
        const o4 = ne([t3, r2]), n3 = Or(e3, o4);
        a2(n3);
      }
      return h2;
    }
    function R2(o3) {
      if (b2 = true, r2 = o3, f2) {
        const o4 = ne([t3, r2]), n3 = Or(e3, o4);
        a2(n3);
      }
      return h2;
    }
    function T2() {
    }
    return o2 = Pr(T2, g2, w2), n2 = Pr(T2, v2, R2), _2(i2), [o2, n2];
  })(e2) : (function(e3) {
    const t3 = H(e3);
    let r2, o2, n2, a2, i2, l2 = false, s2 = false, d2 = false, f2 = false;
    const b2 = u((e4) => {
      i2 = e4;
    });
    function h2() {
      if (l2) return s2 = true, c(void 0);
      l2 = true;
      return K(t3, { _chunkSteps: (e4) => {
        y(() => {
          s2 = false;
          const t4 = e4, r3 = e4;
          d2 || fr(n2._readableStreamController, t4), f2 || fr(a2._readableStreamController, r3), l2 = false, s2 && h2();
        });
      }, _closeSteps: () => {
        l2 = false, d2 || dr(n2._readableStreamController), f2 || dr(a2._readableStreamController), d2 && f2 || i2(void 0);
      }, _errorSteps: () => {
        l2 = false;
      } }), c(void 0);
    }
    function _2(t4) {
      if (d2 = true, r2 = t4, f2) {
        const t5 = ne([r2, o2]), n3 = Or(e3, t5);
        i2(n3);
      }
      return b2;
    }
    function p2(t4) {
      if (f2 = true, o2 = t4, d2) {
        const t5 = ne([r2, o2]), n3 = Or(e3, t5);
        i2(n3);
      }
      return b2;
    }
    function S2() {
    }
    return n2 = Cr(S2, h2, _2), a2 = Cr(S2, h2, p2), m(t3._closedPromise, (e4) => (br(n2._readableStreamController, e4), br(a2._readableStreamController, e4), d2 && f2 || i2(void 0), null)), [n2, a2];
  })(e2);
}
function Sr(r2) {
  return t(o2 = r2) && void 0 !== o2.getReader ? (function(r3) {
    let o3;
    function n2() {
      let e2;
      try {
        e2 = r3.read();
      } catch (e3) {
        return d(e3);
      }
      return _(e2, (e3) => {
        if (!t(e3)) throw new TypeError("The promise returned by the reader.read() method must fulfill with an object");
        if (e3.done) dr(o3._readableStreamController);
        else {
          const t2 = e3.value;
          fr(o3._readableStreamController, t2);
        }
      });
    }
    function a2(e2) {
      try {
        return c(r3.cancel(e2));
      } catch (e3) {
        return d(e3);
      }
    }
    return o3 = Cr(e, n2, a2, 0), o3;
  })(r2.getReader()) : (function(r3) {
    let o3;
    const n2 = fe(r3, "async");
    function a2() {
      let e2;
      try {
        e2 = be(n2);
      } catch (e3) {
        return d(e3);
      }
      return _(c(e2), (e3) => {
        if (!t(e3)) throw new TypeError("The promise returned by the iterator.next() method must fulfill with an object");
        if (e3.done) dr(o3._readableStreamController);
        else {
          const t2 = e3.value;
          fr(o3._readableStreamController, t2);
        }
      });
    }
    function i2(e2) {
      const r4 = n2.iterator;
      let o4;
      try {
        o4 = ue(r4, "return");
      } catch (e3) {
        return d(e3);
      }
      if (void 0 === o4) return c(void 0);
      return _(g(o4, r4, [e2]), (e3) => {
        if (!t(e3)) throw new TypeError("The promise returned by the iterator.return() method must fulfill with an object");
      });
    }
    return o3 = Cr(e, a2, i2, 0), o3;
  })(r2);
  // removed by dead control flow
 var o2; 
}
function gr(e2, t2, r2) {
  return F(e2, r2), (r3) => g(e2, t2, [r3]);
}
function vr(e2, t2, r2) {
  return F(e2, r2), (r3) => g(e2, t2, [r3]);
}
function wr(e2, t2, r2) {
  return F(e2, r2), (r3) => S(e2, t2, [r3]);
}
function Rr(e2, t2) {
  if ("bytes" !== (e2 = `${e2}`)) throw new TypeError(`${t2} '${e2}' is not a valid enumeration value for ReadableStreamType`);
  return e2;
}
function Tr(e2, t2) {
  L(e2, t2);
  const r2 = null == e2 ? void 0 : e2.preventAbort, o2 = null == e2 ? void 0 : e2.preventCancel, n2 = null == e2 ? void 0 : e2.preventClose, a2 = null == e2 ? void 0 : e2.signal;
  return void 0 !== a2 && (function(e3, t3) {
    if (!(function(e4) {
      if ("object" != typeof e4 || null === e4) return false;
      try {
        return "boolean" == typeof e4.aborted;
      } catch (e5) {
        return false;
      }
    })(e3)) throw new TypeError(`${t3} is not an AbortSignal.`);
  })(a2, `${t2} has member 'signal' that`), { preventAbort: Boolean(r2), preventCancel: Boolean(o2), preventClose: Boolean(n2), signal: a2 };
}
Object.defineProperties(ReadableStreamDefaultController.prototype, { close: { enumerable: true }, enqueue: { enumerable: true }, error: { enumerable: true }, desiredSize: { enumerable: true } }), o(ReadableStreamDefaultController.prototype.close, "close"), o(ReadableStreamDefaultController.prototype.enqueue, "enqueue"), o(ReadableStreamDefaultController.prototype.error, "error"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableStreamDefaultController.prototype, Symbol.toStringTag, { value: "ReadableStreamDefaultController", configurable: true });
class ReadableStream {
  constructor(e2 = {}, t2 = {}) {
    void 0 === e2 ? e2 = null : I(e2, "First parameter");
    const r2 = dt(t2, "Second parameter"), o2 = (function(e3, t3) {
      L(e3, t3);
      const r3 = e3, o3 = null == r3 ? void 0 : r3.autoAllocateChunkSize, n2 = null == r3 ? void 0 : r3.cancel, a2 = null == r3 ? void 0 : r3.pull, i2 = null == r3 ? void 0 : r3.start, l2 = null == r3 ? void 0 : r3.type;
      return { autoAllocateChunkSize: void 0 === o3 ? void 0 : Q(o3, `${t3} has member 'autoAllocateChunkSize' that`), cancel: void 0 === n2 ? void 0 : gr(n2, r3, `${t3} has member 'cancel' that`), pull: void 0 === a2 ? void 0 : vr(a2, r3, `${t3} has member 'pull' that`), start: void 0 === i2 ? void 0 : wr(i2, r3, `${t3} has member 'start' that`), type: void 0 === l2 ? void 0 : Rr(l2, `${t3} has member 'type' that`) };
    })(e2, "First parameter");
    if (qr(this), "bytes" === o2.type) {
      if (void 0 !== r2.size) throw new RangeError("The strategy for a byte stream cannot have a size function");
      !(function(e3, t3, r3) {
        const o3 = Object.create(ReadableByteStreamController.prototype);
        let n2, a2, i2;
        n2 = void 0 !== t3.start ? () => t3.start(o3) : () => {
        }, a2 = void 0 !== t3.pull ? () => t3.pull(o3) : () => c(void 0), i2 = void 0 !== t3.cancel ? (e4) => t3.cancel(e4) : () => c(void 0);
        const l2 = t3.autoAllocateChunkSize;
        if (0 === l2) throw new TypeError("autoAllocateChunkSize must be greater than 0");
        Je(e3, o3, n2, a2, i2, r3, l2);
      })(this, o2, ut(r2, 0));
    } else {
      const e3 = ct(r2);
      !(function(e4, t3, r3, o3) {
        const n2 = Object.create(ReadableStreamDefaultController.prototype);
        let a2, i2, l2;
        a2 = void 0 !== t3.start ? () => t3.start(n2) : () => {
        }, i2 = void 0 !== t3.pull ? () => t3.pull(n2) : () => c(void 0), l2 = void 0 !== t3.cancel ? (e5) => t3.cancel(e5) : () => c(void 0), _r(e4, n2, a2, i2, l2, r3, o3);
      })(this, o2, ut(r2, 1), e3);
    }
  }
  get locked() {
    if (!Er(this)) throw jr("locked");
    return Wr(this);
  }
  cancel(e2 = void 0) {
    return Er(this) ? Wr(this) ? d(new TypeError("Cannot cancel a stream that already has a reader")) : Or(this, e2) : d(jr("cancel"));
  }
  getReader(e2 = void 0) {
    if (!Er(this)) throw jr("getReader");
    return void 0 === (function(e3, t2) {
      L(e3, t2);
      const r2 = null == e3 ? void 0 : e3.mode;
      return { mode: void 0 === r2 ? void 0 : et(r2, `${t2} has member 'mode' that`) };
    })(e2, "First parameter").mode ? H(this) : tt(this);
  }
  pipeThrough(e2, t2 = {}) {
    if (!Er(this)) throw jr("pipeThrough");
    $(e2, 1, "pipeThrough");
    const r2 = (function(e3, t3) {
      L(e3, t3);
      const r3 = null == e3 ? void 0 : e3.readable;
      M(r3, "readable", "ReadableWritablePair"), N(r3, `${t3} has member 'readable' that`);
      const o3 = null == e3 ? void 0 : e3.writable;
      return M(o3, "writable", "ReadableWritablePair"), pt(o3, `${t3} has member 'writable' that`), { readable: r3, writable: o3 };
    })(e2, "First parameter"), o2 = Tr(t2, "Second parameter");
    if (Wr(this)) throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked ReadableStream");
    if (vt(r2.writable)) throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked WritableStream");
    return p(ir(this, r2.writable, o2.preventClose, o2.preventAbort, o2.preventCancel, o2.signal)), r2.readable;
  }
  pipeTo(e2, t2 = {}) {
    if (!Er(this)) return d(jr("pipeTo"));
    if (void 0 === e2) return d("Parameter 1 is required in 'pipeTo'.");
    if (!gt(e2)) return d(new TypeError("ReadableStream.prototype.pipeTo's first argument must be a WritableStream"));
    let r2;
    try {
      r2 = Tr(t2, "Second parameter");
    } catch (e3) {
      return d(e3);
    }
    return Wr(this) ? d(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream")) : vt(e2) ? d(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream")) : ir(this, e2, r2.preventClose, r2.preventAbort, r2.preventCancel, r2.signal);
  }
  tee() {
    if (!Er(this)) throw jr("tee");
    return ne(yr(this));
  }
  values(e2 = void 0) {
    if (!Er(this)) throw jr("values");
    return (function(e3, t2) {
      const r2 = H(e3), o2 = new he(r2, t2), n2 = Object.create(me);
      return n2._asyncIteratorImpl = o2, n2;
    })(this, (function(e3, t2) {
      L(e3, t2);
      const r2 = null == e3 ? void 0 : e3.preventCancel;
      return { preventCancel: Boolean(r2) };
    })(e2, "First parameter").preventCancel);
  }
  [de](e2) {
    return this.values(e2);
  }
  static from(e2) {
    return Sr(e2);
  }
}
function Cr(e2, t2, r2, o2 = 1, n2 = () => 1) {
  const a2 = Object.create(ReadableStream.prototype);
  qr(a2);
  return _r(a2, Object.create(ReadableStreamDefaultController.prototype), e2, t2, r2, o2, n2), a2;
}
function Pr(e2, t2, r2) {
  const o2 = Object.create(ReadableStream.prototype);
  qr(o2);
  return Je(o2, Object.create(ReadableByteStreamController.prototype), e2, t2, r2, 0, void 0), o2;
}
function qr(e2) {
  e2._state = "readable", e2._reader = void 0, e2._storedError = void 0, e2._disturbed = false;
}
function Er(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readableStreamController") && e2 instanceof ReadableStream);
}
function Wr(e2) {
  return void 0 !== e2._reader;
}
function Or(t2, r2) {
  if (t2._disturbed = true, "closed" === t2._state) return c(void 0);
  if ("errored" === t2._state) return d(t2._storedError);
  Br(t2);
  const o2 = t2._reader;
  if (void 0 !== o2 && at(o2)) {
    const e2 = o2._readIntoRequests;
    o2._readIntoRequests = new v(), e2.forEach((e3) => {
      e3._closeSteps(void 0);
    });
  }
  return _(t2._readableStreamController[T](r2), e);
}
function Br(e2) {
  e2._state = "closed";
  const t2 = e2._reader;
  if (void 0 !== t2 && (A(t2), J(t2))) {
    const e3 = t2._readRequests;
    t2._readRequests = new v(), e3.forEach((e4) => {
      e4._closeSteps();
    });
  }
}
function kr(e2, t2) {
  e2._state = "errored", e2._storedError = t2;
  const r2 = e2._reader;
  void 0 !== r2 && (j(r2, t2), J(r2) ? Z(r2, t2) : lt(r2, t2));
}
function jr(e2) {
  return new TypeError(`ReadableStream.prototype.${e2} can only be used on a ReadableStream`);
}
function Ar(e2, t2) {
  L(e2, t2);
  const r2 = null == e2 ? void 0 : e2.highWaterMark;
  return M(r2, "highWaterMark", "QueuingStrategyInit"), { highWaterMark: Y(r2) };
}
Object.defineProperties(ReadableStream, { from: { enumerable: true } }), Object.defineProperties(ReadableStream.prototype, { cancel: { enumerable: true }, getReader: { enumerable: true }, pipeThrough: { enumerable: true }, pipeTo: { enumerable: true }, tee: { enumerable: true }, values: { enumerable: true }, locked: { enumerable: true } }), o(ReadableStream.from, "from"), o(ReadableStream.prototype.cancel, "cancel"), o(ReadableStream.prototype.getReader, "getReader"), o(ReadableStream.prototype.pipeThrough, "pipeThrough"), o(ReadableStream.prototype.pipeTo, "pipeTo"), o(ReadableStream.prototype.tee, "tee"), o(ReadableStream.prototype.values, "values"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableStream.prototype, Symbol.toStringTag, { value: "ReadableStream", configurable: true }), Object.defineProperty(ReadableStream.prototype, de, { value: ReadableStream.prototype.values, writable: true, configurable: true });
const zr = (e2) => e2.byteLength;
o(zr, "size");
class ByteLengthQueuingStrategy {
  constructor(e2) {
    $(e2, 1, "ByteLengthQueuingStrategy"), e2 = Ar(e2, "First parameter"), this._byteLengthQueuingStrategyHighWaterMark = e2.highWaterMark;
  }
  get highWaterMark() {
    if (!Lr(this)) throw Dr("highWaterMark");
    return this._byteLengthQueuingStrategyHighWaterMark;
  }
  get size() {
    if (!Lr(this)) throw Dr("size");
    return zr;
  }
}
function Dr(e2) {
  return new TypeError(`ByteLengthQueuingStrategy.prototype.${e2} can only be used on a ByteLengthQueuingStrategy`);
}
function Lr(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_byteLengthQueuingStrategyHighWaterMark") && e2 instanceof ByteLengthQueuingStrategy);
}
Object.defineProperties(ByteLengthQueuingStrategy.prototype, { highWaterMark: { enumerable: true }, size: { enumerable: true } }), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ByteLengthQueuingStrategy.prototype, Symbol.toStringTag, { value: "ByteLengthQueuingStrategy", configurable: true });
const Fr = () => 1;
o(Fr, "size");
class CountQueuingStrategy {
  constructor(e2) {
    $(e2, 1, "CountQueuingStrategy"), e2 = Ar(e2, "First parameter"), this._countQueuingStrategyHighWaterMark = e2.highWaterMark;
  }
  get highWaterMark() {
    if (!$r(this)) throw Ir("highWaterMark");
    return this._countQueuingStrategyHighWaterMark;
  }
  get size() {
    if (!$r(this)) throw Ir("size");
    return Fr;
  }
}
function Ir(e2) {
  return new TypeError(`CountQueuingStrategy.prototype.${e2} can only be used on a CountQueuingStrategy`);
}
function $r(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_countQueuingStrategyHighWaterMark") && e2 instanceof CountQueuingStrategy);
}
function Mr(e2, t2, r2) {
  return F(e2, r2), (r3) => g(e2, t2, [r3]);
}
function Yr(e2, t2, r2) {
  return F(e2, r2), (r3) => S(e2, t2, [r3]);
}
function xr(e2, t2, r2) {
  return F(e2, r2), (r3, o2) => g(e2, t2, [r3, o2]);
}
function Qr(e2, t2, r2) {
  return F(e2, r2), (r3) => g(e2, t2, [r3]);
}
Object.defineProperties(CountQueuingStrategy.prototype, { highWaterMark: { enumerable: true }, size: { enumerable: true } }), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(CountQueuingStrategy.prototype, Symbol.toStringTag, { value: "CountQueuingStrategy", configurable: true });
class TransformStream {
  constructor(e2 = {}, t2 = {}, r2 = {}) {
    void 0 === e2 && (e2 = null);
    const o2 = dt(t2, "Second parameter"), n2 = dt(r2, "Third parameter"), a2 = (function(e3, t3) {
      L(e3, t3);
      const r3 = null == e3 ? void 0 : e3.cancel, o3 = null == e3 ? void 0 : e3.flush, n3 = null == e3 ? void 0 : e3.readableType, a3 = null == e3 ? void 0 : e3.start, i3 = null == e3 ? void 0 : e3.transform, l3 = null == e3 ? void 0 : e3.writableType;
      return { cancel: void 0 === r3 ? void 0 : Qr(r3, e3, `${t3} has member 'cancel' that`), flush: void 0 === o3 ? void 0 : Mr(o3, e3, `${t3} has member 'flush' that`), readableType: n3, start: void 0 === a3 ? void 0 : Yr(a3, e3, `${t3} has member 'start' that`), transform: void 0 === i3 ? void 0 : xr(i3, e3, `${t3} has member 'transform' that`), writableType: l3 };
    })(e2, "First parameter");
    if (void 0 !== a2.readableType) throw new RangeError("Invalid readableType specified");
    if (void 0 !== a2.writableType) throw new RangeError("Invalid writableType specified");
    const i2 = ut(n2, 0), l2 = ct(n2), s2 = ut(o2, 1), f2 = ct(o2);
    let h2;
    !(function(e3, t3, r3, o3, n3, a3) {
      function i3() {
        return t3;
      }
      function l3(t4) {
        return (function(e4, t5) {
          const r4 = e4._transformStreamController;
          if (e4._backpressure) {
            return _(e4._backpressureChangePromise, () => {
              const o4 = e4._writable;
              if ("erroring" === o4._state) throw o4._storedError;
              return Zr(r4, t5);
            });
          }
          return Zr(r4, t5);
        })(e3, t4);
      }
      function s3(t4) {
        return (function(e4, t5) {
          const r4 = e4._transformStreamController;
          if (void 0 !== r4._finishPromise) return r4._finishPromise;
          const o4 = e4._readable;
          r4._finishPromise = u((e5, t6) => {
            r4._finishPromise_resolve = e5, r4._finishPromise_reject = t6;
          });
          const n4 = r4._cancelAlgorithm(t5);
          return Jr(r4), b(n4, () => ("errored" === o4._state ? ro(r4, o4._storedError) : (br(o4._readableStreamController, t5), to(r4)), null), (e5) => (br(o4._readableStreamController, e5), ro(r4, e5), null)), r4._finishPromise;
        })(e3, t4);
      }
      function c2() {
        return (function(e4) {
          const t4 = e4._transformStreamController;
          if (void 0 !== t4._finishPromise) return t4._finishPromise;
          const r4 = e4._readable;
          t4._finishPromise = u((e5, r5) => {
            t4._finishPromise_resolve = e5, t4._finishPromise_reject = r5;
          });
          const o4 = t4._flushAlgorithm();
          return Jr(t4), b(o4, () => ("errored" === r4._state ? ro(t4, r4._storedError) : (dr(r4._readableStreamController), to(t4)), null), (e5) => (br(r4._readableStreamController, e5), ro(t4, e5), null)), t4._finishPromise;
        })(e3);
      }
      function d2() {
        return (function(e4) {
          return Gr(e4, false), e4._backpressureChangePromise;
        })(e3);
      }
      function f3(t4) {
        return (function(e4, t5) {
          const r4 = e4._transformStreamController;
          if (void 0 !== r4._finishPromise) return r4._finishPromise;
          const o4 = e4._writable;
          r4._finishPromise = u((e5, t6) => {
            r4._finishPromise_resolve = e5, r4._finishPromise_reject = t6;
          });
          const n4 = r4._cancelAlgorithm(t5);
          return Jr(r4), b(n4, () => ("errored" === o4._state ? ro(r4, o4._storedError) : (Yt(o4._writableStreamController, t5), Ur(e4), to(r4)), null), (t6) => (Yt(o4._writableStreamController, t6), Ur(e4), ro(r4, t6), null)), r4._finishPromise;
        })(e3, t4);
      }
      e3._writable = (function(e4, t4, r4, o4, n4 = 1, a4 = () => 1) {
        const i4 = Object.create(WritableStream.prototype);
        return St(i4), Ft(i4, Object.create(WritableStreamDefaultController.prototype), e4, t4, r4, o4, n4, a4), i4;
      })(i3, l3, c2, s3, r3, o3), e3._readable = Cr(i3, d2, f3, n3, a3), e3._backpressure = void 0, e3._backpressureChangePromise = void 0, e3._backpressureChangePromise_resolve = void 0, Gr(e3, true), e3._transformStreamController = void 0;
    })(this, u((e3) => {
      h2 = e3;
    }), s2, f2, i2, l2), (function(e3, t3) {
      const r3 = Object.create(TransformStreamDefaultController.prototype);
      let o3, n3, a3;
      o3 = void 0 !== t3.transform ? (e4) => t3.transform(e4, r3) : (e4) => {
        try {
          return Kr(r3, e4), c(void 0);
        } catch (e5) {
          return d(e5);
        }
      };
      n3 = void 0 !== t3.flush ? () => t3.flush(r3) : () => c(void 0);
      a3 = void 0 !== t3.cancel ? (e4) => t3.cancel(e4) : () => c(void 0);
      !(function(e4, t4, r4, o4, n4) {
        t4._controlledTransformStream = e4, e4._transformStreamController = t4, t4._transformAlgorithm = r4, t4._flushAlgorithm = o4, t4._cancelAlgorithm = n4, t4._finishPromise = void 0, t4._finishPromise_resolve = void 0, t4._finishPromise_reject = void 0;
      })(e3, r3, o3, n3, a3);
    })(this, a2), void 0 !== a2.start ? h2(a2.start(this._transformStreamController)) : h2(void 0);
  }
  get readable() {
    if (!Nr(this)) throw oo("readable");
    return this._readable;
  }
  get writable() {
    if (!Nr(this)) throw oo("writable");
    return this._writable;
  }
}
function Nr(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_transformStreamController") && e2 instanceof TransformStream);
}
function Hr(e2, t2) {
  br(e2._readable._readableStreamController, t2), Vr(e2, t2);
}
function Vr(e2, t2) {
  Jr(e2._transformStreamController), Yt(e2._writable._writableStreamController, t2), Ur(e2);
}
function Ur(e2) {
  e2._backpressure && Gr(e2, false);
}
function Gr(e2, t2) {
  void 0 !== e2._backpressureChangePromise && e2._backpressureChangePromise_resolve(), e2._backpressureChangePromise = u((t3) => {
    e2._backpressureChangePromise_resolve = t3;
  }), e2._backpressure = t2;
}
Object.defineProperties(TransformStream.prototype, { readable: { enumerable: true }, writable: { enumerable: true } }), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(TransformStream.prototype, Symbol.toStringTag, { value: "TransformStream", configurable: true });
class TransformStreamDefaultController {
  constructor() {
    throw new TypeError("Illegal constructor");
  }
  get desiredSize() {
    if (!Xr(this)) throw eo("desiredSize");
    return hr(this._controlledTransformStream._readable._readableStreamController);
  }
  enqueue(e2 = void 0) {
    if (!Xr(this)) throw eo("enqueue");
    Kr(this, e2);
  }
  error(e2 = void 0) {
    if (!Xr(this)) throw eo("error");
    var t2;
    t2 = e2, Hr(this._controlledTransformStream, t2);
  }
  terminate() {
    if (!Xr(this)) throw eo("terminate");
    !(function(e2) {
      const t2 = e2._controlledTransformStream;
      dr(t2._readable._readableStreamController);
      const r2 = new TypeError("TransformStream terminated");
      Vr(t2, r2);
    })(this);
  }
}
function Xr(e2) {
  return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledTransformStream") && e2 instanceof TransformStreamDefaultController);
}
function Jr(e2) {
  e2._transformAlgorithm = void 0, e2._flushAlgorithm = void 0, e2._cancelAlgorithm = void 0;
}
function Kr(e2, t2) {
  const r2 = e2._controlledTransformStream, o2 = r2._readable._readableStreamController;
  if (!mr(o2)) throw new TypeError("Readable side is not in a state that permits enqueue");
  try {
    fr(o2, t2);
  } catch (e3) {
    throw Vr(r2, e3), r2._readable._storedError;
  }
  const n2 = (function(e3) {
    return !ur(e3);
  })(o2);
  n2 !== r2._backpressure && Gr(r2, true);
}
function Zr(e2, t2) {
  return _(e2._transformAlgorithm(t2), void 0, (t3) => {
    throw Hr(e2._controlledTransformStream, t3), t3;
  });
}
function eo(e2) {
  return new TypeError(`TransformStreamDefaultController.prototype.${e2} can only be used on a TransformStreamDefaultController`);
}
function to(e2) {
  void 0 !== e2._finishPromise_resolve && (e2._finishPromise_resolve(), e2._finishPromise_resolve = void 0, e2._finishPromise_reject = void 0);
}
function ro(e2, t2) {
  void 0 !== e2._finishPromise_reject && (p(e2._finishPromise), e2._finishPromise_reject(t2), e2._finishPromise_resolve = void 0, e2._finishPromise_reject = void 0);
}
function oo(e2) {
  return new TypeError(`TransformStream.prototype.${e2} can only be used on a TransformStream`);
}
Object.defineProperties(TransformStreamDefaultController.prototype, { enqueue: { enumerable: true }, error: { enumerable: true }, terminate: { enumerable: true }, desiredSize: { enumerable: true } }), o(TransformStreamDefaultController.prototype.enqueue, "enqueue"), o(TransformStreamDefaultController.prototype.error, "error"), o(TransformStreamDefaultController.prototype.terminate, "terminate"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(TransformStreamDefaultController.prototype, Symbol.toStringTag, { value: "TransformStreamDefaultController", configurable: true });



/***/ }

}]);