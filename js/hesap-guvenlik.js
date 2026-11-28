/* VitaTakip — Ayarlar > "Hesap ve güvenlik" (VitaAccount).
   - Giriş bilgisi (e-posta ya da @takma ad) ve hesap türü.
   - Şifre değiştir: mevcut şifre doğrulanır (VitaCloud.changePassword), sonra yeni şifre kaydedilir.
   - Aynı kartta: kurtarma kodu (takma ad hesabı; js/bulut-sifre.js) ve hesabı silme (deleteMyAccountData).
   Metinler textContent ile yazılır. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.classList.toggle("hidden", !on); }
  function uid() { var id = typeof activeUserId !== "undefined" ? activeUserId : null; return window.VitaCloud && VitaCloud.isCloudUserId(id) ? id : null; }
  var busy = false;

  function msg(text, tone) { var m = $("settingsPwMsg"); if (!m) return; m.textContent = text || ""; m.setAttribute("data-tone", tone || "info"); show(m, Boolean(text)); }

  async function refresh() {
    var id = uid();
    var login = $("settingsAccountLogin"), type = $("settingsAccountType"), sum = $("settingsAccountSummary"), pw = $("settingsPasswordRow");
    if (!id) {
      if (login) login.textContent = "—"; if (type) type.textContent = "Hesap bilgisi yok";
      show(pw, false); if (sum) sum.textContent = "Giriş bilgisi yok"; return;
    }
    show(pw, true);
    var s = await VitaCloud.getSession();
    if (uid() !== id) return;
    var email = s && s.user && s.user.id === id ? String(s.user.email || "") : "";
    var p = VitaCloud.cachedProfile(id) || {};
    var shown = VitaCloud.isUsernameAccount(email) ? "@" + email.split("@")[0] : (email || "—");
    var kind = (p.account_type === "doctor" ? "Doktor hesabı" : "Hasta hesabı") + (p.is_admin ? " · Yönetici" : "");
    if (login) login.textContent = shown;
    if (type) type.textContent = kind;
    if (sum) sum.textContent = shown + " · " + kind;
  }

  async function changePassword(ev) {
    if (ev) ev.preventDefault();
    if (busy || !uid()) return;
    var cur = ($("settingsPwCurrent") || {}).value || "", nw = ($("settingsPwNew") || {}).value || "", nw2 = ($("settingsPwNew2") || {}).value || "";
    msg("");
    if (!cur) { msg("Mevcut şifrenizi yazın.", "error"); return; }
    if (nw.length < VitaCloud.MIN_PASSWORD) { msg("Yeni şifre en az " + VitaCloud.MIN_PASSWORD + " karakter olmalıdır.", "error"); return; }
    if (nw !== nw2) { msg("Yeni şifreler birbiriyle eşleşmiyor.", "error"); return; }
    if (nw === cur) { msg("Yeni şifre mevcut şifrenizle aynı olamaz.", "error"); return; }
    if (!navigator.onLine) { msg("Şifre değiştirmek için internet bağlantısı gerekir.", "error"); return; }
    busy = true; var btn = $("settingsPwSave"); if (btn) btn.disabled = true;
    try {
      var r = await VitaCloud.changePassword(cur, nw);
      if (!r.ok) { msg(r.error || "Şifre değiştirilemedi.", "error"); return; }
      ["settingsPwCurrent", "settingsPwNew", "settingsPwNew2"].forEach(function (id) { if ($(id)) $(id).value = ""; });
      msg("Şifreniz değiştirildi. Diğer cihazlarda bir sonraki girişte yeni şifrenizi kullanın.", "ok");
      if (typeof showToast === "function") showToast("Şifre değiştirildi", "Yeni şifreniz kaydedildi.", "success");
    } finally { busy = false; if (btn) btn.disabled = false; }
  }

  document.addEventListener("submit", function (e) { if (e.target && e.target.id === "settingsPasswordForm") changePassword(e); });
  document.addEventListener("vita:cloud-session", refresh);
  document.addEventListener("vita:cloud-profile", refresh);
  function watch() {
    var view = $("view-settings"); if (!view || !window.MutationObserver) return;
    var wasHidden = view.classList.contains("hidden");
    new MutationObserver(function () {
      var hidden = view.classList.contains("hidden");
      if (wasHidden && !hidden) { msg(""); refresh(); }
      wasHidden = hidden;
    }).observe(view, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();

  window.VitaAccount = { refresh: refresh, changePassword: changePassword };
})();
