/* VitaTakip — giriş ekranındaki BULUT HESABI paneli (Adım 2).
   - Giriş: tek kutu "E-posta veya takma ad" + şifre.
   - Kayıt: "Takma adla" / "E-postayla"; KVKK açık rıza kutusu zorunlu.
   - Yerel hesap paneli (#authLocalMethodCard) ve akışı (handleAuthSubmit) aynen korunur; paneller arasında geçilir.
     Cihazda yerel hesap varsa ekran yerel panelle açılır (mevcut kullanıcılar bir şey fark etmez).
   - Bulut kullanıcısının uygulama içi kimliği Supabase uuid'idir; veriler yine "vitatakip_<tür>_<uuid>" anahtarlarında,
     önce cihazda tutulur (eşitleme Adım 3'te, js/bulut-esitleme.js).
   - Oturum: js/bulut.js (VitaCloud). "Beni hatırla" yerel hesaplarla aynı anahtarı (vitatakip_remember_me) kullanır. */
(function () {
  "use strict";
  var PANEL_KEY = "vitatakip_auth_panel"; // son kullanılan panel: "cloud" | "local"
  var mode = "login";      // login | register
  var kind = "username";   // username | email (yalnız kayıt)
  var acct = "patient";    // patient | doctor (yalnız kayıt; doktor "onay bekliyor" açılır)
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.classList.toggle("hidden", !on); }
  function lsGet(k) { try { return typeof safeLocalStorageGetItem === "function" ? safeLocalStorageGetItem(k) : localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { if (typeof safeLocalStorageSetItem === "function") safeLocalStorageSetItem(k, v); else localStorage.setItem(k, v); } catch (_) {} }
  function lsDel(k) { try { if (typeof safeLocalStorageRemoveItem === "function") safeLocalStorageRemoveItem(k); else localStorage.removeItem(k); } catch (_) {} }
  function localAccountCount() {
    try { return (typeof getUsersDb === "function" ? getUsersDb() : []).filter(function (u) { return u && u.id !== "usr_guest_local"; }).length; }
    catch (_) { return 0; }
  }

  /* ---------------- Panel seçimi ---------------- */
  function currentPanel() { return $("authCloudCard") && !$("authCloudCard").classList.contains("hidden") ? "cloud" : "local"; }
  function showPanel(panel, remember) {
    var cloud = panel === "cloud";
    show($("authCloudCard"), cloud);
    show($("authLocalMethodCard"), !cloud);
    show($("authCloudDataNotice"), cloud);
    show($("authLocalDataNotice"), !cloud);
    var sub = $("authSubtitle");
    if (cloud && sub) sub.textContent = title();
    if (!cloud && typeof switchAuthMode === "function") switchAuthMode(typeof currentAuthMode === "string" ? currentAuthMode : "login");
    if (remember) lsSet(PANEL_KEY, panel);
    if (cloud) { syncRememberBox(); updateOfflineNotice(); }
  }
  function showCloud() { showPanel("cloud", true); }
  function showLocal() { showPanel("local", true); }

  /* Giriş ekranı her açıldığında: son kullanılan panel; yoksa cihazda yerel hesap varsa yerel, yoksa bulut. */
  function onOpen() {
    var saved = lsGet(PANEL_KEY);
    var panel = saved === "cloud" || saved === "local" ? saved : (localAccountCount() > 0 ? "local" : "cloud");
    setMode(mode);
    showPanel(panel, false);
  }

  /* ---------------- Sekme (Hasta | Doktor) ve giriş/kayıt modu ---------------- */
  function title() {
    var who = acct === "doctor" ? "Doktor" : "Hasta";
    return mode === "register" ? who + " hesabı oluşturun" : who + " girişi";
  }
  function setMode(m) {
    mode = m === "register" ? "register" : "login";
    var reg = mode === "register";
    show($("cloudFullNameField"), reg);
    show($("cloudConfirmField"), reg);
    var pw = $("cloudInputPassword"); if (pw) { pw.autocomplete = reg ? "new-password" : "current-password"; pw.placeholder = reg ? "Şifre (en az 8 karakter)" : "Şifre"; }
    var btn = $("cloudSubmitBtn"); if (btn) btn.innerHTML = reg ? "<span>Hesap Oluştur</span>" : "<span>Giriş Yap</span>";
    var toggle = $("cloudModeToggle");
    if (toggle) { toggle.textContent = reg ? "Zaten hesabım var · Giriş yap" : "Hesap oluştur"; toggle.setAttribute("data-cloud-mode", reg ? "login" : "register"); }
    show($("cloudForgotBtn"), !reg);
    setAcct(acct);
    setKind(kind);
    setMessage("");
  }
  /* Üst sekme hesap türünü belirler. Hasta: sağlık verisi açık rızası; Doktor: onay bilgisi + hekim taahhüdü. */
  function setAcct(a) {
    acct = a === "doctor" ? "doctor" : "patient";
    Array.prototype.forEach.call(document.querySelectorAll("[data-cloud-acct]"), function (b) {
      var on = b.getAttribute("data-cloud-acct") === acct;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var reg = mode === "register";
    show($("cloudConsentRow"), reg && acct === "patient");
    show($("cloudDoctorInfo"), reg && acct === "doctor");
    show($("cloudDoctorConsentRow"), reg && acct === "doctor");
    show($("authShowLocalBtn"), acct === "patient"); // yerel hesap yalnız hasta içindir
    var nameInput = $("cloudInputFullName"); if (nameInput) nameInput.placeholder = acct === "doctor" ? "Ad Soyad (ör. Dr. Ahmet Yılmaz)" : "Ad Soyad";
    var t = $("cloudFormTitle"); if (t) t.textContent = title();
    var sub = $("authSubtitle"); if (sub && currentPanel() === "cloud") sub.textContent = title();
  }
  /* Takma ad mı e-posta mı: kayıtta yazılan değere göre ("@" varsa e-posta). Uyarı/ipucu yalnız takma adda. */
  function setKind(k) {
    kind = k === "email" ? "email" : "username";
    var reg = mode === "register";
    var input = $("cloudInputIdentifier"), icon = $("cloudIdentifierIcon");
    if (input) { input.type = "text"; input.autocomplete = reg && kind === "email" ? "email" : "username"; }
    if (icon) icon.className = (kind === "email" ? "fa-solid fa-envelope" : "fa-solid fa-at") + " vta-ico";
    var typed = input ? input.value.trim() : "";
    show($("cloudIdentifierHint"), reg && kind === "username");
    show($("cloudUsernameWarning"), reg && kind === "username" && typed.length > 0);
  }
  function syncKindFromInput() {
    var input = $("cloudInputIdentifier"); if (!input || mode !== "register") return;
    setKind(input.value.indexOf("@") !== -1 ? "email" : "username");
  }

  function setMessage(text, isError, focus) {
    var err = $("cloudErrorMsg"), note = $("cloudNoticeMsg");
    if (err) { err.textContent = isError ? String(text || "") : ""; show(err, Boolean(isError && text)); }
    if (note) { note.textContent = !isError ? String(text || "") : ""; show(note, Boolean(!isError && text)); }
    if (isError && text && focus && err) { try { err.focus({ preventScroll: false }); } catch (_) {} }
  }
  function updateOfflineNotice() {
    if (currentPanel() !== "cloud") return;
    if (!navigator.onLine) setMessage("İnternet bağlantısı yok. Bulut hesabına giriş için bağlantı gerekir; bu cihazda daha önce giriş yaptıysanız uygulama zaten açılır. İsterseniz yerel hesap kullanabilirsiniz.", false);
    else { var note = $("cloudNoticeMsg"); if (note && /İnternet bağlantısı yok/.test(note.textContent)) setMessage(""); }
  }
  function syncRememberBox() {
    var cb = $("cloudRememberMeCheckbox");
    if (cb) cb.checked = typeof isRememberMeEnabled === "function" ? isRememberMeEnabled() : lsGet("vitatakip_remember_me") === "true";
  }
  function setBusy(on) {
    busy = on;
    var btn = $("cloudSubmitBtn"); if (!btn) return;
    btn.disabled = on;
    if (on) { btn.setAttribute("aria-busy", "true"); btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i><span>' + (mode === "register" ? "Hesap oluşturuluyor..." : "Giriş yapılıyor...") + "</span>"; }
    else { btn.removeAttribute("aria-busy"); setMode(mode); }
  }

  /* ---------------- Gönderim ---------------- */
  async function submit(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (busy || !window.VitaCloud) return false;
    if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {}
    var idInput = $("cloudInputIdentifier"), pwInput = $("cloudInputPassword");
    var identifier = idInput ? idInput.value.trim() : "";
    var password = pwInput ? pwInput.value : "";
    var remember = Boolean($("cloudRememberMeCheckbox") && $("cloudRememberMeCheckbox").checked);
    setMessage("");

    if (!identifier) { setMessage(mode === "register" ? (kind === "username" ? "Lütfen bir takma ad girin." : "Lütfen e-posta adresinizi girin.") : "Lütfen e-posta adresinizi veya takma adınızı girin.", true, true); if (idInput) idInput.focus(); return false; }
    if (mode === "register") {
      kind = identifier.indexOf("@") !== -1 ? "email" : "username";
      var fullName = ($("cloudInputFullName") ? $("cloudInputFullName").value : "").trim().replace(/\s+/g, " ");
      if (fullName.length < 2) { setMessage("Lütfen adınızı en az 2 karakterle girin.", true, true); if ($("cloudInputFullName")) $("cloudInputFullName").focus(); return false; }
      if (kind === "username" && !VitaCloud.isValidUsername(identifier)) { setMessage("Takma ad 3-20 karakter olmalı; yalnız küçük harf, rakam ve alt çizgi (_) kullanın. Türkçe karakter kullanmayın.", true, true); if (idInput) idInput.focus(); return false; }
      if (password.length < VitaCloud.MIN_PASSWORD) { setMessage("Şifre en az " + VitaCloud.MIN_PASSWORD + " karakter olmalıdır.", true, true); if (pwInput) pwInput.focus(); return false; }
      if (password !== ($("cloudInputPasswordConfirm") ? $("cloudInputPasswordConfirm").value : "")) { setMessage("Girdiğiniz şifreler birbiriyle eşleşmiyor.", true, true); if ($("cloudInputPasswordConfirm")) $("cloudInputPasswordConfirm").focus(); return false; }
      if (acct === "doctor") {
        if (!($("cloudDoctorConsentCheckbox") && $("cloudDoctorConsentCheckbox").checked)) { setMessage("Doktor hesabı için hekim taahhüdünü onaylamanız gerekir.", true, true); return false; }
      } else if (!($("cloudConsentCheckbox") && $("cloudConsentCheckbox").checked)) { setMessage("Bulut hesabı için sağlık verilerinizin saklanmasına açık rıza vermeniz gerekir. İstemiyorsanız \"Bu cihazda yerel hesap\" seçeneğini kullanabilirsiniz.", true, true); return false; }
    } else if (!password) { setMessage("Lütfen şifrenizi girin.", true, true); if (pwInput) pwInput.focus(); return false; }
    if (!navigator.onLine) { updateOfflineNotice(); return false; }

    // Oturum belirtecinin hangi depoya yazılacağı bu tercihe bağlı (js/bulut.js authStorage) — istekten ÖNCE kaydedilir.
    lsSet("vitatakip_remember_me", remember ? "true" : "false");
    setBusy(true);
    var res;
    try {
      res = mode === "register"
        ? await VitaCloud.signUp({ kind: kind, username: identifier, email: identifier, fullName: fullName, password: password,
            accountType: acct, consentAt: acct === "patient" ? new Date().toISOString() : null, doctorPledgeAt: acct === "doctor" ? new Date().toISOString() : null })
        : await VitaCloud.signIn(identifier, password);
    } finally { setBusy(false); }
    if (!res || !res.ok) { setMessage((res && res.error) || "İşlem tamamlanamadı.", true, true); return false; }
    if (!res.session) { setMessage("Hesap oluşturuldu ancak oturum açılamadı. Lütfen Giriş Yap sekmesinden giriş yapın.", false); setMode("login"); return false; }
    if (pwInput) pwInput.value = "";
    if ($("cloudInputPasswordConfirm")) $("cloudInputPasswordConfirm").value = "";
    lsSet(PANEL_KEY, "cloud");
    enterSession(res.user, { isNew: mode === "register", remember: remember, doctor: mode === "register" && acct === "doctor" });
    return false;
  }

  /* Bulut kullanıcısıyla uygulama oturumunu başlatır (yerel giriş akışıyla aynı adımlar). */
  function enterSession(user, opts) {
    opts = opts || {};
    var uid = user && user.id;
    if (!VitaCloud.isCloudUserId(uid)) return;
    var meta = (user && user.user_metadata) || {};
    var fullName = String(meta.full_name || "").trim() || "Kullanıcı";
    if (typeof resetApplicationDOMAndState === "function") resetApplicationDOMAndState();
    activeUserId = uid;
    safeSessionStorageSetItem("vitatakip_active_session_id", uid);
    if (opts.remember) safeLocalStorageSetItem("vitatakip_active_session_id", uid);
    else safeLocalStorageRemoveItem("vitatakip_active_session_id");
    // Hızlı Giriş kartı yalnız yerel hesaplar içindir; bulut girişinde temizlenir.
    lsDel("vitatakip_remembered_user_id"); lsDel("vitatakip_remembered_fullname");

    if (opts.isNew) {
      safeLocalStorageSetItem("vitatakip_lastActiveDate_" + uid, new Date().toLocaleDateString("tr-TR"));
      state.user = Object.assign({}, defaultUserProfile, { name: fullName });
      try { saveState(); } catch (e) { console.warn("İlk profil durumu kaydedilemedi.", e); }
      closeAuthModal();
      // Doktor hesabında hastaya özgü profil adımı (yaş, kilo…) açılmaz
      if (!opts.doctor && typeof openProfileModal === "function") openProfileModal(false);
      try { renderAllAppViews(); } catch (e) { console.error(e); }
      if (!opts.doctor) showToast("Bulut Hesabı Oluşturuldu", "Hesabınız hazır. Şimdi profil bilgilerinizi tamamlayın.", "success");
    } else {
      loadUserSessionData(uid);
      if (!state.user || !String(state.user.name || "").trim() || state.user.name === "Kullanıcı") {
        state.user = Object.assign({}, defaultUserProfile, state.user || {}, { name: fullName });
        try { saveState(); } catch (_) {}
      }
      closeAuthModal();
      try { renderAllAppViews(); } catch (e) { console.error(e); }
      showToast("Giriş Yapıldı", "Tekrar hoş geldiniz, " + (state.user && state.user.name ? state.user.name : fullName) + "!", "success");
      if (typeof startVitaSpotlightIfFirstVisit === "function") startVitaSpotlightIfFirstVisit();
    }
    if (typeof window.triggerVitaInstallToastOnce === "function") window.triggerVitaInstallToastOnce(uid);
    // Hesap türü / doktor kodu / onay durumu sunucudan okunur ve saklanır (doktor paneli bunu kullanır)
    refreshProfile(uid, opts.doctor);
    document.dispatchEvent(new CustomEvent("vita:cloud-session", { detail: { userId: uid, isNew: Boolean(opts.isNew) } }));
  }

  async function refreshProfile(uid, announceDoctor) {
    if (!window.VitaCloud || !VitaCloud.myProfile) return null;
    var p = await VitaCloud.myProfile(uid);
    if (activeUserId !== uid || !p) return p;
    document.dispatchEvent(new CustomEvent("vita:cloud-profile", { detail: { userId: uid, profile: p } }));
    if (announceDoctor && p.account_type === "doctor") {
      showToast("Doktor Hesabı Oluşturuldu", "Doktor kodunuz: " + (p.doctor_code || "—") + ". Hesabınız onay bekliyor; onaydan sonra hastalar bu kodla size erişim izni verebilir.", "success");
    }
    return p;
  }

  /* Açılışta kayıtlı oturumla girilen bulut kullanıcısı: internet varsa oturumun sunucuda hâlâ geçerli olduğu
     arka planda doğrulanır. Oturum iptal edilmişse (başka cihazdan çıkış, şifre değişimi) güvenli çıkış yapılır.
     Ağ hatası oturumu kapatmaz (çevrimdışı çalışma korunur). */
  async function verifySessionInBackground(uid) {
    if (!window.VitaCloud || !VitaCloud.isCloudUserId(uid) || !navigator.onLine) return;
    try {
      var c = await VitaCloud.getClient();
      var res = await c.auth.getUser();
      if (activeUserId !== uid) return;
      var err = res && res.error;
      if (!err && res.data && res.data.user && res.data.user.id === uid) { refreshProfile(uid, false); return; }
      var status = err && (err.status || 0);
      var code = String((err && err.code) || "");
      var revoked = (status === 401 || status === 403) || /session_not_found|refresh_token_not_found|user_not_found|bad_jwt/.test(code) || (!err && !(res.data && res.data.user));
      if (!revoked) return;
      forceLogout("Oturumunuz sona erdi veya başka bir yerden kapatıldı. Lütfen tekrar giriş yapın. Bu cihazdaki verileriniz silinmedi.");
    } catch (_) { /* ağ hatası: oturum açık kalır */ }
  }
  function forceLogout(message) {
    try { VitaCloud.signOut(); } catch (_) {}
    safeLocalStorageRemoveItem("vitatakip_active_session_id");
    safeSessionStorageRemoveItem("vitatakip_active_session_id");
    activeUserId = null;
    if (window.VitaSync) window.VitaSync.updateStatus();
    resetApplicationDOMAndState();
    openAuthModal();
    showCloud(); setMode("login");
    if (message) setMessage(message, true);
  }

  /* Çıkış (handleLogout çağırır): bulut oturumu bu cihazda kapatılır. */
  function onLogout(wasCloud) {
    if (wasCloud && window.VitaCloud) { try { VitaCloud.signOut(); } catch (_) {} lsSet(PANEL_KEY, "cloud"); }
    if (window.VitaSync) window.VitaSync.updateStatus(); // eşitleme göstergesi gizlenir
  }

  /* ---------------- Olaylar ---------------- */
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var m = t.closest("[data-cloud-mode]"); if (m) { if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {} setMode(m.getAttribute("data-cloud-mode")); return; }
    var k = t.closest("[data-cloud-kind]"); if (k) { setKind(k.getAttribute("data-cloud-kind")); setMessage(""); return; }
    if (t.closest("#cloudForgotBtn")) {
      setMessage("Şifre sıfırlama yakında eklenecek: e-postayla açılan hesaplarda sıfırlama bağlantısı e-postanıza gönderilecek, takma ad hesapları için kurtarma kodları gelecek. Şimdilik şifrenizi hatırlayamıyorsanız yeni bir hesap açabilirsiniz.", false);
      return;
    }
    var a = t.closest("[data-cloud-acct]"); if (a) { setAcct(a.getAttribute("data-cloud-acct")); setMessage(""); return; }
    if (t.closest("#authShowLocalBtn")) { showLocal(); return; }
    if (t.closest("#authShowCloudBtn")) { showCloud(); }
  });
  document.addEventListener("submit", function (e) { if (e.target && e.target.id === "cloudAuthForm") submit(e); });
  document.addEventListener("input", function (e) { if (e.target && e.target.id === "cloudInputIdentifier") syncKindFromInput(); });
  window.addEventListener("online", updateOfflineNotice);
  window.addEventListener("offline", updateOfflineNotice);

  window.VitaAuthUI = {
    onOpen: onOpen, showCloud: showCloud, showLocal: showLocal, setMode: setMode, setKind: setKind, setAcct: setAcct, refreshProfile: refreshProfile,
    submit: submit, enterSession: enterSession, verifySessionInBackground: verifySessionInBackground,
    onLogout: onLogout, forceLogout: forceLogout, currentPanel: currentPanel
  };
})();
