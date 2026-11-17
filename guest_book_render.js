/* guest_book_render.js — how a home's digital guest book looks (build list n-guestbook, 2026-11-16, Claude Code for Jeff).
   Used by guest.html (the page guests open from the QR code in the home) and by guest_books.html (the office's live preview),
   so both always look the same. Input = guest_book_public(token).book or guest_book_staff(home). Everything is escaped;
   links only become clickable for https://, mailto: and tel:. Codes arrive already hidden as ••••. */
(function(){
  "use strict";
  const ICON = { welcome:"👋", wifi:"📶", checkin:"🧭", directions:"🗺️", early_late:"⏰", parking:"🚗",
    rules:"📋", pets:"🐾", hot_tub:"♨️", fireplace:"🔥", tv:"📺", laundry:"🧺", bbq:"🍖",
    firepit:"🪵", beds:"🛏️", clubhouse:"🏊", amenities:"🧴", other:"💡", tour:"🎥",
    trash:"🗑️", transport:"🚌", tips:"⭐", checkout:"✅", emergency:"🚨" };
  const GROUPS = [["arrive","Arrival"], ["home","The home"], ["town","Around town"], ["leave","Check-out"], ["help","Help"]];
  const OPEN = { arrive:true, leave:true, help:true, start:true };       // these groups start open; "The home" + "Around town" fold
  const TIPCAT = { eat:"Eat & drink", ski:"Ski & ride", outdoors:"Outdoors", groceries:"Groceries & errands", family:"Family fun", events:"Events", other:"More ideas" };
  const MASK = "••••";

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  function time12(t){ const m = String(t || "").match(/^(\d{1,2}):(\d{2})/); if(!m) return ""; let h = +m[1]; const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + ":" + m[2] + " " + ap; }
  function day(d){ const x = new Date(d); return isNaN(+x) ? "" : x.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric", timeZone:"America/Denver" }); }

  // escaped text -> links (https, email, phone) + a lock on hidden codes
  function inline(s){
    let t = esc(s);
    t = t.replace(/\bhttps:\/\/[^\s<>"')]+[^\s<>"').,;:!?]/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u.replace(/^https:\/\/(www\.)?/, "").slice(0, 48)}${u.length > 60 ? "…" : ""}</a>`);
    t = t.replace(/(^|[\s(])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (m, p, e) => `${p}<a href="mailto:${e}">${e}</a>`);
    t = t.replace(/(^|[^\d\w])(\(?\d{3}\)?[-. ]?\d{3}[-. ]\d{4})(?![\d])/g, (m, p, n) => `${p}<a href="tel:+1${n.replace(/\D/g, "")}">${n}</a>`);
    t = t.replace(/(^|[^\d\w])(911)(?![\d\w])/g, (m, p, n) => `${p}<a href="tel:911"><b>911</b></a>`);
    return t.split(MASK).join(`<span class="gbcode" title="Codes are in your check-in message">🔒</span>`);
  }
  // plain text -> short headings, bullet lists and paragraphs
  function block(text){
    const lines = String(text || "").split(/\n/).map(l => l.trim()).filter(Boolean);
    let h = "", list = [];
    const flush = () => { if(list.length){ h += `<ul>${list.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`; list = []; } };
    for(const l of lines){
      const bullet = l.match(/^[-•*·]\s*(.+)$/);
      if(bullet){ list.push(bullet[1]); continue; }
      flush();
      const letters = l.replace(/[^A-Za-z]/g, "");
      if(l.length <= 60 && ((letters.length >= 4 && letters === letters.toUpperCase() && !/[.!?]$/.test(l)) || (/:$/.test(l) && !/https?:$/.test(l))))
        h += `<h4>${inline(l.replace(/:$/, ""))}</h4>`;
      else h += `<p>${inline(l)}</p>`;
    }
    flush();
    return h;
  }
  function copyBtn(v, label){ return v ? `<button type="button" class="gbcopy" data-copy="${esc(v)}">${esc(label || "Copy")}</button>` : ""; }

  function section(s, opts){
    const ic = ICON[s.key] || "•";
    let inner = "";
    if(s.key === "wifi"){
      const w = s.wifi || {};
      inner = (w.name ? `<div class="gbwifi"><span>Network</span><b>${esc(w.name)}</b>${copyBtn(w.name, "Copy")}</div>` : "") +
              (w.pass ? `<div class="gbwifi"><span>Password</span><b>${esc(w.pass)}</b>${copyBtn(w.pass, "Copy")}</div>` : "") +
              (w.note ? `<div class="gbtxt">${block(w.note)}</div>` : "") + (s.body ? `<div class="gbtxt">${block(s.body)}</div>` : "");
      if(!inner) inner = `<p class="gbmuted">No Wi-Fi on file for this home.</p>`;
    } else if(s.key === "rules"){
      inner = ((s.rules || []).length ? `<ul class="gbrules">${s.rules.map(r => `<li>${inline(r)}</li>`).join("")}</ul>` : "") + (s.body ? `<div class="gbtxt">${block(s.body)}</div>` : "");
    } else if(s.key === "tips"){
      const by = {};
      for(const t of (s.tips || [])) (by[t.category] = by[t.category] || []).push(t);
      inner = (s.body ? `<div class="gbtxt">${block(s.body)}</div>` : "") + Object.keys(TIPCAT).filter(k => by[k]).map(k =>
        `<h4>${esc(TIPCAT[k])}</h4>` + by[k].map(t => `<div class="gbtip"><b>${esc(t.title)}</b>${t.body ? `<p>${inline(t.body)}</p>` : ""}${t.link ? `<a class="gbbtn sm" href="${esc(t.link)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}</div>`).join("")).join("");
    } else if(s.key === "tour" && /^https:\/\//.test(s.body || "")){
      inner = `<a class="gbbtn" href="${esc(s.body)}" target="_blank" rel="noopener noreferrer">Open the 3D tour ↗</a>`;
    } else {
      inner = `<div class="gbtxt">${block(s.body)}</div>`;
    }
    const codes = s.hidden_codes || String(s.body || "").includes(MASK);
    if(codes) inner += `<p class="gbnote">🔒 We left codes out of this page. Your check-in message has them.</p>`;
    const open = opts.openAll || OPEN[s.group] || s.key === "wifi";
    const tag = opts.staff && s.hidden ? ` <span class="gbtag">Hidden from guests</span>` : "";
    return `<details class="gbsec${opts.staff && s.hidden ? " gboff" : ""}" id="gb-${esc(s.key)}" data-key="${esc(s.key)}"${open ? " open" : ""}>
      <summary><span class="gbic" aria-hidden="true">${ic}</span><span class="gbt">${esc(s.title)}${tag}</span><span class="gbchev" aria-hidden="true">▾</span></summary>
      <div class="gbbody">${inner}</div></details>`;
  }

  function render(book, opts){
    opts = opts || {};
    const secs = (book.sections || []).filter(s => opts.staff || !s.hidden);
    const top = secs.filter(s => s.group === "start");
    const addr = book.address || "";
    const map = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr + (book.postal ? " " + book.postal : ""))}` : "";
    const ci = time12(book.checkin), co = time12(book.checkout);
    const groups = GROUPS.map(([g, label]) => [g, label, secs.filter(s => s.group === g)]).filter(x => x[2].length);
    return `<div class="gb">
      <header class="gbhero${book.photo ? " gbph" : ""}"${book.photo ? ` style="background-image:linear-gradient(180deg,rgba(10,20,8,.15),rgba(10,20,8,.78)),url('${esc(book.photo).replace(/'/g, "%27")}')"` : ""}>
        <div class="gbbrand"><img src="moose-logo.png" alt="" width="30" height="30">Moose Management</div>
        <div class="gbkick">Your guest book</div>
        <h1>${esc(book.name || "")}</h1>
        ${addr ? `<div class="gbaddr">📍 ${esc(addr)}${map ? ` <a href="${map}" target="_blank" rel="noopener noreferrer">Map ↗</a>` : ""}</div>` : ""}
      </header>
      ${ci || co ? `<div class="gbtimes">${ci ? `<div><span>Check-in</span><b>after ${ci}</b></div>` : ""}${co ? `<div><span>Check-out</span><b>by ${co}</b></div>` : ""}</div>` : ""}
      ${groups.length > 1 ? `<nav class="gbnav">${groups.map(([g, label, list]) => `<a href="#gb-${esc(list[0].key)}" data-gbgo="${esc(list[0].key)}">${esc(label)}</a>`).join("")}</nav>` : ""}
      <main class="gbmain">
        ${top.map(s => section(s, opts)).join("")}
        ${groups.map(([g, label, list]) => `<h2 class="gbgroup">${esc(label)}</h2>${list.map(s => section(s, opts)).join("")}`).join("")}
        ${secs.length ? "" : `<p class="gbmuted">Nothing in this guest book yet.</p>`}
      </main>
      <footer class="gbfoot">${book.updated ? `Updated ${esc(day(book.updated))} · ` : ""}Moose Management · Park City, Utah</footer>
    </div>`;
  }

  function wire(root){
    root.addEventListener("click", e => {
      const b = e.target.closest("[data-copy]");
      if(b){ e.preventDefault(); const v = b.getAttribute("data-copy");
        const done = () => { const t = b.textContent; b.textContent = "Copied ✓"; setTimeout(() => { b.textContent = t; }, 1600); };
        if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, () => { prompt("Copy this:", v); });
        else { prompt("Copy this:", v); } return; }
      const go = e.target.closest("[data-gbgo]");
      if(go){ e.preventDefault(); const d = root.querySelector("#gb-" + go.getAttribute("data-gbgo")); if(d){ d.open = true; d.scrollIntoView({ behavior:"smooth", block:"start" }); } }
    });
  }

  const css = `
.gb{--gbf:#3c5f12;--gbm:#88B535;--gbsoft:#eef5e0;--gbink:#15201a;--gbink2:#3d4a42;--gbmut:#6b776f;--gbline:#e1e7de;--gbcard:#fff;--gbbg:#f5f7f0;
  font-family:"Manrope",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--gbink);background:var(--gbbg);line-height:1.55;-webkit-font-smoothing:antialiased;min-height:100%}
@media (prefers-color-scheme:dark){.gb:not(.gblight){--gbsoft:#1e2a10;--gbink:#e8efe9;--gbink2:#c3d0c6;--gbmut:#93a297;--gbline:#26342b;--gbcard:#151f19;--gbbg:#0d1410}}
.gb *{box-sizing:border-box}
.gbhero{background:var(--gbf);color:#fff;padding:18px 18px 22px;background-size:cover;background-position:center}
.gbhero.gbph{min-height:230px;display:flex;flex-direction:column;justify-content:flex-end}
.gbbrand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;opacity:.95}
.gbbrand img{border-radius:50%;background:#fff}
.gbhero.gbph .gbbrand{margin-bottom:auto}
.gbkick{margin-top:16px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:#d9edb2}
.gbhero h1{margin:2px 0 6px;font-size:26px;line-height:1.2;font-weight:800}
.gbaddr{font-size:14px;opacity:.95}.gbaddr a{color:#fff;font-weight:800;margin-left:4px}
.gbtimes{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:720px;margin:-14px auto 0;padding:0 14px;position:relative}
.gbtimes div{background:var(--gbcard);border:1px solid var(--gbline);border-radius:14px;padding:10px 14px;box-shadow:0 4px 14px rgba(20,40,20,.08)}
.gbtimes span{display:block;font-size:12px;color:var(--gbmut);font-weight:700;text-transform:uppercase;letter-spacing:.05em}.gbtimes b{font-size:17px}
.gbnav{position:sticky;top:0;z-index:5;display:flex;gap:6px;overflow-x:auto;padding:10px 14px;margin-top:12px;background:var(--gbbg);border-bottom:1px solid var(--gbline);scrollbar-width:none}
.gbnav::-webkit-scrollbar{display:none}
.gbnav a{flex:0 0 auto;text-decoration:none;color:var(--gbink);background:var(--gbcard);border:1px solid var(--gbline);border-radius:999px;padding:7px 14px;font-weight:800;font-size:14px}
.gbmain{max-width:720px;margin:0 auto;padding:12px 14px 8px}
.gbgroup{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--gbmut);margin:22px 4px 8px;font-weight:800}
.gbsec{background:var(--gbcard);border:1px solid var(--gbline);border-radius:16px;margin:10px 0;box-shadow:0 1px 2px rgba(20,40,20,.05);scroll-margin-top:64px}
.gbsec>summary{list-style:none;display:flex;align-items:center;gap:10px;padding:14px 16px;cursor:pointer;font-weight:800;font-size:16.5px}
.gbsec>summary::-webkit-details-marker{display:none}
.gbic{width:34px;height:34px;flex:0 0 34px;border-radius:10px;background:var(--gbsoft);display:grid;place-items:center;font-size:18px}
.gbt{flex:1}.gbchev{color:var(--gbmut);transition:transform .15s}.gbsec:not([open]) .gbchev{transform:rotate(-90deg)}
.gbbody{padding:0 16px 14px;color:var(--gbink2);font-size:15.5px}
.gbbody p{margin:0 0 8px}.gbbody ul{margin:4px 0 10px;padding-left:20px}.gbbody li{margin:3px 0}
.gbbody h4{margin:12px 0 4px;font-size:14px;color:var(--gbink);text-transform:none}
.gbbody a{color:var(--gbf);font-weight:700;word-break:break-word}
@media (prefers-color-scheme:dark){.gb:not(.gblight) .gbbody a{color:#b9dc78}}
.gbwifi{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 10px;padding:10px 12px;border:1px solid var(--gbline);border-radius:12px;margin:0 0 8px;background:var(--gbbg)}
.gbwifi span{grid-column:1/-1;font-size:12px;color:var(--gbmut);font-weight:800;text-transform:uppercase;letter-spacing:.05em}
.gbwifi b{font-size:18px;color:var(--gbink);word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.gbcopy,.gbbtn{appearance:none;border:0;background:var(--gbf);color:#fff;border-radius:10px;padding:8px 14px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;text-decoration:none;display:inline-block}
.gbbtn.sm{padding:5px 10px;font-size:13px;margin-top:4px}
.gbrules{list-style:none;padding:0!important}.gbrules li{padding:6px 0 6px 24px;position:relative;border-bottom:1px dashed var(--gbline)}
.gbrules li:before{content:"\\2713";position:absolute;left:2px;color:var(--gbm);font-weight:800}
.gbtip{border-left:3px solid var(--gbm);padding:4px 0 4px 10px;margin:8px 0}.gbtip p{margin:2px 0 0}
.gbnote{font-size:13.5px;background:var(--gbsoft);border-radius:10px;padding:8px 10px;margin:8px 0 0!important}
.gbcode{display:inline-block;padding:0 4px;border-radius:6px;background:var(--gbsoft)}
.gbmuted{color:var(--gbmut)}
.gbtag{font-size:12px;background:#fde8e6;color:#b42318;border-radius:999px;padding:2px 8px;margin-left:6px;font-weight:800;vertical-align:middle}
.gbsec.gboff{opacity:.55}
.gbfoot{text-align:center;color:var(--gbmut);font-size:13px;padding:18px 14px 30px}
@media print{.gbnav{display:none}.gbsec{break-inside:avoid;box-shadow:none}.gbsec:not([open])>.gbbody{display:block}}
`;
  window.GuestBook = { render, wire, css, esc, time12 };
})();
