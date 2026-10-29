/* checks.js (Brandon 2026-10-29): Daily checks + reminders, replacing the staff's Outlook "***" to-dos.
   Loaded by hub.html; uses its sb / $ / esc / ME / DESKS. Data: hub_checks + hub_check_runs (hub_checks.sql), filled by
   daily_checks.py on the ThinkStation; people press Done (check_done RPC). Access is in Supabase (RLS + hub_check_mine).
   - checksHome(el): Home card with MY checks due today or still open, and (admins + office managers) a warning when any check has issues.
   - checksView(v):  #/checks — every check you can see, today + the last 14 days of runs.
   - trackBanner():  Wednesdays 4–11 pm, "Track is down tonight / now" (Track's weekly maintenance 9–11 pm, Brandon's Outlook). */
(function(){
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"], NTH = ["","first","second","third","fourth","fifth"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const t12 = s => { if(!s) return ""; const [h, m] = s.split(":").map(Number); return (h % 12 || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + (h < 12 ? " am" : " pm"); };
const when = c => (c.freq === "daily" ? "Every day" : c.freq === "weekly" ? "Every " + DAYS[c.dow] : c.freq === "biweekly" ? "Every other " + DAYS[c.dow]
  : c.freq === "monthly" ? "The " + NTH[c.nth] + " " + DAYS[c.dow] + " of the month" : "Quarterly, the " + c.dom + (c.dom === 1 ? "st" : "th") + " of " + (c.months || []).map(m => MON[m - 1]).join(" / "))
  + (c.at_time && c.at_time.slice(0, 5) !== "07:00" ? ", from " + t12(c.at_time.slice(0, 5)) : "");
const fday = s => new Date(s + "T12:00:00").toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
const pill = (r, overdue) => !r ? (overdue ? `<span class="pill red">overdue</span>` : `<span class="pill amber">to do</span>`)
  : r.status === "ok" ? `<span class="pill green">✓ all good</span>` : r.status === "done" ? `<span class="pill green">✓ done${r.by_name ? " · " + esc(r.by_name.split(" ")[0]) : ""}</span>`
  : r.status === "issues" ? `<span class="pill red">${(r.items || []).length || ""} to fix</span>` : r.status === "list" ? `<span class="pill amber">list ready</span>`
  : r.status === "error" ? `<span class="pill red">check failed</span>` : `<span class="pill">${esc(r.status)}</span>`;
function css(){
  if(document.getElementById("chkcss")) return;
  const s = document.createElement("style"); s.id = "chkcss";
  s.textContent = `.chk .row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--line)}
.chk .row:first-of-type{border-top:0} .chk .ttl{flex:1;min-width:200px} .chk .ttl b{display:block}
.chk details{width:100%} .chk details summary{cursor:pointer;color:var(--muted);font-size:13px}
.chk table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px} .chk td,.chk th{padding:5px 6px;border-top:1px solid var(--line);text-align:left;vertical-align:top}
.chk th{font-weight:600;color:var(--muted)} .chkwarn{border-color:var(--amber)!important;background:color-mix(in srgb,var(--amber) 10%,var(--card))}
.tbanner{background:#7a4b00;color:#fff;padding:8px 18px;font-weight:600;font-size:14px;flex:none}
@media (max-width:640px){.chk .ttl{min-width:0;flex-basis:100%}.chk table{font-size:12px}}`;
  document.head.appendChild(s);
}
function itemsTable(items){
  if(!items || !items.length) return "";
  const usd = n => n == null ? "" : "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 });
  const pay = items.some(i => "trackEarn" in i), money = items.some(i => i.balance != null), adv = items.some(i => i.advantageFile), known = items.some(i => i.known), task = items.some(i => i.task != null);
  return `<details><summary>Show the ${items.length} item${items.length === 1 ? "" : "s"}</summary><div style="overflow-x:auto"><table><tr><th>Home</th><th>Guest</th><th>Dates</th><th>What</th>${pay ? "<th>Airbnb payout</th><th>Track You Earn</th>" : ""}${money ? "<th>Balance</th>" : ""}${known ? "<th>Known?</th>" : ""}${adv ? "<th>Advantage file</th>" : ""}${task ? "<th>Breezeway</th>" : ""}</tr>
    ${items.map(i => `<tr><td>${esc(i.home || "")}</td><td>${esc(i.guest || "")}</td><td>${i.arrive ? esc(i.arrive.slice(5) + (i.depart ? " → " + i.depart.slice(5) : "")) : ""}</td>
      <td>${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.what)}</a>` : esc(i.what)}</td>${pay ? `<td title="${esc(i.payoutSrc || "")}">${usd(i.payout)}</td><td>${usd(i.trackEarn)}</td>` : ""}${money ? `<td>${i.balance != null ? "$" + Number(i.balance).toLocaleString() : ""}</td>` : ""}
      ${known ? `<td>${esc(i.known || "")}</td>` : ""}${adv ? `<td>${esc(i.advantageFile || "")}</td>` : ""}${task ? `<td>${i.task ? `<a href="${esc(i.task)}" target="_blank" rel="noopener">task</a>` : esc(i.taskStatus || "")}</td>` : ""}</tr>`).join("")}</table></div></details>`;
}
async function doneBtn(b, after){
  const note = prompt("Mark done. Anything to note? (optional)", "");
  if(note === null) return;
  b.disabled = true;
  const r = await sb.rpc("check_done", { p_key:b.dataset.done, p_day:b.dataset.day, p_note:note });
  if(r.error){ b.disabled = false; alert("Couldn't save: " + r.error.message); return; }
  after();
}
window.checksHome = async function(el){
  css(); if(!el) return;
  const [m, a] = await Promise.all([sb.rpc("hub_checks_mine"), sb.rpc("hub_checks_alerts")]);
  const mine = m.data || [], al = a.data || [];
  let h = "";
  if(al.length) h += `<div class="card chkwarn"><b style="font-size:17px">⚠️ Daily checks need attention</b>
    ${al.map(x => `<div style="margin-top:6px">${esc(x.title)}: ${esc(x.summary || (x.status ? x.status : "not done yet (due " + fday(x.due) + ")"))}</div>`).join("")}
    <a href="#/checks" style="display:inline-block;margin-top:8px">Open Daily checks →</a></div>`;
  if(mine.length) h += `<div class="card chk"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:17px">☑️ Your checks today</b><a href="#/checks" style="margin-left:auto;font-size:14px">All checks →</a></div>
    ${mine.map(c => { const r = c.run, open = !r || !["ok","done"].includes(r.status);
      return `<div class="row"><div class="ttl"><b>${esc(c.title)}</b><span class="muted" style="font-size:13px">${c.due !== new Date().toLocaleDateString("en-CA") ? "Due " + fday(c.due) + " · " : ""}${esc(r && r.summary ? r.summary : c.how || "")}</span></div>
        ${pill(r, c.overdue)}${c.link ? `<a class="btn small" href="${esc(c.link)}" target="_blank" rel="noopener">Open</a>` : ""}
        ${open && (c.kind === "task" || (r && r.status !== "error")) ? `<button class="btn small primary" data-done="${esc(c.key)}" data-day="${esc(c.due)}">Done</button>` : ""}
        ${r ? itemsTable(r.items) : ""}</div>`; }).join("")}</div>`;
  el.innerHTML = h;
  el.querySelectorAll("[data-done]").forEach(b => b.onclick = () => doneBtn(b, () => checksHome(el)));
};
window.checksView = async function(v){
  css(); $("#ttl").textContent = $("#utl").textContent = "Daily checks";
  v.innerHTML = `<div class="page wide chk"><p style="margin:0 0 6px"><a href="#/reports">← All reports</a></p><h2>Daily checks & reminders</h2><p class="muted">What has to happen, when it last ran, and what it found. Automatic checks run on the office computer each morning; the rest are done by people (press Done).</p><div id="chkl"><p class="muted">Loading…</p></div></div>`;
  const since = new Date(Date.now() - 14 * 864e5).toLocaleDateString("en-CA");
  const [c, r] = await Promise.all([sb.from("hub_checks").select("*").eq("off", false).order("sort"), sb.from("hub_check_runs").select("check_key,day,status,summary,items,by_name,at").gte("day", since).order("at", { ascending:false }).limit(500)]);
  if(c.error) return $("#chkl").innerHTML = `<div class="card"><p class="muted">Couldn't load: ${esc(c.error.message)}</p></div>`;
  if(!(c.data || []).length) return $("#chkl").innerHTML = `<div class="card"><p class="muted">No checks for you yet.</p></div>`;
  const runs = {}; (r.data || []).forEach(x => { const k = x.check_key + "|" + x.day; if(!runs[k]) runs[k] = x; });
  const byCheck = k => Object.values(runs).filter(x => x.check_key === k).sort((a, b) => b.day.localeCompare(a.day));
  $("#chkl").innerHTML = c.data.map(x => { const rs = byCheck(x.key), last = rs[0];
    return `<div class="card"><div class="row" style="border:0;padding-top:0"><div class="ttl"><b style="font-size:16px">${esc(x.title)}</b>
        <span class="muted" style="font-size:13px">${esc(when(x))} · ${x.kind === "auto" ? "automatic" : "done by a person"}${x.source ? " · source: " + esc(x.source) : ""}</span></div>
        ${last ? pill(last) : `<span class="pill">no runs yet</span>`}${x.link ? `<a class="btn small" href="${esc(x.link)}" target="_blank" rel="noopener">Open</a>` : ""}</div>
      <p class="muted" style="margin:4px 0 0">${esc(x.how || "")}</p>
      ${rs.map(y => `<div class="row"><div class="ttl"><b>${fday(y.day)}</b><span class="muted" style="font-size:13px">${esc(y.summary || "")}${y.by_name ? " · " + esc(y.by_name) : ""}</span></div>${pill(y)}${itemsTable(y.items)}</div>`).join("")}</div>`; }).join("");
};
// Track's weekly maintenance: Wednesdays 9–11 pm (Brandon's Outlook "Weekly Track Maintenance"); banner from 4 pm (Brandon 2026-10-29)
window.trackBanner = function(){
  css(); document.querySelectorAll(".tbanner").forEach(x => x.remove());
  if(!ME || !(ME.admin || DESKS.some(x => ["reservations","freshdesk","res_report"].includes(x.key)))) return;
  const n = new Date(), h = n.getHours() + n.getMinutes() / 60;
  if(n.getDay() !== 3 || h < 16 || h >= 23) return;
  const b = document.createElement("div"); b.className = "tbanner"; b.setAttribute("role", "status");
  b.textContent = h >= 21 ? "🛠️ Track is down now (weekly maintenance, back about 11 pm)." : "🛠️ Track is down tonight 9–11 pm for weekly maintenance.";
  const v = document.getElementById("view"); if(v && v.parentNode) v.parentNode.insertBefore(b, v);
};
})();
