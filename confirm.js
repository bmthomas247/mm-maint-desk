/* Moose Hub: "Are you sure?" pop-ups inside the hub instead of the browser's own box.
   - window.mmConfirm(text, opts) -> Promise<true|false>   (use with await in new code)
       opts: { title, yes, no, danger }   danger = red Yes button
   - window.mmAsk(text, opts) -> Promise<string|null>      (a box to type in; opts.value, opts.placeholder)
   - Old code that still calls confirm() inside a click/change handler gets the same pop-up:
     the first call answers "no", and if the person taps Yes the same click/change runs again
     and that confirm() answers "yes". confirm() called later (after an await) uses the browser box. */
(function(){
  if (window.mmConfirm) return;
  const nativeConfirm = window.confirm.bind(window);

  // Draw in the hub's own page when we're inside a hub frame (so it's centered on the screen).
  function hostDoc(){
    try { if (window.top !== window && window.top.document && window.top.document.body) return window.top.document; } catch(e) {}
    return document;
  }
  const CSS = `
  dialog.mmc-scrim{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;border:0;background:transparent;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;animation:mmcIn .12s ease-out}
  dialog.mmc-scrim::backdrop{background:rgba(15,30,20,.45)}
  .mmc-box{background:#fff;color:#1d2a20;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28);width:min(440px,100%);overflow:hidden;font:15px/1.45 Manrope,system-ui,-apple-system,"Segoe UI",sans-serif}
  .mmc-head{background:linear-gradient(135deg,#2f5a1f,#3c5f12);color:#fff;padding:12px 18px;font-weight:800;font-size:15px;display:flex;align-items:center;gap:8px}
  .mmc-head img{width:22px;height:22px;border-radius:50%;background:#fff}
  .mmc-body{padding:16px 18px 6px;white-space:pre-wrap;word-wrap:break-word;max-height:55vh;overflow:auto}
  .mmc-in{display:block;width:100%;box-sizing:border-box;margin:10px 0 2px;padding:9px 11px;border:1px solid #c9d3c4;border-radius:10px;font:inherit;min-height:0}
  .mmc-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 18px 16px}
  .mmc-foot button{font:inherit;font-weight:800;border-radius:999px;padding:9px 20px;cursor:pointer;border:1px solid #c9d3c4;background:#fff;color:#1d2a20;min-height:0;width:auto}
  .mmc-foot button.mmc-yes{background:#3c5f12;border-color:#3c5f12;color:#fff}
  .mmc-foot button.mmc-yes.mmc-danger{background:#b3261e;border-color:#b3261e}
  .mmc-foot button:focus-visible{outline:3px solid #f2c94c;outline-offset:2px}
  @media (prefers-color-scheme: dark){
    .mmc-box{background:#1f2620;color:#e8eee6}
    .mmc-foot button{background:#2a332b;color:#e8eee6;border-color:#3d4a3e}
    .mmc-in{background:#2a332b;color:#e8eee6;border-color:#3d4a3e}
  }
  @keyframes mmcIn{from{opacity:0}to{opacity:1}}`;
  function ensureCss(d){
    if (d.getElementById("mmc-css")) return;
    const s = d.createElement("style"); s.id = "mmc-css"; s.textContent = CSS; d.head.appendChild(s);
  }
  const DANGER = /\b(remove|delete|clear|wipe|unlock|take .* off|throw away|cancel this|reset|turn (this|it) off|lock (them|out))\b/i;

  function open(text, opts, withInput){
    opts = opts || {};
    return new Promise(resolve => {
      const d = hostDoc(); ensureCss(d);
      const prev = d.activeElement;
      const scrim = d.createElement("dialog"); scrim.className = "mmc-scrim";
      const danger = opts.danger != null ? opts.danger : DANGER.test(String(text));
      scrim.innerHTML = `<div class="mmc-box" role="alertdialog" aria-modal="true" aria-labelledby="mmc-t">
        <div class="mmc-head" id="mmc-t"></div>
        <div class="mmc-body"></div>
        <div class="mmc-foot"><button type="button" class="mmc-no"></button><button type="button" class="mmc-yes${danger ? " mmc-danger" : ""}"></button></div></div>`;
      scrim.querySelector(".mmc-head").textContent = opts.title || (withInput ? "Moose Hub" : "Are you sure?");
      scrim.querySelector(".mmc-body").textContent = String(text == null ? "" : text);
      const yes = scrim.querySelector(".mmc-yes"), no = scrim.querySelector(".mmc-no");
      yes.textContent = opts.yes || (withInput ? "OK" : "Yes");
      no.textContent = opts.no || (withInput ? "Cancel" : "No");
      let inp = null;
      if (withInput){
        inp = d.createElement(opts.multiline ? "textarea" : "input");
        inp.className = "mmc-in"; inp.value = opts.value || ""; if (opts.placeholder) inp.placeholder = opts.placeholder;
        scrim.querySelector(".mmc-body").appendChild(inp);
      }
      let done = false;
      const finish = v => {
        if (done) return; done = true;
        d.removeEventListener("keydown", key, true); try { scrim.close(); } catch(e) {} scrim.remove();
        try { if (prev && prev.focus) prev.focus(); } catch(e) {}
        resolve(v);
      };
      const ok = () => finish(withInput ? inp.value : true);
      const nay = () => finish(withInput ? null : false);
      const key = e => {
        if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); nay(); }
        else if (e.key === "Enter" && !(inp && inp.tagName === "TEXTAREA")){ e.preventDefault(); e.stopPropagation(); ok(); }
      };
      yes.onclick = ok; no.onclick = nay;
      scrim.addEventListener("mousedown", e => { if (e.target === scrim) nay(); });
      d.addEventListener("keydown", key, true);
      scrim.addEventListener("cancel", e => { e.preventDefault(); nay(); });
      d.body.appendChild(scrim);
      try { scrim.showModal(); } catch(e) { scrim.setAttribute("open", ""); scrim.style.zIndex = "2147483000"; }
      (inp || (danger ? no : yes)).focus();
    });
  }
  window.mmConfirm = (text, opts) => open(text, opts, false);
  window.mmAsk = (text, opts) => open(text, opts, true);

  // Old confirm() calls: show the pop-up, then run the same click/change again if they say Yes.
  const PASS = new Map();   // text -> time it was approved
  window.confirm = function(text){
    const k = String(text == null ? "" : text), now = Date.now();
    for (const [t, at] of PASS) if (now - at > 4000) PASS.delete(t);
    if (PASS.has(k)){ PASS.delete(k); return true; }
    const ev = window.event;
    const replay = ev && ev.target && ev.target.nodeType === 1 && /^(click|change|input|submit|keydown|keyup)$/.test(ev.type);
    if (!replay) return nativeConfirm(text);
    const target = ev.target, type = ev.type;
    const init = { bubbles: true, cancelable: true, composed: true };
    open(k, {}, false).then(yes => {
      if (!yes || !target.isConnected) return;
      PASS.set(k, Date.now());
      let e2;
      if (type === "click") e2 = new MouseEvent("click", init);
      else if (/^key/.test(type)) e2 = new KeyboardEvent(type, Object.assign({ key: ev.key, code: ev.code }, init));
      else e2 = new Event(type, init);
      target.dispatchEvent(e2);
      setTimeout(() => PASS.delete(k), 4000);
    });
    return false;
  };
})();
