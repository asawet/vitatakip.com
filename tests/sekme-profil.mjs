/* Giriş "Hızlı Giriş" kontrastı, 3 aşamalı Profil Düzenle, Ana Sayfa Takviyelerim/İlaçlarım kaydırmalı sekmeleri,
   Günlük özet göstergeleri: Vitamin / İlaç sekmeleri ve ayrı İlaç Skoru. */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot({});
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(30000); p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-home'); });
await sleep(400);

/* 1) Hızlı Giriş kontrastı */
const qc = await p.evaluate(() => {
  const btn = document.getElementById('btnQuickLoginRemembered'); const cs = getComputedStyle(btn);
  const rgb = s => s.match(/\d+/g).slice(0, 3).map(Number);
  const lum = c => { const a = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  const L1 = lum(rgb(cs.color)), L2 = lum(rgb(cs.backgroundColor));
  return { bg: cs.backgroundColor, fg: cs.color, ratio: Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 10) / 10 };
});
log('"Hızlı Giriş" koyu zümrüt zemin + beyaz yazı (kontrast ≥ 4.5:1)', qc.ratio >= 4.5 && qc.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(qc));

/* 2) Profil Düzenle: 3 aşama */
await p.evaluate(() => openProfileModal(true)); await sleep(300);
const vis = id => { const el = document.getElementById(id); return !!el && el.getClientRects().length > 0; };
const s1 = await p.evaluate(v => { const vis = eval(v); return { tabs: Array.from(document.querySelectorAll('#profileModal .vpst-tab')).map(t => t.innerText.replace(/\s+/g, ' ').trim()), on: document.querySelector('#profileModal .vpst-tab.is-on')?.innerText.replace(/\s+/g, ' ').trim(),
  s1: ['profilePhotoRow', 'modalInputName', 'modalInputAge', 'modalInputGender', 'modalInputHeight', 'modalInputWeight'].every(vis),
  s2hidden: !['modalInputActivity', 'modalPregnancyStatus', 'modalDietPattern', 'modalFishPerWeek', 'modalSunExposure'].some(vis), s3hidden: !vis('modalCustomMedications'),
  next: vis('btnProfileStepNext'), save: vis('btnProfileSave'), back: vis('btnProfileStepBack') }; }, '(' + vis.toString() + ')');
log('Üstte 3 adım: 1 Kişisel · 2 Yaşam Tarzı · 3 Kronik & İlaçlar', s1.tabs.join('|') === '1 Kişisel|2 Yaşam Tarzı|3 Kronik & İlaçlar' && /^1/.test(s1.on), JSON.stringify(s1.tabs));
log('1. aşama: fotoğraf, ad, yaş, cinsiyet, boy, kilo; diğer aşamalar gizli; yalnızca "Devam Et"', s1.s1 && s1.s2hidden && s1.s3hidden && s1.next && !s1.save && !s1.back, JSON.stringify(s1));
const keepName = await p.evaluate(() => modalInputName.value);
await p.evaluate(() => { modalInputName.value = ''; document.getElementById('btnProfileStepNext').click(); });
const blocked = await p.evaluate(() => ({ step: VitaProfileSteps.current(), invalid: modalInputName.classList.contains('vpst-invalid') }));
log('Zorunlu alan boşsa "Devam Et" ilerlemez ve alanı işaretler', blocked.step === 0 && blocked.invalid, JSON.stringify(blocked));
await p.evaluate(n => { modalInputName.value = n; document.getElementById('btnProfileStepNext').click(); }, keepName);
const s2 = await p.evaluate(v => { const vis = eval(v); return { ok: ['modalInputActivity', 'modalPregnancyStatus', 'modalDietPattern', 'modalFishPerWeek', 'modalSunExposure'].every(vis), redMeat: !!document.querySelector('#profileStep2 select[id*="RedMeat"], #profileStep2 select[id*="redMeat"], #profileStep2 [for*="RedMeat"]'), s1hidden: !vis('modalInputName'), next: vis('btnProfileStepNext'), back: vis('btnProfileStepBack'), save: vis('btnProfileSave') }; }, '(' + vis.toString() + ')');
log('2. aşama: aktivite, gebelik/emzirme, beslenme, balık, kırmızı et, güneşlenme; "Geri" + "Devam Et"', s2.ok && s2.redMeat && s2.s1hidden && s2.next && s2.back && !s2.save, JSON.stringify(s2));
await p.evaluate(() => document.getElementById('btnProfileStepNext').click());
const s3 = await p.evaluate(v => { const vis = eval(v); const save = document.getElementById('btnProfileSave'); const r = save.getBoundingClientRect(); return { chronic: document.querySelectorAll('#profileStep3 input[name="modal_chronic"]').length, meds: vis('modalCustomMedications'), save: vis('btnProfileSave'), next: vis('btnProfileStepNext'), saveText: save.innerText.trim(), inView: r.bottom <= innerHeight && r.top >= 0 }; }, '(' + vis.toString() + ')');
log('3. aşama: kalkan seçimleri, kronik durumlar, diğer ilaçlar; "Profili Kaydet ve Güncelle" altta sabit ve görünür', s3.chronic >= 8 && s3.meds && s3.save && !s3.next && s3.saveText === 'Profili Kaydet ve Güncelle' && s3.inView, JSON.stringify(s3));
await p.evaluate(() => { modalInputWeight.value = '71'; document.getElementById('btnProfileSave').click(); }); await sleep(500);
const saved = await p.evaluate(() => ({ closed: document.getElementById('profileModal').classList.contains('hidden') || getComputedStyle(document.getElementById('profileModal')).display === 'none', w: state.user.weight }));
log('Son aşamada kaydedince profil güncellenir', saved.closed && Number(saved.w) === 71, JSON.stringify(saved));
await p.evaluate(() => { openProfileModal(true); });
const reopen = await p.evaluate(() => VitaProfileSteps.current());
await p.evaluate(() => { VitaProfileSteps.go(2); modalInputAge.value = '300'; saveUserProfileFromModal(); });
const backTo1 = await p.evaluate(() => ({ step: VitaProfileSteps.current() }));
await p.evaluate(() => { modalInputAge.value = '28'; closeProfileModal(); });
log('Her açılış 1. aşamadan başlar; kayıtta 1. aşama hatalıysa oraya dönülür', reopen === 0 && backTo1.step === 0, JSON.stringify({ reopen, backTo1 }));

/* 3) Ana sayfa: Takviyelerim ⇄ İlaçlarım */
await p.evaluate(() => {
  addVitaMedication({ name: 'Euthyrox 50 mcg', frequency: 'gunde2', clocks: ['09:00', '20:00'], unit: 'tablet' });
  state.supplements.push({ id: 'st1', name: 'Sekme D3', timing: 'Sabah', scheduleTime: '08:00', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: true, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() });
  saveState(); navigateToView('view-home'); renderDailyTab(); VitaHomeTabs.show(0);
}); await sleep(500);
const h0 = await p.evaluate(() => {
  const wrap = document.getElementById('homeCareTabs'), vp = wrap.querySelector('.vhs-viewport').getBoundingClientRect();
  const sup = document.getElementById('todaySupsCard').getBoundingClientRect(), med = document.getElementById('todayMedsCard').getBoundingClientRect();
  return { both: wrap.contains(document.getElementById('todaySupsCard')) && wrap.contains(document.getElementById('todayMedsCard')), heroOutside: !wrap.contains(document.getElementById('homeDayBadge')) && !wrap.contains(document.getElementById('homeHydrationText')),
    supIn: sup.left >= vp.left - 1 && sup.right <= vp.right + 1, medOut: med.left >= vp.right - 1, arrow: !!document.querySelector('#todaySupsCard .vhs-arrow--next'), arrowTopRight: (() => { const a = document.querySelector('#todaySupsCard .vhs-arrow--next').getBoundingClientRect(); return a.right > sup.right - 30 && a.top < sup.top + 40; })(), h: Math.round(vp.height), supH: Math.round(sup.height) };
});
log('Takviyeler ve ilaçlar tek alanda; üstteki karşılama / su kartları dışarıda (sabit)', h0.both && h0.heroOutside, JSON.stringify(h0));
log('Başlangıçta "Bugünkü takviyelerim" görünür; sağ üstte → oku; alan yüksekliği etkin karta uyar', h0.supIn && h0.medOut && h0.arrow && h0.arrowTopRight && Math.abs(h0.h - h0.supH) < 3, JSON.stringify(h0));
await p.evaluate(() => document.querySelector('#todaySupsCard .vhs-arrow--next').click()); await sleep(600);
const h1 = await p.evaluate(() => { const vp = document.querySelector('#homeCareTabs .vhs-viewport').getBoundingClientRect(), med = document.getElementById('todayMedsCard').getBoundingClientRect(), prev = document.querySelector('#todayMedsCard .vhs-arrow--prev').getBoundingClientRect(); return { medIn: med.left >= vp.left - 1 && med.right <= vp.right + 1, prevTopLeft: prev.left < med.left + 40 && prev.top < med.top + 40, cur: VitaHomeTabs.current(), y: Math.round(window.scrollY) }; });
log('→ oku yalnızca bu alanı kaydırarak "Bugünkü ilaçlarım"ı gösterir; sol üstte ← oku', h1.medIn && h1.prevTopLeft && h1.cur === 1, JSON.stringify(h1));
await p.evaluate(() => document.querySelector('#todayMedsCard .vhs-arrow--prev').click()); await sleep(500);
const back0 = await p.evaluate(() => VitaHomeTabs.current());
const swipe = await p.evaluate(async () => {
  const vp = document.querySelector('#homeCareTabs .vhs-viewport');
  const t = (type, x) => { const touch = new Touch({ identifier: 1, target: vp, clientX: x, clientY: 300 }); vp.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [touch], changedTouches: [touch] })); };
  t('touchstart', 300); t('touchend', 150); await new Promise(r => setTimeout(r, 450)); const a = VitaHomeTabs.current();
  t('touchstart', 100); t('touchend', 260); await new Promise(r => setTimeout(r, 450)); const c = VitaHomeTabs.current();
  return { left: a, right: c };
});
log('← oku geri döndürür; sola kaydırma ilaçlara, sağa kaydırma takviyelere geçirir', back0 === 0 && swipe.left === 1 && swipe.right === 0, JSON.stringify({ back0, swipe }));
await p.evaluate(() => { openAddMedicationModal(); addMedName.value = 'Sekme Testi 5 mg'; commitAddMedication(); }); await sleep(700);
const afterAdd = await p.evaluate(() => VitaHomeTabs.current());
log('İlaç eklenince Ana Sayfa\'da ilaçlar sekmesi açılır', afterAdd === 1, String(afterAdd));

/* 4) Günlük özet: Vitamin / İlaç */
await p.evaluate(() => { const m = state.medications.find(x => /Euthyrox/.test(x.name)); setVitaMedicationDoseTaken(m.id, '09:00', true); VitaHomeTabs.show(0); toggleDailySummaryPanel(true); VitaSummaryTabs.show(0); }); await sleep(400);
const v = await p.evaluate(() => ({ title: document.getElementById('dailySummaryPanelTitle').innerText.trim(), ring: document.querySelector('#vdsVitaRing b').innerText, skor: document.getElementById('dashVitaSkor').innerText, morning: document.getElementById('dashMorningCount').innerText, prevDisabled: document.getElementById('vdsPrev').disabled }));
log('Sekme 1: "Günlük Özet Göstergeleri - Vitamin", VitaSkor halkası ve Sabah/Öğle/Akşam protokolleri', v.title === 'Günlük Özet Göstergeleri - Vitamin' && v.ring === v.skor && /^\d+\/\d+$/.test(v.morning) && v.prevDisabled, JSON.stringify(v));
await p.evaluate(() => document.getElementById('vdsNext').click()); await sleep(400);
const m = await p.evaluate(() => ({ title: document.getElementById('dailySummaryPanelTitle').innerText.trim(), open: !document.getElementById('dailySummaryPanel').classList.contains('hidden'), ring: document.querySelector('#vdsMedRing b').innerText,
  am: document.getElementById('vdsMedMorning').innerText, noon: document.getElementById('vdsMedNoon').innerText, pm: document.getElementById('vdsMedEvening').innerText, vita: document.getElementById('dashVitaSkor').innerText, tab: state.activeTab }));
const expected = await p.evaluate(() => { const rows = getTodayVitaMedicationDoses(); return Math.round(rows.filter(r => r.taken).length / rows.length * 100) + '%'; });
log('Sekme 2: "Günlük Özet Göstergeleri - İlaç"; panel açık kalır, arka plan değişmez', m.title === 'Günlük Özet Göstergeleri - İlaç' && m.open && m.tab === 'view-home', JSON.stringify(m));
log('İlaç Skoru yalnızca ilaç dozlarından (VitaSkor\'dan bağımsız); Sabah/Öğle/Akşam doz kartları', m.ring === expected && /^1\/\d+$/.test(m.am) && /^\d+\/\d+$/.test(m.noon) && /^0\/\d+$/.test(m.pm), JSON.stringify({ m, expected }));
const sw = await p.evaluate(async () => {
  const vp = document.querySelector('#dailySummaryPanel .vds-viewport');
  const t = (type, x) => { const touch = new Touch({ identifier: 2, target: vp, clientX: x, clientY: 200 }); vp.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [touch], changedTouches: [touch] })); };
  t('touchstart', 100); t('touchend', 260); await new Promise(r => setTimeout(r, 350));
  return { cur: VitaSummaryTabs.current(), open: !document.getElementById('dailySummaryPanel').classList.contains('hidden') };
});
log('Panel içinde sağa kaydırma Vitamin sekmesine döner', sw.cur === 0 && sw.open, JSON.stringify(sw));
await p.evaluate(() => toggleDailySummaryPanel(false));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
