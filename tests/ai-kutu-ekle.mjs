/* Yapay zekâ kutu tanıma → sisteme ekleme (sahte Gemini sunucusuyla; gerçek Google'a gidilmez).
   1) İlaç ekle penceresi: sonuç kutusunun hemen altında "İlacı listeme ekle" düğmesi çıkar ve ilaç listeye işlenir.
   2) İlaç ekle penceresinde takviye tanınırsa "Takviye olarak ekle" Takviye ekle formunu doldurup açar.
   3) Takviye ekle penceresi: yapay zekâ sonucu formun tüm alanlarına işlenir, kartta "Takviyeyi ekle" ile çizelgeye girer.
   4) Takviye ekle penceresinde ilaç tanınırsa "İlaç listeme ekle" önerilir. */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot({ preload: () => { delete window.BarcodeDetector; localStorage.setItem('vitatakip_camera_app_approved', 'true'); } });
p.setDefaultTimeout(30000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };

const G = { reply: null, reqs: [] };
await p.setRequestInterception(true);
p.on('request', req => {
  const url = req.url();
  if (!url.startsWith('https://generativelanguage.googleapis.com/')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const json = obj => req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(obj) });
  if (url.includes('/models?')) return json({ models: [{ name: 'models/gemini-9.9-flash', supportedGenerationMethods: ['generateContent'] }] });
  const body = JSON.parse(req.postData() || '{}');
  G.reqs.push(body);
  return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(G.reply) }] } }] });
});

await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
await sleep(700);
// Anahtar doğrulaması sahte sunucudan geçer.
await p.evaluate(async () => { navigateToView('view-settings'); document.getElementById('drawerGeminiApiKeyInput').value = 'AIzaTEST_anahtar_0000000000000000000'; await saveGeminiApiKey(); });
await sleep(800);

// Barkodsuz "kutu" fotoğrafı
await p.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d');
  x.fillStyle = '#eee'; x.fillRect(0, 0, 400, 300); x.fillStyle = '#123'; x.font = '30px sans-serif'; x.fillText('KUTU', 140, 160);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg'));
  window.__testFile = new File([blob], 'IMG_20261114_kutu.jpg', { type: 'image/jpeg' });
});
const feed = id => p.evaluate(id => { const inp = document.getElementById(id); const dt = new DataTransfer(); dt.items.add(window.__testFile); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); }, id);

/* 1) İlaç ekle → ilaç tanınır → "İlacı listeme ekle" */
G.reply = { urunAdi: 'Euthyrox 100 mcg', marka: 'Merck', etkenMadde: 'Levotiroksin sodyum', form: 'Tablet', dozaj: '100 mcg', kutuAdedi: 50, gunlukDoz: 1, zamanBloku: 'Sabah', aclikDurumu: 'Aç karnına', tur: 'ilac' };
await p.evaluate(() => { navigateToView('view-home'); openBarcodeScannerModal('medication', 'all'); }); await sleep(500);
await feed('barcodePhotoFile'); await sleep(2500);
await p.evaluate(() => analyzeMedicationPhotoWithAI()); await sleep(2500);
const m1 = await p.evaluate(() => {
  const res = document.getElementById('barcodeAiResult'); const act = document.getElementById('barcodeAiResultActions');
  const btns = Array.from(act.querySelectorAll('button')).map(x => x.innerText.trim());
  const r = act.getBoundingClientRect(), rr = res.getBoundingClientRect();
  return { visible: !act.classList.contains('hidden') && r.height > 0, insideResult: res.contains(act) && r.top >= rr.top, btns, prompt: '' };
});
const sentPrompt = G.reqs.at(-1)?.contents?.[0]?.parts?.[0]?.text || '';
log('İlaç ekle: Gemini\'ye ortak istem (tür, günlük doz, zaman, aç/tok) gider', /"tur"/.test(sentPrompt) && /gunlukDoz/.test(sentPrompt) && /aclikDurumu/.test(sentPrompt) && G.reqs.at(-1)?.contents?.[0]?.parts?.some(x => x.inline_data));
log('İlaç ekle: yapay zekâ sonucunun hemen altında "İlacı listeme ekle" düğmesi var', m1.visible && m1.insideResult && m1.btns[0] === 'İlacı listeme ekle', JSON.stringify(m1));
await p.evaluate(() => document.querySelector('#barcodeAiResultActions .vita-ai-act-med').click()); await sleep(1200);
const m2 = await p.evaluate(() => ({ meds: JSON.stringify(state.user.medications || []) + JSON.stringify(state.user.chronic || []) + JSON.stringify(state.user.prescriptionDrugRecords || []), modalHidden: document.getElementById('barcodeScannerModal').classList.contains('hidden') }));
log('İlaç ekle: düğmeye basınca ilaç tanınan dozuyla (100 mcg) sisteme işlenir ve pencere kapanır', /"Euthyrox 100 mcg"/.test(m2.meds) && !/Euthyrox 50 mcg/.test(m2.meds) && /levothyroxine/.test(m2.meds) && m2.modalHidden, m2.meds.slice(0, 200));

/* 2) İlaç ekle penceresinde takviye tanınırsa → Takviye ekle formuna aktarılır */
G.reply = { urunAdi: 'Ocean Magnezyum Bisglisinat', marka: 'Orzax', etkenMadde: 'Magnezyum bisglisinat', form: 'Tablet', dozaj: '150 mg', kutuAdedi: 60, gunlukDoz: 2, zamanBloku: '', aclikDurumu: '', tur: 'takviye' };
await p.evaluate(() => openBarcodeScannerModal('medication', 'all')); await sleep(500);
await feed('barcodePhotoFile'); await sleep(2500);
await p.evaluate(() => analyzeMedicationPhotoWithAI()); await sleep(2500);
const s1 = await p.evaluate(() => Array.from(document.querySelectorAll('#barcodeAiResultActions button')).map(x => x.innerText.trim()));
log('İlaç ekle: takviye tanınınca önce "Takviye olarak ekle" önerilir', s1[0] === 'Takviye olarak ekle' && s1[1] === 'Yine de ilaç olarak ekle', JSON.stringify(s1));
await p.evaluate(() => document.querySelector('#barcodeAiResultActions .vita-ai-act-sup').click()); await sleep(900);
const s2 = await p.evaluate(() => ({
  supOpen: !document.getElementById('addSupplementModal').classList.contains('hidden'),
  scanHidden: document.getElementById('barcodeScannerModal').classList.contains('hidden'),
  name: document.getElementById('manualSupName').value, timing: VitaSupPage.getPlan().vakits.map(v => v.vakit).join(),
  daily: document.getElementById('manualSupDailyDose').value, box: document.getElementById('manualSupBoxCount').value,
  card: !document.getElementById('addSupAiResultCard').classList.contains('hidden'),
  hunger: document.getElementById('manualSupHungerNote').value
}));
log('Takviye olarak ekle: Takviye ekle formu açılır ve alanlar dolar (kutuda zaman yoksa taslak öneri)', s2.supOpen && s2.scanHidden && s2.name === 'Ocean Magnezyum Bisglisinat' && s2.timing === 'Akşam' && s2.daily === '2' && s2.box === '60' && s2.card && s2.hunger === '', JSON.stringify(s2));
await p.evaluate(() => closeAddSupplementModal());

/* 3) Takviye ekle penceresi: tüm alanlar + "Takviyeyi ekle" */
G.reply = { urunAdi: 'Solgar Vitamin D3 1000 IU', marka: 'Solgar', etkenMadde: 'Kolekalsiferol', form: 'Yumuşak kapsül', dozaj: '1000 IU', kutuAdedi: 100, gunlukDoz: 1, zamanBloku: 'Sabah', aclikDurumu: 'Tok karnına', tur: 'takviye' };
const before = await p.evaluate(() => state.supplements.length);
await p.evaluate(() => openAddSupplementModal()); await sleep(400);
const label = await p.evaluate(() => document.getElementById('btnAddSupAiBoxScan').innerText.trim());
log('Takviye ekle: düğme yapay zekâyı açıkça belirtir', /yapay zekâ/i.test(label), label);
await feed('addSupAiPhotoInput'); await sleep(3500);
const t1 = await p.evaluate(() => ({
  name: document.getElementById('manualSupName').value, brand: document.getElementById('manualSupBrandActive').value,
  form: document.getElementById('manualSupFormText').value, dose: document.getElementById('manualSupDose').value,
  hunger: document.getElementById('manualSupHungerNote').value, timing: VitaSupPage.getPlan().vakits.map(v => v.vakit).join(),
  box: document.getElementById('manualSupBoxCount').value, daily: document.getElementById('manualSupDailyDose').value,
  detailsOpen: document.getElementById('addSupMoreDetails').open,
  cardText: document.getElementById('addSupAiResultCard').innerText.replace(/\s+/g, ' '),
  btns: Array.from(document.querySelectorAll('#addSupAiResultCard button')).map(x => x.innerText.trim())
}));
log('Takviye ekle: yapay zekâ sonucu formun tüm alanlarına işlenir ve ayrıntılar açılır',
  t1.name === 'Solgar Vitamin D3 1000 IU' && t1.brand === 'Solgar — Kolekalsiferol' && t1.form === 'Yumuşak kapsül' && t1.dose === '1000 IU' && t1.hunger === 'Tok karnına' && t1.timing === 'Sabah' && t1.box === '100' && t1.daily === '1' && t1.detailsOpen, JSON.stringify(t1));
log('Takviye ekle: sonuç kartında kaynak ve "Takviyeyi ekle" düğmesi var', /Gemini yapay zekâ tanıdı/.test(t1.cardText) && !/gemini-\d/.test(t1.cardText) && t1.btns[0] === 'Takviyeyi ekle', t1.cardText.slice(0, 160));
await p.evaluate(() => document.querySelector('#addSupAiResultCard .vita-ai-act-sup').click()); await sleep(900);
const t2 = await p.evaluate(() => { const s = state.supplements.at(-1); return { n: state.supplements.length, name: s?.name, timing: s?.timing, box: s?.toplamKutuAdedi, daily: s?.gunlukDoz, dose: s?.doseText, form: s?.selectedForm, closed: document.getElementById('addSupplementModal').classList.contains('hidden') }; });
log('Takviye ekle: "Takviyeyi ekle" ile çizelgeye doğru verilerle kaydedilir', t2.n === before + 1 && t2.name === 'Solgar Vitamin D3 1000 IU' && t2.timing === 'Sabah' && t2.box === 100 && t2.daily === 1 && /1000 IU/.test(t2.dose) && /Tok/.test(t2.dose) && t2.form === 'Yumuşak kapsül' && t2.closed, JSON.stringify(t2));

/* 4) Takviye ekle penceresinde ilaç tanınırsa */
G.reply = { urunAdi: 'Glucophage 1000 mg', marka: 'Merck', etkenMadde: 'Metformin', form: 'Film tablet', dozaj: '1000 mg', kutuAdedi: 100, gunlukDoz: 0, zamanBloku: '', aclikDurumu: '', tur: 'ilac' };
await p.evaluate(() => openAddSupplementModal()); await sleep(400);
const cardReset = await p.evaluate(() => document.getElementById('addSupAiResultCard').classList.contains('hidden'));
await feed('addSupAiPhotoInput'); await sleep(3500);
const u1 = await p.evaluate(() => ({ btns: Array.from(document.querySelectorAll('#addSupAiResultCard button')).map(x => x.innerText.trim()), warn: document.querySelector('#addSupAiResultCard .vita-ai-card-warn')?.innerText || '' }));
log('Takviye ekle: pencere yeniden açılınca eski sonuç kartı temizlenir', cardReset);
log('Takviye ekle: ilaç tanınınca uyarı ve "İlaç listeme ekle" önerilir', /ilaç/.test(u1.warn) && u1.btns[0] === 'İlaç listeme ekle', JSON.stringify(u1));
// "İlaç listeme ekle" sade İlaç ekle penceresini adı dolu açar; kullanıcı alım saatini seçip kaydeder.
await p.evaluate(() => document.querySelector('#addSupAiResultCard .vita-ai-act-med').click()); await sleep(600);
const medModal = await p.evaluate(() => ({ open: !document.getElementById('addMedicationModal').classList.contains('hidden'), name: document.getElementById('addMedName').value }));
log('Takviye penceresindeki "İlaç listeme ekle" İlaç ekle penceresini adı dolu açar', medModal.open && medModal.name === 'Glucophage 1000 mg', JSON.stringify(medModal));
await p.evaluate(() => commitAddMedication()); await sleep(800);
const u2 = await p.evaluate(() => ({ meds: JSON.stringify(state.user.medications || []) + JSON.stringify(state.user.chronic || []) + JSON.stringify(state.user.prescriptionDrugRecords || []), closed: document.getElementById('addSupplementModal').classList.contains('hidden'), sups: state.supplements.some(s => /Glucophage/.test(s.name)) }));
log('Takviye ekle: "İlaç listeme ekle" ilacı tanınan dozuyla (1000 mg) ilaç listesine işler, takviyelere eklemez', /"Glucophage 1000 mg"/.test(u2.meds) && !/Glucophage 850/.test(u2.meds) && /metformin/.test(u2.meds) && u2.closed && !u2.sups, u2.meds.slice(0, 200));

log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
