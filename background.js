importScripts("shared.js");

const Shared = globalThis.RequestOverrideShared;
const { LIMITS } = Shared;
const STORAGE_KEYS = ["rm_rules", "rm_schema_version", "rm_net_mode", "rm_mask_urls", "rm_overrides_enabled"];
const logBuffers = new Map();
const tabStates = new Map();
const pendingRequests = new Map();
const observedRequests = new Map();
const pendingResponseCaptures = new Map();
const regexCache = new Map();
const ruleStats = new Map();
const pausedLog = [];

let rules = [];
let rulesLoaded = false;
let netMode = true;
let maskUrls = false;
let overridesEnabled = true;
let lastFetchEnable = null;

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:/i.test(url);
}

function isHttpTab(tab) {
  return !!tab && tab.id != null && isHttpUrl(tab.url);
}

function maskUrlForLog(url) {
  const value = Shared.safeString(url, LIMITS.maxUrlLogLength);
  if (!maskUrls) return value;
  try {
    const parsed = new URL(value);
    if (parsed.hash) parsed.hash = "#***";
    for (const key of Array.from(parsed.searchParams.keys())) parsed.searchParams.set(key, "***");
    return Shared.safeString(parsed.toString(), LIMITS.maxUrlLogLength);
  } catch (_error) {
    return value.replace(/([?&][^=#]+)=([^&]*)/g, "$1=***");
  }
}

function sanitizeLogEntry(entry, tabId, frameId) {
  const normalized = Shared.normalizeLog(entry);
  if (!normalized) return null;
  normalized.url = maskUrlForLog(normalized.url);
  normalized.tabId = tabId == null ? normalized.tabId : Number(tabId);
  normalized.frameId = frameId == null ? normalized.frameId : Number(frameId);
  return normalized;
}

function pushLogBuffer(tabId, entry) {
  if (tabId == null || !entry) return;
  let buffer = logBuffers.get(tabId);
  if (!buffer) {
    buffer = [];
    logBuffers.set(tabId, buffer);
  }
  buffer.push(entry);
  if (buffer.length > LIMITS.maxLogs) buffer.splice(0, buffer.length - LIMITS.maxLogs);
}

function publishLog(tabId, rawEntry, frameId) {
  const entry = sanitizeLogEntry(rawEntry, tabId, frameId);
  if (!entry) return null;
  pushLogBuffer(tabId, entry);
  chrome.runtime.sendMessage({ type: "rm-log-live", entry, tabId }).catch(() => {});
  return entry;
}

function sameCapturedRequest(entry, capture) {
  return entry.method === capture.method &&
    Shared.smartPattern(entry.url) === Shared.smartPattern(capture.url) &&
    Math.abs(entry.ts - capture.ts) < 300000;
}

function applyResponseCapture(tabId, entry, capture) {
  entry.responseCaptured = capture.responseCaptured;
  entry.responseBody = capture.responseBody;
  entry.responseContentType = capture.responseContentType;
  entry.responseBodyTruncated = capture.responseBodyTruncated;
  if (capture.mocked) {
    entry.mocked = true;
    entry.mode = capture.mode;
    entry.ruleId = capture.ruleId;
  }
  chrome.runtime.sendMessage({ type: "rm-log-live", entry, tabId }).catch(() => {});
}

function enrichOrQueueResponseCapture(tabId, capture) {
  chrome.runtime.sendMessage({ type: "rm-log-capture", tabId, capture }).catch(() => {});
  const buffer = logBuffers.get(tabId) || [];
  const entry = buffer.slice().reverse().find((candidate) => !candidate.responseCaptured && sameCapturedRequest(candidate, capture));
  if (entry) {
    applyResponseCapture(tabId, entry, capture);
    return;
  }
  const queue = pendingResponseCaptures.get(tabId) || [];
  queue.push(capture);
  pendingResponseCaptures.set(tabId, queue.slice(-50));
}

function consumeResponseCapture(tabId, entry) {
  const queue = pendingResponseCaptures.get(tabId);
  if (!queue || !queue.length) return;
  const index = queue.findIndex((capture) => sameCapturedRequest(entry, capture));
  if (index < 0) return;
  const [capture] = queue.splice(index, 1);
  if (!queue.length) pendingResponseCaptures.delete(tabId);
  applyResponseCapture(tabId, entry, capture);
}

function observedRequestKey(details) {
  return `${details.tabId}:${details.requestId}`;
}

function beginObservedRequest(details) {
  if (!details || details.tabId < 0) return;
  observedRequests.set(observedRequestKey(details), {
    ts: Number(details.timeStamp) || Date.now(),
    method: String(details.method || "GET").toUpperCase(),
    url: String(details.url || ""),
    tabId: details.tabId,
    frameId: details.frameId
  });
}

function finishObservedRequest(details, failed) {
  if (!details || details.tabId < 0) return;
  const key = observedRequestKey(details);
  const started = observedRequests.get(key) || {
    ts: Number(details.timeStamp) || Date.now(), method: details.method || "GET",
    url: details.url || "", tabId: details.tabId, frameId: details.frameId
  };
  observedRequests.delete(key);
  const endedAt = Number(details.timeStamp) || Date.now();
  const status = failed ? 0 : Number(details.statusCode) || 0;
  const rule = findRule(started.url, started.method, contextForTabId(details.tabId));
  const mocked = !!rule && isNetworkReady(details.tabId) && status === rule.status;
  const entry = publishLog(details.tabId, {
    id: `web:${details.requestId}:${Math.round(started.ts)}`,
    ts: endedAt,
    method: started.method,
    url: started.url,
    status,
    statusText: failed ? String(details.error || "") : Shared.defaultStatusText(status),
    durationMs: Math.max(0, Math.round(endedAt - started.ts)),
    mocked,
    mode: mocked ? "network" : "native",
    ruleId: mocked ? rule.id : null,
    frameId: started.frameId
  }, started.frameId);
  if (entry) consumeResponseCapture(details.tabId, entry);
}

function getTabState(tabId) {
  let state = tabStates.get(tabId);
  if (!state) {
    state = { tabId, url: "", attached: false, fetchEnabled: false, error: null, updatedAt: 0, lock: Promise.resolve() };
    tabStates.set(tabId, state);
  }
  return state;
}

function setTabState(tabId, patch) {
  const state = getTabState(tabId);
  Object.assign(state, patch, { updatedAt: Date.now() });
  return state;
}

function contextForTab(tab) {
  return { tabId: tab && tab.id, pageUrl: tab && tab.url };
}

function contextForTabId(tabId) {
  const state = tabStates.get(tabId);
  return { tabId, pageUrl: state ? state.url : "" };
}

function applicableRules(context) {
  if (!overridesEnabled) return [];
  return rules.filter((rule) => Shared.ruleAppliesToContext(rule, context));
}

function hasApplicableRules(context) {
  return applicableRules(context).length > 0;
}

function findRule(url, method, context) {
  return Shared.findMatchingRule(rules, url, method, context || {}, regexCache);
}

function getRules() {
  return chrome.storage.local.get("rm_rules").then((result) => Shared.normalizeRules(result.rm_rules));
}

async function loadSettingsAndMigrate() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS);
  const rawRules = Array.isArray(stored.rm_rules) ? stored.rm_rules : [];
  const normalized = Shared.normalizeRules(rawRules);
  rules = normalized;
  rulesLoaded = true;
  netMode = stored.rm_net_mode !== false;
  maskUrls = stored.rm_mask_urls === true;
  overridesEnabled = stored.rm_overrides_enabled !== false;
  if (stored.rm_schema_version !== Shared.SCHEMA_VERSION || JSON.stringify(rawRules) !== JSON.stringify(normalized)) {
    await chrome.storage.local.set({ rm_schema_version: Shared.SCHEMA_VERSION, rm_rules: normalized });
  }
}

async function ensureRulesLoaded() {
  if (!rulesLoaded) await loadSettingsAndMigrate();
}

function isNetworkReady(tabId) {
  const state = tabStates.get(tabId);
  return !!state && state.attached && state.fetchEnabled;
}

function networkStatus(tabId) {
  const state = tabStates.get(tabId);
  if (!overridesEnabled) return "paused";
  if (!hasApplicableRules(contextForTabId(tabId))) return "idle";
  if (!netMode) return "fallback";
  if (state && state.error) return /another debugger|already attached|devtools/i.test(state.error) ? "conflict" : "fallback";
  if (isNetworkReady(tabId)) return "active";
  return "starting";
}

async function withTabLock(tabId, task) {
  const state = getTabState(tabId);
  const previous = state.lock || Promise.resolve();
  let release;
  state.lock = new Promise((resolve) => { release = resolve; });
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
  }
}

function pendingKey(tabId, requestId) {
  return `${tabId}:${requestId}`;
}

function addPausedEntry(entry) {
  pausedLog.push(entry);
  if (pausedLog.length > 25) pausedLog.shift();
}

function cancelPendingRequestsForTab(tabId, markCanceled) {
  for (const [key, info] of pendingRequests.entries()) {
    if (info.tabId !== tabId) continue;
    pendingRequests.delete(key);
    if (info.timer) clearTimeout(info.timer);
    info.timer = null;
    info.settled = true;
    if (markCanceled && info.entry.result === "pending") info.entry.result = "canceled";
  }
}

function recheckPendingRequests() {
  for (const info of Array.from(pendingRequests.values())) {
    if (info.timer) clearTimeout(info.timer);
    info.timer = null;
    if (!info.settled) void settlePausedRequest(info);
  }
}

function requestHeader(request, name) {
  const headers = (request && request.headers) || {};
  const target = String(name).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return null;
}

function corsResponseHeaders(request) {
  const origin = requestHeader(request, "origin");
  if (!origin) return [{ name: "Access-Control-Allow-Origin", value: "*" }];
  return [
    { name: "Access-Control-Allow-Origin", value: origin },
    { name: "Access-Control-Allow-Credentials", value: "true" },
    { name: "Vary", value: "Origin" }
  ];
}

function findPreflightRule(request, context) {
  const requestedMethod = requestHeader(request, "access-control-request-method");
  if (!requestedMethod) return null;
  return findRule(String(request.url || ""), String(requestedMethod).toUpperCase(), context);
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function enableFetchDomainLocked(tabId) {
  const state = getTabState(tabId);
  if (!state.attached) return false;
  try {
    await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    lastFetchEnable = { ts: Date.now(), ok: true, error: null };
    setTabState(tabId, { fetchEnabled: true, error: null });
    return true;
  } catch (error) {
    const message = String((error && error.message) || error);
    lastFetchEnable = { ts: Date.now(), ok: false, error: message };
    setTabState(tabId, { fetchEnabled: false, error: message });
    return false;
  }
}

async function attachToTabLocked(tabId) {
  const state = getTabState(tabId);
  if (state.attached && state.fetchEnabled) return true;
  if (!state.attached) {
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      setTabState(tabId, { attached: true, error: null });
    } catch (error) {
      setTabState(tabId, { attached: false, fetchEnabled: false, error: String((error && error.message) || error) });
      return false;
    }
  }
  const enabled = await enableFetchDomainLocked(tabId);
  if (!enabled) await detachFromTabLocked(tabId, true);
  return enabled;
}

async function detachFromTabLocked(tabId, keepError) {
  const state = getTabState(tabId);
  const shouldDetach = state.attached || state.fetchEnabled;
  cancelPendingRequestsForTab(tabId, true);
  setTabState(tabId, { attached: false, fetchEnabled: false, error: keepError ? state.error : null });
  if (shouldDetach) {
    try {
      await chrome.debugger.detach({ tabId });
    } catch (_error) { /* already detached */ }
  }
}

async function attachToTab(tabId) {
  return withTabLock(tabId, async () => {
    const result = await attachToTabLocked(tabId);
    broadcastNetStatus(tabId);
    return result;
  });
}

async function detachFromTab(tabId, keepError) {
  return withTabLock(tabId, async () => {
    await detachFromTabLocked(tabId, keepError === true);
    broadcastNetStatus(tabId);
  });
}

async function continueRequest(tabId, requestId) {
  try {
    await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", { requestId });
  } catch (_error) { /* request is gone */ }
}

function recordRuleHit(ruleId, tabId) {
  if (!ruleId) return;
  const current = ruleStats.get(ruleId) || { count: 0, lastMatchedAt: null };
  current.count += 1;
  current.lastMatchedAt = Date.now();
  ruleStats.set(ruleId, current);
  chrome.runtime.sendMessage({ type: "rm-rule-hit", ruleId, tabId, count: current.count, lastMatchedAt: current.lastMatchedAt }).catch(() => {});
}

async function handlePausedRequest(tabId, params) {
  const request = params && params.request;
  const requestId = params && params.requestId;
  if (!request || requestId == null) return;
  if (!isNetworkReady(tabId)) return continueRequest(tabId, requestId);
  await ensureRulesLoaded().catch(() => {});
  const context = contextForTabId(tabId);
  const method = String(request.method || "GET").toUpperCase();
  const isPreflight = method === "OPTIONS" && !!requestHeader(request, "access-control-request-method");
  const rule = isPreflight ? findPreflightRule(request, context) : findRule(request.url, method, context);
  const entry = {
    ts: Date.now(), tabId, url: String(request.url || ""), method,
    ruleId: rule && rule.id, ruleStatus: rule && rule.status,
    action: rule ? (isPreflight ? "fulfill-preflight" : "fulfill") : "continue", result: "pending"
  };
  addPausedEntry(entry);
  const info = { tabId, requestId, request, entry, timer: null, settled: false };
  pendingRequests.set(pendingKey(tabId, requestId), info);
  const delayMs = !isPreflight && rule ? rule.delayMs : 0;
  if (delayMs > 0) info.timer = setTimeout(() => void settlePausedRequest(info), delayMs);
  else void settlePausedRequest(info);
}

async function settlePausedRequest(info) {
  if (info.settled) return;
  info.settled = true;
  if (info.timer) clearTimeout(info.timer);
  pendingRequests.delete(pendingKey(info.tabId, info.requestId));
  const { tabId, requestId, request, entry } = info;
  const context = contextForTabId(tabId);
  const method = String(request.method || "GET").toUpperCase();
  const isPreflight = method === "OPTIONS" && !!requestHeader(request, "access-control-request-method");
  const rule = isPreflight ? findPreflightRule(request, context) : findRule(request.url, method, context);
  if (!rule || !overridesEnabled) {
    entry.action = "continue";
    await continueRequest(tabId, requestId);
    entry.result = "ok";
    return;
  }
  try {
    if (isPreflight) {
      const requestedMethod = requestHeader(request, "access-control-request-method") || rule.method || "GET";
      const headers = corsResponseHeaders(request);
      headers.push(
        { name: "Access-Control-Allow-Methods", value: requestedMethod },
        { name: "Access-Control-Allow-Headers", value: requestHeader(request, "access-control-request-headers") || "*" },
        { name: "Access-Control-Max-Age", value: "600" }
      );
      await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", {
        requestId, responseCode: 204, responsePhrase: Shared.defaultStatusText(204), responseHeaders: headers, body: ""
      });
      entry.action = "fulfill-preflight";
    } else {
      const status = rule.status;
      const nullBody = Shared.NULL_BODY_STATUSES.has(status);
      const fullBody = rule.body || "";
      const body = nullBody || method === "HEAD" ? "" : fullBody;
      const headers = corsResponseHeaders(request);
      if (rule.contentType) headers.push({ name: "Content-Type", value: rule.contentType });
      if (!nullBody) {
        headers.push({ name: "Content-Length", value: String(new TextEncoder().encode(method === "HEAD" ? fullBody : body).length) });
      }
      await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", {
        requestId,
        responseCode: status,
        responsePhrase: rule.statusText || Shared.defaultStatusText(status),
        responseHeaders: headers,
        body: toBase64(body)
      });
      entry.action = "fulfill";
      recordRuleHit(rule.id, tabId);
    }
    entry.ruleId = rule.id;
    entry.ruleStatus = rule.status;
    entry.result = "ok";
  } catch (error) {
    const message = String((error && error.message) || error);
    entry.result = `error: ${message}`;
    try {
      await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", { requestId });
      entry.result = `fallback-continue after: ${message}`;
    } catch (continueError) {
      entry.result += ` | continue: ${String((continueError && continueError.message) || continueError)}`;
    }
  }
}

async function syncTab(tab) {
  if (!tab || tab.id == null) return false;
  setTabState(tab.id, { url: tab.url || "" });
  const shouldAttach = isHttpTab(tab) && netMode && overridesEnabled && hasApplicableRules(contextForTab(tab));
  if (shouldAttach) return attachToTab(tab.id);
  await detachFromTab(tab.id, false);
  return false;
}

async function syncAllTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (_error) {
    return;
  }
  await Promise.all(tabs.filter((tab) => tab && tab.id != null).map((tab) => syncTab(tab)));
}

async function updateBadge() {
  const active = overridesEnabled ? rules.filter((rule) => rule.enabled && rule.urlPattern).length : 0;
  await chrome.action.setBadgeText({ text: overridesEnabled ? (active ? String(active) : "") : "OFF" }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({ color: overridesEnabled ? "#6d5dfc" : "#6b7280" }).catch(() => {});
}

async function broadcastRules() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (_error) {
    return;
  }
  await Promise.all(tabs.filter(isHttpTab).map((tab) => chrome.tabs.sendMessage(tab.id, {
    type: "rm-settings", rules, overridesEnabled
  }).catch(() => {})));
}

function broadcastNetStatus(tabId) {
  if (tabId == null) return;
  const state = tabStates.get(tabId);
  const payload = {
    type: "rm-net-status", tabId, status: networkStatus(tabId), attached: isNetworkReady(tabId),
    error: state ? state.error : null, overridesEnabled,
    applicableRuleCount: applicableRules(contextForTabId(tabId)).length
  };
  chrome.tabs.sendMessage(tabId, { ...payload, type: "rm-net-status-tab" }).catch(() => {});
  chrome.runtime.sendMessage(payload).catch(() => {});
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  logBuffers.delete(tabId);
  pendingResponseCaptures.delete(tabId);
  tabStates.delete(tabId);
  cancelPendingRequestsForTab(tabId, true);
  for (const [key, request] of observedRequests.entries()) {
    if (request.tabId === tabId) observedRequests.delete(key);
  }
  chrome.debugger.detach({ tabId }).catch(() => {});
});

chrome.webRequest.onBeforeRequest.addListener(beginObservedRequest, { urls: ["<all_urls>"], types: ["xmlhttprequest"] });
chrome.webRequest.onCompleted.addListener((details) => finishObservedRequest(details, false), { urls: ["<all_urls>"], types: ["xmlhttprequest"] });
chrome.webRequest.onErrorOccurred.addListener((details) => finishObservedRequest(details, true), { urls: ["<all_urls>"], types: ["xmlhttprequest"] });

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "loading" || changeInfo.status === "complete") {
    setTabState(tabId, { url: (tab && tab.url) || changeInfo.url || "" });
    void syncTab(tab);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await syncTab(tab);
    broadcastNetStatus(tabId);
  } catch (_error) { /* tab disappeared */ }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source && source.tabId != null && method === "Fetch.requestPaused") void handlePausedRequest(source.tabId, params);
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (!source || source.tabId == null) return;
  const state = tabStates.get(source.tabId);
  if (!state) return;
  cancelPendingRequestsForTab(source.tabId, true);
  setTabState(source.tabId, {
    attached: false,
    fetchEnabled: false,
    error: reason && reason !== "target_closed" ? String(reason) : null
  });
  broadcastNetStatus(source.tabId);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  let shouldSync = false;
  let shouldBroadcast = false;
  if (changes.rm_rules) {
    rules = Shared.normalizeRules(changes.rm_rules.newValue);
    rulesLoaded = true;
    regexCache.clear();
    recheckPendingRequests();
    shouldSync = true;
    shouldBroadcast = true;
  }
  if (changes.rm_net_mode) {
    netMode = changes.rm_net_mode.newValue !== false;
    shouldSync = true;
  }
  if (changes.rm_overrides_enabled) {
    overridesEnabled = changes.rm_overrides_enabled.newValue !== false;
    shouldSync = true;
    shouldBroadcast = true;
  }
  if (changes.rm_mask_urls) maskUrls = changes.rm_mask_urls.newValue === true;
  if (shouldBroadcast) void broadcastRules();
  if (shouldSync) void syncAllTabs();
  void updateBadge();
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => chrome.sidePanel.open().catch(() => {}));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return undefined;
  if (message.type === "rm-log" && sender.tab && sender.tab.id != null) {
    const entry = sanitizeLogEntry(message.entry, sender.tab.id, sender.frameId);
    if (entry && entry.mode === "in-page") {
      pushLogBuffer(sender.tab.id, entry);
      if (entry.mocked && entry.ruleId) recordRuleHit(entry.ruleId, sender.tab.id);
      chrome.runtime.sendMessage({ type: "rm-log-live", entry, tabId: sender.tab.id }).catch(() => {});
    } else if (entry && (entry.responseCaptured || entry.responseBodyTruncated || entry.responseContentType)) {
      enrichOrQueueResponseCapture(sender.tab.id, entry);
    }
    return undefined;
  }
  if (message.type === "rm-get-logs") {
    (async () => {
      const tab = message.tabId != null ? await chrome.tabs.get(Number(message.tabId)).catch(() => null) : await activeTab();
      if (!tab || tab.id == null) return sendResponse({ entries: [], tabId: null });
      const byId = new Map();
      for (const cached of logBuffers.get(tab.id) || []) {
        const entry = sanitizeLogEntry(cached, tab.id, cached.frameId);
        if (entry) byId.set(entry.id, entry);
      }
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: "rm-get-logs" });
        for (const raw of (response && response.entries) || []) {
          const entry = sanitizeLogEntry(raw, tab.id, raw.frameId);
          if (entry && entry.mode === "in-page" && !byId.has(entry.id)) byId.set(entry.id, entry);
        }
      } catch (_error) { /* content script is not available */ }
      const entries = Array.from(byId.values()).sort((a, b) => a.ts - b.ts).slice(-LIMITS.maxLogs);
      logBuffers.set(tab.id, entries);
      sendResponse({ entries, tabId: tab.id });
    })();
    return true;
  }
  if (message.type === "rm-clear-logs") {
    (async () => {
      const tab = message.tabId != null ? { id: Number(message.tabId) } : await activeTab();
      if (tab && tab.id != null) {
        logBuffers.delete(tab.id);
        await chrome.tabs.sendMessage(tab.id, { type: "rm-clear-logs" }).catch(() => {});
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (message.type === "rm-net-status") {
    (async () => {
      const tab = message.tabId != null ? await chrome.tabs.get(Number(message.tabId)).catch(() => null) : (sender.tab || await activeTab());
      if (!tab || tab.id == null) return sendResponse({ tabId: null, status: "unavailable", attached: false });
      setTabState(tab.id, { url: tab.url || "" });
      const state = getTabState(tab.id);
      sendResponse({
        tabId: tab.id,
        pageUrl: tab.url || "",
        pageOrigin: Shared.normalizeOrigin(tab.url),
        status: networkStatus(tab.id),
        attached: isNetworkReady(tab.id),
        error: state.error,
        overridesEnabled,
        applicableRuleCount: applicableRules(contextForTab(tab)).length
      });
    })();
    return true;
  }
  if (message.type === "rm-context") {
    (async () => {
      const tab = sender.tab || await activeTab();
      sendResponse({
        tabId: tab && tab.id != null ? tab.id : null,
        pageUrl: tab && tab.url ? tab.url : "",
        pageOrigin: Shared.normalizeOrigin(tab && tab.url),
        overridesEnabled,
        netMode,
        attached: !!(tab && isNetworkReady(tab.id))
      });
    })();
    return true;
  }
  if (message.type === "rm-rule-stats") {
    sendResponse({ stats: Object.fromEntries(ruleStats.entries()) });
    return undefined;
  }
  if (message.type === "rm-sync-tab") {
    (async () => {
      rules = await getRules();
      rulesLoaded = true;
      regexCache.clear();
      const tab = message.tabId != null ? await chrome.tabs.get(Number(message.tabId)).catch(() => null) : await activeTab();
      if (!tab || tab.id == null) return sendResponse({ ok: false, status: "unavailable" });
      await syncTab(tab);
      sendResponse({ ok: true, status: networkStatus(tab.id), attached: isNetworkReady(tab.id) });
    })().catch((error) => sendResponse({ ok: false, status: "fallback", error: String((error && error.message) || error) }));
    return true;
  }
  if (message.type === "rm-diag") {
    sendResponse({
      schemaVersion: Shared.SCHEMA_VERSION,
      overridesEnabled,
      netMode,
      rulesCount: rules.length,
      networkTabs: Array.from(tabStates.values()).map((state) => ({
        tabId: state.tabId, url: state.url, attached: state.attached, fetchEnabled: state.fetchEnabled,
        status: networkStatus(state.tabId), error: state.error, updatedAt: state.updatedAt
      })),
      pendingRequests: pendingRequests.size,
      lastFetchEnable,
      pausedLog: pausedLog.slice()
    });
    return undefined;
  }
  return undefined;
});

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
  void updateBadge();
});

chrome.runtime.onStartup.addListener(() => { void loadSettingsAndMigrate().then(syncAllTabs); });

(async function init() {
  await loadSettingsAndMigrate();
  await updateBadge();
  await syncAllTabs();
})();
