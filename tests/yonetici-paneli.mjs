/* Yönetici Paneli (js/yonetici.js): Özet · Kullanıcılar · Doktorlar · İşlem kaydı · Rehber, sahte bulutla
   (tests/bulut-sahte.mjs; yetki taklidi: yönetici olmayana 42501 / 403).
   Gerçek yetki kuralları: supabase/migrations/20261128190000_yonetici_paneli.sql, 20261128210000_yonetici_genisletme.sql,
   supabase/functions/yonetici-islem (SQL davranış testleri oturumda yapıldı).
   Çalıştırma: VT_PORT=8090 node tests/yonetici-paneli.mjs  (VT_SHOTS=<klasör> ekran görüntüsü) */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakeCloudPreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const vis = id => p.evaluate(id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }, id);
const txt = id => p.evaluate(id => (document.getElementById(id) || {}).textContent || '', id);
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
const tab = async t => { await p.click(`[data-admin-tab="${t}"]`); await sleep(150); };
// CSS büyük harf dönüşümünden bağımsız: öğelerin kendi metni
const cardsIn = listId => p.evaluate(id => [...document.querySelectorAll('#' + id + ' .vad-card')].map(c => [...c.querySelectorAll('strong,.vad-code,.vdp-badge,.vad-tag,dt,dd,button')].map(e => e.textContent.trim()).join(' ')), listId);
const cards = () => cardsIn('vadDoctorList');
const btnFor = name => p.evaluate(n => { const c = [...document.querySelectorAll('#vadDoctorList .vad-card')].find(x => x.innerText.includes(n)); const b = c && c.querySelector('[data-admin-act]'); return b ? { text: b.innerText.trim(), act: b.getAttribute('data-admin-act') } : null; }, name);
const clickFor = name => p.evaluate(n => { const c = [...document.querySelectorAll('#vadDoctorList .vad-card')].find(x => x.innerText.includes(n)); c.querySelector('[data-admin-act]').click(); }, name);
const userCard = name => p.evaluate(n => { const c = [...document.querySelectorAll('#vadUserList .vad-card')].find(x => x.querySelector('.vad-name').textContent === n); return c ? { text: [...c.querySelectorAll('strong,.vad-code,.vad-tag,dt,dd')].map(e => e.textContent.trim()).join(' '), del: !!c.querySelector('[data-admin-delete]') } : null; }, name);

/* 1) Hesaplar: iki doktor (biri adında HTML denemesi), bir hasta (bulut verili), iki yönetici */
await signup('doctor', 'Dr. Ayşe Kaya', 'dr_ayse', 'doktor1'); await logout();
await signup('doctor', 'Dr. <img src=x onerror="window.__xss=1">Mehmet', 'mehmet@klinik.com', 'doktor2'); await logout();
const pelinUid = await signup('patient', 'Pelin Hasta', 'pelin', 'hasta11');
await p.evaluate(() => { state.supplements.push({ id: 's1', name: 'D3', timing: 'Sabah', scheduleTime: '08:00', scheduleDays: [] }); saveState(); }); await sleep(2500);
await logout();
const admin2 = await signup('patient', 'İkinci Yönetici', 'yonetici_iki', 'yonetici2'); await logout();
const adminUid = await signup('patient', 'Samet Yönetici', 'yonetici_s', 'yonetici1');

/* 2) Yönetici olmayan: menü yok, ekran açılmaz, sunucu reddeder */
const s2 = { drawer: await p.evaluate(() => !document.getElementById('drawerSectionAdmin').classList.contains('hidden')) };
await p.evaluate(() => navigateToView('view-admin')); await sleep(400);
s2.tab = await p.evaluate(() => state.activeTab);
s2.rpc = await p.evaluate(async () => { const c = await VitaCloud.getClient(); const r = await Promise.all(['admin_stats', 'admin_list_users', 'admin_list_doctors'].map(n => c.rpc(n))); return r.map(x => x.error ? x.error.code : 'AÇIK').join(','); });
s2.fn = await p.evaluate(async () => { const c = await VitaCloud.getClient(); const r = await c.functions.invoke('yonetici-islem', { body: { action: 'delete_user', user_id: activeUserId } }); return r.error ? (await r.error.context.json()).error : 'AÇIK'; });
log('Yönetici olmayan: menü yok, ekran açılmaz; özet/kullanıcı/doktor ve silme reddedilir', !s2.drawer && s2.tab !== 'view-admin' && s2.rpc === '42501,42501,42501' && s2.fn === 'forbidden', JSON.stringify(s2));
await logout();

/* 3) Yönetici: Özet açılır; "Yapılacaklar" ve genel durum kutuları */
await p.evaluate((a, b2) => { window.__admins = [a, b2]; }, adminUid, admin2);
await login('yonetici_s', 'yonetici1');
const s3 = { drawer: await vis('drawerSectionAdmin') };
await p.evaluate(() => navigateToView('view-admin')); await sleep(1000);
s3.tab = await p.evaluate(() => state.activeTab);
s3.overview = await vis('vadTab-overview');
s3.todo = await txt('vadTodo');
s3.stats = await p.evaluate(() => [...document.querySelectorAll('#vadStats .vad-stat')].map(x => x.querySelector('.vad-stat-label').textContent + '=' + x.querySelector('.vad-stat-value').textContent).join(' | '));
s3.badge = await txt('vadTabBadgeDoctors');
log('Yönetici: menü + ekran; varsayılan sekme Özet', s3.drawer && s3.tab === 'view-admin' && s3.overview, JSON.stringify({ drawer: s3.drawer, tab: s3.tab }));
log('Yapılacaklar: "2 doktor onay bekliyor"; Doktorlar sekmesinde rozet 2', /2 doktor onay bekliyor/.test(s3.todo) && s3.badge === '2', s3.todo.slice(0, 120));
log('Genel durum: toplam 5 hesap, onaylı doktor 0, bulut verisi, yapay zekâ', /Toplam hesap=5/.test(s3.stats) && /Onaylı doktor=0/.test(s3.stats) && /Bulut verisi=\d/.test(s3.stats) && /Yapay zekâ \(bugün\)=0 \/ 100/.test(s3.stats), s3.stats);
await shot('yonetici-1-ozet');

/* 4) Yapılacaklar → Doktorlar sekmesi; kartlar, XSS */
await p.click('[data-admin-goto="doctors"]'); await sleep(200);
const s4 = { doctors: await vis('vadTab-doctors'), overview: await vis('vadTab-overview'), tabs: await p.evaluate(() => [...document.querySelectorAll('[data-admin-filter]')].map(b => b.innerText.replace(/\s+/g, ' ').trim() + ':' + b.getAttribute('aria-selected')).join(' | ')) };
log('"Yapılacaklar" maddesi Doktorlar sekmesini açar; "Onay bekleyen 2" seçili', s4.doctors && !s4.overview && /Onay bekleyen 2:true/.test(s4.tabs), JSON.stringify(s4));
const c4 = await cards();
log('Doktor kartı: ad, kod, giriş, kayıt, hekim taahhüdü, aktif hasta', c4.length === 2 && c4.some(t => /Dr\. Ayşe Kaya/.test(t) && /DR-\d+/.test(t) && /@dr_ayse/.test(t) && /Hekim taahhüdü/.test(t) && /Aktif hasta 0/.test(t)) && c4.some(t => /mehmet@klinik\.com/.test(t)), c4.join(' || ').slice(0, 260));
const x4 = await p.evaluate(() => ({ xss: window.__xss || 0, imgs: document.querySelectorAll('#view-admin img').length }));
log('Kullanıcı adındaki HTML işlenmez', x4.xss === 0 && x4.imgs === 0, JSON.stringify(x4));

/* 5) Doktor arama ve onay (iki dokunuş) */
await fill('vadSearch', 'AYŞE'); await sleep(100);
const c5 = await cards(); await fill('vadSearch', '');
log('Doktor araması (büyük harf)', c5.length === 1 && /Ayşe/.test(c5[0]));
await clickFor('Ayşe'); await sleep(150);
const b5 = await btnFor('Ayşe');
await clickFor('Ayşe'); await sleep(800);
const s5 = await p.evaluate(() => ({ msg: vadMsg.textContent, verified: (window.__verifiedDoctors || []).length, audit: vadAuditList.textContent, badge: vadTabBadgeDoctors.textContent }));
log('Onay: ilk dokunuş sorar, ikincisi onaylar; mesaj, rozet 1, işlem kaydı', /Emin misiniz\? Onayla/.test(b5.text) && s5.verified === 1 && /onaylandı/.test(s5.msg) && s5.badge === '1' && /onayladı: Dr\. Ayşe Kaya/.test(s5.audit), JSON.stringify(s5).slice(0, 300));
await clickFor('Mehmet'); await sleep(4400);
log('4 sn içinde ikinci dokunuş yoksa iptal', (await btnFor('Mehmet')).text === 'Onayla' && (await p.evaluate(() => window.__verifiedDoctors.length)) === 1);

/* 6) Kullanıcılar: liste, etiketler, silinemeyenler */
await tab('users');
const u6 = { me: await userCard('Samet Yönetici'), other: await userCard('İkinci Yönetici'), pelin: await userCard('Pelin Hasta'), ayse: await userCard('Dr. Ayşe Kaya'),
  counts: await p.evaluate(() => [...document.querySelectorAll('[data-admin-ufilter]')].map(b => b.innerText.replace(/\s+/g, ' ').trim()).join(' | ')) };
log('Kullanıcılar: Tümü 5 · Hasta 3 · Doktor 2', /Tümü 5/.test(u6.counts) && /Hasta 3/.test(u6.counts) && /Doktor 2/.test(u6.counts), u6.counts);
log('Kart: giriş, tür, kayıt, son giriş, bulut verisi (içerik değil), kurtarma kodu', u6.pelin && /@pelin/.test(u6.pelin.text) && /Hasta/.test(u6.pelin.text) && /Son giriş/.test(u6.pelin.text) && /\d+ kayıt türü · \d/.test(u6.pelin.text) && /Kurtarma kodu Var/.test(u6.pelin.text) && !/D3/.test(u6.pelin.text), u6.pelin && u6.pelin.text);
log('Kendi hesabı ("Siz") ve başka yönetici silinemez (düğme yok); hasta ve doktor silinebilir', u6.me && /Siz/.test(u6.me.text) && !u6.me.del && u6.other && /Yönetici/.test(u6.other.text) && !u6.other.del && u6.pelin.del && u6.ayse.del, JSON.stringify({ me: u6.me && u6.me.del, other: u6.other && u6.other.del }));
await p.click('[data-admin-ufilter="doctor"]'); await sleep(100);
const u6d = await cardsIn('vadUserList');
await p.click('[data-admin-ufilter="all"]'); await fill('vadUserSearch', 'pelin'); await sleep(100);
const u6s = await cardsIn('vadUserList'); await fill('vadUserSearch', '');
log('Kullanıcı süzgeci (Doktor) ve arama', u6d.length === 2 && u6d.every(t => /Doktor/.test(t)) && u6s.length === 1, JSON.stringify({ d: u6d.length, s: u6s.length }));
await shot('yonetici-2-kullanicilar');

/* 7) Hesap silme: giriş bilgisi yazılmadan düğme kapalı; yanlış bilgi; doğru bilgi + gerekçe → silinir, kayda düşer */
await p.evaluate(() => { const c = [...document.querySelectorAll('#vadUserList .vad-card')].find(x => x.querySelector('.vad-name').textContent === 'Pelin Hasta'); c.querySelector('[data-admin-delete]').click(); }); await sleep(200);
const d7 = { box: await vis('vadDeleteConfirm'), disabled: await p.evaluate(() => vadDeleteGo.disabled), warn: await p.evaluate(() => document.querySelector('.vad-delete-warn').textContent) };
await fill('vadDeleteConfirm', 'pelinn'); await sleep(50);
d7.wrong = await p.evaluate(() => vadDeleteGo.disabled);
await fill('vadDeleteConfirm', '@PELIN'); await sleep(50);
d7.right = await p.evaluate(() => vadDeleteGo.disabled);
log('Silme onayı: uyarı (kalıcı, geri alınamaz); yanlış giriş bilgisinde düğme kapalı, doğrusunda (@ ve büyük harf) açık', d7.box && d7.disabled && d7.wrong && !d7.right && /KALICI/.test(d7.warn) && /Geri alınamaz/.test(d7.warn), JSON.stringify(d7));
await shot('yonetici-3-silme-onayi');
await fill('vadDeleteNote', 'KVKK silme talebi, 28.11.2026');
await p.click('#vadDeleteGo'); await sleep(900);
const s7 = { msg: await txt('vadUserMsg'), gone: !(await userCard('Pelin Hasta')), db: await p.evaluate(id => window.__db().filter(r => r.user_id === id).length, pelinUid), audit: await txt('vadAuditList') };
log('Silindi: mesaj, listeden düşer, Pelin’in bulut verisi gider; işlem kaydında gerekçesiyle', /Pelin Hasta \(@pelin\) hesabı ve buluttaki tüm kayıtları silindi/.test(s7.msg) && s7.gone && s7.db === 0 && /hesabı sildi: Pelin Hasta \(@pelin, hasta\)/.test(s7.audit) && /Gerekçe: KVKK silme talebi/.test(s7.audit), JSON.stringify(s7).slice(0, 320));
const s7b = await p.evaluate(async id => { const c = await VitaCloud.getClient(); const r = await c.functions.invoke('yonetici-islem', { body: { action: 'delete_user', user_id: id, confirm: '@yonetici_iki' } }); return r.error ? (await r.error.context.json()).error : 'SİLİNDİ'; }, admin2);
const s7c = await p.evaluate(async () => { const c = await VitaCloud.getClient(); const r = await c.functions.invoke('yonetici-islem', { body: { action: 'delete_user', user_id: activeUserId, confirm: '@yonetici_s' } }); return r.error ? (await r.error.context.json()).error : 'SİLİNDİ'; });
log('Sunucu da reddeder: başka yönetici ve kendi hesabı silinemez', s7b === 'target_admin' && s7c === 'self', JSON.stringify({ s7b, s7c }));

/* 8) İşlem kaydı ve Rehber sekmeleri */
await tab('audit');
const a8 = await p.evaluate(() => [...document.querySelectorAll('#vadAuditList .vad-audit-row')].map(r => r.getAttribute('data-action')));
await tab('guide');
const g8 = await p.evaluate(() => ({ vis: document.getElementById('vadTab-guide').getClientRects().length > 0, t: document.getElementById('vadTab-guide').textContent }));
log('İşlem kaydı sekmesi: silme + onay; Rehber: onay, görünürlük, KVKK, acil durum', a8.includes('user_delete') && a8.includes('doctor_verify') && g8.vis && /Doktor onayı/.test(g8.t) && /Göremez/.test(g8.t) && /30 gün/.test(g8.t) && /SQL Editor/.test(g8.t), JSON.stringify(a8));
await shot('yonetici-4-rehber');

/* 9) Görünüm: taşma, masaüstü, koyu tema, simgeler */
await tab('overview');
const ov = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
await p.setViewport({ width: 1200, height: 900 }); await sleep(300);
const ovD = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth, cols: getComputedStyle(vadStats).gridTemplateColumns.split(' ').length }));
await shot('yonetici-5-masaustu');
await p.setViewport({ width: 390, height: 844 }); await sleep(200);
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await tab('users'); await sleep(200);
await shot('yonetici-6-koyu');
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
log('Yatay taşma yok; masaüstünde özet 4 sütun', ov.sw <= ov.iw + 1 && ovD.sw <= ovD.iw + 1 && ovD.cols === 4, JSON.stringify({ ov, ovD }));
const icons = await p.evaluate(() => [...document.querySelectorAll('#view-admin i[class*="fa-"], #drawerSectionAdmin i[class*="fa-"]')].map(i => ({ c: [...i.classList].find(x => x.startsWith('fa-') && x !== 'fa-solid'), ok: (getComputedStyle(i, '::before').content || '').replace(/"/g, '').trim().length === 1 })).filter(x => !x.ok).map(x => x.c));
log('Yönetici paneli simgeleri tanımlı', icons.length === 0, icons.join(', '));

/* 10) Çıkış */
await logout();
log('Çıkışta "Yönetici Paneli" menüsü gizlenir', !(await vis('drawerSectionAdmin')));
const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
