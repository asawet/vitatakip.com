/* e-Nabız PDF yükleme → ayrıştırma → kayıt → klinik kurallar (uçtan uca).
   Sentetik raporlar: tests/fixtures/ornek-enabiz-A.pdf (02.10.2026) ve -B.pdf (25.09.2026); gerçek hasta verisi yoktur.
   Yeniden üretmek için: node tests/fixtures/make-enabiz-fixtures.mjs */
import { boot, sleep } from './lib.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from './fixtures/make-enabiz-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const allErrs = [];

async function session() {
  const s = await boot();
  s.p.setDefaultTimeout(60000); s.p.on('dialog', d => d.dismiss());
  await s.p.evaluate(() => closeProfileModal()); await sleep(800);
  await s.p.evaluate(() => document.getElementById('vitaSpotlightLayer')?.classList.add('hidden'));
  await s.p.evaluate(() => { openProfileModal(false); document.getElementById('modalInputAge').value = 36; document.getElementById('modalInputGender').value = 'E'; document.getElementById('modalInputHeight').value = 178; document.getElementById('modalInputWeight').value = 76; document.getElementById('modalChronicNone').checked = true; saveUserProfileFromModal(); });
  await sleep(400);
  return s;
}

async function upload(p, name) {
  await p.evaluate(() => { navigateToView('view-labs'); openENabizModal(); temporarilyParsedLabResults = {}; });
  await sleep(300);
  await (await p.$('#eNabizPdfInput')).uploadFile(path.join(here, 'fixtures', name));
  await p.waitForFunction(() => Object.keys(temporarilyParsedLabResults || {}).length > 0, { timeout: 60000 });
  await sleep(800);
  const parsed = await p.evaluate(() => ({ date: temporarilyParsedPdfDate, vals: Object.fromEntries(Object.entries(temporarilyParsedLabResults).map(([k, v]) => [k, { value: Number(v.value), ref: v.reference || '' }])) }));
  await p.evaluate(() => applyParsedPdfValues()); await sleep(1200);
  return parsed;
}

function checkParsed(name, parsed) {
  const fx = FIXTURES[name];
  const iso = fx.date.split('.').reverse().join('-');
  log(`${name}: rapor tarihi ${fx.date}`, parsed.date === iso, parsed.date);
  const wrong = Object.entries(fx.expect).filter(([k, v]) => parsed.vals[k]?.value !== v).map(([k, v]) => `${k}: beklenen ${v}, okunan ${parsed.vals[k]?.value ?? 'yok'}`);
  log(`${name}: ${Object.keys(fx.expect).length} gösterge birebir doğru okundu`, wrong.length === 0, wrong.join('; '));
  const extra = Object.keys(parsed.vals).filter(k => !(k in fx.expect));
  log(`${name}: rapor dışı/tuzak satırdan değer uydurulmadı`, extra.length === 0, extra.join(','));
  const noRef = Object.entries(parsed.vals).filter(([, v]) => !v.ref).map(([k]) => k);
  log(`${name}: her göstergenin laboratuvar aralığı da okundu`, noRef.length === 0, noRef.join(','));
}

async function clinical(p) {
  await p.evaluate(() => navigateToView('view-clinical-results')); await sleep(1600);
  return p.evaluate(() => ({
    patterns: VitaLabInsights.analyze().patterns.map(x => x.title),
    rel: [...document.querySelectorAll('#vsRelations .vs-warn-t')].map(e => e.innerText.trim()),
    bad: [...document.querySelectorAll('#view-clinical-results .vs-val')].map(e => e.innerText.replace(/\s+/g, ' ').trim()),
    tests: [...document.querySelectorAll('#vsTests .vs-test-name')].map(e => e.textContent.trim()),
    kidneyAlarm: /böbrek/i.test(document.querySelector('.vs-safety')?.textContent || ''),
    hist: (state.labHistory || []).map(rec => LAB_HISTORY_METRICS.map(mm => getLabHistoryMetric(rec, mm)).filter(Boolean).map(x => [x.key, x.status, x.referenceSource]))
  }));
}
const has = (arr, re) => arr.some(t => re.test(t));

/* ---------- Rapor A: B12/folat + makrositer örüntü ---------- */
{
  const { b, p, errs } = await session();
  const parsed = await upload(p, 'ornek-enabiz-A.pdf');
  checkParsed('ornek-enabiz-A.pdf', parsed);
  const C = await clinical(p);
  const allLab = C.hist.flat().every(([, , src]) => src === 'lab');
  log('A: geçmişte tüm göstergeler PDF aralığıyla değerlendirilir (10*9/L, 10 *12/L dahil)', allLab, JSON.stringify(C.hist.flat().filter(([, , s]) => s !== 'lab')));
  const st = Object.fromEntries(C.hist.flat().map(([k, s]) => [k, s]));
  log('A: RBC 3,55 / PLT 182 / WBC 5,10 doğru sınıflanır (dışı / normal / normal)', st.rbc === 'outside' && st.plt === 'within' && st.wbc === 'within', JSON.stringify({ rbc: st.rbc, plt: st.plt, wbc: st.wbc }));
  log('A: düşük Hb + yüksek MCV (makrositer örüntü)', has(C.patterns, /yüksek MCV \(makrositer/));
  log('A: MCV >100 megaloblastik eğilim', has(C.patterns, /MCV 100 fL üzerinde/));
  log('A: B12 düşük + homosistein yüksek → işlevsel eksiklik', has(C.patterns, /B12 düşük\/sınırda \+ homosistein yüksek/));
  log('A: D vitamini + magnezyum birlikte düşük', has(C.patterns, /D vitamini ve magnezyum birlikte düşük/));
  log('A: CRP yüksek → ferritin yorumu', has(C.patterns, /CRP yüksek: ferritin/));
  log('A: TSH yüksek → tiroid ve mikro besinler', has(C.patterns, /TSH yüksek/));
  log('A: HbA1c %6,1 (lab üst sınırı 6) → kan şekeri notu', has(C.patterns, /Kan şekeri göstergeleri yüksek/));
  log('A: ALT yüksek', has(C.patterns, /ALT yüksek/));
  log('A: ilişkiler Klinik Analiz kartında görünür', C.rel.length === C.patterns.length && C.rel.length >= 8, C.rel.length + ' / ' + C.patterns.length);
  log('A: istenecek testlerde MMA ve serbest T4 var', has(C.tests, /Metilmalonik/) && has(C.tests, /T4/), C.tests.join(' | '));
  log('A: spot idrar albümin/kreatinin satırı yüzünden yanlış böbrek alarmı yok', !C.kidneyAlarm);
  log('A: sayfa hatası yok', errs.length === 0, errs.join(' | '));
  allErrs.push(...errs);
  await b.close();
}

/* ---------- Rapor B: karma anemi + su durumu ---------- */
{
  const { b, p, errs } = await session();
  const parsed = await upload(p, 'ornek-enabiz-B.pdf');
  checkParsed('ornek-enabiz-B.pdf', parsed);
  let C = await clinical(p);
  log('B: RDW yüksek + MCV normal → mikst anemi', has(C.patterns, /karma eksiklik/));
  log('B: lökosit yüksek, CRP normal → ferritin maskeleme', has(C.patterns, /Lökosit yüksek: ferritin/));
  log('B: TSH düşük', has(C.patterns, /TSH düşük/));
  log('B: Hb + RBC + HCT yüksek → su durumu notu (etiketsiz)', has(C.patterns, /su durumu/));
  log('B: açlık glukozu 131 → kan şekeri notu', has(C.patterns, /Kan şekeri göstergeleri yüksek/));
  log('B: D düşük, Mg normal → kofaktör notu', has(C.patterns, /magnezyum referans içinde/));
  log('B: Değerlerim\'de Hb, RBC ve glukoz yüksek görünür', has(C.bad, /Hemoglobin.*Yüksek/) && has(C.bad, /Eritrosit.*Yüksek/) && has(C.bad, /Glukoz.*Yüksek/), C.bad.join(' | '));

  /* "Su içerek gittim" işaretlenirse su notu kalkar */
  await p.evaluate(() => { const r = state.labHistory.find(x => x.date === '2026-09-25'); r.contextTags = ['Su içerek gittim']; saveState(); });
  C = await clinical(p);
  log('B: "Su içerek gittim" etiketiyle su notu çıkmaz', !has(C.patterns, /su durumu/));

  /* Rapor A da yüklenince: 90 günlük birleşik panel A'yı (daha yeni) esas alır, B yalnızca A'da olmayanı tamamlar */
  await upload(p, 'ornek-enabiz-A.pdf');
  const m = await p.evaluate(() => { const x = getMergedActiveLabs(); return { newest: x.newestDate, hb: x.labs.hb?.value, hbPrev: x.labs.hb?.prev?.value, wbc: x.labs.wbc?.value }; });
  log('A + B: en yeni tahlil 02.10 esas alınır, önceki ölçüm B\'den gelir', m.newest === '2026-10-02' && m.hb === 12.1 && m.hbPrev === 17.9 && m.wbc === 5.1, JSON.stringify(m));
  log('B: sayfa hatası yok', errs.length === 0, errs.join(' | '));
  await b.close();
}

const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} geçti`);
process.exit(failed ? 1 : 0);
