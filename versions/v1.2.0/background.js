const usage = new Map();
const DEFAULTS = ["gmail.com", "outlook.com"];
function touch(id) {
  const item = usage.get(id) || { count: 0, last: 0 };
  item.count++;
  item.last = Date.now();
  usage.set(id, item);
}
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
  tabs.forEach(t => { if (!usage.has(t.id)) touch(t.id); });
}
async function evict() {
  const tabs = await chrome.tabs.query({});
  await seed();
  const open = tabs.filter(t => !t.discarded);
  if (open.length <= 8) return;
  const domains = await getDomains();
  const candidates = open.filter(t => !protectedTab(t, domains));
  candidates.sort((a, b) => {
    const x = usage.get(a.id), y = usage.get(b.id);
    return x.count - y.count || x.last - y.last;
  });
  if (candidates[0]) await chrome.tabs.discard(candidates[0].id);
}
chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.local.get("domains");
  if (!saved.domains) await chrome.storage.local.set({ domains: DEFAULTS });
  chrome.alarms.create("lfu-eviction", { periodInMinutes: 1 });
  await seed();
});
chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create("lfu-eviction", { periodInMinutes: 1 });
  await seed();
});
chrome.tabs.onActivated.addListener(({ tabId }) => touch(tabId));
chrome.tabs.onCreated.addListener(tab => touch(tab.id));
chrome.tabs.onRemoved.addListener(tabId => usage.delete(tabId));
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "lfu-eviction") evict(); });
