# Security

Request Override is a local developer tool. It does not send request logs, rules, URLs, or response bodies to external servers.

## Permissions

- `sidePanel`: opens the side panel UI.
- `storage`: stores rules, language, panel state, and settings locally.
- `tabs`: identifies the active tab and broadcasts rule/log messages to page frames.
- `debugger`: enables network-level interception through CDP `Fetch`.
- `<all_urls>` host permission: allows the extension to patch `fetch` and `XMLHttpRequest` on http(s) pages.

## Threat model

The extension runs untrusted page JavaScript in the page's MAIN world. Page scripts can observe the injected mock behavior and may forge rule-update messages for their own frame. This limitation is inherent to content-script-based page patches.

Request logs may contain URLs with query parameters. Enable **Mask query params** if logs should not store query values.

## Reporting issues

Please report security issues through the repository's issue tracker. Do not publish sensitive tokens or credentials in public issues.
