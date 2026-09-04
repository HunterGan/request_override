(() => {
  const SRC = "__REQUEST_OVERRIDE__";
  const FROM_BRIDGE = SRC + ".bridge";
  const FROM_MAIN = SRC + ".main";
  const MAX_LOGS = 200;
  const TOKEN_ATTR = "data-request-override";

  const RULES_TOKEN = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);

  const logs = [];

  function publishToken() {
    try {
      const root = document.documentElement;
      if (root) root.setAttribute(TOKEN_ATTR, RULES_TOKEN);
      return !!root;
    } catch (e) {
      return false;
    }
  }
  if (!publishToken()) {
    document.addEventListener("DOMContentLoaded", publishToken, { once: true });
  }

  function sendRulesToMain(rules) {
    try {
      window.postMessage({
        source: FROM_BRIDGE,
        type: "rules",
        token: RULES_TOKEN,
        rules: Array.isArray(rules) ? rules : []
      }, "*");
    } catch (e) { /* ignore */ }
  }

  function sendNetStatusToMain(attached) {
    try {
      window.postMessage({
        source: FROM_BRIDGE,
        type: "netstatus",
        token: RULES_TOKEN,
        attached: !!attached
      }, "*");
    } catch (e) { /* ignore */ }
  }

  function queryNetStatus() {
    try {
      const p = chrome.runtime.sendMessage({ type: "rm-net-status" });
      if (p && typeof p.then === "function") {
        p.then((res) => {
          if (res && res.attached != null) sendNetStatusToMain(res.attached);
        }).catch(() => {});
      }
    } catch (e) { /* ignore */ }
  }

  function loadRules() {
    try {
      chrome.storage.local.get("rm_rules", (res) => {
        sendRulesToMain(res && res.rm_rules ? res.rm_rules : []);
      });
    } catch (e) { /* ignore */ }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.source !== FROM_MAIN) return;

    if (data.type === "hello") {
      loadRules();
    } else if (data.type === "log" && data.entry) {
      logs.push(data.entry);
      if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
      try {
        const p = chrome.runtime.sendMessage({ type: "rm-log", entry: data.entry });
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (e) { /* ignore */ }
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "rm-rules") {
      sendRulesToMain(msg.rules);
    } else if (msg.type === "rm-net-status-tab") {
      sendNetStatusToMain(msg.attached);
    } else if (msg.type === "rm-get-logs") {
      sendResponse({ entries: logs.slice() });
      return true;
    } else if (msg.type === "rm-clear-logs") {
      logs.length = 0;
      sendResponse({ ok: true });
      return true;
    }
  });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.rm_rules) {
        sendRulesToMain(changes.rm_rules.newValue || []);
      }
    });
  } catch (e) { /* ignore */ }

  loadRules();
  queryNetStatus();
})();
