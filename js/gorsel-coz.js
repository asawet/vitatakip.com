/* Sağlam görsel çözücü (tamamen cihazda): galeriden seçilen JPEG / PNG / WebP / GIF / AVIF / HEIC fotoğrafı
   çizilebilir bir kaynağa dönüştürür. Sırasıyla dener:
     1) createImageBitmap + küçültme (büyük fotoğraflarda bellek taşmasını önler) + EXIF yönü
     2) createImageBitmap (seçeneksiz, eski tarayıcılar)
     3) <img> + blob adresi   4) <img> + FileReader veri adresi
   Hiçbiri olmazsa ve dosya HEIC/HEIF ise (türü boş/yanlış gelse bile dosya imzasından anlaşılır) yerel heic2any ile
   JPEG'e çevirip yeniden dener. Hiçbir görsel dışarı gönderilmez. */
(function () {
  "use strict";
  var IMG_EXT = /\.(jpe?g|jfif|png|webp|gif|bmp|avif|heic|heif)$/i;

  function isImageFile(file) {
    if (!file) return false;
    var t = String(file.type || "");
    return /^image\//.test(t) || ((!t || t === "application/octet-stream") && IMG_EXT.test(file.name || ""));
  }
  function looksHeicByName(file) { return /hei[cf]/i.test(file.type || "") || /\.(heic|heif)$/i.test(file.name || ""); }
  /* ISO-BMFF imzası: 4.–12. baytlar "ftypheic", "ftypheix", "ftypmif1", "ftypmsf1", "ftyphevc" … */
  async function looksHeicBySignature(file) {
    try {
      var buf = await file.slice(0, 32).arrayBuffer();
      var s = String.fromCharCode.apply(null, Array.from(new Uint8Array(buf)));
      return /ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(s);
    } catch (_) { return false; }
  }

  function viaImg(src, revoke) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = "async";
      img.onload = function () { if (revoke) URL.revokeObjectURL(src); resolve(img); };
      img.onerror = function () { if (revoke) URL.revokeObjectURL(src); reject(new Error("img")); };
      img.src = src;
    });
  }
  function readDataUrl(blob) {
    return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(String(r.result || "")); }; r.onerror = function () { reject(r.error || new Error("read")); }; r.readAsDataURL(blob); });
  }
  function usable(src) { return src && (src.width || src.naturalWidth) > 0 && (src.height || src.naturalHeight) > 0; }

  async function decodeBlob(blob, maxSide) {
    var attempts = [
      function () { return createImageBitmap(blob, { imageOrientation: "from-image", resizeWidth: maxSide, resizeQuality: "high" }); },
      function () { return createImageBitmap(blob); },
      function () { return viaImg(URL.createObjectURL(blob), true); },
      async function () { return viaImg(await readDataUrl(blob), false); }
    ];
    if (typeof createImageBitmap !== "function") attempts = attempts.slice(2);
    for (var i = 0; i < attempts.length; i++) {
      try { var src = await attempts[i](); if (usable(src)) return src; if (src && src.close) src.close(); } catch (_) { /* sıradaki yöntem */ }
    }
    return null;
  }

  var heicPromise = null;
  function loadHeic2any() {
    if (window.heic2any) return Promise.resolve(window.heic2any);
    if (heicPromise) return heicPromise;
    heicPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      // Yalnızca HEIC seçildiğinde yüklenir (≈1,3 MB); açılış önbelleğine bilerek eklenmez.
      s.src = "./vendor/heic2any/" + "heic2any.min.js";
      s.async = true;
      s.onload = function () { window.heic2any ? resolve(window.heic2any) : reject(new Error("heic2any")); };
      s.onerror = function () { heicPromise = null; reject(new Error("heic2any")); };
      document.head.appendChild(s);
    });
    return heicPromise;
  }

  /* Dönüş: { source (ImageBitmap | HTMLImageElement), width, height, close() } veya açıklayıcı bir hata. */
  async function decode(file, opts) {
    var maxSide = (opts && opts.maxSide) || 1600;
    if (!file) throw new Error("Fotoğraf seçilmedi.");
    if (!file.size) throw new Error("Fotoğraf telefonda değil (bulutta olabilir). Önce galeriye indirip yeniden seçin.");
    if (!isImageFile(file)) throw new Error("Lütfen bir fotoğraf (JPEG, PNG, WebP, HEIC) seçin.");
    // Önce tarayıcının kendi çözücüsü (Safari HEIC'i doğrudan açar); olmazsa HEIC dönüştürücü.
    var src = await decodeBlob(file, maxSide);
    if (!src && (looksHeicByName(file) || await looksHeicBySignature(file))) {
      try {
        var conv = await (await loadHeic2any())({ blob: file, toType: "image/jpeg", quality: 0.9 });
        src = await decodeBlob(Array.isArray(conv) ? conv[0] : conv, maxSide);
      } catch (_) {
        throw new Error("HEIC fotoğraf bu cihazda açılamadı. Fotoğrafı JPEG olarak kaydedip (veya ekran görüntüsü alıp) yeniden seçin.");
      }
    }
    if (!src) throw new Error("Görsel açılamadı. Fotoğraf bozuk ya da desteklenmeyen bir biçimde olabilir; farklı bir fotoğraf deneyin.");
    var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    return { source: src, width: w, height: h, close: function () { if (src.close) try { src.close(); } catch (_) {} } };
  }

  /* Çözülen görseli (gerekirse küçültüp) bir tuvale çizer — barkod okuyucu ve yapay zekâ yüklemesi için. */
  async function toCanvas(file, opts) {
    var d = await decode(file, opts);
    var maxSide = (opts && opts.maxSide) || 1600, scale = Math.min(1, maxSide / Math.max(d.width, d.height));
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(d.width * scale)); c.height = Math.max(1, Math.round(d.height * scale));
    var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(d.source, 0, 0, c.width, c.height);
    d.close();
    return c;
  }

  /* Fotoğraftaki barkodu / karekodu cihazda okur: BarcodeDetector (Android Chrome) → ZXing (iOS / masaüstü).
     Okunamazsa null döner (görselde barkod yok). Birkaç ölçekte dener; küçük barkodlar büyük fotoğrafta kaybolmasın. */
  var FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "data_matrix", "qr_code"];
  async function readBarcode(file) {
    var sizes = [1600, 2400, 1000];
    for (var i = 0; i < sizes.length; i++) {
      var canvas = await toCanvas(file, { maxSide: sizes[i] });
      if ("BarcodeDetector" in window) {
        try {
          var supported = typeof window.BarcodeDetector.getSupportedFormats === "function" ? await window.BarcodeDetector.getSupportedFormats() : FORMATS;
          var fm = FORMATS.filter(function (f) { return supported.indexOf(f) > -1; });
          var codes = await new window.BarcodeDetector(fm.length ? { formats: fm } : undefined).detect(canvas);
          if (codes && codes[0] && codes[0].rawValue) return String(codes[0].rawValue);
        } catch (_) { /* ZXing ile dene */ }
      }
      if (typeof window.loadZXingBrowser === "function") {
        try {
          var zx = await window.loadZXingBrowser();
          var res = new zx.BrowserMultiFormatReader().decodeFromCanvas(canvas);
          if (res && res.getText && res.getText()) return String(res.getText());
        } catch (_) { /* bu ölçekte bulunamadı */ }
      }
    }
    return null;
  }

  /* Yapay zekâya gönderilecek kutu fotoğrafı: JPEG'e çevrilip küçültülür (HEIC/boş türlü dosyalar da gönderilebilir,
     mobil veri harcaması azalır). Dönüş: { base64, mimeType }. */
  async function toJpegBase64(file, maxSide) {
    var canvas = await toCanvas(file, { maxSide: maxSide || 1600 });
    var url = canvas.toDataURL("image/jpeg", 0.85);
    return { base64: url.slice(url.indexOf(",") + 1), mimeType: "image/jpeg" };
  }

  /* "Barkod fotoğrafı yükle" (Takviye Ekle / İlaç Ekle): görselde geçerli bir barkod yoksa REDDEDİLİR; yapay zekâya geçilmez. */
  async function handleBarcodeGalleryPhoto(event, mode) {
    var input = event && event.target, file = input && input.files ? input.files[0] : null;
    if (!file) return;
    var med = mode === "medication";
    var say = function (msg, tone) {
      if (med && typeof window.setAddMedStatus === "function") window.setAddMedStatus(msg, tone === "ok" ? "ok" : (tone === "info" ? "info" : "warn"));
      else if (!med && typeof window.showAddSupFeedback === "function") window.showAddSupFeedback(msg, tone === "ok" ? "success" : (tone === "info" ? "info" : "warning"));
      else if (typeof window.showToast === "function") window.showToast("Barkod fotoğrafı", msg, tone === "ok" ? "success" : "warning");
    };
    try {
      if (med && typeof window.stopVitaMedCamera === "function") window.stopVitaMedCamera();
      if (!med && typeof window.stopScanner === "function") window.stopScanner();
      say("⏳ Fotoğrafta barkod aranıyor…", "info");
      var code = await readBarcode(file);
      // Kontrol hanesi tutmayan (yanlış okunmuş) barkod veya ürün barkodu olmayan kod kabul edilmez; karekoddan GTIN çıkarılır.
      var key = !code ? "" : (typeof window.vitaAcceptScannedCode === "function" ? window.vitaAcceptScannedCode(code) : (typeof window.vitaBarcodeKey === "function" ? window.vitaBarcodeKey(code) : code));
      if (!code || !key) {
        say("Geçersiz görsel: Barkod tespit edilemedi. Ürünün barkodunun (EAN-13) veya karekodunun net göründüğü bir fotoğraf seçin.", "warn");
        if (typeof window.showToast === "function") window.showToast("Geçersiz görsel", "Barkod tespit edilemedi. Fotoğraf kabul edilmedi.", "warning");
        return;
      }
      if (med && typeof window.lookupAddMedBarcode === "function") await window.lookupAddMedBarcode(key);
      else if (!med && typeof window.handleAddSupBarcodeDecoded === "function") await window.handleAddSupBarcodeDecoded(key);
    } catch (e) {
      say((e && e.message) || "Fotoğraf okunamadı.", "warn");
    } finally { if (input) input.value = ""; }
  }

  window.VitaImage = { decode: decode, toCanvas: toCanvas, isImageFile: isImageFile, loadHeic2any: loadHeic2any, readBarcode: readBarcode, toJpegBase64: toJpegBase64 };
  window.handleBarcodeGalleryPhoto = handleBarcodeGalleryPhoto;
})();
