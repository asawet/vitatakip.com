/* VitaTakip — kontrol ölçümü hatırlatması (V3 madde 6).
   Sunucusuz: hatırlatma yalnızca bu tarayıcıda (localStorage, hesaba özel) tutulur; uygulama açıldığında ve açıkken
   yarım saatte bir denetlenir. İsteyen kullanıcı tek tıkla telefon takvimine ekleyebilir (.ics dosyası, cihazda üretilir).
   Takvim dosyasına yalnızca test adları ve tarih yazılır; sonuç değerleri yazılmaz. */
(function () {
  "use strict";

  var WEEKS = [8, 10, 12];
  var DEFAULT_WEEKS = 10;
  var last = { rows: [] };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function uid() { return (typeof activeUserId !== "undefined" && activeUserId) ? activeUserId : ""; }
  function key() { return "vitatakip_recheck_" + uid(); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { return iso(new Date()); }
  function trDate(isoStr) { var p = String(isoStr).split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : isoStr; }
  function addWeeks(w) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + w * 7); return iso(d); }

  function load() {
    if (!uid()) return [];
    try { var a = JSON.parse(localStorage.getItem(key()) || "[]"); return Array.isArray(a) ? a.filter(function (r) { return r && /^\d{4}-\d{2}-\d{2}$/.test(r.due) && Array.isArray(r.keys); }) : []; }
    catch (_) { return []; }
  }
  function save(list) { if (!uid()) return; try { localStorage.setItem(key(), JSON.stringify(list)); } catch (_) {} }

  /* Kontrol önerilecek göstergeler: "Değerlerim"de düşük/yüksek/sınırda görünen, ACİL OLMAYAN değerler.
     Acil değerler beklemeye bırakılmaz (onlar için ekranda "gecikmeden hekime" uyarısı vardır). */
  function candidates(m) {
    return ((m && m.bad) || []).filter(function (r) { return r && r.key && !r.critical && r.dir && r.dir !== "ok"; })
      .map(function (r) { return { key: r.key, name: r.name }; });
  }

  function activeFor(keys) {
    var list = load();
    return list.filter(function (r) { return keys.some(function (k) { return r.keys.indexOf(k) >= 0; }); })[0] || null;
  }

  function cardHtml(m) {
    var rows = candidates(m);
    last.rows = rows;
    if (!rows.length) return "";
    var existing = activeFor(rows.map(function (r) { return r.key; }));
    var names = rows.map(function (r) { return esc(r.name); }).join(", ");
    var h = '<section class="vs-card vrc" id="vitaRecheckCard"><h3 class="vs-h"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Kontrol ölçümü hatırlatması</h3>';
    if (existing) {
      h += '<p class="vrc-text">Hatırlatıcı kuruldu: <b>' + esc(existing.labels.join(", ")) + '</b> için <b>' + trDate(existing.due) + '</b>.</p>' +
        '<div class="vrc-actions"><button type="button" class="vrc-btn vrc-main" data-vrc="ics" data-id="' + esc(existing.id) + '"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i> Takvime ekle (.ics)</button>' +
        '<button type="button" class="vrc-btn" data-vrc="cancel" data-id="' + esc(existing.id) + '">Hatırlatıcıyı kaldır</button></div>';
    } else {
      h += '<p class="vrc-text">' + names + ' için kontrol ölçümü genellikle <b>8–12 hafta</b> sonra yapılır. Zamanı hekiminiz belirler; bu süre bir kılavuz eşiği değil, hatırlatma aralığıdır.</p>' +
        '<div class="vrc-row"><label for="vrcWeeks">Ne zaman?</label><select id="vrcWeeks" data-vrc="weeks">' +
        WEEKS.map(function (w) { return '<option value="' + w + '"' + (w === DEFAULT_WEEKS ? " selected" : "") + '>' + w + ' hafta sonra — ' + trDate(addWeeks(w)) + '</option>'; }).join("") +
        '</select></div><div class="vrc-actions"><button type="button" class="vrc-btn vrc-main" data-vrc="set"><i class="fa-solid fa-bell" aria-hidden="true"></i> Hatırlatıcı kur</button>' +
        '<button type="button" class="vrc-btn" data-vrc="set-ics"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i> Kur ve takvime ekle (.ics)</button></div>';
    }
    h += '<p class="vrc-note"><i class="fa-solid fa-lock" aria-hidden="true"></i> Hatırlatıcı yalnızca bu cihazda tutulur. Takvim dosyasına test adları ve tarih yazılır; sonuç değerleriniz yazılmaz.</p></section>';
    return h;
  }

  function create(weeks) {
    if (!last.rows.length) return null;
    var w = WEEKS.indexOf(weeks) >= 0 ? weeks : DEFAULT_WEEKS;
    var keys = last.rows.map(function (r) { return r.key; });
    var list = load().filter(function (r) { return !keys.some(function (k) { return r.keys.indexOf(k) >= 0; }); });
    var rec = { id: "rc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), keys: keys, labels: last.rows.map(function (r) { return r.name; }),
      due: addWeeks(w), created: today(), notified: null };
    list.push(rec); save(list);
    return rec;
  }

  /* ---- .ics (RFC 5545) ---- */
  function icsEscape(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function fold(line) {
    /* 75 sekizli sınırı: UTF-8 çok baytlı karakterleri bölmeden katla */
    var enc = new TextEncoder(), out = [], cur = "", len = 0, limit = 75;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], b = enc.encode(ch).length;
      if (len + b > limit) { out.push(cur); cur = " " + ch; len = 1 + b; limit = 75; } else { cur += ch; len += b; }
    }
    out.push(cur);
    return out.join("\r\n");
  }
  function buildIcs(rec) {
    var d = rec.due.replace(/-/g, ""), next = new Date(rec.due + "T12:00:00"); next.setDate(next.getDate() + 1);
    var now = new Date(), stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + "T" + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + "Z";
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VitaTakip//Kontrol Hatirlatma//TR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + rec.id + "@vitatakip.com.tr",
      "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + d,
      "DTEND;VALUE=DATE:" + iso(next).replace(/-/g, ""),
      "SUMMARY:" + icsEscape("VitaTakip: kontrol tahlili"),
      "DESCRIPTION:" + icsEscape("Hekiminizle planladığınız kontrol ölçümü: " + rec.labels.join(", ") + ". Sonuçlarınızı VitaTakip'e girmeyi unutmayın. https://vitatakip.com.tr"),
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape("Kontrol tahlili hatırlatması"), "TRIGGER:PT9H", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ];
    return lines.map(fold).join("\r\n") + "\r\n";
  }
  function deliverIcs(rec) {
    var text = buildIcs(rec), name = "vitatakip-kontrol-" + rec.due + ".ics";
    var blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    var download = function () {
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      if (typeof showToast === "function") showToast("Takvim dosyası hazır", "İndirilen dosyayı açarak etkinliği takviminize ekleyin.", "success");
    };
    try {
      var file = new File([blob], name, { type: "text/calendar" });
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: "Kontrol tahlili" }).catch(function (e) { if (!e || e.name !== "AbortError") download(); });
        return;
      }
    } catch (_) {}
    download();
  }

  /* ---- Yerel hatırlatma: vadesi gelenleri Ana Sayfa'da göster + izin varsa bildirim ---- */
  function completedByNewLab(rec) {
    var hist = (typeof state !== "undefined" && state && Array.isArray(state.labHistory)) ? state.labHistory : [];
    return hist.some(function (h) {
      return h && h.date && h.date > rec.created && rec.keys.some(function (k) { var v = h[k]; return v !== null && v !== undefined && v !== ""; });
    });
  }
  function homeBanner(dueList) {
    var host = document.getElementById("vitaRecheckHome");
    if (!host) {
      var anchor = document.getElementById("homeHydrationCard");
      if (!anchor || !anchor.parentNode) return;
      host = document.createElement("div"); host.id = "vitaRecheckHome";
      anchor.parentNode.insertBefore(host, anchor);
    }
    if (!dueList.length) { host.innerHTML = ""; host.className = "hidden"; return; }
    var r = dueList[0];
    host.className = "vrc-home";
    host.innerHTML = '<i class="fa-solid fa-calendar-check" aria-hidden="true"></i><div><b>Kontrol tahlili zamanı</b><span>' + esc(r.labels.join(", ")) + ' · planlanan ' + trDate(r.due) + '</span></div>' +
      '<button type="button" class="vrc-btn vrc-main" data-vrc="go">Tahlil gir</button><button type="button" class="vrc-btn" data-vrc="done" data-id="' + esc(r.id) + '" aria-label="Hatırlatmayı kapat">Tamam</button>';
  }
  function tick() {
    if (!uid()) return;
    var list = load(), t = today(), changed = false;
    list = list.filter(function (r) { if (completedByNewLab(r)) { changed = true; return false; } return true; });
    var due = list.filter(function (r) { return r.due <= t; });
    due.forEach(function (r) {
      if (r.notified === t) return;
      r.notified = t; changed = true;
      if (typeof vitaShowNotification === "function" && window.Notification && Notification.permission === "granted") {
        try { vitaShowNotification("Kontrol tahlili zamanı", r.labels.join(", ") + " için planladığınız kontrol ölçümü bugün.", "vita-recheck-" + r.id); } catch (_) {}
      }
    });
    if (changed) save(list);
    homeBanner(due);
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-vrc]");
    if (!b || b.tagName === "SELECT") return;
    var a = b.getAttribute("data-vrc"), id = b.getAttribute("data-id");
    var refresh = function () { var c = document.getElementById("vitaRecheckCard"); if (c && typeof window.renderVitaSimple === "function") window.renderVitaSimple(); };
    if (a === "set" || a === "set-ics") {
      var sel = document.getElementById("vrcWeeks");
      var rec = create(sel ? Number(sel.value) : DEFAULT_WEEKS);
      if (!rec) return;
      if (typeof showToast === "function") showToast("Hatırlatıcı kuruldu", rec.labels.join(", ") + " · " + trDate(rec.due), "success");
      if (a === "set-ics") deliverIcs(rec);
      refresh(); tick();
    } else if (a === "ics") {
      var r = load().filter(function (x) { return x.id === id; })[0]; if (r) deliverIcs(r);
    } else if (a === "cancel" || a === "done") {
      save(load().filter(function (x) { return x.id !== id; }));
      refresh(); tick();
    } else if (a === "go") {
      if (typeof navigateToView === "function") navigateToView("view-labs");
    }
  });

  function start() { tick(); setInterval(tick, 30 * 60 * 1000); document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(start, 1500); }); else setTimeout(start, 1500);
  window.VitaRecheck = { cardHtml: cardHtml, buildIcs: buildIcs, load: load, tick: tick, _create: create };
})();
