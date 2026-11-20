/* Ayarlar: beş bölüm katlanabilir bloklara dönüşür (Profil, Bildirim ve Kamera İzinleri, Yapay Zekâ & Model Yönetimi,
   Araçlar, Veriler ve Yedek). Başlıkta her bölümün durum özeti görünür. HTML ve id'ler korunur; yalnızca içerik
   bir gövde kabına alınır. Uygulamanın bir bölümün içine yönlendirdiği durumlarda (ör. onay, kamera izni) bölüm açılır. */
(function () {
  "use strict";
  var SECTIONS = [
    { id: "settingsSectionProfile", title: "Profil" },
    { id: "settingsSectionNotifications", title: "Bildirim ve Kamera İzinleri" },
    { id: "settingsSectionAiConnection", title: "Yapay Zekâ & Model Yönetimi" },
    { id: "settingsSectionTools", title: "Araçlar" },
    { id: "settingsSectionBackup", title: "Veriler ve Yedek" }
  ];
  var STORE = "vita_settings_open_sections";

  function readOpen() {
    try { var v = JSON.parse(localStorage.getItem(STORE) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }
  function writeOpen(list) {
    try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (_) { /* özel tarama: yalnızca bu oturumda */ }
  }

  function setOpen(section, open, remember) {
    if (!section) return;
    section.classList.toggle("vst-open", open);
    var body = section.querySelector(":scope > .vst-body");
    if (body) body.hidden = !open;
    var btn = section.querySelector(".vst-toggle");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (remember !== false) {
      var list = readOpen().filter(function (id) { return id !== section.id; });
      if (open) list.push(section.id);
      writeOpen(list);
    }
  }

  /* Başlıklardaki durum özetleri */
  function summaryFor(id) {
    var st = typeof state !== "undefined" ? state : null;
    try {
      if (id === "settingsSectionProfile") {
        var u = st && st.user;
        if (!u) return "";
        var meds = Array.isArray(st.medications) ? st.medications.length : (Array.isArray(u.medications) ? u.medications.length : 0);
        var complete = typeof window.isVitaProfileComplete === "function" ? window.isVitaProfileComplete() : true;
        return [u.name || "", complete ? (u.age ? u.age + " yaş" : "") : "Profil eksik", meds ? meds + " ilaç" : ""].filter(Boolean).join(" · ");
      }
      if (id === "settingsSectionNotifications") {
        var n = document.getElementById("settingsBrowserPermBadge"), c = document.getElementById("settingsCameraPermBadge");
        // "Tarayıcı İzni: Henüz İstenmedi" → "Henüz İstenmedi" (iki nokta sonrası durum).
        var short = function (el) { var t = el ? String(el.textContent || "").trim() : ""; var i = t.indexOf(":"); return i > -1 ? t.slice(i + 1).trim() : t; };
        return ["Bildirim: " + short(n), "Kamera: " + short(c)].join(" · ");
      }
      if (id === "settingsSectionAiConnection") {
        var key = typeof window.getGeminiApiKey === "function" && window.getGeminiApiKey();
        if (!key) return "Yerel asistan · anahtar yok";
        var model = String((document.getElementById("geminiActiveModelBadge") || {}).textContent || "").trim();
        var consent = document.getElementById("aiHealthDataConsent");
        return "Aktif model: " + (model && model !== "—" ? model : "otomatik") + (consent && !consent.checked ? " · onay yok" : "");
      }
      if (id === "settingsSectionTools") {
        var standalone = window.matchMedia && (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone);
        return standalone ? "Uygulama cihaza yüklü" : "Kurulum ve çizelge araçları";
      }
      if (id === "settingsSectionBackup") {
        var uid = typeof window.activeUserId !== "undefined" ? window.activeUserId : (typeof activeUserId !== "undefined" ? activeUserId : "");
        var last = Number(localStorage.getItem("vitatakip_last_backup_" + uid) || 0);
        if (!last) return "Henüz yedek alınmadı";
        var days = Math.floor((Date.now() - last) / 86400000);
        return days <= 0 ? "Son yedek: bugün" : "Son yedek: " + days + " gün önce";
      }
    } catch (_) { /* özet isteğe bağlı */ }
    return "";
  }
  function refreshSummaries() {
    SECTIONS.forEach(function (s) {
      var el = document.getElementById(s.id + "Summary");
      if (el) el.textContent = summaryFor(s.id);
    });
  }

  function build() {
    SECTIONS.forEach(function (s) {
      var section = document.getElementById(s.id);
      if (!section || section.dataset.vstReady) return;
      var header = section.firstElementChild;
      if (!header) return;
      section.dataset.vstReady = "1";
      section.classList.add("vst-section");
      header.classList.add("vst-head");

      // İçerik (başlık dışındaki her şey) gövdeye taşınır.
      var body = document.createElement("div");
      body.className = "vst-body";
      body.id = s.id + "Body";
      while (header.nextSibling) body.appendChild(header.nextSibling);
      section.appendChild(body);

      // Başlık: simge + başlık + özet tek bir açma/kapama düğmesi olur (başlık seviyesi korunur).
      var h3 = header.querySelector("h3");
      var icon = h3 && h3.previousElementSibling && h3.previousElementSibling.tagName === "I" ? h3.previousElementSibling : header.querySelector("i");
      var group = h3 ? h3.parentElement : header;
      var newH3 = document.createElement("h3");
      newH3.className = "vst-title";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vst-toggle";
      btn.setAttribute("aria-controls", body.id);
      btn.innerHTML = '<span class="vst-ico"></span><span class="vst-text"><span class="vst-name"></span><span class="vst-summary" id="' + s.id + 'Summary"></span></span><i class="fa-solid fa-chevron-down vst-chev" aria-hidden="true"></i>';
      btn.querySelector(".vst-name").textContent = s.title;
      if (icon) btn.querySelector(".vst-ico").appendChild(icon);
      newH3.appendChild(btn);
      if (h3) h3.remove();
      if (group !== header && !group.children.length) group.remove();
      header.insertBefore(newH3, header.firstChild);
      // Başlıktaki durum etiketleri (izin rozetleri, veri özeti vb.) başlığı daraltmasın: gövdenin üstüne taşınır.
      // Düğmeler (ör. "Profili Düzenle") başlıkta kalır. Özet satırı aynı bilgiyi başlıkta zaten gösterir.
      var statusRow = null;
      Array.prototype.slice.call(header.children).forEach(function (child) {
        if (child === newH3 || child.tagName === "BUTTON" || (child.querySelector && child.querySelector("button") && !child.querySelector("span[id]"))) return;
        if (!statusRow) { statusRow = document.createElement("div"); statusRow.className = "vst-status"; body.insertBefore(statusRow, body.firstChild); }
        statusRow.appendChild(child);
      });
      btn.addEventListener("click", function () {
        if (window.SoundEffects) window.SoundEffects.playClick();
        setOpen(section, !section.classList.contains("vst-open"));
        refreshSummaries();
      });
      // Klavyeyle gövdeye odak gelirse bölüm açılır.
      body.addEventListener("focusin", function () { if (!section.classList.contains("vst-open")) setOpen(section, true); });
      setOpen(section, readOpen().indexOf(s.id) > -1, false);
    });
    refreshSummaries();

    // Durum değişince özetler güncellenir (model geçişi, izin rozetleri, profil).
    var watch = ["geminiActiveModelBadge", "apiStatusBadge", "settingsBrowserPermBadge", "settingsCameraPermBadge", "settingsProfileName", "settingsProfileMedsSummary", "settingsDataSummaryText"];
    if (typeof MutationObserver === "function") {
      var mo = new MutationObserver(refreshSummaries);
      watch.forEach(function (id) { var el = document.getElementById(id); if (el) mo.observe(el, { childList: true, characterData: true, subtree: true }); });
      var consent = document.getElementById("aiHealthDataConsent");
      if (consent) consent.addEventListener("change", refreshSummaries);
    }
    var view = document.getElementById("view-settings");
    if (view && typeof MutationObserver === "function") {
      new MutationObserver(function () { if (!view.classList.contains("hidden")) refreshSummaries(); }).observe(view, { attributes: true, attributeFilter: ["class"] });
    }
  }

  /* Uygulamanın Ayarlar içindeki bir öğeye yönlendirdiği yerlerde bölümü aç. */
  window.openSettingsSectionFor = function (target) {
    var el = typeof target === "string" ? document.getElementById(target) : target;
    var section = el && el.closest ? el.closest(".vst-section") : null;
    if (section && !section.classList.contains("vst-open")) setOpen(section, true);
    return section;
  };
  window.refreshSettingsSummaries = refreshSummaries;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build, { once: true });
  else build();
})();
