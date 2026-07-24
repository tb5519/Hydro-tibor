!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"970d75aa8607cff89eb0648ee23d6fafc2d8eca2"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="de0b7cb5-e296-49e2-a7ca-936c162cecd0",e._sentryDebugIdIdentifier="sentry-dbid-de0b7cb5-e296-49e2-a7ca-936c162cecd0");}catch(e){}}();
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "../../node_modules/reconnecting-websocket/dist/reconnecting-websocket-mjs.js"
/*!************************************************************************************!*\
  !*** ../../node_modules/reconnecting-websocket/dist/reconnecting-websocket-mjs.js ***!
  \************************************************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
var extendStatics = function(d, b) {
  extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
    d2.__proto__ = b2;
  } || function(d2, b2) {
    for (var p in b2) if (b2.hasOwnProperty(p)) d2[p] = b2[p];
  };
  return extendStatics(d, b);
};
function __extends(d, b) {
  extendStatics(d, b);
  function __() {
    this.constructor = d;
  }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}
function __values(o) {
  var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
  if (m) return m.call(o);
  return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
}
function __read(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
}
function __spread() {
  for (var ar = [], i = 0; i < arguments.length; i++)
    ar = ar.concat(__read(arguments[i]));
  return ar;
}
var Event = (
  /** @class */
  /* @__PURE__ */ (function() {
    function Event2(type, target) {
      this.target = target;
      this.type = type;
    }
    return Event2;
  })()
);
var ErrorEvent = (
  /** @class */
  (function(_super) {
    __extends(ErrorEvent2, _super);
    function ErrorEvent2(error, target) {
      var _this = _super.call(this, "error", target) || this;
      _this.message = error.message;
      _this.error = error;
      return _this;
    }
    return ErrorEvent2;
  })(Event)
);
var CloseEvent = (
  /** @class */
  (function(_super) {
    __extends(CloseEvent2, _super);
    function CloseEvent2(code, reason, target) {
      if (code === void 0) {
        code = 1e3;
      }
      if (reason === void 0) {
        reason = "";
      }
      var _this = _super.call(this, "close", target) || this;
      _this.wasClean = true;
      _this.code = code;
      _this.reason = reason;
      return _this;
    }
    return CloseEvent2;
  })(Event)
);
/*!
 * Reconnecting WebSocket
 * by Pedro Ladaria <pedro.ladaria@gmail.com>
 * https://github.com/pladaria/reconnecting-websocket
 * License MIT
 */
var getGlobalWebSocket = function() {
  if (typeof WebSocket !== "undefined") {
    return WebSocket;
  }
};
var isWebSocket = function(w) {
  return typeof w !== "undefined" && !!w && w.CLOSING === 2;
};
var DEFAULT = {
  maxReconnectionDelay: 1e4,
  minReconnectionDelay: 1e3 + Math.random() * 4e3,
  minUptime: 5e3,
  reconnectionDelayGrowFactor: 1.3,
  connectionTimeout: 4e3,
  maxRetries: Infinity,
  maxEnqueuedMessages: Infinity,
  startClosed: false,
  debug: false
};
var ReconnectingWebSocket = (
  /** @class */
  (function() {
    function ReconnectingWebSocket2(url, protocols, options) {
      var _this = this;
      if (options === void 0) {
        options = {};
      }
      this._listeners = {
        error: [],
        message: [],
        open: [],
        close: []
      };
      this._retryCount = -1;
      this._shouldReconnect = true;
      this._connectLock = false;
      this._binaryType = "blob";
      this._closeCalled = false;
      this._messageQueue = [];
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      this.onopen = null;
      this._handleOpen = function(event) {
        _this._debug("open event");
        var _a = _this._options.minUptime, minUptime = _a === void 0 ? DEFAULT.minUptime : _a;
        clearTimeout(_this._connectTimeout);
        _this._uptimeTimeout = setTimeout(function() {
          return _this._acceptOpen();
        }, minUptime);
        _this._ws.binaryType = _this._binaryType;
        _this._messageQueue.forEach(function(message) {
          return _this._ws.send(message);
        });
        _this._messageQueue = [];
        if (_this.onopen) {
          _this.onopen(event);
        }
        _this._listeners.open.forEach(function(listener) {
          return _this._callEventListener(event, listener);
        });
      };
      this._handleMessage = function(event) {
        _this._debug("message event");
        if (_this.onmessage) {
          _this.onmessage(event);
        }
        _this._listeners.message.forEach(function(listener) {
          return _this._callEventListener(event, listener);
        });
      };
      this._handleError = function(event) {
        _this._debug("error event", event.message);
        _this._disconnect(void 0, event.message === "TIMEOUT" ? "timeout" : void 0);
        if (_this.onerror) {
          _this.onerror(event);
        }
        _this._debug("exec error listeners");
        _this._listeners.error.forEach(function(listener) {
          return _this._callEventListener(event, listener);
        });
        _this._connect();
      };
      this._handleClose = function(event) {
        _this._debug("close event");
        _this._clearTimeouts();
        if (_this._shouldReconnect) {
          _this._connect();
        }
        if (_this.onclose) {
          _this.onclose(event);
        }
        _this._listeners.close.forEach(function(listener) {
          return _this._callEventListener(event, listener);
        });
      };
      this._url = url;
      this._protocols = protocols;
      this._options = options;
      if (this._options.startClosed) {
        this._shouldReconnect = false;
      }
      this._connect();
    }
    Object.defineProperty(ReconnectingWebSocket2, "CONNECTING", {
      get: function() {
        return 0;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2, "OPEN", {
      get: function() {
        return 1;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2, "CLOSING", {
      get: function() {
        return 2;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2, "CLOSED", {
      get: function() {
        return 3;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "CONNECTING", {
      get: function() {
        return ReconnectingWebSocket2.CONNECTING;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "OPEN", {
      get: function() {
        return ReconnectingWebSocket2.OPEN;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "CLOSING", {
      get: function() {
        return ReconnectingWebSocket2.CLOSING;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "CLOSED", {
      get: function() {
        return ReconnectingWebSocket2.CLOSED;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "binaryType", {
      get: function() {
        return this._ws ? this._ws.binaryType : this._binaryType;
      },
      set: function(value) {
        this._binaryType = value;
        if (this._ws) {
          this._ws.binaryType = value;
        }
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "retryCount", {
      /**
       * Returns the number or connection retries
       */
      get: function() {
        return Math.max(this._retryCount, 0);
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "bufferedAmount", {
      /**
       * The number of bytes of data that have been queued using calls to send() but not yet
       * transmitted to the network. This value resets to zero once all queued data has been sent.
       * This value does not reset to zero when the connection is closed; if you keep calling send(),
       * this will continue to climb. Read only
       */
      get: function() {
        var bytes = this._messageQueue.reduce(function(acc, message) {
          if (typeof message === "string") {
            acc += message.length;
          } else if (message instanceof Blob) {
            acc += message.size;
          } else {
            acc += message.byteLength;
          }
          return acc;
        }, 0);
        return bytes + (this._ws ? this._ws.bufferedAmount : 0);
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "extensions", {
      /**
       * The extensions selected by the server. This is currently only the empty string or a list of
       * extensions as negotiated by the connection
       */
      get: function() {
        return this._ws ? this._ws.extensions : "";
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "protocol", {
      /**
       * A string indicating the name of the sub-protocol the server selected;
       * this will be one of the strings specified in the protocols parameter when creating the
       * WebSocket object
       */
      get: function() {
        return this._ws ? this._ws.protocol : "";
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "readyState", {
      /**
       * The current state of the connection; this is one of the Ready state constants
       */
      get: function() {
        if (this._ws) {
          return this._ws.readyState;
        }
        return this._options.startClosed ? ReconnectingWebSocket2.CLOSED : ReconnectingWebSocket2.CONNECTING;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(ReconnectingWebSocket2.prototype, "url", {
      /**
       * The URL as resolved by the constructor
       */
      get: function() {
        return this._ws ? this._ws.url : "";
      },
      enumerable: true,
      configurable: true
    });
    ReconnectingWebSocket2.prototype.close = function(code, reason) {
      if (code === void 0) {
        code = 1e3;
      }
      this._closeCalled = true;
      this._shouldReconnect = false;
      this._clearTimeouts();
      if (!this._ws) {
        this._debug("close enqueued: no ws instance");
        return;
      }
      if (this._ws.readyState === this.CLOSED) {
        this._debug("close: already closed");
        return;
      }
      this._ws.close(code, reason);
    };
    ReconnectingWebSocket2.prototype.reconnect = function(code, reason) {
      this._shouldReconnect = true;
      this._closeCalled = false;
      this._retryCount = -1;
      if (!this._ws || this._ws.readyState === this.CLOSED) {
        this._connect();
      } else {
        this._disconnect(code, reason);
        this._connect();
      }
    };
    ReconnectingWebSocket2.prototype.send = function(data) {
      if (this._ws && this._ws.readyState === this.OPEN) {
        this._debug("send", data);
        this._ws.send(data);
      } else {
        var _a = this._options.maxEnqueuedMessages, maxEnqueuedMessages = _a === void 0 ? DEFAULT.maxEnqueuedMessages : _a;
        if (this._messageQueue.length < maxEnqueuedMessages) {
          this._debug("enqueue", data);
          this._messageQueue.push(data);
        }
      }
    };
    ReconnectingWebSocket2.prototype.addEventListener = function(type, listener) {
      if (this._listeners[type]) {
        this._listeners[type].push(listener);
      }
    };
    ReconnectingWebSocket2.prototype.dispatchEvent = function(event) {
      var e_1, _a;
      var listeners = this._listeners[event.type];
      if (listeners) {
        try {
          for (var listeners_1 = __values(listeners), listeners_1_1 = listeners_1.next(); !listeners_1_1.done; listeners_1_1 = listeners_1.next()) {
            var listener = listeners_1_1.value;
            this._callEventListener(event, listener);
          }
        } catch (e_1_1) {
          e_1 = { error: e_1_1 };
        } finally {
          try {
            if (listeners_1_1 && !listeners_1_1.done && (_a = listeners_1.return)) _a.call(listeners_1);
          } finally {
            if (e_1) throw e_1.error;
          }
        }
      }
      return true;
    };
    ReconnectingWebSocket2.prototype.removeEventListener = function(type, listener) {
      if (this._listeners[type]) {
        this._listeners[type] = this._listeners[type].filter(function(l) {
          return l !== listener;
        });
      }
    };
    ReconnectingWebSocket2.prototype._debug = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      if (this._options.debug) {
        console.log.apply(console, __spread(["RWS>"], args));
      }
    };
    ReconnectingWebSocket2.prototype._getNextDelay = function() {
      var _a = this._options, _b = _a.reconnectionDelayGrowFactor, reconnectionDelayGrowFactor = _b === void 0 ? DEFAULT.reconnectionDelayGrowFactor : _b, _c = _a.minReconnectionDelay, minReconnectionDelay = _c === void 0 ? DEFAULT.minReconnectionDelay : _c, _d = _a.maxReconnectionDelay, maxReconnectionDelay = _d === void 0 ? DEFAULT.maxReconnectionDelay : _d;
      var delay = 0;
      if (this._retryCount > 0) {
        delay = minReconnectionDelay * Math.pow(reconnectionDelayGrowFactor, this._retryCount - 1);
        if (delay > maxReconnectionDelay) {
          delay = maxReconnectionDelay;
        }
      }
      this._debug("next delay", delay);
      return delay;
    };
    ReconnectingWebSocket2.prototype._wait = function() {
      var _this = this;
      return new Promise(function(resolve) {
        setTimeout(resolve, _this._getNextDelay());
      });
    };
    ReconnectingWebSocket2.prototype._getNextUrl = function(urlProvider) {
      if (typeof urlProvider === "string") {
        return Promise.resolve(urlProvider);
      }
      if (typeof urlProvider === "function") {
        var url = urlProvider();
        if (typeof url === "string") {
          return Promise.resolve(url);
        }
        if (!!url.then) {
          return url;
        }
      }
      throw Error("Invalid URL");
    };
    ReconnectingWebSocket2.prototype._connect = function() {
      var _this = this;
      if (this._connectLock || !this._shouldReconnect) {
        return;
      }
      this._connectLock = true;
      var _a = this._options, _b = _a.maxRetries, maxRetries = _b === void 0 ? DEFAULT.maxRetries : _b, _c = _a.connectionTimeout, connectionTimeout = _c === void 0 ? DEFAULT.connectionTimeout : _c, _d = _a.WebSocket, WebSocket2 = _d === void 0 ? getGlobalWebSocket() : _d;
      if (this._retryCount >= maxRetries) {
        this._debug("max retries reached", this._retryCount, ">=", maxRetries);
        return;
      }
      this._retryCount++;
      this._debug("connect", this._retryCount);
      this._removeListeners();
      if (!isWebSocket(WebSocket2)) {
        throw Error("No valid WebSocket class provided");
      }
      this._wait().then(function() {
        return _this._getNextUrl(_this._url);
      }).then(function(url) {
        if (_this._closeCalled) {
          return;
        }
        _this._debug("connect", { url, protocols: _this._protocols });
        _this._ws = _this._protocols ? new WebSocket2(url, _this._protocols) : new WebSocket2(url);
        _this._ws.binaryType = _this._binaryType;
        _this._connectLock = false;
        _this._addListeners();
        _this._connectTimeout = setTimeout(function() {
          return _this._handleTimeout();
        }, connectionTimeout);
      });
    };
    ReconnectingWebSocket2.prototype._handleTimeout = function() {
      this._debug("timeout event");
      this._handleError(new ErrorEvent(Error("TIMEOUT"), this));
    };
    ReconnectingWebSocket2.prototype._disconnect = function(code, reason) {
      if (code === void 0) {
        code = 1e3;
      }
      this._clearTimeouts();
      if (!this._ws) {
        return;
      }
      this._removeListeners();
      try {
        this._ws.close(code, reason);
        this._handleClose(new CloseEvent(code, reason, this));
      } catch (error) {
      }
    };
    ReconnectingWebSocket2.prototype._acceptOpen = function() {
      this._debug("accept open");
      this._retryCount = 0;
    };
    ReconnectingWebSocket2.prototype._callEventListener = function(event, listener) {
      if ("handleEvent" in listener) {
        listener.handleEvent(event);
      } else {
        listener(event);
      }
    };
    ReconnectingWebSocket2.prototype._removeListeners = function() {
      if (!this._ws) {
        return;
      }
      this._debug("removeListeners");
      this._ws.removeEventListener("open", this._handleOpen);
      this._ws.removeEventListener("close", this._handleClose);
      this._ws.removeEventListener("message", this._handleMessage);
      this._ws.removeEventListener("error", this._handleError);
    };
    ReconnectingWebSocket2.prototype._addListeners = function() {
      if (!this._ws) {
        return;
      }
      this._debug("addListeners");
      this._ws.addEventListener("open", this._handleOpen);
      this._ws.addEventListener("close", this._handleClose);
      this._ws.addEventListener("message", this._handleMessage);
      this._ws.addEventListener("error", this._handleError);
    };
    ReconnectingWebSocket2.prototype._clearTimeouts = function() {
      clearTimeout(this._connectTimeout);
      clearTimeout(this._uptimeTimeout);
    };
    return ReconnectingWebSocket2;
  })()
);
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (ReconnectingWebSocket);


/***/ },

/***/ "./constant/message.js"
/*!*****************************!*\
  !*** ./constant/message.js ***!
  \*****************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   FLAG_I18N: () => (/* binding */ FLAG_I18N),
/* harmony export */   FLAG_INFO: () => (/* binding */ FLAG_INFO)
/* harmony export */ });
/* unused harmony exports FLAG_UNREAD, FLAG_ALERT, FLAG_RICHTEXT */
const FLAG_UNREAD = 1;
const FLAG_ALERT = 2;
const FLAG_RICHTEXT = 4;
const FLAG_INFO = 8;
const FLAG_I18N = 16;


/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!**************************************!*\
  !*** ./components/message/worker.ts ***!
  \**************************************/
/* harmony import */ var reconnecting_websocket__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! reconnecting-websocket */ "../../node_modules/reconnecting-websocket/dist/reconnecting-websocket-mjs.js");
/* harmony import */ var vj_constant_message__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! vj/constant/message */ "./constant/message.js");
/// <reference no-default-lib="true" />
/// <reference lib="webworker" />


console.log('SharedWorker init');
let conn;
let lcookie;
const ports = new Set();
const ack = {};
function broadcastMsg(message) {
    for (const p of ports)
        p.postMessage(message);
}
function onMessage(message) {
    broadcastMsg({ type: 'message', payload: message });
    let acked = false;
    let payload = message;
    ack[message.mdoc._id] = () => { acked = true; };
    ack[`${message.mdoc._id}-i18n`] = (v) => { payload = v; };
    if (message.mdoc.flag & vj_constant_message__WEBPACK_IMPORTED_MODULE_1__.FLAG_I18N)
        broadcastMsg({ type: 'i18n', payload: message });
    setTimeout(() => {
        delete ack[message.mdoc._id];
        delete ack[`${message.mdoc._id}-i18n`];
        if (acked)
            return;
        if (message.mdoc.flag & vj_constant_message__WEBPACK_IMPORTED_MODULE_1__.FLAG_INFO)
            return;
        if (Notification?.permission !== 'granted') {
            console.log('Notification permission denied');
            return;
        }
        console.log('Sending as system notification');
        // eslint-disable-next-line no-new
        new Notification(payload.udoc._id === 1 ? payload.mdoc.content.split('\n')[0] : payload.udoc.uname || 'Hydro Notification', payload.udoc._id === 1 ? {
            tag: `notification-${payload.mdoc._id}`,
            icon: payload.mdoc.avatar || '/android-chrome-192x192.png',
            body: payload.mdoc.content.split('\n').slice(1).join('\n'),
        } : {
            tag: `message-${payload.mdoc._id}`,
            icon: payload.udoc.avatarUrl || '/android-chrome-192x192.png',
            body: payload.mdoc.content,
        });
    }, 3000);
}
function initConn(path, port, cookie) {
    ports.add(port);
    console.log('Init connection');
    lcookie = cookie.split('sid=')[1].split(';')[0];
    if (conn)
        return;
    const url = new URL(path, location.origin);
    conn = new reconnecting_websocket__WEBPACK_IMPORTED_MODULE_0__["default"](url.toString().replace('http', 'ws'));
    conn.onopen = () => {
        console.log('Connected');
        broadcastMsg({ type: 'open' });
        conn.send(JSON.stringify({
            operation: 'subscribe',
            request_id: Math.random().toString(16).substring(2),
            credential: lcookie,
            channels: ['message'],
        }));
    };
    conn.onerror = () => broadcastMsg({ type: 'error' });
    conn.onclose = (ev) => broadcastMsg({ type: 'close', error: ev.reason });
    conn.onmessage = (message) => {
        if (true)
            console.log('SharedWorker.port.onmessage: ', message);
        if (message.data === 'ping') {
            conn.send('pong');
            return;
        }
        const payload = JSON.parse(message.data);
        if (['PermissionError', 'PrivilegeError'].includes(payload.error)) {
            broadcastMsg({ type: 'close', error: payload.error });
            conn.close();
        }
        else if (payload.operation === 'event') {
            onMessage(payload.payload);
        }
    };
}
self.onconnect = function (e) {
    const port = e.ports[0];
    port.addEventListener('message', (msg) => {
        if (msg.data.type === 'conn')
            initConn(msg.data.path, port, msg.data.cookie);
        if (msg.data.type === 'ack')
            ack[msg.data.id]?.(msg.data.payload);
        if (msg.data.type === 'unload')
            ports.delete(port);
    });
    port.start();
};

})();

/******/ })()
;