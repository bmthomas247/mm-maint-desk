/* perks.js — Staffing ▸ Perks (Brandon 2026-10-30: "lets have a staffing: Perks, but only if we can build some type of cheap flight
   planner with our serpapi" → "make this tool awesome and easy to use. let them search by cities … highlight their PTO in the top right").
   Route #/stf_perks, made in hub.html after hub_my_desks; follows the Staffing desk (hub_can('staffing')).
   Loaded by hub.html; uses its sb / esc / current / MM_CONFIG. Data: Edge Function perks-flights (SerpApi Google Travel Explore +
   Google Flights; no limit per person since 2026-10-30 (Brandon), a repeat within 6 hours comes from the cache; nothing saved with the
   person's name). City search = airports.json (OurAirports, public domain; large + medium airports with scheduled service) + PLACES
   below (popular places whose airport has another town's name, and cities with several airports). PTO = my_pto() (your own row only).
   The hub never books or pays: every result links to Google Flights. */
(function(){
const PF = { tab:"find", busy:"", from:{ label:"Salt Lake City (SLC)", codes:["SLC"] }, to:null, ex:null, rt:null, picked:null, f:{ mo:"0", du:"2", ad:"1", ch:"0", in:"popular" }, air:null, pto:undefined };
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
    if(key === "to" && was !== (o && o.label)){ PF.ex = null; PF.picked = null; draw(v); } };
  inp.oninput = async () => { await airports(); list = suggest(inp.value); at = 0; show(); };
  inp.onfocus = () => { if(!PF.air) airports(); inp.select(); };
  inp.onkeydown = e => { if(box.hidden) return;
    if(e.key === "ArrowDown"){ at = Math.min(list.length - 1, at + 1); show(); e.preventDefault(); }
    else if(e.key === "ArrowUp"){ at = Math.max(0, at - 1); show(); e.preventDefault(); }
    else if(e.key === "Enter"){ pick(list[at]); e.preventDefault(); } else if(e.key === "Escape"){ list = []; show(); } };
  box.onmousedown = e => { const d = e.target.closest("[data-i]"); if(d){ e.preventDefault(); pick(list[+d.dataset.i]); } };
  inp.onblur = () => setTimeout(() => { if(!inp.isConnected) return;
    if(list.length && inp.value.trim() && (!PF[key] || PF[key].label !== inp.value)) pick(list[0]);
    else if(!inp.value.trim() && key === "to"){ if(PF.to){ PF.to = null; PF.ex = null; PF.picked = null; draw(v); } }
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

function routeHtml(x){
  if(!x) return ""; if(x.error) return err(x.error);
  const r = x.result, LV = { low:"Low price", typical:"Typical price", high:"High price" };
  return `<div class="row" style="justify-content:space-between;margin-top:12px"><div><span class="muted sm">Cheapest flight for ${esc(dshort(PF.f.out))}${PF.f.ret ? " – " + esc(dshort(PF.f.ret)) : " (one way)"}</span>
      <div style="font-size:28px;font-weight:800">${money(r.lowest ?? (r.flights[0] || {}).price)}</div></div>
      ${r.level ? `<span class="lv ${esc(r.level)}">${esc(LV[r.level] || r.level)}${r.level === "low" ? " ✓" : r.level === "high" ? " ↑" : ""}</span>` : ""}</div>
    ${meter(r)}${history(r.history)}
    <p class="muted sm" style="margin:8px 0 0">${people() > 1 ? "Prices are the total for all travelers" : "Price for one traveler"}, ${PF.f.ret ? "round trip" : "one way"}, economy, before bag fees.</p>
  ${r.flights.length ? `<div class="tow"><table style="margin-top:10px"><tr><th>Price</th><th>Airline</th><th>Leaves</th><th>Arrives</th><th>Stops</th><th>Time</th></tr>
    ${r.flights.map(f => `<tr><td><b>${money(f.price)}</b>${f.best ? ` <span class="pill">Best</span>` : ""}</td><td>${esc(f.airlines.join(", "))}</td>
      <td>${ttime(f.depart)} <span class="muted sm">${esc(f.from || "")}</span></td><td>${ttime(f.arrive)} <span class="muted sm">${esc(f.to || "")}</span></td>
      <td>${stopTx(f.stops)}${f.via.length ? ` <span class="muted sm">via ${esc(f.via.join(", "))}</span>` : ""}</td><td>${hrs(f.minutes)}</td></tr>`).join("")}</table></div>`
    : `<p class="muted">No flights found for those dates.</p>`}
  <p style="margin:10px 0 0"><a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener">See it and book on Google Flights ↗</a></p>${foot(x)}`;
}

function findOut(){
  const x = PF.ex; if(!x) return ""; if(x.error) return err(x.error);
  const all = x.result.destinations || [];
  if(PF.picked){   // one place: its cheapest dates + the flights for them
    const d = PF.picked;
    return `<div class="best"><div class="row" style="justify-content:space-between"><div><span class="muted sm">Cheapest dates to ${esc(PF.to ? PF.to.label : d.name)}</span>
        <div style="font-size:20px;font-weight:800">${esc(dshort(d.start))}${d.end ? " – " + esc(dshort(d.end)) : ""}</div>
        <span class="muted sm">${esc([d.airline, stopTx(d.stops), hrs(d.minutes)].filter(Boolean).join(" · "))}</span></div>
        <div style="font-size:28px;font-weight:800">${money(d.price)}</div></div>
      ${PF.busy === "rt" ? `<p class="muted">Getting the flights for those dates…</p>` : routeHtml(PF.rt)}
      <p class="sm" style="margin:10px 0 0"><a href="#" id="otherdates">Want other dates? Pick them yourself →</a></p></div>`;
  }
  const scope = PF.f.sc || "all";
  const list = all.filter(d => scope === "all" || (scope === "us" ? d.country === "United States" : d.country !== "United States"));
  return `<div class="row" style="margin-top:14px;justify-content:space-between"><b>${list.length} places${all.length !== list.length ? ` of ${all.length}` : ""}, cheapest first</b>
    <label class="row sm">Show <select id="exsc"><option value="all">Everywhere</option><option value="us" ${scope === "us" ? "selected" : ""}>In the U.S.</option><option value="abroad" ${scope === "abroad" ? "selected" : ""}>Outside the U.S.</option></select></label></div>
  ${list.length ? `<div class="grid">${list.map(d => `<div class="dst"><div class="ph" style="${d.thumb ? `background-image:url('${esc(d.thumb)}')` : ""}"></div><div class="bd">
      <b>${esc(d.name)}</b><span class="muted sm">${esc(d.country || "")}${d.airport ? " · " + esc(d.airport) : ""}</span>
      <span class="pr">${money(d.price)}</span><span class="sm">${d.start ? `${dshort(d.start)}${d.end ? " – " + dshort(d.end) : ""}` : ""}</span>
      <span class="muted sm">${esc([d.airline, stopTx(d.stops), hrs(d.minutes)].filter(Boolean).join(" · "))}</span>
      <div class="row" style="margin-top:auto;padding-top:6px">${d.airport && d.start ? `<button class="btn small" data-ck="${all.indexOf(d)}">See flights</button>` : ""}${d.link ? `<a class="sm" href="${esc(d.link)}" target="_blank" rel="noopener">Google ↗</a>` : ""}</div></div></div>`).join("")}</div>`
    : `<p class="muted">Nothing found. Try another month, a longer trip, or no price limit.</p>`}${foot(x)}`;
}

/* ---------- page ---------- */
function travelers(){
  const f = PF.f;
  return `<label>Adults<select id="fad">${[1,2,3,4,5,6].map(n => `<option ${n === +f.ad ? "selected" : ""}>${n}</option>`).join("")}</select></label>
  <label>Kids<select id="fch">${[0,1,2,3,4,5,6].map(n => `<option ${n === +f.ch ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;
}
const popOn = p => p === null ? !PF.to : !!PF.to && (typeof p === "number" ? PF.to.label === PLACES[p][0] : PF.to.codes.join() === p);
function findForm(){
  const f = PF.f, anyw = !PF.to;
  return `<div class="cities"><div><div class="lbl">Flying from</div>${cityBox("cfrom", "from", "City or airport")}</div>
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
    <div class="cities"><div><div class="lbl">Flying from</div>${cityBox("dfrom", "from", "City or airport")}</div>
      <div><div class="lbl">Flying to</div>${cityBox("dto", "to", "Type a city")}</div></div>
    <div class="frm" style="margin-top:12px"><label>Leave<input id="fout" type="date" min="${t}" value="${esc(f.out || "")}"></label>
      <label>Come back (empty = one way)<input id="fret" type="date" min="${t}" value="${esc(f.ret || "")}"></label>${travelers()}
      <label class="chk"><input type="checkbox" id="fns" ${f.ns ? "checked" : ""}> Nonstop only</label></div>
    <button class="btn primary go" id="dgo" ${PF.busy ? "disabled" : ""}>${PF.busy === "rt" ? "Searching…" : "Check prices"}</button>
    ${PF.busy === "rt" ? "" : routeHtml(PF.rt)}`;
}
function keep(v){ const g = id => v.querySelector("#" + id);
  [["fad", "ad"], ["fch", "ch"], ["fin", "in"], ["fmp", "mp"], ["fout", "out"], ["fret", "ret"]].forEach(([id, k]) => { if(g(id)) PF.f[k] = g(id).value; });
  if(g("fns")) PF.f.ns = g("fns").checked; if(g("more")) PF.f.more = g("more").open; }

function draw(v){
  if(current() !== "stf_perks") return;
  v.innerHTML = `<div class="page prk wide"><div class="hd"><div><h2 style="margin:0 0 4px">Perks</h2><p class="muted" style="margin:0">Extras for the Moose team.</p></div>${ptoBox()}</div>
    <div class="card"><b style="font-size:18px">✈️ Cheap flights</b>
      <div class="tabs"><button data-tab="find" class="${PF.tab === "find" ? "on" : ""}">Find a cheap trip</button><button data-tab="dates" class="${PF.tab === "dates" ? "on" : ""}">I know my dates</button></div>
      ${PF.tab === "find" ? findForm() + findOut() : datesForm()}
      <p class="muted sm" style="margin:14px 0 0">Your searches aren't saved with your name. The hub doesn't book or pay for flights; you book your own trip.${PF.airSrc ? ` City list: ${esc(PF.airSrc)}.` : ""}</p></div></div>`;
  ["cfrom", "dfrom"].forEach(id => wireCity(v, id, "from")); ["cto", "dto"].forEach(id => wireCity(v, id, "to"));
  const on = (sel, fn) => v.querySelectorAll(sel).forEach(b => b.onclick = e => { e.preventDefault(); keep(v); fn(b); draw(v); });
  on("[data-tab]", b => { PF.tab = b.dataset.tab; });
  on("[data-mo]", b => { PF.f.mo = b.dataset.mo; });
  on("[data-du]", b => { PF.f.du = b.dataset.du; });
  on("[data-pop]", b => { const p = POP.find(x => x[0] === b.dataset.pop)[1];
    PF.to = p === null ? null : typeof p === "number" ? (o => ({ label:o.label, codes:o.codes }))(placeOpt(PLACES[p])) : { label:`${b.dataset.pop} (${p})`, codes:[p] }; PF.ex = null; PF.picked = null; });
  const sc = v.querySelector("#exsc"); if(sc) sc.onchange = () => { keep(v); PF.f.sc = sc.value; draw(v); };
  on("[data-ck]", b => { const d = PF.ex.result.destinations[+b.dataset.ck];
    PF.to = { label:`${d.name} (${d.airport})`, codes:[d.airport] }; PF.f.out = d.start; PF.f.ret = d.end || ""; PF.tab = "dates"; PF.rt = null; setTimeout(() => runRoute(v), 0); });
  const od = v.querySelector("#otherdates"); if(od) od.onclick = e => { e.preventDefault(); keep(v); PF.tab = "dates"; draw(v); };
  const fg = v.querySelector("#fgo"); if(fg) fg.onclick = () => { keep(v); runFind(v); };
  const dg = v.querySelector("#dgo"); if(dg) dg.onclick = () => { keep(v); runRoute(v); };
}
const fromCodes = () => (PF.from && PF.from.codes.length ? PF.from.codes : ["SLC"]).slice(0, 6).join(",");
async function runFind(v){
  PF.busy = "ex"; PF.ex = null; PF.picked = null; PF.rt = null; draw(v);
  const f = PF.f, j = await call({ action:"explore", from:fromCodes(), to:PF.to ? PF.to.codes[0] : "", month:f.mo, duration:f.du, interest:PF.to ? "popular" : f.in,
    max_price:f.mp, adults:f.ad, children:f.ch, stops:f.ns ? 1 : 0 }).catch(e => ({ ok:false, error:String(e.message || e) }));
  PF.busy = ""; PF.ex = j.ok ? j : { error:j.error || "Something went wrong. Try again." };
  if(j.ok && PF.to){
    const d = (j.result.destinations || []).filter(d => d.start)[0];
    if(!d){ PF.ex = { error:`Google didn't find a trip to ${PF.to.label} for that time. Try "Any time", a longer trip, or "I know my dates".` }; draw(v); return; }
    PF.picked = d; PF.f.out = d.start; PF.f.ret = d.end || "";
    await runRoute(v, true); return;
  }
  draw(v);
}
async function runRoute(v, quiet){
  if(!PF.to){ PF.rt = { error:"Type the city you're flying to." }; draw(v); return; }
  if(!PF.f.out){ PF.rt = { error:"Pick the day you leave." }; draw(v); return; }
  PF.busy = "rt"; PF.rt = null; draw(v);
  const f = PF.f, j = await call({ action:"route", from:fromCodes(), to:PF.to.codes.slice(0, 6).join(","), out:f.out, ret:f.ret, adults:f.ad, children:f.ch, stops:f.ns ? 1 : 0 })
    .catch(e => ({ ok:false, error:String(e.message || e) }));
  PF.busy = ""; PF.rt = j.ok ? j : { error:j.error || "Something went wrong. Try again." }; draw(v);
}

window.perksView = async function(v){
  css(); draw(v); airports();
  if(PF.pto === undefined){ let r = null; try { r = await sb.rpc("my_pto"); } catch(e){}   // supabase-js builders have no .catch()
    PF.pto = (r && r.data) || []; draw(v); }
};
})();
