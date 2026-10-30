/* idle.js — 2026-10-30 (Brandon): sign out after 1 hour with no use of the hub.
   "Use" = a tap, click, key, scroll or mouse move on ANY Moose page open on this device (hub, desks inside it, Locks):
   the time is shared through localStorage, so working in one tab keeps the others signed in.
   2 minutes before, a bar says so; any tap keeps you in. Signs out THIS device only (scope local) — never other devices.
   A sign-out never touches a shift: clock in/out are server rows, so an open shift is still open after signing back in.
   The page you were on is kept, so signing back in returns there (e.g. Clock In / Clock Out). */
(function(){
  "use strict";
  var KEY = "mm_last_active", LIMIT = 60 * 60e3, WARN = 2 * 60e3, wrote = 0, sb = null, out = false, first = true;
  var get = function(){ try{ return +localStorage.getItem(KEY) || 0; }catch(e){ return 0; } };
  var bootLast = get();   // read before any tap on this page, so opening the page after hours away can't reset the clock
  // arriving from an emailed sign-in link = just signed in
  if(/access_token=|refresh_token=|[?&]code=|type=(magiclink|recovery|signup|invite)/.test(location.hash + location.search)){ bootLast = Date.now(); put(bootLast); }
  var put = function(t){ try{ localStorage.setItem(KEY, String(t)); }catch(e){} };
  function poke(){ var t = Date.now(); if(t - wrote > 10e3){ wrote = t; put(t); } hideBar(); }
  function listen(w){
    try{ ["pointerdown","keydown","wheel","touchstart","scroll","mousemove"].forEach(function(ev){ w.addEventListener(ev, poke, { capture:true, passive:true }); }); }catch(e){}
  }
  listen(window);
  // desks open inside the hub in same-site iframes: their taps count too
  document.addEventListener("load", function(e){ var f = e.target; if(f && f.tagName === "IFRAME"){ try{ listen(f.contentWindow); }catch(x){} } }, true);

  function bar(){ return document.getElementById("mmidlebar"); }
  function hideBar(){ var b = bar(); if(b) b.remove(); }
  function showBar(ms){
    var b = bar(), s = Math.max(0, Math.ceil(ms / 1000)), txt = "No use for almost an hour — you'll be signed out in " + (s > 60 ? Math.ceil(s / 60) + " minutes" : s + " seconds") + ". Tap anywhere to stay signed in.";
    if(!b){ b = document.createElement("div"); b.id = "mmidlebar"; b.setAttribute("role", "alert");
      b.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;max-width:560px;margin:0 auto;padding:12px 14px;border-radius:12px;background:#b5770a;color:#fff;font:600 14px/1.35 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.25);cursor:pointer";
      b.onclick = poke; document.body.appendChild(b); }
    b.textContent = txt;
  }
  async function signOut(){
    if(out || !sb) return; out = true; hideBar();
    try{ sessionStorage.setItem("mm_idle_out", "1"); }catch(e){}
    try{ await sb.auth.signOut({ scope:"local" }); }catch(e){}
    out = false;
  }
  async function check(){
    if(!sb) return;
    var s = null; try{ s = (await sb.auth.getSession()).data.session; }catch(e){}
    if(!s){ hideBar(); first = false; return; }
    var last = first ? bootLast : get(); first = false;
    if(!last){ put(Date.now()); return; }            // first load after this went live: start counting now, sign nobody out
    var idle = Date.now() - last;
    if(idle >= LIMIT) return signOut();
    if(idle >= LIMIT - WARN) showBar(LIMIT - idle); else hideBar();
  }
  window.MMIDLE = {
    // watch(supabaseClient): the top page runs the clock; pages inside the hub only report taps
    watch: function(client){
      if(window.top !== window) return;
      sb = client; check(); setInterval(check, 15e3);
      document.addEventListener("visibilitychange", function(){ if(!document.hidden) check(); });
    },
    // the sign-in screen calls this after a real sign-in (typing the password already counts, this makes it certain)
    signedIn: function(){ wrote = 0; poke(); },
    // shown once on the sign-in screen after an idle sign-out
    reason: function(){ try{ if(sessionStorage.getItem("mm_idle_out")){ sessionStorage.removeItem("mm_idle_out"); return "You were signed out after an hour with no use. Sign in again — if you're clocked in, you still are."; } }catch(e){} return ""; }
  };
})();
