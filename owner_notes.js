/* owner_notes.js (2026-11-13, build list jg2 = Jeff's Owner Relations test log G2 + A5). SQL: hub_owner_notes.sql.
   One log per home of what the owner said. Used in 3 places:
   - Property Details (desk.html, inside the hub iframe): Owner notes box under the owner in the Quick view  -> OwnerNotes.html(code, render)
   - Owner Relations meeting cards about a home (meetings.js): last notes + "What did the owner say?"     -> OwnerNotes.meetBox(el, ctx)
   - Home page + bell (hub.html): calendar events with a home code in the title that ended                -> OwnerNotes.homeCard(el) / OwnerNotes.bell()
   Only people with the owner_notes section (owner_notes_ok) get anything; everyone else sees nothing and no hint (rule 3).
   A next step becomes a task for a person on the Owner Relations meeting (Home + bell + Slack DM when that's on). Nothing is deleted. */
(function(){
  if(window.OwnerNotes) return;
  const SB = () => window.MM_SB || (typeof sb !== "undefined" ? sb : null);
  const DESK = () => !!window.MM_SB;   // desk.html (Property Details) uses its own button classes
  const B = () => DESK() ? { p:"btn sm pri", g:"btn sm ghost" } : { p:"btn small primary", g:"btn small" };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const T0 = () => new Date().toLocaleDateString("en-CA", { timeZone:"America/Denver" });
  const addD = (s, n) => { const d = new Date(s + "T12:00"); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };
  const fmtD = s => s ? new Date(String(s).slice(0, 10) + "T12:00").toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }) : "";
  const fmtT = t => { if(!t) return ""; const h = +String(t).slice(0, 2), m = String(t).slice(3, 5); return ((h % 12) || 12) + (m !== "00" ? ":" + m : "") + (h < 12 ? " am" : " pm"); };
  const HOW = [["call", "📞 Call"], ["meeting", "🤝 Meeting"], ["in_person", "🏠 In person"], ["email", "✉️ Email"], ["text", "💬 Text"], ["other", "Other"]];
  const howL = k => (HOW.find(h => h[0] === k) || [k, k])[1];
  const nice = e => { const f = (window.top && window.top.niceErr) || window.niceErr; return f ? f(e) : ((e && e.message) || "Couldn't save."); };
  const first = n => String(n || "").split(" ")[0];
  const ST = { ok:null, okP:null, notes:{}, busy:{}, redraw:{}, people:null, asks:null, asksAt:0, homeEl:null };

  function css(){ if(document.getElementById("oncss")) return; const s = document.createElement("style"); s.id = "oncss";
    s.textContent = ".onotes{grid-column:1/-1}.onh{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}" +
      ".onrow{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--line-2,var(--line,#e1e7de))}.onrow:last-child{border-bottom:0}" +
      ".onm{font-size:13px}.ons{white-space:pre-wrap;margin:2px 0}.onn{font-size:13px;color:var(--accent-ink,#3c5f12);font-weight:600}.onn.done{color:var(--muted,#6b776f);font-weight:400}.onsrc{font-size:12px;color:var(--muted,#6b776f)}" +
      ".onov{position:fixed;inset:0;background:rgba(10,20,14,.45);z-index:10050;display:flex;align-items:flex-start;justify-content:center;padding:5vh 12px;overflow:auto}" +
      ".onpop{background:var(--card,var(--surface,#fff));color:var(--ink,#15201a);border:1px solid var(--line,#e1e7de);border-radius:16px;width:min(560px,100%);padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.25)}" +
      ".onph{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px}.onph b{font-size:18px}.onph .muted,.onpop .muted{color:var(--muted,#6b776f);font-size:13px}" +
      ".onf{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}.onf label{display:block;font-size:12.5px;color:var(--muted,#6b776f)}.onf .w{grid-column:1/-1}" +
      ".onf input,.onf select,.onf textarea{display:block;width:100%;box-sizing:border-box;margin-top:3px;font:inherit;font-size:14px;color:inherit;background:var(--card,var(--surface,#fff));border:1px solid var(--line,#cfd8cb);border-radius:10px;padding:8px 10px}" +
      ".onf textarea{min-height:110px;resize:vertical}.onacts{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}.onmsg{font-size:13px;margin-right:auto}.onmsg.bad{color:#b42318}" +
      ".onask{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line,#e1e7de)}.onask .b{display:flex;gap:6px;flex-wrap:wrap}" +
      "@media(max-width:560px){.onf{grid-template-columns:1fr}}";
    document.head.appendChild(s); }

  /* ---------- data ---------- */
  async function ok(){
    if(ST.ok !== null) return ST.ok;
    const c = SB(); if(!c) return false;   // not signed in yet: ask again next time
    if(!ST.okP) ST.okP = c.rpc("owner_notes_ok").then(r => (ST.ok = !r.error && r.data === true), () => { ST.okP = null; return false; });
    return ST.okP; }
  function load(key, home, text){
    if(ST.busy[key]) return ST.busy[key]; const c = SB(); if(!c) return Promise.resolve(null);
    ST.busy[key] = c.rpc("owner_notes_get", { p_home:home || null, p_text:text || null }).then(r => {
      ST.notes[key] = r.error ? { err:nice(r.error), notes:[] } : r.data; delete ST.busy[key];
      const f = ST.redraw[key]; if(f) try { f(); } catch(e){}
      return ST.notes[key]; }, () => { delete ST.busy[key]; return null; });
    return ST.busy[key]; }
  async function people(){ if(ST.people) return ST.people; const c = SB(); if(!c) return [];
    try { const r = await c.rpc("owner_note_people"); ST.people = r.data || []; } catch(e){ return []; } return ST.people; }

  /* ---------- the list ---------- */
  function rowHtml(n, home, compact){
    const meta = [`<b>${esc(fmtD(n.on))}</b>`, esc(howL(n.how)), n.with ? "with " + esc(n.with) : "", `<span class="onsrc">${esc(n.by || "")}</span>`].filter(Boolean).join(" · ");
    const nx = n.next ? `<div class="onn${n.task_done ? " done" : ""}">➜ Next: ${esc(n.next)}${n.next_who ? " · 👤 " + esc(first(n.next_who)) : ""}${n.next_due ? " · by " + esc(fmtD(n.next_due)) : ""}${n.task_done ? " · ✓ done" + (n.task_done_by ? " by " + esc(first(n.task_done_by)) : "") : ""}</div>` : "";
    const src = n.src_name ? `<div class="onsrc">From ${esc(n.src_name)}</div>` : "";
    const said = compact && n.said.length > 240 ? n.said.slice(0, 238).trim() + "…" : n.said;
    return `<div class="onrow"><div style="flex:1;min-width:0"><div class="onm">${meta}</div><div class="ons">${esc(said)}</div>${nx}${src}</div>` +
      (n.can_off && !compact ? `<button class="${B().g}" data-onx="off" data-id="${n.id}" data-key="${esc(home)}" title="Take this note off">✕</button>` : "") + `</div>`; }
  function listHtml(d, home, max, compact){
    const a = (d && d.notes) || [];
    if(!a.length) return `<div class="muted" style="font-size:13px;margin-top:4px">No owner notes yet. After a call, email or meeting, add what the owner said.</div>`;
    return a.slice(0, max).map(n => rowHtml(n, home, compact)).join("") +
      (a.length > max && !compact ? `<details><summary class="muted" style="cursor:pointer;font-size:13px;padding:4px 0">${a.length - max} older note${a.length - max === 1 ? "" : "s"}</summary>${a.slice(max).map(n => rowHtml(n, home)).join("")}</details>` : ""); }

  /* Property Details (desk.html quickView). Returns HTML now; loads once and calls redraw when the notes arrive. */
  function html(code, redraw){
    if(!code || /^moose/i.test(code)) return "";
    if(redraw) ST.redraw[code] = redraw;
    if(ST.ok === false) return "";
    if(ST.ok === null){ ok().then(v => { if(v) load(code, code); }); return ""; }
    const d = ST.notes[code];
    if(d === undefined){ load(code, code); return ""; }
    if(d === null || !d.home) return "";
    css();
    return `<div class="qv onotes"><div class="onh"><div class="qvh">📞 Owner notes</div><button class="${B().p}" data-onx="add" data-home="${esc(d.home)}">+ What did the owner say?</button></div>` +
      (d.err ? `<div class="hint">${esc(d.err)}</div>` : "") + listHtml(d, d.home, 3) + `</div>`; }

  /* ---------- the pop-up ---------- */
  async function ask(home, ctx){
    ctx = ctx || {}; css(); document.getElementById("onov")?.remove();
    let d = ST.notes[home] || ST.notes[ctx.key || ""] || {};
    const T = T0(), ppl = await people();
    if(!d.home) d = (await load(home, home)) || {};
    const orNote = d.or_meeting ? ", and on the Owner Relations meeting" : "";
    const o = document.createElement("div"); o.id = "onov"; o.className = "onov";
    o.innerHTML = `<div class="onpop" role="dialog" aria-label="What did the owner say?"><div class="onph"><div><b>📞 What did the owner say?</b><div class="muted">${esc(ctx.title && String(ctx.title).startsWith(home) ? ctx.title : home + (ctx.title ? " · " + ctx.title : ""))}</div></div><button class="${B().g}" data-onx="close" aria-label="Close">✕</button></div>
      <div class="onf"><label>When did you talk?<input type="date" id="on_on" max="${T}" value="${esc(ctx.on && ctx.on <= T ? ctx.on : T)}"></label>
        <label>How?<select id="on_how">${HOW.map(h => `<option value="${h[0]}"${(ctx.how || "call") === h[0] ? " selected" : ""}>${h[1]}</option>`).join("")}</select></label>
        <label class="w">Who did you talk to? (optional)<input id="on_with" maxlength="120" placeholder="e.g. Vicki, or Vicki + Tom"></label>
        <label class="w">What did the owner say? *<textarea id="on_said" maxlength="2000" placeholder="e.g. Fine with a 3-night minimum over Christmas. Wants the hot tub cover replaced before Dec 15.">${esc(ctx.said || "")}</textarea></label>
        <label class="w">Next step (optional)<input id="on_next" maxlength="500" placeholder="e.g. Send him the Christmas comps"></label>
        <label id="on_whol" style="display:none">Who does it?<select id="on_who"><option value="">No one yet</option>${ppl.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
        <label id="on_duel" style="display:none">By when?<input type="date" id="on_due" min="${T}" value="${addD(T, 3)}"></label>
        <div class="w muted" id="on_nxh" style="display:none">The next step becomes a task for that person (on their Home page and the bell${orNote}). It stays open until someone ticks it done.</div>
        <div class="w muted">No codes, card or bank numbers.</div></div>
      <div class="onacts"><span class="onmsg" id="on_msg"></span><button class="${B().g}" data-onx="close">Cancel</button><button class="${B().p}" data-onx="save">Save</button></div></div>`;
    o._ctx = Object.assign({}, ctx, { home });
    document.body.appendChild(o);
    o.addEventListener("click", e => { if(e.target === o && !o.querySelector("#on_said").value.trim()) o.remove(); });   // click outside closes only an empty form
    const nx = o.querySelector("#on_next"), show = () => { const v = !!nx.value.trim(); ["on_whol", "on_duel", "on_nxh"].forEach(i => o.querySelector("#" + i).style.display = v ? "" : "none"); };
    nx.oninput = show; o.querySelector("#on_said").focus(); }
  async function save(o){
    const c = SB(), x = o._ctx, g = i => o.querySelector(i).value.trim(), msg = o.querySelector("#on_msg"), btn = o.querySelector('[data-onx="save"]');
    if(g("#on_said").length < 2){ o.querySelector("#on_said").focus(); msg.className = "onmsg bad"; msg.textContent = "Type what the owner said."; return; }
    const next = g("#on_next");
    btn.disabled = true; msg.className = "onmsg"; msg.textContent = "Saving…";
    const r = await c.rpc("owner_note_add", { p_home:x.home, p_said:g("#on_said"), p_how:g("#on_how"), p_on:g("#on_on") || null, p_with:g("#on_with") || null,
      p_next:next || null, p_next_who:next ? (g("#on_who") || null) : null, p_next_due:next ? (g("#on_due") || null) : null, p_src:x.src || "home", p_ref:x.ref || null });
    btn.disabled = false;
    if(r.error){ msg.className = "onmsg bad"; msg.textContent = nice(r.error); return; }
    o.remove(); ST.asks = null;
    [x.home, x.key].filter(Boolean).forEach(k => { delete ST.notes[k]; load(k, x.home, k === x.home ? null : x.text); });
    if(typeof x.done === "function") try { x.done(); } catch(e){}
    if(ST.homeEl && document.body.contains(ST.homeEl)) homeCard(ST.homeEl); }

  /* ---------- Owner Relations meeting card (meetings.js) ---------- */
  /* ctx: { home, text, meet, day, item, title, ofb, redraw }. Fills el, or removes it when there's nothing to show (no home / no access). */
  async function meetBox(el, ctx){
    if(!el) return; if(!(await ok())){ el.remove(); return; }
    el.setAttribute("data-onbox", "1");
    const key = "m:" + (ctx.home || "") + "|" + (ctx.text || "");
    const draw = () => { const d = ST.notes[key]; if(!document.body.contains(el)) return; if(!d || !d.home){ el.remove(); return; } css();
      const h = d.home, n = (d.notes || []).length;
      el.innerHTML = `<div class="onh"><b>📞 What did the owner say?</b>${ctx.ofb ? "" : `<button class="${B().p}" data-onx="add" data-home="${esc(h)}" data-src="meeting">+ Add what the owner said</button>`}</div>` +
        (ctx.ofb ? `<p class="muted" style="font-size:12.5px;margin:2px 0 4px">The owner's answer you save above also goes on ${esc(h)}'s owner notes.</p>` : "") +
        listHtml(d, h, 3, true) + (n ? `<p style="margin:6px 0 0;font-size:13px"><a href="#/homes/${encodeURIComponent(h)}">${n > 3 ? "All " + n + " owner notes" : "Owner notes"} on ${esc(h)} ↗</a></p>` : "");
      el._ctx = { home:h, key, text:ctx.text, src:"meeting", ref:[ctx.meet, ctx.day, ctx.item].join("|"), title:ctx.title, how:"call", done:ctx.redraw }; };
    ST.redraw[key] = draw;
    if(ST.notes[key] === undefined) await load(key, ctx.home, ctx.text); else draw(); }

  /* ---------- Home page + bell: owner meetings on my calendar that ended ---------- */
  async function asks(force){
    if(!force && ST.asks && Date.now() - ST.asksAt < 60000) return ST.asks;
    if(!(await ok())) return []; const c = SB();
    try { const r = await c.rpc("owner_note_asks"); ST.asks = r.error ? [] : (r.data || []); ST.asksAt = Date.now(); } catch(e){ return []; }
    return ST.asks; }
  async function homeCard(el){
    if(!el) return; ST.homeEl = el; const a = await asks(true);
    if(!a.length){ el.innerHTML = ""; return; } css();
    el.innerHTML = `<div class="card"><b style="font-size:17px">📞 What did the owner say?</b><p class="muted" style="margin:4px 0 2px;font-size:13px">These owner meetings on your calendar are over. Save what the owner said on the home's page.</p>` +
      a.map((x, i) => `<div class="onask"><div><b>${esc(x.title)}</b><div class="muted" style="font-size:13px">${esc(fmtD(x.day))}${x.start ? " · " + esc(fmtT(x.start)) : ""} · ${esc(x.home)}</div></div>
        <div class="b"><button class="${B().p}" data-onx="ask" data-i="${i}">📞 What did the owner say?</button><button class="${B().g}" data-onx="skip" data-i="${i}">Not an owner meeting</button></div></div>`).join("") + `</div>`; }
  async function bell(){
    const a = await asks(); if(!a.length) return [];
    return [{ ic:"📞", t:a.length === 1 ? "What did the owner say? " + a[0].title : `What did the owners say? ${a.length} owner meetings`, s:a.slice(0, 2).map(x => x.title).join(" · ") + " · save it on the home", href:"#/home" }]; }

  /* ---------- clicks (capture, so the desk's own click handler never sees these) ---------- */
  document.addEventListener("click", async ev => {
    const b = ev.target.closest && ev.target.closest("[data-onx]"); if(!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const k = b.getAttribute("data-onx"), ov = b.closest(".onov");
    if(k === "close"){ ov && ov.remove(); return; }
    if(k === "save"){ if(ov) save(ov); return; }
    if(k === "add"){ const box = b.closest("[data-onbox]"), x = (box && box._ctx) || {};
      ask(b.getAttribute("data-home"), b.getAttribute("data-src") === "meeting" ? x : { src:"home" }); return; }
    if(k === "off"){ if(!confirm("Take this owner note off? It stays in the history for admins.")) return;
      const key = b.getAttribute("data-key"), r = await SB().rpc("owner_note_off", { p_id:+b.getAttribute("data-id"), p_why:null });
      if(r.error) return alert(nice(r.error)); delete ST.notes[key]; load(key, key); return; }
    const x = (ST.asks || [])[+b.getAttribute("data-i")]; if(!x) return;
    if(k === "ask") ask(x.home, { src:"calendar", ref:String(x.event), on:x.day, how:"meeting", title:x.title });
    if(k === "skip"){ b.disabled = true; const r = await SB().rpc("owner_note_skip", { p_event:x.event }); if(r.error){ b.disabled = false; return alert(nice(r.error)); }
      ST.asks = null; if(ST.homeEl) homeCard(ST.homeEl); }
  }, true);

  window.OwnerNotes = { ok, html, ask, meetBox, homeCard, bell };
})();
