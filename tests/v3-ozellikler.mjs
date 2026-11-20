// V3 özellikleri: koyu/açık/sistem tema, parametre kaynak penceresi (i), eşik sürümü, eritrosit folatı + homosistein,
// kalsiyum/MCV kaynaklı eşikler, kontrol ölçümü hatırlatması (+ .ics), yerel paylaşım kartı. Dış istek olmamalı.
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
p.on('dialog', d => d.accept());
const ext = [];
p.on('request', r => { const u = r.url(); if (!/^(http:\/\/localhost|data:|blob:)/.test(u)) ext.push(u); });
let ok = 0, fail = 0;
const log = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' -> ' + extra : ''}`); };
const prep = () => p.evaluate(() => { try { closeProfileModal(); } catch (_) {} try { localStorage.setItem('vitatakip_spotlight_seen_' + activeUserId, '1'); document.getElementById('vitaSpotlightLayer')?.classList.add('hidden'); } catch (_) {} });
await prep();

/* 1) Tema */
await p.evaluate(() => document.querySelector('[data-vt-theme="dark"]').click()); await sleep(200);
const t1 = await p.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), meta: document.querySelector('meta[name="color-scheme"]').content, bg: getComputedStyle(document.body).backgroundColor, store: localStorage.getItem('vitatakip_theme') }));
log('Koyu tema: html[data-theme=dark], color-scheme dark, koyu zemin, tercih kaydı', t1.attr === 'dark' && t1.meta === 'dark' && /rgb\(2, 6, 23\)/.test(t1.bg) && t1.store === 'dark', JSON.stringify(t1));
await p.reload({ waitUntil: 'networkidle0' }); await sleep(1200); await prep();
log('Koyu tema yenilemeden sonra ilk boyamada uygulanıyor', await p.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'));
await p.emulateMediaType('print'); await sleep(150);
const printBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
await p.emulateMediaType('screen');
log('Yazdırmada koyu tema uygulanmaz (zemin beyaz/açık)', /255, 255, 255|248, 250, 252|rgba\(0, 0, 0, 0\)/.test(printBg), printBg);
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await p.evaluate(() => document.querySelector('[data-vt-theme="system"]').click()); await sleep(150);
const sysDark = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]); await sleep(200);
const sysLight = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
log('Sistem modu cihaz temasını izler (koyu → açık)', sysDark === 'dark' && sysLight === null, `${sysDark} → ${sysLight}`);
await p.evaluate(() => document.querySelector('[data-vt-theme="light"]').click()); await sleep(150);
log('Açık tema varsayılan görünüme döner', await p.evaluate(() => !document.documentElement.hasAttribute('data-theme') && document.querySelector('[data-vt-theme="light"]').getAttribute('aria-pressed') === 'true'));

/* 2) Kaynak penceresi + eşik sürümü */
await p.evaluate(() => navigateToView('view-labs')); await sleep(500);
const nI = await p.evaluate(() => document.querySelectorAll('#view-labs .vkb-i').length);
log('Tahlil kartlarında 14 adet (i) kaynak düğmesi', nI === 14, String(nI));
await p.evaluate(() => document.querySelector('#view-labs [data-vt-src="d3"]').click()); await sleep(300);
const m1 = await p.evaluate(() => { const m = document.getElementById('vitaSourceModal'); return { open: m && !m.classList.contains('hidden'), title: document.getElementById('vkbTitle')?.textContent, n: m.querySelectorAll('.vkb-src').length, doi: [...m.querySelectorAll('.vkb-src a')].some(a => /doi\.org\/10\.1210\/clinem\/dgae290/.test(a.href)), ver: document.getElementById('vkbVer')?.textContent }; });
log('(i) → sade pencere: başlık, kaynaklar, Endocrine Society 2024 DOI, eşik sürümü', m1.open && /25-OH D/.test(m1.title) && m1.n >= 2 && m1.doi && /Kasım 2026/.test(m1.ver), JSON.stringify(m1));
await p.keyboard.press('Escape'); await sleep(150);
log('Esc ile kapanır', await p.evaluate(() => document.getElementById('vitaSourceModal').classList.contains('hidden')));
await p.evaluate(() => navigateToView('view-report')); await sleep(500);
const rep = await p.evaluate(() => document.getElementById('reportThresholdVersion')?.textContent || '');
await p.evaluate(() => document.querySelector('#reportPrintFooterMeta [data-vt-src="all"]').click()); await sleep(250);
const all = await p.evaluate(() => document.querySelectorAll('#vitaSourceModal .vkb-src').length);
log('Rapor altbilgisinde eşik sürümü ve tam kaynak listesi', /Kasım 2026/.test(rep) && all >= 12, `${rep} · ${all} kaynak`);
await p.evaluate(() => VitaSourceInfo.close());

/* 3) Yeni alanlar + kaynaklı eşikler */
const ev = await p.evaluate(() => {
  const E = VitaLabEvidence;
  return { ca12: E.evaluate('ca', 12.4).clinical.level, ca11: E.evaluate('ca', 11).clinical.level, mcv: E.evaluate('mcv', 76).clinical.level, rbc: E.evaluate('rbcFolate', 120).clinical.level, hcy: E.evaluate('hcy', 18).clinical.level, keys: ALL_VITA_LAB_KEYS.includes('rbcFolate') && ALL_VITA_LAB_KEYS.includes('hcy') };
});
log('Kaynaklı eşikler: Ca ≥12 acil, 11 inceleme; MCV 76 sınırda; eritrosit folatı 120 düşük; homosistein 18 inceleme; yedek anahtarları', ev.ca12 === 'urgent' && ev.ca11 === 'high_review' && ev.mcv === 'borderline' && ev.rbc === 'low_likely' && ev.hcy === 'high_review' && ev.keys, JSON.stringify(ev));
await p.evaluate(() => { state.labHistory = [{ id: 'lab_v3t', date: vitaLocalToday(), b12: 310, ferritin: 22, rbcFolate: 120, hcy: 22, references: {}, genderAtTest: 'K', timestamp: Date.now() }]; saveState(); executeCDSSRules(); });
const titles = await p.evaluate(() => [...(state.lastCDSS.findings || []), ...(state.lastCDSS.contraindications || [])].map(f => f.title).join(' | '));
log('Analizde eritrosit folatı ve homosistein değerlendiriliyor', /Eritrosit folatı/.test(titles) && /Homosistein/.test(titles), titles.slice(0, 160));

/* 4) Kontrol ölçümü hatırlatması + .ics */
await p.evaluate(() => navigateToView('view-clinical-results')); await sleep(800);
const card = await p.evaluate(() => !!document.getElementById('vitaRecheckCard'));
log('Sınırda/referans dışı değerler için hatırlatma kartı görünür', card);
await p.evaluate(() => { document.getElementById('vrcWeeks').value = '8'; document.querySelector('[data-vrc="set"]').click(); }); await sleep(400);
const rc = await p.evaluate(() => { const l = VitaRecheck.load(); const d = new Date(); d.setDate(d.getDate() + 56); const exp = d.toISOString().slice(0, 10); return { n: l.length, due: l[0]?.due, exp, keys: l[0]?.keys, cardSet: /Hatırlatıcı kuruldu/.test(document.getElementById('vitaRecheckCard')?.textContent || '') }; });
log('Hatırlatıcı yerel olarak kuruldu (8 hafta), kart durumu güncellendi', rc.n === 1 && Math.abs(new Date(rc.due) - new Date(rc.exp)) <= 864e5 && rc.cardSet, JSON.stringify(rc));
const ics = await p.evaluate(() => VitaRecheck.buildIcs(VitaRecheck.load()[0]));
const lines = ics.split('\r\n');
const enc = new TextEncoder();
log('.ics geçerli: VCALENDAR/VEVENT, tüm gün tarihi, alarm, CRLF, satırlar ≤75 sekizli', /^BEGIN:VCALENDAR\r\n/.test(ics) && /DTSTART;VALUE=DATE:\d{8}/.test(ics) && /BEGIN:VALARM/.test(ics) && /END:VCALENDAR\r\n$/.test(ics) && lines.every(l => enc.encode(l).length <= 75), `${lines.length} satır`);
log('.ics dosyasında sonuç değerleri yok (yalnızca test adları)', !/\b(310|120|22)\b/.test(ics.replace(/DTSTAMP:\S+|DTSTART[^\r]+|DTEND[^\r]+|UID:\S+/g, '')));
await p.evaluate(() => { const l = VitaRecheck.load(); l[0].due = '2020-01-01'; l[0].created = '2019-12-01'; localStorage.setItem('vitatakip_recheck_' + activeUserId, JSON.stringify(l)); state.labHistory = state.labHistory.map(h => ({ ...h, date: '2019-11-01' })); VitaRecheck.tick(); navigateToView('view-home'); }); await sleep(400);
const home = await p.evaluate(() => { const h = document.getElementById('vitaRecheckHome'); return h && !h.classList.contains('hidden') && /Kontrol tahlili zamanı/.test(h.textContent); });
log('Vadesi gelen hatırlatma Ana Sayfa\'da görünür', home);
await p.evaluate(() => { state.labHistory.unshift({ id: 'lab_yeni', date: vitaLocalToday(), b12: 420, references: {}, genderAtTest: 'K', timestamp: Date.now() }); saveState(); VitaRecheck.tick(); }); await sleep(200);
log('Yeni kontrol tahlili girilince hatırlatma kendiliğinden tamamlanır', await p.evaluate(() => VitaRecheck.load().length === 0 && document.getElementById('vitaRecheckHome').classList.contains('hidden')));

/* 5) Paylaşım kartı (cihazda) */
await p.evaluate(() => navigateToView('view-report')); await sleep(400);
await p.evaluate(() => document.getElementById('btnShareSummaryCard').click()); await sleep(900);
const sc = await p.evaluate(() => { const img = document.getElementById('vpkPreview'); return { open: !document.getElementById('vitaShareCardModal').classList.contains('hidden'), png: /^data:image\/png/.test(img.src), w: img.naturalWidth, name: document.getElementById('vpkName').checked, boxes: document.querySelectorAll('#vpkParams input').length }; });
log('Paylaşım kartı cihazda PNG (1080×1350) olarak üretilir; ad varsayılan olarak eklenmez', sc.open && sc.png && sc.w === 1080 && sc.name === false, JSON.stringify(sc));
const dl = await p.evaluate(() => new Promise(res => { const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { HTMLAnchorElement.prototype.click = orig; res({ name: this.download, blob: /^blob:/.test(this.href) }); }; document.querySelector('[data-vpk="download"]').click(); setTimeout(() => res(null), 3000); }));
log('PNG indir: blob bağlantısı, .png dosya adı', dl && dl.blob && /^vitatakip-ozet-\d{8}\.png$/.test(dl.name), JSON.stringify(dl));
await p.evaluate(() => VitaShareCard.close());

log('Dış sunucuya istek yok', ext.length === 0, ext.slice(0, 3).join(' '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${ok}/${ok + fail}`);
await b.close(); process.exit(fail ? 1 : 0);
