/* Custom warning banners (hub_banners.sql). Brandon 2026-10-29: "admin and managers should be able to add custom warning banners that
   populate on the hub of their staff or for the admin of the whole business".
   - Banners for me show under the green banner on every page (hub_banners_mine), re-checked every 5 minutes; "Got it" hides one for me.
   - My settings ▸ "📣 Banners for my team" (only when hub_banner_teams() isn't empty: admins + managers) posts, edits and turns them off.
   The database decides who may post to which team and who sees what. */
(function(){
const TL = { admin:"Admin", front_desk:"Front desk", hk_manager:"Housekeeping manager", hub_clock:"Hub time clock", leasing:"Leasing", licensing:"Licensing",
  maint_crew:"Maintenance crew", maint_manager:"Maintenance manager", office_manager:"Office manager", owner_relations:"Owner relations", track_review:"Track review" };
const tl = k => TL[k] || k.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
const LV = { urgent:["🚨", "#9b1c1c"], warn:["⚠️", "#7a4b00"], info:["📣", "#1d4f7a"] };
const e = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
function css(){
  if(document.getElementById("bnrcss")) return;
  const s = document.createElement("style"); s.id = "bnrcss";
  s.textContent = `.cbanner{color:#fff;padding:8px 18px;font-weight:600;font-size:14px;flex:none;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.25)}
    .cbanner .bm{flex:1;min-width:200px;white-space:pre-wrap} .cbanner a{color:#fff;text-decoration:underline;white-space:nowrap} .cbanner .by{opacity:.8;font-weight:500;font-size:12.5px}
    .cbanner button{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:3px 12px;font:inherit;font-size:13px;cursor:pointer}
    .bnrlist .ord{flex-wrap:wrap} .bnrteams{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0} .bnrteams label{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--line-2);border-radius:999px;padding:6px 12px;font-weight:700;font-size:14px;cursor:pointer}`;
  document.head.appendChild(s);
}
let CB = { at:0, a:[] };
function draw(){
  css(); document.querySelectorAll(".cbanner").forEach(x => x.remove());
  const v = document.getElementById("view"); if(!v || !v.parentNode) return;
  CB.a.forEach(x => { const [ic, bg] = LV[x.level] || LV.warn;
    const b = document.createElement("div"); b.className = "cbanner"; b.style.background = bg; b.setAttribute("role", x.level === "urgent" ? "alert" : "status");
    b.innerHTML = `<span>${ic}</span><span class="bm">${e(x.msg)}${x.by_name ? ` <span class="by">— ${e(x.by_name)}</span>` : ""}</span>
      ${x.link ? `<a href="${e(x.link)}"${x.link.startsWith("http") ? ` target="_blank" rel="noopener"` : ""}>Open →</a>` : ""}${x.dismissible ? `<button data-cbx="${x.id}">Got it</button>` : ""}`;
    v.parentNode.insertBefore(b, v); });
  document.querySelectorAll("[data-cbx]").forEach(b => b.onclick = async () => { const id = +b.dataset.cbx;
    CB.a = CB.a.filter(x => x.id !== id); draw(); await sb.rpc("hub_banner_dismiss", { p_id:id }); });
  drawGw();
}
/* Brivo gateway alerts (hub_gateway_alerts.sql + _2, Brandon 2026-11-02): maintenance manager + admins only (the database decides; for anyone
   else gateway_alerts_mine() is null, so no banner and the page sends them Home). Brivo never says when a gateway comes back, so Chris
   decides. The banner is ONE line; "Open alerts" goes to #/gateways, where each alert is scheduled (the hub makes the Breezeway
   Restart Gateway task within a minute, brivo_tasks.py --queue) or marked back online. */
let GW = null;
const GWOPEN = g => ["open", "queued", "failed"].includes(g.status);
const day = d => new Date(d + "T12:00").toLocaleDateString([], { weekday:"short", month:"short", day:"numeric" });
const tmr = () => { const d = new Date(Date.now() + 864e5); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const ago = d => { const h = Math.round((Date.now() - new Date(d)) / 36e5); return h < 1 ? "just now" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`; };
/* One "Maintenance alerts" banner (hub_maint_alerts.sql, Brandon 2026-11-02): gateways + duplicate jobs + guest-reported jobs,
   counts only, "Open" goes to #/maint_alerts (maint_alerts.js). ✕ hides it on this device until something new shows up. */
let MA = null;
const maSig = () => { const a = MA || {}; return [...(a.dups || []).map(g => "d" + g.id), ...(a.guest || []).filter(j => !j.sched || j.sched.status === "failed").map(j => "g" + j.id),
  ...(GW || []).filter(g => g.status === "open" || g.status === "failed").map(g => "w" + g.id), ...(a.season || []).map(j => "s" + j.id), "w" + (((a.weather || {}).ready || 0) + "." + ((a.weather || {}).blockers || 0) + "." + ((a.weather || {}).checks || 0))].sort().join(","); };
function drawGw(){
  document.querySelectorAll(".gwbanner").forEach(x => x.remove());
  const v = document.getElementById("view"); if(!v || !v.parentNode || /^#\/(gateways|maint_alerts|maint_weather)/.test(location.hash)) return;
  const gw = (GW || []).filter(g => g.status === "open" || g.status === "failed").length, d = ((MA || {}).dups || []).length,
        gj = ((MA || {}).guest || []).filter(j => !j.sched || j.sched.status === "failed").length, sn = ((MA || {}).season || []).length, sig = maSig(), wx = (MA || {}).weather || {};
  if(!gw && !d && !gj && !sn && !wx.ready && !wx.blockers && !wx.checks) return;
  try { if(localStorage.getItem("mm_ma_hide") === sig) return; } catch(_){}
  const parts = [gw && `${gw} gateway${gw === 1 ? "" : "s"} offline`, d && `${d} duplicate job${d === 1 ? "" : "s"}`, gj && `${gj} guest-reported job${gj === 1 ? "" : "s"} to schedule`, sn && `${sn} out-of-season job${sn === 1 ? "" : "s"}`,
    wx.ready && `${wx.ready} weather job${wx.ready === 1 ? "" : "s"} to schedule`, wx.blockers && `${wx.blockers} outdoor job${wx.blockers === 1 ? "" : "s"} on a bad-weather day`,
    wx.checks && `${wx.checks} heat tape check${wx.checks === 1 ? "" : "s"}`].filter(Boolean);
  const onlyWx = !gw && !d && !gj && !sn;   // Weather plan (hub_weather_plan.sql, 2026-11-02): its own page
  const b = document.createElement("div"); b.className = "cbanner gwbanner"; b.style.background = "#7a4b00"; b.setAttribute("role", "status");
  b.innerHTML = `<span>🔧</span><span class="bm"><b>Maintenance alerts</b>: ${parts.join(" · ")}</span>${onlyWx ? "" : `<a href="#/maint_alerts">Open →</a>`}${wx.ready || wx.blockers || wx.checks ? `<a href="#/maint_weather">Weather plan →</a>` : ""}<button data-mahide title="Hide until something new comes in">✕</button>`;
  v.parentNode.insertBefore(b, v);
  b.querySelector("[data-mahide]").onclick = () => { try { localStorage.setItem("mm_ma_hide", sig); } catch(_){} b.remove(); };
}
/* Shared by the gateway + maintenance alert pages (Brandon 2026-11-02): pick who a hub-made task goes to (Breezeway people, Chris first),
   and suggest the home's next empty days (no guest or owner stay; a check-out day counts as empty) from cal_stays(). */
let PPL = null, STAYS = null;
window.mmPeople = async () => { if(PPL) return PPL; try { const r = await sb.rpc("maint_people"); PPL = r.error ? [] : (r.data || []); } catch(_){ PPL = []; } return PPL; };
window.mmPick = (attr, id) => `<select ${attr}="${id}" title="Assign to">${(PPL || []).map(p => `<option value="${p.id}">${e(p.name)}</option>`).join("") || `<option value="">Chris Robinson</option>`}</select>`;
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
window.mmStays = async () => { if(STAYS) return STAYS; const t = new Date(), to = new Date(Date.now() + 45 * 864e5);
  try { const r = await sb.rpc("cal_stays", { p_from:iso(t), p_to:iso(to) }); STAYS = (r.data && r.data.stays) || []; } catch(_){ STAYS = []; } return STAYS; };
window.mmFree = (home, n = 4) => { const base = h => String(h || "").replace(/^(2H-|L-)/, "").toUpperCase(), hb = base(home), out = [];
  for(let i = 1; i <= 45 && out.length < n; i++){ const d = iso(new Date(Date.now() + i * 864e5));
    if(!(STAYS || []).some(s => base(s.unit) === hb && s.in <= d && d < s.out)) out.push(d); }
  return out; };
window.mmChips = (home, attr, id) => { const f = window.mmFree(home); return f.length ? `<span class="muted" style="font-size:12.5px">Next empty:</span> ${f.map(d =>
  `<button type="button" class="btn" style="padding:2px 9px;font-size:12.5px" data-${attr}="${id}" data-day="${d}">${new Date(d + "T12:00").toLocaleDateString([], { weekday:"short", month:"short", day:"numeric" })}</button>`).join(" ")}` : ""; };
window.mmChipWire = (root, attr, inputAttr) => root.querySelectorAll(`[data-${attr}]`).forEach(b => b.onclick = () => { const i = root.querySelector(`[${inputAttr}="${b.dataset[attr]}"]`); if(i) i.value = b.dataset.day; });
window.gatewayView = async function(v){
  await loadGw(); await Promise.all([window.mmPeople(), window.mmStays()]);
  if(GW === null){ location.replace("#/home"); return; }
  const open = GW.filter(GWOPEN), done = GW.filter(g => !GWOPEN(g));
  const card = g => {
    const st = g.status === "queued" ? `<span class="pill">Making the Breezeway task for ${day(g.due)}…</span>`
      : g.status === "scheduled" ? `<span class="pill">Reset scheduled ${day(g.due)}</span>${g.bw_url ? ` <a href="${e(g.bw_url)}" target="_blank" rel="noopener">Open in Breezeway ↗</a>` : ""}`
      : g.status === "cleared" ? `<span class="pill">Back online</span>` : "";
    const fd = g.fd_ticket > 0 ? ` · <a href="https://moosemanagement.freshdesk.com/a/tickets/${g.fd_ticket}" target="_blank" rel="noopener">Brivo email ↗</a>` : "";
    const act = (g.status === "open" || g.status === "failed") ? `<div class="gwact">${g.status === "failed" ? `<div style="color:#9b1c1c;margin-bottom:6px">Couldn't schedule: ${e(g.note || "")}</div>` : ""}
        <label>Reset on <input type="date" data-gwd="${g.id}" value="${(window.mmFree(g.home, 1)[0]) || tmr()}"></label> for ${window.mmPick("data-gwp", g.id)}
        <span style="flex-basis:100%"></span>${window.mmChips(g.home, "gwc2", g.id)}<span style="flex-basis:100%"></span>
        <button class="btn primary" data-gws="${g.id}">Schedule reset in Breezeway</button> <button class="btn" data-gwc="${g.id}">It's back online</button>
        <input type="checkbox" data-gwk="${g.id}" title="Pick for scheduling all at once"></div>` : "";
    const who = g.asked_name && !GWOPEN(g) ? ` · ${e(g.asked_name)}` : g.status === "queued" && g.asked_name ? ` · asked by ${e(g.asked_name)}` : "";
    return `<div class="card gwcard"><div><b style="font-size:17px">${e(g.home)}</b> · alert ${when(g.alert_at)} (${ago(g.alert_at)})${fd}${who}</div>
      ${g.title ? `<div class="muted" style="font-size:13px;margin-top:2px">${e(g.title)}</div>` : ""}${st ? `<div style="margin-top:6px">${st}</div>` : ""}${act}</div>`;
  };
  const many = open.filter(g => g.status === "open" || g.status === "failed").length > 1;
  v.innerHTML = `<style>.gwcard{margin-bottom:10px} .gwact{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px} .gwact input[type=date]{margin-left:6px}
      .gwcard .btn.primary,.gwcard .btn.primary:hover{background:#3c5f12;border-color:#3c5f12;color:#fff} .gwcard .pill{display:inline-block;background:#f3ead7;color:#5a3a00;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:700}</style>
    <div class="card"><h2 style="margin:0 0 4px">📡 Brivo gateway alerts</h2>
      <div class="muted">Brivo emails when a gateway goes offline but never when it comes back, and they often come back by themselves within 48 hours.
      Check the Brivo app, then either schedule a reset (the hub makes the "Restart Gateway" task for Chris in Breezeway within a minute) or mark it back online.</div>
      ${many ? `<div class="gwact"><label>Reset the ticked ones on <input type="date" id="gwalld" value="${tmr()}"></label><button class="btn" id="gwall">Schedule ticked</button></div>` : ""}</div>
    ${open.length ? open.map(card).join("") : `<div class="card">No gateway alerts right now.</div>`}
    ${done.length ? `<h3 style="margin:18px 0 8px">Last 14 days</h3>${done.map(card).join("")}` : ""}`;
  if(!many) v.querySelectorAll("[data-gwk]").forEach(x => x.remove());
  const go = async (id, act, due) => { const pp = v.querySelector(`[data-gwp="${id}"]`);
    const r = await sb.rpc("gateway_alert_act", { p_id:id, p_act:act, p_due:due || null, p_person:pp && pp.value ? +pp.value : null }); if(r.error) alert(r.error.message.replace(/^.*?: /, "")); };
  window.mmChipWire(v, "gwc2", "data-gwd");
  v.querySelectorAll("[data-gws]").forEach(x => x.onclick = async () => { const d = v.querySelector(`[data-gwd="${x.dataset.gws}"]`); x.disabled = true; await go(+x.dataset.gws, "schedule", d && d.value); gatewayView(v); });
  v.querySelectorAll("[data-gwc]").forEach(x => x.onclick = async () => { x.disabled = true; await go(+x.dataset.gwc, "clear"); gatewayView(v); });
  const all = v.querySelector("#gwall");
  if(all) all.onclick = async () => { const ids = [...v.querySelectorAll("[data-gwk]:checked")].map(x => +x.dataset.gwk); if(!ids.length) return alert("Tick the homes to schedule first.");
    all.disabled = true; for(const id of ids) await go(id, "schedule", v.querySelector("#gwalld").value); gatewayView(v); };
  clearTimeout(window._gwT); if(open.some(g => g.status === "queued")) window._gwT = setTimeout(() => { if(location.hash.startsWith("#/gateways")) gatewayView(v); }, 20e3);
  drawGw();
};
async function loadGw(){ try { const r = await sb.rpc("gateway_alerts_mine"); if(!r.error) GW = r.data; } catch(_){ }
  if(GW !== null){ try { const m = await sb.rpc("maint_alerts"); if(!m.error) MA = m.data; } catch(_){ } } }
window.mmLoadAlerts = async () => { await loadGw(); drawGw(); return { GW, MA }; };
window.customBanners = async function(force){
  if(typeof ME === "undefined" || !ME || typeof sb === "undefined") return;
  if(force || Date.now() - CB.at > 5 * 60e3){ const r = await sb.rpc("hub_banners_mine"); CB = { at:Date.now(), a: r.error ? CB.a : (r.data || []) }; await loadGw(); }
  draw();
};
const boot = setInterval(() => { if(typeof ME !== "undefined" && ME && document.getElementById("view")){ clearInterval(boot); customBanners(true);
  setInterval(() => customBanners(false), 60e3); window.addEventListener("hashchange", () => customBanners(false)); } }, 1000);

// ---- My settings card: post / edit / turn off ----
const pad = n => String(n).padStart(2, "0");
const local = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const when = d => new Date(d).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
window.bannersCard = async function(box){
  if(!box) return;
  const t = await sb.rpc("hub_banner_teams"); const teams = t.data || [];
  if(t.error || !teams.length) return box.innerHTML = "";
  let list = [], ed = null, msg = "";
  const blank = () => ({ id:null, msg:"", level:"warn", link:"", for_all:false, teams:teams.length === 1 ? teams.slice() : [], starts_at:new Date(), ends_at:new Date(Date.now() + 7 * 864e5), dismissible:true, off:false });
  const load = async () => { const r = await sb.rpc("hub_banners_manage"); list = r.data || []; };
  const live = x => !x.off && new Date(x.ends_at) > new Date() && new Date(x.starts_at) <= new Date();
  const state = x => x.off ? "Off" : new Date(x.ends_at) <= new Date() ? "Ended" : new Date(x.starts_at) > new Date() ? "Starts " + when(x.starts_at) : "Showing now";
  const who = x => x.for_all ? "Everyone" : x.teams.map(tl).join(", ");
  const form = () => { const x = ed; return `<div class="card" style="margin-top:10px;background:var(--bg,transparent)">
      <b>${x.id ? "Edit banner" : "New banner"}</b>
      <label class="field" style="margin-top:8px"><span>What it says <span class="muted">(300 letters max)</span></span><textarea id="bnmsg" maxlength="300" rows="2">${e(x.msg)}</textarea></label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
        <label class="field" style="flex:1;min-width:150px"><span>Kind</span><select id="bnlv">${[["warn","⚠️ Warning (amber)"],["urgent","🚨 Urgent (red)"],["info","📣 Note (blue)"]].map(([k, l]) => `<option value="${k}" ${x.level === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field" style="flex:2;min-width:200px"><span>Link <span class="muted">(optional: https://… or a hub page like #/checks)</span></span><input id="bnlink" value="${e(x.link || "")}"></label></div>
      <p class="muted" style="margin:10px 0 0">Who sees it</p>
      <div class="bnrteams">${ME.admin ? `<label><input type="checkbox" id="bnall" ${x.for_all ? "checked" : ""}> Everyone</label>` : ""}
        ${teams.map(k => `<label><input type="checkbox" data-bnt="${e(k)}" ${x.teams.includes(k) ? "checked" : ""} ${x.for_all ? "disabled" : ""}> ${e(tl(k))}</label>`).join("")}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <label class="field" style="flex:1;min-width:180px"><span>Starts</span><input type="datetime-local" id="bnst" value="${local(x.starts_at)}"></label>
        <label class="field" style="flex:1;min-width:180px"><span>Ends <span class="muted">(90 days max)</span></span><input type="datetime-local" id="bnen" value="${local(x.ends_at)}"></label></div>
      <label style="display:flex;gap:8px;align-items:center;margin:10px 0;font-weight:700;cursor:pointer"><input type="checkbox" id="bndis" ${x.dismissible ? "checked" : ""}> People can tap "Got it" to hide it</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn primary small" id="bnsave">${x.id ? "Save" : "Post banner"}</button><button class="btn small" id="bncancel">Cancel</button><span class="muted" id="bnmsg2"></span></div></div>`; };
  const paint = () => {
    box.innerHTML = `<details class="card acc" id="bnrcard" open><summary><b style="font-size:17px">📣 Banners for my team</b><span class="muted">${list.filter(live).length} showing</span></summary>
      <p class="muted" style="margin:4px 0 8px">A banner shows across the top of every hub page for the people you pick, until it ends or you turn it off.</p>
      ${ed ? form() : `<button class="btn small" id="bnnew">+ New banner</button>`}<span class="muted" style="margin-left:8px">${e(msg)}</span>
      <div class="bnrlist" style="margin-top:10px">${list.map(x => `<div class="ord"><b style="flex:1;min-width:200px">${(LV[x.level] || LV.warn)[0]} ${e(x.msg)}
          <div class="muted" style="font-weight:600;font-size:13px">${e(state(x))} · ends ${when(x.ends_at)} · ${e(who(x))} (${x.reach} people${x.dismissible ? `, ${x.seen} tapped Got it` : ""})${x.mine ? "" : " · by " + e(x.by_name || "?")}</div></b>
        <button class="btn small" data-bne="${x.id}">Edit</button>${new Date(x.ends_at) > new Date() ? `<button class="btn small" data-bno="${x.id}">${x.off ? "Turn on" : "Turn off"}</button>` : ""}</div>`).join("") || `<p class="muted">No banners yet.</p>`}</div></details>`;
    const q = s => box.querySelector(s);
    if(q("#bnnew")) q("#bnnew").onclick = () => { ed = blank(); msg = ""; paint(); };
    box.querySelectorAll("[data-bne]").forEach(b => b.onclick = () => { const x = list.find(y => y.id === +b.dataset.bne); ed = Object.assign({}, x, { teams:x.teams.filter(k => teams.includes(k)) }); msg = ""; paint(); });
    box.querySelectorAll("[data-bno]").forEach(b => b.onclick = async () => { const x = list.find(y => y.id === +b.dataset.bno); b.disabled = true;
      const r = await save(Object.assign({}, x, { off:!x.off })); msg = r.error ? "Didn't save: " + r.error.message : (x.off ? "Turned back on." : "Turned off."); await load(); paint(); customBanners(true); });
    if(!ed) return;
    if(q("#bnall")) q("#bnall").onchange = () => box.querySelectorAll("[data-bnt]").forEach(c => c.disabled = q("#bnall").checked);
    q("#bncancel").onclick = () => { ed = null; paint(); };
    q("#bnsave").onclick = async () => {
      const x = { id:ed.id, msg:q("#bnmsg").value.trim(), level:q("#bnlv").value, link:q("#bnlink").value.trim(), for_all:!!(q("#bnall") && q("#bnall").checked),
        teams:[...box.querySelectorAll("[data-bnt]:checked")].map(c => c.dataset.bnt), starts_at:q("#bnst").value ? new Date(q("#bnst").value) : new Date(),
        ends_at:q("#bnen").value ? new Date(q("#bnen").value) : null, dismissible:q("#bndis").checked, off:ed.off };
      const bad = x.msg.length < 3 ? "Type what the banner says." : !x.for_all && !x.teams.length ? "Pick who sees it." : !x.ends_at || x.ends_at <= x.starts_at ? "The end has to be after the start."
        : x.link && !/^(https:\/\/|#\/)/.test(x.link) ? "Links must start with https:// or #/." : "";
      if(bad) return q("#bnmsg2").textContent = bad;
      q("#bnsave").disabled = true;
      const r = await save(x);
      if(r.error){ q("#bnsave").disabled = false; return q("#bnmsg2").textContent = "Didn't save: " + r.error.message; }
      msg = x.id ? "Saved." : "Posted. It shows for those people within 5 minutes, or when they open a page."; ed = null; await load(); paint(); customBanners(true); };
  };
  const save = x => sb.rpc("hub_banner_save", { p_id:x.id, p_msg:x.msg, p_level:x.level, p_link:x.link || null, p_all:!!x.for_all, p_teams:x.for_all ? [] : x.teams,
    p_starts:new Date(x.starts_at).toISOString(), p_ends:new Date(x.ends_at).toISOString(), p_dismissible:x.dismissible, p_off:!!x.off });
  css(); await load(); paint();
};
})();
