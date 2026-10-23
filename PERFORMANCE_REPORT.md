# Performance Report

## Scope

This report compares the four loadable versions in the repository. The measurements below are deterministic offline policy simulations using cache size 8 and three traces: a recency scan, a frequency-heavy workload, and a mixed tab workload. A fault means the requested tab was not retained by the policy. Browser discard behavior itself is handled by `chrome.tabs.discard`; Chrome documents a discarded tab as unloaded from memory while remaining visible in the tab strip.[1]

## Source-size measurements

Measured from the version folders:

| Version | Policy | Files | Total source bytes | Background bytes |
|---|---|---:|---:|---:|
| v1.0.0 | LRU timestamp | 6 | 6,452 | 1,843 |
| v1.1.0 | LRU sequence | 6 | 6,364 | 1,744 |
| v1.2.0 | LFU | 6 | 6,503 | 1,892 |
| v1.3.0 | CLOCK | 6 | 6,764 | 2,147 |

These are source-size measurements, not a claim about exact JavaScript heap size. Runtime memory is driven mainly by one small per-tab structure: LRU uses one map value, LFU uses a small object with count and timestamp, and CLOCK uses a ring plus reference-bit map.

## Offline workload results

| Workload | LRU faults / hit rate | CLOCK faults / hit rate | LFU faults / hit rate |
|---|---:|---:|---:|
| Recency scan, 240 accesses | 240 / 0.000 | 140 / 0.417 | 240 / 0.000 |
| Frequency-heavy, 768 accesses | 96 / 0.700 | 78 / 0.756 | 68 / 0.787 |
| Mixed, 240 accesses | 124 / 0.483 | 162 / 0.325 | 124 / 0.483 |

### Interpretation

- LRU is predictable and directly represents user recency. It is the simplest baseline.
- LFU performed best on the frequency-heavy trace because repeated tabs accumulated protection, but its historical counts can become stale.
- CLOCK performed best on the pure recency scan in this simulation and avoids a full candidate sort. The second-chance idea is the standard CLOCK behavior described in the Cornell page-replacement lecture.[2]
- The mixed trace shows why no policy dominates all tab behavior. The choice should depend on whether the user revisits a small hot set or continuously cycles through tabs.

## Memory and storage comparison

| Version | Runtime memory | Persistent storage | Best use case |
|---|---|---|---|
| v1.0.0 | Low: one timestamp per tracked tab | Whitelist only | Simple recency management |
| v1.1.0 | Lowest among the tested LRU variants: one sequence value per tab | Whitelist only | Deterministic, low-overhead general use |
| v1.2.0 | Slightly higher: count plus last-access value per tab | Whitelist only | Users repeatedly returning to a stable group of tabs |
| v1.3.0 | Low-to-moderate: ring entry plus reference bit per tab | Whitelist only | Many tabs where approximate recency and low eviction work matter |

No version persists algorithm state. Only the whitelist is written to `chrome.storage.local`, so service-worker restarts reset policy history while preserving protection settings.

## Recommendation

For the low-memory requirement, v1.1.0 is the safest default: it keeps LRU's direct tab-recency semantics while using a small deterministic map. v1.3.0 is the lower-overhead alternative when the open-tab set is larger. v1.2.0 is preferable when repeated visits to a smaller hot set matter more than immediate recency.

## Verification performed

- `node --check` passed for every `background.js` and `popup.js`.
- Manifest JSON validation passed for all four versions.
- Brave loaded all four version folders as unpacked extensions and exposed each background service worker. The first v1.2.0 probe was a startup race; a retry loaded it successfully.
- Git tags and commits are used for the four versioned releases.

## Sources

[1] https://developer.chrome.com/docs/extensions/reference/api/tabs
[2] https://www.cs.cornell.edu/courses/cs4410/2017su/lectures/lec14-replacement.html
