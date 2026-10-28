/* desk-shim.js — runs the original Maintenance Desk on Supabase.
   Gives the desk the same small database API it had in Claude (doc().set/get, collection().onSnapshot/where().get),
   backed by the desk_docs table, with live updates. Sign-in decides who you are and what you can see. */
(function(){
  "use strict";
  var C = window.MM_CONFIG;
  var sb = supabase.createClient(C.url, C.anonKey, { auth:{ persistSession:true, detectSessionInUrl:true, flowType:"implicit" } });
  window.MM_SB = sb;
  var T = "desk_docs";

  function snapOf(map){
    var docs = Object.keys(map).map(function(k){ var v = map[k]; return { id:k, exists:true, data:function(){ return v; } }; });
    return { docs:docs, size:docs.length, empty:!docs.length, forEach:function(f){ docs.forEach(f); } };
  }
  /* 2026-10-28 (Brandon: load fast): Property Details, Vendors and Licensing (?only=) skip the heavy Breezeway feeds - receipt
     pictures, photos, reports (~9 MB of the ~16.5 MB feeds) - until someone opens a job or another tab (MM_FEEDS_FULL).
     Every shared collection (edits, propedits, vendoredits...) still loads in full with live updates, so desks stay in sync. */
  var HEAVY = ["bw-rcpt-", "bw-photos-", "bw-reports-"];
  var isHeavy = function(id){ return HEAVY.some(function(p){ return String(id).indexOf(p) === 0; }); };
  var LAZY = !!new URLSearchParams(location.search).get("only"), heavyOn = !LAZY, heavyHooks = [];
  async function fetchAll(c, heavyOnly){
    var out = [], from = 0;
    for(;;){
      var q = sb.from(T).select("id,data").eq("collection", c);
      if(c === "feeds" && heavyOnly) q = q.or(HEAVY.map(function(p){ return "id.like." + p + "*"; }).join(","));
      else if(c === "feeds" && !heavyOn) HEAVY.forEach(function(p){ q = q.not("id", "like", p + "*"); });
      var r = await q.order("id").range(from, from + 499);
      if(r.error) throw r.error;
      out = out.concat(r.data || []);
      if(!r.data || r.data.length < 500) break;
      from += 500;
    }
    return out;
  }
  var db = {
    doc: function(path){
      var i = path.indexOf("/"), c = path.slice(0, i), id = path.slice(i + 1);
      return {
        set: async function(obj){
          var r = await sb.from(T).upsert({ collection:c, id:id, data:obj }, { onConflict:"collection,id", returning:"minimal" });
          if(r.error) throw new Error(/row-level security/i.test(r.error.message) ? "Your login can't change this" : r.error.message);
        },
        get: async function(){
          var r = await sb.from(T).select("id,data").eq("collection", c).eq("id", id).maybeSingle();
          if(r.error) throw r.error;
          return r.data ? { exists:true, id:id, data:function(){ return r.data.data; } } : { exists:false, id:id, data:function(){ return undefined; } };
        }
      };
    },
    collection: function(c){
      return {
        onSnapshot: function(cb, err){
          var cache = {}, t = 0;
          var emit = function(){ clearTimeout(t); t = setTimeout(function(){ cb(snapOf(cache)); }, 60); };
          fetchAll(c).then(function(rows){ rows.forEach(function(r){ cache[r.id] = r.data; }); emit(); })
                     .catch(function(e){ console.error(e); if(err) err(e); });
          if(c === "feeds" && !heavyOn) heavyHooks.push(function(){
            return fetchAll(c, true).then(function(rows){ rows.forEach(function(r){ cache[r.id] = r.data; }); emit(); }); });
          sb.channel("desk-" + c + "-" + Math.random().toString(36).slice(2, 7))
            .on("postgres_changes", { event:"*", schema:"public", table:T, filter:"collection=eq." + c }, async function(p){
              var id = (p.new && p.new.id) || (p.old && p.old.id); if(!id) return;
              if(c === "feeds" && !heavyOn && isHeavy(id)) return;   // picked up when the heavy feeds load
              var r = await sb.from(T).select("id,data").eq("collection", c).eq("id", id).maybeSingle();
              if(r.data) cache[id] = r.data.data; else delete cache[id];
              emit();
            }).subscribe();
          return function(){};
        },
        where: function(field, op, val){
          return { get: async function(){
            var q = sb.from(T).select("id,data").eq("collection", c);
            if(op === "array-contains") q = q.filter("data->" + field, "cs", JSON.stringify([val]));
            else if(op === "==") q = q.filter("data->>" + field, "eq", String(val));
            var r = await q.limit(1000); if(r.error) throw r.error;
            var m = {}; (r.data || []).forEach(function(x){ m[x.id] = x.data; }); return snapOf(m);
          } };
        }
      };
    }
  };

  var heavyP = null;
  window.MM_FEEDS_FULL = function(){ if(heavyOn) return heavyP || Promise.resolve(); heavyOn = true;
    heavyP = Promise.all(heavyHooks.map(function(f){ return f(); })).catch(function(e){ console.error(e); }); return heavyP; };

  function gate(html){
    document.body.insertAdjacentHTML("afterbegin",
      '<div style="max-width:420px;margin:15vh auto;padding:0 18px;font-family:system-ui,sans-serif">' + html + '</div>');
  }

  async function boot(){
    var s = (await sb.auth.getSession()).data.session;
    if(!s){ gate('<h2>Maintenance Desk</h2><p>Sign in first.</p><p><a href="./?next=desk" style="font-weight:700">Go to sign in →</a></p>'); return; }
    // 2-step sign-in: a password-only session reads nothing once the hub switch is on (hub_two_step.sql); finish it on the Hub
    try{ var lv = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data;
      if(lv.currentLevel !== "aal2" && (lv.nextLevel === "aal2" || (await sb.rpc("hub_two_step_mode")).data === "all")){
        gate('<h2>One more step</h2><p>Type the code from your authenticator app to finish signing in.</p><p><a href="hub.html" target="_top" style="font-weight:700">Go to the Moose Hub →</a></p>'); return; } }catch(e){}
    var me = (await sb.rpc("my_desk_identity")).data;
    me = me && me[0];
    if(!me){ gate('<h2>Not on the list</h2><p>' + s.user.email + " isn't set up. Ask Brandon to add it.</p>"); return; }
    window.MM_ROLE = me.role;
    // Moose Hub: Expenses & Time only for the maintenance manager + admins (RLS enforces it too)
    try{ window.MM_MONEY = !!(await sb.rpc("hub_can", { p_desk:"maint_money" })).data; }catch(e){ window.MM_MONEY = false; }
    var ONLY = new URLSearchParams(location.search).get("only") || "";
    if(ONLY) document.body.classList.add("only", "only-" + ONLY);
    if(ONLY) document.body.classList.add("locklook");   // Licensing, Vendors, Property Details = Moose Locks look (Brandon 2026-10-28)
    try{ if(window.top !== window) document.body.classList.add("inhub"); }catch(e){}
    window.MM_ME = me;
    try{ localStorage.setItem("md_me", me.initials || ""); localStorage.setItem("md_seenhelp", "1"); }catch(e){}
    window.MMDB = { ready: function(){ return Promise.resolve(db); } };
    // Slack from the desk goes out instantly through the slack-post function (admins only)
    if(me.role === "admin"){
      window.MM_SLK = { callTool: async function(server, tool, input){
        if(server === "Slack" && tool === "slack_send_message"){
          var r = await sb.functions.invoke("slack-post", { body:{ channel:input.channel_id, text:input.message, thread_ts:input.thread_ts || null } });
          if(r.error || !r.data || !r.data.ok) throw new Error((r.data && r.data.error) || (r.error && r.error.message) || "slack failed");
          return r.data;
        }
        if(server === "Dropbox") return { entries:[] };      // feeds arrive from the ThinkStation now
        throw new Error("not available here");
      } };
    }
    // run the desk
    var code = document.getElementById("deskcode").textContent;
    var el = document.createElement("script"); el.textContent = code; document.body.appendChild(el);
    // same header as the Claude artifact: show who is signed in instead of the name picker
    var brand = document.querySelector("header.top .brand");
    if(brand){ brand.insertAdjacentHTML("afterbegin", '<img class="mlogo" src="moose-logo.png" alt="">');
      var mk = brand.querySelector(".mk"); if(mk && ONLY) mk.textContent = ({homes:"Property Details", vendors:"Vendors", fire:"Licensing", firesys:"Fire suppression", lease:"Leases"})[ONLY] || mk.textContent; }
    var who = document.querySelector("label.who");
    if(who){ who.innerHTML = '<span class="lbl">You</span><b style="padding:0 6px">' + me.name + "</b>"; }
    var hdr = document.querySelector("header.top");
    if(hdr){ hdr.insertAdjacentHTML("beforeend", '<a class="btn" href="./" title="Phone view">Phone view</a><button class="btn" id="mm_signout">Sign out</button>');
      document.getElementById("mm_signout").onclick = async function(){ await sb.auth.signOut(); location.href = "./"; }; }
    var st = document.createElement("style"); st.textContent = '[data-act="syncnow"]{display:none!important}'; document.head.appendChild(st);
  }
  boot();
})();
