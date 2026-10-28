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
.rstep .who{font-size:12px;color:var(--muted);white-space:nowrap} .rstep.done .l{text-decoration:line-through;text-decoration-color:var(--line-2)}
.rhist{font-size:13px;border-top:1px solid var(--line);padding:6px 0}
@media(min-width:1000px){ .rpage{max-width:1180px!important} }
@media(max-width:640px){ .rrow{flex-wrap:wrap;gap:4px 10px} .rrow .g{order:3;flex-basis:100%;white-space:normal} .rrow .d{flex:1} .rrow .rbar{display:none} }`;
const CH = { abnb:"Airbnb", vrbo:"VRBO / VRPC / Phone", ws:"Whimstay / BDC / Hopper", oguest:"Owner guest", owner:"Owner stay" };
const STAGE = { in_progress:"In progress", checkout:"Checkout", owner_done:"Owner stay done", cancelling:"Cancellations", closed:"Closed" };
const WAIT = ["Guest to reply", "Owner to reply"];
let B = null, loadedAt = 0;
const money = v => v == null ? "—" : "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 });
const day = s => s ? new Date(s + "T12:00").toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }) : "";
const when = s => s ? new Date(s).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "";
const folioUrl = r => "https://moosemanagement.trackhs.com/pms/guest-folio/view/?id=" + encodeURIComponent(r);

async function load(force){
  if(B && !force && Date.now() - loadedAt < 60000) return B;
  const r = await sb.rpc("res_board"); if(r.error) throw r.error;
  B = r.data; loadedAt = Date.now();
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
};
const addDay =(d, n) => { const x = new Date(d + "T12:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const bwHas = (s, dp, re, from, to, who) => (s.bw || []).some(t => t.dp === dp && t.sd >= from && t.sd <= to && re.test(t.n) && (!who || (t.who || []).some(w => who.test(w))));
const bwClean = s => bwHas(s, "housekeeping", /^(?!.*(assessment|spring)).*(clean)/i, s.depart, s.depart);
const bwInOut = s => bwHas(s, "inspection", /check-?in/i, s.arrive, s.arrive) && bwHas(s, "inspection", /check-?out/i, s.depart, s.depart);
// Only trust "no clean left" when this home was in the Breezeway pull (it has a Breezeway id and the stay is in the window)
const bwKnown = s => !!B.bwUpdated && !(B.bwMissing || []).includes(s.unit) && s.depart >= addDay(B.today, -7) && s.arrive <= addDay(B.today, 75);
const AUTO_SRC = { ah_verified:"Autohost", bw_pre_out:"Breezeway", bw_owner_next_chris:"Breezeway", bw_in_out:"Breezeway", bw_og:"Breezeway", bw_wg:"Breezeway", bw_no_clean:"Breezeway" };
function prep(s){
  const c = conds(s), ticks = s.ticks || {};
  s.steps = B.steps.filter(t => t.chans.includes(s.chan) && t.cond.every(k => c[k]))
    .map(t => { const k = ticks[t.key], au = t.auto && autoOk(s, t.auto);
      return { ...t, tick:k, auto:au ? (AUTO_SRC[t.auto] || "Track") : null, done:k ? k.d : !!au }; });
  const req = s.steps.filter(t => !t.opt);
  s.need = req.length; s.got = req.filter(t => t.done).length;
  s.blockers = [...new Set(req.filter(t => !t.done && t.blocker).map(t => t.blocker))];
  const today = B.today;
  s.stage = (s.list && s.list.stage) || (s.status === "Cancelled" ? "cancelling" : s.depart < today ? (s.chan === "owner" ? "owner_done" : "checkout") : "in_progress");
  s.waiting = (s.list && s.list.waiting) || [];
  s.rules = B.rules.filter(r => { const p = r.unit.toUpperCase(), u = (s.unit || "").toUpperCase(); return p.endsWith(" %") ? u.startsWith(p.slice(0, -1)) : u === p; });
  s.state = s.stage === "closed" ? "Complete" : s.status === "Cancelled" && s.stage !== "closed" ? "Cancelling" : s.got === 0 ? "Not started"
    : s.got >= s.need ? (s.depart < today ? "Ready to close" : "Paperwork done") : s.waiting.length ? "Waiting" : "In progress";
}
function css(){ if(!document.getElementById("rescss")){ const st = document.createElement("style"); st.id = "rescss"; st.textContent = CSS; document.head.appendChild(st); } }
const fresh = () => `<p class="muted" style="margin:4px 0 10px">Source: Track reservations, updated ${esc(when(B.updated))}${B.ahUpdated ? ` · Autohost, updated ${esc(when(B.ahUpdated))}` : ""}${B.bwUpdated ? ` · Breezeway, updated ${esc(when(B.bwUpdated))}` : ""}</p>`;

/* ---------- queue */
const F = { q:"", chan:"", stage:"in_progress", held:"" };
async function queue(v){
  v.innerHTML = `<div class="page rpage"><h2>Check lists</h2><p class="muted">Loading…</p></div>`;
  try { await load(); } catch(e){ v.innerHTML = `<div class="page"><div class="card"><p>Couldn't load the check lists: ${esc(e.message)}</p></div></div>`; return; }
  if(!B){ v.innerHTML = `<div class="page"><div class="card"><h2>No access</h2><p class="muted">This desk isn't on your teams. Ask Brandon or Kim.</p></div></div>`; return; }
  const draw = () => {
    const base = B.stays.filter(s => (!F.chan || s.chan === F.chan) && (!F.q || [s.res, s.unit, s.guest].join(" ").toLowerCase().includes(F.q.toLowerCase())));
    const inStage = base.filter(s => s.stage === F.stage);
    const rows = inStage.filter(s => !F.held || s.blockers.includes(F.held) || s.waiting.includes(F.held));
    const cnt = k => base.filter(s => s.stage === k).length;
    const held = {}; inStage.forEach(s => [...s.blockers, ...s.waiting].forEach(b => held[b] = (held[b] || 0) + 1));
    $("#rqbody").innerHTML = `
      <div class="rchips">${Object.entries(STAGE).map(([k, l]) => `<button class="rchip ${F.stage === k ? "on" : ""}" data-stage="${k}">${l}<span class="n">${cnt(k)}</span></button>`).join("")}</div>
      ${Object.keys(held).length ? `<div class="rchips"><span class="muted" style="align-self:center">Held up by</span>${Object.entries(held).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<button class="rchip ${F.held === k ? "on" : ""}" data-held="${esc(k)}">${esc(k)}<span class="n">${n}</span></button>`).join("")}</div>` : ""}
      <div class="card" style="padding:6px 12px">${rows.length ? rows.map(s => `<a class="rrow" href="#/reservations/${encodeURIComponent(s.res)}">
        <span class="u">${esc(s.unit || "")}</span><span class="g">${esc(s.guest || "#" + s.res)} <span class="muted">· ${esc(CH[s.chan])}</span>${s.vip ? ` <span class="pill blue">VIP</span>` : ""}${s.dnr ? ` <span class="pill red">DNR</span>` : ""}</span>
        <span class="d">${esc(day(s.arrive))} → ${esc(day(s.depart))}</span>
        <span class="pill ${s.state === "Paperwork done" || s.state === "Ready to close" || s.state === "Complete" ? "green" : s.state === "Not started" ? "" : s.state === "Cancelling" ? "red" : "amber"}">${esc(s.state)}</span>
        <span class="rbar" title="${s.got} of ${s.need} steps"><i style="width:${s.need ? Math.round(100 * s.got / s.need) : 0}%"></i></span></a>`).join("")
        : `<p class="muted">Nothing here${F.q || F.chan || F.held ? " with these filters" : ""}.</p>`}</div>`;
    $("#rqbody").querySelectorAll("[data-stage]").forEach(b => b.onclick = () => { F.stage = b.dataset.stage; F.held = ""; draw(); });
    $("#rqbody").querySelectorAll("[data-held]").forEach(b => b.onclick = () => { F.held = F.held === b.dataset.held ? "" : b.dataset.held; draw(); });
  };
  v.innerHTML = `<div class="page rpage"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="margin:0;flex:1">Check lists</h2>
      <a class="btn small" href="#/reservations/held">Held up report</a></div>${fresh()}
    <div class="rqbar"><input id="rq_q" placeholder="Search guest, home or res #" value="${esc(F.q)}">
      <select id="rq_c"><option value="">All types</option>${Object.entries(CH).map(([k, l]) => `<option value="${k}" ${F.chan === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div id="rqbody"></div></div>`;
  $("#rq_q").oninput = e => { F.q = e.target.value; draw(); };
  $("#rq_c").onchange = e => { F.chan = e.target.value; draw(); };
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
          <span class="who">${t.tick ? esc((t.tick.by || "") + (t.tick.src !== "hub" ? " · " + t.tick.src : "") + " · " + when(t.tick.at)) : t.auto ? `<span class="pill green">${t.auto} ✓</span>` : ""}</span></label>`).join("")}</div>`).join("")}
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
