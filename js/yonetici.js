/* VitaTakip — Yönetici Paneli (VitaAdmin). Sekmeler: Özet · Kullanıcılar · Doktorlar · İşlem kaydı · Rehber.
   - Yan menüde yalnız yönetici bulut hesabında görünür (my_profile.is_admin; önbellekten). Bu yalnız görünümdür:
     asıl yetkiyi sunucu denetler (admin_* fonksiyonları 42501; yonetici-islem Edge Function 403).
   - Yönetici HESAP bilgilerini görür (ad, giriş, tür, tarihler, bulut kayıt sayısı/boyutu, kurtarma kodu var mı);
     sağlık kayıtlarının İÇERİĞİNİ göremez (KVKK).
   - Doktor onayı / onay kaldırma iki dokunuşla; hesap silme giriş bilgisini yazarak onaylanır (yönetici kendini ve
     başka yöneticiyi silemez). Her işlem admin_audit'e yazılır.
   - Tüm metinler textContent ile yazılır (kullanıcıların yazdığı adlar HTML olarak işlenmez).
   Sunucu: supabase/migrations/20261128190000_yonetici_paneli.sql, 20261128210000_yonetici_genisletme.sql,
           supabase/functions/yonetici-islem. */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.classList.toggle("hidden", !on); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function icon(name) { var i = el("i", "fa-solid " + name); i.setAttribute("aria-hidden", "true"); return i; }
  function uid() { return typeof activeUserId !== "undefined" ? activeUserId : null; }
  function fmtDate(v, withTime) {
    if (!v) return "—";
    var d = new Date(v); if (isNaN(d)) return "—";
    var o = { day: "numeric", month: "long", year: "numeric" };
    if (withTime) { o.hour = "2-digit"; o.minute = "2-digit"; }
    return d.toLocaleString("tr-TR", o);
  }
  function ago(v) {
    if (!v) return "Hiç giriş yapmadı";
    var d = new Date(v); if (isNaN(d)) return "—";
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 2) return "Az önce";
    if (m < 60) return m + " dk önce";
    if (m < 1440) return Math.round(m / 60) + " saat önce";
    if (m < 43200) return Math.round(m / 1440) + " gün önce";
    return fmtDate(v);
  }
  function bytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " KB";
    return (n / 1048576).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " MB";
  }
  function lower(s) { return String(s || "").toLocaleLowerCase("tr-TR"); }

  var tab = "overview";
  var stats = null, doctors = [], users = [];
  var filter = "pending", query = "";
  var ufilter = "all", uquery = "";
  var armed = null;        // doktor onayı: ikinci dokunuş bekleyen
  var deleting = null;     // hesap silme: açık onay kutusu (kullanıcı kimliği)
  var loading = false;

  function isAdmin() {
    var id = uid();
    if (!window.VitaCloud || !VitaCloud.isCloudUserId(id)) return false;
    var p = VitaCloud.cachedProfile(id);
    return Boolean(p && p.is_admin === true);
  }

  function updateChrome() {
    var admin = isAdmin();
    show($("drawerSectionAdmin"), admin);
    if (!admin && typeof state !== "undefined" && state.activeTab === "view-admin" && typeof navigateToView === "function") navigateToView("view-home");
    var name = $("vadAdminName");
    if (name) name.textContent = admin ? ((VitaCloud.cachedProfile(uid()) || {}).full_name || (state.user && state.user.name) || "") : "";
  }

  function setMsg(id, text, tone) {
    var m = $(id); if (!m) return;
    m.textContent = text || ""; m.setAttribute("data-tone", tone || "info"); show(m, Boolean(text));
  }
  function denied(err) { return err && String(err.code) === "42501"; }

  /* ---------------- Sekmeler ---------------- */
  function setTab(t) {
    if (t !== tab) { setMsg("vadMsg", ""); setMsg("vadUserMsg", ""); } // eski işlem mesajı başka sekmede kalmasın
    tab = t;
    Array.prototype.forEach.call(document.querySelectorAll("[data-admin-tab]"), function (b) {
      var on = b.getAttribute("data-admin-tab") === t;
      b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    ["overview", "users", "doctors", "audit", "guide"].forEach(function (k) { show($("vadTab-" + k), k === t); });
  }

  /* ---------------- Veri ---------------- */
  async function load(keepMsg) {
    if (loading) return;
    if (!isAdmin()) { renderAll(); return; }
    loading = true;
    var btn = $("vadRefreshBtn"); if (btn) btn.disabled = true;
    try {
      var c = await VitaCloud.getClient();
      var res = await Promise.all([c.rpc("admin_stats"), c.rpc("admin_list_doctors"), c.rpc("admin_list_users"), c.rpc("admin_audit_recent", { p_limit: 40 })]);
      if (res.some(function (r) { return denied(r.error); })) {
        stats = null; doctors = []; users = [];
        setMsg("vadMsg", "Bu ekran yalnız yöneticiler içindir.", "error");
      } else {
        if (!res[0].error) stats = res[0].data || null;
        if (!res[1].error) doctors = Array.isArray(res[1].data) ? res[1].data : [];
        if (!res[2].error) users = Array.isArray(res[2].data) ? res[2].data : [];
        renderAudit(!res[3].error && Array.isArray(res[3].data) ? res[3].data : []);
        if (res.some(function (r) { return r.error; })) setMsg("vadMsg", "Bazı bilgiler alınamadı. İnternet bağlantınızı kontrol edip Yenile'ye dokunun.", "error");
        else if (!keepMsg) setMsg("vadMsg", "");
        var up = $("vadUpdatedAt"); if (up) up.textContent = "Son yenileme: " + new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      }
    } catch (_) {
      setMsg("vadMsg", "Bilgiler alınamadı. İnternet bağlantınızı kontrol edip Yenile'ye dokunun.", "error");
    } finally {
      loading = false;
      if (btn) btn.disabled = false;
    }
    renderAll();
  }
  function renderAll() { renderOverview(); renderDoctors(); renderUsers(); }

  /* ---------------- Özet ---------------- */
  function renderOverview() {
    var grid = $("vadStats"), todo = $("vadTodo"); if (!grid || !todo) return;
    grid.textContent = ""; todo.textContent = "";
    if (!stats) { grid.appendChild(el("p", "vad-empty", "Özet bilgisi yok.")); return; }
    var s = stats;
    var items = [];
    if (s.doctors_pending > 0) items.push(["fa-user-doctor", s.doctors_pending + " doktor onay bekliyor", "Kimliklerini doğrulayıp Doktorlar sekmesinden onaylayın.", "doctors"]);
    if (s.no_recovery_code > 0) items.push(["fa-shield-halved", s.no_recovery_code + " takma ad hesabında kurtarma kodu yok", "Bu kullanıcılar şifrelerini unutursa hesaplarına dönemez; Ayarlar > Veriler ve yedek'ten kod oluşturabilirler.", "users"]);
    if (s.ai_today >= 80) items.push(["fa-robot", "Yapay zekâ günlük kotası doluyor (" + s.ai_today + " / 100)", "Kota dolunca kullanıcılar yerel motora geçer; yarın sıfırlanır.", null]);
    if (!items.length) items.push(["fa-circle-check", "Bekleyen iş yok", "Onay bekleyen doktor ya da dikkat gerektiren durum bulunmuyor.", null]);
    items.forEach(function (it) {
      var li = el(it[3] ? "button" : "div", "vad-todo-item" + (it[3] ? " is-link" : ""));
      if (it[3]) { li.type = "button"; li.setAttribute("data-admin-goto", it[3]); }
      li.appendChild(icon(it[0]));
      var t = el("span", "vad-todo-text"); t.appendChild(el("strong", null, it[1])); t.appendChild(el("small", null, it[2]));
      li.appendChild(t);
      todo.appendChild(li);
    });
    var tiles = [
      ["Toplam hesap", s.users_total, (s.patients || 0) + " hasta · " + ((s.doctors_verified || 0) + (s.doctors_pending || 0)) + " doktor"],
      ["Onaylı doktor", s.doctors_verified, (s.doctors_pending || 0) + " onay bekliyor"],
      ["Yeni kayıt (7 gün)", s.new_7d, (s.new_30d || 0) + " son 30 günde"],
      ["Aktif (7 gün)", s.active_7d, "son 7 günde giriş yapan"],
      ["Doktor–hasta bağlantısı", s.links_active, (s.requests_pending || 0) + " bekleyen istek"],
      ["Doktor notu", s.notes_total, "toplam"],
      ["Bulut verisi", bytes(s.cloud_bytes), (s.cloud_users || 0) + " kullanıcı eşitliyor"],
      ["Yapay zekâ (bugün)", (s.ai_today || 0) + " / 100", (s.ai_users_today || 0) + " kullanıcı"]
    ];
    tiles.forEach(function (t) {
      var d = el("div", "vad-stat");
      d.appendChild(el("span", "vad-stat-label", t[0]));
      d.appendChild(el("strong", "vad-stat-value", t[1] == null ? "—" : t[1]));
      d.appendChild(el("span", "vad-stat-sub", t[2]));
      grid.appendChild(d);
    });
    var badge = $("vadTabBadgeDoctors"); if (badge) { badge.textContent = s.doctors_pending ? String(s.doctors_pending) : ""; show(badge, s.doctors_pending > 0); }
  }

  /* ---------------- Doktorlar ---------------- */
  function matchesDoctor(d) {
    if (filter === "pending" && d.doctor_verified) return false;
    if (filter === "verified" && !d.doctor_verified) return false;
    return !query || lower([d.full_name, d.doctor_code, d.login].join(" ")).indexOf(query) !== -1;
  }
  function renderDoctors() {
    var list = $("vadDoctorList"); if (!list) return;
    var pending = doctors.filter(function (d) { return !d.doctor_verified; }).length;
    [["pending", pending], ["verified", doctors.length - pending], ["all", doctors.length]].forEach(function (x) {
      var b = document.querySelector('[data-admin-filter="' + x[0] + '"]'); if (!b) return;
      var on = filter === x[0];
      b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on ? "true" : "false");
      var n = b.querySelector(".vad-count"); if (n) n.textContent = String(x[1]);
    });
    list.textContent = "";
    var rows = doctors.filter(matchesDoctor);
    if (!rows.length) {
      list.appendChild(el("li", "vad-empty", query ? "Aramanızla eşleşen doktor yok." : filter === "pending" ? "Onay bekleyen doktor yok." : filter === "verified" ? "Henüz onaylı doktor yok." : "Henüz doktor hesabı yok."));
      return;
    }
    rows.forEach(function (d) { list.appendChild(doctorCard(d)); });
  }
  function kvList(pairs) {
    var meta = el("dl", "vad-meta");
    pairs.forEach(function (kv) { var w = el("div", "vad-kv"); w.appendChild(el("dt", null, kv[0])); w.appendChild(el("dd", null, kv[1])); meta.appendChild(w); });
    return meta;
  }
  function doctorCard(d) {
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
    li.appendChild(kvList([["Giriş", d.login || "—"], ["Kayıt", fmtDate(d.created_at)], ["Hekim taahhüdü", d.pledge_at ? fmtDate(d.pledge_at, true) : "Yok"], ["Aktif hasta", String(d.active_patients || 0)]]));
    var actions = el("div", "vad-actions");
    var verify = !d.doctor_verified;
    var btn = el("button", verify ? "vad-btn vad-btn-ok" : "vad-btn vad-btn-off");
    btn.type = "button";
    btn.setAttribute("data-admin-act", verify ? "verify" : "unverify");
    btn.setAttribute("data-admin-target", d.id);
    var isArmed = armed && armed.id === d.id;
    btn.appendChild(icon(verify ? "fa-circle-check" : "fa-ban"));
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
      armed = { id: id, timer: setTimeout(function () { armed = null; renderDoctors(); }, 4000) };
      renderDoctors();
      var again = document.querySelector('[data-admin-target="' + id + '"]'); if (again) try { again.focus(); } catch (_) {}
      return;
    }
    armed = null;
    var d = doctors.find(function (x) { return x.id === id; });
    try {
      var c = await VitaCloud.getClient();
      var res = await c.rpc("admin_set_doctor_verified", { p_doctor: id, p_verified: verify });
      if (res.error || !res.data || res.data.ok !== true) {
        setMsg("vadMsg", denied(res.error) ? "Bu işlem yalnız yöneticiler içindir." : "İşlem tamamlanamadı. Lütfen tekrar deneyin.", "error");
        renderDoctors(); return;
      }
      var label = (d && d.full_name ? d.full_name : "Doktor") + (d && d.doctor_code ? " (" + d.doctor_code + ")" : "");
      setMsg("vadMsg", verify ? label + " onaylandı. Hastalar artık bu kodla izin verebilir." : label + " için onay kaldırıldı; hasta verilerine erişimi kapandı.", "ok");
      if (typeof showToast === "function") showToast(verify ? "Doktor onaylandı" : "Onay kaldırıldı", label, verify ? "success" : "info");
    } catch (_) {
      setMsg("vadMsg", "İşlem tamamlanamadı. İnternet bağlantınızı kontrol edin.", "error");
    }
    await load(true);
  }

  /* ---------------- Kullanıcılar ---------------- */
  function matchesUser(u) {
    if (ufilter === "patient" && u.account_type !== "patient") return false;
    if (ufilter === "doctor" && u.account_type !== "doctor") return false;
    return !uquery || lower([u.full_name, u.login, u.doctor_code].join(" ")).indexOf(uquery) !== -1;
  }
  function renderUsers() {
    var list = $("vadUserList"); if (!list) return;
    var counts = { all: users.length, patient: 0, doctor: 0 };
    users.forEach(function (u) { if (counts[u.account_type] != null) counts[u.account_type]++; });
    Object.keys(counts).forEach(function (k) {
      var b = document.querySelector('[data-admin-ufilter="' + k + '"]'); if (!b) return;
      var on = ufilter === k;
      b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on ? "true" : "false");
      var n = b.querySelector(".vad-count"); if (n) n.textContent = String(counts[k]);
    });
    list.textContent = "";
    var rows = users.filter(matchesUser);
    if (!rows.length) { list.appendChild(el("li", "vad-empty", uquery ? "Aramanızla eşleşen kullanıcı yok." : "Bu süzgeçte kullanıcı yok.")); return; }
    rows.forEach(function (u) { list.appendChild(userCard(u)); });
  }
  function userCard(u) {
    var li = el("li", "vad-card");
    li.setAttribute("data-user-id", u.id);
    var head = el("div", "vad-card-head");
    var who = el("div", "vad-who");
    who.appendChild(el("strong", "vad-name", u.full_name || "(adsız)"));
    who.appendChild(el("span", "vad-code", u.login || "—"));
    head.appendChild(who);
    var tags = el("div", "vad-tags");
    var type = el("span", "vad-tag", u.account_type === "doctor" ? "Doktor" + (u.doctor_verified ? "" : " · onay bekliyor") : "Hasta");
    type.setAttribute("data-tone", u.account_type === "doctor" ? (u.doctor_verified ? "doc" : "wait") : "pat");
    tags.appendChild(type);
    if (u.is_admin) { var a = el("span", "vad-tag", "Yönetici"); a.setAttribute("data-tone", "admin"); tags.appendChild(a); }
    if (u.id === uid()) { var me = el("span", "vad-tag", "Siz"); me.setAttribute("data-tone", "me"); tags.appendChild(me); }
    head.appendChild(tags);
    li.appendChild(head);
    var pairs = [["Kayıt", fmtDate(u.created_at)], ["Son giriş", ago(u.last_sign_in_at)],
      ["Bulut verisi", u.store_count ? u.store_count + " kayıt türü · " + bytes(u.data_bytes) : "Yok"],
      [u.account_type === "doctor" ? "Aktif hasta" : "İzin verdiği doktor", String(u.links_active || 0)]];
    if (u.username_account) pairs.push(["Kurtarma kodu", u.has_recovery_code ? "Var" : "Yok"]);
    li.appendChild(kvList(pairs));
    if (u.is_admin || u.id === uid()) return li; // yönetici (ve kendisi) silinemez
    if (deleting === u.id) li.appendChild(deleteBox(u));
    else {
      var actions = el("div", "vad-actions");
      var b = el("button", "vad-btn vad-btn-off"); b.type = "button";
      b.setAttribute("data-admin-delete", u.id);
      b.appendChild(icon("fa-trash-can")); b.appendChild(el("span", null, "Hesabı sil"));
      actions.appendChild(b);
      li.appendChild(actions);
    }
    return li;
  }
  function deleteBox(u) {
    var box = el("div", "vad-delete");
    box.appendChild(el("p", "vad-delete-warn", "Bu hesap; profili, buluttaki tüm kayıtları, doktor bağlantıları ve istekleriyle birlikte KALICI olarak silinir. Geri alınamaz. Kullanıcının cihazındaki yerel kopya bu işlemle silinmez."));
    var lab = el("label", "vad-delete-label", "Onaylamak için giriş bilgisini yazın: ");
    lab.appendChild(el("strong", null, u.login || ""));
    lab.setAttribute("for", "vadDeleteConfirm");
    box.appendChild(lab);
    var inp = el("input", "vad-delete-input"); inp.id = "vadDeleteConfirm"; inp.type = "text"; inp.autocomplete = "off"; inp.spellcheck = false;
    inp.setAttribute("autocapitalize", "none");
    // Giriş bilgisi (e-posta / takma ad) ASCII: dilden bağımsız küçük harf (Türkçe kuralı "I"yı "ı" yapar; sunucu da böyle karşılaştırır)
    inp.setAttribute("data-expected", String(u.login || "").toLowerCase().replace(/^@/, ""));
    box.appendChild(inp);
    var note = el("input", "vad-delete-input"); note.id = "vadDeleteNote"; note.type = "text"; note.maxLength = 300;
    note.placeholder = "Gerekçe (isteğe bağlı, ör. KVKK silme talebi)";
    note.setAttribute("aria-label", "Silme gerekçesi");
    box.appendChild(note);
    var acts = el("div", "vad-actions");
    var go = el("button", "vad-btn vad-btn-danger"); go.type = "button"; go.id = "vadDeleteGo"; go.disabled = true;
    go.setAttribute("data-admin-delete-go", u.id);
    go.appendChild(icon("fa-trash-can")); go.appendChild(el("span", null, "Kalıcı olarak sil"));
    var cancel = el("button", "vad-btn vad-btn-plain", "Vazgeç"); cancel.type = "button"; cancel.setAttribute("data-admin-delete-cancel", "1");
    acts.appendChild(go); acts.appendChild(cancel);
    box.appendChild(acts);
    setTimeout(function () { try { inp.focus(); } catch (_) {} }, 0);
    return box;
  }
  async function deleteUser(id) {
    var u = users.find(function (x) { return x.id === id; }); if (!u) return;
    var confirmText = (($("vadDeleteConfirm") || {}).value || "").trim();
    var note = (($("vadDeleteNote") || {}).value || "").trim();
    var go = $("vadDeleteGo"); if (go) go.disabled = true;
    try {
      var c = await VitaCloud.getClient();
      var res = await c.functions.invoke("yonetici-islem", { method: "POST", body: { action: "delete_user", user_id: id, confirm: confirmText, note: note } });
      var reason = res.data && res.data.error;
      if (res.error) { try { var ctx = res.error.context; if (ctx && typeof ctx.json === "function") reason = (await ctx.json()).error; } catch (_) {} }
      if (res.error || !res.data || res.data.ok !== true) {
        var M = { forbidden: "Bu işlem yalnız yöneticiler içindir.", self: "Kendi hesabınızı buradan silemezsiniz.", target_admin: "Yönetici hesapları silinemez.",
          confirm_mismatch: "Giriş bilgisi eşleşmedi; silinmedi.", not_found: "Hesap bulunamadı (daha önce silinmiş olabilir)." };
        setMsg("vadUserMsg", M[reason] || "Hesap silinemedi. Lütfen tekrar deneyin.", "error");
        if (go) go.disabled = false;
        return;
      }
      deleting = null;
      setMsg("vadUserMsg", (u.full_name || "Kullanıcı") + " (" + u.login + ") hesabı ve buluttaki tüm kayıtları silindi.", "ok");
      if (typeof showToast === "function") showToast("Hesap silindi", (u.full_name || "Kullanıcı") + " (" + u.login + ")", "info");
    } catch (_) {
      setMsg("vadUserMsg", "Hesap silinemedi. İnternet bağlantınızı kontrol edin.", "error");
      if (go) go.disabled = false;
      return;
    }
    await load(true);
  }

  /* ---------------- İşlem kaydı ---------------- */
  var ACTION_TEXT = { doctor_verify: " onayladı: ", doctor_unverify: " onayı kaldırdı: ", user_delete: " hesabı sildi: " };
  function renderAudit(rows) {
    var ul = $("vadAuditList"); if (!ul) return;
    ul.textContent = "";
    if (!rows.length) { ul.appendChild(el("li", "vad-empty", "Henüz işlem yok.")); return; }
    rows.forEach(function (a) {
      var li = el("li", "vad-audit-row");
      li.setAttribute("data-action", a.action);
      li.appendChild(el("span", "vad-audit-time", fmtDate(a.at, true)));
      li.appendChild(el("span", null, (a.admin_label || "Yönetici") + (ACTION_TEXT[a.action] || " işlem: ") + (a.target_label || "—")));
      if (a.note) li.appendChild(el("span", "vad-audit-note", "Gerekçe: " + a.note));
      ul.appendChild(li);
    });
  }

  /* ---------------- Olaylar ---------------- */
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var tb = t.closest("[data-admin-tab]"); if (tb) { setTab(tb.getAttribute("data-admin-tab")); return; }
    var gt = t.closest("[data-admin-goto]"); if (gt) { setTab(gt.getAttribute("data-admin-goto")); return; }
    var f = t.closest("[data-admin-filter]"); if (f) { filter = f.getAttribute("data-admin-filter"); armed = null; renderDoctors(); return; }
    var uf = t.closest("[data-admin-ufilter]"); if (uf) { ufilter = uf.getAttribute("data-admin-ufilter"); renderUsers(); return; }
    var a = t.closest("[data-admin-act]");
    if (a) { if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {} act(a.getAttribute("data-admin-target"), a.getAttribute("data-admin-act") === "verify"); return; }
    var del = t.closest("[data-admin-delete]"); if (del) { deleting = del.getAttribute("data-admin-delete"); setMsg("vadUserMsg", ""); renderUsers(); return; }
    var go = t.closest("[data-admin-delete-go]"); if (go) { deleteUser(go.getAttribute("data-admin-delete-go")); return; }
    if (t.closest("[data-admin-delete-cancel]")) { deleting = null; renderUsers(); return; }
    if (t.closest("#vadRefreshBtn")) { load(false); }
  });
  document.addEventListener("input", function (e) {
    var id = e.target && e.target.id;
    if (id === "vadSearch") { query = lower(e.target.value.trim()); renderDoctors(); }
    else if (id === "vadUserSearch") { uquery = lower(e.target.value.trim()); deleting = null; renderUsers(); }
    else if (id === "vadDeleteConfirm") {
      var ok = e.target.value.trim().toLowerCase().replace(/^@/, "") === e.target.getAttribute("data-expected");
      var go = $("vadDeleteGo"); if (go) go.disabled = !ok;
    }
  });
  document.addEventListener("vita:cloud-profile", updateChrome);
  document.addEventListener("vita:cloud-session", updateChrome);

  function watchView() {
    var view = $("view-admin"); if (!view || !window.MutationObserver) return;
    var wasHidden = view.classList.contains("hidden");
    new MutationObserver(function () {
      var hidden = view.classList.contains("hidden");
      if (wasHidden && !hidden) { updateChrome(); load(false); }
      if (!wasHidden && hidden) { deleting = null; armed = null; }
      wasHidden = hidden;
    }).observe(view, { attributes: true, attributeFilter: ["class"] });
  }
  function boot() { watchView(); updateChrome(); setTab(tab); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.VitaAdmin = { updateChrome: updateChrome, refresh: load, isAdmin: isAdmin, setTab: setTab };
})();
