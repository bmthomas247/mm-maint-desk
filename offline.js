/* offline.js - Moose Hub saved copy on this device (Brandon 2026-10-30: "lets do it, we can also cache the staffing hub too").
   Property Details and Staffing open fast with weak signal and still show with none.
   - Supabase reads (GET /rest/v1/..., and the read-only RPCs in READ) made while a page turns MMOFF.scope(true) on are saved here,
     ENCRYPTED (AES-GCM, a key made on this device that the page can use but never export), per signed-in person.
   - With a saved copy, a read waits WAIT ms for the network, then answers from the copy (the network answer still saves when it comes).
     No network at all = the copy. 401/403 from the server = never the copy (signed out / access taken away).
   - Saved copies older than MAX are never shown and get removed. Writes (clock in, edits, View owner lockout...) always need signal.
   - Wiped on Sign out, when the server ends the session (admin "Sign out everywhere" / lock out, next time the phone is online),
     and when someone else signs in on the device.
   - Also registers sw.js (keeps the page files, never data) so the hub itself opens with no signal.
   Loaded right after config.js by hub.html and desk.html; both pass MMOFF.fetch to supabase.createClient. */
(function(){
  "use strict";
  var DB = "mm_offline", MAX = 24 * 36e5, WAIT = 3000, UIDK = "mm_off_uid";
  var C = window.MM_CONFIG || {}, REST = String(C.url || "").replace(/\/$/, "") + "/rest/v1/";
  /* read-only RPCs that may be answered from the saved copy (anything else, e.g. clock_punch or home_owner_reveal, always goes to the server) */
  var READ = { hub_me:1, hub_my_desks:1, hub_my_prefs:1, hub_can:1, hub_can_post_news:1, hub_two_step_mode:1, lock_must_change_pw:1,
    my_performance:1, my_pto:1, my_desk_identity:1, home_quick:1, hub_home_alerts:1, hub_staff_directory:1, hub_can_add_job:1,
    home_insp_can_add:1, clock_people:1, overtime_watch:1, overtime_mine:1, hubstaff_exit_status:1, cal_office:1, cal_people:1, timeoff_calendar:1 };
  var scope = false, lastOk = 0, lastFail = 0, oldest = 0, dbp = null, keyp = null, weak = 0;   // weak: a read just had to use the copy
  var native = window.fetch.bind(window);

  function idb(){
    if(dbp) return dbp;
    dbp = new Promise(function(ok, no){
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function(){ var d = r.result; if(!d.objectStoreNames.contains("k")) d.createObjectStore("k"); if(!d.objectStoreNames.contains("r")) d.createObjectStore("r"); };
      r.onsuccess = function(){ var d = r.result; d.onversionchange = function(){ d.close(); dbp = null; }; ok(d); };
      r.onerror = function(){ dbp = null; no(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn){ return idb().then(function(d){ return new Promise(function(ok, no){
    var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s);
    t.oncomplete = function(){ ok(out && "result" in out ? out.result : out); }; t.onerror = t.onabort = function(){ no(t.error); }; }); }); }
  var get = function(store, k){ return tx(store, "readonly", function(s){ return s.get(k); }); };
  var put = function(store, k, v){ return tx(store, "readwrite", function(s){ s.put(v, k); }); };
  var del = function(store, k){ return tx(store, "readwrite", function(s){ s.delete(k); }); };

  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k, v){ try{ if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(e){} }

  /* the device key for this person; a different person on the device = start over */
  function key(uid){
    if(keyp && keyp.uid === uid) return keyp.p;
    var p = get("k", "key").then(function(v){
      if(v && v.uid === uid) return v.key;
      return (v ? wipeData() : Promise.resolve()).then(function(){
        return crypto.subtle.generateKey({ name:"AES-GCM", length:256 }, false, ["encrypt", "decrypt"]); })
        .then(function(k){ return put("k", "key", { uid:uid, key:k }).then(function(){ return k; }); });
    });
    keyp = { uid:uid, p:p }; p.catch(function(){ keyp = null; });
    return p;
  }
  function hash(s){ return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function(b){
    return Array.from(new Uint8Array(b)).map(function(x){ return x.toString(16).padStart(2, "0"); }).join(""); }); }
  function jwtSub(h){
    var a = (h.get("Authorization") || "").replace(/^Bearer\s+/i, "").split(".")[1]; if(!a) return null;
    try{ var j = JSON.parse(atob(a.replace(/-/g, "+").replace(/_/g, "/"))); return j.role === "authenticated" && j.sub ? j.sub : null; }catch(e){ return null; }
  }
  function save(id, uid, res, text){
    return key(uid).then(function(k){
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name:"AES-GCM", iv:iv }, k, new TextEncoder().encode(text)).then(function(ct){
        return put("r", id, { uid:uid, at:Date.now(), iv:iv, ct:ct, type:res.headers.get("content-type") || "application/json",
          range:res.headers.get("content-range") || "", status:res.status });
      });
    });
  }
  function load(id, uid){
    return get("r", id).then(function(v){
      if(!v || v.uid !== uid) return null;
      if(Date.now() - v.at > MAX){ del("r", id).catch(function(){}); return null; }
      return key(uid).then(function(k){ return crypto.subtle.decrypt({ name:"AES-GCM", iv:v.iv }, k, v.ct); })
        .then(function(b){ v.text = new TextDecoder().decode(b); return v; });
    }).catch(function(){ return null; });
  }
  function fromSaved(v){
    shown(v.at);
    var h = { "content-type":v.type, "x-mm-saved":String(v.at) }; if(v.range) h["content-range"] = v.range;
    return new Response(v.text, { status:v.status || 200, headers:h });
  }
  function track(p){ return p.then(function(r){ lastOk = Date.now(); return r; }, function(e){ lastFail = Date.now(); throw e; }); }

  /* An expired sign-in (phone away > 1 hour) makes supabase-js refresh first, and with no signal it retries for ~30 s before any read.
     With no signal (a network error, not a server answer) and a good saved copy, answer the refresh with this device's OWN stored
     session, marked to expire in 2 minutes: reads then go out (and fall back to the copy), and the real refresh runs again as soon
     as there is signal. Nothing new is granted: the server still refuses that old token. A server answer (any status) passes through. */
  var AUTHK = "sb-" + (function(){ try{ return new URL(C.url).hostname.split(".")[0]; }catch(e){ return ""; } })() + "-auth-token";
  function refresh(input, init){
    return native(input, init).then(function(r){ lastOk = Date.now(); return r; }, function(e){
      lastFail = Date.now();
      var cur = null; try{ cur = JSON.parse(lsGet(AUTHK) || "null"); }catch(x){}
      var sent = null; try{ sent = JSON.parse(init && init.body || "{}").refresh_token; }catch(x){}
      if(!cur || !cur.access_token || !sent || cur.refresh_token !== sent || jwtSub(new Headers({ Authorization:"Bearer " + cur.access_token })) !== lsGet(UIDK)) throw e;
      return has().then(function(h){
        if(!h) throw e;
        var now = Math.floor(Date.now() / 1000);
        return new Response(JSON.stringify({ access_token:cur.access_token, refresh_token:cur.refresh_token, token_type:"bearer",
          expires_in:120, expires_at:now + 120, user:cur.user }), { status:200, headers:{ "content-type":"application/json" } });
      });
    });
  }

  function mfetch(input, init){
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if(url.indexOf(String(C.url || "").replace(/\/$/, "") + "/auth/v1/token?grant_type=refresh_token") === 0) return refresh(input, init);
    if(url.indexOf(REST) !== 0) return native(input, init);
    var method = String((init && init.method) || "GET").toUpperCase();
    var rpc = url.indexOf(REST + "rpc/") === 0 ? url.slice(REST.length + 4).split("?")[0] : null;
    var readable = scope && (method === "GET" || (method === "POST" && rpc && READ[rpc]));
    if(!readable || !window.crypto || !crypto.subtle || !window.indexedDB) return track(native(input, init));
    var h = new Headers(init && init.headers), sub = jwtSub(h);
    if(sub && lsGet(UIDK) !== sub) lsSet(UIDK, sub);
    var uid = sub || lsGet(UIDK);   // an expired sign-in sends the public key; with no signal the copy is still this device's person
    if(!uid) return track(native(input, init));
    var body = init && typeof init.body === "string" ? init.body : "";
    return hash(uid + "|" + method + "|" + url + "|" + body + "|" + (h.get("Range") || "") + "|" + (h.get("Accept") || "")).then(function(id){
      return load(id, uid).then(function(saved){
        var t0 = Date.now();
        var net = track(native(input, init)).then(function(res){
          if(res.ok && sub) res.clone().text().then(function(t){ return save(id, uid, res, t); }).catch(function(){});   // only real sign-ins save
          if(Date.now() - t0 < 1500) weak = 0;   // a quick answer: signal is back
          return res;
        });
        if(!saved) return net;
        /* once one read had to use the copy, the next ones (for a minute) use it right away instead of each waiting WAIT ms;
           the network answer still comes in behind and refreshes the copy */
        var wait = Date.now() - weak < 60000 && rpc !== "hub_me" ? 0 : WAIT;   // who-am-I always gets its chance to hear "signed out"
        return new Promise(function(ok){
          var done = false, use = function(){ if(done) return; done = true; weak = Date.now(); ok(fromSaved(saved)); };
          var t = setTimeout(use, wait);
          net.then(function(res){ if(done) return; clearTimeout(t);
                     if(res.status >= 500) return use(); if(res.status === 401 || res.status === 403) weak = 0; done = true; ok(res); },   // 401/403 = the server said no: never the copy
                   function(){ clearTimeout(t); use(); });
        });
      });
    });
  }

  /* banner: "showing the copy saved at ..." (in the hub; the Property Details frame reports to it) */
  function shown(at){
    try{ var top = window.top; if(top !== window && top.MMOFF && top.MMOFF.shown) return top.MMOFF.shown(at); }catch(e){}
    if(!oldest || at < oldest) oldest = at;
    paint();
  }
  function paint(){
    if(!oldest || !document.body) return;
    var b = document.getElementById("offbar");
    if(!b){
      b = document.createElement("div"); b.id = "offbar";
      b.setAttribute("style", "display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 14px;margin:0;background:#fff4d6;color:#5a4300;border-bottom:1px solid #f0d58a;font:600 13.5px/1.35 system-ui,sans-serif");
      var w = document.querySelector(".mainwrap"), v = document.getElementById("view");
      if(w && v && v.parentNode === w) w.insertBefore(b, v); else document.body.insertBefore(b, document.body.firstChild);
    }
    var d = new Date(oldest), today = new Date().toDateString() === d.toDateString();
    var when = d.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" }) + (today ? "" : " " + d.toLocaleDateString([], { weekday:"short" }));
    b.innerHTML = "<span>📶 Weak or no signal: showing the copy saved on this phone at " + when + ". Changes need signal.</span>" +
      '<button type="button" style="margin-left:auto;font:inherit;padding:4px 10px;border-radius:8px;border:1px solid #d9b85a;background:#fff;cursor:pointer">↻ Try again</button>';
    b.querySelector("button").onclick = function(){ location.reload(); };
  }
  function reset(){ oldest = 0; var b = document.getElementById("offbar"); if(b) b.remove(); }

  function wipeData(){ keyp = null; return tx("r", "readwrite", function(s){ s.clear(); }).then(function(){ return tx("k", "readwrite", function(s){ s.clear(); }); }).catch(function(){}); }
  function wipe(){ lsSet(UIDK, null); reset(); return wipeData(); }
  /* any saved copy still good for the person last signed in here? */
  function has(){
    var uid = lsGet(UIDK); if(!uid || !window.indexedDB) return Promise.resolve(false);
    return tx("r", "readonly", function(s){ return s.getAll(); }).then(function(all){
      return (all || []).some(function(v){ return v.uid === uid && Date.now() - v.at <= MAX; }); }).catch(function(){ return false; });
  }
  /* no signal right now? (any answer from Supabase, even an error, means online) */
  function offline(){
    if(navigator.onLine === false) return Promise.resolve(true);
    var ac = new AbortController(), t = setTimeout(function(){ ac.abort(); }, WAIT);
    return native(String(C.url || "").replace(/\/$/, "") + "/auth/v1/health", { headers:{ apikey:C.anonKey || "" }, signal:ac.signal, cache:"no-store" })
      .then(function(){ clearTimeout(t); lastOk = Date.now(); return false; }, function(){ clearTimeout(t); lastFail = Date.now(); return true; });
  }
  /* sign-in expired + no signal + a good saved copy = open from the copy */
  function offlineReady(){ return has().then(function(h){ return h ? offline() : false; }); }
  function sweep(){ tx("r", "readwrite", function(s){ var c = s.openCursor(); c.onsuccess = function(){ var x = c.result; if(!x) return;
    if(Date.now() - x.value.at > MAX) x.delete(); x.continue(); }; }).catch(function(){}); }

  window.MMOFF = { fetch:mfetch, scope:function(on){ scope = !!on; }, wipe:wipe, has:has, offline:offline, offlineReady:offlineReady,
    isOff:function(){ return navigator.onLine === false || (lastFail > lastOk && Date.now() - lastFail < 120000); },
    shown:shown, reset:reset, MAX:MAX, WAIT:WAIT };

  if(window.indexedDB) setTimeout(sweep, 4000);
  if("serviceWorker" in navigator && window.top === window) try{
    window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
  }catch(e){}
})();
