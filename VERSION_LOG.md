# Version Log

## v1.0.0 — Original baseline

- Uses LRU eviction.
- Stores `tabId -> timestamp` in a `Map`.
- Updates recency on tab activation.
- Runs one eviction check every minute.
- Discards the oldest eligible tab when more than eight non-discarded tabs are open.
- Protects the active tab, pinned tabs, and whitelisted hostnames.
- Stores the whitelist in `chrome.storage.local`.
- Popup provides priority colors, statistics, whitelist editing, and current-domain protection.

## v1.1.0 — Deterministic LRU

- Keeps LRU as the policy.
- Replaces wall-clock ordering with a monotonic sequence counter.
- Avoids equal-timestamp ordering when several events happen in the same millisecond.
- Keeps the same low memory profile and storage behavior as v1.0.0.

## v1.2.0 — LFU

- Uses a per-tab `{ count, last }` record.
- Selects the least frequently used eligible tab.
- Breaks frequency ties with the oldest access time.
- Better for repeated work on a small set of tabs.
- Can retain historically popular tabs longer than their current usefulness.

## v1.3.0 — CLOCK / Second Chance

- Uses a circular ring, reference-bit map, and moving hand.
- Accessed tabs receive a second chance instead of immediate eviction.
- Uses less ordering work than a full sort and avoids a timestamp per tab.
- Provides a practical low-overhead recency approximation for many open tabs.

## Selection rationale

The three shipped policy families are LRU, LFU, and CLOCK. LRU is the direct fit for tab recency, LFU covers repeated-use workloads, and CLOCK provides a lower-overhead recency approximation. The attached algorithm list's FIFO, RANDOM, and OPTIMAL policies were useful as comparison concepts but not as production policies. TARC was not selected because its affinity, dwell, regret, and persisted-weight state increase complexity and memory for this MVP.
