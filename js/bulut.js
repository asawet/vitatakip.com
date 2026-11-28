/* VitaTakip — bulut bağlantısı (Supabase). Adım 1: altyapı (arayüz Adım 2'de, eşitleme Adım 3'te).
   - Kütüphane (vendor/supabase/supabase.js, @supabase/supabase-js 2.119.0 UMD) yalnız bulut kullanılınca yüklenir;
     yerel hesap kullananların açılışı değişmez. Servis çalışanı önbelleğinde olduğu için çevrimdışı da yüklenir.
   - Yalnız HERKESE AÇIK (publishable) anahtar burada. Verileri RLS korur: herkes yalnız kendi satırlarını görür
     (supabase/migrations/). Gizli (service_role/secret) anahtar tarayıcıya ASLA konmaz.
   - Oturum: "Beni hatırla" açıksa localStorage, kapalıysa yalnız bu sekme (sessionStorage) — yerel hesaplarla aynı kural.
   - Takma adla kayıt: kullanıcı e-posta görmez; arka planda "<takmaad>@hesap.vitatakip.com.tr" kullanılır.
     Bu alt alan adına posta yönlendirmesi AÇILMAMALI (açılırsa başkası bu hesapların postasını alabilir). */
(function () {
  "use strict";

  var CONFIG = Object.freeze({
    url: "https://lwcdtfwtecomsvucmipp.supabase.co",
    publishableKey: "sb_publishable_uEuZcSl_XxSXxhy3rHSvmQ_LvrX4lMo",
    usernameDomain: "hesap.vitatakip.com.tr",
    libraryUrl: "./vendor/supabase/supabase.js",
    sessionStorageKey: "vitatakip-bulut-oturum"
  });
  var USERNAME_RE = /^[a-z0-9_]{3,20}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var MIN_PASSWORD = 8;

  var client = null;
  var clientPromise = null;
  var testClient = null; // testler gerçek projeye bağlanmasın diye sahte istemci (setClientForTests)

  function rememberMe() {
    try {
      var v = typeof safeLocalStorageGetItem === "function" ? safeLocalStorageGetItem("vitatakip_remember_me") : localStorage.getItem("vitatakip_remember_me");
      return v === "true";
    } catch (_) { return false; }
  }

  /* Oturum belirteci deposu: "Beni hatırla"ya göre kalıcı ya da yalnız bu sekme. Her yazımda diğer depodaki kopya silinir. */
  var authStorage = {
    getItem: function (k) {
      try { var s = sessionStorage.getItem(k); if (s !== null) return s; } catch (_) {}
      try { return localStorage.getItem(k); } catch (_) { return null; }
    },
    setItem: function (k, v) {
      try {
        if (rememberMe()) { localStorage.setItem(k, v); sessionStorage.removeItem(k); }
        else { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
      } catch (_) {}
    },
    removeItem: function (k) {
      try { localStorage.removeItem(k); } catch (_) {}
      try { sessionStorage.removeItem(k); } catch (_) {}
    }
  };

  function loadLibrary() {
    if (window.supabase && typeof window.supabase.createClient === "function") return Promise.resolve(window.supabase);
    if (typeof loadVitaOptionalScript === "function") return loadVitaOptionalScript(CONFIG.libraryUrl, "supabase", 15000);
    return Promise.reject(new Error("Kütüphane yükleyici bulunamadı"));
  }

  /* Supabase istemcisi (tek örnek). İlk çağrıda kütüphane yüklenir. */
  function getClient() {
    if (testClient) return Promise.resolve(testClient);
    if (client) return Promise.resolve(client);
    if (!clientPromise) {
      clientPromise = loadLibrary().then(function (lib) {
        client = lib.createClient(CONFIG.url, CONFIG.publishableKey, {
          auth: { storage: authStorage, storageKey: CONFIG.sessionStorageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
        });
        return client;
      }).catch(function (e) { clientPromise = null; throw e; });
    }
    return clientPromise;
  }

  function normalizeUsername(u) { return String(u == null ? "" : u).trim().toLocaleLowerCase("tr-TR"); }
  function isValidUsername(u) { return USERNAME_RE.test(normalizeUsername(u)); }
  function usernameToEmail(u) {
    var n = normalizeUsername(u);
    if (!USERNAME_RE.test(n)) throw new Error("Geçersiz takma ad");
    return n + "@" + CONFIG.usernameDomain;
  }
  /* Giriş kutusu: "@" içeriyorsa e-posta, değilse takma ad. */
  function identifierToEmail(input) {
    var s = String(input == null ? "" : input).trim();
    if (s.indexOf("@") !== -1) {
      var e = s.toLowerCase();
      if (!EMAIL_RE.test(e)) throw new Error("Geçersiz e-posta");
      return e;
    }
    return usernameToEmail(s);
  }
  function isUsernameAccount(email) { return /@hesap\.vitatakip\.com\.tr$/i.test(String(email || "")); }

  /* Supabase hata kodlarını kullanıcıya gösterilecek Türkçe iletiye çevirir. */
  function describeError(err) {
    var code = String((err && (err.code || err.error_code)) || "");
    var msg = String((err && err.message) || "");
    if (!navigator.onLine || /Failed to fetch|NetworkError|Load failed|did not initialize|could not be loaded|timed out/i.test(msg)) {
      return { code: "network", message: "Buluta ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin." };
    }
    if (code === "invalid_credentials" || /Invalid login credentials/i.test(msg)) return { code: "invalid_credentials", message: "Takma ad / e-posta veya şifre hatalı." };
    if (code === "user_already_exists" || code === "email_exists" || /already registered|already exists/i.test(msg)) return { code: "user_already_exists", message: "Bu takma ad veya e-posta ile kayıtlı bir hesap zaten var. Giriş yapmayı deneyin." };
    if (code === "weak_password" || /Password should be/i.test(msg)) return { code: "weak_password", message: "Şifre çok zayıf. En az " + MIN_PASSWORD + " karakter, harf ve rakam kullanın." };
    if (code === "email_address_invalid" || /invalid/i.test(msg) && /email/i.test(msg)) return { code: "email_address_invalid", message: "Bu e-posta adresi kabul edilmedi. Farklı bir adres deneyin." };
    if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || /rate limit/i.test(msg)) return { code: "rate_limit", message: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin." };
    if (code === "email_not_confirmed") return { code: code, message: "E-posta adresiniz henüz doğrulanmamış." };
    if (code === "signup_disabled") return { code: code, message: "Yeni hesap açma şu an kapalı." };
    if (code === "email_provider_disabled") return { code: code, message: "Bulut hesabıyla giriş şu an kapalı. Lütfen daha sonra tekrar deneyin veya bu cihazda yerel hesap kullanın." };
    return { code: code || "unknown", message: "İşlem tamamlanamadı. Lütfen tekrar deneyin." };
  }
  function fail(err) { var d = describeError(err); return { ok: false, error: d.message, code: d.code }; }

  /* Kayıt. kind: "username" | "email". Profil satırı veritabanı tetikleyicisiyle oluşur (full_name, username). */
  async function signUp(opts) {
    opts = opts || {};
    var fullName = String(opts.fullName || "").trim().replace(/\s+/g, " ");
    var password = String(opts.password || "");
    if (fullName.length < 2) return { ok: false, code: "full_name", error: "Lütfen adınızı en az 2 karakterle girin." };
    if (password.length < MIN_PASSWORD) return { ok: false, code: "weak_password", error: "Şifre en az " + MIN_PASSWORD + " karakter olmalıdır." };
    var email, username = null;
    try {
      if (opts.kind === "username") { username = normalizeUsername(opts.username); email = usernameToEmail(username); }
      else email = identifierToEmail(opts.email);
    } catch (e) {
      return { ok: false, code: "identifier", error: opts.kind === "username" ? "Takma ad 3-20 karakter olmalı; yalnız küçük harf, rakam ve alt çizgi (_) kullanın." : "Geçerli bir e-posta adresi girin." };
    }
    try {
      var c = await getClient();
      // consent_at: KVKK açık rıza zamanı (kayıt ekranındaki onay kutusu); kullanıcı meta verisinde saklanır.
      var meta = { full_name: fullName, username: username };
      if (opts.consentAt) meta.consent_at = String(opts.consentAt);
      var res = await c.auth.signUp({ email: email, password: password, options: { data: meta } });
      if (res.error) return fail(res.error);
      // Supabase, var olan bir e-postayla tekrar kayıtta (onay kapalıyken) kimlikleri boş kullanıcı döndürebilir.
      if (res.data && res.data.user && Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0) {
        return { ok: false, code: "user_already_exists", error: describeError({ code: "user_already_exists" }).message };
      }
      return { ok: true, user: res.data.user, session: res.data.session, needsConfirmation: !res.data.session };
    } catch (e) { return fail(e); }
  }

  async function signIn(identifier, password) {
    var email;
    try { email = identifierToEmail(identifier); }
    catch (e) { return { ok: false, code: "identifier", error: "Takma adınızı veya e-posta adresinizi kontrol edin." }; }
    try {
      var c = await getClient();
      var res = await c.auth.signInWithPassword({ email: email, password: String(password || "") });
      if (res.error) return fail(res.error);
      return { ok: true, user: res.data.user, session: res.data.session };
    } catch (e) { return fail(e); }
  }

  async function signOut() {
    try {
      var c = await getClient();
      // scope "local": yalnız bu cihazdaki oturum kapanır (diğer cihazlar açık kalır); çevrimdışıyken de yerel belirteç silinir.
      var res = await c.auth.signOut({ scope: "local" });
      if (res && res.error) return fail(res.error);
      return { ok: true };
    } catch (e) {
      authStorage.removeItem(CONFIG.sessionStorageKey);
      return fail(e);
    }
  }

  /* Bulut hesabını TAMAMEN siler (giriş kaydı + profil + buluttaki tüm veriler, cascade). Yönetici yetkisi gerektiği için
     sunucudaki "hesap-sil" Edge Function'ı çağrılır (supabase/functions/hesap-sil); fonksiyon yalnız oturum sahibini siler. */
  async function deleteAccount() {
    try {
      var c = await getClient();
      var res = await c.functions.invoke("hesap-sil", { method: "POST" });
      if (res.error) return fail(res.error);
      if (!res.data || res.data.ok !== true) return { ok: false, code: "delete_failed", error: "Hesap silinemedi. Lütfen tekrar deneyin." };
      authStorage.removeItem(CONFIG.sessionStorageKey); // sunucuda oturum artık yok; yerel belirteç de silinir
      return { ok: true };
    } catch (e) { return fail(e); }
  }

  /* Kayıtlı oturum (ağ isteği yapmadan; çevrimdışıyken de çalışır). Yoksa null. */
  async function getSession() {
    try {
      var c = await getClient();
      var res = await c.auth.getSession();
      return (res && res.data && res.data.session) || null;
    } catch (_) { return null; }
  }
  /* Cihazda kayıtlı bir bulut oturumu var mı? (kütüphaneyi yüklemeden hızlı kontrol) */
  function hasStoredSession() { return authStorage.getItem(CONFIG.sessionStorageKey) !== null; }
  /* Kayıtlı oturumdaki kullanıcı kimliği — kütüphane yüklenmeden, ağ isteği olmadan (çevrimdışı açılış için). */
  function storedUserId() {
    try {
      var raw = authStorage.getItem(CONFIG.sessionStorageKey);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      var id = obj && obj.user && obj.user.id;
      return isCloudUserId(id) ? id : null;
    } catch (_) { return null; }
  }
  /* Bulut hesabı kimliği Supabase uuid'idir; yerel hesaplar "usr_..." biçimindedir. */
  function isCloudUserId(id) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || "")); }

  window.VitaCloud = {
    config: CONFIG,
    getClient: getClient,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    deleteAccount: deleteAccount,
    getSession: getSession,
    hasStoredSession: hasStoredSession,
    storedUserId: storedUserId,
    isCloudUserId: isCloudUserId,
    authStorage: authStorage,
    normalizeUsername: normalizeUsername,
    isValidUsername: isValidUsername,
    usernameToEmail: usernameToEmail,
    identifierToEmail: identifierToEmail,
    isUsernameAccount: isUsernameAccount,
    describeError: describeError,
    MIN_PASSWORD: MIN_PASSWORD,
    // Testler için: gerçek projeye bağlanmadan sahte istemci (null verilirse gerçek istemciye döner)
    setClientForTests: function (fake) { testClient = fake || null; }
  };
})();
