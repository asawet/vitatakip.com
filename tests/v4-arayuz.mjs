// V4: 11 cihaz-testi hatasının gerileme testleri + orijinal sade arayüz düzeni (üst bar, 3 katmanlı sol menü,
// sabit 5 sekmeli alt bar + bilgi şeridi + tek VitaAI düğmesi, Ana Sayfa tek akış). Dış istek olmamalı.
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
p.on('dialog', d => d.accept());
const ext = []; p.on('request', r => { if (!/^(http:\/\/localhost|data:|blob:)/.test(r.url())) ext.push(r.url()); });
let ok = 0, fail = 0;
const log = (n, c, x = '') => { c ? ok++ : fail++; console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== '' ? ' -> ' + (typeof x === 'string' ? x : JSON.stringify(x)) : ''}`); };
const prep = () => p.evaluate(() => { try { closeProfileModal(); } catch (_) {} try { localStorage.setItem('vitatakip_spotlight_seen_' + activeUserId, 'true'); document.getElementById('vitaSpotlightLayer')?.classList.add('hidden'); } catch (_) {} });
await prep();

/* ---------- Bölüm 1–3: hata gerilemeleri ---------- */
await p.evaluate(() => { localStorage.setItem('vitatakip_remember_me', 'true'); localStorage.setItem('vitatakip_remembered_user_id', activeUserId); localStorage.setItem('vitatakip_remembered_fullname', 'Test Kullanici'); localStorage.setItem('vitatakip_active_session_id', activeUserId); handleLogout(); });
await sleep(300);
const p2 = await b.newPage(); await p2.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle2' }); await sleep(1500);
const r1 = await p2.evaluate(() => ({ active: activeUserId, auth: !document.getElementById('authModal').classList.contains('hidden'), quick: !document.getElementById('authRememberedQuickLoginBox').classList.contains('hidden'), forget: !!document.getElementById('authForgetRememberedBtn') }));
log('#1 Güvenli çıkıştan sonra yeniden açılışta giriş ekranı (otomatik giriş yok); hatırlanan hesap kartı + Hesabı Unut', !r1.active && r1.auth && r1.quick && r1.forget, r1);
await p2.evaluate(() => document.getElementById('authForgetRememberedBtn').click()); await sleep(150);
const r1b = await p2.evaluate(() => ({ id: localStorage.getItem('vitatakip_remembered_user_id'), name: localStorage.getItem('vitatakip_remembered_fullname'), box: document.getElementById('authRememberedQuickLoginBox').classList.contains('hidden'), users: JSON.parse(localStorage.getItem('vitatakip_users_db') || '[]').length }));
log('#1 "Hesabı Unut" hatırlanan oturumu temizler; hesap verisi silinmez', r1b.id === null && r1b.name === null && r1b.box && r1b.users >= 1, r1b);
await p2.close();
// tekrar giriş
await p.evaluate(() => { document.getElementById('authInputFullName').value = 'Test Kullanici'; document.getElementById('authInputPassword').value = 'testpass123'; document.getElementById('authSubmitBtn').click(); }); await sleep(1800); await prep();

const r2 = await p.evaluate(() => {
  state.user.gender = 'E';
  state.labHistory = [{ id: 'l1', date: '2026-11-10', hb: 16.9, alt: 51, d3: 28.29, references: { hb: '132 - 173 g/L', alt: '0 - 50 U/L', d3: '30 - 100 ng/mL' }, genderAtTest: 'E', timestamp: Date.now() }]; saveState();
  const hb = getLabHistoryMetric(state.labHistory[0], { key: 'hb', label: 'Hemoglobin', unit: 'g/dL' });
  const unitless = getLabHistoryMetric({ hb: 16.9, references: { hb: '132 - 173' }, genderAtTest: 'E' }, { key: 'hb', label: 'Hemoglobin', unit: 'g/dL' });
  const alt = getLabHistoryMetric(state.labHistory[0], { key: 'alt', label: 'ALT', unit: 'U/L' });
  return { hb: hb.status, unitless: unitless.status, alt: alt.status, out: labRecordHasPortalOutOfRange({ hb: 16.9, references: { hb: '132 - 173 g/L' } }) };
});
log('#2 Geçmiş Tahlillerim: Hb 16,9 g/dL ↔ 132–173 g/L normal (birimsiz referansta da); ALT 51 referans dışı', r2.hb === 'within' && r2.unitless === 'within' && r2.alt === 'outside' && r2.out === false, r2);

const r3 = await p.evaluate(() => { Object.assign(state.user, { age: 30, gender: 'E', height: 178, weight: 75, profileCompleted: true, pregnancyStage: '' }); renderParsedResultsPreview({ creatinine: { value: '0.88', unit: 'mg/dL', name: 'Kreatinin' } }); const t = document.body.textContent.replace(/\s+/g, ' '); const i = t.indexOf('Otomatik Böbrek Fonksiyonu'); return t.slice(i, i + 120); });
await p.evaluate(() => { try { closeENabizModal(); } catch (_) {} });
log('#3 e-Nabız PDF önizlemesi: "G1 — açıklama", undefined yok', /G1 — Normal/.test(r3) && !/undefined/.test(r3), r3);

const r4 = await p.evaluate(async () => {
  localStorage.setItem('vita_gemini_api_key', 'AIzaSyTESTKEYTESTKEYTESTKEYTESTKEY12'); localStorage.setItem('vita_ai_consent_' + activeUserId, 'true');
  const cb = document.getElementById('aiHealthDataConsent'); cb.checked = true; VitaAIChat.setRuntimeStatus('LIVE');
  cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); const afterChange = document.getElementById('ai-runtime-status').textContent;
  VitaAIChat.setRuntimeStatus('LIVE'); VitaAIChat.toggle(true); await new Promise(r => setTimeout(r, 150)); const onOpen = document.getElementById('ai-runtime-status').textContent; VitaAIChat.toggle(false);
  localStorage.removeItem('vita_gemini_api_key'); return { afterChange, onOpen };
});
log('#4 Onay kaldırılınca ve asistan açılınca rozet anında "Yerel bilgi modu"', r4.afterChange === 'Yerel bilgi modu' && r4.onOpen === 'Yerel bilgi modu', r4);

await p.evaluate(() => showToast('Doktora Özet Raporu Hazırlandı', 'test', 'success')); await p.emulateMediaType('print');
const r5 = await p.evaluate(() => ['toastNotification', 'appDrawer', 'vita-ai-widget'].map(id => { const e = document.getElementById(id); return e ? getComputedStyle(e).display : 'yok'; }).concat(getComputedStyle(document.querySelector('.vita-mobile-nav')).display));
log('#5 Yazdırmada toast, yan menü, VitaAI ve alt gezinme gizli', r5.every(d => d === 'none' || d === 'yok'), r5);
const r6b = await p.evaluate(() => { renderLabHistoryPrintSheet(); const c = document.querySelector('#vitaLabHistoryPrintSheet [data-lab-card]'); const cs = getComputedStyle(c); return { bi: cs.breakInside, head: getComputedStyle(c.querySelector('.lab-print-record-head')).breakAfter }; });
await p.emulateMediaType('screen');
const r6 = await p.evaluate(() => { const t = document.getElementById('vitaLabHistoryPrintSheet').innerText; return { eval: /Değerlendirildi/.test(t), high: /Yüksek/.test(t), low: /Düşük/.test(t), normal: /Normal/.test(t), title: t.split('\n').some(l => l.trim() === 'Tahlil Geçmişi ve Boylamsal Takip Raporu') }; });
log('#6 Tahlil geçmişi PDF: Durum Normal/Düşük/Yüksek; "Boylamsal" başlık; bloklar sayfada bölünmez', !r6.eval && r6.high && r6.low && r6.normal && r6.title && r6b.bi === 'avoid' && r6b.head === 'avoid', { r6, r6b });

const r7 = await p.evaluate(() => { state.user.chronic = ['blood_thinner', 'statin']; state.user.medications = []; renderSettingsView(); return document.getElementById('settingsProfileMedsSummary').textContent; });
log('#7 Ayarlar profil kartında Türkçe etiket (ham kod yok)', /Kan Sulandırıcı İlaç/.test(r7) && !/blood_thinner|statin\b/.test(r7), r7);

const r8 = await p.evaluate(async () => { openProfileModal(true); await new Promise(r => setTimeout(r, 250)); const g = document.getElementById('modalInputGender'), s = document.getElementById('modalPregnancyStatus'); g.value = 'K'; g.dispatchEvent(new Event('change', { bubbles: true })); s.value = 't1'; const shownK = !document.getElementById('modalPregnancyBox').hidden; g.value = 'E'; g.dispatchEvent(new Event('change', { bubbles: true })); const r = { shownK, hiddenE: document.getElementById('modalPregnancyBox').hidden, val: s.value }; closeProfileModal(); return r; });
log('#8 Erkek seçilince Gebelik / emzirme alanı gizlenir ve sıfırlanır', r8.shownK && r8.hiddenE && r8.val === '', r8);

const r9 = await p.evaluate(async () => { navigateToView('view-add-supplement'); await new Promise(r => setTimeout(r, 300)); VitaSupPage.setVakits(['Akşam', 'Gece']); VitaSupPage.setClock('Akşam', '19:00'); VitaSupPage.setClock('Gece', '22:00'); document.querySelector('[data-freq="days"]').click(); VitaSupPage.setDays([1, 4, 6, 0]); VitaSupPage.refresh(); return document.getElementById('manualSupDosePreview').textContent; });
log('#9 Takviye özeti: her saat bir kez', (r9.match(/22:00/g) || []).length === 1 && /Pzt, Per, Cmt, Paz/.test(r9), r9);

const r10 = await p.evaluate(async () => { navigateToView('view-home'); state.supplements = []; saveState(); renderDailyTab(); await new Promise(r => setTimeout(r, 200)); const a = document.getElementById('vdsVitaNote').textContent; state.supplements = [{ id: 's1', name: 'Mg', timing: 'Sabah', scheduleTime: '08:00', taken: false, scheduleDays: [0,1,2,3,4,5,6], toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, addedDate: Date.now() }]; saveState(); renderDailyTab(); await new Promise(r => setTimeout(r, 200)); return { a, b: document.getElementById('vdsVitaNote').textContent }; });
log('#10 Halka açıklaması: takviye yoksa "Yalnızca su hedefi (%100)", varsa %70 + %30', r10.a === 'Yalnızca su hedefi (%100)' && /%70/.test(r10.b), r10);

const r11 = await p.evaluate(async () => {
  state.labHistory = [{ id: 'a', date: '2026-08-01', hb: 15.2, references: {}, genderAtTest: 'E' }, { id: 'b', date: '2026-11-10', hb: 16.9, references: {}, genderAtTest: 'E' }]; saveState();
  navigateToView('view-labs'); await new Promise(r => setTimeout(r, 300)); document.querySelectorAll('.lt-row').forEach(d => { if (/Hemoglobin/.test(d.textContent)) d.open = true; }); await new Promise(r => setTimeout(r, 300));
  const svg = [...document.querySelectorAll('svg.lt-chart')].find(s => /Hemoglobin/.test(s.getAttribute('aria-label') || ''));
  const u = svg.querySelector('.lt-unit').getBBox(); const top = [...svg.querySelectorAll('text[text-anchor="end"]')].filter(t => /^\d/.test(t.textContent)).map(t => t.getBBox()).sort((x, y) => x.y - y.y)[0];
  Object.assign(state.user, { dietPattern: 'omnivore', fishPerWeek: '1', redMeatPerWeek: '1', sunExposureDaily: '10-20' }); executeCDSSRules();
  const f = state.lastCDSS.findings.find(x => /Yaşam tarzı/.test(x.title));
  return { gap: +(top.y - (u.y + u.height)).toFixed(1), detail: f.detail };
});
log('#11 Grafik birim etiketi en üst eksen sayısıyla çakışmaz; rapor cümlesi "güneşlenme" ile biter', r11.gap > 2 && /10–20 dakika güneşlenme\.$/.test(r11.detail), r11);

/* ---------- Bölüm 4: orijinal sade arayüz düzeni (V4 yüzen katmanları kaldırıldı) ---------- */
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true }); await sleep(300);
await p.evaluate(() => { try { finishVitaSpotlightTour(true, { stay: true, quiet: true }); } catch (_) {} navigateToView('view-home'); }); await sleep(300);
const u1 = await p.evaluate(() => {
  const h = document.querySelector('body > header');
  return { burger: !!h.querySelector('button[onclick="openAppDrawer()"] .fa-bars'), logo: !!h.querySelector('img[src*="icon-192"]'), search: !!h.querySelector('#globalSearchInput'), ring: !!h.querySelector('#btnHeaderDailySummary'), profile: !!h.querySelector('#headerProfileBtn, [onclick*="HeaderProfileMenu"]'),
    noTheme: !h.querySelector('.vt-dn, #vtThemeToggleHeader, [data-vt-theme]'), noV4: !document.querySelector('.vt-sb, .vt-bnav, #vtSpeedDial, .vt-burger, .vt-kbd') };
});
log('Üst bar: ☰ + logo, ortada arama, sağda uyum halkası + profil; tema düğmesi ve V4 katmanları yok', Object.values(u1).every(Boolean), u1);
const u1b = await p.evaluate(() => { navigateToView('view-settings'); return [...document.querySelectorAll('#settingsSectionTheme [data-vt-theme]')].map(b => b.textContent.trim()); });
log('Tema seçimi yalnızca Ayarlar > Görünüm\'de (Açık / Koyu / Sistem)', u1b.length === 3 && /Açık/.test(u1b[0]) && /Koyu/.test(u1b[1]) && /Sistem/.test(u1b[2]), u1b);
await p.evaluate(() => { navigateToView('view-home'); openAppDrawer(); }); await sleep(450);
const u2 = await p.evaluate(() => {
  const top = document.getElementById('drawerTopFixed'), mid = document.getElementById('drawerScrollArea'), bot = document.getElementById('drawerBottomFixed');
  const txt = el => [...el.querySelectorAll('button, a, .uppercase')].filter(x => x.offsetParent).map(x => x.textContent.replace(/\s+/g, ' ').trim());
  const t0 = top.getBoundingClientRect().top, b0 = bot.getBoundingClientRect().top;
  mid.scrollTop = 9999;
  const t1 = top.getBoundingClientRect().top, b1 = bot.getBoundingClientRect().top;
  const fab = document.getElementById('vitaAiFab').getBoundingClientRect();
  const hit = document.elementFromPoint(fab.left + fab.width / 2, fab.top + fab.height / 2);
  return { topHasNotif: !!top.querySelector('#drawerQuickNotifToggleBtn'), topHasProfile: !!top.querySelector('#drawerUserName') && !!top.querySelector('#drawerBmiBadge'), mid: txt(mid), bot: txt(bot),
    fixed: t0 === t1 && b0 === b1, botInView: bot.getBoundingClientRect().bottom <= innerHeight + 1, noAccordion: !document.querySelector('#appDrawer details, #appDrawer [aria-expanded]'), fabUnder: !!hit && (!!hit.closest('#appDrawer') || !!hit.closest('#drawerBackdrop')) };
});
const midExp = ['Sağlık Modülleri', 'Ana Sayfa & Günlük Protokol', 'Tahlillerim & e-Nabız PDF', 'NeyimVar? Belirti değerlendirmesi', 'Klinik Analiz Sonuçları', 'Doktora Götürülecek Rapor', 'İlaçlar & Takviyeler', '+ Takviye Ekle', '+ İlaç Ekle', 'Yönetim & Araçlar'];
log('Sol menü üst sabit alan: bildirim durumu + profil kartı (VKİ, kg/cm)', u2.topHasNotif && u2.topHasProfile, u2);
log('Sol menü orta alan düz liste, akordeon yok: Sağlık Modülleri → İlaçlar & Takviyeler → Yönetim & Araçlar (Ayarlar, eGFR, Vita Oyunlar)', u2.noAccordion && midExp.every((x, i) => u2.mid[i] && u2.mid[i].toLocaleLowerCase('tr') === x.toLocaleLowerCase('tr')) && /^Ayarlar.*Profil • AI • Yedek/.test(u2.mid[10]) && /eGFR/.test(u2.mid[11]) && /Vita Oyunlar/.test(u2.mid[12]), u2.mid);
log('Sol menü alt sabit alan: Uygulama Bilgileri & Yardım (Kılavuz, Geri Bildirim, Gizlilik) + Güvenli Çıkış; kaydırınca yerinde kalır', /Uygulama Bilgileri/i.test(u2.bot[0]) && /Kılavuz/.test(u2.bot[1]) && /Geri Bildirim/.test(u2.bot[2]) && /Gizlilik/.test(u2.bot[3]) && /Güvenli Çıkış/.test(u2.bot[4]) && u2.fixed && u2.botInView, u2.bot);
log('Yan menü açıkken VitaAI düğmesi menü/karartmanın altında kalır', u2.fabUnder, u2);
await p.evaluate(() => closeAppDrawer()); await sleep(400);
const u3 = await p.evaluate(() => {
  const nav = document.querySelector('nav.vita-mobile-nav'), strip = document.querySelector('.vms-strip'), fab = document.getElementById('vitaAiFab');
  const n = nav.getBoundingClientRect(), s = strip && strip.getBoundingClientRect(), f = fab.getBoundingClientRect();
  return { labels: [...nav.querySelectorAll('button')].map(x => x.textContent.trim()), full: Math.round(n.width) === innerWidth && Math.round(n.bottom) === innerHeight, stripAbove: !!s && s.height > 0 && s.bottom <= n.top + 1, fabAbove: !!s && f.bottom <= s.top + 1 && f.right > innerWidth - 90, noDial: !document.getElementById('vtSpeedDial') };
});
log('Alt bar: tam genişlik sabit 5 sekme (Ana Sayfa, Tahliller, NeyimVar?, Klinik Analiz, Rapor); üstünde bilgi şeridi; şeridin üstünde sağda yalnız VitaAI', u3.labels.join('|') === 'Ana Sayfa|Tahliller|NeyimVar?|Klinik Analiz|Rapor' && u3.full && u3.stripAbove && u3.fabAbove && u3.noDial, u3);
await p.evaluate(() => document.querySelector('.vms-strip').click()); await sleep(300);
const u3b = await p.evaluate(() => { const m = [...document.querySelectorAll('[role="dialog"], .fixed')].find(e => e.offsetParent && /Sorumluluk Reddi/i.test(e.textContent)); return !!m; });
log('Bilgi şeridi Tıbbi Sorumluluk Reddi penceresini açar', u3b);
await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('.vms-close, [data-vms-close]').forEach(b => b.offsetParent && b.click())); await sleep(200);
const u4 = await p.evaluate(() => {
  navigateToView('view-home');
  const order = [...document.querySelectorAll('#homeHeroCard, #homeHydrationCard, #homeCareTabs')].map(e => e.id).join('>');
  return { order, tabs: [...document.querySelectorAll('#homeCareTabs .vhs-dot')].map(d => d.textContent.trim()), water: [...document.querySelectorAll('#homeHydrationCard button')].map(b => b.textContent.trim()).join(' '), hero: [...document.querySelectorAll('#homeHeroActions button')].map(b => b.textContent.trim()) };
});
log('Ana Sayfa tek akış: karşılama → Günlük Sıvı Hedefi (+250/+500) → tek kartta Takviyelerim | İlaçlarım', u4.order === 'homeHeroCard>homeHydrationCard>homeCareTabs' && u4.tabs.join('|') === 'Takviyelerim|İlaçlarım' && /\+250 ml/.test(u4.water) && /\+500 ml/.test(u4.water) && /Buzdolabı/.test(u4.hero[0]) && /Belirtilerimi/.test(u4.hero[1]), u4);
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 }); await sleep(400);
const u5 = await p.evaluate(async () => { const d = document.getElementById('appDrawer').getBoundingClientRect(); openAppDrawer(); await new Promise(r => setTimeout(r, 400)); const o = document.getElementById('appDrawer').getBoundingClientRect(); closeAppDrawer(); return { hiddenAtStart: d.right <= 0, opens: Math.round(o.left) === 0, pad: getComputedStyle(document.body).paddingLeft, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
log('Masaüstü: sabit ray yok; menü ☰ ile soldan açılır, içerik kaymaz, taşma yok', u5.hiddenAtStart && u5.opens && u5.pad === '0px' && u5.sw === u5.iw, u5);

// Telefon genişliklerinde taşma
for (const w of [360, 430]) { await p.setViewport({ width: w, height: 800, deviceScaleFactor: 1, hasTouch: true }); await sleep(250); const o = await p.evaluate(() => { const r = []; for (const v of ['view-home', 'view-labs', 'view-settings']) { navigateToView(v); r.push(document.documentElement.scrollWidth); } return { sw: r, iw: innerWidth }; }); log(`${w} px: yatay taşma yok (Ana Sayfa, Tahliller, Ayarlar)`, o.sw.every(x => x === o.iw), o); }
log('Dış istek yok', ext.length === 0, ext.slice(0, 2).join(' '));
log('Sayfa hatası yok', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`ÖZET ${ok}/${ok + fail}`);
await b.close(); process.exit(fail ? 1 : 0);
