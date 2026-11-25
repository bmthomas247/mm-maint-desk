/* hubcal.js — the hub calendar, rebuilt 2026-11-24 (Jeff: "fully revamp the WHOLE CALENDAR in the HUB it needs to work and sync so much
   better ... KIM uses it the most"). Owns Calendar ▸ Reservations / Office / Personal (#/cal_res, #/cal_office, #/cal_me; hub.html routes them
   here). calendar.js still owns Calendar ▸ Meetings tiles (#/cal_meet), Request Time Off (#/cal_off), the PTO + Work check reports and the
   Home cards ("Your week", "starting soon").
   Jeff's picks 2026-11-24: no Outlook (the hub is the only calendar), repeating events, reminders (bell + optional Slack DM), print,
   everyone gets it at once.
   What's new vs calendar.js: big ‹ › arrows + ← → keys + swipe, the week fills the screen with ONE scroll (the toolbar never scrolls away),
   staff shifts shown as "👥 8 working" on each day instead of 6–9 lines per day, click an empty time = quick add right there, click an event =
   a small card (Edit / Duplicate / Delete), repeating events, reminders, print, find, live updates (someone else's change shows by itself).
   Data: hub_cal_events (RLS: office = everyone with Calendar, personal = only you; repeats are real rows made by hub_calendar_v2.sql),
   cal_event_save5 (the only save), cal_series_info, cal_meetings, cal_office, timeoff_calendar, meet_mine, cal_stays, cal_people,
   cal_links, cal_guests, cal_reminders_mine (bell). Uses hub.html's sb, $, esc, ME, current, MM_CONFIG, mmConfirm/mmAlert/mmAsk, niceErr.
   Deep links: #/cal_me/e<event id> · #/cal_office/e<event id> (open that event) · #/cal_me/m<meeting id> (a coworker meeting). */
(function(){
"use strict";
if(window.hubCal) return;

const NAMES = { meet_maint:"Monday maintenance", meet_or:"Owner Relations", meet_bd:"Business Development", meet_kd:"Key Data", meet_beyond:"Beyond Pricing", meet_mgr:"Managers", meet_fd:"Office Staff Monthly", meet_track:"Track Business Review", meet_trackmk:"Track Digital Marketing" };
const TABS = [["cal_res","Reservations"],["cal_office","Office"],["cal_me","Personal"],["cal_meet","Meetings"]];
const VIEWS = [["day","Day"],["work","Work week"],["week","Week"],["month","Month"],["list","Agenda"]];
const MGR = ["owner_relations","maint_manager","office_manager","hk_manager"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const HPX = 48, LISTN = 30;
const LAYERS = {
  cal_office:[["events","Work events","c-ev"],["meet","Staff meetings","c-mt"],["people","Out & time off","c-out"],["work","Who's working","c-wk"],["stays","Check-ins","c-st"]],
  cal_me:[["mine","My events","c-me"],["meet","My meetings","c-mt"],["office","All office events","c-ev"],["off","My time off","c-out"],["stays","Check-ins","c-st"]],
  cal_res:[["arr","Check-ins","c-st"],["dep","Check-outs","c-dp"],["own","Owner stays","c-own"]]
};
const LAYER_ON = { events:true, meet:true, people:true, work:true, stays:false, mine:true, office:false, off:true, arr:true, dep:true, own:true };
const REM = [[0,"At the start"],[5,"5 min before"],[10,"10 min before"],[15,"15 min before"],[30,"30 min before"],[60,"1 hour before"],[120,"2 hours before"],[1440,"1 day before"],[2880,"2 days before"],[10080,"1 week before"]];
const remTxt = m => (REM.find(x => x[0] === m) || [m, m + " min before"])[1];

/* ---------- small helpers ---------- */
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const D = s => new Date(s + "T12:00");
const addD = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
const addM = (s, n) => { const d = D(s.slice(0, 7) + "-01"); d.setMonth(d.getMonth() + n); return ymd(d); };
const today = () => ymd(new Date());
const weekStart = s => addD(s, -D(s).getDay());   // weeks start Sunday (Brandon 2026-10-29)
const dif = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const daysOf = (a, b) => { const o = []; for(let d = a; d <= b && o.length < 400; d = addD(d, 1)) o.push(d); return o; };
const fday = s => D(s).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
const flong = s => D(s).toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" });
const fyear = s => D(s).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric", year:"numeric" });
const ftime = t => { if(!t) return ""; const [h, m] = String(t).slice(0, 5).split(":").map(Number); return (h % 12 || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + (h < 12 ? " am" : " pm"); };
const fshort = t => ftime(t).replace(" am", "a").replace(" pm", "p");
const fhour = h => (h % 12 || 12) + (h < 12 || h === 24 ? " AM" : " PM");
const toMin = t => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + (m || 0); };
const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const endTime = (t, min) => hhmm(Math.min(toMin(t) + min, 23 * 60 + 59));
const frange = (s, e) => s ? ftime(s) + (e ? " – " + ftime(e) : "") : "All day";
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const nice = e => (window.niceErr ? niceErr(e) : String((e && e.message) || e || "Something went wrong"));
const html = s => esc(s);
const boss = () => !!(ME && (ME.admin || (ME.teams || []).some(t => MGR.includes(t))));
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th","st","nd","rd"][n % 10] || "th");
const nthOf = s => Math.ceil(D(s).getDate() / 7);
const isLastWd = s => D(addD(s, 7)).getMonth() !== D(s).getMonth();
const ask = (t, o) => window.mmConfirm ? mmConfirm(t, o) : Promise.resolve(confirm(t));
const say = (t, o) => window.mmAlert ? mmAlert(t, o) : Promise.resolve(alert(t));
const askTxt = (t, v) => window.mmAsk ? mmAsk(t, v) : Promise.resolve(prompt(t, v));

/* ---------- state ---------- */
const C = { k:null, v:null, tabs:{}, prefs:null, people:null, meets:null, meetsAt:0, cache:new Map(), tok:0, rt:null, rtT:null, poll:null, dirty:false, open:null, adOpen:false };
const T = k => C.tabs[k] || (C.tabs[k] = { sel:today(), view:null, mini:null, data:null, items:null });

async function prefs(){
  if(C.prefs) return C.prefs;
  let p = {}; try { p = (await sb.rpc("cal_prefs_get")).data || {}; } catch(e){}
  C.raw = p; C.prefs = Object.assign({ view:{}, layers:{}, side:true }, p.hc || {});
  return C.prefs;
}
let saveT = null;
function savePrefs(){ clearTimeout(saveT); saveT = setTimeout(() => { const p = Object.assign({}, C.raw || {}, { hc:C.prefs });
  sb.rpc("cal_prefs_set", { p }).then(r => { if(r.error) toast("Couldn't save your calendar setup: " + nice(r.error)); else C.raw = p; }); }, 500); }
const phone = () => window.innerWidth < 760;
function defView(k){ const v = C.prefs.view[k]; if(v && VIEWS.some(x => x[0] === v)) return phone() && v !== "list" && v !== "day" ? "list" : v; return phone() ? "list" : "week"; }
const layerOn = (k, l) => { const x = (C.prefs.layers[k] || {})[l]; return x == null ? LAYER_ON[l] : !!x; };

async function people(){ if(C.people) return C.people; const r = await sb.rpc("cal_people"); C.people = (r && r.data) || []; return C.people; }
async function allMeetings(force){ if(C.meets && !force && Date.now() - C.meetsAt < 300000) return C.meets; const r = await sb.rpc("cal_meetings"); C.meets = (r && r.data) || []; C.meetsAt = Date.now(); return C.meets; }
const myId = () => ((C.people || []).find(p => p.name === (ME && ME.name)) || {}).id || null;
const nameOf = id => ((C.people || []).find(p => p.id === id) || {}).name || "Someone";
const first = id => nameOf(id).split(" ")[0];

/* staff meetings: dates between a and b from the schedule row (+ one-off moves/skips), same rules as calendar.js / meeting_on() */
function occReg(m, a, b){
  if(m.nth){ const out = [];
    for(let f = new Date(D(a).getFullYear(), D(a).getMonth(), 1, 12); ymd(f) <= b; f = new Date(f.getFullYear(), f.getMonth() + 1, 1, 12)){
      const x = new Date(f); x.setDate(1 + (m.dow - x.getDay() + 7) % 7 + (m.nth - 1) * 7); const s = ymd(x);
      if(x.getMonth() === f.getMonth() && s >= a && s <= b && (!m.anchor || s >= m.anchor) && (!m.until || s <= m.until)) out.push(s); }
    return out; }
  const out = []; let d = D(a); d.setDate(d.getDate() + (m.dow - d.getDay() + 7) % 7);
  for(; ymd(d) <= b; d.setDate(d.getDate() + 7)){ const s = ymd(d);
    if((m.anchor && s < m.anchor) || (m.until && s > m.until)) continue;
    if(m.every === 14 && m.anchor){ const n = Math.round((D(s) - D(m.anchor)) / 864e5); if(n < 0 || n % 14) continue; }
    out.push(s); }
  return out;
}
function occurs(m, a, b){ const out = occReg(m, a, b), mv = m.moves || []; if(!mv.length) return out;
  const gone = new Set(mv.map(x => x.from)), r = out.filter(s => !gone.has(s));
  mv.forEach(x => { if(x.kind === "move" && x.to >= a && x.to <= b && !r.includes(x.to)) r.push(x.to); }); return r.sort(); }
const mvTo = (m, s) => (m.moves || []).find(x => x.kind === "move" && x.to === s);
const mAt = (m, s) => { const x = mvTo(m, s); return x && x.start ? { start:x.start, minutes:x.minutes || m.minutes } : { start:m.start, minutes:m.minutes }; };

/* ---------- ranges ---------- */
function rangeOf(k){ const t = T(k), s = t.sel;
  if(k === "cal_res" && t.view === "work"){ const w = weekStart(s); return [addD(w, 1), addD(w, 5)]; }
  if(t.view === "day") return [s, s];
  if(t.view === "work"){ const w = weekStart(s); return [addD(w, 1), addD(w, 5)]; }
  if(t.view === "week"){ const w = weekStart(s); return [w, addD(w, 6)]; }
  if(t.view === "month"){ const a = weekStart(s.slice(0, 7) + "-01"), last = addD(addM(s, 1), -1); return [a, addD(weekStart(last), 6)]; }
  return [s, addD(s, LISTN - 1)]; }
function stepSel(k, n){ const t = T(k);
  if(t.view === "day"){ t.sel = addD(t.sel, n); }
  else if(t.view === "month"){ t.sel = addM(t.sel, n); if(t.sel.slice(0, 7) === today().slice(0, 7)) t.sel = today(); }
  else if(t.view === "list"){ t.sel = addD(t.sel, n * 7); }
  else { t.sel = addD(t.sel, 7 * n); }
  t.mini = null; }
const stepWord = (k, n) => { const v = T(k).view; return (n < 0 ? "Previous " : "Next ") + (v === "day" ? "day" : v === "month" ? "month" : "week"); };
function titleOf(k){ const t = T(k), [a, b] = rangeOf(k), A = D(a), B = D(b);
  if(t.view === "day") return A.toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  if(t.view === "month") return MONL[D(t.sel).getMonth()] + " " + D(t.sel).getFullYear();
  if(A.getMonth() === B.getMonth()) return `${MONL[A.getMonth()]} ${A.getDate()} – ${B.getDate()}, ${B.getFullYear()}`;
  return `${MONS[A.getMonth()]} ${A.getDate()}${A.getFullYear() !== B.getFullYear() ? ", " + A.getFullYear() : ""} – ${MONS[B.getMonth()]} ${B.getDate()}, ${B.getFullYear()}`; }

/* ---------- data ---------- */
async function pages(mk){ const out = [];
  for(let i = 0; i < 8; i++){ const r = await mk().range(i * 1000, i * 1000 + 999); if(r.error) throw r.error; out.push(...(r.data || [])); if(!r.data || r.data.length < 1000) break; }
  return out; }
async function loadData(k, a, b){
  const isRes = k === "cal_res", isOff = k === "cal_office", isMe = k === "cal_me";
  const wantStays = isRes || layerOn(k, "stays");
  const rpc = (f, p) => sb.rpc(f, p).then(r => { if(r.error) throw r.error; return r.data; });
  const [evs, ms, ppl, sr, ox, tor, hm] = await Promise.all([
    isRes ? [] : pages(() => sb.from("hub_cal_events").select("*").eq("off", false).lte("day", b).or(`end_day.gte.${a},and(end_day.is.null,day.gte.${a})`).order("day").order("start_time", { nullsFirst:true }).order("id")),
    isRes ? [] : allMeetings(),
    people(),
    wantStays ? rpc("cal_stays", { p_from:a, p_to:b }).catch(() => null) : null,
    isOff ? rpc("cal_office", { p_from:a, p_to:b }) : null,
    isRes ? [] : rpc("timeoff_calendar", { p_from:a, p_to:b }).catch(() => []),
    isMe ? rpc("meet_mine", { p_from:a, p_to:b }).catch(() => []) : []]);
  const vids = evs.filter(e => e.virtual).map(e => e.id), eids = evs.filter(e => (e.kind || "event") === "event").map(e => e.id), sids = [...new Set(evs.map(e => e.series_id).filter(Boolean))];
  const [lr, gr, si] = await Promise.all([vids.length ? sb.rpc("cal_links", { p_ids:vids }) : null, eids.length ? sb.rpc("cal_guests", { p_ids:eids }) : null, sids.length ? sb.rpc("cal_series_info", { p_ids:sids }) : null]);
  const links = {}, guests = {}, series = {};
  ((lr && lr.data) || []).forEach(x => links[x.event_id] = x.url);
  ((gr && gr.data) || []).forEach(x => guests[x.event_id] = x.guests || []);
  ((si && si.data) || []).forEach(x => series[x.series_id] = x);
  return { a, b, evs, ms:ms || [], ppl:ppl || [], stays:(sr && sr.stays) || [], resSrc:(sr && sr.source) || "", owners:!!(sr && sr.owners),
    ox:ox || { meetings:[], shifts:[], off:[] }, tor:tor || [], hm:(hm || []).filter(m => m.status === "on"), links, guests, series, at:Date.now() };
}

/* ---------- items: everything that shows on a day, in one shape ---------- */
const canEdit = e => !!e && (e.cal === "personal" ? e.owner_id === myId() || !e.owner_id : boss() || ((e.kind || "event") !== "event" && e.person_id === myId()));
function buildItems(k, d){
  const isOff = k === "cal_office", isMe = k === "cal_me", isRes = k === "cal_res", me = myId(), t = today(), nm = nowMin();
  const map = {}, ids = {}, add = (s, it) => { if(s < d.a || s > d.b) return; (map[s] = map[s] || []).push(it); ids[it.id] = it; };
  const past = (s, fin) => s < t || (s === t && fin && toMin(fin) < nm);
  const extra = { work:{}, out:{}, stays:{} };   // per day: who's working / out (Office badges) and check-ins (summary chip)
  const mark = (bag, s, uid, info) => { if(s < d.a || s > d.b) return; const b = bag[s] = bag[s] || {}; if(!b[uid]) b[uid] = info || {}; };
  if(!isRes){
    // events
    d.evs.forEach(e => { const kd = e.kind || "event";
      if(isOff && e.cal !== "office") return;
      if(isMe && e.cal === "office" && kd !== "event") return;
      const going = e.cal === "office" && (e.attendees || []).includes(me);
      let lyr = isOff ? (kd === "event" ? "events" : kd === "out" ? "people" : "work") : (e.cal === "personal" || going ? "mine" : "office");
      if(kd === "out") (function(){ for(let s = e.day; s <= (e.end_day || e.day); s = addD(s, 1)) mark(extra.out, s, e.person_id, { why:e.title && !/^out$/i.test(e.title) ? e.title : "", start:e.start_time, end:e.end_time }); })();
      if(kd === "working") (function(){ for(let s = e.day; s <= (e.end_day || e.day); s = addD(s, 1)) mark(extra.work, s, e.person_id, { start:e.start_time, end:e.end_time, mark:true }); })();
      if(!layerOn(k, lyr) || kd === "working") return;
      const ttl = kd === "event" ? e.title : "Out · " + nameOf(e.person_id) + (e.title && !/^out$/i.test(e.title) ? " · " + e.title : "");
      const sub = [e.virtual ? "💻 Virtual" : e.location || "", kd === "event" && e.cal === "office" && (e.attendees || []).length ? (e.attendees || []).map(first).join(", ") : "",
        (d.guests[e.id] || []).length ? "with " + d.guests[e.id].map(g => g.name).join(", ") : ""].filter(Boolean).join(" · ");
      const multi = e.end_day && e.end_day > e.day;
      const it = { id:"e" + e.id, type:"event", ev:e, day:e.day, start:multi ? null : (e.start_time ? e.start_time.slice(0, 5) : null), fin:multi ? null : (e.end_time ? e.end_time.slice(0, 5) : null),
        title:ttl, sub, cls:kd === "out" ? "c-out" : e.cal === "personal" ? "c-me" : "c-ev", rep:!!e.series_id, join:d.links[e.id] || null, edit:canEdit(e), bell:(e.remind || []).length > 0,
        span:multi ? { a:e.day, b:e.end_day, st:e.start_time, en:e.end_time } : null };
      for(let s = e.day; s <= (e.end_day || e.day); s = addD(s, 1)) add(s, Object.assign({}, it, { onDay:s, past:past(s, it.fin) && (!multi || s === e.end_day) }));
    });
    // staff meetings
    if(layerOn(k, "meet")){
      if(isOff) (d.ox.meetings || []).forEach(m => { const meta = d.ms.find(x => x.meet === m.meet) || {};
        add(m.day, { id:"s:" + (m.meet || "x") + ":" + m.day + ":" + m.start, type:"staff", meet:m.meet, day:m.day, start:m.start, fin:m.end, title:m.meet ? (NAMES[m.meet] || m.meet) + " meeting" : "In a meeting",
          sub:(m.people || []).map(first).join(", "), people:m.people || [], cls:"c-mt", join:m.meet ? meta.link || null : null, past:past(m.day, m.end), meta }); });
      if(isMe) d.ms.filter(m => m.can !== false && m.start).forEach(m => occurs(m, d.a, d.b).forEach(s => { const w = mAt(m, s), fin = w.minutes ? endTime(w.start, w.minutes) : null;
        add(s, { id:"s:" + m.meet + ":" + s, type:"staff", meet:m.meet, day:s, start:w.start, fin, title:(NAMES[m.meet] || m.meet) + " meeting", sub:mvTo(m, s) ? "moved this week" : "", cls:"c-mt", join:m.link || null, past:past(s, fin), meta:m }); }));
      if(isMe) d.hm.forEach(m => { const inv = (m.staff || []).includes(me) && !m.mine, a = inv ? (m.my_answer || {}).answer : null, fin = endTime(m.start, m.minutes);
        add(m.day, { id:"m" + m.id, type:"meet", hm:m, day:m.day, start:m.start, fin, title:(inv && !a ? "❔ " : a === "no" ? "Declined · " : "") + (m.virtual === false ? "👥 " : "📹 ") + m.title,
          sub:[m.guest_name ? "booked by " + m.guest_name : "", m.host_id !== me ? "host " + String(m.host || "").split(" ")[0] : "", m.virtual === false && m.location ? m.location : "", inv && !a ? "waiting for your answer" : ""].filter(Boolean).join(" · "),
          cls:"c-hm" + (a === "no" ? " dec" : ""), join:m.zoom_join || null, edit:!!(m.mine || (ME && ME.admin)), past:past(m.day, fin) }); });
    }
    // time off (hub requests) + the old Hubstaff list in cal_office
    const tor = d.tor.filter(r => isOff || r.user_id === me), seen = new Set();
    tor.forEach(r => { for(let s = r.day; s <= r.end_day; s = addD(s, 1)){ seen.add(r.user_id + "|" + s);
      if(r.status === "approved") mark(extra.out, s, r.user_id, { why:"time off", start:r.start, end:r.end });
      if(layerOn(k, isOff ? "people" : "off")) add(s, { id:"t" + r.id + ":" + s, type:"off", day:s, start:null, fin:null, uid:r.user_id, req:r.status === "pending",
        title:(r.status === "pending" ? "Asked off · " : "Time off · ") + (isMe ? "you" : nameOf(r.user_id)) + (r.start ? " " + fshort(r.start) + "–" + fshort(r.end) : ""), cls:"c-out" + (r.status === "pending" ? " req" : ""), href:"#/cal_off" }); } });
    if(isOff) (d.ox.off || []).forEach(x => { if(seen.has(x.user_id + "|" + x.day)) return; mark(extra.out, x.day, x.user_id, { why:"time off", start:x.start, end:x.end });
      if(layerOn(k, "people")) add(x.day, { id:"h" + x.user_id + ":" + x.day, type:"off", day:x.day, start:null, uid:x.user_id, title:"Time off · " + nameOf(x.user_id), cls:"c-out", href:"#/cal_office" }); });
    if(isOff) (d.ox.shifts || []).forEach(x => mark(extra.work, x.day, x.user_id, { start:x.start, end:x.end }));
  }
  // stays (Reservations tab, or the Check-ins layer)
  (d.stays || []).forEach(x => {
    if(isRes){
      if(layerOn(k, "arr") && (layerOn(k, "own") || !x.owner)) add(x.in, { id:"ri" + x.unit + x.in, type:"stay", stay:x, day:x.in, start:null, title:(x.owner ? "Owner · " : "") + x.unit + (x.guest ? " · " + x.guest : ""), cls:x.owner ? "c-own" : "c-st", dir:"in" });
      if(layerOn(k, "dep") && (layerOn(k, "own") || !x.owner)) add(x.out, { id:"ro" + x.unit + x.out, type:"stay", stay:x, day:x.out, start:null, title:(x.owner ? "Owner · " : "") + x.unit, cls:"c-dp", dir:"out" });
    } else if(x.in >= d.a && x.in <= d.b){ (extra.stays[x.in] = extra.stays[x.in] || []).push(x); }
  });
  if(!isRes) Object.keys(extra.stays).forEach(s => { const L = extra.stays[s]; add(s, { id:"ci" + s, type:"checkins", day:s, start:null, list:L, title:"🏠 " + L.length + " check-in" + (L.length === 1 ? "" : "s"), cls:"c-st" }); });
  Object.values(map).forEach(L => L.sort((x, y) => (x.start ? 1 : 0) - (y.start ? 1 : 0) || String(x.start || "").localeCompare(String(y.start || "")) || (x.type === "checkins") - (y.type === "checkins") || x.title.localeCompare(y.title)));
  return { map, ids, extra };
}
const I = s => ((T(C.k).items || {}).map || {})[s] || [];

/* ---------- CSS ---------- */
const HCCSS = `
.hc{display:flex;flex-direction:column;min-height:0;flex:1;padding:14px 18px 10px;max-width:none;width:100%;margin:0;overflow:hidden}
.hc button{font:inherit}
.hc .hc-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}
.hc .hc-tabs{display:flex;gap:4px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px}
.hc .hc-tabs a{padding:7px 14px;border-radius:10px;text-decoration:none;color:var(--ink-2);font-weight:700;font-size:14px}
.hc .hc-tabs a.on{background:var(--forest);color:#fff} .hc .hc-tabs a:not(.on):hover{background:var(--ground)}
.hc .hc-sp{flex:1}
.hc .hc-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}
.hc .hc-today{min-height:42px;padding:0 16px;border-radius:12px;border:1px solid var(--line-2);background:var(--card);font-weight:800;color:var(--ink);cursor:pointer}
.hc .hc-arw{width:46px;height:46px;border-radius:50%;border:1px solid var(--line-2);background:var(--card);display:grid;place-items:center;cursor:pointer;color:var(--forest);flex:none;padding:0}
.hc .hc-arw:hover,.hc .hc-today:hover{background:var(--moose-soft);border-color:var(--forest-2)}
.hc .hc-arw svg{width:26px;height:26px}
.hc .hc-title{font-size:22px;font-weight:800;color:var(--ink);background:none;border:0;padding:4px 8px;border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:6px;min-height:42px}
.hc .hc-title:hover{background:var(--card)} .hc .hc-title small{font-size:14px;color:var(--muted)}
.hc .hc-views{display:inline-flex;border:1px solid var(--line-2);border-radius:12px;overflow:hidden;background:var(--card)}
.hc .hc-views button{border:0;background:none;padding:0 13px;min-height:40px;font-weight:700;font-size:13.5px;color:var(--ink-2);cursor:pointer;border-left:1px solid var(--line)}
.hc .hc-views button:first-child{border-left:0} .hc .hc-views button.on{background:var(--forest);color:#fff}
.hc .hc-ic{width:42px;height:42px;border-radius:12px;border:1px solid var(--line-2);background:var(--card);cursor:pointer;font-size:17px;display:grid;place-items:center;padding:0;color:var(--ink-2)}
.hc .hc-ic:hover{background:var(--moose-soft)} .hc .hc-ic.on{background:var(--moose-soft);border-color:var(--forest-2)}
.hc .hc-new{min-height:42px;border-radius:12px;background:var(--forest);color:#fff;border:0;font-weight:800;padding:0 16px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.hc .hc-new:hover{filter:brightness(1.08)} .hc .hc-sec{min-height:42px;border-radius:12px;border:1px solid var(--line-2);background:var(--card);font-weight:700;padding:0 13px;cursor:pointer;color:var(--ink)}
.hc .hc-upd{font-size:12px;color:var(--muted);min-width:70px;text-align:right}
.hc .hc-leg{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px;align-items:center}
.hc .hc-lg{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:13px;font-weight:700;cursor:pointer;color:var(--ink-2);user-select:none}
.hc .hc-lg i{width:11px;height:11px;border-radius:3px;display:inline-block;border:2px solid currentColor}
.hc .hc-lg.on i{background:currentColor} .hc .hc-lg:not(.on){opacity:.55} .hc .hc-lg:not(.on) span{text-decoration:line-through}
.hc .hc-main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px}
.hc .hc-main.noside{grid-template-columns:minmax(0,1fr)}
.hc .hc-cal{min-height:0;display:flex;flex-direction:column;position:relative}
.hc .hc-side{min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-bottom:10px}
.hc .hc-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px}
.hc .hc-card h4{margin:0 0 6px;font-size:14.5px}
.hc .hc-busy{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-weight:700;background:color-mix(in srgb,var(--ground) 60%,transparent);z-index:20;border-radius:16px}
/* colors */
.hc-root .c-ev{--c:#3c7a17;--cb:#e9f4dc} .hc-root .c-me{--c:#6a43b5;--cb:#efe8fb} .hc-root .c-mt{--c:#2463a0;--cb:#e3edf8} .hc-root .c-hm{--c:#2f4fb8;--cb:#e6eafb}
.hc-root .c-out{--c:#c8382b;--cb:#fbe7e4} .hc-root .c-wk{--c:#5b8a1e;--cb:#eef5e0} .hc-root .c-st{--c:#b5770a;--cb:#fbf0d9} .hc-root .c-dp{--c:#6b776f;--cb:#eef1ec} .hc-root .c-own{--c:#8a4b12;--cb:#f6e6d6}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) .hc-root .c-ev{--c:#a6d46a;--cb:#1f3112} :root:not([data-theme="light"]) .hc-root .c-me{--c:#c4a8ff;--cb:#2a2140}
  :root:not([data-theme="light"]) .hc-root .c-mt{--c:#8fc0f2;--cb:#13283d} :root:not([data-theme="light"]) .hc-root .c-hm{--c:#a9b8ff;--cb:#1b2242} :root:not([data-theme="light"]) .hc-root .c-out{--c:#ff9a8f;--cb:#3a1714}
  :root:not([data-theme="light"]) .hc-root .c-wk{--c:#bde27e;--cb:#1e2a10} :root:not([data-theme="light"]) .hc-root .c-st{--c:#f2c46b;--cb:#33270c} :root:not([data-theme="light"]) .hc-root .c-dp{--c:#b8c6bc;--cb:#223028} :root:not([data-theme="light"]) .hc-root .c-own{--c:#f0b27a;--cb:#3a2614} }
.hc .hc-lg.c-ev,.hc .hc-lg.c-me,.hc .hc-lg.c-mt,.hc .hc-lg.c-hm,.hc .hc-lg.c-out,.hc .hc-lg.c-wk,.hc .hc-lg.c-st,.hc .hc-lg.c-dp,.hc .hc-lg.c-own{color:var(--c)}
/* week grid */
.hc .hc-wk{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.hc .hc-sc{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;position:relative}
.hc .hc-in{min-width:100%}
.hc .hc-row{display:grid} .hc .hc-stick{position:sticky;top:0;z-index:6;background:var(--card);box-shadow:0 1px 0 var(--line-2)}
.hc .hc-gut{position:sticky;left:0;z-index:3;background:var(--card)}
.hc .hc-hd .hc-gut{display:flex;align-items:center;justify-content:center}
.hc .hc-dh{border-left:1px solid var(--line);padding:6px 6px 4px;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.hc .hc-dn{display:flex;flex-direction:column;align-items:center;background:none;border:0;cursor:pointer;padding:2px 10px;border-radius:12px;color:var(--ink-2)}
.hc .hc-dn span{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em} .hc .hc-dn b{font-size:22px;line-height:1.15;color:var(--ink)}
.hc .hc-dn:hover{background:var(--ground)} .hc .hc-dh.td .hc-dn b{background:var(--forest);color:#fff;border-radius:999px;padding:0 9px}
.hc .hc-dh.td .hc-dn span{color:var(--forest)}
.hc .hc-bdg{font-size:11.5px;font-weight:800;border:1px solid var(--line);background:var(--ground);color:var(--ink-2);border-radius:999px;padding:2px 8px;cursor:pointer;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.hc .hc-bdg:hover{border-color:var(--forest-2)} .hc .hc-bdg em{font-style:normal;color:var(--red)}
.hc .hc-ad .hc-gut{font-size:11px;color:var(--muted);display:flex;align-items:flex-start;justify-content:flex-end;padding:6px 6px 0}
.hc .hc-adc{border-left:1px solid var(--line);padding:3px;min-height:28px;display:flex;flex-direction:column;gap:2px;min-width:0}
.hc .hc-adc.td,.hc .hc-col.td{background:color-mix(in srgb,var(--moose-soft) 55%,transparent)}
.hc .hc-chip{display:block;font-size:12px;line-height:1.3;font-weight:700;padding:2px 7px;border-radius:7px;background:var(--cb);color:var(--c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;border-left:3px solid var(--c);text-align:left;border-top:0;border-right:0;border-bottom:0;width:100%}
.hc .hc-chip em{font-style:normal;font-weight:600;opacity:.8} .hc .hc-chip.req{background:transparent;border:1px dashed var(--c)} .hc .hc-chip.dec{opacity:.55;text-decoration:line-through}
.hc .hc-chip.past{opacity:.6}
.hc .hc-more{font-size:11.5px;font-weight:800;color:var(--forest);background:none;border:0;cursor:pointer;padding:1px 4px;text-align:left}
.hc .hc-bd{position:relative} .hc .hc-hrs span{position:absolute;right:8px;transform:translateY(-50%);font-size:11px;color:var(--muted);font-weight:700}
.hc .hc-hrs{position:sticky;left:0;z-index:3;background:var(--card)}
.hc .hc-col{position:relative;border-left:1px solid var(--line);background-image:repeating-linear-gradient(to bottom,var(--line) 0,var(--line) 1px,transparent 1px,transparent ${HPX / 2}px,color-mix(in srgb,var(--line) 55%,transparent) ${HPX / 2}px,color-mix(in srgb,var(--line) 55%,transparent) ${HPX / 2 + 1}px,transparent ${HPX / 2 + 1}px,transparent ${HPX}px)}
.hc .hc-col.add{cursor:copy}
.hc .hc-now{position:absolute;left:-1px;right:0;border-top:2px solid var(--red);z-index:4;pointer-events:none} .hc .hc-now:before{content:"";position:absolute;left:-6px;top:-7px;width:12px;height:12px;border-radius:50%;background:var(--red)}
.hc .hc-bk{position:absolute;z-index:2;overflow:hidden;border-radius:9px;padding:3px 7px;font-size:12px;line-height:1.3;background:var(--cb);color:var(--c);border-left:4px solid var(--c);cursor:pointer;box-shadow:0 0 0 1px var(--card);display:flex;flex-direction:column;gap:1px}
.hc .hc-bk b{font-weight:800;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--ink)} .hc .hc-bk span{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hc .hc-bk.sh{flex-direction:row;align-items:center;gap:5px;padding-top:1px;padding-bottom:1px} .hc .hc-bk.sh b{-webkit-line-clamp:1;flex:1;min-width:0}
.hc .hc-bk.past{opacity:.62} .hc .hc-bk.dec{opacity:.5} .hc .hc-bk.dec b{text-decoration:line-through}
.hc .hc-bk:hover,.hc .hc-chip:hover{filter:brightness(.97);box-shadow:0 2px 10px rgba(0,0,0,.12)} .hc .hc-bk:focus-visible,.hc .hc-chip:focus-visible{outline:2px solid var(--c);outline-offset:1px}
.hc .hc-join{align-self:flex-start;margin-top:auto;font-size:11px;font-weight:800;background:var(--c);color:#fff;border-radius:7px;padding:1px 8px;text-decoration:none}
.hc [data-drag]{touch-action:none} .hc .dragging{opacity:.5;box-shadow:0 8px 24px rgba(0,0,0,.25)!important;z-index:9} .hc .drop{outline:2px dashed var(--forest-2);outline-offset:-2px}
.hc .hc-ghost{position:absolute;left:2px;right:2px;border:2px dashed var(--forest-2);border-radius:9px;background:color-mix(in srgb,var(--moose-soft) 70%,transparent);z-index:5;pointer-events:none;font-size:11.5px;font-weight:800;color:var(--forest);padding:2px 6px}
.hc .hc-wk.one .hc-in{min-width:0}
/* month */
.hc .hc-mon{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.hc .hc-mhd{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-bottom:1px solid var(--line-2)} .hc .hc-mhd div{font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;padding:7px 8px;letter-spacing:.04em}
.hc .hc-mgr{flex:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:repeat(var(--rows),minmax(104px,1fr));overflow-y:auto}
.hc .hc-mc{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 5px;display:flex;flex-direction:column;gap:2px;min-width:0;cursor:copy;overflow:hidden}
.hc .hc-mc:nth-child(7n){border-right:0} .hc .hc-mc.out{background:color-mix(in srgb,var(--ground) 70%,transparent)} .hc .hc-mc.out .hc-mn{color:var(--muted)}
.hc .hc-mc.td{background:color-mix(in srgb,var(--moose-soft) 55%,transparent)} .hc .hc-mc.sl{box-shadow:inset 0 0 0 2px var(--forest-2)}
.hc .hc-mtop{display:flex;align-items:center;gap:4px;justify-content:space-between}
.hc .hc-mn{font-weight:800;font-size:13px;background:none;border:0;cursor:pointer;border-radius:999px;padding:1px 7px;color:var(--ink)} .hc .hc-mn:hover{background:var(--ground)}
.hc .hc-mc.td .hc-mn{background:var(--forest);color:#fff}
.hc .hc-mc .hc-chip{font-size:11.5px}
.hc .hc-mc .hc-chip.t{background:none;border-left:0;padding-left:2px;color:var(--ink)} .hc .hc-mc .hc-chip.t:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c);margin-right:5px}
.hc .hc-mc .hc-bdg{font-size:10.5px;padding:1px 6px}
/* agenda */
.hc .hc-ag{flex:1;min-height:0;overflow-y:auto;background:var(--card);border:1px solid var(--line);border-radius:16px}
.hc .hc-agd{border-bottom:1px solid var(--line)} .hc .hc-agd:last-child{border-bottom:0}
.hc .hc-agh{position:sticky;top:0;z-index:2;margin:0;padding:9px 14px;font-size:13.5px;background:var(--ground);color:var(--ink-2);display:flex;gap:8px;align-items:center}
.hc .hc-agd.td .hc-agh{background:var(--moose-soft);color:var(--forest)}
.hc .hc-ar{display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid var(--line);cursor:pointer;border-left:5px solid var(--c);min-height:54px}
.hc .hc-ar:hover{background:var(--ground)} .hc .hc-ar .hc-at{flex:0 0 66px;font-weight:800;font-size:13px;color:var(--ink)} .hc .hc-ar .hc-at small{display:block;font-weight:600;color:var(--muted)}
.hc .hc-ar .hc-ab{flex:1;min-width:0} .hc .hc-ar .hc-ab b{display:block;font-size:14.5px;color:var(--ink)} .hc .hc-ar .hc-ab small{display:block;color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hc .hc-ar.past{opacity:.6} .hc .hc-none{margin:8px 14px 12px;color:var(--muted);font-size:13px}
.hc .hc-jb{font-size:12.5px;font-weight:800;background:var(--forest);color:#fff;border-radius:9px;padding:6px 12px;text-decoration:none;flex:none}
/* reservations week */
.hc .hc-rw{flex:1;min-height:0;overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:16px;display:grid}
.hc .hc-rc{border-left:1px solid var(--line);min-width:150px;display:flex;flex-direction:column} .hc .hc-rc:first-child{border-left:0}
.hc .hc-rc.td{background:color-mix(in srgb,var(--moose-soft) 40%,transparent)}
.hc .hc-rh{position:sticky;top:0;background:var(--card);border-bottom:1px solid var(--line-2);padding:6px;text-align:center;z-index:2}
.hc .hc-rc .hc-rs{padding:5px 6px;display:flex;flex-direction:column;gap:2px} .hc .hc-rc h5{margin:4px 2px 2px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
/* side */
.hc .hc-mini{user-select:none} .hc .hc-mini .mh{display:flex;align-items:center;gap:6px;margin-bottom:4px} .hc .hc-mini .mh b{flex:1;font-size:14px}
.hc .hc-mini .mh button{width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:var(--card);cursor:pointer;color:var(--forest);font-weight:800}
.hc .hc-mini .mg{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;text-align:center}
.hc .hc-mini .mg span{font-size:10.5px;color:var(--muted);font-weight:800;padding:2px 0}
.hc .hc-mini .mg button{border:0;background:none;border-radius:8px;padding:5px 0;font-size:12.5px;cursor:pointer;color:var(--ink);position:relative;font-weight:600}
.hc .hc-mini .mg button:hover{background:var(--ground)} .hc .hc-mini .mg button.o{color:var(--muted)} .hc .hc-mini .mg button.w{background:var(--moose-soft)}
.hc .hc-mini .mg button.t{background:var(--forest);color:#fff} .hc .hc-mini .mg button.dt:after{content:"";position:absolute;left:50%;bottom:1px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:var(--forest-2)}
.hc .hc-pp{padding:7px 0;border-top:1px solid var(--line);font-size:13px} .hc .hc-pp:first-of-type{border-top:0}
.hc .hc-pp .t{color:var(--muted);font-size:12px} .hc .hc-pp .ct{display:flex;gap:10px;flex-wrap:wrap;margin-top:2px;font-size:12.5px}
.hc .hc-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle;background:var(--line-2)} .hc .hc-dot.g{background:var(--forest-2)} .hc .hc-dot.r{background:var(--red)}
.hc .hc-who{display:flex;justify-content:space-between;gap:8px;padding:4px 0;font-size:13px;border-top:1px solid var(--line)} .hc .hc-who:first-of-type{border-top:0} .hc .hc-who small{color:var(--muted);white-space:nowrap}
.hc .hc-fab{display:none}
/* popover, toast, modal bits */
.hc-pop{position:fixed;z-index:70;background:var(--card);color:var(--ink);border:1px solid var(--line-2);border-radius:16px;box-shadow:0 12px 40px rgba(10,25,15,.25);width:min(380px,calc(100vw - 24px));max-height:min(80vh,640px);overflow:auto;display:none;font-size:14px}
.hc-pop.on{display:block} .hc-pop .pb{padding:14px 16px} .hc-pop .pbar{height:7px;background:var(--c,var(--forest));border-radius:16px 16px 0 0}
.hc-pop h3{margin:0 0 4px;font-size:18px;line-height:1.25;display:flex;gap:8px;align-items:flex-start} .hc-pop h3 span{flex:1;min-width:0;word-break:break-word}
.hc-pop .px{width:32px;height:32px;border-radius:50%;border:1px solid var(--line);background:var(--card);cursor:pointer;flex:none;font-size:15px;color:var(--ink-2);padding:0}
.hc-pop .pl{display:flex;gap:9px;margin:7px 0;color:var(--ink-2);font-size:13.5px;line-height:1.4} .hc-pop .pl>i{flex:0 0 18px;font-style:normal;text-align:center}
.hc-pop .pa{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px} .hc-pop .pa .btn{flex:1;min-width:0}
.hc-pop .qrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0} .hc-pop .qrow select{min-height:38px;flex:1;min-width:92px}
.hc-pop input.qt{width:100%;font-size:16px;font-weight:700;min-height:44px}
.hc-pop .qprev{font-size:12.5px;color:var(--muted);min-height:16px;margin:4px 0}
.hc-pop .qcal{display:flex;gap:6px;flex-wrap:wrap} .hc-pop .qcal label{display:inline-flex;align-items:center;gap:5px;font-size:13px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;cursor:pointer}
.hc-pop .qcal input{width:15px;height:15px;min-height:0;margin:0}
.hc-pop .wl{padding:5px 0;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;font-size:13.5px} .hc-pop .wl:first-of-type{border-top:0}
.hc-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:#1d2a20;color:#fff;border-radius:14px;padding:11px 16px;z-index:80;font-size:14px;font-weight:600;display:flex;gap:14px;align-items:center;opacity:0;pointer-events:none;transition:.2s;max-width:calc(100vw - 24px)}
.hc-toast.on{opacity:1;transform:translateX(-50%);pointer-events:auto} .hc-toast button{background:none;border:0;color:#bfe58a;font-weight:800;cursor:pointer;font-size:14px}
#evm.hcm #evcard{width:min(680px,100%);max-height:calc(100dvh - 32px);overflow-y:auto;padding:0 20px;border-radius:20px}
#evm.hcm #evcard .evhd{position:sticky;top:0;background:var(--card);z-index:3;padding:16px 0 10px;display:flex;align-items:center;gap:10px}
#evm.hcm #evcard .evft{position:sticky;bottom:0;background:var(--card);z-index:3;padding:12px 0 16px;border-top:1px solid var(--line);margin-top:8px}
.hcm .ef{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 12px;align-items:start;margin:8px 0}
.hcm .ef>label,.hcm .ef>span.l{font-size:13px;font-weight:800;color:var(--ink-2);padding-top:10px}
.hcm .ef .rw{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.hcm .ef select,.hcm .ef input:where(:not([type=checkbox],[type=radio])){min-height:42px}
.hcm .ef .chips{display:flex;gap:6px;flex-wrap:wrap}
.hcm .chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border:1px solid var(--line-2);border-radius:999px;background:var(--card);font-size:13px;font-weight:700;cursor:pointer;color:var(--ink-2)}
.hcm .chip.on{background:var(--forest);border-color:var(--forest);color:#fff} .hcm .chip input{width:15px;height:15px;min-height:0;margin:0}
.hcm .hint{font-size:12px;color:var(--muted);margin:4px 0 0}
.hcm .ppl{max-height:170px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;padding:6px;display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.hcm input.big{font-size:18px;font-weight:800;min-height:50px}
.hcm .rbox{border:1px solid var(--line);border-radius:12px;padding:8px 10px;margin-top:6px}
@media (max-width:1180px){ .hc .hc-main{grid-template-columns:minmax(0,1fr)} .hc .hc-side{display:none} .hc .hc-views button{padding:0 10px} }
@media (max-width:760px){
  .hc{padding:10px 10px 0;overflow-y:auto;overflow-x:hidden} .hc .hc-title{font-size:17px;flex:1 1 100%;order:-1;padding-left:2px} .hc .hc-views button{padding:0 9px;font-size:12.5px}
  .hc .hc-tabs{overflow-x:auto;max-width:100%} .hc .hc-tabs a{padding:7px 10px;white-space:nowrap}
  .hc .hc-main{flex:none} .hc .hc-wk,.hc .hc-mon,.hc .hc-ag,.hc .hc-rw{flex:none;height:calc(100dvh - 210px);min-height:420px}
  .hc .hc-mgr{grid-template-rows:repeat(var(--rows),minmax(74px,1fr))} .hc .hc-mc .hc-chip{font-size:10.5px;padding:1px 4px}
  .hc .hc-upd,.hc .hc-hide-ph{display:none}
  .hc .hc-fab{display:grid;place-items:center;position:fixed;right:18px;bottom:22px;width:58px;height:58px;border-radius:50%;background:var(--forest);color:#fff;font-size:30px;border:0;box-shadow:0 6px 18px rgba(0,0,0,.25);z-index:30}
  .hc-pop{left:8px!important;right:8px!important;bottom:8px!important;top:auto!important;width:auto;max-height:75vh}
  #evm.hcm{padding:0;align-items:stretch} #evm.hcm #evcard{width:100%;max-width:none;max-height:100dvh;height:100dvh;border-radius:0}
  .hcm .ef{grid-template-columns:1fr} .hcm .ef>label,.hcm .ef>span.l{padding-top:0}
}
@media print{ .hc .hc-bar,.hc .hc-top,.hc .hc-leg,.hc .hc-side{display:none} }
`;
let cssDone = false;
const css = () => { if(cssDone) return; cssDone = true; const s = document.createElement("style"); s.id = "hubcal-css"; s.textContent = HCCSS; document.head.appendChild(s); };
const CHEV = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}"/></svg>`;

/* ---------- toast / popover ---------- */
function toast(msg, undo){ let t = document.getElementById("hctoast"); if(!t){ t = document.createElement("div"); t.id = "hctoast"; t.className = "hc-toast"; document.body.appendChild(t); }
  t.innerHTML = `<span>${html(msg)}</span>${undo ? `<button type="button">Undo</button>` : ""}`; t.classList.add("on");
  if(undo) t.querySelector("button").onclick = () => { t.classList.remove("on"); undo(); };
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), undo ? 8000 : 3500); }
function popEl(){ let p = document.getElementById("hcpop"); if(!p){ p = document.createElement("div"); p.id = "hcpop"; p.className = "hc-pop hc-root"; document.body.appendChild(p);
    document.addEventListener("pointerdown", e => { if(p.classList.contains("on") && !p.contains(e.target) && !e.target.closest("[data-keep-pop]")) popClose(); }, true);
    window.addEventListener("resize", () => popClose()); window.addEventListener("hashchange", () => popClose()); }
  return p; }
function popClose(){ const p = document.getElementById("hcpop"); if(p){ p.classList.remove("on"); p.innerHTML = ""; } C.open = null; }
function pop(inner, at, cls){ const p = popEl(); p.className = "hc-pop hc-root on " + (cls || ""); p.innerHTML = inner;
  const w = Math.min(380, window.innerWidth - 24), r = at && at.getBoundingClientRect ? at.getBoundingClientRect() : at || { left:window.innerWidth / 2 - w / 2, right:window.innerWidth / 2 + w / 2, top:120, bottom:120 };
  const h = p.offsetHeight, W = window.innerWidth, Hh = window.innerHeight; let x, y = r.top;
  if(r.right + 10 + w <= W - 12) x = r.right + 10;
  else if(r.left - 10 - w >= 12) x = r.left - 10 - w;
  else { x = Math.max(12, Math.min(W - w - 12, r.left)); y = r.bottom + 8 + h <= Hh - 12 ? r.bottom + 8 : r.top - 8 - h; }
  y = Math.max(12, Math.min(y, Hh - h - 12));
  p.style.left = x + "px"; p.style.top = y + "px"; p.style.right = "auto"; p.style.bottom = "auto";
  const x0 = p.querySelector(".px"); if(x0) x0.onclick = popClose;
  p.onkeydown = e => { if(e.key === "Escape"){ e.stopPropagation(); popClose(); } };
  return p; }

/* ---------- the page ---------- */
const canAddOn = k => k === "cal_me" || (k === "cal_office" && boss());
function shell(k){
  const t = T(k), L = LAYERS[k] || [], v = t.view;
  const newBtn = !canAddOn(k) ? "" : `<button class="hc-new" data-new title="New event (N)"><span style="font-size:20px;line-height:1">+</span> New</button>`;
  const more = k === "cal_office" ? `<button class="hc-sec" data-mark="out" title="Mark yourself out">🌴 I'm out</button><button class="hc-sec hc-hide-ph" data-mark="working">I'm working</button><a class="hc-sec hc-hide-ph" href="#/cal_off" style="display:inline-flex;align-items:center;text-decoration:none">🗓 Schedule adjustment</a>`
    : k === "cal_me" ? `<button class="hc-sec" data-sched>📅 Schedule a meeting</button><button class="hc-sec hc-hide-ph" data-blinks>🔗 Booking links</button>` : "";
  return `<div class="page hc hc-root" data-k="${k}">
    <div class="hc-top"><nav class="hc-tabs">${TABS.map(([x, l]) => `<a href="#/${x}" class="${x === k ? "on" : ""}">${l}</a>`).join("")}</nav><span class="hc-sp"></span>${more}${newBtn}</div>
    <div class="hc-bar"><button class="hc-today" data-today title="Today (T)">Today</button>
      <button class="hc-arw" data-mv="-1" aria-label="${stepWord(k, -1)}" title="${stepWord(k, -1)} (←)">${CHEV(-1)}</button><button class="hc-arw" data-mv="1" aria-label="${stepWord(k, 1)}" title="${stepWord(k, 1)} (→)">${CHEV(1)}</button>
      <button class="hc-title" data-pick data-keep-pop title="Pick a date">${html(titleOf(k))} <small>▾</small></button><span class="hc-sp"></span><span class="hc-upd" aria-live="polite"></span>
      <div class="hc-views" role="tablist">${VIEWS.map(([x, l]) => `<button data-view="${x}" class="${x === v ? "on" : ""}" title="${l} (${x === "list" ? "A" : l[0]})">${l}</button>`).join("")}</div>
      <button class="hc-ic" data-find data-keep-pop title="Find an event (/)" aria-label="Find an event">🔍</button><button class="hc-ic hc-hide-ph" data-print title="Print or save as PDF" aria-label="Print">🖨</button>
      <button class="hc-ic hc-hide-ph ${C.prefs.side ? "on" : ""}" data-side title="Show or hide the side panel" aria-label="Side panel">◧</button></div>
    <div class="hc-leg">${L.map(([x, l, c]) => `<button class="hc-lg ${c}${layerOn(k, x) ? " on" : ""}" data-lyr="${x}" title="Show or hide ${l}"><i></i><span>${l}</span></button>`).join("")}<span class="hc-sp"></span><span class="muted" style="font-size:12px" id="hcsrc"></span></div>
    <div class="hc-main${C.prefs.side ? "" : " noside"}"><div class="hc-cal" id="hccal"><div class="hc-busy">Loading…</div></div><aside class="hc-side" id="hcside"></aside></div>
    ${canAddOn(k) ? `<button class="hc-fab" data-new aria-label="New event">+</button>` : ""}
    <div class="modal hcm" id="evm"><div class="card" id="evcard"></div></div></div>`;
}
function syncBar(k){ const r = C.v && C.v.querySelector(".hc"); if(!r) return; const t = T(k);
  const ti = r.querySelector("[data-pick]"); if(ti) ti.innerHTML = `${html(titleOf(k))} <small>▾</small>`;
  r.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === t.view));
  r.querySelectorAll("[data-mv]").forEach(b => { const w = stepWord(k, +b.dataset.mv); b.title = w + (+b.dataset.mv < 0 ? " (←)" : " (→)"); b.setAttribute("aria-label", w); });
  r.querySelectorAll("[data-lyr]").forEach(b => b.classList.toggle("on", layerOn(k, b.dataset.lyr)));
  r.querySelector(".hc-main").classList.toggle("noside", !C.prefs.side); const sb2 = r.querySelector("[data-side]"); if(sb2) sb2.classList.toggle("on", !!C.prefs.side); }

window.hubCal = async function(v, k){
  css(); C.k = k; C.v = v;
  const t = T(k);
  if(typeof $ === "function" && $("#ttl")) try { $("#ttl").textContent = $("#utl").textContent = "Calendar · " + (TABS.find(x => x[0] === k) || [k, "Calendar"])[1]; } catch(e){}
  v.innerHTML = `<div class="page hc hc-root"><div class="hc-busy" style="position:static;background:none">Loading the calendar…</div></div>`;
  try { await prefs(); } catch(e){}
  if(current() !== k) return;
  if(!t.view) t.view = defView(k);
  const open = await deepLink(k);
  if(current() !== k) return;
  v.innerHTML = shell(k);
  wire(v.querySelector(".hc"), k);
  await refresh(k, { open });
  rtStart(); pollStart();
};

// #/cal_me/e123, #/cal_office/e123 (an event), #/cal_me/m45 (a coworker meeting: bell + Slack DM links)
async function deepLink(k){ const part = location.hash.split("/")[2] || ""; let m;
  if((m = part.match(/^e(\d+)$/))){ history.replaceState(null, "", "#/" + k);
    const r = await sb.from("hub_cal_events").select("id,day").eq("id", +m[1]).maybeSingle(); if(r && r.data){ T(k).sel = r.data.day; return "e" + r.data.id; }
    toast("That event isn't on the calendar any more."); }
  if((m = part.match(/^m(\d+)$/)) && k === "cal_me"){ history.replaceState(null, "", "#/" + k);
    const g = await sb.rpc("meet_get", { p_id:+m[1] }); if(g && g.data){ T(k).sel = g.data.day; return "m" + g.data.id; } }
  if(/^outlook_/.test(part)) history.replaceState(null, "", "#/" + k);
  return null; }

function alive(k, tok){ return current() === k && C.k === k && (tok == null || tok === C.tok) && C.v && C.v.querySelector(`.hc[data-k="${k}"]`); }
async function refresh(k, o){
  o = o || {}; const t = T(k), [a, b] = rangeOf(k), key = ckey(k, a, b);
  const tok = ++C.tok, hit = C.cache.get(key);
  if(hit && !o.force){ t.data = hit.d; t.sig = hit.sig; draw(k, o); if(Date.now() - hit.at < 20000) { prefetch(k); return; } }
  else if(!o.quiet){ const cal = C.v.querySelector("#hccal"); if(cal && !cal.querySelector(".hc-busy")) cal.insertAdjacentHTML("beforeend", `<div class="hc-busy">Loading…</div>`); }
  upd("Updating…");
  let d; try { d = await loadData(k, a, b); }
  catch(e){ if(!alive(k, tok)) return; upd(""); const cal = C.v.querySelector("#hccal"); if(cal) cal.querySelectorAll(".hc-busy").forEach(x => x.remove());
    if(!t.data && cal) cal.innerHTML = `<div class="hc-card" style="margin:auto;max-width:460px;text-align:center"><b>Couldn't load the calendar.</b><p class="muted">${html(nice(e))}</p><button class="btn" data-retry>Try again</button></div>`;
    else toast("Couldn't update: " + nice(e)); return; }
  const sig = dsig(d);
  C.cache.set(key, { d, at:Date.now(), sig });
  if(!alive(k, tok)) return; upd("");
  const shown = t.data && t.sig === sig && t.data.a === a && t.data.b === b;
  if(!shown){ t.data = d; t.sig = sig; draw(k, o); } else { t.data = d; const cal = C.v.querySelector("#hccal"); if(cal) cal.querySelectorAll(".hc-busy").forEach(x => x.remove()); }
  prefetch(k);
}
const ckey = (k, a, b) => k + "|" + a + "|" + b + (k !== "cal_res" && layerOn(k, "stays") ? "|st" : "");
const dsig = d => JSON.stringify([d.a, d.b, d.evs.map(e => [e.id, e.updated_at]), d.ox, d.tor, d.hm, d.stays.length, d.links, d.guests, Object.keys(d.series)]);
function upd(s){ const u = C.v && C.v.querySelector(".hc-upd"); if(u) u.textContent = s; }
let pfT = null;
function prefetch(k){ clearTimeout(pfT); pfT = setTimeout(async () => { if(!alive(k)) return; const t = T(k), sel = t.sel; stepSel(k, 1); const [a, b] = rangeOf(k); t.sel = sel;
  const key = ckey(k, a, b); if(C.cache.has(key)) return;
  try { const d = await loadData(k, a, b); C.cache.set(key, { d, at:Date.now(), sig:dsig(d) }); } catch(e){} }, 900); }
function invalidate(){ C.cache.clear(); }

/* ---------- drawing ---------- */
function draw(k, o){
  o = o || {}; const t = T(k), root = C.v.querySelector(`.hc[data-k="${k}"]`); if(!root || !t.data) return;
  t.items = buildItems(k, t.data); syncBar(k);
  const cal = root.querySelector("#hccal"), sc = cal.querySelector(".hc-sc"), keep = sc ? { y:sc.scrollTop, x:sc.scrollLeft, v:t.view, k:cal.dataset.r } : null;
  const [a, b] = rangeOf(k); let h;
  if(k === "cal_res") h = t.view === "month" ? monthHTML(k) : t.view === "list" ? listHTML(k) : t.view === "day" ? `<div class="hc-ag" style="padding:4px 14px">${resDetail(t.data.stays, t.sel)}</div>` : resWeekHTML(k, daysOf(a, b));
  else h = t.view === "month" ? monthHTML(k) : t.view === "list" ? listHTML(k) : gridHTML(k, daysOf(a, b));
  cal.innerHTML = h; cal.dataset.r = t.view + a;
  const src = root.querySelector("#hcsrc"); if(src) src.textContent = k === "cal_res" ? (t.data.resSrc || "") : "";
  const sc2 = cal.querySelector(".hc-sc");
  if(sc2){ if(keep && keep.v === t.view && !o.scrollNow) { sc2.scrollTop = keep.y; sc2.scrollLeft = keep.x; } else scrollToHours(k, sc2); }
  drawSide(k);
  if(o.open){ const id = o.open; o.open = null; setTimeout(() => openItem(k, id), 60); }
  if(C.reopen){ const id = C.reopen; C.reopen = null; setTimeout(() => { const el = cal.querySelector(`[data-it="${CSS.escape(id)}"]`); if(el) openItem(k, id, el); }, 60); }
}
function scrollToHours(k, sc){ const g = C.g || { a:6 }, t = T(k), td = rangeOf(k)[0] <= today() && today() <= rangeOf(k)[1], m = nowMin();
  const first = Math.min(...daysOf(...rangeOf(k)).flatMap(s => I(s).filter(x => x.start).map(x => toMin(x.start))), 99999);
  const target = td && m > 9 * 60 && m < 21 * 60 ? m - 90 : Math.min(8 * 60, first < 99999 ? first - 30 : 8 * 60);
  sc.scrollTop = Math.max(0, (target - g.a * 60) / 60 * HPX); }

function badge(k, s, small){ if(k !== "cal_office" || !layerOn(k, "work")) return k === "cal_res" ? resBadge(s) : "";
  const it = T(k).items, w = Object.keys((it.extra.work[s]) || {}), o = Object.keys((it.extra.out[s]) || {}), wk = w.filter(u => !o.includes(u));
  if(!wk.length && !o.length) return "";
  return `<button class="hc-bdg" data-who="${s}" data-keep-pop title="Who's working and who's out">👥 ${wk.length}${small ? "" : " working"}${o.length ? ` · <em>${o.length} out</em>` : ""}</button>`; }
function resBadge(s){ const st = T("cal_res").data ? T("cal_res").data.stays : []; const i = st.filter(x => x.in === s).length, o = st.filter(x => x.out === s).length;
  return i || o ? `<span class="hc-bdg" style="cursor:default">↘ ${i} in · ↗ ${o} out</span>` : ""; }
const tip = x => x.title + " · " + (x.start ? frange(x.start, x.fin) : x.span ? fday(x.span.a) + " – " + fday(x.span.b) : "All day") + (x.sub ? " · " + x.sub : "");
const chip = (x, month) => `<div class="hc-chip ${x.cls}${x.past ? " past" : ""}${month && x.start ? " t" : ""}" role="button" tabindex="0" data-it="${html(x.id)}"${x.edit && x.type !== "event" || (x.edit && !x.span) ? " data-drag" : ""} title="${html(tip(x))}">${x.start ? `<em>${html(fshort(x.start))}</em> ` : ""}${x.rep ? "↻ " : ""}${html(x.title)}${x.span && x.onDay !== x.span.a ? ` <em>(cont.)</em>` : ""}</div>`;
function lay(list){ list.sort((x, y) => x.s - y.s || y.e - x.e); let cols = [], grp = [], end = -1; const fin = () => grp.forEach(x => x.n = cols.length);
  list.forEach(x => { if(grp.length && x.s >= end){ fin(); grp = []; cols = []; } let c = cols.findIndex(e => e <= x.s); if(c < 0){ c = cols.length; cols.push(0); } cols[c] = x.e; x.c = c; grp.push(x); end = Math.max(end, x.e); });
  fin(); return list; }
function gridHTML(k, days){
  const t = today(), sel = T(k).sel, n = days.length;
  // the hours stretch if something is earlier than 6 am or later than 10 pm
  let gA = 6, gB = 22; days.forEach(s => I(s).filter(x => x.start).forEach(x => { gA = Math.min(gA, Math.floor(toMin(x.start) / 60)); gB = Math.max(gB, Math.ceil((x.fin ? toMin(x.fin) : toMin(x.start) + 60) / 60)); }));
  gB = Math.min(24, gB); C.g = { a:gA, b:gB };
  const cols = `grid-template-columns:58px repeat(${n},minmax(${n > 1 ? 110 : 0}px,1fr))`, H = (gB - gA) * HPX, nm = nowMin();
  let h = `<div class="hc-wk${n === 1 ? " one" : ""}"><div class="hc-sc"><div class="hc-in"><div class="hc-stick"><div class="hc-row hc-hd" style="${cols}"><div class="hc-gut"></div>`;
  days.forEach(s => h += `<div class="hc-dh${s === t ? " td" : ""}${s === sel && n > 1 ? " sl" : ""}"><button class="hc-dn" data-gday="${s}" title="Open ${html(flong(s))}"><span>${DOW[D(s).getDay()]}</span><b>${D(s).getDate()}</b></button>${badge(k, s)}</div>`);
  h += `</div><div class="hc-row hc-ad" style="${cols}"><div class="hc-gut"><span>all day</span></div>`;
  let maxAd = 0; days.forEach(s => maxAd = Math.max(maxAd, I(s).filter(x => !x.start).length));
  days.forEach(s => { const ad = I(s).filter(x => !x.start), lim = C.adOpen ? 99 : 3;
    h += `<div class="hc-adc${s === t ? " td" : ""}" data-adday="${s}">${ad.slice(0, ad.length > lim ? lim - 1 : lim).map(x => chip(x)).join("")}${ad.length > lim ? `<button class="hc-more" data-adall>+${ad.length - lim + 1} more</button>` : ""}</div>`; });
  h += `</div></div><div class="hc-row hc-bd" style="${cols};height:${H}px"><div class="hc-hrs" style="position:relative">${Array.from({ length:gB - gA }, (_, i) => i ? `<span style="top:${i * HPX}px">${fhour(gA + i)}</span>` : "").join("")}</div>`;
  days.forEach(s => {
    const bl = lay(I(s).filter(x => x.start).map(x => { const st = toMin(x.start), en0 = x.fin && toMin(x.fin) > st ? toMin(x.fin) : st + 60; return Object.assign({ s:st, e:Math.max(en0, st + 20) }, x); }));
    h += `<div class="hc-col${s === t ? " td" : ""}${canAddOn(k) ? " add" : ""}" data-col="${s}">${s === t && nm >= gA * 60 && nm < gB * 60 ? `<i class="hc-now" style="top:${(nm - gA * 60) / 60 * HPX}px"></i>` : ""}${bl.map(x => block(x, gA)).join("")}</div>`; });
  return h + `</div></div></div></div>`;
}
function block(x, gA){ const top = (x.s - gA * 60) / 60 * HPX, ht = Math.max((x.e - x.s) / 60 * HPX - 2, 20), short = ht < 38;
  return `<div class="hc-bk ${x.cls}${x.past ? " past" : ""}${short ? " sh" : ""}" role="button" tabindex="0" data-it="${html(x.id)}"${x.edit ? " data-drag" : ""} style="top:${top + 1}px;height:${ht}px;left:calc(${x.c / x.n * 100}% + 2px);width:calc(${100 / x.n}% - 4px)" title="${html(tip(x))}"><b>${x.rep ? "↻ " : ""}${x.bell ? "🔔 " : ""}${html(x.title)}</b><span>${html(short ? fshort(x.start) : frange(x.start, x.fin) + (x.sub ? " · " + x.sub : ""))}</span>${x.join && ht >= 62 ? `<a class="hc-join" href="${html(x.join)}" target="_blank" rel="noopener noreferrer" data-join>Join</a>` : ""}</div>`; }
function monthHTML(k){ const [a, b] = rangeOf(k), days = daysOf(a, b), m = T(k).sel.slice(0, 7), t = today(), rows = days.length / 7, isRes = k === "cal_res";
  let h = `<div class="hc-mon"><div class="hc-mhd">${DOW.map(x => `<div>${x}</div>`).join("")}</div><div class="hc-mgr" style="--rows:${rows}">`;
  days.forEach(s => { let its = I(s); if(isRes) its = its.filter(x => x.dir === "in"); const max = 4, show = its.length > max ? its.slice(0, max - 1) : its;
    h += `<div class="hc-mc${s.slice(0, 7) !== m ? " out" : ""}${s === t ? " td" : ""}${s === T(k).sel ? " sl" : ""}" data-mday="${s}"><div class="hc-mtop"><button class="hc-mn" data-gday="${s}" title="Open ${html(flong(s))}">${D(s).getDate() === 1 ? MONS[D(s).getMonth()] + " 1" : D(s).getDate()}</button>${badge(k, s, true)}</div>${show.map(x => chip(x, true)).join("")}${its.length > show.length ? `<button class="hc-more" data-more="${s}" data-keep-pop>+${its.length - show.length} more</button>` : ""}</div>`; });
  return h + `</div></div>`; }
function agRow(x){ return `<div class="hc-ar ${x.cls}${x.past ? " past" : ""}" role="button" tabindex="0" data-it="${html(x.id)}"><span class="hc-at">${x.start ? html(fshort(x.start)) + (x.fin ? `<small>${html(fshort(x.fin))}</small>` : "") : "All day"}</span><span class="hc-ab"><b>${x.rep ? "↻ " : ""}${x.bell ? "🔔 " : ""}${html(x.title)}</b>${x.sub || x.span ? `<small>${html([x.span ? fday(x.span.a) + " – " + fday(x.span.b) : "", x.sub].filter(Boolean).join(" · "))}</small>` : ""}</span>${x.join && !x.past ? `<a class="hc-jb" href="${html(x.join)}" target="_blank" rel="noopener noreferrer" data-join>Join</a>` : ""}</div>`; }
function listHTML(k){ const [a, b] = rangeOf(k), t = today(); let h = "", n = 0;
  daysOf(a, b).forEach(s => { const its = I(s); if(!its.length && s !== t) return; n++;
    h += `<section class="hc-agd${s === t ? " td" : ""}"><h4 class="hc-agh">${s === t ? "Today · " : s === addD(t, 1) ? "Tomorrow · " : ""}${html(flong(s))}<span class="hc-sp"></span>${badge(k, s)}</h4>${its.length ? its.map(agRow).join("") : `<p class="hc-none">Nothing on.</p>`}</section>`; });
  return `<div class="hc-ag">${h || `<p class="hc-none" style="padding:20px">Nothing in these ${LISTN} days.</p>`}<div style="padding:12px 14px"><button class="btn small" data-mv="1">Show the next week →</button></div></div>`; }
function resWeekHTML(k, days){ const t = today();
  return `<div class="hc-rw" style="grid-template-columns:repeat(${days.length},minmax(150px,1fr))">${days.map(s => { const its = I(s), ins = its.filter(x => x.dir === "in"), outs = its.filter(x => x.dir === "out");
    return `<div class="hc-rc${s === t ? " td" : ""}"><div class="hc-rh"><button class="hc-dn" data-gday="${s}"><span>${DOW[D(s).getDay()]}</span><b>${D(s).getDate()}</b></button></div><div class="hc-rs">
      ${layerOn(k, "arr") ? `<h5>↘ ${ins.length} arriving</h5>${ins.map(x => chip(x)).join("") || `<span class="muted" style="font-size:12px;padding:0 4px">—</span>`}` : ""}
      ${layerOn(k, "dep") ? `<h5>↗ ${outs.length} leaving</h5>${outs.map(x => chip(x)).join("") || `<span class="muted" style="font-size:12px;padding:0 4px">—</span>`}` : ""}</div></div>`; }).join("")}</div>`; }
function resDetail(st, sel){
  const show = x => layerOn("cal_res", "own") || !x.owner;
  const arr = st.filter(x => x.in === sel && show(x)), dep = st.filter(x => x.out === sel && show(x)), inh = st.filter(x => x.in <= sel && x.out > sel && show(x));
  const row = (x, what) => `<div class="hc-who"><span><b>${html(x.unit)}</b> ${x.owner ? `<span class="pill amber">Owner</span> ` : ""}${html(x.guest || "")}</span><small>${what} · ${x.nights} night${x.nights === 1 ? "" : "s"}${x.type ? " · " + html(x.type) : ""}</small></div>`;
  return `<h4 style="margin:6px 0 2px;font-size:16px">${html(flong(sel))}</h4><p class="muted" style="margin:0 0 8px;font-size:13px">${inh.length} home${inh.length === 1 ? "" : "s"} with someone in</p>
    <h5 style="margin:10px 0 2px">↘ Arriving (${arr.length})</h5>${arr.map(x => row(x, "until " + fday(x.out))).join("") || `<p class="muted" style="margin:2px 0">None</p>`}
    <h5 style="margin:10px 0 2px">↗ Leaving (${dep.length})</h5>${dep.map(x => row(x, "since " + fday(x.in))).join("") || `<p class="muted" style="margin:2px 0">None</p>`}`; }

/* ---------- side panel ---------- */
function miniHTML(k){ const t = T(k), m = (t.mini || t.sel).slice(0, 7), s0 = weekStart(m + "-01"), td = today(), [a, b] = rangeOf(k);
  let h = `<div class="hc-mini"><div class="mh"><button data-mini-mv="-1" aria-label="Previous month">‹</button><b>${MONL[D(m + "-01").getMonth()]} ${D(m + "-01").getFullYear()}</b><button data-mini-mv="1" aria-label="Next month">›</button></div><div class="mg">${DOW.map(x => `<span>${x[0]}</span>`).join("")}`;
  for(let i = 0; i < 42; i++){ const s = addD(s0, i); if(i >= 35 && s.slice(0, 7) !== m) break;
    const has = s >= t.data.a && s <= t.data.b && I(s).some(x => x.type !== "checkins");
    h += `<button data-mini="${s}" class="${s.slice(0, 7) !== m ? "o " : ""}${s === td ? "t " : ""}${s >= a && s <= b && t.view !== "month" ? "w " : ""}${has ? "dt" : ""}">${D(s).getDate()}</button>`; }
  return h + `</div></div>`; }
function drawSide(k){ const side = C.v.querySelector("#hcside"); if(!side) return; if(!C.prefs.side){ side.innerHTML = ""; return; }
  const t = T(k), d = t.data, sel = t.sel; let h = `<div class="hc-card">${miniHTML(k)}</div>`;
  if(k === "cal_res"){ h += `<div class="hc-card">${resDetail(d.stays, sel)}</div>`; side.innerHTML = h; return; }
  const day = sel >= d.a && sel <= d.b ? sel : (today() >= d.a && today() <= d.b ? today() : d.a);
  const its = I(day).filter(x => x.type !== "checkins");
  h += `<div class="hc-card"><h4>${day === today() ? "Today · " : ""}${html(fday(day))}</h4>${its.length ? its.map(x => `<div class="hc-who" style="cursor:pointer" data-it="${html(x.id)}"><span>${x.rep ? "↻ " : ""}${html(x.title)}</span><small>${x.start ? html(frange(x.start, x.fin)) : "All day"}</small></div>`).join("") : `<p class="muted" style="margin:0;font-size:13px">Nothing on.</p>`}</div>`;
  if(k === "cal_office") h += whoCard(k, day) + reachCard(k, day);
  if(k === "cal_me"){ const me = myId(), wait = (d.hm || []).filter(m => (m.staff || []).includes(me) && !m.mine && !(m.my_answer || {}).answer && m.day >= today());
    if(wait.length) h += `<div class="hc-card" style="border-color:var(--amber)"><h4>❔ Waiting for your answer</h4>${wait.map(m => `<div class="hc-who" style="cursor:pointer" data-it="m${m.id}"><span>${html(m.title)}</span><small>${html(fday(m.day) + " " + ftime(m.start))}</small></div>`).join("")}</div>`;
    const up = []; for(let s = today(); s <= d.b && up.length < 8; s = addD(s, 1)) I(s).filter(x => !x.past && x.type !== "checkins").forEach(x => up.length < 8 && up.push(Object.assign({ d:s }, x)));
    h += `<div class="hc-card"><h4>Coming up</h4>${up.length ? up.map(x => `<div class="hc-who" style="cursor:pointer" data-it="${html(x.id)}" data-day="${x.d}"><span>${html(x.title)}</span><small>${html(fday(x.d) + (x.start ? " " + fshort(x.start) : ""))}</small></div>`).join("") : `<p class="muted" style="margin:0;font-size:13px">Nothing coming up in this view.</p>`}</div>`; }
  side.innerHTML = h;
  const q = side.querySelector("#hcppq"); if(q){ q.oninput = () => side.querySelectorAll(".hc-pp[data-n]").forEach(p => p.style.display = p.dataset.n.includes(q.value.trim().toLowerCase()) ? "" : "none"); }
}
function whoLists(k, s){ const it = T(k).items, w = it.extra.work[s] || {}, o = it.extra.out[s] || {};
  const wk = Object.keys(w).filter(u => !o[u]).map(u => ({ u, n:nameOf(u), ...w[u] })).sort((x, y) => String(x.start || "").localeCompare(String(y.start || "")) || x.n.localeCompare(y.n));
  const out = Object.keys(o).map(u => ({ u, n:nameOf(u), ...o[u] })).sort((x, y) => x.n.localeCompare(y.n));
  return { wk, out }; }
const shiftTxt = x => x.start ? fshort(x.start) + "–" + fshort(x.end) + (x.end && x.end <= x.start ? " (next day)" : "") : x.mark ? "marked working" : "";
function whoCard(k, s){ const { wk, out } = whoLists(k, s), ppl = C.people || [], clk = u => s === today() && (ppl.find(p => p.id === u) || {}).clocked;
  return `<div class="hc-card"><h4>👥 Working ${html(s === today() ? "today" : fday(s))} (${wk.length})</h4>${wk.map(x => `<div class="hc-who"><span><span class="hc-dot ${clk(x.u) ? "g" : ""}"></span>${html(x.n)}</span><small>${html(shiftTxt(x))}${clk(x.u) ? " · on the clock" : ""}</small></div>`).join("") || `<p class="muted" style="margin:0;font-size:13px">No shifts on the schedule.</p>`}
    ${out.length ? `<h4 style="margin-top:10px">🌴 Out (${out.length})</h4>${out.map(x => `<div class="hc-who"><span><span class="hc-dot r"></span>${html(x.n)}</span><small>${html(x.start ? fshort(x.start) + "–" + fshort(x.end) : x.why || "all day")}</small></div>`).join("")}` : ""}
    <p class="muted" style="font-size:11.5px;margin:8px 0 0">Shifts from Staffing ▸ Schedule. Out = approved time off or marked out here.</p></div>`; }
function reachCard(k, s){ const ppl = C.people || [], { wk } = whoLists(k, s), on = new Set(wk.map(x => x.u)), list = ppl.filter(p => p.mgr || on.has(p.id));
  const slack = id => "https://slack.com/app_redirect?channel=" + encodeURIComponent(id);
  return `<div class="hc-card"><h4>📞 How to reach someone</h4><input id="hcppq" placeholder="Find a name, title or team" style="min-height:38px;margin:0 0 6px">${list.map(p => `<div class="hc-pp" data-n="${html((p.name + " " + (p.title || "") + " " + (p.teams || []).join(" ")).toLowerCase())}"><b>${html(p.name)}</b>${on.has(p.id) ? ` <span class="pill green">Working</span>` : ""}<div class="t">${html([p.title, (p.teams || []).join(" · ")].filter(Boolean).join(" — "))}</div>
    <div class="ct">${p.ext ? `<span>☎ ext ${html(p.ext)}</span>` : ""}${p.slack ? `<a href="${slack(p.slack)}" target="_blank" rel="noopener">💬 Slack</a>` : ""}${p.email ? `<a href="mailto:${html(p.email)}">✉ ${html(p.email)}</a>` : ""}</div></div>`).join("")}
    <p class="muted" style="font-size:11.5px;margin:6px 0 0">Managers, plus whoever is working that day.</p></div>`; }

/* ---------- interactions ---------- */
function go(k, day, view){ const t = T(k), vw = !!view && view !== t.view; if(day) t.sel = day; if(view) t.view = view; t.mini = null; C.adOpen = false; popClose(); refresh(k, { scrollNow:vw }); }
function wire(root, k){
  root.addEventListener("click", async e => {
    const el = e.target.closest("button,[data-it],[data-col],[data-mday],[data-adday],a"); if(!el || !root.contains(el)) return;
    if(el.closest("[data-join]")) return;   // the Join link opens by itself
    const t = T(k), ds = el.dataset;
    if(ds.retry != null) return refresh(k, { force:true });
    if(ds.mv) { stepSel(k, +ds.mv); return go(k); }
    if(ds.today != null) return go(k, today());
    if(ds.view){ const nv = ds.view; C.prefs.view[k] = nv; savePrefs(); return go(k, null, nv); }
    if(ds.gday){ e.stopPropagation(); return go(k, ds.gday, "day"); }
    if(ds.lyr){ const L = C.prefs.layers[k] = C.prefs.layers[k] || {}; L[ds.lyr] = !layerOn(k, ds.lyr); savePrefs(); return refresh(k); }
    if(ds.side != null){ C.prefs.side = !C.prefs.side; savePrefs(); syncBar(k); return drawSide(k); }
    if(ds.miniMv){ t.mini = addM((t.mini || t.sel), +ds.miniMv); return drawSide(k); }
    if(ds.mini){ return go(k, ds.mini); }
    if(ds.pick != null) return pickDate(k, el);
    if(ds.find != null) return findBox(k, el);
    if(ds.print != null) return printView(k);
    if(ds.new != null) return quick(k, null, el);
    if(ds.mark) return editor(k, null, { kind:ds.mark, cal:"office" });
    if(ds.sched != null) return schedForm(k);
    if(ds.blinks != null) return linksBox(k);
    if(ds.adall != null){ C.adOpen = !C.adOpen; return draw(k); }
    if(ds.more){ return dayList(k, ds.more, el); }
    if(ds.who){ return whoPop(k, ds.who, el); }
    if(ds.it){ if(ds.day && t.view !== "list"){ /* side list: jump there */ }
      return openItem(k, ds.it, el); }
    if(ds.col != null && canAddOn(k) && el.classList.contains("hc-col") && !e.target.closest(".hc-bk")){
      const y = e.clientY - el.getBoundingClientRect().top, g = C.g || { a:6 }, m = g.a * 60 + Math.floor(y / HPX * 2) * 30;
      return quick(k, { day:ds.col, start:hhmm(Math.min(m, 23 * 60)) }, { getBoundingClientRect:() => ({ left:e.clientX, right:e.clientX, top:e.clientY, bottom:e.clientY }) }); }
    if(ds.mday && canAddOn(k) && e.target === el) return quick(k, { day:ds.mday, start:null }, el);
    if(ds.adday && canAddOn(k) && e.target === el) return quick(k, { day:ds.adday, start:null }, el);
  });
  root.addEventListener("keydown", e => { const it = e.target.closest && e.target.closest("[data-it]"); if(it && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); openItem(k, it.dataset.it, it); } });
  root.addEventListener("dblclick", e => { const c = e.target.closest("[data-mday]"); if(c && !e.target.closest("[data-it]")) go(k, c.dataset.mday, "day"); });
  // drag to move (your own events): hour grid = day + time (15 min), all-day row / month = day
  root.addEventListener("pointerdown", e => dragStart(k, root, e));
  // swipe left/right on phones
  let sx = null, sy = null; root.addEventListener("touchstart", e => { sx = null; if(e.target.closest("[data-drag],input,textarea,select,.hc-tabs,.hc-views,.hc-leg,.hc-side")) return;
    const sc = e.target.closest(".hc-sc,.hc-rw"); if(sc && sc.scrollWidth > sc.clientWidth + 4) return; const p = e.touches[0]; sx = p.clientX; sy = p.clientY; }, { passive:true });
  root.addEventListener("touchend", e => { if(sx == null) return; const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy; sx = null;
    if(Math.abs(dx) > 70 && Math.abs(dy) < 45 && !e.target.closest(".hc-tabs,.hc-views,.hc-leg")){ stepSel(k, dx < 0 ? 1 : -1); go(k); } }, { passive:true });
}
// keyboard: ← → (move), T (today), D/W/M/A (view), N (new), / (find)
document.addEventListener("keydown", e => {
  const k = C.k; if(!k || current() !== k || !C.v || !C.v.querySelector(".hc")) return;
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if(/INPUT|TEXTAREA|SELECT/.test(tag) || document.querySelector(".modal.on") || (document.getElementById("hcpop") || {}).classList?.contains("on") && e.key !== "Escape") return;
  if(e.key === "Escape"){ popClose(); return; }
  const t = T(k), V = { d:"day", w:"week", m:"month", a:"list", x:"work" };
  if(e.key === "ArrowLeft" || e.key === "ArrowRight"){ e.preventDefault(); stepSel(k, e.key === "ArrowLeft" ? -1 : 1); go(k); }
  else if(e.key === "t" || e.key === "T"){ go(k, today()); }
  else if(V[e.key.toLowerCase()]){ const nv = V[e.key.toLowerCase()]; C.prefs.view[k] = nv; savePrefs(); go(k, null, nv); }
  else if((e.key === "n" || e.key === "N") && canAddOn(k)){ e.preventDefault(); quick(k, null, C.v.querySelector("[data-new]")); }
  else if(e.key === "/"){ e.preventDefault(); findBox(k, C.v.querySelector("[data-find]")); }
});

/* ---------- open an item: a small card ---------- */
function findItem(k, id){ const it = T(k).items; return it && it.ids[id]; }
async function openItem(k, id, el){
  let x = findItem(k, id);
  if(!x && /^e\d+$/.test(id)){ const r = await sb.from("hub_cal_events").select("*").eq("id", +id.slice(1)).maybeSingle(); if(r.data){ const d = T(k).data;
      x = { id, type:"event", ev:r.data, title:r.data.title, start:r.data.start_time && r.data.start_time.slice(0, 5), fin:r.data.end_time && r.data.end_time.slice(0, 5), cls:r.data.cal === "personal" ? "c-me" : "c-ev", edit:canEdit(r.data), join:(d && d.links[r.data.id]) || null, rep:!!r.data.series_id }; } }
  if(!x && /^m\d+$/.test(id)){ const r = await sb.rpc("meet_get", { p_id:+id.slice(1) }); if(r.data) return meetBox(k, r.data); }
  if(!x) return;
  if(!el) el = C.v.querySelector(`[data-it="${CSS.escape(id)}"]`);
  if(x.type === "event") return evPeek(k, x, el);
  if(x.type === "staff") return staffPeek(k, x, el);
  if(x.type === "meet") return meetBox(k, x.hm);
  if(x.type === "off") return pop(`<div class="pbar" style="--c:var(--red)"></div><div class="pb"><h3><span>${html(x.title)}</span><button class="px" aria-label="Close">✕</button></h3><div class="pl"><i>📅</i><span>${html(flong(x.day))}</span></div><div class="pa"><a class="btn small" href="#/cal_off">Open Request Time Off</a></div></div>`, el);
  if(x.type === "checkins") return dayList(k, x.day, el, x.list);
  if(x.type === "stay"){ const s = x.stay; return pop(`<div class="pbar ${x.cls}" style="background:var(--c)"></div><div class="pb"><h3><span>${html(s.unit)}${s.owner ? " · Owner stay" : ""}</span><button class="px" aria-label="Close">✕</button></h3>
    ${s.guest ? `<div class="pl"><i>👤</i><span>${html(s.guest)}</span></div>` : ""}<div class="pl"><i>📅</i><span>${html(fday(s.in))} → ${html(fday(s.out))} · ${s.nights} night${s.nights === 1 ? "" : "s"}${s.type ? " · " + html(s.type) : ""}</span></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">From Track. Contact info stays on Home for the teams that have it.</p></div>`, el); }
}
async function seriesWords(e){ if(!e.series_id) return ""; const d = T(C.k).data; const s = d && d.series[e.series_id]; if(s) return s.words;
  const r = await sb.rpc("cal_series_info", { p_ids:[e.series_id] }); return ((r.data || [])[0] || {}).words || "Repeats"; }
async function evPeek(k, x, el){
  const e = x.ev, d = T(k).data, kd = e.kind || "event", gs = (d.guests || {})[e.id] || [], ok = canEdit(e), rw = await seriesWords(e);
  const when = (e.end_day && e.end_day !== e.day ? fday(e.day) + (e.start_time ? " " + ftime(e.start_time) : "") + " → " + fday(e.end_day) + (e.end_time && e.end_time.slice(0, 5) !== "23:59" ? " " + ftime(e.end_time) : "") : flong(x.onDay || e.day) + " · " + frange(e.start_time && e.start_time.slice(0, 5), e.end_time && e.end_time.slice(0, 5)));
  const p = pop(`<div class="pbar ${x.cls}" style="background:var(--c)"></div><div class="pb"><h3><span>${html(x.title)}</span><button class="px" aria-label="Close">✕</button></h3>
    <div class="pl"><i>🕑</i><span>${html(when)}</span></div>
    ${rw ? `<div class="pl"><i>↻</i><span>${html(rw)}</span></div>` : ""}
    ${x.join ? `<div class="pl"><i>💻</i><span><a class="btn small primary" href="${html(x.join)}" target="_blank" rel="noopener noreferrer">Join the meeting</a></span></div>` : e.virtual ? `<div class="pl"><i>💻</i><span>Virtual${ok ? " (no link yet)" : ""}</span></div>` : e.location ? `<div class="pl"><i>📍</i><span>${html(e.location)}</span></div>` : ""}
    ${(e.attendees || []).length ? `<div class="pl"><i>👥</i><span>${html(e.attendees.map(nameOf).join(", "))}</span></div>` : ""}
    ${gs.length ? `<div class="pl"><i>🤝</i><span>${gs.map(g => html(g.name) + (g.company ? ` <span class="muted">(${html(g.company)})</span>` : "") + (g.email ? ` · <a href="mailto:${html(g.email)}">${html(g.email)}</a>` : "") + (g.phone ? ` · <a href="tel:${html(g.phone.replace(/[^0-9+]/g, ""))}">${html(g.phone)}</a>` : "")).join("<br>")}</span></div>` : ""}
    ${(e.remind || []).length ? `<div class="pl"><i>🔔</i><span>${html(e.remind.map(remTxt).join(", "))}</span></div>` : ""}
    ${e.notes ? `<div class="pl"><i>📝</i><span style="white-space:pre-wrap">${html(e.notes)}</span></div>` : ""}
    <div class="pl" style="font-size:12px;color:var(--muted)"><i></i><span>${e.cal === "office" ? "Office calendar · everyone sees it" : "Only you see this"}${e.src === "email" ? " · added from an email invite" : ""}${e.created_by ? " · made by " + html(e.created_by) : ""}</span></div>
    <div class="pa">${ok ? `<button class="btn small primary" data-pe>✎ Edit</button>${kd === "event" ? `<button class="btn small" data-pd>⧉ Duplicate</button>` : ""}<button class="btn small" data-px>🗑 Delete</button>` : `<button class="btn small" data-pe>See all details</button>`}</div></div>`, el, x.cls);
  p.querySelector("[data-pe]").onclick = () => { popClose(); editor(k, e); };
  const dup = p.querySelector("[data-pd]"); if(dup) dup.onclick = () => { popClose(); editor(k, null, Object.assign({}, e, { id:null, series_id:null, rrule:null, dup:true, dupOf:e.id })); };
  const del = p.querySelector("[data-px]"); if(del) del.onclick = () => { popClose(); removeEv(k, e); };
}
function staffPeek(k, x, el){
  const m = x.meta || {}, mv = m.meet ? mvTo(m, x.day) : null;
  const p = pop(`<div class="pbar c-mt" style="background:var(--c)"></div><div class="pb"><h3><span>${html(x.title)}</span><button class="px" aria-label="Close">✕</button></h3>
    <div class="pl"><i>🕑</i><span>${html(flong(x.day))} · ${html(frange(x.start, x.fin))}</span></div>
    ${mv ? `<div class="pl"><i>↪</i><span>Moved from ${html(fday(mv.from))}${mv.note ? " · " + html(mv.note) : ""}</span></div>` : ""}
    ${(x.people || []).length ? `<div class="pl"><i>👥</i><span>${html(x.people.map(nameOf).join(", "))}</span></div>` : ""}
    <div class="pl" style="font-size:12px;color:var(--muted)"><i></i><span>A regular staff meeting. Its usual time is set under Calendar ▸ Meetings.</span></div>
    <div class="pa">${x.join ? `<a class="btn small primary" href="${html(x.join)}" target="_blank" rel="noopener noreferrer">▶ Join</a>` : ""}${x.meet && m.open !== false ? `<a class="btn small" href="#/${html(x.meet)}">Open the agenda</a>` : ""}${ME && ME.admin && x.meet && m.dow != null ? `<button class="btn small" data-smv>Move or skip this one</button>` : ""}</div></div>`, el, "c-mt");
  p.querySelectorAll("a[href^='#/']").forEach(a => a.addEventListener("click", popClose));
  const b = p.querySelector("[data-smv]"); if(b) b.onclick = () => { popClose(); moveOne(k, m, (mv && mv.from) || x.day); };
}
function dayList(k, s, el, list){ const its = list ? null : I(s);
  pop(`<div class="pb"><h3><span>${html(flong(s))}</span><button class="px" aria-label="Close">✕</button></h3>${list ? list.map(x => `<div class="wl"><span><b>${html(x.unit)}</b> ${x.owner ? "· Owner " : ""}${html(x.guest || "")}</span><span class="muted">${x.nights} night${x.nights === 1 ? "" : "s"}</span></div>`).join("")
    : its.map(x => `<div class="wl" style="cursor:pointer" data-dl="${html(x.id)}"><span><span class="hc-root ${x.cls}" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--c);margin-right:6px"></span>${html(x.title)}</span><span class="muted">${x.start ? html(fshort(x.start)) : "all day"}</span></div>`).join("")}
    <div class="pa"><button class="btn small" data-dlgo>Open this day</button></div></div>`, el);
  const p = document.getElementById("hcpop");
  p.querySelectorAll("[data-dl]").forEach(r => r.onclick = () => { const id = r.dataset.dl; popClose(); openItem(k, id, el); });
  p.querySelector("[data-dlgo]").onclick = () => go(k, s, "day"); }
function whoPop(k, s, el){ const { wk, out } = whoLists(k, s);
  pop(`<div class="pb"><h3><span>👥 ${html(flong(s))}</span><button class="px" aria-label="Close">✕</button></h3><b style="font-size:13px">Working (${wk.length})</b>${wk.map(x => `<div class="wl"><span>${html(x.n)}</span><span class="muted">${html(shiftTxt(x))}</span></div>`).join("") || `<p class="muted" style="margin:4px 0">Nobody on the schedule.</p>`}
    ${out.length ? `<b style="font-size:13px;display:block;margin-top:10px">Out (${out.length})</b>${out.map(x => `<div class="wl"><span>${html(x.n)}</span><span class="muted">${html(x.start ? fshort(x.start) + "–" + fshort(x.end) : x.why || "all day")}</span></div>`).join("")}` : ""}
    <div class="pa"><a class="btn small" href="#/stf_sched">Open the Schedule</a></div></div>`, el); }
function pickDate(k, el){ const t = T(k); let m = t.sel.slice(0, 7);
  const draw2 = () => { const s0 = weekStart(m + "-01"), td = today(); let g = "";
    for(let i = 0; i < 42; i++){ const s = addD(s0, i); if(i >= 35 && s.slice(0, 7) !== m) break; g += `<button data-pk="${s}" style="border:0;border-radius:9px;padding:8px 0;cursor:pointer;font-weight:700;background:${s === td ? "var(--forest)" : s === t.sel ? "var(--moose-soft)" : "none"};color:${s === td ? "#fff" : s.slice(0, 7) !== m ? "var(--muted)" : "var(--ink)"}">${D(s).getDate()}</button>`; }
    const p = pop(`<div class="pb"><h3><span>Go to a date</span><button class="px" aria-label="Close">✕</button></h3><div style="display:flex;align-items:center;gap:6px;margin:4px 0 8px"><button class="btn small" data-pm="-1" aria-label="Previous month">‹</button><b style="flex:1;text-align:center">${MONL[D(m + "-01").getMonth()]} ${D(m + "-01").getFullYear()}</b><button class="btn small" data-pm="1" aria-label="Next month">›</button></div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center">${DOW.map(x => `<span class="muted" style="font-size:11px;font-weight:800">${x[0]}</span>`).join("")}${g}</div>
      <div class="qrow" style="margin-top:10px"><input type="date" id="pkd" value="${t.sel}" style="flex:1"><button class="btn small primary" id="pkgo">Go</button></div></div>`, el);
    p.querySelectorAll("[data-pm]").forEach(b => b.onclick = () => { m = addM(m + "-01", +b.dataset.pm).slice(0, 7); draw2(); });
    p.querySelectorAll("[data-pk]").forEach(b => b.onclick = () => go(k, b.dataset.pk));
    p.querySelector("#pkgo").onclick = () => { const v = p.querySelector("#pkd").value; if(/^\d{4}-\d{2}-\d{2}$/.test(v)) go(k, v); }; };
  draw2(); }

/* ---------- find ---------- */
function findBox(k, el){
  const p = pop(`<div class="pb"><h3><span>🔍 Find an event</span><button class="px" aria-label="Close">✕</button></h3><input id="fdq" placeholder="Type part of the name…" autocomplete="off" style="width:100%;min-height:44px"><div id="fdr" style="margin-top:8px"></div></div>`, el);
  const q = p.querySelector("#fdq"), out = p.querySelector("#fdr"); let tm = null, seq = 0; q.focus();
  q.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { const s = q.value.trim(), n = ++seq; if(s.length < 2){ out.innerHTML = ""; return; }
    out.innerHTML = `<p class="muted">Looking…</p>`;
    const like = "%" + s.replace(/[%_]/g, " ") + "%", t0 = today();
    const r = await sb.from("hub_cal_events").select("id,title,day,start_time,end_time,cal,kind,series_id,location").eq("off", false).ilike("title", like).gte("day", addD(t0, -400)).lte("day", addD(t0, 400)).order("day").limit(300);
    if(n !== seq) return;
    const rows = (r.data || []).filter(e => k !== "cal_office" || e.cal === "office"), seen = new Set(), list = [];
    // a repeating event shows once (its next one)
    rows.sort((a, b) => (a.day < t0) - (b.day < t0) || (a.day < t0 ? b.day.localeCompare(a.day) : a.day.localeCompare(b.day)));
    rows.forEach(e => { const key = e.series_id ? "s" + e.series_id : "e" + e.id; if(seen.has(key)) return; seen.add(key); list.push(e); });
    const meets = Object.entries(NAMES).filter(([, l]) => l.toLowerCase().includes(s.toLowerCase()));
    out.innerHTML = list.slice(0, 25).map(e => `<div class="wl" style="cursor:pointer" data-fe="${e.id}" data-fd="${e.day}"><span><b>${e.series_id ? "↻ " : ""}${html(e.title)}</b><br><span class="muted" style="font-size:12px">${e.cal === "office" ? "Office" : "Personal"}${e.location ? " · " + html(e.location) : ""}</span></span><span class="muted" style="text-align:right;white-space:nowrap">${html(fyear(e.day))}<br>${e.start_time ? html(ftime(e.start_time)) : "all day"}</span></div>`).join("")
      + meets.map(([key, l]) => `<div class="wl"><span><b>${html(l)} meeting</b></span><a href="#/${key}">Agenda</a></div>`).join("")
      || `<p class="muted">Nothing found for “${html(s)}”.</p>`;
    out.querySelectorAll("[data-fe]").forEach(row => row.onclick = () => { const t = T(k); t.sel = row.dataset.fd; if(t.view === "list") t.view = "week"; C.reopen = "e" + row.dataset.fe; go(k); });
  }, 280); };
}

/* ---------- print ---------- */
function printView(k){
  const t = T(k), [a, b] = rangeOf(k), days = daysOf(a, b).filter(s => t.view !== "month" || true), name = (TABS.find(x => x[0] === k) || [k, ""])[1];
  const line = x => `<div class="it"><span class="tm">${x.start ? html(fshort(x.start)) + (x.fin ? "–" + html(fshort(x.fin)) : "") : "all day"}</span> <span class="ti">${x.rep ? "↻ " : ""}${html(x.title)}</span>${x.sub ? ` <span class="sb">· ${html(x.sub)}</span>` : ""}</div>`;
  const dayBox = s => { const its = I(s), w = k === "cal_office" && layerOn(k, "work") ? whoLists(k, s) : null;
    return `<div class="dy${s === today() ? " td" : ""}"><h3>${html(D(s).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }))}</h3>${its.map(line).join("") || `<div class="sb">—</div>`}${w && (w.wk.length || w.out.length) ? `<div class="wk">👥 ${w.wk.map(x => html(x.n.split(" ")[0])).join(", ") || "—"}${w.out.length ? `<br>🌴 Out: ${w.out.map(x => html(x.n.split(" ")[0])).join(", ")}` : ""}</div>` : ""}</div>`; };
  let body;
  if(t.view === "month"){ const m = t.sel.slice(0, 7); body = `<div class="mo">${DOW.map(x => `<div class="mh">${x}</div>`).join("")}${days.map(s => `<div class="mc${s.slice(0, 7) !== m ? " out" : ""}"><b>${D(s).getDate()}</b>${I(s).slice(0, 7).map(x => `<div class="mi">${x.start ? html(fshort(x.start)) + " " : ""}${html(x.title)}</div>`).join("")}${I(s).length > 7 ? `<div class="mi">+${I(s).length - 7} more</div>` : ""}</div>`).join("")}</div>`; }
  else if(t.view === "list") body = days.filter(s => I(s).length).map(dayBox).join("");
  else body = `<div class="wkg" style="grid-template-columns:repeat(${days.length},1fr)">${days.map(dayBox).join("")}</div>`;
  const w = window.open("", "_blank"); if(!w) return say("Your browser blocked the print window. Allow pop-ups for crew.moosemanagement.com and try again.");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${html("Moose " + name + " calendar · " + titleOf(k))}</title><style>
    body{font-family:Manrope,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:18px;color:#15201a} h1{font-size:20px;margin:0} .sub{color:#6b776f;font-size:12px;margin:2px 0 12px}
    .wkg{display:grid;gap:0;border:1px solid #cfd8cb} .dy{border-left:1px solid #cfd8cb;padding:6px 7px;min-height:300px;break-inside:avoid} .dy:first-child{border-left:0} .dy.td{background:#f3f8ea}
    .dy h3{font-size:13px;margin:0 0 6px;border-bottom:1px solid #e1e7de;padding-bottom:4px} .it{font-size:11.5px;margin:0 0 5px;line-height:1.3} .tm{font-weight:800} .sb{color:#6b776f} .wk{font-size:10.5px;color:#3d4a42;margin-top:8px;border-top:1px dashed #cfd8cb;padding-top:4px}
    body>.dy{border:1px solid #cfd8cb;min-height:0;margin-bottom:8px}
    .mo{display:grid;grid-template-columns:repeat(7,1fr);border:1px solid #cfd8cb} .mh{font-size:11px;font-weight:800;padding:4px;border-bottom:1px solid #cfd8cb} .mc{border-top:1px solid #e1e7de;border-left:1px solid #e1e7de;min-height:92px;padding:3px;font-size:10px} .mc.out{color:#9aa69e} .mi{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @page{size:landscape;margin:10mm} @media print{.np{display:none}}</style></head><body>
    <div class="np" style="margin-bottom:10px"><button onclick="print()" style="font-size:15px;padding:8px 16px">🖨 Print or save as PDF</button></div>
    <h1>Moose Management · ${html(name)} calendar</h1><div class="sub">${html(titleOf(k))} · printed ${html(new Date().toLocaleString(undefined, { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" }))} by ${html((ME && ME.name) || "")}</div>${body}
    <script>setTimeout(function(){ print(); }, 350);<\/script></body></html>`);
  w.document.close();
}

/* ---------- quick add: click a time (or + New) ---------- */
const MONQ = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
function qparse(txt, base){   // "Lunch with BHL 1403 owner Thu 12:30pm 1h" -> day, time, length (same as calendar.js 2026-11-13)
  let s = " " + txt.replace(/\s+/g, " ") + " ", day = null, start = null, end = null, mins = null, allDay = false, link = null;
  const cut = re => { const m = s.match(re); if(m) s = s.replace(m[0], " "); return m; };
  let m = cut(/\s(https:\/\/\S+)\s/i); if(m) link = m[1];
  if(cut(/\sall[ -]?day\s/i)) allDay = true;
  const t0 = today();
  if((m = cut(/\s(?:on\s)?(today|tonight)\s/i))) day = t0;
  else if((m = cut(/\s(?:on\s)?(tomorrow|tmrw|tmr)\s/i))) day = addD(t0, 1);
  else if((m = cut(/\s(?:on\s)?(next\s)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\.?\s/i))){
    const w = DOW.findIndex(x => x.toLowerCase() === m[2].slice(0, 3).toLowerCase()), n = (w - D(t0).getDay() + 7) % 7; day = addD(t0, n + (m[1] ? 7 : 0)); }
  else if((m = cut(/\s(?:on\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/))){ let y = m[3] ? +m[3] : D(t0).getFullYear(); if(y < 100) y += 2000;
    day = y + "-" + String(+m[1]).padStart(2, "0") + "-" + String(+m[2]).padStart(2, "0"); if(!m[3] && day < t0) day = (y + 1) + day.slice(4); }
  else if((m = cut(/\s(?:on\s)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s(\d{1,2})(?:st|nd|rd|th)?(?:,?\s(\d{4}))?\s/i))){
    let y = m[3] ? +m[3] : D(t0).getFullYear(); day = y + "-" + String(MONQ.indexOf(m[1].toLowerCase().slice(0, 3)) + 1).padStart(2, "0") + "-" + String(+m[2]).padStart(2, "0"); if(!m[3] && day < t0) day = (y + 1) + day.slice(4); }
  const tm = (h, mi, ap) => { h = +h; mi = +(mi || 0); if(ap){ ap = ap[0].toLowerCase(); if(ap === "p" && h < 12) h += 12; if(ap === "a" && h === 12) h = 0; } else if(h >= 1 && h <= 6) h += 12; return h < 24 && mi < 60 ? hhmm(h * 60 + mi) : null; };
  if((m = cut(/\s(?:at\s|from\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm|a|p)?\s?(?:-|–|to)\s?(\d{1,2})(?::(\d{2}))?\s?(am|pm|a|p)?\s/i))){
    const ap2 = m[6], ap1 = m[3] || (ap2 && !(+m[1] > +m[4] && ap2[0].toLowerCase() === "p") ? ap2 : null); start = tm(m[1], m[2], ap1); end = tm(m[4], m[5], ap2 || ap1); }
  else if((m = cut(/\s(?:at\s)?(noon|midday)\s/i))) start = "12:00";
  else if((m = cut(/\s(?:at\s|@\s?)?(\d{1,2}):(\d{2})\s?(am|pm|a|p)?\s/i)) || (m = cut(/\s(?:at\s|@\s?)?(\d{1,2})()\s?(am|pm|a|p)\s/i)) || (m = cut(/\s(?:at|@)\s?(\d{1,2})()()\s/i))) start = tm(m[1], m[2], m[3]);
  if((m = cut(/\s(?:for\s)?(\d+(?:\.\d+)?)\s?(h|hr|hrs|hour|hours)\s/i))) mins = Math.round(parseFloat(m[1]) * 60);
  else if((m = cut(/\s(?:for\s)?(\d+)\s?(m|min|mins|minutes)\s/i))) mins = +m[1];
  if(start && !end) end = endTime(start, mins || 60);
  if(start && end && end <= start) end = endTime(start, mins || 60);
  const title = s.replace(/\s(at|on|from|for)\s*$/i, " ").replace(/^\s*(at|on)\s/i, " ").replace(/\s+/g, " ").trim();
  return { title, day, start:allDay ? null : start, end:allDay ? null : end, link, allDay, timed:!!start || allDay };
}
const tOpts = (sel, from, blank) => { const l = []; for(let m = from == null ? 5 * 60 : from; m < 24 * 60; m += 15) l.push(hhmm(m)); if(sel && !l.includes(sel)) l.push(sel); l.sort();
  return (blank ? `<option value="">${blank}</option>` : "") + l.map(t => `<option value="${t}" ${t === sel ? "selected" : ""}>${ftime(t)}</option>`).join(""); };
function quick(k, at, el){
  if(!canAddOn(k)) return;
  const t = T(k), isOff = k === "cal_office", b = boss(), day0 = (at && at.day) || (t.sel >= today() || t.view === "month" ? t.sel : today());
  if(isOff && !b){ return editor(k, null, { kind:"out", cal:"office", day:day0 }); }   // only managers + admins add office work events
  const st0 = at ? at.start : (day0 === today() ? hhmm(Math.min(Math.ceil((nowMin() + 1) / 30) * 30, 22 * 60)) : "09:00"), en0 = st0 ? endTime(st0, 60) : "";
  const p = pop(`<div class="pb"><h3><span>${isOff ? "New work event" : "New event"}</span><button class="px" aria-label="Close">✕</button></h3>
    <input class="qt" id="qa_t" placeholder="${isOff ? "e.g. Lunch with BHL 1403 owner" : "e.g. Dentist"}" autocomplete="off" enterkeyhint="done">
    <div class="qprev" id="qa_p">Tip: you can type the day and time too, like “Thu 2pm 1h”.</div>
    <div class="qrow"><input type="date" id="qa_d" value="${day0}" style="flex:1.3;min-height:38px"><select id="qa_s" aria-label="Starts">${tOpts(st0, 0, "All day")}</select><span class="muted">–</span><select id="qa_e" aria-label="Ends" ${st0 ? "" : "disabled"}>${tOpts(en0, 0, "—")}</select></div>
    ${b ? `<div class="qcal"><label><input type="radio" name="qa_c" value="office" ${isOff ? "checked" : ""}>Office calendar (everyone)</label><label><input type="radio" name="qa_c" value="personal" ${isOff ? "" : "checked"}>Only me</label></div>` : ""}
    <div class="pa"><button class="btn small primary" id="qa_go">Save</button><button class="btn small" id="qa_more">More options…</button></div><p class="muted" id="qa_m" style="margin:6px 0 0;font-size:12.5px"></p></div>`, el);
  const $q = s => p.querySelector(s), T0 = $q("#qa_t"), S = $q("#qa_s"), E = $q("#qa_e"), Dd = $q("#qa_d");
  let auto = { day:false, start:false };
  S.onchange = () => { E.disabled = !S.value; if(S.value){ const len = E.value && E.dataset.len ? +E.dataset.len : 60; E.innerHTML = tOpts(endTime(S.value, len), 0, "—"); } };
  E.onchange = () => { if(S.value && E.value) E.dataset.len = toMin(E.value) - toMin(S.value); };
  T0.oninput = () => { const x = qparse(T0.value, Dd.value); const bits = [];
    if(x.day){ Dd.value = x.day; auto.day = true; bits.push(fday(x.day)); }
    if(x.allDay){ S.value = ""; S.onchange(); bits.push("all day"); }
    else if(x.start){ S.innerHTML = tOpts(x.start, 0, "All day"); S.value = x.start; E.disabled = false; E.innerHTML = tOpts(x.end, 0, "—"); E.value = x.end; bits.push(frange(x.start, x.end)); }
    $q("#qa_p").innerHTML = bits.length ? `Got it: <b>${html(x.title || "…")}</b> · ${html(bits.join(" · "))}` : "Tip: you can type the day and time too, like “Thu 2pm 1h”."; };
  T0.focus();
  const calNow = () => { const r = p.querySelector("[name=qa_c]:checked"); return r ? r.value : isOff ? "office" : "personal"; };
  const save = async () => { const x = qparse(T0.value, Dd.value), title = (x.title || T0.value).trim();
    if(!title) { $q("#qa_m").textContent = "Add a name for it."; return T0.focus(); }
    if(S.value && E.value && E.value <= S.value) return $q("#qa_m").textContent = "The end time has to be after the start.";
    $q("#qa_go").disabled = true; $q("#qa_m").textContent = "Saving…";
    const c = calNow(), me = myId();
    const r = await saveEv(k, null, { cal:c, kind:"event", title:title.slice(0, 200), day:Dd.value, end_day:null, start:S.value || null, end:S.value ? E.value || null : null, location:"", notes:"",
      attendees:c === "office" ? [] : null, virtual:!!x.link, link:x.link || null, remind:S.value && c === "personal" ? [15] : [], rule:null }, "one");
    if(r.error){ $q("#qa_go").disabled = false; return $q("#qa_m").textContent = "Couldn't save: " + nice(r.error); }
    popClose(); toast(`Added “${title}” · ${fday(Dd.value)}${S.value ? " " + ftime(S.value) : ""}`, async () => { await saveEv(k, { id:r.data }, null, "one", true); afterSave(k); });
    T(k).sel = Dd.value; afterSave(k, "e" + r.data); };
  T0.onkeydown = e => { if(e.key === "Enter"){ e.preventDefault(); save(); } };
  $q("#qa_go").onclick = save;
  $q("#qa_more").onclick = () => { const x = qparse(T0.value, Dd.value); popClose();
    editor(k, null, { kind:"event", cal:calNow(), day:Dd.value, start:S.value || "", end:S.value ? E.value : "", title:(x.title || T0.value).trim(), link:x.link }); };
}
function afterSave(k){ invalidate(); refresh(k, { force:true, quiet:true }); }

/* ---------- saving ---------- */
// one place that calls cal_event_save5. f = fields; e = the row being changed (or null). del = delete (off).
async function saveEv(k, e, f, scope, del){
  f = f || {};
  const base = e && e.cal ? e : null;
  const pick = (a, b2) => a !== undefined ? a : b2;
  const p = { p_id:e ? e.id : null,
    p_cal:pick(f.cal, base ? base.cal : "personal"), p_kind:pick(f.kind, base ? base.kind || "event" : "event"), p_person:pick(f.person, base ? base.person_id : null),
    p_title:pick(f.title, base ? base.title : ""), p_day:pick(f.day, base ? base.day : today()), p_end_day:pick(f.end_day, base ? base.end_day : null),
    p_start:pick(f.start, base && base.start_time ? base.start_time.slice(0, 5) : null), p_end:pick(f.end, base && base.end_time ? base.end_time.slice(0, 5) : null),
    p_location:pick(f.location, base ? base.location || "" : ""), p_notes:pick(f.notes, base ? base.notes || "" : ""), p_off:!!del,
    p_attendees:pick(f.attendees, null), p_virtual:pick(f.virtual, base ? !!base.virtual : false), p_link:pick(f.link, null),
    p_remind:pick(f.remind, null), p_rule:pick(f.rule, null), p_scope:scope || "one" };
  if(e && !base){ const r0 = await sb.from("hub_cal_events").select("*").eq("id", e.id).maybeSingle(); if(r0.data) return saveEv(k, r0.data, f, scope, del); }
  const r = await sb.rpc("cal_event_save5", p);
  return r;
}
// a repeating event: just this one, or this one and all after it?
function askScope(verb){ return new Promise(res => {
  modal({ h:`${verb} a repeating event`, b:`<p style="margin:6px 0 14px">This event repeats. What should ${verb.toLowerCase()} change?</p>
    <div style="display:flex;flex-direction:column;gap:8px"><button class="btn primary" data-sc="one">Just this one</button><button class="btn" data-sc="after">This one and all after it</button><button class="btn" data-sc="">Cancel</button></div><div class="evft" style="border:0;padding:4px 0"></div>` });
  const box = $("#evcard"); let done = false;
  const fin = v => { if(done) return; done = true; $("#evm").classList.remove("on"); res(v || null); };
  box.querySelectorAll("[data-sc]").forEach(b => b.onclick = () => fin(b.dataset.sc));
  $("#evx").onclick = () => fin(null); $("#evm").onclick = x => { if(x.target === $("#evm")) fin(null); };
  const ob = new MutationObserver(() => { if(!$("#evm") || !$("#evm").classList.contains("on")){ ob.disconnect(); fin(null); } }); ob.observe($("#evm"), { attributes:true }); }); }
async function removeEv(k, e){
  const kd = e.kind || "event", what = kd === "event" ? "“" + e.title + "”" : "this";
  let scope = "one";
  if(e.series_id){ scope = await askScope("Delete"); if(!scope) return; }
  else if(!await ask(`Delete ${what}? It comes off the calendar${e.cal === "office" ? " for everyone" : ""}.`, { title:"Delete event", yes:"Delete" })) return;
  const r = await saveEv(k, e, {}, scope, true);
  if(r.error) return say("Couldn't delete it: " + nice(r.error));
  toast(scope === "after" ? "Deleted this one and all after it" : "Deleted " + (kd === "event" ? "“" + e.title + "”" : ""), scope === "one" ? async () => { const u = await saveEv(k, e, {}, "one", false); if(u.error) say("Couldn't undo: " + nice(u.error)); afterSave(k); } : null);
  afterSave(k); }

/* ---------- drag to move ---------- */
function dragStart(k, root, e){
  const el = e.target.closest("[data-drag]"); if(!el || e.button || e.target.closest("[data-join]")) return;
  const id = el.dataset.it, x = findItem(k, id); if(!x || !x.edit) return;
  const inGrid = el.classList.contains("hc-bk"), sx = e.clientX, sy = e.clientY, top0 = el.offsetTop, g = C.g || { a:6 }; let moved = false, drop = null, ghost = null;
  const mv = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if(!moved && Math.hypot(dx, dy) < 7) return;
    if(!moved){ moved = true; el.classList.add("dragging"); popClose(); try { el.setPointerCapture(ev.pointerId); } catch(_){} }
    ev.preventDefault(); root.querySelectorAll(".drop").forEach(z => z.classList.remove("drop"));
    el.style.pointerEvents = "none"; const under = document.elementFromPoint(ev.clientX, ev.clientY); el.style.pointerEvents = "";
    if(inGrid){ const col = under && under.closest("[data-col]"); if(!col){ drop = null; return; }
      const y = ev.clientY - col.getBoundingClientRect().top - (sy - el.getBoundingClientRect().top + (ev.clientY - sy)) + (ev.clientY - sy);
      const mins = Math.max(0, Math.round((y + 0) / HPX * 4) * 15), st = g.a * 60 + mins;
      drop = { day:col.dataset.col, start:hhmm(Math.min(st, 23 * 60 + 30)) };
      if(!ghost){ ghost = document.createElement("div"); ghost.className = "hc-ghost"; }
      const len = x.fin ? toMin(x.fin) - toMin(x.start) : 60; ghost.style.top = (st - g.a * 60) / 60 * HPX + "px"; ghost.style.height = Math.max(len, 20) / 60 * HPX + "px"; ghost.textContent = fshort(drop.start) + "–" + fshort(endTime(drop.start, len));
      if(ghost.parentNode !== col) col.appendChild(ghost); }
    else { const cell = under && under.closest("[data-mday],[data-adday]"); drop = cell ? { day:cell.dataset.mday || cell.dataset.adday } : null; if(cell) cell.classList.add("drop"); } };
  const up = async () => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
    el.classList.remove("dragging"); root.querySelectorAll(".drop").forEach(z => z.classList.remove("drop")); if(ghost) ghost.remove();
    if(!moved) return; root.addEventListener("click", stop, { capture:true, once:true }); setTimeout(() => root.removeEventListener("click", stop, { capture:true }), 50);
    if(drop) moveTo(k, x, drop); };
  const stop = ev => { ev.stopPropagation(); ev.preventDefault(); };
  document.addEventListener("pointermove", mv, { passive:false }); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
}
async function moveTo(k, x, to){
  if(x.type === "meet"){ const m = x.hm; if(to.day === m.day && (!to.start || to.start === m.start)) return;
    const r = await sb.rpc("meet_move", { p_id:m.id, p_day:to.day, p_start:to.start || m.start, p_minutes:m.minutes });
    if(r.error) return say("Couldn't move it: " + nice(r.error)); toast("Moved “" + m.title + "”. Everyone on it is asked to answer again."); return afterSave(k); }
  if(x.type !== "event") return;
  const e = x.ev, len = e.end_day ? dif(e.day, e.end_day) : null, dur = e.start_time && e.end_time ? toMin(e.end_time) - toMin(e.start_time) : 60;
  const st = to.start || (e.start_time ? e.start_time.slice(0, 5) : null);
  if(to.day === e.day && (st || "") === (e.start_time ? e.start_time.slice(0, 5) : "")) return;
  let scope = "one", rule = null;
  if(e.series_id){ scope = await askScope("Move"); if(!scope) return; if(scope === "after") rule = ruleShift(e.rrule, e.day, to.day); }
  const f = { day:to.day, end_day:len != null ? addD(to.day, len) : null, start:st, end:st ? endTime(st, dur) : null };
  const r = await saveEv(k, e, Object.assign({}, f, rule ? { rule } : {}), scope);
  if(r.error) return say("Couldn't move it: " + nice(r.error));
  const old = { day:e.day, end_day:e.end_day, start:e.start_time ? e.start_time.slice(0, 5) : null, end:e.end_time ? e.end_time.slice(0, 5) : null };
  toast(`Moved to ${fday(to.day)}${st ? " " + ftime(st) : ""}`, scope === "one" ? async () => { const u = await saveEv(k, Object.assign({}, e), old, "one"); if(u.error) say("Couldn't undo: " + nice(u.error)); afterSave(k); } : null);
  T(k).sel = to.day; afterSave(k); }
// "this one and all after it" when the day changes: a weekly pattern follows the new weekday
function ruleShift(rule, from, to){ if(!rule) return null; const r = JSON.parse(JSON.stringify(rule));
  if(r.f === "week" && Array.isArray(r.dows)){ const a = D(from).getDay(), b = D(to).getDay(); r.dows = [...new Set(r.dows.map(x => x === a ? b : x))]; }
  if(r.f === "month" && r.mode === "nth" && r.nth !== -1) delete r.nth;
  delete r.count; return r; }

/* ---------- the full editor ---------- */
const modal = o => { $("#evcard").innerHTML = `<div class="evhd"><h2 style="font-size:20px;flex:1;margin:0">${o.h}</h2><button class="btn small" id="evx" aria-label="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>${o.b}`;
  $("#evm").classList.add("on"); $("#evcard").scrollTop = 0; $("#evx").onclick = () => $("#evm").classList.remove("on");
  $("#evm").onclick = x => { if(x.target === $("#evm")) $("#evm").classList.remove("on"); }; };
function repeatOpts(day){ const w = D(day).getDay(), n = nthOf(day), last = isLastWd(day), dn = DAYS[w];
  return [["", "Does not repeat"], ["day", "Every day"], ["wkday", "Every weekday (Mon – Fri)"], ["week", "Every week on " + dn], ["week2", "Every 2 weeks on " + dn],
    ["mnth", `Every month on the ${n === 5 ? "5th" : ord(n)} ${dn}`]].concat(last ? [["mlast", `Every month on the last ${dn}`]] : []).concat([["mdate", `Every month on the ${ord(D(day).getDate())}`], ["year", `Every year on ${MONS[D(day).getMonth()]} ${D(day).getDate()}`], ["custom", "Custom…"]]); }
function ruleOf(sel, day, cu){ const w = D(day).getDay();
  const ends = r => { if(cu.end === "on" && cu.until) r.until = cu.until; if(cu.end === "after" && cu.count) r.count = +cu.count; return r; };
  switch(sel){ case "": return {};
    case "day": return ends({ f:"day", n:1 }); case "wkday": return ends({ f:"day", n:1, wk:true });
    case "week": return ends({ f:"week", n:1, dows:[w] }); case "week2": return ends({ f:"week", n:2, dows:[w] });
    case "mnth": return ends({ f:"month", n:1, mode:"nth", nth:nthOf(day) }); case "mlast": return ends({ f:"month", n:1, mode:"nth", nth:-1 });
    case "mdate": return ends({ f:"month", n:1, mode:"date" }); case "year": return ends({ f:"year", n:1 });
    case "custom": { const r = { f:cu.f || "week", n:Math.max(1, Math.min(12, +cu.n || 1)) }; if(r.f === "week") r.dows = cu.dows && cu.dows.length ? cu.dows : [w]; if(r.f === "month") r.mode = "date"; return ends(r); } }
  return {}; }
function selOfRule(r, day){ if(!r || !r.f) return ["", {}];
  const cu = { end:r.until ? "on" : r.count ? "after" : "never", until:r.until || "", count:r.count || "", f:r.f, n:r.n || 1, dows:r.dows || [] }, w = D(day).getDay(), n = r.n || 1;
  if(r.f === "day" && r.wk) return ["wkday", cu]; if(r.f === "day" && n === 1) return ["day", cu];
  if(r.f === "week" && (r.dows || []).length === 1 && r.dows[0] === w && n <= 2) return [n === 1 ? "week" : "week2", cu];
  if(r.f === "month" && r.mode === "nth" && r.nth === -1) return ["mlast", cu]; if(r.f === "month" && r.mode === "nth" && n === 1) return ["mnth", cu];
  if(r.f === "month" && n === 1) return ["mdate", cu]; if(r.f === "year" && n === 1) return ["year", cu];
  return ["custom", cu]; }
async function editor(k, e, pre){
  pre = pre || {}; const isOff = k === "cal_office", b = boss(), me = myId(), ppl = C.people || await people(), d = T(k).data || { links:{}, guests:{} };
  const kind = e ? (e.kind || "event") : (pre.kind || "event"), cal0 = e ? e.cal : (pre.cal || (isOff ? "office" : "personal")), ro = e && !canEdit(e);
  const isEv = kind === "event";
  const head = e ? (ro ? "Event" : isEv ? "Change event" : kind === "out" ? "Change time out" : "Change working") : pre.dup ? "Copy of event" : kind === "out" ? "🌴 Mark out" : kind === "working" ? "Mark working" : cal0 === "office" ? "New work event" : "New event";
  const src = e || pre, day0 = src.day || T(k).sel, st0 = src.start_time ? src.start_time.slice(0, 5) : (src.start || ""), en0 = src.end_time ? src.end_time.slice(0, 5) : (src.end || (st0 ? endTime(st0, 60) : ""));
  const lk0 = e ? d.links[e.id] || "" : pre.link || (pre.dupOf && d.links[pre.dupOf]) || "", virt0 = e ? !!e.virtual : !!(pre.link || pre.virtual);
  const G = ((e && d.guests[e.id]) || (pre.dupOf && d.guests[pre.dupOf]) || []).map(g => Object.assign({}, g));
  const att0 = new Set(e ? e.attendees || [] : pre.attendees || (cal0 === "office" && !isOff && me ? [me] : []));
  let rule0 = e && e.rrule ? e.rrule : null; if(pre.dup) rule0 = null;
  const [rsel0, cu0] = selOfRule(rule0, day0);
  const rem0 = e ? (e.remind || []) : pre.remind || (isEv && (cal0 === "personal") && st0 ? [15] : []);
  const dis = ro ? "disabled" : "";
  const who = cal0 === "office" && !isEv && b ? `<div class="ef"><label for="ev_p">Who</label><select id="ev_p" ${dis}>${ppl.map(p => `<option value="${p.id}" ${(e ? e.person_id : me) === p.id ? "selected" : ""}>${html(p.name)}</option>`).join("")}</select></div>` : "";
  const showOn = isEv && b && !ro ? `<div class="ef"><span class="l">Calendar</span><div class="chips"><label class="chip ${cal0 === "office" ? "on" : ""}"><input type="radio" name="ev_cal" value="office" ${cal0 === "office" ? "checked" : ""}>🏢 Office (everyone sees it)</label><label class="chip ${cal0 === "personal" ? "on" : ""}"><input type="radio" name="ev_cal" value="personal" ${cal0 === "personal" ? "checked" : ""}>🔒 Only me</label></div></div>` : "";
  const remH = !isEv ? "" : `<div class="ef"><span class="l">Remind</span><div><div id="ev_rems" class="chips"></div><p class="hint" id="ev_remh"></p></div></div>`;
  const repH = !isEv ? "" : `<div class="ef"><label for="ev_r">Repeat</label><div><select id="ev_r" ${dis} style="width:100%"></select>
    <div class="rbox" id="ev_cu" style="display:none"><div class="rw">Every <input id="cu_n" type="number" min="1" max="12" value="${cu0.n || 1}" style="width:70px"> <select id="cu_f"><option value="day">day(s)</option><option value="week">week(s)</option><option value="month">month(s)</option><option value="year">year(s)</option></select></div>
      <div class="chips" id="cu_dw" style="margin-top:8px">${DOW.map((x, i) => `<label class="chip"><input type="checkbox" data-dw="${i}">${x}</label>`).join("")}</div></div>
    <div class="rw" id="ev_end" style="margin-top:8px;display:none">Ends <select id="end_k"><option value="never">never</option><option value="on">on</option><option value="after">after</option></select><input type="date" id="end_u" style="display:none"><input type="number" id="end_n" min="1" max="730" placeholder="times" style="width:90px;display:none"><span id="end_t" style="display:none">times</span></div>
    ${e && e.series_id ? `<p class="hint">Changing the repeat changes this one and all after it.</p>` : ""}</div></div>`;
  modal({ h:head, b:`${who}
    <div class="ef" style="grid-template-columns:1fr"><input id="ev_t" class="big" placeholder="${isEv ? "Add a title" : "Note (optional), e.g. PTO, sick, on call"}" value="${html(e ? (isEv || !/^(out|working)$/i.test(e.title) ? e.title : "") : pre.title || "")}" ${dis} maxlength="200"></div>
    <div class="ef"><span class="l">When</span><div><div class="rw"><input type="date" id="ev_d" value="${html(day0)}" ${dis}><select id="ev_s" ${dis} aria-label="Starts">${tOpts(st0, 0, "All day")}</select><span class="muted">to</span><select id="ev_f" ${dis || (st0 ? "" : "disabled")} aria-label="Ends">${tOpts(en0, 0, "—")}</select></div>
      <div class="rw" style="margin-top:6px"><span class="muted" style="font-size:12.5px">Lasts more than one day? Last day</span><input type="date" id="ev_e" value="${html((e && e.end_day) || "")}" ${dis} style="max-width:170px"></div>
      <div class="chips" id="ev_lens" style="margin-top:6px">${[30, 60, 90, 120].map(m => `<button type="button" class="chip" data-len="${m}">${m < 60 ? m + " min" : m / 60 + " hr" + (m > 60 ? "s" : "")}</button>`).join("")}</div></div></div>
    ${repH}${remH}${showOn}
    ${isEv ? `<div class="ef"><span class="l">Where</span><div><div class="chips"><label class="chip ${virt0 ? "" : "on"}"><input type="radio" name="ev_v" value="0" ${virt0 ? "" : "checked"} ${dis}>📍 In person</label><label class="chip ${virt0 ? "on" : ""}"><input type="radio" name="ev_v" value="1" ${virt0 ? "checked" : ""} ${dis}>💻 Virtual</label></div>
      <input id="ev_l" placeholder="Where (optional)" value="${html((e && e.location) || pre.location || "")}" ${dis} style="margin-top:6px;display:${virt0 ? "none" : "block"};width:100%">
      <div id="ev_vbox" style="display:${virt0 ? "block" : "none"};margin-top:6px">${ro ? (lk0 ? `<a class="btn small primary" href="${html(lk0)}" target="_blank" rel="noopener noreferrer">💻 Join</a>` : "")
        : `<input id="ev_link" type="url" placeholder="Meeting link: https://zoom.us/j/…" value="${html(lk0)}" style="width:100%"><div class="rw" style="margin-top:6px"><button class="btn small" type="button" id="ev_zoom">🎥 Make a Zoom link</button><span class="muted" id="ev_zm" style="font-size:12px"></span></div>`}</div></div></div>` : ""}
    ${isEv ? `<div class="ef" id="ev_attw" style="display:${cal0 === "office" ? "grid" : "none"}"><span class="l">Who's going</span><div><input id="ev_aq" placeholder="Find a coworker…" autocomplete="off" ${dis} style="width:100%"><div class="ppl" id="ev_att">${ppl.map(p => `<label class="chip ${att0.has(p.id) ? "on" : ""}" data-n="${html(p.name.toLowerCase())}"><input type="checkbox" data-att="${p.id}" ${att0.has(p.id) ? "checked" : ""} ${dis}>${html(p.name)}</label>`).join("")}</div><p class="hint">They see it on their Personal calendar and get its reminders.</p></div></div>
      <div class="ef"><span class="l">From outside</span><div><div id="ev_gl"></div>${ro ? "" : `<div class="rw" style="margin-top:4px"><select id="ev_vp" style="flex:1;min-width:180px"><option value="">+ Pick a vendor…</option></select><button class="btn small" id="ev_ga" type="button">+ Add a person</button></div>`}<p class="hint">Vendors, owners, anyone you're meeting. With an email you can send them an invite after saving.</p></div></div>` : ""}
    <div class="ef"><label for="ev_n">Notes</label><textarea id="ev_n" style="min-height:80px;width:100%" placeholder="Don't type codes or passwords here." ${dis}>${html((e && e.notes) || pre.notes || "")}</textarea></div>
    <div class="evft">${ro ? `<p class="muted" style="margin:0">Only ${e.cal === "office" ? "managers and admins" : "its owner"} can change this.</p>` : `<div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" id="ev_go">Save</button>${e ? `<button class="btn" id="ev_del">🗑 Delete</button>` : ""}<button class="btn" id="ev_cx">Cancel</button></div>`}<p class="muted" id="ev_m" style="margin:6px 0 0"></p></div>` });
  const box = $("#evcard"), q = s => box.querySelector(s);
  if(q("#ev_cx")) q("#ev_cx").onclick = () => $("#evm").classList.remove("on");
  // chips light up when picked
  const chipSync = () => box.querySelectorAll("label.chip").forEach(l => { const i = l.querySelector("input"); if(i) l.classList.toggle("on", i.checked); });
  box.addEventListener("change", chipSync);
  // outside people
  const gDraw = () => { const bx = q("#ev_gl"); if(!bx) return;
    if(ro){ bx.innerHTML = G.length ? G.map(g => `<div style="margin:4px 0"><b>${html(g.name)}</b>${g.company ? ` · ${html(g.company)}` : ""}${g.email ? ` · <a href="mailto:${html(g.email)}">${html(g.email)}</a>` : ""}${g.phone ? ` · ${html(g.phone)}` : ""}</div>`).join("") : `<span class="muted">Nobody added.</span>`; return; }
    bx.innerHTML = G.map((g, i) => `<div class="rw" style="margin:0 0 6px"><input data-gi="${i}" data-gk="name" placeholder="Name" value="${html(g.name || "")}" style="flex:1.2;min-width:110px"><input data-gi="${i}" data-gk="company" placeholder="Company" value="${html(g.company || "")}" style="flex:1;min-width:100px">
      <input data-gi="${i}" data-gk="email" type="email" placeholder="Email" value="${html(g.email || "")}" style="flex:1.3;min-width:140px"><input data-gi="${i}" data-gk="phone" type="tel" placeholder="Phone" value="${html(g.phone || "")}" style="flex:.9;min-width:100px"><button class="btn small" type="button" data-gx="${i}" aria-label="Remove" style="width:36px;padding:0">✕</button></div>`).join("");
    bx.querySelectorAll("[data-gi]").forEach(x => x.oninput = () => { G[+x.dataset.gi][x.dataset.gk] = x.value; });
    bx.querySelectorAll("[data-gx]").forEach(x => x.onclick = () => { G.splice(+x.dataset.gx, 1); gDraw(); }); };
  gDraw();
  if(ro) return;
  if(q("#ev_ga")) q("#ev_ga").onclick = () => { G.push({ name:"", company:"", email:"", phone:"" }); gDraw(); const n = q("#ev_gl").querySelectorAll('[data-gk="name"]'); if(n.length) n[n.length - 1].focus(); };
  if(q("#ev_vp")) (async () => { try { const vr = await sb.from("vendors").select("id,name,trade,phone,email").eq("active", true).order("name"); const V = (vr && vr.data) || [];
      if(!V.length) return q("#ev_vp").style.display = "none";
      q("#ev_vp").insertAdjacentHTML("beforeend", V.map(x => `<option value="${html(String(x.id))}">${html(x.name)}${x.trade ? " · " + html(x.trade) : ""}</option>`).join(""));
      q("#ev_vp").onchange = () => { const x = V.find(y => String(y.id) === q("#ev_vp").value); q("#ev_vp").value = ""; if(!x || G.some(g => String(g.vendor_id) === String(x.id))) return;
        G.push({ name:x.name, company:x.trade ? "Vendor (" + x.trade + ")" : "Vendor", email:x.email || "", phone:x.phone || "", vendor_id:String(x.id) }); gDraw(); };
    } catch(_){ if(q("#ev_vp")) q("#ev_vp").style.display = "none"; } })();
  if(q("#ev_aq")) q("#ev_aq").oninput = () => { const s = q("#ev_aq").value.trim().toLowerCase(); q("#ev_att").querySelectorAll("[data-n]").forEach(l => l.style.display = !s || l.dataset.n.includes(s) || l.querySelector("input").checked ? "" : "none"); };
  const calNow = () => { const r = box.querySelector("[name=ev_cal]:checked"); return r ? r.value : cal0; };
  box.querySelectorAll("[name=ev_cal]").forEach(r => r.addEventListener("change", () => { const a = q("#ev_attw"); if(a) a.style.display = calNow() === "office" ? "grid" : "none"; remDraw(); }));
  box.querySelectorAll("[name=ev_v]").forEach(r => r.addEventListener("change", () => { const on = r.value === "1" && r.checked; if(!r.checked) return; q("#ev_vbox").style.display = on ? "block" : "none"; q("#ev_l").style.display = on ? "none" : "block"; if(on && q("#ev_link")) q("#ev_link").focus(); }));
  const unwrap = u => { try { const x = new URL(u); if(/(^|\.)google\.[a-z.]+$/i.test(x.hostname) && x.pathname === "/url"){ const v2 = x.searchParams.get("q") || x.searchParams.get("url"); if(v2 && /^https:\/\//i.test(v2)) return v2; } } catch(_){} return u; };
  if(q("#ev_link")) q("#ev_link").onchange = () => { q("#ev_link").value = unwrap(q("#ev_link").value.trim()); };
  if(q("#ev_zoom")) q("#ev_zoom").onclick = async () => { const zb = q("#ev_zoom"), zm = q("#ev_zm"), dd = q("#ev_d").value; if(!dd) return zm.textContent = "Pick the day first.";
    if(q("#ev_link").value.trim() && !await ask("Replace the link that's there with a new Zoom link?")) return;
    const st = q("#ev_s").value, len = st && q("#ev_f").value ? toMin(q("#ev_f").value) - toMin(st) : 60;
    zb.disabled = true; zm.textContent = "Making the Zoom meeting…";
    const r = await fnCall("meet", { action:"event_zoom", title:q("#ev_t").value.trim(), day:dd, start:st || "", minutes:len > 0 ? len : 60 }); zb.disabled = false;
    if(!r || !r.ok || !r.join) return zm.textContent = "Couldn't make it: " + ((r && r.error) || "no answer");
    q("#ev_link").value = r.join; zm.textContent = "✓ Zoom link added (host: " + (r.host || "Zoom") + "). Press Save to keep it."; };
  // time + length
  const S = q("#ev_s"), F = q("#ev_f");
  const lenNow = () => S.value && F.value ? toMin(F.value) - toMin(S.value) : 60;
  let len = st0 && en0 ? toMin(en0) - toMin(st0) : 60; if(!(len > 0)) len = 60;
  S.onchange = () => { F.disabled = !S.value; if(S.value){ F.innerHTML = tOpts(endTime(S.value, len), 0, "—"); } remDraw(); };
  F.onchange = () => { if(S.value && F.value) len = toMin(F.value) - toMin(S.value); };
  box.querySelectorAll("[data-len]").forEach(bt => bt.onclick = () => { if(!S.value){ S.value = "09:00"; F.disabled = false; } len = +bt.dataset.len; F.innerHTML = tOpts(endTime(S.value, len), 0, "—"); });
  // repeat
  const cu = Object.assign({ end:"never", until:"", count:"", f:"week", n:1, dows:[] }, cu0);
  const R = q("#ev_r");
  const rDraw = () => { if(!R) return; const dd = q("#ev_d").value || day0, cur = R.value || rsel0; R.innerHTML = repeatOpts(dd).map(([v2, l]) => `<option value="${v2}">${html(l)}</option>`).join("");
    R.value = repeatOpts(dd).some(x => x[0] === cur) ? cur : (cur === "mlast" ? "mnth" : ""); cuDraw(); };
  const cuDraw = () => { if(!R) return; const on = R.value === "custom", rep = !!R.value; q("#ev_cu").style.display = on ? "block" : "none"; q("#ev_end").style.display = rep ? "flex" : "none";
    q("#cu_f").value = cu.f; q("#cu_n").value = cu.n; q("#cu_dw").style.display = cu.f === "week" ? "flex" : "none";
    const w = D(q("#ev_d").value || day0).getDay(); q("#cu_dw").querySelectorAll("[data-dw]").forEach(c => { c.checked = (cu.dows.length ? cu.dows : [w]).includes(+c.dataset.dw); }); chipSync();
    q("#end_k").value = cu.end; q("#end_u").style.display = cu.end === "on" ? "" : "none"; q("#end_n").style.display = q("#end_t").style.display = cu.end === "after" ? "" : "none";
    q("#end_u").value = cu.until || ""; q("#end_n").value = cu.count || ""; };
  if(R){ R.onchange = cuDraw; q("#cu_f").onchange = () => { cu.f = q("#cu_f").value; cuDraw(); }; q("#cu_n").oninput = () => { cu.n = +q("#cu_n").value || 1; };
    q("#cu_dw").addEventListener("change", () => { cu.dows = [...q("#cu_dw").querySelectorAll("[data-dw]:checked")].map(c => +c.dataset.dw); });
    q("#end_k").onchange = () => { cu.end = q("#end_k").value; if(cu.end === "on" && !cu.until) cu.until = addM(q("#ev_d").value || day0, 3); if(cu.end === "after" && !cu.count) cu.count = 10; cuDraw(); };
    q("#end_u").onchange = () => { cu.until = q("#end_u").value; }; q("#end_n").oninput = () => { cu.count = q("#end_n").value; };
    R.innerHTML = ""; rDraw(); R.value = rsel0 && repeatOpts(day0).some(x => x[0] === rsel0) ? rsel0 : rsel0 ? "custom" : ""; cuDraw(); }
  q("#ev_d").addEventListener("change", () => rDraw());
  // reminders (up to 3)
  let rems = rem0.slice();
  const remDraw = () => { const bx = q("#ev_rems"); if(!bx) return;
    bx.innerHTML = rems.map((m, i) => `<span class="chip on" style="cursor:default">🔔 ${html(remTxt(m))} <button type="button" data-rx="${i}" aria-label="Remove reminder" style="border:0;background:none;color:#fff;cursor:pointer;font-weight:800;padding:0 0 0 4px">✕</button></span>`).join("")
      + (rems.length < 3 ? `<select id="ev_ra" style="min-height:34px;border-radius:999px;padding:0 10px;font-size:13px"><option value="">+ Add a reminder</option>${REM.filter(x => !rems.includes(x[0])).map(([m, l]) => `<option value="${m}">${l}</option>`).join("")}</select>` : "");
    bx.querySelectorAll("[data-rx]").forEach(x => x.onclick = () => { rems.splice(+x.dataset.rx, 1); remDraw(); });
    const ra = bx.querySelector("#ev_ra"); if(ra) ra.onchange = () => { if(ra.value !== ""){ rems.push(+ra.value); rems.sort((a, c) => a - c); remDraw(); } };
    const h = q("#ev_remh"); if(h) h.textContent = !rems.length ? "No reminder." : (calNow() === "office" ? "Goes to the people on it (or to you if nobody is picked)" : "Goes to you") + " in the 🔔 bell" + (S.value ? "" : "; all-day events count from 8 am") + "."; };
  remDraw();
  // save
  const go = async () => {
    const t = q("#ev_t").value.trim(), dd = q("#ev_d").value; if((isEv && !t) || !dd) return q("#ev_m").textContent = isEv ? "Add a title and a day." : "Pick a day.";
    const c = calNow(), sT = S.value || null, fT = sT ? F.value || null : null, ed = q("#ev_e").value || null;
    if(ed && ed < dd) return q("#ev_m").textContent = "The last day has to be on or after the first day.";
    if(sT && fT && fT <= sT && !ed) return q("#ev_m").textContent = "The end time has to be after the start.";
    const vr = box.querySelector("[name=ev_v]:checked"), virt = !!(vr && vr.value === "1"), link = q("#ev_link") ? unwrap(q("#ev_link").value.trim()) : "";
    const gl = G.filter(g => (g.name || "").trim() || (g.email || "").trim() || (g.phone || "").trim());
    if(gl.some(g => !(g.name || "").trim())) return q("#ev_m").textContent = "Add a name for each person from outside Moose (or remove the empty row).";
    if(gl.some(g => (g.email || "").trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.email.trim()))) return q("#ev_m").textContent = "Check the email of the people from outside Moose.";
    if(virt && link && !/^https:\/\/\S+$/i.test(link)) return q("#ev_m").textContent = "The meeting link has to start with https://";
    const att = c === "office" && isEv ? [...box.querySelectorAll("[data-att]:checked")].map(x => x.dataset.att) : null;
    let rule = null; if(R){ rule = ruleOf(R.value, dd, cu); if(R.value === "custom" && rule.f === "week" && !(rule.dows || []).length) return q("#ev_m").textContent = "Pick at least one day of the week.";
      if(rule.until && rule.until < dd) return q("#ev_m").textContent = "The repeat has to end after it starts."; }
    const ruleChanged = !!R && JSON.stringify(rule || {}) !== JSON.stringify(normRule(rule0) || {});
    let scope = "one";
    if(e && e.series_id){ if(ruleChanged) scope = "after"; else { scope = await askScope("Change"); if(!scope) return; } }
    const f = { cal:c, kind, person:q("#ev_p") ? q("#ev_p").value : (kind !== "event" ? me : null), title:t, day:dd, end_day:ed, start:sT, end:fT, location:virt ? "" : (q("#ev_l") ? q("#ev_l").value : ""),
      notes:q("#ev_n").value, attendees:att, virtual:virt, link:virt ? link : null, remind:isEv ? rems : [], rule:R ? (e && e.series_id && !ruleChanged && scope === "one" ? null : rule) : null };
    if(!isEv){ f.person = q("#ev_p") ? q("#ev_p").value : (e ? e.person_id : me); }
    q("#ev_go").disabled = true; q("#ev_m").textContent = "Saving…";
    const r = await saveEv(k, e, f, scope);
    if(r.error){ q("#ev_go").disabled = false; return q("#ev_m").textContent = "Couldn't save: " + nice(r.error); }
    const id = r.data;
    if(isEv && (gl.length || (e && (d.guests[e.id] || []).length))){
      const gr = await sb.rpc("cal_guests_set", { p_event:id, p_guests:gl.map(g => ({ name:g.name, company:g.company, email:g.email, phone:g.phone, vendor_id:g.vendor_id || null })) });
      if(gr.error){ q("#ev_go").disabled = false; return q("#ev_m").textContent = "Saved the event, but not the people from outside Moose: " + nice(gr.error); }
      if(scope === "after" || (!e && f.rule && f.rule.f)) await sb.rpc("cal_series_copy_guests", { p_id:id }); }
    T(k).sel = dd;
    const em = isEv ? gl.filter(g => (g.email || "").trim()) : [];
    toast(e ? "Saved" : `Added “${t || (kind === "out" ? "Out" : "Working")}” · ${fday(dd)}${sT ? " " + ftime(sT) : ""}`);
    if(em.length) return inviteBox(k, { id, title:t, day:dd, end_day:ed, st:sT, en:fT, virt, link, where:virt ? "" : (q("#ev_l") ? q("#ev_l").value.trim() : "") }, em, () => afterSave(k));
    $("#evm").classList.remove("on"); afterSave(k);
  };
  q("#ev_go").onclick = go;
  if(q("#ev_del")) q("#ev_del").onclick = () => { $("#evm").classList.remove("on"); removeEv(k, e); };
  box.addEventListener("keydown", ev => { if(ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)){ ev.preventDefault(); go(); } });
  if(!e) setTimeout(() => { const ti = q("#ev_t"); if(ti && !ti.value) ti.focus(); }, 50);
}
const normRule = r => { if(!r || !r.f) return {}; const o = { f:r.f, n:r.n || 1 }; if(r.wk) o.wk = true; if(r.f === "week") o.dows = r.dows || []; if(r.f === "month") { o.mode = r.mode || "date"; if(r.mode === "nth" && r.nth != null) o.nth = r.nth; } if(r.until) o.until = r.until; if(r.count) o.count = r.count; return o; };

/* ---------- Edge Function calls ---------- */
async function fnCall(fn, o){ const ss = (await sb.auth.getSession()).data.session;
  const r = await fetch(MM_CONFIG.url + "/functions/v1/" + fn, { method:"POST", headers:{ "content-type":"application/json", apikey:MM_CONFIG.anonKey, authorization:"Bearer " + (ss ? ss.access_token : MM_CONFIG.anonKey) }, body:JSON.stringify(o) });
  return r.json().catch(() => ({ ok:false, error:"No answer from the server." })); }
const pageUrl = (f, qs) => new URL(f + "?" + qs, location.href).href;
const copy = async (txt, btn) => { try { await navigator.clipboard.writeText(txt); if(btn){ const o = btn.textContent; btn.textContent = "Copied ✓"; setTimeout(() => btn.textContent = o, 1500); } } catch(_){ await askTxt("Copy this link:", txt); } };
const lenOpts = (sel, list) => list.map(m => `<option value="${m}" ${m === sel ? "selected" : ""}>${m < 60 ? m + " min" : (m / 60) + (m === 60 ? " hour" : " hours")}</option>`).join("");
const picked = id => [...$("#" + id).querySelectorAll("[data-st]:checked")].map(x => x.dataset.st);
const staffPick = (sel, id) => `<div class="field"><span>Also invite from Moose (optional; shows on their calendar)</span><div class="ppl" id="${id}">${(C.people || []).filter(p => p.id !== myId()).map(p => `<label class="chip ${(sel || []).includes(p.id) ? "on" : ""}"><input type="checkbox" data-st="${p.id}" ${(sel || []).includes(p.id) ? "checked" : ""}>${html(p.name)}</label>`).join("")}</div></div>`;

/* ---------- email invite to people from outside Moose (2026-11-19; cal-invite-send from hello@ with a calendar file) ---------- */
async function inviteBox(k, ev, guests, done){
  const sent = {}; try { const sr = await sb.rpc("cal_invites_sent", { p_event:ev.id }); ((sr && sr.data) || []).forEach(x => sent[x.email] = x); } catch(_){}
  const longDay = s => D(s).toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });
  const when = longDay(ev.day) + (ev.end_day && ev.end_day !== ev.day ? " to " + longDay(ev.end_day) : "") + (ev.st ? " · " + ftime(ev.st) + (ev.en ? " – " + ftime(ev.en) : "") + " Mountain Time" : " · all day");
  const me = (ME && ME.name) || "", fst = me.split(" ")[0] || "Our team";
  const subj0 = "Invitation: " + ev.title + " · " + fday(ev.day) + (ev.st ? " " + ftime(ev.st) : "");
  const place = ev.virt ? (ev.link ? "Join here: " + ev.link : "We'll send the meeting link before we meet.") : ev.where ? "Where: " + ev.where : "";
  const body0 = `Hi {name},\n\n${fst} from Moose Management would like to meet with you.\n\n**${ev.title}**\n${when}${place ? "\n" + place : ""}\n\nThe calendar file is attached so you can add it to your calendar. Just reply to this email if the time doesn't work for you.\n\n${me || "Moose Management"}\nMoose Management\n435-714-6544`;
  const gs = guests.map(g => ({ name:(g.name || "").trim(), email:(g.email || "").trim().toLowerCase() }));
  modal({ h:"✉ Email the invite?", b:`<p class="muted" style="margin:4px 0 10px">The event is saved. Here's the email each person below gets from <b>hello@moosemanagement.com</b>. Nothing is sent until you press Send.</p>
    <div class="field"><span>Send to</span>${gs.map((g, i) => `<label class="chip" style="display:flex;margin:4px 0"><input type="checkbox" data-iv="${i}" ${sent[g.email] && sent[g.email].status === "sent" ? "" : "checked"}><span><b>${html(g.name)}</b> · ${html(g.email)}${sent[g.email] ? ` <span class="muted">· ${sent[g.email].status === "sent" ? "already invited " + html(fday(String(sent[g.email].at).slice(0, 10))) : sent[g.email].status === "failed" ? "last try failed" : "sending…"}</span>` : ""}</span></label>`).join("")}</div>
    <label class="field"><span>Subject</span><input id="iv_s" value="${html(subj0)}"></label>
    <label class="field"><span>Message ({name} = each person's first name, **bold**)</span><textarea id="iv_b" style="min-height:190px">${html(body0)}</textarea></label>
    <div class="field"><span>Preview</span><div id="iv_p" style="border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--card);font-size:14px;line-height:1.45"></div><p class="muted" style="font-size:12px;margin:4px 0 0">📎 invite.ics (adds it to their calendar) · Their reply comes to hello@ in Freshdesk.</p></div>
    <div class="evft"><div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" id="iv_go">Send</button><button class="btn" id="iv_no">Not now</button></div><p class="muted" id="iv_m" style="margin:6px 0 0"></p></div>` });
  const close = () => { $("#evm").classList.remove("on"); done(); };
  $("#evx").onclick = close; $("#evm").onclick = x => { if(x.target === $("#evm")) close(); }; $("#iv_no").onclick = close;
  const ticked = () => [...$("#evcard").querySelectorAll("[data-iv]:checked")].map(x => gs[+x.dataset.iv]);
  const pv = () => { const p = ticked()[0] || gs[0], fn = (p.name.split(" ")[0] || "there"), t = $("#iv_b").value.replaceAll("{name}", fn);
    $("#iv_p").innerHTML = `<div class="muted" style="font-size:12px;margin-bottom:8px">To: ${html(p.name)} &lt;${html(p.email)}&gt;<br>Subject: <b>${html($("#iv_s").value.replaceAll("{name}", fn))}</b></div>` + t.trim().split(/\n{2,}/).map(x => "<p style='margin:0 0 10px'>" + html(x).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/https:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).replace(/\n/g, "<br>") + "</p>").join("");
    const n = ticked().length; $("#iv_go").textContent = n ? `Send ${n} invite${n > 1 ? "s" : ""}` : "Tick someone to send"; $("#iv_go").disabled = !n; };
  $("#iv_b").oninput = pv; $("#iv_s").oninput = pv; $("#evcard").querySelectorAll("[data-iv]").forEach(x => x.onchange = pv); pv();
  $("#iv_go").onclick = async () => { const ppl = ticked(); if(!ppl.length) return;
    $("#iv_go").disabled = true; $("#iv_m").textContent = "Sending…";
    let res; try { res = await fnCall("cal-invite-send", { event_id:ev.id, subject:$("#iv_s").value, body:$("#iv_b").value, people:ppl }); } catch(er){ res = { ok:false, error:nice(er) }; }
    const rs = res.results || [];
    if(!rs.length){ $("#iv_go").disabled = false; return $("#iv_m").textContent = "Not sent: " + (res.error || "try again"); }
    const good = rs.filter(x => x.ok), bad = rs.filter(x => !x.ok);
    $("#iv_m").innerHTML = (good.length ? `✓ Sent to ${good.map(x => html(x.email)).join(", ")}.` : "") + (bad.length ? `<br><span style="color:var(--red)">Not sent: ${bad.map(x => html(x.email) + " (" + html(x.error || "") + ")").join("; ")}</span>` : "");
    if(!bad.length){ $("#iv_go").textContent = "Done"; $("#iv_go").disabled = false; $("#iv_go").onclick = close; } else $("#iv_go").disabled = false; };
}

/* ---------- Schedule a meeting with coworkers (meet_free / meet_invite_save2 / Edge Function meet) ---------- */
function schedForm(k){
  const me = myId(), co = (C.people || []).filter(p => p.id !== me), F = { virt:false, from:null, free:null, tm:null, seq:0 }, sel0 = T(k).sel >= today() ? T(k).sel : today();
  const smNext = () => { const m = Math.ceil((nowMin() + 1) / 15) * 15; return Math.min(m, 23 * 60 + 45); };
  const smStart = d => d === today() && smNext() > 10 * 60 ? hhmm(smNext()) : "10:00";
  modal({ h:"📅 Schedule a meeting", b:`<p class="muted" style="margin:4px 0 0">Pick who's coming and see when you're all free. Everyone you pick gets it on their calendar and can say yes, no or suggest another time. Virtual meetings get a Zoom link and a page you can send to guests too.</p>
    <label class="field"><span>What</span><input id="sm_t" maxlength="120" placeholder="e.g. Plan the Thanksgiving turnovers"></label>
    <div class="field"><span>Who from Moose</span><input id="sm_q" placeholder="Find a coworker…" autocomplete="off" style="margin-bottom:4px"><div class="ppl" id="sm_st">${co.map(p => `<label class="chip" data-n="${html(p.name.toLowerCase())}"><input type="checkbox" data-st="${p.id}">${html(p.name)}</label>`).join("")}</div></div>
    <div class="field"><span>How</span><div class="chips" id="sm_how"><button type="button" class="chip on" data-how="0">👥 In person</button><button type="button" class="chip" data-how="1">💻 Virtual (Zoom)</button></div></div>
    <label class="field" id="sm_wf"><span>Where</span><input id="sm_w" maxlength="200" placeholder="e.g. Moose office, BHL 4205…"></label>
    <div class="rw" style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>Day</span><input type="date" id="sm_d" min="${today()}" value="${sel0}"></label>
      <label class="field" style="flex:1;min-width:120px"><span>Starts</span><select id="sm_s">${tOpts(smStart(sel0))}</select></label>
      <label class="field" style="flex:1;min-width:110px"><span>How long</span><select id="sm_l">${lenOpts(30, [15, 30, 45, 60, 90, 120, 180])}</select></label></div>
    <div class="hc-card" id="sm_fb" style="margin:8px 0"><b>When is everyone free?</b> <span class="muted" style="font-size:12.5px">Pick people above to see.</span></div>
    <label class="field"><span>Note (optional)</span><textarea id="sm_n" maxlength="1000" style="min-height:60px" placeholder="Agenda, what to bring… Don't type codes or passwords."></textarea></label>
    <div class="evft"><button class="btn primary" style="width:100%" id="sm_go">Make the meeting</button><p class="muted" id="sm_m" style="margin:6px 0 0"></p></div>` });
  const box = $("#evcard"); box.addEventListener("change", () => box.querySelectorAll("label.chip").forEach(l => { const i = l.querySelector("input"); if(i) l.classList.toggle("on", i.checked); }));
  const fst = n => (n || "").split(" ")[0];
  const wins = (p, dd) => { if((p.sched_days || []).includes(dd)) return (p.shifts || []).filter(x => x.day === dd).map(x => [toMin(x.s), toMin(x.e) > toMin(x.s) ? toMin(x.e) : 24 * 60]);
    if(p.scheduled) return []; const w = D(dd).getDay(); return w === 0 || w === 6 ? [] : [[8 * 60, 18 * 60]]; };
  const busyAt = (p, dd, s, l) => (p.busy || []).some(x => x.day === dd && toMin(x.s) < s + l && toMin(x.e) > s);
  const freeAt = (p, dd, s, l) => wins(p, dd).some(([a, b2]) => a <= s && s + l <= b2) && !busyAt(p, dd, s, l);
  const H0 = 7 * 60, H1 = 19 * 60;
  const drawFree = () => { const el = $("#sm_fb"); if(!F.free) return;
    const ps = F.free.people, l = +$("#sm_l").value, dsel = $("#sm_d").value, ssel = toMin($("#sm_s").value), days = []; for(let i = 0; i < 7; i++) days.push(addD(F.from, i));
    el.innerHTML = `<b>When is everyone free?</b> <span class="muted" style="font-size:12.5px">${html(fday(F.from))} – ${html(fday(days[6]))} · tap a time to pick it</span>` + days.map(dd => { const sl = [];
      for(let s = H0; s + l <= H1; s += 30){ if(dd === today() && s < nowMin()) continue; sl.push({ s, n:ps.filter(p => freeAt(p, dd, s, l)).length }); }
      const all = sl.filter(x => x.n === ps.length), chp = (x, part) => `<button type="button" class="chip${dd === dsel && x.s === ssel ? " on" : ""}" data-fd="${dd}" data-fs="${hhmm(x.s)}" style="margin:2px 3px 2px 0;${part ? "border-style:dashed" : ""}">${ftime(hhmm(x.s))}${part ? ` · ${x.n} of ${ps.length}` : ""}</button>`;
      const best = sl.filter(x => x.n > 0).sort((a, b2) => b2.n - a.n || a.s - b2.s).slice(0, 3).sort((a, b2) => a.s - b2.s);
      return `<div style="padding:6px 0;border-top:1px solid var(--line);font-size:13px"><b style="display:inline-block;min-width:96px">${html(fday(dd))}</b> ${all.length ? all.slice(0, 10).map(x => chp(x)).join("") + (all.length > 10 ? `<span class="muted">+${all.length - 10} more</span>` : "")
        : best.length && ps.length > 1 ? `<span class="muted">No time everyone's free. Closest:</span> ` + best.map(x => chp(x, true)).join("") : `<span class="muted">No open time</span>`}</div>`; }).join("")
      + `<p class="muted" style="font-size:12px;margin:6px 0 0">Busy = their hub calendar (events, meetings, time off). Working = their hub schedule, or weekdays 8–6. The hub never shows what anyone is busy with.</p>`;
    el.querySelectorAll("[data-fd]").forEach(bt => bt.onclick = () => { $("#sm_d").value = bt.dataset.fd; $("#sm_s").value = bt.dataset.fs; drawFree(); }); };
  const loadFree = async () => { const ids = picked("sm_st"), el = $("#sm_fb");
    if(!ids.length){ F.free = null; el.innerHTML = `<b>When is everyone free?</b> <span class="muted" style="font-size:12.5px">Pick people above to see.</span>`; return; }
    const dd = $("#sm_d").value || today(); F.from = dd; const n = ++F.seq; el.innerHTML = `<b>When is everyone free?</b> <span class="muted">Checking…</span>`;
    const r = await sb.rpc("meet_free", { p_users:ids, p_from:dd, p_to:addD(dd, 6) }); if(n !== F.seq) return;
    if(r.error){ el.innerHTML = `<b>When is everyone free?</b> <span class="muted">Couldn't check: ${html(nice(r.error))}</span>`; return; }
    F.free = r.data; drawFree(); };
  const later = () => { clearTimeout(F.tm); F.tm = setTimeout(loadFree, 400); };
  $("#sm_q").oninput = () => { const s = $("#sm_q").value.trim().toLowerCase(); $("#sm_st").querySelectorAll("[data-n]").forEach(l => l.style.display = !s || l.dataset.n.includes(s) || l.querySelector("input").checked ? "" : "none"); };
  $("#sm_st").addEventListener("change", later);
  $("#sm_how").querySelectorAll("[data-how]").forEach(bt => bt.onclick = () => { F.virt = bt.dataset.how === "1"; $("#sm_how").querySelectorAll("[data-how]").forEach(x => x.classList.toggle("on", x === bt)); $("#sm_wf").style.display = F.virt ? "none" : ""; });
  $("#sm_d").onchange = () => { const dd = $("#sm_d").value; if(dd === today() && toMin($("#sm_s").value) < smNext()) $("#sm_s").value = smStart(dd); if(F.free && dd >= F.from && dd <= addD(F.from, 6)) drawFree(); else if(F.free || picked("sm_st").length) loadFree(); };
  $("#sm_s").onchange = $("#sm_l").onchange = () => drawFree();
  $("#sm_go").onclick = async () => { const t = $("#sm_t").value.trim(); if(!t) return $("#sm_m").textContent = "Add what the meeting is.";
    const staff = picked("sm_st"), dd = $("#sm_d").value, st = $("#sm_s").value, l = +$("#sm_l").value; if(!dd) return $("#sm_m").textContent = "Pick a day.";
    if(dd === today() && toMin(st) < smNext() - 15 && !await ask("That start time has already passed today. Make it anyway?")) return;
    if(F.free && dd >= F.from && dd <= addD(F.from, 6)){ const bz = F.free.people.filter(p => !freeAt(p, dd, toMin(st), l)).map(p => p.me ? "you" : fst(p.name));
      if(bz.length && !await ask(bz.join(", ") + (bz.length === 1 && bz[0] !== "you" ? " looks" : " look") + " busy or off then. Make it anyway?")) return; }
    if(!staff.length && !await ask("No coworkers picked. Make it just for you?")) return;
    $("#sm_go").disabled = true; $("#sm_m").textContent = F.virt ? "Making the meeting and the Zoom link…" : "Making the meeting…";
    let id = null;
    if(F.virt){ const r = await fnCall("meet", { action:"create", title:t, day:dd, start:st, minutes:l, note:$("#sm_n").value, staff }); if(!r.ok){ $("#sm_go").disabled = false; return $("#sm_m").textContent = "Couldn't make it: " + r.error; } id = r.id; }
    else { const r = await sb.rpc("meet_invite_save2", { p_title:t, p_day:dd, p_start:st, p_minutes:l, p_staff:staff, p_note:$("#sm_n").value, p_virtual:false, p_location:$("#sm_w").value });
      if(r.error){ $("#sm_go").disabled = false; return $("#sm_m").textContent = "Couldn't make it: " + nice(r.error); } id = r.data.id; }
    $("#evm").classList.remove("on"); T(k).sel = dd; C.justMade = id; invalidate(); await refresh(k, { force:true });
    const m = (T(k).data.hm || []).find(y => y.id === id); if(m) meetBox(k, m, true); };
}
// a coworker meeting or booking: details, answer, Zoom, move, cancel
function meetBox(k, m, fresh){
  const me = myId(), url = pageUrl("meet.html", "t=" + m.token), canCx = m.mine || (ME && ME.admin), inv = (m.staff || []).includes(me) && !m.mine;
  const coworker = m.kind === "invite", showLink = m.virtual !== false && (canCx || !coworker), my = m.my_answer || null;
  const ansTxt = my ? (my.answer === "yes" ? "✅ You said you're coming" : my.answer === "no" ? "🙅 You said you can't make it" : "🕑 You suggested " + fday(my.sug_day) + " " + ftime(String(my.sug_start).slice(0, 5))) : "Can you make it?";
  const zoomTxt = m.zoom_status === "made" ? `<a class="btn small primary" href="${html(m.zoom_join)}" target="_blank" rel="noopener noreferrer">💻 Join on Zoom</a>`
    : `<span class="pill amber">Zoom link ${m.zoom_status === "failed" ? "not made" : "coming"}</span> <span class="muted" style="font-size:12.5px">${html(m.zoom_error || "")}</span> ${canCx ? `<button class="btn small" id="mz">Try again</button>` : ""}`;
  modal({ h:html(m.title), b:`${fresh ? `<p class="pill green" style="display:inline-block">Made ✓ ${(m.staff || []).length ? "It's on everyone's calendar; they answer here" : "Send the link below"}</p>` : ""}
    <p style="margin:6px 0"><b>${html(fday(m.day))}</b> · ${html(ftime(m.start))}–${html(ftime(endTime(m.start, m.minutes)))} · ${m.minutes} min<br><span class="muted">Host: ${html(m.host || "")}${m.booking ? " · booked on “" + html(m.booking) + "”" : ""} · ${m.virtual === false ? "👥 In person" + (m.location ? " at " + html(m.location) : "") : "💻 Virtual"}</span></p>
    ${inv ? `<div class="hc-card" style="margin:8px 0"><b>${html(ansTxt)}</b><div class="chips" style="margin-top:6px"><button class="chip${my && my.answer === "yes" ? " on" : ""}" data-ma="yes">✅ Yes</button><button class="chip${my && my.answer === "no" ? " on" : ""}" data-ma="no">🙅 Can't make it</button><button class="chip${my && my.answer === "suggest" ? " on" : ""}" data-ma="suggest">🕑 Suggest another time</button></div>
      <div id="ma_sug" style="display:none;gap:8px;flex-wrap:wrap;margin-top:6px"><input type="date" id="ma_d" min="${today()}" value="${html(m.day)}"><select id="ma_s">${tOpts(m.start)}</select></div>
      <input id="ma_n" maxlength="300" placeholder="Note for ${html((m.host || "the host").split(" ")[0])} (optional)" value="${html((my && my.note) || "")}" style="margin-top:6px;width:100%">
      <div id="ma_go" style="display:none;margin-top:6px"><button class="btn small primary" id="ma_send">Send the suggestion</button></div><p class="muted" id="ma_m" style="margin:4px 0 0"></p></div>` : ""}
    ${showLink ? `<div class="field"><span>Link to send (meeting page with the Zoom button and Add to calendar)</span><div style="display:flex;gap:6px"><input readonly value="${html(url)}" style="flex:1"><button class="btn small primary" id="mc">Copy</button></div></div>` : ""}
    ${m.virtual !== false ? `<div style="margin:8px 0">${zoomTxt}</div>` : ""}
    ${m.guest_name ? `<div class="hc-card" style="margin:8px 0"><b>Booked by ${html(m.guest_name)}</b><br>${m.guest_email ? `<a href="mailto:${html(m.guest_email)}">${html(m.guest_email)}</a>` : ""}${m.guest_phone ? " · " + html(m.guest_phone) : ""}${m.guest_note ? `<div class="muted" style="white-space:pre-wrap;margin-top:4px">${html(m.guest_note)}</div>` : ""}</div>` : ""}
    ${m.note ? `<p class="muted" style="white-space:pre-wrap">${html(m.note)}</p>` : ""}
    ${(m.staff || []).length ? `<div class="hc-card" id="mrep" style="margin:8px 0"><b>Who's coming</b> <span class="muted">Loading…</span></div>` : ""}
    <div class="evft"><div style="display:flex;gap:8px;flex-wrap:wrap">${showLink ? `<a class="btn" style="flex:1" href="${html(url)}" target="_blank" rel="noopener">Open the page</a>` : ""}${canCx ? `<button class="btn" id="mmv">Move</button><button class="btn" id="mx">Cancel meeting</button>` : ""}</div><p class="muted" id="mm" style="margin:6px 0 0"></p></div>` });
  const again = () => { $("#evm").classList.remove("on"); afterSave(k); };
  if($("#mc")) $("#mc").onclick = () => copy(url, $("#mc"));
  if($("#mz")) $("#mz").onclick = async () => { $("#mz").disabled = true; const r = await fnCall("meet", { action:"zoom", id:m.id }); if(!r.ok) $("#mm").textContent = r.error;
    const l = await sb.rpc("meet_mine", { p_from:m.day, p_to:m.day }); const n = ((l && l.data) || []).find(x => x.id === m.id); if(n) meetBox(k, n); };
  if($("#mmv")) $("#mmv").onclick = () => moveBox(k, { day:m.day, start:m.start, minutes:m.minutes, title:m.title, note:(m.staff || []).length ? "Everyone on it is asked to answer again for the new time." : "The link you sent stays the same and shows the new time." },
    async (dd, st, mins) => sb.rpc("meet_move", { p_id:m.id, p_day:dd, p_start:st, p_minutes:mins }));
  if($("#mx")) $("#mx").onclick = async () => { const why = await askTxt("Cancel this meeting? It comes off everyone's calendar. Add a note (optional):", ""); if(why === null) return;
    const r = await sb.rpc("meet_cancel", { p_id:m.id, p_note:why }); if(r.error) return $("#mm").textContent = "Couldn't cancel: " + nice(r.error); again(); };
  const reply = async (ans, dd, st) => { $("#ma_m").textContent = "Saving…"; const r = await sb.rpc("meet_reply", { p_id:m.id, p_answer:ans, p_note:$("#ma_n").value, p_sug_day:dd || null, p_sug_start:st || null });
    if(r.error) return $("#ma_m").textContent = "Couldn't save: " + nice(r.error); again(); };
  $("#evcard").querySelectorAll("[data-ma]").forEach(bt => bt.onclick = () => { if(bt.dataset.ma !== "suggest") return reply(bt.dataset.ma);
    $("#ma_sug").style.display = "flex"; $("#ma_go").style.display = ""; $("#ma_m").textContent = "Pick the day and time that works, then Send."; });
  if($("#ma_send")) $("#ma_send").onclick = () => reply("suggest", $("#ma_d").value, $("#ma_s").value);
  if($("#mrep")) sb.rpc("meet_replies", { p_ids:[m.id] }).then(r => { const el = $("#mrep"); if(!el) return;
    if(r.error) return el.innerHTML = `<b>Who's coming</b> <span class="muted">Couldn't load: ${html(nice(r.error))}</span>`;
    const L = r.data || [], c = x => L.filter(y => (y.answer || "") === x).length;
    el.innerHTML = `<b>Who's coming</b> <span class="muted" style="font-size:12.5px">${c("yes")} yes · ${c("no")} can't · ${c("suggest")} suggested a time · ${c("")} waiting</span><div style="font-size:13.5px;margin:4px 0">👑 ${html(m.host || "")} <span class="muted">· host</span></div>
      ${L.sort((a, b2) => (a.name || "").localeCompare(b2.name || "")).map(x => `<div style="font-size:13.5px;margin:4px 0">${x.answer === "yes" ? "✅" : x.answer === "no" ? "🙅" : x.answer === "suggest" ? "🕑" : "❔"} ${html(x.name || nameOf(x.user_id))}
        <span class="muted">· ${x.answer === "yes" ? "coming" : x.answer === "no" ? "can't make it" : x.answer === "suggest" ? "suggests " + html(fday(x.sug_day)) + " " + html(ftime(x.sug_start)) : "hasn't answered"}</span>
        ${x.answer === "suggest" && canCx ? ` <button class="btn small" data-mvto="${html(x.sug_day)}|${html(x.sug_start)}">Move to this time</button>` : ""}${x.note ? `<div class="muted" style="font-size:12.5px;margin-left:24px">“${html(x.note)}”</div>` : ""}</div>`).join("")}`;
    el.querySelectorAll("[data-mvto]").forEach(bt => bt.onclick = async () => { const [dd, st] = bt.dataset.mvto.split("|");
      if(!await ask("Move it to " + fday(dd) + " " + ftime(st) + "? Everyone is asked to answer again.")) return;
      const x = await sb.rpc("meet_move", { p_id:m.id, p_day:dd, p_start:st, p_minutes:m.minutes }); if(x.error) return $("#mm").textContent = "Couldn't move it: " + nice(x.error);
      T(k).sel = dd; again(); }); });
}
function moveBox(k, it, doMove){ const L = [15, 30, 45, 60, 90, 120, 150, 180, 240, 480];
  modal({ h:"Move " + html(it.title), b:`<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>Day</span><input type="date" id="mv_d" value="${html(it.day)}"></label>
    <label class="field" style="flex:1;min-width:120px"><span>Starts</span><select id="mv_s">${tOpts(it.start, 5 * 60)}</select></label>
    <label class="field" style="flex:1;min-width:110px"><span>How long</span><select id="mv_l">${(L.includes(it.minutes) ? L : L.concat([it.minutes]).sort((a, b2) => a - b2)).map(m => `<option value="${m}" ${m === it.minutes ? "selected" : ""}>${m < 60 ? m + " min" : (m / 60) + (m === 60 ? " hour" : " hours")}</option>`).join("")}</select></label></div>
    ${it.note ? `<p class="muted" style="font-size:12.5px">${html(it.note)}</p>` : ""}<div class="evft"><button class="btn primary" style="width:100%" id="mv_go">Move it</button><p class="muted" id="mv_m" style="margin:6px 0 0"></p></div>` });
  $("#mv_go").onclick = async () => { const dd = $("#mv_d").value, st = $("#mv_s").value; if(!dd) return $("#mv_m").textContent = "Pick a day.";
    $("#mv_go").disabled = true; const r = await doMove(dd, st, +$("#mv_l").value);
    if(r && r.error){ $("#mv_go").disabled = false; return $("#mv_m").textContent = "Couldn't move it: " + nice(r.error); }
    $("#evm").classList.remove("on"); T(k).sel = dd; afterSave(k); }; }
async function linksBox(k){
  const r = await sb.rpc("book_links_mine"), L = (r && r.data) || [], me = myId();
  modal({ h:"🔗 Booking links", b:`<p class="muted" style="margin:4px 0 8px">Send a booking link and people pick an open time inside the days and hours you set. Times you're busy on the hub calendar never show. Each booking gets its own Zoom link and lands on your calendar.</p>
    ${ME && ME.admin ? `<div class="hc-card" style="margin:0 0 8px" id="zst"><span class="muted">Checking Zoom…</span></div>` : ""}
    <button class="btn primary" id="bl_new" style="width:100%">+ New booking link</button>
    ${L.length ? L.map(b => `<div class="hc-card" style="margin:8px 0;${b.off ? "opacity:.6" : ""}"><b>${html(b.title)}</b>${b.off ? ` <span class="pill">Off</span>` : ""}${ME && ME.admin && b.owner_id !== me ? ` <span class="muted">· ${html(b.owner)}</span>` : ""}
      <div class="muted" style="font-size:13px">${b.minutes} min · ${html(fday(b.from_day))} – ${html(fday(b.to_day))} · ${DOW.filter((_, i) => b.dows.includes(i)).join(", ")} ${html(ftime(b.day_start.slice(0, 5)))}–${html(ftime(b.day_end.slice(0, 5)))} · ${b.booked} booked</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="btn small primary" data-bc="${html(b.slug)}">Copy link</button><a class="btn small" href="${html(pageUrl("book.html", "l=" + b.slug))}" target="_blank" rel="noopener">Open</a><button class="btn small" data-be="${b.id}">Change</button></div></div>`).join("") : `<p class="muted">No booking links yet.</p>`}<div class="evft" style="border:0"></div>` });
  $("#bl_new").onclick = () => linkForm(k, null);
  if(ME && ME.admin) fnCall("meet", { action:"check" }).then(z => { const el = $("#zst"); if(!el) return;
    el.innerHTML = !z.ok ? `<span class="muted">Couldn't check Zoom: ${html(z.error || "")}</span>` : !z.connected ? `<b>Zoom isn't connected yet.</b>` : z.sign_in !== "ok" ? `<b>Zoom sign-in failed:</b> <span class="muted">${html(z.sign_in)}</span>`
      : `<b>Zoom connected ✓</b> <span class="muted">${z.host_ok ? "Host account OK" : "Host account problem: " + html(z.host_error || "")}${z.waiting ? " · " + z.waiting + " meetings still waiting for a link" : ""}</span>`; });
  $("#evcard").querySelectorAll("[data-bc]").forEach(x => x.onclick = () => copy(pageUrl("book.html", "l=" + x.dataset.bc), x));
  $("#evcard").querySelectorAll("[data-be]").forEach(x => x.onclick = () => linkForm(k, L.find(b => b.id === +x.dataset.be)));
}
function linkForm(k, b){ const t0 = today(), dows = b ? b.dows : [1, 2, 3, 4, 5];
  modal({ h:b ? "Change booking link" : "New booking link", b:`<label class="field"><span>What people book</span><input id="bl_t" maxlength="120" value="${html(b ? b.title : "")}" placeholder="e.g. Owner intro call, Vendor walk-through"></label>
    <label class="field"><span>Meeting length</span><select id="bl_l">${lenOpts(b ? b.minutes : 30, [15, 20, 30, 45, 60, 90, 120])}</select></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>First day they can book</span><input type="date" id="bl_f" value="${html(b ? b.from_day : t0)}"></label><label class="field" style="flex:1;min-width:140px"><span>Last day</span><input type="date" id="bl_e" value="${html(b ? b.to_day : addD(t0, 14))}"></label></div>
    <div class="field"><span>Days of the week</span><div class="chips">${DOW.map((x, i) => `<label class="chip ${dows.includes(i) ? "on" : ""}"><input type="checkbox" data-dw="${i}" ${dows.includes(i) ? "checked" : ""}>${x}</label>`).join("")}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:120px"><span>From</span><select id="bl_s">${tOpts(b ? b.day_start.slice(0, 5) : "09:00")}</select></label><label class="field" style="flex:1;min-width:120px"><span>Until</span><select id="bl_u">${tOpts(b ? b.day_end.slice(0, 5) : "17:00")}</select></label></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>Break between meetings</span><select id="bl_g">${[0, 5, 10, 15, 30].map(m => `<option value="${m}" ${(b ? b.gap_min : 0) === m ? "selected" : ""}>${m ? m + " min" : "None"}</option>`).join("")}</select></label>
      <label class="field" style="flex:1;min-width:140px"><span>Book at least</span><select id="bl_n">${[[0, "Any time"], [1, "1 hour ahead"], [2, "2 hours ahead"], [4, "4 hours ahead"], [12, "12 hours ahead"], [24, "1 day ahead"], [48, "2 days ahead"]].map(([h, l]) => `<option value="${h}" ${(b ? b.notice_h : 4) === h ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <label class="field"><span>Note on the booking page (optional)</span><textarea id="bl_x" maxlength="1000" style="min-height:60px">${html((b && b.note) || "")}</textarea></label>
    ${staffPick(b ? b.staff : [], "bl_st")}${b ? `<label class="chip ${b.off ? "on" : ""}"><input type="checkbox" id="bl_off" ${b.off ? "checked" : ""}>Turn this link off (people can't book)</label>` : ""}
    <div class="evft"><button class="btn primary" style="width:100%" id="bl_go">${b ? "Save" : "Make the link"}</button><p class="muted" id="bl_m" style="margin:6px 0 0"></p></div>` });
  $("#evcard").addEventListener("change", () => $("#evcard").querySelectorAll("label.chip").forEach(l => { const i = l.querySelector("input"); if(i) l.classList.toggle("on", i.checked); }));
  $("#bl_go").onclick = async () => {
    const r = await sb.rpc("book_link_save", { p_id:b ? b.id : null, p_title:$("#bl_t").value, p_minutes:+$("#bl_l").value, p_from:$("#bl_f").value || null, p_to:$("#bl_e").value || null,
      p_dows:[...$("#evcard").querySelectorAll("[data-dw]:checked")].map(x => +x.dataset.dw), p_start:$("#bl_s").value, p_end:$("#bl_u").value, p_gap:+$("#bl_g").value,
      p_notice:+$("#bl_n").value, p_note:$("#bl_x").value, p_staff:picked("bl_st"), p_off:$("#bl_off") ? $("#bl_off").checked : false });
    if(r.error) return $("#bl_m").textContent = "Couldn't save: " + nice(r.error);
    linksBox(k); }; }
// move or skip ONE staff meeting (admins; meeting_move in hub_meeting_moves.sql)
function moveOne(k, m, day){
  const t = today(), reg = occReg(m, t, addD(t, 180)).slice(0, 12), mv = m.moves || [], days = [...new Set(reg.concat(mv.filter(x => x.from >= t).map(x => x.from)))].sort();
  const st = s => { const x = mv.find(y => y.from === s); return x ? (x.kind === "skip" ? " (skipped)" : " (moved to " + fday(x.to) + (x.start ? " " + ftime(x.start) : "") + ")") : ""; };
  modal({ h:"Move one " + html(NAMES[m.meet] || m.meet) + " meeting", b:days.length ? `<label class="field"><span>Which meeting</span><select id="mo_f">${days.map(s => `<option value="${s}" ${s === (day && days.includes(day) ? day : days[0]) ? "selected" : ""}>${html(fday(s) + st(s))}</option>`).join("")}</select></label>
    <label class="field"><span>What to do</span><select id="mo_k"><option value="move">Move it to another day or time</option><option value="skip">Skip it (no meeting that week)</option><option value="undo">Put it back to normal</option></select></label>
    <div id="mo_mv"><label class="field"><span>New day</span><input type="date" id="mo_d" min="${t}"></label><div style="display:flex;gap:10px;flex-wrap:wrap"><label class="field" style="flex:1;min-width:140px"><span>Starts</span><select id="mo_t"><option value="">Same time${m.start ? " (" + html(ftime(m.start)) + ")" : ""}</option>${tOpts("", 5 * 60)}</select></label>
      <label class="field" style="flex:1;min-width:120px"><span>How long</span><select id="mo_m">${lenOpts(m.minutes || 60, [15, 30, 45, 60, 90, 120, 180])}</select></label></div></div>
    <label class="field"><span>Why (optional, everyone who sees the meeting sees it)</span><input id="mo_n" maxlength="300" placeholder="e.g. Thanksgiving week"></label>
    <p class="muted" style="font-size:12px">Only this one meeting changes.</p><div class="evft"><button class="btn primary" style="width:100%" id="mo_s">Save</button><p class="muted" id="mo_e" style="margin:6px 0 0"></p></div>` : `<p class="muted">No meetings coming up in the next 6 months.</p>` });
  if(!days.length) return;
  const q = s => $("#evcard").querySelector(s);
  const sync = () => { const f = q("#mo_f").value, has = mv.some(x => x.from === f), kk = q("#mo_k"); kk.querySelector('[value="undo"]').disabled = !has; if(!has && kk.value === "undo") kk.value = "move";
    q("#mo_mv").style.display = kk.value === "move" ? "" : "none"; q("#mo_m").disabled = !q("#mo_t").value; const x = mv.find(y => y.from === f && y.kind === "move"); if(!q("#mo_d").dataset.touched) q("#mo_d").value = x ? x.to : f; };
  q("#mo_d").oninput = () => q("#mo_d").dataset.touched = "1";
  ["#mo_f", "#mo_k", "#mo_t"].forEach(s => q(s).onchange = () => { if(s === "#mo_f") delete q("#mo_d").dataset.touched; sync(); }); sync();
  q("#mo_s").onclick = async () => { const kk = q("#mo_k").value, st2 = q("#mo_t").value, sv = q("#mo_s"); sv.disabled = true; sv.textContent = "Saving…";
    const r = await sb.rpc("meeting_move", { p_meet:m.meet, p_from:q("#mo_f").value, p_kind:kk, p_to:kk === "move" ? q("#mo_d").value || null : null, p_start:kk === "move" && st2 ? st2 : null, p_minutes:kk === "move" && st2 ? +q("#mo_m").value : null, p_note:q("#mo_n").value || null });
    if(r.error){ sv.disabled = false; sv.textContent = "Save"; return q("#mo_e").textContent = "Couldn't save: " + nice(r.error); }
    $("#evm").classList.remove("on"); C.meets = null; invalidate(); refresh(k, { force:true }); toast("Saved"); };
}

/* ---------- live updates: someone else's change shows by itself ---------- */
function rtStart(){
  if(C.rt || !sb.channel) return;
  try { C.rt = sb.channel("hubcal-" + Math.random().toString(36).slice(2, 9)).on("postgres_changes", { event:"*", schema:"public", table:"hub_cal_events" }, () => rtPing()).subscribe(); } catch(e){ C.rt = null; }
}
function rtPing(){ clearTimeout(C.rtT); C.rtT = setTimeout(() => { invalidate(); const k = C.k;
  if(!k || current() !== k || !C.v || !C.v.querySelector(".hc")){ C.dirty = true; return; }
  if(document.querySelector("#evm.on") || (document.getElementById("hcpop") || {}).classList?.contains("on") || document.querySelector(".hc .dragging")){ C.dirty = true; return; }
  refresh(k, { force:true, quiet:true }); }, 1500); }
function pollStart(){ if(C.poll) return;
  C.poll = setInterval(() => { const k = C.k; if(!k || current() !== k || document.hidden || document.querySelector("#evm.on")) return;
    if((document.getElementById("hcpop") || {}).classList?.contains("on")) return; invalidate(); refresh(k, { force:true, quiet:true }); }, 120000);
  document.addEventListener("visibilitychange", () => { const k = C.k; if(document.hidden || !k || current() !== k) return; const t = T(k);
    if(C.dirty || !t.data || Date.now() - t.data.at > 60000){ C.dirty = false; invalidate(); refresh(k, { force:true, quiet:true }); } });
  // a live change came in while a box was open: catch up once it closes
  setInterval(() => { const k = C.k; if(!C.dirty || !k || current() !== k || document.querySelector("#evm.on") || (document.getElementById("hcpop") || {}).classList?.contains("on") || document.querySelector(".hc .dragging")) return;
    C.dirty = false; refresh(k, { force:true, quiet:true }); }, 3000);
}

/* ---------- the 🔔 bell: calendar reminders (hub.html bellLoad calls window.calBellItems) ---------- */
window.calBellItems = async function(){
  if(typeof sb === "undefined" || !ME) return [];
  const r = await sb.rpc("cal_reminders_mine"); if(r.error || !r.data) return [];
  let seen = []; try { seen = JSON.parse(localStorage.getItem("mm_seen_cal_rem") || "[]"); } catch(e){}
  const now = new Date(), td = today();
  return r.data.filter(x => !seen.includes(x.id)).slice(0, 6).map(x => {
    const st = x.start_time ? String(x.start_time).slice(0, 5) : null, at = new Date(x.day + "T" + (st || "08:00") + ":00"), mins = Math.round((at - now) / 60000);
    const when = !st ? (x.day === td ? "today" : x.day === addD(td, 1) ? "tomorrow" : fday(x.day)) + " (all day)"
      : mins > 0 && mins < 90 ? "starts in " + mins + " min" : mins <= 0 && mins > -120 ? "started " + (-mins) + " min ago" : (x.day === td ? "today " : x.day === addD(td, 1) ? "tomorrow " : fday(x.day) + " ") + ftime(st);
    return { ic:"⏰", t:`${x.title} · ${when}`, s:[st ? fday(x.day) + " " + ftime(st) : fday(x.day), x.virtual ? "💻 virtual" : x.location || ""].filter(Boolean).join(" · "),
      href:`#/${x.cal === "office" ? "cal_office" : "cal_me"}/e${x.event_id}`, k:"bell_cal", cr:[x.id] }; });
};
window.calBellSeen = function(ids){ if(!ids || !ids.length) return; let s = []; try { s = JSON.parse(localStorage.getItem("mm_seen_cal_rem") || "[]"); } catch(e){}
  s = s.concat(ids).slice(-300); try { localStorage.setItem("mm_seen_cal_rem", JSON.stringify(s)); } catch(e){} };
})();
