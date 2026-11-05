/* build_list.js (Brandon 2026-11-04: "make the build list onto the hub for jeff and i access so we can get through it together and not
   working on the same thing at the same time unless we want to"). Sidebar foot ▸ Build list (#/build, desk `build` = admins + Jeff by a
   per-person Show). Loaded by hub.html; uses its sb / $ / esc / ME / niceErr. Data: hub_build_items (RLS hub_can('build')), changes only
   through build_item_save / build_item_claim / build_item_release (hub_build_list.sql); every change in hub_build_log.
   "I'm on it" puts your name on an item; anyone else sees it taken and has to choose "Work on it together" to join. */
(function(){
const AREAS = [
  ["decide","Waiting on Brandon or Kim"], ["new","New builds"], ["comm","Moving off Slack"], ["quick","Quick fixes"], ["run","Running beautifully"],
  ["res","Reservations & guests"], ["rev","Reviews"], ["own","Owners, marketing & growth"], ["rates","Rates"], ["maint","Maintenance, vehicles & housekeeping"],
  ["staff","Staffing, PTO & perks"], ["penny","Penny"], ["homes","Property details, licensing & set up"], ["clean","Data clean-up"], ["idea","Claude's suggestions"]];
const AL = Object.fromEntries(AREAS), AO = Object.fromEntries(AREAS.map(([k], n) => [k, n]));
const ST = { todo:"To do", doing:"Doing", waiting:"Waiting", done:"Done" }, PRI = { now:"Now", next:"Next", later:"Later" }, PO = { now:0, next:1, later:2 };
const BL = { tab:"list", rows:null, fS:"open", fP:"all", fA:"all", fW:"all", q:"", order:"area", open:null, hist:{}, timer:null };
try { BL.order = localStorage.getItem("bl_order") === "pri" ? "pri" : "area"; } catch(e) {}
const err = e => window.niceErr ? niceErr(e) : (e && e.message) || String(e);
const fday = s => s ? new Date(s).toLocaleDateString(undefined, { month:"short", day:"numeric" }) : "";
const meName = () => (typeof ME !== "undefined" && ME && ME.name) || "";
const mine = r => (r.worker_names || []).includes(meName());
function css(){
  if(document.getElementById("blcss")) return;
  const s = document.createElement("style"); s.id = "blcss";
  /* Locks office look (Brandon 2026-11-04: "make it look like the office locks page"): forest gradient header with stat tiles,
     pill tabs, 18px cards with soft shadows, forest-green "on" state - same palette as locks-desk.html / rates.html locksLook */
  s.textContent = `.bl{--bl-forest:#3c5f12;--bl-forest2:#5b8a1e;--bl-moose:#88B535;--bl-moose2:#A6CE39;--bl-shadow:0 1px 2px rgba(20,40,25,.06),0 4px 14px rgba(20,40,25,.06);font-family:"Manrope",Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-feature-settings:"tnum" 1}
.bl .blhead{background:linear-gradient(135deg,var(--bl-forest),var(--bl-forest2));color:#fff;border-radius:18px;padding:16px 18px 14px;box-shadow:0 2px 12px rgba(10,30,20,.18);margin:0 0 12px}
.bl .blhead h2{margin:0;font-size:21px;font-weight:800;letter-spacing:-.01em;color:#fff} .bl .blhead h2 span{color:var(--bl-moose2)}
.bl .blhead p{margin:2px 0 12px;color:rgba(255,255,255,.82);font-size:13.5px}
.bl .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px} .bl .tabs button{border-radius:14px;min-height:38px;padding:8px 16px;font-weight:800;font-size:14px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;box-shadow:none}
.bl .tabs button.on{background:#fff;border-color:#fff;color:var(--bl-forest)}
.bl .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin:0}
.bl .tile{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:16px;padding:10px 12px} .bl .tile b{display:block;font-size:26px;font-weight:800;letter-spacing:-.02em;color:#fff} .bl .tile span{font-size:12px;color:rgba(255,255,255,.8);font-weight:700}
.bl .bar{height:8px;background:rgba(255,255,255,.2);border-radius:99px;overflow:hidden;margin:12px 0 0} .bl .bar i{display:block;height:100%;background:var(--bl-moose2)}
.bl .filt{position:sticky;top:0;z-index:3;background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--bl-shadow);padding:10px 12px;display:grid;gap:7px}
.bl .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center} .bl .lab{font-size:12px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-right:2px}
.bl .chip{border-radius:11px;min-height:32px;padding:5px 12px;font-size:13px;font-weight:700;border:1px solid var(--line);background:var(--card);color:var(--ink)} .bl .chip.on{background:var(--bl-forest2);border-color:var(--bl-forest2);color:#fff;font-weight:800}
.bl input,.bl select,.bl textarea{border-radius:13px} .bl .btn.primary{background:var(--bl-forest2);border-color:var(--bl-forest2);color:#fff;font-weight:800}
.bl .pill{border-radius:999px;font-weight:800}
.bl #blq{flex:1;min-width:180px}
.bl h3{margin:20px 0 4px;font-size:17px} .bl h3 small{font-weight:600;color:var(--muted);font-size:12px;margin-left:6px}
.bl .it{display:grid;grid-template-columns:112px minmax(0,1fr);gap:12px;background:var(--card);border:1px solid var(--line);border-left:6px solid #cfd8cb;border-radius:18px;box-shadow:var(--bl-shadow);padding:12px 14px;margin-top:8px}
.bl .it[data-s="doing"]{border-left-color:#1f6fb2} .bl .it[data-s="waiting"]{border-left-color:#c77700} .bl .it[data-s="done"]{border-left-color:#2e7d32;opacity:.7}
.bl .it[data-s="done"] .t{text-decoration:line-through}
.bl .it.taken{background:color-mix(in srgb,#1f6fb2 10%,var(--card));border:2px solid #1f6fb2;border-left-width:6px} .bl .it.me{background:color-mix(in srgb,#2e7d32 12%,var(--card));border:2px solid #2e7d32;border-left-width:6px}
.bl .flag{grid-column:1/-1;font-weight:800;font-size:13px;color:#fff;background:#1f6fb2;border-radius:8px;padding:4px 10px;width:max-content;max-width:100%} .bl .flag.me{background:#2e7d32}
.bl table.done{width:100%;border-collapse:collapse} .bl .done td,.bl .done th{padding:6px;border-top:1px solid var(--line);text-align:left;vertical-align:top;font-size:13.5px}
.bl .t{font-weight:700} .bl .d{font-size:14px;color:var(--ink-2);margin-top:2px;white-space:pre-wrap}
.bl .meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;font-size:12px;color:var(--muted)}
.bl .who{font-weight:700;color:#1f6fb2} .bl .who.me{color:#2e7d32}
.bl .note{margin-top:6px;font-size:13px;background:var(--moose-soft);border-radius:8px;padding:6px 8px;white-space:pre-wrap}
.bl .acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px} .bl .acts .btn{min-height:30px;font-size:13px}
.bl .ed{display:grid;gap:6px;margin-top:8px} .bl .ed .row > *{flex:1;min-width:140px} .bl textarea{width:100%;min-height:70px}
.bl .hist{margin-top:6px;font-size:12.5px;color:var(--muted)} .bl .hist div{padding:2px 0;border-top:1px solid var(--line)}
.bl .add{margin-top:24px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;display:grid;gap:8px}
.bl .add .row > *{flex:1;min-width:150px}
@media (max-width:620px){.bl .it{grid-template-columns:1fr}}`;
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
  const head = `Moose Hub build list item "${i.id}": ${i.title}\n${i.detail || ""}${i.note ? "\nOur note: " + i.note : ""}${i.jeff_note ? "\nFor Jeff: " + i.jeff_note : ""}\nWhere it came from: ${i.source || "build list"}\nBuild list: https://crew.moosemanagement.com/#/build (item ${i.id})`;
  if(typeof ME !== "undefined" && ME && ME.admin) return head + `\n\nRead CLAUDE.md first. Plan it, ask me anything you need, then build it. When it's done, set this item to Done on the hub's Build list (table hub_build_items, id ${i.id}) and add a line to CLAUDE.md.`;
  return head + `\n\nI'm ${meName() || "on the Moose Management team"} and I'm working on this item with Brandon. You (Claude) can't change the live hub or its database from here; your job is to help me get it ready.\n${RULES}\n\nHow we work:\n1. Plan it with me step by step and ask me what you need. If it needs data from Track, Freshdesk, Key Data etc., tell me what to pull and where.\n2. Write the finished piece: the text, the exact steps, or the code with a short note on where it goes.\n3. Write a short summary for Brandon: what it is, what it changes, and anything he must decide.\n4. I send it to Brandon from the hub (Report a Bug / Upgrade, "Upgrade I want", mention item ${i.id}). For Launch Pad code: Launch Pad > </> Code.\n5. I set the item to Waiting (on Brandon) on the Build list.`;
};
function shownRows(){
  const q = BL.q.toLowerCase(), me = meName();
  return BL.rows.filter(i => (BL.fS === "all" || (BL.fS === "open" ? i.status !== "done" : i.status === BL.fS))
    && (BL.fP === "all" || i.pri === BL.fP) && (BL.fA === "all" || i.area === BL.fA)
    && (BL.fW === "all" || (BL.fW === "free" ? !(i.worker_names || []).length : BL.fW === "jeffc" ? i.jeff : (i.worker_names || []).includes(BL.fW === "me" ? me : BL.fW)))
    && (!q || [i.title, i.detail, i.source, i.waits, i.note, i.id, (i.worker_names || []).join(" ")].join(" ").toLowerCase().includes(q)));
}
function itemHtml(i){
  const w = i.worker_names || [], isMe = w.includes(meName()), others = w.filter(n => n !== meName()), s = i.status;
  const who = w.length ? `<span class="who${isMe ? " me" : ""}">🔨 ${isMe ? (others.length ? "You + " + esc(others.join(", ")) : "You're on it") : esc(w.join(" + ")) + (w.length > 1 ? " are" : " is") + " on it"}${i.claimed_at ? " since " + esc(fday(i.claimed_at)) : ""}</span>` : "";
  const open = BL.open === i.id;
  return `<div class="it${isMe ? " me" : w.length ? " taken" : ""}" data-s="${s}" data-id="${esc(i.id)}">${w.length && s !== "done" ? `<div class="flag${isMe ? " me" : ""}">🔨 ${isMe ? "You're working on this" + (others.length ? " with " + esc(others.join(", ")) : "") : esc(w.join(" + ")) + (w.length > 1 ? " are" : " is") + " working on this"}</div>` : ""}
    <div><select data-st aria-label="Status">${Object.entries(ST).map(([v, l]) => `<option value="${v}"${v === s ? " selected" : ""}>${l}</option>`).join("")}</select></div>
    <div style="min-width:0"><div class="t">${esc(i.title)}</div>${i.detail ? `<div class="d">${esc(i.detail)}</div>` : ""}
      <div class="meta">${who}${BL.order === "pri" ? `<span class="pill">${esc(AL[i.area] || i.area)}</span>` : ""}<span class="pill ${i.pri === "now" ? "red" : i.pri === "next" ? "blue" : "green"}">${PRI[i.pri] || "Next"}</span>
        ${i.waits ? `<span class="pill amber">Waiting on ${esc(i.waits)}</span>` : ""}${i.jeff ? `<span class="pill green">Jeff could build</span>` : ""}
        ${i.source ? `<span>Source: ${esc(i.source)}</span>` : ""}${i.updated_by ? `<span>· ${esc(i.updated_by)} ${esc(fday(i.updated_at))}</span>` : ""}</div>
      ${i.jeff && i.jeff_note ? `<div class="d"><b>For Jeff:</b> ${esc(i.jeff_note)}</div>` : ""}
      ${i.note && !open ? `<div class="note">${esc(i.note)}</div>` : ""}
      ${s !== "done" ? `<div class="acts">${!w.length ? `<button class="btn small primary" data-claim>🔨 I'm on it</button>` : isMe ? `<button class="btn small" data-rel>Step off</button>` : `<button class="btn small" data-join>Work on it together</button>`}
        ${!isMe && w.length && ME && ME.admin ? `<button class="btn small" data-free>Free it</button>` : ""}
        <button class="btn small" data-copy>Open in Claude Code</button><button class="btn small" data-edit>${open ? "Close" : "Edit / note"}</button><button class="btn small" data-hist>History</button></div>`
        : `<div class="acts"><button class="btn small" data-hist>History</button></div>`}
      ${open ? `<div class="ed"><input data-f="title" value="${esc(i.title)}" maxlength="200" aria-label="Title"><textarea data-f="detail" aria-label="Details">${esc(i.detail)}</textarea>
        <div class="row"><select data-f="area" aria-label="Desk">${AREAS.map(([k, l]) => `<option value="${k}"${k === i.area ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
          <select data-f="pri" aria-label="Priority">${Object.entries(PRI).map(([k, l]) => `<option value="${k}"${k === i.pri ? " selected" : ""}>${l}</option>`).join("")}</select>
          <input data-f="waits" value="${esc(i.waits)}" placeholder="Waiting on (optional)" maxlength="60"></div>
        <textarea data-f="note" placeholder="Note (what was done, what's left)">${esc(i.note)}</textarea>
        <div class="row"><button class="btn small primary" data-save style="flex:0">Save</button><button class="btn small" data-off style="flex:0">Remove from the list</button></div></div>` : ""}
      ${BL.hist[i.id] ? `<div class="hist">${BL.hist[i.id].map(h => `<div>${esc(new Date(h.at).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }))} · ${esc(h.by_name || "")} · ${esc(h.what)}</div>`).join("") || "<div>No changes yet.</div>"}</div>` : ""}
    </div></div>`;
}
function draw(v){
  const R = BL.rows, c = { todo:0, doing:0, waiting:0, done:0 }; R.forEach(i => c[i.status] = (c[i.status] || 0) + 1);
  const me = meName(), names = [...new Set(R.flatMap(i => i.worker_names || []))].filter(n => n !== me).sort();
  const chip = (attr, val, cur, label) => `<button class="chip${cur === val ? " on" : ""}" ${attr}="${esc(val)}">${label}</button>`;
  const rows = shownRows();
  const groups = BL.order === "pri"
    ? Object.keys(PRI).map(p => [{ now:"Now (high priority)", next:"Next", later:"Later (low priority)" }[p], i => i.pri === p, (a, b) => (AO[a.area] ?? 99) - (AO[b.area] ?? 99) || a.sort - b.sort])
    : AREAS.map(([k, l]) => [l, i => i.area === k, (a, b) => (PO[a.pri] ?? 1) - (PO[b.pri] ?? 1) || a.sort - b.sort]);
  let list = "";
  for(const [label, inG, ord] of groups){
    const g = rows.filter(inG).sort(ord); if(!g.length) continue;
    const all = R.filter(inG), dn = all.filter(i => i.status === "done").length;
    list += `<h3>${esc(label)}<small>${dn} of ${all.length} done</small></h3>` + g.map(itemHtml).join("");
  }
  v.innerHTML = `<div class="page bl">${headHtml(`<div class="tiles"><div class="tile"><b>${R.length}</b><span>Items</span></div>${Object.entries(ST).map(([k, l]) => `<div class="tile"><b>${c[k] || 0}</b><span>${l}</span></div>`).join("")}
      <div class="tile"><b>${R.filter(mine).length}</b><span>You're on</span></div></div>
    <div class="bar"><i style="width:${R.length ? (c.done || 0) / R.length * 100 : 0}%"></i></div>`)}
    <div class="filt">
      <div class="row"><span class="lab">Status</span>${chip("data-fs", "open", BL.fS, "Not done")}${chip("data-fs", "all", BL.fS, "All")}${Object.entries(ST).map(([k, l]) => chip("data-fs", k, BL.fS, l)).join("")}
        <span class="lab" style="margin-left:8px">Priority</span>${chip("data-fp", "all", BL.fP, "Any")}${Object.entries(PRI).map(([k, l]) => chip("data-fp", k, BL.fP, l)).join("")}</div>
      <div class="row"><span class="lab">Who's on it</span>${chip("data-fw", "all", BL.fW, "Anyone")}${chip("data-fw", "free", BL.fW, "Nobody yet")}${chip("data-fw", "me", BL.fW, "Me")}${names.map(n => chip("data-fw", n, BL.fW, esc(n))).join("")}${chip("data-fw", "jeffc", BL.fW, "Jeff could build")}</div>
      <div class="row"><span class="lab">Desk</span>${chip("data-fa", "all", BL.fA, "All desks")}${AREAS.map(([k, l]) => chip("data-fa", k, BL.fA, `${esc(l)} (${R.filter(i => i.area === k && i.status !== "done").length})`)).join("")}</div>
      <div class="row"><input id="blq" type="search" placeholder="Search (e.g. Track, Penny, Chris)" value="${esc(BL.q)}" aria-label="Search the list">
        <span class="lab">Order</span>${chip("data-ord", "area", BL.order, "By desk")}${chip("data-ord", "pri", BL.order, "High → low priority")}<button class="chip" id="blref">↻</button></div>
    </div>
    ${list || `<div class="card" style="margin-top:12px"><p class="muted" style="margin:0">Nothing matches these filters.</p></div>`}
    <form class="add" id="bladd"><b>Add an item</b>
      <div class="row"><input id="bla_t" placeholder="What needs doing" maxlength="200" required><select id="bla_a" aria-label="Desk">${AREAS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select>
        <select id="bla_p" aria-label="Priority"><option value="now">Now</option><option value="next" selected>Next</option><option value="later">Later</option></select></div>
      <div class="row"><input id="bla_d" placeholder="Details (optional)" maxlength="2000"><input id="bla_s" placeholder="Where it came from (source)" maxlength="300"><button class="btn primary" type="submit" style="flex:0">Add</button></div></form>
  </div>`;
  wire(v);
}
// "I'm on it" and "Open in Claude Code" copy the item's prompt and say where to paste it.
async function copyGo(it){
  const t = prompt(it); let ok = false; try { await navigator.clipboard.writeText(t); ok = true; } catch(e) {}
  const d = document.createElement("div");
  d.innerHTML = `<div class="card" style="max-width:640px;margin:8vh auto;padding:16px"><b>${ok ? "Copied ✓ - now open Claude Code and paste" : "Copy this into Claude Code"}</b>
    <p class="muted" style="margin:6px 0 8px">${ME && ME.admin ? "Open the Claude app (Code tab) in the maintenance_desk folder, start a new session and paste." : "Open Claude Code (or a new chat in your Claude project), start a new session and paste. It tells Claude the house rules and how to send the finished work to Brandon."}</p>
    <textarea readonly style="width:100%;min-height:200px;font-size:12.5px">${esc(t)}</textarea>
    <div style="text-align:right;margin-top:8px"><button class="btn primary" data-x>Done</button></div></div>`;
  Object.assign(d.style, { position:"fixed", inset:"0", background:"rgba(0,0,0,.35)", zIndex:"60", overflow:"auto", padding:"0 16px" });
  d.onclick = e => { if(e.target === d || e.target.hasAttribute("data-x")) d.remove(); };
  document.body.appendChild(d); if(!ok){ const ta = d.querySelector("textarea"); ta.focus(); ta.select(); }
}
// Completed tab (Brandon 2026-11-04: "a history tab for the ones we completed"): newest first, who finished it (done_at / done_by)
function drawDone(v){
  const R = BL.rows.filter(i => i.status === "done").sort((a, b) => String(b.done_at || "").localeCompare(String(a.done_at || "")));
  const q = BL.q.toLowerCase(), rows = R.filter(i => !q || [i.title, i.detail, i.note, i.done_by].join(" ").toLowerCase().includes(q));
  v.innerHTML = `<div class="page bl">${headHtml(`<div class="tiles"><div class="tile"><b>${R.length}</b><span>Finished</span></div><div class="tile"><b>${R.filter(i => i.done_at && Date.now() - new Date(i.done_at) < 7 * 864e5).length}</b><span>This week</span></div></div>`)}
    <div class="row" style="margin-bottom:8px"><input id="blq" type="search" placeholder="Search finished items" value="${esc(BL.q)}" aria-label="Search finished items"></div>
    <div class="card" style="overflow-x:auto"><table class="done"><tr><th>Finished</th><th>Item</th><th>Desk</th><th>By</th></tr>
    ${rows.map(i => `<tr><td style="white-space:nowrap">${esc(fday(i.done_at))}</td><td><b>${esc(i.title)}</b>${i.note ? `<div class="muted">${esc(i.note)}</div>` : ""}</td><td>${esc(AL[i.area] || i.area)}</td><td>${esc(i.done_by || "")}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nothing finished yet.</td></tr>`}</table></div></div>`;
  wireTabs(v);
  const qq = v.querySelector("#blq"); qq.oninput = () => { BL.q = qq.value; clearTimeout(BL.qt); BL.qt = setTimeout(() => { drawDone(v); const n = v.querySelector("#blq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}
const headHtml = inner => `<div class="blhead"><h2>Moose Hub <span>build list</span></h2><p>Everything still to build, decide or clean up. Say "I'm on it" so nobody doubles up.</p>${tabsHtml()}${inner}</div>`;
const tabsHtml = () => `<div class="tabs"><button class="${BL.tab === "list" ? "on" : ""}" data-tab="list">Build list</button><button class="${BL.tab === "done" ? "on" : ""}" data-tab="done">Completed (${BL.rows.filter(i => i.status === "done").length})</button></div>`;
function wireTabs(v){ v.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { BL.tab = b.dataset.tab; BL.q = ""; show(v); }); }
const show = v => BL.tab === "done" ? drawDone(v) : draw(v);
async function act(v, fn, okMsg){
  const r = await fn(); if(r && r.error){ alert("Didn't save: " + err(r.error)); return null; }
  await load(); const y = window.scrollY; draw(v); window.scrollTo(0, y); return r;
}
function wire(v){
  wireTabs(v);
  v.querySelectorAll("[data-fs]").forEach(b => b.onclick = () => { BL.fS = b.dataset.fs; draw(v); });
  v.querySelectorAll("[data-fp]").forEach(b => b.onclick = () => { BL.fP = b.dataset.fp; draw(v); });
  v.querySelectorAll("[data-fa]").forEach(b => b.onclick = () => { BL.fA = b.dataset.fa; draw(v); });
  v.querySelectorAll("[data-fw]").forEach(b => b.onclick = () => { BL.fW = b.dataset.fw; draw(v); });
  v.querySelectorAll("[data-ord]").forEach(b => b.onclick = () => { BL.order = b.dataset.ord; try { localStorage.setItem("bl_order", BL.order); } catch(e) {} draw(v); });
  const q = v.querySelector("#blq"); q.oninput = () => { BL.q = q.value; clearTimeout(BL.qt); BL.qt = setTimeout(() => { draw(v); const n = v.querySelector("#blq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  v.querySelector("#blref").onclick = async () => { await load(); draw(v); };
  v.querySelectorAll(".it").forEach(el => {
    const id = el.dataset.id, it = BL.rows.find(x => x.id === id), b = s => el.querySelector(s);
    b("[data-st]").onchange = e => act(v, () => sb.rpc("build_item_save", { p_id:id, p_status:e.target.value }));
    if(b("[data-claim]")) b("[data-claim]").onclick = async () => {
      const r = await sb.rpc("build_item_claim", { p_id:id, p_together:false }); if(r.error) return alert("Didn't save: " + err(r.error));
      if(r.data && r.data.ok === false){ if(!confirm(`${(r.data.busy || []).join(" + ")} just took this one. Work on it together?`)){ await load(); return draw(v); }
        const j = await sb.rpc("build_item_claim", { p_id:id, p_together:true }); if(j.error) return alert("Didn't save: " + err(j.error)); }
      await copyGo(it); await load(); draw(v); };
    if(b("[data-join]")) b("[data-join]").onclick = async () => { if(!confirm(`${(it.worker_names || []).join(" + ")} ${it.worker_names.length > 1 ? "are" : "is"} already on this. Work on it together?`)) return;
      const r = await sb.rpc("build_item_claim", { p_id:id, p_together:true }); if(r.error) return alert("Didn't save: " + err(r.error)); await copyGo(it); await load(); draw(v); };
    if(b("[data-rel]")) b("[data-rel]").onclick = () => act(v, () => sb.rpc("build_item_release", { p_id:id }));
    if(b("[data-free]")) b("[data-free]").onclick = () => { if(confirm(`Take ${it.worker_names.join(" + ")} off this item?`)) act(v, async () => { for(const u of it.workers){ const r = await sb.rpc("build_item_release", { p_id:id, p_user:u }); if(r.error) return r; } }); };
    if(b("[data-copy]")) b("[data-copy]").onclick = () => copyGo(it);
    if(b("[data-edit]")) b("[data-edit]").onclick = () => { BL.open = BL.open === id ? null : id; draw(v); };
    b("[data-hist]").onclick = async () => {
      if(BL.hist[id]){ delete BL.hist[id]; return draw(v); }
      const r = await sb.from("hub_build_log").select("at,by_name,what").eq("item_id", id).order("at", { ascending:false }).limit(30);
      BL.hist[id] = r.data || []; draw(v); };
    if(b("[data-save]")) b("[data-save]").onclick = () => { const f = n => b(`[data-f="${n}"]`).value; BL.open = null;
      act(v, () => sb.rpc("build_item_save", { p_id:id, p_title:f("title"), p_detail:f("detail"), p_area:f("area"), p_pri:f("pri"), p_waits:f("waits"), p_note:f("note") })); };
    if(b("[data-off]")) b("[data-off]").onclick = () => { if(confirm("Take this item off the list? (It's kept in the history, not deleted.)")){ BL.open = null; act(v, () => sb.rpc("build_item_save", { p_id:id, p_off:true })); } };
  });
  v.querySelector("#bladd").onsubmit = e => { e.preventDefault(); const g = s => v.querySelector(s).value.trim();
    act(v, () => sb.rpc("build_item_save", { p_id:null, p_title:g("#bla_t"), p_area:g("#bla_a"), p_pri:g("#bla_p"), p_detail:g("#bla_d"), p_source:g("#bla_s") })); };
}
window.buildListView = async function(v){
  css(); v.innerHTML = `<div class="page bl"><p class="muted">Loading the build list…</p></div>`;
  try { await load(); } catch(e){ v.innerHTML = `<div class="page"><div class="card"><p class="muted">Couldn't load the build list: ${esc(err(e))}</p></div></div>`; return; }
  show(v);
  // pick up the other person's changes (claims) every minute while the page is open and nobody is typing
  clearInterval(BL.timer); BL.timer = setInterval(async () => {
    if(!document.body.contains(v) || !v.querySelector(".bl")){ clearInterval(BL.timer); return; }
    if(document.hidden || BL.open || (document.activeElement && document.activeElement.matches("input,textarea,select"))) return;
    try { await load(); const y = window.scrollY; show(v); window.scrollTo(0, y); } catch(e) {}
  }, 60000);
};
})();
