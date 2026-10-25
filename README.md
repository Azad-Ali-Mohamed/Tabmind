# Tabmind — Smart Tab Manager

Tabmind is a small Manifest V3 extension that limits non-discarded tabs to eight and discards one eligible tab every minute. It protects the active tab, pinned tabs, and domains stored in the whitelist.

## Versions

| Version | Policy | Purpose |
|---|---|---|
| v1.0.0 | LRU with timestamps | Original baseline |
| v1.1.0 | LRU with monotonic sequence numbers | Same policy with deterministic ordering and less timestamp-tie risk |
| v1.2.0 | LFU with oldest-access tie-break | Keeps repeatedly used tabs longer |
| v1.3.0 | CLOCK / Second Chance | Low-overhead approximation of recency |
| v1.5.0 | Adaptive LRU score | Combines recency, frequency, active time, idle aging, focus, and tab clusters |
| v1.5.0-firefox | Adaptive LRU score | Firefox-compatible background script manifest |

The production policies are LRU, LFU, CLOCK, and the adaptive LRU score in v1.5.0. FIFO, RANDOM, OPTIMAL, and the heavier TARC design were not used as standalone production versions: FIFO can show Belady's anomaly, RANDOM is only a control, OPTIMAL needs future knowledge, and TARC adds more per-tab state and persistence than this low-memory extension needs.

## Folder layout

Each version is independently loadable through `brave://extensions` or `chrome://extensions`:

```text
versions/
  v1.0.0/
  v1.1.0/
  v1.2.0/
  v1.3.0/
  v1.5.0/
  v1.5.0-firefox/
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

For Firefox, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select:

```text
C:\Users\Hpscr\Desktop\OS PROJECT\Tabmind\versions\v1.5.0\manifest.json
```

This v1.5 manifest declares both `background.scripts` and `background.service_worker`. Firefox uses `scripts`; Chrome and Brave use `service_worker`. If Firefox still rejects the combined manifest, use the fallback at `versions\v1.5.0-firefox\manifest.json`.

## Behavior

- The service worker tracks tab use with the selected policy.
- An alarm runs every minute.
- If more than eight non-discarded tabs exist, the policy selects one eligible victim.
- Active, pinned, and whitelisted tabs are never selected.
- The popup shows open tabs, discarded tabs, protected tabs, and whitelist controls.
- Unprotected tab rows have a green `+` button for immediate domain protection.
- v1.5.0 can show a browser notification when a newly navigated tab reaches a new domain.
- Whitelist data is stored in `chrome.storage.local`.

## v1.5.0 adaptive LRU algorithm

v1.5.0 selects the eligible tab with the lowest retention score. Active, pinned, and whitelisted tabs are filtered out before scoring, so they cannot be evicted by the algorithm.

```text
retentionScore =
    0.35 × recency
  + 0.20 × decayed frequency
  + 0.15 × active-time score
  + 0.10 × priority
  + 0.10 × window-focus score
  + 0.10 × focus-cluster score
```

The signals work as follows:

- **Recency:** recently activated tabs receive a higher score.
- **Frequency:** repeated visits increase retention, but the value is capped and decays with idle age.
- **Active time:** time spent as the active tab is capped at two minutes of contribution and then aged down.
- **Priority:** grouped tabs receive a small base boost.
- **Window focus:** tabs in the active window receive a small boost.
- **Focus cluster:** tabs on the same hostname, in the same tab group, or related through opener tabs receive additional protection.
- **Idle aging:** old state loses influence so a historically popular tab does not stay protected forever.

The service worker keeps one compact state object per tracked tab containing last access, visit count, active time, hostname, group, opener, and activation time. Policy state is not persisted; only the domain whitelist is stored in `chrome.storage.local`.

## v1.5.0 performance

The measured v1.5.0 package contains 14,176 source bytes across six extension files; its background service worker is 5,240 bytes. These are source-size measurements, not exact JavaScript heap measurements.

Offline policy simulations used a cache size of eight:

| Workload | LRU | CLOCK | LFU |
|---|---:|---:|---:|
| Recency scan, 240 accesses | 240 faults / 0.000 hit rate | 140 / 0.417 | 240 / 0.000 |
| Frequency-heavy, 768 accesses | 96 / 0.700 | 78 / 0.756 | 68 / 0.787 |
| Mixed, 240 accesses | 124 / 0.483 | 162 / 0.325 | 124 / 0.483 |

The adaptive policy is designed for real browser behavior rather than one fixed synthetic trace. It adds more per-tab state than simple LRU, but it remains small because it stores only primitive values and does not persist history. Its advantage is that it can retain a recently used, frequently revisited, actively used tab that belongs to the user’s current focus cluster.

## Browser tab-strip limitation

Chrome and Brave do not expose the native tab-strip UI to extensions. The extension can color its popup rows and use extension badges, but it cannot draw a circle beside each native browser tab. This project therefore uses the colored status indicators in the extension popup rather than pretending to modify browser chrome.

## Verification

The Chrome/Brave v1.5.0 build and Firefox fallback pass JavaScript syntax checks and manifest JSON validation. The v1.5.0 build was loaded by Brave's headless runtime with a live background service worker. The detailed comparison is in [`PERFORMANCE_REPORT.md`](PERFORMANCE_REPORT.md).
