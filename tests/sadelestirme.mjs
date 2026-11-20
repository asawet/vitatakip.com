/* Ana Sayfa ve takviye listesi sadeleştirmesi + genel düzen düzeltmeleri:
   Emniyet Kalkanı çekmecesi, tekrar uyarı kutusunun kaldırılması, sade kart (⚡ sayısı kalır), "!" kullanım bilgisi,
   Ana Sayfa sırası, "Tümü alındı", tek satır geri düğmesi, kaydırırken gizlenen yapay zekâ düğmesi, dokunma alanları,
   tahlil adları, HL7 düğmesi, arama yer tutucusu, eski yer tutucu doz yazısının temizlenmesi. */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000); p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };

// Etkileşim üreten gerçekçi veri: Euthyrox + Glucophage + magnezyum + B12 + demir (+ eski yer tutucu doz yazısı)
await p.evaluate(() => {
  Object.assign(state.user, { age: 46, gender: 'K', height: 164, weight: 71, profileCompleted: true });
  const mk = (id, n, t, extra = {}) => ({ id, name: n, timing: t, doseText: 'Günde 1 kapsül', toplamKutuAdedi: 30, kalanAdet: 25, gunlukDoz: 1, instruction: 'Uzun klinik açıklama: ferritin ve hemogram takibi ...', taken: false, scheduleDays: [0,1,2,3,4,5,6], scheduledDate: vitaLocalToday(), addedDate: Date.now(), ...extra });
  state.supplements = [
    mk('d3', 'D3 + K2 Vitamini', 'Sabah', { formKey: 'D3_K2', selectedForm: 'Damla', doseText: 'Etiket / hekim planındaki miktarı girin' }),
    mk('mg', 'Venatura Magnezyum Bisglisinat', 'Akşam'),
    mk('fe', 'Demir (Fe) Takviyesi', 'Sabah'),
    mk('b12', 'Ocean Methyl B12 Sprey', 'Sabah')
  ];
  saveState();
  addVitaMedication({ name: 'Euthyrox 50 mcg', frequency: 'gunde1', times: ['Sabah'] }, { noRefresh: true });
  addVitaMedication({ name: 'Glucophage 850 mg', frequency: 'gunde2', times: ['Sabah', 'Akşam'] }, { noRefresh: true });
  saveState(); try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {}
});
// Eski yer tutucu doz yazısının temizlendiğini görmek için kayıttan yeniden yükle
await p.reload({ waitUntil: 'networkidle2' }); await sleep(2500);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-home'); window.scrollTo(0, 0); });
await sleep(600);

/* 1) Emniyet Kalkanı çekmecesi + tekrar kutusu yok */
const k = await p.evaluate(() => {
  const d = document.querySelector('#conflictShieldAlertBanner details.vsk');
  const daily = document.getElementById('dailyProtocolInteractionAlert');
  return { exists: !!d, open: d?.open, summary: d?.querySelector('summary')?.innerText.replace(/\s+/g, ' '), bodyVisible: !!d?.querySelector('.vsk-body') && d.querySelector('.vsk-body').getClientRects().length > 0, h: Math.round(d?.getBoundingClientRect().height || 0), dailyHidden: daily.classList.contains('hidden') && daily.innerHTML === '' };
});
log('Emniyet Kalkanı varsayılanda kapalı çekmece: yalnızca başlık/özet görünür', k.exists && !k.open && /Emniyet Kalkanı: \d+ etkileşim uyarısı/.test(k.summary) && k.h < 90, JSON.stringify(k));
await p.evaluate(() => document.querySelector('#conflictShieldAlertBanner summary').click()); await sleep(200);
const k2 = await p.evaluate(() => { const d = document.querySelector('#conflictShieldAlertBanner details.vsk'); return { open: d.open, text: d.querySelector('.vsk-body').innerText.length }; });
log('Başlığa dokununca ayrıntılı etkileşim açıklamaları açılır', k2.open && k2.text > 100, JSON.stringify(k2));
await p.evaluate(() => { renderDailyTab(); detectSupplementConflicts(); }); await sleep(150);
const k3 = await p.evaluate(() => document.querySelector('#conflictShieldAlertBanner details.vsk').open);
log('Yeniden çizimde çekmece açık kalır', k3 === true);
log('"Bugünkü takviyelerim" altındaki "Günlük Protokol Etkileşim Uyarısı" kutusu kaldırıldı', k.dailyHidden && !(await p.evaluate(() => document.getElementById('view-home').innerText.includes('Günlük Protokol İlaç–Besin Etkileşim Uyarısı'))));

/* 2) Sade takviye kartı */
const c = await p.evaluate(() => {
  const card = document.querySelector('.vsc-card[data-sup-id="mg"]');
  card.querySelector('.vsc-chev').click();
  const more = card.querySelector('.vsc-more');
  return { flag: card.querySelector('.vsc-flag-ix')?.innerText.trim() || '', more: more.innerText.replace(/\s+/g, ' ').trim(), ixBox: /Etkileşim|Euthyrox/.test(more.innerText), form: !!card.querySelector('[onclick*="changeDailySupplementForm"]') || /Farmasötik Form/.test(card.innerText), instr: /Uzun klinik/.test(card.innerText), refillBelow: (() => { const s = card.querySelector('.misantha-stock-normal-badge, .misantha-stock-critical-badge').getBoundingClientRect(); const r = card.querySelector('.misantha-refill-btn').getBoundingClientRect(); return r.top >= s.bottom - 1; })() };
});
log('Kartta etkileşim sayısı (⚡N) kalır; çekmecede etkileşim metin kutusu yok', /^\d+$/.test(c.flag) && Number(c.flag) >= 1 && !c.ixBox, JSON.stringify({ flag: c.flag, more: c.more }));
log('Çekmecede yalnızca "Stok: N gün yetecek. Günlük doz: N" ve hemen altında "+Stok"', /^Stok: 25 gün yetecek\. Günlük doz: 1 Yeni Kutu Ekle \(\+Stok\) Düzenle Bugün atla$/.test(c.more) && c.refillBelow, c.more);
log('Form seçici ve uzun talimat metni kartta yok', !c.form && !c.instr);
const d3 = await p.evaluate(() => { const card = document.querySelector('.vsc-card[data-sup-id="d3"]'); card.querySelector('.vsc-chev').click(); return { formSel: !!card.querySelector('[onclick*="changeDailySupplementForm"]'), text: card.innerText, stored: state.supplements.find(s => s.id === 'd3').doseText }; });
log('Şablon takviyede (D3+K2) form seçici yok; eski "Etiket / hekim planındaki miktarı girin" yazısı temizlenmiş', !d3.formSel && !/Etiket \/ hekim|Günlük miktarı/.test(d3.text) && /^Günde 1 /.test(d3.stored), d3.stored);
const formInModal = await p.evaluate(() => { openAddSupplementModal(); const sel = document.getElementById('modalCatalogSelect'); sel.value = 'D3_K2'; onCatalogSelectChange('D3_K2'); const box = document.getElementById('modalFormSelectorContainer'); const r = { visible: !box.classList.contains('hidden'), opts: document.getElementById('modalFormSelect').options.length }; closeAddSupplementModal(); return r; });
log('Form seçici yalnızca "Takviye ekle" penceresinde (şablon seçilince)', formInModal.visible && formInModal.opts >= 2, JSON.stringify(formInModal));

/* 3) "!" kullanım bilgisi (takviye + ilaç) */
// Gerçek kullanımdaki gibi önce düğme ekrana getirilir (kaydırma bilgi penceresini kapatır), sonra dokunulur.
const tip = async sel => { await p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await sleep(300); await p.evaluate(s => document.querySelector(s).click(), sel); await sleep(150); return p.evaluate(() => { const pop = document.getElementById('vitaUsagePop'); if (!pop) return null; const r = pop.getBoundingClientRect(); return { text: pop.innerText.replace(/\s+/g, ' '), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; }); };
const tD3 = await tip('.vsc-card[data-sup-id="d3"] .vsc-info');
log('D3 + K2 "!" → "Yağda çözünür; kahvaltıda veya sağlıklı yağ içeren ana öğünle birlikte alınız."', tD3 && /Yağda çözünür; kahvaltıda veya sağlıklı yağ içeren ana öğünle birlikte alınız\./.test(tD3.text) && tD3.inView && !/ferritin/.test(tD3.text), tD3?.text);
const tFe = await tip('.vsc-card[data-sup-id="fe"] .vsc-info');
log('Demir "!" → "Aç karnına veya yemeklerden 2 saat sonra… Süt, peynir, çay ve kahve…"', tFe && /Aç karnına veya yemeklerden 2 saat sonra alınız\. Süt, peynir, çay ve kahve ile birlikte tüketmeyiniz\./.test(tFe.text), tFe?.text);
const cardStayedClosed = await p.evaluate(() => !document.querySelector('.vsc-card[data-sup-id="fe"]').classList.contains('is-open'));
log('"!" düğmesi kartın çekmecesini açmaz', cardStayedClosed);
const tMed = await tip('#todayMedsList .vtm-info');
log('İlaç listesinde de "!" var ve kısa kullanım özeti gösterir', tMed && /alınız/.test(tMed.text), tMed?.text);
await p.keyboard.press('Escape'); await sleep(100);
log('Esc ile bilgi penceresi kapanır', await p.evaluate(() => !document.getElementById('vitaUsagePop')));

/* 4) Ana Sayfa sırası + "Tümü alındı" */
const order = await p.evaluate(() => {
  const pos = id => { const el = document.getElementById(id); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : -1; };
  const summaryInHome = !!document.querySelector('#view-home #dashVitaSkor');
  return { kalkan: pos('conflictShieldAlertBanner'), takviye: pos('supplementChecklistContainer'), ilac: pos('todayMedsCard'), sekmeler: pos('homeCareTabs'), ayniAlan: !!document.querySelector('#homeCareTabs #todaySupsCard') && !!document.querySelector('#homeCareTabs #todayMedsCard'), su: pos('homeHydrationCard'), hero: pos('homeHeroCard'), summaryInHome };
});
log('Ana Sayfa sırası: karşılama → su → Emniyet Kalkanı → takviyeler ⇄ ilaçlar (tek alanda sekmeler); günlük özet Ana Sayfa\'da değil', order.hero < order.su && order.su < order.kalkan && order.kalkan < order.sekmeler && order.ayniAlan && !order.summaryInHome, JSON.stringify(order));
/* Üst bar: günlük özet simgesi → panel; "Yükle" düğmesi üst barda yok */
const top0 = await p.evaluate(() => ({ install: document.querySelectorAll('header .vita-pwa-btn, header [data-pwa-install]').length, btn: !!document.querySelector('header #btnHeaderDailySummary'), badge: document.getElementById('headerDailySummaryBadge').innerText, panelHidden: document.getElementById('dailySummaryPanel').classList.contains('hidden') }));
await p.evaluate(() => { document.querySelector('.vsc-card input[type=checkbox]').click(); }); await sleep(200);
// Üst bar sayfa kaydırılınca ekrandan çıkar; kullanıcı simgeye sayfa başındayken dokunur.
await p.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
await p.evaluate(() => document.getElementById('btnHeaderDailySummary').click()); await sleep(250);
const top1 = await p.evaluate(() => { const pn = document.getElementById('dailySummaryPanel'); const r = pn.getBoundingClientRect(); return { open: !pn.classList.contains('hidden'), exp: document.getElementById('btnHeaderDailySummary').getAttribute('aria-expanded'), skor: document.getElementById('dashVitaSkor').innerText, badge: document.getElementById('headerDailySummaryBadge').innerText, morning: document.getElementById('dashMorningCount').innerText, inView: r.left >= 0 && r.right <= innerWidth && r.top > 40 && r.bottom <= innerHeight, rect: [Math.round(r.top), Math.round(r.bottom), innerHeight, Math.round(document.querySelector('header').getBoundingClientRect().bottom)] }; });
log('Üst barda "Yükle" yok; günlük özet simgesi var', top0.install === 0 && top0.btn && top0.panelHidden, JSON.stringify(top0));
log('Simgeye basınca günlük özet göstergeleri panelde açılır; rozet VitaSkor\'u gösterir', top1.open && top1.exp === 'true' && top1.badge === top1.skor && /\d+\/\d+/.test(top1.morning) && top1.inView, JSON.stringify(top1));
await p.mouse.click(30, 700); await sleep(150);
const top2 = await p.evaluate(() => document.getElementById('dailySummaryPanel').classList.contains('hidden'));
log('Panel dışına dokununca kapanır', top2);
const sym = await p.evaluate(() => { state.selectedSymptoms.add(Object.keys(ANAMNESIS_DICTIONARY)[0]); localStorage.removeItem(Object.keys(localStorage).find(k => /symptom.*check|sdc/i.test(k)) || '_'); if (typeof window.renderSymptomDailyCheck === 'function') window.renderSymptomDailyCheck(); renderDailyTab(); const host = document.getElementById('symptomDailyCheck'); const su = document.getElementById('homeHydrationCard'); return host ? { afterWater: su.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false } : { afterWater: null }; });
log('"Belirtileriniz hâlâ var mı?" su kartının altında (belirti varsa)', sym.afterWater !== false, JSON.stringify(sym));
const grp = await p.evaluate(() => { const h = document.querySelector('.vsg-head'); const btn = h.querySelector('.vsg-all'); const hr = h.getBoundingClientRect(), br = btn.getBoundingClientRect(); return { oneRow: br.top >= hr.top - 1 && br.bottom <= hr.bottom + 1, text: btn.innerText.trim(), h: Math.round(br.height) }; });
log('"Tümü alındı" grup başlığının sağında, ayrı satır kaplamaz', grp.oneRow && grp.text === 'Tümü alındı' && grp.h >= 32, JSON.stringify(grp));

/* 5) Genel: geri düğmesi, yapay zekâ düğmesi, dokunma alanları, yazı boyutu, tahlil adları, HL7, arama */
await p.evaluate(() => { navigateToView('view-labs'); window.scrollTo(0, 0); }); await sleep(400);
const back = await p.evaluate(() => { const b = document.querySelector('#viewHeaderBar .vbh-back'); const r = b.getBoundingClientRect(); return { text: b.innerText.trim(), h: Math.round(r.height), arrows: (b.innerText.match(/←/g) || []).length }; });
log('Geri düğmesi tek satır "Ana Sayfa", çift ok yok, ≥40px', back.text === 'Ana Sayfa' && back.h >= 40 && back.h <= 48 && back.arrows === 0, JSON.stringify(back));
const labs = await p.evaluate(() => { const lab = document.querySelector('label[title^="D Vitamini"]'); const inp = document.getElementById('inputLabD3'); const pdf = document.querySelector('#view-labs button[onclick*="openENabiz"]'); return { overflow: lab.scrollWidth > lab.clientWidth + 1, lines: Math.round(lab.getBoundingClientRect().height / parseFloat(getComputedStyle(lab).lineHeight)), inputH: Math.round(inp.getBoundingClientRect().height), font: getComputedStyle(inp).fontSize, pdf: Math.round(pdf.getBoundingClientRect().height) }; });
log('Tahlil adları kesilmeden iki satıra sığar; giriş kutuları ≥40px ve 16px yazı; PDF düğmesi ≥40px', !labs.overflow && labs.inputH >= 40 && labs.font === '16px' && labs.pdf >= 40, JSON.stringify(labs));
await p.evaluate(() => { navigateToView('view-home'); window.scrollTo(0, 0); }); await sleep(300);
const nav = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.vita-mobile-nav button span')).fontSize));
log('Alt menü yazıları ≥10.5px', nav >= 10.5, String(nav));
await p.evaluate(() => window.scrollTo(0, 600)); await sleep(100); await p.evaluate(() => window.scrollTo(0, 1200)); await sleep(150);
const fab1 = await p.evaluate(() => document.getElementById('vitaAiFab').classList.contains('vita-fab-hidden'));
await p.evaluate(() => window.scrollTo(0, 900)); await sleep(150);
const fab2 = await p.evaluate(() => document.getElementById('vitaAiFab').classList.contains('vita-fab-hidden'));
await p.evaluate(() => window.scrollTo(0, 1400)); await sleep(1700);
const fab3 = await p.evaluate(() => document.getElementById('vitaAiFab').classList.contains('vita-fab-hidden'));
log('Yapay zekâ düğmesi aşağı kaydırırken gizlenir, yukarı kaydırınca ve durunca geri gelir', fab1 && !fab2 && !fab3, JSON.stringify({ fab1, fab2, fab3 }));
const sdc = await p.evaluate(() => { const b = document.querySelector('.sdc-yes'); return b ? Math.round(b.getBoundingClientRect().height) : null; });
log('"Hâlâ var / Geçti" düğmeleri ≥40px', sdc === null || sdc >= 40, String(sdc));
await p.evaluate(() => { navigateToView('view-report'); }); await sleep(500);
const fhir1 = await p.evaluate(() => document.getElementById('btnExportFhirBundle').getClientRects().length > 0);
await p.evaluate(() => document.getElementById('rsModeToggle').click()); await sleep(300);
const fhir2 = await p.evaluate(() => ({ vis: document.getElementById('btnExportFhirBundle').getClientRects().length > 0, text: document.getElementById('btnExportFhirBundle').innerText.trim() }));
await p.evaluate(() => document.getElementById('rsModeToggle').click()); await sleep(200);
log('HL7 FHIR düğmesi kısa raporda gizli, yalnızca ayrıntılı raporda görünür', !fhir1 && fhir2.vis && /Teknik veri dosyası/.test(fhir2.text), JSON.stringify({ fhir1, fhir2 }));
const ph = await p.evaluate(() => { const i = document.querySelector('input[placeholder="Ara…"]'); return i ? { ph: i.placeholder, fits: (() => { const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(i).font; return c.measureText(i.placeholder).width <= i.clientWidth - 20; })() } : null; });
log('Üst arama kutusu yer tutucusu kısa ve sığıyor', ph && ph.fits, JSON.stringify(ph));
const hscroll = await p.evaluate(async () => { const out = {}; for (const v of ['view-home', 'view-labs', 'view-neyim', 'view-clinical-results', 'view-report', 'view-settings']) { navigateToView(v); await new Promise(r => setTimeout(r, 250)); out[v] = document.documentElement.scrollWidth > innerWidth + 1; } return out; });
log('Hiçbir ekranda yana taşma yok (390px)', Object.values(hscroll).every(x => !x), JSON.stringify(hscroll));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
