const http = require("http");
const fs = require("fs");
const path = require("path");

const fixture = fs.readFileSync(path.join(__dirname, "fixture.html"));
const panelHtml = fs.readFileSync(path.join(__dirname, "..", "sidepanel", "index.html"), "utf8");
const previewMock = `
<script>
  const previewRules = [{ schemaVersion: 2, id: "preview-500", name: "GET /api/users — 500", enabled: true, urlPattern: "http://127.0.0.1:4177/api/users", matchType: "substring", method: "GET", status: 500, statusText: "Internal Server Error", contentType: "application/json", body: "{\\"error\\":\\"boom\\"}", delayMs: 0, scopeType: "site", scopeValue: "http://127.0.0.1:4177", priority: 10, createdAt: Date.now(), updatedAt: Date.now() }];
  const previewLogs = [
    { id: "a", ts: Date.now() - 4000, method: "GET", url: "http://127.0.0.1:4177/api/users?token=***", status: 200, durationMs: 84, mocked: false, mode: "native" },
    { id: "b", ts: Date.now() - 2500, method: "POST", url: "http://127.0.0.1:4177/api/session", status: 401, durationMs: 122, mocked: false, mode: "native" },
    { id: "c", ts: Date.now() - 900, method: "GET", url: "http://127.0.0.1:4177/api/users?token=***", status: 500, durationMs: 17, mocked: true, mode: "network", ruleId: "preview-500" }
  ];
  const noopEvent = { addListener() {} };
  window.chrome = {
    storage: { local: { get: async () => ({ rm_rules: previewRules, rm_overrides_enabled: true, rm_net_mode: true, rm_mask_urls: true, rm_language: "en", rm_panel_collapsed: false }), set: async () => {} }, onChanged: noopEvent },
    runtime: { onMessage: noopEvent, sendMessage: async (message) => message.type === "rm-get-logs" ? { entries: previewLogs } : message.type === "rm-net-status" ? { tabId: 7, status: "active", attached: true, applicableRuleCount: 1 } : message.type === "rm-rule-stats" ? { stats: { "preview-500": { count: 3, lastMatchedAt: Date.now() - 900 } } } : { ok: true, status: "active", attached: true } },
    tabs: { query: async () => [{ id: 7, url: "http://127.0.0.1:4177/dashboard" }], onActivated: noopEvent, onUpdated: noopEvent }
  };
</script>`;
const server = http.createServer((request, response) => {
  if (request.url.startsWith("/panel-preview")) {
    let preview = panelHtml
      .replace('href="style.css"', 'href="/sidepanel/style.css"')
      .replace('<script src="../shared.js"></script>', `${previewMock}<script src="/shared.js"></script>`)
      .replace('src="app.js"', 'src="/sidepanel/app.js"');
    if (request.url.includes("rules")) {
      preview = preview.replace("</body>", '<script>setTimeout(() => document.getElementById("tab-rules").click(), 80);</script></body>');
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(preview);
    return;
  }
  if (request.url === "/shared.js" || request.url === "/sidepanel/app.js" || request.url === "/sidepanel/style.css") {
    const file = request.url === "/shared.js" ? path.join(__dirname, "..", "shared.js") : path.join(__dirname, "..", request.url);
    const type = request.url.endsWith(".css") ? "text/css" : "text/javascript";
    response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    response.end(fs.readFileSync(file));
    return;
  }
  if (request.url === "/" || request.url.startsWith("/fixture")) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fixture);
    return;
  }
  const status = request.url.startsWith("/api/missing") ? 404 : 200;
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: status === 200, nativeStatus: status, url: request.url }));
});

server.listen(4177, "127.0.0.1", () => {
  console.log("Request Override fixture: http://127.0.0.1:4177");
});
