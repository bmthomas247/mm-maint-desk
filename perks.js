/* perks.js — Staffing ▸ Perks (Brandon 2026-10-30: "lets have a staffing: Perks, but only if we can build some type of cheap flight
   planner with our serpapi"). Route #/stf_perks, made in hub.html after hub_my_desks; follows the Staffing desk (hub_can('staffing')).
   Loaded by hub.html; uses its sb / esc / current / MM_CONFIG. Data: Edge Function perks-flights (SerpApi Google Travel Explore +
   Google Flights; 15 new searches a person a day, a repeat within 6 hours is free; nothing saved with the person's name — hub_perks.sql).
   The hub never books or pays: every result links to Google Flights. */
(function(){
const PF = { tab:"explore", ex:null, rt:null, lim:null, busy:false, f:{} };
const CSS = `.prk .tabs{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap}.prk .tabs button{border:1px solid var(--line,#d1d5db);background:none;border-radius:999px;padding:6px 14px;cursor:pointer;font:inherit}
.prk .tabs button.on{background:var(--forest-2,#2f5d3a);color:#fff;border-color:transparent}
.prk .frm{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end}.prk .frm label{display:flex;flex-direction:column;gap:3px;font-size:13px;color:var(--muted)}
.prk input,.prk select{font:inherit;padding:6px 8px;border:1px solid var(--line,#d1d5db);border-radius:8px;color:var(--ink);background:var(--card,#fff)}
.prk input[type=checkbox]{width:auto}.prk .chk{flex-direction:row!important;align-items:center;gap:6px!important}
.prk .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin-top:12px}
.prk .dst{border:1px solid var(--line,#e5e7eb);border-radius:14px;overflow:hidden;background:var(--card,#fff);display:flex;flex-direction:column}
.prk .dst .ph{height:96px;background:var(--line,#e5e7eb) center/cover no-repeat}.prk .dst .bd{padding:8px 10px;display:flex;flex-direction:column;gap:3px;flex:1}
.prk .dst .pr{font-size:22px;font-weight:700}.prk .sm{font-size:12px}.prk .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.prk table{width:100%;border-collapse:collapse}.prk td,.prk th{padding:6px 8px;border-bottom:1px solid var(--line,#e5e7eb);text-align:left;font-size:14px;vertical-align:top}
.prk .r{text-align:right}.prk .tow{overflow-x:auto}.prk .meter{position:relative;height:14px;border-radius:7px;background:var(--line-2,#eef0ea);margin:22px 0 8px}
.prk .meter .typ{position:absolute;top:0;bottom:0;background:var(--line,#cfd5c8);border-radius:7px}
.prk .meter .dot{position:absolute;top:-4px;width:22px;height:22px;margin-left:-11px;border-radius:50%;border:3px solid var(--card,#fff)}
.prk .meter .tag{position:absolute;top:-22px;transform:translateX(-50%);font-size:12px;font-weight:700;white-space:nowrap}
.prk .lv{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:700;font-size:13px}
.prk .lv.low{background:#e3f4e6;color:#1f6b33}.prk .lv.typical{background:var(--line-2,#eef0ea);color:var(--ink)}.prk .lv.high{background:#fde5e3;color:#a1261b}
@media (prefers-color-scheme: dark){.prk .lv.low{background:#1f3a26;color:#9fe0ad}.prk .lv.high{background:#45201c;color:#f5aaa2}}
@media (max-width:640px){.prk .grid{grid-template-columns:1fr 1fr}.prk .dst .ph{height:72px}}`;
let cssOn = false;
const css = () => { if(cssOn) return; cssOn = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); };
const money = n => n == null ? "—" : "$" + Math.round(+n).toLocaleString();
const hrs = m => m == null ? "" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
const stopTx = s => s == null ? "" : s === 0 ? "nonstop" : s === 1 ? "1 stop" : s + " stops";
const dshort = k => k ? new Date(k.slice(0, 10) + "T12:00:00Z").toLocaleDateString([], { timeZone:"UTC", weekday:"short", month:"short", day:"numeric" }) : "";
const ttime = s => { const m = /(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})/.exec(s || ""); if(!m) return esc(s || "");
  const h = +m[2]; return `${dshort(m[1])} ${(h % 12) || 12}:${m[3]} ${h < 12 ? "am" : "pm"}`; };
const when = t => new Date(t).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
const MONTHS = () => { const out = [], d = new Date(); for(let i = 0; i < 6; i++){ const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
  out.push([x.getMonth() + 1, x.toLocaleDateString([], { month:"long" })]); } return out; };
const KINDS = [["popular", "Popular"], ["beaches", "Beaches"], ["outdoors", "Outdoors"], ["skiing", "Skiing"], ["museums", "Museums"], ["history", "History"]];

async function call(body){
  const { data:{ session } } = await sb.auth.getSession();
  const r = await fetch(MM_CONFIG.url + "/functions/v1/perks-flights", { method:"POST", headers:{ "content-type":"application/json", apikey:MM_CONFIG.anonKey,
    authorization:"Bearer " + (session ? session.access_token : MM_CONFIG.anonKey) }, body:JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok:false, error:"No answer from the hub. Check your signal and try again." }));
  if(j.limits) PF.lim = j.limits;
  return j;
}
const val = id => (document.getElementById(id) || {}).value || "";
const travelers = p => `<label>Adults<select id="${p}ad">${[1,2,3,4,5,6].map(n => `<option ${n === +(PF.f[p + "ad"] || 1) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
  <label>Kids<select id="${p}ch">${[0,1,2,3,4,5,6].map(n => `<option ${n === +(PF.f[p + "ch"] || 0) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
  <label class="chk"><input type="checkbox" id="${p}ns" ${PF.f[p + "ns"] ? "checked" : ""}> Nonstop only</label>`;
const keep = ids => ids.forEach(id => { const el = document.getElementById(id); if(el) PF.f[id] = el.type === "checkbox" ? el.checked : el.value; });

function exploreForm(){
  const f = PF.f;
  return `<p class="muted" style="margin:0 0 10px">The cheapest round trips Google Flights can find from home, for the month and trip length you pick.</p>
  <div class="frm"><label>From (airport codes)<input id="exfr" value="${esc(f.exfr || "SLC")}" size="12" placeholder="SLC"></label>
    <label>When<select id="exmo"><option value="0">Any time, next 6 months</option>${MONTHS().map(([n, l]) => `<option value="${n}" ${+f.exmo === n ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label>Trip length<select id="exdu">${[[1, "A weekend"], [2, "About a week"], [3, "About 2 weeks"]].map(([n, l]) => `<option value="${n}" ${+(f.exdu || 2) === n ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label>Kind of trip<select id="exin">${KINDS.map(([k, l]) => `<option value="${k}" ${f.exin === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label>Most per ticket<input id="exmp" type="number" min="0" step="25" value="${esc(f.exmp || "")}" placeholder="any" style="width:90px"></label>
    ${travelers("ex")}
    <label>Somewhere specific? (optional)<input id="exto" value="${esc(f.exto || "")}" size="8" placeholder="e.g. HNL"></label>
    <button class="btn primary" id="exgo" ${PF.busy ? "disabled" : ""}>${PF.busy ? "Searching…" : "Find cheap trips"}</button></div>
  <p class="muted sm" style="margin:6px 0 0">Tip: SLC,PVU,OGD also checks Provo and Ogden. "Somewhere specific" shows the cheapest dates to that one place.</p>`;
}

function exploreOut(){
  const x = PF.ex; if(!x) return "";
  if(x.error) return `<p style="margin-top:12px;color:#b42318;font-weight:600">${esc(x.error)}</p>`;
  const all = x.result.destinations || [], scope = PF.f.exsc || "all";
  const list = all.filter(d => scope === "all" || (scope === "us" ? d.country === "United States" : d.country !== "United States"));
  return `<div class="row" style="margin-top:14px;justify-content:space-between"><b>${list.length} places${all.length !== list.length ? ` of ${all.length}` : ""}, cheapest first</b>
    <label class="row sm">Show <select id="exsc"><option value="all">Everywhere</option><option value="us" ${scope === "us" ? "selected" : ""}>In the U.S.</option><option value="abroad" ${scope === "abroad" ? "selected" : ""}>Outside the U.S.</option></select></label></div>
  ${list.length ? `<div class="grid">${list.map((d, i) => `<div class="dst"><div class="ph" style="${d.thumb ? `background-image:url('${esc(d.thumb)}')` : ""}"></div><div class="bd">
      <b>${esc(d.name)}</b><span class="muted sm">${esc(d.country || "")}${d.airport ? " · " + esc(d.airport) : ""}</span>
      <span class="pr">${money(d.price)}</span><span class="sm">${d.start ? `${dshort(d.start)}${d.end ? " – " + dshort(d.end) : ""}` : ""}</span>
      <span class="muted sm">${esc([d.airline, stopTx(d.stops), hrs(d.minutes)].filter(Boolean).join(" · "))}</span>
      <div class="row" style="margin-top:auto;padding-top:6px">${d.airport && d.start ? `<button class="btn small" data-ck="${i}">Check this trip</button>` : ""}${d.link ? `<a class="sm" href="${esc(d.link)}" target="_blank" rel="noopener">Google Flights ↗</a>` : ""}</div></div></div>`).join("")}</div>`
    : `<p class="muted">Nothing found. Try another month, a longer trip, or no price limit.</p>`}
  ${foot(x)}`;
}

function routeForm(){
  const f = PF.f, t = new Date().toLocaleDateString("en-CA");
  return `<p class="muted" style="margin:0 0 10px">Flights for exact dates, and whether Google says that price is low, typical or high for the route.</p>
  <div class="frm"><label>From<input id="rtfr" value="${esc(f.rtfr || "SLC")}" size="10"></label>
    <label>To (airport code)<input id="rtto" value="${esc(f.rtto || "")}" size="10" placeholder="e.g. LAX"></label>
    <label>Leave<input id="rtout" type="date" min="${t}" value="${esc(f.rtout || "")}"></label>
    <label>Come back (empty = one way)<input id="rtret" type="date" min="${t}" value="${esc(f.rtret || "")}"></label>
    ${travelers("rt")}
    <button class="btn primary" id="rtgo" ${PF.busy ? "disabled" : ""}>${PF.busy ? "Searching…" : "Check prices"}</button></div>`;
}

// typical range bar with today's lowest price marked (Google's price insights)
function meter(r){
  if(!r.range || r.range[0] == null || r.lowest == null) return "";
  const lo = Math.min(r.range[0], r.lowest) * 0.8, hi = Math.max(r.range[1], r.lowest) * 1.15, pc = v => ((v - lo) / (hi - lo) * 100).toFixed(1);
  const col = r.level === "low" ? "#2e8b47" : r.level === "high" ? "#c0392b" : "var(--blue,#3b6fb6)";
  return `<div class="meter" role="img" aria-label="Lowest ${money(r.lowest)}; usually ${money(r.range[0])} to ${money(r.range[1])}">
    <div class="typ" style="left:${pc(r.range[0])}%;width:${(pc(r.range[1]) - pc(r.range[0])).toFixed(1)}%" title="Usually ${money(r.range[0])}–${money(r.range[1])}"></div>
    <div class="dot" style="left:${pc(r.lowest)}%;background:${col}"></div><div class="tag" style="left:${pc(r.lowest)}%">${money(r.lowest)}</div></div>
    <div class="row sm muted" style="justify-content:space-between"><span>Usually ${money(r.range[0])} – ${money(r.range[1])}</span></div>`;
}

// lowest price Google saw for this trip over the last ~60 days (one series, hover a point for its date and price)
function history(h){
  if(!h || h.length < 3) return "";
  const W = 600, H = 120, P = 6, ps = h.map(p => +p[1]), mn = Math.min(...ps), mx = Math.max(...ps), sp = mx - mn || 1;
  const xy = h.map((p, i) => [P + i * (W - 2 * P) / (h.length - 1), H - P - (p[1] - mn) / sp * (H - 2 * P)]);
  const day = t => new Date(t * 1000).toLocaleDateString([], { month:"short", day:"numeric" });
  return `<div style="margin-top:14px"><b class="sm">Price over the last ${h.length} days</b>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:110px;display:block" role="img" aria-label="Price from ${money(ps[0])} to ${money(ps[ps.length - 1])}, low ${money(mn)}, high ${money(mx)}">
      <line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" stroke="var(--line,#e5e7eb)" vector-effect="non-scaling-stroke"/>
      <polyline fill="none" stroke="var(--forest-2,#2f5d3a)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${xy.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}"/>
      ${xy.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="7" fill="transparent"><title>${day(h[i][0])}: ${money(h[i][1])}</title></circle>`).join("")}
    </svg><div class="row sm muted" style="justify-content:space-between"><span>${day(h[0][0])}</span><span>low ${money(mn)} · high ${money(mx)}</span><span>${day(h[h.length - 1][0])}</span></div></div>`;
}

function routeOut(){
  const x = PF.rt; if(!x) return "";
  if(x.error) return `<p style="margin-top:12px;color:#b42318;font-weight:600">${esc(x.error)}</p>`;
  const r = x.result, LV = { low:"Low price", typical:"Typical price", high:"High price" };
  return `<div class="card" style="margin-top:14px">
    <div class="row" style="justify-content:space-between"><div><span class="muted sm">Cheapest found</span><div style="font-size:28px;font-weight:700">${money(r.lowest ?? (r.flights[0] || {}).price)}</div></div>
      ${r.level ? `<span class="lv ${esc(r.level)}">${esc(LV[r.level] || r.level)}${r.level === "low" ? " ✓" : r.level === "high" ? " ↑" : ""}</span>` : ""}</div>
    ${meter(r)}${history(r.history)}
    <p class="muted sm" style="margin:8px 0 0">${(+PF.f.rtad || 1) + (+PF.f.rtch || 0) > 1 ? "Prices are the total for all travelers" : "Price for one traveler"}, ${PF.f.rtret ? "round trip" : "one way"}, economy, before bag fees.</p></div>
  ${r.flights.length ? `<div class="tow"><table style="margin-top:10px"><tr><th>Price</th><th>Airline</th><th>Leaves</th><th>Arrives</th><th>Stops</th><th>Time</th></tr>
    ${r.flights.map(f => `<tr><td><b>${money(f.price)}</b>${f.best ? ` <span class="pill">Best</span>` : ""}</td><td>${esc(f.airlines.join(", "))}</td>
      <td>${ttime(f.depart)} <span class="muted sm">${esc(f.from || "")}</span></td><td>${ttime(f.arrive)} <span class="muted sm">${esc(f.to || "")}</span></td>
      <td>${stopTx(f.stops)}${f.via.length ? ` <span class="muted sm">via ${esc(f.via.join(", "))}</span>` : ""}</td><td>${hrs(f.minutes)}</td></tr>`).join("")}</table></div>`
    : `<p class="muted">No flights found for those dates.</p>`}
  <p style="margin:10px 0 0"><a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener">See it and book on Google Flights ↗</a></p>${foot(x)}`;
}

const foot = x => `<p class="muted sm" style="margin:10px 0 0">Source: Google Flights (through SerpApi), ${x.cached ? "saved search from " : "checked at "}${when(x.at)}. Prices change fast; check the price on the airline's site before you book.</p>`;

function draw(v){
  if(current() !== "stf_perks") return;
  const L = PF.lim;
  v.innerHTML = `<div class="page prk wide"><h2 style="margin:0 0 4px">Perks</h2>
    <p class="muted" style="margin:0 0 12px">Extras for the Moose team.</p>
    <div class="card"><div class="row" style="justify-content:space-between"><b style="font-size:17px">✈️ Cheap flights</b>
      ${L ? `<span class="muted sm">${L.left} of ${L.per_day} searches left today</span>` : ""}</div>
      <div class="tabs" style="margin-top:10px"><button data-tab="explore" class="${PF.tab === "explore" ? "on" : ""}">Where can I go cheap?</button><button data-tab="route" class="${PF.tab === "route" ? "on" : ""}">Check one trip</button></div>
      ${PF.tab === "explore" ? exploreForm() + exploreOut() : routeForm() + routeOut()}
      <p class="muted sm" style="margin:12px 0 0">Your searches aren't saved with your name. The hub doesn't book or pay for flights; you book your own trip.</p></div></div>`;
  v.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { keep(IDS); PF.tab = b.dataset.tab; draw(v); });
  const sc = v.querySelector("#exsc"); if(sc) sc.onchange = () => { keep(IDS); PF.f.exsc = sc.value; draw(v); };
  v.querySelectorAll("[data-ck]").forEach(b => b.onclick = () => { const d = PF.ex.result.destinations.filter(d => (PF.f.exsc || "all") === "all" || ((PF.f.exsc === "us") === (d.country === "United States")))[+b.dataset.ck];
    keep(IDS); Object.assign(PF.f, { rtfr:PF.f.exfr || "SLC", rtto:d.airport, rtout:d.start, rtret:d.end || "", rtad:PF.f.exad, rtch:PF.f.exch, rtns:PF.f.exns }); PF.tab = "route"; PF.rt = null; draw(v); window.scrollTo(0, 0); });
  const go = async (btn, body, slot) => { keep(IDS); PF.busy = true; draw(v);
    const j = await call(body).catch(e => ({ ok:false, error:String(e.message || e) })); PF.busy = false;
    PF[slot] = j.ok ? j : { error:j.error || "Something went wrong. Try again." }; draw(v); };
  const ex = v.querySelector("#exgo"); if(ex) ex.onclick = () => go(ex, { action:"explore", from:val("exfr"), to:val("exto"), month:val("exmo"), duration:val("exdu"),
    interest:val("exin"), max_price:val("exmp"), adults:val("exad"), children:val("exch"), stops:document.getElementById("exns").checked ? 1 : 0 }, "ex");
  const rt = v.querySelector("#rtgo"); if(rt) rt.onclick = () => go(rt, { action:"route", from:val("rtfr"), to:val("rtto"), out:val("rtout"), ret:val("rtret"),
    adults:val("rtad"), children:val("rtch"), stops:document.getElementById("rtns").checked ? 1 : 0 }, "rt");
}
const IDS = ["exfr", "exmo", "exdu", "exin", "exmp", "exad", "exch", "exns", "exto", "rtfr", "rtto", "rtout", "rtret", "rtad", "rtch", "rtns"];

window.perksView = async function(v){
  css(); draw(v);
  if(!PF.lim){ const j = await call({ action:"limits" }).catch(() => null); if(j && j.ok) draw(v); }
};
})();
