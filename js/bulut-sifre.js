/* VitaTakip — "Şifremi unuttum" ve kurtarma kodu arayüzü (VitaPasswordReset). Sunucu işlemleri js/bulut.js'te.
   - Giriş ekranında "Şifremi unuttum" → #authResetCard:
       e-posta yazılırsa sıfırlama bağlantısı gönderilir (Supabase + Resend SMTP);
       takma ad yazılırsa kurtarma kodu + yeni şifre istenir ("sifre-kurtar" Edge Function), sonra giriş yapılır.
   - E-postadaki bağlantı (?type=recovery&token_hash=…): adres çubuğundan hemen silinir (geçmişte/ekran görüntüsünde
     kalmasın), "Yeni şifre" formu açılır; kayıtta doğrulanır ve kullanıcı giriş yapmış olur.
   - Takma adla kayıt sonrası ve kodla sıfırlama sonrası kurtarma kodu BİR KEZ gösterilir ("kaydettim" onayıyla devam).
   - Ayarlar > Veriler ve yedek: takma ad hesabında "Kurtarma kodu" satırı (durum + yeni kod oluştur).
   Tüm metinler textContent ile yazılır. */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.classList.toggle("hidden", !on); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function click() { if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {} }
  function isUsername(v) { return String(v || "").trim() !== "" && String(v).indexOf("@") === -1; }

  var pendingToken = null; // e-postadaki bağlantıdan gelen token_hash (yalnız bellekte)
  var busy = false;
  var codeContinue = null;

  /* ---------------- E-posta bağlantısı: adresten oku, hemen temizle ---------------- */
  (function readRecoveryLink() {
    try {
      var q = new URLSearchParams(location.search);
      var h = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
      var type = q.get("type") || h.get("type");
      var token = q.get("token_hash") || h.get("token_hash");
      if (type === "recovery" && token) pendingToken = token;
      if (q.has("token_hash") || q.get("type") === "recovery" || h.has("token_hash")) {
        ["token_hash", "type"].forEach(function (k) { q.delete(k); });
        var rest = q.toString();
        history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
      }
    } catch (_) {}
  })();

  /* ---------------- Paneller ---------------- */
  function setSubtitle(t) { var s = $("authSubtitle"); if (s) s.textContent = t; }
  function msg(text, isError) {
    var err = $("resetErrorMsg"), info = $("resetNoticeMsg");
    if (err) { err.textContent = isError ? text : ""; show(err, Boolean(isError && text)); }
    if (info) { info.textContent = !isError ? text : ""; show(info, Boolean(!isError && text)); }
    if (isError && text && err) try { err.focus({ preventScroll: false }); } catch (_) {}
  }
  function step(name) { // request | link | code
    show($("authCloudCard"), false);
    show($("authLocalMethodCard"), false);
    show($("authResetCard"), true);
    show($("resetRequestForm"), name === "request");
    show($("resetLinkForm"), name === "link");
    show($("recoveryCodeBox"), name === "code");
    show($("resetBackBtn"), name !== "code");
    // Hata/bilgi kutuları görünen formun içine (kaydet düğmesinin üstüne) taşınır; gizli formda kalırsa mesaj görünmez
    var anchor = $(name === "link" ? "resetLinkSubmitBtn" : "resetSubmitBtn");
    ["resetErrorMsg", "resetNoticeMsg"].forEach(function (id) { var m = $(id); if (m && anchor && anchor.parentNode) anchor.parentNode.insertBefore(m, anchor); });
    msg("");
  }
  function open(prefill) {
    step("request");
    setSubtitle("Şifre sıfırlama");
    var id = $("resetIdentifier");
    if (id) { id.value = String(prefill || "").trim(); syncFields(); try { id.focus(); } catch (_) {} }
  }
  function back() {
    show($("authResetCard"), false);
    if (window.VitaAuthUI) { VitaAuthUI.showCloud(); VitaAuthUI.setMode("login"); }
  }
  function syncFields() {
    var v = ($("resetIdentifier") || {}).value || "";
    var uname = isUsername(v);
    show($("resetCodeFields"), uname);
    var lead = $("resetLead");
    if (lead) lead.textContent = uname
      ? "Takma ad hesabı: kayıtta verilen kurtarma kodunuzu ve yeni şifrenizi yazın."
      : "E-posta adresinizi ya da takma adınızı yazın. E-postayla açılan hesaplara sıfırlama bağlantısı gönderilir.";
    var btn = $("resetSubmitBtn");
    if (btn && !busy) btn.innerHTML = uname ? "<span>Şifreyi sıfırla</span>" : "<span>Sıfırlama bağlantısı gönder</span>";
  }
  function setBusy(btnId, on, label) {
    busy = on;
    var b = $(btnId); if (!b) return;
    b.disabled = on;
    if (on) { b.setAttribute("aria-busy", "true"); b.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i><span></span>'; b.lastChild.textContent = label; }
    else b.removeAttribute("aria-busy");
  }
  function remember() { var r = lsGet("vitatakip_remember_me") === "true"; if (window.VitaCloud && VitaCloud.setTabRemember) VitaCloud.setTabRemember(r); return r; }

  /* ---------------- Kurtarma kodunu göster ---------------- */
  function showCode(code, onContinue, opts) {
    opts = opts || {};
    codeContinue = onContinue || null;
    step("code");
    setSubtitle(opts.title || "Kurtarma kodunuz");
    var v = $("recoveryCodeValue"); if (v) v.textContent = code;
    var ack = $("recoveryAckCheckbox"); if (ack) ack.checked = false;
    var cont = $("recoveryContinueBtn"); if (cont) { cont.disabled = true; cont.lastElementChild ? (cont.lastElementChild.textContent = opts.continueLabel || "Devam et") : (cont.textContent = opts.continueLabel || "Devam et"); }
    var lead = $("recoveryLead"); if (lead && opts.lead) lead.textContent = opts.lead;
  }
  function copyText(text, okMsg) {
    var done = function (ok) { if (typeof showToast === "function") showToast(ok ? "Kopyalandı" : "Kurtarma kodu", ok ? okMsg : text + " — kopyalanamadı; lütfen elle yazın.", ok ? "success" : "info"); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else done(false);
    } catch (_) { done(false); }
  }

  /* Takma adla kayıttan hemen sonra (oturum açık): kod üretilir, özeti kaydedilir, gösterilir; onayla devam. */
  async function afterUsernameSignup(onDone) {
    var res = window.VitaCloud ? await VitaCloud.createRecoveryCode() : { ok: false };
    if (!res.ok) { onDone(); if (typeof showToast === "function") showToast("Kurtarma kodu oluşturulamadı", "Ayarlar > Veriler ve yedek bölümünden kurtarma kodunuzu oluşturun; şifrenizi unutursanız tek yol budur.", "warning"); return; }
    showCode(res.code, onDone, { title: "Hesabınız hazır — kurtarma kodunuz" });
  }

  /* ---------------- Gönderimler ---------------- */
  async function submitRequest(ev) {
    if (ev) ev.preventDefault();
    if (busy || !window.VitaCloud) return;
    click(); msg("");
    var idv = (($("resetIdentifier") || {}).value || "").trim();
    if (!idv) { msg("Lütfen e-posta adresinizi veya takma adınızı girin.", true); return; }
    if (!navigator.onLine) { msg("İnternet bağlantısı yok. Şifre sıfırlama için bağlantı gerekir.", true); return; }
    if (!isUsername(idv)) {
      setBusy("resetSubmitBtn", true, "Gönderiliyor...");
      var r = await VitaCloud.requestPasswordReset(idv);
      setBusy("resetSubmitBtn", false); syncFields();
      if (!r.ok) { msg(r.error, true); return; }
      msg("Bu e-postayla bir hesap varsa sıfırlama bağlantısı gönderildi. Gelen kutunuzu (ve gereksiz/spam klasörünü) kontrol edin; bağlantı 1 saat geçerlidir.", false);
      return;
    }
    var code = ($("resetCodeInput") || {}).value || "";
    var pw = ($("resetNewPassword") || {}).value || "", pw2 = ($("resetNewPassword2") || {}).value || "";
    if (!VitaCloud.isValidUsername(idv)) { msg("Takma ad 3-20 karakter olmalı; yalnız küçük harf, rakam ve alt çizgi (_).", true); return; }
    if (VitaCloud.normalizeRecoveryCode(code).length !== 16) { msg("Kurtarma kodu 16 karakterdir (ör. ABCD-EFGH-JKLM-NPQR).", true); return; }
    if (pw.length < VitaCloud.MIN_PASSWORD) { msg("Yeni şifre en az " + VitaCloud.MIN_PASSWORD + " karakter olmalıdır.", true); return; }
    if (pw !== pw2) { msg("Girdiğiniz şifreler birbiriyle eşleşmiyor.", true); return; }
    setBusy("resetSubmitBtn", true, "Sıfırlanıyor...");
    var res = await VitaCloud.recoverWithCode(idv, code, pw);
    setBusy("resetSubmitBtn", false); syncFields();
    if (!res.ok) { msg(res.error, true); return; }
    ["resetCodeInput", "resetNewPassword", "resetNewPassword2"].forEach(function (id) { if ($(id)) $(id).value = ""; });
    var login = async function () {
      var s = await VitaCloud.signIn(idv, pw);
      if (!s.ok || !s.session) { back(); if (window.VitaAuthUI) { var i = $("cloudInputIdentifier"); if (i) i.value = idv; } return; }
      lsSet("vitatakip_auth_panel", "cloud");
      VitaAuthUI.enterSession(s.user, { isNew: false, remember: remember() });
      if (typeof showToast === "function") showToast("Şifreniz değiştirildi", "Yeni şifrenizle giriş yaptınız.", "success");
    };
    if (res.code) showCode(res.code, login, { title: "Şifreniz değiştirildi", lead: "Eski kurtarma kodunuz artık geçersiz. Yeni kodunuz aşağıda; bunu da güvenli bir yere kaydedin.", continueLabel: "Giriş yap" });
    else login();
  }

  async function submitLink(ev) {
    if (ev) ev.preventDefault();
    if (busy || !window.VitaCloud) return;
    click(); msg("");
    var pw = ($("resetLinkPassword") || {}).value || "", pw2 = ($("resetLinkPassword2") || {}).value || "";
    if (pw.length < VitaCloud.MIN_PASSWORD) { msg("Yeni şifre en az " + VitaCloud.MIN_PASSWORD + " karakter olmalıdır.", true); return; }
    if (pw !== pw2) { msg("Girdiğiniz şifreler birbiriyle eşleşmiyor.", true); return; }
    if (!navigator.onLine) { msg("İnternet bağlantısı yok. Yeni şifreyi kaydetmek için bağlantı gerekir.", true); return; }
    setBusy("resetLinkSubmitBtn", true, "Kaydediliyor...");
    var res = await VitaCloud.completeEmailReset(pendingToken, pw);
    setBusy("resetLinkSubmitBtn", false);
    var b = $("resetLinkSubmitBtn"); if (b) b.innerHTML = "<span>Yeni şifreyi kaydet</span>";
    if (!res.ok) {
      msg(res.error, true);
      if (res.code === "link_expired") { pendingToken = null; show($("resetLinkExpiredBtn"), true); }
      return;
    }
    pendingToken = null;
    ["resetLinkPassword", "resetLinkPassword2"].forEach(function (id) { if ($(id)) $(id).value = ""; });
    show($("authResetCard"), false);
    lsSet("vitatakip_auth_panel", "cloud");
    VitaAuthUI.enterSession(res.user, { isNew: false, remember: remember() });
    if (typeof showToast === "function") showToast("Şifreniz değiştirildi", "Yeni şifrenizle giriş yaptınız.", "success");
  }

  function openLinkForm() {
    if (!pendingToken) return false;
    if (typeof openAuthModal === "function") try { openAuthModal(); } catch (_) {}
    step("link");
    setSubtitle("Yeni şifre belirleyin");
    show($("resetLinkExpiredBtn"), false);
    var i = $("resetLinkPassword"); if (i) try { i.focus(); } catch (_) {}
    return true;
  }

  /* ---------------- Ayarlar: kurtarma kodu satırı (yalnız takma ad bulut hesabı) ---------------- */
  async function refreshSettings() {
    var row = $("settingsRecoveryRow"); if (!row) return;
    var uid = typeof activeUserId !== "undefined" ? activeUserId : null;
    if (!window.VitaCloud || !VitaCloud.isCloudUserId(uid)) { show(row, false); return; }
    var s = await VitaCloud.getSession();
    var email = s && s.user && s.user.email;
    if (!s || s.user.id !== uid || !VitaCloud.isUsernameAccount(email)) { show(row, false); return; }
    show(row, true);
    var st = $("settingsRecoveryStatus");
    var r = await VitaCloud.recoveryCodeStatus();
    if (!st) return;
    st.classList.toggle("text-rose-600", r.ok && !r.exists);
    if (!r.ok) st.textContent = "Durum okunamadı (internet bağlantısı gerekir).";
    else if (!r.exists) st.textContent = "Kurtarma kodunuz yok. Takma ad hesabında e-posta olmadığı için şifrenizi unutursanız tek yol budur — şimdi oluşturun.";
    else st.textContent = "Oluşturuldu: " + new Date(r.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) + ". Kaybettiyseniz yenisini oluşturun (eskisi geçersiz olur).";
  }
  async function newCodeFromSettings() {
    click();
    var btn = $("settingsRecoveryNewBtn"); if (btn) btn.disabled = true;
    var r = await VitaCloud.createRecoveryCode();
    if (btn) btn.disabled = false;
    if (!r.ok) { if (typeof showToast === "function") showToast("Kurtarma kodu oluşturulamadı", r.error || "Lütfen tekrar deneyin.", "error"); return; }
    var box = $("settingsRecoveryCodeBox"), v = $("settingsRecoveryCodeValue");
    if (v) v.textContent = r.code;
    show(box, true);
    refreshSettings();
  }
  function watchSettingsView() {
    var view = $("view-settings"); if (!view || !window.MutationObserver) return;
    var wasHidden = view.classList.contains("hidden");
    new MutationObserver(function () {
      var hidden = view.classList.contains("hidden");
      if (wasHidden && !hidden) { show($("settingsRecoveryCodeBox"), false); refreshSettings(); }
      wasHidden = hidden;
    }).observe(view, { attributes: true, attributeFilter: ["class"] });
  }

  /* ---------------- Olaylar ---------------- */
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    if (t.closest("#cloudForgotBtn")) { click(); open(($("cloudInputIdentifier") || {}).value); return; }
    if (t.closest("#resetBackBtn") || t.closest("#resetLinkExpiredBtn")) { click(); if (t.closest("#resetLinkExpiredBtn")) open(""); else back(); return; }
    if (t.closest("#recoveryCopyBtn")) { copyText(($("recoveryCodeValue") || {}).textContent || "", "Kurtarma kodunuz panoya kopyalandı."); return; }
    if (t.closest("#settingsRecoveryCopyBtn")) { copyText(($("settingsRecoveryCodeValue") || {}).textContent || "", "Kurtarma kodunuz panoya kopyalandı."); return; }
    if (t.closest("#recoveryContinueBtn")) {
      click();
      var fn = codeContinue; codeContinue = null;
      var v = $("recoveryCodeValue"); if (v) v.textContent = "";
      show($("authResetCard"), false);
      if (fn) fn();
      return;
    }
    if (t.closest("#settingsRecoveryNewBtn")) { newCodeFromSettings(); }
  });
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "recoveryAckCheckbox") { var b = $("recoveryContinueBtn"); if (b) b.disabled = !e.target.checked; }
  });
  document.addEventListener("input", function (e) { if (e.target && e.target.id === "resetIdentifier") syncFields(); });
  document.addEventListener("submit", function (e) {
    if (!e.target) return;
    if (e.target.id === "resetRequestForm") submitRequest(e);
    else if (e.target.id === "resetLinkForm") submitLink(e);
  });
  document.addEventListener("vita:cloud-session", function () { refreshSettings(); });
  // Açılış betikleri (oturum geri yükleme / giriş ekranı) bittikten sonra bağlantı formu açılır
  function boot() { watchSettingsView(); if (pendingToken) setTimeout(openLinkForm, 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.VitaPasswordReset = {
    open: open, back: back, openLinkForm: openLinkForm, showCode: showCode, afterUsernameSignup: afterUsernameSignup,
    refreshSettings: refreshSettings, hasPendingLink: function () { return Boolean(pendingToken); },
    _setPendingTokenForTests: function (t) { pendingToken = t || null; }
  };
})();
