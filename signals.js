/* signals.js — Reports ▸ Signals & actions (#/signals), admins only (Brandon 2026-10-29: "we want signals to do more than just adjust
   rates … proactively do stuff, like scheduling tasks or messaging employees … i want the tool to learn").
   Rules (hub_signal_rules) with their mode: Suggest = a Penny tip with a "✅ Do it" button, Auto = the hub does it by itself (only after
   an admin approves the exact message text), Off. Plus what the hub found and did (hub_signals), the log (hub_signal_log) and new rule
   ideas from Penny's pattern finder. Data: RLS hub_is_admin(); changes through signal_rule_set(). Uses hub.html's sb / $ / esc. */
(function(){
  const TL = { admin:"Admins", front_desk:"Front desk", office_manager:"Office managers", owner_relations:"Owner relations", maint_manager:"Maintenance manager", maint_crew:"Maintenance crew", hk_manager:"Housekeeping manager", licensing:"Licensing", leasing:"Leasing", track_review:"Track review" };
  const MODE = { suggest:["Suggest","blue"], auto:["Auto","green"], off:["Off",""] };
  const ST = { open:["Waiting for a tap","amber"], approved:["Doing it","blue"], done:["Done","green"], failed:["Failed","red"], dismissed:["Hidden",""], gone:["No longer true",""] };
  const day = s => s ? new Date(s).toLocaleDateString(undefined, { month:"short", day:"numeric" }) : "";
  const pill = (a) => `<span class="pill ${a[1] || ""}">${esc(a[0])}</span>`;

  window.signalsView = async function(v){
    v.innerHTML = `<div class="page wide"><p style="margin:0 0 6px"><a href="#/reports">← All reports</a></p><h2>Signals &amp; actions</h2>
      <p class="muted">The hub watches every desk's data and acts on what it finds. <b>Suggest</b>: the right person gets a tip on their Home with a <b>✅ Do it</b> button, and nothing happens until they tap it. <b>Auto</b>: the hub does it by itself and sends the Slack message you approved. A rule can only go to Auto after you approve its exact message text. The hub learns from every tap: a home and reason someone hides stays quiet for 60 days, a rule whose tips keep getting hidden gets stricter (logged below), and a rule people nearly always act on is marked <b>Ready for Auto</b>.</p>
      <div id="sgRules"><div class="card"><p class="muted">Loading…</p></div></div>
      <h3 style="margin:18px 0 6px">What the hub found</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><select id="sgF"><option value="active">Waiting or doing</option><option value="done">Done</option><option value="all">All (last 200)</option></select></div>
      <div id="sgList"></div>
      <h3 style="margin:18px 0 6px">New rule ideas from Penny</h3><p class="muted" style="margin:0 0 6px">Penny's pattern finder suggests rules from what keeps repeating. They do nothing until they're built. Ask Claude to build one you like.</p><div id="sgIdeas"></div>
      <details class="acc2" style="margin-top:14px"><summary>Change log</summary><div id="sgLog"></div></details></div>`;
    const load = async () => {
      const f = $("#sgF").value;
      let q = sb.from("hub_signals").select("id, rule_key, home, title, body, source, status, how, approved_by, approved_at, done_at, result, created_at, due").order("id", { ascending:false }).limit(200);
      if(f === "active") q = q.in("status", ["open", "approved", "failed"]); else if(f === "done") q = q.eq("status", "done");
      const [R, S, L, U] = await Promise.all([sb.from("hub_signal_rules").select("*").order("status").order("key"), q,
        sb.from("hub_signal_log").select("*").order("id", { ascending:false }).limit(60), sb.from("allowed_users").select("id, name")]);
      if(R.error){ $("#sgRules").innerHTML = `<div class="card"><p>Couldn't load: ${esc(R.error.message)}</p></div>`; return; }
      const who = Object.fromEntries((U.data || []).map(u => [u.id, u.name]));
      const rules = (R.data || []).filter(r => r.status === "live"), ideas = (R.data || []).filter(r => r.status === "idea"), title = Object.fromEntries((R.data || []).map(r => [r.key, r.title]));
      $("#sgRules").innerHTML = rules.map(r => { const s = r.stats || {};
        return `<div class="card" data-rk="${esc(r.key)}"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${pill(MODE[r.mode] || [r.mode])}<b style="font-size:16px;flex:1;min-width:200px">${esc(r.title)}</b>${s.ready_for_auto ? `<span class="pill green">Ready for Auto</span>` : ""}
          <select data-mode>${["suggest", "auto", "off"].map(m => `<option value="${m}"${m === r.mode ? " selected" : ""}${m === "auto" && !r.auto_text_ok_at ? " disabled" : ""}>${MODE[m][0]}${m === "auto" && !r.auto_text_ok_at ? " (approve the text first)" : ""}</option>`).join("")}</select></div>
          <p style="margin:6px 0"><b>When:</b> ${esc(r.what)}</p><p style="margin:6px 0"><b>Does:</b> ${esc(r.does)}</p>
          <p class="muted" style="font-size:13px;margin:6px 0">For: ${(r.teams || []).map(t => esc(TL[t] || t)).join(", ") || "—"} · Settings: ${esc(Object.entries(r.params || {}).map(([k, x]) => k.replace(/_/g, " ") + " " + x).join(" · "))} · Source: ${esc(r.source)}</p>
          <p class="muted" style="font-size:13px;margin:6px 0">Last 90 days: ${s.signals_90d ?? 0} found · ${s.done ?? 0} done · ${s.tapped ?? 0} tapped ✅ · ${s.tips_hidden ?? 0} hidden or 👎${s.act_rate != null ? ` · acted on ${Math.round(s.act_rate * 100)}%` : ""}${s.failed ? ` · ${s.failed} failed` : ""}</p>
          ${r.auto_text !== null || r.action !== "findings" ? `<details class="acc2"><summary>Auto message text${r.auto_text_ok_at ? ` (approved ${day(r.auto_text_ok_at)} by ${esc(who[r.auto_text_ok_by] || "?")})` : " (not approved yet)"}</summary>
            <p class="muted" style="font-size:12.5px;margin:4px 0">Sent by the Moose Hub bot as a Slack DM to the people above, only in Auto mode. {title}, {body}, {home}, {due} and {link} are filled in.</p>
            <textarea data-text style="width:100%;min-height:70px">${esc(r.auto_text || "")}</textarea>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px"><button class="btn small" data-save>Save text</button><button class="btn primary small" data-ok${r.auto_text ? "" : " disabled"}>✓ Approve this text</button><span class="muted" data-m></span></div></details>` : ""}</div>`; }).join("") || `<div class="card"><p>No rules yet.</p></div>`;
      $("#sgRules").querySelectorAll("[data-rk]").forEach(card => { const k = card.dataset.rk, m = () => card.querySelector("[data-m]") || {};
        const set = async (args, msg) => { const r = await sb.rpc("signal_rule_set", Object.assign({ p_key:k }, args));
          if(r.error){ const x = m(); x.textContent = "Couldn't save: " + r.error.message; if(!card.querySelector("[data-m]")) alert(r.error.message); return; } (m().textContent = msg); setTimeout(load, 900); };
        card.querySelector("[data-mode]").onchange = e => set({ p_mode:e.target.value }, "Saved ✓");
        const sv = card.querySelector("[data-save]"), ok = card.querySelector("[data-ok]");
        if(sv) sv.onclick = () => set({ p_auto_text:card.querySelector("[data-text]").value }, "Text saved — approve it before Auto ✓");
        if(ok) ok.onclick = () => set({ p_auto_text:card.querySelector("[data-text]").value, p_approve_text:true }, "Approved ✓"); });
      const L2 = S.data || [];
      $("#sgList").innerHTML = L2.length ? `<div class="card"><table class="small" style="width:100%"><tr><th style="text-align:left">Found</th><th style="text-align:left">Rule</th><th style="text-align:left">What</th><th style="text-align:left">Status</th><th style="text-align:left">Result</th></tr>${L2.map(s => { const res = s.result || {};
          return `<tr><td>${day(s.created_at)}</td><td>${esc(title[s.rule_key] || s.rule_key)}</td><td><b>${esc(s.title)}</b><details><summary class="muted">more</summary><p style="margin:4px 0">${esc(s.body)}</p><p class="muted" style="font-size:12px;margin:0">Source: ${esc(s.source)}</p></details></td>
            <td>${pill(ST[s.status] || [s.status])}${s.how === "tap" && who[s.approved_by] ? `<div class="muted" style="font-size:12px">tapped by ${esc(who[s.approved_by])} ${day(s.approved_at)}</div>` : s.how === "auto" ? `<div class="muted" style="font-size:12px">auto</div>` : ""}</td>
            <td>${res.url ? `<a href="${esc(res.url)}" target="_blank" rel="noopener">Breezeway task</a>` : res.finding ? "In Rates ▸ Findings" : ""}${res.slack ? `<div class="muted" style="font-size:12px">Slack: ${esc((res.slack.dm || []).join(", "))}</div>` : ""}${res.error ? `<div class="up" style="font-size:12px">${esc(res.error)}</div>` : ""}</td></tr>`; }).join("")}</table></div>`
        : `<div class="card"><p class="muted">Nothing here.</p></div>`;
      $("#sgIdeas").innerHTML = ideas.length ? ideas.map(r => `<div class="card"><b>${esc(r.title)}</b><p style="margin:6px 0"><b>When:</b> ${esc(r.what)}</p><p style="margin:6px 0;white-space:pre-wrap"><b>Does:</b> ${esc(r.does)}</p><p class="muted" style="font-size:12.5px;margin:0">For: ${(r.teams || []).map(t => esc(TL[t] || t)).join(", ") || "—"} · ${esc(r.source)}</p></div>`).join("")
        : `<div class="card"><p class="muted">No ideas yet. Penny suggests them when she looks for patterns (Reports ▸ Penny — patterns she noticed).</p></div>`;
      $("#sgLog").innerHTML = (L.data || []).map(l => `<p style="margin:4px 0;font-size:13px"><span class="muted">${new Date(l.at).toLocaleString()}</span> · ${esc(title[l.rule_key] || l.rule_key || "")}${l.signal_id ? ` #${l.signal_id}` : ""} · <b>${esc(l.what)}</b> · ${esc(l.who_name || "the hub")}${l.detail ? ` <span class="muted">${esc(JSON.stringify(l.detail).slice(0, 220))}</span>` : ""}</p>`).join("") || `<p class="muted">Nothing yet.</p>`;
    };
    $("#sgF").onchange = load;
    load();
  };
})();
