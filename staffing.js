/* staffing.js (Brandon 2026-10-29: "we can call it the Staffing Desk"; first piece "Clock in/out + hours"; "Victor + managers + admins").
   Step 4 of the move-off-Hubstaff plan, for people who clock in the hub instead of Hubstaff (team hub_clock; Victor first).
   Loaded by hub.html; uses its sb / $ / esc / ME. Route #/staffing. Data (hub_staffing.sql): hub_clock (RLS hub_staff_sees: you,
   your manager, admins) · clock_punch(in/out + one location pin) · clock_add (missed punch: yours waits for the manager, a manager's
   counts) · clock_decide (approve / deny / set off) · hub_clock_weeks + clock_week_ok (manager signs off a Sun-Sat week) · clock_people().
   Staffing drop-down (Brandon 2026-10-29): Clock In / Clock Out (#/staffing) · Schedule (#/stf_sched, staffSched) · Request Time Off (#/cal_off, calendar.js) · My performance (#/stf_perf, myPerf).
   Hours: each "in" pairs with the next "out" and counts on the day of the "in" (Park City time). No pay rates here.
   2026-10-30 (Brandon): ✎ on every punch → clock_edit (hub_clock_edit.sql; own or anyone you look after, reason required) · managers get
   "Who's clocked in now" (donut + list) and week-hours rings at the top · "Approve overtime / set clock-out" per person · banners close (✕). */
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
function nowCard(ppl, rows, pl){
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
      </div></div></div>`;
}

function weekTable(rows, w, pl, boss){
  const s = shifts(rows), today = dkey(Date.now());
  let h = "";
  for(let i = 0; i < 7; i++){ const k = addK(w, i), l = s.days[k] || [], t = l.reduce((a, x) => a + x.h, 0);
    const open = s.open && dkey(s.open.at) === k;
    if(!l.length && !open && k !== today) { h += `<tr><td>${dnm(k)}</td><td class="muted">—</td><td></td></tr>`; continue; }
    h += `<tr><td>${dnm(k)}</td><td>${l.map(x => `${pt(x.a)} – ${pt(x.b)} <span class="muted sm">(${hm(x.h)})</span> ${where(x.a, pl)}${boss ? offBtn(x.a) + offBtn(x.b) : ""}`).join("<br>")}
      ${open ? `${l.length ? "<br>" : ""}${pt(s.open)} – <b>still clocked in</b> ${where(s.open, pl)}${boss ? offBtn(s.open) : ""}` : ""}${!l.length && !open ? `<span class="muted">—</span>` : ""}</td><td class="r">${t ? hm(t) : ""}</td></tr>`; }
  const odd = s.odd.filter(p => wk(dkey(p.at)) === w);
  return `<div class="tow"><table><tr><th>Day</th><th>In – out</th><th class="r">Hours</th></tr>${h}
    <tr><td colspan="2"><b>Week</b></td><td class="r"><b>${hm(weekHours(s, w))}</b></td></tr></table></div>
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

window.staffingView = async function(v){
  css();
  v.innerHTML = `<div class="page stf"><p class="muted">Loading…</p></div>`;
  const today = dkey(Date.now()), w = SS.week || wk(today);
  const [pp, cr, wr, pl, hw] = await Promise.all([sb.rpc("clock_people"), sb.from("hub_clock").select("*").gte("at", addK(w, -7) + "T00:00:00Z").order("at"),
    sb.from("hub_clock_weeks").select("*").order("approved_at", { ascending:false }), places().catch(() => []),
    sb.from("hub_work_check").select("user_id,day,tracked_h").gte("day", w).lte("day", addK(w, 6))]);   // Hubstaff hours while both run (RLS: your team)
  const nr = await sb.from("hub_clock").select("*").eq("status", "ok").gte("at", new Date(Date.now() - 30 * 36e5).toISOString()).order("at");   // right now, whatever week is shown
  const nowRows = nr.data || [], curW = w === wk(today);
  if(!OT.at) await otBanner(true).catch(() => {});
  const hsH = u => ((hw && hw.data) || []).filter(x => x.user_id === u).reduce((a, x) => a + (+x.tracked_h || 0), 0), hsOn = u => ((hw && hw.data) || []).some(x => x.user_id === u);
  const ppl = pp.data || [], all = cr.data || [], weeks = wr.data || [];
  const meP = ppl.find(p => p.is_me), myId = meP && meP.user_id, meOn = !!meP, team = ppl.filter(p => !p.is_me);
  const pend = await sb.from("hub_clock").select("*").eq("status", "pending").order("at");
  const pendAll = pend.data || [];
  const wkOk = (u, wk_) => weeks.find(x => x.user_id === u && x.week === wk_);
  const nav = `<div class="row" style="margin:0 0 10px"><button class="btn small" data-w="-7">← Week before</button><b>Week of ${dnm(w)}</b>
    ${w < wk(today) ? `<button class="btn small" data-w="7">Next week →</button> <button class="btn small" data-w="0">This week</button>` : ""}</div>`;
  let h = `<div class="page stf wide"><h2 style="margin:0 0 10px">Staffing</h2>${team.length ? nowCard(ppl, nowRows, pl) : ""}`;   // managers: who's in, first thing
  if(meOn){
    const mine = all.filter(p => p.user_id === myId), s = shifts(mine), last = mine.filter(p => p.status === "ok").slice(-1)[0];
    const isIn = last && last.kind === "in";
    const ok = wkOk(myId, w);
    const myH = weekHours(s, wk(today)) + (s.open ? (Date.now() - Date.parse(s.open.at)) / 36e5 : 0);
    h += `<div class="card clk"><div class="row" style="gap:14px">${ring(myH, 88)}<div><div style="font-size:18px"><b>${isIn ? "You're clocked in" : "You're clocked out"}</b></div>
        <div class="muted">${isIn ? `since ${tm(last.at)}${dkey(last.at) !== today ? " " + dnm(dkey(last.at)) : ""} · ${hm((Date.now() - Date.parse(last.at)) / 36e5)}` : last ? `last clocked out ${dnm(dkey(last.at))} ${tm(last.at)}` : "Tap Clock in when you start work."}</div>
        <div class="muted sm">This week: ${hm(myH)}${myH > 40 ? " · over 40" : myH >= 36 ? " · close to 40" : ""}</div></div></div>
      <button class="btn primary big" id="punch" data-k="${isIn ? "out" : "in"}">${isIn ? "Clock out" : "Clock in"}</button></div>
      <p class="muted sm" style="margin:-4px 0 10px">Your phone's location is saved once when you clock in or out (only you, your manager and Brandon/Kim see it). Not during the day.</p>
      <div class="card">${nav}${weekTable(mine, w, pl, false)}${ok ? `<p class="sm" style="margin:6px 0 0">✅ Approved by ${esc(ok.approved_by)} (${hm(+ok.hours)})</p>` : ""}</div>
      ${pendAll.filter(p => p.user_id === myId).length ? `<div class="card"><b>Waiting for your manager</b><table>${pendAll.filter(p => p.user_id === myId).map(p => pendRow(p, null, false)).join("")}</table></div>` : ""}
      ${addForm(myId, false)}`;
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
        const ot = (OT.l || []).find(x => x.user_id === p.user_id);
        return `<details data-du="${p.user_id}" style="margin:8px 0" ${team.length === 1 || SS.open.has(p.user_id) ? "open" : ""}><summary><b>${esc(p.name)}</b> · ${hm(hrs)}${hh != null ? ` <span class="pill ${Math.abs(gap) > 0.5 ? "amber" : ""}" title="Hours Hubstaff tracked this week, side by side until Hubstaff is cancelled">Hubstaff ${hm(hh)}${Math.abs(gap) > 0.5 ? ` · ${gap > 0 ? "+" : "−"}${hm(Math.abs(gap))} on the hub` : ""}</span>` : ""} ${now ? `<span class="pill green">clocked in since ${tm(last.at)}</span>` : ""}
          ${ok ? `<span class="pill ${changed ? "amber" : "green"}">${changed ? `approved at ${hm(+ok.hours)}, changed since` : `approved by ${esc(ok.approved_by)}`}</span>` : ""}</summary>
          ${weekTable(rows, w, pl, true)}${ME.admin ? notCounted(rows, w) : ""}
          ${curW ? `<div class="row" style="margin-top:6px"><span class="sm">${ot && ot.plan_kind ? "Overtime plan: " + planTxt(ot) : "No overtime plan this week."}${ot && ot.asked_at ? " · asked for overtime" + (ot.asked_note ? `: “${esc(ot.asked_note)}”` : "") : ""}</span>
            <button class="btn small" data-otp="${p.user_id}" data-h="${Math.round(tH(p) * 100) / 100}">${ot && ot.plan_kind ? "Change overtime plan" : "Approve overtime / set clock-out"}</button></div>` : ""}
          <div class="row" style="margin-top:6px">${(!ok || changed) && w < wk(today) ? `<button class="btn small primary" data-wok="${p.user_id}" data-h="${hrs}">Approve ${hm(hrs)} for this week</button>` : w >= wk(today) ? `<span class="muted sm">Approve the week once it's over.</span>` : ""}</div>
          ${addForm(p.user_id, true)}</details>`; }).join("")}</div>`;
  } else if(!meOn) h += `<div class="card"><p class="muted" style="margin:0">Nobody on your team clocks in on the hub yet. People move here from Hubstaff one at a time.</p></div>`;
  h += `<p class="muted sm">Hours count from each clock-in to the next clock-out, on the day of the clock-in (Park City time). Source: the hub time clock.</p></div>`;
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
const t12 = t => { if(!t) return ""; const [H, M] = t.split(":").map(Number); return `${H % 12 || 12}${M ? ":" + String(M).padStart(2, "0") : ""}${H < 12 ? "a" : "p"}`; };
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
  const hcol = id => { const h = Math.round((hrs[id] || 0) * 10) / 10; return h ? `<td class="r sm"${h > 40 ? ' style="color:var(--red,#b3261e);font-weight:700" title="Over 40 scheduled hours"' : ""}>${h} h</td>` : `<td class="r sm muted">—</td>`; };
  const td = (p, d) => { const st = [d === today ? "background:var(--pine-soft,#eaf3da)" : "", can.has(p.id) ? "cursor:pointer" : ""].filter(Boolean).join(";");
    return `<td class="sm"${st ? ` style="${st}"` : ""}${can.has(p.id) ? ` data-cd="${p.id}|${d}" title="Change this day"` : ""}>${((cell[p.id] || {})[d] || []).join("") || `<span class="muted">—</span>`}</td>`; };
  v.innerHTML = `<div class="page stf wide"><h2 style="margin:0 0 10px">Schedule</h2>
    <div class="card"><div class="row" style="margin:0 0 10px"><button class="btn small" data-w="-7">← Week before</button><b>Week of ${dnm(w)}</b>
      <button class="btn small" data-w="7">Next week →</button>${w !== wk(today) ? ` <button class="btn small" data-w="0">This week</button>` : ""}</div>
    <div id="sedbox"></div>
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
    box.querySelector("#sdsave").onclick = () => { let sh; try { sh = ["a", "b"].flatMap(k => readPairs(box, k, 7).map(x => ({ dow:x.i, start:x.start, end:x.end }))); } catch(x){ return alert(x.message); } send(sh); };
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
      if(!sh.length) return alert("Add a start and end time, or tick “Not working this day”."); } send(sh, false); };
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
  office:[["steps","Check list steps"],["fd_resolved","Freshdesk tickets resolved"],["fd_handled","Freshdesk tickets handled"],["fd_first_hrs","First reply (median hours, lower is better)"],["reviews_good","Praised in guest reviews"]] };
const PG = { tech:"Maintenance", office:"Office & front desk" }, PP = { "30d":"Last 30 days", "90d":"Last 90 days", "365d":"Last 12 months" };
window.myPerf = async function(v){
  css(); v.innerHTML = `<div class="page stf wide"><p class="muted">Loading…</p></div>`;
  const [r, pt] = await Promise.all([sb.rpc("my_performance"), sb.rpc("my_pto")]); if(current() !== "stf_perf") return;
  // PTO you're earning (Brandon 2026-10-29: "show how much PTO they are aquiring"); my_pto() = your own row (hub_my_pto.sql)
  const pto = (pt && pt.data) || [], hh = x => x == null ? "—" : (Math.round(+x * 10) / 10).toLocaleString() + " h";
  const ptoCard = pto.map(b => { const c = b.config || {}, have = b.calc_hours != null ? b.calc_hours : b.hours;
    if(b.salaried) return `<div class="card"><b style="font-size:16px">Salaried time off</b><div style="font-size:22px;margin:6px 0"><b>${hh(have)}</b> left</div>
      <p class="muted sm" style="margin:0">Salaried staff get ${esc(c.hours_per_year || 80)} hours a year${b.used_ytd != null ? ` · used this year: ${hh(b.used_ytd)}` : ""}.</p></div>`;
    const wk = b.worked_ytd && b.calc_from ? (+b.worked_ytd) / Math.max(1, (Date.now() - Date.parse(new Date().getFullYear() + "-01-01")) / (7 * DAY)) : null;
    return `<div class="card"><b style="font-size:16px">Paid time off you're earning</b><div style="font-size:22px;margin:6px 0"><b>${hh(have)}</b> available</div>
      <p style="margin:0 0 4px">You earn <b>${esc(c.hours_per)} h</b> of paid time off for every <b>${esc(c.hours_worked)} h</b> you work, up to <b>${esc(c.maximum_to_accrue)} h</b> saved up.${have != null && c.maximum_to_accrue && +have >= +c.maximum_to_accrue ? ` <span class="pill amber">You're at the most you can save. Use some so you keep earning.</span>` : ""}</p>
      ${wk ? `<p class="muted sm" style="margin:0">At your pace this year (about ${hh(wk)} worked a week) that's about ${hh(wk * c.hours_per / c.hours_worked)} of PTO a week.</p>` : ""}
      <p class="muted sm" style="margin:4px 0 0">Ask for it under Staffing ▸ Request Time Off. Source: hours you tracked × the PTO policy, worked out by the hub${b.as_of ? ` (updated ${esc(dnm(dkey(b.as_of)))})` : ""}.</p></div>`; }).join("");
  const rows = r.data || [], f = x => x == null ? "—" : (+x).toLocaleString(undefined, { maximumFractionDigits:2 });
  const ix = i => i == null ? "" : ` <span class="pill ${i >= 115 ? "green" : i <= 85 ? "amber" : ""}" title="100 = the team's average">${i}</span>`;
  const grps = [...new Set(rows.map(x => x.grp))];
  v.innerHTML = `<div class="page stf wide"><h2 style="margin:0 0 6px">My performance</h2>
    <p class="muted" style="margin:0 0 10px">How you've been doing, from the same numbers your manager sees. The small number next to a measure compares you with the team: 100 = the team's average${rows[0] ? ` · updated ${esc(dnm(rows[0].as_of))}` : ""}.</p>
    ${ptoCard}${grps.map(g => `<div class="card"><b style="font-size:16px">${esc(PG[g] || g)}</b><div class="tow"><table><tr><th></th>${rows.filter(x => x.grp === g).map(x => `<th class="r">${esc(PP[x.period] || x.period)}</th>`).join("")}</tr>
      <tr><td><b>Overall</b></td>${rows.filter(x => x.grp === g).map(x => `<td class="r"><b>${x.score == null ? "—" : Math.round(x.score)}</b>${x.rank ? `<div class="muted sm">#${x.rank} of ${x.of_n}</div>` : ""}</td>`).join("")}</tr>
      ${(PM[g] || []).map(([k, l]) => `<tr><td>${esc(l)}</td>${rows.filter(x => x.grp === g).map(x => `<td class="r">${f((x.metrics || {})[k])}${ix(((x.metrics || {}).idx || {})[k])}</td>`).join("")}</tr>`).join("")}</table></div></div>`).join("")
      || (pto.length ? "" : `<div class="card"><p class="muted" style="margin:0">There aren't enough numbers for you yet. Check back after a few weeks of work.</p></div>`)}
    <p class="muted sm">Sources: Breezeway tasks, Hubstaff hours, Reservation check lists, Freshdesk tickets and guest reviews, worked out once a day by the hub.</p></div>`;
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
function otDraw(){
  css(); document.querySelectorAll(".otbanner,.otplan").forEach(x => x.remove());
  const v = document.getElementById("view"); if(!v || !v.parentNode) return;
  const m = OT.me && OT.me[0];
  const meSig = m && [m.week, m.needs || "", m.plan_kind || "", m.plan_up_to || "", m.plan_out_at || "", m.asked_at || ""].join("|");
  if(m && !bxHidden("ot_me", meSig)){   // your own hours, from 38 h
    const b = document.createElement("div"), t = at40(m);
    b.className = "hxbanner otbanner"; b.setAttribute("role", "status");
    b.style.background = m.needs === "over" ? "#9b1c1c" : m.needs ? "#7a4b00" : "#1f5f3f";
    b.innerHTML = `⏱ You're at <b>${hm(+m.hours)}</b> this week. ${m.plan_kind ? `Your manager's plan: ${planTxt(m)}.`
      : m.needs === "over" ? "You're over 40 hours without overtime approval: please clock out, or ask your manager now."
      : `To stay under 40, ${t ? `clock out by <b>${tm(t)}</b>` : "keep the rest of the week under " + hm(Math.max(0, 40 - +m.hours))}, or ask your manager to OK overtime.`}
      ${m.asked_at ? `<span style="margin-left:8px">· Asked for overtime ${tm(m.asked_at)}, waiting for your manager.</span>` : m.plan_kind !== "approved" ? `<a href="#" data-ask>Ask for overtime</a>` : ""}<a href="#/staffing">Staffing →</a>`;
    b.title = "Hours since Sunday: the larger of the hub clock and Hubstaff.";
    const a = b.querySelector("[data-ask]"); if(a) a.onclick = async e => { e.preventDefault();
      const n = prompt("Why do you need overtime this week? (your manager sees this)"); if(n === null) return;
      const r = await sb.rpc("overtime_ask", { p_note:n }); if(r.error) return alert(r.error.message); otBanner(true); };
    bxAdd(b, "ot_me", meSig); v.parentNode.insertBefore(b, v);
  }
  const l = OT.l; if(!l || !l.length) return;
  const sig = l.map(x => [x.user_id, x.week, x.needs || "", x.plan_kind || "", x.asked_at || "", +x.hours >= 38 ? 38 : +x.hours >= 36 ? 36 : 32].join(",")).join("|");
  if(bxHidden("ot", sig)) return;
  const need = l.filter(x => x.needs), b = document.createElement("div");
  b.className = "hxbanner otbanner"; b.setAttribute("role", "status");
  b.style.background = need.some(x => x.needs === "over") ? "#9b1c1c" : need.length || +l[0].hours >= 38 ? "#9b1c1c" : "#7a4b00";
  b.innerHTML = `⏱ Close to 40 hours this week (no overtime without approval): ${l.map(x => `<b>${fn(x.name)} ${hm(+x.hours)}</b>${x.open_since ? " (clocked in now)" : ""}${
      x.needs === "over" ? " ⚠ over 40, not approved" : x.needs === "plan" ? " · needs a plan" : x.plan_kind ? " · " + planTxt(x) : ""}${x.asked_at ? " · asked for overtime" : ""}${
      ` <a href="#" data-ot="${x.user_id}" style="margin-left:4px">${x.plan_kind ? "Change" : "Approve overtime / plan"}</a>`}`).join(" · ")}<a href="#/staffing">Staffing →</a>`;
  b.title = "Hours since Sunday: the larger of the hub clock and Hubstaff. From 38 h each person needs a clock-out time or an overtime OK. Salaried people aren't counted.";
  b.querySelectorAll("[data-ot]").forEach(a => a.onclick = e => { e.preventDefault(); otPlanBox(l.find(x => x.user_id === a.dataset.ot), b); });
  bxAdd(b, "ot", sig); v.parentNode.insertBefore(b, v);
}
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
