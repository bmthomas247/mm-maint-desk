/* media.js - photos and videos load the best way on every Moose Hub page (Brandon 2026-11-23: "we need to have photos and videos
   load the best possible in the crew desk hub as whole"). Load it early on any page: <script src="media.js?v=..."></script>.
   What it does to every <img> / <video> on the page, including ones drawn later (it watches the page):
   - Photos off screen wait until you scroll to them (loading=lazy) and are decoded off the main thread (decoding=async).
   - Track listing photos + Breezeway task photos (full 250-400 KB pictures, public on Amazon) are swapped for a WebP at the size the
     page actually shows (Supabase render/image of a copy in the public bucket img-cache, made once by the Edge Function img-cache).
   - Our public bucket photos (mkt-images) get the same resize. Airbnb photos ask Airbnb for the right width (im_w).
   - Signed photo links from our private buckets are asked for as WebP (render/image/sign, same token; about half the size).
   - Anything that fails falls back to the original photo; if that fails too, a grey "Tap to try again" box instead of a broken icon.
   - A soft grey shimmer shows while a photo loads.
   - Videos load only their first frame + length until someone presses play (preload=metadata) and play in the page on phones.
   Opt out: put data-mm-keep on the <img> (or any parent), e.g. pictures inside email designers. contentEditable areas are skipped.
   The page's own code is never changed: the original link stays in data-msrc. */
(function(){
  if(window.MMMedia) return;
  var SB = "https://ogugdhhiajebfdwpzofp.supabase.co", ST = SB + "/storage/v1";
  var FN = SB + "/functions/v1/img-cache";
  var CACHE = { "track-pm.s3.amazonaws.com":"track", "brzw-photos.s3.amazonaws.com":"bw" };
  var SIZES = [160, 320, 480, 800, 1200, 1600];
  var FAIL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><rect width="240" height="160" fill="#eef0ec"/><g fill="none" stroke="#8a9584" stroke-width="5" stroke-linejoin="round"><rect x="88" y="52" width="64" height="46" rx="7"/><circle cx="120" cy="75" r="12"/></g><text x="120" y="126" font-family="Arial,sans-serif" font-size="15" fill="#5b6656" text-anchor="middle">Tap to try again</text></svg>');

  var css = document.createElement("style");
  css.textContent =
    "@keyframes mmshim{0%{background-position:100% 0}100%{background-position:0 0}}" +
    ":where(img.mm-ld){background-color:rgba(128,128,128,.12);background-image:linear-gradient(90deg,rgba(128,128,128,.10) 25%,rgba(128,128,128,.22) 45%,rgba(128,128,128,.10) 65%);background-size:300% 100%;animation:mmshim 1.3s ease-in-out infinite}" +
    ":where(img.mm-fail){cursor:pointer;object-fit:contain;background:#eef0ec}" +
    "@media (prefers-reduced-motion:reduce){:where(img.mm-ld){animation:none}}";
  (document.head || document.documentElement).appendChild(css);

  function keep(el){ return !!(el.closest && el.closest("[data-mm-keep],[contenteditable=''],[contenteditable=true]")) || document.designMode === "on"; }
  function width(img){
    var w = img.__mmw != null ? img.__mmw : 0;
    if(img.__mmw == null) try { w = img.getBoundingClientRect().width; } catch(e){}
    if(!w){ var a = parseFloat(img.getAttribute("width")); if(a) w = a; }
    if(!w){ var s = img.style && img.style.width; if(s && /px$/.test(s)) w = parseFloat(s); }
    if(!w){ var h = parseFloat(img.style && img.style.height) || parseFloat(img.getAttribute("height")); if(h) w = h * 1.5; }
    if(!w) w = 480;
    w = w * Math.min(window.devicePixelRatio || 1, 2);
    for(var i = 0; i < SIZES.length; i++) if(SIZES[i] >= w) return SIZES[i];
    return 0;   // shown bigger than 1600: keep the original
  }
  function better(src, img){
    var u; try { u = new URL(src, location.href); } catch(e){ return null; }
    if(u.protocol !== "https:") return null;
    var pre = CACHE[u.hostname];
    if(pre){
      var w = width(img); if(!w) return null;
      var p = decodeURIComponent(u.pathname).replace(/^\/+/, "").replace(/[^A-Za-z0-9._\/-]/g, "_");
      if(!p || p.indexOf("..") > -1) return null;
      return { src: ST + "/render/image/public/img-cache/" + pre + "/" + p + "?width=" + w + "&quality=72",
               fill: FN + "?u=" + encodeURIComponent(u.href) + "&w=" + w };
    }
    if(u.origin === SB && u.pathname.indexOf("/storage/v1/object/public/") === 0 && /\.(jpe?g|png|webp)$/i.test(u.pathname)){
      var w2 = width(img); if(!w2) return null;
      return { src: ST + "/render/image/public/" + u.pathname.slice("/storage/v1/object/public/".length) + "?width=" + w2 + "&quality=75" };
    }
    if(u.origin === SB && u.pathname.indexOf("/storage/v1/object/sign/") === 0 && u.searchParams.get("token") && !/\.(gif|svg|heic|heif|pdf)$/i.test(u.pathname)){
      var rest = u.pathname.slice("/storage/v1/object/sign/".length), cut = rest.indexOf("/");
      return { src: ST + "/render/image/sign/" + rest + u.search,
               sign: cut > 0 ? { bucket: decodeURIComponent(rest.slice(0, cut)), path: decodeURIComponent(rest.slice(cut + 1)), w: width(img) } : null };
    }
    if(/(^|\.)muscache\.com$/.test(u.hostname) && !u.searchParams.has("im_w")){
      var w3 = width(img); if(!w3) return null;
      u.searchParams.set("im_w", String(Math.min(w3, 1440))); return { src: u.href };
    }
    return null;
  }
  function set(img, src){ img.setAttribute("data-mset", src); img.setAttribute("src", src); }
  /* Private photos (signed links): a real small copy needs the size inside the signed token, so the page's own sign-in asks
     Supabase for a new link with that size, only when the photo is about to come on screen. Links are reused for 50 minutes. */
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==", SIGNED = {};
  function client(){
    var c = window.MM_SB || window.__sb; if(c && c.storage) return c;
    try { if(typeof sb !== "undefined" && sb && sb.storage) return sb; } catch(e){}
    return null;
  }
  var IO = ("IntersectionObserver" in window) ? new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ IO.unobserve(e.target); thumb(e.target); } });
  }, { rootMargin: "600px" }) : null;
  function thumb(img){
    var d = img.__mmsign; if(!d) return; img.__mmsign = null;
    var k = d.bucket + "/" + d.path + "@" + d.w, hit = SIGNED[k];
    if(hit && Date.now() - hit.t < 50 * 60000){ set(img, hit.u); return; }
    var c = client();
    if(!c){ set(img, d.swap); return; }
    c.storage.from(d.bucket).createSignedUrl(d.path, 3600, { transform: { width: d.w, quality: 72 } }).then(function(r){
      var u = r && r.data && r.data.signedUrl;
      if(img.getAttribute("src") !== BLANK) return;                       // the page moved on to another photo
      if(u){ SIGNED[k] = { u: u, t: Date.now() }; set(img, u); } else set(img, d.swap);
    }, function(){ if(img.getAttribute("src") === BLANK) set(img, d.swap); });
  }
  function done(img){ img.classList.remove("mm-ld"); }

  function fix(img){
    if(!img || img.tagName !== "IMG") return;
    var src = img.getAttribute("src") || "";
    if(src && src === img.getAttribute("data-mset")) return;          // our own change
    if(!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
    if(!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
    img.classList.remove("mm-fail");
    if(!src || /^(data:|blob:)/.test(src)){ done(img); return; }
    img.setAttribute("data-msrc", src); img.removeAttribute("data-mstep"); img.removeAttribute("data-mfill");
    if(!img.complete || !img.naturalWidth){
      var w = img.__mmw || 0;
      if(w > 40 || !w) img.classList.add("mm-ld");
    }
    if(keep(img)) return;
    var b = better(src, img);
    if(b && b.sign && b.sign.w && client()){
      img.classList.add("mm-ld"); b.sign.swap = b.src; img.__mmsign = b.sign; set(img, BLANK);
      if(IO) IO.observe(img); else thumb(img);
      return;
    }
    if(b){ if(b.fill) img.setAttribute("data-mfill", b.fill); set(img, b.src); }
  }
  function err(img){
    var orig = img.getAttribute("data-msrc"); if(!orig) return;
    var step = +(img.getAttribute("data-mstep") || 0); img.setAttribute("data-mstep", step + 1);
    var fill = img.getAttribute("data-mfill");
    if(step === 0 && fill && img.getAttribute("src") !== fill){ set(img, fill); return; }    // make the small copy, then show it
    if(img.getAttribute("src") !== orig && step < 3){ set(img, orig); return; }              // the original photo
    done(img); img.classList.add("mm-fail"); img.setAttribute("title", "This photo didn't load. Tap to try again.");
    set(img, FAIL);
  }
  function vid(v){
    if(!v || v.tagName !== "VIDEO" || v.getAttribute("data-mvid")) return;
    v.setAttribute("data-mvid", "1");
    if(!v.hasAttribute("preload") && !v.autoplay) v.setAttribute("preload", "metadata");
    v.setAttribute("playsinline", ""); if(!v.hasAttribute("controls") && !v.autoplay && !v.muted) v.setAttribute("controls", "");
  }
  function collect(root, imgs){
    if(!root || root.nodeType !== 1) return;
    if(root.tagName === "IMG"){ imgs.push(root); return; }
    if(root.tagName === "VIDEO"){ vid(root); return; }
    var a = root.getElementsByTagName("img"); for(var i = 0; i < a.length; i++) imgs.push(a[i]);
    var v = root.getElementsByTagName("video"); for(var j = 0; j < v.length; j++) vid(v[j]);
  }
  /* all the measuring first, then all the changes: one page layout for the whole batch instead of one per photo */
  function run(imgs){
    var todo = [];
    for(var i = 0; i < imgs.length; i++){ var im = imgs[i], s = im.getAttribute("src") || "";
      if(s && s === im.getAttribute("data-mset")) continue; todo.push(im); }
    for(var k = 0; k < todo.length; k++){ try { todo[k].__mmw = todo[k].getBoundingClientRect().width; } catch(e){ todo[k].__mmw = 0; } }
    for(var n = 0; n < todo.length; n++){ fix(todo[n]); todo[n].__mmw = null; }
  }
  function scan(root){ var imgs = []; collect(root, imgs); run(imgs); }

  document.addEventListener("load", function(e){ var t = e.target; if(t && t.tagName === "IMG" && t.getAttribute("src") !== FAIL && t.getAttribute("src") !== BLANK) done(t); }, true);
  document.addEventListener("error", function(e){ var t = e.target; if(t && t.tagName === "IMG") err(t); }, true);
  document.addEventListener("click", function(e){
    var t = e.target; if(!t || t.tagName !== "IMG" || !t.classList.contains("mm-fail")) return;
    e.preventDefault(); e.stopPropagation();
    var o = t.getAttribute("data-msrc"); if(!o) return;
    t.classList.remove("mm-fail"); t.classList.add("mm-ld"); t.removeAttribute("title"); t.setAttribute("data-mstep", "2"); set(t, o);
  }, true);

  new MutationObserver(function(list){
    var imgs = [];
    for(var i = 0; i < list.length; i++){
      var m = list[i];
      if(m.type === "attributes"){ if(m.target.tagName === "IMG") imgs.push(m.target); }
      else for(var j = 0; j < m.addedNodes.length; j++) collect(m.addedNodes[j], imgs);
    }
    if(imgs.length) run(imgs);
  }).observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:["src"] });
  if(document.body) scan(document.body);
  document.addEventListener("DOMContentLoaded", function(){ scan(document.body); });

  window.MMMedia = { better: better, scan: scan };
})();

/* Text boxes (Brandon 2026-11-23 from Kim's #45, every page): each <textarea> gets the corner grabber (drag it bigger) and grows as
   you type, up to 60% of the screen, then scrolls. It never shrinks a box someone dragged bigger. A page that sets resize:none keeps
   it (the rule is :where = lowest priority). Opt out: data-mm-keep on the box or a parent. Code editors (CodeMirror) are skipped. */
(function(){
  if(window.MMText) return; window.MMText = 1;
  var st = document.createElement("style");
  st.textContent = ":where(textarea){resize:vertical;max-height:60vh;overflow-y:auto}";
  (document.head || document.documentElement).appendChild(st);
  function grow(t){
    if(!t || t.tagName !== "TEXTAREA" || !t.getClientRects().length) return;
    if(t.closest && t.closest("[data-mm-keep],.CodeMirror")) return;
    var cs = getComputedStyle(t); if(cs.resize === "none" && t.dataset.mmGrow !== "1") return;
    var max = Math.round(window.innerHeight * 0.6), need = t.scrollHeight + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    if(need > t.clientHeight + 2 && t.offsetHeight < max) t.style.height = Math.min(need, max) + "px";
  }
  document.addEventListener("input", function(e){ grow(e.target); }, true);
  document.addEventListener("focusin", function(e){ grow(e.target); }, true);
})();
