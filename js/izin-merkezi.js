/* Merkezi izin yönetimi (Ayarlar > Bildirim ve Kamera İzinleri): bildirim, kamera ve MİKROFON.
   - Mikrofon izni (Klinik Analiz / asistan sesle yazma) burada önceden test edilip verilebilir.
   - Tarayıcıda engellenmiş (Reddedildi) bir izin için yalnızca hata göstermek yerine adres çubuğundaki kilit simgesinden
     nasıl açılacağını anlatan bir yönlendirme kartı ve "İzni Yeniden Doğrula" düğmesi gösterilir.
   - Yapay zekâ ayarlarına giden ortak "Ayarlar" bağlantısı (anahtar yoksa anahtar alanı, onay yoksa onay kutusu). */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  var LABEL = { notifications: "Bildirim", camera: "Kamera", microphone: "Mikrofon" };
  var BADGE = "text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ";
  var TONE = { granted: "bg-emerald-50 text-emerald-800 border-emerald-200", denied: "bg-rose-50 text-rose-800 border-rose-200", prompt: "bg-amber-50 text-amber-800 border-amber-200" };

  /* ---------- Yapay zekâ ayarlarına yönlendirme ---------- */
  function openVitaAiSettings() {
    if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {}
    if (typeof stopVitaMedCamera === "function") try { stopVitaMedCamera(); } catch (_) {}
    if (typeof stopScanner === "function") try { stopScanner(); } catch (_) {}
    if (typeof navigateToView === "function") navigateToView("view-settings");
    setTimeout(function () {
      var hasKey = typeof getGeminiApiKey === "function" && getGeminiApiKey();
      var target = $(hasKey ? "aiHealthDataConsentSettings" : "drawerGeminiApiKeyInput") || $("settingsSectionAiConnection");
      if (!target) return;
      if (typeof window.openSettingsSectionFor === "function") window.openSettingsSectionFor(target);
      try { target.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
      var card = target.closest ? (target.closest("#aiHealthDataConsentSettings") || target) : target;
      card.classList.add("vita-attention");
      setTimeout(function () { card.classList.remove("vita-attention"); }, 2600);
      if (!hasKey && target.focus) try { target.focus({ preventScroll: true }); } catch (_) {}
    }, 220);
  }
  function aiSettingsLinkHtml() {
    return '<button type="button" class="vita-set-link" onclick="openVitaAiSettings()"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i> Ayarlar</button>';
  }

  /* ---------- İzin durumu ---------- */
  async function queryState(kind) {
    if (kind === "notifications") {
      if (!("Notification" in window)) return "unsupported";
      return Notification.permission === "default" ? "prompt" : Notification.permission;
    }
    try {
      if (navigator.permissions && navigator.permissions.query) {
        var st = await navigator.permissions.query({ name: kind });
        return st.state; // granted | denied | prompt
      }
    } catch (_) { /* tarayıcı bu izni sorgulatmıyor */ }
    return "prompt";
  }
  function stateText(s) { return s === "granted" ? "İzin Verildi" : s === "denied" ? "Reddedildi" : s === "unsupported" ? "Desteklenmiyor" : "Henüz İstenmedi"; }

  async function renderMic() {
    var s = await queryState("microphone");
    var badge = $("settingsMicPermBadge");
    if (badge) { badge.className = BADGE + (TONE[s] || TONE.prompt); badge.textContent = "Mikrofon İzni: " + stateText(s); }
    var hint = $("settingsMicPermHint");
    if (hint) hint.textContent = s === "granted" ? "Mikrofon izni verildi; Klinik Analiz ve asistanda sesle yazabilirsiniz." : s === "denied" ? "Mikrofon tarayıcıda engellenmiş. Aşağıdaki adımlarla açabilirsiniz." : "Klinik Analiz ve asistanda sesle yazmak için mikrofon izni gerekir.";
    var lbl = $("settingsMicPermBtnLabel"); if (lbl) lbl.textContent = s === "granted" ? "Mikrofonu Test Et" : "Mikrofon İznini Ver";
    if (s === "denied") showBlockedHelp("microphone"); else hideBlockedHelp("microphone");
    return s;
  }

  /* Mikrofonu önceden test et / yetkilendir: kısa bir ses akışı açılır ve hemen kapatılır (hiçbir ses kaydedilmez, gönderilmez). */
  async function testMicrophone() {
    if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {}
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (typeof showToast === "function") showToast("Desteklenmiyor", "Bu tarayıcı mikrofon erişimini desteklemiyor.", "warning");
      return false;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(function (t) { t.stop(); });
      if (typeof showToast === "function") showToast("Mikrofon hazır", "Mikrofon izni verildi ve çalışıyor. Ses kaydedilmedi, hiçbir yere gönderilmedi.", "success");
      await renderMic();
      return true;
    } catch (e) {
      var denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
      if (typeof showToast === "function") showToast(denied ? "Mikrofon engellendi" : "Mikrofon açılamadı", denied ? "Tarayıcı mikrofon iznini engelledi. Aşağıdaki adımlarla açabilirsiniz." : "Mikrofon bulunamadı veya başka bir uygulama kullanıyor.", "warning");
      await renderMic();
      if (denied) showBlockedHelp("microphone");
      return false;
    }
  }

  /* ---------- Engellenmiş izin yönlendirme kartı ---------- */
  function helpHtml(kind) {
    var name = LABEL[kind] || "İzin";
    return '<div class="vperm-help" role="alert">' +
      '<b><i class="fa-solid fa-lock" aria-hidden="true"></i> ' + name + ' izni tarayıcıda engellenmiş</b>' +
      '<ol>' +
      '<li>Adres çubuğundaki <b>kilit</b> (veya ayar) simgesine dokunun.</li>' +
      '<li><b>İzinler / Site ayarları</b> → <b>' + name + '</b> → <b>İzin ver</b> seçin.</li>' +
      '<li>Uygulama olarak yüklediyseniz: telefonun <b>Ayarlar → Uygulamalar → VitaTakip</b> (veya tarayıcı) → <b>İzinler</b>.</li>' +
      '<li>Ardından aşağıdaki düğmeye dokunun.</li>' +
      '</ol>' +
      '<button type="button" class="vperm-recheck" data-perm-recheck="' + kind + '"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> İzni Yeniden Doğrula</button>' +
      '</div>';
  }
  function helpBox(kind) { return $("permHelp_" + kind); }
  function showBlockedHelp(kind, focus) {
    var box = helpBox(kind); if (!box) return;
    if (!box.firstChild) box.innerHTML = helpHtml(kind);
    box.classList.remove("hidden");
    if (focus) {
      if (typeof window.openSettingsSectionFor === "function") window.openSettingsSectionFor(box);
      try { box.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
    }
  }
  function hideBlockedHelp(kind) { var box = helpBox(kind); if (box) { box.classList.add("hidden"); box.innerHTML = ""; } }

  async function recheck(kind) {
    if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {}
    var s = await queryState(kind);
    if (kind === "notifications") {
      if (s === "granted") {
        try { localStorage.setItem("vitatakip_notifications_enabled", "true"); } catch (_) {}
        if (typeof updateNotificationToggleUI === "function") updateNotificationToggleUI();
        if (typeof startNotificationScheduler === "function") startNotificationScheduler();
        hideBlockedHelp(kind);
        if (typeof showToast === "function") showToast("Bildirim izni açık", "Dozaj hatırlatmaları etkinleştirildi.", "success");
        return true;
      }
      if (s === "prompt" && typeof toggleBrowserNotifications === "function") { await toggleBrowserNotifications(); return Notification.permission === "granted"; }
    } else if (kind === "microphone") {
      if (s !== "denied") return testMicrophone();
      await renderMic();
    } else if (kind === "camera") {
      if (s !== "denied" && typeof window.requestOrVerifyCameraPermission === "function") { var ok = await window.requestOrVerifyCameraPermission(true); if (ok) { hideBlockedHelp(kind); return true; } }
    }
    if (typeof showToast === "function") showToast(LABEL[kind] + " izni hâlâ engelli", "Kilit simgesinden izni açtıktan sonra yeniden deneyin; gerekirse sayfayı yenileyin.", "warning");
    showBlockedHelp(kind);
    return false;
  }

  /* Kamera: izin düğmesi engellenmiş durumda sonuçsuz kalırsa yönlendirme kartı */
  function wrapCamera() {
    var orig = window.requestOrVerifyCameraPermission;
    if (typeof orig !== "function" || orig.__vpermWrapped) return;
    var w = async function () {
      var r = await orig.apply(this, arguments);
      if (!r && (await queryState("camera")) === "denied") showBlockedHelp("camera", true); else if (r) hideBlockedHelp("camera");
      return r;
    };
    w.__vpermWrapped = true;
    window.requestOrVerifyCameraPermission = w;
  }

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-perm-recheck]") : null;
    if (b) recheck(b.getAttribute("data-perm-recheck"));
  });

  window.VitaPermissions = { query: queryState, renderMic: renderMic, testMicrophone: testMicrophone, showBlockedHelp: showBlockedHelp, hideBlockedHelp: hideBlockedHelp, recheck: recheck };
  window.openVitaAiSettings = openVitaAiSettings;
  window.vitaAiSettingsLinkHtml = aiSettingsLinkHtml;

  function init() {
    wrapCamera();
    renderMic();
    try { if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: "microphone" }).then(function (st) { st.onchange = renderMic; }).catch(function () {}); } catch (_) {}
    if ("Notification" in window && Notification.permission === "denied") showBlockedHelp("notifications");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
