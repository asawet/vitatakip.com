/* VitaTakip — yerel hesaptan bulut hesabına veri taşıma (Adım 4).
   Bulut hesabıyla girildiğinde ve buluttan İLK çekme bittiğinde (vita:cloud-pulled), bu cihazda veri içeren bir yerel
   hesap varsa "Bu cihazdaki verilerinizi bulut hesabınıza taşıyalım mı?" sorulur. Ayarlar > Veriler ve yedek'ten de açılır.

   Güvenlik: ortak cihazda başkasının yerel hesabındaki sağlık verisi kendi bulut hesabına aktarılamasın diye
   O YEREL HESABIN ŞİFRESİ istenir (PBKDF2 doğrulaması, verifyVitaPassword).
   Taşıma KOPYALAMADIR: yerel hesap ve verileri bu cihazda olduğu gibi kalır. Tekrar çalışsa da kopya oluşturmaz
   (listeler kimliğe göre birleştirilir).
   Birleştirme (bulutta zaten veri varsa onun üstüne yazılmaz):
     takviye / ilaç / tahlil / kontrol hatırlatması → id'ye göre birleşim (aynı id'de bulut sürümü kalır)
     belirtiler → birleşim; değerlendirmeler, referans aralıkları → anahtar birleşimi (bulut önce gelir)
     profil → bulut profili doluysa bulut, değilse yerel (ad bulut hesabındaki kalır)
     su, alım işaretleri → bulutta varsa bulut, yoksa yerel (profil fotoğrafı buluta gitmez, cihazda kalır)
     doktor notları → ikisi de doluysa alt alta (yerel notlar başlıkla eklenir) */
(function () {
  "use strict";
  var LIST_BY_ID = { supplements: true, medications: true, labhistory: true, recheck: true };
  var UNION = { symptoms: true, resolved_symptoms: true };
  var OBJ_MERGE = { reviews: true, labreferences: true };
  var PREFER_CLOUD = { hydration: true, med_taken: true };
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function cloudUid() { var id = typeof activeUserId !== "undefined" ? activeUserId : null; return window.VitaCloud && VitaCloud.isCloudUserId(id) ? id : null; }
  function get(k) { return typeof safeLocalStorageGetItem === "function" ? safeLocalStorageGetItem(k) : localStorage.getItem(k); }
  function set(k, v) { return safeLocalStorageSetItem(k, v); }
  function parse(raw, fb) { if (raw === null || raw === undefined) return fb; try { var v = JSON.parse(raw); return v === null || v === undefined ? fb : v; } catch (_) { return fb; } }
  function doneKey(localId) { return "vitatakip_bulut_tasindi_" + localId; }
  function skipKey(uid) { return "vitatakip_bulut_tasima_sorma_" + uid; }
  function stores() { return (window.VitaSync && VitaSync.STORES) || ["user", "supplements", "medications", "med_taken", "hydration", "labs", "labreferences", "labhistory", "symptoms", "resolved_symptoms", "reviews", "notes", "recheck"]; }

  function localAccounts() {
    var users = [];
    try { users = (typeof getUsersDb === "function" ? getUsersDb() : []); } catch (_) { users = []; }
    return users.filter(function (u) { return u && /^usr_/.test(String(u.id)) && u.id !== "usr_guest_local"; });
  }
  function counts(localId) {
    var len = function (s) { var v = parse(get("vitatakip_" + s + "_" + localId), []); return Array.isArray(v) ? v.length : 0; };
    return { supplements: len("supplements"), medications: len("medications"), labs: len("labhistory"), symptoms: len("symptoms") };
  }
  function hasData(c) { return c.supplements + c.medications + c.labs + c.symptoms > 0; }
  function summary(c) {
    var parts = [];
    if (c.supplements) parts.push(c.supplements + " takviye");
    if (c.medications) parts.push(c.medications + " ilaç");
    if (c.labs) parts.push(c.labs + " tahlil");
    if (c.symptoms) parts.push(c.symptoms + " belirti");
    return parts.length ? parts.join(", ") : "profil bilgileri";
  }
  /* Bu bulut hesabına henüz taşınmamış, veri içeren yerel hesaplar */
  function candidates(uid) {
    return localAccounts().map(function (u) { return { id: u.id, name: String(u.fullName || "Yerel hesap"), counts: counts(u.id), done: parse(get(doneKey(u.id)), null) }; })
      .filter(function (a) { return hasData(a.counts) && !(a.done && a.done.cloudUid === uid); });
  }

  /* Yerel hesabın verisi: localStorage; IndexedDB anlık görüntüsü daha yeniyse oradan (localStorage kotası dolmuş olabilir) */
  async function readLocal(localId) {
    var out = {};
    stores().forEach(function (s) { out[s] = get("vitatakip_" + s + "_" + localId); });
    try {
      if (window.indexedDB && typeof vitaIndexedDbRequest === "function") {
        var snap = await vitaIndexedDbRequest("extendedData", "readonly", "get", String(localId));
        var localStamp = Number(get("vitatakip_extended_updated_" + localId) || 0) || 0;
        if (snap && Number(snap.updatedAt) >= localStamp && snap.snapshotVersion >= 2) {
          var map = { user: snap.user, supplements: snap.supplements, medications: snap.medications, med_taken: snap.medTaken, hydration: snap.hydration,
            labhistory: snap.labHistory, labs: snap.labValues, labreferences: snap.labReferences, symptoms: snap.selectedSymptoms,
            resolved_symptoms: snap.resolvedSymptoms, reviews: snap.supplementReviews };
          Object.keys(map).forEach(function (s) { if (map[s] !== undefined && map[s] !== null) out[s] = JSON.stringify(map[s]); });
          if (typeof snap.doctorNotes === "string" && snap.doctorNotes) out.notes = snap.doctorNotes;
        }
      }
    } catch (_) { /* IndexedDB okunamadı: localStorage yeterli */ }
    return out;
  }

  function isEmptyJSON(raw) {
    var v = parse(raw, null);
    if (v === null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.keys(v).length === 0;
    return false;
  }
  /* Profil dolu mu? Uygulamanın kuralıyla aynı (isVitaProfileComplete): profileCompleted bayrağı, yoksa varsayılanlardan farklılık.
     Yeni bulut hesabının profili varsayılan değerlerle (28 yaş, 168 cm, 68 kg) başlar; bu "dolu" sayılmamalı. */
  function profileFilled(u) {
    if (!u || typeof u !== "object") return false;
    if (u.profileCompleted === true) return true;
    if (u.profileCompleted === false) return false;
    var d = typeof defaultUserProfile !== "undefined" ? defaultUserProfile : { age: 28, gender: "K", height: 168, weight: 68 };
    return !(Number(u.age) === d.age && u.gender === d.gender && Number(u.height) === d.height && Number(u.weight) === d.weight);
  }

  /* Tek veri türü için bulut (mevcut) + yerel birleşimi. Ham localStorage metni döndürür; değişiklik yoksa null. */
  function mergeStore(s, cloudRaw, localRaw) {
    if (localRaw === null || localRaw === undefined || localRaw === "") return null;
    if (cloudRaw === null || cloudRaw === undefined) return localRaw;
    if (LIST_BY_ID[s]) {
      var c = parse(cloudRaw, []), l = parse(localRaw, []);
      if (!Array.isArray(c) || !Array.isArray(l)) return null;
      var seen = {}; c.forEach(function (x) { if (x && x.id !== undefined) seen[String(x.id)] = true; });
      var add = l.filter(function (x) { return x && (x.id === undefined || !seen[String(x.id)]); });
      if (!add.length) return null;
      var merged = c.concat(add);
      if (s === "labhistory") merged.sort(function (a, b) { return Number(b.timestamp || 0) - Number(a.timestamp || 0); });
      return JSON.stringify(merged);
    }
    if (UNION[s]) {
      var cu = parse(cloudRaw, []), lu = parse(localRaw, []);
      if (!Array.isArray(cu) || !Array.isArray(lu)) return null;
      var u = cu.slice(); lu.forEach(function (x) { if (u.indexOf(x) === -1) u.push(x); });
      return u.length === cu.length ? null : JSON.stringify(u);
    }
    if (OBJ_MERGE[s]) {
      var co = parse(cloudRaw, {}), lo = parse(localRaw, {});
      var res = Object.assign({}, lo, co);
      return Object.keys(res).length === Object.keys(co).length ? null : JSON.stringify(res);
    }
    if (PREFER_CLOUD[s]) return isEmptyJSON(cloudRaw) && cloudRaw !== localRaw ? localRaw : null;
    if (s === "user") {
      var cuser = parse(cloudRaw, null), luser = parse(localRaw, null);
      if (!luser || profileFilled(cuser)) return null;
      return JSON.stringify(Object.assign({}, luser, { name: (cuser && cuser.name) || luser.name }));
    }
    if (s === "labs") return isEmptyJSON(cloudRaw) ? localRaw : null; // en güncel tahlilden yeniden hesaplanır
    if (s === "notes") {
      var cn = String(cloudRaw || "").trim(), ln = String(localRaw || "").trim();
      if (!ln || cn === ln || cn.indexOf(ln) !== -1) return null;
      return cn ? cn + "\n\n--- Bu cihazdaki yerel hesaptan taşınan notlar ---\n" + ln : ln;
    }
    return isEmptyJSON(cloudRaw) ? localRaw : null;
  }

  /* Taşıma. Döner: { ok, error?, moved: { stores, counts } } */
  async function migrate(localId, password) {
    var uid = cloudUid();
    if (!uid) return { ok: false, error: "Önce bulut hesabınızla giriş yapın." };
    if (window.VitaSync && !VitaSync.isInitialPullDone(uid)) return { ok: false, error: "Bulut verileriniz henüz yüklenmedi. İnternet bağlantınızı kontrol edip biraz sonra tekrar deneyin." };
    var acct = localAccounts().find(function (u) { return u.id === localId; });
    if (!acct) return { ok: false, error: "Yerel hesap bulunamadı." };
    var check = typeof verifyVitaPassword === "function" ? await verifyVitaPassword(String(password || ""), acct.password) : { ok: false };
    if (!check || !check.ok) return { ok: false, code: "password", error: "Yerel hesabın şifresi hatalı." };
    var local = await readLocal(localId);
    if (cloudUid() !== uid) return { ok: false, error: "Oturum değişti; taşıma yapılmadı." };
    var changed = [];
    stores().forEach(function (s) {
      var key = "vitatakip_" + s + "_" + uid;
      var merged = mergeStore(s, get(key), local[s]);
      if (merged !== null && merged !== get(key)) { set(key, merged); changed.push(s); }
    });
    set(doneKey(localId), JSON.stringify({ cloudUid: uid, at: new Date().toISOString(), stores: changed }));
    if (changed.length) {
      if (window.VitaSync) VitaSync.reloadAppData(uid, changed);
      // reloadAppData sonrası saveState IndexedDB anlık görüntüsünü de günceller; değişen türler kuyrukta, gönderilir
      try { if (typeof saveState === "function") saveState(); } catch (_) {}
      if (window.VitaSync) VitaSync.flush();
    }
    return { ok: true, moved: { stores: changed, counts: counts(localId) } };
  }

  /* ---------------- Arayüz (dinamik modal) ---------------- */
  function closeModal() { var m = $("vtMigrateModal"); if (m) m.remove(); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function open(opts) {
    opts = opts || {};
    var uid = cloudUid(); if (!uid) return false;
    var list = candidates(uid);
    if (!list.length) { if (opts.manual && typeof showToast === "function") showToast("Taşınacak veri yok", "Bu cihazda bulut hesabınıza taşınmamış yerel hesap verisi bulunamadı.", "info"); return false; }
    closeModal();
    var m = document.createElement("div");
    m.id = "vtMigrateModal"; m.setAttribute("data-uid", uid); m.className = "vt-migrate"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "vtMigrateTitle");
    m.innerHTML =
      '<div class="vt-migrate-card">' +
      '<div class="vt-migrate-icon"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i></div>' +
      '<h2 id="vtMigrateTitle">Bu cihazdaki verilerinizi bulut hesabınıza taşıyalım mı?</h2>' +
      '<p>Bu cihazda daha önce açılmış yerel hesap bulundu. Verilerini bulut hesabınıza kopyalayabilirsiniz; böylece diğer cihazlarınızda da görürsünüz. Yerel hesap ve verileri bu cihazda olduğu gibi kalır.</p>' +
      '<div class="vt-migrate-list" role="radiogroup" aria-label="Yerel hesap">' +
      list.map(function (a, i) {
        return '<label class="vt-migrate-item"><input type="radio" name="vtMigrateAcct" value="' + esc(a.id) + '"' + (i === 0 ? " checked" : "") + '>' +
          '<span><strong>' + esc(a.name) + '</strong><small>' + esc(summary(a.counts)) + '</small></span></label>';
      }).join("") + '</div>' +
      '<label class="vt-migrate-field" for="vtMigratePassword">Yerel hesabın şifresi <small>(ortak cihazda başkasının verisi taşınamasın diye)</small></label>' +
      '<input id="vtMigratePassword" type="password" autocomplete="off" placeholder="Yerel hesap şifresi">' +
      '<div id="vtMigrateError" class="vt-migrate-error hidden" role="alert"></div>' +
      '<label class="vt-migrate-skip"><input id="vtMigrateSkip" type="checkbox"> Bu hesap için bir daha sorma</label>' +
      '<div class="vt-migrate-actions"><button type="button" class="vt-migrate-later" id="vtMigrateLater">Şimdi değil</button>' +
      '<button type="button" class="vt-migrate-go" id="vtMigrateGo"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Verileri Taşı</button></div>' +
      '</div>';
    document.body.appendChild(m);
    var pw = $("vtMigratePassword"); if (pw) setTimeout(function () { try { pw.focus(); } catch (_) {} }, 50);
    $("vtMigrateLater").onclick = function () {
      if ($("vtMigrateSkip") && $("vtMigrateSkip").checked) set(skipKey(uid), "true");
      closeModal();
    };
    var go = async function () {
      if (busy) return;
      var sel = m.querySelector('input[name="vtMigrateAcct"]:checked');
      var err = $("vtMigrateError");
      if (!sel) return;
      if (!pw.value) { err.textContent = "Lütfen yerel hesabın şifresini girin."; err.classList.remove("hidden"); pw.focus(); return; }
      busy = true; $("vtMigrateGo").disabled = true;
      var res;
      try { res = await migrate(sel.value, pw.value); } finally { busy = false; if ($("vtMigrateGo")) $("vtMigrateGo").disabled = false; }
      if (!res.ok) { err.textContent = res.error; err.classList.remove("hidden"); pw.value = ""; pw.focus(); return; }
      closeModal();
      var c = res.moved.counts;
      if (typeof showToast === "function") showToast("Verileriniz taşındı", res.moved.stores.length ? (summary(c) + " bulut hesabınıza kopyalandı. Yerel hesap bu cihazda olduğu gibi duruyor.") : "Bu verilerin hepsi zaten bulut hesabınızdaydı.", "success");
      updateSettingsRow();
    };
    $("vtMigrateGo").onclick = go;
    pw.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    m.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
    return true;
  }

  function isDoctorUid(uid) { return Boolean(window.VitaCloud && VitaCloud.accountTypeOf && VitaCloud.accountTypeOf(uid) === "doctor"); }
  /* Ayarlar > Veriler ve yedek: "Bu cihazdaki yerel hesaptan veri taşı" satırı (yalnız bulut hesabında ve aday varsa) */
  function updateSettingsRow() {
    var row = $("settingsCloudImportRow"); if (!row) return;
    var uid = cloudUid();
    row.classList.toggle("hidden", !(uid && !isDoctorUid(uid) && candidates(uid).length));
  }

  document.addEventListener("vita:cloud-pulled", function (e) {
    var uid = e.detail && e.detail.userId;
    updateSettingsRow();
    if (!uid || uid !== cloudUid() || get(skipKey(uid)) === "true" || $("vtMigrateModal")) return;
    if (isDoctorUid(uid)) return; // doktor hesabına hasta kayıtları taşınmaz
    // Profil adımı (yeni kayıt) açıksa onun ardından sorulur
    var ask = function () { if (cloudUid() === uid && !$("vtMigrateModal")) open(); };
    var profile = $("profileModal");
    if (profile && !profile.classList.contains("hidden")) setTimeout(ask, 1500); else ask();
  });
  // Hesap değişince / çıkışta önceki hesaba ait taşıma sorusu ekranda kalmaz
  document.addEventListener("vita:cloud-session", function (e) {
    var m = $("vtMigrateModal"); var uid = e.detail && e.detail.userId;
    if (m && m.getAttribute("data-uid") !== uid) closeModal();
    updateSettingsRow();
  });
  document.addEventListener("click", function (e) { if (e.target && e.target.closest && e.target.closest("#settingsCloudImportBtn")) open({ manual: true }); });

  window.VitaMigrate = { candidates: candidates, migrate: migrate, open: open, close: closeModal, mergeStore: mergeStore, updateSettingsRow: updateSettingsRow };
})();
