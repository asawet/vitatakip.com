/* İzin durumları: tarayıcı izni VERİP KAYDETMEDİĞİNDE (uygulama dosyadan, file:// açılınca Chrome'un davranışı)
   arayüz "İzin Verildi / Açık" göstermeli. Önceki hata: "Bildirimler Açıldı" mesajına rağmen menüde KAPALI,
   Ayarlar'da "Henüz İstenmedi / İzin Bekleniyor"; kamera onaylandı mesajına rağmen "Onay Bekliyor" kalıyordu.
   Sahte API'ler: Notification.permission hep "default", requestPermission → "granted";
   permissions.query hep "prompt" (window.__denyAll ile "denied"); getUserMedia başarılı.
   Çalıştırma: VT_PORT=8090 node tests/izin-durum.mjs */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot({ preload: () => {
  window.__notifs = [];
  window.__perm = 'default';
  function FakeNotification() {}
  Object.defineProperty(FakeNotification, 'permission', { get: () => window.__perm });
  FakeNotification.requestPermission = async () => 'granted'; // izin verildi ama kaydedilmedi
  window.Notification = FakeNotification;
  if (navigator.serviceWorker) navigator.serviceWorker.getRegistration = async () => ({ showNotification: async (t, o) => { window.__notifs.push({ t, body: o && o.body }); } });
  const q = async () => ({ state: window.__denyAll ? 'denied' : 'prompt', onchange: null });
  try { Object.defineProperty(navigator, 'permissions', { value: { query: q }, configurable: true }); } catch (e) {}
  const gum = async () => ({ getTracks: () => [{ stop() {} }] });
  try { Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum, enumerateDevices: async () => [] }, configurable: true }); } catch (e) {}
} });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-settings'); });
await sleep(400);

const ui = () => p.evaluate(() => ({
  drawer: (document.getElementById('drawerQuickNotifStateBadge') || {}).textContent,
  perm: (document.getElementById('settingsBrowserPermBadge') || {}).textContent,
  btn: (document.getElementById('drawerNotifToggleBtn') || {}).textContent,
  cam: (document.getElementById('settingsCameraPermBadge') || {}).textContent,
  mic: (document.getElementById('settingsMicPermBadge') || {}).textContent,
  note: !document.getElementById('permFileProtocolNote').classList.contains('hidden')
}));

/* 1) Bildirim: izin verildi ama tarayıcı kaydetmedi → arayüz yine de "Açık / İzin Verildi" */
const n = await p.evaluate(async () => {
  localStorage.setItem('vitatakip_notifications_enabled', 'false');
  window.__notifs.length = 0;
  await toggleBrowserNotifications(); await new Promise(r => setTimeout(r, 300));
  return { notifs: window.__notifs.map(x => x.t), enabled: localStorage.getItem('vitatakip_notifications_enabled') };
});
const u1 = await ui();
log('İzin verilince menüde "Açık", Ayarlar\'da "Tarayıcı İzni: İzin Verildi" ve "Açık (Aktif)"', u1.drawer === 'Açık' && u1.perm === 'Tarayıcı İzni: İzin Verildi' && u1.btn === 'Açık (Aktif)', JSON.stringify(u1));
log('Test bildirimi gerçekten gönderilir (önceden izin "default" göründüğü için engelleniyordu)', n.enabled === 'true' && n.notifs.includes('VitaTakip Dozaj Hatırlatıcı Aktif'), JSON.stringify(n));

/* 2) Kamera ve mikrofon: izin verildi, permissions.query yine "prompt" diyor → "Onaylandı / İzin Verildi" */
await p.evaluate(async () => { await requestOrVerifyCameraPermission(true); await VitaPermissions.testMicrophone(); await new Promise(r => setTimeout(r, 300)); });
const u2 = await ui();
log('Kamera izni verilince "Kamera İzni: Onaylandı ✓" (sorgu "prompt" dese de)', u2.cam === 'Kamera İzni: Onaylandı ✓', u2.cam);
log('Mikrofon izni verilince "Mikrofon İzni: İzin Verildi"', u2.mic === 'Mikrofon İzni: İzin Verildi', u2.mic);

/* 3) Tarayıcı açıkça engellerse oturum onayı geçersiz: "Reddedildi" ve bildirim gönderilmez */
const d = await p.evaluate(async () => {
  window.__perm = 'denied'; window.__denyAll = true;
  updateNotificationToggleUI(); await VitaPermissions.renderMic(); await new Promise(r => setTimeout(r, 300));
  window.__notifs.length = 0; const sent = await vitaShowNotification('x', 'y', 'z');
  return { sent, n: window.__notifs.length };
});
const u3 = await ui();
log('Tarayıcı "denied" derse her zaman o geçerli (Reddedildi / Engellendi, bildirim yok)', u3.perm === 'Tarayıcı İzni: Reddedildi' && u3.drawer === 'Kapalı' && /Engellendi/.test(u3.cam) && /Reddedildi/.test(u3.mic) && d.sent === false && d.n === 0, JSON.stringify({ u3, d }));

/* 4) Site adresinden (http/https) açılınca "dosyadan açıldı" uyarısı görünmez */
log('Sunucudan açılınca "dosyadan açıldı" uyarısı gizli', u3.note === false);

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
