/* Açılış hızı: açılış ekranının (#vitaSplash) kapanma süresi, istek sayısı ve aktarılan boyut.
   İlk ziyaret yavaş 4G benzeri ağda, ikinci ziyaret önbellekten (servis çalışanı) ölçülür.
   Kullanım: node acilis-hizi.mjs [adres]   (varsayılan http://localhost:8080/) */
import puppeteer from 'puppeteer-core';
const base = (process.argv[2] || 'http://localhost:8080/').replace(/\/?$/, '/');
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const cdp = await p.target().createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

async function measure(label) {
  let requests = 0, bytes = 0;
  const onResp = e => { requests++; };
  const onDone = e => { bytes += e.encodedDataLength || 0; };
  cdp.on('Network.responseReceived', onResp); cdp.on('Network.loadingFinished', onDone);
  await p.evaluateOnNewDocument(() => {
    window.__splashGone = null;
    const check = () => { if (window.__splashGone === null && !document.getElementById('vitaSplash') && document.body) window.__splashGone = performance.now(); };
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
  });
  await p.goto(base + 'index.html', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction(() => window.__splashGone !== null, { timeout: 120000 });
  const t = await p.evaluate(() => ({ splash: Math.round(window.__splashGone), dcl: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd), css: document.querySelectorAll('link[rel=stylesheet]').length, js: document.querySelectorAll('script[src]').length }));
  cdp.off('Network.responseReceived', onResp); cdp.off('Network.loadingFinished', onDone);
  console.log(`${label}: açılış ekranı ${t.splash} ms kapandı | DOMContentLoaded ${t.dcl} ms | ${requests} istek, ${(bytes / 1024).toFixed(0)} KB | sayfada ${t.css} CSS, ${t.js} JS etiketi`);
  return t;
}
const first = await measure('İlk ziyaret (yavaş 4G, 4x yavaş işlemci)');
await new Promise(r => setTimeout(r, 1500));
const second = await measure('Tekrar ziyaret (önbellek)');
console.log(JSON.stringify({ first: first.splash, second: second.splash }));
await b.close(); process.exit(0);
