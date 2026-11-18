/* accounting.js (Brandon 2026-11-05: "set up the accountant and the reports that they will need ... very easy to read yet detailed
   report for our accountant to be able to come in and pull each week"). Sidebar foot ▸ Accounting (#/accounting[/payroll|maint|
   bookings|owner]), desk `accounting` = admins + team `accountant` (allowed_users.role 'outside' = reads nothing else).
   Data: acct_payroll / acct_maint / acct_bookings / acct_owner (hub_accounting.sql), each refuses anyone without the desk.
   Every report: pick the dates, "At a glance" tiles, "Check these" list, detail tables, Download CSV, Print. Hours only (the hub
   keeps no pay rates). Loaded by hub.html; uses its sb / $ / esc / niceErr. */
(function(){
const TABS = [["payroll", "Payroll hours"], ["maint", "Maintenance spending"], ["bookings", "Bookings & payouts"], ["owner", "Owner charges"]];
const PAY_ANCHOR = "2026-11-02";   // first pay period (Mon); every other Monday after (Brandon 2026-10-29)
const A = { stc:{}, logged:{}, tab:"payroll", from:null, to:null, preset:null, data:{}, open:{}, sub:"depart", tf:"", mode:"acct", payInit:false };   // mode "pay" = Staffing ▸ Payroll (#/payroll, 2026-11-17)
const err = e => window.niceErr ? niceErr(e) : (e && e.message) || String(e);
const H = s => esc(s == null ? "" : String(s));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pd = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const add = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const fday = s => s ? pd(s).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }) : "";
const fdate = s => s ? pd(s).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }) : "";
const ftime = s => s ? new Date(s).toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit", timeZone:"America/Denver" }) : "";
const $$ = n => n == null || n === "" ? "" : Number(n).toLocaleString(undefined, { style:"currency", currency:"USD" });
const hh = n => n == null || n === "" ? "–" : (Math.round(Number(n) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 });
const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const today = () => iso(new Date());
function monday(s){ const d = pd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
function payPeriod(s){ const n = Math.floor((pd(s) - pd(PAY_ANCHOR)) / 864e5 / 14); const f = add(PAY_ANCHOR, n * 14); return [f, add(f, 13)]; }
const PRESETS = {
  lastweek: ["Last week", () => { const m = add(monday(today()), -7); return [m, add(m, 6)]; }],
  thisweek: ["This week", () => { const m = monday(today()); return [m, add(m, 6)]; }],
  payperiod: ["This pay period", () => payPeriod(today())],
  lastpay: ["Last pay period", () => payPeriod(add(payPeriod(today())[0], -1))],
  lastmonth: ["Last month", () => { const d = new Date(); const f = new Date(d.getFullYear(), d.getMonth() - 1, 1), t = new Date(d.getFullYear(), d.getMonth(), 0); return [iso(f), iso(t)]; }] };
try { const s = JSON.parse(sessionStorage.getItem("acct") || "{}"); if(s.from){ A.from = s.from; A.to = s.to; A.preset = s.preset || null; } } catch(e) {}
function setPreset(k){ const [f, t] = PRESETS[k][1](); A.from = f; A.to = t; A.preset = k; save(); }
function save(){ try { sessionStorage.setItem("acct", JSON.stringify({ from:A.from, to:A.to, preset:A.preset })); } catch(e) {} }
if(!A.from) setPreset("lastweek");

function css(){
  if(document.getElementById("acctcss")) return;
  const s = document.createElement("style"); s.id = "acctcss";
  s.textContent = `.acct{--ac-forest:#3c5f12;--ac-green:#5b8a1e;--ac-moose:#88B535;--ac-shadow:0 1px 2px rgba(20,40,25,.06),0 4px 14px rgba(20,40,25,.06);font-family:"Manrope",Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-feature-settings:"tnum" 1;max-width:min(1500px,100%)}
.acct .head{background:linear-gradient(135deg,#2f4a10,#5b8a1e);color:#fff;border-radius:20px;padding:18px 20px;margin:0 0 14px;box-shadow:var(--ac-shadow)}
.acct .head h2{margin:0 0 4px;font-size:22px;font-weight:800;letter-spacing:-.01em} .acct .head p{margin:0;opacity:.9;font-size:14px}
.acct .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
.acct .tabs button{border-radius:14px;min-height:42px;padding:9px 16px;font-weight:800;font-size:14.5px;background:var(--card);border:1px solid var(--line);color:var(--ink);box-shadow:var(--ac-shadow);width:auto}
.acct .tabs button.on{background:var(--ac-green);border-color:var(--ac-green);color:#fff}
.acct .card{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--ac-shadow);padding:14px 16px;margin:0 0 12px}
.acct .dates{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.acct .dates .chip{border-radius:11px;min-height:38px;padding:6px 14px;font-weight:700;font-size:14px;border:1px solid var(--line-2,#cfd8cb);background:var(--card);color:var(--ink);width:auto;flex:0 0 auto}
.acct .dates .chip.on{background:var(--ac-green);border-color:var(--ac-green);color:#fff}
.acct .dates input{border-radius:11px;min-height:38px;padding:0 10px;border:1px solid var(--line-2,#cfd8cb);width:auto;font-size:14px}
.acct .dates .sp{flex:1}
.acct .btn2{border-radius:11px;min-height:38px;padding:6px 14px;font-weight:800;font-size:14px;border:1px solid var(--ac-green);background:var(--card);color:var(--ac-forest);width:auto}
.acct .btn2.pri{background:var(--ac-green);color:#fff}
.acct .range{font-size:15px;font-weight:800;margin:10px 2px 0}
.acct .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:0 0 12px}
.acct .tile{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--ac-shadow);padding:12px 14px}
.acct .tile b{display:block;font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.15} .acct .tile span{font-size:13px;color:var(--ink-2);font-weight:600}
.acct .tile small{display:block;font-size:12px;color:var(--muted);margin-top:2px}
.acct h3{font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:18px 2px 8px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.acct .checks li{margin:4px 0;font-size:14.5px} .acct .checks .ok{color:#2e7d32;font-weight:700}
.acct .warn{color:#9a5b00;font-weight:700} .acct .bad{color:#b3261e;font-weight:700}
.acct table{width:100%;border-collapse:collapse;font-size:14px}
.acct th{text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:800;padding:8px 8px;border-bottom:2px solid var(--line);white-space:nowrap}
.acct td{padding:8px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.acct td.n,.acct th.n{text-align:right;white-space:nowrap}
.acct tr.tot td{font-weight:800;border-top:2px solid var(--line)}
.acct tr.click{cursor:pointer} .acct tr.click:hover td{background:color-mix(in srgb,var(--ac-moose) 8%,transparent)}
.acct tr.sub td{background:color-mix(in srgb,var(--ac-moose) 5%,var(--card));padding:10px 14px}
.acct .tw{overflow-x:auto}
.acct .pill{display:inline-block;border-radius:99px;padding:1px 8px;font-size:12px;font-weight:800;background:#eef2ea;color:#3c5f12;margin-left:4px;white-space:nowrap}
.acct .pill.o{background:#fdf0dc;color:#9a5b00} .acct .pill.r{background:#fbe3e1;color:#b3261e} .acct .pill.b{background:#e3eefb;color:#1f5c99}
.acct .src{font-size:12.5px;color:var(--muted);margin:6px 2px 0}
.acct .note{font-size:13.5px;color:var(--ink-2)}
.acct .seg{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px} .acct .seg button{border-radius:11px;min-height:36px;padding:5px 12px;font-weight:700;font-size:13.5px;border:1px solid var(--line-2,#cfd8cb);background:var(--card);color:var(--ink);width:auto}
.acct .seg button.on{background:var(--ac-green);border-color:var(--ac-green);color:#fff}
.acct button.tile{text-align:left;cursor:pointer;width:auto;font:inherit;color:inherit} .acct button.tile:hover{border-color:var(--ac-green)} .acct button.tile.on{border-color:var(--ac-green);box-shadow:0 0 0 2px var(--ac-green) inset}
.acct .ckb{background:none;border:0;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer;width:auto;min-height:0;text-decoration:underline dotted;text-underline-offset:3px} .acct .ckb.on{font-weight:800;text-decoration:underline;color:var(--ac-forest)}
.acct .tfnote{margin:0 2px 8px}
.acct .btn2.sm{min-height:30px;padding:3px 10px;font-size:13px}
.acct .lnk{background:none;border:0;padding:0;color:var(--ac-forest);text-decoration:underline;font:inherit;font-size:13px;cursor:pointer;width:auto;min-height:0}
.acct .pen{background:none;border:1px solid var(--line-2,#cfd8cb);border-radius:8px;padding:0 6px;min-height:24px;font-size:13px;cursor:pointer;width:auto;color:var(--ac-forest)}
.acct .ckl li{margin:2px 0;padding:6px 6px;border-radius:10px;font-size:14.5px} .acct .ckl li label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
.acct .ckl li input{width:18px;height:18px;min-height:0;margin-top:2px;flex:0 0 auto;accent-color:var(--ac-green)}
.acct .ckl li.done span{color:var(--muted);text-decoration:line-through} .acct .ckl li.done .note{text-decoration:none}
.acct .ckl li.info{padding-left:32px}
.acct .apcard{border-left:5px solid #c9a227} .acct .apcard.allok{border-left-color:var(--ac-green)} .acct .ok{color:#2e7d32;font-weight:700}
.acct td.apc{white-space:nowrap}
.acct .pullcard{border-left:5px solid #5b8a1e} .acct .lockcard{border-left:5px solid #9aa59a} .acct .signcard{border-left:5px solid #c9a227} .acct .signcard.allok{border-left-color:#3c5f12} .acct .signrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px} .acct .signone{border:1px solid var(--line);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:3px;align-items:flex-start} .acct .signone.ok{background:color-mix(in srgb,#88B535 8%,var(--card))} .acct .lockcard.paid{border-left-color:#3c5f12;background:color-mix(in srgb,#88B535 6%,var(--card))} .acct .chgbox{margin:6px 2px 0;padding:8px 12px;border-radius:12px;background:#fdf0dc;color:#7a4700} .acct .chgbox ul{margin:4px 0 0;padding-left:18px}
.acct details.ext summary{cursor:pointer;font-size:15px;padding:2px}
.acdlg{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9999;display:grid;place-items:center;padding:16px}
.acdlg .box{background:var(--card,#fff);border-radius:16px;padding:16px;max-width:460px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.25)}
.acdlg input:where(:not([type=checkbox],[type=radio])){min-height:36px;border-radius:10px;border:1px solid var(--line-2,#cfd8cb);padding:0 8px;font-size:15px}
@media (max-width:700px){.acct .tile b{font-size:22px} .acct td,.acct th{padding:6px 5px}}
@media print{body *{visibility:hidden!important} .acct,.acct *{visibility:visible!important} .acct{position:absolute;left:0;top:0;width:100%;max-width:none}
  .acct .noprint{display:none!important} .acct .card,.acct .tile{box-shadow:none} .acct .head{background:none;color:#000;border:1px solid #999} .acct tr.sub{display:table-row!important}}`;
  document.head.appendChild(s);
}

function csv(name, rows){
  const q = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type:"text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}_${A.from}_to_${A.to}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const CSV = {};   // key -> () => [name, rows]
const csvBtn = (k, label = "Download CSV") => `<button type="button" class="btn2 noprint" data-csv="${k}">⬇ ${label}</button>`;
const tile = (big, label, small = "", k = "") => k ? `<button type="button" class="tile${A.tf === k ? " on" : ""}" data-tf="${k}" title="Show only these (tap again for all)"><b>${big}</b><span>${label}</span>${small ? `<small>${small}</small>` : ""}</button>`
  : `<div class="tile"><b>${big}</b><span>${label}</span>${small ? `<small>${small}</small>` : ""}</div>`;
// a check line can be [filter key, html]: tapping it shows only those rows in the table below (tap again for all)
const checks = items => `<div class="card"><h3 style="margin-top:0">Check these</h3><ul class="checks" style="margin:0;padding-left:20px">${
  items.length ? items.map(x => Array.isArray(x) ? `<li><button type="button" class="ckb${A.tf === x[0] ? " on" : ""}" data-tf="${x[0]}" title="Show only these (tap again for all)">${x[1]}</button></li>` : `<li>${x}</li>`).join("") : `<li class="ok">Nothing to check. Everything lines up.</li>`}</ul></div>`;
const tfNote = (n, what) => `<p class="note tfnote noprint">Showing ${n} ${n === 1 ? what.replace(/^(stay|cost|service|booking|cancellation)s/, "$1").replace(/ (stays|costs|services|bookings)/, m => m.slice(0, -1)).replace(/^cancellations$/, "cancellation") : what} · <a href="#" data-tf="">show all</a></p>`;
const BSUB = { b_out:"depart", b_bk:"booked", b_cn:"cancel", b_owed:"depart", b_cnpaid:"cancel" };

async function load(tab){
  const key = `${tab}|${A.from}|${A.to}`;
  if(A.data[key]) return A.data[key];
  const fn = { payroll:"acct_payroll", maint:"acct_maint", bookings:"acct_bookings", owner:"acct_owner" }[tab];
  const r = await sb.rpc(fn, { p_from:A.from, p_to:A.to });
  if(r.error) throw r.error;
  return (A.data[key] = r.data);
}

// ---------- Payroll ----------
// 2026-11-18 (Brandon): extended team (hub_pay_extended) clock in for our records but aren't on Moose payroll -> own folded card, left out of
// totals / QuickBooks / CSVs. Salaried people get their own card. Managers approve each person's hours for the pay period (pay_approve;
// Maria can pay without it, the pill just shows a manager checked them). "Check these" lines are check boxes (pay_check, kept by item key).
// ✎ on a shift changes its times (clock_edit / clock_add; managers + admins for people they look after). Hubstaff is gone from this page.
const SNAPK = ["reg_h", "hol_h", "ot_total", "pto_h", "other_h", "unpaid_h"];
const PC = { st:null, canA:new Set(), apv:new Map(), ckm:new Map(), byId:new Map() };
const fwhen = s => s ? new Date(s).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZone:"America/Denver" }) : "";
const SNAPL = { reg_h:"regular", hol_h:"holiday", ot_total:"overtime", pto_h:"PTO", other_h:"other paid", unpaid_h:"unpaid off" };
function snapDiff(snap, people){   // [{name, txt}] for people whose hours moved since the snapshot
  const out = [], seen = new Set();
  (people || []).filter(p => !p.extended).forEach(p => { const was = snap[p.id]; seen.add(p.id);
    const d = SNAPK.filter(k => Math.abs((+(was || {})[k] || 0) - (+p[k] || 0)) > 0.009).map(k => {
      const b = +(was || {})[k] || 0, n = +p[k] || 0, ch = n - b;
      return `${SNAPL[k]} ${hh(b)} → ${hh(n)} (${ch > 0 ? "+" : ""}${hh(ch)})`; });
    if(d.length) out.push({ name:p.name, txt:(was ? "" : "new since then: ") + d.join(", ") }); });
  Object.entries(snap || {}).forEach(([id, w]) => { if(!seen.has(id) && SNAPK.some(k => +w[k])) out.push({ name:w.name, txt:"no longer on the list" }); });
  return out;
}
function apState(p){
  const a = PC.apv.get(p.id);
  if(!a || !a.ok) return { s:"none", a };
  const ch = a.snap && SNAPK.some(k => Math.abs((+a.snap[k] || 0) - (+p[k] || 0)) > 0.009);
  return { s: ch ? "changed" : "ok", a };
}
function apPill(p){
  const { s, a } = apState(p), can = PC.canA.has(p.id);
  let h = s === "ok" ? `<span class="pill" title="${H(a.note || "")}">✓ Approved by ${H(a.by)} · ${fwhen(a.at)}</span>`
    : s === "changed" ? `<span class="pill o" title="Approved ${fwhen(a.at)}">Hours changed after ${H(a.by)} approved</span>`
    : `<span class="pill r">Not approved yet</span>`;
  if(can && s !== "ok") h += ` <button type="button" class="btn2 sm noprint" data-apv="${p.id}">✓ Approve</button>`;
  if(can && s === "ok") h += ` <button type="button" class="lnk noprint" data-unapv="${p.id}">undo</button>`;
  return h;
}
function payroll(x){
  const ST = PC.st || { approvals:[], can_approve:[], checks:[] };
  PC.canA = new Set(ST.can_approve || []);
  PC.apv = new Map((ST.approvals || []).map(a => [a.user_id, a]));
  PC.ckm = new Map((ST.checks || []).map(c => [c.item, c]));
  const has = p => p.hub_h || (p.timeoff || []).length || p.pending || p.open;
  const ALL = x.people || [];
  PC.byId = new Map(ALL.map(p => [p.id, p]));
  const EXT = ALL.filter(p => p.extended && has(p));
  const HR = ALL.filter(p => !p.extended && !p.salaried && has(p));
  const SAL = ALL.filter(p => !p.extended && p.salaried);
  const P = [...HR, ...SAL];   // on Moose payroll
  const idle = ALL.filter(p => !p.extended && !p.salaried && !has(p)).length;
  const tot = p => (Number(p.reg_h) || 0) + (Number(p.hol_h) || 0) + (Number(p.ot_total) || 0) + (Number(p.pto_h) || 0) + (Number(p.other_h) || 0);
  const ptoLeft = p => (p.pto || []).map(b => `${hh(b.hours)} h`).join(" + ");
  const z = n => Number(n) ? hh(n) : "–";

  // ---- check list (each line = a check box, kept by key; ticked lines drop to the bottom)
  const ck = [];   // {k, h} ; k null = info only
  if(x.from < "2026-10-30") ck.push({ k:null, h:`<span class="warn">Hub clock-ins started Fri Oct 30, 2026. Days before that aren't in these hours.</span>` });
  P.forEach(p => {
    if(p.pending) ck.push({ k:`pend:${p.id}:${x.from}:${x.to}:${p.pending}`, h:`<b>${H(p.name)}</b>: ${p.pending} missed punch${p.pending > 1 ? "es" : ""} waiting for a manager's OK (not counted below).` });
    (p.shifts || []).filter(s => !s.out).forEach(s => ck.push({ k:`open:${s.in_id}`, h:`<b>${H(p.name)}</b>: clocked in ${fday(s.day)} ${ftime(s.in)} with no clock-out.` }));
    (p.weeks || []).forEach(w => { if(w.ot_h > 0) ck.push({ k:`ot:${p.id}:${w.start}:${hh(w.ot_h)}`, h:`<b>${H(p.name)}</b>: <span class="bad">${hh(w.ot_h)} h overtime</span> in the week of ${fday(w.start)}${w.partial ? " (week runs past these dates)" : ""}.` }); });
    if(p.edited) ck.push({ k:`edit:${p.id}:${x.from}:${x.to}:${p.edited}`, h:`<b>${H(p.name)}</b>: ${p.edited} shift${p.edited > 1 ? "s" : ""} edited by hand (reason shown in the detail).` });
    (p.shifts || []).filter(s => s.hours > 12).forEach(s => ck.push({ k:`long:${s.in_id}:${s.out_id}`, h:`<b>${H(p.name)}</b>: <span class="bad">${hh(s.hours)} h shift</span> on ${fday(s.day)} (${ftime(s.in)} – ${ftime(s.out)}). Likely a missed clock-out; fix it with ✎ in their detail.` }));
  });
  (x.holidays || []).forEach(h => ck.push({ k:null, h:`<b>${H(h.name)}</b> (${fday(h.day)}) is a paid holiday: hours worked that day are in the Holiday column.` }));
  const ckRow = c => {
    if(!c.k) return `<li class="info">${c.h}</li>`;
    const d = PC.ckm.get(c.k), done = d && d.done;
    return `<li class="${done ? "done" : ""}"><label><input type="checkbox" data-ck="${H(c.k)}" ${done ? "checked" : ""}> <span>${c.h}</span></label>${done ? ` <span class="note">✓ ${H(d.by || "")}, ${fwhen(d.at)}</span>` : ""}</li>`;
  };
  const open = ck.filter(c => c.k && !(PC.ckm.get(c.k) || {}).done), shut = ck.filter(c => c.k && (PC.ckm.get(c.k) || {}).done), info = ck.filter(c => !c.k);
  const checkCard = `<div class="card"><h3 style="margin-top:0">Check these <span class="note" style="text-transform:none;letter-spacing:0">${open.length ? `${open.length} left` : ck.some(c => c.k) ? "all checked ✓" : ""}</span></h3>
    <ul class="checks ckl" style="margin:0;padding-left:4px;list-style:none">${[...open, ...info, ...shut].map(ckRow).join("") || `<li class="ok">Nothing to check. Everything lines up.</li>`}</ul>
    <p class="src">Tick a line once it's sorted out; everyone with Payroll sees who ticked it and when.</p></div>`;

  // ---- manager approval
  const need = P.filter(p => tot(p) > 0 || Number(p.unpaid_h));
  const okN = need.filter(p => apState(p).s === "ok").length;
  const mine = need.filter(p => PC.canA.has(p.id) && apState(p).s !== "ok");
  const notOk = need.filter(p => apState(p).s !== "ok");
  const apCard = `<div class="card apcard ${okN === need.length && need.length ? "allok" : ""}"><h3 style="margin-top:0">Manager approval <span class="noprint">${mine.length ? `<button type="button" class="btn2 pri" data-apvall="${mine.map(p => p.id).join(",")}">✓ Approve ${mine.length === 1 ? H(mine[0].name) : `all ${mine.length} of your people`}</button>` : ""}</span></h3>
    <p style="margin:0 2px 6px;font-size:16px"><b>${okN} of ${need.length}</b> ${need.length === 1 ? "person" : "people"} approved for ${fdate(x.from)} – ${fdate(x.to)}.</p>
    ${notOk.length ? `<p class="note" style="margin:0 2px">Still waiting: ${notOk.map(p => `${H(p.name)}${apState(p).s === "changed" ? " (hours changed after approval)" : ""}`).join(", ")}.</p>` : need.length ? `<p class="ok" style="margin:0 2px">✓ Every person's hours have been approved by a manager.</p>` : ""}
    <p class="src">A manager approves the hours of the people they look after (admins approve anyone). Approving isn't required to pay; it shows a manager checked the hours. If hours change after approval, it asks again.</p></div>`;

  // ---- paid lock + corrections (Brandon 2026-11-18: "lock" + "tell maria when ready")
  const PD = (PC.st && PC.st.paid) || null, isPaid = PD && PD.status === "paid";
  const sincePaid = isPaid && PD.snap ? snapDiff(PD.snap, ALL) : [];
  const RD = PC.st && PC.st.ready;
  const lockCard = `<div class="card lockcard ${isPaid ? "paid" : ""}"><h3 style="margin-top:0">${isPaid ? "🔒 Paid" : "Pay period status"}
      <span class="noprint">${!isPaid && PC.st && PC.st.can_pay ? `<button type="button" class="btn2 pri" data-paid="1">✓ Mark this pay period paid</button>` : ""}${isPaid && PC.st && PC.st.can_unlock ? `<button type="button" class="btn2" data-paid="0">Unlock</button>` : ""}</span></h3>
    ${isPaid ? `<p style="margin:0 2px 4px"><b>${H(PD.by)}</b> marked ${fdate(x.from)} – ${fdate(x.to)} paid on <b>${fwhen(PD.at)}</b>. Changing these hours now needs a note, and every change shows here and on the next pay period as a correction.</p>`
      : PD && PD.status === "open" ? `<p class="note" style="margin:0 2px 4px">Unlocked by ${H(PD.by)} on ${fwhen(PD.at)}${PD.note ? `: ${H(PD.note)}` : ""}.</p>`
      : `<p class="note" style="margin:0 2px 4px">Not marked paid yet. Once the accountant pays it, she taps <b>Mark this pay period paid</b> and the hours lock.</p>`}
    ${RD ? `<p class="note" style="margin:0 2px 4px">📣 After all three signed off, the accountant was told the hours are ready on ${fwhen(RD.at)}${RD.email_at ? " (bell + email)" : " (bell)"}.</p>` : ""}
    ${sincePaid.length ? `<div class="chgbox"><b>⚠ Changed after it was paid</b> — add these to the next payroll:<ul>${sincePaid.map(c => `<li><b>${H(c.name)}</b>: ${H(c.txt)}</li>`).join("")}</ul></div>` : isPaid ? `<p class="ok" style="margin:4px 2px 0">No changes since it was paid.</p>` : ""}</div>`;
  // ---- sign-off (Brandon 2026-11-18: "it only goes when brandon, chris and cheree say its ready all three have to check off")
  const SG = (PC.st && PC.st.signers) || [], myName = (typeof ME !== "undefined" && ME && ME.name) || "";
  const allSigned = SG.length && SG.every(s => s.ok);
  const signCard = SG.length ? `<div class="card signcard ${allSigned ? "allok" : ""}"><h3 style="margin-top:0">Ready for the accountant? <span class="note" style="text-transform:none;letter-spacing:0">${SG.filter(s => s.ok).length} of ${SG.length} signed off</span></h3>
    <div class="signrow">${SG.map(s => { const mine = PC.st.can_signoff && s.name === myName;
      return `<div class="signone ${s.ok ? "ok" : ""}"><b>${s.ok ? "✅" : "⏳"} ${H(s.name.split(" ")[0])}</b><span class="note">${H(s.covers || "")}</span>
        <span class="note">${s.ok ? `Signed off ${fwhen(s.at)}` : "Not yet"}</span>
        ${mine ? (s.ok ? `<button type="button" class="lnk noprint" data-sign="0">Take it back</button>` : `<button type="button" class="btn2 pri sm noprint" data-sign="1">✓ My hours are ready</button>`) : ""}</div>`; }).join("")}</div>
    <p class="src">${allSigned ? "All three signed off, so the accountant gets a bell and an email (once per pay period)." : "When all three sign off, the accountant gets a bell and an email from hello@. Each person checks their own team's hours first."}</p></div>` : "";
  const PP = PC.st && PC.st.prev_paid, prevChg = PP && PP.snap && PC.prevData ? snapDiff(PP.snap, PC.prevData.people) : [];
  const corrCard = prevChg.length ? `<div class="card"><h3 style="margin-top:0">Corrections from the last paid pay period</h3>
    <p class="note" style="margin:0 2px 6px">${fdate(PP.from)} – ${fdate(PP.to)} was paid on ${fwhen(PP.at)} (${H(PP.by)}). These hours changed after that; add the difference to this payroll.</p>
    <div class="chgbox" style="margin-top:0"><ul style="margin:0">${prevChg.map(c => `<li><b>${H(c.name)}</b>: ${H(c.txt)}</li>`).join("")}</ul></div></div>` : "";
  // ---- the accountant's pulls (Brandon 2026-11-18: "shows marias last download ... so we know when she pulled hours last")
  const PL = (PC.st && PC.st.pulls) || {};
  const WHAT = { pay_qb:"QuickBooks CSV", pay_sum:"Breakdown CSV", pay_days:"By day CSV", pay_shifts:"Punches CSV", pay_off:"Time off CSV", pay_pto:"PTO balances CSV" };
  const whatL = q => q.kind === "print" ? "printed the report" : q.kind === "open" ? "opened Payroll" : `downloaded the ${WHAT[q.what] || "CSV"}`;
  const dl = PL.acct_dl, changed = [];
  if(dl && dl.snap){
    const LBL = { reg_h:"regular", hol_h:"holiday", ot_total:"overtime", pto_h:"PTO", other_h:"other paid", unpaid_h:"unpaid off" };
    P.forEach(p => { const was = dl.snap[p.id];
      const diffs = SNAPK.filter(k => Math.abs((+(was || {})[k] || 0) - (+p[k] || 0)) > 0.009)
        .map(k => `${LBL[k]} ${hh((was || {})[k] || 0)} → ${hh(p[k])}`);
      if(diffs.length && (was || tot(p) > 0)) changed.push({ p, txt: was ? diffs.join(", ") : "new on the list since then" }); });
  }
  PC.changed = new Set(changed.map(c => c.p.id));
  const any = PL.acct_any, other = any && !(any.from === x.from && any.to === x.to);
  const pullCard = `<div class="card pullcard"><h3 style="margin-top:0">Accountant's downloads</h3>
    <p style="margin:0 2px 4px">${dl ? `✅ <b>${H(dl.by)}</b> ${whatL(dl)} for this pay period on <b>${fwhen(dl.at)}</b>.` : `⏳ The accountant hasn't downloaded this pay period yet.`}</p>
    ${PL.acct_open ? `<p class="note" style="margin:0 2px 4px">Last opened Payroll for this pay period: ${fwhen(PL.acct_open.at)}.</p>` : ""}
    ${other ? `<p class="note" style="margin:0 2px 4px">Most recent download of any pay period: ${H(any.by)} ${whatL(any)} for ${fdate(any.from)} – ${fdate(any.to)} on ${fwhen(any.at)}.</p>` : ""}
    ${changed.length ? `<div class="chgbox"><b>⚠ Changed since that download</b> — re-download before paying so the newest hours are used:<ul>${changed.map(c => `<li><b>${H(c.p.name)}</b>: ${H(c.txt)}</li>`).join("")}</ul></div>`
      : dl ? `<p class="ok" style="margin:4px 2px 0">Nothing has changed since that download.</p>` : ""}
    ${(PL.recent || []).length ? `<details class="noprint" style="margin-top:6px"><summary class="note" style="cursor:pointer">Who opened or downloaded this pay period (${PL.recent.length})</summary>
      <ul style="margin:6px 0 0;padding-left:18px">${PL.recent.map(q => `<li class="note">${fwhen(q.at)} · ${H(q.by || "")}${q.acct ? " (accountant)" : ""} ${whatL(q)}</li>`).join("")}</ul></details>` : ""}
    <p class="src">Every open, CSV download and print of this report is logged. Downloads keep a copy of each person's hours, so any change made after the accountant pulled shows here.</p></div>`;
  // ---- CSVs (Moose payroll only)
  const apTxt = p => { const { s, a } = apState(p); return s === "ok" ? `${a.by} ${fwhen(a.at)}` : s === "changed" ? `changed after ${a.by} approved` : ""; };
  const QB = P.filter(p => tot(p) > 0 || Number(p.unpaid_h));
  CSV.pay_qb = () => ["quickbooks_payroll_" + x.from + "_to_" + x.to, [["Pay period", "Employee", "Pay type", "Regular Pay (hrs)", "Overtime Pay (hrs)", "Holiday Pay (hrs)", "Paid Time Off (hrs)", "Other paid (hrs)", "Total hours", "PTO balance for pay stub (hrs)", "Unpaid time off (hrs, not paid)", "Approved by"],
    ...QB.map(p => [`${x.from} to ${x.to}`, p.name, p.salaried ? "Salaried" : "Hourly", hh(p.reg_h), hh(p.ot_total), hh(p.hol_h), hh(p.pto_h), hh(p.other_h), hh(tot(p)), (p.pto || []).map(b => hh(b.hours)).join(" + "), hh(p.unpaid_h), apTxt(p)])]];
  CSV.pay_sum = () => ["payroll_breakdown", [["Name", "Teams", "Pay type", "Regular hours", "Holiday hours (worked)", "Overtime hours", "PTO hours", "Other paid hours", "Total paid hours", "Unpaid time off hours", "PTO balance (hours left)", "Missed punches waiting", "Approved by"],
    ...P.map(p => [p.name, (p.teams || []).join("; "), p.salaried ? "Salaried" : "Hourly", hh(p.reg_h), hh(p.hol_h), hh(p.ot_total), hh(p.pto_h), hh(p.other_h), hh(tot(p)),
      hh(p.unpaid_h), (p.pto || []).map(b => hh(b.hours)).join(" + "), p.pending || 0, apTxt(p)]),
    ["Total", "", "", hh(sum(P, p => p.reg_h)), hh(sum(P, p => p.hol_h)), hh(sum(P, p => p.ot_total)), hh(sum(P, p => p.pto_h)), hh(sum(P, p => p.other_h)), hh(sum(P, tot)), hh(sum(P, p => p.unpaid_h)), "", "", ""]]];
  CSV.pay_days = () => ["payroll_by_day", [["Name", "Date", "Holiday", "Regular", "Holiday hours (worked)", "Overtime", "PTO", "Other paid", "Total paid", "Unpaid off", "Clocked"],
    ...P.flatMap(p => (p.days || []).filter(d => d.hub_h || d.pto || d.other || d.unpaid).map(d => [p.name, d.day, d.holiday || "", hh(d.reg), hh(d.hol), hh(d.ot), hh(d.pto), hh(d.other),
      hh((+d.reg || 0) + (+d.hol || 0) + (+d.ot || 0) + (+d.pto || 0) + (+d.other || 0)), hh(d.unpaid), hh(d.hub_h)]))]];
  CSV.pay_shifts = () => ["payroll_punches", [["Name", "Date", "Clock in", "Clock out", "Hours", "Edited", "Edit reason", "Added by hand"],
    ...P.flatMap(p => (p.shifts || []).map(s => [p.name, s.day, ftime(s.in), s.out ? ftime(s.out) : "still in", s.hours == null ? "" : hh(s.hours), s.edited ? "yes" : "", s.note || "", s.added ? "yes" : ""]))]];
  CSV.pay_pto = () => ["payroll_pto_balances", [["Name", "Policy", "Hours left", "As of"],
    ...P.flatMap(p => (p.pto || []).map(b => [p.name, b.policy || "", hh(b.hours), b.as_of ? new Date(b.as_of).toLocaleDateString() : ""]))]];
  CSV.pay_off = () => ["payroll_time_off", [["Name", "From", "To", "Hours", "Kind", "Policy", "Paid", "Approved by"],
    ...P.flatMap(p => (p.timeoff || []).map(t => [p.name, t.from, t.to, hh(t.hours), t.kind, t.policy || "", t.paid ? "yes" : "no", t.approved_by || ""]))]];

  const qbCard = `<div class="card qb"><h3 style="margin-top:0">For QuickBooks <span class="noprint">${csvBtn("pay_qb", "QuickBooks CSV")}</span></h3>
      <p class="note" style="margin:0 2px 8px">Pay period ${fdate(x.from)} – ${fdate(x.to)}. One line per person on Moose payroll, in the same order as the pay items on QuickBooks' Run payroll screen. Type each number into that person's line, and put the PTO balance on their pay stub.</p>
      <div class="tw"><table><thead><tr><th>Employee</th><th class="n">Regular Pay</th><th class="n">Overtime Pay</th><th class="n">Holiday Pay</th><th class="n">Paid Time Off</th><th class="n">Other paid</th><th class="n">Total hours</th><th class="n">PTO balance</th><th>Manager</th></tr></thead>
      <tbody>${QB.map(p => `<tr><td><b>${H(p.name)}</b>${p.salaried ? ` <span class="pill b">Salaried</span>` : ""}</td><td class="n">${z(p.reg_h)}</td><td class="n">${z(p.ot_total)}</td><td class="n">${z(p.hol_h)}</td><td class="n">${z(p.pto_h)}</td><td class="n">${z(p.other_h)}</td><td class="n"><b>${hh(tot(p))}</b></td><td class="n">${ptoLeft(p) || "–"}</td><td>${apState(p).s === "ok" ? `<span class="pill">✓ ${H(apState(p).a.by)}</span>` : apState(p).s === "changed" ? `<span class="pill o">changed</span>` : `<span class="pill r">not yet</span>`}</td></tr>`).join("")
        || `<tr><td colspan="9" class="note">No paid hours in these dates.</td></tr>`}
      ${QB.length ? `<tr class="tot"><td>Total</td><td class="n">${hh(sum(QB, p => p.reg_h))}</td><td class="n">${hh(sum(QB, p => p.ot_total))}</td><td class="n">${hh(sum(QB, p => p.hol_h))}</td><td class="n">${hh(sum(QB, p => p.pto_h))}</td><td class="n">${hh(sum(QB, p => p.other_h))}</td><td class="n">${hh(sum(QB, tot))}</td><td></td><td></td></tr>` : ""}</tbody></table></div></div>`;

  const row = (p, cols, ncol) => { const k = "p" + p.id, op = A.open[k];
    return `<tr class="click" data-open="${k}"><td><b>${H(p.name)}</b>${p.no_clock && !p.salaried ? `<span class="pill o">Doesn't clock in</span>` : ""}${PC.changed && PC.changed.has(p.id) ? ` <span class="pill o" title="Hours changed after the accountant's last download">changed since download</span>` : ""}<br><span class="note">${H((p.teams || []).join(", "))}</span></td>${cols}<td class="noprint">${op ? "▴" : "▾"}</td></tr>`
      + (op ? `<tr class="sub"><td colspan="${ncol}">${payDetail(p)}</td></tr>` : ""); };
  const hrRows = HR.map(p => row(p, `<td class="n">${z(p.reg_h)}</td><td class="n">${z(p.hol_h)}</td><td class="n">${Number(p.ot_total) ? `<span class="bad">${hh(p.ot_total)}</span>` : "–"}</td>
      <td class="n">${z(p.pto_h)}</td><td class="n">${z(p.other_h)}</td><td class="n"><b>${hh(tot(p))}</b></td><td class="n">${z(p.unpaid_h)}</td><td class="n">${ptoLeft(p) || "–"}</td><td class="apc">${apPill(p)}</td>`, 11)).join("");
  const salRows = SAL.map(p => row(p, `<td class="n">${z(p.pto_h)}</td><td class="n">${z(p.other_h)}</td><td class="n">${z(p.unpaid_h)}</td><td class="n">${ptoLeft(p) || "–"}</td><td class="apc">${(tot(p) > 0 || Number(p.unpaid_h)) ? apPill(p) : `<span class="note">nothing to approve</span>`}</td>`, 7)).join("");
  const extRows = EXT.map(p => row(p, `<td class="n">${hh(p.hub_h)}</td><td class="n">${(p.shifts || []).length}</td>`, 4)).join("");

  return `<div class="tiles">${tile(hh(sum(P, tot)), "Total paid hours", `${QB.length} people on Moose payroll`)}
      ${tile(hh(sum(P, p => p.reg_h)), "Regular hours", "")}
      ${tile(hh(sum(P, p => p.ot_total)), "Overtime hours", `over 40 in a ${H(x.week_start)}–start workweek`)}
      ${tile(hh(sum(P, p => p.hol_h)), "Holiday hours", "worked on a paid holiday")}
      ${tile(hh(sum(P, p => p.pto_h)), "PTO hours", `${hh(sum(P, p => p.other_h))} h other paid · ${hh(sum(P, p => p.unpaid_h))} h unpaid`)}
      ${tile(`${okN}/${need.length}`, "Approved by a manager", okN === need.length && need.length ? "all approved ✓" : "")}</div>
    ${signCard}
    ${lockCard}
    ${corrCard}
    ${apCard}
    ${pullCard}
    ${checkCard}
    ${qbCard}
    <div class="card"><h3 style="margin-top:0">Hourly: hours by person <span class="noprint">${csvBtn("pay_sum", "Breakdown CSV")} ${csvBtn("pay_days", "By day CSV")} ${csvBtn("pay_shifts", "Punches CSV")} ${csvBtn("pay_off", "Time off CSV")} ${csvBtn("pay_pto", "PTO balances CSV")}</span></h3>
      ${x.scope === "team" ? `<p class="note" style="margin:0 2px 8px">Showing the people you look after.</p>` : ""}
      <div class="tw"><table><thead><tr><th>Person</th><th class="n">Regular</th><th class="n">Holiday</th><th class="n">Overtime</th><th class="n">PTO</th><th class="n">Other paid</th><th class="n">Total paid</th><th class="n">Unpaid off</th><th class="n">PTO left</th><th>Manager</th><th class="noprint"></th></tr></thead>
      <tbody>${hrRows || `<tr><td colspan="11" class="note">No hourly hours in these dates.</td></tr>`}
      ${HR.length ? `<tr class="tot"><td>Total</td><td class="n">${hh(sum(HR, p => p.reg_h))}</td><td class="n">${hh(sum(HR, p => p.hol_h))}</td><td class="n">${hh(sum(HR, p => p.ot_total))}</td><td class="n">${hh(sum(HR, p => p.pto_h))}</td><td class="n">${hh(sum(HR, p => p.other_h))}</td><td class="n">${hh(sum(HR, tot))}</td><td class="n">${hh(sum(HR, p => p.unpaid_h))}</td><td></td><td></td><td class="noprint"></td></tr>` : ""}</tbody></table></div>
      <p class="note noprint" style="margin:8px 2px 0">Tap a person to see each day, every clock-in and clock-out (✎ to fix a time), and any time off.</p>
      ${idle ? `<p class="note" style="margin:6px 2px 0">${idle} more ${idle > 1 ? "people" : "person"} on the hub clock had no hours in these dates.</p>` : ""}</div>
    ${SAL.length ? `<div class="card"><h3 style="margin-top:0">Salaried</h3>
      <p class="note" style="margin:0 2px 8px">Paid their salary; no clocked hours or overtime. Time off and PTO left are here for the pay stub.</p>
      <div class="tw"><table><thead><tr><th>Person</th><th class="n">PTO</th><th class="n">Other paid</th><th class="n">Unpaid off</th><th class="n">PTO left</th><th>Manager</th><th class="noprint"></th></tr></thead>
      <tbody>${salRows}</tbody></table></div></div>` : ""}
    ${EXT.length ? `<details class="card ext"><summary><b>Extended team</b> <span class="note">· ${EXT.length} ${EXT.length > 1 ? "people" : "person"}, ${hh(sum(EXT, p => p.hub_h))} h clocked · not on Moose payroll</span></summary>
      <p class="note" style="margin:8px 2px">They clock in so we know who's working. Their hours aren't in the totals, the QuickBooks sheet or the CSVs above.</p>
      <div class="tw"><table><thead><tr><th>Person</th><th class="n">Hours clocked</th><th class="n">Shifts</th><th class="noprint"></th></tr></thead><tbody>${extRows}</tbody></table></div></details>` : ""}
    <p class="src">From: hub clock-ins (Staffing ▸ Clock In / Clock Out; only punches that count; missed punches waiting for a manager are left out), approved time-off requests, PTO balances as the hub works them out (Staffing ▸ Request Time Off), paid holidays New Year's Day, Memorial Day, July 4th, Labor Day, Thanksgiving, Christmas Day (Brandon 2026-11-17), the extended team list (Brandon 2026-11-18: Porsha, Sheryl, Carmila, Keno). Regular = clocked hours that aren't overtime or holiday. Overtime = clocked hours past 40 in a workweek starting ${H(x.week_start)}, counted on the day they happen, hourly people only. Holiday = hours worked on a paid holiday (overtime that day counts as overtime). PTO = approved paid time off; Other paid = other paid time-off types; Unpaid off isn't in Total paid. Hours only: the hub keeps no pay rates.</p>`;
}
function payDetail(p){
  const days = (p.days || []).filter(d => d.hub_h || d.pto || d.other || d.unpaid);
  const z = n => Number(n) ? hh(n) : "–";
  const can = PC.canA.has(p.id);
  const pen = s => can ? ` <button type="button" class="pen noprint" title="Change these times" data-pen="${p.id}|${s.in_id}|${s.out_id || ""}|${s.in}|${s.out || ""}">✎</button>` : "";
  return `<div class="tw"><table><thead><tr><th>Day</th><th class="n">Regular</th><th class="n">Holiday</th><th class="n">OT</th><th class="n">PTO</th><th class="n">Other</th><th class="n">Total</th><th>Clock in / out</th></tr></thead><tbody>${
    days.map(d => { const sh = (p.shifts || []).filter(s => s.day === d.day);
      const t = (+d.reg || 0) + (+d.hol || 0) + (+d.ot || 0) + (+d.pto || 0) + (+d.other || 0);
      return `<tr><td>${fday(d.day)}${d.holiday ? ` <span class="pill b">${H(d.holiday)}</span>` : ""}</td><td class="n">${z(d.reg)}</td><td class="n">${z(d.hol)}</td><td class="n">${Number(d.ot) ? `<span class="bad">${hh(d.ot)}</span>` : "–"}</td><td class="n">${z(d.pto)}</td><td class="n">${z(d.other)}</td><td class="n"><b>${hh(t)}</b></td><td>${
        sh.map(s => `${ftime(s.in)} – ${s.out ? ftime(s.out) : `<span class="warn">still in</span>`}${s.hours != null ? ` (${hh(s.hours)} h)` : ""}${pen(s)}${s.edited ? ` <span class="pill o">edited</span> <span class="note">${H(s.note || "")}</span>` : ""}${s.added ? ` <span class="pill">added by hand</span>` : ""}`).join("<br>")
        || (d.unpaid ? `<span class="note">${hh(d.unpaid)} h unpaid off</span>` : (d.pto || d.other) ? `<span class="note">time off</span>` : "")}</td></tr>`; }).join("")
    || `<tr><td colspan="8" class="note">No hours.</td></tr>`}</tbody></table></div>
    ${can && !p.salaried ? `<p class="noprint" style="margin:8px 0 0"><button type="button" class="btn2 sm" data-addsh="${p.id}">+ Add a missing shift</button></p>` : ""}
    ${(p.weeks || []).length && !p.salaried ? `<p class="note" style="margin:8px 0 0">${(p.weeks || []).map(w => `Week of ${fday(w.start)}: ${hh(w.hub_h)} h clocked${Number(w.ot_h) ? ` (<span class="bad">${hh(w.ot_h)} h overtime</span>)` : ""}${w.partial ? ", part of the week" : ""}${w.signed_by ? `, signed off by ${H(w.signed_by)}` : ""}`).join(" · ")}</p>` : ""}
    ${(p.timeoff || []).length ? `<p class="note" style="margin:6px 0 0"><b>Time off:</b> ${(p.timeoff || []).map(t => `${fday(t.from)}${t.to !== t.from ? " – " + fday(t.to) : ""}: ${hh(t.hours)} h ${t.paid ? "paid" : "unpaid"} (${H(t.policy || t.kind)}${t.approved_by ? `, OK'd by ${H(t.approved_by)}` : ""})`).join(" · ")}</p>` : ""}
    ${(p.pto || []).length ? `<p class="note" style="margin:6px 0 0"><b>PTO balance:</b> ${(p.pto || []).map(b => `${hh(b.hours)} h left (${H(b.policy || "")})`).join(" · ")}</p>` : ""}
    ${PC.st && PC.st.can_extend ? `<p class="noprint" style="margin:8px 0 0"><button type="button" class="lnk" data-ext="${p.id}|${p.extended ? "0" : "1"}">${p.extended ? "Put back on Moose payroll" : "Extended team (not on Moose payroll)"}</button></p>` : ""}`;
}
// Park City wall time -> ISO with the right offset for that date (MST/MDT)
function pcIso(day, hm){
  const probe = new Date(`${day}T12:00:00Z`);
  const off = (new Intl.DateTimeFormat("en-US", { timeZone:"America/Denver", timeZoneName:"shortOffset" }).formatToParts(probe).find(x => x.type === "timeZoneName") || {}).value || "GMT-7";
  const m = off.match(/GMT([+-])(\d+)/), sign = m ? m[1] : "-", h = m ? String(m[2]).padStart(2, "0") : "07";
  return `${day}T${hm}:00${sign}${h}:00`;
}
const pcHm = s => s ? new Date(s).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"America/Denver" }) : "";
const pcDay = s => s ? new Date(s).toLocaleDateString("en-CA", { timeZone:"America/Denver" }) : "";
function shiftDlg(v, o){   // o = {user, inId, outId, inAt, outAt} ; no ids = add a shift
  document.getElementById("acdlg")?.remove();
  const p = PC.byId.get(o.user) || {}, add = !o.inId;
  const d = document.createElement("div"); d.id = "acdlg"; d.className = "acdlg";
  d.innerHTML = `<div class="box acct"><h3 style="margin:0 0 10px">${add ? "Add a missing shift" : "Change a shift"} · ${H(p.name || "")}</h3>
    <label class="note">Day <input type="date" id="sdDay" value="${H(o.inAt ? pcDay(o.inAt) : (A.from || ""))}" ${add ? "" : "disabled"}></label>
    <div style="display:flex;gap:10px;margin:8px 0"><label class="note">Clock in <input type="time" id="sdIn" value="${H(pcHm(o.inAt))}"></label>
    <label class="note">Clock out <input type="time" id="sdOut" value="${H(pcHm(o.outAt))}"></label></div>
    <label class="note" style="display:block">Why? (they and the managers see this) <input type="text" id="sdWhy" maxlength="300" style="width:100%" placeholder="e.g. forgot to clock out, left at 5"></label>
    <p class="note" style="margin:6px 0 0">Park City time. A clock-out earlier than the clock-in counts as the next morning.${PC.st && PC.st.paid && PC.st.paid.status === "paid" ? " This pay period is already paid, so this shows as a correction for the next payroll." : ""}</p>
    ${add ? "" : (() => { const sh = (p.shifts || []).slice().sort((a, b) => new Date(a.in) - new Date(b.in));
      const nx = o.outAt ? sh.find(s => new Date(s.in) > new Date(o.outAt) && new Date(s.in) - new Date(o.outAt) < 12 * 3600e3) : null;
      return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #e3e6dd">
        <button type="button" class="btn2 sm" id="sdDel">🗑 Take off this shift</button>
        ${nx ? `<button type="button" class="btn2 sm" id="sdJoin" data-in="${H(nx.in_id)}">⇄ Join with the next shift (in ${H(ftime(nx.in))})</button>` : ""}</div>
        <p class="note" style="margin:4px 0 0">Nothing is deleted: the punches are set off with your reason and still show in their history.</p>`; })()}
    <p id="sdErr" class="bad" style="margin:6px 0 0"></p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button type="button" class="btn2" id="sdNo">Cancel</button><button type="button" class="btn2 pri" id="sdOk">Save</button></div></div>`;
  document.body.appendChild(d);
  const close = () => d.remove();
  d.onclick = e => { if(e.target === d) close(); };
  d.querySelector("#sdNo").onclick = close;
  // 2026-11-18 (Brandon): take a shift off, or join two shifts (drops the clock-out + clock-in between them)
  const offAll = async (ids, label) => {
    const er = d.querySelector("#sdErr"), why = d.querySelector("#sdWhy").value.trim();
    if(!why){ er.textContent = "Say why in the box above (they and the managers see it)."; return; }
    if(!confirm(label)) return;
    try { for(const id of ids.filter(Boolean)){ const r = await sb.rpc("clock_decide", { p_id:Number(id), p_status:"off", p_note:why }); if(r.error) throw r.error; }
      close(); forget(); refresh(v);
    } catch(e) { er.textContent = "Not saved: " + err(e); } };
  const bDel = d.querySelector("#sdDel"); if(bDel) bDel.onclick = () => offAll([o.inId, o.outId], "Take this whole shift off? It won't count for pay.");
  const bJoin = d.querySelector("#sdJoin"); if(bJoin) bJoin.onclick = () => offAll([o.outId, bJoin.dataset.in], "Join it with the next shift? The clock-out and clock-in between them are taken off, so it counts as one shift.");
  d.querySelector("#sdOk").onclick = async () => {
    const er = d.querySelector("#sdErr"), why = d.querySelector("#sdWhy").value.trim();
    const day = add ? d.querySelector("#sdDay").value : pcDay(o.inAt), tin = d.querySelector("#sdIn").value, tout = d.querySelector("#sdOut").value;
    if(!why){ er.textContent = "Say why (they and the managers see it)."; return; }
    if(!day || !tin){ er.textContent = "Pick the day and the clock-in time."; return; }
    const inIso = pcIso(day, tin);
    let outIso = null;
    if(tout){ outIso = pcIso(tout <= tin ? add_(day, 1) : day, tout); }
    const btn = d.querySelector("#sdOk"); btn.disabled = true; btn.textContent = "Saving…"; er.textContent = "";
    try {
      const run = async (fn, args) => { const r = await sb.rpc(fn, args); if(r.error) throw r.error; };
      if(add){
        await run("clock_add", { p_user:o.user, p_kind:"in", p_at:inIso, p_note:why });
        if(outIso) await run("clock_add", { p_user:o.user, p_kind:"out", p_at:outIso, p_note:why });
      } else {
        if(tin !== pcHm(o.inAt)) await run("clock_edit", { p_id:Number(o.inId), p_at:inIso, p_reason:why });
        if(outIso && (!o.outAt || tout !== pcHm(o.outAt))){
          if(o.outId) await run("clock_edit", { p_id:Number(o.outId), p_at:outIso, p_reason:why });
          else await run("clock_add", { p_user:o.user, p_kind:"out", p_at:outIso, p_note:why });
        }
      }
      close(); forget(); refresh(v);
    } catch(e) { er.textContent = "Not saved: " + err(e); btn.disabled = false; btn.textContent = "Save"; }
  };
}
const add_ = (s, n) => add(s, n);

// ---------- Maintenance ----------
function maint(x){
  const B = x.breezeway || [], C = x.hub || [], V = x.vehicles || [];
  const tb = sum(B, i => i.cost), tc = sum(C, i => i.amount), tv = sum(V, i => i.cost), own = sum(B.filter(i => i.bill_to === "owner"), i => i.cost);
  const chk = [];
  const noRc = C.filter(i => !i.invoice && !i.receipt); if(noRc.length) chk.push(["m_norc", `${noRc.length} hub cost${noRc.length > 1 ? "s" : ""} with no receipt or invoice attached (${$$(sum(noRc, i => i.amount))}).`]);
  const noV = V.filter(i => !i.file && !i.invoice_no); if(noV.length) chk.push(["m_nov", `${noV.length} vehicle service${noV.length > 1 ? "s" : ""} with no invoice (${$$(sum(noV, i => i.cost))}).`]);
  const noHome = B.filter(i => !i.home); if(noHome.length) chk.push(["m_nohome", `${noHome.length} Breezeway cost${noHome.length > 1 ? "s" : ""} not matched to a home.`]);
  const fB = A.tf === "m_nohome" ? noHome : B, fC = A.tf === "m_norc" ? noRc : C, fV = A.tf === "m_nov" ? noV : V;
  const homes = {}; [...B.map(i => [i.home, i.cost]), ...C.map(i => [i.home, i.amount])].forEach(([h, a]) => { h = h || "(no home)"; homes[h] = (homes[h] || 0) + Number(a || 0); });
  CSV.m_bw = () => ["maintenance_breezeway", [["Finished", "Home", "Department", "Task", "Cost", "Billed to", "Finished by", "Breezeway link"], ...B.map(i => [i.day, i.home, i.dept, i.task, i.cost, i.bill_to, i.by || "", i.link])]];
  CSV.m_hub = () => ["maintenance_hub_costs", [["Date", "Home", "Kind", "Amount", "What", "Vendor", "Job", "Invoice link", "Receipt photo", "Entered by"], ...C.map(i => [i.day, i.home, i.kind, i.amount, i.what || "", i.vendor || "", i.job || "", i.invoice || "", i.receipt ? "yes" : "", i.by || ""])]];
  CSV.m_veh = () => ["maintenance_vehicles", [["Date", "Vehicle", "Kind", "Cost", "Shop", "Invoice #", "Invoice file", "Entered by"], ...V.map(i => [i.day, i.vehicle, i.kind, i.cost, i.vendor || "", i.invoice_no || "", i.file ? "yes" : "", i.by || ""])]];
  CSV.m_home = () => ["maintenance_by_home", [["Home", "Total"], ...Object.entries(homes).sort((a, b) => b[1] - a[1]).map(([h, a]) => [h, a.toFixed(2)])]];
  const tbl = (head, rows, total) => `<div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="9" class="note">Nothing in these dates.</td></tr>`}${total || ""}</tbody></table></div>`;
  return `<div class="tiles">${tile($$(tb + tc + tv), "Total spent", `${B.length + C.length + V.length} items`)}
      ${tile($$(own), "Billed to owners", "Breezeway, bill to owner")}${tile($$(tb - own + tc), "Company / not billed", "jobs + hub costs")}${tile($$(tv), "Vehicles", `${V.length} services`)}</div>
    ${checks(chk)}
    <div class="card"><h3 style="margin-top:0">Breezeway task costs <span>${$$(tb)} ${csvBtn("m_bw")}</span></h3>
      ${fB !== B ? tfNote(fB.length, "Breezeway costs not matched to a home") : ""}${tbl(`<th>Finished</th><th>Home</th><th>Task</th><th>Billed to</th><th class="n">Cost</th>`, fB.map(i => `<tr><td>${fday(i.day)}</td><td>${H(i.home || "–")}</td><td><a href="${H(i.link)}" target="_blank" rel="noopener">${H(i.task)}</a><br><span class="note">${H(i.dept)}${i.by ? " · " + H(i.by) : ""}</span></td><td>${i.bill_to === "owner" ? `<span class="pill o">Owner</span>` : i.bill_to === "guest" ? `<span class="pill b">Guest</span>` : H(i.bill_to)}</td><td class="n">${$$(i.cost)}</td></tr>`).join(""),
        B.length && fB === B ? `<tr class="tot"><td colspan="4">Total</td><td class="n">${$$(tb)}</td></tr>` : "")}
      <p class="src">From: Breezeway task costs (labor, supplies and fees on each finished task), copied into the hub every few minutes.</p></div>
    <div class="card"><h3 style="margin-top:0">Costs entered in the hub <span>${$$(tc)} ${csvBtn("m_hub")}</span></h3>
      ${fC !== C ? tfNote(fC.length, "hub costs with no receipt or invoice") : ""}${tbl(`<th>Date</th><th>Home</th><th>What</th><th>Receipt</th><th class="n">Amount</th>`, fC.map(i => `<tr><td>${fday(i.day)}</td><td>${H(i.home || "–")}</td><td>${H(i.what || i.kind)}<br><span class="note">${H([i.kind, i.vendor, i.job].filter(Boolean).join(" · "))}</span></td><td>${i.invoice ? `<a href="${H(i.invoice)}" target="_blank" rel="noopener">Invoice ↗</a>` : i.receipt ? "Photo in the hub" : `<span class="warn">none</span>`}</td><td class="n">${$$(i.amount)}</td></tr>`).join(""),
        C.length && fC === C ? `<tr class="tot"><td colspan="4">Total</td><td class="n">${$$(tc)}</td></tr>` : "")}
      <p class="src">From: Maintenance ▸ Expenses & Time (parts, fuel, labor typed in by the crew).</p></div>
    <div class="card"><h3 style="margin-top:0">Vehicle service <span>${$$(tv)} ${csvBtn("m_veh")}</span></h3>
      ${fV !== V ? tfNote(fV.length, "vehicle services with no invoice") : ""}${tbl(`<th>Date</th><th>Vehicle</th><th>What</th><th>Invoice</th><th class="n">Cost</th>`, fV.map(i => `<tr><td>${fday(i.day)}</td><td>${H(i.vehicle)}</td><td>${H(i.kind)}<br><span class="note">${H(i.vendor || "")}</span></td><td>${i.invoice_no ? "#" + H(i.invoice_no) : ""}${i.file ? " (file on Vehicles page)" : ""}</td><td class="n">${$$(i.cost)}</td></tr>`).join(""),
        V.length && fV === V ? `<tr class="tot"><td colspan="4">Total</td><td class="n">${$$(tv)}</td></tr>` : "")}
      <p class="src">From: Vehicles ▸ Service history.</p></div>
    <div class="card"><h3 style="margin-top:0">By home <span>${csvBtn("m_home")}</span></h3>
      ${tbl(`<th>Home</th><th class="n">Total</th>`, Object.entries(homes).sort((a, b) => b[1] - a[1]).map(([h, a]) => `<tr><td>${H(h)}</td><td class="n">${$$(a)}</td></tr>`).join(""))}</div>`;
}

// ---------- Bookings ----------
const SUBS = [["depart", "Checked out"], ["booked", "Booked"], ["arrive", "Arriving"], ["cancel", "Cancelled"]];
function bookings(x){
  const S = (x.stays || []);
  const pick = k => S.filter(s => s["is_" + k]);
  const out = pick("depart").filter(s => !s.owner), bk = pick("booked").filter(s => !s.owner), cn = pick("cancel");
  const chk = [];
  const owed = out.filter(s => Number(s.balance) > 0.009); if(owed.length) chk.push(["b_owed", `${owed.length} checked-out stay${owed.length > 1 ? "s" : ""} still owe money in Track (${$$(sum(owed, s => s.balance))}).`]);
  const cred = S.filter(s => Number(s.balance) < -0.009); if(cred.length) chk.push(["b_cred", `${cred.length} stay${cred.length > 1 ? "s" : ""} with a credit (overpaid) in Track (${$$(sum(cred, s => s.balance))}).`]);
  const cnPaid = cn.filter(s => Number(s.paid) > 0); if(cnPaid.length) chk.push(["b_cnpaid", `${cnPaid.length} cancelled stay${cnPaid.length > 1 ? "s" : ""} with money paid (${$$(sum(cnPaid, s => s.paid))}): refunded or kept?`]);
  (x.payout_checks || []).filter(p => p.status !== "ok").forEach(p => chk.push(`Airbnb payout check ${fday(p.day)}: ${H(p.summary)}`));
  const old = x.track_window_from && A.from < x.track_window_from;
  if(old) chk.push(`<span class="warn">The hub's Track copy starts with stays leaving on ${fdate(x.track_window_from)}; earlier stays aren't in this report.</span>`);
  S.forEach(s => s.other = Math.round(((Number(s.total) || 0) - (Number(s.rent) || 0) - (Number(s.fees) || 0) - (Number(s.taxes) || 0)) * 100) / 100);
  const byCh = {}; out.forEach(s => { const k = s.type || s.channel || "other"; const o = byCh[k] = byCh[k] || { n:0, nights:0, rent:0, fees:0, taxes:0, other:0, total:0, paid:0 };
    o.n++; ["nights", "rent", "fees", "taxes", "other", "total", "paid"].forEach(f => o[f] += Number(s[f]) || 0); });
  const cols = ["Res #", "Home", "Guest", "Booked as", "Track channel", "Booked", "Arrive", "Depart", "Nights", "Rent", "Fees", "Taxes", "Discounts / other", "Total", "Paid", "Balance", "Cancelled"];
  const row = s => [s.res, s.unit, s.guest, s.type, s.channel, s.booked, s.arrive, s.depart, s.nights, s.rent, s.fees, s.taxes, s.other, s.total, s.paid, s.balance, s.cancelled || ""];
  SUBS.forEach(([k, l]) => CSV["b_" + k] = () => ["bookings_" + l.toLowerCase().replace(/ /g, "_"), [cols, ...pick(k).map(row)]]);
  CSV.b_ch = () => ["bookings_checked_out_by_channel", [["Booked as", "Stays", "Nights", "Rent", "Fees", "Taxes", "Discounts / other", "Total", "Paid"], ...Object.entries(byCh).map(([k, o]) => [k, o.n, o.nights, o.rent.toFixed(2), o.fees.toFixed(2), o.taxes.toFixed(2), o.other.toFixed(2), o.total.toFixed(2), o.paid.toFixed(2)])]];
  const TF = { b_out:[out, "guest stays checked out"], b_bk:[bk, "new guest bookings"], b_cn:[cn, "cancellations"], b_owed:[owed, "checked-out stays that still owe money"], b_cred:[cred, "stays with a credit"], b_cnpaid:[cnPaid, "cancelled stays with money paid"] };
  const tf = TF[A.tf], L = tf ? tf[0] : pick(A.sub);
  return `<div class="tiles">${tile(String(out.length), "Guest stays checked out", `${$$(sum(out, s => s.rent))} rent`, "b_out")}
      ${tile($$(sum(out, s => s.total)), "Checked-out total", `fees ${$$(sum(out, s => s.fees))} · taxes ${$$(sum(out, s => s.taxes))}`)}
      ${tile(String(bk.length), "New bookings", `${$$(sum(bk, s => s.total))} booked`, "b_bk")}
      ${tile(String(cn.length), "Cancellations", cn.length ? `${$$(sum(cn, s => s.paid))} had been paid` : "", "b_cn")}</div>
    ${checks(chk)}
    <div class="card"><h3 style="margin-top:0">Checked out, by how it was booked <span>${csvBtn("b_ch")}</span></h3>
      <div class="tw"><table><thead><tr><th>Booked as</th><th class="n">Stays</th><th class="n">Nights</th><th class="n">Rent</th><th class="n">Fees</th><th class="n">Taxes</th><th class="n">Discounts / other</th><th class="n">Total</th><th class="n">Paid</th></tr></thead><tbody>
      ${Object.entries(byCh).sort((a, b) => b[1].total - a[1].total).map(([k, o]) => `<tr><td>${H(k)}</td><td class="n">${o.n}</td><td class="n">${o.nights}</td><td class="n">${$$(o.rent)}</td><td class="n">${$$(o.fees)}</td><td class="n">${$$(o.taxes)}</td><td class="n">${$$(o.other)}</td><td class="n">${$$(o.total)}</td><td class="n">${$$(o.paid)}</td></tr>`).join("") || `<tr><td colspan="9" class="note">No guest stays checked out in these dates.</td></tr>`}
      ${out.length ? `<tr class="tot"><td>Total</td><td class="n">${out.length}</td><td class="n">${sum(out, s => s.nights)}</td><td class="n">${$$(sum(out, s => s.rent))}</td><td class="n">${$$(sum(out, s => s.fees))}</td><td class="n">${$$(sum(out, s => s.taxes))}</td><td class="n">${$$(sum(out, s => s.other))}</td><td class="n">${$$(sum(out, s => s.total))}</td><td class="n">${$$(sum(out, s => s.paid))}</td></tr>` : ""}</tbody></table></div>
      <p class="note" style="margin:8px 2px 0">Rent = Track's gross rent. "Discounts / other" = Track's grand total minus rent, fees and taxes (discounts, credits and anything else Track adds), so each row adds up to Track's total. Owner stays are left out of the money totals (they're listed below with $0).</p></div>
    <div class="card"><h3 style="margin-top:0">Every stay <span>${csvBtn("b_" + A.sub)}</span></h3>
      <div class="seg noprint">${SUBS.map(([k, l]) => `<button type="button" class="${A.sub === k && (!tf || BSUB[A.tf] === k) ? "on" : ""}" data-sub="${k}">${l} (${pick(k).length})</button>`).join("")}</div>
      ${tf ? tfNote(L.length, tf[1]) : ""}
      <div class="tw"><table><thead><tr><th>Res #</th><th>Home</th><th>Guest</th><th>Booked as</th><th>Dates</th><th class="n">Rent</th><th class="n">Fees</th><th class="n">Taxes</th><th class="n">Total</th><th class="n">Paid</th><th class="n">Balance</th></tr></thead><tbody>
      ${L.map(s => `<tr><td>${H(s.res)}</td><td>${H(s.unit)}</td><td>${H(s.guest)}${s.owner ? ` <span class="pill">Owner</span>` : ""}${s.cancelled ? ` <span class="pill r">Cancelled ${fday(s.cancelled)}</span>` : ""}</td><td>${H(s.type || s.channel)}</td>
        <td>${fday(s.arrive)} – ${fday(s.depart)}<br><span class="note">${s.nights || ""} nights · booked ${fday(s.booked)}</span></td><td class="n">${$$(s.rent)}</td><td class="n">${$$(s.fees)}</td><td class="n">${$$(s.taxes)}</td><td class="n">${$$(s.total)}</td><td class="n">${$$(s.paid)}</td>
        <td class="n">${Number(s.balance) > 0.009 ? `<span class="warn">${$$(s.balance)}</span>` : $$(s.balance)}</td></tr>`).join("") || `<tr><td colspan="11" class="note">None in these dates.</td></tr>`}
      ${L.length ? `<tr class="tot"><td colspan="5">Total (${L.length})</td><td class="n">${$$(sum(L, s => s.rent))}</td><td class="n">${$$(sum(L, s => s.fees))}</td><td class="n">${$$(sum(L, s => s.taxes))}</td><td class="n">${$$(sum(L, s => s.total))}</td><td class="n">${$$(sum(L, s => s.paid))}</td><td class="n">${$$(sum(L, s => s.balance))}</td></tr>` : ""}</tbody></table></div></div>
    <div class="card"><h3 style="margin-top:0">Airbnb payout checks</h3>
      ${(x.payout_checks || []).length ? `<ul class="checks" style="margin:0;padding-left:20px">${x.payout_checks.map(p => `<li>${fday(p.day)}: ${p.status === "ok" ? `<span class="ok">OK</span>` : `<span class="warn">${H(p.status)}</span>`} · ${H(p.summary)}</li>`).join("")}</ul>` : `<p class="note">No payout checks ran in these dates.</p>`}
      <p class="src">The hub's daily check compares each Airbnb payout with Track's "You Earn" (within $1) for stays that arrived 3–5 days before.</p></div>
    ${(x.hub_charges || []).length ? `<div class="card"><h3 style="margin-top:0">Cards charged from the hub</h3><ul class="checks" style="margin:0;padding-left:20px">${x.hub_charges.map(c => `<li>Res ${H(c.res)}: ${$$(c.amount)} on ${fday(c.at)} by ${H(c.by)}</li>`).join("")}</ul></div>` : ""}
    <p class="src">From: Track reservations as copied into the hub${x.track_copy_at ? ` (last copy ${new Date(Number(x.track_copy_at) || x.track_copy_at).toLocaleString()})` : ""}. Money = Track's guest breakdown at that time. Checked out = the stay left in these dates.</p>`;
}

// ---------- Owner charges ----------
function owner(x){
  const I = x.items || [], O = I.filter(i => i.bill_to === "owner"), G = I.filter(i => i.bill_to !== "owner");
  const homes = {}; O.forEach(i => { const h = homes[i.home || "(no home)"] = homes[i.home || "(no home)"] || { owner:i.owner, n:0, total:0, items:[] }; h.n++; h.total += Number(i.cost) || 0; h.items.push(i); });
  const chk = []; const nn = O.filter(i => !i.owner); if(nn.length) chk.push(`${nn.length} charge${nn.length > 1 ? "s" : ""} on a home with no owner name in Track.`);
  if(G.length) chk.push(`${G.length} charge${G.length > 1 ? "s" : ""} billed to a guest or split (${$$(sum(G, i => i.cost))}); listed at the bottom.`);
  const cols = ["Finished", "Home", "Owner", "Task", "Department", "Cost", "Billed to", "Finished by", "Breezeway link"];
  CSV.o_all = () => ["owner_charges", [cols, ...I.map(i => [i.day, i.home, i.owner || "", i.task, i.dept, i.cost, i.bill_to, i.by || "", i.link])]];
  CSV.o_home = () => ["owner_charges_by_home", [["Home", "Owner", "Charges", "Total"], ...Object.entries(homes).map(([h, o]) => [h, o.owner || "", o.n, o.total.toFixed(2)])]];
  const list = Object.entries(homes).sort((a, b) => a[0].localeCompare(b[0]));
  return `<div class="tiles">${tile($$(sum(O, i => i.cost)), "Billed to owners", `${O.length} charges`)}${tile(String(list.length), "Homes", "with a charge")}
      ${tile($$(sum(G, i => i.cost)), "Billed to guests / split", `${G.length} charges`)}</div>
    ${checks(chk)}
    <div class="card"><h3 style="margin-top:0">By home <span>${csvBtn("o_home")} ${csvBtn("o_all", "Every charge CSV")}</span></h3>
      <div class="tw"><table><thead><tr><th>Home</th><th>Owner</th><th class="n">Charges</th><th class="n">Total</th><th class="noprint"></th></tr></thead><tbody>
      ${list.map(([h, o], n) => `<tr class="click" data-open="o${n}"><td><b>${H(h)}</b></td><td>${H(o.owner || "–")}</td><td class="n">${o.n}</td><td class="n"><b>${$$(o.total)}</b></td><td class="noprint">${A.open["o" + n] ? "▴" : "▾"}</td></tr>`
        + (A.open["o" + n] ? `<tr class="sub"><td colspan="5"><table><tbody>${o.items.map(i => `<tr><td>${fday(i.day)}</td><td><a href="${H(i.link)}" target="_blank" rel="noopener">${H(i.task)}</a><br><span class="note">${H(i.dept)}${i.by ? " · " + H(i.by) : ""}</span></td><td class="n">${$$(i.cost)}</td></tr>`).join("")}</tbody></table></td></tr>` : "")).join("")
        || `<tr><td colspan="5" class="note">Nothing billed to owners in these dates.</td></tr>`}
      ${list.length ? `<tr class="tot"><td colspan="3">Total</td><td class="n">${$$(sum(O, i => i.cost))}</td><td class="noprint"></td></tr>` : ""}</tbody></table></div>
      <p class="note noprint" style="margin:8px 2px 0">Tap a home to see each charge.</p></div>
    ${G.length ? `<div class="card"><h3 style="margin-top:0">Billed to guests or split</h3><div class="tw"><table><tbody>${G.map(i => `<tr><td>${fday(i.day)}</td><td>${H(i.home)}</td><td><a href="${H(i.link)}" target="_blank" rel="noopener">${H(i.task)}</a></td><td>${H(i.bill_to)}</td><td class="n">${$$(i.cost)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
    <p class="src">From: Breezeway tasks finished in these dates with a cost marked "bill to owner" (or guest), copied into the hub every few minutes; owner names from Track. These are what should show on the owner statements in Track. Credits back to owners are entered in Track's owner statements and aren't in the hub yet.</p>`;
}

const VIEWS = { payroll, maint, bookings, owner };
async function draw(v){
  css();
  const dates = `<div class="card noprint"><div class="dates">${Object.entries(PRESETS).map(([k, [l]]) => `<button type="button" class="chip ${A.preset === k ? "on" : ""}" data-pre="${k}">${l}</button>`).join("")}
      <span class="sp"></span><label class="note">From <input type="date" id="acf" value="${A.from}"></label><label class="note">To <input type="date" id="act" value="${A.to}"></label>
      <button type="button" class="btn2" id="acprint">🖨 Print</button></div>
      <div class="range">${fdate(A.from)} – ${fdate(A.to)}</div></div>`;
  const pay = A.mode === "pay";
  v.innerHTML = `<div class="page acct"><div class="head">${pay ? `<h2>Payroll</h2><p>Hours, overtime, time off and PTO for each pay period. Pick the dates, check the list, download the CSVs.</p>` : `<h2>Accounting</h2><p>Weekly reports for our accountant. Pick the dates, read the summary, open the detail, download a CSV.</p>`}</div>
    <div class="tabs noprint" ${pay ? `style="display:none"` : ""}>${TABS.map(([k, l]) => `<button type="button" class="${A.tab === k ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}</div>
    ${dates}<div id="acbody"><div class="card note">Loading…</div></div></div>`;
  v.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { location.hash = "#/accounting/" + b.dataset.tab; });
  v.querySelectorAll("[data-pre]").forEach(b => b.onclick = () => { setPreset(b.dataset.pre); A.open = {}; draw(v); });
  const dc = () => { const f = v.querySelector("#acf").value, t = v.querySelector("#act").value; if(f && t){ A.from = f <= t ? f : t; A.to = f <= t ? t : f; A.preset = null; A.open = {}; save(); draw(v); } };
  v.querySelector("#acf").onchange = dc; v.querySelector("#act").onchange = dc;
  v.querySelector("#acprint").onclick = () => { window.print(); if(A.tab === "payroll") pullLog(v, "print"); };
  const body = v.querySelector("#acbody");
  await fill(v, body);
}
async function pullLog(v, kind, what){   // log a download / print, then redraw so "last download" updates
  const r = await sb.rpc("pay_pull_log", { p_from:A.from, p_to:A.to, p_kind:kind, p_what:what || null });
  if(!r.error){ delete A.stc[`${A.from}|${A.to}`]; refresh(v); }
}
function scroller(el){
  for(let e = el.parentElement; e; e = e.parentElement){ const o = getComputedStyle(e).overflowY; if((o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight) return e; }
  return document.scrollingElement || document.documentElement;
}
function forget(){ delete A.data[`payroll|${A.from}|${A.to}`]; delete A.stc[`${A.from}|${A.to}`]; }
async function refresh(v){   // redraw only the report, keep the scroll where it was (Brandon 2026-11-18: opening a row jumped to the top)
  const body = v.querySelector("#acbody"); if(!body) return draw(v);
  const sc = scroller(body), y = sc.scrollTop;
  await fill(v, body);
  sc.scrollTop = y;
}
async function fill(v, body){
  const tab = A.tab;
  let x; try { x = await load(tab); } catch(e) { body.innerHTML = `<div class="card bad">Couldn't load this report: ${H(err(e))}</div>`; return; }
  if(tab === "payroll"){
    const k = `${A.from}|${A.to}`;
    if(!A.stc[k]){ const r = await sb.rpc("pay_status", { p_from:A.from, p_to:A.to }); A.stc[k] = r.error ? null : r.data; }
    PC.st = A.stc[k];
    PC.prevData = null;
    const pp = PC.st && PC.st.prev_paid;
    if(pp){ const kk = `payroll|${pp.from}|${pp.to}`;
      if(!A.data[kk]){ const r2 = await sb.rpc("acct_payroll", { p_from:pp.from, p_to:pp.to }); if(!r2.error) A.data[kk] = r2.data; }
      PC.prevData = A.data[kk] || null; }
  }
  if(tab !== A.tab) return;
  for(const k in CSV) delete CSV[k];
  body.innerHTML = VIEWS[tab](x)
    + `<p class="src">Report made ${new Date(x.made_at || Date.now()).toLocaleString()}.</p>`;
  body.querySelectorAll("[data-csv]").forEach(b => b.onclick = e => { e.stopPropagation(); const f = CSV[b.dataset.csv]; if(f){ const [n, r] = f(); csv(n, r);
    if(tab === "payroll" && /^pay_/.test(b.dataset.csv)) pullLog(v, "csv", b.dataset.csv); } });
  body.querySelectorAll("[data-open]").forEach(r => r.onclick = e => { if(e.target.closest("a,button,input,label")) return; const k = r.dataset.open; A.open[k] = !A.open[k]; refresh(v); });
  body.querySelectorAll("[data-sub]").forEach(b => b.onclick = () => { A.sub = b.dataset.sub; A.tf = ""; refresh(v); });
  body.querySelectorAll("[data-tf]").forEach(b => b.onclick = e => { e.preventDefault(); const k = b.dataset.tf; A.tf = (A.tf === k ? "" : k); if(A.tf && BSUB[A.tf]) A.sub = BSUB[A.tf]; refresh(v); });
  if(tab === "payroll" && !A.logged[`${A.from}|${A.to}`]){ A.logged[`${A.from}|${A.to}`] = 1; sb.rpc("pay_pull_log", { p_from:A.from, p_to:A.to, p_kind:"open", p_what:null }).then(() => {}, () => {}); }
  const rpc = async (fn, args, btn) => { if(btn){ btn.disabled = true; } const r = await sb.rpc(fn, args); if(r.error){ alert("Not saved: " + err(r.error)); if(btn) btn.disabled = false; return false; } return r.data ?? true; };
  body.querySelectorAll("[data-ck]").forEach(c => c.onchange = async () => {
    if(await rpc("pay_check", { p_item:c.dataset.ck, p_from:A.from, p_to:A.to, p_done:c.checked, p_note:null }) === false){ c.checked = !c.checked; return; }
    delete A.stc[`${A.from}|${A.to}`]; refresh(v); });
  const approve = async (ids, ok, btn) => {
    let note = null;
    if(!ok){ note = prompt("Why take the approval back?"); if(!note) return; }
    const r = await rpc("pay_approve", { p_from:A.from, p_to:A.to, p_users:ids, p_ok:ok, p_note:note }, btn);
    if(r === false) return;
    if(r.skipped && r.skipped.length) alert("Not approved (not someone you look after): " + r.skipped.join(", "));
    delete A.stc[`${A.from}|${A.to}`]; refresh(v); };
  body.querySelectorAll("[data-apv]").forEach(b => b.onclick = e => { e.stopPropagation(); approve([b.dataset.apv], true, b); });
  body.querySelectorAll("[data-unapv]").forEach(b => b.onclick = e => { e.stopPropagation(); approve([b.dataset.unapv], false, b); });
  body.querySelectorAll("[data-apvall]").forEach(b => b.onclick = e => { e.stopPropagation(); approve(b.dataset.apvall.split(","), true, b); });
  body.querySelectorAll("[data-pen]").forEach(b => b.onclick = e => { e.stopPropagation(); const [user, inId, outId, inAt, outAt] = b.dataset.pen.split("|");
    shiftDlg(v, { user, inId, outId, inAt, outAt }); });
  body.querySelectorAll("[data-addsh]").forEach(b => b.onclick = e => { e.stopPropagation(); shiftDlg(v, { user:b.dataset.addsh }); });
  body.querySelectorAll("[data-sign]").forEach(b => b.onclick = async e => { e.stopPropagation(); const ok = b.dataset.sign === "1";
    if(ok && !confirm(`Sign off that your team's hours for ${fdate(A.from)} – ${fdate(A.to)} are ready? When all three sign off, the accountant is told.`)) return;
    if(await rpc("pay_signoff", { p_from:A.from, p_to:A.to, p_ok:ok }, b) === false) return;
    delete A.stc[`${A.from}|${A.to}`]; refresh(v); });
  body.querySelectorAll("[data-paid]").forEach(b => b.onclick = async e => { e.stopPropagation(); const paid = b.dataset.paid === "1";
    let note = null;
    if(paid){ if(!confirm(`Mark ${fdate(A.from)} – ${fdate(A.to)} paid? The hours lock: any change after this needs a note and shows as a correction.`)) return; }
    else { note = prompt("Why unlock this pay period?"); if(!note) return; }
    if(await rpc("pay_period_set", { p_from:A.from, p_to:A.to, p_paid:paid, p_note:note }, b) === false) return;
    delete A.stc[`${A.from}|${A.to}`]; refresh(v); });
  body.querySelectorAll("[data-ext]").forEach(b => b.onclick = async e => { e.stopPropagation(); const [u, on] = b.dataset.ext.split("|");
    if(!confirm(on === "1" ? "Move them to the extended team? Their hours leave the totals, the QuickBooks sheet and the CSVs." : "Put them back on Moose payroll?")) return;
    if(await rpc("pay_extended_set", { p_user:u, p_on:on === "1", p_note:null }, b) === false) return; forget(); refresh(v); });
}
window.payrollView = function(v){   // Staffing ▸ Payroll: accountant, admins, managers (desk payroll; acct_payroll limits managers to their people)
  A.mode = "pay"; A.tab = "payroll";
  if(!A.payInit){ A.payInit = true; if(A.preset !== "payperiod" && A.preset !== "lastpay") setPreset("lastpay"); }
  return draw(v);
};
window.accountingView = function(v, arg){
  A.mode = "acct";
  const t = String(arg || "").split("/")[0];
  const was = A.tab;
  if(TABS.some(([k]) => k === t)) A.tab = t; else if(!arg) A.tab = A.tab || "payroll";
  if(A.tab !== was) A.tf = "";
  return draw(v);
};
})();
