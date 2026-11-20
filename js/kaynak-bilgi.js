/* VitaTakip — parametre kaynak bilgisi (V3 madde 3).
   Bilimsel kaynaklar ana ekrana yayılmaz: her parametrenin yanındaki küçük (i) düğmesi sade bir pencere açar.
   Veri tek kaynaktan gelir: VitaLabEvidence.PARAMS / SOURCES (js/app/16-lab-evidence.js). Ağ isteği yoktur. */
(function () {
  "use strict";

  var INPUTS = { d3: "inputLabD3", b12: "inputLabB12", ferritin: "inputLabFerritin", mg: "inputLabMg", ca: "inputLabCalcium", zinc: "inputLabZinc",
    creatinine: "inputLabCreatinine", folate: "inputLabFolate", alt: "inputLabAlt", hb: "inputLabHb", mcv: "inputLabMcv", crp: "inputLabCrp",
    rbcFolate: "inputLabRbcFolate", hcy: "inputLabHcy" };

  /* Kanıt motorunda olmayan iki gösterge için kısa açıklama */
  var EXTRA = {
    creatinine: { label: "Kreatinin / eGFR", summary: "eGFR, ırk katsayısı içermeyen CKD-EPI 2021 denklemiyle hesaplanır; evreler KDIGO sınıflamasına göre gösterilir.",
      sources: [{ title: "Inker LA ve ark. New Creatinine- and Cystatin C–Based Equations to Estimate GFR without Race. N Engl J Med 2021;385:1737-49 (PMID 34554658)", url: "https://doi.org/10.1056/NEJMoa2102953", check: "pubmed-kayit" }] },
    alt: { label: "ALT", summary: "ALT 50 U/L üzeri, takviye güvenliği için uygulamaya özgü bir uyarı süzgecidir; tanı sınırı değildir. Laboratuvarınızın aralığı esastır.", sources: [] }
  };

  var CHECK_TEXT = {
    "pubmed": ["PubMed'de doğrulandı", "vkb-ok"],
    "pubmed-kayit": ["PubMed kaydı doğrulandı · sayısal eşik özette yok", "vkb-mid"],
    "web": ["Resmî kurum kaynağı", "vkb-mid"],
    "yok": ["Kaynağı doğrulanmadı", "vkb-no"]
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function gender() { return (typeof state !== "undefined" && state && state.user && state.user.gender === "E") ? "E" : "K"; }
  function version() { return (window.VitaLabEvidence && VitaLabEvidence.VERSION) || ""; }

  function labelFor(key) {
    var P = window.VitaLabEvidence && VitaLabEvidence.PARAMS[key];
    return (P && P.label) || (EXTRA[key] && EXTRA[key].label) || key;
  }

  function sourcesFor(key) {
    var E = window.VitaLabEvidence;
    if (E && E.PARAMS[key]) {
      return (E.PARAMS[key].sources || []).map(function (id) { return E.SOURCES[id]; }).filter(function (s) { return s && s.title; });
    }
    return EXTRA[key] ? EXTRA[key].sources : [];
  }

  function sourceHtml(s) {
    var c = CHECK_TEXT[s.check] || CHECK_TEXT.yok;
    var link = s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + (/doi\.org/.test(s.url) ? "DOI bağlantısı" : "Kaynağı aç") + ' <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>' : "";
    return '<li class="vkb-src"><span class="vkb-badge ' + c[1] + '">' + esc(c[0]) + '</span><b>' + esc(s.title) + '</b>' +
      (s.note ? '<p>' + esc(s.note) + '</p>' : "") + link + '</li>';
  }

  function bodyFor(key) {
    var E = window.VitaLabEvidence, P = E && E.PARAMS[key];
    var ref = typeof getVitaAppLabReference === "function" ? getVitaAppLabReference(key, gender()) : "";
    var html = "";
    if (ref) html += '<p class="vkb-ref"><span>Genel aralık</span><b>' + esc(ref) + '</b></p>';
    if (P && P.typical && P.typical.note) html += '<p class="vkb-sum">' + esc(P.typical.note) + '</p>';
    else if (EXTRA[key]) html += '<p class="vkb-sum">' + esc(EXTRA[key].summary) + '</p>';
    var list = sourcesFor(key);
    html += list.length ? '<ul class="vkb-list">' + list.map(sourceHtml).join("") + '</ul>' : '<p class="vkb-sum">Bu gösterge için kaynaklı klinik eşik kullanılmaz.</p>';
    return html;
  }

  function allSourcesBody() {
    var E = window.VitaLabEvidence;
    if (!E) return "";
    var used = {};
    Object.keys(E.PARAMS).forEach(function (k) { (E.PARAMS[k].sources || []).forEach(function (id) { used[id] = true; }); });
    var ids = Object.keys(E.SOURCES).filter(function (id) { return used[id] && id !== "UNVERIFIED"; });
    return '<p class="vkb-sum">Uygulamadaki tahlil eşiklerinin dayandığı kaynaklar (' + ids.length + '). Laboratuvarınızın kendi referans aralığı her zaman önceliklidir.</p>' +
      '<ul class="vkb-list">' + ids.map(function (id) { return sourceHtml(E.SOURCES[id]); }).join("") + sourceHtml(EXTRA.creatinine.sources[0]) + '</ul>';
  }

  var lastFocus = null;
  function ensureModal() {
    var m = document.getElementById("vitaSourceModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "vitaSourceModal";
    m.className = "vkb-overlay hidden";
    m.innerHTML = '<div class="vkb-panel" role="dialog" aria-modal="true" aria-labelledby="vkbTitle">' +
      '<div class="vkb-head"><h2 id="vkbTitle"></h2><button type="button" class="vkb-x" data-vkb-close aria-label="Kapat"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>' +
      '<div class="vkb-body" id="vkbBody"></div>' +
      '<p class="vkb-foot"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Eşikler: <b id="vkbVer"></b> · PubMed doğrulamalı. Kaynaklar bilgi içindir; karar hekiminizindir.</p></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) { if (e.target === m || (e.target.closest && e.target.closest("[data-vkb-close]"))) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.classList.contains("hidden")) close(); });
    return m;
  }
  function open(key) {
    var m = ensureModal();
    lastFocus = document.activeElement;
    document.getElementById("vkbTitle").textContent = key === "all" ? "Tahlil eşikleri — kaynak listesi" : labelFor(key) + " — kaynaklar";
    document.getElementById("vkbBody").innerHTML = key === "all" ? allSourcesBody() : bodyFor(key);
    document.getElementById("vkbVer").textContent = version();
    m.classList.remove("hidden");
    var x = m.querySelector("[data-vkb-close]"); if (x) x.focus();
  }
  function close() {
    var m = document.getElementById("vitaSourceModal");
    if (m) m.classList.add("hidden");
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (_) {}
  }

  function infoButton(key, name) {
    return '<button type="button" class="vkb-i" data-vt-src="' + esc(key) + '" aria-label="' + esc(name || labelFor(key)) + ' kaynakları" title="Kaynaklar"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></button>';
  }

  /* Tahlil giriş kartlarına (i) düğmesi ekle */
  function decorateLabCards() {
    Object.keys(INPUTS).forEach(function (key) {
      var input = document.getElementById(INPUTS[key]);
      var card = input && input.closest("div.rounded-xl");
      if (!card || card.querySelector(".vkb-i")) return;
      card.classList.add("vkb-card"); /* düğme kartın sağ üst köşesinde; etiket kısaltması (truncate) bozulmaz */
      card.insertAdjacentHTML("afterbegin", infoButton(key));
    });
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-vt-src]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation(); /* <summary> ve <label> içinde açılıp kapanmayı/odak kaymasını engelle */
    open(b.getAttribute("data-vt-src"));
  }, true);

  function init() {
    decorateLabCards();
    var v = document.getElementById("reportThresholdVersion");
    if (v && version()) v.textContent = "Eşikler: " + version() + " · PubMed doğrulamalı";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.VitaSourceInfo = { open: open, close: close, button: infoButton, decorate: decorateLabCards };
})();
