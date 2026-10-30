/* market_watch.js (Brandon 2026-10-30: SerpApi beyond Rates, "go ahead and do them all").
   Reports ▸ Market watch (#/market_watch): what serp_watch.py found outside - our homes listed for sale, homes for sale and rentals
   near ours (owner leads, lease pricing), Google Maps / search order (us vs. competitors), competitors' ads, local news, job-post pay.
   Loaded by hub.html; uses its sb / $ / esc. Data: serp_finds (hub_serp_watch.sql). Each row is gated in Supabase to its desk, so a
   section only shows when this person may read rows in it (no hints about the rest). */
(function(){
const fday = s => s ? new Date(s).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }) : "";
const usd = n => n == null || n === "" ? "" : "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits:0 });
const link = (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t);
const med = a => { a = a.filter(x => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
function css(){
  if(document.getElementById("mwcss")) return;
  const s = document.createElement("style"); s.id = "mwcss";
  s.textContent = `.mw table{width:100%;border-collapse:collapse;font-size:13px} .mw td,.mw th{padding:5px 6px;border-top:1px solid var(--line);text-align:left;vertical-align:top}
.mw th{font-weight:600;color:var(--muted)} .mw .ours td{background:color-mix(in srgb,var(--green,#2e7d32) 12%,var(--card));font-weight:600}
.mw .src{font-size:12px;color:var(--muted);margin-top:6px} .mw .scroll{overflow-x:auto} .mw .alert{border-color:#c62828!important}
.mw .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px} .mw select{width:auto}
@media (max-width:640px){.mw table{font-size:12px}}`;
  document.head.appendChild(s);
}
async function all(){
  const out = [];
  for(let from = 0; from < 20000; from += 1000){
    const r = await sb.from("serp_finds").select("kind,key,title,home,community,data,source,first_seen,last_seen").eq("gone", false)
      .order("last_seen", { ascending:false }).range(from, from + 999);
    if(r.error) throw r.error;
    out.push(...r.data); if(r.data.length < 1000) break;
  }
  return out;
}
function section(title, sub, body, src, cls){
  return `<div class="card ${cls || ""}"><h3 style="margin:0 0 4px">${title}</h3>${sub ? `<p class="muted" style="margin:0 0 8px">${sub}</p>` : ""}${body}${src ? `<div class="src">Source: ${esc(src)}</div>` : ""}</div>`;
}
function rankTables(rows){
  const latest = {}; rows.forEach(r => { const q = (r.data || {}).query; if(q && !latest[q]) latest[q] = r; });
  return `<div class="grid2">` + Object.values(latest).map(r => { const d = r.data || {};
    return `<div><b>${esc(r.kind === "rank_maps" ? "Google Maps" : "Google search")}: "${esc(d.query)}"</b> <span class="muted" style="font-size:12px">${fday(r.last_seen)}</span>
      <div class="scroll"><table><tr><th>#</th><th>${r.kind === "rank_maps" ? "Business" : "Site"}</th>${r.kind === "rank_maps" ? "<th>★</th><th>Reviews</th>" : ""}</tr>
      ${(d.results || []).slice(0, 12).map(x => `<tr class="${x.ours ? "ours" : ""}"><td>${x.rank}</td><td>${r.kind === "rank_maps" ? link(x.website, x.name || "") : esc(x.site || x.title || "")}</td>
        ${r.kind === "rank_maps" ? `<td>${x.rating ?? ""}</td><td>${x.reviews ?? ""}</td>` : ""}</tr>`).join("")}</table></div>
      ${(d.ads || []).length ? `<p class="muted" style="font-size:12px;margin:4px 0 0">Paid ads on this search: ${esc(d.ads.map(a => a.site).filter(Boolean).join(", "))}</p>` : ""}</div>`; }).join("") + `</div>`;
}
window.marketWatchView = async function(v){
  css(); $("#ttl").textContent = $("#utl").textContent = "Market watch";
  v.innerHTML = `<div class="page wide mw"><p style="margin:0 0 6px"><a href="#/reports">← All reports</a></p><h2>Market watch</h2>
    <p class="muted">What the hub finds outside each day and each Sunday: Zillow, Google Maps and search, Google and Facebook/Instagram ad libraries, Google News.</p><div id="mwl"><div class="card"><p class="muted">Loading…</p></div></div></div>`;
  let rows; try { rows = await all(); } catch(e){ return $("#mwl").innerHTML = `<div class="card"><p class="muted">Couldn't load: ${esc(e.message || e)}</p></div>`; }
  const K = k => rows.filter(r => r.kind === k), out = [];
  const listed = K("our_home_for_sale");
  if(listed.length) out.push(section(`🚩 Our homes listed for sale (${listed.length})`, "Zillow shows these addresses for sale. The owner may not have told us.",
    `<div class="scroll"><table><tr><th>Home</th><th>Listing</th><th>Price</th><th>Days on Zillow</th><th>Broker</th><th>First seen</th></tr>${listed.map(r => { const d = r.data || {};
      return `<tr><td><b>${esc(r.home || "")}</b></td><td>${link(d.link, d.street || r.title)}</td><td>${usd(d.price)}</td><td>${d.days_on_zillow ?? ""}</td><td>${esc(d.broker || "")}</td><td>${fday(r.first_seen)}</td></tr>`; }).join("")}</table></div>`,
    "Zillow via SerpApi", "alert"));
  const ranks = rows.filter(r => r.kind === "rank_maps" || r.kind === "rank_search");
  if(ranks.length) out.push(section("Where we show up on Google, vs. competitors", "Latest Sunday check. Our rows are green.", rankTables(ranks), "Google Maps + Google search (Park City location) via SerpApi"));
  const ads = rows.filter(r => r.kind === "ad_google" || r.kind === "ad_meta");
  if(ads.length){
    const by = {}; ads.forEach(r => { const d = r.data || {}, a = d.advertiser || d.page || "?"; (by[a] = by[a] || []).push(r); });
    out.push(section(`Competitors' ads (${ads.length})`, "Google ads (Ads Transparency Center) and Facebook/Instagram ads (Meta Ad Library) from the companies ranked near us.",
      Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([a, rs]) => `<details><summary><b>${esc(a)}</b> · ${rs.length} ad${rs.length === 1 ? "" : "s"}</summary>
        <div class="scroll"><table><tr><th>Where</th><th>Ad</th><th>Running</th><th>Link</th></tr>${rs.slice(0, 40).map(r => { const d = r.data || {};
          const run = r.kind === "ad_google" ? `${d.first_shown ? fday(d.first_shown * 1000) : ""} → ${d.last_shown ? fday(d.last_shown * 1000) : ""}${d.days_shown ? " (" + d.days_shown + " days)" : ""}`
            : `${esc(d.start || "")}${d.end ? " → " + esc(d.end) : ""}${d.active ? " · active" : ""}`;
          return `<tr><td>${r.kind === "ad_google" ? "Google · " + esc(d.format || "") : "Meta · " + esc((d.platforms || []).join(", "))}</td>
            <td>${esc(((d.title ? d.title + " — " : "") + (d.body || "")).slice(0, 220))}</td><td>${run}</td><td>${link(d.link || d.library, "open")}</td></tr>`; }).join("")}</table></div></details>`).join(""),
      "Google Ads Transparency Center + Meta Ad Library via SerpApi"));
  }
  const sale = K("zillow_sale");
  if(sale.length){
    const comms = [...new Set(sale.map(r => r.community).filter(Boolean))].sort();
    out.push(section(`Homes for sale near ours (${sale.length})`, "Within 400 m of one of our homes: possible owner leads. New ones in the last 7 days are marked.",
      `<p><select id="mwc"><option value="">All neighborhoods</option>${comms.map(c => `<option>${esc(c)}</option>`).join("")}</select></p><div class="scroll" id="mws"></div>`, "Zillow via SerpApi"));
  }
  const rent = K("zillow_rent");
  if(rent.length){
    const byC = {}; rent.forEach(r => { const d = r.data || {}; if(d.rent && d.beds != null) ((byC[r.community || "?"] = byC[r.community || "?"] || {})[d.beds] = (byC[r.community || "?"][d.beds] || [])).push(Number(d.rent)); });
    const beds = [...new Set(Object.values(byC).flatMap(o => Object.keys(o)))].sort((a, b) => a - b);
    out.push(section(`Rentals near ours, for lease pricing (${rent.length})`, "Long-term rentals on Zillow within 800 m of our homes. Middle (median) asking rent by bedrooms.",
      `<div class="scroll"><table><tr><th>Neighborhood</th>${beds.map(b => `<th>${b} bd</th>`).join("")}</tr>${Object.entries(byC).sort().map(([c, o]) =>
        `<tr><td>${esc(c)}</td>${beds.map(b => `<td>${o[b] ? usd(med(o[b])) + ` <span class="muted">(${o[b].length})</span>` : ""}</td>`).join("")}</tr>`).join("")}</table></div>
       <details><summary>All ${rent.length} rentals</summary><div class="scroll"><table><tr><th>Listing</th><th>Rent</th><th>Beds</th><th>Baths</th><th>Sq ft</th><th>Near</th></tr>
       ${rent.map(r => { const d = r.data || {}; return `<tr><td>${link(d.link, d.street || d.building || r.title)}</td><td>${d.rent ? usd(d.rent) : esc((d.units || []).map(u => u.beds + "bd " + u.from).join(", "))}</td>
         <td>${d.beds ?? ""}</td><td>${d.baths ?? ""}</td><td>${d.sqft ?? ""}</td><td>${esc((r.home || "") + (d.meters_to_ours != null ? " · " + d.meters_to_ours + " m" : ""))}</td></tr>`; }).join("")}</table></div></details>`,
      "Zillow rentals via SerpApi"));
  }
  const news = K("news");
  if(news.length) out.push(section(`Local news (${news.length})`, "Short-term rentals, city, county and HOA news from the last week, newest first.",
    news.slice().sort((a, b) => String((b.data || {}).date).localeCompare(String((a.data || {}).date))).slice(0, 40).map(r => { const d = r.data || {};
      return `<p style="margin:6px 0">${link(d.link, r.title)} <span class="muted" style="font-size:12px">· ${esc(d.source || "")} · ${fday(d.date)}</span></p>`; }).join(""), "Google News via SerpApi"));
  const pay = K("job_pay");
  if(pay.length) out.push(section(`Pay in local job posts (${pay.length})`, "Only job posts that show pay are useful here; many don't.",
    `<div class="scroll"><table><tr><th>Search</th><th>Job</th><th>Company</th><th>Pay</th><th>Posted</th></tr>${pay.slice().sort((a, b) => !!(b.data || {}).pay - !!(a.data || {}).pay).map(r => { const d = r.data || {};
      return `<tr><td>${esc(d.search || "")}</td><td>${link(d.link, d.title || "")}</td><td>${esc(d.company || "")}</td><td><b>${esc(d.pay || "")}</b></td><td>${esc(d.posted || "")}</td></tr>`; }).join("")}</table></div>`,
    "Google Jobs via SerpApi"));
  $("#mwl").innerHTML = out.length ? out.join("") : `<div class="card"><p class="muted">Nothing found yet.</p></div>`;
  const draw = () => { const c = ($("#mwc") || {}).value || "", wk = Date.now() - 7 * 864e5;
    $("#mws").innerHTML = `<table><tr><th>Address</th><th>Price</th><th>Beds</th><th>Baths</th><th>Sq ft</th><th>Days on Zillow</th><th>Near our</th><th>Neighborhood</th></tr>${sale.filter(r => !c || r.community === c).map(r => { const d = r.data || {};
      return `<tr><td>${link(d.link, d.street || r.title)}${new Date(r.first_seen).getTime() > wk ? ` <span class="pill amber">new</span>` : ""}</td><td>${usd(d.price)}</td><td>${d.beds ?? ""}</td><td>${d.baths ?? ""}</td><td>${d.sqft ?? ""}</td>
        <td>${d.days_on_zillow ?? ""}</td><td>${esc(r.home || "")}${d.meters_to_ours != null ? ` <span class="muted">${d.meters_to_ours} m</span>` : ""}</td><td>${esc(r.community || "")}</td></tr>`; }).join("")}</table>`; };
  if($("#mws")){ draw(); $("#mwc").onchange = draw; }
};
})();
