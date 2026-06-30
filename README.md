# Tab Reloader

A browser extension for Opera (and other Chromium-based browsers) that automatically reloads tabs matching a configured domain at a set interval — useful for keeping cloud console sessions (e.g. OCI) alive without having to re-authenticate through SSO/2FA federation over and over.

The extension skips a scheduled reload if you're actively interacting with the tab, so it won't interrupt you mid-task.

## Features

- Define one or more rules: domain (e.g. `cloud.oracle.com`) + reload interval (minutes or seconds)
- Enable/disable rules individually without deleting them
- Wildcard subdomain support (e.g. `*.example.com`)
- Skips the reload if you interacted with the page (click, key press, scroll, touch) more recently than the configured interval — your active session won't be interrupted
- Settings sync across your browser via `chrome.storage.sync`

## Requirements

- Opera, Chrome, or any other Chromium-based browser supporting Manifest V3 extensions
- No build step or external dependencies — plain HTML/CSS/JS

## Installation

1. Download the latest release zip from the [Releases page](https://github.com/SN0371/tabReloader/releases) and unzip it (or clone this repository instead).
2. Open `opera://extensions` in the address bar (or `chrome://extensions` in Chrome).
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder.

The extension icon will appear in the toolbar.

## Usage

1. Click the Tab Reloader icon in the toolbar.
2. Under **New rule**, enter a domain (e.g. `cloud.oracle.com`) and an interval.
3. Click **Add rule**.
4. Any open (or future) tab whose URL matches that domain will be reloaded automatically at the configured interval — unless you've interacted with the page more recently than that interval.
5. Toggle a rule on/off with the switch, or remove it with the ✕ button.

**Note:** the minimum interval is **1 minute**, since this is the lower bound of Chromium's `chrome.alarms` API.

## How it works

- `background.js` — a service worker that maintains a `chrome.alarms` timer per rule, queries matching tabs when the alarm fires, and reloads them (unless recent user activity was detected).
- `content.js` — injected into every page; reports user interaction events (click, keydown, scroll, touch) to the background worker, throttled to avoid noise.
- `popup.html` / `popup.js` / `popup.css` — the UI for managing rules, backed by `chrome.storage.sync`.

## Testing

`test/index.html` is a self-contained page for verifying extension behavior end to end: it tracks a reload counter, timestamps, and the interval between reloads in `localStorage`, and provides an interactive area (scroll box, slider) to trigger activity events.

1. Serve the `test/` folder over HTTP, e.g. `python3 -m http.server 8000` from within it.
2. Open `http://localhost:8000` in the browser with the extension loaded.
3. Add a rule for `localhost` with a short interval (e.g. 1 minute).
4. Watch the reload counter and the "previous interval" value to confirm reloads happen on schedule.
5. Interact with the page (click, scroll, type) shortly before a scheduled reload to confirm it gets skipped.
6. Use **Reset counter** to start a clean run.

## Permissions

| Permission | Why it's needed |
|---|---|
| `tabs` | Query open tabs and reload matching ones |
| `storage` | Persist rules (`storage.sync`) and track recent activity (`storage.session`) |
| `alarms` | Schedule periodic reload checks per rule |
| `host_permissions: <all_urls>` | Match and reload tabs on any domain you configure |
