/* Klinik mantık ve arayüz yükseltmesi (6 görev) — doğrulama listesi.
   Lab 1 (16.11.2026) tam panel + 8 yeni gösterge, Lab 2 (20.11.2026) kısmi hemogram. */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
p.setDefaultTimeout(30000); p.on('dialog', d => d.dismiss());
await p.evaluate(() => closeProfileModal()); await sleep(1000);
await p.evaluate(() => document.getElementById('vitaSpotlightLayer')?.classList.add('hidden'));
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };

await p.evaluate(() => { openProfileModal(false); document.getElementById('modalInputAge').value = 35; document.getElementById('modalInputGender').value = 'E'; document.getElementById('modalInputHeight').value = 178; document.getElementById('modalInputWeight').value = 75; document.getElementById('modalChronicNone').checked = true; saveUserProfileFromModal(); }); await sleep(500);

/* ---- Görev 2: elle giriş varsayılan kapalı (telefon) ---- */
await p.evaluate(() => navigateToView('view-labs')); await sleep(400);
const G2m = await p.evaluate(() => {
  const d = document.getElementById('labManualEntry');
  const hist = [...document.querySelectorAll('#view-labs h3')].find(h => /Geçmiş tahlillerim/i.test(h.textContent));
  return { open: d.open, summary: d.querySelector('summary').textContent.trim(), histTop: Math.round(hist.getBoundingClientRect().top + scrollY), pdfFirst: !!document.querySelector('#labHeroActions button[onclick*="openENabizModal"]') };
});
log('Elle giriş bölümü varsayılan KAPALI, başlık doğru', !G2m.open && /PDF'in yok mu\? Değerleri elle gir/.test(G2m.summary), G2m.summary);
log('PDF yükleme düğmesi en üstte (bölüm dışında)', G2m.pdfFirst);
log('Telefonda "Geçmiş tahlillerim" kısa kaydırmayla görünür (<1100px)', G2m.histTop < 1100, String(G2m.histTop));

/* ---- Görev 5B: bağlam etiketi seçimi + kayıt ---- */
const saveLab = (date, vals, tags = []) => p.evaluate((date, vals, tags) => {
  navigateToView('view-labs');
  document.getElementById('labManualEntry').open = true;
  for (const el of document.querySelectorAll('[id^="inputLab"]')) if (!el.id.includes('Date') && !el.id.startsWith('inputLabRef')) el.value = '';
  document.getElementById('inputLabDate').value = date;
  for (const t of tags) document.querySelector(`#manualLabContextTags [data-lab-ctx="${t}"]`).click();
  for (const [id, v] of Object.entries(vals)) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
  saveCurrentLabRecordWithDate();
}, date, vals, tags);

const chips = await p.evaluate(() => ({ manual: document.querySelectorAll('#manualLabContextTags [data-lab-ctx]').length, pdf: document.querySelectorAll('#pdfLabContextTags [data-lab-ctx]').length }));
log('Etiket çipleri hem elle girişte hem PDF penceresinde (4+4)', chips.manual === 4 && chips.pdf === 4, JSON.stringify(chips));
const excl = await p.evaluate(() => { toggleLabContextTag('Su içerek gittim'); toggleLabContextTag('Susuzdum'); const on = [...document.querySelectorAll('#manualLabContextTags .is-on')].map(e => e.textContent.trim()); toggleLabContextTag('Susuzdum'); return on; });
log('"Su içerek gittim" ile "Susuzdum" birlikte seçilemez', excl.length === 1 && /Susuzdum/.test(excl[0]), excl.join(','));

// Önce YENİ tahlil, sonra ESKİ tahlil kaydedilir: sıralama kayıt anına değil tahlil tarihine göre olmalı.
await saveLab('2026-11-20', { inputLabHb: '16.5', inputLabRbc: '5.50', inputLabHct: '45.7', inputLabMcv: '83.1' }, ['Su içerek gittim']); await sleep(600);
await saveLab('2026-11-16', { inputLabD3: '24.8', inputLabB12: '399', inputLabFerritin: '71', inputLabHb: '17.7', inputLabMcv: '81.3', inputLabRbc: '5.88', inputLabHct: '47.8', inputLabWbc: '9.65', inputLabPlt: '309', inputLabRdw: '12.6', inputLabTsh: '2.93', inputLabHba1c: '5.3', inputLabGlucose: '91' }, ['Aç karnına', 'Susuzdum']); await sleep(600);

/* ---- Görev 1 + 3: birleşik panel ---- */
const merged = await p.evaluate(() => { const m = getMergedActiveLabs(); const o = { newest: m.newestDate }; for (const k of ['hb', 'd3', 'ferritin', 'b12', 'tsh', 'rbc', 'hct', 'wbc', 'plt', 'rdw', 'hba1c', 'glucose']) o[k] = m.labs[k] && { v: m.labs[k].value, d: m.labs[k].date, older: m.labs[k].older, prev: m.labs[k].prev }; return o; });
log('En yeni tahlil tarihe göre 20.11', merged.newest === '2026-11-20', merged.newest);
log('HGB 16.5 (20.11), önceki 17.7 (16.11)', merged.hb?.v === 16.5 && merged.hb?.prev?.v === undefined && merged.hb?.prev?.value === 17.7, JSON.stringify(merged.hb));
log('D 24.8, B12 399, Ferritin 71, TSH 2.93 korunur (16.11, eski tarihli)', merged.d3?.v === 24.8 && merged.b12?.v === 399 && merged.ferritin?.v === 71 && merged.tsh?.v === 2.93 && merged.tsh.older && !merged.hb.older);
log('8 yeni gösterge kaydedildi ve birleşti (RBC/HCT 20.11, diğerleri 16.11)',
  merged.rbc?.v === 5.5 && merged.hct?.v === 45.7 && merged.wbc?.v === 9.65 && merged.plt?.v === 309 && merged.rdw?.v === 12.6 && merged.hba1c?.v === 5.3 && merged.glucose?.v === 91 && merged.rbc.prev?.value === 5.88,
  JSON.stringify({ rbc: merged.rbc, wbc: merged.wbc }));

/* ---- Görev 3: sınıflandırma, aralık penceresi, PDF ---- */
const cls = await p.evaluate(() => ({
  a1cPre: KDSSRuleEngine.evaluate('hba1c', 6.0, 'E').statusText, a1cDm: KDSSRuleEngine.evaluate('hba1c', 7.1, 'E').isHigh,
  gluOk: KDSSRuleEngine.evaluate('glucose', 91, 'E').status, gluHigh: KDSSRuleEngine.evaluate('glucose', 130, 'E').isHigh,
  pltUrgent: KDSSRuleEngine.evaluate('plt', 30, 'E').status, tshLabRef: KDSSRuleEngine.evaluate('tsh', 4.5, 'E', '0.27-4.2 uIU/mL').referenceSource,
  rangeFields: [...document.querySelectorAll('#vitaLabRangeFields input')].map(i => i.id).filter(id => /rbc$|hct|wbc|plt|rdw|tsh|hba1c|glucose/.test(id)).length
}));
log('HbA1c 6,0 prediyabet, 7,1 yüksek; glukoz 91 normal, 130 yüksek', /Prediyabet/.test(cls.a1cPre) && cls.a1cDm && cls.gluOk === 'in_ref' && cls.gluHigh, JSON.stringify(cls));
log('PLT 30 acil; TSH laboratuvar aralığı kullanılır', cls.pltUrgent === 'urgent' && cls.tshLabRef === 'lab');
log('"Aralıkları Özelleştir" penceresinde 8 yeni gösterge', cls.rangeFields === 8, String(cls.rangeFields));
// Video bulgusu: "10^3/µL" birimli laboratuvar aralıkları geçmişte "Aralık yok" görünüyordu
const hist = await p.evaluate(() => {
  const rec = { date: '2026-08-18', genderAtTest: 'E', rbc: 5.56, wbc: 7.34, plt: 288, references: { rbc: '4 - 5.5 10^6/µL', wbc: '4 - 10 10^3/µL', plt: '100 - 400 10^3/µL' } };
  const m = k => { const x = getLabHistoryMetric(rec, LAB_HISTORY_METRICS.find(mm => mm.key === k)); return x.status + '/' + x.referenceSource; };
  const noRef = getLabHistoryMetric({ date: '2026-08-18', plt: 288, references: {} }, LAB_HISTORY_METRICS.find(mm => mm.key === 'plt'));
  return { rbc: m('rbc'), wbc: m('wbc'), plt: m('plt'), pltApp: noRef.status + '/' + noRef.referenceSource };
});
log('Geçmiş: 10^n/µL birimli lab aralığı okunur (RBC 5,56 > 5,5 referans dışı; WBC, PLT normal)', hist.rbc === 'outside/lab' && hist.wbc === 'within/lab' && hist.plt === 'within/lab' && hist.pltApp === 'within/app', JSON.stringify(hist));

const pdf = await p.evaluate(() => {
  parseReconstructedLabLines([
    'Rapor Tarihi: 16.11.2026', 'HGB Hemoglobin 16.5 g/dL 13.5-17.5', 'RBC Eritrosit 5.50 10^6/uL 4.5-5.9', 'HCT Hematokrit % 45.7 40-52',
    'MCV 83.1 fL 80-100', 'RDW-SD 41.2 fL 39-46', 'RDW-CV 12.6 % 11.5-14.5', 'WBC Lökosit 9.65 10^3/uL 4-10', 'MPV Ortalama trombosit hacmi 10.1 fL 7-11',
    'PLT Trombosit 309 10^3/uL 150-400', 'TSH 2.93 uIU/mL 0.27-4.2', 'HbA1c (IFCC) 34 mmol/mol 20-42', 'HbA1c % 5.3 4-6',
    'İdrar Glukoz Negatif', 'Glukoz (açlık) 91 mg/dL 74-106', 'Eritrosit Sedimantasyon Hızı 8 mm/saat 0-20'
  ]);
  const r = temporarilyParsedLabResults || {};
  return Object.fromEntries(['hb', 'rbc', 'hct', 'mcv', 'rdw', 'wbc', 'plt', 'tsh', 'hba1c', 'glucose'].map(k => [k, r[k] ? r[k].value + ' | ' + r[k].reference : null]));
});
const pv = k => Number(String(pdf[k] || '').split(' | ')[0]);
log('PDF: 8 yeni gösterge doğru okunur (RDW-SD, MPV, IFCC, idrar glukozu, sedimantasyon karışmaz)',
  pv('rbc') === 5.5 && pv('hct') === 45.7 && pv('rdw') === 12.6 && pv('wbc') === 9.65 && pv('plt') === 309 && pv('tsh') === 2.93 && pv('hba1c') === 5.3 && pv('glucose') === 91 && pv('hb') === 16.5,
  JSON.stringify(pdf));
await p.evaluate(() => { try { closeENabizModal(); } catch (_) {} });

/* ---- NeyimVar: tırnak belirtisi + Görev 6 ---- */
await p.evaluate(() => navigateToView('view-neyim')); await sleep(300);
const G6 = await p.evaluate(() => {
  const where = k => { const c = [...document.querySelectorAll('.anamnesis-card')].find(c => (c.getAttribute('onclick') || '').includes(`'${k}'`)); return c ? c.closest('[id^="anamnesis-panel-"]')?.id + ' | ' + c.querySelector('h4').textContent : null; };
  return { a: where('morning_fatigue'), b: where('restless_legs'), c: where('pallor_dark_circles') };
});
log('3 yeni belirti doğru adımlarda (B, D, F)', /cat-B \| Yeterli uyusam bile/.test(G6.a || '') && /cat-D \| .*Huzursuz bacak/.test(G6.b || '') && /cat-F \| Cildimde veya göz içimde/.test(G6.c || ''), JSON.stringify(G6));
await p.evaluate(() => document.querySelectorAll('.anamnesis-card').forEach(c => { const m = (c.getAttribute('onclick') || '').match(/toggleAnamnesisCard\(this,\s*'([^']+)'\)/); if (m && m[1] === 'brittle_nails') c.click(); })); await sleep(300);
await p.evaluate(() => navigateToView('view-clinical-results')); await sleep(1500);

const C = await p.evaluate(() => {
  const host = document.getElementById('view-clinical-results');
  const tests = [...host.querySelectorAll('#vsTests .vs-test-name')].map(e => e.textContent.trim());
  const notes = [...host.querySelectorAll('.vs-normal-note')].map(e => e.textContent.trim());
  const order = [...host.querySelectorAll('section.vs-card')].map(s => s.id || s.querySelector('h3')?.textContent.trim().slice(0, 20));
  return { text: host.textContent, tests, notes, tags: [...host.querySelectorAll('.vs-date-tag')].map(e => e.textContent.trim()), order, rel: [...host.querySelectorAll('#vsRelations .vs-warn-t')].map(e => e.textContent.trim()) };
});
log('Klinik Analiz: HGB 16,5 ve D vitamini 24,8, TSH 2,93 birlikte', /16[,.]5/.test(C.text) && /24[,.]8/.test(C.text) && /2[,.]93/.test(C.text));
log('Klinik Analiz: eski tarihli değerlerde 16.11.2026 etiketi', C.tags.includes('16.11.2026'), C.tags.length + ' etiket');
const d3row = await p.evaluate(() => [...document.querySelectorAll('#view-clinical-results .vs-val')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).find(t => /Vitamin D/.test(t)) || '');
log('D vitamini 24,8 (30 altı) "Düşük" görünür', /24[,.]8/.test(d3row) && /Düşük/.test(d3row), d3row);
log('Ferritin istenmez, Çinko istenir', !C.tests.some(t => /ferritin/i.test(t)) && C.tests.some(t => /çinko/i.test(t)), C.tests.join(' | '));
log('"Ferritin: Son 90 günde normal ölçüldü (16.11.2026: 71)" notu', C.notes.some(n => /Ferritin: Son 90 günde normal ölçüldü \(16\.11\.2026: 71\)/.test(n)), C.notes.join(' | '));
log('TSH artık 90 günde normal ölçüldüğü için istenmez', !C.tests.some(t => /tsh/i.test(t)) && C.notes.some(n => /TSH/.test(n)), C.tests.join(' | '));
const iT = C.order.indexOf('vsTests'), iP = iT + 1;
const prelabInDetails = await p.evaluate(() => !!document.querySelector('#vsTests details:not([open]) #vsPrelab'));
log('"Kan Vermeye Gitmeden Önce" testler kartının altında kapalı çekmecede', iT >= 0 && iP > iT && prelabInDetails, C.order.join(' > '));
const prelab = await p.evaluate(() => document.getElementById('vsPrelab').textContent);
log('Hazırlık kartı 4 madde + hekim notu', /8–12 saat açlık/.test(prelab) && /Sabah su için/.test(prelab) && /Çay ve kahve içmeyin/.test(prelab) && /biotin/.test(prelab) && /Hekiminizin özel talimatları her zaman önceliklidir/.test(prelab));
const inlinePre = await p.evaluate(() => document.querySelector('#labPrelabGuide [data-prelab-guide]').innerText);
log('Tahlillerim: "Kan vermeye mi gideceksin?" yardımcısı dolu', /Sabah su için/.test(inlinePre));

/* ---- Görev 4: ilişki kuralları (kendi değerleriyle) ---- */
const rel = await p.evaluate(() => {
  const keep = state.labHistory; const g = state.user.gender;
  const run = (rec, gender = 'E') => { state.user.gender = gender; state.labHistory = [{ id: 'x', date: '2026-11-18', timestamp: Date.parse('2026-11-18'), references: {}, ...rec }]; const t = VitaLabInsights.analyze().patterns.map(p => p.title + ' :: ' + p.text); return t; };
  const out = {
    mixed: run({ rdw: 16.2, mcv: 88, hb: 13.8, ferritin: 40 }),
    macro: run({ mcv: 104, hb: 12.1, b12: 250, hcy: 19 }),
    dmg: run({ d3: 15, mg: 1.5 }),
    wbc: run({ wbc: 14.5, ferritin: 90, crp: 2 }),
    tsh: run({ tsh: 7.2, ferritin: 25, d3: 18, b12: 300 }),
    hydra: run({ hb: 18.2, rbc: 6.1, hct: 53 }),
    hydraWater: (() => { const r = run({ hb: 18.2, rbc: 6.1, hct: 53, contextTags: ['Su içerek gittim'] }); return r; })()
  };
  state.labHistory = keep; state.user.gender = g; return out;
});
const any = (arr, re) => arr.some(t => re.test(t));
log('RDW yüksek + MCV normal → mikst anemi uyarısı', any(rel.mixed, /mikst anemi/), rel.mixed.join(' || ').slice(0, 200));
log('MCV >100 megaloblastik + B12 sınırda & homosistein yüksek → işlevsel eksiklik', any(rel.macro, /makrositoz/i) && any(rel.macro, /işlevsel eksiklik/));
log('Düşük D + düşük Mg → aktivasyon notu', any(rel.dmg, /aktif biçimine dönüşmesi/));
log('WBC yüksek → ferritin akut faz maskeleme uyarısı', any(rel.wbc, /akut faz reaktanıdır/));
log('TSH yüksek → ferritin, D, B12, çinko kofaktörleri', any(rel.tsh, /TSH yüksek.*Ferritin.*D vitamini.*B12/s));
log('Hb + RBC + HCT yüksek → su/hemokonsantrasyon notu', any(rel.hydra, /Yeterli su içmeden verilen tahlillerde hemoglobin/));
log('"Su içerek gittim" etiketliyken su notu çıkmaz', !any(rel.hydraWater, /Yeterli su içmeden/));

/* ---- Doktor özet raporu ---- */
await p.evaluate(() => navigateToView('view-report')); await sleep(1200);
const R = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#repSimple .rs-tbl tbody tr')].map(tr => [...tr.cells].map(c => c.innerText.trim())), ctx: document.querySelector('#repSimple .rs-ctx')?.innerText || '' }));
const row = name => R.rows.find(r => r[0].toLocaleLowerCase('tr-TR').includes(name)) || [];
log('Rapor: Hemoglobin 16,5, önceki 17,7', /16[,.]5/.test(row('hemoglobin')[1] || '') && /17[,.]7/.test(row('hemoglobin')[4] || ''), JSON.stringify(row('hemoglobin')));
log('Rapor: D 24,8 (16.11.2026), Ferritin 71, B12 399, TSH 2,93', /24[,.]8/.test(row('vitamin d')[1] || '') && /16\.11\.2026/.test(row('vitamin d')[1] || '') && /71/.test(row('ferritin')[1] || '') && /399/.test(row('b12')[1] || '') && /2[,.]93/.test(row('tsh')[1] || ''), JSON.stringify(row('tsh')));
log('Rapor: en yeni tahlilin koşul rozeti (20.11: Su içerek gittim)', /20\.11\.2026/.test(R.ctx) && /Su içerek gittim/.test(R.ctx), R.ctx);

/* ---- Görev 5B: etiketler yenilemeden sonra kalır + geçmişte rozet ---- */
await p.reload({ waitUntil: 'networkidle2' }); await sleep(2500);
const after = await p.evaluate(() => { navigateToView('view-labs'); return { tags: (state.labHistory || []).map(r => r.date + ':' + (r.contextTags || []).slice().sort().join('+')).sort(), badges: [...document.querySelectorAll('#labHistoryListContainer .vita-ctx-badge')].map(e => e.textContent.trim()) }; });
log('contextTags yenilemeden sonra korunur', after.tags.includes('2026-11-16:Aç karnına+Susuzdum') && after.tags.includes('2026-11-20:Su içerek gittim'), after.tags.join(' , '));
log('Geçmiş tahlillerimde etiket rozetleri', after.badges.includes('Susuzdum') && after.badges.includes('Su içerek gittim'), after.badges.join(','));

/* ---- Görev 2: masaüstünde 5 sütun, rounded-2xl ---- */
await p.setViewport({ width: 1280, height: 900 }); await sleep(300);
const G2d = await p.evaluate(() => { const d = document.getElementById('labManualEntry'); d.open = true; const g = document.getElementById('labManualGrid'); const cs = getComputedStyle(g); return { cols: cs.gridTemplateColumns.split(' ').length, radius: getComputedStyle(g.children[0]).borderRadius, cards: g.children.length }; });
log('Masaüstü: 5 sütunlu ızgara, 16px yuvarlak köşe, 22 kart', G2d.cols === 5 && G2d.radius === '16px' && G2d.cards === 22, JSON.stringify(G2d));
await p.setViewport({ width: 400, height: 850 }); await sleep(200);
const ov = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
log('Telefonda yatay taşma yok', ov);

log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
await b.close();
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} geçti`);
process.exit(failed ? 1 : 0);
