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
  async function fetchAll(c){
    var out = [], from = 0;
    for(;;){
      var r = await sb.from(T).select("id,data").eq("collection", c).range(from, from + 499);
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
          sb.channel("desk-" + c + "-" + Math.random().toString(36).slice(2, 7))
            .on("postgres_changes", { event:"*", schema:"public", table:T, filter:"collection=eq." + c }, async function(p){
              var id = (p.new && p.new.id) || (p.old && p.old.id); if(!id) return;
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

  function gate(html){
    document.body.insertAdjacentHTML("afterbegin",
      '<div style="max-width:420px;margin:15vh auto;padding:0 18px;font-family:system-ui,sans-serif">' + html + '</div>');
  }

  async function boot(){
    var s = (await sb.auth.getSession()).data.session;
    if(!s){ gate('<h2>Maintenance Desk</h2><p>Sign in first.</p><p><a href="./?next=desk" style="font-weight:700">Go to sign in →</a></p>'); return; }
    var me = (await sb.rpc("my_desk_identity")).data;
    me = me && me[0];
    if(!me){ gate('<h2>Not on the list</h2><p>' + s.user.email + " isn't set up. Ask Brandon to add it.</p>"); return; }
    window.MM_ROLE = me.role;
    window.MM_ME = me;
    try{ localStorage.setItem("md_me", me.initials || ""); localStorage.setItem("md_seenhelp", "1"); }catch(e){}
    window.MMDB = { ready: function(){ return Promise.resolve(db); } };
    // run the desk
    var code = document.getElementById("deskcode").textContent;
    var el = document.createElement("script"); el.textContent = code; document.body.appendChild(el);
    // same header as the Claude artifact: show who is signed in instead of the name picker
    var who = document.querySelector("label.who");
    if(who){ who.innerHTML = '<span class="lbl">You</span><b style="padding:0 6px">' + me.name + "</b>"; }
    var hdr = document.querySelector("header.top");
    if(hdr){ hdr.insertAdjacentHTML("beforeend", '<a class="btn" href="./" title="Phone view">Phone view</a><button class="btn" id="mm_signout">Sign out</button>');
      document.getElementById("mm_signout").onclick = async function(){ await sb.auth.signOut(); location.href = "./"; }; }
    var st = document.createElement("style"); st.textContent = '[data-act="syncnow"]{display:none!important}'; document.head.appendChild(st);
  }
  boot();
})();
