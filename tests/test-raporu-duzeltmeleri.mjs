/* Uçtan uca test raporu (2026-11-28) düzeltmeleri: H1–H5, H16, K1, K3–K8, K10–K12.
   Çalıştırma: VT_PORT=8090 node tests/test-raporu-duzeltmeleri.mjs */
import { boot, sleep } from './lib.mjs';
import fs from 'node:fs';

const { b, p, errs } = await boot();
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });

/* H1/H4: doldurulmamış profil (bayraksız varsayılanlar) "tamamlandı" sayılmaz; ekranlar varsayılanları gerçek veri gibi göstermez */
const h1 = await p.evaluate(() => {
  const d = { ...defaultUserProfile, name: 'Deneme' };
  const r = { def: vitaProfileIsComplete(d), flagged: vitaProfileIsComplete({ ...d, profileCompleted: true }), changed: vitaProfileIsComplete({ ...d, age: 40 }) };
  state.user = { ...d }; delete state.user.profileCompleted;
  renderAllAppViews();
  r.home = document.getElementById('homeGreetingDesc').textContent;
  r.bmi = document.getElementById('homeGreetingBmi').textContent;
  r.backup = sanitizeImportedUser({ ...d }).profileCompleted;
  r.backupOld = sanitizeImportedUser({ ...d, age: 45, weight: 80 }).profileCompleted;
  return r;
});
log('Varsayılan profil tamamlanmış sayılmaz; bayrak ya da farklı değer tamamlanmış sayılır', !h1.def && h1.flagged && h1.changed, JSON.stringify({ def: h1.def, flagged: h1.flagged, changed: h1.changed }));
log('Ana sayfa varsayılanları göstermez: "Profiliniz tamamlanmadı", VKİ "—"', /Profiliniz tamamlanmadı/.test(h1.home) && !/68 kg/.test(h1.home) && h1.bmi === 'VKİ: —', h1.home.slice(0, 60) + ' | ' + h1.bmi);
log('Yedekten geri yükleme: varsayılan profil "tamamlandı" olmaz; eski yedekte gerçek değerler tamamlanmış sayılır', h1.backup === false && h1.backupOld === true, JSON.stringify([h1.backup, h1.backupOld]));

/* H1: doktor raporu */
const h1r = await p.evaluate(async () => {
  navigateToView('view-report'); await new Promise(r => setTimeout(r, 600));
  const host = document.getElementById('repSimple'); const t = host ? host.innerText : '';
  return { incomplete: /Profil tamamlanmadı/.test(t), defaults: /28 yaş/.test(t) || /168 cm/.test(t) };
});
log('Doktora Özet Raporu varsayılan yaş/boy/kiloyu basmaz', h1r.incomplete && !h1r.defaults, JSON.stringify(h1r));

/* H2: "Profili tamamla" düğmesinin zemini saydam değil */
const h2 = await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Profili tamamla' && x.getClientRects().length);
  if (!btn) return { found: false };
  const cs = getComputedStyle(btn); return { found: true, bg: cs.backgroundColor, color: cs.color };
});
log('"Profili tamamla" turuncu zeminde beyaz yazı', h2.found && h2.bg !== 'rgba(0, 0, 0, 0)' && /255, 255, 255/.test(h2.color), JSON.stringify(h2));

/* H3: koyu temada "Belirtilerimi değerlendir" koyu yazı */
const h3 = await p.evaluate(async () => {
  document.documentElement.setAttribute('data-theme', 'dark');
  navigateToView('view-labs'); await new Promise(r => setTimeout(r, 400));
  const span = [...document.querySelectorAll('button span')].find(s => /Belirtilerimi değerlendir ➔/.test(s.textContent));
  const c = span ? getComputedStyle(span).color : null;
  document.documentElement.setAttribute('data-theme', 'light');
  return c;
});
log('Koyu temada "Belirtilerimi değerlendir" yazısı koyu (gradyan zeminde okunur)', h3 === 'rgb(15, 23, 42)', h3);

/* H5: KVKK metni kurtarma kodunu anlatır */
const h5 = await p.evaluate(() => document.body.innerHTML.includes('yalnız size verilen kurtarma koduyla sıfırlanabilir') && !document.body.innerHTML.includes('şifre unutulursa sıfırlanamaz'));
log('KVKK: takma ad hesabında şifre kurtarma koduyla sıfırlanabilir (çelişki yok)', h5);

/* H16: index.html'de eşleşmeyen </div> yok */
{
  let t = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  let depth = 0, extra = 0; for (const m of t.matchAll(/<(\/?)div\b[^>]*>/g)) { if (m[1]) { if (depth) depth--; else extra++; } else depth++; }
  log('index.html: eşleşmeyen <div> yok', extra === 0 && depth === 0, JSON.stringify({ extra, depth }));
}

/* K1: ağır anemi (Hb 7) anemi örüntüsüne girer */
const k1 = await p.evaluate(() => {
  const rec = { date: new Date().toISOString().slice(0, 10), timestamp: Date.now(), hb: 7, ferritin: 5, mcv: 70, references: {} };
  state.labHistory = [rec]; state.labValues = { ...state.labValues, hb: 7, ferritin: 5, mcv: 70 };
  const titles = VitaLabInsights.analyze().patterns.map(x => x.title);
  return titles;
});
log('Hb 7 + ferritin 5 + MCV 70: "mikrositer örüntü"; "hemoglobin düşük değil" yazmaz', k1.some(t => /mikrositer/.test(t)) && !k1.some(t => /hemoglobin düşük değil/.test(t)), JSON.stringify(k1));

/* K3: büyük "İ" ile yazılan ilaç tanınır */
const k3 = await p.evaluate(() => {
  state.user.medications = ['İndapamid']; state.supplements = state.supplements || [];
  const r = getActiveUserMedicationCodesAndLabels();
  return { fold: vitaFoldLower('İndapamid') === 'indapamid' && vitaFoldLower('IBUPROFEN') === 'ibuprofen', codes: r.activeCodes };
});
log('"İndapamid" (büyük İ) diüretik olarak tanınır; IBUPROFEN → ibuprofen', k3.fold && k3.codes.includes('diuretic'), JSON.stringify(k3));

/* K4: mg/L CRP ve ng/L B12 laboratuvar referansı kabul edilir */
const k4 = await p.evaluate(() => [isVitaLabReferenceCompatible('crp', '0-5 mg/L'), isVitaLabReferenceCompatible('b12', '200-900 ng/L'), isVitaLabReferenceCompatible('crp', '0-0,5 mg/dL'), isVitaLabReferenceCompatible('hb', '120-160 g/L'), isVitaLabReferenceCompatible('crp', '0-5 g/dL')]);
log('Referans birimi: CRP mg/L, B12 ng/L, CRP mg/dL, Hb g/L kabul; CRP g/dL reddedilir', JSON.stringify(k4) === '[true,true,true,true,false]', JSON.stringify(k4));

/* K5: hızlı seçim ACE/ARB + yüksek kreatinin → RAAS böbrek uyarısı */
const k5 = await p.evaluate(() => {
  state.user.medications = []; state.user.chronic = ['ace_arb']; state.user.gender = 'E'; state.user.age = 60;
  const r = parseKidneyFunctionAndCompareMedications({ creatinine: 2.4 }, { renderUI: false });
  return JSON.stringify(r || {}).includes('RAAS');
});
log('Hızlı seçim "Tansiyon ACE / ARB" + kreatinin 2,4 → NSAİİ / RAAS böbrek uyarısı', k5);

/* K6: referanssız ferritin 900 "normal" sayılmaz */
const k6 = await p.evaluate(() => {
  state.user.chronic = [];
  state.labHistory = [{ date: new Date().toISOString().slice(0, 10), timestamp: Date.now(), ferritin: 900, references: {} }];
  state.labValues = { ...state.labValues, hb: null, mcv: null, ferritin: 900 };
  const m = VitaLabInsights.buildPanel().find(x => x.key === 'ferritin');
  return m ? m.direction : null;
});
log('Referanssız ferritin 900 ng/mL: yön "normal" değil', k6 && k6 !== 'normal', k6);

/* K7: e-posta bağlantısı formunda hata mesajı görünür */
const k7 = await p.evaluate(async () => {
  try { logoutUser && 0; } catch (e) {}
  VitaPasswordReset._setPendingTokenForTests('test-token'); VitaPasswordReset.openLinkForm();
  document.getElementById('resetLinkPassword').value = 'abcdef1'; document.getElementById('resetLinkPassword2').value = 'farkli12';
  document.getElementById('resetLinkSubmitBtn').click(); await new Promise(r => setTimeout(r, 300));
  const m = document.getElementById('resetErrorMsg');
  const r = { visible: m.getClientRects().length > 0, text: m.textContent, inLink: !!m.closest('#resetLinkForm') };
  VitaPasswordReset._setPendingTokenForTests(null); VitaPasswordReset.back();
  try { closeAuthModal(); } catch (e) {}
  return r;
});
log('Sıfırlama bağlantısı formunda "şifreler eşleşmiyor" hatası görünür', k7.visible && k7.inLink && /eşleşmiyor/.test(k7.text), JSON.stringify(k7));

/* K8: katalog takviyesinin kullanıcı saati yeniden hesaplamada korunur */
const k8 = await p.evaluate(() => {
  const fk = Object.keys(FORM_DOSAGE_CONFIG)[0]; const form = Object.keys(FORM_DOSAGE_CONFIG[fk].forms)[0];
  state.supplements = [{ id: 'sup_k8', name: 'Deneme', formKey: fk, selectedForm: form, timing: 'Akşam', kalanAdet: 30, toplamKutuAdedi: 30, gunlukDoz: 1 }];
  recalculateSupplementsForNewWeight(); renderAllAppViews();
  return state.supplements[0].timing;
});
log('Katalog takviyesinin "Akşam" saati yenilemede korunur', k8 === 'Akşam', k8);

/* K10: HbA1c 5,65 ve glukoz 99,5 ADA'ya göre normal; 5,7 prediyabet */
const k10 = await p.evaluate(() => [evaluateVitaExtraLab('hba1c', 5.65).status, evaluateVitaExtraLab('glucose', 99.5).status, evaluateVitaExtraLab('hba1c', 5.7).statusText]);
log('HbA1c 5,65 ve glukoz 99,5 "referans aralığında"; 5,7 "Prediyabet"', k10[0] === 'in_ref' && k10[1] === 'in_ref' && /Prediyabet/.test(k10[2]), JSON.stringify(k10));

/* K12: ilk sekmede sağa kaydırma (−1) ilk sekmede kalır */
const k12 = await p.evaluate(() => { if (!window.VitaHomeTabs) return null; VitaHomeTabs.show(-1); return VitaHomeTabs.current(); });
log('Ana Sayfa sekmeleri: show(-1) ilk sekmede kalır', k12 === 0, String(k12));

log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
const okc = results.filter(Boolean).length;
console.log(`ÖZET ${okc}/${results.length} geçti`);
await b.close();
process.exit(okc === results.length ? 0 : 1);
