/* desk-lic.js (Brandon 2026-10-28): Licensing round 2, kept out of desk.html so other desks' work there doesn't collide.
   desk.html calls window.MM_LIC(api) once and hooks in:
   - homes(): the ONE Track-based home list (hub table hub_homes, track_homes_sync.py) -> D.homes for every tab
   - fireOverlay(): Licensing ▸ Fire suppression saves (lic_fire) win over what Asana / Breezeway suggest
   - vFireSys(): Fire suppression tab (desk.html?only=firesys) · vLease(): Leases tab for L- homes (?only=lease)
   - newSection(): New properties on the Licensing page (lic_new_homes + homes Track added lately)
   - fireBlock(): a license can't be renewed without an up-to-date fire system, so license rows say so
   Tables are guarded in Supabase (hub_can('licensing'); Leases also hub_can('lease')); nothing here is the only lock. */
window.MM_LIC = function(A){
  var S = A.S, D = A.D, esc = A.esc;
  S.hubHomes = null; S.licFire = {}; S.licLease = {}; S.licNew = [];
  var NEW_DAYS = 120;   // "new in Track" window for New properties

  function sb(){ return window.MM_SB; }
  function load(){ var c = sb(); if(!c) return Promise.resolve();
    var lic = ["fire","firesys","lease"].indexOf(A.ONLY) >= 0;
    var jobs = [c.from("hub_homes").select("code,track_id,name,active,bookable,kind,community,address,city,postal,beds,baths,track_created").limit(5000)];
    if(lic) jobs.push(c.from("lic_fire").select("*").limit(5000), c.from("lic_lease").select("*").limit(5000),
                      c.from("lic_new_homes").select("*").eq("off", false).order("added_at", { ascending:false }).limit(500));
    return Promise.all(jobs).then(function(r){
      if(r[0] && !r[0].error && (r[0].data || []).length) S.hubHomes = r[0].data;
      if(lic){ S.licFire = {}; ((r[1] && r[1].data) || []).forEach(function(x){ S.licFire[x.code] = x; });
        S.licLease = {}; ((r[2] && r[2].data) || []).forEach(function(x){ S.licLease[x.code] = x; });
        S.licNew = (r[3] && r[3].data) || []; }
      A.derive(); A.render(); }).catch(function(){}); }

  /* ---- one home list: every active Track unit; the Asana profile when there is one, a plain card when there isn't (e.g. a new home) ---- */
  function homes(profiles, ALIAS, COMPANY){ if(!S.hubHomes) return null;
    var canon = function(c){ c = String(c || "").trim(); return ALIAS[c] || c; }, byCode = {};
    Object.keys(profiles).forEach(function(k){ var p = profiles[k]; if(p && p.code) byCode[canon(p.code)] = p; });
    var out = S.hubHomes.filter(function(h){ return h.active && h.kind !== "other"; }).map(function(h){ var c = canon(h.code), p = byCode[c];
      var base = p ? Object.assign({}, p, { active:true }) : { code:c, community:h.community || "", active:true, info:[], appliances:[], heatTape:"", yearBuilt:"", trackOnly:true };
      base.code = c; if(c !== h.code) base.trackCode = h.code; base.track = h; return base; });
    return out.concat([COMPANY]).sort(function(a, b){ return a.code.localeCompare(b.code, undefined, { numeric:true }); }); }
  function trackHome(code){ return (S.hubHomes || []).filter(function(h){ return h.code === code; })[0] || null; }

  /* ---- fire ---- */
  function fireOverlay(code, o){ var f = S.licFire[code]; if(!f) return o;
    if(f.has_system === "yes") o.has = true; else if(f.has_system === "no") o.has = false;
    if(f.last_inspection) o.last = f.last_inspection;
    o.exp = f.tag_expires || A.addYear(o.last); o.saved = f; return o; }
  function fireBlock(code, l){ var f = A.fireInfo(code); if(f.has !== true) return "";
    var fs = A.dueState(f.exp), lateBy = f.exp && l.exp && f.exp < l.exp;
    if(fs.k === "late" || fs.k === "none") return '<div class="note" style="color:var(--stop)">🔥 Fire system tag '+(fs.k === "none" ? "has no date" : "is out")+' — the license can\'t be renewed until it\'s current</div>';
    if(lateBy) return '<div class="note">🔥 Fire tag runs out '+esc(A.fmtD(f.exp))+', before this license</div>';
    return ""; }
  function vFireSys(){ var u = S.ui, flt = u.fsF || "due", hs = (D.homes || []).filter(function(h){ return !h.company; });
    var rows = hs.map(function(h){ var f = A.fireInfo(h.code); return { code:h.code, f:f, fs:A.dueState(f.exp), ls:A.licState(A.licInfo(h.code)), need:A.needsLicense(h.code) }; });
    var has = rows.filter(function(r){ return r.f.has === true; }), maybe = rows.filter(function(r){ return r.f.has == null && r.f.bwListed; });
    var unsaved = has.filter(function(r){ return !S.licFire[r.code]; }).map(function(r){ return r.code; });
    var cnt = function(k){ return has.filter(function(r){ return r.fs.k === k; }).length; };
    var show = (flt === "maybe" ? maybe : flt === "all" ? rows.filter(function(r){ return r.f.has !== false; }) : has)
      .filter(function(r){ return flt === "all" || flt === "maybe" || (flt === "due" ? (r.fs.k === "late" || r.fs.k === "soon" || r.fs.k === "none") : r.fs.k === flt); })
      .sort(function(a, b){ return (a.f.exp || "0000").localeCompare(b.f.exp || "0000") || a.code.localeCompare(b.code, undefined, { numeric:true }); });
    var chips = '<div class="chiprow">'+[["due","Expired, due in 60 days or no date"],["late","Expired"],["soon","Due soon"],["none","No date"],["ok","Up to date"],["maybe","Not sure ("+maybe.length+")"],["all","All"]].map(function(c){
      return '<button class="chip" data-fsf="'+c[0]+'" aria-pressed="'+(flt === c[0])+'">'+c[1]+'</button>'; }).join("")+'</div>';
    var h = '<div class="sechead"><h2>Fire suppression</h2><p>Homes with a fire suppression system and when each tag runs out (a year after the last Pye-Barker inspection unless you set a date). A license can\'t be renewed without a current tag. Edit a home to set it for good.</p>'+
      '<div class="lpills"><span class="pill">🔥 '+has.length+(has.length === 1 ? ' home has' : ' homes have')+' a system</span>'+(cnt("late")?'<span class="pill late">'+cnt("late")+' expired</span>':'')+(cnt("soon")?'<span class="pill soon">'+cnt("soon")+' due soon</span>':'')+(cnt("none")?'<span class="pill mute">'+cnt("none")+' no date</span>':'')+(cnt("ok")?'<span class="pill ok">'+cnt("ok")+' good</span>':'')+'</div>'+chips+'</div>';
    var fneed = show.filter(function(r){ return r.f.has === true && r.fs.k !== "ok" && !A.fireQ(r.code); }).map(function(r){ return r.code; });
    h += '<section class="panel"><div class="ph"><h3>'+show.length+' home'+(show.length === 1 ? '' : 's')+'</h3>'+
      (unsaved.length ? '<button class="btn sm" data-fsseed="'+esc(unsaved.join(","))+'" title="Asana / Breezeway say these homes have a system; save them here so the weekly alert covers them">Save '+unsaved.length+' found systems to this list</button>' : '')+
      (fneed.length ? '<button class="btn sm pri" data-fireall="'+esc(fneed.join(","))+'">Create '+fneed.length+' check tasks in Breezeway</button>' : '')+'</div>'+
      (show.length ? '<div class="appl" style="border:0;border-radius:0;max-height:70vh;overflow-y:auto"><table class="t"><thead><tr><th>Home</th><th>System</th><th>Last inspection</th><th>Tag</th><th>License</th><th></th></tr></thead><tbody>'+show.map(function(r){
        var src = r.f.saved ? 'Saved here'+(r.f.saved.updated_by ? ' by '+esc(r.f.saved.updated_by) : '') : r.f.tasks.length ? 'From Pye-Barker / Breezeway tasks' : r.f.why.length ? 'From Asana' : r.f.bwListed ? 'Listed on the Breezeway home page — check' : '';
        return '<tr><td><a href="./#/homes/'+encodeURIComponent(r.code)+'" target="_top">'+esc(r.code)+'</a></td><td>'+(r.f.has === true ? 'Yes' : r.f.has === false ? 'No' : '<span class="muted">not sure</span>')+(src ? '<div class="note">'+src+'</div>' : '')+(r.f.saved && r.f.saved.notes ? '<div class="note">'+esc(r.f.saved.notes)+'</div>' : '')+'</td>'+
          '<td class="mono">'+esc(r.f.last ? A.fmtD(r.f.last) : "—")+'</td><td>'+A.duePill(r.fs)+'</td><td>'+(r.need ? A.duePill(r.ls)+((r.fs.k === "late" || r.fs.k === "none") && r.f.has === true ? '<div class="note">Can\'t renew until the tag is current</div>' : '') : '<span class="muted">No license needed</span>')+'</td>'+
          '<td style="white-space:nowrap"><button class="btn sm ghost" data-fsedit="'+esc(r.code)+'">Edit</button> '+A.fireBtn(r.code)+bwFail(r.code)+'</td></tr>'; }).join("")+'</tbody></table></div>' : '<div class="empty">Nothing here.</div>')+
      '<div class="pad note">Yes = saved on this page, Asana says there\'s a system, or there are Pye-Barker / fire suppression tasks for the home. The Breezeway home page lists a fire suppression item on most homes by default, so on its own that only means "not sure". Homes come from the Track home list.</div></section>';
    return h; }
  /* fire_tasks.py (ThinkStation, every 30 min) sends the queued check to Breezeway; say why when it couldn't */
  function bwFail(code){ var q = (S.bwq || {})[String("fire_"+code).replace(/[^A-Za-z0-9_\-.~:@+]/g, "_")];
    return q && q.status === "failed" ? '<div class="note" style="white-space:normal">Didn\'t reach Breezeway: '+esc(q.note || "unknown")+'</div>' : ""; }
  function mFire(code){ var f = A.fireInfo(code), s = S.licFire[code] || {};
    A.openModal("Fire suppression · "+code, '<div class="fields">'+
      A.sel("fs_has", "Fire suppression system", [["yes","Yes"],["no","No"],["","Not sure"]], f.has === true ? "yes" : f.has === false ? "no" : "")+
      A.fld("fs_last", "Last inspection", f.last, "date")+A.fld("fs_exp", "Tag expires (blank = a year after the inspection)", s.tag_expires || "", "date")+'</div>'+
      '<label class="f"><span>Notes</span><textarea id="fs_notes">'+esc(s.notes || "")+'</textarea></label>',
      function(){ var row = { code:code, has_system:A.fv("fs_has") || null, last_inspection:A.fv("fs_last") || null, tag_expires:A.fv("fs_exp") || null, notes:A.fv("fs_notes") || null };
        return save("lic_fire", row, "code").then(function(ok){ if(ok){ A.toast("Saved"); A.closeModal(); } }); }, "Save"); }
  function seedFire(codes){ var rows = codes.map(function(c){ var f = A.fireInfo(c); return { code:c, has_system:"yes", last_inspection:f.last || null, notes:"Saved from "+(f.tasks.length ? "Pye-Barker / Breezeway tasks" : "Asana")+" on "+A.today() }; });
    if(!confirm("Save "+rows.length+" homes with a fire system to this list? You can edit any of them after.")) return;
    save("lic_fire", rows, "code").then(function(ok){ if(ok) A.toast(rows.length+" homes saved"); }); }

  /* ---- leases (L- homes) ---- */
  function vLease(){ var hs = (D.homes || []).filter(function(h){ return /^L-/i.test(h.code); });
    var rows = hs.map(function(h){ var l = S.licLease[h.code] || {}; return { code:h.code, h:h, l:l, st:A.dueState(l.expires) }; })
      .sort(function(a, b){ return (a.l.expires || "0000").localeCompare(b.l.expires || "0000") || a.code.localeCompare(b.code, undefined, { numeric:true }); });
    var c = function(k){ return rows.filter(function(r){ return r.st.k === k; }).length; };
    return '<div class="sechead"><h2>Leases</h2><p>Lease (L-) homes need a different kind of license than nightly rentals. Record what each one has and when it runs out. Homes come from the Track home list.</p>'+
      '<div class="lpills"><span class="pill">'+rows.length+' lease home'+(rows.length === 1 ? '' : 's')+'</span>'+(c("late")?'<span class="pill late">'+c("late")+' expired</span>':'')+(c("soon")?'<span class="pill soon">'+c("soon")+' due soon</span>':'')+(c("none")?'<span class="pill mute">'+c("none")+' nothing recorded</span>':'')+(c("ok")?'<span class="pill ok">'+c("ok")+' good</span>':'')+'</div></div>'+
      '<section class="panel">'+(rows.length ? '<div class="appl" style="border:0;border-radius:0"><table class="t"><thead><tr><th>Home</th><th>License</th><th>License #</th><th>Expires</th><th>Notes</th><th></th></tr></thead><tbody>'+rows.map(function(r){
        return '<tr><td><a href="./#/homes/'+encodeURIComponent(r.code)+'" target="_top">'+esc(r.code)+'</a><div class="note">'+esc(r.h.community || "")+'</div></td><td>'+esc(r.l.lic_kind || "—")+'</td><td class="mono">'+esc(r.l.lic_no || "—")+'</td>'+
          '<td>'+A.duePill(r.st)+(r.l.issued ? '<div class="note">Issued '+esc(A.fmtD(r.l.issued))+'</div>' : '')+'</td><td>'+esc(r.l.notes || "")+(r.l.updated_by ? '<div class="note">Saved by '+esc(r.l.updated_by)+'</div>' : '')+'</td>'+
          '<td><button class="btn sm ghost" data-lsedit="'+esc(r.code)+'">Edit</button></td></tr>'; }).join("")+'</tbody></table></div>' : '<div class="empty">No lease homes in Track.</div>')+'</section>'; }
  function mLease(code){ var l = S.licLease[code] || {};
    A.openModal("Lease license · "+code, '<div class="fields">'+A.fld("ls_kind", "License (what kind)", l.lic_kind)+A.fld("ls_no", "License #", l.lic_no)+
      A.fld("ls_iss", "Issued", l.issued, "date")+A.fld("ls_exp", "Expires", l.expires, "date")+'</div><label class="f"><span>Notes</span><textarea id="ls_notes">'+esc(l.notes || "")+'</textarea></label>',
      function(){ return save("lic_lease", { code:code, lic_kind:A.fv("ls_kind") || null, lic_no:A.fv("ls_no") || null, issued:A.fv("ls_iss") || null, expires:A.fv("ls_exp") || null, notes:A.fv("ls_notes") || null }, "code")
        .then(function(ok){ if(ok){ A.toast("Saved"); A.closeModal(); } }); }, "Save"); }

  /* ---- new properties ---- */
  var STEPS = [["setup","In Property Set Up"],["applied","License applied for"],["inspection","Waiting on inspection"],["licensed","Licensed"]];
  function stepName(k){ return (STEPS.filter(function(s){ return s[0] === k; })[0] || [k, k])[1]; }
  function newSection(){ var cut = A.addDays(A.today(), -NEW_DAYS), man = S.licNew, mc = {};
    man.forEach(function(n){ mc[n.code] = 1; });
    var fresh = (S.hubHomes || []).filter(function(h){ return h.active && h.kind === "nightly" && h.track_created && h.track_created >= cut && !mc[h.code]; })
      .sort(function(a, b){ return b.track_created.localeCompare(a.track_created); });
    var h = '<div class="sechead"><h2>New properties</h2><p>Licensing starts while a home is still in Property Set Up, often before it\'s in Track. Add it here; homes Track added in the last '+NEW_DAYS+' days show below on their own.</p>'+
      '<button class="btn sm pri" data-newadd="1">+ Add a home in set up</button></div>';
    h += '<section class="panel">'+(man.length ? '<div class="appl" style="border:0;border-radius:0"><table class="t"><thead><tr><th>Home</th><th>Step</th><th>License</th><th>Fire system</th><th>Notes</th><th></th></tr></thead><tbody>'+man.map(function(n){ var t = trackHome(n.code);
        return '<tr><td><b>'+esc(n.code)+'</b>'+(t && t.active ? ' <span class="pill ok">In Track</span>' : '')+'<div class="note">'+esc([n.address, n.county].filter(Boolean).join(" · "))+'</div></td>'+
          '<td><span class="pill '+(n.step === "licensed" ? "ok" : "soon")+'">'+esc(stepName(n.step))+'</span>'+(n.applied_on ? '<div class="note">Applied '+esc(A.fmtD(n.applied_on))+'</div>' : '')+'</td>'+
          '<td>'+esc(n.lic_kind || "—")+(n.lic_no ? '<div class="note mono">#'+esc(n.lic_no)+'</div>' : '')+(n.lic_exp ? '<div class="note">Expires '+esc(A.fmtD(n.lic_exp))+'</div>' : '')+'</td>'+
          '<td>'+(n.fire_needed === "yes" ? 'Yes' : n.fire_needed === "no" ? 'No' : '<span class="muted">not sure</span>')+'</td><td>'+esc(n.notes || "")+'<div class="note">Added by '+esc(n.added_by || "?")+'</div></td>'+
          '<td style="white-space:nowrap"><button class="btn sm ghost" data-newedit="'+esc(n.id)+'">Edit</button> <button class="btn sm ghost" data-newoff="'+esc(n.id)+'" title="Take it off this list (kept, not deleted)">Done</button></td></tr>'; }).join("")+'</tbody></table></div>'
        : '<div class="empty">No homes in set up on the list.</div>')+
      sheetOnly(mc)+
      (fresh.length ? '<div class="pad"><div class="lbl">New in Track (last '+NEW_DAYS+' days)</div><div class="lgrid">'+fresh.map(function(t){ var l = A.licInfo(t.code);
        return '<div class="lcard home"><div class="lh"><b>'+esc(t.code)+'</b>'+A.duePill(A.licState(l))+'</div><div class="note">Added to Track '+esc(A.fmtD(t.track_created))+(t.community ? ' · '+esc(t.community) : '')+'</div>'+
          '<div class="lrow"><span class="ql">License #</span><b>'+esc(l.no || "—")+'</b></div></div>'; }).join("")+'</div></div>' : '')+'</section><div style="height:14px"></div>';
    return h; }
  /* homes on Haylee's license sheets that aren't on (or are turned off) in Track: often a home still being set up (licenses_sync.py trackActive) */
  function sheetOnly(skip){ var f = (S.feeds.licenses || {}).homes || {};
    var hs = Object.keys(f).filter(function(c){ return f[c].trackActive === false && !skip[c] && !skip[f[c].sheetCode]; }).sort(function(a, b){ return a.localeCompare(b, undefined, { numeric:true }); });
    if(!hs.length) return "";
    return '<div class="pad"><div class="lbl">On a license sheet, not active in Track ('+hs.length+')</div><div class="note">Still being set up, or a home that left. Read from Haylee\'s Dropbox sheets.</div><div class="lgrid">'+hs.map(function(c){ var h = f[c], ex = h.lic.filter(function(e){ return e.exp; }).map(function(e){ return e.exp; }).sort()[0] || "",
        notes = h.lic.map(function(e){ return e.note; }).filter(Boolean).join(" · ");
      return '<div class="lcard home"><div class="lh"><b>'+esc(h.sheetCode || c)+'</b>'+A.duePill(A.dueState(ex))+'</div><div class="note">'+esc(h.county || "")+(h.sheetCode ? ' · Track: '+esc(c)+' (off)' : ' · off in Track')+'</div>'+
        (notes ? '<div class="note">'+esc(notes)+'</div>' : '')+'</div>'; }).join("")+'</div></div>'; }
  function mNew(id){ var n = S.licNew.filter(function(x){ return x.id === id; })[0] || { step:"setup" };
    A.openModal(id ? "New property · "+n.code : "Add a home in set up", '<div class="fields">'+A.fld("nh_code", "Home code (as it will be in Track)", n.code, "text", 'placeholder="PL 218"')+A.fld("nh_addr", "Address", n.address)+
      A.sel("nh_county", "County", [["","Not sure"],["Park City","Park City"],["Summit","Summit"],["Wasatch","Wasatch"],["Other","Other"]], n.county || "")+A.sel("nh_step", "Step", STEPS, n.step)+
      A.fld("nh_kind", "License (what kind)", n.lic_kind)+A.fld("nh_app", "Applied on", n.applied_on, "date")+A.fld("nh_no", "License #", n.lic_no)+A.fld("nh_exp", "License expires", n.lic_exp, "date")+
      A.sel("nh_fire", "Fire suppression system", [["","Not sure"],["yes","Yes"],["no","No"]], n.fire_needed || "")+'</div><label class="f"><span>Notes</span><textarea id="nh_notes">'+esc(n.notes || "")+'</textarea></label>',
      function(){ var code = A.fv("nh_code").trim().toUpperCase().replace(/\s+/g, " "); if(!code){ A.toast("Home code"); return; }
        var row = { code:code, address:A.fv("nh_addr") || null, county:A.fv("nh_county") || null, step:A.fv("nh_step"), lic_kind:A.fv("nh_kind") || null, applied_on:A.fv("nh_app") || null,
          lic_no:A.fv("nh_no") || null, lic_exp:A.fv("nh_exp") || null, fire_needed:A.fv("nh_fire") || null, notes:A.fv("nh_notes") || null };
        var p = id ? sb().from("lic_new_homes").update(row).eq("id", id) : sb().from("lic_new_homes").insert(row);
        return p.then(function(r){ if(r.error){ A.toast("Didn't save: "+r.error.message); return; } A.toast("Saved"); A.closeModal(); load(); }); }, "Save"); }

  function save(table, rows, key){ var c = sb(); if(!c){ A.toast("Sign in first"); return Promise.resolve(false); }
    return c.from(table).upsert(rows, { onConflict:key }).then(function(r){ if(r.error){ A.toast("Didn't save: "+r.error.message); return false; } load(); return true; }); }

  document.addEventListener("click", function(ev){ var t = ev.target.closest("[data-fsf],[data-fsedit],[data-fsseed],[data-lsedit],[data-newadd],[data-newedit],[data-newoff]"); if(!t) return;
    ev.preventDefault(); var d = t.dataset;
    if(d.fsf){ S.ui.fsF = d.fsf; A.render(); return; }
    if(d.fsedit) return mFire(d.fsedit);
    if(d.fsseed) return seedFire(d.fsseed.split(","));
    if(d.lsedit) return mLease(d.lsedit);
    if(d.newadd) return mNew("");
    if(d.newedit) return mNew(d.newedit);
    if(d.newoff){ if(!confirm("Take this home off the New properties list? It's kept, not deleted.")) return;
      sb().from("lic_new_homes").update({ off:true }).eq("id", d.newoff).then(function(r){ if(r.error) A.toast("Didn't save: "+r.error.message); else { A.toast("Off the list"); load(); } }); } });

  return { load:load, homes:homes, fireOverlay:fireOverlay, fireBlock:fireBlock, vFireSys:vFireSys, vLease:vLease, newSection:newSection };
};
