/* VitaTakip — açık / koyu / sistem teması (V3 madde 1).
   Tercih cihaz düzeyinde localStorage "vitatakip_theme" anahtarında tutulur (sağlık verisi değildir).
   İlk boyama <head> içindeki küçük betikle yapılır; bu modül ayar düğmelerini, sistem değişimini ve tarayıcı rengini yönetir.
   Koyu renkler css/tema-v2.css içinde yalnızca ekran için üretilir; yazdırma/PDF her zaman açık kalır. */
(function () {
  "use strict";
  var KEY = "vitatakip_theme";
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function pref() { try { var v = localStorage.getItem(KEY); return v === "dark" || v === "system" ? v : "light"; } catch (_) { return "light"; } }
  function isDark(p) { return p === "dark" || (p === "system" && !!(mq && mq.matches)); }
  function meta(name, content) { var m = document.querySelector('meta[name="' + name + '"]'); if (m) m.setAttribute("content", content); }

  function apply(p) {
    var dark = isDark(p);
    if (dark) document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme");
    meta("color-scheme", dark ? "dark" : "light");
    meta("theme-color", dark ? "#020617" : "#0f172a");
    Array.prototype.forEach.call(document.querySelectorAll("[data-vt-theme]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-vt-theme") === p ? "true" : "false"); });
  }
  function set(p) { try { localStorage.setItem(KEY, p); } catch (_) {} apply(p); }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-vt-theme]");
    if (b) set(b.getAttribute("data-vt-theme"));
  });
  if (mq) { var onChange = function () { if (pref() === "system") apply("system"); }; if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { apply(pref()); }); else apply(pref());
  window.VitaTheme = { set: set, get: pref, isDark: function () { return isDark(pref()); } };
})();
