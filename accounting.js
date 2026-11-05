/* accounting.js (Brandon 2026-11-05: "set up the accountant and the reports that they will need ... very easy to read yet detailed
   report for our accountant to be able to come in and pull each week"). Sidebar foot ▸ Accounting (#/accounting[/payroll|maint|
   bookings|owner]), desk `accounting` = admins + team `accountant` (allowed_users.role 'outside' = reads nothing else).
   Data: acct_payroll / acct_maint / acct_bookings / acct_owner (hub_accounting.sql), each refuses anyone without the desk.
   Every report: pick the dates, "At a glance" tiles, "Check these" list, detail tables, Download CSV, Print. Hours only (the hub
   keeps no pay rates). Loaded by hub.html; uses its sb / $ / esc / niceErr. */
(function(){
const TABS = [["payroll", "Payroll hours"], ["maint", "Maintenance spending"], ["bookings", "Bookings & payouts"], ["owner", "Owner charges"]];
const PAY_ANCHOR = "2026-11-02";   // first pay period (Mon); every other Monday after (Brandon 2026-10-29)
const A = { tab:"payroll", from:null, to:null, preset:null, data:{}, open:{}, sub:"depart" };
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
const tile = (big, label, small = "") => `<div class="tile"><b>${big}</b><span>${label}</span>${small ? `<small>${small}</small>` : ""}</div>`;
const checks = items => `<div class="card"><h3 style="margin-top:0">Check these</h3><ul class="checks" style="margin:0;padding-left:20px">${
  items.length ? items.map(x => `<li>${x}</li>`).join("") : `<li class="ok">Nothing to check. Everything lines up.</li>`}</ul></div>`;

async function load(tab){
  const key = `${tab}|${A.from}|${A.to}`;
  if(A.data[key]) return A.data[key];
  const fn = { payroll:"acct_payroll", maint:"acct_maint", bookings:"acct_bookings", owner:"acct_owner" }[tab];
  const r = await sb.rpc(fn, { p_from:A.from, p_to:A.to });
  if(r.error) throw r.error;
  return (A.data[key] = r.data);
}

// ---------- Payroll ----------
function payroll(x){
  const P = (x.people || []).filter(p => p.hub_h || p.hs_h || (p.timeoff || []).length || p.pending || p.open);
  const idle = (x.people || []).length - P.length;
  const hourly = P.filter(p => !p.salaried), ot = sum(hourly, p => sum(p.weeks || [], w => w.ot_h));
  const chk = [];
  if(x.from < "2026-10-30") chk.push(`<span class="warn">Hub clock-ins started Fri Oct 30, 2026. Days before that only have Hubstaff hours.</span>`);
  P.forEach(p => {
    if(p.pending) chk.push(`<b>${H(p.name)}</b>: ${p.pending} missed punch${p.pending > 1 ? "es" : ""} waiting for a manager's OK (not counted below).`);
    if(p.open) chk.push(`<b>${H(p.name)}</b>: ${p.open} clock-in${p.open > 1 ? "s" : ""} with no clock-out yet.`);
    (p.weeks || []).forEach(w => { if(w.ot_h > 0) chk.push(`<b>${H(p.name)}</b>: <span class="bad">${hh(w.ot_h)} h overtime</span> in the week of ${fday(w.start)}${w.partial ? " (week runs past these dates)" : ""}.`); });
    if(p.hs_h != null && Math.abs((p.hub_h || 0) - (p.hs_h || 0)) >= 1 && !p.no_clock)
      chk.push(`<b>${H(p.name)}</b>: hub clock ${hh(p.hub_h)} h vs Hubstaff ${hh(p.hs_h)} h. Ask which is right before paying.`);
    if(p.edited) chk.push(`<b>${H(p.name)}</b>: ${p.edited} shift${p.edited > 1 ? "s" : ""} edited by hand (reason shown in the detail).`);
  });
  CSV.pay_sum = () => ["payroll_summary", [["Name", "Teams", "Pay type", "Hub clock hours", "Hubstaff hours", "Overtime hours (over 40/week)", "Paid time off hours", "Unpaid time off hours", "Missed punches waiting"],
    ...P.map(p => [p.name, (p.teams || []).join("; "), p.salaried ? "Salaried" : "Hourly", hh(p.hub_h), p.hs_h == null ? "" : hh(p.hs_h),
      p.salaried ? "" : hh(sum(p.weeks || [], w => w.ot_h)), hh(p.paid_off_h), hh(p.unpaid_off_h), p.pending || 0])]];
  CSV.pay_days = () => ["payroll_by_day", [["Name", "Date", "Hub clock hours", "Hubstaff hours"],
    ...P.flatMap(p => (p.days || []).filter(d => d.hub_h || d.hs_h).map(d => [p.name, d.day, hh(d.hub_h), d.hs_h == null ? "" : hh(d.hs_h)]))]];
  CSV.pay_shifts = () => ["payroll_punches", [["Name", "Date", "Clock in", "Clock out", "Hours", "Edited", "Edit reason", "Added by hand"],
    ...P.flatMap(p => (p.shifts || []).map(s => [p.name, s.day, ftime(s.in), s.out ? ftime(s.out) : "still in", s.hours == null ? "" : hh(s.hours), s.edited ? "yes" : "", s.note || "", s.added ? "yes" : ""]))]];
  CSV.pay_off = () => ["payroll_time_off", [["Name", "From", "To", "Hours", "Kind", "Policy", "Paid", "Approved by"],
    ...P.flatMap(p => (p.timeoff || []).map(t => [p.name, t.from, t.to, hh(t.hours), t.kind, t.policy || "", t.paid ? "yes" : "no", t.approved_by || ""]))]];
  const rows = P.map((p, n) => {
    const otp = p.salaried ? 0 : sum(p.weeks || [], w => w.ot_h), op = A.open["p" + n];
    return `<tr class="click" data-open="p${n}"><td><b>${H(p.name)}</b> ${p.salaried ? `<span class="pill b">Salaried</span>` : ""}${p.no_clock ? `<span class="pill o">Doesn't clock in</span>` : ""}<br><span class="note">${H((p.teams || []).join(", "))}</span></td>
      <td class="n"><b>${hh(p.hub_h)}</b></td><td class="n">${p.hs_h == null ? "–" : hh(p.hs_h)}</td>
      <td class="n">${otp ? `<span class="bad">${hh(otp)}</span>` : "–"}</td><td class="n">${p.paid_off_h ? hh(p.paid_off_h) : "–"}</td><td class="n">${p.unpaid_off_h ? hh(p.unpaid_off_h) : "–"}</td>
      <td class="noprint">${op ? "▴" : "▾"}</td></tr>` + (op ? `<tr class="sub"><td colspan="7">${payDetail(p)}</td></tr>` : "");
  }).join("");
  return `<div class="tiles">${tile(hh(sum(P, p => p.hub_h)), "Hub clock hours", `${P.length} people`)}
      ${tile(hh(sum(P, p => p.hs_h)), "Hubstaff hours", "while both are used")}
      ${tile(hh(ot), "Overtime hours", `over 40 in a ${H(x.week_start)}–start workweek`)}
      ${tile(hh(sum(P, p => p.paid_off_h)), "Paid time off hours", `${hh(sum(P, p => p.unpaid_off_h))} h unpaid`)}</div>
    ${checks(chk)}
    <div class="card"><h3 style="margin-top:0">Hours by person <span class="noprint">${csvBtn("pay_sum")} ${csvBtn("pay_days", "By day CSV")} ${csvBtn("pay_shifts", "Punches CSV")} ${csvBtn("pay_off", "Time off CSV")}</span></h3>
      <div class="tw"><table><thead><tr><th>Person</th><th class="n">Hub clock</th><th class="n">Hubstaff</th><th class="n">Overtime</th><th class="n">Paid off</th><th class="n">Unpaid off</th><th class="noprint"></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="note">No hours in these dates.</td></tr>`}
      ${P.length ? `<tr class="tot"><td>Total</td><td class="n">${hh(sum(P, p => p.hub_h))}</td><td class="n">${hh(sum(P, p => p.hs_h))}</td><td class="n">${hh(ot)}</td><td class="n">${hh(sum(P, p => p.paid_off_h))}</td><td class="n">${hh(sum(P, p => p.unpaid_off_h))}</td><td class="noprint"></td></tr>` : ""}</tbody></table></div>
      <p class="note noprint" style="margin:8px 2px 0">Tap a person to see each day, every clock-in and clock-out, and any time off.</p>
      ${idle ? `<p class="note" style="margin:6px 2px 0">${idle} more ${idle > 1 ? "people" : "person"} on the hub clock had no hours in these dates.</p>` : ""}
      <p class="src">From: hub clock-ins (Staffing ▸ Clock In / Clock Out; only punches that count, missed punches waiting for a manager are left out), Hubstaff tracked time per day, approved time-off requests. Hours only: the hub keeps no pay rates. Overtime = hours over 40 in a workweek starting ${H(x.week_start)}, hourly people only, using the larger of hub clock and Hubstaff for that week (same as the hub's overtime warnings).</p></div>`;
}
function payDetail(p){
  const days = (p.days || []).filter(d => d.hub_h || d.hs_h);
  return `<div class="tw"><table><thead><tr><th>Day</th><th class="n">Hub clock</th><th class="n">Hubstaff</th><th>Clock in / out</th></tr></thead><tbody>${
    days.map(d => { const sh = (p.shifts || []).filter(s => s.day === d.day);
      return `<tr><td>${fday(d.day)}</td><td class="n">${hh(d.hub_h)}</td><td class="n">${d.hs_h == null ? "–" : hh(d.hs_h)}</td><td>${
        sh.map(s => `${ftime(s.in)} – ${s.out ? ftime(s.out) : `<span class="warn">still in</span>`}${s.hours != null ? ` (${hh(s.hours)} h)` : ""}${s.edited ? ` <span class="pill o">edited</span> <span class="note">${H(s.note || "")}</span>` : ""}${s.added ? ` <span class="pill">added by hand</span>` : ""}`).join("<br>") || `<span class="note">Hubstaff only</span>`}</td></tr>`; }).join("")
    || `<tr><td colspan="4" class="note">No hours.</td></tr>`}</tbody></table></div>
    ${(p.weeks || []).length ? `<p class="note" style="margin:8px 0 0">${(p.weeks || []).map(w => `Week of ${fday(w.start)}: ${hh(w.hub_h)} h${w.ot_h ? `, <span class="bad">${hh(w.ot_h)} h overtime</span>` : ""}${w.partial ? " (part of the week)" : ""}${w.signed_by ? `, signed off by ${H(w.signed_by)}` : ""}`).join(" · ")}</p>` : ""}
    ${(p.timeoff || []).length ? `<p class="note" style="margin:6px 0 0"><b>Time off:</b> ${(p.timeoff || []).map(t => `${fday(t.from)}${t.to !== t.from ? " – " + fday(t.to) : ""}: ${hh(t.hours)} h ${t.paid ? "paid" : "unpaid"} (${H(t.policy || t.kind)}${t.approved_by ? `, OK'd by ${H(t.approved_by)}` : ""})`).join(" · ")}</p>` : ""}`;
}

// ---------- Maintenance ----------
function maint(x){
  const B = x.breezeway || [], C = x.hub || [], V = x.vehicles || [];
  const tb = sum(B, i => i.cost), tc = sum(C, i => i.amount), tv = sum(V, i => i.cost), own = sum(B.filter(i => i.bill_to === "owner"), i => i.cost);
  const chk = [];
  const noRc = C.filter(i => !i.invoice && !i.receipt); if(noRc.length) chk.push(`${noRc.length} hub cost${noRc.length > 1 ? "s" : ""} with no receipt or invoice attached (${$$(sum(noRc, i => i.amount))}).`);
  const noV = V.filter(i => !i.file && !i.invoice_no); if(noV.length) chk.push(`${noV.length} vehicle service${noV.length > 1 ? "s" : ""} with no invoice (${$$(sum(noV, i => i.cost))}).`);
  const noHome = B.filter(i => !i.home); if(noHome.length) chk.push(`${noHome.length} Breezeway cost${noHome.length > 1 ? "s" : ""} not matched to a home.`);
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
      ${tbl(`<th>Finished</th><th>Home</th><th>Task</th><th>Billed to</th><th class="n">Cost</th>`, B.map(i => `<tr><td>${fday(i.day)}</td><td>${H(i.home || "–")}</td><td><a href="${H(i.link)}" target="_blank" rel="noopener">${H(i.task)}</a><br><span class="note">${H(i.dept)}${i.by ? " · " + H(i.by) : ""}</span></td><td>${i.bill_to === "owner" ? `<span class="pill o">Owner</span>` : i.bill_to === "guest" ? `<span class="pill b">Guest</span>` : H(i.bill_to)}</td><td class="n">${$$(i.cost)}</td></tr>`).join(""),
        B.length ? `<tr class="tot"><td colspan="4">Total</td><td class="n">${$$(tb)}</td></tr>` : "")}
      <p class="src">From: Breezeway task costs (labor, supplies and fees on each finished task), copied into the hub every few minutes.</p></div>
    <div class="card"><h3 style="margin-top:0">Costs entered in the hub <span>${$$(tc)} ${csvBtn("m_hub")}</span></h3>
      ${tbl(`<th>Date</th><th>Home</th><th>What</th><th>Receipt</th><th class="n">Amount</th>`, C.map(i => `<tr><td>${fday(i.day)}</td><td>${H(i.home || "–")}</td><td>${H(i.what || i.kind)}<br><span class="note">${H([i.kind, i.vendor, i.job].filter(Boolean).join(" · "))}</span></td><td>${i.invoice ? `<a href="${H(i.invoice)}" target="_blank" rel="noopener">Invoice ↗</a>` : i.receipt ? "Photo in the hub" : `<span class="warn">none</span>`}</td><td class="n">${$$(i.amount)}</td></tr>`).join(""),
        C.length ? `<tr class="tot"><td colspan="4">Total</td><td class="n">${$$(tc)}</td></tr>` : "")}
      <p class="src">From: Maintenance ▸ Expenses & Time (parts, fuel, labor typed in by the crew).</p></div>
    <div class="card"><h3 style="margin-top:0">Vehicle service <span>${$$(tv)} ${csvBtn("m_veh")}</span></h3>
      ${tbl(`<th>Date</th><th>Vehicle</th><th>What</th><th>Invoice</th><th class="n">Cost</th>`, V.map(i => `<tr><td>${fday(i.day)}</td><td>${H(i.vehicle)}</td><td>${H(i.kind)}<br><span class="note">${H(i.vendor || "")}</span></td><td>${i.invoice_no ? "#" + H(i.invoice_no) : ""}${i.file ? " (file on Vehicles page)" : ""}</td><td class="n">${$$(i.cost)}</td></tr>`).join(""),
        V.length ? `<tr class="tot"><td colspan="4">Total</td><td class="n">${$$(tv)}</td></tr>` : "")}
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
  const owed = out.filter(s => Number(s.balance) > 0.009); if(owed.length) chk.push(`${owed.length} checked-out stay${owed.length > 1 ? "s" : ""} still owe money in Track (${$$(sum(owed, s => s.balance))}).`);
  const cred = S.filter(s => Number(s.balance) < -0.009); if(cred.length) chk.push(`${cred.length} stay${cred.length > 1 ? "s" : ""} with a credit (overpaid) in Track (${$$(sum(cred, s => s.balance))}).`);
  const cnPaid = cn.filter(s => Number(s.paid) > 0); if(cnPaid.length) chk.push(`${cnPaid.length} cancelled stay${cnPaid.length > 1 ? "s" : ""} with money paid (${$$(sum(cnPaid, s => s.paid))}): refunded or kept?`);
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
  const L = pick(A.sub);
  return `<div class="tiles">${tile(String(out.length), "Guest stays checked out", `${$$(sum(out, s => s.rent))} rent`)}
      ${tile($$(sum(out, s => s.total)), "Checked-out total", `fees ${$$(sum(out, s => s.fees))} · taxes ${$$(sum(out, s => s.taxes))}`)}
      ${tile(String(bk.length), "New bookings", `${$$(sum(bk, s => s.total))} booked`)}
      ${tile(String(cn.length), "Cancellations", cn.length ? `${$$(sum(cn, s => s.paid))} had been paid` : "")}</div>
    ${checks(chk)}
    <div class="card"><h3 style="margin-top:0">Checked out, by how it was booked <span>${csvBtn("b_ch")}</span></h3>
      <div class="tw"><table><thead><tr><th>Booked as</th><th class="n">Stays</th><th class="n">Nights</th><th class="n">Rent</th><th class="n">Fees</th><th class="n">Taxes</th><th class="n">Discounts / other</th><th class="n">Total</th><th class="n">Paid</th></tr></thead><tbody>
      ${Object.entries(byCh).sort((a, b) => b[1].total - a[1].total).map(([k, o]) => `<tr><td>${H(k)}</td><td class="n">${o.n}</td><td class="n">${o.nights}</td><td class="n">${$$(o.rent)}</td><td class="n">${$$(o.fees)}</td><td class="n">${$$(o.taxes)}</td><td class="n">${$$(o.other)}</td><td class="n">${$$(o.total)}</td><td class="n">${$$(o.paid)}</td></tr>`).join("") || `<tr><td colspan="9" class="note">No guest stays checked out in these dates.</td></tr>`}
      ${out.length ? `<tr class="tot"><td>Total</td><td class="n">${out.length}</td><td class="n">${sum(out, s => s.nights)}</td><td class="n">${$$(sum(out, s => s.rent))}</td><td class="n">${$$(sum(out, s => s.fees))}</td><td class="n">${$$(sum(out, s => s.taxes))}</td><td class="n">${$$(sum(out, s => s.other))}</td><td class="n">${$$(sum(out, s => s.total))}</td><td class="n">${$$(sum(out, s => s.paid))}</td></tr>` : ""}</tbody></table></div>
      <p class="note" style="margin:8px 2px 0">Rent = Track's gross rent. "Discounts / other" = Track's grand total minus rent, fees and taxes (discounts, credits and anything else Track adds), so each row adds up to Track's total. Owner stays are left out of the money totals (they're listed below with $0).</p></div>
    <div class="card"><h3 style="margin-top:0">Every stay <span>${csvBtn("b_" + A.sub)}</span></h3>
      <div class="seg noprint">${SUBS.map(([k, l]) => `<button type="button" class="${A.sub === k ? "on" : ""}" data-sub="${k}">${l} (${pick(k).length})</button>`).join("")}</div>
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
  v.innerHTML = `<div class="page acct"><div class="head"><h2>Accounting</h2><p>Weekly reports for our accountant. Pick the dates, read the summary, open the detail, download a CSV.</p></div>
    <div class="tabs noprint">${TABS.map(([k, l]) => `<button type="button" class="${A.tab === k ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}</div>
    ${dates}<div id="acbody"><div class="card note">Loading…</div></div></div>`;
  v.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { location.hash = "#/accounting/" + b.dataset.tab; });
  v.querySelectorAll("[data-pre]").forEach(b => b.onclick = () => { setPreset(b.dataset.pre); A.open = {}; draw(v); });
  const dc = () => { const f = v.querySelector("#acf").value, t = v.querySelector("#act").value; if(f && t){ A.from = f <= t ? f : t; A.to = f <= t ? t : f; A.preset = null; A.open = {}; save(); draw(v); } };
  v.querySelector("#acf").onchange = dc; v.querySelector("#act").onchange = dc;
  v.querySelector("#acprint").onclick = () => window.print();
  const body = v.querySelector("#acbody"), tab = A.tab;
  let x; try { x = await load(tab); } catch(e) { body.innerHTML = `<div class="card bad">Couldn't load this report: ${H(err(e))}</div>`; return; }
  if(tab !== A.tab) return;
  for(const k in CSV) delete CSV[k];
  body.innerHTML = VIEWS[tab](x)
    + `<p class="src">Report made ${new Date(x.made_at || Date.now()).toLocaleString()}.</p>`;
  body.querySelectorAll("[data-csv]").forEach(b => b.onclick = e => { e.stopPropagation(); const f = CSV[b.dataset.csv]; if(f){ const [n, r] = f(); csv(n, r); } });
  body.querySelectorAll("[data-open]").forEach(r => r.onclick = e => { if(e.target.closest("a")) return; const k = r.dataset.open; A.open[k] = !A.open[k]; const y = window.scrollY; draw(v).then(() => window.scrollTo(0, y)); });
  body.querySelectorAll("[data-sub]").forEach(b => b.onclick = () => { A.sub = b.dataset.sub; draw(v); });
}
window.accountingView = function(v, arg){
  const t = String(arg || "").split("/")[0];
  if(TABS.some(([k]) => k === t)) A.tab = t; else if(!arg) A.tab = A.tab || "payroll";
  return draw(v);
};
})();
