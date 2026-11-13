/* calls.js (Brandon 2026-10-29): Guest ▸ Call review — Track Pulse calls with their transcripts.
   Loaded by hub.html; uses its sb / $ / esc / ME. Data (hub_calls.sql, RLS hub_can('call_review')):
   - track_calls: call details from Pulse ▸ Recent Calls ▸ Export, uploaded here (calls_upload RPC). Our Track API key can't read them.
   - track_call_transcripts: filled by track_calls_sync.py on the office computer every 10 minutes (Track API, read only).
   - callsView(v): #/call_review — upload button + steps (call_can_upload), numbers, by agent, call list, transcript pop-up.
   - callsBanner: admins + office managers get a banner on every hub page until yesterday's calls are uploaded and complete
     (calls_upload_due(): an upload made today that covers yesterday, with no Pulse call ids missing). Others never see it.
   - ownerCallsView(v): #/owner_calls — Owners ▸ Communication (2026-11-01): calls with owners / possible owners (track_calls.owner_kind,
     hub_owner_calls.sql) with Penny's notes + reach-out marks. For people who can open it, those calls leave Call review + Follow-ups.
   - guestCallsView(v): #/guest_desk — Guest ▸ Communication (2026-11-02): calls with guests / people looking to book (track_calls.guest_kind,
     hub_guest_calls.sql), same cards + reach-out marks. Guest calls also stay in Call review (that page is for reviewing calls by agent).
     Follow-ups was folded in 2026-11-03 (team filter + Called, never booked tab).
   - staffCallsView(v): #/staff_calls — Reports ▸ Team ▸ Staff calls (2026-11-03): calls with our own people (track_calls.staff_name).
   - showCall opens with Penny's quick summary above the transcript (2026-11-03).
   Who sees which calls is decided by RLS: admins + office managers all, owner relations owner calls, everyone else their own;
   owner calls also for everyone with the Owner communication desk (owner relations + the 4 manager teams). */
(function(){
const TRACK = "https://moosemanagement.trackhs.com";
const NEED = ["Call Id", "Created Date", "Created Time", "Direction", "Duration", "Agents", "Call Result", "Routing Result"];   // same list as calls_upload()
const yday = () => iso(new Date(Date.now() - 864e5));
const dur = s => s == null ? "" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
const ms = n => n == null ? "" : dur(Math.floor(n / 1000));
const dayf = s => s ? new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }) : "";
const timef = s => s && s.length > 11 ? new Date(s).toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" }) : "";
const iso = d => d.toLocaleDateString("en-CA");
const dirName = d => /^in/i.test(d || "") ? "Inbound" : /^out/i.test(d || "") ? "Outbound" : (d || "");
const answered = c => /answered/i.test(c.routing_result || "");
let S = { from: iso(new Date(Date.now() - 13 * 864e5)), to: iso(new Date()), agent: "", dir: "", result: "", queue: "", tr: "", party: "", q: "" };
// who called (track_call_match.party, track_calls_match.py: Track contacts + stays + hub vendors by phone number)
const PARTY = { guest:"Guest (has stayed or booked)", lead:"Lead (in Track, never stayed)", prospect:"Possible guest (not in Track)", owner:"Owner", vendor:"Vendor", other:"Other / unknown" };
const digits = s => String(s || "").replace(/\D/g, "");
const ownDesk = () => typeof DESKS !== "undefined" && DESKS.some(d => d.key === "owner_calls" && d.status === "live");   // owner calls live on Owners ▸ Communication for these people
const phonef = s => { const d = digits(s).slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (s || ""); };
function css(){
  if(document.getElementById("callcss")) return;
  const s = document.createElement("style"); s.id = "callcss";
  s.textContent = `.calls .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:12px}
.calls .kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:12px} .calls .kpi b{display:block;font-size:22px}
.calls .flt{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:12px} .calls .flt label{font-size:12px;color:var(--muted);font-weight:700}
.calls .flt select,.calls .flt input{width:auto;min-height:40px;font-size:14px}
.calls table{width:100%;border-collapse:collapse;font-size:13.5px} .calls td,.calls th{padding:7px 6px;border-top:1px solid var(--line);text-align:left;vertical-align:top}
.calls th{font-weight:600;color:var(--muted);white-space:nowrap} .calls tr.on td{background:color-mix(in srgb,var(--forest-2) 12%,transparent);font-weight:600} .calls tr.cl{cursor:pointer} .calls tr.cl:hover td{background:color-mix(in srgb,var(--line) 40%,transparent)}
.calls .drop{border:2px dashed var(--line-2);border-radius:14px;padding:22px;text-align:center;margin:10px 0;cursor:pointer}
.calls .drop.on{border-color:var(--forest-2);background:color-mix(in srgb,var(--forest-2) 8%,transparent)}
.calls ol{padding-left:20px;margin:8px 0} .calls ol li{margin:6px 0}
.cbanner{background:#7a4b00;color:#fff;padding:8px 18px;font-weight:600;font-size:14px;flex:none} .cbanner a{color:#fff;text-decoration:underline;margin-left:8px;white-space:nowrap}
.trl{display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line);font-size:14px} .trl .who{flex:none;width:86px;font-weight:700;font-size:12.5px}
.trl .who small{display:block;font-weight:400;color:var(--muted)} .trl.agent .who{color:var(--forest-2)} .trl.customer .who{color:var(--blue)}
.cvsum{background:color-mix(in srgb,var(--forest-2) 9%,var(--card));border:1px solid color-mix(in srgb,var(--forest-2) 30%,var(--line));border-radius:12px;padding:12px 14px;margin:8px 0 12px;font-size:14.5px}
@media (max-width:640px){.calls .hide-s{display:none}.trl .who{width:64px}}`;
  document.head.appendChild(s);
}
async function all(q){   // PostgREST returns 1,000 rows at a time
  let out = [], from = 0;
  for(;;){ const r = await q().range(from, from + 999); if(r.error) throw r.error; out = out.concat(r.data || []); if(!r.data || r.data.length < 1000) return out; from += 1000; }
}
function parseCsv(text){
  const first = text.split(/\r?\n/)[0] || "", dl = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], f = "", q = false;
  for(let i = 0; i < text.length; i++){ const c = text[i];
    if(q){ if(c === '"'){ if(text[i + 1] === '"'){ f += '"'; i++; } else q = false; } else f += c; }
    else if(c === '"') q = true; else if(c === dl){ row.push(f); f = ""; } else if(c === "\n"){ row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; }
    else f += c; }
  if(f || row.length){ row.push(f.replace(/\r$/, "")); rows.push(row); }
  const h = (rows.shift() || []).map(x => x.trim());
  return { header: h, rows: rows.filter(r => r.some(x => x !== "")).map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] || "").trim()]))) };
}
function uploadBox(last, done){
  const since = last && last.last_day ? (last.last_day < yday() ? last.last_day : yday()) : iso(new Date(Date.now() - 30 * 864e5));
  const sinceUs = new Date(since + "T12:00:00").toLocaleDateString("en-US", { month:"2-digit", day:"2-digit", year:"numeric" });
  document.querySelectorAll("#callup").forEach(e => e.remove());
  document.body.insertAdjacentHTML("beforeend", `<div class="modal on calls" id="callup"><div class="card" style="width:min(620px,100%);max-height:90vh;overflow:auto">
    <div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:20px;flex:1;margin:0">Upload calls from Track</h2><button class="btn small" id="cux" aria-label="Close" title="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>
    <ol>
      <li>Open <a href="${TRACK}/pulse/call-export/" target="_blank" rel="noopener"><b>Track ▸ Pulse ▸ Recent Calls ▸ Export</b></a> (opens in a new tab).</li>
      <li>Under <b>Filter Criteria</b>: Value <b>Created</b>, Operand <b>Greater Than Equal</b>, Condition <b>${esc(sinceUs)}</b>${last && last.last_day ? " (covers yesterday and anything since the last upload)" : " (30 days back, for the first upload)"}. Use only this one filter, so no calls are left out.</li>
      <li>Leave <b>Advanced Export Options</b> as they are (Comma, <code>"</code>, Linux, Output Header Yes).</li>
      <li>Click <b>Export Calls</b>. Track downloads a .csv file. Drop it below.</li>
    </ol>
    <div class="drop" id="cudrop">📄 Drop the Track export here, or <u>pick the file</u><input type="file" id="cufile" accept=".csv,text/csv" hidden></div>
    <p class="muted" id="cumsg">Uploading the same calls twice is fine: each call is kept once, by its Track Call Id. Transcripts are pulled from Track within about 10 minutes.</p>
  </div></div>`);
  const close = () => $("#callup").remove(), drop = $("#cudrop"), fi = $("#cufile"), msg = $("#cumsg");
  $("#cux").onclick = close;
  drop.onclick = () => fi.click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("on"); };
  drop.ondragleave = () => drop.classList.remove("on");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("on"); if(e.dataTransfer.files[0]) go(e.dataTransfer.files[0]); };
  fi.onchange = () => fi.files[0] && go(fi.files[0]);
  async function go(file){
    msg.textContent = "Reading " + file.name + "…";
    const p = parseCsv(await file.text());
    const miss = NEED.filter(k => !p.header.includes(k));
    if(miss.length) return msg.textContent = "That doesn't look like the Pulse calls export (missing " + miss.join(", ") + "). Use Export Calls on the Pulse Export page with Output Header = Yes.";
    if(!p.rows.length) return msg.textContent = "The file has no calls in it. Check the date in step 2.";
    let n = 0, nw = 0, d1 = null, d2 = null;
    for(let i = 0; i < p.rows.length; i += 2000){
      msg.textContent = `Saving ${Math.min(i + 2000, p.rows.length)} of ${p.rows.length} calls…`;
      const r = await sb.rpc("calls_upload", { p_rows: p.rows.slice(i, i + 2000), p_file: file.name });
      if(r.error) return msg.textContent = "Couldn't save: " + (window.niceErr ? niceErr(r.error) : r.error.message);
      n += r.data.rows; nw += r.data.new; d1 = d1 && d1 < r.data.first_day ? d1 : r.data.first_day; d2 = d2 && d2 > r.data.last_day ? d2 : r.data.last_day;
    }
    msg.innerHTML = `✅ Saved <b>${n}</b> calls (${nw} new, ${n - nw} already here), ${esc(dayf(d1))} – ${esc(dayf(d2))}. Transcripts show up within about 10 minutes.`;
    done(); callsBanner(true);
  }
}
async function showCall(c, tr){
  document.querySelectorAll("#callv").forEach(e => e.remove());
  document.body.insertAdjacentHTML("beforeend", `<div class="modal on calls" id="callv"><div class="card" style="width:min(760px,100%);max-height:90vh;overflow:auto">
    <div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:20px;flex:1;margin:0">${esc(dirName(c.direction))} call · ${esc(dayf(c.call_at))} ${esc(timef(c.call_at))}</h2>
      <a class="btn small" href="${TRACK}/pulse/calls/view/?id=${c.call_id}" target="_blank" rel="noopener" title="Opens the call in Track Pulse, where the recording plays (Track sign-in)">▶ Listen in Track</a><button class="btn small" id="cvx" aria-label="Close" title="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>
    <p class="muted" style="margin:8px 0">${[c.agents && "Agent: " + esc(c.agents), c.caller_name && "Caller: " + esc(c.caller_name), (c.caller_city || c.caller_state) && esc([c.caller_city, c.caller_state].filter(Boolean).join(", ")),
      c.call_result && "Result: " + esc(c.call_result), c.routing_result && esc(c.routing_result), c.queues && "Queue: " + esc(c.queues), "Talk " + dur(c.duration_s), c.hold_s ? "Hold " + dur(c.hold_s) : ""].filter(Boolean).join(" · ")}</p>
    <div id="cvs"></div><div id="cvt"><p class="muted">Loading the transcript…</p></div></div></div>`);
  $("#cvx").onclick = () => $("#callv").remove();
  $("#callv").onclick = e => { if(e.target.id === "callv") $("#callv").remove(); };
  // quick summary first (Brandon 2026-11-03: "when clicking into the call, we want a quick summary for anyone to read") = Penny's call note
  sb.from("track_call_notes").select("summary,caller_type,outcome,celebration,celebration_detail,not_booked_reason,follow_up,follow_up_what,follow_up_team,data").eq("call_id", c.call_id).maybeSingle().then(r => {
    const box = document.getElementById("cvs"); if(!box) return;
    const n = r.data;
    if(!n){ if(tr && tr.status === "ok") box.innerHTML = `<div class="cvsum"><b>Quick summary</b><p class="muted" style="margin:4px 0 0">Penny hasn't summarized this call yet (she reads new transcripts within about 10 minutes).</p></div>`; return; }
    const d = n.data || {}, t = d.trip || {};
    const trip = [t.arrive && (dayf(t.arrive) + (t.depart ? " – " + dayf(t.depart) : "")), t.adults != null && t.adults + " adults", t.kids ? t.kids + " kids" : "", t.pets ? t.pets + " pets" : "", (t.homes_or_areas || []).join(", ")].filter(Boolean).join(" · ");
    const line = (l, v) => v ? `<div style="margin-top:4px"><b>${l}:</b> ${esc(v)}</div>` : "";
    box.innerHTML = `<div class="cvsum"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b>Quick summary</b>
        ${CT[n.caller_type] ? `<span class="pill">${esc(CT[n.caller_type])}</span>` : n.caller_type ? `<span class="pill">${esc(nice(n.caller_type))}</span>` : ""}
        ${n.outcome ? `<span class="pill">${esc(nice(n.outcome))}</span>` : ""}
        ${n.celebration && n.celebration !== "none" ? `<span class="pill amber">🎉 ${esc(n.celebration_detail || nice(n.celebration))}</span>` : ""}</div>
      <p style="margin:6px 0 0">${esc(n.summary || "")}</p>
      ${line("Trip", trip)}${line("Wants", (d.wants || []).join(", "))}${line("Concerns", (d.concerns || []).join(", "))}${line("For the stay", (d.stay_notes || []).join(" · "))}${line("Didn't book", n.not_booked_reason)}
      ${n.follow_up && n.follow_up_what ? line("Next step" + (n.follow_up_team && TEAM[n.follow_up_team] ? " · " + TEAM[n.follow_up_team] : ""), n.follow_up_what) : ""}
      <div class="muted" style="font-size:12px;margin-top:6px">Penny's summary of the transcript below. Machine-made, so check names and numbers.</div></div>`;
  });
  if(!tr || tr.status !== "ok") return $("#cvt").innerHTML = `<p class="muted">${tr ? "Track has no transcript for this call (short calls, voicemail and calls that weren't recorded usually don't get one). The office computer checks again for 3 days after the call." : "Not checked yet. Transcripts are pulled within about 10 minutes of an upload."}</p>`;
  const r = await sb.from("track_call_transcripts").select("lines,engine,coverage,language,words").eq("call_id", c.call_id).maybeSingle();
  if(r.error || !r.data) return $("#cvt").innerHTML = `<p class="muted">Couldn't load: ${esc(r.error ? (window.niceErr ? niceErr(r.error) : r.error.message) : "not found")}</p>`;
  const t = r.data;
  $("#cvt").innerHTML = `<p class="muted" style="font-size:12.5px">Transcript by Track Pulse (${esc(t.engine || "speech to text")}, ${t.coverage != null ? t.coverage + "% of the call" : ""}, ${t.words} words). Machine-made, so names and numbers can be off. Codes and card numbers are hidden.</p>
    ${(t.lines || []).map(l => `<div class="trl ${esc(l.s || "")}"><div class="who">${esc(l.s === "agent" ? (c.agents || "Agent").split(",")[0] : l.s === "customer" ? "Caller" : l.s || "")}<small>${ms(l.a)}</small></div><div>${esc(l.t)}</div></div>`).join("")}`;
}
window.callsView = async function(v){
  css(); $("#ttl").textContent = $("#utl").textContent = "Call review";
  v.innerHTML = `<div class="page wide calls"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap" id="chead"><h2 style="flex:1;margin:0">Call review</h2></div>
    <p class="muted" id="culast">Track Pulse calls with their transcripts. Source: Pulse Recent Calls export (call details) + Track API (transcripts).</p>
    <div class="flt" id="cflt"></div><div id="cbody"><p class="muted">Loading…</p></div></div>`;
  const canUp = !!(await sb.rpc("call_can_upload")).data;   // admins + office managers (hub_calls.sql); others never see the button
  if(canUp){
    $("#chead").insertAdjacentHTML("beforeend", `<button class="btn primary" id="cub">⬆ Upload calls from Track</button>`);
    const ups = await sb.from("track_call_uploads").select("at,by_name,last_day,first_day,rows_in").not("rows_in", "is", null).order("at", { ascending:false }).limit(1);
    const last = (ups.data || [])[0];
    if(last) $("#culast").innerHTML = `Track Pulse calls with their transcripts. Last upload ${esc(new Date(last.at).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }))} by ${esc((last.by_name || "").split(" ")[0])}, calls through ${esc(dayf(last.last_day))}. Source: Pulse Recent Calls export (call details) + Track API (transcripts).`;
    $("#cub").onclick = () => uploadBox(last, () => callsView(v));
    if(/\/upload$/.test(location.hash)){ history.replaceState(null, "", "#/call_review"); uploadBox(last, () => callsView(v)); }
  }
  let calls, trs, mts, nts;
  try {
    calls = await all(() => sb.from("track_calls").select("call_id,call_at,call_day,direction,duration_s,hold_s,agents,queues,call_result,routing_result,caller_name,caller_city,caller_state,outside_number,first_queue,owner_kind")
      .gte("call_day", S.from).lte("call_day", S.to).order("call_at", { ascending:false }));
    const lo = calls.length ? Math.min(...calls.map(c => c.call_id)) : 0;
    trs = await all(() => sb.from("track_call_transcripts").select("call_id,status,words").gte("call_id", lo));
    mts = await all(() => sb.from("track_call_match").select("call_id,party,contact_name,vendor_name").gte("call_id", lo));
    nts = await all(() => sb.from("track_call_notes").select("call_id,guest_name:data->>guest_name").gte("call_id", lo));
  } catch(e){ return $("#cbody").innerHTML = `<div class="card"><p class="muted">Couldn't load: ${esc(e.message)}</p></div>`; }
  if(ownDesk()){ const moved = calls.filter(c => c.owner_kind).length; calls = calls.filter(c => !c.owner_kind);
    if(moved) $("#culast").insertAdjacentHTML("beforeend", ` <a href="#/owner_calls">${moved} owner call${moved === 1 ? "" : "s"} for these dates are in Owners ▸ Communication →</a>`); }
  const T = Object.fromEntries(trs.map(t => [t.call_id, t])), MT = Object.fromEntries(mts.map(m => [m.call_id, m])), NM = Object.fromEntries(nts.map(n => [n.call_id, n.guest_name]));
  // the name we show: Track contact, else the hub vendor, else the name Penny heard on the call (marked "said on call")
  const who = c => { const m = MT[c.call_id] || {}; return m.contact_name || m.vendor_name || (NM[c.call_id] ? NM[c.call_id] + " (said on call)" : c.caller_name || ""); };
  const opts = (k, split) => [...new Set(calls.flatMap(c => split ? (c[k] || "").split(",").map(x => x.trim()) : [c[k] || ""]).filter(Boolean))].sort();
  const sel = (id, label, list, val) => `<div><label>${label}</label><br><select id="${id}"><option value="">All</option>${list.map(x => `<option ${x === val ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>`;
  $("#cflt").innerHTML = `<div><label>Caller</label><br><input type="search" id="cqq" placeholder="Name or phone" value="${esc(S.q)}" style="width:190px"></div><div><label>From</label><br><input type="date" id="cfrom" value="${S.from}"></div><div><label>To</label><br><input type="date" id="cto" value="${S.to}"></div>
    ${sel("cag", "Agent", opts("agents", true), S.agent)}${sel("cdir", "Inbound / outbound", ["Inbound", "Outbound"], S.dir)}${sel("cq", "Call type (Pulse line)", opts("queues", true), S.queue)}
    <div><label>Who called</label><br><select id="cpa"><option value="">All</option>${Object.entries(PARTY).map(([k, l]) => `<option value="${k}" ${S.party === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>${sel("cres", "Result", opts("call_result"), S.result)}
    <div><label>Transcript</label><br><select id="ctr"><option value="">All</option><option value="y" ${S.tr === "y" ? "selected" : ""}>Has one</option><option value="n" ${S.tr === "n" ? "selected" : ""}>None</option></select></div>`;
  const re = () => { S = { from:$("#cfrom").value, to:$("#cto").value, agent:$("#cag").value, dir:$("#cdir").value, result:$("#cres").value, queue:$("#cq").value, tr:$("#ctr").value, party:$("#cpa").value, q:$("#cqq").value.trim() }; };
  $("#cfrom").onchange = $("#cto").onchange = () => { re(); callsView(v); };
  ["#cag", "#cdir", "#cres", "#cq", "#ctr", "#cpa"].forEach(id => $(id).onchange = () => { re(); draw(); });
  let qt; $("#cqq").oninput = () => { clearTimeout(qt); qt = setTimeout(() => { re(); draw(); }, 250); };
  function draw(){
    const has = c => T[c.call_id] && T[c.call_id].status === "ok";
    const ql = S.q.toLowerCase(), qd = digits(S.q);
    const hit = c => !ql || who(c).toLowerCase().includes(ql) || (qd.length >= 3 && digits(c.outside_number).includes(qd)) || [c.caller_city, c.caller_state].join(" ").toLowerCase().includes(ql);
    const list = calls.filter(c => (!S.agent || (S.agent === "No agent" ? !(c.agents || "").trim() : (c.agents || "").split(",").map(x => x.trim()).includes(S.agent))) && (!S.dir || dirName(c.direction) === S.dir)
      && (!S.result || c.call_result === S.result) && (!S.queue || (c.queues || "").split(",").map(x => x.trim()).includes(S.queue)) && (!S.tr || (S.tr === "y") === has(c))
      && (!S.party || (MT[c.call_id] || {}).party === S.party) && hit(c));
    if(!calls.length) return $("#cbody").innerHTML = `<div class="card"><p class="muted">No calls for these dates yet.${canUp ? " Press <b>⬆ Upload calls from Track</b>." : ""}</p></div>`;
    const inb = list.filter(c => dirName(c.direction) === "Inbound"), talk = list.filter(c => c.duration_s), avg = talk.length ? Math.round(talk.reduce((a, c) => a + c.duration_s, 0) / talk.length) : null;
    const ag = {}; list.forEach(c => (c.agents || "No agent").split(",").map(x => x.trim()).forEach(a => { const o = ag[a] = ag[a] || { n:0, i:0, o:0, t:0, tr:0 };
      o.n++; dirName(c.direction) === "Inbound" ? o.i++ : o.o++; o.t += c.duration_s || 0; if(has(c)) o.tr++; }));
    $("#cbody").innerHTML = `<div class="kpis">
        <div class="kpi"><span class="muted">Calls</span><b>${list.length}</b></div>
        <div class="kpi"><span class="muted">Inbound</span><b>${inb.length}</b></div>
        <div class="kpi"><span class="muted">Inbound answered</span><b>${inb.length ? Math.round(100 * inb.filter(answered).length / inb.length) + "%" : "–"}</b></div>
        <div class="kpi"><span class="muted">Avg talk time</span><b>${avg != null ? dur(avg) : "–"}</b></div>
        <div class="kpi"><span class="muted">With transcript</span><b>${list.filter(has).length}</b></div></div>
      <div class="card" style="overflow-x:auto"><b>By agent</b><table><tr><th>Agent</th><th>Calls</th><th>Inbound</th><th>Outbound</th><th>Avg talk</th><th>Transcripts</th></tr>
        ${Object.entries(ag).sort((a, b) => b[1].n - a[1].n).map(([a, o]) => `<tr class="cl${S.agent === a ? " on" : ""}" data-ag="${esc(a)}" title="${S.agent === a ? "Show every agent" : "Show only " + esc(a) + "'s calls"}"><td>${S.agent === a ? "✓ " : ""}<u>${esc(a)}</u></td><td>${o.n}</td><td>${o.i}</td><td>${o.o}</td><td>${dur(Math.round(o.t / o.n))}</td><td>${o.tr}</td></tr>`).join("")}</table></div>
      <div class="card" style="overflow-x:auto"><b>Calls</b> <span class="muted">· click a call for its transcript${S.q ? ` · searching ${esc(dayf(S.from))} to ${esc(dayf(S.to))}, set From earlier to search older calls` : ""}</span><table><tr><th>When</th><th>Direction</th><th>Agent</th><th class="hide-s">Caller</th><th>Result</th><th class="hide-s">Queue</th><th>Talk</th><th>Transcript</th></tr>
        ${list.slice(0, 500).map(c => `<tr class="cl" data-id="${c.call_id}"><td style="white-space:nowrap">${esc(dayf(c.call_at || c.call_day))}<br><span class="muted">${esc(timef(c.call_at))}</span></td><td>${esc(dirName(c.direction))}</td>
          <td>${esc(c.agents || "")}</td><td class="hide-s">${esc(who(c))}${MT[c.call_id] ? ` <span class="pill">${esc((PARTY[MT[c.call_id].party] || "").split(" (")[0])}</span>` : ""}${c.outside_number ? `<br><span class="muted">${esc(phonef(c.outside_number))}</span>` : ""}${c.caller_city || c.caller_state ? `<br><span class="muted">${esc([c.caller_city, c.caller_state].filter(Boolean).join(", "))}</span>` : ""}</td>
          <td>${esc(c.call_result || "")}${c.routing_result ? `<br><span class="muted">${esc(c.routing_result)}</span>` : ""}</td><td class="hide-s">${esc(c.queues || "")}</td><td>${dur(c.duration_s)}</td>
          <td>${has(c) ? `<span class="pill green">${T[c.call_id].words} words</span>` : T[c.call_id] ? `<span class="pill">none</span>` : `<span class="pill amber">pending</span>`}</td></tr>`).join("")}</table>
        ${list.length > 500 ? `<p class="muted">Showing the newest 500 of ${list.length}. Narrow the dates or filters to see the rest.</p>` : ""}</div>`;
    $("#cbody").querySelectorAll("tr.cl[data-id]").forEach(tr => tr.onclick = () => { const c = calls.find(x => x.call_id === +tr.dataset.id); showCall(c, T[c.call_id]); });
    // click an agent in By agent = filter the calls to them (Brandon 2026-11-03); click again = everyone
    $("#cbody").querySelectorAll("tr[data-ag]").forEach(tr => tr.onclick = () => { const a = tr.dataset.ag; S.agent = S.agent === a ? "" : a;
      const sel = $("#cag"); if(sel){ if(S.agent && ![...sel.options].some(o => o.value === S.agent)) sel.insertAdjacentHTML("beforeend", `<option>${esc(S.agent)}</option>`); sel.value = S.agent; }
      draw(); const k = [...document.querySelectorAll("#cbody .card b")].find(x => x.textContent === "Calls"); if(k && S.agent) k.scrollIntoView({ behavior:"smooth", block:"start" }); });
  }
  draw();
};
// ---------- Guest ▸ Follow-ups (Brandon 2026-10-29): calls that need a follow-up, celebrations, people who called and never booked.
// Data: track_call_notes (Penny's read of each transcript), track_call_match (who called), track_call_followups (done / not needed).
// Same per-call rule as Call review, so each person sees only follow-ups for calls they can see.
const CT = { future_guest:"Future guest", current_guest:"Guest staying now", past_guest:"Past guest", owner:"Owner", prospective_owner:"Possible owner" };
const TEAM = { front_desk:"Front desk", office_manager:"Office managers", owner_relations:"Owner relations", maintenance:"Maintenance", housekeeping:"Housekeeping" };
const nice = s => String(s || "").replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
let F = { tab:"todo", team:"", months:12 };
window.followupsView = async function(v){
  css(); $("#ttl").textContent = $("#utl").textContent = "Follow-ups";
  v.innerHTML = `<div class="page wide calls"><h2 style="margin:0 0 4px">Follow-ups</h2>
    <p class="muted">From phone calls in Track Pulse. Penny reads each call's transcript (machine-made, so double-check names and numbers) and says who should follow up. Source: Call review.</p>
    <div class="bdsel" id="ftabs" style="margin:10px 0"></div><div id="fbody"><p class="muted">Loading…</p></div></div>`;
  let notes, calls, match, fus;
  try {
    notes = await all(() => sb.from("track_call_notes").select("call_id,summary,caller_type,intent,celebration,celebration_detail,outcome,not_booked_reason,follow_up,follow_up_what,follow_up_team,data").order("call_id", { ascending:false }));
    const since = iso(new Date(Date.now() - F.months * 30.5 * 864e5));
    calls = await all(() => sb.from("track_calls").select("call_id,call_at,call_day,direction,agents,caller_name,caller_city,caller_state,outside_number,call_result,queues,owner_kind").gte("call_day", since).order("call_id", { ascending:false }));
    match = await all(() => sb.from("track_call_match").select("call_id,party,contact_id,stays_before,last_stay,reservation_id,res_arrive,res_depart,res_unit,booked_after,booked_after_on").gte("call_id", calls.length ? calls[calls.length - 1].call_id : 0));
    fus = await all(() => sb.from("track_call_followups").select("call_id,status,note,by_name,at").order("at", { ascending:false }));
  } catch(e){ return $("#fbody").innerHTML = `<div class="card"><p class="muted">Couldn't load: ${esc(e.message)}</p></div>`; }
  if(ownDesk()) calls = calls.filter(c => !c.owner_kind);   // they're on Owners ▸ Communication
  const C = Object.fromEntries(calls.map(c => [c.call_id, c])), MT = Object.fromEntries(match.map(m => [m.call_id, m])), FU = {};
  fus.forEach(f => { if(!FU[f.call_id]) FU[f.call_id] = f; });
  const isOpen = n => !FU[n.call_id] || FU[n.call_id].status === "open";
  const people = notes.filter(n => C[n.call_id] && CT[n.caller_type]);
  const todo = people.filter(n => n.follow_up && isOpen(n) && (!F.team || n.follow_up_team === F.team));
  const cele = people.filter(n => n.celebration && n.celebration !== "none");
  const done = people.filter(n => FU[n.call_id] && FU[n.call_id].status !== "open");
  // leads: callers on a lead / possible-guest line who never booked within 30 days of any call, one row per phone number
  const L = {};
  calls.forEach(c => { const m = MT[c.call_id]; if(!m || !["lead", "prospect"].includes(m.party)) return;
    const k = (c.outside_number || "").replace(/\D/g, "").slice(-10) || "c" + c.call_id;
    const o = L[k] = L[k] || { k, num:c.outside_number, name:"", city:"", calls:[], booked:false, party:m.party };
    o.calls.push(c); if(!o.name && c.caller_name) o.name = c.caller_name; if(!o.city && (c.caller_city || c.caller_state)) o.city = [c.caller_city, c.caller_state].filter(Boolean).join(", ");
    if(m.booked_after) o.booked = true; });
  const leads = Object.values(L).filter(o => !o.booked).sort((a, b) => b.calls[0].call_id - a.calls[0].call_id);
  const tabs = [["todo", "To follow up", todo.length], ["cele", "Celebrations", cele.length], ["leads", "Called, never booked", leads.length], ["done", "Done", done.length]];
  $("#ftabs").innerHTML = tabs.map(([k, l, n]) => `<button class="btn small ${F.tab === k ? "primary" : ""}" data-t="${k}">${l} <span class="pill" style="margin-left:4px">${n}</span></button>`).join("")
    + (F.tab === "todo" ? `<select id="fteam" style="width:auto;min-height:36px;font-size:13.5px"><option value="">Every team</option>${Object.entries(TEAM).map(([k, l]) => `<option value="${k}" ${F.team === k ? "selected" : ""}>${l}</option>`).join("")}</select>` : "")
    + (F.tab === "leads" ? `<select id="fmon" style="width:auto;min-height:36px;font-size:13.5px">${[3, 6, 12, 24].map(m => `<option value="${m}" ${F.months === m ? "selected" : ""}>Last ${m} months</option>`).join("")}</select>` : "");
  $("#ftabs").querySelectorAll("[data-t]").forEach(b => b.onclick = () => { F.tab = b.dataset.t; followupsView(v); });
  if($("#fteam")) $("#fteam").onchange = e => { F.team = e.target.value; followupsView(v); };
  if($("#fmon")) $("#fmon").onchange = e => { F.months = +e.target.value; followupsView(v); };
  const trip = d => { const t = (d && d.trip) || {}; return [t.arrive && (dayf(t.arrive) + (t.depart ? " – " + dayf(t.depart) : "")), t.adults != null && t.adults + " adults", t.kids ? t.kids + " kids" : "", t.pets ? t.pets + " pets" : "",
    (t.homes_or_areas || []).join(", ")].filter(Boolean).join(" · "); };
  const card = n => { const c = C[n.call_id], m = MT[n.call_id] || {}, f = FU[n.call_id], d = n.data || {};
    return `<div class="card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-size:16px">${esc(d.guest_name || c.caller_name || "Caller")}</b>
        <span class="pill">${esc(CT[n.caller_type])}</span>${n.celebration && n.celebration !== "none" ? `<span class="pill amber">🎉 ${esc(n.celebration_detail || nice(n.celebration))}</span>` : ""}
        ${n.outcome ? `<span class="pill ${/book/.test(n.outcome) ? "green" : /not_booked|issue_open/.test(n.outcome) ? "red" : ""}">${esc(nice(n.outcome))}</span>` : ""}
        <span class="muted" style="margin-left:auto">${esc(dayf(c.call_at))} ${esc(timef(c.call_at))} · ${esc(dirName(c.direction))} · ${esc(c.agents || "no agent")}</span></div>
      <p style="margin:8px 0">${esc(n.summary || "")}</p>
      ${trip(d) ? `<div class="muted">Trip: ${esc(trip(d))}</div>` : ""}
      ${(d.wants || []).length ? `<div class="muted">Wants: ${esc(d.wants.join(", "))}</div>` : ""}
      ${(d.stay_notes || []).length ? `<div class="muted">For the stay: ${esc(d.stay_notes.join(" · "))}</div>` : ""}
      ${n.not_booked_reason ? `<div class="muted">Didn't book: ${esc(n.not_booked_reason)}</div>` : ""}
      ${m.reservation_id ? `<div class="muted">Stay: <a href="${TRACK}/pms/reservations/view/${m.reservation_id}/" target="_blank" rel="noopener">${esc(m.res_unit || "reservation")} ${esc(dayf(m.res_arrive))} – ${esc(dayf(m.res_depart))}</a></div>`
        : m.booked_after ? `<div class="muted">Booked after the call: <a href="${TRACK}/pms/reservations/view/${m.booked_after}/" target="_blank" rel="noopener">${esc(dayf(m.booked_after_on))}</a></div>` : ""}
      ${m.stays_before ? `<div class="muted">Stayed with us ${m.stays_before} time${m.stays_before === 1 ? "" : "s"} before (last ${esc(dayf(m.last_stay))})</div>` : ""}
      ${n.follow_up && n.follow_up_what ? `<div style="margin-top:8px"><b>Next step${n.follow_up_team && TEAM[n.follow_up_team] ? " · " + esc(TEAM[n.follow_up_team]) : ""}:</b> ${esc(n.follow_up_what)}</div>` : ""}
      ${f ? `<div class="muted" style="margin-top:6px">${f.status === "done" ? "✓ Done" : f.status === "not_needed" ? "Not needed" : "Re-opened"} by ${esc((f.by_name || "").split(" ")[0])} ${esc(new Date(f.at).toLocaleDateString())}${f.note ? ": " + esc(f.note) : ""}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        ${!f || f.status === "open" ? `<button class="btn small primary" data-fu="${n.call_id}" data-s="done">✓ Done</button><button class="btn small" data-fu="${n.call_id}" data-s="not_needed">Not needed</button>`
          : `<button class="btn small" data-fu="${n.call_id}" data-s="open">Re-open</button>`}
        <button class="btn small" data-call="${n.call_id}">Read the call</button>
        <a class="btn small" href="${TRACK}/pulse/calls/view/?id=${n.call_id}" target="_blank" rel="noopener">Open in Track</a></div></div>`; };
  const list = F.tab === "todo" ? todo : F.tab === "cele" ? cele : done;
  if(F.tab === "leads"){
    $("#fbody").innerHTML = `<div class="card" style="overflow-x:auto"><p class="muted" style="margin-top:0">People who called a guest line, are in Track or called from an unknown number, and didn't book within 30 days of a call. Matched by phone number to Track contacts and reservations (Track contacts, read ${esc(new Date().toLocaleDateString())}).</p>
      <table><tr><th>Caller</th><th>Number</th><th class="hide-s">From</th><th>Calls</th><th>Last call</th><th>What Penny heard</th></tr>
      ${leads.slice(0, 400).map(o => { const n = notes.find(x => o.calls.some(c => c.call_id === x.call_id));
        return `<tr><td>${esc(o.name || "—")}<br><span class="muted">${o.party === "lead" ? "In Track, never stayed" : "Not in Track"}</span></td><td style="white-space:nowrap">${esc(o.num || "")}</td><td class="hide-s">${esc(o.city)}</td>
          <td>${o.calls.length}</td><td style="white-space:nowrap">${esc(dayf(o.calls[0].call_day))}</td><td>${n ? esc(n.summary || "") : `<span class="muted">No transcript</span>`}</td></tr>`; }).join("")}</table>
      ${leads.length > 400 ? `<p class="muted">Showing the newest 400 of ${leads.length}.</p>` : ""}</div>`;
  } else {
    $("#fbody").innerHTML = list.length ? list.slice(0, 200).map(card).join("") : `<div class="card"><p class="muted">${F.tab === "todo" ? "Nothing to follow up right now." : "Nothing here yet."}</p></div>`;
  }
  $("#fbody").querySelectorAll("[data-fu]").forEach(b => b.onclick = async () => {
    const note = b.dataset.s === "open" ? "" : prompt(b.dataset.s === "done" ? "What did you do? (optional)" : "Why isn't it needed? (optional)", "");
    if(note === null) return;
    b.disabled = true;
    const r = await sb.rpc("followup_set", { p_call:+b.dataset.fu, p_status:b.dataset.s, p_note:note });
    if(r.error){ b.disabled = false; return alert("Couldn't save: " + (window.niceErr ? niceErr(r.error) : r.error.message)); }
    followupsView(v); });
  $("#fbody").querySelectorAll("[data-call]").forEach(b => b.onclick = () => { const id = +b.dataset.call; showCall({ ...C[id], call_id:id }, { status:"ok" }); });
};
// ---------- Owners ▸ Communication (Brandon 2026-11-01): "owner communication comes into there ... so the owner relations team can monitor the
// transcripts or listen to the call to determine if they need to reach out or not". Calls with track_calls.owner_kind (hub_owner_calls.sql).
// Homes = owner_call_homes() (the call's number vs the Track owners list, home codes only). Marks go in track_call_followups (followup_set).
// Look (Jeff 2026-11-10: make it look like the Owner Relations meeting page, meetings.js): header + tools, 4 tiles, progress bar,
// pill filters + search, small sideways rows grouped by day, tap a row = side panel (Overview · Transcript · History). Same data + RPCs as before.
let O = { tab:"reach", from: iso(new Date(Date.now() - 59 * 864e5)), to: iso(new Date()), q:"", agent:"", open:null, ptab:"ov", trc:{} };
const OCSS = `.page.occ{max-width:1800px;padding:20px 28px}
.occ .ochead{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;justify-content:space-between;margin:0 0 12px}
.occ .ochead h2{margin:0;font-size:22px} .occ .ochead p{margin:4px 0 0}
.occ .octools{display:flex;gap:8px;flex-wrap:wrap;align-items:center} .occ .octools input,.occ .octools select{width:auto}
.occ .octiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:4px 0 8px}
.occ .octile{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:flex-start;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.occ .octile b{display:block;font-size:22px;line-height:1.1} .occ .octile span{font-size:12.5px;color:var(--muted)}
.occ .octile i{font-style:normal;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:#eef3e6;color:#3c5f12;font-size:13px}
.occ .octile.g b{color:#3c5f12} .occ .octile.r b{color:#b42318}
.occ button.octile{font:inherit;color:inherit;text-align:left;width:100%;margin:0;cursor:pointer;transition:border-color .15s,box-shadow .15s}
.occ button.octile:hover{border-color:#9bbf6a}
.occ button.octile.on{border-color:#3c5f12;box-shadow:0 0 0 2px rgba(60,95,18,.18)}
.occ button.octile:focus-visible{outline:2px solid #3c5f12;outline-offset:2px}
.occ .octile .ocv{display:block;font-size:inherit;color:inherit}
.occ .ocprog{height:5px;border-radius:9px;background:var(--line);margin-top:6px;overflow:hidden} .occ .ocprog i{display:block;height:100%;background:var(--moose,#2f5d3a)}
.occ .ocbar{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin:12px 0 4px} .occ .ocbar #oq{max-width:260px;width:100%}
.occ .ocfts{display:inline-flex;gap:2px;background:var(--bg-2,#eef0ea);border-radius:10px;padding:3px;flex-wrap:wrap}
.ocft{border:0;background:transparent;padding:5px 10px;border-radius:8px;font:inherit;font-size:13px;color:var(--ink-2,#444);cursor:pointer}
.ocft span{color:var(--muted);font-size:12px} .ocft.on{background:var(--card,#fff);box-shadow:0 1px 2px rgba(0,0,0,.1);color:var(--ink,#111);font-weight:700}
.occ h3.ocg{margin:18px 0 8px;font-size:15px} .occ h3.ocg .muted{font-weight:400}
.occ .ocl{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(460px,100%),1fr));column-gap:18px;padding:6px 8px}
.ocr{display:flex;gap:12px;align-items:center;padding:7px 8px;border-radius:10px;cursor:pointer;border-bottom:1px solid var(--line)}
.ocr:hover,.ocr:focus{background:#f6f7f2;outline:none} .ocr.cov{opacity:.62}
.ocr>i{font-style:normal;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:14px;font-weight:800;flex:0 0 auto;color:#fff}
.ocm{flex:1;min-width:0} .oct{display:flex;justify-content:space-between;gap:10px;align-items:baseline;font-size:14px}
.oct>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ocm small{font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ocrc{display:inline-flex;gap:4px;align-items:center;flex:0 0 auto} .ocrc .btn{padding:1px 8px;font-size:12px;min-height:0}
.octm{font-size:12px;color:var(--muted);white-space:nowrap}
.ocp{font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:7px;background:#f1f2ee;color:#555;white-space:nowrap}
.ocp.ok{background:#e7f4e1;color:#2f6b1d} .ocp.wait{background:#fdf1dc;color:#8a5a00} .ocp.todo{background:#eef0f5;color:#3d4a66} .ocp.bad{background:#fde8e6;color:#b42318}
.ocpov{position:fixed;inset:0;background:rgba(15,25,15,.35);z-index:900;display:flex;justify-content:flex-end}
.ocpanel{background:var(--bg,#f7f8f4);width:min(560px,100%);height:100%;overflow:auto;box-shadow:-8px 0 30px rgba(0,0,0,.18);display:flex;flex-direction:column}
.ocph{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:16px 18px 10px;background:var(--card,#fff);border-bottom:1px solid var(--line)}
.ocph h3{margin:6px 0 2px;font-size:18px} .ocown{display:block;font-size:13px;color:var(--ink-2,#444);font-weight:600}
.ocptabs{display:flex;gap:4px;padding:8px 18px;background:var(--card,#fff);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:1}
.ocptabs button{border:0;background:transparent;padding:6px 12px;border-radius:8px;font:inherit;font-size:13.5px;cursor:pointer;color:var(--ink-2,#444)}
.ocptabs button span{background:#eef0ea;border-radius:6px;padding:0 6px;font-size:12px;margin-left:3px} .ocptabs button.on{background:#eef3e6;color:#24452c;font-weight:700}
.ocpb{padding:14px 18px 30px;display:grid;gap:12px;align-content:start}
.ocsig{display:flex;gap:10px;background:#eef3e6;border-radius:12px;padding:11px 13px;font-size:14px;font-weight:600;color:#24452c}
.ocsig i{font-style:normal;width:26px;height:26px;border-radius:8px;background:#fff;display:grid;place-items:center;flex:0 0 auto} .ocsig small{display:block;font-size:11.5px;color:var(--muted)}
.ocsig.red{background:#fde8e6;color:#8a1c12}
.ocbox{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:12px 13px;font-size:14px} .ocbox>b{display:block;font-size:13.5px;margin-bottom:6px}
.ocbox textarea{width:100%;min-height:60px;font-size:14px} .ocln{margin-top:4px}
.ocdl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13.5px;margin:0} .ocdl dt{color:var(--muted)} .ocdl dd{margin:0;min-width:0;overflow-wrap:anywhere}
.ocacts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}
.ocsrc{font-size:12px;color:var(--muted);margin:0}
.ocai{display:flex;gap:10px;padding:8px 0;font-size:13.5px;position:relative}
.ocai>i{font-style:normal;width:24px;height:24px;border-radius:50%;background:#eef3e6;display:grid;place-items:center;font-size:12px;flex:0 0 auto;z-index:1}
.ocai:not(:last-child)::before{content:"";position:absolute;left:11px;top:30px;bottom:-6px;border-left:1px solid var(--line)}
.ocab{color:var(--ink-2,#444);white-space:pre-wrap;margin-top:2px}
@media (max-width:760px){ .occ .octiles{grid-template-columns:1fr 1fr} .page.occ{padding:14px 12px} .ocpanel{width:100%} }
@media print{ .ocpov,.ocbar,.octools{display:none!important} }`;
function ocCss(){ if(document.getElementById("occss")) return; const s = document.createElement("style"); s.id = "occss"; s.textContent = OCSS; document.head.appendChild(s); }
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const tmf = a => { try { return new Date(a).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }); } catch(e){ return ""; } };
if(!window._ocNav){ window._ocNav = 1;   // the side panel sits on <body>: close it on Esc and when the page changes
  window.addEventListener("hashchange", () => { if(!/^#\/owner_calls/.test(location.hash)){ O.open = null; document.getElementById("ocpov")?.remove(); } });
  document.addEventListener("keydown", e => { if(e.key === "Escape" && document.getElementById("ocpov")){ O.open = null; document.getElementById("ocpov").remove(); } }); }
window.ownerCallsView = async function(v){
  css(); ocCss(); $("#ttl").textContent = $("#utl").textContent = "Owner communication";
  document.getElementById("ocpov")?.remove(); O.open = null;
  v.innerHTML = `<div class="page occ"><div class="ochead"><div><h2>Owner communication</h2>
      <p class="muted">Phone calls with our owners and with people asking about management · ${esc(dayf(O.from))} – ${esc(dayf(O.to))}</p></div>
      <div class="octools"><input type="date" id="ofrom" value="${O.from}" aria-label="From"><span class="muted">to</span><input type="date" id="oto" value="${O.to}" aria-label="To">
        <select id="oag" aria-label="Agent"><option value="">All agents</option></select><button class="btn small" id="oref" title="Load again">↻</button></div></div>
    <div class="octiles" id="octiles"></div><div class="ocprog" id="ocprog"></div>
    <div class="ocbar"><div class="ocfts" id="ocfts"></div><input type="search" id="oq" placeholder="🔍 Name, phone or home" value="${esc(O.q)}" aria-label="Search"></div>
    <div id="obody"><p class="muted">Loading…</p></div>
    <p class="muted" style="font-size:12px;margin-top:14px">From Track Pulse (Recent Calls export + transcripts through the Track API). Penny reads each transcript and suggests a next step; she's machine-made, so double-check names and numbers. Homes are matched by phone number to the Track owners list.</p></div>`;
  const me = v.querySelector(".page.occ");
  $("#ofrom").onchange = $("#oto").onchange = () => { O.from = $("#ofrom").value || O.from; O.to = $("#oto").value || O.to; ownerCallsView(v); };
  $("#oref").onclick = () => ownerCallsView(v);
  let calls, trs, mts, nts, fus; const hm = {};
  try {
    calls = await all(() => sb.from("track_calls").select("call_id,call_at,call_day,direction,duration_s,agents,queues,call_result,routing_result,caller_name,caller_city,caller_state,outside_number,owner_kind")
      .not("owner_kind", "is", null).gte("call_day", O.from).lte("call_day", O.to).order("call_at", { ascending:false }));
    const lo = calls.length ? Math.min(...calls.map(c => c.call_id)) : 0;
    [trs, mts, nts, fus] = await Promise.all([
      all(() => sb.from("track_call_transcripts").select("call_id,status,words").gte("call_id", lo)),
      all(() => sb.from("track_call_match").select("call_id,party,contact_name").gte("call_id", lo)),
      all(() => sb.from("track_call_notes").select("call_id,summary,caller_type,outcome,celebration,celebration_detail,follow_up,follow_up_what,follow_up_team,data").gte("call_id", lo)),
      all(() => sb.from("track_call_followups").select("call_id,status,note,by_name,at").gte("call_id", lo).order("at", { ascending:false }))]);
    const ids = calls.map(c => c.call_id);
    for(let i = 0; i < ids.length; i += 500){ const r = await sb.rpc("owner_call_homes", { p_ids: ids.slice(i, i + 500) }); if(r.error) throw r.error; (r.data || []).forEach(x => hm[x.call_id] = x.homes); }
  } catch(e){ if(me.isConnected) $("#obody").innerHTML = `<div class="card"><p class="muted" style="margin:0">Couldn't load: ${esc(window.niceErr ? niceErr(e) : e.message)}</p></div>`; return; }
  if(!me.isConnected) return;   // the person moved on (or changed the dates) while this was loading
  const T = Object.fromEntries(trs.map(t => [t.call_id, t])), MT = Object.fromEntries(mts.map(m => [m.call_id, m])), N = Object.fromEntries(nts.map(n => [n.call_id, n])), FU = {}, FUH = {};
  fus.forEach(f => { if(!FU[f.call_id]) FU[f.call_id] = f; (FUH[f.call_id] = FUH[f.call_id] || []).push(f); });   // newest first
  const has = c => T[c.call_id] && T[c.call_id].status === "ok";
  const who = c => { const m = MT[c.call_id] || {}, n = N[c.call_id]; return m.contact_name || (n && n.data && n.data.guest_name ? n.data.guest_name + " (said on call)" : c.caller_name || "Caller"); };
  const open = c => !FU[c.call_id] || FU[c.call_id].status === "open";
  const flagged = c => !!(N[c.call_id] && N[c.call_id].follow_up);
  const reach = c => c.owner_kind === "owner" && open(c) && flagged(c);
  const homes = c => hm[c.call_id] || [];
  const dayOf = c => c.call_day || String(c.call_at || "").slice(0, 10);
  const stOf = c => !open(c) ? "done" : reach(c) ? "reach" : c.owner_kind === "prospect" ? "pros" : "call";
  const pill = c => { const s = stOf(c), f = FU[c.call_id];
    return s === "done" ? `<span class="ocp ok">${f.status === "not_needed" ? "No need" : "✓ Reached out"}</span>` : s === "reach" ? `<span class="ocp bad">Penny says reach out</span>`
      : s === "pros" ? `<span class="ocp wait">Possible owner</span>` : `<span class="ocp todo">Owner call</span>`; };
  const icon = c => { const s = stOf(c); return s === "done" ? ["#3c7d1e", "✓"] : s === "reach" ? ["#b42318", "!"] : s === "pros" ? ["#c98a16", "★"] : ["#5b6b84", /^out/i.test(c.direction || "") ? "↗" : "↙"]; };
  const meta = c => [timef(c.call_at), dirName(c.direction), c.agents || "no agent", dur(c.duration_s) || "0:00"].filter(Boolean).join(" · ");
  const noSum = c => has(c) ? "Penny hasn't read this one yet." : T[c.call_id] ? "No transcript (short calls, voicemail and calls that weren't recorded usually don't get one)." : "Transcript not pulled yet.";
  const agents = [...new Set(calls.flatMap(c => (c.agents || "").split(",").map(x => x.trim())).filter(Boolean))].sort();
  if(O.agent && !agents.includes(O.agent)) O.agent = "";
  $("#oag").innerHTML = `<option value="">All agents</option>` + agents.map(a => `<option ${a === O.agent ? "selected" : ""}>${esc(a)}</option>`).join("");
  $("#oag").onchange = () => { O.agent = $("#oag").value; draw(); };
  let qt; $("#oq").oninput = () => { clearTimeout(qt); qt = setTimeout(() => { O.q = $("#oq").value.trim(); draw(); }, 200); };
  async function mark(id, s, note, btn){
    if(btn) btn.disabled = true;
    const r = await sb.rpc("followup_set", { p_call:id, p_status:s, p_note:note || "" });
    if(r.error){ if(btn) btn.disabled = false; alert("Couldn't save: " + (window.niceErr ? niceErr(r.error) : r.error.message)); return false; }
    const f = { call_id:id, status:s, note:note || "", by_name:(ME && ME.name) || "", at:new Date().toISOString() };
    FU[id] = f; (FUH[id] = FUH[id] || []).unshift(f); return true;
  }
  function draw(){
    if(!me.isConnected) return;
    const ql = O.q.toLowerCase(), qd = digits(O.q);
    const hit = c => (!O.agent || (c.agents || "").split(",").map(x => x.trim()).includes(O.agent)) && (!ql || who(c).toLowerCase().includes(ql)
      || homes(c).join(" ").toLowerCase().includes(ql) || (qd.length >= 3 && digits(c.outside_number).includes(qd)));
    const base = calls.filter(hit), own = base.filter(c => c.owner_kind === "owner");
    const L = { reach: own.filter(reach), all: own, pros: base.filter(c => c.owner_kind === "prospect"), done: base.filter(c => !open(c)) };
    const fl = own.filter(flagged), fdone = fl.filter(c => !open(c)).length;
    const tile = (n, l, ic, cls, t) => `<button type="button" class="octile${cls ? " " + cls : ""}${O.tab === t ? " on" : ""}" data-t="${t}" title="Show these calls"><span class="ocv"><b>${n}</b><span>${l}</span></span><i>${ic}</i></button>`;
    $("#octiles").innerHTML = tile(L.reach.length, "Penny says reach out", "📞", L.reach.length ? "r" : "", "reach") + tile(L.all.length, "Owner calls", "☎", "", "all") + tile(L.pros.length, "Possible new owners", "🏡", "", "pros")
      + tile(fdone + " / " + fl.length, "Reach-outs handled", "✓", "g", "done");
    $("#ocprog").innerHTML = `<i style="width:${fl.length ? fdone / fl.length * 100 : 0}%"></i>`;
    $("#ocprog").title = `${fdone} of ${fl.length} calls Penny said to reach out on are handled`;
    const tabs = [["reach", "Penny says reach out"], ["all", "All owner calls"], ["pros", "Possible new owners"], ["done", "Handled"]];
    $("#ocfts").innerHTML = tabs.map(([k, l]) => `<button class="ocft${O.tab === k ? " on" : ""}" data-t="${k}">${l} <span>${L[k].length}</span></button>`).join("");
    $("#ocfts").querySelectorAll("[data-t]").forEach(b => b.onclick = () => { O.tab = b.dataset.t; draw(); });
    $("#octiles").querySelectorAll("[data-t]").forEach(b => b.onclick = () => { O.tab = b.dataset.t; draw(); });
    const list = L[O.tab], MAX = 300;
    if(!list.length) return $("#obody").innerHTML = `<div class="card"><p class="muted" style="margin:0">${{ reach:"No owner calls waiting on a reach-out for these dates.", all:"No owner calls for these dates.", pros:"No calls from possible owners for these dates.", done:"Nothing marked yet." }[O.tab]}</p></div>`;
    const row = c => { const n = N[c.call_id] || {}, [bg, ic] = icon(c), hs = homes(c), s = stOf(c);
      const desc = s === "reach" && n.follow_up_what ? "Next: " + n.follow_up_what : n.summary || noSum(c);
      return `<div class="ocr${s === "done" ? " cov" : ""}" data-open="${c.call_id}" tabindex="0" role="button"><i style="background:${bg}">${ic}</i>
        <div class="ocm"><div class="oct"><span><b>${esc(who(c))}</b>${hs.length ? `<span class="muted"> · 🏠 ${esc(hs.join(", "))}</span>` : c.owner_kind === "prospect" ? `<span class="muted"> · possible owner</span>` : ""}</span>
          <span class="ocrc">${n.outcome && /issue_open|not_booked/.test(n.outcome) ? `<span class="ocp bad">${esc(nice(n.outcome))}</span>` : ""}${has(c) ? `<span class="ocp" title="Words in the transcript">📝 ${T[c.call_id].words}</span>` : ""}<span class="octm">${esc(timef(c.call_at))}</span>${open(c) ? `<button class="btn small" data-quick="${c.call_id}" title="Mark reached out (open the call to add a note)">✓</button>` : ""}</span></div>
          <small class="muted">${esc([dirName(c.direction), c.agents || "no agent", dur(c.duration_s) || "0:00"].join(" · "))} · ${esc(cut(desc, 170))}</small></div></div>`; };
    const grp = {}; list.slice(0, MAX).forEach(c => (grp[dayOf(c)] = grp[dayOf(c)] || []).push(c));
    const tdy = iso(new Date()), yd = yday();
    $("#obody").innerHTML = Object.keys(grp).map(d => `<h3 class="ocg">${d === tdy ? "Today" : d === yd ? "Yesterday" : esc(dayf(d))} <span class="muted">${grp[d].length}</span></h3><div class="card ocl">${grp[d].map(row).join("")}</div>`).join("")
      + (list.length > MAX ? `<p class="muted">Showing the newest ${MAX} of ${list.length}. Narrow the dates or search to see the rest.</p>` : "");
    $("#obody").querySelectorAll("[data-open]").forEach(r => { const go = e => { if(e.target.closest("[data-quick]")) return; O.open = +r.dataset.open; O.ptab = "ov"; panel(); };
      r.onclick = go; r.onkeydown = e => { if(e.key === "Enter"){ e.preventDefault(); go(e); } }; });
    $("#obody").querySelectorAll("[data-quick]").forEach(b => b.onclick = async e => { e.stopPropagation(); if(await mark(+b.dataset.quick, "done", "", b)) draw(); });
  }
  /* ---------- the side panel (same look as a meeting topic) ---------- */
  function panel(){
    document.getElementById("ocpov")?.remove();
    const c = calls.find(x => x.call_id === O.open); if(!c || !me.isConnected) return;
    const n = N[c.call_id] || {}, d = n.data || {}, hs = homes(c), hist = FUH[c.call_id] || [], s = stOf(c), f = FU[c.call_id];
    const num = digits(c.outside_number).slice(-10), others = num.length === 10 ? calls.filter(x => x.call_id !== c.call_id && digits(x.outside_number).slice(-10) === num) : [];
    const tabs = [["ov", "Overview", ""], ["tr", "Transcript", ""], ["hi", "History", hist.length + others.length + 1]];
    let b = "";
    if(O.ptab === "ov"){
      const line = (l, x) => x ? `<div class="ocln"><b>${l}:</b> ${esc(x)}</div>` : "";
      const facts = [["When", dayf(dayOf(c)) + (timef(c.call_at) ? " · " + timef(c.call_at) : "")], ["Phone", c.outside_number && phonef(c.outside_number)], ["Homes", hs.join(", ")],
        ["From", [c.caller_city, c.caller_state].filter(Boolean).join(", ")], ["Agent", c.agents], ["Direction", dirName(c.direction)], ["Talk", dur(c.duration_s)],
        ["Result", [c.call_result, c.routing_result].filter(Boolean).join(" · ")], ["Line", c.queues]].filter(x => x[1]);
      b = `${n.follow_up && n.follow_up_what ? `<div class="ocsig${s === "reach" ? " red" : ""}"><i>✦</i><div><small>Penny's next step${n.follow_up_team && TEAM[n.follow_up_team] ? " · " + esc(TEAM[n.follow_up_team]) : ""}</small>${esc(n.follow_up_what)}</div></div>` : ""}
        <div class="ocbox"><b>Penny's summary</b>${n.summary ? `<div class="ocacts" style="margin:0 0 6px">${CT[n.caller_type] ? `<span class="ocp">${esc(CT[n.caller_type])}</span>` : n.caller_type ? `<span class="ocp">${esc(nice(n.caller_type))}</span>` : ""}${n.outcome ? `<span class="ocp${/issue_open|not_booked/.test(n.outcome) ? " bad" : ""}">${esc(nice(n.outcome))}</span>` : ""}${n.celebration && n.celebration !== "none" ? `<span class="ocp wait">🎉 ${esc(n.celebration_detail || nice(n.celebration))}</span>` : ""}</div>
          <div>${esc(n.summary)}</div>${line("Wants", (d.wants || []).join(", "))}${line("Concerns", (d.concerns || []).join(", "))}${line("For the stay", (d.stay_notes || []).join(" · "))}
          <p class="ocsrc" style="margin-top:6px">Machine-made from the transcript, so check names and numbers.</p>` : `<p class="muted" style="margin:0">${esc(noSum(c))}</p>`}</div>
        <div class="ocbox"><b>${open(c) ? "Did we reach out?" : f.status === "not_needed" ? "No reach-out needed" : "✓ Reached out"}</b>
          ${open(c) ? `<textarea id="ocnote" placeholder="How did you reach out, or why isn't it needed? (optional)"></textarea><div class="ocacts"><button class="btn small primary" data-mk="done">✓ Reached out</button><button class="btn small" data-mk="not_needed">No need</button></div>`
            : `<div>${esc((f.by_name || "").split(" ")[0] || "Someone")} · ${esc(new Date(f.at).toLocaleDateString())}${f.note ? ": " + esc(f.note) : ""}</div><div class="ocacts"><button class="btn small" data-mk="open">Re-open</button></div>`}</div>
        <div class="ocbox"><b>The call</b><dl class="ocdl">${facts.map(([k, x]) => `<dt>${k}</dt><dd>${esc(x)}</dd>`).join("")}</dl>
          <div class="ocacts">${has(c) ? `<button class="btn small" data-ptab="tr">📝 Read the call (${T[c.call_id].words} words)</button>` : ""}<a class="btn small" href="${TRACK}/pulse/calls/view/?id=${c.call_id}" target="_blank" rel="noopener" title="Opens the call in Track Pulse, where the recording plays (Track sign-in)">▶ Listen in Track</a></div></div>
        <p class="ocsrc">Source: Track Pulse call #${c.call_id}${hs.length ? " · homes matched by phone number to the Track owners list" : ""}</p>`;
    } else if(O.ptab === "tr"){
      const t = O.trc[c.call_id];
      b = !has(c) ? `<p class="muted">${esc(noSum(c))}</p>` : !t ? `<p class="muted">Loading the transcript…</p>` : t.err ? `<p class="muted">Couldn't load: ${esc(t.err)}</p>`
        : `<p class="ocsrc">Transcript by Track Pulse (${esc(t.engine || "speech to text")}${t.coverage != null ? ", " + t.coverage + "% of the call" : ""}, ${t.words} words). Machine-made, so names and numbers can be off. Codes and card numbers are hidden.</p>
          <div class="ocbox">${(t.lines || []).map(l => `<div class="trl ${esc(l.s || "")}"><div class="who">${esc(l.s === "agent" ? (c.agents || "Agent").split(",")[0] : l.s === "customer" ? "Caller" : l.s || "")}<small>${ms(l.a)}</small></div><div>${esc(l.t)}</div></div>`).join("")}</div>`;
      if(has(c) && !t) sb.from("track_call_transcripts").select("lines,engine,coverage,language,words").eq("call_id", c.call_id).maybeSingle().then(r => {
        O.trc[c.call_id] = r.error || !r.data ? { err: r.error ? (window.niceErr ? niceErr(r.error) : r.error.message) : "not found" } : r.data;
        if(O.open === c.call_id && O.ptab === "tr" && document.getElementById("ocpov")) panel(); });
    } else {
      const act = [{ at:c.call_at, ic:"📞", h:`<b>${esc(dirName(c.direction) || "Phone")} call</b>${c.agents ? " with " + esc(c.agents) : ""} · ${esc(dur(c.duration_s) || "0:00")}`, b:"" }];
      hist.forEach(x => act.push({ at:x.at, ic:x.status === "done" ? "✓" : x.status === "not_needed" ? "–" : "↺",
        h:`<b>${esc(x.by_name || "Someone")}</b> ${x.status === "done" ? "marked it reached out" : x.status === "not_needed" ? "marked no reach-out needed" : "re-opened it"}`, b:esc(x.note || "") }));
      act.sort((a, z) => new Date(z.at) - new Date(a.at));
      b = `<div>${act.map(a => `<div class="ocai"><i>${a.ic}</i><div><div>${a.h}<span class="muted"> · ${esc(tmf(a.at))}</span></div>${a.b ? `<div class="ocab">${a.b}</div>` : ""}</div></div>`).join("")}</div>
        ${others.length ? `<div class="ocbox"><b>Other calls from this number <span class="muted" style="font-weight:400">(these dates)</span></b>${others.map(x => { const [bg, ic] = icon(x);
          return `<div class="ocr${open(x) ? "" : " cov"}" data-go="${x.call_id}" tabindex="0" role="button"><i style="background:${bg}">${ic}</i><div class="ocm"><div class="oct"><span><b>${esc(dayf(dayOf(x)))}</b><span class="muted"> · ${esc(meta(x))}</span></span></div><small class="muted">${esc(cut((N[x.call_id] || {}).summary || noSum(x), 120))}</small></div></div>`; }).join("")}</div>` : ""}`;
    }
    const o = document.createElement("div"); o.id = "ocpov"; o.className = "ocpov";
    o.innerHTML = `<div class="ocpanel" role="dialog" aria-label="${esc(who(c))}"><div class="ocph"><div>${pill(c)}<h3>${esc(who(c))}</h3>${hs.length ? `<span class="ocown">🏠 ${esc(hs.join(", "))}</span>` : ""}<span class="muted" style="font-size:13px">${esc(dayf(dayOf(c)))} · ${esc(meta(c))}</span></div><button class="btn small" data-pclose aria-label="Close">✕</button></div>
      <div class="ocptabs">${tabs.map(([k, l, nn]) => `<button class="${O.ptab === k ? "on" : ""}" data-ptab="${k}">${l}${nn !== "" ? ` <span>${nn}</span>` : ""}</button>`).join("")}</div><div class="ocpb">${b}</div></div>`;
    document.body.appendChild(o);
    const close = () => { O.open = null; o.remove(); };
    o.onclick = e => { if(e.target === o) close(); };
    o.querySelector("[data-pclose]").onclick = close;
    o.querySelectorAll("[data-ptab]").forEach(x => x.onclick = () => { O.ptab = x.dataset.ptab; panel(); });
    o.querySelectorAll("[data-mk]").forEach(x => x.onclick = async () => { const nt = x.dataset.mk === "open" ? "" : ((o.querySelector("#ocnote") || {}).value || "").trim();
      if(await mark(c.call_id, x.dataset.mk, nt, x)){ draw(); panel(); } });
    o.querySelectorAll("[data-go]").forEach(x => { const go = () => { O.open = +x.dataset.go; O.ptab = "ov"; panel(); }; x.onclick = go; x.onkeydown = e => { if(e.key === "Enter") go(); }; });
  }
  draw();
};
// ---------- Guest ▸ Communication (Brandon 2026-11-02): "a guest communication like we did with the owner one". Calls with
// track_calls.guest_kind (hub_guest_calls.sql): guest = has stayed or has a stay booked, prospect = looking to book. The stay comes from
// track_call_match (phone number vs Track contacts + reservations). Marks go in track_call_followups (followup_set).
let G = { tab:"reach", from: iso(new Date(Date.now() - 59 * 864e5)), to: iso(new Date()), q:"", agent:"", dir:"", team:"" };   // Follow-ups folded in 2026-11-03 (Brandon): team filter + Never booked
window.guestCallsView = async function(v){
  css(); $("#ttl").textContent = $("#utl").textContent = "Guest communication";
  v.innerHTML = `<div class="page wide calls"><h2 style="margin:0 0 4px">Guest communication</h2>
    <p class="muted">Phone calls with guests and with people looking to book, from Track Pulse. Penny reads each transcript (machine-made, so double-check names and numbers) and suggests a next step. Stays are matched by phone number to Track contacts and reservations. Source: Pulse Recent Calls export + Track API (transcripts, contacts).</p>
    <div class="flt" id="gflt"></div><div class="bdsel" id="gtabs" style="margin:4px 0 10px"></div><div id="gbody"><p class="muted">Loading…</p></div></div>`;
  let calls, trs, mts, nts, fus;
  try {
    calls = await all(() => sb.from("track_calls").select("call_id,call_at,call_day,direction,duration_s,agents,queues,call_result,routing_result,caller_name,caller_city,caller_state,outside_number,guest_kind")
      .not("guest_kind", "is", null).gte("call_day", G.from).lte("call_day", G.to).order("call_at", { ascending:false }));
    const lo = calls.length ? Math.min(...calls.map(c => c.call_id)) : 0;
    [trs, mts, nts, fus] = await Promise.all([
      all(() => sb.from("track_call_transcripts").select("call_id,status,words").gte("call_id", lo)),
      all(() => sb.from("track_call_match").select("call_id,party,contact_name,stays_before,last_stay,reservation_id,res_arrive,res_depart,res_unit,res_status,booked_after,booked_after_on").gte("call_id", lo)),
      all(() => sb.from("track_call_notes").select("call_id,summary,caller_type,outcome,celebration,celebration_detail,not_booked_reason,follow_up,follow_up_what,follow_up_team,data").gte("call_id", lo)),
      all(() => sb.from("track_call_followups").select("call_id,status,note,by_name,at").gte("call_id", lo).order("at", { ascending:false }))]);
  } catch(e){ return $("#gbody").innerHTML = `<div class="card"><p class="muted">Couldn't load: ${esc(e.message)}</p></div>`; }
  const T = Object.fromEntries(trs.map(t => [t.call_id, t])), MT = Object.fromEntries(mts.map(m => [m.call_id, m])), N = Object.fromEntries(nts.map(n => [n.call_id, n])), FU = {};
  fus.forEach(f => { if(!FU[f.call_id]) FU[f.call_id] = f; });
  const has = c => T[c.call_id] && T[c.call_id].status === "ok";
  const who = c => { const m = MT[c.call_id] || {}, n = N[c.call_id]; return m.contact_name || (n && n.data && n.data.guest_name ? n.data.guest_name + " (said on call)" : c.caller_name || "Caller"); };
  const open = c => !FU[c.call_id] || FU[c.call_id].status === "open";
  const cele = c => { const n = N[c.call_id]; return n && n.celebration && n.celebration !== "none"; };
  const agents = [...new Set(calls.flatMap(c => (c.agents || "").split(",").map(x => x.trim())).filter(Boolean))].sort();
  $("#gflt").innerHTML = `<div><label>Search</label><br><input type="search" id="gq" placeholder="Name, phone or home" value="${esc(G.q)}" style="width:200px"></div>
    <div><label>From</label><br><input type="date" id="gfrom" value="${G.from}"></div><div><label>To</label><br><input type="date" id="gto" value="${G.to}"></div>
    <div><label>Inbound / outbound</label><br><select id="gdir"><option value="">Both</option><option value="in" ${G.dir === "in" ? "selected" : ""}>Inbound</option><option value="out" ${G.dir === "out" ? "selected" : ""}>Outbound</option></select></div>
    <div><label>Agent</label><br><select id="gag"><option value="">All</option>${agents.map(a => `<option ${a === G.agent ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></div>
    <div><label>Who should follow up</label><br><select id="gteam"><option value="">Every team</option>${Object.entries(TEAM).map(([k, l]) => `<option value="${k}" ${G.team === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
  $("#gfrom").onchange = $("#gto").onchange = () => { G.from = $("#gfrom").value; G.to = $("#gto").value; guestCallsView(v); };
  $("#gag").onchange = () => { G.agent = $("#gag").value; draw(); };
  $("#gdir").onchange = () => { G.dir = $("#gdir").value; draw(); };
  $("#gteam").onchange = () => { G.team = $("#gteam").value; draw(); };
  let qt; $("#gq").oninput = () => { clearTimeout(qt); qt = setTimeout(() => { G.q = $("#gq").value.trim(); draw(); }, 250); };
  function draw(){
    const ql = G.q.toLowerCase(), qd = digits(G.q);
    const hit = c => (!G.agent || (c.agents || "").split(",").map(x => x.trim()).includes(G.agent))
      && (!G.dir || (G.dir === "in" ? /^in/i : /^out/i).test(c.direction || ""))
      && (!ql || who(c).toLowerCase().includes(ql) || ((MT[c.call_id] || {}).res_unit || "").toLowerCase().includes(ql)
        || [c.caller_city, c.caller_state].join(" ").toLowerCase().includes(ql) || (qd.length >= 3 && digits(c.outside_number).includes(qd)));
    const base = calls.filter(hit);
    // never booked: callers looking to book (one row per phone number) where no call in these dates was followed by a booking within 30 days
    const NB = {};
    base.filter(c => c.guest_kind === "prospect").forEach(c => { const k = digits(c.outside_number).slice(-10) || "c" + c.call_id;
      const o = NB[k] = NB[k] || { calls:[], booked:false }; o.calls.push(c); if((MT[c.call_id] || {}).booked_after) o.booked = true; });
    const never = Object.values(NB).filter(o => !o.booked).map(o => o.calls[0]);
    const L = { reach: base.filter(c => open(c) && N[c.call_id] && N[c.call_id].follow_up && (!G.team || N[c.call_id].follow_up_team === G.team)), never, stay: base.filter(c => c.guest_kind === "guest"),
      pros: base.filter(c => c.guest_kind === "prospect"), cele: base.filter(cele), done: base.filter(c => !open(c)) };
    const tabs = [["reach", "Penny says reach out"], ["stay", "Staying or booked"], ["pros", "Looking to book"], ["never", "Called, never booked"], ["cele", "Celebrations"], ["done", "Handled"]];
    $("#gtabs").innerHTML = tabs.map(([k, l]) => `<button class="btn small ${G.tab === k ? "primary" : ""}" data-t="${k}">${l} <span class="pill" style="margin-left:4px">${L[k].length}</span></button>`).join("");
    $("#gtabs").querySelectorAll("[data-t]").forEach(b => b.onclick = () => { G.tab = b.dataset.t; draw(); });
    const card = c => { const n = N[c.call_id] || {}, m = MT[c.call_id] || {}, f = FU[c.call_id], d = n.data || {}, t = d.trip || {};
      const trip = [t.arrive && (dayf(t.arrive) + (t.depart ? " – " + dayf(t.depart) : "")), t.adults != null && t.adults + " adults", t.kids ? t.kids + " kids" : "", t.pets ? t.pets + " pets" : "", (t.homes_or_areas || []).join(", ")].filter(Boolean).join(" · ");
      return `<div class="card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-size:16px">${esc(who(c))}</b>
          <span class="pill ${c.guest_kind === "guest" ? "green" : "amber"}">${c.guest_kind === "guest" ? (CT[n.caller_type] && /guest/.test(n.caller_type) ? CT[n.caller_type] : "Guest") : "Looking to book"}</span>
          ${m.res_unit ? `<span class="pill">${esc(m.res_unit)}</span>` : ""}
          ${cele(c) ? `<span class="pill amber">🎉 ${esc(n.celebration_detail || nice(n.celebration))}</span>` : ""}
          ${n.outcome ? `<span class="pill ${/book/.test(n.outcome) && !/not_booked/.test(n.outcome) ? "green" : /not_booked|issue_open/.test(n.outcome) ? "red" : ""}">${esc(nice(n.outcome))}</span>` : ""}
          <span class="muted" style="margin-left:auto">${esc(dayf(c.call_at || c.call_day))} ${esc(timef(c.call_at))} · ${esc(dirName(c.direction))} · ${esc(c.agents || "no agent")} · ${dur(c.duration_s) || "0:00"}</span></div>
        <div class="muted" style="font-size:13px;margin-top:2px">${[c.outside_number && esc(phonef(c.outside_number)), (c.caller_city || c.caller_state) && esc([c.caller_city, c.caller_state].filter(Boolean).join(", ")), c.call_result && esc(c.call_result), c.queues && esc(c.queues)].filter(Boolean).join(" · ")}</div>
        ${n.summary ? `<p style="margin:8px 0">${esc(n.summary)}</p>` : `<p class="muted" style="margin:8px 0">${has(c) ? "Penny hasn't read this one yet." : T[c.call_id] ? "No transcript (short calls, voicemail and calls that weren't recorded usually don't get one)." : "Transcript not pulled yet."}</p>`}
        ${trip ? `<div class="muted">Trip: ${esc(trip)}</div>` : ""}
        ${(d.wants || []).length ? `<div class="muted">Wants: ${esc(d.wants.join(", "))}</div>` : ""}
        ${(d.stay_notes || []).length ? `<div class="muted">For the stay: ${esc(d.stay_notes.join(" · "))}</div>` : ""}
        ${n.not_booked_reason ? `<div class="muted">Didn't book: ${esc(n.not_booked_reason)}</div>` : ""}
        ${m.reservation_id ? `<div class="muted">Stay: <a href="${TRACK}/pms/reservations/view/${m.reservation_id}/" target="_blank" rel="noopener">${esc(m.res_unit || "reservation")} ${esc(dayf(m.res_arrive))} – ${esc(dayf(m.res_depart))}</a>${m.res_status ? " · " + esc(m.res_status) : ""}</div>`
          : m.booked_after ? `<div class="muted">Booked after the call: <a href="${TRACK}/pms/reservations/view/${m.booked_after}/" target="_blank" rel="noopener">${esc(dayf(m.booked_after_on))}</a></div>`
          : c.guest_kind === "prospect" ? `<div class="muted">No booking within 30 days of the call (Track reservations).</div>` : ""}
        ${m.stays_before ? `<div class="muted">Stayed with us ${m.stays_before} time${m.stays_before === 1 ? "" : "s"} before (last ${esc(dayf(m.last_stay))})</div>` : ""}
        ${n.follow_up && n.follow_up_what ? `<div style="margin-top:8px"><b>Next step${n.follow_up_team && TEAM[n.follow_up_team] ? " · " + esc(TEAM[n.follow_up_team]) : ""}:</b> ${esc(n.follow_up_what)}</div>` : ""}
        ${f ? `<div class="muted" style="margin-top:6px">${f.status === "done" ? "✓ Reached out" : f.status === "not_needed" ? "No need" : "Re-opened"} · ${esc((f.by_name || "").split(" ")[0])} ${esc(new Date(f.at).toLocaleDateString())}${f.note ? ": " + esc(f.note) : ""}</div>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${open(c) ? `<button class="btn small primary" data-fu="${c.call_id}" data-s="done">✓ Reached out</button><button class="btn small" data-fu="${c.call_id}" data-s="not_needed">No need</button>`
            : `<button class="btn small" data-fu="${c.call_id}" data-s="open">Re-open</button>`}
          ${has(c) ? `<button class="btn small" data-call="${c.call_id}">Read the call (${T[c.call_id].words} words)</button>` : ""}
          <a class="btn small" href="${TRACK}/pulse/calls/view/?id=${c.call_id}" target="_blank" rel="noopener" title="Opens the call in Track Pulse, where the recording plays (Track sign-in)">▶ Listen in Track</a></div></div>`; };
    const list = L[G.tab], empty = { reach:"No guest calls waiting on a reach-out for these dates.", stay:"No calls from guests for these dates.", pros:"No calls from people looking to book for these dates.", cele:"No celebrations heard on calls for these dates.", never:"Everyone who called about booking in these dates booked within 30 days.", done:"Nothing marked yet." }[G.tab];
    const nbCount = c => { const o = NB[digits(c.outside_number).slice(-10) || "c" + c.call_id]; return o && o.calls.length > 1 ? `<p class="muted" style="margin:-4px 0 10px 4px">${o.calls.length} calls from this number in these dates (newest shown).</p>` : ""; };
    const nbIntro = G.tab === "never" ? `<p class="muted" style="margin:0 0 8px">People who called about booking, one card per phone number (newest call), with no Track booking within 30 days of any of their calls in these dates. Set From earlier to look further back.</p>` : "";
    $("#gbody").innerHTML = list.length ? nbIntro + list.slice(0, 200).map(c => card(c) + (G.tab === "never" ? nbCount(c) : "")).join("") + (list.length > 200 ? `<p class="muted">Showing the newest 200 of ${list.length}. Narrow the dates or search to see the rest.</p>` : "")
      : `<div class="card"><p class="muted">${empty}</p></div>`;
    $("#gbody").querySelectorAll("[data-call]").forEach(b => b.onclick = () => { const c = calls.find(x => x.call_id === +b.dataset.call); showCall(c, T[c.call_id]); });
    $("#gbody").querySelectorAll("[data-fu]").forEach(b => b.onclick = async () => {
      const note = b.dataset.s === "open" ? "" : prompt(b.dataset.s === "done" ? "How did you reach out? (optional)" : "Why isn't a reach-out needed? (optional)", "");
      if(note === null) return;
      b.disabled = true;
      const r = await sb.rpc("followup_set", { p_call:+b.dataset.fu, p_status:b.dataset.s, p_note:note });
      if(r.error){ b.disabled = false; return alert("Couldn't save: " + (window.niceErr ? niceErr(r.error) : r.error.message)); }
      FU[+b.dataset.fu] = { status:b.dataset.s, note, by_name:(ME && ME.name) || "", at:new Date().toISOString() }; draw(); });
  }
  draw();
};
// ---------- Reports ▸ Team ▸ Staff calls (Brandon 2026-11-03): calls between our own people, moved out of Call review / Guest / Owners.
// track_calls.staff_name (hub_staff_calls.sql). RLS: admins all; managers the people they look after (never their own calls).
let SC = { from: iso(new Date(Date.now() - 59 * 864e5)), to: iso(new Date()), who:"", q:"" };
window.staffCallsView = async function(v){
  css(); $("#ttl").textContent = $("#utl").textContent = "Staff calls";
  v.innerHTML = `<div class="page wide calls"><h2 style="margin:0 0 4px">Staff calls</h2>
    <p class="muted">Track Pulse calls between our own people: a staff member calling the office, or the office calling them. A call counts when the Track contact on that number is on our staff list, or Penny heard an employee on the call. These calls are kept out of Call review, Guest and Owner communication. Source: Pulse Recent Calls export + Track API (transcripts, contacts).</p>
    <div class="flt" id="sflt"></div><div id="sbody"><p class="muted">Loading…</p></div></div>`;
  let calls, trs, nts;
  try {
    calls = await all(() => sb.from("track_calls").select("call_id,call_at,call_day,direction,duration_s,hold_s,agents,queues,call_result,routing_result,caller_name,caller_city,caller_state,outside_number,staff_name")
      .not("staff_name", "is", null).gte("call_day", SC.from).lte("call_day", SC.to).order("call_at", { ascending:false }));
    const lo = calls.length ? Math.min(...calls.map(c => c.call_id)) : 0;
    [trs, nts] = await Promise.all([all(() => sb.from("track_call_transcripts").select("call_id,status,words").gte("call_id", lo)),
      all(() => sb.from("track_call_notes").select("call_id,summary").gte("call_id", lo))]);
  } catch(e){ return $("#sbody").innerHTML = `<div class="card"><p class="muted">Couldn't load: ${esc(e.message)}</p></div>`; }
  const T = Object.fromEntries(trs.map(t => [t.call_id, t])), N = Object.fromEntries(nts.map(n => [n.call_id, n]));
  const has = c => T[c.call_id] && T[c.call_id].status === "ok";
  const names = [...new Set(calls.map(c => c.staff_name))].sort();
  $("#sflt").innerHTML = `<div><label>Search</label><br><input type="search" id="sq" placeholder="Name, agent or phone" value="${esc(SC.q)}" style="width:200px"></div>
    <div><label>From</label><br><input type="date" id="sfrom" value="${SC.from}"></div><div><label>To</label><br><input type="date" id="sto" value="${SC.to}"></div>
    <div><label>Staff member</label><br><select id="swho"><option value="">Everyone</option>${names.map(n => `<option ${n === SC.who ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>`;
  $("#sfrom").onchange = $("#sto").onchange = () => { SC.from = $("#sfrom").value; SC.to = $("#sto").value; staffCallsView(v); };
  $("#swho").onchange = () => { SC.who = $("#swho").value; draw(); };
  let qt; $("#sq").oninput = () => { clearTimeout(qt); qt = setTimeout(() => { SC.q = $("#sq").value.trim(); draw(); }, 250); };
  function draw(){
    const ql = SC.q.toLowerCase(), qd = digits(SC.q);
    const list = calls.filter(c => (!SC.who || c.staff_name === SC.who) && (!ql || (c.staff_name + " " + (c.agents || "")).toLowerCase().includes(ql) || (qd.length >= 3 && digits(c.outside_number).includes(qd))));
    const by = {}; list.forEach(c => { const o = by[c.staff_name] = by[c.staff_name] || { n:0, t:0 }; o.n++; o.t += c.duration_s || 0; });
    $("#sbody").innerHTML = !calls.length ? `<div class="card"><p class="muted">No staff calls for these dates.</p></div>`
      : `<div class="card" style="overflow-x:auto"><b>By staff member</b> <span class="muted">· click a name to see only their calls</span><table><tr><th>Staff member</th><th>Calls</th><th>Total talk</th></tr>
        ${Object.entries(by).sort((a, b) => b[1].n - a[1].n).map(([n, o]) => `<tr class="cl${SC.who === n ? " on" : ""}" data-who="${esc(n)}"><td><u>${esc(n)}</u></td><td>${o.n}</td><td>${dur(o.t)}</td></tr>`).join("")}</table></div>
      <div class="card" style="overflow-x:auto"><b>Calls</b> <span class="muted">· click a call for its summary and transcript</span><table><tr><th>When</th><th>Staff member</th><th>Direction</th><th>Agent</th><th class="hide-s">Penny's summary</th><th>Talk</th></tr>
        ${list.slice(0, 500).map(c => `<tr class="cl" data-id="${c.call_id}"><td style="white-space:nowrap">${esc(dayf(c.call_at || c.call_day))}<br><span class="muted">${esc(timef(c.call_at))}</span></td>
          <td>${esc(c.staff_name)}${c.outside_number ? `<br><span class="muted">${esc(phonef(c.outside_number))}</span>` : ""}</td><td>${esc(dirName(c.direction))}</td><td>${esc(c.agents || "")}</td>
          <td class="hide-s">${N[c.call_id] ? esc(N[c.call_id].summary || "") : has(c) ? `<span class="muted">Not summarized yet</span>` : `<span class="muted">No transcript</span>`}</td><td>${dur(c.duration_s)}</td></tr>`).join("")}</table>
        ${list.length > 500 ? `<p class="muted">Showing the newest 500 of ${list.length}.</p>` : ""}</div>`;
    $("#sbody").querySelectorAll("tr[data-id]").forEach(tr => tr.onclick = () => { const c = calls.find(x => x.call_id === +tr.dataset.id); showCall(c, T[c.call_id]); });
    $("#sbody").querySelectorAll("tr[data-who]").forEach(tr => tr.onclick = () => { SC.who = SC.who === tr.dataset.who ? "" : tr.dataset.who; $("#swho").value = SC.who; draw(); });
  }
  draw();
};
let BN = { at:0, j:null };
function bannerDraw(){
  css(); document.querySelectorAll(".cbanner").forEach(x => x.remove());
  const j = BN.j, v = document.getElementById("view");
  if(!j || !j.due || !v || !v.parentNode) return;
  const b = document.createElement("div"); b.className = "cbanner"; b.setAttribute("role", "status");
  b.innerHTML = (j.uploaded && j.missing ? `📞 Yesterday's calls (${esc(dayf(j.day))}) are incomplete: ${j.missing} call${j.missing === 1 ? " is" : "s are"} missing. Export again from Track with only the Created filter.`
    : `📞 Upload yesterday's calls (${esc(dayf(j.day))}) from Track so Call review has them.`) + `<a href="#/call_review/upload">Upload now →</a>`;
  v.parentNode.insertBefore(b, v);
}
window.callsBanner = async function(force){
  if(typeof ME === "undefined" || !ME || typeof sb === "undefined") return;
  if(force || Date.now() - BN.at > 5 * 60e3){ const r = await sb.rpc("calls_upload_due"); BN = { at:Date.now(), j: r.error ? null : r.data }; }
  bannerDraw();
};
// starts by itself once the hub is signed in; re-checks every 5 minutes and redraws if the page shell was rebuilt
const boot = setInterval(() => { if(typeof ME !== "undefined" && ME && document.getElementById("view")){ clearInterval(boot); callsBanner(true); setInterval(() => callsBanner(false), 60e3); window.addEventListener("hashchange", () => callsBanner(false)); } }, 1000);
})();
