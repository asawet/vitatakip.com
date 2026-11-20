/* Sol menü "İlaçlar & Takviyeler", "Bugünkü ilaçlarım" kartı (Aldım + 00:00 sıfırlama), ilaç hatırlatıcısı
   ("İlaç Vakti: [ad] alma zamanınız geldi") ve yerel profil fotoğrafı (Canvas 150x150, yedeğe dahil). */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot({ preload: () => {
  // Bildirimler: izin verilmiş say; gösterilen bildirimleri yakala (servis çalışanı yolu + klasik yol)
  window.__notifs = [];
  try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); } catch (e) {}
  if (navigator.serviceWorker) navigator.serviceWorker.getRegistration = async () => ({ showNotification: async (t, o) => { window.__notifs.push({ t, body: o && o.body, via: 'sw' }); } });
} });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
let confirmAnswer = true; p.on('dialog', d => (d.type() === 'confirm' ? (confirmAnswer ? d.accept() : d.dismiss()) : d.accept()));
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-home'); window.scrollTo(0, 0); });
await sleep(600);

/* 1) Sol menü: Sağlık Modülleri'nin hemen altında "İlaçlar & Takviyeler" */
const menu = await p.evaluate(() => {
  const sec = document.getElementById('drawerSectionMedsSupps');
  const titles = Array.from(document.querySelectorAll('#appDrawer nav [class*="uppercase"], nav .uppercase')).map(e => e.innerText.trim());
  return { title: sec?.querySelector('.uppercase')?.textContent.trim(), btns: Array.from(sec?.querySelectorAll('button') || []).map(x => x.innerText.trim()), afterReport: !!sec && document.getElementById('drawer-nav-view-report').compareDocumentPosition(sec) === Node.DOCUMENT_POSITION_FOLLOWING, beforeSettings: !!sec && (sec.compareDocumentPosition(document.getElementById('drawer-nav-view-settings')) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 };
});
log('Sol menüde Sağlık Modülleri altında "İLAÇLAR & TAKVİYELER": + Takviye Ekle, + İlaç Ekle', menu.title === 'İlaçlar & Takviyeler' && menu.btns.join('|') === '+ Takviye Ekle|+ İlaç Ekle' && menu.afterReport && menu.beforeSettings, JSON.stringify(menu));
await p.evaluate(() => { openAppDrawer(); document.getElementById('drawer-add-supplement').click(); }); await sleep(400);
const m1 = await p.evaluate(() => ({ sup: !document.getElementById('addSupplementModal').classList.contains('hidden'), title: document.getElementById('vsaTitle').innerText }));
await p.evaluate(() => { closeAddSupplementModal(); openAppDrawer(); document.getElementById('drawer-add-medication').click(); }); await sleep(400);
const m2 = await p.evaluate(() => ({ med: !document.getElementById('addMedicationModal').classList.contains('hidden'), title: document.getElementById('vamTitle').innerText, tab: state.activeTab, supClosed: document.getElementById('addSupplementModal').classList.contains('hidden') }));
log('Menüden "+ Takviye Ekle" tam ekran takviye sayfasını, "+ İlaç Ekle" tam ekran İlaç Ekle sayfasını açar', m1.sup && m1.title === 'Takviye Ekle' && m2.med && m2.title === 'İlaç Ekle' && m2.tab === 'view-add-medication' && m2.supClosed, JSON.stringify({ m1, m2 }));
await p.evaluate(() => closeAddMedicationModal());

/* 2) Ana Sayfa: "İlaç Kalkanı" yok; "Bugünkü ilaçlarım" kartı, sağ üstte "+ İlaç Ekle"; "İlaç kontrolü" yok */
const home = await p.evaluate(() => {
  const card = document.getElementById('todayMedsCard'); const btn = document.getElementById('btnOpenAddMedication');
  const t = card.querySelector('#todayMedsTitle'); const cr = card.getBoundingClientRect(), br = btn.getBoundingClientRect(), tr = t.getBoundingClientRect();
  return { shieldBtn: !!document.getElementById('btnQuickMedShieldTrigger') || /İlaç Kalkanı/.test(document.getElementById('guideDailyProtocolTarget').closest('.bg-white').innerText),
    oldDrawer: !!document.getElementById('dailyProtocolMedicationsDrawer') || document.getElementById('view-home').innerText.includes('İlaç kontrolü'),
    visible: !card.classList.contains('hidden') && cr.height > 0, title: t.innerText.trim(), btnTopRight: br.right > cr.right - 40 && br.top - tr.top < 70, empty: /Henüz ilaç yok/.test(card.innerText) };
});
log('"Bugünkü takviyelerim" içinde "İlaç Kalkanı" düğmesi yok', !home.shieldBtn);
log('"İlaç kontrolü" kartı "Bugünkü ilaçlarım" oldu: sağ üstte "+ İlaç Ekle", ilaç yokken boş durum', home.visible && /^Bugünkü ilaçlarım\s+\S+/.test(home.title) && home.btnTopRight && home.empty && !home.oldDrawer, JSON.stringify(home));

/* 3) İlaç ekle: ad + sıklık + alım saati → "Aldım" işaretlenir; etkileşim denetimi sürer */
await p.evaluate(() => document.getElementById('btnOpenAddMedication').click()); await sleep(300);
await p.evaluate(() => { document.getElementById('addMedName').value = 'Euthyrox 50 mcg'; document.querySelector('#vamVakits [data-vakit="Akşam"]').click(); });
const clk = await p.evaluate(() => Array.from(document.querySelectorAll('#addMedClocks .vsp-hm')).map(g => g.querySelector('.vsp-hh').value + ':' + g.querySelector('.vsp-mm').value));
log('Sabah + Akşam seçilince iki alım saati kutusu (09:00, 20:00; dijital SS:DD) çıkar ve düzenlenebilir', clk.join() === '09:00,20:00', JSON.stringify(clk));
await p.evaluate(() => { VitaMedPage.setClock('Sabah', '08:30'); VitaMedPage.setClock('Akşam', '21:15'); commitAddMedication(); }); await sleep(500);
await p.evaluate(() => { state.supplements.push({ id: 'mg', name: 'Magnezyum Bisglisinat', timing: 'Akşam', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], scheduledDate: vitaLocalToday(), addedDate: Date.now() }); saveState(); renderDailyTab(); detectSupplementConflicts(); });
await sleep(300);
const row = await p.evaluate(() => {
  const med = state.medications.find(m => /Euthyrox/.test(m.name));
  const groups = Array.from(document.querySelectorAll('#todayMedsList .vsg-head .vsg-label')).map(x => x.innerText);
  const rows = Array.from(document.querySelectorAll('#todayMedsList .vtm-row')).map(r => r.innerText.replace(/\s+/g, ' ').trim());
  return { clocks: med?.clocks, groups, rows, ix: document.querySelector('#conflictShieldAlertBanner details.vsk')?.innerText || '', counter: document.getElementById('todayMedsCounter').innerText };
});
log('İlaç saatleriyle kaydedilir ve saat grubuna göre listelenir (Sabah 08:30, Gece 21:15)', row.clocks?.join() === '08:30,21:15' && row.groups.join() === 'Sabah,Gece' && row.rows.length === 2 && row.rows.every(r => /Euthyrox/.test(r)) && /08:30/.test(row.rows[0]) && row.counter === '0/2 alındı', JSON.stringify(row));
log('İlaç–takviye etkileşim denetimi arka planda çalışmaya devam eder (Emniyet Kalkanı)', /Emniyet Kalkanı: \d+ etkileşim/.test(row.ix), row.ix.slice(0, 60));
await p.evaluate(() => document.querySelector('#todayMedsList input[data-dose="08:30"]').click()); await sleep(250);
const taken = await p.evaluate(() => ({ counter: document.getElementById('todayMedsCounter').innerText, row: document.querySelector('#todayMedsList input[data-dose="08:30"]').closest('.vtm-row').innerText.replace(/\s+/g, ' ') }));
log('"Aldım" işaretlenir (sayaç 1/2, satırda "aldım")', taken.counter === '1/2 alındı' && /aldım/.test(taken.row), JSON.stringify(taken));
await p.evaluate(() => { const k = `vitatakip_med_taken_${activeUserId}`; const v = JSON.parse(localStorage.getItem(k)); v.date = '2000-01-01'; localStorage.setItem(k, JSON.stringify(v)); state.medTaken = v; document.dispatchEvent(new Event('visibilitychange')); }); await sleep(200);
const reset = await p.evaluate(() => document.getElementById('todayMedsCounter').innerText);
log('Gün değişince (00:00) "Aldım" işaretleri sıfırlanır', reset === '0/2 alındı', reset);

/* 4) Hatırlatıcı: "İlaç Vakti: [ad] alma zamanınız geldi" */
const notif = await p.evaluate(async () => {
  localStorage.setItem('vitatakip_notifications_enabled', 'true');
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  addVitaMedication({ name: 'Parol 500 mg', frequency: 'gunde1', clocks: [hm] });
  window.__notifs.length = 0;
  checkAndFireScheduledNotifications(); await new Promise(r => setTimeout(r, 300));
  const first = window.__notifs.slice();
  checkAndFireScheduledNotifications(); await new Promise(r => setTimeout(r, 300));
  const again = window.__notifs.length;
  // Alındı işaretli dozda hatırlatma yok
  const med = findVitaMedication('Parol 500 mg'); setVitaMedicationDoseTaken(med.id, hm, true);
  localStorage.removeItem(Object.keys(localStorage).find(k => k.startsWith('vitatakip_med_notif_fired_')) || '_');
  window.__notifs.length = 0; checkAndFireScheduledNotifications(); await new Promise(r => setTimeout(r, 300));
  return { first, again, afterTaken: window.__notifs.length, hm };
});
log('Alım saati gelince "💊 İlaç Vakti: Parol 500 mg" — "İlaç Vakti: Parol 500 mg alma zamanınız geldi" (servis çalışanı ile)', notif.first.length === 1 && notif.first[0].t === '💊 İlaç Vakti: Parol 500 mg' && /^İlaç Vakti: Parol 500 mg alma zamanınız geldi/.test(notif.first[0].body) && notif.first[0].via === 'sw', JSON.stringify(notif.first));
log('Aynı dakikada tekrar gönderilmez; "Aldım" işaretli doz için hatırlatma yok', notif.again === 1 && notif.afterTaken === 0, JSON.stringify({ again: notif.again, afterTaken: notif.afterTaken }));
const hint = await p.evaluate(() => { localStorage.setItem('vitatakip_notifications_enabled', 'false'); openAddMedicationModal(); const h = document.getElementById('addMedNotifHint'); const r = { shown: !h.classList.contains('hidden'), text: h.innerText }; closeAddMedicationModal(); localStorage.setItem('vitatakip_notifications_enabled', 'true'); return r; });
log('Bildirimler kapalıysa İlaç Ekle sayfası açmayı önerir', hint.shown && /Bildirimleri aç/.test(hint.text), JSON.stringify(hint));

/* 5) Silme (onaylı) */
confirmAnswer = false;
await p.evaluate(() => document.querySelector('#todayMedsList .vtm-row .vsc-del').click()); await sleep(200);
const keep = await p.evaluate(() => state.medications.length);
confirmAnswer = true;
await p.evaluate(() => { const btn = Array.from(document.querySelectorAll('#todayMedsList .vtm-row')).find(r => /Parol/.test(r.innerText))?.querySelector('.vsc-del'); btn.click(); }); await sleep(300);
const del = await p.evaluate(() => ({ n: state.medications.length, names: state.medications.map(m => m.name), profile: state.user.medications }));
log('Silme onay ister; onaylanınca ilaç listeden ve profilden kalkar', keep === 2 && del.n === 1 && !del.names.includes('Parol 500 mg') && !del.profile.includes('Parol 500 mg'), JSON.stringify({ keep, del }));

/* 6) Profil fotoğrafı: Canvas 150x150, yerel, avatarlar, yedek */
await p.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 800; c.height = 500; const x = c.getContext('2d');
  x.fillStyle = '#0ea5e9'; x.fillRect(0, 0, 800, 500); x.fillStyle = '#f43f5e'; x.fillRect(300, 150, 200, 200);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  window.__photo = new File([blob], 'IMG_1234.png', { type: 'image/png' });
});
const req = [];
p.on('request', r => { const u = r.url(); if (!/^https?:\/\/localhost[:/]|^data:|^blob:/.test(u)) req.push(u); });
await p.evaluate(() => { openProfileModal(true); const inp = document.getElementById('profilePhotoInput'); const dt = new DataTransfer(); dt.items.add(window.__photo); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); });
await sleep(1200);
const ph = await p.evaluate(async () => {
  const v = localStorage.getItem(`vitatakip_avatar_${activeUserId}`) || '';
  const img = new Image(); img.src = v; await img.decode().catch(() => {});
  const pick = id => document.querySelector(`#${id} img`)?.getAttribute('src') === v;
  return { type: (v.match(/^data:(image\/\w+)/) || [])[1], len: v.length, w: img.naturalWidth, h: img.naturalHeight, drawer: pick('drawerUserAvatar'), header: pick('headerUserAvatar'), preview: pick('profilePhotoPreview'), inUser: JSON.stringify(state.user).includes('data:image'), rmVisible: !document.getElementById('btnRemoveProfilePhoto').classList.contains('hidden') };
});
log('Seçilen fotoğraf Canvas ile 150x150 kareye küçültülür, WebP/JPEG olarak sıkıştırılır', /image\/(webp|jpeg)/.test(ph.type) && ph.w === 150 && ph.h === 150 && ph.len < 60000, JSON.stringify({ type: ph.type, w: ph.w, h: ph.h, len: ph.len }));
log('Fotoğraf sol menü, üst bar ve profil penceresinde görünür; profil kaydına (yapay zekâ bağlamına) karışmaz', ph.drawer && ph.header && ph.preview && !ph.inUser && ph.rmVisible, JSON.stringify(ph));
log('Fotoğraf hiçbir dış sunucuya gönderilmez', req.length === 0, req.join(', '));
const bk = await p.evaluate(() => { let saved = ''; const orig = window.vitaSaveTextFile; window.vitaSaveTextFile = (n, t, c) => { saved = c; return true; }; try { exportDataBackup(); } finally { window.vitaSaveTextFile = orig; } return saved; });
const bkPhoto = JSON.parse(bk || '{}').profilePhoto || '';
log('JSON yedeğinde profil fotoğrafı var', /^data:image\/(webp|jpeg);base64,/.test(bkPhoto), String(bkPhoto.length));
await p.evaluate(() => VitaProfilePhoto.remove()); await sleep(200);
const removed = await p.evaluate(() => ({ stored: localStorage.getItem(`vitatakip_avatar_${activeUserId}`), icon: !!document.querySelector('#drawerUserAvatar .fa-user') }));
log('"Kaldır" fotoğrafı siler ve varsayılan simgeye döner', removed.stored === null && removed.icon, JSON.stringify(removed));
await p.evaluate(async content => {
  const input = document.createElement('input'); input.type = 'file';
  const dt = new DataTransfer(); dt.items.add(new File([content], 'yedek.json', { type: 'application/json' })); input.files = dt.files;
  importDataBackup({ target: input });
}, bk);
await sleep(1500);
const restored = await p.evaluate(() => ({ stored: (localStorage.getItem(`vitatakip_avatar_${activeUserId}`) || '').slice(0, 22), drawer: !!document.querySelector('#drawerUserAvatar img'), meds: state.medications.map(m => m.name) }));
log('Yedek geri yüklenince profil fotoğrafı da geri gelir', /^data:image\/(webp|jpeg)/.test(restored.stored) && restored.drawer && restored.meds.includes('Euthyrox 50 mcg'), JSON.stringify(restored));
const bad = await p.evaluate(() => VitaProfilePhoto.isValid('data:image/svg+xml;base64,PHN2Zz4=') || VitaProfilePhoto.isValid('javascript:alert(1)') || VitaProfilePhoto.isValid('x'.repeat(10)));
log('Yedekten yalnızca güvenli görsel biçimleri kabul edilir (SVG/kod reddedilir)', bad === false);

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
