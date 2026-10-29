/* calendar.js (Brandon 2026-10-29): Calendar desk = Reservations · Office · Personal · Meetings, plus "Your week" on Home.
   We move off the Outlook calendar slowly; the hub starts fresh. Loaded by hub.html; uses its sb / $ / esc / ME / current.
   Data (hub_calendar.sql): cal_stays(from,to) · hub_cal_events (RLS: office = everyone, personal = only you) · cal_event_save ·
   cal_meetings() (tiles for the meetings you can open) · meeting_sched_set (admins set times). Meeting pages: meetings.js.
   Routes: #/cal_res · #/cal_office · #/cal_me · #/cal_meet */
(function(){
const NAMES = { meet_maint:"Monday maintenance", meet_or:"Owner Relations", meet_bd:"Business Development", meet_kd:"Key Data", meet_beyond:"Beyond Pricing", meet_mgr:"Managers", meet_fd:"Office Staff Monthly", meet_track:"Track Business Review", meet_trackmk:"Track Digital Marketing" };
const TABS = [["cal_res","Reservations"],["cal_office","Office"],["cal_me","Personal"],["cal_meet","Meetings"]];
const MGR = ["owner_relations","maint_manager","office_manager","hk_manager"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const CCSS = `
.cal .ctabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px} .cal .ctabs a{text-decoration:none}
.cal .chead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px} .cal .chead h2{margin:0;font-size:21px;flex:1;min-width:160px}
.cal .grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card)}
.cal .grid .dh{font-size:11.5px;font-weight:800;color:var(--muted);padding:6px;text-align:center;background:var(--ground,#f6f4ef);border-bottom:1px solid var(--line)}
.cal .grid .dc{min-height:86px;border:0;border-radius:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 5px;font-size:12px;cursor:pointer;min-width:0;background:none;text-align:left;font:inherit;color:inherit}
.cal .grid .dc:nth-child(7n){border-right:0} .cal .grid .dc.out{background:var(--ground,#f6f4ef);color:var(--muted)}
.cal .grid .dc.today .dn{background:var(--forest,#1d3b2a);color:#fff;border-radius:999px;padding:0 6px}
.cal .grid .dc.sel{outline:2px solid var(--forest,#1d3b2a);outline-offset:-2px}
.cal .dn{font-weight:800;font-size:12.5px;display:inline-block;margin-bottom:2px}
.cal .ev{display:block;font-size:11.5px;line-height:1.25;padding:1px 5px;border-radius:6px;margin:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--moose-soft,#e5efe6);color:var(--moose-ink,#24452c)}
.cal .ev.mt{background:var(--blue-soft,#e6eef9);color:var(--blue,#1f4e8c)} .cal .ev.of{background:var(--amber-soft,#fbf0dc);color:var(--amber,#8a5a00)}
.cal .ev.ar{background:var(--moose-soft,#e5efe6)} .cal .ev.dp{background:var(--line);color:var(--ink-2)}
.cal .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:12px}
.cal .tile{display:block;text-decoration:none;color:inherit;margin:0;transition:box-shadow .15s} .cal .tile:hover{box-shadow:0 4px 16px rgba(10,30,20,.14)}
.cal .tile h3{margin:0 0 2px;font-size:17px} .cal .tile .when{font-size:13px;color:var(--ink-2)} .cal .tile ul{margin:6px 0 0;padding-left:18px;font-size:13px}
.cal .tile .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.cal .list .it{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px} .cal .list .it:last-child{border-bottom:0}
.cal .list .it .d{flex:0 0 92px;color:var(--muted);font-size:13px}
.calwk .it{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:14px} .calwk .it:last-child{border-bottom:0} .calwk .it .d{flex:0 0 96px;color:var(--muted);font-size:13px}
@media (max-width:640px){ .cal .grid .dc{min-height:58px;padding:3px} .cal .ev{font-size:10.5px;padding:0 3px} .cal .list .it .d{flex-basis:74px} }`;
let cssDone = false;
const css = () => { if(cssDone) return; cssDone = true; const s = document.createElement("style"); s.textContent = CCSS; document.head.appendChild(s); };
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const D = s => new Date(s + "T12:00");
const addD = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const fday = s => D(s).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
const ftime = t => { if(!t) return ""; const [h, m] = t.split(":").map(Number); return (h % 12 || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + (h < 12 ? " am" : " pm"); };
const canOffice = () => !!(ME && (ME.admin || (ME.teams || []).some(t => MGR.includes(t))));
const ST = { month:{}, sel:{}, meets:null };
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
const endTime = (t, min) => { const [h, m] = t.split(":").map(Number), x = h * 60 + m + min; return String(Math.floor(x / 60) % 24).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); };
async function meetings(force){ if(ST.meets && !force) return ST.meets; const r = await sb.rpc("cal_meetings"); ST.meets = r.data || []; return ST.meets; }
async function events(a, b){
  const r = await sb.from("hub_cal_events").select("*").eq("off", false).lte("day", b).or(`end_day.gte.${a},and(end_day.is.null,day.gte.${a})`).order("day").order("start_time", { nullsFirst:true });
  return r.data || [];
}
const evOn = (e, s) => e.day <= s && (e.end_day || e.day) >= s;
function tabs(k){ return `<div class="ctabs">${TABS.map(([t, l]) => `<a class="btn small${t === k ? " primary" : ""}" href="#/${t}">${l}</a>`).join("")}</div>`; }
/* month grid; cell(s) returns the inside of one day */
function monthGrid(key, cell){
  const m = ST.month[key] || today().slice(0, 7), first = D(m + "-01"), start = addD(m + "-01", -((first.getDay() + 6) % 7)), t = today();
  let h = `<div class="grid">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x => `<div class="dh">${x}</div>`).join("")}`;
  for(let i = 0; i < 42; i++){ const s = addD(start, i); if(i >= 35 && s.slice(0, 7) !== m) break;
    h += `<button class="dc${s.slice(0, 7) !== m ? " out" : ""}${s === t ? " today" : ""}${ST.sel[key] === s ? " sel" : ""}" data-day="${s}"><span class="dn">${D(s).getDate()}</span>${cell(s)}</button>`; }
  return h + `</div>`;
}
function range(key){ const m = ST.month[key] || today().slice(0, 7), first = D(m + "-01"), a = addD(m + "-01", -((first.getDay() + 6) % 7)); return [a, addD(a, 41)]; }
function monthNav(key, title, extra){
  const m = ST.month[key] || today().slice(0, 7);
  return `<div class="chead"><h2>${esc(title)} · ${D(m + "-01").toLocaleDateString(undefined, { month:"long", year:"numeric" })}</h2>
    <button class="btn small" data-mv="-1" aria-label="Previous month">‹</button><button class="btn small" data-mv="0">Today</button><button class="btn small" data-mv="1" aria-label="Next month">›</button>${extra || ""}</div>`;
}
function wireNav(v, key, redraw){
  v.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => { const n = +b.dataset.mv;
    if(!n){ ST.month[key] = today().slice(0, 7); ST.sel[key] = today(); }
    else { const d = D((ST.month[key] || today().slice(0, 7)) + "-01"); d.setMonth(d.getMonth() + n); ST.month[key] = ymd(d).slice(0, 7); }
    redraw(); });
  v.querySelectorAll("[data-day]").forEach(b => b.onclick = () => { ST.sel[key] = b.dataset.day; redraw(); });
}

window.calView = async function(v, k){
  css();
  if(k === "cal_meet") return meetTiles(v);
  if(k === "cal_res") return resCal(v);
  return evCal(v, k === "cal_office" ? "office" : "personal");
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
  // what's coming up: agenda size per meeting (built live from hub data)
  ms.filter(m => m.meet !== "meet_maint").forEach(async m => {
    const r = await sb.rpc("meeting_agenda", { p_meet:m.meet }), el = v.querySelector(`[data-agenda="${m.meet}"]`); if(!el) return;
    const it = (r.data && r.data.items) || [], g = [...new Set(it.map(x => x.grp))];
    el.innerHTML = it.length ? `<b>${it.length} to discuss</b>: ${esc(g.slice(0, 4).join(" · "))}${g.length > 4 ? " · +" + (g.length - 4) + " more" : ""}` : "Nothing came up from the data this week."; });
}

/* ---------- Reservations: arrivals / departures by day ---------- */
async function resCal(v){
  const key = "cal_res"; if(!ST.sel[key]) ST.sel[key] = today();
  v.innerHTML = `<div class="page cal">${tabs(key)}<p class="muted">Loading stays…</p></div>`;
  const [a, b] = range(key), r = await sb.rpc("cal_stays", { p_from:a, p_to:b });
  if(current() !== key) return;
  const data = r.data || { stays:[] }, st = data.stays || [];
  const draw = () => {
    const sel = ST.sel[key], arr = st.filter(x => x.in === sel), dep = st.filter(x => x.out === sel), inh = st.filter(x => x.in <= sel && x.out > sel);
    const row = (x, what) => `<div class="it"><span class="d">${esc(x.unit)}</span><span style="flex:1">${x.owner ? `<span class="pill amber">Owner</span> ` : ""}${esc(x.guest || "")}<span class="muted"> · ${what} · ${x.nights} night${x.nights === 1 ? "" : "s"}${x.type ? " · " + esc(x.type) : ""}</span></span></div>`;
    v.innerHTML = `<div class="page cal">${tabs(key)}${monthNav(key, "Reservations")}
      ${monthGrid(key, s => { const na = st.filter(x => x.in === s).length, nd = st.filter(x => x.out === s).length;
        return (na ? `<span class="ev ar">↘ ${na} in</span>` : "") + (nd ? `<span class="ev dp">↗ ${nd} out</span>` : ""); })}
      <div class="card list" style="margin-top:12px"><b style="font-size:16px">${esc(fday(sel))}</b><span class="muted"> · ${inh.length} home${inh.length === 1 ? "" : "s"} with someone in</span>
        <h4 style="margin:10px 0 2px">Arriving (${arr.length})</h4>${arr.map(x => row(x, "until " + fday(x.out))).join("") || `<p class="muted" style="margin:2px 0">None</p>`}
        <h4 style="margin:10px 0 2px">Leaving (${dep.length})</h4>${dep.map(x => row(x, "since " + fday(x.in))).join("") || `<p class="muted" style="margin:2px 0">None</p>`}</div>
      <p class="muted" style="font-size:12px">Source: ${esc(data.source || "Track reservations")}. Guest names only; contact info stays on Home for the teams that have it.</p></div>`;
    wireNav(v, key, () => { const [a2] = range(key); if(a2 !== a) resCal(v); else draw(); });
  };
  draw();
}

/* ---------- Office + Personal events (Personal also shows your meetings) ---------- */
async function evCal(v, cal){
  const key = cal === "office" ? "cal_office" : "cal_me"; if(!ST.sel[key]) ST.sel[key] = today();
  v.innerHTML = `<div class="page cal">${tabs(key)}<p class="muted">Loading…</p></div>`;
  const [a, b] = range(key);
  const [evs, ms] = await Promise.all([events(a, b), cal === "personal" ? meetings() : Promise.resolve([])]);
  if(current() !== key) return;
  const mine = evs.filter(e => e.cal === cal), office = cal === "personal" ? evs.filter(e => e.cal === "office") : [];
  const mt = []; ms.forEach(m => occurs(m, a, b).forEach(s => mt.push({ meet:m.meet, day:s, start:m.start, minutes:m.minutes })));
  const canAdd = cal === "personal" || canOffice();
  const evTxt = e => (e.start_time ? ftime(e.start_time.slice(0, 5)) + " " : "") + e.title;
  const draw = () => {
    const sel = ST.sel[key];
    const dayList = [...mt.filter(x => x.day === sel).map(x => ({ t:x.start || "", h:`<a href="#/${x.meet}"><b>${esc(NAMES[x.meet])} meeting</b></a>${x.start ? ` <span class="muted">${ftime(x.start)}${x.minutes ? "–" + ftime(endTime(x.start, x.minutes)) : ""}</span>` : ""}` })),
      ...mine.filter(e => evOn(e, sel)).map(e => ({ t:(e.start_time || "").slice(0, 5), h:`<a href="#" data-ev="${e.id}"><b>${esc(e.title)}</b></a> <span class="muted">${e.start_time ? ftime(e.start_time.slice(0, 5)) + (e.end_time ? "–" + ftime(e.end_time.slice(0, 5)) : "") : "All day"}${e.location ? " · " + esc(e.location) : ""}</span>${e.notes ? `<div class="muted" style="font-size:13px">${esc(e.notes)}</div>` : ""}` })),
      ...office.filter(e => evOn(e, sel)).map(e => ({ t:(e.start_time || "").slice(0, 5), h:`<span class="pill amber">Office</span> ${esc(e.title)}` }))].sort((x, y) => x.t.localeCompare(y.t));
    v.innerHTML = `<div class="page cal">${tabs(key)}${monthNav(key, cal === "office" ? "Office" : "My calendar", canAdd ? `<button class="btn small primary" id="evadd">+ Event</button>` : "")}
      ${monthGrid(key, s => mt.filter(x => x.day === s).map(x => `<span class="ev mt">${esc((x.start ? ftime(x.start) + " " : "") + NAMES[x.meet])}</span>`).join("")
        + mine.filter(e => evOn(e, s)).map(e => `<span class="ev${cal === "office" ? " of" : ""}">${esc(evTxt(e))}</span>`).join("")
        + office.filter(e => evOn(e, s)).map(e => `<span class="ev of">${esc(evTxt(e))}</span>`).join(""))}
      <div class="card list" style="margin-top:12px"><b style="font-size:16px">${esc(fday(sel))}</b>${dayList.length ? dayList.map(x => `<div class="it"><span style="flex:1">${x.h}</span></div>`).join("") : `<p class="muted" style="margin:6px 0 0">Nothing on this day.</p>`}</div>
      <p class="muted" style="font-size:12px">${cal === "office" ? "Office events: everyone on the hub sees them." : "Only you see your personal events. Meetings come from Calendar ▸ Meetings; office events show in amber."}</p>
      <div class="modal" id="evm"><div class="card" id="evcard"></div></div></div>`;
    wireNav(v, key, () => { const [a2] = range(key); if(a2 !== a) evCal(v, cal); else draw(); });
    if($("#evadd")) $("#evadd").onclick = () => form(null);
    v.querySelectorAll("[data-ev]").forEach(x => x.onclick = e => { e.preventDefault(); form(mine.find(y => y.id === +x.dataset.ev)); });
  };
  const form = e => {
    const edit = !!e, ro = edit && cal === "office" && !canOffice();
    $("#evcard").innerHTML = `<div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:20px;flex:1;margin:0">${edit ? "Event" : cal === "office" ? "New office event" : "New personal event"}</h2><button class="btn small" id="evx" aria-label="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>
      <label class="field"><span>What</span><input id="ev_t" value="${esc(e ? e.title : "")}" ${ro ? "disabled" : ""}></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1"><span>Day</span><input type="date" id="ev_d" value="${esc(e ? e.day : ST.sel[key])}"></label><label class="field" style="flex:1"><span>Until (optional)</span><input type="date" id="ev_e" value="${esc(e && e.end_day || "")}"></label></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1"><span>Starts (blank = all day)</span><input type="time" id="ev_s" value="${esc(e && e.start_time ? e.start_time.slice(0, 5) : "")}"></label><label class="field" style="flex:1"><span>Ends</span><input type="time" id="ev_f" value="${esc(e && e.end_time ? e.end_time.slice(0, 5) : "")}"></label></div>
      <label class="field"><span>Where</span><input id="ev_l" value="${esc(e && e.location || "")}"></label>
      <label class="field"><span>Notes</span><textarea id="ev_n" style="min-height:70px" placeholder="Don't type codes or passwords here.">${esc(e && e.notes || "")}</textarea></label>
      <div style="display:flex;gap:8px"><button class="btn primary" style="flex:1" id="ev_go">Save</button>${edit ? `<button class="btn" id="ev_off">Remove</button>` : ""}</div><p class="muted" id="ev_m"></p>`;
    $("#evm").classList.add("on");
    $("#evx").onclick = () => $("#evm").classList.remove("on");
    const save = async off => { const t = $("#ev_t").value.trim(), d = $("#ev_d").value;
      if(!t || !d) return $("#ev_m").textContent = "Add what and which day.";
      const r = await sb.rpc("cal_event_save", { p_id:e ? e.id : null, p_cal:cal, p_title:t, p_day:d, p_end_day:$("#ev_e").value || null,
        p_start:$("#ev_s").value || null, p_end:$("#ev_f").value || null, p_location:$("#ev_l").value, p_notes:$("#ev_n").value, p_off:!!off });
      if(r.error) return $("#ev_m").textContent = "Couldn't save: " + r.error.message;
      ST.sel[key] = d; evCal(v, cal); };
    $("#ev_go").onclick = () => save(false);
    if($("#ev_off")) $("#ev_off").onclick = () => { if(confirm("Remove this event from the calendar?")) save(true); };
  };
  draw();
}

/* ---------- Home: your next 7 days (meetings you can open, office events, your own events) ---------- */
window.calHomeCard = async function(el){
  if(!el) return; css();
  const t = today(), b = addD(t, 6);
  const [ms, evs] = await Promise.all([meetings(true), events(t, b)]);
  const rows = [];
  ms.forEach(m => occurs(m, t, b).forEach(s => rows.push({ d:s, t:m.start || "", h:`<a href="#/${m.meet}"><b>${esc(NAMES[m.meet])} meeting</b></a>${m.start ? " · " + ftime(m.start) : ""}${m.open_tasks ? ` <span class="muted">· ${m.open_tasks} open task${m.open_tasks === 1 ? "" : "s"}</span>` : ""}` })));
  evs.forEach(e => { for(let s = e.day < t ? t : e.day; s <= (e.end_day || e.day) && s <= b; s = addD(s, 1))
    rows.push({ d:s, t:(e.start_time || "").slice(0, 5), h:`${e.cal === "office" ? `<span class="pill amber">Office</span> ` : ""}${esc(e.title)}${e.start_time ? " · " + ftime(e.start_time.slice(0, 5)) : ""}` }); });
  rows.sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t));
  el.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><b style="font-size:17px">🗓️ Your week</b><a class="btn small" style="margin-left:auto" href="#/cal_me">Calendar</a></div>
    <div class="calwk">${rows.length ? rows.map(r => `<div class="it"><span class="d">${r.d === t ? "Today" : esc(fday(r.d))}</span><span style="flex:1">${r.h}</span></div>`).join("") : `<p class="muted">Nothing on your calendar in the next 7 days.</p>`}</div>`;
};
})();
