/* calendar.js (Brandon 2026-10-29): Calendar desk = Reservations · Office · Personal · Meetings, plus "Your week" on Home.
   We move off the Outlook calendar slowly; the hub starts fresh. Loaded by hub.html; uses its sb / $ / esc / ME / current.
   Data (hub_calendar.sql, hub_calendar_2.sql): cal_stays(from,to) · hub_cal_events (RLS: office = everyone, personal = only you) ·
   cal_event_save2 · cal_people() (who + how to reach them) · cal_prefs_get/set (each person's saved setup) ·
   cal_meetings() (tiles for the meetings you can open) · meeting_sched_set (admins set times). Meeting pages: meetings.js.
   Round 2 (Brandon 2026-10-29, "like Outlook"): views Day · Work week · Week · Month · Week + Month, weeks start Sunday,
   hourly grid, saved default view + layers per person, drag your own events to move them, Office shows who's working/out + contacts.
   Round 3 (Brandon 2026-10-29, "the office is going to be the hub of all going on for everyone and when everyone is working"):
   Office adds Hubstaff schedules + time off and every meeting with who's in it (cal_office, hub_calendar_3.sql; a meeting you can't
   open shows as "In a meeting" + names). Work events get attendees (cal_event_save3) and show on each attendee's Personal calendar.
   Time off (Brandon 2026-10-29, "request time off in the hub" + "help with the PTO accrue"; hub_timeoff.sql): Calendar ▸ Time off = ask,
   your balances + what's coming, your requests; approvers (their manager, admins) approve/deny + team balances + "check Hubstaff's math".
   Approved requests go to Hubstaff by hubstaff_timeoff.py. Office shows approved time off (pending only to the person + approvers).
   PTO reports (Brandon 2026-10-29: "managers and admin can run the reports on the reports page, managers can only see their teams pto";
   hub_pto_reports.sql): Reports ▸ Team ▸ PTO balances (#/pto) + PTO: check Hubstaff's math (#/pto/check), window.ptoReport.
   Only paid or unpaid time off (Brandon: no Sick in new requests). Salaried people (a Hubstaff policy named "Salaried") only get
   "Salaried time off", 80 h a year (Brandon 2026-10-29; hub_pto_salaried.sql). Hourly PTO balance = the hub's own number
   (calc_hours: tracked h x 0.77/40 since the policy started, max 52, minus PTO used; Brandon "Yes, hub calculates"), Hubstaff's alongside.
   Routes: #/cal_res · #/cal_office · #/cal_me · #/cal_meet · #/cal_off · #/pto */
(function(){
const NAMES = { meet_maint:"Monday maintenance", meet_or:"Owner Relations", meet_bd:"Business Development", meet_kd:"Key Data", meet_beyond:"Beyond Pricing", meet_mgr:"Managers", meet_fd:"Office Staff Monthly", meet_track:"Track Business Review", meet_trackmk:"Track Digital Marketing" };
const TABS = [["cal_res","Reservations"],["cal_office","Office"],["cal_me","Personal"],["cal_meet","Meetings"],["cal_off","Request time off"]];
const VIEWS = [["day","Day"],["work","Work week"],["week","Week"],["month","Month"],["wm","Week + Month"]];
const LAYERS = { cal_me:[["meet","Meetings"],["personal","My events"],["office","Office"],["checkins","Check-ins"]], cal_office:[["events","Work events"],["meet","Meetings"],["sched","Schedules"],["people","Who's in / out"]] };
const LAYER_ON = { meet:true, personal:true, office:true, checkins:false, events:true, people:true, sched:true };
const MGR = ["owner_relations","maint_manager","office_manager","hk_manager"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WS = 6, WE = 22, HPX = 44;   // hourly grid 6 am – 10 pm, 44px per hour
const CCSS = `
.cal .ctabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px} .cal .ctabs a{text-decoration:none}
.cal.page.wide{max-width:1400px}
.cal .chead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px} .cal .chead h2{margin:0;font-size:21px;flex:1;min-width:180px}
.cal .ctool{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;font-size:13px}
.cal .vsw{display:inline-flex;border:1px solid var(--line);border-radius:11px;overflow:hidden;flex-wrap:wrap} .cal .vsw button{border:0;border-radius:0;min-height:34px}
.cal .lyr{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;cursor:pointer;background:var(--card);font-size:13px}
.cal .lyr input{width:16px;height:16px;min-height:0;padding:0;margin:0;flex:none;border-radius:4px}
.cal .grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card)}
.cal .grid .dh{font-size:11.5px;font-weight:800;color:var(--muted);padding:6px;text-align:center;background:var(--ground,#f6f4ef);border-bottom:1px solid var(--line)}
.cal .grid .dc{min-height:96px;border:0;border-radius:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 5px;font-size:12px;cursor:pointer;min-width:0;background:none;text-align:left;font:inherit;color:inherit;display:block;width:100%}
.cal .grid .dc:nth-child(7n){border-right:0} .cal .grid .dc.out{background:var(--ground,#f6f4ef);color:var(--muted)}
.cal .grid .dc.today .dn{background:var(--forest,#1d3b2a);color:#fff;border-radius:999px;padding:0 6px}
.cal .grid .dc.sel{outline:2px solid var(--forest,#1d3b2a);outline-offset:-2px} .cal .grid .dc.drop{background:var(--moose-soft,#e5efe6)}
.cal .dn{font-weight:800;font-size:12.5px;display:inline-block;margin-bottom:2px} .cal .more{font-size:11px;color:var(--muted)}
.cal .ev{display:block;font-size:11.5px;line-height:1.25;padding:1px 5px;border-radius:6px;margin:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--moose-soft,#e5efe6);color:var(--moose-ink,#24452c);text-decoration:none}
.cal .ev.mt,.cal .bk.mt{background:var(--blue-soft,#e6eef9);color:var(--blue,#1f4e8c);border-left-color:var(--blue,#1f4e8c)}
.cal .ev.of,.cal .bk.of{background:var(--amber-soft,#fbf0dc);color:var(--amber,#8a5a00);border-left-color:var(--amber,#8a5a00)}
.cal .ev.outp,.cal .bk.outp{background:var(--red-soft,#fbe7e5);color:var(--red,#b3261e);border-left-color:var(--red,#b3261e)}
.cal .ev.work,.cal .bk.work{background:var(--moose-soft,#e5efe6);color:var(--moose-ink,#24452c)}
.cal .ev.sh,.cal .bk.sh{background:var(--ground,#f6f4ef);color:var(--ink-2,#3d4a40);border-left-color:var(--muted,#7a857c)}
.cal .pp .mts{font-size:12px;color:var(--blue,#1f4e8c);margin-top:2px}
.cal .attp{display:flex;flex-wrap:wrap;gap:6px;max-height:150px;overflow-y:auto;padding:4px 0} .cal .attp .lyr{font-size:12.5px}
.cal .ev.req,.cal .bk.req{background:transparent;border:1px dashed var(--red,#b3261e);color:var(--red,#b3261e)}
.cal table.to{width:100%;border-collapse:collapse;font-size:13.5px} .cal table.to th{text-align:left;font-size:12px;color:var(--muted);font-weight:700;padding:6px 6px;border-bottom:1px solid var(--line)}
.cal table.to td{padding:7px 6px;border-bottom:1px solid var(--line);vertical-align:top} .cal .tow{overflow-x:auto}
.cal .bal{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr));gap:10px} .cal .bal .card{margin:0} .cal .bal b.n{font-size:26px;display:block}
.cal .ev.ar{background:var(--moose-soft,#e5efe6)} .cal .ev.dp{background:var(--line);color:var(--ink-2)}
.cal [data-drag]{cursor:grab;touch-action:none} .cal .dragging{opacity:.55}
.cal .wk{border:1px solid var(--line);border-radius:12px;background:var(--card);overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:12px}
.cal .wkr{display:grid} .cal .wkin.n7,.cal .wkin.n5{min-width:720px}
.cal .wkh>div{padding:6px 8px 4px;border-left:1px solid var(--line);font-size:12.5px;color:var(--muted);cursor:pointer} .cal .wkh>div:first-child{border-left:0;cursor:default}
.cal .wkh b{display:block;font-size:20px;color:var(--ink,#1d2a22);font-weight:700;line-height:1.1}
.cal .wkh .td{background:var(--moose-soft,#e5efe6)} .cal .wkh .sl{box-shadow:inset 0 -3px 0 var(--forest,#1d3b2a)}
.cal .wka{border-bottom:2px solid var(--line)} .cal .wka>div{border-left:1px solid var(--line);padding:3px;min-height:26px;max-height:160px;overflow-y:auto} .cal .wka>div:first-child{border-left:0;font-size:10.5px;color:var(--muted);padding:6px 4px}
.cal .wka .td{background:var(--moose-soft,#e5efe6)}
.cal .wkb{max-height:620px;overflow-y:auto} .cal .wkt{position:relative} .cal .wkt span{position:absolute;right:6px;font-size:11px;color:var(--muted);transform:translateY(-50%)}
.cal .wkc{position:relative;border-left:1px solid var(--line)} .cal .wkc.add{cursor:copy} .cal .wkc.td{background:color-mix(in srgb,var(--moose-soft,#e5efe6) 45%,transparent)}
.cal .wkc i.hl{position:absolute;left:0;right:0;border-top:1px solid var(--line);pointer-events:none} .cal .wkc i.hh{border-top-style:dotted;opacity:.6}
.cal .wkc i.now{position:absolute;left:-1px;right:0;border-top:2px solid var(--red,#b3261e);z-index:3;pointer-events:none} .cal .wkc i.now:before{content:"";position:absolute;left:-5px;top:-6px;width:10px;height:10px;border-radius:50%;background:var(--red,#b3261e)}
.cal .bk{position:absolute;z-index:2;overflow:hidden;border-radius:6px;padding:2px 5px;font-size:11.5px;line-height:1.25;border-left:3px solid var(--forest-2,#2f5d3a);background:var(--moose-soft,#e5efe6);color:var(--moose-ink,#24452c);cursor:pointer;text-decoration:none;box-shadow:0 0 0 1px var(--card)}
.cal .bk b{display:block;font-weight:800}
.cal .cols{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:12px;align-items:start} .cal .side .card{margin:0 0 12px}
.cal .list .it{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px} .cal .list .it:last-child{border-bottom:0}
.cal .list .it .d{flex:0 0 92px;color:var(--muted);font-size:13px}
.cal .pp{padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px} .cal .pp:last-child{border-bottom:0} .cal .pp .ttl{color:var(--muted);font-size:12.5px}
.cal .pp .ct{display:flex;gap:10px;flex-wrap:wrap;margin-top:3px;font-size:12.5px} .cal .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}
.cal .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:12px}
.cal .tile{display:block;text-decoration:none;color:inherit;margin:0;transition:box-shadow .15s} .cal .tile:hover{box-shadow:0 4px 16px rgba(10,30,20,.14)}
.cal .tile h3{margin:0 0 2px;font-size:17px} .cal .tile .when{font-size:13px;color:var(--ink-2)} .cal .tile ul{margin:6px 0 0;padding-left:18px;font-size:13px}
.cal .tile .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.calwk .it{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px} .calwk .it:last-child{border-bottom:0} .calwk .it .d{flex:0 0 96px;color:var(--muted);font-size:13px}
@media (max-width:980px){ .cal .cols{grid-template-columns:1fr} }
@media (max-width:640px){ .cal .grid .dc{min-height:58px;padding:3px} .cal .ev{font-size:10.5px;padding:0 3px} .cal .list .it .d{flex-basis:74px} }`;
let cssDone = false;
const css = () => { if(cssDone) return; cssDone = true; const s = document.createElement("style"); s.textContent = CCSS; document.head.appendChild(s); };
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const D = s => new Date(s + "T12:00");
const addD = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const fday = s => D(s).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
const ftime = t => { if(!t) return ""; const [h, m] = t.split(":").map(Number); return (h % 12 || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + (h < 12 ? " am" : " pm"); };
const toMin = t => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + m; };
const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const endTime = (t, min) => hhmm(toMin(t) + min);
const canOffice = () => !!(ME && (ME.admin || (ME.teams || []).some(t => MGR.includes(t))));
const ST = { month:{}, sel:{}, meets:null, view:{}, prefs:null, people:null };

/* ---------- saved setup (cal_prefs_get / cal_prefs_set): default view per tab + layers ---------- */
async function prefs(){ if(ST.prefs) return ST.prefs; let p = {}; try { p = (await sb.rpc("cal_prefs_get")).data || {}; } catch(e){} ST.prefs = Object.assign({ view:{}, layers:{} }, p); return ST.prefs; }
const savePrefs = () => sb.rpc("cal_prefs_set", { p:ST.prefs }).then(r => { if(r.error) alert("Couldn't save your calendar setup: " + r.error.message); });
const defView = key => (ST.prefs && ST.prefs.view[key]) || (window.innerWidth < 700 ? "day" : "week");
const viewOf = key => ST.view[key] || defView(key);
const layerOn = l => { const v = ST.prefs && ST.prefs.layers[l]; return v == null ? LAYER_ON[l] : !!v; };

/* meeting dates between a and b (inclusive) from its schedule row */
function occurs(m, a, b){
  if(m.nth){ const out = [];   // monthly: nth weekday (hub_meetings_monthly.sql)
    for(let f = new Date(D(a).getFullYear(), D(a).getMonth(), 1, 12); ymd(f) <= b; f = new Date(f.getFullYear(), f.getMonth() + 1, 1, 12)){
      const x = new Date(f); x.setDate(1 + (m.dow - x.getDay() + 7) % 7 + (m.nth - 1) * 7); const s = ymd(x);
      if(x.getMonth() === f.getMonth() && s >= a && s <= b && (!m.anchor || s >= m.anchor) && (!m.until || s <= m.until)) out.push(s); }
    return out; }
  const out = []; let d = D(a); d.setDate(d.getDate() + (m.dow - d.getDay() + 7) % 7);
  for(; ymd(d) <= b; d.setDate(d.getDate() + 7)){
    const s = ymd(d);
    if(m.every === 14 && m.anchor){ const n = Math.round((D(s) - D(m.anchor)) / 864e5); if(n < 0 || n % 14) continue; }
    out.push(s); }
  return out;
}
const mWhen = m => (m.nth ? ["First","Second","Third","Fourth","Fifth"][m.nth - 1] + " " + DAYS[m.dow] + " of the month" : (m.every === 14 ? "Every other " : "Every ") + DAYS[m.dow]) + (m.start ? " · " + ftime(m.start) + (m.minutes ? "–" + ftime(endTime(m.start, m.minutes)) : "") : "");
async function meetings(force){ if(ST.meets && !force) return ST.meets; const r = await sb.rpc("cal_meetings"); ST.meets = r.data || []; return ST.meets; }
async function people(){ if(ST.people) return ST.people; const r = await sb.rpc("cal_people"); ST.people = r.data || []; return ST.people; }
async function events(a, b){
  const r = await sb.from("hub_cal_events").select("*").eq("off", false).lte("day", b).or(`end_day.gte.${a},and(end_day.is.null,day.gte.${a})`).order("day").order("start_time", { nullsFirst:true });
  return r.data || [];
}
const evOn = (e, s) => e.day <= s && (e.end_day || e.day) >= s;
function tabs(k){ return `<div class="ctabs">${TABS.map(([t, l]) => `<a class="btn small${t === k ? " primary" : ""}" href="#/${t}">${l}</a>`).join("")}</div>`; }

/* ---------- ranges (weeks start Sunday, Brandon 2026-10-29) ---------- */
const weekStart = s => { const d = D(s); d.setDate(d.getDate() - d.getDay()); return ymd(d); };
function monthRange(key){ const m = ST.month[key] || (ST.sel[key] || today()).slice(0, 7), a = weekStart(m + "-01"); return [a, addD(a, 41)]; }
function gridDays(key){
  const v = viewOf(key), s = ST.sel[key] || today(), w = weekStart(s);
  if(v === "day") return [s];
  if(v === "work") return [1,2,3,4,5].map(i => addD(w, i));
  return [0,1,2,3,4,5,6].map(i => addD(w, i));
}
function curRange(key){
  const v = viewOf(key);
  if(v === "month") return monthRange(key);
  const g = gridDays(key); if(v !== "wm") return [g[0], g[g.length - 1]];
  const m = monthRange(key); return [g[0] < m[0] ? g[0] : m[0], g[6] > m[1] ? g[6] : m[1]];
}
function navTitle(key){
  const v = viewOf(key), g = gridDays(key);
  if(v === "month") return D((ST.month[key] || (ST.sel[key] || today()).slice(0, 7)) + "-01").toLocaleDateString(undefined, { month:"long", year:"numeric" });
  if(v === "day") return D(g[0]).toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  const A = D(g[0]), B = D(g[g.length - 1]);
  return A.getMonth() === B.getMonth() ? A.toLocaleDateString(undefined, { month:"long" }) + " " + A.getDate() + " – " + B.getDate() + ", " + B.getFullYear()
    : A.toLocaleDateString(undefined, { month:"short", day:"numeric" }) + " – " + B.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
}
function calNav(key, title, extra){
  const v = viewOf(key), dv = defView(key), L = LAYERS[key] || [];
  return `<div class="chead"><button class="btn small" data-mv="0">Today</button><button class="btn small" data-mv="-1" aria-label="Previous">‹</button><button class="btn small" data-mv="1" aria-label="Next">›</button>
      <h2>${esc(title)} · ${esc(navTitle(key))}</h2>${extra || ""}</div>
    <div class="ctool"><span class="vsw">${VIEWS.map(([k, l]) => `<button class="btn small${k === v ? " primary" : ""}" data-vw="${k}">${l}</button>`).join("")}</span>
      ${v !== dv ? `<button class="btn small" data-defv="${v}">★ Make ${esc(VIEWS.find(x => x[0] === v)[1])} my default</button>` : `<span class="muted">★ Your default view</span>`}
      ${L.map(([k, l]) => `<label class="lyr"><input type="checkbox" data-lyr="${k}" ${layerOn(k) ? "checked" : ""}>${l}</label>`).join("")}</div>`;
}
function wireNav(v, key, redraw, reload){
  const cur = curRange(key)[0], again = () => { if(curRange(key)[0] !== cur) reload(); else redraw(); };
  v.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => { const n = +b.dataset.mv, vw = viewOf(key);
    if(!n){ ST.sel[key] = today(); ST.month[key] = today().slice(0, 7); }
    else if(vw === "month"){ const d = D((ST.month[key] || (ST.sel[key] || today()).slice(0, 7)) + "-01"); d.setMonth(d.getMonth() + n); ST.month[key] = ymd(d).slice(0, 7); ST.sel[key] = ymd(d); }
    else { ST.sel[key] = addD(ST.sel[key] || today(), n * (vw === "day" ? 1 : 7)); ST.month[key] = ST.sel[key].slice(0, 7); }
    again(); });
  v.querySelectorAll("[data-vw]").forEach(b => b.onclick = () => { ST.view[key] = b.dataset.vw; ST.month[key] = (ST.sel[key] || today()).slice(0, 7); again(); });
  v.querySelectorAll("[data-defv]").forEach(b => b.onclick = () => { ST.prefs.view[key] = b.dataset.defv; savePrefs(); redraw(); });
  v.querySelectorAll("[data-lyr]").forEach(c => c.onchange = () => { ST.prefs.layers[c.dataset.lyr] = c.checked; savePrefs(); reload(); });
  v.querySelectorAll("[data-day]").forEach(b => b.onclick = e => { if(e.target.closest("[data-ev],a[href]")) return; ST.sel[key] = b.dataset.day;
    if(viewOf(key) === "wm" || viewOf(key) === "month"){ ST.month[key] = ST.month[key] || b.dataset.day.slice(0, 7); } again(); });
}

/* ---------- renderers. A day's items: [{start, end, title, sub, cls, href, ev, drag}] (start null = all day) ---------- */
function lay(list){   // overlapping timed blocks side by side, like Outlook
  list.sort((x, y) => x.s - y.s || y.e - x.e); let cols = [], grp = [], end = -1;
  const fin = () => grp.forEach(x => x.n = cols.length);
  list.forEach(x => { if(grp.length && x.s >= end){ fin(); grp = []; cols = []; }
    let c = cols.findIndex(e => e <= x.s); if(c < 0){ c = cols.length; cols.push(0); } cols[c] = x.e; x.c = c; grp.push(x); end = Math.max(end, x.e); });
  fin(); return list;
}
const attrs = x => (x.href ? `href="${esc(x.href)}"` : `href="#"`) + (x.ev ? ` data-ev="${x.ev}"` : "") + (x.drag ? " data-drag" : "");
const chip = x => `<a class="ev ${x.cls || ""}" ${attrs(x)} title="${esc(x.title + (x.start ? " · " + ftime(x.start.slice(0, 5)) : ""))}">${x.start ? esc(ftime(x.start.slice(0, 5))) + " " : ""}${esc(x.title)}</a>`;
function timeGrid(key, items, canAdd, hours){
  const days = gridDays(key), n = days.length, t = today(), sel = ST.sel[key], H = (WE - WS) * HPX, nw = new Date(), nowM = nw.getHours() * 60 + nw.getMinutes();
  const cols = `grid-template-columns:52px repeat(${n},minmax(0,1fr))`;
  let h = `<div class="wk"><div class="wkin n${n}"><div class="wkr wkh" style="${cols}"><div></div>${days.map(s => `<div class="${s === t ? "td" : ""}${s === sel && n > 1 ? " sl" : ""}" data-day="${s}">${DOW[D(s).getDay()]}<b>${D(s).getDate()}</b></div>`).join("")}</div>
    <div class="wkr wka" style="${cols}"><div>all day</div>${days.map(s => `<div class="${s === t ? "td" : ""}" data-dropday="${s}">${items(s).filter(x => !x.start).map(chip).join("")}</div>`).join("")}</div>`;
  if(hours){
    h += `<div class="wkb"><div class="wkr" style="${cols};height:${H}px"><div class="wkt">${Array.from({ length:WE - WS }, (_, i) => i ? `<span style="top:${i * HPX}px">${ftime(hhmm((WS + i) * 60)).toUpperCase()}</span>` : "").join("")}</div>`;
    days.forEach(s => {
      const bl = lay(items(s).filter(x => x.start).map(x => { const st = Math.max(toMin(x.start), WS * 60), en = Math.min(x.end ? Math.max(toMin(x.end), toMin(x.start) + 15) : toMin(x.start) + 60, WE * 60);
        return Object.assign({ s:st, e:Math.max(en, st + 15) }, x); }).filter(x => x.s < WE * 60));
      h += `<div class="wkc${s === t ? " td" : ""}${canAdd ? " add" : ""}" data-slot="${s}">${Array.from({ length:(WE - WS) * 2 }, (_, i) => i ? `<i class="hl${i % 2 ? " hh" : ""}" style="top:${i * HPX / 2}px"></i>` : "").join("")}
        ${s === t && nowM >= WS * 60 && nowM < WE * 60 ? `<i class="now" style="top:${(nowM - WS * 60) / 60 * HPX}px"></i>` : ""}
        ${bl.map(x => `<a class="bk ${x.cls || ""}" ${attrs(x)} style="top:${(x.s - WS * 60) / 60 * HPX + 1}px;height:${(x.e - x.s) / 60 * HPX - 2}px;left:calc(${x.c / x.n * 100}% + 1px);width:calc(${100 / x.n}% - 3px)" title="${esc(x.title + " · " + ftime(x.start.slice(0, 5)) + (x.end ? "–" + ftime(x.end.slice(0, 5)) : ""))}"><b>${esc(x.title)}</b>${esc(ftime(x.start.slice(0, 5)))}${x.sub ? " · " + esc(x.sub) : ""}</a>`).join("")}</div>`; });
    h += `</div></div>`; }
  return h + `</div></div>`;
}
function monthGrid(key, items){
  const m = ST.month[key] || (ST.sel[key] || today()).slice(0, 7), start = weekStart(m + "-01"), t = today();
  let h = `<div class="grid">${DOW.map(x => `<div class="dh">${x}</div>`).join("")}`;
  for(let i = 0; i < 42; i++){ const s = addD(start, i); if(i >= 35 && s.slice(0, 7) !== m) break;
    const its = items(s).sort((x, y) => (x.start || "").localeCompare(y.start || "")), show = its.slice(0, 4);
    h += `<div class="dc${s.slice(0, 7) !== m ? " out" : ""}${s === t ? " today" : ""}${ST.sel[key] === s ? " sel" : ""}" data-day="${s}" data-dropday="${s}"><span class="dn">${D(s).getDate()}</span>${show.map(chip).join("")}${its.length > 4 ? `<span class="more">+${its.length - 4} more</span>` : ""}</div>`; }
  return h + `</div>`;
}
/* the main area for the chosen view */
function body(key, items, canAdd, hours){
  const v = viewOf(key);
  if(v === "month") return monthGrid(key, items);
  if(v === "wm") return timeGrid(key, items, canAdd, hours) + monthGrid(key, items);
  return timeGrid(key, items, canAdd, hours);
}
/* scroll the hour grid to 8 am (or near now); click an empty slot to add; drag your own events (hour grid: day + time, month: day) */
function wireGrid(v, onSlot, onMove, onOpen){
  const b = v.querySelector(".wkb"); if(b){ const n = new Date(), m = n.getHours() * 60 + n.getMinutes(); b.scrollTop = Math.max(0, ((m > 9 * 60 && m < WE * 60 ? m - 90 : 8 * 60) - WS * 60) / 60 * HPX); }
  if(onSlot) v.querySelectorAll(".wkc.add").forEach(c => c.onclick = e => { if(e.target.closest(".bk")) return;
    const y = e.clientY - c.getBoundingClientRect().top; onSlot(c.dataset.slot, hhmm(WS * 60 + Math.floor(y / HPX * 2) * 30)); });
  v.querySelectorAll("[data-ev]").forEach(el => {
    el.addEventListener("click", e => e.preventDefault());
    el.addEventListener("pointerdown", e => {
      if(e.button) return; const sx = e.clientX, sy = e.clientY, inGrid = el.classList.contains("bk"), top0 = el.offsetTop; let moved = false, drop = null;
      const mv = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if(!moved && Math.hypot(dx, dy) < 6) return;
        if(!el.hasAttribute("data-drag")) return; moved = true; el.classList.add("dragging"); ev.preventDefault();
        v.querySelectorAll(".drop").forEach(x => x.classList.remove("drop"));
        el.style.pointerEvents = "none"; const under = document.elementFromPoint(ev.clientX, ev.clientY); el.style.pointerEvents = "";
        if(inGrid){ el.style.top = (top0 + dy) + "px"; const col = under && under.closest(".wkc");
          drop = col ? { day:col.dataset.slot, start:hhmm(WS * 60 + Math.max(0, Math.round((top0 + dy) / HPX * 4)) * 15) } : null; if(col) col.classList.add("drop"); }
        else { const cell = under && under.closest("[data-dropday]"); drop = cell ? { day:cell.dataset.dropday } : null; if(cell) cell.classList.add("drop"); } };
      const up = () => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up);
        el.classList.remove("dragging"); v.querySelectorAll(".drop").forEach(x => x.classList.remove("drop"));
        if(moved && drop && onMove) onMove(+el.dataset.ev, drop); else if(!moved) onOpen(+el.dataset.ev); };
      document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up); });
  });
}

window.calView = async function(v, k){
  css(); await prefs();
  if(k === "cal_meet") return meetTiles(v);
  if(k === "cal_off") return timeOff(v);
  return evCal(v, k);
};

/* ---------- Meetings: one tile per weekly meeting ---------- */
async function meetTiles(v){
  v.innerHTML = `<div class="page cal">${tabs("cal_meet")}<p class="muted">Loading meetings…</p></div>`;
  const ms = await meetings(true), t = today();
  if(current() !== "cal_meet") return;
  const tile = m => { const nx = occurs(m, t, addD(t, m.nth ? 120 : 28))[0];
    return `<div class="card tile" data-meet="${m.meet}"><a href="#/${m.meet}" style="text-decoration:none;color:inherit;display:block"><h3>${esc(NAMES[m.meet] || m.meet)}</h3>
      <div class="when">${esc(mWhen(m))}${m.start ? " (Mountain)" : ""}</div>
      <div class="when"><b>Next: ${nx ? esc(nx === t ? "Today" : fday(nx)) : "—"}</b>${m.last_day ? ` · last met ${esc(fday(m.last_day))}` : ""}</div>
      <div class="muted" style="font-size:13px;margin-top:6px" data-agenda="${m.meet}">${m.meet === "meet_maint" ? "Projects, owner jobs and repeat problems from the Maintenance desk." : "Checking what's coming up…"}</div>
      ${m.open_tasks != null ? `<div style="margin-top:6px;font-size:13px"><b>${m.open_tasks} open task${m.open_tasks === 1 ? "" : "s"}</b>${(m.tasks || []).length ? `<ul>${m.tasks.map(x => `<li>${esc(x.text)}${x.who ? " · " + esc(x.who) : ""}${x.due ? " · due " + esc(fday(x.due)) : ""}</li>`).join("")}</ul>` : ""}</div>` : ""}</a>
      <div class="row"><a class="btn small primary" href="#/${m.meet}">Open agenda</a>${m.link ? `<a class="btn small" href="${esc(m.link)}" target="_blank" rel="noopener">▶ Join</a>` : ""}${ME.admin ? `<button class="btn small" data-settime="${m.meet}">${m.start ? "Change time" : "Set time"}</button>` : ""}</div></div>`; };
  v.innerHTML = `<div class="page cal">${tabs("cal_meet")}<div class="chead"><h2>Weekly meetings</h2></div>
    ${ms.length ? `<div class="tiles">${ms.map(tile).join("")}</div>` : `<div class="card"><p class="muted" style="margin:0">No weekly meetings on your calendar.</p></div>`}
    <p class="muted" style="font-size:12px">Times: ${esc([...new Set(ms.filter(m => m.start).map(m => NAMES[m.meet] + " from " + m.source))].join("; ") || "not set yet")}.</p></div>`;
  v.querySelectorAll("[data-settime]").forEach(b => b.onclick = async () => {
    const m = ms.find(x => x.meet === b.dataset.settime);
    const t1 = prompt(`Start time for ${NAMES[m.meet]} (Mountain), like 9:00 or 14:30. Leave empty for no time.`, m.start || ""); if(t1 === null) return;
    const mm = /^(\d{1,2}):(\d{2})$/.exec(t1.trim()); if(t1.trim() && !mm) return alert("Type the time like 9:00 or 14:30.");
    const len = t1.trim() ? prompt("How many minutes?", m.minutes || 60) : null;
    const r = await sb.rpc("meeting_sched_set", { p_meet:m.meet, p_start:t1.trim() ? mm[1].padStart(2, "0") + ":" + mm[2] : null, p_minutes:len ? +len : null });
    if(r.error) return alert("Couldn't save: " + r.error.message); meetTiles(v); });
  ms.filter(m => m.meet !== "meet_maint").forEach(async m => {
    const r = await sb.rpc("meeting_agenda", { p_meet:m.meet }), el = v.querySelector(`[data-agenda="${m.meet}"]`); if(!el) return;
    const it = (r.data && r.data.items) || [], g = [...new Set(it.map(x => x.grp))];
    el.innerHTML = it.length ? `<b>${it.length} to discuss</b>: ${esc(g.slice(0, 4).join(" · "))}${g.length > 4 ? " · +" + (g.length - 4) + " more" : ""}` : "Nothing came up from the data this week."; });
}

/* ---------- Reservations · Office · Personal ---------- */
async function evCal(v, key){
  if(!ST.sel[key]) ST.sel[key] = today();
  const isRes = key === "cal_res", isOff = key === "cal_office", isMe = key === "cal_me";
  v.innerHTML = `<div class="page cal wide">${tabs(key)}<p class="muted">Loading…</p></div>`;
  const [a, b] = curRange(key);
  const wantStays = isRes || (isMe && layerOn("checkins"));
  const [evs, ms, ppl, sr, orr, tor] = await Promise.all([isRes ? [] : events(a, b), isMe && layerOn("meet") ? meetings() : [], isRes ? [] : people(),
    wantStays ? sb.rpc("cal_stays", { p_from:a, p_to:b }) : null, isOff ? sb.rpc("cal_office", { p_from:a, p_to:b }) : null, isOff ? sb.rpc("timeoff_calendar", { p_from:a, p_to:b }) : null]);
  if(current() !== key) return;
  const stays = (sr && sr.data && sr.data.stays) || [], who = id => (ppl.find(p => p.id === id) || {}).name || "Someone";
  const fn = id => who(id).split(" ")[0], ox = (orr && orr.data) || { meetings:[], shifts:[], off:[] };
  // time off asked in the hub: approved ones until Hubstaff has them (then they come from the Hubstaff feed), pending for the person + approvers
  ((tor && tor.data) || []).filter(r => !(r.status === "approved" && r.hs_request_id)).forEach(r => { for(let s = r.day; s <= r.end_day; s = addD(s, 1))
    ox.off.push({ user_id:r.user_id, day:s, start:r.start, end:r.end, req:r.status === "pending" }); });
  const mine = evs.filter(e => isMe ? e.cal === "personal" : e.cal === "office");
  const canAdd = isMe || isOff, boss = canOffice();
  const mt = []; ms.forEach(m => occurs(m, a, b).forEach(s => mt.push({ meet:m.meet, day:s, start:m.start, minutes:m.minutes })));
  const myId = (ppl.find(p => p.name === ME.name) || {}).id;
  const canEdit = e => e.cal === "personal" || boss || (e.kind !== "event" && e.person_id === myId);
  const evItem = e => { const k = e.kind || "event", nm = k === "event" ? e.title : (k === "out" ? "Out" : "Working") + " · " + who(e.person_id) + (e.title && !/^(out|working)$/i.test(e.title) ? " · " + e.title : "");
    return { start:e.start_time, end:e.end_time, title:nm, sub:[e.location, (e.attendees || []).map(fn).join(", ")].filter(Boolean).join(" · "), cls:k === "out" ? "outp" : k === "working" ? "work" : isMe ? "" : "of", ev:e.id, drag:canEdit(e) }; };
  const items = s => {
    const out = [];
    if(isRes || (isMe && layerOn("checkins"))){ stays.filter(x => x.in === s).forEach(x => out.push({ title:(x.owner ? "OWNER " : "") + "CHECK-IN " + x.unit + (x.guest ? " · " + x.guest : ""), cls:"ar", href:"#/cal_res" }));
      if(isRes) stays.filter(x => x.out === s).forEach(x => out.push({ title:"CHECK-OUT " + x.unit, cls:"dp", href:"#/cal_res" })); }
    if(isMe){ mt.filter(x => x.day === s).forEach(x => out.push({ start:x.start, end:x.start && x.minutes ? endTime(x.start, x.minutes) : null, title:NAMES[x.meet] + " meeting", cls:"mt", href:"#/" + x.meet }));
      const att = e => (e.attendees || []).includes(myId);   // office events you're going to show with your own events
      if(layerOn("personal")) mine.concat(evs.filter(e => e.cal === "office" && att(e))).filter(e => evOn(e, s)).forEach(e => out.push(e.cal === "office" ? Object.assign(evItem(e), { cls:"of", drag:false }) : evItem(e)));
      if(layerOn("office")) evs.filter(e => e.cal === "office" && (e.kind || "event") === "event" && !(layerOn("personal") && att(e)) && evOn(e, s)).forEach(e => out.push(Object.assign(evItem(e), { cls:"of", drag:false }))); }
    if(isOff){
      mine.filter(e => evOn(e, s) && ((e.kind || "event") === "event" ? layerOn("events") : layerOn("people"))).forEach(e => out.push(evItem(e)));
      if(layerOn("meet")) ox.meetings.filter(m => m.day === s).forEach(m => out.push({ start:m.start, end:m.end, title:m.meet ? NAMES[m.meet] + " meeting" : "In a meeting",
        sub:(m.people || []).map(fn).join(", "), cls:"mt", href:m.meet ? "#/" + m.meet : "#/cal_office" }));
      const timed = viewOf(key) === "day";   // week/month: schedules sit in the all-day row so the hours stay readable
      if(layerOn("sched")) ox.shifts.filter(x => x.day === s).sort((x, y) => x.start.localeCompare(y.start)).forEach(x => out.push(timed
        ? { start:x.start, end:x.end, title:fn(x.user_id), sub:"Scheduled", cls:"sh", href:"#/cal_office" }
        : { title:fn(x.user_id) + " " + ftime(x.start) + "–" + ftime(x.end), cls:"sh", href:"#/cal_office" }));
      if(layerOn("people")) ox.off.filter(x => x.day === s).forEach(x => out.push({ title:(x.req ? "Asked off · " : "Out · ") + who(x.user_id) + (x.start ? " " + ftime(x.start) + "–" + ftime(x.end) : ""), cls:x.req ? "outp req" : "outp", href:x.req ? "#/cal_off" : "#/cal_office" }));
    }
    return out; };
  const draw = () => {
    const sel = ST.sel[key], day = items(sel).sort((x, y) => (x.start || "").localeCompare(y.start || ""));
    const addBtns = isMe ? `<button class="btn small primary" data-add="event">+ Event</button>`
      : isOff ? (boss ? `<button class="btn small primary" data-add="event">+ Work event</button>` : "") + `<a class="btn small" href="#/cal_off" data-askoff>🌴 Ask for time off</a><button class="btn small" data-add="out">I'm out</button><button class="btn small" data-add="working">I'm working</button>` : "";
    const detail = isRes ? resDetail(stays, sel) : `<div class="card list"><b style="font-size:16px">${esc(fday(sel))}</b>${day.length ? day.map(x => `<div class="it"><span class="d">${x.start ? ftime(x.start.slice(0, 5)) + (x.end ? "–" + ftime(x.end.slice(0, 5)) : "") : "All day"}</span><span style="flex:1"><a ${attrs(Object.assign({}, x, { drag:false }))}><b>${esc(x.title)}</b></a>${x.sub ? ` <span class="muted">· ${esc(x.sub)}</span>` : ""}</span></div>`).join("") : `<p class="muted" style="margin:6px 0 0">Nothing on this day.</p>`}</div>`;
    const main = body(key, items, canAdd, !isRes) + (isRes ? `<p class="muted" style="font-size:12px">Source: ${esc((sr && sr.data && sr.data.source) || "Track reservations")}. Guest names only; contact info stays on Home for the teams that have it.</p>` : "");
    v.innerHTML = `<div class="page cal wide">${tabs(key)}${calNav(key, isRes ? "Reservations" : isOff ? "Office" : "My calendar", addBtns)}
      ${isOff ? `<div class="cols"><div>${main}${detail}</div><div class="side">${whoPanel(ppl, mine, sel, ox, fn)}</div></div>` : main + detail}
      <p class="muted" style="font-size:12px">${isOff ? "Everyone on the hub sees the Office calendar. Mark yourself out or working; managers and admins add work events (with who's going) and can mark anyone. Schedules and time off: " + (ox.source || "Hubstaff") + (ox.at ? " (updated " + new Date(ox.at).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) + ")" : "") + "; only people with a Hubstaff schedule show. Meetings: Calendar ▸ Meetings times; who's in each = everyone the meeting is for." : isMe ? "Only you see your personal events. Drag your own events to move them; click an empty time to add one. Meetings come from Calendar ▸ Meetings." : ""}</p>
      <div class="modal" id="evm"><div class="card" id="evcard"></div></div></div>`;
    wireNav(v, key, draw, () => evCal(v, key));
    wireGrid(v, canAdd && !isRes ? (d, s) => form(null, { day:d, start:s, kind:isOff ? (boss ? "event" : "working") : "event" }) : null,
      async (id, to) => { const e = evs.find(x => x.id === id); if(!e || !canEdit(e)) return;
        const len = e.end_day ? (D(e.end_day) - D(e.day)) / 864e5 : null, dur = e.start_time && e.end_time ? toMin(e.end_time) - toMin(e.start_time) : null;
        const st = to.start || (e.start_time ? e.start_time.slice(0, 5) : null);
        const r = await save(e, { p_day:to.day, p_end_day:len != null ? addD(to.day, len) : null, p_start:st, p_end:st && dur != null ? endTime(st, dur) : (e.end_time || null) });
        if(!r.error){ ST.sel[key] = to.day; evCal(v, key); } },
      id => { const e = evs.find(x => x.id === id); if(e) form(e); });
    v.querySelectorAll("[data-add]").forEach(bt => bt.onclick = () => form(null, { kind:bt.dataset.add }));
    v.querySelectorAll("[data-askoff]").forEach(bt => bt.onclick = () => { ST.askOff = true; });
    v.querySelectorAll(".pp [data-mailto]").forEach(x => x.onclick = e => e.stopPropagation());
    const q = v.querySelector("#ppq"); if(q) q.oninput = () => v.querySelectorAll(".pp[data-n]").forEach(p => p.style.display = p.dataset.n.includes(q.value.trim().toLowerCase()) ? "" : "none");
  };
  const save = (e, over) => sb.rpc("cal_event_save2", Object.assign({ p_id:e.id, p_cal:e.cal, p_kind:e.kind || "event", p_person:e.person_id, p_title:e.title, p_day:e.day, p_end_day:e.end_day,
    p_start:e.start_time ? e.start_time.slice(0, 5) : null, p_end:e.end_time ? e.end_time.slice(0, 5) : null, p_location:e.location || "", p_notes:e.notes || "", p_off:false }, over)).then(r => { if(r.error) alert("Couldn't move it: " + r.error.message); return r; });
  const form = (e, pre) => {
    pre = pre || {}; const kind = e ? (e.kind || "event") : (pre.kind || "event"), cal = e ? e.cal : (isOff ? "office" : "personal"), ro = e && !canEdit(e);
    const head = e ? (ro ? "Event" : "Change event") : kind === "out" ? "Mark out" : kind === "working" ? "Mark working" : cal === "office" ? "New work event" : "New personal event";
    const pick = cal === "office" && kind !== "event" && boss ? `<label class="field"><span>Who</span><select id="ev_p">${ppl.map(p => `<option value="${p.id}" ${(e ? e.person_id : myId) === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>` : "";
    const attH = cal === "office" && kind === "event" ? `<div class="field"><span>Who's going (shows on their Personal calendar)</span><div class="attp">${ppl.map(p => `<label class="lyr"><input type="checkbox" data-att="${p.id}" ${e && (e.attendees || []).includes(p.id) ? "checked" : ""} ${ro ? "disabled" : ""}>${esc(p.name)}</label>`).join("")}</div></div>` : "";
    $("#evcard").innerHTML = `<div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:20px;flex:1;margin:0">${head}</h2><button class="btn small" id="evx" aria-label="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>
      ${pick}<label class="field"><span>${kind === "event" ? "What" : "Note (optional, e.g. PTO, sick, on call)"}</span><input id="ev_t" value="${esc(e && !/^(out|working)$/i.test(e.title) ? e.title : "")}" ${ro ? "disabled" : ""}></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1"><span>Day</span><input type="date" id="ev_d" value="${esc(e ? e.day : pre.day || ST.sel[key])}" ${ro ? "disabled" : ""}></label><label class="field" style="flex:1"><span>Until (optional)</span><input type="date" id="ev_e" value="${esc(e && e.end_day || "")}" ${ro ? "disabled" : ""}></label></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1"><span>Starts (blank = all day)</span><input type="time" id="ev_s" value="${esc(e && e.start_time ? e.start_time.slice(0, 5) : pre.start || "")}" ${ro ? "disabled" : ""}></label><label class="field" style="flex:1"><span>Ends</span><input type="time" id="ev_f" value="${esc(e && e.end_time ? e.end_time.slice(0, 5) : pre.start ? endTime(pre.start, 60) : "")}" ${ro ? "disabled" : ""}></label></div>
      <label class="field"><span>Where</span><input id="ev_l" value="${esc(e && e.location || "")}" ${ro ? "disabled" : ""}></label>${attH}
      <label class="field"><span>Notes</span><textarea id="ev_n" style="min-height:70px" placeholder="Don't type codes or passwords here." ${ro ? "disabled" : ""}>${esc(e && e.notes || "")}</textarea></label>
      ${ro ? "" : `<div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" id="ev_go">Save</button>${e ? `<button class="btn" id="ev_off">Remove</button>` : ""}</div>`}<p class="muted" id="ev_m"></p>`;
    $("#evm").classList.add("on");
    $("#evx").onclick = () => $("#evm").classList.remove("on");
    if(ro) return;
    const go = async off => { const t = $("#ev_t").value.trim(), d = $("#ev_d").value;
      if((kind === "event" && !t) || !d) return $("#ev_m").textContent = "Add what and which day.";
      const att = cal === "office" && kind === "event" ? [...$("#evcard").querySelectorAll("[data-att]:checked")].map(x => x.dataset.att) : null;
      const r = await sb.rpc("cal_event_save3", { p_attendees:att, p_id:e ? e.id : null, p_cal:cal, p_kind:kind, p_person:$("#ev_p") ? $("#ev_p").value : null, p_title:t, p_day:d, p_end_day:$("#ev_e").value || null,
        p_start:$("#ev_s").value || null, p_end:$("#ev_f").value || null, p_location:$("#ev_l").value, p_notes:$("#ev_n").value, p_off:!!off });
      if(r.error) return $("#ev_m").textContent = "Couldn't save: " + r.error.message;
      ST.sel[key] = d; evCal(v, key); };
    $("#ev_go").onclick = () => go(false);
    if($("#ev_off")) $("#ev_off").onclick = () => { if(confirm("Remove this from the calendar?")) go(true); };
  };
  draw();
}
function resDetail(st, sel){
  const arr = st.filter(x => x.in === sel), dep = st.filter(x => x.out === sel), inh = st.filter(x => x.in <= sel && x.out > sel);
  const row = (x, what) => `<div class="it"><span class="d">${esc(x.unit)}</span><span style="flex:1">${x.owner ? `<span class="pill amber">Owner</span> ` : ""}${esc(x.guest || "")}<span class="muted"> · ${what} · ${x.nights} night${x.nights === 1 ? "" : "s"}${x.type ? " · " + esc(x.type) : ""}</span></span></div>`;
  return `<div class="card list"><b style="font-size:16px">${esc(fday(sel))}</b><span class="muted"> · ${inh.length} home${inh.length === 1 ? "" : "s"} with someone in</span>
    <h4 style="margin:10px 0 2px">Arriving (${arr.length})</h4>${arr.map(x => row(x, "until " + fday(x.out))).join("") || `<p class="muted" style="margin:2px 0">None</p>`}
    <h4 style="margin:10px 0 2px">Leaving (${dep.length})</h4>${dep.map(x => row(x, "since " + fday(x.in))).join("") || `<p class="muted" style="margin:2px 0">None</p>`}</div>`;
}
/* Office side panel: who's in / out on the selected day + everyone's contact info (Brandon 2026-10-29) */
function whoPanel(ppl, evs, sel, ox, fn){
  ox = ox || { meetings:[], shifts:[], off:[] };
  const sh = id => ox.shifts.filter(x => x.day === sel && x.user_id === id), hoff = id => ox.off.filter(x => x.day === sel && x.user_id === id && !x.req);
  const mts = id => ox.meetings.filter(m => m.day === sel && (m.people || []).includes(id)).sort((x, y) => x.start.localeCompare(y.start));
  const on = evs.filter(e => evOn(e, sel) && e.kind && e.kind !== "event"), st = id => { const x = on.filter(e => e.person_id === id);
    return x.find(e => e.kind === "out") || hoff(id).length ? "out" : x.length || sh(id).length ? "working" : null; };
  const t = today(), clocked = p => sel === t && p.clocked, nw = new Date(), nowT = hhmm(nw.getHours() * 60 + nw.getMinutes());
  const inMeet = id => sel === t && mts(id).some(m => m.start <= nowT && nowT < m.end);
  const rng = x => ftime(x.start) + "–" + ftime(x.end);
  const out = ppl.filter(p => st(p.id) === "out"), inn = ppl.filter(p => st(p.id) !== "out" && (st(p.id) === "working" || clocked(p)));
  const slackUrl = id => "https://slack.com/app_redirect?channel=" + encodeURIComponent(id);
  const person = p => { const s = st(p.id); return `<div class="pp" data-n="${esc((p.name + " " + (p.title || "") + " " + (p.teams || []).join(" ")).toLowerCase())}">
    <div><span class="dot" style="background:${s === "out" ? "var(--red,#b3261e)" : s === "working" || clocked(p) ? "var(--forest-2,#2f5d3a)" : "var(--line)"}"></span><b>${esc(p.name)}</b>${s === "out" ? ` <span class="pill red">Out</span>` : clocked(p) ? ` <span class="pill green">On the clock</span>` : s === "working" ? ` <span class="pill green">Working</span>` : ""}${inMeet(p.id) ? ` <span class="pill blue">In a meeting</span>` : ""}</div>
    <div class="ttl">${esc([p.title, (p.teams || []).join(" · ")].filter(Boolean).join(" — "))}</div>
    ${sh(p.id).length || hoff(p.id).length ? `<div class="ttl">${sh(p.id).map(x => "Scheduled " + rng(x)).concat(hoff(p.id).map(x => "Time off" + (x.start ? " " + rng(x) : " all day"))).map(esc).join(" · ")}</div>` : ""}
    ${mts(p.id).length ? `<div class="mts">🗓 ${mts(p.id).map(m => esc(ftime(m.start) + " " + (m.meet ? NAMES[m.meet] : "Meeting"))).join(" · ")}</div>` : ""}
    <div class="ct">${p.ext ? `<span>☎ Ext. ${esc(p.ext)}</span>` : ""}${p.slack ? `<a href="${esc(slackUrl(p.slack))}" target="_blank" rel="noopener">💬 Slack</a>` : ""}${p.email ? `<a data-mailto href="mailto:${esc(p.email)}">✉ ${esc(p.email)}</a>` : ""}</div></div>`; };
  return `<div class="card"><b style="font-size:16px">${sel === t ? "Today" : esc(fday(sel))}</b>
      <p class="muted" style="margin:4px 0 6px;font-size:13px">${inn.length} working${out.length ? ` · ${out.length} out` : ""}</p>
      ${out.length ? `<div style="font-size:13.5px;margin-bottom:4px"><b>Out:</b> ${out.map(p => esc(p.name)).join(", ")}</div>` : ""}
      ${inn.length ? `<div style="font-size:13.5px"><b>Working:</b> ${inn.map(p => esc(p.name)).join(", ")}</div>` : ""}
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">Working = Hubstaff schedule, clocked in today in Hubstaff ("On the clock"), or marked working here. Out = approved Hubstaff time off or marked out here.</p></div>
    <div class="card"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:16px;flex:1">How to reach someone</b></div>
      <input id="ppq" type="search" placeholder="Search name, title or team" style="margin:6px 0">
      ${ppl.map(person).join("")}
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">Titles and extensions: Moose Office page (Property Details ▸ Moose Office). Work email from the hub sign-in list.</p></div>`;
}

/* ---------- Time off (hub_timeoff.sql). Balances + requests are RLS-limited to you, the people you approve, and admins. ---------- */
const TK = { pto:"Paid time off", unpaid:"Unpaid time off", sick:"Sick" };
const isSal = p => /salaried/i.test((p && p.name) || "");
/* which balances a person sees: salaried -> only the salaried policy; others -> paid + unpaid (never sick) */
const shownBals = (bs, pol) => { const sal = bs.some(b => isSal(pol(b.policy_id))); return bs.filter(b => sal ? isSal(pol(b.policy_id)) : pol(b.policy_id).kind !== "sick"); };
const polName = p => isSal(p) ? "Salaried time off" : (p.name || "");
const balOf = b => b.calc_hours != null ? +b.calc_hours : +b.hours;   // the hub's number for hourly PTO, else Hubstaff's
const hrs = x => x == null ? "—" : (Math.round(x * 100) / 100) + " h";
const whenR = r => (r.day === r.end_day ? fday(r.day) : fday(r.day) + " – " + fday(r.end_day)) + (r.all_day ? "" : ", " + ftime(r.start_time.slice(0, 5)) + "–" + ftime(r.end_time.slice(0, 5)));
const stPill = r => r.status === "approved" ? `<span class="pill green">Approved</span>` : r.status === "denied" ? `<span class="pill red">Not approved</span>` : r.status === "cancelled" ? `<span class="pill">Cancelled</span>` : `<span class="pill amber">Waiting</span>`;
const hsPill = r => r.status !== "approved" ? "" : r.hs_status === "sent" ? ` <span class="pill green">In Hubstaff</span>`
  : r.hs_status === "failed" || r.hs_status === "sending" ? ` <span class="pill red" title="${esc(r.hs_error || "Stopped while sending; check Hubstaff")}">Hubstaff: not sent</span>`
  : r.hs_status === "skipped" ? ` <span class="pill amber" title="${esc(r.hs_error || "")}">Add in Hubstaff by hand</span>` : ` <span class="pill">Going to Hubstaff</span>`;
/* PTO you'll have by a date: hours-worked policies earn hours_per for every hours_worked, at your pace this year, up to the max (estimate) */
function ptoBy(b, pol, by){
  const c = pol.config || {}; if(pol.policy_type !== "hours_worked" || !c.hours_worked || b.worked_ytd == null) return null;
  const t = new Date(), y0 = new Date(t.getFullYear(), 0, 1), wks = Math.max(1, (t - y0) / 6048e5), perWk = b.worked_ytd / wks, ahead = Math.max(0, (D(by) - t) / 6048e5);
  const add = perWk * ahead * c.hours_per / c.hours_worked, cap = c.maximum_to_accrue ? +c.maximum_to_accrue : Infinity;
  return { h:Math.min(cap, balOf(b) + add), perWk, capped:balOf(b) + add > cap, cap };
}
async function timeOff(v){
  v.innerHTML = `<div class="page cal">${tabs("cal_off")}<p class="muted">Loading…</p></div>`;
  const [ppl, br, pr, rr, ar] = await Promise.all([people(), sb.from("hub_pto_balances").select("*"), sb.from("hub_pto_policies").select("*"),
    sb.from("hub_timeoff_requests").select("*").order("day", { ascending:false }).limit(300), sb.from("hub_timeoff_approvers").select("*").eq("off", false)]);
  if(current() !== "cal_off") return;
  const myId = (ppl.find(p => p.name === ME.name) || {}).id, who = id => (ppl.find(p => p.id === id) || {}).name || "Someone";
  const bals = br.data || [], pols = pr.data || [], reqs = rr.data || [], pol = id => pols.find(p => p.id === id) || {};
  const myB = shownBals(bals.filter(b => b.user_id === myId), pol), sal = myB.some(b => isSal(pol(b.policy_id))), mine = reqs.filter(r => r.user_id === myId), others = reqs.filter(r => r.user_id !== myId);
  const approver = ME.admin || (ar.data || []).some(a => a.approver === myId), wait = others.filter(r => r.status === "pending");
  const by = ST.ptoBy || (new Date().getFullYear() + "-12-31");
  const balCard = b => { const p = pol(b.policy_id), f = ptoBy(b, p, by), c = p.config || {};
    return `<div class="card"><div class="muted" style="font-size:12.5px">${esc(polName(p))}</div><b class="n">${hrs(balOf(b))}</b>
      ${b.calc_hours != null ? `<div class="muted" style="font-size:11.5px">Worked out by the hub: ${esc(b.calc_note || "")} Hubstaff shows ${hrs(b.hours)}.</div>` : ""}
      <div style="font-size:12.5px">${p.policy_type === "hours_worked" ? `Earns ${esc(c.hours_per)} h for every ${esc(c.hours_worked)} h worked${c.maximum_to_accrue ? `, up to ${esc(c.maximum_to_accrue)} h` : ""}.`
        : p.policy_type === "annual" ? `${esc(c.hours_per_year)} h a year.` : p.policy_type === "joined_date" ? `${esc(c.hours_per_year)} h a year from your start date.` : ""}</div>
      ${f ? `<div style="font-size:13px;margin-top:6px">By ${esc(fday(by))}: <b>about ${hrs(f.h)}</b>${f.capped ? ` (the ${f.cap} h max)` : ""}<div class="muted" style="font-size:11.5px">Estimate at your pace this year (${Math.round(f.perWk)} h a week tracked in Hubstaff), if you don't use any.</div></div>` : ""}</div>`; };
  const kl = r => r.kind === "pto" && isSal(pol(r.policy_id)) ? "Salaried time off" : TK[r.kind];
  const reqRow = (r, act) => `<tr><td>${act === "team" || act === "wait" ? `<b>${esc(who(r.user_id))}</b><br>` : ""}${esc(whenR(r))}</td><td>${hrs(r.hours)}<br><span class="muted">${esc(kl(r))}</span></td>
      <td>${stPill(r)}${hsPill(r)}${r.decided_by && r.status !== "cancelled" ? `<div class="muted" style="font-size:12px">by ${esc(r.decided_by)}${r.response ? ": " + esc(r.response) : ""}</div>` : ""}${r.reason ? `<div class="muted" style="font-size:12px">“${esc(r.reason)}”</div>` : ""}</td>
      <td style="white-space:nowrap">${act === "mine" && r.status === "pending" ? `<button class="btn small" data-cancel="${r.id}">Cancel</button>` : ""}
        ${act === "wait" ? `<button class="btn small primary" data-ok="${r.id}">Approve</button> <button class="btn small" data-no="${r.id}">Deny</button>` : ""}
        ${ME.admin && r.status === "approved" && (r.hs_status === "failed" || r.hs_status === "sending") ? `<button class="btn small" data-resend="${r.id}">Send again</button>` : ""}</td></tr>`;
  const table = (rows, act) => rows.length ? `<div class="tow"><table class="to"><tr><th>When</th><th>Hours</th><th>Status</th><th></th></tr>${rows.map(r => reqRow(r, act)).join("")}</table></div>` : `<p class="muted" style="margin:4px 0 0">None.</p>`;
  const teamB = bals.filter(b => b.user_id !== myId), teamIds = [...new Set(teamB.map(b => b.user_id))].sort((x, y) => who(x).localeCompare(who(y)));
  const flagged = teamB.concat(ME.admin ? myB : []).filter(b => b.check_flag);
  const myOrder = myB.slice().sort((x, y) => (pol(x.policy_id).kind === "pto" ? 0 : 1) - (pol(y.policy_id).kind === "pto" ? 0 : 1));
  const teamRow = id => teamB.filter(b => b.user_id === id).sort((x, y) => (pol(y.policy_id).paid ? 1 : 0) - (pol(x.policy_id).paid ? 1 : 0)).map((b, i) =>
    `<tr><td>${i ? "" : `<b>${esc(who(id))}</b>`}</td><td>${esc(pol(b.policy_id).name || "")}</td><td>${hrs(b.hours)}${b.check_flag ? ` <span class="pill amber">Check</span>` : ""}</td><td>${pol(b.policy_id).policy_type === "hours_worked" ? hrs(b.worked_ytd) : ""}</td><td>${b.earned_ytd != null ? hrs(b.earned_ytd) : ""}</td><td>${hrs(b.used_ytd)}</td></tr>`).join("");
  v.innerHTML = `<div class="page cal">${tabs("cal_off")}
    <div class="chead"><h2>Request time off</h2><button class="btn primary" id="askoff">🌴 Ask for time off</button></div>
    ${approver && wait.length ? `<div class="card" style="border-left:4px solid var(--amber,#8a5a00)"><b style="font-size:16px">Waiting for you (${wait.length})</b>${table(wait, "wait")}</div>` : ""}
    <div class="card"><b style="font-size:16px">Your balances</b>
      ${myB.length ? `<div style="margin:8px 0;font-size:13px">See what you'll have by <input type="date" id="ptoby" value="${esc(by)}" style="width:auto;display:inline-block;min-height:32px"></div>
        <div class="bal">${myOrder.map(balCard).join("")}</div>`
      : `<p class="muted" style="margin:6px 0 0">You're not set up in Hubstaff time off yet, so there's no balance to show. You can still ask for time off; your manager will see it.</p>`}</div>
    <div class="card"><b style="font-size:16px">Your requests</b>${table(mine, "mine")}</div>
    ${approver && others.some(r => r.status !== "pending") ? `<div class="card"><b style="font-size:16px">Requests you approved or denied</b>${table(others.filter(r => r.status !== "pending" && r.decided_by === ME.name).slice(0, 30), "team")}</div>` : ""}
    <p class="muted" style="font-size:12px">Balances and policies: Hubstaff (updated ${esc(bals[0] ? new Date(bals[0].as_of).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "—")}). Approved requests are added to Hubstaff by the hub (paid time off under your PTO policy). Your reason is seen only by you, the person who approves, and Brandon or Kim.</p>
    <div class="modal" id="tom"><div class="card" id="tocard"></div></div></div>`;
  const reload = () => timeOff(v), act = async (fnm, args) => { const r = await sb.rpc(fnm, args); if(r.error) alert(r.error.message); else reload(); };
  const pd = v.querySelector("#ptoby"); if(pd) pd.onchange = () => { ST.ptoBy = pd.value || null; reload(); };
  v.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => confirm("Cancel this request?") && act("timeoff_decide", { p_id:+b.dataset.cancel, p_status:"cancelled", p_response:null }));
  v.querySelectorAll("[data-ok]").forEach(b => b.onclick = () => act("timeoff_decide", { p_id:+b.dataset.ok, p_status:"approved", p_response:null }));
  v.querySelectorAll("[data-no]").forEach(b => b.onclick = () => { const why = prompt("Short reason for saying no (they'll see it):"); if(why && why.trim()) act("timeoff_decide", { p_id:+b.dataset.no, p_status:"denied", p_response:why.trim() }); });
  v.querySelectorAll("[data-resend]").forEach(b => b.onclick = () => confirm("Check Hubstaff first: is this time off already there? Send it again only if it isn't.") && act("timeoff_resend", { p_id:+b.dataset.resend }));
  const ask = () => {
    const left = k => { const b = myB.find(x => pol(x.policy_id).kind === k); return b && k === "pto" ? ` (${hrs(balOf(b))} left)` : ""; };
    $("#tocard").innerHTML = `<div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:20px;flex:1;margin:0">Ask for time off</h2><button class="btn small" id="tox" aria-label="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>
      <label class="field"><span>Type</span><select id="to_k">${(sal ? [["pto","Salaried time off"]] : [["pto",TK.pto],["unpaid",TK.unpaid]]).map(([k, l]) => `<option value="${k}">${l}${left(k)}</option>`).join("")}</select></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1"><span>From</span><input type="date" id="to_d" value="${esc(addD(today(), 1))}"></label><label class="field" style="flex:1"><span>To (last day off)</span><input type="date" id="to_e"></label></div>
      <label class="lyr" style="margin:4px 0"><input type="checkbox" id="to_all" checked>All day (8 h a day)</label>
      <div id="to_hr" style="display:none;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1"><span>From time</span><input type="time" id="to_s" value="13:00"></label><label class="field" style="flex:1"><span>To time</span><input type="time" id="to_f" value="17:00"></label></div>
      <label class="field"><span>Reason (optional; only you, your manager and Brandon or Kim see it)</span><textarea id="to_r" style="min-height:60px"></textarea></label>
      <button class="btn primary wide" id="to_go">Send to my manager</button><p class="muted" id="to_m"></p>`;
    $("#tom").classList.add("on"); $("#tox").onclick = () => $("#tom").classList.remove("on");
    $("#to_all").onchange = () => { $("#to_hr").style.display = $("#to_all").checked ? "none" : "flex"; };
    $("#to_go").onclick = async () => { const all = $("#to_all").checked, d = $("#to_d").value;
      if(!d) return $("#to_m").textContent = "Pick the first day.";
      const r = await sb.rpc("timeoff_request", { p_kind:$("#to_k").value, p_day:d, p_end_day:all ? ($("#to_e").value || d) : d, p_all_day:all,
        p_start:all ? null : $("#to_s").value, p_end:all ? null : $("#to_f").value, p_reason:$("#to_r").value });
      if(r.error) return $("#to_m").textContent = r.error.message;
      $("#tom").classList.remove("on"); reload(); };
  };
  v.querySelector("#askoff").onclick = ask;
  if(ST.askOff){ ST.askOff = false; ask(); }
}

/* ---------- Reports ▸ Team ▸ PTO (hub_pto_reports.sql): balances + requests (#/pto) and the math check (#/pto/check).
   Rows come through RLS (hub_pto_sees): admins everyone, managers their own team, approvers the people they approve. ---------- */
window.ptoReport = async function(v, sub){
  css(); const chk = sub === "check";
  v.innerHTML = `<div class="page cal wide"><p class="muted">Loading…</p></div>`;
  const [ppl, br, pr, rr] = await Promise.all([people(), sb.from("hub_pto_balances").select("*"), sb.from("hub_pto_policies").select("*"),
    sb.from("hub_timeoff_requests").select("*").order("day", { ascending:false }).limit(500)]);
  const who = id => (ppl.find(p => p.id === id) || {}).name || "Someone", pols = pr.data || [], pol = id => pols.find(p => p.id === id) || {};
  const bals0 = br.data || [], bals = [...new Set(bals0.map(b => b.user_id))].flatMap(id => shownBals(bals0.filter(b => b.user_id === id), pol)), reqs = rr.data || [];
  const kl = r => r.kind === "pto" && isSal(pol(r.policy_id)) ? "Salaried time off" : TK[r.kind];
  const ids = [...new Set(bals.map(b => b.user_id).concat(reqs.map(r => r.user_id)))].sort((x, y) => who(x).localeCompare(who(y)));
  const scope = ME.admin ? "Everyone" : "Your team";
  const head = `<div style="padding:0 0 8px"><a href="#/reports">← All reports</a></div><div class="chead"><h2>${chk ? "PTO: check Hubstaff's math" : "PTO balances"}</h2>
    <a class="btn small" href="${chk ? "#/pto" : "#/pto/check"}">${chk ? "PTO balances" : "Check Hubstaff's math"}</a></div>
    <p class="muted" style="margin:0 0 10px">${scope}${ME.admin ? "" : " (and you)"} · source: Hubstaff (updated ${esc(bals[0] ? new Date(bals[0].as_of).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "—")})</p>`;
  if(chk){
    const f = bals.filter(b => b.check_flag), pto = bals.filter(b => pol(b.policy_id).policy_type === "hours_worked");
    v.innerHTML = `<div class="page cal wide">${head}
      <div class="card"><p class="muted" style="font-size:13px;margin:0 0 8px">The hub works out hourly PTO itself: ${esc(pto[0] ? pol(pto[0].policy_id).config.hours_per + " h for every " + pol(pto[0].policy_id).config.hours_worked + " h tracked in Hubstaff" : "the PTO rate")} since the policy started, never more than the max, minus PTO used. That is the balance people see and ask against. "Hubstaff balance" is what Hubstaff shows; fix Hubstaff to match if you want them to agree. Salaried: ${esc("80 h a year minus hours used")}.</p>
      <div class="tow"><table class="to"><tr><th>Who</th><th>Policy</th><th>Worked this year</th><th>Earned this year</th><th>Used this year</th><th>Hub balance</th><th>Hubstaff balance</th><th>Looks</th></tr>
      ${bals.filter(b => b.earned_ytd != null).sort((x, y) => who(x.user_id).localeCompare(who(y.user_id))).map(b => `<tr><td><b>${esc(who(b.user_id))}</b></td><td>${esc(polName(pol(b.policy_id)))}</td><td>${pol(b.policy_id).policy_type === "hours_worked" ? hrs(b.worked_ytd) : "—"}</td><td>${hrs(b.earned_ytd)}</td><td>${hrs(b.used_ytd)}</td><td><b>${hrs(b.calc_hours != null ? b.calc_hours : (pol(b.policy_id).config.hours_per_year || 0) - b.used_ytd)}</b></td><td>${hrs(b.hours)}</td>
        <td>${b.check_flag ? `<span class="pill amber">Check</span><div class="muted" style="font-size:12px">${esc(b.check_note || "")}</div>` : `<span class="pill green">Same</span>`}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">Nobody on your team has a Hubstaff PTO balance.</td></tr>`}</table></div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">${f.length} of ${bals.filter(b => b.earned_ytd != null).length} where Hubstaff doesn't match.</p></div></div>`;
    return;
  }
  const yr = String(new Date().getFullYear());
  const row = id => { const bs = bals.filter(b => b.user_id === id).sort((x, y) => (pol(x.policy_id).kind === "pto" ? 0 : 1) - (pol(y.policy_id).kind === "pto" ? 0 : 1));
    const rs = reqs.filter(r => r.user_id === id), wait = rs.filter(r => r.status === "pending").length, taken = rs.filter(r => r.status === "approved" && r.day.slice(0, 4) === yr);
    return `<tr><td><b>${esc(who(id))}</b></td><td>${bs.map(b => `${esc(polName(pol(b.policy_id)))}: <b>${hrs(balOf(b))}</b>${b.calc_hours != null ? ` <span class="muted">(Hubstaff ${hrs(b.hours)})</span>` : ""}${b.check_flag ? ` <span class="pill amber">Check</span>` : ""}`).join("<br>") || `<span class="muted">Not in Hubstaff time off</span>`}</td>
      <td>${bs.filter(b => pol(b.policy_id).policy_type === "hours_worked").map(b => hrs(b.worked_ytd)).join("<br>")}</td>
      <td>${[...new Set(taken.map(kl))].map(l => `${esc(l)}: ${hrs(taken.filter(r => kl(r) === l).reduce((a, r) => a + +r.hours, 0))}`).join("<br>") || "—"}</td>
      <td>${wait ? `<a href="#/cal_off" class="pill amber" style="text-decoration:none">${wait} waiting</a>` : "—"}</td></tr>`; };
  v.innerHTML = `<div class="page cal wide">${head}
    <div class="card"><div class="tow"><table class="to"><tr><th>Who</th><th>Balances</th><th>Worked this year</th><th>Approved in the hub this year</th><th>Requests</th></tr>${ids.map(row).join("") || `<tr><td colspan="5" class="muted">Nobody on your team yet.</td></tr>`}</table></div></div>
    <div class="card"><b style="font-size:16px">Time-off requests</b>${reqs.length ? `<div class="tow"><table class="to"><tr><th>Who</th><th>When</th><th>Hours</th><th>Status</th></tr>${reqs.slice(0, 150).map(r => `<tr><td><b>${esc(who(r.user_id))}</b></td><td>${esc(whenR(r))}</td><td>${hrs(r.hours)} · ${esc(kl(r))}</td><td>${stPill(r)}${hsPill(r)}${r.decided_by && r.status !== "cancelled" ? `<div class="muted" style="font-size:12px">by ${esc(r.decided_by)}${r.response ? ": " + esc(r.response) : ""}</div>` : ""}</td></tr>`).join("")}</table></div>` : `<p class="muted" style="margin:4px 0 0">No requests made in the hub yet.</p>`}</div>
    <p class="muted" style="font-size:12px">Time off asked in Hubstaff itself (before the hub) is in Hubstaff's balance but not in this list.</p></div>`;
};

/* ---------- Home: your next 7 days (meetings you can open, office events, your own events) ---------- */
window.calHomeCard = async function(el){
  if(!el) return; css();
  const t = today(), b = addD(t, 6);
  const [ms, evs, ppl, tw] = await Promise.all([meetings(true), events(t, b), people(), sb.from("hub_timeoff_requests").select("user_id").eq("status", "pending")]);
  const myId = (ppl.find(p => p.name === ME.name) || {}).id, nWait = ((tw && tw.data) || []).filter(r => r.user_id !== myId).length;
  const rows = [];
  ms.forEach(m => occurs(m, t, b).forEach(s => rows.push({ d:s, t:m.start || "", h:`<a href="#/${m.meet}"><b>${esc(NAMES[m.meet])} meeting</b></a>${m.start ? " · " + ftime(m.start) : ""}${m.open_tasks ? ` <span class="muted">· ${m.open_tasks} open task${m.open_tasks === 1 ? "" : "s"}</span>` : ""}` })));
  evs.filter(e => (e.kind || "event") === "event").forEach(e => { for(let s = e.day < t ? t : e.day; s <= (e.end_day || e.day) && s <= b; s = addD(s, 1))
    rows.push({ d:s, t:(e.start_time || "").slice(0, 5), h:`${e.cal === "office" ? `<span class="pill amber">Office</span> ` : ""}${esc(e.title)}${e.start_time ? " · " + ftime(e.start_time.slice(0, 5)) : ""}` }); });
  rows.sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t));
  el.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><b style="font-size:17px">🗓️ Your week</b><a class="btn small" style="margin-left:auto" href="#/cal_me">Calendar</a></div>
    ${nWait ? `<a href="#/cal_off" class="pill amber" style="display:inline-block;margin:6px 0;text-decoration:none">🌴 ${nWait} time-off request${nWait === 1 ? "" : "s"} waiting for you</a>` : ""}
    <div class="calwk">${rows.length ? rows.map(r => `<div class="it"><span class="d">${r.d === t ? "Today" : esc(fday(r.d))}</span><span style="flex:1">${r.h}</span></div>`).join("") : `<p class="muted">Nothing on your calendar in the next 7 days.</p>`}</div>`;
};
})();
