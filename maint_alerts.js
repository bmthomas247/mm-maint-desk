/* Maintenance alerts page #/maint_alerts (hub_maint_alerts.sql, maint_alerts_sync.py; Brandon 2026-11-02).
   Tabs: Duplicate jobs (#8) · Guest-reported jobs (#9) · Gateways (banners.js gatewayView).
   Who: admins + maintenance, housekeeping and office (front desk) managers - maint_alerts() is null for anyone else (sent Home, no hint).
   The hub never closes a job by itself: "Close this one" copies the closed job's notes (and Breezeway comments) onto the job that
   stays, then closes it here and in Breezeway. "Schedule" moves a Breezeway job's date, or makes a new Breezeway task for Chris. */
(function(){
const e = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const day = d => d ? new Date(String(d).slice(0, 10) + "T12:00").toLocaleDateString([], { month:"short", day:"numeric", year:"numeric" }) : "";
const tmr = () => { const d = new Date(Date.now() + 864e5); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const bw = id => id ? `<a href="https://app.breezeway.io/task/${id}" target="_blank" rel="noopener">Breezeway ↗</a>` : "";
const ORIG = { breezeway:"Breezeway", site:"Hub", asana:"Asana", slack:"Slack", freshdesk:"Freshdesk", desk:"Hub" };
let TAB = "dups";
const css = `<style>.maw .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0} .maw .tab{border:1px solid var(--line-2,#cfd8cb);background:var(--card,#fff);padding:7px 16px;border-radius:999px;font:inherit;font-weight:800;cursor:pointer}
  .maw .tab.on{background:#3c5f12;color:#fff;border-color:#3c5f12} .maw .btn.primary,.maw .btn.primary:hover{background:#3c5f12;border-color:#3c5f12;color:#fff} .maw .grp{margin-bottom:12px} .maw .jobs{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:8px}
  .maw .job{border:1px solid var(--line,#e1e7de);border-radius:12px;padding:10px 12px} .maw .job .t{font-weight:800} .maw .job .m{font-size:12.5px;color:var(--muted,#6b776f);margin:2px 0}
  .maw .job .d{font-size:13px;white-space:pre-wrap;max-height:120px;overflow:auto;margin:6px 0} .maw .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
  .maw .pill{display:inline-block;background:#f3ead7;color:#5a3a00;border-radius:999px;padding:2px 10px;font-size:12.5px;font-weight:700} .maw .old{color:#9b1c1c;font-weight:800}
  .maw input[type=date],.maw select,.maw input[type=text]{font:inherit;font-size:14px;padding:5px 8px;border:1px solid var(--line-2,#cfd8cb);border-radius:8px}</style>`;

function jobBox(j, keepId){
  const b = j.bw || {}, notes = j.notes || [], cm = j.bw_comments || [], pend = (j.bw_pending || []).filter(a => a.status !== "done");
  return `<div class="job"${keepId != null ? ` style="${keepId === j.id ? "outline:2px solid #5b8a1e" : ""}"` : ""}>
    ${keepId != null ? `<label style="float:right;font-size:13px;font-weight:700"><input type="radio" name="keep${keepId}" data-keepj="${j.id}"${keepId === j.id ? " checked" : ""}> Keep this one</label>` : ""}
    <div class="t">#${j.id} ${e(j.title)}</div>
    <div class="m">${e(ORIG[j.origin] || j.origin || "")}${j.pm_id ? " routine" : ""} · ${e(j.status)} · made ${day(j.created_at)}${j.created_by && !/^(site|breezeway|asana|slack|freshdesk|sync)$/.test(j.created_by) ? " by " + e(j.created_by) : ""}${j.reported_by ? " · reported by " + e(j.reported_by) : ""}</div>
    <div class="m">${j.due_date ? "Due " + day(j.due_date) : "No due date"}${j.assigned ? " · hub: " + e(j.assigned) : ""}${j.next_checkin ? " · next check-in " + day(j.next_checkin) : ""}</div>
    ${j.bw_task_id ? `<div class="m">Breezeway: ${e(b.status || "not in the hub's copy yet")}${b.date ? " · " + day(b.date) : ""}${(b.people || []).length ? " · " + e(b.people.join(", ")) : " · nobody assigned"}${b.made_by ? " · made by " + e(b.made_by) : ""} ${bw(j.bw_task_id)}</div>` : `<div class="m">Not in Breezeway yet</div>`}
    ${j.description ? `<div class="d">${e(j.description)}</div>` : ""}
    ${notes.length ? `<div class="m"><b>Notes (${notes.length})</b></div>${notes.slice(0, 4).map(n => `<div class="m">${day(n.at)}: “${e(n.note)}”</div>`).join("")}` : ""}
    ${cm.length ? `<div class="m"><b>Breezeway comments (${cm.length})</b></div>${cm.slice(0, 3).map(c => `<div class="m">${day(c.at)}: “${e(c.text)}”</div>`).join("")}` : ""}
    ${pend.length ? `<div class="m">Sending to Breezeway: ${pend.map(a => e(a.kind) + (a.status === "failed" ? " (failed: " + e(a.result || "") + ")" : "…")).join(", ")}</div>` : ""}</div>`;
}

function dups(el, A){
  if(!A.dups.length){ el.innerHTML = `<div class="card">No duplicate jobs right now.</div>`; return; }
  const keep = {}; A.dups.forEach(g => { const bwj = g.jobs.find(j => j.bw_task_id && (j.bw || {}).stage !== "finished"); keep[g.id] = (bwj || g.jobs[0]).id; });
  el.innerHTML = `<div class="card muted" style="margin-bottom:10px">These open jobs look like the same job: same words in the title, due within 14 days of each other. Pick the one to keep,
      pick the day and who does it, then <b>Combine into one</b>: the others close (here and in Breezeway) and all their notes and Breezeway comments are copied onto the one you keep.
      The hub never combines them by itself.</div>`
    + A.dups.map(g => `<div class="card grp"><b style="font-size:17px">${e(g.home)}</b> <span class="muted">· ${g.jobs.length} jobs · found ${day(g.first_seen)}</span>
      <div class="jobs" data-g="${g.id}">${g.jobs.map(j => jobBox(j, keep[g.id])).join("")}</div>
      <div class="row">Do it on <input type="date" data-cd="${g.id}" value="${(window.mmFree(g.home, 1)[0]) || tmr()}"> for ${window.mmPick("data-cp", g.id)}
        <input type="text" data-why="${g.id}" placeholder="Note (optional)" style="min-width:160px"> <button class="btn primary" data-comb="${g.id}">Combine into one</button></div>
      <div class="row">${window.mmChips(g.home, "cchip", g.id)}</div></div>`).join("");
  window.mmChipWire(el, "cchip", "data-cd");
  el.querySelectorAll("[data-keepj]").forEach(r => r.onchange = () => { const box = r.closest(".jobs");
    box.querySelectorAll(".job").forEach(x => x.style.outline = ""); r.closest(".job").style.outline = "2px solid #5b8a1e"; });
  el.querySelectorAll("[data-comb]").forEach(b => b.onclick = async () => {
    const id = +b.dataset.comb, box = el.querySelector(`[data-g="${id}"]`), k = box.querySelector("[data-keepj]:checked");
    if(!k) return alert("Pick the job to keep.");
    const keepId = +k.dataset.keepj, n = box.querySelectorAll(".job").length - 1, pp = el.querySelector(`[data-cp="${id}"]`);
    if(!confirm(`Keep #${keepId} and close the other ${n}? Their notes are copied to #${keepId} first.`)) return;
    b.disabled = true;
    const r = await sb.rpc("maint_dup_combine", { p_group:id, p_keep:keepId, p_due:el.querySelector(`[data-cd="${id}"]`).value || null,
      p_person:pp && pp.value ? +pp.value : null, p_note:el.querySelector(`[data-why="${id}"]`).value || null });
    if(r.error){ alert(r.error.message.replace(/^.*?: /, "")); b.disabled = false; return; }
    render(); });
}

function guest(el, A){
  const js = A.guest;
  if(!js.length){ el.innerHTML = `<div class="card">No open guest-reported jobs.</div>`; return; }
  el.innerHTML = `<div class="card muted" style="margin-bottom:10px">Every open job a guest reported, oldest first. Schedule a fix or an inspection for the day and person you pick:
      a Breezeway job gets its date and person changed; any other job gets a new Breezeway task that's linked to the job, so finishing it in Breezeway closes the job.</div>`
    + js.map(j => { const s = j.sched;
      const st = !s ? "" : s.status === "queued" ? `<span class="pill">Making the Breezeway task for ${day(s.due)}${s.person ? " · " + e(s.person) : ""}…</span>`
        : s.status === "scheduled" ? `<span class="pill">${s.kind === "inspect" ? "Inspection" : "Fix"} in Breezeway ${day(s.due)}${s.person ? " · " + e(s.person) : ""}</span> ${bw(s.bw_task_id || j.bw_task_id)}`
        : `<span class="old">Couldn't schedule: ${e(s.note || "")}</span>`;
      const can = !s || s.status === "failed";
      return `<div class="card grp"><b style="font-size:17px">${e(j.home || "")}</b> <span class="${j.age_days >= 21 ? "old" : "muted"}">· open ${j.age_days} day${j.age_days === 1 ? "" : "s"}</span>
        <div class="jobs">${jobBox(j)}</div>
        <div class="row">${st}${can ? `<select data-kind="${j.id}"><option value="fix">Schedule a fix</option><option value="inspect">Schedule an inspection</option></select>
          on <input type="date" data-due="${j.id}" value="${(window.mmFree(j.home, 1)[0]) || tmr()}"> for ${window.mmPick("data-gp", j.id)} <button class="btn primary" data-sch="${j.id}">Schedule in Breezeway</button>` : ""}</div>
        ${can ? `<div class="row">${window.mmChips(j.home, "gchip", j.id)}</div>` : ""}</div>`; }).join("");
  window.mmChipWire(el, "gchip", "data-due");
  el.querySelectorAll("[data-sch]").forEach(b => b.onclick = async () => {
    const id = +b.dataset.sch, pp = el.querySelector(`[data-gp="${id}"]`); b.disabled = true;
    const r = await sb.rpc("maint_job_schedule", { p_job:id, p_kind:el.querySelector(`[data-kind="${id}"]`).value, p_due:el.querySelector(`[data-due="${id}"]`).value,
      p_person:pp && pp.value ? +pp.value : null });
    if(r.error){ alert(r.error.message.replace(/^.*?: /, "")); b.disabled = false; return; }
    render(); });
}

/* "Not needed right now" (hub_maint_season.sql, Brandon 2026-11-02): seasonal routine jobs open outside their season, e.g. AC turn-ons in
   November. One tap closes the ticked ones (and their Breezeway tasks) and gives AC routines their June-Sept season. Never automatic. */
let WX = null;
async function highs(){
  if(WX) return WX;
  try { const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=40.6461&longitude=-111.498&daily=temperature_2m_max&temperature_unit=fahrenheit&timezone=America%2FDenver&forecast_days=7");
    const j = await r.json(); const t = j.daily.temperature_2m_max.map(Math.round); WX = { lo:Math.min(...t), hi:Math.max(...t) }; } catch(_){ WX = { err:true }; }
  return WX;
}
const md = s => { const [m, d] = s.split("-").map(Number); return new Date(2000, m - 1, d).toLocaleDateString([], { month:"short", day:"numeric" }); };
async function season(el, A){
  const js = A.season || [];
  if(!js.length){ el.innerHTML = `<div class="card">Nothing out of season right now.</div>`; return; }
  const ac = A.ac || {}, w = ac.days ? { lo:ac.min_high, hi:ac.max_high } : await highs(), by = {};
  js.forEach(j => { if(j.why === "weather") j.season = null; const k = j.task.replace(/^(SAME ?DAY|SAMEDAY)[!\/: ]*/i, "").trim(); (by[k] = by[k] || { season:j.season, jobs:[] }).jobs.push(j); });
  el.innerHTML = `<div class="card muted" style="margin-bottom:10px">These routine jobs are open outside their season, so they aren't needed right now even though the schedule made them.
      ${w && !w.err ? `Park City highs the next 7 days: <b>${w.lo}–${w.hi}°F</b> (Open-Meteo, the same forecast as the Home page).` : ""}
      AC jobs come back on their own as soon as a day in the forecast reaches <b>${ac.hot || 80}°F</b>. Untick any you still want, then skip the rest: they close here and in Breezeway.
      The hub never skips them by itself.</div>`
    + Object.entries(by).map(([k, g], gi) => `<div class="card grp"><b style="font-size:17px">${e(k)}</b> <span class="muted">· ${g.season ? `season ${md(g.season[0])} – ${md(g.season[1])}` : `needed when the forecast reaches ${ac.hot || 80}°F`} · ${g.jobs.length} open</span>
      <div class="row" style="flex-direction:column;align-items:flex-start;gap:4px">${g.jobs.map(j => `<label><input type="checkbox" data-sk="${gi}" value="${j.id}" checked> <b>${e(j.home || "")}</b>
        <span class="muted">#${j.id}${j.due_date ? " · due " + day(j.due_date) : ""}</span> ${bw(j.bw_task_id)}</label>`).join("")}</div>
      <div class="row"><button class="btn primary" data-skip="${gi}">Skip the ticked ones until the season</button></div></div>`).join("");
  el.querySelectorAll("[data-skip]").forEach(b => b.onclick = async () => {
    const ids = [...el.querySelectorAll(`[data-sk="${b.dataset.skip}"]:checked`)].map(x => +x.value);
    if(!ids.length) return alert("Tick at least one job.");
    if(!confirm(`Skip ${ids.length} job${ids.length === 1 ? "" : "s"} until the season? They close here and in Breezeway.`)) return;
    b.disabled = true; const r = await sb.rpc("maint_season_skip", { p_ids:ids, p_note:w && !w.err ? `Park City highs ${w.lo}-${w.hi}F this week (Open-Meteo)` : null });
    if(r.error){ alert(r.error.message.replace(/^.*?: /, "")); b.disabled = false; return; }
    render(); });
}

let V = null, T = null;
async function render(){
  const v = V; if(!v) return;
  const [{ MA:A }] = await Promise.all([window.mmLoadAlerts(), window.mmPeople(), window.mmStays()]);
  if(!A){ location.replace("#/home"); return; }
  const gj = A.guest.filter(j => !j.sched || j.sched.status === "failed").length;
  v.innerHTML = `${css}<div class="page maw"><h2 style="margin:0 0 4px">🔧 Maintenance alerts</h2>
    <div class="tabs"><button class="tab${TAB === "dups" ? " on" : ""}" data-t="dups">Duplicate jobs (${A.dups.length})</button>
      <button class="tab${TAB === "guest" ? " on" : ""}" data-t="guest">Guest-reported (${gj} to schedule · ${A.guest.length} open)</button>
      <button class="tab${TAB === "season" ? " on" : ""}" data-t="season">Not needed right now (${(A.season || []).length})</button>
      <button class="tab${TAB === "gw" ? " on" : ""}" data-t="gw">Gateways (${A.gateways})</button></div><div id="mapane"></div></div>`;
  v.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { TAB = b.dataset.t; render(); });
  const p = v.querySelector("#mapane");
  if(TAB === "gw") return window.gatewayView(p);
  (TAB === "guest" ? guest : TAB === "season" ? season : dups)(p, A);
  clearTimeout(T);
  if(A.guest.some(j => j.sched && j.sched.status === "queued") || A.dups.some(g => g.jobs.some(j => (j.bw_pending || []).some(a => a.status === "waiting" || a.status === "sending"))))
    T = setTimeout(() => { if(location.hash.startsWith("#/maint_alerts")) render(); }, 20e3);
}
window.maintAlertsView = function(v, arg){ V = v; if(["guest", "gw", "dups", "season"].includes(arg)) TAB = arg; return render(); };
})();
