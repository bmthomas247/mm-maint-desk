/* Moose Hub usage tracking (Jeff 2026-11-23: "every single page and everything is click traced, so that way we can help fix things").
   Loaded by config.js, so every hub page (and every new page that loads config.js) is covered.
   Keeps: page opens, clicks (what was tapped + where), page errors and failure messages, for SIGNED-IN staff only.
   Never keeps: anything typed into a box, box values, codes, passwords or emails (numbers of 3+ digits and emails are
   masked here AND again in the database). Public guest pages are skipped.
   Saved by hub_click_log() into hub_clicks (hub_usage_tracking.sql). Read only by hub admins: Reports > Admin > Hub usage (usage.html).
   Round 2 (2026-11-23, hub_usage_tracking_2.sql): page speed (time until a page's data is in) and data requests that failed or
   took 4+ s. config.js times every request to our database; only the request's NAME is sent (rpc/home_quick, desk_docs:feeds...),
   never what was sent or came back. window.mmTrackFlush() sends what's waiting now (Report a Bug calls it). */
(function () {
  if (window.__mmTrack) return; window.__mmTrack = 1;
  try {
    var CFG = window.MM_CONFIG || {};
    if (!CFG.url || !CFG.anonKey) return;
    var file = (location.pathname.split("/").pop() || "hub.html").toLowerCase();
    if (file === "index.html" || file === "") file = "hub.html";
    // Guest-facing / public pages: never tracked
    if (/^(guest|book|meet|gps_setup|unsub|go|stay|install-guide)\.html$/.test(file)) return;

    var REF = CFG.url.replace(/^https?:\/\//, "").split(".")[0];
    var SKEY = "sb-" + REF + "-auth-token", QKEY = "mm_trk_q";
    var FRAMED = false; try { FRAMED = window.top !== window; } catch (e) { FRAMED = true; }
    var SID; try { SID = sessionStorage.getItem("mm_trk_sid"); if (!SID) { SID = Math.random().toString(36).slice(2, 12); sessionStorage.setItem("mm_trk_sid", SID); } } catch (e) { SID = "x" + Math.random().toString(36).slice(2, 10); }
    var KEEPQ = ["only", "view", "tab", "area", "htype", "split", "meet", "full", "rp", "embed", "penny"];

    function sess() {
      try {
        var o = JSON.parse(localStorage.getItem(SKEY) || "null"); if (!o) return null;
        if (o.currentSession) o = o.currentSession;
        if (!o.access_token) return null;
        if (o.expires_at && o.expires_at * 1000 < Date.now() + 5000) return null;   // expired: wait for the page to refresh it
        return { token: o.access_token, uid: (o.user && o.user.id) || "" };
      } catch (e) { return null; }
    }
    function clean(t, n) {
      if (t == null) return "";
      t = String(t).replace(/[^\s@]+@[^\s@]+/g, "[email]").replace(/\d{3,}/g, "###").replace(/\s+/g, " ").trim();
      return t.length > (n || 80) ? t.slice(0, (n || 80) - 1) + "…" : t;
    }
    function page() {
      var q = new URLSearchParams(location.search), keep = [];
      KEEPQ.forEach(function (k) { if (q.has(k)) keep.push(k + "=" + clean(q.get(k), 20)); });
      return file + (keep.length ? "?" + keep.join("&") : "");
    }
    // #/route only, cut before any = & ? (sign-in links carry tokens there). Home codes / res numbers kept; emails masked.
    function route() { var h = String(location.hash || ""); try { h = decodeURIComponent(h); } catch (e) {}
      h = h.split(/[=&?]/)[0].replace(/[^\s@]+@[^\s@]+/g, "[email]"); return h.length > 120 ? h.slice(0, 120) : h; }
    function screenKind() { var w = 1200; try { w = window.top.innerWidth; } catch (e) { w = window.innerWidth; } return w < 700 ? "phone" : w < 1100 ? "tablet" : "desktop"; }
    function title() {
      var t = "";
      try { var tt = window.top.document.querySelector("#ttl"); if (tt) t = tt.textContent; } catch (e) {}
      if (!t) { var h = document.querySelector("#ttl,h1,h2"); t = h ? h.textContent : document.title; }
      return clean(t, 60);
    }

    // ---- queue + send ----
    var Q = [], busy = false, fails = 0;
    // Taps not sent yet (no signal / page closed) wait in this browser under THIS page's own key; each one carries who
    // made it (u), so a tap is never sent under someone else who signs in on the same device later. A page only takes over
    // another page's waiting taps once that page has been quiet for a minute (it was closed). (The database also ignores exact repeats.)
    var INST = Math.random().toString(36).slice(2, 10), QPRE = QKEY + "_";
    try {
      localStorage.removeItem(QKEY);                                   // first version's shared key (caused double counts)
      for (var qi = localStorage.length - 1; qi >= 0; qi--) {
        var qk = localStorage.key(qi); if (!qk || qk.indexOf(QPRE) !== 0) continue;
        var qo = null; try { qo = JSON.parse(localStorage.getItem(qk) || "null"); } catch (e) {}
        if (!qo || !qo.at || Date.now() - qo.at > 60000) { localStorage.removeItem(qk); if (qo && qo.q) Q = Q.concat(qo.q); }
      }
      Q = Q.slice(-300);
    } catch (e) {}
    function save() { try { if (Q.length) localStorage.setItem(QPRE + INST, JSON.stringify({ at: Date.now(), q: Q.slice(-300) })); else localStorage.removeItem(QPRE + INST); } catch (e) {} }
    function add(ev) {
      var s = sess();
      ev.u = s ? s.uid : ""; ev.t = Date.now(); ev.sid = SID; ev.page = page(); ev.route = route(); ev.fr = FRAMED; ev.sc = screenKind();
      if (!ev.nm) ev.nm = title();
      Q.push(ev); if (Q.length > 300) Q.splice(0, Q.length - 300);
      if (Q.length >= 25) flush(); else save();
    }
    function flush(leaving) {
      if (busy || !Q.length) return;
      var s = sess(); if (!s) { save(); return; }
      Q = Q.filter(function (ev) { return !ev.u || ev.u === s.uid; });   // someone else's leftovers on this device: dropped
      Q.forEach(function (ev) { if (!ev.u) ev.u = s.uid; });
      if (!Q.length) { save(); return; }
      var batch = Q.splice(0, 80); busy = true; save();
      var back = function () { Q = batch.concat(Q).slice(-300); fails++; save(); };
      try {
        fetch(CFG.url + "/rest/v1/rpc/hub_click_log", {
          method: "POST", keepalive: !!leaving,
          headers: { apikey: CFG.anonKey, Authorization: "Bearer " + s.token, "Content-Type": "application/json" },
          body: JSON.stringify({ p: batch })
        }).then(function (r) {
          busy = false;
          if (r.status === 401 || r.status >= 500) back();   // sign-in being refreshed / server busy: try again later
          else { fails = 0; save(); }                          // sent (or refused for good: don't retry forever)
        }).catch(function () { busy = false; back(); });
      } catch (e) { busy = false; back(); }
    }
    setInterval(function () { if (fails < 20 || Math.random() < 0.1) flush(); if (Q.length) save(); }, 15000);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(true); });
    window.addEventListener("pagehide", function () { flush(true); });

    // ---- page opens ----
    var lastView = "", lastAt = 0;
    function view(why) {
      setTimeout(function () {
        var k = page() + "|" + route() + "|" + title();
        if (k === lastView && Date.now() - lastAt < 4000) return;
        lastView = k; lastAt = Date.now();
        add({ k: "view", act: why });
      }, 1300);   // let the page draw its title first
    }
    // Inside the hub, the hub page itself records the open; a desk inside it only records its own moves (#hash changes).
    if (!FRAMED) view("open");
    window.addEventListener("hashchange", function () { view("move"); if (!(SP && SP.why === "open")) spStart("move"); });   // a move while the page is still starting up stays part of the start-up time

    // ---- page speed + data requests (config.js keeps each request to our database in window.__mmCalls) ----
    function pathOf(u) {
      try {
        var x = new URL(u, location.href); if (x.origin !== new URL(CFG.url).origin) return null;
        var p = x.pathname, m;
        if (/^\/(auth|realtime)\//.test(p)) return null;                      // sign-in refreshes: not page data
        if ((m = p.match(/^\/rest\/v1\/rpc\/([^\/]+)/))) return m[1] === "hub_click_log" ? null : "rpc/" + m[1];
        if ((m = p.match(/^\/rest\/v1\/([^\/]+)/))) {
          var col = m[1] === "desk_docs" ? String(x.searchParams.get("collection") || "").replace(/^eq\./, "") : "";
          return m[1] + (/^[a-z0-9_-]{1,30}$/i.test(col) ? ":" + col : "");
        }
        if ((m = p.match(/^\/functions\/v1\/([^\/]+)/))) return "function/" + m[1];
        if ((m = p.match(/^\/storage\/v1\/(object|render\/image)\/(?:(?:sign|public|authenticated|list|info|upload\/sign)\/)?([^\/]+)/)))
          return (m[1] === "object" ? "files/" : "picture/") + m[2];
        return p.split("/").slice(1, 3).join("/");
      } catch (e) { return null; }
    }
    // One measurement per page open / move: from the start until no data request has been running for 1.5 s.
    var SP = null, seenCall = {};
    function spStart(why) {
      if (document.visibilityState === "hidden") { SP = null; return; }   // a page loading in a background tab isn't a fair time
      SP = { t0: why === "open" ? 0 : performance.now(), why: why, n: 0, last: 0, top: "", topMs: 0 };
    }
    function tick() {
      var B = window.__mmCalls; if (!B) return;                         // an old cached config.js: no timing
      var list = B.splice(0, B.length);
      for (var i = 0; i < list.length; i++) {
        var c = list[i], p = pathOf(c[0]); if (!p) continue;
        var st = c[1], ms = c[2], t0 = c[3];
        if (SP && t0 >= SP.t0 - 50) { SP.n++; if (t0 + ms > SP.last) SP.last = t0 + ms; if (ms > SP.topMs) { SP.topMs = ms; SP.top = p; } }
        if (st === -1) continue;                                          // cancelled on purpose
        if (!(st === 0 || st >= 400 || ms >= 4000)) continue;             // fine: only failures and 4+ s requests are kept
        var k = p + "|" + st; if (seenCall[k] && Date.now() - seenCall[k] < 300000) continue; seenCall[k] = Date.now();
        add({ k: "call", msg: p, st: st, ms: Math.round(ms) });
      }
      if (!SP) return;
      var now = performance.now(), busy = B.busy || 0;
      if (SP.n && !busy && now - SP.last > 1500) done(false);
      else if (now - SP.t0 > 60000) { if (SP.n) done(true); else SP = null; }
      else if (!SP.n && now - SP.t0 > 10000) SP = null;                 // a page with no data to load
      function done(cut) {
        add({ k: "speed", act: SP.why + (cut ? " (still loading at 60 s)" : ""), ms: Math.round((cut ? now : SP.last) - SP.t0), n: SP.n,
              msg: SP.top ? SP.top + " " + (SP.topMs / 1000).toFixed(1) + "s" : "" });
        SP = null;
      }
    }
    spStart("open");
    setInterval(function () { try { tick(); } catch (e) {} }, 500);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") SP = null; });
    // Send what's waiting now (this page and the desk pages inside it). Report a Bug calls it so the steps are there.
    window.mmTrackFlush = function () {
      try { tick(); } catch (e) {} flush();
      try { for (var i = 0; i < window.frames.length; i++) { try { if (window.frames[i].mmTrackFlush) window.frames[i].mmTrackFlush(); } catch (e) {} } } catch (e) {}
    };

    // ---- clicks ----
    var INTER = "a,button,summary,label,select,option,input,textarea,[role=button],[role=tab],[role=link],[role=menuitem],[onclick],[contenteditable=true]";
    var SECRET = /pass|wi-?fi|code|key ?box|lock|garage|gate|alarm|\bpin\b|secret|token|login|sign-?in/i;
    function ctxOf(el) {
      var box = el.closest && el.closest("dialog,[role=dialog],.modal,details,section,article,fieldset,.card,.tile,table,form,nav,aside,header");
      if (!box) return "";
      var h = box.querySelector("h1,h2,h3,h4,summary,legend,caption,.title");
      return h && h !== el ? clean(h.textContent, 50) : "";
    }
    function labelOf(el, live) {
      var tag = el.tagName.toLowerCase(), tp = (el.getAttribute("type") || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        if (tp === "password") return "password box";
        var lab = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || el.getAttribute("title") || "";
        if (!lab && el.id) { try { var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) lab = l.textContent; } catch (e) {} }
        if (!lab) { var pl = el.closest("label"); if (pl) lab = Array.prototype.map.call(pl.childNodes, function (n) { return n.nodeType === 3 ? n.textContent : ""; }).join(" "); }
        return clean((tp === "checkbox" || tp === "radio" ? "tick: " : tag === "select" ? "pick: " : "box: ") + lab, 80);   // never the value
      }
      // the words people see first (a hover note can be long); then aria-label / hover note for icon-only buttons
      var txt = (el.innerText || el.textContent || "");
      var t = el.getAttribute("aria-label") || (txt.trim() && txt.trim().length <= 80 ? txt : "") || el.getAttribute("title") || txt;
      if (!live && txt.length > 120) return "";                        // a big block of text, not a spot
      if (SECRET.test(t + " " + ctxOf(el))) {
        if (!live) return "[hidden]";                                  // a tapped value near codes / Wi-Fi: don't keep the words
        t = t.split(/\s+/).map(function (w) { return /\d/.test(w) && w.length > 2 ? "###" : w; }).join(" ");
        if (t.length > 40) t = t.slice(0, 40);
      }
      return clean(t, 80);
    }
    function actOf(el) {
      if (el.id) return "#" + el.id;
      for (var i = 0; i < el.attributes.length; i++) {
        var a = el.attributes[i];
        if (/^data-/.test(a.name) && !/^data-(v|id|i|n|k)$/.test(a.name)) return a.name + (a.value && a.value.length <= 24 ? "=" + a.value : "");
      }
      var c = (el.getAttribute("class") || "").trim().split(/\s+/).slice(0, 2).join(".");
      return c ? "." + c : "";
    }
    function hrefOf(el) {
      if (el.tagName !== "A" || !el.getAttribute("href")) return "";
      try { var u = new URL(el.getAttribute("href"), location.href);
        if (u.protocol === "tel:" || u.protocol === "sms:" || u.protocol === "mailto:") return u.protocol;
        if (u.origin === location.origin) return u.pathname.split("/").pop() + String(u.hash || "").split(/[=&?]/)[0];
        return u.host; } catch (e) { return ""; }
    }
    var lastClick = "", lastClickAt = 0;
    document.addEventListener("click", function (e) {
      try {
        var t = e.target; if (t && t.nodeType !== 1) t = t.parentElement; if (!t) return;
        // the nearest thing that acts like a button: a real control, or anything showing the pointing-hand cursor
        var el = null, x = t;
        for (var i = 0; x && i < 7 && x !== document.body && x !== document.documentElement; i++, x = x.parentElement) {
          if (x.matches && (x.matches(INTER) || getComputedStyle(x).cursor === "pointer")) { el = x; break; }
        }
        var live = !!el; el = el || t;
        var ev = { k: "click", tag: el.tagName.toLowerCase(), lb: labelOf(el, live), cx: ctxOf(el), act: clean(actOf(el), 60), href: hrefOf(el), live: live };
        // a tap on a <label> also "clicks" its tick box a moment later: count it once
        var key = ev.lb + "|" + ev.cx; if (key === lastClick && Date.now() - lastClickAt < 80) return;
        lastClick = key; lastClickAt = Date.now();
        add(ev);
      } catch (err) {}
    }, true);

    // ---- page errors + failure messages people see ----
    var seenErr = {};
    function err(msg, src) {
      msg = clean(msg, 300); if (!msg) return;
      var k = msg; if (seenErr[k] && Date.now() - seenErr[k] < 30000) return; seenErr[k] = Date.now();
      add({ k: "error", msg: msg, src: String(src || "").split("?")[0].slice(0, 200) });
    }
    window.addEventListener("error", function (e) {
      try {
        if (e && e.target && e.target !== window && e.target.tagName) {          // a picture / script / style that didn't load
          var tg = e.target, u = tg.src || tg.href || "";
          if (tg.tagName === "IMG") {
            // media.js first asks for a small cached copy; the first time anyone sees a photo that copy doesn't exist yet, so the
            // first try fails and media.js makes the copy or falls back to the original. Only report a picture that never shows.
            if (tg.__mmTrkErr) return; tg.__mmTrkErr = 1;
            setTimeout(function () {
              tg.__mmTrkErr = 0;
              var failed = tg.classList && tg.classList.contains("mm-fail");     // media.js gave up ("Tap to try again")
              // it showed, it's still loading (a later failure fires again), or the page moved on
              if (!failed && (!tg.isConnected || !tg.complete || tg.naturalWidth > 0)) return;
              var o = tg.getAttribute("data-msrc") || u;
              err("Couldn't load picture: " + String(o).split("?")[0].split("/").slice(-2).join("/"), o);
            }, 15000);
            return;
          }
          if (/^(SCRIPT|LINK)$/.test(tg.tagName)) err("Couldn't load " + (tg.tagName === "SCRIPT" ? "script" : "style") + ": " + String(u).split("?")[0].split("/").slice(-2).join("/"), u);
          return;
        }
        err(e.message || "Page error", (e.filename || "") + (e.lineno ? ":" + e.lineno : ""));
      } catch (x) {}
    }, true);
    window.addEventListener("unhandledrejection", function (e) {
      try { var r = e.reason; err("Unhandled: " + ((r && (r.message || r.error_description)) || String(r)), ""); } catch (x) {}
    });
    var FAIL = /couldn.?t|could not|can.?t|cannot|error|failed|not allowed|not saved|denied|try again|went wrong|no signal|timed out/i;
    function wrapAlerts() {
      ["alert", "mmAlert"].forEach(function (n) {
        var f = window[n]; if (typeof f !== "function" || f.__mmT) return;
        var w = function (m) { try { var s = m && m.message ? m.message : String(m); if (FAIL.test(s)) err("Message shown: " + s, n); } catch (x) {} return f.apply(this, arguments); };
        w.__mmT = 1; window[n] = w;
      });
    }
    wrapAlerts();
    document.addEventListener("DOMContentLoaded", wrapAlerts);
    window.addEventListener("load", function () { wrapAlerts(); setTimeout(wrapAlerts, 3000); });
  } catch (e) {}
})();
