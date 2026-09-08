const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
let failures = 0;

function check(label, task) {
  return Promise.resolve()
    .then(task)
    .then(() => console.log(`ok - ${label}`))
    .catch((error) => {
      failures += 1;
      console.error(`FAIL - ${label}: ${error && error.message ? error.message : error}`);
    });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function source(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function loadShared() {
  const sandbox = { URL, TextEncoder, crypto: globalThis.crypto, console, setTimeout, clearTimeout };
  const context = vm.createContext(sandbox);
  vm.runInContext(source("shared.js"), context, { filename: "shared.js" });
  return context.RequestOverrideShared;
}

function makeChromeMock(storedRules) {
  const listeners = {};
  const commands = [];
  const storageData = {
    rm_rules: storedRules,
    rm_schema_version: 2,
    rm_net_mode: true,
    rm_mask_urls: false,
    rm_overrides_enabled: true
  };
  const event = (name) => ({ addListener(handler) { listeners[name] = handler; } });
  return {
    __listeners: listeners,
    __commands: commands,
    tabs: {
      onRemoved: event("tabsRemoved"), onUpdated: event("tabsUpdated"), onActivated: event("tabsActivated"),
      query: async () => [], get: async (tabId) => ({ id: tabId, url: "https://app.example.test/" }),
      sendMessage: async () => ({ entries: [] })
    },
    runtime: {
      onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message"),
      sendMessage: async () => undefined
    },
    storage: {
      onChanged: event("storageChanged"),
      local: {
        async get(keys) {
          if (typeof keys === "string") return { [keys]: storageData[keys] };
          const result = {};
          const requestedKeys = Array.isArray(keys) ? keys : Object.keys(storageData);
          for (const key of requestedKeys) result[key] = storageData[key];
          return result;
        },
        async set(values) { Object.assign(storageData, values); }
      }
    },
    action: { onClicked: event("actionClicked"), setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    webRequest: {
      onBeforeRequest: event("webBefore"), onCompleted: event("webCompleted"), onErrorOccurred: event("webError")
    },
    sidePanel: { open: async () => {}, setPanelBehavior: async () => {} },
    debugger: {
      onEvent: event("debuggerEvent"), onDetach: event("debuggerDetach"),
      attach: async () => {}, detach: async () => {},
      async sendCommand(target, method, parameters) { commands.push({ target, method, parameters }); }
    }
  };
}

async function loadBackground(storedRules) {
  const chrome = makeChromeMock(storedRules);
  const sandbox = {
    chrome, URL, TextEncoder, console, setTimeout, clearTimeout,
    btoa(value) { return Buffer.from(value, "binary").toString("base64"); }
  };
  const context = vm.createContext(sandbox);
  sandbox.importScripts = (...files) => {
    for (const file of files) vm.runInContext(source(file), context, { filename: file });
  };
  vm.runInContext(source("background.js"), context, { filename: "background.js" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { context, chrome };
}

(async () => {
  await check("JavaScript sources compile", () => {
    for (const file of ["shared.js", "background.js", "content-main.js", "content-bridge.js", "sidepanel/app.js", "generate-icons.js", "validate.js"]) {
      new vm.Script(source(file), { filename: file });
    }
  });

  await check("manifest is MV3 v1.2 and loads shared runtime", () => {
    const manifest = JSON.parse(source("manifest.json"));
    equal(manifest.manifest_version, 3, "manifest version");
    equal(manifest.version, "1.2.5", "extension version");
    assert(manifest.permissions.includes("debugger"), "debugger permission is required for DevTools-visible statuses");
    assert(manifest.permissions.includes("webRequest"), "webRequest permission is required for a reliable request journal");
    const main = manifest.content_scripts.find((item) => item.world === "MAIN");
    assert(main && main.js[0] === "shared.js" && main.js.includes("content-main.js"), "MAIN world must load shared.js first");
    assert(source("sidepanel/index.html").includes('<script src="../shared.js"></script>'), "side panel must load shared.js");
  });

  const Shared = loadShared();
  await check("legacy delay migrates to canonical delayMs", () => {
    const rule = Shared.normalizeRule({ id: "legacy", urlPattern: "/api", delay: 1750, status: 500 });
    equal(rule.delayMs, 1750, "delay migration");
    equal(rule.status, 500, "status preservation");
    assert(!Object.prototype.hasOwnProperty.call(rule, "delay"), "legacy delay field must not survive normalization");
  });

  await check("log duration migrates and history contract uses entries", () => {
    const log = Shared.normalizeLog({ url: "https://api.test/items", duration: 42.4, status: 200, responseCaptured: true, responseBody: '{"ok":true}', responseContentType: "application/json" });
    equal(log.durationMs, 42, "duration migration");
    equal(log.responseBody, '{"ok":true}', "captured response body");
    assert(source("background.js").includes("sendResponse({ entries:"), "background response key must be entries");
    assert(source("sidepanel/app.js").includes("logsResponse.entries"), "side panel must read entries");
    assert(source("sidepanel/app.js").includes('message.type === "rm-log-live"'), "side panel must subscribe to live logs");
    assert(source("content-bridge.js").includes("new PerformanceObserver"), "resource timing fallback must keep the journal observable");
  });

  await check("MAIN-world fetch capture includes the original body", async () => {
    const messages = [];
    const messageListeners = [];
    const page = {
      RequestOverrideShared: Shared,
      top: null,
      addEventListener(type, listener) { if (type === "message") messageListeners.push(listener); },
      postMessage(data) {
        messages.push(data);
        for (const listener of messageListeners) listener({ source: page, data });
      },
      fetch: async () => new Response('{"from":"server"}', { status: 200, headers: { "Content-Type": "application/json" } }),
      XMLHttpRequest: undefined
    };
    page.top = page;
    const sandbox = {
      window: page, globalThis: page, location: new URL("https://app.test/page"),
      document: { documentElement: { getAttribute: () => "token" }, addEventListener() {} },
      performance, URL, Request, Response, Headers, TextEncoder, TextDecoder, DOMException,
      setTimeout, clearTimeout, console
    };
    vm.runInContext(source("content-main.js"), vm.createContext(sandbox), { filename: "content-main.js" });
    const response = await page.fetch("https://api.test/items");
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const logged = messages.find((message) => message.type === "log");
    assert(logged && logged.entry.responseCaptured, "fetch response was not captured");
    equal(logged.entry.responseBody, '{"from":"server"}', "fetch response body");
    equal(logged.entry.responseContentType, "application/json", "fetch response content type");
  });

  await check("compact panel keeps settings labels and content visible", () => {
    const css = source("sidepanel/style.css");
    const html = source("sidepanel/index.html");
    assert(!css.includes(".footer-check span { display: none"), "footer labels must not be hidden on normal side-panel widths");
    assert(!css.includes(".app.collapsed .main { display: none"), "internal collapse must not leave an empty system side panel");
    assert(html.indexOf('class="network-control"') < html.indexOf('class="tabs"'), "DevTools status control must be prominent above the tabs");
    assert(css.includes("select.compact-select:focus-visible { outline: 0; }"), "filter focus must stay inside its clipped container");
    assert(css.includes("select, select option { background-color: var(--surface); color: var(--text); }"), "native select options must remain readable");
  });

  await check("status and null-body rules are normalized safely", () => {
    equal(Shared.normalizeRule({ urlPattern: "x", status: 101 }).status, 200, "1xx status");
    equal(Shared.normalizeRule({ urlPattern: "x", status: 500 }).status, 500, "500 status");
    equal(Shared.normalizeRule({ urlPattern: "x", status: 204, body: "not allowed" }).body, "", "204 body");
  });

  await check("site/tab scopes and priority matching work", () => {
    const rules = Shared.normalizeRules([
      { id: "global", urlPattern: "/api", status: 404, scopeType: "all", priority: 1 },
      { id: "site", urlPattern: "/api/users", status: 500, scopeType: "site", scopeValue: "https://app.test", priority: 10 }
    ]);
    const winner = Shared.findMatchingRule(rules, "https://backend.test/api/users", "GET", { tabId: 7, pageUrl: "https://app.test/page" });
    equal(winner.id, "site", "higher-priority site rule");
    const other = Shared.findMatchingRule(rules, "https://backend.test/api/users", "GET", { tabId: 7, pageUrl: "https://other.test/page" });
    equal(other.id, "global", "global fallback rule");
  });

  await check("exact URL mode does not behave like contains", () => {
    const exact = Shared.normalizeRule({ urlPattern: "https://api.test/items?id=1", matchType: "exact", status: 500 });
    assert(Shared.ruleMatchesRequest(exact, "https://api.test/items?id=1", "GET", {}), "exact URL must match itself");
    assert(!Shared.ruleMatchesRequest(exact, "https://api.test/items?id=10", "GET", {}), "exact URL must reject a longer URL");
  });

  await check("browser request events populate the journal", async () => {
    const { chrome } = await loadBackground([]);
    chrome.__listeners.webBefore({ tabId: 12, frameId: 0, requestId: "native-1", timeStamp: 1000, method: "GET", url: "https://api.test/items" });
    chrome.__listeners.webCompleted({ tabId: 12, frameId: 0, requestId: "native-1", timeStamp: 1042, method: "GET", url: "https://api.test/items", statusCode: 200 });
    chrome.__listeners.message({ type: "rm-log", entry: { ts: 1042, method: "GET", url: "https://api.test/items", status: 200, mode: "native", responseCaptured: true, responseBody: '{"items":[1]}', responseContentType: "application/json" } }, { tab: { id: 12 }, frameId: 0 }, () => {});
    const response = await new Promise((resolve) => chrome.__listeners.message({ type: "rm-get-logs", tabId: 12 }, {}, resolve));
    equal(response.entries.length, 1, "journal entry count");
    equal(response.entries[0].status, 200, "journal response status");
    equal(response.entries[0].durationMs, 42, "journal duration");
    equal(response.entries[0].responseBody, '{"items":[1]}', "journal captured body");
    assert(source("sidepanel/app.js").includes("entry && entry.responseCaptured ? entry.responseBody"), "rule dialog must use the captured response body");
  });

  await check("response capture joins the journal in either event order", async () => {
    const { chrome } = await loadBackground([]);
    chrome.__listeners.message({ type: "rm-log", entry: { ts: 2000, method: "POST", url: "https://api.test/save", status: 201, mode: "native", responseCaptured: true, responseBody: '{"id":7}', responseContentType: "application/json" } }, { tab: { id: 13 }, frameId: 0 }, () => {});
    chrome.__listeners.webBefore({ tabId: 13, frameId: 0, requestId: "native-2", timeStamp: 1990, method: "POST", url: "https://api.test/save" });
    chrome.__listeners.webCompleted({ tabId: 13, frameId: 0, requestId: "native-2", timeStamp: 2000, method: "POST", url: "https://api.test/save", statusCode: 201 });
    const response = await new Promise((resolve) => chrome.__listeners.message({ type: "rm-get-logs", tabId: 13 }, {}, resolve));
    equal(response.entries[0].responseBody, '{"id":7}', "queued response body");
    assert(source("sidepanel/app.js").includes('message.type === "rm-log-capture"'), "side panel must receive capture updates directly");
  });

  await check("CDP fulfills a 500 response visible to DevTools", async () => {
    const rule = Shared.normalizeRule({ id: "server-error", urlPattern: "/api/users", method: "GET", status: 500, statusText: "Internal Server Error", contentType: "application/json", body: '{"error":"boom"}', scopeType: "all" });
    const { context, chrome } = await loadBackground([rule]);
    context.setTabState(7, { url: "https://app.example.test/", attached: true, fetchEnabled: true });
    const entry = { result: "pending" };
    await context.settlePausedRequest({
      tabId: 7, requestId: "request-1", request: { url: "https://api.example.test/api/users", method: "GET", headers: {} },
      entry, timer: null, settled: false
    });
    const fulfill = chrome.__commands.find((command) => command.method === "Fetch.fulfillRequest");
    assert(fulfill, "Fetch.fulfillRequest was not sent");
    equal(fulfill.parameters.responseCode, 500, "DevTools response code");
    equal(fulfill.parameters.responsePhrase, "Internal Server Error", "response phrase");
    equal(entry.result, "ok", "fulfill result");
  });

  await check("unmatched CORS preflight is continued untouched", async () => {
    const rule = Shared.normalizeRule({ id: "get-only", urlPattern: "/api/users", method: "GET", status: 500, scopeType: "all" });
    const { context, chrome } = await loadBackground([rule]);
    context.setTabState(8, { url: "https://app.example.test/", attached: true, fetchEnabled: true });
    await context.settlePausedRequest({
      tabId: 8, requestId: "preflight-1",
      request: { url: "https://api.example.test/api/users", method: "OPTIONS", headers: { "Access-Control-Request-Method": "POST" } },
      entry: { result: "pending" }, timer: null, settled: false
    });
    assert(chrome.__commands.some((command) => command.method === "Fetch.continueRequest"), "preflight must continue");
    assert(!chrome.__commands.some((command) => command.method === "Fetch.fulfillRequest"), "unmatched preflight must not be fulfilled");
  });

  await check("import/export JSON round-trips normalized rules", () => {
    const input = Shared.normalizeRules([{ id: "r1", urlPattern: "/x", status: 503, delayMs: 2000, scopeType: "site", scopeValue: "https://app.test" }]);
    const parsed = JSON.parse(JSON.stringify({ schemaVersion: Shared.SCHEMA_VERSION, rules: input }));
    const output = Shared.normalizeRules(parsed.rules);
    equal(output[0].status, 503, "status");
    equal(output[0].delayMs, 2000, "delay");
    equal(output[0].scopeValue, "https://app.test", "scope");
  });

  await check("icons and manual browser fixture exist", () => {
    for (const size of [16, 48, 128]) assert(fs.existsSync(path.join(root, "icons", `icon${size}.png`)), `icon${size}.png missing`);
    assert(fs.existsSync(path.join(root, "tests", "fixture.html")), "tests/fixture.html missing");
  });

  if (failures) {
    console.error(`\n${failures} validation check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll validation checks passed.");
  }
})();
