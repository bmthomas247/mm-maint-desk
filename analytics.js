/* analytics.js (Brandon 2026-10-28): Reports & Analytics ▸ Key Data reports.
   Loaded by hub.html; uses its sb / $ / esc / hashArg. Data: analytics_market_trend() + analytics_vs_comps() (hub_analytics.sql),
   both gated by hub_can('analytics') in Supabase. Routes: #/an/market · #/an/comps
   Round 2 (2026-10-28, hub_analytics_2.sql): #/an/demand · #/an/pace · #/an/top · #/an/home/<comp id> · #/an/channels */
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
  const draw = () => { const c = cols.find(x => x.k === k) || cols[0], val = c.v || (r => r[c.k]);
    const L = rows.slice().sort((a, b) => { const x = val(a), y = val(b); return (x == null) - (y == null) || (x < y ? -1 : x > y ? 1 : 0) * dir; });
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

const VIEWS = { comps, demand, pace, top, channels };
window.anView = function(v){ css(); const a = hashArg();
  if(a.startsWith("home/")) return home(v, decodeURIComponent(a.slice(5)));
  return (VIEWS[a] || market)(v); };
})();
