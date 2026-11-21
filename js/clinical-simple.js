/* Klinik Analiz sayfası: bilgisiz kullanıcı için sade görünüm.
   1) Özet + "Ne yapmalısınız?"  2) Değerlerim (yalnızca girilenler)  3) Belirtilerim için doktora sorulacaklar.
   Teknik ayrıntılar (böbrek kartları, değerlendirme notları, AI sentez) "Ayrıntıları göster" arkasındadır. */
(function () {
  "use strict";

  /* Her değer için sade dil: ne anlama geliyor + hangi besinler. Tanı veya doz önerisi değildir. */
  var ADVICE = {
    ferritin: {
      low: { meaning: "Vücudun demir deposu azalmış görünüyor.", food: "Kırmızı et, karaciğer, mercimek, nohut, ıspanak. C vitaminiyle (limon, biber) birlikte yiyin; çay ve kahveyi yemekten uzak içirin." },
      high: { meaning: "Ferritin yüksek çıkmış; enflamasyon veya başka nedenlerle olabilir.", food: "" }
    },
    b12: { low: { meaning: "B12 düşük; sinir ve kan hücreleri için önemli bir vitamin.", food: "Et, balık, yumurta, süt, yoğurt, peynir." } },
    folate: { low: { meaning: "Folat düşük görünüyor.", food: "Koyu yeşil yapraklılar, mercimek, nohut, portakal." } },
    d3: {
      low: { meaning: "D vitamini düşük görünüyor.", food: "Yağlı balık, yumurta sarısı; öğle saatlerinde kısa süreli güneş." },
      high: { meaning: "D vitamini yüksek; kullandığınız bir takviye varsa hekimle konuşun.", food: "" }
    },
    mg: {
      low: { meaning: "Magnezyum düşük görünüyor.", food: "Badem, ceviz, kabak çekirdeği, ıspanak, tam tahıllar." },
      high: { meaning: "Magnezyum yüksek; böbrek ve kullandığınız ürünler gözden geçirilmeli.", food: "" }
    },
    ca: {
      low: { meaning: "Kalsiyum düşük görünüyor.", food: "Süt, yoğurt, peynir, susam, kuru incir." },
      high: { meaning: "Kalsiyum yüksek; nedeni hekimle araştırılmalı.", food: "" }
    },
    zinc: { low: { meaning: "Çinko düşük görünüyor.", food: "Et, yumurta, nohut, kabak çekirdeği, tam tahıllar." } },
    hb: {
      low: { meaning: "Hemoglobin düşük; kansızlık olabilir.", food: "Demirden ve B12'den zengin besinler (kırmızı et, baklagiller, yumurta)." },
      high: { meaning: "Hemoglobin yüksek; nedeni hekimle değerlendirilmeli.", food: "" }
    },
    mcv: {
      low: { meaning: "Alyuvarlar küçük; çoğunlukla demir eksikliğiyle ilişkilidir.", food: "" },
      high: { meaning: "Alyuvarlar büyük; B12/folat eksikliği ile ilişkili olabilir.", food: "" }
    },
    crp: { high: { meaning: "CRP yüksek; vücutta bir iltihabi durum olabilir.", food: "" } },
    rbcFolate: { low: { meaning: "Eritrosit folatı düşük; uzun dönem folat yetersizliği olabilir.", food: "Yeşil yapraklı sebzeler, baklagiller, turunçgiller." } },
    hcy: { high: { meaning: "Homosistein yüksek; B12/folat eksikliği, böbrek veya tiroid nedenleri hekimle araştırılmalı.", food: "" } },
    alt: { high: { meaning: "Karaciğer enzimi (ALT) yüksek.", food: "" } },
    creatinine: { high: { meaning: "Böbrek süzme değeriniz normalin dışında.", food: "" } }
  };
  var NUTRIENT_LABEL = { D3_K2: "D vitamini", B12: "B12", Folat: "Folat", Demir: "Demir", Magnezyum: "Magnezyum", Kalsiyum: "Kalsiyum", "Çinko": "Çinko" };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function fmt(n) { return String(Math.round(n * 100) / 100).replace(".", ","); }
  function D() { return window.VitaClinicalData; }

  /* lab: the merged entry from collectLabs — its own report's range wins over the current form's */
  function refText(key, lab) {
    try {
      if (lab && lab.ref) return String(lab.ref);
      var own = !lab && state.labReferences && state.labReferences[key];
      if (own) return String(own);
      if (typeof getVitaAppLabReference === "function") return String(getVitaAppLabReference(key, (state.user && state.user.gender) || "K"));
    } catch (_) {}
    return "";
  }

  /* Belirtiye özgü acil/alarm işaretleri (tanı değil; ne zaman acil başvurulacağını söyler) */
  var RED_FLAGS = {
    numbness: { crit: true, t: "Uyuşma: ani veya tek taraflı ise acildir", d: "Yüzde, kolda veya bacakta ani başlayan tek taraflı uyuşma ya da güçsüzlük, konuşma veya görme bozukluğu inme belirtisi olabilir: 112'yi arayın. Yavaş seyreden uyuşma için hekim değerlendirmesi planlayın." },
    muscle_weakness: { crit: true, t: "Güçsüzlük: ani başlıyorsa acildir", d: "Ani başlayan güçsüzlük, yutma veya konuşma güçlüğü, idrar ya da dışkı kontrolünde kayıp veya nefes darlığı eşlik ediyorsa 112'yi arayın." },
    balance_difficulty: { crit: true, t: "Denge kaybı: ani başlıyorsa acildir", d: "Ani başlayan denge veya yürüme bozukluğu; yüzde sarkma, kol güçsüzlüğü, konuşma bozukluğu, şiddetli baş ağrısı ya da bayılma ile birlikteyse 112'yi arayın." },
    headache: { crit: true, t: "Baş ağrısı: alarm belirtilerini bilin", d: "Ani başlayan çok şiddetli ağrı, ateş ve ense sertliği, görme veya konuşma bozukluğu, bilinç değişikliği ya da baş travması sonrası ağrı varsa 112'yi arayın." },
    restlessness: { crit: true, t: "Çarpıntı: göğüs ağrısı veya bayılma varsa acil", d: "Çarpıntıyla birlikte göğüs ağrısı, nefes darlığı, bayılma veya devam eden düzensiz kalp atışı varsa acil servise başvurun." },
    orthostatic_dizziness: { crit: true, t: "Baş dönmesi: bayılma veya siyah dışkı varsa acil", d: "Bayılma, göğüs ağrısı, siyah veya kanlı dışkı ya da kusma eşlik ediyorsa acil servise başvurun. Kansızlığın nedeni olarak gizli kanama araştırılmalıdır." },
    unexplained_swelling: { crit: true, t: "Şişlik: nefes darlığı veya tek bacak şişliği acil", d: "Nefes darlığı, göğüs ağrısı ya da tek bacakta ani şişlik, ağrı ve kızarıklık varsa acil başvurun. Ödemin nedeni kalp, böbrek, karaciğer veya ilaç olabilir; vitamin ya da mineral eksikliği olarak yorumlanmamalıdır." },
    dark_nail_change: { crit: false, t: "Tırnakta koyu çizgi: dermatoloji muayenesi gerekir", d: "Yeni, genişleyen, tek tırnaktaki veya kanayan koyu çizgi/leke melanom açısından dermatolojik değerlendirme gerektirir; vitamin eksikliği olarak yorumlanmamalıdır." },
    sun_sensitive_rash: { crit: false, t: "Güneşe duyarlı döküntü: hekim değerlendirmesi", d: "Ateş, eklem ağrısı, ağız yaraları veya yaygın döküntü eşlik ediyorsa gecikmeden hekime başvurun; otoimmün hastalıklar ve ilaç reaksiyonları ayırt edilmelidir." },
    lip_twitching: { crit: false, t: "Seğirme ve kasılma: şiddetliyse aynı gün hekim", d: "Dudak çevresi ve parmaklarda uyuşma, kasılma veya kramp düşük kalsiyum/magnezyum belirtisi olabilir; şiddetliyse ya da çarpıntıyla birlikteyse aynı gün hekime başvurun." },
    easy_bruising: { crit: false, t: "Kolay morarma ve kanama: hekim kontrolü", d: "Sık burun veya diş eti kanaması, açıklanamayan yaygın morarma, ateş ya da halsizlik varsa hemogram (trombosit) için gecikmeden hekime başvurun. Kan sulandırıcı kullanıyorsanız hekiminize bildirin." },
    bleeding_gums: { crit: false, t: "Kolay morarma ve kanama: hekim kontrolü", d: "Sık burun veya diş eti kanaması, açıklanamayan yaygın morarma, ateş ya da halsizlik varsa hemogram (trombosit) için gecikmeden hekime başvurun. Kan sulandırıcı kullanıyorsanız hekiminize bildirin." }
  };

  function parseRangeText(text) {
    var m = String(text || "").replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*[–\-—]\s*(\d+(?:\.\d+)?)/);
    if (!m) return null;
    var a = Number(m[1]), b = Number(m[2]);
    return a < b ? [a, b] : null;
  }

  function build() {
    var d = D();
    var labs = d.collectLabs();
    var egfr = state.lastCDSS && state.lastCDSS.egfrResult && Number(state.lastCDSS.egfrResult.egfr) > 0 ? Math.round(Number(state.lastCDSS.egfrResult.egfr)) : null;

    var rows = [];
    Object.keys(labs).forEach(function (k) {
      var ev = d.evalLab(k, labs[k].value, labs[k].ref);
      var dir = ev.low ? "low" : (ev.high ? "high" : (ev.borderline ? "border" : "ok"));
      var extra = "";
      if (k === "creatinine" && egfr !== null) {
        extra = " · eGFR " + egfr;
        if (egfr < 60 && dir === "ok") dir = "high";
      }
      rows.push({ key: k, name: d.LAB_NAMES[k], value: labs[k].value, unit: d.LAB_UNITS[k], extra: extra, dir: dir, critical: ev.critical, source: labs[k].source,
        date: labs[k].date || null, older: !!labs[k].older, ref: refText(k, labs[k]), refFallback: !(labs[k] && labs[k].ref), refFrom: (labs[k] && labs[k].refFrom) || null });
    });
    /* Önceki ölçüm: aynı göstergenin bir önceki ölçümü (birleştirilmiş 90 günlük panelden) */
    var improved = [];
    rows.forEach(function (r) {
      var pv = labs[r.key] && labs[r.key].prev;
      if (!pv || !isFinite(Number(pv.value))) return;
      var prevV = Number(pv.value);
      var range = parseRangeText(refText(r.key, labs[r.key]));
      r.prev = { value: prevV, date: pv.date || "" };
      var prevOut = range ? (prevV < range[0] || prevV > range[1]) : false;
      var distOf = function (v) { return !range ? 0 : (v < range[0] ? range[0] - v : (v > range[1] ? v - range[1] : 0)); };
      var dNow = distOf(Number(r.value)), dPrev = distOf(prevV);
      if (prevOut && dNow === 0) { r.trend = "Normale ulaştı"; r.trendCls = "vs-t-good"; improved.push(r.name); }
      else if (range && dNow < dPrev) { r.trend = "Normale yaklaştı"; r.trendCls = "vs-t-good"; }
      else if (range && dNow > dPrev) { r.trend = "Normalden uzaklaştı"; r.trendCls = "vs-t-bad"; }
      else if (Number(r.value) === prevV) { r.trend = "Değişmedi"; r.trendCls = "vs-t-flat"; }
    });
    var bad = rows.filter(function (r) { return r.dir !== "ok"; }).sort(function (a, b) { return (b.critical ? 1 : 0) - (a.critical ? 1 : 0); });
    var ok = rows.filter(function (r) { return r.dir === "ok"; });

    /* Testler: tek bir birleşik, tekrarsız liste (sorunlu tahliller + belirtiler) */
    var testMap = {}, testOrder = [];
    var addTest = function (name, why, fromLab) {
      var n = d.norm(name).replace(/lipit/g, "lipid"); /* "Lipit Profili" = "Lipid profili" */
      if (!testMap[n]) { testMap[n] = { name: d.canon(name), why: [], lab: false }; testOrder.push(n); }
      var t = testMap[n];
      if (why && t.why.indexOf(why) === -1) t.why.push(why);
      if (fromLab) t.lab = true;
    };
    bad.forEach(function (r) {
      var f = d.FOLLOW_UP[r.key] && d.FOLLOW_UP[r.key][r.dir === "border" ? "low" : r.dir];
      if (!f) return;
      f.tests.slice(0, 3).forEach(function (t) {
        /* Girilmiş ve normal bir tahlille zaten karşılanan testi önerme (tekrar testleri hariç) */
        if (d.isCovered(t) && !f.keep && !/tekrar/i.test(t)) return;
        addTest(t, r.name + (r.dir === "high" ? " yüksek" : (r.dir === "border" ? " sınırda" : " düşük")), true);
      });
    });

    /* Belirtiler: yalnızca ad + olası eksikler; testleri birleşik listeye gider.
       Son 90 günde normal ölçülmüş testler istenmez; soluk bir notla gösterilir. */
    var normalNotes = [], noteSeen = {};
    var syms = d.selectedSymptomMetas().map(function (m) {
      var nutrients = (Array.isArray(m.nutrients) ? m.nutrients : []).map(function (n) { return NUTRIENT_LABEL[n] || n; });
      var name = m.symptomName || m.medicalName;
      /* Belirti başına en önemli 2 test (listenin başındakiler) */
      String(m.suggestedLab || "").split(",").map(function (s) { return s.trim(); })
        .filter(function (t) {
          if (!t) return false;
          if (!d.isCovered(t)) return true;
          var nc = d.normalCoverage ? d.normalCoverage(t, labs) : null;
          if (nc && !noteSeen[nc.key]) { noteSeen[nc.key] = true; normalNotes.push(nc); }
          return false;
        })
        .slice(0, 2)
        .forEach(function (t) { addTest(t, name, false); });
      return { name: name, nutrients: nutrients };
    });

    var tests = testOrder.map(function (n, i) { var o = testMap[n]; o._i = i; return o; })
      .sort(function (a, b) { return (b.why.length - a.why.length) || ((b.lab ? 1 : 0) - (a.lab ? 1 : 0)) || (a._i - b._i); });
    /* "ALP" is already part of "AST, GGT, ALP, bilirubin": keep the panel, carry over the reasons, drop the single test */
    var parts = function (t) { return t.name.toLocaleLowerCase("tr-TR").split(/\s*[,/]\s*/).map(function (s) { return s.trim(); }); };
    tests = tests.filter(function (t) {
      var me = t.name.toLocaleLowerCase("tr-TR").trim();
      var host = tests.filter(function (o) { return o !== t && parts(o).length > 1 && parts(o).indexOf(me) > -1; })[0];
      if (!host) return true;
      t.why.forEach(function (w) { if (host.why.indexOf(w) === -1) host.why.push(w); });
      host.lab = host.lab || t.lab;
      return false;
    });
    /* A test that IS requested (e.g. Hemogram for a high RBC) must not also show "measured normal in 90 days" */
    normalNotes = normalNotes.filter(function (n) { return !testMap[d.norm(n.test)]; });

    /* Güvenlik uyarıları: motorun ürettiği kutudan okunur; böbrek uyarıları "Değerlerim" satırına taşınır */
    var safety = [], kidney = [];
    var box = $("contraindicationAlertContainer");
    if (box) {
      Array.prototype.forEach.call(box.querySelectorAll("strong"), function (st) {
        var raw = (st.textContent || "").replace(/\s+/g, " ").trim();
        if (!raw) return;
        var p = st.nextElementSibling;
        var detail = p && p.tagName === "P" ? (p.textContent || "").replace(/\s+/g, " ").trim() : "";
        var item = { title: shortTitle(raw), detail: detail, crit: /⛔/.test(raw) };
        /* Yalnızca GENEL böbrek mesajları kreatinin satırına taşınır.
           İlaca/takviyeye özgü olanlar (ör. "Metformin & Azalmış GFR") hasta güvenliği için ayrı uyarı olarak kalır. */
        var generalKidney = /EMN[İI]YET K[İI]L[İI]D[İI]|B[öo]brek Fonksiyonu G[üu]venlik Uyar[ıi]s[ıi]/i.test(raw);
        var kidneyRelated = /b[öo]brek|kidney|renal|egfr/i.test(raw);
        if (kidneyRelated && generalKidney) kidney.push(item); else safety.push(item);
      });
    }
    var kidneyRow = rows.filter(function (r) { return r.key === "creatinine"; })[0];
    if (kidney.length && kidneyRow) {
      kidneyRow.kidneyNote = true;
      if (kidney.some(function (k) { return k.crit; }) && kidneyRow.dir === "ok") kidneyRow.dir = "high";
      kidneyRow.critical = kidneyRow.critical || kidney.some(function (k) { return k.crit; });
      if (bad.indexOf(kidneyRow) === -1 && kidneyRow.dir !== "ok") { bad.push(kidneyRow); ok = ok.filter(function (r) { return r !== kidneyRow; }); }
    } else if (kidney.length) {
      /* Kreatinin girilmemiş ama böbrek riski bildirilmiş: tek satırlık uyarı olarak göster */
      safety.push({ title: "Böbrek: ilaç ve mineral takviyesi başlamadan hekime danışın", detail: kidney[0].detail || "", crit: false });
    }

    /* ---- Hasta güvenliği: öncelikli uyarılar (en üstte) ---- */
    var pri = [];
    var user = state.user || {};
    var ageNum = Number(user.age);
    if (isFinite(ageNum) && ageNum > 0 && ageNum < 18) {
      pri.push({ title: "18 yaş altı: yetişkin referansları kullanılıyor", crit: false,
        detail: "Bu uygulama yetişkin referans aralıklarını ve kurallarını kullanır. Çocuk ve ergenlerde değerler farklıdır; sonuçları çocuk/aile hekiminizle değerlendirin. Takviye önerisi üretilmez." });
    }
    var pStage = user.gender === "E" ? "" : (user.pregnancyStage || (user.pregnancyLactation ? "lactation" : ""));
    if (pStage === "t1" || pStage === "t2" || pStage === "t3") {
      var tri = { t1: "1. trimester", t2: "2. trimester", t3: "3. trimester" }[pStage];
      pri.unshift({ title: "Gebelik (" + tri + "): gebelik referansları uygulandı", crit: false,
        detail: "Hemoglobin sınırı " + (pStage === "t2" ? "10,5" : "11") + " g/dL, kreatinin normali 0,4–0,8 mg/dL olarak değerlendirildi. eGFR formülleri gebelikte geçerli olmadığı için hesaplanmaz. Bu uygulama bu dönemde takviye adayı üretmez; vitamin, mineral ve bitkisel ürünleri doğum hekimi, ebe veya eczacı onayı olmadan kullanmayın. Tüm sonuçları doğum hekiminizle değerlendirin." });
      pri.push({ title: "Gebelikte acil belirtiler", crit: true,
        detail: "Şiddetli baş ağrısı, görme bozukluğu, yüz veya ellerde ani şişme, üst karın ağrısı, vajinal kanama, sıvı gelmesi, bebek hareketlerinde azalma, ateş ya da nefes darlığı varsa gecikmeden acil servise veya doğum hekimine başvurun (112)." });
    } else if (pStage === "lactation") {
      pri.unshift({ title: "Emzirme: ilaç ve takviye kararlarını hekim/eczacı ile verin", crit: false,
        detail: "Bu uygulama yetişkin kadın referanslarını kullanır. Bazı ilaçlar, bitkisel ürünler ve yüksek doz vitaminler süte geçebilir; takviye adayı üretilmez. Karar için hekim veya eczacıya danışın." });
    }
    var symKeys = state.selectedSymptoms instanceof Set ? Array.from(state.selectedSymptoms) : (Array.isArray(state.selectedSymptomsArray) ? state.selectedSymptomsArray : []);
    var seenRed = {};
    symKeys.forEach(function (k) {
      var rf = RED_FLAGS[k];
      if (rf && !seenRed[rf.t]) { seenRed[rf.t] = true; pri.push({ title: rf.t, detail: rf.d, crit: !!rf.crit }); }
    });
    /* Çok sapmış (acil) tahliller: kaynaklı metinle, gecikmeden hekime yönlendirme */
    var ev2 = window.VitaLabEvidence;
    if (ev2 && ev2.evaluate) {
      var gnd = (user.gender === "E") ? "E" : "K";
      var crpV = labs.crp ? labs.crp.value : null, hbV = labs.hb ? labs.hb.value : null;
      rows.forEach(function (r) {
        var R = null;
        try { R = ev2.evaluate(r.key, r.value, { gender: gnd, age: ageNum, crp: crpV, hb: hbV, reference: (labs[r.key] && labs[r.key].ref) || "" }); } catch (_) {}
        if (!R || R.status !== "urgent") return;
        var stem = r.name.toLocaleLowerCase("tr-TR").split(" ")[0];
        var dup = safety.concat(kidney).some(function (s) { return s.title.toLocaleLowerCase("tr-TR").indexOf(stem) > -1; });
        if (dup) return;
        pri.push({ title: r.name + " " + fmt(r.value) + " " + r.unit + ": gecikmeden hekim değerlendirmesi", detail: R.message || "", crit: true });
      });
    }
    /* Same warning from two rules (symptom red flag + engine box, e.g. "Tırnakta koyu çizgi" twice): keep one, merge details */
    /* Generic words ("gecikmeden hekim değerlendirmesi", "acil") must not make two different warnings look alike:
       only topic words count (Hb 7,4 and CRP 80 urgent warnings stay separate) */
    var GENERIC = /^(gecik|hekim|değer|acil|klini|gerek|veya|ise|için|başla|danış|önce|uyarı|yüksek|düşük|sonra|olabi|durum|ile|tek)/;
    var words = function (s) { return (s || "").toLocaleLowerCase("tr-TR").split(/[^a-zçğıöşü]+/).filter(function (w) { return w.length >= 4 && !GENERIC.test(w); }).map(function (w) { return w.slice(0, 5); }); };
    var merged = [];
    pri.concat(safety).forEach(function (it) {
      var wi = words(it.title);
      var twin = merged.filter(function (k) { var wk = words(k.title); return wi.filter(function (w) { return wk.indexOf(w) > -1; }).length >= 2; })[0];
      if (!twin) { merged.push(it); return; }
      twin.crit = twin.crit || it.crit;
      if (it.detail && (twin.detail || "").indexOf(it.detail) === -1) twin.detail = twin.detail ? twin.detail + " " + it.detail : it.detail;
    });
    safety = merged;

    var recall = state.lastCDSS && state.lastCDSS.recallInfo && state.lastCDSS.recallInfo.dateFormatted ? String(state.lastCDSS.recallInfo.dateFormatted) : "";

    return { rows: rows, bad: bad, ok: ok, syms: syms, tests: tests, normalNotes: normalNotes, hasLab: rows.length > 0, safety: safety, recall: recall, improved: improved };
  }

  /* Uzun, büyük harfli güvenlik başlıklarını tek satırlık sade cümleye çevir */
  function shortTitle(raw) {
    var c = raw.replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü]+/, "").replace(/\s+/g, " ").trim();
    var lc = c.toLocaleLowerCase("tr-TR");
    if (/hiperkalsemi/.test(lc)) return "Kalsiyum yüksek: D vitamini ve kalsiyum takviyesi kullanmayın";
    if (/hepatik|\bALT\b/.test(c)) return "ALT yüksek: yüksek doz takviye yalnızca hekim kontrolünde";
    var kd = c.match(/Kidney Safety\)\s*:\s*(.+)$/i);
    if (kd) return "Böbrek ve ilaç: " + kd[1].trim();
    c = c.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+AKTİF\b/i, "").replace(/\s*-\s*ALT.*$/i, "").trim();
    if (c === c.toLocaleUpperCase("tr-TR")) c = c.charAt(0) + c.slice(1).toLocaleLowerCase("tr-TR");
    return c;
  }

  var CHIP = { low: ["Düşük", "vs-low"], high: ["Yüksek", "vs-high"], border: ["Sınırda", "vs-border"], ok: ["Normal", "vs-ok"] };
  var ARROW = { low: "↓", high: "↑", border: "↓", ok: "" };

  function summaryHtml(m) {
    var title, sub = "";
    var nBad = m.bad.length;
    if (nBad) {
      title = "Dikkat edilmesi gereken " + nBad + " değer var";
    } else if (m.hasLab && m.syms.length) {
      title = "Girdiğiniz değerler normal görünüyor";
      sub = "Belirtileriniz için doktorunuzla konuşabileceğiniz testler aşağıda.";
    } else if (m.hasLab) {
      title = "Girdiğiniz değerler normal görünüyor";
      sub = "Belirtiniz seçilmedi. Şikâyetiniz varsa “Belirtileri düzenle” ile ekleyebilirsiniz.";
    } else {
      title = "Belirtilerinize göre kontrol edilebilecek testler hazır";
      sub = "Kesin bilgi için kan tahlili değerlerinizi girin.";
    }

    /* One-line verdict naming the values that need attention: "D vitamini düşük, B12 sınırda" */
    if (m.improved && m.improved.length) sub = (sub ? sub + " " : "") + "🎉 " + m.improved.join(", ") + " normale ulaştı.";

    /* One primary action only (Hick's law): report lives in the bottom nav, food in the "Destek" tab */
    var acts = [];
    if (m.tests.length) acts.push('<button type="button" class="vs-act vs-act-main" data-vs="tests"><i class="fa-solid fa-vial" aria-hidden="true"></i><span>Doktora sorulacaklar</span><b>' + m.tests.length + '</b></button>');
    if (!m.hasLab) acts.push('<button type="button" class="vs-act vs-act-main" data-vs="labs"><i class="fa-solid fa-flask-vial" aria-hidden="true"></i><span>Tahlil gir</span></button>');

    var html = '<section class="vs-card vs-hero" id="vsHero"><div class="vs-hero-top"><span class="vs-hero-ico" aria-hidden="true"><i class="fa-solid fa-clipboard-check"></i></span><div>' +
      '<h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : "") + '</div></div>' +
      '<div class="vs-acts">' + acts.join("") + '</div>' +
      '<div class="vs-hero-foot">' + (nBad ? '<span><i class="fa-solid fa-shield-heart" aria-hidden="true"></i> Takviyeye hekiminize danışmadan başlamayın</span>' : '<span></span>') +
      '<button type="button" class="vs-link" data-vs="edit"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Belirtileri düzenle</button></div></section>';
    return html;
  }

  /* Safety warnings: one collapsed card right below the verdict block (count in the header); each warning opens on tap */
  /* Urgent (rose) warnings are always visible above the tabs; the other warnings sit in one collapsed drawer */
  function safetyStripHtml(m) {
    if (!m.safety.length) return "";
    var warn = function (s) {
      return '<details class="vs-warn' + (s.crit ? " vs-warn-crit" : "") + '"><summary><span class="vs-warn-t">' + esc(s.title) + '</span>' +
        (s.detail ? '<i class="fa-solid fa-chevron-down vs-chev" aria-hidden="true"></i>' : "") + '</summary>' +
        (s.detail ? '<div class="vs-warn-body">' + esc(s.detail) + '</div>' : "") + '</details>';
    };
    var crit = m.safety.filter(function (s) { return s.crit; }), rest = m.safety.filter(function (s) { return !s.crit; });
    var html = '<div id="vsSafety">';
    if (crit.length) html += '<div class="vs-card vs-safety-urgent">' + crit.map(function (s) {
      return warn(s).replace('<summary>', '<summary><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>');
    }).join("") + '</div>';
    if (rest.length) html += '<details class="vs-card vs-safety-box"><summary><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>' + (crit.length ? "Diğer güvenlik uyarıları" : "Güvenlik uyarıları") + '</span><span class="vs-count">' + rest.length + '</span><i class="fa-solid fa-chevron-down vs-chev" aria-hidden="true"></i></summary><div class="vs-safety">' +
      rest.map(warn).join("") + '</div></details>';
    return html + '</div>';
  }

  /* Tabs: Özet | Hekim & Test | Destek — one chunk visible at a time (progressive disclosure) */
  var activeTab = "ozet";
  function tabsHtml(m, panels) {
    var nTests = m.tests.length;
    var tabs = [["ozet", "Özet", m.bad.length], ["hekim", "Testler", nTests], ["destek", "Destek", 0]];
    return '<div class="vs-tabs" role="tablist" aria-label="Klinik analiz bölümleri">' + tabs.map(function (t) {
      var on = t[0] === activeTab;
      return '<button type="button" role="tab" class="vs-tab' + (on ? " on" : "") + '" data-vs="tab" data-tab="' + t[0] + '" aria-selected="' + on + '" aria-controls="vsPanel-' + t[0] + '">' + t[1] + (t[2] ? ' <b>' + t[2] + '</b>' : "") + '</button>';
    }).join("") + '</div>' +
      ["ozet", "hekim", "destek"].map(function (k) { return '<div class="vs-panel" role="tabpanel" id="vsPanel-' + k + '" data-panel="' + k + '"' + (k === activeTab ? "" : " hidden") + '>' + (panels[k] || "") + '</div>'; }).join("");
  }
  function showTab(k) {
    activeTab = k;
    Array.prototype.forEach.call(document.querySelectorAll("#vitaSimpleHost .vs-tab"), function (b) { var on = b.getAttribute("data-tab") === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    Array.prototype.forEach.call(document.querySelectorAll("#vitaSimpleHost .vs-panel"), function (p) { p.hidden = p.getAttribute("data-panel") !== k; });
    var bar = document.querySelector("#vitaSimpleHost .vs-tabs");
    if (bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: "start" });
  }
  /* Legacy cards rendered by older code (food sources, supplement forms) move into the "Destek" tab */
  var LEGACY_SUPPORT = ["foodAlternativesSection", "protocolRecommendationSection"];
  function adoptSupportCards() {
    var panel = document.getElementById("vsPanel-destek"); if (!panel) return;
    var slot = panel.querySelector(".vs-support-slot");
    LEGACY_SUPPORT.forEach(function (id) { var el = $(id); if (el && slot && el.parentElement !== slot) slot.appendChild(el); });
    var any = LEGACY_SUPPORT.some(function (id) { var el = $(id); return el && !el.classList.contains("hidden") && el.innerHTML.trim(); });
    var empty = panel.querySelector(".vs-support-empty"); if (empty) empty.hidden = any;
  }

  /* Subtle date tag when a merged value comes from an earlier lab than the newest one */
  function dateTag(r) {
    return (r.older && r.date ? ' <span class="vs-date-tag" title="Bu değer daha önceki bir tahlilden">' + esc(r.date.split("-").reverse().join(".")) + '</span>' : "") + fallbackTag(r);
  }
  /* Fallback indicator: the report had no lab range for this value, the app's general range was used */
  function fallbackTag(r) {
    if (r.refFrom) return ' <span class="vita-inherited-tag" data-inherited="' + esc(r.refFrom) + '" title="Bu tahlilde aralık yoktu; ' + esc(r.refFrom.split("-").reverse().join(".")) + ' tarihli tahlilinizdeki laboratuvar aralığı kullanıldı">önceki aralık</span>';
    return r.refFallback ? ' <span class="vita-fallback-tag" data-fallback="range" title="Raporda laboratuvar aralığı yok; VitaTakip genel karşılaştırma aralığı kullanıldı">genel aralık</span>' : "";
  }

  function normalNotesHtml(m) {
    if (!m.normalNotes || !m.normalNotes.length) return "";
    return '<div class="vs-normal-notes">' + m.normalNotes.map(function (n) {
      return '<p class="vs-normal-note"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> <b>' + esc(n.test) + '</b>: ' + esc(n.text) + '</p>';
    }).join("") + '</div>';
  }

  /* Değerler: dikkat isteyenler sade satırlar (açılmaz); normal değerler en altta küçük bir çekmecede */
  function valuesHtml(m) {
    if (!m.hasLab || (!m.bad.length && !m.ok.length)) return "";
    var html = '<section class="vs-card vs-values" id="vsValues"><h3 class="vs-h">' + (m.bad.length ? 'Dikkat isteyen değerler <span class="vs-count">' + m.bad.length + '</span>' : 'Değerleriniz normal') + '</h3>';
    m.bad.forEach(function (r) {
      var chip = CHIP[r.dir];
      var note = "";
      if (r.key === "creatinine" && typeof isPregnantNow === "function" && isPregnantNow()) note = "Gebelik için yüksek sayılır; doğum hekiminize bildirin.";
      else if (r.kidneyNote) note = "İlaç ve takviye kullanmadan önce hekime danışın.";
      html += '<div class="vs-val' + (r.critical ? " vs-val-crit" : "") + '" data-key="' + esc(r.key) + '">' +
        '<span class="vs-val-name">' + esc(r.name) + (dateTag(r) ? '<span class="vs-val-tags">' + dateTag(r) + '</span>' : '') + '</span>' +
        '<span class="vs-val-num">' + esc(fmt(r.value)) + ' <small>' + esc(r.unit) + esc(r.extra) + '</small></span>' +
        '<span class="vs-chip ' + chip[1] + '">' + chip[0] + '</span>' +
        (note ? '<span class="vs-val-note">' + esc(note) + '</span>' : '') + '</div>';
    });
    if (m.ok.length) {
      html += '<details class="vs-okdrawer"' + (m.bad.length ? '' : ' open') + '><summary>Normal değerler <span>' + m.ok.length + '</span><i class="fa-solid fa-chevron-down vs-chev" aria-hidden="true"></i></summary>' + okRowHtml(m) + '</details>';
    }
    return html + '</section>';
  }

  function okRowHtml(m) {
    return '<div class="vs-okrow">' + m.ok.map(function (r) {
      return '<span class="vs-okchip">' + esc(r.name) + ' <b>' + esc(fmt(r.value)) + '</b>' + dateTag(r) + '</span>';
    }).join("") + '</div>';
  }
  /* Layer 3: secondary information, each group collapsed by default inside one "Ayrıntılar" card */
  function detailsHtml(m) {
    var groups = [];
    var add = function (id, icon, title, count, body) { if (body) groups.push({ id: id, icon: icon, title: title, count: count, body: body }); };
    var rel = relationsCardHtml(m);
    add("rel", "fa-link", "Tahliller arası ilişkiler", (rel.match(/vs-rel"/g) || []).length, rel);
    if (!groups.length) return "";
    return '<section class="vs-card vs-details" id="vsDetails"><h3 class="vs-h"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Ayrıntılar</h3>' +
      groups.map(function (g) {
        return '<details class="vs-det" data-det="' + g.id + '"><summary><i class="fa-solid ' + g.icon + '" aria-hidden="true"></i><span>' + esc(g.title) + '</span>' +
          (g.count ? '<span class="vs-count">' + g.count + '</span>' : "") + '<i class="fa-solid fa-chevron-down vs-chev" aria-hidden="true"></i></summary><div class="vs-det-body">' + g.body + '</div></details>';
      }).join("") + '</section>';
  }

  /* Pre-lab preparation micro-guide (shared by Klinik Analiz card and the Tahlillerim helper) */
  var PRELAB_ITEMS = [
    ["fa-moon", "8–12 saat açlık", "Genellikle akşam 19.00–20.00'den sonra yemek yemeyin."],
    ["fa-glass-water", "Sabah su için", "Kan vermeden önce yeterli su içmek önemlidir; susuzluk hemoglobin ve kırmızı kan hücrelerini olduğundan yüksek gösterebilir."],
    ["fa-ban", "Çay ve kahve içmeyin", "Sabah yalnızca sade su tüketin."],
    ["fa-capsules", "Takviyeler", "Demir, B12 veya biotin gibi takviyeleri tahlilden önce kesip kesmeyeceğinizi hekiminize danışın."]
  ];
  function prelabListHtml() {
    return '<ul class="vs-prelab-list">' + PRELAB_ITEMS.map(function (it) {
      return '<li><i class="fa-solid ' + it[0] + '" aria-hidden="true"></i><span><b>' + esc(it[1]) + ':</b> ' + esc(it[2]) + '</span></li>';
    }).join("") + '</ul><p class="vs-prelab-foot">Hekiminizin özel talimatları her zaman önceliklidir.</p>';
  }
  function prelabCardHtml() {
    return '<section class="vs-card vs-prelab" id="vsPrelab"><h3 class="vs-h"><i class="fa-solid fa-droplet" aria-hidden="true"></i> Kan Vermeye Gitmeden Önce</h3>' + prelabListHtml() + '</section>';
  }
  function fillPrelabHosts() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-prelab-guide]"), function (el) { if (!el.innerHTML) el.innerHTML = prelabListHtml(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fillPrelabHosts, { once: true }); else fillPrelabHosts();

  /* Cross-biomarker observations from VitaLabInsights (90-day merged panel); each one collapsible */
  function relationsCardHtml(m) {
    var pats = [];
    try { pats = window.VitaLabInsights ? VitaLabInsights.analyze().patterns : []; } catch (_) { pats = []; }
    if (!m.hasLab || !pats.length) return "";
    var html = '<div id="vsRelations">';
    pats.forEach(function (p) {
      html += '<details class="vs-warn vs-rel"><summary><span class="vs-warn-t">' + esc(p.title) + '</span><i class="fa-solid fa-chevron-down vs-chev" aria-hidden="true"></i></summary><div class="vs-warn-body">' + esc(p.text) + '</div></details>';
    });
    return html + '<p class="vs-rel-foot">Kural tabanlı ön gözlemlerdir; tanı koymaz, nihai karar hekime aittir.</p></div>';
  }

  function symptomsHtml(m) {
    if (!m.syms.length) return "";
    var VISIBLE = 5;
    var one = function (s) {
      return '<div class="vs-sym"><div class="vs-sym-name">' + esc(s.name) + '</div>' +
        (s.nutrients.length ? '<div class="vs-sym-for">Olası eksik: ' + s.nutrients.map(esc).join(", ") + '</div>' : "") + '</div>';
    };
    var html = '<section class="vs-card"><h3 class="vs-h"><i class="fa-solid fa-stethoscope" aria-hidden="true"></i> Belirtileriniz</h3>' +
      m.syms.slice(0, VISIBLE).map(one).join("");
    if (m.syms.length > VISIBLE) {
      html += '<details class="vs-more"><summary>Diğer ' + (m.syms.length - VISIBLE) + ' belirti <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>' +
        m.syms.slice(VISIBLE).map(one).join("") + '</details>';
    }
    return html + '</section>';
  }

  /* Doktordan istenebilecek testler: sayfada yalnızca BU kartta, tekrarsız */
  function recallHtml(m) {
    return m.recall ? '<div class="vs-recall" title="Bu tarih yalnızca uygulama içi hatırlatmadır; kontrol zamanını doktorunuz belirler."><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Kontrol tahlili hatırlatması: <b>' + esc(m.recall) + '</b></div>' : "";
  }

  /* Doktordan istenebilecek testler: tahlil kaynaklı testler açık; belirtilere göre testler "Belirtilerinize göre testler"
     çekmecesinde — her testin altında belirtileri, yanındaki (!) olası eksikleri açar. En altta kan verme hazırlığı. */
  /* Clinical exams, imaging, specialist referrals and medication reviews are not lab tests: listed in their own card */
  var EXAM_RE = /muayene|değerlendirme|gözden geçir|EKG|ultrason|tansiyon|konsültasyon|sevk|schirmer|gözyaşı/i;
  /* Symptom-based lab tests grouped by type; the (!) "olası eksik" button only makes sense for vitamin/mineral tests */
  var NUTRIENT_TEST_RE = /vitamin|b12|folat|ferritin|demir|tibc|transferrin|çinko|bakır|magnezyum|kalsiyum|biyotin|selenyum|iyot|metilmalonik|mma|homosistein|omega|potasyum|fosfor/i;
  function testGroup(name) { return /[iİ]drar/i.test(name) ? "urine" : (NUTRIENT_TEST_RE.test(name) ? "nutrient" : "blood"); }
  function isExam(name) { return EXAM_RE.test(name) && !/sistatin/i.test(name); }
  function nutOf0(symNut) {
    return function (whys) {
      var seen = {}, out = [];
      whys.forEach(function (w) { (symNut[w] || []).forEach(function (n) { if (!seen[n]) { seen[n] = true; out.push(n); } }); });
      return out;
    };
  }
  function examsHtml(exams, symNut, nutOf) {
    if (!exams.length) return "";
    return '<section class="vs-card vs-exams" id="vsExams"><h3 class="vs-h"><i class="fa-solid fa-stethoscope" aria-hidden="true"></i> Klinik Muayene ve Uzmanlık Önerileri</h3>' +
      '<p class="vs-exams-sub">Kan tahlili değildir; hekiminizin muayene, görüntüleme, ilaç gözden geçirme veya uzman yönlendirmesi olarak değerlendirebileceği adımlardır.</p>' +
      exams.map(function (t) {
        var nut = [];
        return '<div class="vs-test vs-test-exam"><span class="vs-test-name">' + esc(t.name) +
          (nut.length ? '<button type="button" class="vs-nut-btn" data-vs="nut" aria-expanded="false" aria-label="Olası eksikleri göster" title="Olası eksikler">!</button>' : "") + '</span>' +
          (t.why.length ? '<span class="vs-test-why">' + t.why.map(esc).join(" · ") + '</span>' : "") +
          (nut.length ? '<span class="vs-nut" hidden>Olası eksik: ' + nut.map(esc).join(", ") + '</span>' : "") + '</div>';
      }).join("") + '</section>';
  }
  function testsHtml(m) {
    var symNut = {};
    m.syms.forEach(function (s) { symNut[s.name] = s.nutrients; });
    var labTests = m.tests.filter(function (t) { return t.lab && !isExam(t.name); });
    var symTests = m.tests.filter(function (t) { return !t.lab && !isExam(t.name); });
    var exams = m.tests.filter(function (t) { return isExam(t.name); });
    var usedSyms = {};
    m.tests.forEach(function (t) { t.why.forEach(function (w) { if (symNut[w]) usedSyms[w] = true; }); });
    var restSyms = m.syms.filter(function (s) { return !usedSyms[s.name] && s.nutrients.length; });
    var examHtml = examsHtml(exams, symNut, nutOf0(symNut));
    if (!labTests.length && !symTests.length && !restSyms.length) return examHtml + '<section class="vs-card" id="vsTests"><details class="vs-more vs-prelab-more"><summary>Kan vermeye gitmeden önce <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div id="vsPrelab">' + prelabListHtml() + '</div></details>' + recheckDrawerHtml(m) + '</section>';

    var labRow = function (t) {
      return '<div class="vs-test"><span class="vs-test-name">' + esc(t.name) + '</span>' +
        (t.why.length ? '<span class="vs-test-why">' + t.why.map(esc).join(" · ") + '</span>' : "") + '</div>';
    };
    var nutOf = function (whys) {
      var seen = {}, out = [];
      whys.forEach(function (w) { (symNut[w] || []).forEach(function (n) { if (!seen[n]) { seen[n] = true; out.push(n); } }); });
      return out;
    };
    var symRow = function (name, whys, nut) {
      return '<div class="vs-test vs-test-sym"><span class="vs-test-name">' + esc(name) +
        (nut.length ? '<button type="button" class="vs-nut-btn" data-vs="nut" aria-expanded="false" aria-label="Olası eksikleri göster" title="Olası eksikler">!</button>' : "") + '</span>' +
        (whys.length ? '<span class="vs-test-why">' + whys.map(esc).join(" · ") + '</span>' : "") +
        (nut.length ? '<span class="vs-nut" hidden>Olası eksik: ' + nut.map(esc).join(", ") + '</span>' : "") + '</div>';
    };

    var GROUPS = [["nutrient", "Vitamin ve mineral testleri"], ["blood", "Diğer kan testleri"], ["urine", "İdrar testleri"]];
    var symHtml = GROUPS.map(function (g) {
      var list = symTests.filter(function (t) { return testGroup(t.name) === g[0]; });
      if (!list.length) return "";
      return '<div class="vs-grp-h">' + g[1] + '</div>' + list.map(function (t) { return symRow(t.name, t.why, g[0] === "nutrient" ? nutOf(t.why) : []); }).join("");
    }).join("") +
      (restSyms.length ? '<div class="vs-grp-h">Teste bağlanmayan belirtiler</div>' + restSyms.map(function (s) {
        return '<div class="vs-test vs-test-sym"><span class="vs-test-name">' + esc(s.name) + '</span><span class="vs-test-why">Olası eksik: ' + s.nutrients.map(esc).join(", ") + '</span></div>';
      }).join("") : "");
    var nSym = symTests.length + restSyms.length;

    var html = '<section class="vs-card" id="vsTests"><div class="vs-h-row"><h3 class="vs-h"><i class="fa-solid fa-vial" aria-hidden="true"></i> Lab Testleri</h3>' +
      '<button type="button" class="vs-copy" data-vs="copy"><i class="fa-regular fa-copy" aria-hidden="true"></i> Kopyala</button></div>';
    if (labTests.length) {
      /* One row per reason ("25-OH Vitamin D düşük") with its tests side by side, instead of repeating the reason on every test */
      var byWhy = {}, whyOrder = [];
      labTests.forEach(function (t) { var k = t.why.join(" · "); if (!byWhy[k]) { byWhy[k] = []; whyOrder.push(k); } byWhy[k].push(t); });
      html += whyOrder.map(function (k) {
        return '<div class="vs-test vs-test-grp">' + (k ? '<span class="vs-test-why vs-why-h">' + esc(k) + '</span>' : "") + '<span class="vs-test-names">' +
          byWhy[k].map(function (t) { return '<span class="vs-test-name">' + esc(t.name) + '</span>'; }).join("") + '</span></div>';
      }).join("");
      if (nSym) html += '<details class="vs-more"><summary>Belirtilerinize göre testler <span class="vs-more-n">' + nSym + '</span> <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>' + symHtml + '</details>';
    } else {
      html += '<div class="vs-sub-h">Belirtilerinize göre testler</div>' + symHtml;
    }
    html += '<details class="vs-more vs-prelab-more"><summary><i class="fa-solid fa-droplet" aria-hidden="true"></i> Kan vermeye gitmeden önce <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div id="vsPrelab">' + prelabListHtml() + '</div></details>' + recheckDrawerHtml(m);
    return html + '</section>' + examHtml;
  }
  function recheckDrawerHtml(m) {
    var rc = (window.VitaRecheck ? VitaRecheck.cardHtml(m) : "") + recallHtml(m);
    return rc ? '<details class="vs-more vs-recheck-more" id="vsRecheck"><summary><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Kontrol ölçümü <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div class="vs-det-body">' + rc + '</div></details>' : "";
  }

  function plainText(m) {
    var L = ["VitaTakip - doktora sorulacaklar", ""];
    var line = function (t) { L.push("- " + t.name + (t.why.length ? " (" + t.why.join(", ") + ")" : "")); };
    var labs = m.tests.filter(function (t) { return !isExam(t.name); }), ex = m.tests.filter(function (t) { return isExam(t.name); });
    if (labs.length) { L.push("Lab testleri:"); labs.forEach(line); L.push(""); }
    if (ex.length) { L.push("Klinik muayene ve uzmanlık önerileri:"); ex.forEach(line); }
    L.push("");
    L.push("Not: Tanı veya talimat değildir; kararı hekim verir.");
    return L.join("\n");
  }

  var current = null;

  function render(show) {
    var host = $("vitaSimpleHost");
    if (!host) return;
    if (show === false) { host.classList.add("hidden"); host.innerHTML = ""; var dh0 = $("vitaDetailsHost"); if (dh0) dh0.innerHTML = ""; return; }
    var m;
    try { m = build(); } catch (e) { console.warn("[VitaTakip] clinical-simple:", e); return; }
    current = m;
    /* Sıra: sonuç bloğu → acil uyarılar (hep açık) → sekmeler: Özet | Hekim & Test | Destek */
    /* Legacy cards are inside the host after a previous render: park them back before replacing the host's HTML */
    var parking = $("vitaDetailsHost");
    LEGACY_SUPPORT.forEach(function (id) { var el = $(id); if (el && parking && host.contains(el)) parking.parentElement.insertBefore(el, parking); });
    var rel = relationsCardHtml(m), nRel = (rel.match(/vs-rel"/g) || []).length;
    var panels = {
      ozet: valuesHtml(m) + (window.VitaAgeStage ? VitaAgeStage.cardHtml() : "") +
        (rel ? '<details class="vs-card vs-det-card"><summary><i class="fa-solid fa-link" aria-hidden="true"></i><span>Tahliller arası ilişkiler</span><span class="vs-count">' + nRel + '</span><i class="fa-solid fa-chevron-down vs-chev" aria-hidden="true"></i></summary><div class="vs-det-body">' + rel + '</div></details>' : "") +
        (!m.hasLab ? '<p class="vs-empty">Tahlil girilmedi; belirtilerinize göre testler "Testler" sekmesinde.</p>' : ""),
      hekim: testsHtml(m),
      destek: '<p class="vs-support-note"><i class="fa-solid fa-shield-heart" aria-hidden="true"></i> Hekiminizle konuşmanız içindir; tanı koymaz, tedavi önermez.</p><div class="vs-support-slot"></div><p class="vs-empty vs-support-empty">Şu an gösterilecek besin veya takviye bilgisi yok.</p>'
    };
    if (!m.hasLab && activeTab === "ozet") activeTab = "hekim";
    host.innerHTML = summaryHtml(m) + safetyStripHtml(m) + tabsHtml(m, panels);
    var dh = $("vitaDetailsHost"); if (dh) dh.innerHTML = "";
    host.classList.remove("hidden");
    adoptSupportCards();
    setTimeout(adoptSupportCards, 400); /* legacy cards fill in after the CDSS run */
  }

  function onClick(e) {
    var t = e.target.closest && e.target.closest("[data-vs]");
    if (!t) return;
    var a = t.getAttribute("data-vs");
    if (a === "copy" && current) {
      var txt = plainText(current);
      var done = function () { if (typeof showToast === "function") showToast("Kopyalandı", "Liste panoya alındı.", "success"); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done); else done();
    } else if (a === "nut") {
      var box = t.parentNode && t.parentNode.parentNode && t.parentNode.parentNode.querySelector(".vs-nut");
      if (box) { box.hidden = !box.hidden; t.setAttribute("aria-expanded", box.hidden ? "false" : "true"); }
    } else if (a === "tab") {
      showTab(t.getAttribute("data-tab"));
    } else if (a === "tests") {
      showTab("hekim");
      var tt = document.querySelector("#vitaSimpleHost .vs-tabs");
      if (tt) tt.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (a === "food") {
      showTab("destek");
    } else if (a === "labs") { if (typeof navigateToView === "function") navigateToView("view-labs"); }
    else if (a === "report") { if (typeof transferToDoctorReport === "function") transferToDoctorReport(); else if (typeof navigateToView === "function") navigateToView("view-report"); }
    else if (a === "edit") {
      if (typeof editSymptomsFromClinicalResults === "function") editSymptomsFromClinicalResults();
      else if (typeof navigateToView === "function") navigateToView("view-neyim");
    }
  }

  document.addEventListener("click", onClick);
  window.renderVitaSimple = render;
  /* Rapor sayfası (js/report-simple.js) aynı veri modelini kullanır: tek doğruluk kaynağı */
  window.VitaSimpleModel = { build: build, fmt: fmt, CHIP: CHIP, isExam: isExam };
})();
