/* config_guide.js (Brandon 2026-11-01: "a section that says configuration and is only shown to the admins. its how everything is built
   and how someone could keep building things if brandon was to disappear … dumb it down and explain to kim").
   Sidebar ▸ Configuration (#/config, desk `config` = admins only, or a person given Show on it). Loaded by hub.html; uses its sb / $ / esc.
   Text: hub_guide (RLS hub_can('config')), saved with hub_guide_save(); live lists: hub_guide_inventory() + the office PC snapshot
   (config_inventory.py, daily). This file holds page code only — never guide text, keys or names. */
(function(){
const TABS = [["kim", "For Kim & the team"], ["coder", "For a developer"], ["inv", "Live inventory"], ["hist", "Change history"]];
let CG = { tab:"kim", rows:null, inv:null };
const fday = s => s ? new Date(s).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }) : "";
const ftime = s => s ? new Date(s).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "";
function css(){
  if(document.getElementById("cgcss")) return;
  const s = document.createElement("style"); s.id = "cgcss";
  s.textContent = `.cg .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px} .cg .tabs button{border-radius:999px;min-height:36px;padding:0 14px}
.cg .tabs button.on{background:var(--moose);border-color:var(--moose);color:#fff}
.cg .wrap{display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px;align-items:start}
.cg .toc{position:sticky;top:12px;font-size:13.5px} .cg .toc a{display:block;padding:5px 8px;border-radius:8px;color:var(--ink-2);text-decoration:none}
.cg .toc a:hover{background:var(--moose-soft)}
.cg .sec h2{margin:0 0 8px;font-size:19px} .cg .sec h3{margin:14px 0 6px;font-size:15.5px}
.cg .md{font-size:15px;line-height:1.6;color:var(--ink)} .cg .md p{margin:0 0 10px} .cg .md ul,.cg .md ol{margin:0 0 10px;padding-left:22px} .cg .md li{margin:3px 0}
.cg .md code{font-size:13px;background:var(--ground);border:1px solid var(--line);border-radius:6px;padding:0 5px;overflow-wrap:anywhere}
.cg .src{margin-top:10px;padding:8px 10px;border-radius:10px;background:var(--ground);font-size:12.5px;color:var(--muted)} .cg .src li{margin:2px 0}
.cg .meta{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px;font-size:12px;color:var(--muted)}
.cg table{width:100%;border-collapse:collapse;font-size:13px} .cg td,.cg th{padding:5px 6px;border-top:1px solid var(--line);text-align:left;vertical-align:top}
.cg th{font-weight:700;color:var(--muted)} .cg .scroll{overflow-x:auto}
.cg .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px}
.cg .tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px} .cg .tile b{display:block;font-size:22px} .cg .tile span{font-size:12.5px;color:var(--muted)}
.cg .warn{border-color:#c77700!important;background:color-mix(in srgb,#ffb300 10%,var(--card))}
.cg .ok{color:#2e7d32;font-weight:700} .cg .bad{color:#c62828;font-weight:700}
.cg .names{font-size:12.5px;color:var(--ink-2);overflow-wrap:anywhere}
.cg textarea{width:100%;min-height:340px;font:13px/1.5 ui-monospace,Consolas,monospace}
@media (max-width:820px){.cg .wrap{grid-template-columns:1fr} .cg .toc{position:static}}
@media print{.rail,.topbar,.ubar,.cg .tabs,.cg .toc,.cg .noprint{display:none!important} .cg .wrap{display:block}}`;
  document.head.appendChild(s);
}
// Tiny Markdown: ### heads, - / 1. lists, **bold**, `code`, [text](url). Escapes everything first.
function md(text){
  const inl = t => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#\/[^)\s]*)\)/g, (m, a, u) => `<a href="${u}"${u[0] === "h" ? ' target="_blank" rel="noopener"' : ""}>${a}</a>`);
  const out = []; let list = null, para = [];
  const flushP = () => { if(para.length){ out.push(`<p>${inl(para.join(" "))}</p>`); para = []; } };
  const flushL = () => { if(list){ out.push(`<${list.t}>${list.items.map(i => `<li>${inl(i)}</li>`).join("")}</${list.t}>`); list = null; } };
  String(text || "").split(/\r?\n/).forEach(line => {
    const h = line.match(/^###\s+(.*)/), ul = line.match(/^\s*[-*]\s+(.*)/), ol = line.match(/^\s*\d+\.\s+(.*)/);
    if(h){ flushP(); flushL(); out.push(`<h3>${inl(h[1])}</h3>`); }
    else if(ul || ol){ flushP(); const t = ul ? "ul" : "ol"; if(!list || list.t !== t){ flushL(); list = { t, items:[] }; } list.items.push((ul || ol)[1]); }
    else if(!line.trim()){ flushP(); flushL(); }
    else if(list && /^\s{2,}\S/.test(line)) list.items[list.items.length - 1] += " " + line.trim();
    else { flushL(); para.push(line.trim()); }
  });
  flushP(); flushL(); return out.join("");
}
async function load(force){
  if(CG.rows && !force) return;
  const r = await sb.from("hub_guide").select("key,part,sort,title,body,sources,updated_at,updated_by,off").order("sort");
  if(r.error) throw r.error; CG.rows = r.data || [];
}
async function loadInv(force){
  if(CG.inv && !force) return;
  const r = await sb.rpc("hub_guide_inventory"); if(r.error) throw r.error; CG.inv = r.data || {};
}
function head(){
  const last = (CG.rows || []).reduce((m, x) => x.updated_at > m ? x.updated_at : m, "");
  return `<div class="card"><h2 style="margin:0 0 6px">How the Moose Hub is built, and how to keep it going</h2>
    <p class="muted" style="margin:0 0 10px">Written so Moose keeps running if Brandon, or Claude, isn't around. Part 1 is for Kim and the team in plain words. Part 2 is for a developer, or Claude, picking up the work. Only admins see this page (and anyone an admin gives it to in My settings ▸ Who sees which desk). Last changed ${fday(last)}.</p>
    <div class="noprint" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" id="cgprint">🖨 Print this part</button><button class="btn small" id="cgdl">⬇ Download the whole guide</button></div>
    <p class="muted noprint" style="font-size:12.5px;margin:8px 0 0">A copy is also saved every day on the office computer as <code>hub_site\\CONFIGURATION_GUIDE_live.md</code> and copied to Dropbox each night, so it can be read even if the hub is down.</p></div>`;
}
function guide(part){
  const rows = CG.rows.filter(x => x.part === part && !x.off);
  return `<div class="wrap"><nav class="toc card">${rows.map(x => `<a href="#" data-go="${esc(x.key)}">${esc(x.title)}</a>`).join("")}</nav><div>
    ${rows.map(x => `<div class="card sec" id="cg-${esc(x.key)}"><h2>${esc(x.title)}</h2><div class="md">${md(x.body)}</div>
      ${x.sources && x.sources.length ? `<div class="src"><b>Sources</b><ul style="margin:4px 0 0;padding-left:18px">${x.sources.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}
      <div class="meta"><span>Last changed ${fday(x.updated_at)} by ${esc(x.updated_by === "file" ? "the guide file (Claude Code)" : x.updated_by)}</span>
      <button class="btn small noprint" data-edit="${esc(x.key)}">✎ Edit</button></div></div>`).join("")}</div></div>`;
}
const tbl = (cols, rows) => `<div class="scroll"><table><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>${rows.join("")}</table></div>`;
const card = (title, sub, body) => `<div class="card"><h3 style="margin:0 0 4px">${title}</h3>${sub ? `<p class="muted" style="margin:0 0 8px;font-size:13px">${sub}</p>` : ""}${body}</div>`;
function inventory(){
  const I = CG.inv || {}, pc = I.pc || null, P = (pc && pc.data) || {};
  const age = pc ? (Date.now() - new Date(pc.at)) / 864e5 : 99;
  const live = (I.desks || []).filter(d => d.status === "live"), on = (P.switches || []).filter(s => s.on);
  const bad = (P.tasks || []).filter(t => t.state !== "Disabled" && t.last_result && !/^(0|267009|267011)$/.test(t.last_result));
  let h = `<div class="tiles"><div class="tile"><b>${I.people ?? "–"}</b><span>people who can sign in</span></div><div class="tile"><b>${live.length}</b><span>live desks</span></div>
    <div class="tile"><b>${(I.teams || []).length}</b><span>teams</span></div><div class="tile"><b>${I.tables ?? "–"}</b><span>database tables</span></div>
    <div class="tile"><b>${(P.tasks || []).length}</b><span>office-computer jobs</span></div><div class="tile"><b>${on.length}</b><span>switches on</span></div>
    <div class="tile"><b>${(P.functions || []).length}</b><span>Edge Functions</span></div></div>`;
  h += `<div class="card ${age > 2 ? "warn" : ""}"><b>Office computer snapshot:</b> ${pc ? `${ftime(pc.at)} from ${esc(pc.host || "?")}` : "none yet"}.
    ${age > 2 ? ` <span class="bad">It's more than 2 days old: the office computer may be off or signed out.</span>` : ""}
    <span class="muted" style="font-size:12.5px">It refreshes once a day (config_inventory.py, run by maint_sync.py). The database lists below are live.</span></div>`;
  h += card("Office computer jobs (Windows Task Scheduler)", `These run under the Windows user shown and only while that user is signed in ("Interactive only"). Result 0 = last run OK.${bad.length ? ` <span class="bad">${bad.length} with an unusual last result.</span>` : ""}`,
    tbl(["Job", "When", "Repeats", "Last run", "Result", "State", "User"], (P.tasks || []).map(t => `<tr><td><b>${esc(t.name)}</b><div class="names">${esc(t.runs)}</div></td><td>${esc(t.schedule)}</td><td>${esc(t.every)}</td>
      <td>${esc(t.last_run)}</td><td class="${/^(0|267009|267011)$/.test(t.last_result) ? "" : "bad"}">${esc(t.last_result)}</td><td>${esc(t.state)}</td><td>${esc(t.user)} <span class="muted" style="font-size:11px">${esc(t.logon)}</span></td></tr>`)));
  h += card("Switch files (hub_site)", "File there = feature on. Rename or move it to turn the feature off; it stops on its next run.",
    tbl(["Switch", "State", "Since"], (P.switches || []).map(s => `<tr><td><code>${esc(s.file)}</code></td><td class="${s.on ? "ok" : "bad"}">${s.on ? "On" : "Paused"}</td><td>${esc(s.since)}</td></tr>`)));
  h += card("Database switches (hub_flags)", "Usually off · admins · on. Changed by a developer or Claude in SQL.",
    tbl(["Flag", "Value"], (I.flags || []).map(f => `<tr><td><code>${esc(f.key)}</code></td><td>${esc(f.value)}</td></tr>`)));
  h += card("Database timers (pg_cron)", "Jobs Supabase runs by itself, even when the office computer is off.",
    tbl(["Job", "Schedule (cron)", "Active"], (I.cron || []).map(c => `<tr><td><code>${esc(c.name)}</code></td><td>${esc(c.schedule)}</td><td>${c.active ? "yes" : "no"}</td></tr>`)));
  h += card("Data pulls (Reports ▸ Sync)", "When each source last updated.",
    tbl(["Source", "Runs on", "Schedule", "Last OK", "Status"], (I.sync || []).map(s => `<tr><td>${esc(s.label)}</td><td>${esc(s.runs_on || "")}</td><td>${esc(s.schedule || "")}</td><td>${ftime(s.last_ok_at)}</td><td>${esc(s.last_status || "")}</td></tr>`)));
  h += card("Who sees which desk", "Teams with each desk. Admins see everything. Desks with no team = admins only. Change in My settings ▸ Who sees which desk.",
    tbl(["Desk", "Status", "Teams"], (I.desks || []).map(d => `<tr><td>${esc(d.label)} <span class="muted" style="font-size:11px">${esc(d.key)}</span></td><td>${esc(d.status)}</td><td>${(d.teams || []).length ? esc(d.teams.join(", ")) : `<span class="muted">admins only</span>`}</td></tr>`)));
  h += card("Teams and people", "", tbl(["Team", "People"], (I.teams || []).map(t => `<tr><td>${esc(t.label)}</td><td>${esc((t.people || []).join(", ")) || `<span class="muted">nobody</span>`}</td></tr>`)));
  if((I.overrides || []).length) h += card("One-person exceptions", "Someone given (allow) or kept from (block) one desk, regardless of team.",
    tbl(["Person", "Desk", "Rule"], I.overrides.map(o => `<tr><td>${esc(o.person)}</td><td>${esc(o.desk)}</td><td>${esc(o.mode)}</td></tr>`)));
  h += card("Edge Functions (Supabase)", "Small programs inside Supabase. JWT on = only works for a signed-in person. Code in hub_site/functions/.",
    tbl(["Function", "JWT", "Version", "Updated"], (P.functions || []).map(f => `<tr><td><code>${esc(f.name)}</code></td><td>${f.jwt ? "on" : "off"}</td><td>${esc(String(f.version ?? ""))}</td><td>${esc(f.updated || "")}</td></tr>`)));
  h += card("Where the keys live (names only)", "The values are never shown here. Passwords for people are in LastPass; these are the keys programs use. Only Brandon (or Kim) pastes a key.",
    tbl(["File on the office computer", "For", "Key names"], (P.keys || []).map(k => `<tr><td><code>${esc(k.file)}</code></td><td>${esc(k.what)}</td><td class="names">${k.names ? esc(k.names.join(", ")) : `<span class="bad">file not found</span>`}</td></tr>`))
    + `<p style="margin:10px 0 4px"><b>Supabase secrets</b> <span class="muted" style="font-size:12.5px">(Supabase ▸ Edge Functions ▸ Secrets)</span></p><div class="names">${esc((P.secrets || []).join(", ")) || "–"}</div>`);
  return h;
}
function history(){
  const ch = (CG.inv && CG.inv.changes) || [];
  return card("Recent changes to this guide", "Every save keeps the old text (table hub_guide_log, never deleted).",
    ch.length ? tbl(["When", "Section", "Who", "Note"], ch.map(c => `<tr><td>${ftime(c.at)}</td><td>${esc(c.key)}</td><td>${esc(c.by)}</td><td>${esc(c.note || "")}</td></tr>`)) : `<p class="muted">No edits on the page yet.</p>`);
}
function download(){
  const parts = { kim:"Part 1 — For Kim and the team", coder:"Part 2 — For a developer (or Claude) taking over" };
  let t = `# Moose Hub — Configuration guide\n\nDownloaded ${new Date().toLocaleString()} from the hub (Configuration, admins only).\n`;
  ["kim", "coder"].forEach(p => { t += `\n# ${parts[p]}\n`; CG.rows.filter(x => x.part === p && !x.off).forEach(x => {
    t += `\n## ${x.title}\n\n${x.body}\n` + (x.sources.length ? `\nSources: ${x.sources.join("; ")}\n` : ""); }); });
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type:"text/markdown" }));
  a.download = "Moose-Hub-Configuration-guide.md"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function editBox(v, key){
  const x = CG.rows.find(r => r.key === key); if(!x) return;
  let m = document.getElementById("cgmodal");
  if(!m){ m = document.createElement("div"); m.id = "cgmodal"; m.className = "modal"; document.body.appendChild(m); }
  m.innerHTML = `<div class="card cg" style="width:min(820px,100%);max-height:92vh;overflow:auto"><h3 style="margin:0 0 8px">Edit: ${esc(x.title)}</h3>
    <label class="muted">Title</label><input id="cgt" value="${esc(x.title)}">
    <label class="muted" style="display:block;margin-top:8px">Text <span style="font-size:12px">(- for a list, **bold**, \`code\`, ### for a sub-heading)</span></label><textarea id="cgb">${esc(x.body)}</textarea>
    <label class="muted" style="display:block;margin-top:8px">Sources, one per line (rule: every fact needs a source)</label><textarea id="cgs" style="min-height:90px">${esc((x.sources || []).join("\n"))}</textarea>
    <label class="muted" style="display:block;margin-top:8px">What did you change? (kept in the history)</label><input id="cgn" placeholder="e.g. added who pays the Supabase bill">
    <p class="muted" style="font-size:12.5px">Never type a password, key or code here. Write where it lives (LastPass) instead. The old text is kept.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><span id="cgmsg" class="muted" style="margin-right:auto"></span><button class="btn" id="cgx">Cancel</button><button class="btn primary" id="cgsave">Save</button></div></div>`;
  m.classList.add("on");
  const close = () => m.classList.remove("on");
  m.onclick = e => { if(e.target === m) close(); }; $("#cgx").onclick = close;
  $("#cgsave").onclick = async () => {
    const b = $("#cgsave"); b.disabled = true; $("#cgmsg").textContent = "Saving…";
    const src = $("#cgs").value.split(/\n/).map(s => s.trim()).filter(Boolean);
    const r = await sb.rpc("hub_guide_save", { p_key:key, p_title:$("#cgt").value, p_body:$("#cgb").value, p_sources:src, p_note:$("#cgn").value || null, p_off:null });
    if(r.error){ $("#cgmsg").textContent = r.error.message; b.disabled = false; return; }
    close(); CG.rows = null; CG.inv = null; window.configGuideView(v);
  };
}
window.configGuideView = async function(v){
  css();
  v.innerHTML = `<div class="cg"><p class="muted">Loading…</p></div>`;
  try { await load(); if(CG.tab === "inv" || CG.tab === "hist") await loadInv(); }
  catch(e){ v.innerHTML = `<div class="card"><p class="muted">Couldn't load this page: ${esc(e.message || String(e))}</p></div>`; return; }
  const body = CG.tab === "inv" ? inventory() : CG.tab === "hist" ? history() : guide(CG.tab);
  v.innerHTML = `<div class="cg">${head()}<div class="tabs noprint">${TABS.map(([k, l]) => `<button class="btn ${CG.tab === k ? "on" : ""}" data-tab="${k}">${esc(l)}</button>`).join("")}
    ${CG.tab === "inv" ? `<button class="btn small" id="cgre" style="margin-left:auto">↻ Refresh</button>` : ""}</div>${body}</div>`;
  v.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { CG.tab = b.dataset.tab; window.configGuideView(v); });
  v.querySelectorAll("[data-go]").forEach(a => a.onclick = e => { e.preventDefault(); const t = document.getElementById("cg-" + a.dataset.go); if(t) t.scrollIntoView({ behavior:"smooth", block:"start" }); });
  v.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editBox(v, b.dataset.edit));
  $("#cgprint").onclick = () => window.print(); $("#cgdl").onclick = download;
  const re = $("#cgre"); if(re) re.onclick = () => { CG.inv = null; window.configGuideView(v); };
};
})();
