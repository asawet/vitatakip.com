/* Bildirim zamanlaması: zaman penceresi (arka planda yavaşlayan zamanlayıcı dakikayı atlasa da hatırlatma gelir),
   kaçırılanların tek özet bildirimi, doz başına günlük tekrar koruması, izin sonrası test bildiriminin
   servis çalışanından gitmesi (Android Chrome "new Notification()" çağrısını reddeder).
   Çalıştırma: VT_PORT=8090 node tests/bildirim-zamanlama.mjs */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot({ preload: () => {
  window.__notifs = [];
  window.__ctorCalls = 0;
  // Sahte Notification: izin "granted", doğrudan kurucu çağrısı sayılır (hiç çağrılmamalı)
  function FakeNotification() { window.__ctorCalls++; }
  Object.defineProperty(FakeNotification, 'permission', { get: () => 'granted' });
  FakeNotification.requestPermission = async () => 'granted';
  window.Notification = FakeNotification;
  if (navigator.serviceWorker) navigator.serviceWorker.getRegistration = async () => ({ showNotification: async (t, o) => { window.__notifs.push({ t, body: o && o.body, tag: o && o.tag }); } });
} });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-home'); });
await sleep(400);

/* Sayfa içi yardımcılar: şimdiden N dakika önceki "HH:MM" (gece yarısını geçerse null) */
await p.evaluate(() => {
  window.__hmAgo = n => { const d = new Date(Date.now() - n * 60000); if (d.getDate() !== new Date().getDate()) return null; return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  window.__fire = async () => { window.__notifs.length = 0; checkAndFireScheduledNotifications(); await new Promise(r => setTimeout(r, 250)); return window.__notifs.slice(); };
  state.supplements = []; state.medications = []; saveState();
});

/* 1) İzin verilince test bildirimi servis çalışanından gider; eski dakikalık anahtarlar temizlenir */
const t1 = await p.evaluate(async () => {
  localStorage.setItem('vitatakip_notifications_enabled', 'false');
  localStorage.setItem(`vitatakip_notif_fired_${activeUserId}_1.1.2025_08:00`, 'true');
  localStorage.setItem(`vitatakip_med_notif_fired_${activeUserId}_1.1.2025_08:00`, 'true');
  window.__notifs.length = 0;
  await toggleBrowserNotifications(); await new Promise(r => setTimeout(r, 300));
  const legacyLeft = Object.keys(localStorage).filter(k => /^vitatakip_(med_)?notif_fired_/.test(k) && !/_log$/.test(k)).length;
  return { enabled: localStorage.getItem('vitatakip_notifications_enabled'), notifs: window.__notifs.map(n => n.t), ctor: window.__ctorCalls, legacyLeft };
});
log('İzin verilince test bildirimi servis çalışanından gider (new Notification çağrılmaz)', t1.enabled === 'true' && t1.notifs.includes('VitaTakip Dozaj Hatırlatıcı Aktif') && t1.ctor === 0, JSON.stringify(t1));
log('Eski sürümün dakikalık bildirim anahtarları temizlenir', t1.legacyLeft === 0, String(t1.legacyLeft));

/* 2) Zamanlayıcı dakikayı atlasa da (saat 1 dk önce) hatırlatma normal şekilde gelir */
const t2 = await p.evaluate(async () => {
  const hm = __hmAgo(1); if (!hm) return { skip: true };
  state.supplements.push({ id: 'z1', name: 'Gecikmeli D3', timing: 'Sabah', scheduleTime: hm, toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() });
  const first = await __fire();
  const second = await __fire();
  return { hm, first: first.map(n => n.t), second: second.length };
});
log('Saati 1 dk önce geçen doz atlanmaz, normal hatırlatma gelir', t2.skip || (t2.first.length === 1 && t2.first[0] === `⏰ Gecikmeli D3 alma zamanı (${t2.hm})`), JSON.stringify(t2));
log('Aynı doz ikinci kez gönderilmez', t2.skip || t2.second === 0, JSON.stringify(t2));

/* 3) 15 ve 30 dk önce kaçırılan takviye + ilaç → tek özet bildirim */
const t3 = await p.evaluate(async () => {
  const a = __hmAgo(15), c = __hmAgo(30); if (!a || !c) return { skip: true };
  const twoHoursAgo = Date.now() - 2 * 3600000;
  state.supplements.push({ id: 'z2', name: 'Kaçan Magnezyum', timing: 'Sabah', scheduleTime: c, toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: twoHoursAgo });
  addVitaMedication({ name: 'Kaçan İlaç 5 mg', frequency: 'gunde1', clocks: [a], addedAt: twoHoursAgo });
  const first = await __fire();
  const again = await __fire();
  return { a, c, first: first.map(n => ({ t: n.t, body: n.body, tag: n.tag })), again: again.length };
});
const sum = t3.first && t3.first[0];
log('Kaçırılan takviye ve ilaç tek bir özet bildirimde toplanır (saat sırasıyla)', t3.skip || (t3.first.length === 1 && sum.t === '⏰ 2 hatırlatma kaçırıldı' && sum.tag === 'vita-missed' && sum.body.indexOf(`${t3.c} Kaçan Magnezyum`) === 0 && sum.body.includes(`${t3.a} Kaçan İlaç 5 mg`)), JSON.stringify(t3));
log('Özet bir kez gönderilir', t3.skip || t3.again === 0, JSON.stringify(t3));

/* 3b) Doz saatinden SONRA eklenen öğe "kaçırıldı" sayılmaz (21:35'te 21:15 saatiyle eklenen ilaç) */
const t3b = await p.evaluate(async () => {
  const hm = __hmAgo(20); if (!hm) return { skip: true };
  state.supplements.push({ id: 'z2b', name: 'Yeni Eklenen C', timing: 'Sabah', scheduleTime: hm, toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() });
  addVitaMedication({ name: 'Yeni Eklenen İlaç', frequency: 'gunde1', clocks: [hm] });
  return { notifs: (await __fire()).map(n => n.t + ' | ' + n.body) };
});
log('Doz saatinden sonra eklenen takviye/ilaç için "kaçırıldı" bildirimi gelmez', t3b.skip || t3b.notifs.length === 0, JSON.stringify(t3b));

/* 4) 60 dk'dan eski dozlar için bildirim yağdırılmaz; "Aldım" işaretli kaçırılan doz özete girmez */
const t4 = await p.evaluate(async () => {
  const old = __hmAgo(90), mid = __hmAgo(20); if (!old || !mid) return { skip: true };
  state.supplements.push({ id: 'z3', name: 'Çok Eski Çinko', timing: 'Sabah', scheduleTime: old, toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() });
  state.supplements.push({ id: 'z4', name: 'Alınmış B12', timing: 'Sabah', scheduleTime: mid, toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: true, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() });
  return { notifs: (await __fire()).map(n => n.t + ' | ' + n.body) };
});
log('60 dk\'dan eski ve "Aldım" işaretli dozlar için bildirim yok', t4.skip || t4.notifs.length === 0, JSON.stringify(t4));

/* 5) Gün değişince kayıt sıfırlanır (aynı saatteki doz ertesi gün yine hatırlatılır) */
const t5 = await p.evaluate(async () => {
  const hm = __hmAgo(0); if (!hm) return { skip: true };
  state.supplements.push({ id: 'z5', name: 'Her Gün Omega', timing: 'Sabah', scheduleTime: hm, toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() });
  const today = (await __fire()).filter(n => /Her Gün Omega/.test(n.t)).length;
  const key = `vitatakip_notif_fired_${activeUserId}_log`;
  const stored = JSON.parse(localStorage.getItem(key) || 'null');
  stored.date = '2000-01-01'; localStorage.setItem(key, JSON.stringify(stored));
  const nextDay = (await __fire()).filter(n => /Her Gün Omega/.test(n.t)).length;
  return { today, nextDay, persisted: !!stored && typeof stored.sent === 'object' };
});
log('Gönderim kaydı localStorage\'da tutulur, gün değişince sıfırlanır', t5.skip || (t5.persisted && t5.today === 1 && t5.nextDay === 1), JSON.stringify(t5));

/* 6) Bildirimler kapalıyken hiçbir bildirim gitmez */
const t6 = await p.evaluate(async () => {
  localStorage.setItem('vitatakip_notifications_enabled', 'false');
  localStorage.removeItem(`vitatakip_notif_fired_${activeUserId}_log`);
  localStorage.removeItem(`vitatakip_med_notif_fired_${activeUserId}_log`);
  const n = (await __fire()).length;
  localStorage.setItem('vitatakip_notifications_enabled', 'true');
  return n;
});
log('Bildirimler kapalıyken bildirim gitmez', t6 === 0, String(t6));

/* 7) Servis çalışanı: bildirime dokununca hedef adres açılır (yalnız aynı köken) */
const sw = await p.evaluate(async () => (await (await fetch('./service-worker.js', { cache: 'no-store' })).text()));
log('Servis çalışanı notificationclick: data.url kullanır, yalnız aynı köken', /notificationclick/.test(sw) && /notification\.data/.test(sw) && /u\.origin === self\.location\.origin/.test(sw));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
