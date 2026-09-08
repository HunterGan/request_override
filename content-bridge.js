(() => {
  "use strict";

  const SOURCE = "__REQUEST_OVERRIDE__";
  const FROM_BRIDGE = `${SOURCE}.bridge`;
  const FROM_MAIN = `${SOURCE}.main`;
  const TOKEN_ATTRIBUTE = "data-request-override";
  const LOG_EVENT = "__request_override_response_log__";
  const MAX_LOGS = 200;
  const token = `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
  const logs = [];
  const recentMainLogs = new Map();
  const observedTimings = new Set();
  let context = { tabId: null, pageUrl: location.href, pageOrigin: location.origin };

  function publishToken() {
    try {
      if (!document.documentElement) return false;
      document.documentElement.setAttribute(TOKEN_ATTRIBUTE, token);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function post(type, payload) {
    try {
      window.postMessage({ source: FROM_BRIDGE, type, token, ...payload }, "*");
    } catch (_error) { /* page is unloading */ }
  }

  async function loadContext() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "rm-context" });
      if (response) context = { ...context, ...response };
    } catch (_error) { /* service worker unavailable */ }
    post("context", { context });
  }

  function sendSettings(rules, overridesEnabled) {
    post("settings", {
      rules: Array.isArray(rules) ? rules : [],
      overridesEnabled: overridesEnabled !== false,
      context
    });
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get(["rm_rules", "rm_overrides_enabled"]);
      sendSettings(stored.rm_rules || [], stored.rm_overrides_enabled !== false);
    } catch (_error) {
      sendSettings([], true);
    }
  }

  async function loadNetworkStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "rm-net-status" });
      if (response) post("netstatus", { attached: response.attached === true });
    } catch (_error) {
      post("netstatus", { attached: false });
    }
  }

  function storeLog(entry, source) {
    if (!entry || !entry.url) return;
    const existingIndex = logs.findIndex((candidate) => candidate.id && candidate.id === entry.id);
    if (existingIndex >= 0) {
      logs[existingIndex] = entry;
      return;
    }
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    if (source === "main") recentMainLogs.set(String(entry.url), Date.now());
    try {
      const result = chrome.runtime.sendMessage({ type: "rm-log", entry });
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (_error) { /* extension context is unloading */ }
  }

  function observeResource(entry) {
    if (!entry || !["fetch", "xmlhttprequest"].includes(entry.initiatorType)) return;
    const key = `${entry.name}|${entry.startTime}|${entry.initiatorType}`;
    if (observedTimings.has(key)) return;
    observedTimings.add(key);
    setTimeout(() => {
      const lastMainLog = recentMainLogs.get(String(entry.name)) || 0;
      if (Date.now() - lastMainLog < 2000) return;
      storeLog({
        id: `timing:${key}`,
        ts: Math.round((performance.timeOrigin || Date.now()) + entry.startTime),
        method: "GET",
        url: String(entry.name),
        status: Number(entry.responseStatus) || 0,
        statusText: "",
        durationMs: Math.max(0, Math.round(entry.duration || 0)),
        mocked: false,
        mode: "native",
        frame: window.top === window ? "top" : "child"
      }, "timing");
    }, 500);
  }

  try {
    const observer = new PerformanceObserver((list) => list.getEntries().forEach(observeResource));
    observer.observe({ type: "resource", buffered: true });
  } catch (_error) { /* Resource Timing is unavailable */ }

  function initializeBridge() {
    if (!publishToken()) return false;
    void loadContext().then(loadSettings);
    void loadNetworkStatus();
    return true;
  }

  if (!initializeBridge()) document.addEventListener("DOMContentLoaded", initializeBridge, { once: true });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== "object" || data.source !== FROM_MAIN) return;
    if (data.type === "hello") {
      void loadContext().then(loadSettings);
      void loadNetworkStatus();
      return;
    }
    if (data.type === "log" && data.entry) {
      storeLog(data.entry, "main");
    }
  });

  window.addEventListener(LOG_EVENT, (event) => {
    if (event && event.detail) storeLog(event.detail, "main");
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") return undefined;
    if (message.type === "rm-settings") {
      sendSettings(message.rules, message.overridesEnabled);
    } else if (message.type === "rm-net-status-tab") {
      post("netstatus", { attached: message.attached === true });
    } else if (message.type === "rm-get-logs") {
      sendResponse({ entries: logs.slice() });
      return true;
    } else if (message.type === "rm-clear-logs") {
      logs.length = 0;
      sendResponse({ ok: true });
      return true;
    }
    return undefined;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.rm_rules || changes.rm_overrides_enabled) void loadSettings();
  });

})();
