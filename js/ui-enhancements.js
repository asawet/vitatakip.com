
(function () {
  function applyVitaTakipUIUX() {
    const home = document.getElementById('view-home');
    const neyim = document.getElementById('view-neyim');
    const labs = document.getElementById('view-labs');
    if (!home || !neyim || !labs) return;

    /* Use one clear add action in the checklist, without removing the original handler. */
    const checklist = document.getElementById('supplementChecklistContainer');
    if (checklist) {
      const card = checklist.closest('.bg-white') || checklist.parentElement;
      if (card) {
        const actions = Array.from(card.querySelectorAll('button[onclick*="openAddSupplementModal"]'));
        actions.forEach((button, index) => {
          if (index > 0) button.style.display = 'none';
          else {
            button.classList.add('vita-home-add-label');
            const label = button.querySelector('span');
            if (label) label.textContent = 'Takviye Ekle';
          }
        });
      }
    }

    /* The long integrated-data drawer is replaced by a single factual badge. */
    const formCard = neyim.querySelector('.bg-white.rounded-2xl.shadow-sm');
    if (formCard && !formCard.querySelector('.vita-data-included-badge')) {
      const oldDrawer = Array.from(formCard.children).find(el =>
        (el.textContent || '').includes('Otomatik Entegre Klinik Veri Özeti')
      );
      if (oldDrawer) oldDrawer.style.display = 'none';
    }

    /* Remove only the redundant microcopy below symptom questions, preserving question text and IDs. */
    neyim.querySelectorAll('[data-symptom-description], .symptom-description, .symptom-card small').forEach(el => {
      el.classList.add('vita-symptom-extra');
    });
    neyim.querySelectorAll('details').forEach(el => {
      if (/teknik|biyokimyasal|bulgular/i.test(el.textContent || '') &&
          el.closest('#cdssResultContainer')) el.open = false;
    });

    /* Make sure the 24-hour chrononutrition disclosure is closed on first render. */
    home.querySelectorAll('details').forEach(el => {
      if (/krononutri|24 saatlik akıllı/i.test(el.textContent || '')) el.open = false;
    });

    /* Add concise helper class to the old repeated lab helper line; no input IDs are changed. */
    labs.querySelectorAll('p, small, span').forEach(el => {
      const txt = (el.textContent || '').trim();
      if (txt === 'Değer girildiğinde uygulama içi değerlendirme gösterilir.') {
        el.classList.add('vita-lab-helper');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyVitaTakipUIUX, { once: true });
  } else {
    applyVitaTakipUIUX();
  }
})();

/* Yapay zekâ düğmesi (sağ alt): aşağı kaydırırken gizlenir, böylece değer etiketlerini, silme ikonlarını ve
   imza/alt bilgi alanını kapatmaz; yukarı kaydırınca, durunca veya sayfa başına dönünce geri gelir. Sohbet açıkken hep görünür. */
(function () {
  "use strict";
  var lastY = window.scrollY || 0, idle = null;
  function fab() { return document.getElementById("vitaAiFab"); }
  function chatOpen() { var box = document.getElementById("vita-ai-chatbox"); return box && !box.classList.contains("hidden"); }
  function show() { var f = fab(); if (f) f.classList.remove("vita-fab-hidden"); }
  function hide() { var f = fab(); if (f && !chatOpen()) f.classList.add("vita-fab-hidden"); }
  window.addEventListener("scroll", function () {
    var y = window.scrollY || 0;
    if (y > lastY + 6 && y > 120) hide();
    else if (y < lastY - 6 || y < 120) show();
    lastY = y;
    clearTimeout(idle);
    idle = setTimeout(show, 1400);
  }, { passive: true });
})();

/* Üst bar: günlük özet göstergeleri simgesi. Basınca VitaSkor ve sabah/öğle/akşam sayaçları açılır panelde görünür
   (Ana Sayfa'da yer kaplamaz). Simgedeki rozet VitaSkor'u gösterir; dışarı dokununca, Esc'te veya sayfa değişince kapanır. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function position(panel) {
    var header = document.querySelector("header");
    var top = header ? Math.round(header.getBoundingClientRect().bottom) + 8 : 64;
    panel.style.top = Math.max(8, top) + "px";
  }
  function toggle(force) {
    var panel = $("dailySummaryPanel"), btn = $("btnHeaderDailySummary");
    if (!panel) return;
    var open = typeof force === "boolean" ? force : panel.classList.contains("hidden");
    if (open) {
      if (typeof window.renderDailyTab === "function") { try { window.renderDailyTab(); } catch (_) {} }
      position(panel);
      panel.classList.remove("hidden");
      if (window.SoundEffects) try { window.SoundEffects.playClick(); } catch (_) {}
    } else panel.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  window.toggleDailySummaryPanel = toggle;

  function syncBadge() {
    var src = $("dashVitaSkor"), badge = $("headerDailySummaryBadge");
    if (src && badge) badge.textContent = String(src.textContent || "0%").trim();
  }
  function init() {
    var src = $("dashVitaSkor");
    if (src && typeof MutationObserver === "function") new MutationObserver(syncBadge).observe(src, { childList: true, characterData: true, subtree: true });
    syncBadge();
    document.addEventListener("click", function (e) {
      var panel = $("dailySummaryPanel");
      if (!panel || panel.classList.contains("hidden")) return;
      if (!panel.contains(e.target) && !(e.target.closest && e.target.closest("#btnHeaderDailySummary"))) toggle(false);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") toggle(false); });
    window.addEventListener("resize", function () { var p = $("dailySummaryPanel"); if (p && !p.classList.contains("hidden")) position(p); });
    var orig = window.navigateToView;
    if (typeof orig === "function") window.navigateToView = function () { toggle(false); return orig.apply(this, arguments); };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
