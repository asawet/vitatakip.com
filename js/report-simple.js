/* Doktora götürülecek rapor: tek sayfalık, kısa ve okunaklı özet.
   Veri modeli Klinik Analiz sayfasıyla aynıdır (VitaSimpleModel); metin tekrarı yoktur.
   Ayrıntılı rapor isteğe bağlı olarak eski (uzun) bölümlerle gösterilmeye devam eder. */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function cut(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; }
  function dmy(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(iso || ""); }

  var NUTR_BY_LAB = { ferritin: "Demir", b12: "B12", d3: "D3_K2", mg: "Magnezyum", folate: "Folat", zinc: "Çinko", ca: "Kalsiyum", hb: "Demir" };
  var MARK = { low: ["↓ Düşük", "rs-low"], high: ["↑ Yüksek", "rs-high"], border: ["Sınırda", "rs-border"], ok: ["Normal", "rs-ok"] };

  function medList() {
    var u = state.user || {}, out = [];
    (Array.isArray(u.medications) ? u.medications : []).forEach(function (m) { if (m) out.push(String(m)); });
    var classes = (window.VITA_CLINICAL_DRUG_NUTRIENT_DB && VITA_CLINICAL_DRUG_NUTRIENT_DB.quickMedicationClasses) || [];
    (Array.isArray(u.chronic) ? u.chronic : []).forEach(function (code) {
      var c = classes.filter(function (x) { return x.code === code; })[0];
      if (!c) { if (code !== "kidney") return; }
      var label = c ? String(c.label).replace(/\s*\(.*\)\s*$/, "") : "Kronik böbrek hastalığı";
      var dup = out.some(function (o) { return o.toLocaleLowerCase("tr-TR").indexOf(label.toLocaleLowerCase("tr-TR").split(" ")[0]) > -1; });
      if (!dup) out.push(label);
    });
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  function suppList() {
    return (Array.isArray(state.supplements) ? state.supplements : []).map(function (s) { return s && s.name; }).filter(Boolean).slice(0, 6);
  }

  function highlights(m, u) {
    var out = [];
    /* 1) Acil / öncelikli uyarılar */
    m.safety.filter(function (s) { return s.crit; }).slice(0, 2).forEach(function (s) { out.push({ t: "⚠ " + cut(s.title, 110), crit: true }); });
    /* 3) Örüntüler (yalnızca veri varsa) */
    var by = {}; m.rows.forEach(function (r) { by[r.key] = r; });
    var low = function (k) { return by[k] && (by[k].dir === "low" || by[k].dir === "border"); };
    var ppi = (u.chronic || []).indexOf("ppi") > -1, met = (u.chronic || []).indexOf("metformin") > -1;
    if (low("hb") && low("ferritin")) out.push({ t: "Düşük Hb ile düşük/sınırda ferritin: demir eksikliği anemisi açısından değerlendirme.", crit: false });
    else if (low("hb")) out.push({ t: "Hemoglobin düşük: anemi türü ve nedeni için hemogram (MCV) ve demir/B12/folat değerlendirmesi.", crit: false });
    if (low("b12") && (ppi || met)) out.push({ t: "B12 düşük/sınırda; " + (ppi && met ? "PPI ve metformin" : (ppi ? "PPI" : "metformin")) + " kullanımı B12'yi azaltabilir.", crit: false });
    if (low("ferritin") && ppi) out.push({ t: "PPI kullanımı demir emilimini azaltabilir.", crit: false });
    var kd = by.creatinine && by.creatinine.extra ? by.creatinine.extra.replace(/^\s*·\s*/, "") : "";
    if (kd && by.creatinine.dir !== "ok") out.push({ t: "Böbrek: kreatinin " + window.VitaSimpleModel.fmt(by.creatinine.value) + " mg/dL (" + kd + ").", crit: false });
    /* 3b) Yaşa özgü yorum (tek not): demir eksikliği nedeni, B12 emilimi, kreatinin–yaş */
    if (window.VitaAgeStage) {
      var an = "";
      m.bad.some(function (r) { an = VitaAgeStage.labNote(r.key, r.dir, u); return !!an; });
      if (an) out.push({ t: an.replace(/^Yaş notu:\s*/, "Yaş: "), crit: false });
    }
    /* 4) İlaca özgü uyarılar (ör. metformin + eGFR) */
    m.safety.filter(function (s) { return !s.crit && /ilaç|metformin|böbrek/i.test(s.title); }).slice(0, 1).forEach(function (s) { out.push({ t: cut(s.title, 110), crit: false }); });
    /* 5) Belirti–tahlil uyumu */
    var lowNut = {}; m.bad.forEach(function (r) { if (r.dir !== "high" && NUTR_BY_LAB[r.key]) lowNut[NUTR_BY_LAB[r.key]] = r.name; });
    var metas = (window.VitaClinicalData && VitaClinicalData.selectedSymptomMetas) ? VitaClinicalData.selectedSymptomMetas() : [];
    var matched = [], labs = {};
    metas.forEach(function (mt) { (mt.nutrients || []).forEach(function (n) { if (lowNut[n]) { if (matched.indexOf(mt.symptomName || mt.medicalName) === -1) matched.push(mt.symptomName || mt.medicalName); labs[lowNut[n]] = 1; } }); });
    if (matched.length) out.push({ t: "Belirti–tahlil uyumu: " + cut(matched.slice(0, 3).join(", "), 80) + (matched.length > 3 ? " …" : "") + " ↔ " + Object.keys(labs).slice(0, 3).join(", ") + ".", crit: false });
    return out.filter(function (x, i, a) { return a.findIndex(function (y) { return y.t === x.t; }) === i; }).slice(0, 6);
  }

  /* Shared-word test used to drop the same finding coming from two rule sets */
  /* Generic words (hekim, acil, değerlendirme, gecikmeden…) are ignored so different urgent findings never merge */
  var GENERIC = /^(gecik|hekim|değer|acil|klini|gerek|veya|için|başla|danış|önce|uyarı|yüksek|düşük|sonra|olabi|durum|alarm|hasta|eksik|riski)/;
  function stems(s) { return String(s || "").toLocaleLowerCase("tr-TR").split(/[^a-zçğıöşü0-9]+/).filter(function (w) { return w.length >= 4 && !GENERIC.test(w); }).map(function (w) { return w.slice(0, 5); }); }
  function similar(a, b) { var sb = stems(b); return stems(a).filter(function (w) { return sb.indexOf(w) > -1; }).length >= 3; }

  function findings(m, u) {
    var out = [];
    var add = function (t, a, crit) {
      if (!t) return;
      var twin = out.filter(function (x) { return similar(x.t, t); })[0];
      /* Short rule titles ("ALT yüksek") already covered by an alarm naming the same lab ("… (ALT: 62 U/L)") */
      var first = String(t).split(/\s+/)[0];
      if (!twin && String(t).split(/\s+/).length <= 3) twin = out.filter(function (x) { return new RegExp("\\b" + first.replace(/[^\wçğıöşüÇĞİÖŞÜ]/g, "") + "\\b", "i").test(x.t); })[0];
      if (twin) { twin.crit = twin.crit || crit; if (!twin.a && a) twin.a = a; return; }
      out.push({ t: t, a: a || "", crit: !!crit });
    };
    m.safety.filter(function (s) { return s.crit; }).forEach(function (s) { add("⚠ " + cut(s.title, 110), "", true); });
    try {
      var syn = typeof buildProfessorClinicalSynthesisData === "function" ? buildProfessorClinicalSynthesisData() : null;
      (syn && syn.alarms || []).forEach(function (a) { add(a.title, cut(a.action, 170), a.level === "critical"); });
    } catch (_) {}
    highlights(m, u).forEach(function (x) { if (!/^Belirti–tahlil uyumu/.test(x.t) && !/^⚠/.test(x.t)) add(x.t, "", x.crit); });
    try { (window.VitaLabInsights ? VitaLabInsights.analyze().patterns : []).forEach(function (p) { add(p.title, "", false); }); } catch (_) {}
    return out.slice(0, 10);
  }

  function correlation(m) {
    var lowNut = {};
    m.bad.forEach(function (r) { if (r.dir !== "high" && NUTR_BY_LAB[r.key]) (lowNut[NUTR_BY_LAB[r.key]] = lowNut[NUTR_BY_LAB[r.key]] || []).push(r.name); });
    var metas = (window.VitaClinicalData && VitaClinicalData.selectedSymptomMetas) ? VitaClinicalData.selectedSymptomMetas() : [];
    return metas.map(function (mt) {
      var labs = [];
      (mt.nutrients || []).forEach(function (n) { (lowNut[n] || []).forEach(function (nm) { if (labs.indexOf(nm) === -1) labs.push(nm); }); });
      return { sym: mt.symptomName || mt.medicalName, labs: labs };
    });
  }

  function valueNotes(m, u) {
    var E = window.VitaLabEvidence; if (!E) return [];
    return m.bad.map(function (r) {
      if (!E.handles || !E.handles(r.key)) return null;
      var R = null;
      try { R = E.evaluate(r.key, r.value, { gender: u.gender === "E" ? "E" : "K", age: Number(u.age), reference: r.refFallback ? "" : r.ref }); } catch (_) {}
      var text = R && ((R.clinical && R.clinical.text) || R.message);
      return text ? { name: r.name + " " + window.VitaSimpleModel.fmt(r.value), text: text } : null;
    }).filter(Boolean);
  }

  function missing(m, u) {
    var miss = [], have = {}; m.rows.forEach(function (r) { have[r.key] = 1; });
    if (m.hasLab && !have.creatinine && !(typeof isPregnantNow === "function" && isPregnantNow())) miss.push("kreatinin/eGFR");
    if ((have.ferritin && !have.hb) || (m.bad.some(function (r) { return r.key === "ferritin"; }) && !have.hb)) miss.push("hemogram (Hb, MCV)");
    if (m.hasLab && m.bad.some(function (r) { return r.key === "ferritin"; }) && !have.crp) miss.push("CRP");
    return miss;
  }

  function build() {
    var host = $("repSimple"); if (!host) return;
    var M = window.VitaSimpleModel; if (!M) return;
    /* Analiz güncel değilse hesapla (eGFR, güvenlik uyarıları) */
    try { if (!state.lastCDSS && typeof canRunClinicalAnalysis === "function" && canRunClinicalAnalysis() && typeof evaluateClinicalAnalysisState === "function") evaluateClinicalAnalysisState(); } catch (_) {}
    var m; try { m = M.build(); } catch (e) { console.warn("[VitaTakip] rapor:", e); return; }
    var u = state.user || {};
    var code = (($("reportProtocolNo") || {}).textContent || "").trim();
    var bmiTxt = u.bmi ? (u.bmi + (u.bmiCategory ? " (" + u.bmiCategory.toLocaleLowerCase("tr-TR") + ")" : "")) : "—";
    var pStage = u.gender === "E" ? "" : (u.pregnancyStage || "");
    var pTxt = ({ t1: "Gebelik 1. trimester", t2: "Gebelik 2. trimester", t3: "Gebelik 3. trimester", lactation: "Emzirme" })[pStage] || "";
    var meds = medList(), supps = suppList();
    var symNames = (window.VitaClinicalData && VitaClinicalData.selectedSymptomMetas ? VitaClinicalData.selectedSymptomMetas() : []).map(function (x) { return x.symptomName || x.medicalName; });
    var latest = (Array.isArray(state.labHistory) ? state.labHistory.slice() : []).filter(function (r) { return r && r.date; }).sort(function (a, b) { return b.date.localeCompare(a.date); });

    var h = '<header class="rs-head"><div><div class="rs-kicker">VitaTakip · Hekim özeti</div><h1>Doktora Özet Raporu</h1></div>' +
      '<div class="rs-meta"><b>' + esc(new Date().toLocaleDateString("tr-TR")) + '</b>' + (code ? '<span>' + esc(code) + '</span>' : "") + '</div></header>';

    /* Profil doldurulmadıysa yaş/cinsiyet/boy/kilo uygulamanın varsayılanlarıdır; hekime gerçek veri gibi gösterilmez */
    var complete = typeof window.vitaProfileIsComplete === "function" ? window.vitaProfileIsComplete(u) : true;
    h += '<section class="rs-sec rs-patient"><div class="rs-row"><b>' + esc(u.name || "—") + '</b>' +
      (complete
        ? '<span>' + esc(u.age || "—") + ' yaş · ' + (u.gender === "E" ? "Erkek" : "Kadın") + '</span>' +
          '<span>' + esc(u.height || "—") + ' cm · ' + esc(u.weight || "—") + ' kg · VKİ ' + esc(bmiTxt) + '</span>'
        : '<span class="rs-tag" data-profile-incomplete="1">Profil tamamlanmadı: yaş, cinsiyet, boy ve kilo girilmedi</span>') +
      (pTxt ? '<span class="rs-tag">' + esc(pTxt) + '</span>' : "") + '</div>' +
      '<div class="rs-line"><i>Kronik/ilaç:</i> ' + (meds.length ? esc(meds.join(", ")) : "bildirilmedi") + '</div>' +
      (supps.length ? '<div class="rs-line"><i>Takviye:</i> ' + esc(supps.join(", ")) + '</div>' : "") + '</section>';

    h += '<section class="rs-sec"><h2>Şikâyetler</h2>' + (symNames.length ? '<div class="rs-chips">' + symNames.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join("") + '</div>' : '<p class="rs-muted">Belirti bildirilmedi.</p>') + '</section>';

    if (m.rows.length) {
      var order = m.bad.concat(m.ok);
      h += '<section class="rs-sec"><h2>Tahlil bulguları <small>' + (latest[0] ? "(" + dmy(latest[0].date) + (latest[1] ? " · önceki " + dmy(latest[1].date) : "") + ")" : "") + '</small></h2>' +
        (latest[0] && window.labContextBadgesHtml && (latest[0].contextTags || []).length ? '<p class="rs-ctx">Tahlil koşulları (' + esc(dmy(latest[0].date)) + '): ' + labContextBadgesHtml(latest[0].contextTags) + '</p>' : "") +
        '<table class="rs-tbl"><thead><tr><th>Test</th><th>Sonuç</th><th>Referans</th><th>Durum</th><th>Önceki</th></tr></thead><tbody>' +
        order.map(function (r) {
          var mk = MARK[r.dir] || MARK.ok;
          return '<tr class="' + (r.dir === "ok" ? "" : "rs-abn") + '"><td>' + esc(r.name) + '</td><td><b>' + esc(M.fmt(r.value)) + '</b> <small>' + esc(r.unit) + '</small>' +
            (r.older && r.date ? ' <small class="rs-date">' + esc(dmy(r.date)) + '</small>' : "") + '</td>' +
            '<td' + (r.refFallback ? ' class="rs-fallback" data-fallback="range" title="Raporda laboratuvar aralığı yok; genel aralık"' : (r.refFrom ? ' class="rs-inherited" data-inherited="' + esc(r.refFrom) + '" title="' + esc(dmy(r.refFrom)) + ' tarihli tahlildeki aralık"' : '')) + '>' + (r.refFallback ? '<sup>*</sup>' : (r.refFrom ? '<sup>†</sup>' : '')) + esc(String(r.ref || "—").replace(/\s*(?<![A-Za-zµ])(mg\/dL|ng\/mL|pg\/mL|g\/dL|µg\/dL|U\/L|fL|mg\/L|\(gebelik\))/g, " $1").replace(/\s+/g, " ").replace(/\s?(?<![A-Za-zµ])(mg\/dL|ng\/mL|pg\/mL|g\/dL|µg\/dL|U\/L|fL|mg\/L)/, "")) + '</td>' +
            '<td class="' + mk[1] + '">' + mk[0] + '</td><td>' + (r.prev ? esc(M.fmt(r.prev.value)) + (r.prev.date ? ' <small class="rs-date">' + esc(dmy(r.prev.date)) + '</small>' : "") : "—") + '</td></tr>';
        }).join("") + '</tbody></table>' +
        (order.some(function (r) { return r.refFallback; }) ? '<p class="rs-note rs-fallback-note" data-fallback="range"><sup>*</sup> Tahlil raporunda laboratuvar aralığı yoktu; VitaTakip genel karşılaştırma aralığı kullanıldı.</p>' : "") +
        (order.some(function (r) { return r.refFrom; }) ? '<p class="rs-note rs-inherited-note"><sup>†</sup> Bu tahlilde aralık yoktu; hastanın aynı teste ait önceki raporundaki laboratuvar aralığı kullanıldı (' + order.filter(function (r) { return r.refFrom; }).map(function (r) { return esc(r.name) + ": " + esc(dmy(r.refFrom)); }).join(", ") + ').</p>' : "") +
        (typeof isPregnantNow === "function" && isPregnantNow() ? '<p class="rs-note">Gebelikte eGFR formülleri geçerli olmadığından hesaplanmadı.</p>'
          : (state.lastCDSS && state.lastCDSS.egfrResult ? '<p class="rs-note">eGFR (CKD-EPI 2021): <b>' + esc(state.lastCDSS.egfrResult.egfr) + '</b> mL/dk/1,73 m² (Evre ' + esc(state.lastCDSS.egfrResult.stage) + ')</p>' : "")) + '</section>';
    }

    /* Önemli bulgular: kritik uyarılar + klinik alarmlar (hekim eylem önerisiyle) + tahliller arası ilişkiler — her biri bir kez */
    var finds = findings(m, u);
    if (finds.length) h += '<section class="rs-sec rs-findings"><h2>Önemli bulgular</h2><ul class="rs-list">' + finds.map(function (x) {
      return '<li class="' + (x.crit ? "rs-crit" : "") + '"><b>' + esc(x.t) + '</b>' + (x.a ? '<span class="rs-act">→ ' + esc(x.a) + '</span>' : "") + '</li>';
    }).join("") + '</ul></section>';

    /* Belirti–tahlil uyumu: tek tablo */
    var corr = correlation(m);
    if (corr.length) h += '<section class="rs-sec"><h2>Belirti – tahlil uyumu</h2><table class="rs-tbl rs-corr"><tbody>' + corr.map(function (c) {
      return '<tr><td>' + esc(c.sym) + '</td><td>' + (c.labs.length ? esc(c.labs.join(", ")) : '<span class="rs-muted">İlgili tahlil kaydı yok</span>') + '</td></tr>';
    }).join("") + '</tbody></table></section>';

    /* İstenebilecek testler: laboratuvar ve klinik muayene ayrı */
    if (m.tests.length) {
      var isEx = M.isExam || function () { return false; };
      var labT = m.tests.filter(function (t) { return !isEx(t.name); }), exT = m.tests.filter(function (t) { return isEx(t.name); });
      var chips = function (list) { return '<div class="rs-chips rs-tests">' + list.map(function (t) { return '<span>' + esc(t.name) + '</span>'; }).join("") + '</div>'; };
      h += '<section class="rs-sec"><h2>İstenebilecek testler</h2>' +
        (labT.length ? '<div class="rs-sub">Laboratuvar</div>' + chips(labT) : "") +
        (exT.length ? '<div class="rs-sub">Klinik muayene / uzmanlık</div>' + chips(exT) : "") + '</section>';
    }

    var miss = missing(m, u);

    /* Ek açıklamalar: her referans dışı değerin kaynaklı yorumu (kapalı; doktor isterse açar) */
    var notes = valueNotes(m, u);
    if (notes.length) h += '<details class="rs-sec rs-annex"><summary><h2>Ek açıklamalar <small>(' + notes.length + ')</small></h2></summary><ul class="rs-list">' +
      notes.map(function (n) { return '<li><b>' + esc(n.name) + ':</b> ' + esc(n.text) + '</li>'; }).join("") + '</ul></details>';

    h += '<p class="rs-foot">' + (miss.length ? '<b>Eksik:</b> ' + esc(miss.join(", ")) + '. ' : "") + 'Tahlil raporundaki laboratuvar referansı esastır. Bu özet ön değerlendirmedir, tanı veya reçete değildir.</p>';

    if (!m.rows.length && !symNames.length) h = h.replace('<section class="rs-sec"><h2>Şikâyetler</h2>', '<section class="rs-sec"><h2>Şikâyetler</h2><p class="rs-muted">Henüz tahlil veya belirti girilmemiş.</p>');
    host.innerHTML = h;
  }

  /* Mod anahtarı: kısa (varsayılan) ↔ ayrıntılı */
  function ensureToggle() {
    var bar = $("reportModeSelectorBar"); if (!bar || $("rsModeToggle")) return;
    var b = document.createElement("button");
    b.type = "button"; b.id = "rsModeToggle"; b.className = "rs-toggle no-print";
    b.addEventListener("click", function () {
      var cur = typeof getDoctorReportMode === "function" ? getDoctorReportMode() : "concise";
      if (typeof setDoctorReportMode === "function") setDoctorReportMode(cur === "concise" ? "detailed" : "concise");
      syncToggle();
    });
    bar.appendChild(b); syncToggle();
  }
  function syncToggle() {
    var b = $("rsModeToggle"); if (!b) return;
    var detailed = typeof getDoctorReportMode === "function" && getDoctorReportMode() === "detailed";
    b.textContent = detailed ? "← Kısa rapora dön" : "Ayrıntılı raporu göster (isteğe bağlı)";
    // Teknik HL7 FHIR dışa aktarımı yalnızca ayrıntılı modda görünür (kısa raporda kafa karıştırmasın).
    var fhir = $("btnExportFhirBundle");
    if (fhir) { fhir.classList.toggle("hidden", !detailed); fhir.classList.toggle("flex", detailed); }
  }

  /* Tek birleşik rapor: kısa/ayrıntılı ayrımı ve ayrıntılı ek (tekrarlar, düğmeler, ayar kutuları) kaldırıldı.
     Ayrıntılı ekin klinik içeriği (alarmlar, ilişkiler, değer yorumları) bu raporda birer kez yer alır. */
  function singleReport() {
    if (typeof getDoctorReportMode === "function" && getDoctorReportMode() !== "concise" && typeof setDoctorReportMode === "function") setDoctorReportMode("concise");
    var bc = $("btnReportModeConcise");
    if (bc && bc.parentElement) bc.parentElement.classList.add("hidden");
    var old = $("rsModeToggle"); if (old) old.remove();
    /* Technical HL7 FHIR export used to live only in the detailed report: keep it reachable in the report toolbar */
    var fhir = $("btnExportFhirBundle");
    if (fhir) { fhir.classList.remove("hidden"); fhir.classList.add("flex"); }
  }
  void ensureToggle; void syncToggle;

  var origRender = window.renderReportTab;
  if (typeof origRender === "function") {
    window.renderReportTab = function () {
      var r = origRender.apply(this, arguments);
      try { singleReport(); build(); } catch (e) { console.warn("[VitaTakip] rapor özeti:", e); }
      return r;
    };
  }
  window.renderReportSimple = build;
})();
