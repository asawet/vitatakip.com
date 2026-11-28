/* VitaTakip — Rapor > "Doktorum" sekmesi (hasta tarafı). Yalnız bulut HASTA hesabında çalışır.
   - Rapor sayfası iki sekmelidir: Rapor | Doktorum (doktor hesabında Doktorum sekmesi gizli).
   - Yeni doktor notu / doktor yanıtı / erişim isteği için rozet: Doktorum sekmesi, yan menü ve alt menüdeki Rapor.
     "Görüldü" zamanı hesap başına cihazda tutulur; sekme açılınca sıfırlanır.
   - Not yanıtları (note_replies; supabase/migrations/20261128220000_not_yanitlari.sql): izin sürerken hasta yanıt yazar.
   - Doktor koduyla erişim izni (public.grant_doctor_access; yalnız ONAYLI doktor), izni geri alma (revoke_doctor_access),
     aktif doktorlar (my_doctors), doktorumdan notlar (doctor_notes; yalnız okuma).
   - Doktor yalnız izin veren hastanın seçili kayıtlarını OKUR; bu kural veritabanında (RLS) uygulanır
     (supabase/migrations/20261128120000_doktor_paneli.sql, supabase/tests/doktor_rls_test.sql).
   - Onaylı doktor rehberi (verified_doctors: yalnız ad + kod): hasta listeden seçip izin verir (kodla eklemeyle aynı onay).
   - Doktordan gelen erişim istekleri (access_requests; respond_access_request): Kabul et = izin ver, Reddet.
     Bekleyen istek varsa oturumda bir kez bildirim gösterilir (supabase/migrations/20261128200000_doktor_rehberi_davet.sql).
   - Doktor adı ve not metni başka kullanıcıdan gelir: ekrana YALNIZ textContent ile yazılır (HTML olarak değil). */
(function () {
  "use strict";
  var busy = false;
  var directory = [], activeIds = {}, dirQuery = "";
  var announced = {}; // oturumda bildirimi gösterilmiş istekler
  var DIR_LIMIT = 30;
  var reportTab = "report";
  var lastUnread = 0;
  var POLL_MS = 90000;
  var REASONS = {
    bad_code: "Kod biçimi hatalı. Doktorunuzun verdiği kodu \"DR-1234\" biçiminde yazın.",
    not_found: "Bu kodla bir doktor bulunamadı. Kodu doktorunuzdan kontrol edin.",
    not_verified: "Bu doktorun hesabı henüz onaylanmadı. Onaylandıktan sonra tekrar deneyin.",
    self: "Kendinize erişim izni veremezsiniz.",
    unauthorized: "Oturumunuz sona ermiş olabilir. Lütfen tekrar giriş yapın."
  };

  function $(id) { return document.getElementById(id); }
  function cloudUid() { var id = typeof activeUserId !== "undefined" ? activeUserId : null; return window.VitaCloud && VitaCloud.isCloudUserId(id) ? id : null; }
  function isDoctorAccount(uid) { var p = window.VitaCloud && VitaCloud.cachedProfile ? VitaCloud.cachedProfile(uid) : null; return Boolean(p && p.account_type === "doctor"); }
  function fmtDate(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function setMsg(text, tone) {
    var m = $("doctorAddMsg"); if (!m) return;
    m.textContent = text || "";
    m.classList.toggle("hidden", !text);
    m.setAttribute("data-tone", tone || "info");
  }
  function setSummary(text) { var s = $("settingsDoctorsSummary"); if (s) s.textContent = text || ""; }

  /* Görünürlük: bulut hasta → içerik; doktor hesabı → Doktorum sekmesi gizli (doktor Doktor Paneli'ni kullanır) */
  function updateVisibility() {
    var card = $("doctorsPanel"); if (!card) return;
    var uid = cloudUid();
    var doctor = uid && isDoctorAccount(uid);
    var tabBtn = $("reportTabBtnDoctors"); if (tabBtn) tabBtn.classList.toggle("hidden", Boolean(doctor));
    if (doctor && reportTab === "doctors") setReportTab("report");
    card.classList.toggle("hidden", Boolean(doctor) || !(typeof activeUserId !== "undefined" && activeUserId));
    var local = $("doctorsLocalNote"), body = $("doctorsCloudBody");
    if (local) local.classList.toggle("hidden", Boolean(uid));
    if (body) body.classList.toggle("hidden", !uid);
    if (!uid) setSummary("Bulut hesabı gerekir");
  }

  async function client() { return VitaCloud.getClient(); }

  function renderDoctors(list) {
    var ul = $("doctorList"); if (!ul) return;
    ul.textContent = "";
    if (!list.length) { ul.appendChild(el("li", "vdr-empty", "Henüz bir doktora erişim izni vermediniz.")); return; }
    list.forEach(function (d) {
      var li = el("li", "vdr-item");
      var info = el("div", "vdr-info");
      info.appendChild(el("strong", "", d.full_name || "Doktor"));
      info.appendChild(el("small", "", [d.doctor_code || "", d.granted_at ? "İzin: " + fmtDate(d.granted_at) : ""].filter(Boolean).join(" · ")));
      li.appendChild(info);
      var btn = el("button", "vdr-revoke", "İzni geri al");
      btn.type = "button";
      btn.setAttribute("data-doctor-revoke", d.doctor_id);
      btn.setAttribute("data-doctor-name", d.full_name || "Doktor");
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }
  function fmtTime(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  function renderNotes(notes, replies) {
    var ul = $("doctorNotesList"); if (!ul) return;
    ul.textContent = "";
    if (!notes.length) { ul.appendChild(el("li", "vdr-empty", "Doktorunuz henüz not yazmadı.")); return; }
    notes.forEach(function (n) {
      var li = el("li", "vdr-note-item");
      li.setAttribute("data-note-id", n.id);
      li.appendChild(el("div", "vdr-note-head", (n.doctor_label || "Doktor") + " · " + fmtDate(n.created_at)));
      li.appendChild(el("p", "vdr-note-body", n.body || ""));
      var thread = replies.filter(function (r) { return r.note_id === n.id; });
      if (thread.length) {
        var tl = el("ul", "vt-thread");
        thread.forEach(function (r) {
          var it = el("li", "vt-reply" + (r.author_role === "patient" ? " is-mine" : ""));
          it.appendChild(el("span", "vt-reply-who", (r.author_role === "patient" ? "Siz" : (n.doctor_label || "Doktor")) + " · " + fmtTime(r.created_at)));
          it.appendChild(el("span", "vt-reply-body", r.body || ""));
          tl.appendChild(it);
        });
        li.appendChild(tl);
      }
      if (n.doctor_id && activeIds[n.doctor_id]) {
        var f = el("form", "vt-reply-form"); f.setAttribute("data-reply-note", n.id); f.noValidate = true;
        var inp = el("input"); inp.type = "text"; inp.maxLength = 1000; inp.placeholder = "Doktorunuza yanıt yazın"; inp.setAttribute("aria-label", "Nota yanıt");
        var b = el("button", null, "Yanıtla"); b.type = "submit";
        f.appendChild(inp); f.appendChild(b);
        li.appendChild(f);
      } else li.appendChild(el("small", "vt-reply-closed", "Bu doktora erişim izni olmadığı için yanıt yazılamaz."));
      ul.appendChild(li);
    });
  }
  async function sendReply(noteId, input) {
    var uid = cloudUid(); if (!uid || busy) return;
    var body = String(input && input.value || "").trim();
    if (!body) return;
    busy = true; if (input) input.disabled = true;
    try {
      var c = await client();
      var r = await c.from("note_replies").insert({ note_id: noteId, author_id: uid, author_role: "patient", body: body.slice(0, 1000) });
      if (r && r.error) setMsg(String(r.error.code) === "42501" ? "Bu doktora erişim izni olmadığı için yanıt gönderilemedi." : "Yanıt gönderilemedi. Lütfen tekrar deneyin.", "error");
      else { setMsg("Yanıtınız gönderildi.", "ok"); if (input) input.value = ""; }
    } catch (e) { setMsg(VitaCloud.describeError(e).message, "error"); }
    finally { busy = false; if (input) input.disabled = false; }
    await refresh();
  }

  /* ---------------- Rapor | Doktorum sekmeleri ve rozet ---------------- */
  function seenKey(uid) { return "vitatakip_doktorum_gorulme_" + uid; }
  function getSeen(uid) { try { return localStorage.getItem(seenKey(uid)) || ""; } catch (_) { return ""; } }
  function setSeen(uid, iso) { try { localStorage.setItem(seenKey(uid), iso); } catch (_) {} }
  function reportVisible() { var v = $("view-report"); return Boolean(v && !v.classList.contains("hidden")); }
  function setReportTab(t) {
    reportTab = t === "doctors" ? "doctors" : "report";
    Array.prototype.forEach.call(document.querySelectorAll("[data-report-tab]"), function (b) {
      var on = b.getAttribute("data-report-tab") === reportTab;
      b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on ? "true" : "false");
    });
    var rp = $("reportTab-report"), dp = $("reportTab-doctors");
    if (rp) rp.classList.toggle("hidden", reportTab !== "report");
    if (dp) dp.classList.toggle("hidden", reportTab !== "doctors");
    if (reportTab === "doctors") refresh();
  }
  function navBadge(host, n) {
    if (!host) return;
    var b = host.querySelector(".vt-nav-badge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = el("span", "vt-nav-badge"); b.setAttribute("aria-label", n + " yeni"); host.appendChild(b); }
    b.textContent = n > 9 ? "9+" : String(n);
  }
  function setBadge(n) {
    lastUnread = n;
    var tb = $("reportDoctorsBadge"); if (tb) { tb.textContent = n > 9 ? "9+" : String(n); tb.classList.toggle("hidden", !n); }
    navBadge($("drawer-nav-view-report"), n);
    navBadge($("mobile-nav-view-report"), n);
  }
  /* Okunmamış: bekleyen istekler + "görüldü"den sonraki doktor notları ve doktor yanıtları. Doktorum sekmesi açıksa görülmüş sayılır. */
  function updateUnread(uid, requests, notes, replies) {
    var seen = getSeen(uid);
    var items = notes.map(function (n) { return n.created_at; }).concat(replies.filter(function (r) { return r.author_role === "doctor"; }).map(function (r) { return r.created_at; }));
    var newest = items.reduce(function (m, x) { return String(x) > m ? String(x) : m; }, seen);
    if (reportVisible() && reportTab === "doctors") { if (newest) setSeen(uid, newest); setBadge(requests.length); return; }
    var fresh = seen ? items.filter(function (x) { return String(x) > seen; }).length : items.length;
    setBadge(requests.length + fresh);
  }

  /* Onaylı doktor rehberi: arama (ad / kod); izin verilmiş doktor "İzin verildi" olarak görünür */
  function renderDirectory() {
    var ul = $("doctorDirList"); if (!ul) return;
    ul.textContent = "";
    var q = dirQuery;
    var rows = directory.filter(function (d) { return !q || ((d.full_name || "") + " " + (d.doctor_code || "")).toLocaleLowerCase("tr-TR").indexOf(q) !== -1; });
    if (!directory.length) { ul.appendChild(el("li", "vdr-empty", "Şu an listede onaylı doktor yok. Doktorunuzun verdiği kodla ekleyebilirsiniz.")); return; }
    if (!rows.length) { ul.appendChild(el("li", "vdr-empty", "Aramanızla eşleşen onaylı doktor yok.")); return; }
    rows.slice(0, DIR_LIMIT).forEach(function (d) {
      var li = el("li", "vdr-item");
      var info = el("div", "vdr-info");
      info.appendChild(el("strong", "", d.full_name || "Doktor"));
      info.appendChild(el("small", "", d.doctor_code || ""));
      li.appendChild(info);
      if (activeIds[d.id]) li.appendChild(el("span", "vdr-badge", "İzin verildi"));
      else {
        var b = el("button", "vdr-grant", "İzin ver"); b.type = "button";
        b.setAttribute("data-doctor-grant", d.doctor_code || "");
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
    if (rows.length > DIR_LIMIT) ul.appendChild(el("li", "vdr-empty", (rows.length - DIR_LIMIT) + " doktor daha var; aramayı daraltın."));
  }
  /* Doktordan gelen bekleyen erişim istekleri */
  function renderRequests(list) {
    var box = $("doctorRequestsBox"), ul = $("doctorRequestList"); if (!box || !ul) return;
    box.classList.toggle("hidden", !list.length);
    ul.textContent = "";
    list.forEach(function (r) {
      var li = el("li", "vdr-item vdr-request");
      var info = el("div", "vdr-info");
      info.appendChild(el("strong", "", r.doctor_label || "Doktor"));
      info.appendChild(el("small", "", "Kayıtlarınızı görmek için izin istiyor · " + fmtDate(r.created_at)));
      li.appendChild(info);
      var acts = el("div", "vdr-req-actions");
      var ok = el("button", "vdr-grant", "Kabul et"); ok.type = "button"; ok.setAttribute("data-request-accept", r.id); ok.setAttribute("data-doctor-name", r.doctor_label || "Doktor");
      var no = el("button", "vdr-revoke", "Reddet"); no.type = "button"; no.setAttribute("data-request-decline", r.id); no.setAttribute("data-doctor-name", r.doctor_label || "Doktor");
      acts.appendChild(ok); acts.appendChild(no);
      li.appendChild(acts);
      ul.appendChild(li);
    });
  }
  function announce(uid, list) {
    var fresh = list.filter(function (r) { return !announced[uid + r.id]; });
    if (!fresh.length) return;
    fresh.forEach(function (r) { announced[uid + r.id] = true; });
    if (typeof showToast === "function") showToast("Erişim isteği", (fresh.length === 1 ? (fresh[0].doctor_label || "Bir doktor") + " kayıtlarınızı görmek için izin istiyor." : fresh.length + " doktor kayıtlarınızı görmek için izin istiyor.") + " Rapor > Doktorum'dan yanıtlayabilirsiniz.", "info");
  }
  async function respond(id, accept, name) {
    if (!cloudUid() || busy) return;
    if (accept && !window.confirm((name || "Doktor") + "; profil, takviye, ilaç, tahlil, belirti kayıtlarınızı ve doktora notlarınızı görebilecek. Doktor bu kayıtları yalnızca okuyabilir; izni istediğiniz an geri alabilirsiniz. Kabul ediyor musunuz?")) return;
    busy = true;
    try {
      var c = await client();
      var r = await c.rpc("respond_access_request", { p_request: id, p_accept: Boolean(accept) });
      var d = (r && r.data) || {};
      if (r.error || !d.ok) {
        setMsg(d.reason === "not_verified" ? "Bu doktorun onayı kaldırılmış; isteği şu an kabul edemezsiniz." : d.reason === "not_pending" ? "Bu istek artık geçerli değil." : "İstek yanıtlanamadı. Lütfen tekrar deneyin.", "error");
      } else if (accept) {
        setMsg((name || "Doktor") + " artık kayıtlarınızı görebilir.", "ok");
        if (typeof showToast === "function") showToast("Erişim izni verildi", (name || "Doktor") + " kayıtlarınızı yalnızca okuyabilir.", "success");
        if (window.VitaSync) VitaSync.flush();
      } else {
        setMsg((name || "Doktor") + " isteği reddedildi. Bu doktor 7 gün boyunca yeni istek gönderemez.", "info");
      }
    } catch (e) { setMsg(VitaCloud.describeError(e).message, "error"); }
    finally { busy = false; }
    await refresh();
  }

  async function refresh() {
    updateVisibility();
    var uid = cloudUid();
    if (!uid || isDoctorAccount(uid)) { setBadge(0); return; }
    if (!navigator.onLine) { setMsg("İnternet bağlantısı yok; doktor listesi bağlantı gelince yenilenir.", "info"); return; }
    try {
      var c = await client();
      var res = await Promise.all([
        c.rpc("my_doctors"),
        c.from("doctor_notes").select("id, doctor_id, doctor_label, body, created_at").eq("patient_id", uid).order("created_at", { ascending: false }).limit(50),
        c.rpc("verified_doctors"),
        c.from("access_requests").select("id, doctor_label, status, created_at").eq("patient_id", uid)
      ]);
      if (cloudUid() !== uid) return;
      var doctors = (res[0] && Array.isArray(res[0].data)) ? res[0].data : [];
      var notes = (res[1] && Array.isArray(res[1].data)) ? res[1].data : [];
      directory = (res[2] && Array.isArray(res[2].data)) ? res[2].data : [];
      var requests = ((res[3] && Array.isArray(res[3].data)) ? res[3].data : []).filter(function (r) { return r.status === "pending"; })
        .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
      activeIds = {}; doctors.forEach(function (d) { activeIds[d.doctor_id] = true; });
      var replies = [];
      if (notes.length) {
        var rr = await c.from("note_replies").select("id, note_id, author_role, body, created_at").in("note_id", notes.map(function (n) { return n.id; })).order("created_at", { ascending: true });
        replies = (rr && Array.isArray(rr.data)) ? rr.data : [];
        if (cloudUid() !== uid) return;
      }
      renderDoctors(doctors);
      renderNotes(notes, replies);
      updateUnread(uid, requests, notes, replies);
      renderDirectory();
      renderRequests(requests);
      announce(uid, requests);
      setSummary((requests.length ? requests.length + " erişim isteği · " : "") + (doctors.length ? doctors.length + " doktor erişebiliyor" + (notes.length ? " · " + notes.length + " not" : "") : "Erişim izni yok"));
      if (res[0] && res[0].error) setMsg("Doktor listesi alınamadı. Lütfen daha sonra tekrar deneyin.", "error");
    } catch (e) {
      setMsg(window.VitaCloud ? VitaCloud.describeError(e).message : "Doktor listesi alınamadı.", "error");
    }
  }

  async function grant(code) {
    var uid = cloudUid(); if (!uid || busy) return;
    var clean = String(code || "").trim().toUpperCase();
    if (!/^DR-?\d{4,6}$/.test(clean)) { setMsg(REASONS.bad_code, "error"); return; }
    if (!navigator.onLine) { setMsg("İnternet bağlantısı gerekli.", "error"); return; }
    var ok = window.confirm(clean + " kodlu doktora; profil, takviye, ilaç, tahlil, belirti kayıtlarınızı ve doktora notlarınızı görme izni verilecek. Doktor bu kayıtları yalnızca okuyabilir; izni istediğiniz an geri alabilirsiniz. Onaylıyor musunuz?");
    if (!ok) return;
    busy = true; var btn = $("doctorAddBtn"); if (btn) btn.disabled = true;
    try {
      var c = await client();
      var r = await c.rpc("grant_doctor_access", { p_code: clean });
      if (r.error) { setMsg(VitaCloud.describeError(r.error).message, "error"); return; }
      var d = r.data || {};
      if (!d.ok) { setMsg(REASONS[d.reason] || "İzin verilemedi.", "error"); return; }
      setMsg((d.full_name || "Doktorunuz") + " artık kayıtlarınızı görebilir.", "ok");
      var input = $("doctorCodeInput"); if (input) input.value = "";
      if (typeof showToast === "function") showToast("Erişim izni verildi", (d.full_name || "Doktorunuz") + " kayıtlarınızı yalnızca okuyabilir.", "success");
      // Doktorun en güncel veriyi görmesi için bekleyen değişiklikler gönderilir
      if (window.VitaSync) VitaSync.flush();
      await refresh();
    } catch (e) {
      setMsg(VitaCloud.describeError(e).message, "error");
    } finally { busy = false; if (btn) btn.disabled = false; }
  }

  async function revoke(doctorId, name) {
    if (!cloudUid() || busy) return;
    if (!window.confirm((name || "Doktor") + " artık kayıtlarınızı göremeyecek. Yazdığı notlar sizde kalır. İzni geri almak istiyor musunuz?")) return;
    busy = true;
    try {
      var c = await client();
      var r = await c.rpc("revoke_doctor_access", { p_doctor: doctorId });
      if (r.error) { setMsg(VitaCloud.describeError(r.error).message, "error"); return; }
      setMsg((name || "Doktor") + " için erişim izni geri alındı.", "ok");
      if (typeof showToast === "function") showToast("İzin geri alındı", (name || "Doktor") + " artık kayıtlarınızı göremez.", "info");
      await refresh();
    } catch (e) { setMsg(VitaCloud.describeError(e).message, "error"); }
    finally { busy = false; }
  }

  document.addEventListener("submit", function (e) {
    if (e.target && e.target.id === "doctorAddForm") { e.preventDefault(); grant(($("doctorCodeInput") || {}).value); return; }
    var rf = e.target && e.target.getAttribute && e.target.getAttribute("data-reply-note");
    if (rf) { e.preventDefault(); sendReply(rf, e.target.querySelector("input")); }
  });
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var rt = t.closest("[data-report-tab]");
    if (rt) { if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {} setReportTab(rt.getAttribute("data-report-tab")); return; }
    var b = t.closest("[data-doctor-revoke]");
    if (b) { revoke(b.getAttribute("data-doctor-revoke"), b.getAttribute("data-doctor-name")); return; }
    var g = t.closest("[data-doctor-grant]");
    if (g) { grant(g.getAttribute("data-doctor-grant")); return; }
    var a = t.closest("[data-request-accept]");
    if (a) { respond(a.getAttribute("data-request-accept"), true, a.getAttribute("data-doctor-name")); return; }
    var d = t.closest("[data-request-decline]");
    if (d) respond(d.getAttribute("data-request-decline"), false, d.getAttribute("data-doctor-name"));
  });
  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "doctorDirSearch") { dirQuery = e.target.value.trim().toLocaleLowerCase("tr-TR"); renderDirectory(); }
  });
  document.addEventListener("vita:cloud-session", function () { setMsg(""); refresh(); });
  document.addEventListener("vita:cloud-profile", function () { updateVisibility(); refresh(); });
  window.addEventListener("online", function () { if (cloudUid()) refresh(); });
  // Rapor ekranı her görünür olduğunda (Doktorum sekmesi açıksa) liste ve rozet güncellenir
  function watchReportView() {
    var view = $("view-report"); if (!view || !window.MutationObserver) return;
    var wasHidden = view.classList.contains("hidden");
    new MutationObserver(function () {
      var hidden = view.classList.contains("hidden");
      if (wasHidden && !hidden) refresh();
      wasHidden = hidden;
    }).observe(view, { attributes: true, attributeFilter: ["class"] });
    setReportTab("report");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchReportView); else watchReportView();
  // Yeni not / istek rozeti için arada bir kontrol (görünür sekmede, bulut hasta hesabında)
  setInterval(function () { var uid = cloudUid(); if (uid && !isDoctorAccount(uid) && document.visibilityState === "visible" && navigator.onLine) refresh(); }, POLL_MS);

  /* Doktorum sekmesini doğrudan açar (bildirimden / testlerden) */
  function openDoctors() { if (typeof navigateToView === "function") navigateToView("view-report"); setReportTab("doctors"); }

  window.VitaDoctors = { refresh: refresh, grant: grant, revoke: revoke, respond: respond, updateVisibility: updateVisibility, setReportTab: setReportTab, open: openDoctors, unread: function () { return lastUnread; } };
})();
