/* TAHLİL İÇGÖRÜ MOTORU
   Girilen TÜM tahlilleri tarihleriyle birlikte toplar (her gösterge için en güncel ölçüm), önceki ölçümle
   karşılaştırır, tahliller arası ilişkileri kural tabanlı gözlemlere çevirir ve klinik analiz (CDSS) ile
   yapay zekâ için tek bir tutarlı girdi üretir. Sınıflandırma VitaLabEvidence üzerinden yapılır.
   Tanı koymaz. */
    const VitaLabInsights = (() => {
      const LOW_KEYS = ["d3", "b12", "ferritin", "mg", "ca", "zinc", "folate"];
      const DIR_TEXT = { low: "referansın altında", high: "referansın üstünde", normal: "referans aralığında", borderline: "sınırda", na: "değerlendirilemedi" };
      const FRESH_DAYS_DEFAULT = 90;   // bu süreden eski ölçümler "güncel değil" sayılır ve takviye adayı üretmez
      const STALE_REVIEW_DAYS = 180;   // 6 aydan eski ölçümler için ayrıca uyarı

      function esc(v) { return typeof escapeHtmlText === "function" ? escapeHtmlText(v) : String(v); }

      function daysAgo(dateStr) {
        if (!dateStr) return null;
        const t = Date.parse(`${dateStr}T00:00:00`);
        if (!Number.isFinite(t)) return null;
        return Math.max(0, Math.round((Date.now() - t) / 86400000));
      }

      /* Sort by lab (sample) date, not by save time: an older PDF uploaded later must not become "latest". */
      function recordTime(r) {
        const t = r && r.date ? Date.parse(`${r.date}T00:00:00`) : NaN;
        return Number.isFinite(t) ? t : Number(r?.timestamp || 0);
      }
      function sortedRecords() {
        return (Array.isArray(state.labHistory) ? state.labHistory : []).slice()
          .sort((a, b) => (recordTime(b) - recordTime(a)) || (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)));
      }

      /* 90-DAY MERGED PANEL: for each biomarker, the most recent valid value within `windowDays`
         of the newest lab date (today if no dated lab). Shared by Klinik Analiz, doctor report and
         NeyimVar test suggestions. `older: true` when the value comes from an earlier lab than the newest one. */
      function getMergedActiveLabs(windowDays = FRESH_DAYS_DEFAULT) {
        const records = sortedRecords();
        const newest = records.find(r => r && r.date) || null;
        const anchor = newest ? Date.parse(`${newest.date}T00:00:00`) : Date.now();
        const cutoff = anchor - windowDays * 86400000;
        const out = {};
        LAB_HISTORY_METRICS.forEach(metric => {
          const series = seriesFor(metric, records);
          const idx = series.findIndex(s => !s.date || Date.parse(`${s.date}T00:00:00`) >= cutoff);
          if (idx === -1) return;
          const cur = series[idx];
          const prev = series[idx + 1] || null;
          out[metric.key] = {
            value: cur.value, date: cur.date, record: cur.record,
            older: Boolean(newest && cur.date && cur.date !== newest.date),
            prev: prev ? { value: prev.value, date: prev.date } : null
          };
        });
        return { labs: out, newestDate: newest ? newest.date : null, windowDays };
      }

      /* Her gösterge için tarih sırasına göre ölçüm serisi (en yeni önce) */
      function seriesFor(metric, records) {
        const gender = state.user?.gender || "K";
        const series = [];
        records.forEach(record => {
          const v = parseLabNumericValue(record[metric.key]);
          if (v !== null) series.push({ value: v, date: record.date || null, record });
        });
        if (!series.length) {
          const v = parseLabNumericValue(state.labValues?.[metric.key]);
          if (v !== null) series.push({ value: v, date: null, record: { references: state.labReferences || {}, genderAtTest: gender } });
        }
        return series;
      }

      /* Hızlı ham değerler (sınıflandırmasız): CRP/Hb bağlamı için */
      function latestRaw() {
        const records = sortedRecords();
        const out = {};
        LAB_HISTORY_METRICS.forEach(metric => {
          const s = seriesFor(metric, records)[0];
          out[metric.key] = s ? { value: s.value, date: s.date, ageDays: daysAgo(s.date), record: s.record } : null;
        });
        return out;
      }

      /* Ferritin gibi yorumları etkileyen bağlam değerleri (yalnızca güncel ölçümler) */
      function contextValues(freshDays = FRESH_DAYS_DEFAULT) {
        const raw = latestRaw();
        const fresh = k => (raw[k] && (raw[k].ageDays === null || raw[k].ageDays <= freshDays)) ? raw[k].value : null;
        return { crp: fresh("crp"), hb: fresh("hb"), age: state.user?.age || null };
      }

      function classify(key, value, record, ctx) {
        const gender = record?.genderAtTest || state.user?.gender || "K";
        const ref = String(record?.references?.[key] || "").trim();
        if (window.VitaLabEvidence && VitaLabEvidence.handles(key)) {
          const ev = VitaLabEvidence.evaluate(key, value, { gender, reference: ref, age: ctx?.age, crp: ctx?.crp, hb: ctx?.hb });
          const lvl = ev.clinical?.level;
          let direction = "normal";
          if (ev.status === "not_assessable") direction = "na";
          else if (ev.status === "urgent") direction = ev.clinical?.side === "low" ? "low" : "high";
          else if (ev.status === "borderline") direction = (lvl === "high_review") ? "high" : (lvl === "low_likely" ? "low" : "borderline");
          else if (ev.status === "below_ref") direction = (ev.referenceUsed === "lab" || lvl === "low_likely") ? "low" : "borderline";
          else if (ev.status === "above_ref") direction = ev.referenceUsed === "lab" ? "high" : "normal";
          return { direction, status: ev.status, source: ev.referenceUsed === "lab" ? "lab" : "app", reference: ev.reference, statusText: ev.statusText, message: ev.message, evidence: ev };
        }
        // Extra CBC / thyroid / metabolic markers
        if (typeof evaluateVitaExtraLab === "function") {
          const x = evaluateVitaExtraLab(key, value, gender, ref);
          if (x) {
            const direction = x.status === "urgent" ? (x.isLow ? "low" : "high") : (x.isLow ? "low" : (x.isHigh ? (x.isBorderline ? "borderline" : "high") : "normal"));
            let reference = ref;
            if (x.referenceSource !== "lab") { try { reference = getVitaAppLabReference(key, gender); } catch (_) { reference = ""; } }
            return { direction, status: x.status, source: x.referenceSource, reference, statusText: x.statusText, message: x.status === "urgent" ? x.statusText : "" };
          }
        }
        // Kreatinin / ALT: laboratuvar referansı (birim uyumluysa) → VitaTakip genel eşiği
        try {
          if (ref && isVitaLabReferenceCompatible(key, ref)) {
            const range = parseVitaLabReferenceRange(ref);
            if (range) {
              const direction = value < range.min ? "low" : (value > range.max ? "high" : "normal");
              return { direction, status: direction === "normal" ? "in_ref" : (direction === "low" ? "below_ref" : "above_ref"), source: "lab", reference: ref, statusText: DIR_TEXT[direction], message: "" };
            }
          }
        } catch (_) { /* referans ayrıştırılamadı */ }
        let ev = null;
        try { ev = KDSSRuleEngine.evaluateLegacy ? KDSSRuleEngine.evaluateLegacy(key, value, gender, "") : KDSSRuleEngine.evaluate(key, value, gender, ""); } catch (_) { ev = null; }
        const direction = ev ? (ev.isLow ? "low" : (ev.isHigh ? "high" : "normal")) : "normal";
        let reference = "";
        try { reference = getVitaAppLabReference(key, gender); } catch (_) { reference = ""; }
        return { direction, status: direction === "normal" ? "in_ref" : (direction === "low" ? "below_ref" : "above_ref"), source: "app", reference, statusText: ev?.statusText || DIR_TEXT[direction], message: "" };
      }

      /* Her gösterge için EN GÜNCEL değer + bir önceki ölçüm. Farklı tarihlerde girilen göstergeler birleştirilir. */
      function buildPanel() {
        const records = sortedRecords();
        const ctx = contextValues();
        return LAB_HISTORY_METRICS.map(metric => {
          const series = seriesFor(metric, records);
          if (!series.length) return { ...metric, present: false };
          const latest = series[0];
          const cls = classify(metric.key, latest.value, latest.record, ctx);
          const prev = series[1] || null;
          let trend = null;
          if (prev) {
            const delta = latest.value - prev.value;
            const pct = prev.value !== 0 ? (delta / Math.abs(prev.value)) * 100 : null;
            const dir = pct !== null && Math.abs(pct) < 5 ? "stable" : (delta > 0 ? "up" : "down");
            const prevCls = classify(metric.key, prev.value, prev.record, ctx);
            trend = { previousValue: prev.value, previousDate: prev.date, delta, pct, dir, prevDirection: prevCls.direction };
          }
          const ageDays = daysAgo(latest.date);
          return {
            ...metric, present: true, value: latest.value, date: latest.date, ageDays,
            refText: String(latest.record?.references?.[metric.key] || "").trim(),
            direction: cls.direction, status: cls.status, appDirection: cls.direction, source: cls.source, reference: cls.reference,
            statusText: cls.statusText, message: cls.message, evidence: cls.evidence || null,
            stale: ageDays !== null && ageDays > FRESH_DAYS_DEFAULT,
            trend, history: series.slice(0, 4).map(s => ({ value: s.value, date: s.date }))
          };
        });
      }

      /* KLİNİK ANALİZ (CDSS) GİRDİLERİ: her göstergenin en güncel değeri + kendi kaydının referansı.
         Güncel olmayan (varsayılan >90 gün) ölçümler analize SOKULMAZ; ayrıca listelenir. */
      function cdssInputs(opts = {}) {
        const freshDays = Number.isFinite(opts.freshDays) ? opts.freshDays : FRESH_DAYS_DEFAULT;
        const raw = latestRaw();
        const values = {}, references = {}, dates = {}, stale = [], used = [];
        LAB_HISTORY_METRICS.forEach(metric => {
          const r = raw[metric.key];
          values[metric.key] = null; references[metric.key] = ""; dates[metric.key] = null;
          if (!r) return;
          const isStale = r.ageDays !== null && r.ageDays > freshDays;
          if (isStale) { stale.push({ key: metric.key, label: metric.label, value: r.value, unit: metric.unit, date: r.date, ageDays: r.ageDays }); return; }
          values[metric.key] = r.value;
          references[metric.key] = String(r.record?.references?.[metric.key] || state.labReferences?.[metric.key] || "").trim();
          dates[metric.key] = r.date;
          used.push({ key: metric.key, label: metric.label, value: r.value, unit: metric.unit, date: r.date });
        });
        const distinct = [...new Set(used.map(u => u.date).filter(Boolean))];
        return { values, references, dates, stale, used, multiDate: distinct.length > 1, distinctDates: distinct.sort(), freshDays };
      }

      function fmtNum(n) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); }
      function trendWord(t) { return t.dir === "stable" ? "büyük ölçüde değişmedi" : (t.dir === "up" ? "arttı" : "azaldı"); }

      function analyze() {
        const markers = buildPanel();
        const by = Object.fromEntries(markers.map(m => [m.key, m]));
        const has = k => Boolean(by[k]?.present);
        const dir = k => (by[k]?.present ? by[k].direction : null);
        const stat = k => (by[k]?.present ? by[k].status : null);
        const chronic = Array.isArray(state.user?.chronic) ? state.user.chronic : [];
        const supplementNames = (Array.isArray(state.supplements) ? state.supplements : []).map(s => String(s?.name || "").toLowerCase());
        const patterns = [];
        const add = (title, text) => patterns.push({ title, text });
        const ironLowish = has("ferritin") && (dir("ferritin") === "low" || dir("ferritin") === "borderline");
        const anemia = has("hb") && by.hb.evidence?.clinical?.level === "low_likely";
        const mcvBelow = has("mcv") && by.mcv.evidence?.refStatus === "below";
        const mcvAbove = has("mcv") && by.mcv.evidence?.refStatus === "above";

        const lowKeys = LOW_KEYS.filter(k => dir(k) === "low");
        const lowLabel = k => by[k].label;

        // Hemogram ile birlikte demir / B12 / folat
        if (anemia) {
          if (mcvBelow) add("Düşük hemoglobin + düşük MCV (mikrositer örüntü)", `Hemoglobin düşük ve MCV referansın altında.${ironLowish ? " Ferritin de düşük/sınırda olduğundan demir eksikliği anemisi olasılığı güçlenir;" : " Ferritin düşük görünmüyor;"} talasemi taşıyıcılığı, kronik hastalık ve kan kaybı gibi nedenler de olabilir. Hekim değerlendirmesi gerekir.`);
          else if (mcvAbove) add("Düşük hemoglobin + yüksek MCV (makrositer örüntü)", "Hemoglobin düşük, MCV yüksek: B12 veya folat eksikliği, alkol, karaciğer, tiroid ve bazı ilaçlar akla gelir. Folat takviyesi B12 eksikliğinin kansızlık bulgusunu maskeleyebileceğinden B12 durumu önce hekimle değerlendirilmelidir.");
          else if (has("mcv")) add("Düşük hemoglobin + normal MCV (normositer örüntü)", `Kronik hastalık, kanama, böbrek hastalığı veya erken/karma eksiklikler akla gelir.${ironLowish ? " Ferritin düşük/sınırda: erken veya karma demir eksikliği olabilir." : ""} Hekim değerlendirmesi gerekir.`);
          else add("Düşük hemoglobin, MCV girilmemiş", "Kansızlığın türünü ayırt etmek için tam kan sayımındaki MCV değerini de ekleyin. Hekim değerlendirmesi gerekir.");
        } else if (ironLowish && has("hb")) {
          add("Ferritin düşük/sınırda, hemoglobin düşük değil", "Anemi olmadan da demir depoları azalmış olabilir (demir eksikliği, anemisiz). Belirtiler, adet kanaması, beslenme ve emilimi etkileyen durumlar hekimle gözden geçirilmeli; takviye kararı hekime bırakılmalıdır.");
        } else if (ironLowish && !has("hb")) {
          add("Ferritin düşük/sınırda, hemogram girilmemiş", "Ferritin yorumu için hemoglobin ve MCV (tam kan sayımı) gerekir. Bu değerleri ekleyin ya da hekiminize sorun.");
        }
        if (has("crp") && by.crp.evidence?.refStatus === "above" && has("ferritin")) {
          add("CRP yüksek: ferritin yorumu", "CRP yüksekken (>5 mg/L) ferritin enflamasyonla yükselir; WHO bu durumda 70 ng/mL altını demir eksikliği açısından anlamlı sayar. Normal görünen ferritin demir eksikliğini dışlamayabilir.");
        }
        if (dir("ferritin") === "low" && (dir("b12") === "low" || dir("folate") === "low")) {
          add("Demir deposu ile B12/folat birlikte düşük", "Ferritin ile B12 ve/veya folat birlikte düşük. Karma bir eksiklik tablosu olabilir; bu durumda MCV tek başına yanıltıcı olabilir (demir eksikliği MCV'yi düşürür, B12/folat eksikliği yükseltir; birlikteyken normal görünebilir). Hemogram ve gerekirse periferik yayma hekimle konuşulmalıdır.");
        } else if (dir("b12") === "low" && dir("folate") === "low") {
          add("B12 ve folat birlikte düşük", "İkisi birlikte düşükse ortak nedenler (beslenme, emilim sorunları, mide asidini azaltan ilaçlar) akla gelir; hekim değerlendirmesi önemlidir.");
        }
        if ((dir("b12") === "low" || dir("b12") === "borderline") && has("folate") && dir("folate") !== "low") {
          add("B12 düşük/sınırda, folat düşük değil", "Folat yüksek veya normal olduğunda B12 eksikliğinin kansızlık bulgusu maskelenebilir, sinir sistemi belirtileri gözden kaçabilir. Folat takviyesine başlamadan önce B12 durumu hekimle değerlendirilmelidir.");
        }
        if (dir("b12") === "high") {
          add("B12 yüksek", `B12 referansın üzerinde. Takviye (özellikle yüksek doz veya enjeksiyon) en sık nedendir. B12 için tolere edilebilir üst alım sınırı belirlenmemiştir; yüksek serum değeri tek başına toksisite anlamına gelmez. Takviye yoksa ve yükseklik tekrarlıyorsa hekim karaciğer, böbrek ve kan hastalıkları açısından değerlendirebilir.${by.b12.value > 1000 ? " Değer 1000 pg/mL üzerinde." : ""}`);
        }
        if (dir("ferritin") === "high") {
          add("Ferritin yüksek", `Ferritin enflamasyon, karaciğer hastalığı, alkol ve metabolik durumlarda da yükselebilir; tek başına demir fazlası göstermez. Demir içeren takviyelere başlamadan önce hekime danışılmalıdır.${dir("alt") === "high" ? " ALT de yüksek olduğundan karaciğer kaynaklı yükselme de değerlendirilmelidir." : ""}`);
        }
        // D vitamini / kalsiyum / magnezyum
        if (dir("d3") === "low" && dir("ca") === "low") {
          add("D vitamini ve kalsiyum birlikte düşük", "D vitamini kalsiyum emilimini destekler. İkisi birlikte düşükse hekim paratiroid hormonu (PTH), albümin ve fosfor gibi tetkikleri isteyebilir. Total kalsiyum albümine bağlı olduğundan albümin düşüklüğü de kalsiyumu düşük gösterebilir.");
        } else if ((dir("d3") === "low" || dir("d3") === "borderline") && dir("ca") === "normal") {
          add("D vitamini düşük/sınırda, kalsiyum referans içinde", "Kalsiyum kanda sıkı düzenlendiğinden normal olması D vitamini düşüklüğünün önemsiz olduğu anlamına gelmez; kemik sağlığı açısından hekim değerlendirmesi uygundur.");
        }
        if (dir("ca") === "low" && dir("mg") === "low") {
          add("Kalsiyum ve magnezyum birlikte düşük", "Magnezyum düşüklüğü kalsiyum düzeyinin düzenlenmesini bozarak kalsiyumu da düşürebilir. Birlikte düşükse magnezyum durumu ayrıca önem taşır.");
        }
        if (dir("mg") === "low" && (chronic.includes("ppi") || chronic.includes("diuretic"))) {
          add("Magnezyum düşük ve ilaç kaydı", `${chronic.includes("ppi") ? "Mide asidini azaltan (PPI) ilaçlar" : "İdrar söktürücü ilaçlar"} magnezyum düşüklüğüyle ilişkilendirilmiştir. İlacı kendiniz bırakmayın; hekime bildirin.`);
        }
        // Böbrek
        const crea = by.creatinine;
        let egfr = null;
        try { egfr = crea?.present && state.user?.age >= 18 ? calculateCKDEPI_eGFR(crea.value, state.user.age, state.user.gender) : null; } catch (_) { egfr = null; }
        const renal = chronic.includes("kidney") || (egfr && egfr.egfr < 60) || dir("creatinine") === "high";
        if (renal) {
          add("Böbrek işlevi ve mineraller",
            `${egfr ? `Hesaplanan eGFR ${egfr.egfr} mL/dk/1.73m² (${egfr.stage}). ` : ""}Böbrek işlevi azalmış olabilir veya böbrek öyküsü kayıtlı. Magnezyum, kalsiyum ve kreatin gibi takviyeler böbrek işlevine göre hekimce değerlendirilmelidir${dir("mg") === "high" ? "; magnezyum yüksek görünüyor, magnezyum içeren takviye ve antiasitlerden önce hekime danışın" : ""}.`);
        }
        if (dir("creatinine") === "high" && supplementNames.some(n => n.includes("kreatin"))) {
          add("Kreatin takviyesi ve kreatinin", "Kreatin takviyesi ve yüksek kas kütlesi serum kreatinini yükseltebilir; bu durumda eGFR gerçek böbrek işlevini olduğundan düşük gösterebilir. Hekime kreatin kullandığınızı mutlaka söyleyin.");
        }
        // Karaciğer
        if (has("alt") && (by.alt.value > 50 || dir("alt") === "high")) {
          add("ALT yüksek", `ALT${by.alt.value > 50 ? " 50 U/L üzerinde (Hepatik Güvenlik Uyarısı)" : " referansın üstünde"}. İlaçlar, alkol, yağlı karaciğer ve enfeksiyonlar gibi pek çok neden olabilir. Yüksek doz yağda çözünen vitaminler ve bazı takviyeler karaciğeri etkileyebileceğinden hekim kontrolü gerekir.`);
        }
        // Çinko
        if (dir("zinc") === "low" && dir("ca") === "low") {
          add("Çinko ve kalsiyum birlikte düşük", "Her ikisi de albümine bağlı taşınır; albümin düşüklüğü ikisini birden düşük gösterebilir. Hekime albümin sorulabilir.");
        }
        if (dir("zinc") === "low" && dir("ferritin") === "low") {
          add("Çinko ve ferritin birlikte düşük", "Yetersiz alım veya emilim sorunlarıyla birlikte görülebilir; beslenme düzeni ve emilimi etkileyen durumlar hekimle gözden geçirilmelidir.");
        }
        /* ---- Cross-biomarker correlations (90-day window; stale markers ignored) ---- */
        const cur = k => (by[k]?.present && !by[k].stale ? by[k] : null);
        const num = k => (cur(k) ? Number(cur(k).value) : null);
        // "above_ref"/"below_ref" with the general (app) range is mapped to direction "normal" by classify(); still counts here
        const hi = k => Boolean(cur(k) && (dir(k) === "high" || cur(k).status === "above_ref" || cur(k).evidence?.refStatus === "above"));
        const lo = k => Boolean(cur(k) && (dir(k) === "low" || cur(k).status === "below_ref" || cur(k).evidence?.refStatus === "below" || (dir(k) === "borderline" && cur(k).status !== "above_ref")));
        const tags = (() => { try { const r = sortedRecords()[0]; return Array.isArray(r?.contextTags) ? r.contextTags : []; } catch (_) { return []; } })();
        // B12 & folate axis: functional deficiency, megaloblastic tendency
        if ((lo("b12") || dir("b12") === "borderline") && hi("hcy")) {
          add("B12 düşük/sınırda + homosistein yüksek", "Homosistein yüksekliği B12 veya folatın hücre düzeyinde yetersiz kaldığını (işlevsel eksiklik) düşündürebilir; serum B12 sınırdayken bu bulgu önem kazanır. Metilmalonik asit (MMA) ve folat hekimle değerlendirilebilir.");
        }
        if (num("mcv") !== null && num("mcv") > 100) {
          add("MCV 100 fL üzerinde (makrositoz)", `MCV ${fmtNum(num("mcv"))} fL: alyuvarlar büyük. Megaloblastik eğilim açısından B12 ve folat durumu önceliklidir; alkol, karaciğer, tiroid ve bazı ilaçlar da neden olabilir.${!cur("b12") || !cur("folate") ? " B12 veya folat ölçümü yoksa hekiminize sorun." : ""}`);
        }
        // Anemia differentiation: mixed deficiency hidden behind a normal MCV
        if (hi("rdw") && cur("mcv") && dir("mcv") === "normal") {
          add("RDW-CV yüksek, MCV normal: karma eksiklik olasılığı", "Alyuvar boyutları arasında farklılık var ama ortalama boyut (MCV) normal. Demir eksikliği (küçük hücre) ile B12/folat eksikliği (büyük hücre) birlikteyken birbirini maskeleyip MCV'yi normal gösterebilir (mikst anemi). Ferritin, B12 ve folat birlikte değerlendirilmelidir.");
        } else if (hi("rdw") && lo("ferritin")) {
          add("RDW-CV yüksek + ferritin düşük", "Yüksek RDW ile düşük ferritin birlikte erken demir eksikliğini düşündürür; hemoglobin henüz düşmemiş olabilir.");
        }
        // Vitamin D & cofactor axis
        if (lo("d3") && lo("mg")) {
          add("D vitamini ve magnezyum birlikte düşük", "Magnezyum, D vitamininin aktif biçimine dönüşmesi için gereklidir; düşükken D vitamini beklenen ölçüde yükselmeyebilir. Birlikte hekimle değerlendirilmeli.");
        } else if (lo("d3") && cur("mg") && dir("mg") === "normal") {
          add("D vitamini düşük, magnezyum referans içinde", "Magnezyum D vitamini aktivasyonu için gerekli bir yardımcıdır; şu an referans içinde görünüyor.");
        }
        // Inflammation masking (WBC as well as CRP)
        if (hi("wbc") && cur("ferritin") && !(has("crp") && by.crp.evidence?.refStatus === "above")) {
          add("Lökosit yüksek: ferritin yorumu", "Lökosit yüksekliği enfeksiyon veya enflamasyona işaret edebilir. Ferritin bir akut faz reaktanıdır; enflamasyon sırasında yükselerek altta yatan demir eksikliğini gizleyebilir. Enflamasyon geçtikten sonra tekrar ölçüm hekimle konuşulabilir.");
        }
        // Thyroid & micronutrients
        if (cur("tsh") && dir("tsh") !== "normal") {
          const cof = ["ferritin", "d3", "b12", "zinc"].map(k => cur(k) ? `${by[k].label} ${fmtNum(by[k].value)} (${DIR_TEXT[dir(k)] || dir(k)})` : `${by[k]?.label || k}: ölçülmedi`);
          add(`TSH ${dir("tsh") === "low" ? "düşük" : "yüksek"}: tiroid ve mikro besinler`, `TSH referans dışında. Tiroid işlevi ile demir (ferritin), D vitamini, B12 ve çinko durumu birbirini etkileyebilir; yorgunluk gibi belirtilerde birlikte değerlendirilir. Durum: ${cof.join("; ")}. Serbest T4 ve tiroid antikorları hekim kararıyla istenebilir.`);
        }
        // Hydration / hemoconcentration
        const hbHigh = cur("hb") && (dir("hb") === "high" || by.hb.evidence?.refStatus === "above");
        const hctHighNormal = (() => { const v = num("hct"); if (v === null) return false; const male = (state.user?.gender || "K") === "E"; return v >= (male ? 48 : 43); })();
        if (hbHigh && (hi("rbc") || hi("hct") || hctHighNormal) && !tags.includes("Su içerek gittim")) {
          add("Hemoglobin ve kırmızı kan hücreleri yüksek: su durumu", `${tags.includes("Susuzdum") ? "Tahlile susuz gittiğinizi işaretlediniz. " : ""}Yeterli su içmeden verilen tahlillerde hemoglobin ve kırmızı kan hücreleri geçici olarak yüksek görünebilir; hekiminizle sıvı alımı durumunuzu paylaşın. Yükseklik yeterli su alımıyla tekrarlanan tahlilde de sürerse nedeni hekimce araştırılır.`);
        }
        // Metabolic
        if (hi("hba1c") || hi("glucose")) {
          add("Kan şekeri göstergeleri yüksek", `${cur("hba1c") ? `HbA1c %${fmtNum(num("hba1c"))}` : ""}${cur("hba1c") && cur("glucose") ? ", " : ""}${cur("glucose") ? `açlık glukozu ${fmtNum(num("glucose"))} mg/dL` : ""}. Prediyabet veya diyabet açısından hekim değerlendirmesi gerekir. Metformin kullananlarda B12 düzeyi de izlenmelidir.`);
        }
        if (lowKeys.length >= 3) {
          add(`${lowKeys.length} değer birlikte düşük`,
            `${lowKeys.map(lowLabel).join(", ")} birlikte referansın altında. Beslenme yetersizliği, emilim sorunları (çölyak, mide asidini azaltan ilaçlar, metformin), kronik kayıp veya genel bir hastalık durumu birlikte düşüklüğe yol açabilir; tek tek takviye aramak yerine nedenin hekimce araştırılması uygundur.`);
        }
        // Zamanla değişim
        const trendNotes = [];
        markers.filter(m => m.present && m.trend).forEach(m => {
          const t = m.trend;
          const base = `${m.label}: ${fmtNum(t.previousValue)}${t.previousDate ? ` (${t.previousDate})` : ""} → ${fmtNum(m.value)}${m.date ? ` (${m.date})` : ""} ${m.unit}, ${trendWord(t)}${t.pct !== null && t.dir !== "stable" ? ` (%${fmtNum(Math.abs(Math.round(t.pct)))} ${t.dir === "up" ? "artış" : "azalış"})` : ""}`;
          let extra = "";
          if (t.prevDirection !== m.direction) {
            if (m.direction === "normal") extra = "; referans dışından referans aralığına geldi";
            else if (t.prevDirection === "normal") extra = `; referans aralığından ${m.direction === "low" ? "düşüğe" : (m.direction === "high" ? "yükseğe" : "sınıra")} geçti`;
            else extra = "; durumu değişti";
          }
          trendNotes.push(base + extra + ".");
        });
        // Veri kalitesi
        const dated = markers.filter(m => m.present && m.date).map(m => m.date).sort();
        const dataNotes = [];
        if (dated.length >= 2) {
          const spanDays = Math.round((Date.parse(dated[dated.length - 1]) - Date.parse(dated[0])) / 86400000);
          if (spanDays > 30) dataNotes.push(`Göstergeler farklı tarihlerde ölçülmüş (en eski ${dated[0]}, en yeni ${dated[dated.length - 1]}); birlikte yorumlarken zaman farkı hesaba katılmalıdır.`);
        }
        markers.filter(m => m.present && m.status === "not_assessable").forEach(m => dataNotes.push(`${m.label}: ${m.message}`));
        const stale = markers.filter(m => m.present && m.ageDays !== null && m.ageDays > STALE_REVIEW_DAYS).map(m => m.label);
        if (stale.length) dataNotes.push(`${stale.join(", ")} ölçümü 6 aydan eski; güncel durumu yansıtmayabilir.`);
        if (["ferritin", "b12", "folate"].some(has) && !has("hb")) dataNotes.push("Hemogram (Hb, MCV) girilmedi; ferritin, B12 ve folat yorumu hemogram ile çok daha güvenilir olur.");

        // Optional extra markers (CBC/thyroid/metabolic) are not listed as "missing" when not entered
        const optionalKeys = new Set(window.VITA_EXTRA_LAB_KEYS || []);
        return { markers, entered: markers.filter(m => m.present), missing: markers.filter(m => !m.present && !optionalKeys.has(m.key)), patterns, trendNotes, dataNotes, egfr };
      }

      function hasAnyLab() { return buildPanel().some(m => m.present); }

      /* Yapay zekâya gönderilecek metin: girilen TÜM tahliller + ilişkiler + değişim. */
      function promptBlock() {
        const a = analyze();
        if (!a.entered.length) return "";
        const lines = a.entered.map(m => {
          const ref = m.source === "lab" ? `laboratuvar referansı: ${m.reference}` : `genel aralık${m.reference ? `: ${m.reference}` : ""} (laboratuvar referansı girilmedi)`;
          const hist = m.trend ? `; önceki ölçüm: ${fmtNum(m.trend.previousValue)}${m.trend.previousDate ? ` (${m.trend.previousDate})` : ""} → ${trendWord(m.trend)}` : "; önceki ölçüm kaydı yok";
          return `- ${m.label}: ${fmtNum(m.value)} ${m.unit}${m.date ? ` (${m.date})` : " (tarih yok)"} — durum: ${m.statusText} [${ref}]${hist}${m.stale ? " [90 günden eski ölçüm]" : ""}${m.message ? ` | Değerlendirme notu: ${m.message}` : ""}`;
        });
        const parts = [`[TAHLİL PANELİ — kullanıcının girdiği TÜM tahliller, her gösterge için en güncel ölçüm]\n${lines.join("\n")}`];
        if (a.missing.length) parts.push(`Girilmemiş göstergeler: ${a.missing.map(m => m.label).join(", ")}.`);
        if (a.egfr && Number.isFinite(a.egfr.egfr)) parts.push(`Hesaplanan eGFR (CKD-EPI 2021): ${a.egfr.egfr} mL/dk/1.73m² (${a.egfr.stage}).`);
        if (a.patterns.length) parts.push(`[UYGULAMANIN KURAL TABANLI ÖN GÖZLEMLERİ — doğrulama için; tanı değildir]\n${a.patterns.map(p => `- ${p.title}: ${p.text}`).join("\n")}`);
        if (a.trendNotes.length) parts.push(`[ÖNCEKİ ÖLÇÜMLERLE KARŞILAŞTIRMA]\n${a.trendNotes.map(t => `- ${t}`).join("\n")}`);
        if (a.dataNotes.length) parts.push(`[VERİ NOTLARI]\n${a.dataNotes.map(t => `- ${t}`).join("\n")}`);
        parts.push("[YORUM İLKELERİ] Laboratuvar referans aralığı, klinik değerlendirme eşiği, takviye gereksinimi ve toksisite ayrı kavramlardır. Referans dışı bir sonuç tek başına takviye gerektirmez; referans içi bir sonuç eksikliği her durumda dışlamaz. Yüksek serum B12 tek başına toksisite değildir. Doz önerme.");
        return parts.join("\n");
      }

      /* Yerel motor için HTML özeti */
      function labsHtml() {
        const a = analyze();
        if (!a.entered.length) return "";
        const rows = a.entered.map(m => {
          const tr = m.trend ? ` Önceki ${esc(fmtNum(m.trend.previousValue))}${m.trend.previousDate ? ` (${esc(m.trend.previousDate)})` : ""}: ${esc(trendWord(m.trend))}.` : "";
          const src = m.source === "lab" ? `laboratuvar referansı ${esc(m.reference)}` : "genel aralık, yaklaşık";
          return `<li><strong>${esc(m.label)}:</strong> ${esc(fmtNum(m.value))} ${esc(m.unit)}${m.date ? ` (${esc(m.date)})` : ""} — ${esc(m.statusText)} <span class="text-slate-500">(${src})</span>.${tr}</li>`;
        }).join("");
        const miss = a.missing.length ? `<p class="mt-1 text-slate-500">Girilmemiş: ${a.missing.map(m => esc(m.label)).join(", ")}.</p>` : "";
        return `<ul class="list-disc pl-4 space-y-0.5">${rows}</ul>${miss}`;
      }

      function relationsHtml(includeTrend = true) {
        const a = analyze();
        const items = [
          ...a.patterns.map(p => `<li><strong>${esc(p.title)}:</strong> ${esc(p.text)}</li>`),
          ...(includeTrend ? a.trendNotes.map(t => `<li>${esc(t)}</li>`) : [])
        ];
        const notes = a.dataNotes.map(t => `<p class="mt-1 text-slate-500">${esc(t)}</p>`).join("");
        if (!items.length && !notes) return "";
        return `${items.length ? `<ul class="list-disc pl-4 space-y-0.5">${items.join("")}</ul>` : ""}${notes}`;
      }

      function trendHtml() {
        const a = analyze();
        if (!a.entered.length) return "Henüz kayıtlı tahlil değeri yok; karşılaştırma yapılamaz.";
        if (!a.trendNotes.length) return "Karşılaştırılabilecek önceki ölçüm bulunamadı: her gösterge için yalnızca tek tarihli kayıt var. Aynı göstergeyi farklı tarihlerde girdiğinizde değişim burada görünür.";
        return `<ul class="list-disc pl-4 space-y-0.5">${a.trendNotes.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`;
      }

      return { analyze, buildPanel, hasAnyLab, promptBlock, labsHtml, relationsHtml, trendHtml, cdssInputs, contextValues, latestRaw, getMergedActiveLabs, sortedRecords, FRESH_DAYS_DEFAULT };
    })();
    window.VitaLabInsights = VitaLabInsights;
    window.getMergedActiveLabs = VitaLabInsights.getMergedActiveLabs;
