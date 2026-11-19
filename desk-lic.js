/* desk-lic.js (Brandon 2026-10-28): Licensing round 2, kept out of desk.html so other desks' work there doesn't collide.
   desk.html calls window.MM_LIC(api) once and hooks in:
   - homes(): the ONE Track-based home list (hub table hub_homes, track_homes_sync.py) -> D.homes for every tab
   - fireOverlay(): Licensing ▸ Fire suppression saves (lic_fire) win over what Asana / Breezeway suggest
   - vFireSys(): Fire suppression tab (desk.html?only=firesys) · vLease(): Leases tab for L- homes (?only=lease)
   - newSection(): top of the Licensing page = Haylee's licensing work list (2026-11-18), see "Licensing work" below
   - feedFor(): license records kept in the hub (hub_licenses) stand in for the Dropbox sheet feed everywhere licInfo() is used
   - fireBlock(): a license can't be renewed without an up-to-date fire system, so license rows say so
   Tables are guarded in Supabase (hub_can('licensing'); Leases also hub_can('lease'); license records hub_licenses.sql); nothing here is the only lock. */
window.MM_LIC = function(A){
  var S = A.S, D = A.D, esc = A.esc;
  S.hubHomes = null; S.licFire = {}; S.licLease = {}; S.licNew = [];
  S.licRecs = []; S.licBy = {}; S.licMe = null; S.licNotes = []; S.licFiles = []; S.licSel = {}; S.licPsu = [];
  var NEW_DAYS = 120;   // "new in Track" window for New properties

  function sb(){ return window.MM_SB; }
  function isLicPage(){ return ["fire","firesys","lease"].indexOf(A.ONLY) >= 0; }
  function load(){ var c = sb(); if(!c) return Promise.resolve();
    var lic = isLicPage();
    var jobs = [c.from("hub_homes").select("code,track_id,name,active,bookable,kind,community,neighborhood,address,city,postal,beds,baths,track_created").limit(5000),
                c.from("hub_licenses").select("*").eq("off", false).limit(3000)];
    if(lic) jobs.push(c.from("lic_fire").select("*").limit(5000), c.from("lic_lease").select("*").limit(5000),
                      c.from("lic_new_homes").select("*").eq("off", false).order("added_at", { ascending:false }).limit(500),
                      c.rpc("lic_me"), c.from("hub_license_notes").select("*").eq("off", false).order("at", { ascending:false }).limit(3000),
                      c.from("hub_license_files").select("*").eq("off", false).limit(3000), c.rpc("lic_psu_homes"));
    return Promise.all(jobs).then(function(r){
      if(r[0] && !r[0].error && (r[0].data || []).length) S.hubHomes = r[0].data;
      setRecs(r[1]);
      if(lic){ S.licFire = {}; ((r[2] && r[2].data) || []).forEach(function(x){ S.licFire[x.code] = x; });
        S.licLease = {}; ((r[3] && r[3].data) || []).forEach(function(x){ S.licLease[x.code] = x; });
        S.licNew = (r[4] && r[4].data) || [];
        S.licMe = (r[5] && !r[5].error && r[5].data) || null;
        S.licNotes = (r[6] && !r[6].error && r[6].data) || []; S.licFiles = (r[7] && !r[7].error && r[7].data) || [];
        S.licPsu = (r[8] && !r[8].error && Array.isArray(r[8].data)) ? r[8].data : []; }
      A.derive(); A.render(); }).catch(function(){}); }
  /* after a save: only the licensing tables again */
  function loadLic(){ var c = sb(); if(!c) return Promise.resolve();
    return Promise.all([c.from("hub_licenses").select("*").eq("off", false).limit(3000),
      c.from("hub_license_notes").select("*").eq("off", false).order("at", { ascending:false }).limit(3000),
      c.from("hub_license_files").select("*").eq("off", false).limit(3000)]).then(function(r){
      setRecs(r[0]); if(r[1] && !r[1].error) S.licNotes = r[1].data || []; if(r[2] && !r[2].error) S.licFiles = r[2].data || [];
      A.derive(); A.render(); }).catch(function(){}); }
  function setRecs(res){ if(!res || res.error) return; S.licRecs = res.data || []; S.licBy = {};
    S.licRecs.forEach(function(r){ (S.licBy[r.code] = S.licBy[r.code] || []).push(r); });
    Object.keys(S.licBy).forEach(function(k){ S.licBy[k].sort(function(a, b){ return KORD.indexOf(a.kind) - KORD.indexOf(b.kind); }); }); }

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
  /* 2026-11-11 (Haylee #38): combo listings (ST 14 = ST 1 + ST 4, UM 3013 = UM 301 + UM 303) are licensed as their separate units */
  var LIC_SKIP = {"ST 14":1, "UM 3013":1};
  function vFireSys(){ var u = S.ui, flt = u.fsF || "due", hs = (D.homes || []).filter(function(h){ return !h.company && !LIC_SKIP[h.code]; });
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

  /* ---- new properties (2026-10-28 list; kept for any rows on it, new homes now come in as license records) ---- */
  var STEPS = [["setup","In Property Set Up"],["applied","License applied for"],["inspection","Waiting on inspection"],["licensed","Licensed"]];
  function stepName(k){ return (STEPS.filter(function(s){ return s[0] === k; })[0] || [k, k])[1]; }
  function oldNewSection(){ var cut = A.addDays(A.today(), -NEW_DAYS), man = S.licNew, mc = {};
    man.forEach(function(n){ mc[n.code] = 1; });
    var fresh = (S.hubHomes || []).filter(function(h){ return h.active && !LIC_SKIP[h.code] && h.kind === "nightly" && h.track_created && h.track_created >= cut && !mc[h.code]; })
      .sort(function(a, b){ return b.track_created.localeCompare(a.track_created); });
    var h = '<div class="sechead"><h2>New properties</h2><p>Licensing starts while a home is still in Property Set Up, often before it\'s in Track. Add it here; homes Track added in the last '+NEW_DAYS+' days show below on their own.</p>'+
      '<button class="btn sm pri" data-newadd="1">+ Add a home in set up</button></div>';
    h += '<section class="panel">'+manTable(man)+(man.length ? '' : '<div class="empty">No homes in set up on the list.</div>')+
      sheetOnly(mc)+
      (fresh.length ? '<div class="pad"><div class="lbl">New in Track (last '+NEW_DAYS+' days)</div><div class="lgrid">'+fresh.map(function(t){ var l = A.licInfo(t.code);
        return '<div class="lcard home"><div class="lh"><b>'+esc(t.code)+'</b>'+A.duePill(A.licState(l))+'</div><div class="note">Added to Track '+esc(A.fmtD(t.track_created))+(t.community ? ' · '+esc(t.community) : '')+'</div>'+
          '<div class="lrow"><span class="ql">License #</span><b>'+esc(l.no || "—")+'</b></div></div>'; }).join("")+'</div></div>' : '')+'</section><div style="height:14px"></div>';
    return h; }
  function manTable(man){ if(!man.length) return "";
    return '<div class="appl" style="border:0;border-radius:0"><table class="t"><thead><tr><th>Home</th><th>Step</th><th>License</th><th>Fire system</th><th>Notes</th><th></th></tr></thead><tbody>'+man.map(function(n){ var t = trackHome(n.code);
        return '<tr><td><b>'+esc(n.code)+'</b>'+(t && t.active ? ' <span class="pill ok">In Track</span>' : '')+'<div class="note">'+esc([n.address, n.county].filter(Boolean).join(" · "))+'</div></td>'+
          '<td><span class="pill '+(n.step === "licensed" ? "ok" : "soon")+'">'+esc(stepName(n.step))+'</span>'+(n.applied_on ? '<div class="note">Applied '+esc(A.fmtD(n.applied_on))+'</div>' : '')+'</td>'+
          '<td>'+esc(n.lic_kind || "—")+(n.lic_no ? '<div class="note mono">#'+esc(n.lic_no)+'</div>' : '')+(n.lic_exp ? '<div class="note">Expires '+esc(A.fmtD(n.lic_exp))+'</div>' : '')+'</td>'+
          '<td>'+(n.fire_needed === "yes" ? 'Yes' : n.fire_needed === "no" ? 'No' : '<span class="muted">not sure</span>')+'</td><td>'+esc(n.notes || "")+'<div class="note">Added by '+esc(n.added_by || "?")+'</div></td>'+
          '<td style="white-space:nowrap"><button class="btn sm ghost" data-newedit="'+esc(n.id)+'">Edit</button> <button class="btn sm ghost" data-newoff="'+esc(n.id)+'" title="Take it off this list (kept, not deleted)">Done</button></td></tr>'; }).join("")+'</tbody></table></div>'; }
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

  /* ================= Licensing work (2026-11-18, Jeff for Haylee: "easier to work through, add notes and become more automated") =================
     Every license is a hub record (hub_licenses.sql), first filled from Haylee's 4 Dropbox sheets. The top of the Licensing page is her work list:
     tiles (Do today, Renew soon, Waiting on the county, Inspections, New homes, No date, Owner / on hold, Good) -> cards grouped by license,
     tap a card = where it stands, dates, follow-up, notes, copies, history. Haylee + admins change records (lic_can_edit); anyone on the
     Licensing desk adds notes and copies (Haylee gets a bell tip for each one from someone else). */
  var KIND = { pc:{ label:"Park City business license", short:"Park City", grp:"Park City" },
    summit:{ label:"Summit County business license", short:"Summit", grp:"Summit County" },
    wasatch_clerk:{ label:"Wasatch County Clerk license", short:"Wasatch Clerk", grp:"Wasatch Clerk" },
    wasatch_health:{ label:"Wasatch Health Dept permit", short:"Wasatch Health", grp:"Wasatch Health Department" },
    other:{ label:"Other license", short:"Other", grp:"Other licenses" } };
  var KORD = ["pc","summit","wasatch_clerk","wasatch_health","other"];
  var LSTEP = [["need_apply","Need to apply","new"],["applied","Applied","new"],["fee_paid","Fee paid","new"],["insp_wait","Waiting on the county to schedule the inspection","new"],
    ["insp_sched","Inspection scheduled","new"],["insp_failed","Failed inspection","new"],["insp_passed","Passed inspection, waiting on the license","new"],
    ["renew_sent","Renewal submitted","renew"],["licensed","Licensed / renewed","renew"],
    ["bldg_hold","Waiting on the building / HOA","park"],["owner","Owner handles it","park"],["hold","On hold","park"],["stop","Not renewing","park"]];
  var STEP_DATE = { applied:"Applied on", fee_paid:"Paid on", insp_wait:"Asked on", insp_sched:"Inspection day", insp_failed:"Inspection day", insp_passed:"Passed on", renew_sent:"Sent on", licensed:"Licensed on" };
  var STEP_FU = { applied:14, fee_paid:14, insp_wait:7, insp_passed:14, renew_sent:21, insp_failed:3 };   // days until "follow up" (a suggestion, editable)
  var TILES = [["today","Do today"],["renew","Renew soon"],["waiting","Waiting on the county"],["insp","Inspections"],["newh","New homes"],["nodate","No date"],["park","Owner / on hold"],["good","Good"],["all","All"]];
  var FLD = { lic_no:"License #", expires:"Expires", paid:"Paid", step:"Where it stands", step_on:"Step date", follow_up:"Follow up", address:"Address", kind_other:"License name" };
  function lstepName(k){ return ((LSTEP.filter(function(s){ return s[0] === k; })[0]) || [k, k || ""])[1]; }
  function canEdit(){ return !!(S.licMe && S.licMe.edit); }
  function canNote(){ return !!(S.licMe && S.licMe.notes); }
  function hubOn(){ return S.licRecs.length > 0; }
  function recById(id){ id = +id; return S.licRecs.filter(function(r){ return r.id === id; })[0] || null; }
  function first(n){ return String(n || "").split(" ")[0]; }
  function daysTo(d){ return Math.round((Date.parse(d+"T12:00:00") - Date.parse(A.today()+"T12:00:00")) / 864e5); }
  function fmtTime(t){ try{ return new Date(t).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }); }catch(e){ return String(t || "").slice(0, 16); } }
  function kName(r){ return r.kind === "other" ? (r.kind_other || "Other license") : (KIND[r.kind] || KIND.other).short; }
  /* Freshdesk ticket numbers in a note become links (#106066 or ticket 106066) */
  function linky(s){ return esc(s).replace(/(#|ticket\s*#?\s*)(1\d{5})\b/gi, function(m, a, n){ return '<a href="https://moosemanagement.freshdesk.com/a/tickets/'+n+'" target="_blank" rel="noopener">'+m+'</a>'; }); }

  /* hub records -> the same shape as the Dropbox sheet feed, so licInfo / Property Details / the Licenses table all follow the hub */
  function feedFor(code){ var rs = (S.licBy[code] || []).filter(function(r){ return r.kind !== "other"; }); if(!rs.length) return null;
    var cty = rs.some(function(r){ return /^wasatch/.test(r.kind); }) ? "Wasatch" : rs.some(function(r){ return r.kind === "summit"; }) ? "Summit" : "Park City";
    return { hub:true, county:cty, sheetCode:(rs.filter(function(r){ return r.sheet_code; })[0] || {}).sheet_code, lic:rs.map(function(r){ var e = { kind:KIND[r.kind].label };
      if(r.lic_no) e.no = r.lic_no; if(r.expires) e.exp = r.expires; if(r.paid) e.paid = r.paid === "paid" ? "PAID" : "NOT PAID";
      if(r.step && r.step !== "licensed") e.note = lstepName(r.step)+(r.step_on ? " "+A.fmtD(r.step_on) : "");
      if(!e.exp && !e.note) e.note = "no date yet";
      return e; }) }; }

  /* the home's row on the Dropbox sheet right now, and whether it changed since the hub copy */
  function sheetEntry(r){ var h = ((S.feeds.licenses || {}).homes || {})[r.code]; if(!h) return null; var lab = (KIND[r.kind] || {}).label;
    return (h.lic || []).filter(function(e){ return e.kind === lab; })[0] || null; }
  function sheetChanged(r){ if(!r.sheet || r.virtual) return false; var e = sheetEntry(r); if(!e) return false;
    return ["no","exp","paid","note"].some(function(k){ return String(e[k] || "") !== String(r.sheet[k] || ""); }); }
  function sheetLine(e){ return e ? [e.no ? "License # "+e.no : "no license #", e.exp ? "expires "+A.fmtD(e.exp) : "no date", e.paid || "", e.note ? "note: "+e.note : ""].filter(Boolean).join(" · ") : "not on the sheet"; }
  function hubLine(r){ return [r.lic_no ? "License # "+r.lic_no : "no license #", r.expires ? "expires "+A.fmtD(r.expires) : "no date", r.paid === "paid" ? "PAID" : r.paid ? "NOT PAID" : ""].filter(Boolean).join(" · "); }

  /* Property Set Up (Launch Pad) homes, 2026-11-18 (lic_psu_homes, hub_licenses_psu.sql): being set up / for sale / leaving.
     Launch Pad keeps Haylee's sheet-style codes; the database maps them (codes). Haylee + admins only. */
  var PSU_LBL = { str:"🏗 Being set up", lease:"🏗 Lease being set up", sale:"🏷 For sale", off:"👋 Leaving Moose" };
  function psuOf(code){ return (S.licPsu || []).filter(function(j){ return (j.codes || []).indexOf(code) >= 0 || j.code === code; }); }
  function psuLine(r){ var ps = psuOf(r.code); if(!ps.length) return "";
    return ps.map(function(j){ var x = (PSU_LBL[j.kind] || "In Property Set Up")+" (Property Set Up"+(j.started ? ", since "+A.fmtD(j.started) : "")+")";
      if(j.insp_on && !(r.step === "insp_sched" && r.step_on === j.insp_on)) x += " · it has the county inspection on "+A.fmtD(j.insp_on)+(j.insp_done ? " (done)" : "");
      return x; }).join(" · "); }
  /* why a license is on the list, and which tile it belongs to */
  function cls(r){ var td = A.today(), s = r.step || "", e = r.expires, d = e ? daysTo(e) : null;
    if(r.virtual) return { g:"newh", why:r.psu ? "In Property Set Up · no license on file" : "No license on file", at:"" };
    var ps = psuOf(r.code), leaving = ps.some(function(j){ return j.kind === "off"; }), selling = ps.some(function(j){ return j.kind === "sale"; });
    if(leaving && s !== "stop") return { g:"today", why:"Leaving Moose — cancel the license, or mark it Not renewing", at:"" };
    var inprog = /^(applied|fee_paid|insp_wait|insp_sched|insp_passed|renew_sent|insp_failed)$/.test(s), park = /^(bldg_hold|owner|hold|stop)$/.test(s);
    if(r.follow_up && r.follow_up <= td) return { g:"today", why:r.follow_up === td ? "Follow up today" : "Follow-up was due "+A.fmtD(r.follow_up), at:r.follow_up };
    if(s === "insp_sched" && r.step_on && r.step_on < td) return { g:"today", why:"Inspection was "+A.fmtD(r.step_on)+" — how did it go?", at:r.step_on };
    if(s === "insp_failed") return { g:"today", why:"Failed inspection — set up the re-inspection", at:r.step_on || "" };
    if(selling && !park && e && d <= 60) return { g:"today", why:"For sale — "+(d < 0 ? "expired "+A.fmtD(e) : "renews "+A.fmtD(e))+": renew it, or let it go?", at:e };
    if(e && e < td && !inprog && !park) return { g:"today", why:"Expired "+A.fmtD(e), at:e };
    if(park) return { g:"park", why:lstepName(s), at:e || "" };
    if(s === "insp_sched") return { g:"insp", why:"Inspection "+(r.step_on ? A.fmtD(r.step_on) : "— date not set"), at:r.step_on || "9999" };
    if(s === "insp_wait") return { g:"insp", why:"Waiting on the county to schedule the inspection", at:r.follow_up || "9999" };
    if(inprog) return { g:"waiting", why:lstepName(s)+(r.step_on ? " "+A.fmtD(r.step_on) : "")+(r.follow_up ? " · follow up "+A.fmtD(r.follow_up) : ""), at:r.follow_up || "9999" };
    if(s === "need_apply") return { g:"newh", why:"Need to apply", at:"" };
    if(e && d <= 60) return { g:"renew", why:"Renew by "+A.fmtD(e)+" ("+d+" day"+(d === 1 ? "" : "s")+")", at:e };
    if(!e) return { g:"nodate", why:"No expiration date", at:"" };
    return { g:"good", why:"Good to "+A.fmtD(e), at:e }; }
  function guessKind(code){ var c = A.countyOf ? A.countyOf(code) : ""; return c === "Park City" ? "pc" : c === "Summit" ? "summit" : c === "Wasatch" ? "wasatch_clerk" : ""; }
  /* every license record + one "no license on file" card per active nightly Track home with no record at all */
  function items(){ var out = S.licRecs.filter(function(r){ return !r.off; }).map(function(r){ return { r:r, c:cls(r) }; });
    (D.homes || []).forEach(function(h){ if(h.company || LIC_SKIP[h.code] || !A.needsLicense(h.code) || S.licBy[h.code] || (h.trackCode && S.licBy[h.trackCode])) return;
      if(h.track && h.track.kind && h.track.kind !== "nightly") return;
      var v = { virtual:true, id:"v:"+h.code, code:h.code, kind:guessKind(h.code) || "other", psu:psuOf(h.code).length > 0 }; out.push({ r:v, c:cls(v) }); });
    var seen = {}; out.forEach(function(it){ seen[it.r.code] = 1; });
    (S.licPsu || []).forEach(function(j){ if(j.kind !== "str") return; (j.codes || [j.code]).forEach(function(c){ if(seen[c] || S.licBy[c]) return; seen[c] = 1;
      var v = { virtual:true, id:"v:"+c, code:c, kind:guessKind(c) || "other", psu:true }; out.push({ r:v, c:cls(v) }); }); });
    return out; }
  /* who wrote a note, short; notes copied from a sheet's NOTES column say so (their real date isn't known) */
  function noteWho(n){ return n.src === "import" && /^From the license sheet/.test(n.by_name || "") ? "Sheet note" : first(n.by_name) || "Note"; }
  function noteText(n){ return n.src === "import" ? String(n.note).replace(/^On the .*? sheet: /, "") : n.note; }
  function noteWhen(n){ return n.src === "import" && /^From the license sheet/.test(n.by_name || "") ? "" : A.fmtD(String(n.at).slice(0, 10)); }
  function lastNote(r){ return S.licNotes.filter(function(n){ return n.code === r.code && (!n.license_id || n.license_id === r.id); })[0] || null; }

  /* one license = one box; boxes run 4 across in ONE grid (no county breaks = no half-empty rows). Jeff 2026-11-18. */
  function shortPill(r){ var e = r.expires, st = A.dueState(e), cls = { late:"stop", soon:"waiting", ok:"done", none:"mute" }[st.k];
    /* short dates so the pill fits beside the home code: Jan 15 this year, 9/30/27 another year */
    var md = function(d){ try{ var x = new Date(d+"T12:00:00");
        return d.slice(0, 4) === A.today().slice(0, 4) ? x.toLocaleDateString(undefined, { month:"short", day:"numeric" }) : (x.getMonth() + 1)+"/"+x.getDate()+"/"+String(x.getFullYear()).slice(2); }catch(z){ return A.fmtD(d); } };
    var t = !e ? "No date" : st.k === "late" ? "Expired "+md(e) : st.k === "soon" ? "Due "+new Date(e+"T12:00:00").toLocaleDateString(undefined, { month:"short", day:"numeric" }) : "Good to "+md(e);
    return '<span class="pill '+cls+'">'+esc(t)+'</span>'; }
  function psuShort(r){ var j = psuOf(r.code)[0]; return j ? (PSU_LBL[j.kind] || "In Property Set Up")+(j.started ? " · "+A.fmtD(j.started) : "") : ""; }
  function card(it, ed){ var r = it.r, c = it.c, ln = r.virtual ? null : lastNote(r), sc = sheetChanged(r), meta = [], ps = psuShort(r);
    var tone = c.g === "today" ? "stop" : c.g === "renew" ? "wait" : c.g === "good" ? "go" : c.g === "park" ? "mute" : "info";
    if(r.lic_no) meta.push('License # <b class="mono">'+esc(r.lic_no)+'</b>');
    if(r.paid === "not_paid") meta.push('<span class="lwbad">not paid</span>');
    if(r.step && !/^(waiting|park|insp)$/.test(c.g) && r.step !== "licensed") meta.push(esc(lstepName(r.step))+(r.step_on ? ' '+esc(A.fmtD(r.step_on)) : ''));
    var lpd = psuOf(r.code).filter(function(j){ return j.insp_on && !(r.step === "insp_sched" && r.step_on === j.insp_on); })[0];
    if(lpd) meta.push('Property Set Up has the county on '+esc(A.fmtD(lpd.insp_on)));
    if(sc) meta.push('<span class="lwbad">Dropbox sheet changed</span>');
    var nt = ln ? noteText(ln) : "";
    return '<div class="lwc t-'+tone+(S.licSel[r.id] ? ' sel' : '')+'"'+(r.virtual ? '' : ' data-lwopen="'+r.id+'" tabindex="0" role="button" aria-label="Open '+esc(r.code)+' '+esc(kName(r))+'"')+'>'+
      '<div class="lwc1">'+(ed && !r.virtual ? '<label class="lwsel" title="Pick to change several at once"><input type="checkbox" data-lwsel="'+r.id+'"'+(S.licSel[r.id] ? ' checked' : '')+' aria-label="Pick '+esc(r.code)+'"></label>' : '')+
        '<b class="lwcode">'+esc(r.code)+'</b>'+(r.virtual ? '<span class="pill mute">No license</span>' : shortPill(r))+'</div>'+
      '<div class="lwc2"><span class="lwk k-'+esc(r.kind)+'">'+esc(kName(r))+'</span>'+(ps ? '<span class="lwk lwkpsu">'+esc(ps)+'</span>' : '')+'</div>'+
      '<div class="lwwhy">'+esc(c.why)+'</div>'+(meta.length ? '<div class="lwmeta">'+meta.join(' · ')+'</div>' : '')+
      (ln ? '<div class="lwnote" title="'+esc(nt)+'">💬 <b>'+esc(noteWho(ln))+'</b>'+(noteWhen(ln) ? ', '+esc(noteWhen(ln)) : '')+': '+linky(nt)+'</div>' : '')+
      '<div class="lwact">'+(r.virtual ? (ed ? '<button class="btn sm pri" data-lwstart="'+esc(r.code)+'|'+esc(guessKind(r.code))+'">+ Start a license</button>' : '') :
        '<button class="btn sm'+(ed && c.g !== "good" ? ' pri' : '')+'" data-lwopenb="'+r.id+'">'+(ed ? 'Update' : 'Open')+'</button>'+
        (ed && /^(today|renew|waiting)$/.test(c.g) ? '<button class="btn sm ghost" data-lwrenew="'+r.id+'">✓ Renewed</button>' : '')+
        (canNote() ? '<button class="btn sm ghost lwnb" data-lwnq="'+r.id+'" title="Add a note" aria-label="Add a note">📝</button>' : ''))+'</div></div>'; }

  function filtered(all){ var u = S.ui, q = String(u.lwQ || "").trim().toLowerCase();
    return all.filter(function(it){ var r = it.r;
      if(u.lwC && (KIND[r.kind] || KIND.other).grp !== u.lwC) return false;
      if(!q) return true;
      return [r.code, r.lic_no, r.sheet_code, kName(r), lstepName(r.step), it.c.why, psuLine(r)].join(" ").toLowerCase().indexOf(q) >= 0; }); }
  function listHtml(){ var u = S.ui, ed = canEdit(), tile = u.lwT || "today", all = filtered(items());
    var show = all.filter(function(it){ return tile === "all" || it.c.g === tile; });
    if(!show.length) return '<div class="lwempty">'+(tile === "today" ? "Nothing to do today. 🎉 Pick another tile above." : "Nothing here.")+'</div>';
    show.sort(function(a, b){ return KORD.indexOf(a.r.kind) - KORD.indexOf(b.r.kind) || String(a.c.at || "").localeCompare(String(b.c.at || "")) || a.r.code.localeCompare(b.r.code, undefined, { numeric:true }); });
    var ids = show.filter(function(it){ return !it.r.virtual; }).map(function(it){ return it.r.id; });
    return '<div class="lwtool"><span>'+show.length+' shown</span>'+(ed && ids.length > 1 ? '<button type="button" class="lwlink" data-lwselall="'+ids.join(",")+'">Pick all '+ids.length+'</button>' : '')+'</div>'+
      '<div class="lwgrid">'+show.map(function(it){ return card(it, ed); }).join("")+'</div>'; }
  function bulkHtml(){ var ids = Object.keys(S.licSel).filter(function(k){ return S.licSel[k]; }); if(!ids.length || !canEdit()) return "";
    return '<div class="lwbulk"><b>'+ids.length+' picked</b>'+
      '<select id="lwb_step" aria-label="Where it stands"><option value="">Where it stands…</option>'+LSTEP.map(function(s){ return '<option value="'+s[0]+'">'+esc(s[1])+'</option>'; }).join("")+'</select>'+
      '<label>Date <input type="date" id="lwb_on"></label><label>Follow up <input type="date" id="lwb_fu"></label>'+
      '<select id="lwb_paid" aria-label="Paid"><option value="">Paid?</option><option value="paid">Paid</option><option value="not_paid">Not paid</option></select>'+
      '<button type="button" class="btn sm pri" data-lwbapply="1">Change '+ids.length+'</button><button type="button" class="btn sm ghost" data-lwbclear="1">Clear</button></div>'; }
  function newNotesHtml(){ var me = (S.licMe || {}).name || "", cut = Date.now() - 7 * 864e5;
    var ns = S.licNotes.filter(function(n){ return n.src !== "import" && n.by_name !== me && Date.parse(n.at) > cut; }).slice(0, 6);
    if(!ns.length) return "";
    return '<div class="lwnew"><b>💬 New notes from the team (last 7 days)</b>'+ns.map(function(n){
      return '<button type="button" class="lwnr" data-lwnote-open="'+(n.license_id || "")+'" data-lwhome="'+esc(n.code)+'"><b>'+esc(n.code)+'</b> · '+esc(first(n.by_name))+', '+esc(fmtTime(n.at))+': '+esc(n.note.length > 160 ? n.note.slice(0, 160)+"…" : n.note)+'</button>'; }).join("")+'</div>'; }
  function workInner(){ var u = S.ui, ed = canEdit(), me = S.licMe || {}, tile = u.lwT || "today", all = filtered(items().filter(function(it){ return !u.lwC || (KIND[it.r.kind] || KIND.other).grp === u.lwC; }));
    var cnt = {}; TILES.forEach(function(t){ cnt[t[0]] = 0; }); all.forEach(function(it){ cnt[it.c.g] = (cnt[it.c.g] || 0) + 1; }); cnt.all = all.length;
    var grpCnt = {}; items().forEach(function(it){ var g = (KIND[it.r.kind] || KIND.other).grp; grpCnt[g] = (grpCnt[g] || 0) + 1; });
    var hi = ed && first(me.name) ? "Hi "+esc(first(me.name))+" — " : "";
    return '<div class="lwhead"><div class="lwtop"><div><h2>Licensing work</h2><p>'+hi+(cnt.today || 0)+' to do today · '+(cnt.renew || 0)+' renewal'+(cnt.renew === 1 ? '' : 's')+' in the next 60 days · '+(cnt.waiting || 0)+' waiting on the county.'+
        (ed ? ' Tap a card to update it; tick cards to change several at once.' : ' You can add notes and license copies; Haylee changes the records.')+'</p></div>'+
        (ed ? '<button type="button" class="lwadd" data-lwadd="1">+ Add a license</button>' : '')+'</div>'+
      '<div class="lwtiles">'+TILES.map(function(t){ return '<button type="button" class="lwt'+(tile === t[0] ? ' on' : '')+(t[0] === "today" && cnt.today ? ' hot' : '')+'" data-lwt="'+t[0]+'"><b>'+(cnt[t[0]] || 0)+'</b><span>'+esc(t[1])+'</span></button>'; }).join("")+'</div></div>'+
      '<div class="lwbar"><input type="search" id="lwq" placeholder="Find a home, license # or step" value="'+esc(u.lwQ || "")+'" aria-label="Find">'+
        ['', 'Park City', 'Summit County', 'Wasatch Clerk', 'Wasatch Health Department', 'Other licenses'].filter(function(g){ return !g || grpCnt[g]; }).map(function(g){
          return '<button type="button" class="lwpill'+((u.lwC || "") === g ? ' on' : '')+'" data-lwc="'+esc(g)+'">'+(g ? esc(g)+'<i>'+grpCnt[g]+'</i>' : 'All licenses')+'</button>'; }).join("")+'</div>'+
      newNotesHtml()+'<div id="lwlist">'+listHtml()+'</div><div id="lwbulkw">'+bulkHtml()+'</div>'; }
  function workSection(){ var mc = {}; S.licNew.forEach(function(n){ mc[n.code] = 1; });
    var so = sheetOnly(mc), man = manTable(S.licNew);
    return '<div class="lw" id="lwwrap">'+workInner()+'</div>'+
      (man ? '<section class="panel" style="margin-top:12px"><div class="ph"><h3>New properties (earlier list)</h3></div>'+man+'</section>' : '')+
      (so ? '<details class="panel lwfold"><summary>On a license sheet, not active in Track</summary>'+so+'</details>' : '')+'<div style="height:14px"></div>'; }
  function newSection(){ if(!hubOn()) return oldNewSection();
    ensureCss(); try{ return workSection(); }catch(e){ try{ console.error("licensing work", e); }catch(x){} return oldNewSection(); } }
  function redraw(){ var w = document.getElementById("lwwrap"); if(w) w.innerHTML = workInner(); else A.render(); }
  function redrawList(){ var l = document.getElementById("lwlist"), b = document.getElementById("lwbulkw"); if(l) l.innerHTML = listHtml(); if(b) b.innerHTML = bulkHtml(); }

  /* ---- talking to Supabase (rules in hub_licenses.sql) ---- */
  function rpc(fn, args){ var c = sb(); if(!c){ A.toast("Sign in first"); return Promise.resolve(null); }
    return c.rpc(fn, args).then(function(r){ if(r.error){ A.toast("Didn't save: "+(r.error.message || "try again")); return null; } return r; }); }

  /* ---- one license ---- */
  /* every Park City license runs to Sep 30, Summit to Jan 15, Wasatch Health to Dec 31 (all 125 dated records, 2026-11-18); Wasatch Clerk varies = a year on */
  var FIXED_END = { pc:"09-30", summit:"01-15", wasatch_health:"12-31" }, FIXED_NAME = { pc:"next Sep 30", summit:"next Jan 15", wasatch_health:"next Dec 31" };
  function nextExp(r){ var td = A.today(), from = r.expires && r.expires > td ? r.expires : td, md = FIXED_END[r.kind], x;
    if(md){ x = from.slice(0, 4)+"-"+md; if(x <= from) x = (+from.slice(0, 4) + 1)+"-"+md; return x; }
    x = r.expires || td; do { x = A.addYear(x); } while(x <= td); return x; }
  var LSHORT = { insp_wait:"Waiting on county", insp_passed:"Passed inspection", bldg_hold:"Building / HOA", licensed:"Licensed" };
  var PATH = ["need_apply","applied","fee_paid","insp_wait","insp_sched","insp_passed","licensed"], OTHER = ["insp_failed","renew_sent","bldg_hold","owner","hold","stop"];
  function stepChips(r, ed){ var chip = function(k){ return '<button type="button" class="chip" data-lwstepc="'+k+'" aria-pressed="'+(r.step === k)+'" title="'+esc(lstepName(k))+'"'+(ed ? '' : ' disabled')+'>'+esc(LSHORT[k] || lstepName(k))+'</button>'; };
    return '<div class="lwpath" aria-label="Where it stands"><span class="lwor">Stage:</span>'+PATH.map(chip).join('<span class="lwar">›</span>')+'</div><div class="lwpath lwother"><span class="lwor">Or:</span>'+OTHER.map(chip).join("")+'</div>'; }
  function docsHtml(r){ var dd = (A.licDocs ? A.licDocs(r.code) : []) || [], hf = S.licFiles.filter(function(f){ return f.code === r.code; });
    var a = dd.map(function(x){ return '<a href="#" class="ldoc" data-ldoc="'+esc(x.path)+'" title="'+esc(x.name)+'">📄 '+esc(x.kind === "License" ? "License" : "Inspection")+(x.year ? ' '+x.year : '')+'</a>'; })
      .concat(hf.map(function(x){ return '<a href="#" class="ldoc" data-ldoc="'+esc(x.path)+'" title="Added by '+esc(x.by_name || "")+' '+esc(fmtTime(x.at))+'">📄 '+esc(x.kind === "License" ? "License" : x.kind)+(x.year ? ' '+x.year : '')+' · '+esc(x.name.length > 28 ? x.name.slice(0, 28)+"…" : x.name)+'</a>'; }));
    return a.length ? a.join("") : '<span class="muted">No copies yet.</span>'; }
  function notesHtml(code){ var ns = S.licNotes.filter(function(n){ return n.code === code; }), me = (S.licMe || {}).name || "";
    if(!ns.length) return '<div class="muted" style="padding:6px 0">No notes yet.</div>';
    return ns.map(function(n){ var lr = n.license_id ? recById(n.license_id) : null;
      return '<div class="lwn"><div>'+linky(n.note)+'</div><div class="lwnby">'+esc(n.by_name || "")+(noteWhen(n) ? ' · '+esc(n.src === "import" ? noteWhen(n) : fmtTime(n.at)) : '')+(lr ? ' · '+esc(kName(lr)) : '')+
        ((n.by_name === me || canEdit()) && n.src !== "import" ? ' · <button type="button" class="lwlink" data-lwnoff="'+n.id+'">Take off</button>' : '')+'</div></div>'; }).join(""); }
  function histHtml(rows){ if(!rows.length) return '<div class="muted">No changes yet.</div>';
    var v = function(f, x){ if(x == null || x === "") return "—"; if(f === "step") return lstepName(x); if(/^(expires|step_on|follow_up)$/.test(f)) return A.fmtD(x); if(f === "paid") return x === "paid" ? "Paid" : "Not paid"; return String(x); };
    return rows.map(function(h){ var what = h.action === "import" ? "Filled from the license sheet" : h.action === "add" ? "Added in the hub" : h.action === "off" ? "Taken off the list: "+((h.new || {}).why || "") : h.action === "on" ? "Put back on the list" :
      (h.fields || []).map(function(f){ return f === "sheet" ? "Sheet copy updated" : (FLD[f] || f)+": "+v(f, (h.old || {})[f])+" → "+v(f, (h.new || {})[f]); }).join(" · ");
      return '<div class="lwn"><div>'+esc(what)+'</div><div class="lwnby">'+esc(h.by_name || "")+' · '+esc(fmtTime(h.at))+'</div></div>'; }).join(""); }
  function mRec(id){ var r = recById(id); if(!r) return A.toast("That license isn't on the list any more");
    ensureCss(); var ed = canEdit(), sc = sheetChanged(r), fe = sheetEntry(r), ps = psuShort(r), nN = S.licNotes.filter(function(n){ return n.code === r.code; }).length,
      nC = ((A.licDocs ? A.licDocs(r.code) : []) || []).length + S.licFiles.filter(function(f){ return f.code === r.code; }).length;
    var lpd = psuOf(r.code).filter(function(j){ return j.insp_on; })[0];
    var body = '<div class="lwm"><div class="lwmhead"><span class="lwk">'+esc(r.kind === "other" ? (r.kind_other || "Other license") : KIND[r.kind].label)+'</span>'+shortPill(r)+
        (ps ? '<span class="lwk lwkpsu">'+esc(ps)+'</span>' : '')+(lpd ? '<span class="lwk lwkpsu">Property Set Up: county '+esc(A.fmtD(lpd.insp_on))+'</span>' : '')+
        '<a href="./#/homes/'+encodeURIComponent(r.code)+'" target="_top" class="lwplink">Property Details →</a></div>'+
      (sc ? '<div class="lwsheet"><b>The Dropbox sheet changed.</b> Sheet: '+esc(sheetLine(fe))+' · Hub: '+esc(hubLine(r))+
        (ed ? ' <button type="button" class="btn sm pri" data-lwsheet="use" data-id="'+r.id+'">Use the sheet\'s</button> <button type="button" class="btn sm ghost" data-lwsheet="keep" data-id="'+r.id+'">Keep the hub\'s</button>' : '')+'</div>' : '')+
      stepChips(r, ed)+'<input type="hidden" id="lw_step" value="'+esc(r.step || "")+'">'+
      '<div class="fields lwf">'+A.fld("lw_on", STEP_DATE[r.step] || "Date for this step", r.step_on, "date")+
        '<label class="f" for="lw_fu"><span>Follow up'+(ed ? '<i class="lwq"><button type="button" data-lwfu="3">3d</button><button type="button" data-lwfu="7">1w</button><button type="button" data-lwfu="14">2w</button><button type="button" data-lwfu="0" title="No follow-up">✕</button></i>' : '')+'</span>'+
          '<input id="lw_fu" type="date" value="'+esc(r.follow_up || "")+'"></label>'+A.fld("lw_no", "License #", r.lic_no)+
        '<label class="f" for="lw_exp"><span>Expires'+(ed ? '<i class="lwq"><button type="button" data-lwnext="'+esc(nextExp(r))+'" title="'+esc((FIXED_NAME[r.kind] || "a year on")+" · "+A.fmtD(nextExp(r)))+'">'+esc(FIXED_NAME[r.kind] || "+1 year")+'</button></i>' : '')+'</span>'+
          '<input id="lw_exp" type="date" value="'+esc(r.expires || "")+'"></label>'+
        A.sel("lw_paid", "Paid", [["","Not set"],["paid","Paid"],["not_paid","Not paid"]], r.paid || "")+'</div>'+
      (canNote() ? '<div class="lwtabs" role="tablist"><button type="button" role="tab" data-lwtab="notes" aria-selected="true">Notes ('+nN+')</button>'+
          '<button type="button" role="tab" data-lwtab="copies" aria-selected="false">Copies ('+nC+')</button><button type="button" role="tab" data-lwtab="hist" data-id="'+r.id+'" aria-selected="false">History</button></div>'+
        '<div class="lwpane" data-pane="notes"><div class="lwaddn"><textarea id="lw_nt" rows="1" placeholder="Add a note: what happened? Ticket numbers like #106066 become links."></textarea>'+
          '<button type="button" class="btn sm pri" data-lwnadd="'+r.id+'">Add note</button></div><div class="lwnl" id="lwnl">'+notesHtml(r.code)+'</div></div>'+
        '<div class="lwpane" data-pane="copies" hidden><div class="lwdocs" id="lwdocs">'+docsHtml(r)+'</div>'+
          '<div class="lwup"><input type="file" id="lw_file" accept=".pdf,image/*" aria-label="Pick a file"><select id="lw_fk" aria-label="What it is"><option>License</option><option>Inspection report</option><option>Other</option></select>'+
          '<input type="number" id="lw_fy" placeholder="Year" min="2000" max="2100" style="width:90px" aria-label="Year"><button type="button" class="btn sm" data-lwup="'+r.id+'">Upload</button></div></div>'+
        '<div class="lwpane" data-pane="hist" hidden><div id="lwhl" class="lwnl">Loading…</div></div>' : '')+'</div>';
    A.openModal(r.code+" · "+kName(r), body, ed ? function(){ var p = { step:A.fv("lw_step"), step_on:A.fv("lw_on"), follow_up:A.fv("lw_fu"), lic_no:A.fv("lw_no"), expires:A.fv("lw_exp"), paid:A.fv("lw_paid") };
        return rpc("lic_save", { p_id:r.id, p:p }).then(function(x){ if(!x) return; A.toast("Saved"); A.closeModal(); return loadLic(); }); } : null, "Save",
      ed ? '<button type="button" class="btn ghost" data-lwoff="'+r.id+'" style="margin-right:auto">Not renewing / take off</button>' : '');
    var m = document.getElementById("modal"); if(m){ m.classList.add("wide"); m.scrollTop = 0; if(!ed) [].forEach.call(m.querySelectorAll(".fields input,.fields select"), function(x){ x.disabled = true; }); } }
  function refreshModal(r){ var nl = document.getElementById("lwnl"), dl = document.getElementById("lwdocs"); if(nl) nl.innerHTML = notesHtml(r.code); if(dl) dl.innerHTML = docsHtml(r); }
  function mRenew(id){ var r = recById(id); if(!r) return;
    A.openModal("Renewed · "+r.code+" · "+kName(r), '<div class="fields">'+A.fld("lw_rexp", "New expiration", nextExp(r), "date")+A.fld("lw_rno", "License #", r.lic_no)+
        A.sel("lw_rpaid", "Paid", [["paid","Paid"],["not_paid","Not paid"],["","Not set"]], "paid")+'</div><label class="f"><span>Note (optional)</span><textarea id="lw_rnt" placeholder="e.g. Renewal paid online, confirmation #…"></textarea></label>',
      function(){ var p = { step:"licensed", step_on:A.today(), follow_up:"", expires:A.fv("lw_rexp"), lic_no:A.fv("lw_rno"), paid:A.fv("lw_rpaid") }, nt = A.fv("lw_rnt");
        if(!p.expires){ A.toast("Pick the new expiration"); return; }
        return rpc("lic_save", { p_id:r.id, p:p }).then(function(x){ if(!x) return; return (nt ? rpc("lic_note_add", { p_code:r.code, p_license:r.id, p_note:nt }) : Promise.resolve(1)).then(function(){
          A.toast(r.code+" renewed — good to "+A.fmtD(p.expires)); A.closeModal(); return loadLic(); }); }); }, "Mark renewed"); }
  function mNoteQ(id){ var r = recById(id); if(!r) return;
    A.openModal("Note · "+r.code+" · "+kName(r), '<label class="f"><span>Note</span><textarea id="lw_qnt" placeholder="What happened? Ticket numbers like #106066 become links."></textarea></label>'+
      '<div class="note">Everyone on the Licensing desk sees notes'+(canEdit() ? '' : ', and Haylee gets a heads-up in her bell')+'. Leave door codes out.</div>',
      function(){ var nt = A.fv("lw_qnt"); if(!nt){ A.toast("Type a note first"); return; }
        return rpc("lic_note_add", { p_code:r.code, p_license:r.id, p_note:nt }).then(function(x){ if(!x) return; A.toast("Note added"); A.closeModal(); return loadLic(); }); }, "Add note"); }
  function mAdd(code, kind){ var codes = (D.homes || []).filter(function(h){ return !h.company; }).map(function(h){ return h.code; });
    A.openModal("Add a license", '<div class="fields">'+A.fld("la_code", "Home code", code || "", "text", 'list="la_codes" placeholder="PL 218" autocomplete="off"')+
        '<datalist id="la_codes">'+codes.map(function(c){ return '<option value="'+esc(c)+'">'; }).join("")+'</datalist>'+
        A.sel("la_kind", "License", [["","Pick one"]].concat(KORD.map(function(k){ return [k, KIND[k].label]; })), kind || "")+
        A.fld("la_other", "If other: what license", "")+A.sel("la_step", "Where it stands", [["need_apply","Need to apply"]].concat(LSTEP.filter(function(s){ return s[0] !== "need_apply"; }).map(function(s){ return [s[0], s[1]]; })), "need_apply")+
        A.fld("la_on", "Date for this step", "", "date")+A.fld("la_fu", "Follow up on", "", "date")+A.fld("la_no", "License #", "")+A.fld("la_exp", "Expires", "", "date")+A.fld("la_addr", "Address (optional)", "")+'</div>'+
      '<div class="note">A home still in Property Set Up can be added before it\'s in Track: type the code it will have.</div>',
      function(){ var p = { code:A.fv("la_code"), kind:A.fv("la_kind"), kind_other:A.fv("la_other"), step:A.fv("la_step"), step_on:A.fv("la_on"), follow_up:A.fv("la_fu"),
          lic_no:A.fv("la_no"), expires:A.fv("la_exp"), address:A.fv("la_addr") };
        if(!p.code || !p.kind){ A.toast("Type the home and pick the license"); return; }
        return rpc("lic_save", { p_id:null, p:p }).then(function(x){ if(!x) return; A.toast("Added"); A.closeModal(); return loadLic(); }); }, "Add"); }
  function mOff(id){ var r = recById(id); if(!r) return;
    A.openModal("Take off the list · "+r.code+" · "+kName(r), '<label class="f"><span>Why?</span><textarea id="lw_offwhy" placeholder="e.g. Owner left Moose, not renewing"></textarea></label><div class="note">It\'s kept (not deleted), with its notes and history. You can put it back later.</div>',
      function(){ var why = A.fv("lw_offwhy"); if(why.length < 2){ A.toast("Say why"); return; }
        return rpc("lic_off", { p_id:r.id, p_off:true, p_why:why }).then(function(x){ if(!x) return; A.toast("Taken off the list"); A.closeModal(); return loadLic(); }); }, "Take it off"); }
  function upload(r){ var f = document.getElementById("lw_file"), file = f && f.files && f.files[0], me = S.licMe || {};
    if(!file) return A.toast("Pick a file first"); if(file.size > 25 * 1024 * 1024) return A.toast("That file is over 25 MB"); if(!me.uid) return A.toast("Sign in again");
    var safe = function(s){ return String(s).replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_"); };
    var path = "hub/"+safe(r.code)+"/"+me.uid+"/"+Date.now()+"-"+safe(file.name).slice(-120), yr = +(A.fv("lw_fy") || 0) || null;
    A.toast("Uploading…");
    return sb().storage.from("license-docs").upload(path, file, { contentType:file.type || "application/octet-stream", upsert:false }).then(function(u){
      if(u.error){ A.toast("Didn't upload: "+u.error.message); return; }
      return rpc("lic_file_add", { p_code:r.code, p_license:r.id, p_path:path, p_name:file.name, p_kind:A.fv("lw_fk") || "License", p_year:yr, p_bytes:file.size }).then(function(x){
        if(!x) return; A.toast("Copy added"); f.value = ""; return loadLic().then(function(){ refreshModal(r); }); }); }); }
  /* Licenses table (desk.html vFire): Haylee gets Update instead of "Ask Haylee" */
  var GRP_KIND = { "Park City":"pc", "Summit":"summit", "Wasatch Clerk":"wasatch_clerk", "Wasatch Health Department":"wasatch_health" };
  function rowBtn(code, county){ var k = GRP_KIND[county], r = (S.licBy[code] || []).filter(function(x){ return !k || x.kind === k; })[0];
    return r ? '<button class="btn sm pri" data-lwopenb="'+r.id+'">Update</button>' : '<button class="btn sm ghost" data-lwstart="'+esc(code)+'|'+esc(k || guessKind(code))+'">+ Start a license</button>'; }

  var CSS_DONE = false;
  function ensureCss(){ if(CSS_DONE || document.getElementById("lwcss")) { CSS_DONE = true; return; } CSS_DONE = true;
    var s = document.createElement("style"); s.id = "lwcss"; s.textContent =
      '.lwhead{background:linear-gradient(135deg,#17300c 0%,#2f5212 55%,#4f7a1e 100%);color:#fff;border-radius:22px;padding:20px 22px 16px;margin-bottom:12px;box-shadow:0 8px 24px rgba(23,48,12,.18)}'+
      '.lwhead h2{margin:0;font-size:24px;font-weight:800;color:#fff}.lwhead p{margin:4px 0 0;color:rgba(255,255,255,.82);font-size:13.5px;max-width:820px}'+
      '.lwtop{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}'+
      '.lwadd{appearance:none;background:#c7e86b;color:#17300c;border:0;border-radius:999px;padding:9px 16px;font:inherit;font-weight:800;cursor:pointer}'+
      '.lwtiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;margin-top:14px}'+
      '.lwt{appearance:none;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:9px 12px;text-align:left;color:#fff;cursor:pointer;font:inherit}'+
      '.lwt b{display:block;font-size:24px;font-weight:800;line-height:1.1}.lwt span{font-size:12px;color:rgba(255,255,255,.85)}'+
      '.lwt.on{background:#fff;color:#17300c}.lwt.on span{color:#4a5a3a}.lwt.hot b{color:#ffcfc6}.lwt.on.hot b{color:#c8382b}'+
      '.lwbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:10px 12px;margin-bottom:12px}'+
      '.lwbar input[type=search]{flex:1 1 200px;width:auto;min-width:170px;border:1px solid var(--line);border-radius:999px;padding:8px 14px;background:var(--surface);color:var(--ink)}'+
      '.lwpill{appearance:none;border:1px solid var(--line);background:var(--surface-2);border-radius:999px;padding:6px 13px;font:inherit;font-weight:700;font-size:12.5px;cursor:pointer;color:var(--ink-2)}'+
      '.lwpill.on{background:#17300c;color:#fff;border-color:#17300c}.lwpill i{font-style:normal;opacity:.65;margin-left:5px}'+
      '.lwgh{display:flex;align-items:center;gap:8px;margin:16px 2px 8px;font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}'+
      '.lwgh span{background:var(--line);color:var(--ink-2);border-radius:999px;padding:1px 8px;letter-spacing:0}'+
      '.lwlink{appearance:none;border:0;background:none;padding:0;color:var(--go);font:inherit;font-weight:700;cursor:pointer;text-transform:none;letter-spacing:0;font-size:12.5px;text-decoration:underline}'+
      '.lwtool{display:flex;gap:10px;align-items:center;margin:2px 2px 8px;font-size:12.5px;color:var(--muted);font-weight:700}'+
      '.lwgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}'+
      '@media (max-width:1200px){.lwgrid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (max-width:820px){.lwgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:560px){.lwgrid{grid-template-columns:1fr}}'+
      '.lwc{display:flex;flex-direction:column;gap:6px;background:var(--surface);border:1px solid var(--line);border-left:5px solid var(--line-2);border-radius:16px;padding:12px 14px;cursor:pointer;box-shadow:var(--shadow);min-width:0;min-height:168px}'+
      '.lwc:hover{box-shadow:0 8px 20px rgba(23,48,12,.12)}.lwc:focus-visible{outline:3px solid #c7e86b}'+
      '.lwc.t-stop{border-left-color:var(--stop)}.lwc.t-wait{border-left-color:var(--wait)}.lwc.t-go{border-left-color:var(--go)}.lwc.t-info{border-left-color:var(--info)}.lwc.sel{background:var(--go-soft)}'+
      '.lwc1{display:flex;align-items:center;gap:4px 8px;min-width:0;flex-wrap:wrap}.lw .lwc1 .pill{margin-left:auto;white-space:nowrap;font-size:11.5px;padding:3px 8px}.lwcode{font-size:16px;white-space:nowrap}'+
      '.lwc2{display:flex;gap:5px;flex-wrap:wrap}'+
      '.lwk{font-size:11.5px;font-weight:700;background:var(--line-2);border-radius:999px;padding:2px 8px;color:var(--ink-2);white-space:nowrap}.lwk.lwkpsu{background:var(--info-soft);color:var(--info)}'+
      '.lwwhy{font-weight:700;font-size:14.5px;line-height:1.3}.lwmeta{font-size:12.5px;color:var(--muted);line-height:1.35}.lwbad{color:var(--stop);font-weight:700}'+
      '.lwnote{font-size:12.5px;background:var(--surface-2);border-radius:10px;padding:6px 9px;color:var(--ink-2);line-height:1.35;white-space:pre-line;overflow-wrap:anywhere}'+
      '.lwact{display:flex;gap:6px;align-items:center;margin-top:auto;padding-top:6px}.lw .lwact .btn{padding:0 10px!important;min-height:34px;font-size:13px;white-space:nowrap}.lw .lwact .lwnb{margin-left:auto;padding:0 9px!important}'+
      '.lwsel{display:inline-flex}.lwsel input{width:18px;height:18px;margin:0;cursor:pointer}'+
      '.lwbulk{position:sticky;bottom:10px;z-index:5;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#17300c;color:#fff;border-radius:16px;padding:10px 14px;margin-top:12px;box-shadow:0 8px 24px rgba(0,0,0,.25)}'+
      '.lwbulk label{display:inline-flex;gap:5px;align-items:center;font-size:12.5px}.lwbulk select,.lwbulk input{width:auto;border-radius:10px;border:0;padding:6px 8px;font:inherit;font-size:13px}'+
      '.lwnew{background:var(--info-soft);border:1px solid var(--line);border-radius:16px;padding:10px 14px;margin-bottom:12px}'+
      '.lwnr{display:block;width:100%;text-align:left;border:0;border-top:1px solid var(--line);background:none;padding:6px 0;cursor:pointer;color:var(--ink);font:inherit;font-size:13.5px}'+
      '.lwempty{padding:22px;text-align:center;color:var(--muted);background:var(--surface);border:1px dashed var(--line);border-radius:16px}'+
      '.lwfold{margin-top:12px;padding:0}.lwfold>summary{cursor:pointer;padding:12px 16px;font-weight:800}'+
      '#modal:has(> .lwm){max-width:1060px;max-height:calc(100vh - 32px);overflow:auto;padding:12px 18px;gap:6px}'+
      '#modal:has(> .lwm) .mhead{margin:-4px 0 0;padding:4px 0 6px}#modal:has(> .lwm) .modact{position:sticky;bottom:-12px;background:var(--surface);padding:8px 0;border-top:1px solid var(--line);z-index:2}'+
      '.lwm{display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-height:0}'+
      '.lwpane:not([hidden]){display:flex;flex-direction:column;flex:1 1 auto;min-height:0}'+
      '.lwmhead{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.lwplink{margin-left:auto;font-size:12.5px;color:var(--muted)}'+
      '.lwpath{display:flex;gap:4px;flex-wrap:wrap;align-items:center}.lwpath .chip{font-size:12.5px;padding:5px 10px}.lwar{color:var(--muted);font-weight:800}'+
      '.lwother{padding-top:2px}.lwor{font-size:12px;color:var(--muted);font-weight:700;margin-right:2px}'+
      '.lwpath .chip[aria-pressed=true]{background:#17300c;color:#fff;border-color:#17300c}'+
      '.lwf{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:8px!important;margin:0}@media (max-width:760px){.lwf{grid-template-columns:repeat(2,minmax(0,1fr))!important}}'+
      '.lwsp{margin-left:10px}'+
      '.lwtabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-top:4px}.lwtabs button{appearance:none;border:0;background:none;padding:8px 12px;font:inherit;font-weight:700;font-size:13.5px;color:var(--muted);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px}'+
      '.lwtabs button[aria-selected=true]{color:var(--ink);border-bottom-color:#4f7a18}'+
      '.lwpane .lwnl{flex:1 1 auto;min-height:70px;max-height:none;overflow:auto}'+
      '.lwq{font-style:normal;float:right;display:inline-flex;gap:2px;text-transform:none;letter-spacing:0}.lwq button{appearance:none;border:1px solid var(--line);background:var(--surface-2);color:var(--ink-2);border-radius:999px;padding:0 6px;font:inherit;font-size:11px;font-weight:700;cursor:pointer;line-height:17px}.lwq button:hover{background:var(--go-soft)}'+
      '.lwsheet{background:var(--wait-soft);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:13.5px}'+
      '.lwsg{margin:6px 0}.lwsg .lbl{display:block;margin-bottom:4px;font-size:11.5px}.lwsg .chip{font-size:12.5px;padding:6px 11px}'+
      '.lwsg .chip[aria-pressed=true],.lwfu .chip.on{background:#17300c;color:#fff;border-color:#17300c}'+
      '.lwfu{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:2px}.lwfu .chip{font-size:12px;padding:5px 10px}'+
      '.lwaddn{display:flex;gap:8px;align-items:center;margin:6px 0 2px}.lwaddn textarea{flex:1;min-height:38px;height:38px;resize:vertical}'+
      '.lwnl .lwn{border-top:1px solid var(--line);padding:8px 0;font-size:13.5px;overflow-wrap:anywhere}.lwnby{font-size:12px;color:var(--muted);margin-top:2px}'+
      '.lwdocs a{display:inline-block;margin:0 10px 6px 0}.lwup{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px}.lwup input[type=file]{width:auto;flex:1 1 200px}.lwup select{width:auto}'+
      '.lwhist{margin-top:12px}.lwhist>summary{cursor:pointer;font-weight:800;font-size:13px}'+
      '@media (max-width:640px){.lwtiles{grid-template-columns:repeat(3,minmax(0,1fr))}.lwt{padding:8px 9px}.lwt b{font-size:20px}.lwt span{font-size:11px}.lwhead{padding:16px 14px 12px}}';
    document.head.appendChild(s); }

  /* ---- clicks, typing, picking ---- */
  document.addEventListener("click", function(ev){
    if(ev.target.closest(".lwsel") || ev.target.closest('a[target="_blank"]')) return;   // the pick box has its own change handler; outside links just open
    var t = ev.target.closest("[data-lwt],[data-lwc],[data-lwadd],[data-lwstart],[data-lwopenb],[data-lwrenew],[data-lwnq],[data-lwselall],[data-lwbapply],[data-lwbclear],[data-lwnote-open],[data-lwstepc],[data-lwfu],[data-lwnext],[data-lwnadd],[data-lwnoff],[data-lwup],[data-lwoff],[data-lwsheet],[data-lwtab],[data-lwopen]");
    if(!t) return; var d = t.dataset;
    if(t.tagName === "A" || t.tagName === "BUTTON") ev.preventDefault();
    if(d.lwt){ S.ui.lwT = d.lwt; return redraw(); }
    if(d.lwc != null && t.classList.contains("lwpill")){ S.ui.lwC = d.lwc; return redraw(); }
    if(d.lwadd) return mAdd("", "");
    if(d.lwstart){ var sp = d.lwstart.split("|"); return mAdd(sp[0], sp[1] || ""); }
    if(d.lwopenb) return mRec(d.lwopenb);
    if(d.lwrenew) return mRenew(d.lwrenew);
    if(d.lwnq) return mNoteQ(d.lwnq);
    if(d.lwselall){ var ids = d.lwselall.split(","), all = ids.every(function(i){ return S.licSel[i]; }); ids.forEach(function(i){ S.licSel[i] = !all; }); return redrawList(); }
    if(d.lwbclear){ S.licSel = {}; return redrawList(); }
    if(d.lwbapply){ var pick = Object.keys(S.licSel).filter(function(k){ return S.licSel[k]; }).map(Number), p = {};
      if(A.fv("lwb_step")) p.step = A.fv("lwb_step"); if(A.fv("lwb_on")) p.step_on = A.fv("lwb_on"); if(A.fv("lwb_fu")) p.follow_up = A.fv("lwb_fu"); if(A.fv("lwb_paid")) p.paid = A.fv("lwb_paid");
      if(!Object.keys(p).length) return A.toast("Pick what to change first");
      if(!confirm("Change "+pick.length+" license"+(pick.length === 1 ? "" : "s")+"?")) return;
      return rpc("lic_bulk", { p_ids:pick, p:p }).then(function(x){ if(!x) return; A.toast(x.data+" changed"); S.licSel = {}; return loadLic(); }); }
    if(d.lwnoteOpen != null){ var nr = d.lwnoteOpen ? recById(d.lwnoteOpen) : (S.licBy[d.lwhome] || [])[0]; return nr ? mRec(nr.id) : A.toast("No license on file for "+d.lwhome); }
    if(d.lwstepc){ var inp = document.getElementById("lw_step"); if(!inp) return; var same = inp.value === d.lwstepc, was = inp.value; inp.value = same ? "" : d.lwstepc;
      [].forEach.call(document.querySelectorAll("[data-lwstepc]"), function(b){ b.setAttribute("aria-pressed", String(!same && b.dataset.lwstepc === d.lwstepc)); });
      var on = document.getElementById("lw_on"), lab = on && on.closest("label") && on.closest("label").querySelector("span"); if(lab) lab.textContent = STEP_DATE[inp.value] || "Date for this step";
      /* a new step gets today's date, except passed/failed right after "Inspection scheduled" (the inspection day is the right date) */
      if(!same && on && !(was === "insp_sched" && /^insp_(passed|failed)$/.test(d.lwstepc))) on.value = d.lwstepc === "insp_sched" || /^(owner|hold|stop|bldg_hold|need_apply)$/.test(d.lwstepc) ? "" : A.today();
      var fu = document.getElementById("lw_fu"); if(!same && fu && STEP_FU[d.lwstepc] && !fu.value) fu.value = A.addDays(A.today(), STEP_FU[d.lwstepc]);
      if(!same && fu && /^(licensed|stop)$/.test(d.lwstepc)) fu.value = "";
      return; }
    if(d.lwfu != null){ var f2 = document.getElementById("lw_fu"); if(f2) f2.value = +d.lwfu ? A.addDays(A.today(), +d.lwfu) : ""; return; }
    if(d.lwnext){ var e2 = document.getElementById("lw_exp"); if(e2) e2.value = d.lwnext; return; }
    if(d.lwnadd){ var r = recById(d.lwnadd), ta = document.getElementById("lw_nt"); if(!r || !ta) return; var nt = ta.value.trim(); if(!nt) return A.toast("Type a note first");
      t.disabled = true; return rpc("lic_note_add", { p_code:r.code, p_license:r.id, p_note:nt }).then(function(x){ t.disabled = false; if(!x) return; ta.value = ""; A.toast("Note added");
        return loadLic().then(function(){ refreshModal(r); }); }); }
    if(d.lwnoff){ if(!confirm("Take this note off? It's kept, not deleted.")) return;
      return rpc("lic_note_off", { p_id:+d.lwnoff }).then(function(x){ if(!x) return; A.toast("Note taken off"); return loadLic().then(function(){ var nb = document.querySelector("[data-lwnadd]"), mr = nb ? recById(nb.dataset.lwnadd) : null; if(mr) refreshModal(mr); }); }); }
    if(d.lwtab){ [].forEach.call(document.querySelectorAll("[data-lwtab]"), function(b){ b.setAttribute("aria-selected", String(b === t)); });
      [].forEach.call(document.querySelectorAll(".lwpane"), function(x){ x.hidden = x.dataset.pane !== d.lwtab; });
      if(d.lwtab === "hist" && !t.dataset.loaded){ t.dataset.loaded = "1"; sb().from("hub_licenses_log").select("*").eq("license_id", +d.id).order("at", { ascending:false }).limit(60).then(function(r){
        var el = document.getElementById("lwhl"); if(el) el.innerHTML = r.error ? '<div class="muted">Couldn\'t load the history.</div>' : histHtml(r.data || []); }); }
      return; }
    if(d.lwup){ var ur = recById(d.lwup); if(ur) upload(ur); return; }
    if(d.lwoff){ A.closeModal(); return mOff(d.lwoff); }
    if(d.lwsheet){ var sr = recById(d.id), e = sr && sheetEntry(sr); if(!sr) return;
      var p2 = d.lwsheet === "use" && e ? { lic_no:e.no || "", expires:e.exp || "", paid:/^paid/i.test(e.paid || "") ? "paid" : e.paid ? "not_paid" : "", sheet_ack:true } : { sheet_ack:true };
      return rpc("lic_save", { p_id:sr.id, p:p2 }).then(function(x){ if(!x) return;
        var noteP = d.lwsheet === "use" && e && e.note && e.note !== ((sr.sheet || {}).note || "") ? rpc("lic_note_add", { p_code:sr.code, p_license:sr.id, p_note:"On the sheet now: "+e.note }) : Promise.resolve(1);
        return noteP.then(function(){ A.toast(d.lwsheet === "use" ? "Took the sheet's" : "Kept the hub's"); A.closeModal(); return loadLic(); }); }); }
    if(d.lwopen) return mRec(d.lwopen); });
  document.addEventListener("change", function(ev){ var t = ev.target; if(!t || !t.dataset || !t.dataset.lwsel) return;
    S.licSel[t.dataset.lwsel] = t.checked; var c = t.closest(".lwc"); if(c) c.classList.toggle("sel", t.checked);
    var b = document.getElementById("lwbulkw"); if(b) b.innerHTML = bulkHtml(); });
  document.addEventListener("input", function(ev){ if(ev.target && ev.target.id === "lwq"){ S.ui.lwQ = ev.target.value; redrawList(); } });
  document.addEventListener("keydown", function(ev){ if(ev.key !== "Enter" && ev.key !== " ") return; var t = ev.target; if(t && t.classList && t.classList.contains("lwc") && t.dataset.lwopen){ ev.preventDefault(); mRec(t.dataset.lwopen); } });
  document.addEventListener("toggle", function(ev){ var t = ev.target; if(!t || !t.dataset || !t.dataset.lwhist || !t.open) return;
    sb().from("hub_licenses_log").select("*").eq("license_id", +t.dataset.lwhist).order("at", { ascending:false }).limit(60).then(function(r){
      var el = document.getElementById("lwhl"); if(el) el.innerHTML = r.error ? '<div class="muted">Couldn\'t load the history.</div>' : histHtml(r.data || []); }); }, true);

  return { load:load, homes:homes, fireOverlay:fireOverlay, fireBlock:fireBlock, vFireSys:vFireSys, vLease:vLease, newSection:newSection,
    feedFor:feedFor, canEdit:canEdit, hubOn:hubOn, rowBtn:rowBtn };
};
