/* Servis çalışanı (çevrimdışı açılış + hızlı önbellek). Yalnızca http(s) üzerinde; göreceli yol sayesinde
   GitHub Pages alt klasöründe de özel alan adında da aynı şekilde çalışır. */
if ('serviceWorker' in navigator && /^https?:$/i.test(window.location.protocol)) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(function () {});
  });
}
