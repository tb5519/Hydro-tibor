!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"d20716eb55585a31549f949f536d330bb1d762d6"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="184e2d44-cf3f-4f6f-9483-e1e3053d965f",e._sentryDebugIdIdentifier="sentry-dbid-184e2d44-cf3f-4f6f-9483-e1e3053d965f");}catch(e){}}();
(self["webpackChunk_hydrooj_ui_default"] = self["webpackChunk_hydrooj_ui_default"] || []).push([["default-api_ts"],{

/***/ "../../framework/utils/lib/common.ts"
/*!*******************************************!*\
  !*** ../../framework/utils/lib/common.ts ***!
  \*******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   camelCase: () => (/* binding */ camelCase),
/* harmony export */   diffArray: () => (/* binding */ diffArray),
/* harmony export */   formatDate: () => (/* binding */ formatDate),
/* harmony export */   formatSeconds: () => (/* binding */ formatSeconds),
/* harmony export */   getAlphabeticId: () => (/* binding */ getAlphabeticId),
/* harmony export */   noop: () => (/* binding */ noop),
/* harmony export */   paramCase: () => (/* binding */ paramCase),
/* harmony export */   parseMemoryMB: () => (/* binding */ parseMemoryMB),
/* harmony export */   parseTimeMS: () => (/* binding */ parseTimeMS),
/* harmony export */   randomPick: () => (/* binding */ randomPick),
/* harmony export */   randomstring: () => (/* binding */ randomstring),
/* harmony export */   size: () => (/* binding */ size),
/* harmony export */   sleep: () => (/* binding */ sleep),
/* harmony export */   snakeCase: () => (/* binding */ snakeCase),
/* harmony export */   sortFiles: () => (/* binding */ sortFiles)
/* harmony export */ });
var _a;
const defaultDict = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
function randomstring(digit = 32, dict = defaultDict) {
  let str = "";
  for (let i = 1; i <= digit; i++) str += dict[Math.floor(Math.random() * dict.length)];
  return str;
}
(_a = String.prototype).format || (_a.format = function formatStr(...args) {
  let result = this;
  if (args.length) {
    if (args.length === 1 && typeof args[0] === "object") {
      const t = args[0];
      for (const key in t) {
        if (!key.startsWith("_") && t[key] !== void 0) {
          const reg = new RegExp(`(\\{${key}\\})`, "g");
          result = result.replace(reg, t[key]);
        }
      }
    } else return this.formatFromArray(args);
  }
  return result;
});
String.prototype.formatFromArray = function formatStr2(args) {
  let result = this;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== void 0) {
      const reg = new RegExp(`(\\{)${i}(\\})`, "g");
      result = result.replace(reg, args[i]);
    }
  }
  return result;
};
String.prototype.rawformat = function rawFormat(object) {
  const res = this.split("{@}");
  return [res[0], object, res[1]].join();
};
function diffArray(a, b) {
  if (a.length !== b.length) return true;
  a.sort();
  b.sort();
  for (const i in a) {
    if (a[i] !== b[i]) return true;
  }
  return false;
}
function formatDate(date, fmt = "%Y-%m-%d %H:%M:%S") {
  let m = (date.getMonth() + 1).toString();
  if (m.length < 2) m = `0${m}`;
  let d = date.getDate().toString();
  if (d.length < 2) d = `0${d}`;
  let H = date.getHours().toString();
  if (H.length < 2) H = `0${H}`;
  let M = date.getMinutes().toString();
  if (M.length < 2) M = `0${M}`;
  let S = date.getSeconds().toString();
  if (S.length < 2) S = `0${S}`;
  return fmt.replace("%Y", date.getFullYear().toString()).replace("%m", m).replace("%d", d).replace("%H", H).replace("%M", M).replace("%S", S);
}
Math.sum = function sum(...args) {
  let s = 0;
  for (const i of args) {
    if (i instanceof Array) {
      for (const j of i) {
        s += j;
      }
    } else s += i;
  }
  return s;
};
Set.isSuperset = function isSuperset(set, subset) {
  for (const elem of subset) {
    if (!set.has(elem)) return false;
  }
  return true;
};
Set.union = function Union(setA, setB) {
  const union = new Set(setA);
  for (const elem of setB) union.add(elem);
  return union;
};
Set.intersection = function Intersection(A = [], B = []) {
  const intersection = /* @__PURE__ */ new Set();
  if (A instanceof Array) A = new Set(A);
  if (B instanceof Array) B = new Set(B);
  for (const elem of B) if (A.has(elem)) intersection.add(elem);
  return intersection;
};
function sleep(timeout) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout, true);
  });
}
function deepen(modifyString) {
  function modifyObject(source) {
    if (typeof source !== "object" || !source) return source;
    if (Array.isArray(source)) return source.map(modifyObject);
    const result = {};
    for (const key in source) {
      result[modifyString(key)] = modifyObject(source[key]);
    }
    return result;
  }
  return function t(source) {
    if (typeof source === "string") return modifyString(source);
    return modifyObject(source);
  };
}
function noop() {
}
const camelCase = deepen((source) => source.replace(/[_-][a-z]/g, (str) => str.slice(1).toUpperCase()));
const paramCase = deepen((source) => source.replace(/_/g, "-").replace(new RegExp("(?<!^)[A-Z]", "g"), (str) => `-${str.toLowerCase()}`));
const snakeCase = deepen((source) => source.replace(/-/g, "_").replace(new RegExp("(?<!^)[A-Z]", "g"), (str) => `_${str.toLowerCase()}`));
const TIME_RE = /^([0-9]+(?:\.[0-9]*)?)([mu]?)s?$/i;
const TIME_UNITS = { "": 1e3, m: 1, u: 1e-3 };
const MEMORY_RE = /^([0-9]+(?:\.[0-9]*)?)([kmg])b?$/i;
const MEMORY_UNITS = { k: 1 / 1024, m: 1, g: 1024 };
function parseTimeMS(str, throwOnError = true) {
  if (typeof str === "number" || Number.isSafeInteger(+str)) return +str;
  const match = TIME_RE.exec(str);
  if (!match && throwOnError) throw new Error(`${str} error parsing time`);
  if (!match) return 1e3;
  return Math.floor(Number.parseFloat(match[1]) * TIME_UNITS[match[2].toLowerCase()]);
}
function parseMemoryMB(str, throwOnError = true) {
  if (typeof str === "number" || Number.isSafeInteger(+str)) return +str;
  const match = MEMORY_RE.exec(str);
  if (!match && throwOnError) throw new Error(`${str} error parsing memory`);
  if (!match) return 256;
  return Math.ceil(Number.parseFloat(match[1]) * MEMORY_UNITS[match[2].toLowerCase()]);
}
function _digit2(number) {
  return number < 10 ? `0${number}` : number.toString();
}
function formatSeconds(_seconds = "0", showSeconds = true) {
  const seconds = +_seconds;
  let res = "{0}:{1}".format(
    showSeconds ? _digit2(Math.floor(seconds / 3600)) : Math.floor(seconds / 3600),
    _digit2(Math.floor(seconds % 3600 / 60))
  );
  if (showSeconds) res += `:${_digit2(seconds % 60)}`;
  return res;
}
function size(s, base = 1) {
  s *= base;
  const unit = 1024;
  const unitNames = ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  for (const unitName of unitNames) {
    if (s < unit) return "{0} {1}".format(Math.round(s * 10) / 10, unitName);
    s /= unit;
  }
  return `${Math.round(s * unit)} ${unitNames.at(-1)}`;
}
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
const fSortR = /\D+|\d+/g;
function sortFiles(files, key = "_id") {
  if (!(files == null ? void 0 : files.length)) return [];
  const isString = typeof files[0] === "string";
  const result = files.map((i) => isString ? { name: i, _weights: i.match(fSortR) } : { ...i, _weights: (i[key] || i.name).match(fSortR) }).sort((a, b) => {
    let pos = 0;
    const weightsA = a._weights;
    const weightsB = b._weights;
    let weightA = weightsA[pos];
    let weightB = weightsB[pos];
    while (weightA && weightB) {
      const v = weightA - weightB;
      if (!Number.isNaN(v) && v !== 0) return v;
      if (weightA !== weightB) return weightA > weightB ? 1 : -1;
      pos += 1;
      weightA = weightsA[pos];
      weightB = weightsB[pos];
    }
    return weightA ? 1 : -1;
  });
  return result.map((x) => isString ? x.name : delete x._weights && x);
}
const getAlphabeticId = (() => {
  const f = (a) => a < 0 ? "" : f(a / 26 - 1) + String.fromCharCode(a % 26 + 65);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const cache = alphabet.split("");
  for (const ch of alphabet) cache.push(...alphabet.split("").map((c) => ch + c));
  return (i) => cache[i] || (i < 0 ? "?" : f(i));
})();


/***/ },

/***/ "../../framework/utils/lib/search.ts"
/*!*******************************************!*\
  !*** ../../framework/utils/lib/search.ts ***!
  \*******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* unused harmony export stringify */
/* harmony import */ var search_query_parser__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! search-query-parser */ "../../node_modules/search-query-parser/index.js");


function stringify(queryObject, options = {}, prefix = "") {
  if (!Object.keys(queryObject || {}).length) return "";
  prefix || (prefix = "");
  const toArray = (val) => typeof val === "string" ? [val] : val;
  const addQuotes = (s) => s.includes(" ") ? JSON.stringify(s) : s;
  const addPrefix = (s) => prefix + s;
  const parts = [];
  if (queryObject.text) {
    const value = toArray(queryObject.text);
    if (value.length) parts.push(value.map(addQuotes).map(addPrefix).join(" "));
  }
  for (const range of options.ranges || []) {
    if (!queryObject[range]) continue;
    let value = queryObject[range].from;
    const to = queryObject[range].to;
    if (to) value = `${value}-${to}`;
    if (value) parts.push(addPrefix(`${range}:${value}`));
  }
  for (const keyword of options.keywords || []) {
    if (!queryObject[keyword]) continue;
    const value = toArray(queryObject[keyword]);
    if (value.length > 0) {
      parts.push(addPrefix(`${keyword}:${addQuotes(value.join(","))}`));
    }
  }
  if (Object.keys(queryObject.exclude || {}).length) {
    parts.push(stringify(queryObject.exclude, options, "-"));
  }
  return parts.join(" ");
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({ stringify, parse: search_query_parser__WEBPACK_IMPORTED_MODULE_0__.parse });


/***/ },

/***/ "../common/status.ts"
/*!***************************!*\
  !*** ../common/status.ts ***!
  \***************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   NORMAL_STATUS: () => (/* binding */ NORMAL_STATUS),
/* harmony export */   STATUS: () => (/* binding */ STATUS),
/* harmony export */   STATUS_TEXTS: () => (/* binding */ STATUS_TEXTS),
/* harmony export */   getScoreColor: () => (/* binding */ getScoreColor)
/* harmony export */ });
/* unused harmony exports STATUS_SHORT_TEXTS, STATUS_CODES, USER_GENDER_MALE, USER_GENDER_FEMALE, USER_GENDER_OTHER, USER_GENDERS, USER_GENDER_RANGE, USER_GENDER_ICONS */
var STATUS = /* @__PURE__ */ ((STATUS2) => {
  STATUS2[STATUS2["STATUS_WAITING"] = 0] = "STATUS_WAITING";
  STATUS2[STATUS2["STATUS_ACCEPTED"] = 1] = "STATUS_ACCEPTED";
  STATUS2[STATUS2["STATUS_WRONG_ANSWER"] = 2] = "STATUS_WRONG_ANSWER";
  STATUS2[STATUS2["STATUS_TIME_LIMIT_EXCEEDED"] = 3] = "STATUS_TIME_LIMIT_EXCEEDED";
  STATUS2[STATUS2["STATUS_MEMORY_LIMIT_EXCEEDED"] = 4] = "STATUS_MEMORY_LIMIT_EXCEEDED";
  STATUS2[STATUS2["STATUS_OUTPUT_LIMIT_EXCEEDED"] = 5] = "STATUS_OUTPUT_LIMIT_EXCEEDED";
  STATUS2[STATUS2["STATUS_RUNTIME_ERROR"] = 6] = "STATUS_RUNTIME_ERROR";
  STATUS2[STATUS2["STATUS_COMPILE_ERROR"] = 7] = "STATUS_COMPILE_ERROR";
  STATUS2[STATUS2["STATUS_SYSTEM_ERROR"] = 8] = "STATUS_SYSTEM_ERROR";
  STATUS2[STATUS2["STATUS_CANCELED"] = 9] = "STATUS_CANCELED";
  STATUS2[STATUS2["STATUS_ETC"] = 10] = "STATUS_ETC";
  STATUS2[STATUS2["STATUS_HACKED"] = 11] = "STATUS_HACKED";
  STATUS2[STATUS2["STATUS_JUDGING"] = 20] = "STATUS_JUDGING";
  STATUS2[STATUS2["STATUS_COMPILING"] = 21] = "STATUS_COMPILING";
  STATUS2[STATUS2["STATUS_FETCHED"] = 22] = "STATUS_FETCHED";
  STATUS2[STATUS2["STATUS_IGNORED"] = 30] = "STATUS_IGNORED";
  STATUS2[STATUS2["STATUS_FORMAT_ERROR"] = 31] = "STATUS_FORMAT_ERROR";
  STATUS2[STATUS2["STATUS_HACK_SUCCESSFUL"] = 32] = "STATUS_HACK_SUCCESSFUL";
  STATUS2[STATUS2["STATUS_HACK_UNSUCCESSFUL"] = 33] = "STATUS_HACK_UNSUCCESSFUL";
  return STATUS2;
})(STATUS || {});
const STATUS_TEXTS = {
  [0 /* STATUS_WAITING */]: "Waiting",
  [1 /* STATUS_ACCEPTED */]: "Accepted",
  [2 /* STATUS_WRONG_ANSWER */]: "Wrong Answer",
  [3 /* STATUS_TIME_LIMIT_EXCEEDED */]: "Time Exceeded",
  [4 /* STATUS_MEMORY_LIMIT_EXCEEDED */]: "Memory Exceeded",
  [5 /* STATUS_OUTPUT_LIMIT_EXCEEDED */]: "Output Exceeded",
  [6 /* STATUS_RUNTIME_ERROR */]: "Runtime Error",
  [7 /* STATUS_COMPILE_ERROR */]: "Compile Error",
  [8 /* STATUS_SYSTEM_ERROR */]: "System Error",
  [9 /* STATUS_CANCELED */]: "Cancelled",
  [10 /* STATUS_ETC */]: "Unknown Error",
  [11 /* STATUS_HACKED */]: "Hacked",
  [20 /* STATUS_JUDGING */]: "Running",
  [21 /* STATUS_COMPILING */]: "Compiling",
  [22 /* STATUS_FETCHED */]: "Fetched",
  [30 /* STATUS_IGNORED */]: "Ignored",
  [31 /* STATUS_FORMAT_ERROR */]: "Format Error",
  [32 /* STATUS_HACK_SUCCESSFUL */]: "Hack Successful",
  [33 /* STATUS_HACK_UNSUCCESSFUL */]: "Hack Unsuccessful"
};
const STATUS_SHORT_TEXTS = {
  [1 /* STATUS_ACCEPTED */]: "AC",
  [2 /* STATUS_WRONG_ANSWER */]: "WA",
  [3 /* STATUS_TIME_LIMIT_EXCEEDED */]: "TLE",
  [4 /* STATUS_MEMORY_LIMIT_EXCEEDED */]: "MLE",
  [5 /* STATUS_OUTPUT_LIMIT_EXCEEDED */]: "OLE",
  [6 /* STATUS_RUNTIME_ERROR */]: "RE",
  [7 /* STATUS_COMPILE_ERROR */]: "CE",
  [8 /* STATUS_SYSTEM_ERROR */]: "SE",
  [9 /* STATUS_CANCELED */]: "IGN",
  [11 /* STATUS_HACKED */]: "HK",
  [30 /* STATUS_IGNORED */]: "IGN",
  [31 /* STATUS_FORMAT_ERROR */]: "FE"
};
const STATUS_CODES = {
  [0 /* STATUS_WAITING */]: "pending",
  [1 /* STATUS_ACCEPTED */]: "pass",
  [2 /* STATUS_WRONG_ANSWER */]: "fail",
  [3 /* STATUS_TIME_LIMIT_EXCEEDED */]: "fail",
  [4 /* STATUS_MEMORY_LIMIT_EXCEEDED */]: "fail",
  [5 /* STATUS_OUTPUT_LIMIT_EXCEEDED */]: "fail",
  [6 /* STATUS_RUNTIME_ERROR */]: "fail",
  [7 /* STATUS_COMPILE_ERROR */]: "fail",
  [8 /* STATUS_SYSTEM_ERROR */]: "fail",
  [9 /* STATUS_CANCELED */]: "ignored",
  [10 /* STATUS_ETC */]: "fail",
  [11 /* STATUS_HACKED */]: "fail",
  [20 /* STATUS_JUDGING */]: "progress",
  [21 /* STATUS_COMPILING */]: "progress",
  [22 /* STATUS_FETCHED */]: "progress",
  [30 /* STATUS_IGNORED */]: "ignored",
  [31 /* STATUS_FORMAT_ERROR */]: "ignored",
  [32 /* STATUS_HACK_SUCCESSFUL */]: "pass",
  [33 /* STATUS_HACK_UNSUCCESSFUL */]: "fail"
};
const NORMAL_STATUS = [
  1 /* STATUS_ACCEPTED */,
  2 /* STATUS_WRONG_ANSWER */,
  3 /* STATUS_TIME_LIMIT_EXCEEDED */,
  4 /* STATUS_MEMORY_LIMIT_EXCEEDED */,
  5 /* STATUS_OUTPUT_LIMIT_EXCEEDED */,
  6 /* STATUS_RUNTIME_ERROR */,
  7 /* STATUS_COMPILE_ERROR */
];
function getScoreColor(score) {
  if (score === null || score === void 0 || !Number.isFinite(+score)) return "#000000";
  return [
    "#ff4f4f",
    "#ff694f",
    "#f8603a",
    "#fc8354",
    "#fa9231",
    "#f7bb3b",
    "#ecdb44",
    "#e2ec52",
    "#b0d628",
    "#93b127",
    "#25ad40"
  ][Math.floor((Number(score) || 0) / 10)];
}
const USER_GENDER_MALE = 0;
const USER_GENDER_FEMALE = 1;
const USER_GENDER_OTHER = 2;
const USER_GENDERS = [USER_GENDER_MALE, USER_GENDER_FEMALE, USER_GENDER_OTHER];
const USER_GENDER_RANGE = {
  [USER_GENDER_MALE]: "Boy \u2642",
  [USER_GENDER_FEMALE]: "Girl \u2640",
  [USER_GENDER_OTHER]: "Other"
};
const USER_GENDER_ICONS = {
  [USER_GENDER_MALE]: "\u2642",
  [USER_GENDER_FEMALE]: "\u2640",
  [USER_GENDER_OTHER]: "?"
};


/***/ },

/***/ "../common/subtask.ts"
/*!****************************!*\
  !*** ../common/subtask.ts ***!
  \****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   normalizeSubtasks: () => (/* binding */ normalizeSubtasks),
/* harmony export */   readSubtasksFromFiles: () => (/* binding */ readSubtasksFromFiles)
/* harmony export */ });
/* unused harmony export convertIniConfig */
/* harmony import */ var _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @hydrooj/utils/lib/common */ "../../framework/utils/lib/common.ts");

function convertIniConfig(ini) {
  var _a;
  const f = ini.split("\n");
  const count = Number.parseInt(f[0], 10);
  const res = { subtasks: [] };
  for (let i = 1; i <= count; i++) {
    if (!((_a = f[i]) == null ? void 0 : _a.trim())) throw new Error("Testdata count incorrect.");
    const [input, output, time, score, memory] = f[i].split("|");
    const cur = {
      cases: [{ input, output }],
      score: Number.parseInt(score, 10),
      time: `${time}s`,
      memory: "256m"
    };
    if (!Number.isNaN(Number.parseInt(memory, 10))) cur.memory = `${Math.floor(Number.parseInt(memory, 10) / 1024)}m`;
    res.subtasks.push(cur);
  }
  return res;
}
const SubtaskMatcher = [
  {
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    regex: /^(([\w.-]*?)(?:(\d*)[-_])?(\d+))\.(in|IN|txt|TXT|in\.txt|IN\.TXT)$/,
    output: (a) => ["out", "ans"].flatMap((i) => [i, i.toUpperCase(), `${i}.txt`, `${i.toUpperCase()}.TXT`]).flatMap((i) => [`${a[1]}.${i}`, `${a[1]}.${i}`.replace(/input/g, "output").replace(/INPUT/g, "OUTPUT")]).concat(a[1].includes("input") ? `${a[1]}.txt`.replace(/input/g, "output") : null),
    id: (a) => +a[4],
    subtask: (a) => +(a[3] || 1),
    preferredScorerType: (a) => a[3] ? "min" : "sum"
  },
  {
    regex: /^(\D*)\.(in|IN)(\d+)$/,
    output: (a) => [
      `${a[1]}.${a[2] === "in" ? "ou" : "OU"}${a[3]}`,
      `${a[1]}.${a[2] === "in" ? "out" : "OUT"}${a[3]}`
    ].flatMap((i) => [i, i.replace(/input/g, "output").replace(/INPUT/g, "OUTPUT")]),
    id: (a) => +a[2],
    subtask: () => 1,
    preferredScorerType: () => "sum"
  },
  {
    regex: /^(\D*)([0-9]+)([-_])([0-9]+)\.(in|IN)$/,
    output: (a) => ["out", "ans", "OUT", "ANS"].flatMap((i) => `${a[1]}${a[2]}${a[3]}${a[4]}.${i}`),
    id: (a) => +a[4],
    subtask: (a) => +a[2],
    preferredScorerType: () => "min"
  },
  {
    regex: /^(([0-9]+)[-_].*)\.(in|IN)$/,
    output: (a) => ["out", "ans", "OUT", "ANS"].flatMap((i) => `${a[1]}.${i}`),
    id: (a) => +a[2],
    subtask: () => 1,
    preferredScorerType: () => "sum"
  }
];
function* getScore(totalScore, count) {
  const base = Math.floor(totalScore / count);
  const extra = count - totalScore % count;
  for (let i = 0; i < count; i++) {
    if (i >= extra) yield base + 1;
    else yield base;
  }
}
function readSubtasksFromFiles(files, config) {
  const subtask = {};
  for (const s of config.subtasks || []) if (s.id && Number.isSafeInteger(s.id)) subtask[s.id] = s;
  for (const file of files) {
    let match = false;
    for (const rule of SubtaskMatcher) {
      const data = rule.regex.exec(file);
      if (!data) continue;
      const sid = rule.subtask(data);
      const c = { input: file, output: "", id: rule.id(data) };
      const type = rule.preferredScorerType(data);
      const outputs = (config.noOutputFile ? ["/dev/null"] : rule.output(data)).filter((i) => i);
      for (const output of outputs) {
        if (output === file) continue;
        if (output === "/dev/null" || files.includes(output)) {
          match = true;
          c.output = output;
          if (!subtask[sid]) {
            subtask[sid] = {
              time: config.time,
              memory: config.memory,
              type,
              cases: [c],
              id: sid
            };
          } else if (!subtask[sid].cases) subtask[sid].cases = [c];
          else if (!subtask[sid].cases.find((i) => i.input === c.input && i.output === c.output)) {
            subtask[sid].cases.push(c);
          }
          break;
        }
      }
      if (match) break;
    }
  }
  for (const id in subtask) subtask[id].cases = (0,_hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_0__.sortFiles)(subtask[id].cases, "input");
  return Object.values(subtask);
}
function normalizeSubtasks(subtasks, checkFile, time = "1000ms", memory = "256m", ignoreParseError = false, timeRate = 1, memoryRate = 1) {
  subtasks.sort((a, b) => a.id - b.id);
  const subtaskScore = getScore(
    Math.max(100 - Math.sum(subtasks.map((i) => i.score || 0)), 0),
    subtasks.filter((i) => !i.score).length
  );
  return subtasks.map((s, id) => {
    s.cases.sort((a, b) => a.id - b.id);
    const score = s.score || subtaskScore.next().value;
    const caseScore = getScore(
      Math.max(score - Math.sum(s.cases.map((i) => i.score || 0)), 0),
      s.cases.filter((i) => !i.score).length
    );
    return {
      id: id + 1,
      type: "min",
      if: [],
      ...s,
      score,
      time: (0,_hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_0__.parseTimeMS)(s.time || time, !ignoreParseError) * timeRate,
      memory: (0,_hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_0__.parseMemoryMB)(s.memory || memory, !ignoreParseError) * memoryRate,
      cases: s.cases.map((c, index) => ({
        id: index + 1,
        ...c,
        score: c.score || (s.type === "sum" ? caseScore.next().value : score),
        time: (0,_hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_0__.parseTimeMS)(c.time || s.time || time, !ignoreParseError) * timeRate,
        memory: (0,_hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_0__.parseMemoryMB)(c.memory || s.memory || memory, !ignoreParseError) * memoryRate,
        input: c.input ? checkFile(c.input, "Cannot find input file {0}.") : "/dev/null",
        output: c.output ? checkFile(c.output, "Cannot find output file {0}.") : "/dev/null"
      }))
    };
  });
}


/***/ },

/***/ "../components/frontend/Icon.tsx"
/*!***************************************!*\
  !*** ../components/frontend/Icon.tsx ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ IconComponent)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var classnames__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! classnames */ "../../node_modules/classnames/index.js");
/* harmony import */ var classnames__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(classnames__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! prop-types */ "../../node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_2__);



function IconComponent(props) {
  const {
    name,
    className,
    ...rest
  } = props;
  const cn = classnames__WEBPACK_IMPORTED_MODULE_1___default()(className, `icon icon-${name}`);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { ...rest, className: cn });
}
IconComponent.propTypes = {
  name: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string).isRequired,
  className: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string)
};


/***/ },

/***/ "../components/frontend/autocomplete/AutoComplete.tsx"
/*!************************************************************!*\
  !*** ../components/frontend/autocomplete/AutoComplete.tsx ***!
  \************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _autocomplete_scss__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./autocomplete.scss */ "../components/frontend/autocomplete/autocomplete.scss");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var react_dnd__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react-dnd */ "../../node_modules/react-dnd/dist/hooks/useDrag/useDrag.js");
/* harmony import */ var react_dnd__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react-dnd */ "../../node_modules/react-dnd/dist/hooks/useDrop/useDrop.js");
/* harmony import */ var react_dnd__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react-dnd */ "../../node_modules/react-dnd/dist/core/DndProvider.js");
/* harmony import */ var react_dnd_html5_backend__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react-dnd-html5-backend */ "../../node_modules/react-dnd-html5-backend/dist/index.js");
/* harmony import */ var _Icon__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../Icon */ "../components/frontend/Icon.tsx");







const superCache = {};
function DraggableSelection({
  type,
  id,
  move,
  children,
  ...props
}) {
  const ref = (0,react__WEBPACK_IMPORTED_MODULE_3__.useRef)(null);
  const [isDragging, drag] = (0,react_dnd__WEBPACK_IMPORTED_MODULE_4__.useDrag)(() => ({
    type,
    item: { id },
    collect: (m) => m.isDragging()
  }));
  const [, drop] = (0,react_dnd__WEBPACK_IMPORTED_MODULE_5__.useDrop)({
    accept: type,
    hover: (item) => {
      if (!ref.current) return;
      move(item.id, id);
    }
  });
  drag(drop(ref));
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { ref, ...props, style: { opacity: isDragging ? 0.2 : 1 }, children });
}
const AutoComplete = (0,react__WEBPACK_IMPORTED_MODULE_3__.forwardRef)(function Impl(props, ref) {
  var _a, _b, _c, _d, _e, _f, _g;
  const {
    multi = false,
    width = "100%",
    height = "auto",
    freeSolo = false,
    allowEmptyQuery = false,
    listStyle = {},
    disabled = false,
    disabledHint = "",
    draggable = multi
  } = props;
  const queryItems = (_a = props.queryItems) != null ? _a : (() => []);
  const renderItem = (_b = props.renderItem) != null ? _b : ((item) => item);
  const itemText = (_c = props.itemText) != null ? _c : ((item) => item.toString());
  const itemKey = (_d = props.itemKey) != null ? _d : itemText;
  const onChange = (_e = props.onChange) != null ? _e : (() => {
  });
  const freeSoloConverter = freeSolo ? (_f = props.freeSoloConverter) != null ? _f : ((i) => i) : (i) => i;
  const [focused, setFocused] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(false);
  const [selectedKeys, setSelectedKeys] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(props.selectedKeys || []);
  const [itemList, setItemList] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)([]);
  const [currentItem, setCurrentItem] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(null);
  const [rerender, setRerender] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(false);
  const [draggableId] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(() => (0,lodash__WEBPACK_IMPORTED_MODULE_2__.uniqueId)());
  const inputRef = (0,react__WEBPACK_IMPORTED_MODULE_3__.useRef)(null);
  const listRef = (0,react__WEBPACK_IMPORTED_MODULE_3__.useRef)(null);
  let [queryCache, valueCache] = [(0,react__WEBPACK_IMPORTED_MODULE_3__.useRef)({}).current, (0,react__WEBPACK_IMPORTED_MODULE_3__.useRef)({}).current];
  if (props.cacheKey) {
    superCache[_g = props.cacheKey] || (superCache[_g] = { query: {}, value: {} });
    queryCache = superCache[props.cacheKey].query;
    valueCache = superCache[props.cacheKey].value;
  }
  const queryList = async (query) => {
    if (!query && !allowEmptyQuery) {
      setItemList([]);
      setCurrentItem(null);
      return;
    }
    try {
      queryCache[query] || (queryCache[query] = await queryItems(query));
      for (const item of queryCache[query]) valueCache[itemKey(item)] = item;
      setItemList(queryCache[query]);
      setCurrentItem(!freeSolo && queryCache[query].length ? 0 : null);
    } catch (e) {
      console.error("Failed to query items", e);
      setItemList([]);
      setCurrentItem(null);
    }
  };
  (0,react__WEBPACK_IMPORTED_MODULE_3__.useEffect)(() => {
    setSelectedKeys(props.selectedKeys || []);
  }, [JSON.stringify(props.selectedKeys)]);
  const dispatchChange = () => {
    var _a2;
    if (!multi) onChange((_a2 = inputRef.current) == null ? void 0 : _a2.value);
    else onChange(selectedKeys.filter((v) => v == null ? void 0 : v.trim().length).join(","));
  };
  (0,react__WEBPACK_IMPORTED_MODULE_3__.useEffect)(() => {
    dispatchChange();
    if (!multi) return;
    const ids = [];
    for (const key of selectedKeys) if (!valueCache[key]) ids.push(key);
    if (!ids.length) return;
    Promise.resolve(props.fetchItems(ids)).then((items) => {
      for (const item of items) valueCache[itemKey(item)] = item;
      setRerender(!rerender);
    }).catch((e) => {
      console.error("Failed to fetch items", e);
    });
  }, [selectedKeys, multi]);
  const handleInputChange = (0,lodash__WEBPACK_IMPORTED_MODULE_2__.debounce)((e) => queryList(e ? e.target.value : ""), 300);
  const toggleItem = (item, key = itemKey(item), preserve = false) => {
    const shouldKeepOpen = multi && allowEmptyQuery && inputRef.current.value === "";
    if (multi) {
      const idx = selectedKeys.indexOf(key);
      if (idx !== -1) {
        setSelectedKeys((s) => {
          const newSelectedKeys = [...s];
          newSelectedKeys.splice(idx, 1);
          return newSelectedKeys;
        });
      } else {
        setSelectedKeys((s) => [...s, key]);
      }
      if (!preserve) inputRef.current.value = "";
      inputRef.current.focus();
    } else {
      setSelectedKeys([key]);
      inputRef.current.value = key;
    }
    if (!shouldKeepOpen) {
      setItemList([]);
      setCurrentItem(null);
    }
  };
  const handleInputKeyDown = (e) => {
    const { key, target } = e;
    if (key === "Escape") {
      setItemList([]);
      setCurrentItem(null);
      return;
    }
    if (key === "Enter" || key === ",") {
      e.preventDefault();
      if (currentItem !== null) {
        toggleItem(itemList[currentItem]);
        return;
      }
      if (freeSolo && target.value !== "") {
        toggleItem(freeSoloConverter(target.value));
      }
      return;
    }
    if (key === "Backspace") {
      if (target.value.length) return;
      if (selectedKeys.length) {
        setSelectedKeys((s) => s.slice(0, -1));
      }
      return;
    }
    if (key === "ArrowUp") {
      e.preventDefault();
      if (itemList.length === 0) return;
      const idx = (currentItem != null ? currentItem : 0) - 1;
      const newIdx = idx < 0 ? itemList.length - 1 : idx;
      setCurrentItem(newIdx);
      listRef.current.children[newIdx].scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    if (key === "ArrowDown") {
      e.preventDefault();
      if (itemList.length === 0) return;
      const idx = (currentItem != null ? currentItem : itemList.length - 1) + 1;
      const newIdx = idx >= itemList.length ? 0 : idx;
      setCurrentItem(newIdx);
      listRef.current.children[newIdx].scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
  };
  (0,react__WEBPACK_IMPORTED_MODULE_3__.useImperativeHandle)(ref, () => ({
    getSelectedItems: () => selectedKeys.map((key) => valueCache[key]),
    getSelectedItemKeys: () => {
      var _a2;
      return [...selectedKeys, (_a2 = inputRef.current) == null ? void 0 : _a2.value].filter((v) => v == null ? void 0 : v.trim().length);
    },
    setSelectedItems: (items) => {
      setSelectedKeys(items.map((i) => itemKey(i)));
      if (!multi && inputRef.current) inputRef.current.value = items.map((i) => itemKey(i)).join(",");
    },
    setSelectedKeys,
    getQuery: () => {
      var _a2;
      return (_a2 = inputRef.current) == null ? void 0 : _a2.value;
    },
    setQuery: (query) => {
      if (inputRef.current) inputRef.current.value = query;
    },
    triggerQuery: () => {
      var _a2;
      return queryList((_a2 = inputRef.current) == null ? void 0 : _a2.value);
    },
    closeList: () => {
      setItemList([]);
      setCurrentItem(null);
    },
    getValue: () => {
      var _a2;
      return multi ? selectedKeys.join(",") : (_a2 = inputRef.current.value) != null ? _a2 : "";
    },
    clear: () => {
      setSelectedKeys([]);
      if (inputRef.current) inputRef.current.value = "";
    },
    focus: () => {
      var _a2;
      setFocused(true);
      (_a2 = inputRef.current) == null ? void 0 : _a2.focus();
    }
  }), [selectedKeys, inputRef, multi]);
  const move = (dragId, hoverId) => {
    if (dragId === hoverId || !draggable) return;
    const dragIndex = selectedKeys.indexOf(dragId);
    const hoverIndex = selectedKeys.indexOf(hoverId);
    setSelectedKeys((s) => {
      const a = [...s];
      a.splice(dragIndex, 1);
      a.splice(hoverIndex, 0, s[dragIndex]);
      return a;
    });
  };
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "autocomplete-container", style: { display: "inline-block", width: "100%", marginBottom: "1rem" }, children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      "div",
      {
        className: focused ? "autocomplete-wrapper focused" : "autocomplete-wrapper",
        style: { width, height },
        children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_dnd__WEBPACK_IMPORTED_MODULE_6__.DndProvider, { backend: react_dnd_html5_backend__WEBPACK_IMPORTED_MODULE_7__.HTML5Backend, context: window, children: [
          multi && selectedKeys.map((key) => {
            const item = valueCache[key];
            return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(DraggableSelection, { type: draggableId, id: key, move, className: "autocomplete-tag", children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { children: item ? itemText(item) : key }),
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_Icon__WEBPACK_IMPORTED_MODULE_8__["default"], { name: "close", onClick: () => toggleItem(item, key, true) })
            ] }, item ? key : `draft-${key}`);
          }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "input",
            {
              ref: inputRef,
              autoComplete: "off",
              hidden: disabled,
              onChange: (e) => {
                dispatchChange();
                handleInputChange(e);
              },
              onFocus: () => {
                if (allowEmptyQuery) handleInputChange();
                setFocused(true);
              },
              onPaste: async (e) => {
                if (!multi) return;
                const text = e.clipboardData.getData("text");
                if (!text || !text.includes(",") && !text.includes("\uFF0C")) return;
                e.preventDefault();
                const ids = text.replace(/，/g, ",").split(",").filter((v) => (v == null ? void 0 : v.trim().length) && !selectedKeys.includes(v));
                if (!ids.length) return;
                try {
                  const fetched = await props.fetchItems(ids);
                  for (const item of fetched) valueCache[itemKey(item)] = item;
                  setSelectedKeys([...selectedKeys, ...fetched.map((val) => itemKey(val))]);
                } catch (err) {
                  console.error("Failed to fetch items on paste", err);
                }
              },
              placeholder: props.placeholder,
              onBlur: () => setFocused(false),
              onKeyDown: handleInputKeyDown,
              defaultValue: multi ? "" : selectedKeys.join(",")
            }
          )
        ] })
      }
    ),
    disabled && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      "input",
      {
        disabled: true,
        autoComplete: "off",
        value: disabledHint
      }
    ),
    focused && itemList.length > 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("ul", { ref: listRef, className: "autocomplete-list", style: listStyle, onMouseDown: (e) => e.preventDefault(), children: itemList.map((item, idx) => {
      const inner = renderItem(item);
      if (!inner) return null;
      return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
        "li",
        {
          onClick: () => toggleItem(item),
          onMouseMove: () => setCurrentItem(idx),
          "data-selected": selectedKeys.includes(itemKey(item)),
          "data-focus": idx === currentItem,
          children: [
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { children: inner }),
            selectedKeys.includes(itemKey(item)) && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_Icon__WEBPACK_IMPORTED_MODULE_8__["default"], { name: "check" })
          ]
        },
        itemKey(item)
      );
    }) })
  ] });
});
AutoComplete.displayName = "AutoComplete";
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (AutoComplete);


/***/ },

/***/ "../components/frontend/autocomplete/CustomSelectAutoComplete.tsx"
/*!************************************************************************!*\
  !*** ../components/frontend/autocomplete/CustomSelectAutoComplete.tsx ***!
  \************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! prop-types */ "../../node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _AutoComplete__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./AutoComplete */ "../components/frontend/autocomplete/AutoComplete.tsx");





const CustomSelectAutoComplete = react__WEBPACK_IMPORTED_MODULE_3___default().forwardRef((props, ref) => {
  const def = (0,lodash__WEBPACK_IMPORTED_MODULE_1__.defaults)(props, {
    width: "100%",
    height: "auto",
    listStyle: {},
    multi: false,
    selectedKeys: [],
    freeSolo: false,
    freeSoloConverter: (input) => input
  });
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
    _AutoComplete__WEBPACK_IMPORTED_MODULE_4__["default"],
    {
      ref,
      fetchItems: (keys) => def.data.filter((i) => i._id ? keys.includes(i._id) : keys.includes(i)),
      queryItems: (query) => def.data.filter((i) => (i.name || i).toString().toLowerCase().includes(query.toLowerCase())),
      itemText: (item) => `${item.name || item}`,
      itemKey: (item) => {
        var _a;
        return `${((_a = item._id) == null ? void 0 : _a.toString()) || item.name || item}`;
      },
      renderItem: (item) => `${item.name || item}`,
      allowEmptyQuery: true,
      ...def
    }
  );
});
CustomSelectAutoComplete.propTypes = {
  width: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  height: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  listStyle: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().object),
  onChange: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func).isRequired,
  multi: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  selectedKeys: prop_types__WEBPACK_IMPORTED_MODULE_2___default().arrayOf((prop_types__WEBPACK_IMPORTED_MODULE_2___default().string)),
  allowEmptyQuery: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSolo: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSoloConverter: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func),
  data: prop_types__WEBPACK_IMPORTED_MODULE_2___default().arrayOf((prop_types__WEBPACK_IMPORTED_MODULE_2___default().any))
};
CustomSelectAutoComplete.displayName = "CustomSelectAutoComplete";
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (CustomSelectAutoComplete);


/***/ },

/***/ "./api.ts"
/*!****************!*\
  !*** ./api.ts ***!
  \****************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   $: () => (/* reexport default from dynamic */ jquery__WEBPACK_IMPORTED_MODULE_15___default.a),
/* harmony export */   ActionDialog: () => (/* reexport safe */ _components_dialog__WEBPACK_IMPORTED_MODULE_0__.ActionDialog),
/* harmony export */   AnsiUp: () => (/* reexport safe */ ansi_up__WEBPACK_IMPORTED_MODULE_14__.AnsiUp),
/* harmony export */   AssignSelectAutoComplete: () => (/* reexport safe */ _components_autocomplete_AssignSelectAutoComplete__WEBPACK_IMPORTED_MODULE_23__["default"]),
/* harmony export */   AutoComplete: () => (/* reexport safe */ _components_autocomplete__WEBPACK_IMPORTED_MODULE_22__["default"]),
/* harmony export */   AutoloadPage: () => (/* reexport safe */ _misc_Page__WEBPACK_IMPORTED_MODULE_11__.AutoloadPage),
/* harmony export */   ConfirmDialog: () => (/* reexport safe */ _components_dialog__WEBPACK_IMPORTED_MODULE_0__.ConfirmDialog),
/* harmony export */   Context: () => (/* reexport safe */ _context__WEBPACK_IMPORTED_MODULE_8__.Context),
/* harmony export */   CustomSelectAutoComplete: () => (/* reexport safe */ _components_autocomplete_CustomSelectAutoComplete__WEBPACK_IMPORTED_MODULE_24__["default"]),
/* harmony export */   Dialog: () => (/* reexport safe */ _components_dialog__WEBPACK_IMPORTED_MODULE_0__.Dialog),
/* harmony export */   DomainSelectAutoComplete: () => (/* reexport safe */ _components_autocomplete_DomainSelectAutoComplete__WEBPACK_IMPORTED_MODULE_25__["default"]),
/* harmony export */   InfoDialog: () => (/* reexport safe */ _components_dialog__WEBPACK_IMPORTED_MODULE_0__.InfoDialog),
/* harmony export */   NamedPage: () => (/* reexport safe */ _misc_Page__WEBPACK_IMPORTED_MODULE_11__.NamedPage),
/* harmony export */   Notification: () => (/* reexport safe */ _components_notification__WEBPACK_IMPORTED_MODULE_2__["default"]),
/* harmony export */   Page: () => (/* reexport safe */ _misc_Page__WEBPACK_IMPORTED_MODULE_11__.Page),
/* harmony export */   ProblemSelectAutoComplete: () => (/* reexport safe */ _components_autocomplete_ProblemSelectAutoComplete__WEBPACK_IMPORTED_MODULE_26__["default"]),
/* harmony export */   React: () => (/* reexport default from dynamic */ react__WEBPACK_IMPORTED_MODULE_17___default.a),
/* harmony export */   ReactDOM: () => (/* binding */ ReactDOM),
/* harmony export */   Rotator: () => (/* reexport safe */ _components_rotator__WEBPACK_IMPORTED_MODULE_3__["default"]),
/* harmony export */   Service: () => (/* reexport safe */ _context__WEBPACK_IMPORTED_MODULE_8__.Service),
/* harmony export */   Socket: () => (/* reexport safe */ _components_socket_index__WEBPACK_IMPORTED_MODULE_5__["default"]),
/* harmony export */   UserSelectAutoComplete: () => (/* reexport safe */ _components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_27__["default"]),
/* harmony export */   _: () => (/* reexport default from dynamic */ lodash__WEBPACK_IMPORTED_MODULE_16___default.a),
/* harmony export */   addPage: () => (/* binding */ addPage),
/* harmony export */   addSpeculationRules: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.addSpeculationRules),
/* harmony export */   alert: () => (/* reexport safe */ _components_dialog__WEBPACK_IMPORTED_MODULE_0__.alert),
/* harmony export */   api: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.api),
/* harmony export */   base64: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.base64),
/* harmony export */   camelCase: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.camelCase),
/* harmony export */   confirm: () => (/* reexport safe */ _components_dialog__WEBPACK_IMPORTED_MODULE_0__.confirm),
/* harmony export */   createZipBlob: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.createZipBlob),
/* harmony export */   createZipStream: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.createZipStream),
/* harmony export */   ctx: () => (/* reexport safe */ _context__WEBPACK_IMPORTED_MODULE_8__.ctx),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   delay: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.delay),
/* harmony export */   diffArray: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.diffArray),
/* harmony export */   download: () => (/* reexport safe */ _components_zipDownloader__WEBPACK_IMPORTED_MODULE_7__["default"]),
/* harmony export */   downloadProblemSet: () => (/* reexport safe */ _components_zipDownloader__WEBPACK_IMPORTED_MODULE_7__.downloadProblemSet),
/* harmony export */   emulateAnchorClick: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.emulateAnchorClick),
/* harmony export */   formatDate: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.formatDate),
/* harmony export */   formatSeconds: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.formatSeconds),
/* harmony export */   getAlphabeticId: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.getAlphabeticId),
/* harmony export */   getAvailableLangs: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.getAvailableLangs),
/* harmony export */   getFeatures: () => (/* reexport safe */ _lazyload__WEBPACK_IMPORTED_MODULE_10__.getFeatures),
/* harmony export */   getTheme: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.getTheme),
/* harmony export */   i18n: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.i18n),
/* harmony export */   initPageLoader: () => (/* reexport safe */ _hydro__WEBPACK_IMPORTED_MODULE_9__.initPageLoader),
/* harmony export */   jsxRuntime: () => (/* reexport default export from named module */ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_19__),
/* harmony export */   load: () => (/* reexport safe */ _lazyload__WEBPACK_IMPORTED_MODULE_10__.load),
/* harmony export */   loadFeatures: () => (/* reexport safe */ _lazyload__WEBPACK_IMPORTED_MODULE_10__.loadFeatures),
/* harmony export */   loadMonaco: () => (/* reexport safe */ _components_monaco_loader__WEBPACK_IMPORTED_MODULE_1__["default"]),
/* harmony export */   loadReactRedux: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.loadReactRedux),
/* harmony export */   loaded: () => (/* reexport safe */ _lazyload__WEBPACK_IMPORTED_MODULE_10__.loaded),
/* harmony export */   mediaQuery: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.mediaQuery),
/* harmony export */   mongoId: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.mongoId),
/* harmony export */   noop: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.noop),
/* harmony export */   paramCase: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.paramCase),
/* harmony export */   parseMemoryMB: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.parseMemoryMB),
/* harmony export */   parseTimeMS: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.parseTimeMS),
/* harmony export */   pipeStream: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.pipeStream),
/* harmony export */   pjax: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.pjax),
/* harmony export */   prompt: () => (/* reexport safe */ _components_dialog__WEBPACK_IMPORTED_MODULE_0__.prompt),
/* harmony export */   provideFeature: () => (/* reexport safe */ _lazyload__WEBPACK_IMPORTED_MODULE_10__.provideFeature),
/* harmony export */   randomPick: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.randomPick),
/* harmony export */   randomstring: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.randomstring),
/* harmony export */   rawHtml: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.rawHtml),
/* harmony export */   redux: () => (/* reexport module object */ react_redux__WEBPACK_IMPORTED_MODULE_18__),
/* harmony export */   request: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.request),
/* harmony export */   secureRandomString: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.secureRandomString),
/* harmony export */   selectUser: () => (/* reexport safe */ _components_selectUser__WEBPACK_IMPORTED_MODULE_4__["default"]),
/* harmony export */   setTemporaryViewTransitionNames: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.setTemporaryViewTransitionNames),
/* harmony export */   size: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.size),
/* harmony export */   sleep: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.sleep),
/* harmony export */   slideDown: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.slideDown),
/* harmony export */   slideUp: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.slideUp),
/* harmony export */   snakeCase: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.snakeCase),
/* harmony export */   sortFiles: () => (/* reexport safe */ _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__.sortFiles),
/* harmony export */   substitute: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.substitute),
/* harmony export */   tpl: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.tpl),
/* harmony export */   uploadFiles: () => (/* reexport safe */ _components_upload__WEBPACK_IMPORTED_MODULE_6__["default"]),
/* harmony export */   withTransitionCallback: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.withTransitionCallback),
/* harmony export */   zIndexManager: () => (/* reexport safe */ _utils__WEBPACK_IMPORTED_MODULE_12__.zIndexManager)
/* harmony export */ });
/* harmony import */ var _components_dialog__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var _components_monaco_loader__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./components/monaco/loader */ "./components/monaco/loader.ts");
/* harmony import */ var _components_notification__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./components/notification */ "./components/notification/index.ts");
/* harmony import */ var _components_rotator__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./components/rotator */ "./components/rotator/index.js");
/* harmony import */ var _components_selectUser__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./components/selectUser */ "./components/selectUser.tsx");
/* harmony import */ var _components_socket_index__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./components/socket/index */ "./components/socket/index.ts");
/* harmony import */ var _components_upload__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./components/upload */ "./components/upload.tsx");
/* harmony import */ var _components_zipDownloader__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./components/zipDownloader */ "./components/zipDownloader/index.ts");
/* harmony import */ var _context__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./context */ "./context.ts");
/* harmony import */ var _hydro__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./hydro */ "./hydro.ts");
/* harmony import */ var _lazyload__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./lazyload */ "./lazyload.ts");
/* harmony import */ var _misc_Page__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./misc/Page */ "./misc/Page.ts");
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./utils */ "./utils/index.ts");
/* harmony import */ var _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! @hydrooj/utils/lib/common */ "../../framework/utils/lib/common.ts");
/* harmony import */ var ansi_up__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! ansi_up */ "../../node_modules/ansi_up/ansi_up.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_15__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_15___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_15__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_16__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_16___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_16__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_17__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_17___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_17__);
/* harmony import */ var react_redux__WEBPACK_IMPORTED_MODULE_18__ = __webpack_require__(/*! react-redux */ "../../node_modules/react-redux/dist/react-redux.mjs");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_19__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var react_dom__WEBPACK_IMPORTED_MODULE_20__ = __webpack_require__(/*! react-dom */ "../../node_modules/react-dom/index.js");
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_21__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var _components_autocomplete__WEBPACK_IMPORTED_MODULE_22__ = __webpack_require__(/*! ./components/autocomplete */ "./components/autocomplete/index.tsx");
/* harmony import */ var _components_autocomplete_AssignSelectAutoComplete__WEBPACK_IMPORTED_MODULE_23__ = __webpack_require__(/*! ./components/autocomplete/AssignSelectAutoComplete */ "./components/autocomplete/AssignSelectAutoComplete.tsx");
/* harmony import */ var _components_autocomplete_CustomSelectAutoComplete__WEBPACK_IMPORTED_MODULE_24__ = __webpack_require__(/*! ./components/autocomplete/CustomSelectAutoComplete */ "./components/autocomplete/CustomSelectAutoComplete.tsx");
/* harmony import */ var _components_autocomplete_DomainSelectAutoComplete__WEBPACK_IMPORTED_MODULE_25__ = __webpack_require__(/*! ./components/autocomplete/DomainSelectAutoComplete */ "./components/autocomplete/DomainSelectAutoComplete.tsx");
/* harmony import */ var _components_autocomplete_ProblemSelectAutoComplete__WEBPACK_IMPORTED_MODULE_26__ = __webpack_require__(/*! ./components/autocomplete/ProblemSelectAutoComplete */ "./components/autocomplete/ProblemSelectAutoComplete.tsx");
/* harmony import */ var _components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_27__ = __webpack_require__(/*! ./components/autocomplete/UserSelectAutoComplete */ "./components/autocomplete/UserSelectAutoComplete.tsx");

























Object.assign(react_dom__WEBPACK_IMPORTED_MODULE_20__, react_dom_client__WEBPACK_IMPORTED_MODULE_21__);
const ReactDOM = react_dom__WEBPACK_IMPORTED_MODULE_20__;
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (_lazyload__WEBPACK_IMPORTED_MODULE_10__.load);







function addPage(page) {
  window.Hydro.extraPages.push(page);
}

Object.assign(window, { $: (jquery__WEBPACK_IMPORTED_MODULE_15___default()), jQuery: (jquery__WEBPACK_IMPORTED_MODULE_15___default()) });


/***/ },

/***/ "./components/DOMAttachedObject.ts"
/*!*****************************************!*\
  !*** ./components/DOMAttachedObject.ts ***!
  \*****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ DOMAttachedObject)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

let removalChecker = null;
const res = [];
function checkResources() {
  for (let i = res.length - 1; i >= 0; --i) {
    if (res[i].detached || !document.body.contains(res[i].$dom[0])) {
      if (!res[i].detached) res[i].detach();
      res.splice(i, 1);
    }
  }
  if (res.length === 0) {
    clearInterval(removalChecker);
    removalChecker = null;
  }
}
function monitorResource(resource) {
  res.push(resource);
  if (removalChecker === null) {
    removalChecker = setInterval(checkResources, 500);
  }
}
const _DOMAttachedObject = class _DOMAttachedObject {
  constructor($dom, monitorDetach = false) {
    // FIXME should be JQuery<HTMLElement>, but typings for $.transition() wasn't found
    __publicField(this, "$dom");
    __publicField(this, "id");
    __publicField(this, "detached");
    __publicField(this, "eventNS");
    if ($dom == null) return null;
    this.$dom = $dom;
    this.id = ++_DOMAttachedObject.uniqueIdCounter;
    this.eventNS = `vj4obj_${this.id}`;
    this.detached = false;
    if (monitorDetach) monitorResource(this);
  }
  static get($obj) {
    const key = this.DOMAttachKey;
    return $obj.data(key);
  }
  static getOrConstruct($obj, ...args) {
    const $singleObj = $obj.eq(0);
    const key = this.DOMAttachKey;
    const Protoclass = this;
    const instance = this.get($singleObj);
    if (instance !== void 0) return instance;
    const newInstance = new Protoclass($singleObj, ...args);
    if (!newInstance.$dom) return null;
    newInstance.$dom.data(key, newInstance);
    return newInstance;
  }
  static attachAll(container = document.body, ...args) {
    if (true) {
      if (!this.DOMAttachSelector) {
        throw new Error("'DOMAttachSelector' should be specified");
      }
    }
    if (true) {
      console.time(`DOMAttachedObject[${this.DOMAttachKey}]: attachAll`);
    }
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(container).find(this.DOMAttachSelector).addBack(this.DOMAttachSelector).get().forEach((element) => this.getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()(element), ...args));
    if (true) {
      console.timeEnd(`DOMAttachedObject[${this.DOMAttachKey}]: attachAll`);
    }
  }
  static detachAll(container = document.body) {
    const selector = this.DOMDetachSelector || this.DOMAttachSelector;
    if (true) {
      if (!selector) {
        throw new Error("'DOMDetachSelector' or 'DOMAttachSelector' should be specified");
      }
    }
    if (true) {
      console.time(`DOMAttachedObject[${this.DOMAttachKey}]: detachAll`);
    }
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(container).find(selector).addBack(selector).get().forEach((element) => {
      const instance = this.get(jquery__WEBPACK_IMPORTED_MODULE_0___default()(element));
      if (instance) {
        instance.detach();
      }
    });
    if (true) {
      console.timeEnd(`DOMAttachedObject[${this.DOMAttachKey}]: detachAll`);
    }
  }
  static registerLifeCycleHooks(attach = true) {
    if (true) {
      if (!this.DOMAttachSelector) {
        throw new Error("'DOMAttachSelector' should be specified");
      }
    }
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjContentNew", (e) => this.attachAll(e.target));
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjContentRemove", (e) => this.detachAll(e.target));
    if (attach) {
      this.attachAll();
    }
  }
  detach() {
    if (this.constructor.DOMAttachKey) {
      this.$dom.removeData(this.constructor.DOMAttachKey);
    }
    this.detached = true;
  }
};
__publicField(_DOMAttachedObject, "uniqueIdCounter", 0);
__publicField(_DOMAttachedObject, "DOMAttachKey");
__publicField(_DOMAttachedObject, "DOMAttachSelector");
__publicField(_DOMAttachedObject, "DOMDetachSelector");
let DOMAttachedObject = _DOMAttachedObject;



/***/ },

/***/ "./components/autocomplete/AssignSelectAutoComplete.tsx"
/*!**************************************************************!*\
  !*** ./components/autocomplete/AssignSelectAutoComplete.tsx ***!
  \**************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ AssignSelectAutoComplete)
/* harmony export */ });
/* harmony import */ var ___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! . */ "./components/autocomplete/index.tsx");
/* harmony import */ var _components_AssignSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./components/AssignSelectAutoComplete */ "./components/autocomplete/components/AssignSelectAutoComplete.tsx");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);


class AssignSelectAutoComplete extends ___WEBPACK_IMPORTED_MODULE_0__["default"] {
  constructor($dom, options = {}) {
    super($dom, {
      classes: "assign-select",
      component: _components_AssignSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__["default"],
      props: {
        multi: true,
        height: "auto"
      },
      ...options
    });
  }
  value() {
    var _a, _b;
    return (_b = (_a = this.ref) == null ? void 0 : _a.getSelectedItemKeys().join(",")) != null ? _b : this.$dom.val();
  }
}
__publicField(AssignSelectAutoComplete, "DOMAttachKey", "ucwAssignSelectAutoCompleteInstance");


/***/ },

/***/ "./components/autocomplete/CustomSelectAutoComplete.tsx"
/*!**************************************************************!*\
  !*** ./components/autocomplete/CustomSelectAutoComplete.tsx ***!
  \**************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ CustomSelectAutoComplete)
/* harmony export */ });
/* harmony import */ var _hydrooj_components__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @hydrooj/components */ "../components/frontend/autocomplete/CustomSelectAutoComplete.tsx");
/* harmony import */ var ___WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! . */ "./components/autocomplete/index.tsx");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);


class CustomSelectAutoComplete extends ___WEBPACK_IMPORTED_MODULE_1__["default"] {
  constructor($dom, options) {
    super($dom, {
      classes: "custom-select",
      component: _hydrooj_components__WEBPACK_IMPORTED_MODULE_0__["default"],
      props: {
        data: options.data,
        multi: options.multi,
        height: "auto"
      },
      ...options
    });
  }
}
__publicField(CustomSelectAutoComplete, "DOMAttachKey", "ucwCustomSelectAutoCompleteInstance");


/***/ },

/***/ "./components/autocomplete/DomainSelectAutoComplete.tsx"
/*!**************************************************************!*\
  !*** ./components/autocomplete/DomainSelectAutoComplete.tsx ***!
  \**************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ DomainSelectAutoComplete)
/* harmony export */ });
/* harmony import */ var ___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! . */ "./components/autocomplete/index.tsx");
/* harmony import */ var _components_DomainSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./components/DomainSelectAutoComplete */ "./components/autocomplete/components/DomainSelectAutoComplete.tsx");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);


class DomainSelectAutoComplete extends ___WEBPACK_IMPORTED_MODULE_0__["default"] {
  constructor($dom, options = {}) {
    super($dom, {
      classes: "domain-select",
      component: _components_DomainSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__["default"],
      props: {
        multi: options.multi,
        height: "34px"
      },
      ...options
    });
  }
}
__publicField(DomainSelectAutoComplete, "DOMAttachKey", "ucwDomainSelectAutoCompleteInstance");


/***/ },

/***/ "./components/autocomplete/FileSelectAutoComplete.tsx"
/*!************************************************************!*\
  !*** ./components/autocomplete/FileSelectAutoComplete.tsx ***!
  \************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ FileSelectAutoComplete)
/* harmony export */ });
/* harmony import */ var ___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! . */ "./components/autocomplete/index.tsx");
/* harmony import */ var _components_FileSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./components/FileSelectAutoComplete */ "./components/autocomplete/components/FileSelectAutoComplete.tsx");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);


class FileSelectAutoComplete extends ___WEBPACK_IMPORTED_MODULE_0__["default"] {
  constructor($dom, options) {
    super($dom, {
      classes: "file-select",
      component: _components_FileSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__["default"],
      props: {
        data: options.data,
        multi: options.multi,
        height: "auto"
      },
      ...options
    });
  }
}
__publicField(FileSelectAutoComplete, "DOMAttachKey", "ucwFileSelectAutoCompleteInstance");


/***/ },

/***/ "./components/autocomplete/LanguageSelectAutoComplete.tsx"
/*!****************************************************************!*\
  !*** ./components/autocomplete/LanguageSelectAutoComplete.tsx ***!
  \****************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ LanguageSelectAutoComplete)
/* harmony export */ });
/* harmony import */ var ___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! . */ "./components/autocomplete/index.tsx");
/* harmony import */ var _components_LanguageSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./components/LanguageSelectAutoComplete */ "./components/autocomplete/components/LanguageSelectAutoComplete.tsx");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);


class LanguageSelectAutoComplete extends ___WEBPACK_IMPORTED_MODULE_0__["default"] {
  constructor($dom, options) {
    super($dom, {
      classes: "language-select",
      component: _components_LanguageSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__["default"],
      props: {
        multi: options.multi,
        withAuto: options.withAuto,
        height: "auto"
      },
      ...options
    });
  }
}
__publicField(LanguageSelectAutoComplete, "DOMAttachKey", "ucwLanguageSelectAutoCompleteInstance");


/***/ },

/***/ "./components/autocomplete/ProblemSelectAutoComplete.tsx"
/*!***************************************************************!*\
  !*** ./components/autocomplete/ProblemSelectAutoComplete.tsx ***!
  \***************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ ProblemSelectAutoComplete)
/* harmony export */ });
/* harmony import */ var ___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! . */ "./components/autocomplete/index.tsx");
/* harmony import */ var _components_ProblemSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./components/ProblemSelectAutoComplete */ "./components/autocomplete/components/ProblemSelectAutoComplete.tsx");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);


class ProblemSelectAutoComplete extends ___WEBPACK_IMPORTED_MODULE_0__["default"] {
  constructor($dom, options) {
    super($dom, {
      classes: "problem-select",
      component: _components_ProblemSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__["default"],
      props: {
        multi: options.multi,
        height: "auto"
      },
      ...options
    });
  }
}
__publicField(ProblemSelectAutoComplete, "DOMAttachKey", "ucwProblemSelectAutoCompleteInstance");


/***/ },

/***/ "./components/autocomplete/UserSelectAutoComplete.tsx"
/*!************************************************************!*\
  !*** ./components/autocomplete/UserSelectAutoComplete.tsx ***!
  \************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ UserSelectAutoComplete)
/* harmony export */ });
/* harmony import */ var ___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! . */ "./components/autocomplete/index.tsx");
/* harmony import */ var _components_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./components/UserSelectAutoComplete */ "./components/autocomplete/components/UserSelectAutoComplete.tsx");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);


class UserSelectAutoComplete extends ___WEBPACK_IMPORTED_MODULE_0__["default"] {
  constructor($dom, options = {}) {
    super($dom, {
      classes: "user-select",
      component: _components_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__["default"],
      props: {
        multi: options.multi,
        height: "auto"
      },
      ...options
    });
  }
  value() {
    var _a, _b, _c, _d;
    if (this.options.multi) return (_b = (_a = this.ref) == null ? void 0 : _a.getSelectedItemKeys().map((i) => +i)) != null ? _b : this.$dom.val();
    return (_d = (_c = this.ref) == null ? void 0 : _c.getSelectedItems()[0]) != null ? _d : null;
  }
}
__publicField(UserSelectAutoComplete, "DOMAttachKey", "ucwUserSelectAutoCompleteInstance");


/***/ },

/***/ "./components/autocomplete/components/AssignSelectAutoComplete.tsx"
/*!*************************************************************************!*\
  !*** ./components/autocomplete/components/AssignSelectAutoComplete.tsx ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/components */ "../components/frontend/autocomplete/AutoComplete.tsx");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! prop-types */ "../../node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");





const toUserItem = (user) => ({
  type: "user",
  key: user._id.toString(),
  name: user.uname,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl
});
const toGroupItem = (group) => ({
  type: "group",
  key: group.name,
  name: group.name,
  uids: group.uids
});
const AssignSelectAutoComplete = (0,react__WEBPACK_IMPORTED_MODULE_3__.forwardRef)((props, ref) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
  _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__["default"],
  {
    ref,
    cacheKey: "assign",
    queryItems: async (query) => {
      const [users, groups] = await Promise.all([
        (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.api)("users", { search: query }, ["_id", "uname", "displayName", "avatarUrl"]),
        (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.api)("groups", { search: query }, ["name", "uids"])
      ]);
      const userItems = users.map((user) => toUserItem(user));
      const groupItems = groups.map((group) => toGroupItem(group));
      return [...groupItems, ...userItems];
    },
    fetchItems: async (keys) => {
      const isUserId = (k) => /^-?[0-9]+$/.test(k);
      const userIds = keys.filter((k) => isUserId(k));
      const groupNames = keys.filter((k) => !isUserId(k));
      const [users, groups] = await Promise.all([
        userIds.length > 0 ? (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.api)("users", { auto: userIds }, ["_id", "uname", "displayName"]) : [],
        groupNames.length > 0 ? (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.api)("groups", { names: groupNames }, ["name", "uids"]) : []
      ]);
      const userItems = users.map((user) => toUserItem(user));
      const groupItems = keys.filter((key) => !isUserId(key)).map((key) => {
        const group = groups.find((g) => g.name === key);
        return group ? toGroupItem(group) : { type: "group", key, name: key, invalid: true };
      });
      return [...groupItems, ...userItems];
    },
    itemText: (item) => {
      var _a;
      if (item.type === "group") {
        if (item.invalid) return `${item.name} (invalid)`;
        return `${item.name} (${((_a = item.uids) == null ? void 0 : _a.length) || 0} users)`;
      }
      return item.name + (item.displayName ? ` (${item.displayName})` : "");
    },
    itemKey: (item) => item.key,
    renderItem: (item) => {
      var _a;
      return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "media", children: [
        item.type === "user" && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "media__left medium", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("img", { className: "small user-profile-avatar", alt: "", src: item.avatarUrl, width: "30", height: "30" }) }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "media__body medium", children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "assign-select__name", children: [
            item.name,
            item.type === "user" && item.displayName && ` (${item.displayName})`
          ] }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "assign-select__desc", children: item.type === "group" ? `Group \u2022 ${((_a = item.uids) == null ? void 0 : _a.length) || 0} users` : `User \u2022 UID = ${item.key}` })
        ] })
      ] });
    },
    ...{
      width: "100%",
      height: "auto",
      listStyle: {},
      multi: true,
      selectedKeys: [],
      allowEmptyQuery: false,
      freeSolo: false,
      freeSoloConverter: (input) => input,
      ...props
    }
  }
));
AssignSelectAutoComplete.propTypes = {
  width: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  height: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  listStyle: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().object),
  onChange: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func).isRequired,
  multi: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  selectedKeys: prop_types__WEBPACK_IMPORTED_MODULE_2___default().arrayOf((prop_types__WEBPACK_IMPORTED_MODULE_2___default().string)),
  allowEmptyQuery: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSolo: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSoloConverter: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func)
};
AssignSelectAutoComplete.displayName = "AssignSelectAutoComplete";
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (AssignSelectAutoComplete);


/***/ },

/***/ "./components/autocomplete/components/DomainSelectAutoComplete.tsx"
/*!*************************************************************************!*\
  !*** ./components/autocomplete/components/DomainSelectAutoComplete.tsx ***!
  \*************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/components */ "../components/frontend/autocomplete/AutoComplete.tsx");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! prop-types */ "../../node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");





const DomainSelectAutoComplete = (0,react__WEBPACK_IMPORTED_MODULE_3__.forwardRef)((props, ref) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
  _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__["default"],
  {
    ref,
    cacheKey: "domain",
    renderItem: (domain) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "media", children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "media__left medium", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("img", { className: "small domain-profile-avatar", src: domain.avatarUrl, alt: "", width: "30", height: "30" }) }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "media__body medium", children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "domain-select__name", children: domain.name }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "domain-select__id", children: [
          "ID = ",
          domain._id
        ] })
      ] })
    ] }),
    queryItems: (query) => vj_utils__WEBPACK_IMPORTED_MODULE_4__.request.get("/domain/search", { q: query }),
    itemText: (domain) => domain.name,
    itemKey: (domain) => domain._id,
    ...{
      width: "100%",
      height: "auto",
      listStyle: {},
      multi: false,
      selectedKeys: [],
      allowEmptyQuery: true,
      freeSolo: false,
      freeSoloConverter: (input) => input,
      ...props
    }
  }
));
DomainSelectAutoComplete.propTypes = {
  width: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  height: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  listStyle: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().object),
  onChange: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func).isRequired,
  multi: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  selectedKeys: prop_types__WEBPACK_IMPORTED_MODULE_2___default().arrayOf((prop_types__WEBPACK_IMPORTED_MODULE_2___default().string)),
  allowEmptyQuery: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSolo: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSoloConverter: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func)
};
DomainSelectAutoComplete.displayName = "DomainSelectAutoComplete";
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (DomainSelectAutoComplete);


/***/ },

/***/ "./components/autocomplete/components/FileSelectAutoComplete.tsx"
/*!***********************************************************************!*\
  !*** ./components/autocomplete/components/FileSelectAutoComplete.tsx ***!
  \***********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/components */ "../components/frontend/autocomplete/AutoComplete.tsx");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! prop-types */ "../../node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);




const FileSelectAutoComplete = react__WEBPACK_IMPORTED_MODULE_3___default().forwardRef((props, ref) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
  _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__["default"],
  {
    ref,
    fetchItems: (keys) => props.data.filter((i) => i._id ? keys.includes(i._id) : keys.includes(i)),
    queryItems: (query) => props.data.filter((i) => i.name ? i.name.toLowerCase().match(query.toLowerCase()) : i.toString().toLowerCase().match(query.toLowerCase())),
    itemText: (item) => `${item.name || item}`,
    itemKey: (item) => {
      var _a;
      return `${((_a = item._id) == null ? void 0 : _a.toString()) || item.name || item}`;
    },
    renderItem: (item) => item.name || item._id || item,
    allowEmptyQuery: true,
    ...{
      width: "100%",
      height: "auto",
      listStyle: {},
      multi: false,
      selectedKeys: [],
      freeSolo: false,
      freeSoloConverter: (input) => input,
      ...props
    }
  }
));
FileSelectAutoComplete.propTypes = {
  width: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  height: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  listStyle: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().object),
  onChange: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func).isRequired,
  multi: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  selectedKeys: prop_types__WEBPACK_IMPORTED_MODULE_2___default().arrayOf((prop_types__WEBPACK_IMPORTED_MODULE_2___default().string)),
  allowEmptyQuery: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSolo: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSoloConverter: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func),
  data: prop_types__WEBPACK_IMPORTED_MODULE_2___default().arrayOf((prop_types__WEBPACK_IMPORTED_MODULE_2___default().any))
};
FileSelectAutoComplete.displayName = "FileSelectAutoComplete";
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (FileSelectAutoComplete);


/***/ },

/***/ "./components/autocomplete/components/LanguageSelectAutoComplete.tsx"
/*!***************************************************************************!*\
  !*** ./components/autocomplete/components/LanguageSelectAutoComplete.tsx ***!
  \***************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/components */ "../components/frontend/autocomplete/CustomSelectAutoComplete.tsx");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! prop-types */ "../../node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);




const prefixes = new Set(Object.keys(window.LANGS).filter((i) => i.includes(".")).map((i) => i.split(".")[0]));
const data = Object.keys(window.LANGS).filter((i) => !prefixes.has(i)).map((i) => ({ name: `${i.includes(".") ? `${window.LANGS[i.split(".")[0]].display || ""}/` : ""}${window.LANGS[i].display}`, _id: i }));
const withAuto = [...data, { name: "Auto", _id: "auto" }];
const LanguageSelectAutoComplete = react__WEBPACK_IMPORTED_MODULE_3___default().forwardRef((props, ref) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
  _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__["default"],
  {
    ref,
    ...props,
    selectedKeys: typeof props.selectedKeys === "string" ? props.selectedKeys.split(",") : props.selectedKeys,
    data: props.withAuto ? withAuto : data,
    renderItem: (item) => prefixes.has(item._id) ? "" : `${item.name}`,
    onChange: (val) => {
      let value = val.split(",");
      const active = new Set(value.filter((i) => i.includes(".")).map((i) => i.split(".")[0]));
      value = value.filter((i) => !prefixes.has(i) || active.has(i));
      for (const i of active) if (!value.includes(i)) value.push(i);
      props.onChange(value.join(","));
    },
    multi: !!props.multi
  }
));
LanguageSelectAutoComplete.propTypes = {
  width: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  height: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  listStyle: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().object),
  onChange: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func).isRequired,
  multi: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  selectedKeys: prop_types__WEBPACK_IMPORTED_MODULE_2___default().arrayOf((prop_types__WEBPACK_IMPORTED_MODULE_2___default().string)),
  allowEmptyQuery: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSolo: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSoloConverter: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func),
  data: prop_types__WEBPACK_IMPORTED_MODULE_2___default().arrayOf((prop_types__WEBPACK_IMPORTED_MODULE_2___default().any)),
  withAuto: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool)
};
LanguageSelectAutoComplete.displayName = "LanguageSelectAutoComplete";
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (LanguageSelectAutoComplete);


/***/ },

/***/ "./components/autocomplete/components/ProblemSelectAutoComplete.tsx"
/*!**************************************************************************!*\
  !*** ./components/autocomplete/components/ProblemSelectAutoComplete.tsx ***!
  \**************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/components */ "../components/frontend/autocomplete/AutoComplete.tsx");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! prop-types */ "../../node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");





const ProblemSelectAutoComplete = (0,react__WEBPACK_IMPORTED_MODULE_3__.forwardRef)((props, ref) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
  _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__["default"],
  {
    ref,
    cacheKey: `problem-${UiContext.domainId}`,
    queryItems: async (query) => {
      const { pdocs } = await vj_utils__WEBPACK_IMPORTED_MODULE_4__.request.get(`/d/${UiContext.domainId}/p`, { q: query, quick: true, sort: query ? "default" : "recent" });
      return pdocs;
    },
    fetchItems: (ids) => (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.api)("problems", { ids: ids.map((i) => +i) }, ["docId", "pid", "title"]),
    itemText: (pdoc) => `${`${pdoc.docId} ${pdoc.title}`}`,
    itemKey: (pdoc) => `${pdoc.docId || pdoc}`,
    renderItem: (pdoc) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "media", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "media__body medium", children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "problem-select__name", children: [
        pdoc.pid ? `${pdoc.pid} ` : "",
        pdoc.title
      ] }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "problem-select__id", children: [
        "ID = ",
        pdoc.docId
      ] })
    ] }) }),
    ...{
      width: "100%",
      height: "auto",
      listStyle: {},
      multi: false,
      selectedKeys: [],
      allowEmptyQuery: true,
      freeSolo: false,
      freeSoloConverter: (input) => input,
      ...props
    }
  }
));
ProblemSelectAutoComplete.propTypes = {
  width: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  height: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  listStyle: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().object),
  onChange: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func).isRequired,
  multi: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  selectedKeys: prop_types__WEBPACK_IMPORTED_MODULE_2___default().arrayOf((prop_types__WEBPACK_IMPORTED_MODULE_2___default().string)),
  allowEmptyQuery: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSolo: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSoloConverter: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func)
};
ProblemSelectAutoComplete.displayName = "ProblemSelectAutoComplete";
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (ProblemSelectAutoComplete);


/***/ },

/***/ "./components/autocomplete/components/UserSelectAutoComplete.tsx"
/*!***********************************************************************!*\
  !*** ./components/autocomplete/components/UserSelectAutoComplete.tsx ***!
  \***********************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/components */ "../components/frontend/autocomplete/AutoComplete.tsx");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! prop-types */ "../../node_modules/prop-types/index.js");
/* harmony import */ var prop_types__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(prop_types__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");





const UserSelectAutoComplete = (0,react__WEBPACK_IMPORTED_MODULE_3__.forwardRef)((props, ref) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
  _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__["default"],
  {
    ref,
    cacheKey: "user",
    queryItems: (query) => (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.api)("users", { search: query }, ["_id", "uname", "displayName", "avatarUrl"]),
    fetchItems: (ids) => (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.api)("users", { auto: ids }, ["_id", "uname", "displayName"]),
    itemText: (user) => user.uname + (user.displayName ? ` (${user.displayName})` : ""),
    itemKey: (user) => props.multi || /^[+-]?\d+$/.test(user.uname.trim()) ? user._id.toString() : user.uname,
    renderItem: (user) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "media", children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "media__left medium", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("img", { className: "small user-profile-avatar", alt: "", src: user.avatarUrl, width: "30", height: "30" }) }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "media__body medium", children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "user-select__uname", children: [
          user.uname,
          user.displayName && ` (${user.displayName})`
        ] }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "user-select__uid", children: [
          "UID = ",
          user._id
        ] })
      ] })
    ] }),
    ...{
      width: "100%",
      height: "auto",
      listStyle: {},
      multi: false,
      selectedKeys: [],
      allowEmptyQuery: false,
      freeSolo: false,
      freeSoloConverter: (input) => input,
      ...props
    }
  }
));
UserSelectAutoComplete.propTypes = {
  width: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  height: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().string),
  listStyle: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().object),
  onChange: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func).isRequired,
  multi: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  selectedKeys: prop_types__WEBPACK_IMPORTED_MODULE_2___default().arrayOf((prop_types__WEBPACK_IMPORTED_MODULE_2___default().string)),
  allowEmptyQuery: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSolo: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().bool),
  freeSoloConverter: (prop_types__WEBPACK_IMPORTED_MODULE_2___default().func)
};
UserSelectAutoComplete.displayName = "UserSelectAutoComplete";
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (UserSelectAutoComplete);


/***/ },

/***/ "./components/autocomplete/index.tsx"
/*!*******************************************!*\
  !*** ./components/autocomplete/index.tsx ***!
  \*******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ AutoComplete)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/components */ "../components/frontend/autocomplete/AutoComplete.tsx");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);





class AutoComplete extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_4__["default"] {
  constructor($dom, options = {}) {
    super($dom);
    __publicField(this, "ref", null);
    __publicField(this, "container", document.createElement("div"));
    __publicField(this, "options");
    __publicField(this, "component", react_dom_client__WEBPACK_IMPORTED_MODULE_3__.createRoot(this.container));
    __publicField(this, "changeListener", [
      (val) => this.$dom.val(val)
    ]);
    this.options = {
      items: async () => [],
      render: () => "",
      text: () => null,
      multi: false,
      ...options
    };
    this.clear = this.clear.bind(this);
    this.onChange = this.onChange.bind(this);
    this.attach = this.attach.bind(this);
    this.open = this.open.bind(this);
    this.close = this.close.bind(this);
    this.value = this.value.bind(this);
    this.detach = this.detach.bind(this);
    this.focus = this.focus.bind(this);
    this.$dom.addClass("autocomplete-dummy").after(this.container);
    setTimeout(() => this.attach(), 0);
  }
  clear(clearValue = true) {
    if (!this.ref) return;
    if (clearValue) this.ref.clear();
    else this.ref.closeList();
  }
  onChange(val) {
    if (typeof val === "string") this.changeListener.forEach((f) => f(val));
    else this.changeListener.push(val);
  }
  attach() {
    const Component = this.options.component || _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__["default"];
    const Wrapper = (props) => {
      const [value, setValue] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(props.value);
      return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        Component,
        {
          ref: (ref) => {
            this.ref = ref;
          },
          onChange: (v) => {
            setValue(v);
            this.onChange(v);
          },
          selectedKeys: (Array.isArray(value) ? value : value.split(",")).map((i) => i.trim()).filter((i) => i),
          height: "34px",
          ...this.options.props
        }
      );
    };
    this.component.render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Wrapper, { value: this.$dom.val() }));
  }
  open() {
    if (!this.ref) return;
    this.ref.triggerQuery();
  }
  close() {
    if (!this.ref) return;
    this.ref.closeList();
  }
  value() {
    var _a, _b, _c, _d;
    if (this.options.multi) return (_b = (_a = this.ref) == null ? void 0 : _a.getSelectedItemKeys()) != null ? _b : this.$dom.val();
    return (_d = (_c = this.ref) == null ? void 0 : _c.getSelectedItems()[0]) != null ? _d : null;
  }
  detach() {
    if (this.detached) return;
    super.detach();
    this.component.unmount();
    this.$dom.removeClass("autocomplete-dummy");
    this.container.parentNode.removeChild(this.container);
  }
  focus() {
    this.ref.focus();
  }
}
__publicField(AutoComplete, "DOMAttachKey", "ucwAutoCompleteInstance");


/***/ },

/***/ "./components/badge_ac_effect.ts"
/*!***************************************!*\
  !*** ./components/badge_ac_effect.ts ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createBadgeAcThemePlayer: () => (/* binding */ createBadgeAcThemePlayer)
/* harmony export */ });
const CELEBRATION_VOLUME = 0.25;
function createBadgeAcThemePlayer(theme) {
  const acImage = String((theme == null ? void 0 : theme.acImage) || "");
  const themeSound = String((theme == null ? void 0 : theme.themeSound) || "");
  let activeEffect = null;
  let audio = null;
  let audioSource = "";
  let audioPrimed = false;
  let audioPriming = false;
  let audioGeneration = 0;
  function getAudio() {
    if (!themeSound) return null;
    if (!audio || audioSource !== themeSound) {
      audio == null ? void 0 : audio.pause();
      audioGeneration++;
      audioPrimed = false;
      audioPriming = false;
      audio = new Audio(themeSound);
      audioSource = themeSound;
      audio.preload = "auto";
      audio.volume = CELEBRATION_VOLUME;
      audio.load();
    }
    return audio;
  }
  function primeAudio() {
    const player = getAudio();
    if (!player || audioPrimed || audioPriming) return;
    const generation = ++audioGeneration;
    audioPriming = true;
    const restoreAudio = () => {
      player.volume = CELEBRATION_VOLUME;
      player.muted = false;
    };
    player.muted = false;
    player.volume = 0;
    player.play().then(() => {
      player.pause();
      player.currentTime = 0;
      restoreAudio();
      if (audio !== player || generation !== audioGeneration) return;
      audioPrimed = true;
      audioPriming = false;
    }).catch(() => {
      restoreAudio();
      if (audio === player && generation === audioGeneration) audioPriming = false;
    });
  }
  if (themeSound) {
    document.addEventListener("pointerdown", primeAudio, { capture: true });
    document.addEventListener("keydown", primeAudio, { capture: true });
  }
  function play() {
    if (!acImage && !themeSound || activeEffect) return activeEffect || Promise.resolve();
    const effect = document.createElement("div");
    effect.className = "badge-ac-theme-effect";
    effect.setAttribute("aria-hidden", "true");
    const frame = document.createElement("div");
    frame.className = "badge-ac-theme-effect__frame";
    const burst = document.createElement("div");
    burst.className = "badge-ac-theme-effect__burst";
    frame.appendChild(burst);
    if (acImage) {
      const image = new Image();
      image.className = "badge-ac-theme-effect__image";
      image.src = acImage;
      image.alt = "";
      frame.appendChild(image);
    } else {
      const label = document.createElement("div");
      label.className = "badge-ac-theme-effect__label";
      label.textContent = `${(theme == null ? void 0 : theme.name) || "\u5FBD\u7AE0\u4E3B\u9898"} \xB7 \u6EE1\u5206 AC`;
      frame.appendChild(label);
    }
    effect.appendChild(frame);
    document.body.appendChild(effect);
    window.requestAnimationFrame(() => effect.classList.add("is-visible"));
    const effectPromise = new Promise((resolve) => {
      let finished = false;
      let timeout = 0;
      const player = getAudio();
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        if (player) {
          player.onended = null;
          player.onerror = null;
        }
        effect.classList.remove("is-visible");
        effect.classList.add("is-leaving");
        window.setTimeout(() => {
          effect.remove();
          resolve();
        }, 340);
      };
      if (player) {
        audioGeneration++;
        audioPriming = false;
        player.pause();
        player.currentTime = 0;
        player.muted = false;
        player.volume = CELEBRATION_VOLUME;
        audioPrimed = true;
        player.onended = finish;
        player.onerror = finish;
        timeout = window.setTimeout(finish, 12e3);
        player.play().catch(() => {
          window.clearTimeout(timeout);
          timeout = window.setTimeout(finish, 2200);
        });
      } else {
        timeout = window.setTimeout(finish, 2200);
      }
    });
    activeEffect = effectPromise.finally(() => {
      activeEffect = null;
    });
    return activeEffect;
  }
  return { play };
}


/***/ },

/***/ "./components/browser-update.page.ts"
/*!*******************************************!*\
  !*** ./components/browser-update.page.ts ***!
  \*******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var _dialog__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./dialog */ "./components/dialog/index.tsx");



function isSupported() {
  try {
    if (!navigator.userAgent.includes("Chrome/")) return false;
    const ver = +navigator.userAgent.split("Chrome/")[1].split(".")[0];
    if (!Number.isSafeInteger(ver)) return false;
    if (ver < 80) return false;
    return true;
  } catch (e) {
    return false;
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__.AutoloadPage("browser-update", () => {
  if (UserContext.priv !== -1) return;
  if ((+localStorage.getItem("su-browser-warn") || 0) - Date.now() < 24 * 3600 * 1e3) return;
  const key = "warn::admin:unsupportedbrowser";
  if (!isSupported() && (0,vj_utils__WEBPACK_IMPORTED_MODULE_1__.i18n)(key) !== key) {
    new _dialog__WEBPACK_IMPORTED_MODULE_2__.InfoDialog({
      $body: vj_utils__WEBPACK_IMPORTED_MODULE_1__.tpl.typoMsg((0,vj_utils__WEBPACK_IMPORTED_MODULE_1__.i18n)(key))
    }).open();
    localStorage.setItem("su-browser-warn", Date.now().toString());
  }
}));


/***/ },

/***/ "./components/clipboard.page.ts"
/*!**************************************!*\
  !*** ./components/clipboard.page.ts ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var clipboard__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! clipboard */ "../../node_modules/clipboard/dist/clipboard.js");
/* harmony import */ var clipboard__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(clipboard__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* provided dependency */ var $ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");




/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.AutoloadPage("clipboard", () => {
  $("[data-copy]").get().forEach((el) => {
    const data = $(el).attr("data-copy");
    const decoded = vj_utils__WEBPACK_IMPORTED_MODULE_3__.base64.decode(data);
    const clip = new (clipboard__WEBPACK_IMPORTED_MODULE_0___default())(el, { text: () => decoded });
    clip.on("success", () => {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.substitute)((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)('"{data}" copied to clipboard!'), { data: decoded }), 2e3);
    });
    clip.on("error", () => {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.substitute)((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)('Copy "{data}" failed :('), { data: decoded }));
    });
  });
  $("[data-copylink]").each(function() {
    const clip = new (clipboard__WEBPACK_IMPORTED_MODULE_0___default())(this, { text: () => new URL(this.dataset.copylink, document.location.href).toString() });
    clip.on("success", () => vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Link copied to clipboard!")));
    clip.on("error", () => vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Copy failed :(")));
  });
}));


/***/ },

/***/ "./components/contest/contest.page.ts"
/*!********************************************!*\
  !*** ./components/contest/contest.page.ts ***!
  \********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




const contestPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.AutoloadPage("contestPage", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()("[data-contest-code]").on("click", (ev) => {
    ev.preventDefault();
    const code = prompt((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Invitation code:"));
    vj_utils__WEBPACK_IMPORTED_MODULE_3__.request.post("", {
      operation: "attend",
      code
    }).then(() => {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Successfully attended"));
      (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.delay)(1e3).then(() => window.location.reload());
    }).catch((e) => {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].error(e.message || e);
    });
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (contestPage);


/***/ },

/***/ "./components/customFont.page.tsx"
/*!****************************************!*\
  !*** ./components/customFont.page.tsx ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/components */ "../components/frontend/autocomplete/CustomSelectAutoComplete.tsx");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var _dialog__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./dialog */ "./components/dialog/index.tsx");






async function getAvailableFonts() {
  var _a;
  const fonts = await window.queryLocalFonts();
  const result = {};
  for (const font of fonts) result[_a = font.family] || (result[_a] = font.fullName);
  return Object.entries(result).map(([family, fullName]) => ({
    id: family,
    name: family === fullName ? family : `${fullName} (${family})`,
    fullName
  }));
}
const customFont = localStorage.getItem("customFont");
const customCodeFont = localStorage.getItem("customCodeFont");
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__.AutoloadPage("customFont", (pageName) => {
  let dialog;
  let selection = "";
  let handle = null;
  async function showDialog(saveKey) {
    if (!dialog) {
      const fonts = await getAvailableFonts();
      dialog = new _dialog__WEBPACK_IMPORTED_MODULE_5__.ActionDialog({
        $body: jquery__WEBPACK_IMPORTED_MODULE_2___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.tpl)(
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            _hydrooj_components__WEBPACK_IMPORTED_MODULE_1__["default"],
            {
              ref: (el) => {
                handle = el;
              },
              allowEmptyQuery: false,
              data: fonts,
              renderItem: (item) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { style: { fontFamily: item.id }, children: item.name })
            }
          ),
          true
        )),
        onDispatch: (action) => {
          var _a, _b;
          selection = (_b = (_a = handle.getSelectedItems()) == null ? void 0 : _a[0]) == null ? void 0 : _b.id;
          return action !== "ok" || selection;
        },
        cancelByEsc: false,
        cancelByClickingBack: false
      });
    }
    dialog.open().then((action) => {
      console.log(action, saveKey, selection);
      if (action === "ok" && selection) {
        localStorage.setItem(saveKey, selection);
        window.location.reload();
      } else {
        localStorage.removeItem(saveKey);
      }
    });
  }
  function FontSelectButton(props) {
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "medium-6 columns", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
      (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.i18n)(props.label),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("button", { className: "button inline", "data-show-font-dialog": props.saveKey, children: props.value ? (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.i18n)("Using custom font: {0}", props.value) : (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.i18n)("Find custom font") }) })
    ] }) });
  }
  if (pageName === "home_preference" && "queryLocalFonts" in window) {
    jquery__WEBPACK_IMPORTED_MODULE_2___default()('[name="form_item_fontFamily"]').parent().parent().parent().append(jquery__WEBPACK_IMPORTED_MODULE_2___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.tpl)(
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(FontSelectButton, { saveKey: "customFont", label: "Select Custom Font", value: customFont })
    )));
    jquery__WEBPACK_IMPORTED_MODULE_2___default()('[name="form_item_codeFontFamily"]').parent().parent().parent().append(jquery__WEBPACK_IMPORTED_MODULE_2___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.tpl)(
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(FontSelectButton, { saveKey: "customCodeFont", label: "Select Custom Code Font", value: customCodeFont })
    )));
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("click", "[data-show-font-dialog]", (ev) => {
      ev.preventDefault();
      showDialog(ev.target.dataset.showFontDialog);
    });
  }
}, () => {
  var _a, _b;
  const fontBlock = Array.from(document.head.children).find((el) => {
    var _a2;
    return el.tagName === "STYLE" && ((_a2 = el.textContent) == null ? void 0 : _a2.includes("--code-font-family"));
  });
  if (fontBlock) {
    if (customFont) {
      fontBlock.textContent = (_a = fontBlock.textContent) == null ? void 0 : _a.replace(/--font-family:/, `--font-family: "${customFont}", `);
    }
    if (customCodeFont) {
      fontBlock.textContent = (_b = fontBlock.textContent) == null ? void 0 : _b.replace(/--code-font-family:/, `--code-font-family: "${customCodeFont}", `);
    }
  } else {
    console.warn("No font style block found");
  }
}));


/***/ },

/***/ "./components/datepicker/datepicker.page.tsx"
/*!***************************************************!*\
  !*** ./components/datepicker/datepicker.page.tsx ***!
  \***************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var flatpickr_dist_flatpickr_min_css__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! flatpickr/dist/flatpickr.min.css */ "../../node_modules/flatpickr/dist/flatpickr.min.css");
/* harmony import */ var flatpickr__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! flatpickr */ "../../node_modules/flatpickr/dist/esm/index.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");




function padTwo(n) {
  return n < 10 ? `0${n}` : `${n}`;
}
function initTimePicker(input) {
  const $input = jquery__WEBPACK_IMPORTED_MODULE_2___default()(input);
  const interval = 15;
  const $wrapper = jquery__WEBPACK_IMPORTED_MODULE_2___default()("<div>").css({ position: "relative", display: "inline-block", width: "100%" });
  $input.wrap($wrapper);
  const $dropdown = jquery__WEBPACK_IMPORTED_MODULE_2___default()("<div>").css({
    position: "absolute",
    top: $input.outerHeight(),
    left: 0,
    right: 0,
    maxHeight: 0,
    overflowY: "auto",
    background: "var(--bg-color, #fff)",
    border: "1px solid #ccc",
    borderTop: "none",
    borderRadius: "0 0 4px 4px",
    zIndex: 1e3,
    opacity: 0,
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    transition: "max-height .2s ease, opacity .2s ease",
    pointerEvents: "none"
  }).addClass("time-picker-dropdown");
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += interval) {
      const time = `${padTwo(h)}:${padTwo(m)}`;
      const $item = jquery__WEBPACK_IMPORTED_MODULE_2___default()("<div>").text(time).css({
        padding: "6px 12px",
        cursor: "pointer"
      }).on("mousedown", (e) => {
        e.preventDefault();
        $input.val(time).trigger("change");
        closeDropdown();
      }).on("mouseenter", function() {
        jquery__WEBPACK_IMPORTED_MODULE_2___default()(this).css("background", "var(--highlight-color, #e8f0fe)");
      }).on("mouseleave", function() {
        jquery__WEBPACK_IMPORTED_MODULE_2___default()(this).css("background", "");
      });
      $dropdown.append($item);
    }
  }
  let isOpen = false;
  function openDropdown() {
    if (isOpen) return;
    isOpen = true;
    $dropdown.css({ maxHeight: "200px", opacity: 1, pointerEvents: "auto" });
    const val = $input.val();
    if (val) {
      $dropdown.children().each(function cb() {
        if (jquery__WEBPACK_IMPORTED_MODULE_2___default()(this).text() !== val) return;
        const el = this;
        el.parentElement.scrollTop = el.offsetTop - el.parentElement.offsetTop - 80;
      });
    }
  }
  function closeDropdown() {
    if (!isOpen) return;
    isOpen = false;
    $dropdown.css({ maxHeight: 0, opacity: 0, pointerEvents: "none" });
  }
  $input.after($dropdown);
  $input.on("focus", openDropdown);
  $input.on("blur", () => {
    if (document.hasFocus()) closeDropdown();
  });
}
const datepickerPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__.AutoloadPage("datepickerPage", async () => {
  jquery__WEBPACK_IMPORTED_MODULE_2___default()("[data-pick-date]").each(function() {
    (0,flatpickr__WEBPACK_IMPORTED_MODULE_1__["default"])(this, { allowInput: true });
  });
  jquery__WEBPACK_IMPORTED_MODULE_2___default()("[data-pick-time]").each(function() {
    initTimePicker(this);
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (datepickerPage);


/***/ },

/***/ "./components/dialog/DomDialog.ts"
/*!****************************************!*\
  !*** ./components/dialog/DomDialog.ts ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ DomDialog)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);



class DomDialog extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_1__["default"] {
  constructor($dom, options = {}) {
    super($dom);
    __publicField(this, "isShown", false);
    __publicField(this, "isAnimating", false);
    __publicField(this, "options");
    __publicField(this, "_resolve");
    this.options = {
      cancelByClickingBack: false,
      cancelByEsc: false,
      onDispatch: () => {
      },
      ...options
    };
  }
  async _show() {
    this.$dom.css("z-index", vj_utils__WEBPACK_IMPORTED_MODULE_2__.zIndexManager.getNext());
    this.$dom.trigger("vjDomDialogShow");
    this.isAnimating = true;
    if (this.options.cancelByClickingBack) {
      this.$dom.on(`click.${this.eventNS}`, this.handleClick.bind(this));
    }
    if (this.options.cancelByEsc) {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on(`keyup.${this.eventNS}`, this.handleKeyUp.bind(this));
    }
    const $wrap = this.$dom;
    $wrap.css({
      display: "flex",
      opacity: 0
    });
    $wrap.width();
    $wrap.transition(
      { opacity: 1 },
      {
        duration: 100,
        easing: "easeOutCubic"
      }
    );
    const $dgContent = this.$dom.find(".dialog__content");
    $dgContent.css({ scale: 0.8 });
    $dgContent.trigger("vjContentNew");
    await $dgContent.transition({
      scale: 1
    }, {
      duration: 200,
      easing: "easeOutCubic"
    }).promise();
    this.$dom.find("[data-autofocus]").focus();
    this.isShown = true;
    this.isAnimating = false;
    this.$dom.trigger("vjDomDialogShown");
  }
  async _hide() {
    this.$dom.trigger("vjDomDialogHide");
    this.isAnimating = true;
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).off(`keyup.${this.eventNS}`);
    this.$dom.off(`click.${this.eventNS}`);
    this.$dom.css({ opacity: 1 });
    this.$dom.transition({
      opacity: 0
    }, {
      duration: 200
    });
    const $dgContent = this.$dom.find(".dialog__content");
    $dgContent.css({ scale: 1 });
    await $dgContent.transition(
      { scale: 0.8 },
      {
        duration: 200,
        easing: "easeOutCubic"
      }
    ).promise();
    this.$dom.css("display", "none");
    this.isShown = false;
    this.isAnimating = false;
    this.$dom.trigger("vjDomDialogHidden");
  }
  show() {
    if (this.isShown) return Promise.reject(new Error("dialog isShown"));
    if (this.isAnimating) return Promise.reject(new Error("dialog isAnimating"));
    const promise = new Promise((resolve) => {
      this._resolve = resolve;
    });
    this._show();
    return promise;
  }
  hide() {
    if (!this.isShown || this.isAnimating) return false;
    this._resolve("cancel");
    this._hide();
    return true;
  }
  dispatchAction(data) {
    if (this.options.onDispatch(data) === false) return;
    this._resolve(data);
    this.hide();
  }
  handleClick(e) {
    if (e.target === this.$dom.get(0)) {
      this.dispatchAction("cancel");
    }
  }
  handleKeyUp(e) {
    if (e.keyCode === 27) {
      this.dispatchAction("cancel");
    }
  }
}
__publicField(DomDialog, "DOMAttachKey", "vjDomDialogInstance");


/***/ },

/***/ "./components/dialog/index.tsx"
/*!*************************************!*\
  !*** ./components/dialog/index.tsx ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ActionDialog: () => (/* binding */ ActionDialog),
/* harmony export */   ConfirmDialog: () => (/* binding */ ConfirmDialog),
/* harmony export */   Dialog: () => (/* binding */ Dialog),
/* harmony export */   InfoDialog: () => (/* binding */ InfoDialog),
/* harmony export */   alert: () => (/* binding */ alert),
/* harmony export */   confirm: () => (/* binding */ confirm),
/* harmony export */   prompt: () => (/* binding */ prompt)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var _autocomplete_components_DomainSelectAutoComplete__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../autocomplete/components/DomainSelectAutoComplete */ "./components/autocomplete/components/DomainSelectAutoComplete.tsx");
/* harmony import */ var _autocomplete_components_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../autocomplete/components/UserSelectAutoComplete */ "./components/autocomplete/components/UserSelectAutoComplete.tsx");
/* harmony import */ var _DomDialog__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./DomDialog */ "./components/dialog/DomDialog.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);









class Dialog {
  constructor(options = {}) {
    __publicField(this, "options");
    __publicField(this, "$dom");
    __publicField(this, "domDialogInstance");
    this.options = {
      classes: "",
      $body: null,
      $action: null,
      ...options
    };
    const box = {};
    if (options.width) box.width = box.maxWidth = options.width;
    if (options.height) box.height = box.maxHeight = options.height;
    this.$dom = jquery__WEBPACK_IMPORTED_MODULE_1___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)(
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `dialog withBg ${this.options.classes}`, style: { display: "none" }, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "dialog__content", style: box, children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "dialog__body", style: { height: "calc(100% - 45px)" } }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "columns clearfix", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "float-right dialog__action" }) }) })
      ] }) })
    ));
    this.$dom.on("click", "[data-action]", this.handleActionButton.bind(this));
    this.$dom.on("vjDomDialogShow", this.beforeShow.bind(this));
    this.$dom.on("vjDomDialogHidden", this.afterHide.bind(this));
    this.$dom.find(".dialog__body").append(this.options.$body);
    this.$dom.find(".dialog__action").append(this.options.$action);
    this.domDialogInstance = new _DomDialog__WEBPACK_IMPORTED_MODULE_8__["default"](this.$dom, this.options);
  }
  beforeShow() {
    this.$dom.appendTo("body");
  }
  afterHide() {
    this.$dom.detach();
  }
  open() {
    return this.domDialogInstance.show();
  }
  close() {
    return this.domDialogInstance.hide();
  }
  handleActionButton(ev) {
    this.domDialogInstance.dispatchAction(jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget).attr("data-action"));
  }
}
/* unused harmony default export */ var __WEBPACK_DEFAULT_EXPORT__ = (Dialog);
const buttonOk = (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`<button class="primary rounded button" data-action="ok">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Ok")}</button>`;
const buttonCancel = (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`<button class="rounded button" data-action="cancel">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Cancel")}</button>`;
const buttonYes = (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`<button class="primary rounded button" data-action="yes">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Yes")}</button>`;
const buttonNo = (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`<button class="rounded button" data-action="no">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("No")}</button>`;
class InfoDialog extends Dialog {
  constructor(options = {}) {
    super({
      $action: buttonOk,
      cancelByClickingBack: true,
      cancelByEsc: true,
      ...options
    });
  }
}
class ActionDialog extends Dialog {
  constructor(options = {}) {
    super({
      $action: [buttonCancel, buttonOk].join("\n"),
      cancelByClickingBack: true,
      cancelByEsc: true,
      ...options
    });
  }
  clear() {
    this.$dom.find("input").val("");
    return this;
  }
}
class ConfirmDialog extends Dialog {
  constructor(options = {}) {
    let buttons = [];
    if (options.canCancel) {
      buttons = [buttonCancel, buttonNo, buttonYes];
    } else {
      buttons = [buttonNo, buttonYes];
    }
    super({
      $action: buttons.join("\n"),
      cancelByClickingBack: options.canCancel,
      cancelByEsc: options.canCancel,
      ...options
    });
  }
}
async function prompt(title, fields, options) {
  var _a, _b;
  let valueCache = {};
  const defaultValues = Object.fromEntries(Object.entries(fields).map(([name, field]) => {
    let firstOption = "";
    if (field.options) {
      if (Array.isArray(field.options)) firstOption = field.options[0];
      else firstOption = Object.keys(field.options)[0];
    }
    return [name, field.default || firstOption || ""];
  }));
  const layout = [];
  let pending = [];
  for (const [name, field] of Object.entries(fields)) {
    pending.push([name, field]);
    if ((field.columns || -12) < 0) {
      layout.push(pending);
      pending = [];
    }
  }
  if (pending.length > 0) layout.push(pending);
  const Component = () => {
    const [values, setValues] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(defaultValues);
    const [selected, setSelected] = react__WEBPACK_IMPORTED_MODULE_2___default().useState({});
    const refs = react__WEBPACK_IMPORTED_MODULE_2___default().useRef({});
    react__WEBPACK_IMPORTED_MODULE_2___default().useEffect(() => {
      valueCache = values;
    }, [values]);
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "columns", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h1", { children: title }) }) }),
      layout.map((i) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", children: i.map(([name, field]) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: `columns medium-${Math.abs(field.columns || 12)}`, children: [
        field.type === "textarea" && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
          field.label,
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "textarea",
            {
              className: "textbox",
              rows: field.rows || 6,
              placeholder: field.placeholder,
              defaultValue: field.default,
              "data-autofocus": field.autofocus,
              style: { fontFamily: "monospace" },
              onChange: (e) => setValues({ ...values, [name]: e.target.value })
            }
          )
        ] }),
        ["text", "user", "userId", "username", "domain"].includes(field.type) && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
          field.label,
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "textbox-container", children: [
            ["text", "password"].includes(field.type) && (field.options ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
              "select",
              {
                defaultValue: field.default,
                className: "select",
                "data-autofocus": field.autofocus,
                onChange: (e) => setValues({ ...values, [name]: e.target.value }),
                children: Object.entries(field.options).map(([value, label]) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("option", { value: Array.isArray(field.options) ? label : value, children: label }, value))
              }
            ) : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
              "input",
              {
                type: field.type,
                className: "textbox",
                "data-autofocus": field.autofocus,
                defaultValue: field.default,
                onChange: (e) => setValues({ ...values, [name]: e.target.value })
              }
            )),
            ["userId", "username", "user"].includes(field.type) && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
              _autocomplete_components_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_7__["default"],
              {
                "data-autofocus": field.autofocus,
                multi: field.multi,
                ref: (el) => {
                  refs.current[name] = el;
                },
                selectedKeys: selected[name] ? field.multi ? String(selected[name]).split(",").filter(Boolean) : [selected[name].toString()] : [],
                onChange: (e) => {
                  if (e === selected[name]) return;
                  const items = refs.current[name].getSelectedItems();
                  const extract = (v) => field.type === "username" ? v == null ? void 0 : v.uname : field.type === "userId" ? v == null ? void 0 : v._id : v;
                  setValues({ ...values, [name]: field.multi ? items.map(extract) : extract(items[0]) });
                  setSelected({ ...selected, [name]: e });
                }
              }
            ),
            field.type === "domain" && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
              _autocomplete_components_DomainSelectAutoComplete__WEBPACK_IMPORTED_MODULE_6__["default"],
              {
                "data-autofocus": field.autofocus,
                selectedKeys: values[name] ? [values[name]] : [],
                onChange: (e) => setValues({ ...values, [name]: e })
              }
            )
          ] })
        ] }),
        field.type === "checkbox" && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { className: "checkbox", children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            "input",
            {
              type: "checkbox",
              defaultChecked: field.default === "true",
              onChange: (e) => setValues({ ...values, [name]: !!e.target.checked })
            }
          ),
          field.label
        ] })
      ] }, name)) }, i[0][0]))
    ] });
  };
  const div = document.createElement("div");
  const root = react_dom_client__WEBPACK_IMPORTED_MODULE_3__.createRoot(div);
  root.render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Component, {}));
  const res = await new Dialog({
    $body: jquery__WEBPACK_IMPORTED_MODULE_1___default()(div),
    $action: [buttonCancel, buttonOk].join("\n"),
    cancelByClickingBack: (_a = options == null ? void 0 : options.cancelByClickingBack) != null ? _a : false,
    cancelByEsc: (_b = options == null ? void 0 : options.cancelByEsc) != null ? _b : false,
    onDispatch(action) {
      if (action === "ok") {
        for (const [name, field] of Object.entries(fields)) {
          if (field.required && !valueCache[name]) {
            console.log("missing ", name);
            vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("{0} is required", field.label || name));
            return false;
          }
        }
      }
      return true;
    }
  }).open();
  root.unmount();
  if (res !== "ok") return null;
  return valueCache;
}
async function confirm(text) {
  const res = await new ConfirmDialog({
    $body: vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl.typoMsg(text)
  }).open();
  return res === "yes";
}
async function alert(text) {
  return await new InfoDialog({
    $body: vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl.typoMsg(text)
  }).open();
}


/***/ },

/***/ "./components/discussion/CommentBox.js"
/*!*********************************************!*\
  !*** ./components/discussion/CommentBox.js ***!
  \*********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ CommentBox)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
/* harmony import */ var vj_components_editor_textareaHandler__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/editor/textareaHandler */ "./components/editor/textareaHandler.ts");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);





let initialized = false;
const $template = jquery__WEBPACK_IMPORTED_MODULE_0___default()(".dczcomments__box").eq(0).clone();
function getClosestInstance($dom) {
  return $dom.closest(".dczcomments__box").data("instance");
}
function onBoxCancel(ev) {
  const commentBox = getClosestInstance(jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget));
  if (commentBox) commentBox.onCancel(ev);
}
function onBoxSubmit(ev) {
  const commentBox = getClosestInstance(jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget));
  if (commentBox) commentBox.onSubmit(ev);
  ev.preventDefault();
}
function init() {
  if (initialized) return;
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("submit", '[name="dczcomments__box__form"]', onBoxSubmit);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjCommentBoxCancel", '[name="dczcomments__box__form"]', onBoxCancel);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="dczcomments__box__cancel"]', onBoxCancel);
  initialized = true;
}
class CommentBox extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_1__["default"] {
  constructor($dom, options = {}) {
    super($dom);
    init();
    this.$box = $template.clone();
    this.$box.data("instance", this);
    this.options = {
      initialText: null,
      mode: null,
      form: null,
      onCancel: () => null,
      ...options
    };
    if (this.options.initialText) this.setText(this.options.initialText);
    if (this.options.mode) {
      const submitButton = this.$box.find(".dczcomments__box__submit");
      submitButton.val(submitButton.attr(`data-value-${this.options.mode}`));
    }
  }
  getTextareaHandler() {
    const $textarea = this.$box.find("textarea");
    return vj_components_editor_textareaHandler__WEBPACK_IMPORTED_MODULE_2__["default"].getOrConstruct($textarea);
  }
  focus() {
    this.getTextareaHandler().focus();
    return this;
  }
  setText(text) {
    this.getTextareaHandler().val(text);
    return this;
  }
  getText() {
    return this.getTextareaHandler().val();
  }
  insertText(text) {
    const handler = this.getTextareaHandler();
    handler.val(handler.val() + text);
    return this;
  }
  appendTo($dom) {
    this.$box.appendTo($dom);
    this.$box.trigger("vjContentNew");
    return this;
  }
  async onSubmit() {
    try {
      await vj_utils__WEBPACK_IMPORTED_MODULE_4__.request.post("", {
        ...this.options.form,
        content: this.getText()
      });
      window.location.reload();
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error(error.message);
    }
  }
  async onCancel(ev) {
    await this.options.onCancel(ev);
    this.$box.remove();
    this.detach();
  }
}
__publicField(CommentBox, "DOMAttachKey", "vjCommentBoxInstance");


/***/ },

/***/ "./components/discussion/collapsible.page.tsx"
/*!****************************************************!*\
  !*** ./components/discussion/collapsible.page.tsx ***!
  \****************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery_easing__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery.easing */ "../../node_modules/jquery.easing/jquery.easing.js");
/* harmony import */ var jquery_easing__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery_easing__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




function initCollapsibleContent() {
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(".collapsible-content").each(function() {
    const $content = jquery__WEBPACK_IMPORTED_MODULE_1___default()(this);
    let $inner = $content.find(".collapsible-content__inner");
    if ($inner.length) return;
    const $children = $content.contents().detach();
    $inner = jquery__WEBPACK_IMPORTED_MODULE_1___default()('<div class="collapsible-content__inner"></div>');
    $inner.append($children);
    $content.append($inner);
    $content.find(".collapsible-toggle").remove();
    const scrollHeight = $inner[0].scrollHeight;
    const clientHeight = $inner[0].clientHeight;
    if (scrollHeight > clientHeight + 10) {
      const $toggle = jquery__WEBPACK_IMPORTED_MODULE_1___default()(`<div class="collapsible-toggle">
        <a href="javascript:;" class="collapsible-toggle__link">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Show more")}</a>
      </div>`);
      $content.append($toggle);
      const $toggleLink = $toggle.find(".collapsible-toggle__link");
      requestAnimationFrame(() => {
        $toggle.addClass("visible");
      });
      $toggleLink.on("click", (e) => {
        e.preventDefault();
        if ($content.hasClass("expanded")) {
          const currentHeight = $inner[0].scrollHeight;
          $inner.css("max-height", `${currentHeight}px`);
          requestAnimationFrame(() => {
            $content.removeClass("expanded");
            $inner.css("max-height", "");
            $toggleLink.text((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Show more"));
          });
        } else {
          const currentMaxHeight = $inner.css("max-height");
          $inner.css("max-height", "none");
          const fullHeight = $inner[0].scrollHeight;
          $inner.css("max-height", currentMaxHeight);
          requestAnimationFrame(() => {
            $inner.css("max-height", `${fullHeight}px`);
            $content.addClass("expanded");
            $toggleLink.text((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Show less"));
          });
        }
      });
    } else $content.addClass("expanded");
  });
}
const commentsPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.AutoloadPage("commentsPage", () => {
  initCollapsibleContent();
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("vjContentNew", () => {
    initCollapsibleContent();
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (commentsPage);


/***/ },

/***/ "./components/discussion/comments.page.tsx"
/*!*************************************************!*\
  !*** ./components/discussion/comments.page.tsx ***!
  \*************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery_easing__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery.easing */ "../../node_modules/jquery.easing/jquery.easing.js");
/* harmony import */ var jquery_easing__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery_easing__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_discussion_CommentBox__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/discussion/CommentBox */ "./components/discussion/CommentBox.js");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");






const $replyTemplate = jquery__WEBPACK_IMPORTED_MODULE_1___default()(".commentbox-container").eq(0).clone();
function createReplyContainer($parent) {
  const $container = $replyTemplate.clone().hide().prependTo($parent.find(".commentbox-reply-target").eq(0)).trigger("vjContentNew");
  return $container.find(".commentbox-placeholder");
}
async function showReplyContainer($parent) {
  const $container = $parent.find(".commentbox-container");
  const rect = $container.parent()[0].getBoundingClientRect();
  const rectBody = document.body.getBoundingClientRect();
  if (rect.top < 100 || rect.top + 100 > window.innerHeight) {
    const targetScrollTop = rect.top - rectBody.top - window.innerHeight * 0.382;
    jquery__WEBPACK_IMPORTED_MODULE_1___default()("html, body").stop().animate({ scrollTop: targetScrollTop }, 400, "easeOutCubic");
    await (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.delay)(300);
  }
  $container.css("opacity", 0);
  await (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.slideDown)($container, 300);
  await $container.transition({ opacity: 1 }, { duration: 200 }).promise();
  $container.removeAttr("style");
}
async function destroyReplyContainer($parent) {
  const $container = $parent.find(".commentbox-container");
  $container.css("opacity", 1);
  await $container.transition({ opacity: 0 }, { duration: 200 }).promise();
  await (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.slideUp)($container, 300);
  $container.remove();
}
function onClickDummyBox(ev) {
  const $evTarget = jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget);
  if (vj_components_discussion_CommentBox__WEBPACK_IMPORTED_MODULE_3__["default"].get($evTarget)) {
    vj_components_discussion_CommentBox__WEBPACK_IMPORTED_MODULE_3__["default"].get($evTarget).focus();
    return;
  }
  const $mediaBody = $evTarget.closest(".media__body");
  const opt = {
    form: JSON.parse($evTarget.attr("data-form")),
    mode: "comment",
    onCancel: () => {
      $mediaBody.removeClass("is-editing");
    }
  };
  $mediaBody.addClass("is-editing");
  vj_components_discussion_CommentBox__WEBPACK_IMPORTED_MODULE_3__["default"].getOrConstruct($evTarget, opt).appendTo($mediaBody.find(".commentbox-placeholder").eq(0)).focus();
}
async function onCommentClickReplyComment(ev, options = {}) {
  const $evTarget = jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget);
  if (vj_components_discussion_CommentBox__WEBPACK_IMPORTED_MODULE_3__["default"].get($evTarget)) {
    vj_components_discussion_CommentBox__WEBPACK_IMPORTED_MODULE_3__["default"].get($evTarget).insertText(options.initialText || "").focus();
    return;
  }
  const $mediaBody = $evTarget.closest(".media__body");
  const opt = {
    initialText: "",
    mode: "reply",
    ...options,
    onCancel: async () => {
      await destroyReplyContainer($mediaBody);
    }
  };
  const cbox = vj_components_discussion_CommentBox__WEBPACK_IMPORTED_MODULE_3__["default"].getOrConstruct($evTarget, {
    form: JSON.parse($evTarget.attr("data-form")),
    ...opt
  }).appendTo(createReplyContainer($mediaBody));
  await showReplyContainer($mediaBody);
  cbox.focus();
}
async function onCommentClickReplyReply(ev) {
  const $evTarget = jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget);
  const $mediaBody = $evTarget.closest(".media__body");
  const uid = $mediaBody.find(".user-profile-name").attr("href").split("/user/")[1];
  $evTarget.closest(".dczcomments__item").find('[data-op="reply"][data-type="comment"]').eq(0).trigger("click", { initialText: `@[](/user/${uid.trim()}) ` });
}
async function onCommentClickEdit(mode, ev) {
  const $evTarget = jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget);
  if (vj_components_discussion_CommentBox__WEBPACK_IMPORTED_MODULE_3__["default"].get($evTarget)) {
    vj_components_discussion_CommentBox__WEBPACK_IMPORTED_MODULE_3__["default"].get($evTarget).focus();
    return;
  }
  const $mediaBody = $evTarget.closest(".media__body");
  const raw = await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.get(
    $mediaBody.find(".typo").eq(0).attr("data-raw-url"),
    {},
    { dataType: "text" }
  );
  const opt = {
    initialText: raw,
    form: JSON.parse($evTarget.attr("data-form")),
    mode,
    onCancel: () => {
      $mediaBody.removeClass("is-editing");
    }
  };
  $mediaBody.addClass("is-editing");
  vj_components_discussion_CommentBox__WEBPACK_IMPORTED_MODULE_3__["default"].getOrConstruct($evTarget, opt).appendTo($mediaBody.find(".commentbox-edit-target").eq(0)).focus();
}
function onCommentClickEditComment(ev) {
  return onCommentClickEdit("comment-update", ev);
}
function onCommentClickEditReply(ev) {
  return onCommentClickEdit("reply-update", ev);
}
async function onCommentClickDelete(type, ev) {
  const message = type === "comment" ? "Confirm deleting this comment? Its replies will be deleted as well." : "Confirm deleting this reply?";
  if (!await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)(message))) return;
  const $evTarget = jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget);
  const form = JSON.parse($evTarget.attr("data-form"));
  await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post("", form);
  window.location.reload();
}
function onCommentClickDeleteComment(ev) {
  onCommentClickDelete("comment", ev);
}
function onCommentClickDeleteReply(ev) {
  onCommentClickDelete("reply", ev);
}
const commentsPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.AutoloadPage("commentsPage", () => {
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="dczcomments__dummy-box"]', onClickDummyBox);
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[data-op="reply"][data-type="comment"]', onCommentClickReplyComment);
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[data-op="reply"][data-type="reply"]', onCommentClickReplyReply);
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[data-op="edit"][data-type="comment"]', onCommentClickEditComment);
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[data-op="edit"][data-type="reply"]', onCommentClickEditReply);
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[data-op="delete"][data-type="comment"]', onCommentClickDeleteComment);
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[data-op="delete"][data-type="reply"]', onCommentClickDeleteReply);
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (commentsPage);


/***/ },

/***/ "./components/discussion/history.page.tsx"
/*!************************************************!*\
  !*** ./components/discussion/history.page.tsx ***!
  \************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineProvider.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/components/Popover/Popover.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var timeago_react__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! timeago-react */ "../../node_modules/timeago-react/esm/timeago-react.js");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* provided dependency */ var $ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");








async function historyDialog(payload, time, uid) {
  const ts = new Date(time).getTime();
  const rawHtml = await fetch(`${payload}?time=${ts}&render=1`).then((res) => res.text());
  new vj_components_dialog__WEBPACK_IMPORTED_MODULE_6__.InfoDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.tpl)`
      <div class="typo richmedia">
        <p><div data-user>${uid}</div> ${(0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Edited at")} <span class="time relative" data-timestamp="${ts / 1e3}">${time}</span></p>
        <div style="scroll-behavior: smooth; max-height: 60vh; overflow: auto;">
          ${{ templateRaw: true, html: rawHtml }}
        </div>
      </div>`
  }).open();
}
function History({ payload }) {
  const [load, setLoad] = react__WEBPACK_IMPORTED_MODULE_3___default().useState(false);
  const [data, setData] = react__WEBPACK_IMPORTED_MODULE_3___default().useState([]);
  const [isLoading, setLoading] = react__WEBPACK_IMPORTED_MODULE_3___default().useState(true);
  const [error, setError] = react__WEBPACK_IMPORTED_MODULE_3___default().useState("");
  react__WEBPACK_IMPORTED_MODULE_3___default().useEffect(() => {
    if (!load) return;
    setLoading(true);
    vj_utils__WEBPACK_IMPORTED_MODULE_8__.request.get(`${payload}?all=1`).then(({ history }) => {
      setData(history);
    }).catch((e) => {
      setError(e.message);
    }).finally(() => {
      setLoading(false);
    });
  }, [load]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(_mantine_core__WEBPACK_IMPORTED_MODULE_2__.Popover, { onOpen: () => setLoad(true), children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_2__.Popover.Target, { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("span", { children: [
      (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Edited"),
      " ",
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "icon icon-expand_more" })
    ] }) }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_2__.Popover.Dropdown, { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("ol", { className: "menu", children: [
      (isLoading || error) && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("li", { className: "menu__item", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("a", { className: "menu__link", children: isLoading ? (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Loading...") : (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Loading failed.") }) }),
      data == null ? void 0 : data.map((item) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("li", { className: "menu__item", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("a", { className: "menu__link", onClick: () => historyDialog(payload, item.time, item.uid), children: [
        (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Edited at"),
        " ",
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(timeago_react__WEBPACK_IMPORTED_MODULE_5__["default"], { datetime: item.time, locale: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("timeago_locale") })
      ] }) }, item.time))
    ] }) })
  ] });
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_7__.AutoloadPage("discussionHistoryPage", () => {
  $("[data-discussion-history]").each((i, e) => {
    const url = $(e).data("raw-url");
    if (!url) return;
    react_dom_client__WEBPACK_IMPORTED_MODULE_4__.createRoot(e).render(
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_1__.MantineProvider, { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(History, { payload: url }) })
    );
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./components/discussion/reaction.page.tsx"
/*!*************************************************!*\
  !*** ./components/discussion/reaction.page.tsx ***!
  \*************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var jquery_easing__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery.easing */ "../../node_modules/jquery.easing/jquery.easing.js");
/* harmony import */ var jquery_easing__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery_easing__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineProvider.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/components/Popover/Popover.mjs");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_6___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_6__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");









function renderReactions(reactions = {}, self = {}, rootEle) {
  let html = "";
  for (const [k, v] of Object.entries(reactions).sort(([, v1], [, v2]) => +v2 - +v1)) {
    if (!v) continue;
    html += `<div class="reaction${self[k] ? " active" : ""}""><span class="emoji">${k}</span> ${v}</div>
`;
  }
  rootEle.html(html);
}
async function handleEmojiClick(payload, emoji, ele) {
  var _a;
  const res = await vj_utils__WEBPACK_IMPORTED_MODULE_9__.request.post("", { ...payload, emoji });
  if (!res.sdoc) return;
  renderReactions((_a = res.doc) == null ? void 0 : _a.react, res.sdoc.react, ele);
}
function getRow(count) {
  if (count <= 2) return 2;
  if (count <= 3) return 3;
  if (count <= 4) return 4;
  if (count <= 6) return 6;
  return 12;
}
function Reaction({ payload, ele }) {
  const emojiList = (UiContext.emojiList || "\u{1F44D} \u{1F44E} \u{1F604} \u{1F615} \u2764\uFE0F \u{1F914} \u{1F923} \u{1F33F} \u{1F34B} \u{1F54A}\uFE0F \u{1F440} \u{1F921}").split(" ");
  const elesPerRow = getRow(Math.sqrt(emojiList.length));
  const [focus, updateFocus] = react__WEBPACK_IMPORTED_MODULE_6__.useState(false);
  const [open, updateOpen] = react__WEBPACK_IMPORTED_MODULE_6__.useState(false);
  const [trigger, updateTrigger] = react__WEBPACK_IMPORTED_MODULE_6__.useState(false);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(_mantine_core__WEBPACK_IMPORTED_MODULE_3__.Popover, { opened: trigger || open || focus, children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_3__.Popover.Target, { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      "span",
      {
        className: "icon icon-emoji",
        onMouseEnter: () => updateTrigger(true),
        onMouseLeave: () => {
          setTimeout(() => updateTrigger(false), 300);
        }
      }
    ) }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(_mantine_core__WEBPACK_IMPORTED_MODULE_3__.Popover.Dropdown, { onMouseEnter: () => updateOpen(true), onMouseLeave: () => updateOpen(false), children: [
      (0,lodash__WEBPACK_IMPORTED_MODULE_5__.chunk)(emojiList, elesPerRow).map((line, i) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", style: { paddingBottom: 4, paddingTop: 4 }, children: line.map((emoji) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        "div",
        {
          className: `medium-${12 / elesPerRow} small-${12 / elesPerRow} columns popover-reaction-item`,
          onClick: () => handleEmojiClick(payload, emoji, ele).then(() => {
            updateOpen(false);
            updateTrigger(false);
          }),
          children: emoji
        },
        emoji
      )) }, +i)),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", style: { paddingTop: 7, paddingBottom: 4 }, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "medium-12 columns", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("input", { name: "emojiSuggest", onFocus: () => updateFocus(true), onBlur: () => updateFocus(false) }) }) })
    ] })
  ] });
}
const reactionPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_8__.AutoloadPage("reactionPage", () => {
  const canUseReaction = jquery__WEBPACK_IMPORTED_MODULE_4___default()('[data-op="react"]').length > 0;
  jquery__WEBPACK_IMPORTED_MODULE_4___default()('[data-op="react"]').each((i, e) => {
    react_dom_client__WEBPACK_IMPORTED_MODULE_7__.createRoot(e).render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_2__.MantineProvider, { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Reaction, { payload: jquery__WEBPACK_IMPORTED_MODULE_4___default()(e).data("form"), ele: jquery__WEBPACK_IMPORTED_MODULE_4___default()(`.reactions[data-${jquery__WEBPACK_IMPORTED_MODULE_4___default()(e).data("form").nodeType}='${jquery__WEBPACK_IMPORTED_MODULE_4___default()(e).data("form").id}']`) }) }));
  });
  jquery__WEBPACK_IMPORTED_MODULE_4___default()(document).on("click", ".reaction", async (e) => {
    var _a, _b;
    if (!canUseReaction) {
      window.showSignInDialog();
      return;
    }
    const target = jquery__WEBPACK_IMPORTED_MODULE_4___default()(e.currentTarget);
    const res = await vj_utils__WEBPACK_IMPORTED_MODULE_9__.request.post("", {
      operation: "reaction",
      nodeType: target.parent().data("type"),
      id: target.parent().data(target.parent().data("type")),
      emoji: target.text().trim().split(" ")[0],
      reverse: target.hasClass("active")
    });
    renderReactions((_a = res.doc) == null ? void 0 : _a.react, (_b = res.sdoc) == null ? void 0 : _b.react, target.parent());
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (reactionPage);


/***/ },

/***/ "./components/dropdown/Dropdown.js"
/*!*****************************************!*\
  !*** ./components/dropdown/Dropdown.js ***!
  \*****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Dropdown)
/* harmony export */ });
/* harmony import */ var tether_drop__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! tether-drop */ "../../node_modules/tether-drop/dist/js/drop.js");
/* harmony import */ var tether_drop__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(tether_drop__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/breakpoints.json */ "./breakpoints.json");
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* provided dependency */ var $ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);




class Dropdown extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_2__["default"] {
  constructor($dom, options = {}) {
    if ($dom.attr("data-dropdown-trigger-desktop-only") !== void 0) {
      if (vj_utils__WEBPACK_IMPORTED_MODULE_3__.mediaQuery.isBelow(vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_1__.mobile)) {
        super(null);
        return;
      }
    }
    super($dom);
    this.options = {
      target: null,
      position: $dom.attr("data-dropdown-pos") || "bottom left",
      ...options
    };
    this.dropInstance = new (tether_drop__WEBPACK_IMPORTED_MODULE_0___default())({
      target: $dom[0],
      classes: `dropdown ${$dom.attr("data-dropdown-custom-class") || ""}`,
      content: this.options.target || $.find($dom.attr("data-dropdown-target"))[0],
      position: this.options.position,
      openOn: "hover",
      constrainToWindow: $dom.attr("data-dropdown-disabledconstrainToWindow") === void 0,
      constrainToScrollParent: false
    });
    this.dropInstance.on("open", this.onDropOpen.bind(this));
    this.dropInstance.on("close", this.onDropClose.bind(this));
  }
  detach() {
    super.detach();
    this.dropInstance.destroy();
  }
  onDropOpen() {
    $(this.dropInstance.drop).css("z-index", vj_utils__WEBPACK_IMPORTED_MODULE_3__.zIndexManager.getNext());
    this.$dom.trigger("vjDropdownShow");
  }
  onDropClose() {
    this.$dom.trigger("vjDropdownHide");
  }
}
__publicField(Dropdown, "DOMAttachKey", "vjDropdownInstance");
__publicField(Dropdown, "DOMAttachSelector", "[data-dropdown-target]");


/***/ },

/***/ "./components/dropdown/dropdown.page.ts"
/*!**********************************************!*\
  !*** ./components/dropdown/dropdown.page.ts ***!
  \**********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var _Dropdown__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Dropdown */ "./components/dropdown/Dropdown.js");


const dropdownPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__.AutoloadPage("dropdownPage", () => {
  _Dropdown__WEBPACK_IMPORTED_MODULE_1__["default"].registerLifeCycleHooks();
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (dropdownPage);


/***/ },

/***/ "./components/editor/cmeditor.page.ts"
/*!********************************************!*\
  !*** ./components/editor/cmeditor.page.ts ***!
  \********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var ___WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! . */ "./components/editor/index.tsx");
/* provided dependency */ var $ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");



function runSubstitute($container) {
  for (const language of ["markdown", "yaml", "json", "plain"]) {
    $container.find(`textarea[data-${language}]`).get().forEach((element) => {
      const config = { language };
      if ($(element).data("model")) config.model = $(element).data("model");
      ___WEBPACK_IMPORTED_MODULE_2__["default"].getOrConstruct($(element), config);
    });
  }
}
const cmEditorPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__.AutoloadPage("cmEditorPage", () => {
  runSubstitute($("body"));
  $(document).on("vjContentNew", async (e) => {
    await (0,vj_utils__WEBPACK_IMPORTED_MODULE_1__.delay)(0);
    runSubstitute($(e.target));
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (cmEditorPage);


/***/ },

/***/ "./components/editor/index.tsx"
/*!*************************************!*\
  !*** ./components/editor/index.tsx ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Editor)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var nanoid__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! nanoid */ "../../node_modules/nanoid/index.browser.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var _upload__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../upload */ "./components/upload.tsx");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);









class Editor extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_6__["default"] {
  constructor($dom, options = {}) {
    super($dom);
    __publicField(this, "options", options);
    __publicField(this, "model");
    __publicField(this, "editor");
    __publicField(this, "markdownEditor");
    __publicField(this, "valueCache");
    __publicField(this, "setMarkdownEditorValue");
    __publicField(this, "reactRoot");
    __publicField(this, "isValid");
    if (UserContext.preferredEditorType === "monaco") this.initMonaco();
    else if (options.language && options.language !== "markdown") this.initMonaco();
    else this.initMarkdownEditor();
  }
  async initMonaco() {
    const { load } = await Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! vj/components/monaco/loader */ "./components/monaco/loader.ts"));
    const {
      onChange,
      language = "markdown",
      theme = `vs-${(0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.getTheme)()}`,
      model = `file://model-${Math.random().toString(16)}`,
      autoResize = true,
      autoLayout = true,
      hide = [],
      lineNumbers = "on"
    } = this.options;
    const { monaco, registerAction } = await load([language]);
    const { $dom } = this;
    const hasFocus = $dom.is(":focus") || $dom.hasClass("autofocus");
    const origin = $dom.get(0);
    const ele = document.createElement("div");
    jquery__WEBPACK_IMPORTED_MODULE_1___default()(ele).width("100%").addClass("textbox");
    if (!autoResize && $dom.height()) jquery__WEBPACK_IMPORTED_MODULE_1___default()(ele).height($dom.height());
    $dom.hide();
    origin.parentElement.appendChild(ele);
    const value = this.options.value || $dom.val();
    this.model = typeof model === "string" ? monaco.editor.getModel(monaco.Uri.parse(model)) || monaco.editor.createModel(value, language === "auto" ? void 0 : language, monaco.Uri.parse(model)) : model;
    if (!this.options.model) this.model.setValue(value);
    const cfg = {
      theme,
      lineNumbers,
      glyphMargin: true,
      lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.On },
      model: this.model,
      minimap: { enabled: false },
      hideCursorInOverviewRuler: true,
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      fontFamily: UserContext.codeFontFamily,
      fontLigatures: "",
      unicodeHighlight: {
        ambiguousCharacters: language !== "markdown"
      }
    };
    if (autoLayout) cfg.automaticLayout = true;
    let prevHeight = 0;
    const updateEditorHeight = () => {
      var _a;
      const editorElement = this.editor.getDomNode();
      if (!editorElement) return;
      const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
      const lineCount = ((_a = this.editor.getModel()) == null ? void 0 : _a.getLineCount()) || 1;
      let height = this.editor.getTopForLineNumber(lineCount + 1) + lineHeight;
      if (prevHeight !== height) {
        if (window.innerHeight * 1.5 < height) {
          height = window.innerHeight;
          this.editor.updateOptions({
            scrollbar: {
              vertical: "auto",
              horizontal: "auto",
              handleMouseWheel: true
            }
          });
        } else {
          this.editor.updateOptions({
            scrollbar: {
              vertical: "hidden",
              horizontal: "hidden",
              handleMouseWheel: false
            }
          });
        }
        prevHeight = height;
        editorElement.style.height = `${height}px`;
        this.editor.layout();
      }
    };
    if (autoResize) {
      cfg.wordWrap = "bounded";
      cfg.scrollBeyondLastLine = false;
    }
    this.editor = monaco.editor.create(ele, cfg);
    if (hide.length) {
      const ranges = [];
      for (const text of hide) {
        const found = this.model.findMatches(text, true, false, true, "", true);
        ranges.push(...found.map((i) => i.range));
      }
      this.editor.deltaDecorations([], ranges.map((range) => ({ range, options: { inlineClassName: "decoration-hide" } })));
    }
    registerAction(this.editor, this.model, this.$dom);
    if (autoResize) {
      this.editor.onDidChangeModelDecorations(() => {
        updateEditorHeight();
        requestAnimationFrame(updateEditorHeight);
      });
    }
    this.editor.onDidChangeModelContent(() => {
      const val = this.editor.getValue({ lineEnding: "\n", preserveBOM: false });
      $dom.val(val);
      $dom.text(val);
      if (onChange) onChange(val);
    });
    this.isValid = true;
    if (hasFocus) this.focus();
    if (autoResize) updateEditorHeight();
    window.model = this.model;
    window.editor = this.editor;
  }
  async initMarkdownEditor() {
    const pagename = document.documentElement.getAttribute("data-page");
    const isProblemPage = ["problem_create", "problem_edit"].includes(pagename);
    const isProblemEdit = pagename === "problem_edit";
    const that = this;
    const { $dom } = this;
    const hasFocus = $dom.is(":focus") || $dom.hasClass("autofocus");
    const origin = $dom.get(0);
    const ele = document.createElement("div");
    const value = $dom.val();
    const { onChange } = this.options;
    const { MdEditor } = await Promise.all(/*! import() */[__webpack_require__.e("theme"), __webpack_require__.e("n.codemirror"), __webpack_require__.e("n.lezer"), __webpack_require__.e("n.katex"), __webpack_require__.e("n.timeago.js"), __webpack_require__.e("n.md-editor-rt"), __webpack_require__.e("n.entities"), __webpack_require__.e("vendors-node_modules_marijn_find-cluster-break_src_index_js-node_modules_vavt_cm-extension_di-76be3c"), __webpack_require__.e("vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76")]).then(__webpack_require__.bind(__webpack_require__, /*! ./mdeditor */ "./components/editor/mdeditor.ts"));
    const debouncedTrigger = (0,lodash__WEBPACK_IMPORTED_MODULE_2__.debounce)(() => {
      jquery__WEBPACK_IMPORTED_MODULE_1___default()(document.querySelector(".md-editor-preview")).trigger("vjContentNew");
    }, 500, { trailing: true });
    const renderCallback = (ref) => {
      this.markdownEditor = ref;
      setTimeout(debouncedTrigger, 200);
    };
    function EditorComponent() {
      var _a;
      const [val, setVal] = react__WEBPACK_IMPORTED_MODULE_4___default().useState(value);
      that.setMarkdownEditorValue = setVal;
      return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        MdEditor,
        {
          className: "textbox",
          autoFocus: hasFocus,
          codeTheme: "github",
          codeStyleReverse: false,
          ref: renderCallback,
          value: val,
          theme: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.getTheme)(),
          language: UserContext.viewLang === "zh" ? "zh-CN" : (_a = UserContext.viewLang) == null ? void 0 : _a.replace("_", "-"),
          noMermaid: true,
          noPrettier: true,
          noKatex: true,
          noHighlight: true,
          autoDetectCode: true,
          toolbarsExclude: [
            // 'bold',
            // 'underline',
            // 'italic',
            // '-',
            // 'strikeThrough',
            // 'title',
            "sub",
            "sup",
            // 'quote',
            // 'unorderedList',
            // 'orderedList',
            // 'task',
            // '-',
            // 'codeRow',
            // 'code',
            // 'link',
            // 'image',
            // 'table',
            "mermaid",
            // 'katex',
            // '-',
            // 'revoke',
            // 'next',
            "save",
            // '=',
            "pageFullscreen",
            "fullscreen",
            // 'preview',
            "previewOnly",
            "htmlPreview",
            // 'catalog',
            "github"
          ],
          onChange: (v) => {
            that.valueCache = v;
            setVal(v);
            $dom.val(v);
            $dom.text(v);
            onChange == null ? void 0 : onChange(v);
            setTimeout(debouncedTrigger, 100);
          },
          onUploadImg: async (files, callback) => {
            let ext;
            const matches = files[0].type.match(/^image\/(png|jpg|jpeg|gif)$/i);
            if (matches) {
              [, ext] = matches;
            } else if (files[0].type === "application/x-zip-compressed") {
              ext = "zip";
            }
            if (!ext) return (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("No Supported file type.");
            const filename = `${(0,nanoid__WEBPACK_IMPORTED_MODULE_3__.nanoid)()}.${ext}`;
            await (0,_upload__WEBPACK_IMPORTED_MODULE_8__["default"])(isProblemEdit ? "./files" : "/file", [files[0]], {
              type: isProblemEdit ? "additional_file" : void 0,
              filenameCallback: () => filename
            }).then(() => {
              callback([`${isProblemPage ? "file://" : `/file/${UserContext._id}/`}${filename}`]);
            }).catch(() => {
              callback([]);
            });
            return null;
          }
        }
      );
    }
    this.valueCache = value;
    this.reactRoot = react_dom_client__WEBPACK_IMPORTED_MODULE_5__.createRoot(ele);
    this.reactRoot.render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(EditorComponent, {}));
    $dom.hide();
    origin.parentElement.appendChild(ele);
    this.isValid = true;
    if (hasFocus) this.focus();
  }
  destroy() {
    var _a;
    this.detach();
    if (this.reactRoot) this.reactRoot.unmount();
    else if ((_a = this.editor) == null ? void 0 : _a.dispose) this.editor.dispose();
  }
  ensureValid() {
    if (!this.isValid) throw new Error("Editor is not loaded");
  }
  value(val) {
    var _a, _b, _c;
    this.ensureValid();
    if (typeof val === "string") {
      if (this.editor) return this.editor.setValue(val);
      (_a = this.setMarkdownEditorValue) == null ? void 0 : _a.call(this, val);
      (_c = (_b = this.markdownEditor) == null ? void 0 : _b.resetHistory) == null ? void 0 : _c.call(_b);
    }
    if (this.editor) return this.editor.getValue({ lineEnding: "\n", preserveBOM: false });
    return this.valueCache;
  }
  focus() {
    this.ensureValid();
    if (!this.editor || !this.model) return;
    this.editor.focus();
    const range = this.model.getFullModelRange();
    this.editor.setPosition({ lineNumber: range.endLineNumber, column: range.endColumn });
  }
}
__publicField(Editor, "DOMAttachKey", "vjEditorInstance");


/***/ },

/***/ "./components/editor/textareaHandler.ts"
/*!**********************************************!*\
  !*** ./components/editor/textareaHandler.ts ***!
  \**********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ TextareaHandler)
/* harmony export */ });
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./index */ "./components/editor/index.tsx");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);


class TextareaHandler extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_0__["default"] {
  getCmEditor() {
    return _index__WEBPACK_IMPORTED_MODULE_1__["default"].get(this.$dom);
  }
  isCmEditor() {
    const editor = this.getCmEditor();
    return !!(editor && editor.isValid);
  }
  val(...argv) {
    if (this.isCmEditor()) {
      return this.getCmEditor().value(...argv);
    }
    return this.$dom.val(...argv);
  }
  focus() {
    if (this.isCmEditor()) {
      this.getCmEditor().focus();
    }
    this.$dom.focus();
  }
}
__publicField(TextareaHandler, "DOMAttachKey", "vjTextareaHandlerInstance");


/***/ },

/***/ "./components/footer/footer.page.ts"
/*!******************************************!*\
  !*** ./components/footer/footer.page.ts ***!
  \******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/breakpoints.json */ "./breakpoints.json");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils_mediaQuery__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils/mediaQuery */ "./utils/mediaQuery.ts");
/* harmony import */ var vj_utils_slide__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils/slide */ "./utils/slide.ts");





const footerPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.AutoloadPage("footerPage", () => {
  if (!jquery__WEBPACK_IMPORTED_MODULE_0___default()(".footer").length) return;
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".footer__category.expandable > h1").on("click", async (ev) => {
    if (!(0,vj_utils_mediaQuery__WEBPACK_IMPORTED_MODULE_3__.isBelow)(vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_1__.mobile)) return;
    const $category = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).closest(".footer__category");
    const $list = $category.find(".footer__category__expander");
    if ($category.hasClass("animating")) return;
    $category.addClass("animating");
    if ($category.hasClass("expanded")) {
      $category.removeClass("expanded");
      await (0,vj_utils_slide__WEBPACK_IMPORTED_MODULE_4__.slideUp)($list, 300, { opacity: 1 }, { opacity: 0 });
    } else {
      $category.addClass("expanded");
      await (0,vj_utils_slide__WEBPACK_IMPORTED_MODULE_4__.slideDown)($list, 300, { opacity: 0 }, { opacity: 1 });
    }
    $category.removeClass("animating");
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (footerPage);


/***/ },

/***/ "./components/form/form.page.ts"
/*!**************************************!*\
  !*** ./components/form/form.page.ts ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");



const formPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("formPage", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjFormDisableUpdate", "input, select, textarea", (ev) => {
    const $input = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget);
    const $formItem = $input.closest(".form__item");
    $formItem[$input.prop("disabled") ? "addClass" : "removeClass"]("is--disabled");
  });
  const submitting = {};
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[type="submit"]', (ev) => {
    if (submitting[ev.currentTarget]) ev.preventDefault();
    submitting[ev.currentTarget] = true;
    (0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.delay)(5e3).then(() => {
      submitting[ev.currentTarget] = false;
    });
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (formPage);


/***/ },

/***/ "./components/form/multiSelectCheckbox.page.js"
/*!*****************************************************!*\
  !*** ./components/form/multiSelectCheckbox.page.js ***!
  \*****************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");


const lastSelectionByGroup = {};
function isInGroup(group) {
  return (idx, element) => element.getAttribute("data-checkbox-group") === group;
}
function onRangeRoleCheckboxClick(ev) {
  const $current = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget);
  const targetGroup = $current.attr("data-checkbox-group");
  const $targets = jquery__WEBPACK_IMPORTED_MODULE_0___default()('[type="checkbox"]').filter(isInGroup(targetGroup)).filter(":visible").filter(":not(:disabled)");
  if (ev.shiftKey && lastSelectionByGroup[targetGroup]) {
    const destCheck = lastSelectionByGroup[targetGroup].prop("checked");
    const from = $targets.index(lastSelectionByGroup[targetGroup]);
    const to = $targets.index($current);
    const start = Math.min(from, to);
    const end = Math.max(from, to) + 1;
    $targets.slice(start, end).prop("checked", destCheck);
  }
  lastSelectionByGroup[targetGroup] = $current;
}
function onToggleRoleCheckboxClick(ev) {
  const $current = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget);
  const targetGroup = $current.attr("data-checkbox-toggle");
  const $targets = jquery__WEBPACK_IMPORTED_MODULE_0___default()('[type="checkbox"]').filter(isInGroup(targetGroup)).filter(":visible").filter(":not(:disabled)");
  const destCheck = $current.prop("checked");
  $targets.prop("checked", destCheck);
}
const multiSelectCheckboxPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("multiSelectCheckboxPage", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", "[data-checkbox-range]", onRangeRoleCheckboxClick);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", "[data-checkbox-toggle]", onToggleRoleCheckboxClick);
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (multiSelectCheckboxPage);


/***/ },

/***/ "./components/form/textbox.page.ts"
/*!*****************************************!*\
  !*** ./components/form/textbox.page.ts ***!
  \*****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");


const textboxPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("textboxPage", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("focusin", ".textbox.material input", (ev) => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).parent().addClass("focus");
  });
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("focusout", ".textbox.material input", (ev) => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).parent().removeClass("focus");
  });
  const $focusElement = jquery__WEBPACK_IMPORTED_MODULE_0___default()(document.activeElement);
  if ($focusElement.prop("tagName") === "INPUT" && $focusElement.parent().is(".textbox.material")) {
    $focusElement.focusin();
  }
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (textboxPage);


/***/ },

/***/ "./components/highlighter/highlighter.page.ts"
/*!****************************************************!*\
  !*** ./components/highlighter/highlighter.page.ts ***!
  \****************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




const highlighterPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.AutoloadPage("highlighterPage", () => {
  Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! ./prismjs */ "./components/highlighter/prismjs.js")).then(({ default: prismjs }) => {
    function runHighlight($container) {
      $container.find("pre code").get().forEach((code) => {
        const language = (jquery__WEBPACK_IMPORTED_MODULE_0___default()(code).attr("class") || "").trim();
        if (language.includes("line-numbers")) jquery__WEBPACK_IMPORTED_MODULE_0___default()(code).parent().addClass("line-numbers");
        const m = language.match(/language-([a-z0-9]+)(\|[\d,-]+)/);
        if (m == null ? void 0 : m[2]) {
          jquery__WEBPACK_IMPORTED_MODULE_0___default()(code).parent().attr("data-line", m[2].substring(1));
          jquery__WEBPACK_IMPORTED_MODULE_0___default()(code).attr("class", `language-${m[1]}`);
        }
      });
      prismjs.highlightBlocks($container);
      $container.find("pre code").get().forEach((code) => {
        const $code = jquery__WEBPACK_IMPORTED_MODULE_0___default()(code);
        const $root = $code.parent().parent();
        const $typo = $code.closest(".richmedia");
        const language = (jquery__WEBPACK_IMPORTED_MODULE_0___default()(code).attr("class") || "").trim();
        const m = language.match(/language-input([0-9]+)/);
        if (m == null ? void 0 : m[1]) {
          const id = +m[1];
          if (Number.isSafeInteger(id)) {
            const $output = ($typo.length ? $typo : $container).find(`pre.language-output${id}`);
            if ($output.length) {
              const $c = jquery__WEBPACK_IMPORTED_MODULE_0___default()(document.createElement("div")).addClass("row");
              $root.after($c);
              $root.prepend(jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.tpl)`<h2>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Sample Input")} ${id}</h2>`)).addClass("medium-6 columns sample").appendTo($c);
              $output.parent().prepend(jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.tpl)`<h2>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Sample Output")} ${id}</h2>`)).addClass("medium-6 columns sample").appendTo($c);
            }
            if ($root.find(".scratchpad-fill-button").length) return;
            const $toolbar = $root.find(".toolbar");
            const $button = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.tpl)`
              <div class="toolbar-item scratchpad-fill-button">
                <a href="javascript:;">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Fill to Pretest")}</a>
              </div>
            `);
            $button.on("click", (e) => {
              const store = window.store;
              if (!store) return;
              e.preventDefault();
              try {
                store.dispatch({
                  type: "SCRATCHPAD_PRETEST_DATA_CHANGE",
                  payload: {
                    type: "input",
                    value: $code.text()
                  }
                });
                vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Input filled to pretest!"), 2e3);
              } catch (err) {
                vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Failed to fill input"));
              }
            });
            $toolbar.append($button);
          }
        }
      });
    }
    runHighlight(jquery__WEBPACK_IMPORTED_MODULE_0___default()("body"));
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjContentNew", (e) => runHighlight(jquery__WEBPACK_IMPORTED_MODULE_0___default()(e.target)));
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (highlighterPage);


/***/ },

/***/ "./components/highlighter/meta.js"
/*!****************************************!*\
  !*** ./components/highlighter/meta.js ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ([
  { name: "C", ext: ["c", "h"] },
  { name: "C++", ext: ["cpp", "c++", "cc", "cxx", "hpp", "h++", "hh", "hxx"] },
  { name: "Go", ext: ["go"] },
  { name: "Haskell", ext: ["hs"] },
  { name: "Java", ext: ["java"] },
  { name: "JavaScript", ext: ["js"] },
  { name: "Pascal", ext: ["p", "pas"] },
  { name: "PHP", ext: ["php", "php3", "php4", "php5", "php7", "phtml"] },
  { name: "Python", ext: ["BUILD", "bzl", "py", "pyw"] },
  { name: "Rust", ext: ["rs"] }
]);


/***/ },

/***/ "./components/highlighter/prismjs.js"
/*!*******************************************!*\
  !*** ./components/highlighter/prismjs.js ***!
  \*******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var prismjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! prismjs */ "../../node_modules/prismjs/prism.js");
/* harmony import */ var prismjs__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(prismjs__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var prismjs_plugins_toolbar_prism_toolbar__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! prismjs/plugins/toolbar/prism-toolbar */ "../../node_modules/prismjs/plugins/toolbar/prism-toolbar.js");
/* harmony import */ var prismjs_plugins_toolbar_prism_toolbar__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(prismjs_plugins_toolbar_prism_toolbar__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var prismjs_plugins_toolbar_prism_toolbar_css__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! prismjs/plugins/toolbar/prism-toolbar.css */ "../../node_modules/prismjs/plugins/toolbar/prism-toolbar.css");
/* harmony import */ var prismjs_plugins_line_numbers_prism_line_numbers__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! prismjs/plugins/line-numbers/prism-line-numbers */ "../../node_modules/prismjs/plugins/line-numbers/prism-line-numbers.js");
/* harmony import */ var prismjs_plugins_line_numbers_prism_line_numbers__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(prismjs_plugins_line_numbers_prism_line_numbers__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var prismjs_plugins_line_numbers_prism_line_numbers_css__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! prismjs/plugins/line-numbers/prism-line-numbers.css */ "../../node_modules/prismjs/plugins/line-numbers/prism-line-numbers.css");
/* harmony import */ var prismjs_plugins_line_highlight_prism_line_highlight__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! prismjs/plugins/line-highlight/prism-line-highlight */ "../../node_modules/prismjs/plugins/line-highlight/prism-line-highlight.js");
/* harmony import */ var prismjs_plugins_line_highlight_prism_line_highlight__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(prismjs_plugins_line_highlight_prism_line_highlight__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var clipboard__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! clipboard */ "../../node_modules/clipboard/dist/clipboard.js");
/* harmony import */ var clipboard__WEBPACK_IMPORTED_MODULE_6___default = /*#__PURE__*/__webpack_require__.n(clipboard__WEBPACK_IMPORTED_MODULE_6__);
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_7___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_7__);
/* harmony import */ var prismjs_components__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! prismjs/components */ "../../node_modules/prismjs/components.js");
/* harmony import */ var prismjs_components__WEBPACK_IMPORTED_MODULE_8___default = /*#__PURE__*/__webpack_require__.n(prismjs_components__WEBPACK_IMPORTED_MODULE_8__);
/* harmony import */ var prismjs_dependencies__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! prismjs/dependencies */ "../../node_modules/prismjs/dependencies.js");
/* harmony import */ var prismjs_dependencies__WEBPACK_IMPORTED_MODULE_9___default = /*#__PURE__*/__webpack_require__.n(prismjs_dependencies__WEBPACK_IMPORTED_MODULE_9__);
/* harmony import */ var vj_components_notification_index__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! vj/components/notification/index */ "./components/notification/index.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var _meta__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ./meta */ "./components/highlighter/meta.js");













const files = __webpack_require__("../../node_modules/prismjs/components sync recursive prism-[a-z0-9-]+\\.js");
const loadedLanguages = /* @__PURE__ */ new Set();
function loadLanguages() {
  const languages = Object.keys((prismjs_components__WEBPACK_IMPORTED_MODULE_8___default().languages)).filter((l) => l !== "meta");
  const loaded = [...loadedLanguages, ...Object.keys((prismjs__WEBPACK_IMPORTED_MODULE_0___default().languages))];
  prismjs_dependencies__WEBPACK_IMPORTED_MODULE_9___default()((prismjs_components__WEBPACK_IMPORTED_MODULE_8___default()), languages, loaded).load((lang) => {
    files(`./prism-${lang}.js`);
    loadedLanguages.add(lang);
  });
}
const languageExtMap = {};
loadLanguages();
_meta__WEBPACK_IMPORTED_MODULE_12__["default"].forEach((meta) => {
  for (let i = 0; i < meta.ext.length; ++i) {
    if ((prismjs__WEBPACK_IMPORTED_MODULE_0___default().languages)[meta.ext[i]] !== void 0) {
      meta.target = meta.ext[i];
      break;
    }
  }
  meta.ext.forEach((ext) => {
    languageExtMap[ext] = meta.target;
  });
});
prismjs__WEBPACK_IMPORTED_MODULE_0___default().plugins.toolbar.registerButton("copy-to-clipboard", (env) => {
  const linkCopy = document.createElement("a");
  linkCopy.href = "javascript:;";
  linkCopy.textContent = "Copy";
  const clip = new (clipboard__WEBPACK_IMPORTED_MODULE_6___default())(linkCopy, { text: () => env.code });
  clip.on("success", () => {
    vj_components_notification_index__WEBPACK_IMPORTED_MODULE_10__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_11__.i18n)("Content copied to clipboard!"), 1e3);
  });
  clip.on("error", () => {
    vj_components_notification_index__WEBPACK_IMPORTED_MODULE_10__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_11__.i18n)("Copy failed :("));
  });
  return linkCopy;
});
const invisibles = {
  tab: /\t/,
  crlf: /\r\n/,
  lf: /\n/,
  cr: /\r/,
  space: / /
};
function addInvisibles(grammar) {
  if (!grammar || grammar.tab) return;
  for (const name in invisibles) {
    if (Object.hasOwn(invisibles, name)) {
      grammar[name] = invisibles[name];
    }
  }
  for (const name in grammar) {
    if (Object.hasOwn(grammar, name) && !invisibles[name]) {
      if (name === "rest") addInvisibles(grammar.rest);
      else handlerInvisiblesToken(grammar, name);
    }
  }
}
function handlerInvisiblesToken(tokens, name) {
  const value = tokens[name];
  const type = prismjs__WEBPACK_IMPORTED_MODULE_0___default().util.type(value);
  if (type === "RegExp") {
    const inside = {};
    tokens[name] = { pattern: value, inside };
    addInvisibles(inside);
  } else if (type === "Array") {
    for (let i = 0, l = value.length; i < l; i++) handlerInvisiblesToken(value, i);
  } else {
    value.inside || (value.inside = {});
    addInvisibles(value.inside);
  }
}
prismjs__WEBPACK_IMPORTED_MODULE_0___default().hooks.add("before-highlight", (env) => {
  if (UserContext.showInvisibleChar) addInvisibles(env.grammar);
});
const prismjsApiWrap = {
  highlightBlocks: ($dom) => {
    $dom.find("pre code").get().forEach((code) => {
      const $code = jquery__WEBPACK_IMPORTED_MODULE_7___default()(code);
      const $pre = $code.parent();
      $pre.addClass("syntax-hl");
      const language = (jquery__WEBPACK_IMPORTED_MODULE_7___default()(code).attr("class") || "").trim();
      const m = language.match(/language-([a-z]+)/);
      if (m && m[1]) {
        const languageName = m[1].toLowerCase();
        if (languageExtMap[languageName]) {
          jquery__WEBPACK_IMPORTED_MODULE_7___default()(code).attr("class", `language-${languageExtMap[languageName]}`);
        }
      }
      prismjs__WEBPACK_IMPORTED_MODULE_0___default().highlightElement(code);
    });
  },
  highlight: (text, grammar, language) => prismjs__WEBPACK_IMPORTED_MODULE_0___default().highlight(text, grammar, language),
  Prism: (prismjs__WEBPACK_IMPORTED_MODULE_0___default())
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (prismjsApiWrap);


/***/ },

/***/ "./components/hint.ts"
/*!****************************!*\
  !*** ./components/hint.ts ***!
  \****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ createHint)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");



function createHint(message, element) {
  if ((0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.i18n)(message) === message || !element) return;
  const a = document.createElement("a");
  a.setAttribute("href", "javascript:;");
  const span = document.createElement("span");
  span.setAttribute("class", "icon icon-help");
  a.appendChild(span);
  a.onclick = () => {
    new vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.InfoDialog({
      cancelByClickingBack: false,
      $body: vj_utils__WEBPACK_IMPORTED_MODULE_2__.tpl.typoMsg((0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.i18n)(message), true)
    }).open();
  };
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(element).append(a);
}


/***/ },

/***/ "./components/hitokoto/index.page.js"
/*!*******************************************!*\
  !*** ./components/hitokoto/index.page.js ***!
  \*******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");



/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.NamedPage("homepage", () => {
  function getHitokoto($containers) {
    $containers.get().forEach((container) => {
      vj_utils__WEBPACK_IMPORTED_MODULE_2__.request.get("https://v1.hitokoto.cn?c=a&c=b&c=c&c=d&c=e&c=f").then((hitokoto) => {
        const dom = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.tpl)`<p>${hitokoto.hitokoto}</p>`);
        dom.appendTo(container);
      }).catch((e) => {
        console.error(e);
        const dom = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.tpl)`<p>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.i18n)("Cannot get hitokoto.")}</p>`);
        dom.appendTo(container);
      });
    });
  }
  if (jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="hitokoto"]')) getHitokoto(jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="hitokoto"]'));
}));


/***/ },

/***/ "./components/hotkey/hotkey.page.js"
/*!******************************************!*\
  !*** ./components/hotkey/hotkey.page.js ***!
  \******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");



const KEY_MAP = {
  10: "enter",
  13: "enter",
  27: "esc",
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  112: "f1",
  113: "f2",
  114: "f3",
  115: "f4",
  116: "f5",
  117: "f6",
  118: "f7",
  119: "f8",
  120: "f9",
  121: "f10",
  122: "f11",
  123: "f12"
};
function isHotkeyMatch(sortedHotkeyArr, hotkeyStr) {
  const hotkeyDefined = hotkeyStr.toLowerCase().split("+");
  return lodash__WEBPACK_IMPORTED_MODULE_1___default().isEqual(sortedHotkeyArr, hotkeyDefined.sort());
}
let triggered = false;
function testElementHotkey(hotkey, $element, attr) {
  if (!$element.is(":visible")) return;
  String($element.attr(attr)).split(",").forEach((singleDef) => {
    const [defStr, trigger] = singleDef.split(":");
    if (isHotkeyMatch(hotkey, defStr)) {
      triggered = true;
      switch (trigger) {
        case "submit":
          $element.closest("form").trigger("submit");
          break;
        case void 0:
          $element.trigger("click");
          break;
        default:
          $element.trigger(trigger);
          break;
      }
    }
  });
}
const hotkeyPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.AutoloadPage("hotkeyPage", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("keydown", (ev) => {
    const hotkey = ["alt", "ctrl", "shift"].filter((modifyKey) => ev[`${modifyKey}Key`]);
    if (ev.metaKey && !ev.ctrlKey) {
      hotkey.push("ctrl");
    }
    if (KEY_MAP[ev.which] !== void 0) {
      hotkey.push(KEY_MAP[ev.which]);
    } else {
      hotkey.push(String.fromCharCode(ev.which).toLowerCase());
    }
    hotkey.sort();
    triggered = false;
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("[data-global-hotkey]").get().forEach((element) => {
      testElementHotkey(hotkey, jquery__WEBPACK_IMPORTED_MODULE_0___default()(element), "data-global-hotkey");
    });
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.target).parents("[data-hotkey]").get().forEach((element) => {
      testElementHotkey(hotkey, jquery__WEBPACK_IMPORTED_MODULE_0___default()(element), "data-hotkey");
    });
    if (triggered) ev.preventDefault();
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (hotkeyPage);


/***/ },

/***/ "./components/katex/katex.page.js"
/*!****************************************!*\
  !*** ./components/katex/katex.page.js ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");


const katexPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("katexPage", () => {
  __webpack_require__.e(/*! import() */ "n.katex").then(__webpack_require__.bind(__webpack_require__, /*! katex/contrib/auto-render/auto-render */ "../../node_modules/katex/contrib/auto-render/auto-render.ts")).then(({ default: katex }) => {
    function runKatex($containers) {
      $containers.get().forEach((container) => katex(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\begin{equation}", right: "\\end{equation}", display: true },
          { left: "\\begin{align}", right: "\\end{align}", display: true },
          { left: "\\begin{alignat}", right: "\\end{alignat}", display: true },
          { left: "\\begin{gather}", right: "\\end{gather}", display: true },
          { left: "\\begin{CD}", right: "\\end{CD}", display: true }
        ]
      }));
    }
    runKatex(jquery__WEBPACK_IMPORTED_MODULE_0___default()(".richmedia"));
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjContentNew", (e) => runKatex(jquery__WEBPACK_IMPORTED_MODULE_0___default()(e.target).find(".richmedia").addBack(".richmedia")));
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (katexPage);


/***/ },

/***/ "./components/languageselect.tsx"
/*!***************************************!*\
  !*** ./components/languageselect.tsx ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   renderLanguageSelect: () => (/* binding */ renderLanguageSelect)
/* harmony export */ });
/* unused harmony export default */
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");





function LanguageSelect({
  fieldSelector,
  firstLoadMain,
  firstLoadSub,
  availableLangs,
  mainLangs
}) {
  const [main, setMain] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(firstLoadMain);
  const [sub, setSub] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(firstLoadSub);
  const options = {};
  for (const key in availableLangs) {
    if (key.startsWith(`${main}.`)) options[key.split(".")[1]] = availableLangs[key].display;
  }
  react__WEBPACK_IMPORTED_MODULE_2___default().useEffect(() => {
    jquery__WEBPACK_IMPORTED_MODULE_1___default()(fieldSelector).val(sub ? `${main}.${sub}` : main);
  }, [main, sub]);
  react__WEBPACK_IMPORTED_MODULE_2___default().useEffect(() => {
    const subselections = Object.keys(options).length;
    if (options[sub]) return;
    if (!subselections) setSub("");
    setSub(Object.keys(options)[0]);
  }, [main]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
    (Object.keys(mainLangs).length > 1 || Object.keys(options).length === 1) && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "medium-5 columns form__item end", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
      (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.i18n)("Code language"),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "select-container", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("select", { value: main, onChange: (ev) => setMain(ev.target.value), className: "select", children: Object.keys(mainLangs).map((key) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("option", { value: key, children: mainLangs[key] }, key)) }) })
    ] }) }),
    (Object.keys(options).length > 1 || Object.keys(mainLangs).length === 1) && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "medium-5 columns form__item end", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
      (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.i18n)("Code language"),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "select-container", children: Object.keys(options).length ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("select", { value: sub, onChange: (ev) => setSub(ev.target.value), className: "select", children: Object.keys(options).map((i) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("option", { value: i, children: options[i] }, i)) }) : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("select", { value: main, onChange: (ev) => setMain(ev.target.value), className: "select", children: Object.keys(mainLangs).map((i) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("option", { value: i, children: mainLangs[i] }, i)) }) })
    ] }) })
  ] });
}
function renderLanguageSelect(onElement, fieldSelector, availableLangs, mainLangs, preferences) {
  const [firstLoadMain, firstLoadSub] = (() => {
    for (const preference of preferences) {
      if (preference.includes(".")) {
        const [l, r] = preference.split(".");
        if (availableLangs[preference]) return [l, r];
        if (availableLangs[l]) return [l, ""];
      } else if (availableLangs[preference]) {
        return [preference, ""];
      }
    }
    const selected = Object.keys(mainLangs)[0];
    for (const key in availableLangs) {
      if (key.startsWith(`${selected}.`)) return [selected, key.split(".")[1]];
    }
    return [selected, ""];
  })();
  react_dom_client__WEBPACK_IMPORTED_MODULE_3__.createRoot(onElement).render(
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      LanguageSelect,
      {
        fieldSelector,
        mainLangs,
        availableLangs,
        firstLoadMain,
        firstLoadSub
      }
    )
  );
}


/***/ },

/***/ "./components/mantine.page.tsx"
/*!*************************************!*\
  !*** ./components/mantine.page.tsx ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   theme: () => (/* binding */ theme)
/* harmony export */ });
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/MantineProvider/create-theme/create-theme.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/components/Notification/Notification.mjs");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");


const colorWhite = {
  color: "var(--mantine-color-white)"
};
const theme = (0,_mantine_core__WEBPACK_IMPORTED_MODULE_0__.createTheme)({
  components: {
    Notification: _mantine_core__WEBPACK_IMPORTED_MODULE_1__.Notification.extend({
      classNames: {
        closeButton: "mantine-notifications-close-button"
      },
      styles: {
        root: {
          backgroundColor: "var(--notification-color, var(--mantine-primary-color-filled))",
          paddingInlineStart: "var(--mantine-spacing-xs)"
        },
        title: {
          ...colorWhite,
          fontSize: "var(--mantine-font-size-md)"
        },
        icon: {
          fontSize: "24px",
          marginInlineEnd: "var(--mantine-spacing-xs)"
        },
        description: colorWhite,
        closeButton: colorWhite
      }
    })
  }
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.AutoloadPage("mantine", null, () => {
  localStorage.setItem(
    "mantine-color-scheme-value",
    document.documentElement.className.includes("theme--dark") ? "dark" : "light"
  );
}));


/***/ },

/***/ "./components/marker/Marker.js"
/*!*************************************!*\
  !*** ./components/marker/Marker.js ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_components_tooltip_Tooltip__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/tooltip/Tooltip */ "./components/tooltip/Tooltip.js");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




const MARKER_ID = `marker_${Math.floor(Math.random() * 16777215).toString(16)}`;
const MARKER_OFFSET = 20;
const MARKER_MAX_DISTANCE = 60;
let markerInstance = null;
function distanceToRect(px, py, rect) {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const dx = Math.max(Math.abs(px - cx) - (rect.right - rect.left) / 2, 0);
  const dy = Math.max(Math.abs(py - cy) - (rect.bottom - rect.top) / 2, 0);
  return Math.sqrt(dx * dx + dy * dy);
}
class Marker {
  static exists() {
    return markerInstance && document.getElementById(MARKER_ID);
  }
  constructor() {
    if (Marker.exists()) return markerInstance;
    if (markerInstance) {
      markerInstance.destroy();
    }
    this.$dom = jquery__WEBPACK_IMPORTED_MODULE_0___default()(`
      <div class="marker" id="${MARKER_ID}"><div class="marker__toolbar">
        <div class="marker__action" data-color="#ffff00" data-tooltip="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Mark Yellow")}"><span class="marker__icon icon-yellow"></span></div>
        <div class="marker__action" data-color="#47ff6f" data-tooltip="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Mark Green")}"><span class="marker__icon icon-green"></span></div>
        <div class="marker__action" data-color="#ff3b30" data-tooltip="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Mark Red")}"><span class="marker__icon icon-red"></span></div>
        <div class="marker__action" data-color="transparent" data-tooltip="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Clear Marks")}"><span class="icon icon-erase"></span></div>
      </div></div>
    `).appendTo("body");
    this.$dom.find(".marker__toolbar").on("click", ".marker__action", this.onMarkerActionClick.bind(this));
    this.$dom.on("mousedown", this.onMarkerMouseDown.bind(this));
    this.isOpen = false;
    this.bindedHandlers = false;
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onScroll = lodash__WEBPACK_IMPORTED_MODULE_1___default().throttle(this.onScroll.bind(this), 50);
    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = lodash__WEBPACK_IMPORTED_MODULE_1___default().throttle(this.onMouseMove.bind(this), 50);
    markerInstance = this;
  }
  markSelection(color) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    this.$container.attr("contentEditable", true);
    if (range) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (!document.execCommand("HiliteColor", false, color)) {
      document.execCommand("BackColor", false, color);
    }
    this.$container.removeAttr("contentEditable");
    if (range) {
      selection.removeAllRanges();
    }
  }
  showAtPosition($container, x, y) {
    this.$container = $container;
    this.$dom.css({
      display: "block",
      opacity: 0
    });
    const rect = this.$dom[0].getBoundingClientRect();
    this.$dom.css({
      left: x + MARKER_OFFSET,
      top: y - (rect.bottom - rect.top) - MARKER_OFFSET
    });
    this.isOpen = true;
    this.$dom.addClass("open");
    this.updateMarkerOpacity(x, y);
    this.bindEventHandlersForClosing();
  }
  async close() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.closeTooltipsImmediately();
    this.unbindEventHandlers();
    this.$dom.css({ opacity: 0 }).removeClass("open");
    await (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.delay)(200);
    if (!this.isOpen) {
      this.$dom.hide();
    }
  }
  closeTooltipsImmediately() {
    const $elements = this.$dom.find("[data-tooltip]");
    $elements.get().forEach((element) => {
      const $el = jquery__WEBPACK_IMPORTED_MODULE_0___default()(element);
      const tooltipInstance = vj_components_tooltip_Tooltip__WEBPACK_IMPORTED_MODULE_2__["default"].get($el);
      if (tooltipInstance) {
        tooltipInstance.detach();
      }
    });
  }
  bindEventHandlersForClosing() {
    if (this.bindedHandlers) {
      return;
    }
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("keydown", this._onKeyDown);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(window).on("scroll", this._onScroll);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("mousedown", this._onMouseDown);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("mousemove", this._onMouseMove);
    this.bindedHandlers = true;
  }
  unbindEventHandlers() {
    if (!this.bindedHandlers) {
      return;
    }
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).off("keydown", this._onKeyDown);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(window).off("scroll", this._onScroll);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).off("mousedown", this._onMouseDown);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).off("mousemove", this._onMouseMove);
    this.bindedHandlers = false;
  }
  onMarkerActionClick(ev) {
    const color = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).attr("data-color");
    this.markSelection(color);
    this.close();
  }
  onMarkerMouseDown(ev) {
    ev.stopPropagation();
    ev.preventDefault();
  }
  onKeyDown() {
    this.close();
  }
  onScroll() {
    this.close();
  }
  onMouseMove(ev) {
    this.updateMarkerOpacity(ev.clientX, ev.clientY);
  }
  onMouseDown() {
    this.close();
  }
  updateMarkerOpacity(x, y) {
    const markerRect = this.$dom[0].getBoundingClientRect();
    const distance = distanceToRect(x, y, markerRect);
    if (distance > MARKER_MAX_DISTANCE) {
      this.close();
      return;
    }
    this.$dom.css("opacity", 1 - distance / MARKER_MAX_DISTANCE);
  }
  destroy() {
    this.close();
    this.$dom.remove();
    markerInstance = null;
  }
}
const MarkerInterface = {
  close() {
    if (!markerInstance) {
      return;
    }
    markerInstance.close();
  },
  showAtPosition($container, x, y) {
    const marker = new Marker();
    marker.showAtPosition($container, x, y);
  }
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (MarkerInterface);


/***/ },

/***/ "./components/marker/MarkerReactive.js"
/*!*********************************************!*\
  !*** ./components/marker/MarkerReactive.js ***!
  \*********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ MarkerReactive)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var _Marker__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Marker */ "./components/marker/Marker.js");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);




const _MarkerReactive = class _MarkerReactive extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_1__["default"] {
  static initFromDOM($dom) {
    return _MarkerReactive.getOrConstruct($dom);
  }
  static initAll() {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("[data-marker-enabled]").get().forEach((dom) => _MarkerReactive.initFromDOM(jquery__WEBPACK_IMPORTED_MODULE_0___default()(dom)));
  }
  constructor($target) {
    super($target);
    this._onMouseUp = this.onMouseUp.bind(this);
    this.bindEventHandlers();
  }
  bindEventHandlers() {
    this.$dom.on("mouseup", this._onMouseUp);
  }
  unbindEventHandlers() {
    this.$dom.off("mouseup", this._onMouseUp);
  }
  async onMouseUp(ev) {
    await (0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.delay)(1);
    if (!window.getSelection) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      return;
    }
    _Marker__WEBPACK_IMPORTED_MODULE_3__["default"].showAtPosition(this.$dom, ev.clientX, ev.clientY);
  }
  detach() {
    if (this.detached) {
      return;
    }
    this.unbindEventHandlers();
    _Marker__WEBPACK_IMPORTED_MODULE_3__["default"].close();
    super.detach();
  }
};
__publicField(_MarkerReactive, "DOMAttachKey", "vjMarkerReactiveInstance");
let MarkerReactive = _MarkerReactive;



/***/ },

/***/ "./components/marker/marker.page.js"
/*!******************************************!*\
  !*** ./components/marker/marker.page.js ***!
  \******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var _MarkerReactive__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./MarkerReactive */ "./components/marker/MarkerReactive.js");


const markerPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__.AutoloadPage("markerPage", () => {
  _MarkerReactive__WEBPACK_IMPORTED_MODULE_1__["default"].initAll();
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (markerPage);


/***/ },

/***/ "./components/media/media.page.js"
/*!****************************************!*\
  !*** ./components/media/media.page.js ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");



/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("media", async () => {
  async function parseMedia($dom = jquery__WEBPACK_IMPORTED_MODULE_0___default()(document.body)) {
    const items = [];
    const resolvers = [];
    const users = $dom.find("div[data-user]");
    const resolve = (ele, item) => {
      items.push(item);
      resolvers.push((html) => html && jquery__WEBPACK_IMPORTED_MODULE_0___default()(ele).replaceWith(jquery__WEBPACK_IMPORTED_MODULE_0___default()(html)));
    };
    users.get().forEach((ele) => resolve(ele, { type: "user", id: +jquery__WEBPACK_IMPORTED_MODULE_0___default()(ele).text() }));
    $dom.find(".typo").addBack(".typo").get().forEach((el) => {
      if (el.className.includes("no-media")) return;
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(el).find("a[href]").get().forEach((ele) => {
        if (jquery__WEBPACK_IMPORTED_MODULE_0___default()(ele).parent().hasClass("user-profile-link")) return;
        let target = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ele).attr("href");
        let { domainId } = UiContext;
        if (target.startsWith(UiContext.url_prefix)) {
          target.replace(UiContext.url_prefix, "");
          if (!target.startsWith("/")) target = `/${target}`;
        }
        if (!target.startsWith("/") || target.startsWith("//")) return;
        if (target.startsWith("/d/")) {
          const [, , domain, ...extra2] = target.split("/");
          domainId = domain;
          target = `/${extra2.join("/")}`;
        }
        const [, category, data, extra] = target.split("/");
        if (!data) return;
        if (category === "user" && Number.isInteger(+data) && !extra) resolve(ele, { type: "user", id: +data });
        if (category === "p" && !extra) resolve(ele, { type: "problem", id: data, domainId });
        if (category === "contest" && !extra) resolve(ele, { type: "contest", id: data, domainId });
        if (category === "homework" && !extra) resolve(ele, { type: "homework", id: data, domainId });
      });
    });
    if (!items.length) return;
    const res = await vj_utils__WEBPACK_IMPORTED_MODULE_2__.request.post(`/d/${UiContext.domainId}/media`, { items });
    for (let i = 0; i < res.length; i++) resolvers[i](res[i]);
  }
  await parseMedia();
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjContentNew", (e) => parseMedia(jquery__WEBPACK_IMPORTED_MODULE_0___default()(e.target)));
}));


/***/ },

/***/ "./components/menu/menu-heading.page.js"
/*!**********************************************!*\
  !*** ./components/menu/menu-heading.page.js ***!
  \**********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");



const menuHeadingPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("menuHeadingPage", null, () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()("[data-heading-extract-to]").get().forEach((container) => {
    const $container = jquery__WEBPACK_IMPORTED_MODULE_0___default()(container);
    const $target = jquery__WEBPACK_IMPORTED_MODULE_0___default()("body").find($container.attr("data-heading-extract-to"));
    if ($target.length === 0) return;
    let $menu = $target.children(".menu");
    if ($menu.length === 0) {
      $menu = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.tpl)`<ul class="menu collapsed"></ul>`).appendTo($target);
      $target.children(".menu__link").addClass("expandable");
    }
    $container.find("[data-heading]").get().forEach((heading) => {
      const $heading = jquery__WEBPACK_IMPORTED_MODULE_0___default()(heading);
      jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.tpl)`
        <li class="menu__item">
          <a class="menu__link" href="#${$heading.attr("id") || ""}">
            ${$heading.text()}
          </a>
        </li>
      `).appendTo($menu);
    });
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (menuHeadingPage);


/***/ },

/***/ "./components/menu/menu.page.js"
/*!**************************************!*\
  !*** ./components/menu/menu.page.js ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");



function expandMenu($menu) {
  (0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.slideDown)($menu, 500, { opacity: 0 }, { opacity: 1 });
}
async function expandAllMenus() {
  await (0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.delay)(200);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".menu.collapsed").get().forEach((menu) => expandMenu(jquery__WEBPACK_IMPORTED_MODULE_0___default()(menu)));
}
const menuPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("menuPage", () => {
  expandAllMenus();
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (menuPage);


/***/ },

/***/ "./components/monaco/loader.ts"
/*!*************************************!*\
  !*** ./components/monaco/loader.ts ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   legacyLoadExternalModule: () => (/* binding */ legacyLoadExternalModule),
/* harmony export */   load: () => (/* binding */ load)
/* harmony export */ });
/* harmony import */ var _lazyload__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../lazyload */ "./lazyload.ts");

let loaded;
const val = {};
async function legacyLoadExternalModule(target) {
  if (val[target]) return val[target];
  const ele = document.createElement("script");
  ele.src = target;
  await new Promise((resolve, reject) => {
    ele.onload = resolve;
    ele.onerror = reject;
    document.head.appendChild(ele);
  });
  val[target] = window.exports;
  return val[target];
}
const loaders = {
  i18n: async () => {
    const { setLocaleData } = await Promise.all(/*! import() */[__webpack_require__.e("n.monaco-editor"), __webpack_require__.e("default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1")]).then(__webpack_require__.bind(__webpack_require__, /*! ./nls */ "./components/monaco/nls.js"));
    let resource;
    const lang = UserContext.viewLang;
    if (lang === "zh") {
      resource = await __webpack_require__.e(/*! import() */ "i.monaco.zh-hans").then(__webpack_require__.t.bind(__webpack_require__, /*! monaco-editor-nls/locale/zh-hans.json */ "../../node_modules/monaco-editor-nls/locale/zh-hans.json", 19));
    } else if (lang === "zh_TW") {
      resource = await __webpack_require__.e(/*! import() */ "i.monaco.zh-hant").then(__webpack_require__.t.bind(__webpack_require__, /*! monaco-editor-nls/locale/zh-hant.json */ "../../node_modules/monaco-editor-nls/locale/zh-hant.json", 19));
    } else if (lang === "ko") {
      resource = await __webpack_require__.e(/*! import() */ "i.monaco.ko").then(__webpack_require__.t.bind(__webpack_require__, /*! monaco-editor-nls/locale/ko.json */ "../../node_modules/monaco-editor-nls/locale/ko.json", 19));
    }
    if (resource) setLocaleData(resource);
  },
  markdown: () => Promise.all(/*! import() */[__webpack_require__.e("theme"), __webpack_require__.e("n.monaco-editor"), __webpack_require__.e("vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76"), __webpack_require__.e("vendors-node_modules_emojis-keywords_index_js-node_modules_emojis-list_index_js-node_modules_-cfa9e0"), __webpack_require__.e("default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1")]).then(__webpack_require__.bind(__webpack_require__, /*! ./languages/markdown */ "./components/monaco/languages/markdown.ts")),
  typescript: () => Promise.all(/*! import() */[__webpack_require__.e("theme"), __webpack_require__.e("n.monaco-editor"), __webpack_require__.e("vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76"), __webpack_require__.e("default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1")]).then(__webpack_require__.bind(__webpack_require__, /*! ./languages/typescript */ "./components/monaco/languages/typescript.ts")).then((m) => m.loadTypes()),
  yaml: () => Promise.all(/*! import() */[__webpack_require__.e("theme"), __webpack_require__.e("n.monaco-editor"), __webpack_require__.e("vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76"), __webpack_require__.e("default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1")]).then(__webpack_require__.bind(__webpack_require__, /*! ./languages/yaml */ "./components/monaco/languages/yaml.ts")),
  external: async (monaco, feat) => {
    for (const item of await (0,_lazyload__WEBPACK_IMPORTED_MODULE_0__.getFeatures)(`monaco-${feat}`)) {
      let apply = typeof item === "function" ? item : item.startsWith("http") || item.startsWith("/") ? await legacyLoadExternalModule(item) : (await (0,_lazyload__WEBPACK_IMPORTED_MODULE_0__.load)(item)).apply;
      if (typeof apply !== "function") apply = apply.default || apply.apply;
      if (typeof apply === "function") await apply(monaco);
    }
  }
};
let loadPromise = Promise.resolve();
async function load(features = ["markdown"]) {
  let s = Date.now();
  await loadPromise;
  let resolve;
  loadPromise = new Promise((r) => {
    resolve = r;
  });
  if (!loaded) {
    await loaders.i18n();
    console.log("Loading monaco editor");
  }
  const res = await Promise.all(/*! import() */[__webpack_require__.e("theme"), __webpack_require__.e("n.monaco-editor"), __webpack_require__.e("vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76"), __webpack_require__.e("default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1")]).then(__webpack_require__.bind(__webpack_require__, /*! ./index */ "./components/monaco/index.ts"));
  if (!loaded) {
    console.log("Loaded monaco editor in", Date.now() - s, "ms");
    loaded = [];
  }
  for (const feat of features) {
    if (loaded.includes(feat)) continue;
    if (!loaders[feat]) {
      const items = await (0,_lazyload__WEBPACK_IMPORTED_MODULE_0__.getFeatures)(`monaco-${feat}`);
      if (!items.length) {
        console.warn("Unknown monaco feature:", feat);
        continue;
      }
    }
    s = Date.now();
    console.log("Loading monaco feature:", feat);
    try {
      if (loaders[feat]) await loaders[feat]();
      else await loaders.external(res.default, feat);
      console.log("Loaded monaco feature:", feat, "in", Date.now() - s, "ms");
      loaded.push(feat);
    } catch (e) {
      console.log("Monaco feat", feat, "failed to load:", e);
    }
  }
  await res.loadThemePromise;
  resolve();
  return {
    monaco: res.default,
    registerAction: res.registerAction,
    customOptions: res.customOptions,
    renderMarkdown: res.renderMarkdown
  };
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (load);


/***/ },

/***/ "./components/navigation/navigation.page.js"
/*!**************************************************!*\
  !*** ./components/navigation/navigation.page.js ***!
  \**************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/breakpoints.json */ "./breakpoints.json");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_components_selectUser__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/selectUser */ "./components/selectUser.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");






function handleNavLogoutClick(ev) {
  const $logoutLink = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget);
  vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post($logoutLink.attr("href")).then(() => window.location.reload());
  ev.preventDefault();
}
async function handlerSwitchAccount(ev) {
  ev.preventDefault();
  const target = await (0,vj_components_selectUser__WEBPACK_IMPORTED_MODULE_3__["default"])("Hint::icon::switch_account");
  if (!target) return;
  try {
    const res = await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.get(`/account/${target._id}`);
    if (res.url) window.location.href = res.url;
    else window.location.reload();
  } catch (error) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_2__["default"].error(error.message);
  }
}
let $trigger;
let $menu;
function handleNavbar() {
  let fromHide = false;
  if (jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).width() <= vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_1__.mobile) {
    $menu.children().each(function() {
      const $ele = jquery__WEBPACK_IMPORTED_MODULE_0___default()(this);
      $ele.addClass("nav__list-item").removeClass("menu__item");
      $ele.children("a").addClass("nav__item").removeClass("menu__link");
      $ele.insertBefore($trigger, null);
    });
    $trigger.hide();
    return;
  }
  $trigger.show();
  const base = 70;
  let navItems = jquery__WEBPACK_IMPORTED_MODULE_0___default()(".nav__list--main > .nav__list-item");
  let navItem = navItems.length - 2;
  while (navItem && jquery__WEBPACK_IMPORTED_MODULE_0___default()("#menu").children("div").height() > base) {
    if (!jquery__WEBPACK_IMPORTED_MODULE_0___default()(navItems[navItem]).children("a").hasClass("nav--active")) {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(navItems[navItem]).removeClass("nav__list-item").addClass("menu__item");
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(navItems[navItem]).children("a").removeClass("nav__item").addClass("menu__link");
      $menu.prepend(jquery__WEBPACK_IMPORTED_MODULE_0___default()(navItems[navItem]));
    }
    navItem--;
    fromHide = true;
  }
  if (!fromHide && $menu.children().length) {
    while (jquery__WEBPACK_IMPORTED_MODULE_0___default()("#menu").children("div").height() <= base && $menu.children().length) {
      const $ele = $menu.children().first();
      $ele.addClass("nav__list-item").removeClass("menu__item");
      $ele.children("a").addClass("nav__item").removeClass("menu__link");
      $ele.insertBefore($trigger, null);
    }
  }
  navItems = jquery__WEBPACK_IMPORTED_MODULE_0___default()(".nav__list--main > .nav__list-item");
  navItem = navItems.length - 2;
  if (jquery__WEBPACK_IMPORTED_MODULE_0___default()("#menu").children("div").height() > base) {
    while (navItem && jquery__WEBPACK_IMPORTED_MODULE_0___default()("#menu").children("div").height() > base) {
      if (!jquery__WEBPACK_IMPORTED_MODULE_0___default()(navItems[navItem]).children("a").hasClass("nav--active")) {
        jquery__WEBPACK_IMPORTED_MODULE_0___default()(navItems[navItem]).removeClass("nav__list-item").addClass("menu__item");
        jquery__WEBPACK_IMPORTED_MODULE_0___default()(navItems[navItem]).children("a").removeClass("nav__item").addClass("menu__link");
        $menu.prepend(jquery__WEBPACK_IMPORTED_MODULE_0___default()(navItems[navItem]));
      }
      navItem--;
    }
  }
  if (!$menu.children().length) $trigger.hide();
}
const navigationPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.AutoloadPage("navigationPage", () => {
  if (!document.getElementById("panel") || !document.getElementById("menu")) return;
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="nav_logout"]', handleNavLogoutClick);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="nav_switch_account"]', handlerSwitchAccount);
  let isOpen = false;
  const panel = document.getElementById("panel");
  const $slideoutOverlay = jquery__WEBPACK_IMPORTED_MODULE_0___default()(".slideout-overlay");
  const $hamburger = jquery__WEBPACK_IMPORTED_MODULE_0___default()(".header__hamburger .hamburger");
  const PADDING = 200;
  const TOLERANCE = 70;
  function isMobileLayout() {
    return jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).width() <= vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_1__.mobile;
  }
  function setTranslateX(x) {
    panel.style.transform = x ? `translateX(${x}px)` : "";
  }
  function open() {
    if (!isMobileLayout()) return;
    isOpen = true;
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("html").addClass("slideout-open");
    setTranslateX(-PADDING);
    $hamburger.addClass("is-active");
    $slideoutOverlay.show();
  }
  let touchStartX = 0;
  let touchStartY = 0;
  let touchCurrentX = 0;
  let isSwiping = false;
  let isScrolling = false;
  function close() {
    isOpen = false;
    isSwiping = false;
    isScrolling = false;
    panel.style.transition = "";
    setTranslateX(0);
    $hamburger.removeClass("is-active");
    $slideoutOverlay.hide();
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("html").removeClass("slideout-open");
  }
  panel.addEventListener("touchstart", (e) => {
    if (!isMobileLayout() || e.target.closest("[data-slideout-ignore]")) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchCurrentX = touchStartX;
    isSwiping = false;
    isScrolling = false;
  }, { passive: true });
  panel.addEventListener("touchmove", (e) => {
    if (!isMobileLayout()) return;
    touchCurrentX = e.touches[0].clientX;
    const dx = touchStartX - touchCurrentX;
    if (!isSwiping) {
      if (isScrolling) return;
      const dy = touchStartY - e.touches[0].clientY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < 10 && absDy < 10) return;
      if (absDy > absDx) {
        isScrolling = true;
        return;
      }
      isSwiping = true;
      if (!isOpen) $slideoutOverlay.show();
      jquery__WEBPACK_IMPORTED_MODULE_0___default()("html").addClass("slideout-open");
      panel.style.transition = "none";
    }
    setTranslateX(isOpen ? Math.max(-PADDING, Math.min(0, -PADDING - dx)) : Math.max(-PADDING, Math.min(0, -dx)));
  }, { passive: true });
  panel.addEventListener("touchend", () => {
    if (!isMobileLayout() || !isSwiping) return;
    panel.style.transition = "";
    const dx = touchStartX - touchCurrentX;
    if (isOpen) {
      if (-dx > TOLERANCE) close();
      else open();
    } else {
      if (dx > TOLERANCE) open();
      else close();
    }
    isSwiping = false;
  });
  $slideoutOverlay.on("click", close);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".header__hamburger").on("click", () => isOpen ? close() : open());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(window).on("resize", () => {
    handleNavbar();
    if (!isMobileLayout()) close();
  });
  setInterval(handleNavbar, 3e3);
}, () => {
  $trigger = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`
    <li class="nav__list-item nav_more" data-dropdown-pos="bottom right" data-dropdown-target="#menu-nav-more">
      <a href="javascript:;" class="nav__item">
        ${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("More")} <span class="icon icon-expand_more"></span>
      </a>
    </li>
  `);
  $menu = jquery__WEBPACK_IMPORTED_MODULE_0___default()('<ol class="dropdown-target menu menu_more" id="menu-nav-more">');
  $trigger.append($menu);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".nav__list--main").append($trigger);
  handleNavbar();
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (navigationPage);


/***/ },

/***/ "./components/notification/index.ts"
/*!******************************************!*\
  !*** ./components/notification/index.ts ***!
  \******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Notification)
/* harmony export */ });
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineProvider.mjs");
/* harmony import */ var _mantine_notifications__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @mantine/notifications */ "../../node_modules/@mantine/notifications/esm/notifications.store.mjs");
/* harmony import */ var _mantine_notifications__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/notifications */ "../../node_modules/@mantine/notifications/esm/Notifications.mjs");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var vj_components_mantine_page__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/mantine.page */ "./components/mantine.page.tsx");
/* harmony import */ var vj_utils_base__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/utils/base */ "./utils/base.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);






document.body.append(
  (0,vj_utils_base__WEBPACK_IMPORTED_MODULE_6__.tpl)(
    react__WEBPACK_IMPORTED_MODULE_4___default().createElement(
      _mantine_core__WEBPACK_IMPORTED_MODULE_0__.MantineProvider,
      { theme: vj_components_mantine_page__WEBPACK_IMPORTED_MODULE_5__.theme },
      react__WEBPACK_IMPORTED_MODULE_4___default().createElement(_mantine_notifications__WEBPACK_IMPORTED_MODULE_2__.Notifications, { position: "bottom-left", zIndex: 99999 })
    ),
    true
  )
);
class Notification {
  constructor({
    avatar,
    title,
    message,
    type = "",
    duration = 3e3,
    action
  }) {
    __publicField(this, "type");
    __publicField(this, "action");
    __publicField(this, "$dom");
    __publicField(this, "$n");
    __publicField(this, "duration");
    __publicField(this, "autoHideTimer");
    this.type = type;
    if (avatar) this.type += " avatar";
    if (title) this.type += " title";
    this.action = action || (() => {
    });
    this.$dom = jquery__WEBPACK_IMPORTED_MODULE_3___default()((0,vj_utils_base__WEBPACK_IMPORTED_MODULE_6__.tpl)`<div class="notification ${this.type} hide"></div>`);
    if (avatar) jquery__WEBPACK_IMPORTED_MODULE_3___default()((0,vj_utils_base__WEBPACK_IMPORTED_MODULE_6__.tpl)`<img width="32" height="32" class="avatar" src="${avatar}"></img>`).appendTo(this.$dom);
    const content = message.split("\n").map((line) => (0,vj_utils_base__WEBPACK_IMPORTED_MODULE_6__.tpl)`<p>${line}</p>`).join("");
    if (title) {
      jquery__WEBPACK_IMPORTED_MODULE_3___default()((0,vj_utils_base__WEBPACK_IMPORTED_MODULE_6__.tpl)`<div class="notification-content"><h2>${title}</h2>${{ templateRaw: true, html: content }}</div>`).appendTo(this.$dom);
    } else jquery__WEBPACK_IMPORTED_MODULE_3___default()(`<div>${content}</div>`).appendTo(this.$dom);
    this.$dom.on("click", this.handleClick.bind(this));
    this.$n = this.$dom.css("z-index", vj_utils_base__WEBPACK_IMPORTED_MODULE_6__.zIndexManager.getNext()).appendTo(document.body);
    this.$n.width();
    this.duration = duration;
  }
  handleClick() {
    this.action();
  }
  show(autohide = true) {
    this.$n.removeClass("hide");
    if (this.duration && autohide) this.autoHideTimer = setTimeout(this.hide.bind(this), this.duration);
  }
  hide() {
    this.$n.addClass("hide");
    setTimeout(() => this.$n.remove(), 200);
  }
  static success(message, duration) {
    return _mantine_notifications__WEBPACK_IMPORTED_MODULE_1__.notifications.show({
      title: message,
      color: "#238551",
      message: "",
      icon: react__WEBPACK_IMPORTED_MODULE_4___default().createElement("i", { className: "icon icon-check" }),
      autoClose: duration
    });
  }
  static info(message, duration) {
    return _mantine_notifications__WEBPACK_IMPORTED_MODULE_1__.notifications.show({
      title: message,
      color: "#2d72d2",
      message: "",
      icon: react__WEBPACK_IMPORTED_MODULE_4___default().createElement("i", { className: "icon icon-info--circle" }),
      autoClose: duration
    });
  }
  static warn(message, duration) {
    return _mantine_notifications__WEBPACK_IMPORTED_MODULE_1__.notifications.show({
      title: message,
      color: "#fbb360",
      message: "",
      icon: react__WEBPACK_IMPORTED_MODULE_4___default().createElement("i", { className: "icon icon-warning" }),
      autoClose: duration
    });
  }
  static error(message, duration) {
    return _mantine_notifications__WEBPACK_IMPORTED_MODULE_1__.notifications.show({
      title: message,
      color: "#cd4246",
      message: "",
      icon: react__WEBPACK_IMPORTED_MODULE_4___default().createElement("i", { className: "icon icon-close--circle" }),
      autoClose: duration
    });
  }
}


/***/ },

/***/ "./components/notification/notification.page.js"
/*!******************************************************!*\
  !*** ./components/notification/notification.page.js ***!
  \******************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var vj_components_notification_index__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/components/notification/index */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");



/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("notificationPage", (pagename) => {
  const message = (0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.i18n)(`Hint::Page::${pagename}`);
  const item = localStorage.getItem(`hint.${message}`);
  if (message !== `Hint::Page::${pagename}` && !item) {
    vj_components_notification_index__WEBPACK_IMPORTED_MODULE_0__["default"].info(message, message.length * 500);
    localStorage.setItem(`hint.${message}`, true);
  }
  const text = new URL(window.location.href).searchParams.get("notification");
  if (text) vj_components_notification_index__WEBPACK_IMPORTED_MODULE_0__["default"].success(text);
}));


/***/ },

/***/ "./components/omnisearch/index.page.tsx"
/*!**********************************************!*\
  !*** ./components/omnisearch/index.page.tsx ***!
  \**********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_constant_record__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/constant/record */ "./constant/record.js");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* provided dependency */ var $ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");







/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_5__.AutoloadPage("omnibar", () => {
  if (document.documentElement.dataset.layout !== "basic") return;
  const $search = $(`
    <div class='omnibar' data-hotkey="esc:click" style="opacity:0;display:none;">
      <div class='omnibar-main'>
        <div>
          <input placeholder="Search" />
          <span class="icon icon-search"></span>
        </div>
        <div id='omnibar-content'></div>
      </div>
    </div>
  `);
  const $entry = $(`
    <button class="omnibar-toggle" data-global-hotkey="ctrl+k:click">
      <span class="icon icon-search"></span>
    </button>
  `);
  $(document.body).append($search);
  $(document.body).append($entry);
  const $input = $(".omnibar input");
  const prefix = window.location.pathname.startsWith("/d/") ? `/d/${UiContext.domainId}` : "";
  let setSearching;
  let pdocs = [];
  let psdict = {};
  let udocs = [];
  function SearchResult() {
    const [searching, set] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(false);
    setSearching = set;
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
      searching && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { children: "Searching..." }),
      pdocs.length > 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "omnibar-content-title", children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Problems") }),
      pdocs.map((i) => ({ ...i, base: i.domainId !== UiContext.domainId ? `/d/${i.domainId}` : prefix })).map(({
        domainId,
        docId,
        pid,
        title,
        nSubmit,
        nAccept,
        base
      }) => {
        var _a, _b;
        return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(
          "a",
          {
            className: "omnibar-content-section omnibar-problem",
            href: `${base}/p/${pid || docId}`,
            children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { children: [
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
                  "p",
                  {
                    onClick: (ev) => {
                      var _a2, _b2;
                      if ((_a2 = psdict[`${domainId}#${docId}`]) == null ? void 0 : _a2.rid) {
                        window.location.href = `${base}/record/${(_b2 = psdict[`${domainId}#${docId}`]) == null ? void 0 : _b2.rid}`;
                      }
                      ev.preventDefault();
                    },
                    className: `record-status--text ${vj_constant_record__WEBPACK_IMPORTED_MODULE_4__.STATUS_CODES[(_a = psdict[`${domainId}#${docId}`]) == null ? void 0 : _a.status]}`,
                    children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: `icon record-status--icon ${vj_constant_record__WEBPACK_IMPORTED_MODULE_4__.STATUS_CODES[(_b = psdict[`${domainId}#${docId}`]) == null ? void 0 : _b.status]}` })
                  }
                ),
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { children: title })
              ] }),
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { children: [
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "icon icon-book" }),
                domainId !== UiContext.domainId ? `${domainId}#` : "",
                pid || docId,
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "icon icon-pie-chart" }),
                nAccept,
                "/",
                nSubmit
              ] })
            ]
          },
          domainId + docId
        );
      }),
      udocs.length > 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "omnibar-content-title", children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Users") }),
      udocs.map(({
        _id,
        uname,
        avatarUrl
      }) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("a", { className: "omnibar-content-section omnibar-user", href: `${prefix}/user/${_id}`, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("img", { src: avatarUrl, alt: uname }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "omnibar-user-info", children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("span", { children: [
            "UID ",
            _id
          ] }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("br", {}),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { style: { lineHeight: "20px" }, children: uname }) })
        ] })
      ] }) }, _id))
    ] });
  }
  react_dom_client__WEBPACK_IMPORTED_MODULE_3__.createRoot(document.getElementById("omnibar-content")).render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(SearchResult, {}));
  async function search(query) {
    if (!(query == null ? void 0 : query.trim())) {
      pdocs = [];
      setSearching == null ? void 0 : setSearching(false);
      return;
    }
    setSearching == null ? void 0 : setSearching(true);
    [{ pdocs, psdict }, udocs] = await Promise.all([
      vj_utils__WEBPACK_IMPORTED_MODULE_6__.request.get(`/d/${UiContext.domainId}/p`, { q: query, limit: 10 }),
      (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.api)("users", { search: query }, ["_id", "uname", "displayName", "avatarUrl"])
    ]);
    setSearching == null ? void 0 : setSearching(false);
  }
  $input.on("input", (0,lodash__WEBPACK_IMPORTED_MODULE_1__.debounce)((ev) => search(ev.target.value), 1e3));
  let open = false;
  const show = () => {
    $search.show();
    setTimeout(() => {
      $search.css("opacity", "1");
      $input.focus();
    }, 20);
    open = true;
  };
  const hide = () => {
    $search.css("opacity", "0");
    setTimeout(() => $search.hide(), 200);
    open = false;
  };
  $entry.on("click", () => open ? hide() : show());
  $input.on("click", (ev) => ev.stopPropagation());
  $(".omnibar-main").on("click", ".omnibar-content-section", (ev) => ev.stopPropagation());
  $search.on("click", hide);
}));


/***/ },

/***/ "./components/preview/preview.page.ts"
/*!********************************************!*\
  !*** ./components/preview/preview.page.ts ***!
  \********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   previewFile: () => (/* binding */ previewFile)
/* harmony export */ });
/* harmony import */ var clipboard__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! clipboard */ "../../node_modules/clipboard/dist/clipboard.js");
/* harmony import */ var clipboard__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(clipboard__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var nanoid__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! nanoid */ "../../node_modules/nanoid/index.browser.js");
/* harmony import */ var vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/dialog/index */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var _upload__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../upload */ "./components/upload.tsx");








async function startEdit(filename, value, fileCategory = "file") {
  var _a;
  const { default: Editor } = await Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! vj/components/editor/index */ "./components/editor/index.tsx"));
  const promise = new vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_3__.ActionDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl)`
      <div class="typo" style="width: 100%; height: 100%">
        <textarea name="fileContent" style="width: 100%; height: 100%"></textarea>
      </div>`,
    width: `${window.innerWidth - 200}px`,
    height: `${window.innerHeight - 100}px`,
    cancelByEsc: false
  }).open();
  const languages = [
    ["yaml", ["yaml", "yml"]],
    ["cpp", ["c", "cc", "cpp", "h", "hpp"]],
    ["json", ["json"]],
    ["plain", ["in", "out", "ans"]]
  ];
  const language = ((_a = languages.filter((i) => i[1].includes(filename.split(".").pop()))[0]) == null ? void 0 : _a[0]) || "auto";
  const editor = new Editor(jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="fileContent"]'), {
    value,
    autoResize: false,
    autoLayout: false,
    language,
    model: `hydro://problem/${fileCategory}/${filename}`
  });
  const action = await promise;
  value = editor.value().replace(/\r\n/g, "\n");
  editor.destroy();
  if (action !== "ok") return null;
  return value;
}
const dialogAction = (id) => [
  (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl)`<button class="rounded button" data-action="copy" id="copy-${id}">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Copy Link")}</button>`,
  (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl)`<button class="rounded button" data-action="download">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Download")}</button>`,
  (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl)`<button class="primary rounded button" data-action="ok">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Ok")}</button>`
];
function bindCopyLink(id, src) {
  src = src.replace(/\(/g, "%28").replace(/\)/g, "%29");
  const url = !["file", "files"].some((i) => window.location.href.endsWith(i)) || ["homework", "training"].some((i) => window.location.href.match(`${i}/.*/file`)) ? `file://${src.substring(src.lastIndexOf("/") + 1)}` : src;
  const clip = new (clipboard__WEBPACK_IMPORTED_MODULE_0___default())(`#copy-${id}`, { text: () => url });
  clip.on("success", () => vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)(`${url.startsWith("file://") ? "Reference" : "Download"} link copied to clipboard!`)));
  clip.on("error", () => vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Copy failed :(")));
}
async function previewVideo(link) {
  const id = (0,nanoid__WEBPACK_IMPORTED_MODULE_2__.nanoid)();
  const dialog = new vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_3__.InfoDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl)`
    <div class="typo"><video width="100%" controls>
      <source src="${link}" type="${link.endsWith("ogg") ? "video/ogg" : "video/mp4"}">
      Your browser doesn't support video tag.
    </video></div>`,
    $action: dialogAction(id)
  });
  bindCopyLink(id, link);
  const action = await dialog.open();
  if (action === "download") window.open(link);
}
async function previewImage(link) {
  const id = (0,nanoid__WEBPACK_IMPORTED_MODULE_2__.nanoid)();
  const dialog = new vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_3__.InfoDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl)`<div class="typo"><img src="${link}" style="max-height: calc(80vh - 45px);"></img></div>`,
    $action: dialogAction(id)
  });
  bindCopyLink(id, link);
  const action = await dialog.open();
  if (action === "download") window.open(link);
}
async function previewPDF(link) {
  const uuidURL = URL.createObjectURL(new Blob());
  const uuid = uuidURL.toString();
  URL.revokeObjectURL(uuidURL);
  const id = (0,nanoid__WEBPACK_IMPORTED_MODULE_2__.nanoid)();
  const dialog = new vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_3__.InfoDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl)`
      <div class="typo" style="height: 100%;">
        <object classid="clsid:${uuid.substring(uuid.lastIndexOf("/") + 1)}">
          <param name="SRC" value="${link}" >
          <embed width="100%" style="height: 100%;border: none;" src="${link}">
            <noembed></noembed>
          </embed>
        </object>
      </div>`,
    width: `${window.innerWidth - 200}px`,
    height: `${window.innerHeight - 100}px`,
    $action: dialogAction(id)
  });
  bindCopyLink(id, link);
  const action = await dialog.open();
  if (action === "download") window.open(link);
}
async function previewOffice(link, src) {
  const id = (0,nanoid__WEBPACK_IMPORTED_MODULE_2__.nanoid)();
  const dialog = new vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_3__.InfoDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl)`
      <div class="typo">
        <iframe src="https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(new URL(src, window.location.href).toString())}"
          scrolling="no" border="0" frameborder="no" framespacing="0" width="100%" style="height: 70vh;"></iframe>
      </div>`,
    width: `${window.innerWidth - 200}px`,
    height: `${window.innerHeight - 100}px`,
    $action: dialogAction(id)
  });
  bindCopyLink(id, link);
  const action = await dialog.open();
  if (action === "download") window.open(link);
}
async function previewFile(ev, type = "") {
  if ((ev == null ? void 0 : ev.metaKey) || (ev == null ? void 0 : ev.ctrlKey) || (ev == null ? void 0 : ev.shiftKey)) return null;
  if (ev) ev.preventDefault();
  const filename = ev ? ev.currentTarget.closest("[data-filename]").getAttribute("data-filename") : prompt((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Filename"));
  if (!filename) return null;
  const filesize = ev ? +ev.currentTarget.closest("[data-size]").getAttribute("data-size") : 0;
  let content = "";
  if (ev) {
    const link = jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget).find("a").attr("href");
    if (!link) return null;
    type || (type = ev.currentTarget.getAttribute("data-preview"));
    const ext = filename.split(".").pop().toLowerCase();
    if (["zip", "rar", "7z"].includes(ext) || filesize > 8 * 1024 * 1024) {
      const id = (0,nanoid__WEBPACK_IMPORTED_MODULE_2__.nanoid)();
      const dialog = new vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_3__.ActionDialog({
        $body: vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl.typoMsg((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Cannot preview this file. Download now?")),
        $action: dialogAction(id)
      });
      bindCopyLink(id, link);
      const action = await dialog.open();
      if (action === "ok") window.open(link);
      return null;
    }
    if (["mp4", "webm", "ogg"].includes(ext)) return previewVideo(link);
    if (["png", "jpeg", "jpg", "gif", "webp", "bmp"].includes(ext)) return previewImage(link);
    if (ext === "pdf") return previewPDF(`${link}${link.includes("?") ? "&" : "?"}noDisposition=1`);
    vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Loading file..."));
    try {
      const { url } = await vj_utils__WEBPACK_IMPORTED_MODULE_6__.request.get(link, {}, { headers: { Pragma: "no-cache" } });
      if (/^(?:doc|xls|ppt)x?$/.test(ext)) return previewOffice(link, url);
      content = await vj_utils__WEBPACK_IMPORTED_MODULE_6__.request.get(url, void 0, { dataType: "text" });
    } catch (e) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Failed to load file: {0}", e.message));
      throw e;
    }
  } else vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Loading editor..."));
  const val = await startEdit(filename, content, type || "file");
  if (typeof val !== "string") return null;
  const file = new File([val], filename, { type: "text/plain" });
  const endpoint = new URL(!window.location.href.endsWith("/files") ? `${window.location.href.substring(0, window.location.href.lastIndexOf("/"))}/files` : "", window.location.href);
  const sidebarType = type || jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget).closest("[data-fragment-id]").data("type");
  const sidebar = ev && jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget).closest("[data-fragment-id]").data("sidebar") !== void 0;
  await (0,_upload__WEBPACK_IMPORTED_MODULE_7__["default"])(endpoint.toString(), [file], {
    type: sidebarType || type,
    sidebar,
    pjax: true
  });
  return null;
}
const dataPreviewPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_5__.AutoloadPage("dataPreview", () => {
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", "[data-preview]", previewFile);
});
window.Hydro.components.preview = { startEdit, previewFile };
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (dataPreviewPage);


/***/ },

/***/ "./components/problem/create.page.js"
/*!*******************************************!*\
  !*** ./components/problem/create.page.js ***!
  \*******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage(["problem_create", "problem_edit"], () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('input[name="pid"]').on("blur", () => {
    if (/^[0-9]+$/.test(jquery__WEBPACK_IMPORTED_MODULE_0___default()('input[name="pid"]').val())) {
      (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.alert)((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Problem ID cannot be a pure number. Leave blank if you want to use numberic id."));
    }
  });
}));


/***/ },

/***/ "./components/problem/list.page.js"
/*!*****************************************!*\
  !*** ./components/problem/list.page.js ***!
  \*****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");


/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("problemListPage", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".col--problem-name>a").attr("target", "_blank");
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjContentNew", () => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(".col--problem-name>a").attr("target", "_blank");
  });
}));


/***/ },

/***/ "./components/problemconfig/ProblemConfigEditor.tsx"
/*!**********************************************************!*\
  !*** ./components/problemconfig/ProblemConfigEditor.tsx ***!
  \**********************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   configYamlFormat: () => (/* binding */ configYamlFormat),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var diff__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! diff */ "../../node_modules/diff/libesm/diff/line.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var js_yaml__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! js-yaml */ "../../node_modules/js-yaml/dist/js-yaml.mjs");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var react_redux__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react-redux */ "../../node_modules/react-redux/dist/react-redux.mjs");
/* harmony import */ var vj_components_editor__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/components/editor */ "./components/editor/index.tsx");
/* harmony import */ var vj_components_monaco_loader__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/components/monaco/loader */ "./components/monaco/loader.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);









const mapStateToProps = (state) => ({
  config: state.config
});
const mapDispatchToProps = (dispatch) => ({
  handleUpdateCode: (code) => {
    dispatch({
      type: "CONFIG_CODE_UPDATE",
      payload: code
    });
  }
});
const configKey = [
  "type",
  "subType",
  "target",
  "score",
  "time",
  "memory",
  "filename",
  "checker_type",
  "checker",
  "interactor",
  "manager",
  "num_processes",
  "validator",
  "user_extra_files",
  "judge_extra_files",
  "detail",
  "outputs",
  "redirect",
  "cases",
  "subtasks",
  "langs",
  "key",
  "time_limit_rate",
  "memory_limit_rate"
];
const subtasksKey = [
  "time",
  "memory",
  "score",
  "if",
  "id",
  "type",
  "cases"
];
const casesKey = ["time", "memory", "input", "output"];
function configYamlFormat(config) {
  const formatConfig = {};
  configKey.forEach((key) => {
    if (config[key] !== void 0) {
      if (key === "subType" && ["single", "multi"].includes(config[key]) && config.type !== "submit_answer") return;
      if (key === "checker_type" && config.type !== "default") return;
      if (key === "checker" && (["default", "strict"].includes(formatConfig.checker_type) || !formatConfig.checker_type)) return;
      if (key === "interactor" && config.type !== "interactive") return;
      if (key === "subtasks") {
        formatConfig[key] = [];
        config[key].forEach((subtask) => {
          const formatSubtask = {};
          subtasksKey.forEach((subtaskKey) => {
            if (subtask && subtask[subtaskKey] !== void 0) {
              formatSubtask[subtaskKey] = subtask[subtaskKey];
            }
          });
          formatConfig[key].push(formatSubtask);
        });
      } else if (key === "cases") {
        formatConfig[key] = [];
        config[key].forEach((caseItem) => {
          const formatCase = {
            time: "1000ms",
            memory: "256MB",
            input: "",
            output: ""
          };
          casesKey.forEach((caseKey) => {
            if (caseItem[caseKey] !== void 0) formatCase[caseKey] = caseItem[caseKey];
            else delete formatCase[caseKey];
          });
          formatConfig[key].push(formatCase);
        });
      } else formatConfig[key] = config[key];
    }
  });
  if (formatConfig.type === "objective") {
    Object.keys(formatConfig).filter((i) => !["type", "answers"].includes(i)).forEach((i) => delete formatConfig[i]);
    formatConfig.answers = config.answers || {};
  }
  Object.keys(formatConfig).filter((i) => i.startsWith("__")).forEach((i) => delete formatConfig[i]);
  return formatConfig;
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ((0,react_redux__WEBPACK_IMPORTED_MODULE_6__.connect)(mapStateToProps, mapDispatchToProps)(class MonacoEditor extends (react__WEBPACK_IMPORTED_MODULE_5___default().PureComponent) {
  constructor() {
    super(...arguments);
    __publicField(this, "disposable", []);
    __publicField(this, "containerElement");
    __publicField(this, "__preventUpdate", false);
    __publicField(this, "__preventFormat", false);
    __publicField(this, "editor");
    __publicField(this, "model");
    __publicField(this, "vjEditor");
    __publicField(this, "assignRef", (component) => {
      this.containerElement = component;
    });
  }
  async componentDidMount() {
    const { monaco } = await (0,vj_components_monaco_loader__WEBPACK_IMPORTED_MODULE_8__.load)(["yaml"]);
    const uri = monaco.Uri.parse("hydro://problem/file/config.yaml");
    this.model = monaco.editor.createModel(js_yaml__WEBPACK_IMPORTED_MODULE_3__["default"].dump(configYamlFormat(this.props.config), { noArrayIndent: true }), "yaml", uri);
    this.vjEditor = vj_components_editor__WEBPACK_IMPORTED_MODULE_7__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_2___default()(this.containerElement), {
      language: "yaml",
      model: this.model,
      lineNumbers: "off",
      onChange: (value) => {
        this.__preventUpdate = true;
        if (!this.__preventFormat) this.props.handleUpdateCode(value);
        this.__preventUpdate = false;
      }
    });
    this.editor = this.vjEditor.editor;
  }
  componentDidUpdate(prevProps) {
    if (this.__preventUpdate || !this.model || !this.props.config.__valid) return;
    if (js_yaml__WEBPACK_IMPORTED_MODULE_3__["default"].dump(prevProps.config, { noArrayIndent: true }) === js_yaml__WEBPACK_IMPORTED_MODULE_3__["default"].dump(this.props.config, { noArrayIndent: true })) return;
    const curValue = this.model.getValue();
    const pending = configYamlFormat(this.props.config);
    try {
      const curConfig = js_yaml__WEBPACK_IMPORTED_MODULE_3__["default"].load(curValue);
      if ((0,lodash__WEBPACK_IMPORTED_MODULE_4__.isEqual)(curConfig, pending)) return;
    } catch {
    }
    this.__preventFormat = true;
    const diff = (0,diff__WEBPACK_IMPORTED_MODULE_1__.diffLines)(curValue, js_yaml__WEBPACK_IMPORTED_MODULE_3__["default"].dump(pending, { noArrayIndent: true }));
    const ops = [];
    let cursor = 1;
    for (const line of diff) {
      if (line.added) {
        let range = this.model.getFullModelRange();
        range = range.setStartPosition(cursor, 0);
        range = range.setEndPosition(cursor, 0);
        ops.push({ range, text: line.value });
      } else if (line.removed) {
        let range = this.model.getFullModelRange();
        range = range.setStartPosition(cursor, 0);
        cursor += line.count;
        range = range.setEndPosition(cursor, 0);
        ops.push({ range, text: "" });
      } else cursor += line.count;
    }
    this.model.pushEditOperations([], ops, void 0);
    this.__preventFormat = false;
  }
  componentWillUnmount() {
    if (this.vjEditor) this.vjEditor.destroy();
    if (this.model) this.model.dispose();
    if (this.editor) this.editor.dispose();
    this.disposable.map((i) => i.dispose());
  }
  render() {
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
      "div",
      {
        ref: this.assignRef,
        style: {
          minHeight: "500px",
          height: "100%",
          width: "100%"
        },
        className: "ConfigMonacoEditor"
      }
    );
  }
}));


/***/ },

/***/ "./components/react/DomComponent.tsx"
/*!*******************************************!*\
  !*** ./components/react/DomComponent.tsx ***!
  \*******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ DomComponent)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);




function DomComponent(props) {
  const ref = react__WEBPACK_IMPORTED_MODULE_3___default().useRef(null);
  react__WEBPACK_IMPORTED_MODULE_3___default().useEffect(() => {
    ref.current.appendChild(props.childDom);
    return () => {
      jquery__WEBPACK_IMPORTED_MODULE_1___default()(ref.current).empty();
    };
  }, []);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { ...(0,lodash__WEBPACK_IMPORTED_MODULE_2__.omit)(props, "childDom"), ref });
}


/***/ },

/***/ "./components/rotator/index.js"
/*!*************************************!*\
  !*** ./components/rotator/index.js ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Rotator)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);



const ANIMATION_DURATION = 4e3;
const POS_ABOVE = -1;
const POS_ORIGINAL = 0;
const POS_BELOW = 1;
const POS_CLASSNAME = {
  [POS_ABOVE]: "pos--above",
  [POS_ORIGINAL]: "",
  [POS_BELOW]: "pos--below"
};
class Rotator extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_1__["default"] {
  getItemClass(pos) {
    return `rotator__item ${POS_CLASSNAME[pos]}`;
  }
  constructor($dom) {
    super($dom);
    $dom.addClass("rotator");
    this.value = $dom.text();
    this.$item = this.createItem(this.value, POS_ORIGINAL).appendTo($dom.empty());
  }
  createItem(value, initialPosition) {
    const $el = jquery__WEBPACK_IMPORTED_MODULE_0___default()("<div>").text(value).attr("class", this.getItemClass(initialPosition));
    return $el;
  }
  async animateOutItem(toPosition) {
    const { $item } = this;
    $item.attr("class", this.getItemClass(toPosition));
    await (0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.delay)(ANIMATION_DURATION);
    $item.remove();
  }
  async animateInItem() {
    const { $item } = this;
    $item.height();
    $item.attr("class", this.getItemClass(POS_ORIGINAL));
    await (0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.delay)(ANIMATION_DURATION);
  }
  setValue(value) {
    if (value === this.value) {
      return;
    }
    let fromPosition;
    if (Number.parseFloat(value) > Number.parseFloat(this.value)) {
      fromPosition = POS_BELOW;
    } else {
      fromPosition = POS_ABOVE;
    }
    this.animateOutItem(-fromPosition);
    this.value = value;
    this.$item = this.createItem(value, fromPosition).appendTo(this.$dom);
    this.animateInItem();
  }
  getValue() {
    return this.value;
  }
}
__publicField(Rotator, "DOMAttachKey", "vjRotatorInstance");


/***/ },

/***/ "./components/selectUser.tsx"
/*!***********************************!*\
  !*** ./components/selectUser.tsx ***!
  \***********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ selectUser)
/* harmony export */ });
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");


async function selectUser() {
  const res = await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_0__.prompt)((0,vj_utils__WEBPACK_IMPORTED_MODULE_1__.i18n)("Select User"), {
    user: {
      type: "user",
      label: (0,vj_utils__WEBPACK_IMPORTED_MODULE_1__.i18n)("Username / UID"),
      required: true,
      autofocus: true
    }
  });
  return res == null ? void 0 : res.user;
}
window.Hydro.components.selectUser = selectUser;


/***/ },

/***/ "./components/signin/signInDialog.page.js"
/*!************************************************!*\
  !*** ./components/signin/signInDialog.page.js ***!
  \************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _simplewebauthn_browser__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @simplewebauthn/browser */ "../../node_modules/@simplewebauthn/browser/esm/index.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/breakpoints.json */ "./breakpoints.json");
/* harmony import */ var vj_components_dialog_DomDialog__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/dialog/DomDialog */ "./components/dialog/DomDialog.ts");
/* harmony import */ var vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/dialog/index */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");








const signinDialogPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_6__.AutoloadPage("signinDialogPage", null, () => {
  const signInDialog = vj_components_dialog_DomDialog__WEBPACK_IMPORTED_MODULE_3__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_1___default()(".dialog--signin"), {
    cancelByClickingBack: true,
    cancelByEsc: true
  });
  let authnInitialized = false;
  async function initPasskey() {
    if (authnInitialized || !window.isSecureContext) return;
    authnInitialized = true;
    const support = await (0,_simplewebauthn_browser__WEBPACK_IMPORTED_MODULE_0__.browserSupportsWebAuthnAutofill)();
    if (!support) return;
    const authnInfo = await vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.get("/user/webauthn", { login: true });
    if (!authnInfo.authOptions) return;
    const result = await (0,_simplewebauthn_browser__WEBPACK_IMPORTED_MODULE_0__.startAuthentication)({ optionsJSON: authnInfo.authOptions, useBrowserAutofill: true }).catch((e) => {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Failed to get credential: {0}", e));
      return null;
    });
    if (!result) return;
    try {
      const authn = await vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.post("/user/webauthn", {
        result
      });
      if (authn.url) window.location.href = authn.url;
      else if (authn.error) throw new Error(authn.error);
    } catch (err) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error(err.message);
      console.error(err);
    }
  }
  if (window.location.href.endsWith("/login")) initPasskey();
  function show() {
    signInDialog.show();
    initPasskey();
  }
  if (jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="nav_login"]').length > 0) {
    jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="nav_login"]').on("click", (ev) => {
      if (vj_utils__WEBPACK_IMPORTED_MODULE_7__.mediaQuery.isBelow(vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_2__.mobile)) return;
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
      show();
      ev.preventDefault();
    });
  }
  if (jquery__WEBPACK_IMPORTED_MODULE_1___default()(".dialog--signin").length > 0) {
    jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="dialog--signin__close"]').on("click", () => {
      signInDialog.hide();
    });
  }
  window.showSignInDialog = () => {
    if (vj_utils__WEBPACK_IMPORTED_MODULE_7__.mediaQuery.isBelow(vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_2__.mobile)) {
      if (jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="nav_login"]').length > 0) {
        window.location.href = jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="nav_login"]').attr("href");
        return;
      }
    }
    show();
  };
  jquery__WEBPACK_IMPORTED_MODULE_1___default()("[data-lostpass]").on("click", (e) => {
    e.preventDefault();
    (0,vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_4__.alert)((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Relax and try to remember your password."));
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (signinDialogPage);


/***/ },

/***/ "./components/smoothscroll/smoothscroll.page.js"
/*!******************************************************!*\
  !*** ./components/smoothscroll/smoothscroll.page.js ***!
  \******************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery_easing__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery.easing */ "../../node_modules/jquery.easing/jquery.easing.js");
/* harmony import */ var jquery_easing__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery_easing__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");



const smoothScrollPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.AutoloadPage("smoothScrollPage", null, () => {
  const HISTORY_SUPPORT = !!(typeof window.history === "object" && window.history.pushState);
  const ANCHOR_REGEX = /^#[^ ]+$/;
  const OFFSET_HEIGHT = 10 + (jquery__WEBPACK_IMPORTED_MODULE_1___default()(".nav").height() || 0);
  function scrollIfAnchor(href, pushToHistory) {
    if (!ANCHOR_REGEX.test(href)) return false;
    const match = document.getElementById(href.slice(1));
    if (!match) return false;
    const rect = match.getBoundingClientRect();
    const anchorOffset = window.pageYOffset + rect.top - OFFSET_HEIGHT;
    jquery__WEBPACK_IMPORTED_MODULE_1___default()("html,body").animate({ scrollTop: anchorOffset }, 200, "easeOutCubic");
    if (HISTORY_SUPPORT && pushToHistory) {
      window.history.pushState({}, document.title, window.location.pathname + href);
    }
    return true;
  }
  function scrollToCurrent() {
    scrollIfAnchor(window.location.hash);
  }
  function delegateAnchors(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    const elem = e.target;
    if (elem.nodeName === "A" && scrollIfAnchor(elem.getAttribute("href"), true)) e.preventDefault();
  }
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("vjPageFullyInitialized", () => {
    scrollToCurrent();
    window.addEventListener("hashchange", scrollToCurrent);
    document.body.addEventListener("click", delegateAnchors);
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (smoothScrollPage);


/***/ },

/***/ "./components/socket/index.ts"
/*!************************************!*\
  !*** ./components/socket/index.ts ***!
  \************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Sock)
/* harmony export */ });
/* harmony import */ var reconnecting_websocket__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! reconnecting-websocket */ "../../node_modules/reconnecting-websocket/dist/reconnecting-websocket-mjs.js");
/* harmony import */ var shorty_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! shorty.js */ "../../node_modules/shorty.js/index.mjs");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);


class Sock {
  constructor(url, nocookie = false, shorty = false) {
    __publicField(this, "url", url);
    __publicField(this, "sock");
    __publicField(this, "interval");
    __publicField(this, "onmessage");
    __publicField(this, "onclose");
    __publicField(this, "onopen");
    const i = new URL(url, window.location.href);
    if (shorty) {
      i.searchParams.append("shorty", "on");
    }
    if (i.host !== window.location.host && !nocookie && document.cookie.includes("sid=")) {
      i.searchParams.append("sid", document.cookie.split("sid=")[1].split(";")[0]);
    }
    i.protocol = i.protocol.replace("http", "ws");
    this.url = i.toString();
    this.sock = new reconnecting_websocket__WEBPACK_IMPORTED_MODULE_0__["default"](this.url, [], {
      maxReconnectionDelay: 1e4,
      maxRetries: 100
    });
    this.sock.onopen = () => {
      var _a;
      console.log("Connected");
      (_a = this.onopen) == null ? void 0 : _a.call(this, this.sock);
      this.interval = setInterval(() => this.sock.send("ping"), 3e4);
    };
    this.sock.onclose = ({ code, reason }) => {
      var _a;
      console.warn("Connection closed, ", code, reason);
      if (code >= 4e3) this.close();
      if (this.interval) clearInterval(this.interval);
      (_a = this.onclose) == null ? void 0 : _a.call(this, code, reason);
    };
    let decompress = null;
    this.sock.onmessage = (message) => {
      var _a;
      if (message.data === "pong") return;
      if (message.data === "ping") {
        this.sock.send("pong");
        return;
      }
      if (message.data === "shorty") {
        decompress = new shorty_js__WEBPACK_IMPORTED_MODULE_1__.Shorty();
        return;
      }
      if (true) console.log("Sock.onmessage: ", message);
      let data = message.data;
      if (decompress) data = decompress.inflate(data);
      const msg = JSON.parse(data);
      if (msg.error === "PermissionError" || msg.error === "PrivilegeError") this.close();
      else (_a = this.onmessage) == null ? void 0 : _a.call(this, message, data);
    };
  }
  on(event, callback) {
    this[`on${event}`] = callback;
  }
  send(data) {
    this.sock.send(data);
  }
  close() {
    var _a, _b;
    (_b = (_a = this.sock) == null ? void 0 : _a.close) == null ? void 0 : _b.call(_a);
  }
}


/***/ },

/***/ "./components/star/star.page.ts"
/*!**************************************!*\
  !*** ./components/star/star.page.ts ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");



function setStarButtonState($starButton, star) {
  if (star) {
    $starButton.addClass("activated");
  } else {
    $starButton.removeClass("activated");
  }
}
const starPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("starPage", () => {
  function render(container) {
    const eles = jquery__WEBPACK_IMPORTED_MODULE_0___default()(container).find("[data-star]");
    for (const el of eles) {
      if (jquery__WEBPACK_IMPORTED_MODULE_0___default()(el).find(".star-form").length) continue;
      const action = jquery__WEBPACK_IMPORTED_MODULE_0___default()(el).closest("[data-star-action]").data("star-action");
      const star = ["true", true].includes(jquery__WEBPACK_IMPORTED_MODULE_0___default()(el).data("star")) ? 1 : 0;
      jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.tpl)`<form class="star-form form--inline" action="${action}" method="post">
        <input type="hidden" name="operation" value="star">
        <input type="hidden" name="star" value="${star ? "false" : "true"}">
        <button class="star${star ? " activated" : ""}" type="submit">
          <span class="starred--hide"><span class="icon icon-star--outline" data-tooltip="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.i18n)("Star")}"></span></span>
          <span class="starred--show"><span class="icon icon-star" data-tooltip="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.i18n)("Unstar")}"></span></span>
        </button>
      </form>`).prependTo(jquery__WEBPACK_IMPORTED_MODULE_0___default()(el));
    }
  }
  render(document);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjContentNew", (ev) => {
    render(ev.target);
  });
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", ".star", (ev) => {
    const $button = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget);
    const currentState = $button.hasClass("activated");
    const $form = $button.closest("form");
    const $op = $form.find('[name="operation"]');
    const $star = $form.find('[name="star"]');
    if ($op.val() !== "star") return;
    ev.preventDefault();
    $star.val(currentState ? "false" : "true");
    setStarButtonState($button, !currentState);
    vj_utils__WEBPACK_IMPORTED_MODULE_2__.request.post($form.attr("action"), $form).then((data) => {
      setStarButtonState($button, data.star);
    }).catch(() => {
      setStarButtonState($button, currentState);
    });
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (starPage);


/***/ },

/***/ "./components/sticky/sticky.page.js"
/*!******************************************!*\
  !*** ./components/sticky/sticky.page.js ***!
  \******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/breakpoints.json */ "./breakpoints.json");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils_mediaQuery__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils/mediaQuery */ "./utils/mediaQuery.ts");





const navHeight = (0,vj_utils_mediaQuery__WEBPACK_IMPORTED_MODULE_4__.isBelow)(vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_2__.mobile) ? 0 : jquery__WEBPACK_IMPORTED_MODULE_0___default()(".nav").height();
function getCutoff(str) {
  if (str === "medium") return vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_2__.mobile;
  if (str === "large") return vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_2__.desktop;
  return 0;
}
function updateStickies($stickies) {
  $stickies.get().forEach((element) => {
    const $sticky = jquery__WEBPACK_IMPORTED_MODULE_0___default()(element);
    const shouldEnableSticky = (0,vj_utils_mediaQuery__WEBPACK_IMPORTED_MODULE_4__.isAbove)($sticky.data("sticky-cutoff-min"));
    if (shouldEnableSticky) {
      element.style.position = "sticky";
      element.style.top = `${10 + navHeight}px`;
    } else {
      element.style.position = "";
      element.style.top = "";
    }
  });
}
const stickyPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__.AutoloadPage("stickyPage", () => {
  let shouldListenResize = false;
  const $stickies = jquery__WEBPACK_IMPORTED_MODULE_0___default()("[data-sticky]");
  $stickies.get().forEach((element) => {
    const $sticky = jquery__WEBPACK_IMPORTED_MODULE_0___default()(element);
    const minEnabledSize = $sticky.attr("data-sticky");
    if (minEnabledSize === "medium" || minEnabledSize === "large") {
      shouldListenResize = true;
    }
    $sticky.data("sticky-cutoff-min", getCutoff(minEnabledSize));
  });
  updateStickies($stickies);
  if (shouldListenResize) {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(window).on("resize", lodash__WEBPACK_IMPORTED_MODULE_1___default().throttle(() => updateStickies($stickies), 300));
  }
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (stickyPage);


/***/ },

/***/ "./components/tab/Tab.js"
/*!*******************************!*\
  !*** ./components/tab/Tab.js ***!
  \*******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Tab)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);


const TAB_TRANSITION_DURATION = 300;
const _Tab = class _Tab extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_1__["default"] {
  static initAll() {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(".section__tabs").get().forEach((tab) => {
      _Tab.getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()(tab));
    });
  }
  static initEventListeners() {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", "[data-tab-index]", (ev) => {
      const targetIndex = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).attr("data-tab-index");
      const $container = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).closest(".section__tab-container");
      const tabInstance = _Tab.get($container);
      tabInstance.switchToTab(+targetIndex);
    });
  }
  constructor($dom) {
    super($dom);
    this.attached = false;
    this.hasMemo = false;
    this.attach();
  }
  async switchToTab(idx) {
    if (idx === this.currentIndex) return;
    if (this.isAnimating) return;
    const $tabs = this.$content.children();
    const $currentTab = $tabs.eq(this.currentIndex);
    const $newTab = $tabs.eq(idx);
    this.$header.children().removeClass("selected").eq(idx).addClass("selected");
    this.isAnimating = true;
    $newTab.addClass("active");
    const animateParameter = {};
    if (idx < this.currentIndex) {
      animateParameter.from = "-100%";
      animateParameter.to = "0%";
    } else {
      animateParameter.from = "0%";
      animateParameter.to = "-100%";
    }
    $newTab.css("opacity", 0);
    this.$content.css("x", animateParameter.from).width();
    $currentTab.transition(
      { opacity: 0 },
      {
        duration: TAB_TRANSITION_DURATION,
        easing: "linear"
      }
    );
    $newTab.transition(
      { opacity: 1 },
      {
        duration: TAB_TRANSITION_DURATION,
        easing: "linear"
      }
    );
    await this.$content.transition({
      x: animateParameter.to
    }, {
      duration: TAB_TRANSITION_DURATION,
      easing: "easeOutCubic"
    }).promise();
    this.$content.children().eq(this.currentIndex).removeClass("active");
    this.$content.css("x", "0");
    $newTab.trigger("vjContentShow");
    this.currentIndex = idx;
    if (this.hasMemo) location.hash = `#tab-${idx}`;
    this.isAnimating = false;
  }
  attach() {
    if (this.attached) return false;
    const $container = this.$dom.closest(".section__tab-container");
    const $headerWrapper = jquery__WEBPACK_IMPORTED_MODULE_0___default()(document.createElement("div")).addClass("section__tab-header-wrapper").appendTo($container);
    const $contentWrapper = jquery__WEBPACK_IMPORTED_MODULE_0___default()(document.createElement("div")).appendTo($container);
    this.$header = jquery__WEBPACK_IMPORTED_MODULE_0___default()(document.createElement("ul")).addClass("section__tab-header").attr("data-slideout-ignore", "on").appendTo($headerWrapper);
    this.$content = jquery__WEBPACK_IMPORTED_MODULE_0___default()(document.createElement("div")).addClass("section__tab-content").appendTo($contentWrapper);
    this.$dom.find(".section__tab-title").get().forEach((element, idx) => {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(document.createElement("li")).text(jquery__WEBPACK_IMPORTED_MODULE_0___default()(element).text()).addClass("section__tab-header-item").attr("data-tab-index", idx).appendTo(this.$header);
    });
    this.$dom.find(".section__tab-main").appendTo(this.$content);
    this.$dom.remove();
    this.$dom = $container;
    this.currentIndex = 0;
    this.hasMemo = this.$dom.hasClass("memo");
    if (this.hasMemo) {
      const getIdx = () => {
        const hash = location.hash.substring(1);
        const match = /^tab-(\d+)$/.exec(hash);
        if (match) {
          const idx = +match[1];
          if (!Number.isNaN(idx) && idx < this.$header.children().length) {
            return idx;
          }
        }
        return null;
      };
      const handleIdChange = () => {
        const idx = getIdx();
        if (typeof idx === "number") this.switchToTab(idx);
      };
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(window).on("hashchange", handleIdChange);
      handleIdChange();
    } else this.currentIndex = 0;
    this.$content.children().eq(this.currentIndex).addClass("active");
    this.$header.children().eq(this.currentIndex).addClass("selected");
    return true;
  }
};
__publicField(_Tab, "DOMAttachKey", "vjTabInstance");
let Tab = _Tab;



/***/ },

/***/ "./components/tab/tab.page.js"
/*!************************************!*\
  !*** ./components/tab/tab.page.js ***!
  \************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var _Tab__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Tab */ "./components/tab/Tab.js");


const tabPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__.AutoloadPage("tabPage", () => {
  _Tab__WEBPACK_IMPORTED_MODULE_1__["default"].initAll();
  _Tab__WEBPACK_IMPORTED_MODULE_1__["default"].initEventListeners();
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (tabPage);


/***/ },

/***/ "./components/table/StyledTable.js"
/*!*****************************************!*\
  !*** ./components/table/StyledTable.js ***!
  \*****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ StyledTable)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/breakpoints.json */ "./breakpoints.json");
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
/* harmony import */ var vj_utils_mediaQuery__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils/mediaQuery */ "./utils/mediaQuery.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);




const navHeight = (0,vj_utils_mediaQuery__WEBPACK_IMPORTED_MODULE_3__.isBelow)(vj_breakpoints_json__WEBPACK_IMPORTED_MODULE_1__.mobile) ? 0 : jquery__WEBPACK_IMPORTED_MODULE_0___default()(".nav").height();
class StyledTable extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_2__["default"] {
  constructor($dom) {
    if ($dom.closest(".section__body").length === 0) {
      super(null);
      return;
    }
    super($dom);
    this.$sentinel = jquery__WEBPACK_IMPORTED_MODULE_0___default()("<div>").css({ height: 0, margin: 0, padding: 0 });
    this.$header = jquery__WEBPACK_IMPORTED_MODULE_0___default()("<table>");
    this.$header.attr("class", `${this.$dom.attr("class")} section__table-header`);
    this.$header.css({
      position: "sticky",
      top: `${navHeight}px`
    });
    this.$container = jquery__WEBPACK_IMPORTED_MODULE_0___default()("<div>").addClass("section__table-container");
    this.$sentinel.insertBefore(this.$dom);
    this.$header.insertBefore(this.$dom);
    this.$container.insertBefore(this.$dom);
    this.$container.append(this.$dom);
    this.$header.empty();
    this.$dom.children("colgroup").clone().appendTo(this.$header);
    this.$dom.children("thead").appendTo(this.$header);
    this.$container.on("scroll", () => {
      this.$header.css("transform", `translateX(-${this.$container.scrollLeft()}px)`);
    });
    const header = this.$header[0];
    const sentinel = this.$sentinel[0];
    if (window.IntersectionObserver) {
      this._observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            header.classList.remove("is_stuck");
          } else {
            header.classList.add("is_stuck");
          }
        },
        { threshold: [0], rootMargin: `-${navHeight}px 0px 0px 0px` }
      );
      this._observer.observe(sentinel);
    }
  }
  detach() {
    if (this._observer) this._observer.disconnect();
    super.detach();
  }
}
__publicField(StyledTable, "DOMAttachKey", "vjStyledTableInstance");
__publicField(StyledTable, "DOMAttachSelector", ".data-table");


/***/ },

/***/ "./components/table/styledTable.page.js"
/*!**********************************************!*\
  !*** ./components/table/styledTable.page.js ***!
  \**********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var _StyledTable__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./StyledTable */ "./components/table/StyledTable.js");


const styledTablePage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_0__.AutoloadPage("styledTablePage", () => {
  _StyledTable__WEBPACK_IMPORTED_MODULE_1__["default"].registerLifeCycleHooks();
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (styledTablePage);


/***/ },

/***/ "./components/time/time.page.js"
/*!**************************************!*\
  !*** ./components/time/time.page.js ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var timeago_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! timeago.js */ "../../node_modules/timeago.js/esm/index.js");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




try {
  const locales = __webpack_require__("../../node_modules/timeago.js/lib/lang sync \\.js$");
  let locale;
  try {
    locale = locales(`./${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("timeago_locale")}.js`).default;
  } catch (e) {
    locale = locales("./en_US.js").default;
  }
  timeago_js__WEBPACK_IMPORTED_MODULE_1__.register((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("timeago_locale"), locale);
} catch (e) {
  console.error(`Cannot register timeago locale: ${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("timeago_locale")}`);
}
function runRelativeTime($container) {
  $container.find("span.time.relative[data-timestamp]").get().forEach((element) => {
    const $element = jquery__WEBPACK_IMPORTED_MODULE_0___default()(element);
    if ($element.attr("data-has-timeago") !== void 0) return;
    $element.attr("data-tooltip", $element.text());
    $element.attr("datetime", ($element.attr("data-timestamp") || 0) * 1e3);
    $element.attr("data-has-timeago", "1");
    timeago_js__WEBPACK_IMPORTED_MODULE_1__.render(element, (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("timeago_locale"));
  });
}
function cancelRelativeTime($container) {
  $container.find("span.time.relative[data-timestamp]").get().forEach((element) => {
    const $element = jquery__WEBPACK_IMPORTED_MODULE_0___default()(element);
    if ($element.attr("data-has-timeago") === void 0) {
      return;
    }
    $element.removeAttr("data-has-timeago");
    timeago_js__WEBPACK_IMPORTED_MODULE_1__.cancel(element);
  });
}
const relativeTimePage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.AutoloadPage("relativeTimePage", () => {
  if (!UserContext.showTimeAgo) return;
  runRelativeTime(jquery__WEBPACK_IMPORTED_MODULE_0___default()("body"));
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjContentNew", (e) => runRelativeTime(jquery__WEBPACK_IMPORTED_MODULE_0___default()(e.target)));
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("vjContentRemove", (e) => cancelRelativeTime(jquery__WEBPACK_IMPORTED_MODULE_0___default()(e.target)));
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (relativeTimePage);


/***/ },

/***/ "./components/tooltip/Tooltip.js"
/*!***************************************!*\
  !*** ./components/tooltip/Tooltip.js ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ Tooltip)
/* harmony export */ });
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var tether_drop__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! tether-drop */ "../../node_modules/tether-drop/dist/js/drop.js");
/* harmony import */ var tether_drop__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(tether_drop__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/DOMAttachedObject */ "./components/DOMAttachedObject.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);



class Tooltip extends vj_components_DOMAttachedObject__WEBPACK_IMPORTED_MODULE_2__["default"] {
  constructor($dom, options = {}) {
    super($dom, true);
    this.dropRemoved = false;
    this.drop = new (tether_drop__WEBPACK_IMPORTED_MODULE_1___default())({
      target: $dom[0],
      classes: "tooltip",
      position: options.position || "top center",
      openOn: "hover",
      constrainToWindow: true,
      constrainToScrollParent: false,
      content: $dom.attr("data-tooltip")
    });
    this.isOpen = false;
    this.drop.on("open", this.onOpen, this);
    this.drop.on("close", this.onClose, this);
    this.delayDetach = lodash__WEBPACK_IMPORTED_MODULE_0___default().debounce(this.detach.bind(this), 200);
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
__publicField(Tooltip, "DOMAttachKey", "vjTooltipInstance");


/***/ },

/***/ "./components/tooltip/tooltip.page.js"
/*!********************************************!*\
  !*** ./components/tooltip/tooltip.page.js ***!
  \********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var _Tooltip__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./Tooltip */ "./components/tooltip/Tooltip.js");



function getClosestTooltipElement(element) {
  const MAX_DEPTH = 3;
  for (let i = 0, e = element; i < MAX_DEPTH && e !== null && e !== document; e = e.parentNode, i++) {
    if (e.getAttribute("data-tooltip")) {
      return e;
    }
  }
  return null;
}
const tooltipPage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.AutoloadPage("tooltipPage", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("mouseover", (e) => {
    const element = getClosestTooltipElement(e.target);
    if (!element) return;
    const $element = jquery__WEBPACK_IMPORTED_MODULE_0___default()(element);
    const options = {};
    if ($element.attr("data-tooltip-pos")) {
      options.position = $element.attr("data-tooltip-pos");
    }
    const tooltip = _Tooltip__WEBPACK_IMPORTED_MODULE_2__["default"].getOrConstruct($element, options);
    tooltip.open();
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (tooltipPage);


/***/ },

/***/ "./components/upload.tsx"
/*!*******************************!*\
  !*** ./components/upload.tsx ***!
  \*******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ uploadFiles)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineProvider.mjs");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/components/Progress/Progress.mjs");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/dialog/index */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");







function onBeforeUnload(e) {
  e.returnValue = "";
}
async function uploadFiles(endpoint = "", files = [], options = {}) {
  var _a, _b;
  let fileLabel = "";
  let uploadLabel = "";
  let fileProgress = 0;
  let uploadProgress = 0;
  let render = () => {
  };
  function ProgressDialog() {
    const [, setRender] = react__WEBPACK_IMPORTED_MODULE_4___default().useState(0);
    react__WEBPACK_IMPORTED_MODULE_4___default().useEffect(() => {
      render = () => setRender((r) => r + 1);
    }, []);
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(_mantine_core__WEBPACK_IMPORTED_MODULE_1__.MantineProvider, { children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        "div",
        {
          style: {
            textAlign: "center",
            marginBottom: "5px",
            color: "gray",
            fontSize: "small"
          },
          children: uploadLabel
        }
      ),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_2__.Progress, { value: uploadProgress }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        "div",
        {
          style: {
            textAlign: "center",
            margin: "5px 0",
            color: "gray",
            fontSize: "small"
          },
          children: fileLabel
        }
      ),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_2__.Progress, { value: fileProgress })
    ] });
  }
  const dialog = new vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_5__.Dialog({
    $body: jquery__WEBPACK_IMPORTED_MODULE_3___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.tpl)(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ProgressDialog, {}), true))
  });
  try {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_6__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Uploading files..."));
    window.addEventListener("beforeunload", onBeforeUnload);
    dialog.open();
    for (const i in files) {
      if (Number.isNaN(+i)) continue;
      const file = files[i];
      const data = new FormData();
      data.append("filename", ((_a = options.filenameCallback) == null ? void 0 : _a.call(options, file)) || file.name);
      data.append("file", file);
      if (options.type) data.append("type", options.type);
      data.append("operation", "upload_file");
      await vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.postFile(endpoint, data, {
        xhr() {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("loadstart", () => {
            uploadLabel = `[${+i + 1}/${files.length}] ${file.name} `;
            uploadProgress = Math.round((+i + 1) / files.length * 100);
            fileLabel = (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Uploading... ({0}%)", 0);
            fileProgress = 0;
            render();
          });
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round(e.loaded / e.total * 100);
              if (percentComplete === 100) fileLabel = (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Processing...");
              else fileLabel = (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Uploading... ({0}%)", percentComplete);
              fileProgress = percentComplete;
              render();
            }
          }, false);
          return xhr;
        }
      });
      await ((_b = options.singleFileUploadCallback) == null ? void 0 : _b.call(options, file));
    }
    window.removeEventListener("beforeunload", onBeforeUnload);
    vj_components_notification__WEBPACK_IMPORTED_MODULE_6__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("File uploaded successfully."));
    if (options.pjax) {
      let params = "";
      if (options.type) params += `?d=${encodeURIComponent(options.type)}`;
      if (options.sidebar) params += `${params ? "&" : "?"}sidebar=true`;
      await vj_utils__WEBPACK_IMPORTED_MODULE_7__.pjax.request({ push: false, url: `${endpoint}${params || ""}` });
    }
  } catch (e) {
    console.error(e);
    vj_components_notification__WEBPACK_IMPORTED_MODULE_6__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("File upload failed: {0}", e.toString()));
  } finally {
    await (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.delay)(500);
    dialog.close();
  }
}


/***/ },

/***/ "./components/vote/vote.page.js"
/*!**************************************!*\
  !*** ./components/vote/vote.page.js ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_components_rotator__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/rotator */ "./components/rotator/index.js");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");





function setVoteState($container, value, status) {
  const $num = $container.find(".vote-number");
  vj_components_rotator__WEBPACK_IMPORTED_MODULE_2__["default"].get($num).setValue(value);
  $container.find(".vote-button").removeClass("active");
  if (status === 1) {
    $container.find(".upvote").addClass("active");
  } else if (status === -1) {
    $container.find(".downvote").addClass("active");
  }
}
function applyRotator(element) {
  vj_components_rotator__WEBPACK_IMPORTED_MODULE_2__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()(element));
}
const votePage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__.AutoloadPage("votePage", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".vote-number.rotator--enabled").get().forEach((element) => applyRotator(element));
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", ".vote-button", (ev) => {
    const $button = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget);
    const $container = $button.closest(".vote");
    const $form = $button.closest("form");
    vj_utils__WEBPACK_IMPORTED_MODULE_4__.request.post($form.attr("action"), {
      operation: $button.attr("value"),
      psid: $form.find('input[name="psid"]').val()
    }).then((data) => {
      setVoteState($container, data.vote, data.user_vote);
    }).catch((e) => {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].error(`Failed to vote: ${e.message}`);
    });
    return false;
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (votePage);


/***/ },

/***/ "./components/zipDownloader/index.ts"
/*!*******************************************!*\
  !*** ./components/zipDownloader/index.ts ***!
  \*******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ download),
/* harmony export */   downloadProblemSet: () => (/* binding */ downloadProblemSet)
/* harmony export */ });
/* harmony import */ var _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @hydrooj/utils/lib/common */ "../../framework/utils/lib/common.ts");
/* harmony import */ var js_yaml__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! js-yaml */ "../../node_modules/js-yaml/dist/js-yaml.mjs");
/* harmony import */ var p_queue__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! p-queue */ "../../node_modules/p-queue/dist/index.js");
/* harmony import */ var streamsaver__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! streamsaver */ "../../node_modules/streamsaver/StreamSaver.js");
/* harmony import */ var streamsaver__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(streamsaver__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var _context__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../context */ "./context.ts");







let isBeforeUnloadTriggeredByLibrary = !window.isSecureContext;
function onBeforeUnload(e) {
  if (isBeforeUnloadTriggeredByLibrary) {
    isBeforeUnloadTriggeredByLibrary = false;
    return;
  }
  e.returnValue = "";
}
(streamsaver__WEBPACK_IMPORTED_MODULE_3___default().mitm) = `${window.isSecureContext ? "" : "https://hydro.ac"}/streamsaver/mitm.html`;
const waitForWritableStream = window.WritableStream ? Promise.resolve() : __webpack_require__.e(/*! import() */ "n.js-yaml").then(__webpack_require__.bind(__webpack_require__, /*! web-streams-polyfill */ "../../node_modules/web-streams-polyfill/dist/ponyfill.mjs")).then(({ WritableStream }) => {
  window.WritableStream = WritableStream;
  (streamsaver__WEBPACK_IMPORTED_MODULE_3___default().WritableStream) = window.WritableStream;
});
async function download(filename, targets) {
  await waitForWritableStream;
  const fileStream = streamsaver__WEBPACK_IMPORTED_MODULE_3___default().createWriteStream(filename);
  const queue = new p_queue__WEBPACK_IMPORTED_MODULE_2__["default"]({ concurrency: 5 });
  const abortCallbackReceiver = {};
  function stopDownload() {
    var _a;
    (_a = abortCallbackReceiver.abort) == null ? void 0 : _a.call(abortCallbackReceiver);
  }
  let i = 0;
  async function downloadFile(target, retry = 5) {
    var _a;
    try {
      let stream;
      if (target.url) {
        const response = await fetch(target.url);
        if (!response.ok) throw response.statusText;
        stream = response.body;
      } else {
        stream = new Blob([target.content]).stream();
      }
      return {
        name: target.filename,
        stream
      };
    } catch (e) {
      if (retry) {
        vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].warn((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Download Error: {0} {1}, retry in 3 secs...", [target.filename, e.toString()]));
        await (0,_hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_0__.sleep)(3e3);
        return await downloadFile(target, retry - 1);
      }
      (_a = window.captureException) == null ? void 0 : _a.call(window, e);
      stopDownload();
      vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Download Error: {0} {1}", [target.filename, e.toString()]));
    }
    return {};
  }
  const handles = [];
  for (const target of targets) {
    handles.push(queue.add(() => downloadFile(target)));
  }
  queue.start();
  const zipStream = (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.createZipStream)({
    // eslint-disable-next-line consistent-return
    async pull(ctrl) {
      if (!handles[i]) return ctrl.close();
      const { name, stream } = await handles[i];
      i++;
      ctrl.enqueue({
        name,
        stream: () => stream
      });
    }
  });
  window.addEventListener("unload", stopDownload);
  window.addEventListener("beforeunload", onBeforeUnload);
  await (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.pipeStream)(zipStream, fileStream, abortCallbackReceiver);
  window.removeEventListener("unload", stopDownload);
  window.removeEventListener("beforeunload", onBeforeUnload);
}
async function downloadProblemSet(pids, name = "Export") {
  var _a, _b;
  vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Downloading..."));
  const targets = [];
  try {
    await _context__WEBPACK_IMPORTED_MODULE_6__.ctx.serial("problemset/download", pids, name, targets);
    for (const pid of pids) {
      const pdoc = await (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.api)("problem", { id: +pid }, {
        pid: 1,
        owner: 1,
        title: 1,
        content: 1,
        tag: 1,
        nSubmit: 1,
        nAccept: 1,
        data: {
          name: 1
        },
        additional_file: {
          name: 1
        }
      });
      targets.push({
        filename: `${pid}/problem.yaml`,
        content: (0,js_yaml__WEBPACK_IMPORTED_MODULE_1__.dump)({
          pid: pdoc.pid,
          owner: pdoc.owner,
          title: pdoc.title,
          tag: pdoc.tag,
          nSubmit: pdoc.nSubmit,
          nAccept: pdoc.nAccept
        })
      });
      try {
        const c = JSON.parse(pdoc.content);
        if (c instanceof Array || typeof c === "string") throw new Error("Invalid content");
        for (const key of Object.keys(c)) {
          targets.push({
            filename: `${pid}/problem_${key}.md`,
            content: typeof c[key] === "string" ? c[key] : JSON.stringify(c[key])
          });
        }
      } catch (e) {
        targets.push({
          filename: `${pid}/problem.md`,
          content: pdoc.content
        });
      }
      let { links } = await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post(
        `/d/${UiContext.domainId}/p/${pid}/files`,
        { operation: "get_links", files: (pdoc.data || []).map((i) => i.name), type: "testdata" }
      );
      for (const filename of Object.keys(links)) {
        targets.push({ filename: `${pid}/testdata/${filename}`, url: links[filename] });
      }
      ({ links } = await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post(`/d/${UiContext.domainId}/p/${pid}/files`, {
        operation: "get_links",
        files: (pdoc.additional_file || []).map((i) => i.name),
        type: "additional_file"
      }));
      for (const filename of Object.keys(links)) {
        targets.push({ filename: `${pid}/additional_file/${filename}`, url: links[filename] });
      }
    }
    await download(`${name}.zip`, targets);
  } catch (e) {
    (_a = window.captureException) == null ? void 0 : _a.call(window, e);
    vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error(`${e.message} ${(_b = e.params) == null ? void 0 : _b[0]}`);
  }
}


/***/ },

/***/ "./constant/domain.js"
/*!****************************!*\
  !*** ./constant/domain.js ***!
  \****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   JOIN_METHOD_CODE: () => (/* binding */ JOIN_METHOD_CODE),
/* harmony export */   JOIN_METHOD_NONE: () => (/* binding */ JOIN_METHOD_NONE)
/* harmony export */ });
/* unused harmony exports JOIN_METHOD_ALL, JOIN_METHOD_RANGE, JOIN_EXPIRATION_KEEP_CURRENT, JOIN_EXPIRATION_UNLIMITED, JOIN_EXPIRATION_RANGE */
const JOIN_METHOD_NONE = 0;
const JOIN_METHOD_ALL = 1;
const JOIN_METHOD_CODE = 2;
const JOIN_METHOD_RANGE = {
  [JOIN_METHOD_NONE]: "No user is allowed to join this domain",
  [JOIN_METHOD_ALL]: "Any user is allowed to join this domain",
  [JOIN_METHOD_CODE]: "Any user is allowed to join this domain with an invitation code"
};
const JOIN_EXPIRATION_KEEP_CURRENT = 0;
const JOIN_EXPIRATION_UNLIMITED = -1;
const JOIN_EXPIRATION_RANGE = {
  [JOIN_EXPIRATION_KEEP_CURRENT]: "Keep current expiration",
  3: "In 3 hours",
  24: "In 1 day",
  [24 * 3]: "In 3 days",
  [24 * 7]: "In 1 week",
  [24 * 30]: "In 1 month",
  [JOIN_EXPIRATION_UNLIMITED]: "Never expire"
};


/***/ },

/***/ "./constant/message.js"
/*!*****************************!*\
  !*** ./constant/message.js ***!
  \*****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   FLAG_ALERT: () => (/* binding */ FLAG_ALERT),
/* harmony export */   FLAG_I18N: () => (/* binding */ FLAG_I18N),
/* harmony export */   FLAG_INFO: () => (/* binding */ FLAG_INFO),
/* harmony export */   FLAG_RICHTEXT: () => (/* binding */ FLAG_RICHTEXT)
/* harmony export */ });
/* unused harmony export FLAG_UNREAD */
const FLAG_UNREAD = 1;
const FLAG_ALERT = 2;
const FLAG_RICHTEXT = 4;
const FLAG_INFO = 8;
const FLAG_I18N = 16;


/***/ },

/***/ "./constant/record.js"
/*!****************************!*\
  !*** ./constant/record.js ***!
  \****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   STATUS_CODES: () => (/* binding */ STATUS_CODES),
/* harmony export */   STATUS_SCRATCHPAD_SHORT_TEXTS: () => (/* binding */ STATUS_SCRATCHPAD_SHORT_TEXTS),
/* harmony export */   STATUS_SCRATCHPAD_SHOW_DETAIL_FLAGS: () => (/* binding */ STATUS_SCRATCHPAD_SHOW_DETAIL_FLAGS),
/* harmony export */   STATUS_TEXTS: () => (/* reexport safe */ _hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS_TEXTS)
/* harmony export */ });
/* harmony import */ var _hydrooj_common__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @hydrooj/common */ "../common/status.ts");


const STATUS_CODES = {
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_WAITING]: "pending",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_ACCEPTED]: "pass",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_WRONG_ANSWER]: "fail",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_TIME_LIMIT_EXCEEDED]: "fail",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: "fail",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED]: "fail",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_RUNTIME_ERROR]: "fail",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_COMPILE_ERROR]: "fail",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_SYSTEM_ERROR]: "fail",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_CANCELED]: "ignored",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_ETC]: "fail",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_JUDGING]: "progress",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_COMPILING]: "progress",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATTUS_FETCHED]: "progress",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_IGNORED]: "ignored"
};
const STATUS_SCRATCHPAD_SHOW_DETAIL_FLAGS = {
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_WAITING]: false,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_ACCEPTED]: true,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_WRONG_ANSWER]: true,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_TIME_LIMIT_EXCEEDED]: true,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: true,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_RUNTIME_ERROR]: true,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_COMPILE_ERROR]: false,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_SYSTEM_ERROR]: false,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_CANCELED]: false,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_ETC]: false,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_JUDGING]: false,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_COMPILING]: false,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_FETCHED]: false,
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_IGNORED]: false
};
const STATUS_SCRATCHPAD_SHORT_TEXTS = {
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_ACCEPTED]: "AC",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_WRONG_ANSWER]: "WA",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_TIME_LIMIT_EXCEEDED]: "TLE",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: "MLE",
  [_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_RUNTIME_ERROR]: "RTE"
};


/***/ },

/***/ "./context.ts"
/*!********************!*\
  !*** ./context.ts ***!
  \********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Context: () => (/* reexport safe */ cordis__WEBPACK_IMPORTED_MODULE_0__.Context),
/* harmony export */   Service: () => (/* reexport safe */ cordis__WEBPACK_IMPORTED_MODULE_0__.Service),
/* harmony export */   ctx: () => (/* binding */ ctx)
/* harmony export */ });
/* harmony import */ var cordis__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! cordis */ "../../node_modules/cordis/lib/index.js");


const ctx = new cordis__WEBPACK_IMPORTED_MODULE_0__.Context();


/***/ },

/***/ "./hydro.ts"
/*!******************!*\
  !*** ./hydro.ts ***!
  \******************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   initPageLoader: () => (/* binding */ initPageLoader)
/* harmony export */ });
/* harmony import */ var jquery_transit__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery.transit */ "../../node_modules/jquery.transit/jquery.transit.js");
/* harmony import */ var jquery_transit__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery_transit__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_PageLoader__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/PageLoader */ "./misc/PageLoader.js");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");






const start = /* @__PURE__ */ new Date();
function buildSequence(pages, type) {
  if (true) {
    if (!["before", "after"].includes(type)) {
      throw new Error("'type' should be one of 'before' or 'after'");
    }
  }
  return pages.filter((p) => p && p[`${type}Loading`]).map((p) => ({
    page: p,
    func: p[`${type}Loading`],
    type
  }));
}
function rounded() {
  if (!UserContext.rounded) return;
  const style = document.createElement("style");
  style.innerHTML = `
    .section { border-radius: 8px; }
    .section__table-header { border-radius: 8px 8px 0 0; }
  `;
  document.head.append(style);
}
async function animate() {
  if (UserContext.skipAnimate) return;
  const style = document.createElement("style");
  style.innerHTML = `.section {
    transition: transform .5s, opacity .5s;
    transition-timing-function: ease-out-cubic;
  }`;
  document.head.append(style);
  const sections = lodash__WEBPACK_IMPORTED_MODULE_2___default().map(jquery__WEBPACK_IMPORTED_MODULE_1___default()(".section").get(), (section, idx) => ({
    shouldDelay: idx < 5,
    // only animate first 5 sections
    $element: jquery__WEBPACK_IMPORTED_MODULE_1___default()(section)
  }));
  for (const { $element, shouldDelay } of sections) {
    $element.addClass("visible");
    if (shouldDelay) await (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.delay)(50);
  }
}
async function initPageLoader() {
  var _a;
  const pageLoader = new vj_misc_PageLoader__WEBPACK_IMPORTED_MODULE_4__["default"]();
  rounded();
  const currentPageName = document.documentElement.getAttribute("data-page");
  const currentPage = pageLoader.getNamedPage(currentPageName);
  const includedPages = pageLoader.getAutoloadPages();
  const loadSequence = [
    ...buildSequence(includedPages, "before"),
    ...buildSequence(currentPage, "before"),
    ...buildSequence(includedPages, "after"),
    ...buildSequence(currentPage, "after")
  ];
  const loadPage = (depth, type) => async (name) => {
    if (depth > 32) {
      console.error("loadPage depth", depth);
      return;
    }
    for (const { func } of buildSequence(pageLoader.getPage(name), type)) {
      await func(name, loadPage(depth + 1, type));
    }
  };
  for (const { page, func, type } of loadSequence) {
    const ts = Date.now();
    try {
      await func(currentPageName, loadPage(1, type));
    } catch (e) {
      (_a = window.captureException) == null ? void 0 : _a.call(window, e);
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].warn(`Failed to call '${type}Loading' of ${page.name}`);
      console.error(`Failed to call '${type}Loading' of ${page.name}
${e.stack}`);
      console.error(e);
    }
    if (true) {
      console.time(`${page.name}: ${type}Loading`);
    }
    const time = Date.now() - ts;
    if ( true && time > 16 || time > 256) {
      console.log(`${page.name}: ${type}Loading took ${time}ms`);
    }
  }
  console.log("done! %d ms", Date.now() - start.getTime());
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(".page-loader").hide();
  await animate();
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(".section").addClass("visible");
  await (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.delay)(500);
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(".section").trigger("vjLayout");
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).trigger("vjPageFullyInitialized");
}


/***/ },

/***/ "./lazyload.ts"
/*!*********************!*\
  !*** ./lazyload.ts ***!
  \*********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getFeatures: () => (/* binding */ getFeatures),
/* harmony export */   load: () => (/* binding */ load),
/* harmony export */   loadFeatures: () => (/* binding */ loadFeatures),
/* harmony export */   loaded: () => (/* binding */ loaded),
/* harmony export */   provideFeature: () => (/* binding */ provideFeature)
/* harmony export */ });
/* unused harmony export default */
const lazyModules = {};
const features = {};
const host = UiContext.cdn_dynamic ? UiContext.cdn_prefix : "/";
async function load(name) {
  var _a;
  if (name === "echarts") return Promise.all(/*! import() */[__webpack_require__.e("n.echarts"), __webpack_require__.e("n.zrender"), __webpack_require__.e("vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76")]).then(__webpack_require__.bind(__webpack_require__, /*! echarts */ "../../node_modules/echarts/index.js"));
  if (name === "moment") return Promise.resolve(/*! import() */).then(__webpack_require__.t.bind(__webpack_require__, /*! moment */ "../../node_modules/moment/moment.js", 23));
  if (!((_a = window.lazyloadMetadata) == null ? void 0 : _a[`${name}.lazy.js`])) throw new Error(`Module ${name} not found`);
  if (lazyModules[name]) return lazyModules[name];
  const tag = document.createElement("script");
  tag.src = `${host}lazy/${window.lazyloadMetadata[`${name}.lazy.js`]}/${name}.lazy.js`;
  console.log("loading module: ", name);
  lazyModules[name] = new Promise((resolve, reject) => {
    tag.onerror = reject;
    const timeout = setTimeout(reject, 3e4);
    window.lazyModuleResolver[name] = (item) => {
      clearTimeout(timeout);
      resolve(item);
    };
  });
  document.body.appendChild(tag);
  return lazyModules[name];
}
const val = {};
async function legacyLoadExternalModule(target) {
  if (val[target]) return val[target];
  const ele = document.createElement("script");
  ele.src = target;
  await new Promise((resolve, reject) => {
    ele.onload = resolve;
    ele.onerror = reject;
    document.head.appendChild(ele);
  });
  val[target] = window.exports;
  return val[target];
}

async function getFeatures(name) {
  const legacy = Object.keys(window.externalModules).filter((i) => i === name || i.startsWith(`${name}@`)).map((i) => window.externalModules[i]);
  const c = Object.keys(features).filter((i) => i === name || i.startsWith(`${name}@`)).map((i) => features[i]);
  console.log("query features for:", name, "legacy:", legacy, "selected:", c, "all:", features);
  return [...c, ...legacy];
}
const loaded = [];
async function loadFeatures(name, ...args) {
  if (loaded.includes(name)) return;
  loaded.push(name);
  for (const item of await getFeatures(name)) {
    let apply = typeof item === "function" ? item : item.startsWith("http") || item.startsWith("/") ? await legacyLoadExternalModule(item) : (await load(item)).apply;
    if (typeof apply !== "function") apply = apply.default || apply.apply;
    if (typeof apply === "function") await apply(...args);
  }
}
function provideFeature(name, content) {
  console.debug("Providing feature", name);
  if (features[name]) console.warn("Feature", name, "already provided");
  features[name] = content;
  if (loaded.includes(name)) console.warn("Feature", name, "already loaded");
}


/***/ },

/***/ "./misc/Page.ts"
/*!**********************!*\
  !*** ./misc/Page.ts ***!
  \**********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AutoloadPage: () => (/* binding */ AutoloadPage),
/* harmony export */   NamedPage: () => (/* binding */ NamedPage),
/* harmony export */   Page: () => (/* binding */ Page)
/* harmony export */ });
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
class Page {
  constructor(name, ...args) {
    __publicField(this, "name", name);
    __publicField(this, "moduleName");
    __publicField(this, "autoload", false);
    __publicField(this, "afterLoading");
    __publicField(this, "beforeLoading");
    if (typeof args[0] === "string") {
      [this.moduleName, this.afterLoading, this.beforeLoading] = args;
    } else {
      [this.afterLoading, this.beforeLoading] = args;
    }
    if (true) {
      if (typeof name !== "string" && !(name instanceof Array)) {
        throw new TypeError("'name' should be a string or string[]");
      }
      if (typeof this.afterLoading !== "function" && this.afterLoading != null) {
        throw new Error("'afterLoading' should be a function");
      }
      if (typeof this.beforeLoading !== "function" && this.beforeLoading != null) {
        throw new Error("'beforeLoading' should be a function");
      }
    }
  }
  isNameMatch(name) {
    if (typeof this.name === "string") return this.name === name;
    if (this.name instanceof Array) return this.name.includes(name);
    return false;
  }
}
class NamedPage extends Page {
}
class AutoloadPage extends Page {
  constructor(pagename, ...args) {
    super(pagename, ...args);
    this.autoload = true;
  }
}
window.Hydro.NamedPage = NamedPage;
window.Hydro.AutoloadPage = AutoloadPage;


/***/ },

/***/ "./misc/PageLoader.js"
/*!****************************!*\
  !*** ./misc/PageLoader.js ***!
  \****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ PageLoader)
/* harmony export */ });
/* harmony import */ var _Page__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Page */ "./misc/Page.ts");

class PageLoader {
  constructor() {
    const pages = __webpack_require__("./pages sync recursive \\.page\\.[jt]sx?$i");
    const components = __webpack_require__("./components sync recursive \\.page\\.[jt]sx?$i");
    this.pageInstances = [
      ...pages.keys().map((key) => pages(key)),
      ...components.keys().map((key) => components(key)),
      ...window.Hydro.extraPages
    ].map((page) => {
      page = (page == null ? void 0 : page.default) || page;
      if (!page || !(page instanceof _Page__WEBPACK_IMPORTED_MODULE_0__.Page)) return null;
      return page;
    }).filter((i) => i);
    window.Hydro.pageInstances = this.pageInstances;
    window.Hydro.extraPages.filter((i) => !(i instanceof _Page__WEBPACK_IMPORTED_MODULE_0__.Page)).forEach((i) => i());
  }
  getAutoloadPages() {
    return this.pageInstances.filter((page) => page && page.autoload);
  }
  getNamedPage(pageName) {
    return this.pageInstances.filter((page) => page && page.isNameMatch(pageName));
  }
  getPage(moduleName) {
    return this.pageInstances.filter((page) => page && page.moduleName === moduleName);
  }
}


/***/ },

/***/ "./pages/contest.page.ts"
/*!*******************************!*\
  !*** ./pages/contest.page.ts ***!
  \*******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @hydrooj/utils/lib/common */ "../../framework/utils/lib/common.ts");
/* harmony import */ var nprogress__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! nprogress */ "../../node_modules/nprogress/nprogress.js");
/* harmony import */ var nprogress__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(nprogress__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* provided dependency */ var $ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");




const contestTimer = $((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.tpl)`<pre class="contest-timer" style="display:none"></pre>`);
contestTimer.appendTo(document.body);
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage(["contest_detail", "contest_problemlist", "contest_detail_problem", "contest_scoreboard"], () => {
  var _a, _b;
  const beginAt = new Date(UiContext.tdoc.duration && ((_a = UiContext.tsdoc) == null ? void 0 : _a.startAt) || UiContext.tdoc.beginAt).getTime();
  const endAt = new Date(((_b = UiContext.tsdoc) == null ? void 0 : _b.endAt) || UiContext.tdoc.endAt).getTime();
  nprogress__WEBPACK_IMPORTED_MODULE_1___default().configure({ trickle: false, showSpinner: false, minimum: 0 });
  function updateProgress() {
    const now = Date.now();
    if (beginAt <= now && now <= endAt) {
      nprogress__WEBPACK_IMPORTED_MODULE_1___default().set((now - beginAt) / (endAt - beginAt));
      contestTimer.show();
      contestTimer.text((0,_hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_0__.formatSeconds)(Math.floor((endAt - now) / 1e3)));
    } else contestTimer.hide();
  }
  nprogress__WEBPACK_IMPORTED_MODULE_1___default().start();
  updateProgress();
  setInterval(updateProgress, 1e3);
  (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.addSpeculationRules)({
    prerender: [{
      where: {
        or: [
          { href_matches: "/p/*" },
          { href_matches: "/d/*/p/*" }
        ]
      }
    }]
  });
}));


/***/ },

/***/ "./pages/contest_balloon.page.tsx"
/*!****************************************!*\
  !*** ./pages/contest_balloon.page.tsx ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/utils/lib/common */ "../../framework/utils/lib/common.ts");
/* harmony import */ var js_yaml__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! js-yaml */ "../../node_modules/js-yaml/dist/js-yaml.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var react_colorful__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react-colorful */ "../../node_modules/react-colorful/dist/index.mjs");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* provided dependency */ var $ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");









function Balloon({ tdoc, val }) {
  const [color, setColor] = react__WEBPACK_IMPORTED_MODULE_3___default().useState("");
  const [now, setNow] = react__WEBPACK_IMPORTED_MODULE_3___default().useState("");
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "medium-12 columns", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("table", { className: "data-table", children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("thead", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("tr", { children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Problem") }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Color") }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Name") }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "icon icon-wrench" }) })
    ] }) }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("tbody", { children: tdoc.pids.map((pid) => {
      const { color: c, name } = val[+pid];
      return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("tr", { children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { children: now === pid ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("b", { children: (0,_hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_1__.getAlphabeticId)(tdoc.pids.indexOf(+pid)) }) : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { children: (0,_hydrooj_utils_lib_common__WEBPACK_IMPORTED_MODULE_1__.getAlphabeticId)(tdoc.pids.indexOf(+pid)) }) }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
          react_colorful__WEBPACK_IMPORTED_MODULE_4__.HexColorInput,
          {
            className: "textbox",
            color: c,
            onFocus: () => {
              setNow(pid);
              setColor(c);
            },
            onChange: (e) => {
              val[+pid].color = e;
              setColor(e);
            }
          }
        ) }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
          "input",
          {
            type: "text",
            className: "textbox",
            defaultValue: name,
            onFocus: () => {
              setNow(pid);
              setColor(c);
            },
            onChange: (e) => {
              val[+pid].name = e.target.value;
            }
          }
        ) }),
        tdoc.pids.indexOf(+pid) === 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { rowSpan: 0, children: now && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(react_colorful__WEBPACK_IMPORTED_MODULE_4__.HexColorPicker, { color, onChange: (e) => {
          val[+now].color = e;
          setColor(e);
        }, style: { padding: "1rem" } }) })
      ] }, pid);
    }) })
  ] }) }) });
}
async function handleSetColor(tdoc) {
  var _a, _b;
  const val = tdoc.balloon || {};
  for (const pid of tdoc.pids) val[_a = +pid] || (val[_a] = { color: "#ffffff", name: "" });
  vj_components_notification__WEBPACK_IMPORTED_MODULE_6__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Loading..."));
  const action = await new vj_components_dialog__WEBPACK_IMPORTED_MODULE_5__.ActionDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.tpl)(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "columns", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h1", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Set Color") }) }) }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Balloon, { tdoc, val })
    ] }), true)
  }).open();
  if (action !== "ok") return;
  vj_components_notification__WEBPACK_IMPORTED_MODULE_6__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Updating..."));
  try {
    await vj_utils__WEBPACK_IMPORTED_MODULE_8__.request.post("", { operation: "set_color", color: js_yaml__WEBPACK_IMPORTED_MODULE_2__["default"].dump(val) });
  } catch (e) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_6__["default"].error(`${e.message} ${(_b = e.params) == null ? void 0 : _b[0]}`);
  }
  vj_components_notification__WEBPACK_IMPORTED_MODULE_6__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Successfully updated."));
  if ($('[data-fragment-id="constest_balloon-tbody"]').length) vj_utils__WEBPACK_IMPORTED_MODULE_8__.pjax.request({ url: "", push: false });
  else window.location.reload();
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_7__.NamedPage("contest_balloon", () => {
  const { tdoc } = UiContext;
  const beginAt = new Date(tdoc.beginAt).getTime();
  const endAt = new Date(tdoc.endAt).getTime();
  function update() {
    const now = Date.now();
    if (beginAt <= now && now <= endAt) vj_utils__WEBPACK_IMPORTED_MODULE_8__.pjax.request({ url: "", push: false });
  }
  $('[name="set_color"]').on("click", () => handleSetColor(tdoc));
  setInterval(update, 6e4);
  $(document).on("click", '[value="done"]', async (ev) => {
    var _a;
    ev.preventDefault();
    const balloon = $(ev.currentTarget).data("balloon");
    try {
      await vj_utils__WEBPACK_IMPORTED_MODULE_8__.request.post("", { balloon, operation: "done" });
    } catch (e) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_6__["default"].error(`${e.message} ${(_a = e.params) == null ? void 0 : _a[0]}`);
    }
    vj_components_notification__WEBPACK_IMPORTED_MODULE_6__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Successfully updated."));
    vj_utils__WEBPACK_IMPORTED_MODULE_8__.pjax.request({ url: "", push: false });
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/contest_clarification.page.tsx"
/*!**********************************************!*\
  !*** ./pages/contest_clarification.page.tsx ***!
  \**********************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");


function handleReplyOrBroadcast(ev) {
  const title = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).data("title");
  const did = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).data("did");
  jquery__WEBPACK_IMPORTED_MODULE_0___default()("#reply_or_broadcast .section_title").text(title);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('#reply_or_broadcast [name="did"]').val(did != null ? did : "");
  const $item = jquery__WEBPACK_IMPORTED_MODULE_0___default()(`#clarification_${did} .media`);
  if ($item.length) {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("#reply_or_broadcast .form__item_subject").hide();
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("#reply_or_broadcast .clarification-container").empty().append($item.clone());
  } else {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("#reply_or_broadcast .form__item_subject").show();
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("#reply_or_broadcast .clarification-container").empty();
  }
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.NamedPage("contest_clarification", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="broadcast"]', handleReplyOrBroadcast);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="reply"]', handleReplyOrBroadcast);
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/contest_edit.page.ts"
/*!************************************!*\
  !*** ./pages/contest_edit.page.ts ***!
  \************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var moment__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! moment */ "../../node_modules/moment/moment.js");
/* harmony import */ var moment__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(moment__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_components_autocomplete_AssignSelectAutoComplete__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/autocomplete/AssignSelectAutoComplete */ "./components/autocomplete/AssignSelectAutoComplete.tsx");
/* harmony import */ var vj_components_autocomplete_LanguageSelectAutoComplete__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/autocomplete/LanguageSelectAutoComplete */ "./components/autocomplete/LanguageSelectAutoComplete.tsx");
/* harmony import */ var vj_components_autocomplete_ProblemSelectAutoComplete__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/autocomplete/ProblemSelectAutoComplete */ "./components/autocomplete/ProblemSelectAutoComplete.tsx");
/* harmony import */ var vj_components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/autocomplete/UserSelectAutoComplete */ "./components/autocomplete/UserSelectAutoComplete.tsx");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");









const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_7__.NamedPage(["contest_edit", "contest_create", "homework_create", "homework_edit"], (pagename) => {
  vj_components_autocomplete_ProblemSelectAutoComplete__WEBPACK_IMPORTED_MODULE_4__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="pids"]'), { multi: true, clearDefaultValue: false });
  vj_components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_5__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="maintainer"]'), { multi: true, clearDefaultValue: false });
  if (pagename.startsWith("homework")) {
    vj_components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_5__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="assignedUsers"]'), { multi: true, clearDefaultValue: false });
  }
  vj_components_autocomplete_LanguageSelectAutoComplete__WEBPACK_IMPORTED_MODULE_3__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()("[name=langs]"), { multi: true });
  if (!pagename.startsWith("homework")) {
    vj_components_autocomplete_AssignSelectAutoComplete__WEBPACK_IMPORTED_MODULE_2__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="assign"]'), { multi: true });
  }
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="rule"]').on("change", () => {
    const rule = jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="rule"]').val();
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(".contest-rule-settings input").attr("disabled", "disabled");
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(".contest-rule-settings").hide();
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(`.contest-rule--${rule} input`).removeAttr("disabled");
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(`.contest-rule--${rule}`).show();
  }).trigger("change");
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="beginAtDate"], [name="beginAtTime"], [name="duration"]').on("change", () => {
    const beginAtDate = jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="beginAtDate"]').val();
    const beginAtTime = jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="beginAtTime"]').val();
    const duration = jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="duration"]').val();
    const endAt = moment__WEBPACK_IMPORTED_MODULE_1___default()(`${beginAtDate} ${beginAtTime}`).add(+duration, "hours").toDate();
    if (endAt) jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="endAt"]').val(moment__WEBPACK_IMPORTED_MODULE_1___default()(endAt).format("YYYY-MM-DD HH:mm"));
  });
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="permission"]').removeAttr("disabled").on("change", () => {
    const type = jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="permission"]').val();
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("[data-perm] input").attr("disabled", "disabled");
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("[data-perm]").hide();
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(`[data-perm="${type}"] input`).removeAttr("disabled");
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(`[data-perm="${type}"]`).show();
  }).trigger("change");
  if (pagename.endsWith("edit")) {
    let confirmed = false;
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[value="delete"]', (ev) => {
      ev.preventDefault();
      if (confirmed) {
        return vj_utils__WEBPACK_IMPORTED_MODULE_8__.request.post("", { operation: "delete" }).then((res) => {
          window.location.href = res.url;
        });
      }
      const message = `Confirm deleting this ${pagename.split("_")[0]}? Its files and status will be deleted as well.`;
      return (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_6__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)(message)).then((yes) => {
        if (yes) {
          confirmed = true;
          ev.target.click();
        }
      });
    });
    setInterval(() => {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()("img").each(function() {
        if (jquery__WEBPACK_IMPORTED_MODULE_0___default()(this).attr("src").startsWith("file://")) {
          jquery__WEBPACK_IMPORTED_MODULE_0___default()(this).attr("src", jquery__WEBPACK_IMPORTED_MODULE_0___default()(this).attr("src").replace("file://", "./file/"));
        }
      });
    }, 500);
  }
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/contest_main.page.ts"
/*!************************************!*\
  !*** ./pages/contest_main.page.ts ***!
  \************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");


const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.NamedPage("contest_main", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="filter-form"] select').on("change", () => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="filter-form"]').trigger("submit");
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/contest_manage.page.ts"
/*!**************************************!*\
  !*** ./pages/contest_manage.page.ts ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");





const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__.NamedPage("contest_manage", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="set_score"]', async (ev) => {
    const pid = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).data("pid");
    const op = await new vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.ActionDialog({
      $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.tpl)`
      <div class="row"><div class="columns">
        <h1>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.i18n)("Set Score for Contest")}</h1>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${(0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.i18n)("score")}
          <div class="textbox-container">
            <input class="textbox" type="number" step="1" name="score" data-autofocus value="${jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).data("score")}"></input>
          </div>
        </label>
      </div></div>
      `,
      onDispatch(action) {
        if (action === "ok" && jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="score"]').val() === null) {
          jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="score"]').focus();
          return false;
        }
        if (!Number.isFinite(+jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="score"]').val()) || +jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="score"]').val() <= 0) {
          vj_components_notification__WEBPACK_IMPORTED_MODULE_2__["default"].error("Invalid score");
          return false;
        }
        return true;
      }
    }).open();
    if (op !== "ok") return;
    try {
      const res = await vj_utils__WEBPACK_IMPORTED_MODULE_4__.request.post("", {
        operation: "set_score",
        pid,
        score: jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="score"]').val()
      });
      if (!res.error) {
        vj_components_notification__WEBPACK_IMPORTED_MODULE_2__["default"].success("Score Updated");
        jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).text(jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="score"]').val());
        jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).data("score", jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="score"]').val());
      }
    } catch (e) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_2__["default"].error(e.message);
    }
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/contest_print.page.tsx"
/*!**************************************!*\
  !*** ./pages/contest_print.page.tsx ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_highlighter_prismjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/highlighter/prismjs */ "./components/highlighter/prismjs.js");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");








const apis = {
  getPrintTask: () => vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.post("", { operation: "get_print_task" }),
  updatePrintTask: (taskId, status) => vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.post("", { operation: "update_print_task", taskId, status }),
  allocatePrintTask: () => vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.post("", { operation: "allocate_print_task" })
};
const callApi = async (api, ...args) => {
  try {
    return await apis[api].call(apis[api], ...args);
  } catch (error) {
    console.error(`Failed to call API ${api}:`, error);
    return null;
  }
};
function inlineStyles(element) {
  const style = window.getComputedStyle(element);
  element.style.color = style.color;
  element.style.backgroundColor = style.backgroundColor;
  element.style.fontWeight = style.fontWeight;
  element.style.fontStyle = style.fontStyle;
  element.style.textDecoration = style.textDecoration;
  element.style.fontFamily = style.fontFamily;
  element.style.fontSize = style.fontSize;
  element.style.lineHeight = style.lineHeight;
  element.style.whiteSpace = style.whiteSpace;
  element.style.wordSpacing = style.wordSpacing;
  element.style.wordBreak = style.wordBreak;
  element.style.tabSize = style.tabSize;
  element.style.hyphens = style.hyphens;
  Array.from(element.children).forEach((child) => inlineStyles(child));
}
const PrintKiosk = ({ isAdmin }) => {
  const [printTasks, setPrintTasks] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)([]);
  const [isKioskActive, setIsKioskActive] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(false);
  const [udict, setUdict] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)({});
  const pollPrintTasks = async () => {
    const response = await callApi("getPrintTask");
    setPrintTasks(response.tasks || []);
    setUdict(response.udict || {});
  };
  const printTask = async (task, udoc) => {
    const printWindow = window.open("", "_blank", "width=800,height=600,popup=1");
    if (!printWindow) return;
    const finalContent = [];
    let cnt = 0;
    for (const line of task.content.split("\n")) {
      cnt += Math.ceil(line.length / 100);
      if (cnt > 300) break;
      finalContent.push(line);
    }
    const parts = task.title.split(".");
    const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "plaintext";
    const tempDiv = document.createElement("div");
    tempDiv.style.display = "none";
    const pre = document.createElement("pre");
    pre.className = "content";
    const code = document.createElement("code");
    code.className = `language-${ext}`;
    code.textContent = finalContent.join("\n");
    pre.appendChild(code);
    tempDiv.appendChild(pre);
    document.body.appendChild(tempDiv);
    vj_components_highlighter_prismjs__WEBPACK_IMPORTED_MODULE_5__["default"].highlightBlocks(jquery__WEBPACK_IMPORTED_MODULE_1___default()(tempDiv));
    inlineStyles(pre);
    const highlightedContent = pre.outerHTML;
    document.body.removeChild(tempDiv);
    const header = (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.tpl)(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "header", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("p", { children: [
      "[",
      udoc.uname,
      "] ",
      udoc.school || "",
      " ",
      udoc.displayName || "",
      " \xA0",
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { style: { float: "right" }, children: new Date((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.mongoId)(task._id).timestamp * 1e3).toLocaleString() }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("br", {}),
      "Filename: ",
      task.title,
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { style: { float: "right" }, children: "By Hydro" })
    ] }) }));
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Page</title>
        <style>
          body { font-family: monospace; margin: 10px; font-size: 14px; line-height: 1.2; }
          .header { border-bottom: 1px solid #ccc; }
          pre { margin: 0; margin-block: 0; white-space: pre-wrap !important; }
        </style>
      </head>
      <body>
        ${header}
        ${highlightedContent}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      callApi("updatePrintTask", task._id, "printed").then(() => pollPrintTasks());
    }, 500);
  };
  (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(() => {
    pollPrintTasks();
    let active = true;
    if (isKioskActive) {
      (async () => {
        while (active) {
          const task = await callApi("allocatePrintTask");
          if (!(task == null ? void 0 : task.task)) await (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.delay)(5e3);
          else {
            await printTask(task.task, task.udoc);
            await pollPrintTasks();
          }
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [isKioskActive]);
  (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(() => {
    const cb = () => setIsKioskActive(true);
    jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="enable_print_kiosk"]', cb);
    return () => {
      jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).off("click", '[name="enable_print_kiosk"]', cb);
    };
  }, []);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "print-kiosk", children: [
    isKioskActive && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { style: { textAlign: "center" }, children: "Print Kiosk is enabled" }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "table-container", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("table", { className: "data-table", children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("thead", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("tr", { children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { children: "User" }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { children: "Title" }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { children: "Time" }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { children: "Status" }),
        isAdmin && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { children: "Action" })
      ] }) }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("tbody", { children: [
        printTasks.length === 0 && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("tr", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { colSpan: isAdmin ? 5 : 4, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { style: { textAlign: "center" }, children: "No pending print tasks." }) }) }),
        printTasks.map((task) => {
          var _a;
          return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("tr", { children: [
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("a", { href: `/user/${task.owner}`, children: (_a = udict[task.owner]) == null ? void 0 : _a.uname }) }),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { children: task.title }),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { children: new Date((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.mongoId)(task._id).timestamp * 1e3).toLocaleString() }),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { children: task.status }),
            isAdmin && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
              "button",
              {
                onClick: () => callApi("updatePrintTask", task._id, "pending").then(() => pollPrintTasks()),
                className: "typo-a",
                children: "Re-Print"
              }
            ) })
          ] }, task._id);
        })
      ] })
    ] }) })
  ] });
};
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_6__.NamedPage("contest_print", () => {
  const element = document.createElement("input");
  element.type = "file";
  element.name = "file";
  element.style.display = "none";
  document.body.appendChild(element);
  element.onchange = async (ev) => {
    var _a;
    const file = ev.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("operation", "print");
    const language = (_a = file.name.split(".").pop()) == null ? void 0 : _a.toLowerCase();
    const dialog = new vj_components_dialog__WEBPACK_IMPORTED_MODULE_4__.ConfirmDialog({
      $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.tpl)(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "typo", children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("h3", { children: [
          (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Are you sure to print this file?"),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { style: { float: "right" }, children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Filename: {0}", file.name) })
        ] }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { style: { maxHeight: "60vh", overflow: "scroll" }, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("pre", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("code", { className: `language-${language}`, children: await file.text() }) }) })
      ] }))
    });
    const action = await dialog.open();
    if (action !== "yes") return;
    vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.postFile("", formData).then(() => {
      window.location.reload();
    });
  };
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="add_print_task"]', () => {
    element.click();
  });
  const container = document.getElementById("printKioskContainer");
  if (!container) return;
  const root = react_dom_client__WEBPACK_IMPORTED_MODULE_3__.createRoot(container);
  root.render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(PrintKiosk, { isAdmin: !!container.dataset.isAdmin }));
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/contest_scoreboard.page.ts"
/*!******************************************!*\
  !*** ./pages/contest_scoreboard.page.ts ***!
  \******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var vj_utils_db__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils/db */ "./utils/db.ts");




const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.NamedPage(["contest_scoreboard", "homework_scoreboard"], async () => {
  const db = await vj_utils_db__WEBPACK_IMPORTED_MODULE_3__.openDB;
  const { tdoc } = UiContext;
  const id = `${tdoc.domainId}/${tdoc.docId}`;
  const read = async () => {
    var _a;
    return ((_a = await db.get("scoreboard-star", id)) == null ? void 0 : _a.data) || [];
  };
  const write = (data) => db.put("scoreboard-star", { id, data });
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(`.star.user--${UserContext._id}`).closest("tr").addClass("star-highlight");
  (await read()).forEach((uid) => jquery__WEBPACK_IMPORTED_MODULE_0___default()(`.star.user--${uid}`).addClass("activated").closest("tr").addClass("star-highlight"));
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".star").on("click", async (e) => {
    const star = await read();
    const $target = jquery__WEBPACK_IMPORTED_MODULE_0___default()(e.currentTarget);
    const uid = $target.data("uid");
    if (star.includes(uid)) {
      $target.removeClass("activated");
      star.splice(star.indexOf(uid), 1);
    } else {
      $target.addClass("activated");
      star.push(uid);
    }
    write(star);
  });
  async function update() {
    const val = jquery__WEBPACK_IMPORTED_MODULE_0___default()(jquery__WEBPACK_IMPORTED_MODULE_0___default()(".select.filter")).val();
    if (val === "all") {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(".data-table tbody tr").show();
      (await read()).forEach((uid) => jquery__WEBPACK_IMPORTED_MODULE_0___default()(`.star.user--${uid}`).closest("tr").addClass("star-highlight"));
    } else if (val === "star") {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(".data-table tbody tr").hide();
      (await read()).forEach((uid) => jquery__WEBPACK_IMPORTED_MODULE_0___default()(`.star.user--${uid}`).closest("tr").show().removeClass("star-highlight"));
    } else if (val === "rank") {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(".data-table tbody tr").show();
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(".rank--unrank").closest("tr").hide();
    } else {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(".data-table tbody tr").hide();
      const uids = val.toString().split(",").map((i) => +i.trim()).filter((i) => i);
      if (!(uids == null ? void 0 : uids.length)) return;
      uids.forEach((uid) => jquery__WEBPACK_IMPORTED_MODULE_0___default()(`.user--${uid}`).closest("tr").show());
    }
  }
  function getFilterFromHash() {
    const hash = location.hash.slice(1);
    if (hash.startsWith("filter=")) return hash.slice(7);
    return null;
  }
  const initialFilter = getFilterFromHash() || "all";
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".select.filter").val(initialFilter);
  await update();
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".select.filter").on("change", async () => {
    await update();
    const val = jquery__WEBPACK_IMPORTED_MODULE_0___default()(".select.filter").val();
    history.replaceState(null, "", `#filter=${val}`);
  });
  const beginAt = new Date(UiContext.tdoc.beginAt).getTime();
  const endAt = new Date(UiContext.tdoc.endAt).getTime();
  async function updateScoreboard() {
    const now = Date.now();
    if (beginAt <= now && now <= endAt) {
      await vj_utils__WEBPACK_IMPORTED_MODULE_2__.pjax.request({ url: UiContext.scoreboardUrl || "", push: false });
      await update();
    }
  }
  setInterval(updateScoreboard, 18e4);
  window.addEventListener("hashchange", async () => {
    const filter = getFilterFromHash();
    if (filter) {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(".select.filter").val(filter);
      await update();
    }
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/contest_user.page.ts"
/*!************************************!*\
  !*** ./pages/contest_user.page.ts ***!
  \************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/autocomplete/UserSelectAutoComplete */ "./components/autocomplete/UserSelectAutoComplete.tsx");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");






const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.NamedPage("contest_user", () => {
  const addUserDialogContent = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`
    <div>
      <div class="row"><div class="columns">
        <h1>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Add User")}</h1>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Users")}
          <input name="add_user_users" type="text" class="textbox" autocomplete="off">
        </label>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Rank")} 
          <br />
          <label class="checkbox">
            <input type="checkbox" name="unrank" class="checkbox">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("UnRank")} 
          </label>
        </label>
      </div></div>
    </div>
  `);
  addUserDialogContent.appendTo(document.body);
  const userSelect = vj_components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__["default"].getOrConstruct(
    addUserDialogContent.find('[name="add_user_users"]'),
    { multi: true, height: "auto" }
  );
  const addUserDialog = new vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__.ActionDialog({
    $body: addUserDialogContent,
    onDispatch(action) {
      if (action === "ok" && !userSelect.value()) {
        userSelect.focus();
        return false;
      }
      return true;
    }
  });
  addUserDialog.clear = function() {
    userSelect.clear();
    addUserDialog.$dom.find('[name="unrank"]').prop("checked", false);
    return this;
  };
  async function handlePostRequest(params, successMessage) {
    try {
      const res = await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post("", params);
      if (res.url && res.url !== window.location.href) window.location.href = res.url;
      else {
        vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].success(successMessage);
        vj_utils__WEBPACK_IMPORTED_MODULE_5__.pjax.request({ push: false });
      }
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error([error.message, ...error.params].join(" "));
    }
  }
  async function handleClickAddUser() {
    const action = await addUserDialog.clear().open();
    if (action !== "ok") return;
    const unrank = addUserDialog.$dom.find('[name="unrank"]').prop("checked");
    const uids = userSelect.value();
    await handlePostRequest({
      operation: "add_user",
      uids: uids.join(","),
      unrank
    }, (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("User added."));
  }
  async function handleEditRank(ev) {
    const uid = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.target).data("uid");
    await handlePostRequest({
      operation: "rank",
      uid
    }, (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Ranking status updated."));
  }
  async function handleResume(ev) {
    const uid = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.target).data("uid");
    await handlePostRequest({
      operation: "resume",
      uid
    }, (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Contest resumed."));
  }
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="add_user"]').on("click", () => handleClickAddUser());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="edit_rank"]', handleEditRank);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="resume_contest"]', handleResume);
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/domain_dashboard.page.ts"
/*!****************************************!*\
  !*** ./pages/domain_dashboard.page.ts ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* provided dependency */ var $ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");



/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.NamedPage("domain_dashboard", () => {
  let confirmed = false;
  $(document).on("submit", "#delete-domain-form", (ev) => {
    if (confirmed) return;
    ev.preventDefault();
    (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_0__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_2__.i18n)("Confirm deleting this domain? This action cannot be undone.")).then((yes) => {
      if (!yes) return;
      confirmed = true;
      $(ev.currentTarget).submit();
    });
  });
}));


/***/ },

/***/ "./pages/domain_edit.page.tsx"
/*!************************************!*\
  !*** ./pages/domain_edit.page.tsx ***!
  \************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var vj_components_autocomplete_LanguageSelectAutoComplete__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! vj/components/autocomplete/LanguageSelectAutoComplete */ "./components/autocomplete/LanguageSelectAutoComplete.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* provided dependency */ var $ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");


const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.NamedPage("domain_edit", () => {
  vj_components_autocomplete_LanguageSelectAutoComplete__WEBPACK_IMPORTED_MODULE_0__["default"].getOrConstruct($("[name=langs]"), { multi: true });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/domain_group.page.ts"
/*!************************************!*\
  !*** ./pages/domain_group.page.ts ***!
  \************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/autocomplete/UserSelectAutoComplete */ "./components/autocomplete/UserSelectAutoComplete.tsx");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");







function update(name, uids = []) {
  return (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.api)("domain.group", {
    name,
    uids
  }, []);
}
function del(name) {
  return (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.api)("domain.group", {
    name
  }, []);
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_5__.NamedPage("domain_group", () => {
  const createGroupDialogContent = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl)`
    <div>
      <div class="row"><div class="columns">
        <h1>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Create Group")}</h1>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${(0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Group Name")}
          <input name="create_group_name" type="text" class="textbox" data-autofocus>
        </label>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${(0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Users")}
          <input name="create_group_users" type="text" class="textbox" autocomplete="off">
        </label>
      </div></div>
    </div>
  `);
  createGroupDialogContent.appendTo(document.body);
  const userSelect = vj_components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_2__["default"].getOrConstruct(
    createGroupDialogContent.find('[name="create_group_users"]'),
    { multi: true, height: "auto" }
  );
  const targets = {};
  jquery__WEBPACK_IMPORTED_MODULE_0___default()("input[data-gid]").get().forEach((ele) => {
    const input = vj_components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_2__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()(ele), { multi: true, height: "auto" });
    const gid = ele.getAttribute("data-gid");
    targets[gid] = input;
    let loaded = false;
    const save = lodash__WEBPACK_IMPORTED_MODULE_1___default().debounce(() => update(gid, input.value()), 500);
    input.onChange(() => {
      if (input.value().length && !loaded) {
        loaded = true;
        jquery__WEBPACK_IMPORTED_MODULE_0___default()(ele).closest("tr").find(".group-member-count").text(`${input.value().length} ${(0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("members")}`);
        return;
      }
      if (!loaded) return;
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(ele).closest("tr").find(".group-member-count").text(`${input.value().length} ${(0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("members")}`);
      save();
    });
  });
  const createGroupDialog = new vj_components_dialog__WEBPACK_IMPORTED_MODULE_3__.ActionDialog({
    $body: createGroupDialogContent,
    onDispatch(action) {
      const $name = createGroupDialog.$dom.find('[name="create_group_name"]');
      if (action === "ok" && ($name.val() === "" || !userSelect.value())) {
        $name.focus();
        return false;
      }
      return true;
    }
  });
  createGroupDialog.clear = function() {
    userSelect.clear();
    createGroupDialog.$dom.find('[name="create_group_name"]').val("");
    return this;
  };
  function ensureAndGetSelectedGroups() {
    const groups = lodash__WEBPACK_IMPORTED_MODULE_1___default().map(
      jquery__WEBPACK_IMPORTED_MODULE_0___default()('.domain-group tbody [type="checkbox"]:checked'),
      (ch) => jquery__WEBPACK_IMPORTED_MODULE_0___default()(ch).closest("tr").attr("data-gid")
    );
    if (groups.length === 0) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Please select at least one group to perform this operation."));
      return null;
    }
    return groups;
  }
  async function handleClickCreateGroup() {
    const action = await createGroupDialog.clear().open();
    if (action !== "ok") return;
    const name = createGroupDialog.$dom.find('[name="create_group_name"]').val();
    const uids = userSelect.value();
    try {
      await update(name, uids);
      window.location.reload();
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error(error.message);
    }
  }
  async function handleClickDeleteSelected() {
    const selectedGroups = ensureAndGetSelectedGroups();
    if (selectedGroups === null) return;
    const action = await new vj_components_dialog__WEBPACK_IMPORTED_MODULE_3__.ConfirmDialog({
      $body: vj_utils__WEBPACK_IMPORTED_MODULE_6__.tpl.typoMsg((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Confirm deleting the selected groups?"))
    }).open();
    if (action !== "yes") return;
    try {
      await Promise.all(selectedGroups.map((name) => del(name)));
      vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Selected groups have been deleted."));
      await (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.delay)(2e3);
      window.location.reload();
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error(error.message);
    }
  }
  async function handleClickSaveAll() {
    for (const gid of Object.keys(targets)) {
      const uids = targets[gid].value();
      try {
        await update(gid, uids);
      } catch (error) {
        vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error(error.message);
      }
    }
    vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Saved."));
  }
  async function handleClickImportGroups() {
    const result = await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_3__.prompt)((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Import Groups"), {
      groups: {
        type: "textarea",
        label: (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Format: one group per line, CSV: groupName,uid1,uid2,..."),
        rows: 10,
        required: true,
        placeholder: "group1,1001,1002,1003\ngroup2,1004,1005"
      }
    });
    if (!result) return;
    const lines = String(result.groups || "").replace(/^\uFEFF/, "").split("\n");
    const parsed = /* @__PURE__ */ new Map();
    const errors = [];
    lines.forEach((raw, idx) => {
      const line = raw.trim();
      if (!line) return;
      const [name, ...rest] = line.split(",").map((t) => t.trim());
      if (!name) return;
      const uids = [];
      for (const t of rest) {
        if (!t) continue;
        const uid = +t;
        if (!Number.isInteger(uid)) {
          errors.push((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)('Line {0}: Invalid UID "{1}".', idx + 1, t));
          return;
        }
        uids.push(uid);
      }
      parsed.set(name, Array.from(new Set(uids)));
    });
    if (errors.length) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error(errors.join("\n"));
      return;
    }
    if (!parsed.size) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("No groups to import."));
      return;
    }
    try {
      for (const [name, uids] of parsed) {
        await update(name, uids);
      }
      vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Imported successfully."));
      await (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.delay)(1500);
      window.location.reload();
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error(error.message);
    }
  }
  async function handleClickExportGroups() {
    const rows = [];
    for (const gid of Object.keys(targets)) {
      const uids = targets[gid].value();
      rows.push([gid, ...uids].join(","));
    }
    await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_3__.prompt)((0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Export Groups"), {
      groups: {
        type: "textarea",
        label: (0,vj_utils__WEBPACK_IMPORTED_MODULE_6__.i18n)("Copy the content below"),
        rows: 15,
        default: rows.join("\n")
      }
    });
  }
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="create_group"]').click(() => handleClickCreateGroup());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="import_groups"]').click(() => handleClickImportGroups());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="export_groups"]').click(() => handleClickExportGroups());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="remove_selected"]').click(() => handleClickDeleteSelected());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="save_all"]').on("click", () => handleClickSaveAll());
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/domain_join_applications.page.ts"
/*!************************************************!*\
  !*** ./pages/domain_join_applications.page.ts ***!
  \************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_constant_domain__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/constant/domain */ "./constant/domain.js");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");



const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage("domain_join_applications", () => {
  const $role = jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="role"]');
  const $expire = jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="expire"]');
  const $code = jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="invitationCode"]');
  function updateFormState() {
    const method = +jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="method"]').val();
    $role.prop("disabled", method === vj_constant_domain__WEBPACK_IMPORTED_MODULE_1__.JOIN_METHOD_NONE).trigger("vjFormDisableUpdate");
    $expire.prop("disabled", method === vj_constant_domain__WEBPACK_IMPORTED_MODULE_1__.JOIN_METHOD_NONE).trigger("vjFormDisableUpdate");
    $code.prop("disabled", method !== vj_constant_domain__WEBPACK_IMPORTED_MODULE_1__.JOIN_METHOD_CODE).trigger("vjFormDisableUpdate");
  }
  updateFormState();
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="method"]').on("change", updateFormState);
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/domain_role.page.js"
/*!***********************************!*\
  !*** ./pages/domain_role.page.js ***!
  \***********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");






const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.NamedPage("domain_role", () => {
  const createRoleDialog = new vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__.ActionDialog({
    $body: jquery__WEBPACK_IMPORTED_MODULE_0___default()(".dialog__body--create-role > div"),
    onDispatch(action) {
      const $role = createRoleDialog.$dom.find('[name="role"]');
      if (action === "ok" && $role.val() === "") {
        $role.focus();
        return false;
      }
      return true;
    }
  });
  createRoleDialog.clear = function() {
    this.$dom.find('[name="role"]').val("");
    return this;
  };
  function ensureAndGetSelectedRoles() {
    const roles = lodash__WEBPACK_IMPORTED_MODULE_1___default().map(
      jquery__WEBPACK_IMPORTED_MODULE_0___default()('.domain-roles tbody [type="checkbox"]:checked'),
      (ch) => jquery__WEBPACK_IMPORTED_MODULE_0___default()(ch).closest("tr").attr("data-role")
    );
    if (roles.length === 0) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Please select at least one role to perform this operation."));
      return null;
    }
    return roles;
  }
  async function handleClickCreateRole() {
    const action = await createRoleDialog.clear().open();
    if (action !== "ok") return;
    const role = createRoleDialog.$dom.find('[name="role"]').val();
    try {
      await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post("", {
        operation: "add",
        role
      });
      window.location.reload();
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error(error.message);
    }
  }
  async function handleClickDeleteSelected() {
    const selectedRoles = ensureAndGetSelectedRoles();
    if (selectedRoles === null) return;
    const action = await new vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__.ConfirmDialog({
      $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`
        <div class="typo">
          <p>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Confirm deleting the selected roles?")}</p>
          <p>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Users with those roles will be removed from the domain.")}</p>
        </div>`
    }).open();
    if (action !== "yes") return;
    try {
      await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post("", {
        operation: "delete",
        roles: selectedRoles
      });
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Selected roles have been deleted."));
      await (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.delay)(2e3);
      window.location.reload();
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error(error.message);
    }
  }
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="create_role"]').on("click", () => handleClickCreateRole());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="delete_selected"]').on("click", () => handleClickDeleteSelected());
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/domain_user.page.js"
/*!***********************************!*\
  !*** ./pages/domain_user.page.js ***!
  \***********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");






const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.NamedPage("domain_user", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".not-joined").data("tooltip", (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Click to view detailed instructions."));
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".not-joined").addClass("text-orange");
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", ".not-joined", () => {
    new vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__.InfoDialog({
      $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`
        <div class="typo">
          <p>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Users will have to manually join the domain first before selected roles can be applied.")}</p>
          <p>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)('To join the domain, users can click the "Join Domain" button on "My Domain" page.')}</p>
          <p>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Or use the following link:")}</p>
          <p><a href="/domain/join?target=${UiContext.domain._id}">/domain/join?target=${UiContext.domain._id}</a></p>
        </div>`
    }).open();
  });
  async function handleClickAddUser() {
    var _a;
    const res = await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__.prompt)((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Add User"), {
      user: {
        type: "userId",
        required: true,
        autofocus: true,
        multi: true,
        label: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Username / UID")
      },
      role: {
        type: "text",
        required: true,
        label: "Role",
        options: UiContext.roles.filter((i) => !["default", "guest"].includes(i))
      },
      ...UiContext.canForceJoin && UiContext.domain._id !== "system" ? {
        join: {
          type: "checkbox",
          label: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Mark user as joined using admin privilege")
        }
      } : {}
    });
    if (!((_a = res == null ? void 0 : res.user) == null ? void 0 : _a.length) || !(res == null ? void 0 : res.role)) return;
    try {
      await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post("", {
        operation: "set_users",
        uids: res.user,
        role: res.role,
        join: res.join
      });
      window.location.reload();
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error(error.message);
    }
  }
  function ensureAndGetSelectedUsers() {
    const users = lodash__WEBPACK_IMPORTED_MODULE_1___default().map(
      jquery__WEBPACK_IMPORTED_MODULE_0___default()('.domain-users tbody [type="checkbox"]:checked'),
      (ch) => jquery__WEBPACK_IMPORTED_MODULE_0___default()(ch).attr("data-uid") || jquery__WEBPACK_IMPORTED_MODULE_0___default()(ch).closest("tr").attr("data-uid")
    );
    if (users.length === 0) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Please select at least one user to perform this operation."));
      return null;
    }
    return users;
  }
  async function handleClickRemoveSelected() {
    const selectedUsers = ensureAndGetSelectedUsers();
    if (selectedUsers === null) return;
    if (!await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__.confirm)(`${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Confirm removing the selected users?")}
${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Their account will not be deleted and they will be with the guest role until they re-join the domain.")}`)) return;
    try {
      await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post("", {
        operation: "kick",
        uids: selectedUsers
      });
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Selected users have been removed from the domain."));
      await (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.delay)(2e3);
      window.location.reload();
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error(error.message);
    }
  }
  async function handleClickSetSelected() {
    const res = await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__.prompt)("Set Role", {
      role: {
        type: "text",
        required: true,
        label: "Set Roles for selected users",
        options: UiContext.roles.filter((i) => !["guest"].includes(i))
      }
    });
    if (!(res == null ? void 0 : res.role)) return;
    const selectedUsers = ensureAndGetSelectedUsers();
    if (selectedUsers === null) return;
    try {
      await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post("", {
        operation: "set_users",
        uids: selectedUsers,
        role: res.role
      });
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Role has been updated to {0} for selected users.", res.role));
      await (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.delay)(2e3);
      window.location.reload();
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error(error.message);
    }
  }
  async function handleChangeUserRole(ev) {
    const row = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).closest("tr");
    const role = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).val();
    try {
      await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post("", {
        operation: "set_users",
        uids: [row.attr("data-uid")],
        role
      });
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Role has been updated to {0}.", role));
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error(error.message);
    }
  }
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="add_user"]').click(() => handleClickAddUser());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="remove_selected"]').click(() => handleClickRemoveSelected());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="set_roles"]').click(() => handleClickSetSelected());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('.domain-users [name="role"]').change((ev) => handleChangeUserRole(ev));
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/files.page.tsx"
/*!******************************!*\
  !*** ./pages/files.page.tsx ***!
  \******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/dialog/index */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_components_upload__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/components/upload */ "./components/upload.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");









let endpoint = "";
const getUrl = (type, sidebar) => {
  let url = endpoint;
  const search = new URLSearchParams();
  if (type) search.append("d", type);
  if (sidebar) search.append("sidebar", "true");
  if (search.size) url += `?${search.toString()}`;
  return url;
};
const extractArgsFromEvent = (ev) => {
  return {
    file: jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget).parent().parent().attr("data-filename"),
    type: jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.target).closest("[data-type]").attr("data-type") || "",
    sidebar: !!jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.target).closest("[data-sidebar]").length
  };
};
function ensureAndGetSelectedFiles(type = "") {
  const allChecked = jquery__WEBPACK_IMPORTED_MODULE_1___default()(`.files tbody [data-checkbox-group="${type || "files"}"]:checked`);
  const files = allChecked.get().map((i) => jquery__WEBPACK_IMPORTED_MODULE_1___default()(i).closest("tr").attr("data-filename"));
  if (files.length === 0) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Please select at least one file to perform this operation."));
    return null;
  }
  return files;
}
async function handleClickUpload(ev, files) {
  const { type, sidebar } = extractArgsFromEvent(ev);
  if (!files) {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.click();
    await new Promise((resolve) => {
      input.onchange = resolve;
    });
    files = input.files;
  }
  if (!files.length) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].warn((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("No file selected."));
    return;
  }
  await (0,vj_components_upload__WEBPACK_IMPORTED_MODULE_6__["default"])(endpoint, files, { pjax: true, type, sidebar });
}
async function handleClickRename(ev) {
  const { file, type, sidebar } = extractArgsFromEvent(ev);
  const res = await (0,vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_4__.prompt)((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Enter a new name for the file: "), {
    name: {
      type: "text",
      required: true,
      label: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("New Filename")
    }
  });
  if (!(res == null ? void 0 : res.name)) return;
  try {
    await vj_utils__WEBPACK_IMPORTED_MODULE_8__.request.post(endpoint, {
      operation: "rename_files",
      files: [file],
      newNames: [res.name],
      type
    });
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("File has been renamed."));
    await vj_utils__WEBPACK_IMPORTED_MODULE_8__.pjax.request({ url: getUrl(type, sidebar), push: false });
  } catch (error) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error(error.message);
  }
}
async function handleClickRenameSelected(ev) {
  const { type, sidebar } = extractArgsFromEvent(ev);
  const selectedFiles = ensureAndGetSelectedFiles(type);
  if (!(selectedFiles == null ? void 0 : selectedFiles.length)) return;
  let onActionButton = (_) => false;
  function Rename(props) {
    const [original, setOriginal] = react__WEBPACK_IMPORTED_MODULE_2___default().useState("");
    const [replace, setReplace] = react__WEBPACK_IMPORTED_MODULE_2___default().useState("");
    const [prefix, setPrefix] = react__WEBPACK_IMPORTED_MODULE_2___default().useState("");
    const [suffix, setSuffix] = react__WEBPACK_IMPORTED_MODULE_2___default().useState("");
    const [regexValid, setRegexValid] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(true);
    const [wantNext, setWantNext] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(false);
    const [preview, setPreview] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(false);
    const [highlight, setHighlight] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(null);
    const [newNames, setNewNames] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(props.names);
    const [prism, setPrism] = react__WEBPACK_IMPORTED_MODULE_2___default().useState(null);
    react__WEBPACK_IMPORTED_MODULE_2___default().useEffect(() => {
      const load = Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! ../components/highlighter/prismjs */ "./components/highlighter/prismjs.js"));
      load.then(({ default: p }) => {
        setPrism(p.Prism);
      }).catch(() => {
      });
    }, []);
    react__WEBPACK_IMPORTED_MODULE_2___default().useEffect(() => {
      let s = original;
      setRegexValid(true);
      setHighlight(null);
      if (original.length > 2 && original.startsWith("/")) {
        const availableFlags = ["g", "i"];
        const flags = [];
        let copy = original.substring(1);
        while (availableFlags.includes(copy[copy.length - 1])) {
          flags.push(copy[copy.length - 1]);
          copy = copy.substring(0, copy.length - 1);
        }
        if (copy.endsWith("/")) {
          copy = copy.substring(0, copy.length - 1);
          flags.reverse();
          if (prism) setHighlight(`/${prism.highlight(copy, prism.languages.regex, "RegExp")}/${flags.join("")}`);
          try {
            s = new RegExp(copy, flags.join(""));
            setRegexValid(true);
          } catch (e) {
            setRegexValid(false);
          }
        }
      }
      setNewNames(selectedFiles.map((file) => {
        if (s) file = file.replace(s, replace);
        return prefix + file + suffix;
      }));
    }, [original, replace, prefix, suffix, prism]);
    onActionButton = (action) => {
      if (action === "ok") {
        if (!preview) {
          if (!regexValid) return false;
          if (!original && !prefix && !suffix) {
            setWantNext(true);
            return false;
          }
          setPreview(true);
          return false;
        }
        vj_utils__WEBPACK_IMPORTED_MODULE_8__.request.post(endpoint, {
          operation: "rename_files",
          files: selectedFiles,
          newNames,
          type
        }).then(() => {
          vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Selected files have been renamed."));
          vj_utils__WEBPACK_IMPORTED_MODULE_8__.pjax.request({ url: getUrl(type, sidebar), push: false });
        }).catch((error) => {
          vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error(error.message);
        });
        return true;
      }
      if (preview) {
        setPreview(false);
        return false;
      }
      return true;
    };
    const style = { fontFamily: "var(--code-font-family)" };
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "typo", style: { maxHeight: "60vh", overflow: "scroll" }, children: !preview ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "row", children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "medium-6 small-6 columns", children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h2", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Batch replacement") }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
            (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Original content"),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { style: { position: "relative" }, children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "textbox-container", style: { zIndex: 1, position: "relative" }, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
                "input",
                {
                  className: "textbox",
                  type: "text",
                  style: { ...style, ...highlight ? { color: "transparent", background: "transparent", caretColor: "black" } : {} },
                  value: original,
                  onChange: (e) => setOriginal(e.currentTarget.value)
                }
              ) }),
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
                "div",
                {
                  className: "textbox-container",
                  style: {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    zIndex: 0
                  },
                  children: highlight && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
                    "span",
                    {
                      className: "textbox",
                      style: {
                        ...style,
                        border: "none",
                        display: "inline-flex",
                        alignItems: "center"
                      },
                      dangerouslySetInnerHTML: { __html: highlight }
                    }
                  )
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
            (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Replace with"),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "textbox-container", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("input", { className: "textbox", type: "text", value: replace, onChange: (e) => setReplace(e.currentTarget.value) }) })
          ] })
        ] }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "medium-6 small-6 columns", children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h2", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Add prefix/suffix") }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
            (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Add prefix"),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "textbox-container", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("input", { className: "textbox", type: "text", value: prefix, onChange: (e) => setPrefix(e.currentTarget.value) }) })
          ] }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
            (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Add suffix"),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "textbox-container", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("input", { className: "textbox", type: "text", value: suffix, onChange: (e) => setSuffix(e.currentTarget.value) }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "medium-12 columns", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { children: !regexValid ? (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Invalid RegExp") : wantNext ? (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("No changes to make.") : (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)('RegExp supported, quote with "/"') }) }) })
    ] }) : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Are you sure to rename the following file?") }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("ul", { children: [
        original && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("li", { children: [
          "Replace ",
          original,
          " with ",
          replace
        ] }),
        prefix && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("li", { children: [
          "Add ",
          prefix,
          " as prefix"
        ] }),
        suffix && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("li", { children: [
          "Add ",
          suffix,
          " as suffix"
        ] })
      ] }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("table", { className: "data-table rename-confirm-table", children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("colgroup", { children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("col", { className: "col--origin" }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("col", { className: "col--new" })
        ] }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("thead", { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("tr", { children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { className: "col--origin", children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Original filename(s)") }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("th", { className: "col--new", children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("New filename(s)") })
        ] }) }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("tbody", { children: selectedFiles.map((file, index) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("tr", { children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { className: "col--origin", children: file }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("td", { className: "col--new", children: newNames[index] })
        ] }, file)) })
      ] })
    ] }) });
  }
  const promise = new vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_4__.ActionDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.tpl)`<div id="rename_dialog"></div>`,
    width: "600px",
    onDispatch(action) {
      return onActionButton(action);
    }
  }).open();
  const root = react_dom_client__WEBPACK_IMPORTED_MODULE_3__.createRoot(document.getElementById("rename_dialog"));
  root.render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Rename, { names: selectedFiles }));
  await promise;
  root.unmount();
}
async function handleClickRemove(ev) {
  const { file, type, sidebar } = extractArgsFromEvent(ev);
  if (!await (0,vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_4__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Confirm to delete the file?"))) return;
  try {
    await vj_utils__WEBPACK_IMPORTED_MODULE_8__.request.post(endpoint, {
      operation: "delete_files",
      files: [file],
      type
    });
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("File has been deleted."));
    await vj_utils__WEBPACK_IMPORTED_MODULE_8__.pjax.request({ url: getUrl(type, sidebar), push: false });
  } catch (error) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error(error.message);
  }
}
async function handleClickRemoveSelected(ev) {
  const { type, sidebar } = extractArgsFromEvent(ev);
  const selectedFiles = ensureAndGetSelectedFiles(type);
  if (selectedFiles === null) return;
  if (!await (0,vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_4__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Confirm to delete the selected files?"))) return;
  try {
    await vj_utils__WEBPACK_IMPORTED_MODULE_8__.request.post(endpoint, {
      operation: "delete_files",
      files: selectedFiles,
      type
    });
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("Selected files have been deleted."));
    await vj_utils__WEBPACK_IMPORTED_MODULE_8__.pjax.request({ url: getUrl(type, sidebar), push: false });
  } catch (error) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error(error.message);
  }
}
function handleDragOver(ev) {
  ev.preventDefault();
}
function handleDrop(e) {
  e.preventDefault();
  if (!jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="upload_file"]').length) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_8__.i18n)("You don't have permission to upload file."));
    return;
  }
  const ev = e.originalEvent;
  const files = [];
  if (ev.dataTransfer.items) {
    for (let i = 0; i < ev.dataTransfer.items.length; i++) {
      if (ev.dataTransfer.items[i].kind === "file") {
        const file = ev.dataTransfer.items[i].getAsFile();
        files.push(file);
      }
    }
  } else {
    for (let i = 0; i < ev.dataTransfer.files.length; i++) {
      files.push(ev.dataTransfer.files[i]);
    }
  }
  handleClickUpload(e, files);
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_7__.NamedPage([
  "problem_config",
  "problem_files",
  "problem_edit",
  "contest_edit",
  "contest_manage",
  "home_files",
  "training_files",
  "homework_files"
], (pageName) => {
  if (pageName === "problem_config" || pageName === "problem_edit") endpoint = "./files";
  if (pageName === "contest_edit") endpoint = "./management";
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="file_rename"]', (ev) => handleClickRename(ev));
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="file_remove"]', (ev) => handleClickRemove(ev));
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="upload_file"]', (ev) => handleClickUpload(ev));
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="rename_selected"]', (ev) => handleClickRenameSelected(ev));
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="remove_selected"]', (ev) => handleClickRemoveSelected(ev));
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("dragover", ".files", (ev) => handleDragOver(ev));
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("drop", ".files", (ev) => handleDrop(ev));
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/home_domain.page.tsx"
/*!************************************!*\
  !*** ./pages/home_domain.page.tsx ***!
  \************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage("home_domain", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[id="join-domain-button"]', async () => {
    const res = await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.prompt)((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Join Domain"), {
      domain: {
        type: "domain",
        label: (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Domain ID"),
        required: true,
        autofocus: true
      }
    }, {
      cancelByClickingBack: true,
      cancelByEsc: true
    });
    if (!(res == null ? void 0 : res.domain)) return;
    window.location.href = `/domain/join?target=${encodeURIComponent(res.domain.toString())}`;
  });
}));


/***/ },

/***/ "./pages/home_messages.page.tsx"
/*!**************************************!*\
  !*** ./pages/home_messages.page.tsx ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_components_selectUser__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/selectUser */ "./components/selectUser.tsx");
/* harmony import */ var vj_context__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/context */ "./context.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);








class MessagePadService extends vj_context__WEBPACK_IMPORTED_MODULE_5__.Service {
  constructor(c, s) {
    super(c, "messagepad");
    __publicField(this, "WebSocket");
    __publicField(this, "store");
    this.WebSocket = s.WebSocket;
    this.store = s.store;
  }
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_6__.NamedPage("home_messages", () => {
  let reduxStore;
  function createDialog(user) {
    reduxStore.dispatch({
      type: "DIALOGUES_CREATE",
      payload: {
        user
      }
    });
    reduxStore.dispatch({
      type: "DIALOGUES_SWITCH_TO",
      payload: user._id
    });
  }
  async function mountComponent() {
    const { default: WebSocket } = await Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! ../components/socket */ "./components/socket/index.ts"));
    const { default: MessagePadApp } = await __webpack_require__.e(/*! import() */ "default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1").then(__webpack_require__.bind(__webpack_require__, /*! ../components/messagepad */ "./components/messagepad/index.jsx"));
    const { default: MessagePadReducer } = await __webpack_require__.e(/*! import() */ "default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1").then(__webpack_require__.bind(__webpack_require__, /*! ../components/messagepad/reducers */ "./components/messagepad/reducers/index.ts"));
    const { Provider, store } = await (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.loadReactRedux)(MessagePadReducer);
    reduxStore = store;
    window.store = reduxStore;
    vj_context__WEBPACK_IMPORTED_MODULE_5__.ctx.plugin(MessagePadService, { store, WebSocket });
    const sock = new WebSocket(`${UiContext.ws_prefix}websocket`);
    sock.onopen = () => {
      sock.send(JSON.stringify({
        operation: "subscribe",
        request_id: Math.random().toString(16).substring(2),
        credential: document.cookie.split("sid=")[1].split(";")[0],
        channels: ["message"]
      }));
    };
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      if (msg.operation !== "event") return;
      store.dispatch({
        type: "DIALOGUES_MESSAGE_PUSH",
        payload: msg.payload
      });
      const udoc = msg.payload.udoc;
      const notification = new vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"]({
        title: udoc.uname,
        avatar: udoc.avatarUrl,
        message: msg.payload.mdoc.content,
        duration: 15e3,
        action: () => {
          store.dispatch({
            type: "DIALOGUES_SWITCH_TO",
            payload: udoc._id
          });
          notification.hide();
        }
      });
      notification.show();
    };
    (0,react_dom_client__WEBPACK_IMPORTED_MODULE_2__.createRoot)(jquery__WEBPACK_IMPORTED_MODULE_1___default()("#messagePad").get(0)).render(
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Provider, { store, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        MessagePadApp,
        {
          onAdd: async () => {
            const user = await (0,vj_components_selectUser__WEBPACK_IMPORTED_MODULE_4__["default"])();
            if (user) createDialog(user);
          }
        }
      ) })
    );
  }
  async function loadSendTarget() {
    const target = new URL(window.location.href).searchParams.get("target");
    if (!target) return;
    const user = await (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.api)(
      "users",
      { search: target, exact: true },
      ["_id", "uname", "avatarUrl", "mail"]
    );
    if (!(user == null ? void 0 : user.length)) return;
    createDialog(user[0]);
  }
  async function init() {
    await mountComponent();
    await loadSendTarget();
  }
  init();
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/home_preference.page.jsx"
/*!****************************************!*\
  !*** ./pages/home_preference.page.jsx ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_languageselect__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/languageselect */ "./components/languageselect.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




async function initCodeLangHelper() {
  const $el = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.tpl)`<div class="row" id="codelang-select"></div>`);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="codeLang"]').parent().parent().parent().parent().hide().after($el);
  const main = {};
  for (const key in window.LANGS) {
    if (!key.includes(".") && !window.LANGS[key].hidden) main[key] = window.LANGS[key].display;
  }
  await (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.delay)(50);
  (0,vj_components_languageselect__WEBPACK_IMPORTED_MODULE_1__.renderLanguageSelect)(
    document.getElementById("codelang-select"),
    jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="codeLang"]'),
    (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.getAvailableLangs)(),
    main,
    [jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="codeLang"]').val()]
  );
}
function supportFontFamily(f) {
  const h = "Arial";
  if (f.toLowerCase() === h.toLowerCase()) return true;
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.fillStyle = "black";
  ctx.textBaseline = "middle";
  const g = (j) => {
    ctx.clearRect(0, 0, 100, 100);
    ctx.font = `100px ${j}, ${h}`;
    ctx.fillText("a", 50, 50);
    const k = ctx.getImageData(0, 0, 100, 100).data;
    return [].slice.call(k).filter((l) => l !== 0);
  };
  return g(h).join("") !== g(f).join("");
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage("home_preference", () => {
  initCodeLangHelper();
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="fontFamily"] option, [name="codeFontFamily"] option').each(function() {
    if (!supportFontFamily(this.value)) {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(this).hide();
      console.log(`Unsupported: ${this.value}`);
    }
    this.style.fontFamily = this.getAttribute("value");
    this.textContent = (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)(this.textContent.trim());
  });
  function updateFont() {
    this.style.fontFamily = jquery__WEBPACK_IMPORTED_MODULE_0___default()(this).val();
  }
  document.fonts.onloadingdone = () => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="fontFamily"] option, [name="codeFontFamily"] option').each(function() {
      if (supportFontFamily(this.value)) jquery__WEBPACK_IMPORTED_MODULE_0___default()(this).show();
    });
  };
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="fontFamily"], [name="codeFontFamily"]').on("change", updateFont).each(updateFont);
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/home_security.page.tsx"
/*!**************************************!*\
  !*** ./pages/home_security.page.tsx ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _simplewebauthn_browser__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @simplewebauthn/browser */ "../../node_modules/@simplewebauthn/browser/esm/index.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var qrcode__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! qrcode */ "../../node_modules/qrcode/lib/browser.js");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");








async function changeMail() {
  const changeMailDialog = new vj_components_dialog__WEBPACK_IMPORTED_MODULE_4__.ActionDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.tpl)(
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "typo", id: "change-mail-dialog", children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
          (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Current Password"),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "textbox-container", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("input", { className: "textbox", type: "password", name: "password", "data-autofocus": true, required: true }) })
        ] }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
          (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Current Email"),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "textbox-container", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("input", { className: "textbox", type: "text", name: "currentEmail", value: UserContext.mail, disabled: true }) })
        ] }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("label", { children: [
          (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("New Email"),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "textbox-container", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("input", { className: "textbox", type: "text", name: "mail", required: true }) })
        ] })
      ] })
    ),
    onDispatch(action2) {
      if (action2 === "ok") {
        const $password = jquery__WEBPACK_IMPORTED_MODULE_2___default()('#change-mail-dialog [name="password"]');
        const $mail = jquery__WEBPACK_IMPORTED_MODULE_2___default()('#change-mail-dialog [name="mail"]');
        if (!$password.val() || !$mail.val()) {
          if (!$password.val()) $password.focus();
          else $mail.focus();
          return false;
        }
      }
      return true;
    }
  }).open();
  const action = await changeMailDialog;
  if (action !== "ok") return;
  try {
    await vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.post("", {
      operation: "change_mail",
      password: jquery__WEBPACK_IMPORTED_MODULE_2___default()('#change-mail-dialog [name="password"]').val(),
      mail: jquery__WEBPACK_IMPORTED_MODULE_2___default()('#change-mail-dialog [name="mail"]').val()
    });
  } catch (err) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error(err.message);
    console.error(err);
    return;
  }
  vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Successfully changed."));
  await (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.delay)(2e3);
  window.location.reload();
}
async function enableTfa() {
  const enableTFA = new vj_components_dialog__WEBPACK_IMPORTED_MODULE_4__.ActionDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.tpl)`
      <div class="typo">
        <p>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Please use your two factor authentication app to scan the qrcode below:")}</p>
        <div style="text-align: center">
          <canvas id="qrcode"></canvas>
          <p id="secret">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Click to show secret")}</p>
        </div>
        <label>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("6-Digit Code")}  
          <div class="textbox-container">
            <input class="textbox" type="text" name="tfa_code" data-autofocus autocomplete="off"></input>
          </div>
        </label>
      </div>
    `,
    onDispatch(action) {
      if (action === "ok" && jquery__WEBPACK_IMPORTED_MODULE_2___default()('[name="tfa_code"]').val() === null) {
        jquery__WEBPACK_IMPORTED_MODULE_2___default()('[name="tfa_code"]').focus();
        return false;
      }
      return true;
    }
  }).open();
  const secret = (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.secureRandomString)(13, "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567");
  jquery__WEBPACK_IMPORTED_MODULE_2___default()("#secret").on("click", () => jquery__WEBPACK_IMPORTED_MODULE_2___default()("#secret").html(secret));
  const uri = `otpauth://totp/Hydro:${UserContext.uname}?secret=${secret}&issuer=Hydro`;
  const canvas = document.getElementById("qrcode");
  await qrcode__WEBPACK_IMPORTED_MODULE_3__.toCanvas(canvas, uri);
  const tfaAction = await enableTFA;
  if (tfaAction !== "ok") return;
  try {
    await vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.post("", {
      operation: "enable_tfa",
      code: jquery__WEBPACK_IMPORTED_MODULE_2___default()('[name="tfa_code"]').val(),
      secret
    });
  } catch (err) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error(err.message);
    console.error(err);
    return;
  }
  vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Successfully enabled."));
  await (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.delay)(2e3);
  window.location.reload();
}
async function enableAuthn(type) {
  const authnInfo = await vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.post("", { operation: "register", type });
  if (!authnInfo.authOptions) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Failed to fetch registration data."));
    return;
  }
  vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Please follow the instructions on your device to complete the verification."));
  let credential;
  try {
    console.log(authnInfo);
    credential = await (0,_simplewebauthn_browser__WEBPACK_IMPORTED_MODULE_1__.startRegistration)({ optionsJSON: authnInfo.authOptions });
  } catch (err) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Failed to get credential: {0}", err));
    return;
  }
  const op = await new vj_components_dialog__WEBPACK_IMPORTED_MODULE_4__.ActionDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.tpl)`
      <div class="typo">
        <label>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Name")}
          <div class="textbox-container">
            <input class="textbox" type="text" name="webauthn_name" data-focus autocomplete="off"></input>
          </div>
        </label>
      </div>
    `,
    onDispatch(action) {
      if (action === "ok" && jquery__WEBPACK_IMPORTED_MODULE_2___default()('[name="webauthn_name"]').val() === null) {
        jquery__WEBPACK_IMPORTED_MODULE_2___default()('[name="webauthn_name"]').focus();
        return false;
      }
      return true;
    }
  }).open();
  if (op !== "ok") return;
  try {
    await vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.post("", {
      operation: "enable_authn",
      name: jquery__WEBPACK_IMPORTED_MODULE_2___default()('[name="webauthn_name"]').val(),
      result: credential
    });
  } catch (err) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error(err.message);
    console.error(err);
    return;
  }
  vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Successfully enabled."));
  await (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.delay)(2e3);
  window.location.reload();
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_6__.NamedPage("home_security", () => {
  const MenuLink = ({ children, action, icon }) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("li", { className: `menu__item ${action ? "" : "disabled"}`, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("a", { className: `menu__link ${action ? "" : "disabled"}`, "data-action": action, children: [
    icon && /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: `icon icon-${icon}` }),
    children
  ] }) });
  jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("click", '[name="auth_enable"]', async () => {
    const platformAvailable = (0,_simplewebauthn_browser__WEBPACK_IMPORTED_MODULE_1__.browserSupportsWebAuthn)() && await (0,_simplewebauthn_browser__WEBPACK_IMPORTED_MODULE_1__.platformAuthenticatorIsAvailable)();
    const $body = (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.tpl)(
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h3", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Choose Authenticator Type") }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("ol", { className: "menu", children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(MenuLink, { action: "tfa", icon: "platform--mobile", children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Two Factor Authentication") }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("li", { className: "menu__seperator" }),
          !window.isSecureContext || !(0,_simplewebauthn_browser__WEBPACK_IMPORTED_MODULE_1__.browserSupportsWebAuthn)() ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(MenuLink, { icon: "fingerprint", children: window.isSecureContext ? (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Your browser doesn't support WebAuthn.") : (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Webauthn is not available in insecure context.") }) : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
            platformAvailable ? /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(MenuLink, { action: "platform", icon: "fingerprint", children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Your Device") }) : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(MenuLink, { icon: "fingerprint", children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Your browser doesn't support platform authenticator.") }),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(MenuLink, { action: "cross-platform", icon: "usb", children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Multi Platform Authenticator") })
          ] })
        ] })
      ] })
    );
    const action = await new vj_components_dialog__WEBPACK_IMPORTED_MODULE_4__.ActionDialog({ $body, $action: [] }).open();
    if (!action || action === "cancel") return;
    if (action === "tfa") enableTfa();
    else enableAuthn(action);
  });
  jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("click", '[data-operation="change_mail"]', async (ev) => {
    ev.preventDefault();
    await changeMail();
  });
}));


/***/ },

/***/ "./pages/home_settings.page.ts"
/*!*************************************!*\
  !*** ./pages/home_settings.page.ts ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage("home_account", () => {
  document.getElementsByName("avatar")[0].parentNode.parentNode.parentElement.remove();
  const $type = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.tpl)`
    <select id="type" class="select">
      <option value="gravatar">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Gravatar")}</option>
      <option value="github">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("GitHub")}</option>
      <option value="qq">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("QQ")}</option>
      <option value="upload">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Upload")}</option>
    </select>
  `);
  const $text = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.tpl)`<input type="text" class="textbox" placeholder="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Avatar URL")}">`);
  const $layout = jquery__WEBPACK_IMPORTED_MODULE_0___default()(`
    <div class="row">
      ${[["type", 3], ["text", 6], ["btn", 3]].map(([i, w]) => `
        <div class="medium-${w} columns form__item">
          <div name="form_item_${i}"></div>
        </div>
      `).join(" ")}
    </div>
  `);
  const $file = jquery__WEBPACK_IMPORTED_MODULE_0___default()('<input type="file" style="display:none" accept=".jpg,.jpeg,.png">');
  const $confirm = jquery__WEBPACK_IMPORTED_MODULE_0___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.tpl)`<button class="button rounded primary">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Confirm")}</button>`);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()("button.change-avatar").on("click", () => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(".changeAvatar").append($layout);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="form_item_type"]').append($type);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="form_item_text"]').append($text);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="form_item_text"]').append($file);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="form_item_btn"]').append($confirm);
    jquery__WEBPACK_IMPORTED_MODULE_0___default()("button.change-avatar").hide();
    $type.trigger("change");
  });
  $type.on("change", () => {
    if ($type.val() === "upload") {
      $text.hide();
      $file.show();
    } else {
      $text.show();
      $file.hide();
      const placeholder = $type.val() === "gravatar" ? "Email address" : $type.val() === "github" ? "GitHub username" : "QQ ID";
      $text.attr("placeholder", (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)(placeholder));
    }
  });
  $confirm.on("click", async () => {
    try {
      if ($type.val() === "upload") {
        const formData = new FormData();
        formData.append("file", $file[0].files[0]);
        await vj_utils__WEBPACK_IMPORTED_MODULE_3__.request.postFile("/home/avatar", formData);
        vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Upload success."));
      } else {
        await vj_utils__WEBPACK_IMPORTED_MODULE_3__.request.post("/home/avatar", {
          avatar: `${$type.val()}:${$text.val()}`
        });
        vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Updated."));
      }
      await (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.delay)(800);
      window.location.reload();
    } catch (e) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].error(e.message);
    }
  });
}));


/***/ },

/***/ "./pages/homework_edit.page.ts"
/*!*************************************!*\
  !*** ./pages/homework_edit.page.ts ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage("homework_edit", () => {
  let confirmed = false;
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[value="delete"]', (ev) => {
    ev.preventDefault();
    if (confirmed) {
      return vj_utils__WEBPACK_IMPORTED_MODULE_3__.request.post("", { operation: "delete" }).then((res) => {
        window.location.href = res.url;
      });
    }
    const message = "Confirm deleting this homework? Its files and status will be deleted as well.";
    return new vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.ConfirmDialog({
      $body: vj_utils__WEBPACK_IMPORTED_MODULE_3__.tpl.typoMsg((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)(message))
    }).open().then((action) => {
      if (action !== "yes") return;
      confirmed = true;
      ev.target.click();
    });
  });
}));


/***/ },

/***/ "./pages/homework_main.page.js"
/*!*************************************!*\
  !*** ./pages/homework_main.page.js ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");


const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.NamedPage("homework_main", () => {
  var _a;
  const refreshCompletedOverflow = (root = document) => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(root).find("[data-homework-completed-line]").each((_, line) => {
      const pills = jquery__WEBPACK_IMPORTED_MODULE_0___default()(line).find("[data-homework-completed-pills]")[0];
      if (!pills) return;
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(line).toggleClass("is-overflowing", pills.scrollWidth > pills.clientWidth + 1);
    });
  };
  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
  const reducedMotion = (_a = window.matchMedia) == null ? void 0 : _a.call(window, "(prefers-reduced-motion: reduce)").matches;
  const leaveDuration = reducedMotion ? 0 : 160;
  const enterDuration = reducedMotion ? 0 : 300;
  const adminViewLink = "[data-homework-admin-view-link]";
  let viewRequest;
  let viewRequestId = 0;
  const setViewLoading = (admin, url, loading) => {
    admin.querySelectorAll(adminViewLink).forEach((link) => {
      const isTarget = new URL(link.href, window.location.href).href === url.href;
      link.classList.toggle("is-loading", loading && isTarget);
    });
  };
  const loadHomeworkView = async (href, { pushHistory = true, restoreFocus = false } = {}) => {
    var _a2;
    const url = new URL(href, window.location.href);
    const admin = document.querySelector("[data-homework-admin]");
    if (!admin || url.origin !== window.location.origin) {
      window.location.assign(url.href);
      return;
    }
    const requestId = ++viewRequestId;
    viewRequest == null ? void 0 : viewRequest.abort();
    const controller = new AbortController();
    viewRequest = controller;
    admin.setAttribute("aria-busy", "true");
    setViewLoading(admin, url, true);
    try {
      const response = await fetch(url.href, {
        credentials: "same-origin",
        signal: controller.signal
      });
      if (!response.ok || response.redirected) throw new Error("Unable to load homework view");
      const pageDocument = new DOMParser().parseFromString(await response.text(), "text/html");
      const nextAdmin = pageDocument.querySelector("[data-homework-admin]");
      const nextSidebar = nextAdmin == null ? void 0 : nextAdmin.querySelector("[data-homework-admin-sidebar]");
      const nextPanel = nextAdmin == null ? void 0 : nextAdmin.querySelector("[data-homework-admin-panel]");
      if (!nextSidebar || !nextPanel || requestId !== viewRequestId) return;
      const currentAdmin = document.querySelector("[data-homework-admin]");
      const currentSidebar = currentAdmin == null ? void 0 : currentAdmin.querySelector("[data-homework-admin-sidebar]");
      const currentPanel = currentAdmin == null ? void 0 : currentAdmin.querySelector("[data-homework-admin-panel]");
      if (!currentAdmin || !currentSidebar || !currentPanel) throw new Error("Homework view is unavailable");
      currentSidebar.classList.add("is-homework-view-leaving");
      currentPanel.classList.add("is-homework-view-leaving");
      await wait(leaveDuration);
      if (requestId !== viewRequestId) return;
      currentSidebar.replaceWith(nextSidebar);
      currentPanel.replaceWith(nextPanel);
      currentAdmin.dataset.homeworkView = nextAdmin.dataset.homeworkView;
      nextSidebar.classList.add("is-homework-view-entering");
      nextPanel.classList.add("is-homework-view-entering");
      window.setTimeout(() => {
        nextSidebar.classList.remove("is-homework-view-entering");
        nextPanel.classList.remove("is-homework-view-entering");
      }, enterDuration);
      window.requestAnimationFrame(() => refreshCompletedOverflow(nextPanel));
      if (pushHistory) window.history.pushState({ homeworkView: url.href }, "", url.href);
      if (restoreFocus) (_a2 = nextSidebar.querySelector(`${adminViewLink}.is-active`)) == null ? void 0 : _a2.focus({ preventScroll: true });
    } catch {
      if (controller.signal.aborted || requestId !== viewRequestId) return;
      window.location.assign(url.href);
    } finally {
      if (requestId === viewRequestId) {
        const currentAdmin = document.querySelector("[data-homework-admin]");
        if (currentAdmin) {
          currentAdmin.setAttribute("aria-busy", "false");
          setViewLoading(currentAdmin, url, false);
        }
        if (viewRequest === controller) viewRequest = void 0;
      }
    }
  };
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).off("change.homework-main-filter", '[name="filter-form"] select').on(
    "change.homework-main-filter",
    '[name="filter-form"] select',
    function onFilterChange() {
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(this).closest('[name="filter-form"]').trigger("submit");
    }
  );
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).off(
    "click.homework-main-toggle",
    "[data-homework-student-toggle], [data-homework-assignment-toggle]"
  ).on(
    "click.homework-main-toggle",
    "[data-homework-student-toggle], [data-homework-assignment-toggle]",
    function onToggle() {
      const $trigger = jquery__WEBPACK_IMPORTED_MODULE_0___default()(this);
      const expanded = $trigger.attr("aria-expanded") === "true";
      const id = $trigger.attr("aria-controls");
      const details = id ? document.getElementById(id) : void 0;
      if (!details) return;
      $trigger.attr("aria-expanded", String(!expanded));
      details.hidden = expanded;
      if (!expanded) requestAnimationFrame(() => refreshCompletedOverflow());
    }
  );
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).off("click.homework-main-view", adminViewLink).on("click.homework-main-view", adminViewLink, function onViewClick(event) {
    const nonPrimaryPointer = typeof event.button === "number" && event.button !== 0;
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || nonPrimaryPointer) return;
    event.preventDefault();
    if (this.classList.contains("is-active")) return;
    void loadHomeworkView(this.href, { restoreFocus: document.activeElement === this });
  });
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(window).off("popstate.homework-main").on("popstate.homework-main", () => {
    if (!window.location.pathname.endsWith("/homework")) return;
    void loadHomeworkView(window.location.href, { pushHistory: false });
  });
  refreshCompletedOverflow();
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(window).off("resize.homework-main").on("resize.homework-main", () => refreshCompletedOverflow());
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/manage_dashboard.page.js"
/*!****************************************!*\
  !*** ./pages/manage_dashboard.page.js ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");


const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.NamedPage("manage_dashboard", async () => {
  const { default: WebSocket } = await Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! ../components/socket */ "./components/socket/index.ts"));
  const sock = new WebSocket(`${UiContext.ws_prefix}manage/check-conn`);
  sock.onopen = () => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()('<blockquote class="blue"><p>Connection opened.</p></blockquote>').appendTo("#messages");
  };
  sock.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    const color = {
      log: "blue",
      warn: "yellow",
      error: "red"
    };
    const div = jquery__WEBPACK_IMPORTED_MODULE_0___default()(`<blockquote class="${color[msg.type]}">`).appendTo("#messages");
    for (const line of (msg.payload || "").split("\n")) jquery__WEBPACK_IMPORTED_MODULE_0___default()(`<p>${line}</p>`).appendTo(div);
  };
  sock.onclose = (message) => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(`
    <blockquote class="yellow">
      <p>Connection closed,reason=${JSON.stringify(message.reason)}</p>
    </blockquote>
    `).appendTo("#messages");
  };
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/manage_script.page.js"
/*!*************************************!*\
  !*** ./pages/manage_script.page.js ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");





const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__.NamedPage("manage_script", () => {
  const runScriptDialog = new vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.ActionDialog({
    $body: jquery__WEBPACK_IMPORTED_MODULE_0___default()(".dialog__body--run-script > div")
  });
  runScriptDialog.clear = function() {
    this.$dom.find('[name="args"]').val("");
    return this;
  };
  window.runScript = async function(id) {
    const action = await runScriptDialog.clear().open();
    if (action !== "ok") return;
    const args = runScriptDialog.$dom.find('[name="args"]').val();
    try {
      const res = await vj_utils__WEBPACK_IMPORTED_MODULE_4__.request.post("", {
        args,
        id
      });
      window.location.href = res.url;
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_2__["default"].error(error.message);
    }
  };
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/manage_user_import.page.js"
/*!******************************************!*\
  !*** ./pages/manage_user_import.page.js ***!
  \******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage("manage_user_import", () => {
  async function post(draft) {
    var _a;
    try {
      const res = await vj_utils__WEBPACK_IMPORTED_MODULE_3__.request.post("", {
        users: jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="users"]').val(),
        draft
      });
      if (!draft) {
        if (res.url) window.location.href = res.url;
        else if (res.error) throw new Error(((_a = res.error) == null ? void 0 : _a.message) || res.error);
        else {
          vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)("Created {0} users.", res.users.length));
          await (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.delay)(2e3);
          window.location.reload();
        }
      } else {
        jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="messages"]').text(res.messages.join("\n"));
      }
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_1__["default"].error(error.message);
    }
  }
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="preview"]').on("click", () => post(true));
  jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="submit"]').on("click", () => post(false));
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/manage_user_priv.page.js"
/*!****************************************!*\
  !*** ./pages/manage_user_priv.page.js ***!
  \****************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_components_selectUser__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/selectUser */ "./components/selectUser.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");






const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.NamedPage("manage_user_priv", () => {
  const setPrivDialog = new vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.ActionDialog({
    $body: jquery__WEBPACK_IMPORTED_MODULE_0___default()(".dialog__body--set-priv > div")
  });
  setPrivDialog.clear = function(priv) {
    this.$dom.find("input.priv[type=checkbox]:hidden").each((i, e) => {
      e.checked = priv & e.value;
    });
    return this;
  };
  async function changeUserPriv(uid, priv) {
    try {
      const res = await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post("", {
        uid: uid !== "default" ? uid : 0,
        priv,
        system: uid === "default"
      });
      if (res.url && res.url !== window.location.href) window.location.href = res.url;
      else {
        vj_components_notification__WEBPACK_IMPORTED_MODULE_2__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Priv has been updated to {0}.", priv));
        vj_utils__WEBPACK_IMPORTED_MODULE_5__.pjax.request({ push: false });
      }
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_2__["default"].error(error.message);
    }
  }
  async function handleOpenUserPrivDialog(ev) {
    const uid = ev.target ? jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.target).data("uid") : ev._id;
    const priv = ev.target ? jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.target).data("priv") : ev.priv;
    await setPrivDialog.clear(priv);
    const action = await setPrivDialog.open();
    if (action !== "ok") return;
    let userPriv = 0;
    setPrivDialog.$dom.find("input.priv[type=checkbox]").each((i, e) => {
      if (e.checked) userPriv |= e.value;
    });
    changeUserPriv(uid, userPriv);
  }
  async function handleClickSelectUser() {
    const target = await (0,vj_components_selectUser__WEBPACK_IMPORTED_MODULE_3__["default"])();
    if (!(target == null ? void 0 : target._id)) return;
    const user = await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.get(`/user/${target._id}`);
    handleOpenUserPrivDialog(user.udoc);
  }
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="select_user"]', () => handleClickSelectUser());
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="set_priv"]', (ev) => handleOpenUserPrivDialog(ev));
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/problem_config.page.tsx"
/*!***************************************!*\
  !*** ./pages/problem_config.page.tsx ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/common */ "../common/subtask.ts");
/* harmony import */ var _mantine_core__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @mantine/core */ "../../node_modules/@mantine/core/esm/core/MantineProvider/MantineProvider.mjs");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var js_yaml__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! js-yaml */ "../../node_modules/js-yaml/dist/js-yaml.mjs");
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/components/dialog/index */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_components_problemconfig_ProblemConfigEditor__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/components/problemconfig/ProblemConfigEditor */ "./components/problemconfig/ProblemConfigEditor.tsx");
/* harmony import */ var vj_components_upload__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! vj/components/upload */ "./components/upload.tsx");
/* harmony import */ var vj_components_zipDownloader__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! vj/components/zipDownloader */ "./components/zipDownloader/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");













const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_11__.NamedPage("problem_config", () => {
  let reduxStore;
  async function handleClickUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.click();
    await new Promise((resolve) => {
      input.onchange = resolve;
    });
    await (0,vj_components_upload__WEBPACK_IMPORTED_MODULE_9__["default"])("./files", input.files, {
      type: "testdata",
      sidebar: true,
      pjax: true,
      singleFileUploadCallback: (file) => {
        reduxStore.dispatch({
          type: "CONFIG_ADD_TESTDATA",
          value: {
            _id: file.name,
            name: file.name,
            size: file.size
          }
        });
      }
    });
  }
  async function handleClickRename(ev) {
    var _a;
    const file = [jquery__WEBPACK_IMPORTED_MODULE_3___default()(ev.currentTarget).parent().parent().attr("data-filename")];
    const newName = (_a = await (0,vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_6__.prompt)((0,vj_utils__WEBPACK_IMPORTED_MODULE_12__.i18n)("Enter a new name for the file: "), {
      name: { required: true, type: "text", autofocus: true }
    })) == null ? void 0 : _a.name;
    if (!newName) return;
    try {
      await vj_utils__WEBPACK_IMPORTED_MODULE_12__.request.post("./files", {
        operation: "rename_files",
        files: file,
        newNames: [newName],
        type: "testdata"
      });
      vj_components_notification__WEBPACK_IMPORTED_MODULE_7__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_12__.i18n)("File has been renamed."));
      await vj_utils__WEBPACK_IMPORTED_MODULE_12__.pjax.request({ url: "./files?d=testdata&sidebar=true", push: false });
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_7__["default"].error(error.message);
    }
  }
  async function handleClickRemove(ev) {
    const file = [jquery__WEBPACK_IMPORTED_MODULE_3___default()(ev.currentTarget).parent().parent().attr("data-filename")];
    if (!await (0,vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_6__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_12__.i18n)("Confirm to delete the file?"))) return;
    try {
      await vj_utils__WEBPACK_IMPORTED_MODULE_12__.request.post("./files", {
        operation: "delete_files",
        files: file,
        type: "testdata"
      });
      vj_components_notification__WEBPACK_IMPORTED_MODULE_7__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_12__.i18n)("File has been deleted."));
      reduxStore.dispatch({
        type: "CONFIG_DELETE_TESTDATA",
        value: file
      });
      await vj_utils__WEBPACK_IMPORTED_MODULE_12__.pjax.request({ url: "./files?d=testdata&sidebar=true", push: false });
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_7__["default"].error(error.message);
    }
  }
  async function handleClickDownloadAll() {
    const files = reduxStore.getState().testdata.map((i) => i.name);
    const { links, pdoc } = await vj_utils__WEBPACK_IMPORTED_MODULE_12__.request.post("./files", { operation: "get_links", files, type: "testdata" });
    const targets = [];
    for (const filename of Object.keys(links)) targets.push({ filename, url: links[filename] });
    await (0,vj_components_zipDownloader__WEBPACK_IMPORTED_MODULE_10__["default"])(`${pdoc.docId} ${pdoc.title}.zip`, targets);
  }
  async function uploadConfig(config) {
    const configYaml = js_yaml__WEBPACK_IMPORTED_MODULE_4__["default"].dump((0,vj_components_problemconfig_ProblemConfigEditor__WEBPACK_IMPORTED_MODULE_8__.configYamlFormat)(config));
    vj_components_notification__WEBPACK_IMPORTED_MODULE_7__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_12__.i18n)("Saving file..."));
    const data = new FormData();
    data.append("filename", "config.yaml");
    data.append("file", new Blob([configYaml], { type: "text/plain" }));
    data.append("type", "testdata");
    data.append("operation", "upload_file");
    await vj_utils__WEBPACK_IMPORTED_MODULE_12__.request.postFile("./files", data);
    vj_components_notification__WEBPACK_IMPORTED_MODULE_7__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_12__.i18n)("File saved."));
    window.location.reload();
  }
  async function mountComponent() {
    const [{ default: ProblemConfig }, { default: ProblemConfigReducer }] = await Promise.all([
      Promise.all(/*! import() */[__webpack_require__.e("n.mantine"), __webpack_require__.e("default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1")]).then(__webpack_require__.bind(__webpack_require__, /*! vj/components/problemconfig/index */ "./components/problemconfig/index.tsx")),
      Promise.all(/*! import() */[__webpack_require__.e("n.ajv"), __webpack_require__.e("default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1")]).then(__webpack_require__.bind(__webpack_require__, /*! vj/components/problemconfig/reducer */ "./components/problemconfig/reducer/index.ts"))
    ]);
    const { Provider, store } = await (0,vj_utils__WEBPACK_IMPORTED_MODULE_12__.loadReactRedux)(ProblemConfigReducer);
    reduxStore = store;
    store.dispatch({
      type: "CONFIG_LOAD",
      payload: vj_utils__WEBPACK_IMPORTED_MODULE_12__.request.get("")
    });
    let autoConfigTriggered = false;
    const unsubscribe = store.subscribe(() => {
      var _a;
      const state = store.getState();
      if (!state.config.__loaded) return;
      if (state.config.cases) {
        const score = state.config.score * state.config.cases.length;
        state.config.subtasks = [{
          type: "sum",
          score: score && score < 100 ? score : 100,
          cases: state.config.cases,
          id: 1
        }];
        delete state.config.cases;
        delete state.config.score;
      }
      if (((_a = state.config.subtasks) == null ? void 0 : _a.length) || autoConfigTriggered) {
        autoConfigTriggered = true;
        return;
      }
      const testdata = (state.testdata || []).map((i) => i.name);
      unsubscribe();
      const subtasks = (0,_hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.readSubtasksFromFiles)(testdata, state.config);
      store.dispatch({
        type: "CONFIG_AUTOCASES_UPDATE",
        subtasks: (0,_hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.normalizeSubtasks)(subtasks, (i) => i, state.config.time, state.config.memory, true)
      });
    });
    (0,react_dom_client__WEBPACK_IMPORTED_MODULE_5__.createRoot)(document.getElementById("ProblemConfig")).render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_mantine_core__WEBPACK_IMPORTED_MODULE_2__.MantineProvider, { children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Provider, { store, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ProblemConfig, { onSave: () => uploadConfig(store.getState().config) }) }) }));
  }
  mountComponent();
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", '[name="testdata__upload"]', () => handleClickUpload());
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", '[name="testdata__rename"]', (ev) => handleClickRename(ev));
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", '[name="testdata__delete"]', (ev) => handleClickRemove(ev));
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", '[name="testdata__download__all"]', () => handleClickDownloadAll());
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/problem_detail.page.tsx"
/*!***************************************!*\
  !*** ./pages/problem_detail.page.tsx ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/common */ "../common/status.ts");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var js_yaml__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! js-yaml */ "../../node_modules/js-yaml/dist/js-yaml.mjs");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_components_zipDownloader__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/components/zipDownloader */ "./components/zipDownloader/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var vj_utils_db__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! vj/utils/db */ "./utils/db.ts");
/* harmony import */ var _components_badge_ac_effect__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ../components/badge_ac_effect */ "./components/badge_ac_effect.ts");
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);













class ProblemPageExtender {
  constructor() {
    __publicField(this, "isExtended", false);
    __publicField(this, "inProgress", false);
    __publicField(this, "$content", jquery__WEBPACK_IMPORTED_MODULE_2___default()(".problem-content-container"));
    __publicField(this, "$contentBound", this.$content.closest(".section"));
    __publicField(this, "$scratchpadContainer", jquery__WEBPACK_IMPORTED_MODULE_2___default()(".scratchpad-container"));
  }
  async extend() {
    if (this.inProgress) return;
    if (this.isExtended) return;
    this.inProgress = true;
    const bound = this.$contentBound.get(0).getBoundingClientRect();
    this.$content.transition({ opacity: 0 }, { duration: 100 });
    await (0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.delay)(100);
    jquery__WEBPACK_IMPORTED_MODULE_2___default()("body").addClass("header--collapsed mode--scratchpad");
    await this.$scratchpadContainer.css({
      left: bound.left,
      top: bound.top,
      width: bound.width,
      height: bound.height
    }).show().transition({
      // @ts-ignore
      left: 0,
      top: 0,
      width: "100%",
      height: "100%"
    }, {
      duration: 500,
      easing: "easeOutCubic"
    }).promise();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".main > .row").hide();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".footer").hide();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(window).scrollTop(0);
    window.document.body.style.overflow = "hidden";
    this.inProgress = false;
    this.isExtended = true;
  }
  async collapse() {
    if (this.inProgress) return;
    if (!this.isExtended) return;
    this.inProgress = true;
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(window).scrollTop(0);
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".main > .row").show();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".footer").show();
    const bound = this.$contentBound.get(0).getBoundingClientRect();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()("body").removeClass("header--collapsed mode--scratchpad");
    await this.$scratchpadContainer.transition({
      // @ts-ignore
      left: bound.left,
      top: bound.top,
      width: bound.width,
      height: bound.height
    }, {
      duration: 500,
      easing: "easeOutCubic"
    }).promise();
    this.$scratchpadContainer.hide();
    this.$content.transition({ opacity: 1 }, { duration: 100 });
    window.document.body.style.overflow = "scroll";
    this.inProgress = false;
    this.isExtended = false;
  }
  toggle() {
    if (this.isExtended) this.collapse();
    else this.extend();
  }
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_9__.NamedPage(["problem_detail", "contest_detail_problem", "homework_detail_problem"], async () => {
  var _a, _b;
  let reactLoaded = false;
  let renderReact = null;
  let unmountReact = null;
  const extender = new ProblemPageExtender();
  const normalStatuses = new Set(_hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.NORMAL_STATUS);
  const recordPretestId = "000000000000000000000000";
  const recordGenerateId = "000000000000000000000001";
  let firstFormalRecordStatus = Number.isFinite(+UiContext.firstFormalRecordStatus) ? +UiContext.firstFormalRecordStatus : null;
  let hasWrongFormalRecord = !!UiContext.hasWrongFormalRecord;
  let sawCurrentWrongFormalRecord = false;
  const currentFormalSubmitRids = /* @__PURE__ */ new Set();
  const watchedFormalSubmitRids = /* @__PURE__ */ new Set();
  const pollingFormalSubmitRids = /* @__PURE__ */ new Set();
  const reportedFormalSubmitRids = /* @__PURE__ */ new Set();
  const formalSubmitEffectPromises = /* @__PURE__ */ new Map();
  let formalSubmitEventListenerBound = false;
  let badgeAcFirstEligible = UiContext.badgeAcFirstEligible !== false;
  const badgeThemeEffect = (0,_components_badge_ac_effect__WEBPACK_IMPORTED_MODULE_12__.createBadgeAcThemePlayer)(UiContext.badgeAcTheme);
  const contestProgressDetails = {
    ...((_a = UiContext.tsdoc) == null ? void 0 : _a.detail) || {}
  };
  function isContestSubmitFeedbackEnabled() {
    return UiContext.isContestProblem === true;
  }
  function isFinalRecordStatus(status) {
    return normalStatuses.has(status) || status === _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_CANCELED;
  }
  function normalizeContestScore(value) {
    const score = Number(value);
    if (!Number.isFinite(score)) return 0;
    return Math.round((score + Number.EPSILON) * 100) / 100;
  }
  function formatContestScore(value) {
    const rounded = normalizeContestScore(value);
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  function getContestProblemScore(pid) {
    var _a2, _b2, _c;
    const score = Number((_c = (_b2 = (_a2 = UiContext.tdoc) == null ? void 0 : _a2.score) == null ? void 0 : _b2[pid]) != null ? _c : 100);
    return Number.isFinite(score) ? score : 100;
  }
  function getContestRecordScore(rdoc) {
    const score = Number(rdoc == null ? void 0 : rdoc.score);
    return Number.isFinite(score) ? Math.max(0, score) : 0;
  }
  function isFullScoreAccepted(rdoc) {
    return +(rdoc == null ? void 0 : rdoc.status) === _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_ACCEPTED;
  }
  function playBadgeThemeAcEffect() {
    return badgeThemeEffect.play();
  }
  function getContestStatusText(status) {
    if (status === _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_ACCEPTED) return "AC";
    return _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS_TEXTS[status] || "\u8BC4\u6D4B\u5B8C\u6210";
  }
  function updateContestProgress(rdoc) {
    var _a2, _b2;
    const pid = Number(rdoc == null ? void 0 : rdoc.pid);
    if (!Number.isFinite(pid) || !((_b2 = (_a2 = UiContext.tdoc) == null ? void 0 : _a2.pids) == null ? void 0 : _b2.some((item) => Number(item) === pid))) return;
    const key = `${pid}`;
    const previous = contestProgressDetails[key];
    const rule = UiContext.tdoc.rule;
    if (rule === "oi") {
      if (!previous || getContestRecordScore(rdoc) >= getContestRecordScore(previous)) contestProgressDetails[key] = rdoc;
      return;
    }
    if (rule === "acm") {
      if (!previous || previous.status !== _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_ACCEPTED) contestProgressDetails[key] = rdoc;
      return;
    }
    if (!previous || getContestRecordScore(rdoc) >= getContestRecordScore(previous)) {
      contestProgressDetails[key] = rdoc;
    }
  }
  function getContestProgressSummary() {
    var _a2;
    const pids = ((_a2 = UiContext.tdoc) == null ? void 0 : _a2.pids) || [];
    let totalScore = 0;
    let maxTotalScore = 0;
    let acceptedCount = 0;
    for (const rawPid of pids) {
      const pid = Number(rawPid);
      maxTotalScore = normalizeContestScore(maxTotalScore + getContestProblemScore(pid));
      const detail = contestProgressDetails[pid];
      if (!detail) continue;
      totalScore = normalizeContestScore(totalScore + getContestProblemScore(pid) * getContestRecordScore(detail) / 100);
      if (+detail.status === _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_ACCEPTED) acceptedCount++;
    }
    return {
      totalScore,
      maxTotalScore,
      acceptedCount,
      remainingCount: Math.max(0, pids.length - acceptedCount)
    };
  }
  function updateMistakePromptPosition() {
    const prompt = document.querySelector(".problem-mistake-float");
    if (!prompt) return;
    if (!document.body.classList.contains("mode--scratchpad")) {
      prompt.style.removeProperty("--problem-mistake-left");
      prompt.style.removeProperty("--problem-mistake-bottom");
      return;
    }
    const editorElement = document.querySelector(".monaco-editor") || document.querySelector(".splitpane-fill") || document.querySelector(".scratchpad__toolbar");
    const editorRect = editorElement == null ? void 0 : editorElement.getBoundingClientRect();
    if (editorRect && editorRect.width > 0) {
      prompt.style.setProperty("--problem-mistake-left", `${Math.max(12, editorRect.left + 12)}px`);
    }
    const panelTitles = Array.from(document.querySelectorAll(".scratchpad__panel-title")).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const recordsTitle = panelTitles.find((element) => {
      const text = (element.textContent || "").trim().toLowerCase();
      return text.includes("\u8BC4\u6D4B\u8BB0\u5F55") || text.includes("record");
    }) || panelTitles[panelTitles.length - 1];
    const recordsRect = recordsTitle == null ? void 0 : recordsTitle.getBoundingClientRect();
    if (recordsRect && recordsRect.top > 0 && recordsRect.top < window.innerHeight) {
      prompt.style.setProperty("--problem-mistake-bottom", `${Math.max(72, window.innerHeight - recordsRect.top + 8)}px`);
    }
  }
  function revealMistakePrompt() {
    updateMistakePromptPosition();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".problem-mistake-float").removeClass("problem-mistake-float--hidden");
  }
  function getRecordId(rdoc) {
    var _a2, _b2, _c;
    const id = (_c = (_b2 = (_a2 = rdoc == null ? void 0 : rdoc._id) != null ? _a2 : rdoc == null ? void 0 : rdoc.rid) != null ? _b2 : rdoc == null ? void 0 : rdoc.recordId) != null ? _c : rdoc == null ? void 0 : rdoc.id;
    if (id === void 0 || id === null || id === "") return "";
    if (typeof id === "string" || typeof id === "number") return `${id}`;
    if (id.$oid) return `${id.$oid}`;
    if (id.oid) return `${id.oid}`;
    if (typeof id.toHexString === "function") return id.toHexString();
    return `${id}`;
  }
  function getResponsePayloads(result) {
    var _a2, _b2, _c;
    return [
      result,
      result == null ? void 0 : result.data,
      (_a2 = result == null ? void 0 : result.data) == null ? void 0 : _a2.data,
      result == null ? void 0 : result.body,
      (_b2 = result == null ? void 0 : result.body) == null ? void 0 : _b2.data,
      result == null ? void 0 : result.response,
      (_c = result == null ? void 0 : result.response) == null ? void 0 : _c.data
    ].filter(Boolean);
  }
  function findFormalSubmitRecord(result, recordId) {
    for (const payload of getResponsePayloads(result)) {
      for (const rdoc of [payload == null ? void 0 : payload.rdoc, payload == null ? void 0 : payload.record]) {
        if (rdoc && getRecordId(rdoc) === recordId) return rdoc;
      }
      for (const records of [payload == null ? void 0 : payload.rdocs, payload == null ? void 0 : payload.records, payload == null ? void 0 : payload.docs, payload == null ? void 0 : payload.data]) {
        if (!Array.isArray(records)) continue;
        const rdoc = records.find((item) => getRecordId(item) === recordId);
        if (rdoc) return rdoc;
      }
    }
    return null;
  }
  function getRecordContestId(rdoc) {
    const contest = rdoc == null ? void 0 : rdoc.contest;
    if (!contest) return "";
    if (typeof contest === "string") return contest;
    if (contest.$oid) return contest.$oid;
    if (contest.toHexString) return contest.toHexString();
    return `${contest}`;
  }
  function isFormalRecord(rdoc, store) {
    var _a2, _b2;
    if (!rdoc) return false;
    const recordId = getRecordId(rdoc);
    const state = store.getState();
    const contestId = getRecordContestId(rdoc);
    if (contestId === recordGenerateId) return false;
    if (Object.hasOwn(rdoc, "input")) return false;
    const pretestRid = (_a2 = state == null ? void 0 : state.pretest) == null ? void 0 : _a2.rid;
    if (recordId && pretestRid && recordId === pretestRid) return false;
    if (recordId && (((_b2 = state == null ? void 0 : state.ui) == null ? void 0 : _b2.formalSubmitRids) || []).some((rid) => getRecordId({ _id: rid }) === recordId)) return true;
    if (contestId === recordPretestId) return false;
    return true;
  }
  function isCurrentFormalSubmitRecord(store, rdoc) {
    var _a2, _b2;
    const recordId = getRecordId(rdoc);
    if (!recordId) return false;
    if (currentFormalSubmitRids.has(recordId) || watchedFormalSubmitRids.has(recordId) || pollingFormalSubmitRids.has(recordId)) return true;
    return (((_b2 = (_a2 = store.getState()) == null ? void 0 : _a2.ui) == null ? void 0 : _b2.formalSubmitRids) || []).some((rid) => getRecordId({ _id: rid }) === recordId);
  }
  function showContestSubmitResult(store, rdoc) {
    var _a2, _b2;
    if (!isContestSubmitFeedbackEnabled() || !isCurrentFormalSubmitRecord(store, rdoc)) return;
    const recordId = getRecordId(rdoc);
    const status = +rdoc.status;
    if (!recordId || !isFinalRecordStatus(status) || reportedFormalSubmitRids.has(recordId)) return;
    reportedFormalSubmitRids.add(recordId);
    updateContestProgress(rdoc);
    if (((_a2 = UiContext.tdoc) == null ? void 0 : _a2.rule) === "homework") return;
    const accepted = status === _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_ACCEPTED;
    const {
      acceptedCount,
      remainingCount
    } = getContestProgressSummary();
    const pid = Number(rdoc.pid);
    const maxScore = getContestProblemScore(pid);
    const problemScore = normalizeContestScore(maxScore * getContestRecordScore(rdoc) / 100);
    const { totalScore, maxTotalScore } = getContestProgressSummary();
    const isAcm = ((_b2 = UiContext.tdoc) == null ? void 0 : _b2.rule) === "acm";
    new vj_components_dialog__WEBPACK_IMPORTED_MODULE_6__.InfoDialog({
      classes: "dialog--contest-submit-result",
      width: "36rem",
      $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.tpl)(
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "contest-submit-result", children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "contest-submit-result__header", children: [
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "contest-submit-result__eyebrow", children: "\u6BD4\u8D5B\u8BC4\u6D4B\u5B8C\u6210" }),
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "contest-submit-result__title", children: accepted ? "\u672C\u9898 AC\uFF0C\u7EE7\u7EED\u52A0\u6CB9\uFF01" : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "contest-submit-result__title-line", children: "\u672C\u9898\u5DF2\u8BC4\u6D4B" }),
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "contest-submit-result__title-line contest-submit-result__title-line--hint", children: "\u53EF\u5C1D\u8BD5\u4FEE\u6539\u4EE3\u7801\u7EE7\u7EED\u8BC4\u6D4B\u76F4\u81F3AC" })
              ] }) })
            ] }),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: `contest-submit-result__status${accepted ? " is-accepted" : ""}`, children: getContestStatusText(status) })
          ] }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "contest-submit-result__score-grid", children: [
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "contest-submit-result__score-card", children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { children: "\u672C\u9898\u5F97\u5206" }),
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("strong", { children: [
                formatContestScore(problemScore),
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("small", { children: [
                  " / ",
                  formatContestScore(maxScore)
                ] })
              ] })
            ] }),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "contest-submit-result__score-card", children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { children: isAcm ? "\u5DF2\u5B8C\u6210\u9898\u76EE" : "\u6BD4\u8D5B\u7D2F\u8BA1\u5F97\u5206" }),
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("strong", { children: isAcm ? `${acceptedCount} \u9898` : /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
                formatContestScore(totalScore),
                /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("small", { children: [
                  " / ",
                  formatContestScore(maxTotalScore)
                ] })
              ] }) })
            ] })
          ] }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "contest-submit-result__summary", children: [
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("span", { children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("b", { children: acceptedCount }),
              " \u9898\u5DF2 AC"
            ] }),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("span", { children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("b", { children: remainingCount }),
              " \u9898\u5F85\u5B8C\u6210"
            ] })
          ] })
        ] })
      )
    }).open();
  }
  function getKnownFormalRecords(store) {
    var _a2, _b2;
    return Object.values(((_b2 = (_a2 = store.getState()) == null ? void 0 : _a2.records) == null ? void 0 : _b2.items) || {}).filter((rdoc) => {
      const status = +(rdoc == null ? void 0 : rdoc.status);
      return normalStatuses.has(status) && isFormalRecord(rdoc, store);
    }).sort((a, b) => getRecordId(a).localeCompare(getRecordId(b)));
  }
  function maybeRevealMistakePrompt(store, rdoc = null) {
    if (!UiContext.isMistakeSupported || !UiContext.canUseMistake) return;
    const $prompt = jquery__WEBPACK_IMPORTED_MODULE_2___default()(".problem-mistake-float");
    if (!$prompt.length || !$prompt.hasClass("problem-mistake-float--hidden")) return;
    if ($prompt.attr("data-mistake-state")) return;
    if (rdoc && isFormalRecord(rdoc, store)) {
      const pushedStatus = +rdoc.status;
      if (normalStatuses.has(pushedStatus)) {
        if (pushedStatus !== _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_ACCEPTED) {
          hasWrongFormalRecord = true;
          sawCurrentWrongFormalRecord = true;
        }
        if (firstFormalRecordStatus === null) firstFormalRecordStatus = pushedStatus;
      }
    }
    const records = getKnownFormalRecords(store);
    if (!records.length) return;
    if (firstFormalRecordStatus === null) firstFormalRecordStatus = +records[0].status;
    const latestRecord = records[records.length - 1];
    const latestStatus = +latestRecord.status;
    if (latestStatus !== _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_ACCEPTED) return;
    const latestId = getRecordId(latestRecord);
    const hasKnownWrongBeforeLatest = records.some((record) => {
      const recordStatus = +record.status;
      const recordId = getRecordId(record);
      return recordStatus !== _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_ACCEPTED && (!latestId || !recordId || recordId.localeCompare(latestId) < 0);
    });
    const latestIsCurrentSubmit = isCurrentFormalSubmitRecord(store, latestRecord);
    if (latestIsCurrentSubmit && (sawCurrentWrongFormalRecord || hasWrongFormalRecord || hasKnownWrongBeforeLatest || firstFormalRecordStatus !== null && firstFormalRecordStatus !== _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_ACCEPTED)) {
      revealMistakePrompt();
    }
  }
  function getRecordDetailConnUrl(recordId) {
    if (UiContext.contestSubmitFeedbackConnUrl) {
      return UiContext.contestSubmitFeedbackConnUrl.replace("{rid}", encodeURIComponent(recordId));
    }
    const query = new URLSearchParams({
      domainId: UiContext.pdoc.domainId,
      rid: recordId,
      noTemplate: "1"
    });
    return `record-detail-conn?${query.toString()}`;
  }
  function getContestSubmitFeedbackUrl(recordId) {
    if (!UiContext.contestSubmitFeedbackUrl) return "";
    return UiContext.contestSubmitFeedbackUrl.replace("{rid}", encodeURIComponent(recordId));
  }
  async function receiveFormalSubmitRecord(store, rdoc) {
    store.dispatch({
      type: "SCRATCHPAD_RECORDS_PUSH",
      payload: { rdoc }
    });
    maybeRevealMistakePrompt(store, rdoc);
    const recordId = getRecordId(rdoc);
    if (recordId && isCurrentFormalSubmitRecord(store, rdoc) && isFinalRecordStatus(+rdoc.status)) {
      let effectPromise = formalSubmitEffectPromises.get(recordId);
      if (!effectPromise) {
        const isAccepted = isFullScoreAccepted(rdoc);
        const shouldPlayBadgeEffect = isAccepted && badgeAcFirstEligible;
        if (isAccepted) badgeAcFirstEligible = false;
        effectPromise = shouldPlayBadgeEffect ? playBadgeThemeAcEffect() : Promise.resolve();
        formalSubmitEffectPromises.set(recordId, effectPromise);
      }
      await effectPromise;
    }
    showContestSubmitResult(store, rdoc);
  }
  function pollFormalSubmitRecord(store, rid) {
    const recordId = getRecordId({ _id: rid });
    const feedbackUrl = getContestSubmitFeedbackUrl(recordId);
    if (!recordId || !feedbackUrl && !UiContext.getSubmissionsUrl || pollingFormalSubmitRids.has(recordId)) return;
    pollingFormalSubmitRids.add(recordId);
    let attempts = 0;
    const poll = async () => {
      if (reportedFormalSubmitRids.has(recordId)) {
        pollingFormalSubmitRids.delete(recordId);
        return;
      }
      attempts++;
      try {
        const result = await vj_utils__WEBPACK_IMPORTED_MODULE_10__.request.get(feedbackUrl || UiContext.getSubmissionsUrl);
        const rdoc = findFormalSubmitRecord(result, recordId);
        if (rdoc) {
          void receiveFormalSubmitRecord(store, rdoc);
          if (isFinalRecordStatus(+rdoc.status)) {
            pollingFormalSubmitRids.delete(recordId);
            return;
          }
        }
      } catch (err) {
        console.warn("Failed to load contest submission result:", err);
      }
      if (attempts >= 45) {
        pollingFormalSubmitRids.delete(recordId);
        return;
      }
      window.setTimeout(poll, 1200);
    };
    window.setTimeout(poll, 500);
  }
  function watchFormalSubmitRecord(store, WebSocket, rid) {
    const recordId = getRecordId({ _id: rid });
    if (!recordId) return;
    currentFormalSubmitRids.add(recordId);
    if (watchedFormalSubmitRids.has(recordId)) return;
    watchedFormalSubmitRids.add(recordId);
    pollFormalSubmitRecord(store, rid);
    const sock = new WebSocket(UiContext.ws_prefix + getRecordDetailConnUrl(recordId));
    sock.onmessage = (message, data) => {
      let msg;
      try {
        msg = JSON.parse(data || message.data);
      } catch {
        return;
      }
      const rdoc = findFormalSubmitRecord(msg, recordId);
      if (!rdoc) return;
      void receiveFormalSubmitRecord(store, rdoc);
      const status = +rdoc.status;
      if (isFinalRecordStatus(status)) {
        setTimeout(() => sock.close(), 1e3);
      }
    };
  }
  function watchFormalSubmitRecords(store, WebSocket) {
    if (!formalSubmitEventListenerBound && typeof window !== "undefined") {
      formalSubmitEventListenerBound = true;
      window.addEventListener("hydro:formal-submit", (event) => {
        const detail = event.detail;
        const recordId = getRecordId({ _id: detail == null ? void 0 : detail.rid });
        if (!recordId) return;
        currentFormalSubmitRids.add(recordId);
        watchFormalSubmitRecord(store, WebSocket, recordId);
      });
    }
    const syncFormalSubmitRecords = () => {
      var _a2, _b2;
      const rids = ((_b2 = (_a2 = store.getState()) == null ? void 0 : _a2.ui) == null ? void 0 : _b2.formalSubmitRids) || [];
      rids.forEach((rid) => {
        const recordId = getRecordId({ _id: rid });
        if (recordId) currentFormalSubmitRids.add(recordId);
        watchFormalSubmitRecord(store, WebSocket, rid);
      });
      maybeRevealMistakePrompt(store);
    };
    syncFormalSubmitRecords();
    store.subscribe(syncFormalSubmitRecords);
  }
  async function handleClickDownloadProblem() {
    await (0,vj_components_zipDownloader__WEBPACK_IMPORTED_MODULE_8__.downloadProblemSet)([UiContext.problemNumId], UiContext.pdoc.title);
  }
  async function scratchpadFadeIn() {
    await jquery__WEBPACK_IMPORTED_MODULE_2___default()("#scratchpad").transition(
      { opacity: 1 },
      { duration: 200, easing: "easeOutCubic" }
    ).promise();
  }
  async function scratchpadFadeOut() {
    await jquery__WEBPACK_IMPORTED_MODULE_2___default()("#scratchpad").transition(
      { opacity: 0 },
      { duration: 200, easing: "easeOutCubic" }
    ).promise();
  }
  let scratchpadModulesPromise = null;
  function loadScratchpadModules() {
    scratchpadModulesPromise || (scratchpadModulesPromise = Promise.all([
      Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! ../components/socket */ "./components/socket/index.ts")),
      __webpack_require__.e(/*! import() */ "default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1").then(__webpack_require__.bind(__webpack_require__, /*! ../components/scratchpad */ "./components/scratchpad/index.tsx")),
      __webpack_require__.e(/*! import() */ "default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1").then(__webpack_require__.bind(__webpack_require__, /*! ../components/scratchpad/reducers */ "./components/scratchpad/reducers/index.ts"))
    ]).then(([socketModule, scratchpadModule, reducerModule]) => ({
      WebSocket: socketModule.default,
      ScratchpadApp: scratchpadModule.default,
      ScratchpadReducer: reducerModule.default
    })).catch((err) => {
      scratchpadModulesPromise = null;
      throw err;
    }));
    return scratchpadModulesPromise;
  }
  function preloadScratchpadModules() {
    if (reactLoaded) return;
    loadScratchpadModules().catch((err) => {
      console.error("Failed to preload scratchpad:", err);
    });
  }
  async function loadReact() {
    if (reactLoaded) return;
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".loader-container").show();
    const { WebSocket, ScratchpadApp, ScratchpadReducer } = await loadScratchpadModules();
    const { Provider, store } = await (0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.loadReactRedux)(ScratchpadReducer);
    window.store = store;
    const sock = new WebSocket(UiContext.ws_prefix + UiContext.pretestConnUrl);
    sock.onmessage = (message, data) => {
      const msg = JSON.parse(data || message.data);
      store.dispatch({
        type: "SCRATCHPAD_RECORDS_PUSH",
        payload: msg
      });
      maybeRevealMistakePrompt(store, msg.rdoc);
    };
    watchFormalSubmitRecords(store, WebSocket);
    renderReact = () => {
      const root = (0,react_dom_client__WEBPACK_IMPORTED_MODULE_5__.createRoot)(jquery__WEBPACK_IMPORTED_MODULE_2___default()("#scratchpad").get(0));
      root.render(
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(Provider, { store, children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ScratchpadApp, {}) })
      );
      unmountReact = () => root.unmount();
    };
    reactLoaded = true;
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".loader-container").hide();
  }
  let progress = false;
  async function enterScratchpadMode() {
    if (progress) return;
    progress = true;
    try {
      await loadReact();
      await extender.extend();
      renderReact();
      setTimeout(updateMistakePromptPosition, 0);
      await scratchpadFadeIn();
    } catch (err) {
      console.error("Failed to open scratchpad:", err);
      vj_components_notification__WEBPACK_IMPORTED_MODULE_7__["default"].error("\u5728\u7EBF\u7F16\u8F91\u5668\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5\u3002");
      if (extender.isExtended) {
        try {
          await extender.collapse();
        } catch (collapseErr) {
          console.error("Failed to restore problem page:", collapseErr);
        }
      }
      jquery__WEBPACK_IMPORTED_MODULE_2___default()(".loader-container").hide();
      jquery__WEBPACK_IMPORTED_MODULE_2___default()("#scratchpad").css({ opacity: 0 });
    } finally {
      progress = false;
    }
  }
  async function leaveScratchpadMode() {
    if (progress) return;
    progress = true;
    await scratchpadFadeOut();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".problem-content-container").append(jquery__WEBPACK_IMPORTED_MODULE_2___default()(".problem-content"));
    await extender.collapse();
    unmountReact();
    progress = false;
  }
  async function loadObjective() {
    var _a2;
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".outer-loader-container").show();
    document.documentElement.classList.add("objective-problem-mode");
    document.body.classList.add("objective-problem-mode");
    const ans = {};
    const pids = [];
    let cnt = 0;
    const reg = /\{\{ (input|select|multiselect|textarea)\(\d+(-\d+)?\) \}\}/g;
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".problem-content .typo").children().each((i, e) => {
      var _a3;
      if (e.tagName === "PRE" && !e.children[0].className.includes("#input")) return;
      const questions = [];
      let q;
      while (q = reg.exec(e.textContent)) questions.push(q);
      for (const [info, type] of questions) {
        cnt++;
        const id = info.replace(/\{\{ (input|select|multiselect|textarea)\((\d+(-\d+)?)\) \}\}/, "$2");
        pids.push(id);
        jquery__WEBPACK_IMPORTED_MODULE_2___default()(e).addClass("objective-question-title").attr("data-objective-id", id);
        if (type === "input") {
          jquery__WEBPACK_IMPORTED_MODULE_2___default()(e).html(jquery__WEBPACK_IMPORTED_MODULE_2___default()(e).html().replace(info, (0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.tpl)`
            <div class="objective_${id} objective-free-answer medium-3" id="p${id}">
              <input type="text" name="${id}" class="textbox objective-input" placeholder="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.i18n)("Answer")}">
            </div>
          `));
        } else if (type === "textarea") {
          jquery__WEBPACK_IMPORTED_MODULE_2___default()(e).html(jquery__WEBPACK_IMPORTED_MODULE_2___default()(e).html().replace(info, (0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.tpl)`
            <div class="objective_${id} objective-free-answer medium-6" id="p${id}">
              <textarea name="${id}" class="textbox objective-input" placeholder="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.i18n)("Answer")}"></textarea>
            </div>
          `));
        } else {
          if (((_a3 = jquery__WEBPACK_IMPORTED_MODULE_2___default()(e).next()[0]) == null ? void 0 : _a3.tagName) !== "UL") {
            cnt--;
            return;
          }
          jquery__WEBPACK_IMPORTED_MODULE_2___default()(e).html(jquery__WEBPACK_IMPORTED_MODULE_2___default()(e).html().replace(info, ""));
          jquery__WEBPACK_IMPORTED_MODULE_2___default()(e).next("ul").addClass(`objective-options objective-options--${type === "select" ? "single" : "multi"}`);
          jquery__WEBPACK_IMPORTED_MODULE_2___default()(e).next("ul").children().each((j, ele) => {
            const letter = String.fromCharCode(65 + j);
            jquery__WEBPACK_IMPORTED_MODULE_2___default()(ele).after((0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.tpl)`
              <label class="objective_${id} radiobox objective-option" id="p${id}">
                <input type="${type === "select" ? "radio" : "checkbox"}" name="${id}" class="objective-input" value="${letter}">
                <span class="objective-choice-body">
                  <span class="objective-choice-letter">${letter}</span>
                  <span class="objective-choice-text">${{ templateRaw: true, html: ele.innerHTML }}</span>
                </span>
              </label>
            `);
            jquery__WEBPACK_IMPORTED_MODULE_2___default()(ele).remove();
          });
        }
      }
    });
    let cacheKey = `${UserContext._id}/${UiContext.pdoc.domainId}/${UiContext.pdoc.docId}`;
    if (((_a2 = UiContext.tdoc) == null ? void 0 : _a2._id) && UiContext.tdoc.rule !== "homework") cacheKey += `@${UiContext.tdoc._id}`;
    let setUpdate;
    const db = await vj_utils_db__WEBPACK_IMPORTED_MODULE_11__.openDB;
    async function saveAns() {
      await db.put("solutions", {
        id: `${cacheKey}#objective`,
        value: JSON.stringify(ans)
      });
    }
    async function clearAns() {
      if (!await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_6__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.i18n)("All changes will be lost. Are you sure to clear all answers?"))) return;
      await db.delete("solutions", `${cacheKey}#objective`);
      window.location.reload();
    }
    function ProblemNavigation() {
      [, setUpdate] = react__WEBPACK_IMPORTED_MODULE_4___default().useState(0);
      const update = react__WEBPACK_IMPORTED_MODULE_4___default().useCallback(() => {
        setUpdate == null ? void 0 : setUpdate((v) => v + 1);
      }, []);
      react__WEBPACK_IMPORTED_MODULE_4___default().useEffect(() => {
        jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("click", update);
        jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("input", update);
        return () => {
          jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).off("click", update);
          jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).off("input", update);
        };
      }, [update]);
      return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "objective-nav-card", children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "objective-nav-title", children: "\u7B54\u9898\u5361" }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "contest-problems objective-nav-grid", children: pids.map((i) => /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("a", { href: `#p${i}`, className: ans[i] ? "pending objective-nav-item is-answered" : "objective-nav-item", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "id", children: i }) }, i)) }),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "objective-nav-legend", children: [
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("span", { children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("i", { className: "objective-nav-dot objective-nav-dot--answered" }),
              " \u5DF2\u7B54"
            ] }),
            /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("span", { children: [
              /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("i", { className: "objective-nav-dot" }),
              " \u672A\u7B54"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("li", { className: "menu__item", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("button", { className: "menu__link", onClick: clearAns, children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "icon icon-erase" }),
          " ",
          (0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.i18n)("Clear answers")
        ] }) })
      ] });
    }
    async function loadAns() {
      const saved = await db.get("solutions", `${cacheKey}#objective`);
      if (typeof (saved == null ? void 0 : saved.value) !== "string") return;
      const isValidOption = (v) => v.length === 1 && v.charCodeAt(0) >= 65 && v.charCodeAt(0) <= 90;
      Object.assign(ans, JSON.parse((saved == null ? void 0 : saved.value) || "{}"));
      for (const [id, val] of Object.entries(ans)) {
        if (Array.isArray(val)) {
          for (const v of val) {
            if (isValidOption(v)) jquery__WEBPACK_IMPORTED_MODULE_2___default()(`.objective_${id} input[value="${v}"]`).prop("checked", true);
          }
        } else if (val) {
          jquery__WEBPACK_IMPORTED_MODULE_2___default()(`.objective_${id} input[type=text], .objective_${id} textarea`).val(val.toString());
          if (isValidOption(val)) jquery__WEBPACK_IMPORTED_MODULE_2___default()(`.objective_${id}.radiobox [value="${val}"]`).prop("checked", true);
        }
      }
      setUpdate == null ? void 0 : setUpdate((v) => v + 1);
    }
    function setAnswer(name, value) {
      if (Array.isArray(value)) {
        if (value.length) ans[name] = value;
        else delete ans[name];
      } else if (value) ans[name] = value;
      else delete ans[name];
      setUpdate == null ? void 0 : setUpdate((v) => v + 1);
    }
    if (cnt) {
      await loadAns();
      jquery__WEBPACK_IMPORTED_MODULE_2___default()(".problem-content .typo").append(document.getElementsByClassName("nav__item--round").length ? `<input type="submit" disabled class="button rounded primary disabled" value="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.i18n)("Login to Submit")}" />` : `<input type="submit" class="button rounded primary" value="${(0,vj_utils__WEBPACK_IMPORTED_MODULE_10__.i18n)("Submit")}" />`);
      jquery__WEBPACK_IMPORTED_MODULE_2___default()(".objective-input[type!=checkbox]").on("input", (e) => {
        setAnswer(e.target.name, e.target.value);
        saveAns();
      });
      jquery__WEBPACK_IMPORTED_MODULE_2___default()("input.objective-input[type=checkbox]").on("input", (e) => {
        const current = Array.isArray(ans[e.target.name]) ? ans[e.target.name] : [];
        if (e.target.checked) {
          setAnswer(e.target.name, [.../* @__PURE__ */ new Set([...current, e.target.value])].sort((a, b) => a.charCodeAt(0) - b.charCodeAt(0)));
        } else {
          setAnswer(e.target.name, current.filter((v) => v !== e.target.value));
        }
        saveAns();
      });
      jquery__WEBPACK_IMPORTED_MODULE_2___default()('input[type="submit"]').on("click", (e) => {
        e.preventDefault();
        vj_utils__WEBPACK_IMPORTED_MODULE_10__.request.post(UiContext.postSubmitUrl, {
          lang: "_",
          code: js_yaml__WEBPACK_IMPORTED_MODULE_3__["default"].dump(ans)
        }).then((res) => {
          window.location.href = res.url;
        }).catch((err) => {
          vj_components_notification__WEBPACK_IMPORTED_MODULE_7__["default"].error(err.message);
        });
      });
    }
    if (!document.getElementById("problem-navigation")) {
      const ele = document.createElement("div");
      ele.id = "problem-navigation";
      jquery__WEBPACK_IMPORTED_MODULE_2___default()(".section--problem-sidebar ol.menu").prepend(ele);
      (0,react_dom_client__WEBPACK_IMPORTED_MODULE_5__.createRoot)(document.getElementById("problem-navigation")).render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ProblemNavigation, {}));
    }
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".non-scratchpad--hide").hide();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".scratchpad--hide").hide();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(".outer-loader-container").hide();
  }
  jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("click", '[name="problem-sidebar__open-scratchpad"]', (ev) => {
    enterScratchpadMode();
    ev.preventDefault();
  });
  jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("mouseenter focus touchstart", '[name="problem-sidebar__open-scratchpad"]', preloadScratchpadModules);
  jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("click", '[name="problem-sidebar__quit-scratchpad"]', (ev) => {
    leaveScratchpadMode();
    ev.preventDefault();
  });
  jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("click", "[data-lang]", (ev) => {
    ev.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set("lang", ev.currentTarget.dataset.lang);
    jquery__WEBPACK_IMPORTED_MODULE_2___default()("[data-lang]").removeClass("tab--active");
    vj_utils__WEBPACK_IMPORTED_MODULE_10__.pjax.request({ url: url.toString() });
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(ev.currentTarget).addClass("tab--active");
  });
  jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("click", '[name="show_tags"]', (ev) => {
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(ev.currentTarget).hide();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()("span.tags").css("display", "inline-block");
  });
  jquery__WEBPACK_IMPORTED_MODULE_2___default()('[name="problem-sidebar__download"]').on("click", handleClickDownloadProblem);
  jquery__WEBPACK_IMPORTED_MODULE_2___default()(window).on("resize", updateMistakePromptPosition);
  jquery__WEBPACK_IMPORTED_MODULE_2___default()("#scratchpad").on("vjScratchpadRelayout", updateMistakePromptPosition);
  if (((_b = UiContext.pdoc.config) == null ? void 0 : _b.type) === "objective") {
    loadObjective();
    jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("vjContentNew", loadObjective);
  } else if (new URL(window.location.href).searchParams.get("scratchpad") === "1") {
    enterScratchpadMode();
  }
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/problem_edit.page.jsx"
/*!*************************************!*\
  !*** ./pages/problem_edit.page.jsx ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_dropdown_Dropdown__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/dropdown/Dropdown */ "./components/dropdown/Dropdown.js");
/* harmony import */ var vj_components_editor_index__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/components/editor/index */ "./components/editor/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");










const categories = {};
const dirtyCategories = [];
const selections = [];
const tags = [];
function setDomSelected($dom, selected) {
  if (selected) $dom.addClass("selected");
  else $dom.removeClass("selected");
}
async function updateSelection() {
  for (const { type, category, subcategory } of dirtyCategories) {
    let item = categories[category];
    const isSelected = item.select || lodash__WEBPACK_IMPORTED_MODULE_2___default().some(item.children, (c) => c.select);
    setDomSelected(item.$tag, isSelected);
    if (isSelected) selections.push(category);
    else lodash__WEBPACK_IMPORTED_MODULE_2___default().pull(selections, category);
    if (type === "subcategory") {
      item = categories[category].children[subcategory];
      setDomSelected(item.$tag, item.select);
      const selectionName = subcategory;
      if (item.select) selections.push(selectionName);
      else lodash__WEBPACK_IMPORTED_MODULE_2___default().pull(selections, selectionName);
    }
  }
  const requestCategoryTags = lodash__WEBPACK_IMPORTED_MODULE_2___default().uniq(selections.filter((s) => s.includes(",")).map((s) => s.split(",")[0]));
  const requestTags = lodash__WEBPACK_IMPORTED_MODULE_2___default().uniq(lodash__WEBPACK_IMPORTED_MODULE_2___default().pullAll(selections, requestCategoryTags));
  dirtyCategories.length = 0;
  const $txt = jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="tag"]');
  $txt.val([...requestTags, ...tags].join(", "));
}
function findCategory(name) {
  const keys = Object.keys(categories);
  if (keys.includes(name)) return [name, null];
  for (const category of keys) {
    const subkeys = Object.keys(categories[category].children);
    if (subkeys.includes(name)) return [category, name];
  }
  return [null, null];
}
function parseCategorySelection() {
  const $txt = jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="tag"]');
  tags.length = 0;
  for (const name of $txt.val().split(",").map((i) => i.trim())) {
    if (!name) return;
    const [category, subcategory] = findCategory(name);
    if (!category) tags.push(name);
    else if (!subcategory) {
      categories[category].select = true;
      dirtyCategories.push({ type: "category", category });
    } else {
      categories[category].children[subcategory].select = true;
      dirtyCategories.push({ type: "subcategory", subcategory, category });
    }
  }
  updateSelection();
}
function buildCategoryFilter() {
  const $container = jquery__WEBPACK_IMPORTED_MODULE_1___default()("[data-widget-cf-container]");
  if (!$container) return;
  $container.attr("class", "widget--category-filter row small-up-3 medium-up-2");
  for (const category of $container.children("li").get()) {
    const $category = jquery__WEBPACK_IMPORTED_MODULE_1___default()(category).attr("class", "widget--category-filter__category column");
    const $categoryTag = $category.find(".section__title a").remove().attr("class", "widget--category-filter__tag");
    const categoryText = $categoryTag.text();
    const $drop = $category.children(".chip-list").remove().attr("class", "widget--category-filter__drop");
    const treeItem = {
      select: false,
      $tag: $categoryTag,
      children: {}
    };
    categories[categoryText] = treeItem;
    $category.empty().append($categoryTag);
    if ($drop.length > 0) {
      const $subCategoryTags = $drop.children("li").attr("class", "widget--category-filter__subcategory").find("a").attr("class", "widget--category-filter__tag").attr("data-category", categoryText);
      for (const subCategoryTag of $subCategoryTags.get()) {
        const $tag = jquery__WEBPACK_IMPORTED_MODULE_1___default()(subCategoryTag);
        treeItem.children[$tag.text()] = { select: false, $tag };
      }
      vj_components_dropdown_Dropdown__WEBPACK_IMPORTED_MODULE_5__["default"].getOrConstruct($categoryTag, {
        target: $drop[0],
        position: "left center"
      });
    }
  }
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", ".widget--category-filter__tag", (ev) => {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
    const tag = jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget).text();
    const category = jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget).attr("data-category");
    const treeItem = category ? categories[category].children[tag] : categories[tag];
    const shouldSelect = treeItem.$tag.hasClass("selected") ? false : !treeItem.select;
    treeItem.select = shouldSelect;
    dirtyCategories.push(category ? { type: "subcategory", subcategory: tag, category } : { type: "category", category: tag });
    if (!category && !shouldSelect) {
      lodash__WEBPACK_IMPORTED_MODULE_2___default().forEach(treeItem.children, (treeSubItem, subcategory) => {
        if (treeSubItem.select) {
          treeSubItem.select = false;
          dirtyCategories.push({ type: "subcategory", subcategory, category: tag });
        }
      });
    }
    updateSelection();
    ev.preventDefault();
  });
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_8__.NamedPage(["problem_create", "problem_edit"], () => {
  let confirmed = false;
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="operation"]', (ev) => {
    ev.preventDefault();
    if (confirmed) {
      return vj_utils__WEBPACK_IMPORTED_MODULE_9__.request.post(".", { operation: "delete" }).then((res) => {
        window.location.href = res.url;
      }).catch((e) => {
        vj_components_notification__WEBPACK_IMPORTED_MODULE_7__["default"].error(e.message);
      });
    }
    return (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_4__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Confirm deleting this problem? Its files, submissions, discussions and solutions will be deleted as well.")).then((yes) => {
      if (!yes) return;
      confirmed = true;
      ev.target.click();
    });
  });
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("change", '[name="tag"]', parseCategorySelection);
  buildCategoryFilter();
  parseCategorySelection();
  const $main = jquery__WEBPACK_IMPORTED_MODULE_1___default()("textarea[data-editor]");
  const $field = jquery__WEBPACK_IMPORTED_MODULE_1___default()("textarea[data-markdown-upload]");
  let content = $field.val();
  let isObject = false;
  let activeTab = jquery__WEBPACK_IMPORTED_MODULE_1___default()("[data-lang]").first().attr("data-lang");
  try {
    content = JSON.parse(content);
    isObject = !(content instanceof Array);
    if (!isObject) content = JSON.stringify(content);
  } catch (e) {
  }
  if (!isObject) content = { [activeTab]: content };
  function getContent(lang) {
    let c = "";
    if (content[lang]) c = content[lang];
    else {
      const list = Object.keys(content).filter((l) => l.startsWith(lang));
      if (list.length) c = content[list[0]];
    }
    if (typeof c !== "string") c = JSON.stringify(c);
    return c;
  }
  $main.val(getContent(activeTab));
  function onChange(val) {
    try {
      val = JSON.parse(val);
      if (!(val instanceof Array)) val = JSON.stringify(val);
    } catch {
    }
    const empty = /^\s*$/.test(val);
    if (empty) delete content[activeTab];
    else content[activeTab] = val;
    if (!Object.keys(content).length) $field.text("");
    else $field.text(JSON.stringify(content));
  }
  const editor = vj_components_editor_index__WEBPACK_IMPORTED_MODULE_6__["default"].getOrConstruct($main, { onChange });
  jquery__WEBPACK_IMPORTED_MODULE_1___default()("[data-lang]").on("click", (ev) => {
    jquery__WEBPACK_IMPORTED_MODULE_1___default()("[data-lang]").removeClass("tab--active");
    jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget).addClass("tab--active");
    const lang = jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget).attr("data-lang");
    activeTab = lang;
    const val = getContent(lang);
    editor.value(val);
  });
  jquery__WEBPACK_IMPORTED_MODULE_1___default()('[type="submit"]').on("click", (ev) => {
    if (!jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="title"]').val().toString().length) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_7__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Title is required."));
      jquery__WEBPACK_IMPORTED_MODULE_1___default()("body").scrollTop();
      jquery__WEBPACK_IMPORTED_MODULE_1___default()("html, body").animate(
        { scrollTop: 0 },
        300,
        () => jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="title"]').focus()
      );
      ev.preventDefault();
    }
  });
  if (localStorage.getItem("polyhedron-hint") === "dismiss") return;
  jquery__WEBPACK_IMPORTED_MODULE_1___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.tpl)`<div name="hint" class="typo"></div>`).prependTo(".medium-9.columns .section__body");
  const root = react_dom_client__WEBPACK_IMPORTED_MODULE_3__.createRoot(document.querySelector('[name="hint"]'));
  function ignore() {
    root.unmount();
    localStorage.setItem("polyhedron-hint", "dismiss");
  }
  root.render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("blockquote", { className: "note", children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("For better problem version management and validation, we suggest using Polyhedron to prepare problems.") }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Polyhedron supports managing problem version history, testing solutions, checking time limits, composing contest statements, cooperation and much more.") }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Problems created in polyhedron can be directly imported into any Hydro based online judge system.") }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("a", { href: "https://polyhedron.hydro.ac/", target: "_blank", children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Open Polyhedron") }),
    " / ",
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("a", { onClick: () => root.unmount(), children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Dismiss") }),
    " / ",
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("a", { onClick: ignore, children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Don't show again") })
  ] }));
}));


/***/ },

/***/ "./pages/problem_files.page.tsx"
/*!**************************************!*\
  !*** ./pages/problem_files.page.tsx ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _hydrooj_common__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @hydrooj/common */ "../common/status.ts");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_components_autocomplete_FileSelectAutoComplete__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/autocomplete/FileSelectAutoComplete */ "./components/autocomplete/FileSelectAutoComplete.tsx");
/* harmony import */ var vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/dialog/index */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_hint__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/hint */ "./components/hint.ts");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_components_preview_preview_page__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/components/preview/preview.page */ "./components/preview/preview.page.ts");
/* harmony import */ var vj_components_zipDownloader__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/components/zipDownloader */ "./components/zipDownloader/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");










function ensureAndGetSelectedFiles(type = "") {
  const allChecked = jquery__WEBPACK_IMPORTED_MODULE_1___default()(`.files tbody [data-checkbox-group="${type}"]:checked`);
  const files = allChecked.get().map((i) => jquery__WEBPACK_IMPORTED_MODULE_1___default()(i).closest("tr").attr("data-filename"));
  if (files.length === 0) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Please select at least one file to perform this operation."));
    return null;
  }
  return files;
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_8__.NamedPage("problem_files", () => {
  var _a, _b, _c, _d;
  async function handleClickDownloadSelected(ev) {
    const type = jquery__WEBPACK_IMPORTED_MODULE_1___default()(ev.currentTarget).closest("[data-type]").attr("data-type");
    const files = ensureAndGetSelectedFiles(type);
    if (files === null) return;
    const { links, pdoc } = await vj_utils__WEBPACK_IMPORTED_MODULE_9__.request.post("", { operation: "get_links", files, type });
    const targets = [];
    for (const filename of Object.keys(links)) targets.push({ filename, url: links[filename] });
    await (0,vj_components_zipDownloader__WEBPACK_IMPORTED_MODULE_7__["default"])(`${pdoc.docId} ${pdoc.title} ${type}.zip`, targets);
  }
  async function handleGenerateTestdata(ev) {
    ev.preventDefault();
    const gen = jquery__WEBPACK_IMPORTED_MODULE_1___default()("[name=gen]").val();
    const std = jquery__WEBPACK_IMPORTED_MODULE_1___default()("[name=std]").val();
    if (!gen) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Please input the generator."));
      return;
    }
    if (!std) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Please input the standard program."));
      return;
    }
    try {
      const res = await vj_utils__WEBPACK_IMPORTED_MODULE_9__.request.post("", {
        operation: "generate_testdata",
        gen,
        std
      });
      if (res.error) vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error(res.error);
      else {
        vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.i18n)("Generating..."));
        const dialog = new vj_components_dialog_index__WEBPACK_IMPORTED_MODULE_3__.InfoDialog({
          $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_9__.tpl)`
            <div class="typo">
              <iframe src="${res.url}"
                scrolling="yes" border="0" frameborder="no" framespacing="0" width="100%" style="height: 70vh;"></iframe>
            </div>`,
          width: `${window.innerWidth - 200}px`,
          height: `${window.innerHeight - 100}px`
        });
        const callback = (data) => {
          if (data.data.status === _hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.STATUS.STATUS_ACCEPTED) {
            dialog.close();
            vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].success("Testdata generated successfully.");
          }
        };
        window.addEventListener("message", callback, false);
        await dialog.open();
        window.removeEventListener("message", callback, false);
        await vj_utils__WEBPACK_IMPORTED_MODULE_9__.pjax.request({ push: false });
      }
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_5__["default"].error([error.message, ...error.params].join(" "));
    }
  }
  if (UiContext.pdoc && jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="generate_testdata"]').length) {
    vj_components_autocomplete_FileSelectAutoComplete__WEBPACK_IMPORTED_MODULE_2__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_1___default()("[name=gen]"), { data: UiContext.pdoc.data });
    vj_components_autocomplete_FileSelectAutoComplete__WEBPACK_IMPORTED_MODULE_2__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_1___default()("[name=std]"), { data: UiContext.pdoc.data });
    jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="generate_testdata"]').on("click", handleGenerateTestdata);
  }
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="create_testdata"]', () => (0,vj_components_preview_preview_page__WEBPACK_IMPORTED_MODULE_6__.previewFile)(void 0, "testdata"));
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="create_file"]', () => (0,vj_components_preview_preview_page__WEBPACK_IMPORTED_MODULE_6__.previewFile)(void 0, "additional_file"));
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="download_selected"]', (ev) => handleClickDownloadSelected(ev));
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("vjContentNew", (e) => {
    var _a2, _b2, _c2, _d2;
    (0,vj_components_hint__WEBPACK_IMPORTED_MODULE_4__["default"])("Hint::icon::testdata", (_d2 = (_c2 = (_b2 = (_a2 = jquery__WEBPACK_IMPORTED_MODULE_1___default()(e.target).find('[name="create_testdata"]').get(0)) == null ? void 0 : _a2.parentNode) == null ? void 0 : _b2.parentNode) == null ? void 0 : _c2.children) == null ? void 0 : _d2[0]);
  });
  (0,vj_components_hint__WEBPACK_IMPORTED_MODULE_4__["default"])("Hint::icon::testdata", (_d = (_c = (_b = (_a = jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).find('[name="create_testdata"]').get(0)) == null ? void 0 : _a.parentNode) == null ? void 0 : _b.parentNode) == null ? void 0 : _c.children) == null ? void 0 : _d[0]);
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/problem_main.page.tsx"
/*!*************************************!*\
  !*** ./pages/problem_main.page.tsx ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_utils_lib_search__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/utils/lib/search */ "../../framework/utils/lib/search.ts");
/* harmony import */ var clipboard__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! clipboard */ "../../node_modules/clipboard/dist/clipboard.js");
/* harmony import */ var clipboard__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(clipboard__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_autocomplete_components_ProblemSelectAutoComplete__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/components/autocomplete/components/ProblemSelectAutoComplete */ "./components/autocomplete/components/ProblemSelectAutoComplete.tsx");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_dropdown_Dropdown__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! vj/components/dropdown/Dropdown */ "./components/dropdown/Dropdown.js");
/* harmony import */ var vj_components_hint__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! vj/components/hint */ "./components/hint.ts");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_components_zipDownloader__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! vj/components/zipDownloader */ "./components/zipDownloader/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");















const keywords = ["category", "difficulty", "namespace"];
const list = [];
const filterTags = {};
const pinned = Object.fromEntries(keywords.map((keyword) => [keyword, []]));
const selections = Object.fromEntries(keywords.map((keyword) => [keyword, {}]));
const selectedTags = Object.fromEntries(keywords.map((keyword) => [keyword, []]));
let selectedPids = [];
let clearSelectionHandler = null;
function setDomSelected($dom, selected, icon) {
  if (selected) {
    $dom.addClass("selected");
    if (icon) $dom.append(icon);
  } else {
    $dom.removeClass("selected");
    if (icon) $dom.find("span").remove();
  }
}
const parserOptions = {
  keywords,
  offsets: true,
  alwaysArray: true,
  tokenize: true
};
function writeSelectionToInput() {
  const currentValue = jquery__WEBPACK_IMPORTED_MODULE_3___default()('[name="q"]').val();
  const parsedCurrentValue = _hydrooj_utils_lib_search__WEBPACK_IMPORTED_MODULE_1__["default"].parse(currentValue, parserOptions);
  const q = _hydrooj_utils_lib_search__WEBPACK_IMPORTED_MODULE_1__["default"].stringify({
    ...parsedCurrentValue,
    ...keywords.reduce((acc, keyword) => ({ ...acc, [keyword]: selectedTags[keyword] }), {}),
    text: parsedCurrentValue.text
  }, parserOptions);
  jquery__WEBPACK_IMPORTED_MODULE_3___default()('[name="q"]').val(q);
}
function updateSelection() {
  selectedTags.category = lodash__WEBPACK_IMPORTED_MODULE_4___default().uniq(selectedTags.category);
  for (const type in selections) {
    for (const selection in selections[type]) {
      const item = selections[type][selection];
      const shouldSelect = selectedTags[type].includes(selection);
      const isSelected = (item.$tag || item.$legacy).hasClass("selected");
      let childSelected = false;
      for (const subcategory in item.children) {
        const childShouldSelect = selectedTags[type].includes(subcategory);
        const childIsSelected = item.children[subcategory].$tag.hasClass("selected");
        childSelected || (childSelected = childShouldSelect);
        if (childIsSelected !== childShouldSelect) setDomSelected(item.children[subcategory].$tag, childShouldSelect);
      }
      if (item.$legacy) setDomSelected(item.$legacy, shouldSelect || childSelected);
      if (isSelected !== shouldSelect) {
        if (pinned[type].includes(selection)) {
          setDomSelected(item.$tag, shouldSelect, '<span class="icon icon-check"></span>');
        } else {
          if (item.$tag) setDomSelected(item.$tag, shouldSelect, '<span class="icon icon-close"></span>');
          for (const $element of item.$phantom) {
            if (shouldSelect) jquery__WEBPACK_IMPORTED_MODULE_3___default()($element).removeClass("hide");
            else jquery__WEBPACK_IMPORTED_MODULE_3___default()($element).addClass("hide");
          }
        }
      }
    }
  }
}
function loadQuery() {
  const q = jquery__WEBPACK_IMPORTED_MODULE_3___default()('[name="q"]').val().toString();
  const sort = jquery__WEBPACK_IMPORTED_MODULE_3___default()('[name="sort"]').val().toString();
  const url = new URL(window.location.href);
  if (!q) url.searchParams.delete("q");
  else url.searchParams.set("q", q);
  if (sort && sort !== "default") url.searchParams.set("sort", sort);
  else url.searchParams.delete("sort");
  url.searchParams.delete("page");
  vj_utils__WEBPACK_IMPORTED_MODULE_14__.pjax.request({ url: url.toString() });
}
function handleTagSelected(ev) {
  if (ev.shiftKey || ev.metaKey || ev.ctrlKey) return;
  let [type, selection] = ["category", jquery__WEBPACK_IMPORTED_MODULE_3___default()(ev.currentTarget).text()];
  if (jquery__WEBPACK_IMPORTED_MODULE_3___default()(ev.currentTarget).attr("data-selection")) [type, selection] = jquery__WEBPACK_IMPORTED_MODULE_3___default()(ev.currentTarget).attr("data-selection").split(":");
  const category = jquery__WEBPACK_IMPORTED_MODULE_3___default()(ev.currentTarget).attr("data-category");
  const filterType = jquery__WEBPACK_IMPORTED_MODULE_3___default()(ev.currentTarget).attr("data-filter");
  const treeItem = category ? selections[type][category].children[selection] : selections[type][selection];
  const shouldSelect = !(treeItem.$tag || treeItem.$legacy).hasClass("selected");
  if (shouldSelect) {
    if (filterType) selectedTags[type] = lodash__WEBPACK_IMPORTED_MODULE_4___default().without(selectedTags[type], ...filterTags[filterType]);
    selectedTags[type].push(selection);
  } else selectedTags[type] = lodash__WEBPACK_IMPORTED_MODULE_4___default().without(selectedTags[type], selection, ...category ? [] : Object.keys(treeItem.children));
  updateSelection();
  writeSelectionToInput();
  loadQuery();
  ev.preventDefault();
}
function buildLegacyCategoryFilter() {
  const $container = jquery__WEBPACK_IMPORTED_MODULE_3___default()("[data-widget-cf-container]");
  if (!$container) return;
  $container.attr("class", "widget--category-filter row small-up-3 medium-up-2");
  for (const category of $container.children("li").get()) {
    const $category = jquery__WEBPACK_IMPORTED_MODULE_3___default()(category).attr("class", "widget--category-filter__category column");
    const $categoryTag = $category.find(".section__title a").remove().attr("class", "widget--category-filter__tag");
    const categoryText = $categoryTag.text();
    const $drop = $category.children(".chip-list").remove().attr("class", "widget--category-filter__drop");
    if (selections.category[categoryText]) {
      selections.category[categoryText].$legacy = $categoryTag;
    } else {
      selections.category[categoryText] = {
        $legacy: $categoryTag,
        $tag: null,
        children: {},
        $phantom: []
      };
    }
    $category.empty().append($categoryTag);
    if ($drop.length > 0) {
      $categoryTag.text(`${$categoryTag.text()}`);
      const $subCategoryTags = $drop.children("li").attr("class", "widget--category-filter__subcategory").find("a").attr("class", "widget--category-filter__tag").attr("data-category", categoryText);
      for (const subCategoryTag of $subCategoryTags.get()) {
        const $tag = jquery__WEBPACK_IMPORTED_MODULE_3___default()(subCategoryTag);
        selections.category[categoryText].children[$tag.text()] = {
          $tag
        };
      }
      vj_components_dropdown_Dropdown__WEBPACK_IMPORTED_MODULE_9__["default"].getOrConstruct($categoryTag, {
        target: $drop[0],
        position: "left center"
      });
    }
  }
  list.push(...Object.keys(selections.category));
  list.push(...lodash__WEBPACK_IMPORTED_MODULE_4___default().flatMap(Object.values(selections.category), (c) => Object.keys(c.children)));
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", ".widget--category-filter__tag", (ev) => handleTagSelected(ev));
}
function parseCategorySelection() {
  const parsed = _hydrooj_utils_lib_search__WEBPACK_IMPORTED_MODULE_1__["default"].parse(jquery__WEBPACK_IMPORTED_MODULE_3___default()('[name="q"]').val() || "", parserOptions);
  selectedTags.category = lodash__WEBPACK_IMPORTED_MODULE_4___default().uniq(parsed.category || []);
  selectedTags.difficulty = lodash__WEBPACK_IMPORTED_MODULE_4___default().uniq(parsed.difficulty || []);
}
function ensureAndGetSelectedPids() {
  if (selectedPids.length === 0) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_11__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Please select at least one problem to perform this operation."));
    return null;
  }
  return selectedPids;
}
async function handleOperation(operation) {
  const pids = ensureAndGetSelectedPids();
  if (pids === null) return;
  const payload = {};
  if (operation === "delete") {
    if (!await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_8__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Confirm to delete the selected problems?"))) return;
  } else if (operation === "copy") {
    const res = await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_8__.prompt)((0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Copy Problems"), {
      target: {
        type: "domain",
        label: (0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Target"),
        required: true,
        autofocus: true
      },
      hidden: {
        type: "checkbox",
        label: (0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Hidden")
      }
    });
    if (!res) return;
    payload.target = res.target;
    payload.hidden = res.hidden;
  }
  try {
    await vj_utils__WEBPACK_IMPORTED_MODULE_14__.request.post("", { operation, pids, ...payload });
    vj_components_notification__WEBPACK_IMPORTED_MODULE_11__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)(`Selected problems have been ${operation === "copy" ? "copie" : operation}d.`));
    await (0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.delay)(2e3);
    clearSelectionHandler == null ? void 0 : clearSelectionHandler();
    loadQuery();
  } catch (error) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_11__["default"].error(error.message);
  }
}
function hideTags(target) {
  for (const i of jquery__WEBPACK_IMPORTED_MODULE_3___default()(target).find(".problem__tag").get()) {
    if (list.includes(i.children[0].innerHTML)) jquery__WEBPACK_IMPORTED_MODULE_3___default()(i).addClass("notag--hide");
  }
}
const categoryDialog = new vj_components_dialog__WEBPACK_IMPORTED_MODULE_8__.Dialog({
  $body: jquery__WEBPACK_IMPORTED_MODULE_3___default()(".dialog--category-filter > div"),
  cancelByClickingBack: true,
  cancelByEsc: true
});
categoryDialog.clear = function() {
  const $dataCategoryContainer = this.$dom.find("[data-category-container]");
  $dataCategoryContainer.children().addClass("hide");
  const first = $dataCategoryContainer.children().first();
  setDomSelected(first, true);
  this.$dom.find("[data-subcategory-container]").addClass("hide");
  this.$dom.find(`[data-subcategory-container="${first.attr("data-category")}"]`).removeClass("hide");
  return this;
};
function buildSearchContainer() {
  jquery__WEBPACK_IMPORTED_MODULE_3___default()("[data-pinned-container] [data-selection]").each((_index, _element) => {
    const [type, selection] = jquery__WEBPACK_IMPORTED_MODULE_3___default()(_element).attr("data-selection").split(":");
    const filterType = jquery__WEBPACK_IMPORTED_MODULE_3___default()(_element).attr("data-filter");
    pinned[type].push(selection);
    if (filterType) {
      filterTags[filterType] || (filterTags[filterType] = []);
      filterTags[filterType].push(selection);
    }
    selections[type][selection] = {
      $tag: jquery__WEBPACK_IMPORTED_MODULE_3___default()(_element),
      children: {}
    };
  });
  categoryDialog.$dom.find(".subcategory__all .search-tag__item").each((_index, _element) => {
    const [, subcategory] = jquery__WEBPACK_IMPORTED_MODULE_3___default()(_element).attr("data-selection").split(":");
    selections.category[subcategory] = {
      $tag: jquery__WEBPACK_IMPORTED_MODULE_3___default()(_element),
      children: {},
      $phantom: [
        ...categoryDialog.$dom.find(`.subcategory__selected .search-tag__item[data-selection="category:${subcategory}"]`).get(),
        ...jquery__WEBPACK_IMPORTED_MODULE_3___default()(`.subcategory-container__selected .search-tag__item[data-selection="category:${subcategory}"]`).get()
      ]
    };
  });
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", "[data-category-container] [data-category]", (ev) => {
    jquery__WEBPACK_IMPORTED_MODULE_3___default()("[data-category-container] [data-category]").removeClass("selected");
    jquery__WEBPACK_IMPORTED_MODULE_3___default()(ev.currentTarget).addClass("selected");
    jquery__WEBPACK_IMPORTED_MODULE_3___default()("[data-subcategory-container]").addClass("hide");
    jquery__WEBPACK_IMPORTED_MODULE_3___default()(`[data-subcategory-container="${jquery__WEBPACK_IMPORTED_MODULE_3___default()(ev.currentTarget).attr("data-category")}"]`).removeClass("hide");
  });
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", ".search-tag__item", (ev) => handleTagSelected(ev));
}
async function handleDownload(ev) {
  var _a;
  let name = "Export";
  if (ev.shiftKey) name = (_a = await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_8__.prompt)((0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Filename"), { name: { type: "text", default: name } })) == null ? void 0 : _a.name;
  if (!name) return;
  const pids = ensureAndGetSelectedPids();
  if (pids) await (0,vj_components_zipDownloader__WEBPACK_IMPORTED_MODULE_12__.downloadProblemSet)(pids, name);
}
function processElement(ele) {
  hideTags(ele);
  (0,vj_components_hint__WEBPACK_IMPORTED_MODULE_10__["default"])("Hint::icon::difficulty", jquery__WEBPACK_IMPORTED_MODULE_3___default()(ele).find("th.col--difficulty"));
}
function getAllPids() {
  return jquery__WEBPACK_IMPORTED_MODULE_3___default()('[data-checkbox-group="problem"]').map((_index, i) => jquery__WEBPACK_IMPORTED_MODULE_3___default()(i).closest("tr").attr("data-pid")).get();
}
function getSelectedPids() {
  return jquery__WEBPACK_IMPORTED_MODULE_3___default()('[data-checkbox-group="problem"]:checked').map((_index, i) => jquery__WEBPACK_IMPORTED_MODULE_3___default()(i).closest("tr").attr("data-pid")).get();
}
function ProblemSelectionDisplay(props) {
  const [pids, setPids] = react__WEBPACK_IMPORTED_MODULE_5___default().useState([]);
  const [dialogOpen, setDialogOpen] = react__WEBPACK_IMPORTED_MODULE_5___default().useState(false);
  const [copyIdRef, setCopyIdRef] = react__WEBPACK_IMPORTED_MODULE_5___default().useState(null);
  const [copyPidRef, setCopyPidRef] = react__WEBPACK_IMPORTED_MODULE_5___default().useState(null);
  const problemSelectAutoCompleteRef = react__WEBPACK_IMPORTED_MODULE_5___default().useRef(null);
  react__WEBPACK_IMPORTED_MODULE_5___default().useEffect(() => {
    var _a;
    (_a = props.onClear) == null ? void 0 : _a.call(props, () => {
      setPids([]);
    });
  }, [props.onClear]);
  react__WEBPACK_IMPORTED_MODULE_5___default().useEffect(() => {
    const cb = () => queueMicrotask(() => {
      const all = getAllPids();
      const selected = getSelectedPids();
      setPids((o) => {
        const ret = o.filter((i) => !all.includes(i) || selected.includes(i));
        for (const val of selected) if (!ret.includes(val)) ret.push(val);
        return ret;
      });
    });
    jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", '[data-checkbox-group="problem"]', cb);
    jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", '[data-checkbox-toggle="problem"]', cb);
    return () => {
      jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).off("click", '[data-checkbox-group="problem"]', cb);
      jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).off("click", '[data-checkbox-toggle="problem"]', cb);
    };
  }, []);
  react__WEBPACK_IMPORTED_MODULE_5___default().useEffect(() => {
    window.__getPids = () => pids;
    window.__setPids = (newIds) => setPids(newIds);
  }, [pids]);
  react__WEBPACK_IMPORTED_MODULE_5___default().useEffect(() => {
    if (!copyIdRef) return;
    const clip = new (clipboard__WEBPACK_IMPORTED_MODULE_2___default())(copyIdRef, {
      text: () => problemSelectAutoCompleteRef.current.getSelectedItems().map((i) => i.docId).join(",")
    });
    clip.on("success", () => {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_11__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Problem ids copied to clipboard!"));
    });
    clip.on("error", () => {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_11__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Copy failed :("));
    });
  }, [copyIdRef]);
  react__WEBPACK_IMPORTED_MODULE_5___default().useEffect(() => {
    if (!copyPidRef) return;
    const clip = new (clipboard__WEBPACK_IMPORTED_MODULE_2___default())(copyPidRef, {
      text: () => problemSelectAutoCompleteRef.current.getSelectedItems().map((i) => i.pid || i.docId).join(",")
    });
    clip.on("success", () => {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_11__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Problem ids copied to clipboard!"));
    });
    clip.on("error", () => {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_11__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Copy failed :("));
    });
  }, [copyPidRef]);
  const updateCheckboxSelection = react__WEBPACK_IMPORTED_MODULE_5___default().useCallback(() => {
    var _a;
    for (const i of jquery__WEBPACK_IMPORTED_MODULE_3___default()('[data-checkbox-group="problem"]:checked')) {
      if (!pids.includes(i.closest("tr").dataset.pid)) {
        jquery__WEBPACK_IMPORTED_MODULE_3___default()(i).prop("checked", false);
      }
    }
    for (const i of pids) {
      (_a = jquery__WEBPACK_IMPORTED_MODULE_3___default()(`[data-pid="${i}"]`).find('[data-checkbox-group="problem"]')) == null ? void 0 : _a.prop("checked", true);
    }
  }, [pids]);
  react__WEBPACK_IMPORTED_MODULE_5___default().useEffect(() => {
    updateCheckboxSelection();
    props.onChange(pids);
    jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("vjContentNew", updateCheckboxSelection);
    return () => {
      jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).off("vjContentNew", updateCheckboxSelection);
    };
  }, [pids]);
  return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("a", { className: "menu__link display-mode-hide", onClick: () => setDialogOpen(true), children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "icon icon-stack" }),
      " ",
      (0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("{0} problem(s) selected", pids.length)
    ] }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "dialog withBg", style: { display: dialogOpen ? "flex" : "none", zIndex: 1e3, opacity: 1 }, onClick: () => setDialogOpen(false), children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "dialog__content", style: { transform: "scale(1, 1)" }, onClick: (ev) => ev.stopPropagation(), children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "dialog__body", style: { height: "calc(100% - 45px)" }, children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "columns", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h1", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Select Problems") }) }) }),
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "columns", children: [
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
            vj_components_autocomplete_components_ProblemSelectAutoComplete__WEBPACK_IMPORTED_MODULE_7__["default"],
            {
              multi: true,
              ref: problemSelectAutoCompleteRef,
              onChange: (v) => setPids(v.split(",").filter((i) => i.trim())),
              selectedKeys: pids
            }
          ),
          /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("style", { children: ".autocomplete-wrapper { max-height: 50vh; }" })
        ] }) })
      ] }),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "row", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "columns clearfix", children: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "float-right dialog__action", children: [
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("button", { className: "rounded button", ref: setCopyIdRef, children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Copy IDs") }),
        " ",
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("button", { className: "rounded button", ref: setCopyPidRef, children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Copy pids") }),
        " ",
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("button", { className: "rounded button", onClick: () => setPids([]), children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Clear") }),
        " ",
        /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("button", { className: "primary rounded button", onClick: () => setDialogOpen(false), children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.i18n)("Ok") })
      ] }) }) })
    ] }) })
  ] });
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_13__.NamedPage(["problem_main"], () => {
  const $body = jquery__WEBPACK_IMPORTED_MODULE_3___default()("body");
  $body.addClass("display-mode");
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(".section.display-mode").removeClass("display-mode");
  buildSearchContainer();
  buildLegacyCategoryFilter();
  parseCategorySelection();
  updateSelection();
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", '[name="leave-edit-mode"]', () => {
    $body.removeClass("edit-mode").addClass("display-mode");
  });
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", '[name="enter-edit-mode"]', () => {
    $body.removeClass("display-mode").addClass("edit-mode");
  });
  for (const op of ["delete", "hide", "unhide", "copy"]) {
    jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", `[name="${op}_selected_problems"]`, () => handleOperation(op));
  }
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", '[name="download_selected_problems"]', handleDownload);
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", ".toggle-tag", () => {
    jquery__WEBPACK_IMPORTED_MODULE_3___default()(".section__table-header, .section__table-container > .data-table").toggleClass("hide-problem-tag");
  });
  function inputChanged() {
    parseCategorySelection();
    updateSelection();
    loadQuery();
  }
  jquery__WEBPACK_IMPORTED_MODULE_3___default()("#search").on("click", (ev) => {
    ev.preventDefault();
    inputChanged();
  });
  jquery__WEBPACK_IMPORTED_MODULE_3___default()("#searchForm").on("submit", inputChanged);
  jquery__WEBPACK_IMPORTED_MODULE_3___default()("#searchForm").find("input").on("input", lodash__WEBPACK_IMPORTED_MODULE_4___default().debounce(inputChanged, 500));
  jquery__WEBPACK_IMPORTED_MODULE_3___default()("#searchForm").find('select[name="sort"]').on("change", inputChanged);
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(".dialog-button").on("click", (ev) => {
    categoryDialog.clear().open();
    ev.preventDefault();
  });
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("click", "a.pager__item", (ev) => {
    ev.preventDefault();
    vj_utils__WEBPACK_IMPORTED_MODULE_14__.pjax.request(ev.currentTarget.getAttribute("href")).then(() => window.scrollTo(0, 0));
  });
  jquery__WEBPACK_IMPORTED_MODULE_3___default()(document).on("vjContentNew", (e) => processElement(e.target));
  processElement(document);
  const selection = document.getElementById("problem_selection");
  if (selection) {
    react_dom_client__WEBPACK_IMPORTED_MODULE_6__.createRoot(selection).render(
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        ProblemSelectionDisplay,
        {
          onChange: (pids) => {
            selectedPids = pids;
          },
          onClear: (handler) => {
            clearSelectionHandler = handler;
          }
        }
      )
    );
  }
  (0,vj_utils__WEBPACK_IMPORTED_MODULE_14__.addSpeculationRules)({
    prerender: [{
      where: {
        or: [
          { href_matches: "/p/*" },
          { href_matches: "/d/*/p/*" }
        ]
      }
    }]
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/problem_sidebar.page.ts"
/*!***************************************!*\
  !*** ./pages/problem_sidebar.page.ts ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");





const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_3__.NamedPage([
  "problem_create",
  "problem_edit",
  "problem_solution",
  "problem_submit",
  "problem_config",
  "problem_statistics",
  "problem_files",
  "problem_detail",
  "discussion_node",
  "discussion_detail"
], () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="problem-sidebar__show-category"]', (ev) => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).hide();
    jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="problem-sidebar__categories"]').show();
  });
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="problem-sidebar__rejudge"]', (ev) => {
    ev.preventDefault();
    (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.i18n)("Confirm rejudge this problem?")).then((yes) => {
      if (yes) jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).closest("form").trigger("submit");
    });
  });
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="problem-sidebar__copy"]', async () => {
    const res = await (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.prompt)((0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.i18n)("Copy Problem"), {
      target: {
        type: "domain",
        label: (0,vj_utils__WEBPACK_IMPORTED_MODULE_4__.i18n)("Target"),
        required: true,
        autofocus: true
      }
    });
    if (!(res == null ? void 0 : res.target)) return;
    try {
      const { url } = await vj_utils__WEBPACK_IMPORTED_MODULE_4__.request.post(".", {
        operation: "copy",
        pids: [UiContext.problemNumId],
        target: res.target,
        redirect: true
      });
      window.location.href = url;
    } catch (error) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_2__["default"].error(error.message);
    }
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/problem_statistics.page.ts"
/*!******************************************!*\
  !*** ./pages/problem_statistics.page.ts ***!
  \******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _hydrooj_common__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @hydrooj/common */ "../common/status.ts");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage("problem_statistics", () => {
  async function initChart() {
    var _a;
    if (!Object.keys(UiContext.pdoc.stats || {}).length) {
      jquery__WEBPACK_IMPORTED_MODULE_1___default()("#submission-status-placeholder").parent().hide();
      return;
    }
    const echarts = await Promise.all(/*! import() */[__webpack_require__.e("n.echarts"), __webpack_require__.e("n.zrender"), __webpack_require__.e("vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76")]).then(__webpack_require__.bind(__webpack_require__, /*! echarts */ "../../node_modules/echarts/index.js"));
    const $status = document.getElementById("submission-status-placeholder");
    const statusChart = echarts.init($status);
    statusChart.setOption({
      tooltip: { trigger: "item" },
      series: [
        {
          name: "Submissions",
          type: "pie",
          radius: "70%",
          label: { show: false },
          labelLine: { show: false },
          data: [
            { value: UiContext.pdoc.stats.TLE, name: "TLE" },
            { value: UiContext.pdoc.stats.AC, name: "AC" },
            { value: UiContext.pdoc.stats.MLE, name: "MLE" },
            { value: UiContext.pdoc.stats.WA, name: "WA" },
            { value: UiContext.pdoc.stats.RE, name: "RE" },
            { value: UiContext.pdoc.stats.CE, name: "CE" }
          ]
        }
      ]
    });
    const $score = document.getElementById("submission-score-placeholder");
    const x = Array.from({ length: 101 }, (v, i) => i).filter((i) => UiContext.pdoc.stats[`s${i}`]);
    const scoreChart = echarts.init($score);
    scoreChart.setOption({
      tooltip: { trigger: "item" },
      xAxis: { data: x },
      yAxis: {},
      series: [{
        data: x.map((i) => ({
          value: UiContext.pdoc.stats[`s${i}`],
          itemStyle: { color: (0,_hydrooj_common__WEBPACK_IMPORTED_MODULE_0__.getScoreColor)(i) }
        })),
        type: "bar"
      }]
    });
    window.onresize = function() {
      statusChart.resize();
      scoreChart.resize();
    };
    if (((_a = UiContext.pdoc.config) == null ? void 0 : _a.type) === "objective") jquery__WEBPACK_IMPORTED_MODULE_1___default()($status).hide();
  }
  const availableLangs = (0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.getAvailableLangs)(UiContext.pdoc.config.langs);
  Object.keys(availableLangs).map(
    (i) => jquery__WEBPACK_IMPORTED_MODULE_1___default()('select[name="lang"]').append((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.tpl)`<option value="${i}" key="${i}">${availableLangs[i].display}</option>`)
  );
  const lang = new URL(window.location.href).searchParams.get("lang");
  if (lang) jquery__WEBPACK_IMPORTED_MODULE_1___default()('select[name="lang"]').val(lang);
  initChart();
  jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="filter-form"] select').on("change", () => {
    jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="filter-form"]').trigger("submit");
  });
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/problem_submit.page.tsx"
/*!***************************************!*\
  !*** ./pages/problem_submit.page.tsx ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var vj_components_languageselect__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/languageselect */ "./components/languageselect.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");






const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.NamedPage(["problem_submit", "contest_detail_problem_submit", "homework_detail_problem_submit"], async () => {
  var _a;
  const { config } = UiContext.pdoc;
  if (config.type === "submit_answer") {
    jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="lang"]').val("_");
    return;
  }
  const availableLangs = (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.getAvailableLangs)(config.langs);
  const mainLangs = {};
  const preferences = [UiContext.codeLang || UserContext.codeLang || ""];
  for (const key in availableLangs) {
    if (config.langs && !config.langs.filter((i) => i === key || i.startsWith(`${key}.`)).length) continue;
    if (window.LANGS[key].pretest === preferences[0]) preferences.push(key);
    if (!key.includes(".")) mainLangs[key] = window.LANGS[key].display;
    else {
      const a = key.split(".")[0];
      mainLangs[a] = window.LANGS[a].display;
    }
  }
  for (const key in availableLangs) {
    if (config.langs && !config.langs.filter((i) => i === key || i.startsWith(`${key}.`)).length) continue;
    if (typeof ((_a = window.LANGS[key]) == null ? void 0 : _a.pretest) === "string" && window.LANGS[key].pretest.split(".")[0] === preferences[0].split(".")[0]) {
      preferences.push(key);
    }
  }
  (0,vj_components_languageselect__WEBPACK_IMPORTED_MODULE_3__.renderLanguageSelect)(
    document.getElementById("codelang-selector"),
    '[name="lang"]',
    availableLangs,
    mainLangs,
    preferences
  );
  if (localStorage.getItem("submit-hint") === "dismiss") return;
  jquery__WEBPACK_IMPORTED_MODULE_1___default()((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`<div name="hint" class="typo"></div>`).prependTo('[name="submit_section"]');
  const root = react_dom_client__WEBPACK_IMPORTED_MODULE_2__.createRoot(document.querySelector('[name="hint"]'));
  function ignore() {
    root.unmount();
    localStorage.setItem("submit-hint", "dismiss");
  }
  root.render(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("blockquote", { className: "note", children: [
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("This page is only for pasting code from other sources.") }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("To get a better editing experience, with code highlighting and test runs, please go back to the problem detail page and use 'Open Scratchpad' button.") }),
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("a", { onClick: () => root.unmount(), children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Dismiss") }),
    " / ",
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("a", { onClick: ignore, children: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Don't show again") })
  ] }));
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/record_detail.page.tsx"
/*!**************************************!*\
  !*** ./pages/record_detail.page.tsx ***!
  \**************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @hydrooj/common */ "../common/status.ts");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var _components_badge_ac_effect__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../components/badge_ac_effect */ "./components/badge_ac_effect.ts");







/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.NamedPage("record_detail", async () => {
  const badgeThemeEffect = UiContext.badgeAcEffect && UiContext.badgeAcFirstEligible !== false ? (0,_components_badge_ac_effect__WEBPACK_IMPORTED_MODULE_6__.createBadgeAcThemePlayer)(UiContext.badgeAcTheme) : null;
  let badgeEffectPlayed = false;
  const maybePlayBadgeEffect = (status) => {
    if (badgeEffectPlayed || Number(status) !== _hydrooj_common__WEBPACK_IMPORTED_MODULE_1__.STATUS.STATUS_ACCEPTED) return;
    badgeEffectPlayed = true;
    void (badgeThemeEffect == null ? void 0 : badgeThemeEffect.play());
  };
  jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("click", ".compiler-text", () => {
    (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.withTransitionCallback)(() => {
      jquery__WEBPACK_IMPORTED_MODULE_2___default()(".collapsed").removeClass("collapsed");
    });
  });
  jquery__WEBPACK_IMPORTED_MODULE_2___default()(document).on("click", ".subtask-case", function() {
    const text = jquery__WEBPACK_IMPORTED_MODULE_2___default()(this).find(".message").text();
    const data = jquery__WEBPACK_IMPORTED_MODULE_2___default()(this).find(".message").html();
    if (!(text == null ? void 0 : text.trim()) || !text.includes("\n") && text.length < 20) return;
    new vj_components_dialog__WEBPACK_IMPORTED_MODULE_3__.InfoDialog({
      $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)(/* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("pre", { dangerouslySetInnerHTML: { __html: data } }))
    }).open();
  });
  if (!UiContext.socketUrl) {
    maybePlayBadgeEffect(UiContext.recordStatus);
    return;
  }
  const [{ default: WebSocket }, { DiffDOM }] = await Promise.all([
    Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! ../components/socket */ "./components/socket/index.ts")),
    __webpack_require__.e(/*! import() */ "n.timeago.js").then(__webpack_require__.bind(__webpack_require__, /*! diff-dom */ "../../node_modules/diff-dom/dist/module.js"))
  ]);
  const sock = new WebSocket(UiContext.ws_prefix + UiContext.socketUrl, false, true);
  const dd = new DiffDOM();
  sock.onmessage = (_, data) => {
    const msg = JSON.parse(data);
    maybePlayBadgeEffect(msg.status);
    if (typeof msg.status === "number" && window.parent) window.parent.postMessage({ status: msg.status });
    (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.withTransitionCallback)(() => {
      const newStatus = jquery__WEBPACK_IMPORTED_MODULE_2___default()(msg.status_html);
      const oldStatus = jquery__WEBPACK_IMPORTED_MODULE_2___default()("#status");
      oldStatus.trigger("vjContentRemove");
      dd.apply(oldStatus[0], dd.diff(oldStatus[0], newStatus[0]));
      jquery__WEBPACK_IMPORTED_MODULE_2___default()("#status").trigger("vjContentNew");
      const newSummary = jquery__WEBPACK_IMPORTED_MODULE_2___default()(msg.summary_html);
      const oldSummary = jquery__WEBPACK_IMPORTED_MODULE_2___default()("#summary");
      oldSummary.trigger("vjContentRemove");
      dd.apply(oldSummary[0], dd.diff(oldSummary[0], newSummary[0]));
      jquery__WEBPACK_IMPORTED_MODULE_2___default()("#summary").trigger("vjContentNew");
    });
  };
}));


/***/ },

/***/ "./pages/record_main.page.ts"
/*!***********************************!*\
  !*** ./pages/record_main.page.ts ***!
  \***********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_autocomplete_ProblemSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/autocomplete/ProblemSelectAutoComplete */ "./components/autocomplete/ProblemSelectAutoComplete.tsx");
/* harmony import */ var vj_components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/autocomplete/UserSelectAutoComplete */ "./components/autocomplete/UserSelectAutoComplete.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");






const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.NamedPage("record_main", async () => {
  var _a;
  const [{ default: WebSocket }, { DiffDOM }] = await Promise.all([
    Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! ../components/socket */ "./components/socket/index.ts")),
    __webpack_require__.e(/*! import() */ "n.timeago.js").then(__webpack_require__.bind(__webpack_require__, /*! diff-dom */ "../../node_modules/diff-dom/dist/module.js"))
  ]);
  const sock = new WebSocket(UiContext.ws_prefix + UiContext.socketUrl, false, true);
  const dd = new DiffDOM();
  sock.onopen = () => sock.send(JSON.stringify({ rids: UiContext.rids }));
  sock.onmessage = (_, data) => {
    const msg = JSON.parse(data);
    const $newTr = jquery__WEBPACK_IMPORTED_MODULE_0___default()(msg.html);
    const $oldTr = jquery__WEBPACK_IMPORTED_MODULE_0___default()(`.record_main__table tr[data-rid="${$newTr.attr("data-rid")}"]`);
    if ($oldTr.length) {
      $oldTr.trigger("vjContentRemove");
      dd.apply($oldTr[0], dd.diff($oldTr[0], $newTr[0]));
      $oldTr.trigger("vjContentNew");
    } else {
      if (+new URLSearchParams(window.location.search).get("page") > 1 || new URLSearchParams(window.location.search).get("nopush")) return;
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(".record_main__table tbody").prepend($newTr);
      jquery__WEBPACK_IMPORTED_MODULE_0___default()(".record_main__table tbody tr:last").remove();
      $newTr.trigger("vjContentNew");
    }
  };
  vj_components_autocomplete_UserSelectAutoComplete__WEBPACK_IMPORTED_MODULE_2__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="uidOrName"]'), {
    clearDefaultValue: false
  });
  vj_components_autocomplete_ProblemSelectAutoComplete__WEBPACK_IMPORTED_MODULE_1__["default"].getOrConstruct(jquery__WEBPACK_IMPORTED_MODULE_0___default()('[name="pid"]'), {
    clearDefaultValue: false
  });
  const langs = (_a = UiContext.domain.langs) == null ? void 0 : _a.split(",").map((i) => i.trim()).filter((i) => i);
  const availableLangs = (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.getAvailableLangs)((langs == null ? void 0 : langs.length) ? langs : void 0);
  Object.keys(availableLangs).map(
    (i) => jquery__WEBPACK_IMPORTED_MODULE_0___default()('select[name="lang"]').append((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`<option value="${i}" key="${i}">${availableLangs[i].display}</option>`)
  );
  const lang = new URL(window.location.href).searchParams.get("lang");
  if (lang) jquery__WEBPACK_IMPORTED_MODULE_0___default()('select[name="lang"]').val(lang);
  for (const operation of ["rejudge", "cancel"]) {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", `[name="operation"][value="${operation}"]`, (ev) => {
      ev.preventDefault();
      const action = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.target).closest("form").attr("action");
      vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post(action, { operation }).catch((e) => vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error(e));
    });
  }
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/setting.page.tsx"
/*!********************************!*\
  !*** ./pages/setting.page.tsx ***!
  \********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "../../node_modules/react/jsx-runtime.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var schemastery__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! schemastery */ "../../node_modules/schemastery/lib/index.mjs");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_components_react_DomComponent__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/components/react/DomComponent */ "./components/react/DomComponent.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* provided dependency */ var $ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");








const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_6__.NamedPage("manage_config", async () => {
  if (document.documentElement.className.includes("theme--dark")) {
    document.documentElement.className += " dark";
  }
  const [{ ConfigEditor, ComponentsProvider }, { load }] = await Promise.all([
    Promise.all(/*! import() */[__webpack_require__.e("theme"), __webpack_require__.e("n.schemastery-react"), __webpack_require__.e("default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1"), __webpack_require__.e("vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76")]).then(__webpack_require__.bind(__webpack_require__, /*! @hydrooj/components */ "../components/frontend/index.ts")),
    Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! vj/components/monaco/loader */ "./components/monaco/loader.ts"))
  ]);
  const { monaco, registerAction, renderMarkdown } = await load(["yaml"]);
  function Markdown({ source }) {
    const rendered = react__WEBPACK_IMPORTED_MODULE_1___default().useMemo(() => {
      const res = renderMarkdown({ value: source });
      const value = res.element.innerHTML;
      res.dispose();
      return value;
    }, [source]);
    return /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { dangerouslySetInnerHTML: { __html: rendered } });
  }
  react_dom_client__WEBPACK_IMPORTED_MODULE_2__.createRoot(document.getElementById("app")).render(
    /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(ComponentsProvider, { theme: UiContext.theme, codeFontFamily: UiContext.codeFontFamily, i18n: vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n, children: [
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(
        ConfigEditor,
        {
          schema: new schemastery__WEBPACK_IMPORTED_MODULE_3__["default"](UiContext.schema),
          config: UiContext.config,
          monaco,
          registerAction,
          Markdown,
          onSave: (value) => {
            vj_utils__WEBPACK_IMPORTED_MODULE_7__.request.post("", { value }).then(() => {
              vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].success((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Changes saved successfully"));
              window.location.reload();
            }).catch((e) => {
              vj_components_notification__WEBPACK_IMPORTED_MODULE_4__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_7__.i18n)("Failed to save changes:"), e.message);
            });
          },
          sidebar: /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(vj_components_react_DomComponent__WEBPACK_IMPORTED_MODULE_5__["default"], { childDom: $(".section.side").get(0) }),
          dynamic: UiContext.dynamic || {}
        }
      ),
      /* @__PURE__ */ (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("style", { children: `
        body {
          overflow: hidden;
        }
        .footer {
          visibility: hidden;
        }
        .omnibar-toggle {
          display: none;
        }
      ` })
    ] })
  );
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/training_detail.page.ts"
/*!***************************************!*\
  !*** ./pages/training_detail.page.ts ***!
  \***************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils_pjax__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils/pjax */ "./utils/pjax.js");
/* harmony import */ var vj_utils_slide__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/utils/slide */ "./utils/slide.ts");





function action2state(action) {
  return action === "expand" ? "expanded" : "collapsed";
}
async function setSectionState($section, state) {
  if ($section.is(`.${state}, .animating`)) return;
  $section.addClass("animating");
  const $detail = $section.find(".training__section__detail");
  if (state === "expanded") {
    await (0,vj_utils_slide__WEBPACK_IMPORTED_MODULE_4__.slideDown)($detail, 300, { opacity: 0 }, { opacity: 1 });
  } else {
    await (0,vj_utils_slide__WEBPACK_IMPORTED_MODULE_4__.slideUp)($detail, 300, { opacity: 1 }, { opacity: 0 });
  }
  $section.addClass(state);
  $section.removeClass(state === "expanded" ? "collapsed" : "expanded");
  $section.removeClass("animating");
}
async function handleSection(ev, type) {
  const $section = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).closest(".training__section");
  await setSectionState($section, action2state(type));
}
function searchUser() {
  const val = jquery__WEBPACK_IMPORTED_MODULE_0___default()("input[name=uid]").val().toString().toLowerCase();
  const group = jquery__WEBPACK_IMPORTED_MODULE_0___default()("select[name=group]").val().toString().toLowerCase();
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".enroll_user_menu_item").each((i, e) => {
    var _a;
    const $item = jquery__WEBPACK_IMPORTED_MODULE_0___default()(e);
    const $username = $item.data("uname").toString().toLowerCase();
    const $displayName = (_a = $item.data("displayname")) == null ? void 0 : _a.toString().toLowerCase();
    const $uid = $item.data("uid").toString();
    $item.toggle((($displayName == null ? void 0 : $displayName.includes(val)) || $username.includes(val)) && (group === "all" || group.split(",").includes($uid)) || $uid === val);
  });
}
function selectUser(ev) {
  ev.preventDefault();
  if (jquery__WEBPACK_IMPORTED_MODULE_0___default()(".enroll_user_menu_item:visible").length === 1) {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(".enroll_user_menu_item:visible").first().find("a")[0].click();
  }
}
function handleChooseUser(ev) {
  ev.preventDefault();
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".enroll_user_menu_item .active").removeClass("active");
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).addClass("active");
  vj_utils_pjax__WEBPACK_IMPORTED_MODULE_3__["default"].request({ url: ev.currentTarget.href });
}
async function handleSidebarClick(ev) {
  const id = jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).attr("href");
  const $section = jquery__WEBPACK_IMPORTED_MODULE_0___default()(id).closest(".training__section");
  await setSectionState($section, "expanded");
}
async function handleHashChange() {
  const id = window.location.hash;
  if (id.startsWith("#node-")) {
    const $section = jquery__WEBPACK_IMPORTED_MODULE_0___default()(id).closest(".training__section");
    await setSectionState($section, "expanded");
  }
}
const page = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage("training_detail", () => {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".search__input").on("input", lodash__WEBPACK_IMPORTED_MODULE_1___default().debounce(searchUser, 500));
  jquery__WEBPACK_IMPORTED_MODULE_0___default()("select[name=group]").on("change", searchUser);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()("#searchForm").on("submit", selectUser);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="training__section__expand"]', (ev) => handleSection(ev, "expand"));
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="training__section__collapse"]', (ev) => handleSection(ev, "collapse"));
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", ".enroll_user_menu_item > a", (ev) => handleChooseUser(ev));
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", "#menu-item-training_detail > ul > li > a", (ev) => handleSidebarClick(ev));
  window.addEventListener("hashchange", handleHashChange);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(handleHashChange);
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (page);


/***/ },

/***/ "./pages/training_edit.page.ts"
/*!*************************************!*\
  !*** ./pages/training_edit.page.ts ***!
  \*************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");




/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_2__.NamedPage("training_edit", () => {
  let confirmed = false;
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(document).on("click", '[name="operation"]', (ev) => {
    ev.preventDefault();
    if (confirmed) {
      return vj_utils__WEBPACK_IMPORTED_MODULE_3__.request.post(".", { operation: "delete" }).then((res) => {
        window.location.href = res.url;
      });
    }
    const message = "Confirm deleting this training? Its files and status will be deleted as well.";
    return (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.confirm)((0,vj_utils__WEBPACK_IMPORTED_MODULE_3__.i18n)(message)).then((yes) => {
      if (!yes) return;
      confirmed = true;
      ev.target.click();
    });
  });
}));


/***/ },

/***/ "./pages/user_sudo.page.ts"
/*!*********************************!*\
  !*** ./pages/user_sudo.page.ts ***!
  \*********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");


function sudoSwitch(type, init = false) {
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".sudo-div").each((i, e) => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(e).toggle(jquery__WEBPACK_IMPORTED_MODULE_0___default()(e).data("sudo") === type);
  });
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".sudo-switch").each((i, e) => {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(e).toggle(jquery__WEBPACK_IMPORTED_MODULE_0___default()(e).data("sudo") !== type);
  });
  if (type === "authn") {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(".confirm-div input[name=confirm]").prop({ type: "", disabled: true }).hide();
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(".confirm-div input[name=webauthn_verify]").prop({ type: "submit", disabled: false }).show();
    if (!init) jquery__WEBPACK_IMPORTED_MODULE_0___default()(".confirm-div input[name=webauthn_verify]").trigger("click");
  } else {
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(".confirm-div input[name=webauthn_verify]").prop({ type: "", disabled: true }).hide();
    jquery__WEBPACK_IMPORTED_MODULE_0___default()(".confirm-div input[name=confirm]").prop({ type: "submit", disabled: false }).show();
  }
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".sudo-div:visible input:visible").first().trigger("focus");
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_1__.NamedPage("user_sudo", () => {
  sudoSwitch(jquery__WEBPACK_IMPORTED_MODULE_0___default()(jquery__WEBPACK_IMPORTED_MODULE_0___default()(".sudo-div")[0]).data("sudo"), true);
  jquery__WEBPACK_IMPORTED_MODULE_0___default()(".sudo-switch").on("click", (ev) => sudoSwitch(jquery__WEBPACK_IMPORTED_MODULE_0___default()(ev.currentTarget).data("sudo")));
}));


/***/ },

/***/ "./pages/user_verify.page.ts"
/*!***********************************!*\
  !*** ./pages/user_verify.page.ts ***!
  \***********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _simplewebauthn_browser__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @simplewebauthn/browser */ "../../node_modules/@simplewebauthn/browser/esm/index.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");






async function verifywebauthn($form) {
  if (!window.isSecureContext || !("credentials" in navigator)) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Your browser does not support WebAuthn or you are not in secure context."));
    return null;
  }
  let uname = "";
  if ($form["uname"]) uname = $form["uname"].value;
  const authnInfo = await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.get("/user/webauthn", uname ? { uname } : void 0);
  if (!authnInfo.authOptions) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Failed to fetch registration data."));
    return null;
  }
  vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].info((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Please follow the instructions on your device to complete the verification."));
  const result = await (0,_simplewebauthn_browser__WEBPACK_IMPORTED_MODULE_0__.startAuthentication)({ optionsJSON: authnInfo.authOptions }).catch((e) => {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error((0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Failed to get credential: {0}", e));
    return null;
  });
  if (!result) return null;
  try {
    const authn = await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.post("/user/webauthn", {
      result
    });
    if (!authn.error) return authnInfo.authOptions.challenge;
  } catch (err) {
    vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error(err.message);
    console.error(err);
  }
  return null;
}
async function chooseAction(authn) {
  return await new vj_components_dialog__WEBPACK_IMPORTED_MODULE_2__.ActionDialog({
    $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl)`
      <div class="typo">
        <h3>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Two Factor Authentication")}</h3>
        <p>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Your account has two factor authentication enabled. Please choose an authenticator to verify.")}</p>
        <div style="${authn ? "" : "display:none;"}">
          <button class="expanded rounded primary button" data-action="webauthn">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Use Authenticator")}</button>
        </div>
        <div>
          <label>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("6-Digit Code")}  
            <div class="textbox-container">
              <input class="textbox" type="number" name="tfa_code" autocomplete="off" data-autofocus>
            </div>
          </label>
          <button class="expanded rounded primary button" data-action="tfa">${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)("Use TFA Code")}</button>
        </div>
      </div>
      `,
    $action: [],
    canCancel: false,
    onDispatch(action) {
      if (action === "tfa" && jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="tfa_code"]').val() === "") {
        jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="tfa_code"]').focus();
        return false;
      }
      return true;
    }
  }).open();
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.AutoloadPage("user_verify", () => {
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", '[name="login_submit"]', async (ev) => {
    var _a;
    ev.preventDefault();
    const form = ev.currentTarget.form;
    const uname = jquery__WEBPACK_IMPORTED_MODULE_1___default()(form).find('[name="uname"]').val();
    if (!uname) {
      (_a = form.elements.namedItem("uname")) == null ? void 0 : _a.focus();
      return;
    }
    const { authn, tfa } = await vj_utils__WEBPACK_IMPORTED_MODULE_5__.request.get("/user/tfa", { q: uname });
    if (authn || tfa) {
      const handleKeyDown = (event) => {
        if (event.key === "Enter") {
          const code = jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="tfa_code"]').val();
          if (code) jquery__WEBPACK_IMPORTED_MODULE_1___default()('[data-action="tfa"]').trigger("click");
          else jquery__WEBPACK_IMPORTED_MODULE_1___default()("[data-action]").trigger("click");
        }
      };
      jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("keydown", handleKeyDown);
      let action = authn && tfa ? await chooseAction(true) : "";
      action || (action = tfa ? await chooseAction(false) : "webauthn");
      jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).off("keydown", handleKeyDown);
      if (action === "webauthn") {
        const challenge = await verifywebauthn(form);
        if (challenge) form["authnChallenge"].value = challenge;
        else return;
      } else if (action === "tfa") form["tfa"].value = jquery__WEBPACK_IMPORTED_MODULE_1___default()('[name="tfa_code"]').val();
      else return;
    }
    form.submit();
  });
  jquery__WEBPACK_IMPORTED_MODULE_1___default()(document).on("click", "[name=webauthn_verify]", async (ev) => {
    ev.preventDefault();
    const $form = ev.currentTarget.form;
    if (!$form) return;
    const challenge = await verifywebauthn($form);
    if (challenge) {
      $form["authnChallenge"].value = challenge;
      $form.submit();
    }
  });
}));


/***/ },

/***/ "./utils/base.ts"
/*!***********************!*\
  !*** ./utils/base.ts ***!
  \***********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   addSpeculationRules: () => (/* binding */ addSpeculationRules),
/* harmony export */   delay: () => (/* binding */ delay),
/* harmony export */   getTheme: () => (/* binding */ getTheme),
/* harmony export */   i18n: () => (/* binding */ i18n),
/* harmony export */   rawHtml: () => (/* binding */ rawHtml),
/* harmony export */   request: () => (/* binding */ request),
/* harmony export */   secureRandomString: () => (/* binding */ secureRandomString),
/* harmony export */   setTemporaryViewTransitionNames: () => (/* binding */ setTemporaryViewTransitionNames),
/* harmony export */   substitute: () => (/* binding */ substitute),
/* harmony export */   tpl: () => (/* binding */ tpl),
/* harmony export */   withTransitionCallback: () => (/* binding */ withTransitionCallback),
/* harmony export */   zIndexManager: () => (/* binding */ zIndexManager)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! lodash */ "../../node_modules/lodash/lodash.js");
/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");
/* harmony import */ var react_dom_server__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! react-dom/server */ "../../node_modules/react-dom/server.browser.js");





function substitute(str, obj) {
  return str.replace(/\{([^{}]+)\}/g, (match, key) => {
    if (obj[key] !== void 0 && obj[key] !== null) return obj[key].toString();
    return `{${key}}`;
  });
}
function i18n(str, ...params) {
  var _a;
  if (!str) return "";
  return substitute(((_a = window.LOCALES) == null ? void 0 : _a[str]) || str, params);
}
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
const defaultDict = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
function secureRandomString(digit = 32, dict = defaultDict) {
  let result = "";
  const crypto = window.crypto || window.msCrypto;
  if (!(crypto == null ? void 0 : crypto.getRandomValues)) throw new Error("crypto.getRandomValues not supported");
  const array = new Uint32Array(digit);
  crypto.getRandomValues(array);
  for (let i = 0; i < digit; i++) result += dict[array[i] % dict.length];
  return result;
}
function tpl(pieces, ...substitutions) {
  if (react__WEBPACK_IMPORTED_MODULE_2___default().isValidElement(pieces)) {
    if (substitutions[0]) {
      const div = document.createElement("div");
      react_dom_client__WEBPACK_IMPORTED_MODULE_3__.createRoot(div).render(pieces);
      return div;
    }
    return react_dom_server__WEBPACK_IMPORTED_MODULE_4__.renderToStaticMarkup(pieces);
  }
  let result = pieces[0];
  for (let i = 0; i < substitutions.length; ++i) {
    const subst = substitutions[i];
    let substHtml;
    if (subst && typeof subst === "object" && subst.templateRaw) {
      substHtml = subst.html;
    } else substHtml = lodash__WEBPACK_IMPORTED_MODULE_1___default().escape(String(subst));
    result += substHtml + pieces[i + 1];
  }
  return result;
}
tpl.typoMsg = function(msg, raw = false) {
  if (raw) return `<div class="typo"><p>${msg}</p></div>`;
  const lines = msg.trim().split("\n");
  return `<div class="typo">${lines.map((i) => `<p>${lodash__WEBPACK_IMPORTED_MODULE_1___default().escape(i)}</p>`).join("\n")}</div>`;
};
function rawHtml(html) {
  return {
    templateRaw: true,
    html
  };
}
let zIndexCurrent = 1e3;
const zIndexManager = {
  getCurrent() {
    return zIndexCurrent;
  },
  getNext() {
    return ++zIndexCurrent;
  }
};
function addSpeculationRules(rules) {
  var _a;
  if ((_a = HTMLScriptElement.supports) == null ? void 0 : _a.call(HTMLScriptElement, "speculationrules")) {
    const specScript = document.createElement("script");
    specScript.type = "speculationrules";
    specScript.textContent = JSON.stringify(rules);
    document.body.append(specScript);
  }
}
const request = {
  ajax(options) {
    const stack = new Error().stack;
    return new Promise((resolve, reject) => {
      jquery__WEBPACK_IMPORTED_MODULE_0___default().ajax({
        dataType: "json",
        headers: {
          Accept: "application/json"
        },
        ...options
      }).fail((jqXHR, textStatus, errorThrown) => {
        if (textStatus === "abort") {
          const err = new Error(i18n("Aborted"));
          err.aborted = true;
          err.isUserFacingError = true;
          reject(err);
        } else if (jqXHR.readyState === 0) {
          const err = new Error(i18n("Network error"));
          err.isUserFacingError = true;
          reject(err);
        } else if (typeof jqXHR.responseJSON === "object" && jqXHR.responseJSON.error) {
          const { error } = jqXHR.responseJSON;
          if (error.params) {
            const message = i18n(error.message, ...error.params);
            const err = new Error(message === error.message && error.params.length ? `${error.message}: ${error.params.join(" ")}` : message);
            err.rawMessage = error.message;
            err.params = error.params;
            reject(err);
          } else reject(new Error(jqXHR.responseJSON.error.message));
        } else if (errorThrown instanceof Error) {
          reject(errorThrown);
        } else {
          reject(new Error(textStatus));
        }
      }).done(resolve);
    }).catch((e) => {
      e.stack = stack;
      throw e;
    });
  },
  postFile(url, form, options = {}) {
    return this.ajax({
      url,
      data: form,
      processData: false,
      contentType: false,
      type: "POST",
      dataType: void 0,
      ...options
    });
  },
  post(url, dataOrForm = {}, options = {}) {
    let postData;
    if (dataOrForm instanceof (jquery__WEBPACK_IMPORTED_MODULE_0___default()) && dataOrForm.is("form")) {
      postData = dataOrForm.serialize();
    } else if (dataOrForm instanceof Node && jquery__WEBPACK_IMPORTED_MODULE_0___default()(dataOrForm).is("form")) {
      postData = jquery__WEBPACK_IMPORTED_MODULE_0___default()(dataOrForm).serialize();
    } else if (typeof dataOrForm === "string") {
      postData = dataOrForm;
    } else {
      postData = JSON.stringify(dataOrForm);
      options.contentType = "application/json";
    }
    return request.ajax({
      url,
      method: "post",
      data: postData,
      ...options
    });
  },
  get(url, qs = {}, options = {}) {
    return request.ajax({
      url,
      data: qs,
      method: "get",
      ...options
    });
  }
};
let transition = null;
async function withTransitionCallback(callback) {
  var _a;
  if (!document.startViewTransition || document.visibilityState === "hidden") return callback == null ? void 0 : callback();
  (_a = transition == null ? void 0 : transition.skipTransition) == null ? void 0 : _a.call(transition);
  transition = document.startViewTransition(callback);
  await transition.finished;
  transition = null;
  return null;
}
async function setTemporaryViewTransitionNames(entries, vtPromise) {
  for (const [$el, name] of entries) {
    $el.style.viewTransitionName = name;
  }
  await vtPromise;
  for (const [$el] of entries) {
    $el.style.viewTransitionName = "";
  }
}
function getTheme() {
  return ["light", "dark"].includes(UserContext.theme) ? UserContext.theme : "light";
}


/***/ },

/***/ "./utils/base64.js"
/*!*************************!*\
  !*** ./utils/base64.js ***!
  \*************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
const Base64 = {
  _keyStr: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
  encode(input) {
    let output = "";
    let chr1;
    let chr2;
    let chr3;
    let enc1;
    let enc2;
    let enc3;
    let enc4;
    let i = 0;
    input = Base64._utf8Encode(input);
    while (i < input.length) {
      chr1 = input.charCodeAt(i++);
      chr2 = input.charCodeAt(i++);
      chr3 = input.charCodeAt(i++);
      enc1 = chr1 >> 2;
      enc2 = (chr1 & 3) << 4 | chr2 >> 4;
      enc3 = (chr2 & 15) << 2 | chr3 >> 6;
      enc4 = chr3 & 63;
      if (Number.isNaN(chr2)) enc3 = enc4 = 64;
      else if (Number.isNaN(chr3)) enc4 = 64;
      output = output + this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) + this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
    }
    return output;
  },
  decode(input) {
    let output = "";
    let chr1;
    let chr2;
    let chr3;
    let enc1;
    let enc2;
    let enc3;
    let enc4;
    let i = 0;
    input = input.replace(/[^A-Za-z0-9+/=]/g, "");
    while (i < input.length) {
      enc1 = this._keyStr.indexOf(input.charAt(i++));
      enc2 = this._keyStr.indexOf(input.charAt(i++));
      enc3 = this._keyStr.indexOf(input.charAt(i++));
      enc4 = this._keyStr.indexOf(input.charAt(i++));
      chr1 = enc1 << 2 | enc2 >> 4;
      chr2 = (enc2 & 15) << 4 | enc3 >> 2;
      chr3 = (enc3 & 3) << 6 | enc4;
      output += String.fromCharCode(chr1);
      if (enc3 !== 64) output += String.fromCharCode(chr2);
      if (enc4 !== 64) output += String.fromCharCode(chr3);
    }
    output = Base64._utf8Decode(output);
    return output;
  },
  _utf8Encode(string) {
    string = string.replace(/\r\n/g, "\n");
    let utftext = "";
    for (let n = 0; n < string.length; n++) {
      const c = string.charCodeAt(n);
      if (c < 128) {
        utftext += String.fromCharCode(c);
      } else if (c > 127 && c < 2048) {
        utftext += String.fromCharCode(c >> 6 | 192);
        utftext += String.fromCharCode(c & 63 | 128);
      } else {
        utftext += String.fromCharCode(c >> 12 | 224);
        utftext += String.fromCharCode(c >> 6 & 63 | 128);
        utftext += String.fromCharCode(c & 63 | 128);
      }
    }
    return utftext;
  },
  _utf8Decode(utftext) {
    let string = "";
    let i = 0;
    let c = 0;
    let c2 = 0;
    let c3 = 0;
    while (i < utftext.length) {
      c = utftext.charCodeAt(i);
      if (c < 128) {
        string += String.fromCharCode(c);
        i++;
      } else if (c > 191 && c < 224) {
        c2 = utftext.charCodeAt(i + 1);
        string += String.fromCharCode((c & 31) << 6 | c2 & 63);
        i += 2;
      } else {
        c2 = utftext.charCodeAt(i + 1);
        c3 = utftext.charCodeAt(i + 2);
        string += String.fromCharCode((c & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
        i += 3;
      }
    }
    return string;
  }
};
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Base64);


/***/ },

/***/ "./utils/db.ts"
/*!*********************!*\
  !*** ./utils/db.ts ***!
  \*********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   openDB: () => (/* binding */ openDB)
/* harmony export */ });
/* harmony import */ var idb__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! idb */ "../../node_modules/idb/build/index.js");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");


const openDB = (0,idb__WEBPACK_IMPORTED_MODULE_0__.openDB)("hydro", 1, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      const solutionStore = db.createObjectStore("solutions", { keyPath: "id" });
      db.createObjectStore("scoreboard-star", { keyPath: "id" });
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.endsWith("#objective")) {
          const value = localStorage.getItem(key);
          if (value) solutionStore.put({ id: key, value });
          localStorage.removeItem(key);
        }
        if (key.startsWith("scoreboard-star/")) localStorage.removeItem(key);
        if (/^0\.\d+$/.test(key)) localStorage.removeItem(key);
      }
    }
  },
  blocked(currentVersion, blockedVersion) {
    console.error("IDB Blocked by version", blockedVersion, "want", currentVersion);
    (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.alert)("Some other opened tabs locked the database. Please close them.");
  },
  blocking(currentVersion, blockedVersion) {
    console.error("IDB Blocking version", blockedVersion);
    (0,vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.alert)("Please close or refresh this tab to perform the upgrade.");
  },
  terminated() {
    console.error("IDB Terminated");
  }
});


/***/ },

/***/ "./utils/index.ts"
/*!************************!*\
  !*** ./utils/index.ts ***!
  \************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   addSpeculationRules: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.addSpeculationRules),
/* harmony export */   api: () => (/* binding */ api),
/* harmony export */   base64: () => (/* reexport safe */ _base64__WEBPACK_IMPORTED_MODULE_2__["default"]),
/* harmony export */   createZipBlob: () => (/* binding */ createZipBlob),
/* harmony export */   createZipStream: () => (/* binding */ createZipStream),
/* harmony export */   delay: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.delay),
/* harmony export */   emulateAnchorClick: () => (/* binding */ emulateAnchorClick),
/* harmony export */   getAvailableLangs: () => (/* binding */ getAvailableLangs),
/* harmony export */   getTheme: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.getTheme),
/* harmony export */   i18n: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.i18n),
/* harmony export */   loadReactRedux: () => (/* reexport safe */ _loadReactRedux__WEBPACK_IMPORTED_MODULE_3__["default"]),
/* harmony export */   mediaQuery: () => (/* reexport module object */ _mediaQuery__WEBPACK_IMPORTED_MODULE_4__),
/* harmony export */   mongoId: () => (/* binding */ mongoId),
/* harmony export */   pipeStream: () => (/* binding */ pipeStream),
/* harmony export */   pjax: () => (/* reexport safe */ _pjax__WEBPACK_IMPORTED_MODULE_5__["default"]),
/* harmony export */   rawHtml: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.rawHtml),
/* harmony export */   request: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.request),
/* harmony export */   secureRandomString: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.secureRandomString),
/* harmony export */   setTemporaryViewTransitionNames: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.setTemporaryViewTransitionNames),
/* harmony export */   slideDown: () => (/* reexport safe */ _slide__WEBPACK_IMPORTED_MODULE_6__.slideDown),
/* harmony export */   slideUp: () => (/* reexport safe */ _slide__WEBPACK_IMPORTED_MODULE_6__.slideUp),
/* harmony export */   substitute: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.substitute),
/* harmony export */   tpl: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.tpl),
/* harmony export */   withTransitionCallback: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.withTransitionCallback),
/* harmony export */   zIndexManager: () => (/* reexport safe */ _base__WEBPACK_IMPORTED_MODULE_1__.zIndexManager)
/* harmony export */ });
/* harmony import */ var streamsaver_examples_zip_stream__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! streamsaver/examples/zip-stream */ "../../node_modules/streamsaver/examples/zip-stream.js");
/* harmony import */ var streamsaver_examples_zip_stream__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(streamsaver_examples_zip_stream__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _base__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./base */ "./utils/base.ts");
/* harmony import */ var _base64__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./base64 */ "./utils/base64.js");
/* harmony import */ var _loadReactRedux__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./loadReactRedux */ "./utils/loadReactRedux.ts");
/* harmony import */ var _mediaQuery__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./mediaQuery */ "./utils/mediaQuery.ts");
/* harmony import */ var _pjax__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./pjax */ "./utils/pjax.js");
/* harmony import */ var _slide__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./slide */ "./utils/slide.ts");


async function api(method, args, projection) {
  const res = await _base__WEBPACK_IMPORTED_MODULE_1__.request.post(`/d/${UiContext.domainId}/api/${encodeURIComponent(method)}`, { args, projection });
  if (res.error) throw new Error(res.error);
  return res;
}
function getAvailableLangs(langsList) {
  const prefixes = new Set(Object.keys(window.LANGS).filter((i) => i.includes(".")).map((i) => i.split(".")[0]));
  const Langs = {};
  for (const key in window.LANGS) {
    if (prefixes.has(key)) continue;
    if (langsList instanceof Array && !langsList.includes(key)) continue;
    if (window.LANGS[key].hidden && !(langsList == null ? void 0 : langsList.includes(key))) continue;
    if (window.LANGS[key].disabled) continue;
    Langs[key] = window.LANGS[key];
  }
  return Langs;
}
const createZipStream = window.ZIP;
function createZipBlob(underlyingSource) {
  return new Response(createZipStream(underlyingSource)).blob();
}
async function pipeStream(read, write, abort) {
  if (window.WritableStream && read.pipeTo) {
    const abortController = new AbortController();
    if (abort) abort.abort = abortController.abort.bind(abortController);
    await read.pipeTo(write, abortController);
  } else {
    const writer = write.getWriter();
    if (abort) abort.abort = writer.abort.bind(writer);
    const reader = read.getReader();
    while (1) {
      const readResult = await reader.read();
      if (readResult.done) {
        writer.close();
        break;
      } else writer.write(readResult.value);
    }
  }
}
function mongoId(idstring) {
  if (typeof idstring !== "string") idstring = String(idstring);
  return {
    timestamp: Number.parseInt(idstring.slice(0, 0 + 8), 16),
    machineid: Number.parseInt(idstring.slice(8, 8 + 6), 16),
    pid: Number.parseInt(idstring.slice(14, 14 + 4), 16),
    sequence: Number.parseInt(idstring.slice(18, 18 + 6), 16)
  };
}
function emulateAnchorClick(ev, targetUrl, alwaysOpenInNewWindow = false) {
  let openInNewWindow;
  if (alwaysOpenInNewWindow) openInNewWindow = true;
  else openInNewWindow = ev.ctrlKey || ev.shiftKey || ev.metaKey;
  if (openInNewWindow) window.open(targetUrl);
  else window.location.href = targetUrl;
}









/***/ },

/***/ "./utils/loadReactRedux.ts"
/*!*********************************!*\
  !*** ./utils/loadReactRedux.ts ***!
  \*********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ loadReactRedux)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "../../node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var react_dom_client__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react-dom/client */ "../../node_modules/react-dom/client.js");


async function loadReactRedux(storeReducer) {
  const [{ Provider }, { createStore, applyMiddleware }, { thunk: reduxThunk }, { default: reduxPromise }] = await Promise.all([
    Promise.resolve(/*! import() */).then(__webpack_require__.bind(__webpack_require__, /*! react-redux */ "../../node_modules/react-redux/dist/react-redux.mjs")),
    __webpack_require__.e(/*! import() */ "default-vendors-node_modules_ajv_node_modules_json-schema-traverse_index_js-node_modules_fast-1438f1").then(__webpack_require__.bind(__webpack_require__, /*! redux */ "../../node_modules/redux/dist/redux.mjs")),
    __webpack_require__.e(/*! import() */ "vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76").then(__webpack_require__.bind(__webpack_require__, /*! redux-thunk */ "../../node_modules/redux-thunk/dist/redux-thunk.mjs")),
    __webpack_require__.e(/*! import() */ "vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76").then(__webpack_require__.bind(__webpack_require__, /*! redux-promise-middleware */ "../../node_modules/redux-promise-middleware/dist/es/index.js"))
  ]);
  const reduxMiddlewares = [];
  reduxMiddlewares.push(reduxThunk);
  reduxMiddlewares.push(reduxPromise);
  if (true) {
    const { createLogger } = await __webpack_require__.e(/*! import() */ "vendors-node_modules_echarts_node_modules_tslib_tslib_es6_js-node_modules_monaco-yaml_index_j-a6cf76").then(__webpack_require__.t.bind(__webpack_require__, /*! redux-logger */ "../../node_modules/redux-logger/dist/redux-logger.js", 23));
    reduxMiddlewares.push(createLogger({
      collapsed: true,
      duration: true
    }));
  }
  const store = createStore(storeReducer, applyMiddleware(...reduxMiddlewares));
  return {
    React: (react__WEBPACK_IMPORTED_MODULE_0___default()),
    createRoot: react_dom_client__WEBPACK_IMPORTED_MODULE_1__.createRoot,
    Provider,
    store
  };
}


/***/ },

/***/ "./utils/mediaQuery.ts"
/*!*****************************!*\
  !*** ./utils/mediaQuery.ts ***!
  \*****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isAbove: () => (/* binding */ isAbove),
/* harmony export */   isBelow: () => (/* binding */ isBelow)
/* harmony export */ });
function isAbove(width) {
  if (window.matchMedia) {
    return window.matchMedia(`(min-width: ${width}px)`).matches;
  }
  return window.innerWidth >= width;
}
function isBelow(width) {
  if (window.matchMedia) {
    return window.matchMedia(`(max-width: ${width}px)`).matches;
  }
  return window.innerWidth <= width;
}


/***/ },

/***/ "./utils/pjax.js"
/*!***********************!*\
  !*** ./utils/pjax.js ***!
  \***********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery */ "../../node_modules/jquery/dist/jquery.js");
/* harmony import */ var jquery__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var nanoid__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! nanoid */ "../../node_modules/nanoid/index.browser.js");
/* harmony import */ var nprogress__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! nprogress */ "../../node_modules/nprogress/nprogress.js");
/* harmony import */ var nprogress__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(nprogress__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var vj_components_notification__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/components/notification */ "./components/notification/index.ts");
/* harmony import */ var _base__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./base */ "./utils/base.ts");





const pjax = {};
let currentState = null;
let currentXHR = null;
let inProgress = 0;
function cancelLastXHR() {
  if (currentXHR && currentXHR.readyState < 4) {
    currentXHR.abort();
    currentXHR = null;
  }
}
function canonicalizeUrl(url) {
  const a = document.createElement("a");
  a.href = url;
  return a.href;
}
function extractMetaData(requestOption, response) {
  const metaData = {
    title: response.title ? response.title : document.title,
    url: response.url ? response.url : requestOption.url
  };
  metaData.url = canonicalizeUrl(metaData.url);
  return metaData;
}
function incProgress() {
  inProgress++;
  nprogress__WEBPACK_IMPORTED_MODULE_2___default().done();
  nprogress__WEBPACK_IMPORTED_MODULE_2___default().start();
}
function decProgress() {
  inProgress--;
  if (inProgress === 0) {
    nprogress__WEBPACK_IMPORTED_MODULE_2___default().done();
  }
}
pjax.request = async (opt) => {
  if (typeof opt === "string") opt = { url: opt };
  const options = {
    method: "get",
    push: true,
    ...opt
  };
  if (!currentState) {
    currentState = {
      id: (0,nanoid__WEBPACK_IMPORTED_MODULE_1__.nanoid)(),
      options: {
        url: window.location.href
      }
    };
    window.history.replaceState(currentState, null);
  }
  cancelLastXHR();
  if (options.push) {
    window.history.pushState(null, null, options.url);
  }
  incProgress();
  try {
    const params = {
      beforeSend(xhr) {
        currentXHR = xhr;
      },
      ...options
    };
    if (params.url && params.url.includes("?")) params.url += "&pjax=1";
    else params.url = `${params.url || ""}?pjax=1`;
    const data = await _base__WEBPACK_IMPORTED_MODULE_4__.request.ajax(params);
    const meta = extractMetaData(options, data);
    currentState = {
      id: (0,nanoid__WEBPACK_IMPORTED_MODULE_1__.nanoid)(),
      options: opt
    };
    if (options.push) {
      window.history.replaceState(currentState, null, meta.url);
    }
    if (meta.title) document.title = meta.title;
    for (const fragment of data.fragments) {
      if (true) {
        if (fragment.html === void 0) {
          throw new Error("Fragement should contain 'html'");
        }
      }
      const $el = jquery__WEBPACK_IMPORTED_MODULE_0___default()(fragment.html.trim());
      if (true) {
        if ($el.length === 0) {
          throw new Error("Unable to build elements from fragment 'html'");
        }
      }
      const fragmentId = $el.attr("data-fragment-id");
      if (true) {
        if (!fragmentId) {
          throw new Error("Unable to extract fragment id from fragment 'html'");
        }
      }
      const $target = jquery__WEBPACK_IMPORTED_MODULE_0___default()(`[data-fragment-id="${fragmentId}"]`);
      if (true) {
        if ($target.length === 0) {
          throw new Error("Unable to get target fragment from fragment id");
        }
      }
      $target.trigger("vjContentRemove");
      await (0,_base__WEBPACK_IMPORTED_MODULE_4__.withTransitionCallback)(() => {
        $target.replaceWith($el);
        $el.trigger("vjContentNew");
      });
    }
  } catch (err) {
    if (!err.aborted) {
      vj_components_notification__WEBPACK_IMPORTED_MODULE_3__["default"].error(err.message);
      console.error(err);
    }
  } finally {
    decProgress();
  }
};
function handlePopState(ev) {
  if (!ev.originalEvent) return;
  const { state } = ev.originalEvent;
  if (!state) return;
  if (!state.id || currentState && state.id === currentState.id) {
    return;
  }
  pjax.request({
    ...state.options,
    push: false
  });
}
jquery__WEBPACK_IMPORTED_MODULE_0___default()(window).on("popstate", handlePopState);
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (pjax);


/***/ },

/***/ "./utils/slide.ts"
/*!************************!*\
  !*** ./utils/slide.ts ***!
  \************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   slideDown: () => (/* binding */ slideDown),
/* harmony export */   slideUp: () => (/* binding */ slideUp)
/* harmony export */ });
/* harmony import */ var jquery_easing__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jquery.easing */ "../../node_modules/jquery.easing/jquery.easing.js");
/* harmony import */ var jquery_easing__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jquery_easing__WEBPACK_IMPORTED_MODULE_0__);

async function slideDown($element, duration, fromCss = {}, toCss = {}) {
  const originalStyl = $element.attr("style") || "";
  $element.css({
    position: "absolute",
    visibility: "none",
    display: "block"
  });
  const height = $element.outerHeight();
  $element.attr("style", originalStyl);
  $element.css({
    height: 0,
    overflow: "hidden",
    display: "block",
    ...fromCss
  });
  $element.height();
  await $element.transition({
    height,
    ...toCss
  }, {
    duration,
    easing: "easeOutCubic"
  }).promise();
  $element.attr("style", originalStyl);
  $element.css({
    display: "block"
  });
}
async function slideUp($element, duration, fromCss = {}, toCss = {}) {
  const originalStyl = $element.attr("style") || "";
  const height = $element.outerHeight();
  $element.css({
    height,
    overflow: "hidden",
    display: "block",
    ...fromCss
  });
  $element.height();
  await $element.transition({
    height: 0,
    ...toCss
  }, {
    duration,
    easing: "easeOutCubic"
  }).promise();
  $element.attr("style", originalStyl);
  $element.css({
    display: "none"
  });
}


/***/ },

/***/ "../components/frontend/autocomplete/autocomplete.scss"
/*!*************************************************************!*\
  !*** ../components/frontend/autocomplete/autocomplete.scss ***!
  \*************************************************************/
() {

"use strict";
// extracted by mini-css-extract-plugin


/***/ },

/***/ "../../node_modules/prismjs/components sync recursive prism-[a-z0-9-]+\\.js"
/*!************************************************************************!*\
  !*** ../../node_modules/prismjs/components/ sync prism-[a-z0-9-]+\.js ***!
  \************************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

var map = {
	"./prism-abap.js": "../../node_modules/prismjs/components/prism-abap.js",
	"./prism-abnf.js": "../../node_modules/prismjs/components/prism-abnf.js",
	"./prism-actionscript.js": "../../node_modules/prismjs/components/prism-actionscript.js",
	"./prism-ada.js": "../../node_modules/prismjs/components/prism-ada.js",
	"./prism-agda.js": "../../node_modules/prismjs/components/prism-agda.js",
	"./prism-al.js": "../../node_modules/prismjs/components/prism-al.js",
	"./prism-antlr4.js": "../../node_modules/prismjs/components/prism-antlr4.js",
	"./prism-apacheconf.js": "../../node_modules/prismjs/components/prism-apacheconf.js",
	"./prism-apex.js": "../../node_modules/prismjs/components/prism-apex.js",
	"./prism-apl.js": "../../node_modules/prismjs/components/prism-apl.js",
	"./prism-applescript.js": "../../node_modules/prismjs/components/prism-applescript.js",
	"./prism-aql.js": "../../node_modules/prismjs/components/prism-aql.js",
	"./prism-arduino.js": "../../node_modules/prismjs/components/prism-arduino.js",
	"./prism-arff.js": "../../node_modules/prismjs/components/prism-arff.js",
	"./prism-armasm.js": "../../node_modules/prismjs/components/prism-armasm.js",
	"./prism-arturo.js": "../../node_modules/prismjs/components/prism-arturo.js",
	"./prism-asciidoc.js": "../../node_modules/prismjs/components/prism-asciidoc.js",
	"./prism-asm6502.js": "../../node_modules/prismjs/components/prism-asm6502.js",
	"./prism-asmatmel.js": "../../node_modules/prismjs/components/prism-asmatmel.js",
	"./prism-aspnet.js": "../../node_modules/prismjs/components/prism-aspnet.js",
	"./prism-autohotkey.js": "../../node_modules/prismjs/components/prism-autohotkey.js",
	"./prism-autoit.js": "../../node_modules/prismjs/components/prism-autoit.js",
	"./prism-avisynth.js": "../../node_modules/prismjs/components/prism-avisynth.js",
	"./prism-avro-idl.js": "../../node_modules/prismjs/components/prism-avro-idl.js",
	"./prism-awk.js": "../../node_modules/prismjs/components/prism-awk.js",
	"./prism-bash.js": "../../node_modules/prismjs/components/prism-bash.js",
	"./prism-basic.js": "../../node_modules/prismjs/components/prism-basic.js",
	"./prism-batch.js": "../../node_modules/prismjs/components/prism-batch.js",
	"./prism-bbcode.js": "../../node_modules/prismjs/components/prism-bbcode.js",
	"./prism-bbj.js": "../../node_modules/prismjs/components/prism-bbj.js",
	"./prism-bicep.js": "../../node_modules/prismjs/components/prism-bicep.js",
	"./prism-birb.js": "../../node_modules/prismjs/components/prism-birb.js",
	"./prism-bison.js": "../../node_modules/prismjs/components/prism-bison.js",
	"./prism-bnf.js": "../../node_modules/prismjs/components/prism-bnf.js",
	"./prism-bqn.js": "../../node_modules/prismjs/components/prism-bqn.js",
	"./prism-brainfuck.js": "../../node_modules/prismjs/components/prism-brainfuck.js",
	"./prism-brightscript.js": "../../node_modules/prismjs/components/prism-brightscript.js",
	"./prism-bro.js": "../../node_modules/prismjs/components/prism-bro.js",
	"./prism-bsl.js": "../../node_modules/prismjs/components/prism-bsl.js",
	"./prism-c.js": "../../node_modules/prismjs/components/prism-c.js",
	"./prism-cfscript.js": "../../node_modules/prismjs/components/prism-cfscript.js",
	"./prism-chaiscript.js": "../../node_modules/prismjs/components/prism-chaiscript.js",
	"./prism-cil.js": "../../node_modules/prismjs/components/prism-cil.js",
	"./prism-cilkc.js": "../../node_modules/prismjs/components/prism-cilkc.js",
	"./prism-cilkcpp.js": "../../node_modules/prismjs/components/prism-cilkcpp.js",
	"./prism-clike.js": "../../node_modules/prismjs/components/prism-clike.js",
	"./prism-clojure.js": "../../node_modules/prismjs/components/prism-clojure.js",
	"./prism-cmake.js": "../../node_modules/prismjs/components/prism-cmake.js",
	"./prism-cobol.js": "../../node_modules/prismjs/components/prism-cobol.js",
	"./prism-coffeescript.js": "../../node_modules/prismjs/components/prism-coffeescript.js",
	"./prism-concurnas.js": "../../node_modules/prismjs/components/prism-concurnas.js",
	"./prism-cooklang.js": "../../node_modules/prismjs/components/prism-cooklang.js",
	"./prism-coq.js": "../../node_modules/prismjs/components/prism-coq.js",
	"./prism-core.js": "../../node_modules/prismjs/components/prism-core.js",
	"./prism-cpp.js": "../../node_modules/prismjs/components/prism-cpp.js",
	"./prism-crystal.js": "../../node_modules/prismjs/components/prism-crystal.js",
	"./prism-csharp.js": "../../node_modules/prismjs/components/prism-csharp.js",
	"./prism-cshtml.js": "../../node_modules/prismjs/components/prism-cshtml.js",
	"./prism-csp.js": "../../node_modules/prismjs/components/prism-csp.js",
	"./prism-css-extras.js": "../../node_modules/prismjs/components/prism-css-extras.js",
	"./prism-css.js": "../../node_modules/prismjs/components/prism-css.js",
	"./prism-csv.js": "../../node_modules/prismjs/components/prism-csv.js",
	"./prism-cue.js": "../../node_modules/prismjs/components/prism-cue.js",
	"./prism-cypher.js": "../../node_modules/prismjs/components/prism-cypher.js",
	"./prism-d.js": "../../node_modules/prismjs/components/prism-d.js",
	"./prism-dart.js": "../../node_modules/prismjs/components/prism-dart.js",
	"./prism-dataweave.js": "../../node_modules/prismjs/components/prism-dataweave.js",
	"./prism-dax.js": "../../node_modules/prismjs/components/prism-dax.js",
	"./prism-dhall.js": "../../node_modules/prismjs/components/prism-dhall.js",
	"./prism-diff.js": "../../node_modules/prismjs/components/prism-diff.js",
	"./prism-django.js": "../../node_modules/prismjs/components/prism-django.js",
	"./prism-dns-zone-file.js": "../../node_modules/prismjs/components/prism-dns-zone-file.js",
	"./prism-docker.js": "../../node_modules/prismjs/components/prism-docker.js",
	"./prism-dot.js": "../../node_modules/prismjs/components/prism-dot.js",
	"./prism-ebnf.js": "../../node_modules/prismjs/components/prism-ebnf.js",
	"./prism-editorconfig.js": "../../node_modules/prismjs/components/prism-editorconfig.js",
	"./prism-eiffel.js": "../../node_modules/prismjs/components/prism-eiffel.js",
	"./prism-ejs.js": "../../node_modules/prismjs/components/prism-ejs.js",
	"./prism-elixir.js": "../../node_modules/prismjs/components/prism-elixir.js",
	"./prism-elm.js": "../../node_modules/prismjs/components/prism-elm.js",
	"./prism-erb.js": "../../node_modules/prismjs/components/prism-erb.js",
	"./prism-erlang.js": "../../node_modules/prismjs/components/prism-erlang.js",
	"./prism-etlua.js": "../../node_modules/prismjs/components/prism-etlua.js",
	"./prism-excel-formula.js": "../../node_modules/prismjs/components/prism-excel-formula.js",
	"./prism-factor.js": "../../node_modules/prismjs/components/prism-factor.js",
	"./prism-false.js": "../../node_modules/prismjs/components/prism-false.js",
	"./prism-firestore-security-rules.js": "../../node_modules/prismjs/components/prism-firestore-security-rules.js",
	"./prism-flow.js": "../../node_modules/prismjs/components/prism-flow.js",
	"./prism-fortran.js": "../../node_modules/prismjs/components/prism-fortran.js",
	"./prism-fsharp.js": "../../node_modules/prismjs/components/prism-fsharp.js",
	"./prism-ftl.js": "../../node_modules/prismjs/components/prism-ftl.js",
	"./prism-gap.js": "../../node_modules/prismjs/components/prism-gap.js",
	"./prism-gcode.js": "../../node_modules/prismjs/components/prism-gcode.js",
	"./prism-gdscript.js": "../../node_modules/prismjs/components/prism-gdscript.js",
	"./prism-gedcom.js": "../../node_modules/prismjs/components/prism-gedcom.js",
	"./prism-gettext.js": "../../node_modules/prismjs/components/prism-gettext.js",
	"./prism-gherkin.js": "../../node_modules/prismjs/components/prism-gherkin.js",
	"./prism-git.js": "../../node_modules/prismjs/components/prism-git.js",
	"./prism-glsl.js": "../../node_modules/prismjs/components/prism-glsl.js",
	"./prism-gml.js": "../../node_modules/prismjs/components/prism-gml.js",
	"./prism-gn.js": "../../node_modules/prismjs/components/prism-gn.js",
	"./prism-go-module.js": "../../node_modules/prismjs/components/prism-go-module.js",
	"./prism-go.js": "../../node_modules/prismjs/components/prism-go.js",
	"./prism-gradle.js": "../../node_modules/prismjs/components/prism-gradle.js",
	"./prism-graphql.js": "../../node_modules/prismjs/components/prism-graphql.js",
	"./prism-groovy.js": "../../node_modules/prismjs/components/prism-groovy.js",
	"./prism-haml.js": "../../node_modules/prismjs/components/prism-haml.js",
	"./prism-handlebars.js": "../../node_modules/prismjs/components/prism-handlebars.js",
	"./prism-haskell.js": "../../node_modules/prismjs/components/prism-haskell.js",
	"./prism-haxe.js": "../../node_modules/prismjs/components/prism-haxe.js",
	"./prism-hcl.js": "../../node_modules/prismjs/components/prism-hcl.js",
	"./prism-hlsl.js": "../../node_modules/prismjs/components/prism-hlsl.js",
	"./prism-hoon.js": "../../node_modules/prismjs/components/prism-hoon.js",
	"./prism-hpkp.js": "../../node_modules/prismjs/components/prism-hpkp.js",
	"./prism-hsts.js": "../../node_modules/prismjs/components/prism-hsts.js",
	"./prism-http.js": "../../node_modules/prismjs/components/prism-http.js",
	"./prism-ichigojam.js": "../../node_modules/prismjs/components/prism-ichigojam.js",
	"./prism-icon.js": "../../node_modules/prismjs/components/prism-icon.js",
	"./prism-icu-message-format.js": "../../node_modules/prismjs/components/prism-icu-message-format.js",
	"./prism-idris.js": "../../node_modules/prismjs/components/prism-idris.js",
	"./prism-iecst.js": "../../node_modules/prismjs/components/prism-iecst.js",
	"./prism-ignore.js": "../../node_modules/prismjs/components/prism-ignore.js",
	"./prism-inform7.js": "../../node_modules/prismjs/components/prism-inform7.js",
	"./prism-ini.js": "../../node_modules/prismjs/components/prism-ini.js",
	"./prism-io.js": "../../node_modules/prismjs/components/prism-io.js",
	"./prism-j.js": "../../node_modules/prismjs/components/prism-j.js",
	"./prism-java.js": "../../node_modules/prismjs/components/prism-java.js",
	"./prism-javadoc.js": "../../node_modules/prismjs/components/prism-javadoc.js",
	"./prism-javadoclike.js": "../../node_modules/prismjs/components/prism-javadoclike.js",
	"./prism-javascript.js": "../../node_modules/prismjs/components/prism-javascript.js",
	"./prism-javastacktrace.js": "../../node_modules/prismjs/components/prism-javastacktrace.js",
	"./prism-jexl.js": "../../node_modules/prismjs/components/prism-jexl.js",
	"./prism-jolie.js": "../../node_modules/prismjs/components/prism-jolie.js",
	"./prism-jq.js": "../../node_modules/prismjs/components/prism-jq.js",
	"./prism-js-extras.js": "../../node_modules/prismjs/components/prism-js-extras.js",
	"./prism-js-templates.js": "../../node_modules/prismjs/components/prism-js-templates.js",
	"./prism-jsdoc.js": "../../node_modules/prismjs/components/prism-jsdoc.js",
	"./prism-json.js": "../../node_modules/prismjs/components/prism-json.js",
	"./prism-json5.js": "../../node_modules/prismjs/components/prism-json5.js",
	"./prism-jsonp.js": "../../node_modules/prismjs/components/prism-jsonp.js",
	"./prism-jsstacktrace.js": "../../node_modules/prismjs/components/prism-jsstacktrace.js",
	"./prism-jsx.js": "../../node_modules/prismjs/components/prism-jsx.js",
	"./prism-julia.js": "../../node_modules/prismjs/components/prism-julia.js",
	"./prism-keepalived.js": "../../node_modules/prismjs/components/prism-keepalived.js",
	"./prism-keyman.js": "../../node_modules/prismjs/components/prism-keyman.js",
	"./prism-kotlin.js": "../../node_modules/prismjs/components/prism-kotlin.js",
	"./prism-kumir.js": "../../node_modules/prismjs/components/prism-kumir.js",
	"./prism-kusto.js": "../../node_modules/prismjs/components/prism-kusto.js",
	"./prism-latex.js": "../../node_modules/prismjs/components/prism-latex.js",
	"./prism-latte.js": "../../node_modules/prismjs/components/prism-latte.js",
	"./prism-less.js": "../../node_modules/prismjs/components/prism-less.js",
	"./prism-lilypond.js": "../../node_modules/prismjs/components/prism-lilypond.js",
	"./prism-linker-script.js": "../../node_modules/prismjs/components/prism-linker-script.js",
	"./prism-liquid.js": "../../node_modules/prismjs/components/prism-liquid.js",
	"./prism-lisp.js": "../../node_modules/prismjs/components/prism-lisp.js",
	"./prism-livescript.js": "../../node_modules/prismjs/components/prism-livescript.js",
	"./prism-llvm.js": "../../node_modules/prismjs/components/prism-llvm.js",
	"./prism-log.js": "../../node_modules/prismjs/components/prism-log.js",
	"./prism-lolcode.js": "../../node_modules/prismjs/components/prism-lolcode.js",
	"./prism-lua.js": "../../node_modules/prismjs/components/prism-lua.js",
	"./prism-magma.js": "../../node_modules/prismjs/components/prism-magma.js",
	"./prism-makefile.js": "../../node_modules/prismjs/components/prism-makefile.js",
	"./prism-markdown.js": "../../node_modules/prismjs/components/prism-markdown.js",
	"./prism-markup-templating.js": "../../node_modules/prismjs/components/prism-markup-templating.js",
	"./prism-markup.js": "../../node_modules/prismjs/components/prism-markup.js",
	"./prism-mata.js": "../../node_modules/prismjs/components/prism-mata.js",
	"./prism-matlab.js": "../../node_modules/prismjs/components/prism-matlab.js",
	"./prism-maxscript.js": "../../node_modules/prismjs/components/prism-maxscript.js",
	"./prism-mel.js": "../../node_modules/prismjs/components/prism-mel.js",
	"./prism-mermaid.js": "../../node_modules/prismjs/components/prism-mermaid.js",
	"./prism-metafont.js": "../../node_modules/prismjs/components/prism-metafont.js",
	"./prism-mizar.js": "../../node_modules/prismjs/components/prism-mizar.js",
	"./prism-mongodb.js": "../../node_modules/prismjs/components/prism-mongodb.js",
	"./prism-monkey.js": "../../node_modules/prismjs/components/prism-monkey.js",
	"./prism-moonscript.js": "../../node_modules/prismjs/components/prism-moonscript.js",
	"./prism-n1ql.js": "../../node_modules/prismjs/components/prism-n1ql.js",
	"./prism-n4js.js": "../../node_modules/prismjs/components/prism-n4js.js",
	"./prism-nand2tetris-hdl.js": "../../node_modules/prismjs/components/prism-nand2tetris-hdl.js",
	"./prism-naniscript.js": "../../node_modules/prismjs/components/prism-naniscript.js",
	"./prism-nasm.js": "../../node_modules/prismjs/components/prism-nasm.js",
	"./prism-neon.js": "../../node_modules/prismjs/components/prism-neon.js",
	"./prism-nevod.js": "../../node_modules/prismjs/components/prism-nevod.js",
	"./prism-nginx.js": "../../node_modules/prismjs/components/prism-nginx.js",
	"./prism-nim.js": "../../node_modules/prismjs/components/prism-nim.js",
	"./prism-nix.js": "../../node_modules/prismjs/components/prism-nix.js",
	"./prism-nsis.js": "../../node_modules/prismjs/components/prism-nsis.js",
	"./prism-objectivec.js": "../../node_modules/prismjs/components/prism-objectivec.js",
	"./prism-ocaml.js": "../../node_modules/prismjs/components/prism-ocaml.js",
	"./prism-odin.js": "../../node_modules/prismjs/components/prism-odin.js",
	"./prism-opencl.js": "../../node_modules/prismjs/components/prism-opencl.js",
	"./prism-openqasm.js": "../../node_modules/prismjs/components/prism-openqasm.js",
	"./prism-oz.js": "../../node_modules/prismjs/components/prism-oz.js",
	"./prism-parigp.js": "../../node_modules/prismjs/components/prism-parigp.js",
	"./prism-parser.js": "../../node_modules/prismjs/components/prism-parser.js",
	"./prism-pascal.js": "../../node_modules/prismjs/components/prism-pascal.js",
	"./prism-pascaligo.js": "../../node_modules/prismjs/components/prism-pascaligo.js",
	"./prism-pcaxis.js": "../../node_modules/prismjs/components/prism-pcaxis.js",
	"./prism-peoplecode.js": "../../node_modules/prismjs/components/prism-peoplecode.js",
	"./prism-perl.js": "../../node_modules/prismjs/components/prism-perl.js",
	"./prism-php-extras.js": "../../node_modules/prismjs/components/prism-php-extras.js",
	"./prism-php.js": "../../node_modules/prismjs/components/prism-php.js",
	"./prism-phpdoc.js": "../../node_modules/prismjs/components/prism-phpdoc.js",
	"./prism-plant-uml.js": "../../node_modules/prismjs/components/prism-plant-uml.js",
	"./prism-plsql.js": "../../node_modules/prismjs/components/prism-plsql.js",
	"./prism-powerquery.js": "../../node_modules/prismjs/components/prism-powerquery.js",
	"./prism-powershell.js": "../../node_modules/prismjs/components/prism-powershell.js",
	"./prism-processing.js": "../../node_modules/prismjs/components/prism-processing.js",
	"./prism-prolog.js": "../../node_modules/prismjs/components/prism-prolog.js",
	"./prism-promql.js": "../../node_modules/prismjs/components/prism-promql.js",
	"./prism-properties.js": "../../node_modules/prismjs/components/prism-properties.js",
	"./prism-protobuf.js": "../../node_modules/prismjs/components/prism-protobuf.js",
	"./prism-psl.js": "../../node_modules/prismjs/components/prism-psl.js",
	"./prism-pug.js": "../../node_modules/prismjs/components/prism-pug.js",
	"./prism-puppet.js": "../../node_modules/prismjs/components/prism-puppet.js",
	"./prism-pure.js": "../../node_modules/prismjs/components/prism-pure.js",
	"./prism-purebasic.js": "../../node_modules/prismjs/components/prism-purebasic.js",
	"./prism-purescript.js": "../../node_modules/prismjs/components/prism-purescript.js",
	"./prism-python.js": "../../node_modules/prismjs/components/prism-python.js",
	"./prism-q.js": "../../node_modules/prismjs/components/prism-q.js",
	"./prism-qml.js": "../../node_modules/prismjs/components/prism-qml.js",
	"./prism-qore.js": "../../node_modules/prismjs/components/prism-qore.js",
	"./prism-qsharp.js": "../../node_modules/prismjs/components/prism-qsharp.js",
	"./prism-r.js": "../../node_modules/prismjs/components/prism-r.js",
	"./prism-racket.js": "../../node_modules/prismjs/components/prism-racket.js",
	"./prism-reason.js": "../../node_modules/prismjs/components/prism-reason.js",
	"./prism-regex.js": "../../node_modules/prismjs/components/prism-regex.js",
	"./prism-rego.js": "../../node_modules/prismjs/components/prism-rego.js",
	"./prism-renpy.js": "../../node_modules/prismjs/components/prism-renpy.js",
	"./prism-rescript.js": "../../node_modules/prismjs/components/prism-rescript.js",
	"./prism-rest.js": "../../node_modules/prismjs/components/prism-rest.js",
	"./prism-rip.js": "../../node_modules/prismjs/components/prism-rip.js",
	"./prism-roboconf.js": "../../node_modules/prismjs/components/prism-roboconf.js",
	"./prism-robotframework.js": "../../node_modules/prismjs/components/prism-robotframework.js",
	"./prism-ruby.js": "../../node_modules/prismjs/components/prism-ruby.js",
	"./prism-rust.js": "../../node_modules/prismjs/components/prism-rust.js",
	"./prism-sas.js": "../../node_modules/prismjs/components/prism-sas.js",
	"./prism-sass.js": "../../node_modules/prismjs/components/prism-sass.js",
	"./prism-scala.js": "../../node_modules/prismjs/components/prism-scala.js",
	"./prism-scheme.js": "../../node_modules/prismjs/components/prism-scheme.js",
	"./prism-scss.js": "../../node_modules/prismjs/components/prism-scss.js",
	"./prism-shell-session.js": "../../node_modules/prismjs/components/prism-shell-session.js",
	"./prism-smali.js": "../../node_modules/prismjs/components/prism-smali.js",
	"./prism-smalltalk.js": "../../node_modules/prismjs/components/prism-smalltalk.js",
	"./prism-smarty.js": "../../node_modules/prismjs/components/prism-smarty.js",
	"./prism-sml.js": "../../node_modules/prismjs/components/prism-sml.js",
	"./prism-solidity.js": "../../node_modules/prismjs/components/prism-solidity.js",
	"./prism-solution-file.js": "../../node_modules/prismjs/components/prism-solution-file.js",
	"./prism-soy.js": "../../node_modules/prismjs/components/prism-soy.js",
	"./prism-sparql.js": "../../node_modules/prismjs/components/prism-sparql.js",
	"./prism-splunk-spl.js": "../../node_modules/prismjs/components/prism-splunk-spl.js",
	"./prism-sqf.js": "../../node_modules/prismjs/components/prism-sqf.js",
	"./prism-sql.js": "../../node_modules/prismjs/components/prism-sql.js",
	"./prism-squirrel.js": "../../node_modules/prismjs/components/prism-squirrel.js",
	"./prism-stan.js": "../../node_modules/prismjs/components/prism-stan.js",
	"./prism-stata.js": "../../node_modules/prismjs/components/prism-stata.js",
	"./prism-stylus.js": "../../node_modules/prismjs/components/prism-stylus.js",
	"./prism-supercollider.js": "../../node_modules/prismjs/components/prism-supercollider.js",
	"./prism-swift.js": "../../node_modules/prismjs/components/prism-swift.js",
	"./prism-systemd.js": "../../node_modules/prismjs/components/prism-systemd.js",
	"./prism-t4-cs.js": "../../node_modules/prismjs/components/prism-t4-cs.js",
	"./prism-t4-templating.js": "../../node_modules/prismjs/components/prism-t4-templating.js",
	"./prism-t4-vb.js": "../../node_modules/prismjs/components/prism-t4-vb.js",
	"./prism-tap.js": "../../node_modules/prismjs/components/prism-tap.js",
	"./prism-tcl.js": "../../node_modules/prismjs/components/prism-tcl.js",
	"./prism-textile.js": "../../node_modules/prismjs/components/prism-textile.js",
	"./prism-toml.js": "../../node_modules/prismjs/components/prism-toml.js",
	"./prism-tremor.js": "../../node_modules/prismjs/components/prism-tremor.js",
	"./prism-tsx.js": "../../node_modules/prismjs/components/prism-tsx.js",
	"./prism-tt2.js": "../../node_modules/prismjs/components/prism-tt2.js",
	"./prism-turtle.js": "../../node_modules/prismjs/components/prism-turtle.js",
	"./prism-twig.js": "../../node_modules/prismjs/components/prism-twig.js",
	"./prism-typescript.js": "../../node_modules/prismjs/components/prism-typescript.js",
	"./prism-typoscript.js": "../../node_modules/prismjs/components/prism-typoscript.js",
	"./prism-unrealscript.js": "../../node_modules/prismjs/components/prism-unrealscript.js",
	"./prism-uorazor.js": "../../node_modules/prismjs/components/prism-uorazor.js",
	"./prism-uri.js": "../../node_modules/prismjs/components/prism-uri.js",
	"./prism-v.js": "../../node_modules/prismjs/components/prism-v.js",
	"./prism-vala.js": "../../node_modules/prismjs/components/prism-vala.js",
	"./prism-vbnet.js": "../../node_modules/prismjs/components/prism-vbnet.js",
	"./prism-velocity.js": "../../node_modules/prismjs/components/prism-velocity.js",
	"./prism-verilog.js": "../../node_modules/prismjs/components/prism-verilog.js",
	"./prism-vhdl.js": "../../node_modules/prismjs/components/prism-vhdl.js",
	"./prism-vim.js": "../../node_modules/prismjs/components/prism-vim.js",
	"./prism-visual-basic.js": "../../node_modules/prismjs/components/prism-visual-basic.js",
	"./prism-warpscript.js": "../../node_modules/prismjs/components/prism-warpscript.js",
	"./prism-wasm.js": "../../node_modules/prismjs/components/prism-wasm.js",
	"./prism-web-idl.js": "../../node_modules/prismjs/components/prism-web-idl.js",
	"./prism-wgsl.js": "../../node_modules/prismjs/components/prism-wgsl.js",
	"./prism-wiki.js": "../../node_modules/prismjs/components/prism-wiki.js",
	"./prism-wolfram.js": "../../node_modules/prismjs/components/prism-wolfram.js",
	"./prism-wren.js": "../../node_modules/prismjs/components/prism-wren.js",
	"./prism-xeora.js": "../../node_modules/prismjs/components/prism-xeora.js",
	"./prism-xml-doc.js": "../../node_modules/prismjs/components/prism-xml-doc.js",
	"./prism-xojo.js": "../../node_modules/prismjs/components/prism-xojo.js",
	"./prism-xquery.js": "../../node_modules/prismjs/components/prism-xquery.js",
	"./prism-yaml.js": "../../node_modules/prismjs/components/prism-yaml.js",
	"./prism-yang.js": "../../node_modules/prismjs/components/prism-yang.js",
	"./prism-zig.js": "../../node_modules/prismjs/components/prism-zig.js"
};


function webpackContext(req) {
	var id = webpackContextResolve(req);
	return __webpack_require__(id);
}
function webpackContextResolve(req) {
	if(!__webpack_require__.o(map, req)) {
		var e = new Error("Cannot find module '" + req + "'");
		e.code = 'MODULE_NOT_FOUND';
		throw e;
	}
	return map[req];
}
webpackContext.keys = function webpackContextKeys() {
	return Object.keys(map);
};
webpackContext.resolve = webpackContextResolve;
module.exports = webpackContext;
webpackContext.id = "../../node_modules/prismjs/components sync recursive prism-[a-z0-9-]+\\.js";

/***/ },

/***/ "../../node_modules/timeago.js/lib/lang sync \\.js$"
/*!***********************************************************************!*\
  !*** ../../node_modules/timeago.js/lib/lang/ sync nonrecursive \.js$ ***!
  \***********************************************************************/
(module, __unused_webpack_exports, __webpack_require__) {

var map = {
	"./ar.js": "../../node_modules/timeago.js/lib/lang/ar.js",
	"./be.js": "../../node_modules/timeago.js/lib/lang/be.js",
	"./bg.js": "../../node_modules/timeago.js/lib/lang/bg.js",
	"./bn_IN.js": "../../node_modules/timeago.js/lib/lang/bn_IN.js",
	"./ca.js": "../../node_modules/timeago.js/lib/lang/ca.js",
	"./cs.js": "../../node_modules/timeago.js/lib/lang/cs.js",
	"./da.js": "../../node_modules/timeago.js/lib/lang/da.js",
	"./de.js": "../../node_modules/timeago.js/lib/lang/de.js",
	"./el.js": "../../node_modules/timeago.js/lib/lang/el.js",
	"./en_US.js": "../../node_modules/timeago.js/lib/lang/en_US.js",
	"./en_short.js": "../../node_modules/timeago.js/lib/lang/en_short.js",
	"./es.js": "../../node_modules/timeago.js/lib/lang/es.js",
	"./eu.js": "../../node_modules/timeago.js/lib/lang/eu.js",
	"./fa.js": "../../node_modules/timeago.js/lib/lang/fa.js",
	"./fi.js": "../../node_modules/timeago.js/lib/lang/fi.js",
	"./fr.js": "../../node_modules/timeago.js/lib/lang/fr.js",
	"./gl.js": "../../node_modules/timeago.js/lib/lang/gl.js",
	"./he.js": "../../node_modules/timeago.js/lib/lang/he.js",
	"./hi_IN.js": "../../node_modules/timeago.js/lib/lang/hi_IN.js",
	"./hu.js": "../../node_modules/timeago.js/lib/lang/hu.js",
	"./id_ID.js": "../../node_modules/timeago.js/lib/lang/id_ID.js",
	"./index.js": "../../node_modules/timeago.js/lib/lang/index.js",
	"./it.js": "../../node_modules/timeago.js/lib/lang/it.js",
	"./ja.js": "../../node_modules/timeago.js/lib/lang/ja.js",
	"./ka.js": "../../node_modules/timeago.js/lib/lang/ka.js",
	"./ko.js": "../../node_modules/timeago.js/lib/lang/ko.js",
	"./ml.js": "../../node_modules/timeago.js/lib/lang/ml.js",
	"./my.js": "../../node_modules/timeago.js/lib/lang/my.js",
	"./nb_NO.js": "../../node_modules/timeago.js/lib/lang/nb_NO.js",
	"./nl.js": "../../node_modules/timeago.js/lib/lang/nl.js",
	"./nn_NO.js": "../../node_modules/timeago.js/lib/lang/nn_NO.js",
	"./oc.js": "../../node_modules/timeago.js/lib/lang/oc.js",
	"./pl.js": "../../node_modules/timeago.js/lib/lang/pl.js",
	"./pt_BR.js": "../../node_modules/timeago.js/lib/lang/pt_BR.js",
	"./ro.js": "../../node_modules/timeago.js/lib/lang/ro.js",
	"./ru.js": "../../node_modules/timeago.js/lib/lang/ru.js",
	"./sq.js": "../../node_modules/timeago.js/lib/lang/sq.js",
	"./sr.js": "../../node_modules/timeago.js/lib/lang/sr.js",
	"./sv.js": "../../node_modules/timeago.js/lib/lang/sv.js",
	"./ta.js": "../../node_modules/timeago.js/lib/lang/ta.js",
	"./th.js": "../../node_modules/timeago.js/lib/lang/th.js",
	"./tr.js": "../../node_modules/timeago.js/lib/lang/tr.js",
	"./uk.js": "../../node_modules/timeago.js/lib/lang/uk.js",
	"./vi.js": "../../node_modules/timeago.js/lib/lang/vi.js",
	"./zh_CN.js": "../../node_modules/timeago.js/lib/lang/zh_CN.js",
	"./zh_TW.js": "../../node_modules/timeago.js/lib/lang/zh_TW.js"
};


function webpackContext(req) {
	var id = webpackContextResolve(req);
	return __webpack_require__(id);
}
function webpackContextResolve(req) {
	if(!__webpack_require__.o(map, req)) {
		var e = new Error("Cannot find module '" + req + "'");
		e.code = 'MODULE_NOT_FOUND';
		throw e;
	}
	return map[req];
}
webpackContext.keys = function webpackContextKeys() {
	return Object.keys(map);
};
webpackContext.resolve = webpackContextResolve;
module.exports = webpackContext;
webpackContext.id = "../../node_modules/timeago.js/lib/lang sync \\.js$";

/***/ },

/***/ "./components/message/index.page.ts"
/*!******************************************!*\
  !*** ./components/message/index.page.ts ***!
  \******************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var nanoid__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! nanoid */ "../../node_modules/nanoid/index.browser.js");
/* harmony import */ var vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/components/dialog */ "./components/dialog/index.tsx");
/* harmony import */ var vj_components_notification_index__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! vj/components/notification/index */ "./components/notification/index.ts");
/* harmony import */ var vj_constant_message__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! vj/constant/message */ "./constant/message.js");
/* harmony import */ var vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! vj/misc/Page */ "./misc/Page.ts");
/* harmony import */ var vj_utils__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! vj/utils */ "./utils/index.ts");
/* harmony import */ var _socket__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../socket */ "./components/socket/index.ts");







let previous;
const processI18n = (msg) => {
    if (msg.mdoc.flag & vj_constant_message__WEBPACK_IMPORTED_MODULE_3__.FLAG_I18N) {
        try {
            msg.mdoc.content = JSON.parse(msg.mdoc.content);
            if (msg.mdoc.content.url)
                msg.mdoc.url = msg.mdoc.content.url;
            if (msg.mdoc.content.avatar)
                msg.mdoc.avatar = msg.mdoc.content.avatar;
            msg.mdoc.content = (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)(msg.mdoc.content.message, ...msg.mdoc.content.params);
        }
        catch (e) {
            msg.mdoc.content = (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)(msg.mdoc.content);
        }
    }
    return msg;
};
const onmessage = (msg) => {
    console.log('Received message', msg);
    msg = processI18n(msg);
    if (msg.mdoc.flag & vj_constant_message__WEBPACK_IMPORTED_MODULE_3__.FLAG_ALERT) {
        // Is alert
        new vj_components_dialog__WEBPACK_IMPORTED_MODULE_1__.InfoDialog({
            cancelByClickingBack: false,
            $body: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.tpl) `
        <div class="typo">
          ${{ templateRaw: true, html: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)('Message from {0}:', `<div data-user>${msg.mdoc.from}</div>`) }}
          <p>${(0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)(msg.mdoc.content)}</p>
        </div>`,
        }).open();
        return false;
    }
    if (msg.mdoc.flag & vj_constant_message__WEBPACK_IMPORTED_MODULE_3__.FLAG_INFO) {
        if (previous)
            previous.hide();
        previous = new vj_components_notification_index__WEBPACK_IMPORTED_MODULE_2__["default"]({
            message: msg.mdoc.content,
            duration: 3000,
        });
        previous.show();
        return false;
    }
    if (document.hidden)
        return false;
    // Is message
    new vj_components_notification_index__WEBPACK_IMPORTED_MODULE_2__["default"]({
        ...(msg.udoc._id === 1)
            ? {
                type: 'info',
                message: msg.mdoc.flag & vj_constant_message__WEBPACK_IMPORTED_MODULE_3__.FLAG_RICHTEXT ? (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)('You received a system message, click here to view.') : msg.mdoc.content,
                ...(msg.mdoc.avatar ? { avatar: msg.mdoc.avatar } : {}),
            } : {
            title: msg.udoc.uname,
            avatar: msg.udoc.avatarUrl,
            message: msg.mdoc.content,
        },
        duration: 15000,
        action: () => window.open(msg.mdoc.url ? msg.mdoc.url : `/home/messages?uid=${msg.udoc._id}`, '_blank'),
    }).show();
    return true;
};
const initWorkerMode = (endpoint) => {
    console.log('Messages: using SharedWorker');
    const worker = new SharedWorker(new URL(/* worker import */ "/" + __webpack_require__.u("HydroMessagesWorker"), __webpack_require__.b), { name: 'HydroMessagesWorker' });
    worker.port.start();
    window.addEventListener('beforeunload', () => {
        worker.port.postMessage({ type: 'unload' });
    });
    worker.port.postMessage({ type: 'conn', path: endpoint, cookie: document.cookie });
    worker.port.onmessage = async (message) => {
        if (true)
            console.log('onmessage: ', message);
        const { payload, type } = message.data;
        if (type === 'message') {
            if (onmessage(payload))
                worker.port.postMessage({ type: 'ack', id: payload.mdoc._id });
        }
        else if (type === 'i18n') {
            worker.port.postMessage({ type: 'ack', id: `${payload.mdoc._id}-i18n`, payload: processI18n(payload) });
        }
        else if (type === 'open-page') {
            console.log('opening page');
            window.open('/home/messages');
        }
    };
};
const messagePage = new vj_misc_Page__WEBPACK_IMPORTED_MODULE_4__.AutoloadPage('messagePage', (pagename) => {
    if (pagename === 'home_messages' || !UserContext._id)
        return;
    if (UserContext.unreadMsg) {
        new vj_components_notification_index__WEBPACK_IMPORTED_MODULE_2__["default"]({
            type: 'info',
            message: (0,vj_utils__WEBPACK_IMPORTED_MODULE_5__.i18n)(`You have ${UserContext.unreadMsg > 1 ? 'new messages' : 'a new message'}.`),
            duration: 5000,
            action: () => window.open('/home/messages', '_blank'),
        }).show();
    }
    const url = new URL(`${UiContext.ws_prefix}websocket`, window.location.href);
    const endpoint = url.toString().replace('http', 'ws');
    if (window.SharedWorker) {
        try {
            initWorkerMode(endpoint);
            return;
        }
        catch (e) {
            console.error('SharedWorker init fail: ', e.message);
        }
    }
    if (!window.BroadcastChannel) {
        console.error('BoardcastChannel not supported');
        return;
    }
    console.log('Messages: using BroadcastChannel');
    let isMaster = false;
    const selfId = (0,nanoid__WEBPACK_IMPORTED_MODULE_0__.nanoid)();
    const channel = new BroadcastChannel('hydro-messages');
    const pages = JSON.parse(localStorage.getItem('pages') || '[]');
    pages.push(selfId);
    pages.sort();
    localStorage.setItem('pages', JSON.stringify(pages));
    window.onunload = () => {
        const c = JSON.parse(localStorage.getItem('pages') || '[]');
        localStorage.setItem('pages', JSON.stringify(c.filter((i) => i !== selfId)));
        if (!isMaster)
            return;
        localStorage.removeItem('page.master');
        channel.postMessage({ type: 'master' });
    };
    function asMaster() {
        console.log('init as master');
        isMaster = true;
        localStorage.setItem('page.master', selfId);
        const masterChannel = new BroadcastChannel('hydro-messages');
        const sock = new _socket__WEBPACK_IMPORTED_MODULE_6__["default"](endpoint);
        sock.onopen = () => {
            sock.send(JSON.stringify({
                operation: 'subscribe',
                request_id: Math.random().toString(16).substring(2),
                credential: document.cookie.split('sid=')[1].split(';')[0],
                channels: ['message'],
            }));
        };
        sock.onmessage = async (message) => {
            const payload = JSON.parse(message.data);
            if (payload.operation === 'event') {
                masterChannel.postMessage({ type: 'message', payload: payload.payload });
            }
        };
    }
    channel.onmessage = (msg) => {
        if (msg.data.type === 'message' && !document.hidden) {
            onmessage(msg.data.payload);
        }
        if (msg.data.type === 'master') {
            const c = JSON.parse(localStorage.getItem('pages') || '[]');
            if (c[0] === selfId)
                asMaster();
        }
    };
    if (!localStorage.getItem('page.master'))
        asMaster();
});
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (messagePage);


/***/ },

/***/ "./components sync recursive \\.page\\.[jt]sx?$i"
/*!********************************************!*\
  !*** ./components/ sync \.page\.[jt]sx?$i ***!
  \********************************************/
(module, __unused_webpack_exports, __webpack_require__) {

var map = {
	"./browser-update.page.ts": "./components/browser-update.page.ts",
	"./clipboard.page.ts": "./components/clipboard.page.ts",
	"./contest/contest.page.ts": "./components/contest/contest.page.ts",
	"./customFont.page.tsx": "./components/customFont.page.tsx",
	"./datepicker/datepicker.page.tsx": "./components/datepicker/datepicker.page.tsx",
	"./discussion/collapsible.page.tsx": "./components/discussion/collapsible.page.tsx",
	"./discussion/comments.page.tsx": "./components/discussion/comments.page.tsx",
	"./discussion/history.page.tsx": "./components/discussion/history.page.tsx",
	"./discussion/reaction.page.tsx": "./components/discussion/reaction.page.tsx",
	"./dropdown/dropdown.page.ts": "./components/dropdown/dropdown.page.ts",
	"./editor/cmeditor.page.ts": "./components/editor/cmeditor.page.ts",
	"./footer/footer.page.ts": "./components/footer/footer.page.ts",
	"./form/form.page.ts": "./components/form/form.page.ts",
	"./form/multiSelectCheckbox.page.js": "./components/form/multiSelectCheckbox.page.js",
	"./form/textbox.page.ts": "./components/form/textbox.page.ts",
	"./highlighter/highlighter.page.ts": "./components/highlighter/highlighter.page.ts",
	"./hitokoto/index.page.js": "./components/hitokoto/index.page.js",
	"./hotkey/hotkey.page.js": "./components/hotkey/hotkey.page.js",
	"./katex/katex.page.js": "./components/katex/katex.page.js",
	"./mantine.page.tsx": "./components/mantine.page.tsx",
	"./marker/marker.page.js": "./components/marker/marker.page.js",
	"./media/media.page.js": "./components/media/media.page.js",
	"./menu/menu-heading.page.js": "./components/menu/menu-heading.page.js",
	"./menu/menu.page.js": "./components/menu/menu.page.js",
	"./message/index.page.ts": "./components/message/index.page.ts",
	"./navigation/navigation.page.js": "./components/navigation/navigation.page.js",
	"./notification/notification.page.js": "./components/notification/notification.page.js",
	"./omnisearch/index.page.tsx": "./components/omnisearch/index.page.tsx",
	"./preview/preview.page.ts": "./components/preview/preview.page.ts",
	"./problem/create.page.js": "./components/problem/create.page.js",
	"./problem/list.page.js": "./components/problem/list.page.js",
	"./signin/signInDialog.page.js": "./components/signin/signInDialog.page.js",
	"./smoothscroll/smoothscroll.page.js": "./components/smoothscroll/smoothscroll.page.js",
	"./star/star.page.ts": "./components/star/star.page.ts",
	"./sticky/sticky.page.js": "./components/sticky/sticky.page.js",
	"./tab/tab.page.js": "./components/tab/tab.page.js",
	"./table/styledTable.page.js": "./components/table/styledTable.page.js",
	"./time/time.page.js": "./components/time/time.page.js",
	"./tooltip/tooltip.page.js": "./components/tooltip/tooltip.page.js",
	"./vote/vote.page.js": "./components/vote/vote.page.js"
};


function webpackContext(req) {
	var id = webpackContextResolve(req);
	return __webpack_require__(id);
}
function webpackContextResolve(req) {
	if(!__webpack_require__.o(map, req)) {
		var e = new Error("Cannot find module '" + req + "'");
		e.code = 'MODULE_NOT_FOUND';
		throw e;
	}
	return map[req];
}
webpackContext.keys = function webpackContextKeys() {
	return Object.keys(map);
};
webpackContext.resolve = webpackContextResolve;
module.exports = webpackContext;
webpackContext.id = "./components sync recursive \\.page\\.[jt]sx?$i";

/***/ },

/***/ "./pages sync recursive \\.page\\.[jt]sx?$i"
/*!***************************************!*\
  !*** ./pages/ sync \.page\.[jt]sx?$i ***!
  \***************************************/
(module, __unused_webpack_exports, __webpack_require__) {

var map = {
	"./contest.page.ts": "./pages/contest.page.ts",
	"./contest_balloon.page.tsx": "./pages/contest_balloon.page.tsx",
	"./contest_clarification.page.tsx": "./pages/contest_clarification.page.tsx",
	"./contest_edit.page.ts": "./pages/contest_edit.page.ts",
	"./contest_main.page.ts": "./pages/contest_main.page.ts",
	"./contest_manage.page.ts": "./pages/contest_manage.page.ts",
	"./contest_print.page.tsx": "./pages/contest_print.page.tsx",
	"./contest_scoreboard.page.ts": "./pages/contest_scoreboard.page.ts",
	"./contest_user.page.ts": "./pages/contest_user.page.ts",
	"./domain_dashboard.page.ts": "./pages/domain_dashboard.page.ts",
	"./domain_edit.page.tsx": "./pages/domain_edit.page.tsx",
	"./domain_group.page.ts": "./pages/domain_group.page.ts",
	"./domain_join_applications.page.ts": "./pages/domain_join_applications.page.ts",
	"./domain_role.page.js": "./pages/domain_role.page.js",
	"./domain_user.page.js": "./pages/domain_user.page.js",
	"./files.page.tsx": "./pages/files.page.tsx",
	"./home_domain.page.tsx": "./pages/home_domain.page.tsx",
	"./home_messages.page.tsx": "./pages/home_messages.page.tsx",
	"./home_preference.page.jsx": "./pages/home_preference.page.jsx",
	"./home_security.page.tsx": "./pages/home_security.page.tsx",
	"./home_settings.page.ts": "./pages/home_settings.page.ts",
	"./homework_edit.page.ts": "./pages/homework_edit.page.ts",
	"./homework_main.page.js": "./pages/homework_main.page.js",
	"./manage_dashboard.page.js": "./pages/manage_dashboard.page.js",
	"./manage_script.page.js": "./pages/manage_script.page.js",
	"./manage_user_import.page.js": "./pages/manage_user_import.page.js",
	"./manage_user_priv.page.js": "./pages/manage_user_priv.page.js",
	"./problem_config.page.tsx": "./pages/problem_config.page.tsx",
	"./problem_detail.page.tsx": "./pages/problem_detail.page.tsx",
	"./problem_edit.page.jsx": "./pages/problem_edit.page.jsx",
	"./problem_files.page.tsx": "./pages/problem_files.page.tsx",
	"./problem_main.page.tsx": "./pages/problem_main.page.tsx",
	"./problem_sidebar.page.ts": "./pages/problem_sidebar.page.ts",
	"./problem_statistics.page.ts": "./pages/problem_statistics.page.ts",
	"./problem_submit.page.tsx": "./pages/problem_submit.page.tsx",
	"./record_detail.page.tsx": "./pages/record_detail.page.tsx",
	"./record_main.page.ts": "./pages/record_main.page.ts",
	"./setting.page.tsx": "./pages/setting.page.tsx",
	"./training_detail.page.ts": "./pages/training_detail.page.ts",
	"./training_edit.page.ts": "./pages/training_edit.page.ts",
	"./user_sudo.page.ts": "./pages/user_sudo.page.ts",
	"./user_verify.page.ts": "./pages/user_verify.page.ts"
};


function webpackContext(req) {
	var id = webpackContextResolve(req);
	return __webpack_require__(id);
}
function webpackContextResolve(req) {
	if(!__webpack_require__.o(map, req)) {
		var e = new Error("Cannot find module '" + req + "'");
		e.code = 'MODULE_NOT_FOUND';
		throw e;
	}
	return map[req];
}
webpackContext.keys = function webpackContextKeys() {
	return Object.keys(map);
};
webpackContext.resolve = webpackContextResolve;
module.exports = webpackContext;
webpackContext.id = "./pages sync recursive \\.page\\.[jt]sx?$i";

/***/ },

/***/ "./breakpoints.json"
/*!**************************!*\
  !*** ./breakpoints.json ***!
  \**************************/
(module) {

"use strict";
module.exports = /*#__PURE__*/JSON.parse('{"mobile":600,"desktop":1000}');

/***/ }

}]);