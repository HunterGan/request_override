# Privacy

Request Override stores user configuration locally in Chrome's `chrome.storage.local`.

Stored data includes:

- mock rules;
- network-level mode setting;
- query-param masking setting;
- UI language;
- global overrides state and per-rule scope/priority.

The extension does not:

- transmit rules to external servers;
- collect analytics;
- upload request URLs;
- upload response bodies;
- require an account.

Request logs are kept only in memory, capped at 200 entries per tab, and only the current tab is shown. They may include URL parameters. You can clear them from the side panel and hide parameter values with the **Hide URL parameters** option.

Rule hit counters are session-only diagnostics and are not uploaded.
