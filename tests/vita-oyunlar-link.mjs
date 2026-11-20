/* Sol menü > Yönetim & Araçlar > "Vita Oyunlar": eGFR'nin hemen altında, yeni sekmede vita-oyunlar GitHub Pages adresi.
   Service worker başka kaynağa (github.io) giden isteği yakalamaz. */
import { boot, sleep } from './lib.mjs';
import fs from 'node:fs';
const { b, p, errs } = await boot({});
await p.setViewport({ width: 390, height: 844 });
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} openAppDrawer(); });
await sleep(300);
const link = await p.evaluate(() => {
  const a = document.getElementById('drawer-nav-vita-oyunlar'), egfr = document.getElementById('drawer-nav-egfr-calculator');
  const sec = a.closest('.space-y-1');
  return { tag: a.tagName, href: a.href, target: a.target, rel: a.rel, text: a.innerText.trim(), icon: !!a.querySelector('.fa-brain'), afterEgfr: egfr.nextElementSibling === a,
    section: sec.querySelector('.uppercase').textContent.trim(), sameStyle: a.className === egfr.className && a.querySelector('i').className.replace('fa-brain', '') === egfr.querySelector('i').className.replace('fa-calculator', ''), visible: a.getBoundingClientRect().height > 0 };
});
log('"Vita Oyunlar" Yönetim & Araçlar altında, eGFR Böbrek Hesaplayıcı\'nın hemen altında, aynı stil ve ikon yapısı', link.tag === 'A' && link.afterEgfr && link.section === 'Yönetim & Araçlar' && link.sameStyle && link.icon && link.visible && /Vita Oyunlar/.test(link.text), JSON.stringify(link));
log('Hedef: https://asawet05.github.io/vita-oyunlar/ — target="_blank" rel="noopener noreferrer"', link.href === 'https://asawet05.github.io/vita-oyunlar/' && link.target === '_blank' && link.rel === 'noopener noreferrer', JSON.stringify(link));
// Tıklanınca yeni sekme açılır, menü kapanır, uygulama yerinde kalır
const newTarget = new Promise(r => b.once('targetcreated', t => r(t.url())));
await p.evaluate(() => document.getElementById('drawer-nav-vita-oyunlar').click());
const url = await Promise.race([newTarget, sleep(5000).then(() => 'zaman aşımı')]);
const after = await p.evaluate(() => ({ app: location.hostname, drawerClosed: document.getElementById('appDrawer')?.classList.contains('hidden') || !document.getElementById('appDrawer')?.classList.contains('open') }));
log('Tıklayınca oyunlar yeni sekmede açılır; VitaTakip sekmesi yerinde kalır', /asawet05\.github\.io\/vita-oyunlar/.test(url) && after.app === 'localhost', `${url} · ${JSON.stringify(after)}`);
const sw = fs.readFileSync(new URL('../service-worker.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'utf8').replace(/\s+/g, '');
log('Service worker başka kaynağa giden isteği yakalamaz (github.io bağlantısı engellenmez)', /if\(url\.origin!==self\.location\.origin\)return;/.test(sw));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
