/* =========================================================================
   TAKVİYE ve İLAÇ MODÜLLERİ — birbirinden tamamen ayrı iki ürün alanı.
   - Ayrı katalog: data/tr-supplements.json  ↔  data/tr-medications.json
   - Ayrı öğrenilmiş barkod önbelleği: vita_custom_supplement_barcodes ↔ vita_custom_medication_barcodes
   - Ayrı kullanıcı kaydı: vitatakip_supplements_<hesap> ↔ vitatakip_medications_<hesap> (+ vitatakip_med_taken_<hesap>)
   Barkod okuyucu hangi modülden açıldıysa (mode) YALNIZCA o modülün önbelleğinde ve kataloğunda arar.
   Kademeli arama: 1) modül önbelleği 2) modül kataloğu 3) Open Food Facts / Open Products Facts (yalnızca takviye)
                   4) 869 önekinden firma tahmini 5) Gemini (yalnızca anahtar varsa; ilaçta veri paylaşım onayı da gerekir)
   ========================================================================= */
    const VITA_PRODUCT_MODES = {
      supplement: { catalogUrl: "./data/tr-supplements.json", cacheKey: "vita_custom_supplement_barcodes", label: "takviye", catalogLabel: "Türkiye takviye kataloğu" },
      medication: { catalogUrl: "./data/tr-medications.json", cacheKey: "vita_custom_medication_barcodes", label: "ilaç", catalogLabel: "Türkiye ilaç kataloğu" }
    };
    const VITA_OPEN_FACTS_BASES = ["https://world.openfoodfacts.org", "https://world.openproductsfacts.org"];

    /* Türkçe karakter duyarsız karşılaştırma: "Magnezyum" = "magnezyum", "Çinko" = "cinko", "İlaç" = "ilac". */
    function vitaFold(value) {
      return String(value === null || value === undefined ? "" : value)
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9.+\-\s]/g, " ").replace(/\s+/g, " ").trim();
    }
    window.vitaFold = vitaFold;

    function vitaProductMode(mode) { return mode === "medication" ? "medication" : "supplement"; }

    /* Barkod anahtarı: baştaki sıfırlar ve GS1 karekod (01)GTIN biçimi okuyucudan bağımsız tek biçime indirgenir. */
    function vitaBarcodeKey(value) {
      if (typeof normalizeBarcodeForMatch === "function") return normalizeBarcodeForMatch(value);
      const digits = String(value || "").replace(/\D/g, "");
      return [8, 12, 13, 14].includes(digits.length) ? (digits.replace(/^0+/, "") || "0") : "";
    }
    /* GS1 kontrol hanesi (EAN-8 / UPC-A / EAN-13 / GTIN-14). Kamera ve fotoğraf okumalarında yanlış okunan
       (ör. bir çizgisi kaçırılmış) barkodlar başka bir ürünle eşleşmesin diye kullanılır. */
    function vitaIsValidGtin(value) {
      const d = String(value || "").replace(/\D/g, "");
      if (![8, 12, 13, 14].includes(d.length)) return false;
      const nums = d.split("").map(Number), check = nums.pop();
      const sum = nums.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
      return (10 - (sum % 10)) % 10 === check;
    }
    /* Okuyucudan gelen ham metin → doğrulanmış barkod anahtarı ("" = geçersiz / ürün barkodu değil). Karekoddaki GTIN de çıkarılır. */
    function vitaAcceptScannedCode(text) {
      const raw = String(text || "");
      const gtin = typeof window.extractGs1Gtin === "function" ? window.extractGs1Gtin(raw) : "";
      const digits = gtin || raw.replace(/\D/g, "");
      if (!vitaIsValidGtin(digits.length === 13 || digits.length === 14 || digits.length === 12 || digits.length === 8 ? digits : "")) return "";
      return vitaBarcodeKey(digits);
    }
    window.vitaIsValidGtin = vitaIsValidGtin;
    window.vitaAcceptScannedCode = vitaAcceptScannedCode;

    /* Dış kataloglara sorgu için 13 haneli EAN (12 haneli UPC-A başına 0 eklenir, 14 haneli GTIN'in baştaki 0'ı atılır). */
    function vitaBarcodeForQuery(value) {
      const key = vitaBarcodeKey(value);
      if (!key) return "";
      if (key.length < 8) return key.padStart(13, "0");
      if (key.length === 12) return "0" + key;
      return key.length > 13 ? key.slice(-13) : key;
    }

    /* ---------- 1) Gömülü kataloglar (her modülün kendi JSON dosyası) ---------- */
    const vitaCatalogCache = { supplement: null, medication: null };
    const vitaCatalogPromise = { supplement: null, medication: null };

    function vitaEmbeddedCatalog(mode) {
      // JSON okunamazsa (ör. ilk açılış çevrimdışı) uygulamanın içindeki ilgili veritabanı kullanılır — yine modüle özel.
      const code = c => (/^\d{8,14}$/.test(String(c || "")) ? String(c) : "");
      if (mode === "medication") {
        return (Array.isArray(window.VITA_PRESCRIPTION_DRUG_DB) ? window.VITA_PRESCRIPTION_DRUG_DB : [])
          .map(r => ({ barcode: code(r.barcode), urunAdi: r.urunAdi, etkenMadde: r.etkenMadde, kategori: r.kategori }));
      }
      return (Array.isArray(window.VITA_SUPPLEMENT_DB) ? window.VITA_SUPPLEMENT_DB : [])
        .map(s => ({ barcode: code(s.barcode), urunAdi: s.urunAdi, marka: s.marka, etkenMadde: s.etkenMadde, form: s.form, dozaj: s.dozaj, kutuAdedi: s.kutuAdedi, gunlukDoz: s.gunlukDoz, zamanBloku: s.zamanBloku, aclikDurumu: s.aclikDurumu }));
    }

    function prepareVitaCatalogItems(mode, items) {
      return (Array.isArray(items) ? items : [])
        .filter(it => it && typeof it.urunAdi === "string" && it.urunAdi.trim())
        .map(it => ({ ...it, mode, _key: vitaBarcodeKey(it.barcode), _fold: vitaFold([it.urunAdi, it.marka, it.etkenMadde, it.kategori].filter(Boolean).join(" ")) }));
    }

    function loadVitaCatalog(mode) {
      mode = vitaProductMode(mode);
      if (vitaCatalogCache[mode]) return Promise.resolve(vitaCatalogCache[mode]);
      if (!vitaCatalogPromise[mode]) {
        const url = VITA_PRODUCT_MODES[mode].catalogUrl;
        vitaCatalogPromise[mode] = (typeof fetch === "function" ? fetch(url) : Promise.reject(new Error("fetch yok")))
          .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
          .then(json => (Array.isArray(json && json.items) ? json.items : Promise.reject(new Error("katalog biçimi"))))
          .catch(error => { console.warn(`[VitaTakip] ${url} okunamadı; gömülü ${mode} listesi kullanılıyor.`, error?.message || error); return vitaEmbeddedCatalog(mode); })
          .then(items => { vitaCatalogCache[mode] = prepareVitaCatalogItems(mode, items); return vitaCatalogCache[mode]; });
      }
      return vitaCatalogPromise[mode];
    }
    function getVitaCatalogSync(mode) {
      mode = vitaProductMode(mode);
      if (!vitaCatalogCache[mode]) { loadVitaCatalog(mode); return prepareVitaCatalogItems(mode, vitaEmbeddedCatalog(mode)); }
      return vitaCatalogCache[mode];
    }
    window.loadVitaCatalog = loadVitaCatalog;

    /* ---------- 2) Kullanıcının öğrettiği barkodlar (modül başına ayrı önbellek, cihaz genelinde) ---------- */
    function readVitaBarcodeCache(mode) {
      const key = VITA_PRODUCT_MODES[vitaProductMode(mode)].cacheKey;
      try {
        const parsed = JSON.parse(safeLocalStorageGetItem(key) || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_) { return {}; }
    }
    function learnVitaBarcode(mode, barcode, item) {
      mode = vitaProductMode(mode);
      const code = vitaBarcodeKey(barcode);
      const name = String(item?.urunAdi || "").trim().slice(0, 120);
      if (!code || !name) return false;
      const cache = readVitaBarcodeCache(mode);
      const fields = mode === "medication"
        ? ["etkenMadde", "kategori", "form"]
        : ["marka", "etkenMadde", "form", "dozaj", "kutuAdedi", "gunlukDoz", "zamanBloku", "aclikDurumu"];
      const entry = { urunAdi: name, learnedAt: Date.now() };
      fields.forEach(f => {
        const v = item?.[f];
        if (typeof v === "number" ? v > 0 : String(v || "").trim()) entry[f] = typeof v === "number" ? v : String(v).trim().slice(0, 160);
      });
      cache[code] = entry;
      // Önbellek sınırlı tutulur (en eski kayıtlar düşer).
      const entries = Object.entries(cache).sort((a, b) => (b[1].learnedAt || 0) - (a[1].learnedAt || 0)).slice(0, 500);
      return safeLocalStorageSetItem(VITA_PRODUCT_MODES[mode].cacheKey, JSON.stringify(Object.fromEntries(entries)));
    }
    window.learnVitaBarcode = learnVitaBarcode;
    window.readVitaBarcodeCache = readVitaBarcodeCache;

    /* ---------- Akıllı arama (otomatik tamamlama): yalnızca ilgili modülün önbelleği + kataloğu ---------- */
    function searchVitaProducts(mode, query, limit = 6) {
      mode = vitaProductMode(mode);
      const q = vitaFold(query);
      if (!q) return [];
      const digits = String(query || "").replace(/\D/g, "");
      const terms = q.split(" ").filter(Boolean);
      const cached = Object.entries(readVitaBarcodeCache(mode)).map(([code, it]) => ({
        ...it, barcode: code, mode, _source: "cache", _key: code, _fold: vitaFold([it.urunAdi, it.marka, it.etkenMadde, it.kategori].filter(Boolean).join(" "))
      }));
      const pool = [...cached, ...getVitaCatalogSync(mode).map(it => ({ ...it, _source: "catalog" }))];
      const scored = [];
      pool.forEach(it => {
        let score = 0;
        const nameFold = vitaFold(it.urunAdi);
        if (nameFold.startsWith(q)) score = 4;
        else if (terms.every(t => it._fold.includes(t))) score = nameFold.includes(terms[0]) ? 3 : 2;
        if (digits.length >= 4 && String(it._key || "").includes(digits.replace(/^0+/, ""))) score = Math.max(score, 3);
        if (score) scored.push({ it, score });
      });
      const seen = new Set();
      return scored
        .sort((a, b) => b.score - a.score || (a.it._source === "cache" ? -1 : 1))
        .map(x => x.it)
        .filter(it => { const k = vitaFold(it.urunAdi); if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, limit);
    }
    window.searchVitaProducts = searchVitaProducts;

    /* ---------- 3) Ücretsiz açık katalog (yalnızca takviye): yalnızca barkod numarası gönderilir ---------- */
    async function queryVitaOpenFacts(barcode, options = {}) {
      const code = vitaBarcodeForQuery(barcode);
      if (!code || (typeof navigator !== "undefined" && navigator.onLine === false)) return null;
      for (const base of VITA_OPEN_FACTS_BASES) {
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs || 6000) : null;
        try {
          const response = await fetch(`${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_tr,brands,generic_name,generic_name_tr,quantity`, {
            signal: controller ? controller.signal : undefined, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store"
          });
          if (!response.ok) continue;
          const data = await response.json();
          const p = data && data.status === 1 ? data.product : null;
          const name = String(p?.product_name_tr || p?.product_name || "").trim();
          if (!name) continue;
          const brand = String(p.brands || "").split(",")[0].trim();
          const qty = String(p.quantity || "");
          const count = qty.match(/(\d{1,4})\s*(?:kaps|kapsül|tablet|tab|caps|capsule|softgel|adet|saşe|sase|pastil|gummies|çiğneme)/i);
          return {
            urunAdi: (brand && !vitaFold(name).includes(vitaFold(brand)) ? `${brand} ${name}` : name).slice(0, 120),
            marka: brand.slice(0, 80),
            etkenMadde: String(p.generic_name_tr || p.generic_name || "").trim().slice(0, 160),
            kutuAdedi: count ? Number(count[1]) : 0,
            sourceLabel: base.includes("food") ? "Open Food Facts (açık ürün veritabanı)" : "Open Products Facts (açık ürün veritabanı)"
          };
        } catch (_) { /* zaman aşımı / ağ hatası: sıradaki adım */ }
        finally { if (timer) clearTimeout(timer); }
      }
      return null;
    }

    /* ---------- 4) 869 önekinden firma tahmini: uydurma yok, yalnızca bilinen kayıtlardan çıkarım ---------- */
    function guessVitaManufacturer(mode, barcode) {
      mode = vitaProductMode(mode);
      const code = vitaBarcodeForQuery(barcode);
      if (!/^\d{13}$/.test(code)) return null;
      const turkish = /^86[89]/.test(code);
      const prefix = code.slice(0, 7);
      // Aynı firma önekine (ilk 7 hane) sahip, bu modülde bilinen ürünlerin markası.
      const counts = new Map();
      const add = it => {
        const c = vitaBarcodeForQuery(it.barcode || it._key);
        if (!c || !c.startsWith(prefix) || c === code) return;
        const brand = String(it.marka || "").trim() || String(it.urunAdi || "").trim().split(/\s+/)[0];
        if (brand) counts.set(brand, (counts.get(brand) || 0) + 1);
      };
      Object.entries(readVitaBarcodeCache(mode)).forEach(([c, it]) => add({ ...it, barcode: c }));
      getVitaCatalogSync(mode).forEach(add);
      const brand = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      if (!turkish && !brand) return null;
      return {
        turkish, prefix, brand,
        text: brand
          ? `Bu barkodun firma kodu (${prefix}) daha önce ${brand} ürünlerinde görüldü; muhtemel üretici: ${brand}.`
          : "Barkod 869 ile başlıyor: GS1 Türkiye'de kayıtlı bir firmanın ürünü. Firma bu cihazdaki listelerden belirlenemedi."
      };
    }
    window.guessVitaManufacturer = guessVitaManufacturer;

    /* ---------- 5) Gemini ile barkod tanımlama (yalnızca anahtar varsa; tahmin olarak işaretlenir) ---------- */
    function vitaHasAiHealthConsent() {
      return Boolean(activeUserId && safeLocalStorageGetItem(`vita_ai_consent_${activeUserId}`) === "true");
    }
    function canUseVitaGeminiForBarcode(mode) {
      const hasKey = typeof getGeminiApiKey === "function" && Boolean(getGeminiApiKey());
      // İlaç barkodu sağlık verisidir (hangi ilacı kullandığınızı gösterir): Ayarlar'daki paylaşım onayı da gerekir.
      return hasKey && (vitaProductMode(mode) === "supplement" || vitaHasAiHealthConsent());
    }
    async function identifyVitaBarcodeWithGemini(mode, barcode) {
      mode = vitaProductMode(mode);
      const code = vitaBarcodeForQuery(barcode);
      if (!code || !canUseVitaGeminiForBarcode(mode) || typeof window.callGeminiWithFallback !== "function") return null;
      const what = mode === "medication" ? "ilaca" : "vitamin / gıda takviyesine";
      const prompt = `Barkod (EAN/GTIN) numarası: ${code}. Bu barkodun hangi ${what} ait olduğunu KESİN olarak biliyorsan şu JSON nesnesini döndür: {"urunAdi": "", "marka": "", "etkenMadde": "", "form": "", "dozaj": "", "kutuAdedi": 0, "emin": true}. Kesin bilmiyorsan tahmin etme: urunAdi boş ve emin false olsun. Sadece saf JSON döndür.`;
      try {
        const res = await window.callGeminiWithFallback(prompt, null, "image/jpeg", { expectBoxJson: true, mode, showFallbackToast: false, timeoutMs: 15000 });
        if (!res || res.usedLocalFallback) return null;
        const cleaned = String(res.text || "").replace(/```(?:json)?/gi, "").trim();
        const json = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
        const name = String(json?.urunAdi || "").trim();
        if (!name || json.emin === false) return null;
        return {
          urunAdi: name.slice(0, 120), marka: String(json.marka || "").trim().slice(0, 80), etkenMadde: String(json.etkenMadde || "").trim().slice(0, 160),
          form: String(json.form || "").trim().slice(0, 60), dozaj: String(json.dozaj || "").trim().slice(0, 80),
          kutuAdedi: Math.max(0, parseInt(json.kutuAdedi, 10) || 0), sourceLabel: "Gemini yapay zekâ tahmini"
        };
      } catch (_) { return null; }
    }

    /* ---------- Kademeli barkod arama (her iki modül) ---------- */
    async function lookupVitaBarcode(mode, rawBarcode, options = {}) {
      mode = vitaProductMode(mode);
      const key = vitaBarcodeKey(rawBarcode);
      if (!key) return { found: false, invalid: true, steps: [] };
      const steps = [];
      // 1) Bu modülün öğrenilmiş barkodları
      const cached = readVitaBarcodeCache(mode)[key];
      steps.push("cache");
      if (cached && cached.urunAdi) return { found: true, mode, barcode: key, item: { ...cached }, source: "cache", sourceLabel: "Bu cihazda daha önce kaydettiğiniz ürün", steps };
      // 2) Bu modülün gömülü kataloğu
      steps.push("catalog");
      const catalog = await loadVitaCatalog(mode);
      const hit = catalog.find(it => it._key && it._key === key);
      if (hit) return { found: true, mode, barcode: key, item: { ...hit }, source: "catalog", sourceLabel: VITA_PRODUCT_MODES[mode].catalogLabel, steps };
      // 3) Ücretsiz açık katalog — yalnızca takviye (ilaç barkodu sağlık verisi olduğu için dış kataloğa gönderilmez)
      if (mode === "supplement" && options.openFacts !== false) {
        steps.push("openfacts");
        const open = await queryVitaOpenFacts(key, options);
        if (open) return { found: true, mode, barcode: key, item: open, source: "openfacts", sourceLabel: open.sourceLabel, verifyHint: true, steps };
      }
      // 4) Firma tahmini (ürün adı vermez; kullanıcıya ipucu)
      steps.push("prefix");
      const guess = guessVitaManufacturer(mode, key);
      // 5) Gemini (yalnızca anahtar varsa)
      // Yalnızca açıkça istenirse (options.ai === true). Numaradan ürün tahmini güvenilmez (ör. Arveles kutusu "Concerta" çıkıyordu);
      // bulunamayan barkodda kullanıcıya "Yapay Zekâ ile Bul" (kutu fotoğrafı) önerilir.
      if (options.ai === true && canUseVitaGeminiForBarcode(mode)) {
        steps.push("gemini");
        const ai = await identifyVitaBarcodeWithGemini(mode, key);
        if (ai) return { found: true, mode, barcode: key, item: ai, source: "gemini", sourceLabel: ai.sourceLabel, verifyHint: true, guess, steps };
      }
      return { found: false, mode, barcode: key, guess, steps, aiSkipped: !canUseVitaGeminiForBarcode(mode) };
    }
    window.lookupVitaBarcode = lookupVitaBarcode;

    /* =========================================================================
       İLAÇ MODÜLÜ: aktif ilaç listesi (vitatakip_medications_<hesap>) + bugün alınan dozlar (vitatakip_med_taken_<hesap>)
       Etkileşim motoru eskisi gibi state.user.medications / prescriptionDrugRecords alanlarını okur;
       bu alanlar her değişiklikte ilaç listesinden yeniden üretilir (tek doğru kaynak: state.medications).
       ========================================================================= */
    const VITA_MED_TIMES = ["Sabah", "Öğle", "Akşam", "Gece"];
    const VITA_WEEKDAY_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
    /* Her doz bir alım saatidir ("09:00"); hatırlatma bu saatte, "Aldım" işareti de bu saate göre tutulur.
       Sabah/Öğle/Akşam/Gece grubu saatten türetilir. */
    const VITA_MED_BLOCK_CLOCK = { "Sabah": "09:00", "Öğle": "13:00", "Akşam": "20:00", "Gece": "22:30" };
    const VITA_MED_FREQUENCIES = {
      gunde1: { label: "Günde 1 kez", count: 1, defaults: ["09:00"] },
      gunde2: { label: "Günde 2 kez", count: 2, defaults: ["09:00", "20:00"] },
      gunde3: { label: "Günde 3 kez", count: 3, defaults: ["09:00", "13:00", "19:00"] },
      haftada1: { label: "Haftada 1 kez", count: 1, defaults: ["09:00"], weekly: true },
      gerektiginde: { label: "Gerektiğinde", count: 0, defaults: [] },
      // İlaç Ekle sayfasındaki serbest plan: 1–4 vakit (saat) ve isteğe bağlı gün listesi (days; boş = her gün)
      plan: { label: "Planlı", count: -1, defaults: ["09:00"] }
    };
    const VITA_DAY_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
    function vitaMedDaysLabel(days) {
      const d = Array.isArray(days) ? days : [];
      if (!d.length || d.length === 7) return "Her gün";
      return [1, 2, 3, 4, 5, 6, 0].filter(x => d.includes(x)).map(x => VITA_DAY_SHORT[x]).join(", ");
    }
    window.VITA_MED_FREQUENCIES = VITA_MED_FREQUENCIES;

    function isVitaClock(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")); }
    function vitaBlockFromClock(clock) {
      const h = Number(String(clock || "09:00").slice(0, 2));
      if (h >= 4 && h < 11) return "Sabah";
      if (h >= 11 && h < 16) return "Öğle";
      if (h >= 16 && h < 21) return "Akşam";
      return "Gece";
    }
    window.vitaBlockFromClock = vitaBlockFromClock;
    /* Saatler: verilen saatler (geçerli olanlar) → yoksa eski blok adlarından → yoksa sıklığın varsayılanları. */
    function resolveVitaMedClocks(frequency, raw) {
      const def = VITA_MED_FREQUENCIES[frequency] || VITA_MED_FREQUENCIES.gunde1;
      const given = (Array.isArray(raw.clocks) ? raw.clocks : []).filter(isVitaClock);
      if (frequency === "plan") return [...new Set(given.length ? given : def.defaults)].sort().slice(0, 4);
      const fromBlocks = (Array.isArray(raw.times) ? raw.times : []).map(t => VITA_MED_BLOCK_CLOCK[t]).filter(Boolean);
      const out = [];
      for (let i = 0; i < def.count; i++) out.push(given[i] || (def.count === 1 || fromBlocks.length === def.count ? fromBlocks[i] : "") || def.defaults[i]);
      // Aynı saat iki kez olmasın (işaret anahtarı saattir)
      return [...new Set(out)].sort();
    }

    function vitaMedId() { return `med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

    function normalizeVitaMedication(raw) {
      if (!raw || typeof raw !== "object") return null;
      const name = String(raw.name || raw.urunAdi || "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!name) return null;
      const frequency = VITA_MED_FREQUENCIES[raw.frequency] ? raw.frequency : "gunde1";
      const clocks = resolveVitaMedClocks(frequency, raw);
      const times = clocks.map(vitaBlockFromClock);
      const weekday = Number.isInteger(Number(raw.weekday)) && Number(raw.weekday) >= 0 && Number(raw.weekday) <= 6 ? Number(raw.weekday) : new Date().getDay();
      const days = frequency === "plan" && Array.isArray(raw.days) ? [...new Set(raw.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
      const dose = Number(raw.dose);
      return {
        id: /^med_[a-z0-9_]+$/i.test(String(raw.id || "")) ? String(raw.id) : vitaMedId(),
        name,
        barcode: vitaBarcodeKey(raw.barcode) || "",
        etkenMadde: String(raw.etkenMadde || "").trim().slice(0, 160),
        kategori: String(raw.kategori || "").trim().slice(0, 120),
        frequency,
        clocks,
        times,
        weekday,
        days: days.length === 7 ? [] : days,
        // Kullanım ayrıntıları (İlaç Ekle sayfası): form, her dozdaki miktar ve birim, aç/tok
        form: String(raw.form || "").trim().slice(0, 40),
        dose: Number.isFinite(dose) && dose > 0 ? Math.min(100, Math.round(dose * 100) / 100) : 1,
        unit: String(raw.unit || "").trim().slice(0, 16),
        aclikDurumu: String(raw.aclikDurumu || "").trim().slice(0, 60),
        addedAt: Number(raw.addedAt) > 0 ? Number(raw.addedAt) : Date.now()
      };
    }
    window.normalizeVitaMedication = normalizeVitaMedication;

    function frequencyFromRxRecord(rec) {
      if (!rec) return { frequency: "gunde1", times: ["Sabah"] };
      const time = VITA_MED_TIMES.find(t => String(rec.zamanBloku || "").startsWith(t)) || "Sabah";
      if (rec.dozPeriyodu === "haftalik") return { frequency: "haftada1", times: [time] };
      const n = Number(rec.gunlukDoz) || 1;
      if (n >= 3) return { frequency: "gunde3", times: ["Sabah", "Öğle", "Akşam"] };
      if (n === 2) return { frequency: "gunde2", times: ["Sabah", "Akşam"] };
      return { frequency: "gunde1", times: [time] };
    }

    function getVitaMedicationDoses(med, date = new Date()) {
      const def = VITA_MED_FREQUENCIES[med.frequency] || VITA_MED_FREQUENCIES.gunde1;
      if (def.weekly && Number(med.weekday) !== date.getDay()) return [];
      if (med.frequency === "plan" && Array.isArray(med.days) && med.days.length && !med.days.includes(date.getDay())) return [];
      return Array.isArray(med.clocks) ? med.clocks.slice() : [];
    }
    window.getVitaMedicationDoses = getVitaMedicationDoses;

    function describeVitaMedicationSchedule(med) {
      const def = VITA_MED_FREQUENCIES[med.frequency] || VITA_MED_FREQUENCIES.gunde1;
      if (med.frequency === "gerektiginde") return def.label;
      if (med.frequency === "haftada1") return `${def.label} · ${VITA_WEEKDAY_NAMES[med.weekday]} ${med.clocks?.[0] || "09:00"}`;
      if (med.frequency === "plan") return `${vitaMedDaysLabel(med.days)} · ${(med.clocks || []).join(", ")}`;
      return `${def.label} · ${(med.clocks || []).join(", ")}`;
    }
    /* "Aç karnına 1 tablet" — kart, bildirim ve özetlerde ortak */
    function describeVitaMedicationHowTo(med) {
      const amount = med && med.unit ? `${med.dose || 1} ${med.unit}` : "";
      return [med && med.aclikDurumu, amount].filter(Boolean).join(" ");
    }
    window.describeVitaMedicationHowTo = describeVitaMedicationHowTo;
    window.describeVitaMedicationSchedule = describeVitaMedicationSchedule;

    /* Etkileşim motoru için profil alanlarını ilaç listesinden üret. */
    function syncVitaProfileFromMedications() {
      if (!state.user) return;
      const meds = Array.isArray(state.medications) ? state.medications : [];
      if (!Array.isArray(state.user.chronic)) state.user.chronic = [];
      const existing = Array.isArray(state.user.prescriptionDrugRecords) ? state.user.prescriptionDrugRecords : [];
      const records = [];
      meds.forEach(med => {
        const lower = med.name.toLocaleLowerCase("tr-TR");
        let rec = existing.find(r => String(r.urunAdi || "").toLocaleLowerCase("tr-TR") === lower);
        if (!rec && typeof window.findPrescriptionDrugInDb === "function") {
          const db = window.findPrescriptionDrugInDb(med.name);
          if (db) {
            rec = { ...db, urunAdi: med.name, toplamKutuAdedi: db.kutuAdedi, kalanAdet: db.kutuAdedi, tuketilenBesinler: Array.isArray(db.tuketilenBesinler) ? [...db.tuketilenBesinler] : [], addedAt: new Date(med.addedAt).toISOString() };
            const code = typeof window.mapPrescriptionDrugToChronicCode === "function" ? window.mapPrescriptionDrugToChronicCode(rec) : null;
            if (code && !state.user.chronic.includes(code)) state.user.chronic.push(code);
          }
        }
        if (rec) {
          const doses = (med.clocks || []).map(vitaBlockFromClock);
          records.push({ ...rec, urunAdi: med.name, gunlukDoz: Math.max(1, doses.length || 1), dozPeriyodu: med.frequency === "haftada1" || (med.frequency === "plan" && Array.isArray(med.days) && med.days.length === 1) ? "haftalik" : "gunluk", zamanBloku: doses[0] || rec.zamanBloku || "Sabah", barcode: med.barcode || rec.barcode || "" });
        }
      });
      state.user.prescriptionDrugRecords = records;
      state.user.medications = meds.map(m => m.name);
    }
    window.syncVitaProfileFromMedications = syncVitaProfileFromMedications;

    /* Eski kayıtlar ve ilaç listesine doğrudan yazan eski yollar: profildeki her ilaç adı listede de bulunur. */
    function reconcileVitaMedicationsWithProfile() {
      if (!Array.isArray(state.medications)) state.medications = [];
      const user = state.user || {};
      const known = new Set(state.medications.map(m => m.name.toLocaleLowerCase("tr-TR")));
      const records = Array.isArray(user.prescriptionDrugRecords) ? user.prescriptionDrugRecords : [];
      const names = [...(Array.isArray(user.medications) ? user.medications : []), ...records.map(r => r.urunAdi)];
      names.forEach(name => {
        const clean = String(name || "").trim();
        if (!clean || known.has(clean.toLocaleLowerCase("tr-TR"))) return;
        const rec = records.find(r => String(r.urunAdi || "").toLocaleLowerCase("tr-TR") === clean.toLocaleLowerCase("tr-TR"));
        const med = normalizeVitaMedication({ name: clean, etkenMadde: rec?.etkenMadde, kategori: rec?.kategori, barcode: rec?.barcode, ...frequencyFromRxRecord(rec), addedAt: rec?.addedAt ? Date.parse(rec.addedAt) : Date.now() });
        if (med) { state.medications.push(med); known.add(clean.toLocaleLowerCase("tr-TR")); }
      });
      syncVitaProfileFromMedications();
    }

    function readVitaMedTaken() {
      const today = typeof vitaLocalToday === "function" ? vitaLocalToday() : new Date().toISOString().slice(0, 10);
      if (!state.medTaken || typeof state.medTaken !== "object" || state.medTaken.date !== today) state.medTaken = { date: today, doses: {} };
      if (!state.medTaken.doses || typeof state.medTaken.doses !== "object") state.medTaken.doses = {};
      return state.medTaken;
    }

    function loadVitaMedications(userId) {
      const raw = safeLocalStorageGetItem(`vitatakip_medications_${userId}`);
      let list = [];
      try { list = JSON.parse(raw || "[]"); } catch (_) { list = []; }
      state.medications = (Array.isArray(list) ? list : []).map(normalizeVitaMedication).filter(Boolean).slice(0, 200);
      try { state.medTaken = JSON.parse(safeLocalStorageGetItem(`vitatakip_med_taken_${userId}`) || "null"); } catch (_) { state.medTaken = null; }
      readVitaMedTaken();
      reconcileVitaMedicationsWithProfile();
    }
    window.loadVitaMedications = loadVitaMedications;
    window.reconcileVitaMedicationsWithProfile = reconcileVitaMedicationsWithProfile;

    function findVitaMedication(idOrName) {
      const target = String(idOrName || "").trim();
      const lower = target.toLocaleLowerCase("tr-TR");
      const key = vitaBarcodeKey(target);
      return (state.medications || []).find(m => m.id === target || m.name.toLocaleLowerCase("tr-TR") === lower || (key && m.barcode === key)) || null;
    }
    window.findVitaMedication = findVitaMedication;

    function refreshVitaMedicationViews() {
      if (typeof invalidateClinicalAnalysisCache === "function") invalidateClinicalAnalysisCache({ clearDOM: true });
      saveState();
      if (typeof syncAllProfileSummariesUI === "function") syncAllProfileSummariesUI();
      if (typeof renderDailyTab === "function") renderDailyTab();
      if (typeof detectSupplementConflicts === "function") detectSupplementConflicts();
    }

    /* "Ben bu ilacı kullanıyorum": aynı adlı ilaç varsa güncellenir, yoksa eklenir. */
    function addVitaMedication(input, options = {}) {
      if (!state.user) return null;
      if (!Array.isArray(state.medications)) state.medications = [];
      const med = normalizeVitaMedication(input);
      if (!med) return null;
      const existing = findVitaMedication(med.name) || (med.barcode ? findVitaMedication(med.barcode) : null);
      let saved;
      if (existing) {
        Object.assign(existing, {
          barcode: med.barcode || existing.barcode, etkenMadde: med.etkenMadde || existing.etkenMadde, kategori: med.kategori || existing.kategori,
          form: med.form || existing.form || "", unit: med.unit || existing.unit || "", aclikDurumu: med.aclikDurumu || existing.aclikDurumu || "",
          ...(options.keepSchedule ? {} : { frequency: med.frequency, clocks: med.clocks, times: med.times, weekday: med.weekday, days: med.days, dose: med.dose })
        });
        saved = existing;
      } else {
        state.medications.push(med);
        saved = med;
      }
      syncVitaProfileFromMedications();
      if (!options.noRefresh) refreshVitaMedicationViews();
      return saved;
    }
    window.addVitaMedication = addVitaMedication;

    function removeVitaMedication(idOrName, options = {}) {
      const med = findVitaMedication(idOrName);
      if (!med) return false;
      state.medications = state.medications.filter(m => m !== med);
      const taken = readVitaMedTaken();
      delete taken.doses[med.id];
      if (state.user && Array.isArray(state.user.prescriptionDrugRecords)) {
        const lower = med.name.toLocaleLowerCase("tr-TR");
        state.user.prescriptionDrugRecords = state.user.prescriptionDrugRecords.filter(r => String(r.urunAdi || "").toLocaleLowerCase("tr-TR") !== lower);
      }
      syncVitaProfileFromMedications();
      if (!options.noRefresh) refreshVitaMedicationViews();
      return true;
    }
    window.removeVitaMedication = removeVitaMedication;

    function setVitaMedicationDoseTaken(medId, dose, taken) {
      const med = findVitaMedication(medId);
      if (!med) return;
      const log = readVitaMedTaken();
      const doses = { ...(log.doses[med.id] || {}) };
      if (taken) doses[dose] = Date.now(); else delete doses[dose];
      if (Object.keys(doses).length) log.doses[med.id] = doses; else delete log.doses[med.id];
      saveState();
      renderTodayMedications();
      if (taken && window.SoundEffects && typeof SoundEffects.playSuccess === "function") SoundEffects.playSuccess();
    }
    window.setVitaMedicationDoseTaken = setVitaMedicationDoseTaken;

    function getTodayVitaMedicationDoses() {
      const log = readVitaMedTaken();
      const today = new Date();
      const rows = [];
      (state.medications || []).forEach(med => {
        getVitaMedicationDoses(med, today).forEach(dose => rows.push({ med, dose, taken: Boolean(log.doses[med.id]?.[dose]) }));
      });
      // Saat sırasıyla (doz anahtarı "HH:MM" olduğu için metin sıralaması saat sırasıdır)
      return rows.sort((a, b) => a.dose.localeCompare(b.dose) || a.med.name.localeCompare(b.med.name, "tr"));
    }
    window.getTodayVitaMedicationDoses = getTodayVitaMedicationDoses;

    /* "Bugün Alınması Gereken İlaçlar" kartı (Ana Sayfa) */
    function renderTodayMedications() {
      const card = document.getElementById("todayMedsCard");
      const list = document.getElementById("todayMedsList");
      if (!card || !list) return;
      const meds = Array.isArray(state.medications) ? state.medications : [];
      // "Bugünkü ilaçlarım" takviye kartı gibi her zaman görünür; ilaç yoksa boş durum + "İlaç Ekle".
      card.classList.toggle("hidden", !activeUserId);
      const counter = document.getElementById("todayMedsCounter");
      if (!meds.length) {
        if (counter) { counter.textContent = ""; counter.classList.add("hidden"); }
        list.innerHTML = `<div class="vtm-empty"><i class="fa-solid fa-prescription-bottle-medical" aria-hidden="true"></i> Henüz ilaç yok. Düzenli veya geçici kullandığınız ilaçları "İlaç Ekle" ile ekleyin.</div>`;
        const note0 = document.getElementById("todayMedsNote"); if (note0) note0.classList.add("hidden");
        return;
      }
      const rows = getTodayVitaMedicationDoses();
      const done = rows.filter(r => r.taken).length;
      if (counter) {
        counter.classList.remove("hidden");
        counter.textContent = rows.length ? `${done}/${rows.length} alındı` : "Bugün doz yok";
        counter.classList.toggle("is-complete", rows.length > 0 && done === rows.length);
      }
      const esc = value => escapeHtmlText(value);
      const icons = { "Sabah": "fa-sun text-amber-500", "Öğle": "fa-utensils text-sky-500", "Akşam": "fa-moon text-indigo-500", "Gece": "fa-moon text-slate-500" };
      const groups = VITA_MED_TIMES.map(block => ({ block, rows: rows.filter(r => vitaBlockFromClock(r.dose) === block) })).filter(g => g.rows.length);
      list.innerHTML = rows.length
        ? groups.map(g => `
            <div class="space-y-2">
              <div class="vsg-head"><i class="fa-solid ${icons[g.block]}" aria-hidden="true"></i><span class="vsg-label">${g.block}</span><span class="vsg-count">${g.rows.filter(r => r.taken).length}/${g.rows.length}</span>${g.rows.length > 1 ? `<button type="button" class="vsg-all" onclick="markVitaMedicationBlockTaken(${esc(JSON.stringify(g.block))})" aria-label="${g.block}: tüm ilaçları alındı işaretle"><i class="fa-solid fa-check-double" aria-hidden="true"></i> Tümü alındı</button>` : ""}</div>
              ${g.rows.map(r => {
                const id = `todayMed_${r.med.id}_${r.dose.replace(":", "")}`;
                return `<div class="vsc-card vtm-row px-3 py-2.5 rounded-2xl border transition-all ${r.taken ? "bg-indigo-50/70 border-indigo-200 is-taken" : "bg-white border-slate-200 shadow-sm"}">
                  <div class="vsc-row">
                    <input id="${id}" type="checkbox" class="h-5 w-5 rounded cursor-pointer flex-shrink-0" ${r.taken ? "checked" : ""} data-med-id="${esc(r.med.id)}" data-dose="${esc(r.dose)}" aria-label="${esc(r.med.name)} ${esc(r.dose)}: aldım" title="Aldım" onchange="setVitaMedicationDoseTaken(this.dataset.medId, this.dataset.dose, this.checked)"/>
                    <label class="vsc-main" for="${id}">
                      <span class="vsc-title"><b class="vsc-name ${r.taken ? "line-through text-slate-400" : "text-navy-900"}">${esc(r.med.name)}</b><button type="button" class="vtm-info" aria-label="${esc(r.med.name)}: nasıl kullanılır?" title="Nasıl kullanılır?" onclick="event.preventDefault(); openVitaUsageInfo(this, 'med', ${esc(JSON.stringify(r.med.id))})">!</button></span>
                      <span class="vsc-meta"><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(r.dose)}${r.med.frequency === "haftada1" ? " · haftalık" : ""}${r.med.frequency === "plan" && r.med.days?.length ? ` · ${esc(vitaMedDaysLabel(r.med.days))}` : ""}${r.med.unit ? ` · ${esc(`${r.med.dose || 1} ${r.med.unit}`)}` : ""}${r.med.aclikDurumu ? `<span class="vsc-hunger vsc-hunger--${/aç karnına/i.test(r.med.aclikDurumu) ? "empty" : (/tok|yemek/i.test(r.med.aclikDurumu) ? "full" : "any")}">${esc(r.med.aclikDurumu)}</span>` : ""}${r.taken ? " · aldım" : ""}</span>
                    </label>
                    <button type="button" class="vsc-del" title="İlacı listeden çıkar" aria-label="${esc(r.med.name)} listeden çıkar" onclick="confirmRemoveVitaMedication(${esc(JSON.stringify(r.med.id))})"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
                  </div>
                </div>`;
              }).join("")}
            </div>`).join("")
        : `<div class="vtm-empty">Bugün alınması gereken ilaç yok.</div>`;
      const prn = meds.filter(m => m.frequency === "gerektiginde").map(m => m.name);
      const weeklyOther = [
        ...meds.filter(m => m.frequency === "haftada1" && !getVitaMedicationDoses(m).length).map(m => `${m.name} (${VITA_WEEKDAY_NAMES[m.weekday]})`),
        ...meds.filter(m => m.frequency === "plan" && m.days?.length && !getVitaMedicationDoses(m).length).map(m => `${m.name} (${vitaMedDaysLabel(m.days)})`)
      ];
      const note = document.getElementById("todayMedsNote");
      if (note) {
        const parts = [];
        if (prn.length) parts.push(`Gerektiğinde: ${prn.join(", ")}`);
        if (weeklyOther.length) parts.push(`Haftalık: ${weeklyOther.join(", ")}`);
        note.textContent = parts.join(" · ");
        note.classList.toggle("hidden", !parts.length);
      }
    }
    window.renderTodayMedications = renderTodayMedications;

    function markVitaMedicationBlockTaken(block) {
      getTodayVitaMedicationDoses().filter(r => vitaBlockFromClock(r.dose) === block && !r.taken).forEach(r => {
        const log = readVitaMedTaken();
        log.doses[r.med.id] = { ...(log.doses[r.med.id] || {}), [r.dose]: Date.now() };
      });
      saveState();
      renderTodayMedications();
      if (window.SoundEffects && typeof SoundEffects.playSuccess === "function") SoundEffects.playSuccess();
    }
    window.markVitaMedicationBlockTaken = markVitaMedicationBlockTaken;

    function confirmRemoveVitaMedication(id) {
      const med = findVitaMedication(id);
      if (!med) return;
      if (typeof window.confirm === "function" && !window.confirm(`"${med.name}" ilaç listenizden çıkarılsın mı?`)) return;
      removeVitaMedication(med.id);
      showToast("İlaç çıkarıldı", `${med.name} listeden kaldırıldı.`, "info");
    }
    window.confirmRemoveVitaMedication = confirmRemoveVitaMedication;

    /* Gece 00:00'da "alındı" işaretleri kendiliğinden sıfırlanır (uygulama açık kalsa bile). */
    let vitaMidnightTimer = null;
    function scheduleVitaMidnightRefresh() {
      clearTimeout(vitaMidnightTimer);
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      vitaMidnightTimer = setTimeout(() => {
        try {
          if (activeUserId) {
            if (typeof checkMidnightReset === "function") checkMidnightReset(activeUserId);
            readVitaMedTaken();
            saveState();
            if (typeof renderDailyTab === "function") renderDailyTab(); else renderTodayMedications();
          }
        } finally { scheduleVitaMidnightRefresh(); }
      }, Math.max(1000, next - now));
    }
    window.scheduleVitaMidnightRefresh = scheduleVitaMidnightRefresh;
    document.addEventListener("visibilitychange", () => {
      // Telefon uykudan dönünce zamanlayıcı kaçmış olabilir: gün değiştiyse liste yenilenir.
      if (document.visibilityState !== "visible" || !activeUserId || !state.medTaken) return;
      const before = state.medTaken.date;
      readVitaMedTaken();
      if (before !== state.medTaken.date) { saveState(); renderTodayMedications(); }
    });

    /* =========================================================================
       İLAÇ EKLE PENCERESİ (sade): ad veya barkod → ilaç kataloğu, kamera, kutu fotoğrafı (yapay zekâ),
       kullanım sıklığı → "Ben bu ilacı kullanıyorum"
       ========================================================================= */
    let vitaMedLookup = null;      // son barkod araması sonucu (öğrenme için)
    let vitaMedSuggestions = [];

    function vitaMedEl(id) { return document.getElementById(id); }

    /* "İlaç Ekle" artık tam ekran sayfa (Takviye Ekle / Tahlillerim gibi): üstte "← Ana Sayfa" ve başlık. */
    function openAddMedicationModal(prefill = "") {
      const modal = vitaMedEl("addMedicationModal");
      if (!modal) return;
      if (window.SoundEffects) SoundEffects.playClick();
      loadVitaCatalog("medication");
      vitaMedLookup = null;
      if (typeof navigateToView === "function" && state.activeTab !== "view-add-medication") navigateToView("view-add-medication");
      modal.classList.remove("hidden");
      window.scrollTo(0, 0);
      stopVitaMedCamera();
      if (window.VitaMedPage) window.VitaMedPage.reset();
      setAddMedStatus("");
      clearAddMedSuggest();
      if (prefill) { const s = vitaMedEl("addMedSearchInput"); if (s) { s.value = prefill; addMedSearch(prefill); } }
    }
    function closeAddMedicationModal() {
      stopVitaMedCamera();
      vitaMedEl("addMedicationModal")?.classList.add("hidden");
      // Tam ekran sayfadan Ana Sayfa'ya dönülür.
      if (state.activeTab === "view-add-medication" && typeof navigateToView === "function") navigateToView("view-home");
    }
    window.openAddMedicationModal = openAddMedicationModal;
    window.closeAddMedicationModal = closeAddMedicationModal;

    function setAddMedStatus(html, tone = "info") {
      const box = vitaMedEl("addMedStatus");
      if (!box) return;
      box.className = `vam-status vam-${tone}${html ? "" : " hidden"}`;
      box.innerHTML = html;
    }
    function clearAddMedSuggest() {
      const box = vitaMedEl("addMedSuggest");
      if (box) { box.classList.add("hidden"); box.innerHTML = ""; }
      vitaMedSuggestions = [];
    }

    function addMedSearch(value) {
      const box = vitaMedEl("addMedSuggest");
      if (!box) return;
      const text = String(value || "").trim();
      if (text.length < 2) { clearAddMedSuggest(); return; }
      const digits = text.replace(/\D/g, "");
      const looksLikeBarcode = digits.length >= 8 && digits.length >= text.replace(/\s/g, "").length - 1;
      vitaMedSuggestions = searchVitaProducts("medication", text, 6);
      const esc = v => escapeHtmlText(v);
      let rows = looksLikeBarcode
        ? `<button type="button" class="vsa-sg" data-med-barcode="${esc(digits)}"><span class="vsa-sg-ico rx"><i class="fa-solid fa-barcode"></i></span><span class="vsa-sg-t"><b>Barkodu ara</b><small>${esc(digits)}</small></span></button>`
        : "";
      rows += vitaMedSuggestions.map((it, i) => `<button type="button" class="vsa-sg" data-med-pick="${i}"><span class="vsa-sg-ico rx"><i class="fa-solid fa-prescription-bottle-medical"></i></span><span class="vsa-sg-t"><b>${esc(it.urunAdi)}</b><small>${esc([it.etkenMadde, it.kategori].filter(Boolean).join(" · ") || (it._source === "cache" ? "Daha önce eklediğiniz" : ""))}</small></span></button>`).join("");
      if (!rows) rows = `<div class="vsa-sg-empty"><span><b>“${esc(text)}”</b> ilaç listesinde yok.</span><button type="button" data-med-own="1"><i class="fa-solid fa-pen" aria-hidden="true"></i> Bu adla ekle</button></div>`;
      box.innerHTML = rows;
      box.classList.remove("hidden");
    }
    function addMedSearchKey(event) {
      if (event.key === "Escape") { clearAddMedSuggest(); return; }
      if (event.key !== "Enter") return;
      event.preventDefault();
      const box = vitaMedEl("addMedSuggest");
      const first = box && box.querySelector("[data-med-barcode], [data-med-pick], [data-med-own]");
      if (first) first.click();
      else if (String(event.target.value || "").trim()) useAddMedOwnName();
    }
    window.addMedSearch = addMedSearch;
    window.addMedSearchKey = addMedSearchKey;

    function applyAddMedItem(item, meta = {}) {
      const name = vitaMedEl("addMedName");
      if (name) name.value = String(item.urunAdi || "").slice(0, 120);
      const bc = vitaMedEl("addMedBarcode");
      if (bc && meta.barcode) bc.value = meta.barcode;
      const nameForRule = String(item.urunAdi || "");
      const rule = typeof window.findPrescriptionDrugInDb === "function" ? window.findPrescriptionDrugInDb(nameForRule) : null;
      // Etken madde, form (addan/katalogdan) ve aç/tok önerisi (reçete kuralından) forma işlenir.
      if (window.VitaMedPage) window.VitaMedPage.applyProduct({ urunAdi: item.urunAdi, etkenMadde: item.etkenMadde || rule?.etkenMadde, form: item.form, aclikDurumu: item.aclikDurumu || rule?.aclikDurumu });
      if (rule && !meta.keepSchedule && window.VitaMedPage) {
        const f = frequencyFromRxRecord(rule);
        window.VitaMedPage.setPlan({ freq: f.frequency === "haftada1" ? "days" : "daily", vakits: f.times, days: f.frequency === "haftada1" ? [new Date().getDay()] : [1, 2, 3, 4, 5, 6, 0] });
      }
      const details = [item.etkenMadde, item.kategori].filter(Boolean).join(" · ");
      const esc = v => escapeHtmlText(v);
      setAddMedStatus(
        `<i class="fa-solid fa-circle-check"></i> <b>${esc(item.urunAdi)}</b>${details ? ` <small>${esc(details)}</small>` : ""}<span class="vam-src">Kaynak: ${esc(meta.sourceLabel || VITA_PRODUCT_MODES.medication.catalogLabel)}</span>${meta.verifyHint ? `<span class="vam-warn">Bu bir tahmindir; kutudaki adla karşılaştırıp gerekirse düzeltin.</span>` : ""}${meta.guess?.text ? `<span class="vam-src">${esc(meta.guess.text)}</span>` : ""}`,
        meta.verifyHint ? "warn" : "ok"
      );
      setTimeout(() => vitaMedEl("addMedName")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    }

    /* İlaç kontrolü çekmecesindeki öneriden seçilen ilaç: katalog bilgisiyle pencereye aktarılır. */
    function applyVitaMedicationCatalogName(name) {
      const item = searchVitaProducts("medication", name, 1)[0];
      if (!item || vitaFold(item.urunAdi) !== vitaFold(name)) return;
      vitaMedLookup = item.barcode ? { found: true, source: item._source, barcode: vitaBarcodeKey(item.barcode) } : null;
      applyAddMedItem(item, { barcode: vitaBarcodeKey(item.barcode), sourceLabel: item._source === "cache" ? "Daha önce eklediğiniz ilaç" : VITA_PRODUCT_MODES.medication.catalogLabel });
    }
    window.applyVitaMedicationCatalogName = applyVitaMedicationCatalogName;

    async function lookupAddMedBarcode(code) {
      clearAddMedSuggest();
      const bc = vitaMedEl("addMedBarcode");
      const key = vitaBarcodeKey(code);
      if (!key) { setAddMedStatus("Geçerli bir barkod okunamadı. Barkod numarasını kontrol edin veya ilacın adını yazın.", "warn"); return null; }
      if (bc) bc.value = key;
      setAddMedStatus(`<i class="fa-solid fa-circle-notch fa-spin"></i> Barkod ${escapeHtmlText(key)} ilaç listesinde aranıyor…`, "info");
      const result = await lookupVitaBarcode("medication", key);
      vitaMedLookup = result;
      if (result.found) {
        applyAddMedItem(result.item, { barcode: key, sourceLabel: result.sourceLabel, verifyHint: result.verifyHint, guess: result.guess });
        if (navigator.vibrate) { try { navigator.vibrate(60); } catch (_) {} }
        return result;
      }
      const esc = v => escapeHtmlText(v);
      const aiReady = typeof getGeminiApiKey === "function" && getGeminiApiKey() && vitaHasAiHealthConsent();
      setAddMedStatus(
        `<b>Bu barkod ilaç listesinde yok (${esc(key)}).</b>${result.guess?.text ? `<span class="vam-src">${esc(result.guess.text)}</span>` : ""}<span>Kutunun fotoğrafıyla yapay zekâya buldurabilir ya da adını elle yazabilirsiniz; bu barkod seçtiğiniz ilaçla eşlenip bir dahaki sefere doğrudan tanınır.</span>` +
        `<span class="vam-acts"><button type="button" class="vam-act vam-act-ai" onclick="triggerAddMedPhoto()"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Yapay Zekâ ile Bul</button><button type="button" class="vam-act" onclick="document.getElementById('addMedName').focus()"><i class="fa-solid fa-pen" aria-hidden="true"></i> Elle yaz</button></span>` +
        (aiReady ? "" : `<span class="vam-src">${typeof getGeminiApiKey === "function" && getGeminiApiKey() ? "Yapay zekâ için veri paylaşım onayı gerekir." : "Yapay zekâ için Gemini API anahtarı gerekir."} ${typeof vitaAiSettingsLinkHtml === "function" ? vitaAiSettingsLinkHtml() : ""}</span>`),
        "warn"
      );
      return result;
    }
    window.lookupAddMedBarcode = lookupAddMedBarcode;

    function useAddMedOwnName() {
      const s = vitaMedEl("addMedSearchInput");
      const name = vitaMedEl("addMedName");
      if (s && name) { name.value = s.value.trim(); name.focus(); }
      clearAddMedSuggest();
    }

    document.addEventListener("click", event => {
      const t = event.target;
      if (!t || !t.closest) return;
      const pick = t.closest("#addMedSuggest [data-med-pick]");
      if (pick) {
        const item = vitaMedSuggestions[Number(pick.dataset.medPick)];
        clearAddMedSuggest();
        if (item) {
          vitaMedLookup = item.barcode ? { found: true, source: item._source, barcode: vitaBarcodeKey(item.barcode) } : null;
          applyAddMedItem(item, { barcode: vitaBarcodeKey(item.barcode), sourceLabel: item._source === "cache" ? "Daha önce eklediğiniz ilaç" : VITA_PRODUCT_MODES.medication.catalogLabel });
        }
        return;
      }
      const bcBtn = t.closest("#addMedSuggest [data-med-barcode]");
      if (bcBtn) { lookupAddMedBarcode(bcBtn.dataset.medBarcode); return; }
      if (t.closest("#addMedSuggest [data-med-own]")) { useAddMedOwnName(); return; }
      if (!t.closest("#addMedicationModal .vsa-search, #addMedSuggest")) clearAddMedSuggest();
    });

    // Eski adlar (başka modüller çağırabilir): sayfa planını yeniden çizer.
    function updateAddMedFrequencyUI() { if (window.VitaMedPage) window.VitaMedPage.refresh(); }
    window.updateAddMedFrequencyUI = updateAddMedFrequencyUI;

    /* Sayfadaki plan → ilaç kaydı. Her gün 1–3 vakit eski "Günde N kez" biçiminde, tek gün + tek vakit "Haftada 1 kez",
       diğerleri (4 vakit veya birkaç gün) "plan" (saatler + gün listesi) olarak saklanır; hepsi aynı ekranda gösterilir. */
    function vitaMedScheduleFromPage(plan) {
      if (plan.freq === "prn") return { frequency: "gerektiginde", clocks: [], days: [] };
      const clocks = plan.vakits.map(v => v.clock);
      const everyDay = plan.days.length === 7;
      if (everyDay && clocks.length >= 1 && clocks.length <= 3) return { frequency: `gunde${clocks.length}`, clocks, days: [] };
      if (plan.days.length === 1 && clocks.length === 1) return { frequency: "haftada1", clocks, weekday: plan.days[0], days: [] };
      return { frequency: "plan", clocks, days: everyDay ? [] : plan.days.slice() };
    }

    function commitAddMedication() {
      const name = String(vitaMedEl("addMedName")?.value || "").replace(/\s+/g, " ").trim();
      if (!name) {
        showToast("İlaç adı gerekli", "İlacın adını yazın veya listeden seçin.", "warning");
        vitaMedEl("addMedName")?.focus();
        return null;
      }
      const plan = window.VitaMedPage ? window.VitaMedPage.getPlan() : { freq: "daily", vakits: [{ vakit: "Sabah", clock: "09:00" }], days: [1, 2, 3, 4, 5, 6, 0] };
      if (plan.freq === "days" && !plan.days.length) { showToast("Gün seçin", "\"Belirli günler\" seçiliyken en az bir gün işaretleyin.", "warning"); return null; }
      const schedule = vitaMedScheduleFromPage(plan);
      const barcode = vitaBarcodeKey(vitaMedEl("addMedBarcode")?.value || "");
      const rule = typeof window.findPrescriptionDrugInDb === "function" ? window.findPrescriptionDrugInDb(name) : null;
      const catalogItem = searchVitaProducts("medication", name, 1)[0];
      const sameName = catalogItem && vitaFold(catalogItem.urunAdi) === vitaFold(name) ? catalogItem : null;
      const typedActive = String(vitaMedEl("addMedActive")?.value || "").trim();
      const med = addVitaMedication({
        name, barcode, ...schedule,
        etkenMadde: typedActive || sameName?.etkenMadde || rule?.etkenMadde || "", kategori: sameName?.kategori || rule?.kategori || "",
        form: String(vitaMedEl("addMedForm")?.value || "").trim(),
        dose: Number(vitaMedEl("addMedDose")?.value) || 1,
        unit: vitaMedEl("addMedUnit")?.value || "",
        aclikDurumu: String(vitaMedEl("addMedHunger")?.value || "").trim()
      });
      if (!med) return null;
      // Barkod bu modülün önbelleğine öğretilir (katalogda zaten aynı adla varsa gerek yok).
      const fromCatalog = vitaMedLookup && vitaMedLookup.source === "catalog" && vitaMedLookup.barcode === barcode && sameName;
      if (barcode && !fromCatalog) learnVitaBarcode("medication", barcode, { urunAdi: name, etkenMadde: med.etkenMadde, kategori: med.kategori });
      closeAddMedicationModal();
      const drawer = vitaMedEl("dailyProtocolMedicationsDrawer");
      if (drawer) drawer.open = true;
      setTimeout(() => vitaMedEl("todayMedsCard")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
      showToast("İlaç eklendi", `${med.name} · ${describeVitaMedicationSchedule(med)}. Bugün alınacak dozlar Ana Sayfa'da işaretlenebilir.`, "success");
      return med;
    }
    window.commitAddMedication = commitAddMedication;

    /* --- Kamera ile barkod (yalnızca bu pencerenin kendi görüntü alanı) --- */
    /* Kamera açılmama / "hazırlanıyor"da kalma düzeltmesi:
       - Önceki tarayıcı örneği TAMAMEN durdurulup temizlenmeden yenisi başlatılmaz (eski örneğin gecikmeli clear()'ı yeni
         görüntüyü silip okuyucuyu askıda bırakıyordu).
       - Okuma çerçevesi görüntü genişliğine göre hesaplanır (dar ekranda sabit 250 px çerçeve başlatmayı kilitliyordu).
       - Başlatma 9 sn içinde tamamlanmazsa doğrudan kamera akışı + BarcodeDetector / ZXing yedeğine geçilir.
       - Takviye Ekle'deki kamera ile aynı akış ve aynı ayarlar. */
    let vitaMedCam = { html5: null, stream: null, loop: false, zxing: null, stopping: null, session: 0 };
    /* Okuyucu biçimleri: 1D (EAN-13/8, UPC, Code128) + ilaç karekodu (DataMatrix) + QR. Cihazın yerel
       BarcodeDetector'ı varsa o kullanılır (Android Chrome'da daha hızlı ve DataMatrix'te daha başarılı). */
    function vitaHtml5ReaderConfig() {
      const F = window.Html5QrcodeSupportedFormats;
      const cfg = { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
      if (F) cfg.formatsToSupport = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.DATA_MATRIX, F.QR_CODE].filter(v => v !== undefined);
      return cfg;
    }
    window.vitaHtml5ReaderConfig = vitaHtml5ReaderConfig;
    function vitaWithTimeout(promise, ms) {
      return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
    }
    async function startVitaMedCamera() {
      await stopVitaMedCamera();
      const session = ++vitaMedCam.session;
      if (typeof window.ensureCameraPermissionForFeature === "function") {
        const ok = await window.ensureCameraPermissionForFeature("barcode", { sourceModal: "addMedicationModal" });
        if (!ok) { setAddMedStatus("Kamera izni yok. Ayarlar > İzinler bölümünden kamera onayını açabilir, barkod fotoğrafı yükleyebilir ya da ilacın adını yazabilirsiniz.", "warn"); return; }
      }
      if (session !== vitaMedCam.session) return; // bu arada kapatıldı / yeniden başlatıldı
      const wrap = vitaMedEl("addMedCamera"), reader = vitaMedEl("addMedQrReader"), video = vitaMedEl("addMedCameraVideo"), status = vitaMedEl("addMedCameraStatus");
      wrap?.classList.remove("hidden");
      reader?.classList.remove("hidden");
      vitaMedEl("btnAddMedStartCamera")?.classList.add("hidden");
      vitaMedEl("btnAddMedStopCamera")?.classList.remove("hidden");
      if (status) status.textContent = "Kamera hazırlanıyor (EAN-13 / Karekod)…";
      let handled = false;
      // Kamera kapatıldıktan sonra gelen gecikmeli okuma yok sayılır; kontrol hanesi tutmayan (yanlış okunmuş) barkod atlanır, tarama sürer.
      const onCode = text => {
        if (!text || handled || session !== vitaMedCam.session) return;
        const key = vitaAcceptScannedCode(text);
        if (!key) { if (status) status.textContent = "Barkod net okunamadı; kutuyu sabit tutun ve barkodu çerçeveye hizalayın."; return; }
        handled = true; stopVitaMedCamera(); lookupAddMedBarcode(key);
      };
      const inline = () => wrap?.querySelectorAll("video").forEach(v => { v.setAttribute("playsinline", "true"); v.setAttribute("webkit-playsinline", "true"); v.muted = true; v.playsInline = true; v.style.width = "100%"; v.style.objectFit = "cover"; });

      let Html5 = window.Html5Qrcode;
      if (typeof Html5 !== "function" && typeof loadHtml5QrCodeLibrary === "function") { try { Html5 = await loadHtml5QrCodeLibrary(); } catch (_) {} }
      if (typeof Html5 === "function" && reader && session === vitaMedCam.session) {
        const inst = new Html5("addMedQrReader", vitaHtml5ReaderConfig());
        vitaMedCam.html5 = inst;
        try {
          await vitaWithTimeout(inst.start(
            { facingMode: "environment" },
            { fps: 10, aspectRatio: 1.0, qrbox: (w, h) => { const side = Math.max(120, Math.floor(Math.min(w, h) * 0.75)); return { width: side, height: Math.floor(side * 0.75) }; } },
            onCode, () => {}
          ), 9000);
          if (session !== vitaMedCam.session) { stopVitaMedCamera(); return; }
          inline(); setTimeout(inline, 350);
          if (typeof updateCameraPermissionUI === "function") updateCameraPermissionUI();
          if (status) status.textContent = "İlaç kutusundaki barkodu / karekodu çerçeveye hizalayın.";
          return;
        } catch (_) {
          // Askıda kalan veya hata veren örneği tamamen kapatıp yedek yönteme geç
          vitaMedCam.html5 = null;
          try { await vitaWithTimeout(Promise.resolve(inst.stop()), 2000); } catch (__) {}
          try { inst.clear(); } catch (__) {}
          reader?.classList.add("hidden");
        }
      }
      if (session !== vitaMedCam.session) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        stopVitaMedCamera();
        setAddMedStatus("Bu cihazda canlı kamera açılamadı. \"Barkod fotoğrafı yükle\" ile barkodun fotoğrafını seçebilir veya ilacın adını yazabilirsiniz.", "warn");
        return;
      }
      try {
        vitaMedCam.stream = await vitaWithTimeout(navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }), 10000);
        if (session !== vitaMedCam.session) { stopVitaMedCamera(); return; }
        // play() bazı cihazlarda hiç sonuçlanmayabilir: en fazla 3 sn beklenir, okuma döngüsü yine de başlar.
        if (video) { video.srcObject = vitaMedCam.stream; video.muted = true; video.setAttribute("playsinline", "true"); video.classList.remove("hidden"); await vitaWithTimeout(Promise.resolve(video.play()), 3000).catch(() => {}); }
        if (typeof updateCameraPermissionUI === "function") updateCameraPermissionUI();
        if ("BarcodeDetector" in window) {
          const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "data_matrix", "qr_code"] });
          vitaMedCam.loop = true;
          if (status) status.textContent = "İlaç kutusundaki barkodu / karekodu çerçeveye hizalayın.";
          const tick = async () => {
            if (!vitaMedCam.loop || !video) return;
            try { const codes = await detector.detect(video); if (codes && codes[0]?.rawValue) { onCode(codes[0].rawValue); return; } } catch (_) {}
            if (vitaMedCam.loop) setTimeout(tick, 200);
          };
          tick();
        } else if (typeof loadZXingBrowser === "function" && video) {
          const zx = await loadZXingBrowser();
          vitaMedCam.loop = true;
          if (status) status.textContent = "Kamera açık (ZXing). Barkodu çerçeveye hizalayın.";
          vitaMedCam.zxing = await new zx.BrowserMultiFormatReader().decodeFromVideoElement(video, res => { if (res && res.getText && vitaMedCam.loop) onCode(res.getText()); });
        } else if (status) {
          status.textContent = "Kamera açık ama bu tarayıcı barkodu canlı okuyamıyor. \"Barkod fotoğrafı yükle\"yi kullanın.";
        }
      } catch (error) {
        stopVitaMedCamera();
        setAddMedStatus("Kamera açılamadı. Tarayıcının kamera iznini kontrol edin; \"Barkod fotoğrafı yükle\" ile de devam edebilirsiniz.", "warn");
      }
    }
    function stopVitaMedCamera() {
      vitaMedCam.loop = false;
      vitaMedCam.session++;
      const jobs = [];
      if (vitaMedCam.zxing) { try { vitaMedCam.zxing.stop(); } catch (_) {} vitaMedCam.zxing = null; }
      if (vitaMedCam.html5) {
        const inst = vitaMedCam.html5; vitaMedCam.html5 = null;
        jobs.push(vitaWithTimeout(Promise.resolve().then(() => inst.stop()), 2500).catch(() => {}).then(() => { try { inst.clear(); } catch (_) {} }));
      }
      if (vitaMedCam.stream) { try { vitaMedCam.stream.getTracks().forEach(t => t.stop()); } catch (_) {} vitaMedCam.stream = null; }
      vitaMedEl("addMedQrReader")?.querySelectorAll("video").forEach(v => { try { v.srcObject?.getTracks?.().forEach(t => t.stop()); v.pause(); v.srcObject = null; } catch (_) {} });
      const video = vitaMedEl("addMedCameraVideo");
      if (video) { try { video.pause(); video.srcObject = null; } catch (_) {} video.classList.add("hidden"); }
      vitaMedEl("addMedCamera")?.classList.add("hidden");
      vitaMedEl("btnAddMedStartCamera")?.classList.remove("hidden");
      vitaMedEl("btnAddMedStopCamera")?.classList.add("hidden");
      vitaMedCam.stopping = Promise.all(jobs);
      return vitaMedCam.stopping;
    }
    window.startVitaMedCamera = startVitaMedCamera;
    window.stopVitaMedCamera = stopVitaMedCamera;

    /* --- Kutu fotoğrafı: önce fotoğraftaki barkod (cihazda), yoksa Gemini (anahtar + onay) --- */
    function triggerAddMedPhoto() {
      stopVitaMedCamera();
      const input = vitaMedEl("addMedPhotoInput");
      if (input) { input.value = ""; input.click(); }
    }
    async function handleAddMedPhoto(event) {
      const file = event?.target?.files?.[0];
      if (!file) return;
      /* "Yapay Zekâ ile Tanı" / "Kutu fotoğrafı yükle": barkod okuma modülünden ayrı — fotoğraf doğrudan yapay zekâya gider. */
      stopVitaMedCamera();
      if (event?.target) event.target.value = "";
      const pendingBarcode = vitaMedLookup && vitaMedLookup.found === false && vitaMedLookup.barcode ? vitaMedLookup.barcode : "";
      if (!(typeof getGeminiApiKey === "function" && getGeminiApiKey())) {
        setAddMedStatus(`Kutuyu yapay zekâyla tanımak için Ayarlar > Yapay zekâ bölümüne Gemini API anahtarı ekleyin ya da ilacın adını yazın. ${typeof vitaAiSettingsLinkHtml === "function" ? vitaAiSettingsLinkHtml() : ""}`, "warn");
        return;
      }
      if (!vitaHasAiHealthConsent()) {
        setAddMedStatus(`İlaç kutusunu yapay zekâyla tanımak için Ayarlar > Yapay zekâ bölümünden veri paylaşım onayı verin ya da ilacın adını yazın. ${typeof vitaAiSettingsLinkHtml === "function" ? vitaAiSettingsLinkHtml() : ""}`, "warn");
        return;
      }
      setAddMedStatus(`<i class="fa-solid fa-circle-notch fa-spin"></i> Kutu yapay zekâ ile tanınıyor…`, "info");
      try {
        let base64, mimeType = file.type || "image/jpeg";
        if (window.VitaImage) {
          // JPEG'e çevrilip küçültülür: HEIC / türü boş galeri dosyaları da gönderilebilir, veri harcaması azalır.
          const jpg = await window.VitaImage.toJpegBase64(file, 1600);
          base64 = jpg.base64; mimeType = jpg.mimeType;
        } else {
          const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || "")); r.onerror = reject; r.readAsDataURL(file); });
          base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        }
        const res = await window.callGeminiWithFallback(window.VITA_BOX_PHOTO_PROMPT || "", base64, mimeType, { expectBoxJson: true, mode: "medication", fileName: file.name || "", showFallbackToast: true });
        const box = typeof window.parseGeminiBoxJsonResponse === "function" ? window.parseGeminiBoxJsonResponse(res?.text) : null;
        if (!res || res.usedLocalFallback || !box?.urunAdi) throw new Error(res?.consentDeclined ? "Fotoğraf gönderimi onaylanmadı; fotoğraf gönderilmedi." : "Kutudaki ilaç okunamadı. Ön yüzü yakından ve net çekin ya da adını yazın.");
        applyAddMedItem({ urunAdi: box.urunAdi, etkenMadde: box.etkenMadde, form: box.form, aclikDurumu: box.aclikDurumu }, { sourceLabel: "Gemini yapay zekâ (kutu fotoğrafı)", verifyHint: true, barcode: pendingBarcode });
        // Hemen önce okutulup bulunamayan barkod tanınan ilaçla eşlenir ve bu cihazda saklanır.
        if (pendingBarcode && box.tur !== "takviye") {
          learnVitaBarcode("medication", pendingBarcode, { urunAdi: box.urunAdi, etkenMadde: box.etkenMadde, form: box.form });
          vitaMedLookup = { found: true, source: "learned", barcode: pendingBarcode };
          setAddMedStatus(`${vitaMedEl("addMedStatus")?.innerHTML || ""}<span class="vam-src"><i class="fa-solid fa-link" aria-hidden="true"></i> ${escapeHtmlText(pendingBarcode)} barkodu artık bu ilaç olarak tanınacak (yalnızca bu cihazda).</span>`, "warn");
        } else vitaMedLookup = null;
        if (box.tur === "takviye") setAddMedStatus(`${vitaMedEl("addMedStatus")?.innerHTML || ""}<span class="vam-warn">Bu ürün bir takviye gibi görünüyor; takviyeler Ana Sayfa'daki "Takviye ekle" bölümünden eklenir.</span>`, "warn");
      } catch (error) {
        setAddMedStatus(escapeHtmlText(error?.message || "Kutu tanınamadı."), "warn");
      }
    }
    window.triggerAddMedPhoto = triggerAddMedPhoto;
    window.handleAddMedPhoto = handleAddMedPhoto;

    // Katalogları erken yükle (çevrimdışı önbellekten gelir; arama anında hazır olsun).
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { loadVitaCatalog("supplement"); loadVitaCatalog("medication"); scheduleVitaMidnightRefresh(); }, { once: true });
    else { loadVitaCatalog("supplement"); loadVitaCatalog("medication"); scheduleVitaMidnightRefresh(); }

    /* "!" KULLANIM BİLGİSİ: takviye/ilaç adının yanındaki düğme; yalnızca kısa, pratik besin–zamanlama özeti. */
    const VITA_USAGE_TIPS = [
      [/demir|ferro|iron|feramat|microfer|lipofer/, "Aç karnına veya yemeklerden 2 saat sonra alınız. Süt, peynir, çay ve kahve ile birlikte tüketmeyiniz."],
      [/d3|d vitamini|vitamin d|kolekalsiferol|k2|omega|balik yagi|a vitamini|e vitamini|koenzim|q10|devit/, "Yağda çözünür; kahvaltıda veya sağlıklı yağ içeren ana öğünle birlikte alınız."],
      [/magnezyum|magnesium/, "Akşam yemeğiyle veya yatmadan önce alınız. Demir ve tiroid ilacıyla aynı saatte almayınız."],
      [/kalsiyum|calcium/, "Yemekle birlikte alınız. Demir ve tiroid ilacıyla aynı saatte almayınız."],
      [/cinko|zinc/, "Yemekle birlikte alınız (aç karnına mide bulandırabilir). Demir ve kalsiyumla aynı saatte almayınız."],
      [/b12|kobalamin/, "Sabah alınız. Dilaltı formu dilin altında eriyene kadar bekletiniz."],
      [/folat|folik/, "Sabah, yemekle veya yemeksiz alınabilir."],
      [/c vitamini|vitamin c|redoxon/, "Yemekle birlikte alınız; demirle birlikte alınırsa emilimini artırır."],
      [/probiyotik/, "Kahvaltıdan önce alınız; sıcak içecekle birlikte almayınız."],
      [/kolajen|collagen/, "Bol suyla, tercihen aç karnına alınız."],
      [/kreatin|creatine/, "Bol suyla, günün herhangi bir saatinde alınız."],
      [/multivitamin|supradyn|pharmaton/, "Kahvaltıda, yemekle birlikte alınız."],
      [/levotiroksin|euthyrox|levotiron|tefor/, "Sabah, kahvaltıdan 30–60 dakika önce aç karnına, yalnızca suyla alınız."],
      [/metformin|glucophage|glifor|matofin/, "Yemekle birlikte veya yemekten hemen sonra alınız."]
    ];
    function getVitaUsageTip(kind, record) {
      const text = vitaFold([record?.name, record?.etkenMadde, record?.markaEtken].filter(Boolean).join(" "));
      const hit = VITA_USAGE_TIPS.find(([re]) => re.test(text));
      if (hit) return hit[1];
      if (kind === "med" && typeof window.findPrescriptionDrugInDb === "function") {
        const rule = window.findPrescriptionDrugInDb(record?.name || "");
        if (rule && (rule.zamanBloku || rule.aclikDurumu)) return `${[rule.zamanBloku, rule.aclikDurumu].filter(Boolean).join(" · ")} alınız.`;
      }
      return kind === "med" ? "Hekiminizin veya prospektüsün talimatına göre alınız." : "Kutu üzerindeki kullanım talimatına uygun alınız.";
    }
    function closeVitaUsageInfo() { document.getElementById("vitaUsagePop")?.remove(); }
    function openVitaUsageInfo(btn, kind, id) {
      closeVitaUsageInfo();
      const record = kind === "med" ? findVitaMedication(id) : (state.supplements || []).find(s => String(s.id) === String(id));
      if (!record || !btn) return;
      const pop = document.createElement("div");
      pop.id = "vitaUsagePop";
      pop.className = "vita-usage-pop";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", `${record.name}: nasıl kullanılır?`);
      const plan = kind === "med" ? describeVitaMedicationSchedule(record) : String(record.doseText || "").replace(/Etiket \/ hekim planındaki miktarı girin|Günlük miktarı.*girin/g, "").trim();
      pop.innerHTML = `<b>${escapeHtmlText(record.name)}</b><p>${escapeHtmlText(getVitaUsageTip(kind, record))}</p>${plan ? `<small>Planınız: ${escapeHtmlText(plan)}</small>` : ""}<button type="button" aria-label="Kapat" onclick="closeVitaUsageInfo()">×</button>`;
      document.body.appendChild(pop);
      const r = btn.getBoundingClientRect();
      const w = Math.min(300, window.innerWidth - 24);
      pop.style.width = `${w}px`;
      pop.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
      const below = r.bottom + 8;
      pop.style.top = `${below + pop.offsetHeight > window.innerHeight - 12 ? Math.max(12, r.top - pop.offsetHeight - 8) : below}px`;
    }
    document.addEventListener("click", e => { const pop = document.getElementById("vitaUsagePop"); if (pop && !pop.contains(e.target) && !e.target.closest?.(".vsc-info, .vtm-info")) closeVitaUsageInfo(); }, true);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeVitaUsageInfo(); });
    window.addEventListener("scroll", closeVitaUsageInfo, { passive: true });
    window.openVitaUsageInfo = openVitaUsageInfo;
    window.closeVitaUsageInfo = closeVitaUsageInfo;
    window.getVitaUsageTip = getVitaUsageTip;
