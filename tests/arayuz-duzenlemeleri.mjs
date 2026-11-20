/* Arayüz düzenlemeleri: (1) Gönder'e basınca sesli dinleme kesin kapanır, (2) ana sayfa düğmeleri yan yana ve
   takviye kartları kompakt + akordeon, (3) takviye formunda günlük miktar + birim, (4) Ayarlar katlanabilir bloklar. */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot({ preload: () => {
  class FakeRec {
    constructor() { window.__recs = (window.__recs || []); window.__recs.push(this); this.stopped = false; this.aborted = false; }
    start() { setTimeout(() => this.onstart && this.onstart(), 10); setTimeout(() => this.onresult && this.onresult({ results: [Object.assign([{ transcript: 'D vitaminim düşük' }], { isFinal: true })] }), 60); }
    stop() { this.stopped = true; setTimeout(() => { this.onresult && this.onresult({ results: [Object.assign([{ transcript: 'GEÇ GELEN METİN' }], { isFinal: true })] }); this.onend && this.onend(); }, 30); }
    abort() { this.aborted = true; }
  }
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
} });
p.setDefaultTimeout(20000); p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-home'); });
await sleep(600);

/* 1) Sesli yazma + Gönder */
await p.evaluate(() => { VitaAIChat.toggle(true); document.getElementById('ai-voice-btn').click(); }); await sleep(150);
const v0 = await p.evaluate(() => ({ text: document.getElementById('ai-user-input').value, listening: /is-listening/.test(document.getElementById('ai-voice-btn').className) }));
await p.evaluate(() => document.querySelector('#vita-ai-chatbox form').requestSubmit()); await sleep(250);
const v1 = await p.evaluate(() => {
  const r = window.__recs[0], btn = document.getElementById('ai-voice-btn');
  const msgs = Array.from(document.querySelectorAll('#ai-chat-messages > *')).map(x => x.innerText);
  return { stopped: r.stopped, listening: /is-listening/.test(btn.className), pressed: btn.getAttribute('aria-pressed'), input: document.getElementById('ai-user-input').value, sent: msgs.some(m => /D vitaminim düşük/.test(m)) };
});
log('Dinlerken Gönder: mesaj gönderilir, recognition.stop() çağrılır, mikrofon pasife döner', v0.listening && v0.text === 'D vitaminim düşük' && v1.sent && v1.stopped && !v1.listening && v1.pressed === 'false', JSON.stringify({ v0, v1 }));
log('Gönderim sonrası geç gelen konuşma sonucu kutuya geri yazılmaz', v1.input === '', v1.input);
await sleep(200);
const v2 = await p.evaluate(() => ({ count: window.__recs.length, listening: /is-listening/.test(document.getElementById('ai-voice-btn').className) }));
log('Dinleme arka planda yeniden başlamaz; tekrar için mikrofona basmak gerekir', v2.count === 1 && !v2.listening, JSON.stringify(v2));
await p.evaluate(() => VitaAIChat.toggle(false));

/* 2) Ana sayfa düğmeleri + kompakt takviye kartları */
const hero = await p.evaluate(() => { const bs = Array.from(document.querySelectorAll('#homeHeroActions > button')).map(x => x.getBoundingClientRect()); return { n: bs.length, sameRow: bs.length === 2 && Math.abs(bs[0].top - bs[1].top) < 2, fit: bs.every(r => r.right <= innerWidth && r.left >= 0), h: bs.map(r => Math.round(r.height)) }; });
log('"Buzdolabı Çizelgesi Yazdır" ve "Belirtilerimi değerlendir" tek satırda iki sütun (400px)', hero.n === 2 && hero.sameRow && hero.fit, JSON.stringify(hero));
await p.evaluate(() => {
  state.supplements.push({ id: 'sup_test_1', name: 'Test D3 1000 IU', timing: 'Sabah', doseText: 'Günde 1 kapsül (1000 IU) • Tok karnına', toplamKutuAdedi: 30, kalanAdet: 2, gunlukDoz: 1, instruction: 'Uzun kullanım talimatı metni burada.', taken: false, scheduleDays: [0,1,2,3,4,5,6], scheduledDate: vitaLocalToday(), addedDate: Date.now() });
  saveState(); renderDailyTab();
});
await sleep(200);
const c0 = await p.evaluate(() => {
  const card = document.querySelector('.vsc-card[data-sup-id="sup_test_1"]'); const more = card.querySelector('.vsc-more');
  const vis = el => el && el.getClientRects().length > 0;
  return { cb: vis(card.querySelector('input[type=checkbox]')), name: card.querySelector('.vsc-name').innerText, meta: card.querySelector('.vsc-meta').innerText, del: vis(card.querySelector('.vsc-del')),
    moreHidden: !vis(more), stockHidden: !vis(card.querySelector('.misantha-stock-bar')), refillHidden: !vis(card.querySelector('.misantha-refill-btn')), instrHidden: !vis(card.querySelector('.vsc-instruction')),
    flag: (card.querySelector('.vsc-low')?.innerText || '').replace(/\s+/g, ' '), h: Math.round(card.getBoundingClientRect().height) };
});
log('Kart varsayılanda yalnızca onay kutusu, ad, saat/sıklık ve silme gösterir (stok, +Stok, talimat gizli)', c0.cb && c0.name === 'Test D3 1000 IU' && /\d\d:\d\d|Sabah/.test(c0.meta) && c0.del && c0.moreHidden && c0.stockHidden && c0.refillHidden && c0.instrHidden && c0.h <= 130, JSON.stringify(c0));
log('Kritik stok gizlenmez: kartta "Kutu bitmek üzere" şeridi ve "Yeni kutu açtım" görünür', /2 gün yetecek/.test(c0.flag) && /Yeni kutu açtım/.test(c0.flag), c0.flag);
await p.evaluate(() => document.querySelector('.vsc-card[data-sup-id="sup_test_1"] .vsc-main').click()); await sleep(150);
const c1 = await p.evaluate(() => { const card = document.querySelector('.vsc-card[data-sup-id="sup_test_1"]'); const vis = el => el && el.getClientRects().length > 0; return { open: card.classList.contains('is-open'), stock: vis(card.querySelector('.vsc-stock')), refill: vis(card.querySelector('.misantha-refill-btn, .vsc-low button')), text: card.querySelector('.vsc-more').innerText.replace(/\s+/g, ' '), exp: card.querySelector('.vsc-chev').getAttribute('aria-expanded') }; });
// Sadeleştirme: çekmecede yalnızca "Stok: N gün yetecek. Günlük doz: N" + "+Stok"; talimat "!" düğmesinde.
log('Karta dokununca çekmece açılır: sade stok satırı ve +Stok görünür, uzun talimat görünmez', c1.open && c1.stock && c1.refill && /Kritik stok: 2 gün yetecek\. Günlük doz: 1/.test(c1.text) && !/Uzun kullanım/.test(c1.text) && c1.exp === 'true', JSON.stringify(c1));
await p.evaluate(() => document.querySelector('.vsc-card[data-sup-id="sup_test_1"] input[type=checkbox]').click()); await sleep(200);
const c2 = await p.evaluate(() => { const card = document.querySelector('.vsc-card[data-sup-id="sup_test_1"]'); return { open: card.classList.contains('is-open'), taken: state.supplements.find(s => s.id === 'sup_test_1').taken }; });
log('İşaretleme sonrası yeniden çizimde açık çekmece açık kalır', c2.open && c2.taken, JSON.stringify(c2));
await p.evaluate(() => document.querySelector('.vsc-card[data-sup-id="sup_test_1"] .vsc-chev').click()); await sleep(100);
const c3 = await p.evaluate(() => document.querySelector('.vsc-card[data-sup-id="sup_test_1"]').classList.contains('is-open'));
log('Ok düğmesi çekmeceyi kapatır', c3 === false);

/* 3) Takviye formu: günlük miktar + birim */
await p.evaluate(() => { openAddSupplementModal(); document.getElementById('addSupMoreDetails').open = true; }); await sleep(200);
const f0 = await p.evaluate(() => ({ legend: document.querySelector('#modalDoseFieldset legend')?.innerText, labels: Array.from(document.querySelectorAll('#modalDoseFieldset .vsp-lbl')).map(x => x.innerText), hungerTag: document.getElementById('manualSupHungerNote').tagName, unitOpts: Array.from(document.getElementById('manualSupDoseUnit').options).map(o => o.value), preview: document.getElementById('manualSupDosePreview').innerText, stockDaily: !!document.querySelector('#modalMisanthaStockBox #manualSupDailyDose') }));
log('"Nasıl alacaksınız?" bölümü: günde kaç adet + birim seçimi, etiketteki miktar, aç/tok seçimi', f0.legend === 'Nasıl alacaksınız?' && f0.labels[0] === 'Günde kaç adet?' && f0.labels[1] === 'Birim' && f0.hungerTag === 'SELECT' && f0.unitOpts.includes('damla') && /^Günde 1 tablet · Sabah 08:00 · Her gün$/.test(f0.preview) && !f0.stockDaily, JSON.stringify(f0));
await p.evaluate(() => {
  document.getElementById('manualSupName').value = 'Form Testi Omega';
  const d = document.getElementById('manualSupDailyDose'); d.value = '2'; d.dispatchEvent(new Event('input'));
  const u = document.getElementById('manualSupDoseUnit'); u.value = 'kapsül'; u.dispatchEvent(new Event('change'));
  const s = document.getElementById('manualSupDose'); s.value = '1000 mg'; s.dispatchEvent(new Event('input'));
  const h = document.getElementById('manualSupHungerNote'); h.value = 'Tok karnına'; h.dispatchEvent(new Event('change'));
});
const f1 = await p.evaluate(() => document.getElementById('manualSupDosePreview').innerText);
log('Canlı özet kullanıcının girdiğini açıkça gösterir', f1 === 'Günde 2 kapsül (1000 mg) · Sabah 08:00 · Her gün · Tok karnına', f1);
await p.evaluate(() => commitManualSupplement()); await sleep(200);
const f2 = await p.evaluate(() => { const s = state.supplements.find(x => x.name === 'Form Testi Omega'); return { dose: s?.doseText, daily: s?.gunlukDoz, unit: s?.dozBirimi }; });
log('Kayıtta belirsiz "Etiket / hekim planındaki miktarı girin" yerine net miktar', f2.dose === '2 kapsül (1000 mg) • Tok karnına' && f2.daily === 2 && f2.unit === 'kapsül', JSON.stringify(f2));
await p.evaluate(() => { openAddSupplementModal(); fillAddSupplementModalFormFromItem({ urunAdi: 'Katalog Damla', form: 'Oral Damla', aclikDurumu: 'Tok (Yağlı Kahvaltı İle)', gunlukDoz: 1, kutuAdedi: 30 }); });
const f3 = await p.evaluate(() => ({ unit: document.getElementById('manualSupDoseUnit').value, hunger: document.getElementById('manualSupHungerNote').value }));
log('Katalogdan dolunca birim formdan tahmin edilir, listede olmayan aç/tok bilgisi kaybolmaz', f3.unit === 'damla' && f3.hunger === 'Tok (Yağlı Kahvaltı İle)', JSON.stringify(f3));
await p.evaluate(() => { openAddSupplementModal(); });
const f4 = await p.evaluate(() => ({ hunger: document.getElementById('manualSupHungerNote').value, dyn: document.querySelectorAll('#manualSupHungerNote option[data-dynamic]').length, unit: document.getElementById('manualSupDoseUnit').value }));
log('Pencere yeniden açılınca alanlar sıfırlanır', f4.hunger === '' && f4.dyn === 0 && f4.unit === 'tablet', JSON.stringify(f4));
await p.evaluate(() => closeAddSupplementModal());

/* 4) Ayarlar: katlanabilir bloklar + durum özeti + salt okunur model */
await p.evaluate(() => { localStorage.removeItem('vita_settings_open_sections'); navigateToView('view-settings'); }); await sleep(300);
const s0 = await p.evaluate(() => Array.from(document.querySelectorAll('#view-settings .vst-section')).map(sec => ({ id: sec.id, name: sec.querySelector('.vst-name').innerText, summary: sec.querySelector('.vst-summary').innerText, open: sec.classList.contains('vst-open'), bodyHidden: sec.querySelector('.vst-body').hidden, exp: sec.querySelector('.vst-toggle').getAttribute('aria-expanded') })));
const names = s0.map(x => x.name).join(' | ');
log('Ayarlar beş katlanabilir blok: Profil, Bildirim ve Kamera İzinleri, Yapay Zekâ & Model Yönetimi, Araçlar, Veriler ve Yedek', names === 'Profil | Bildirim ve Kamera İzinleri | Yapay Zekâ & Model Yönetimi | Araçlar | Veriler ve Yedek' && s0.every(x => !x.open && x.bodyHidden && x.exp === 'false'), names);
log('Her blok başlığında durum özeti', /Test Kullanici/.test(s0[0].summary) && /Bildirim:/.test(s0[1].summary) && /Kamera:/.test(s0[1].summary) && /Yerel asistan|Aktif model/.test(s0[2].summary) && s0[3].summary && /yedek/i.test(s0[4].summary), JSON.stringify(s0.map(x => x.summary)));
const h0 = await p.evaluate(() => Math.round(document.getElementById('view-settings').getBoundingClientRect().height));
await p.evaluate(() => document.querySelector('#settingsSectionAiConnection .vst-toggle').click()); await sleep(150);
const s1 = await p.evaluate(() => { const sec = document.getElementById('settingsSectionAiConnection'); const badge = document.getElementById('geminiActiveModelBadge'); return { open: sec.classList.contains('vst-open'), badgeVisible: badge.getClientRects().length > 0, ro: badge.getAttribute('aria-readonly'), tag: badge.tagName, saved: JSON.parse(localStorage.getItem('vita_settings_open_sections') || '[]') }; });
log('Yapay Zekâ bloğu açılınca salt okunur aktif model rozeti görünür; açık blok hatırlanır', s1.open && s1.badgeVisible && s1.ro === 'true' && s1.tag === 'SPAN' && s1.saved.includes('settingsSectionAiConnection'), JSON.stringify(s1));
await p.evaluate(() => { localStorage.setItem('vita_gemini_api_key_' + activeUserId, 'AIzaSyA1b2C3d4E5f6G7h8I9j0K-L_mNoPqRsTu'); localStorage.setItem('vita_gemini_model_ok', 'gemini-2.5-flash'); updateApiKeyUI(); });
await sleep(150);
const s2 = await p.evaluate(() => document.getElementById('settingsSectionAiConnectionSummary').innerText);
log('Model değişince başlık özeti dinamik güncellenir', /Aktif model: gemini-2\.5-flash/.test(s2), s2);
await p.evaluate(() => { localStorage.setItem('vita_gemini_model_ok', 'gemini-3.8-flash'); updateGeminiActiveModelUI(); }); await sleep(150);
const s3 = await p.evaluate(() => document.getElementById('settingsSectionAiConnectionSummary').innerText);
log('Otomatik model geçişinde (rozet değişince) özet yeni modeli gösterir', /gemini-3\.8-flash/.test(s3), s3);
await p.evaluate(() => { document.querySelector('#settingsSectionAiConnection .vst-toggle').click(); });
await p.evaluate(() => { navigateToView('view-home'); VitaAIChat.toggle(true); }); await sleep(200);
await p.evaluate(() => VitaAIChat.openConsentSettings()); await sleep(700);
const s4 = await p.evaluate(() => ({ open: document.getElementById('settingsSectionAiConnection').classList.contains('vst-open'), inView: (() => { const r = document.getElementById('aiHealthDataConsentSettings').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 2 && r.height > 0; })() }));
log('Sohbetteki "Ayarlar" bağlantısı kapalı Yapay Zekâ bloğunu açıp onay bölümüne götürür', s4.open && s4.inView, JSON.stringify(s4));
const hOpen = await p.evaluate(() => Math.round(document.getElementById('view-settings').getBoundingClientRect().height));
log('Kapalı bloklarla Ayarlar sayfası belirgin biçimde kısalır', h0 < 700 && hOpen > h0, `kapalı ${h0}px · bir blok açık ${hOpen}px`);

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
