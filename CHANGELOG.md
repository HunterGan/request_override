# Changelog

## 1.2.6

- Fixed response body capture on Chrome 145+: Chrome now dedupes injected content-script files across manifest entries, which silently dropped `shared.js` from the MAIN world, disabled fetch/XHR instrumentation, and left the rule body input empty. `shared.js` now loads only in the MAIN-world entry (`content-bridge.js` never used it).
- Response captures now enrich the journal entry with the closest timestamp, so parallel identical requests get their own bodies instead of borrowing each other's.
- The side panel merges restored history with live entries instead of replacing them, keeping enriched bodies across tab activation and navigation refreshes.
- The rule dialog explains why a response body is unavailable (larger than 1 MB or not captured), and request rows show the captured body size.
- Added capture and enrichment counters to diagnostics for faster troubleshooting.

## 1.2.5

- Added a canonical versioned rule/log schema with lossless migration from legacy `delay` and `duration` fields.
- Fixed live request delivery, request history restoration, delays, durations, and status validation.
- Network rules now use CDP `Fetch.fulfillRequest`, so a mocked `500` appears as `500` in DevTools Network.
- Limited debugger attachment to tabs with applicable rules and added a global Overrides switch.
- Made the request journal reliable through browser `webRequest` events, with page instrumentation retained for synthetic fallback responses.
- Fixed CORS handling so unmatched preflight requests pass through untouched.
- Added Quick override presets, smart URL patterns, current-site/tab/all-sites scopes, priorities, conflict warnings, hit counters, duplication, and undo delete.
- Added request search, method/status filters, mocked-only mode, pause recording, repeated-request grouping, and source badges.
- Added versioned JSON import/export and a redesigned responsive bilingual side panel.
- Promoted DevTools status mode into the header, clarified URL-parameter masking, and fixed clipped select focus states.
- Removed the misleading internal collapse control because extensions cannot resize Chrome's system side panel.
- Fixed native select option contrast in Chrome and removed obsolete internal planning documents.
- Captured text/JSON response bodies in memory and prefilled rule body and Content-Type from request rows.
- Made response-body enrichment independent of browser event order and service-worker buffer lifetime.
- Added contract tests, CDP 500/preflight tests, and a manual Chrome fixture.

## 1.1.0

- Renamed extension to **Request Override**.
- Added Russian side panel by default with English fallback and a language switcher.
- Added left-side accordion collapse into a compact vertical strip.
- Redesigned request rows to show method, request name, status, duration, full URL, copy URL, and `MOCKED` badge.
- Improved accessibility: keyboard request rows, ARIA tabs, modal focus trapping, status live region, and visible focus states.
- Added real log clearing from the side panel.
- Added bilingual README, `LICENSE`, `PRIVACY.md`, `SECURITY.md`, `.gitignore`, and CI validation workflow.

## 1.0.0

- Initial MV3 side panel extension.
- Rule creation from request rows.
- Network-level CDP mocking and in-page fetch/XHR fallback.
- Local rule storage, live rule updates, badge count, diagnostics, and lightweight validation script.
