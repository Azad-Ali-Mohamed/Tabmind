const ring = [];
const referenced = new Map();
let hand = 0;
const DEFAULTS = ["gmail.com", "outlook.com"];
function add(id) { if (!ring.includes(id)) ring.push(id); referenced.set(id, 1); }
function host(tab) { try { return new URL(tab.url || "").hostname.toLowerCase(); } catch { return ""; } }
function protectedTab(tab, domains) {
  const h = host(tab);
  return tab.active || tab.pinned || domains.some(d => h === d || h.endsWith("." + d));
}
async function getDomains() {
  const { domains } = await chrome.storage.local.get({ domains: DEFAULTS });
  return domains;
}
async function seed() {
  const tabs = await chrome.tabs.query({});
  tabs.forEach(t => { if (!referenced.has(t.id)) add(t.id); });
}
async function evict() {
  const tabs = await chrome.tabs.query({});
  await seed();
  const open = tabs.filter(t => !t.discarded);
  if (open.length <= 8) return;
  const domains = await getDomains();
  const candidates = new Set(open.filter(t => !protectedTab(t, domains)).map(t => t.id));
  if (!ring.length) return;
  for (let i = 0; i < ring.length * 2; i++) {
    const id = ring[hand];
    hand = (hand + 1) % ring.length;
    if (!candidates.has(id)) continue;
    if (referenced.get(id)) referenced.set(id, 0);
    else { await chrome.tabs.discard(id); return; }
  }
}
chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.local.get("domains");
  if (!saved.domains) await chrome.storage.local.set({ domains: DEFAULTS });
  chrome.alarms.create("clock-eviction", { periodInMinutes: 1 });
  await seed();
});
chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create("clock-eviction", { periodInMinutes: 1 });
  await seed();
});
chrome.tabs.onActivated.addListener(({ tabId }) => { add(tabId); });
chrome.tabs.onCreated.addListener(tab => add(tab.id));
chrome.tabs.onRemoved.addListener(tabId => {
  const i = ring.indexOf(tabId);
  if (i >= 0) { ring.splice(i, 1); if (i < hand) hand--; }
  referenced.delete(tabId);
  hand = ring.length ? Math.max(0, hand) % ring.length : 0;
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "clock-eviction") evict(); });
