# Privacy

Request Override stores user configuration locally in Chrome's `chrome.storage.local`.

Stored data includes:

- mock rules;
- network-level mode setting;
- query-param masking setting;
- UI language;
- collapsed panel state.

The extension does not:

- transmit rules to external servers;
- collect analytics;
- upload request URLs;
- upload response bodies;
- require an account.

Request logs are kept only in memory for the active tab and are capped at 200 entries. They may include URLs and query parameters. You can clear logs from the side panel and can mask query parameter values with the **Mask query params** option.
