/* Yerel profil fotoğrafı (sunucusuz): seçilen görsel Canvas ile 150x150 kareye kırpılıp küçültülür,
   WebP (desteklenmezse JPEG) olarak sıkıştırılır ve yalnızca bu cihazda saklanır: localStorage "vitatakip_avatar_<hesap>".
   Fotoğraf kullanıcı profil kaydından AYRI tutulur; böylece yapay zekâya giden sağlık bağlamına veya rapora karışmaz.
   JSON yedeğine "profilePhoto" alanı olarak girer ve geri yüklenince geri gelir. Hiçbir dış sunucuya gönderilmez. */
(function () {
  "use strict";
  var SIZE = 150;
  var MAX_LEN = 300000; // ~220 KB üst sınır (150x150 için tipik boyut 6–15 KB)
  var DATA_URL_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

  function uid() { try { return typeof activeUserId !== "undefined" && activeUserId ? String(activeUserId) : ""; } catch (_) { return ""; } }
  function key(id) { return "vitatakip_avatar_" + (id || uid()); }
  function isValid(v) { return typeof v === "string" && v.length <= MAX_LEN && DATA_URL_RE.test(v); }

  function get(id) {
    var k = id || uid(); if (!k) return "";
    var v = "";
    try { v = localStorage.getItem(key(k)) || ""; } catch (_) {}
    return isValid(v) ? v : "";
  }
  function set(dataUrl, id) {
    var k = id || uid(); if (!k) return false;
    try {
      if (dataUrl && isValid(dataUrl)) localStorage.setItem(key(k), dataUrl);
      else localStorage.removeItem(key(k));
      return true;
    } catch (_) { return false; }
  }

  /* Görsel → 150x150 ortadan kare kırpma → WebP/JPEG veri URL'i */
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Görsel okunamadı.")); };
      img.src = url;
    });
  }
  async function processFile(file) {
    if (file && file.size > 40 * 1024 * 1024) throw new Error("Fotoğraf çok büyük (40 MB üstü).");
    /* Ortak çözücü: büyük fotoğrafları küçülterek açar (bellek), türü boş gelen galeri dosyalarını ve HEIC'i de destekler. */
    var decoded, source, w, h;
    if (window.VitaImage) {
      decoded = await window.VitaImage.decode(file, { maxSide: 600 });
      source = decoded.source; w = decoded.width; h = decoded.height;
    } else {
      if (!file || !/^image\//.test(file.type || "")) throw new Error("Lütfen bir fotoğraf (JPEG, PNG, WebP, HEIC) seçin.");
      source = await loadImage(file); w = source.width; h = source.height;
    }
    if (!w || !h) throw new Error("Görsel okunamadı.");
    var side = Math.min(w, h), sx = (w - side) / 2, sy = (h - side) / 2;
    var canvas = document.createElement("canvas");
    canvas.width = SIZE; canvas.height = SIZE;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, SIZE, SIZE); // saydam PNG'ler JPEG'de siyah olmasın
    ctx.drawImage(source, sx, sy, side, side, 0, 0, SIZE, SIZE);
    if (decoded) decoded.close(); else if (source.close) try { source.close(); } catch (_) {}
    var out = canvas.toDataURL("image/webp", 0.82);
    if (!/^data:image\/webp/.test(out)) out = canvas.toDataURL("image/jpeg", 0.85); // WebP kodlayamayan tarayıcılar
    if (!isValid(out)) throw new Error("Fotoğraf işlenemedi.");
    return out;
  }

  /* Avatarları güncelle: sol menü, üst bar, profil penceresi önizlemesi */
  var DEFAULT_ICON = '<i class="fa-solid fa-user" aria-hidden="true"></i>';
  function paint(el, photo, alt) {
    if (!el) return;
    if (photo) {
      el.classList.add("vpf-has-photo");
      el.innerHTML = '<img src="' + photo + '" alt="' + (alt || "Profil fotoğrafı") + '" class="vpf-img" draggable="false"/>';
    } else {
      el.classList.remove("vpf-has-photo");
      el.innerHTML = DEFAULT_ICON;
    }
  }
  function render() {
    var photo = uid() ? get() : "";
    paint(document.getElementById("drawerUserAvatar"), photo);
    paint(document.getElementById("headerUserAvatar"), photo);
    paint(document.getElementById("profilePhotoPreview"), photo);
    var rm = document.getElementById("btnRemoveProfilePhoto");
    if (rm) rm.classList.toggle("hidden", !photo);
  }

  function pick(ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (!uid()) { if (typeof showToast === "function") showToast("Önce giriş yapın", "Profil fotoğrafı hesaba özel saklanır.", "warning"); return; }
    var input = document.getElementById("profilePhotoInput");
    if (input) { input.value = ""; input.click(); }
  }
  async function onFile(ev) {
    var file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
    if (!file) return;
    try {
      var data = await processFile(file);
      if (!set(data)) throw new Error("Cihaz depolaması dolu olabilir; fotoğraf kaydedilemedi.");
      render();
      if (typeof showToast === "function") showToast("Profil fotoğrafı güncellendi", "Fotoğraf yalnızca bu cihazda saklanır; yedeğe de eklenir.", "success");
    } catch (e) {
      if (typeof showToast === "function") showToast("Fotoğraf eklenemedi", (e && e.message) || "Görsel işlenemedi.", "warning");
    } finally { if (ev && ev.target) ev.target.value = ""; }
  }
  function remove(ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    set(null); render();
    if (typeof showToast === "function") showToast("Profil fotoğrafı kaldırıldı", "Varsayılan simge kullanılıyor.", "info");
  }

  window.VitaProfilePhoto = { get: get, set: set, isValid: isValid, processFile: processFile, render: render, pick: pick, onFile: onFile, remove: remove, storageKey: key };

  // Oturum açılınca / görünümler yenilenince / profil penceresi açılınca avatarlar güncellenir.
  function wrap(name) {
    var orig = window[name];
    if (typeof orig !== "function" || orig.__vpfWrapped) return;
    var w = function () { var r = orig.apply(this, arguments); try { render(); } catch (_) {} return r; };
    w.__vpfWrapped = true;
    window[name] = w;
  }
  function init() {
    ["renderAllAppViews", "openProfileModal", "resetApplicationDOMAndState"].forEach(wrap);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
