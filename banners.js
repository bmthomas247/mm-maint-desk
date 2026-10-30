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
}
window.customBanners = async function(force){
  if(typeof ME === "undefined" || !ME || typeof sb === "undefined") return;
  if(force || Date.now() - CB.at > 5 * 60e3){ const r = await sb.rpc("hub_banners_mine"); CB = { at:Date.now(), a: r.error ? CB.a : (r.data || []) }; }
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
