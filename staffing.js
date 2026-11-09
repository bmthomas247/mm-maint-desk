/* staffing.js (Brandon 2026-10-29: "we can call it the Staffing Desk"; first piece "Clock in/out + hours"; "Victor + managers + admins").
   Step 4 of the move-off-Hubstaff plan, for people who clock in the hub instead of Hubstaff (team hub_clock; Victor first).
   Loaded by hub.html; uses its sb / $ / esc / ME. Route #/staffing. Data (hub_staffing.sql): hub_clock (RLS hub_staff_sees: you,
   your manager, admins) · clock_punch(in/out + one location pin) · clock_add (missed punch: yours waits for the manager, a manager's
   counts) · clock_decide (approve / deny / set off) · hub_clock_weeks + clock_week_ok (manager signs off a Sun-Sat week) · clock_people().
   Staffing drop-down (Brandon 2026-10-29): Clock In / Clock Out (#/staffing) · Schedule (#/stf_sched, staffSched) · Request Time Off (#/cal_off, calendar.js) · My performance (#/stf_perf, myPerf).
   Hours: each "in" pairs with the next "out" and counts on the day of the "in" (Park City time). No pay rates here.
   2026-10-30 (Brandon): ✎ on every punch → clock_edit (hub_clock_edit.sql; own or anyone you look after, reason required) · managers get
   "Who's clocked in now" (donut + list) and week-hours rings at the top · "Approve overtime / set clock-out" per person · banners close (✕). Overtime = 🔔 bell items since 2026-11-06 (no banner). */
(function(){
const TZ = "America/Denver", DAY = 864e5;
const dkey = t => new Date(t).toLocaleDateString("en-CA", { timeZone:TZ });
const tm = t => new Date(t).toLocaleTimeString([], { timeZone:TZ, hour:"numeric", minute:"2-digit" });
const dnm = k => new Date(k + "T12:00:00Z").toLocaleDateString([], { timeZone:"UTC", weekday:"short", month:"short", day:"numeric" });
const addK = (k, n) => new Date(Date.parse(k + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const wk = k => addK(k, -new Date(k + "T12:00:00Z").getUTCDay());   // Sunday that starts the week
const hm = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`; };
const SS = { week:null, places:null, open:new Set(), timer:null };
const CSS = `.stf .big{font-size:20px;padding:14px 28px;border-radius:12px}.stf .clk{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between}
.stf table{width:100%;border-collapse:collapse}.stf td,.stf th{padding:6px 8px;border-bottom:1px solid var(--line,#e5e7eb);text-align:left;vertical-align:top;font-size:14px}
.stf .r{text-align:right}.stf .sm{font-size:12px}.stf .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.stf .tow{overflow-x:auto}
.hxbanner{color:#fff;padding:8px 18px;font-weight:600;font-size:14px;flex:none;border-top:1px solid rgba(255,255,255,.25)} .hxbanner a{color:#fff;text-decoration:underline;margin-left:10px;white-space:nowrap}
.otplan{background:#fff8e6;color:#1f2937;padding:10px 18px;border-bottom:1px solid #f0d9a6;font-size:14px;flex:none}.otplan .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.otplan input{font:inherit;padding:4px 6px;border:1px solid #d1d5db;border-radius:6px}
.stf input,.stf select{font:inherit;padding:6px 8px;border:1px solid var(--line,#d1d5db);border-radius:8px}
.stf .ed{border:0;background:none;cursor:pointer;color:var(--muted);font-size:13px;padding:2px 4px}.stf .ed:hover{color:var(--ink)}
.stf .edbox{background:var(--ground,#f5f7f0);border-radius:10px;padding:8px;margin:6px 0}
.stf .now{display:flex;flex-wrap:wrap;gap:18px;align-items:center}.stf .now ul{list-style:none;margin:0;padding:0}.stf .now li{margin:3px 0;font-size:14px}
.stf .sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.stf .rings{display:flex;flex-wrap:wrap;gap:14px;margin:8px 0 4px}.stf .rg{text-align:center;width:84px;font-size:12px}.stf .rg svg{display:block;margin:0 auto 2px}
.hxbanner .bx{float:right;background:none;border:0;color:#fff;font-size:18px;line-height:1;cursor:pointer;margin-left:12px;padding:0 2px}`;
let cssOn = false;
const css = () => { if(cssOn) return; cssOn = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); };

// nearest home to a pin (Track unit points, same source as the Trash page); worked out here, never saved
async function places(){ if(SS.places) return SS.places;
  const r = await sb.from("lock_places").select("lat,lng,properties(code)").limit(2000);
  SS.places = (r.data || []).filter(x => x.lat && x.lng && x.properties).map(x => ({ lat:+x.lat, lng:+x.lng, code:x.properties.code })); return SS.places; }
const dist = (a, b, c, d) => { const R = 6371e3, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r * Math.cos((a + c) / 2 * r); return R * Math.sqrt(x * x + y * y); };
function where(p, pl){
  if(p.lat == null) return p.source === "added" ? "" : p.source === "work_app" ? `<span class="muted sm" title="Clocked from the Work check app on a computer">💻 computer</span>` : `<span class="muted sm">no location</span>`;
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
/* ---------- schedule check (Brandon 2026-10-30: "flag clock-ins that don't match the schedule"). Only person-days the hub schedule covers
   (sched_get.cov); 15 minutes either way counts as on time. Worked out here from punches this viewer may already see; nothing is saved. ---------- */
const GRACE = 15 * 6e4, t12 = t => { if(!t) return ""; const [H, M] = t.split(":").map(Number); return `${H % 12 || 12}${M ? ":" + String(M).padStart(2, "0") : ""}${H < 12 ? "a" : "p"}`; };
const tzOff = x => { const p = {}; new Intl.DateTimeFormat("en-US", { timeZone:TZ, hourCycle:"h23", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" })
  .formatToParts(new Date(x)).forEach(q => p[q.type] = +q.value); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - x; };
const pcAt = (k, t) => { const [y, mo, da] = k.split("-").map(Number), [H, M] = t.split(":").map(Number), g = Date.UTC(y, mo - 1, da, H, M); return g - tzOff(g - tzOff(g)); };   // Park City wall time → ms
const mins = ms => { const m = Math.round(ms / 6e4); return m < 60 ? m + " min" : hm(m / 60); };
// → [{ k:day, kind, txt }]; kinds: noin_now (shift going, not in), noin, early, late, still (in past the end), outlate, outearly, unsched
function schedCheck(u, rows, sg, from, to){
  const cov = new Set(sg.cov || []), s = shifts(rows), out = [], now = Date.now(), used = new Set(), pairs = [];
  Object.values(s.days).forEach(l => l.forEach(x => pairs.push({ a:Date.parse(x.a.at), b:Date.parse(x.b.at) })));
  if(s.open) pairs.push({ a:Date.parse(s.open.at), b:null });
  const add = (k, kind, txt) => out.push({ k, kind, txt });
  for(let k = from; k <= to; k = addK(k, 1)){
    if(!cov.has(u + "|" + k)) continue;
    for(const x of (sg.shifts || []).filter(x => x.user_id === u && x.day === k)){
      const S = pcAt(k, x.start), E = pcAt(x.end > x.start ? k : addK(k, 1), x.end), sch = `${t12(x.start)}–${t12(x.end)}`;
      const m = pairs.filter(p => !used.has(p) && p.a >= S - 3 * 36e5 && p.a < E);
      m.forEach(p => used.add(p));
      if(!m.length){ if(now > S + GRACE) add(k, now < E ? "noin_now" : "noin", now < E ? `not clocked in yet (scheduled ${sch})` : `no clock-in for the ${sch} shift`); continue; }
      const a = Math.min(...m.map(p => p.a)), open = m.some(p => p.b == null), b = open ? null : Math.max(...m.map(p => p.b));
      if(a < S - GRACE) add(k, "early", `in ${mins(S - a)} early (${tm(a)}, scheduled ${t12(x.start)})`);
      if(a > S + GRACE) add(k, "late", `in ${mins(a - S)} late (${tm(a)}, scheduled ${t12(x.start)})`);
      if(open){ if(now > E + GRACE) add(k, "still", `still clocked in ${mins(now - E)} after the shift ended (${t12(x.end)})`); }
      else if(b > E + GRACE) add(k, "outlate", `out ${mins(b - E)} late (${tm(b)}, scheduled ${t12(x.end)})`);
      else if(b < E - GRACE && now > E) add(k, "outearly", `out ${mins(E - b)} early (${tm(b)}, scheduled ${t12(x.end)})`);
    }
  }
  pairs.filter(p => !used.has(p)).forEach(p => { const k = dkey(p.a); if(k >= from && k <= to && cov.has(u + "|" + k)) add(k, "unsched", `clocked in ${tm(p.a)}, not on the schedule that day`); });
  return out;
}
const schedTxt = (sg, u, k) => (sg.shifts || []).filter(x => x.user_id === u && x.day === k).map(x => `${t12(x.start)}–${t12(x.end)}`).join(", ");
const weekHours = (s, w) => { let h = 0; for(let i = 0; i < 7; i++) (s.days[addK(w, i)] || []).forEach(x => h += x.h); return Math.round(h * 100) / 100; };

// a punch time + ✎ (Brandon 2026-10-30: "anyone should be able to edit their own hours and managers can edit anyones but they have to
// type in a reason on the why"; clock_edit in hub_clock_edit.sql). An edited punch shows who changed it and why, for everyone who sees it.
const pt = p => `${tm(p.at)}${p.source === "edited" ? ` <span class="pill amber sm" title="Changed by ${esc(p.made_by || "")}">edited</span><span class="muted sm"> ${esc(String(p.made_by || "").split(" ")[0])}: ${esc(p.note || "")}</span>` : ""}<button class="ed" data-ed="${p.id}" data-edat="${p.at}" title="Change this time">✎</button>`;

/* ---------- circle charts (Brandon 2026-10-30: "we need to have some circle graphs to help with views"). Both are plain SVG, colors from
   the hub's own tokens so dark mode follows; every chart also says its numbers in text (legend / label), never color alone. ---------- */
// week hours toward 40: green, amber from 36 h, red over 40 (the overtime line)
function ring(h, sz){
  sz = sz || 72; const r = sz / 2 - 6, c = 2 * Math.PI * r, f = Math.min(h / 40, 1), cx = sz / 2;
  const col = h > 40 ? "var(--red)" : h >= 36 ? "var(--amber)" : "var(--forest-2)", lab = `${hm(h)} of 40 h this week${h > 40 ? " (over 40)" : h >= 36 ? " (close to 40)" : ""}`;
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" role="img" aria-label="${lab}"><title>${lab}</title>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--line)" stroke-width="7"/>
    ${f > 0 ? `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(f * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"/>` : ""}
    <text x="${cx}" y="${cx + 1}" text-anchor="middle" font-size="${sz > 80 ? 20 : 15}" font-weight="700" fill="var(--ink)">${Math.round(h * 10) / 10}</text>
    <text x="${cx}" y="${cx + (sz > 80 ? 17 : 14)}" text-anchor="middle" font-size="10" fill="var(--muted)">of 40 h</text></svg>`;
}
// part-to-whole donut with a 2px gap between slices; center = the first part
function donut(parts, sz){
  sz = sz || 132; const r = sz / 2 - 10, c = 2 * Math.PI * r, cx = sz / 2, tot = parts.reduce((a, p) => a + p.n, 0) || 1, live = parts.filter(p => p.n).length;
  let off = 0, segs = "";
  for(const p of parts){ if(!p.n) continue; const len = p.n / tot * c, gap = live > 1 ? 2 : 0;
    segs += `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${p.col}" stroke-width="14" stroke-dasharray="${Math.max(len - gap, 0.5).toFixed(1)} ${(c - len + gap).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"><title>${esc(p.label)}: ${p.n}</title></circle>`;
    off += len; }
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" role="img" aria-label="${parts.map(p => `${p.label} ${p.n}`).join(", ")}">
    ${live ? segs : `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--line)" stroke-width="14"/>`}
    <text x="${cx}" y="${cx + 4}" text-anchor="middle" font-size="28" font-weight="700" fill="var(--ink)">${parts[0].n}</text>
    <text x="${cx}" y="${cx + 20}" text-anchor="middle" font-size="11" fill="var(--muted)">of ${parts.reduce((a, p) => a + p.n, 0)} in now</text></svg>`;
}

// who's clocked in right now (Brandon 2026-10-30: "we want managers to see whos clocked in everytime they click into staffing")
function nowCard(ppl, rows, pl, sg){
  const today = dkey(Date.now()), inn = [], done = [], none = [];
  for(const p of ppl){ const mine = rows.filter(x => x.user_id === p.user_id), s = shifts(mine), dh = (s.days[today] || []).reduce((a, x) => a + x.h, 0);
    if(s.open) inn.push({ p, at:s.open, h:(Date.now() - Date.parse(s.open.at)) / 36e5, dh });
    else if(dh) done.push({ p, at:mine.filter(x => x.kind === "out").slice(-1)[0], dh });
    else none.push(p); }
  inn.sort((a, b) => a.at.at < b.at.at ? -1 : 1);
  const C = ["var(--forest-2)", "var(--blue)", "var(--line-2)"];
  const parts = [{ label:"Clocked in now", n:inn.length, col:C[0] }, { label:"Worked today, clocked out", n:done.length, col:C[1] }, { label:"Not in today", n:none.length, col:C[2] }];
  return `<div class="card"><div class="row" style="justify-content:space-between"><b style="font-size:16px">Who's clocked in now</b>
      <span class="muted sm">as of ${tm(Date.now())} <button class="btn small" data-rf>↻ Refresh</button></span></div>
    <div class="now" style="margin-top:8px">${donut(parts)}
      <div style="flex:1;min-width:220px">
        <div class="sm" style="margin-bottom:6px">${parts.map(p => `<span style="margin-right:14px;white-space:nowrap"><span class="sw" style="background:${p.col}"></span>${p.label} <b>${p.n}</b></span>`).join("")}</div>
        ${inn.length ? `<ul>${inn.map(x => `<li><span class="sw" style="background:${C[0]}"></span><b>${esc(x.p.name)}</b> since ${tm(x.at.at)}${dkey(x.at.at) !== today ? " " + dnm(dkey(x.at.at)) : ""} · ${hm(x.h)} ${where(x.at, pl)}</li>`).join("")}</ul>` : `<p class="muted" style="margin:0">Nobody is clocked in right now.</p>`}
        ${done.length ? `<ul style="margin-top:6px">${done.map(x => `<li><span class="sw" style="background:${C[1]}"></span>${esc(x.p.name)} · out ${x.at ? tm(x.at.at) : ""} · ${hm(x.dh)} today</li>`).join("")}</ul>` : ""}
        ${none.length ? `<details style="margin-top:6px"><summary class="muted sm">Not in today (${none.length})</summary><p class="sm muted" style="margin:4px 0 0">${none.map(p => esc(p.name)).join(" · ")}</p></details>` : ""}
        ${schedNow(ppl, rows, sg)}
      </div></div></div>`;
}
// today against the schedule: should be in but isn't · in with nothing scheduled · still in after the shift ended
function schedNow(ppl, rows, sg){
  if(!sg || !(sg.cov || []).length) return "";
  const today = dkey(Date.now()), yest = addK(today, -1), l = [];
  for(const p of ppl) schedCheck(p.user_id, rows.filter(x => x.user_id === p.user_id), sg, yest, today)
    .filter(x => x.kind === "still" || (x.k === today && (x.kind === "noin_now" || x.kind === "unsched"))).forEach(x => l.push(`<li>⚠ <b>${esc(p.name)}</b>: ${esc(x.txt)}</li>`));
  return l.length ? `<div style="margin-top:8px;padding:8px 10px;border-radius:10px;background:#fff8e6;color:#1f2937"><b class="sm">Against today's schedule</b><ul>${l.join("")}</ul></div>`
    : `<p class="sm muted" style="margin:6px 0 0">✓ Nobody is off today's schedule right now.</p>`;
}

// sc (when the person has a hub schedule that week) = { u, sg, fl:[schedCheck rows] } → a Scheduled column + flags under each day
function weekTable(rows, w, pl, boss, sc){
  const s = shifts(rows), today = dkey(Date.now()), cols = sc ? 4 : 3;
  const sch = k => sc ? `<td class="sm">${esc(schedTxt(sc.sg, sc.u, k)) || `<span class="muted">${(sc.sg.cov || []).includes(sc.u + "|" + k) ? "off" : "—"}</span>`}</td>` : "";
  const fl = k => sc ? sc.fl.filter(x => x.k === k).map(x => `<div class="sm" style="color:#b45309">⚠ ${esc(x.txt)}</div>`).join("") : "";
  let h = "";
  for(let i = 0; i < 7; i++){ const k = addK(w, i), l = s.days[k] || [], t = l.reduce((a, x) => a + x.h, 0);
    const open = s.open && dkey(s.open.at) === k;
    if(!l.length && !open && k !== today && !fl(k)) { h += `<tr><td>${dnm(k)}</td>${sch(k)}<td class="muted">—</td><td></td></tr>`; continue; }
    h += `<tr><td>${dnm(k)}</td>${sch(k)}<td>${l.map(x => `${pt(x.a)} – ${pt(x.b)} <span class="muted sm">(${hm(x.h)})</span> ${where(x.a, pl)}${boss ? offBtn(x.a) + offBtn(x.b) : ""}`).join("<br>")}
      ${open ? `${l.length ? "<br>" : ""}${pt(s.open)} – <b>still clocked in</b> ${where(s.open, pl)}${boss ? offBtn(s.open) : ""}` : ""}${!l.length && !open ? `<span class="muted">—</span>` : ""}${fl(k)}</td><td class="r">${t ? hm(t) : ""}</td></tr>`; }
  const odd = s.odd.filter(p => wk(dkey(p.at)) === w);
  return `<div class="tow"><table><tr><th>Day</th>${sc ? "<th>Scheduled</th>" : ""}<th>In – out</th><th class="r">Hours</th></tr>${h}
    <tr><td colspan="${cols - 1}"><b>Week</b></td><td class="r"><b>${hm(weekHours(s, w))}</b></td></tr></table></div>
    ${odd.length ? `<p class="sm" style="color:#b45309;margin:6px 0 0">⚠ ${odd.map(p => `${dnm(dkey(p.at))} ${tm(p.at)}: clocked ${p.kind} with no matching clock-${p.kind === "in" ? "out" : "in"}${boss ? offBtn(p) : ""}`).join(" · ")}. ${boss ? "Add the missing punch or set this one off." : "Use “Forgot to clock in or out?” below."}</p>` : ""}`;
}
// admins (Brandon 2026-10-30: "kim should be able to trump anyones approval or denial"): punches that don't count, with "Count it"
const notCounted = (rows, w) => { const l = rows.filter(p => (p.status === "denied" || p.status === "off") && wk(dkey(p.at)) === w);
  return l.length ? `<p class="sm" style="margin:6px 0 0">Not counted: ${l.map(p => `${dnm(dkey(p.at))} ${tm(p.at)} clock ${p.kind} (${p.status === "off" ? "set off" : "denied"}${p.decided_by ? ` by ${esc(p.decided_by)}` : ""}${p.decide_note ? `: ${esc(p.decide_note)}` : ""}) <button class="btn small" data-ok="${p.id}">Count it</button>`).join(" · ")}</p>` : ""; };
const offBtn = p => ` <button class="btn small" data-off="${p.id}" title="Set this punch off (it stops counting; kept in the log)">✕</button>`;
const pendRow = (p, nm, boss) => `<tr><td>${nm ? `<b>${esc(nm)}</b><br>` : ""}${dnm(dkey(p.at))} ${tm(p.at)} · clock ${p.kind}</td><td class="sm">${esc(p.note || "")}</td>
  <td class="r">${boss ? `<button class="btn small primary" data-ok="${p.id}">Approve</button> <button class="btn small" data-no="${p.id}">Deny</button>` : `<span class="pill amber">Waiting for your manager</span>`}</td></tr>`;
const addForm = (uid, boss) => `<details class="card"><summary><b>${boss ? "Add a missed punch" : "Forgot to clock in or out?"}</b></summary>
  <div class="row" style="margin-top:8px"><select data-ak="${uid}"><option value="in">Clock in</option><option value="out">Clock out</option></select>
  <input type="datetime-local" data-at="${uid}"><input data-an="${uid}" placeholder="${boss ? "Note (optional)" : "What happened? (your manager sees it)"}" style="flex:1;min-width:180px">
  <button class="btn primary" data-add="${uid}">${boss ? "Add" : "Send to my manager"}</button></div></details>`;

/* ---------- Work check app (Windows) download + is it running (hub_work_app.sql, workcheck_app/). Brandon 2026-11-09: our own app replaces
   Hubstaff's desktop app; cloud workers + office staff run it; it records only while clocked in on the hub. Only shown to people who need it. ---------- */
const WC_EXE = "https://ogugdhhiajebfdwpzofp.supabase.co/storage/v1/object/public/hub-apps/MooseHubWorkCheck.exe";
async function wcAppCard(el){
  if(!el) return;
  let m; try { const r = await sb.rpc("work_app_mine"); m = r.data; } catch(e){ return; }
  if(!m || !m.needs) return;
  const last = m.last_slot ? Date.parse(m.last_slot) : 0, mins = last ? Math.round((Date.now() - last) / 6e4) : null;
  const ago = mins == null ? "" : mins < 2 ? "just now" : mins < 90 ? mins + " min ago" : new Date(last).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
  const old = m.last_ver && m.latest_ver && m.last_ver !== m.latest_ver;
  const st = !last ? `<span class="pill amber">Not set up on your computer yet</span>`
    : `<span class="pill ${mins < 20 ? "green" : ""}">${mins < 20 ? "Running" : "Last heard"} ${mins < 20 ? "on " + esc(m.last_device || "your computer") : ago + (m.last_device ? " · " + esc(m.last_device) : "")}</span>${old ? ` <span class="pill amber">New version ${esc(m.latest_ver)}: download it again</span>` : ""}`;
  el.innerHTML = `<details class="card" ${!last || old ? "open" : ""}><summary><b style="font-size:16px">💻 Moose Time (Windows)</b> ${st}</summary>
    <p class="sm" style="margin:8px 0">If you work on a computer, keep Moose Time running. It's also in My settings ▸ My apps. It only records while you're clocked in on the hub: every 10 minutes how much the keyboard and mouse were used (counts only, never what you type) and one screenshot of each screen. Only you, your manager and Brandon/Kim can see them, and screenshots are removed after 30 days.</p>
    <a class="btn primary" href="${WC_EXE}" download>⬇ Download Moose Time</a>
    <ol class="sm" style="margin:10px 0 0;padding-left:20px;line-height:1.6">
      <li>Open the downloaded file <b>MooseHubWorkCheck.exe</b>. If Windows says <i>"Windows protected your PC"</i>, click <b>More info</b> ▸ <b>Run anyway</b>.</li>
      <li>Sign in with your hub email and password (or "Email me a code instead"), then your 2-step code if you use one. The hub then opens in your browser, signed in.</li>
      <li>Look for the round <b>M</b> by the clock (bottom right; it may be under the ^ arrow). <b>Green</b> = recording (you're clocked in), <b>grey</b> = clocked out, nothing recorded. Click the M to <b>clock in or out</b>; right-click for "Open the hub".</li>
      <li>It starts by itself when Windows starts. You only do this once per computer. To update, download and open it again.</li></ol></details>`;
}
window.staffingView = async function(v){
  css();
  v.innerHTML = `<div class="page stf"><p class="muted">Loading…</p></div>`;
  const today = dkey(Date.now()), w = SS.week || wk(today);
  const [pp, cr, wr, pl, hw] = await Promise.all([sb.rpc("clock_people"), sb.from("hub_clock").select("*").gte("at", addK(w, -7) + "T00:00:00Z").order("at"),
    sb.from("hub_clock_weeks").select("*").order("approved_at", { ascending:false }), places().catch(() => []),
    sb.from("hub_work_check").select("user_id,day,tracked_h").gte("day", w).lte("day", addK(w, 6))]);   // Hubstaff hours while both run (RLS: your team)
  const [nr, sgr] = await Promise.all([sb.from("hub_clock").select("*").eq("status", "ok").gte("at", new Date(Date.now() - 30 * 36e5).toISOString()).order("at"),   // right now, whatever week is shown
    sb.rpc("sched_get", { p_from:w < addK(today, -1) ? w : addK(today, -1), p_to:addK(w, 6) > today ? addK(w, 6) : today })]);
  const nowRows = nr.data || [], curW = w === wk(today), sg = (sgr && sgr.data) || { shifts:[], cov:[] };
  const scOf = u => { const fl = schedCheck(u, (cr.data || []).filter(x => x.user_id === u), sg, w, addK(w, 6));
    return (sg.cov || []).some(c => c.startsWith(u + "|") && c.slice(-10) >= w && c.slice(-10) <= addK(w, 6)) ? { u, sg, fl } : null; };
  await otBanner(!OT.at || Date.now() - OT.at > 60e3).catch(() => {});
  const hsH = u => ((hw && hw.data) || []).filter(x => x.user_id === u).reduce((a, x) => a + (+x.tracked_h || 0), 0), hsOn = u => ((hw && hw.data) || []).some(x => x.user_id === u);
  const ppl = pp.data || [], all = cr.data || [], weeks = wr.data || [];
  const meP = ppl.find(p => p.is_me), myId = meP && meP.user_id, meOn = !!meP, team = ppl.filter(p => !p.is_me);
  const pend = await sb.from("hub_clock").select("*").eq("status", "pending").order("at");
  const pendAll = pend.data || [];
  const wkOk = (u, wk_) => weeks.find(x => x.user_id === u && x.week === wk_);
  const nav = `<div class="row" style="margin:0 0 10px"><button class="btn small" data-w="-7">← Week before</button><b>Week of ${dnm(w)}</b>
    ${w < wk(today) ? `<button class="btn small" data-w="7">Next week →</button> <button class="btn small" data-w="0">This week</button>` : ""}</div>`;
  let h = `<div class="page stf wide"><h2 style="margin:0 0 10px">Staffing</h2>${team.length ? nowCard(ppl, nowRows, pl, sg) : ""}`;   // managers: who's in, first thing
  if(meOn){
    const mine = all.filter(p => p.user_id === myId), s = shifts(mine), last = mine.filter(p => p.status === "ok").slice(-1)[0];
    const isIn = last && last.kind === "in";
    const ok = wkOk(myId, w);
    const myH = weekHours(s, wk(today)) + (s.open ? (Date.now() - Date.parse(s.open.at)) / 36e5 : 0);
    h += `<div class="card clk"><div class="row" style="gap:14px">${ring(myH, 88)}<div><div style="font-size:18px"><b>${isIn ? "You're clocked in" : "You're clocked out"}</b></div>
        <div class="muted">${isIn ? `since ${tm(last.at)}${dkey(last.at) !== today ? " " + dnm(dkey(last.at)) : ""} · ${hm((Date.now() - Date.parse(last.at)) / 36e5)}` : last ? `last clocked out ${dnm(dkey(last.at))} ${tm(last.at)}` : "Tap Clock in when you start work."}</div>
        <div class="muted sm">This week: ${hm(myH)}${myH > 40 ? " · over 40" : myH >= 36 ? " · close to 40" : ""}</div>${otMeHtml()}</div></div>
      <button class="btn primary big" id="punch" data-k="${isIn ? "out" : "in"}">${isIn ? "Clock out" : "Clock in"}</button></div>
      <p class="muted sm" style="margin:-4px 0 10px">Your phone's location is saved once when you clock in or out (only you, your manager and Brandon/Kim see it). Not during the day.</p>
      <div class="card">${nav}${weekTable(mine, w, pl, false, scOf(myId))}${ok ? `<p class="sm" style="margin:6px 0 0">✅ Approved by ${esc(ok.approved_by)} (${hm(+ok.hours)})</p>` : ""}</div>
      ${pendAll.filter(p => p.user_id === myId).length ? `<div class="card"><b>Waiting for your manager</b><table>${pendAll.filter(p => p.user_id === myId).map(p => pendRow(p, null, false)).join("")}</table></div>` : ""}
      ${addForm(myId, false)}<div id="wcapp"></div>`;
  }
  if(team.length){
    const wait = pendAll.filter(p => p.user_id !== myId);
    if(wait.length) h += `<div class="card"><b style="font-size:16px">Waiting for you (${wait.length})</b><table>${wait.map(p => pendRow(p, (ppl.find(x => x.user_id === p.user_id) || {}).name, true)).join("")}</table></div>`;
    const tH = p => { const s = shifts(all.filter(x => x.user_id === p.user_id)); return weekHours(s, w) + (curW && s.open ? (Date.now() - Date.parse(s.open.at)) / 36e5 : 0); };
    h += `<div class="card"><b style="font-size:16px">${ME.admin ? "Everyone on the hub clock" : "Your team on the hub clock"}</b>${meOn ? "" : nav}
      <div class="sm muted" style="margin-top:6px">Hours toward 40 ${curW ? "this week (open shifts count to now)" : "that week"} · green under 36 h, amber 36–40 h, red over 40 h</div>
      <div class="rings">${team.map(p => `<div class="rg">${ring(tH(p))}${esc(String(p.name).split(" ")[0])}</div>`).join("")}</div>
      ${team.map(p => { const rows = all.filter(x => x.user_id === p.user_id), s = shifts(rows), ok = wkOk(p.user_id, w), hrs = weekHours(s, w);
        const last = rows.filter(x => x.status === "ok").slice(-1)[0], now = last && last.kind === "in" && s.open;
        const changed = ok && Math.abs(+ok.hours - hrs) > 0.01;
        const hh = hsOn(p.user_id) ? Math.round(hsH(p.user_id) * 100) / 100 : null, gap = hh == null ? 0 : hrs - hh;
        const ot = (OT.l || []).find(x => x.user_id === p.user_id), sc = scOf(p.user_id), nf = sc ? sc.fl.length : 0;
        return `<details data-du="${p.user_id}" style="margin:8px 0" ${team.length === 1 || SS.open.has(p.user_id) ? "open" : ""}><summary><b>${esc(p.name)}</b> · ${hm(hrs)}${hh != null ? ` <span class="pill ${Math.abs(gap) > 0.5 ? "amber" : ""}" title="Hours Hubstaff tracked this week, side by side until Hubstaff is cancelled">Hubstaff ${hm(hh)}${Math.abs(gap) > 0.5 ? ` · ${gap > 0 ? "+" : "−"}${hm(Math.abs(gap))} on the hub` : ""}</span>` : ""} ${now ? `<span class="pill green">clocked in since ${tm(last.at)}</span>` : ""}${nf ? ` <span class="pill amber" title="Clock-ins that don't match the schedule this week">⚠ ${nf} off schedule</span>` : ""}
          ${ok ? `<span class="pill ${changed ? "amber" : "green"}">${changed ? `approved at ${hm(+ok.hours)}, changed since` : `approved by ${esc(ok.approved_by)}`}</span>` : ""}</summary>
          ${weekTable(rows, w, pl, true, sc)}${ME.admin ? notCounted(rows, w) : ""}
          ${curW ? `<div class="row" style="margin-top:6px"><span class="sm">${ot && ot.plan_kind ? "Overtime plan: " + planTxt(ot) : "No overtime plan this week."}${ot && ot.asked_at ? " · asked for overtime" + (ot.asked_note ? `: “${esc(ot.asked_note)}”` : "") : ""}</span>
            <button class="btn small" data-otp="${p.user_id}" data-h="${Math.round(tH(p) * 100) / 100}">${ot && ot.plan_kind ? "Change overtime plan" : "Approve overtime / set clock-out"}</button></div>` : ""}
          <div class="row" style="margin-top:6px">${(!ok || changed) && w < wk(today) ? `<button class="btn small primary" data-wok="${p.user_id}" data-h="${hrs}">Approve ${hm(hrs)} for this week</button>` : w >= wk(today) ? `<span class="muted sm">Approve the week once it's over.</span>` : ""}</div>
          ${addForm(p.user_id, true)}</details>`; }).join("")}</div>`;
  } else if(!meOn) h += `<div class="card"><p class="muted" style="margin:0">Nobody on your team has clocked in this week.</p></div>`;
  h += `<p class="muted sm">Hours count from each clock-in to the next clock-out, on the day of the clock-in (Park City time). Source: the hub time clock. Scheduled times come from Staffing ▸ Schedule; clocking in or out within 15 minutes of the schedule counts as on time.</p></div>`;
  v.innerHTML = h;
  const re = () => staffingView(v), err = r => { if(r.error){ alert(/failed to fetch|networkerror|load failed/i.test(r.error.message) ? "No signal right now. Try again when you have service (a missed clock-in can be added later)." : r.error.message.replace(/^.*?: /, "")); return true; } return false; };
  v.querySelectorAll("[data-w]").forEach(b => b.onclick = () => { const n = +b.dataset.w; SS.week = n ? addK(w, n) : null; re(); });
  v.querySelectorAll("details[data-du]").forEach(d => d.ontoggle = () => d.open ? SS.open.add(d.dataset.du) : SS.open.delete(d.dataset.du));
  const rf = v.querySelector("[data-rf]"); if(rf) rf.onclick = re;
  // change a punch time: a reason is required for everyone (the server checks who may)
  v.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => { v.querySelectorAll(".edbox").forEach(x => x.remove());
    const f = document.createElement("div"); f.className = "edbox";
    f.innerHTML = `<div class="row"><b class="sm">Change ${tm(b.dataset.edat)} ${dnm(dkey(b.dataset.edat))} to</b><input type="datetime-local" data-et value="${localIn(new Date(b.dataset.edat))}">
      <input data-er placeholder="Why? (required, kept in the log)" style="flex:1;min-width:180px"><button class="btn small primary" data-es>Save</button><button class="btn small" data-ec>Cancel</button></div>`;
    (b.closest("td") || b.parentNode).appendChild(f);
    f.querySelector("[data-ec]").onclick = () => f.remove();
    f.querySelector("[data-es]").onclick = async () => { const t = f.querySelector("[data-et]").value, why = f.querySelector("[data-er]").value.trim();
      if(!t) return alert("Pick the new date and time."); if(!why) return alert("Say why you're changing it.");
      if(!err(await sb.rpc("clock_edit", { p_id:+b.dataset.ed, p_at:new Date(t).toISOString(), p_reason:why }))) { otBanner(true); re(); } }; });
  v.querySelectorAll("[data-otp]").forEach(b => b.onclick = () => { const u = b.dataset.otp, p = ppl.find(x => x.user_id === u), o = (OT.l || []).find(x => x.user_id === u);
    otPlanBox(Object.assign({ user_id:u, name:p ? p.name : "", hours:+b.dataset.h, open_since:(shifts(all.filter(x => x.user_id === u)).open || {}).at || null }, o || {}), b.parentNode, re); });
  clearInterval(SS.timer);   // keep "who's clocked in" fresh while the page is open, but never under an open box or while typing
  SS.timer = setInterval(() => { if(!document.body.contains(v) || !/^#\/staffing/.test(location.hash)) return clearInterval(SS.timer);
    if(v.querySelector(".edbox,.otplan,details.card[open]") || (document.activeElement && v.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) return;
    re(); }, 120e3);
  wcAppCard(v.querySelector("#wcapp"));
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
  v.querySelectorAll("[data-no]").forEach(b => b.onclick = async () => { const n = prompt("Why? (they'll see it)"); if(n === null) return; if(!err(await sb.rpc("clock_decide", { p_id:+b.dataset.no, p_status:"denied", p_note:n }))) re(); });
  v.querySelectorAll("[data-off]").forEach(b => b.onclick = async () => { const n = prompt("Why should this punch stop counting? (kept in the log)"); if(!n) return; if(!err(await sb.rpc("clock_decide", { p_id:+b.dataset.off, p_status:"off", p_note:n }))) re(); });
  v.querySelectorAll("[data-wok]").forEach(b => b.onclick = async () => { if(!confirm(`Approve ${hm(+b.dataset.h)} for the week of ${dnm(w)}?`)) return;
    if(!err(await sb.rpc("clock_week_ok", { p_user:b.dataset.wok, p_week:w, p_hours:+b.dataset.h, p_note:null }))) re(); });
};

/* ---------- Staffing ▸ Schedule (Brandon 2026-10-29). Who works when this week. Everyone sees it, same as the Office calendar.
   2026-10-30 (Brandon: "we want the managers to be able to create schedules or change them"; hub_schedules.sql): shifts set in the hub
   (sched_get: a weekly pattern from a date on + single-day changes) win over Hubstaff's work schedule for that person and day; time off
   (Hubstaff + asked in the hub) and "I'm out / I'm working" from the Office calendar show too. Managers change the people they look after
   (hub_sched_can = same rule as overtime plans; admins anyone): ✎ Weekly on a name, or tap a day. A shift ending at or before its start
   ends after midnight and counts on the day it starts. ---------- */
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const shH = x => { const m = s => { const [H, M] = s.split(":").map(Number); return H * 60 + M; }; return ((m(x.end) - m(x.start) + 1440) % 1440 || 1440) / 60; };
const pair = (k, i, x) => `<span class="row" style="gap:4px"><input type="time" data-${k}s="${i}" value="${x ? x.start : ""}"> to <input type="time" data-${k}e="${i}" value="${x ? x.end : ""}"></span>`;
const readPairs = (box, k, n) => { const out = []; for(let i = 0; i < n; i++){ const s = box.querySelector(`[data-${k}s="${i}"]`).value, e = box.querySelector(`[data-${k}e="${i}"]`).value;
  if(s || e){ if(!s || !e) throw new Error("Each shift needs a start and an end time"); out.push({ i, start:s, end:e }); } } return out; };
window.staffSched = async function(v){
  css();
  const today = dkey(Date.now()), w = SS.sched || wk(today), e = addK(w, 6);
  if(!v.querySelector(".stf")) v.innerHTML = `<div class="page stf wide"><p class="muted">Loading…</p></div>`;
  const [ox, sgr, tor, ev, pp] = await Promise.all([sb.rpc("cal_office", { p_from:w, p_to:e }), sb.rpc("sched_get", { p_from:w, p_to:e }), sb.rpc("timeoff_calendar", { p_from:w, p_to:e }),
    sb.from("hub_cal_events").select("day,end_day,kind,person_id,start_time,end_time,off").eq("cal", "office").lte("day", e), sb.rpc("cal_people")]);
  if(current() !== "stf_sched") return;
  const o = ox.data || { shifts:[], off:[] }, sg = sgr.data || { shifts:[], off_days:[], can:[], weeks:[], days:[] }, ppl = pp.data || [], cell = {}, hrs = {};
  const can = new Set(sg.can || []), err = r => { if(r.error){ alert(/failed to fetch|networkerror|load failed/i.test(r.error.message) ? "No signal right now. Try again when you have service." : r.error.message.replace(/^.*?: /, "")); return true; } return false; };
  const put = (u, d, x) => { if(!u || d < w || d > e) return; ((cell[u] = cell[u] || {})[d] = cell[u][d] || []).push(x); };
  const shift = (x, chg, note) => { hrs[x.user_id] = (hrs[x.user_id] || 0) + shH(x);
    return `<div${note ? ` title="${esc(note)}"` : ""}>${t12(x.start)}–${t12(x.end)}${chg ? ` <span class="pill amber sm">changed</span>` : ""}</div>`; };
  (sg.shifts || []).forEach(x => put(x.user_id, x.day, shift(x, x.changed, x.note)));
  (o.shifts || []).filter(x => x.src !== "hub").forEach(x => put(x.user_id, x.day, shift(x) + `<span class="muted sm">Hubstaff</span>`));
  (sg.off_days || []).forEach(x => put(x.user_id, x.day, `<span class="pill sm"${x.note ? ` title="${esc(x.note)}"` : ""}>Not scheduled (changed)</span>`));
  (o.off || []).forEach(x => put(x.user_id, x.day, `<span class="pill red">Off${x.start ? " " + t12(x.start) + "–" + t12(x.end) : ""}</span>`));
  ((tor && tor.data) || []).filter(r => !(r.status === "approved" && r.hs_request_id)).forEach(r => { for(let d = r.day; d <= r.end_day; d = addK(d, 1))
    put(r.user_id, d, r.status === "pending" ? `<span class="pill amber">Asked off</span>` : `<span class="pill red">Off${r.start ? " " + t12(r.start) + "–" + t12(r.end) : ""}</span>`); });
  ((ev && ev.data) || []).filter(x => !x.off && (x.kind === "out" || x.kind === "working")).forEach(x => { for(let d = x.day; d <= (x.end_day || x.day); d = addK(d, 1))
    put(x.person_id, d, x.kind === "out" ? `<span class="pill red">Out${x.start_time ? " " + t12(x.start_time) + "–" + t12(x.end_time) : ""}</span>` : `<span class="pill green">Working${x.start_time ? " " + t12(x.start_time) + "–" + t12(x.end_time) : ""}</span>`); });
  const rows = ppl.filter(p => cell[p.id] || can.has(p.id)).sort((a, b) => a.name.localeCompare(b.name)), none = ppl.filter(p => !cell[p.id] && !can.has(p.id));
  const days = [...Array(7)].map((_, i) => addK(w, i)), anyEdit = can.size > 0, name = id => (ppl.find(p => p.id === id) || {}).name || "";
  const over = rows.filter(p => (hrs[p.id] || 0) > 40);
  const hcol = id => { const h = Math.round((hrs[id] || 0) * 10) / 10; return h ? `<td class="r sm"${h > 40 ? ' style="color:var(--red,#b3261e);font-weight:700" title="Over 40 scheduled hours"' : ""}>${h} h</td>` : `<td class="r sm muted">—</td>`; };
  const td = (p, d) => { const st = [d === today ? "background:var(--pine-soft,#eaf3da)" : "", can.has(p.id) ? "cursor:pointer" : ""].filter(Boolean).join(";");
    return `<td class="sm"${st ? ` style="${st}"` : ""}${can.has(p.id) ? ` data-cd="${p.id}|${d}" title="Change this day"` : ""}>${((cell[p.id] || {})[d] || []).join("") || `<span class="muted">—</span>`}</td>`; };
  v.innerHTML = `<div class="page stf wide"><h2 style="margin:0 0 10px">Schedule</h2>
    <div class="card"><div class="row" style="margin:0 0 10px"><button class="btn small" data-w="-7">← Week before</button><b>Week of ${dnm(w)}</b>
      <button class="btn small" data-w="7">Next week →</button>${w !== wk(today) ? ` <button class="btn small" data-w="0">This week</button>` : ""}</div>
    <div id="sedbox"></div>
    ${over.length ? `<p class="sm" style="margin:0 0 8px;padding:8px 10px;border-radius:10px;background:#fde8e8;color:#7f1d1d">⚠ Scheduled over 40 hours this week (Sun–Sat): ${over.map(p => `<b>${esc(p.name)}</b> ${Math.round(hrs[p.id] * 10) / 10} h`).join(" · ")}. Over 40 is overtime and needs an OK first${anyEdit ? " (Staffing ▸ Clock In / Clock Out ▸ Approve overtime, or change the schedule)" : ""}.</p>` : ""}
    ${anyEdit ? `<p class="muted sm" style="margin:0 0 8px">✎ Weekly sets someone's regular shifts from a date on. Tap a day to change just that day.</p>` : ""}
    <div class="tow"><table><tr><th>Who</th>${days.map(d => `<th${d === today ? ' style="color:var(--forest,#3c5f12)"' : ""}>${dnm(d)}</th>`).join("")}<th class="r">Hours</th></tr>
      ${rows.map(p => `<tr><td><b>${esc(p.name)}</b>${can.has(p.id) ? `<br><button class="btn small" data-wk="${p.id}">✎ Weekly</button>` : ""}</td>${days.map(d => td(p, d)).join("")}${hcol(p.id)}</tr>`).join("")
        || `<tr><td colspan="9" class="muted">Nothing scheduled this week.</td></tr>`}</table></div>
    ${none.length ? `<p class="muted sm" style="margin:8px 0 0">No schedule this week: ${none.map(p => esc(p.name.split(" ")[0])).join(", ")}.</p>` : ""}</div>
    <p class="muted sm">Sources: shifts set in the hub (Staffing ▸ Schedule; the office schedule from Nov 2 is Kim's Moose_Staff_Schedule_Sept_2026 Final.xlsx); for anyone without one, their Hubstaff work schedule${o.at ? " (updated " + esc(new Date(o.at).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })) + ")" : ""}. Time off from Hubstaff and the hub; Out / Working from the Office calendar. A late shift like 6p–2a ends the next morning and counts on the day it starts. Ask for time off under Staffing ▸ Request Time Off.</p></div>`;
  v.querySelectorAll("[data-w]").forEach(b => b.onclick = () => { const n = +b.dataset.w; SS.sched = n ? addK(w, n) : null; staffSched(v); });
  const box = v.querySelector("#sedbox"), close = () => { box.innerHTML = ""; }, re = () => staffSched(v);
  // weekly pattern for one person from a date on
  const weekEd = (u, from) => {
    const pat = (sg.weeks || []).filter(x => x.user_id === u && x.starts_on <= from).sort((a, b) => a.starts_on < b.starts_on ? -1 : 1).pop()
      || (sg.weeks || []).filter(x => x.user_id === u).sort((a, b) => a.starts_on < b.starts_on ? -1 : 1)[0];
    const cur = pat ? pat.shifts : [], later = (sg.weeks || []).filter(x => x.user_id === u && x.starts_on > from);
    box.innerHTML = `<div class="edbox"><b>Weekly schedule for ${esc(name(u))}</b>
      <div class="row" style="margin:6px 0"><label>Starts <input type="date" id="sdfrom" value="${from}"></label><span class="muted sm">${pat ? `Set by ${esc(pat.by || "")} from ${dnm(pat.starts_on)}${pat.note ? " — " + esc(pat.note) : ""}` : "No hub schedule yet."}</span></div>
      ${later.length ? `<p class="sm" style="margin:0 0 6px;color:var(--red,#b3261e)">A schedule set to start ${later.map(x => dnm(x.starts_on)).join(", ")} still takes over from then.</p>` : ""}
      <table>${DOW.map((n, i) => { const s = cur.filter(x => x.dow === i); return `<tr><td><b>${n}</b></td><td>${pair("a", i, s[0])}</td><td>${pair("b", i, s[1])}</td></tr>`; }).join("")}</table>
      <p class="muted sm" style="margin:4px 0">Leave a day empty for a day off. Second column = a split shift. An end time earlier than the start runs past midnight.</p>
      <div class="row"><input id="sdnote" placeholder="Note (optional)" style="flex:1;min-width:180px"><button class="btn small primary" id="sdsave">Save weekly schedule</button>
        ${pat && cur.length ? `<button class="btn small" id="sdstop">Stop scheduling from this date</button>` : ""}<button class="btn small" id="sdx">Cancel</button></div></div>`;
    box.scrollIntoView({ block:"nearest" });
    const send = async shifts => { const r = await sb.rpc("sched_week_set", { p_user:u, p_from:box.querySelector("#sdfrom").value, p_shifts:shifts, p_note:box.querySelector("#sdnote").value }); if(!err(r)) re(); };
    box.querySelector("#sdx").onclick = close;
    box.querySelector("#sdsave").onclick = () => { let sh; try { sh = ["a", "b"].flatMap(k => readPairs(box, k, 7).map(x => ({ dow:x.i, start:x.start, end:x.end }))); } catch(x){ return alert(x.message); }
      const tot = Math.round(sh.reduce((a, x) => a + shH(x), 0) * 10) / 10;   // Brandon 2026-10-30: warn when someone is scheduled over 40 hours
      if(tot > 40 && !confirm(`This schedules ${name(u)} for ${tot} hours a week. Over 40 is overtime, which needs an OK first. Save anyway?`)) return;
      send(sh); };
    const st = box.querySelector("#sdstop"); if(st) st.onclick = () => { if(confirm(`Stop ${name(u)}'s weekly schedule from ${box.querySelector("#sdfrom").value}? (Kept in the history.)`)) send([]); };
  };
  // one day for one person
  const dayEd = (u, d) => {
    const ch = (sg.days || []).filter(x => x.user_id === u && x.day === d).pop(), now = (sg.shifts || []).filter(x => x.user_id === u && x.day === d);
    box.innerHTML = `<div class="edbox"><b>${esc(name(u))} · ${dnm(d)}</b>
      ${ch && !ch.cleared ? `<p class="muted sm" style="margin:4px 0">Changed by ${esc(ch.by || "")}${ch.note ? ": " + esc(ch.note) : ""}</p>` : ""}
      <div class="row" style="margin:6px 0">${pair("d", 0, now[0])} ${pair("d", 1, now[1])}</div>
      <label class="sm"><input type="checkbox" id="sdoff"> Not working this day</label>
      <div class="row" style="margin-top:6px"><input id="sdnote" placeholder="Why (optional)" style="flex:1;min-width:180px"><button class="btn small primary" id="sdsave">Save this day</button>
        ${ch && !ch.cleared ? `<button class="btn small" id="sdback">Back to the weekly schedule</button>` : ""}<button class="btn small" id="sdx">Cancel</button></div></div>`;
    box.scrollIntoView({ block:"nearest" });
    const send = async (shifts, clear) => { const r = await sb.rpc("sched_day_set", { p_user:u, p_day:d, p_shifts:shifts, p_clear:clear, p_note:box.querySelector("#sdnote").value }); if(!err(r)) re(); };
    box.querySelector("#sdx").onclick = close;
    box.querySelector("#sdsave").onclick = () => { let sh = []; if(!box.querySelector("#sdoff").checked){ try { sh = readPairs(box, "d", 2).map(x => ({ start:x.start, end:x.end })); } catch(x){ return alert(x.message); }
      if(!sh.length) return alert("Add a start and end time, or tick “Not working this day”."); }
      const tot = Math.round(((hrs[u] || 0) - now.reduce((a, x) => a + shH(x), 0) + sh.reduce((a, x) => a + shH(x), 0)) * 10) / 10;
      if(tot > 40 && !confirm(`With this change ${name(u)} is scheduled for ${tot} hours this week (Sun–Sat). Over 40 is overtime, which needs an OK first. Save anyway?`)) return;
      send(sh, false); };
    const bk = box.querySelector("#sdback"); if(bk) bk.onclick = () => send([], true);
  };
  // start date: the week on screen (not before this week); a pattern that starts inside it wins, so a save can't be undone the next day
  v.querySelectorAll("[data-wk]").forEach(b => b.onclick = ev2 => { ev2.stopPropagation(); const f = w >= wk(today) ? w : wk(today);
    const mid = (sg.weeks || []).filter(x => x.user_id === b.dataset.wk && x.starts_on > f && x.starts_on <= e).map(x => x.starts_on).sort().pop(); weekEd(b.dataset.wk, mid || f); });
  v.querySelectorAll("[data-cd]").forEach(c => c.onclick = () => { const [u, d] = c.dataset.cd.split("|"); dayEd(u, d); });
};

/* ---------- Staffing ▸ My performance (Brandon 2026-10-29: "show it to the employee in the hub so they can keep track of how good they have
   been doing"). my_performance() = your own Techs / Office rows of Team ratings (hub_my_performance.sql); 100 = the team's average. ---------- */
const PM = { tech:[["tasks","Tasks worked"],["tasks_per_hr","Tasks per regular hour"],["regular_hrs","Regular hours"],["days_worked","Days worked"],["reviews_good","Praised in guest reviews"]],
  office:[["hours","Clocked hours"],["steps","Check list steps"],["steps_per_hr","Check list steps per hour"],["fd_resolved","Freshdesk tickets resolved"],["fd_per_hr","Freshdesk tickets per hour"],
    ["calls","Phone calls"],["calls_per_hr","Phone calls per hour"],["talk_hrs","Time on the phone (hours)"],["activity","Computer activity (%)"],["flag_days","Days with a Work check flag"],
    ["fd_first_hrs","First reply (median hours, lower is better)"],["reviews_good","Praised in guest reviews"]] };
const PG = { tech:"Maintenance", office:"Office & front desk" }, PP = { "30d":"Last 30 days", "90d":"Last 90 days", "365d":"Last 12 months" };
/* Field work coaching (Brandon 2026-11-09: "help the field crew see when they are driving bad routes and other items"; picked Route check,
   Driving habits, Tasks done; tips, no score). my_field_coach() = your own days (hub_field_coach.sql, built hourly by field_coach.py). */
function fcCss(){ if(document.getElementById("fcCss")) return; const st = document.createElement("style"); st.id = "fcCss"; st.textContent = `
  .mp{--g:#3c5f12;--g2:#88b535;--gl:#dbe9c3;--gs:#f1f6e8;--am:#b5770a;--ams:#fbf0d9;--rd:#c8382b}
  .mp .mhead{background:linear-gradient(135deg,#3c5f12,#5b8a1e);color:#fff;border-radius:18px;padding:16px 20px;margin-bottom:12px}
  .mp .mhead h2{margin:0 0 2px;color:#fff;font-size:22px}.mp .mhead p{margin:0;opacity:.92}
  .mp .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:12px}
  .mp .grid.stats{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
  .mp .tile{background:var(--card,#fff);border:1px solid var(--line,#e8ece5);border-radius:16px;padding:14px 16px;box-shadow:0 2px 10px rgba(20,40,25,.06);min-width:0}
  .mp .tile.wide2{grid-column:span 2}
  .mp .tile h3{margin:0 0 6px;font-size:14px;color:var(--muted,#6b776f);font-weight:700}
  .mp .big{font-size:30px;font-weight:800;line-height:1.1;letter-spacing:-.5px}
  .mp .dl{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:1px 6px;margin-top:6px;background:var(--gs);color:var(--g)}
  .mp .dl.dn{background:var(--ams);color:var(--am)}
  .mp .sub{color:var(--muted,#6b776f);font-size:12.5px}
  .mp .bars{display:flex;align-items:flex-end;gap:6px;height:130px;margin-top:24px}
  .mp .bars{justify-content:space-between}.mp .bars span{flex:1;max-width:34px;background:var(--gl);border-radius:99px;min-height:8px;position:relative}
  .mp .bars span.hi{background:var(--g)}.mp .bars span:hover{background:var(--g2)}
  .mp .bars span em{position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-style:normal;font-size:11px;font-weight:700;background:var(--g);color:#fff;border-radius:6px;padding:1px 5px;white-space:nowrap}
  .mp .axis{display:flex;justify-content:space-between;color:var(--muted,#6b776f);font-size:11px;margin-top:6px}
  .mp .ring{display:flex;align-items:center;gap:14px}.mp .ring svg{flex:none}
  .mp .heat{display:grid;grid-template-columns:48px repeat(7,1fr);gap:4px;margin-top:8px;font-size:11px;color:var(--muted,#6b776f);align-items:center}
  .mp .heat i{display:block;height:26px;border-radius:6px;background:var(--gs)}
  .mp .meter{height:12px;background:var(--gs);border-radius:99px;overflow:hidden;margin:8px 0 4px}.mp .meter i{display:block;height:100%;background:var(--g2);border-radius:99px}
  .mp .row{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13.5px}.mp .row .lab{flex:0 0 46%}.mp .row .trk{flex:1;height:10px;background:var(--gs);border-radius:99px;position:relative}
  .mp .row .trk i{position:absolute;left:0;top:0;bottom:0;background:var(--g2);border-radius:99px}.mp .row .trk b{position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;background:#6b776f}
  .mp .row .val{flex:0 0 52px;text-align:right;font-weight:700}
  .mp .grade{font-size:46px;font-weight:800;line-height:1;color:var(--g)}.mp .grade.C{color:var(--am)}.mp .grade.D{color:var(--rd)}
  .mp .try{background:var(--gs);border-radius:12px;padding:10px 12px;margin:6px 0}.mp .try b{color:var(--g)}
  @media (prefers-color-scheme: dark){ .mp{--gl:#3a4a2a;--gs:#24321a;--ams:#3a2d12} }
  @media (max-width:640px){ .mp .row .lab{flex-basis:40%} .mp .bars{gap:3px} .mp .tile.wide2{grid-column:auto} }`; document.head.appendChild(st); }
const fcWeekKey = k => { const d = new Date(k + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
function fcBars(vals, labs, tip, fmt){   // rounded pill bars; the best one dark with its number on top
  const mx = Math.max(1, ...vals), hi = vals.indexOf(Math.max(...vals));
  return `<div class="bars" role="img" aria-label="${esc(tip)}">${vals.map((v, i) => `<span class="${i === hi && v ? "hi" : ""}" style="height:${Math.max(6, Math.round(v / mx * 100))}%" title="${esc(labs[i])}">${i === hi && v ? `<em>${esc(fmt ? fmt(v) : v)}</em>` : ""}</span>`).join("")}</div>`;
}
function fcRing(p, lab){ const r = 34, c = 2 * Math.PI * r, on = Math.max(0, Math.min(100, p));
  return `<svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label="${esc(lab)}"><circle cx="44" cy="44" r="${r}" fill="none" stroke="var(--gs)" stroke-width="10"/>
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="var(--g)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * on / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 44 44)"/>
    <text x="44" y="50" text-anchor="middle" font-size="18" font-weight="800" fill="currentColor">${on}%</text></svg>`; }
const fcDelta = (now, prev, unit) => { if(prev == null || now == null) return ""; const dlt = Math.round((now - prev) * 10) / 10; if(!dlt) return `<span class="dl">same as last week</span>`;
  return `<span class="dl ${dlt > 0 ? "" : "dn"}">${dlt > 0 ? "▲" : "▼"} ${Math.abs(dlt)}${unit} vs last week</span>`; };
// rolling: the last 7 days (today included) vs the 7 days before, so Monday mornings aren't all zeros
function fcWeeks(rows, val){
  const todayK = new Date().toLocaleDateString("en-CA", { timeZone:"America/Denver" }), t0 = Date.parse(todayK + "T12:00:00Z");
  let cur = 0, prv = 0, any = false;
  rows.forEach(x => { const ago = Math.round((t0 - Date.parse(x.day + "T12:00:00Z")) / 864e5), v = +val(x) || 0;
    if(ago >= 0 && ago < 7) cur += v; else if(ago >= 7 && ago < 14){ prv += v; any = true; } });
  return { cur, prv: any ? prv : null };
}
function fcHeat(rows, val, unit){
  const byDay = {}; rows.forEach(x => byDay[x.day] = val(x) || 0); const hmx = Math.max(1, ...Object.values(byDay));
  const todayK = new Date().toLocaleDateString("en-CA", { timeZone:"America/Denver" }), w0 = fcWeekKey(todayK), wks = [3, 2, 1, 0].map(n => { const d = new Date(w0 + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 7 * n); return d.toISOString().slice(0, 10); });
  return `<div class="heat"><span></span>${["S","M","T","W","T","F","S"].map(x => `<span style="text-align:center">${x}</span>`).join("")}
    ${wks.map(k => { const s0 = new Date(k + "T12:00:00Z"); return `<span>${s0.toLocaleDateString([], { timeZone:"UTC", month:"short", day:"numeric" })}</span>` + [0,1,2,3,4,5,6].map(i => { const dd = new Date(s0); dd.setUTCDate(dd.getUTCDate() + i); const key = dd.toISOString().slice(0, 10), n = byDay[key] || 0;
      return `<i title="${esc(dnm(key))}: ${Math.round(n * 10) / 10} ${unit}" style="${n ? `background:var(--g);opacity:${(0.25 + 0.75 * n / hmx).toFixed(2)}` : ""}"></i>`; }).join(""); }).join("")}</div>`;
}
const fcStat = (h, v, delta, sub) => `<div class="tile"><h3>${h}</h3><div class="big">${v}</div>${delta || ""}${sub ? `<div class="sub" style="margin-top:4px">${sub}</div>` : ""}</div>`;
// Everyone's work (Brandon 2026-11-09: "can we load other data too?"): stats per day from field_coach.py everyone() =
// hours (hub clock), tasks (Breezeway), steps (check lists), fd (Freshdesk tickets resolved), calls (Track Pulse), kudos (guest reviews).
const GM = [["hours", "Hours worked", "h", "your hub clock-ins"], ["tasks", "Breezeway tasks done", "tasks", "from Breezeway"], ["steps", "Check list steps", "steps", "ticked on Reservations check lists"],
  ["fd", "Freshdesk tickets solved", "tickets", "as the agent on the ticket"], ["calls", "Phone calls", "calls", "from Track Pulse"]];
function genCard(F){
  const asc = [...F].sort((a, b) => a.day < b.day ? -1 : 1), st = x => x.stats || {};
  const have = GM.filter(([k]) => asc.some(x => +st(x)[k] > 0));
  const ka = (asc.slice().reverse().find(x => st(x).kudos_all) || { stats:{} }).stats.kudos_all;
  if(!have.length && !ka) return "";
  const r1 = n => Math.round(n * 10) / 10;
  const main = have.filter(([k]) => k !== "hours").sort((a, b) => asc.reduce((s, x) => s + (+st(x)[b[0]] || 0), 0) - asc.reduce((s, x) => s + (+st(x)[a[0]] || 0), 0))[0];
  const last14 = asc.slice(-14);
  // hours per week (last 8 weeks)
  const hw = {}; asc.forEach(x => { const k = fcWeekKey(x.day); hw[k] = (hw[k] || 0) + (+st(x).hours || 0); }); const hk0 = Object.keys(hw).sort(), hf = hk0.findIndex(k => hw[k] > 0), hk = (hf < 0 ? [] : hk0.slice(hf)).slice(-8);
  return `<div class="sub" style="margin:0 0 6px">Last 7 days</div><div class="grid stats">${have.map(([k, l, u, src]) => { const w = fcWeeks(asc, x => +st(x)[k]);
      return fcStat(l, r1(w.cur) + (k === "hours" ? " h" : ""), fcDelta(r1(w.cur), w.prv == null ? null : r1(w.prv), k === "hours" ? " h" : "").replace("vs last week", "vs the 7 days before"), src); }).join("")}</div>
    <div class="grid">
      ${main ? `<div class="tile wide2"><h3>${esc(main[1])} each day</h3>${fcBars(last14.map(x => +st(x)[main[0]] || 0), last14.map(x => `${dnm(x.day)}: ${+st(x)[main[0]] || 0} ${main[2]}`), main[1] + " each day")}
        <div class="axis"><span>${esc(dnm(last14[0].day))}</span><span>${esc(dnm(last14[last14.length - 1].day))}</span></div></div>` : ""}
      ${have.some(([k]) => k === "hours") && hk.length ? `<div class="tile"><h3>Hours by week</h3>${fcBars(hk.map(k => r1(hw[k])), hk.map(k => `Week of ${dnm(k)}: ${r1(hw[k])} h`), "Hours by week", v => v + " h")}
        <div class="axis"><span>${esc(dnm(hk[0]))}</span><span>this week</span></div></div>` : ""}
      ${main ? `<div class="tile"><h3>Your busy days</h3>${fcHeat(asc, x => +st(x)[main[0]], main[2])}<div class="sub" style="margin-top:6px">Darker = more ${esc(main[2])} that day.</div></div>` : ""}
      ${ka ? `<div class="tile"><h3>❤️ Guest shout-outs</h3><div class="big">${ka.n}</div><div class="sub">guest review${ka.n === 1 ? "" : "s"} named you for great work</div>
        ${ka.latest.map(k => `<div class="try">“${esc(k.q)}…” <span class="sub">${esc(k.stars ? "★".repeat(Math.round(+k.stars)) : "")} ${esc(k.home || "")} · ${esc(dnm(k.day))}</span></div>`).join("")}</div>` : ""}
    </div>`;
}
// Field work (Brandon 2026-11-09; field crew only): Start + Finish taps, route tightness, smooth driving, tips. my_field_coach() rows.
function fcCard(F){
  const asc = [...F].filter(x => x.tasks || x.route || x.driving).sort((a, b) => a.day < b.day ? -1 : 1).filter(x => Date.now() - Date.parse(x.day) <= 29 * 864e5);
  if(!asc.length) return "";
  const done = x => (x.tasks || {}).done || 0, real = x => Math.max(0, done(x) - ((x.tasks || {}).nostart || 0) - ((x.tasks || {}).together || 0));
  const tight = x => x.route && x.route.est_mi ? Math.min(100, Math.round(100 * x.route.best_mi / x.route.est_mi)) : null;
  const D = fcWeeks(asc, done), R = fcWeeks(asc, real), pct = (r, d) => d ? Math.round(100 * r / d) : null;
  const pc = pct(R.cur, D.cur), pp = R.prv == null ? null : pct(R.prv, D.prv);
  const avg = a => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : null;
  const allT = asc.filter(x => tight(x) != null), lt = allT.slice(-10), thisWk = fcWeekKey(new Date().toLocaleDateString("en-CA", { timeZone:"America/Denver" }));
  const tCur = avg(allT.filter(x => fcWeekKey(x.day) === thisWk).map(tight)), tPrv = avg(allT.filter(x => fcWeekKey(x.day) < thisWk).slice(-5).map(tight));
  const dv = asc.filter(x => x.driving), smooth = dv.length ? Math.round(100 * dv.filter(x => (x.driving.brakes + x.driving.starts) === 0 && !x.driving.fast).length / dv.length) : null;
  const tips = [...asc].reverse().flatMap(x => (x.tips || []).map(t => ({ d:x.day, t }))).slice(0, 3);
  return `<h3 style="margin:6px 0 8px;font-size:16px">🧰 Your field work</h3>
    <div class="grid stats">
      ${fcStat("Start + Finish taps", pc == null ? "—" : pc + "%", fcDelta(pc, pp, " pts").replace("vs last week", "vs the 7 days before"), "last 7 days · goal 80%+")}
      ${fcStat("Route tightness", tCur == null ? (tPrv == null ? "—" : tPrv + "%") : tCur + "%", tCur != null ? fcDelta(tCur, tPrv, " pts") : "", "100% = the shortest order")}
      ${fcStat("Smooth driving", smooth == null ? "🚗" : smooth + "%", "", smooth == null ? "starts once your phone GPS is set up" : "days with no hard brakes or 75+ mph")}
    </div>
    <div class="grid">
      <div class="tile"><h3>Start + Finish tap habit</h3><div class="ring">${fcRing(pc || 0, "Start + Finish taps, last 7 days")}
        <div class="sub">Tap <b>Start</b> when you begin and <b>Finish</b> when you're done, so your time on every job counts.${pp != null ? `<br>The 7 days before: ${pp}%` : ""}</div></div></div>
      <div class="tile wide2"><h3>Route tightness by day</h3>${lt.length ? fcBars(lt.map(tight), lt.map(x => `${dnm(x.day)}: ${tight(x)}% (about ${x.route.est_mi} mi)`), "Route tightness by day", v => v + "%")
        + `<div class="axis"><span>${esc(dnm(lt[0].day))}</span><span>${esc(dnm(lt[lt.length - 1].day))}</span></div>` : `<p class="sub">Shows once you've visited 3+ homes in a day.</p>`}</div>
    </div>
    ${tips.length ? `<div class="tile" style="margin-bottom:12px"><h3>Try this</h3>${tips.map(x => `<div class="try"><b>${esc(dnm(x.d))}:</b> ${esc(x.t)}</div>`).join("")}</div>` : ""}
    <p class="sub" style="margin:0 0 12px">Route miles are estimates (straight-line distance between homes × 1.3), from your phone GPS stops or the order you tapped Start on Breezeway tasks.</p>`;
}
window.myPerf = async function(v){
  css(); v.innerHTML = `<div class="page stf wide"><p class="muted">Loading…</p></div>`;
  const [r, pt, fcr] = await Promise.all([sb.rpc("my_performance"), sb.rpc("my_pto"), sb.rpc("my_field_coach", { p_days:56 })]); if(current() !== "stf_perf") return;
  // PTO you're earning (Brandon 2026-10-29: "show how much PTO they are aquiring"); my_pto() = your own row (hub_my_pto.sql)
  const pto = (pt && pt.data) || [], hh = x => x == null ? "—" : (Math.round(+x * 10) / 10).toLocaleString() + " h";
  // Brandon 2026-11-09: "lets not push the pto so much" -> one quiet line near the bottom, details folded
  const ptoCard = pto.map(b => { const c = b.config || {}, have = b.calc_hours != null ? b.calc_hours : b.hours;
    const what = b.salaried ? "Salaried time off" : "Paid time off";
    const more = b.salaried ? `Salaried staff get ${esc(c.hours_per_year || 80)} hours a year${b.used_ytd != null ? `; used this year: ${hh(b.used_ytd)}` : ""}.`
      : `You earn ${esc(c.hours_per)} h for every ${esc(c.hours_worked)} h you work, up to ${esc(c.maximum_to_accrue)} h. It rolls over and never expires; 40 hours at most at one time. Source: your hub clock-ins × the PTO policy${b.as_of ? ` (updated ${esc(dnm(dkey(b.as_of)))})` : ""}.`;
    return `<details class="tile" style="margin-bottom:12px;padding:10px 16px"><summary style="cursor:pointer;font-size:14px">${what}: <b>${hh(have)}</b> ${b.salaried ? "left" : "available"} <span class="sub">· details</span></summary>
      <p class="sub" style="margin:6px 0 0">${more} Ask for it under Staffing ▸ Request Time Off.</p></details>`; }).join("");
  const rows = r.data || [], f = x => x == null ? "—" : (+x).toLocaleString(undefined, { maximumFractionDigits:2 });
  const ix = i => i == null ? "" : ` <span class="pill ${i >= 115 ? "green" : i <= 85 ? "amber" : ""}" title="100 = the team's average">${i}</span>`;
  const grps = [...new Set(rows.map(x => x.grp))];
  fcCss(); v.innerHTML = `<div class="page stf wide mp"><div class="mhead"><h2>My performance</h2><p>See how you're doing and where you can shine. These numbers are about you, so you can beat your own best week.</p></div>
    ${genCard((fcr && fcr.data) || [])}${fcCard((fcr && fcr.data) || [])}${grps.map(g => { const R = rows.filter(x => x.grp === g), cur = R.find(x => x.period === "30d") || R[0], m = (cur && cur.metrics) || {}, idx = m.idx || {};
      const bar = (k, l) => { const n = idx[k]; if(n == null) return ""; const w = Math.max(2, Math.min(100, n / 2));
        return `<div class="row"><span class="lab">${esc(l)}</span><span class="trk" title="${esc(l)}: ${f(m[k])} · 100 = the team's average"><i style="width:${w}%"></i><b></b></span><span class="val">${f(m[k])}</span></div>`; };
      if(!m.grade && !Object.keys(idx).length) return "";   // nothing to show for this kind of work yet
      return `<div class="tile" style="margin-bottom:12px"><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div><div class="grade ${esc((m.grade || "")[0] || "")}">${esc(m.grade || "—")}</div><div class="sub">${esc(PG[g] || g)} grade · ${esc(PP[cur && cur.period] || "")}</div></div>
        <div style="flex:1;min-width:200px">${R.map(x => `<span class="pill ${((x.metrics || {}).grade || "")[0] === "A" ? "green" : ""}" style="margin:2px">${esc(PP[x.period] || x.period)}: ${esc((x.metrics || {}).grade || "—")}</span>`).join("")}
          <div class="sub" style="margin-top:4px">A+ top 10% · A top 25% · B top half · C · D bottom 25%</div></div></div>
        <div style="margin-top:10px">${(PM[g] || []).map(([k, l]) => bar(k, l)).join("")}</div>
        <div class="sub">The line in the middle of each bar = the team's average. Past it = above average.</div></div>`; }).join("")
      || (pto.length ? "" : `<div class="card"><p class="muted" style="margin:0">There aren't enough numbers for you yet. Check back after a few weeks of work.</p></div>`)}${ptoCard}
    <p class="muted sm">Your grade compares you with the others who do the same kind of work, per hour you're clocked in. Sources: Breezeway tasks, your hub clock-ins (Hubstaff before Nov 11), Reservation check lists, Freshdesk tickets, phone calls (Track), Work check computer activity and guest reviews, worked out once a day by the hub.</p></div>`;
};

/* ---------- Hubstaff renewal warning (Brandon 2026-10-29: "a warning going to admin until brandon or kim confirms that we have moved out
   of hubstaff … we want to cancel before the renew on nov 11"). hubstaff_exit_status() is null for everyone but admins; the banner sits
   under the green banner on every page, like the calls / daily checks banners, until an admin taps "We're off Hubstaff". ---------- */
let HX = { at:0, j:null };
// close a staffing banner (Brandon 2026-10-30: "make it so the staffing banners can go away"). It stays closed on this device until what it
// says changes (sig), or until tomorrow for the Hubstaff renewal one. Browser storage only; nothing is saved for anyone else.
const BX = "stf_bx:";
const bxHidden = (k, sig) => { try { return localStorage.getItem(BX + k) === sig; } catch(e){ return false; } };
function bxAdd(b, k, sig){ const x = document.createElement("button"); x.className = "bx"; x.type = "button"; x.title = "Close (comes back when something changes)"; x.setAttribute("aria-label", "Close");
  x.textContent = "✕"; x.onclick = () => { try { localStorage.setItem(BX + k, sig); } catch(e){} b.remove(); document.querySelectorAll(".otplan").forEach(e => e.remove()); }; b.prepend(x); }
function hxDraw(){
  css(); document.querySelectorAll(".hxbanner").forEach(x => x.remove());
  const j = HX.j, v = document.getElementById("view");
  if(!j || j.done || !v || !v.parentNode) return;
  const hxSig = dkey(Date.now()) + (j.days_left <= 5 ? ":late" : ""); if(bxHidden("hx", hxSig)) return;
  const left = j.left || [], d = j.days_left, b = document.createElement("div");
  b.className = "hxbanner"; b.setAttribute("role", "status"); b.style.background = d <= 5 ? "#9b1c1c" : "#7a4b00";
  b.innerHTML = `⏳ Hubstaff renews ${d > 0 ? `in ${d} day${d === 1 ? "" : "s"} (Nov 11)` : d === 0 ? "TODAY (Nov 11)" : "Nov 11 — the renewal date has passed"}, ${esc(j.price)} (per Brandon). Cancel it once everyone clocks in on the hub: ${left.length ? `${left.length} Hubstaff ${left.length === 1 ? "person hasn't" : "people haven't"} clocked in on the hub in the last 3 days.` : "everyone in Hubstaff has clocked in on the hub in the last 3 days."}
    <a href="#/staffing">Staffing →</a><a href="#" data-hxdone>We're off Hubstaff ✓</a>`;
  b.title = left.length ? "Not on the hub clock yet: " + left.join(", ") : "";
  b.querySelector("[data-hxdone]").onclick = async e => { e.preventDefault();
    if(!confirm("Confirm we've moved off Hubstaff? The warning stops for you and Kim/Brandon.")) return;
    const r = await sb.rpc("hubstaff_exit_set", { p_done:true, p_note:null }); if(r.error) return alert(r.error.message); hxBanner(true); };
  bxAdd(b, "hx", hxSig); v.parentNode.insertBefore(b, v);
}
window.hxBanner = async function(force){
  if(typeof ME === "undefined" || !ME || !ME.admin || typeof sb === "undefined") return;
  if(force || Date.now() - HX.at > 5 * 60e3){ const r = await sb.rpc("hubstaff_exit_status"); HX = { at:Date.now(), j: r.error ? null : r.data }; }
  hxDraw();
};
const hxBoot = setInterval(() => { if(typeof ME !== "undefined" && ME && document.getElementById("view")){ clearInterval(hxBoot); hxBanner(true); setInterval(() => hxBanner(false), 60e3); window.addEventListener("hashchange", () => hxBanner(false)); } }, 1000);

/* ---------- Close to 40 hours (Brandon 2026-10-29: "we dont want to pay overtime … the notice should go to the managers and the admin";
   2026-10-30: "people can see their own hours when they get to 38 - we will want to notify a manager if they havent already scheduled them
   to clock out soon or approve overtime. no one should be going into overtime without approval"). hub_overtime.sql + hub_overtime_2.sql:
   overtime_watch() = people you look after with 32+ h (never yourself) + their plan + needs ('plan' at 38 h with no plan, 'over' at 40+ h
   without an OK) · overtime_mine() = your own row from 38 h · overtime_plan() (clock out by a time / OK overtime up to N h / cancel) ·
   overtime_ask(). The hub warns; it never blocks the clock (unapproved hours still have to be paid). ---------- */
let OT = { at:0, l:null, me:null };
const fn = n => esc(String(n || "").split(" ")[0]);
const at40 = x => x.open_since && +x.hours < 40 ? new Date(Date.now() + (40 - +x.hours) * 36e5) : null;   // when they reach 40 h if they stay in
const planTxt = x => x.plan_kind === "approved" ? `overtime OK'd up to ${+x.plan_up_to} h (${fn(x.plan_by)})`
  : x.plan_kind === "clock_out" ? `clock out by ${tm(x.plan_out_at)}${dkey(x.plan_out_at) !== dkey(Date.now()) ? " " + dnm(dkey(x.plan_out_at)) : ""} (${fn(x.plan_by)})` : "";
const localIn = d => { const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
function otPlanBox(x, b, done){
  document.querySelectorAll(".otplan").forEach(e => e.remove());
  const t = at40(x) || (() => { const d = new Date(); d.setHours(17, 0, 0, 0); return d < new Date() ? new Date(Date.now() + 36e5) : d; })();
  const f = document.createElement("div"); f.className = "otplan";
  f.innerHTML = `<b>${esc(x.name)}</b> · ${hm(+x.hours)} this week${x.asked_at ? ` · asked for overtime${x.asked_note ? `: “${esc(x.asked_note)}”` : ""}` : ""}
    <div class="row" style="margin-top:8px"><label><input type="radio" name="otk" value="clock_out" checked> Clock out by</label> <input type="datetime-local" data-t value="${localIn(t)}">
      ${at40(x) ? `<span class="sm">(reaches 40 h at ${tm(at40(x))})</span>` : ""}</div>
    <div class="row" style="margin-top:6px"><label><input type="radio" name="otk" value="approved"> Approve overtime up to</label> <input type="number" data-u min="40.5" max="60" step="0.5" value="${Math.max(41, Math.ceil(+x.hours) + 2)}" style="width:80px"> h this week</div>
    ${x.plan_kind ? `<div class="row" style="margin-top:6px"><label><input type="radio" name="otk" value="cancel"> Remove the plan (${planTxt(x)})</label></div>` : ""}
    <div class="row" style="margin-top:6px"><input data-n placeholder="Note (optional)" style="flex:1;min-width:160px"><button class="btn small primary" data-s>Save</button><button class="btn small" data-c>Close</button></div>`;
  f.querySelector("[data-c]").onclick = () => f.remove();
  f.querySelector("[data-s]").onclick = async () => {
    const k = f.querySelector("[name=otk]:checked").value, tv = f.querySelector("[data-t]").value;
    const r = await sb.rpc("overtime_plan", { p_user:x.user_id, p_kind:k, p_out_at: k === "clock_out" && tv ? new Date(tv).toISOString() : null,
      p_up_to: k === "approved" ? +f.querySelector("[data-u]").value : null, p_note: f.querySelector("[data-n]").value || null });
    if(r.error) return alert(r.error.message); f.remove(); await otBanner(true); if(done) done(); };
  b.after(f);
}
// Brandon 2026-11-06: "we can turn overtime banners into just bell notifications". otDraw no longer puts a banner on the page; it builds
// OT.items, which hub.html bellLoad() shows in the 🔔 (work alert, no switch). The plan / approve box lives on Staffing ▸ Clock In / Clock Out.
const otOkd = x => x && x.plan_kind === "approved" && !x.needs;   // Brandon 2026-11-01: approved overtime = no notice
function otMeHtml(){
  const m = OT.me && OT.me[0]; if(!m || otOkd(m)) return "";
  const t = at40(m), red = m.needs === "over";
  return `<div class="sm" style="margin-top:6px;padding:8px 10px;border-radius:10px;background:${red ? "#fde8e8;color:#7f1d1d" : "#fff4e0;color:#6b4100"}">⏱ ${m.plan_kind ? `Your manager's plan: ${planTxt(m)}.`
    : red ? "You're over 40 hours without overtime approval: please clock out, or ask your manager now."
    : `To stay under 40, ${t ? `clock out by <b>${tm(t)}</b>` : "keep the rest of the week under " + hm(Math.max(0, 40 - +m.hours))}, or ask your manager to OK overtime.`}
    ${m.asked_at ? ` · Asked for overtime ${tm(m.asked_at)}, waiting for your manager.` : m.plan_kind !== "approved" ? ` <a href="#" data-otask>Ask for overtime</a>` : ""}</div>`;
}
document.addEventListener("click", async e => { const a = e.target.closest && e.target.closest("[data-otask]"); if(!a) return; e.preventDefault();
  const n = prompt("Why do you need overtime this week? (your manager sees this)"); if(n === null) return;
  const r = await sb.rpc("overtime_ask", { p_note:n }); if(r.error) return alert(r.error.message); await otBanner(true);
  if(location.hash.startsWith("#/staffing") && window.staffingView) staffingView(document.getElementById("view")); });
function otDraw(){
  document.querySelectorAll(".otbanner").forEach(x => x.remove());   // old banners from a cached page
  const it = [], m = OT.me && OT.me[0];
  if(m && !otOkd(m)){ const t = at40(m);
    it.push({ ic:"⏱", t:`You're at ${hm(+m.hours)} this week`, href:"#/staffing",
      s: m.plan_kind ? `Your manager's plan: ${planTxt(m)}` : m.needs === "over" ? "Over 40 without overtime approval: clock out or ask your manager"
        : `${t ? `Clock out by ${tm(t)}` : "Stay under " + hm(Math.max(0, 40 - +m.hours)) + " more"} to stay under 40, or ask for overtime${m.asked_at ? " (asked, waiting)" : ""}` }); }
  (OT.l || []).filter(x => !otOkd(x)).forEach(x => it.push({ ic:"⏱", href:"#/staffing",
    t:`${String(x.name || "").split(" ")[0]} is at ${hm(+x.hours)} this week${x.needs === "over" ? " ⚠ over 40, not approved" : ""}`,
    s:`${x.open_since ? "Clocked in now · " : ""}${x.needs === "plan" ? "Needs a clock-out time or an overtime OK" : x.needs === "over" ? "Approve overtime or have them clock out" : x.plan_kind ? planTxt(x) : "Close to 40 hours (no overtime without approval)"}${x.asked_at ? " · asked for overtime" : ""}` }));
  const sig = JSON.stringify(it), was = OT.sig; OT.items = it; OT.sig = sig;
  if(was !== undefined && was !== sig && window.bellLoad) window.bellLoad(true);   // count on the bell updates when hours change
}
window.otBellItems = async function(){ if(typeof ME === "undefined" || !ME) return []; await otBanner(false).catch(() => {}); return OT.items || []; };
window.otBanner = async function(force){
  if(typeof ME === "undefined" || !ME || typeof sb === "undefined") return;
  if(document.querySelector(".otplan") && !force) return;   // don't redraw under an open plan box
  if(force || Date.now() - OT.at > 5 * 60e3){
    const [r, s] = await Promise.all([sb.rpc("overtime_watch"), sb.rpc("overtime_mine")]);
    OT = { at:Date.now(), l: r.error ? null : r.data, me: s.error ? null : s.data }; }
  otDraw();
};
const otBoot = setInterval(() => { if(typeof ME !== "undefined" && ME && document.getElementById("view")){ clearInterval(otBoot); otBanner(true); setInterval(() => otBanner(false), 60e3); window.addEventListener("hashchange", () => otBanner(false)); } }, 1000);
})();
