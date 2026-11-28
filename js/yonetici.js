/* VitaTakip — Yönetici Paneli (VitaAdmin): doktor hesaplarını onaylama / onayı kaldırma.
   - Yan menüde "Yönetici Paneli" yalnız yönetici bulut hesabında görünür (my_profile.is_admin; önbellekten).
     Bu yalnız görünüm içindir: asıl yetkiyi sunucu denetler (admin_* fonksiyonları, 42501;
     supabase/migrations/20261128190000_yonetici_paneli.sql).
   - Doktorlar: Onay bekleyen / Onaylı / Tümü süzgeci + arama (ad, kod, e-posta / takma ad).
   - "Onayla" / "Onayı kaldır" ikinci dokunuşla gerçekleşir (4 sn içinde "Emin misiniz?"); her işlem denetim kaydına yazılır.
   - Tüm metinler textContent ile yazılır (doktorun yazdığı ad HTML olarak işlenmez). */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.classList.toggle("hidden", !on); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function uid() { return typeof activeUserId !== "undefined" ? activeUserId : null; }
  function fmtDate(v, withTime) {
    if (!v) return "—";
    var d = new Date(v); if (isNaN(d)) return "—";
    var o = { day: "numeric", month: "long", year: "numeric" };
    if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; }
    return d.toLocaleString("tr-TR", o);
  }

  var doctors = [];
  var filter = "pending";
  var query = "";
  var armed = null; // { id, verify, timer } — ikinci dokunuş bekleyen düğme
  var loading = false;

  function isAdmin() {
    var id = uid();
    if (!window.VitaCloud || !VitaCloud.isCloudUserId(id)) return false;
    var p = VitaCloud.cachedProfile(id);
    return Boolean(p && p.is_admin === true);
  }

  /* Yan menü + ekran üstü */
  function updateChrome() {
    var admin = isAdmin();
    show($("drawerSectionAdmin"), admin);
    if (!admin && typeof state !== "undefined" && state.activeTab === "view-admin" && typeof navigateToView === "function") navigateToView("view-home");
    var name = $("vadAdminName");
    if (name) name.textContent = admin ? ((VitaCloud.cachedProfile(uid()) || {}).full_name || (state.user && state.user.name) || "") : "";
  }

  function setMsg(text, tone) {
    var m = $("vadMsg"); if (!m) return;
    m.textContent = text || ""; m.setAttribute("data-tone", tone || "info"); show(m, Boolean(text));
  }

  async function load(keepMsg) { // keepMsg: işlem sonrası yenilemede sonuç mesajı silinmez
    if (loading) return;
    if (!isAdmin()) { render(); return; }
    loading = true;
    var btn = $("vadRefreshBtn"); if (btn) btn.disabled = true;
    try {
      var c = await VitaCloud.getClient();
      var res = await c.rpc("admin_list_doctors");
      if (res.error) {
        doctors = [];
        setMsg(String(res.error.code) === "42501" ? "Bu ekran yalnız yöneticiler içindir." : "Doktor listesi alınamadı. İnternet bağlantınızı kontrol edip Yenile'ye dokunun.", "error");
      } else {
        doctors = Array.isArray(res.data) ? res.data : [];
        if (!keepMsg) setMsg("");
        var up = $("vadUpdatedAt"); if (up) up.textContent = "Son yenileme: " + new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      }
    } catch (_) {
      setMsg("Doktor listesi alınamadı. İnternet bağlantınızı kontrol edip Yenile'ye dokunun.", "error");
    } finally {
      loading = false;
      if (btn) btn.disabled = false;
    }
    render();
    loadAudit();
  }

  function matches(d) {
    if (filter === "pending" && d.doctor_verified) return false;
    if (filter === "verified" && !d.doctor_verified) return false;
    if (!query) return true;
    var hay = [d.full_name, d.doctor_code, d.login].join(" ").toLocaleLowerCase("tr-TR");
    return hay.indexOf(query) !== -1;
  }

  function render() {
    var list = $("vadDoctorList"); if (!list) return;
    var pending = doctors.filter(function (d) { return !d.doctor_verified; }).length;
    var verified = doctors.length - pending;
    [["pending", pending], ["verified", verified], ["all", doctors.length]].forEach(function (x) {
      var b = document.querySelector('[data-admin-filter="' + x[0] + '"]'); if (!b) return;
      var on = filter === x[0];
      b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on ? "true" : "false");
      var n = b.querySelector(".vad-count"); if (n) n.textContent = String(x[1]);
    });
    list.textContent = "";
    var rows = doctors.filter(matches);
    if (!rows.length) {
      var empty = el("li", "vad-empty",
        query ? "Aramanızla eşleşen doktor yok."
        : filter === "pending" ? "Onay bekleyen doktor yok."
        : filter === "verified" ? "Henüz onaylı doktor yok." : "Henüz doktor hesabı yok.");
      list.appendChild(empty);
      return;
    }
    rows.forEach(function (d) { list.appendChild(card(d)); });
  }

  function card(d) {
    var li = el("li", "vad-card");
    li.setAttribute("data-doctor-id", d.id);
    var head = el("div", "vad-card-head");
    var who = el("div", "vad-who");
    who.appendChild(el("strong", "vad-name", d.full_name || "(adsız)"));
    who.appendChild(el("span", "vad-code", d.doctor_code || "—"));
    head.appendChild(who);
    var badge = el("span", "vdp-badge", d.doctor_verified ? "Onaylı" : "Onay bekliyor");
    badge.setAttribute("data-tone", d.doctor_verified ? "ok" : "wait");
    head.appendChild(badge);
    li.appendChild(head);

    var meta = el("dl", "vad-meta");
    [["Giriş", d.login || "—"], ["Kayıt", fmtDate(d.created_at)], ["Hekim taahhüdü", d.pledge_at ? fmtDate(d.pledge_at, true) : "Yok"],
     ["Aktif hasta", String(d.active_patients || 0)]].forEach(function (kv) {
      var w = el("div", "vad-kv"); w.appendChild(el("dt", null, kv[0])); w.appendChild(el("dd", null, kv[1])); meta.appendChild(w);
    });
    li.appendChild(meta);

    var actions = el("div", "vad-actions");
    var verify = !d.doctor_verified;
    var btn = el("button", verify ? "vad-btn vad-btn-ok" : "vad-btn vad-btn-off");
    btn.type = "button";
    btn.setAttribute("data-admin-act", verify ? "verify" : "unverify");
    btn.setAttribute("data-admin-target", d.id);
    var isArmed = armed && armed.id === d.id;
    var ico = el("i", "fa-solid " + (verify ? "fa-circle-check" : "fa-ban")); ico.setAttribute("aria-hidden", "true");
    btn.appendChild(ico);
    btn.appendChild(el("span", null, isArmed ? (verify ? "Emin misiniz? Onayla" : "Emin misiniz? Onayı kaldır") : (verify ? "Onayla" : "Onayı kaldır")));
    if (isArmed) btn.classList.add("is-armed");
    actions.appendChild(btn);
    if (!verify && d.active_patients > 0) actions.appendChild(el("span", "vad-note", "Onay kaldırılırsa " + d.active_patients + " hastanın verisini göremez."));
    li.appendChild(actions);
    return li;
  }

  async function act(id, verify) {
    if (armed && armed.timer) clearTimeout(armed.timer);
    if (!armed || armed.id !== id) {
      armed = { id: id, verify: verify, timer: setTimeout(function () { armed = null; render(); }, 4000) };
      render();
      var again = document.querySelector('[data-admin-target="' + id + '"]'); if (again) try { again.focus(); } catch (_) {}
      return;
    }
    armed = null;
    var d = doctors.find(function (x) { return x.id === id; });
    try {
      var c = await VitaCloud.getClient();
      var res = await c.rpc("admin_set_doctor_verified", { p_doctor: id, p_verified: verify });
      if (res.error || !res.data || res.data.ok !== true) {
        setMsg(res.error && String(res.error.code) === "42501" ? "Bu işlem yalnız yöneticiler içindir." : "İşlem tamamlanamadı. Lütfen tekrar deneyin.", "error");
        render(); return;
      }
      var label = (d && d.full_name ? d.full_name : "Doktor") + (d && d.doctor_code ? " (" + d.doctor_code + ")" : "");
      setMsg(verify ? label + " onaylandı. Hastalar artık bu kodla izin verebilir." : label + " için onay kaldırıldı; hasta verilerine erişimi kapandı.", "ok");
      if (typeof showToast === "function") showToast(verify ? "Doktor onaylandı" : "Onay kaldırıldı", label, verify ? "success" : "info");
    } catch (_) {
      setMsg("İşlem tamamlanamadı. İnternet bağlantınızı kontrol edin.", "error");
    }
    await load(true);
  }

  async function loadAudit() {
    var ul = $("vadAuditList"); if (!ul || !isAdmin()) return;
    try {
      var c = await VitaCloud.getClient();
      var res = await c.rpc("admin_audit_recent", { p_limit: 15 });
      ul.textContent = "";
      var rows = (!res.error && Array.isArray(res.data)) ? res.data : [];
      if (!rows.length) { ul.appendChild(el("li", "vad-empty", "Henüz işlem yok.")); return; }
      rows.forEach(function (a) {
        var li = el("li", "vad-audit-row");
        li.appendChild(el("span", "vad-audit-time", fmtDate(a.at, true)));
        li.appendChild(el("span", null, (a.admin_label || "Yönetici") + (a.action === "doctor_verify" ? " onayladı: " : " onayı kaldırdı: ") + (a.target_label || "—")));
        ul.appendChild(li);
      });
    } catch (_) {}
  }

  /* Olaylar */
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var f = t.closest("[data-admin-filter]");
    if (f) { filter = f.getAttribute("data-admin-filter"); armed = null; render(); return; }
    var a = t.closest("[data-admin-act]");
    if (a) { if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {} act(a.getAttribute("data-admin-target"), a.getAttribute("data-admin-act") === "verify"); return; }
    if (t.closest("#vadRefreshBtn")) { load(false); }
  });
  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "vadSearch") { query = e.target.value.trim().toLocaleLowerCase("tr-TR"); render(); }
  });
  document.addEventListener("vita:cloud-profile", updateChrome);
  document.addEventListener("vita:cloud-session", updateChrome);

  function watchView() {
    var view = $("view-admin"); if (!view || !window.MutationObserver) return;
    var wasHidden = view.classList.contains("hidden");
    new MutationObserver(function () {
      var hidden = view.classList.contains("hidden");
      if (wasHidden && !hidden) { updateChrome(); load(false); }
      wasHidden = hidden;
    }).observe(view, { attributes: true, attributeFilter: ["class"] });
  }
  function boot() { watchView(); updateChrome(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.VitaAdmin = { updateChrome: updateChrome, refresh: load, isAdmin: isAdmin };
})();
