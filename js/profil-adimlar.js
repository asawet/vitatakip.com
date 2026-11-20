/* Profil Düzenle: tek parça uzun form yerine 3 aşama (üstte adım sekmeleri).
   1) Kişisel Bilgiler: fotoğraf, ad, yaş, cinsiyet, boy, kilo
   2) Yaşam Tarzı: aktivite, gebelik/emzirme, beslenme biçimi, balık / kırmızı et, güneşlenme
   3) Kronik Durumlar & İlaçlar: etkileşim kalkanı seçimleri, kronik durumlar, diğer reçeteli ilaçlar
   Altta sabit gezinme: "Geri" / "Devam Et"; "Profili Kaydet ve Güncelle" yalnızca 3. aşamada.
   Alanların kimlikleri ve kaydetme işlevi (saveUserProfileFromModal) değişmez; yalnızca yerleşim adımlara bölünür. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  var STEPS = [
    { short: "Kişisel", title: "Kişisel Bilgiler", icon: "fa-user" },
    { short: "Yaşam Tarzı", title: "Yaşam Tarzı", icon: "fa-person-walking" },
    { short: "Kronik & İlaçlar", title: "Kronik Durumlar & İlaçlar", icon: "fa-notes-medical" }
  ];
  var st = { idx: 0, panels: [], tabs: [], built: false };

  function build() {
    var photo = $("profilePhotoRow");
    var container = photo && photo.parentElement;
    if (!container || st.built) return;
    // Alanlar kabın içinde ve (eski işaretlemedeki kapanmamış bir div nedeniyle) kabın ardından gelen kardeşlerde olabilir.
    var kids = Array.prototype.slice.call(container.children);
    for (var sib = container.nextElementSibling; sib; sib = sib.nextElementSibling) kids.push(sib);
    var find = function (sel) { for (var i = 0; i < kids.length; i++) if (kids[i].matches(sel) || kids[i].querySelector(sel)) return i; return -1; };
    var iLife = find("#modalInputActivity"), iMed = find('input[name="modal_chronic"]'), iFoot = find('[onclick*="saveUserProfileFromModal"]');
    if (iLife < 1 || iMed <= iLife || iFoot <= iMed) return;
    var groups = [kids.slice(0, iLife), kids.slice(iLife, iMed), kids.slice(iMed, iFoot)];
    var footer = kids[iFoot];

    var stepper = document.createElement("ol");
    stepper.className = "vpst-steps"; stepper.setAttribute("aria-label", "Profil adımları");
    stepper.innerHTML = STEPS.map(function (s, n) {
      return '<li><button type="button" class="vpst-tab" data-pstep="' + n + '" aria-controls="profileStep' + (n + 1) + '"><span class="vpst-num">' + (n + 1) + '</span><span class="vpst-lbl">' + s.short + '</span></button></li>';
    }).join("");
    container.parentNode.insertBefore(stepper, container);

    groups.forEach(function (els, n) {
      var sec = document.createElement("section");
      sec.className = "vpst-panel space-y-4"; sec.id = "profileStep" + (n + 1);
      sec.setAttribute("aria-labelledby", "profileStepTitle" + (n + 1));
      sec.innerHTML = '<h4 class="vpst-title" id="profileStepTitle' + (n + 1) + '"><i class="fa-solid ' + STEPS[n].icon + '" aria-hidden="true"></i> ' + (n + 1) + '. Aşama — ' + STEPS[n].title + '</h4>';
      els.forEach(function (el) { sec.appendChild(el); });
      container.appendChild(sec);
      st.panels.push(sec);
    });
    container.parentNode.insertBefore(footer, container.nextSibling);

    // Alt gezinme: Geri / Devam Et / (son adımda) Profili Kaydet ve Güncelle
    var save = footer.querySelector('[onclick*="saveUserProfileFromModal"]');
    footer.className = "vpst-foot";
    var back = document.createElement("button");
    back.type = "button"; back.className = "vpst-back"; back.id = "btnProfileStepBack";
    back.innerHTML = '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Geri';
    var next = document.createElement("button");
    next.type = "button"; next.className = "vpst-next"; next.id = "btnProfileStepNext";
    next.innerHTML = 'Devam Et <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    if (save) { save.id = "btnProfileSave"; save.classList.add("vpst-save"); }
    footer.insertBefore(back, footer.firstChild);
    footer.appendChild(next);
    st.tabs = Array.prototype.slice.call(stepper.querySelectorAll(".vpst-tab"));
    st.built = true;
    go(0);
  }

  /* 1. aşama zorunlu alanları (kayıttaki denetimle aynı kurallar) */
  function step1Error() {
    var name = (($("modalInputName") || {}).value || "").trim();
    var age = parseInt(($("modalInputAge") || {}).value, 10), h = parseFloat(($("modalInputHeight") || {}).value), w = parseFloat(($("modalInputWeight") || {}).value);
    var bad = [];
    if (!name) bad.push("modalInputName");
    if (isNaN(age) || age < 1 || age > 120) bad.push("modalInputAge");
    if (isNaN(h) || h < 45 || h > 250) bad.push("modalInputHeight");
    if (isNaN(w) || w < 2 || w > 350) bad.push("modalInputWeight");
    ["modalInputName", "modalInputAge", "modalInputHeight", "modalInputWeight"].forEach(function (id) { var el = $(id); if (el) { el.classList.toggle("vpst-invalid", bad.indexOf(id) > -1); el.setAttribute("aria-invalid", bad.indexOf(id) > -1 ? "true" : "false"); } });
    if (!bad.length) return "";
    if (bad.indexOf("modalInputName") > -1) return "Adınızı / rumuzunuzu yazın.";
    if (bad.indexOf("modalInputAge") > -1) return "Yaş 1–120 arasında olmalıdır.";
    if (bad.indexOf("modalInputHeight") > -1) return "Boy 45–250 cm arasında olmalıdır.";
    return "Kilo 2–350 kg arasında olmalıdır.";
  }
  function go(i, opts) {
    if (!st.built) return;
    i = Math.max(0, Math.min(2, i));
    if (i > 0 && !(opts && opts.force)) {
      var err = step1Error();
      if (err) {
        i = 0;
        if (typeof showToast === "function") showToast("Önce kişisel bilgileri tamamlayın", err, "warning");
        var first = document.querySelector("#profileStep1 .vpst-invalid"); if (first) setTimeout(function () { try { first.focus(); } catch (_) {} }, 60);
      }
    }
    st.idx = i;
    st.panels.forEach(function (p, n) { p.classList.toggle("hidden", n !== i); });
    st.tabs.forEach(function (t, n) {
      t.classList.toggle("is-on", n === i); t.classList.toggle("is-done", n < i);
      if (n === i) t.setAttribute("aria-current", "step"); else t.removeAttribute("aria-current");
    });
    var back = $("btnProfileStepBack"), next = $("btnProfileStepNext"), save = $("btnProfileSave");
    if (back) back.classList.toggle("is-hidden", i === 0);
    if (next) next.classList.toggle("hidden", i === 2);
    if (save) save.classList.toggle("hidden", i !== 2);
    var scroller = $("profileModal") && $("profileModal").firstElementChild;
    if (scroller) scroller.scrollTop = 0;
  }

  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var tab = t.closest("#profileModal [data-pstep]");
    if (tab) { go(Number(tab.dataset.pstep)); return; }
    if (t.closest("#btnProfileStepNext")) { if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {} go(st.idx + 1); return; }
    if (t.closest("#btnProfileStepBack")) { go(st.idx - 1, { force: true }); return; }
  });

  function wrap(name, fn) {
    var orig = window[name];
    if (typeof orig !== "function" || orig.__vpstWrapped) return;
    var w = fn(orig); w.__vpstWrapped = true; w.toString = function () { return orig.toString(); }; window[name] = w;
  }
  function init() {
    build();
    // Her açılışta 1. aşamadan başlanır
    wrap("openProfileModal", function (orig) { return function () { var r = orig.apply(this, arguments); go(0, { force: true }); return r; }; });
    // Kaydederken 1. aşamada eksik varsa oraya dönülür (kaydetme kuralları aynıdır)
    wrap("saveUserProfileFromModal", function (orig) { return function () { if (st.built && step1Error()) go(0, { force: true }); return orig.apply(this, arguments); }; });
  }
  window.VitaProfileSteps = { go: function (i) { go(i, { force: true }); }, current: function () { return st.idx; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
