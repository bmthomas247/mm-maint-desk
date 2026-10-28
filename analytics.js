/* analytics.js (Brandon 2026-10-28): Reports & Analytics ▸ Key Data reports.
   Loaded by hub.html; uses its sb / $ / esc / hashArg. Data: analytics_market_trend() + analytics_vs_comps() (hub_analytics.sql),
   both gated by hub_can('analytics') in Supabase. Routes: #/an/market · #/an/comps */
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
.ansrc{font-size:12.5px;color:var(--muted);margin:8px 0 0}`;
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
// sortable table: cols = [{ k, t, f(row)->html, v(row)->sort value, l (left) }]
function table(el, cols, rows, sortK, cls){
  let k = sortK, dir = -1;
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
    <div id="anmt"></div>
    <h3 style="margin:18px 0 6px">All neighborhoods · last 12 full months</h3><div id="anall"></div>
    <p class="ansrc">Source: Key Data market KPIs (via the Rates pull), latest capture ${esc(dt(cap))}. Occupancy = Key Data guest occupancy; ADR = average nightly rate; RevPAR = revenue per available night.</p></div>`;
  // combine channels for one market + month
  const roll = list => { const n = list.reduce((a, x) => a + (+x.listings || 0), 0); if(!n) return null;
    const w = f => list.reduce((a, x) => a + (+x[f] || 0) * (+x.listings || 0), 0) / n;
    const booked = list.reduce((a, x) => a + (+x.guest_occ || 0) * (+x.listings || 0), 0);
    return { listings:n, occ:w("guest_occ"), revpar:w("revpar"), win:w("booking_window"), stay:w("stay_length"),
      adr: booked ? list.reduce((a, x) => a + (+x.adr || 0) * (+x.guest_occ || 0) * (+x.listings || 0), 0) / booked : null }; };
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
    // all markets, last 12 full months
    const end = thisMonth, start = (() => { const d = new Date(end + "T12:00"); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); })();
    const all = markets.map(m => { const L = pick(m, o).filter(x => x.month >= start && x.month < end); const r = roll(L); if(!r) return null;
      const months = new Set(L.map(x => x.month)).size; return { market:m, ...r, listings:r.listings / (months || 1) }; }).filter(Boolean);
    table($("#anall"), [
      { k:"market", t:"Neighborhood", l:1 }, { k:"occ", t:"Occupancy", f:r => pct(r.occ) }, { k:"adr", t:"ADR", f:r => usd(r.adr) },
      { k:"revpar", t:"RevPAR", f:r => usd(r.revpar) }, { k:"win", t:"Books ahead (days)", f:r => Math.round(r.win) },
      { k:"stay", t:"Avg stay (nights)", f:r => r.stay.toFixed(1) }, { k:"listings", t:"Avg listings", f:r => Math.round(r.listings).toLocaleString() }
    ], all, "revpar"); };
  $("#anm").onchange = $("#ano").onchange = draw; draw();
}

/* Moose homes vs. their comps: our Track stays vs. the Primary comps in each home's rate set (Key Data listing KPIs). */
async function comps(v){
  v.innerHTML = `<div class="page wide">${back}<h2>Moose homes vs. their comps</h2><p class="muted">Loading…</p></div>`;
  const r = await sb.rpc("analytics_vs_comps"); if(r.error) return fail(v, r.error);
  const H = r.data || [];
  if(!H.length){ v.innerHTML = `<div class="page"><div class="card"><h2>No access</h2><p class="muted">This report isn't on your teams. Ask Brandon or Kim.</p></div></div>`; return; }
  const W = H[0], areas = [...new Set(H.map(x => x.area).filter(Boolean))].sort();
  H.forEach(x => { ["our_occ","our_adr","comp_occ","comp_adr","our_rent"].forEach(f => x[f] = x[f] == null ? null : +x[f]); });
  v.innerHTML = `<div class="page wide">${back}<h2>Moose homes vs. their comps</h2>
    <p class="muted">Each of our homes against the comps in its rate set, ${esc(dt(W.win_from + "T12:00"))} – ${esc(dt(W.win_to + "T12:00"))}. Click a column to sort.</p>
    <div class="ankpi" id="ank"></div>
    <div class="anbar"><input id="anq" type="search" placeholder="Search homes or rate sets"><select id="ana"><option value="">All areas</option>${areas.map(a => `<option>${esc(a)}</option>`).join("")}</select>
      <select id="anf"><option value="">All homes</option><option value="ahead">Beating comps</option><option value="behind">Behind comps</option></select></div>
    <div id="anct"></div>
    <p class="ansrc">Sources: <b>our homes</b> = Track stays (guest stays, not cancelled; nights and rent split by the nights inside the window), Track synced ${esc(dt(H.reduce((a, x) => x.track_synced > a ? x.track_synced : a, "")))};
      <b>comps</b> = Key Data listing KPIs for the Primary comps in each rate set, captured ${esc(dt(W.kd_captured))}.
      Our occupancy = guest nights ÷ every night in the window (owner and blocked nights count as empty). Comp occupancy = Key Data guest occupancy, averaged over the comps and months. Homes that joined during the window will look low.</p></div>`;
  const draw = () => { const q = $("#anq").value.toLowerCase(), a = $("#ana").value, f = $("#anf").value;
    const L = H.filter(x => (!q || ((x.home || "") + " " + (x.set_name || "")).toLowerCase().includes(q)) && (!a || x.area === a)
      && (!f || (x.comp_occ != null && (f === "ahead" ? x.our_occ >= x.comp_occ : x.our_occ < x.comp_occ))));
    const avg = (k, list) => { const z = list.filter(x => x[k] != null); return z.length ? z.reduce((s, x) => s + x[k], 0) / z.length : null; };
    const booked = L.filter(x => x.our_nights > 0), ahead = L.filter(x => x.comp_occ != null && x.our_occ >= x.comp_occ).length;
    $("#ank").innerHTML = `<div class="card"><small>Homes</small><b>${L.length}</b><small>${ahead} beating their comps on occupancy</small></div>
      <div class="card"><small>Our occupancy (avg)</small><b>${pct(avg("our_occ", booked))}</b><small>comps ${pct(avg("comp_occ", L))}</small></div>
      <div class="card"><small>Our ADR (avg)</small><b>${usd(avg("our_adr", booked))}</b><small>comps ${usd(avg("comp_adr", L))}</small></div>
      <div class="card"><small>Guest rent in window</small><b>${usd(L.reduce((s, x) => s + (x.our_rent || 0), 0))}</b><small>${L.reduce((s, x) => s + (x.our_nights || 0), 0).toLocaleString()} guest nights</small></div>`;
    table($("#anct"), [
      { k:"home", t:"Home", l:1 }, { k:"set_name", t:"Rate set", l:1 }, { k:"area", t:"Area", l:1 }, { k:"bedrooms", t:"Beds" },
      { k:"our_occ", t:"Our occ.", f:r => pct(r.our_occ) }, { k:"comp_occ", t:"Comps occ.", f:r => pct(r.comp_occ) },
      { k:"occ_d", t:"Gap", v:r => r.comp_occ == null ? null : r.our_occ - r.comp_occ, f:r => pts(r.our_occ, r.comp_occ) },
      { k:"our_adr", t:"Our ADR", f:r => usd(r.our_adr) }, { k:"comp_adr", t:"Comps ADR", f:r => usd(r.comp_adr) },
      { k:"adr_d", t:"Gap", v:r => r.our_adr && r.comp_adr ? r.our_adr / r.comp_adr : null, f:r => chg(r.our_adr, r.comp_adr) },
      { k:"our_nights", t:"Guest nights" }, { k:"owner_nights", t:"Owner / blocked" }, { k:"our_rent", t:"Guest rent", f:r => usd(r.our_rent) },
      { k:"comp_count", t:"Comps" }
    ], L, "occ_d"); };
  $("#anq").oninput = $("#ana").onchange = $("#anf").onchange = draw; draw();
}

window.anView = function(v){ css(); const a = hashArg(); return a === "comps" ? comps(v) : market(v); };
})();
