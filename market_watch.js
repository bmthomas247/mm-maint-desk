/* market_watch.js (Brandon 2026-10-30: SerpApi beyond Rates, "go ahead and do them all").
   Reports ▸ Market watch (#/market_watch): what serp_watch.py found outside - our homes listed for sale, homes for sale and rentals
   near ours (owner leads, lease pricing), recent sales near ours (2026-11-19), Google Maps / search order (us vs. competitors), competitors' ads, local news, job-post pay.
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
    <p class="muted">What the hub finds outside each day and each Sunday: Zillow, Google Maps and search, Google and Facebook/Instagram ad libraries, Google News, Google's AI answers, Yelp, Tripadvisor, Google Lens, Google Hotels.</p><div id="mwl"><div class="card"><p class="muted">Loading…</p></div></div></div>`;
  let rows; try { rows = await all(); } catch(e){ return $("#mwl").innerHTML = `<div class="card"><p class="muted">Couldn't load: ${esc(e.message || e)}</p></div>`; }
  const K = k => rows.filter(r => r.kind === k), out = [];
  const listed = K("our_home_for_sale");
  if(listed.length) out.push(section(`🚩 Our homes listed for sale (${listed.length})`, "Zillow shows these addresses for sale. The owner may not have told us.",
    `<div class="scroll"><table><tr><th>Home</th><th>Listing</th><th>Price</th><th>Days on Zillow</th><th>Broker</th><th>First seen</th></tr>${listed.map(r => { const d = r.data || {};
      return `<tr><td><b>${esc(r.home || "")}</b></td><td>${link(d.link, d.street || r.title)}</td><td>${usd(d.price)}</td><td>${d.days_on_zillow ?? ""}</td><td>${esc(d.broker || "")}</td><td>${fday(r.first_seen)}</td></tr>`; }).join("")}</table></div>`,
    "Zillow via SerpApi", "alert"));
  const ranks = rows.filter(r => r.kind === "rank_maps" || r.kind === "rank_search");
  if(ranks.length) out.push(section("Where we show up on Google, vs. competitors", "Latest Sunday check. Our rows are green.", rankTables(ranks), "Google Maps + Google search (Park City location) via SerpApi"));
  const ab = K("rank_airbnb");   // AirROI live ranking: where OUR Airbnb listings show in Airbnb's own search (2026-10-30)
  if(ab.length){
    const latest = {}; ab.forEach(r => { const q = (r.data || {}).query; if(q && !latest[q]) latest[q] = r; });
    out.push(section("Where our homes show in Airbnb's own search", "Airbnb lists up to ~270 homes for a Park City search. Searches with dates only show homes open those dates, so the \"any dates\" row is the pure search position.",
      `<div class="scroll"><table><tr><th>Search</th><th>Homes shown</th><th>Ours in it</th><th>Our best spots</th><th>Checked</th></tr>${Object.values(latest).map(r => { const d = r.data || {};
        return `<tr><td>${esc(d.query)}</td><td>${d.shown ?? ""}</td><td><b>${(d.ours || []).length}</b> <span class="muted">of our ${d.our_listings ?? ""}</span></td>
          <td>${(d.ours || []).slice(0, 6).map(o => "#" + o.rank + " " + esc(o.home)).join("<br>")}</td><td>${fday(r.last_seen)}</td></tr>`; }).join("")}</table></div>`,
      "Airbnb search order via AirROI (live ranking), weekly"));
  }
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
  // Recent sales (Brandon 2026-11-19): Zillow "sold" + RentCast off-market listings + county sale dates, matched by address
  // (serp_watch.build_recent_sales). Utah doesn't make sale prices public and we have no MLS feed: asking price only, never a sold price.
  const rs = K("recent_sale");
  if(rs.length){
    const comms = [...new Set(rs.map(r => r.community).filter(Boolean))].sort();
    out.push(section(`Recent sales near our homes (${rs.length})`, `Homes within about half a mile of ours that <b>sold</b> or <b>came off the market</b> in the last 12 months. Utah doesn't make sale prices public, so the price shown is the <b>last asking price</b>, not what it sold for. "Came off the market" can mean sold, withdrawn or expired.`,
      `<div id="rstiles" style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 8px"></div>
       <p style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select id="rsc"><option value="">All neighborhoods</option>${comms.map(c => `<option>${esc(c)}</option>`).join("")}</select>
       <select id="rsp"><option value="90">Last 3 months</option><option value="182" selected>Last 6 months</option><option value="365">Last 12 months</option></select>
       <input id="rsq" placeholder="Search address, agent, owner…" style="max-width:260px"> <button class="btn small" id="rscsv">⬇ Download CSV</button></p>
       <div class="scroll" id="rst"></div>`,
      "RentCast sale listings (last asking price, dates, agent) · Zillow recently sold via SerpApi · county records via RentCast (owner, sale date)"));
  }
  // RentCast owner records around our homes (rentcast_watch.py). Prime prospect = the owner doesn't live there (second-home owner)
  const own = K("area_owner");
  if(own.length){
    const prime = r => (r.data || {}).owner_occupied === false;
    out.push(section(`Owners near our homes (${own.length})`, `Property owners within ¾ mile of our homes, from county records. <b>Prime prospects</b> don't live in the home (second-home owners). New owners bought in the last 12 months.`,
      `<p><select id="mwo"><option value="prime">Prime prospects (${own.filter(prime).length})</option><option value="new">New owners (${own.filter(r => (r.data || {}).new_owner).length})</option><option value="all">Everyone</option></select>
       <button class="btn small" id="mwocsv">⬇ Download CSV (for mailers)</button></p><div class="scroll" id="mwot"></div>`,
      "RentCast property records (county records; Utah doesn't disclose sale prices)"));
  }
  const est = K("rent_estimate");
  if(est.length){
    const last = {}; est.forEach(r => { if(!last[r.home] || r.key > last[r.home].key) last[r.home] = r; });
    out.push(section("Long-term rent estimates for our lease homes", "RentCast's estimate and range, with the rentals it compared to.",
      `<div class="scroll"><table><tr><th>Home</th><th>Estimate</th><th>Range</th><th>Compared to</th></tr>${Object.values(last).sort((a, b) => a.home.localeCompare(b.home)).map(r => { const d = r.data || {};
        return `<tr><td><b>${esc(r.home)}</b></td><td>${usd(d.rent)}</td><td>${usd(d.low)} – ${usd(d.high)}</td><td style="font-size:12px">${(d.comps || []).map(c => `${esc(c.address || "")} ${usd(c.rent)} · ${c.beds ?? "?"}bd${c.miles != null ? " · " + Number(c.miles).toFixed(1) + " mi" : ""}`).join("<br>")}</td></tr>`; }).join("")}</table></div>`,
      "RentCast long-term rent estimate (AVM)"));
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
  // 2026-11-24 (serp_more.py, Brandon "lets do them all"): ratings vs competitors, Google AI answers, Yelp/Tripadvisor, photo copies,
  // website rank, hotel price calendar. Same rules: each kind is gated to its desk in Supabase, so a section shows only when readable.
  const newest = (a, key) => { const m = {}; a.forEach(r => { const k = key(r); if(!m[k] || r.last_seen > m[k].last_seen) m[k] = r; }); return Object.values(m); };
  const pc = K("photo_copy");
  if(pc.length) out.push(section(`🚩 Our photos on other sites (${pc.length})`, "Google Lens found one of our listing photos on a site we don't list with. Could be a fake listing (a common rental scam), an old listing, or a harmless blog. Open each one and check.",
    `<div class="scroll"><table><tr><th>Home</th><th>Site</th><th>Page</th><th>First seen</th></tr>${pc.slice().sort((a, b) => String(b.first_seen).localeCompare(String(a.first_seen))).map(r => { const d = r.data || {};
      return `<tr><td><b>${esc(r.home || "")}</b></td><td>${esc(d.site || "")}</td><td>${link(d.link, d.title || d.link || "")}</td><td>${fday(r.first_seen)}</td></tr>`; }).join("")}</table></div>`,
    "Google Lens via SerpApi (exact matches of each home's first listing photo; 25 homes a week in turn)", "alert"));
  const gb = newest(K("gbp_rating"), r => (r.data || {}).name || r.key);
  if(gb.length) out.push(section("Google rating: us vs. the managers we compete with", "Each company's Google Business listing. Our row is green.",
    `<div class="scroll"><table><tr><th>Company</th><th>★</th><th>Reviews</th><th>Address</th><th>Checked</th></tr>${gb.sort((a, b) => ((b.data || {}).reviews || 0) - ((a.data || {}).reviews || 0)).map(r => { const d = r.data || {};
      return `<tr class="${d.ours ? "ours" : ""}"><td>${link(d.website, d.name || "")}</td><td>${d.rating ?? ""}</td><td>${d.reviews ?? ""}</td><td style="font-size:12px">${esc(d.address || "")}</td><td>${fday(r.last_seen)}</td></tr>`; }).join("")}</table></div>`,
    "Google Maps via SerpApi, weekly"));
  const ai = newest(K("ai_answer"), r => (r.data || {}).where + "|" + (r.data || {}).query);
  if(ai.length) out.push(section("What Google's AI says when people search", "Google's AI Overview (top of the search page) and AI Mode. Does it name us, and who does it name instead?",
    `<div class="scroll"><table><tr><th>Search</th><th>Where</th><th>Names us?</th><th>Names</th><th>Checked</th></tr>${ai.sort((a, b) => String((a.data || {}).query).localeCompare(String((b.data || {}).query))).map(r => { const d = r.data || {};
      return `<tr class="${d.us ? "ours" : ""}"><td>${esc(d.query || "")}</td><td>${esc(d.where || "")}</td><td>${d.us ? "✅ yes" : "❌ no"}</td><td style="font-size:12px">${esc((d.competitors || []).join(", "))}</td><td>${fday(r.last_seen)}</td></tr>
        <tr><td colspan="5"><details><summary class="muted" style="font-size:12px">What it says</summary><div style="white-space:pre-wrap;font-size:12px">${esc(String(d.text || "").slice(0, 2500))}</div>
        ${(d.refs || []).length ? `<p class="muted" style="font-size:12px">Sources it used: ${(d.refs || []).map(x => link(x.link, x.title || x.link)).join(" · ")}</p>` : ""}</details></td></tr>`; }).join("")}</table></div>`,
    "Google AI Overview + AI Mode via SerpApi, searched from Park City, weekly"));
  const yl = newest(K("yelp_rating"), r => (r.data || {}).name || r.key), ta = newest(K("ta_rating"), r => (r.data || {}).name || r.key);
  if(yl.length || ta.length) out.push(section("Yelp and Tripadvisor ratings", "Vacation rental managers in Park City on Yelp, and the ones Tripadvisor lists. Our row is green.",
    `<div class="grid2"><div><b>Yelp</b><div class="scroll"><table><tr><th>Company</th><th>★</th><th>Reviews</th></tr>${yl.sort((a, b) => ((b.data || {}).reviews || 0) - ((a.data || {}).reviews || 0)).slice(0, 25).map(r => { const d = r.data || {};
      return `<tr class="${d.ours ? "ours" : ""}"><td>${link(d.link, d.name || "")}</td><td>${d.rating ?? ""}</td><td>${d.reviews ?? ""}</td></tr>`; }).join("")}</table></div>
      ${K("yelp_review").length ? `<details><summary>Our newest Yelp reviews (${K("yelp_review").length})</summary>${K("yelp_review").slice(0, 10).map(r => { const d = r.data || {};
        return `<p style="font-size:13px;margin:6px 0"><b>${d.rating ?? ""}★</b> ${esc(d.date || "")}: ${esc(String(d.text || "").slice(0, 400))}</p>`; }).join("")}</details>` : ""}</div>
     <div><b>Tripadvisor</b>${ta.length ? `<div class="scroll"><table><tr><th>Listing</th><th>★</th><th>Reviews</th></tr>${ta.map(r => { const d = r.data || {};
      return `<tr class="${d.ours ? "ours" : ""}"><td>${link(d.link, d.name || "")}</td><td>${d.rating ?? ""}</td><td>${d.reviews ?? ""}</td></tr>`; }).join("")}</table></div>` : `<p class="muted">Tripadvisor has none of these companies listed.</p>`}</div></div>`,
    "Yelp + Tripadvisor via SerpApi, weekly"));
  const sr = newest(K("site_rank"), r => (r.data || {}).query);
  if(sr.length){
    const main = sr.filter(r => !(r.data || {}).home), homesR = sr.filter(r => (r.data || {}).home);
    const pos = r => (r.data || {}).pos;
    out.push(section("Where our website shows on Google", `Position of vacationrentalsparkcity.com in Google's top 20, searched from Park City. ${homesR.length ? `Homes: ${homesR.filter(r => pos(r) && pos(r) <= 3).length} in the top 3, ${homesR.filter(r => !pos(r)).length} not in the top 20.` : ""}`,
      `<div class="scroll"><table><tr><th>Search</th><th>Our spot</th><th>Who is above us</th></tr>${main.map(r => { const d = r.data || {};
        return `<tr><td>${esc(d.query)}</td><td><b>${d.pos ? "#" + d.pos : "not in top 20"}</b></td><td style="font-size:12px">${esc((d.top || []).filter(t => !d.pos || t.pos < d.pos).map(t => t.site).slice(0, 6).join(", "))}</td></tr>`; }).join("")}</table></div>
       ${homesR.length ? `<details><summary>Each home's name (${homesR.length})</summary><div class="scroll"><table><tr><th>Home</th><th>Search</th><th>Our spot</th><th>#1 result</th></tr>${homesR.sort((a, b) => (pos(b) ? 0 : 99) - (pos(a) ? 0 : 99) || (pos(b) || 0) - (pos(a) || 0)).map(r => { const d = r.data || {};
          return `<tr><td><b>${esc(d.home)}</b></td><td>${esc(d.query)}</td><td>${d.pos ? "#" + d.pos : "not in top 20"}</td><td style="font-size:12px">${esc(((d.top || [])[0] || {}).site || "")}</td></tr>`; }).join("")}</table></div></details>` : ""}`,
      "Google search via SerpApi (location Park City), weekly"));
  }
  const hc = K("hotel_calendar");
  if(hc.length){
    const days = {}; hc.forEach(r => ((r.data || {}).prices || []).forEach(p => { if(p.price) (days[p.date] = days[p.date] || []).push(Number(p.price)); }));
    const ks = Object.keys(days).sort().slice(0, 120);
    out.push(section(`Hotel prices by night (${hc.length} hotels)`, "Google Hotels' best one-night price for a stay starting that date, for the hotels we see most in Park City and Heber. Middle of those hotels, and the cheapest.",
      `<div class="scroll"><table><tr><th>Night</th><th>Middle</th><th>Cheapest</th><th>Hotels priced</th></tr>${ks.map(k => { const a = days[k];
        return `<tr><td>${fday(k + "T12:00:00")}</td><td>${usd(med(a))}</td><td>${usd(Math.min(...a))}</td><td>${a.length}</td></tr>`; }).join("")}</table></div>
       <details><summary>Hotels in it</summary><p style="font-size:12px">${hc.map(r => esc((r.data || {}).name + " (" + (r.data || {}).area + ")")).join(" · ")}</p></details>`,
      "Google Hotels price calendar via SerpApi, weekly"));
  }
  $("#mwl").innerHTML = out.length ? out.join("") : `<div class="card"><p class="muted">Nothing found yet.</p></div>`;
  const draw = () => { const c = ($("#mwc") || {}).value || "", wk = Date.now() - 7 * 864e5;
    $("#mws").innerHTML = `<table><tr><th>Address</th><th>Price</th><th>Beds</th><th>Baths</th><th>Sq ft</th><th>Days on Zillow</th><th>Near our</th><th>Neighborhood</th></tr>${sale.filter(r => !c || r.community === c).map(r => { const d = r.data || {};
      return `<tr><td>${link(d.link, d.street || r.title)}${new Date(r.first_seen).getTime() > wk ? ` <span class="pill amber">new</span>` : ""}</td><td>${usd(d.price)}</td><td>${d.beds ?? ""}</td><td>${d.baths ?? ""}</td><td>${d.sqft ?? ""}</td>
        <td>${d.days_on_zillow ?? ""}</td><td>${esc(r.home || "")}${d.meters_to_ours != null ? ` <span class="muted">${d.meters_to_ours} m</span>` : ""}</td><td>${esc(r.community || "")}</td></tr>`; }).join("")}</table>`; };
  if($("#mws")){ draw(); $("#mwc").onchange = draw; }
  if($("#rst")){
    const RS = { f: "" };   // clickable tiles filter the list (tap again = all)
    const when = d => d.sold_date || d.removed || "";
    const base = () => { const c = $("#rsc").value, days = +$("#rsp").value, cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), q = $("#rsq").value.trim().toLowerCase();
      return rs.filter(r => { const d = r.data || {}; const w = when(d);
        if(c && r.community !== c) return false;
        if(w && w < cut) return false;
        if(q && !JSON.stringify([d.address, d.agent, d.office, d.owners, r.home, r.community]).toLowerCase().includes(q)) return false;
        return true; }); };
    const fil = a => a.filter(r => { const d = r.data || {};
      return !RS.f || (RS.f === "sold" ? d.status === "sold" : RS.f === "off" ? d.status === "off_market" : RS.f === "ours" ? !!d.ours : RS.f === "away" ? d.owner_occupied === false : true); });
    const tiles = a => { const t = (k, n, label) => `<button class="btn small ${RS.f === k ? "" : "ghost"}" data-rsf="${k}" style="min-width:120px;text-align:left"><b style="font-size:18px">${n}</b><br><span style="font-size:12px">${label}</span></button>`;
      const sold = a.filter(r => (r.data || {}).status === "sold"), asks = sold.map(r => (r.data || {}).asking).filter(Boolean).map(Number), doms = a.map(r => (r.data || {}).dom).filter(x => x != null).map(Number);
      return t("sold", sold.length, "Sold") + t("off", a.length - sold.length, "Came off the market") + t("away", a.filter(r => (r.data || {}).owner_occupied === false).length, "Owner doesn't live there")
        + t("ours", a.filter(r => (r.data || {}).ours).length, "Our homes")
        + `<div class="card" style="margin:0;padding:6px 10px;min-width:150px"><b style="font-size:18px">${usd(med(asks)) || "—"}</b><br><span class="muted" style="font-size:12px">Middle last asking (sold)</span></div>`
        + `<div class="card" style="margin:0;padding:6px 10px;min-width:150px"><b style="font-size:18px">${med(doms) ?? "—"}</b><br><span class="muted" style="font-size:12px">Middle days on market</span></div>`; };
    const drawR = () => { const a = base(), list = fil(a).sort((x, y) => when(y.data || {}).localeCompare(when(x.data || {})));
      $("#rstiles").innerHTML = tiles(a);
      $("#rstiles").querySelectorAll("[data-rsf]").forEach(b => b.onclick = () => { RS.f = RS.f === b.dataset.rsf ? "" : b.dataset.rsf; drawR(); });
      $("#rst").innerHTML = (RS.f ? `<p class="muted" style="margin:0 0 6px">Showing ${list.length} of ${a.length} · <a href="#" id="rsall">show all</a></p>` : "")
        + `<table><tr><th>Address</th><th>What happened</th><th>Last asking</th><th>Days on market</th><th>Home</th><th>Zestimate</th><th>Listing agent</th><th>Owner (county record)</th><th>Near our</th></tr>${list.slice(0, 500).map(r => { const d = r.data || {};
        const what = d.status === "sold" ? `<span class="pill green">Sold</span> ${esc(d.sold_date ? fday(d.sold_date) : (d.sold_when || ""))}<div class="muted" style="font-size:11px">${esc(d.how || "")}</div>`
          : `<span class="pill amber">Came off the market</span> ${esc(d.removed ? fday(d.removed) : "")}`;
        return `<tr${d.ours ? ' class="ours"' : ""}><td>${link(d.link, d.address || r.title)}${d.ours ? ` <span class="pill">our ${esc(d.ours)}</span>` : ""}</td><td>${what}</td>
          <td>${usd(d.asking)}${d.price_cut ? `<div class="muted" style="font-size:11px">cut ${esc(String(d.price_cut))}</div>` : ""}${d.listed ? `<div class="muted" style="font-size:11px">listed ${fday(d.listed)}</div>` : ""}</td>
          <td>${d.dom ?? ""}</td><td>${esc([d.type, d.beds != null ? d.beds + "bd" : "", d.baths ? d.baths + "ba" : "", d.sqft ? d.sqft + " sq ft" : ""].filter(Boolean).join(" · "))}${d.hoa_fee ? `<div class="muted" style="font-size:11px">HOA ${usd(d.hoa_fee)}/mo</div>` : ""}</td>
          <td>${usd(d.zestimate)}</td><td>${esc(d.agent || "")}${d.office ? `<div class="muted" style="font-size:11px">${esc(d.office)}</div>` : ""}</td>
          <td>${esc((d.owners || []).join(", "))}${d.owner_occupied === false ? ` <span class="pill green">doesn't live there</span>` : ""}${d.owner_as_of ? `<div class="muted" style="font-size:11px">as of ${fday(d.owner_as_of)}</div>` : ""}</td>
          <td>${esc(r.home || "")}${d.meters_to_ours != null ? ` <span class="muted">${d.meters_to_ours} m</span>` : ""}</td></tr>`; }).join("")}</table>${list.length > 500 ? `<p class="muted">First 500 of ${list.length}: use the filters or the CSV.</p>` : ""}`;
      const sa = $("#rsall"); if(sa) sa.onclick = e => { e.preventDefault(); RS.f = ""; drawR(); }; };
    drawR(); ["#rsc", "#rsp"].forEach(x => $(x).onchange = drawR); $("#rsq").oninput = drawR;
    $("#rscsv").onclick = () => { const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = [["address", "status", "sold date", "how we know", "came off the market", "last asking price", "listed", "days on market", "type", "beds", "baths", "sqft", "zestimate", "listing agent", "office", "owners (county record)", "owner lives there", "mailing address", "near our home", "meters", "neighborhood", "our home"]]
        .concat(fil(base()).map(r => { const d = r.data || {}; return [d.address, d.status === "sold" ? "sold" : "came off the market", d.sold_date || d.sold_when, d.how, d.removed, d.asking, d.listed, d.dom, d.type, d.beds, d.baths, d.sqft, d.zestimate, d.agent, d.office, (d.owners || []).join("; "), d.owner_occupied == null ? "" : d.owner_occupied ? "yes" : "no", d.mailing, r.home, d.meters_to_ours, r.community, d.ours]; }));
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map(x => x.map(q).join(",")).join(String.fromCharCode(10))], { type: "text/csv" }));
      a.download = "recent-sales-near-our-homes.csv"; a.click(); };
  }
  if($("#mwot")){
    const pick = () => { const f = $("#mwo").value; return own.filter(r => f === "all" || (f === "new" ? (r.data || {}).new_owner : (r.data || {}).owner_occupied === false))
      .sort((a, b) => ((b.data || {}).new_owner - (a.data || {}).new_owner) || String(a.community || "").localeCompare(String(b.community || ""))); };
    const drawO = () => { $("#mwot").innerHTML = `<table><tr><th>Property</th><th>Owner</th><th>Mailing address</th><th>Lives there</th><th>Last sale</th><th>Type</th><th>Near our</th></tr>${pick().slice(0, 600).map(r => { const d = r.data || {};
      return `<tr><td>${esc(d.address || "")}${d.owner_occupied === false ? ` <span class="pill green">prime prospect</span>` : ""}${d.new_owner ? ` <span class="pill amber">new owner</span>` : ""}</td><td>${esc((d.owners || []).join(", "))}${d.owner_type ? ` <span class="muted">(${esc(d.owner_type)})</span>` : ""}</td>
        <td>${esc(d.mailing || "")}</td><td>${d.owner_occupied == null ? "" : d.owner_occupied ? "yes" : "no"}</td><td>${esc(d.last_sale || "")}</td><td>${esc([d.type, d.beds != null ? d.beds + "bd" : ""].filter(Boolean).join(" · "))}</td>
        <td>${esc(r.home || "")}${d.meters_to_ours != null ? ` <span class="muted">${d.meters_to_ours} m</span>` : ""}</td></tr>`; }).join("")}</table>`; };
    drawO(); $("#mwo").onchange = drawO;
    $("#mwocsv").onclick = () => { const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = [["property", "owners", "owner type", "mailing address", "lives there", "last sale", "new owner", "type", "beds", "baths", "sqft", "near our home", "neighborhood"]]
        .concat(pick().map(r => { const d = r.data || {}; return [d.address, (d.owners || []).join("; "), d.owner_type, d.mailing, d.owner_occupied == null ? "" : d.owner_occupied ? "yes" : "no", d.last_sale, d.new_owner ? "yes" : "", d.type, d.beds, d.baths, d.sqft, r.home, r.community]; }));
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map(x => x.map(q).join(",")).join(String.fromCharCode(10))], { type: "text/csv" }));
      a.download = `owners-near-our-homes-${$("#mwo").value}.csv`; a.click(); };
  }
};
})();
