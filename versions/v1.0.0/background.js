const recency = new Map();
const DEFAULTS = ["gmail.com", "outlook.com"];

function touch(id) { recency.set(id, Date.now()); }
function domain(tab) {
  try { return new URL(tab.url || "").hostname.toLowerCase(); } catch { return ""; }
}
function protectedTab(tab, whitelist) {
  const host = domain(tab);
  return tab.active || tab.pinned || whitelist.some(d => host === d || host.endsWith("." + d));
}

async function whitelist() {
  const { domains } = await chrome.storage.local.get({ domains: DEFAULTS });
  return domains;
}
async function seed() {
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => { if (!recency.has(tab.id)) touch(tab.id); });
}
async function evict() {
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => { if (!recency.has(tab.id)) touch(tab.id); });
  const open = tabs.filter(tab => !tab.discarded);
  if (open.length <= 8) return;
  const domains = await whitelist();
  const candidates = open.filter(tab => !protectedTab(tab, domains));
  candidates.sort((a, b) => (recency.get(a.id) || 0) - (recency.get(b.id) || 0));
  if (candidates[0]) await chrome.tabs.discard(candidates[0].id);
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get("domains");
  if (!current.domains) await chrome.storage.local.set({ domains: DEFAULTS });
  chrome.alarms.create("lru-eviction", { periodInMinutes: 1 });
  await seed();
});
chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create("lru-eviction", { periodInMinutes: 1 });
  await seed();
});
chrome.tabs.onActivated.addListener(({ tabId }) => touch(tabId));
chrome.tabs.onCreated.addListener(tab => touch(tab.id));
chrome.tabs.onRemoved.addListener(tabId => recency.delete(tabId));
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "lru-eviction") evict(); });
