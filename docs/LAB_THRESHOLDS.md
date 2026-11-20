# VitaTakip — Laboratuvar eşikleri, kaynaklar ve karar mantığı

Kod: `js/app/16-lab-evidence.js` (sınıflandırma + kaynak kaydı), `js/app/17-lab-insights.js` (birleştirme, ilişkiler),
`js/app/11-cdss-analysis.js` (klinik analiz), `js/app/05-clinical-rules.js` (eski motor sarmalayıcısı).
Testler: tarayıcı konsolunda `VitaTakipDiagnostics.run()` (55 yeni test dahil toplam 159 kontrol).

## Dört ayrı kavram
| Kavram | Anlamı | Uygulamadaki karşılığı |
|---|---|---|
| Referans aralığı | Laboratuvarın kendi aralığı (yönteme/popülasyona göre değişir) | Kullanıcının girdiği aralık (birimi doğrulanırsa) |
| Klinik eşik | Kılavuz/otorite kaynağın eksiklik/yüksek riski için önerdiği sınır | `CLINICAL` işlevleri; yalnızca kaynağı doğrulananlar |
| Takviye gereksinimi | Hekimin karar vereceği tedavi | Uygulama yalnızca "hekimle değerlendirilecek aday" üretir; doz vermez |
| Toksisite | Zararlı alım/düzey | Yalnızca kaynaklı eşik (25(OH)D >150 ng/mL, magnezyum >1,74 mmol/L) |

## Durumlar
Referans aralığında · Referans altı · Referans üstü · Sınırda / ek değerlendirme gerekli · Değerlendirilemedi ·
Acil klinik değerlendirme gerekli (yalnızca aşağıdaki kaynaklı koşullar).
`isLow` (takviye adayı üretebilen "düşük") = laboratuvar referansının altı **veya** kaynaklı klinik eşiğin altı.
Genel/tipik aralığın altı tek başına `isLow` yapmaz ve takviye adayı üretmez.

## Parametre tablosu
Birim = alanın kanonik birimi. Dönüşüm: değer(birim) × katsayı = kanonik birim. Makul aralık dışındaki değer birim hatası şüphesiyle "değerlendirilemedi" olur.

| Parametre | Kanonik birim (dönüşümler) | Klinik değerlendirme | Kaynak | Doğrulama |
|---|---|---|---|---|
| B12 | pg/mL (ng/L ×1, pmol/L ×1,355) | <180 eksiklik olası; 180–399 sınırda (MMA önerilir); >1000 yüksek-inceleme (toksisite değil) | NIH ODS B12; AAFP 2025 (NICE ile uyumlu) | Birincil sayfalar arama sonuçlarında doğrulandı |
| Ferritin | ng/mL (µg/L ×1, pmol/L ×0,445) | <15 düşük (WHO); CRP>5 iken <70 sınırda (WHO koşullu); 15–44 sınırda (AGA <45); K >150 / E >200 yüksek-inceleme; >500 yüksek-inceleme | WHO 2020 ferritin kılavuzu; AGA 2020 (Ko CW ve ark., PMID 32810434, [DOI](https://doi.org/10.1053/j.gastro.2020.06.046)) | WHO doğrulandı; AGA birincil kılavuz kaydı PubMed'de doğrulandı (2026-11): anemide ferritin kesme değeri 45 ng/mL (koşullu öneri) |
| 25-OH D | ng/mL (nmol/L ×0,4) | <12 eksiklik riski; 12–19,9 bazı kişilerde yetersiz; ≥20 yeterli; >50 olası yan etki; >150 toksisite belirtileri (acil) | NIH ODS Vitamin D; Endocrine Society 2024 (Demay MB ve ark., PMID 38828931, [DOI](https://doi.org/10.1210/clinem/dgae290)) | Doğrulandı. Endocrine Society 2024, 2011'deki ≥30 ng/mL yaklaşımını bıraktı: 75 yaş altı sağlıklı yetişkinde rutin 25(OH)D taraması ve DRI üstü ampirik takviye önerilmez; ideal hedef düzey tanımlanamadı |
| Magnezyum | mg/dL (mmol/L ×2,43; mEq/L ×1,215) | <0,75 mmol/L (1,82 mg/dL) hipomagnezemi; <0,5 mmol/L acil; >0,95 yüksek-inceleme; >1,74 mmol/L toksisite (acil) | NIH ODS Magnesium; Adv Nutr (Costello RB ve ark., PMID 28140318, [DOI](https://doi.org/10.3945/an.116.012765)) | Doğrulandı. Serum Mg depoları tam yansıtmaz. Kramp ↔ Mg: Cochrane 2020 (PMID 32956536, [DOI](https://doi.org/10.1002/14651858.CD009402.pub3)) yaşlılarda gece krampını anlamlı azaltmadığını gösterdi; belirti metni buna göre |
| Hemoglobin | g/dL (g/L ×0,1) | K <12, E <13 anemi ile uyumlu (gebelikte 11) | WHO 2011 | Doğrulandı |
| CRP | mg/L (mg/dL ×10) | >5 enflamasyon göstergesi (ferritin yorumu için) | WHO ferritin kılavuzu | Doğrulandı |
| Kalsiyum (total) | mg/dL (mmol/L ×4,008) | ≥14 ağır hiperkalsemi (acil); 12–13,9 orta (acil, gecikmeden hekim); 10,2–11,9 hafif (inceleme); <7,6 ağır hipokalsemi (acil); <8,6 düşük (tipik aralık) | Minisola S ve ark. BMJ 2015 (PMID 26037642, [DOI](https://doi.org/10.1136/bmj.h2723)); Cannon J ve ark. Surgery 2010 (≥14 mg/dL kriz, [DOI](https://doi.org/10.1016/j.surg.2010.07.041)); Cooper MS, Gittoes NJ. BMJ 2008 (PMID 18535072, [DOI](https://doi.org/10.1136/bmj.39582.589433.BE)) | ≥14 PubMed özetinde doğrulandı; 12/14 derecelendirmesi Minisola 2015 (özet yok, kaynak kaydı doğrulandı); <1,9 mmol/L (Cooper) kaynak kaydı doğrulandı, sayısal eşik özette yok. Albümin düzeltmesi uyarılır |
| Çinko | µg/dL (µmol/L ×6,54) | Alt sınır K <70 / E <74 (sabah, aç karnına) → "sınırda" (takviye adayı üretmez); üst 120 tipik | IZiNCG (Hess SY ve ark., PMID 17988005, [DOI](https://doi.org/10.1177/15648265070283S303)) | Doğrulandı. Serum çinko bireysel düzeyde güvenilir değil; enflamasyon/düşük albümin düşürür |
| Folat | ng/mL (nmol/L ×0,4413) | <3 eksiklik olası; 3–3,9 sınırda (homosistein temelli <4); üst 20 tipik | BOND Folat İncelemesi (Bailey LB ve ark., PMID 26451605, [DOI](https://doi.org/10.3945/jn.114.206599)) | Doğrulandı. Serum folat son alımı yansıtır; uzun dönem için eritrosit folatı |
| Omega-3 (tahlil yok) | — | >1 g/gün takviye kanama (IRR 1,49) ve AF riskini artırır → kan sulandırıcıyla doz artırma uyarısı | Lombardi M ve ark. 2020 (PMID 32671519, [DOI](https://doi.org/10.1007/s11883-020-00865-5)) | Doğrulandı; uygulamadaki etkileşim uyarısıyla uyumlu |
| MCV | fL | <80 mikrositoz → "sınırda" (ilk test ferritin; takviye adayı üretmez); >100 makrositoz → inceleme (B12/folat, alkol, ilaç, tiroid, karaciğer) | Kaferle J, Strzoda CE. Am Fam Physician 2009 (PMID 19202968); Van Vranken M. Am Fam Physician 2010 (PMID 21121557) | Her iki eşik PubMed özetinde doğrulandı |
| Eritrosit folatı (yeni) | ng/mL (nmol/L ×0,4413) | <140 ng/mL (<305 nmol/L) eksiklik olası; doğurganlık çağındaki kadında <400 ng/mL için yalnızca bilgi notu (WHO toplum düzeyi eşiği; bireysel risk tahmini değildir) | BOND (PMID 26451605); WHO 2015 – Cordero AM ve ark. MMWR (PMID 25905896, PMC5779552); Wong E ve ark. 2022 (PMID 34637065, [DOI](https://doi.org/10.1007/s10995-021-03257-6)) | <305 nmol/L özette, 400 ng/mL eşiği ve "yalnız toplum düzeyi" uyarısı tam metinde doğrulandı |
| Homosistein (yeni) | µmol/L | >15 inceleme; >30 belirgin yüksek (inceleme); >100 ağır (acil) | Refsum H ve ark. Clin Chem 2004 (PMID 14709635, [DOI](https://doi.org/10.1373/clinchem.2003.021634)) | Kaynak kaydı doğrulandı; sayısal sınırlar özette yok (yaygın yetişkin üst referansı ≈15). Laboratuvar aralığı esastır; takviye adayı üretmez |
| Kreatinin / ALT | mg/dL / U/L | Eski motor: kreatinin >1,4 ve ALT >50 U/L **güvenlik süzgeci** (takviye güvenliği için); eGFR CKD-EPI 2021 (KDIGO evreleri) | KDIGO / CKD-EPI 2021 | ALT 50 eşiği uygulamaya özgü güvenlik süzgecidir, tanı sınırı değildir |

## Önceki eşiklerin incelenmesi (silinmedi, arşivlendi)
`KDSSRuleEngine.evaluateLegacy` içinde duruyor; yalnızca kreatinin ve ALT için kullanılıyor.
- B12: <200 "kritik", 200–399 "sınırda", 400–800 "optimal", >1200 "toksik". Alt kısım NIH ODS'nin 150–399 gri bölgesine yakındı; "optimal 400–800" ve ">1200 toksik" için kaynak bulunamadı. B12 için UL belirlenmemiştir.
- D vitamini: 20–29 "yetersiz", 30–60 "optimal" → NIH ODS'ye göre ≥20 ng/mL çoğu kişide yeterli.
- Magnezyum: ≤1,9 mg/dL "yetersiz" → NIH ODS alt sınırı 1,82 mg/dL; birim ayrımı yoktu.
- Ferritin: <50 "sınırda/yetersiz" → tek eşik, enflamasyon ve hemogram yok.

## Kullanıcıya gösterim (V3)
- Eşik sürümü: `VitaLabEvidence.VERSION` ("Kasım 2026"); rapor altbilgisinde "Eşikler: Kasım 2026 · PubMed doğrulamalı" ve "Kaynak listesi".
- Her tahlil kartında ve Klinik Analiz "Değerlerim" satırında küçük (i) düğmesi: genel aralık, kısa not, kaynaklar ve doğrulama düzeyi
  (`pubmed` özette/tam metinde okundu · `pubmed-kayit` kaynak kaydı doğrulandı, sayı özette yok · `web` resmî kurum sayfası · `yok`). Kod: `js/kaynak-bilgi.js`.
- Sınırda/referans dışı (acil olmayan) değerler için 8–12 hafta kontrol hatırlatması bir tasarım kararıdır, kılavuz eşiği değildir (`js/kontrol-hatirlatma.js`).

## Davranış kuralları
- Referans aralığı yoksa veya birimi doğrulanamıyorsa: genel aralık kullanılır, bu belirtilir; takviye adayı yalnızca kaynaklı klinik eşikle oluşur.
- Referans birimi dönüştürülebiliyorsa (mmol/L, pmol/L, nmol/L, g/L...) dönüştürülür ve değerin raporla aynı birimde girildiği varsayımı notla belirtilir.
- Klinik analiz her gösterge için en güncel ölçümü kullanır (farklı tarihler birleştirilir). 90 günden eski ölçümler takviye adayı üretmez, "güncel değil" olarak listelenir.
- Magnezyum, ferritin, B12 tek başına takviyeye dönüşmez: adaylar "hekimle doğrulanacak" ifadesiyle, parametreye özgü uyarılarla sunulur.

## Doğrulanamayan / hekim değerlendirmesi gerektiren noktalar
1. (Çözüldü 2026-11: AGA 2020, folat, çinko, kalsiyum, MCV PubMed ile doğrulandı); 2. homosistein sayısal sınırları ve hipokalsemi <1,9 mmol/L eşiği kaynak özetinde yer almıyor (kaynak kaydı doğrulandı);
3. Gebelik ve çocuklarda eşikler (uygulama yetişkin odaklıdır); 4. 90 günlük "güncellik" süresi bir tasarım kararıdır, kılavuz değildir;
5. B12 >1000 pg/mL için yönlendirme metni AAFP 2025'e dayanır (ilişki, nedensellik değil); 6. ALT >50 güvenlik süzgeci.
