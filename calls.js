/* calls.js (Brandon 2026-10-29): Guest ▸ Call review — Track Pulse calls with their transcripts.
   Loaded by hub.html; uses its sb / $ / esc / ME. Data (hub_calls.sql, RLS hub_can('call_review')):
   - track_calls: call details from Pulse ▸ Recent Calls ▸ Export, uploaded here (calls_upload RPC). Our Track API key can't read them.
   - track_call_transcripts: filled by track_calls_sync.py on the office computer every 10 minutes (Track API, read only).
   - callsView(v): #/call_review — upload button + steps (call_can_upload), numbers, by agent, call list, transcript pop-up.
   - callsBanner: admins + office managers get a banner on every hub page until yesterday's calls are uploaded and complete
     (calls_upload_due(): an upload made today that covers yesterday, with no Pulse call ids missing). Others never see it.
   Who sees which calls is decided by RLS: admins + office managers all, owner relations owner calls, everyone else their own. */
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
const phonef = s => { const d = digits(s).slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (s || ""); };
function css(){
  if(document.getElementById("callcss")) return;
  const s = document.createElement("style"); s.id = "callcss";
  s.textContent = `.calls .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:12px}
.calls .kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:12px} .calls .kpi b{display:block;font-size:22px}
.calls .flt{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:12px} .calls .flt label{font-size:12px;color:var(--muted);font-weight:700}
.calls .flt select,.calls .flt input{width:auto;min-height:40px;font-size:14px}
.calls table{width:100%;border-collapse:collapse;font-size:13.5px} .calls td,.calls th{padding:7px 6px;border-top:1px solid var(--line);text-align:left;vertical-align:top}
.calls th{font-weight:600;color:var(--muted);white-space:nowrap} .calls tr.cl{cursor:pointer} .calls tr.cl:hover td{background:color-mix(in srgb,var(--line) 40%,transparent)}
.calls .drop{border:2px dashed var(--line-2);border-radius:14px;padding:22px;text-align:center;margin:10px 0;cursor:pointer}
.calls .drop.on{border-color:var(--forest-2);background:color-mix(in srgb,var(--forest-2) 8%,transparent)}
.calls ol{padding-left:20px;margin:8px 0} .calls ol li{margin:6px 0}
.cbanner{background:#7a4b00;color:#fff;padding:8px 18px;font-weight:600;font-size:14px;flex:none} .cbanner a{color:#fff;text-decoration:underline;margin-left:8px;white-space:nowrap}
.trl{display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line);font-size:14px} .trl .who{flex:none;width:86px;font-weight:700;font-size:12.5px}
.trl .who small{display:block;font-weight:400;color:var(--muted)} .trl.agent .who{color:var(--forest-2)} .trl.customer .who{color:var(--blue)}
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
      if(r.error) return msg.textContent = "Couldn't save: " + r.error.message;
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
      <a class="btn small" href="${TRACK}/pulse/calls/view/?id=${c.call_id}" target="_blank" rel="noopener">Open in Track</a><button class="btn small" id="cvx" aria-label="Close" title="Close" style="border-radius:50%;width:38px;padding:0">✕</button></div>
    <p class="muted" style="margin:8px 0">${[c.agents && "Agent: " + esc(c.agents), c.caller_name && "Caller: " + esc(c.caller_name), (c.caller_city || c.caller_state) && esc([c.caller_city, c.caller_state].filter(Boolean).join(", ")),
      c.call_result && "Result: " + esc(c.call_result), c.routing_result && esc(c.routing_result), c.queues && "Queue: " + esc(c.queues), "Talk " + dur(c.duration_s), c.hold_s ? "Hold " + dur(c.hold_s) : ""].filter(Boolean).join(" · ")}</p>
    <div id="cvt"><p class="muted">Loading the transcript…</p></div></div></div>`);
  $("#cvx").onclick = () => $("#callv").remove();
  $("#callv").onclick = e => { if(e.target.id === "callv") $("#callv").remove(); };
  if(!tr || tr.status !== "ok") return $("#cvt").innerHTML = `<p class="muted">${tr ? "Track has no transcript for this call (short calls, voicemail and calls that weren't recorded usually don't get one). The office computer checks again for 3 days after the call." : "Not checked yet. Transcripts are pulled within about 10 minutes of an upload."}</p>`;
  const r = await sb.from("track_call_transcripts").select("lines,engine,coverage,language,words").eq("call_id", c.call_id).maybeSingle();
  if(r.error || !r.data) return $("#cvt").innerHTML = `<p class="muted">Couldn't load: ${esc(r.error ? r.error.message : "not found")}</p>`;
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
    calls = await all(() => sb.from("track_calls").select("call_id,call_at,call_day,direction,duration_s,hold_s,agents,queues,call_result,routing_result,caller_name,caller_city,caller_state,outside_number,first_queue")
      .gte("call_day", S.from).lte("call_day", S.to).order("call_at", { ascending:false }));
    const lo = calls.length ? Math.min(...calls.map(c => c.call_id)) : 0;
    trs = await all(() => sb.from("track_call_transcripts").select("call_id,status,words").gte("call_id", lo));
    mts = await all(() => sb.from("track_call_match").select("call_id,party,contact_name,vendor_name").gte("call_id", lo));
    nts = await all(() => sb.from("track_call_notes").select("call_id,guest_name:data->>guest_name").gte("call_id", lo));
  } catch(e){ return $("#cbody").innerHTML = `<div class="card"><p class="muted">Couldn't load: ${esc(e.message)}</p></div>`; }
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
    const list = calls.filter(c => (!S.agent || (c.agents || "").split(",").map(x => x.trim()).includes(S.agent)) && (!S.dir || dirName(c.direction) === S.dir)
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
        ${Object.entries(ag).sort((a, b) => b[1].n - a[1].n).map(([a, o]) => `<tr><td>${esc(a)}</td><td>${o.n}</td><td>${o.i}</td><td>${o.o}</td><td>${dur(Math.round(o.t / o.n))}</td><td>${o.tr}</td></tr>`).join("")}</table></div>
      <div class="card" style="overflow-x:auto"><b>Calls</b> <span class="muted">· click a call for its transcript${S.q ? ` · searching ${esc(dayf(S.from))} to ${esc(dayf(S.to))}, set From earlier to search older calls` : ""}</span><table><tr><th>When</th><th>Direction</th><th>Agent</th><th class="hide-s">Caller</th><th>Result</th><th class="hide-s">Queue</th><th>Talk</th><th>Transcript</th></tr>
        ${list.slice(0, 500).map(c => `<tr class="cl" data-id="${c.call_id}"><td style="white-space:nowrap">${esc(dayf(c.call_at || c.call_day))}<br><span class="muted">${esc(timef(c.call_at))}</span></td><td>${esc(dirName(c.direction))}</td>
          <td>${esc(c.agents || "")}</td><td class="hide-s">${esc(who(c))}${MT[c.call_id] ? ` <span class="pill">${esc((PARTY[MT[c.call_id].party] || "").split(" (")[0])}</span>` : ""}${c.outside_number ? `<br><span class="muted">${esc(phonef(c.outside_number))}</span>` : ""}${c.caller_city || c.caller_state ? `<br><span class="muted">${esc([c.caller_city, c.caller_state].filter(Boolean).join(", "))}</span>` : ""}</td>
          <td>${esc(c.call_result || "")}${c.routing_result ? `<br><span class="muted">${esc(c.routing_result)}</span>` : ""}</td><td class="hide-s">${esc(c.queues || "")}</td><td>${dur(c.duration_s)}</td>
          <td>${has(c) ? `<span class="pill green">${T[c.call_id].words} words</span>` : T[c.call_id] ? `<span class="pill">none</span>` : `<span class="pill amber">pending</span>`}</td></tr>`).join("")}</table>
        ${list.length > 500 ? `<p class="muted">Showing the newest 500 of ${list.length}. Narrow the dates or filters to see the rest.</p>` : ""}</div>`;
    $("#cbody").querySelectorAll("tr.cl").forEach(tr => tr.onclick = () => { const c = calls.find(x => x.call_id === +tr.dataset.id); showCall(c, T[c.call_id]); });
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
    calls = await all(() => sb.from("track_calls").select("call_id,call_at,call_day,direction,agents,caller_name,caller_city,caller_state,outside_number,call_result,queues").gte("call_day", since).order("call_id", { ascending:false }));
    match = await all(() => sb.from("track_call_match").select("call_id,party,contact_id,stays_before,last_stay,reservation_id,res_arrive,res_depart,res_unit,booked_after,booked_after_on").gte("call_id", calls.length ? calls[calls.length - 1].call_id : 0));
    fus = await all(() => sb.from("track_call_followups").select("call_id,status,note,by_name,at").order("at", { ascending:false }));
  } catch(e){ return $("#fbody").innerHTML = `<div class="card"><p class="muted">Couldn't load: ${esc(e.message)}</p></div>`; }
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
    if(r.error){ b.disabled = false; return alert("Couldn't save: " + r.error.message); }
    followupsView(v); });
  $("#fbody").querySelectorAll("[data-call]").forEach(b => b.onclick = () => { const id = +b.dataset.call; showCall({ ...C[id], call_id:id }, { status:"ok" }); });
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
