/* reservations.js (Brandon 2026-10-28): Reservations ▸ Check lists — the Reservation Desk board + Asana Rental Checklists in the hub.
   Loaded by hub.html; uses its sb / $ / esc. Data: res_board() (hub_reservations.sql) — access and money are enforced there.
   Routes: #/reservations (queue) · #/reservations/<res #> (one check list) · #/reservations/held (Held up report). */
(function(){
const CSS = `
.rq{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.rqbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px} .rqbar input{flex:1;min-width:180px} .rqbar select{width:auto}
.rchips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0} .rchip{border:1px solid var(--line-2);background:var(--card);border-radius:999px;padding:5px 11px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:var(--ink-2)}
.rchip.on{background:var(--forest-2);border-color:var(--forest-2);color:#fff} .rchip .n{opacity:.7;margin-left:4px}
.rrow{display:flex;gap:10px;align-items:center;padding:10px 4px;border-bottom:1px solid var(--line);cursor:pointer;text-decoration:none;color:inherit} .rrow:hover{background:var(--ground)}
.rrow .u{font-weight:800;min-width:76px} .rrow .g{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .rrow .d{font-size:13px;color:var(--muted);white-space:nowrap}
.rbar{height:6px;border-radius:6px;background:var(--line);width:70px;overflow:hidden;flex:0 0 auto} .rbar i{display:block;height:100%;background:var(--moose,#4f7a3a)}
.rfacts{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;margin:6px 0} .rfacts b{font-weight:800}
.rmoney{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13.5px;background:var(--ground);border:1px solid var(--line);border-radius:12px;padding:8px 12px;margin:8px 0}
.rrule{border-radius:12px;padding:8px 12px;margin:6px 0;font-size:14px;font-weight:600;background:var(--blue-soft);color:var(--blue)} .rrule.warn{background:var(--amber-soft);color:var(--amber)} .rrule.stop{background:var(--red-soft);color:var(--red)}
.rgrp{margin-top:14px} .rgrp h3{font-size:15px;margin:0 0 4px;display:flex;gap:8px;align-items:center}
.rstep{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--line)} .rstep:last-child{border-bottom:0}
.rstep input{width:22px;height:22px;min-height:0;flex:0 0 auto;margin-top:1px;accent-color:var(--forest-2)} .rstep .l{flex:1;font-size:14.5px} .rstep.opt .l{color:var(--ink-2)}
.rstep .who{font-size:12px;color:var(--muted);white-space:nowrap;min-width:200px;text-align:right}
@media(max-width:640px){ .rstep{flex-wrap:wrap} .rstep .who{min-width:0;flex-basis:100%;text-align:left;padding-left:32px;white-space:normal} } .rstep.done .l{text-decoration:line-through;text-decoration-color:var(--line-2)}
.rhist{font-size:13px;border-top:1px solid var(--line);padding:6px 0}
.rq3{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1.2fr) minmax(0,1fr);gap:6px 14px;align-items:start}
.rq3 .who,.rq3 .when,.rq3 .st{display:flex;flex-direction:column;gap:2px;min-width:0} .rq3 .who b{font-size:15.5px}
.rq3 .sub{font-size:13px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .rq3 .sub+.sub{color:var(--muted)}
.rq3 .when{font-size:13.5px} .rq3 .when>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .rq3 .when .k{display:inline-block;min-width:52px;color:var(--muted);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.rq3 .st{align-items:flex-end} .rq3 .why{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end} .rq3 .why .pill{font-size:11px;padding:2px 7px}
@media(min-width:1000px){ .rpage{max-width:1180px!important} }
@media(max-width:640px){ .rq3{grid-template-columns:minmax(0,1fr) minmax(0,44%)} .rq3 .when{grid-column:1 / -1;grid-row:2} .rrow{flex-wrap:wrap;gap:4px 10px} .rrow .g{order:3;flex-basis:100%;white-space:normal} .rrow .d{flex:1} .rrow .rbar{display:none} }`;
const CH = { abnb:"Airbnb", vrbo:"VRBO / VRPC / Phone", ws:"Whimstay / BDC / Hopper", oguest:"Owner guest", owner:"Owner stay" };
const STAGE = { in_progress:"In progress", checkout:"Checkout", owner_done:"Owner stay done", cancelling:"Cancellations", closed:"Closed" };
// Neighborhoods: unit code prefix -> name (maintenance_desk/units.json "communities", from Track units)
const HOODS = {"BHL":"Bear Hollow Lodges","BHR":"Bear Hollow Ridge","BHV":"Bear Hollow Village","BRR":"Black Rock Ridge","BSR":"Blackstone Residences","CH":"Carriage House",
  "CR":"Coyote Ridge","CV":"Crestview","DR":"Discovery Ridge","DS":"Deer Springs","EH":"Edelweiss Haus","FB":"Fox Bay","FP":"Foxpoint","HS":"Hailstone Heights",
  "JDR":"Jordanelle Ridge","JE":"Jordanelle Estates","JMR":"Jeremy Ranch","KR":"Klaim Retreats","MFL":"Mayflower Lakeside","MFV":"Mayflower Village","ML":"Moose Lodge",
  "NC":"New Claim","PE":"Parks Edge","PL":"Prospector Lodge","PV":"Pioche Village","PW":"Powderwood Pines","PWV":"Park West Village","RC":"Racquet Club",
  "RJ":"Retreat at Jordanelle","RP":"Red Pine","SCV":"Silver Creek Village","SS":"Sunspot","ST":"Ski Team","SW":"The Mason at Stillwater","TK":"Three Kings",
  "UM":"Upper Main","VS":"Village at the Shores","WG":"Westgate","WP":"White Pine","WS":"Wasatch Springs"};
const area = u => ((/^(?:2H-|L-)?([A-Za-z]+)/.exec(u || "") || [])[1] || "").toUpperCase();
// "Open" buttons (Brandon 2026-10-28): links from the Reservation Desk board's config/links (checklist PDFs + verified in Track/Safely Sep 2026);
// Keycafe = its Bookings page (keycafe.com, seen 2026-10-28). {res} is filled per stay.
const LINKS = {
  track: "https://moosemanagement.trackhs.com/pms/reservations/view/{res}/", autohost: "https://portal.autohost.ai/reservations",
  breezeway: "https://app.breezeway.io", brevo: "https://app.brevo.com/contact/list", safely: "https://portal.safely.com/guests",
  prospector: "https://fs27.formsite.com/2XpG4h/form1/index.html", keycafe: "https://www.keycafe.com/desktop#!/bookings",
  westgate: "https://forms.office.com/Pages/ResponsePage.aspx?id=fujdTilSREuwP2RU5RjnVWGoIOdDIHhFruJUefJmkkFUMVJGMEdEUU5aSDJIM1cyMjFNSDdIRExTTi4u" };
const LINK_NAME = { track:"Track", autohost:"Autohost", breezeway:"Breezeway", brevo:"Brevo", safely:"Safely", prospector:"Prospector form", keycafe:"Keycafe", westgate:"Westgate form" };
const STEP_LINK = {};
[["track", "i_campaign i_agent i_ta i_rate i_fees i_card i_guar i_contract i_notesq g_dates g_type g_contact g_notes o_open o_dates o_notes o_behalf w_post w_verify w_earn a_earn g_agree g_pay g_35 g_30 c_sig c_resend oc_cl oc_post oc_prime oc_pet oc_di oc_nofee oc_doc_o oc_doc_g gp_cl gp_dw gp_not gp_pet gp_doc pt_ok pt_clean pt_fee pt_price pt_guar pt_collect pt_tag dc_set t_tag t_beyond t_di t_clean x_rent x_modify x_total x_add x_charge k_track k_refund k_zero k_pet pl_conf pl_tag wg_conf wg_tag p_split p_change p_second"],
 ["autohost", "ah_verified ah_remind ah_extra ah_card ah_review ah_link c_addr"], ["safely", "ah_safely"], ["brevo", "ah_brevo"],
 ["breezeway", "bo_pre bo_notes bo_either bo_next5 bo_wg bo_wp bo_maint bo_og bg_insp k_bw x_avail"], ["prospector", "pl_form"], ["westgate", "wg_form"], ["keycafe", "dc_pv"]]
  .forEach(([k, keys]) => keys.split(" ").forEach(s => STEP_LINK[s] = k));
const openFor = (key, s) => { const k = STEP_LINK[key]; if(!k) return "";
  return `<a class="btn small" style="min-height:28px;padding:0 9px;font-size:12px" href="${esc(LINKS[k].replace("{res}", encodeURIComponent(s.res)))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${LINK_NAME[k]} ↗</a>`; };
const WAIT = ["Guest to reply", "Owner to reply"];
let B = null, loadedAt = 0;
const money = v => v == null ? "—" : "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 });
const day = s => s ? new Date(s + "T12:00").toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }) : "";
const dayY = s => { if(!s) return "—"; const d = new Date(String(s).slice(0, 10) + "T12:00");
  return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { month:"short", day:"numeric" } : { month:"short", day:"numeric", year:"numeric" }); };
const when = s => s ? new Date(s).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "";
const folioUrl = r => "https://moosemanagement.trackhs.com/pms/guest-folio/view/?id=" + encodeURIComponent(r);

async function load(force){
  if(B && !force && Date.now() - loadedAt < 60000) return B;
  const [r, al] = await Promise.all([sb.rpc("res_board"), sb.rpc("hub_home_alerts")]); if(r.error) throw r.error;
  B = r.data; loadedAt = Date.now();
  if(B) B.alerts = al.data || [];   // home heads-ups (hub_penny_3.sql, Brandon 2026-10-28): warn before booking a home with a big open problem
  if(B) B.stays.forEach(prep);
  return B;
}
// What applies to this stay, what is done, what holds it up.
function conds(s){
  const u = (s.unit || "").toUpperCase(), occ = s.occ || {}, cx = s.status === "Cancelled" || (s.list && s.list.stage === "cancelling");
  return { pets:(occ.pets || 0) > 0, pl:u.startsWith("PL "), wg:u.startsWith("WG "), pv:u.startsWith("PV "), wp:u.startsWith("WP "),
    thirty:(s.nights || 0) >= 30, parent:u === "ST 14" || u === "BHV 5604", gp:/guest pays/i.test(s.type || ""), op:!/guest pays/i.test(s.type || ""),
    extend:!!(s.list && s.list.extending), cancel:cx };
}
function autoOk(s, a){
  switch(a){
    case "campaign": return /^office received$/i.test(s.campaign || "");
    case "agent": return !!s.agent;
    case "guarantee": return /10\/40\/50/.test(s.guarantee || "");
    case "agreement_sent": return ["sent","viewed","received"].includes(s.agreement);
    case "agreement_received": return s.agreement === "received";
    case "ah_verified": return !!(s.ah && s.ah.verify === "verified") || tag(s, /^autohost verified$/i);
    case "cancelled": return s.status === "Cancelled";
    case "og_type": return /^owner guest/i.test(s.type || "");
    // Home takes dogs: Track unit allows pets, no "No Pets" tag, and no more pets than the cap (2, or a property rule "Pet cap: N")
    case "pets_ok": { const cap = Math.min(2, ...s.rules.map(r => +((/pet cap:\s*(\d+)/i.exec(r.text) || [])[1] || 9)));
      return s.unitPets === true && (s.occ && s.occ.pets || 0) <= cap && !tag(s, /^no pets$/i); }
    case "bw_clean": return bwClean(s);
    // #housekeeping @Cheree messages naming this home (slack_hk.py) — after the cancel / after it was marked extending / any
    case "hk_after_cancel": return !!(s.cancelledAt && (s.hk || []).some(m => m.at.slice(0, 10) >= s.cancelledAt));
    case "hk_after_extend": return !!(s.list && s.list.extAt && (s.hk || []).some(m => m.at >= s.list.extAt));
    case "hk_any": return !!(s.hk && s.hk.length);
    // every extra guest with an email (Autohost portal) is on Brevo "AH Guest of Guest" — or there are none (brevo_guests.py, counts only)
    case "brevo_ok": return !!(s.brevo && (s.brevo.extra === 0 || s.brevo.inBrevo >= s.brevo.extra));
    case "balance_zero": return s.balance != null && Math.abs(s.balance) < 0.005;
    // Breezeway (bw_res_tasks.py): matched by home + scheduled date, names as the team uses them (Oct 2026 tasks)
    case "bw_pre_out": return bwHas(s, "housekeeping", /pre-?clean/i, addDay(s.arrive, -5), s.arrive) && bwClean(s);
    case "bw_owner_next_chris": return bwHas(s, "inspection", /owner next/i, addDay(s.arrive, -4), s.arrive, /chris robinson/i);
    case "bw_in_out": return bwInOut(s);
    case "bw_og": return bwInOut(s) && bwClean(s);
    case "bw_wg": return bwHas(s, "housekeeping", /wg housekeeping/i, s.depart, s.depart);
    case "bw_no_clean": return bwKnown(s) && !(s.bw || []).some(t => t.dp === "housekeeping" && t.sd === s.depart && t.st !== "done")
      || bwKnown(s) && B.stays.some(o => o !== s && o.unit === s.unit && o.status !== "Cancelled" && (o.depart === s.depart || o.arrive === s.depart));
  }
  if(a && a.startsWith("td_")) return tdOk(s, a);
  return false;
}
// Track details (track_res_details.py): tag names, document subjects + status, fee names (+ owner charge), note flags, door code set.
const tag = (s, re) => !!(s.td && (s.td.tags || []).some(t => re.test(t)));
const fee = (s, re, own) => !!(s.td && (s.td.fees || []).some(f => re.test(f.n) && (own == null || f.own === own)));
const doc = (s, re, done) => !!(s.td && (s.td.docs || []).some(d => re.test(d.s) && d.st !== "voided" && (!done || d.st === "completed")));
function tdOk(s, a){
  if(!s.td) return false;
  const R = TD_RULES[a]; return !!(R && R(s));
}
// Names as they are in Track on 2026-10-28 (tags, fee charge names, esign document subjects) — track_res_details.py pull of 456 stays.
const PETS = /^\d+\s*pets?$/i, OWNER_CL = /cleaning & laundry|clean\/laundry/i;
const TD_RULES = {
  td_pet_tag:    s => tag(s, PETS),
  td_pet_owner:  s => tag(s, PETS) && fee(s, /pet/i),
  td_pet_gp:     s => tag(s, PETS) && fee(s, /pet/i, false),
  td_pet_clean:  s => fee(s, /pet cleaning/i),
  td_pet_fee:    s => fee(s, /pet hosting|pet fee|pet approval/i),
  td_30:         s => tag(s, /over 30 nights/i),
  td_pcwg:       s => tag(s, /pc\/wg confirmed/i),
  td_ticket:     s => !!(s.td.notes && s.td.notes.ticket),
  td_og_tag:     s => tag(s, /^owner guest$/i),
  td_door:       s => s.td.door === true,
  td_card:       s => s.td.card === true,
  td_fees:       s => fee(s, /clean/i, false) && fee(s, /damage waiver/i) && fee(s, /admin/i),
  td_gp_cl:      s => fee(s, /clean/i, false),
  td_dw:         s => fee(s, /damage waiver/i),
  td_gp_not:     s => !fee(s, OWNER_CL, true),
  td_owner_cl:   s => fee(s, OWNER_CL, true),
  td_no_dw:      s => !fee(s, /damage waiver|safely/i),
  td_pet_doc:    s => doc(s, /pet/i),
  td_pet_doc_ok: s => doc(s, /pet/i, true),
  td_addendum:   s => doc(s, /change addendum/i),
  td_card_auth:  s => doc(s, /credit card authorization|secondary guest/i),
  td_paid_some:  s => (s.paid || 0) > 0,
  // round 2 (2026-10-28): Track contact yes/no, notes, 30+ night fees, Advantage Dropbox file
  td_contact_ep:   s => !!(s.td.contact && s.td.contact.email && s.td.contact.phone),
  td_contact_addr: s => !!(s.td.contact && s.td.contact.address && s.td.contact.email),
  td_notes:        s => !!(s.td.notes && s.td.notes.n > 0),
  td_no_beyond:    s => !fee(s, /beyond/i),
  td_ext_clean:    s => fee(s, /extended stay cleaning/i),
  td_adv:          s => s.td.advantage === true,
};
const addDay =(d, n) => { const x = new Date(d + "T12:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const bwHas = (s, dp, re, from, to, who) => (s.bw || []).some(t => t.dp === dp && t.sd >= from && t.sd <= to && re.test(t.n) && (!who || (t.who || []).some(w => who.test(w))));
const bwClean = s => bwHas(s, "housekeeping", /^(?!.*(assessment|spring)).*(clean)/i, s.depart, s.depart);
const bwInOut = s => bwHas(s, "inspection", /check-?in/i, s.arrive, s.arrive) && bwHas(s, "inspection", /check-?out/i, s.depart, s.depart);
// Only trust "no clean left" when this home was in the Breezeway pull (it has a Breezeway id and the stay is in the window)
const bwKnown = s => !!B.bwUpdated && !(B.bwMissing || []).includes(s.unit) && s.depart >= addDay(B.today, -7) && s.arrive <= addDay(B.today, 75);
const AUTO_SRC = { brevo_ok:"Brevo", hk_after_cancel:"Slack", hk_after_extend:"Slack", hk_any:"Slack", ah_verified:"Autohost", bw_pre_out:"Breezeway", bw_owner_next_chris:"Breezeway", bw_in_out:"Breezeway", bw_og:"Breezeway", bw_wg:"Breezeway", bw_no_clean:"Breezeway" };
function prep(s){
  const c = conds(s), ticks = s.ticks || {};
  s.rules = B.rules.filter(r => { const p = r.unit.toUpperCase(), u = (s.unit || "").toUpperCase(); return p.endsWith(" %") ? u.startsWith(p.slice(0, -1)) : u === p; });
  s.area = area(s.unit);
  const uk = String(s.unit || "").replace(/^(L-|2H-)/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  s.heads = (B.alerts || []).filter(a => a.key === uk);
  s.steps = B.steps.filter(t => t.chans.includes(s.chan) && t.cond.every(k => c[k]))
    .map(t => { const k = ticks[t.key], au = t.auto && autoOk(s, t.auto);
      return { ...t, tick:k, auto:au ? (AUTO_SRC[t.auto] || "Track") : null, done:k ? k.d : !!au }; });
  const req = s.steps.filter(t => !t.opt);
  s.need = req.length; s.got = req.filter(t => t.done).length;
  s.blockers = [...new Set(req.filter(t => !t.done && t.blocker).map(t => t.blocker))];
  const today = B.today;
  s.stage = (s.list && s.list.stage) || (s.status === "Cancelled" ? "cancelling" : s.depart < today ? (s.chan === "owner" ? "owner_done" : "checkout") : "in_progress");
  s.waiting = (s.list && s.list.waiting) || [];
  s.state = s.stage === "closed" ? "Complete" : s.status === "Cancelled" && s.stage !== "closed" ? "Cancelling" : s.got === 0 ? "Not started"
    : s.got >= s.need ? (s.depart < today ? "Ready to close" : "Paperwork done") : s.waiting.length ? "Waiting" : "In progress";
}
function css(){ if(!document.getElementById("rescss")){ const st = document.createElement("style"); st.id = "rescss"; st.textContent = CSS; document.head.appendChild(st); } }
const fresh = () => `<p class="muted" style="margin:4px 0 10px">Source: Track reservations, updated ${esc(when(B.updated))}${B.ahUpdated ? ` · Autohost, updated ${esc(when(B.ahUpdated))}` : ""}${B.bwUpdated ? ` · Breezeway, updated ${esc(when(B.bwUpdated))}` : ""}</p>`;

/* ---------- queue */
const F = { q:"", chan:"", area:"", stage:"in_progress", held:"", by:"arrive", from:"", to:"" };
// Sort + date range (Brandon 2026-10-28): by check-in, check-out or booking date; the from/to range applies to the same date
const BY = { arrive:"Check-in", depart:"Check-out", bookedAt:"Booking date" };
async function queue(v){
  v.innerHTML = `<div class="page rpage"><h2>Check lists</h2><p class="muted">Loading…</p></div>`;
  try { await load(); } catch(e){ v.innerHTML = `<div class="page"><div class="card"><p>Couldn't load the check lists: ${esc(e.message)}</p></div></div>`; return; }
  if(!B){ v.innerHTML = `<div class="page"><div class="card"><h2>No access</h2><p class="muted">This desk isn't on your teams. Ask Brandon or Kim.</p></div></div>`; return; }
  const draw = () => {
    const dk = s => String(s[F.by] || "").slice(0, 10);
    const base = B.stays.filter(s => (!F.chan || s.chan === F.chan) && (!F.area || s.area === F.area) && (!F.q || [s.res, s.unit, s.guest].join(" ").toLowerCase().includes(F.q.toLowerCase()))
      && (!F.from || dk(s) >= F.from) && (!F.to || (dk(s) && dk(s) <= F.to)))
      .sort((x, y) => F.by === "bookedAt" ? (dk(y) < dk(x) ? -1 : dk(y) > dk(x) ? 1 : 0) : (dk(x) < dk(y) ? -1 : dk(x) > dk(y) ? 1 : 0));   // booked: newest first
    const inStage = base.filter(s => s.stage === F.stage);
    const rows = inStage.filter(s => !F.held || s.blockers.includes(F.held) || s.waiting.includes(F.held));
    const cnt = k => base.filter(s => s.stage === k).length;
    const held = {}; inStage.forEach(s => [...s.blockers, ...s.waiting].forEach(b => held[b] = (held[b] || 0) + 1));
    $("#rqbody").innerHTML = `
      <div class="rchips">${Object.entries(STAGE).map(([k, l]) => `<button class="rchip ${F.stage === k ? "on" : ""}" data-stage="${k}">${l}<span class="n">${cnt(k)}</span></button>`).join("")}</div>
      ${Object.keys(held).length ? `<div class="rchips"><span class="muted" style="align-self:center">Held up by</span>${Object.entries(held).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<button class="rchip ${F.held === k ? "on" : ""}" data-held="${esc(k)}">${esc(k)}<span class="n">${n}</span></button>`).join("")}</div>` : ""}
      <div class="card" style="padding:6px 12px">${rows.length ? rows.map(s => { const why = [...s.waiting, ...s.blockers];
        return `<a class="rrow rq3" href="#/reservations/${encodeURIComponent(s.res)}">
        <span class="who"><b>${esc(s.guest || "#" + s.res)}</b>${s.vip ? ` <span class="pill blue">VIP</span>` : ""}${s.dnr ? ` <span class="pill red">DNR</span>` : ""}${s.heads.some(a => a.level === "warn") ? ` <span class="pill amber" title="${esc(s.heads.filter(a => a.level === "warn").map(a => a.text).join(" · "))}">⚠️ Heads-up</span>` : ""}
          <span class="sub">${esc(s.unit || "")}${HOODS[s.area] ? ` · ${esc(HOODS[s.area])}` : ""}</span><span class="sub">${esc(s.type || CH[s.chan])}</span></span>
        <span class="when"><span><span class="k">Booked</span> ${esc(dayY(s.bookedAt))}</span><span><span class="k">Stay</span> <b>${esc(dayY(s.arrive))} → ${esc(dayY(s.depart))}</b> <span class="muted"> · ${esc(s.nights)} nights</span></span></span>
        <span class="st"><span style="display:flex;gap:8px;align-items:center;justify-content:flex-end"><span class="pill ${s.state === "Paperwork done" || s.state === "Ready to close" || s.state === "Complete" ? "green" : s.state === "Not started" ? "" : s.state === "Cancelling" ? "red" : "amber"}">${esc(s.state)}</span>
          <span class="rbar" title="${s.got} of ${s.need} steps"><i style="width:${s.need ? Math.round(100 * s.got / s.need) : 0}%"></i></span></span>
          ${why.length && s.state !== "Complete" ? `<span class="why">${why.slice(0, 4).map(b => `<span class="pill amber">${esc(b)}</span>`).join("")}${why.length > 4 ? `<span class="muted">+${why.length - 4}</span>` : ""}</span>` : ""}</span></a>`; }).join("")
        : `<p class="muted">Nothing here${F.q || F.chan || F.held ? " with these filters" : ""}.</p>`}</div>`;
    $("#rqbody").querySelectorAll("[data-stage]").forEach(b => b.onclick = () => { F.stage = b.dataset.stage; F.held = ""; draw(); });
    $("#rqbody").querySelectorAll("[data-held]").forEach(b => b.onclick = () => { F.held = F.held === b.dataset.held ? "" : b.dataset.held; draw(); });
  };
  v.innerHTML = `<div class="page rpage"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="margin:0;flex:1">Check lists</h2>
      <a class="btn small" href="#/reservations/held">Held up report</a></div>${fresh()}
    <div class="rqbar"><input id="rq_q" placeholder="Search guest, home or res #" value="${esc(F.q)}">
      <select id="rq_c"><option value="">All types</option>${Object.entries(CH).map(([k, l]) => `<option value="${k}" ${F.chan === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select id="rq_a"><option value="">All neighborhoods</option>${[...new Set(B.stays.map(s => s.area).filter(Boolean))].map(a => [a, HOODS[a] || a]).sort((x, y) => x[1].localeCompare(y[1]))
        .map(([a, n]) => `<option value="${a}" ${F.area === a ? "selected" : ""}>${esc(n)}${n !== a ? " (" + a + ")" : ""}</option>`).join("")}</select></div>
    <div class="rqbar"><label class="muted" style="display:flex;gap:6px;align-items:center">Sort by <select id="rq_by" style="width:auto">${Object.entries(BY).map(([k, l]) => `<option value="${k}" ${F.by === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="muted" style="display:flex;gap:6px;align-items:center">from <input type="date" id="rq_from" value="${esc(F.from)}" style="width:auto"></label>
      <label class="muted" style="display:flex;gap:6px;align-items:center">to <input type="date" id="rq_to" value="${esc(F.to)}" style="width:auto"></label>
      ${F.from || F.to ? `<button class="btn small" id="rq_clr">Clear dates</button>` : ""}</div>
    <div id="rqbody"></div></div>`;
  $("#rq_q").oninput = e => { F.q = e.target.value; draw(); };
  $("#rq_c").onchange = e => { F.chan = e.target.value; draw(); };
  $("#rq_a").onchange = e => { F.area = e.target.value; draw(); };
  $("#rq_by").onchange = e => { F.by = e.target.value; draw(); };
  $("#rq_from").onchange = e => { F.from = e.target.value; queue(v); };
  $("#rq_to").onchange = e => { F.to = e.target.value; queue(v); };
  if($("#rq_clr")) $("#rq_clr").onclick = () => { F.from = F.to = ""; queue(v); };
  draw();
}

/* ---------- one check list */
async function card(v, res){
  v.innerHTML = `<div class="page rpage"><p class="muted">Loading…</p></div>`;
  try { await load(); } catch(e){ v.innerHTML = `<div class="page"><div class="card"><p>Couldn't load: ${esc(e.message)}</p></div></div>`; return; }
  const s = B && B.stays.find(x => x.res === res);
  if(!s){ v.innerHTML = `<div class="page"><div class="card"><a class="btn small" href="#/reservations">← Back</a><p>No check list for #${esc(res)} (only stays from 60 days back are here).</p></div></div>`; return; }
  const occ = s.occ || {}, grp = {};
  s.steps.forEach(t => (grp[t.grp] = grp[t.grp] || []).push(t));
  v.innerHTML = `<div class="page rpage">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><a class="btn small" href="#/reservations">← Back</a>
      <h2 style="margin:0;flex:1">${esc(s.unit || "")} · ${esc(s.guest || "")}</h2><span class="pill">${esc(s.state)}</span></div>
    ${fresh()}
    <div class="card">
      <div class="rfacts"><span>Res <a href="${folioUrl(s.res)}" target="_blank" rel="noopener"><b>#${esc(s.res)}</b></a></span><span><b>${esc(day(s.arrive))}</b> → <b>${esc(day(s.depart))}</b> · ${esc(s.nights)} nights</span>
        <span>${esc(s.type || "")} <span class="muted">(${esc(CH[s.chan])})</span></span><span>Track: <b>${esc(s.status || "")}</b></span>
        <span>${occ.adults || 0} adults${occ.children ? ", " + occ.children + " kids" : ""}${occ.pets ? `, <b>${occ.pets} pet${occ.pets > 1 ? "s" : ""}</b>` : ""}</span>
        ${s.vip ? `<span class="pill blue">VIP</span>` : ""}${s.dnr ? `<span class="pill red">Do not rent</span>` : ""}${s.list && s.list.asana ? `<a href="${esc(s.list.asana)}" target="_blank" rel="noopener" class="muted">Asana checklist (both run until Nov 9)</a>` : ""}</div>
      <div class="rmoney"><span class="muted">From Track</span><span>Campaign: <b>${esc(s.campaign || "—")}</b></span><span>Res agent: <b>${esc(s.agent || "—")}</b></span>
        <span>Guarantee: <b>${esc(s.guarantee || "—")}</b></span><span>Agreement: <b>${esc(s.agreement || "—")}</b></span>
        ${B.money ? `<span>Rent ${money(s.rent)}</span><span>Fees ${money(s.fees)}</span><span>Taxes ${money(s.taxes)}</span><span>Total <b>${money(s.total)}</b></span>` : ""}
        <span>Paid <b>${money(s.paid)}</b></span><span>Balance <b>${money(s.balance)}</b></span></div>
      ${s.ah ? `<div class="rmoney"><span class="muted">Autohost</span><span>Status: <b>${esc(s.ah.verify || "unknown")}</b></span>${s.ah.reason ? `<span>${esc(s.ah.reason)}</span>` : ""}<span>Portal: <b>${s.ah.portal ? "done" : "not done"}</b></span></div>` : ""}
      ${(B.bwMissing || []).includes(s.unit) ? `<div class="rmoney"><span class="muted">Breezeway</span><span>This home has no Breezeway id in the hub's home list, so its tasks can't be checked here.</span></div>`
        : s.bw && s.bw.length ? `<div class="rmoney" style="display:block"><span class="muted">Breezeway, ${esc(day(addDay(s.arrive, -5)))} to ${esc(day(addDay(s.depart, 1)))}</span>
          ${s.bw.map(t => `<div style="display:flex;gap:8px;flex-wrap:wrap;padding:3px 0"><b style="min-width:92px">${esc(day(t.sd))}</b><span style="flex:1;min-width:140px">${esc(t.n)} <span class="muted">· ${esc(t.dp)}</span></span>
            <span class="pill ${t.st === "done" ? "green" : t.st === "started" ? "blue" : ""}">${esc(t.st)}</span><span class="muted">${esc((t.who || []).join(", "))}</span></div>`).join("")}</div>`
        : bwKnown(s) ? `<div class="rmoney"><span class="muted">Breezeway</span><span>No tasks at this home from 5 days before arrival to the day after checkout.</span></div>` : ""}
      ${s.brevo && s.brevo.extra ? `<div class="rmoney"><span class="muted">Extra guests</span><span>${s.brevo.extra} with an email in Autohost · <b>${s.brevo.inBrevo}</b> in Brevo "AH Guest of Guest"</span></div>` : ""}
      ${s.hk && s.hk.length ? `<div class="rmoney"><span class="muted">#housekeeping @Cheree</span>${s.hk.slice(-4).map(m => `<a href="${esc(m.link)}" target="_blank" rel="noopener">${esc(when(m.at))}${m.by ? " · " + esc(m.by) : ""} ↗</a>`).join("")}</div>` : ""}
      ${s.heads.length ? `<div class="rrule warn" style="background:var(--amber-soft)"><div>⚠️ Heads-up for ${esc(s.unit)} before you book</div>${s.heads.map(a => `<div style="font-weight:${a.level === "warn" ? 600 : 400};margin-top:3px">• ${esc(a.text)} <span style="font-weight:400;opacity:.8">· ${esc(a.source)}</span></div>`).join("")}</div>` : ""}
      ${s.rules.map(r => `<div class="rrule ${r.kind}">${esc(r.text)} <span style="font-weight:400;opacity:.8">· ${esc(r.source)}</span></div>`).join("")}
    </div>
    <div class="card">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b style="flex:1">${s.got} of ${s.need} steps done</b>
        <label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="rx_ext" style="width:20px;height:20px;min-height:0" ${s.list && s.list.extending ? "checked" : ""}> Extending</label>
        <select id="rx_stage" style="width:auto">${Object.entries(STAGE).map(([k, l]) => `<option value="${k}" ${s.stage === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="rchips"><span class="muted" style="align-self:center">Waiting on</span>${WAIT.map(w => `<button class="rchip ${s.waiting.includes(w) ? "on" : ""}" data-wait="${esc(w)}">${esc(w)}</button>`).join("")}</div>
      ${s.blockers.length ? `<p class="muted" style="margin:4px 0">Held up by: ${s.blockers.map(b => `<span class="pill amber">${esc(b)}</span>`).join(" ")}</p>` : ""}
      ${Object.entries(grp).map(([g, ts]) => `<div class="rgrp"><h3>${esc(g)} <span class="muted" style="font-weight:600">${ts.filter(t => !t.opt && t.done).length}/${ts.filter(t => !t.opt).length}</span></h3>
        ${ts.map(t => `<label class="rstep ${t.opt ? "opt" : ""} ${t.done ? "done" : ""}"><input type="checkbox" data-step="${t.key}" ${t.done ? "checked" : ""}>
          <span class="l">${esc(t.label)}${t.opt ? ` <span class="muted">(if needed)</span>` : ""}</span>
          ${openFor(t.key, s)}<span class="who">${t.tick ? esc((t.tick.by || "") + (t.tick.src !== "hub" ? " · " + t.tick.src : "") + " · " + when(t.tick.at)) : t.auto ? `<span class="pill green">${t.auto} ✓</span>` : ""}</span></label>`).join("")}</div>`).join("")}
    </div>
    <div class="card"><b>Hold / hand-off note</b><textarea id="rx_hold" style="min-height:60px;margin-top:6px" placeholder="What the next person needs to know">${esc((s.list && s.list.hold) || "")}</textarea>
      <div style="display:flex;gap:8px;margin-top:6px;align-items:center"><button class="btn small" id="rx_hold_s">Save note</button><span class="muted" id="rx_msg"></span></div>
      <details class="acc2" id="rx_h"><summary><b>History</b></summary><div id="rx_hl" class="muted">Loading…</div></details></div>
  </div>`;
  const msg = t => $("#rx_msg").textContent = t;
  const set = async args => { const r = await sb.rpc("res_set", { p_res:s.res, ...args }); if(r.error){ msg("Couldn't save: " + r.error.message); return false; } await load(true); card(v, res); return true; };
  v.querySelectorAll("[data-step]").forEach(cb => cb.onchange = async () => {
    cb.disabled = true;
    const r = await sb.rpc("res_tick", { p_res:s.res, p_step:cb.dataset.step, p_done:cb.checked, p_note:null });
    if(r.error){ cb.checked = !cb.checked; cb.disabled = false; return msg("Couldn't save: " + r.error.message); }
    s.ticks = { ...(s.ticks || {}), [cb.dataset.step]:r.data }; prep(s); card(v, res);
  });
  $("#rx_stage").onchange = e => set({ p_stage:e.target.value });
  $("#rx_ext").onchange = e => set({ p_extending:e.target.checked });
  v.querySelectorAll("[data-wait]").forEach(b => b.onclick = () => { const w = b.dataset.wait, now = s.waiting.includes(w) ? s.waiting.filter(x => x !== w) : [...s.waiting, w]; set({ p_waiting:now }); });
  $("#rx_hold_s").onclick = async () => { if(await set({ p_hold:$("#rx_hold").value })) msg("Saved ✓"); };
  $("#rx_h").ontoggle = async () => { if(!$("#rx_h").open) return;
    const r = await sb.rpc("res_history", { p_res:s.res }); const h = r.data || { ticks:[], log:[] };
    const all = [...h.ticks.map(t => ({ at:t.at, t:`${t.d ? "Ticked" : "Unticked"} “${t.label || t.step}”`, by:t.by, src:t.src })),
                 ...h.log.map(l => ({ at:l.at, t:{ stage:"Stage → " + (STAGE[l.text] || l.text), waiting:"Waiting on: " + (l.text || "nothing"), extending:"Extending " + l.text, hold:"Note: " + (l.text || "(cleared)"), note:"Note: " + l.text, import:l.text }[l.kind] || l.text, by:l.by, src:l.src }))]
      .sort((a, b) => b.at < a.at ? -1 : 1);
    $("#rx_hl").innerHTML = all.length ? all.map(x => `<div class="rhist">${esc(when(x.at))} · <b>${esc(x.by || "")}</b>${x.src && x.src !== "hub" ? " (" + esc(x.src) + ")" : ""} — ${esc(x.t)}</div>`).join("") : "Nothing yet."; };
}

/* ---------- Held up report: open check lists by what holds them up */
async function held(v){
  v.innerHTML = `<div class="page rpage"><p class="muted">Loading…</p></div>`;
  try { await load(true); } catch(e){ v.innerHTML = `<div class="page"><div class="card"><p>Couldn't load: ${esc(e.message)}</p></div></div>`; return; }
  if(!B){ v.innerHTML = `<div class="page"><div class="card"><h2>No access</h2><p class="muted">This desk isn't on your teams. Ask Brandon or Kim.</p></div></div>`; return; }
  const open = B.stays.filter(s => s.stage === "in_progress" || s.stage === "cancelling"), by = {};
  open.forEach(s => [...s.blockers, ...s.waiting].forEach(b => (by[b] = by[b] || []).push(s)));
  v.innerHTML = `<div class="page rpage"><div style="display:flex;align-items:center;gap:10px"><a class="btn small" href="#/reservations">← Back</a><h2 style="margin:0">Held up reservations</h2></div>${fresh()}
    <p class="muted">${open.length} open check lists · ${open.filter(s => s.blockers.length || s.waiting.length).length} held up. A stay shows under every step it is waiting on.</p>
    ${Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([b, ss]) => `<div class="card"><h3 style="margin:0 0 6px">${esc(b)} <span class="pill amber">${ss.length}</span></h3>
      ${ss.sort((x, y) => x.arrive < y.arrive ? -1 : 1).map(s => `<a class="rrow" href="#/reservations/${encodeURIComponent(s.res)}"><span class="u">${esc(s.unit || "")}</span><span class="g">${esc(s.guest || "#" + s.res)}</span><span class="d">arrives ${esc(day(s.arrive))}</span></a>`).join("")}</div>`).join("")
      || `<div class="card"><p class="muted">Nothing is held up.</p></div>`}</div>`;
}

window.resCheckView = function(v){ css(); const a = hashArg(); return a === "held" ? held(v) : a ? card(v, a) : queue(v); };
})();
