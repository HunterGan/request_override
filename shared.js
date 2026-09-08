(function installRequestOverrideShared(root) {
  "use strict";

  const SCHEMA_VERSION = 2;
  const LIMITS = Object.freeze({
    maxLogs: 200,
    maxRules: 100,
    maxPatternLength: 1000,
    maxNameLength: 120,
    maxStatusTextLength: 200,
    maxContentTypeLength: 300,
    maxBodyBytes: 1024 * 1024,
    maxDelayMs: 60000,
    maxUrlLogLength: 2000,
    maxLogTextLength: 200
  });
  const HTTP_METHODS = Object.freeze(["", "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);
  const NULL_BODY_STATUSES = new Set([204, 205, 304]);
  const DEFAULT_STATUS_TEXT = Object.freeze({
    200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
    301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
    409: "Conflict", 410: "Gone", 413: "Payload Too Large",
    422: "Unprocessable Content", 429: "Too Many Requests",
    500: "Internal Server Error", 501: "Not Implemented",
    502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout"
  });

  function safeString(value, maxLength) {
    let result = value == null ? "" : String(value);
    if (Number.isFinite(maxLength) && result.length > maxLength) result = result.slice(0, maxLength);
    return result;
  }

  function byteLength(value) {
    const text = value == null ? "" : String(value);
    try {
      return new TextEncoder().encode(text).length;
    } catch (_error) {
      return text.length;
    }
  }

  function createId(prefix) {
    try {
      if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    } catch (_error) { /* use fallback */ }
    return `${prefix || "id"}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }

  function defaultStatusText(status) {
    return DEFAULT_STATUS_TEXT[Number(status)] || "";
  }

  function normalizeOrigin(value) {
    try {
      const url = new URL(String(value));
      return /^https?:$/.test(url.protocol) ? url.origin : "";
    } catch (_error) {
      return "";
    }
  }

  function normalizeRule(value, index) {
    if (!value || typeof value !== "object") return null;
    const raw = value;
    let status = Number(raw.status);
    if (!Number.isInteger(status) || status < 200 || status > 599) status = 200;

    const legacyDelay = raw.delayMs == null ? raw.delay : raw.delayMs;
    let delayMs = Number(legacyDelay);
    if (!Number.isFinite(delayMs) || delayMs < 0) delayMs = 0;
    delayMs = Math.min(Math.floor(delayMs), LIMITS.maxDelayMs);

    const rawMethod = safeString(raw.method).toUpperCase();
    const method = HTTP_METHODS.includes(rawMethod) ? rawMethod : "";
    let body = raw.body == null ? "" : (typeof raw.body === "string" ? raw.body : JSON.stringify(raw.body));
    if (byteLength(body) > LIMITS.maxBodyBytes) body = "";
    if (NULL_BODY_STATUSES.has(status)) body = "";

    const rawScope = safeString(raw.scopeType || (raw.scope && raw.scope.type));
    const scopeType = ["site", "tab", "all"].includes(rawScope) ? rawScope : "all";
    let scopeValue = safeString(raw.scopeValue || (raw.scope && raw.scope.value), LIMITS.maxUrlLogLength);
    if (scopeType === "site") scopeValue = normalizeOrigin(scopeValue);
    if (scopeType === "all") scopeValue = "";

    let priority = Number(raw.priority);
    if (!Number.isFinite(priority)) priority = Number.isFinite(index) ? -index : 0;

    return {
      schemaVersion: SCHEMA_VERSION,
      id: safeString(raw.id, 128) || createId("rule"),
      name: safeString(raw.name, LIMITS.maxNameLength),
      enabled: raw.enabled !== false,
      urlPattern: safeString(raw.urlPattern, LIMITS.maxPatternLength),
      matchType: ["regex", "exact"].includes(raw.matchType) ? raw.matchType : "substring",
      method,
      status,
      statusText: safeString(raw.statusText, LIMITS.maxStatusTextLength),
      contentType: safeString(raw.contentType, LIMITS.maxContentTypeLength),
      body,
      delayMs,
      scopeType,
      scopeValue,
      priority: Math.round(priority),
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now()
    };
  }

  function normalizeRules(values) {
    if (!Array.isArray(values)) return [];
    return values.slice(0, LIMITS.maxRules).map(normalizeRule).filter(Boolean);
  }

  function normalizeLog(value) {
    if (!value || typeof value !== "object") return null;
    const raw = value;
    const url = safeString(raw.url, LIMITS.maxUrlLogLength);
    if (!url) return null;
    let status = Number(raw.status);
    if (!Number.isFinite(status) || status < 0 || status > 599) status = 0;
    const rawDuration = raw.durationMs == null ? raw.duration : raw.durationMs;
    return {
      id: safeString(raw.id, 256) || createId("log"),
      ts: Number.isFinite(Number(raw.ts)) ? Number(raw.ts) : Date.now(),
      method: safeString(raw.method || "GET", 16).toUpperCase(),
      url,
      status,
      statusText: safeString(raw.statusText, LIMITS.maxLogTextLength),
      durationMs: Math.max(0, Math.round(Number(rawDuration) || 0)),
      mocked: raw.mocked === true,
      mode: ["network", "in-page", "native"].includes(raw.mode) ? raw.mode : (raw.mocked ? "in-page" : "native"),
      ruleId: safeString(raw.ruleId, 128) || null,
      frame: safeString(raw.frame, 16),
      tabId: raw.tabId == null ? null : Number(raw.tabId),
      frameId: raw.frameId == null ? null : Number(raw.frameId)
    };
  }

  function ruleAppliesToContext(rule, context) {
    if (!rule || rule.enabled === false || !rule.urlPattern) return false;
    const ctx = context || {};
    if (rule.scopeType === "site") {
      return !!rule.scopeValue && normalizeOrigin(ctx.pageUrl || ctx.pageOrigin) === rule.scopeValue;
    }
    if (rule.scopeType === "tab") {
      return ctx.tabId != null && String(ctx.tabId) === String(rule.scopeValue);
    }
    return true;
  }

  function ruleMatchesRequest(rule, url, method, context, regexCache) {
    if (!ruleAppliesToContext(rule, context)) return false;
    const requestMethod = safeString(method || "GET").toUpperCase();
    if (rule.method && rule.method !== requestMethod) return false;
    if (rule.matchType === "regex") {
      let expression;
      const cache = regexCache instanceof Map ? regexCache : null;
      if (cache && cache.has(rule.urlPattern)) {
        expression = cache.get(rule.urlPattern);
      } else {
        try {
          expression = new RegExp(rule.urlPattern);
        } catch (_error) {
          expression = null;
        }
        if (cache) cache.set(rule.urlPattern, expression);
      }
      if (!expression) return false;
      expression.lastIndex = 0;
      return expression.test(String(url));
    }
    if (rule.matchType === "exact") return String(url) === rule.urlPattern;
    return String(url).includes(rule.urlPattern);
  }

  function findMatchingRule(values, url, method, context, regexCache) {
    let winner = null;
    for (const rule of values || []) {
      if (!ruleMatchesRequest(rule, url, method, context, regexCache)) continue;
      if (!winner || rule.priority > winner.priority) winner = rule;
    }
    return winner;
  }

  function smartPattern(url) {
    try {
      const parsed = new URL(String(url));
      return `${parsed.origin}${parsed.pathname || "/"}`;
    } catch (_error) {
      return safeString(url, LIMITS.maxPatternLength).split("?")[0].split("#")[0];
    }
  }

  function exactPattern(url) {
    return safeString(url, LIMITS.maxPatternLength);
  }

  function regexPattern(url) {
    const value = smartPattern(url);
    return `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?.*)?$`;
  }

  function rulesMayConflict(a, b) {
    if (!a || !b || a.id === b.id || a.enabled === false || b.enabled === false) return false;
    if (a.method && b.method && a.method !== b.method) return false;
    if (a.scopeType === "tab" && b.scopeType === "tab" && String(a.scopeValue) !== String(b.scopeValue)) return false;
    if (a.scopeType === "site" && b.scopeType === "site" && a.scopeValue !== b.scopeValue) return false;
    if (a.matchType === "substring" && b.matchType === "substring") {
      return a.urlPattern.includes(b.urlPattern) || b.urlPattern.includes(a.urlPattern);
    }
    if (a.matchType === "exact" && b.matchType === "exact") return a.urlPattern === b.urlPattern;
    if (a.matchType === "exact" && b.matchType === "substring") return a.urlPattern.includes(b.urlPattern);
    if (a.matchType === "substring" && b.matchType === "exact") return b.urlPattern.includes(a.urlPattern);
    return a.urlPattern === b.urlPattern;
  }

  const api = Object.freeze({
    SCHEMA_VERSION,
    LIMITS,
    HTTP_METHODS,
    NULL_BODY_STATUSES,
    DEFAULT_STATUS_TEXT,
    safeString,
    byteLength,
    createId,
    defaultStatusText,
    normalizeOrigin,
    normalizeRule,
    normalizeRules,
    normalizeLog,
    ruleAppliesToContext,
    ruleMatchesRequest,
    findMatchingRule,
    smartPattern,
    exactPattern,
    regexPattern,
    rulesMayConflict
  });

  root.RequestOverrideShared = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
