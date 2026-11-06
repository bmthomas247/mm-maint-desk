/* reservations.js (Brandon 2026-10-28): Reservations ▸ Check lists — the Reservation Desk board + Asana Rental Checklists in the hub.
   Loaded by hub.html; uses its sb / $ / esc. Data: res_board() (hub_reservations.sql) — access and money are enforced there.
   Routes: #/reservations (queue) · #/reservations/<res #> (one check list) · #/reservations/held (Held up report). */
(function(){
const CSS = `
.rq{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.rqbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px} .rqbar input{flex:1;min-width:180px} .rqbar select{width:auto}
.rchips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0} .rchip{border:1px solid var(--line-2);background:var(--card);border-radius:999px;padding:5px 11px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;color:var(--ink-2)}
.rchip.on{background:var(--forest-2);border-color:var(--forest-2);color:#fff} .rchip .n{opacity:.7;margin-left:4px}
.rrow{display:flex;gap:10px;align-items:center;padding:10px 4px;border-bottom:1px solid var(--line);cursor:pointer;text-decoration:none;color:inherit} .rrow:hover{background:var(--ground)}
.rrow .u{font-weight:800;min-width:76px} .rrow .g{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .rrow .d{font-size:13px;color:var(--muted);white-space:nowrap}
.rbar{height:6px;border-radius:6px;background:var(--line);width:70px;overflow:hidden;flex:0 0 auto} .rbar i{display:block;height:100%;background:var(--moose,#4f7a3a)}
.rfacts{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;margin:6px 0} .rfacts b{font-weight:800}
.rmoney{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13.5px;background:var(--ground);border:1px solid var(--line);border-radius:12px;padding:8px 12px;margin:8px 0}
.rnext{font-size:13px;color:var(--ink-2);margin-top:7px;line-height:1.35} .rnext.stop{color:var(--red);font-weight:700} .rnext.big{font-size:14.5px;margin:0 0 10px;padding:8px 12px;border-radius:12px;background:var(--moose-soft);color:var(--moose-ink)}
.rrule{border-radius:12px;padding:8px 12px;margin:6px 0;font-size:14px;font-weight:600;background:var(--blue-soft);color:var(--blue)} .rrule.warn{background:var(--amber-soft);color:var(--amber)} .rrule.stop{background:var(--red-soft);color:var(--red)}
.rgrp{margin-top:14px} .rgrp h3{font-size:15px;margin:0 0 4px;display:flex;gap:8px;align-items:center}
.rstep{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--line)} .rstep:last-child{border-bottom:0}
.rstep input{width:22px;height:22px;min-height:0;flex:0 0 auto;margin-top:1px;accent-color:var(--forest-2)} .rstep .l{flex:1;font-size:14.5px} .rstep.opt .l{color:var(--ink-2)}
.rstep .who{font-size:12px;color:var(--muted);white-space:nowrap;min-width:200px;text-align:right}
@media(max-width:640px){ .rstep{flex-wrap:wrap} .rstep .who{min-width:0;flex-basis:100%;text-align:left;padding-left:32px;white-space:normal} } .rstep.done .l{text-decoration:line-through;text-decoration-color:var(--line-2)}
.rhist{font-size:13px;border-top:1px solid var(--line);padding:6px 0}
/* Brandon 2026-11-03: check list groups are an accordion (one open at a time, the first one with steps left opens) */
details.racc{margin-top:0;border-top:1px solid var(--line)} details.racc>summary{list-style:none;cursor:pointer;padding:10px 2px;border-radius:8px}
details.racc>summary::-webkit-details-marker{display:none} details.racc>summary:hover{background:var(--ground)} details.racc>summary h3{margin:0}
details.racc>summary h3::before{content:"▸";color:var(--muted);width:12px;display:inline-block} details.racc[open]>summary h3::before{content:"▾"}
details.racc[open]{padding-bottom:8px} .rgall{background:none;border:0;color:var(--muted);font-size:12.5px;cursor:pointer;text-decoration:underline;padding:0;min-height:0}
.rwhy{background:none;border:1px solid var(--line);color:var(--muted);border-radius:50%;width:20px;height:20px;min-height:0;padding:0;font-size:12px;font-weight:700;line-height:18px;cursor:pointer;margin-left:6px;vertical-align:1px}
.rwhyt{display:inline-block;width:100%;box-sizing:border-box;font-size:13px;color:var(--ink-2);background:var(--ground);border-radius:8px;padding:6px 9px;margin-top:5px;font-weight:400}   /* inline-block: a done step's line-through doesn't reach it */
.rwhyt[hidden]{display:none}
/* Track automations (Brandon 2026-11-03): Track's logo purple = Track's automation happened, grey = it hasn't */
.trk{display:inline-flex;flex:none;color:#b9b9bf} .rstep .l .trk{vertical-align:-3px} .trk.on{color:#411064} .trk svg{width:22px;height:16px;display:block}
.rstep.trkrow{align-items:center} .rstep.trkrow .who{white-space:normal;max-width:280px} .rstep.trkrow .l{font-size:14px} .rstep.trkrow.on .l{color:var(--ink)} .rstep.trkrow:not(.on) .l{color:var(--muted)}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) .trk{color:#55555c} :root:not([data-theme="light"]) .trk.on{color:#b98be0} }
:root[data-theme="dark"] .trk{color:#55555c} :root[data-theme="dark"] .trk.on{color:#b98be0}
.rq3{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1.2fr) minmax(0,1fr);gap:6px 14px;align-items:start}
.rq3 .who,.rq3 .when,.rq3 .st{display:flex;flex-direction:column;gap:2px;min-width:0} .rq3 .who b{font-size:15.5px}
.rq3 .sub{font-size:13px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .rq3 .sub+.sub{color:var(--muted)}
.rq3 .when{font-size:13.5px} .rq3 .when>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .rq3 .when .k{display:inline-block;min-width:52px;color:var(--muted);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.rq3 .st{align-items:flex-end} .rq3 .why{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end} .rq3 .why .pill{font-size:11px;padding:2px 7px}
@media(min-width:1000px){ .rpage{max-width:1180px!important} }
@media(max-width:640px){ .rq3{grid-template-columns:minmax(0,1fr) minmax(0,44%)} .rq3 .when{grid-column:1 / -1;grid-row:2} .rrow{flex-wrap:wrap;gap:4px 10px} .rrow .g{order:3;flex-basis:100%;white-space:normal} .rrow .d{flex:1} .rrow .rbar{display:none} }
/* check list as a pop-up over the list (Brandon 2026-11-03) */
.rpop{position:fixed;inset:0;z-index:45;background:rgba(8,14,17,.5);overflow-y:auto;padding:24px 16px}
.rpbox{position:relative;max-width:1040px;margin:0 auto;background:var(--ground);border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,.3);padding:4px 0 12px}
.rpbox .rpage{margin:0 auto} .rpx{position:sticky;top:8px;float:right;margin:8px 10px 0 0;z-index:2;width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:17px;cursor:pointer;box-shadow:var(--shadow)}
body.rpopen{overflow:hidden} @media(max-width:640px){ .rpop{padding:0} .rpbox{border-radius:0;min-height:100%} }
/* queue in the Locks office look (Brandon 2026-10-30) */
.rlk{max-width:min(1800px,calc(100vw - 48px))!important}
.rhead{display:flex;align-items:center;gap:12px;color:#fff;background:linear-gradient(135deg,var(--forest),var(--forest-2));border-radius:var(--radius);padding:12px 16px;margin-bottom:12px}
.rhead .logo{position:relative;width:46px;height:46px;flex:none} .rhead .logo img{width:46px;height:46px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.85),0 2px 8px rgba(0,0,0,.25);display:block}
.rhead .lk{position:absolute;right:-4px;bottom:-4px;width:20px;height:20px;border-radius:50%;background:var(--moose);display:grid;place-items:center;box-shadow:0 0 0 2px var(--forest)} .rhead .lk svg{width:11px;height:11px;color:#16220a}
.rhead h1{font-size:19px;margin:0;font-weight:800;letter-spacing:-.01em;line-height:1.15;color:#fff} .rhead .sub{font-size:13px;opacity:.8;font-weight:600} .rhead .grow{flex:1;min-width:0}
.rhead .deskbtn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;text-decoration:none;font-weight:800;font-size:14px;white-space:nowrap} .rhead .deskbtn svg{width:18px;height:18px}
.rhead .rhbtns{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end} .rhead .rsync{display:flex;align-items:center;gap:10px;min-height:40px;padding:4px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;max-width:560px} .rhead .rsync>svg{width:18px;height:18px;flex:none} .rhead .rsync b{display:block;font-size:13px;font-weight:800;line-height:1.2} .rhead .rsync small{display:block;font-size:11.5px;opacity:.85;line-height:1.3}
.rtabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.rtabs button{display:inline-flex;align-items:center;gap:8px;padding:9px 14px 9px 10px;font:inherit;font-size:14px;font-weight:800;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);cursor:pointer}
.rtabs button svg{width:22px;height:22px} .rtabs button.on{background:var(--forest-2);color:#fff;border-color:var(--forest-2)}
.rtabs .badge{background:var(--line);color:var(--ink-2);border-radius:999px;font-size:11.5px;padding:1px 7px} .rtabs .on .badge{background:rgba(255,255,255,.22);color:#fff}
.rlk .stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px}
.rlk .stat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 12px 10px;box-shadow:var(--shadow)}
.rlk .stat .n{font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1} .rlk .stat .l{font-size:12px;color:var(--muted);font-weight:700;margin-top:6px} .rlk .stat.warn .n{color:var(--red)}
.rlk .syncbar{display:flex;align-items:center;gap:12px} .rlk .syncbar .ic{width:40px;height:40px;border-radius:12px;background:var(--moose-soft);color:var(--forest-2);display:grid;place-items:center;flex:none} .rlk .syncbar .ic svg{width:20px;height:20px}
.rfg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;align-items:end} .rfg .field{display:block;margin:0} .rfg .field>span{display:block;font-size:13px;color:var(--ink-2);margin-bottom:5px;font-weight:700} .rfg input,.rfg select{width:100%;min-width:0;max-width:100%;box-sizing:border-box} .rfg .field{min-width:0}
.rgh{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:800;letter-spacing:.04em;color:var(--muted);margin:16px 2px 8px;cursor:pointer;user-select:none}
.rgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px} .rgrid>.card{margin:0}
.rhome{display:block;text-decoration:none;color:inherit;position:relative;overflow:hidden;padding-left:20px!important} .rhome:hover{border-color:var(--forest-2)}
.rhome::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--kc,var(--line-2))}
.k-airbnb{--kc:#e0565b;--ks:#fde8e8} .k-vrbo{--kc:#2463a0;--ks:#e3edf8} .k-direct{--kc:#4f7a18;--ks:#eaf3da} .k-ota{--kc:#7a6a55;--ks:#efebe5} .k-oguest{--kc:#0f8a84;--ks:#dff3f1} .k-owner{--kc:#7a4bb0;--ks:#efe7f8}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) .kpill{--ks:color-mix(in srgb,var(--kc) 22%,transparent)} }
:root[data-theme="dark"] .kpill{--ks:color-mix(in srgb,var(--kc) 22%,transparent)}
.kpill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:2px 9px;font:inherit;font-size:11.5px;font-weight:800;background:var(--ks);color:var(--kc);border:1px solid transparent;white-space:nowrap}
.kpill::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--kc)}
.rqfind{display:block;margin:0 0 10px} .rqfind input{width:100%;box-sizing:border-box;font-size:16px;padding:11px 14px;border-radius:12px} .rkinds{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px} .rkinds .kpill{font-size:13px;padding:5px 11px;cursor:pointer} .rkinds .kpill .n{opacity:.7;font-weight:700}
.rkinds .kpill.on{border-color:var(--kc)} .rkinds .kpill.dim{opacity:.45}
.rhome .rtop{display:flex;justify-content:space-between;gap:8px;align-items:flex-start} .rhome .rtop>.pill{flex:none} .rhome .rcode{font-size:20px;font-weight:800;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rhome .rsub{font-size:13.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .rhome .rdates{font-size:13.5px;margin-top:6px}
.rhome .rmeta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px} .rhome .rmeta .pill{font-size:11.5px;padding:2px 8px}
.rhome .progress{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin-top:10px} .rhome .progress i{display:block;height:100%;background:linear-gradient(90deg,var(--moose),var(--moose-2));border-radius:99px}
@media(max-width:1100px){ .rfg{grid-template-columns:repeat(3,minmax(0,1fr))} }
@media(max-width:640px){ .rlk{max-width:none!important} .rlk .stats{grid-template-columns:repeat(2,1fr)} .rfg{grid-template-columns:1fr 1fr} .rgrid{grid-template-columns:1fr} .rhead .deskbtn span{display:none} .rhead{flex-wrap:wrap} .rhead .rhbtns{flex-basis:100%;justify-content:flex-start} .rhead .rsync{max-width:none;flex:1} .rtabs button{padding:7px 10px 7px 8px;font-size:13px} }`;
const CH = { abnb:"Airbnb", vrbo:"VRBO / VRPC / Phone", ws:"Whimstay / BDC / Hopper", oguest:"Owner guest", owner:"Owner stay" };
// waiting_pay is never saved: a Checkout stay with a balance still due shows there (Kim 2026-11-02, see prep)
const STAGE = { in_progress:"In progress", waiting_pay:"Waiting on payment", checkout:"Checkout", owner_done:"Owner stay done", cancelling:"Cancellations", closed:"Closed" };
// Neighborhoods: unit code prefix -> name (maintenance_desk/units.json "communities", from Track units)
const HOODS = {"BHL":"Bear Hollow Lodges","BHR":"Bear Hollow Ridge","BHV":"Bear Hollow Village","BRR":"Black Rock Ridge","BSR":"Blackstone Residences","CH":"Carriage House",
  "CR":"Coyote Ridge","CV":"Crestview","DR":"Discovery Ridge","DS":"Deer Springs","EH":"Edelweiss Haus","FB":"Fox Bay","FP":"Foxpoint","HS":"Hailstone Heights",
  "JDR":"Jordanelle Ridge","JE":"Jordanelle Estates","JMR":"Jeremy Ranch","KR":"Klaim Retreats","MFL":"Mayflower Lakeside","MFV":"Mayflower Village","ML":"Moose Lodge",
  "NC":"New Claim","PE":"Parks Edge","PL":"Prospector Lodge","PV":"Pioche Village","PW":"Powderwood Pines","PWV":"Park West Village","RC":"Racquet Club",
  "RJ":"Retreat at Jordanelle","RP":"Red Pine","SCV":"Silver Creek Village","SS":"Sunspot","ST":"Ski Team","SW":"The Mason at Stillwater","TK":"Three Kings",
  "UM":"Upper Main","VS":"Village at the Shores","WG":"Westgate","WP":"White Pine","WS":"Wasatch Springs"};
const area = u => ((/^(?:2H-|L-)?([A-Za-z]+)/.exec(u || "") || [])[1] || "").toUpperCase();
// "Open" buttons (Brandon 2026-10-28): links from the Reservation Desk board's config/links (checklist PDFs + verified in Track/Safely Sep 2026);
// Keycafe = its Bookings page (keycafe.com, seen 2026-10-28). {res} is filled per stay.
const LINKS = {
  track: "https://moosemanagement.trackhs.com/pms/reservations/view/{res}/", autohost: "https://portal.autohost.ai/reservations",
  breezeway: "https://app.breezeway.io", brevo: "https://app.brevo.com/contact/list", safely: "https://portal.safely.com/organizations",
  prospector: "https://fs27.formsite.com/2XpG4h/form1/index.html", keycafe: "https://www.keycafe.com/desktop#!/bookings",
  westgate: "https://forms.office.com/Pages/ResponsePage.aspx?id=fujdTilSREuwP2RU5RjnVRoqMQGmOslJpfsf5h_4WBJUMVJGMEdEUU5aSDJIM1cyMjFNSDdIRExTTiQlQCN0PWcu" };
const LINK_NAME = { track:"Track", autohost:"Autohost", breezeway:"Breezeway", brevo:"Brevo", safely:"Safely", prospector:"Prospector form", keycafe:"Keycafe", westgate:"Westgate form" };
const STEP_LINK = {};
[["track", "i_campaign i_agent i_ta i_rate i_fees i_card i_guar i_contract i_notesq g_dates g_type g_contact g_notes o_open o_dates o_notes o_behalf w_post w_verify w_earn a_earn g_agree g_pay g_35 g_30 c_sig c_resend oc_cl oc_post oc_prime oc_pet oc_di oc_nofee oc_doc_o oc_doc_g gp_cl gp_dw gp_not gp_pet gp_doc pt_ok pt_clean pt_fee pt_price pt_guar pt_collect pt_tag dc_set t_tag t_beyond t_di t_clean x_rent x_modify x_total x_add x_charge k_track k_refund k_zero k_pet pl_conf pl_tag wg_conf wg_tag ah_remind dc_keycard dc_meet x_add_ok p_split p_change p_second"],
 ["autohost", "ah_verified ah_extra ah_card ah_rev_easy ah_rev_mgr ah_link c_addr c_names_mgr"], ["safely", "ah_safely"], ["brevo", "ah_brevo"],
 ["breezeway", "bo_pre bo_notes bo_either bo_next5 bo_wg bo_wp bo_maint bo_og bg_insp k_bw x_avail"], ["prospector", "pl_form"], ["westgate", "wg_form"], ["keycafe", "dc_pv"]]
  .forEach(([k, keys]) => keys.split(" ").forEach(s => STEP_LINK[s] = k));
const openFor = (key, s) => { const k = STEP_LINK[key]; if(!k) return "";
  return `<a class="btn small" style="min-height:28px;padding:0 9px;font-size:12px" href="${esc(LINKS[k].replace("{res}", encodeURIComponent(s.res)))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${LINK_NAME[k]} ↗</a>`; };
// Office Received (Brandon 2026-11-06): Track's API can't change a campaign, so this opens the stay in Track to set it by hand
const CAMP_HOW = "In Track: on the reservation, change Campaign to Office Received and save. The hub ticks this step on its next check (about 30 minutes).";
const campBtn = s => `<a class="btn small primary" style="min-height:28px;padding:0 9px;font-size:12px" href="${esc(LINKS.track.replace("{res}", encodeURIComponent(s.res)))}" target="_blank" rel="noopener" title="${esc(CAMP_HOW)}" onclick="event.stopPropagation()">Set Office Received in Track ↗</a>`;
const WAIT = ["Guest to reply", "Owner to reply"];
// 🙋 Ask a manager (Brandon 2026-10-30): Slack DM to the managers on shift; their reply comes back here (res_ask_notify.py)
const askBtn = step => `<button class="btn small" data-ask="${step}" style="min-height:28px;padding:0 9px;font-size:12px">🙋 Ask a manager</button>`;
const askLine = a => `<div style="padding:4px 0;border-top:1px solid var(--line)">🙋 <b>${esc(a.by_name || "")}</b> asked ${esc(when(a.at))}: “${esc(a.note)}”`
  + (a.status === "open" ? ` <span class="pill amber">${a.sent && a.sent.length ? "Waiting on " + esc(a.sent.map(x => x.name === "Kimberley" ? "Kim" : x.name).join(" + ")) : "Sending…"}</span>`
     : ` <span class="pill ${a.status === "approved" ? "green" : "blue"}">${a.status === "approved" ? "Approved" : "Answered"} by ${esc(a.answered_by || "")}</span><div style="margin-left:22px">“${esc(a.answer || "")}”</div>`) + `</div>`;
const WG_NOTE = "No cleaning by Westgate. Moose Management team to clean upon checkout. All other charges, including trash/tidy, are the guest's responsibility. Check-in is after 4 p.m. Check-out is by 10 a.m. Please approve any early check-ins or late check-outs with the Moose Management team.";
const formText = (s, wg) => { const o = s.occ || {};
  return [`Guest: ${s.guest || ""}`, `Unit: ${s.unit || ""}`, `Arrive: ${s.arrive}`, `Depart: ${s.depart}`, `Guests: ${o.adults || 0} adults${o.children ? ", " + o.children + " kids" : ""}`, `Reservation #${s.res}`,
    ...(wg ? ["", "Comments: " + WG_NOTE, ...(o.pets ? ["Pet: please charge the management company, not the guest, for pet fees."] : [])] : [])].join("\n"); };
const FD_T = n => `https://moosemanagement.freshdesk.com/a/tickets/${n}`;
const fdLink = (t, s) => { const f = s.td && s.td.fdc; const x = f && (t === "pl_form" || t === "pl_conf" ? f.pl : t === "wg_form" || t === "wg_pet" ? f.wg : null);
  return x ? `<a class="btn small" style="min-height:28px;padding:0 9px;font-size:12px" href="${FD_T(x.t)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Freshdesk #${x.t} ↗</a>` : ""; };
const ABB_RES = s => s.td && s.td.alt && /^HM/i.test(s.td.alt) ? `https://www.airbnb.com/hosting/reservations/details/${encodeURIComponent(s.td.alt)}` : "";
const abbLink = (t, s) => (t === "i_reviews" || t === "i_msgs") && ABB_RES(s)
  ? `<a class="btn small" style="min-height:28px;padding:0 9px;font-size:12px" href="${ABB_RES(s)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${t === "i_reviews" ? "Guest on Airbnb" : "Airbnb messages"} ↗</a>` : "";
const msgOwed = s => !!(s.td && s.td.msgs && s.td.msgs.lastIn && !(s.td.msgs.lastOut && s.td.msgs.lastOut > s.td.msgs.lastIn));
const copyBtn = (t, s) => t === "pl_form" ? `<button class="btn small" data-uaa="1" style="min-height:28px;padding:0 9px;font-size:12px">📝 Fill the UAA form</button>`
  : t === "wg_form" && !s.steps.find(x => x.key === t).done ? `<button class="btn small" data-copyform="${t}" style="min-height:28px;padding:0 9px;font-size:12px">📋 Copy details</button>` : "";
// Prospector's UAA form (fs27.formsite.com/2XpG4h/form1, fields read 2026-10-30). Formsite pre-fill is off on Prospector's account,
// so the hub lists each field in the form's order with a copy button. Agency/contact/times = Moose standard; check with Janae.
const usDate = d => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}/${d.slice(0, 4)}` : "";
const uaaFields = s => [["Unit#", (s.unit || "").replace(/^(L-|2H-)?PL\s*/i, "")], ["Owner/Agent Name", "Moose Management"], ["Agency Entity", "Moose Management"],
    ["Agent Phone/Email", "435-714-6544 / hello@moosemanagement.com"], ["Guest 1 full name", s.guest || ""], ["Guest 2 full name", "(from Autohost, if any)"], ["Guest 3 full name", "(from Autohost, if any)"],
    ["Arrival Date", usDate(s.arrive)], ["Check-In Time", "4:00 PM"], ["Departure Date", usDate(s.depart)], ["Check-Out Time", "10:00 AM"],
    ["Today's Date", usDate(new Date().toISOString().slice(0, 10))], ["Car Make & Model and License Plate #", ""], ["DL# & Issuing State", ""]];
function uaaPanel(s){
  let m = document.getElementById("ruaa"); if(m) m.remove();
  m = document.createElement("div"); m.id = "ruaa";
  m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60;display:grid;place-items:center;padding:16px";
  m.innerHTML = `<div class="card" style="max-width:560px;width:100%;max-height:90vh;overflow:auto;margin:0">
    <div style="display:flex;align-items:center;gap:8px"><b style="flex:1">UAA form · ${esc(s.unit || "")} · ${esc(s.guest || "")}</b><button class="btn small" id="ruaa_x">✕</button></div>
    <p class="muted" style="margin:6px 0 10px">Open the form, then copy each line in order. Check the times and contact line before sending. Extra guests who need a key card go in Guest 2 and 3.</p>
    <a class="btn small" href="${esc(LINKS.prospector)}" target="_blank" rel="noopener" style="margin-bottom:8px">Open the UAA form ↗</a>
    ${uaaFields(s).map(([l, v], i) => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line)">
      <span class="muted" style="width:170px;flex:none;font-size:13px">${esc(l)}</span><b style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(v) || '<span class="muted" style="font-weight:400">—</span>'}</b>
      ${v && !v.startsWith("(") ? `<button class="btn small" data-uv="${i}" style="min-height:28px;padding:0 9px;font-size:12px">Copy</button>` : ""}</div>`).join("")}</div>`;
  document.body.appendChild(m);
  const f = uaaFields(s);
  m.onclick = e => { if(e.target === m || e.target.id === "ruaa_x") m.remove(); };
  m.querySelectorAll("[data-uv]").forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(f[+b.dataset.uv][1]); b.textContent = "Copied ✓"; } catch(_){ prompt("Copy this:", f[+b.dataset.uv][1]); } });
}
let B = null, loadedAt = 0;
const money = v => v == null ? "—" : "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 });
const day = s => s ? new Date(s + "T12:00").toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }) : "";
const dayY = s => { if(!s) return "—"; const d = new Date(String(s).slice(0, 10) + "T12:00");
  return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { month:"short", day:"numeric" } : { month:"short", day:"numeric", year:"numeric" }); };
const when = s => s ? new Date(s).toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "";
const folioUrl = r => "https://moosemanagement.trackhs.com/pms/guest-folio/view/?id=" + encodeURIComponent(r);

// for Ask Penny (hub.html pennyCtx): which stay this check list is about
window.resCtx = r => { const s = B && B.stays.find(x => String(x.res) === String(r));
  return s ? { res:String(s.res), home:s.unit, guest:s.guest, arrive:s.arrive, depart:s.depart, status:s.status, state:s.state,
    // what's left (Penny coaches people through it, Brandon 2026-10-29): required steps not done, what holds it up, home heads-ups
    left:(s.steps || []).filter(t => !t.opt && !t.done).map(t => `${t.grp}: ${t.label}`).slice(0, 30), blockers:s.blockers || [],
    heads:(s.heads || []).map(a => a.title || a.text || a.what || "").filter(Boolean).slice(0, 3) } : { res:String(r) }; };
async function load(force){
  if(B && !force && Date.now() - loadedAt < 60000) return B;
  const [r, al, ch, sn] = await Promise.all([sb.rpc("res_board"), sb.rpc("hub_home_alerts"), sb.rpc("res_charge_allowed"), sb.rpc("res_auto_seen_list")]); if(r.error) throw r.error;
  B = r.data; loadedAt = Date.now();
  if(B) B.alerts = al.data || [];   // home heads-ups (hub_penny_3.sql, Brandon 2026-10-28): warn before booking a home with a big open problem
  if(B) B.canCharge = ch.data === true;   // charge-the-balance button (hub_res_charge.sql switch + access)
  if(B){ const ak = await sb.from("res_asks").select("id,res,step_key,note,by_name,at,status,answer,answered_by,answered_at,sent")
      .gte("at", new Date(Date.now() - 3 * 864e5).toISOString()).order("id", { ascending:false });
    B.asks = (ak.data || []).filter(a => !/^Test entry/.test(a.answer || ""));
    // declined payments from the daily check (daily_checks.py failed_payments: Track payment plans that failed in the last 7 days)
    B.failed = {};
    try { const fp = await sb.from("hub_check_runs").select("day,items").eq("check_key", "failed_payments").order("id", { ascending:false }).limit(1);
      const run = (fp.data || [])[0];
      if(run && run.day >= addDay(B.today, -2)) (Array.isArray(run.items) ? run.items : []).forEach(i => { if(i && i.res) B.failed[String(i.res)] = i; });
    } catch(e){} }
  if(B) B.stays.forEach(prep);
  if(B) seenRecord(sn && sn.data);
  return B;
}
/* ---------- When each automatic tick happened (Brandon 2026-11-03: "date and time next to all automations").
   Real time when the data has one (exact); otherwise the first time the hub saw the step done ("by …", res_auto_seen). */
function seenRecord(seen){
  B.seen = seen || {};
  const now = new Date().toISOString(), add = [];
  B.stays.forEach(s => s.steps.forEach(t => { if(t.auto && !t.tick && !(B.seen[s.res] || {})[t.key]){
    add.push({ res:s.res, step:t.key, src:t.auto }); (B.seen[s.res] = B.seen[s.res] || {})[t.key] = now; } }));
  for(let i = 0; i < add.length; i += 2000) sb.rpc("res_auto_seen_add", { p_items:add.slice(i, i + 2000) }).then(() => {}, () => {});
}
const lastOf = a => (a || []).filter(Boolean).sort().slice(-1)[0] || null;
function autoWhen(s, t){
  const td = s.td || {}, pays = (td.tx && td.tx.payDates) || [];
  const exact = { agreement_sent:() => trkSeen(s, CONTRACT_IDS), agreement_received:() => trkSeen(s, [10]),
    trk_35:() => trkSeen(s, [71, 72]), trk_adv:() => trkSeen(s, [99]),
    td_msgs_ok:() => td.msgs && td.msgs.lastOut, hk_any:() => lastOf((s.hk || []).map(m => m.at)),
    hk_after_cancel:() => lastOf((s.hk || []).map(m => m.at)), hk_after_extend:() => lastOf((s.hk || []).map(m => m.at)),
    td_paid_some:() => pays.slice().sort()[0], pay_due:() => lastOf(pays), balance_zero:() => lastOf(pays) }[t.autoKey];
  const at = exact && exact();
  if(at) return { at, exact:true };
  const seen = (B.seen && B.seen[s.res] || {})[t.key];
  return seen ? { at:seen, exact:false } : null;
}
const whenAny = at => at && at.length === 10 ? day(at) : when(at);
// Safely excludes these Track types (Kim, OneNote, 2026-10-30; Janae is asking Safely for the full list)
// Kim 2026-11-02: Safely won't insure a type named "Owner ..." (Owner Stay, Owner Guest ...), so DI stays use the O-Guest types (OGPA, OGOP-DI)
const SAFELY_NO = /^owner|^3month\+ 10% commission$/i, OWNER_NAMED = /^owner/i;
const OG_TYPE = /^(owner guest|o-?\s?guest)/i, OG_DI = /add di/i, OG_RENT = /guest pays rent/i;
const DW_FEE = f => /damage waiver|safely/i.test(f.n);   // "Damage Waiver Crossout" counts too (same as td_fees)
const hasDW = s => !!(s.td && (s.td.fees || []).some(DW_FEE));
const daysTo = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);
// Owner guest payment rule (Kim/Janae 2026-11-02): 10% down at booking when 30+ days out; full payment inside 30 days
const payDue = s => { const tot = (s.paid || 0) + Math.max(0, s.balance || 0), d = daysTo(B.today, s.arrive);
  return Math.round((d > 30 ? tot * 0.10 : tot) * 100) / 100; };
// Autohost review a front desk person may approve: only "Guest under 25" (and "Last minute reservation") at a studio-2 BR (Kim 2026-10-30)
const UNDER25_OK = /^\s*(guest under 25|last minute reservation)\s*$/i;
// Stays booked before the Oct 30 rules (Brandon 2026-10-30: "yes" to grandfathering) keep what the old steps said, so the team isn't
// asked to redo work: names = contract came back; Autohost review = the old "Under review" tick or Autohost Verified; contact = address + email.
const GF_DAY = "2026-10-30";
const GRANDFATHER = {
  c_sig:       s => autoOk(s, "agreement_received"),
  ah_rev_mgr:  (s, k) => !!(k.ah_review && k.ah_review.d) || autoOk(s, "ah_verified"),
  ah_rev_easy: (s, k) => !!(k.ah_review && k.ah_review.d) || autoOk(s, "ah_verified"),
  c_addr:      s => tdOk(s, "td_contact_addr") };
// What applies to this stay, what is done, what holds it up.
function conds(s){
  const u = (s.unit || "").toUpperCase(), occ = s.occ || {}, cx = s.status === "Cancelled" || (s.list && s.list.stage === "cancelling");
  const rv = !!(s.ah && s.ah.verify === "review"), rl = (s.ah && s.ah.rules) || [], ahOk = autoOk(s, "ah_verified");
  const easy = rl.length > 0 && rl.every(r => UNDER25_OK.test(r)) && s.beds != null && s.beds <= 2;   // same rule as res_tick()
  return { pets:(occ.pets || 0) > 0, pl:u.startsWith("PL "), wg:u.startsWith("WG "), pv:u.startsWith("PV "), wp:u.startsWith("WP "),
    thirty:(s.nights || 0) >= 30, parent:u === "ST 14" || u === "UM 3013" || u === "BHV 5604", gp:/guest pays/i.test(s.type || ""), op:!/guest pays/i.test(s.type || ""),
    extend:!!(s.list && s.list.extending), cancel:cx, cxlate:cx && !!s.cancelledAt && s.cancelledAt.slice(0, 10) >= s.arrive,
    // round 4 (Kim + Janae 2026-10-30): Safely only on insured types; door code by home; Autohost review: who may approve; reminder when half done
    safely:s.chan !== "owner" && !SAFELY_NO.test(s.type || ""), keycard:u.startsWith("PL ") || u.startsWith("WG "), wp129:u === "WP 129",
    codehome:!(u.startsWith("PL ") || u.startsWith("WG ") || u === "WP 129"),
    review:rv, review_easy:rv && easy, review_hard:rv && !easy,
    half:!cx && !["owner", "oguest"].includes(s.chan) && ahOk !== (s.agreement === "received") };   // owner guests do no ID check (Janae 2026-11-02)
}
function autoOk(s, a){
  switch(a){
    case "campaign": return /^office received$/i.test(s.campaign || "");
    case "agent": return !!s.agent;
    case "guarantee": return /10\/40\/50/.test(s.guarantee || "");
    case "agreement_sent": return ["sent","viewed","received"].includes(s.agreement);
    case "agreement_received": return s.agreement === "received";
    case "ah_verified": return !!(s.ah && s.ah.verify === "verified") || tag(s, /^autohost verified$/i);
    case "cancelled": return s.status === "Cancelled";
    case "og_type": return OG_TYPE.test(s.type || "") && !(hasDW(s) && OWNER_NAMED.test(s.type || ""));   // DI on an "owner" type = Safely won't cover it
    case "pay_due": return (s.paid || 0) + 0.01 >= payDue(s);
    case "og_pet_known": return tag(s, PETS) || tag(s, /^no pets$/i) || (s.occ && s.occ.pets || 0) > 0;
    // Home takes dogs: Track unit allows pets, no "No Pets" tag, and no more pets than the cap (2, or a property rule "Pet cap: N")
    case "pets_ok": { const cap = Math.min(2, ...s.rules.map(r => +((/pet cap:\s*(\d+)/i.exec(r.text) || [])[1] || 9)));
      return s.unitPets === true && (s.occ && s.occ.pets || 0) <= cap && !tag(s, /^no pets$/i); }
    case "bw_clean": return bwClean(s);
    // #housekeeping @Cheree messages naming this home (slack_hk.py) — after the cancel / after it was marked extending / any
    case "hk_after_cancel": return !!(s.cancelledAt && (s.hk || []).some(m => m.at.slice(0, 10) >= s.cancelledAt));
    case "hk_after_extend": return !!(s.list && s.list.extAt && (s.hk || []).some(m => m.at >= s.list.extAt));
    case "hk_any": return !!(s.hk && s.hk.length);
    // every extra guest with an email (Autohost portal) is on Brevo "AH Guest of Guest" — or there are none (brevo_guests.py, counts only)
    case "brevo_ok": return !!(s.brevo && (s.brevo.extra === 0 || s.brevo.inBrevo >= s.brevo.extra));
    case "balance_zero": return s.balance != null && Math.abs(s.balance) < 0.005;
    case "ah_portal": return !!(s.ah && s.ah.portal === true);
    // Breezeway (bw_res_tasks.py): matched by home + scheduled date, names as the team uses them (Oct 2026 tasks)
    case "bw_pre_out": return bwHas(s, "housekeeping", /pre-?clean/i, addDay(s.arrive, -5), s.arrive) && bwClean(s);
    case "bw_owner_next_chris": return bwHas(s, "inspection", /owner next/i, addDay(s.arrive, -4), s.arrive, /chris robinson/i);
    case "bw_in_out": return bwInOut(s);
    // White Pine 129: both inspections assigned to the home manager, Lindsay Lewis (Janae 2026-10-30)
    case "bw_wp_lindsay": return bwHas(s, "inspection", /check-?in/i, s.arrive, s.arrive, /linds(i|ay)/i) && bwHas(s, "inspection", /check-?out/i, s.depart, s.depart, /linds(i|ay)/i);   // Breezeway spells it "Lindsi Lewis"
    case "bw_og": return bwInOut(s) && bwClean(s);
    case "bw_wg": return bwHas(s, "housekeeping", /wg housekeeping/i, s.depart, s.depart);
    case "bw_no_clean": return bwKnown(s) && !(s.bw || []).some(t => t.dp === "housekeeping" && t.sd === s.depart && t.st !== "done")
      || bwKnown(s) && B.stays.some(o => o !== s && o.unit === s.unit && o.status !== "Cancelled" && (o.depart === s.depart || o.arrive === s.depart));
  }
  if(a && a.startsWith("td_")) return tdOk(s, a);
  return false;
}
// Track details (track_res_details.py): tag names, document subjects + status, fee names (+ owner charge), note flags, door code set.
const tag = (s, re) => !!(s.td && (s.td.tags || []).some(t => re.test(t)));
const fee = (s, re, own) => !!(s.td && (s.td.fees || []).some(f => re.test(f.n) && (own == null || f.own === own)));
const doc = (s, re, done) => !!(s.td && (s.td.docs || []).some(d => re.test(d.s) && d.st !== "voided" && (!done || d.st === "completed")));
function tdOk(s, a){
  if(!s.td) return false;
  const R = TD_RULES[a]; return !!(R && R(s));
}
// Names as they are in Track on 2026-10-28 (tags, fee charge names, esign document subjects) — track_res_details.py pull of 456 stays.
const PETS = /^\d+\s*pets?$/i, OWNER_CL = /cleaning & laundry|clean\/laundry/i;
// VRBO / direct pet fee (Kim + Pyper 2026-11-03): Track adds "Pet Hosting Fee (Adjust)" at $1 a pet; staff set it to $25 a night per pet,
// at least $100 and at most $350 per pet (monthly 30+ nights: $450 + $200 a month, not checked). track_res_details keeps v (amount) + q
// (quantity) on pet fees only. 2 pets at 13+ nights: the cap ($600 or $700) isn't settled yet, so no "doesn't match" there.
const PET_FEE_RE = /pet hosting|pet fee|pet approval/i;
function petFee(s){
  const fs = ((s.td && s.td.fees) || []).filter(f => PET_FEE_RE.test(f.n)), pets = (s.occ && s.occ.pets) || 0;
  if(!fs.length) return { ok:false, none:true, pets };
  const kn = fs.filter(f => f.v != null);
  if(!kn.length) return { ok:true, pets };   // amount not read yet (older copy): name only, as before
  const v = kn.reduce((a, f) => a + f.v, 0), q = kn.reduce((a, f) => a + (f.q || 0), 0), ph = v <= Math.max(q, pets, 1) + 0.005;
  const per = Math.max(100, Math.min(350, (s.nights || 0) * 25)), want = (s.nights || 0) >= 30 || !pets ? null : pets * per;
  return { ok:!ph, ph, v, per, want, pets, off:!ph && want != null && Math.abs(v - want) > 0.5 && !(pets > 1 && (s.nights || 0) * 25 > 300) };
}
const TD_RULES = {
  td_pet_tag:    s => tag(s, PETS),
  td_pet_owner:  s => tag(s, PETS) && fee(s, /pet/i),
  td_pet_gp:     s => tag(s, PETS) && fee(s, /pet/i, false),
  td_pet_clean:  s => fee(s, /pet cleaning/i),
  td_pet_fee:    s => s.chan === "abnb" ? fee(s, PET_FEE_RE) : petFee(s).ok,   // Airbnb: name only until Kim's Nov 20 flat fee
  td_30:         s => tag(s, /over 30 nights/i),
  td_pcwg:       s => tag(s, /pc\/wg confirmed/i),
  td_ticket:     s => !!(s.td.notes && s.td.notes.ticket),
  td_og_tag:     s => tag(s, /^owner guest$/i),
  td_door:       s => s.td.door === true,
  td_card:       s => s.td.card === true,
  td_fees:       s => fee(s, /clean/i, false) && fee(s, /damage waiver/i) && fee(s, /admin|guest services/i),   // Admin fee renamed "Guest Services Fee" (Kim 2026-10-30)
  td_gp_cl:      s => fee(s, /clean\/laundry\)?\s*gp|owner guest.*clean/i, false),   // "Owner Guest (Clean/Laundry) GP" (Track 2026-11-02)
  td_dw:         s => hasDW(s),
  td_nofee_ok:   s => OG_DI.test(s.type || "") ? hasDW(s) : !hasDW(s),
  td_og_conf:    s => doc(s, /rental confirmation/i),   // e-sign subject "Park City Rental Confirmation-Action Required" (docs 25 / 62)
  td_gp_not:     s => !fee(s, OWNER_CL, true),
  td_owner_cl:   s => fee(s, OWNER_CL, true),
  td_no_dw:      s => !hasDW(s),
  td_pet_doc:    s => doc(s, /pet/i),
  td_pet_doc_ok: s => doc(s, /pet/i, true),
  td_addendum:   s => doc(s, /change addendum/i),
  td_card_auth:  s => doc(s, /credit card authorization|secondary guest/i),
  td_paid_some:  s => (s.paid || 0) > 0,
  // round 2 (2026-10-28): Track contact yes/no, notes, 30+ night fees, Advantage Dropbox file
  td_contact_ep:   s => !!(s.td.contact && s.td.contact.email && s.td.contact.phone),
  td_contact_addr: s => !!(s.td.contact && s.td.contact.address && s.td.contact.email),
  td_notes:        s => !!(s.td.notes && s.td.notes.n > 0),
  td_no_beyond:    s => !fee(s, /beyond/i),
  td_ext_clean:    s => fee(s, /extended stay cleaning/i),
  td_adv:          s => s.td.advantage === true,
  // round 3 (2026-10-29): travel agent id, folio payments/refunds (counts + dates only), extra guests named in the notes
  td_ta:           s => s.chan === "abnb" ? s.td.taId === 210 : s.td.taId != null && ![209, 210].includes(s.td.taId),   // 210 AIRBNB, 209 VRBO in Track
  td_earn:         s => !!(s.td.tx && s.td.tx.comm > 0),
  // refunded = a credit memo (Track's Refund Transaction), or nothing was ever collected; a voided payment alone does NOT count
  td_refund:       s => s.status === "Cancelled" && !!s.td.tx && (s.td.tx.credit > 0 || (s.td.tx.pay === 0 && s.td.tx.void === 0)),
  td_ext_paid:     s => !!(s.list && s.list.extAt && s.td.tx) && doc(s, /change addendum/i, true) && (s.td.tx.payDates || []).some(d => d >= s.list.extAt.slice(0, 10)),
  // round 4 (2026-10-30): contact needs a phone too; door code kind (never the code); signed change addendum
  td_contact_all:  s => !!(s.td.contact && s.td.contact.address && s.td.contact.email && s.td.contact.phone),
  td_door_keycard: s => s.td.doorKind === "keycard",
  td_door_meet:    s => s.td.doorKind === "meet",
  td_addendum_ok:  s => doc(s, /change addendum/i, true),
  // Freshdesk (fd_confirm.py): Prospector's "Unit Access Authorization Form Result" reply; Westgate's form receipt (+ pet line)
  // Track folio events (comm.guest-message): nothing from the guest, or our reply came after their last message
  td_msgs_ok:      s => !!(s.td.msgs && (!s.td.msgs.lastIn || (s.td.msgs.lastOut && s.td.msgs.lastOut > s.td.msgs.lastIn))),
  td_pl_conf:      s => !!(s.td.fdc && s.td.fdc.pl),
  td_pl_noted:     s => !!(s.td.fdc && s.td.fdc.pl && s.td.notes && s.td.notes.ticket),
  td_wg_sent:      s => !!(s.td.fdc && s.td.fdc.wg),
  td_wg_pet:       s => !!(s.td.fdc && s.td.fdc.wg && s.td.fdc.wg.pet),
  td_extra_notes:  s => !!(s.td.notes && s.td.notes.extra && s.td.notes.extra[0] >= s.td.notes.extra[1]),
  // 2026-11-03: Track's own automations that fired on this stay (folio events stamp the automation number; track_res_details.py)
  trk_35:          s => trkHit(s, [71, 72]),   // Owner Guest Payment / Agreement Reminder (35 Days), Track sends to guest + owner
  trk_adv:         s => trkHit(s, [99]),       // 30+ Day Reservations to Advantage Mgmt. (RentalManager@amres.co + hello@)
};
/* ---------- Track automations (Track ▸ Automation jobs + triggers, read 2026-11-03 in Brandon's Chrome; numbers are Track's own).
   Shown with Track's logo: purple = Track's automation happened on this stay (with when), grey = it hasn't (yet).
   The hub sends none of these; it only shows what Track did. Review requests left out until Reviews is finished (Brandon). */
const trkSeen = (s, ids) => { const a = (s.td && s.td.auto) || {}; return ids.map(i => a[String(i)]).filter(Boolean).sort()[0] || null; };
const trkHit = (s, ids) => !!trkSeen(s, ids);
const GUEST = ["abnb", "vrbo", "ws"];
const CONTRACT_IDS = [35, 36, 38, 39, 40, 41, 42, 43, 44, 45, 74, 75, 76, 77, 78, 79, 82, 83, 84, 85, 86];
// "Not sent · … now" = Track never sent it and the thing it asks for is done now (no reason left to send it)
const docsIn = s => s.agreement === "received" && (s.chan !== "abnb" && s.chan !== "vrbo" && s.chan !== "ws" || autoOk(s, "ah_verified"));
const NN = "Not sent · documents are in now";
const TRK = [
  { l:"Rental agreement sent", ids:CONTRACT_IDS, on:s => GUEST.includes(s.chan), skip:s => !trkHit(s, CONTRACT_IDS) && ["sent", "received"].includes(s.agreement) ? "Sent another way (by hand or the channel)" : null },
  { l:"Contract / ID reminder · 6 hours", ids:[55, 56], on:s => GUEST.includes(s.chan), why:"only if the contract or ID is still missing", skip:s => docsIn(s) && NN },
  { l:"Contract / ID reminder · 24 hours", ids:[58, 59], on:s => GUEST.includes(s.chan), why:"only if still missing", skip:s => docsIn(s) && NN },
  { l:"Contract / ID reminder · 48 hours", ids:[62, 63], on:s => GUEST.includes(s.chan), why:"only if still missing", skip:s => docsIn(s) && NN },
  { l:"Contract reminder · 24 hours", ids:[57], on:s => s.chan === "oguest", why:"only if the agreement is still out", skip:s => docsIn(s) && "Not sent · agreement is back now" },
  { l:"Contract reminder · 72 hours", ids:[60], on:s => s.chan === "oguest", why:"only if still out", skip:s => docsIn(s) && "Not sent · agreement is back now" },
  { l:"35-day agreement reminder to guest + owner", ids:[72], on:s => s.chan === "oguest", why:"only if the agreement is still out", skip:s => docsIn(s) && "Not sent · agreement is back now" },
  { l:"35-day payment reminder to guest + owner", ids:[71], on:s => s.chan === "oguest", why:"only if a balance is still due", skip:s => (s.balance || 0) <= 1 && "Not sent · paid now" },
  { l:"Office told: owner guest agreement or payment not in", ids:[73], on:s => s.chan === "oguest", why:"only if missing", skip:s => docsIn(s) && (s.balance || 0) <= 1 && "Not sent · agreement + payment are in now" },
  { l:"Office told: e-sign document signed", ids:[10], on:s => GUEST.includes(s.chan) || s.chan === "oguest" },
  { l:"“Documents received” email to the guest", ids:[54], on:s => GUEST.includes(s.chan), why:"when the documents come in 4+ days before arrival" },
  { l:"Office told: day 4, documents still missing", ids:[91], on:s => GUEST.includes(s.chan), why:"only if missing", skip:s => docsIn(s) && NN },
  { l:"Office told: day 7, documents still missing", ids:[90], on:s => GUEST.includes(s.chan), why:"only if missing", skip:s => docsIn(s) && NN },
  { l:"Check-in info (78 hours before, or when documents come in inside 4 days)", ids:[9, 26, 48, 93, 61, 64, 65, 66, 87, 88, 89], on:s => GUEST.includes(s.chan) || s.chan === "oguest", why:"once the agreement is back and it's paid" },
  { l:"Door code text (24 hours before)", ids:[49, 50], on:s => GUEST.includes(s.chan) },
  { l:"First impressions email (day after check-in)", ids:[67], on:s => GUEST.includes(s.chan) },
  { l:"Departure email (18 hours before check-out)", ids:[68, 69, 70], on:s => GUEST.includes(s.chan) },
  { l:"Advantage Mgmt. told (30+ nights)", ids:[99], on:s => (s.nights || 0) >= 30 && s.chan !== "owner", why:"once the agreement is back and the ID is verified" },
];
const TRK_STEP = { i_contract:CONTRACT_IDS, g_35:[71, 72], t_email:[99] };   // check list steps Track's automations do
const trkLogo = (on, title) => `<span class="trk ${on ? "on" : ""}" title="${esc(title || "")}"><svg viewBox="0 0 500 354.4" aria-hidden="true"><path fill="currentColor" transform="translate(-303 2197)" d="M674.3-2197h-248c-68.5,0.4-123.7,56.2-123.3,124.7c0.4,67.9,55.4,122.9,123.3,123.3h85.8v-62h-85.8c-32.7,0-57.2-29.6-57.2-62c-0.7-30.9,23.8-56.5,54.7-57.2c0.8,0,1.6,0,2.5,0h248c30.9-0.7,56.6,23.9,57.2,54.8c0,0.8,0,1.6,0,2.4c0,32.4-24.5,62-57.2,62h-85.8v157.4l52.5-95.4h33.4c69.6,0,128.8-55.1,128.8-124C803-2141.9,743.9-2197,674.3-2197z"/><path fill="currentColor" opacity=".75" d="M284.9,354.4V185.5h92.8L284.9,354.4z"/></svg></span>`;
function trkSection(s, og){
  if(!s.td || !s.td.auto) return "";
  const rows = TRK.filter(r => r.on(s));
  if(!rows.length) return "";
  const got = rows.filter(r => trkHit(s, r.ids)).length;
  return `<details class="rgrp racc" data-g="Track automations" ${og === "*" || og === "Track automations" ? "open" : ""}><summary><h3>${trkLogo(got > 0, "Track automations")} Track automations <span class="muted" style="font-weight:600">${got} of ${rows.length} happened</span></h3></summary>
    ${rows.map(r => { const at = trkSeen(s, r.ids), sk = !at && r.skip && r.skip(s);
      return `<div class="rstep trkrow ${at ? "on" : ""}">${trkLogo(!!at, at ? "Track did this" : sk || "Not yet")}<span class="l">${esc(r.l)}${!at && !sk && r.why ? ` <span class="muted" style="font-size:12.5px">(${esc(r.why)})</span>` : ""}</span>
        <span class="who">${at ? "Track · " + esc(when(at)) : sk ? esc(sk) : "Not yet"}</span></div>`; }).join("")}</details>`;
}
const addDay =(d, n) => { const x = new Date(d + "T12:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const bwHas = (s, dp, re, from, to, who) => (s.bw || []).some(t => t.dp === dp && t.sd >= from && t.sd <= to && re.test(t.n) && (!who || (t.who || []).some(w => who.test(w))));
const bwClean = s => bwHas(s, "housekeeping", /^(?!.*(assessment|spring)).*(clean)/i, s.depart, s.depart);
const bwInOut = s => bwHas(s, "inspection", /check-?in/i, s.arrive, s.arrive) && bwHas(s, "inspection", /check-?out/i, s.depart, s.depart);
// Only trust "no clean left" when this home was in the Breezeway pull (it has a Breezeway id and the stay is in the window)
const bwKnown = s => !!B.bwUpdated && !(B.bwMissing || []).includes(s.unit) && s.depart >= addDay(B.today, -7) && s.arrive <= addDay(B.today, 75);
const AUTO_SRC = { brevo_ok:"Brevo", hk_after_cancel:"Slack", hk_after_extend:"Slack", hk_any:"Slack", ah_verified:"Autohost", ah_portal:"Autohost", bw_pre_out:"Breezeway", bw_owner_next_chris:"Breezeway", bw_in_out:"Breezeway", bw_wp_lindsay:"Breezeway", td_msgs_ok:"Track messages", trk_35:"Track automation", trk_adv:"Track automation", td_pl_conf:"Freshdesk", td_pl_noted:"Freshdesk", td_wg_sent:"Freshdesk", td_wg_pet:"Freshdesk", bw_og:"Breezeway", bw_wg:"Breezeway", bw_no_clean:"Breezeway" };
function prep(s){
  const c = conds(s), ticks = s.ticks || {};
  s.rules = B.rules.filter(r => { const p = r.unit.toUpperCase(), u = (s.unit || "").toUpperCase(); return p.endsWith(" %") ? u.startsWith(p.slice(0, -1)) : u === p; });
  s.area = area(s.unit);
  const uk = String(s.unit || "").replace(/^(L-|2H-)/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  s.heads = (B.alerts || []).filter(a => a.key === uk);
  s.steps = B.steps.filter(t => t.chans.includes(s.chan) && t.cond.every(k => c[k]))
    .map(t => { const k = ticks[t.key], au = t.auto && autoOk(s, t.auto), gf = !au && !k && GRANDFATHER[t.key] && (s.bookedAt || "") < GF_DAY && GRANDFATHER[t.key](s, ticks);
      return { ...t, autoKey:t.auto, tick:k, auto:au ? (AUTO_SRC[t.auto] || "Track") : gf ? "Earlier rule" : null, done:k ? k.d : !!(au || gf) }; });
  const req = s.steps.filter(t => !t.opt);
  s.need = req.length; s.got = req.filter(t => t.done).length;
  s.blockers = [...new Set(req.filter(t => !t.done && t.blocker).map(t => t.blocker))];
  const today = B.today;
  s.next = req.filter(t => !t.done).slice(0, 2).map(t => t.label);   // hand-off "next up" (Q8: what needs to be done next)
  s.alerts2 = []; s.dayFlag = 0;
  const live = s.status !== "Cancelled" && s.arrive >= today && !(s.list && s.list.stage === "closed");
  // Guests (not owners / owner guests): contract + ID + payment are due within 24 hours (house rules). Day 4 = notice, day 7 = act today (Kim 2026-11-02, Q10)
  if(live && ["abnb", "vrbo", "ws"].includes(s.chan) && s.bookedAt){
    const miss = [s.agreement !== "received" && "signed contract", !autoOk(s, "ah_verified") && "ID verification", s.chan !== "abnb" && !(s.paid > 0) && (s.balance || 0) > 0 && "payment"].filter(Boolean);
    const d = daysTo(String(s.bookedAt).slice(0, 10), today) + 1;   // booking day = day 1
    if(miss.length && d >= 4){
      s.dayFlag = d >= 7 ? 7 : 4; s.blockers.push(d >= 7 ? "Day 7: act today" : "Day 4: missing documents");
      s.alerts2.push({ lvl:d >= 7 ? "stop" : "warn", t:d >= 7
        ? `Day ${d} without the ${miss.join(", ")}. Act today: call the guest, send "FINAL NOTICE to Complete Reservation Requirements" with a deadline, then cancel${s.chan === "abnb" ? " (Airbnb: call Airbnb, we can't cancel it ourselves; our house rules say 24 hours)" : ""}. A manager handles this one.`
        : `Day ${d}: still no ${miss.join(", ")}. Track's reminders have gone; reach out now. Day 7 = act (call, last email, cancel).` }); }
  }
  // VRBO / direct walkthrough 2026-11-03: the contract sometimes doesn't send by itself (mostly direct bookings); pet fee left at $1
  if(live && ["vrbo", "ws"].includes(s.chan)){
    if(s.agreement === "not-sent" && s.bookedAt && String(s.bookedAt).slice(0, 10) < today){ s.blockers.push("Contract not sent");
      s.alerts2.push({ lvl:"stop", t:`Track hasn't sent the contract (booked ${day(String(s.bookedAt).slice(0, 10))}). Send it by hand from Track's e-Sign tab.` }); }
    const pf = (s.occ && s.occ.pets) ? petFee(s) : null;
    if(pf && pf.ph){ s.blockers.push("Pet fee still $1");
      s.alerts2.push({ lvl:"stop", t:`Pet fee is still Track's $1 placeholder (${money(pf.v)}). ${pf.want != null ? `Set it to ${money(pf.want)}: ${pf.pets} pet${pf.pets > 1 ? "s" : ""} × ${money(pf.per)} ($25 a night per pet, $100–$350 per pet).` : "Monthly stay: $450 a month for the first pet + $200 a month for a second."} Then add the pet cleaning fee.` }); }
    else if(pf && pf.off) s.alerts2.push({ lvl:"warn", t:`Pet fee is ${money(pf.v)}; the rule gives ${money(pf.want)} (${pf.pets} pet${pf.pets > 1 ? "s" : ""} × ${money(pf.per)}: $25 a night per pet, $100–$350 per pet). Check it.` });
  }
  // Owner guests: agreement + payment due now; 35-day reminder (Track sends it); 30 days = change it to an Owner Stay (Kim 2026-11-02, OG 23)
  if(live && s.chan === "oguest"){
    const d = daysTo(today, s.arrive), ty = s.type || "", miss = [s.agreement !== "received" && "signed agreement", !autoOk(s, "pay_due") && `payment (${money(payDue(s))} due now)`,
      !tdOk(s, "td_contact_ep") && "guest email + phone (ask the owner)"].filter(Boolean);
    if(miss.length && d <= 35) s.alerts2.push({ lvl:d <= 30 ? "stop" : "warn", t:d <= 30
      ? `${d} days out, still missing: ${miss.join(", ")}. Change it to an Owner Stay and send "Res Changed From OG to Owner" (the owner stays liable; the guest gets no check-in info).`
      : `${d} days out, still missing: ${miss.join(", ")}. Track's 35-day reminder goes to the guest; no check-in info until it's done.` });
    if(hasDW(s) && OWNER_NAMED.test(ty)) s.alerts2.push({ lvl:"stop", t:`Safely won't insure this stay: it has damage insurance but the type "${ty}" starts with "Owner". Change it to "O-Guest Owner Pays-Add DI" (free stay) or "O-Guest (Guest pays RENT/TAXES/FEES)" (discounted rent).` });
    else if(/guest pays/i.test(ty) && !hasDW(s)) s.alerts2.push({ lvl:"warn", t:"Guest pays fees: add damage insurance, and use an O-Guest type so Safely covers it." });
    if(OG_DI.test(ty) && !hasDW(s)) s.alerts2.push({ lvl:"warn", t:`Type is "${ty}" but there's no damage insurance fee yet.` });
    if(s.rent != null && OG_RENT.test(ty) && !(s.rent > 0)) s.alerts2.push({ lvl:"warn", t:"Guest pays RENT type with $0 rent: a free stay with DI should be \"O-Guest Owner Pays-Add DI\"." });
    if(s.rent != null && OG_DI.test(ty) && s.rent > 0) s.alerts2.push({ lvl:"warn", t:"Owner Pays-Add DI with rent on it: a discounted rate should be \"O-Guest (Guest pays RENT/TAXES/FEES)\"." });
  }
  s.stage = (s.list && s.list.stage) || (s.status === "Cancelled" ? "cancelling" : s.depart < today ? (s.chan === "owner" ? "owner_done" : "checkout") : "in_progress");
  // Kim 2026-11-02: Checkout only once nothing is owed, so a payment can't be missed. Still owed before check-out = Waiting on payment
  // (Track takes the later payments from the card); declined payment or no card for it = back to In progress.
  s.stageSet = s.stage; s.payWhy = ""; s.payFlag = "";
  s.waiting = (s.list && s.list.waiting) || [];
  // Janae, Pyper, Kim 2026-11-03: tabs move by themselves. Steps done + nothing held = Waiting on payment while anything is owed, else Checkout
  // (Checkout = paid in full, the next step; stays there after the guest leaves). A declined payment / no card stays in Waiting on payment with an alert.
  // A stage a PERSON picked (not the Asana import) sticks until a step is ticked after they picked it. Cancelled stays leave In progress / Checkout.
  // Q4 (same day): ANY balance, owed or credit, even cents and even after check-out (Vrbo commission pennies show up after the stay) = Waiting on payment.
  // Full payment is due 14 days before arrival, so a balance inside 14 days or after the stay, or a credit, is flagged. Cancelled = Cancellations tab.
  const bal = s.balance || 0, owed = Math.abs(bal) > 0.005 && s.status !== "Cancelled", fp = owed && B.failed && B.failed[String(s.res)];
  if(fp) s.payFlag = s.payWhy = fp.what || "Track declined a payment in the last few days.";
  else if(owed && bal < 0) s.payFlag = s.payWhy = `Credit of ${money(-bal)} on the folio: refund it or fix the folio.`;
  else if(owed && s.depart < today) s.payFlag = s.payWhy = "Checked out with a balance and no payment coming (Vrbo commission pennies show up like this).";
  else if(owed && s.td && s.td.card === false) s.payFlag = s.payWhy = "No card on file in Track for the payments still due.";
  else if(owed && daysTo(today, s.arrive) <= 14 && !(s.nights >= 30)) s.payFlag = s.payWhy = "Full payment was due 14 days before arrival. Check the payment schedule in Track.";
  if(s.stage === "closed" && owed) s.stage = "checkout";
  const L = s.list || {}, byPerson = L.stage && L.by && L.by !== "Asana import",
    tickedSince = byPerson && L.at && Object.values(ticks).some(k => k && k.at && k.at > L.at),
    ready = s.got >= s.need && !s.blockers.length && !s.waiting.length;
  if(s.status === "Cancelled" && (s.stage === "in_progress" || s.stage === "checkout")) s.stage = "cancelling";
  else if(s.stage === "in_progress" && ready && s.chan !== "owner" && (!byPerson || tickedSince)) s.stage = "checkout";
  if(s.stage === "checkout" && owed) s.stage = "waiting_pay";
  if(s.stage === "waiting_pay" && s.payFlag) s.blockers.push(fp ? "Payment declined" : /No card/.test(s.payFlag) ? "No card on file for the next payment" : "Balance off");
  s.state = s.stage === "closed" ? "Complete" : s.status === "Cancelled" && s.stage !== "closed" ? "Cancelling" : s.got === 0 ? "Not started"
    : s.got >= s.need ? (s.depart < today ? "Ready to close" : "Paperwork done") : s.waiting.length ? "Waiting" : "In progress";
}
function css(){ if(!document.getElementById("rescss")){ const st = document.createElement("style"); st.id = "rescss"; st.textContent = CSS; document.head.appendChild(st); } }
const fresh = () => `<p class="muted" style="margin:4px 0 10px">Source: Track reservations, updated ${esc(when(B.updated))}${B.ahUpdated ? ` · Autohost, updated ${esc(when(B.ahUpdated))}` : ""}${B.bwUpdated ? ` · Breezeway, updated ${esc(when(B.bwUpdated))}` : ""}</p>`;

/* ---------- queue */
const F = { q:"", chan:"", area:"", stage:"in_progress", held:"", by:"arrive", from:"", to:"", group:"date", kind:"" };
const RSHUT = new Set();
// how they booked (Brandon 2026-10-30: a color each); chan "vrbo" = VRBO + direct, split by the Track type
const KIND = { airbnb:"Airbnb", vrbo:"VRBO", direct:"Direct", ota:"Other sites", oguest:"Owner guest", owner:"Owner stay" };
const kindOf = s => s.chan === "abnb" ? "airbnb" : s.chan === "owner" ? "owner" : s.chan === "oguest" ? "oguest" : s.chan === "ws" ? "ota" : /vrbo|homeaway/i.test(s.type || "") ? "vrbo" : "direct";   // folded groups on the queue
// icons (same stroke style as the Locks office tabs)
const RSV = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const RI = { in_progress:RSV('<path d="M9 5h10M9 12h10M9 19h10"/><path d="M4 5l1 1 2-2M4 12l1 1 2-2"/><circle cx="5" cy="19" r="1"/>'),
  waiting_pay:RSV('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>'),
  checkout:RSV('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 16l-4-4 4-4M5 12h11"/>'),
  owner_done:RSV('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  cancelling:RSV('<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>'),
  closed:RSV('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>'),
  list:RSV('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  held:RSV('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
  sync:RSV('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>') };
// Sort + date range (Brandon 2026-10-28): by check-in, check-out or booking date; the from/to range applies to the same date
const BY = { arrive:"Check-in", depart:"Check-out", bookedAt:"Newest booking first" };   // 2026-11-06 Brandon: "sort by most recent reservation made" (same day = higher res # first; Track numbers go up as bookings are made)
// "Held up by" groups (Brandon 2026-10-30): pick the group, then filter down to one of its members
const HELD_GROUP = { Prospector:"On-site management", Westgate:"On-site management", "Payment declined":"Payment", "No card on file for the next payment":"Payment",
  "Day 7: act today":"Day 4 / day 7", "Day 4: missing documents":"Day 4 / day 7" };
const heldKey = b => HELD_GROUP[b] || b;
const heldHas = (s, k) => [...s.blockers, ...s.waiting].some(b => b === k || heldKey(b) === k);
async function queue(v){
  v.innerHTML = `<div class="page rpage rlk"><p class="muted">Loading…</p></div>`;
  try { await load(); } catch(e){ v.innerHTML = `<div class="page"><div class="card"><p>Couldn't load the check lists: ${esc(e.message)}</p></div></div>`; return; }
  if(!B){ v.innerHTML = `<div class="page"><div class="card"><h2>No access</h2><p class="muted">This desk isn't on your teams. Ask Brandon or Kim.</p></div></div>`; return; }
  const today = B.today, in7 = new Date(new Date(today + "T12:00").getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const stateCls = s => s.state === "Paperwork done" || s.state === "Ready to close" || s.state === "Complete" ? "green" : s.state === "Not started" ? "grey" : s.state === "Cancelling" ? "red" : "amber";
  // groups (like the Locks office neighborhoods): day of the sort date (month for the past lists) or neighborhood
  // Brandon 2026-11-03: Find searches every tab (a stay on Waiting on payment couldn't be found from In progress); results grouped by tab
  let ALLQ = false;
  const gKey = s => { if(F.group === "hood") return s.area || "~"; if(ALLQ) return "@" + s.stage; const d = String(s[F.by] || "").slice(0, 10); return F.stage === "in_progress" || F.stage === "waiting_pay" ? d : d.slice(0, 7); };
  const gName = k => { if(F.group === "hood") return k === "~" ? "Other" : (HOODS[k] || k) + " · " + k; if(k[0] === "@") return STAGE[k.slice(1)] || k.slice(1);
    if(!k) return "No date"; if(k.length === 7) return new Date(k + "-15T12:00").toLocaleDateString(undefined, { month:"long", year:"numeric" });
    return (k === today ? "Today · " : "") + new Date(k + "T12:00").toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric", year:k.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" }); };
  const tile = s => { const why = [...new Set([...s.waiting, ...s.blockers].map(b => HELD_GROUP[b] ? HELD_GROUP[b] + " · " + b : b))], pct = s.need ? Math.round(100 * s.got / s.need) : 0;
    return `<a class="card rhome k-${kindOf(s)}" href="#/reservations/${encodeURIComponent(s.res)}">
      <div class="rtop"><div style="min-width:0"><div class="rcode">${esc(s.guest || "#" + s.res)}</div>
        <div class="rsub"><b>${esc(s.unit || "")}</b>${HOODS[s.area] ? " · " + esc(HOODS[s.area]) : ""}</div></div>
        <span class="pill ${stateCls(s)}">${esc(s.state)}</span></div>
      <div class="rdates"><b>${esc(dayY(s.arrive))} → ${esc(dayY(s.depart))}</b> · ${esc(s.nights)} nights<span class="muted"> · booked ${esc(dayY(s.bookedAt))} · #${esc(s.res)}</span></div>
      <div class="rmeta"><span class="kpill k-${kindOf(s)}">${esc(KIND[kindOf(s)])}${s.type && !/^(airbnb|vrbo|owner stay|guest)$/i.test(s.type) ? " · " + esc(s.type.replace(/^(Owner Guest|O-Guest)\s*/i, "")) : ""}</span>${s.vip ? `<span class="pill blue">VIP</span>` : ""}${s.dnr ? `<span class="pill red">DNR</span>` : ""}${s.heads.some(a => a.level === "warn") ? `<span class="pill amber" title="${esc(s.heads.filter(a => a.level === "warn").map(a => a.text).join(" · "))}">⚠️ Heads-up</span>` : ""}
        ${ALLQ ? `<span class="pill plain">${esc(STAGE[s.stage] || s.stage)}</span>` : ""}<span class="pill plain grey">${s.got} of ${s.need} steps</span>${msgOwed(s) && s.stage === "in_progress" ? `<span class="pill amber">💬 Reply owed</span>` : ""}${why.length && s.state !== "Complete" ? why.slice(0, 4).map(b => `<span class="pill ${/^Day 7/.test(b) ? "red" : "amber"}">${esc(b)}</span>`).join("") + (why.length > 4 ? `<span class="muted" style="align-self:center">+${why.length - 4}</span>` : "") : ""}</div>
      ${s.alerts2.some(a => a.lvl === "stop") ? `<div class="rnext stop">⚠ ${esc(s.alerts2.find(a => a.lvl === "stop").t.split(". ")[0])}</div>` : ""}
      ${s.next.length && (s.stage === "in_progress" || s.stage === "waiting_pay") ? `<div class="rnext"><b>Next:</b> ${esc(s.next[0])}</div>` : ""}
      <div class="progress"><i style="width:${pct}%"></i></div></a>`; };
  const draw = () => {
    const dk = s => String(s[F.by] || "").slice(0, 10);
    const base = B.stays.filter(s => (!F.kind || kindOf(s) === F.kind) && (!F.chan || s.chan === F.chan) && (!F.area || s.area === F.area) && (!F.q || [s.res, s.unit, s.guest].join(" ").toLowerCase().includes(F.q.toLowerCase()))
      && (!F.from || dk(s) >= F.from) && (!F.to || (dk(s) && dk(s) <= F.to)))
      .sort((x, y) => F.by === "bookedAt" ? (dk(y) < dk(x) ? -1 : dk(y) > dk(x) ? 1 : (Number(y.res) || 0) - (Number(x.res) || 0)) : (dk(x) < dk(y) ? -1 : dk(x) > dk(y) ? 1 : 0));   // booked: newest first, then highest res #
    ALLQ = !!String(F.q || "").trim();
    const inStage = ALLQ ? base : base.filter(s => s.stage === F.stage);
    const rows = inStage.filter(s => !F.held || heldHas(s, F.held));
    const cnt = k => base.filter(s => s.stage === k).length;
    const held = {}, sub = {};
    inStage.forEach(s => { const bs = [...s.blockers, ...s.waiting]; new Set(bs.map(heldKey)).forEach(b => held[b] = (held[b] || 0) + 1);
      bs.filter(b => HELD_GROUP[b]).forEach(b => sub[b] = (sub[b] || 0) + 1); });
    const grpOn = F.held && (Object.values(HELD_GROUP).includes(F.held) ? F.held : HELD_GROUP[F.held]);
    const ip = base.filter(s => s.stage === "in_progress"), soon = base.filter(s => s.status !== "Cancelled" && s.stage !== "closed" && s.arrive >= today && s.arrive <= in7);   // any stage: Asana moves stays to Checkout once booking steps are done
    $("#rq_sub").textContent = `${ip.length} in progress · ${ip.filter(s => s.blockers.length || s.waiting.length).length} held up`;
    $("#rq_tabs").innerHTML = Object.entries(STAGE).map(([k, l]) => `<button class="${F.stage === k && !ALLQ ? "on" : ""}" data-stage="${k}">${RI[k]}<span>${l}</span><span class="badge">${cnt(k)}</span></button>`).join("");
    $("#rq_stats").innerHTML = [[ip.length, "In progress"], [soon.length, "Arriving next 7 days"],
      [soon.filter(s => s.got < s.need).length, "Arriving in 7 days, steps left", true],
      [ip.filter(s => s.blockers.length || s.waiting.length).length, "Held up", true],
      [base.filter(s => s.alerts2.some(a => a.lvl === "stop")).length, "Act today (day 7, owner guest 30 days, Safely)", true]]
      .map(([n, l, w]) => `<div class="stat ${w && n ? "warn" : ""}"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
    const kc = {}; B.stays.filter(s => ALLQ || s.stage === F.stage).forEach(s => kc[kindOf(s)] = (kc[kindOf(s)] || 0) + 1);
    $("#rq_kinds").innerHTML = Object.entries(KIND).map(([k, l]) => `<button class="kpill k-${k} ${F.kind === k ? "on" : ""} ${F.kind && F.kind !== k ? "dim" : ""}" data-kind="${k}">${l}<span class="n">${kc[k] || 0}</span></button>`).join("");
    $("#rq_held").innerHTML = Object.keys(held).length ? `<span class="muted" style="align-self:center;font-weight:700;font-size:13px">Held up by</span>${Object.entries(held).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<button class="rchip ${F.held === k || grpOn === k ? "on" : ""}" data-held="${esc(k)}">${esc(k)}${Object.values(HELD_GROUP).includes(k) ? " ▾" : ""}<span class="n">${n}</span></button>`).join("")}`
      + (grpOn ? `<div class="rchips" style="width:100%;margin:6px 0 0;padding-left:12px;border-left:3px solid var(--line-2)"><span class="muted" style="align-self:center;font-size:13px">${esc(grpOn)}:</span>
        ${Object.keys(HELD_GROUP).filter(b => HELD_GROUP[b] === grpOn).map(b => `<button class="rchip ${F.held === b ? "on" : ""}" data-held="${esc(b)}">${esc(b)}<span class="n">${sub[b] || 0}</span></button>`).join("")}</div>` : "") : "";
    const groups = []; rows.forEach(s => { const k = gKey(s), g = groups.find(x => x.k === k); g ? g.s.push(s) : groups.push({ k, s:[s] }); });
    if(F.group === "hood") groups.sort((a, b) => gName(a.k).localeCompare(gName(b.k)));
    else if(ALLQ){ const so = Object.keys(STAGE); groups.sort((a, b) => so.indexOf(a.k.slice(1)) - so.indexOf(b.k.slice(1))); }
    // Janae, Pyper, Kim 2026-11-03: failed payments stay in Waiting on payment, listed here (daily failed-payments check + no card on file)
    const fpl = !ALLQ && F.stage === "waiting_pay" ? inStage.filter(s => s.payFlag) : [];
    $("#rqbody").innerHTML = (ALLQ ? `<p class="muted" style="margin:4px 2px 10px">Searching every tab · ${rows.length} ${rows.length === 1 ? "stay" : "stays"} found. Tap a tab to clear the search.</p>` : "")
      + (fpl.length ? `<div class="card" style="border-color:var(--red,#c0392b)"><b>⚠️ ${fpl.length} ${fpl.length === 1 ? "reservation has" : "reservations have"} a payment problem</b> <span class="muted">· declined payments, no card on file, credits, balances inside 14 days or after the stay · Track reports: <a href="https://moosemanagement.trackhs.com/reports/pms-folio-balance/" target="_blank" rel="noopener">Folio balance ↗</a> · <a href="https://moosemanagement.trackhs.com/reports/pms-cancellation-balance/" target="_blank" rel="noopener">Cancellation balance ↗</a></span>
        ${fpl.map(s => `<div style="padding:6px 0;border-top:1px solid var(--line)"><a href="#/reservations/${encodeURIComponent(s.res)}"><b>${esc(s.unit || "")} · ${esc(s.guest || "#" + s.res)}</b></a> <span class="muted">#${esc(s.res)} · arrives ${esc(dayY(s.arrive))} · ${s.balance < 0 ? "credit " + esc(money(-s.balance)) : esc(money(s.balance)) + " due"}</span><div style="font-size:13px">${esc(s.payFlag)}</div></div>`).join("")}</div>` : "")
      + (rows.length ? groups.map(g => { const shut = RSHUT.has(F.stage + "|" + F.group + "|" + g.k);
      return `<div class="rgh" data-g="${esc(g.k)}"><span>${esc(gName(g.k).toUpperCase())} · ${g.s.length} ${g.s.length === 1 ? "STAY" : "STAYS"}</span><span>${shut ? "▾" : "▴"}</span></div>
      ${shut ? "" : `<div class="rgrid">${g.s.map(tile).join("")}</div>`}`; }).join("")
      : `<div class="card"><p class="muted" style="margin:0">Nothing here${F.q || F.chan || F.held || F.area || F.kind ? " with these filters" : ""}.</p></div>`);
    v.querySelectorAll("[data-stage]").forEach(b => b.onclick = () => { F.stage = b.dataset.stage; F.held = ""; if(ALLQ){ F.q = ""; $("#rq_q").value = ""; } draw(); });
    v.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { F.kind = F.kind === b.dataset.kind ? "" : b.dataset.kind; draw(); });
    v.querySelectorAll("[data-held]").forEach(b => b.onclick = () => { const k = b.dataset.held;
      F.held = F.held === k ? (HELD_GROUP[k] || "") : (grpOn === k && F.held !== k ? "" : k); draw(); });
    v.querySelectorAll("[data-g]").forEach(h => h.onclick = () => { const k = F.stage + "|" + F.group + "|" + h.dataset.g; RSHUT.has(k) ? RSHUT.delete(k) : RSHUT.add(k); draw(); });
  };
  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${cur === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  v.innerHTML = `<div class="page rpage rlk">
    <div class="rhead"><div class="logo"><img src="moose-logo.png" alt="Moose Management"><span class="lk">${RI.list}</span></div>
      <div class="grow"><h1>Moose Check lists</h1><div class="sub" id="rq_sub"></div></div>
      <div class="rhbtns"><div class="rsync" title="Steps tick themselves as these update">${RI.sync}<div><b>Data sync</b><small>Track reservations ${esc(when(B.updated))}${B.ahUpdated ? ` · Autohost ${esc(when(B.ahUpdated))}` : ""}${B.bwUpdated ? ` · Breezeway ${esc(when(B.bwUpdated))}` : ""}</small></div></div>
      <button class="deskbtn" id="rq_new" type="button" style="cursor:pointer;font-family:inherit" title="Open the check list for a Track reservation, even one booked a minute ago">${RSV('<path d="M12 5v14M5 12h14"/>')}<span>Start a check list</span></button>
      <a class="deskbtn" href="#/reservations/held">${RI.held}<span>Held up report</span></a></div></div>
    ${B.canMgr && (B.asks || []).some(a => a.status === "open") ? `<div class="card" style="border-color:var(--amber)"><b>🙋 Waiting on a manager</b> <span class="muted">· reply in Slack or open the check list</span>
      ${B.asks.filter(a => a.status === "open").map(a => { const st = B.stays.find(x => x.res === a.res) || {};
        return `<div style="padding:5px 0;border-top:1px solid var(--line)"><a href="#/reservations/${encodeURIComponent(a.res)}"><b>${esc(st.unit || "#" + a.res)} · ${esc(st.guest || "")}</b></a> — ${esc(a.by_name || "")}: “${esc(a.note)}” <span class="muted">${esc(when(a.at))}</span></div>`; }).join("")}</div>` : ""}
    <nav class="rtabs" id="rq_tabs"></nav>
    <div class="stats" id="rq_stats"></div>
    <label class="field rqfind"><input id="rq_q" type="search" placeholder="🔎 Find a guest, home or res # (searches every tab)" value="${esc(F.q)}"></label>
    <div class="rkinds" id="rq_kinds"></div>
    <div class="card"><div class="rfg">
      <label class="field"><span>Neighborhood</span>${sel("rq_a", [["", "All neighborhoods"], ...[...new Set(B.stays.map(s => s.area).filter(Boolean))].map(a => [a, HOODS[a] ? HOODS[a] + " (" + a + ")" : a]).sort((x, y) => x[1].localeCompare(y[1]))], F.area)}</label>
      <label class="field"><span>Sort by</span>${sel("rq_by", Object.entries(BY), F.by)}</label>
      <label class="field"><span>Group by</span>${sel("rq_g", [["date", "Date"], ["hood", "Neighborhood"]], F.group)}</label>
      <label class="field"><span>From</span><input type="date" id="rq_from" value="${esc(F.from)}"></label>
      <label class="field"><span>To</span><input type="date" id="rq_to" value="${esc(F.to)}"></label></div>
      <div class="rchips" id="rq_held" style="margin:8px 0 0"></div></div>
    <div id="rqbody"></div></div>`;
  $("#rq_q").oninput = e => { F.q = e.target.value; draw(); };
  $("#rq_new").onclick = () => startList();
  F.chan = "";   // Brandon 2026-11-03: Type drop-down removed (the colored booking buttons do the same)
  $("#rq_a").onchange = e => { F.area = e.target.value; draw(); };
  $("#rq_by").onchange = e => { F.by = e.target.value; draw(); };
  $("#rq_g").onchange = e => { F.group = e.target.value; draw(); };
  $("#rq_from").onchange = e => { F.from = e.target.value; draw(); };
  $("#rq_to").onchange = e => { F.to = e.target.value; draw(); };
  draw();
}

/* ---------- one check list */
const GOPEN = {};   // res # → open group ("" = none, "*" = all), kept while the page is open
async function card(v, res){
  const pop = v.closest && v.closest("#rpop"), keepY = pop ? pop.scrollTop : 0;
  if(!(pop && v.firstElementChild)) v.innerHTML = `<div class="page rpage"><p class="muted">Loading…</p></div>`;
  try { await load(); } catch(e){ v.innerHTML = `<div class="page"><div class="card"><p>Couldn't load: ${esc(e.message)}</p></div></div>`; return; }
  const s = B && B.stays.find(x => x.res === res);
  if(!s){ v.innerHTML = `<div class="page"><div class="card"><a class="btn small" href="#/reservations">← Back</a><p>No check list for #${esc(res)} (only stays from 60 days back are here).</p></div></div>`; return; }
  const occ = s.occ || {}, grp = {};
  s.steps.forEach(t => (grp[t.grp] = grp[t.grp] || []).push(t));
  const og = s.res in GOPEN ? GOPEN[s.res] : ((Object.entries(grp).find(([g, ts]) => ts.some(t => !t.opt && !t.done)) || [])[0] || "");
  requestAnimationFrame(() => { if(pop) pop.scrollTop = keepY; });
  v.innerHTML = `<div class="page rpage">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><a class="btn small" href="#/reservations">← Back</a>
      <h2 style="margin:0;flex:1">${esc(s.unit || "")} · ${esc(s.guest || "")}</h2><span class="pill">${esc(s.state)}</span></div>
    ${fresh()}
    <div class="card">
      <div class="rfacts"><span>Res <a href="${folioUrl(s.res)}" target="_blank" rel="noopener"><b>#${esc(s.res)}</b></a></span><span><b>${esc(day(s.arrive))}</b> → <b>${esc(day(s.depart))}</b> · ${esc(s.nights)} nights</span>
        <span>${esc(s.type || "")} <span class="muted">(${esc(CH[s.chan])})</span></span><span>Track: <b>${esc(s.status || "")}</b></span>
        <span>${occ.adults || 0} adults${occ.children ? ", " + occ.children + " kids" : ""}${occ.pets ? `, <b>${occ.pets} pet${occ.pets > 1 ? "s" : ""}</b>` : ""}</span>
        ${s.vip ? `<span class="pill blue">VIP</span>` : ""}${s.dnr ? `<span class="pill red">Do not rent</span>` : ""}${s.list && s.list.asana ? `<a href="${esc(s.list.asana)}" target="_blank" rel="noopener" class="muted">Asana checklist (ends Nov 9)</a>` : ""}</div>
      <div class="rmoney"><span class="muted">From Track</span><span>Campaign: <b>${esc(s.campaign || "—")}</b></span><span>Res agent: <b>${esc(s.agent || "—")}</b></span>
        <span>Guarantee: <b>${esc(s.guarantee || "—")}</b></span><span>Agreement: <b>${esc(s.agreement || "—")}</b></span>
        ${B.money ? `<span>Rent ${money(s.rent)}</span><span>Fees ${money(s.fees)}</span><span>Taxes ${money(s.taxes)}</span><span>Total <b>${money(s.total)}</b></span>` : ""}
        <span>Paid <b>${money(s.paid)}</b></span><span>Balance <b>${money(s.balance)}</b></span>${chargeBtn(s)}</div>
      ${s.ah ? `<div class="rmoney"><span class="muted">Autohost</span><span>Status: <b>${esc(s.ah.verify || "unknown")}</b></span>${s.ah.reason ? `<span>${esc(s.ah.reason)}</span>` : ""}<span>Portal: <b>${s.ah.portal ? "done" : "not done"}</b></span></div>` : ""}
      ${s.td && s.td.msgs && (s.td.msgs.in || s.td.msgs.out) ? `<div class="rmoney"><span class="muted">Guest messages (Track)</span><span>${s.td.msgs.in} from the guest · ${s.td.msgs.out} from us</span>
        ${msgOwed(s) ? `<span class="pill amber">Reply owed since ${esc(when(s.td.msgs.lastIn))}</span>` : `<span class="pill green">Answered</span>`}</div>` : ""}
      ${s.ah && s.ah.verify === "review" ? `<div class="rrule stop">Autohost has this guest under review${(s.ah.rules || []).length ? ": " + esc(s.ah.rules.join(", ")) : ""}. ${conds(s).review_easy ? "Under 25 at a studio–2 BR: you can approve it in Autohost if the guest gives a good reason for the stay (write it on the step)." : "A manager has to approve it (second set of eyes)."} ${!B.canMgr && !conds(s).review_easy ? askBtn("ah_rev_mgr") : ""}</div>` : ""}
      ${(B.asks || []).some(a => a.res === s.res) ? `<div class="rmoney" style="display:block"><span class="muted">Asked a manager</span>${B.asks.filter(a => a.res === s.res).map(askLine).join("")}</div>` : ""}
      ${conds(s).half ? `<div class="rrule warn">Only ${autoOk(s, "ah_verified") ? "the ID check" : "the contract"} is in. Send “Reminder to Sign Contract or Submit ID Verification” from Track.</div>` : ""}
      ${(B.bwMissing || []).includes(s.unit) ? `<div class="rmoney"><span class="muted">Breezeway</span><span>This home has no Breezeway id in the hub's home list, so its tasks can't be checked here.</span></div>`
        : s.bw && s.bw.length ? `<div class="rmoney" style="display:block"><span class="muted">Breezeway, ${esc(day(addDay(s.arrive, -5)))} to ${esc(day(addDay(s.depart, 1)))}</span>
          ${s.bw.map(t => `<div style="display:flex;gap:8px;flex-wrap:wrap;padding:3px 0"><b style="min-width:92px">${esc(day(t.sd))}</b><span style="flex:1;min-width:140px">${esc(t.n)} <span class="muted">· ${esc(t.dp)}</span></span>
            <span class="pill ${t.st === "done" ? "green" : t.st === "started" ? "blue" : ""}">${esc(t.st)}</span><span class="muted">${esc((t.who || []).join(", "))}</span></div>`).join("")}</div>`
        : bwKnown(s) ? `<div class="rmoney"><span class="muted">Breezeway</span><span>No tasks at this home from 5 days before arrival to the day after checkout.</span></div>` : ""}
      ${s.brevo && s.brevo.extra ? `<div class="rmoney"><span class="muted">Extra guests</span><span>${s.brevo.extra} with an email in Autohost · <b>${s.brevo.inBrevo}</b> in Brevo "AH Guest of Guest"</span></div>` : ""}
      ${s.hk && s.hk.length ? `<div class="rmoney"><span class="muted">#housekeeping @Cheree</span>${s.hk.slice(-4).map(m => `<a href="${esc(m.link)}" target="_blank" rel="noopener">${esc(when(m.at))}${m.by ? " · " + esc(m.by) : ""} ↗</a>`).join("")}</div>` : ""}
      ${s.heads.length ? `<div class="rrule warn" style="background:var(--amber-soft)"><div>⚠️ Heads-up for ${esc(s.unit)} before you book</div>${s.heads.map(a => `<div style="font-weight:${a.level === "warn" ? 600 : 400};margin-top:3px">• ${esc(a.text)} <span style="font-weight:400;opacity:.8">· ${esc(a.source)}</span></div>`).join("")}</div>` : ""}
      ${s.rules.map(r => `<div class="rrule ${r.kind}">${esc(r.text)} <span style="font-weight:400;opacity:.8">· ${esc(r.source)}</span></div>`).join("")}
      ${s.alerts2.map(a => `<div class="rrule ${a.lvl}">${esc(a.t)}</div>`).join("")}
      ${s.status === "Cancelled" && ["vrbo", "ws"].includes(s.chan) ? `<div class="rrule info">Cancelled. Our policy (VRBO + direct, Kim 2026-11-03): every payment is non-refundable once it's made, so when the guest cancels, ${money(s.paid)} paid → <b>$0 back</b>. Reason in Track: always “Canceled by guest”. A refund only when we cancel or the home has a problem (write why on the check list; Refund Transaction, never Void).${s.td && s.td.tx && s.td.tx.credit ? " A refund is already on the folio." : ""}</div>` : ""}
      ${s.chan === "oguest" && s.status !== "Cancelled" ? `<div class="rmoney"><span class="muted">Owner guest payment</span><span>Due now <b>${money(payDue(s))}</b> <span class="muted">(${daysTo(B.today, s.arrive) > 30 ? "10% down, 30+ days out" : "full payment, inside 30 days"})</span></span><span>Paid <b>${money(s.paid)}</b></span>${autoOk(s, "pay_due") ? `<span class="pill green">OK</span>` : `<span class="pill amber">Not yet: send the guest portal link ("Make A Payment Email Guest Portal")</span>`}</div>` : ""}
    </div>
    <div class="card">
      ${s.next.length && s.stage !== "closed" ? `<div class="rnext big"><b>Next up:</b> ${s.next.map(esc).join(" · then ")}${s.waiting.length ? ` <span class="muted">· waiting on ${esc(s.waiting.join(", "))}</span>` : ""}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b style="flex:1">${s.got} of ${s.need} steps done</b>
        <label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="rx_ext" style="width:20px;height:20px;min-height:0" ${s.list && s.list.extending ? "checked" : ""}> Extending</label>
        <select id="rx_stage" style="width:auto">${Object.entries(STAGE).filter(([k]) => k !== "waiting_pay").map(([k, l]) => `<option value="${k}" ${(s.stage === "waiting_pay" ? "checkout" : s.stage) === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      ${s.stage === "waiting_pay" && !s.payFlag ? `<div class="rrule info">Waiting on payment: ${money(s.balance)} is still due. Track takes the next payments from the card on file, so nothing to do unless one fails. It moves to Checkout by itself once the balance is $0.</div>`
        : s.payWhy ? `<div class="rrule stop">${s.stage === "waiting_pay" ? "Waiting on payment: " : ""}${esc(s.payWhy)} ${s.balance > 0 ? money(s.balance) + " still due. " : ""}${s.blockers.includes("Payment declined") ? "Send the Failed Payment letter if it hasn't gone (the daily check sends it when it can)." : /No card/.test(s.payWhy) ? "Ask the guest to add a card in the guest portal, or pay the balance." : "Fix it on the folio in Track; it moves to Checkout by itself once the balance is $0."}</div>` : ""}
      <div class="rchips"><span class="muted" style="align-self:center">Waiting on</span>${WAIT.map(w => `<button class="rchip ${s.waiting.includes(w) ? "on" : ""}" data-wait="${esc(w)}">${esc(w)}</button>`).join("")}</div>
      ${s.blockers.length ? `<p class="muted" style="margin:4px 0">Held up by: ${s.blockers.map(b => `<span class="pill amber">${esc(b)}</span>`).join(" ")}</p>` : ""}
      ${trkSection(s, og)}
      <div style="margin-top:8px"><button class="rgall" id="rx_gall">${og === "*" ? "Close all" : "Open all"}</button></div>
      ${Object.entries(grp).map(([g, ts]) => { const n = ts.filter(t => !t.opt).length, d = ts.filter(t => !t.opt && t.done).length;
        return `<details class="rgrp racc" data-g="${esc(g)}" ${og === "*" || og === g ? "open" : ""}><summary><h3>${esc(g)} <span class="muted" style="font-weight:600">${d}/${n}</span>${n && d >= n ? `<span class="pill green" style="font-size:11px;padding:1px 7px">done</span>` : ""}</h3></summary>
        ${ts.map(t => { const lock = t.mgr && !B.canMgr && !t.done;
          return `<label class="rstep ${t.opt ? "opt" : ""} ${t.done ? "done" : ""}"><input type="checkbox" data-step="${t.key}" data-note="${t.note ? 1 : ""}" ${t.done ? "checked" : ""} ${lock ? "disabled" : ""}>
          <span class="l">${TRK_STEP[t.key] && s.td && s.td.auto ? trkLogo(trkHit(s, TRK_STEP[t.key]), trkHit(s, TRK_STEP[t.key]) ? "Track's automation did this" : "Track's automation hasn't happened yet") + " " : ""}${esc(t.label)}${t.opt ? ` <span class="muted">(if needed)</span>` : ""}${t.mgr ? ` <span class="pill plain grey" style="font-size:11px;padding:1px 7px">Manager</span>` : ""}${t.mgr && !t.done && !B.canMgr ? ` ${askBtn(t.key)}` : ""}${t.help ? `<button type="button" class="rwhy" data-why="${t.key}" title="Why? / how">i</button>` : ""}${t.tick && t.tick.n ? `<div class="muted" style="font-size:12.5px">“${esc(t.tick.n)}”</div>` : ""}${t.help ? `<div class="rwhyt" data-whyt="${t.key}" hidden>${esc(t.help)}</div>` : ""}</span>
          ${t.key === "x_charge" && !t.done ? chargeBtn(s) : ""}${copyBtn(t.key, s)}${fdLink(t.key, s)}${abbLink(t.key, s)}${t.key === "i_campaign" && !t.done ? campBtn(s) : openFor(t.key, s)}<span class="who">${t.tick ? esc((t.tick.by || "Someone") + (t.tick.src !== "hub" ? " · via " + (t.tick.src === "asana" ? "Asana" : t.tick.src) : "") + " · " + when(t.tick.at)) : t.auto ? autoWho(s, t) : ""}</span></label>`; }).join("")}</details>`; }).join("")}
    </div>
    <div class="card"><b>Hold / hand-off note</b><textarea id="rx_hold" style="min-height:60px;margin-top:6px" placeholder="What the next person needs to know">${esc((s.list && s.list.hold) || "")}</textarea>
      <div style="display:flex;gap:8px;margin-top:6px;align-items:center"><button class="btn small" id="rx_hold_s">Save note</button><span class="muted" id="rx_msg"></span></div>
      <details class="acc2" id="rx_h"><summary><b>History</b></summary><div id="rx_hl" class="muted">Loading…</div></details></div>
  </div>`;
  const msg = t => $("#rx_msg").textContent = t;
  const set = async args => { const r = await sb.rpc("res_set", { p_res:s.res, ...args }); if(r.error){ msg("Couldn't save: " + r.error.message); return false; } await load(true); card(v, res); return true; };
  v.querySelectorAll("[data-step]").forEach(cb => cb.onchange = async () => {
    cb.disabled = true;
    let note = null;
    if(cb.checked && cb.dataset.note){ note = prompt("Write the reason (it's saved on this check list):"); if(!note || !note.trim()){ cb.checked = false; cb.disabled = false; return; } }
    const r = await sb.rpc("res_tick", { p_res:s.res, p_step:cb.dataset.step, p_done:cb.checked, p_note:note });
    if(r.error){ cb.checked = !cb.checked; cb.disabled = false; return msg("Couldn't save: " + r.error.message); }
    s.ticks = { ...(s.ticks || {}), [cb.dataset.step]:r.data }; prep(s); card(v, res);
  });
  v.querySelectorAll("[data-ask]").forEach(b => b.onclick = async e => { e.preventDefault(); e.stopPropagation();
    const note = prompt("What do you need from the manager? (sent to the managers on shift in Slack)");
    if(!note || !note.trim()) return;
    b.disabled = true;
    const r = await sb.rpc("res_ask", { p_res:s.res, p_step:b.dataset.ask, p_note:note });
    if(r.error){ b.disabled = false; return msg("Couldn't ask: " + r.error.message); }
    await load(true); card(v, res); });
  v.querySelectorAll("details.racc").forEach(d => d.ontoggle = () => {
    if(GOPEN[s.res] === "*") return;
    if(d.open){ GOPEN[s.res] = d.dataset.g; v.querySelectorAll("details.racc").forEach(o => { if(o !== d && o.open) o.open = false; }); }
    else if(GOPEN[s.res] === d.dataset.g || !(s.res in GOPEN)) GOPEN[s.res] = ""; });
  $("#rx_gall").onclick = () => { const all = GOPEN[s.res] === "*"; GOPEN[s.res] = all ? "" : "*"; v.querySelectorAll("details.racc").forEach(d => d.open = !all); $("#rx_gall").textContent = all ? "Open all" : "Close all"; };
  v.querySelectorAll("[data-why]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); const x = v.querySelector(`[data-whyt="${b.dataset.why}"]`); if(x) x.hidden = !x.hidden; });
  v.querySelectorAll("[data-uaa]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); uaaPanel(s); });
  v.querySelectorAll("[data-copyform]").forEach(b => b.onclick = async e => { e.preventDefault(); e.stopPropagation();
    try { await navigator.clipboard.writeText(formText(s, b.dataset.copyform === "wg_form")); b.textContent = "Copied ✓"; } catch(_){ prompt("Copy this:", formText(s, b.dataset.copyform === "wg_form")); } });
  v.querySelectorAll("[data-charge]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); charge(s, v, res); });
  $("#rx_stage").onchange = e => set({ p_stage:e.target.value });
  $("#rx_ext").onchange = e => set({ p_extending:e.target.checked });
  v.querySelectorAll("[data-wait]").forEach(b => b.onclick = () => { const w = b.dataset.wait, now = s.waiting.includes(w) ? s.waiting.filter(x => x !== w) : [...s.waiting, w]; set({ p_waiting:now }); });
  $("#rx_hold_s").onclick = async () => { if(await set({ p_hold:$("#rx_hold").value })) msg("Saved ✓"); };
  $("#rx_h").ontoggle = async () => { if(!$("#rx_h").open) return;
    const r = await sb.rpc("res_history", { p_res:s.res }); const h = r.data || { ticks:[], log:[] };
    const all = [...h.ticks.map(t => ({ at:t.at, t:`${t.d ? "Ticked" : "Unticked"} “${t.label || t.step}”`, by:t.by, src:t.src })),
                 ...h.log.map(l => ({ at:l.at, t:{ stage:"Stage → " + (STAGE[l.text] || l.text), waiting:"Waiting on: " + (l.text || "nothing"), extending:"Extending " + l.text, hold:"Note: " + (l.text || "(cleared)"), note:"Note: " + l.text, import:l.text }[l.kind] || l.text, by:l.by, src:l.src }))]
      .sort((a, b) => b.at < a.at ? -1 : 1);
    $("#rx_hl").innerHTML = all.length ? all.map(x => `<div class="rhist">${esc(when(x.at))} · <b>${esc(x.by || "")}</b>${x.src && x.src !== "hub" ? " (" + esc(x.src) + ")" : ""} — ${esc(x.t)}</div>`).join("") : "Nothing yet."; };
}

function autoWho(s, t){
  const w = autoWhen(s, t);
  return `<span class="pill green">${esc(t.auto)} ✓</span>${w ? ` <span title="${w.exact ? "When it happened" : "First time the hub saw it done"}">· ${w.exact ? "" : "by "}${esc(whenAny(w.at))}</span>` : ""}`;
}
/* ---------- Charge the balance to the card on file (Brandon 2026-10-29; res-charge function + hub_res_charge.sql).
   Amount only, never the breakdown; Track is re-read live and the person confirms the exact amount first. */
const chargeBtn = s => B.canCharge && s.status !== "Cancelled" && (s.balance || 0) > 0
  ? `<button class="btn small" data-charge="1" style="margin-left:auto">💳 Charge balance</button>` : "";
async function fnCall(body){
  const r = await sb.functions.invoke("res-charge", { body });
  if(!r.error) return r.data || {};
  try { return await r.error.context.json(); } catch(_) { return { ok:false, error:"Couldn't reach the hub. Try again." }; }
}
async function charge(s, v, res){
  document.getElementById("rchm")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="modal on" id="rchm"><div class="card" style="text-align:left">
    <h3 style="margin:0 0 8px">💳 Charge the balance</h3><div id="rch_b"><p class="muted">Checking the balance in Track…</p></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn small" id="rch_x">Cancel</button><button class="btn small primary" id="rch_go" style="display:none"></button></div></div></div>`);
  const m = document.getElementById("rchm"), body = m.querySelector("#rch_b"), go = m.querySelector("#rch_go"), close = () => m.remove();
  m.querySelector("#rch_x").onclick = close; m.onclick = e => { if(e.target === m) close(); };
  const q = await fnCall({ action:"quote", res:s.res });
  if(!q.ok) return body.innerHTML = `<p>${esc(q.error || "Couldn't check Track.")}</p>`;
  if(!q.card) return body.innerHTML = `<p>There is no card on file in Track for this stay, so the hub can't charge it.</p>`;
  if(!(q.balance > 0)) return body.innerHTML = `<p>The balance in Track is $0 — nothing to charge.</p>`;
  const amt = Number(q.balance).toFixed(2);
  body.innerHTML = `<p style="margin:0 0 6px"><b>${esc(s.unit || "")} · ${esc(s.guest || "")}</b> · Res #${esc(s.res)}</p>
    <p style="font-size:22px;margin:6px 0"><b>$${esc(Number(amt).toLocaleString("en-US", { minimumFractionDigits:2 }))}</b></p>
    <p class="muted" style="margin:0">This is the balance in Track right now. The guest's card on file in Track is charged straight away, and it's logged on this stay's history with your name.</p>`;
  go.style.display = ""; go.textContent = `Charge $${Number(amt).toLocaleString("en-US", { minimumFractionDigits:2 })}`;
  go.onclick = async () => {
    go.disabled = true; m.querySelector("#rch_x").disabled = true; go.textContent = "Charging…";
    const c = await fnCall({ action:"charge", res:s.res, amount:Number(amt) });
    m.querySelector("#rch_x").disabled = false; m.querySelector("#rch_x").textContent = "Close"; go.style.display = "none";
    body.innerHTML = c.ok ? `<p>✅ Charged <b>$${esc(Number(c.charged).toLocaleString("en-US", { minimumFractionDigits:2 }))}</b> to the card on file.${c.payment ? ` Track payment #${esc(c.payment)}.` : ""}</p><p class="muted" style="margin:0">It shows in Track now; the check list catches up on the next pull.</p>`
      : `<p>${c.unknown ? "⚠️" : "❌"} ${esc(c.error || "Not charged.")}</p>`;
    m.querySelector("#rch_x").onclick = async () => { close(); await load(true); card(v, res); };
  };
}

/* ---------- + Start a check list (Brandon 2026-11-06): type a Track res #. Already in the hub = open it; otherwise res_pull.py on the office PC
   reads that one stay from Track (hub_res_pull.sql, about a minute) and then it opens. Track can't be booked from here: book in Track first. */
function startList(){
  document.getElementById("rnewm")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="modal on" id="rnewm"><div class="card" style="text-align:left;max-width:440px">
    <h3 style="margin:0 0 6px">Start a check list</h3>
    <p class="muted" style="margin:0 0 10px">Book it in Track first, then type its reservation number. If the hub doesn't have it yet, it gets it from Track now (about a minute).</p>
    <label class="field"><span>Track reservation #</span><input id="rnew_q" inputmode="numeric" autocomplete="off" placeholder="e.g. 321439"></label>
    <div id="rnew_b" style="margin-top:8px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn small" id="rnew_x" type="button">Cancel</button><button class="btn small primary" id="rnew_go" type="button">Start</button></div></div></div>`);
  const m = document.getElementById("rnewm"), q = m.querySelector("#rnew_q"), body = m.querySelector("#rnew_b"), go = m.querySelector("#rnew_go");
  let stop = false; const close = () => { stop = true; m.remove(); };
  m.querySelector("#rnew_x").onclick = close; m.onclick = e => { if(e.target === m) close(); };
  const say = (h, bad) => body.innerHTML = `<p style="margin:0;${bad ? "color:var(--red,#c0392b)" : ""}">${h}</p>`;
  const open = res => { close(); location.hash = "#/reservations/" + encodeURIComponent(res); };
  const has = res => B && B.stays.some(s => String(s.res) === res);
  q.onkeydown = e => { if(e.key === "Enter") go.click(); }; setTimeout(() => q.focus(), 30);
  go.onclick = async () => {
    const res = (q.value || "").replace(/\D/g, "");
    if(!/^\d{3,9}$/.test(res)) return say("Type the Track reservation number (numbers only).", true);
    go.disabled = true; q.disabled = true; say("Looking for #" + esc(res) + "…");
    const again = () => { go.disabled = false; q.disabled = false; };
    try {
      if(has(res) || (await load(true), has(res))) return open(res);
      const r = await sb.rpc("res_pull_request", { p_res:res });
      if(r.error){ again(); return say(esc(window.niceErr ? niceErr(r.error) : r.error.message), true); }
      say("Getting #" + esc(res) + " from Track… This usually takes under a minute. You can leave this open.");
      const t0 = Date.now();
      while(!stop && Date.now() - t0 < 4 * 60000){
        await new Promise(ok => setTimeout(ok, 4000)); if(stop) return;
        const st = await sb.rpc("res_pull_status", { p_id:r.data });
        const d = st.data || {};
        if(d.status === "done"){ await load(true);
          if(has(res)) return open(res);
          again(); return say("Got #" + esc(res) + " from Track, but it doesn't get a check list here (for example a lease or a stay the hub leaves out).", true); }
        if(d.status === "not_found" || d.status === "failed"){ again(); return say(esc(d.note || "Couldn't get it from Track."), true); }
      }
      if(!stop){ again(); say("Still waiting on the office computer. It will show on Check lists as soon as it's in. Try again in a few minutes.", true); }
    } catch(e){ again(); say(esc(window.niceErr ? niceErr(e) : e.message), true); }
  };
}

/* ---------- Held up report: open check lists by what holds them up */
async function held(v){
  v.innerHTML = `<div class="page rpage"><p class="muted">Loading…</p></div>`;
  try { await load(true); } catch(e){ v.innerHTML = `<div class="page"><div class="card"><p>Couldn't load: ${esc(e.message)}</p></div></div>`; return; }
  if(!B){ v.innerHTML = `<div class="page"><div class="card"><h2>No access</h2><p class="muted">This desk isn't on your teams. Ask Brandon or Kim.</p></div></div>`; return; }
  const open = B.stays.filter(s => s.stage === "in_progress" || s.stage === "cancelling"), by = {};
  open.forEach(s => [...s.blockers, ...s.waiting].forEach(b => (by[b] = by[b] || []).push(s)));
  v.innerHTML = `<div class="page rpage"><div style="display:flex;align-items:center;gap:10px"><a class="btn small" href="#/reservations">← Back</a><h2 style="margin:0">Held up reservations</h2></div>${fresh()}
    <p class="muted">${open.length} open check lists · ${open.filter(s => s.blockers.length || s.waiting.length).length} held up. A stay shows under every step it is waiting on.</p>
    ${Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([b, ss]) => `<div class="card"><h3 style="margin:0 0 6px">${esc(b)} <span class="pill amber">${ss.length}</span></h3>
      ${ss.sort((x, y) => x.arrive < y.arrive ? -1 : 1).map(s => `<a class="rrow" href="#/reservations/${encodeURIComponent(s.res)}"><span class="u">${esc(s.unit || "")}</span><span class="g">${esc(s.guest || "#" + s.res)}</span><span class="d">arrives ${esc(day(s.arrive))}</span></a>`).join("")}</div>`).join("")
      || `<div class="card"><p class="muted">Nothing is held up.</p></div>`}</div>`;
}

/* ---------- check list as a pop-up (Brandon 2026-11-03: "when you click onto a check list we would like it to pop up as a pop up window").
   The address stays #/reservations/<res #> (links, Penny's nudge). The list (or Held up report) stays underneath with its filters + scroll;
   closing redraws it only when something was saved. */
let UNDER = null;
const underOk = v => UNDER && UNDER.node && UNDER.node.isConnected && v.contains(UNDER.node);
const scrollKeep = v => { const els = [document.scrollingElement, v, v.parentElement].filter(Boolean), tops = els.map(e => e.scrollTop); return () => els.forEach((e, i) => e.scrollTop = tops[i]); };
function popClose(go){ const p = document.getElementById("rpop"); if(p) p.remove(); document.body.classList.remove("rpopen");
  if(go) location.hash = UNDER && UNDER.kind === "held" ? "#/reservations/held" : "#/reservations"; }
async function popOpen(v, res){
  if(!underOk(v)){ await queue(v); UNDER = { kind:"queue", node:v.firstElementChild, b:B }; }
  if(!document.getElementById("rpop")) UNDER.keep = scrollKeep(v);   // where the list was when the pop-up opened
  let p = document.getElementById("rpop");
  if(!p){ p = document.createElement("div"); p.id = "rpop"; p.className = "rpop";
    p.innerHTML = `<div class="rpbox" role="dialog" aria-modal="true" aria-label="Check list"><button class="rpx" type="button" aria-label="Close" title="Close (Esc)">✕</button><div class="rpin"></div></div>`;
    document.body.appendChild(p);
    p.addEventListener("click", e => { if(e.target === p) popClose(true); });
    p.querySelector(".rpx").onclick = () => popClose(true); }
  document.body.classList.add("rpopen");
  const box = p.querySelector(".rpin"); box.innerHTML = ""; p.scrollTop = 0;
  await card(box, res); p.scrollTop = 0;
}
window.addEventListener("hashchange", () => { if(!/^#\/reservations\/\d+/.test(location.hash)) popClose(false); });
document.addEventListener("keydown", e => { if(e.key !== "Escape" || !document.getElementById("rpop")) return;
  if([...document.querySelectorAll("body > div")].some(d => d.id !== "rpop" && /z-index:\s*60/.test(d.style.cssText))) return;   // a box opened on top (charge, UAA form) closes first
  popClose(true); });
window.resCheckView = async function(v){ css(); const a = hashArg();
  if(a && a !== "held") return popOpen(v, a);
  const kind = a === "held" ? "held" : "queue";
  const back = underOk(v) && UNDER.kind === kind ? UNDER.keep || scrollKeep(v) : null;
  if(back && UNDER.b === B){ popClose(false); back(); return; }   // nothing changed: just close the pop-up
  popClose(false); await (kind === "held" ? held(v) : queue(v));
  UNDER = { kind, node:v.firstElementChild, b:B }; if(back) back(); };
})();
