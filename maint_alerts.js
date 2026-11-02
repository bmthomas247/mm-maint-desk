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
  .maw .tab.on{background:#3c5f12;color:#fff;border-color:#3c5f12} .maw .grp{margin-bottom:12px} .maw .jobs{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:8px}
  .maw .job{border:1px solid var(--line,#e1e7de);border-radius:12px;padding:10px 12px} .maw .job .t{font-weight:800} .maw .job .m{font-size:12.5px;color:var(--muted,#6b776f);margin:2px 0}
  .maw .job .d{font-size:13px;white-space:pre-wrap;max-height:120px;overflow:auto;margin:6px 0} .maw .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
  .maw .pill{display:inline-block;background:#f3ead7;color:#5a3a00;border-radius:999px;padding:2px 10px;font-size:12.5px;font-weight:700} .maw .old{color:#9b1c1c;font-weight:800}
  .maw input[type=date],.maw select,.maw input[type=text]{font:inherit;font-size:14px;padding:5px 8px;border:1px solid var(--line-2,#cfd8cb);border-radius:8px}</style>`;

function jobBox(j){
  const notes = (j.notes || []).length, pend = (j.bw_pending || []).filter(a => a.status !== "done");
  return `<div class="job"><div class="t">#${j.id} ${e(j.title)}</div>
    <div class="m">${e(ORIG[j.origin] || j.origin || "")} · ${e(j.status)}${j.assigned ? " · " + e(j.assigned) : ""} · made ${day(j.created_at)}${j.due_date ? " · due " + day(j.due_date) : ""} ${bw(j.bw_task_id)}</div>
    ${j.description ? `<div class="d">${e(j.description)}</div>` : ""}
    <div class="m">${notes} note${notes === 1 ? "" : "s"}${j.bw_comments ? ` · ${j.bw_comments} Breezeway comment${j.bw_comments === 1 ? "" : "s"}` : ""}</div>
    ${(j.notes || []).slice(0, 2).map(n => `<div class="m">“${e(n.note)}”</div>`).join("")}
    ${pend.length ? `<div class="m">Sending to Breezeway: ${pend.map(a => e(a.kind) + (a.status === "failed" ? " (failed: " + e(a.result || "") + ")" : "…")).join(", ")}</div>` : ""}</div>`;
}

function dups(el, A){
  if(!A.dups.length){ el.innerHTML = `<div class="card">No duplicate jobs right now.</div>`; return; }
  el.innerHTML = `<div class="card muted" style="margin-bottom:10px">These open jobs look like the same job: same words in the title, due within 14 days of each other. Pick the one to keep and close the other.
      Its notes (and Breezeway comments) are copied onto the one you keep, and its Breezeway task is closed too. The hub never closes one by itself.</div>`
    + A.dups.map(g => `<div class="card grp"><b style="font-size:17px">${e(g.home)}</b> <span class="muted">· ${g.jobs.length} jobs · found ${day(g.first_seen)}</span>
      <div class="jobs">${g.jobs.map(jobBox).join("")}</div>
      <div class="row">Keep <select data-keep="${g.id}">${g.jobs.map((j, i) => `<option value="${j.id}"${i === 0 ? " selected" : ""}>#${j.id}</option>`).join("")}</select>
        and close <select data-close="${g.id}">${g.jobs.map((j, i) => `<option value="${j.id}"${i === 1 ? " selected" : ""}>#${j.id}</option>`).join("")}</select>
        <input type="text" data-why="${g.id}" placeholder="Why (optional)" style="min-width:180px"> <button class="btn primary" data-dup="${g.id}">Close this one</button></div></div>`).join("");
  el.querySelectorAll("[data-dup]").forEach(b => b.onclick = async () => {
    const id = +b.dataset.dup, keep = +el.querySelector(`[data-keep="${id}"]`).value, close = +el.querySelector(`[data-close="${id}"]`).value;
    if(keep === close) return alert("Pick two different jobs: one to keep and one to close.");
    if(!confirm(`Close job #${close} as a duplicate of #${keep}? Its notes are copied to #${keep} first.`)) return;
    b.disabled = true; const r = await sb.rpc("maint_dup_close", { p_group:id, p_close:close, p_keep:keep, p_note:el.querySelector(`[data-why="${id}"]`).value || null });
    if(r.error){ alert(r.error.message.replace(/^.*?: /, "")); b.disabled = false; return; }
    render(); });
}

function guest(el, A){
  const js = A.guest;
  if(!js.length){ el.innerHTML = `<div class="card">No open guest-reported jobs.</div>`; return; }
  el.innerHTML = `<div class="card muted" style="margin-bottom:10px">Every open job a guest reported, oldest first. Schedule a fix or an inspection: a Breezeway job gets its date moved
      (and Chris assigned); any other job gets a new Breezeway task for Chris that's linked to the job, so finishing it in Breezeway closes the job.</div>`
    + js.map(j => { const s = j.sched;
      const st = !s ? "" : s.status === "queued" ? `<span class="pill">Making the Breezeway task for ${day(s.due)}…</span>`
        : s.status === "scheduled" ? `<span class="pill">${s.kind === "inspect" ? "Inspection" : "Fix"} in Breezeway ${day(s.due)}</span> ${bw(s.bw_task_id || j.bw_task_id)}`
        : `<span class="old">Couldn't schedule: ${e(s.note || "")}</span>`;
      const can = !s || s.status === "failed";
      return `<div class="card grp"><b style="font-size:17px">${e(j.home || "")}</b> <span class="${j.age_days >= 21 ? "old" : "muted"}">· open ${j.age_days} day${j.age_days === 1 ? "" : "s"}</span>
        ${j.next_checkin ? `<span class="muted"> · next check-in ${day(j.next_checkin)}</span>` : ""}
        <div class="jobs">${jobBox(j)}</div>
        <div class="row">${st}${can ? `<select data-kind="${j.id}"><option value="fix">Schedule a fix</option><option value="inspect">Schedule an inspection</option></select>
          on <input type="date" data-due="${j.id}" value="${tmr()}"> <button class="btn primary" data-sch="${j.id}">Schedule in Breezeway</button>` : ""}</div></div>`; }).join("");
  el.querySelectorAll("[data-sch]").forEach(b => b.onclick = async () => {
    const id = +b.dataset.sch; b.disabled = true;
    const r = await sb.rpc("maint_job_schedule", { p_job:id, p_kind:el.querySelector(`[data-kind="${id}"]`).value, p_due:el.querySelector(`[data-due="${id}"]`).value });
    if(r.error){ alert(r.error.message.replace(/^.*?: /, "")); b.disabled = false; return; }
    render(); });
}

let V = null, T = null;
async function render(){
  const v = V; if(!v) return;
  const { MA:A } = await window.mmLoadAlerts();
  if(!A){ location.replace("#/home"); return; }
  const gj = A.guest.filter(j => !j.sched || j.sched.status === "failed").length;
  v.innerHTML = `${css}<div class="page maw"><h2 style="margin:0 0 4px">🔧 Maintenance alerts</h2>
    <div class="tabs"><button class="tab${TAB === "dups" ? " on" : ""}" data-t="dups">Duplicate jobs (${A.dups.length})</button>
      <button class="tab${TAB === "guest" ? " on" : ""}" data-t="guest">Guest-reported (${gj} to schedule · ${A.guest.length} open)</button>
      <button class="tab${TAB === "gw" ? " on" : ""}" data-t="gw">Gateways (${A.gateways})</button></div><div id="mapane"></div></div>`;
  v.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { TAB = b.dataset.t; render(); });
  const p = v.querySelector("#mapane");
  if(TAB === "gw") return window.gatewayView(p);
  (TAB === "guest" ? guest : dups)(p, A);
  clearTimeout(T);
  if(A.guest.some(j => j.sched && j.sched.status === "queued") || A.dups.some(g => g.jobs.some(j => (j.bw_pending || []).some(a => a.status === "waiting" || a.status === "sending"))))
    T = setTimeout(() => { if(location.hash.startsWith("#/maint_alerts")) render(); }, 20e3);
}
window.maintAlertsView = function(v, arg){ V = v; if(arg === "guest" || arg === "gw" || arg === "dups") TAB = arg; return render(); };
})();
