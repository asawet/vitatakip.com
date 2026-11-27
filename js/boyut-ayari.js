/* VitaTakip — yazı ve simge boyutu (Ayarlar > Görünüm altındaki "Yazı ve simge boyutu" kartı).
   Tercih cihaz düzeyinde localStorage'da tutulur (sağlık verisi değildir):
     vitatakip_text_scale → --vt-text-scale  (derleme px/rem yazı boyutlarını bununla çarpar, bkz. tools/build.mjs)
     vitatakip_icon_scale → --vt-icon-scale  (Font Awesome simgeleri, bkz. css/overrides.css)
   İlk boyama <head> içindeki küçük betikle yapılır (yazı önce küçük görünüp sonra büyümesin); bu modül
   kaydırıcıları, önizlemeyi ve "Varsayılana dön" düğmesini yönetir. Yazdırma/PDF her zaman normal boyuttadır. */
(function () {
  "use strict";
  var SETTINGS = {
    text: { key: "vitatakip_text_scale", cssVar: "--vt-text-scale",
      steps: [0.9, 1, 1.1, 1.2, 1.3], labels: ["Küçük", "Normal", "Büyük", "Daha büyük", "En büyük"] },
    icon: { key: "vitatakip_icon_scale", cssVar: "--vt-icon-scale",
      steps: [0.85, 1, 1.15, 1.3], labels: ["Küçük", "Normal", "Büyük", "En büyük"] }
  };

  /* Kayıtlı değer yalnız izinli adımlardan biriyse kabul edilir; bozuk/eski değer → Normal (1). */
  function read(kind) {
    var s = SETTINGS[kind];
    try {
      var v = Number(localStorage.getItem(s.key));
      if (s.steps.indexOf(v) !== -1) return v;
    } catch (_) {}
    return 1;
  }
  function applyVar(kind, value) {
    document.documentElement.style.setProperty(SETTINGS[kind].cssVar, String(value));
  }
  function percent(v) { return "%" + Math.round(v * 100); }

  function syncUI() {
    Object.keys(SETTINGS).forEach(function (kind) {
      var s = SETTINGS[kind], v = read(kind), i = s.steps.indexOf(v);
      Array.prototype.forEach.call(document.querySelectorAll('input[data-vt-size="' + kind + '"]'), function (input) {
        input.min = "0"; input.max = String(s.steps.length - 1); input.step = "1";
        input.value = String(i);
        input.setAttribute("aria-valuetext", s.labels[i] + " (" + percent(v) + ")");
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-vt-size-value="' + kind + '"]'), function (el) {
        el.textContent = s.labels[i] + " · " + percent(v);
      });
    });
    var reset = document.querySelector("[data-vt-size-reset]");
    if (reset) reset.disabled = read("text") === 1 && read("icon") === 1;
  }

  function set(kind, value) {
    var s = SETTINGS[kind];
    if (!s || s.steps.indexOf(value) === -1) return;
    try {
      if (value === 1) localStorage.removeItem(s.key); else localStorage.setItem(s.key, String(value));
    } catch (_) { /* gizli pencere: yalnız bu oturumda uygulanır */ }
    applyVar(kind, value);
    syncUI();
  }
  function reset() { set("text", 1); set("icon", 1); }

  // Kaydırıcı sürüklendikçe canlı uygulanır.
  document.addEventListener("input", function (e) {
    var input = e.target;
    if (!input || !input.getAttribute) return;
    var kind = input.getAttribute("data-vt-size");
    if (!kind || !SETTINGS[kind]) return;
    var step = SETTINGS[kind].steps[Number(input.value)];
    if (typeof step === "number") set(kind, step);
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-vt-size-reset]");
    if (!b) return;
    reset();
    if (typeof window.showToast === "function") window.showToast("Boyutlar sıfırlandı", "Yazı ve simge boyutu varsayılana döndü.", "info");
  });

  function init() { applyVar("text", read("text")); applyVar("icon", read("icon")); syncUI(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  window.VitaSize = {
    set: set, reset: reset,
    get: function (kind) { return read(kind); },
    steps: function (kind) { return SETTINGS[kind] ? SETTINGS[kind].steps.slice() : []; }
  };
})();
