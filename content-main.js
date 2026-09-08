(() => {
  "use strict";
  if (window.__requestOverrideInstalled) return;
  window.__requestOverrideInstalled = true;

  const Shared = window.RequestOverrideShared;
  if (!Shared) return;
  const SOURCE = "__REQUEST_OVERRIDE__";
  const FROM_BRIDGE = `${SOURCE}.bridge`;
  const FROM_MAIN = `${SOURCE}.main`;
  const TOKEN_ATTRIBUTE = "data-request-override";
  const FRAME_UID = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  const regexCache = new Map();
  let rules = [];
  let overridesEnabled = true;
  let netAttached = false;
  let logSequence = 0;
  let context = { tabId: null, pageUrl: location.href, pageOrigin: location.origin };
  let topFrame = true;
  try { topFrame = window.top === window; } catch (_error) { /* cross-origin frame */ }

  function postLog(entry) {
    try {
      window.postMessage({ source: FROM_MAIN, type: "log", entry }, "*");
    } catch (_error) { /* page is unloading */ }
  }

  function logRequest(method, url, status, durationMs, mocked, statusText, mode, ruleId) {
    postLog(Shared.normalizeLog({
      id: `${Date.now()}:${++logSequence}:${FRAME_UID}`,
      frame: topFrame ? "top" : "child",
      ts: Date.now(),
      method,
      url,
      status,
      statusText,
      durationMs,
      mocked,
      mode,
      ruleId
    }));
  }

  function findRule(url, method) {
    if (!overridesEnabled) return null;
    return Shared.findMatchingRule(rules, url, method, context, regexCache);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== "object" || data.source !== FROM_BRIDGE) return;
    const token = document.documentElement && document.documentElement.getAttribute(TOKEN_ATTRIBUTE);
    if (!token || token !== data.token) return;
    if (data.type === "settings") {
      rules = Shared.normalizeRules(data.rules);
      overridesEnabled = data.overridesEnabled !== false;
      if (data.context) context = { ...context, ...data.context };
      regexCache.clear();
    } else if (data.type === "context" && data.context) {
      context = { ...context, ...data.context };
    } else if (data.type === "netstatus") {
      netAttached = data.attached === true;
    }
  });

  window.postMessage({ source: FROM_MAIN, type: "hello" }, "*");
  if (!document.documentElement) {
    document.addEventListener("DOMContentLoaded", () => {
      window.postMessage({ source: FROM_MAIN, type: "hello" }, "*");
    }, { once: true });
  }

  function parseFetchArguments(input, init) {
    let url = "";
    let method = "GET";
    try {
      if (typeof Request !== "undefined" && input instanceof Request) {
        url = input.url;
        method = input.method || "GET";
      } else if (typeof input === "string" || (typeof URL !== "undefined" && input instanceof URL)) {
        url = new URL(input, location.href).href;
      } else {
        url = String(input);
      }
    } catch (_error) {
      url = String(input);
    }
    if (init && typeof init === "object" && init.method) method = init.method;
    return { url, method: String(method || "GET").toUpperCase() };
  }

  function createMockResponse(rule, url, method) {
    const nullBody = Shared.NULL_BODY_STATUSES.has(rule.status);
    const fullBody = rule.body || "";
    const isHead = method === "HEAD";
    const body = nullBody || isHead ? "" : fullBody;
    const headers = new Headers();
    if (rule.contentType) headers.set("Content-Type", rule.contentType);
    if (!nullBody) headers.set("Content-Length", String(new TextEncoder().encode(isHead ? fullBody : body).length));
    const response = new Response(nullBody ? null : body, {
      status: rule.status,
      statusText: rule.statusText || Shared.defaultStatusText(rule.status),
      headers
    });
    try { Object.defineProperty(response, "url", { value: url, configurable: true }); } catch (_error) { /* optional parity */ }
    return response;
  }

  function abortError() {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  const nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  if (nativeFetch) {
    window.fetch = function requestOverrideFetch(input, init) {
      const { url, method } = parseFetchArguments(input, init);
      const startedAt = performance.now();
      const rule = findRule(url, method);
      if (rule && !netAttached) {
        return (async () => {
          const signal = (init && init.signal) || (typeof Request !== "undefined" && input instanceof Request ? input.signal : null);
          if (signal && signal.aborted) throw abortError();
          if (rule.delayMs > 0) {
            await new Promise((resolve, reject) => {
              let onAbort = null;
              const timer = setTimeout(() => {
                if (signal && onAbort) signal.removeEventListener("abort", onAbort);
                resolve();
              }, rule.delayMs);
              if (signal) {
                onAbort = () => {
                  clearTimeout(timer);
                  signal.removeEventListener("abort", onAbort);
                  reject(abortError());
                };
                signal.addEventListener("abort", onAbort, { once: true });
              }
            });
          }
          const response = createMockResponse(rule, url, method);
          logRequest(method, url, response.status, performance.now() - startedAt, true, response.statusText, "in-page", rule.id);
          return response;
        })();
      }

      const promise = nativeFetch(input, init);
      promise.then(
        (response) => {
          const mocked = !!rule && netAttached && response.status === rule.status;
          logRequest(
            method,
            url,
            response.status,
            performance.now() - startedAt,
            mocked,
            response.statusText,
            mocked ? "network" : "native",
            mocked ? rule.id : null
          );
        },
        () => logRequest(method, url, 0, performance.now() - startedAt, false, "", "native", null)
      );
      return promise;
    };
  }

  const XHR = window.XMLHttpRequest;
  if (!XHR) return;
  const prototype = XHR.prototype;
  const nativeOpen = prototype.open;
  const nativeSend = prototype.send;
  const nativeAbort = prototype.abort;
  const nativeGetResponseHeader = prototype.getResponseHeader;
  const nativeGetAllResponseHeaders = prototype.getAllResponseHeaders;
  const overriddenProperties = ["readyState", "status", "statusText", "response", "responseText", "responseURL"];

  function defineValue(xhr, name, value) {
    try {
      Object.defineProperty(xhr, name, { value, writable: true, configurable: true });
    } catch (_error) { /* browser-specific descriptor */ }
  }

  function clearValues(xhr) {
    for (const property of overriddenProperties) {
      try { delete xhr[property]; } catch (_error) { /* ignore */ }
    }
  }

  function fire(xhr, type) {
    try { xhr.dispatchEvent(new Event(type)); } catch (_error) { /* ignore */ }
  }

  function resetState(xhr) {
    if (xhr.__roTimer) clearTimeout(xhr.__roTimer);
    if (xhr.__roTimeoutTimer) clearTimeout(xhr.__roTimeoutTimer);
    clearValues(xhr);
    xhr.__roTimer = null;
    xhr.__roTimeoutTimer = null;
    xhr.__roSent = false;
    xhr.__roStartedAt = null;
    xhr.__roAborted = false;
    xhr.__roTimedOut = false;
    xhr.__roMocked = false;
    xhr.__roHeaders = {};
  }

  prototype.open = function requestOverrideOpen(method, url) {
    resetState(this);
    this.__roMethod = String(method || "GET").toUpperCase();
    try { this.__roUrl = new URL(url, location.href).href; } catch (_error) { this.__roUrl = String(url); }
    return nativeOpen.apply(this, arguments);
  };

  prototype.send = function requestOverrideSend() {
    if (this.__roSent) throw new DOMException("XMLHttpRequest send() has already been called.", "InvalidStateError");
    const url = this.__roUrl || "";
    const method = this.__roMethod || "GET";
    const startedAt = performance.now();
    const rule = url ? findRule(url, method) : null;
    this.__roSent = true;

    if (rule && !netAttached) {
      this.__roStartedAt = startedAt;
      const nullBody = Shared.NULL_BODY_STATUSES.has(rule.status);
      const isHead = method === "HEAD";
      const fullBody = rule.body || "";
      const body = nullBody || isHead ? "" : fullBody;
      const headers = {};
      if (rule.contentType) headers["content-type"] = rule.contentType;
      if (!nullBody) headers["content-length"] = String(new TextEncoder().encode(isHead ? fullBody : body).length);

      const finishTimeout = () => {
        if (this.__roTimer) clearTimeout(this.__roTimer);
        this.__roTimer = null;
        this.__roTimeoutTimer = null;
        this.__roTimedOut = true;
        this.__roMocked = true;
        defineValue(this, "readyState", 4);
        defineValue(this, "status", 0);
        defineValue(this, "statusText", "");
        defineValue(this, "response", null);
        defineValue(this, "responseText", "");
        this.__roHeaders = {};
        fire(this, "readystatechange");
        fire(this, "timeout");
        fire(this, "loadend");
        logRequest(method, url, 0, performance.now() - startedAt, true, "", "in-page", rule.id);
      };

      const applyMock = () => {
        if (this.__roAborted || this.__roTimedOut) return;
        this.__roTimer = null;
        if (this.__roTimeoutTimer) clearTimeout(this.__roTimeoutTimer);
        this.__roTimeoutTimer = null;
        this.__roMocked = true;
        let response = body;
        let responseText = body;
        if (nullBody) {
          response = null;
          responseText = "";
        } else if (this.responseType === "json") {
          try { response = JSON.parse(body); } catch (_error) { response = null; }
          responseText = "";
        } else if (this.responseType === "blob") {
          response = new Blob([body], { type: rule.contentType || "" });
          responseText = "";
        } else if (this.responseType === "arraybuffer") {
          response = new TextEncoder().encode(body).buffer;
          responseText = "";
        }
        defineValue(this, "readyState", 2);
        fire(this, "readystatechange");
        defineValue(this, "readyState", 3);
        fire(this, "readystatechange");
        defineValue(this, "readyState", 4);
        defineValue(this, "status", rule.status);
        defineValue(this, "statusText", rule.statusText || Shared.defaultStatusText(rule.status));
        defineValue(this, "response", response);
        defineValue(this, "responseText", responseText);
        defineValue(this, "responseURL", url);
        this.__roHeaders = headers;
        fire(this, "readystatechange");
        fire(this, "load");
        fire(this, "loadend");
        logRequest(method, url, rule.status, performance.now() - startedAt, true, rule.statusText, "in-page", rule.id);
      };

      this.__roTimer = setTimeout(applyMock, rule.delayMs);
      if (this.timeout > 0) this.__roTimeoutTimer = setTimeout(finishTimeout, this.timeout);
      return undefined;
    }

    this.addEventListener("loadend", () => {
      const mocked = !!rule && netAttached && this.status === rule.status;
      logRequest(
        method,
        url,
        this.status,
        performance.now() - startedAt,
        mocked,
        this.statusText,
        mocked ? "network" : "native",
        mocked ? rule.id : null
      );
    }, { once: true });
    try {
      return nativeSend.apply(this, arguments);
    } catch (error) {
      this.__roSent = false;
      throw error;
    }
  };

  prototype.abort = function requestOverrideAbort() {
    if (this.__roTimer || this.__roTimeoutTimer) {
      if (this.__roTimer) clearTimeout(this.__roTimer);
      if (this.__roTimeoutTimer) clearTimeout(this.__roTimeoutTimer);
      this.__roTimer = null;
      this.__roTimeoutTimer = null;
      this.__roAborted = true;
      this.__roMocked = true;
      defineValue(this, "readyState", 0);
      defineValue(this, "status", 0);
      defineValue(this, "statusText", "");
      defineValue(this, "response", null);
      defineValue(this, "responseText", "");
      this.__roHeaders = {};
      fire(this, "readystatechange");
      fire(this, "abort");
      fire(this, "loadend");
      logRequest(this.__roMethod, this.__roUrl, 0, performance.now() - this.__roStartedAt, true, "", "in-page", null);
      return undefined;
    }
    return nativeAbort.apply(this, arguments);
  };

  prototype.getResponseHeader = function requestOverrideGetResponseHeader(name) {
    if (this.__roMocked) {
      const value = this.__roHeaders[String(name).toLowerCase()];
      return value === undefined ? null : value;
    }
    return nativeGetResponseHeader.apply(this, arguments);
  };

  prototype.getAllResponseHeaders = function requestOverrideGetAllResponseHeaders() {
    if (this.__roMocked) {
      const lines = Object.entries(this.__roHeaders).map(([name, value]) => `${name}: ${value}`);
      return lines.length ? `${lines.join("\r\n")}\r\n` : "";
    }
    return nativeGetAllResponseHeaders.apply(this, arguments);
  };
})();
