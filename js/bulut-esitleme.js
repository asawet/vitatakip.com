/* VitaTakip — bulut eşitleme (Adım 3). Yalnız BULUT hesabıyla açık oturumda çalışır; yerel hesaplara dokunmaz.

   Yazma yolu (çevrimdışı önce):
     Uygulama her zaman önce cihaza yazar (safeLocalStorageSetItem). Bu modül o fonksiyonu SARAR: yazma aynen olur,
     ardından anahtar "vitatakip_<tür>_<aktif uuid>" ve <tür> eşitlenen türlerdense kuyruğa not düşülür.
     Kuyruk değeri tutmaz, yalnız "bu tür değişti" der; gönderimde güncel değer cihazdan okunur (aynı tür iki kez gitmez).
     saveState() her seferinde TÜM türleri yazar: son eşitlenen içeriğin özeti (hash) tutulur, değişmeyen tür kuyruğa girmez.

   Okuma yolu:
     Girişte / sekmeye dönünce / internet gelince buluttaki satırlar çekilir. Bulut satırı bu cihazın son eşitlediğinden
     yeniyse ve cihazda bekleyen değişiklik yoksa cihaza yazılır, uygulama verisi yeniden yüklenir.
     Çakışma (iki tarafta da değişiklik): tür bazında en son değiştiren kazanır.

   VERİ KAYBI KORUMASI: bir cihazda bu hesap için İLK çekme tamamlanmadan hiçbir şey gönderilmez ve ilk çekmede
   bulutta olan tür her zaman kazanır. (Yeni cihazda girişte uygulama boş varsayılanları yazar; bunlar buluttaki
   gerçek verinin üstüne yazılmamalı.)

   Gönderilmeyenler: profil fotoğrafı, PDF/IndexedDB kayıtları, taslaklar, önbellekler, bildirim günlükleri (STORES dışındaki her şey).
   Bulut biçimi: user_stores(user_id, store, data) — data = {"v": <JSON değeri>} ya da düz metin için {"t": "<metin>"}. */
(function () {
  "use strict";

  // Eşitlenen veri türleri (localStorage anahtarı "vitatakip_<tür>_<uuid>"). Sıra: gönderim/uygulama sırası.
  var STORES = ["user", "supplements", "medications", "med_taken", "hydration", "labs", "labreferences", "labhistory",
    "symptoms", "resolved_symptoms", "reviews", "notes", "recheck"];
  // Profil fotoğrafı (vitatakip_avatar_) bilerek YOK: yüz fotoğrafı yalnız bu cihazda kalır (Ayarlar'daki not bunu söyler).
  var STORE_SET = {}; STORES.forEach(function (s) { STORE_SET[s] = true; });
  var KEY_RE = /^vitatakip_([a-z_]+)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  var DEBOUNCE_MS = 1500;
  var PULL_MIN_INTERVAL_MS = 30000;

  var originalSet = null, originalRemove = null;
  var applyingRemote = false;
  var forgotten = {}; // silinen bulut hesapları: kuyruğa alma/gönderme yapılmaz
  var flushTimer = null, retryTimer = null, retryDelay = 5000;
  var flushing = false, pulling = false;
  var lastPullAt = 0;
  var status = { state: "idle", pending: 0, lastSyncAt: 0, error: "" };

  function cloud() { return window.VitaCloud; }
  function activeCloudUid() {
    var id = typeof activeUserId !== "undefined" ? activeUserId : null;
    return cloud() && cloud().isCloudUserId(id) ? id : null;
  }
  function rawGet(k) { try { return typeof safeLocalStorageGetItem === "function" ? safeLocalStorageGetItem(k) : localStorage.getItem(k); } catch (_) { return null; } }
  function rawSet(k, v) { applyingRemote = true; try { (originalSet || window.safeLocalStorageSetItem)(k, v); } finally { applyingRemote = false; } }
  function rawRemove(k) { applyingRemote = true; try { (originalRemove || window.safeLocalStorageRemoveItem)(k); } finally { applyingRemote = false; } }

  /* FNV-1a 32 bit + uzunluk: içerik değişti mi? (kriptografik değil, yalnız karşılaştırma için) */
  function hash(str) {
    if (str === null || str === undefined) return "null";
    var s = String(str), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return s.length + ":" + h.toString(16);
  }

  /* Cihaz başına, hesap başına eşitleme kaydı */
  function metaKey(uid) { return "vitatakip_bulut_meta_" + uid; }
  function queueKey(uid) { return "vitatakip_bulut_kuyruk_" + uid; }
  function readJSON(k, fb) { try { var v = JSON.parse(rawGet(k) || "null"); return v && typeof v === "object" ? v : fb; } catch (_) { return fb; } }
  function readMeta(uid) { var m = readJSON(metaKey(uid), {}); m.hash = m.hash || {}; m.syncedAt = m.syncedAt || {}; return m; }
  function writeMeta(uid, m) { rawSet(metaKey(uid), JSON.stringify(m)); }
  function readQueue(uid) { return readJSON(queueKey(uid), {}); }
  function writeQueue(uid, q) { rawSet(queueKey(uid), JSON.stringify(q)); updateStatus(); }

  function storeKey(store, uid) { return "vitatakip_" + store + "_" + uid; }
  function encode(raw) {
    if (raw === null || raw === undefined) return null;
    try { return { v: JSON.parse(raw) }; } catch (_) { return { t: String(raw) }; }
  }
  function decode(data) {
    if (!data || typeof data !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(data, "t")) return String(data.t);
    if (Object.prototype.hasOwnProperty.call(data, "v")) return JSON.stringify(data.v);
    return null;
  }
  function ms(iso) { var t = Date.parse(iso || ""); return isNaN(t) ? 0 : t; }

  /* ---------------- Yazma yolu: kuyruğa not ---------------- */
  function noteChange(key, removed) {
    if (applyingRemote) return;
    var m = KEY_RE.exec(String(key));
    if (!m || !STORE_SET[m[1]]) return;
    var uid = activeCloudUid();
    if (!uid || m[2].toLowerCase() !== uid.toLowerCase() || forgotten[uid]) return;
    var store = m[1];
    var meta = readMeta(uid);
    var h = removed ? "null" : hash(rawGet(key));
    var q = readQueue(uid);
    if (meta.hash[store] === h) {
      // Son eşitlenenle aynı içerik: bekleyen kayıt varsa düşür (ör. değişiklik geri alındı)
      if (q[store]) { delete q[store]; writeQueue(uid, q); }
      return;
    }
    q[store] = { op: removed ? "del" : "set", at: Date.now() };
    writeQueue(uid, q);
    scheduleFlush();
  }

  function install() {
    if (originalSet || typeof window.safeLocalStorageSetItem !== "function") return;
    originalSet = window.safeLocalStorageSetItem;
    originalRemove = window.safeLocalStorageRemoveItem;
    window.safeLocalStorageSetItem = function (key, value) {
      var r = originalSet.apply(this, arguments);
      try { noteChange(key, false); } catch (e) { console.warn("Bulut kuyruğu güncellenemedi:", e); }
      return r;
    };
    window.safeLocalStorageRemoveItem = function (key) {
      var r = originalRemove.apply(this, arguments);
      try { noteChange(key, true); } catch (e) { console.warn("Bulut kuyruğu güncellenemedi:", e); }
      return r;
    };
  }

  /* ---------------- Gönderim ---------------- */
  function scheduleFlush(delay) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(function () { flush(); }, delay === undefined ? DEBOUNCE_MS : delay);
  }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { flush(); }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 5 * 60 * 1000);
  }

  async function flush() {
    var uid = activeCloudUid();
    if (!uid || flushing || forgotten[uid]) return { ok: false, skipped: true };
    var meta = readMeta(uid);
    if (!meta.initialPullDone) { pull({ force: true }); return { ok: false, skipped: true }; } // VERİ KAYBI KORUMASI
    var q = readQueue(uid);
    var stores = Object.keys(q).filter(function (s) { return STORE_SET[s]; });
    if (!stores.length) { updateStatus(); return { ok: true, sent: 0 }; }
    if (!navigator.onLine) { updateStatus(); return { ok: false, offline: true }; }
    flushing = true; setState("syncing");
    try {
      var c = await cloud().getClient();
      var snapshot = {}, rows = [], dels = [];
      stores.forEach(function (s) {
        var raw = rawGet(storeKey(s, uid));
        snapshot[s] = { at: q[s].at, h: raw === null ? "null" : hash(raw) };
        if (q[s].op === "del" || raw === null) dels.push(s);
        else rows.push({ user_id: uid, store: s, data: encode(raw) });
      });
      var stamps = {};
      if (rows.length) {
        var up = await c.from("user_stores").upsert(rows, { onConflict: "user_id,store" }).select("store, updated_at");
        if (up.error) throw up.error;
        (up.data || []).forEach(function (r) { stamps[r.store] = r.updated_at; });
      }
      if (dels.length) {
        var del = await c.from("user_stores").delete().eq("user_id", uid).in("store", dels);
        if (del.error) throw del.error;
      }
      if (activeCloudUid() !== uid) return { ok: false, skipped: true };
      // Gönderim sırasında yeniden değişen tür kuyrukta kalır (daha yeni "at")
      meta = readMeta(uid); q = readQueue(uid);
      stores.forEach(function (s) {
        meta.hash[s] = snapshot[s].h;
        meta.syncedAt[s] = stamps[s] || new Date().toISOString();
        if (q[s] && q[s].at <= snapshot[s].at) delete q[s];
      });
      writeMeta(uid, meta); writeQueue(uid, q);
      retryDelay = 5000; clearTimeout(retryTimer);
      status.lastSyncAt = Date.now(); status.error = "";
      setState(Object.keys(q).length ? "pending" : "synced");
      if (Object.keys(q).length) scheduleFlush();
      return { ok: true, sent: stores.length };
    } catch (e) {
      var d = cloud().describeError(e);
      status.error = d.code === "network" ? "" : d.message;
      setState(d.code === "network" ? "offline" : "error");
      if (/check constraint|user_stores_data_size/i.test(String(e && e.message))) status.error = "Bir kayıt bulut sınırını (2 MB) aşıyor; bu cihazda saklanmaya devam ediyor.";
      scheduleRetry();
      return { ok: false, error: d.message };
    } finally { flushing = false; }
  }

  /* ---------------- Çekme ---------------- */
  async function pull(opts) {
    opts = opts || {};
    var uid = activeCloudUid();
    if (!uid || pulling || forgotten[uid]) return { ok: false, skipped: true };
    if (!opts.force && Date.now() - lastPullAt < PULL_MIN_INTERVAL_MS) return { ok: true, skipped: true };
    if (!navigator.onLine) { setState("offline"); return { ok: false, offline: true }; }
    pulling = true; setState("syncing");
    try {
      var c = await cloud().getClient();
      var res = await c.from("user_stores").select("store, data, updated_at").eq("user_id", uid);
      if (res.error) throw res.error;
      if (activeCloudUid() !== uid) return { ok: false, skipped: true };
      lastPullAt = Date.now();
      var meta = readMeta(uid), q = readQueue(uid);
      var first = !meta.initialPullDone;
      var applied = [], remoteStores = {};
      (res.data || []).forEach(function (row) {
        if (!row || !STORE_SET[row.store]) return;
        remoteStores[row.store] = true;
        var s = row.store;
        var remoteNewer = ms(row.updated_at) > ms(meta.syncedAt[s]);
        var pending = q[s];
        var useRemote;
        if (first) useRemote = true;                               // ilk çekme: bulut kazanır
        else if (!remoteNewer) useRemote = false;                  // bulutta yeni bir şey yok
        else if (!pending) useRemote = true;                       // yalnız bulutta değişmiş
        else useRemote = ms(row.updated_at) > pending.at;          // iki tarafta değişmiş: en son değiştiren kazanır
        if (useRemote) {
          var raw = decode(row.data);
          var key = storeKey(s, uid);
          var cur = rawGet(key);
          if (raw !== null && raw !== cur) { rawSet(key, raw); applied.push(s); }
          meta.hash[s] = raw === null ? "null" : hash(raw);
          meta.syncedAt[s] = row.updated_at;
          delete q[s];
        }
      });
      if (first) {
        // Bulutta olmayan, cihazda dolu türler gönderilir (yeni hesap ya da bu cihazda hazırlanmış veri)
        STORES.forEach(function (s) {
          if (remoteStores[s]) return;
          var raw = rawGet(storeKey(s, uid));
          if (raw !== null && !q[s]) q[s] = { op: "set", at: Date.now() };
        });
        meta.initialPullDone = new Date().toISOString();
      }
      writeMeta(uid, meta); writeQueue(uid, q);
      if (applied.length) reloadAppData(uid, applied, first);
      status.lastSyncAt = Date.now(); status.error = "";
      setState(Object.keys(q).length ? "pending" : "synced");
      if (Object.keys(q).length) scheduleFlush(300);
      // Çekme tamamlandı: yerel hesaptan taşıma (js/bulut-tasima.js) ancak bundan SONRA yapılabilir
      document.dispatchEvent(new CustomEvent("vita:cloud-pulled", { detail: { userId: uid, first: first, applied: applied } }));
      return { ok: true, applied: applied };
    } catch (e) {
      var d = cloud().describeError(e);
      status.error = d.code === "network" ? "" : d.message;
      setState(d.code === "network" ? "offline" : "error");
      return { ok: false, error: d.message };
    } finally { pulling = false; }
  }

  /* Buluttan gelen veriyle uygulamayı yeniden yükler. IndexedDB yedeği daha eski kalmalı: zaman damgası ilerletilir. */
  function reloadAppData(uid, applied, first, silent) {
    if (activeCloudUid() !== uid) return;
    try {
      if (typeof nextVitaExtendedStamp === "function") rawSet("vitatakip_extended_updated_" + uid, String(nextVitaExtendedStamp(uid)));
      rawSet("vitatakip_local_save_complete_" + uid, "true");
      var tab = state && state.activeTab;
      loadUserSessionData(uid);
      if (typeof renderAllAppViews === "function") renderAllAppViews();
      if (tab && typeof navigateToView === "function") { try { navigateToView(tab); } catch (_) {} }
      if (!silent && typeof showToast === "function") {
        showToast(first ? "Bulut verileriniz yüklendi" : "Başka cihazdaki değişiklikler alındı",
          first ? "Hesabınızdaki kayıtlar bu cihaza getirildi." : "Kayıtlarınız buluttaki en güncel hâle getirildi.", "info");
      }
    } catch (e) { console.error("Bulut verisi uygulanırken hata:", e); }
    document.dispatchEvent(new CustomEvent("vita:cloud-applied", { detail: { userId: uid, stores: applied } }));
  }

  /* ---------------- Durum göstergesi ---------------- */
  function setState(s) { status.state = s; updateStatus(); }
  function pendingCount(uid) { uid = uid || activeCloudUid(); return uid ? Object.keys(readQueue(uid)).length : 0; }
  function relTime(t) {
    if (!t) return "";
    var d = Math.round((Date.now() - t) / 60000);
    return d < 1 ? "az önce" : d < 60 ? d + " dk önce" : Math.round(d / 60) + " sa önce";
  }
  function statusText() {
    var uid = activeCloudUid(); if (!uid) return null;
    var n = pendingCount(uid);
    if (!navigator.onLine) return { tone: "offline", icon: "fa-cloud", text: n ? "Çevrimdışı · " + n + " değişiklik bekliyor" : "Çevrimdışı · bu cihazda kaydediliyor" };
    if (status.state === "syncing") return { tone: "busy", icon: "fa-arrows-rotate", text: "Eşitleniyor…" };
    if (status.state === "error") return { tone: "error", icon: "fa-triangle-exclamation", text: status.error || "Eşitleme hatası · yeniden denenecek" };
    if (n) return { tone: "busy", icon: "fa-cloud", text: n + " değişiklik gönderilecek" };
    return { tone: "ok", icon: "fa-cloud", text: status.lastSyncAt ? "Bulutla eşitlendi · " + relTime(status.lastSyncAt) : "Bulut hesabı" };
  }
  function updateStatus() {
    if (window.VitaAIProxy) window.VitaAIProxy.updateNotice(); // Ayarlar > Yapay zekâ: proxy açıklaması (oturuma bağlı)
    if (window.VitaDoctors) window.VitaDoctors.updateVisibility(); // Rapor > Doktorum (oturuma bağlı)
    if (window.VitaDoctorPanel) window.VitaDoctorPanel.updateChrome(); // yan menü "Doktor Paneli" (yalnız doktor)
    if (window.VitaAdmin) window.VitaAdmin.updateChrome(); // yan menü "Yönetici Paneli" (yalnız yönetici)
    status.pending = pendingCount();
    var info = statusText();
    // Ayarlar > hesap silme açıklaması hesap türüne göre (bulutta giriş kaydı ve buluttaki kayıtlar da silinir)
    var del = document.getElementById("settingsDeleteAccountDesc");
    if (del) del.textContent = activeCloudUid()
      ? "Bulut hesabınızı tamamen siler: giriş bilgileri, buluttaki tüm kayıtlar ve bu tarayıcıdaki kopyalar. İnternet gerekir."
      : "Bu tarayıcıdaki aktif kullanıcıya ait tüm sağlık, tahlil ve protokol verilerini sıfırlar.";
    Array.prototype.forEach.call(document.querySelectorAll("[data-cloud-sync-status]"), function (el) {
      el.classList.toggle("hidden", !info);
      if (!info) return;
      el.setAttribute("data-tone", info.tone);
      el.innerHTML = '<i class="fa-solid ' + info.icon + '" aria-hidden="true"></i><span></span>';
      el.querySelector("span").textContent = info.text;
      el.title = info.text;
    });
  }

  /* ---------------- Tetikleyiciler ---------------- */
  document.addEventListener("vita:cloud-session", function () { lastPullAt = 0; pull({ force: true }); });
  window.addEventListener("online", function () { updateStatus(); pull({ force: true }).then(function () { flush(); }); });
  window.addEventListener("offline", updateStatus);
  document.addEventListener("visibilitychange", function () {
    if (!activeCloudUid()) return;
    if (document.visibilityState === "hidden") flush();       // sekme kapanmadan bekleyenleri gönder
    else pull();                                                 // sekmeye dönünce (30 sn'de bir) başka cihazdaki değişiklikler
  });
  setInterval(updateStatus, 60000); // "x dk önce" yazısı

  install();
  window.VitaSync = {
    STORES: STORES.slice(),
    flush: flush, pull: pull, pendingCount: pendingCount, status: function () { return Object.assign({}, status, { pending: pendingCount() }); },
    updateStatus: updateStatus,
    // Hesap silinirken: bu hesap için kuyruğa alma/gönderme/çekme durur (yerel temizlik silme isteği üretmesin)
    forget: function (uid) { if (uid) { forgotten[uid] = true; clearTimeout(flushTimer); clearTimeout(retryTimer); } },
    reloadAppData: function (uid, stores) { reloadAppData(uid, stores || [], false, true); },
    isInitialPullDone: function (uid) { uid = uid || activeCloudUid(); return Boolean(uid && readMeta(uid).initialPullDone); },
    // Açılışta kayıtlı oturumla girildiğinde (19-app-startup) çağrılır
    start: function () { if (activeCloudUid()) { updateStatus(); pull({ force: true }); } },
    _hash: hash, _encode: encode, _decode: decode
  };
})();
