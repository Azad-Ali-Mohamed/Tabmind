const $ = id => document.getElementById(id);
let tabs = [], domains = [];
function host(url) { try { return new URL(url || "").hostname.toLowerCase(); } catch { return ""; } }
function isProtected(tab) {
  const h = host(tab.url);
  return tab.active || tab.pinned || domains.some(d => h === d || h.endsWith("." + d));
}
async function load() {
  [tabs, { domains }] = await Promise.all([
    chrome.tabs.query({}), chrome.storage.local.get({ domains: ["gmail.com", "outlook.com"] })
  ]);
  render();
}
function render() {
  const protectedCount = tabs.filter(isProtected).length;
  $("stats").textContent = `${tabs.length} tabs open | ${tabs.filter(t => t.discarded).length} discarded | ${protectedCount} protected`;
  const ordered = [...tabs].sort((a, b) => Number(isProtected(a)) - Number(isProtected(b)) || a.id - b.id);
  $("tabs").innerHTML = ordered.map((tab, i) => {
    const safe = isProtected(tab), cls = safe ? "protected" : i === 0 ? "next" : "soon";
    return `<div class="tab ${cls}"><span>${safe ? "Protected" : i === 0 ? "Next" : "Soon"}</span><b>${esc(tab.title || "Untitled")}</b><small>${esc(host(tab.url) || "special page")}</small></div>`;
  }).join("") || "<p>No tabs found.</p>";
  $("domains").innerHTML = domains.map(d => `<span class="domain">${esc(d)} <button data-domain="${esc(d)}">x</button></span>`).join("") || "<small>No domains.</small>";
  document.querySelectorAll("[data-domain]").forEach(b => b.onclick = () => remove(b.dataset.domain));
}
function esc(value) { return String(value).replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
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
