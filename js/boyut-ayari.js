/* VitaTakip — yazı ve simge boyutu (Ayarlar > Görünüm kartındaki "Aa Aa Aa" seçici).
   Tek tercih, yazı ve simgeyi birlikte büyütür: Normal %100 · Büyük %115 · Çok büyük %130.
   Cihaz düzeyinde localStorage "vitatakip_text_scale" anahtarında tutulur (sağlık verisi değildir):
     --vt-text-scale → derleme px/rem yazı boyutlarını bununla çarpar (tools/build.mjs → scaleTextSizes)
     --vt-icon-scale → Font Awesome simgeleri (css/overrides.css)
   İlk boyama <head> içindeki küçük betikle yapılır (yazı önce küçük görünüp sonra büyümesin).
   Yazdırma/PDF her zaman normal boyuttadır. */
(function () {
  "use strict";
  var KEY = "vitatakip_text_scale";
  var LEGACY_ICON_KEY = "vitatakip_icon_scale"; // ilk sürümde ayrı simge kaydırıcısı vardı
  var STEPS = [1, 1.15, 1.3];
  var LABELS = { 1: "Normal", 1.15: "Büyük", 1.3: "Çok büyük" };

  /* Kayıtlı değer en yakın kademeye yuvarlanır (eski 5 kademeli sürümden kalan 1.1/1.2 vb. de karşılanır). */
  function snap(v) {
    if (!(v > 0)) return 1;
    return STEPS.reduce(function (best, s) { return Math.abs(s - v) < Math.abs(best - v) ? s : best; }, 1);
  }
  function read() {
    try { return snap(Number(localStorage.getItem(KEY))); } catch (_) { return 1; }
  }
  function applyVars(v) {
    var r = document.documentElement.style;
    r.setProperty("--vt-text-scale", String(v));
    r.setProperty("--vt-icon-scale", String(v));
  }
  function syncUI() {
    var v = read();
    Array.prototype.forEach.call(document.querySelectorAll("[data-vt-size-step]"), function (b) {
      b.setAttribute("aria-pressed", Number(b.getAttribute("data-vt-size-step")) === v ? "true" : "false");
    });
  }
  function set(v) {
    v = snap(Number(v));
    try {
      if (v === 1) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(v));
      localStorage.removeItem(LEGACY_ICON_KEY);
    } catch (_) { /* gizli pencere: yalnız bu oturumda uygulanır */ }
    applyVars(v);
    syncUI();
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-vt-size-step]");
    if (b) set(b.getAttribute("data-vt-size-step"));
  });

  function init() { applyVars(read()); syncUI(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  window.VitaSize = {
    set: set,
    reset: function () { set(1); },
    get: read,
    steps: function () { return STEPS.slice(); },
    label: function (v) { return LABELS[snap(v === undefined ? read() : v)]; }
  };
})();
