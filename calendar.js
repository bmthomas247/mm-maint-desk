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
   Work check (Brandon 2026-10-29, cloud workers' screens + mouse movers, admins + managers; hub_work_check.sql): Reports ▸ Team (#/work_check).
   Routes: #/cal_res · #/cal_office · #/cal_me · #/cal_meet · #/cal_off · #/pto · #/work_check */
(function(){
const NAMES = { meet_maint:"Monday maintenance", meet_or:"Owner Relations", meet_bd:"Business Development", meet_kd:"Key Data", meet_beyond:"Beyond Pricing", meet_mgr:"Managers", meet_fd:"Office Staff Monthly", meet_track:"Track Business Review", meet_trackmk:"Track Digital Marketing" };
const TABS = [["cal_res","Reservations"],["cal_office","Office"],["cal_me","Personal"],["cal_meet","Meetings"]];   // Request time off moved to Staffing (Brandon 2026-10-29)
const VIEWS = [["list","List"],["day","Day"],["work","Work week"],["week","Week"],["month","Month"],["wm","Week + Month"]];   // List = 2 weeks as a list (Brandon 2026-11-13: easier + phones)
const LISTN = 14;
const LAYERS = { cal_me:[["meet","Meetings"],["personal","My events"],["outlook","Outlook"],["office","Office"],["checkins","Check-ins"]], cal_office:[["events","Work events"],["meet","Meetings"],["sched","Schedules"],["people","Who's in / out"]] };
const LAYER_ON = { outlook:true, meet:true, personal:true, office:false, checkins:false, events:true, people:true, sched:true };
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
.cal .ev.dec,.cal .bk.dec{opacity:.55;text-decoration:line-through}
.cal .fb{padding:10px 12px;margin:8px 0} .cal .fbd{padding:6px 0;border-bottom:1px solid var(--line);font-size:13px} .cal .fbd:last-child{border-bottom:0}
.cal .fbd>b{display:inline-block;min-width:96px} .cal .fbc{border:1px solid var(--forest,#1d3b2a);background:var(--card);color:var(--forest,#1d3b2a);border-radius:999px;padding:2px 9px;margin:2px 3px 2px 0;font-size:12.5px;min-height:0;cursor:pointer}
.cal .fbc.sel{background:var(--forest,#1d3b2a);color:#fff} .cal .fbc.part{border-style:dashed;color:var(--muted);border-color:var(--muted)}
.cal .fbr{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12.5px} .cal .fbr>span{flex:0 0 86px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal .fbt{position:relative;flex:1;height:16px;border-radius:5px;background:var(--line)} .cal .fbt i{position:absolute;top:0;bottom:0;border-radius:4px}
.cal .fbt i.w{background:var(--moose-soft,#cfe3d2)} .cal .fbt i.b{background:var(--muted,#7a857c);opacity:.75} .cal .fbt i.pk{border:2px solid var(--blue,#1f4e8c);background:transparent}
.cal .fbh{display:flex;justify-content:space-between;margin-left:94px;font-size:10.5px;color:var(--muted)}
.cal .ev.of,.cal .bk.of{background:var(--amber-soft,#fbf0dc);color:var(--amber,#8a5a00);border-left-color:var(--amber,#8a5a00)}
.cal .ev.outp,.cal .bk.outp{background:var(--red-soft,#fbe7e5);color:var(--red,#b3261e);border-left-color:var(--red,#b3261e)}
.cal .ev.work,.cal .bk.work{background:var(--moose-soft,#e5efe6);color:var(--moose-ink,#24452c)}
.cal .ev.sh,.cal .bk.sh{background:var(--ground,#f6f4ef);color:var(--ink-2,#3d4a40);border-left-color:var(--muted,#7a857c)}
.cal .pp .mts{font-size:12px;color:var(--blue,#1f4e8c);margin-top:2px}
.cal #evcard{max-height:calc(100dvh - 32px);overflow-y:auto;padding-top:0;padding-bottom:0} .cal #evcard .evhd,.cal #evcard .evft{position:sticky;background:inherit;z-index:3} .cal #evcard .evhd{top:0;padding:16px 0 8px} .cal #evcard .evft{bottom:0;padding:10px 0 14px}
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
.page.cal.calwide{max-width:1800px;padding:20px 28px} .cal .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:12px}
.cal .tile{display:block;text-decoration:none;color:inherit;margin:0;transition:box-shadow .15s} .cal .tile:hover{box-shadow:0 4px 16px rgba(10,30,20,.14)}
.cal .tile h3{margin:0 0 2px;font-size:17px} .cal .tile .when{font-size:13px;color:var(--ink-2)} .cal .tile ul{margin:6px 0 0;padding-left:18px;font-size:13px}
.cal .tile .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.calwk .it{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px} .calwk .it:last-child{border-bottom:0} .calwk .it .d{flex:0 0 96px;color:var(--muted);font-size:13px}
@media (max-width:980px){ .cal .cols{grid-template-columns:1fr} }
@media (max-width:640px){ .cal .grid .dc{min-height:58px;padding:3px} .cal .ev{font-size:10.5px;padding:0 3px} .cal .list .it .d{flex-basis:74px} }
/* 2026-11-13 (Brandon: "easier to use", "slow to update", "adding an event is slow", "bad on phones") */
.cal .lv{border:1px solid var(--line);border-radius:12px;background:var(--card);overflow:hidden;margin-bottom:12px}
.cal .lday{border-bottom:1px solid var(--line)} .cal .lday:last-child{border-bottom:0}
.cal .ldh{font-weight:800;font-size:13px;padding:8px 12px;background:var(--ground,#f6f4ef);color:var(--ink-2,#3d4a40)} .cal .lday.td .ldh{background:var(--moose-soft,#e5efe6);color:var(--forest,#1d3b2a)}
.cal .lrow{display:flex;align-items:center;gap:12px;padding:10px 12px;border-top:1px solid var(--line);text-decoration:none;color:inherit;border-left:4px solid var(--forest-2,#2f5d3a);min-height:52px}
.cal .lrow:hover{background:var(--ground,#f6f4ef)} .cal .lrow.mt{border-left-color:var(--blue,#1f4e8c)} .cal .lrow.of{border-left-color:var(--amber,#8a5a00)} .cal .lrow.outp{border-left-color:var(--red,#b3261e)} .cal .lrow.sh{border-left-color:var(--muted,#7a857c)}
.cal .lrow .lt{flex:0 0 64px;font-size:13px;font-weight:700} .cal .lrow .lt small{display:block;font-weight:400;color:var(--muted)}
.cal .lrow .lb{flex:1;min-width:0} .cal .lrow .lb b{display:block;font-size:14.5px;overflow:hidden;text-overflow:ellipsis} .cal .lrow .lb small{display:block;color:var(--muted);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal .qadd{display:flex;gap:8px;align-items:center;margin:0 0 6px} .cal .qadd input{flex:1;min-width:0;min-height:42px;font-size:15px}
.cal .qprev{font-size:12.5px;color:var(--muted);margin:0 0 10px;min-height:16px} .cal .qprev b{color:var(--forest,#1d3b2a)}
.cal .upd{font-size:12px;color:var(--muted);visibility:hidden} .cal.busy .upd{visibility:visible}
.cal details.evmore{border:1px solid var(--line);border-radius:10px;padding:2px 10px;margin:8px 0} .cal details.evmore>summary{cursor:pointer;font-weight:700;padding:8px 0;font-size:14px}
.cal .fab{display:none}
.cal .ev.ol,.cal .bk.ol{background:#eef3fb;color:#1b3f73;border-left-color:#0f6cbd} .cal .lrow.ol{border-left-color:#0f6cbd}
.cal .olw{border-left:4px solid var(--amber,#8a5a00)} .cal .olr{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line)} .cal .olb{display:flex;gap:6px;flex-wrap:wrap}
@media (max-width:700px){
  .page.cal{padding:12px 12px 90px}
  .cal .chead{gap:6px} .cal .chead h2{flex-basis:100%;order:-1;font-size:18px;min-width:0}
  .cal .ctool{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px} .cal .ctool>*{flex:none}
  .cal .ctabs{flex-wrap:nowrap;overflow-x:auto}
  .cal .side .card{margin-top:0}
  .cal #evm{padding:0;align-items:stretch} .cal #evm #evcard{width:100%;max-width:none;max-height:100dvh;height:100dvh;border-radius:0;padding-left:16px;padding-right:16px}
  .cal .fab{display:grid;place-items:center;position:fixed;right:18px;bottom:22px;width:58px;height:58px;border-radius:50%;background:var(--forest,#1d3b2a);color:#fff;font-size:30px;border:0;box-shadow:0 6px 18px rgba(0,0,0,.25);z-index:30}
}`;
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
const ST = { month:{}, sel:{}, meets:null, view:{}, prefs:null, people:null, cache:{} };

/* ---------- saved setup (cal_prefs_get / cal_prefs_set): default view per tab + layers ---------- */
async function prefs(){ if(ST.prefs) return ST.prefs; let p = {}; try { p = (await sb.rpc("cal_prefs_get")).data || {}; } catch(e){} ST.prefs = Object.assign({ view:{}, layers:{} }, p); return ST.prefs; }
const savePrefs = () => sb.rpc("cal_prefs_set", { p:ST.prefs }).then(r => { if(r.error) alert("Couldn't save your calendar setup: " + r.error.message); });
const defView = key => (ST.prefs && ST.prefs.view[key]) || (window.innerWidth < 700 ? "list" : "week");
const viewOf = key => ST.view[key] || defView(key);
const layerOn = l => { const v = ST.prefs && ST.prefs.layers[l]; return v == null ? LAYER_ON[l] : !!v; };

/* meeting dates between a and b (inclusive) from its schedule row */
// one meeting moved or skipped (hub_meeting_moves.sql, Brandon 2026-11-10): cal_meetings() gives m.moves [{from, kind move|skip, to, start, minutes, note, by}]
function occurs(m, a, b){ const out = occReg(m, a, b), mv = m.moves || []; if(!mv.length) return out;
  const gone = new Set(mv.map(x => x.from)), r = out.filter(s => !gone.has(s));
  mv.forEach(x => { if(x.kind === "move" && x.to >= a && x.to <= b && !r.includes(x.to)) r.push(x.to); }); return r.sort(); }
const mvTo = (m, s) => (m.moves || []).find(x => x.kind === "move" && x.to === s);
const mAt = (m, s) => { const x = mvTo(m, s); return x && x.start ? { start:x.start, minutes:x.minutes || m.minutes } : { start:m.start, minutes:m.minutes }; };
function occReg(m, a, b){
  if(m.nth){ const out = [];   // monthly: nth weekday (hub_meetings_monthly.sql)
    for(let f = new Date(D(a).getFullYear(), D(a).getMonth(), 1, 12); ymd(f) <= b; f = new Date(f.getFullYear(), f.getMonth() + 1, 1, 12)){
      const x = new Date(f); x.setDate(1 + (m.dow - x.getDay() + 7) % 7 + (m.nth - 1) * 7); const s = ymd(x);
      if(x.getMonth() === f.getMonth() && s >= a && s <= b && (!m.anchor || s >= m.anchor) && (!m.until || s <= m.until)) out.push(s); }
    return out; }
  const out = []; let d = D(a); d.setDate(d.getDate() + (m.dow - d.getDay() + 7) % 7);
  for(; ymd(d) <= b; d.setDate(d.getDate() + 7)){
    const s = ymd(d);
    if((m.anchor && s < m.anchor) || (m.until && s > m.until)) continue;   // anchor = first meeting (meeting_on() in SQL reads it the same way)
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

/* ---------- Quick add (Brandon 2026-11-13: "adding an event is slow"): one line like "Lunch with BHL 1403 owner Thu 12:30pm 1h".
   Reads the day (today, tomorrow, Mon…Sun, next Fri, 11/20, Nov 20), the time (noon, 2pm, 2:30, 2-3pm, 14:00), how long (1h, 90 min,
   for 2 hours), "all day" and a https link (= virtual). The rest is the title. ---------- */
const MONS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
function qparse(txt, base){
  let s = " " + txt.replace(/\s+/g, " ") + " ", day = null, start = null, end = null, mins = null, allDay = false, link = null;
  const cut = re => { const m = s.match(re); if(m) s = s.replace(m[0], " "); return m; };
  let m = cut(/\s(https:\/\/\S+)\s/i); if(m) link = m[1];
  if(cut(/\sall[ -]?day\s/i)) allDay = true;
  const t0 = today();
  if((m = cut(/\s(?:on\s)?(today|tonight)\s/i))) day = t0;
  else if((m = cut(/\s(?:on\s)?(tomorrow|tmrw|tmr)\s/i))) day = addD(t0, 1);
  else if((m = cut(/\s(?:on\s)?(next\s)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\.?\s/i))){
    const w = DOW.findIndex(x => x.toLowerCase() === m[2].slice(0, 3).toLowerCase()), n = (w - D(t0).getDay() + 7) % 7;   // "Fri" = the coming Friday (today if it's Friday); "next Fri" = a week after that
    day = addD(t0, n + (m[1] ? 7 : 0)); }
  else if((m = cut(/\s(?:on\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/))){ let y = m[3] ? +m[3] : D(t0).getFullYear(); if(y < 100) y += 2000;
    day = y + "-" + String(+m[1]).padStart(2, "0") + "-" + String(+m[2]).padStart(2, "0"); if(!m[3] && day < t0) day = (y + 1) + day.slice(4); }
  else if((m = cut(/\s(?:on\s)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s(\d{1,2})(?:st|nd|rd|th)?(?:,?\s(\d{4}))?\s/i))){
    let y = m[3] ? +m[3] : D(t0).getFullYear(); day = y + "-" + String(MONS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1).padStart(2, "0") + "-" + String(+m[2]).padStart(2, "0");
    if(!m[3] && day < t0) day = (y + 1) + day.slice(4); }
  const tm = (h, mi, ap) => { h = +h; mi = +(mi || 0); if(ap){ ap = ap[0].toLowerCase(); if(ap === "p" && h < 12) h += 12; if(ap === "a" && h === 12) h = 0; }
    else if(h >= 1 && h <= 6) h += 12; return h < 24 && mi < 60 ? hhmm(h * 60 + mi) : null; };
  if((m = cut(/\s(?:at\s|from\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm|a|p)?\s?(?:-|–|to)\s?(\d{1,2})(?::(\d{2}))?\s?(am|pm|a|p)?\s/i))){
    const ap2 = m[6], ap1 = m[3] || (ap2 && !(+m[1] > +m[4] && ap2[0].toLowerCase() === "p") ? ap2 : null);
    start = tm(m[1], m[2], ap1); end = tm(m[4], m[5], ap2 || ap1); }
  else if((m = cut(/\s(?:at\s)?(noon|midday)\s/i))) start = "12:00";
  else if((m = cut(/\s(?:at\s|@\s?)?(\d{1,2}):(\d{2})\s?(am|pm|a|p)?\s/i)) || (m = cut(/\s(?:at\s|@\s?)?(\d{1,2})()\s?(am|pm|a|p)\s/i)) || (m = cut(/\s(?:at|@)\s?(\d{1,2})()()\s/i)))
    start = tm(m[1], m[2], m[3]);
  if((m = cut(/\s(?:for\s)?(\d+(?:\.\d+)?)\s?(h|hr|hrs|hour|hours)\s/i))) mins = Math.round(parseFloat(m[1]) * 60);
  else if((m = cut(/\s(?:for\s)?(\d+)\s?(m|min|mins|minutes)\s/i))) mins = +m[1];
  if(start && !end) end = endTime(start, mins || 60);
  if(start && end && end <= start) end = endTime(start, mins || 60);
  const title = s.replace(/\s(at|on|from|for)\s*$/i, " ").replace(/^\s*(at|on)\s/i, " ").replace(/\s+/g, " ").trim();
  return { title, day:day || base, start:allDay ? null : start, end:allDay ? null : end, link };
}

/* ---------- ranges (weeks start Sunday, Brandon 2026-10-29) ---------- */
const weekStart = s => { const d = D(s); d.setDate(d.getDate() - d.getDay()); return ymd(d); };
function monthRange(key){ const m = ST.month[key] || (ST.sel[key] || today()).slice(0, 7), a = weekStart(m + "-01"); return [a, addD(a, 41)]; }
function gridDays(key){
  const v = viewOf(key), s = ST.sel[key] || today(), w = weekStart(s);
  if(v === "day") return [s];
  if(v === "list") return Array.from({ length:LISTN }, (_, i) => addD(s, i));
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
      <label class="btn small" title="Pick a date" style="position:relative;overflow:hidden">📅 Go to date<input type="date" data-goto value="${esc(ST.sel[key] || today())}" aria-label="Go to date" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;margin:0;padding:0;border:0"></label>
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
    else { ST.sel[key] = addD(ST.sel[key] || today(), n * (vw === "day" ? 1 : vw === "list" ? LISTN : 7)); ST.month[key] = ST.sel[key].slice(0, 7); }
    again(); });
  v.querySelectorAll("[data-goto]").forEach(i => {   // 📅 Go to date (Brandon 2026-11-06): pick any day, the calendar jumps there
    i.onclick = () => { try { if(i.showPicker) i.showPicker(); } catch(_){} };
    i.onchange = () => { if(!/^\d{4}-\d{2}-\d{2}$/.test(i.value)) return; ST.sel[key] = i.value; ST.month[key] = i.value.slice(0, 7); again(); }; });
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
const attrs = x => (x.href ? `href="${esc(x.href)}"` : `href="#"`) + (x.ev ? ` data-ev="${x.ev}"` : "") + (x.mt ? ` data-mt="${x.mt}"` : "") + (x.ol ? ` data-ol="${x.ol}"` : "") + (x.sm ? ` data-sm="${esc(x.sm)}" data-smd="${esc(x.smd || "")}"` : "") + (x.drag ? " data-drag" : "");
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
// List view: every day with something on it, big rows you can tap (phones open on this)
function listView(key, items){
  const t = today(), days = gridDays(key);
  const row = x => `<a class="lrow ${x.cls || ""}" ${attrs(Object.assign({}, x, { drag:false }))}><span class="lt">${x.start ? esc(ftime(x.start.slice(0, 5))) + (x.end ? `<small>${esc(ftime(x.end.slice(0, 5)))}</small>` : "") : "All day"}</span><span class="lb"><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</span>${x.join ? `<span class="btn small primary" data-join="${esc(x.join)}">💻 Join</span>` : ""}</a>`;
  const h = days.map(s => { const its = items(s).sort((x, y) => (x.start || "").localeCompare(y.start || ""));
    if(!its.length && s !== t) return "";
    return `<div class="lday${s === t ? " td" : ""}"><div class="ldh">${s === t ? "Today · " : s === addD(t, 1) ? "Tomorrow · " : ""}${esc(fday(s))}</div>${its.length ? its.map(row).join("") : `<p class="muted" style="margin:6px 12px 10px">Nothing on.</p>`}</div>`; }).join("");
  return `<div class="lv">${h || `<p class="muted" style="padding:14px">Nothing in these two weeks.</p>`}</div>`;
}
function body(key, items, canAdd, hours){
  const v = viewOf(key);
  if(v === "list") return listView(key, items);
  if(v === "month") return monthGrid(key, items);
  if(v === "wm") return timeGrid(key, items, canAdd, hours) + monthGrid(key, items);
  return timeGrid(key, items, canAdd, hours);
}
/* scroll the hour grid to 8 am (or near now); click an empty slot to add; drag your own events (hour grid: day + time, month: day) */
function wireGrid(v, onSlot, onMove, onOpen){
  const b = v.querySelector(".wkb"); if(b){ const n = new Date(), m = n.getHours() * 60 + n.getMinutes(); b.scrollTop = Math.max(0, ((m > 9 * 60 && m < WE * 60 ? m - 90 : 8 * 60) - WS * 60) / 60 * HPX); }
  if(onSlot) v.querySelectorAll(".wkc.add").forEach(c => c.onclick = e => { if(e.target.closest(".bk")) return;
    const y = e.clientY - c.getBoundingClientRect().top; onSlot(c.dataset.slot, hhmm(WS * 60 + Math.floor(y / HPX * 2) * 30)); });
  v.querySelectorAll("[data-ev],[data-mt],[data-ol]").forEach(el => {
    const kid = () => el.dataset.ev ? +el.dataset.ev : el.dataset.ol ? "o" + el.dataset.ol : "m" + el.dataset.mt;   // "m<id>" = a hub meeting (Schedule a meeting / booking)
    el.addEventListener("click", e => e.preventDefault());
    el.addEventListener("pointerdown", e => {
      if(e.button) return;
      const jn = e.target.closest("[data-join]"); if(jn){ e.preventDefault(); window.open(jn.dataset.join, "_blank", "noopener"); return; } const sx = e.clientX, sy = e.clientY, inGrid = el.classList.contains("bk"), top0 = el.offsetTop; let moved = false, drop = null;
      const mv = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if(!moved && Math.hypot(dx, dy) < 6) return;
        if(!el.hasAttribute("data-drag")) return; moved = true; el.classList.add("dragging"); ev.preventDefault();
        v.querySelectorAll(".drop").forEach(x => x.classList.remove("drop"));
        el.style.pointerEvents = "none"; const under = document.elementFromPoint(ev.clientX, ev.clientY); el.style.pointerEvents = "";
        if(inGrid){ el.style.top = (top0 + dy) + "px"; const col = under && under.closest(".wkc");
          drop = col ? { day:col.dataset.slot, start:hhmm(WS * 60 + Math.max(0, Math.round((top0 + dy) / HPX * 4)) * 15) } : null; if(col) col.classList.add("drop"); }
        else { const cell = under && under.closest("[data-dropday]"); drop = cell ? { day:cell.dataset.dropday } : null; if(cell) cell.classList.add("drop"); } };
      const up = () => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up);
        el.classList.remove("dragging"); v.querySelectorAll(".drop").forEach(x => x.classList.remove("drop"));
        if(moved && drop && onMove) onMove(kid(), drop); else if(!moved) onOpen(kid()); };
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
// Move or skip just ONE meeting (Brandon 2026-11-10) -> meeting_move() (hub_meeting_moves.sql). Admins only (the server checks).
function moveOne(m, day, done){
  const t = today(), reg = occReg(m, t, addD(t, 180)).slice(0, 12), mv = m.moves || [];
  const days = [...new Set(reg.concat(mv.filter(x => x.from >= t).map(x => x.from)))].sort();
  const st = s => { const x = mv.find(y => y.from === s); return x ? (x.kind === "skip" ? " (skipped)" : " (moved to " + fday(x.to) + (x.start ? " " + ftime(x.start) : "") + ")") : ""; };
  const tm = []; for(let x = 5 * 60; x < 23 * 60; x += 15) tm.push(hhmm(x));
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
  ov.innerHTML = `<div class="card" style="max-width:440px;width:100%;margin:0;padding:18px 20px;max-height:92vh;overflow:auto">
    <div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:19px;flex:1;margin:0">Move one ${esc(NAMES[m.meet] || m.meet)} meeting</h2><button class="btn small" data-x aria-label="Close" style="border-radius:50%;width:36px;padding:0">✕</button></div>
    ${days.length ? `<label class="field"><span>Which meeting</span><select id="mo_f">${days.map(s => `<option value="${s}" ${s === (day && days.includes(day) ? day : days[0]) ? "selected" : ""}>${esc(fday(s) + st(s))}</option>`).join("")}</select></label>
    <label class="field"><span>What to do</span><select id="mo_k"><option value="move">Move it to another day or time</option><option value="skip">Skip it (no meeting that week)</option><option value="undo">Put it back to normal</option></select></label>
    <div id="mo_mv"><label class="field"><span>New day</span><input type="date" id="mo_d" min="${t}"></label>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>Starts (Mountain)</span><select id="mo_t"><option value="">Same time${m.start ? " (" + esc(ftime(m.start)) + ")" : ""}</option>${tm.map(x => `<option value="${x}">${ftime(x)}</option>`).join("")}</select></label>
    <label class="field" style="flex:1;min-width:120px"><span>How long</span><select id="mo_m">${[15, 30, 45, 60, 90, 120, 180].map(x => `<option value="${x}" ${x === (m.minutes || 60) ? "selected" : ""}>${x < 60 ? x + " min" : x / 60 + (x === 60 ? " hour" : " hours")}</option>`).join("")}</select></label></div></div>
    <label class="field"><span>Why (optional, everyone who sees the meeting sees it)</span><input id="mo_n" maxlength="300" placeholder="e.g. Thanksgiving week"></label>
    <p class="muted" style="font-size:12px;margin:0 0 10px">Only this one meeting changes. The others stay on the regular day and time.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-x>Cancel</button><button class="btn primary" id="mo_s">Save</button></div>`
    : `<p class="muted">No meetings coming up in the next 6 months.</p>`}</div>`;
  document.body.appendChild(ov);
  const q = s => ov.querySelector(s), close = () => ov.remove();
  ov.querySelectorAll("[data-x]").forEach(x => x.onclick = close); ov.onclick = e => { if(e.target === ov) close(); };
  if(!days.length) return;
  const sync = () => { const f = q("#mo_f").value, has = mv.some(x => x.from === f), k = q("#mo_k");
    k.querySelector('[value="undo"]').disabled = !has; if(!has && k.value === "undo") k.value = "move";
    q("#mo_mv").style.display = k.value === "move" ? "" : "none"; q("#mo_m").disabled = !q("#mo_t").value;
    const x = mv.find(y => y.from === f && y.kind === "move"); if(!q("#mo_d").dataset.touched) q("#mo_d").value = x ? x.to : f; };
  q("#mo_d").oninput = () => q("#mo_d").dataset.touched = "1";
  ["#mo_f","#mo_k","#mo_t"].forEach(s => q(s).onchange = () => { if(s === "#mo_f") delete q("#mo_d").dataset.touched; sync(); }); sync();
  q("#mo_s").onclick = async () => { const k = q("#mo_k").value, st2 = q("#mo_t").value, sv = q("#mo_s"); sv.disabled = true; sv.textContent = "Saving…";
    const r = await sb.rpc("meeting_move", { p_meet:m.meet, p_from:q("#mo_f").value, p_kind:k, p_to:k === "move" ? q("#mo_d").value || null : null,
      p_start:k === "move" && st2 ? st2 : null, p_minutes:k === "move" && st2 ? +q("#mo_m").value : null, p_note:q("#mo_n").value || null });
    if(r.error){ sv.disabled = false; sv.textContent = "Save"; return alert("Couldn't save: " + (window.niceErr ? niceErr(r.error) : r.error.message)); }
    close(); ST.meets = null; if(done) done(); };
}
async function meetTiles(v){
  v.innerHTML = `<div class="page cal">${tabs("cal_meet")}<p class="muted">Loading meetings…</p></div>`;
  const ms = await meetings(true), t = today();
  if(current() !== "cal_meet") return;
  const tile = m => { const nx = occurs(m, t, addD(t, m.nth ? 120 : 28))[0];
    return `<div class="card tile" data-meet="${m.meet}"><a href="#/${m.meet}" style="text-decoration:none;color:inherit;display:block"><h3>${esc(NAMES[m.meet] || m.meet)}</h3>
      <div class="when">${esc(mWhen(m))}${m.start ? " (Mountain)" : ""}</div>
      <div class="when"><b>Next: ${nx ? esc(nx === t ? "Today" : fday(nx)) : "—"}${nx && mvTo(m, nx) && mvTo(m, nx).start ? " · " + esc(ftime(mvTo(m, nx).start)) : ""}</b>${m.last_day ? ` · last met ${esc(fday(m.last_day))}` : ""}</div>
      ${(m.moves || []).filter(x => (x.to || x.from) >= t || x.from >= t).map(x => `<div class="when" style="color:#8a5a00">${x.kind === "skip" ? "⏭ No meeting " + esc(fday(x.from)) : "↪ " + esc(fday(x.from)) + " moved to " + esc(fday(x.to)) + (x.start ? " · " + esc(ftime(x.start)) : "")}${x.note ? " (" + esc(x.note) + ")" : ""}</div>`).join("")}
      <div class="muted" style="font-size:13px;margin-top:6px" data-agenda="${m.meet}">${m.meet === "meet_maint" ? "Projects, owner jobs and repeat problems from the Maintenance desk." : "Checking what's coming up…"}</div>
      ${m.open_tasks != null ? `<div style="margin-top:6px;font-size:13px"><b>${m.open_tasks} open task${m.open_tasks === 1 ? "" : "s"}</b>${(m.tasks || []).length ? `<ul>${m.tasks.map(x => `<li>${esc(x.text)}${x.who ? " · " + esc(x.who) : ""}${x.due ? " · due " + esc(fday(x.due)) : ""}</li>`).join("")}</ul>` : ""}</div>` : ""}</a>
      <div class="row"><a class="btn small primary" href="#/${m.meet}">Open agenda</a>${m.link ? `<a class="btn small" href="${esc(m.link)}" target="_blank" rel="noopener">▶ Join</a>` : ""}${ME.admin ? `<button class="btn small" data-settime="${m.meet}">${m.start ? "Change day & time" : "Set day & time"}</button><button class="btn small" data-mvone="${m.meet}">Move one meeting</button>` : ""}</div></div>`; };
  v.innerHTML = `<div class="page cal calwide">${tabs("cal_meet")}<div class="chead"><h2>Weekly meetings</h2></div>
    ${ms.length ? `<div class="tiles">${ms.map(tile).join("")}</div>` : `<div class="card"><p class="muted" style="margin:0">No weekly meetings on your calendar.</p></div>`}
    <p class="muted" style="font-size:12px">Times: ${esc([...new Set(ms.filter(m => m.start).map(m => NAMES[m.meet] + " from " + m.source))].join("; ") || "not set yet")}.</p></div>`;
  // Change day & time (Brandon 2026-11-10): date of the next meeting + how often + time + length -> meeting_sched_set2 (hub_meeting_sched_day.sql)
  v.querySelectorAll("[data-settime]").forEach(b => b.onclick = () => {
    const m = ms.find(x => x.meet === b.dataset.settime), nx = occurs(m, t, addD(t, m.nth ? 120 : 28))[0] || t;
    const rep0 = m.nth ? "month" : m.every === 14 ? "2weeks" : "week", tm = [];
    for(let x = 5 * 60; x < 23 * 60; x += 15) tm.push(String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"));
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
    ov.innerHTML = `<div class="card" style="max-width:440px;width:100%;margin:0;padding:18px 20px;max-height:92vh;overflow:auto">
      <div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:19px;flex:1;margin:0">${esc(NAMES[m.meet] || m.meet)}</h2><button class="btn small" data-x aria-label="Close" style="border-radius:50%;width:36px;padding:0">✕</button></div>
      <label class="field"><span>Next meeting on</span><input type="date" id="ms_d" value="${nx}" min="${t}"></label>
      <label class="field"><span>Repeats</span><select id="ms_r">
        <option value="week" ${rep0 === "week" ? "selected" : ""}>Every week</option>
        <option value="2weeks" ${rep0 === "2weeks" ? "selected" : ""}>Every other week</option>
        <option value="month" ${rep0 === "month" ? "selected" : ""}>Once a month (same week of the month)</option></select></label>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>Starts (Mountain)</span><select id="ms_t"><option value="">No set time</option>${tm.map(x => `<option value="${x}" ${x === m.start ? "selected" : ""}>${ftime(x)}</option>`).join("")}</select></label>
      <label class="field" style="flex:1;min-width:120px"><span>How long</span><select id="ms_m">${[15, 30, 45, 60, 90, 120, 180].map(x => `<option value="${x}" ${x === (m.minutes || 60) ? "selected" : ""}>${x < 60 ? x + " min" : x / 60 + (x === 60 ? " hour" : " hours")}</option>`).join("")}</select></label></div>
      <p class="muted" id="ms_p" style="font-size:13px;margin:6px 0 10px"></p>
      <p class="muted" style="font-size:12px;margin:0 0 10px">This changes it for every meeting from that date on. Reminders, the Office calendar and everyone's busy times follow.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-x>Cancel</button><button class="btn primary" id="ms_s">Save</button></div></div>`;
    document.body.appendChild(ov);
    const q = s => ov.querySelector(s), close = () => ov.remove();
    ov.querySelectorAll("[data-x]").forEach(x => x.onclick = close); ov.onclick = e => { if(e.target === ov) close(); };
    const NTH = ["first","second","third","fourth","fifth"];
    const prev = () => { const d = q("#ms_d").value, r = q("#ms_r").value, st = q("#ms_t").value; q("#ms_m").disabled = !st;
      if(!d){ q("#ms_p").textContent = "Pick a date."; return; }
      const x = D(d), w = DAYS[x.getDay()], n = Math.floor((x.getDate() - 1) / 7);
      q("#ms_p").innerHTML = "<b>" + esc((r === "month" ? (n > 3 ? "Monthly needs a date from the 1st to the 28th." : "The " + NTH[n] + " " + w + " of every month") : (r === "2weeks" ? "Every other " : "Every ") + w)
        + (r === "month" && n > 3 ? "" : ", starting " + fday(d)) + (st && !(r === "month" && n > 3) ? " · " + ftime(st) + "–" + ftime(endTime(st, +q("#ms_m").value)) : "")) + "</b>"; };
    ["#ms_d","#ms_r","#ms_t","#ms_m"].forEach(s => { q(s).onchange = prev; q(s).oninput = prev; }); prev();
    q("#ms_s").onclick = async () => { const st = q("#ms_t").value, sv = q("#ms_s"); sv.disabled = true; sv.textContent = "Saving…";
      const r = await sb.rpc("meeting_sched_set2", { p_meet:m.meet, p_day:q("#ms_d").value || null, p_repeat:q("#ms_r").value, p_start:st || null, p_minutes:st ? +q("#ms_m").value : null });
      if(r.error){ sv.disabled = false; sv.textContent = "Save"; return alert("Couldn't save: " + (window.niceErr ? niceErr(r.error) : r.error.message)); }
      close(); meetTiles(v); };
  });
  v.querySelectorAll("[data-mvone]").forEach(b => b.onclick = () => moveOne(ms.find(x => x.meet === b.dataset.mvone), null, () => meetTiles(v)));
  ms.filter(m => m.meet !== "meet_maint").forEach(async m => {
    const r = await sb.rpc("meeting_agenda", { p_meet:m.meet }), el = v.querySelector(`[data-agenda="${m.meet}"]`); if(!el) return;
    const it = (r.data && r.data.items) || [], g = [...new Set(it.map(x => x.grp))];
    el.innerHTML = it.length ? `<b>${it.length} to discuss</b>: ${esc(g.slice(0, 4).join(" · "))}${g.length > 4 ? " · +" + (g.length - 4) + " more" : ""}` : "Nothing came up from the data this week."; });
}

/* ---------- Reservations · Office · Personal ---------- */
async function evCal(v, key, fresh){
  if(!ST.sel[key]) ST.sel[key] = today();
  if(key === "cal_me"){ const ma = (location.hash.split("/")[2] || "").match(/^m(\d+)$/);   // #/cal_me/m<id> (bell + Slack DM links, hub_meet_e2e.sql)
    if(ma){ history.replaceState(null, "", "#/cal_me"); const g = await sb.rpc("meet_get", { p_id:+ma[1] }); if(g && g.data){ ST.sel[key] = g.data.day; ST.openMeet = g.data.id; } } }
  const isRes = key === "cal_res", isOff = key === "cal_office", isMe = key === "cal_me";
  if(fresh) ST.cache = {};   // something changed: every saved week is old now
  { const m = location.hash.match(/\/outlook_(\w+)/); if(m){ history.replaceState(null, "", "#/" + key); ST.cache = {};
    setTimeout(() => alert({ ok:"✓ Outlook is connected. Your Outlook meetings show on your calendar, and invites can be answered here.", cancelled:"Outlook wasn't connected (you cancelled).", expired:"That took too long. Press Connect my Outlook again.", failed:"Microsoft didn't let the hub in. Press Connect my Outlook again, or tell Brandon." }[m[1]] || "Outlook: " + m[1]), 300); } }
  const [a, b] = curRange(key);
  // Faster (Brandon 2026-11-13: "slow to update"): weeks you've already seen draw at once from memory and refresh behind; while
  // loading, the calendar you're looking at stays on screen (no blank "Loading…"); links + outside people load together.
  const ck = key + "|" + a + "|" + b + "|" + JSON.stringify((ST.prefs || {}).layers || {}), hit = ST.cache[ck];
  const shown = v.querySelector(`.page.cal[data-k="${key}"]`);
  if(hit && !fresh){ /* draw from memory now, refresh below */ }
  else if(shown) shown.classList.add("busy");
  else v.innerHTML = `<div class="page cal wide">${tabs(key)}<p class="muted">Loading…</p></div>`;
  const wantStays = isRes || (isMe && layerOn("checkins"));
  const load = async () => {
    const [evs, ms, ppl, sr, orr, tor, hm, olr, ost] = await Promise.all([isRes ? [] : events(a, b), (isMe && layerOn("meet")) || isOff ? meetings() : [], isRes ? [] : people(),
      wantStays ? sb.rpc("cal_stays", { p_from:a, p_to:b }) : null, isOff ? sb.rpc("cal_office", { p_from:a, p_to:b }) : null, isOff ? sb.rpc("timeoff_calendar", { p_from:a, p_to:b }) : null,
      isMe ? sb.rpc("meet_mine", { p_from:a, p_to:b }) : null,
      isMe && layerOn("outlook") ? sb.rpc("ms_cal_mine", { p_from:a, p_to:b }) : null, isMe ? sb.rpc("ms_cal_status") : null]);
    const vids = evs.filter(e => e.virtual).map(e => e.id), eids = evs.filter(e => (e.kind || "event") === "event").map(e => e.id);
    const [lr, gr] = await Promise.all([vids.length ? sb.rpc("cal_links", { p_ids:vids }) : null, eids.length ? sb.rpc("cal_guests", { p_ids:eids }) : null]);
    const links = {}, guests = {};
    ((lr && lr.data) || []).forEach(x => links[x.event_id] = x.url);   // join links: cal_links() gives only the ones this person may see
    ((gr && gr.data) || []).forEach(x => guests[x.event_id] = x.guests || []);   // people from outside Moose (email/phone only for the people on it, managers, admins)
    return { evs, ms, ppl, sr:sr && { data:sr.data }, orr:orr && { data:orr.data }, tor:tor && { data:tor.data }, hm:hm && { data:hm.data }, links, guests,
      ol:(olr && olr.data) || [], ost:(ost && ost.data) || null };
  };
  let got = hit && !fresh ? hit.d : null;
  if(!got){ got = await load(); ST.cache[ck] = { d:got, at:Date.now(), sig:JSON.stringify(got) }; }
  else if(Date.now() - hit.at > 10000) load().then(d => { const sig = JSON.stringify(d), was = ST.cache[ck] && ST.cache[ck].sig;
    ST.cache[ck] = { d, at:Date.now(), sig }; if(sig !== was && current() === key && !$("#evm.on")) evCal(v, key); }).catch(() => {});
  const { evs, ms, ppl, sr, orr, links, guests, ol, ost } = got, tor = got.tor && { data:JSON.parse(JSON.stringify(got.tor.data || [])) }, hm = got.hm;
  const hubMeets = ((hm && hm.data) || []).filter(m => m.status === "on");   // meetings made with Schedule a meeting / booked on a booking link
  if(current() !== key) return;
  const stays = (sr && sr.data && sr.data.stays) || [], who = id => (ppl.find(p => p.id === id) || {}).name || "Someone";
  const fn = id => who(id).split(" ")[0], ox = JSON.parse(JSON.stringify((orr && orr.data) || { meetings:[], shifts:[], off:[] }));   // a copy: time off is added below
  // time off asked in the hub: approved ones until Hubstaff has them (then they come from the Hubstaff feed), pending for the person + approvers
  ((tor && tor.data) || []).filter(r => !(r.status === "approved" && r.hs_request_id)).forEach(r => { for(let s = r.day; s <= r.end_day; s = addD(s, 1))
    ox.off.push({ user_id:r.user_id, day:s, start:r.start, end:r.end, req:r.status === "pending" }); });
  const mine = evs.filter(e => isMe ? e.cal === "personal" : e.cal === "office");
  const canAdd = isMe || isOff, boss = canOffice();
  const mt = []; ms.forEach(m => occurs(m, a, b).forEach(s => { const w = mAt(m, s); mt.push({ meet:m.meet, day:s, start:w.start, minutes:w.minutes }); }));
  const myId = (ppl.find(p => p.name === ME.name) || {}).id;
  const canEdit = e => e.cal === "personal" || boss || (e.kind !== "event" && e.person_id === myId);
  const evItem = e => { const k = e.kind || "event", nm = k === "event" ? e.title : (k === "out" ? "Out" : "Working") + " · " + who(e.person_id) + (e.title && !/^(out|working)$/i.test(e.title) ? " · " + e.title : "");
    return { start:e.start_time, end:e.end_time, title:nm, sub:[e.virtual ? "💻 Virtual" : "", e.location, (e.attendees || []).map(fn).join(", "), (guests[e.id] || []).length ? "with " + guests[e.id].map(g => g.name + (g.company ? " (" + g.company + ")" : "")).join(", ") : ""].filter(Boolean).join(" · "), join:links[e.id], cls:k === "out" ? "outp" : k === "working" ? "work" : isMe ? "" : "of", ev:e.id, drag:canEdit(e) }; };
  const mLink = k => (ms.find(m => m.meet === k) || {}).link || null;   // staff meeting join link (cal_meetings: only meetings you can open)
  const nt = t => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const dupOf = o => evs.some(e => (e.kind || "event") === "event" && e.day === o.day && nt(e.title) === nt(o.title)) || hubMeets.some(m => m.day === o.day && nt(m.title) === nt(o.title));
  const olWait = o => !o.is_organizer && !o.cancelled && (!o.response || o.response === "none" || o.response === "notResponded");
  const items = s => {
    const out = [];
    if(isRes || (isMe && layerOn("checkins"))){ stays.filter(x => x.in === s).forEach(x => out.push({ title:(x.owner ? "OWNER " : "") + "CHECK-IN " + x.unit + (x.guest ? " · " + x.guest : ""), cls:"ar", href:"#/cal_res" }));
      if(isRes) stays.filter(x => x.out === s).forEach(x => out.push({ title:"CHECK-OUT " + x.unit, cls:"dp", href:"#/cal_res" })); }
    if(isMe) hubMeets.filter(m => m.day === s).forEach(m => { const inv = (m.staff || []).includes(myId) && !m.mine, a = inv ? (m.my_answer || {}).answer : null;
      out.push({ start:m.start, end:endTime(m.start, m.minutes), title:(inv && !a ? "❔ " : a === "no" ? "Declined · " : "") + (m.virtual === false ? "👥 " : "📹 ") + m.title,
      sub:[m.guest_name ? "booked by " + m.guest_name : "", m.host_id !== myId ? "host " + (m.host || "").split(" ")[0] : "", m.virtual === false && m.location ? m.location : "",
        inv && !a ? "waiting for your answer" : a === "suggest" ? "you suggested another time" : ""].filter(Boolean).join(" · "),
      cls:"mt" + (a === "no" ? " dec" : ""), mt:m.id, join:m.zoom_join, drag:!!(m.mine || ME.admin) }); });
    if(isMe){ mt.filter(x => x.day === s).forEach(x => out.push({ start:x.start, end:x.start && x.minutes ? endTime(x.start, x.minutes) : null, title:NAMES[x.meet] + " meeting", cls:"mt", sm:x.meet, smd:s, join:mLink(x.meet) }));
      // Outlook (Brandon 2026-11-13): your own Outlook meetings, incl. ones Zoom/Teams put there; the same meeting already on the hub is shown once
      if(layerOn("outlook")) ol.filter(o => !o.cancelled && evOn(o, s) && !dupOf(o)).forEach(o => { const wait = olWait(o);
        out.push({ start:o.start_time, end:o.end_time, title:(wait ? "❔ " : o.response === "declined" ? "Declined · " : o.response === "tentativelyAccepted" ? "Maybe · " : "") + o.title,
          sub:[o.is_organizer ? "" : o.organizer_name ? "from " + o.organizer_name : "", o.location && !o.join_url ? o.location : "", wait ? "waiting for your answer" : "Outlook"].filter(Boolean).join(" · "),
          cls:"ol" + (o.response === "declined" ? " dec" : ""), ol:o.id, join:o.join_url }); });
      const att = e => (e.attendees || []).includes(myId);   // office events you're going to show with your own events
      if(layerOn("personal")) mine.concat(evs.filter(e => e.cal === "office" && att(e))).filter(e => evOn(e, s)).forEach(e => out.push(e.cal === "office" ? Object.assign(evItem(e), { cls:"of" }) : evItem(e)));
      if(layerOn("office")) evs.filter(e => e.cal === "office" && (e.kind || "event") === "event" && !(layerOn("personal") && att(e)) && evOn(e, s)).forEach(e => out.push(Object.assign(evItem(e), { cls:"of" }))); }
    if(isOff){
      mine.filter(e => evOn(e, s) && ((e.kind || "event") === "event" ? layerOn("events") : layerOn("people"))).forEach(e => out.push(evItem(e)));
      if(layerOn("meet")) ox.meetings.filter(m => m.day === s).forEach(m => out.push({ start:m.start, end:m.end, title:m.meet ? NAMES[m.meet] + " meeting" : "In a meeting",
        sub:(m.people || []).map(fn).join(", "), cls:"mt", sm:m.meet || "", smd:s, smp:m.people || [], sms:m.start, sme:m.end, join:m.meet ? mLink(m.meet) : null }));
      const timed = viewOf(key) === "day";   // week/month: schedules sit in the all-day row so the hours stay readable
      if(layerOn("sched")) ox.shifts.filter(x => x.day === s).sort((x, y) => x.start.localeCompare(y.start)).forEach(x => out.push(timed
        ? { start:x.start, end:x.end > x.start ? x.end : "23:59", title:fn(x.user_id), sub:"Scheduled" + (x.end > x.start ? "" : " until " + ftime(x.end) + " next day"), cls:"sh", href:"#/stf_sched" }
        : { title:fn(x.user_id) + " " + ftime(x.start) + "–" + ftime(x.end), cls:"sh", href:"#/cal_office" }));
      if(layerOn("people")) ox.off.filter(x => x.day === s).forEach(x => out.push({ title:(x.req ? "Asked off · " : "Out · ") + who(x.user_id) + (x.start ? " " + ftime(x.start) + "–" + ftime(x.end) : ""), cls:x.req ? "outp req" : "outp", href:x.req ? "#/cal_off" : "#/cal_office" }));
    }
    return out; };
  const draw = () => {
    const sel = ST.sel[key], day = items(sel).sort((x, y) => (x.start || "").localeCompare(y.start || ""));
    const olBtn = !isMe ? "" : ost && ost.connected ? `<button class="btn small" data-olsync title="Outlook${ost.email ? " (" + esc(ost.email) + ")" : ""}${ost.last_sync ? " · last read " + esc(new Date(ost.last_sync).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })) : ""}">✓ Outlook · Refresh</button>`
      : `<button class="btn small" data-olgo>🔗 Connect my Outlook</button>`;
    const addBtns = isMe ? olBtn + `<button class="btn small primary" data-add="event">+ Event</button><button class="btn small" data-sched>📅 Schedule a meeting</button><button class="btn small" data-blinks>🔗 Booking links</button>`
      : isOff ? (boss ? `<button class="btn small primary" data-add="event">+ Work event</button>` : "") + `<a class="btn small" href="#/cal_off" data-askoff>🗓 Schedule adjustment</a><button class="btn small" data-add="out">I'm out</button><button class="btn small" data-add="working">I'm working</button>` : "";
    const detail = isRes ? resDetail(stays, sel) : `<div class="card list"><b style="font-size:16px">${esc(fday(sel))}</b>${day.length ? day.map(x => `<div class="it"><span class="d">${x.start ? ftime(x.start.slice(0, 5)) + (x.end ? "–" + ftime(x.end.slice(0, 5)) : "") : "All day"}</span><span style="flex:1"><a ${attrs(Object.assign({}, x, { drag:false }))}><b>${esc(x.title)}</b></a>${x.sub ? ` <span class="muted">· ${esc(x.sub)}</span>` : ""}</span>${x.join ? `<a class="btn small primary" href="${esc(x.join)}" target="_blank" rel="noopener noreferrer">💻 Join</a>` : ""}</div>`).join("") : `<p class="muted" style="margin:6px 0 0">Nothing on this day.</p>`}</div>`;
    const qaOk = isMe || (isOff && boss);   // quick add: Personal = your own event; Office = a work event (managers + admins)
    const qa = qaOk ? `<div class="qadd"><input id="qa" placeholder="${isMe ? "Quick add: Dentist Tue 3pm 1h" : "Quick add: Lunch with BHL 1403 owner Thu 12:30pm 1h"}" autocomplete="off" enterkeyhint="done" aria-label="Quick add"><button class="btn primary" id="qa_go">Add</button><button class="btn" id="qa_more" title="Who's going, outside people, link, notes…">More…</button></div><div class="qprev" id="qa_p">Type what, when and how long. Press Enter to add it${isOff ? " to the Office calendar" : ""}.</div>` : "";
    const keepY = (() => { const w = v.querySelector(`.page.cal[data-k="${key}"] .wkb`); return w ? w.scrollTop : null; })();
    const main = body(key, items, canAdd, !isRes) + (isRes ? `<p class="muted" style="font-size:12px">Source: ${esc((sr && sr.data && sr.data.source) || "Track reservations")}. Guest names only; contact info stays on Home for the teams that have it.</p>` : "");
    const det = viewOf(key) === "list" ? "" : detail;   // List view already shows each day
    const waits = isMe ? ol.filter(o => olWait(o) && o.day >= today()).sort((x, y) => (x.day + (x.start_time || "")).localeCompare(y.day + (y.start_time || ""))) : [];
    const olErr = isMe && ost && ost.connected && ost.error ? `<div class="card" style="border-color:var(--amber,#8a5a00)"><b>Outlook needs you to connect again.</b> <span class="muted">${esc(ost.error)}</span> <button class="btn small" data-olgo>Connect again</button></div>` : "";
    const waitBox = waits.length ? `<div class="card olw"><b style="font-size:16px">❔ ${waits.length} meeting invite${waits.length === 1 ? "" : "s"} waiting for your answer</b>${waits.slice(0, 8).map(o => `<div class="olr"><span style="flex:1;min-width:180px"><b>${esc(o.title)}</b><br><span class="muted">${esc(fday(o.day))}${o.start_time ? " · " + esc(ftime(o.start_time.slice(0, 5)) + "–" + ftime((o.end_time || o.start_time).slice(0, 5))) : " · all day"}${o.organizer_name ? " · from " + esc(o.organizer_name) : ""}</span></span>
      <span class="olb">${o.join_url ? `<a class="btn small" href="${esc(o.join_url)}" target="_blank" rel="noopener noreferrer">💻 Link</a>` : ""}<button class="btn small primary" data-olans="accept" data-oid="${esc(o.ms_id)}">✓ Accept</button><button class="btn small" data-olans="tentativelyAccept" data-oid="${esc(o.ms_id)}">Maybe</button><button class="btn small" data-olans="decline" data-oid="${esc(o.ms_id)}">✕ Decline</button></span></div>`).join("")}${waits.length > 8 ? `<p class="muted" style="margin:6px 0 0">+${waits.length - 8} more on the calendar</p>` : ""}</div>` : "";
    v.innerHTML = `<div class="page cal wide" data-k="${key}">${tabs(key)}${calNav(key, isRes ? "Reservations" : isOff ? "Office" : "My calendar", addBtns + `<span class="upd">Updating…</span>`)}${olErr}${waitBox}${qa}
      ${isOff ? `<div class="cols"><div>${main}${det}</div><div class="side">${whoPanel(ppl, mine, sel, ox, fn)}</div></div>` : main + det}${qaOk ? `<button class="fab" id="qa_fab" aria-label="Add an event">+</button>` : ""}
      <p class="muted" style="font-size:12px">${isOff ? "Everyone on the hub sees the Office calendar. Mark yourself out or working; managers and admins add work events (with who's going) and can mark anyone. Schedules and time off: " + (ox.source || "Hubstaff") + (ox.at ? " (updated " + new Date(ox.at).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) + ")" : "") + "; set or changed by managers under Staffing ▸ Schedule. Meetings: Calendar ▸ Meetings times; who's in each = everyone the meeting is for." : isMe ? "Only you see your personal events. Click anything to see it, then Edit, Move or Cancel; drag your own events (and office events you manage) to move them; click an empty time to add one. Meetings come from Calendar ▸ Meetings." : ""}</p>
      <div class="modal" id="evm"><div class="card" id="evcard"></div></div></div>`;
    wireNav(v, key, draw, () => evCal(v, key));
    wireGrid(v, canAdd && !isRes ? (d, s) => form(null, { day:d, start:s, kind:isOff ? (boss ? "event" : "working") : "event" }) : null,
      async (id, to) => { if(typeof id === "string" && id[0] === "o") return; if(typeof id === "string"){ const m = hubMeets.find(y => "m" + y.id === id); if(!m) return;
          const r = await sb.rpc("meet_move", { p_id:m.id, p_day:to.day, p_start:to.start || m.start, p_minutes:m.minutes });
          if(r.error) return alert("Couldn't move it: " + r.error.message); ST.sel[key] = to.day; return evCal(v, key, true); }
        const e = evs.find(x => x.id === id); if(!e || !canEdit(e)) return;
        const len = e.end_day ? (D(e.end_day) - D(e.day)) / 864e5 : null, dur = e.start_time && e.end_time ? toMin(e.end_time) - toMin(e.start_time) : null;
        const st = to.start || (e.start_time ? e.start_time.slice(0, 5) : null);
        const r = await save(e, { p_day:to.day, p_end_day:len != null ? addD(to.day, len) : null, p_start:st, p_end:st && dur != null ? endTime(st, dur) : (e.end_time || null) });
        if(!r.error){ ST.sel[key] = to.day; evCal(v, key, true); } },
      id => { if(typeof id === "string" && id[0] === "o"){ const o = ol.find(y => "o" + y.id === id); if(o) olPeek(o); return; }
        if(typeof id === "string"){ const m = hubMeets.find(y => "m" + y.id === id); if(m) meetBox(m); return; }
        const e = evs.find(x => x.id === id); if(e) evPeek(e); });
    if(keepY != null){ const w = v.querySelector(".wkb"); if(w) w.scrollTop = keepY; }
    if(qaOk) wireQuick();
    v.querySelectorAll("[data-olgo]").forEach(bt => bt.onclick = () => olConnect(bt));
    v.querySelectorAll("[data-olsync]").forEach(bt => bt.onclick = async () => { bt.disabled = true; bt.textContent = "Reading Outlook…";
      const r = await olCall({ action:"sync" }); if(!r.ok) alert("Couldn't read Outlook: " + r.error); evCal(v, key, true); });
    v.querySelectorAll("[data-olans]").forEach(bt => bt.onclick = () => olAnswer(bt.dataset.oid, bt.dataset.olans, bt));
    clearInterval(ST.tick);   // new emailed invites + others' changes show up by themselves (every 2 min while this page is open)
    ST.tick = setInterval(() => { if(current() !== key || document.hidden || $("#evm.on") || ($("#qa") && $("#qa").value)) return;
      load().then(d => { const sig = JSON.stringify(d), c = ST.cache[ck]; if(c && c.sig === sig){ c.at = Date.now(); return; }
        ST.cache[ck] = { d, at:Date.now(), sig }; if(current() === key && !$("#evm.on")) evCal(v, key); }).catch(() => {}); }, 120000);
    v.querySelectorAll("[data-sm]").forEach(el => el.onclick = x => { x.preventDefault(); x.stopPropagation(); smPeek(el.dataset.sm, el.dataset.smd); });
    v.querySelectorAll("[data-add]").forEach(bt => bt.onclick = () => form(null, { kind:bt.dataset.add }));
    v.querySelectorAll("[data-sched]").forEach(bt => bt.onclick = () => schedForm());
    if(ST.justMade){ const m = hubMeets.find(y => y.id === ST.justMade); ST.justMade = null; if(m) meetBox(m, true); }
    if(ST.openMeet){ const m = hubMeets.find(y => y.id === ST.openMeet); ST.openMeet = null; if(m) meetBox(m); }
    v.querySelectorAll("[data-blinks]").forEach(bt => bt.onclick = () => linksBox());
    v.querySelectorAll("[data-mt]").forEach(el => el.addEventListener("click", x => x.preventDefault()));
    v.querySelectorAll("[data-askoff]").forEach(bt => bt.onclick = () => { ST.askOff = true; });
    v.querySelectorAll(".pp [data-mailto]").forEach(x => x.onclick = e => e.stopPropagation());
    const q = v.querySelector("#ppq"); if(q) q.oninput = () => v.querySelectorAll(".pp[data-n]").forEach(p => p.style.display = p.dataset.n.includes(q.value.trim().toLowerCase()) ? "" : "none");
  };
  // ---- Outlook (functions/ms-cal): connect, refresh, answer an invite as yourself ----
  async function olCall(o){ const ss = (await sb.auth.getSession()).data.session;
    const r = await fetch(MM_CONFIG.url + "/functions/v1/ms-cal", { method:"POST", headers:{ "content-type":"application/json", apikey:MM_CONFIG.anonKey, authorization:"Bearer " + (ss ? ss.access_token : MM_CONFIG.anonKey) }, body:JSON.stringify(o) });
    return r.json().catch(() => ({ ok:false, error:"No answer from the server." })); }
  async function olConnect(bt){ if(bt){ bt.disabled = true; bt.textContent = "Opening Microsoft…"; }
    const r = await olCall({ action:"start" }); if(!r.ok){ if(bt){ bt.disabled = false; bt.textContent = "🔗 Connect my Outlook"; } return alert(r.error); }
    location.href = r.url; }
  async function olAnswer(id, ans, bt){
    const o = ol.find(y => y.ms_id === id), word = { accept:"Accept", tentativelyAccept:"Maybe", decline:"Decline" }[ans];
    const note = ans === "accept" ? "" : prompt(word + " “" + (o ? o.title : "this meeting") + "”. Add a note for the organizer? (optional)", "");
    if(note === null) return;
    if(bt){ bt.disabled = true; bt.textContent = "Sending…"; }
    const r = await olCall({ action:"answer", id, answer:ans, comment:note || "" });
    if(!r.ok){ if(bt){ bt.disabled = false; bt.textContent = word; } return alert("Couldn't send it: " + r.error); }
    $("#evm").classList.remove("on"); evCal(v, key, true); }
  function olPeek(o){
    const when = fday(o.day) + (o.end_day && o.end_day !== o.day ? " – " + fday(o.end_day) : "") + (o.start_time ? " · " + ftime(o.start_time.slice(0, 5)) + (o.end_time ? "–" + ftime(o.end_time.slice(0, 5)) : "") : " · all day");
    const ansTxt = { accepted:"You said yes", tentativelyAccepted:"You said maybe", declined:"You said no", organizer:"You set this up" }[o.response] || (olWait(o) ? "Waiting for your answer" : "");
    const others = (o.attendees || []).filter(x => x.email && x.email !== (ost && ost.email));
    modal({ h:esc(o.title), b:`<p style="margin:6px 0"><b>${esc(when)}</b><br><span class="muted">From your Outlook${o.organizer_name && !o.is_organizer ? " · organizer " + esc(o.organizer_name) : ""}${o.location ? " · " + esc(o.location) : ""}</span></p>
      ${o.join_url ? `<a class="btn primary" href="${esc(o.join_url)}" target="_blank" rel="noopener noreferrer">💻 Join the meeting</a>` : ""}
      ${ansTxt ? `<p style="margin:10px 0 4px"><b>${esc(ansTxt)}</b></p>` : ""}
      ${others.length ? `<p class="muted" style="margin:6px 0">With ${esc(others.slice(0, 12).map(x => x.name || x.email).join(", "))}${others.length > 12 ? " +" + (others.length - 12) : ""}</p>` : ""}
      <div class="evft" style="display:flex;gap:8px;flex-wrap:wrap">${o.is_organizer || o.cancelled ? "" : `<button class="btn ${o.response === "accepted" ? "" : "primary"}" data-pa="accept">✓ Accept</button><button class="btn" data-pa="tentativelyAccept">Maybe</button><button class="btn" data-pa="decline">✕ Decline</button>`}${o.web_link ? `<a class="btn" href="${esc(o.web_link)}" target="_blank" rel="noopener noreferrer">Open in Outlook</a>` : ""}</div>` });
    $("#evcard").querySelectorAll("[data-pa]").forEach(b2 => b2.onclick = () => olAnswer(o.ms_id, b2.dataset.pa, b2));
  }
  // ---- Quick add (one line) ----
  function wireQuick(){
    const I = $("#qa"), P = $("#qa_p"); if(!I) return;
    const prev = () => { const x = qparse(I.value, ST.sel[key] || today());
      if(!I.value.trim()){ P.innerHTML = "Type what, when and how long. Press Enter to add it" + (isOff ? " to the Office calendar" : "") + "."; return x; }
      P.innerHTML = x.title ? `Adds <b>${esc(x.title)}</b> · <b>${esc(fday(x.day))}</b> · <b>${x.start ? esc(ftime(x.start) + "–" + ftime(x.end)) : "all day"}</b>${x.link ? " · 💻 with the link" : ""}` : "Add a name for it (e.g. “Call with Kolleen”).";
      return x; };
    I.oninput = prev;
    const go = async () => { const x = prev(); if(!x.title) return I.focus();
      $("#qa_go").disabled = true; P.textContent = "Adding…";
      const r = await sb.rpc("cal_event_save4", { p_id:null, p_cal:isMe ? "personal" : "office", p_kind:"event", p_person:null, p_title:x.title.slice(0, 200), p_day:x.day, p_end_day:null,
        p_start:x.start, p_end:x.end, p_location:"", p_notes:"", p_off:false, p_attendees:isMe ? null : [], p_virtual:!!x.link, p_link:x.link || null });
      $("#qa_go").disabled = false;
      if(r.error){ P.textContent = "Couldn't add it: " + (window.niceErr ? niceErr(r.error) : r.error.message); return; }
      I.value = ""; ST.sel[key] = x.day; evCal(v, key, true); };
    I.onkeydown = e => { if(e.key === "Enter"){ e.preventDefault(); go(); } };
    $("#qa_go").onclick = go;
    $("#qa_more").onclick = () => { const x = qparse(I.value, ST.sel[key] || today()); form(null, { kind:"event", day:x.day, start:x.start || "", end:x.end || "", title:x.title, link:x.link }); };
    const fab = $("#qa_fab"); if(fab) fab.onclick = () => { window.scrollTo({ top:0, behavior:"smooth" }); setTimeout(() => I.focus(), 250); };
  }
  // ---- Schedule a meeting / booking links (hub_meet_book.sql + Edge Function `meet`; public pages meet.html + book.html) ----
  const pageUrl = (f, q) => new URL(f + "?" + q, location.href).href;
  const copy = async (txt, btn) => { try { await navigator.clipboard.writeText(txt); if(btn){ const o = btn.textContent; btn.textContent = "Copied ✓"; setTimeout(() => btn.textContent = o, 1500); } }
    catch(_){ prompt("Copy this link:", txt); } };
  const fnCall = async o => { const ss = (await sb.auth.getSession()).data.session;
    const r = await fetch(MM_CONFIG.url + "/functions/v1/meet", { method:"POST", headers:{ "content-type":"application/json", apikey:MM_CONFIG.anonKey, authorization:"Bearer " + (ss ? ss.access_token : MM_CONFIG.anonKey) }, body:JSON.stringify(o) });
    return r.json().catch(() => ({ ok:false, error:"No answer from the server." })); };
  const modal = html => { $("#evcard").innerHTML = `<div class="evhd" style="display:flex;align-items:center;gap:10px"><h2 style="font-size:20px;flex:1;margin:0">${html.h}</h2><button class="btn small" id="evx" aria-label="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>${html.b}`;
    $("#evm").classList.add("on"); $("#evcard").scrollTop = 0; $("#evx").onclick = () => $("#evm").classList.remove("on");
    $("#evm").onclick = x => { if(x.target === $("#evm")) $("#evm").classList.remove("on"); }; };
  const topts = (sel, blank) => { const l = []; for(let m = 5 * 60; m < 24 * 60; m += 15) l.push(hhmm(m)); return (blank ? `<option value="">${blank}</option>` : "") + l.map(t => `<option value="${t}" ${t === sel ? "selected" : ""}>${ftime(t)}</option>`).join(""); };
  const lenOpts = (sel, list) => list.map(m => `<option value="${m}" ${m === sel ? "selected" : ""}>${m < 60 ? m + " min" : (m / 60) + (m === 60 ? " hour" : " hours")}</option>`).join("");
  const staffPick = (sel, id) => `<div class="field"><span>Also invite from Moose (optional; shows on their calendar)</span><div class="attp" id="${id}">${ppl.filter(p => p.id !== myId).map(p => `<label class="lyr"><input type="checkbox" data-st="${p.id}" ${(sel || []).includes(p.id) ? "checked" : ""}>${esc(p.name)}</label>`).join("")}</div></div>`;
  const picked = id => [...$("#" + id).querySelectorAll("[data-st]:checked")].map(x => x.dataset.st);
  const zoomTxt = (m, can = true) => m.zoom_status === "made" ? `<a class="btn small primary" href="${esc(m.zoom_join)}" target="_blank" rel="noopener noreferrer">💻 Join on Zoom</a>`
    : `<span class="pill amber">Zoom link ${m.zoom_status === "failed" ? "not made" : "coming"}</span> <span class="muted" style="font-size:12.5px">${esc(m.zoom_error || "")}</span> ${can ? `<button class="btn small" id="mz">Try again</button>` : ""}`;
  function schedForm(){
    // Build list cal-e2e (2026-11-06): pick coworkers, see when everyone's free (meet_free: busy times + shifts, never what), in person or virtual
    const co = ppl.filter(p => p.id !== myId), F = { virt:false, from:null, free:null, tm:null, seq:0 };
    modal({ h:"Schedule a meeting", b:`<p class="muted" style="margin:4px 0 0">Pick who's coming and the hub shows when you're all free. Everyone you pick gets it on their calendar and can say yes, no or suggest another time. Virtual meetings get a Zoom link and a page you can also send to guests or vendors.</p>
      <label class="field"><span>What</span><input id="sm_t" maxlength="120" placeholder="e.g. Plan the Thanksgiving turnovers"></label>
      <div class="field"><span>Who from Moose</span><input id="sm_q" placeholder="Find a coworker…" autocomplete="off" style="margin-bottom:4px"><div class="attp" id="sm_st">${co.map(p => `<label class="lyr" data-n="${esc(p.name.toLowerCase())}"><input type="checkbox" data-st="${p.id}">${esc(p.name)}</label>`).join("")}</div></div>
      <div class="field"><span>How</span><div class="vsw" id="sm_how"><button type="button" class="btn small primary" data-how="0">👥 In person</button><button type="button" class="btn small" data-how="1">💻 Virtual (Zoom)</button></div></div>
      <label class="field" id="sm_wf"><span>Where</span><input id="sm_w" maxlength="200" placeholder="e.g. Moose office, BHL 4205…"></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>Day</span><input type="date" id="sm_d" min="${today()}" value="${esc(ST.sel[key] >= today() ? ST.sel[key] : today())}"></label>
        <label class="field" style="flex:1;min-width:120px"><span>Starts</span><select id="sm_s">${topts("10:00")}</select></label>
        <label class="field" style="flex:1;min-width:110px"><span>How long</span><select id="sm_l">${lenOpts(30, [15, 30, 45, 60, 90, 120, 180])}</select></label></div>
      <div class="card fb" id="sm_fb"><b>When is everyone free?</b> <span class="muted" style="font-size:12.5px">Pick people above to see.</span></div>
      <label class="field"><span>Note (optional)</span><textarea id="sm_n" maxlength="1000" style="min-height:60px" placeholder="Agenda, what to bring… Don't type codes or passwords."></textarea></label>
      <div class="evft"><button class="btn primary" style="width:100%" id="sm_go">Make the meeting</button><p class="muted" id="sm_m" style="margin:6px 0 0"></p></div>` });
    const first = n => (n || "").split(" ")[0];
    const wins = (p, d) => {   // when this person works that day: their hub schedule, else weekdays 8 am - 6 pm
      if((p.sched_days || []).includes(d)) return (p.shifts || []).filter(x => x.day === d).map(x => [toMin(x.s), toMin(x.e) > toMin(x.s) ? toMin(x.e) : 24 * 60]);
      if(p.scheduled) return [];
      const w = D(d).getDay(); return w === 0 || w === 6 ? [] : [[8 * 60, 18 * 60]]; };
    const busyAt = (p, d, s, len) => (p.busy || []).some(x => x.day === d && toMin(x.s) < s + len && toMin(x.e) > s);
    const freeAt = (p, d, s, len) => wins(p, d).some(([a, b]) => a <= s && s + len <= b) && !busyAt(p, d, s, len);
    const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
    const H0 = 7 * 60, H1 = 19 * 60, pct = m => Math.max(0, Math.min(100, (m - H0) / (H1 - H0) * 100));
    function drawFree(){
      const el = $("#sm_fb"); if(!F.free) return;
      const ps = F.free.people, len = +$("#sm_l").value, dsel = $("#sm_d").value, ssel = toMin($("#sm_s").value);
      const days = []; for(let i = 0; i < 7; i++) days.push(addD(F.from, i));
      const rows = days.map(d => { const sl = [];
        for(let s = H0; s + len <= H1; s += 30){ if(d === today() && s < nowMin()) continue; sl.push({ s, n:ps.filter(p => freeAt(p, d, s, len)).length }); }
        const all = sl.filter(x => x.n === ps.length), chip = (x, part) => `<button type="button" class="fbc${part ? " part" : ""}${d === dsel && x.s === ssel ? " sel" : ""}" data-fd="${d}" data-fs="${hhmm(x.s)}">${ftime(hhmm(x.s))}${part ? ` · ${x.n} of ${ps.length}` : ""}</button>`;
        const best = sl.filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.s - b.s).slice(0, 3).sort((a, b) => a.s - b.s);
        return `<div class="fbd"><b>${esc(fday(d))}</b> ${all.length ? all.slice(0, 10).map(x => chip(x)).join("") + (all.length > 10 ? `<span class="muted">+${all.length - 10} more</span>` : "")
          : best.length && ps.length > 1 ? `<span class="muted">No time everyone's free. Closest:</span> ` + best.map(x => chip(x, true)).join("") : `<span class="muted">No open time</span>`}</div>`; }).join("");
      const tl = ps.map(p => `<div class="fbr"><span title="${esc(p.name)}">${esc(p.me ? "You" : first(p.name))}</span><div class="fbt">${wins(p, dsel).map(([a, b]) => `<i class="w" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%"></i>`).join("")}${(p.busy || []).filter(x => x.day === dsel).map(x => `<i class="b" style="left:${pct(toMin(x.s))}%;width:${pct(toMin(x.e)) - pct(toMin(x.s))}%" title="Busy ${esc(ftime(x.s))}–${esc(ftime(x.e))}"></i>`).join("")}<i class="pk" style="left:${pct(ssel)}%;width:${pct(ssel + len) - pct(ssel)}%"></i></div></div>`).join("");
      el.innerHTML = `<b>When is everyone free?</b> <span class="muted" style="font-size:12.5px">${esc(fday(F.from))} – ${esc(fday(days[6]))} · tap a time to pick it</span>${rows}
        <div style="margin-top:10px"><b style="font-size:13px">${esc(fday(dsel))}</b> <span class="muted" style="font-size:12px">green = working, grey = busy, blue = the time you picked</span>
        ${dsel >= F.from && dsel <= days[6] ? tl + `<div class="fbh">${[7, 9, 11, 13, 15, 17, 19].map(h => `<span>${h % 12 || 12}${h < 12 ? "a" : "p"}</span>`).join("")}</div>` : `<p class="muted">Loading that day…</p>`}</div>
        <p class="muted" style="font-size:12px;margin:6px 0 0">Busy = their hub calendar (events, meetings, staff meetings, time off). Working = their hub schedule, or weekdays 8–6 for people without one. The hub never shows what anyone is busy with.</p>`;
      el.querySelectorAll("[data-fd]").forEach(bt => bt.onclick = () => { $("#sm_d").value = bt.dataset.fd; $("#sm_s").value = bt.dataset.fs; drawFree(); });
    }
    async function loadFree(){
      const ids = picked("sm_st"), el = $("#sm_fb");
      if(!ids.length){ F.free = null; el.innerHTML = `<b>When is everyone free?</b> <span class="muted" style="font-size:12.5px">Pick people above to see.</span>`; return; }
      const d = $("#sm_d").value || today(); F.from = d; const n = ++F.seq;
      el.innerHTML = `<b>When is everyone free?</b> <span class="muted">Checking…</span>`;
      const r = await sb.rpc("meet_free", { p_users:ids, p_from:d, p_to:addD(d, 6) });
      if(n !== F.seq) return;
      if(r.error){ el.innerHTML = `<b>When is everyone free?</b> <span class="muted">Couldn't check: ${esc(niceE(r.error))}</span>`; return; }
      F.free = r.data; drawFree();
    }
    const niceE = e => window.niceErr ? niceErr(e) : (e.message || String(e));
    const later = () => { clearTimeout(F.tm); F.tm = setTimeout(loadFree, 400); };
    $("#sm_q").oninput = () => { const s = $("#sm_q").value.trim().toLowerCase(); $("#sm_st").querySelectorAll("[data-n]").forEach(l => l.style.display = !s || l.dataset.n.includes(s) || l.querySelector("input").checked ? "" : "none"); };
    $("#sm_st").onchange = later;
    $("#sm_how").querySelectorAll("[data-how]").forEach(bt => bt.onclick = () => { F.virt = bt.dataset.how === "1";
      $("#sm_how").querySelectorAll("[data-how]").forEach(x => x.classList.toggle("primary", x === bt)); $("#sm_wf").style.display = F.virt ? "none" : ""; });
    $("#sm_d").onchange = () => { const d = $("#sm_d").value; if(F.free && d >= F.from && d <= addD(F.from, 6)) drawFree(); else if(F.free || picked("sm_st").length) loadFree(); };
    $("#sm_s").onchange = $("#sm_l").onchange = () => drawFree();
    $("#sm_go").onclick = async () => { const t = $("#sm_t").value.trim(); if(!t) return $("#sm_m").textContent = "Add what the meeting is.";
      const staff = picked("sm_st"), d = $("#sm_d").value, st = $("#sm_s").value, len = +$("#sm_l").value;
      if(!d) return $("#sm_m").textContent = "Pick a day.";
      if(F.free && d >= F.from && d <= addD(F.from, 6)){ const bz = F.free.people.filter(p => !freeAt(p, d, toMin(st), len)).map(p => p.me ? "you" : first(p.name));
        if(bz.length && !confirm(bz.join(", ") + (bz.length === 1 && bz[0] !== "you" ? " looks" : " look") + " busy or off then. Make it anyway?")) return; }
      if(!staff.length && !confirm("No coworkers picked. Make it just for you?")) return;
      $("#sm_go").disabled = true; $("#sm_m").textContent = F.virt ? "Making the meeting and the Zoom link…" : "Making the meeting…";
      let id = null;
      if(F.virt){ const r = await fnCall({ action:"create", title:t, day:d, start:st, minutes:len, note:$("#sm_n").value, staff });
        if(!r.ok){ $("#sm_go").disabled = false; return $("#sm_m").textContent = "Couldn't make it: " + r.error; } id = r.id; }
      else { const r = await sb.rpc("meet_invite_save2", { p_title:t, p_day:d, p_start:st, p_minutes:len, p_staff:staff, p_note:$("#sm_n").value, p_virtual:false, p_location:$("#sm_w").value });
        if(r.error){ $("#sm_go").disabled = false; return $("#sm_m").textContent = "Couldn't make it: " + niceE(r.error); } id = r.data.id; }
      ST.sel[key] = d; ST.justMade = id; evCal(v, key, true); };   // the redrawn calendar opens it (ST.justMade)
  }
  // click on an event = this summary first; Edit opens the full form
  function evPeek(e){
    const k = e.kind || "event", ok = canEdit(e), lk = links[e.id], gs = guests[e.id] || [];
    const when = fday(e.day) + (e.end_day && e.end_day !== e.day ? " – " + fday(e.end_day) : "") + (e.start_time ? " · " + ftime(e.start_time.slice(0, 5)) + (e.end_time ? "–" + ftime(e.end_time.slice(0, 5)) : "") : " · all day");
    const ttl = k === "event" ? e.title : (k === "out" ? "Out" : "Working") + " · " + who(e.person_id);
    modal({ h:esc(ttl), b:`<p style="margin:6px 0"><b>${esc(when)}</b><br><span class="muted">${e.src === "email" ? "✉ Added from an email invite · " : ""}${e.cal === "office" ? "Office calendar" : "Only you see this"}${e.virtual ? " · 💻 Virtual" : e.location ? " · " + esc(e.location) : ""}</span></p>
      ${lk ? `<a class="btn primary" href="${esc(lk)}" target="_blank" rel="noopener noreferrer">💻 Join the meeting</a>` : ""}
      ${(e.attendees || []).length ? `<p style="margin:8px 0 2px"><b>From Moose:</b> ${esc(e.attendees.map(who).join(", "))}</p>` : ""}
      ${gs.length ? `<p style="margin:8px 0 2px"><b>From outside Moose:</b></p>${gs.map(g => `<div style="margin:2px 0 2px 8px">${esc(g.name)}${g.company ? ` <span class="muted">· ${esc(g.company)}</span>` : ""}${g.email ? ` · <a href="mailto:${esc(g.email)}">${esc(g.email)}</a>` : ""}${g.phone ? ` · <a href="tel:${esc(g.phone.replace(/[^0-9+]/g, ""))}">${esc(g.phone)}</a>` : ""}</div>`).join("")}` : ""}
      ${e.notes ? `<p class="muted" style="white-space:pre-wrap;margin:8px 0">${esc(e.notes)}</p>` : ""}
      <div class="evft" style="display:flex;gap:8px;flex-wrap:wrap">${ok ? `<button class="btn primary" id="pk_ed" style="flex:1">✎ Edit</button><button class="btn" id="pk_mv">Move</button><button class="btn" id="pk_cx">${k === "event" ? "Cancel meeting" : "Remove"}</button>` : `<button class="btn" id="pk_ed" style="flex:1">See all details</button>`}</div><p class="muted" id="pk_m" style="margin:0 0 10px"></p>` });
    $("#pk_ed").onclick = () => form(e);
    if(!ok) return;
    $("#pk_mv").onclick = () => moveBox({ day:e.day, start:e.start_time ? e.start_time.slice(0, 5) : "", minutes:e.start_time && e.end_time ? toMin(e.end_time) - toMin(e.start_time) : 60, title:ttl },
      async (d, st, mins) => { const len = e.end_day ? (D(e.end_day) - D(e.day)) / 864e5 : null;
        return save(e, { p_day:d, p_end_day:len != null ? addD(d, len) : null, p_start:st || null, p_end:st ? endTime(st, mins) : null }); });
    $("#pk_cx").onclick = async () => { if(!confirm((k === "event" ? "Cancel “" + ttl + "”?" : "Remove this?") + " It comes off the calendar for everyone.")) return;
      const r = await save(e, { p_off:true }); if(!r.error){ $("#evm").classList.remove("on"); evCal(v, key, true); } };
  }
  // pick a new day + time (keeps the length unless changed)
  function moveBox(it, doMove){
    const L = [15, 30, 45, 60, 90, 120, 150, 180, 240, 480];
    modal({ h:"Move " + esc(it.title), b:`<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>Day</span><input type="date" id="mv_d" value="${esc(it.day)}"></label>
      <label class="field" style="flex:1;min-width:120px"><span>Starts</span><select id="mv_s">${(() => { const l = []; for(let m = 5 * 60; m < 24 * 60; m += 15) l.push(hhmm(m)); if(it.start && !l.includes(it.start)) l.push(it.start); l.sort();
        return `<option value="">All day</option>` + l.map(t => `<option value="${t}" ${t === it.start ? "selected" : ""}>${ftime(t)}</option>`).join(""); })()}</select></label>
      <label class="field" style="flex:1;min-width:110px"><span>How long</span><select id="mv_l">${(L.includes(it.minutes) ? L : L.concat([it.minutes]).sort((a, b) => a - b)).map(m => `<option value="${m}" ${m === it.minutes ? "selected" : ""}>${m < 60 ? m + " min" : (m / 60) + (m === 60 ? " hour" : " hours")}</option>`).join("")}</select></label></div>
      ${it.note ? `<p class="muted" style="font-size:12.5px">${esc(it.note)}</p>` : ""}
      <div class="evft"><button class="btn primary" style="width:100%" id="mv_go">Move it</button><p class="muted" id="mv_m" style="margin:6px 0 0"></p></div>` });
    $("#mv_go").onclick = async () => { const d = $("#mv_d").value, st = $("#mv_s").value; if(!d) return $("#mv_m").textContent = "Pick a day.";
      $("#mv_go").disabled = true; const r = await doMove(d, st, +$("#mv_l").value);
      if(r && r.error){ $("#mv_go").disabled = false; return $("#mv_m").textContent = "Couldn't move it: " + r.error.message; }
      $("#evm").classList.remove("on"); ST.sel[key] = d; evCal(v, key, true); };
  }
  // staff meetings (Calendar ▸ Meetings): summary with Open agenda + Join
  async function smPeek(meet, day){
    const all = await meetings(); const t = all.find(x => x.meet === meet) || {};
    const o = (ox.meetings || []).find(x => x.meet === meet && x.day === day) || {};
    const w = t.meet ? mAt(t, day) : {}, st = w.start || o.start, en = st ? (w.minutes ? endTime(st, w.minutes) : o.end) : null, mvd = t.meet ? mvTo(t, day) : null;
    modal({ h:esc(meet ? NAMES[meet] + " meeting" : "In a meeting"), b:`<p style="margin:6px 0"><b>${esc(fday(day))}${st ? " · " + ftime(st) + (en ? "–" + ftime(en) : "") : ""}</b></p>
      ${(o.people || []).length ? `<p class="muted" style="margin:4px 0">For: ${esc(o.people.map(fn).join(", "))}</p>` : ""}
      ${mvd ? `<p class="pill amber" style="display:inline-block">Moved from ${esc(fday(mvd.from))}${mvd.note ? " · " + esc(mvd.note) : ""}</p>` : ""}
      ${t.link ? `<a class="btn primary" href="${esc(t.link)}" target="_blank" rel="noopener noreferrer">▶ Join</a>` : ""}
      <p class="muted" style="font-size:12.5px">A weekly meeting: its time is set for every week under Calendar ▸ Meetings${ME.admin ? " (Change day & time)" : ""}.</p>
      <div class="evft" style="display:flex;gap:8px;flex-wrap:wrap">${meet ? `<a class="btn primary" style="flex:1" href="#/${esc(meet)}">Open the agenda</a>` : ""}${ME.admin && t.meet ? `<button class="btn" id="smmv">Move or skip this one</button>` : ""}${ME.admin ? `<a class="btn" href="#/cal_meet">Change day & time</a>` : ""}</div>` });
    $("#evcard").querySelectorAll(".evft a").forEach(a => a.addEventListener("click", () => $("#evm").classList.remove("on")));
    const mb = $("#smmv"); if(mb) mb.onclick = () => { $("#evm").classList.remove("on"); moveOne(t, (mvd && mvd.from) || day, () => evCal(v, key, true)); };
  }
  function meetBox(m, fresh){
    const url = pageUrl("meet.html", "t=" + m.token), canCx = m.mine || ME.admin, inv = (m.staff || []).includes(myId) && !m.mine;
    const coworker = m.kind === "invite", showLink = m.virtual !== false && (canCx || !coworker), my = m.my_answer || null;
    const nm = id => (ppl.find(p => p.id === id) || {}).name || "";
    const ansTxt = my ? (my.answer === "yes" ? "✅ You said you're coming" : my.answer === "no" ? "🙅 You said you can't make it"
      : "🕑 You suggested " + fday(my.sug_day) + " " + ftime(String(my.sug_start).slice(0, 5))) : "Can you make it?";
    modal({ h:esc(m.title), b:`${fresh ? `<p class="pill green" style="display:inline-block">Made ✓ ${(m.staff || []).length ? "It's on everyone's calendar; they answer here" : "Send the link below"}</p>` : ""}
      <p style="margin:6px 0"><b>${esc(fday(m.day))}</b> · ${esc(ftime(m.start))}–${esc(ftime(endTime(m.start, m.minutes)))} · ${m.minutes} min<br><span class="muted">Host: ${esc(m.host || "")}${m.booking ? " · booked on “" + esc(m.booking) + "”" : ""} · ${m.virtual === false ? "👥 In person" + (m.location ? " at " + esc(m.location) : "") : "💻 Virtual"}</span></p>
      ${inv ? `<div class="card" style="padding:10px 12px;margin:8px 0"><b>${esc(ansTxt)}</b>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="btn small${my && my.answer === "yes" ? " primary" : ""}" data-ma="yes">✅ Yes</button><button class="btn small${my && my.answer === "no" ? " primary" : ""}" data-ma="no">🙅 Can't make it</button><button class="btn small${my && my.answer === "suggest" ? " primary" : ""}" data-ma="suggest">🕑 Suggest another time</button></div>
        <div id="ma_sug" style="display:none;gap:8px;flex-wrap:wrap;margin-top:6px"><label class="field" style="flex:1;min-width:140px"><span>Day</span><input type="date" id="ma_d" min="${today()}" value="${esc(m.day)}"></label><label class="field" style="flex:1;min-width:120px"><span>Starts</span><select id="ma_s">${topts(m.start)}</select></label></div>
        <input id="ma_n" maxlength="300" placeholder="Note for ${esc((m.host || "the host").split(" ")[0])} (optional)" value="${esc((my && my.note) || "")}" style="margin-top:6px">
        <div id="ma_go" style="display:none;margin-top:6px"><button class="btn small primary" id="ma_send">Send the suggestion</button></div><p class="muted" id="ma_m" style="margin:4px 0 0"></p></div>` : ""}
      ${showLink ? `<div class="field"><span>Link to send (meeting page with the Zoom button and Add to calendar)</span><div style="display:flex;gap:6px"><input readonly value="${esc(url)}" style="flex:1"><button class="btn small primary" id="mc">Copy</button></div></div>` : ""}
      ${m.virtual !== false ? `<div style="margin:8px 0">${zoomTxt(m, canCx)}</div>` : ""}
      ${m.guest_name ? `<div class="card" style="padding:10px 12px;margin:8px 0"><b>Booked by ${esc(m.guest_name)}</b><br>${m.guest_email ? `<a href="mailto:${esc(m.guest_email)}">${esc(m.guest_email)}</a>` : ""}${m.guest_phone ? " · " + esc(m.guest_phone) : ""}${m.guest_note ? `<div class="muted" style="white-space:pre-wrap;margin-top:4px">${esc(m.guest_note)}</div>` : ""}</div>` : ""}
      ${m.note ? `<p class="muted" style="white-space:pre-wrap">${esc(m.note)}</p>` : ""}
      ${(m.staff || []).length ? `<div class="card" id="mrep" style="padding:10px 12px;margin:8px 0"><b>Who's coming</b> <span class="muted">Loading…</span></div>` : ""}
      <div class="evft" style="display:flex;gap:8px;flex-wrap:wrap">${showLink ? `<a class="btn" style="flex:1" href="${esc(url)}" target="_blank" rel="noopener">Open the page</a>` : ""}${canCx ? `<button class="btn" id="mmv" style="${showLink ? "" : "flex:1"}">Move</button><button class="btn" id="mx">Cancel meeting</button>` : ""}</div>
      <p class="muted" id="mm" style="margin:0 0 10px"></p>` });
    const again = () => { $("#evm").classList.remove("on"); ST.openMeet = m.id; evCal(v, key, true); };
    if($("#mc")) $("#mc").onclick = () => copy(url, $("#mc"));
    if($("#mz")) $("#mz").onclick = async () => { $("#mz").disabled = true; const r = await fnCall({ action:"zoom", id:m.id }); if(!r.ok) $("#mm").textContent = r.error;
      const l = await sb.rpc("meet_mine", { p_from:m.day, p_to:m.day }); const n = ((l && l.data) || []).find(x => x.id === m.id); if(n) meetBox(n); };
    if($("#mmv")) $("#mmv").onclick = () => moveBox({ day:m.day, start:m.start, minutes:m.minutes, title:m.title, note:(m.staff || []).length ? "Everyone on it is asked to answer again for the new time." + (showLink ? " The link you sent stays the same." : "") : "The link you sent stays the same and shows the new time." },
      async (d, st, mins) => sb.rpc("meet_move", { p_id:m.id, p_day:d, p_start:st, p_minutes:mins }));
    if($("#mx")) $("#mx").onclick = async () => { const why = prompt("Cancel this meeting? It comes off everyone's calendar. Add a note (optional):", ""); if(why === null) return;
      const r = await sb.rpc("meet_cancel", { p_id:m.id, p_note:why }); if(r.error) return $("#mm").textContent = "Couldn't cancel: " + r.error.message;
      $("#evm").classList.remove("on"); evCal(v, key, true); };
    // answer (only the coworkers on it)
    const reply = async (ans, d, st) => { $("#ma_m").textContent = "Saving…";
      const r = await sb.rpc("meet_reply", { p_id:m.id, p_answer:ans, p_note:$("#ma_n").value, p_sug_day:d || null, p_sug_start:st || null });
      if(r.error) return $("#ma_m").textContent = "Couldn't save: " + r.error.message; again(); };
    $("#evcard").querySelectorAll("[data-ma]").forEach(bt => bt.onclick = () => { if(bt.dataset.ma !== "suggest") return reply(bt.dataset.ma);
      $("#ma_sug").style.display = "flex"; $("#ma_go").style.display = ""; $("#ma_m").textContent = "Pick the day and time that works, then Send."; });
    if($("#ma_send")) $("#ma_send").onclick = () => reply("suggest", $("#ma_d").value, $("#ma_s").value);
    // who's coming
    if($("#mrep")) sb.rpc("meet_replies", { p_ids:[m.id] }).then(r => { const el = $("#mrep"); if(!el) return;
      if(r.error) return el.innerHTML = `<b>Who's coming</b> <span class="muted">Couldn't load: ${esc(r.error.message)}</span>`;
      const L = r.data || [], c = k => L.filter(x => (x.answer || "") === k).length;
      el.innerHTML = `<b>Who's coming</b> <span class="muted" style="font-size:12.5px">${c("yes")} yes · ${c("no")} can't · ${c("suggest")} suggested a time · ${c("")} waiting</span>
        <div style="font-size:13.5px;margin:4px 0">👑 ${esc(m.host || "")} <span class="muted">· host</span></div>
        ${L.sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(x => `<div style="font-size:13.5px;margin:4px 0">${x.answer === "yes" ? "✅" : x.answer === "no" ? "🙅" : x.answer === "suggest" ? "🕑" : "❔"} ${esc(x.name || nm(x.user_id))}
          <span class="muted">· ${x.answer === "yes" ? "coming" : x.answer === "no" ? "can't make it" : x.answer === "suggest" ? "suggests " + esc(fday(x.sug_day)) + " " + esc(ftime(x.sug_start)) : "hasn't answered"}</span>
          ${x.answer === "suggest" && canCx ? ` <button class="btn small" data-mvto="${esc(x.sug_day)}|${esc(x.sug_start)}">Move to this time</button>` : ""}
          ${x.note ? `<div class="muted" style="font-size:12.5px;margin-left:24px">“${esc(x.note)}”</div>` : ""}</div>`).join("")}`;
      el.querySelectorAll("[data-mvto]").forEach(bt => bt.onclick = async () => { const [d, st] = bt.dataset.mvto.split("|");
        if(!confirm("Move it to " + fday(d) + " " + ftime(st) + "? Everyone is asked to answer again.")) return;
        const x = await sb.rpc("meet_move", { p_id:m.id, p_day:d, p_start:st, p_minutes:m.minutes }); if(x.error) return $("#mm").textContent = "Couldn't move it: " + x.error.message;
        ST.sel[key] = d; again(); }); });
  }
  async function linksBox(){
    const r = await sb.rpc("book_links_mine"); const L = (r && r.data) || [];
    modal({ h:"Booking links", b:`<p class="muted" style="margin:4px 0 8px">Send a booking link and people pick an open time inside the days and hours you set. Times you're busy on the hub calendar (events, meetings, time off) never show. Each booking gets its own Zoom link and lands on your calendar.</p>
      ${ME.admin ? `<div class="card" style="padding:8px 12px;margin:0 0 8px" id="zst"><span class="muted">Checking Zoom…</span></div>` : ""}
      <button class="btn primary" id="bl_new" style="width:100%">+ New booking link</button>
      ${L.length ? L.map(b => `<div class="card" style="padding:10px 12px;margin:8px 0;${b.off ? "opacity:.6" : ""}"><b>${esc(b.title)}</b>${b.off ? ` <span class="pill">Off</span>` : ""}${ME.admin && b.owner_id !== myId ? ` <span class="muted">· ${esc(b.owner)}</span>` : ""}
        <div class="muted" style="font-size:13px">${b.minutes} min · ${esc(fday(b.from_day))} – ${esc(fday(b.to_day))} · ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].filter((_, i) => b.dows.includes(i)).join(", ")} ${esc(ftime(b.day_start.slice(0, 5)))}–${esc(ftime(b.day_end.slice(0, 5)))} · ${b.booked} booked</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="btn small primary" data-bc="${esc(b.slug)}">Copy link</button><a class="btn small" href="${esc(pageUrl("book.html", "l=" + b.slug))}" target="_blank" rel="noopener">Open</a><button class="btn small" data-be="${b.id}">Change</button></div></div>`).join("")
        : `<p class="muted">No booking links yet.</p>`}<div class="evft"></div>` });
    $("#bl_new").onclick = () => linkForm(null);
    if(ME.admin) fnCall({ action:"check" }).then(z => { const el = $("#zst"); if(!el) return;   // admins: is Zoom connected? (never shows the keys)
      el.innerHTML = !z.ok ? `<span class="muted">Couldn't check Zoom: ${esc(z.error || "")}</span>`
        : !z.connected ? `<b>Zoom isn't connected yet.</b> <span class="muted">Meetings save now and get their Zoom link once it is${z.waiting ? " (" + z.waiting + " waiting)" : ""}.</span>`
        : z.sign_in !== "ok" ? `<b>Zoom sign-in failed:</b> <span class="muted">${esc(z.sign_in)}</span>`
        : `<b>Zoom connected ✓</b> <span class="muted">${z.host_ok ? "Host account OK" : "Host account problem: " + esc(z.host_error || "")}${z.waiting ? " · " + z.waiting + " meetings still waiting for a link" : ""}</span>`; });
    $("#evcard").querySelectorAll("[data-bc]").forEach(x => x.onclick = () => copy(pageUrl("book.html", "l=" + x.dataset.bc), x));
    $("#evcard").querySelectorAll("[data-be]").forEach(x => x.onclick = () => linkForm(L.find(b => b.id === +x.dataset.be)));
  }
  function linkForm(b){
    const t0 = today(), dows = b ? b.dows : [1, 2, 3, 4, 5];
    modal({ h:b ? "Change booking link" : "New booking link", b:`
      <label class="field"><span>What people book</span><input id="bl_t" maxlength="120" value="${esc(b ? b.title : "")}" placeholder="e.g. Owner intro call, Vendor walk-through"></label>
      <label class="field"><span>Meeting length</span><select id="bl_l">${lenOpts(b ? b.minutes : 30, [15, 20, 30, 45, 60, 90, 120])}</select></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>First day they can book</span><input type="date" id="bl_f" value="${esc(b ? b.from_day : t0)}"></label>
        <label class="field" style="flex:1;min-width:140px"><span>Last day</span><input type="date" id="bl_e" value="${esc(b ? b.to_day : addD(t0, 14))}"></label></div>
      <div class="field"><span>Days of the week</span><div>${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => `<label class="lyr"><input type="checkbox" data-dw="${i}" ${dows.includes(i) ? "checked" : ""}>${d}</label>`).join(" ")}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:120px"><span>From</span><select id="bl_s">${topts(b ? b.day_start.slice(0, 5) : "09:00")}</select></label>
        <label class="field" style="flex:1;min-width:120px"><span>Until</span><select id="bl_u">${topts(b ? b.day_end.slice(0, 5) : "17:00")}</select></label></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>Break between meetings</span><select id="bl_g">${[0, 5, 10, 15, 30].map(m => `<option value="${m}" ${(b ? b.gap_min : 0) === m ? "selected" : ""}>${m ? m + " min" : "None"}</option>`).join("")}</select></label>
        <label class="field" style="flex:1;min-width:140px"><span>Book at least</span><select id="bl_n">${[[0, "Any time"], [1, "1 hour ahead"], [2, "2 hours ahead"], [4, "4 hours ahead"], [12, "12 hours ahead"], [24, "1 day ahead"], [48, "2 days ahead"]].map(([h, l]) => `<option value="${h}" ${(b ? b.notice_h : 4) === h ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <label class="field"><span>Note on the booking page (optional)</span><textarea id="bl_x" maxlength="1000" style="min-height:60px">${esc(b && b.note || "")}</textarea></label>
      ${staffPick(b ? b.staff : [], "bl_st")}
      ${b ? `<label class="lyr"><input type="checkbox" id="bl_off" ${b.off ? "checked" : ""}>Turn this link off (people can't book)</label>` : ""}
      <div class="evft"><button class="btn primary" style="width:100%" id="bl_go">${b ? "Save" : "Make the link"}</button><p class="muted" id="bl_m" style="margin:6px 0 0"></p></div>` });
    $("#bl_go").onclick = async () => {
      const r = await sb.rpc("book_link_save", { p_id:b ? b.id : null, p_title:$("#bl_t").value, p_minutes:+$("#bl_l").value, p_from:$("#bl_f").value || null, p_to:$("#bl_e").value || null,
        p_dows:[...$("#evcard").querySelectorAll("[data-dw]:checked")].map(x => +x.dataset.dw), p_start:$("#bl_s").value, p_end:$("#bl_u").value, p_gap:+$("#bl_g").value,
        p_notice:+$("#bl_n").value, p_note:$("#bl_x").value, p_staff:picked("bl_st"), p_off:$("#bl_off") ? $("#bl_off").checked : false });
      if(r.error) return $("#bl_m").textContent = "Couldn't save: " + r.error.message;
      linksBox(); };
  }
  const save = (e, over) => sb.rpc("cal_event_save2", Object.assign({ p_id:e.id, p_cal:e.cal, p_kind:e.kind || "event", p_person:e.person_id, p_title:e.title, p_day:e.day, p_end_day:e.end_day,
    p_start:e.start_time ? e.start_time.slice(0, 5) : null, p_end:e.end_time ? e.end_time.slice(0, 5) : null, p_location:e.location || "", p_notes:e.notes || "", p_off:false }, over)).then(r => { if(r.error) alert("Couldn't move it: " + r.error.message); return r; });
  const form = (e, pre) => {
    pre = pre || {}; const kind = e ? (e.kind || "event") : (pre.kind || "event"), cal = e ? e.cal : (isOff ? "office" : "personal"), ro = e && !canEdit(e);
    const head = e ? (ro ? "Event" : "Change event") : kind === "out" ? "Mark out" : kind === "working" ? "Mark working" : cal === "office" ? "New work event" : "New personal event";
    const pick = cal === "office" && kind !== "event" && boss ? `<label class="field"><span>Who</span><select id="ev_p">${ppl.map(p => `<option value="${p.id}" ${(e ? e.person_id : myId) === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>` : "";
    const showOn = kind === "event" && boss && !ro ? `<div class="field"><span>Show on</span><div><label class="lyr"><input type="radio" name="ev_cal" value="personal" ${cal === "personal" ? "checked" : ""}>Only my calendar</label> <label class="lyr"><input type="radio" name="ev_cal" value="office" ${cal === "office" ? "checked" : ""}>Office calendar (everyone sees it)</label></div></div>` : "";
    const st0 = e && e.start_time ? e.start_time.slice(0, 5) : pre.start || "", en0 = e && e.end_time ? e.end_time.slice(0, 5) : pre.end || (st0 ? endTime(st0, 60) : "");
    const tOpts = (sel, blank) => { const l = []; for(let m = 5 * 60; m < 24 * 60; m += 15) l.push(hhmm(m)); if(sel && !l.includes(sel)) l.push(sel); l.sort();
      return (blank ? `<option value="">${blank}</option>` : "") + l.map(t => `<option value="${t}" ${t === sel ? "selected" : ""}>${ftime(t)}</option>`).join(""); };
    const LENS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 480], lenTxt = m => m < 60 ? m + " min" : (m / 60) + (m === 60 ? " hour" : " hours");
    const len0 = st0 && en0 ? toMin(en0) - toMin(st0) : 60;
    const timeH = `<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:120px"><span>Starts</span><select id="ev_s" ${ro ? "disabled" : ""}>${tOpts(st0, "All day")}</select></label>
      <label class="field" style="flex:1;min-width:110px"><span>How long</span><select id="ev_len" ${ro || !st0 ? "disabled" : ""}>${LENS.map(m => `<option value="${m}" ${m === len0 ? "selected" : ""}>${lenTxt(m)}</option>`).join("")}<option value="" ${LENS.includes(len0) ? "" : "selected"}>Other</option></select></label>
      <label class="field" style="flex:1;min-width:120px"><span>Ends</span><select id="ev_f" ${ro || !st0 ? "disabled" : ""}>${tOpts(en0, "—")}</select></label></div>`;
    const lk0 = e ? links[e.id] || "" : pre.link || "", virt0 = e ? !!e.virtual : !!pre.link;
    const moreOpen = ro || (e && ((e.attendees || []).length || (guests[e.id] || []).length || e.notes));
    const whereH = kind === "event" ? `<div class="field"><span>Meeting type</span><div><label class="lyr"><input type="radio" name="ev_v" value="0" ${virt0 ? "" : "checked"} ${ro ? "disabled" : ""}>In person</label> <label class="lyr"><input type="radio" name="ev_v" value="1" ${virt0 ? "checked" : ""} ${ro ? "disabled" : ""}>💻 Virtual</label></div></div>
      <div id="ev_vbox" style="display:${virt0 ? "block" : "none"}">${ro ? (lk0 ? `<a class="btn primary" href="${esc(lk0)}" target="_blank" rel="noopener noreferrer">💻 Join the meeting</a>` : "")
        : `<label class="field"><span>Meeting link (Zoom, Google Meet, Teams…)</span><input id="ev_link" type="url" placeholder="https://zoom.us/j/…" value="${esc(lk0)}"></label>${lk0 ? `<a class="btn small" href="${esc(lk0)}" target="_blank" rel="noopener noreferrer">💻 Join</a>` : ""}`}
        <p class="muted" style="font-size:12px;margin:4px 0 0">The link shows to the people on the meeting, managers and admins (on an office event with nobody picked, everyone).</p></div>` : "";
    const attH = (cal === "office" || boss) && kind === "event" ? `<div class="field" id="ev_att" style="display:${cal === "office" ? "block" : "none"}"><span>Who's going (shows on their Personal calendar)</span><div class="attp">${ppl.map(p => `<label class="lyr"><input type="checkbox" data-att="${p.id}" ${(e ? (e.attendees || []).includes(p.id) : isMe && p.id === myId) ? "checked" : ""} ${ro ? "disabled" : ""}>${esc(p.name)}</label>`).join("")}</div></div>` : "";
    $("#evcard").innerHTML = `<div class="evhd" style="display:flex;align-items:center;gap:10px"><h2 style="font-size:20px;flex:1;margin:0">${head}</h2><button class="btn small" id="evx" aria-label="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>
      ${pick}<label class="field"><span>${kind === "event" ? "What" : "Note (optional, e.g. PTO, sick, on call)"}</span><input id="ev_t" value="${esc(e && !/^(out|working)$/i.test(e.title) ? e.title : pre.title || "")}" ${ro ? "disabled" : ""}></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1"><span>Day</span><input type="date" id="ev_d" value="${esc(e ? e.day : pre.day || ST.sel[key])}" ${ro ? "disabled" : ""}></label><label class="field" style="flex:1"><span>Until (optional)</span><input type="date" id="ev_e" value="${esc(e && e.end_day || "")}" ${ro ? "disabled" : ""}></label></div>
      ${timeH}${showOn}${whereH}
      <label class="field" id="ev_lw" style="display:${virt0 && kind === "event" ? "none" : "block"}"><span>Where (optional)</span><input id="ev_l" value="${esc(e && e.location || "")}" ${ro ? "disabled" : ""}></label>
      <details class="evmore" ${moreOpen ? "open" : ""}><summary>More options${kind === "event" ? " (who's going, people from outside Moose, notes)" : " (notes)"}</summary>${attH}${kind === "event" ? `<div class="field"><span>People from outside Moose (vendors, owners, anyone you're meeting)</span><div id="ev_gl"></div>${ro ? "" : `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><select id="ev_vp" style="flex:1;min-width:180px"><option value="">+ Pick a vendor…</option></select><button class="btn small" id="ev_ga" type="button">+ Add a person</button></div>`}</div>` : ""}
      <label class="field"><span>Notes</span><textarea id="ev_n" style="min-height:70px" placeholder="Don't type codes or passwords here." ${ro ? "disabled" : ""}>${esc(e && e.notes || "")}</textarea></label></details>
      <div class="evft">${ro ? "" : `<div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" id="ev_go">Save</button>${e ? `<button class="btn" id="ev_off">Remove</button>` : ""}</div>`}<p class="muted" id="ev_m" style="margin:6px 0 0"></p></div>`;
    $("#evm").classList.add("on");
    $("#evx").onclick = () => $("#evm").classList.remove("on");
    $("#evm").onclick = x => { if(x.target === $("#evm")) $("#evm").classList.remove("on"); };   // click outside the form closes it
    $("#evcard").scrollTop = 0;
    // people from outside Moose: a vendor from the Vendors list or anyone typed in
    const G = (e ? (guests[e.id] || []) : []).map(g => Object.assign({}, g));
    const gDraw = () => { const box = $("#ev_gl"); if(!box) return;
      if(ro){ box.innerHTML = G.length ? G.map(g => `<div style="margin:4px 0"><b>${esc(g.name)}</b>${g.company ? ` <span class="muted">· ${esc(g.company)}</span>` : ""}${g.email ? ` · <a href="mailto:${esc(g.email)}">${esc(g.email)}</a>` : ""}${g.phone ? ` · <a href="tel:${esc(g.phone.replace(/[^0-9+]/g, ""))}">${esc(g.phone)}</a>` : ""}</div>`).join("") : `<span class="muted">Nobody added.</span>`; return; }
      box.innerHTML = G.map((g, i) => `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;align-items:center">
        <input data-gi="${i}" data-gk="name" placeholder="Name" value="${esc(g.name || "")}" style="flex:1.2;min-width:120px">
        <input data-gi="${i}" data-gk="company" placeholder="Company" value="${esc(g.company || "")}" style="flex:1;min-width:110px">
        <input data-gi="${i}" data-gk="email" type="email" placeholder="Email" value="${esc(g.email || "")}" style="flex:1.3;min-width:150px">
        <input data-gi="${i}" data-gk="phone" type="tel" placeholder="Phone" value="${esc(g.phone || "")}" style="flex:.9;min-width:110px">
        <button class="btn small" type="button" data-gx="${i}" aria-label="Remove" style="width:34px;padding:0">✕</button></div>`).join("");
      box.querySelectorAll("[data-gi]").forEach(x => x.oninput = () => { G[+x.dataset.gi][x.dataset.gk] = x.value; });
      box.querySelectorAll("[data-gx]").forEach(x => x.onclick = () => { G.splice(+x.dataset.gx, 1); gDraw(); }); };
    gDraw();
    if(ro) return;
    if($("#ev_ga")) $("#ev_ga").onclick = () => { G.push({ name:"", company:"", email:"", phone:"" }); gDraw(); const n = $("#ev_gl").querySelectorAll('[data-gk="name"]'); if(n.length) n[n.length - 1].focus(); };
    if($("#ev_vp")){ (async () => { try { const vr = await sb.from("vendors").select("id,name,trade,phone,email").eq("active", true).order("name");
        const V = (vr && vr.data) || []; if(!V.length){ $("#ev_vp").style.display = "none"; return; }
        $("#ev_vp").insertAdjacentHTML("beforeend", V.map(x => `<option value="${esc(String(x.id))}">${esc(x.name)}${x.trade ? " · " + esc(x.trade) : ""}</option>`).join(""));
        $("#ev_vp").onchange = () => { const x = V.find(y => String(y.id) === $("#ev_vp").value); $("#ev_vp").value = ""; if(!x || G.some(g => String(g.vendor_id) === String(x.id))) return;
          G.push({ name:x.name, company:x.trade ? "Vendor (" + x.trade + ")" : "Vendor", email:x.email || "", phone:x.phone || "", vendor_id:String(x.id) }); gDraw(); };
      } catch(_){ $("#ev_vp").style.display = "none"; } })(); }
    const calNow = () => { const r = $("#evcard").querySelector("[name=ev_cal]:checked"); return r ? r.value : cal; };
    $("#evcard").querySelectorAll("[name=ev_cal]").forEach(r => r.onchange = () => { const a = $("#ev_att"); if(a) a.style.display = calNow() === "office" ? "block" : "none"; });
    $("#evcard").querySelectorAll("[name=ev_v]").forEach(r => r.onchange = () => { const on = r.value === "1"; $("#ev_vbox").style.display = on ? "block" : "none"; $("#ev_lw").style.display = on ? "none" : "block"; if(on && $("#ev_link")) $("#ev_link").focus(); });
    // a link copied out of an email or Google search is often wrapped (google.com/url?q=…) - keep the real meeting link
    const unwrap = u => { try { const x = new URL(u); if(/(^|\.)google\.[a-z.]+$/i.test(x.hostname) && x.pathname === "/url"){ const q = x.searchParams.get("q") || x.searchParams.get("url"); if(q && /^https:\/\//i.test(q)) return q; } } catch(_){} return u; };
    if($("#ev_link")) $("#ev_link").onchange = () => { $("#ev_link").value = unwrap($("#ev_link").value.trim()); };
    { const S = $("#ev_s"), L = $("#ev_len"), F = $("#ev_f");
      const setEnd = () => { if(!S.value || !L.value) return; const t = endTime(S.value, +L.value); if(![...F.options].some(o => o.value === t)) F.add(new Option(ftime(t), t)); F.value = t; };
      S.onchange = () => { L.disabled = F.disabled = !S.value; if(S.value && !L.value) L.value = "60"; setEnd(); };
      L.onchange = setEnd;
      F.onchange = () => { const m = S.value && F.value ? toMin(F.value) - toMin(S.value) : 0; L.value = LENS.includes(m) ? String(m) : ""; }; }
    const go = async off => { const t = $("#ev_t").value.trim(), d = $("#ev_d").value;
      if((kind === "event" && !t) || !d) return $("#ev_m").textContent = "Add what and which day.";
      const c = calNow(), sT = $("#ev_s").value || null, fT = sT ? $("#ev_f").value || null : null;
      if(sT && fT && fT <= sT) return $("#ev_m").textContent = "The end time has to be after the start.";
      const vr = $("#evcard").querySelector("[name=ev_v]:checked"), virt = !!(vr && vr.value === "1"), link = $("#ev_link") ? unwrap($("#ev_link").value.trim()) : "";
      const gl = G.filter(g => (g.name || "").trim() || (g.email || "").trim() || (g.phone || "").trim());
      if(gl.some(g => !(g.name || "").trim())) return $("#ev_m").textContent = "Add a name for each person from outside Moose (or remove the empty row).";
      if(gl.some(g => (g.email || "").trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.email.trim()))) return $("#ev_m").textContent = "Check the email of the people from outside Moose.";
      if(virt && link && !/^https:\/\/\S+$/i.test(link)) return $("#ev_m").textContent = "The meeting link has to start with https://";
      const att = c === "office" && kind === "event" ? [...$("#evcard").querySelectorAll("[data-att]:checked")].map(x => x.dataset.att) : null;
      const r = await sb.rpc("cal_event_save4", { p_attendees:att, p_id:e ? e.id : null, p_cal:c, p_kind:kind, p_person:$("#ev_p") ? $("#ev_p").value : null, p_title:t, p_day:d, p_end_day:$("#ev_e").value || null,
        p_start:sT, p_end:fT, p_location:virt ? "" : $("#ev_l").value, p_notes:$("#ev_n").value, p_off:!!off, p_virtual:virt, p_link:virt ? link : null });
      if(r.error) return $("#ev_m").textContent = "Couldn't save: " + r.error.message;
      if(kind === "event" && !off && (gl.length || (e && (guests[e.id] || []).length))){
        const gr = await sb.rpc("cal_guests_set", { p_event:r.data, p_guests:gl.map(g => ({ name:g.name, company:g.company, email:g.email, phone:g.phone, vendor_id:g.vendor_id || null })) });
        if(gr.error) return $("#ev_m").textContent = "Saved the event, but not the people from outside Moose: " + gr.error.message; }
      ST.sel[key] = d; evCal(v, key, true); };
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
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">Working = on the schedule, clocked in today in Hubstaff ("On the clock"), or marked working here. Out = approved Hubstaff time off or marked out here.</p></div>
    <div class="card"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:16px;flex:1">How to reach someone</b></div>
      <input id="ppq" type="search" placeholder="Search name, title or team" style="margin:6px 0">
      ${ppl.filter(p => p.mgr || inn.includes(p)).map(person).join("") || `<p class="muted" style="margin:4px 0">Nobody working.</p>`}
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">Managers and the people working that day. Titles and extensions: Moose Office page (Property Details ▸ Moose Office). Work email from the hub sign-in list.</p></div>`;
}

/* ---------- Schedule adjustment (hub_sched_adjust.sql, Brandon 2026-11-06): change my shift / trade a shift. Time off stays timeoff_request.
   change -> manager; swap/cover -> the coworker says yes, then the manager. Approved = written onto the hub schedule. ---------- */
const shTxt = a => (a || []).map(x => ftime(x.start) + "–" + ftime(x.end)).join(", ") || "off";
const sqWhat = r => r.kind === "change" ? `<b>${esc(r.who)}</b>: ${esc(fday(r.day))} from ${esc(shTxt(r.my_shifts))} to <b>${esc(shTxt(r.want_shifts))}</b>`
  : r.kind === "cover" ? `<b>${esc(r.other)}</b> covers <b>${esc(r.who)}</b>'s ${esc(fday(r.day))} shift (${esc(shTxt(r.my_shifts))})`
  : r.day === r.other_day ? `<b>${esc(r.who)}</b> and <b>${esc(r.other)}</b> swap shifts on ${esc(fday(r.day))}: ${esc(r.who)} works ${esc(shTxt(r.other_shifts))}, ${esc(r.other)} works ${esc(shTxt(r.my_shifts))}`
  : `<b>${esc(r.who)}</b> works ${esc(r.other)}'s ${esc(fday(r.other_day))} (${esc(shTxt(r.other_shifts))}); <b>${esc(r.other)}</b> works ${esc(r.who)}'s ${esc(fday(r.day))} (${esc(shTxt(r.my_shifts))})`;
const sqPill = r => ({ asked:`<span class="pill amber">Waiting on ${esc((r.other || "").split(" ")[0])}</span>`, pending:`<span class="pill amber">Waiting on a manager</span>`,
  approved:`<span class="pill green">Approved</span>`, denied:`<span class="pill red">Not approved</span>`, declined:`<span class="pill red">${esc((r.other || "").split(" ")[0])} said no</span>`,
  cancelled:`<span class="pill">Cancelled</span>` })[r.status] || "";
function sqRow(r, acts){
  return `<div style="padding:8px 0;border-top:1px solid var(--line)"><div>${sqWhat(r)} ${sqPill(r)}</div>
    ${r.note ? `<div class="muted" style="font-size:12.5px">“${esc(r.note)}”</div>` : ""}${r.other_note ? `<div class="muted" style="font-size:12.5px">${esc((r.other || "").split(" ")[0])}: “${esc(r.other_note)}”</div>` : ""}
    ${r.decided_by && ["approved","denied"].includes(r.status) ? `<div class="muted" style="font-size:12.5px">by ${esc(r.decided_by)}${r.response ? ": " + esc(r.response) : ""}</div>` : ""}
    ${acts ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${acts}</div>` : ""}</div>`;
}
function sqCards(rs){
  const ask = rs.filter(r => r.role === "asked_me" && r.status === "asked"), dec = rs.filter(r => r.can_decide);
  const mine = rs.filter(r => r.role === "mine" && (["asked","pending"].includes(r.status) || r.day >= today()));
  const done = rs.filter(r => r.role === "team" && !r.can_decide && ["approved","denied"].includes(r.status)).slice(-15);
  return (ask.length ? `<div class="card" style="border-left:4px solid var(--amber,#8a5a00)"><b style="font-size:16px">A coworker asked you (${ask.length})</b>
      ${ask.map(r => sqRow(r, `<button class="btn small primary" data-sqyes="${r.id}">Yes, I'll do it</button><button class="btn small" data-sqno="${r.id}">No</button>`)).join("")}
      <p class="muted" style="font-size:12px;margin:6px 0 0">If you say yes, it goes to your manager to approve.</p></div>` : "")
    + (dec.length ? `<div class="card" style="border-left:4px solid var(--amber,#8a5a00)"><b style="font-size:16px">Shift changes waiting for you (${dec.length})</b>
      ${dec.map(r => sqRow(r, `<button class="btn small primary" data-sqok="${r.id}">Approve</button><button class="btn small" data-sqden="${r.id}">Say no</button>`)).join("")}
      <p class="muted" style="font-size:12px;margin:6px 0 0">Approve puts it straight onto the schedule.</p></div>` : "")
    + (mine.length ? `<div class="card"><b style="font-size:16px">Your shift changes and trades</b>
      ${mine.map(r => sqRow(r, ["asked","pending"].includes(r.status) ? `<button class="btn small" data-sqx="${r.id}">Cancel</button>` : "")).join("")}</div>` : "")
    + (done.length ? `<details class="card"><summary><b style="font-size:16px">Shift changes decided lately</b></summary>${done.map(r => sqRow(r)).join("")}</details>` : "");
}
function sqWire(v, reload){
  const go = async (fn, args) => { const r = await sb.rpc(fn, args); if(r.error) alert(window.niceErr ? niceErr(r.error) : r.error.message); else reload(); };
  v.querySelectorAll("[data-sqyes]").forEach(b => b.onclick = () => go("sched_req_answer", { p_id:+b.dataset.sqyes, p_yes:true, p_note:null }));
  v.querySelectorAll("[data-sqno]").forEach(b => b.onclick = () => { const n = prompt("Want to say why? (optional)"); if(n !== null) go("sched_req_answer", { p_id:+b.dataset.sqno, p_yes:false, p_note:n }); });
  v.querySelectorAll("[data-sqok]").forEach(b => b.onclick = () => go("sched_req_decide", { p_id:+b.dataset.sqok, p_ok:true, p_response:null }));
  v.querySelectorAll("[data-sqden]").forEach(b => b.onclick = () => { const n = prompt("Short reason for saying no (they'll see it):"); if(n && n.trim()) go("sched_req_decide", { p_id:+b.dataset.sqden, p_ok:false, p_response:n.trim() }); });
  v.querySelectorAll("[data-sqx]").forEach(b => b.onclick = () => confirm("Cancel this request?") && go("sched_req_cancel", { p_id:+b.dataset.sqx }));
}
async function sqForm(kind, reload){
  const tr = kind === "trade", myId = ((await people()).find(p => p.name === ME.name) || {}).id;
  const mates = tr ? ((await sb.rpc("sched_req_people")).data || []) : [];
  const shiftsOn = async (uid, d) => { if(!uid || !d) return []; const r = await sb.rpc("sched_get", { p_from:d, p_to:d });
    return ((r.data || {}).shifts || []).filter(x => x.user_id === uid && x.day === d); };
  const card = $("#tocard"), d0 = addD(today(), 1);
  card.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:20px;flex:1;margin:0">${tr ? "🤝 Trade a shift" : "🕑 Change my shift"}</h2><button class="btn small" id="tox" aria-label="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>
    ${tr ? `<label class="field"><span>What kind of trade</span><select id="sq_k"><option value="swap">Swap: I work their shift, they work mine</option><option value="cover">Cover: they work my shift, I'm off</option></select></label>` : ""}
    <label class="field"><span>${tr ? "My day" : "Day"}</span><input type="date" id="sq_d" value="${esc(d0)}" min="${esc(today())}"></label>
    <p class="muted" id="sq_my" style="font-size:13px;margin:-4px 0 8px"></p>
    ${tr ? `<label class="field"><span>Coworker</span><select id="sq_o"><option value="">Pick someone…</option>${mates.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}</select></label>
      <div id="sq_od"><label class="field"><span>Their day (the shift I'd work)</span><input type="date" id="sq_d2" value="${esc(d0)}" min="${esc(today())}"></label>
      <p class="muted" id="sq_their" style="font-size:13px;margin:-4px 0 8px"></p></div>`
    : `<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1"><span>New start</span><input type="time" id="sq_s" value="09:00"></label><label class="field" style="flex:1"><span>New end</span><input type="time" id="sq_e" value="17:00"></label></div>
      <p class="muted" style="font-size:12px;margin:-4px 0 8px">For a day off, ask for time off instead. A shift that ends after midnight counts on the day it starts.</p>`}
    <label class="field"><span>Note (optional)</span><textarea id="sq_n" style="min-height:56px" maxlength="500"></textarea></label>
    <button class="btn primary wide" id="sq_go">${tr ? "Ask my coworker" : "Send to my manager"}</button><p class="muted" id="sq_m"></p>`;
  const show = async () => {
    $("#sq_my").textContent = "Your shift that day: " + shTxt(await shiftsOn(myId, $("#sq_d").value));
    if(tr){ const sw = $("#sq_k").value === "swap", o = $("#sq_o").value; $("#sq_od").style.display = sw ? "" : "none";
      const nm = (mates.find(m => m.id === o) || {}).name;
      $("#sq_their").textContent = o ? `${nm}'s shift that day: ` + shTxt(await shiftsOn(o, $("#sq_d2").value)) : ""; } };
  ["#sq_d", "#sq_k", "#sq_o", "#sq_d2"].forEach(sel => { const e = $(sel); if(e) e.addEventListener("change", show); }); show();
  $("#tom").classList.add("on"); $("#tox").onclick = () => $("#tom").classList.remove("on");
  $("#sq_go").onclick = async () => {
    const k = tr ? $("#sq_k").value : "change", d = $("#sq_d").value;
    if(!d) return $("#sq_m").textContent = "Pick the day.";
    if(tr && !$("#sq_o").value) return $("#sq_m").textContent = "Pick a coworker.";
    $("#sq_go").disabled = true;
    const r = await sb.rpc("sched_req_add", { p_kind:k, p_day:d, p_shifts:tr ? null : [{ start:$("#sq_s").value, end:$("#sq_e").value }],
      p_other:tr ? $("#sq_o").value : null, p_other_day:k === "swap" ? $("#sq_d2").value || d : null, p_note:$("#sq_n").value });
    $("#sq_go").disabled = false;
    if(r.error) return $("#sq_m").textContent = window.niceErr ? niceErr(r.error) : r.error.message;
    $("#tom").classList.remove("on"); reload(); };
}

/* ---------- Time off (hub_timeoff.sql). Balances + requests are RLS-limited to you, the people you approve, and admins. ---------- */
const TK = { pto:"Paid time off", unpaid:"Unpaid time off", sick:"Sick" };
(() => { if(document.getElementById("sqcss")) return; const st = document.createElement("style"); st.id = "sqcss";
  st.textContent = ".sqpick{display:flex!important;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;margin:0 0 8px;padding:12px 14px;height:auto;white-space:normal}.sqpick b{font-size:15px}.sqpick span{font-size:12.5px;color:var(--muted,#667);font-weight:400}";
  document.head.appendChild(st); })();
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
  : r.hs_status === "skipped" && /no longer used/.test(r.hs_error || "") ? ""
  : r.hs_status === "skipped" ? ` <span class="pill amber" title="${esc(r.hs_error || "")}">Add in Hubstaff by hand</span>` : ` <span class="pill">Going to Hubstaff</span>`;
/* PTO you'll have by a date: hours-worked policies earn hours_per for every hours_worked, at your pace this year, up to the max (estimate) */
function ptoBy(b, pol, by){
  const c = pol.config || {}; if(pol.policy_type !== "hours_worked" || !c.hours_worked || b.worked_ytd == null) return null;
  const t = new Date(), y0 = new Date(t.getFullYear(), 0, 1), wks = Math.max(1, (t - y0) / 6048e5), perWk = b.worked_ytd / wks, ahead = Math.max(0, (D(by) - t) / 6048e5);
  const add = perWk * ahead * c.hours_per / c.hours_worked, cap = c.maximum_to_accrue ? +c.maximum_to_accrue : Infinity;
  return { h:Math.min(cap, balOf(b) + add), perWk, capped:balOf(b) + add > cap, cap };
}
async function timeOff(v){
  v.innerHTML = `<div class="page cal"><p class="muted">Loading…</p></div>`;
  const [ppl, br, pr, rr, ar] = await Promise.all([people(), sb.from("hub_pto_balances").select("*"), sb.from("hub_pto_policies").select("*"),
    sb.from("hub_timeoff_requests").select("*").order("day", { ascending:false }).limit(300), sb.from("hub_timeoff_approvers").select("*").eq("off", false)]);
  const [bor, sqr] = await Promise.all([sb.from("hub_pto_blackouts").select("*").eq("off", false).gte("to_day", today()).order("from_day"),   // hub_pto_rules.sql (2026-11-06)
    sb.rpc("sched_req_list")]);   // hub_sched_adjust.sql (2026-11-06): shift changes + trades
  const sreq = sqr.data || [];
  if(current() !== "cal_off") return;
  const blk = bor.data || [], boDays = b => b.from_day === b.to_day ? fday(b.from_day) : fday(b.from_day) + " – " + fday(b.to_day);
  const myId = (ppl.find(p => p.name === ME.name) || {}).id, who = id => (ppl.find(p => p.id === id) || {}).name || "Someone";
  const bals = br.data || [], pols = pr.data || [], reqs = rr.data || [], pol = id => pols.find(p => p.id === id) || {};
  const myB = shownBals(bals.filter(b => b.user_id === myId), pol), sal = myB.some(b => isSal(pol(b.policy_id))), mine = reqs.filter(r => r.user_id === myId), others = reqs.filter(r => r.user_id !== myId);
  const approver = ME.admin || (ar.data || []).some(a => a.approver === myId), wait = others.filter(r => r.status === "pending");
  const by = ST.ptoBy || (new Date().getFullYear() + "-12-31");
  const balCard = b => { const p = pol(b.policy_id), f = ptoBy(b, p, by), c = p.config || {};
    return `<div class="card"><div class="muted" style="font-size:12.5px">${esc(polName(p))}</div><b class="n">${hrs(balOf(b))}</b>
      ${b.calc_hours != null ? `<div class="muted" style="font-size:11.5px">Worked out by the hub: ${esc(b.calc_note || "")} Hubstaff shows ${hrs(b.hours)}.</div>` : ""}
      <div style="font-size:12.5px">${p.policy_type === "hours_worked" ? `Earns ${esc(c.hours_per)} h for every ${esc(c.hours_worked)} h worked${c.maximum_to_accrue ? `, up to ${esc(c.maximum_to_accrue)} h saved` : ""}. It rolls over and never expires${c.maximum_to_accrue && balOf(b) >= +c.maximum_to_accrue ? `; you're at the max, so you keep all of it and start earning again once you use some` : ""}.`
        : p.policy_type === "annual" ? `${esc(c.hours_per_year)} h a year.` : p.policy_type === "joined_date" ? `${esc(c.hours_per_year)} h a year from your start date.` : ""}</div>
      ${f ? `<div style="font-size:13px;margin-top:6px">By ${esc(fday(by))}: <b>about ${hrs(f.h)}</b>${f.capped ? ` (the ${f.cap} h max)` : ""}<div class="muted" style="font-size:11.5px">Estimate at your pace this year (${Math.round(f.perWk)} h a week worked), if you don't use any.</div></div>` : ""}</div>`; };
  const kl = r => r.kind === "pto" && isSal(pol(r.policy_id)) ? "Salaried time off" : TK[r.kind];
  const reqRow = (r, act) => `<tr><td>${act === "team" || act === "wait" || act === "admin" ? `<b>${esc(who(r.user_id))}</b><br>` : ""}${esc(whenR(r))}</td><td>${hrs(r.hours)}<br><span class="muted">${esc(kl(r))}</span></td>
      <td>${stPill(r)}${hsPill(r)}${r.decided_by && r.status !== "cancelled" ? `<div class="muted" style="font-size:12px">by ${esc(r.decided_by)}${r.response ? ": " + esc(r.response) : ""}</div>` : ""}${r.reason ? `<div class="muted" style="font-size:12px">“${esc(r.reason)}”</div>` : ""}</td>
      <td style="white-space:nowrap">${act === "mine" && r.status === "pending" ? `<button class="btn small" data-cancel="${r.id}">Cancel</button>` : ""}
        ${act === "wait" ? `<button class="btn small primary" data-ok="${r.id}">Approve</button> <button class="btn small" data-no="${r.id}">Deny</button>` : ""}
        ${act === "admin" && r.status === "approved" ? `<button class="btn small" data-no="${r.id}">Change to not approved</button>` : act === "admin" && r.status === "denied" ? `<button class="btn small" data-ok="${r.id}">Change to approved</button>` : ""}
        ${ME.admin && r.status === "approved" && (r.hs_status === "failed" || r.hs_status === "sending") ? `<button class="btn small" data-resend="${r.id}">Send again</button>` : ""}</td></tr>`;
  const table = (rows, act) => rows.length ? `<div class="tow"><table class="to"><tr><th>When</th><th>Hours</th><th>Status</th><th></th></tr>${rows.map(r => reqRow(r, act)).join("")}</table></div>` : `<p class="muted" style="margin:4px 0 0">None.</p>`;
  const teamB = bals.filter(b => b.user_id !== myId), teamIds = [...new Set(teamB.map(b => b.user_id))].sort((x, y) => who(x).localeCompare(who(y)));
  const flagged = teamB.concat(ME.admin ? myB : []).filter(b => b.check_flag);
  const myOrder = myB.slice().sort((x, y) => (pol(x.policy_id).kind === "pto" ? 0 : 1) - (pol(y.policy_id).kind === "pto" ? 0 : 1));
  const teamRow = id => teamB.filter(b => b.user_id === id).sort((x, y) => (pol(y.policy_id).paid ? 1 : 0) - (pol(x.policy_id).paid ? 1 : 0)).map((b, i) =>
    `<tr><td>${i ? "" : `<b>${esc(who(id))}</b>`}</td><td>${esc(pol(b.policy_id).name || "")}</td><td>${hrs(b.hours)}${b.check_flag ? ` <span class="pill amber">Check</span>` : ""}</td><td>${pol(b.policy_id).policy_type === "hours_worked" ? hrs(b.worked_ytd) : ""}</td><td>${b.earned_ytd != null ? hrs(b.earned_ytd) : ""}</td><td>${hrs(b.used_ytd)}</td></tr>`).join("");
  v.innerHTML = `<div class="page cal">
    <div class="chead"><h2>Request time off</h2><button class="btn primary" id="askoff">🗓 Schedule adjustment</button></div>
    ${sqCards(sreq)}
    ${approver && wait.length ? `<div class="card" style="border-left:4px solid var(--amber,#8a5a00)"><b style="font-size:16px">Waiting for you (${wait.length})</b>${table(wait, "wait")}</div>` : ""}
    <div class="card"><b style="font-size:16px">Your balances</b>
      ${myB.length ? `<div style="margin:8px 0;font-size:13px">See what you'll have by <input type="date" id="ptoby" value="${esc(by)}" style="width:auto;display:inline-block;min-height:32px"></div>
        <div class="bal">${myOrder.map(balCard).join("")}</div>`
      : `<p class="muted" style="margin:6px 0 0">You're not set up in Hubstaff time off yet, so there's no balance to show. You can still ask for time off; your manager will see it.</p>`}</div>
    <p class="muted" style="font-size:12.5px;margin:-4px 0 10px">Paid time off is <b>40 hours at most at one time</b> (requests next to each other, or with only a weekend between, add up). ${(hw => hw ? `Hourly PTO counts from ${esc(new Date(hw.config.hub_from + "T12:00").toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }))}, saves up to ${esc(hw.config.maximum_to_accrue)} hours and never expires.` : "PTO rolls over and never expires.")(pols.find(p => p.policy_type === "hours_worked" && (p.config || {}).hub_from))}</p>
    <div class="card"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:16px;flex:1">Blackout dates</b>${ME.admin ? `<button class="btn small" id="boadd">+ Add a blackout</button>` : ""}</div>
      ${blk.length ? `<div class="tow"><table class="to"><tr><th>When</th><th>What</th><th>Blocks</th>${ME.admin ? "<th></th>" : ""}</tr>${blk.map(b => `<tr><td>${esc(boDays(b))}</td><td><b>${esc(b.name)}</b>${b.note ? `<div class="muted" style="font-size:12px">${esc(b.note)}</div>` : ""}</td>
        <td>${b.blocks === "pto" ? `<span class="pill amber">Paid time off</span>` : `<span class="pill red">All time off</span>`}</td>${ME.admin ? `<td style="white-space:nowrap"><button class="btn small" data-boed="${b.id}">Edit</button> <button class="btn small" data-booff="${b.id}">Turn off</button></td>` : ""}</tr>`).join("")}</table></div>`
      : `<p class="muted" style="margin:4px 0 0">No blackout dates coming up.</p>`}</div>
    <div class="card"><b style="font-size:16px">Your requests</b>${table(mine, "mine")}</div>
    ${ME.admin ? (dec => dec.length ? `<div class="card"><b style="font-size:16px">Decided requests</b><p class="muted" style="font-size:12.5px;margin:2px 0 0">You can change anyone's approval or denial. The person gets a Slack DM; if it was already added to Hubstaff, remove it there by hand.</p>${table(dec, "admin")}</div>` : "")(others.filter(r => (r.status === "approved" || r.status === "denied") && r.end_day >= addD(today(), -14)).slice(0, 40))
      : approver && others.some(r => r.status !== "pending") ? `<div class="card"><b style="font-size:16px">Requests you approved or denied</b>${table(others.filter(r => r.status !== "pending" && r.decided_by === ME.name).slice(0, 30), "team")}</div>` : ""}
    <p class="muted" style="font-size:12px">Balances: worked out by the hub from hours worked (hub clock-ins from Nov 1, 2026; Hubstaff tracked hours before) (updated ${esc(bals[0] ? new Date(bals[0].as_of).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "—")}). Approved requests are added to Hubstaff by the hub (paid time off under your PTO policy). Your reason is seen only by you, the person who approves, and Brandon or Kim.</p>
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
      <p class="muted" id="to_bo" style="font-size:12.5px;margin:2px 0 8px">Paid time off: 40 hours at most at one time.</p>
      <button class="btn primary wide" id="to_go">Send to my manager</button><p class="muted" id="to_m"></p>`;
    const boChk = () => { const k = $("#to_k").value, d = $("#to_d").value, e = $("#to_all").checked ? ($("#to_e").value || d) : d;
      const hit = d ? blk.filter(b => b.from_day <= e && b.to_day >= d && (b.blocks === "all" || k === "pto")) : [];
      const mine = blk.filter(b => b.blocks === "all" || k === "pto");   // the blackouts for the type picked (Brandon 2026-11-06)
      $("#to_bo").innerHTML = (hit.length ? `<div style="color:var(--red,#b3261e);margin-bottom:6px">⛔ ${hit.map(b => esc(b.name + " (" + boDays(b) + ")")).join(", ")} is a blackout for ${hit.some(b => b.blocks === "all") ? "time off" : "paid time off"}.</div>` : "")
        + (k === "pto" ? `<div>Paid time off: 40 hours at most at one time.</div>` : "")
        + (mine.length ? `<div style="margin-top:6px"><b>Blackout dates for ${k === "pto" ? "paid time off" : "time off"}:</b></div><ul style="margin:2px 0 0;padding-left:18px">${mine.map(b => `<li>${esc(b.name)}: ${esc(boDays(b))}${k === "pto" && b.blocks === "pto" ? " (paid only; unpaid is OK)" : ""}</li>`).join("")}</ul>`
          : `<div style="margin-top:6px">No blackout dates for ${k === "pto" ? "paid time off" : "time off"} coming up.</div>`); };
    ["#to_k", "#to_d", "#to_e", "#to_all"].forEach(s => $(s).addEventListener("change", boChk)); boChk();
    $("#tom").classList.add("on"); $("#tox").onclick = () => $("#tom").classList.remove("on");
    $("#to_all").onchange = () => { $("#to_hr").style.display = $("#to_all").checked ? "none" : "flex"; };
    $("#to_go").onclick = async () => { const all = $("#to_all").checked, d = $("#to_d").value;
      if(!d) return $("#to_m").textContent = "Pick the first day.";
      const r = await sb.rpc("timeoff_request", { p_kind:$("#to_k").value, p_day:d, p_end_day:all ? ($("#to_e").value || d) : d, p_all_day:all,
        p_start:all ? null : $("#to_s").value, p_end:all ? null : $("#to_f").value, p_reason:$("#to_r").value });
      if(r.error) return $("#to_m").textContent = r.error.message;
      $("#tom").classList.remove("on"); reload(); };
  };
  const boEd = b => { b = b || {};
    $("#tocard").innerHTML = `<div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:20px;flex:1;margin:0">${b.id ? "Change blackout" : "Add a blackout"}</h2><button class="btn small" id="tox" aria-label="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>
      <label class="field"><span>Name (everyone sees it)</span><input id="bo_n" maxlength="120" value="${esc(b.name || "")}" placeholder="e.g. Christmas week"></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1"><span>From</span><input type="date" id="bo_f" value="${esc(b.from_day || "")}"></label><label class="field" style="flex:1"><span>To (last day)</span><input type="date" id="bo_t" value="${esc(b.to_day || "")}"></label></div>
      <label class="field"><span>Blocks</span><select id="bo_b"><option value="all"${b.blocks !== "pto" ? " selected" : ""}>All time off (paid and unpaid)</option><option value="pto"${b.blocks === "pto" ? " selected" : ""}>Paid time off only</option></select></label>
      <label class="field"><span>Note (optional)</span><input id="bo_x" maxlength="500" value="${esc(b.note || "")}"></label>
      <button class="btn primary wide" id="bo_go">Save</button><p class="muted" id="bo_m"></p>`;
    $("#tom").classList.add("on"); $("#tox").onclick = () => $("#tom").classList.remove("on");
    $("#bo_go").onclick = async () => { const r = await sb.rpc("pto_blackout_set", { p_id:b.id || null, p_name:$("#bo_n").value, p_from:$("#bo_f").value || null, p_to:$("#bo_t").value || null,
        p_blocks:$("#bo_b").value, p_note:$("#bo_x").value, p_off:null });
      if(r.error) return $("#bo_m").textContent = niceE(r.error); $("#tom").classList.remove("on"); reload(); }; };
  const niceE = e => window.niceErr ? niceErr(e) : e.message;
  if($("#boadd")) $("#boadd").onclick = () => boEd();
  v.querySelectorAll("[data-boed]").forEach(x => x.onclick = () => boEd(blk.find(b => b.id === +x.dataset.boed)));
  v.querySelectorAll("[data-booff]").forEach(x => x.onclick = () => { const b = blk.find(y => y.id === +x.dataset.booff);
    if(confirm(`Turn off the blackout "${b.name}"? (It's kept, not deleted.)`)) act("pto_blackout_set", { p_id:b.id, p_name:null, p_from:null, p_to:null, p_blocks:null, p_note:null, p_off:true }); });
  const pick = () => {
    $("#tocard").innerHTML = `<div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:20px;flex:1;margin:0">Schedule adjustment</h2><button class="btn small" id="tox" aria-label="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>
      <p class="muted" style="margin:4px 0 10px;font-size:13px">What do you need?</p>
      <button class="btn wide sqpick" data-sq="off"><b>🌴 Time off</b><span>Paid or unpaid time off. Goes to your manager.</span></button>
      <button class="btn wide sqpick" data-sq="change"><b>🕑 Change my shift</b><span>Different times on one of your days. Goes to your manager.</span></button>
      <button class="btn wide sqpick" data-sq="trade"><b>🤝 Trade a shift</b><span>Swap days with a coworker, or ask them to cover your shift. They say yes first, then your manager.</span></button>`;
    $("#tom").classList.add("on"); $("#tox").onclick = () => $("#tom").classList.remove("on");
    $("#tocard").querySelectorAll("[data-sq]").forEach(b => b.onclick = () => b.dataset.sq === "off" ? ask() : sqForm(b.dataset.sq, reload)); };
  v.querySelector("#askoff").onclick = pick;
  sqWire(v, reload);
  if(ST.askOff){ ST.askOff = false; pick(); }
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
      <div class="card"><p class="muted" style="font-size:13px;margin:0 0 8px">The hub works out hourly PTO itself: ${esc(pto[0] ? pol(pto[0].policy_id).config.hours_per + " h for every " + pol(pto[0].policy_id).config.hours_worked + " h worked (hub clock-ins from Nov 1, 2026; Hubstaff tracked hours before)" : "the PTO rate")} since ${esc(pto[0] && pol(pto[0].policy_id).config.hub_from ? new Date(pol(pto[0].policy_id).config.hub_from + "T12:00").toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }) : "the policy started")}, never more than ${esc(pto[0] ? pol(pto[0].policy_id).config.maximum_to_accrue : "the max")} h (it rolls over and never expires), minus PTO used. That is the balance people see and ask against. "Hubstaff balance" is what Hubstaff shows; fix Hubstaff to match if you want them to agree. Salaried: ${esc("80 h a year minus hours used")}.</p>
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

/* ---------- Reports ▸ Team ▸ Work check (hub_work_check.sql, hubstaff_workcheck.py). Brandon 2026-10-29: cloud workers' screens +
   mouse movers; admins see everyone, managers their own team (RLS hub_team_sees). Desktop time only; nothing here is proof on its own. ---------- */
const WCF = { mouse_only:["Mouse only", "An hour or more of mouse movement with no typing. A mouse mover looks like this, but so can reading or scrolling."],
  same_screen:["Same screen", "Screenshots of a screen didn't change for 40+ minutes while activity was counted. A plug-in mouse mover can't change the screen."],
  low_activity:["Low activity", "Under 15% keyboard/mouse activity across 2+ desktop hours."],
  hubstaff_flag:["Hubstaff flag", "Hubstaff's own unusual-activity check flagged this day with medium or high confidence."],
  software_input:["Software input", "Half or more of the mouse/keyboard input that day was made by a program, not a person's hand (Windows marks it). Mouse-mover programs do this; so can some remote-control tools."],
  app_off:["App off", "Clocked in on the hub for 30+ minutes while the Work check app wasn't running on their computer."] };
/* Work check app screenshots + 10-minute activity for one person-day (hub_work_shots / hub_work_slots, RLS hub_team_sees; signed links last 10 min) */
async function wcShots(u, day, name){
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px";
  box.innerHTML = `<div class="card" style="max-width:1100px;width:100%;margin:0"><div class="row" style="justify-content:space-between"><b style="font-size:16px">${esc(name)} · ${esc(fday(day))}</b><button class="btn small" data-x>✕ Close</button></div><p class="muted">Loading…</p></div>`;
  document.body.appendChild(box);
  const close = () => box.remove(); box.onclick = e => { if(e.target === box) close(); }; box.querySelector("[data-x]").onclick = close;
  const a = new Date(day + "T00:00:00"), b = new Date(a.getTime() + 864e5);
  const [sh, sl] = await Promise.all([sb.from("hub_work_shots").select("id,at,screen,path,w,h,gone_at").eq("user_id", u).gte("at", a.toISOString()).lt("at", b.toISOString()).order("at"),
    sb.from("hub_work_slots").select("slot,secs,active_secs,key_secs,mouse_secs,injected,keys,clicks,moves,locked_secs").eq("user_id", u).gte("slot", a.toISOString()).lt("slot", b.toISOString()).order("slot")]);
  const shots = sh.data || [], slots = sl.data || [], live = shots.filter(x => !x.gone_at);
  let urls = {};
  if(live.length){ const r = await sb.storage.from("work-shots").createSignedUrls(live.map(x => x.path), 600); (r.data || []).forEach((x, i) => { if(x.signedUrl) urls[live[i].path] = x.signedUrl; }); }
  const t = s => new Date(s).toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" });
  const bar = s => { const k = Math.round(100 * s.key_secs / s.secs), m = Math.round(100 * s.mouse_secs / s.secs), act = Math.round(100 * s.active_secs / s.secs), ev = s.keys + s.clicks + s.moves, inj = s.injected && ev ? Math.round(100 * s.injected / ev) : 0;
    return `<div title="${t(s.slot)}: activity ${act}% · keyboard ${k}% · mouse ${m}%${inj ? ` · ${inj}% made by software` : ""}${s.locked_secs ? ` · locked ${Math.round(s.locked_secs / 60)} min` : ""}" style="display:inline-flex;flex-direction:column-reverse;width:9px;height:44px;margin-right:2px;background:#eee;vertical-align:bottom"><span style="height:${act * .44}px;background:${inj >= 50 ? "#c62828" : s.key_secs ? "#2e7d32" : "#f9a825"}"></span></div>`; };
  const moments = {}; shots.forEach(x => (moments[x.at.slice(0, 16)] = moments[x.at.slice(0, 16)] || []).push(x));
  const cell = (x, many) => `<div>${x.gone_at ? `<div class="muted sm" style="height:120px;display:grid;place-items:center;background:#f3f3f3;border-radius:8px">Removed after 30 days</div>`
      : urls[x.path] ? `<a href="${urls[x.path]}" target="_blank" rel="noopener"><img src="${urls[x.path]}" loading="lazy" style="width:100%;border-radius:8px;border:1px solid #ddd"></a>` : `<div class="muted sm">Couldn't open it.</div>`}
    <div class="sm muted">${t(x.at)}${many ? " · screen " + (x.screen + 1) : ""}</div></div>`;
  box.firstElementChild.innerHTML = `<div class="row" style="justify-content:space-between"><b style="font-size:16px">${esc(name)} · ${esc(fday(day))}</b><button class="btn small" data-x>✕ Close</button></div>
    <div style="margin:10px 0"><b class="sm">Activity, every 10 minutes</b> <span class="muted sm">(green = typing, amber = mouse only, red = made by software; hover for numbers)</span>
      <div style="overflow-x:auto;white-space:nowrap;padding:6px 0">${slots.map(bar).join("") || `<span class="muted sm">No activity sent that day.</span>`}</div>
      ${slots.length ? `<div class="muted sm">${t(slots[0].slot)} – ${t(new Date(Date.parse(slots[slots.length - 1].slot) + 6e5))}</div>` : ""}</div>
    <b class="sm">Screenshots (${shots.length})</b>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-top:8px">${Object.keys(moments).sort().map(k => moments[k].map(x => cell(x, moments[k].length > 1)).join("")).join("") || `<p class="muted sm">No screenshots that day.</p>`}</div>`;
  box.querySelector("[data-x]").onclick = close;
}
window.workCheck = async function(v){
  css();
  const days = ST.wcDays || 14, only = ST.wcOnly !== false, from = addD(today(), -(days - 1));
  v.innerHTML = `<div class="page cal wide"><p class="muted">Loading…</p></div>`;
  const [ppl, rr] = await Promise.all([people(), sb.from("hub_work_check").select("*").gte("day", from).order("day", { ascending:false })]);
  const who = id => (ppl.find(p => p.id === id) || {}).name || "Someone", all = rr.data || [];
  const rows = all.filter(r => !only || (r.flags || []).length || (r.unusual || []).length);
  const ids = [...new Set(all.map(r => r.user_id))].sort((x, y) => who(x).localeCompare(who(y)));
  const sum = id => { const r = all.filter(x => x.user_id === id && +x.desktop_h > 0), h = r.reduce((a, x) => a + +x.desktop_h, 0);
    const act = h ? Math.round(r.reduce((a, x) => a + (x.activity_pct || 0) * x.desktop_h, 0) / h) : null;
    return `<tr><td><b>${esc(who(id))}</b></td><td>${r.length}</td><td>${hrs(Math.round(h * 10) / 10)}</td><td>${act == null ? "—" : act + "%"}</td>
      <td>${all.filter(x => x.user_id === id && (x.flags || []).length).length || "—"}</td><td>${Math.max(0, ...all.filter(x => x.user_id === id).map(x => x.mouse_only_min || 0))} min</td><td>${Math.max(0, ...all.filter(x => x.user_id === id).map(x => x.same_screen_min || 0))} min</td></tr>`; };
  const pill = f => `<span class="pill ${f === "hubstaff_flag" || f === "same_screen" ? "red" : "amber"}" title="${esc((WCF[f] || [])[1] || "")}">${esc((WCF[f] || [f])[0])}</span>`;
  const row = r => `<tr><td><b>${esc(who(r.user_id))}</b><br><span class="muted">${esc(fday(r.day))}</span></td>
    <td>${hrs(r.desktop_h)}${r.app_off_min ? `<div class="muted" style="font-size:12px">app off ${hrs(Math.round(r.app_off_min / 6) / 10)} while clocked in</div>` : ""}${+r.tracked_h > +r.desktop_h + 0.1 ? `<div class="muted" style="font-size:12px">+${hrs(Math.round((r.tracked_h - r.desktop_h) * 100) / 100)} phone</div>` : ""}</td>
    <td>${r.activity_pct == null ? "—" : r.activity_pct + "%"}<div class="muted" style="font-size:12px">keys ${r.keys_pct ?? "—"}% · mouse ${r.mouse_pct ?? "—"}%</div></td>
    <td>${r.mouse_only_min || 0} min</td><td>${r.same_screen_min || 0} min<div class="muted" style="font-size:12px">${r.shots || 0} shots</div></td>
    <td>${(r.flags || []).map(pill).join(" ") || `<span class="muted">—</span>`}${(r.unusual || []).map(u => `<div style="font-size:12px"><a href="${esc(u.url || "#")}" target="_blank" rel="noopener">Hubstaff: ${esc((u.type || "").replace(/_/g, " "))}</a> <span class="muted">(${esc(u.confidence || "")}, ${u.active_min} of ${u.tracked_min} min active)</span></div>`).join("")}${r.injected_pct ? `<div class="muted" style="font-size:12px">${r.injected_pct}% of input made by software</div>` : ""}</td>
    <td style="white-space:nowrap">${r.source === "hub_app" ? `<button class="btn small" data-wshots="${r.user_id}|${r.day}">Screenshots</button>` : r.hs_url ? `<a class="btn small" href="${esc(r.hs_url)}" target="_blank" rel="noopener">Screenshots ↗</a>` : ""}
      ${r.reviewed_by ? `<div class="muted" style="font-size:12px">Looked at by ${esc(r.reviewed_by)}${r.review_note ? ": " + esc(r.review_note) : ""}</div>` : `<button class="btn small" data-rv="${r.user_id}|${r.day}">Looked at</button>`}</td></tr>`;
  v.innerHTML = `<div class="page cal wide"><div style="padding:0 0 8px"><a href="#/reports">← All reports</a></div>
    <div class="chead"><h2>Work check</h2>
      <span class="vsw">${[7,14,30].map(n => `<button class="btn small${n === days ? " primary" : ""}" data-wd="${n}">${n} days</button>`).join("")}</span>
      <label class="lyr"><input type="checkbox" id="wconly" ${only ? "checked" : ""}>Only days with a flag</label></div>
    <p class="muted" style="margin:0 0 10px">${ME.admin ? "Everyone" : "Your team"} · computer time only; phone time has no keyboard or mouse to measure · source: the Moose Hub Work check app (Hubstaff before Nov 11)${all[0] ? " (updated " + esc(new Date(all[0].as_of).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })) + ")" : ""}</p>
    <div class="card"><b style="font-size:16px">By person, last ${days} days</b><div class="tow"><table class="to"><tr><th>Who</th><th>Days</th><th>Desktop hours</th><th>Activity</th><th>Flagged days</th><th>Longest mouse-only</th><th>Longest same screen</th></tr>
      ${ids.map(sum).join("") || `<tr><td colspan="7" class="muted">Nobody on your team has computer time yet.</td></tr>`}</table></div></div>
    <div class="card"><b style="font-size:16px">${only ? "Days to look at" : "Every day"} (${rows.length})</b>${rows.length ? `<div class="tow"><table class="to"><tr><th>Who / day</th><th>Hours</th><th>Activity</th><th>Mouse only</th><th>Same screen</th><th>Flags</th><th></th></tr>${rows.map(row).join("")}</table></div>` : `<p class="muted" style="margin:4px 0 0">Nothing flagged in the last ${days} days.</p>`}</div>
    <div class="card"><b style="font-size:16px">What the checks mean</b>${Object.values(WCF).map(([l, d]) => `<div style="font-size:13px;margin:4px 0"><b>${esc(l)}:</b> ${esc(d)}</div>`).join("")}
      <p class="muted" style="font-size:12px;margin:6px 0 0">A flag is a reason to look at the screenshots, not proof. Screenshots from the Work check app are private (the person, their manager and Brandon/Kim) and removed after 30 days; older Hubstaff days link to Hubstaff.</p></div></div>`;
  v.querySelectorAll("[data-wd]").forEach(b => b.onclick = () => { ST.wcDays = +b.dataset.wd; workCheck(v); });
  v.querySelector("#wconly").onchange = e => { ST.wcOnly = e.target.checked; workCheck(v); };
  v.querySelectorAll("[data-wshots]").forEach(b => b.onclick = () => { const [u, d] = b.dataset.wshots.split("|"); wcShots(u, d, who(u)); });
  v.querySelectorAll("[data-rv]").forEach(b => b.onclick = async () => { const [u, d] = b.dataset.rv.split("|"), note = prompt("Note (optional):");
    if(note === null) return; const r = await sb.rpc("work_check_review", { p_user:u, p_day:d, p_note:note }); if(r.error) alert(r.error.message); else workCheck(v); });
};

/* ---------- Home: your next 7 days (meetings you can open, office events, your own events) ---------- */
window.calHomeCard = async function(el){
  if(!el) return; css();
  const t = today(), b = addD(t, 6);
  const [ms, evs, ppl, tw, hm, olr] = await Promise.all([meetings(true), events(t, b), people(), sb.from("hub_timeoff_requests").select("user_id").eq("status", "pending"), sb.rpc("meet_mine", { p_from:t, p_to:b }), sb.rpc("ms_cal_mine", { p_from:t, p_to:b })]);
  const J = u => u ? ` <a class="btn small primary" style="padding:2px 9px;min-height:0" href="${esc(u)}" target="_blank" rel="noopener noreferrer">💻 Join</a>` : "";
  const olAll = ((olr && olr.data) || []).filter(o => !o.cancelled), nt = x => (x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const lk = {}; { const ids = evs.filter(e => e.virtual).map(e => e.id); if(ids.length){ const lr = await sb.rpc("cal_links", { p_ids:ids }); ((lr && lr.data) || []).forEach(x => lk[x.event_id] = x.url); } }
  const myId = (ppl.find(p => p.name === ME.name) || {}).id, nWait = ((tw && tw.data) || []).filter(r => r.user_id !== myId).length;
  const rows = [];
  ms.forEach(m => occurs(m, t, b).forEach(s => { const w = mAt(m, s); rows.push({ d:s, t:w.start || "", h:`<a href="#/${m.meet}"><b>${esc(NAMES[m.meet])} meeting</b></a>${w.start ? " · " + ftime(w.start) : ""}${mvTo(m, s) ? ` <span class="pill amber">moved</span>` : ""}${m.open_tasks ? ` <span class="muted">· ${m.open_tasks} open task${m.open_tasks === 1 ? "" : "s"}</span>` : ""}${J(m.link)}` }); }));
  evs.filter(e => (e.kind || "event") === "event").forEach(e => { for(let s = e.day < t ? t : e.day; s <= (e.end_day || e.day) && s <= b; s = addD(s, 1))
    rows.push({ d:s, t:(e.start_time || "").slice(0, 5), k:s + nt(e.title), h:`${e.cal === "office" ? `<span class="pill amber">Office</span> ` : ""}${esc(e.title)}${e.start_time ? " · " + ftime(e.start_time.slice(0, 5)) : ""}${J(lk[e.id])}` }); });
  ((hm && hm.data) || []).filter(m => m.status === "on").forEach(m => { const inv = (m.staff || []).includes(myId) && !m.mine, a = inv ? (m.my_answer || {}).answer : null;
    rows.push({ d:m.day, t:m.start, h:`<a href="#/cal_me/m${m.id}"><b${a === "no" ? ' style="text-decoration:line-through"' : ""}>${m.virtual === false ? "👥" : "📹"} ${esc(m.title)}</b></a> · ${ftime(m.start)}${inv && !a ? ` <span class="pill amber">Answer</span>` : ""}${J(m.zoom_join)}` }); });
  const seen = new Set(rows.map(r => r.k).filter(Boolean)), oWait = o => !o.is_organizer && (!o.response || o.response === "none" || o.response === "notResponded");
  olAll.filter(o => o.response !== "declined" && !seen.has(o.day + nt(o.title))).forEach(o => rows.push({ d:o.day, t:o.start_time || "", h:`<a href="#/cal_me"><b>${esc(o.title)}</b></a>${o.start_time ? " · " + ftime(o.start_time.slice(0, 5)) : ""}${oWait(o) ? ` <span class="pill amber">Answer</span>` : ""}${J(o.join_url)}` }));
  const nInv = olAll.filter(o => oWait(o) && o.day >= t).length;
  rows.sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t));
  el.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><b style="font-size:17px">🗓️ Your week</b><a class="btn small" style="margin-left:auto" href="#/cal_me">Calendar</a></div>
    ${nInv ? `<a href="#/cal_me" class="pill amber" style="display:inline-block;margin:6px 6px 6px 0;text-decoration:none">❔ ${nInv} meeting invite${nInv === 1 ? "" : "s"} waiting for your answer</a>` : ""}
    ${nWait ? `<a href="#/cal_off" class="pill amber" style="display:inline-block;margin:6px 0;text-decoration:none">🌴 ${nWait} time-off request${nWait === 1 ? "" : "s"} waiting for you</a>` : ""}
    <div class="calwk">${rows.length ? rows.map(r => `<div class="it"><span class="d">${r.d === t ? "Today" : esc(fday(r.d))}</span><span style="flex:1">${r.h}</span></div>`).join("") : `<p class="muted">Nothing on your calendar in the next 7 days.</p>`}</div>`;
};
})();
