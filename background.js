const MAX_LOGS = 200;
const MAX_RULES = 100;
const MAX_PATTERN_LEN = 1000;
const MAX_STATUS_TEXT_LEN = 200;
const MAX_CONTENT_TYPE_LEN = 300;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_DELAY_MS = 60000;
const MAX_URL_LOG_LEN = 2000;
const MAX_LOG_TEXT_LEN = 200;
const HTTP_METHODS = new Set(["", "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

const logBuffers = new Map();
const tabStates = new Map();
const pendingRequests = new Map();
const regexCache = new Map();

let rules = [];
let netMode = true;
let maskUrls = false;
let rulesLoaded = false;
const pausedLog = [];
let lastFetchEnable = null;

function pushLogBuffer(tabId, entry) {
  if (tabId == null || !entry || typeof entry !== "object") return;
  let buf = logBuffers.get(tabId);
  if (!buf) {
    buf = [];
    logBuffers.set(tabId, buf);
  }
  buf.push(entry);
  if (buf.length > MAX_LOGS) buf.splice(0, buf.length - MAX_LOGS);
}

function isHttpTab(tab) {
  return !!tab && typeof tab.url === "string" && /^https?:/.test(tab.url);
}

function byteLength(text) {
  try {
    return new TextEncoder().encode(text).length;
  } catch (e) {
    return String(text).length;
  }
}

function safeString(value, maxLen) {
  let s = value == null ? "" : String(value);
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function maskUrlForLog(url) {
  const value = safeString(url, MAX_URL_LOG_LEN);
  if (!maskUrls) return value;
  try {
    const u = new URL(value, window ? window.location.href : undefined);
    if (u.hash) u.hash = "#***";
    if (u.search) {
      u.searchParams.forEach((_, key) => u.searchParams.set(key, "***"));
    }
    return safeString(u.toString(), MAX_URL_LOG_LEN);
  } catch (e) {
    return safeString(value.replace(/([?&][^=#]+)=([^&]*)/g, "$1=***"), MAX_URL_LOG_LEN);
  }
}

function sanitizeLogEntry(entry, tabId, frameId) {
  if (!entry || typeof entry !== "object") return null;
  const id = entry.id != null ? String(entry.id) : "";
  const url = maskUrlForLog(entry.url);
  if (!id || !url) return null;
  let status = Number(entry.status);
  if (!Number.isFinite(status) || status < 0 || status > 599) status = 0;
  return {
    id,
    ts: Number.isFinite(Number(entry.ts)) ? Number(entry.ts) : Date.now(),
    method: safeString(entry.method || "GET", 16).toUpperCase(),
    url,
    status,
    statusText: safeString(entry.statusText, MAX_LOG_TEXT_LEN),
    duration: Math.max(0, Math.round(Number(entry.duration) || 0)),
    mocked: !!entry.mocked,
    frame: safeString(entry.frame, 16),
    tabId: tabId != null ? tabId : null,
    frameId: frameId != null ? frameId : null
  };
}

async function getRules() {
  const res = await chrome.storage.local.get("rm_rules");
  return Array.isArray(res && res.rm_rules) ? res.rm_rules : [];
}

async function getNetMode() {
  const res = await chrome.storage.local.get("rm_net_mode");
  return res.rm_net_mode !== false;
}

async function getMaskUrls() {
  const res = await chrome.storage.local.get("rm_mask_urls");
  return res.rm_mask_urls === true;
}

function normalizeRule(r) {
  const raw = r || {};
  let status = Number(raw.status);
  if (!Number.isInteger(status) || status < 200 || status > 599) status = 200;
  let delay = Number(raw.delay);
  if (!Number.isFinite(delay) || delay < 0) delay = 0;
  delay = Math.min(Math.floor(delay), MAX_DELAY_MS);

  const id = safeString(raw.id, 128) || "r_" + Date.now() + "_" + Math.random().toString(16).slice(2, 8);
  let urlPattern = safeString(raw.urlPattern, MAX_PATTERN_LEN);
  let method = String(raw.method || "").toUpperCase();
  if (!HTTP_METHODS.has(method)) method = "";
  let body = raw.body == null ? "" : (typeof raw.body === "string" ? raw.body : JSON.stringify(raw.body));
  if (byteLength(body) > MAX_BODY_BYTES) body = "";

  return {
    id,
    enabled: raw.enabled !== false,
    urlPattern,
    matchType: raw.matchType === "regex" ? "regex" : "substring",
    method,
    status,
    statusText: safeString(raw.statusText, MAX_STATUS_TEXT_LEN),
    contentType: safeString(raw.contentType, MAX_CONTENT_TYPE_LEN),
    body,
    delay
  };
}

function normalizeRules(rawRules) {
  if (!Array.isArray(rawRules)) return [];
  return rawRules.slice(0, MAX_RULES).map(normalizeRule);
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

function hasActiveRules() {
  return rules.some((r) => r && r.enabled !== false);
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function broadcastNetStatus(tabId) {
  if (tabId == null) return;
  const st = tabStates.get(tabId);
  const attached = !!st && st.attached && st.fetchEnabled;
  const error = st ? (st.error || null) : null;
  try {
    const p = chrome.tabs.sendMessage(tabId, { type: "rm-net-status-tab", attached, error });
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) { /* no bridge in this tab */ }
  try {
    const p = chrome.runtime.sendMessage({ type: "rm-net-status", tabId, attached, error });
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) { /* side panel not open */ }
}

async function ensureRulesLoaded() {
  if (rulesLoaded) return;
  rules = normalizeRules(await getRules());
  rulesLoaded = true;
}

function getTabState(tabId) {
  let st = tabStates.get(tabId);
  if (!st) {
    st = {
      attached: false,
      fetchEnabled: false,
      error: null,
      updatedAt: 0,
      lock: Promise.resolve()
    };
    tabStates.set(tabId, st);
  }
  return st;
}

function setTabState(tabId, patch) {
  const st = getTabState(tabId);
  Object.assign(st, patch, { updatedAt: Date.now() });
  return st;
}

function isNetworkReady(tabId) {
  const st = tabStates.get(tabId);
  return !!st && st.attached && st.fetchEnabled;
}

async function withTabLock(tabId, fn) {
  const st = getTabState(tabId);
  const prev = st.lock || Promise.resolve();
  let release;
  st.lock = new Promise((resolve) => {
    release = resolve;
  });
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
  }
}

function addPausedEntry(entry) {
  if (!entry) return;
  pausedLog.push(entry);
  if (pausedLog.length > 25) pausedLog.shift();
}

function pendingKey(tabId, requestId) {
  return tabId + ":" + requestId;
}

function cancelPendingRequestsForTab(tabId, markCanceled) {
  for (const [key, info] of Array.from(pendingRequests.entries())) {
    if (String(info.tabId) !== String(tabId)) continue;
    pendingRequests.delete(key);
    if (info.timer) clearTimeout(info.timer);
    info.timer = null;
    info.settled = true;
    if (markCanceled && info.entry && info.entry.result === "pending") {
      info.entry.result = "canceled";
    }
  }
}

function recheckPendingRequests() {
  for (const info of Array.from(pendingRequests.values())) {
    if (info.timer) {
      clearTimeout(info.timer);
      info.timer = null;
    }
    if (!info.settled) runSettle(info);
  }
}

function reqHeaderValue(req, name) {
  const headers = (req && req.headers) || {};
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return null;
}

function corsResponseHeaders(req) {
  const origin = reqHeaderValue(req, "origin");
  const headers = [];
  if (origin) {
    headers.push({ name: "Access-Control-Allow-Origin", value: origin });
    if (reqHeaderValue(req, "cookie")) {
      headers.push({ name: "Access-Control-Allow-Credentials", value: "true" });
    }
  } else {
    headers.push({ name: "Access-Control-Allow-Origin", value: "*" });
  }
  return headers;
}

async function enableFetchDomainLocked(tabId) {
  const st = getTabState(tabId);
  if (!st.attached) {
    setTabState(tabId, { fetchEnabled: false, error: "not attached" });
    return false;
  }
  try {
    await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
      patterns: [{ urlPattern: "*" }]
    });
    lastFetchEnable = { ts: Date.now(), ok: true, error: null };
    setTabState(tabId, { fetchEnabled: true, error: null });
    return true;
  } catch (e) {
    const msg = String((e && e.message) || e);
    lastFetchEnable = { ts: Date.now(), ok: false, error: msg };
    setTabState(tabId, { fetchEnabled: false, error: msg });
    return false;
  }
}

async function attachToTabLocked(tabId) {
  const st = getTabState(tabId);
  if (st.attached && st.fetchEnabled) return true;
  if (!st.attached) {
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      setTabState(tabId, { attached: true, error: null });
    } catch (e) {
      const msg = String((e && e.message) || e);
      setTabState(tabId, { attached: false, fetchEnabled: false, error: msg });
      return false;
    }
  }
  const ok = await enableFetchDomainLocked(tabId);
  if (!ok) {
    await detachFromTabLocked(tabId, true);
    return false;
  }
  return true;
}

async function detachFromTabLocked(tabId, keepError) {
  const st = getTabState(tabId);
  const hadState = st.attached || st.fetchEnabled;
  cancelPendingRequestsForTab(tabId, true);
  setTabState(tabId, {
    attached: false,
    fetchEnabled: false,
    error: keepError ? (st.error || null) : null
  });
  if (hadState) {
    try {
      await chrome.debugger.detach({ tabId });
    } catch (e) { /* already detached */ }
  }
}

async function attachToTab(tabId) {
  if (tabId == null) return false;
  return withTabLock(tabId, async () => {
    const ok = await attachToTabLocked(tabId);
    broadcastNetStatus(tabId);
    return ok;
  });
}

async function detachFromTab(tabId) {
  if (tabId == null) return;
  return withTabLock(tabId, async () => {
    await detachFromTabLocked(tabId, false);
    broadcastNetStatus(tabId);
  });
}

async function enableFetchDomain(tabId) {
  if (tabId == null) return false;
  return withTabLock(tabId, async () => {
    const ok = await enableFetchDomainLocked(tabId);
    if (!ok) {
      await detachFromTabLocked(tabId, true);
    }
    broadcastNetStatus(tabId);
    return ok;
  });
}

async function handlePausedRequest(tabId, params) {
  const req = params && params.request;
  const requestId = params && params.requestId;
  if (!req || requestId == null) return;

  const networkReady = isNetworkReady(tabId);
  if (!networkReady) {
    try {
      const p = chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", { requestId });
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) { /* request is already gone */ }
    return;
  }

  // A freshly (re)started worker may receive a paused request before init()
  // finished loading rules. Make sure we match against current rules, not [].
  try {
    await ensureRulesLoaded();
  } catch (e) { /* keep whatever rules we already have */ }
  const url = String(req.url || "");
  const method = String(req.method || "GET").toUpperCase();
  const rule = findRule(url, method);
  const isPreflight = method === "OPTIONS" && !!reqHeaderValue(req, "access-control-request-method");

  const entry = {
    ts: Date.now(),
    url,
    method,
    ruleId: rule ? rule.id : null,
    ruleStatus: rule ? rule.status : null,
    rulesCount: rules.length,
    action: rule ? "fulfill" : (isPreflight ? "fulfill-preflight" : "continue"),
    result: "pending"
  };
  addPausedEntry(entry);

  const info = {
    tabId,
    requestId,
    req,
    entry,
    timer: null,
    settled: false
  };
  const key = pendingKey(tabId, requestId);
  pendingRequests.set(key, info);

  const run = () => {
    if (info.settled) return;
    if (info.timer) {
      clearTimeout(info.timer);
      info.timer = null;
    }
    runSettle(info);
  };

  const delay = rule && rule.delay > 0 ? Math.min(rule.delay, MAX_DELAY_MS) : 0;
  if (delay > 0) {
    info.timer = setTimeout(run, delay);
  } else {
    run();
  }
}

async function runSettle(info) {
  const { tabId, requestId, req, entry } = info;
  if (info.settled) return;
  info.settled = true;
  pendingRequests.delete(pendingKey(tabId, requestId));

  try {
    const url = String((req && req.url) || "");
    const method = String((req && req.method) || "GET").toUpperCase();
    const rule = findRule(url, method);
    const isPreflight = method === "OPTIONS" && !!reqHeaderValue(req, "access-control-request-method");

    let action = "continue";
    let command;
    let params;
    if (rule) {
      action = "fulfill";
      const status = Number.isInteger(rule.status) && rule.status >= 200 && rule.status <= 599 ? rule.status : 200;
      const fullBody = rule.body == null ? "" : String(rule.body);
      const isNullBody = status === 204 || status === 205 || status === 304;
      const body = isNullBody || method === "HEAD" ? "" : fullBody;
      const responseHeaders = [];
      if (rule.contentType) responseHeaders.push({ name: "Content-Type", value: rule.contentType });
      if (!isNullBody && method !== "HEAD") {
        responseHeaders.push({
          name: "Content-Length",
          value: String(new TextEncoder().encode(body).length)
        });
      }
      responseHeaders.push(...corsResponseHeaders(req));
      command = "Fetch.fulfillRequest";
      params = {
        requestId,
        responseCode: status,
        responseHeaders,
        responsePhrase: rule.statusText || "",
        body: toBase64(body)
      };
    } else if (isPreflight) {
      action = "fulfill-preflight";
      const responseHeaders = corsResponseHeaders(req);
      responseHeaders.push(
        {
          name: "Access-Control-Allow-Methods",
          value: reqHeaderValue(req, "access-control-request-method") || "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD"
        },
        {
          name: "Access-Control-Allow-Headers",
          value: reqHeaderValue(req, "access-control-request-headers") || "*"
        },
        { name: "Access-Control-Max-Age", value: "86400" }
      );
      command = "Fetch.fulfillRequest";
      params = {
        requestId,
        responseCode: 204,
        responseHeaders,
        body: ""
      };
    } else {
      command = "Fetch.continueRequest";
      params = { requestId };
    }

    entry.action = action;
    entry.ruleId = rule ? rule.id : null;
    entry.ruleStatus = rule ? rule.status : null;

    const promise = chrome.debugger.sendCommand({ tabId }, command, params);
    if (promise && typeof promise.then === "function") {
      await promise;
    }
    entry.result = "ok";
  } catch (e) {
    const msg = String((e && e.message) || e);
    entry.result = "error: " + msg;
    // If fulfilling the mock failed, try to continue the original request
    // so the page does not hang on a paused request.
    try {
      const p = chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", { requestId });
      if (p && typeof p.then === "function") {
        await p;
        entry.result = "fallback-continue after: " + msg;
      }
    } catch (e2) {
      entry.result = "error: " + msg + " | continue: " + String((e2 && e2.message) || e2);
    }
  }
}

async function syncTab(tab) {
  const tabId = tab.id;
  const ok = await attachToTab(tabId);
  if (!ok) await detachFromTab(tabId);
  broadcastNetStatus(tabId);
  return ok;
}

async function syncAllTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (e) {
    return;
  }
  const active = netMode && hasActiveRules();
  for (const tab of tabs) {
    if (!tab || tab.id == null) continue;
    if (active && isHttpTab(tab)) {
      await syncTab(tab);
    } else {
      await detachFromTab(tab.id);
      if (isHttpTab(tab)) broadcastNetStatus(tab.id);
    }
  }
}

async function updateBadge() {
  try {
    const stored = await getRules();
    const active = stored.filter((r) => r && r.enabled).length;
    await chrome.action.setBadgeText({ text: active ? String(active) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });
  } catch (e) { /* ignore */ }
}

async function broadcastRules() {
  try {
    const rules = await getRules();
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || typeof tab.url !== "string" || !/^https?:/.test(tab.url)) continue;
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "rm-rules", rules });
      } catch (e) { /* no bridge in this tab */ }
    }
  } catch (e) { /* ignore */ }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  logBuffers.delete(tabId);
  tabStates.delete(tabId);
  cancelPendingRequestsForTab(tabId, true);
  try {
    const p = chrome.debugger.detach({ tabId });
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) { /* ignore */ }
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info || (info.status !== "loading" && info.status !== "complete")) return;
  if (!isHttpTab(tab)) return;
  const st = tabStates.get(tabId);
  if (st && st.attached) {
    enableFetchDomain(tabId);
  } else if (netMode && hasActiveRules()) {
    syncTab(tab);
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!source || source.tabId == null) return;
  if (method === "Fetch.requestPaused") handlePausedRequest(source.tabId, params);
});

chrome.debugger.onDetach.addListener((source) => {
  if (!source || source.tabId == null) return;
  const st = tabStates.get(source.tabId);
  if (st && (st.attached || st.fetchEnabled)) {
    setTabState(source.tabId, { attached: false, fetchEnabled: false, error: null });
    cancelPendingRequestsForTab(source.tabId, true);
    broadcastNetStatus(source.tabId);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  syncAllTabs();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  let sync = false;
  if (changes.rm_rules) {
    rules = normalizeRules(changes.rm_rules.newValue);
    rulesLoaded = true;
    regexCache.clear();
    recheckPendingRequests();
    updateBadge();
    broadcastRules();
    sync = true;
  }
  if (changes.rm_net_mode) {
    netMode = changes.rm_net_mode.newValue !== false;
    sync = true;
  }
  if (changes.rm_mask_urls) {
    maskUrls = changes.rm_mask_urls.newValue === true;
  }
  if (sync) syncAllTabs();
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;
  chrome.sidePanel
    .open({ tabId: tab.id })
    .catch(() => {
      chrome.sidePanel.open().catch(() => {});
    });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "rm-log" && sender.tab && sender.tab.id != null) {
    const sanitized = sanitizeLogEntry(msg.entry, sender.tab.id, sender.tab.frameId);
    if (sanitized) {
      pushLogBuffer(sender.tab.id, sanitized);
      const p = chrome.runtime.sendMessage({
        type: "rm-log",
        entry: sanitized,
        tabId: sender.tab.id
      });
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
    return;
  }

  if (msg.type === "rm-get-logs") {
    (async () => {
      let tab = null;
      try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tab = tabs && tabs[0];
      } catch (e) { /* ignore */ }
      if (!tab || tab.id == null) {
        sendResponse({ entries: [] });
        return;
      }
      const byId = new Map();
      const cached = logBuffers.get(tab.id);
      if (Array.isArray(cached)) {
        for (const e of cached) {
          const entry = sanitizeLogEntry(e, tab.id, e && e.frameId != null ? e.frameId : null);
          if (entry && !byId.has(entry.id)) byId.set(entry.id, entry);
        }
      }
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: "rm-get-logs" });
        if (res && Array.isArray(res.entries)) {
          for (const e of res.entries) {
            const entry = sanitizeLogEntry(e, tab.id, e && e.frameId != null ? e.frameId : null);
            if (entry && !byId.has(entry.id)) byId.set(entry.id, entry);
          }
        }
      } catch (e) { /* no bridge in the active tab */ }
      const entries = Array.from(byId.values());
      entries.sort((a, b) => ((a && a.ts) || 0) - ((b && b.ts) || 0));
      sendResponse({ entries: entries.slice(-MAX_LOGS) });
    })();
    return true;
  }

  if (msg.type === "rm-net-status") {
    (async () => {
      let tabId = null;
      if (sender.tab && sender.tab.id != null) {
        tabId = sender.tab.id;
      } else {
        try {
          const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          const tab = tabs && tabs[0];
          if (tab && tab.id != null) tabId = tab.id;
        } catch (e) { /* ignore */ }
      }
      const st = tabId != null ? tabStates.get(tabId) : null;
      sendResponse({
        tabId: tabId != null ? tabId : null,
        attached: tabId != null && isNetworkReady(tabId),
        error: st ? (st.error || null) : null
      });
    })();
    return true;
  }

  if (msg.type === "rm-diag") {
    const stateSummary = Array.from(tabStates.entries()).map(([tabId, st]) => ({
      tabId,
      attached: !!st.attached,
      fetchEnabled: !!st.fetchEnabled,
      ready: isNetworkReady(tabId),
      error: st.error || null,
      updatedAt: st.updatedAt || null
    }));
    sendResponse({
      networkReadyCount: stateSummary.filter((s) => s.ready).length,
      networkReadyTabIds: stateSummary.filter((s) => s.ready).map((s) => s.tabId),
      tabStates: stateSummary,
      pendingRequests: pendingRequests.size,
      rulesLoaded,
      rulesCount: rules.length,
      rules: rules.map((r) => r && ({
        id: r.id,
        enabled: r.enabled !== false,
        urlPattern: r.urlPattern,
        method: r.method,
        status: r.status
      })),
      lastFetchEnable,
      pausedLog: pausedLog.slice()
    });
    return;
  }

  if (msg.type === "rm-clear-logs") {
    logBuffers.clear();
    (async () => {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: "rm-clear-logs" });
        } catch {}
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
});

(async function init() {
  rules = normalizeRules(await getRules());
  rulesLoaded = true;
  netMode = await getNetMode();
  maskUrls = await getMaskUrls();
  updateBadge();
  syncAllTabs();
})();
