const state = new Map();
const pendingPrompts = new Set();
const notificationTargets = new Map();
const DEFAULTS = ["gmail.com", "outlook.com"];
const HOUR = 3600000;
const MAX_VISITS = 20;
let activeTabId = null;

function host(tab) {
  try { return new URL(tab.url || "").hostname.toLowerCase(); } catch { return ""; }
}
function entry(tab, now = Date.now()) {
  const item = state.get(tab.id) || { lastAccess: now, visits: 1, activeMs: 0, activatedAt: 0 };
  item.host = host(tab);
  item.groupId = tab.groupId;
  item.openerTabId = tab.openerTabId;
  state.set(tab.id, item);
  return item;
}
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
  tabs.forEach(tab => { if (!state.has(tab.id)) entry(tab); });
  const current = tabs.find(tab => tab.active);
  if (activeTabId === null && current) activeTabId = current.id;
}
function activate(tabId, tab) {
  const now = Date.now();
  if (activeTabId !== null && activeTabId !== tabId) {
    const previous = state.get(activeTabId);
    if (previous && previous.activatedAt) previous.activeMs += Math.max(0, now - previous.activatedAt);
  }
  const item = entry(tab, now);
  item.visits++;
  item.lastAccess = now;
  item.activatedAt = now;
  activeTabId = tabId;
}
function clusterScore(item, active) {
  if (!active) return 0;
  if (item.host && item.host === active.host) return 1;
  if (item.groupId !== -1 && item.groupId === active.groupId) return 0.6;
  if (item.openerTabId === active.id || active.openerTabId === item.openerTabId) return 0.4;
  return 0;
}
function score(tab, active) {
  const now = Date.now();
  const item = entry(tab, now);
  const idle = Math.min((now - item.lastAccess) / (6 * HOUR), 1);
  const aging = 1 - idle;
  const recency = Math.exp(-0.7 * (now - item.lastAccess) / HOUR);
  const frequency = Math.min(Math.log1p(item.visits) / Math.log1p(MAX_VISITS), 1) * aging;
  const activeTime = Math.min(item.activeMs / 120000, 1) * aging;
  const priority = item.groupId !== -1 ? 0.8 : 0.35;
  const focus = active && tab.windowId === active.windowId ? 0.7 : 0;
  const cluster = clusterScore(item, active);
  const retention = 0.35 * recency + 0.20 * frequency + 0.15 * activeTime + 0.10 * priority + 0.10 * focus + 0.10 * cluster;
  return { retention, idle, recency, frequency, activeTime, priority, focus, cluster };
}
async function evict() {
  const tabs = await chrome.tabs.query({});
  await seed();
  const open = tabs.filter(tab => !tab.discarded);
  if (open.length <= 8) return;
  const domains = await getDomains();
  const active = tabs.find(tab => tab.active);
  const candidates = open.filter(tab => !protectedTab(tab, domains));
  candidates.sort((a, b) => score(a, active).retention - score(b, active).retention);
  if (candidates[0]) await chrome.tabs.discard(candidates[0].id);
}
async function notifyNewDomain(tab) {
  const h = host(tab);
  if (!h || !pendingPrompts.has(tab.id)) return;
  pendingPrompts.delete(tab.id);
  const domains = await getDomains();
  if (domains.some(d => h === d || h.endsWith("." + d))) return;
  const id = `protect-${tab.id}-${Date.now()}`;
  notificationTargets.set(id, h);
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Protect this domain?",
    message: `${h} can be protected from automatic tab eviction.`,
    buttons: [{ title: "Protect" }, { title: "Not now" }],
    priority: 1,
    requireInteraction: true
  });
}
async function protectDomain(domain) {
  const domains = await getDomains();
  if (!domains.includes(domain)) await chrome.storage.local.set({ domains: [...domains, domain] });
}
chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.local.get("domains");
  if (!saved.domains) await chrome.storage.local.set({ domains: DEFAULTS });
  chrome.alarms.create("adaptive-eviction", { periodInMinutes: 1 });
  await seed();
});
chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create("adaptive-eviction", { periodInMinutes: 1 });
  await seed();
});
chrome.tabs.onCreated.addListener(tab => { entry(tab); pendingPrompts.add(tab.id); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => { if (pendingPrompts.has(tabId) && changeInfo.url) notifyNewDomain(tab); });
chrome.tabs.onActivated.addListener(async ({ tabId }) => { const tab = await chrome.tabs.get(tabId); activate(tabId, tab); });
chrome.tabs.onRemoved.addListener(tabId => { state.delete(tabId); pendingPrompts.delete(tabId); if (activeTabId === tabId) activeTabId = null; });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "adaptive-eviction") evict(); });
chrome.notifications.onButtonClicked.addListener(async (id, index) => {
  const domain = notificationTargets.get(id);
  if (domain && index === 0) await protectDomain(domain);
  notificationTargets.delete(id);
  chrome.notifications.clear(id);
});
chrome.notifications.onClosed.addListener(id => notificationTargets.delete(id));
