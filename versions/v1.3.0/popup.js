const $ = id => document.getElementById(id);
let tabs = [], domains = [];
function host(url) { try { return new URL(url || "").hostname.toLowerCase(); } catch { return ""; } }
function isProtected(tab) {
  const h = host(tab.url);
  return tab.active || tab.pinned || domains.some(d => h === d || h.endsWith("." + d));
}
function esc(value) {
  return String(value).replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}
async function load() {
  [tabs, { domains }] = await Promise.all([
    chrome.tabs.query({}), chrome.storage.local.get({ domains: ["gmail.com", "outlook.com"] })
  ]);
  render();
}
function render() {
  const protectedCount = tabs.filter(isProtected).length;
  const discarded = tabs.filter(t => t.discarded).length;
  $("stats").innerHTML = `<div><strong>${tabs.length}</strong><span>open tabs</span></div><div><strong>${discarded}</strong><span>discarded</span></div><div><strong>${protectedCount}</strong><span>protected</span></div>`;
  const ordered = [...tabs].sort((a, b) => Number(isProtected(a)) - Number(isProtected(b)) || a.id - b.id);
  $("tabs").innerHTML = ordered.map((tab, i) => {
    const safe = isProtected(tab), status = safe ? "protected" : i === 0 ? "next" : "soon";
    const label = safe ? "Protected" : i === 0 ? "Next to evict" : "Eviction queue";
    return `<article class="tab-row ${status}"><i class="dot ${status === "next" ? "red" : status === "soon" ? "orange" : "green"}" title="${label}"></i><div class="tab-copy"><b>${esc(tab.title || "Untitled tab")}</b><small>${esc(host(tab.url) || "Special page")}</small></div><span class="status">${label}</span></article>`;
  }).join("") || '<p class="empty">No open tabs found.</p>';
  $("domains").innerHTML = domains.map(d => `<span class="domain">${esc(d)}<button data-domain="${esc(d)}" aria-label="Remove ${esc(d)}">×</button></span>`).join("") || '<small class="empty">No protected domains yet.</small>';
  document.querySelectorAll("[data-domain]").forEach(b => b.onclick = () => remove(b.dataset.domain));
}
async function save() { await chrome.storage.local.set({ domains }); render(); }
async function add(value) {
  value = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (value && !domains.includes(value)) { domains.push(value); await save(); }
  $("domain").value = "";
}
async function remove(value) { domains = domains.filter(d => d !== value); await save(); }
$("add").onclick = () => add($("domain").value);
$("domain").onkeydown = e => { if (e.key === "Enter") add(e.target.value); };
$("protect").onclick = async () => { const active = tabs.find(t => t.active); if (active) await add(host(active.url)); };
load();
