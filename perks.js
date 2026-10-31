/* perks.js — Staffing ▸ Perks (Brandon 2026-10-30: "lets have a staffing: Perks, but only if we can build some type of cheap flight
   planner with our serpapi" → "make this tool awesome and easy to use. let them search by cities … highlight their PTO in the top right").
   Route #/stf_perks, made in hub.html after hub_my_desks; follows the Staffing desk (hub_can('staffing')).
   Loaded by hub.html; uses its sb / esc / current / MM_CONFIG. Data: Edge Function perks-flights (SerpApi Google Travel Explore +
   Google Flights; no limit per person since 2026-10-30 (Brandon), a repeat within 6 hours comes from the cache; nothing saved with the
   person's name). City search = airports.json (OurAirports, public domain; large + medium airports with scheduled service) + PLACES
   below (popular places whose airport has another town's name, and cities with several airports). PTO = my_pto() (your own row only).
   2026-10-31 (Brandon): "Compare with Provo" (on by default) runs every search from both airports at once and shows them side by side.
   The hub never books or pays: every result links to Google Flights. */
(function(){
const PF = { tab:"find", busy:"", from:{ label:"Salt Lake City (SLC)", codes:["SLC"] }, to:null, s:[], rterr:"", view:[], f:{ mo:"0", du:"2", ad:"1", ch:"0", in:"popular", cmp:true }, air:null, pto:undefined };
// IATA codes; groups = every main airport of that place (explore uses the first one)
const PLACES = [["Hawaii (all islands)", "HNL,OGG,KOA,LIH", "Oahu Maui Kauai Big Island Kona"], ["Maui", "OGG", "Kahului Hawaii"], ["Kauai", "LIH", "Lihue Hawaii"],
  ["Big Island (Kona)", "KOA", "Hawaii Kailua"], ["Oahu (Honolulu)", "HNL", "Hawaii Waikiki"], ["New York City (all airports)", "JFK,LGA,EWR", "NYC Manhattan Newark"],
  ["Washington, DC (all airports)", "DCA,IAD,BWI", "DC Baltimore"], ["Chicago (all airports)", "ORD,MDW", ""], ["Los Angeles area (all airports)", "LAX,BUR,LGB,SNA,ONT", "Southern California Orange County Disneyland Anaheim"],
  ["San Francisco Bay Area (all airports)", "SFO,OAK,SJC", "Bay Area San Jose Oakland"], ["Miami + Fort Lauderdale", "MIA,FLL", "South Florida"], ["Houston (all airports)", "IAH,HOU", ""],
  ["Dallas (all airports)", "DFW,DAL", "Fort Worth"], ["Orlando (Disney World)", "MCO", "Disney World Universal"], ["London (all airports)", "LHR,LGW,STN,LTN,LCY", "England UK"],
  ["Paris (all airports)", "CDG,ORY", "France"], ["Tokyo (all airports)", "HND,NRT", "Japan"], ["Cabo San Lucas", "SJD", "Los Cabos Mexico"], ["Puerto Vallarta", "PVR", "Mexico"]];
const POP = [["Anywhere", null], ["Hawaii", 0], ["Las Vegas", "LAS"], ["L.A. area", 8], ["Cancún", "CUN"], ["Orlando", 13], ["New York", 5], ["Cabo", 17], ["Phoenix", "PHX"], ["Seattle", "SEA"]];
const CSS = `.prk .hd{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;justify-content:space-between;margin:0 0 12px}
.prk .pto{background:#e8f5ea;border:1px solid #bfe0c6;border-radius:14px;padding:10px 14px;min-width:220px;max-width:340px;color:#1f4d2a}
.prk .pto .n{font-size:24px;font-weight:800;line-height:1.1}.prk .pto a{color:#1f6b33;font-weight:700}
@media (prefers-color-scheme: dark){.prk .pto{background:#1d3324;border-color:#2f5d3a;color:#cfeed6}.prk .pto a{color:#9fe0ad}}
.prk .tabs{display:flex;gap:6px;margin:10px 0 12px;flex-wrap:wrap}.prk .tabs button,.prk .chip{border:1px solid var(--line,#d1d5db);background:var(--card,#fff);color:var(--ink);border-radius:999px;padding:6px 14px;cursor:pointer;font:inherit}
.prk .tabs button.on,.prk .chip.on{background:var(--forest-2,#2f5d3a);color:#fff;border-color:transparent}.prk .chip{padding:4px 12px;font-size:14px}
.prk .chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0}
.prk .lbl{font-size:13px;color:var(--muted);margin:12px 0 4px;font-weight:600}
.prk .cities{display:grid;grid-template-columns:1fr 1fr;gap:12px}.prk .city{position:relative}
.prk .city input{width:100%;box-sizing:border-box;font-size:17px;padding:10px 12px}
.prk .sug{position:absolute;z-index:30;left:0;right:0;top:100%;margin-top:2px;background:var(--card,#fff);border:1px solid var(--line,#d1d5db);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);max-height:320px;overflow:auto}
.prk .sug div{padding:8px 12px;cursor:pointer;font-size:14px}.prk .sug div.on,.prk .sug div:hover{background:var(--line-2,#eef0ea)}.prk .sug b{margin-right:6px}
.prk .frm{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end}.prk .frm label{display:flex;flex-direction:column;gap:3px;font-size:13px;color:var(--muted)}
.prk input,.prk select{font:inherit;padding:6px 8px;border:1px solid var(--line,#d1d5db);border-radius:8px;color:var(--ink);background:var(--card,#fff)}
.prk input[type=checkbox]{width:auto}.prk .chk{flex-direction:row!important;align-items:center;gap:6px!important}
.prk details{margin-top:10px}.prk summary{cursor:pointer;color:var(--muted);font-size:14px}
.prk .go{font-size:17px;padding:10px 26px;margin-top:14px}
.prk .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin-top:12px}
.prk .dst{border:1px solid var(--line,#e5e7eb);border-radius:14px;overflow:hidden;background:var(--card,#fff);display:flex;flex-direction:column}
.prk .dst .ph{height:96px;background:var(--line,#e5e7eb) center/cover no-repeat}.prk .dst .bd{padding:8px 10px;display:flex;flex-direction:column;gap:3px;flex:1}
.prk .dst .pr{font-size:22px;font-weight:700}.prk .sm{font-size:12px}.prk .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.prk table{width:100%;border-collapse:collapse}.prk td,.prk th{padding:6px 8px;border-bottom:1px solid var(--line,#e5e7eb);text-align:left;font-size:14px;vertical-align:top}
.prk .tow{overflow-x:auto}.prk .meter{position:relative;height:14px;border-radius:7px;background:var(--line-2,#eef0ea);margin:22px 0 8px}
.prk .meter .typ{position:absolute;top:0;bottom:0;background:var(--line,#cfd5c8);border-radius:7px}
.prk .meter .dot{position:absolute;top:-4px;width:22px;height:22px;margin-left:-11px;border-radius:50%;border:3px solid var(--card,#fff)}
.prk .meter .tag{position:absolute;top:-22px;transform:translateX(-50%);font-size:12px;font-weight:700;white-space:nowrap}
.prk .lv{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:700;font-size:13px}
.prk .lv.low{background:#e3f4e6;color:#1f6b33}.prk .lv.typical{background:var(--line-2,#eef0ea);color:var(--ink)}.prk .lv.high{background:#fde5e3;color:#a1261b}
@media (prefers-color-scheme: dark){.prk .lv.low{background:#1f3a26;color:#9fe0ad}.prk .lv.high{background:#45201c;color:#f5aaa2}}
.prk .best{border:2px solid var(--forest-2,#2f5d3a);border-radius:14px;padding:12px 14px;margin-top:14px}
.prk .cmp2{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}.prk .cmp2 .best{margin-top:0}
.prk .from{font-weight:800;font-size:15px;margin:0 0 6px;color:var(--forest-2,#2f5d3a)}.prk .cmpl{margin:14px 0 10px;font-size:15px}
.prk .cmpc{margin-top:6px;font-size:14px;color:var(--ink)!important}
.prk .cr{border-top:1px solid var(--line,#e5e7eb);padding:6px 0 2px;margin-top:4px}.prk .cr .pr{font-size:20px}.prk .cr.win .pr{color:#1f6b33}
@media (prefers-color-scheme: dark){.prk .cr.win .pr{color:#9fe0ad}}
@media (max-width:900px){.prk .cmp2{grid-template-columns:1fr}}
@media (max-width:640px){.prk .grid{grid-template-columns:1fr 1fr}.prk .dst .ph{height:72px}.prk .cities{grid-template-columns:1fr}.prk .pto{max-width:none;width:100%}}`;
let cssOn = false;
const css = () => { if(cssOn) return; cssOn = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); };
const money = n => n == null ? "—" : "$" + Math.round(+n).toLocaleString();
const hrs = m => m == null ? "" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
const stopTx = s => s == null ? "" : s === 0 ? "nonstop" : s === 1 ? "1 stop" : s + " stops";
const dshort = k => k ? new Date(k.slice(0, 10) + "T12:00:00Z").toLocaleDateString([], { timeZone:"UTC", weekday:"short", month:"short", day:"numeric" }) : "";
const ttime = s => { const m = /(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})/.exec(s || ""); if(!m) return esc(s || "");
  const h = +m[2]; return `${dshort(m[1])} ${(h % 12) || 12}:${m[3]} ${h < 12 ? "am" : "pm"}`; };
const when = t => new Date(t).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MONTHS = () => { const out = [], d = new Date(); for(let i = 0; i < 6; i++){ const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
  out.push([String(x.getMonth() + 1), x.toLocaleDateString([], { month:"short" })]); } return out; };
const KINDS = [["popular", "Popular"], ["beaches", "Beaches"], ["outdoors", "Outdoors"], ["skiing", "Skiing"], ["museums", "Museums"], ["history", "History"]];

async function call(body){
  const { data:{ session } } = await sb.auth.getSession();
  const r = await fetch(MM_CONFIG.url + "/functions/v1/perks-flights", { method:"POST", headers:{ "content-type":"application/json", apikey:MM_CONFIG.anonKey,
    authorization:"Bearer " + (session ? session.access_token : MM_CONFIG.anonKey) }, body:JSON.stringify(body) });
  return r.json().catch(() => ({ ok:false, error:"No answer from the hub. Check your signal and try again." }));
}

/* ---------- city search ---------- */
async function airports(){
  if(PF.air) return PF.air;
  const j = await fetch("airports.json").then(r => r.json()).catch(() => ({ airports:[] }));
  PF.air = (j.airports || []).map(a => ({ code:a[0], city:a[1], name:a[2], reg:a[3], big:a[4], hay:fold(`${a[0]} ${a[1]} ${a[2]} ${a[3]} ${a[5]}`), c:fold(a[1]) }));
  PF.airSrc = j.source || "";
  return PF.air;
}
const placeOpt = p => ({ label:p[0], codes:p[1].split(","), sub:p[1].replace(/,/g, ", ") });
function suggest(q){
  q = fold(q).trim(); if(!q) return [];
  const out = [];
  PLACES.forEach(p => { if(fold(p[0] + " " + p[2] + " " + p[1]).includes(q)) out.push(Object.assign(placeOpt(p), { score:fold(p[0]).startsWith(q) ? 0 : 1 })); });
  (PF.air || []).forEach(a => {
    let s = a.code.toLowerCase() === q ? -1 : a.c.startsWith(q) ? 2 : a.c.includes(q) ? 3 : a.hay.includes(q) ? 4 : 9;
    if(s < 9) out.push({ label:`${a.city || a.name} (${a.code})`, codes:[a.code], sub:`${a.name} · ${a.reg}`, score:s - a.big * 0.5 });
  });
  return out.sort((a, b) => a.score - b.score).slice(0, 8);
}
function cityBox(id, key, ph){
  const cur = PF[key];
  return `<div class="city"><input id="${id}" autocomplete="off" placeholder="${esc(ph)}" value="${esc(cur ? cur.label : "")}" aria-autocomplete="list"><div class="sug" id="${id}s" hidden></div></div>`;
}
function wireCity(v, id, key){
  const inp = v.querySelector("#" + id), box = v.querySelector("#" + id + "s"); if(!inp) return;
  let list = [], at = 0;
  const show = () => { box.hidden = !list.length; box.innerHTML = list.map((o, i) => `<div data-i="${i}" class="${i === at ? "on" : ""}"><b>${esc(o.label)}</b><span class="muted sm">${esc(o.sub)}</span></div>`).join(""); };
  const pick = o => { const was = PF[key] && PF[key].label; PF[key] = o ? { label:o.label, codes:o.codes } : null; inp.value = o ? o.label : ""; list = []; show();
    if(was !== (o && o.label)){ clear(); draw(v); } };   // new From/To: old results (and the Compare label) no longer fit
  inp.oninput = async () => { await airports(); list = suggest(inp.value); at = 0; show(); };
  inp.onfocus = () => { if(!PF.air) airports(); inp.select(); };
  inp.onkeydown = e => { if(box.hidden) return;
    if(e.key === "ArrowDown"){ at = Math.min(list.length - 1, at + 1); show(); e.preventDefault(); }
    else if(e.key === "ArrowUp"){ at = Math.max(0, at - 1); show(); e.preventDefault(); }
    else if(e.key === "Enter"){ pick(list[at]); e.preventDefault(); } else if(e.key === "Escape"){ list = []; show(); } };
  box.onmousedown = e => { const d = e.target.closest("[data-i]"); if(d){ e.preventDefault(); pick(list[+d.dataset.i]); } };
  inp.onblur = () => setTimeout(() => { if(!inp.isConnected) return;
    if(list.length && inp.value.trim() && (!PF[key] || PF[key].label !== inp.value)) pick(list[0]);
    else if(!inp.value.trim() && key === "to"){ if(PF.to){ PF.to = null; clear(); draw(v); } }
    else if(PF[key]) inp.value = PF[key].label;
    list = []; show(); }, 150);
}

/* ---------- PTO (top right) ---------- */
function ptoBox(){
  const b = (PF.pto || [])[0]; if(!b) return "";
  const h = b.calc_hours != null ? +b.calc_hours : b.hours != null ? +b.hours : null; if(h == null) return "";
  const r = Math.round(h * 10) / 10, days = Math.floor(h / 8 * 2) / 2;
  return `<div class="pto"><div class="sm" style="font-weight:700">🌴 ${b.salaried ? "Your salaried time off" : "Your paid time off"}</div>
    <div class="n">${r.toLocaleString()} hours</div><div>${days >= 1 ? `That's about <b>${days.toLocaleString()} day${days === 1 ? "" : "s"}</b> off. Use it!` : "Keep earning; you'll have a day soon."}</div>
    <div style="margin-top:4px"><a href="#/cal_off">Request time off →</a></div>
    <div class="sm" style="opacity:.75;margin-top:4px">From your PTO balance${b.as_of ? `, updated ${esc(new Date(b.as_of).toLocaleDateString([], { month:"short", day:"numeric" }))}` : ""}.</div></div>`;
}

/* ---------- results ---------- */
function meter(r){
  if(!r.range || r.range[0] == null || r.lowest == null) return "";
  const lo = Math.min(r.range[0], r.lowest) * 0.8, hi = Math.max(r.range[1], r.lowest) * 1.15, pc = v => ((v - lo) / (hi - lo) * 100).toFixed(1);
  const col = r.level === "low" ? "#2e8b47" : r.level === "high" ? "#c0392b" : "var(--blue,#3b6fb6)";
  return `<div class="meter" role="img" aria-label="Lowest ${money(r.lowest)}; usually ${money(r.range[0])} to ${money(r.range[1])}">
    <div class="typ" style="left:${pc(r.range[0])}%;width:${(pc(r.range[1]) - pc(r.range[0])).toFixed(1)}%" title="Usually ${money(r.range[0])}–${money(r.range[1])}"></div>
    <div class="dot" style="left:${pc(r.lowest)}%;background:${col}"></div><div class="tag" style="left:${pc(r.lowest)}%">${money(r.lowest)}</div></div>
    <div class="sm muted">Usually ${money(r.range[0])} – ${money(r.range[1])} for this trip</div>`;
}
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
const foot = x => `<p class="muted sm" style="margin:10px 0 0">Source: Google Flights (through SerpApi), ${x.cached ? "saved search from " : "checked at "}${when(x.at)}. Prices change fast; check the price on the airline's site before you book.</p>`;
const err = e => `<p style="margin-top:12px;color:#b42318;font-weight:600">${esc(e)}</p>`;
const people = () => (+PF.f.ad || 1) + (+PF.f.ch || 0);

/* ---------- SLC vs Provo (Brandon 2026-10-31: "can we compare provo side by side with slc") ----------
   PF.s = one slot per "flying from" airport: [{o, ex, picked, rt, out, ret}]. With Compare on there are two slots (your From + Provo,
   or + Salt Lake City when From is Provo) and every search runs for both at the same time. */
const SLC = { label:"Salt Lake City (SLC)", codes:["SLC"] }, PVU = { label:"Provo (PVU)", codes:["PVU"] };
const oname = o => o.label.replace(/ \(.*\)$/, "");
const other = () => PF.from && PF.from.codes.join() === "PVU" ? SLC : PVU;
const origins = () => { const a = PF.from && PF.from.codes.length ? PF.from : SLC; return PF.f.cmp && a.codes.join() !== other().codes.join() ? [a, other()] : [a]; };
const cmpOn = () => PF.s.length === 2;
const rtPrice = x => x && x.result ? (x.result.lowest ?? (x.result.flights[0] || {}).price ?? null) : null;
function cmpLine(pa, pb, a, b, note){
  if(pa == null || pb == null) return pa == null && pb == null ? "" : `<p class="cmpl">${esc(oname(pa == null ? b : a))} has flights; ${esc(oname(pa == null ? a : b))} doesn't for this search.</p>`;
  const d = Math.round(Math.abs(pa - pb));
  return `<p class="cmpl">${d < 1 ? "Same price from both airports." : `✈️ <b>${esc(oname(pa < pb ? a : b))} is ${money(d)} cheaper</b> (${money(Math.min(pa, pb))} vs ${money(Math.max(pa, pb))}).`}${note ? ` <span class="muted sm">${note}</span>` : ""}</p>`;
}

function routeHtml(x, out, ret, compact){
  if(!x) return ""; if(x.error) return err(x.error);
  const r = x.result, LV = { low:"Low price", typical:"Typical price", high:"High price" }, fl = compact ? r.flights.slice(0, 5) : r.flights;
  return `<div class="row" style="justify-content:space-between;margin-top:12px"><div><span class="muted sm">Cheapest flight for ${esc(dshort(out))}${ret ? " – " + esc(dshort(ret)) : " (one way)"}</span>
      <div style="font-size:28px;font-weight:800">${money(rtPrice(x))}</div></div>
      ${r.level ? `<span class="lv ${esc(r.level)}">${esc(LV[r.level] || r.level)}${r.level === "low" ? " ✓" : r.level === "high" ? " ↑" : ""}</span>` : ""}</div>
    ${meter(r)}${compact ? "" : history(r.history)}
    <p class="muted sm" style="margin:8px 0 0">${people() > 1 ? "Prices are the total for all travelers" : "Price for one traveler"}, ${ret ? "round trip" : "one way"}, economy, before bag fees.</p>
  ${fl.length ? `<div class="tow"><table style="margin-top:10px"><tr><th>Price</th><th>Airline</th><th>Leaves</th><th>Arrives</th><th>Stops</th><th>Time</th></tr>
    ${fl.map(f => `<tr><td><b>${money(f.price)}</b>${f.best ? ` <span class="pill">Best</span>` : ""}</td><td>${esc(f.airlines.join(", "))}</td>
      <td>${ttime(f.depart)} <span class="muted sm">${esc(f.from || "")}</span></td><td>${ttime(f.arrive)} <span class="muted sm">${esc(f.to || "")}</span></td>
      <td>${stopTx(f.stops)}${f.via.length ? ` <span class="muted sm">via ${esc(f.via.join(", "))}</span>` : ""}</td><td>${hrs(f.minutes)}</td></tr>`).join("")}</table></div>`
    : `<p class="muted">No flights found for those dates.</p>`}${compact && r.flights.length > 5 ? `<p class="muted sm">+ ${r.flights.length - 5} more on Google Flights</p>` : ""}
  <p style="margin:10px 0 0"><a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener">See it and book on Google Flights ↗</a></p>${foot(x)}`;
}

// one place: cheapest dates from this airport + the flights for them
function cityCard(s, two){
  const head = two ? `<div class="from">From ${esc(s.o.label)}</div>` : "";
  if(!s.ex) return "";
  if(s.ex.error) return `<div class="best">${head}${err(s.ex.error)}</div>`;
  const d = s.picked; if(!d) return `<div class="best">${head}<p class="muted">Google didn't find a trip from ${esc(oname(s.o))} for that time.</p></div>`;
  return `<div class="best">${head}<div class="row" style="justify-content:space-between"><div><span class="muted sm">Cheapest dates to ${esc(PF.to ? PF.to.label : d.name)}</span>
      <div style="font-size:20px;font-weight:800">${esc(dshort(d.start))}${d.end ? " – " + esc(dshort(d.end)) : ""}</div>
      <span class="muted sm">${esc([d.airline, stopTx(d.stops), hrs(d.minutes)].filter(Boolean).join(" · "))}</span></div>
      <div style="font-size:28px;font-weight:800">${money(d.price)}</div></div>
    ${PF.busy === "rt" && !s.rt ? `<p class="muted">Getting the flights for those dates…</p>` : routeHtml(s.rt, s.out, s.ret, two)}</div>`;
}

function findOut(){
  const s0 = PF.s[0]; if(!s0 || !s0.ex) return "";
  const two = cmpOn();
  if(PF.to){
    const pr = s => rtPrice(s.rt) ?? (s.picked ? s.picked.price : null);
    return `${two && PF.busy !== "rt" ? cmpLine(pr(PF.s[0]), pr(PF.s[1]), PF.s[0].o, PF.s[1].o, "Each airport shows its own cheapest dates, so the dates can differ.") : ""}
      <div class="${two ? "cmp2" : ""}">${PF.s.map(s => cityCard(s, two)).join("")}</div>
      <p class="sm" style="margin:10px 0 0"><a href="#" id="otherdates">${two ? "Want the same dates from both? Pick them yourself →" : "Want other dates? Pick them yourself →"}</a></p>`;
  }
  if(s0.ex.error && (!two || (PF.s[1].ex && PF.s[1].ex.error))) return err(s0.ex.error);
  // Anywhere: one list of places; with Compare on, each place shows both airports' price
  const map = new Map();
  PF.s.forEach((s, si) => ((s.ex && s.ex.result && s.ex.result.destinations) || []).forEach(d => {
    const k = (d.name || d.airport || "").toLowerCase(); const m = map.get(k) || { name:d.name, country:d.country, thumb:d.thumb, airport:d.airport, by:[] };
    if(!m.thumb) m.thumb = d.thumb; if(!m.by[si] || d.price < m.by[si].price) m.by[si] = d; map.set(k, m); }));
  const scope = PF.f.sc || "all", low = m => Math.min(...m.by.filter(Boolean).map(d => d.price));
  const all = [...map.values()].sort((a, b) => low(a) - low(b));
  const list = PF.view = all.filter(d => scope === "all" || (scope === "us" ? d.country === "United States" : d.country !== "United States"));
  const wins = [0, 0]; if(two) list.forEach(m => { if(m.by[0] && m.by[1]) wins[m.by[0].price <= m.by[1].price ? 0 : 1]++; else wins[m.by[0] ? 0 : 1]++; });
  const line = (m, si) => { const d = m.by[si], o = PF.s[si].o; if(!d) return two ? `<div class="cr"><b>${esc(oname(o))}</b> <span class="muted sm">no trip found</span></div>` : "";
    const win = two && m.by[0] && m.by[1] && d.price < m.by[1 - si].price;
    return `<div class="cr ${win ? "win" : ""}">${two ? `<b>${esc(oname(o))}</b> ` : ""}<span class="pr">${money(d.price)}</span>${two && d.airport ? ` <span class="muted sm">to ${esc(d.airport)}</span>` : ""}${win ? ` <span class="pill green">${money(m.by[1 - si].price - d.price)} less</span>` : ""}
      <div class="sm">${d.start ? `${dshort(d.start)}${d.end ? " – " + dshort(d.end) : ""}` : ""}</div><div class="muted sm">${esc([d.airline, stopTx(d.stops), hrs(d.minutes)].filter(Boolean).join(" · "))}</div>
      <div class="row" style="padding-top:4px">${d.airport && d.start ? `<button class="btn small" data-ck="${list.indexOf(m)}:${si}">See flights</button>` : ""}${d.link ? `<a class="sm" href="${esc(d.link)}" target="_blank" rel="noopener">Google ↗</a>` : ""}</div></div>`; };
  const fx = PF.s.map(s => s.ex).find(x => x && x.at) || s0.ex;
  return `${two ? `<p class="cmpl">Cheaper from <b>${esc(oname(PF.s[0].o))}</b> for ${wins[0]} places, from <b>${esc(oname(PF.s[1].o))}</b> for ${wins[1]}.</p>` : ""}
    <div class="row" style="margin-top:14px;justify-content:space-between"><b>${list.length} places${all.length !== list.length ? ` of ${all.length}` : ""}, cheapest first</b>
    <label class="row sm">Show <select id="exsc"><option value="all">Everywhere</option><option value="us" ${scope === "us" ? "selected" : ""}>In the U.S.</option><option value="abroad" ${scope === "abroad" ? "selected" : ""}>Outside the U.S.</option></select></label></div>
  ${list.length ? `<div class="grid">${list.map(m => `<div class="dst"><div class="ph" style="${m.thumb ? `background-image:url('${esc(m.thumb)}')` : ""}"></div><div class="bd">
      <b>${esc(m.name)}</b><span class="muted sm">${esc(m.country || "")}${m.airport ? " · " + esc(m.airport) : ""}</span>
      ${PF.s.map((s, si) => line(m, si)).join("")}</div></div>`).join("")}</div>`
    : `<p class="muted">Nothing found. Try another month, a longer trip, or no price limit.</p>`}${fx && fx.at ? foot(fx) : ""}`;
}

function datesOut(){
  const s0 = PF.s[0]; if(!s0 || PF.busy === "rt" || !s0.rt) return "";
  if(!cmpOn()) return routeHtml(s0.rt, s0.out, s0.ret);
  const [a, b] = PF.s;
  return `${cmpLine(rtPrice(a.rt), rtPrice(b.rt), a.o, b.o, "")}<div class="cmp2">${PF.s.map(s => `<div class="best"><div class="from">From ${esc(s.o.label)}</div>${routeHtml(s.rt, s.out, s.ret, true)}</div>`).join("")}</div>`;
}

/* ---------- page ---------- */
function travelers(){
  const f = PF.f;
  return `<label>Adults<select id="fad">${[1,2,3,4,5,6].map(n => `<option ${n === +f.ad ? "selected" : ""}>${n}</option>`).join("")}</select></label>
  <label>Kids<select id="fch">${[0,1,2,3,4,5,6].map(n => `<option ${n === +f.ch ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;
}
const cmpChip = () => `<label class="chk cmpc"><input type="checkbox" id="fcmp" ${PF.f.cmp ? "checked" : ""}> ↔ Compare with ${esc(oname(other()))} side by side</label>`;
const popOn = p => p === null ? !PF.to : !!PF.to && (typeof p === "number" ? PF.to.label === PLACES[p][0] : PF.to.codes.join() === p);
function findForm(){
  const f = PF.f, anyw = !PF.to;
  return `<div class="cities"><div><div class="lbl">Flying from</div>${cityBox("cfrom", "from", "City or airport")}${cmpChip()}</div>
      <div><div class="lbl">Where to?</div>${cityBox("cto", "to", "Anywhere, or type a city")}</div></div>
    <div class="chips">${POP.map(([l, p]) => `<button class="chip ${popOn(p) ? "on" : ""}" data-pop="${esc(l)}">${esc(l)}</button>`).join("")}</div>
    <div class="lbl">When</div><div class="chips">${[["0", "Any time"], ...MONTHS()].map(([k, l]) => `<button class="chip ${f.mo === k ? "on" : ""}" data-mo="${k}">${esc(l)}</button>`).join("")}</div>
    <div class="lbl">How long</div><div class="chips">${[["1", "A weekend"], ["2", "About a week"], ["3", "About 2 weeks"]].map(([k, l]) => `<button class="chip ${f.du === k ? "on" : ""}" data-du="${k}">${l}</button>`).join("")}</div>
    <div class="frm" style="margin-top:12px">${travelers()}</div>
    <details ${f.more ? "open" : ""} id="more"><summary>More options</summary><div class="frm" style="margin-top:8px">
      ${anyw ? `<label>Kind of trip<select id="fin">${KINDS.map(([k, l]) => `<option value="${k}" ${f.in === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
      <label>Most per ticket<input id="fmp" type="number" min="0" step="25" value="${esc(f.mp || "")}" placeholder="any" style="width:100px"></label>
      <label class="chk"><input type="checkbox" id="fns" ${f.ns ? "checked" : ""}> Nonstop only</label></div></details>
    <button class="btn primary go" id="fgo" ${PF.busy ? "disabled" : ""}>${PF.busy === "ex" ? "Searching…" : anyw ? "Find cheap places to go" : `Find the cheapest dates to ${esc(PF.to.label.replace(/ \(.*\)$/, ""))}`}</button>`;
}
function datesForm(){
  const f = PF.f, t = new Date().toLocaleDateString("en-CA");
  return `<p class="muted" style="margin:0 0 6px">Already know your dates? See every flight and whether the price is low, typical or high.</p>
    <div class="cities"><div><div class="lbl">Flying from</div>${cityBox("dfrom", "from", "City or airport")}${cmpChip()}</div>
      <div><div class="lbl">Flying to</div>${cityBox("dto", "to", "Type a city")}</div></div>
    <div class="frm" style="margin-top:12px"><label>Leave<input id="fout" type="date" min="${t}" value="${esc(f.out || "")}"></label>
      <label>Come back (empty = one way)<input id="fret" type="date" min="${t}" value="${esc(f.ret || "")}"></label>${travelers()}
      <label class="chk"><input type="checkbox" id="fns" ${f.ns ? "checked" : ""}> Nonstop only</label></div>
    <button class="btn primary go" id="dgo" ${PF.busy ? "disabled" : ""}>${PF.busy === "rt" ? "Searching…" : "Check prices"}</button>
    ${PF.rterr ? err(PF.rterr) : datesOut()}`;
}
function keep(v){ const g = id => v.querySelector("#" + id);
  [["fad", "ad"], ["fch", "ch"], ["fin", "in"], ["fmp", "mp"], ["fout", "out"], ["fret", "ret"]].forEach(([id, k]) => { if(g(id)) PF.f[k] = g(id).value; });
  if(g("fns")) PF.f.ns = g("fns").checked; if(g("fcmp")) PF.f.cmp = g("fcmp").checked; if(g("more")) PF.f.more = g("more").open; }
const clear = () => { PF.s = []; PF.rterr = ""; };

function draw(v){
  if(current() !== "stf_perks") return;
  v.innerHTML = `<div class="page prk wide"><div class="hd"><div><h2 style="margin:0 0 4px">Perks</h2><p class="muted" style="margin:0">Extras for the Moose team.</p></div>${ptoBox()}</div>
    <div class="card"><b style="font-size:18px">✈️ Cheap flights</b>
      <div class="tabs"><button data-tab="find" class="${PF.tab === "find" ? "on" : ""}">Find a cheap trip</button><button data-tab="dates" class="${PF.tab === "dates" ? "on" : ""}">I know my dates</button></div>
      ${PF.tab === "find" ? findForm() + findOut() : datesForm()}
      <p class="muted sm" style="margin:14px 0 0">Your searches aren't saved with your name. The hub doesn't book or pay for flights; you book your own trip.${PF.airSrc ? ` City list: ${esc(PF.airSrc)}.` : ""}</p></div></div>`;
  ["cfrom", "dfrom"].forEach(id => wireCity(v, id, "from")); ["cto", "dto"].forEach(id => wireCity(v, id, "to"));
  const on = (sel, fn) => v.querySelectorAll(sel).forEach(b => b.onclick = e => { e.preventDefault(); keep(v); fn(b); draw(v); });
  on("[data-tab]", b => { PF.tab = b.dataset.tab; clear(); });
  on("[data-mo]", b => { PF.f.mo = b.dataset.mo; });
  on("[data-du]", b => { PF.f.du = b.dataset.du; });
  on("[data-pop]", b => { const p = POP.find(x => x[0] === b.dataset.pop)[1];
    PF.to = p === null ? null : typeof p === "number" ? (o => ({ label:o.label, codes:o.codes }))(placeOpt(PLACES[p])) : { label:`${b.dataset.pop} (${p})`, codes:[p] }; clear(); });
  const cb = v.querySelector("#fcmp"); if(cb) cb.onchange = () => { keep(v); clear(); draw(v); };
  const sc = v.querySelector("#exsc"); if(sc) sc.onchange = () => { keep(v); PF.f.sc = sc.value; draw(v); };
  on("[data-ck]", b => { const [i, si] = b.dataset.ck.split(":").map(Number), m = PF.view[i], d = m.by[si];
    PF.to = { label:`${m.name} (${d.airport})`, codes:[d.airport] }; PF.f.out = d.start; PF.f.ret = d.end || ""; PF.tab = "dates"; clear(); setTimeout(() => runRoute(v), 0); });
  const od = v.querySelector("#otherdates"); if(od) od.onclick = e => { e.preventDefault(); keep(v);
    const s = PF.s.find(s => s.picked); if(s){ PF.f.out = s.picked.start; PF.f.ret = s.picked.end || ""; } PF.tab = "dates"; clear(); draw(v); };
  const fg = v.querySelector("#fgo"); if(fg) fg.onclick = () => { keep(v); runFind(v); };
  const dg = v.querySelector("#dgo"); if(dg) dg.onclick = () => { keep(v); runRoute(v); };
}
const bad = e => ({ ok:false, error:String((e && e.message) || e) });
const routeCall = (o, out, ret) => { const f = PF.f; return call({ action:"route", from:o.codes.slice(0, 6).join(","), to:PF.to.codes.slice(0, 6).join(","), out, ret, adults:f.ad, children:f.ch, stops:f.ns ? 1 : 0 })
  .catch(bad).then(j => j.ok ? j : { error:j.error || "Something went wrong. Try again." }); };
async function runFind(v){
  const f = PF.f; PF.busy = "ex"; PF.s = origins().map(o => ({ o })); PF.rterr = ""; draw(v);
  const res = await Promise.all(PF.s.map(s => call({ action:"explore", from:s.o.codes.slice(0, 6).join(","), to:PF.to ? PF.to.codes[0] : "", month:f.mo, duration:f.du,
    interest:PF.to ? "popular" : f.in, max_price:f.mp, adults:f.ad, children:f.ch, stops:f.ns ? 1 : 0 }).catch(bad)));
  res.forEach((j, i) => { PF.s[i].ex = j.ok ? j : { error:j.error || "Something went wrong. Try again." }; });
  if(PF.to){
    PF.s.forEach(s => { const d = s.ex.result ? (s.ex.result.destinations || []).filter(d => d.start)[0] : null;
      s.picked = d || null; if(d){ s.out = d.start; s.ret = d.end || ""; } });
    if(!PF.s.some(s => s.picked) && !PF.s.some(s => s.ex.error)) PF.s[0].ex = { error:`Google didn't find a trip to ${PF.to.label} for that time. Try "Any time", a longer trip, or "I know my dates".` };
    PF.busy = "rt"; draw(v);
    await Promise.all(PF.s.map(async s => { if(s.picked){ s.rt = await routeCall(s.o, s.out, s.ret); draw(v); } }));
  }
  PF.busy = ""; draw(v);
}
async function runRoute(v){
  PF.rterr = "";
  if(!PF.to){ PF.rterr = "Type the city you're flying to."; draw(v); return; }
  if(!PF.f.out){ PF.rterr = "Pick the day you leave."; draw(v); return; }
  const f = PF.f; PF.busy = "rt"; PF.s = origins().map(o => ({ o, out:f.out, ret:f.ret })); draw(v);
  await Promise.all(PF.s.map(async s => { s.rt = await routeCall(s.o, s.out, s.ret); }));
  PF.busy = ""; draw(v);
}

window.perksView = async function(v){
  css(); draw(v); airports();
  if(PF.pto === undefined){ let r = null; try { r = await sb.rpc("my_pto"); } catch(e){}   // supabase-js builders have no .catch()
    PF.pto = (r && r.data) || []; draw(v); }
};
})();
