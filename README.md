# Tabmind — Smart Tab Manager

Tabmind is a small Manifest V3 extension that limits non-discarded tabs to eight and discards one eligible tab every minute. It protects the active tab, pinned tabs, and domains stored in the whitelist.

## Versions

| Version | Policy | Purpose |
|---|---|---|
| v1.0.0 | LRU with timestamps | Original baseline |
| v1.1.0 | LRU with monotonic sequence numbers | Same policy with deterministic ordering and less timestamp-tie risk |
| v1.2.0 | LFU with oldest-access tie-break | Keeps repeatedly used tabs longer |
| v1.3.0 | CLOCK / Second Chance | Low-overhead approximation of recency |

The selected policies are LRU, LFU, and CLOCK. FIFO, RANDOM, OPTIMAL, and the more state-heavy TARC design were not used in the shipped versions: FIFO can show Belady's anomaly, RANDOM is only a control, OPTIMAL needs future knowledge, and TARC adds more per-tab state and persistence than this low-memory extension needs.

## Folder layout

Each version is independently loadable through `brave://extensions` or `chrome://extensions`:

```text
versions/
  v1.0.0/
  v1.1.0/
  v1.2.0/
  v1.3.0/
```

Every version contains only the extension files plus the placeholder icon:

```text
manifest.json
background.js
popup.html
popup.js
popup.css
icons/icon128.png
```

## Installation

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose one version folder, such as `C:\Users\Hpscr\Desktop\OS PROJECT\Tabmind\versions\v1.3.0`.

Do not select the repository root; select the specific version directory.

## Behavior

- The service worker tracks tab use with the selected policy.
- An alarm runs every minute.
- If more than eight non-discarded tabs exist, the policy selects one eligible victim.
- Active, pinned, and whitelisted tabs are never selected.
- The popup shows open tabs, discarded tabs, protected tabs, and whitelist controls.
- Whitelist data is stored in `chrome.storage.local`.

## Verification

All four versions pass JavaScript syntax checks and manifest JSON validation. Each version was loaded by Brave's headless runtime and exposed a live Manifest V3 service-worker target. The detailed comparison is in [`PERFORMANCE_REPORT.md`](PERFORMANCE_REPORT.md).
