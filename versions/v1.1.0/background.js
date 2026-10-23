const order = new Map();
let sequence = 0;
const DEFAULTS = ["gmail.com", "outlook.com"];
function touch(id) { order.set(id, ++sequence); }
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
  tabs.forEach(t => { if (!order.has(t.id)) touch(t.id); });
}
async function evict() {
  const tabs = await chrome.tabs.query({});
  await seed();
  const open = tabs.filter(t => !t.discarded);
  if (open.length <= 8) return;
  const domains = await getDomains();
  const candidates = open.filter(t => !protectedTab(t, domains));
  candidates.sort((a, b) => order.get(a.id) - order.get(b.id));
  if (candidates[0]) await chrome.tabs.discard(candidates[0].id);
}
chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.local.get("domains");
  if (!saved.domains) await chrome.storage.local.set({ domains: DEFAULTS });
  chrome.alarms.create("lru-eviction", { periodInMinutes: 1 });
  await seed();
});
chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create("lru-eviction", { periodInMinutes: 1 });
  await seed();
});
chrome.tabs.onActivated.addListener(({ tabId }) => touch(tabId));
chrome.tabs.onCreated.addListener(tab => touch(tab.id));
chrome.tabs.onRemoved.addListener(tabId => order.delete(tabId));
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "lru-eviction") evict(); });
