/* VitaTakip — Doktor Paneli: hastaya erişim isteği (davet) (VitaDoctorInvite).
   - Yalnız ONAYLI doktor: hastanın takma adı (ya da @takma_ad) veya e-postasıyla istek gönderir (request_patient_access).
   - Hasta Rapor > Doktorum'da kabul edene kadar doktor HİÇBİR veri göremez; kabul = erişim izni (patient_doctor_links).
   - Gönderilen istekler: Bekliyor (geri çekilebilir) / Kabul edildi / Reddedildi / Geri çekildi.
     Kabul edilen istek olunca "Hastalarım" listesi yenilenir.
   - Sunucu sınırları: günde 30 istek, aynı hastaya tek bekleyen istek, reddedilirse 7 gün yeni istek yok
     (supabase/migrations/20261128200000_doktor_rehberi_davet.sql). Metinler textContent ile yazılır. */
(function () {
  "use strict";
  var POLL_MS = 30000;
  var timer = null, busy = false, lastAccepted = -1;
  var REASONS = {
    not_verified: "Hesabınız onaylandıktan sonra hasta davet edebilirsiniz.",
    not_doctor: "Bu işlem yalnız doktor hesapları içindir.",
    bad_identifier: "Hastanın takma adını (ör. ayse_k) ya da e-posta adresini doğru yazın.",
    not_found: "Bu takma ad / e-postayla bir hasta hesabı bulunamadı. Hastanızdan bilgisini kontrol etmesini isteyin.",
    self: "Kendinize istek gönderemezsiniz.",
    already_linked: "Bu hasta size zaten erişim izni vermiş; Hastalarım listesinde.",
    already_pending: "Bu hastaya gönderilmiş, yanıt bekleyen bir isteğiniz var.",
    recently_declined: "Hasta isteğinizi yakın zamanda reddetti; 7 gün içinde yeni istek gönderilemez.",
    rate_limit: "Günlük istek sınırına (30) ulaştınız. Yarın tekrar deneyin.",
    unauthorized: "Oturumunuz sona ermiş olabilir. Lütfen tekrar giriş yapın."
  };
  var STATUS = { pending: ["Bekliyor", "wait"], accepted: ["Kabul edildi", "ok"], declined: ["Reddedildi", "no"], cancelled: ["Geri çekildi", "off"] };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function uid() { var id = typeof activeUserId !== "undefined" ? activeUserId : null; return window.VitaCloud && VitaCloud.isCloudUserId(id) ? id : null; }
  function profile() { var id = uid(); return id ? VitaCloud.cachedProfile(id) : null; }
  function verifiedDoctor() { var p = profile(); return Boolean(p && p.account_type === "doctor" && p.doctor_verified); }
  function viewVisible() { var v = $("view-doctor"); return Boolean(v && !v.classList.contains("hidden")); }
  function fmt(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }); }

  function msg(text, tone) {
    var m = $("vdpInviteMsg"); if (!m) return;
    m.textContent = text || ""; m.setAttribute("data-tone", tone || "info"); m.classList.toggle("hidden", !text);
  }

  function render(list) {
    var ul = $("vdpRequestList"), cnt = $("vdpRequestCount"); if (!ul) return;
    var pending = list.filter(function (r) { return r.status === "pending"; }).length;
    if (cnt) cnt.textContent = pending ? pending + " bekliyor" : String(list.length);
    ul.textContent = "";
    if (!list.length) { ul.appendChild(el("li", "vdp-muted", "Henüz istek göndermediniz.")); return; }
    list.forEach(function (r) {
      var li = el("li", "vdp-req");
      var info = el("div", "vdp-req-info");
      info.appendChild(el("strong", null, r.requested_as || "—"));
      info.appendChild(el("small", null, fmt(r.created_at) + (r.responded_at && r.status !== "pending" ? " · yanıt " + fmt(r.responded_at) : "")));
      li.appendChild(info);
      var s = STATUS[r.status] || [r.status, "off"];
      var badge = el("span", "vdp-req-badge", s[0]); badge.setAttribute("data-tone", s[1]);
      li.appendChild(badge);
      if (r.status === "pending") {
        var b = el("button", "vdp-req-cancel", "Geri çek"); b.type = "button"; b.setAttribute("data-request-cancel", r.id);
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
  }

  async function load() {
    var box = $("vdpInviteBox");
    var ok = verifiedDoctor();
    if (box) box.classList.toggle("hidden", !ok);
    if (!ok || !navigator.onLine) return;
    var me = uid();
    try {
      var c = await VitaCloud.getClient();
      var res = await c.from("access_requests").select("id, requested_as, status, created_at, responded_at").eq("doctor_id", me);
      if (uid() !== me || res.error) return;
      var list = (res.data || []).slice().sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }).slice(0, 30);
      render(list);
      var accepted = list.filter(function (r) { return r.status === "accepted"; }).length;
      if (lastAccepted >= 0 && accepted > lastAccepted && window.VitaDoctorPanel) VitaDoctorPanel.refresh(); // yeni kabul → Hastalarım
      lastAccepted = accepted;
    } catch (_) {}
  }

  async function send() {
    if (busy || !verifiedDoctor()) return;
    var input = $("vdpInviteInput");
    var ident = (input && input.value || "").trim();
    if (!ident) { msg("Hastanın takma adını ya da e-posta adresini yazın.", "error"); return; }
    if (!navigator.onLine) { msg("İnternet bağlantısı gerekli.", "error"); return; }
    busy = true; var btn = $("vdpInviteBtn"); if (btn) btn.disabled = true;
    try {
      var c = await VitaCloud.getClient();
      var r = await c.rpc("request_patient_access", { p_identifier: ident });
      var d = (r && r.data) || {};
      if (r.error) msg("İstek gönderilemedi. Lütfen tekrar deneyin.", "error");
      else if (!d.ok) msg(REASONS[d.reason] || "İstek gönderilemedi.", "error");
      else {
        msg("İstek gönderildi. Hasta Rapor > Doktorum'da kabul ettiğinde Hastalarım listesine eklenir.", "ok");
        if (input) input.value = "";
        var det = $("vdpRequestsDetails"); if (det) det.open = true;
      }
    } catch (_) { msg("İstek gönderilemedi. İnternet bağlantınızı kontrol edin.", "error"); }
    finally { busy = false; if (btn) btn.disabled = false; }
    await load();
  }

  async function cancel(id) {
    if (busy) return;
    busy = true;
    try {
      var c = await VitaCloud.getClient();
      var r = await c.rpc("cancel_access_request", { p_request: id });
      msg(r && r.data === true ? "İstek geri çekildi." : "Bu istek artık geri çekilemez (yanıtlanmış olabilir).", r && r.data === true ? "info" : "error");
    } catch (_) { msg("İstek geri çekilemedi.", "error"); }
    finally { busy = false; }
    await load();
  }

  function start() { stop(); timer = setInterval(function () { if (viewVisible() && document.visibilityState === "visible") load(); }, POLL_MS); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  document.addEventListener("submit", function (e) { if (e.target && e.target.id === "vdpInviteForm") { e.preventDefault(); send(); } });
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-request-cancel]") : null;
    if (b) cancel(b.getAttribute("data-request-cancel"));
    if (e.target && e.target.closest && e.target.closest("#vdpRefreshBtn")) load();
  });
  document.addEventListener("vita:cloud-profile", function () { lastAccepted = -1; msg(""); if (viewVisible()) load(); else { var box = $("vdpInviteBox"); if (box) box.classList.toggle("hidden", !verifiedDoctor()); } });
  function watch() {
    var view = $("view-doctor"); if (!view || !window.MutationObserver) return;
    var wasHidden = view.classList.contains("hidden");
    new MutationObserver(function () {
      var hidden = view.classList.contains("hidden");
      if (wasHidden && !hidden) { load(); start(); }
      if (!wasHidden && hidden) stop();
      wasHidden = hidden;
    }).observe(view, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();

  window.VitaDoctorInvite = { refresh: load, send: send, cancel: cancel };
})();
