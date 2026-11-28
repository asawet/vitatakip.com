/* VitaTakip — Doktor Paneli (view-doctor). Yalnız bulut DOKTOR hesabında.
   - Hastalarım: public.my_patients() (yalnız ONAYLI doktor + aktif izin). 30 sn'de bir ve "Yenile" ile.
   - Hasta ayrıntısı: user_stores (RLS: yalnız izin veren hastanın seçili türleri: profil, takviye, ilaç, tahlil, belirti,
     doktora notlar) — YALNIZ OKUMA. Doktor notları: doctor_notes (yalnız kendi notları; yazma/silme).
   - Erişim kuralları veritabanındadır (supabase/migrations/*doktor_paneli*.sql; testler supabase/tests/doktor_rls_test.sql).
   - Hastadan gelen her metin (ad, takviye/ilaç adı, not…) ekrana YALNIZ textContent ile yazılır (HTML değil). */
(function () {
  "use strict";
  var POLL_MS = 30000;
  var pollTimer = null;
  var selected = null;        // { id, full_name }
  var lastPatients = [];
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
  function cloudUid() { var id = typeof activeUserId !== "undefined" ? activeUserId : null; return window.VitaCloud && VitaCloud.isCloudUserId(id) ? id : null; }
  function profile() { var uid = cloudUid(); return uid && VitaCloud.cachedProfile ? VitaCloud.cachedProfile(uid) : null; }
  function isDoctor() { var p = profile(); return Boolean(p && p.account_type === "doctor"); }
  function viewVisible() { var v = $("view-doctor"); return Boolean(v && !v.classList.contains("hidden")); }
  function fmtDate(iso, withTime) {
    var d = new Date(iso); if (isNaN(d)) return "";
    return d.toLocaleString("tr-TR", withTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "long", year: "numeric" });
  }
  function rel(iso) {
    var t = Date.parse(iso || ""); if (isNaN(t)) return "henüz eşitleme yok";
    var m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? "az önce güncellendi" : m < 60 ? m + " dk önce güncellendi" : m < 1440 ? Math.round(m / 60) + " sa önce güncellendi" : Math.round(m / 1440) + " gün önce güncellendi";
  }
  function decode(row) {
    var d = row && row.data; if (!d || typeof d !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(d, "v")) return d.v;
    if (Object.prototype.hasOwnProperty.call(d, "t")) return String(d.t);
    return null;
  }

  /* ---------------- Başlık, menü, görünürlük ---------------- */
  function updateChrome() {
    var doctor = isDoctor();
    var sec = $("drawerSectionDoctor"); if (sec) sec.classList.toggle("hidden", !doctor);
    if (!doctor) { stopPolling(); return; }
    var p = profile() || {};
    if ($("vdpDoctorName")) $("vdpDoctorName").textContent = p.full_name || "";
    if ($("vdpDoctorCode")) $("vdpDoctorCode").textContent = p.doctor_code || "—";
    var badge = $("vdpVerifiedBadge");
    if (badge) { badge.textContent = p.doctor_verified ? "Onaylı" : "Onay bekliyor"; badge.setAttribute("data-tone", p.doctor_verified ? "ok" : "wait"); }
    if ($("vdpPendingNote")) $("vdpPendingNote").classList.toggle("hidden", Boolean(p.doctor_verified));
  }

  /* ---------------- Hasta listesi ---------------- */
  function renderPatients(list) {
    var ul = $("vdpPatientList"); if (!ul) return;
    ul.textContent = "";
    if (!list.length) {
      ul.appendChild(el("li", "vdp-empty", (profile() || {}).doctor_verified ? "Henüz size erişim izni veren hasta yok." : "Hesabınız onaylanınca hastalarınız burada görünecek."));
      return;
    }
    list.forEach(function (pt) {
      var li = el("li");
      var btn = el("button", "vdp-patient" + (selected && selected.id === pt.patient_id ? " is-active" : ""));
      btn.type = "button";
      btn.setAttribute("data-patient-id", pt.patient_id);
      var av = el("span", "vdp-avatar", String(pt.full_name || "?").trim().charAt(0).toLocaleUpperCase("tr-TR") || "?");
      var info = el("span", "vdp-pinfo");
      info.appendChild(el("strong", "", pt.full_name || "Adsız hasta"));
      info.appendChild(el("small", "", rel(pt.last_update)));
      btn.appendChild(av); btn.appendChild(info);
      btn.appendChild(el("i", "fa-solid fa-chevron-right"));
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  async function loadPatients() {
    if (!isDoctor() || !navigator.onLine) { if (!navigator.onLine && $("vdpUpdatedAt")) $("vdpUpdatedAt").textContent = "Çevrimdışı: liste bağlantı gelince yenilenir."; return; }
    try {
      var c = await VitaCloud.getClient();
      var r = await c.rpc("my_patients");
      if (r.error) throw r.error;
      lastPatients = Array.isArray(r.data) ? r.data : [];
      renderPatients(lastPatients);
      if ($("vdpUpdatedAt")) $("vdpUpdatedAt").textContent = "Son yenileme: " + new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      // Seçili hastanın izni geri alındıysa ayrıntı kapanır
      if (selected && !lastPatients.some(function (p) { return p.patient_id === selected.id; })) {
        closeDetail();
        if (typeof showToast === "function") showToast("Erişim sona erdi", "Hasta erişim iznini geri aldı; kayıtları artık görüntülenemiyor.", "info");
      } else if (selected) { loadDetail(selected.id, true); }
    } catch (e) {
      if ($("vdpUpdatedAt")) $("vdpUpdatedAt").textContent = VitaCloud.describeError(e).message;
    }
  }

  /* ---------------- Hasta ayrıntısı (yalnız okuma) ---------------- */
  function section(title, icon) {
    var s = el("div", "vdp-section");
    var h = el("h4"); var i = el("i", "fa-solid " + icon); i.setAttribute("aria-hidden", "true");
    h.appendChild(i); h.appendChild(document.createTextNode(" " + title));
    s.appendChild(h);
    return s;
  }
  function labName(key) { try { var m = typeof VITA_LAB_APP_REFERENCE_META !== "undefined" ? VITA_LAB_APP_REFERENCE_META[key] : null; return m ? m : null; } catch (_) { return null; } }
  function symptomName(key) {
    try { var d = typeof ANAMNESIS_DICTIONARY !== "undefined" ? ANAMNESIS_DICTIONARY[key] : null; return d ? (d.symptomName || d.medicalName || d.question || key) : key; } catch (_) { return key; }
  }
  function kv(dl, k, v) { if (v === undefined || v === null || v === "") return; dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", v)); }

  function renderDetail(pt, stores, updatedAt) {
    var box = $("vdpDetail"); if (!box) return;
    box.textContent = "";
    var u = stores.user || {};
    var head = el("div", "vdp-detail-head");
    head.appendChild(el("h3", "", pt.full_name || u.name || "Hasta"));
    head.appendChild(el("p", "", rel(updatedAt)));
    box.appendChild(head);

    var prof = section("Profil", "fa-id-card");
    var dl = el("dl", "vdp-kv");
    kv(dl, "Yaş", u.age ? u.age + " yaş" : "");
    kv(dl, "Cinsiyet", u.gender === "E" ? "Erkek" : u.gender === "K" ? "Kadın" : "");
    kv(dl, "Boy / Kilo", u.height && u.weight ? u.height + " cm · " + u.weight + " kg" : "");
    kv(dl, "VKİ", u.bmi ? u.bmi + (u.bmiCategory ? " (" + u.bmiCategory + ")" : "") : "");
    kv(dl, "Kronik durumlar", Array.isArray(u.chronic) && u.chronic.length ? u.chronic.join(", ") : "");
    if (u.profileCompleted === false) prof.appendChild(el("p", "vdp-muted", "Hasta profilini henüz tamamlamadı."));
    prof.appendChild(dl); box.appendChild(prof);

    var sup = section("Takviyeler", "fa-capsules");
    var sups = Array.isArray(stores.supplements) ? stores.supplements : [];
    if (!sups.length) sup.appendChild(el("p", "vdp-muted", "Kayıtlı takviye yok."));
    else {
      var ul = el("ul", "vdp-rows");
      sups.forEach(function (s) {
        var li = el("li");
        li.appendChild(el("strong", "", s.name || "Takviye"));
        li.appendChild(el("span", "", [s.scheduleTime || s.timing || "", String(s.doseText || "").split(" • ")[0], s.aclikDurumu || ""].filter(Boolean).join(" · ")));
        ul.appendChild(li);
      });
      sup.appendChild(ul);
    }
    box.appendChild(sup);

    var med = section("İlaçlar", "fa-prescription-bottle-medical");
    var meds = Array.isArray(stores.medications) ? stores.medications : [];
    if (!meds.length) med.appendChild(el("p", "vdp-muted", "Kayıtlı ilaç yok."));
    else {
      var ulm = el("ul", "vdp-rows");
      meds.forEach(function (m) {
        var li = el("li");
        li.appendChild(el("strong", "", m.name || "İlaç"));
        li.appendChild(el("span", "", [Array.isArray(m.clocks) && m.clocks.length ? m.clocks.join(", ") : "", m.dose && m.unit ? m.dose + " " + m.unit : "", m.aclikDurumu || ""].filter(Boolean).join(" · ")));
        ulm.appendChild(li);
      });
      med.appendChild(ulm);
    }
    box.appendChild(med);

    var lab = section("Tahliller", "fa-flask-vial");
    var hist = Array.isArray(stores.labhistory) ? stores.labhistory.slice().sort(function (a, b) { return Number(b.timestamp || 0) - Number(a.timestamp || 0); }) : [];
    if (!hist.length) lab.appendChild(el("p", "vdp-muted", "Kayıtlı tahlil yok."));
    else {
      var latest = hist[0];
      lab.appendChild(el("p", "vdp-sub", "Son tahlil: " + (latest.date ? fmtDate(latest.date + "T12:00:00") : "tarih yok") + (hist.length > 1 ? " · toplam " + hist.length + " kayıt" : "")));
      var table = el("table", "vdp-table");
      var thead = el("thead"); var trh = el("tr");
      ["Test", "Değer", "Referans"].forEach(function (h) { trh.appendChild(el("th", "", h)); });
      thead.appendChild(trh); table.appendChild(thead);
      var tb = el("tbody"); var rows = 0;
      var refs = latest.references && typeof latest.references === "object" ? latest.references : {};
      Object.keys(latest).forEach(function (k) {
        var meta = labName(k); var v = latest[k];
        if (!meta || v === null || v === undefined || v === "" || typeof v === "object") return;
        var prev = hist.slice(1).find(function (r) { return r[k] !== undefined && r[k] !== null && r[k] !== ""; });
        var tr = el("tr");
        tr.appendChild(el("td", "", meta.name));
        var td = el("td", "", v + " " + (meta.unit || ""));
        if (prev) td.appendChild(el("small", "vdp-prev", " (önceki " + prev[k] + ")"));
        tr.appendChild(td);
        tr.appendChild(el("td", "vdp-muted", (refs[k] || meta.value || "") + (refs[k] ? "" : " · genel")));
        tb.appendChild(tr); rows++;
      });
      table.appendChild(tb);
      if (rows) lab.appendChild(table); else lab.appendChild(el("p", "vdp-muted", "Son kayıtta okunabilir değer yok."));
      lab.appendChild(el("p", "vdp-muted", "Referanslar laboratuvarın raporundaki aralıktır; yoksa uygulamanın genel karşılaştırma aralığıdır (tanı sınırı değildir)."));
    }
    box.appendChild(lab);

    var sym = section("Belirtiler", "fa-notes-medical");
    var syms = Array.isArray(stores.symptoms) ? stores.symptoms : [];
    var resolved = Array.isArray(stores.resolved_symptoms) ? stores.resolved_symptoms : [];
    if (!syms.length) sym.appendChild(el("p", "vdp-muted", "Seçili belirti yok."));
    else {
      var chips = el("div", "vdp-chips");
      syms.forEach(function (k) { chips.appendChild(el("span", "vdp-chip", symptomName(k))); });
      sym.appendChild(chips);
    }
    if (resolved.length) sym.appendChild(el("p", "vdp-muted", "Geçen belirtiler: " + resolved.map(symptomName).join(", ")));
    box.appendChild(sym);

    var notes = typeof stores.notes === "string" ? stores.notes.trim() : "";
    var pn = section("Hastanın doktora notları", "fa-comment-medical");
    pn.appendChild(notes ? el("p", "vdp-patient-note", notes) : el("p", "vdp-muted", "Hasta not yazmamış."));
    box.appendChild(pn);
  }

  async function loadDetail(patientId, silent) {
    var pt = lastPatients.find(function (p) { return p.patient_id === patientId; }); if (!pt) return;
    selected = { id: patientId, full_name: pt.full_name };
    renderPatients(lastPatients);
    var panel = $("vdpDetailPanel"); if (panel) panel.classList.remove("hidden");
    var view = $("view-doctor"); if (view) view.classList.add("vdp-has-detail");
    if (!silent) { var box = $("vdpDetail"); if (box) { box.textContent = ""; box.appendChild(el("p", "vdp-muted", "Kayıtlar yükleniyor…")); } }
    try {
      var c = await VitaCloud.getClient();
      var res = await Promise.all([
        c.from("user_stores").select("store, data, updated_at").eq("user_id", patientId),
        c.from("doctor_notes").select("id, body, created_at, doctor_id").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(50)
      ]);
      if (!selected || selected.id !== patientId) return;
      if (res[0].error) throw res[0].error;
      var stores = {}; var newest = "";
      (res[0].data || []).forEach(function (row) { stores[row.store] = decode(row); if (row.updated_at > newest) newest = row.updated_at; });
      renderDetail(pt, stores, newest || pt.last_update);
      renderNotes(Array.isArray(res[1].data) ? res[1].data : []);
    } catch (e) {
      var b = $("vdpDetail"); if (b) { b.textContent = ""; b.appendChild(el("p", "vdp-error", VitaCloud.describeError(e).message)); }
    }
  }
  function closeDetail() {
    selected = null;
    var panel = $("vdpDetailPanel"); if (panel) panel.classList.add("hidden");
    var view = $("view-doctor"); if (view) view.classList.remove("vdp-has-detail");
    renderPatients(lastPatients);
  }

  /* ---------------- Doktor notları ---------------- */
  function renderNotes(notes) {
    var ul = $("vdpNoteList"); if (!ul) return;
    ul.textContent = "";
    if (!notes.length) { ul.appendChild(el("li", "vdp-muted", "Bu hastaya henüz not yazmadınız.")); return; }
    notes.forEach(function (n) {
      var li = el("li", "vdp-note");
      var top = el("div", "vdp-note-top");
      top.appendChild(el("span", "", fmtDate(n.created_at, true)));
      var del = el("button", "vdp-note-del", "Sil"); del.type = "button"; del.setAttribute("data-note-delete", n.id);
      top.appendChild(del);
      li.appendChild(top);
      li.appendChild(el("p", "", n.body || ""));
      ul.appendChild(li);
    });
  }
  function noteMsg(text, tone) { var m = $("vdpNoteMsg"); if (!m) return; m.textContent = text || ""; m.classList.toggle("hidden", !text); m.setAttribute("data-tone", tone || "info"); }
  async function saveNote() {
    if (!selected || busy) return;
    var input = $("vdpNoteInput"); var body = input ? input.value.trim() : "";
    if (!body) { noteMsg("Not boş olamaz.", "error"); return; }
    busy = true; var btn = $("vdpNoteSave"); if (btn) btn.disabled = true;
    try {
      var c = await VitaCloud.getClient();
      var r = await c.from("doctor_notes").insert({ doctor_id: cloudUid(), patient_id: selected.id, body: body }).select("id");
      if (r.error) throw r.error;
      if (input) input.value = "";
      noteMsg("Not gönderildi; hasta Ayarlar > Doktorum'da görür.", "ok");
      await loadDetail(selected.id, true);
    } catch (e) {
      noteMsg(/row-level security|42501/.test(String(e && (e.message || e.code))) ? "Bu hastaya not yazma izniniz yok (izin geri alınmış olabilir)." : VitaCloud.describeError(e).message, "error");
    } finally { busy = false; if (btn) btn.disabled = false; }
  }
  async function deleteNote(id) {
    if (!selected || !window.confirm("Bu not silinsin mi? Hasta da artık göremez.")) return;
    try {
      var c = await VitaCloud.getClient();
      var r = await c.from("doctor_notes").delete().eq("id", id);
      if (r.error) throw r.error;
      noteMsg("Not silindi.", "info");
      await loadDetail(selected.id, true);
    } catch (e) { noteMsg(VitaCloud.describeError(e).message, "error"); }
  }

  /* ---------------- Yenileme ---------------- */
  function startPolling() { stopPolling(); pollTimer = setInterval(function () { if (viewVisible() && document.visibilityState === "visible") loadPatients(); }, POLL_MS); }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function onViewShown() { updateChrome(); if (!isDoctor()) return; loadPatients(); startPolling(); }

  function watchView() {
    var view = $("view-doctor"); if (!view || !window.MutationObserver) return;
    var wasHidden = view.classList.contains("hidden");
    new MutationObserver(function () {
      var hidden = view.classList.contains("hidden");
      if (wasHidden && !hidden) onViewShown();
      if (!wasHidden && hidden) stopPolling();
      wasHidden = hidden;
    }).observe(view, { attributes: true, attributeFilter: ["class"] });
  }

  /* Doktor girişinde panel açılış ekranıdır (oturum başına bir kez). Profil olayı (girişte) ya da açılıştaki ilk
     eşitleme (kayıtlı oturumla açılışta; profil cihazda saklı) tetikler. */
  var landedFor = null;
  function land(uid) {
    updateChrome();
    if (isDoctor() && uid && landedFor !== uid && typeof navigateToView === "function") {
      landedFor = uid;
      var tab = typeof state !== "undefined" && state ? state.activeTab : "";
      if (!tab || tab === "view-home") navigateToView("view-doctor"); else if (viewVisible()) onViewShown();
    } else if (viewVisible()) onViewShown();
  }
  document.addEventListener("vita:cloud-profile", function (e) { land(e.detail && e.detail.userId); });
  document.addEventListener("vita:cloud-pulled", function (e) { land(e.detail && e.detail.userId); });
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var p = t.closest("[data-patient-id]"); if (p) { loadDetail(p.getAttribute("data-patient-id")); return; }
    if (t.closest("#vdpBackBtn")) { closeDetail(); return; }
    if (t.closest("#vdpRefreshBtn")) { loadPatients(); return; }
    var d = t.closest("[data-note-delete]"); if (d) { deleteNote(d.getAttribute("data-note-delete")); return; }
    if (t.closest("#vdpCopyCode")) {
      var code = ($("vdpDoctorCode") || {}).textContent || "";
      try { navigator.clipboard.writeText(code).then(function () { if (typeof showToast === "function") showToast("Kopyalandı", "Doktor kodunuz panoya kopyalandı: " + code, "success"); }); } catch (_) {}
    }
  });
  document.addEventListener("submit", function (e) { if (e.target && e.target.id === "vdpNoteForm") { e.preventDefault(); saveNote(); } });
  window.addEventListener("online", function () { if (viewVisible()) loadPatients(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchView); else watchView();

  window.VitaDoctorPanel = { refresh: loadPatients, open: loadDetail, close: closeDetail, updateChrome: updateChrome };
})();
