/* VitaTakip — yapay zekâ proxy istemcisi (bulut hesabı, kendi Gemini anahtarı girilmemişse).
   İstekler kullanıcının oturum belirteciyle "ai-proxy" Edge Function'ına gider; VitaTakip'in Gemini anahtarı yalnız orada
   (Supabase Secret). Uygulamadaki tüm Gemini çağrıları tek noktadan geçer (vitaGeminiGenerate): anahtar yerine
   VitaAIProxy.SENTINEL verilirse istek buraya yönlenir. Model sırası, kota ve yerel motora düşme aynen sürer.

   ÜCRETSİZ ANAHTAR UYARISI: Gemini API'nin ücretsiz katmanında Google gönderilen içeriği inceleyebilir ve ürün
   geliştirmede kullanabilir. Bu yüzden proxy'ye gitmeden önce isteğin TÜM metinlerinden kullanıcının adı ayıklanır
   ("Kullanıcı" yazılır); ayarlarda ve gizlilik metninde açıkça söylenir. Kendi anahtarını giren kullanıcı onunla devam eder. */
(function () {
  "use strict";
  var SENTINEL = "vita-bulut-proxy";
  var lastUsage = null; // { used, limit, day }

  function cloudUid() { var id = typeof activeUserId !== "undefined" ? activeUserId : null; return window.VitaCloud && VitaCloud.isCloudUserId(id) ? id : null; }
  function ownKey() { try { return typeof getGeminiApiKey === "function" ? Boolean(getGeminiApiKey()) : false; } catch (_) { return false; } }
  /* Proxy kullanılabilir mi: bulut hesabı açık (anahtar olsa da proxy mümkündür; anahtar varsa o tercih edilir). */
  function available() { return Boolean(cloudUid()); }
  /* Uygulamada yapay zekâ kullanılabilir mi: kendi anahtarı VEYA bulut proxy'si */
  function aiAvailable() { return ownKey() || available(); }
  /* Gemini çağrılarına verilecek anahtar: kendi anahtarı, yoksa proxy işareti, yoksa boş */
  function keyOrProxy() {
    try { var k = typeof getGeminiApiKey === "function" ? getGeminiApiKey() : ""; if (k) return k; } catch (_) {}
    return available() ? SENTINEL : "";
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  /* İsteğin tüm metin parçalarından kullanıcının adını (tam ad ve 3+ harfli parçaları) ayıklar. */
  function scrubName(body) {
    var name = String((typeof state !== "undefined" && state.user && state.user.name) || "").trim();
    var copy = JSON.parse(JSON.stringify(body || {}));
    if (name.length < 2) return copy;
    var tokens = [name].concat(name.split(/\s+/).filter(function (t) { return t.length >= 3; }));
    tokens.sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp("(^|[^\\p{L}])(" + tokens.map(escapeRe).join("|") + ")(?=[^\\p{L}]|$)", "giu");
    var clean = function (t) { return String(t).replace(re, function (_, pre) { return pre + "Kullanıcı"; }); };
    var walk = function (parts) { if (Array.isArray(parts)) parts.forEach(function (p) { if (p && typeof p.text === "string") p.text = clean(p.text); }); };
    (copy.contents || []).forEach(function (c) { walk(c && c.parts); });
    if (copy.systemInstruction) walk(copy.systemInstruction.parts);
    return copy;
  }

  function err(message, extra) { return Object.assign(new Error(message), extra || {}); }

  async function generate(body, options) {
    options = options || {};
    if (!available()) throw err("Bulut hesabı oturumu yok.", { noApiKey: true });
    if (!navigator.onLine) throw err("Failed to fetch: çevrimdışı");
    var c = await VitaCloud.getClient();
    var s = await c.auth.getSession();
    var token = s && s.data && s.data.session && s.data.session.access_token;
    if (!token) throw err("Oturum bulunamadı.", { status: 401 });
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl && options.timeoutMs ? setTimeout(function () { ctrl.abort(); }, options.timeoutMs) : null;
    if (ctrl && options.signal) options.signal.addEventListener("abort", function () { ctrl.abort(); }, { once: true });
    var res;
    try {
      res = await fetch(VitaCloud.config.url + "/functions/v1/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: VitaCloud.config.publishableKey, Authorization: "Bearer " + token },
        body: JSON.stringify({ body: scrubName(body) }),
        signal: ctrl ? ctrl.signal : options.signal
      });
    } finally { if (timer) clearTimeout(timer); }
    var data = await res.json().catch(function () { return {}; });
    if (res.ok && data && data.text) {
      lastUsage = { used: data.used, limit: data.limit, day: new Date().toDateString() };
      updateNotice();
      return { text: String(data.text), model: data.model ? data.model + " · VitaTakip" : "VitaTakip AI" };
    }
    var code = data && data.error;
    if (res.status === 429 && (code === "quota_user" || code === "quota_global")) {
      if (code === "quota_user") { lastUsage = { used: data.limit, limit: data.limit, day: new Date().toDateString() }; updateNotice(); }
      throw err(code === "quota_user" ? "Bugünkü yapay zekâ hakkınız doldu." : "Uygulamanın bugünkü yapay zekâ kotası doldu.", { status: 429, proxyQuota: code === "quota_user" ? "user" : "global", limit: data.limit });
    }
    if (res.status === 503) throw err("Ücretsiz yapay zekâ hizmeti şu an yanıt veremiyor.", { status: 503, proxyUpstream: code || "upstream_failed" });
    throw err(code || ("HTTP " + res.status), { status: res.status });
  }

  /* Ayarlar > Yapay zekâ: proxy kullanılıyorsa açıklama + bugünkü hak */
  function updateNotice() {
    var el = document.getElementById("aiProxyNotice");
    if (!el) return;
    var on = available() && !ownKey();
    el.classList.toggle("hidden", !on);
    var left = document.getElementById("aiProxyUsage");
    if (left) {
      var today = new Date().toDateString();
      left.textContent = lastUsage && lastUsage.day === today && lastUsage.limit ? "Bugün kalan: " + Math.max(0, lastUsage.limit - lastUsage.used) + " / " + lastUsage.limit + " soru" : "";
    }
  }
  /* Bugünkü kullanım buluttan okunur (yalnız kendi satırı; RLS) */
  async function refreshUsage() {
    var uid = cloudUid(); if (!uid || !navigator.onLine) { updateNotice(); return; }
    try {
      var c = await VitaCloud.getClient();
      var d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
      var r = await c.from("ai_usage").select("count").eq("user_id", uid).eq("day", d);
      if (!r.error) lastUsage = { used: (r.data && r.data[0] && r.data[0].count) || 0, limit: (lastUsage && lastUsage.limit) || 10, day: new Date().toDateString() };
    } catch (_) {}
    updateNotice();
  }

  document.addEventListener("vita:cloud-session", function () { refreshUsage(); });
  document.addEventListener("vita:cloud-pulled", function () { refreshUsage(); });

  window.VitaAIProxy = { SENTINEL: SENTINEL, available: available, generate: generate, scrubName: scrubName, updateNotice: updateNotice, refreshUsage: refreshUsage, keyOrProxy: keyOrProxy };
  window.isVitaAIAvailable = aiAvailable;
  window.getVitaAIKeyOrProxy = keyOrProxy;
})();
