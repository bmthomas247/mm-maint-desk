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
const MCSS = `.mtg .mpsul{padding:6px 8px}.mpsur{display:flex;gap:12px;align-items:center;padding:9px 8px;border-radius:10px;cursor:pointer}
.mpsur+.mpsur{border-top:1px solid var(--line)}.mpsur:hover,.mpsur:focus{background:#f6f7f2;outline:none}
.mpsur>i{font-style:normal;width:38px;height:38px;border-radius:9px;display:grid;place-items:center;font-size:18px;flex:0 0 auto;color:#fff}
.mpsum{flex:1;min-width:0}.mpsut{display:flex;justify-content:space-between;gap:10px;align-items:baseline;font-size:14px}.mpsut>span{min-width:0}
.mpsub{height:8px;border-radius:9px;background:#e7e8e2;overflow:hidden;margin:5px 0 3px}.mpsub i{display:block;height:100%;border-radius:9px}
.mpsum small{font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mtg .mpsul{display:grid;grid-template-columns:repeat(auto-fill,minmax(460px,1fr));column-gap:18px}.mtg .mpsul .mpsur+.mpsur{border-top:0}.mtg .mpsul .mpsur{border-bottom:1px solid var(--line)}
.mown{display:block;font-size:13px;color:var(--ink-2,#444);font-weight:600;margin-top:-2px}
.mbwj{border-top:1px solid var(--line);padding:8px 0}.mbwj:first-of-type{border-top:0;padding-top:0}.mbwj .mt2{font-size:13.5px;margin-bottom:4px}
.mbwh{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:6px 8px;background:#f6f7f2;border-radius:8px;margin:4px 0;font-size:13.5px}.mbwh small{display:block;color:var(--muted);font-size:12px}
.mbwc{display:grid;gap:6px;padding:8px;border:1px dashed var(--line);border-radius:8px;margin:4px 0 8px}.mbwc select,.mbwc input{width:auto}
.mbwf{display:grid;gap:8px}.mbwf label{display:grid;gap:3px;font-size:12.5px;color:var(--muted)}.mbwf input,.mbwf select{width:auto}.mbwf #bwh,.mbwf #bwt{width:100%}.mbwf textarea{min-height:80px}
.page.mtg{max-width:1800px;padding:20px 28px}
.mtg .mtiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:4px 0 8px}.mtg .mtiles.two{grid-template-columns:1fr 1fr}
.mtg .mtile{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:flex-start;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.mtg .mtile b{display:block;font-size:22px;line-height:1.1} .mtg .mtile span{font-size:12.5px;color:var(--muted)} .mtg .mtile em{color:#b42318;font-style:normal;font-weight:700}
.mtg .mtile i{font-style:normal;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:#eef3e6;color:#3c5f12;font-size:13px}
.mtg .mtile.g b{color:#3c5f12} .mtg .mtile.r b{color:#b42318}
.mtg .mbar{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin:12px 0 4px}
.mtg .mbar #mq{max-width:240px;width:100%}
.mtg .mfts,.mpanel .mfts{display:inline-flex;gap:2px;background:var(--bg-2,#eef0ea);border-radius:10px;padding:3px;flex-wrap:wrap}
.mft{border:0;background:transparent;padding:5px 10px;border-radius:8px;font:inherit;font-size:13px;color:var(--ink-2,#444);cursor:pointer}
.mft span{color:var(--muted);font-size:12px} .mft.on{background:var(--card,#fff);box-shadow:0 1px 2px rgba(0,0,0,.1);color:var(--ink,#111);font-weight:700}
.mtg .mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
.mtg .mcardx{background:var(--card,#fff);border:1px solid var(--line);border-radius:14px;padding:13px 14px;display:flex;flex-direction:column;gap:6px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:box-shadow .15s}
.mtg .mcardx:hover,.mtg .mcardx:focus{box-shadow:0 4px 14px rgba(0,0,0,.09);outline:none} .mtg .mcardx.cov{opacity:.72}
.mtop{display:flex;gap:6px;flex-wrap:wrap}
.mpill{font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:7px;background:#f1f2ee;color:#555}
.mpill.ok{background:#e7f4e1;color:#2f6b1d} .mpill.wait{background:#fdf1dc;color:#8a5a00} .mpill.todo{background:#eef0f5;color:#3d4a66} .mpill.bad{background:#fde8e6;color:#b42318}
.mtg .mtt{font-size:15px;line-height:1.3} .mtg .mdesc{margin:0;font-size:13px;color:var(--muted);line-height:1.4;min-height:2.8em}
.mtg .mnums{display:grid;grid-template-columns:1fr 1fr;gap:6px} .mtg .mnums b{display:block;font-size:16px} .mtg .mnums span{font-size:12px;color:var(--muted)}
.mtg .mdiv{border-top:1px dashed var(--line);margin:2px 0}
.mtg .mnext{font-size:12.5px;color:var(--ink-2,#333)} .mtg .mnext small,.msig small{display:block;font-size:11.5px;color:var(--muted)}
.macts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px} .mtg .mcardx .macts{margin-top:auto}
.mtg .mcardx .macts .btn:first-child{flex:1}
.mred{color:#b42318;font-weight:700} .mamb{color:#8a5a00;font-weight:700}
.mpov{position:fixed;inset:0;background:rgba(15,25,15,.35);z-index:900;display:flex;justify-content:flex-end}
.mpanel{background:var(--bg,#f7f8f4);width:min(560px,100%);height:100%;overflow:auto;box-shadow:-8px 0 30px rgba(0,0,0,.18);display:flex;flex-direction:column}
.mph{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:16px 18px 10px;background:var(--card,#fff);border-bottom:1px solid var(--line)}
.mph h3{margin:6px 0 2px;font-size:18px}
.mptabs{display:flex;gap:4px;padding:8px 18px;background:var(--card,#fff);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:1}
.mptabs button{border:0;background:transparent;padding:6px 12px;border-radius:8px;font:inherit;font-size:13.5px;cursor:pointer;color:var(--ink-2,#444)}
.mptabs button span{background:#eef0ea;border-radius:6px;padding:0 6px;font-size:12px;margin-left:3px} .mptabs button.on{background:#eef3e6;color:#24452c;font-weight:700}
.mpb{padding:14px 18px 30px;display:grid;gap:12px;align-content:start}
.mpb .mlines{margin:0;padding-left:18px;font-size:13.5px} .mpb .mlines li{margin:3px 0} .mpb .msrc{font-size:12px;color:var(--muted);margin:0}
.msig{display:flex;gap:10px;background:#eef3e6;border-radius:12px;padding:11px 13px;font-size:14px;font-weight:600;color:#24452c} .msig i{font-style:normal;width:26px;height:26px;border-radius:8px;background:#fff;display:grid;place-items:center;flex:0 0 auto}
.msig.red{background:#fde8e6;color:#8a1c12}
.mbox{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:12px 13px} .mbox>b{display:block;font-size:13.5px;margin-bottom:6px}
.mbox textarea{width:100%;min-height:60px;font-size:14px}
.msug{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:7px 0;border-top:1px solid var(--line);font-size:13.5px} .msug:first-of-type{border-top:0}
.mpanel .mtask{display:flex;gap:6px;flex-wrap:wrap} .mpanel .mtask input{flex:1;min-width:150px;width:auto} .mpanel .mtask select,.mpanel .mtask input[type=date]{width:auto;flex:0 0 auto}
.mpanel .tk{display:flex;gap:10px;align-items:flex-start;padding:9px 11px;background:var(--card,#fff);border:1px solid var(--line);border-radius:10px;margin-bottom:6px;font-size:14px}
.mpanel .tk input[type=checkbox]{width:20px;height:20px;flex:0 0 auto} .mpanel .tk small{display:block;color:var(--muted);font-size:12px} .mpanel .tk.done .tx{text-decoration:line-through;color:var(--muted)}
.mact{position:relative;padding-left:4px} .maci{display:flex;gap:10px;padding:8px 0;font-size:13.5px;position:relative}
.maci>i{font-style:normal;width:24px;height:24px;border-radius:50%;background:#eef3e6;display:grid;place-items:center;font-size:12px;flex:0 0 auto;z-index:1}
.maci:not(:last-child)::before{content:"";position:absolute;left:11px;top:30px;bottom:-6px;border-left:1px solid var(--line)}
.mab{color:var(--ink-2,#444);white-space:pre-wrap;margin-top:2px}
.mpanel .mfeed{margin:4px 0 8px;border-left:3px solid #7ea04a;padding:2px 0 2px 10px;display:grid;gap:6px;font-size:13.5px}.mpanel .mfeed .mfn div{white-space:pre-wrap}
@media (max-width:760px){ .mtg .mtiles{grid-template-columns:1fr 1fr} .mpanel{width:100%} }
@media print{ .mpov,.mbar,.macts{display:none!important} .mtg .mcardx{break-inside:avoid;box-shadow:none} }
.mtg .mfeed{margin:8px 0;border-left:3px solid #7ea04a;padding:2px 0 2px 10px;display:grid;gap:6px;font-size:13.5px}.mtg .mfeed .mfn div{white-space:pre-wrap}

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
  if(!ST.day[key]){ ST.day[key] = nextDay(m);   // a single moved or skipped meeting (hub_meeting_moves.sql) wins
    try { const nx = await sb.rpc("meeting_next", { p_meet:key }); if(nx && nx.data && nx.data.day){ ST.day[key] = nx.data.day; ST.next = ST.next || {}; ST.next[key] = nx.data; } } catch(e){} }
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
function schedWhen(key){ const s0 = ST.sched[key], nx = ST.next && ST.next[key];
  const s = nx && nx.day === ST.day[key] && nx.moved_from && nx.start ? Object.assign({}, s0, { start_time:nx.start, minutes:nx.minutes, source:"moved from " + fmt(nx.moved_from) + (nx.note ? ": " + nx.note : "") }) : s0;
  if(!s || !s.start_time) return {};
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
/* Meeting page round 2026-11-10 (Brandon: "things need to be able to get done in the meetings not just note taking" + the two
   sample layouts). Topics = cards in a grid with filters + stat tiles; tapping one opens a panel with Overview · Next steps · Activity.
   Next steps = suggested tasks built from the topic (one tap fills the task form) + the topic's tasks (All / Today / This week / Overdue).
   Tasks go to a person (meeting_task_add2, hub_meeting_actions.sql): they see it on Home + the bell, and get a Slack DM when that's on.
   Owner follow-ups close from the panel (meeting_ofb_set). Wrap up = what was decided + who does what, to copy. */
const MX = { tp:{}, filt:"all", q:"", open:null, tab:"ov", tf:"all", sug:{}, bw:{}, bwp:{}, bwopen:false, chg:null, psu:{}, psuAt:0 };
async function psuLoad(){ try { const r = await sb.from("psu_progress").select("job_id,log"); (r.data || []).forEach(x => MX.psu[x.job_id] = x.log || []); MX.psuAt = Date.now(); } catch(e){} }
/* Breezeway from the meeting (hub_meeting_breezeway.sql): tasks this meeting sent + the Breezeway people list */
async function bwLoad(key){ try { const [a, b] = await Promise.all([sb.rpc("meeting_bw_list", { p_meet:key }), MX.bwp[key] ? null : sb.rpc("meeting_bw_people", { p_meet:key })]);
  MX.bw[key] = a.data || []; if(b) MX.bwp[key] = b.data || []; } catch(e){ MX.bw[key] = MX.bw[key] || []; } }
const BW_URL = id => "https://app.breezeway.io/task/" + id;
async function taskPeople(key){ if(MX.tp[key]) return MX.tp[key];
  try { const r = await sb.rpc("meeting_task_people", { p_meet:key }); MX.tp[key] = r.data || []; } catch(e){ MX.tp[key] = []; }
  return MX.tp[key]; }
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + "T12:00"); d.setDate(d.getDate() + n); return ymd(d); };
/* which team a topic belongs to, for "Message / alert the team" (Brandon 2026-11-10: licenses -> the licensing team) */
const TEAMFOR = { lic:["licensing","the licensing team"], alert:["maint_manager","maintenance"], mt:["maint_manager","maintenance"], rep:["maint_manager","maintenance"],
  proj:["maint_manager","maintenance"], ofb:["owner_relations","owner relations"], behind:["owner_relations","owner relations"], omb:["owner_relations","owner relations"],
  rule:["owner_relations","owner relations"], rv:["owner_relations","owner relations"], ownerstays:["owner_relations","owner relations"], new:["owner_relations","owner relations"],
  folio:["office_manager","the office managers"], psu:["owner_relations","owner relations"], sale:["owner_relations","owner relations"],
  off:["owner_relations","owner relations"], big:["maint_manager","maintenance"] };
const PAGENAME = { "#/licensing":"📄 Open the Licenses page", "#/lic_fire":"📄 Open Fire suppression", "#/property_setup":"🚀 Open Launch Pad" };
const absLink = l => !l ? "" : /^https?:/.test(l) ? l : "https://crew.moosemanagement.com/hub.html" + (/^#/.test(l) ? l : "#/" + l);
const homeOf = it => { const m = String(it.title || "").match(/^([A-Z0-9][A-Z0-9-]*(?: [A-Z0-9-]+)?)(\s·|$)/); return m ? m[1] : ""; };
/* Property Set Up rows (Brandon 2026-11-10: "horizontal percentage ... click from these into the property set up desk ... in the meeting
   its just quick notes and information"). psu = homes being set up, off = homes leaving us. */
const isPsu = it => /^(psu|off)$/.test(kindOf(it));
const psuInfo = it => { const l0 = (it.lines || [])[0] || "", m = l0.match(/^(.*?) · owner (.*?) · (\d+) of (\d+) steps done/);
  return { home: homeOf(it) || String(it.title).split(" · ")[0], pct: +((String(it.title).match(/(\d+)% done/) || [])[1] || 0),
    kind: m ? m[1] : kindOf(it) === "off" ? "Leaving management" : "", owner: m ? m[2] : "", done: m ? +m[3] : null, total: m ? +m[4] : null,
    next: (it.lines || []).filter(l => /^Next: /.test(l)).map(l => l.slice(6)) }; };
const psuColor = pc => pc >= 75 ? "#3c7d1e" : pc >= 40 ? "#2f6fb0" : "#d0742c";
const psuIcon = it => kindOf(it) === "off" ? "🚪" : /lease/i.test(psuInfo(it).kind) ? "🔑" : /2nd/i.test(psuInfo(it).kind) ? "🏡" : "🏠";
const ownerOf = it => { const l = (it.lines || []).find(x => /^Owner: /.test(x || "")); return l ? l.slice(7) : ""; };
const kindOf = it => String(it.key || "").split(":")[0];
const short = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; };
/* suggested next steps, from the kind of topic (Claude's starting list; easy to change here) */
function suggest(it){
  const h = homeOf(it), k = kindOf(it), t = String(it.title || "").split(" · ").slice(1).join(" · ") || it.title, out = [];
  const add = (text, days) => out.push({ text, days: days == null ? 2 : days });
  const nexts = (it.lines || []).filter(l => /^Next: /.test(l)).map(l => l.slice(6));
  if(k === "psu"){ nexts.forEach(n => add(n + ` (${h || "set up"})`, 2)); }
  else if(k === "off"){ add(`Call the ${h || "home"} owner: is there anything we can do to keep them?`, 1); nexts.forEach(n => add(n + ` (${h})`, 3)); }
  else if(k === "sale"){ add(`Ask the ${h || "home"} owner if we keep managing it until it sells`, 2); add(`Offer the ${h || "home"} buyer our management (reach the listing agent)`, 7); }
  else if(k === "big"){ add(`Tell the ${h || "home"} owner about: ${short(t, 80)}`, 1); }
  else if(k === "ofb"){ add(`Call the ${h || "home"} owner about ${t}`, 1); add(`Send the ${h || "home"} owner what we changed and why`, 3); }
  else if(k === "behind"){ add(`Go through the fixes on the worst-performer page for ${h}`, 3); add(`Talk with the ${h} owner about how it's doing`, 7); }
  else if(k === "omb" || k === "rule"){ add(`Ask the ${h || "home"} owner to loosen the minimum price / stay`, 3); }
  else if(k === "rv"){ add(`Fix what the guest wrote about at ${h || t}`, 3); add(`Tell the ${h || "home"} owner about the review`, 2); }
  else if(k === "alert" || k === "mt" || k === "rep" || k === "proj"){ add(`Make sure the owner knows about: ${short(t, 80)}`, 1); add(`Get a date for the fix: ${short(t, 80)}`, 2); }
  else if(k === "lic"){ add("Tell the owners who need to sign or pay their license renewal", 3); }
  else if(k === "ownerstays"){ add("Send a welcome note to each owner arriving", 1); add("Check each owner home is clean and ready", 1); }
  else if(k === "new"){ add(`Check in with the new ${h || "home"} owner`, 7); }
  else if(k === "folio" || k === "pf"){ add(`Look into it and reply to whoever reported it: ${short(t, 70)}`, 2); }
  else if(k === "cmp"){ add("Decide what we do about this competitor intel", 7); }
  else if(k === "fb"){ add(`Answer the request: ${short(t, 80)}`, 3); }
  if(it.ask) add(it.ask.replace(/\?$/, ""), 3);
  return out.slice(0, 4);
}
function render(v, key, data, ppl){
  const m = Object.assign({}, MEET[key], schedWhen(key)), day = ST.day[key], items = data.items || [], notes = data.notes || [], tasks = data.tasks || [];
  // every saved note is its own line in the topic's feed (hub_meeting_notes_feed.sql); an older note a person later extended is hidden
  const notesOf = (d, k) => { const a = notes.filter(n => (d == null || n.day === d) && n.item === k && n.text).sort((x, y) => String(x.at).localeCompare(String(y.at)));
    return a.filter((n, i) => !a.slice(i + 1).some(q => (q.by || "") === (n.by || "") && q.day === n.day && q.text !== n.text && q.text.startsWith(n.text.trim()))); };
  const noteFor = (d, k) => { const a = notesOf(d, k); return a[a.length - 1]; };
  const tm = a => { try { return new Date(a).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }); } catch(e){ return ""; } };
  const past = [...new Set(notes.map(n => n.day))].filter(d => d < day).sort().reverse();
  const stOf = n => n && n.text ? (n.state || "covered") : "";
  const stItem = it => stOf(noteFor(day, it.key));
  const T = today(), wk = addDays(T, 7);
  const open = tasks.filter(t => !t.done_at && !t.off), done = tasks.filter(t => t.done_at);
  const overdue = open.filter(t => t.due && t.due < T);
  const covered = items.filter(it => stItem(it) === "covered").length;
  const waiting = items.filter(it => /^(waiting|scheduled)$/.test(stItem(it))).length;
  const pill = st => st === "covered" ? `<span class="mpill ok">✓ Covered</span>` : st === "waiting" ? `<span class="mpill wait">⏳ Waiting on owner</span>` : st === "scheduled" ? `<span class="mpill wait">🗓 Scheduled</span>` : `<span class="mpill todo">To cover</span>`;
  const dueTxt = t => !t.due ? "" : t.due < T ? `<span class="mred">Overdue · ${esc(fmt(t.due))}</span>` : t.due === T ? `<span class="mamb">Due today</span>` : "Due " + esc(fmt(t.due));
  const taskRow = t => `<div class="tk${t.done_at ? " done" : ""}"><input type="checkbox" data-tdone="${t.id}" ${t.done_at ? "checked" : ""} aria-label="Done">
      <div style="flex:1"><span class="tx">${esc(t.text)}</span><small>${[t.who ? "👤 " + esc(t.who) : "No one yet", dueTxt(t), t.item_title && !MX.open ? esc(short(t.item_title, 60)) : "",
        t.done_at ? "Done" + (t.done_by ? " by " + esc(t.done_by) : "") : "Added " + esc(fmt(t.day)) + (t.created_by ? " by " + esc(t.created_by) : "")].filter(Boolean).join(" · ")}</small></div></div>`;
  const pplOpts = sel => `<option value="">Who?</option>` + (MX.tp[key] || []).map(p => `<option value="${esc(p.id)}"${sel === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  const taskForm = (k, title, pre) => `<div class="mtask" data-tform="${esc(k)}" data-ttitle="${esc(title || "")}"><input placeholder="New task: what needs to happen" data-tf="text" value="${esc(pre ? pre.text : "")}">
      <select data-tf="who" aria-label="Who">${pplOpts(pre && pre.who)}</select><input type="date" data-tf="due" value="${esc(pre && pre.due || "")}"><button class="btn small primary" data-tadd="${esc(k)}">+ Add task</button></div>`;
  const q = MX.q.trim().toLowerCase();
  const shown = items.filter(it => { const st = stItem(it);
    if(MX.filt === "todo" && st) return false; if(MX.filt === "cov" && st !== "covered") return false; if(MX.filt === "wait" && !/^(waiting|scheduled)$/.test(st)) return false;
    if(MX.filt === "tasks" && !open.some(t => t.item_key === it.key)) return false;
    return !q || [it.title, it.grp, (it.lines || []).join(" "), it.ask].join(" ").toLowerCase().includes(q); });
  const fbtn = (k, l, n) => `<button class="mft${MX.filt === k ? " on" : ""}" data-filt="${k}">${l} <span>${n}</span></button>`;
  const tile = (n, l, ic, cls) => `<div class="mtile${cls ? " " + cls : ""}"><div><b>${n}</b><span>${l}</span></div><i>${ic}</i></div>`;
  let h = `<div class="page mtg"><div class="mhead"><div><h2>${esc(m.name)} meeting · ${esc(fmt(day))}</h2>
      <p class="muted">${esc(m.who)} · ${m.nth ? ["first","second","third","fourth","fifth"][m.nth - 1] + " " + DAYS[m.dow] + " of the month" : m.every === 14 ? "every other " + DAYS[m.dow] : "every " + DAYS[m.dow]}${m.when ? ", " + esc(m.when) : ""}</p></div>
    <div class="mtools">${data.link ? `<a class="btn small primary" href="${esc(data.link.url)}" target="_blank" rel="noopener">▶ Join${data.link.label ? " " + esc(data.link.label) : ""}</a>` : ""}${data.admin ? `<button class="btn small" id="mlink">${data.link ? "Change link" : "+ Join link"}</button>` : ""}<input type="date" id="mday" value="${esc(day)}" aria-label="Meeting date"><button class="btn small" id="mref">↻</button><button class="btn small" id="mup">⬆ Upload recording / notes</button><button class="btn small" id="mprint">Print</button><button class="btn small primary" id="mwrap">✅ Wrap up</button></div></div>
    <div class="mtiles">${tile(items.length, "Topics", "📋")}${tile(covered + " / " + items.length, "Covered", "✓", "g")}${tile(waiting, "Waiting / scheduled", "⏳")}${tile(open.length, overdue.length ? `Open tasks · <em>${overdue.length} overdue</em>` : "Open tasks", "☐", overdue.length ? "r" : "")}</div>
    <div class="mprog"><i style="width:${items.length ? covered / items.length * 100 : 0}%"></i></div>
    <div class="mbar"><div class="mfts">${fbtn("all", "All", items.length)}${fbtn("todo", "To cover", items.length - covered - waiting)}${fbtn("wait", "Waiting", waiting)}${fbtn("cov", "Covered", covered)}${fbtn("tasks", "Has tasks", items.filter(it => open.some(t => t.item_key === it.key)).length)}</div>
      <input id="mq" placeholder="🔍 Search topics" value="${esc(MX.q)}"></div>`;
  if(!items.length) h += `<div class="card"><p class="muted" style="margin:0">Nothing came up from the data this week. Use "Anything else" below.</p></div>`;
  const grps = {}; shown.forEach(it => (grps[it.grp] = grps[it.grp] || []).push(it));
  Object.keys(grps).forEach(g => {
    if(grps[g].every(isPsu)){
      h += `<h3 class="mg">${esc(g)} <span class="muted">${grps[g].length}</span> <a class="muted" href="#/property_setup" style="font-size:12.5px;font-weight:400">Open Launch Pad ↗</a></h3><div class="card mpsul">`;
      grps[g].forEach(it => { const P = psuInfo(it), st = stItem(it), nt = notesOf(day, it.key).length;
        h += `<div class="mpsur" data-open="${esc(it.key)}" tabindex="0" role="button"><i style="background:${psuColor(P.pct)}">${psuIcon(it)}</i>
          <div class="mpsum"><div class="mpsut"><span><b>${esc(P.home)}</b>${P.owner ? `<span class="muted"> · ${esc(P.owner)}</span>` : ""}${st ? " " + pill(st) : ""}${nt ? ` <span class="mpill">📝 ${nt}</span>` : ""}</span><b>${P.pct}%</b></div>
            <div class="mpsub"><i style="width:${P.pct}%;background:${psuColor(P.pct)}"></i></div>
            <small class="muted">${esc([P.kind, P.done != null ? P.done + " of " + P.total + " steps" : "", P.next[0] ? "Next: " + P.next[0] : ""].filter(Boolean).join(" · "))}</small></div></div>`; });
      h += `</div>`; return; }
    h += `<h3 class="mg">${esc(g)} <span class="muted">${grps[g].length}</span></h3><div class="mgrid">`;
    grps[g].forEach(it => { const st = stItem(it), nt = notesOf(day, it.key).length, tk = open.filter(t => t.item_key === it.key), od = tk.filter(t => t.due && t.due < T).length, last = noteFor(null, it.key);
      h += `<div class="mcardx${st === "covered" ? " cov" : ""}" data-open="${esc(it.key)}" tabindex="0" role="button">
        <div class="mtop">${pill(st)}${od ? `<span class="mpill bad">${od} overdue</span>` : ""}</div>
        <b class="mtt">${esc(it.title)}</b>${ownerOf(it) ? `<span class="mown">👤 ${esc(ownerOf(it))}</span>` : ""}${kindOf(it) === "psu" || kindOf(it) === "off" ? (pc => `<div class="mprog" style="margin:0"><i style="width:${pc}%"></i></div>`)(+((String(it.title).match(/(\d+)% done/) || [])[1] || 0)) : ""}
        <p class="mdesc">${esc(short(last ? last.text : (it.lines || []).filter(l => l && !/^Owner: /.test(l))[0] || it.ask || "", 130))}</p>
        <div class="mnums"><div><b>${nt}</b><span>Notes today</span></div><div><b>${tk.length}</b><span>Open tasks</span></div></div>
        <div class="mdiv"></div>
        ${it.ask ? `<div class="mnext"><small>Decide</small>${esc(short(it.ask, 90))}</div>` : ""}
        <div class="macts"><button class="btn small" data-open="${esc(it.key)}">Open</button>${st !== "covered" ? `<button class="btn small" data-quick="${esc(it.key)}" title="Mark covered (adds a note)">✓ Covered</button>` : ""}</div></div>`; });
    h += `</div>`; });
  if(items.length && !shown.length) h += `<div class="card"><p class="muted" style="margin:0">Nothing matches.</p></div>`;
  h += `<h3 class="mg">All open tasks <span class="muted">${open.length}</span></h3><div class="card" style="padding:8px 14px">
      ${open.length ? open.map(taskRow).join("") : `<p class="muted" style="margin:6px 0">No open tasks.</p>`}
      ${done.length ? `<details><summary class="muted" style="cursor:pointer;padding:6px 0">Done in the last 3 weeks (${done.length})</summary>${done.map(taskRow).join("")}</details>` : ""}
      ${taskForm("", "")}</div>`;
  const gdv = ST.drafts[key + "|_notes"];
  h += `<h3 class="mg">Anything else</h3><div class="card">${feedHtml(notesOf(day, "_notes"))}<textarea data-note="_notes" style="width:100%;min-height:90px" placeholder="Add a note: other topics, ideas, decisions">${esc(gdv != null ? gdv : "")}</textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><button class="btn small primary" data-nsave="_notes">Add note</button></div>
      ${past.length ? `<p class="muted" style="margin:10px 0 0;font-size:13px">Past meetings: ${past.slice(0, 12).map(d => `<a href="#" data-mday="${esc(d)}">${esc(fmt(d))}</a>`).join(" · ")}</p>` : ""}</div>
    <p class="muted" style="font-size:12px">Agenda built ${esc(new Date(data.built).toLocaleString())} from hub data. Each topic shows where it came from.</p></div>`;
  function feedHtml(a){ return a.length ? `<div class="mfeed">${a.map(n => `<div class="mfn"><b>${esc(n.by || "Someone")}${n.mine ? " (you)" : ""}</b><span class="muted"> · ${esc(tm(n.at))}</span><div>${esc(n.text)}</div></div>`).join("")}</div>` : ""; }
  v.innerHTML = h;

  /* ---------- the panel ---------- */
  function panel(){
    document.getElementById("mpov")?.remove();
    const it = items.find(x => x.key === MX.open); if(!it) return;
    const st = stItem(it), tk = tasks.filter(t => t.item_key === it.key && !t.off), tko = tk.filter(t => !t.done_at), sg = suggest(it), dv = ST.drafts[key + "|" + it.key];
    const act = []; notesOf(null, it.key).forEach(n => act.push({ at:n.at, ic:"📝", h:`<b>${esc(n.by || "Someone")}</b> added a note${n.day !== day ? " (" + esc(fmt(n.day)) + " meeting)" : ""}`, b:esc(n.text) }));
    tk.forEach(t => { act.push({ at:t.created_at, ic:"☐", h:`<b>${esc(t.created_by || "Someone")}</b> added a task${t.who ? " for " + esc(t.who) : ""}`, b:esc(t.text) });
      if(t.done_at) act.push({ at:t.done_at, ic:"✅", h:`<b>${esc(t.done_by || "Someone")}</b> finished a task`, b:esc(t.text) }); });
    (MX.bw[key] || []).filter(j => j.item === it.key && j.kind === "job").forEach(j => act.push({ at:new Date(+j.at).toISOString(), ic:"🛠", h:`<b>${esc(j.by || "Someone")}</b> sent a Breezeway task`, b:esc(j.title + " · " + (j.homes || []).map(h => h.home).join(", ")) }));
    act.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const tabs = [["ov", "Overview", ""], ["nx", "Next steps", tko.length], ["ac", "Activity", act.length]];
    const tfl = t => MX.tf === "all" ? true : MX.tf === "today" ? t.due === T : MX.tf === "week" ? t.due && t.due >= T && t.due <= wk : MX.tf === "over" ? t.due && t.due < T : MX.tf === "done" ? !!t.done_at : true;
    const isOfb = kindOf(it) === "ofb", fid = isOfb ? +String(it.key).split(":")[1] : 0;
    let b = "";
    if(MX.tab === "ov" && isPsu(it)){
      const P = psuInfo(it), lg = MX.psu[String(it.key).split(":")[1]] || [], dv2 = ST.drafts[key + "|" + it.key];
      b = `<div class="mbox"><div class="mpsut"><span>${esc(P.kind)}${P.owner ? " · owner " + esc(P.owner) : ""}</span><b>${P.pct}%</b></div>
          <div class="mpsub" style="margin:6px 0"><i style="width:${P.pct}%;background:${psuColor(P.pct)}"></i></div>
          <small class="muted">${P.done != null ? P.done + " of " + P.total + " steps done" : ""}</small>
          ${P.next.length ? `<div style="margin-top:8px"><b style="font-size:13px">Next up</b><ul class="mlines">${P.next.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}</div>
        ${it.ask ? `<div class="msig"><i>✦</i><div><small>Ask everyone</small>${esc(it.ask)}</div></div>` : ""}
        <div class="mbox"><b>📝 Note for Launch Pad</b><p class="muted" style="font-size:12px;margin:0 0 6px">Saved on this home's meeting notes in Property Set Up (and here).</p>
          ${feedHtml(notesOf(day, it.key))}<textarea id="mpsun" placeholder="What did we say? Who does what?">${esc(dv2 != null ? dv2 : "")}</textarea>
          <div class="macts"><button class="btn small primary" id="mpsus">Save to Launch Pad</button><span class="muted" id="mpsum" style="font-size:13px"></span></div></div>
        ${lg.length ? `<div class="mbox"><b>Earlier meeting notes (Launch Pad)</b>${lg.map(e => `<div class="mfn" style="margin-top:6px"><b>${esc(fmt(e.day))}</b><span class="muted"> · ${esc(e.src || e.by || "")}</span><div style="white-space:pre-wrap;font-size:13.5px">${esc(e.text)}</div></div>`).join("")}</div>` : ""}
        <div class="macts"><a class="btn small primary" href="#/property_setup">🚀 Open in Property Set Up</a></div>
        <p class="msrc">Source: ${esc(it.src || "")}</p>`;
    } else if(MX.tab === "ov"){
      b = `${(it.lines || []).filter(Boolean).length ? `<ul class="mlines">${it.lines.filter(Boolean).map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        ${it.ask ? `<div class="msig"><i>✦</i><div><small>Decide in the meeting</small>${esc(it.ask)}</div></div>` : ""}
        <p class="msrc">Source: ${esc(it.src || "")}</p>
        <div class="macts">${it.link ? `<a class="btn small primary" href="${esc(it.link)}"${/^https?:/.test(it.link) ? ` target="_blank" rel="noopener"` : ""}>${esc(PAGENAME[it.link] || (/zillow/.test(it.link) ? "🏠 Open on Zillow ↗" : "Open the page ↗"))}</a>` : ""}${tko.length ? `<button class="btn small" data-ptab="nx">☐ ${tko.length} open task${tko.length > 1 ? "s" : ""}</button>` : ""}${sg.length ? `<button class="btn small" data-ptab="nx">✦ ${sg.length} suggested next step${sg.length > 1 ? "s" : ""}</button>` : ""}
          ${/^(ofb|behind|omb|pf|rule)$/.test(kindOf(it)) ? `<a class="btn small" href="#/rates_set">📈 Open Set rates</a>` : ""}</div>
        ${isOfb ? `<div class="mbox"><b>Owner follow-up</b><textarea id="mofbr" placeholder="What did the owner say? (closes this follow-up on the Rates desk)"></textarea>
          <div class="macts"><button class="btn small primary" id="mofbs">Save the owner's answer</button><span class="muted" style="font-size:13px">or follow up again on</span><input type="date" id="mofbd" value="${esc(addDays(T, 7))}" style="width:auto"><button class="btn small" id="mofbm">Move follow-up</button></div></div>` : ""}
        ${bwBox(it)}
        ${msgBox(it)}
        <div class="mbox"><b>Add a note</b>${feedHtml(notesOf(day, it.key))}<textarea data-note="${esc(it.key)}" placeholder="What was decided, who is doing it, by when">${esc(dv != null ? dv : "")}</textarea>
          <div class="macts"><select data-nstate="${esc(it.key)}" aria-label="Where it stands" style="width:auto">${[["covered","Covered"],["waiting","Waiting on owner"],["scheduled","Scheduled"]].map(([v2, l]) => `<option value="${v2}"${(st || "covered") === v2 ? " selected" : ""}>${l}</option>`).join("")}</select>
          <button class="btn small primary" data-nsave="${esc(it.key)}">Add note</button></div></div>`;
    } else if(MX.tab === "nx"){
      const ovd = tko.filter(t => t.due && t.due < T);
      b = `${ovd.length ? `<div class="msig red"><i>!</i><div><small>Next action</small>${ovd.length} overdue task${ovd.length > 1 ? "s" : ""}</div></div>` : ""}
        ${sg.length ? `<div class="mbox"><b>✦ Suggested next steps</b>${sg.map((s, i) => `<div class="msug"><span>${esc(s.text)}</span><button class="btn small" data-sug="${i}">+ Use</button></div>`).join("")}</div>` : ""}
        <div class="mbox"><b>Add a task</b>${taskForm(it.key, it.title, MX.sug[it.key])}</div>
        <div class="mfts">${[["all","All",tk.length],["today","Today",tk.filter(t => !t.done_at && t.due === T).length],["week","This week",tk.filter(t => !t.done_at && t.due && t.due >= T && t.due <= wk).length],["over","Overdue",ovd.length],["done","Done",tk.filter(t => t.done_at).length]].map(([k2, l, n]) => `<button class="mft${MX.tf === k2 ? " on" : ""}" data-tf2="${k2}">${l} <span>${n}</span></button>`).join("")}</div>
        <div class="mtl">${tk.filter(tfl).map(taskRow).join("") || `<p class="muted">No tasks here.</p>`}</div>`;
    } else {
      b = `<div class="mtiles two">${`<div class="mtile"><div><b>${act.length}</b><span>Total activity</span></div></div><div class="mtile g"><div><b>${notesOf(null, it.key).length}</b><span>Notes</span></div></div>`}</div>
        <div class="mact">${act.map(a => `<div class="maci"><i>${a.ic}</i><div><div>${a.h}<span class="muted"> · ${esc(tm(a.at))}</span></div><div class="mab">${a.b}</div></div></div>`).join("") || `<p class="muted">Nothing yet.</p>`}</div>`;
    }
    const o = document.createElement("div"); o.id = "mpov"; o.className = "mpov";
    o.innerHTML = `<div class="mpanel" role="dialog" aria-label="${esc(it.title)}"><div class="mph"><div>${pill(st)}<h3>${esc(it.title)}</h3>${ownerOf(it) ? `<div class="mown">👤 ${esc(ownerOf(it))}</div>` : ""}<span class="muted">${esc(it.grp)}</span></div><button class="btn small" data-pclose aria-label="Close">✕</button></div>
      <div class="mptabs">${tabs.map(([k2, l, n]) => `<button class="${MX.tab === k2 ? "on" : ""}" data-ptab="${k2}">${l}${n !== "" ? ` <span>${n}</span>` : ""}</button>`).join("")}</div><div class="mpb">${b}</div></div>`;
    document.body.appendChild(o);
    o.onclick = e => { if(e.target === o) close(); };
    o.querySelector("[data-pclose]").onclick = close;
    o.querySelectorAll("[data-ptab]").forEach(x => x.onclick = () => { MX.tab = x.dataset.ptab; panel(); });
    o.querySelectorAll("[data-tf2]").forEach(x => x.onclick = () => { MX.tf = x.dataset.tf2; panel(); });
    o.querySelectorAll("[data-sug]").forEach(x => x.onclick = () => { const s = sg[+x.dataset.sug]; MX.sug[it.key] = { text:s.text, due:addDays(T, s.days) }; panel();
      const i = o.querySelector('[data-tf="who"]'); if(i) i.focus(); });
    wire(o); msgWire(o, it); bwWire(o, it);
    const pn = o.querySelector("#mpsun"), ps = o.querySelector("#mpsus");
    if(pn){ pn.oninput = () => ST.drafts[key + "|" + it.key] = pn.value;
      ps.onclick = async () => { if(!pn.value.trim()) return pn.focus(); ps.disabled = true; o.querySelector("#mpsum").textContent = "Saving…";
        const r = await sb.rpc("meeting_psu_note", { p_meet:key, p_day:day, p_job:String(it.key).split(":")[1], p_text:pn.value.trim() }); ps.disabled = false;
        if(r.error) return o.querySelector("#mpsum").textContent = "Couldn't save: " + (window.niceErr ? niceErr(r.error) : r.error.message);
        delete ST.drafts[key + "|" + it.key]; redraw(); }; }
    const sv = (res, fu, btn) => async () => { const r0 = res ? o.querySelector("#mofbr").value.trim() : ""; if(res && !r0) return o.querySelector("#mofbr").focus();
      btn.disabled = true; const r = await sb.rpc("meeting_ofb_set", { p_meet:key, p_day:day, p_id:fid, p_result:r0 || null, p_followup:fu ? o.querySelector("#mofbd").value || null : null }); btn.disabled = false;
      if(r.error) return alert("Couldn't save: " + (window.niceErr ? niceErr(r.error) : r.error.message)); redraw(); };
    if(isOfb){ const s1 = o.querySelector("#mofbs"), s2 = o.querySelector("#mofbm"); s1.onclick = sv(true, false, s1); s2.onclick = sv(false, true, s2); }
  }
  /* message / alert a person or the topic's team: Slack from the hub bot ("From <you> (from the <meeting> meeting on the Moose Hub)"),
     sent only when the person taps Send; "Give them a task" = a meeting task per person (Home + bell + DM when that's on) */
  function msgBox(it){
    const tm2 = TEAMFOR[kindOf(it)], ppl2 = MX.tp[key] || [], mem = tm2 ? ppl2.filter(p => (p.teams || []).includes(tm2[0])) : [];
    const draft = [it.title, ...(it.lines || []).filter(Boolean).slice(0, 15).map(l => "• " + l), it.ask ? "\n" + it.ask : "", it.link ? "\n" + absLink(it.link) : ""].filter(Boolean).join("\n");
    return `<div class="mbox" id="mmsg"><b>💬 Message or alert${mem.length ? " " + esc(tm2[1]) : " someone"}</b>
      <div class="macts" style="margin-top:0"><select id="mmto" style="width:auto;max-width:100%">${mem.length ? `<option value="team">${esc(tm2[1][0].toUpperCase() + tm2[1].slice(1))} (${esc(mem.map(p => p.name.split(" ")[0]).join(", "))})</option>` : `<option value="">Pick a person…</option>`}
        <optgroup label="People">${ppl2.map(p => `<option value="p:${esc(p.id)}">${esc(p.name)}</option>`).join("")}</optgroup></select></div>
      <textarea id="mmtx" style="min-height:120px">${esc(draft)}</textarea>
      <div class="macts"><button class="btn small primary" id="mmsend">Send on Slack</button><button class="btn small" id="mmtask">🔔 Give them a task</button><input type="date" id="mmdue" value="${esc(addDays(T, 3))}" style="width:auto" aria-label="Task due"><span class="muted" id="mmm" style="font-size:13px"></span></div>
      <p class="muted" style="font-size:12px;margin:4px 0 0">Slack comes from the Moose Hub bot with your name at the top. Nothing goes until you tap Send.</p></div>`;
  }
  function msgWire(o, it){
    const box = o.querySelector("#mmsg"); if(!box) return;
    const tm2 = TEAMFOR[kindOf(it)], ppl2 = MX.tp[key] || [], msg = box.querySelector("#mmm");
    const targets = () => { const v2 = box.querySelector("#mmto").value; if(v2 === "team") return ppl2.filter(p => (p.teams || []).includes(tm2[0]));
      const p = ppl2.find(x => "p:" + x.id === v2); return p ? [p] : []; };
    box.querySelector("#mmsend").onclick = async e => { const to = targets(), text = box.querySelector("#mmtx").value.trim();
      if(!to.length) return msg.textContent = "Pick who gets it."; if(text.length < 5) return msg.textContent = "Type a message.";
      e.target.disabled = true; msg.textContent = "Sending…"; const bad = [];
      for(const p of to){ const x = await sb.functions.invoke("penny", { body:{ act:{ kind:"slack_post", data:{ to:p.name, text, via:"meeting", meet:m.name } } } });
        if(!(x.data && x.data.ok)) bad.push(p.name.split(" ")[0] + ": " + ((x.data && x.data.error) || (x.error && (window.niceErr ? niceErr(x.error) : x.error.message)) || "error")); }
      e.target.disabled = false;
      await sb.rpc("meeting_note", { p_meet:key, p_day:day, p_item:it.key, p_text:"Sent on Slack to " + to.filter(p => !bad.some(b => b.startsWith(p.name.split(" ")[0] + ":"))).map(p => p.name).join(", ") + ": " + short(text, 300), p_state:stItem(it) || "covered" });
      msg.textContent = bad.length ? "Couldn't send to " + bad.join("; ") : "✓ Sent"; if(!bad.length) setTimeout(redraw, 700); };
    box.querySelector("#mmtask").onclick = async e => { const to = targets(), text = box.querySelector("#mmtx").value.trim().split("\n")[0];
      if(!to.length) return msg.textContent = "Pick who gets it.";
      const t = prompt("Task for " + to.map(p => p.name.split(" ")[0]).join(", ") + ":", it.ask ? it.ask.replace(/\?$/, "") + " (" + short(it.title, 60) + ")" : text); if(!t) return;
      e.target.disabled = true; let err = "";
      for(const p of to){ const r = await sb.rpc("meeting_task_add2", { p_meet:key, p_day:day, p_item:it.key, p_item_title:it.title, p_text:t, p_who:p.id, p_due:box.querySelector("#mmdue").value || null }); if(r.error) err = r.error.message; }
      e.target.disabled = false; if(err) return msg.textContent = "Couldn't add: " + err; redraw(); };
  }
  /* 🛠 Schedule in Breezeway (Brandon 2026-11-10): pick homes, name, notes, date, person; later change date / person / add a note */
  function bwBox(it){
    const mine = (MX.bw[key] || []).filter(j => j.item === it.key && j.kind === "job"), chg = (MX.bw[key] || []).filter(j => j.item === it.key && j.kind === "schedule");
    const ppl3 = MX.bwp[key] || [], opt = sel => ppl3.map(p => `<option${sel === p.name ? " selected" : ""}>${esc(p.name)}</option>`).join("");
    const lines = (it.lines || []).filter(Boolean).filter(l => !/^Next: /.test(l));
    const st = j => j.status === "queued" || j.status === "sending" ? `<span class="mpill wait">Sending to Breezeway…</span>` : j.status === "failed" ? `<span class="mpill bad">Didn't go: ${esc(j.error || "")}</span>` : `<span class="mpill ok">In Breezeway</span>${j.error ? ` <span class="muted" style="font-size:12px">${esc(j.error)}</span>` : ""}`;
    const homeRow = (j, h) => { const c = MX.chg === j.id + "|" + h.home, last = chg.filter(x => x.parent === j.id && (x.homes || []).some(y => y.home === h.home))[0];
      return `<div class="mbwh"><div><b>${esc(h.home)}</b> ${h.task ? `<a href="${BW_URL(h.task)}" target="_blank" rel="noopener" class="muted">#${h.task} ↗</a>` : ""}
        <small>${[h.finished ? "✅ Done" : h.state ? esc(h.state) : "", h.date ? "📅 " + esc(fmt(String(h.date).slice(0, 10))) : j.due ? "📅 " + esc(fmt(j.due)) : "", (h.people && h.people.length) ? "👤 " + esc(h.people.join(", ")) : j.who ? "👤 " + esc(j.who) : ""].filter(Boolean).join(" · ")}
        ${last ? `<br>Last change: ${last.status === "created" ? "sent" : last.status === "failed" ? "didn't go (" + esc(last.error || "") + ")" : "sending…"}${last.note ? " · " + esc(short(last.note, 60)) : ""}` : ""}</small></div>
        ${h.task && !h.finished ? (c ? "" : `<button class="btn small" data-bwchg="${esc(j.id + "|" + h.home)}">Change</button>`) : ""}</div>
        ${c ? `<div class="mbwc" data-bwform="${esc(j.id)}" data-home="${esc(h.home)}"><input type="date" data-bf="due" value="${esc(String(h.date || j.due || "").slice(0, 10))}">
          <select data-bf="who"><option value="">Keep who has it</option>${opt("")}</select>
          <textarea data-bf="note" placeholder="Note for the tech (goes on the task as a comment)"></textarea>
          <div class="macts"><button class="btn small primary" data-bwsave>Save to Breezeway</button><button class="btn small" data-bwx>Cancel</button></div></div>` : ""}`; };
    return `<div class="mbox" id="mbw"><b>🛠 Breezeway</b>
      ${mine.map(j => `<div class="mbwj"><div class="mt2">${st(j)} <b>${esc(j.title)}</b><span class="muted" style="font-size:12px"> · by ${esc(j.by || "")}</span></div>${(j.homes || []).map(h => homeRow(j, h)).join("")}</div>`).join("")}
      ${MX.bwopen ? `<div class="mbwf"><label>Homes<input id="bwh" value="${esc(homeOf(it))}" placeholder="Home codes, e.g. UM 3013, ML 9"></label>
          <label>Task name<input id="bwt" value="${esc(short(String(it.title || "").split(" · ").slice(1).join(" · ") || it.title, 120))}"></label>
          <label>Notes for the tech<textarea id="bwn">${esc(lines.join("\n"))}</textarea></label>
          <div class="macts" style="margin-top:0"><label>Date<input type="date" id="bwd" value="${esc(addDays(T, 1))}"></label>
          <label>Who<select id="bww">${opt("Chris Robinson")}</select></label>
          <label>Type<select id="bwk"><option value="maintenance">Maintenance</option><option value="inspection">Inspection</option></select></label></div>
          <p class="muted" style="font-size:12px;margin:2px 0">General maintenance template, normal priority. Inspections are moved off nights a guest is staying.</p>
          <div class="macts"><button class="btn small primary" id="bwgo">Send to Breezeway</button><button class="btn small" id="bwx">Cancel</button><span class="muted" id="bwm" style="font-size:13px"></span></div></div>`
        : `<div class="macts" style="margin-top:${mine.length ? 8 : 0}px"><button class="btn small" id="bwopen">🛠 ${mine.length ? "Another Breezeway task" : "Schedule in Breezeway"}</button></div>`}</div>`;
  }
  function bwWire(o, it){
    const box = o.querySelector("#mbw"); if(!box) return;
    const again = async () => { await bwLoad(key); panel(); };
    const op = box.querySelector("#bwopen"); if(op) op.onclick = () => { MX.bwopen = true; panel(); };
    const x = box.querySelector("#bwx"); if(x) x.onclick = () => { MX.bwopen = false; panel(); };
    const go = box.querySelector("#bwgo"); if(go) go.onclick = async () => { const m2 = box.querySelector("#bwm");
      const homes = box.querySelector("#bwh").value.split(/[,;\n]+/).map(v => v.trim()).filter(Boolean);
      if(!homes.length) return m2.textContent = "Add at least one home.";
      go.disabled = true; m2.textContent = "Sending…";
      const r = await sb.rpc("meeting_bw_send", { p_meet:key, p_day:day, p_item:it.key, p_item_title:it.title, p_homes:homes, p_title:box.querySelector("#bwt").value,
        p_note:box.querySelector("#bwn").value, p_due:box.querySelector("#bwd").value || null, p_who:box.querySelector("#bww").value || null, p_dept:box.querySelector("#bwk").value, p_template:"627" });
      go.disabled = false; if(r.error) return m2.textContent = (window.niceErr ? niceErr(r.error) : r.error.message);
      MX.bwopen = false; await bwLoad(key); redraw(); bwPoll(); };
    box.querySelectorAll("[data-bwchg]").forEach(b => b.onclick = () => { MX.chg = b.dataset.bwchg; panel(); });
    box.querySelectorAll("[data-bwx]").forEach(b => b.onclick = () => { MX.chg = null; panel(); });
    box.querySelectorAll("[data-bwsave]").forEach(b => b.onclick = async () => { const f = b.closest("[data-bwform]"), g = n => f.querySelector(`[data-bf="${n}"]`).value;
      const j = (MX.bw[key] || []).find(z => z.id === f.dataset.bwform), h = j && (j.homes || []).find(z => z.home === f.dataset.home);
      const was = String((h && h.date) || (j && j.due) || "").slice(0, 10), due = g("due") && g("due") !== was ? g("due") : null;
      b.disabled = true; const r = await sb.rpc("meeting_bw_change", { p_meet:key, p_day:day, p_job:f.dataset.bwform, p_home:f.dataset.home, p_due:due, p_who:g("who") || null, p_note:g("note") });
      b.disabled = false; if(r.error) return alert("Couldn't save: " + (window.niceErr ? niceErr(r.error) : r.error.message));
      MX.chg = null; await bwLoad(key); redraw(); bwPoll(); });
  }
  // the hub sends queued Breezeway work within about a minute: check back a few times so the panel shows "In Breezeway"
  function bwPoll(){ let n = 0; const t = setInterval(async () => { n++; await bwLoad(key);
    if(MX.open && document.getElementById("mpov")) panel(); if(n > 8 || !(MX.bw[key] || []).some(j => j.status === "queued" || j.status === "sending")) clearInterval(t); }, 20000); }
  function close(){ MX.open = null; document.getElementById("mpov")?.remove(); }
  if(!window._mxEsc){ window._mxEsc = 1; document.addEventListener("keydown", e => { if(e.key === "Escape" && document.getElementById("mpov")){ MX.open = null; document.getElementById("mpov").remove(); } }); }
  const redraw = async () => { const sy = window.scrollY; const d = await load(v, key); if(d){ render(v, key, d, ppl); window.scrollTo(0, sy); } };
  /* buttons shared by the page and the panel */
  function wire(root){
    root.querySelectorAll("textarea[data-note]").forEach(t => t.oninput = () => ST.drafts[key + "|" + t.dataset.note] = t.value);
    root.querySelectorAll("[data-tform] input[data-tf=text]").forEach(i => i.oninput = () => { const k = i.closest(".mtask").dataset.tform; if(k) MX.sug[k] = Object.assign(MX.sug[k] || {}, { text:i.value }); });
    root.querySelectorAll("[data-nsave]").forEach(b => b.onclick = async () => {
      const k = b.dataset.nsave, t = root.querySelector(`textarea[data-note="${CSS.escape(k)}"]`), s = root.querySelector(`select[data-nstate="${CSS.escape(k)}"]`);
      if(!t.value.trim()) return t.focus();
      b.disabled = true; const r = await sb.rpc("meeting_note", { p_meet:key, p_day:day, p_item:k, p_text:t.value.trim(), p_state:s ? s.value : "covered" }); b.disabled = false;
      if(r.error) return alert("Couldn't save: " + r.error.message);
      delete ST.drafts[key + "|" + k]; redraw(); });
    root.querySelectorAll("[data-tadd]").forEach(b => b.onclick = async () => {
      const f = b.closest(".mtask"), g = n => f.querySelector(`[data-tf="${n}"]`).value.trim();
      if(g("text").length < 2) return f.querySelector('[data-tf="text"]').focus();
      b.disabled = true; const r = await sb.rpc("meeting_task_add2", { p_meet:key, p_day:day, p_item:b.dataset.tadd, p_item_title:f.dataset.ttitle || null, p_text:g("text"), p_who:g("who") || null, p_due:g("due") || null }); b.disabled = false;
      if(r.error) return alert("Couldn't add: " + (window.niceErr ? niceErr(r.error) : r.error.message));
      delete MX.sug[b.dataset.tadd]; redraw(); });
    root.querySelectorAll("[data-tdone]").forEach(c => c.onchange = async () => {
      const r = await sb.rpc("meeting_task_set", { p_id:+c.dataset.tdone, p_done:c.checked, p_off:false });
      if(r.error){ alert("Couldn't save: " + r.error.message); c.checked = !c.checked; return; }
      redraw(); });
  }
  wire(v);
  if(MX.open) panel();
  v.querySelectorAll("[data-open]").forEach(c => { const go = e => { if(e.target.closest("[data-quick]")) return; e.stopPropagation(); MX.open = c.dataset.open; MX.tab = "ov"; MX.tf = "all"; MX.bwopen = false; MX.chg = null; panel(); };
    c.onclick = go; c.onkeydown = e => { if(e.key === "Enter") go(e); }; });
  v.querySelectorAll("[data-quick]").forEach(b => b.onclick = async e => { e.stopPropagation(); b.disabled = true;
    const r = await sb.rpc("meeting_note", { p_meet:key, p_day:day, p_item:b.dataset.quick, p_text:"Covered in the meeting.", p_state:"covered" });
    if(r.error){ b.disabled = false; return alert("Couldn't save: " + r.error.message); } redraw(); });
  v.querySelectorAll("[data-filt]").forEach(b => b.onclick = () => { MX.filt = b.dataset.filt; render(v, key, data, ppl); });
  const mq = $("#mq"); mq.oninput = () => { MX.q = mq.value; const p = mq.selectionStart; render(v, key, data, ppl); const n = $("#mq"); n.focus(); n.setSelectionRange(p, p); };
  $("#mday").onchange = e => { if(e.target.value){ ST.day[key] = e.target.value; ST.drafts = {}; render(v, key, data, ppl); } };
  $("#mref").onclick = redraw;
  if($("#mlink")) $("#mlink").onclick = async () => {   // admins paste the Zoom / Meet link themselves (it can carry a passcode)
    const u = prompt("Paste the meeting's join link (https://…). Only people who can open this meeting will see it.", ""); if(!u) return;
    const r = await sb.rpc("meeting_link_set", { p_meet:key, p_url:u.trim(), p_label:/meet\.google/.test(u) ? "Google Meet" : /zoom\.us/.test(u) ? "Zoom" : "" });
    if(r.error) return alert("Couldn't save: " + r.error.message); redraw(); };
  $("#mprint").onclick = () => window.print();
  $("#mup").onclick = () => upOpen(v, key, day, items, () => render(v, key, data, ppl));
  $("#mwrap").onclick = () => {   // what was decided + who does what, ready to copy
    const L = [`${m.name} meeting · ${fmt(day)}`, ""];
    const dec = items.map(it => ({ it, n: notesOf(day, it.key) })).filter(x => x.n.length);
    if(dec.length){ L.push("DECIDED"); dec.forEach(x => { L.push(`• ${x.it.title}${stItem(x.it) !== "covered" ? " (" + stItem(x.it) + ")" : ""}`); x.n.forEach(n => L.push(`   - ${n.by || "Someone"}: ${n.text}`)); }); L.push(""); }
    const other = notesOf(day, "_notes"); if(other.length){ L.push("ANYTHING ELSE"); other.forEach(n => L.push(`• ${n.by || "Someone"}: ${n.text}`)); L.push(""); }
    if(open.length){ L.push("WHO DOES WHAT"); open.forEach(t => L.push(`• ${t.who || "No one yet"}: ${t.text}${t.due ? " (due " + fmt(t.due) + ")" : ""}`)); L.push(""); }
    const left = items.filter(it => !stItem(it)); if(left.length){ L.push(`NOT COVERED YET (${left.length})`); left.forEach(it => L.push(`• ${it.title}`)); }
    const txt = L.join("\n");
    document.getElementById("mpov")?.remove();
    const o = document.createElement("div"); o.id = "mpov"; o.className = "mpov";
    o.innerHTML = `<div class="mpanel"><div class="mph"><div><h3>Wrap up</h3><span class="muted">${covered} of ${items.length} covered · ${open.length} open tasks${items.length - covered - waiting ? ` · ${items.length - covered - waiting} not covered yet` : ""}</span></div><button class="btn small" data-pclose>✕</button></div>
      <div class="mpb"><textarea id="mwt" style="width:100%;min-height:55vh;font-size:13px">${esc(txt)}</textarea><div class="macts"><button class="btn small primary" id="mwc">📋 Copy</button><span class="muted" style="font-size:13px">Paste it into Slack or an email yourself.</span></div></div></div>`;
    document.body.appendChild(o); o.onclick = e => { if(e.target === o) o.remove(); }; o.querySelector("[data-pclose]").onclick = () => o.remove();
    o.querySelector("#mwc").onclick = async () => { try { await navigator.clipboard.writeText(o.querySelector("#mwt").value); o.querySelector("#mwc").textContent = "Copied ✓"; } catch(e){ o.querySelector("#mwt").select(); } };
  };
  v.querySelectorAll("[data-mday]").forEach(a => a.onclick = e => { e.preventDefault(); ST.day[key] = a.dataset.mday; ST.drafts = {}; render(v, key, data, ppl); window.scrollTo(0, 0); });
  if(!MX.tp[key]) taskPeople(key).then(() => render(v, key, data, ppl));
  if(items.some(isPsu) && Date.now() - MX.psuAt > 120000) psuLoad().then(() => { if(MX.open && document.getElementById("mpov")) panel(); });
  if(!MX.bw[key]) bwLoad(key).then(() => { if(MX.open && document.getElementById("mpov")) panel(); });
}
/* Home + bell (2026-11-10): tasks people were given in a meeting (my_meeting_tasks, hub_meeting_actions.sql). Tick done right here.
   Meeting name + topic only show when the person can open that meeting (rule 3). */
window.meetTasksHome = async function(el){
  if(!el) return; css();
  const r = await sb.rpc("my_meeting_tasks"); const a = r.data || []; if(r.error || !a.length){ el.innerHTML = ""; return; }
  const T = ymd(new Date());
  el.innerHTML = `<div class="card mtg"><b style="font-size:17px">📋 Your tasks from meetings <span class="muted" style="font-weight:400">${a.length}</span></b>
    ${a.map(t => `<div class="tk"><input type="checkbox" data-mhd="${t.id}" aria-label="Done"><div style="flex:1"><span class="tx">${esc(t.text)}</span>
      <small>${[t.due ? (t.due < T ? `<span class="mred">Overdue · ${esc(fmt(t.due))}</span>` : t.due === T ? `<span class="mamb">Due today</span>` : "Due " + esc(fmt(t.due))) : "",
        t.meet ? `<a href="#/${esc(t.meet)}">${esc(t.meet_name)} meeting</a>` : "From " + esc(t.meet_name), t.topic ? esc(t.topic) : "", t.by ? "from " + esc(t.by) : ""].filter(Boolean).join(" · ")}</small></div></div>`).join("")}</div>`;
  el.querySelectorAll("[data-mhd]").forEach(c => c.onchange = async () => { c.disabled = true;
    const w = await sb.rpc("meeting_task_set", { p_id:+c.dataset.mhd, p_done:true, p_off:false });
    if(w.error){ c.disabled = false; c.checked = false; return alert("Couldn't save: " + w.error.message); }
    c.closest(".tk").classList.add("done"); setTimeout(() => window.meetTasksHome(el), 900); });
};
window.meetTasksBell = async function(){
  const r = await sb.rpc("my_meeting_tasks"); const a = r.data || []; if(r.error || !a.length) return [];
  const T = ymd(new Date()), od = a.filter(t => t.due && t.due < T).length;
  return [{ ic:"📋", t:`${a.length} task${a.length === 1 ? "" : "s"} from meetings${od ? ` (${od} overdue)` : ""}`, s:a.slice(0, 2).map(t => t.text).join(" · "), href:"#/home" }];
};
})();
