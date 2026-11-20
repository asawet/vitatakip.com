/* Takviye Ekle sayfası: kompakt kullanım planı (günde kaç adet −/+, Her gün / belirli günler, çoklu vakit + saat),
   canlı özet, akıllı zamanlama önerisi ve mevcut takviye/ilaçlarla saat çakışması uyarısı (en az 2 saat).
   Kayıt commitManualSupplement'ta: her vakit için bir kayıt (aynı groupId), gün listesi scheduleDays. */
(function () {
  "use strict";
  var ORDER = ["Sabah", "Öğle", "Akşam", "Gece"];
  var DEFAULT_CLOCK = { "Sabah": "08:00", "Öğle": "13:00", "Akşam": "19:00", "Gece": "22:00" };
  var ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
  var st = { freq: "daily", days: new Set(ALL_DAYS), vakits: { "Sabah": DEFAULT_CLOCK["Sabah"] } };

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function fold(v) { return typeof window.vitaFold === "function" ? window.vitaFold(v) : String(v || "").toLocaleLowerCase("tr-TR"); }
  function isClock(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")); }
  function mins(c) { var p = String(c || "00:00").split(":"); return Number(p[0]) * 60 + Number(p[1]); }
  function clockFrom(m) { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }

  /* Ürün türüne göre kısa zamanlama/emilim önerisi */
  var ADVICE = [
    [/omega|balik yagi|\bepa\b|\bdha\b/, "Emilim için akşam veya yağlı bir öğünle tok karnına alınması önerilir."],
    [/d3|d vitamini|vitamin d|kolekalsiferol|k2|menakinon/, "Sabah veya öğlen saatlerinde, yağ içeren bir öğünle alınması tavsiye edilir."],
    [/demir|ferro|iron|feramat|microfer|lipofer/, "Aç karnına veya yemeklerden 2 saat sonra alınız; çay, kahve ve süt ürünlerinden 2 saat uzak tutun."],
    [/magnezyum|magnesium/, "Akşam veya yatmadan önce alınması önerilir; demir ve tiroid ilacından ayrı saatte alın."],
    [/kalsiyum|calcium|osteocare/, "Yemekle birlikte alın; demir ve çinkodan en az 2 saat ayrı tutun."],
    [/cinko|zinc/, "Yemekle birlikte alın (aç karnına mide bulandırabilir); demir ve kalsiyumdan ayrı saatte alın."],
    [/b12|kobalamin/, "Sabah alınması önerilir; dilaltı formu dilin altında eriyene kadar bekletin."],
    [/folat|folik/, "Sabah, yemekle veya yemeksiz alınabilir."],
    [/c vitamini|vitamin c|redoxon/, "Yemekle alın; demirle birlikte alınırsa demir emilimini artırır."],
    [/probiyotik/, "Kahvaltıdan önce alın; sıcak içecekle birlikte almayın."],
    [/kolajen|collagen/, "Bol suyla, tercihen sabah aç karnına alın."],
    [/multivitamin|supradyn|pharmaton/, "Kahvaltıda, yemekle birlikte alın."]
  ];
  function adviceFor(text) { var t = fold(text); for (var i = 0; i < ADVICE.length; i++) if (ADVICE[i][0].test(t)) return ADVICE[i][1]; return ""; }

  /* ---- Ürün tanıma (şablon veya elle yazılan ad): forma özel çipler, önerilen aç/tok, etken madde ---- */
  var PRODUCTS = [
    { key: "D3_K2", rx: /\bd3\b|d3 |k2|d vitamini|vitamin d|kolekalsiferol|menakinon/, hunger: "Tok karnına", active: "Kolekalsiferol (D3) + Menakinon-7 (K2)" },
    { key: "Omega3", rx: /omega|balik yagi|\bepa\b|\bdha\b/, hunger: "Tok karnına", active: "EPA + DHA (balık yağı)" },
    { key: "Demir", rx: /demir|ferro|\biron\b|feramat|microfer|lipofer/, hunger: "Aç karnına", active: "Demir (elemental Fe)" },
    { key: "B12", rx: /b12|kobalamin/, hunger: "", active: "Metilkobalamin (B12)" },
    { key: "Folat", rx: /folat|folik/, hunger: "", active: "5-MTHF (metilfolat)" },
    { key: "Magnezyum", rx: /magnezyum|magnesium/, hunger: "", active: "Magnezyum (sitrat / bisglisinat)" },
    { key: "Çinko", rx: /cinko|\bzinc\b/, hunger: "Yemekle birlikte", active: "Çinko (pikolinat / bisglisinat)" },
    { key: "Kolajen", rx: /kolajen|collagen/, hunger: "Aç karnına", active: "Hidrolize kolajen peptitleri" },
    { key: "Kreatin", rx: /kreatin|creatine/, hunger: "", active: "Kreatin monohidrat" },
    // Şablonu olmayan ama önerisi bilinenler
    { key: "", rx: /kalsiyum|calcium|osteocare/, hunger: "Yemekle birlikte" },
    { key: "", rx: /probiyotik|probiotic/, hunger: "Aç karnına" },
    { key: "", rx: /multivitamin|supradyn|pharmaton/, hunger: "Yemekle birlikte" }
  ];
  var GENERIC_FORMS = ["Tablet", "Kapsül", "Damla", "Saşe", "Sprey", "Ölçek / mL"];
  var FORM_LABEL = { "Yumusak_Kapsul": "Yumuşak Kapsül", "Sıvı_Yağ": "Sıvı Yağ", "Dilaltı_Tablet": "Dilaltı Tablet", "Dilaltı_Sprey": "Dilaltı Sprey", "Sıvı_Shot": "Sıvı Shot" };
  function formLabel(k) { return FORM_LABEL[k] || String(k || "").replace(/_/g, " "); }
  function templateCfg(key) { try { return key && typeof FORM_DOSAGE_CONFIG !== "undefined" ? FORM_DOSAGE_CONFIG[key] || null : null; } catch (_) { return null; } }
  function chosenTemplate() { var sel = $("modalCatalogSelect"); return sel && sel.value && sel.value !== "custom" ? sel.value : ""; }
  function detectProduct() {
    var tk = chosenTemplate();
    if (tk) { for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].key === tk) return PRODUCTS[i]; return { key: tk }; }
    var t = fold((($("manualSupName") || {}).value || "") + " " + (($("manualSupBrandActive") || {}).value || ""));
    if (t.trim().length < 2) return null;
    for (var j = 0; j < PRODUCTS.length; j++) if (PRODUCTS[j].rx.test(t)) return PRODUCTS[j];
    return null;
  }

  /* ---- Forma göre birim ve stok (adet / damla / puf / mL / ölçek) ---- */
  function unitForForm(form) {
    var f = fold(form);
    if (!f.trim()) return "";
    if (/sprey|puf/.test(f)) return "puf";
    if (/damla/.test(f)) return "damla";
    if (/sase/.test(f)) return "saşe";
    if (/\bml\b|surup|sivi|shot/.test(f)) return "mL";
    if (/olcek|toz/.test(f)) return "ölçek";
    if (/kapsul|softgel|pellet/.test(f)) return "kapsül";
    return "tablet";
  }
  var UNIT_INFO = {
    "tablet": { box: 30, daily: "Günde kaç adet?", boxLbl: "Kutudaki adet", remLbl: "Kalan adet", note: "Kutuyu daha önce açtıysanız kalan adedi düzeltin." },
    "kapsül": { box: 30, daily: "Günde kaç adet?", boxLbl: "Kutudaki adet", remLbl: "Kalan adet", note: "Kutuyu daha önce açtıysanız kalan adedi düzeltin." },
    "saşe": { box: 30, daily: "Günde kaç saşe?", boxLbl: "Kutudaki saşe", remLbl: "Kalan saşe", note: "Kutuyu daha önce açtıysanız kalan saşe sayısını düzeltin." },
    "damla": { box: 400, daily: "Günde kaç damla?", boxLbl: "Şişedeki damla", remLbl: "Kalan damla", note: "Standart 20 mL şişe ≈ 400 damla. Şişenizin etiketine göre değiştirin." },
    "puf": { box: 150, daily: "Günde kaç puf (sıkım)?", boxLbl: "Toplam sıkım (puf)", remLbl: "Kalan sıkım", note: "Spreyin etiketinde yazan toplam sıkım sayısını girin (genellikle 100–200)." },
    "mL": { box: 250, daily: "Günde kaç mL?", boxLbl: "Şişedeki mL", remLbl: "Kalan mL", note: "Şişenin toplam hacmini girin; kalan gün günlük mL'ye göre hesaplanır." },
    "ölçek": { box: 30, daily: "Günde kaç ölçek?", boxLbl: "Kutudaki ölçek", remLbl: "Kalan ölçek", note: "Kutudaki toplam ölçek sayısını girin (etiket: porsiyon sayısı)." }
  };
  var touched = { stock: false, hunger: false, vakit: false };
  var lastProductRx = null;
  function unitInfo(u) { return UNIT_INFO[u] || UNIT_INFO["tablet"]; }
  function renderUnitLabels() {
    var u = ($("manualSupDoseUnit") || {}).value || "tablet", info = unitInfo(u);
    [["vspDailyLbl", info.daily], ["vspBoxLbl", info.boxLbl], ["vspRemLbl", info.remLbl], ["vspStockNote", info.note]].forEach(function (p) { var el = $(p[0]); if (el) el.textContent = p[1]; });
  }
  /* Birim değişince etiketler değişir; kullanıcı stoğa dokunmadıysa varsayılan miktar (ör. damla → 400) gelir. */
  function setUnit(u) {
    var sel = $("manualSupDoseUnit"); if (!sel || !UNIT_INFO[u]) { refresh(); return; }
    sel.value = u;
    if (!touched.stock) { var b = $("manualSupBoxCount"), r = $("manualSupRemainingCount"); if (b) b.value = String(UNIT_INFO[u].box); if (r) r.value = String(UNIT_INFO[u].box); }
    refresh();
  }
  function formChoices() {
    var prod = detectProduct(), cfg = prod && prod.key ? templateCfg(prod.key) : null;
    var list = cfg ? Object.keys(cfg.forms).map(function (k) { return { label: formLabel(k), key: k }; }) : GENERIC_FORMS.map(function (l) { return { label: l, key: "" }; });
    var cur = String(($("manualSupFormText") || {}).value || "").trim();
    if (cur && !list.some(function (c) { return fold(c.label) === fold(cur); })) list.unshift({ label: cur, key: "" });
    return list;
  }
  function renderForms() {
    var box = $("vspForms"); if (!box) return;
    var cur = fold(String(($("manualSupFormText") || {}).value || "").trim());
    box.innerHTML = formChoices().map(function (c) {
      var on = cur && fold(c.label) === cur;
      return '<button type="button" class="vsp-chip vsp-fchip' + (on ? " is-on" : "") + '" data-form="' + esc(c.label) + '" data-formkey="' + esc(c.key) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(c.label) + "</button>";
    }).join("");
  }
  function chooseForm(label, key) {
    var input = $("manualSupFormText"); if (input) input.value = label;
    var tk = chosenTemplate();
    if (tk && key && templateCfg(tk) && templateCfg(tk).forms[key] && typeof onModalFormOptionChange === "function") onModalFormOptionChange(key);
    setUnit(unitForForm(label) || "tablet");
  }
  /* Ürün (ad/şablon) değişince: kullanıcı seçmediyse önerilen aç/tok otomatik işlenir. */
  function applyProductDefaults() {
    var prod = detectProduct(), rx = prod ? String(prod.rx || prod.key) : null;
    if (rx === lastProductRx) return;
    lastProductRx = rx;
    var h = $("manualSupHungerNote");
    if (prod && prod.hunger && h && !touched.hunger) {
      if (typeof setVitaSelectValueLoose === "function") setVitaSelectValueLoose(h, prod.hunger); else h.value = prod.hunger;
    }
  }
  function hungerKind(v) { var f = fold(v); return /ac karnina/.test(f) ? "empty" : (/tok|yemek/.test(f) ? "full" : ""); }

  /* Emilim rekabeti: birbirinden en az 2 saat ayrı alınması önerilen mineraller; tiroid ilacı ile 4 saat */
  var MINERALS = { demir: /demir|ferro|iron|feramat|microfer|lipofer/, kalsiyum: /kalsiyum|calcium|osteocare/, cinko: /cinko|zinc/, magnezyum: /magnezyum|magnesium/ };
  var LABEL = { demir: "Demir", kalsiyum: "Kalsiyum", cinko: "Çinko", magnezyum: "Magnezyum" };
  var PAIRS = [["demir", "kalsiyum"], ["demir", "cinko"], ["demir", "magnezyum"], ["kalsiyum", "cinko"], ["kalsiyum", "magnezyum"]];
  function mineralsOf(text) { var t = fold(text); return Object.keys(MINERALS).filter(function (k) { return MINERALS[k].test(t); }); }
  function competes(a, b) { return PAIRS.some(function (p) { return (a === p[0] && b === p[1]) || (a === p[1] && b === p[0]); }); }
  function daysOverlap(a, b) { return a.some(function (d) { return b.indexOf(d) > -1; }); }

  /* Çakışma denetimi: (a) emilimi yarışan mineraller 2 saatten yakınsa, (b) aç karnına alınacak ürün ile tok karnına
     alınan başka bir ürün aynı saate (1 saatten yakın) düşüyorsa. Aç/tok bilgisi her iki durumda da metne eklenir. */
  function conflicts() {
    var name = ($("manualSupName") || {}).value || "", brand = ($("manualSupBrandActive") || {}).value || "";
    var mine = mineralsOf(name + " " + brand);
    var myHunger = ($("manualSupHungerNote") || {}).value || "", myKind = hungerKind(myHunger);
    if (!mine.length && !myKind) return [];
    var plan = getPlan(), out = [];
    var state0 = typeof state !== "undefined" ? state : null;
    var skipIds = editIds || [];
    (state0 && Array.isArray(state0.supplements) ? state0.supplements : []).forEach(function (s) {
      if (skipIds.indexOf(s.id) > -1) return; // düzenlenen takviye kendisiyle karşılaştırılmaz
      var theirs = mineralsOf((s.name || "") + " " + (s.markaEtken || ""));
      var clash = mine.filter(function (m) { return theirs.some(function (o) { return competes(m, o); }); });
      var theirKind = hungerKind(s.aclikDurumu || ""), hungerClash = myKind && theirKind && myKind !== theirKind;
      if (!clash.length && !hungerClash) return;
      var theirDays = Array.isArray(s.scheduleDays) && s.scheduleDays.length ? s.scheduleDays.map(Number) : ALL_DAYS;
      if (!daysOverlap(plan.days, theirDays)) return;
      var theirClock = typeof getSupplementTimeLabel === "function" ? getSupplementTimeLabel(s) : "08:00";
      var hungerText = hungerClash ? (myKind === "empty" ? "Bu ürün aç karnına, " + s.name + " tok karnına alınıyor" : "Bu ürün tok karnına, " + s.name + " aç karnına alınıyor") : "";
      plan.vakits.forEach(function (v) {
        var diff = Math.abs(mins(v.clock) - mins(theirClock)); diff = Math.min(diff, 1440 - diff);
        if (clash.length && diff < 120) out.push({ vakit: v.vakit, clock: v.clock, other: s.name, otherClock: theirClock, need: 120, what: clash.map(function (m) { return LABEL[m]; }).join("/") + " – " + theirs.map(function (m) { return LABEL[m]; }).join("/"), hunger: hungerText });
        else if (hungerClash && diff < 60) out.push({ vakit: v.vakit, clock: v.clock, other: s.name, otherClock: theirClock, need: 120, kind: "hunger", hunger: hungerText });
      });
    });
    // Tiroid ilacı (levotiroksin) ile demir/kalsiyum/magnezyum: en az 4 saat
    if (mine.some(function (m) { return m !== "cinko"; }) && state0 && Array.isArray(state0.medications)) {
      state0.medications.forEach(function (med) {
        if (!/levotiroksin|euthyrox|levotiron|tefor/.test(fold(med.name + " " + (med.etkenMadde || "")))) return;
        (med.clocks || []).forEach(function (mc) {
          plan.vakits.forEach(function (v) {
            var diff = Math.abs(mins(v.clock) - mins(mc)); diff = Math.min(diff, 1440 - diff);
            if (diff < 240) out.push({ vakit: v.vakit, clock: v.clock, other: med.name, otherClock: mc, need: 240, what: "tiroid ilacı" });
          });
        });
      });
    }
    return out;
  }

  function getPlan() {
    var vakits = ORDER.filter(function (v) { return st.vakits[v]; }).map(function (v) { return { vakit: v, clock: isClock(st.vakits[v]) ? st.vakits[v] : DEFAULT_CLOCK[v] }; });
    var days = st.freq === "daily" ? ALL_DAYS.slice() : ALL_DAYS.filter(function (d) { return st.days.has(d); });
    return { vakits: vakits, days: days };
  }

  function renderChips() {
    document.querySelectorAll("#modalDoseFieldset .vsp-segbtn").forEach(function (b) {
      var on = b.dataset.freq === st.freq; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false");
    });
    var days = $("vspDays"); if (days) days.classList.toggle("hidden", st.freq !== "days");
    document.querySelectorAll("#vspDays .vsp-chip").forEach(function (b) { var on = st.days.has(Number(b.dataset.day)); b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    document.querySelectorAll("#vspVakits .vsp-chip").forEach(function (b) { var on = !!st.vakits[b.dataset.vakit]; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
  }
  function renderClocks() {
    var box = $("vspClocks"); if (!box) return;
    var plan = getPlan(), daily = Math.max(1, parseInt(($("manualSupDailyDose") || {}).value, 10) || 1);
    var total = Math.max(plan.vakits.length, daily), k = plan.vakits.length || 1;
    var unit = ($("manualSupDoseUnit") || {}).value || "adet";
    var dial = getTimeMode() === "dial";
    box.classList.toggle("is-digital", !dial);
    box.innerHTML = plan.vakits.map(function (v, i) {
      var amount = Math.floor(total / k) + (i < total % k ? 1 : 0);
      var head = '<span>' + esc(v.vakit) + ' <small>' + amount + " " + esc(unit) + '</small></span>';
      if (dial) return '<label class="vsp-clock">' + head + '<input type="time" step="300" value="' + v.clock + '" data-vakit="' + esc(v.vakit) + '" aria-label="' + esc(v.vakit) + ' saati"/></label>';
      var hm = v.clock.split(":");
      return '<div class="vsp-clock">' + head + '<div class="vsp-hm" data-vakit="' + esc(v.vakit) + '" role="group" aria-label="' + esc(v.vakit) + ' saati">' +
        '<input class="vsp-hh" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="' + hm[0] + '" aria-label="' + esc(v.vakit) + ': saat (00–23)"/><b aria-hidden="true">:</b>' +
        '<input class="vsp-mm" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="' + hm[1] + '" aria-label="' + esc(v.vakit) + ': dakika (00–59)"/></div></div>';
    }).join("");
  }

  /* ---- Saat girişi düzeni (Ayarlar > Araçlar): dijital SS:DD kutucukları (varsayılan) veya klasik saat tekerleği ---- */
  var TIME_MODE_KEY = "vitatakip_time_input_mode";
  function getTimeMode() { try { return localStorage.getItem(TIME_MODE_KEY) === "dial" ? "dial" : "digital"; } catch (_) { return "digital"; } }
  function renderTimeModeSetting() {
    var mode = getTimeMode();
    document.querySelectorAll("[data-timemode]").forEach(function (b) { var on = b.dataset.timemode === mode; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on ? "true" : "false"); });
  }
  function setTimeMode(mode) {
    try { localStorage.setItem(TIME_MODE_KEY, mode === "dial" ? "dial" : "digital"); } catch (_) {}
    renderTimeModeSetting(); renderClocks();
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
    var c = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    if (isClock(c)) { st.vakits[vakit] = c; renderPreview(); renderConflicts(); }
  }
  function renderPreview() {
    var p = $("manualSupDosePreview"); if (!p) return;
    var plan = getPlan();
    var daily = Math.max(plan.vakits.length || 1, parseInt(($("manualSupDailyDose") || {}).value, 10) || 1);
    var unit = ($("manualSupDoseUnit") || {}).value || "tablet";
    var strength = String(($("manualSupDose") || {}).value || "").trim();
    var hunger = String(($("manualSupHungerNote") || {}).value || "").trim();
    var dayLabel = typeof getSupplementScheduleDaysLabel === "function" ? getSupplementScheduleDaysLabel({ scheduleDays: plan.days }) : "";
    // Her vakit/saat yalnızca bir kez yazılır; açlık notu bir saat ifadesini tekrarlıyorsa özete eklenmez.
    var slots = []; plan.vakits.forEach(function (v) { var s = v.vakit + " " + v.clock; if (slots.indexOf(s) < 0) slots.push(s); });
    if (hunger && slots.some(function (s) { return hunger.indexOf(s) >= 0 || hunger.indexOf(s.split(" ")[1]) >= 0; })) hunger = "";
    p.textContent = ["Günde " + daily + " " + unit + (strength ? " (" + strength + ")" : ""), slots.join(", ") || "vakit seçilmedi", plan.days.length ? dayLabel : "gün seçilmedi", hunger].filter(Boolean).join(" · ");
  }
  function renderAdvice() {
    var box = $("vspAdvice"); if (!box) return;
    var name = ($("manualSupName") || {}).value || "", brand = ($("manualSupBrandActive") || {}).value || "";
    var tip = name.trim().length >= 2 ? adviceFor(name + " " + brand) : "";
    var prod = detectProduct(), chosen = ($("manualSupHungerNote") || {}).value || "";
    if (tip && prod && prod.hunger && hungerKind(prod.hunger) && hungerKind(chosen) && hungerKind(chosen) !== hungerKind(prod.hunger)) {
      tip += " Not: seçtiğiniz “" + chosen + "”, bu ürün için önerilen “" + prod.hunger + "” ile uyuşmuyor.";
    }
    box.classList.toggle("hidden", !tip);
    box.innerHTML = tip ? '<i class="fa-solid fa-circle-info" aria-hidden="true"></i> <span><b>Öneri:</b> ' + esc(tip) + "</span>" : "";
  }
  function renderConflicts() {
    var box = $("vspConflict"); if (!box) return;
    var list = conflicts();
    box.classList.toggle("hidden", !list.length);
    box.innerHTML = list.length ? '<b><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Saat çakışması</b>' + list.map(function (c) {
      var hours = c.need / 60;
      var msg = c.kind === "hunger"
        ? esc(c.vakit) + " " + esc(c.clock) + " — <b>" + esc(c.other) + "</b> (" + esc(c.otherClock) + "): " + esc(c.hunger) + "; aynı saatte ikisi birden olmaz. Aralarına en az " + hours + " saat bırakın."
        : esc(c.vakit) + " " + esc(c.clock) + " — <b>" + esc(c.other) + "</b> (" + esc(c.otherClock) + ") ile " + esc(c.what) + " emilimi yarışır" + (c.hunger ? " (" + esc(c.hunger) + ")" : "") + ". Aralarına en az " + hours + " saat bırakın.";
      return '<div class="vsp-cf"><span>' + msg + '</span><button type="button" data-shift-vakit="' + esc(c.vakit) + '" data-shift-to="' + clockFrom(mins(c.otherClock) + c.need) + '">' + clockFrom(mins(c.otherClock) + c.need) + "'e kaydır</button></div>";
    }).join("") : "";
  }
  function refresh() {
    // Her vakitte en az 1 adet alınır: "Günde kaç adet" vakit sayısından küçük olamaz (stok hesabı doğru kalsın).
    var di = $("manualSupDailyDose"), n = Object.keys(st.vakits).length;
    if (di && (parseInt(di.value, 10) || 1) < n) di.value = String(n);
    applyProductDefaults();
    renderForms(); renderUnitLabels(); renderChips(); renderClocks(); renderPreview(); renderAdvice(); renderConflicts();
    if (typeof updateManualModalStockPreview === "function") try { updateManualModalStockPreview(false); } catch (_) {}
  }
  function reset() {
    st.freq = "daily"; st.days = new Set(ALL_DAYS); st.vakits = { "Sabah": DEFAULT_CLOCK["Sabah"] };
    touched = { stock: false, hunger: false, vakit: false }; lastProductRx = null;
    var chosenLbl = $("vspTplChosen"); if (chosenLbl) chosenLbl.textContent = "(isteğe bağlı)";
    document.querySelectorAll("#vspTplChips .vsp-tchip").forEach(function (b) { b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false"); });
    editIds = null; setEditUi(false);
    var stock = $("modalMisanthaStockBox"); if (stock) stock.open = false;
    refresh(); renderQuick();
  }
  /* Vakit → saat eşlemesi ve gün listesiyle planı topluca kurar (düzenleme / hızlı ekleme). */
  function setSchedule(vakitClocks, days) {
    var next = {};
    ORDER.forEach(function (v) { if (vakitClocks && vakitClocks[v]) next[v] = isClock(vakitClocks[v]) ? vakitClocks[v] : DEFAULT_CLOCK[v]; });
    if (Object.keys(next).length) st.vakits = next;
    setDays(days);
  }

  /* ---- Kayıtlardan / formdan ürün özeti (hızlı ekleme ve düzenleme ortak) ---- */
  function membersOf(item) {
    if (!item) return [];
    var list = typeof getSupplementGroupStock === "function" ? getSupplementGroupStock(item).members : [item];
    return list.slice().sort(function (a, b) { return ORDER.indexOf(a.timing) - ORDER.indexOf(b.timing); });
  }
  function snapshotFromRecords(members) {
    var m0 = members[0] || {}, vak = {};
    members.forEach(function (m) {
      if (ORDER.indexOf(m.timing) < 0) return;
      var c = typeof getSupplementTimeLabel === "function" ? getSupplementTimeLabel(m) : m.scheduleTime;
      vak[m.timing] = isClock(c) ? c : DEFAULT_CLOCK[m.timing];
    });
    var sm = String(m0.doseText || "").split(" • ")[0].match(/\(([^)]+)\)/);
    return {
      name: m0.name || "", brand: m0.markaEtken || "", form: String(m0.selectedForm || "").replace(/_/g, " "),
      strength: sm ? sm[1] : "", unit: m0.dozBirimi || "", hunger: m0.aclikDurumu || "",
      daily: members.reduce(function (a, m) { return a + (Number(m.gunlukDoz) || 1); }, 0) || 1,
      vakits: vak, days: Array.isArray(m0.scheduleDays) && m0.scheduleDays.length ? m0.scheduleDays.map(Number) : ALL_DAYS.slice(),
      box: members.reduce(function (a, m) { return a + (Number(m.toplamKutuAdedi) || 0); }, 0) || 30
    };
  }
  function applySnapshot(snap, remaining) {
    function set(id, v) { var el = $(id); if (el) el.value = v == null ? "" : String(v); }
    set("manualSupName", snap.name); set("manualSupBrandActive", snap.brand); set("manualSupFormText", snap.form); set("manualSupDose", snap.strength);
    var unit = $("manualSupDoseUnit");
    if (unit) unit.value = snap.unit && Array.prototype.some.call(unit.options, function (o) { return o.value === snap.unit; }) ? snap.unit : (typeof guessVitaDoseUnit === "function" ? guessVitaDoseUnit(snap.form) : "tablet");
    var hunger = $("manualSupHungerNote");
    if (hunger) { if (typeof setVitaSelectValueLoose === "function") setVitaSelectValueLoose(hunger, snap.hunger); else hunger.value = snap.hunger || ""; }
    set("manualSupDailyDose", Math.max(1, Number(snap.daily) || 1));
    set("manualSupBoxCount", Math.max(1, Number(snap.box) || 30));
    set("manualSupRemainingCount", remaining == null ? Math.max(1, Number(snap.box) || 30) : Math.max(0, remaining));
    touched.stock = true; touched.hunger = Boolean(snap.hunger); touched.vakit = true; lastProductRx = null;
    setSchedule(snap.vakits, snap.days);
    if (typeof updateModalLiveInteractionPreview === "function") try { updateModalLiveInteractionPreview(); } catch (_) {}
  }

  /* ---- Hızlı ekleme: son eklenen / listedeki takviyeler (yalnızca bu cihazda) ---- */
  function recentKey() { return "vitatakip_sup_recent_" + (typeof activeUserId !== "undefined" && activeUserId ? activeUserId : "guest"); }
  function readRecents() { try { var a = JSON.parse(localStorage.getItem(recentKey()) || "[]"); return Array.isArray(a) ? a.filter(function (r) { return r && r.name; }) : []; } catch (_) { return []; } }
  function rememberRecent(snap) {
    if (!snap || !snap.name) return;
    var key = fold(snap.name), list = readRecents().filter(function (r) { return fold(r.name) !== key; });
    list.unshift(snap);
    try { localStorage.setItem(recentKey(), JSON.stringify(list.slice(0, 8))); } catch (_) {}
  }
  var quickList = [];
  function quickItems() {
    var seen = {}, out = [];
    readRecents().forEach(function (r) { var k = fold(r.name); if (!seen[k]) { seen[k] = 1; out.push(r); } });
    var sups = typeof state !== "undefined" && Array.isArray(state.supplements) ? state.supplements.slice() : [];
    sups.sort(function (a, b) { return (b.addedDate || 0) - (a.addedDate || 0); }).forEach(function (s) {
      var k = fold(s.name); if (!s.name || seen[k]) return; seen[k] = 1; out.push(snapshotFromRecords(membersOf(s)));
    });
    return out.slice(0, 6);
  }
  function renderQuick() {
    var box = $("vspQuick"); if (!box) return;
    quickList = editIds ? [] : quickItems();
    box.classList.toggle("hidden", !quickList.length);
    box.innerHTML = quickList.length ? '<span class="vsp-qlbl"><i class="fa-solid fa-bolt" aria-hidden="true"></i> Hızlı ekle</span>' + quickList.map(function (q, i) {
      return '<button type="button" class="vsp-qchip" data-quick="' + i + '" title="Formu ' + esc(q.name) + ' ile doldur">' + esc(q.name) + "</button>";
    }).join("") : "";
  }
  function useQuick(i) {
    var snap = quickList[i]; if (!snap) return;
    applySnapshot(snap, null);
    if (typeof showToast === "function") showToast("Form dolduruldu", snap.name + ": son kullandığınız plan getirildi. Gerekirse değiştirip “Takviyeyi ekle”ye dokunun.", "info");
    var n = $("modalCustomNameContainer"); if (n && n.scrollIntoView) n.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /* ---- Düzenleme: aynı sayfa, mevcut kayıt(lar) dolu açılır ---- */
  var editIds = null;
  function setEditUi(on) {
    var t = $("vsaTitle"); if (t) t.textContent = on ? "Takviyeyi Düzenle" : "Takviye Ekle";
    var vt = $("currentViewTitle"); if (vt && typeof state !== "undefined" && state.activeTab === "view-add-supplement") vt.textContent = on ? "Takviyeyi Düzenle" : "Takviye Ekle";
    var btn = $("btnCommitSupplement");
    if (btn) btn.innerHTML = on ? '<i class="fa-solid fa-check"></i><span>Değişiklikleri kaydet</span>' : '<i class="fa-solid fa-plus"></i><span>Takviyeyi ekle</span>';
    ["addSupBoxBarcodeSection", "addSupMoreDetails"].forEach(function (id) { var el = $(id); if (el) el.classList.toggle("hidden", !!on); });
    var page = $("addSupplementModal"); if (page) page.classList.toggle("is-editing", !!on);
  }
  function startEdit(id) {
    var item = typeof state !== "undefined" ? (state.supplements || []).find(function (s) { return String(s.id) === String(id); }) : null;
    if (!item || typeof openAddSupplementModal !== "function") return;
    var members = membersOf(item);
    openAddSupplementModal();
    editIds = members.map(function (m) { return m.id; });
    applySnapshot(snapshotFromRecords(members), members.reduce(function (a, m) { return a + (Number(m.kalanAdet) || 0); }, 0));
    setEditUi(true); renderQuick();
    var stock = $("modalMisanthaStockBox"); if (stock) stock.open = true;
  }
  function getEditIds() { return editIds ? editIds.slice() : null; }
  function setVakits(list) {
    var next = {};
    (list || []).forEach(function (v) { if (ORDER.indexOf(v) > -1) next[v] = st.vakits[v] || DEFAULT_CLOCK[v]; });
    if (Object.keys(next).length) st.vakits = next;
    refresh();
  }
  function setDays(days) {
    var d = (days || []).map(Number).filter(function (x) { return ALL_DAYS.indexOf(x) > -1; });
    if (!d.length || d.length === 7) { st.freq = "daily"; st.days = new Set(ALL_DAYS); }
    else { st.freq = "days"; st.days = new Set(d); }
    refresh();
  }
  function setClock(vakit, clock) { if (st.vakits[vakit] && isClock(clock)) { st.vakits[vakit] = clock; refresh(); } }
  function syncUnitFromForm() {
    var form = ($("manualSupFormText") || {}).value || "";
    if (form.trim()) setUnit(unitForForm(form) || "tablet"); else refresh();
  }
  /* Hazır şablon çipi: seçilen şablon gizli seçim kutusuna yazılır ve tüm alanlar onunla dolar. */
  function chooseTemplate(key) {
    var sel = $("modalCatalogSelect"); if (!sel || typeof onCatalogSelectChange !== "function") return;
    sel.value = key; lastProductRx = null;
    var input = $("manualSupFormText"); if (input) input.value = "";
    onCatalogSelectChange(key);
    var cfg = templateCfg(key), prod = PRODUCTS.filter(function (p) { return p.key === key; })[0];
    var brand = $("manualSupBrandActive");
    if (brand && prod && prod.active && !brand.value.trim()) brand.value = prod.active;
    if (prod && prod.hunger && !touched.hunger) { var h = $("manualSupHungerNote"); if (h) { if (typeof setVitaSelectValueLoose === "function") setVitaSelectValueLoose(h, prod.hunger); else h.value = prod.hunger; } }
    document.querySelectorAll("#vspTplChips .vsp-tchip").forEach(function (b) { var on = b.dataset.tpl === key; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    var lbl = $("vspTplChosen"); if (lbl) lbl.textContent = "· " + (cfg ? cfg.name : key);
    var det = $("addSupMoreDetails"); if (det) det.open = false;
    syncUnitFromForm();
    if (typeof updateModalLiveInteractionPreview === "function") try { updateModalLiveInteractionPreview(); } catch (_) {}
    var n = $("modalCustomNameContainer"); if (n && n.scrollIntoView) n.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var step = t.closest(".vsp-stepbtn");
    if (step) {
      var input = $(step.dataset.target); if (!input) return;
      var v = (parseInt(input.value, 10) || 0) + Number(step.dataset.step);
      var min = Number(input.min || 0), max = Number(input.max || 9999);
      input.value = String(Math.max(min, Math.min(max, v)));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    var seg = t.closest("#modalDoseFieldset .vsp-segbtn");
    if (seg) { st.freq = seg.dataset.freq; if (st.freq === "days" && st.days.size === 7) st.days = new Set(); refresh(); return; }
    var day = t.closest("#vspDays .vsp-chip");
    if (day) { var d = Number(day.dataset.day); if (st.days.has(d)) st.days.delete(d); else st.days.add(d); refresh(); return; }
    var fc = t.closest("#vspForms .vsp-fchip");
    if (fc) { chooseForm(fc.dataset.form, fc.dataset.formkey); return; }
    var tc = t.closest("#vspTplChips .vsp-tchip");
    if (tc) { chooseTemplate(tc.dataset.tpl); return; }
    var tm = t.closest("[data-timemode]");
    if (tm) { setTimeMode(tm.dataset.timemode); if (typeof showToast === "function") showToast("Saat seçim düzeni", tm.dataset.timemode === "dial" ? "Takviye saatleri klasik saat tekerleğiyle seçilecek." : "Takviye saatleri dijital SS : DD kutucuklarıyla yazılacak.", "success"); return; }
    var vk = t.closest("#vspVakits .vsp-chip");
    if (vk) {
      touched.vakit = true;
      var name = vk.dataset.vakit;
      if (st.vakits[name]) { if (Object.keys(st.vakits).length > 1) delete st.vakits[name]; else if (typeof showToast === "function") showToast("En az bir vakit", "Takviyeyi alacağınız en az bir vakit seçili kalmalı.", "info"); }
      else st.vakits[name] = DEFAULT_CLOCK[name];
      refresh(); return;
    }
    var q = t.closest("#vspQuick [data-quick]");
    if (q) { useQuick(Number(q.dataset.quick)); return; }
    var shift = t.closest("#vspConflict [data-shift-vakit]");
    if (shift) { setClock(shift.dataset.shiftVakit, shift.dataset.shiftTo); return; }
  });
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var inp = t.closest("#vspClocks input[data-vakit]");
    if (inp && isClock(inp.value)) { st.vakits[inp.dataset.vakit] = inp.value; renderPreview(); renderConflicts(); return; }
    var hm = t.closest("#vspClocks .vsp-hm");
    if (hm) { commitDigital(hm, true); return; }
    if (t.id === "manualSupHungerNote") touched.hunger = true;
  });
  /* Dijital saat: yalnızca rakam; saat 2 haneye ulaşınca dakikaya geçer; geçerli olunca anında işlenir. */
  document.addEventListener("input", function (e) {
    var t = e.target; if (!t || !t.closest) return;
    if (t.id === "manualSupBoxCount" || t.id === "manualSupRemainingCount") { touched.stock = true; return; }
    var hm = t.closest("#vspClocks .vsp-hm"); if (!hm) return;
    var clean = String(t.value || "").replace(/\D/g, "").slice(0, 2);
    if (clean !== t.value) t.value = clean;
    if (t.classList.contains("vsp-hh") && clean.length === 2) { var mm = hm.querySelector(".vsp-mm"); if (mm) { mm.focus(); mm.select(); } }
    commitDigital(hm, false);
  });
  document.addEventListener("focusin", function (e) {
    var t = e.target; if (t && t.closest && t.closest("#vspClocks .vsp-hm") && t.select) try { t.select(); } catch (_) {}
  });

  window.VitaSupPage = { refresh: refresh, reset: reset, setVakits: setVakits, setDays: setDays, setClock: setClock, getPlan: getPlan, syncUnitFromForm: syncUnitFromForm, adviceFor: adviceFor, conflicts: conflicts,
    setSchedule: setSchedule, startEdit: startEdit, getEditIds: getEditIds, rememberRecent: rememberRecent, quickItems: quickItems, renderQuick: renderQuick,
    setUnit: setUnit, unitForForm: unitForForm, formLabel: formLabel, chooseForm: chooseForm, chooseTemplate: chooseTemplate, getTimeMode: getTimeMode, setTimeMode: setTimeMode,
    markStockTouched: function () { touched.stock = true; }, isVakitTouched: function () { return touched.vakit; } };
  function init() { refresh(); renderTimeModeSetting(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
