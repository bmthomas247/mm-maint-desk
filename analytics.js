/* analytics.js (Brandon 2026-10-28): Reports & Analytics ▸ Key Data reports.
   Loaded by hub.html; uses its sb / $ / esc / hashArg. Data: analytics_market_trend() + analytics_vs_comps() (hub_analytics.sql),
   both gated by hub_can('analytics') in Supabase. Routes: #/an/market · #/an/comps
   Round 2 (2026-10-28, hub_analytics_2.sql): #/an/demand · #/an/pace · #/an/top · #/an/home/<comp id> · #/an/channels
   Round 3 (2026-10-28, hub_analytics_3.sql): #/an/worst · #/an/worst/<comp id> */
(function(){
const CSS = `
.anbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px} .anbar select,.anbar input{width:auto;min-width:150px} .anbar input{flex:1}
.anwrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.antbl{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}
.antbl th,.antbl td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.antbl th{font-size:12px;color:var(--muted);font-weight:700;background:var(--ground);position:sticky;top:0;cursor:pointer}
.antbl th:first-child,.antbl td:first-child,.antbl td.l,.antbl th.l{text-align:left}
.antbl tr.fut td{color:var(--ink-2);font-style:italic} .antbl tr:last-child td{border-bottom:0}
.anup{color:var(--green,#2f7a3a);font-weight:700} .andn{color:var(--red,#b3261e);font-weight:700}
.ankpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:0 0 12px}
.ankpi .card{margin:0;padding:12px 14px} .ankpi b{display:block;font-size:22px} .ankpi small{color:var(--muted)}
.ansrc{font-size:12.5px;color:var(--muted);margin:8px 0 0}
.anch{position:relative;border:1px solid var(--line);border-radius:12px;background:var(--card);padding:10px 12px 6px;margin:0 0 12px}
.anch h4{margin:0 0 4px;font-size:14px} .anch svg{display:block;width:100%;height:auto;overflow:visible}
.anch .ax{font-size:11px;fill:var(--muted)} .anch .gr{stroke:var(--line);stroke-width:1}
.anleg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--ink-2);margin:2px 0 0} .anleg i{display:inline-block;width:18px;height:0;border-top:2px solid;vertical-align:middle;margin-right:5px}
.antip{position:absolute;pointer-events:none;background:var(--ink,#1d2a22);color:#fff;font-size:12px;line-height:1.35;padding:6px 8px;border-radius:8px;white-space:nowrap;display:none;z-index:2}
.anch2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:12px} .anch2 .anch{margin:0}
.anh3{margin:20px 0 6px;font-size:17px} .anlink{font-weight:700;color:var(--pine);text-decoration:none} .anlink:hover{text-decoration:underline}
.anbarc{display:inline-block;height:8px;border-radius:4px;background:var(--forest-2,#2f5d3a);vertical-align:middle;margin-left:6px}`;
let cssDone = false;
const css = () => { if(cssDone) return; cssDone = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); };
const pct = v => v == null || isNaN(v) ? "—" : (v * 100).toFixed(1) + "%";
const usd = v => v == null || isNaN(v) ? "—" : "$" + Math.round(v).toLocaleString();
const pts = (a, b) => a == null || b == null ? "—" : `<span class="${a >= b ? "anup" : "andn"}">${a >= b ? "+" : ""}${((a - b) * 100).toFixed(1)} pts</span>`;
const chg = (a, b) => a == null || b == null || !b ? "—" : `<span class="${a >= b ? "anup" : "andn"}">${a >= b ? "+" : ""}${((a / b - 1) * 100).toFixed(0)}%</span>`;
const mon = s => new Date(s + "T12:00").toLocaleDateString(undefined, { month:"short", year:"numeric" });
const dt = s => s ? new Date(s).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }) : "—";
const back = `<p style="margin:0 0 6px"><a href="#/reports">← All reports</a></p>`;
const fail = (v, e) => v.innerHTML = `<div class="page">${back}<div class="card"><p class="muted">Couldn't load: ${esc(e.message || e)}</p></div></div>`;
/* Line chart (dataviz rules: one y-axis, thin 2px lines, legend for 2+ series, hover tooltip, table alongside).
   series = [{ name, vals:[number|null], color, dash }]; labels = x labels; fmt = value -> text. */
function lineChart(el, title, labels, series, fmt){
  const W = 640, H = 220, L = 46, R = 10, T = 10, B = 26, all = series.flatMap(s => s.vals).filter(x => x != null && !isNaN(x));
  if(!all.length){ el.innerHTML = `<div class="anch"><h4>${esc(title)}</h4><p class="muted">No data.</p></div>`; return; }
  const max = Math.max(...all) * 1.08 || 1, n = labels.length, X = i => L + (n < 2 ? 0 : i * (W - L - R) / (n - 1)), Y = v => T + (H - T - B) * (1 - v / max);
  const ticks = [0, .25, .5, .75, 1].map(f => f * max), every = Math.max(1, Math.ceil(n / 8));
  const path = s => { let d = "", on = false; s.vals.forEach((v, i) => { if(v == null || isNaN(v)){ on = false; return; } d += (on ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); on = true; }); return d; };
  el.innerHTML = `<div class="anch"><h4>${esc(title)}</h4><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
    ${ticks.map(t => `<line class="gr" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`).join("")}
    ${labels.map((l, i) => i % every ? "" : `<text class="ax" x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`).join("")}
    ${series.map(s => `<path d="${path(s)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="5 4"' : ""}/>`).join("")}
    <line class="cx" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-width="1" style="display:none"/>
    ${series.map((s, k) => `<circle class="dot" data-k="${k}" r="4" fill="${s.color}" stroke="var(--card)" stroke-width="2" style="display:none"/>`).join("")}
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="hit"/></svg>
    ${series.length > 1 ? `<div class="anleg">${series.map(s => `<span><i style="border-color:${s.color};${s.dash ? "border-top-style:dashed" : ""}"></i>${esc(s.name)}</span>`).join("")}</div>` : ""}
    <div class="antip"></div></div>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".antip"), cx = el.querySelector(".cx"), box = el.querySelector(".anch");
  const hide = () => { tip.style.display = cx.style.display = "none"; el.querySelectorAll(".dot").forEach(d => d.style.display = "none"); };
  const show = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, i = Math.max(0, Math.min(n - 1, Math.round((x - L) / ((W - L - R) / Math.max(1, n - 1)))));
    cx.setAttribute("x1", X(i)); cx.setAttribute("x2", X(i)); cx.style.display = "";
    el.querySelectorAll(".dot").forEach(d => { const v = series[+d.dataset.k].vals[i]; if(v == null || isNaN(v)){ d.style.display = "none"; return; } d.setAttribute("cx", X(i)); d.setAttribute("cy", Y(v)); d.style.display = ""; });
    tip.innerHTML = `<b>${esc(labels[i])}</b><br>` + series.map(s => `${esc(s.name)}: ${s.vals[i] == null || isNaN(s.vals[i]) ? "—" : esc(fmt(s.vals[i]))}`).join("<br>");
    tip.style.display = "block"; const bx = box.getBoundingClientRect(), px = e.clientX - bx.left;
    tip.style.left = Math.max(4, Math.min(px + 12, bx.width - tip.offsetWidth - 6)) + "px"; tip.style.top = (e.clientY - bx.top + 12) + "px"; };
  svg.addEventListener("pointermove", show); svg.addEventListener("pointerleave", hide);
}
const C1 = "var(--forest-2,#2f5d3a)", C2 = "var(--muted,#7a857d)", C3 = "var(--blue,#2b5c8a)";
const noAccess = v => v.innerHTML = `<div class="page"><div class="card"><h2>No access</h2><p class="muted">This report isn't on your teams. Ask Brandon or Kim.</p></div></div>`;
const homeLink = (id, label) => `<a class="anlink" href="#/an/home/${encodeURIComponent(id)}">${esc(label || id)}</a>`;
// sortable table: cols = [{ k, t, f(row)->html, v(row)->sort value, l (left) }]
function table(el, cols, rows, sortK, cls, asc){   // asc = start ascending (dates, ranks)
  let k = sortK, dir = asc ? 1 : -1;
  const draw = () => { const c = cols.find(x => x.k === k), val = c && (c.v || (r => r[c.k]));   // no sort key = keep the rows' order
    const L = !c ? rows.slice() : rows.slice().sort((a, b) => { const x = val(a), y = val(b); return (x == null) - (y == null) || (x < y ? -1 : x > y ? 1 : 0) * dir; });
    el.innerHTML = `<div class="anwrap"><table class="antbl"><thead><tr>${cols.map(c => `<th class="${c.l ? "l" : ""}" data-k="${c.k}">${esc(c.t)}${c.k === k ? (dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>
      <tbody>${L.map(r => `<tr class="${cls ? cls(r) : ""}">${cols.map(c => `<td class="${c.l ? "l" : ""}">${c.f ? c.f(r) : esc(r[c.k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    el.querySelectorAll("th").forEach(th => th.onclick = () => { dir = th.dataset.k === k ? -dir : -1; k = th.dataset.k; draw(); }); };
  draw();
}

/* Market trends: Key Data market KPIs, Airbnb + VRBO combined (weighted by listings), each month vs. the same month a year before. */
let MK = null;
async function market(v){
  v.innerHTML = `<div class="page wide">${back}<h2>Market trends by neighborhood</h2><p class="muted">Loading…</p></div>`;
  if(!MK){ const r = await sb.rpc("analytics_market_trend"); if(r.error) return fail(v, r.error); MK = r.data || []; }
  if(!MK.length){ v.innerHTML = `<div class="page"><div class="card"><h2>No access</h2><p class="muted">This report isn't on your teams. Ask Brandon or Kim.</p></div></div>`; return; }
  const markets = [...new Set(MK.map(x => x.market))].sort(), cap = MK.reduce((a, x) => x.captured_at > a ? x.captured_at : a, "");
  const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
  v.innerHTML = `<div class="page wide">${back}<h2>Market trends by neighborhood</h2>
    <p class="muted">How each Park City-area neighborhood is renting on Airbnb and VRBO, month by month, against the same month a year earlier. Months from now on (in italics) show only what is booked so far, so they aren't compared with last year's final numbers. Click a column to sort.</p>
    <div class="anbar"><select id="anm">${markets.map(m => `<option${m === "Park City Area" ? " selected" : ""}>${esc(m)}</option>`).join("")}</select>
      <select id="ano"><option value="">Airbnb + VRBO</option><option value="airbnb">Airbnb</option><option value="vrbo">VRBO</option></select></div>
    <div class="anch2"><div id="anc1"></div><div id="anc2"></div></div><div id="anmt" style="margin-top:12px"></div>
    <h3 style="margin:18px 0 6px">All neighborhoods · last 12 full months</h3><div id="anall"></div>
    <p class="ansrc">Source: Key Data market KPIs (via the Rates pull), latest capture ${esc(dt(cap))}. Occupancy = Key Data guest occupancy; ADR = average nightly rate; RevPAR = revenue per available night.</p></div>`;
  // combine channels / months from Key Data's raw totals, the way Key Data computes them (occ = guest ÷ property nights, ADR = rent ÷ guest nights)
  const roll = list => { const s = f => list.reduce((a, x) => a + (+x[f] || 0), 0), gn = s("guest_nights"), pn = s("property_nights"), rev = s("revenue"), ci = s("checkins");
    if(!pn) return null;
    const byCi = f => ci ? list.reduce((a, x) => a + (+x[f] || 0) * (+x.checkins || 0), 0) / ci : null;
    return { listings:s("homes"), occ:gn / pn, adr:gn ? rev / gn : null, revpar:rev / pn, win:byCi("booking_window"), stay:byCi("stay_length") }; };
  const pick = (m, o) => MK.filter(x => x.market === m && (!o || x.ota === o));
  const byMonth = list => { const g = {}; list.forEach(x => (g[x.month] = g[x.month] || []).push(x)); const out = {}; Object.keys(g).forEach(k => out[k] = roll(g[k])); return out; };
  const draw = () => { const o = $("#ano").value, M = byMonth(pick($("#anm").value, o));
    const ly = s => { const d = new Date(s + "T12:00"); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 7) + "-01"; };
    const rows = Object.keys(M).filter(k => M[ly(k)]).map(k => ({ month:k, fut:k >= thisMonth, ...M[k], p:M[ly(k)] }));
    // future months are only "booked so far"; Key Data has no same-date-last-year pace, so no change vs. last year's final month
    const nc = `<span class="muted" title="Still booking — not comparable with last year's final numbers">—</span>`;
    table($("#anmt"), [
      { k:"month", t:"Month", l:1, f:r => esc(mon(r.month)) + (r.fut ? " · booked so far" : "") },
      { k:"occ", t:"Occupancy", f:r => pct(r.occ) }, { k:"occ_ly", t:"Last year (final)", v:r => r.p.occ, f:r => pct(r.p.occ) }, { k:"occ_d", t:"Change", v:r => r.fut ? null : r.occ - r.p.occ, f:r => r.fut ? nc : pts(r.occ, r.p.occ) },
      { k:"adr", t:"ADR", f:r => usd(r.adr) }, { k:"adr_ly", t:"Last year (final)", v:r => r.p.adr, f:r => usd(r.p.adr) }, { k:"adr_d", t:"Change", v:r => r.fut ? null : r.adr / r.p.adr, f:r => r.fut ? nc : chg(r.adr, r.p.adr) },
      { k:"revpar", t:"RevPAR", f:r => usd(r.revpar) }, { k:"rp_d", t:"vs. last year", v:r => r.fut ? null : r.revpar / r.p.revpar, f:r => r.fut ? nc : chg(r.revpar, r.p.revpar) },
      { k:"win", t:"Books ahead (days)", f:r => r.win == null ? "—" : Math.round(r.win) }, { k:"stay", t:"Avg stay (nights)", f:r => r.stay == null ? "—" : r.stay.toFixed(1) },
      { k:"listings", t:"Listings", f:r => Math.round(r.listings).toLocaleString() }
    ], rows, "month", r => r.fut ? "fut" : "");
    const cr = rows.slice().sort((a, b) => a.month < b.month ? -1 : 1), lb = cr.map(r => new Date(r.month + "T12:00").toLocaleDateString(undefined, { month:"short", year:"2-digit" }));
    lineChart($("#anc1"), "Occupancy", lb, [{ name:"This year", vals:cr.map(r => r.occ), color:C1 }, { name:"Same month last year (final)", vals:cr.map(r => r.p.occ), color:C2, dash:1 }], v => (v * 100).toFixed(0) + "%");
    lineChart($("#anc2"), "RevPAR (revenue per available night)", lb, [{ name:"This year", vals:cr.map(r => r.revpar), color:C1 }, { name:"Same month last year (final)", vals:cr.map(r => r.p.revpar), color:C2, dash:1 }], v => "$" + Math.round(v));
    // all markets, last 12 full months
    const end = thisMonth, start = (() => { const d = new Date(end + "T12:00"); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); })();
    const all = markets.map(m => { const L = pick(m, o).filter(x => x.month >= start && x.month < end); const r = roll(L); if(!r) return null;
      const months = new Set(L.map(x => x.month)).size; return { market:m, ...r, listings:r.listings / (months || 1) }; }).filter(Boolean);
    table($("#anall"), [
      { k:"market", t:"Neighborhood", l:1 }, { k:"occ", t:"Occupancy", f:r => pct(r.occ) }, { k:"adr", t:"ADR", f:r => usd(r.adr) },
      { k:"revpar", t:"RevPAR", f:r => usd(r.revpar) }, { k:"win", t:"Books ahead (days)", f:r => r.win == null ? "—" : Math.round(r.win) },
      { k:"stay", t:"Avg stay (nights)", f:r => r.stay == null ? "—" : r.stay.toFixed(1) }, { k:"listings", t:"Avg listings", f:r => Math.round(r.listings).toLocaleString() }
    ], all, "revpar"); };
  $("#anm").onchange = $("#ano").onchange = draw; draw();
}

/* Moose homes vs. their comps (like for like, 2026-10-28): Key Data's numbers for our own Airbnb listing vs. Key Data's numbers for the
   Primary comps in the home's rate set, same months, same method. Track actuals sit alongside for real money.
   Why: Key Data estimates run high (our homes 2025-10..2026-09: Key Data ADR ~$528 avg vs. Track $279), and its "guest"
   occupancy appears to include some owner/blocked nights, so Track vs. Key Data is not a fair comparison. */
async function comps(v){
  v.innerHTML = `<div class="page wide">${back}<h2>Moose homes vs. their comps</h2><p class="muted">Loading…</p></div>`;
  const r = await sb.rpc("analytics_vs_comps"); if(r.error) return fail(v, r.error);
  const H = r.data || [];
  if(!H.length){ v.innerHTML = `<div class="page"><div class="card"><h2>No access</h2><p class="muted">This report isn't on your teams. Ask Brandon or Kim.</p></div></div>`; return; }
  const W = H[0], areas = [...new Set(H.map(x => x.area).filter(Boolean))].sort();
  H.forEach(x => { ["our_occ","our_adr","comp_occ","comp_adr","our_rent","kd_occ","kd_adr"].forEach(f => x[f] = x[f] == null ? null : +x[f]);
    x.kd = x.kd_months > 0 && x.kd_occ != null && x.comp_occ != null;
    x.kd_rp = x.kd ? x.kd_occ * (x.kd_adr || 0) : null; x.comp_rp = x.comp_occ != null ? x.comp_occ * (x.comp_adr || 0) : null; });
  const KD = H.filter(x => x.kd), avg = (k, L) => { const z = L.filter(x => x[k] != null); return z.length ? z.reduce((s, x) => s + x[k], 0) / z.length : null; };
  v.innerHTML = `<div class="page wide">${back}<h2>Moose homes vs. their comps</h2>
    <p class="muted">Each of our homes against the comps in its rate set, from ${esc(dt(W.win_from + "T12:00"))} (or the month of the home's first Track stay) to ${esc(dt(W.win_to + "T12:00"))}. Click a column to sort.</p>
    <div class="card" style="border-color:var(--blue,#2b5c8a);background:var(--blue-soft,#eef4fa)"><b>Like for like:</b> both sides are Key Data's numbers, measured the same way for the same months — our own Airbnb listing vs. the comps' listings.
      Key Data's nightly rates run higher than what we actually collect (these homes: Key Data ${usd(avg("kd_adr", KD))} vs. Track ${usd(avg("our_adr", KD))} a night, average of homes), so use the <b>Track</b> columns for real money.
      ${H.length - KD.length} home${H.length - KD.length === 1 ? "" : "s"} without a Key Data listing show “—”.</div>
    <div class="ankpi" id="ank" style="margin-top:12px"></div>
    <div class="anbar"><input id="anq" type="search" placeholder="Search homes or rate sets"><select id="ana"><option value="">All areas</option>${areas.map(a => `<option>${esc(a)}</option>`).join("")}</select>
      <select id="anf"><option value="">All homes</option><option value="ahead">Ahead of comps (RevPAR)</option><option value="behind">Behind comps (RevPAR)</option></select></div>
    <div id="anct"></div>
    <p class="ansrc">Sources: <b>Key Data</b> listing KPIs (monthly, captured ${esc(dt(W.kd_captured))}) for our Airbnb listing and for the Primary comps in each rate set: occupancy = guest nights ÷ all nights, ADR = rent ÷ guest nights, RevPAR = occupancy × ADR (Key Data's method).
      <b>Track</b> stays (guest stays, not cancelled; nights and rent split by the nights inside the window), synced ${esc(dt(H.reduce((a, x) => x.track_synced > a ? x.track_synced : a, "")))}; Track occupancy = guest nights ÷ every night since the home's start.
      Averages in the boxes are averages of homes.</p></div>`;
  const draw = () => { const q = $("#anq").value.toLowerCase(), a = $("#ana").value, f = $("#anf").value;
    const L = H.filter(x => (!q || ((x.home || "") + " " + (x.set_name || "")).toLowerCase().includes(q)) && (!a || x.area === a)
      && (!f || (x.kd && (f === "ahead" ? x.kd_rp >= x.comp_rp : x.kd_rp < x.comp_rp))));
    const K = L.filter(x => x.kd), n = (t) => K.filter(t).length;
    $("#ank").innerHTML = `<div class="card"><small>Homes compared</small><b>${K.length}</b><small>of ${L.length} shown</small></div>
      <div class="card"><small>Occupancy · ours vs. comps</small><b>${pct(avg("kd_occ", K))}</b><small>comps ${pct(avg("comp_occ", K))} · ${n(x => x.kd_occ >= x.comp_occ)} homes ahead</small></div>
      <div class="card"><small>Nightly rate · ours vs. comps</small><b>${usd(avg("kd_adr", K))}</b><small>comps ${usd(avg("comp_adr", K))} · ${n(x => x.kd_adr >= x.comp_adr)} homes ahead</small></div>
      <div class="card"><small>RevPAR · ours vs. comps</small><b>${usd(avg("kd_rp", K))}</b><small>comps ${usd(avg("comp_rp", K))} · ${n(x => x.kd_rp >= x.comp_rp)} homes ahead</small></div>
      <div class="card"><small>Guest rent collected (Track)</small><b>${usd(L.reduce((s, x) => s + (x.our_rent || 0), 0))}</b><small>${L.reduce((s, x) => s + (x.our_nights || 0), 0).toLocaleString()} guest nights</small></div>`;
    table($("#anct"), [
      { k:"home", t:"Home", l:1, f:r => homeLink(r.home_id, r.home) }, { k:"set_name", t:"Rate set", l:1 }, { k:"area", t:"Area", l:1 }, { k:"bedrooms", t:"Beds" },
      { k:"kd_occ", t:"Our occ.", f:r => r.kd ? pct(r.kd_occ) : "—" }, { k:"comp_occ", t:"Comps occ.", f:r => pct(r.comp_occ) },
      { k:"occ_d", t:"Gap", v:r => r.kd ? r.kd_occ - r.comp_occ : null, f:r => r.kd ? pts(r.kd_occ, r.comp_occ) : "—" },
      { k:"kd_adr", t:"Our ADR", f:r => r.kd ? usd(r.kd_adr) : "—" }, { k:"comp_adr", t:"Comps ADR", f:r => usd(r.comp_adr) },
      { k:"adr_d", t:"Gap", v:r => r.kd && r.comp_adr ? r.kd_adr / r.comp_adr : null, f:r => r.kd ? chg(r.kd_adr, r.comp_adr) : "—" },
      { k:"kd_rp", t:"Our RevPAR", f:r => r.kd ? usd(r.kd_rp) : "—" }, { k:"comp_rp", t:"Comps RevPAR", f:r => usd(r.comp_rp) },
      { k:"rp_d", t:"Gap", v:r => r.kd && r.comp_rp ? r.kd_rp / r.comp_rp : null, f:r => r.kd ? chg(r.kd_rp, r.comp_rp) : "—" },
      { k:"our_occ", t:"Track occ.", f:r => pct(r.our_occ) }, { k:"our_adr", t:"Track ADR", f:r => usd(r.our_adr) },
      { k:"our_rent", t:"Track guest rent", f:r => usd(r.our_rent) }, { k:"comp_count", t:"Comps" }
    ], L, "rp_d"); };
  $("#anq").oninput = $("#ana").onchange = $("#anf").onchange = draw; draw();
}

/* ---------- Round 2 (Brandon 2026-10-28) ---------- */
const dShort = s => new Date(s + "T12:00").toLocaleDateString(undefined, { month:"short", day:"numeric" });
const dDay = s => new Date(s + "T12:00").toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
const mDays = m => { const d = new Date(m + "T12:00"); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
const lastYear = m => { const d = new Date(m + "T12:00"); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };
const ORIG = { DFW:"Dallas / Houston / Austin", SYD:"Sydney / Melbourne / Brisbane", JFK:"New York area", LAX:"California", DEN:"Denver", SEA:"Seattle", ATL:"Atlanta", BOS:"Boston", PHX:"Phoenix / Tucson", ORD:"Chicago" };
const origin = o => ORIG[(o || "").split(",")[0]] || o;
const weekOf = s => { const d = new Date(s + "T12:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };   // Monday
const num = (x, ks) => ks.forEach(f => x[f] = x[f] == null ? null : +x[f]);

/* Demand signals: SerpApi (Google Trends, Google ranking, Google Hotels, Google Flights, Google local events), Ticketmaster, Track. */
async function demand(v){
  v.innerHTML = `<div class="page wide">${back}<h2>Demand signals</h2><p class="muted">Loading…</p></div>`;
  const r = await sb.rpc("analytics_demand"); if(r.error) return fail(v, r.error);
  const D = r.data; if(!D) return noAccess(v);
  const terms = [...new Set(D.trends.map(x => x.s.split(" | ")[0]))].sort(), regions = [...new Set(D.trends.map(x => x.s.split(" | ")[1]))].sort();
  const areas = [...new Set(D.hotels.map(x => x.area))].filter(a => a === "Park City" || a.startsWith("Heber"));
  v.innerHTML = `<div class="page wide">${back}<h2>Demand signals</h2>
    <p class="muted">What's pulling guests toward Park City over the next four months, next to how many of our homes are still open.</p>
    <h3 class="anh3">Search interest (Google Trends)</h3>
    <div class="anbar"><select id="dtt">${terms.map(t => `<option${t === "Park City lodging" ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
      <select id="dtr">${regions.map(t => `<option${t === "United States" ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
    <div id="dtc"></div>
    <p class="ansrc">Source: Google Trends via SerpApi (weekly; 0–100 is Google's relative scale for that search and place, not a count), pulled ${esc(dt(D.trends_at))}.</p>
    <h3 class="anh3">Next 120 days, week by week</h3>
    <div class="anch2"><div id="dho"></div><div id="dhh"></div></div>
    <div id="dwk" style="margin-top:12px"></div>
    <p class="ansrc">Sources: our homes = Track stays (synced ${esc(dt(D.track_at))}); hotels = Google Hotels via SerpApi, median nightly price before tax of the hotels Google lists for that check-in (latest pull per date); events = Ticketmaster within 25 miles (pulled ${esc(dt(D.events_at))}); flights = cheapest round trip into Salt Lake (SLC), Google Flights via SerpApi.</p>
    <h3 class="anh3">Events</h3>
    <div class="anbar"><input id="deq" type="search" placeholder="Search events, venues, cities"><select id="dem"><option value="999">Any distance</option><option value="5">Within 5 miles</option><option value="20">Within 20 miles</option><option value="25" selected>Within 25 miles</option></select></div>
    <div id="dev"></div>
    ${D.local.length ? `<h4 style="margin:14px 0 6px">Local events Google lists (Park City &amp; Heber)</h4><div id="dloc"></div>` : ""}
    <p class="ansrc">Sources: Ticketmaster (next 120 days; first 300 shown), Google local events via SerpApi.</p>
    <h3 class="anh3">Flights into Salt Lake</h3><div id="dfl"></div>
    <p class="ansrc">Source: Google Flights via SerpApi — cheapest round trip for a 3-night trip leaving on that date. Green = Google calls the price low, red = high; hover for airline and the typical range.</p>
    <h3 class="anh3">Our Google ranking</h3><div id="drk"></div>
    <p class="ansrc">Source: Google search results via SerpApi (page 1, organic results), latest check per search.</p></div>`;
  // search interest: last 52 weeks vs. the 52 before
  const drawT = () => { const k = $("#dtt").value + " | " + $("#dtr").value, P = D.trends.filter(x => x.s === k).sort((a, b) => a.d < b.d ? -1 : 1);
    const cur = P.slice(-52), prev = P.slice(-104, -52);
    lineChart($("#dtc"), `${$("#dtt").value} — ${$("#dtr").value}`, cur.map(x => dShort(x.d)), [{ name:"Last 52 weeks", vals:cur.map(x => +x.v), color:C1 }, { name:"Year before", vals:prev.map(x => +x.v), color:C2, dash:1 }], v => Math.round(v)); };
  $("#dtt").onchange = $("#dtr").onchange = drawT; drawT();
  // daily charts
  const O = D.open, days = O.map(x => x.d);
  lineChart($("#dho"), "Our homes each night (Track)", days.map(dShort), [{ name:"Open", vals:O.map(x => x.homes - x.guest - x.owner), color:C1 }, { name:"Guest-booked", vals:O.map(x => x.guest), color:C3 }], v => Math.round(v) + " homes");
  const hp = a => { const m = {}; D.hotels.filter(x => x.area === a).forEach(x => m[x.d] = +x.med); return days.map(d => m[d] ?? null); };
  lineChart($("#dhh"), "Hotel median price per night (before tax)", days.map(dShort), areas.map((a, i) => ({ name:a, vals:hp(a), color:[C1, C3][i] || C2 })), v => "$" + Math.round(v));
  // weekly table
  const W = {}, wk = d => (W[weekOf(d)] = W[weekOf(d)] || { w:weekOf(d), n:0, open:0, guest:0, homes:0, hot:{}, ev:[], fl:[] });
  O.forEach(x => { const w = wk(x.d); w.n++; w.open += x.homes - x.guest - x.owner; w.guest += x.guest; w.homes += x.homes; });
  D.hotels.forEach(x => { const w = W[weekOf(x.d)]; if(w) (w.hot[x.area] = w.hot[x.area] || []).push(+x.med); });
  D.events.forEach(x => { const w = W[weekOf(x.d)]; if(w && (x.mi == null || x.mi <= 25)) w.ev.push(x); });
  D.flights.forEach(x => { const w = W[weekOf(x.out)]; if(w) w.fl.push(x); });
  const avg = a => a && a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  table($("#dwk"), [
    { k:"w", t:"Week of", l:1, f:r => esc(dDay(r.w)) },
    { k:"open", t:"Our homes open (avg/night)", v:r => r.open / r.n, f:r => Math.round(r.open / r.n) + " of " + Math.round(r.homes / r.n) },
    { k:"guest", t:"Guest-booked", v:r => r.guest / r.homes, f:r => pct(r.guest / r.homes) },
    ...areas.map(a => ({ k:"h_" + a, t:"Hotels · " + a, v:r => avg(r.hot[a]), f:r => usd(avg(r.hot[a])) })),
    { k:"ev", t:"Events ≤25 mi", v:r => r.ev.length, f:r => r.ev.length ? `${r.ev.length} <span class="muted">· ${esc(r.ev.slice(0, 2).map(e => e.t).join(", ").slice(0, 70))}</span>` : "0" },
    { k:"fl", t:"Cheapest flight to SLC", v:r => r.fl.length ? Math.min(...r.fl.map(f => +f.p)) : null,
      f:r => { if(!r.fl.length) return "—"; const f = r.fl.reduce((a, b) => +b.p < +a.p ? b : a); return `${usd(f.p)} <span class="muted">from ${esc(origin(f.o))}</span>`; } }
  ], Object.values(W).filter(w => w.n), "w", null, 1);
  // events list
  const drawE = () => { const q = $("#deq").value.toLowerCase(), mi = +$("#dem").value;
    const L = D.events.filter(x => (x.mi == null || x.mi <= mi) && (!q || [x.t, x.venue, x.city, x.cat].join(" ").toLowerCase().includes(q)));
    table($("#dev"), [
      { k:"d", t:"Date", l:1, f:r => esc(dDay(r.d)) }, { k:"t", t:"Event", l:1, f:r => r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.t)}</a>` : esc(r.t) },
      { k:"cat", t:"Kind", l:1 }, { k:"venue", t:"Venue", l:1 }, { k:"city", t:"City", l:1 }, { k:"mi", t:"Miles away" }
    ], L.slice(0, 300), "d", null, 1); };
  $("#deq").oninput = $("#dem").onchange = drawE; drawE();
  if(D.local.length) table($("#dloc"), [{ k:"when", t:"When", l:1 }, { k:"t", t:"Event", l:1, f:r => r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.t)}</a>` : esc(r.t) }, { k:"venue", t:"Venue", l:1 }, { k:"s", t:"Search", l:1 }], D.local, "s", null, 1);
  // flights: origin x outbound date
  const outs = [...new Set(D.flights.map(x => x.out))].sort(), origs = [...new Set(D.flights.map(x => x.o))].sort((a, b) => origin(a).localeCompare(origin(b)));
  const lvl = l => l === "low" ? "anup" : l === "high" ? "andn" : "";
  $("#dfl").innerHTML = `<div class="anwrap"><table class="antbl"><thead><tr><th>From</th>${outs.map(o => `<th>${esc(dShort(o))}</th>`).join("")}</tr></thead><tbody>
    ${origs.map(o => `<tr><td>${esc(origin(o))}</td>${outs.map(d => { const f = D.flights.find(x => x.o === o && x.out === d);
      return `<td title="${f ? esc(`${f.air || ""}${f.stops != null ? " · " + f.stops + " stop(s)" : ""} · typical ${usd(f.lo)}–${usd(f.hi)} · pulled ${dt(f.at)}`) : ""}">${f ? `<span class="${lvl(f.lvl)}">${usd(f.p)}</span>` : "—"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`;
  // Google ranking
  table($("#drk"), [
    { k:"s", t:"Search", l:1 }, { k:"pos", t:"Our spot", v:r => r.pos == null ? 99 : +r.pos, f:r => r.pos == null ? `<span class="andn">not on page 1</span>` : `<span class="anup">#${esc(r.pos)}</span>` },
    { k:"top", t:"Top 3 on Google", l:1, v:r => (r.top10 || [])[0], f:r => esc((r.top10 || []).slice(0, 3).join(", ")) },
    { k:"ads", t:"Ads", v:r => (r.ads || []).length, f:r => (r.ads || []).length ? esc(r.ads.map(a => a.site).join(", ")) : "—" },
    { k:"at", t:"Checked", f:r => esc(dt(r.at)) }
  ], D.ranks, "pos", null, 1);
}

/* Pace: Track guest nights on the books now vs. on this date last year, this month + next 5; Key Data market alongside. */
async function pace(v){
  v.innerHTML = `<div class="page wide">${back}<h2>Pace — on the books vs. last year</h2><p class="muted">Loading…</p></div>`;
  const r = await sb.rpc("analytics_pace"); if(r.error) return fail(v, r.error);
  const P = r.data || []; if(!P.length) return noAccess(v);
  P.forEach(x => { num(x, ["rent","rent_ly","mkt_occ","mkt_occ_ly"]); x.rent = x.rent || 0; x.rent_ly = x.rent_ly || 0;
    x.occ = x.homes ? x.nights / (x.homes * mDays(x.month)) : null; x.occ_ly = x.homes_ly ? x.nights_ly / (x.homes_ly * mDays(lastYear(x.month))) : null; });
  const nx = P.slice(1, 4), s = (k, L) => L.reduce((a, x) => a + (+x[k] || 0), 0);
  v.innerHTML = `<div class="page wide">${back}<h2>Pace — on the books vs. last year</h2>
    <p class="muted">Guest nights and rent already booked in our homes for each month, against what was booked for the same month on this date last year. The current month includes nights already stayed.</p>
    <div class="ankpi"><div class="card"><small>Next 3 months · guest nights booked</small><b>${s("nights", nx).toLocaleString()}</b><small>last year by this date: ${s("nights_ly", nx).toLocaleString()}</small></div>
      <div class="card"><small>Next 3 months · rent booked</small><b>${usd(s("rent", nx))}</b><small>last year by this date: ${usd(s("rent_ly", nx))}</small></div>
      <div class="card"><small>Homes counted now</small><b>${P[0].homes}</b><small>last year, by month: ${P.map(x => x.homes_ly).join(" · ")}</small></div></div>
    <div class="anch2"><div id="pc1"></div><div id="pc2"></div></div><div id="pct" style="margin-top:12px"></div>
    <p class="ansrc">Sources: <b>Track</b> stays (guest stays; booking date = Track's booked date; synced ${esc(dt(P[0].asof))}). Last year = stays for that month booked by this date last year and not cancelled since, so last year can read a little low. Last year's homes = homes that had their first Track stay by then (Track history in the hub starts Sep 2025). Occupancy on the books = guest nights ÷ (homes × nights in the month).
      Checked 2026-10-28: Track's future bookings match Key Data's calendars for our listings (Jan 2027: 593 booked or blocked nights in Track vs. 628 on Key Data's calendars).
      <b>Market</b> = Key Data "Park City Area", Airbnb + VRBO, booked so far vs. last year's final month (Key Data has no same-date-last-year figure), captured ${esc(dt(P[0].kd_at))}.</p></div>`;
  const lb = P.map(x => mon(x.month));
  lineChart($("#pc1"), "Our occupancy on the books", lb, [{ name:"Now", vals:P.map(x => x.occ), color:C1 }, { name:"Same date last year", vals:P.map(x => x.occ_ly), color:C2, dash:1 }], v => (v * 100).toFixed(0) + "%");
  lineChart($("#pc2"), "Rent on the books", lb, [{ name:"Now", vals:P.map(x => x.rent), color:C1 }, { name:"Same date last year", vals:P.map(x => x.rent_ly), color:C2, dash:1 }], v => "$" + Math.round(v / 1000) + "K");
  table($("#pct"), [
    { k:"month", t:"Month", l:1, f:r => esc(mon(r.month)) },
    { k:"nights", t:"Guest nights now" }, { k:"nights_ly", t:"Last year by now" }, { k:"occ", t:"Occupancy now", f:r => pct(r.occ) }, { k:"occ_ly", t:"Last year by now", f:r => pct(r.occ_ly) },
    { k:"occ_d", t:"Change", v:r => r.occ - r.occ_ly, f:r => pts(r.occ, r.occ_ly) },
    { k:"rent", t:"Rent now", f:r => usd(r.rent) }, { k:"rent_ly", t:"Last year by now", f:r => usd(r.rent_ly) }, { k:"rent_d", t:"Change", v:r => r.rent_ly ? r.rent / r.rent_ly : null, f:r => chg(r.rent, r.rent_ly) },
    { k:"mkt_occ", t:"Market booked so far", f:r => pct(r.mkt_occ) }, { k:"mkt_occ_ly", t:"Market last year (final)", f:r => pct(r.mkt_occ_ly) }
  ], P, "month", null, 1);
}

/* Top performers: like-for-like Key Data RevPAR vs. comps (analytics_vs_comps), plus the most Track rent collected. */
async function top(v){
  v.innerHTML = `<div class="page wide">${back}<h2>Top performers</h2><p class="muted">Loading…</p></div>`;
  const r = await sb.rpc("analytics_vs_comps"); if(r.error) return fail(v, r.error);
  const H = r.data || []; if(!H.length) return noAccess(v);
  H.forEach(x => { num(x, ["kd_occ","kd_adr","comp_occ","comp_adr","our_rent","our_adr"]);
    x.kd = x.kd_months > 0 && x.kd_occ != null && x.comp_occ != null && !!x.comp_adr;
    x.kd_rp = x.kd ? x.kd_occ * (x.kd_adr || 0) : null; x.comp_rp = x.kd ? x.comp_occ * x.comp_adr : null; x.gap = x.kd && x.comp_rp ? x.kd_rp / x.comp_rp - 1 : null; });
  const B = H.filter(x => x.kd && x.gap >= 0), best = B.length ? B.reduce((a, b) => b.gap > a.gap ? b : a) : null, W = H[0];
  v.innerHTML = `<div class="page wide">${back}<h2>Top performers</h2>
    <p class="muted">Our homes earning more per available night than the comps in their rate set, measured the same way on both sides (Key Data), ${esc(dt(W.win_from + "T12:00"))} – ${esc(dt(W.win_to + "T12:00"))}. Click a home for its month-by-month page.</p>
    <div class="ankpi"><div class="card"><small>Homes beating their comps</small><b>${B.length}</b><small>of ${H.filter(x => x.kd).length} compared</small></div>
      <div class="card"><small>Furthest ahead</small><b style="font-size:17px">${best ? esc(best.home) : "—"}</b><small>${best ? "+" + Math.round(best.gap * 100) + "% RevPAR vs. its comps" : ""}</small></div>
      <div class="card"><small>Track guest rent from these homes</small><b>${usd(B.reduce((a, x) => a + (x.our_rent || 0), 0))}</b><small>in the same window</small></div></div>
    <div id="tpt"></div>
    <h3 class="anh3">Most guest rent collected (Track)</h3><div id="tpr"></div>
    <p class="ansrc">Sources: Key Data listing KPIs for our Airbnb listing and the Primary comps in each rate set (captured ${esc(dt(W.kd_captured))}; RevPAR = occupancy × ADR, Key Data's method; Key Data's prices run higher than Track rent on both sides). Track stays for rent (synced ${esc(dt(H.reduce((a, x) => x.track_synced > a ? x.track_synced : a, "")))}).</p></div>`;
  table($("#tpt"), [
    { k:"home", t:"Home", l:1, f:r => homeLink(r.home_id, r.home) }, { k:"set_name", t:"Rate set", l:1 }, { k:"area", t:"Area", l:1 }, { k:"bedrooms", t:"Beds" },
    { k:"gap", t:"RevPAR vs. comps", f:r => `<span class="anup">+${Math.round(r.gap * 100)}%</span>` },
    { k:"kd_rp", t:"Our RevPAR", f:r => usd(r.kd_rp) }, { k:"comp_rp", t:"Comps RevPAR", f:r => usd(r.comp_rp) },
    { k:"kd_occ", t:"Our occ.", f:r => pct(r.kd_occ) }, { k:"comp_occ", t:"Comps occ.", f:r => pct(r.comp_occ) },
    { k:"kd_adr", t:"Our ADR", f:r => usd(r.kd_adr) }, { k:"comp_adr", t:"Comps ADR", f:r => usd(r.comp_adr) },
    { k:"our_rent", t:"Track guest rent", f:r => usd(r.our_rent) }
  ], B, "gap");
  const R = H.filter(x => x.our_rent > 0).sort((a, b) => b.our_rent - a.our_rent).slice(0, 15), mx = R.length ? R[0].our_rent : 1;
  table($("#tpr"), [
    { k:"home", t:"Home", l:1, f:r => homeLink(r.home_id, r.home) }, { k:"area", t:"Area", l:1 },
    { k:"our_rent", t:"Guest rent", f:r => `${usd(r.our_rent)}<span class="anbarc" style="width:${Math.round(r.our_rent / mx * 90)}px"></span>` },
    { k:"our_nights", t:"Guest nights" }, { k:"our_adr", t:"Track ADR", f:r => usd(r.our_adr) }
  ], R, "our_rent");
}

/* One home: Track actuals (past + on the books) and Key Data (our listing vs. comps), month by month. */
async function home(v, id){
  v.innerHTML = `<div class="page wide">${back}<h2>Home</h2><p class="muted">Loading…</p></div>`;
  const r = await sb.rpc("analytics_home", { p_home:id }); if(r.error) return fail(v, r.error);
  const M = r.data || []; if(!M.length) return noAccess(v);
  const h = M[0], now = new Date().toISOString().slice(0, 7) + "-01";
  M.forEach(x => { num(x, ["track_rent","kd_occ","kd_adr","comp_occ","comp_adr"]);
    x.fut = x.month >= now; x.t_occ = x.track_nights / x.days; x.t_adr = x.track_nights ? (x.track_rent || 0) / x.track_nights : null; });
  const past = M.filter(x => !x.fut), fut = M.filter(x => x.fut), sum = (k, L) => L.reduce((a, x) => a + (+x[k] || 0), 0);
  v.innerHTML = `<div class="page wide"><p style="margin:0 0 6px"><a href="#/reports">← All reports</a> · <a href="#/an/comps">Moose homes vs. their comps</a> · <a href="#/an/top">Top performers</a></p>
    <h2>${esc(h.home)}</h2><p class="muted">${esc([h.set_name, h.area, h.bedrooms ? h.bedrooms + " bedrooms" : ""].filter(Boolean).join(" · "))}</p>
    <div class="ankpi"><div class="card"><small>Guest rent, last 12 full months (Track)</small><b>${usd(sum("track_rent", past))}</b><small>${sum("track_nights", past)} guest nights · ${sum("track_owner", past)} owner/blocked</small></div>
      <div class="card"><small>On the books ahead (Track)</small><b>${usd(sum("track_rent", fut))}</b><small>${sum("track_nights", fut)} guest nights, this month + next 5</small></div></div>
    <div class="anch2"><div id="hc1"></div><div id="hc2"></div></div><div id="hct" style="margin-top:12px"></div>
    <p class="ansrc">Sources: <b>Track</b> stays (not cancelled; synced ${esc(dt(h.track_at))}) — occupancy = guest nights ÷ nights in the month. <b>Key Data</b> listing KPIs for this home's Airbnb listing and the Primary comps in its rate set (captured ${esc(dt(h.kd_at))}; Key Data's method; its prices run higher than Track rent). Months from now on show Track bookings so far only.</p></div>`;
  const lb = M.map(x => new Date(x.month + "T12:00").toLocaleDateString(undefined, { month:"short", year:"2-digit" }));
  lineChart($("#hc1"), "Occupancy", lb, [{ name:"This home (Track)", vals:M.map(x => x.t_occ), color:C1 }, { name:"This home (Key Data)", vals:M.map(x => x.kd_occ), color:C3 }, { name:"Comps (Key Data)", vals:M.map(x => x.comp_occ), color:C2, dash:1 }], v => (v * 100).toFixed(0) + "%");
  lineChart($("#hc2"), "Nightly rate (ADR)", lb, [{ name:"This home (Track)", vals:M.map(x => x.t_adr), color:C1 }, { name:"This home (Key Data)", vals:M.map(x => x.kd_adr), color:C3 }, { name:"Comps (Key Data)", vals:M.map(x => x.comp_adr), color:C2, dash:1 }], v => "$" + Math.round(v));
  table($("#hct"), [
    { k:"month", t:"Month", l:1, f:r => esc(mon(r.month)) + (r.fut ? " · on the books" : "") },
    { k:"track_nights", t:"Guest nights" }, { k:"track_owner", t:"Owner / blocked" }, { k:"t_occ", t:"Track occ.", f:r => pct(r.t_occ) }, { k:"t_adr", t:"Track ADR", f:r => usd(r.t_adr) }, { k:"track_rent", t:"Track rent", f:r => usd(r.track_rent) },
    { k:"kd_occ", t:"Key Data occ.", f:r => pct(r.kd_occ) }, { k:"comp_occ", t:"Comps occ.", f:r => pct(r.comp_occ) },
    { k:"kd_adr", t:"Key Data ADR", f:r => usd(r.kd_adr) }, { k:"comp_adr", t:"Comps ADR", f:r => usd(r.comp_adr) }, { k:"comp_n", t:"Comps" }
  ], M, "month", r => r.fut ? "fut" : "", 1);
}

/* Bookings by channel: Track stays by channel and arrival month. */
async function channels(v){
  v.innerHTML = `<div class="page wide">${back}<h2>Bookings by channel</h2><p class="muted">Loading…</p></div>`;
  const r = await sb.rpc("analytics_channels"); if(r.error) return fail(v, r.error);
  const C = r.data || []; if(!C.length) return noAccess(v);
  const now = new Date().toISOString().slice(0, 7) + "-01", by = {};
  C.filter(x => x.month < now).forEach(x => { const b = by[x.channel] = by[x.channel] || { channel:x.channel, kind:x.kind, stays:0, nights:0, rent:0, cancelled:0 };
    b.stays += x.stays; b.nights += x.nights; b.rent += +x.rent; b.cancelled += x.cancelled; });
  const T = Object.values(by), guestRent = T.filter(x => x.kind === "guest").reduce((a, x) => a + x.rent, 0);
  const months = [...new Set(C.map(x => x.month))].sort(), chans = T.filter(x => x.kind === "guest").sort((a, b) => b.rent - a.rent).map(x => x.channel);
  v.innerHTML = `<div class="page wide">${back}<h2>Bookings by channel</h2>
    <p class="muted">Where our stays come from, by Track channel. Totals cover the last 12 full months by arrival month; the month table also shows what's booked ahead.</p>
    <div id="cht"></div><h3 class="anh3">Guest nights by channel and arrival month</h3><div id="chm"></div>
    <p class="ansrc">Source: Track stays (channel as Track records it; stays counted in their arrival month), synced ${esc(dt(C.reduce((a, x) => x.asof > a ? x.asof : a, "")))}. Cancelled = cancelled ÷ (kept + cancelled) stays.</p></div>`;
  table($("#cht"), [
    { k:"channel", t:"Channel", l:1 }, { k:"stays", t:"Stays" }, { k:"nights", t:"Nights" },
    { k:"rent", t:"Guest rent", f:r => r.kind === "guest" ? usd(r.rent) : "—" },
    { k:"share", t:"Share of guest rent", v:r => r.kind === "guest" && guestRent ? r.rent / guestRent : null, f:r => r.kind === "guest" && guestRent ? `${pct(r.rent / guestRent)}<span class="anbarc" style="width:${Math.round(r.rent / guestRent * 120)}px"></span>` : "—" },
    { k:"adr", t:"Rent per night", v:r => r.kind === "guest" && r.nights ? r.rent / r.nights : null, f:r => r.kind === "guest" && r.nights ? usd(r.rent / r.nights) : "—" },
    { k:"canc", t:"Cancelled", v:r => r.cancelled / ((r.stays + r.cancelled) || 1), f:r => `${r.cancelled} <span class="muted">(${pct(r.cancelled / ((r.stays + r.cancelled) || 1))})</span>` }
  ], T, "rent");
  const rows = months.map(m => { const o = { month:m, fut:m >= now }; chans.forEach(c => o[c] = (C.find(x => x.month === m && x.channel === c) || {}).nights || 0); o.total = chans.reduce((a, c) => a + o[c], 0); return o; });
  table($("#chm"), [{ k:"month", t:"Arrival month", l:1, f:r => esc(mon(r.month)) + (r.fut ? " · booked so far" : "") }, ...chans.map(c => ({ k:c, t:c })), { k:"total", t:"All guest nights" }], rows, "month", r => r.fut ? "fut" : "", 1);
}

/* ---------- Worst performers (Brandon 2026-10-28): why a home is behind, what to fix, and a draft for the owner ----------
   Data: analytics_vs_comps() (like-for-like Key Data RevPAR) + analytics_diagnose() (hub_analytics_3.sql). Recommendations are rules
   on that evidence; each one names its source. The owner draft is text to copy — the hub never sends it (rule: show Brandon first). */
let DX = null, VC = null;
async function worstData(){
  if(!VC){ const r = await sb.rpc("analytics_vs_comps"); if(r.error) throw r.error; VC = r.data || []; }
  if(!DX){ const r = await sb.rpc("analytics_diagnose"); if(r.error) throw r.error; DX = {}; (r.data || []).forEach(x => DX[x.id] = x); }
  VC.forEach(x => { num(x, ["kd_occ","kd_adr","comp_occ","comp_adr","our_rent","our_adr"]);
    x.kd = x.kd_months > 0 && x.kd_occ != null && x.comp_occ != null && !!x.comp_adr;
    x.kd_rp = x.kd ? x.kd_occ * (x.kd_adr || 0) : null; x.comp_rp = x.kd ? x.comp_occ * x.comp_adr : null; x.gap = x.kd && x.comp_rp ? x.kd_rp / x.comp_rp - 1 : null; });
  return VC;
}
const RCAT = [["r_overall","Overall"],["r_clean","Cleanliness"],["r_accuracy","Accuracy"],["r_checkin","Check-in"],["r_comm","Communication"],["r_location","Location"],["r_value","Value"]];
const ownerOf = label => { const m = /\(([^)]+)\)\s*$/.exec(label || ""); return m ? m[1] : ""; };
/* What guests wrote (Track reviews, Airbnb + Vrbo; analytics_reviews(), hub_track_reviews.sql). Themes are a keyword count over the
   low-score reviews and private notes of the last 2 years — not AI. [key, name, words, area, owner?, what to do, owner wording] */
const THEMES = [
  ["clean", "Cleaning", /\b(dirty|filthy|not clean|unclean|stain(s|ed)?|hairs|hair (on|in)|dust(y)?|crumbs|grime|mold|mildew|smell(s|ed|y)?|odou?r)\b/i, "Guest experience", false, "Guests mention cleaning problems — do a quality inspection after the next turn and go over what guests flagged with the cleaners."],
  ["hottub", "Hot tub", /\bhot ?tubs?\b|jacuzzi/i, "Guest experience", false, "Guests mention the hot tub — check temperature, water, the cover and when it was last serviced."],
  ["beds", "Beds and pillows", /mattress(es)?|pillows?|uncomfortable bed|beds? (was|were) (hard|old|uncomfortable|saggy)|sofa ?bed|pull[- ]?out/i, "Owner", true, "Guests mention uncomfortable beds or pillows — new mattresses, toppers or pillows.", "beds or pillows"],
  ["linens", "Linens and towels", /\b(sheets|linens?|towels?|blankets?|bedding)\b/i, "Guest experience", false, "Guests mention linens or towels — check stock and condition with housekeeping."],
  ["heat", "Heat / cold", /\b(cold|freezing|heat(er|ing)?|thermostat|furnace|air condition\w*|too hot)\b/i, "Guest experience", false, "Guests mention the temperature — check the heat, thermostat settings and arrival instructions."],
  ["access", "Check-in / access / parking", /door ?code|keypad|lock(ed)? out|\block\b|\bkeys?\b|parking|garage|directions|hard to find/i, "Guest experience", false, "Guests mention check-in, access or parking — check the arrival instructions, codes and parking notes."],
  ["broken", "Things not working", /broken|not working|didn'?t work|did not work|doesn'?t work|leak(s|ing|ed)?|needs? repair/i, "Guest experience", false, "Guests mention things not working — open maintenance tasks for each item and check them at the next inspection."],
  ["wifi", "Wi-Fi / TV", /wi-?fi|internet|\btv\b|television|streaming|remote/i, "Guest experience", false, "Guests mention Wi-Fi or the TV — test the internet speed and TV inputs, and add simple instructions."],
  ["kitchen", "Kitchen supplies", /kitchen|dishes|pots|pans|utensils|coffee|dishwasher|knives/i, "Guest experience", false, "Guests mention the kitchen — restock dishes, pans, coffee supplies and basics."],
  ["noise", "Noise", /\bnois(e|y)\b|\bloud\b|thin walls/i, "Listing", false, "Guests mention noise — set expectations in the listing and check the quiet-hours note."],
  ["dated", "Dated or worn", /\b(dated|outdated|worn|tired|run[- ]?down|shabby|needs? (an? )?updat\w*)\b/i, "Owner", true, "Guests call the home dated or worn — a refresh of furniture, finishes or decor.", "the home feeling dated or worn"],
  ["listing", "Not as pictured", /not as (pictured|described|advertised)|misleading|smaller than|than (the )?(reality|pictured|photos|pictures|advertised)|more polished|(photos|pictures) (were|are) (old|outdated|misleading)/i, "Listing", false, "Guests say the home isn't as pictured — update photos and the description so they match."],
  ["pests", "Pests", /\b(bugs?|ants|mice|mouse|spiders?|flies|cockroach\w*|pests?)\b/i, "Guest experience", false, "Guests mention pests — schedule pest control and check at the next inspection."]];
const RVCAT = { r_clean:"cleanliness", r_accuracy:"accuracy", r_checkin:"checkin", r_comm:"communication", r_location:"location", r_value:"value" };
// a mention counts only when its sentence reads as a complaint ("Lots of good cookware" is praise, not a kitchen problem)
const NEG = /\b(not|no|never|wasn'?t|weren'?t|isn'?t|aren'?t|didn'?t|don'?t|doesn'?t|couldn'?t|could use|could have|should|(needs?|needed) (to be|a|an|new|more|some|repair\w*|replac\w*|clean\w*|updat\w*|fix\w*)|missing|lack\w*|only|issues?|problems?|concerns?|however|but|unfortunately|wish|would have|would be nice|uncomfortable|hard|old|broken|dirty|cold|poor|bad|terrible|disappoint\w*|complain\w*|annoy\w*|stain\w*|smell\w*|leak\w*|filthy|mold|dated|worn)\b/i;
const HARD = new Set(["clean", "broken", "pests", "dated", "listing"]);   // themes whose words are complaints on their own
const sentences = t => String(t || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
// praise that uses negative words ("no issues", "everything we needed", "would stay again") is taken out before the NEG check
const OKP = /\b(no|not any|without|zero) (issues?|problems?|complaints?|concerns?)\b|\b(everything|all|anything)\b[^.!?]{0,40}\b(we|you|i) (could )?(need|needed|want|wanted)\b|\bdid(n'?t| not) disappoint\b|\bnot only\b|\bno doubt\b|\bcan'?t wait\b|\bcould(n'?t| not) (be|have been|ask for) (any )?(better|happier|more)\b|\bwould (definitely |absolutely )?(stay|come|book|recommend|return)\b[^.!?]{0,20}\bagain\b|\bdid(n'?t| not) (need|have) to (buy|bring)\b/gi;
const hitSent = (t, re, k) => sentences(t).find(s => re.test(s) && (HARD.has(k) || NEG.test(s.replace(OKP, " ")))) || "";
function rvThemes(RV){
  const since = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10), out = [];
  const low = r => (r.overall != null && +r.overall <= 4) || Object.values(r.ratings || {}).some(s => s != null && +s <= 3);
  const pool = ((RV && RV.reviews) || []).filter(r => (r.check_in || "") >= since).map(r => ({ r, pub:low(r) ? r.text || "" : "", priv:r.private || "" })).filter(z => z.pub || z.priv);
  THEMES.forEach(([k, name, re, area, owner, text, ownerWord]) => {
    const hits = pool.map(z => ({ ...z, sp:hitSent(z.pub, re, k), sv:hitSent(z.priv, re, k) })).filter(z => z.sp || z.sv); if(!hits.length) return;
    const pub = hits.find(z => z.sp), cut = s => s.length > 170 ? s.slice(0, 167).trim() + "…" : s;
    out.push({ k, name, area, owner, text, ownerWord, n:hits.length, of:pool.length, since, latest:hits[0].r, quote:cut(hits[0].sp || hits[0].sv), pubQuote:pub ? cut(pub.sp) : "" });
  });
  return out.sort((a, b) => b.n - a.n);
}
function recommend(h, x, RV){
  const o = (x && x.ours) || {}, c = (x && x.comps) || {}, R = [], KD = "Key Data listing KPIs (like for like)", KDL = "Key Data listing details (Airbnb)";
  const add = (area, text, evidence, source, owner, ownerText) => R.push({ area, text, evidence, source, owner:!!owner, ownerText:ownerText || text });
  const n = v => v == null ? null : +v, minRule = (x && x.rules || []).find(r => r.min_price), stayRule = (x && x.rules || []).find(r => r.min_stay);
  // Key Data sees no Airbnb bookings at all: the listing (not the price) is the first thing to check
  if(h.kd && !h.kd_occ) add("Listing", "Key Data saw no Airbnb bookings on this home's listing — check the Airbnb listing is live, visible and synced with Track before anything else.",
    `Key Data guest occupancy 0%; Track shows ${h.our_nights || 0} guest nights in the same window${h.our_nights ? " (booked through other channels)" : ""}.`, KD);
  // pricing vs. comps (like for like)
  if(h.kd && h.kd_occ){
    const ap = h.kd_adr / h.comp_adr - 1, op = h.kd_occ - h.comp_occ;
    if(ap >= .10 && op <= -.03) add("Pricing", "Priced above its comps and booking less — test lower rates on open non-holiday nights (through the Rates desk / Beyond).",
      `Nightly rate ${Math.round(ap * 100)}% above comps; occupancy ${(op * 100).toFixed(1)} pts below.`, KD);
    else if(ap <= -.10 && op <= -.03) add("Listing", "Cheaper than its comps and still booking less — price isn't the problem; look at the listing, photos and reviews below.",
      `Nightly rate ${Math.round(-ap * 100)}% below comps; occupancy ${(-op * 100).toFixed(1)} pts below.`, KD);
    else if(op >= 0 && ap <= -.10) add("Pricing", "Books as well as its comps but for less — room to raise rates, starting with peak dates.",
      `Occupancy at or above comps; nightly rate ${Math.round(-ap * 100)}% below.`, KD);
    if(minRule && ap >= .05 && op < 0) add("Owner", `The owner's minimum price (${usd(minRule.min_price)}${minRule.min_price_peak ? ", peak " + usd(minRule.min_price_peak) : ""}) may be keeping the rate above what the market pays — ask about lowering it for slow periods.`,
      minRule.note || "", minRule.source || "owner_rules", true,
      `Your minimum nightly price of ${usd(minRule.min_price)} is above what similar homes are booking at in slower weeks. Would you be open to a lower minimum for those dates?`);
  }
  (x && x.findings || []).forEach(f => add("Pricing", f.suggestion || f.title, f.evidence || f.title, "Rates desk check " + f.run_date + " — " + (f.sources || ""), f.kind === "owner_min_block",
    "Your minimum price is keeping some open nights from booking. Can we talk about adjusting it for slower dates?"));
  // reviews vs. comps
  const TIP = { r_clean:["Guest experience", "Cleanliness scores trail the comps — do a quality inspection after the next turn, deep clean, and check linens, carpets and the hot tub.", false],
    r_accuracy:["Listing", "Guests say the listing doesn't match the home — update the description, amenities and photos so they're accurate.", false],
    r_checkin:["Guest experience", "Check-in scores trail the comps — check door code timing, arrival instructions, parking and directions.", false],
    r_comm:["Guest experience", "Communication scores trail the comps — review response times and the pre-arrival messages.", false],
    r_location:["Listing", "Location scores trail the comps — set expectations in the listing (shuttle, drive times, walkability) so the location doesn't surprise guests.", false],
    r_value:["Owner", "Guests don't feel they got their money's worth — either the rate or the home needs to move (refresh furniture, beds, kitchen, or add an amenity).", true],
    r_overall:["Guest experience", "Overall rating trails the comps — read the recent reviews for the repeat complaint and fix that first.", false] };
  if(o.r_count != null && o.r_count < 3 && o.r_count > 0) add("Guest experience", `Only ${o.r_count} Airbnb review${o.r_count === 1 ? "" : "s"} — too few to judge the review categories yet; getting more reviews comes first.`, `${o.r_count} reviews vs. comps median ${c.r_count == null ? "—" : Math.round(c.r_count)}.`, KDL);
  if((o.r_count || 0) >= 3) RCAT.forEach(([k]) => { const a = n(o[k]), b = n(c[k]); if(a != null && b != null && a < b - .15) { const t = TIP[k]; add(t[0], t[1], `${a.toFixed(2)} vs. comps median ${b.toFixed(2)} (Airbnb ${RCAT.find(z => z[0] === k)[1].toLowerCase()}).`, KDL, t[2],
    k === "r_value" ? `Guests rate the value of the stay below similar homes (${a.toFixed(2)} vs. ${b.toFixed(2)} on Airbnb). Some updates — furniture, beds, kitchen, or a new amenity — would help us charge what the area supports.` : ""); } });
  if(o.r_count != null && o.r_count >= 3 && c.r_count != null && o.r_count < Math.min(15, c.r_count * .5)) add("Guest experience", "Few reviews — ask happy guests for a review after checkout; more reviews lift search placement.", `${o.r_count} reviews vs. comps median ${Math.round(c.r_count)}.`, KDL);
  // listing
  if(o.photos != null && c.photos && o.photos < c.photos * .75) add("Owner", "Fewer photos than the comps — schedule new professional photos (every room, the views, amenities, the neighborhood).", `${o.photos} photos vs. comps median ${Math.round(c.photos)}.`, KDL, true,
    `Your listing has ${o.photos} photos while similar homes have about ${Math.round(c.photos)}. We'd like to schedule new professional photos.`);
  const ai = x && x.ai; if(ai && ai.overall != null && +ai.overall < 3.3) add("Owner", "The interior scores low against the comps (photo estimate) — a refresh or light staging would help it compete.", `Photo score ${(+ai.overall).toFixed(1)} of 5 — a Claude estimate from the listing photos, not a guest rating.`, "home_ai (Claude photo score, ESTIMATE) " + (ai.scored || "").slice(0, 10), true,
    "Next to similar homes nearby, the interior looks a step behind in the listing photos. A light refresh or some staging would help it compete.");
  if(o.min_stay != null && c.min_stay != null && o.min_stay > c.min_stay) add(stayRule ? "Owner" : "Pricing", `Longer minimum stay than the comps — try ${Math.round(c.min_stay)} night${c.min_stay > 1 ? "s" : ""} outside holidays${stayRule ? " (the owner set this — ask them)" : ""}.`, `${o.min_stay}-night minimum vs. comps median ${Math.round(c.min_stay)}.`, stayRule ? (stayRule.source || "owner_rules") : KDL, !!stayRule,
    `Your ${o.min_stay}-night minimum is longer than similar homes (most ask ${Math.round(c.min_stay)}). Would you consider ${Math.round(c.min_stay)} night${c.min_stay > 1 ? "s" : ""} outside holidays?`);
  if(o.instant === false && c.instant >= .5) add("Listing", "Instant Book is off while most comps have it on — turn it on (Airbnb ranks Instant Book listings higher).", `${Math.round(c.instant * 100)}% of comps use Instant Book.`, KDL);
  if(o.hot_tub === "none" && c.hot_tub >= .5) add("Owner", "Most comps offer a hot tub and this home doesn't — a hot tub is one of the most-searched amenities in Park City; worth raising with the owner.", `${Math.round(c.hot_tub * 100)}% of comps list a hot tub.`, KDL, true,
    `About ${Math.round(c.hot_tub * 100)}% of similar homes nearby offer a hot tub, and it's one of the most-searched amenities in Park City. Is adding one something you'd consider?`);
  if(h.owner_nights > 60) add("Owner", "Heavy owner use — owner and blocked nights cut into rentable peak dates; ask whether some can move to slower weeks.", `${h.owner_nights} owner/blocked nights in the window (Track).`, "Track stays", true,
    `The home was blocked for owner use or holds on ${h.owner_nights} nights over the last year. Moving some of those to slower weeks would open up the dates that earn the most.`);
  // what guests wrote (Track reviews): a theme in 2+ low-score reviews or private notes in the last 2 years
  const TR = "Track guest reviews (Airbnb + Vrbo), keyword count";
  rvThemes(RV).filter(t => t.n >= 2).forEach(t => add(t.area, t.text,
    `${t.n} of ${t.of} low-score reviews or private notes since ${dt(t.since + "T12:00")} mention it — latest ${dt(t.latest.check_in + "T12:00")} (${t.latest.channel}): “${t.quote}”`, TR, t.owner,
    t.owner ? `${t.n} guests over the last two years mentioned ${t.ownerWord} in their reviews${t.pubQuote ? ` — for example: “${t.pubQuote}”` : ""}. We'd like to talk about addressing that.` : ""));
  // unanswered public reviews (last 12 months)
  const yr = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10), pubs = ((RV && RV.reviews) || []).filter(r => r.text && (r.check_in || "") >= yr), noResp = pubs.filter(r => !r.response);
  if(pubs.length >= 3 && noResp.length / pubs.length >= .3) add("Guest experience", "Many public reviews have no reply from us — reply to every review, especially the low ones; future guests read the replies.",
    `${noResp.length} of ${pubs.length} public reviews in the last 12 months have no response.`, "Track guest reviews (Airbnb + Vrbo)");
  return R;
}
async function worst(v){
  v.innerHTML = `<div class="page wide">${back}<h2>Worst performers — what to fix</h2><p class="muted">Loading…</p></div>`;
  let H; try { H = await worstData(); } catch(e){ return fail(v, e); }
  if(!H.length) return noAccess(v);
  const B = H.filter(x => x.kd && x.gap < 0).map(x => ({ ...x, recs:recommend(x, DX[x.home_id]), rv:(DX[x.home_id] || {}).ours || {}, rc:(DX[x.home_id] || {}).comps || {} })), W = H[0];
  v.innerHTML = `<div class="page wide">${back}<h2>Worst performers — what to fix</h2>
    <p class="muted">Our homes earning less per available night than the comps in their rate set, measured the same way on both sides (Key Data), ${esc(dt(W.win_from + "T12:00"))} – ${esc(dt(W.win_to + "T12:00"))}. Open a home for the reasons, what to fix, and a draft note for the owner.</p>
    <div class="ankpi"><div class="card"><small>Homes behind their comps</small><b>${B.length}</b><small>of ${H.filter(x => x.kd).length} compared</small></div>
      <div class="card"><small>More than 25% behind</small><b>${B.filter(x => x.gap <= -.25).length}</b><small>revenue per available night</small></div>
      <div class="card"><small>With a reviews gap</small><b>${B.filter(x => x.recs.some(r => r.source.startsWith("Key Data listing details") && /scores|rating|reviews/.test(r.text))).length}</b><small>a category below the comps</small></div></div>
    <div class="anbar"><input id="wq" type="search" placeholder="Search homes, owners or rate sets"><select id="wa"><option value="">All areas</option>${[...new Set(B.map(x => x.area).filter(Boolean))].sort().map(a => `<option>${esc(a)}</option>`).join("")}</select></div>
    <div id="wt"></div>
    <p class="ansrc">Sources: Key Data listing KPIs and listing details (captured ${esc(dt(W.kd_captured))}) for our Airbnb listing and the Primary comps; Track stays; Rates desk checks; owner rules from the Kolleen workbook.</p></div>`;
  const draw = () => { const q = $("#wq").value.toLowerCase(), a = $("#wa").value;
    table($("#wt"), [
      { k:"home", t:"Home", l:1, f:r => `<a class="anlink" href="#/an/worst/${encodeURIComponent(r.home_id)}">${esc(r.home)}</a>` }, { k:"area", t:"Area", l:1 }, { k:"bedrooms", t:"Beds" },
      { k:"gap", t:"RevPAR vs. comps", f:r => r.kd_occ ? `<span class="andn">${Math.round(r.gap * 100)}%</span>` : `<span class="pill amber" title="Key Data saw no Airbnb bookings — check the listing">no Airbnb bookings seen</span>` },
      { k:"occ_d", t:"Occ. gap", v:r => r.kd_occ - r.comp_occ, f:r => pts(r.kd_occ, r.comp_occ) }, { k:"adr_d", t:"ADR gap", v:r => r.kd_adr / r.comp_adr, f:r => chg(r.kd_adr, r.comp_adr) },
      { k:"rating", t:"Airbnb rating", v:r => r.rv.r_overall == null ? null : +r.rv.r_overall, f:r => r.rv.r_overall == null ? "—" : `${(+r.rv.r_overall).toFixed(2)} <span class="muted">vs ${r.rc.r_overall == null ? "—" : (+r.rc.r_overall).toFixed(2)}</span>` },
      { k:"nrec", t:"Things to fix", v:r => r.recs.length, f:r => `${r.recs.length}${r.recs.some(x => x.owner) ? ` <span class="pill">owner</span>` : ""}` },
      { k:"our_rent", t:"Track guest rent", f:r => usd(r.our_rent) }
    ], B.filter(x => (!q || [x.home, x.set_name].join(" ").toLowerCase().includes(q)) && (!a || x.area === a)), "gap", null, 1); };
  $("#wq").oninput = $("#wa").onchange = draw; draw();
}
async function worstOne(v, id){
  v.innerHTML = `<div class="page wide">${back}<h2>Home</h2><p class="muted">Loading…</p></div>`;
  let H; try { H = await worstData(); } catch(e){ return fail(v, e); }
  const h = H.find(x => x.home_id === id), x = DX[id]; if(!h || !x) return noAccess(v);
  let RV = null; try { const r = await sb.rpc("analytics_reviews", { p_home:id }); if(!r.error) RV = r.data; } catch(e){}
  const o = x.ours || {}, c = x.comps || {}, R = recommend(h, x, RV), TH = rvThemes(RV), own = ownerOf(h.home), nm = h.home.replace(/\s*\([^)]*\)\s*$/, "");
  const f2 = v => v == null ? "—" : (+v).toFixed(2), cmp = (a, b, hi) => a == null || b == null ? "" : (+a >= +b - (hi || 0) ? "anup" : "andn");
  // owner draft: owner-facing points in full; our own work summed up by area in plain words (no internal tool names)
  const OR = R.filter(r => r.owner), OURS = { Pricing:"fine-tuning your nightly rates and minimum stays against the market", Listing:"improving the listing — description, photos and how it shows up in search",
    "Guest experience":"the guest experience — cleaning checks, check-in and asking happy guests for reviews" };
  const ourWork = [...new Set(R.filter(r => !r.owner).map(r => OURS[r.area]).filter(Boolean))];
  const lead = h.kd && h.kd_occ && h.gap != null ? ` — over the last 12 months it earned about ${Math.abs(Math.round(h.gap * 100))}% less per available night than the comparable homes we track` : "";
  const draft = `Hi${own ? " " + own : ""},\n\nWe've been reviewing how ${nm} is doing against similar homes nearby${lead}. We want to close that gap before the season.\n\n`
    + (ourWork.length ? `Here's what we're working on:\n${ourWork.map(t => "• " + t.charAt(0).toUpperCase() + t.slice(1)).join("\n")}\n\n` : "")
    + (OR.length ? `A few things are in your hands, and we'd love your thoughts:\n${OR.map(r => "• " + r.ownerText).join("\n")}\n\n` : "")
    + `Could we set up a quick call this week to go over it?\n\nThanks,\nMoose Management`;
  v.innerHTML = `<div class="page wide"><p style="margin:0 0 6px"><a href="#/reports">← All reports</a> · <a href="#/an/worst">Worst performers</a> · <a href="#/an/home/${encodeURIComponent(id)}">Month by month</a></p>
    <h2>${esc(h.home)}</h2><p class="muted">${esc([h.set_name, h.area, h.bedrooms ? h.bedrooms + " bedrooms" : "", o.url ? "" : ""].filter(Boolean).join(" · "))}${o.url ? ` · <a href="${esc(o.url)}" target="_blank" rel="noopener">Airbnb listing</a>` : ""}</p>
    <div class="ankpi">
      <div class="card"><small>Revenue per available night</small><b>${h.kd ? usd(h.kd_rp) : "—"}</b><small>comps ${usd(h.comp_rp)} · ${h.gap == null ? "" : Math.round(h.gap * 100) + "%"}</small></div>
      <div class="card"><small>Occupancy</small><b>${pct(h.kd_occ)}</b><small>comps ${pct(h.comp_occ)}</small></div>
      <div class="card"><small>Nightly rate</small><b>${usd(h.kd_adr)}</b><small>comps ${usd(h.comp_adr)} · Track actual ${usd(h.our_adr)}</small></div>
      <div class="card"><small>Airbnb rating</small><b>${f2(o.r_overall)}</b><small>${o.r_count ?? "—"} reviews · comps ${f2(c.r_overall)}</small></div></div>
    <h3 class="anh3">What to fix</h3>
    <div id="wr">${R.length ? R.map(r => `<div class="card" style="margin:0 0 8px;padding:10px 14px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pill">${esc(r.area)}</span>${r.owner ? `<span class="pill amber">talk to owner</span>` : ""}</div>
      <p style="margin:6px 0 2px;font-weight:600">${esc(r.text)}</p><p class="muted" style="margin:0;font-size:13px">${esc(r.evidence)}${r.evidence ? " · " : ""}Source: ${esc(r.source)}</p></div>`).join("") : `<div class="card"><p class="muted">No clear cause in the data — it may be a one-off season. Check the month-by-month page.</p></div>`}</div>
    <h3 class="anh3">Guest reviews vs. comps (Airbnb)</h3><div id="wrv"></div>
    ${RV ? `<h3 class="anh3">What guests wrote <a class="muted" style="font-size:13px;font-weight:400;margin-left:8px" href="#/an/reviews/${encodeURIComponent(nm)}">All reviews report →</a></h3>
    <p class="muted" style="margin:0 0 6px">${RV.count ? `${RV.count} rated reviews in Track (Airbnb + Vrbo), average ${f2(RV.avg)} of 5.` : "No rated reviews in Track for this home yet."} Repeat complaints = low-score reviews (4 stars or less, or a category at 3 or less) and private notes from the last 2 years that mention each topic — a keyword count, so open the reviews to read them.</p>
    <div id="wth"></div>
    <div class="anbar" style="margin-top:10px"><select id="wrf"><option value="low">Low scores and private notes</option><option value="all">All reviews</option></select></div>
    <div id="wrl"></div>` : ""}
    <h3 class="anh3">Listing vs. comps</h3><div id="wls"></div>
    ${x.rules.length || x.feedback.length ? `<h3 class="anh3">Owner rules and past feedback</h3><div id="wow"></div>` : ""}
    <h3 class="anh3">Draft note for the owner</h3>
    <p class="muted" style="margin:0 0 6px">Edit before you use it. The hub doesn't send this — copy it into your email or Track. Check the numbers first; Key Data figures are estimates measured the same way for every home.</p>
    <textarea id="wdraft" rows="14" style="width:100%;font:inherit;font-size:14px">${esc(draft)}</textarea>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn small" id="wcopy">Copy</button><span class="muted" id="wcopied"></span></div>
    <p class="ansrc">Sources: Key Data listing KPIs and listing details for this home's Airbnb listing and the ${c.n || 0} Primary comps in its rate set (comp figures are medians; amenity shares leave out comps Key Data marks "Unknown"); Track stays;${RV ? ` Track guest reviews (${esc(RV.source)}, read ${esc(dt(RV.synced))});` : ""} Rates desk checks; owner rules (Kolleen workbook) and owner feedback (Desk); photo score = home_ai (Claude ESTIMATE).</p></div>`;
  const tc = (RV && RV.cats) || {};
  table($("#wrv"), [{ k:"cat", t:"Category", l:1 }, { k:"o", t:"This home", f:r => `<span class="${cmp(r.o, r.c, .15)}">${f2(r.o)}</span>` }, { k:"c", t:"Comps median", f:r => f2(r.c) },
    { k:"d", t:"Gap", v:r => r.o == null || r.c == null ? null : r.o - r.c, f:r => r.o == null || r.c == null ? "—" : `<span class="${cmp(r.o, r.c, .15)}">${(r.o - r.c >= 0 ? "+" : "") + (r.o - r.c).toFixed(2)}</span>` },
    ...(RV ? [{ k:"t", t:"All our reviews (Track)", f:r => r.t == null ? "—" : f2(r.t) }] : [])],
    RCAT.map(([k, t]) => ({ cat:t, o:o[k] == null ? null : +o[k], c:c[k] == null ? null : +c[k], t:k === "r_overall" ? RV && RV.avg : tc[RVCAT[k]] }))
      .concat([{ cat:"Number of reviews", o:o.r_count, c:c.r_count == null ? null : Math.round(c.r_count), t:RV ? RV.count : null }]), null);
  if(RV){
    if(TH.length) table($("#wth"), [{ k:"name", t:"Repeat complaint", l:1 }, { k:"n", t:"Reviews / notes" }, { k:"quote", t:"Latest", l:1, f:r => `<span style="white-space:normal;display:inline-block;min-width:260px"><span class="muted">${esc(dt(r.latest.check_in + "T12:00"))} · ${esc(r.latest.channel)}</span> “${esc(r.quote)}”</span>` }], TH, null);
    else $("#wth").innerHTML = `<p class="muted">No repeat complaints in the last 2 years.</p>`;
    const stars = s => s == null ? "" : `<span class="pill ${+s >= 5 ? "green" : +s >= 4 ? "" : +s >= 3 ? "amber" : "red"}">${(+s).toFixed(0)} ★</span>`;
    const low = r => (r.overall != null && +r.overall <= 4) || Object.values(r.ratings || {}).some(s => s != null && +s <= 3) || r.private;
    const drawRv = (more) => { const L = (RV.reviews || []).filter(r => $("#wrf").value === "all" || low(r)), S = more ? L : L.slice(0, 8);
      $("#wrl").innerHTML = (S.length ? S.map(r => `<div class="card" style="margin:0 0 8px;padding:10px 14px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${stars(r.overall)}<span class="muted" style="font-size:13px">${esc(dt(r.check_in + "T12:00"))} · ${r.nights || "?"} nights · ${esc(r.channel)} · res ${esc(r.res)}</span>
          ${Object.entries(r.ratings || {}).filter(([, s]) => s != null && +s <= 3).map(([k, s]) => `<span class="pill amber">${esc(k)} ${+s}</span>`).join("")}</div>
        ${r.text ? `<p style="margin:6px 0 2px">${esc(r.text)}</p>` : ""}${r.private ? `<p style="margin:6px 0 2px"><b>Private note to us:</b> ${esc(r.private)}</p>` : ""}
        ${r.response ? `<p class="muted" style="margin:4px 0 0;font-size:13px">Our reply: ${esc(r.response)}</p>` : r.text ? `<p class="muted" style="margin:4px 0 0;font-size:13px">No reply from us</p>` : ""}</div>`).join("")
        : `<p class="muted">No reviews to show.</p>`) + (!more && L.length > S.length ? `<button class="btn small" id="wrmore">Show all ${L.length}</button>` : "");
      if($("#wrmore")) $("#wrmore").onclick = () => drawRv(1); };
    $("#wrf").onchange = () => drawRv(); drawRv();
  }
  const am = v => v == null ? "—" : v === "none" ? "No" : v === "unknown" ? "Not known" : v.replace(/_/g, " "), sh = s => s == null ? "not known" : Math.round(s * 100) + "%";
  table($("#wls"), [{ k:"t", t:"", l:1 }, { k:"o", t:"This home", l:1 }, { k:"c", t:"Comps", l:1 }], [
    { t:"Photos", o:o.photos ?? "—", c:c.photos == null ? "—" : "median " + Math.round(c.photos) },
    { t:"Minimum stay (nights)", o:o.min_stay ?? "—", c:c.min_stay == null ? "—" : "median " + Math.round(c.min_stay) },
    { t:"Instant Book", o:o.instant == null ? "—" : o.instant ? "On" : "Off", c:c.instant == null ? "—" : Math.round(c.instant * 100) + "% on" },
    { t:"Hot tub", o:am(o.hot_tub), c:sh(c.hot_tub) + " have one" },
    { t:"Pool", o:am(o.pool), c:sh(c.pool) + " have one" },
    { t:"Ski in / ski out", o:am(o.ski), c:sh(c.ski) },
    { t:"Mountain view / access", o:am(o.mountain), c:sh(c.mountain) },
    { t:"Sleeps", o:o.guests ?? "—", c:"" },
    ...(x.ai ? [{ t:"Photo score (Claude estimate)", o:x.ai.overall == null ? "—" : (+x.ai.overall).toFixed(1) + " of 5", c:"" }] : [])
  ].map(r => ({ ...r, o:String(r.o), c:String(r.c) })), null);
  if($("#wow")) $("#wow").innerHTML = x.rules.map(r => `<div class="card" style="margin:0 0 8px;padding:10px 14px"><b>Owner rule</b> · ${esc([r.min_price ? "min price " + usd(r.min_price) : "", r.min_price_peak ? "peak min " + usd(r.min_price_peak) : "", r.min_stay ? "min stay " + r.min_stay : "", r.rule || ""].filter(Boolean).join(" · "))}<p class="muted" style="margin:4px 0 0;font-size:13px">${esc(r.note || "")} · Source: ${esc(r.source || "owner_rules")}</p></div>`).join("")
    + x.feedback.map(b => `<div class="card" style="margin:0 0 8px;padding:10px 14px"><b>Owner feedback ${esc(b.received || "")}</b> · ${esc(b.topic || "")}<p style="margin:4px 0">${esc(b.complaint || "")}</p><p class="muted" style="margin:0;font-size:13px">Action: ${esc(b.action || "—")}${b.result ? " · Result: " + esc(b.result) : ""}</p></div>`).join("");
  $("#wcopy").onclick = async () => { try { await navigator.clipboard.writeText($("#wdraft").value); $("#wcopied").textContent = "Copied."; } catch(e){ $("#wdraft").select(); $("#wcopied").textContent = "Press Ctrl+C to copy."; } };
}

/* Guest reviews — what guests say (Brandon 2026-10-28): every Track review (Airbnb + Vrbo) by home, neighborhood and topic.
   Data: analytics_reviews_all(p_since) (hub_track_reviews.sql). Topics = THEMES keyword count: a "complaint" is a sentence that
   reads negative (hitSent), a "mention" is any sentence with the topic's words. #/an/reviews/<home code> opens one home. */
const RVA = {};
async function reviews(v, pre, desk){   // desk = the Reservations / Guest ▸ Reviews tab (#/reviews, Brandon 2026-10-29): same report, no Reports back link
  const bk = desk ? "" : back, h2 = desk ? "Guest reviews" : "Guest reviews — what guests say";
  v.innerHTML = `<div class="page wide">${bk}<h2>${h2}</h2><p class="muted">Loading…</p></div>`;
  const since = (() => { try { return localStorage.getItem("an_rv_since") || "730"; } catch(e){ return "730"; } })();
  const load = async d => { if(!RVA[d]){ const r = await sb.rpc("analytics_reviews_all", { p_since:d === "all" ? null : new Date(Date.now() - d * 864e5).toISOString().slice(0, 10) });
      if(r.error) throw r.error; if(r.data == null) return null;
      RVA[d] = r.data.map(x => { const t = [x.text, x.private].filter(Boolean).join(" \n ");
        x.tc = new Set(THEMES.filter(([k, , re]) => hitSent(x.text, re, k) || hitSent(x.private, re, k)).map(z => z[0]));
        x.tm = new Set(THEMES.filter(([, , re]) => re.test(t)).map(z => z[0])); x.hood = x.community || String(x.code || "").split(" ")[0]; return x; }); }
    return RVA[d]; };
  const oops = e => desk ? v.innerHTML = `<div class="page"><div class="card"><p class="muted">Couldn't load reviews: ${esc(e.message || e)}</p></div></div>` : fail(v, e);
  let A; try { A = await load(since); } catch(e){ return oops(e); }
  if(!A) return noAccess(v);
  // staff praised by name (review_kudos, found nightly by review_kudos.py; same readers as the reviews)
  let K = []; try { const k = await sb.from("review_kudos").select("*").order("submitted_at", { ascending:false }).limit(300); K = k.data || []; } catch(e){}
  const TN = Object.fromEntries(THEMES.map(t => [t[0], t[1]])), hoods = [...new Set(A.map(x => x.hood).filter(Boolean))].sort(), homes = [...new Set(A.map(x => x.code).filter(Boolean))].sort();
  v.innerHTML = `<div class="page wide">${bk}<h2>${h2}</h2>
    <p class="muted">Every guest review in Track (Airbnb + Vrbo) with what guests bring up, by home and neighborhood. Topics are a keyword count: a <b>complaint</b> is a sentence that reads negative ("the hot tub was cold"), a <b>mention</b> is any sentence with the topic's words. Read the reviews before acting on a count. Click a topic or a home to filter.</p>
    <div class="anbar">
      <select id="rvs"><option value="365">Last 12 months</option><option value="730">Last 2 years</option><option value="all">All (since Nov 2022)</option></select>
      <select id="rvh"><option value="">All neighborhoods</option>${hoods.map(h => `<option>${esc(h)}</option>`).join("")}</select>
      <input id="rvu" list="rvul" placeholder="Home (e.g. PL 805)"><datalist id="rvul">${homes.map(h => `<option value="${esc(h)}">`).join("")}</datalist>
      <select id="rvt"><option value="">All topics</option>${THEMES.map(t => `<option value="${t[0]}">${esc(t[1])}</option>`).join("")}</select>
      <select id="rvm"><option value="c">Complaints</option><option value="m">Any mention</option></select>
      <select id="rvr"><option value="">All stars</option><option value="4">4★ or less</option><option value="3">3★ or less</option><option value="p">Has a private note</option><option value="n">No reply from us</option></select>
      <select id="rvc"><option value="">Airbnb + Vrbo</option><option value="Airbnb">Airbnb</option><option value="Homeaway">Vrbo</option></select>
      <input id="rvq" type="search" placeholder="Words in the review"></div>
    <div id="rvk"></div>
    <h3 class="anh3">Highlights</h3><div id="rvhl"></div>
    <h3 class="anh3">Topics</h3><div id="rvtt"></div>
    <h3 class="anh3">By home</h3><div id="rvht"></div>
    <h3 class="anh3">Reviews <button class="btn small" id="rvcsv" style="margin-left:8px">Download CSV</button></h3><div id="rvl"></div>
    <p class="ansrc">Source: Track API /api/channel-management/channel/reviews (read daily by track_reviews_sync.py); homes and neighborhoods from Track (hub_homes). Vrbo shows as "Homeaway" in Track; its categories are renamed to Airbnb's. Guest names aren't stored.</p></div>`;
  $("#rvs").value = since; if(pre) $("#rvu").value = pre;
  const stars = s => s == null ? "" : `<span class="pill ${+s >= 5 ? "green" : +s >= 4 ? "" : +s >= 3 ? "amber" : "red"}">${(+s).toFixed(0)} ★</span>`;
  let shown = 30, cur = [];
  const draw = () => {
    const h = $("#rvh").value, u = $("#rvu").value.trim().toLowerCase(), t = $("#rvt").value, m = $("#rvm").value, rs = $("#rvr").value, ch = $("#rvc").value, q = $("#rvq").value.trim().toLowerCase();
    const has = (x, k) => (m === "c" ? x.tc : x.tm).has(k);
    const base = A.filter(x => (!h || x.hood === h) && (!u || String(x.code).toLowerCase() === u || String(x.name).toLowerCase().includes(u)) && (!ch || x.channel === ch)
      && (!rs || (rs === "p" ? !!x.private : rs === "n" ? !!x.text && !x.response : x.overall != null && +x.overall <= +rs)) && (!q || [x.text, x.private].join(" ").toLowerCase().includes(q)));
    cur = base.filter(x => !t || has(x, t));
    const rated = cur.filter(x => x.overall != null), avg = rated.length ? rated.reduce((a, x) => a + +x.overall, 0) / rated.length : null;
    $("#rvk").innerHTML = `<div class="ankpi"><div class="card"><small>Reviews</small><b>${cur.length.toLocaleString()}</b><small>${new Set(cur.map(x => x.code)).size} homes</small></div>
      <div class="card"><small>Average stars</small><b>${avg == null ? "—" : avg.toFixed(2)}</b><small>${rated.length} rated</small></div>
      <div class="card"><small>5-star share</small><b>${rated.length ? Math.round(rated.filter(x => +x.overall >= 5).length / rated.length * 100) + "%" : "—"}</b><small>of rated reviews</small></div>
      <div class="card"><small>With a complaint</small><b>${cur.filter(x => x.tc.size).length}</b><small>${cur.filter(x => x.private).length} private notes</small></div>
      <div class="card"><small>No reply from us</small><b>${cur.filter(x => x.text && !x.response).length}</b><small>public reviews</small></div></div>`;
    // highlights (Brandon 2026-10-29): team named as great (review_kudos) + the best line from recent 5-star reviews, both following the home/neighborhood/channel filters
    const HL = /\b(amazing|awesome|wonderful|fantastic|excellent|incredible|outstanding|perfect|beautiful|loved|love|spotless|immaculate|cozy|stunning|best|highly recommend|would (?:definitely )?(?:stay|come back|return))\b/i;
    const inF = x => (!h || x.hood === h) && (!u || String(x.code || x.home).toLowerCase() === u || String(x.name || "").toLowerCase().includes(u)) && (!ch || (x.channel === ch || (ch === "Homeaway" && x.channel === "Vrbo")));
    const hoodOf = {}; A.forEach(x => hoodOf[x.code] = x.hood);
    const KK = K.filter(k => inF({ code:k.home, hood:hoodOf[k.home] || String(k.home || "").split(" ")[0], channel:k.channel })).slice(0, 6);
    const best = r => sentences(r.text).filter(s => HL.test(s) && s.length >= 25 && s.length <= 260).sort((a, b) => (b.match(new RegExp(HL.source, "gi")) || []).length - (a.match(new RegExp(HL.source, "gi")) || []).length)[0];
    const five = base.filter(x => +x.overall >= 5 && x.text).map(x => ({ x, s:best(x) })).filter(z => z.s).slice(0, 6);
    const quote = (who, s, meta) => `<div class="card" style="margin:0;padding:10px 14px">${who}<p style="margin:4px 0">“${esc(s)}”</p><small class="muted">${meta}</small></div>`;
    $("#rvhl").innerHTML = `<div class="anch2">
      <div><h4 style="margin:0 0 6px">🌟 Team named in reviews</h4><div style="display:grid;gap:8px">${KK.length ? KK.map(k => quote(`<b>${esc(k.person)}</b>${k.field === "private" ? ` <span class="pill">private note</span>` : ""}`, k.quote,
          `${esc(k.home || "")} · ${esc(k.channel || "")}${k.stars != null ? ` · ${+k.stars}★` : ""} · ${esc(dt(k.submitted_at))}`)).join("") : `<p class="muted">No one named as great in these reviews yet.</p>`}</div></div>
      <div><h4 style="margin:0 0 6px">⭐ Recent 5-star highlights</h4><div style="display:grid;gap:8px">${five.length ? five.map(({ x, s }) => quote(`<b>${esc(x.code)}</b>`, s,
          `${esc(x.channel === "Homeaway" ? "Vrbo" : x.channel)} · ${esc(dt(x.check_in + "T12:00"))}`)).join("") : `<p class="muted">No 5-star reviews with text match these filters.</p>`}</div></div></div>
      <p class="ansrc">Team: staff named next to a praise word in a review (review_kudos.py, nightly). New public ones go on Home as a shout-out for 3 weeks. 5-star lines: the sentence with the most praise words, newest first.</p>`;
    // topics: counted over the filtered reviews before the topic filter, so every topic stays comparable
    table($("#rvtt"), [{ k:"name", t:"Topic", l:1, f:r => `<a class="anlink" href="#" data-t="${r.k}">${esc(r.name)}</a>` }, { k:"c", t:"Complaints" }, { k:"m", t:"Mentions" }, { k:"homes", t:"Homes with a complaint" },
      { k:"top", t:"Most complaints", l:1, f:r => r.top ? `<a class="anlink" href="#" data-u="${esc(r.top[0])}">${esc(r.top[0])}</a> <span class="muted">(${r.top[1]})</span>` : "—" }],
      THEMES.map(([k, name]) => { const c = base.filter(x => x.tc.has(k)), by = {}; c.forEach(x => by[x.code] = (by[x.code] || 0) + 1);
        return { k, name, c:c.length, m:base.filter(x => x.tm.has(k)).length, homes:Object.keys(by).length, top:Object.entries(by).sort((a, b) => b[1] - a[1])[0] }; }), "c");
    const by = {}; cur.forEach(x => { const b = by[x.code] || (by[x.code] = { code:x.code, hood:x.hood, comp:x.comp, n:0, s:0, rn:0, low:0, cmp:0, t:{} });
      b.n++; if(x.overall != null){ b.rn++; b.s += +x.overall; if(+x.overall <= 4) b.low++; } if(x.tc.size) b.cmp++; x.tc.forEach(k => b.t[k] = (b.t[k] || 0) + 1); });
    table($("#rvht"), [{ k:"code", t:"Home", l:1, f:r => `<a class="anlink" href="#" data-u="${esc(r.code)}">${esc(r.code)}</a>${r.comp ? ` <a class="muted" style="font-size:12px" href="#/an/worst/${encodeURIComponent(r.comp)}">vs. comps</a>` : ""}` },
      { k:"hood", t:"Neighborhood", l:1 }, { k:"n", t:"Reviews" }, { k:"avg", t:"Avg stars", v:r => r.rn ? r.s / r.rn : null, f:r => r.rn ? (r.s / r.rn).toFixed(2) : "—" },
      { k:"low", t:"4★ or less" }, { k:"cmp", t:"With a complaint" },
      { k:"tops", t:"Top complaints", l:1, v:r => Object.keys(r.t).length, f:r => Object.entries(r.t).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `<span class="pill">${esc(TN[k])} ${n}</span>`).join(" ") || "—" }],
      Object.values(by), "cmp");
    const L = cur.slice(0, shown), re = t ? THEMES.find(z => z[0] === t)[2] : null;
    const mark = s => { s = esc(s); if(!re) return s; const sent = (m === "c" ? hitSent : (x, r) => sentences(x).find(y => r.test(y)) || "")(s, re, t); return sent ? s.replace(sent, `<mark>${sent}</mark>`) : s; };
    $("#rvl").innerHTML = (L.length ? L.map(r => `<div class="card" style="margin:0 0 8px;padding:10px 14px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${stars(r.overall)}
        <b>${esc(r.code)}</b><span class="muted" style="font-size:13px">${esc(dt(r.check_in + "T12:00"))} · ${r.nights || "?"} nights · ${esc(r.channel === "Homeaway" ? "Vrbo" : r.channel)} · res ${esc(r.res)}</span>
        ${Object.entries(r.ratings || {}).filter(([, s]) => s != null && +s <= 3).map(([k, s]) => `<span class="pill amber">${esc(k)} ${+s}</span>`).join("")}
        ${[...r.tc].map(k => `<span class="pill red">${esc(TN[k])}</span>`).join("")}</div>
      ${r.text ? `<p style="margin:6px 0 2px">${mark(r.text)}</p>` : ""}${r.private ? `<p style="margin:6px 0 2px"><b>Private note to us:</b> ${mark(r.private)}</p>` : ""}
      ${r.text && !r.response ? `<p class="muted" style="margin:4px 0 0;font-size:13px">No reply from us</p>` : ""}</div>`).join("") : `<p class="muted">No reviews match.</p>`)
      + (cur.length > L.length ? `<button class="btn small" id="rvmore">Show ${Math.min(30, cur.length - L.length)} more (${cur.length - L.length} left)</button>` : "");
    if($("#rvmore")) $("#rvmore").onclick = () => { shown += 30; draw(); };
    v.querySelectorAll("[data-t]").forEach(a => a.onclick = e => { e.preventDefault(); $("#rvt").value = a.dataset.t; shown = 30; draw(); });
    v.querySelectorAll("[data-u]").forEach(a => a.onclick = e => { e.preventDefault(); $("#rvu").value = a.dataset.u; shown = 30; draw(); $("#rvk").scrollIntoView(); });
  };
  ["rvh", "rvt", "rvm", "rvr", "rvc"].forEach(id => $("#" + id).onchange = () => { shown = 30; draw(); });
  $("#rvu").oninput = $("#rvq").oninput = () => { shown = 30; draw(); };
  $("#rvs").onchange = async () => { const d = $("#rvs").value; try { localStorage.setItem("an_rv_since", d); } catch(e){}
    $("#rvl").innerHTML = `<p class="muted">Loading…</p>`; try { A = await load(d); } catch(e){ return oops(e); } shown = 30; draw(); };
  $("#rvcsv").onclick = () => { const cell = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = [["Home", "Neighborhood", "Check-in", "Nights", "Channel", "Stars", "Low categories", "Complaints", "Review", "Private note", "Reservation"]].concat(cur.map(r =>
      [r.code, r.hood, r.check_in, r.nights, r.channel === "Homeaway" ? "Vrbo" : r.channel, r.overall, Object.entries(r.ratings || {}).filter(([, s]) => s != null && +s <= 3).map(([k, s]) => k + " " + s).join("; "),
       [...r.tc].map(k => TN[k]).join("; "), r.text, r.private, r.res]));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n")], { type:"text/csv" }));
    a.download = `guest-reviews-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  draw();
}

const VIEWS = { comps, demand, pace, top, channels, worst, reviews };
window.reviewsDesk = function(v){ css(); return reviews(v, hashArg(), true); };   // #/reviews · #/guest_reviews (· /<home code>); data: hub_can('reviews') or analytics
window.anView = function(v){ css(); const a = hashArg();
  if(a.startsWith("reviews/")) return reviews(v, decodeURIComponent(a.slice(8)));
  if(a.startsWith("home/")) return home(v, decodeURIComponent(a.slice(5)));
  if(a.startsWith("worst/")) return worstOne(v, decodeURIComponent(a.slice(6)));
  return (VIEWS[a] || market)(v); };
})();
