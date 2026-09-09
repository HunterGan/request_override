# Manual Chrome E2E

1. Run `node tests/server.js`.
2. Reload the unpacked extension at `chrome://extensions`.
3. Open `http://127.0.0.1:4177` and DevTools Network.
4. Click **Fetch users** and open Request Override.
5. Use **Quick override → 500 Server Error** on `/api/users`.
6. Repeat **Fetch users**.

Expected:

- the page receives status `500` and the JSON error body;
- DevTools Network shows status `500` for `/api/users`;
- the side panel shows `500`, `MOCKED`, and `Network`;
- `/api/missing` continues to return its native `404`;
- disabling the master switch immediately restores native `200`;
- **Slow 200** adds approximately 2000 ms to the request;
- after closing/reopening the side panel, the request history is restored;
- clicking a non-mocked request row prefills the "Response body" input with the original response (Chrome 145 regression);
- repeated/parallel identical requests keep their own bodies when opened;
- XHR JSON returns an object when using the in-page fallback;
- the burst groups repeated endpoints and the panel stays responsive.
