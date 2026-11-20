/* VitaTakip — "Sağlık & Tahlil Özeti" paylaşım kartı (V3 madde 2).
   Tasarım Canva şablonundan (lacivert başlık, turkuaz vurgu, 2×2 gösterge kartı) alınmıştır; görsel TAMAMEN bu cihazda,
   <canvas> ile üretilir. Hiçbir veri dış servise gönderilmez. Kartta hangi değerlerin yer alacağını kullanıcı seçer;
   ad varsayılan olarak eklenmez. */
(function () {
  "use strict";

  var W = 1080, H = 1350, MAX = 4;
  var FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  var C = { navy: "#0f172a", navy2: "#1e293b", teal: "#0d9488", teal4: "#2dd4bf", teal5: "#14b8a6", teal7: "#0f766e", teal50: "#f0fdfa", teal100: "#ccfbf1",
    bg: "#f3f6f9", slate5: "#64748b", slate6: "#475569", amber: "#b45309", amber50: "#fffbeb", amber200: "#fde68a", rose: "#be123c", rose50: "#fff1f2", rose200: "#fecdd3" };
  var STATUS = { ok: ["Referans aralığında", C.teal7, C.teal50, C.teal100], border: ["Sınırda", C.amber, C.amber50, C.amber200],
    low: ["Düşük", C.amber, C.amber50, C.amber200], high: ["Yüksek", C.rose, C.rose50, C.rose200] };
  var ICON = { d3: "capsule", b12: "tube", ferritin: "drop", hb: "drop", mg: "capsule", zinc: "capsule", folate: "capsule", rbcFolate: "tube", hcy: "tube",
    ca: "capsule", creatinine: "tube", alt: "tube", mcv: "drop", crp: "tube" };
  var sel = { keys: [], name: false, daily: true };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function fmt(v) { var n = Number(v); return isFinite(n) ? String(Math.round(n * 100) / 100).replace(".", ",") : String(v); }
  function rows() {
    try {
      var m = window.VitaSimpleModel && VitaSimpleModel.build();
      if (!m) return [];
      return (m.bad || []).concat(m.ok || []).filter(function (r) { return r && r.key && r.value !== null && r.value !== undefined; });
    } catch (_) { return []; }
  }
  function daily() {
    var s = (typeof state !== "undefined" && state) || {}, day = new Date().getDay();
    var sup = (s.supplements || []).filter(function (x) { return !Array.isArray(x.scheduleDays) || x.scheduleDays.indexOf(day) >= 0; });
    var taken = sup.filter(function (x) { return x.taken; }).length;
    var hyd = s.hydration || {};
    return { supText: sup.length ? taken + "/" + sup.length : "—", water: Math.round(Number(hyd.current) || 0), target: Math.round(Number(hyd.target) || 0) };
  }

  /* ---- çizim yardımcıları ---- */
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fitText(ctx, text, maxW, size, weight) {
    var s = size; ctx.font = weight + " " + s + "px " + FONT;
    while (ctx.measureText(text).width > maxW && s > 18) { s -= 2; ctx.font = weight + " " + s + "px " + FONT; }
    return s;
  }
  function icon(ctx, kind, cx, cy) {
    ctx.save(); ctx.fillStyle = C.teal50; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createLinearGradient(cx - 30, cy - 30, cx + 30, cy + 30); g.addColorStop(0, C.teal4); g.addColorStop(1, C.teal);
    ctx.lineWidth = 5; ctx.strokeStyle = C.teal7; ctx.fillStyle = g;
    if (kind === "capsule") {
      ctx.translate(cx, cy); ctx.rotate(-Math.PI / 4);
      rr(ctx, -34, -14, 68, 28, 14); ctx.fillStyle = "#fff"; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(20, -14); ctx.arcTo(34, -14, 34, 0, 14); ctx.arcTo(34, 14, 20, 14, 14); ctx.lineTo(0, 14); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    } else if (kind === "tube") {
      rr(ctx, cx - 13, cy - 34, 26, 66, 13); ctx.fillStyle = "#fff"; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(cx - 10, cy, 20, 26); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = C.teal7; rr(ctx, cx - 18, cy - 40, 36, 10, 5); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(cx, cy - 36); ctx.bezierCurveTo(cx + 34, cy, cx + 30, cy + 34, cx, cy + 34); ctx.bezierCurveTo(cx - 30, cy + 34, cx - 34, cy, cx, cy - 36); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function heart(ctx, cx, cy) {
    var g = ctx.createLinearGradient(cx - 60, cy - 60, cx + 60, cy + 60); g.addColorStop(0, C.teal4); g.addColorStop(1, C.teal7);
    ctx.save(); ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(cx, cy + 52); ctx.bezierCurveTo(cx - 80, cy, cx - 56, cy - 62, cx, cy - 26); ctx.bezierCurveTo(cx + 56, cy - 62, cx + 80, cy, cx, cy + 52); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.lineJoin = "round"; ctx.beginPath();
    ctx.moveTo(cx - 52, cy - 2); ctx.lineTo(cx - 18, cy - 2); ctx.lineTo(cx - 8, cy - 26); ctx.lineTo(cx + 6, cy + 20); ctx.lineTo(cx + 16, cy - 2); ctx.lineTo(cx + 52, cy - 2); ctx.stroke();
    ctx.restore();
  }

  function draw(canvas) {
    var ctx = canvas.getContext("2d"), all = rows(), chosen = sel.keys.map(function (k) { return all.filter(function (r) { return r.key === k; })[0]; }).filter(Boolean);
    canvas.width = W; canvas.height = H;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    var glow = ctx.createRadialGradient(W, 0, 40, W, 0, 900); glow.addColorStop(0, "rgba(20,184,166,.16)"); glow.addColorStop(1, "rgba(20,184,166,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    /* başlık bandı + dalga */
    var hg = ctx.createLinearGradient(0, 0, W, 300); hg.addColorStop(0, C.navy); hg.addColorStop(1, C.navy2);
    ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 250); ctx.bezierCurveTo(W * 0.7, 330, W * 0.3, 210, 0, 290); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.teal5; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 298); ctx.bezierCurveTo(W * 0.3, 218, W * 0.7, 338, W, 258); ctx.stroke();
    ctx.fillStyle = "#fff"; fitText(ctx, "Sağlık & Tahlil Özeti", 760, 72, "800"); ctx.fillText("Sağlık & Tahlil Özeti", 72, 140);
    var d = new Date(), dateTxt = ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear();
    var who = sel.name && typeof state !== "undefined" && state && state.user && state.user.name ? state.user.name + " · " : "";
    ctx.fillStyle = "#cbd5e1"; fitText(ctx, who + "VitaTakip · Kişisel takip özeti · " + dateTxt, 760, 34, "500"); ctx.fillText(who + "VitaTakip · Kişisel takip özeti · " + dateTxt, 72, 200);
    heart(ctx, W - 150, 135);
    /* gösterge kartları */
    var top = 360, gap = 36, cw = (W - 144 - gap) / 2, ch = 270;
    if (!chosen.length) {
      ctx.fillStyle = C.slate6; ctx.font = "600 34px " + FONT; ctx.fillText("Karta eklenecek tahlil değeri seçilmedi.", 72, top + 80);
    }
    chosen.forEach(function (r, i) {
      var x = 72 + (i % 2) * (cw + gap), y = top + Math.floor(i / 2) * (ch + gap), st = STATUS[r.dir] || STATUS.ok;
      ctx.save(); ctx.shadowColor = "rgba(15,23,42,.10)"; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12; ctx.fillStyle = "#fff"; rr(ctx, x, y, cw, ch, 34); ctx.fill(); ctx.restore();
      icon(ctx, ICON[r.key] || "tube", x + 76, y + 82);
      ctx.fillStyle = C.navy; fitText(ctx, r.name, cw - 160, 38, "800"); ctx.fillText(r.name, x + 142, y + 70);
      ctx.font = "800 54px " + FONT; var vt = fmt(r.value); ctx.fillText(vt, x + 142, y + 132);
      var vw = ctx.measureText(vt).width; ctx.fillStyle = C.slate5; ctx.font = "600 28px " + FONT; ctx.fillText(r.unit || "", x + 152 + vw, y + 132);
      ctx.font = "700 28px " + FONT; var pw = Math.min(cw - 64, ctx.measureText(st[0]).width + 76);
      ctx.fillStyle = st[2]; rr(ctx, x + 32, y + 178, pw, 60, 30); ctx.fill(); ctx.strokeStyle = st[3]; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = st[1]; ctx.beginPath(); ctx.arc(x + 64, y + 208, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(st[0], x + 86, y + 218);
    });
    /* günlük özet */
    if (sel.daily) {
      var dy = 1000, dd = daily();
      ctx.save(); ctx.shadowColor = "rgba(15,23,42,.08)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10; ctx.fillStyle = "#fff"; rr(ctx, 72, dy, W - 144, 130, 30); ctx.fill(); ctx.restore();
      ctx.fillStyle = C.teal5; rr(ctx, 72, dy, 12, 130, 6); ctx.fill();
      ctx.strokeStyle = C.teal; ctx.lineWidth = 6; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(130, dy + 88); ctx.lineTo(158, dy + 60); ctx.lineTo(180, dy + 76); ctx.lineTo(214, dy + 40); ctx.stroke();
      ctx.fillStyle = C.navy; fitText(ctx, "Bugün: takviye " + dd.supText + " · su " + dd.water + (dd.target ? " / " + dd.target : "") + " ml", W - 400, 36, "700");
      ctx.fillText("Bugün: takviye " + dd.supText + " · su " + dd.water + (dd.target ? " / " + dd.target : "") + " ml", 250, dy + 78);
    }
    /* alt bilgi */
    ctx.fillStyle = C.slate6; ctx.font = "500 26px " + FONT; ctx.textAlign = "center";
    ctx.fillText("Bilgilendirme amaçlıdır; tanı ve tedavi kararı hekime aittir.", W / 2, 1222);
    ctx.fillStyle = C.teal7; ctx.font = "800 36px " + FONT; ctx.fillText("vitatakip.com.tr", W / 2, 1280); ctx.textAlign = "left";
  }

  /* ---- pencere ---- */
  function ensureModal() {
    var m = document.getElementById("vitaShareCardModal");
    if (m) return m;
    m = document.createElement("div"); m.id = "vitaShareCardModal"; m.className = "vkb-overlay hidden";
    m.innerHTML = '<div class="vkb-panel vpk-panel" role="dialog" aria-modal="true" aria-labelledby="vpkTitle">' +
      '<div class="vkb-head"><h2 id="vpkTitle">Sağlık &amp; Tahlil Özeti kartı</h2><button type="button" class="vkb-x" data-vpk="close" aria-label="Kapat"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>' +
      '<div class="vkb-body"><p class="vkb-sum"><i class="fa-solid fa-lock" aria-hidden="true"></i> Kart bu cihazda oluşturulur, hiçbir sunucuya gönderilmez. Paylaşmadan önce içeriği kontrol edin.</p>' +
      '<div class="vpk-grid"><div><p class="vpk-h">Karta eklenecek değerler (en çok ' + MAX + ')</p><div id="vpkParams" class="vpk-params"></div>' +
      '<label class="vpk-opt"><input type="checkbox" id="vpkDaily" checked> Bugünkü takviye ve su özeti</label>' +
      '<label class="vpk-opt"><input type="checkbox" id="vpkName"> Adımı karta ekle</label></div>' +
      '<div class="vpk-prev"><img id="vpkPreview" alt="Paylaşım kartı önizlemesi" width="270" height="338"></div></div></div>' +
      '<div class="vpk-actions"><button type="button" class="vrc-btn vrc-main" data-vpk="share"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Paylaş</button>' +
      '<button type="button" class="vrc-btn" data-vpk="download"><i class="fa-solid fa-download" aria-hidden="true"></i> PNG indir</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    m.addEventListener("change", function (e) {
      var t = e.target;
      if (t.id === "vpkDaily") sel.daily = t.checked;
      else if (t.id === "vpkName") sel.name = t.checked;
      else if (t.name === "vpkKey") {
        sel.keys = Array.prototype.slice.call(m.querySelectorAll('input[name="vpkKey"]:checked')).map(function (x) { return x.value; });
        lockParams();
      }
      preview();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.classList.contains("hidden")) close(); });
    return m;
  }
  function lockParams() {
    var boxes = document.querySelectorAll('#vpkParams input[name="vpkKey"]');
    Array.prototype.forEach.call(boxes, function (b) { b.disabled = !b.checked && sel.keys.length >= MAX; });
  }
  var canvas = null;
  function preview() { if (!canvas) canvas = document.createElement("canvas"); draw(canvas); var img = document.getElementById("vpkPreview"); if (img) img.src = canvas.toDataURL("image/png"); }
  function open() {
    var m = ensureModal(), all = rows();
    if (!sel.keys.length) sel.keys = all.slice(0, MAX).map(function (r) { return r.key; });
    sel.keys = sel.keys.filter(function (k) { return all.some(function (r) { return r.key === k; }); });
    document.getElementById("vpkParams").innerHTML = all.length ? all.map(function (r) {
      return '<label class="vpk-opt"><input type="checkbox" name="vpkKey" value="' + esc(r.key) + '"' + (sel.keys.indexOf(r.key) >= 0 ? " checked" : "") + '> ' + esc(r.name) + ' <b>' + esc(fmt(r.value)) + '</b> <small>' + esc(r.unit || "") + '</small></label>';
    }).join("") : '<p class="vkb-sum">Henüz kayıtlı tahlil değeri yok. Tahliller ekranından ekleyebilirsiniz.</p>';
    document.getElementById("vpkName").checked = sel.name; document.getElementById("vpkDaily").checked = sel.daily;
    lockParams(); preview(); m.classList.remove("hidden");
    var x = m.querySelector('[data-vpk="close"]'); if (x) x.focus();
  }
  function close() { var m = document.getElementById("vitaShareCardModal"); if (m) m.classList.add("hidden"); }
  function blob(cb) { if (!canvas) preview(); canvas.toBlob(cb, "image/png"); }
  function fileName() { var d = new Date(); return "vitatakip-ozet-" + d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + ".png"; }
  function download() {
    blob(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fileName(); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); });
  }
  function share() {
    blob(function (b) {
      try {
        var f = new File([b], fileName(), { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: "Sağlık & Tahlil Özeti" }).catch(function (e) { if (!e || e.name !== "AbortError") download(); });
          return;
        }
      } catch (_) {}
      download();
      if (typeof showToast === "function") showToast("Paylaşım desteklenmiyor", "Bu tarayıcıda doğrudan paylaşım yok; kart PNG olarak indirildi.", "info");
    });
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-vpk]");
    if (!b) return;
    var a = b.getAttribute("data-vpk");
    if (a === "open") open(); else if (a === "close") close(); else if (a === "download") download(); else if (a === "share") share();
  });
  window.VitaShareCard = { open: open, close: close, draw: draw, _sel: sel };
})();
