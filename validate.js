const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = __dirname;
let failures = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`ok - ${label}`);
  } catch (e) {
    failures++;
    console.error(`FAIL - ${label}: ${e && e.message ? e.message : e}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "value mismatch"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, message) {
  if (!value) throw new Error(message || "expected truthy value");
}

const jsFiles = [
  "background.js",
  "content-main.js",
  "content-bridge.js",
  "sidepanel/app.js",
  "generate-icons.js",
  "validate.js"
];

check("JavaScript files are syntactically valid", () => {
  for (const file of jsFiles) {
    execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "pipe" });
  }
});

check("manifest.json is valid JSON and has required MV3 fields", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assertEqual(manifest.manifest_version, 3, "manifest_version");
  assertTrue(manifest.name, "name missing");
  assertTrue(manifest.background && manifest.background.service_worker, "service worker missing");
  assertTrue(Array.isArray(manifest.host_permissions), "host_permissions missing");
});

check("icons exist", () => {
  for (const size of [16, 48, 128]) {
    assertTrue(fs.existsSync(path.join(root, "icons", `icon${size}.png`)), `icon${size}.png missing`);
  }
});

function makeChromeMock(testRules, maskUrls) {
  const listeners = {
    tabsOnRemoved: [],
    tabsOnUpdated: [],
    debuggerOnEvent: [],
    debuggerOnDetach: [],
    runtimeOnInstalled: [],
    runtimeOnStartup: [],
    storageOnChanged: [],
    actionOnClicked: [],
    runtimeOnMessage: []
  };

  const storageData = {
    rm_rules: testRules,
    rm_net_mode: true,
    rm_mask_urls: maskUrls
  };

  return {
    __listeners: listeners,
    tabs: {
      onRemoved: { addListener: (fn) => listeners.tabsOnRemoved.push(fn) },
      onUpdated: { addListener: (fn) => listeners.tabsOnUpdated.push(fn) },
      query: async () => [],
      sendMessage: async () => {
        throw new Error("no content script");
      }
    },
    runtime: {
      onInstalled: { addListener: (fn) => listeners.runtimeOnInstalled.push(fn) },
      onStartup: { addListener: (fn) => listeners.runtimeOnStartup.push(fn) },
      onMessage: { addListener: (fn) => listeners.runtimeOnMessage.push(fn) },
      sendMessage: async () => {
        throw new Error("no receiver");
      }
    },
    storage: {
      onChanged: { addListener: (fn) => listeners.storageOnChanged.push(fn) },
      local: {
        get: async (keys) => {
          const result = {};
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) {
            if (key in storageData) result[key] = storageData[key];
          }
          return result;
        },
        set: async () => {}
      }
    },
    action: {
      onClicked: { addListener: (fn) => listeners.actionOnClicked.push(fn) },
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {}
    },
    sidePanel: {
      open: async () => {}
    },
    debugger: {
      onEvent: { addListener: (fn) => listeners.debuggerOnEvent.push(fn) },
      onDetach: { addListener: (fn) => listeners.debuggerOnDetach.push(fn) },
      attach: async () => {},
      detach: async () => {},
      sendCommand: async () => {}
    }
  };
}

async function loadBackground(testRules, maskUrls) {
  const chrome = makeChromeMock(testRules, maskUrls);
  const sandbox = {
    ...globalThis,
    chrome,
    console,
    setTimeout,
    clearTimeout
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "background.js"), "utf8"), context, { filename: "background.js" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { chrome, sandbox };
}

(async () => {
  const testRules = [
    {
      id: "r1",
      enabled: true,
      urlPattern: "https://api.example.com/users",
      matchType: "substring",
      method: "GET",
      status: 404,
      statusText: "Not Found",
      contentType: "text/plain",
      body: "missing user",
      delay: 10
    },
    {
      id: "r2",
      enabled: true,
      urlPattern: "^https://api\\.example\\.com/items/\\d+$",
      matchType: "regex",
      method: "",
      status: 500,
      statusText: "",
      contentType: "application/json",
      body: '{"error":"boom"}',
      delay: 0
    }
  ];

  const loaded = await loadBackground(testRules, true);
  const { sandbox } = loaded;

  check("normalizeRules() rejects malformed storage values", () => {
    assertEqual(sandbox.normalizeRules(null).length, 0, "null");
    assertEqual(sandbox.normalizeRules({ id: "r" }).length, 0, "object");
    assertEqual(sandbox.normalizeRules([1, 2, 3]).length, 3, "non-object rules normalized");
  });

  check("normalizeRules() clamps delay, status and body size", () => {
    const [rule] = sandbox.normalizeRules([
      {
        id: "big",
        status: "not-a-number",
        delay: 999999,
        urlPattern: "x",
        body: "a".repeat(2 * 1024 * 1024)
      }
    ]);
    assertEqual(rule.status, 200, "invalid status");
    assertEqual(rule.delay, 60000, "delay cap");
    assertEqual(rule.body.length, 0, "oversized body cleared");
  });

  check("background rule matching works for substring and regex rules", async () => {
    const substringRule = sandbox.findRule("https://api.example.com/users/1", "GET");
    const regexRule = sandbox.findRule("https://api.example.com/items/42", "POST");
    const noRule = sandbox.findRule("https://api.example.com/other", "GET");
    assertTrue(substringRule && substringRule.id === "r1", "substring rule should match");
    assertTrue(regexRule && regexRule.id === "r2", "regex rule should match");
    assertEqual(noRule, null, "non-matching URL should return null");
  });

  check("sanitizeLogEntry() masks query params when maskUrls is enabled", () => {
    const entry = sandbox.sanitizeLogEntry(
      {
        id: "log-1",
        ts: 123,
        method: "post",
        url: "https://api.example.com/data?token=secret&id=42#frag",
        status: 200,
        statusText: "OK",
        duration: 12.4,
        mocked: true
      },
      10,
      0
    );
    assertTrue(entry, "sanitized entry should exist");
    assertEqual(entry.method, "POST", "method normalized");
    assertEqual(entry.status, 200, "status normalized");
    assertEqual(entry.duration, 12, "duration rounded");
    assertTrue(entry.url.includes("token=***"), "query token should be masked");
    assertTrue(entry.url.includes("id=***"), "query id should be masked");
    assertTrue(!entry.url.includes("secret"), "raw query value should not remain");
  });

  check("sanitizeLogEntry() drops invalid log entries", () => {
    assertEqual(sandbox.sanitizeLogEntry(null, 1, 0), null, "null entry");
    assertEqual(sandbox.sanitizeLogEntry({ id: "x" }, 1, 0), null, "missing URL");
    assertEqual(sandbox.sanitizeLogEntry({ url: "https://x.example" }, 1, 0), null, "missing id");
  });

  if (failures > 0) {
    console.error(`\n${failures} validation check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll validation checks passed.");
})().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
