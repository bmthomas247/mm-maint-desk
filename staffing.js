/* staffing.js (Brandon 2026-10-29: "we can call it the Staffing Desk"; first piece "Clock in/out + hours"; "Victor + managers + admins").
   Step 4 of the move-off-Hubstaff plan, for people who clock in the hub instead of Hubstaff (team hub_clock; Victor first).
   Loaded by hub.html; uses its sb / $ / esc / ME. Route #/staffing. Data (hub_staffing.sql): hub_clock (RLS hub_staff_sees: you,
   your manager, admins) · clock_punch(in/out + one location pin) · clock_add (missed punch: yours waits for the manager, a manager's
   counts) · clock_decide (approve / deny / set off) · hub_clock_weeks + clock_week_ok (manager signs off a Sun-Sat week) · clock_people().
   Staffing drop-down (Brandon 2026-10-29): Clock In / Clock Out (#/staffing) · Schedule (#/stf_sched, staffSched) · Request Time Off (#/cal_off, calendar.js).
   Hours: each "in" pairs with the next "out" and counts on the day of the "in" (Park City time). No pay rates here. */
(function(){
const TZ = "America/Denver", DAY = 864e5;
const dkey = t => new Date(t).toLocaleDateString("en-CA", { timeZone:TZ });
const tm = t => new Date(t).toLocaleTimeString([], { timeZone:TZ, hour:"numeric", minute:"2-digit" });
const dnm = k => new Date(k + "T12:00:00Z").toLocaleDateString([], { timeZone:"UTC", weekday:"short", month:"short", day:"numeric" });
const addK = (k, n) => new Date(Date.parse(k + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const wk = k => addK(k, -new Date(k + "T12:00:00Z").getUTCDay());   // Sunday that starts the week
const hm = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`; };
const SS = { week:null, places:null };
const CSS = `.stf .big{font-size:20px;padding:14px 28px;border-radius:12px}.stf .clk{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between}
.stf table{width:100%;border-collapse:collapse}.stf td,.stf th{padding:6px 8px;border-bottom:1px solid var(--line,#e5e7eb);text-align:left;vertical-align:top;font-size:14px}
.stf .r{text-align:right}.stf .sm{font-size:12px}.stf .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.stf .tow{overflow-x:auto}
.stf input,.stf select{font:inherit;padding:6px 8px;border:1px solid var(--line,#d1d5db);border-radius:8px}`;
let cssOn = false;
const css = () => { if(cssOn) return; cssOn = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); };

// nearest home to a pin (Track unit points, same source as the Trash page); worked out here, never saved
async function places(){ if(SS.places) return SS.places;
  const r = await sb.from("lock_places").select("lat,lng,properties(code)").limit(2000);
  SS.places = (r.data || []).filter(x => x.lat && x.lng && x.properties).map(x => ({ lat:+x.lat, lng:+x.lng, code:x.properties.code })); return SS.places; }
const dist = (a, b, c, d) => { const R = 6371e3, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r * Math.cos((a + c) / 2 * r); return R * Math.sqrt(x * x + y * y); };
function where(p, pl){
  if(p.lat == null) return p.source === "added" ? "" : `<span class="muted sm">no location</span>`;
  let best = null; for(const h of pl){ const m = dist(p.lat, p.lng, h.lat, h.lng); if(!best || m < best.m) best = { m, code:h.code }; }
  const near = best && best.m < 250 ? `near ${esc(best.code)}` : "pin";
  return `<a class="sm" href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener">📍 ${near}</a>`;
}

// pair punches into shifts; returns {days:{k:[shift]}, open, odd}
function shifts(rows){
  const ok = rows.filter(p => p.status === "ok").sort((a, b) => a.at < b.at ? -1 : 1), out = { days:{}, open:null, odd:[] };
  let cur = null;
  for(const p of ok){
    if(p.kind === "in"){ if(cur) out.odd.push(cur); cur = p; }
    else if(cur){ const k = dkey(cur.at); (out.days[k] = out.days[k] || []).push({ a:cur, b:p, h:(Date.parse(p.at) - Date.parse(cur.at)) / 36e5 }); cur = null; }
    else out.odd.push(p);
  }
  if(cur){ if(Date.now() - Date.parse(cur.at) < 20 * 36e5) out.open = cur; else out.odd.push(cur); }
  return out;
}
const weekHours = (s, w) => { let h = 0; for(let i = 0; i < 7; i++) (s.days[addK(w, i)] || []).forEach(x => h += x.h); return Math.round(h * 100) / 100; };

function weekTable(rows, w, pl, boss){
  const s = shifts(rows), today = dkey(Date.now());
  let h = "";
  for(let i = 0; i < 7; i++){ const k = addK(w, i), l = s.days[k] || [], t = l.reduce((a, x) => a + x.h, 0);
    const open = s.open && dkey(s.open.at) === k;
    if(!l.length && !open && k !== today) { h += `<tr><td>${dnm(k)}</td><td class="muted">—</td><td></td></tr>`; continue; }
    h += `<tr><td>${dnm(k)}</td><td>${l.map(x => `${tm(x.a.at)} – ${tm(x.b.at)} <span class="muted sm">(${hm(x.h)})</span> ${where(x.a, pl)}${boss ? offBtn(x.a) + offBtn(x.b) : ""}`).join("<br>")}
      ${open ? `${l.length ? "<br>" : ""}${tm(s.open.at)} – <b>still clocked in</b> ${where(s.open, pl)}${boss ? offBtn(s.open) : ""}` : ""}${!l.length && !open ? `<span class="muted">—</span>` : ""}</td><td class="r">${t ? hm(t) : ""}</td></tr>`; }
  const odd = s.odd.filter(p => wk(dkey(p.at)) === w);
  return `<div class="tow"><table><tr><th>Day</th><th>In – out</th><th class="r">Hours</th></tr>${h}
    <tr><td colspan="2"><b>Week</b></td><td class="r"><b>${hm(weekHours(s, w))}</b></td></tr></table></div>
    ${odd.length ? `<p class="sm" style="color:#b45309;margin:6px 0 0">⚠ ${odd.map(p => `${dnm(dkey(p.at))} ${tm(p.at)}: clocked ${p.kind} with no matching clock-${p.kind === "in" ? "out" : "in"}${boss ? offBtn(p) : ""}`).join(" · ")}. ${boss ? "Add the missing punch or set this one off." : "Use “Forgot to clock in or out?” below."}</p>` : ""}`;
}
const offBtn = p => ` <button class="btn small" data-off="${p.id}" title="Set this punch off (it stops counting; kept in the log)">✕</button>`;
const pendRow = (p, nm, boss) => `<tr><td>${nm ? `<b>${esc(nm)}</b><br>` : ""}${dnm(dkey(p.at))} ${tm(p.at)} · clock ${p.kind}</td><td class="sm">${esc(p.note || "")}</td>
  <td class="r">${boss ? `<button class="btn small primary" data-ok="${p.id}">Approve</button> <button class="btn small" data-no="${p.id}">Deny</button>` : `<span class="pill amber">Waiting for your manager</span>`}</td></tr>`;
const addForm = (uid, boss) => `<details class="card"><summary><b>${boss ? "Add a missed punch" : "Forgot to clock in or out?"}</b></summary>
  <div class="row" style="margin-top:8px"><select data-ak="${uid}"><option value="in">Clock in</option><option value="out">Clock out</option></select>
  <input type="datetime-local" data-at="${uid}"><input data-an="${uid}" placeholder="${boss ? "Note (optional)" : "What happened? (your manager sees it)"}" style="flex:1;min-width:180px">
  <button class="btn primary" data-add="${uid}">${boss ? "Add" : "Send to my manager"}</button></div></details>`;

window.staffingView = async function(v){
  css();
  v.innerHTML = `<div class="page stf"><p class="muted">Loading…</p></div>`;
  const today = dkey(Date.now()), w = SS.week || wk(today);
  const [pp, cr, wr, pl] = await Promise.all([sb.rpc("clock_people"), sb.from("hub_clock").select("*").gte("at", addK(w, -7) + "T00:00:00Z").order("at"),
    sb.from("hub_clock_weeks").select("*").order("approved_at", { ascending:false }), places().catch(() => [])]);
  const ppl = pp.data || [], all = cr.data || [], weeks = wr.data || [];
  const meP = ppl.find(p => p.is_me), myId = meP && meP.user_id, meOn = !!meP, team = ppl.filter(p => !p.is_me);
  const pend = await sb.from("hub_clock").select("*").eq("status", "pending").order("at");
  const pendAll = pend.data || [];
  const wkOk = (u, wk_) => weeks.find(x => x.user_id === u && x.week === wk_);
  const nav = `<div class="row" style="margin:0 0 10px"><button class="btn small" data-w="-7">← Week before</button><b>Week of ${dnm(w)}</b>
    ${w < wk(today) ? `<button class="btn small" data-w="7">Next week →</button> <button class="btn small" data-w="0">This week</button>` : ""}</div>`;
  let h = `<div class="page stf wide"><h2 style="margin:0 0 10px">Staffing</h2>`;
  if(meOn){
    const mine = all.filter(p => p.user_id === myId), s = shifts(mine), last = mine.filter(p => p.status === "ok").slice(-1)[0];
    const isIn = last && last.kind === "in";
    const ok = wkOk(myId, w);
    h += `<div class="card clk"><div><div style="font-size:18px"><b>${isIn ? "You're clocked in" : "You're clocked out"}</b></div>
        <div class="muted">${isIn ? `since ${tm(last.at)}${dkey(last.at) !== today ? " " + dnm(dkey(last.at)) : ""} · ${hm((Date.now() - Date.parse(last.at)) / 36e5)}` : last ? `last clocked out ${dnm(dkey(last.at))} ${tm(last.at)}` : "Tap Clock in when you start work."}</div>
        <div class="muted sm">This week: ${hm(weekHours(s, wk(today)) + (s.open ? (Date.now() - Date.parse(s.open.at)) / 36e5 : 0))}</div></div>
      <button class="btn primary big" id="punch" data-k="${isIn ? "out" : "in"}">${isIn ? "Clock out" : "Clock in"}</button></div>
      <p class="muted sm" style="margin:-4px 0 10px">Your phone's location is saved once when you clock in or out (only you, your manager and Brandon/Kim see it). Not during the day.</p>
      <div class="card">${nav}${weekTable(mine, w, pl, false)}${ok ? `<p class="sm" style="margin:6px 0 0">✅ Approved by ${esc(ok.approved_by)} (${hm(+ok.hours)})</p>` : ""}</div>
      ${pendAll.filter(p => p.user_id === myId).length ? `<div class="card"><b>Waiting for your manager</b><table>${pendAll.filter(p => p.user_id === myId).map(p => pendRow(p, null, false)).join("")}</table></div>` : ""}
      ${addForm(myId, false)}`;
  }
  if(team.length){
    const wait = pendAll.filter(p => p.user_id !== myId);
    if(wait.length) h += `<div class="card"><b style="font-size:16px">Waiting for you (${wait.length})</b><table>${wait.map(p => pendRow(p, (ppl.find(x => x.user_id === p.user_id) || {}).name, true)).join("")}</table></div>`;
    h += `<div class="card"><b style="font-size:16px">${ME.admin ? "Everyone on the hub clock" : "Your team on the hub clock"}</b>${meOn ? "" : nav}
      ${team.map(p => { const rows = all.filter(x => x.user_id === p.user_id), s = shifts(rows), ok = wkOk(p.user_id, w), hrs = weekHours(s, w);
        const last = rows.filter(x => x.status === "ok").slice(-1)[0], now = last && last.kind === "in" && s.open;
        const changed = ok && Math.abs(+ok.hours - hrs) > 0.01;
        return `<details style="margin:8px 0" ${team.length === 1 ? "open" : ""}><summary><b>${esc(p.name)}</b> · ${hm(hrs)} ${now ? `<span class="pill green">clocked in since ${tm(last.at)}</span>` : ""}
          ${ok ? `<span class="pill ${changed ? "amber" : "green"}">${changed ? `approved at ${hm(+ok.hours)}, changed since` : `approved by ${esc(ok.approved_by)}`}</span>` : ""}</summary>
          ${weekTable(rows, w, pl, true)}
          <div class="row" style="margin-top:6px">${(!ok || changed) && w < wk(today) ? `<button class="btn small primary" data-wok="${p.user_id}" data-h="${hrs}">Approve ${hm(hrs)} for this week</button>` : w >= wk(today) ? `<span class="muted sm">Approve the week once it's over.</span>` : ""}</div>
          ${addForm(p.user_id, true)}</details>`; }).join("")}</div>`;
  } else if(!meOn) h += `<div class="card"><p class="muted" style="margin:0">Nobody on your team clocks in on the hub yet. People move here from Hubstaff one at a time.</p></div>`;
  h += `<p class="muted sm">Hours count from each clock-in to the next clock-out, on the day of the clock-in (Park City time). Source: the hub time clock.</p></div>`;
  v.innerHTML = h;
  const re = () => staffingView(v), err = r => { if(r.error){ alert(r.error.message.replace(/^.*?: /, "")); return true; } return false; };
  v.querySelectorAll("[data-w]").forEach(b => b.onclick = () => { const n = +b.dataset.w; SS.week = n ? addK(w, n) : null; re(); });
  const pb = v.querySelector("#punch");
  if(pb) pb.onclick = () => { pb.disabled = true; pb.textContent = "Getting your location…";
    const go = (lat, lng, acc) => sb.rpc("clock_punch", { p_kind:pb.dataset.k, p_lat:lat, p_lng:lng, p_acc:acc }).then(r => { err(r); re(); });
    if(!navigator.geolocation) return go(null, null, null);
    navigator.geolocation.getCurrentPosition(p => go(p.coords.latitude, p.coords.longitude, Math.round(p.coords.accuracy)), () => go(null, null, null), { enableHighAccuracy:true, timeout:10000, maximumAge:60000 }); };
  v.querySelectorAll("[data-add]").forEach(b => b.onclick = async () => { const u = b.dataset.add, at = v.querySelector(`[data-at="${u}"]`).value;
    if(!at) return alert("Pick the date and time.");
    const r = await sb.rpc("clock_add", { p_user:u, p_kind:v.querySelector(`[data-ak="${u}"]`).value, p_at:new Date(at).toISOString(), p_note:v.querySelector(`[data-an="${u}"]`).value });
    if(!err(r)) re(); });
  v.querySelectorAll("[data-ok]").forEach(b => b.onclick = async () => { if(!err(await sb.rpc("clock_decide", { p_id:+b.dataset.ok, p_status:"ok", p_note:null }))) re(); });
  v.querySelectorAll("[data-no]").forEach(b => b.onclick = async () => { const n = prompt("Why? (optional)"); if(n === null) return; if(!err(await sb.rpc("clock_decide", { p_id:+b.dataset.no, p_status:"denied", p_note:n }))) re(); });
  v.querySelectorAll("[data-off]").forEach(b => b.onclick = async () => { const n = prompt("Why should this punch stop counting? (kept in the log)"); if(!n) return; if(!err(await sb.rpc("clock_decide", { p_id:+b.dataset.off, p_status:"off", p_note:n }))) re(); });
  v.querySelectorAll("[data-wok]").forEach(b => b.onclick = async () => { if(!confirm(`Approve ${hm(+b.dataset.h)} for the week of ${dnm(w)}?`)) return;
    if(!err(await sb.rpc("clock_week_ok", { p_user:b.dataset.wok, p_week:w, p_hours:+b.dataset.h, p_note:null }))) re(); });
};

/* ---------- Staffing ▸ Schedule (Brandon 2026-10-29). Who works when this week: Hubstaff work schedules (cal_office, until schedules
   are set in the hub), time off (Hubstaff + asked in the hub) and "I'm out / I'm working" from the Office calendar. Everyone sees it,
   same as the Office calendar. ---------- */
const t12 = t => { if(!t) return ""; const [H, M] = t.split(":").map(Number); return `${H % 12 || 12}${M ? ":" + String(M).padStart(2, "0") : ""}${H < 12 ? "a" : "p"}`; };
window.staffSched = async function(v){
  css();
  const today = dkey(Date.now()), w = SS.sched || wk(today), e = addK(w, 6);
  v.innerHTML = `<div class="page stf wide"><p class="muted">Loading…</p></div>`;
  const [ox, tor, ev, pp] = await Promise.all([sb.rpc("cal_office", { p_from:w, p_to:e }), sb.rpc("timeoff_calendar", { p_from:w, p_to:e }),
    sb.from("hub_cal_events").select("day,end_day,kind,person_id,start_time,end_time,off").eq("cal", "office").lte("day", e), sb.rpc("cal_people")]);
  if(current() !== "stf_sched") return;
  const o = ox.data || { shifts:[], off:[] }, ppl = pp.data || [], cell = {};
  const put = (u, d, x) => { if(!u || d < w || d > e) return; ((cell[u] = cell[u] || {})[d] = cell[u][d] || []).push(x); };
  (o.shifts || []).forEach(x => put(x.user_id, x.day, `<div>${t12(x.start)}–${t12(x.end)}</div>`));
  (o.off || []).forEach(x => put(x.user_id, x.day, `<span class="pill red">Off${x.start ? " " + t12(x.start) + "–" + t12(x.end) : ""}</span>`));
  ((tor && tor.data) || []).filter(r => !(r.status === "approved" && r.hs_request_id)).forEach(r => { for(let d = r.day; d <= r.end_day; d = addK(d, 1))
    put(r.user_id, d, r.status === "pending" ? `<span class="pill amber">Asked off</span>` : `<span class="pill red">Off${r.start ? " " + t12(r.start) + "–" + t12(r.end) : ""}</span>`); });
  ((ev && ev.data) || []).filter(x => !x.off && (x.kind === "out" || x.kind === "working")).forEach(x => { for(let d = x.day; d <= (x.end_day || x.day); d = addK(d, 1))
    put(x.person_id, d, x.kind === "out" ? `<span class="pill red">Out${x.start_time ? " " + t12(x.start_time) + "–" + t12(x.end_time) : ""}</span>` : `<span class="pill green">Working${x.start_time ? " " + t12(x.start_time) + "–" + t12(x.end_time) : ""}</span>`); });
  const rows = ppl.filter(p => cell[p.id]).sort((a, b) => a.name.localeCompare(b.name)), none = ppl.filter(p => !cell[p.id]);
  const days = [...Array(7)].map((_, i) => addK(w, i));
  v.innerHTML = `<div class="page stf wide"><h2 style="margin:0 0 10px">Schedule</h2>
    <div class="card"><div class="row" style="margin:0 0 10px"><button class="btn small" data-w="-7">← Week before</button><b>Week of ${dnm(w)}</b>
      <button class="btn small" data-w="7">Next week →</button>${w !== wk(today) ? ` <button class="btn small" data-w="0">This week</button>` : ""}</div>
    <div class="tow"><table><tr><th>Who</th>${days.map(d => `<th${d === today ? ' style="color:var(--forest,#3c5f12)"' : ""}>${dnm(d)}</th>`).join("")}</tr>
      ${rows.map(p => `<tr><td><b>${esc(p.name)}</b></td>${days.map(d => `<td class="sm"${d === today ? ' style="background:var(--pine-soft,#eaf3da)"' : ""}>${(cell[p.id][d] || []).join("") || `<span class="muted">—</span>`}</td>`).join("")}</tr>`).join("")
        || `<tr><td colspan="8" class="muted">Nothing scheduled this week.</td></tr>`}</table></div>
    ${none.length ? `<p class="muted sm" style="margin:8px 0 0">No schedule this week: ${none.map(p => esc(p.name.split(" ")[0])).join(", ")}.</p>` : ""}</div>
    <p class="muted sm">Sources: work schedules from Hubstaff${o.at ? " (updated " + esc(new Date(o.at).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })) + ")" : ""}; time off from Hubstaff and the hub; Out / Working from the Office calendar. Ask for time off under Staffing ▸ Request Time Off.</p></div>`;
  v.querySelectorAll("[data-w]").forEach(b => b.onclick = () => { const n = +b.dataset.w; SS.sched = n ? addK(w, n) : null; staffSched(v); });
};
})();
