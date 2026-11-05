/* build_list.js (Brandon 2026-11-04: "make the build list onto the hub for jeff and i access so we can get through it together and not
   working on the same thing at the same time unless we want to"). Sidebar foot ▸ Build list (#/build, desk `build` = admins + Jeff by a
   per-person Show). Loaded by hub.html; uses its sb / $ / esc / ME / niceErr. Data: hub_build_items (RLS hub_can('build')), changes only
   through build_item_save / build_item_claim / build_item_release (hub_build_list.sql); every change in hub_build_log.
   "I'm on it" puts your name on an item; anyone else sees it taken and has to choose "Work on it together" to join.
   Look = the Locks office page (locks-desk.html Homes tab): icon pill tabs, white stat tiles, one filter card of labeled drop-downs,
   grey uppercase section headings that fold, item cards in a grid. Office-desk width. */
(function(){
// Items are filed under the hub's own sidebar desks (Brandon 2026-11-04), in sidebar order; Penny + Whole hub for the rest.
const AREAS = [
  ["homes","Property Details"], ["vendors","Vendors"], ["calendar","Calendar"], ["maintenance","Maintenance"], ["locks","Locks"], ["housekeeping","Housekeeping"],
  ["reservations","Reservations"], ["guest","Guest"], ["reviews","Reviews"], ["owners","Owners"], ["rates","Rates"], ["staffing","Staffing"], ["licensing","Licensing"],
  ["tools","Tools"], ["advertising","Advertising"], ["freshdesk","Freshdesk"], ["lease","Lease"], ["penny","Penny"], ["hub","Whole hub"]];
const AL = Object.fromEntries(AREAS), AO = Object.fromEntries(AREAS.map(([k], n) => [k, n]));
// statuses (Brandon 2026-11-04): Queued, Started, Paused, Finishing touches (+ Done); keys stay todo / doing / waiting / finishing / done
const ST = { todo:"Queued", doing:"Started", waiting:"Paused", finishing:"Finishing touches", done:"Done" }, PRI = { now:"Now", next:"Next", later:"Later" }, PO = { now:0, next:1, later:2 };
const ORD = [["area", "By desk"], ["pri", "High → low priority"], ["abc", "A → Z"]];
// Who's on it (Brandon 2026-11-04: "Anyone, Nobody, Brandon, Jeff"): value = the worker name to match
const WHO = [["all","Anyone"], ["free","Nobody"], ["Brandon Thomas","Brandon"], ["Jeff","Jeff"]];
const BL = { tab:"list", rows:null, fS:"open", fP:"all", fA:"all", fW:"all", fJ:false, q:"", order:"area", open:null, hist:{}, fold:{}, timer:null };
try { const o = localStorage.getItem("bl_order"); BL.order = ORD.some(([k]) => k === o) ? o : "area"; BL.fold = JSON.parse(localStorage.getItem("bl_fold") || "{}") || {}; } catch(e) {}
const err = e => window.niceErr ? niceErr(e) : (e && e.message) || String(e);
const fday = s => s ? new Date(s).toLocaleDateString(undefined, { month:"short", day:"numeric" }) : "";
const meName = () => (typeof ME !== "undefined" && ME && ME.name) || "";
const mine = r => (r.worker_names || []).includes(meName());
const first = n => String(n || "").split(" ")[0];
const SVG = {
  list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  me:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' };
const ico = k => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[k]}</svg>`;
function css(){
  if(document.getElementById("blcss")) return;
  const s = document.createElement("style"); s.id = "blcss";
  s.textContent = `.bl{--bl-forest:#3c5f12;--bl-green:#5b8a1e;--bl-moose:#88B535;--bl-shadow:0 1px 2px rgba(20,40,25,.06),0 4px 14px rgba(20,40,25,.06);font-family:"Manrope",Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-feature-settings:"tnum" 1}
.page.bl{max-width:min(1800px,100%)}   /* office-desk page (Brandon 2026-11-04: "we can make it wider") */
.bl .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.bl .tabs button{display:inline-flex;align-items:center;gap:8px;border-radius:14px;min-height:42px;padding:9px 16px 9px 12px;font-weight:800;font-size:14.5px;background:var(--card);border:1px solid var(--line);color:var(--ink);box-shadow:var(--bl-shadow)}
.bl .tabs button.on{background:var(--bl-green);border-color:var(--bl-green);color:#fff}
.bl .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:0 0 12px}
.bl .tile{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--bl-shadow);padding:12px 14px} .bl .tile b{display:block;font-size:28px;font-weight:800;letter-spacing:-.02em;line-height:1.1} .bl .tile b small{font-size:15px;color:var(--muted);font-weight:700}
.bl .tile span{font-size:13px;color:var(--ink-2);font-weight:600}
.bl .bar{height:6px;background:var(--line);border-radius:99px;overflow:hidden;margin:8px 0 0} .bl .bar i{display:block;height:100%;background:var(--bl-moose)}
.bl .filt{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--bl-shadow);padding:12px 16px;display:grid;gap:10px;margin:0 0 6px}
.bl .fr{display:grid;grid-template-columns:120px minmax(0,1fr);gap:10px;align-items:center} .bl .fr > select{max-width:260px}
.bl .fr .lab{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.bl .fr:last-child{display:flex} .bl .fr:last-child .lab{width:120px}
.bl .filt label{display:grid;gap:4px;font-size:13.5px;font-weight:700;color:var(--ink)} .bl .filt label.wide{grid-column:span 2}
.bl .filt select,.bl .filt input{border-radius:13px;min-height:44px;font-size:15px;padding:0 12px;border:1px solid var(--line-2,#cfd8cb);background:var(--card);color:var(--ink)}
.bl .seg{display:flex;gap:6px;flex-wrap:wrap} .bl .seg button{flex:0 0 auto;width:auto;white-space:nowrap;border-radius:11px;min-height:38px;padding:6px 14px;font-weight:700;font-size:14px;border:1px solid var(--line-2,#cfd8cb);background:var(--card);color:var(--ink)}
.bl .seg button.on{background:var(--bl-green);border-color:var(--bl-green);color:#fff;font-weight:800}
.bl .sech{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:20px 0 8px;padding:0 2px 6px;border-bottom:1px solid var(--line);cursor:pointer;user-select:none}
.bl .sech b{font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)} .bl .sech b span{font-weight:700}
.bl .sech i{font-style:normal;color:var(--muted);font-size:14px;transition:transform .15s} .bl .sech.shut i{transform:rotate(180deg)}
.bl .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px}
.bl .it{position:relative;background:var(--card);border:1px solid var(--line);border-left:6px solid #cfd8cb;border-radius:18px;box-shadow:var(--bl-shadow);padding:14px 16px;display:flex;flex-direction:column;gap:6px;min-width:0}
.bl .it.p-now{border-left-color:#c8382b} .bl .it.p-next{border-left-color:#b5770a} .bl .it.p-later{border-left-color:var(--bl-moose)}
.bl .it.open{grid-column:1/-1}
.bl .it[data-s="done"]{opacity:.7} .bl .it[data-s="done"] .t{text-decoration:line-through}
.bl .it.taken{background:color-mix(in srgb,#1f6fb2 7%,var(--card));border:2px solid #1f6fb2;border-left-width:6px} .bl .it.me{background:color-mix(in srgb,#5b8a1e 9%,var(--card));border:2px solid var(--bl-green);border-left-width:6px}
.bl .top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.bl .t{font-weight:800;font-size:17px;letter-spacing:-.01em;line-height:1.25}
.bl .sub{font-size:13.5px;color:var(--ink-2)}
.bl .d{font-size:14px;color:var(--ink-2);white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden} .bl .it.open .d{display:block}
.bl .st{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 10px;font-weight:800;font-size:12.5px;white-space:nowrap}
.bl .st:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.bl .st.todo{background:#eef1ea;color:#5d6b55} .bl .st.doing{background:#e2eef9;color:#1f6fb2} .bl .st.waiting{background:#fbf0d9;color:#b5770a} .bl .st.done{background:#e2f2e3;color:#2e7d32} .bl .st.finishing{background:#efe6fa;color:#6a3fb5}
.bl .st.who{background:#1f6fb2;color:#fff} .bl .st.who.me{background:var(--bl-green)}
.bl .chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.bl .chip{border:1px solid var(--line);border-radius:10px;padding:2px 9px;font-size:12.5px;font-weight:700;background:var(--card)}
.bl .chip.now{border-color:#f0c4bf;color:#c8382b} .bl .chip.wait{border-color:#f0d9a8;color:#b5770a} .bl .chip.jeff{border-color:#cfe2b0;color:var(--bl-forest)}
.bl .src{font-size:12px;color:var(--muted)}
.bl .note{font-size:13px;background:var(--moose-soft,#eef5e0);border-radius:10px;padding:6px 9px;white-space:pre-wrap}
.bl .acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:auto;padding-top:6px}
.bl .acts .btn{min-height:34px;font-size:13px;border-radius:11px} .bl .acts select{min-height:34px;border-radius:11px;font-size:13px;padding:0 8px}
.bl .btn.primary{background:var(--bl-green);border-color:var(--bl-green);color:#fff;font-weight:800}
.bl .ed{display:grid;gap:8px;margin-top:6px} .bl .ed .r{display:flex;gap:8px;flex-wrap:wrap} .bl .ed .r > *{flex:1;min-width:160px}
.bl .ed input,.bl .ed select,.bl .ed textarea{border-radius:12px} .bl textarea{width:100%;min-height:80px}
.bl .hist{font-size:12.5px;color:var(--muted)} .bl .hist div{padding:3px 0;border-top:1px solid var(--line)}
.bl .it{cursor:pointer} .bl .it:hover{box-shadow:0 2px 6px rgba(20,40,25,.10),0 8px 22px rgba(20,40,25,.10)} .bl .it:focus-visible{outline:3px solid var(--bl-moose);outline-offset:2px}
.blmod{position:fixed;inset:0;z-index:70;background:rgba(10,20,12,.45);overflow:auto;padding:4vh 16px}
.blmod .blbox{max-width:880px;margin:0 auto;background:var(--card);color:var(--ink);border-radius:18px;border-left:8px solid #cfd8cb;box-shadow:0 10px 40px rgba(0,0,0,.25);padding:20px 22px}
.blmod .blbox.p-now{border-left-color:#c8382b} .blmod .blbox.p-next{border-left-color:#b5770a} .blmod .blbox.p-later{border-left-color:var(--bl-moose)}
.blmod .mh{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:6px} .blmod .mt{font-size:22px;font-weight:800;letter-spacing:-.01em;line-height:1.25;margin-bottom:6px}
.blmod section{margin-top:16px} .blmod h4{margin:0 0 6px;font-size:12.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.blmod section p{margin:0 0 6px;font-size:15px;line-height:1.55} .blmod section ol{margin:0;padding-left:22px;font-size:15px;line-height:1.55} .blmod section li{margin:3px 0}
.blmod .addnote{display:flex;gap:8px;align-items:flex-end;margin-top:8px} .blmod .addnote textarea{flex:1;min-height:44px;border-radius:12px;font-size:14.5px}
.blmod .mf{border-top:1px solid var(--line);margin-top:18px;padding-top:12px}
.blmod .ed{display:grid;gap:10px;margin-top:10px} .blmod .ed label{display:grid;gap:4px;font-size:13px;font-weight:700} .blmod .ed .r{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.blmod .ed input,.blmod .ed select,.blmod .ed textarea{border-radius:12px;font-size:14.5px}
.bl .add{margin-top:24px;background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--bl-shadow);padding:14px 16px;display:grid;gap:8px}
.bl .add .r{display:flex;gap:8px;flex-wrap:wrap} .bl .add .r > *{flex:1;min-width:160px} .bl .add input,.bl .add select{border-radius:12px;min-height:42px}
.bl table.done{width:100%;border-collapse:collapse} .bl .done td,.bl .done th{padding:8px;border-top:1px solid var(--line);text-align:left;vertical-align:top;font-size:14px}
.bl .card.tbl{border-radius:18px;box-shadow:var(--bl-shadow);overflow-x:auto}
@media (max-width:700px){.bl .grid{grid-template-columns:1fr} .bl .fr{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
}
async function load(){
  const r = await sb.from("hub_build_items").select("*").eq("off", false).order("sort");
  if(r.error) throw r.error; BL.rows = r.data || [];
}
// What Claude Code gets. Admins work in the maintenance_desk folder (CLAUDE.md has everything). Everyone else (Jeff) gets the house rules
// and how to hand the work to Brandon, because their Claude can't deploy (Brandon 2026-11-04: "teach jeffs claude code how to do certain things").
const RULES = `House rules (Moose Hub):
- Every fact needs a source (Track, Key Data, our reviews, an official site, or the person who said it). Say where each number came from.
- Never put door codes, passwords, Wi-Fi, API keys, bank info or pay rates in anything you write.
- Don't change who can see what - only Brandon or Kim do that.
- Nothing gets deleted; things are switched off.
- Ask before sending any email, Slack or text to anyone; show the text first.
- Plain, short words. Lead with what the reader needs to do.`;
const prompt = i => {
  const head = `Moose Hub build list item "${i.id}": ${i.title}\n${i.detail || ""}${i.note ? "\nOur note: " + i.note : ""}${i.plan ? "\nHow to build it:\n" + i.plan : ""}${i.jeff_note ? "\nFor Jeff: " + i.jeff_note : ""}\nWhere it came from: ${i.source || "build list"}\nBuild list: https://crew.moosemanagement.com/#/build (item ${i.id})`;
  if(typeof ME !== "undefined" && ME && ME.admin) return head + `\n\nRead CLAUDE.md first. Plan it, ask me anything you need, then build it. When it's done, set this item to Done on the hub's Build list (table hub_build_items, id ${i.id}) and add a line to CLAUDE.md.`;
  return head + `\n\nI'm ${meName() || "on the Moose Management team"} and I'm working on this item with Brandon. You (Claude) can't change the live hub or its database from here; your job is to help me get it ready.\n${RULES}\n\nHow we work:\n1. Plan it with me step by step and ask me what you need. If it needs data from Track, Freshdesk, Key Data etc., tell me what to pull and where.\n2. Write the finished piece: the text, the exact steps, or the code with a short note on where it goes.\n3. Write a short summary for Brandon: what it is, what it changes, and anything he must decide.\n4. I send it to Brandon from the hub (Report a Bug / Upgrade, "Upgrade I want", mention item ${i.id}). For Launch Pad code: Launch Pad > </> Code.\n5. I set the item to Finishing touches on the Build list and put "waiting on Brandon" in its note.`;
};
function shownRows(){
  const q = BL.q.toLowerCase();
  return BL.rows.filter(i => (BL.fS === "all" || (BL.fS === "open" ? i.status !== "done" : i.status === BL.fS))
    && (BL.fP === "all" || i.pri === BL.fP) && (BL.fA === "all" || i.desk === BL.fA) 
    && (BL.fW === "all" || (BL.fW === "free" ? !(i.worker_names || []).length : (i.worker_names || []).includes(BL.fW)))
    && (!q || [i.title, i.detail, i.source, i.waits, i.note, i.id, (i.worker_names || []).join(" ")].join(" ").toLowerCase().includes(q)));
}
function whoLine(i){ const w = i.worker_names || [], isMe = w.includes(meName());
  return w.length && i.status !== "done" ? (isMe ? "you're on it" : esc(w.map(first).join(" + ")) + (w.length > 1 ? " are" : " is") + " on it") + (i.claimed_at ? " since " + esc(fday(i.claimed_at)) : "") : ""; }
function badgeHtml(i){ const w = i.worker_names || [], isMe = w.includes(meName()), others = w.filter(n => n !== meName());
  return w.length && i.status !== "done" ? `<span class="st who${isMe ? " me" : ""}">🔨 ${isMe ? "You" + (others.length ? " + " + esc(others.map(first).join(", ")) : "") : esc(w.map(first).join(" + "))}</span>` : `<span class="st ${i.status}">${ST[i.status] || i.status}</span>`; }
function claimBtns(i){ const w = i.worker_names || [], isMe = w.includes(meName()), s = i.status;
  return (s !== "done" ? (!w.length ? `<button class="btn small primary" data-claim>🔨 I'm on it</button>` : isMe ? `<button class="btn small" data-rel>Step off</button>` : `<button class="btn small" data-join>Work on it together</button>`) : "")
    + (s !== "done" && !isMe && w.length && ME && ME.admin ? `<button class="btn small" data-free>Free it</button>` : "")
    + (s !== "done" ? `<button class="btn small" data-copy>Open in Claude Code</button>` : "")
    + `<select data-st aria-label="Status">${Object.entries(ST).map(([v, l]) => `<option value="${v}"${v === s ? " selected" : ""}>${l}</option>`).join("")}</select>`; }
// card in the grid: tap anywhere on it (not a button) to open the full explanation
function itemHtml(i){
  const w = i.worker_names || [], isMe = w.includes(meName()), wl = whoLine(i);
  return `<div class="it p-${esc(i.pri || "next")}${isMe ? " me" : w.length && i.status !== "done" ? " taken" : ""}" data-s="${i.status}" data-id="${esc(i.id)}" tabindex="0" role="button" aria-label="Open ${esc(i.title)}">
    <div class="top"><div style="min-width:0"><div class="t">${esc(i.title)}</div><div class="sub">${esc(AL[i.desk] || i.desk)}${wl ? ` · <b>${wl}</b>` : ""}</div></div>${badgeHtml(i)}</div>
    ${i.detail ? `<div class="d">${esc(i.detail)}</div>` : ""}
    <div class="chips"><span class="chip${i.pri === "now" ? " now" : ""}">${PRI[i.pri] || "Next"}</span>${i.waits ? `<span class="chip wait">Waiting on ${esc(i.waits)}</span>` : ""}${i.plan ? `<span class="chip">📋 Has steps</span>` : ""}</div>
    ${i.note ? `<div class="note">${esc(i.note)}</div>` : ""}
    <div class="acts">${claimBtns(i)}<button class="btn small" data-edit>Open</button></div>
  </div>`;
}
// lines that start with "1." / "-" show as a list
function txt(t){ const L = String(t || "").split(/\r?\n/); if(L.some(l => /^\s*(\d+[.)]|[-*•])\s+/.test(l))){
    let h = "", inL = false; L.forEach(l => { const m = l.match(/^\s*(?:\d+[.)]|[-*•])\s+(.*)/); if(m){ if(!inL){ h += "<ol>"; inL = true; } h += `<li>${esc(m[1])}</li>`; } else { if(inL){ h += "</ol>"; inL = false; } if(l.trim()) h += `<p>${esc(l)}</p>`; } });
    return h + (inL ? "</ol>" : ""); }
  return `<p>${esc(t).replace(/\n/g, "<br>")}</p>`; }
// the full explanation pop-up (Brandon 2026-11-04: "click into each build tile and it explain what we need to build")
async function openItem(v, id, edit){
  const i = BL.rows.find(x => x.id === id); let d = document.getElementById("blmod");
  if(!i){ if(d) d.remove(); return; }
  if(!d){ d = document.createElement("div"); d.id = "blmod"; d.className = "blmod bl"; document.body.appendChild(d); }
  BL.modal = id;
  if(!BL.hist[id]){ const r = await sb.from("hub_build_log").select("at,by_name,what").eq("item_id", id).order("at", { ascending:false }).limit(30); BL.hist[id] = r.data || []; }
  const sec = (h, body) => `<section><h4>${h}</h4>${body}</section>`, wl = whoLine(i);
  d.innerHTML = `<div class="blbox p-${esc(i.pri || "next")}" role="dialog" aria-modal="true" aria-label="${esc(i.title)}">
    <div class="mh"><div style="min-width:0"><div class="mt">${esc(i.title)}</div>
      <div class="chips"><span class="chip">${esc(AL[i.desk] || i.desk)}</span><span class="chip${i.pri === "now" ? " now" : ""}">${PRI[i.pri] || "Next"} priority</span>${badgeHtml(i)}${i.waits ? `<span class="chip wait">Waiting on ${esc(i.waits)}</span>` : ""}</div>
      ${wl ? `<div class="sub" style="margin-top:4px"><b>${wl[0].toUpperCase() + wl.slice(1)}</b></div>` : ""}</div><button class="btn small" data-x aria-label="Close">✕</button></div>
    ${edit ? `<div class="ed">
      <label>Title<input data-f="title" value="${esc(i.title)}" maxlength="200"></label>
      <label>What we need to build<textarea data-f="detail" rows="5">${esc(i.detail)}</textarea></label>
      <label>How to build it (steps, one per line)<textarea data-f="plan" rows="8" placeholder="1. ...&#10;2. ...">${esc(i.plan || "")}</textarea></label>
      <div class="r"><label>Desk<select data-f="desk">${AREAS.map(([k, l]) => `<option value="${k}"${k === i.desk ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <label>Priority<select data-f="pri">${Object.entries(PRI).map(([k, l]) => `<option value="${k}"${k === i.pri ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Waiting on<input data-f="waits" value="${esc(i.waits)}" maxlength="60" placeholder="(optional)"></label></div>
      <label>Note (what was done, what's left)<textarea data-f="note" rows="3">${esc(i.note)}</textarea></label>
      <div class="acts"><button class="btn small primary" data-save>Save</button><button class="btn small" data-cancel>Cancel</button><button class="btn small" data-off style="margin-left:auto">Remove from the list</button></div></div>`
    : `${sec("What we need to build", i.detail ? txt(i.detail) : `<p class="muted">No details yet. Tap Edit to add them.</p>`)}
      ${sec("How to build it", i.plan ? txt(i.plan) : `<p class="muted">No step-by-step plan yet. Tap <b>Open in Claude Code</b> and Claude plans it with you first, or tap <b>Edit</b> and write the steps here.</p>`)}
      ${i.jeff && i.jeff_note ? sec("Jeff's part", txt(i.jeff_note)) : ""}
      ${sec("Notes", `${i.note ? txt(i.note) : `<p class="muted">No notes yet.</p>`}
        <div class="addnote"><textarea data-newnote rows="2" placeholder="Add a note (you don't have to start the item)"></textarea><button class="btn small primary" data-addnote>Add note</button></div>`)}
      ${sec("Where it came from", `<p>${esc(i.source || "Not recorded")}</p>`)}
      ${sec("History", `<div class="hist">${(BL.hist[id] || []).map(h => `<div>${esc(new Date(h.at).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }))} · ${esc(h.by_name || "")} · ${esc(h.what)}</div>`).join("") || "<div>No changes yet.</div>"}</div>`)}
      <div class="acts mf">${claimBtns(i)}<button class="btn small" data-editm>Edit</button></div>`}
  </div>`;
  const q = s => d.querySelector(s), close = () => { BL.modal = null; d.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = e => { if(e.key === "Escape") close(); };
  document.addEventListener("keydown", esc_);
  d.onclick = e => { if(e.target === d) close(); };
  q("[data-x]").onclick = close;
  const again = async () => { await load(); show(v); openItem(v, id); };
  if(q("[data-editm]")) q("[data-editm]").onclick = () => openItem(v, id, true);
  if(q("[data-cancel]")) q("[data-cancel]").onclick = () => openItem(v, id);
  if(q("[data-save]")) q("[data-save]").onclick = async () => { const f = n => q(`[data-f="${n}"]`).value;
    const r = await sb.rpc("build_item_save", { p_id:id, p_title:f("title"), p_detail:f("detail"), p_plan:f("plan"), p_desk:f("desk"), p_pri:f("pri"), p_waits:f("waits"), p_note:f("note") });
    if(r.error) return alert("Didn't save: " + err(r.error)); delete BL.hist[id]; again(); };
  // a note without starting the item (Brandon 2026-11-04): added under the earlier notes as "Name, Nov 4: …"
  if(q("[data-addnote]")) q("[data-addnote]").onclick = async () => { const t = q("[data-newnote]").value.trim(); if(!t) return q("[data-newnote]").focus();
    const line = `${first(meName()) || "Someone"}, ${fday(new Date())}: ${t}`, cur = (BL.rows.find(x => x.id === id) || {}).note || "";
    const r = await sb.rpc("build_item_save", { p_id:id, p_note:(cur ? cur + "\n" : "") + line }); if(r.error) return alert("Didn't save: " + err(r.error)); delete BL.hist[id]; again(); };
  if(q("[data-off]")) q("[data-off]").onclick = async () => { if(!confirm("Take this item off the list? (It's kept in the history, not deleted.)")) return;
    const r = await sb.rpc("build_item_save", { p_id:id, p_off:true }); if(r.error) return alert("Didn't save: " + err(r.error)); close(); await load(); show(v); };
  wireItem(v, d, i, again);
}
const tabsHtml = () => `<div class="tabs"><button class="${BL.tab === "list" ? "on" : ""}" data-tab="list">${ico("list")} Build list</button>
  <button class="${BL.tab === "mine" ? "on" : ""}" data-tab="mine">${ico("me")} I'm on (${BL.rows.filter(i => mine(i) && i.status !== "done").length})</button>
  <button class="${BL.tab === "done" ? "on" : ""}" data-tab="done">${ico("check")} Completed (${BL.rows.filter(i => i.status === "done").length})</button></div>`;
function wireTabs(v){ v.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { BL.tab = b.dataset.tab; BL.q = ""; show(v); }); }
const show = v => BL.tab === "done" ? drawDone(v) : draw(v);
function draw(v){
  const R = BL.rows, c = { todo:0, doing:0, waiting:0, finishing:0, done:0 }; R.forEach(i => c[i.status] = (c[i.status] || 0) + 1);
  const openN = R.length - (c.done || 0), inNow = R.filter(i => (i.worker_names || []).length && i.status !== "done").length;
  const rows = BL.tab === "mine" ? R.filter(i => mine(i) && i.status !== "done") : shownRows();
  const groups = BL.order === "abc" ? [["abc", "A → Z", () => true, (a, b) => String(a.title).localeCompare(String(b.title))]]
    : BL.order === "pri"
    ? Object.keys(PRI).map(p => [ "p:" + p, { now:"Now (high priority)", next:"Next", later:"Later (low priority)" }[p], i => i.pri === p, (a, b) => (AO[a.desk] ?? 99) - (AO[b.desk] ?? 99) || a.sort - b.sort])
    : AREAS.map(([k, l]) => [k, l, i => i.desk === k, (a, b) => (PO[a.pri] ?? 1) - (PO[b.pri] ?? 1) || a.sort - b.sort]);
  let list = "";
  for(const [gk, label, inG, ord] of groups){
    const g = rows.filter(inG).sort(ord); if(!g.length) continue;
    const shut = !!BL.fold[gk] && !BL.q;
    list += `<div class="sech${shut ? " shut" : ""}" data-fold="${esc(gk)}"><b>${esc(label)} <span>· ${g.length} ${g.length === 1 ? "item" : "items"}</span></b><i>⌃</i></div>${shut ? "" : `<div class="grid">${g.map(itemHtml).join("")}</div>`}`;
  }
  const opt = (cur, pairs) => pairs.map(([k, l]) => `<option value="${esc(k)}"${cur === k ? " selected" : ""}>${esc(l)}</option>`).join("");
  v.innerHTML = `<div class="page bl">${tabsHtml()}
    <div class="tiles"><div class="tile"><b>${openN}<small>/${R.length}</small></b><span>Still to do</span><div class="bar"><i style="width:${R.length ? (c.done || 0) / R.length * 100 : 0}%"></i></div></div>
      <div class="tile"><b>${R.filter(i => i.pri === "now" && i.status !== "done").length}</b><span>Now (high priority)</span></div>
      <div class="tile"><b>${inNow}</b><span>Being worked on</span></div><div class="tile"><b>${c.waiting || 0}</b><span>Paused</span></div><div class="tile"><b>${c.finishing || 0}</b><span>Finishing touches</span></div>
      <div class="tile"><b>${c.done || 0}</b><span>Done</span></div></div>
    ${BL.tab === "mine" ? "" : `<div class="filt">
      <div class="fr"><span class="lab">Find</span><input id="blq" type="search" placeholder="Search (e.g. Track, Penny, Chris)" value="${esc(BL.q)}"></div>
      <div class="fr"><span class="lab">Status</span><div class="seg">${[["open", "Not done"], ["all", "All"], ...Object.entries(ST)].map(([k, l]) => `<button type="button" class="${BL.fS === k ? "on" : ""}" data-fs="${k}">${l}</button>`).join("")}</div></div>
      <div class="fr"><span class="lab">Priority</span><div class="seg">${[["all", "Any"], ...Object.entries(PRI)].map(([k, l]) => `<button type="button" class="${BL.fP === k ? "on" : ""}" data-fp="${k}">${l}</button>`).join("")}</div></div>
      <div class="fr"><span class="lab">Who's on it</span><div class="seg">${WHO.map(([k, l]) => `<button type="button" class="${BL.fW === k ? "on" : ""}" data-fw="${esc(k)}">${l}</button>`).join("")}</div></div>
      <div class="fr"><span class="lab">Desk</span><div class="seg">${[["all", "All desks"], ...AREAS].map(([k, l]) => { const n = k === "all" ? 0 : R.filter(i => i.desk === k && i.status !== "done").length; return k !== "all" && !n ? "" : `<button type="button" class="${BL.fA === k ? "on" : ""}" data-fa="${k}">${esc(l)}${k === "all" ? "" : ` (${n})`}</button>`; }).join("")}</div></div>
      <div class="fr"><span class="lab">Order</span><select id="bl_o">${opt(BL.order, ORD)}</select><button type="button" class="chip" id="blref" title="Refresh">↻</button></div></div>`}
    ${list || `<div class="card" style="margin-top:14px"><p class="muted" style="margin:0">${BL.tab === "mine" ? "You're not on anything right now. Pick an item on Build list and tap \"I'm on it\"." : "Nothing matches these filters."}</p></div>`}
    ${BL.tab === "list" ? `<form class="add" id="bladd"><b>Add an item</b>
      <div class="r"><input id="bla_t" placeholder="What needs doing" maxlength="200" required><select id="bla_a" aria-label="Desk">${AREAS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select>
        <select id="bla_p" aria-label="Priority"><option value="now">Now</option><option value="next" selected>Next</option><option value="later">Later</option></select></div>
      <div class="r"><input id="bla_d" placeholder="Details (optional)" maxlength="2000"><input id="bla_s" placeholder="Where it came from (source)" maxlength="300"><button class="btn primary" type="submit" style="flex:0">Add</button></div></form>` : ""}
  </div>`;
  wire(v);
}
// Completed tab (Brandon 2026-11-04: "a history tab for the ones we completed"): newest first, who finished it (done_at / done_by)
function drawDone(v){
  const R = BL.rows.filter(i => i.status === "done").sort((a, b) => String(b.done_at || "").localeCompare(String(a.done_at || "")));
  const q = BL.q.toLowerCase(), rows = R.filter(i => !q || [i.title, i.detail, i.note, i.done_by].join(" ").toLowerCase().includes(q));
  const wk = R.filter(i => i.done_at && Date.now() - new Date(i.done_at) < 7 * 864e5).length;
  v.innerHTML = `<div class="page bl">${tabsHtml()}
    <div class="tiles"><div class="tile"><b>${R.length}</b><span>Finished</span></div><div class="tile"><b>${wk}</b><span>Finished this week</span></div></div>
    <div class="filt"><label class="wide">Find<input id="blq" type="search" placeholder="Search finished items" value="${esc(BL.q)}"></label></div>
    <div class="card tbl"><table class="done"><tr><th>Finished</th><th>Item</th><th>Desk</th><th>By</th></tr>
    ${rows.map(i => `<tr><td style="white-space:nowrap">${esc(fday(i.done_at))}</td><td><b>${esc(i.title)}</b>${i.note ? `<div class="muted">${esc(i.note)}</div>` : ""}</td><td>${esc(AL[i.desk] || i.desk)}</td><td>${esc(i.done_by || "")}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nothing finished yet.</td></tr>`}</table></div></div>`;
  wireTabs(v); wireFind(v, drawDone);
}
function wireFind(v, redraw){
  const q = v.querySelector("#blq"); if(!q) return;
  q.oninput = () => { BL.q = q.value; clearTimeout(BL.qt); BL.qt = setTimeout(() => { redraw(v); const n = v.querySelector("#blq"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
}
// "I'm on it" and "Open in Claude Code" copy the item's prompt and say where to paste it.
async function copyGo(it){
  const t = prompt(it); let ok = false; try { await navigator.clipboard.writeText(t); ok = true; } catch(e) {}
  const d = document.createElement("div");
  d.innerHTML = `<div class="card" style="max-width:640px;margin:8vh auto;padding:16px;border-radius:18px"><b>${ok ? "Copied ✓ - now open Claude Code and paste" : "Copy this into Claude Code"}</b>
    <p class="muted" style="margin:6px 0 8px">${ME && ME.admin ? "Open the Claude app (Code tab) in the maintenance_desk folder, start a new session and paste." : "Open Claude Code (or a new chat in your Claude project), start a new session and paste. It tells Claude the house rules and how to send the finished work to Brandon."}</p>
    <textarea readonly style="width:100%;min-height:200px;font-size:12.5px">${esc(t)}</textarea>
    <div style="text-align:right;margin-top:8px"><button class="btn primary" data-x>Done</button></div></div>`;
  Object.assign(d.style, { position:"fixed", inset:"0", background:"rgba(0,0,0,.35)", zIndex:"60", overflow:"auto", padding:"0 16px" });
  d.onclick = e => { if(e.target === d || e.target.hasAttribute("data-x")) d.remove(); };
  document.body.appendChild(d); if(!ok){ const ta = d.querySelector("textarea"); ta.focus(); ta.select(); }
}
async function act(v, fn){
  const r = await fn(); if(r && r.error){ alert("Didn't save: " + err(r.error)); return null; }
  await load(); const y = window.scrollY; show(v); window.scrollTo(0, y); return r;
}
// buttons shared by a card and the pop-up; `after` redraws whatever is showing
function wireItem(v, el, it, after){
  const id = it.id, b = s => el.querySelector(s);
  if(b("[data-st]")) b("[data-st]").onchange = async e => { const r = await sb.rpc("build_item_save", { p_id:id, p_status:e.target.value }); if(r.error) alert("Didn't save: " + err(r.error)); after(); };
  if(b("[data-claim]")) b("[data-claim]").onclick = async () => {
    const r = await sb.rpc("build_item_claim", { p_id:id, p_together:false }); if(r.error) return alert("Didn't save: " + err(r.error));
    if(r.data && r.data.ok === false){ if(!confirm(`${(r.data.busy || []).join(" + ")} just took this one. Work on it together?`)) return after();
      const j = await sb.rpc("build_item_claim", { p_id:id, p_together:true }); if(j.error) return alert("Didn't save: " + err(j.error)); }
    await copyGo(it); after(); };
  if(b("[data-join]")) b("[data-join]").onclick = async () => { if(!confirm(`${(it.worker_names || []).join(" + ")} ${it.worker_names.length > 1 ? "are" : "is"} already on this. Work on it together?`)) return;
    const r = await sb.rpc("build_item_claim", { p_id:id, p_together:true }); if(r.error) return alert("Didn't save: " + err(r.error)); await copyGo(it); after(); };
  if(b("[data-rel]")) b("[data-rel]").onclick = async () => { const r = await sb.rpc("build_item_release", { p_id:id }); if(r.error) alert("Didn't save: " + err(r.error)); after(); };
  if(b("[data-free]")) b("[data-free]").onclick = async () => { if(!confirm(`Take ${it.worker_names.join(" + ")} off this item?`)) return;
    for(const u of it.workers){ const r = await sb.rpc("build_item_release", { p_id:id, p_user:u }); if(r.error){ alert("Didn't save: " + err(r.error)); break; } } after(); };
  if(b("[data-copy]")) b("[data-copy]").onclick = () => copyGo(it);
}
function wire(v){
  wireTabs(v); wireFind(v, draw);
  const sel = (id, k) => { const e = v.querySelector(id); if(e) e.onchange = () => { BL[k] = e.value; if(k === "order") try { localStorage.setItem("bl_order", BL.order); } catch(x) {} draw(v); }; };
  sel("#bl_o", "order");
  v.querySelectorAll("[data-fs]").forEach(b => b.onclick = () => { BL.fS = b.dataset.fs; draw(v); });
  v.querySelectorAll("[data-fp]").forEach(b => b.onclick = () => { BL.fP = b.dataset.fp; draw(v); });
  v.querySelectorAll("[data-fa]").forEach(b => b.onclick = () => { BL.fA = b.dataset.fa; draw(v); });
  const rf = v.querySelector("#blref"); if(rf) rf.onclick = async () => { await load(); draw(v); };
  v.querySelectorAll("[data-fw]").forEach(b => b.onclick = () => { BL.fW = b.dataset.fw; draw(v); });
  v.querySelectorAll("[data-fold]").forEach(h => h.onclick = () => { const k = h.dataset.fold; BL.fold[k] = !BL.fold[k]; try { localStorage.setItem("bl_fold", JSON.stringify(BL.fold)); } catch(e) {} draw(v); });
  v.querySelectorAll(".it").forEach(el => {
    const id = el.dataset.id, it = BL.rows.find(x => x.id === id);
    el.onclick = e => { if(e.target.closest("button,select,a,input,textarea")) return; openItem(v, id); };
    el.onkeydown = e => { if((e.key === "Enter" || e.key === " ") && e.target === el){ e.preventDefault(); openItem(v, id); } };
    el.querySelector("[data-edit]").onclick = () => openItem(v, id);
    wireItem(v, el, it, async () => { await load(); const y = window.scrollY; show(v); window.scrollTo(0, y); });
  });
  const add = v.querySelector("#bladd"); if(add) add.onsubmit = e => { e.preventDefault(); const g = s => v.querySelector(s).value.trim();
    act(v, () => sb.rpc("build_item_save", { p_id:null, p_title:g("#bla_t"), p_desk:g("#bla_a"), p_pri:g("#bla_p"), p_detail:g("#bla_d"), p_source:g("#bla_s") })); };
}
window.buildListView = async function(v){
  css(); v.innerHTML = `<div class="page bl"><p class="muted">Loading the build list…</p></div>`;
  try { await load(); } catch(e){ v.innerHTML = `<div class="page"><div class="card"><p class="muted">Couldn't load the build list: ${esc(err(e))}</p></div></div>`; return; }
  show(v);
  // pick up the other person's changes (claims) every minute while the page is open and nobody is typing
  clearInterval(BL.timer); BL.timer = setInterval(async () => {
    if(!document.body.contains(v) || !v.querySelector(".bl")){ clearInterval(BL.timer); return; }
    if(document.hidden || BL.modal || (document.activeElement && document.activeElement.matches("input,textarea,select"))) return;
    try { await load(); const y = window.scrollY; show(v); window.scrollTo(0, y); } catch(e) {}
  }, 60000);
};
})();
