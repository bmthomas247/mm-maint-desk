/* sw.js - Moose Hub page files on this device (Brandon 2026-10-30), registered by offline.js.
   Keeps ONLY the public page files below (the same files anyone can download from the site) so the hub and Property Details open
   with no signal. Never touches Supabase (data is saved, encrypted, by offline.js). Other pages on the site pass straight through.
   Page files: network first; after 3 s (or with no signal) the saved file. CDN libraries (exact versions): saved file first.
   To switch it off for everyone: push a sw.js whose activate step unregisters (see OFF below). */
var V = "mm-pages-1", WAIT = 3000, OFF = false;
var FILES = ["hub.html", "index.html", "desk.html", "desk-shim.js", "desk-lic.js", "moose-theme.css", "config.js", "offline.js", "moose-logo.png",
  "staffing.js", "calendar.js", "checks.js", "banners.js", "calls.js", "signals.js", "reservations.js", "analytics.js", "meetings.js"];
var CDN = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"];
var BASE = self.registration.scope;
var name = function(u){ return u.origin === new URL(BASE).origin ? u.pathname.slice(new URL(BASE).pathname.length) || "index.html" : null; };

self.addEventListener("install", function(e){
  self.skipWaiting();
  if(OFF) return;
  e.waitUntil(caches.open(V).then(function(c){
    return Promise.all(FILES.map(function(f){ return c.add(new Request(BASE + f, { cache:"reload" })).catch(function(){}); })
      .concat(CDN.map(function(u){ return c.add(u).catch(function(){}); })));
  }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return OFF || k !== V; }).map(function(k){ return caches.delete(k); })); })
    .then(function(){ return OFF ? self.registration.unregister() : self.clients.claim(); }));
});
self.addEventListener("fetch", function(e){
  var r = e.request; if(OFF || r.method !== "GET") return;
  var u = new URL(r.url);
  if(CDN.indexOf(r.url) > -1){
    e.respondWith(caches.match(r).then(function(hit){ return hit || fetch(r).then(function(res){
      if(res.ok){ var cp = res.clone(); caches.open(V).then(function(c){ c.put(r, cp); }); } return res; }); }));
    return;
  }
  var f = name(u); if(!f || FILES.indexOf(f) < 0) return;   // not one of ours: the browser handles it as before
  var key = BASE + f;
  e.respondWith(new Promise(function(ok){
    var done = false, saved = function(){ return caches.match(key); };
    var t = setTimeout(function(){ saved().then(function(hit){ if(hit && !done){ done = true; ok(hit); } }); }, WAIT);
    fetch(r).then(function(res){
      if(res.ok){ var cp = res.clone(); caches.open(V).then(function(c){ c.put(key, cp); }); }
      if(!done){ done = true; clearTimeout(t); ok(res); }
    }, function(){
      clearTimeout(t);
      saved().then(function(hit){ if(!done){ done = true; ok(hit || Response.error()); } });
    });
  }));
});
