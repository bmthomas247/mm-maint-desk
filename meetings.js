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
const MCSS = `.mtg .mfeed{margin:8px 0;border-left:3px solid #7ea04a;padding:2px 0 2px 10px;display:grid;gap:6px;font-size:13.5px}.mtg .mfeed .mfn div{white-space:pre-wrap}

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
.mtg .mrow{display:flex;gap:6px;margin-top:8px;align-items:flex-start} .mtg .mrow textarea{flex:1;min-height:44px;font-size:14px} .mtg .mrow select{max-width:150px;font-size:13px}
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
  css(); if(!MEET[key]) return;
  v.innerHTML = `<div class="page mtg"><p class="muted">Building the agenda…</p></div>`;
  // day + time set on Calendar ▸ Meetings (hub_calendar.sql, hub_meeting_sched_day.sql) win over the defaults here
  const sc = await sb.from("hub_meeting_sched").select("dow,every,nth,anchor,until,start_time,minutes,source").eq("meet", key).maybeSingle();
  if(sc && sc.data){ ST.sched[key] = sc.data; const s = sc.data;
    MEET[key] = Object.assign({}, MEET[key], { dow:s.dow, nth:s.nth || undefined, anchor:s.anchor || undefined, until:s.until || undefined, every:s.anchor && !s.nth ? s.every : (s.every === 14 ? 14 : undefined) }); }
  const m = MEET[key];
  if(!ST.day[key]) ST.day[key] = nextDay(m);
  const [data, ppl] = await Promise.all([load(v, key), people()]);
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
/* Upload a recording / transcript / notes (Brandon 2026-11-09, "Yes, add it" to every meeting). Files -> private bucket meeting-files/<meet>/<day>/,
   a row in hub_meeting_uploads (hub_meeting_uploads.sql), the TEXT read by Edge Function meet-notes-read, which suggests notes per item + asks questions.
   Suggestions only fill the note boxes (drafts); a person presses Save. Recordings are kept but not turned into words. */
const UP = { last: null, busy: false };
const upLib = src => new Promise((ok, no) => { const e = document.createElement("script"); e.src = src; e.onload = ok; e.onerror = no; document.head.appendChild(e); });
async function upText(f){ const n = (f.name || "").toLowerCase();
  if(/\.(txt|vtt|srt|md|csv|log|json)$/.test(n) || /^text\//.test(f.type)){ const t = await f.text(); return /\.(vtt|srt)$/.test(n) ? t.replace(/^WEBVTT.*$/m, "").replace(/^\d+\s*$/gm, "").replace(/^[\d:.,]+ --> [\d:.,]+.*$/gm, "").replace(/\n{2,}/g, "\n") : t; }
  if(/\.docx$/.test(n)){ if(!window.mammoth) await upLib("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js"); return (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value || ""; }
  if(/\.pdf$/.test(n)){ if(!window.pdfjsLib) await upLib("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const doc = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise; const out = [];
    for(let i = 1; i <= Math.min(doc.numPages, 80); i++){ const c = await (await doc.getPage(i)).getTextContent(); out.push(c.items.map(x => x.str).join(" ")); } return out.join("\n"); }
  return ""; }
const upKind = f => /^(audio|video)\//.test(f.type) || /\.(m4a|mp3|mp4|wav|webm|mov|ogg|aac)$/i.test(f.name) ? "recording" : "text";
function upClose(){ const o = document.getElementById("mupov"); if(o) o.remove(); }
function upOpen(v, key, day, items, redraw){
  upClose(); const o = document.createElement("div"); o.id = "mupov";
  o.style.cssText = "position:fixed;inset:0;z-index:60;background:rgba(8,14,17,.5);overflow:auto;padding:24px 12px";
  o.innerHTML = `<div class="card" style="max-width:760px;margin:0 auto;padding:18px 20px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">Upload a recording or notes · ${esc(fmt(day))}</h3><button class="btn small" id="mupx">✕ Close</button></div>
    <p class="muted" style="font-size:13px">Send in anything from the meeting: the Zoom (or Teams / Google Meet) <b>transcript</b> or AI summary, your own notes, or the <b>recording</b>. The hub reads the words and fills in notes on each item for you to check. Recordings are kept with the meeting, but the hub can't turn sound into words yet, so add the transcript too (Zoom: Recordings ▸ the meeting ▸ Audio transcript ▸ Download, a .vtt file).</p>
    <input type="file" id="mupf" multiple accept=".vtt,.srt,.txt,.md,.docx,.pdf,.m4a,.mp3,.mp4,.wav,.webm,.mov,audio/*,video/*,text/*">
    <textarea id="mupt" rows="5" style="width:100%;margin-top:8px" placeholder="…or paste notes / a transcript here"></textarea>
    <div style="margin-top:8px"><button class="btn small primary" id="mupgo">Upload and read it</button> <span class="muted" id="mupmsg" style="font-size:13px"></span></div>
    <div id="mupres" style="margin-top:12px"></div><div id="muplist" style="margin-top:12px"></div></div>`;
  document.body.appendChild(o);
  o.onclick = e => { if(e.target === o) upClose(); };
  o.querySelector("#mupx").onclick = upClose;
  o.querySelector("#mupgo").onclick = () => upGo(key, day, items, redraw);
  upList(key, day, items, redraw); }
async function upList(key, day, items, redraw){
  const r = await sb.from("hub_meeting_uploads").select("id,file_name,path,kind,size,status,error,result,by_name,at").eq("meet", key).eq("day", day).eq("off", false).order("at", { ascending: false });
  const l = r.data || [], el = document.getElementById("muplist"); if(!el) return; if(!l.length){ el.innerHTML = ""; return; }
  el.innerHTML = `<b style="font-size:13px">Sent in for this meeting</b>` + l.map(x => `<div style="font-size:13px;padding:6px 0;border-top:1px solid var(--line)"><span class="muted">${esc(x.by_name || "")} · ${esc(new Date(x.at).toLocaleString())} · ${esc(x.status === "read" ? "read" : x.status === "no_text" ? "recording only" : x.status)}</span><br>
    ${x.path ? `<a href="#" data-dl="${esc(x.path)}">${esc(x.file_name || "file")}</a>` : esc(x.file_name || "Pasted notes")}${x.size ? ` <span class="muted">${(x.size / 1048576).toFixed(1)} MB</span>` : ""}${x.result ? ` · <a href="#" data-show="${x.id}">See what it found</a>` : ""}${x.error && x.status !== "no_text" ? ` <span style="color:#b33">${esc(x.error)}</span>` : ""}</div>`).join("");
  el.querySelectorAll("[data-dl]").forEach(a => a.onclick = async e => { e.preventDefault(); const u = await sb.storage.from("meeting-files").createSignedUrl(a.dataset.dl, 600); if(u.data) window.open(u.data.signedUrl, "_blank"); else alert("Couldn't open it"); });
  el.querySelectorAll("[data-show]").forEach(a => a.onclick = e => { e.preventDefault(); const x = l.find(y => String(y.id) === a.dataset.show); if(x) upShow(x.result, x.file_name, key, items, redraw); }); }
async function upGo(key, day, items, redraw){
  if(UP.busy) return; const fs = [...(document.getElementById("mupf").files || [])], pasted = document.getElementById("mupt").value, msg = document.getElementById("mupmsg");
  if(!fs.length && !pasted.trim()) return alert("Pick a file or paste notes");
  UP.busy = true; document.getElementById("mupgo").disabled = true; const texts = [], names = [], ids = [];
  try {
    for(const f of fs){ const kind = upKind(f), path = `${key}/${day}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
      msg.textContent = "Uploading " + f.name + "…";
      const u = await sb.storage.from("meeting-files").upload(path, f, { contentType: f.type || "application/octet-stream" }); if(u.error) throw u.error;
      let t = ""; if(kind === "text"){ try { t = await upText(f); } catch(e){ t = ""; } }
      if(t){ texts.push("### " + f.name + "\n" + t); names.push(f.name); }
      const r = await sb.from("hub_meeting_uploads").insert({ meet: key, day, file_name: f.name, path, kind, size: f.size, status: t ? "new" : "no_text",
        error: t ? null : (kind === "recording" ? "Recording saved. Add the transcript so the hub can read it." : "No words found in this file.") }).select("id").single();
      if(r.error) throw r.error; ids.push({ id: r.data.id, has: !!t }); }
    if(pasted.trim()){ texts.push("### Pasted notes\n" + pasted); names.push("pasted notes");
      const r = await sb.from("hub_meeting_uploads").insert({ meet: key, day, file_name: null, kind: "text", size: pasted.length }).select("id").single(); if(r.error) throw r.error; ids.push({ id: r.data.id, has: true }); }
    if(!texts.length){ msg.textContent = "Saved. There were no words to read: add the transcript or notes too."; }
    else {
      const target = ids.filter(x => x.has).pop() || ids[ids.length - 1]; msg.textContent = "Reading it… (about a minute)";
      const its = items.map(it => ({ key: it.key, title: it.title, next: "" })).concat([{ key: "_notes", title: "Anything else", next: "" }]);
      UP.last = { id: target.id, text: texts.join("\n\n"), items: its, from: names.join(", "), answers: [] };
      const r = await sb.functions.invoke("meet-notes-read", { body: { id: target.id, text: UP.last.text, items: its } }); const b = r.data || {};
      if(r.error || !b.ok) msg.textContent = b.error || "Couldn't read it. Try again."; else { msg.textContent = "Done."; upShow(b.result, UP.last.from, key, items, redraw); }
    }
  } catch(e){ msg.textContent = "Not saved: " + ((e && e.message) || "error"); }
  UP.busy = false; const g = document.getElementById("mupgo"); if(g) g.disabled = false; upList(key, day, items, redraw); }
async function upAnswer(key, items, redraw){
  const L = UP.last, msg = document.getElementById("mupqmsg"); if(!L) return;
  const ans = [...document.querySelectorAll("[data-q]")].map(x => ({ q: x.dataset.q, a: x.value.trim() })).filter(x => x.a);
  if(!ans.length) return alert("Type an answer first");
  L.answers = L.answers.concat(ans); msg.textContent = "Updating the notes…"; document.getElementById("mupqgo").disabled = true;
  const r = await sb.functions.invoke("meet-notes-read", { body: { id: L.id, text: L.text, items: L.items, answers: L.answers } }); const b = r.data || {};
  if(r.error || !b.ok){ msg.textContent = b.error || "Couldn't update. Try again."; document.getElementById("mupqgo").disabled = false; return; }
  upShow(b.result, L.from, key, items, redraw); }
function upShow(res, from, key, items, redraw){
  const el = document.getElementById("mupres"); if(!el || !res) return;
  const byKey = {}; items.forEach(it => byKey[it.key] = it); byKey._notes = { title: "Anything else" };
  const its = (res.items || []).filter(x => byKey[x.key]), nw = res.new_items || [], qs = res.questions || [], canAsk = UP.last && UP.last.from === from;
  const tt = k => byKey[k] ? byKey[k].title + ": " : "";
  el.innerHTML = `<div style="background:#f1f6e8;border:1px solid #d6e4bf;border-radius:12px;padding:9px 12px;font-size:13.5px"><b>What the hub found${from ? " in " + esc(from) : ""}:</b> ${esc(res.summary || "")}</div>` +
    (qs.length ? `<div style="background:#fbf7ec;border:1px solid #efe2bd;border-radius:12px;padding:9px 12px;font-size:13.5px;margin-top:10px"><b>❓ A few questions so the notes are right${canAsk ? "" : " (answer them right after an upload)"}</b>` +
      qs.map(q => `<div style="margin-top:6px">${esc(tt(q.key) + q.question)}${canAsk ? `<input data-q="${esc(tt(q.key) + q.question)}" style="width:100%;margin-top:3px" placeholder="Your answer (leave blank to skip)">` : ""}</div>`).join("") +
      (canAsk ? `<div style="margin-top:8px"><button class="btn small primary" id="mupqgo">Answer and update the notes</button> <span class="muted" id="mupqmsg"></span></div>` : "") + `</div>` : "") +
    ((res.answered || []).length ? `<p class="muted" style="font-size:12.5px">Updated with your answers (${res.answered.length}).</p>` : "") +
    (its.length ? `<b style="display:block;margin-top:10px;font-size:13px">Notes for items on the agenda (${its.length}) — untick any you don't want</b>` + its.map((x, i) =>
      `<label style="display:flex;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:13px;cursor:pointer"><input type="checkbox" checked data-i="${i}"><span><b>${esc(byKey[x.key].title)}</b><br>${esc(x.note)}${x.next ? `<br><span style="color:#3c5f12;font-weight:600">➜ Next: ${esc(x.next)}</span>` : ""}${x.quote ? `<br><span class="muted">“${esc(x.quote)}”</span>` : ""}</span></label>`).join("") : `<p class="muted">Nothing matched the agenda items.</p>`) +
    (nw.length ? `<b style="display:block;margin-top:10px;font-size:13px">Also came up (${nw.length}) — goes into "Anything else"</b>` + nw.map((x, i) =>
      `<label style="display:flex;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:13px;cursor:pointer"><input type="checkbox" checked data-n="${i}"><span><b>${esc(x.title)}</b><br>${esc(x.note)}${x.next ? `<br><span style="color:#3c5f12;font-weight:600">➜ Next: ${esc(x.next)}</span>` : ""}</span></label>`).join("") : "") +
    ((its.length || nw.length) ? `<div style="margin-top:10px"><button class="btn small primary" id="mupput">Put the ticked ones into the meeting notes</button> <span class="muted" style="font-size:12.5px">You still press Save on each item, so nothing is saved until you check it.</span></div>` : "");
  const qg = document.getElementById("mupqgo"); if(qg) qg.onclick = () => upAnswer(key, items, redraw);
  const put = document.getElementById("mupput"); if(put) put.onclick = () => {
    const data = ST.data[key] || {}, notes = data.notes || [], day = ST.day[key];
    const mine = k => (notes.find(n => n.day === day && n.item === k && n.mine) || {}).text || "";
    const add = (k, t) => { const dk = key + "|" + k, cur = ST.drafts[dk] != null ? ST.drafts[dk] : mine(k); ST.drafts[dk] = (cur ? cur + "\n" : "") + t; };
    let n = 0;
    el.querySelectorAll("[data-i]").forEach(cb => { if(!cb.checked) return; const x = its[+cb.dataset.i]; add(x.key, x.note + (x.next ? " Next: " + x.next : "")); n++; });
    el.querySelectorAll("[data-n]").forEach(cb => { if(!cb.checked) return; const x = nw[+cb.dataset.n]; add("_notes", "• " + x.title + ": " + x.note + (x.next ? " Next: " + x.next : "")); n++; });
    upClose(); redraw(); alert(n + " note" + (n === 1 ? "" : "s") + " filled in. Check each one and press Save."); }; }
function render(v, key, data, ppl){
  const m = Object.assign({}, MEET[key], schedWhen(key)), day = ST.day[key], items = data.items || [], notes = data.notes || [], tasks = data.tasks || [];
  // everyone in the meeting keeps their own note per topic (hub_meeting_notes_everyone.sql); the newest one says where it stands
  const notesOf = (d, k) => { const a = notes.filter(n => n.day === d && n.item === k && n.text).sort((x, y) => String(x.at).localeCompare(String(y.at)));
    return a.filter((n, i) => !a.slice(i + 1).some(m => (m.by || "") === (n.by || "") && m.text !== n.text && m.text.startsWith(n.text.trim()))); };
  const tm = a => { try { return new Date(a).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" }); } catch(e){ return ""; } };
  const feedHtml = (d, k) => { const a = notesOf(d, k); return a.length ? `<div class="mfeed">${a.map(n => `<div class="mfn"><b>${esc(n.by || "Someone")}${n.mine ? " (you)" : ""}</b><span class="muted"> · ${esc(tm(n.at))}</span><div>${esc(n.text)}</div></div>`).join("")}</div>` : ""; };
  const noteFor = (d, k) => { const a = notesOf(d, k); return a[a.length - 1]; };
  const past = [...new Set(notes.map(n => n.day))].filter(d => d < day).sort().reverse();
  // a note's state (hub_meeting_note_state.sql): only 'covered' counts; 'waiting' / 'scheduled' stay open (Jeff's test log #11)
  const stOf = n => n && n.text ? (n.state || "covered") : "";
  const covered = items.filter(it => stOf(noteFor(day, it.key)) === "covered").length;
  const waiting = items.filter(it => /^(waiting|scheduled)$/.test(stOf(noteFor(day, it.key)))).length;
  const open = tasks.filter(t => !t.done_at), done = tasks.filter(t => t.done_at);
  const dl = `<datalist id="mppl">${ppl.map(p => `<option value="${esc(p)}">`).join("")}</datalist>`;
  const taskRow = t => `<div class="tk${t.done_at ? " done" : ""}"><input type="checkbox" data-tdone="${t.id}" ${t.done_at ? "checked" : ""} aria-label="Done">
      <div style="flex:1"><span class="tx">${esc(t.text)}</span><small>${[t.who ? "Who: " + esc(t.who) : "", t.due ? "Due " + esc(fmt(t.due)) : "",
        "From " + esc(fmt(t.day)) + (t.created_by ? " by " + esc(t.created_by) : ""), t.done_at ? "Done" + (t.done_by ? " by " + esc(t.done_by) : "") : ""].filter(Boolean).join(" · ")}</small></div></div>`;
  const taskForm = (k) => `<div class="mtask" data-tform="${esc(k)}"><input placeholder="New task: what needs to happen" data-tf="text"><input list="mppl" placeholder="Who" data-tf="who" style="max-width:170px"><input type="date" data-tf="due"><button class="btn small" data-tadd="${esc(k)}">+ Task</button></div>`;
  const grps = {}; items.forEach(it => (grps[it.grp] = grps[it.grp] || []).push(it));
  let h = `<div class="page mtg">${dl}<div class="mhead"><div><h2>${esc(m.name)} meeting · ${esc(fmt(day))}</h2>
      <p class="muted">${esc(m.who)} · ${m.nth ? ["first","second","third","fourth","fifth"][m.nth - 1] + " " + DAYS[m.dow] + " of the month" : m.every === 14 ? "every other " + DAYS[m.dow] : "every " + DAYS[m.dow]}${m.when ? ", " + esc(m.when) : ""}. Go down the list; write what was decided and add tasks.</p></div>
    <div class="mtools">${data.link ? `<a class="btn small primary" href="${esc(data.link.url)}" target="_blank" rel="noopener">▶ Join${data.link.label ? " " + esc(data.link.label) : ""}</a>` : ""}${data.admin ? `<button class="btn small" id="mlink">${data.link ? "Change link" : "+ Join link"}</button>` : ""}<input type="date" id="mday" value="${esc(day)}" aria-label="Meeting date"><button class="btn small" id="mref">↻ Refresh</button><button class="btn small" id="mup">⬆ Upload recording / notes</button><button class="btn small" id="mprint">Print / PDF</button></div></div>
    <div class="card" style="padding:12px 14px"><div style="display:flex;justify-content:space-between;font-size:13px"><b>${covered} of ${items.length} covered${waiting ? ` · ${waiting} waiting / scheduled` : ""}</b><span class="muted" style="font-size:13px">${past[0] ? "Last meeting " + esc(fmt(past[0])) : "First meeting"}</span></div>
      <div class="mprog"><i style="width:${items.length ? covered / items.length * 100 : 0}%"></i></div></div>
    <h3 class="mg">Open tasks <span class="muted">${open.length}</span></h3><div class="card" style="padding:8px 14px">
      ${open.length ? open.map(taskRow).join("") : `<p class="muted" style="margin:6px 0">No open tasks.</p>`}
      ${done.length ? `<details><summary class="muted" style="cursor:pointer;padding:6px 0">Done in the last 3 weeks (${done.length})</summary>${done.map(taskRow).join("")}</details>` : ""}
      ${taskForm("")}</div>`;
  if(!items.length) h += `<div class="card"><p class="muted" style="margin:0">Nothing came up from the data this week. Use the notes below for anything else.</p></div>`;
  Object.keys(grps).forEach(g => {
    h += `<h3 class="mg">${esc(g)} <span class="muted">${grps[g].length}</span></h3>`;
    grps[g].forEach(it => {
      const st = stOf(noteFor(day, it.key)), cov = st === "covered", dv = ST.drafts[key + "|" + it.key];
      const pill = st === "covered" ? `<span class="pill green">covered</span>` : st === "waiting" ? `<span class="pill amber">waiting on owner</span>` : st === "scheduled" ? `<span class="pill amber">scheduled</span>` : "";
      const prev = past.slice(0, 3).map(d => notesOf(d, it.key).map(n => `<div><b>${esc(fmt(d))}${n.by ? " · " + esc(n.by) : ""}:</b> ${esc(n.text)}</div>`).join("")).join("");
      const itTasks = open.filter(t => t.item_key === it.key);
      h += `<div class="card mi${cov ? " cov" : ""}"><div class="mt"><b>${esc(it.title)}</b>${pill}${linkHtml(it.link)}</div>
        ${(it.lines || []).filter(Boolean).length ? `<ul>${it.lines.filter(Boolean).map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        ${it.ask ? `<p class="mask">❓ ${esc(it.ask)}</p>` : ""}
        <p class="msrc">Source: ${esc(it.src || "")}</p>
        ${prev ? `<div class="mprev">${prev}</div>` : ""}
        ${itTasks.length ? `<div class="mprev">${itTasks.map(t => "☐ " + esc(t.text) + (t.who ? " · " + esc(t.who) : "")).join("<br>")}</div>` : ""}
        ${feedHtml(day, it.key)}
        <div class="mrow"><textarea data-note="${esc(it.key)}" placeholder="Add a note: what was decided, who is doing it, by when">${esc(dv != null ? dv : "")}</textarea>
          <select data-nstate="${esc(it.key)}" aria-label="Where it stands">${[["covered","Covered"],["waiting","Waiting on owner"],["scheduled","Scheduled"]].map(([v2, l]) => `<option value="${v2}"${(st || "covered") === v2 ? " selected" : ""}>${l}</option>`).join("")}</select>
          <button class="btn small primary" data-nsave="${esc(it.key)}">Add note</button></div>
        ${taskForm(it.key)}</div>`; }); });
  const gdv = ST.drafts[key + "|_notes"];
  h += `<h3 class="mg">Anything else</h3><div class="card">${feedHtml(day, "_notes")}<textarea data-note="_notes" style="width:100%;min-height:110px" placeholder="Add a note: other topics, ideas, decisions">${esc(gdv != null ? gdv : "")}</textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><button class="btn small primary" data-nsave="_notes">Add note</button></div>
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
  $("#mup").onclick = () => upOpen(v, key, day, items, () => render(v, key, data, ppl));
  v.querySelectorAll("[data-mday]").forEach(a => a.onclick = e => { e.preventDefault(); ST.day[key] = a.dataset.mday; ST.drafts = {}; render(v, key, data, ppl); window.scrollTo(0, 0); });
  v.querySelectorAll("[data-nsave]").forEach(b => b.onclick = async () => {
    const k = b.dataset.nsave, t = v.querySelector(`textarea[data-note="${CSS.escape(k)}"]`), s = v.querySelector(`select[data-nstate="${CSS.escape(k)}"]`);
    if(!t.value.trim()) return t.focus();
    b.disabled = true; const r = await sb.rpc("meeting_note", { p_meet:key, p_day:day, p_item:k, p_text:t.value.trim(), p_state:s ? s.value : "covered" }); b.disabled = false;
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
