/* Ana sayfa: "Bugünkü takviyelerim" ve "Bugünkü ilaçlarım" tek alanda, sağa/sola kaydırılabilir iki sekme.
   Üstteki karşılama / VKİ / su kartları sabit kalır; yalnızca bu alt modül yumuşak geçişle değişir.
   Takviyeler kartında sağ üstte "→ İlaçlarım", ilaçlar kartında sol üstte "← Takviyelerim"; kart üzerinde yatay kaydırma.

   Günlük özet göstergeleri paneli: "Vitamin" ve "İlaç" diye iki bağımsız sekme (oklar + kaydırma).
   Vitamin: VitaSkor halkası + Sabah/Öğle/Akşam takviye protokolleri. İlaç: düzenli ilaç dozlarından hesaplanan
   ayrı "İlaç Skoru" halkası + Sabah/Öğle/Akşam doz kartları (0/1, 1/1 …). Arka plan sayfa değişmez. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }

  /* Yatay kaydırma algılayıcı: yatay hareket dikeyden belirgin büyükse ve ≥ 50 px ise */
  function onSwipe(el, cb) {
    var x0 = null, y0 = null;
    el.addEventListener("touchstart", function (e) { if (e.touches.length !== 1) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = y0 = null;
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) cb(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  /* ------------------------- Ana sayfa sekmeleri ------------------------- */
  var home = { idx: 0, wrap: null, track: null, panes: [] };
  function homeHeight() {
    if (!home.wrap) return;
    var pane = home.panes[home.idx];
    if (pane) home.wrap.style.height = pane.offsetHeight + "px";
  }
  function showHome(i, opts) {
    if (!home.wrap) return;
    home.idx = i ? 1 : 0;
    home.track.style.transform = "translateX(" + (-100 * home.idx) + "%)";
    home.panes.forEach(function (p, n) { var on = n === home.idx; p.setAttribute("aria-hidden", on ? "false" : "true"); p.classList.toggle("is-active", on); });
    home.dots.forEach(function (d, n) { var on = n === home.idx; d.classList.toggle("is-on", on); d.setAttribute("aria-selected", on ? "true" : "false"); });
    homeHeight();
    // Seçili sekme yalnızca bellekte tutulur (gizlilik kuralı: oturum deposunda yalnızca oturum kimliği).
    if (opts && opts.scroll) try { home.wrap.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (_) {}
  }
  function buildHome() {
    var sup = $("todaySupsCard"), med = $("todayMedsCard");
    if (!sup || !med || home.wrap) return;
    var wrap = document.createElement("section");
    wrap.className = "vhs-wrap"; wrap.id = "homeCareTabs"; wrap.setAttribute("aria-label", "Bugünkü takviyelerim ve ilaçlarım");
    var dots = document.createElement("div");
    dots.className = "vhs-dots"; dots.setAttribute("role", "tablist");
    dots.innerHTML = '<button type="button" role="tab" class="vhs-dot is-on" data-home-tab="0" aria-selected="true">Takviyelerim</button><button type="button" role="tab" class="vhs-dot" data-home-tab="1" aria-selected="false">İlaçlarım</button>';
    var viewport = document.createElement("div"); viewport.className = "vhs-viewport";
    var track = document.createElement("div"); track.className = "vhs-track";
    sup.parentNode.insertBefore(wrap, sup);
    [sup, med].forEach(function (card, n) {
      var pane = document.createElement("div");
      pane.className = "vhs-pane"; pane.dataset.pane = String(n); pane.setAttribute("role", "tabpanel");
      pane.appendChild(card);
      track.appendChild(pane);
    });
    // Geçiş okları: takviyeler → sağ üst, ilaçlar ← sol üst
    var next = document.createElement("button");
    next.type = "button"; next.className = "vhs-arrow vhs-arrow--next"; next.dataset.homeTab = "1";
    next.setAttribute("aria-label", "Bugünkü ilaçlarıma geç"); next.title = "Bugünkü ilaçlarım";
    next.innerHTML = '<span>İlaçlarım</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    sup.classList.add("vhs-card"); sup.insertBefore(next, sup.firstChild);
    var prev = document.createElement("button");
    prev.type = "button"; prev.className = "vhs-arrow vhs-arrow--prev"; prev.dataset.homeTab = "0";
    prev.setAttribute("aria-label", "Bugünkü takviyelerime dön"); prev.title = "Bugünkü takviyelerim";
    prev.innerHTML = '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Takviyelerim</span>';
    med.classList.add("vhs-card", "vhs-card--med"); med.insertBefore(prev, med.firstChild);
    viewport.appendChild(track);
    wrap.appendChild(dots); wrap.appendChild(viewport);
    home.wrap = viewport; home.track = track; home.panes = Array.prototype.slice.call(track.children); home.dots = Array.prototype.slice.call(dots.children);
    onSwipe(viewport, function (dir) { showHome(home.idx + dir); });
    if (typeof ResizeObserver === "function") { var ro = new ResizeObserver(homeHeight); home.panes.forEach(function (p) { ro.observe(p); }); }
    window.addEventListener("resize", homeHeight);
    showHome(0);
  }

  /* ------------------------- Günlük özet: Vitamin / İlaç ------------------------- */
  var sum = { idx: 0, built: false };
  var TITLES = ["Günlük Özet Göstergeleri - Vitamin", "Günlük Özet Göstergeleri - İlaç"];
  function ring(pct, id, label, tone) {
    var p = typeof pct === "number" ? Math.max(0, Math.min(100, pct)) : null;
    return '<div class="vds-ring vds-ring--' + tone + '" id="' + id + '" style="--p:' + (p === null ? 0 : p) + '" role="img" aria-label="' + esc(label) + ': ' + (p === null ? "veri yok" : p + "%") + '">' +
      '<div class="vds-ring-in"><b>' + (p === null ? "—" : p + "%") + '</b><small>' + esc(label) + '</small></div></div>';
  }
  /* VitaSkor ağırlıkları renderDailyTab ile aynıdır: bugün takviye varsa %70 uyum + %30 su; yoksa yalnızca su (%100). */
  function vitaNoteText() {
    var n = typeof window.vitaTodaySupplementTotal === "number" ? window.vitaTodaySupplementTotal : null;
    return n === 0 ? "Yalnızca su hedefi (%100)" : "Takviye uyumu (%70) + su hedefi (%30)";
  }
  /* Halka yerinde güncellenir: --p CSS'te @property ile akıcı geçer, ortadaki yüzde sayarak ilerler (Ring Steps). */
  function updateRing(el, pct, label) {
    var p = typeof pct === "number" ? Math.max(0, Math.min(100, pct)) : null;
    var b = el.querySelector(".vds-ring-in b");
    var from = parseInt(el.dataset.p || "0", 10) || 0, to = p === null ? 0 : p;
    el.dataset.p = String(to);
    el.style.setProperty("--p", to);
    el.setAttribute("aria-label", label + ": " + (p === null ? "veri yok" : p + "%"));
    if (!b) return;
    if (p === null) { b.textContent = "—"; return; }
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from === to) { b.textContent = to + "%"; return; }
    var t0 = performance.now(), dur = 850;
    cancelAnimationFrame(el._raf);
    var step = function (now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      b.textContent = Math.round(from + (to - from) * e) + "%";
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  function medStats() {
    var rows = typeof getTodayVitaMedicationDoses === "function" ? getTodayVitaMedicationDoses() : [];
    var block = function (r) { var b = typeof vitaBlockFromClock === "function" ? vitaBlockFromClock(r.dose) : "Sabah"; return b === "Gece" ? "Akşam" : b; };
    var g = { "Sabah": [], "Öğle": [], "Akşam": [] };
    rows.forEach(function (r) { g[block(r)].push(r); });
    var done = rows.filter(function (r) { return r.taken; }).length;
    return { rows: rows, groups: g, done: done, pct: rows.length ? Math.round(done / rows.length * 100) : null };
  }
  function renderSummary() {
    if (!sum.built) return;
    // Vitamin: VitaSkor halkası (değeri renderDailyTab hesaplar)
    var vs = parseInt(String(($("dashVitaSkor") || {}).textContent || "0"), 10) || 0;
    var vr = $("vdsVitaRing"); if (vr) updateRing(vr, vs, "VitaSkor · Uyum");
    var vn = $("vdsVitaNote"); if (vn) vn.textContent = vitaNoteText();
    // İlaç: bağımsız İlaç Skoru
    var m = medStats();
    var mr = $("vdsMedRing"); if (mr) updateRing(mr, m.pct, "İlaç Skoru");
    var info = $("vdsMedInfo");
    if (info) info.textContent = !m.rows.length ? "Bugün planlı ilaç dozu yok (gerektiğinde kullanılanlar sayılmaz)." : m.done + " / " + m.rows.length + " doz alındı";
    [["Sabah", "vdsMedMorning"], ["Öğle", "vdsMedNoon"], ["Akşam", "vdsMedEvening"]].forEach(function (p) {
      var el = $(p[1]); if (!el) return;
      var list = m.groups[p[0]];
      el.textContent = list.filter(function (r) { return r.taken; }).length + "/" + list.length;
      var names = $(p[1] + "Names"); if (names) names.textContent = list.length ? list.map(function (r) { return r.med.name.split(" ")[0] + " " + r.dose; }).join(", ") : "Doz yok";
    });
  }
  function showSummary(i) {
    if (!sum.built) return;
    sum.idx = i ? 1 : 0;
    var track = $("vdsTrack"); if (track) track.style.transform = "translateX(" + (-100 * sum.idx) + "%)";
    var title = $("dailySummaryPanelTitle"); if (title) title.lastChild.textContent = " " + TITLES[sum.idx];
    document.querySelectorAll("#dailySummaryPanel .vds-pane").forEach(function (p, n) { p.setAttribute("aria-hidden", n === sum.idx ? "false" : "true"); });
    var prev = $("vdsPrev"), next = $("vdsNext");
    if (prev) prev.disabled = sum.idx === 0;
    if (next) next.disabled = sum.idx === 1;
    document.querySelectorAll("#dailySummaryPanel .vds-tabdot").forEach(function (d, n) { d.classList.toggle("is-on", n === sum.idx); d.setAttribute("aria-selected", n === sum.idx ? "true" : "false"); });
    var foot = $("vdsFoot"); if (foot) foot.textContent = sum.idx ? "Bugünkü düzenli ilaç dozlarınıza göre güncellenir; her gece 00:00'da sıfırlanır." : "Bugün aldığınız takviyelere göre güncellenir; her gece 00:00'da sıfırlanır.";
    renderSummary();
  }
  function buildSummary() {
    var panel = $("dailySummaryPanel"), grid = panel && panel.querySelector(".vds-grid"), head = panel && panel.querySelector(".vds-head");
    if (!panel || !grid || !head || sum.built) return;
    var title = $("dailySummaryPanelTitle");
    if (title) title.innerHTML = '<i class="fa-solid fa-chart-simple" aria-hidden="true"></i> ' + TITLES[0];
    // Başlık altında sekme geçişi: ← [Vitamin | İlaç] →
    var nav = document.createElement("div");
    nav.className = "vds-tabs"; nav.setAttribute("role", "tablist");
    nav.innerHTML = '<button type="button" class="vds-arrow" id="vdsPrev" aria-label="Vitamin göstergelerine geç"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>' +
      '<button type="button" role="tab" class="vds-tabdot is-on" data-sum-tab="0" aria-selected="true">Vitamin</button>' +
      '<button type="button" role="tab" class="vds-tabdot" data-sum-tab="1" aria-selected="false">İlaç</button>' +
      '<button type="button" class="vds-arrow" id="vdsNext" aria-label="İlaç göstergelerine geç"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>';
    head.parentNode.insertBefore(nav, head.nextSibling);
    var viewport = document.createElement("div"); viewport.className = "vds-viewport";
    var track = document.createElement("div"); track.className = "vds-track"; track.id = "vdsTrack";
    var vit = document.createElement("div"); vit.className = "vds-pane"; vit.id = "vdsPaneVitamin"; vit.setAttribute("role", "tabpanel");
    grid.parentNode.insertBefore(viewport, grid);
    vit.innerHTML = '<div class="vds-ringrow">' + ring(0, "vdsVitaRing", "VitaSkor · Uyum", "vita") + '<p class="vds-ringnote" id="vdsVitaNote">' + vitaNoteText() + '</p></div>';
    vit.appendChild(grid);
    var med = document.createElement("div"); med.className = "vds-pane"; med.id = "vdsPaneMed"; med.setAttribute("role", "tabpanel");
    var card = function (label, id, tone, icon) {
      return '<div class="vds-mcard vds-mcard--' + tone + '"><div><span>' + label + '</span><b id="' + id + '">0/0</b><small id="' + id + 'Names">Doz yok</small></div><i class="fa-solid ' + icon + '" aria-hidden="true"></i></div>';
    };
    med.innerHTML = '<div class="vds-ringrow">' + ring(null, "vdsMedRing", "İlaç Skoru", "med") + '<p class="vds-ringnote" id="vdsMedInfo">—</p></div>' +
      '<div class="vds-grid vds-grid--med">' + card("Sabah", "vdsMedMorning", "am", "fa-sun") + card("Öğle", "vdsMedNoon", "noon", "fa-utensils") + card("Akşam", "vdsMedEvening", "pm", "fa-moon") + '</div>';
    track.appendChild(vit); track.appendChild(med); viewport.appendChild(track);
    var foot = panel.querySelector(".vds-foot"); if (foot) foot.id = "vdsFoot";
    onSwipe(viewport, function (dir) { showSummary(sum.idx + dir); });
    sum.built = true;
    showSummary(0);
  }

  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var h = t.closest("[data-home-tab]");
    if (h) { showHome(Number(h.dataset.homeTab)); return; }
    var s = t.closest("[data-sum-tab]");
    if (s) { showSummary(Number(s.dataset.sumTab)); return; }
    if (t.closest("#vdsPrev")) { showSummary(0); return; }
    if (t.closest("#vdsNext")) { showSummary(1); return; }
  });

  /* Liste/ilaç değişince göstergeler ve yükseklik güncellenir */
  function wrap(name, after) {
    var orig = window[name];
    if (typeof orig !== "function" || orig.__vhsWrapped) return;
    var w = function () { var r = orig.apply(this, arguments); try { after(); } catch (_) {} return r; };
    w.__vhsWrapped = true; w.toString = function () { return orig.toString(); }; window[name] = w;
  }
  function init() {
    buildHome();
    buildSummary();
    wrap("renderDailyTab", function () { renderSummary(); homeHeight(); });
    wrap("renderTodayMedications", function () { renderSummary(); homeHeight(); });
    wrap("toggleDailySummaryPanel", renderSummary);
    // İlaç eklenince ilaçlar, takviye eklenince takviyeler sekmesi gösterilir
    wrap("commitAddMedication", function () { showHome(1, { scroll: true }); });
    wrap("commitManualSupplement", function () { showHome(0); });
  }
  window.VitaHomeTabs = { show: function (i) { showHome(i); }, current: function () { return home.idx; } };
  window.VitaSummaryTabs = { show: showSummary, render: renderSummary, current: function () { return sum.idx; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
