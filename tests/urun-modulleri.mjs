/* Takviye ve İlaç modülleri: ayrı katalog, ayrı barkod önbelleği, ayrı kayıt; kademeli barkod arama;
   sade "İlaç ekle" ve "Bugün Alınması Gereken İlaçlar" (gece sıfırlanır). Dış servisler sahte sunucuyla taklit edilir. */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
p.setDefaultTimeout(30000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };

const NET = { off: [], gemini: [], geminiReply: null };
await p.setRequestInterception(true);
p.on('request', req => {
  const url = req.url();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  const json = (status, obj) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(obj) });
  if (req.method() === 'OPTIONS' && !url.startsWith('http://localhost')) return req.respond({ status: 204, headers: cors });
  if (/openfoodfacts|openproductsfacts/.test(url)) {
    NET.off.push(url);
    if (url.includes('8690000000013') && url.includes('openfoodfacts')) return json(200, { status: 1, product: { product_name: 'Çinko 15 mg 60 Tablet', brands: 'AçıkMarka', quantity: '60 tablet' } });
    return json(200, { status: 0 });
  }
  if (url.startsWith('https://generativelanguage.googleapis.com/')) {
    if (url.includes('/models?')) return json(200, { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
    NET.gemini.push(JSON.parse(req.postData() || '{}'));
    return json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(NET.geminiReply || { urunAdi: '', emin: false }) }] } }] });
  }
  return req.continue();
});
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-home'); });
await sleep(800);

/* 1) Kataloglar ayrı ve Türkçe karakter duyarsız */
const cat = await p.evaluate(async () => {
  await loadVitaCatalog('supplement'); await loadVitaCatalog('medication');
  const n = (m, q) => searchVitaProducts(m, q, 10).map(x => x.urunAdi);
  return { supParol: n('supplement', 'parol'), medParol: n('medication', 'PAROL'), supMag: n('supplement', 'magnezyum'), medMag: n('medication', 'magnezyum'),
    cinko: n('supplement', 'cinko'), medEuthy: n('medication', 'euthyrox'), supEuthy: n('supplement', 'euthyrox'), devit: n('medication', 'devit') };
});
log('Takviye aramasında ilaç çıkmaz, ilaç aramasında takviye çıkmaz', cat.supParol.length === 0 && cat.medParol[0]?.startsWith('Parol') && cat.supMag.length > 0 && cat.medMag.length === 0 && cat.supEuthy.length === 0 && cat.medEuthy.length > 0, JSON.stringify(cat).slice(0, 220));
log('Türkçe karakter duyarsız arama ("cinko" → Çinko, "PAROL" → Parol) ve yeni ilaçlar (Devit-3) katalogda', cat.cinko.some(x => /Çinko/.test(x)) && cat.devit.some(x => /Devit-3/.test(x)), JSON.stringify(cat.cinko));
const files = await p.evaluate(async () => { const a = await (await fetch('./data/tr-supplements.json')).json(); const m = await (await fetch('./data/tr-medications.json')).json(); return { s: a.items.length, m: m.items.length, cross: m.items.some(x => /Ocean|Solgar|Venatura|Supradyn/.test(x.urunAdi)) || a.items.some(x => /Euthyrox|Parol|Coumadin/.test(x.urunAdi)) }; });
log('data/tr-supplements.json ve data/tr-medications.json ayrı dosyalar, birbirinin ürününü içermez', files.s > 20 && files.m > 20 && !files.cross, JSON.stringify(files));

/* 2) Takviye penceresinde ilaç barkodu: ilaç olarak işlenmez (çapraz karışma yok) */
const medsBefore = await p.evaluate(() => JSON.stringify(state.user.medications || []));
await p.evaluate(() => openAddSupplementModal()); await sleep(300);
NET.off.length = 0;
await p.evaluate(() => handleAddSupBarcodeDecoded('8699514010050')); await sleep(1200);
const x1 = await p.evaluate(() => ({ fb: document.getElementById('addSupBarcodeFeedbackBox').innerText, name: document.getElementById('manualSupName').value, meds: JSON.stringify(state.user.medications || []) }));
log('Takviye ekle: ilaç barkodu (Levotiron) takviye listesinde bulunmaz, ilaç listesine de eklenmez', /bulunamadı/.test(x1.fb) && !x1.name && x1.meds === medsBefore, x1.fb.slice(0, 120));

/* 3) Takviye kademesi: katalog → açık katalog (Open Food Facts) */
await p.evaluate(() => openAddSupplementModal()); await sleep(200);
await p.evaluate(() => handleAddSupBarcodeDecoded('0339840330085')); await sleep(800);
const s1 = await p.evaluate(() => ({ fb: document.getElementById('addSupBarcodeFeedbackBox').innerText, name: document.getElementById('manualSupName').value }));
log('Takviye barkodu takviye kataloğundan tanınır', /Kaynak: Türkiye takviye kataloğu/.test(s1.fb) && s1.name.length > 3, s1.fb.slice(0, 120));
NET.off.length = 0;
await p.evaluate(() => { openAddSupplementModal(); handleAddSupBarcodeDecoded('8690000000013'); }); await sleep(1500);
const s2 = await p.evaluate(() => ({ fb: document.getElementById('addSupBarcodeFeedbackBox').innerText, name: document.getElementById('manualSupName').value, box: document.getElementById('manualSupBoxCount').value }));
log('Katalogda olmayan takviye Open Food Facts\'ten bulunur (yalnızca barkod gönderilir)', /Open Food Facts/.test(s2.fb) && s2.name === 'AçıkMarka Çinko 15 mg 60 Tablet' && s2.box === '60' && NET.off.length >= 1 && NET.off.every(u => /\/api\/v2\/product\/8690000000013\.json/.test(u)), `${s2.name} | ${NET.off[0] || ''}`);

/* 4) Bulunamayan takviye: firma tahmini + elle eklenince takviye önbelleğine öğrenilir */
await p.evaluate(() => { openAddSupplementModal(); handleAddSupBarcodeDecoded('8697595999993'); }); await sleep(1500);
const s3 = await p.evaluate(() => document.getElementById('addSupBarcodeFeedbackBox').innerText);
log('Bulunamayan 869 barkodunda bilinen firma kodundan üretici tahmini (Orzax) gösterilir', /bulunamadı/.test(s3) && /8697595/.test(s3) && /Orzax/i.test(s3), s3.slice(0, 200));
await p.evaluate(() => { document.getElementById('manualSupName').value = 'Ocean Test Çinko'; VitaSupPage.setVakits(['Akşam']); commitManualSupplement(); }); await sleep(500);
const s4 = await p.evaluate(() => ({ sup: JSON.parse(localStorage.getItem('vita_custom_supplement_barcodes') || '{}')['8697595999993'], med: JSON.parse(localStorage.getItem('vita_custom_medication_barcodes') || '{}')['8697595999993'], added: state.supplements.some(s => s.name === 'Ocean Test Çinko') }));
log('Elle eklenen takviyenin barkodu YALNIZCA takviye önbelleğine öğretilir', s4.added && s4.sup?.urunAdi === 'Ocean Test Çinko' && s4.sup?.zamanBloku === 'Akşam' && !s4.med, JSON.stringify(s4));
NET.off.length = 0;
await p.evaluate(() => { openAddSupplementModal(); handleAddSupBarcodeDecoded('8697595999993'); }); await sleep(800);
const s5 = await p.evaluate(() => ({ fb: document.getElementById('addSupBarcodeFeedbackBox').innerText, name: document.getElementById('manualSupName').value, timing: VitaSupPage.getPlan().vakits.map(v => v.vakit).join() }));
log('Öğretilen barkod bir dahaki taramada önbellekten (dış sorgu olmadan) tanınır', /daha önce kaydettiğiniz/.test(s5.fb) && s5.name === 'Ocean Test Çinko' && s5.timing === 'Akşam' && NET.off.length === 0, s5.fb.slice(0, 100));
const crossMed = await p.evaluate(async () => (await lookupVitaBarcode('medication', '8697595999993', { ai: false })).found);
log('Takviye önbelleğindeki barkod ilaç modülünde bulunmaz', crossMed === false);
await p.evaluate(() => closeAddSupplementModal());

/* 5) Gemini adımı: yalnızca anahtar varsa; ilaçta veri paylaşım onayı da gerekir */
await p.evaluate(() => saveGeminiApiKey('AIzaSyA1b2C3d4E5f6G7h8I9j0K-L_mNoPqRsTu')); await sleep(700);
NET.gemini.length = 0; NET.geminiReply = { urunAdi: 'Yapay Zekâ Takviye D3', marka: 'X', emin: true };
const g0 = await p.evaluate(async () => { const r = await lookupVitaBarcode('supplement', '8691111111110'); return { found: r.found, steps: r.steps }; });
log('Bulunamayan barkod için Gemini’ye yalnızca numara gönderilip ürün TAHMİN ETTİRİLMEZ (yanlış eşleşme önlenir)', !g0.found && !g0.steps.includes('gemini') && NET.gemini.length === 0, JSON.stringify(g0));
const g1 = await p.evaluate(async () => { const r = await lookupVitaBarcode('supplement', '8691111111110', { ai: true }); return { found: r.found, source: r.source, steps: r.steps, verify: r.verifyHint }; });
log('Takviye: (açıkça istenirse) önbellek → katalog → açık katalog → firma → Gemini; Gemini sonucu "tahmin" işaretlenir', g1.found && g1.source === 'gemini' && g1.verify && g1.steps.join(',') === 'cache,catalog,openfacts,prefix,gemini' && NET.gemini.length === 1, JSON.stringify(g1));
NET.gemini.length = 0; NET.off.length = 0;
const g2 = await p.evaluate(async () => { localStorage.removeItem(`vita_ai_consent_${activeUserId}`); const r = await lookupVitaBarcode('medication', '8692222222225'); return { found: r.found, steps: r.steps, aiSkipped: r.aiSkipped }; });
log('İlaç: veri paylaşım onayı yokken Gemini\'ye, hiçbir durumda Open Food Facts\'e gidilmez', !g2.found && g2.aiSkipped && !g2.steps.includes('openfacts') && NET.gemini.length === 0 && NET.off.length === 0, JSON.stringify(g2));
NET.geminiReply = { urunAdi: 'Yapay Zekâ İlacı 10 mg', emin: true };
const g3 = await p.evaluate(async () => { localStorage.setItem(`vita_ai_consent_${activeUserId}`, 'true'); const r = await lookupVitaBarcode('medication', '8692222222225', { ai: true }); return { found: r.found, source: r.source, name: r.item?.urunAdi }; });
log('İlaç: (açıkça istenirse) anahtar + onay varsa Gemini tahmini denenir', g3.found && g3.source === 'gemini' && NET.gemini.length === 1 && NET.off.length === 0, JSON.stringify(g3));
NET.geminiReply = { urunAdi: '', emin: false };
const g4 = await p.evaluate(async () => (await lookupVitaBarcode('supplement', '8693333333330')).found);
log('Gemini "emin değilim" derse ürün uydurulmaz', g4 === false);
await p.evaluate(() => { clearGeminiApiKeyFromSettings(); localStorage.removeItem(`vita_ai_consent_${activeUserId}`); navigateToView('view-home'); });

/* 6) Sade İlaç ekle: yalnızca ilaç kataloğu, sıklık, "Ben bu ilacı kullanıyorum" */
await p.evaluate(() => document.getElementById('btnOpenAddMedication').click()); await sleep(400);
const m0 = await p.evaluate(() => ({ open: !document.getElementById('addMedicationModal').classList.contains('hidden'), oldClosed: document.getElementById('barcodeScannerModal').classList.contains('hidden'), btn: document.getElementById('btnCommitAddMedication').innerText.trim() }));
log('"Bugünkü ilaçlarım" kartındaki "İlaç Ekle" tam ekran İlaç Ekle sayfasını açar', m0.open && m0.oldClosed && m0.btn === 'Ben bu ilacı kullanıyorum', JSON.stringify(m0));
await p.type('#addMedSearchInput', 'euthy'); await sleep(300);
const m1 = await p.evaluate(() => Array.from(document.querySelectorAll('#addMedSuggest b')).map(x => x.textContent));
log('İlaç penceresi araması yalnızca ilaçları getirir', m1.length > 0 && m1.every(x => /Euthyrox/i.test(x)), JSON.stringify(m1));
await p.evaluate(() => document.querySelector('#addMedSuggest [data-med-pick]').click()); await sleep(200);
await p.evaluate(() => document.querySelector('#vamVakits [data-vakit="Akşam"]').click());
const ui2 = await p.evaluate(() => ({ clocks: VitaMedPage.getPlan().vakits.map(v => v.clock), hint: document.getElementById('addMedScheduleHint').innerText }));
await p.evaluate(() => commitAddMedication()); await sleep(500);
const m2 = await p.evaluate(() => {
  const med = state.medications.find(m => /Euthyrox/.test(m.name));
  return { med, stored: JSON.parse(localStorage.getItem(`vitatakip_medications_${activeUserId}`) || '[]').some(m => /Euthyrox/.test(m.name)), names: state.user.medications, rec: (state.user.prescriptionDrugRecords || []).find(r => /Euthyrox/.test(r.urunAdi)), closed: document.getElementById('addMedicationModal').classList.contains('hidden') };
});
log('"Ben bu ilacı kullanıyorum" ilacı ayrı ilaç kaydına (vitatakip_medications_) sıklığıyla kaydeder', m2.med && m2.med.frequency === 'gunde2' && m2.med.clocks.join() === '09:00,20:00' && m2.med.times.join() === 'Sabah,Akşam' && m2.stored && m2.closed && ui2.clocks.join() === '09:00,20:00' && /ayrı ayrı/.test(ui2.hint), JSON.stringify(m2.med));
log('Etkileşim motoru için profil ilaç alanları ilaç listesinden üretilir (günde 2 doz)', m2.names.includes(m2.med.name) && m2.rec && m2.rec.gunlukDoz === 2 && /Levotiroksin/i.test(m2.rec.etkenMadde || ''), JSON.stringify({ rec: m2.rec?.urunAdi, doz: m2.rec?.gunlukDoz }));

// Barkodla katalogdan, bilinmeyen barkodu elle (haftalık, bugün) ekle → ilaç önbelleğine öğrenilir
NET.off.length = 0;
await p.evaluate(() => openAddMedicationModal()); await sleep(200);
await p.evaluate(() => lookupAddMedBarcode('8699514010050')); await sleep(400);
const m3 = await p.evaluate(() => ({ name: document.getElementById('addMedName').value, status: document.getElementById('addMedStatus').innerText, bc: document.getElementById('addMedBarcode').value }));
log('İlaç barkodu ilaç kataloğundan tanınır', /Levotiron/.test(m3.name) && /Türkiye ilaç kataloğu/.test(m3.status) && m3.bc === '8699514010050', JSON.stringify(m3).slice(0, 160));
await p.evaluate(() => closeAddMedicationModal());
await p.evaluate(() => openAddMedicationModal()); await sleep(200);
await p.evaluate(() => lookupAddMedBarcode('8699999999994')); await sleep(500);
const m4 = await p.evaluate(() => document.getElementById('addMedStatus').innerText);
await p.evaluate(() => { document.getElementById('addMedName').value = 'Testilaç 5 mg'; VitaMedPage.setPlan({ freq: 'days', vakits: { 'Akşam': '20:30' }, days: [new Date().getDay()] }); commitAddMedication(); }); await sleep(400);
const m5 = await p.evaluate(() => ({ med: JSON.parse(localStorage.getItem('vita_custom_medication_barcodes') || '{}')['8699999999994'], sup: JSON.parse(localStorage.getItem('vita_custom_supplement_barcodes') || '{}')['8699999999994'] }));
log('Bulunamayan ilaç barkodu: dış kataloğa sorulmaz; elle eklenince YALNIZCA ilaç önbelleğine öğrenilir', /ilaç listesinde yok/.test(m4) && NET.off.length === 0 && m5.med?.urunAdi === 'Testilaç 5 mg' && !m5.sup, JSON.stringify(m5));
const m6 = await p.evaluate(async () => { const r = await lookupVitaBarcode('medication', '8699999999994'); return { src: r.source, name: r.item?.urunAdi, inSup: (await lookupVitaBarcode('supplement', '8699999999994', { ai: false, openFacts: false })).found }; });
log('Öğrenilen ilaç barkodu ilaçta önbellekten bulunur, takviyede bulunmaz', m6.src === 'cache' && m6.name === 'Testilaç 5 mg' && !m6.inSup, JSON.stringify(m6));
await p.evaluate(() => { openAddMedicationModal(); document.getElementById('addMedName').value = 'Parol 500 mg Tablet'; VitaMedPage.setPlan({ freq: 'prn' }); commitAddMedication(); }); await sleep(400);

/* 7) Bugün Alınması Gereken İlaçlar: işaretle, kalıcı, gece sıfırlanır */
const t1 = await p.evaluate(() => ({
  visible: !document.getElementById('todayMedsCard').classList.contains('hidden'),
  rows: Array.from(document.querySelectorAll('#todayMedsList .vtm-row')).map(r => r.innerText.replace(/\s+/g, ' ').trim()),
  counter: document.getElementById('todayMedsCounter').innerText, note: document.getElementById('todayMedsNote').innerText
}));
log('Kart görünür: Euthyrox 09:00 + 20:00, haftalık ilaç (bugün) 20:30; "gerektiğinde" listede değil, notta', t1.visible && t1.rows.length === 3 && t1.rows.filter(r => /Euthyrox/.test(r)).length === 2 && t1.rows.some(r => /Testilaç/.test(r) && /20:30/.test(r)) && !t1.rows.some(r => /Parol/.test(r)) && /Gerektiğinde: Parol/.test(t1.note) && t1.counter === '0/3 alındı', JSON.stringify(t1));
await p.evaluate(() => document.querySelector('#todayMedsList input[data-dose="09:00"]').click()); await sleep(300);
const t2 = await p.evaluate(() => { const saved = JSON.parse(localStorage.getItem(`vitatakip_med_taken_${activeUserId}`)); return { counter: document.getElementById('todayMedsCounter').innerText, saved, today: saved?.date === vitaLocalToday() }; });
log('Onay kutusuyla doz "alındı" işaretlenir ve kaydedilir', t2.counter === '1/3 alındı' && t2.today, JSON.stringify(t2).slice(0, 160));
await p.reload({ waitUntil: 'networkidle2' }); await sleep(2500);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
const t3 = await p.evaluate(() => ({ counter: document.getElementById('todayMedsCounter').innerText, checked: document.querySelector('#todayMedsList input[data-dose="09:00"]')?.checked, meds: state.medications.length }));
log('Sayfa yenilenince ilaçlar ve bugünkü işaretler korunur', t3.counter === '1/3 alındı' && t3.checked === true && t3.meds === 3, JSON.stringify(t3));
await p.evaluate(() => { const k = `vitatakip_med_taken_${activeUserId}`; const v = JSON.parse(localStorage.getItem(k)); v.date = '2000-01-01'; localStorage.setItem(k, JSON.stringify(v)); state.medTaken = v; document.dispatchEvent(new Event('visibilitychange')); });
await sleep(300);
const t4 = await p.evaluate(() => ({ counter: document.getElementById('todayMedsCounter').innerText, checked: document.querySelector('#todayMedsList input[data-dose="09:00"]')?.checked, date: state.medTaken.date === vitaLocalToday() }));
log('Gün değişince (00:00) "alındı" işaretleri sıfırlanır, ilaçlar kalır', t4.counter === '0/3 alındı' && t4.checked === false && t4.date, JSON.stringify(t4));
const timer = await p.evaluate(() => typeof scheduleVitaMidnightRefresh === 'function' && /setTimeout/.test(String(scheduleVitaMidnightRefresh)));
log('Uygulama açıkken gece yarısı için zamanlayıcı kurulur', timer);

/* 8) Silme, eski kayıt taşıma, yedek */
await p.evaluate(() => removeCustomMedication('Testilaç 5 mg')); await sleep(300);
const r1 = await p.evaluate(() => ({ meds: state.medications.map(m => m.name), profile: state.user.medications, rows: document.querySelectorAll('#todayMedsList .vtm-row').length }));
log('İlaç silinince listeden, profilden ve bugünkü listeden kalkar', !r1.meds.includes('Testilaç 5 mg') && !r1.profile.includes('Testilaç 5 mg') && r1.rows === 2, JSON.stringify(r1));
await p.evaluate(() => { const uid = activeUserId; const u = JSON.parse(localStorage.getItem(`vitatakip_user_${uid}`)); u.medications = [...u.medications, 'Eski Kayıt İlacı']; localStorage.setItem(`vitatakip_user_${uid}`, JSON.stringify(u)); localStorage.removeItem(`vitatakip_medications_${uid}`); localStorage.setItem(`vitatakip_extended_updated_${uid}`, String(Date.now() + 1e9)); });
await p.reload({ waitUntil: 'networkidle2' }); await sleep(2500);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
const r2 = await p.evaluate(() => state.medications.map(m => m.name));
log('Eski sürüm verisi (yalnızca profildeki ilaç adları) ilaç modülüne taşınır', r2.includes('Eski Kayıt İlacı') && r2.some(n => /Euthyrox/.test(n)), JSON.stringify(r2));
const bk = await p.evaluate(() => { let saved = ''; const orig = window.vitaSaveTextFile; window.vitaSaveTextFile = (n, t, c) => { saved = c; return true; }; try { exportDataBackup(); } finally { window.vitaSaveTextFile = orig; } return JSON.parse(saved || '{}'); });
log('Yedekte ilaçlar ayrı alan olarak yer alır', Array.isArray(bk.medications) && bk.medications.some(m => /Euthyrox/.test(m.name) && m.frequency === 'gunde2'), String(bk.medications?.length));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
