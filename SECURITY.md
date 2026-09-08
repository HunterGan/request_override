# Security

Request Override is a local developer tool. It does not send request logs, rules, URLs, or response bodies to external servers.

## Permissions

- `sidePanel`: opens the side panel UI.
- `storage`: stores rules, language, and settings locally.
- `tabs`: identifies the active tab and broadcasts rule/log messages to page frames.
- `debugger`: enables network-level interception through CDP `Fetch`.
- `webRequest`: observes fetch/XHR completion locally so the request journal does not depend on page instrumentation.
- `<all_urls>` host permission: allows the extension to patch `fetch` and `XMLHttpRequest` on http(s) pages.

## Threat model

The extension runs untrusted page JavaScript in the page's MAIN world. Page scripts can observe the injected mock behavior and may forge rule-update messages for their own frame. This limitation is inherent to content-script-based page patches.

Request logs may contain URL parameters. Enable **Hide URL parameters** if logs should not store their values.

The extension attaches the debugger only to tabs that have at least one applicable enabled rule. Current-site scope is the default for new rules; an explicit all-sites rule can still attach to every http(s) tab.

CORS preflight requests are fulfilled only when an override matches the requested URL and `Access-Control-Request-Method`. Unmatched preflight requests are continued without modification.

## Reporting issues

Please report security issues through the repository's issue tracker. Do not publish sensitive tokens or credentials in public issues.
