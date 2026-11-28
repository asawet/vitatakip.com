/* Yönetici Paneli (js/yonetici.js), sahte bulutla (tests/bulut-sahte.mjs; yetki taklidi: yönetici olmayana 42501).
   Gerçek yetki kuralları: supabase/migrations/20261128190000_yonetici_paneli.sql (SQL davranış testi oturumda yapıldı).
   Çalıştırma: VT_PORT=8090 node tests/yonetici-paneli.mjs  (VT_SHOTS=<klasör> ekran görüntüsü) */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakeCloudPreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const vis = id => p.evaluate(id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }, id);
const fill = (id, v) => p.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
const shot = async name => { if (process.env.VT_SHOTS) await p.screenshot({ path: process.env.VT_SHOTS + '/' + name + '.png', fullPage: true }); };
const close = () => p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
async function signup(acct, name, id, pass) {
  await p.evaluate(a => { VitaAuthUI.showCloud(); VitaAuthUI.setAcct(a); VitaAuthUI.setMode('register'); }, acct);
  await fill('cloudInputFullName', name); await fill('cloudInputIdentifier', id); await fill('cloudInputPassword', pass); await fill('cloudInputPasswordConfirm', pass);
  await p.evaluate(a => { if (a === 'doctor') cloudDoctorConsentCheckbox.checked = true; else cloudConsentCheckbox.checked = true; }, acct);
  await p.click('#cloudSubmitBtn'); await sleep(1500); await close();
  return p.evaluate(() => activeUserId);
}
async function login(id, pass) {
  await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
  await fill('cloudInputIdentifier', id); await fill('cloudInputPassword', pass); await p.click('#cloudSubmitBtn'); await sleep(2000); await close();
}
const logout = async () => { await p.evaluate(() => handleLogout()); await sleep(400); };
// CSS büyük harf dönüşümünden bağımsız: öğelerin kendi metni
const cards = () => p.evaluate(() => [...document.querySelectorAll('#vadDoctorList .vad-card')].map(c => [...c.querySelectorAll('strong,.vad-code,.vdp-badge,dt,dd,button')].map(e => e.textContent.trim()).join(' ')));
const btnFor = name => p.evaluate(n => { const c = [...document.querySelectorAll('#vadDoctorList .vad-card')].find(x => x.innerText.includes(n)); const b = c && c.querySelector('[data-admin-act]'); return b ? { text: b.innerText.trim(), act: b.getAttribute('data-admin-act'), id: b.getAttribute('data-admin-target') } : null; }, name);
const clickFor = name => p.evaluate(n => { const c = [...document.querySelectorAll('#vadDoctorList .vad-card')].find(x => x.innerText.includes(n)); c.querySelector('[data-admin-act]').click(); }, name);

/* 1) İki doktor (biri takma ad, biri e-posta; adında HTML denemesi) ve bir yönetici adayı */
await signup('doctor', 'Dr. Ayşe Kaya', 'dr_ayse', 'doktor1');
await logout();
await signup('doctor', 'Dr. <img src=x onerror="window.__xss=1">Mehmet', 'mehmet@klinik.com', 'doktor2');
await logout();
const adminUid = await signup('patient', 'Samet Yönetici', 'yonetici_s', 'yonetici1');

/* 2) Yönetici olmayan: menü yok, ekran açılmaz, sunucu reddeder */
const s2 = { drawer: await vis('drawerSectionAdmin') };
await p.evaluate(() => navigateToView('view-admin')); await sleep(400);
s2.tab = await p.evaluate(() => state.activeTab);
s2.rpc = await p.evaluate(async () => { const c = await VitaCloud.getClient(); const r = await c.rpc('admin_list_doctors'); return r.error ? r.error.code : 'AÇIK'; });
log('Yönetici olmayan: "Yönetici Paneli" menüsü yok, ekran açılmaz, sunucu reddeder (42501)', !s2.drawer && s2.tab !== 'view-admin' && s2.rpc === '42501', JSON.stringify(s2));
const g2 = await p.evaluate(async () => { const c = await VitaCloud.getClient(); const r = await c.rpc('grant_doctor_access', { p_code: 'DR-1000' }); return r.data && r.data.reason; });
log('Onaysız doktora hasta izin veremez', g2 === 'not_verified', g2);
await logout();

/* 3) Yönetici (sunucuda is_admin=true): girişte menü görünür */
await p.evaluate(id => { window.__admins = [id]; }, adminUid);
await login('yonetici_s', 'yonetici1');
const s3 = { drawer: await vis('drawerSectionAdmin') };
await p.evaluate(() => navigateToView('view-admin')); await sleep(900);
s3.tab = await p.evaluate(() => state.activeTab);
s3.name = await p.evaluate(() => vadAdminName.textContent);
s3.tabs = await p.evaluate(() => [...document.querySelectorAll('[data-admin-filter]')].map(b => b.innerText.replace(/\s+/g, ' ').trim() + ':' + b.getAttribute('aria-selected')).join(' | '));
log('Yönetici: yan menüde "Yönetici Paneli", ekran açılır; "Onay bekleyen 2" seçili', s3.drawer && s3.tab === 'view-admin' && s3.name === 'Samet Yönetici' && /Onay bekleyen 2:true/.test(s3.tabs) && /Onaylı 0/.test(s3.tabs), JSON.stringify(s3));
const c3 = await cards();
log('Kartlar: ad, kod, giriş (takma ad / e-posta), kayıt, hekim taahhüdü, aktif hasta', c3.length === 2 && c3.some(t => /Dr\. Ayşe Kaya/.test(t) && /DR-\d+/.test(t) && /@dr_ayse/.test(t) && /Hekim taahhüdü/.test(t) && /Aktif hasta 0/.test(t)) && c3.some(t => /mehmet@klinik\.com/.test(t)), c3.join(' || ').slice(0, 300));
const x3 = await p.evaluate(() => ({ xss: window.__xss || 0, imgs: document.querySelectorAll('#vadDoctorList img').length }));
log('Doktorun yazdığı ad HTML olarak işlenmez', x3.xss === 0 && x3.imgs === 0 && c3.some(t => /<img src=x/.test(t)), JSON.stringify(x3));
await shot('yonetici-1-bekleyen');

/* 4) Arama */
await fill('vadSearch', 'AYŞE'); await sleep(100);
const c4 = await cards();
await fill('vadSearch', 'klinik.com'); await sleep(100);
const c4b = await cards();
await fill('vadSearch', 'yok-boyle'); await sleep(100);
const e4 = await p.evaluate(() => vadDoctorList.innerText);
await fill('vadSearch', '');
log('Arama: ad (büyük/küçük harf), e-posta; eşleşme yoksa açıklama', c4.length === 1 && /Ayşe/.test(c4[0]) && c4b.length === 1 && /mehmet/.test(c4b[0]) && /eşleşen doktor yok/.test(e4), JSON.stringify({ c4: c4.length, c4b: c4b.length, e4 }));

/* 5) Onayla: ilk dokunuş "Emin misiniz?", ikincisi onaylar */
await clickFor('Ayşe'); await sleep(150);
const b5 = await btnFor('Ayşe');
const v5a = await p.evaluate(() => (window.__verifiedDoctors || []).length);
log('İlk dokunuş yalnız sorar ("Emin misiniz? Onayla"), henüz onaylamaz', /Emin misiniz\? Onayla/.test(b5.text) && v5a === 0, JSON.stringify(b5));
await clickFor('Ayşe'); await sleep(700);
const s5 = await p.evaluate(() => ({ msg: vadMsg.textContent, tabs: [...document.querySelectorAll('[data-admin-filter]')].map(b => b.innerText.replace(/\s+/g, ' ').trim()).join(' | '), verified: (window.__verifiedDoctors || []).length, list: vadDoctorList.innerText, audit: vadAuditList.innerText }));
log('İkinci dokunuş onaylar: mesaj, sayaçlar (bekleyen 1, onaylı 1), bekleyenlerden düşer, işlem kaydı', s5.verified === 1 && /Dr\. Ayşe Kaya \(DR-\d+\) onaylandı/.test(s5.msg) && /Onay bekleyen 1/.test(s5.tabs) && /Onaylı 1/.test(s5.tabs) && !/Ayşe/.test(s5.list) && /Samet Yönetici onayladı: Dr\. Ayşe Kaya/.test(s5.audit), JSON.stringify(s5).slice(0, 400));
await shot('yonetici-2-onaylandi');

/* 6) "Emin misiniz?" 4 sn içinde onaylanmazsa geri döner */
await clickFor('Mehmet'); await sleep(4400);
const b6 = await btnFor('Mehmet');
log('4 saniye içinde ikinci dokunuş yoksa düğme eski haline döner, onay verilmez', b6.text === 'Onayla' && (await p.evaluate(() => window.__verifiedDoctors.length)) === 1, JSON.stringify(b6));

/* 7) Onaylı süzgeci + onayı kaldır */
await p.click('[data-admin-filter="verified"]'); await sleep(150);
const c7 = await cards();
await clickFor('Ayşe'); await sleep(100); await clickFor('Ayşe'); await sleep(700);
const s7 = await p.evaluate(() => ({ verified: window.__verifiedDoctors.length, msg: vadMsg.textContent, audit: vadAuditList.innerText }));
log('"Onaylı" süzgeci; "Onayı kaldır" (iki dokunuş) erişimi kapatır, kayda yazılır', c7.length === 1 && /Onaylı/.test(c7[0]) && s7.verified === 0 && /onay kaldırıldı/.test(s7.msg) && /onayı kaldırdı: Dr\. Ayşe Kaya/.test(s7.audit), JSON.stringify(s7).slice(0, 300));
await p.click('[data-admin-filter="all"]'); await sleep(150);
log('"Tümü" süzgeci iki doktoru gösterir', (await cards()).length === 2);

/* 8) Telefon/masaüstü taşma, koyu tema, simgeler */
const ov = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
await p.setViewport({ width: 1200, height: 900 }); await sleep(300);
const ovD = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth, cols: getComputedStyle(vadDoctorList).gridTemplateColumns.split(' ').length }));
await shot('yonetici-3-masaustu');
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await sleep(200);
await p.setViewport({ width: 390, height: 844 }); await sleep(300);
await shot('yonetici-4-koyu');
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
log('Yatay taşma yok (telefon, masaüstü); masaüstünde kartlar iki sütun', ov.sw <= ov.iw + 1 && ovD.sw <= ovD.iw + 1 && ovD.cols === 2, JSON.stringify({ ov, ovD }));
const icons = await p.evaluate(() => [...document.querySelectorAll('#view-admin i[class*="fa-"], #drawerSectionAdmin i[class*="fa-"]')].map(i => ({ c: [...i.classList].find(x => x.startsWith('fa-') && x !== 'fa-solid'), ok: (getComputedStyle(i, '::before').content || '').replace(/"/g, '').trim().length === 1 })).filter(x => !x.ok).map(x => x.c));
log('Yönetici paneli simgeleri tanımlı', icons.length === 0, icons.join(', '));

/* 9) Çıkış: menü gizlenir */
await logout();
log('Çıkışta "Yönetici Paneli" menüsü gizlenir', !(await vis('drawerSectionAdmin')));
const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
