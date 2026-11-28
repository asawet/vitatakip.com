/* VitaTakip — Ayarlar > "Doktorum" (hasta tarafı). Yalnız bulut HASTA hesabında çalışır.
   - Doktor koduyla erişim izni (public.grant_doctor_access; yalnız ONAYLI doktor), izni geri alma (revoke_doctor_access),
     aktif doktorlar (my_doctors), doktorumdan notlar (doctor_notes; yalnız okuma).
   - Doktor yalnız izin veren hastanın seçili kayıtlarını OKUR; bu kural veritabanında (RLS) uygulanır
     (supabase/migrations/20261128120000_doktor_paneli.sql, supabase/tests/doktor_rls_test.sql).
   - Doktor adı ve not metni başka kullanıcıdan gelir: ekrana YALNIZ textContent ile yazılır (HTML olarak değil). */
(function () {
  "use strict";
  var busy = false;
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

  /* Kartın görünür hâli: yerel hesap → not; bulut hasta → içerik; doktor hesabı → kart gizli */
  function updateVisibility() {
    var card = $("settingsSectionDoctors"); if (!card) return;
    var uid = cloudUid();
    var doctor = uid && isDoctorAccount(uid);
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
  function renderNotes(notes) {
    var ul = $("doctorNotesList"); if (!ul) return;
    ul.textContent = "";
    if (!notes.length) { ul.appendChild(el("li", "vdr-empty", "Doktorunuz henüz not yazmadı.")); return; }
    notes.forEach(function (n) {
      var li = el("li", "vdr-note-item");
      li.appendChild(el("div", "vdr-note-head", (n.doctor_label || "Doktor") + " · " + fmtDate(n.created_at)));
      li.appendChild(el("p", "vdr-note-body", n.body || ""));
      ul.appendChild(li);
    });
  }

  async function refresh() {
    updateVisibility();
    var uid = cloudUid();
    if (!uid || isDoctorAccount(uid)) return;
    if (!navigator.onLine) { setMsg("İnternet bağlantısı yok; doktor listesi bağlantı gelince yenilenir.", "info"); return; }
    try {
      var c = await client();
      var res = await Promise.all([
        c.rpc("my_doctors"),
        c.from("doctor_notes").select("id, doctor_label, body, created_at").eq("patient_id", uid).order("created_at", { ascending: false }).limit(50)
      ]);
      if (cloudUid() !== uid) return;
      var doctors = (res[0] && Array.isArray(res[0].data)) ? res[0].data : [];
      var notes = (res[1] && Array.isArray(res[1].data)) ? res[1].data : [];
      renderDoctors(doctors);
      renderNotes(notes);
      setSummary(doctors.length ? doctors.length + " doktor erişebiliyor" + (notes.length ? " · " + notes.length + " not" : "") : "Erişim izni yok");
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
    if (e.target && e.target.id === "doctorAddForm") { e.preventDefault(); grant(($("doctorCodeInput") || {}).value); }
  });
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-doctor-revoke]") : null;
    if (b) revoke(b.getAttribute("data-doctor-revoke"), b.getAttribute("data-doctor-name"));
  });
  document.addEventListener("vita:cloud-session", function () { setMsg(""); refresh(); });
  document.addEventListener("vita:cloud-profile", function () { updateVisibility(); refresh(); });
  window.addEventListener("online", function () { if (cloudUid()) refresh(); });
  // Ayarlar ekranı her görünür olduğunda kart güncellenir (yerel/bulut/doktor hesabı; doktor not yazmış olabilir)
  function watchSettingsView() {
    var view = $("view-settings"); if (!view || !window.MutationObserver) return;
    var wasHidden = view.classList.contains("hidden");
    new MutationObserver(function () {
      var hidden = view.classList.contains("hidden");
      if (wasHidden && !hidden) refresh();
      wasHidden = hidden;
    }).observe(view, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchSettingsView); else watchSettingsView();

  window.VitaDoctors = { refresh: refresh, grant: grant, revoke: revoke, updateVisibility: updateVisibility };
})();
