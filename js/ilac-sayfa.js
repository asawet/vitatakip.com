/* İlaç Ekle sayfası (tam ekran): Takviye Ekle ile aynı kompakt düzen.
   Ürün bilgisi (ad, etken madde, forma özel çipler) + Nasıl alacaksınız? (her dozda kaç adet, Her gün / Belirli günler /
   Gerektiğinde, vakit çipleri ve her vakit için saat — Ayarlar'daki "Saat seçim düzeni"ne göre dijital SS:DD veya
   saat tekerleği — ve aç/tok). Kayıt 18a-urun-modulleri.js içindeki commitAddMedication'da yapılır. */
(function () {
  "use strict";
  var ORDER = ["Sabah", "Öğle", "Akşam", "Gece"];
  var DEFAULT_CLOCK = { "Sabah": "09:00", "Öğle": "13:00", "Akşam": "20:00", "Gece": "22:30" };
  var ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
  var DAY_SHORT = { 0: "Paz", 1: "Pzt", 2: "Sal", 3: "Çar", 4: "Per", 5: "Cum", 6: "Cmt" };
  var MED_FORMS = ["Tablet", "Film Tablet", "Kapsül", "Şurup", "Damla", "Sprey", "Saşe", "Enjeksiyon"];
  var st = { freq: "daily", days: new Set(ALL_DAYS), vakits: { "Sabah": DEFAULT_CLOCK["Sabah"] }, hungerTouched: false };

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function fold(v) { return typeof window.vitaFold === "function" ? window.vitaFold(v) : String(v || "").toLocaleLowerCase("tr-TR"); }
  function isClock(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")); }
  function timeMode() { return window.VitaSupPage && window.VitaSupPage.getTimeMode ? window.VitaSupPage.getTimeMode() : "digital"; }

  function unitForForm(form) {
    var f = fold(form);
    if (!f.trim()) return "";
    if (/sprey|puf|inhaler/.test(f)) return "puf";
    if (/damla/.test(f)) return "damla";
    if (/sase/.test(f)) return "saşe";
    if (/surup|suspansiyon|solusyon|\bml\b/.test(f)) return "mL";
    if (/enjeksiyon|igne|ampul|kalem|flakon/.test(f)) return "doz";
    if (/kapsul/.test(f)) return "kapsül";
    return "tablet";
  }
  /* İlaç adından form tahmini (ör. "Parol 500 mg Tablet" → Tablet) */
  function formFromName(name) {
    var f = fold(name);
    var hit = [["film tablet", "Film Tablet"], ["efervesan", "Efervesan Tablet"], ["tablet", "Tablet"], ["kapsul", "Kapsül"], ["surup", "Şurup"], ["suspansiyon", "Şurup"], ["damla", "Damla"], ["sprey", "Sprey"], ["inhaler", "Sprey"], ["sase", "Saşe"], ["ampul", "Enjeksiyon"], ["enjeksiyon", "Enjeksiyon"], ["kalem", "Enjeksiyon"]];
    for (var i = 0; i < hit.length; i++) if (f.indexOf(hit[i][0]) > -1) return hit[i][1];
    return "";
  }

  function getPlan() {
    var vakits = ORDER.filter(function (v) { return st.vakits[v]; }).map(function (v) { return { vakit: v, clock: isClock(st.vakits[v]) ? st.vakits[v] : DEFAULT_CLOCK[v] }; });
    var days = st.freq === "days" ? ALL_DAYS.filter(function (d) { return st.days.has(d); }) : ALL_DAYS.slice();
    return { freq: st.freq, vakits: st.freq === "prn" ? [] : vakits, days: days };
  }
  function daysLabel(days) {
    if (!days.length) return "gün seçilmedi";
    if (days.length === 7) return "Her gün";
    return ALL_DAYS.filter(function (d) { return days.indexOf(d) > -1; }).map(function (d) { return DAY_SHORT[d]; }).join(", ");
  }

  function renderForms() {
    var box = $("vamForms"); if (!box) return;
    var cur = String(($("addMedForm") || {}).value || "").trim();
    var list = MED_FORMS.slice();
    if (cur && !list.some(function (l) { return fold(l) === fold(cur); })) list.unshift(cur);
    box.innerHTML = list.map(function (l) {
      var on = cur && fold(l) === fold(cur);
      return '<button type="button" class="vsp-chip vsp-fchip' + (on ? " is-on" : "") + '" data-medform="' + esc(l) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(l) + "</button>";
    }).join("");
  }
  function renderChips() {
    document.querySelectorAll("#addMedDoseFieldset [data-medfreq]").forEach(function (b) { var on = b.dataset.medfreq === st.freq; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false"); });
    var days = $("vamDays"); if (days) days.classList.toggle("hidden", st.freq !== "days");
    document.querySelectorAll("#vamDays .vsp-chip").forEach(function (b) { var on = st.days.has(Number(b.dataset.day)); b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    document.querySelectorAll("#vamVakits .vsp-chip").forEach(function (b) { var on = !!st.vakits[b.dataset.vakit]; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    var tf = $("addMedTimeField"); if (tf) tf.classList.toggle("hidden", st.freq === "prn");
  }
  function renderClocks() {
    var box = $("addMedClocks"); if (!box) return;
    var dial = timeMode() === "dial";
    box.classList.toggle("is-digital", !dial);
    box.innerHTML = getPlan().vakits.map(function (v) {
      var head = "<span>" + esc(v.vakit) + "</span>";
      if (dial) return '<label class="vsp-clock">' + head + '<input type="time" step="300" value="' + v.clock + '" data-vakit="' + esc(v.vakit) + '" aria-label="' + esc(v.vakit) + ' alım saati"/></label>';
      var hm = v.clock.split(":");
      return '<div class="vsp-clock">' + head + '<div class="vsp-hm" data-vakit="' + esc(v.vakit) + '" role="group" aria-label="' + esc(v.vakit) + ' alım saati">' +
        '<input class="vsp-hh" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="' + hm[0] + '" aria-label="' + esc(v.vakit) + ': saat (00–23)"/><b aria-hidden="true">:</b>' +
        '<input class="vsp-mm" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="' + hm[1] + '" aria-label="' + esc(v.vakit) + ': dakika (00–59)"/></div></div>';
    }).join("");
  }
  function renderPreview() {
    var p = $("addMedPreview"); if (!p) return;
    var plan = getPlan();
    var dose = Math.max(1, parseInt(($("addMedDose") || {}).value, 10) || 1), unit = ($("addMedUnit") || {}).value || "tablet";
    var hunger = String(($("addMedHunger") || {}).value || "").trim();
    var parts = ["Her dozda " + dose + " " + unit];
    if (plan.freq === "prn") parts.push("Gerektiğinde (hatırlatma yok)");
    else { parts.push(plan.vakits.map(function (v) { return v.vakit + " " + v.clock; }).join(", ")); parts.push(daysLabel(plan.days)); }
    if (hunger) parts.push(hunger);
    p.textContent = parts.join(" · ");
    var hint = $("addMedScheduleHint");
    if (hint) {
      var txt = plan.freq === "prn" ? "Günlük listede gösterilmez ve hatırlatma gönderilmez; gerektiğinde kullandığınız ilaçlar için." : (plan.vakits.length > 1 ? "Her doz ayrı ayrı \"Aldım\" olarak işaretlenir." : "");
      hint.textContent = txt; hint.classList.toggle("hidden", !txt);
    }
    var notif = $("addMedNotifHint");
    if (notif) {
      var enabled = typeof isNotificationEnabled === "function" && isNotificationEnabled() && typeof isNotificationPermissionGranted === "function" && isNotificationPermissionGranted();
      notif.classList.toggle("hidden", enabled || plan.freq === "prn" || !("Notification" in window));
    }
  }
  function refresh() { renderForms(); renderChips(); renderClocks(); renderPreview(); }

  function reset() {
    st = { freq: "daily", days: new Set(ALL_DAYS), vakits: { "Sabah": DEFAULT_CLOCK["Sabah"] }, hungerTouched: false };
    ["addMedName", "addMedActive", "addMedForm", "addMedBarcode", "addMedSearchInput"].forEach(function (id) { var el = $(id); if (el) el.value = ""; });
    var d = $("addMedDose"); if (d) d.value = "1";
    var u = $("addMedUnit"); if (u) u.value = "tablet";
    var h = $("addMedHunger"); if (h) { h.querySelectorAll("option[data-dynamic]").forEach(function (o) { o.remove(); }); h.value = ""; }
    refresh();
  }
  function setForm(label) {
    var input = $("addMedForm"); if (input) input.value = label || "";
    var u = $("addMedUnit"), unit = unitForForm(label);
    if (u && unit) u.value = unit;
    refresh();
  }
  /* Planı topluca kur: { freq: "daily"|"days"|"prn", vakits: {Sabah:"09:00"} veya ["Sabah"], days: [..] } */
  function setPlan(plan) {
    plan = plan || {};
    if (plan.freq) st.freq = plan.freq;
    if (plan.vakits) {
      var next = {};
      if (Array.isArray(plan.vakits)) plan.vakits.forEach(function (v) { if (ORDER.indexOf(v) > -1) next[v] = DEFAULT_CLOCK[v]; });
      else ORDER.forEach(function (v) { if (plan.vakits[v]) next[v] = isClock(plan.vakits[v]) ? plan.vakits[v] : DEFAULT_CLOCK[v]; });
      if (Object.keys(next).length) st.vakits = next;
    }
    if (Array.isArray(plan.days)) st.days = new Set(plan.days.map(Number).filter(function (d) { return ALL_DAYS.indexOf(d) > -1; }));
    refresh();
  }
  /* Saatlerden plan (eski "Günde 2 kez · 09:00, 20:00" kayıtları ve reçete kuralı için): her saat kendi vaktine yerleşir. */
  function setClocks(clocks) {
    var next = {};
    (clocks || []).filter(isClock).forEach(function (c) {
      var v = typeof vitaBlockFromClock === "function" ? vitaBlockFromClock(c) : "Sabah";
      if (next[v]) { var free = ORDER.filter(function (o) { return !next[o]; })[0]; if (free) v = free; }
      next[v] = c;
    });
    if (Object.keys(next).length) st.vakits = next;
    refresh();
  }
  function setClock(vakit, clock) { if (st.vakits[vakit] && isClock(clock)) { st.vakits[vakit] = clock; renderPreview(); } }
  /* Katalog / reçete kuralı / yapay zekâ sonucu: etken madde, form ve (kullanıcı seçmediyse) aç/tok */
  function applyProduct(info) {
    info = info || {};
    var a = $("addMedActive"); if (a && info.etkenMadde && !a.value.trim()) a.value = info.etkenMadde;
    var form = info.form || formFromName(info.urunAdi || ($("addMedName") || {}).value || "");
    if (form) setForm(form);
    var h = $("addMedHunger"), hunger = String(info.aclikDurumu || "");
    if (h && hunger && !st.hungerTouched) {
      var f = fold(hunger), val = /\bac\b|ac karnina|aç/.test(f) ? "Aç karnına" : (/yemekle|yemek ile/.test(f) ? "Yemekle birlikte" : (/tok/.test(f) ? "Tok karnına" : ""));
      if (val) h.value = val;
    }
    refresh();
  }
  function commitDigital(group, pad) {
    var hh = group.querySelector(".vsp-hh"), mm = group.querySelector(".vsp-mm"), vakit = group.dataset.vakit;
    if (!hh || !mm || !st.vakits[vakit]) return;
    var h = parseInt(hh.value, 10), m = parseInt(mm.value, 10);
    if (pad) {
      h = Math.min(23, Math.max(0, isNaN(h) ? Number(st.vakits[vakit].split(":")[0]) : h));
      m = Math.min(59, Math.max(0, isNaN(m) ? 0 : m));
      hh.value = String(h).padStart(2, "0"); mm.value = String(m).padStart(2, "0");
    } else if (hh.value.length < 2 || mm.value.length < 2 || isNaN(h) || isNaN(m) || h > 23 || m > 59) return;
    st.vakits[vakit] = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    renderPreview();
  }

  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var fc = t.closest("#vamForms [data-medform]");
    if (fc) { setForm(fc.dataset.medform); return; }
    var seg = t.closest("#addMedDoseFieldset [data-medfreq]");
    if (seg) { st.freq = seg.dataset.medfreq; if (st.freq === "days" && st.days.size === 7) st.days = new Set(); refresh(); return; }
    var day = t.closest("#vamDays .vsp-chip");
    if (day) { var d = Number(day.dataset.day); if (st.days.has(d)) st.days.delete(d); else st.days.add(d); refresh(); return; }
    var vk = t.closest("#vamVakits .vsp-chip");
    if (vk) {
      var name = vk.dataset.vakit;
      if (st.vakits[name]) { if (Object.keys(st.vakits).length > 1) delete st.vakits[name]; else if (typeof showToast === "function") showToast("En az bir vakit", "İlacı alacağınız en az bir vakit seçili kalmalı. Düzenli değilse \"Gerektiğinde\"yi seçin.", "info"); }
      else st.vakits[name] = DEFAULT_CLOCK[name];
      refresh();
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var inp = t.closest("#addMedClocks input[type=time][data-vakit]");
    if (inp && isClock(inp.value)) { st.vakits[inp.dataset.vakit] = inp.value; renderPreview(); return; }
    var hm = t.closest("#addMedClocks .vsp-hm"); if (hm) commitDigital(hm, true);
  });
  document.addEventListener("input", function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var hm = t.closest("#addMedClocks .vsp-hm"); if (!hm) return;
    var clean = String(t.value || "").replace(/\D/g, "").slice(0, 2);
    if (clean !== t.value) t.value = clean;
    if (t.classList.contains("vsp-hh") && clean.length === 2) { var mm = hm.querySelector(".vsp-mm"); if (mm) { mm.focus(); mm.select(); } }
    commitDigital(hm, false);
  });
  document.addEventListener("focusin", function (e) {
    var t = e.target; if (t && t.closest && t.closest("#addMedClocks .vsp-hm") && t.select) try { t.select(); } catch (_) {}
  });

  window.VitaMedPage = {
    refresh: refresh, reset: reset, getPlan: getPlan, setPlan: setPlan, setClocks: setClocks, setClock: setClock, setForm: setForm,
    applyProduct: applyProduct, unitForForm: unitForForm, formFromName: formFromName, daysLabel: daysLabel,
    markHungerTouched: function () { st.hungerTouched = true; renderPreview(); }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true }); else refresh();
})();
