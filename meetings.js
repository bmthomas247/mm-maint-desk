/* meetings.js (Brandon 2026-10-29): Meetings ▸ Owner Relations (Tue) · Business Development (Wed) · Key Data (every other Wed)
   · Beyond Pricing (Thu) · Managers (Thu). Monday maintenance stays in desk.html (?meet=1).
   Loaded by hub.html; uses its sb / $ / esc. Agenda = meeting_agenda(<key>) (hub_meetings.sql): questions, ideas and tasks built
   from hub data, each section checked against the person's own access in Supabase. Notes/tasks save through meeting_note /
   meeting_task_add / meeting_task_set (append-only notes, tasks never deleted). Routes: #/meet_or · #/meet_bd · #/meet_kd · #/meet_beyond · #/meet_mgr */
(function(){
const MEET = {
  meet_or:     { name:"Owner Relations", dow:2, who:"Jeff and the admins" },
  meet_bd:     { name:"Business Development", dow:3, who:"Jeff and the admins" },
  meet_kd:     { name:"Key Data", dow:3, every:14, anchor:"2026-11-04", who:"Call with Cathy at Key Data", when:"10:15–10:45 am Mountain (11:15 Central), per Key Data's calendar invite" },
  meet_beyond: { name:"Beyond Pricing", dow:4, who:"Weekly call with Kolleen at Beyond", when:"2:30–3:30 pm Mountain (3:30 Central), per Beyond's calendar invite (moved from 3:15)" },
  meet_mgr:    { name:"Managers", dow:4, who:"Weekly managers meeting" },
  // monthly (Brandon 2026-10-29; hub_meetings_monthly.sql): nth weekday of the month
  meet_fd:      { name:"Office Staff Monthly", dow:4, nth:1, anchor:"2027-01-07", who:"Front desk, office and managers" },
  meet_track:   { name:"Track Business Review", dow:2, nth:2, until:"2027-12-31", who:"Monthly review with Sohl Chun at Track" },
  meet_trackmk: { name:"Track Digital Marketing", dow:2, nth:3, who:"Monthly review with Marcus Fields at Track" }
};
const MCSS = `
.mtg .mhead{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;justify-content:space-between;margin:0 0 12px}
.mtg .mhead h2{margin:0;font-size:22px} .mtg .mhead p{margin:4px 0 0}
.mtg .mtools{display:flex;gap:8px;flex-wrap:wrap;align-items:center} .mtg .mtools input,.mtg .mtools select{width:auto}
.mtg .mprog{height:5px;border-radius:9px;background:var(--line);margin-top:6px;overflow:hidden} .mtg .mprog i{display:block;height:100%;background:var(--moose,#2f5d3a)}
.mtg h3.mg{margin:18px 0 8px;font-size:15px} .mtg h3.mg .muted{font-weight:400}
.mtg .mi{margin-bottom:9px;padding:12px 14px} .mtg .mi.cov{opacity:.75}
.mtg .mi .mt{display:flex;gap:8px;flex-wrap:wrap;align-items:baseline} .mtg .mi .mt b{font-size:15px}
.mtg .mi ul{margin:6px 0 0;padding-left:18px;font-size:13.5px;color:var(--ink-2)} .mtg .mi li{margin:2px 0}
.mtg .mask{margin:7px 0 0;font-size:14px;font-weight:700;color:var(--moose-ink,#24452c)}
.mtg .msrc{font-size:12px;color:var(--muted);margin:5px 0 0}
.mtg .mprev{margin:6px 0 0;border-left:2px solid var(--line);padding-left:8px;font-size:13px;color:var(--ink-2)}
.mtg .mrow{display:flex;gap:6px;margin-top:8px;align-items:flex-start} .mtg .mrow textarea{flex:1;min-height:44px;font-size:14px}
.mtg .mtask{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px} .mtg .mtask input{flex:1;min-width:140px;width:auto} .mtg .mtask input[type=date]{flex:0 0 auto}
.mtg .tk{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px} .mtg .tk:last-child{border-bottom:0}
.mtg .tk input[type=checkbox]{width:20px;height:20px;margin-top:1px;flex:0 0 auto} .mtg .tk.done span.tx{text-decoration:line-through;color:var(--muted)}
.mtg .tk small{display:block;color:var(--muted);font-size:12px}
.mjoin{flex:none;background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.35);color:#fff;text-decoration:none;white-space:nowrap} a.mjoin{background:#fff;color:var(--forest,#1d3b2a);font-weight:800}
@media print{ .rail,.topbar,.ubar,.mtools,.mrow,.mtask,.btn,#pennybtn{display:none!important} .mtg .mi{break-inside:avoid;box-shadow:none} }`;
let cssDone = false;
const css = () => { if(cssDone) return; cssDone = true; const s = document.createElement("style"); s.textContent = MCSS; document.head.appendChild(s); };
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const fmt = s => s ? new Date(s + "T12:00").toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }) : "";
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
/* next meeting on or after today (Key Data: every 14 days from the anchor Wednesday) */
function nextDay(m){
  const d = new Date(); d.setHours(12, 0, 0, 0);
  if(m.nth){ if(m.anchor && ymd(d) < m.anchor) return m.anchor;   // monthly: nth weekday of this month, or next month once it has passed
    for(let k = 0; k < 14; k++){ const f = new Date(d.getFullYear(), d.getMonth() + k, 1, 12); f.setDate(1 + (m.dow - f.getDay() + 7) % 7 + (m.nth - 1) * 7);
      if(f.getMonth() === (d.getMonth() + k) % 12 && ymd(f) >= ymd(d)) return ymd(f); } }
  if(m.every){ const a = new Date(m.anchor + "T12:00"); const n = Math.round((d - a) / 864e5);
    const add = n <= 0 ? -n : (m.every - n % m.every) % m.every; d.setDate(d.getDate() + add); return ymd(d); }
  d.setDate(d.getDate() + (m.dow - d.getDay() + 7) % 7); return ymd(d);
}
const ST = { day:{}, data:{}, people:null, drafts:{}, sched:{} };
async function people(){
  if(ST.people) return ST.people; ST.people = [];
  try { const r = await sb.rpc("hub_staff_directory"); ST.people = (r.data || []).map(x => x.name).filter(Boolean).sort(); } catch(e){}
  return ST.people;
}
function linkHtml(u){
  if(!u) return "";
  return `<a class="muted" href="${esc(u)}" style="font-size:12.5px">Open ↗</a>`;
}
async function load(v, key){
  const r = await sb.rpc("meeting_agenda", { p_meet:key });
  if(r.error || !r.data){ v.innerHTML = `<div class="page"><div class="card"><p class="muted">Couldn't load the agenda${r.error ? ": " + esc(r.error.message) : ""}.</p></div></div>`; return null; }
  ST.data[key] = r.data; return r.data;
}
window.meetView = async function(v, key){
  css(); const m = MEET[key]; if(!m) return;
  if(!ST.day[key]) ST.day[key] = nextDay(m);
  v.innerHTML = `<div class="page mtg"><p class="muted">Building the agenda…</p></div>`;
  const [data, ppl, sc] = await Promise.all([load(v, key), people(), sb.from("hub_meeting_sched").select("start_time,minutes,source").eq("meet", key).maybeSingle()]);
  if(sc && sc.data) ST.sched[key] = sc.data;   // times set on Calendar ▸ Meetings (hub_calendar.sql) win over the defaults here
  if(!data) return; render(v, key, data, ppl);
};
/* Monday maintenance (desk.html in a frame, Brandon 2026-10-29): Join button in the green banner next to the page name.
   Link + admin flag from meeting_link() (hub_meetings_monday.sql); hub.html route() removes .mjoin when the page changes. */
window.meetJoin = async function(key){
  css(); const r = await sb.rpc("meeting_link", { p_meet:key });
  if(r.error || !r.data || current() !== key) return;
  const L = r.data.link, put = html => [$("#utl"), $("#ttl")].forEach(t => { if(t) t.insertAdjacentHTML("afterend", html); });
  if(r.data.admin) put(`<button class="btn small mjoin mjset">${L ? "Change link" : "+ Join link"}</button>`);   // afterend: put this first so Join lands next to the title
  if(L) put(`<a class="btn small mjoin" href="${esc(L.url)}" target="_blank" rel="noopener">▶ Join${L.label ? " " + esc(L.label) : ""}</a>`);
  document.querySelectorAll(".mjset").forEach(b => b.onclick = async () => {
    const u = prompt("Paste the meeting's join link (https://…). Only people who can open this meeting will see it.", ""); if(!u) return;
    const w = await sb.rpc("meeting_link_set", { p_meet:key, p_url:u.trim(), p_label:/meet\.google/.test(u) ? "Google Meet" : /zoom\.us/.test(u) ? "Zoom" : "" });
    if(w.error) return alert("Couldn't save: " + w.error.message);
    document.querySelectorAll(".mjoin").forEach(x => x.remove()); meetJoin(key); });
};
const t12 = t => { const [h, mi] = t.split(":").map(Number); return (h % 12 || 12) + (mi ? ":" + String(mi).padStart(2, "0") : "") + (h < 12 ? " am" : " pm"); };
function schedWhen(key){ const s = ST.sched[key]; if(!s || !s.start_time) return {};
  const st = s.start_time.slice(0, 5), x = st.split(":").map(Number), e = s.minutes ? x[0] * 60 + x[1] + s.minutes : null;
  return { when: t12(st) + (e != null ? "–" + t12(String(Math.floor(e / 60) % 24).padStart(2, "0") + ":" + String(e % 60).padStart(2, "0")) : "") + " Mountain" + (s.source ? " (" + s.source + ")" : "") }; }
function render(v, key, data, ppl){
  const m = Object.assign({}, MEET[key], schedWhen(key)), day = ST.day[key], items = data.items || [], notes = data.notes || [], tasks = data.tasks || [];
  const noteFor = (d, k) => notes.find(n => n.day === d && n.item === k);
  const past = [...new Set(notes.map(n => n.day))].filter(d => d < day).sort().reverse();
  const covered = items.filter(it => (noteFor(day, it.key) || {}).text).length;
  const open = tasks.filter(t => !t.done_at), done = tasks.filter(t => t.done_at);
  const dl = `<datalist id="mppl">${ppl.map(p => `<option value="${esc(p)}">`).join("")}</datalist>`;
  const taskRow = t => `<div class="tk${t.done_at ? " done" : ""}"><input type="checkbox" data-tdone="${t.id}" ${t.done_at ? "checked" : ""} aria-label="Done">
      <div style="flex:1"><span class="tx">${esc(t.text)}</span><small>${[t.who ? "Who: " + esc(t.who) : "", t.due ? "Due " + esc(fmt(t.due)) : "",
        "From " + esc(fmt(t.day)) + (t.created_by ? " by " + esc(t.created_by) : ""), t.done_at ? "Done" + (t.done_by ? " by " + esc(t.done_by) : "") : ""].filter(Boolean).join(" · ")}</small></div></div>`;
  const taskForm = (k) => `<div class="mtask" data-tform="${esc(k)}"><input placeholder="New task: what needs to happen" data-tf="text"><input list="mppl" placeholder="Who" data-tf="who" style="max-width:170px"><input type="date" data-tf="due"><button class="btn small" data-tadd="${esc(k)}">+ Task</button></div>`;
  const grps = {}; items.forEach(it => (grps[it.grp] = grps[it.grp] || []).push(it));
  let h = `<div class="page mtg">${dl}<div class="mhead"><div><h2>${esc(m.name)} meeting · ${esc(fmt(day))}</h2>
      <p class="muted">${esc(m.who)} · ${m.nth ? ["first","second","third","fourth","fifth"][m.nth - 1] + " " + DAYS[m.dow] + " of the month" : m.every ? "every other " + DAYS[m.dow] : "every " + DAYS[m.dow]}${m.when ? ", " + esc(m.when) : ""}. Go down the list; write what was decided and add tasks.</p></div>
    <div class="mtools">${data.link ? `<a class="btn small primary" href="${esc(data.link.url)}" target="_blank" rel="noopener">▶ Join${data.link.label ? " " + esc(data.link.label) : ""}</a>` : ""}${data.admin ? `<button class="btn small" id="mlink">${data.link ? "Change link" : "+ Join link"}</button>` : ""}<input type="date" id="mday" value="${esc(day)}" aria-label="Meeting date"><button class="btn small" id="mref">↻ Refresh</button><button class="btn small" id="mprint">Print / PDF</button></div></div>
    <div class="card" style="padding:12px 14px"><div style="display:flex;justify-content:space-between;font-size:13px"><b>${covered} of ${items.length} covered</b><span class="muted" style="font-size:13px">${past[0] ? "Last meeting " + esc(fmt(past[0])) : "First meeting"}</span></div>
      <div class="mprog"><i style="width:${items.length ? covered / items.length * 100 : 0}%"></i></div></div>
    <h3 class="mg">Open tasks <span class="muted">${open.length}</span></h3><div class="card" style="padding:8px 14px">
      ${open.length ? open.map(taskRow).join("") : `<p class="muted" style="margin:6px 0">No open tasks.</p>`}
      ${done.length ? `<details><summary class="muted" style="cursor:pointer;padding:6px 0">Done in the last 3 weeks (${done.length})</summary>${done.map(taskRow).join("")}</details>` : ""}
      ${taskForm("")}</div>`;
  if(!items.length) h += `<div class="card"><p class="muted" style="margin:0">Nothing came up from the data this week. Use the notes below for anything else.</p></div>`;
  Object.keys(grps).forEach(g => {
    h += `<h3 class="mg">${esc(g)} <span class="muted">${grps[g].length}</span></h3>`;
    grps[g].forEach(it => {
      const mine = noteFor(day, it.key) || {}, cov = !!mine.text, dv = ST.drafts[key + "|" + it.key];
      const prev = past.slice(0, 3).map(d => { const n = noteFor(d, it.key); return n && n.text ? `<div><b>${esc(fmt(d))}:</b> ${esc(n.text)}</div>` : ""; }).join("");
      const itTasks = open.filter(t => t.item_key === it.key);
      h += `<div class="card mi${cov ? " cov" : ""}"><div class="mt"><b>${esc(it.title)}</b>${cov ? `<span class="pill green">covered</span>` : ""}${linkHtml(it.link)}</div>
        ${(it.lines || []).filter(Boolean).length ? `<ul>${it.lines.filter(Boolean).map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        ${it.ask ? `<p class="mask">❓ ${esc(it.ask)}</p>` : ""}
        <p class="msrc">Source: ${esc(it.src || "")}</p>
        ${prev ? `<div class="mprev">${prev}</div>` : ""}
        ${itTasks.length ? `<div class="mprev">${itTasks.map(t => "☐ " + esc(t.text) + (t.who ? " · " + esc(t.who) : "")).join("<br>")}</div>` : ""}
        <div class="mrow"><textarea data-note="${esc(it.key)}" placeholder="What was decided, who is doing it, by when">${esc(dv != null ? dv : (mine.text || ""))}</textarea><button class="btn small primary" data-nsave="${esc(it.key)}">${cov ? "Update" : "Save"}</button></div>
        ${mine.by ? `<p class="msrc">Saved by ${esc(mine.by)}</p>` : ""}
        ${taskForm(it.key)}</div>`; }); });
  const gen = noteFor(day, "_notes") || {}, gdv = ST.drafts[key + "|_notes"];
  h += `<h3 class="mg">Anything else</h3><div class="card"><textarea data-note="_notes" style="width:100%;min-height:110px" placeholder="Other topics, ideas, decisions">${esc(gdv != null ? gdv : (gen.text || ""))}</textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><button class="btn small primary" data-nsave="_notes">Save</button>${gen.by ? `<span class="muted" style="font-size:12.5px">Saved by ${esc(gen.by)}</span>` : ""}</div>
      ${past.length ? `<p class="muted" style="margin:10px 0 0;font-size:13px">Past meetings: ${past.slice(0, 12).map(d => `<a href="#" data-mday="${esc(d)}">${esc(fmt(d))}</a>`).join(" · ")}</p>` : ""}</div>
    <p class="muted" style="font-size:12px">Agenda built ${esc(new Date(data.built).toLocaleString())} from hub data. Each item shows where it came from.</p></div>`;
  v.innerHTML = h;
  const redraw = async () => { const sy = window.scrollY; const d = await load(v, key); if(d){ render(v, key, d, ppl); window.scrollTo(0, sy); } };
  v.querySelectorAll("textarea[data-note]").forEach(t => t.oninput = () => ST.drafts[key + "|" + t.dataset.note] = t.value);
  $("#mday").onchange = e => { if(e.target.value){ ST.day[key] = e.target.value; ST.drafts = {}; render(v, key, data, ppl); } };
  $("#mref").onclick = redraw;
  if($("#mlink")) $("#mlink").onclick = async () => {   // admins paste the Zoom / Meet link themselves (it can carry a passcode)
    const u = prompt("Paste the meeting's join link (https://…). Only people who can open this meeting will see it.", ""); if(!u) return;
    const r = await sb.rpc("meeting_link_set", { p_meet:key, p_url:u.trim(), p_label:/meet\.google/.test(u) ? "Google Meet" : /zoom\.us/.test(u) ? "Zoom" : "" });
    if(r.error) return alert("Couldn't save: " + r.error.message); redraw(); };
  $("#mprint").onclick = () => window.print();
  v.querySelectorAll("[data-mday]").forEach(a => a.onclick = e => { e.preventDefault(); ST.day[key] = a.dataset.mday; ST.drafts = {}; render(v, key, data, ppl); window.scrollTo(0, 0); });
  v.querySelectorAll("[data-nsave]").forEach(b => b.onclick = async () => {
    const k = b.dataset.nsave, t = v.querySelector(`textarea[data-note="${CSS.escape(k)}"]`);
    b.disabled = true; const r = await sb.rpc("meeting_note", { p_meet:key, p_day:day, p_item:k, p_text:t.value.trim() }); b.disabled = false;
    if(r.error) return alert("Couldn't save: " + r.error.message);
    delete ST.drafts[key + "|" + k]; redraw(); });
  v.querySelectorAll("[data-tadd]").forEach(b => b.onclick = async () => {
    const f = b.closest(".mtask"), g = n => f.querySelector(`[data-tf="${n}"]`).value.trim();
    if(g("text").length < 2) return f.querySelector('[data-tf="text"]').focus();
    b.disabled = true; const r = await sb.rpc("meeting_task_add", { p_meet:key, p_day:day, p_item:b.dataset.tadd, p_text:g("text"), p_who:g("who"), p_due:g("due") || null }); b.disabled = false;
    if(r.error) return alert("Couldn't add: " + r.error.message);
    redraw(); });
  v.querySelectorAll("[data-tdone]").forEach(c => c.onchange = async () => {
    const r = await sb.rpc("meeting_task_set", { p_id:+c.dataset.tdone, p_done:c.checked, p_off:false });
    if(r.error){ alert("Couldn't save: " + r.error.message); c.checked = !c.checked; return; }
    redraw(); });
}
})();
