# Tabmind — Changes and Knowledge Notes

This document records the recent implementation changes and the main technical decisions discussed while building Tabmind.

## 1. What Tabmind does

Tabmind is a vanilla JavaScript, HTML, and CSS Manifest V3 browser extension. It manages tab memory by discarding older or lower-value tabs while keeping their tab entries visible.

Discarding is different from closing:

- **Discarding** unloads page content from memory.
- The tab remains visible in the browser tab bar.
- The page reloads when the user returns to it.
- The extension does not permanently delete the tab.

The default limit is eight non-discarded tabs.

## 2. Version history

### v1.0.0 — Timestamp LRU

The original version stores a tab's last activation time in a `Map`. When more than eight non-discarded tabs are open, the least recently used eligible tab is discarded.

### v1.1.0 — Deterministic LRU

This keeps the LRU policy but uses a monotonic sequence counter instead of relying only on wall-clock timestamps. This reduces ordering ambiguity when several tab events occur close together.

### v1.2.0 — LFU

LFU means Least Frequently Used. Each tab tracks:

- Access count
- Last-access time

The tab with the fewest visits is selected first. The oldest last-access time breaks ties.

LFU is useful when the user repeatedly returns to a small set of tabs, but historical counts can become stale.

### v1.3.0 — CLOCK / Second Chance

CLOCK uses:

- A circular tab ring
- A reference-bit map
- A moving hand

Recently accessed tabs receive a second chance instead of immediately becoming victims. CLOCK is a lower-overhead approximation of recency.

### v1.5.0 — Adaptive LRU

v1.5.0 is the current final algorithm version for Chrome and Brave. It combines several retention signals instead of using recency alone.

A Firefox-compatible copy is also included at:

```text
versions/v1.5.0-firefox/
```

## 3. The v1.5 adaptive LRU score

The algorithm calculates a retention score for eligible tabs:

```text
retentionScore =
    0.35 × recency
  + 0.20 × decayed frequency
  + 0.15 × active-time score
  + 0.10 × priority
  + 0.10 × window-focus score
  + 0.10 × focus-cluster score
```

The tab with the lowest score is discarded.

### Score signals

- **Recency:** recently activated tabs receive a higher score.
- **Frequency:** tabs visited repeatedly receive a higher score.
- **Active time:** tabs that have been actively used for longer receive a boost.
- **Idle aging:** frequency and active-time influence decay as a tab remains idle.
- **Priority:** grouped tabs receive a small base boost.
- **Window focus:** tabs in the active browser window receive a boost.
- **Focus cluster:** tabs receive extra protection when they share a hostname, tab group, or opener-tab relationship.

The state kept for each tab is:

```text
last access
visit count
active time
hostname
tab group
opener tab
activation time
```

This state is held in memory. The whitelist is the only policy data persisted in `chrome.storage.local`.

## 4. Hard protection rules

These tabs are removed from the eviction candidate list before scoring:

- The active tab
- Pinned tabs
- Whitelisted domains

The score cannot override these rules.

## 5. Eviction timing

The extension creates a `chrome.alarms` alarm that runs every minute.

At each alarm:

1. The extension counts non-discarded tabs.
2. If there are eight or fewer, it does nothing.
3. If there are more than eight, it scores eligible tabs.
4. It discards one lowest-scoring tab.

Therefore:

| Non-discarded tabs | Maximum approximate reduction time |
|---:|---:|
| 9 | 1 minute |
| 10 | 2 minutes |
| 15 | 7 minutes |

There is no separate idle grace period. An eligible tab can be discarded at the next alarm if it has the lowest retention score.

If all excess tabs are active, pinned, or whitelisted, no tab is discarded.

## 6. Popup UI changes

The popup was redesigned with vanilla CSS and HTML:

- Tab health cards
- Compact open, discarded, and protected counts
- Red, orange, and green status indicators
- Cleaner protected-domain chips
- Improved input and button styling
- Responsive spacing and accessible labels

The colors mean:

- **Red:** next candidate for eviction
- **Orange:** in the eviction queue
- **Green:** protected

## 7. Per-tab protection button

In v1.5.0, each eligible tab row has a green `+` button on the right.

Clicking it:

1. Reads the tab's hostname.
2. Adds that hostname to the protected-domain list.
3. Persists it in `chrome.storage.local`.
4. Re-renders the tab as protected.

## 8. New-domain protection notification

When a new tab opens, Tabmind waits instead of immediately asking about the internal new-tab page.

The prompt appears only after the tab navigates to a real `http` or `https` domain. This covers:

- Typing a domain in the address bar
- Searching from a new tab
- Search-engine redirects
- Opening a website in a new tab

The notification provides:

```text
Protect
Not now
```

Already-whitelisted domains do not produce another prompt. Internal URLs such as `about:newtab`, `chrome://newtab`, and `file://` are ignored.

If the user searches a phrase, the first prompt is normally for the search-engine domain, such as `google.com`, rather than every result domain opened later in the same tab.

## 9. Browser tab-strip UI discussion

Chrome and Brave do not expose the native tab-strip DOM to ordinary extensions. A normal extension can control tab data through the Tabs API, but it cannot draw a custom circle directly beside each native tab.

Firefox allows profile-level `userChrome.css`, so Tabmind includes:

```text
firefox/userChrome.css
firefox/README.md
```

The Firefox CSS can show browser-state dots:

- Green for selected or pinned tabs
- Gray for other tabs

It cannot read Tabmind's live whitelist or adaptive score. The dynamic red/orange/green status remains authoritative in the extension popup.

## 10. Firefox manifest compatibility

The original Chrome build used only:

```json
"background": {
  "service_worker": "background.js"
}
```

Firefox reported that service workers were disabled for the temporary add-on and requested background scripts.

The current v1.5 manifest supports both environments:

```json
"background": {
  "scripts": ["background.js"],
  "service_worker": "background.js"
}
```

Firefox uses `scripts`; Chrome and Brave use `service_worker`.

If Firefox rejects the combined manifest, use the dedicated fallback:

```text
versions/v1.5.0-firefox/manifest.json
```

## 11. Performance and memory discussion

The extension intentionally avoids frameworks, npm, TypeScript, and build tooling.

The v1.5.0 package measured 14,176 source bytes across six extension files. The background service worker measured 5,240 bytes.

These are source-size measurements, not exact JavaScript heap measurements.

Compared with the earlier policies:

- LRU uses the least per-tab state.
- LFU adds a count and timestamp.
- CLOCK uses a ring and reference bits.
- Adaptive LRU stores several primitive values per tab, but does not persist its policy state.

The adaptive policy uses more runtime state than basic LRU, but it can make better decisions when the user's behavior involves repeated visits, long active sessions, and related tab clusters.

Offline simulations with cache size eight showed that no policy wins every workload:

| Workload | LRU | CLOCK | LFU |
|---|---:|---:|---:|
| Recency scan, 240 accesses | 240 faults / 0.000 hit rate | 140 / 0.417 | 240 / 0.000 |
| Frequency-heavy, 768 accesses | 96 faults / 0.700 hit rate | 78 / 0.756 | 68 / 0.787 |
| Mixed, 240 accesses | 124 faults / 0.483 hit rate | 162 / 0.325 | 124 / 0.483 |

These simulations are policy comparisons, not measurements of real browser RAM usage.

## 12. Current verification

The current repository has been checked with:

- JavaScript syntax validation for v1.5.0.
- Firefox fallback JavaScript syntax validation.
- Manifest JSON validation.
- Brave service-worker load testing.
- Cross-browser manifest validation.
- New-tab internal-URL filtering validation.
- Git diff checks before commits.

Current project location:

```text
C:\Users\Hpscr\Desktop\OS PROJECT\Tabmind
```

GitHub repository:

```text
https://github.com/Azad-Ali-Mohamed/Tabmind
```
