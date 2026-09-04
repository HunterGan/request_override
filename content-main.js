(() => {
  if (window.__responseMockInstalled) return;
  window.__responseMockInstalled = true;

  const SRC = "__REQUEST_OVERRIDE__";
  const FROM_BRIDGE = SRC + ".bridge";
  const FROM_MAIN = SRC + ".main";

  let rules = [];
  let netAttached = false;
  let logSeq = 0;
  const FRAME_UID = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  let isTopFrame = true;
  try {
    isTopFrame = window.top === window;
  } catch (e) { /* ignore */ }

  const regexCache = new Map();
  const MAX_RULES = 100;
  const MAX_PATTERN_LEN = 1000;
  const MAX_STATUS_TEXT_LEN = 200;
  const MAX_CONTENT_TYPE_LEN = 300;
  const MAX_BODY_BYTES = 1024 * 1024;
  const MAX_DELAY_MS = 60000;
  const HTTP_METHODS = new Set(["", "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

  function safeString(value, maxLen) {
    let s = value == null ? "" : String(value);
    if (s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  function byteLength(text) {
    try {
      return new TextEncoder().encode(text).length;
    } catch (e) {
      return String(text).length;
    }
  }

  const DEFAULT_STATUS_TEXT = {
    200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
    301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
    410: "Gone", 413: "Payload Too Large", 429: "Too Many Requests",
    500: "Internal Server Error", 501: "Not Implemented",
    502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout"
  };

  function defaultStatusText(status) {
    return DEFAULT_STATUS_TEXT[status] || "";
  }

  function normalizeRule(r) {
    const raw = r || {};
    let status = Number(raw.status);
    if (!Number.isInteger(status) || status < 200 || status > 599) status = 200;
    let delay = Number(raw.delay);
    if (!Number.isFinite(delay) || delay < 0) delay = 0;
    delay = Math.min(Math.floor(delay), MAX_DELAY_MS);

    const id = safeString(raw.id, 128) || "r_" + Date.now() + "_" + Math.random().toString(16).slice(2, 8);
    let method = String(raw.method || "").toUpperCase();
    if (!HTTP_METHODS.has(method)) method = "";
    let body = raw.body == null ? "" : (typeof raw.body === "string" ? raw.body : JSON.stringify(raw.body));
    if (byteLength(body) > MAX_BODY_BYTES) body = "";

    return {
      id,
      enabled: raw.enabled !== false,
      urlPattern: safeString(raw.urlPattern, MAX_PATTERN_LEN),
      matchType: raw.matchType === "regex" ? "regex" : "substring",
      method,
      status,
      statusText: safeString(raw.statusText, MAX_STATUS_TEXT_LEN),
      contentType: safeString(raw.contentType, MAX_CONTENT_TYPE_LEN),
      body,
      delay
    };
  }

  function findRule(url, method) {
    const m = String(method || "GET").toUpperCase();
    for (const rule of rules) {
      if (!rule || rule.enabled === false) continue;
      if (rule.method && rule.method !== m) continue;
      if (!rule.urlPattern) continue;
      if (rule.matchType === "regex") {
        let re = regexCache.get(rule.urlPattern);
        if (re === undefined) {
          try {
            re = new RegExp(rule.urlPattern);
          } catch (e) {
            re = null;
          }
          regexCache.set(rule.urlPattern, re);
        }
        if (!re || !re.test(url)) continue;
      } else if (!url.includes(rule.urlPattern)) {
        continue;
      }
      return rule;
    }
    return null;
  }

  function postLog(entry) {
    try {
      window.postMessage({ source: FROM_MAIN, type: "log", entry }, "*");
    } catch (e) { /* ignore */ }
  }

  function logRequest(method, url, status, duration, mocked, statusText) {
    postLog({
      id: Date.now() + ":" + (++logSeq) + ":" + FRAME_UID,
      frame: isTopFrame ? "top" : "child",
      ts: Date.now(),
      method: String(method || "GET").toUpperCase(),
      url: String(url),
      status: status === 0 ? 0 : Number(status) || 0,
      statusText: statusText == null ? "" : String(statusText),
      duration: Math.max(0, Math.round(duration)),
      mocked: !!mocked
    });
  }

  // ----- rules channel (from ISOLATED bridge) -----
  const TOKEN_ATTR = "data-request-override";

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.source !== FROM_BRIDGE) return;
    const root = document.documentElement;
    const expected = root ? root.getAttribute(TOKEN_ATTR) : null;
    if (!expected || data.token !== expected) return;
    if (data.type === "rules") {
      rules = Array.isArray(data.rules) ? data.rules.slice(0, MAX_RULES).map(normalizeRule) : [];
      regexCache.clear();
    } else if (data.type === "netstatus") {
      netAttached = !!data.attached;
    }
  });
  window.postMessage({ source: FROM_MAIN, type: "hello" }, "*");

  // ----- fetch patch -----
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  function parseFetchArgs(input, init) {
    let url;
    let method = "GET";
    try {
      if (typeof Request !== "undefined" && input instanceof Request) {
        url = input.url;
        method = input.method || "GET";
      } else if (typeof input === "string" || (typeof URL !== "undefined" && input instanceof URL)) {
        url = new URL(input, window.location.href).href;
      } else {
        url = String(input);
      }
    } catch (e) {
      url = String(input);
    }
    if (init && typeof init === "object" && init.method) {
      method = init.method;
    }
    return { url, method: String(method || "GET").toUpperCase() };
  }

  function buildMockResponse(rule, url, method) {
    const status = Number.isInteger(rule.status) && rule.status >= 200 && rule.status <= 599 ? rule.status : 200;
    const fullBody = rule.body == null ? "" : String(rule.body);
    const isNullBody = status === 204 || status === 205 || status === 304;
    const isHead = method === "HEAD";
    const body = isNullBody || isHead ? "" : fullBody;
    const headers = {};
    if (rule.contentType) headers["Content-Type"] = rule.contentType;
    if (isHead && !isNullBody) {
      headers["Content-Length"] = String(new TextEncoder().encode(fullBody).length);
    } else if (!isNullBody && !isHead) {
      headers["Content-Length"] = String(new TextEncoder().encode(body).length);
    }
    const response = new Response(isNullBody ? null : body, {
      status,
      statusText: rule.statusText || defaultStatusText(status),
      headers
    });
    try {
      Object.defineProperty(response, "url", { value: url, configurable: true });
    } catch (e) { /* ignore */ }
    return response;
  }

  function abortError() {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  if (nativeFetch) {
    window.fetch = function fetch(input, init) {
      const { url, method } = parseFetchArgs(input, init);
      const started = performance.now();
      const rule = findRule(url, method);

      if (rule && !netAttached) {
        const promise = (async () => {
          const signal = (init && typeof init === "object" && init.signal)
            || (typeof Request !== "undefined" && input instanceof Request ? input.signal : null)
            || null;
          if (signal && signal.aborted) throw abortError();
          if (rule.delay > 0) {
            await new Promise((resolve, reject) => {
              let onAbort = null;
              const timer = setTimeout(() => {
                if (signal && onAbort) signal.removeEventListener("abort", onAbort);
                resolve();
              }, rule.delay);
              if (signal) {
                onAbort = () => {
                  clearTimeout(timer);
                  signal.removeEventListener("abort", onAbort);
                  reject(abortError());
                };
                signal.addEventListener("abort", onAbort);
              }
            });
          }
          const response = buildMockResponse(rule, url, method);
          logRequest(method, url, rule.status, performance.now() - started, true,
            rule.statusText || defaultStatusText(rule.status));
          return response;
        })();
        return promise;
      }

      const promise = nativeFetch(input, init);
      promise.then(
        (res) => {
          try {
            logRequest(method, url, res.status, performance.now() - started, !!rule, res.statusText);
          } catch (e) { /* ignore */ }
        },
        () => {
          try {
            logRequest(method, url, 0, performance.now() - started, false, "");
          } catch (e) { /* ignore */ }
        }
      );
      return promise;
    };
  }

  // ----- XMLHttpRequest patch -----
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const proto = XHR.prototype;
    const nativeOpen = proto.open;
    const nativeSend = proto.send;
    const nativeAbort = proto.abort;
    const nativeGetHeader = proto.getResponseHeader;
    const nativeGetAllHeaders = proto.getAllResponseHeaders;

    function defineRm(x, name, value) {
      try {
        Object.defineProperty(x, name, {
          value,
          writable: true,
          configurable: true,
          enumerable: false
        });
      } catch (e) { /* ignore */ }
    }

    function fireXhrEvent(x, type) {
      try {
        x.dispatchEvent(new Event(type));
      } catch (e) { /* ignore */ }
    }

    function resetRmState(x) {
      if (x.__rmTimer) clearTimeout(x.__rmTimer);
      if (x.__rmTimeoutTimer) clearTimeout(x.__rmTimeoutTimer);
      x.__rmTimer = null;
      x.__rmTimeoutTimer = null;
      x.__rmSent = false;
      x.__rmStarted = null;
      x.__rmAborted = false;
      x.__rmTimedOut = false;
      x.__rmMocked = false;
      x.__rmHeaders = {};
    }

    proto.open = function open(method, url) {
      resetRmState(this);
      this.__rmMethod = String(method || "GET").toUpperCase();
      try {
        this.__rmUrl = new URL(url, window.location.href).href;
      } catch (e) {
        this.__rmUrl = String(url);
      }
      return nativeOpen.apply(this, arguments);
    };

    proto.send = function send() {
      if (this.__rmSent) {
        throw new DOMException("XMLHttpRequest: send() has already been called on this object.", "InvalidStateError");
      }
      this.__rmSent = true;
      const url = this.__rmUrl || "";
      const method = this.__rmMethod || "GET";
      const started = performance.now();
      const rule = url ? findRule(url, method) : null;

      if (rule && !netAttached) {
        this.__rmStarted = started;
        const status = Number.isInteger(rule.status) && rule.status >= 200 && rule.status <= 599 ? rule.status : 200;
        const statusText = rule.statusText || defaultStatusText(status);
        const fullBody = rule.body == null ? "" : String(rule.body);
        const isNullBody = status === 204 || status === 205 || status === 304;
        const isHead = method === "HEAD";
        const body = isNullBody || isHead ? "" : fullBody;
        const headers = {};
        if (rule.contentType) headers["content-type"] = rule.contentType;
        if (isHead && !isNullBody) {
          headers["content-length"] = String(new TextEncoder().encode(fullBody).length);
        } else if (!isNullBody && !isHead) {
          headers["content-length"] = String(new TextEncoder().encode(body).length);
        }

        const finishTimeout = () => {
          if (this.__rmTimer) {
            clearTimeout(this.__rmTimer);
            this.__rmTimer = null;
          }
          this.__rmTimeoutTimer = null;
          this.__rmTimedOut = true;
          this.__rmMocked = true;
          defineRm(this, "readyState", 4);
          defineRm(this, "status", 0);
          defineRm(this, "statusText", "");
          defineRm(this, "response", null);
          defineRm(this, "responseText", "");
          this.__rmHeaders = {};
          fireXhrEvent(this, "timeout");
          fireXhrEvent(this, "error");
          fireXhrEvent(this, "loadend");
          logRequest(method, url, 0, performance.now() - started, true, "");
        };

        const apply = () => {
          if (this.__rmAborted || this.__rmTimedOut) return;
          this.__rmTimer = null;
          if (this.__rmTimeoutTimer) {
            clearTimeout(this.__rmTimeoutTimer);
            this.__rmTimeoutTimer = null;
          }
          this.__rmMocked = true;
          let responseValue = body;
          let responseTextValue = body;
          if (isNullBody) {
            responseValue = null;
            responseTextValue = "";
          } else {
            const rt = this.responseType || "";
            if (rt === "json") {
              try {
                responseValue = JSON.parse(body);
              } catch (e) {
                responseValue = null;
              }
              responseTextValue = "";
            } else if (rt === "blob") {
              responseValue = new Blob([body], { type: rule.contentType || "" });
              responseTextValue = "";
            } else if (rt === "arraybuffer") {
              responseValue = new TextEncoder().encode(body).buffer;
              responseTextValue = "";
            }
          }
          defineRm(this, "readyState", 2);
          fireXhrEvent(this, "readystatechange");
          defineRm(this, "readyState", 3);
          fireXhrEvent(this, "readystatechange");
          defineRm(this, "readyState", 4);
          defineRm(this, "status", status);
          defineRm(this, "statusText", statusText);
          defineRm(this, "response", responseValue);
          defineRm(this, "responseText", responseTextValue);
          defineRm(this, "responseURL", url);
          this.__rmHeaders = headers;
          fireXhrEvent(this, "load");
          fireXhrEvent(this, "loadend");
          logRequest(method, url, status, performance.now() - started, true, statusText);
        };

        const delay = Math.max(0, Math.min(Math.floor(rule.delay || 0), MAX_DELAY_MS));
        this.__rmTimer = setTimeout(apply, delay);
        if (this.timeout > 0) {
          this.__rmTimeoutTimer = setTimeout(finishTimeout, this.timeout);
        }
        return;
      }

      this.addEventListener("loadend", () => {
        try {
          logRequest(method, url, this.status, performance.now() - started, !!rule, this.statusText);
        } catch (e) { /* ignore */ }
      }, { once: true });
      return nativeSend.apply(this, arguments);
    };

    proto.abort = function abort() {
      try {
        if (this.__rmTimer || this.__rmTimeoutTimer) {
          if (this.__rmTimer) {
            clearTimeout(this.__rmTimer);
            this.__rmTimer = null;
          }
          if (this.__rmTimeoutTimer) {
            clearTimeout(this.__rmTimeoutTimer);
            this.__rmTimeoutTimer = null;
          }
          this.__rmAborted = true;
          this.__rmMocked = true;
          defineRm(this, "readyState", 0);
          defineRm(this, "status", 0);
          defineRm(this, "statusText", "");
          defineRm(this, "response", null);
          defineRm(this, "responseText", "");
          this.__rmHeaders = {};
          fireXhrEvent(this, "abort");
          fireXhrEvent(this, "loadend");
          logRequest(
            this.__rmMethod || "GET",
            this.__rmUrl || "",
            0,
            performance.now() - (this.__rmStarted || performance.now()),
            true,
            ""
          );
          return;
        }
      } catch (e) { /* ignore */ }
      return nativeAbort.apply(this, arguments);
    };

    proto.getResponseHeader = function getResponseHeader(name) {
      if (this.__rmMocked) {
        const h = this.__rmHeaders || {};
        const v = h[String(name).toLowerCase()];
        return v === undefined ? null : v;
      }
      return nativeGetHeader.apply(this, arguments);
    };

    proto.getAllResponseHeaders = function getAllResponseHeaders() {
      if (this.__rmMocked) {
        const h = this.__rmHeaders || {};
        return Object.keys(h).map((k) => k + ": " + h[k]).join("\r\n") + "\r\n";
      }
      return nativeGetAllHeaders.apply(this, arguments);
    };
  }
})();
