/* Tüm butonlar ve olay işleyicileri:
   1) Statik: sayfadaki (ve sonradan üretilen) her on* niteliğinin çağırdığı genel fonksiyon gerçekten var mı?
   2) Dinamik: her görünümde görünür tüm butonlar/sekmeler/kartlar tek tek tıklanır; sayfa hatası (TypeError vb.),
      konsol hatası veya yakalanmamış Promise hatası üreten öğe raporlanır.
   Yazdırma, e-posta ve dosya seçici gibi sayfadan çıkaran işlemler zararsızlaştırılır; hesap silme reddedilir. */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
p.setDefaultTimeout(20000);
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const consoleErrors = [];
p.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR_FILE_NOT_FOUND|Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
p.on('dialog', d => (d.type() === 'prompt' ? d.accept('hayır') : d.type() === 'confirm' ? d.dismiss() : d.accept()));
p.on('filechooser', fc => fc.cancel().catch(() => {}));
await p.evaluate(() => {
  window.print = () => {};
  window.open = () => null;
  window.__rejections = [];
  window.addEventListener('unhandledrejection', e => window.__rejections.push(String(e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  try { closeProfileModal(); } catch (e) {}
  try { finishVitaSpotlightTour(true); } catch (e) {}
});
// mailto: gezintisini engelle
await p.setRequestInterception(true);
p.on('request', r => (r.url().startsWith('mailto:') ? r.abort() : r.continue()));

/* Örnek veri: boş ekranlarda gizli kalan düğmeler de görünsün */
await p.evaluate(() => {
  state.user = { ...state.user, age: 45, gender: 'K', height: 165, weight: 64, chronic: ['Levotiroksin'] };
  state.supplements = [{ id: 's1', name: 'D3 Vitamini 1000 IU', timing: 'Sabah', taken: false }, { id: 's2', name: 'Magnezyum', timing: 'Akşam', taken: false }];
  saveState(); renderAllAppViews();
});
await p.evaluate(() => navigateToView('view-labs')); await sleep(300);
await p.evaluate(() => { for (const [id, v] of Object.entries({ inputLabFerritin: '12', inputLabB12: '190', inputLabD3: '15', inputLabHb: '11.2' })) { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } } saveCurrentLabRecordWithDate(); });
await sleep(500);

/* 1) Statik denetim: on* nitelikleri */
const handlerCheck = async () => p.evaluate(() => {
  const missing = new Set();
  const skip = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof', 'function', 'event', 'this', 'new', 'catch', 'Boolean', 'String', 'Number', 'parseInt', 'parseFloat', 'setTimeout', 'clearTimeout', 'encodeURIComponent', 'confirm', 'alert', 'prompt', 'Array', 'Object', 'JSON', 'Math', 'Date']);
  document.querySelectorAll('*').forEach(el => {
    for (const attr of el.attributes) {
      if (!/^on[a-z]+$/.test(attr.name)) continue;
      const code = attr.value.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
      for (const m of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
        const fn = m[2];
        if (skip.has(fn)) continue;
        // "typeof X === 'function' && X()" veya "if (window.X) X()" korumalıysa atla
        if (new RegExp(`typeof\\s+(window\\.)?${fn}\\s*={2,3}\\s*""|window\\.${fn}\\s*\\)|window\\.${fn}\\s*&&`).test(code)) continue;
        if (typeof window[fn] !== 'function') missing.add(`${fn}  ← <${el.tagName.toLowerCase()}${el.id ? ' #' + el.id : ''}> ${attr.name}`);
      }
    }
  });
  return [...missing];
});

/* 2) Dinamik: görünümleri gez, her tıklanabilir öğeye bas */
const views = await p.evaluate(() => [...document.querySelectorAll('[id^="view-"]')].map(v => v.id).filter(id => /^view-[a-z-]+$/.test(id)));
const problems = [];
const missingAll = new Set();
let clicked = 0;
async function resetTo(view) {
  await p.evaluate(v => {
    document.querySelectorAll('.fixed:not(header):not(nav)').forEach(m => {
      if (/modal/i.test(m.id) && !m.classList.contains('hidden') && m.id !== 'authModal') { m.classList.add('hidden'); m.style.display = 'none'; }
    });
    ['closeProfileModal', 'closeAddSupplementModal', 'closeBarcodeScannerModal', 'closeENabizModal', 'closeAppDrawer'].forEach(f => { try { window[f] && window[f](); } catch (_) {} });
    try { if (typeof stopScanner === 'function') stopScanner(); } catch (_) {}
    try { navigateToView(v); } catch (_) {}
    window.scrollTo(0, 0);
  }, view);
  await sleep(150);
}
for (const view of views) {
  await resetTo(view);
  (await handlerCheck()).forEach(x => missingAll.add(x));
  const count = await p.evaluate(v => {
    const root = document.getElementById(v);
    const sel = 'button, [onclick], [role="button"], [role="tab"], summary, .anamnesis-card';
    const els = [...document.querySelectorAll(sel)].filter(el => {
      if (el.closest('#authModal, #vitaSplash, .no-audit')) return false;
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && el.offsetParent !== null;
      if (!visible) return false;
      if (/deleteMyAccountData|handleLogout|clearAllData|resetAll/i.test(el.getAttribute('onclick') || '')) return false;
      return root.contains(el) || el.closest('header, nav, #viewHeaderBar');
    });
    els.forEach((el, i) => el.setAttribute('data-audit', `${v}:${i}`));
    return els.length;
  }, view);
  for (let i = 0; i < count; i++) {
    const before = { e: errs.length, c: consoleErrors.length };
    const info = await p.evaluate(key => {
      window.__rejections = [];
      const el = document.querySelector(`[data-audit="${key}"]`);
      if (!el || el.offsetParent === null) return null;
      const label = (el.getAttribute('aria-label') || el.innerText || el.id || el.className || '').toString().replace(/\s+/g, ' ').trim().slice(0, 50);
      try { el.click(); } catch (e) { return { label, thrown: String(e && e.message) }; }
      return { label };
    }, `${view}:${i}`);
    if (!info) continue;
    clicked++;
    await sleep(220);
    const rej = await p.evaluate(() => window.__rejections.splice(0));
    const newErrs = errs.slice(before.e).concat(consoleErrors.slice(before.c), rej, info.thrown ? [info.thrown] : []);
    if (newErrs.length) problems.push(`${view} · "${info.label}": ${newErrs[0].slice(0, 160)}`);
    (await handlerCheck()).forEach(x => missingAll.add(x));
    await resetTo(view);
    // tıklama başka görünüme götürdüyse kalan öğeler için işaretleri koru
  }
}
/* 3) Pencereler: her biri kendi fonksiyonuyla açılır, içindeki her düğmeye basılır */
const MODALS = [
  ['openProfileModal(false)', '#profileModal'],
  ['openAddSupplementModal()', '#addSupplementModal'],
  ["openBarcodeScannerModal('medication','all')", '#barcodeScannerModal'],
  ['openENabizModal()', '#eNabizModal'],
  ['openKvkkInfoModal()', '#kvkkInfoModal'],
  ['openVitaFeedback()', '#feedbackModal'],
  ['VitaAIChat.openDoctorQuestions()', '#doctorQuestionsModal'],
  ['openAppDrawer()', '#appDrawer'],
  ['VitaAIChat.toggle(true)', '#vita-ai-chatbox'],
  ['openEgfrCalculator()', '#vitaEgfrModal'],
  ['VitaPwaInstall.openHelp()', '#pwaInstallHelp'],
  ["openSymptomReviewModal('s1')", '#symptomReviewModal'],
  ['showLabReferenceGuide()', '#labReferenceGuideModal'],
  ['openOnboardingModal()', '#onboardingModal'],
  ['toggleHeaderProfileMenu({ stopPropagation(){} })', '#headerProfileDropdownMenu'],
];
let modalClicks = 0; const modalNotOpened = [];
for (const [opener, sel] of MODALS) {
  const open = async () => p.evaluate((o, s) => { try { (0, eval)(o); } catch (e) { return 'açılamadı: ' + e.message; } return null; }, opener, sel);
  await resetTo('view-home');
  const err = await open(); await sleep(300);
  if (err) { problems.push(`${sel}: ${err}`); continue; }
  const count = await p.evaluate(s => {
    const root = document.querySelector(s);
    if (!root || root.offsetParent === null && getComputedStyle(root).position !== 'fixed') return -1;
    const els = [...root.querySelectorAll('button, [onclick], [role="button"], [role="tab"], summary, label[for]')].filter(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0) || el.disabled) return false;
      if (/deleteMyAccountData|handleLogout|startAddSupModalScanner|startBarcodeCameraScan/i.test(el.getAttribute('onclick') || '')) return false;
      return true;
    });
    els.forEach((el, i) => el.setAttribute('data-audit-m', `${s}:${i}`));
    return els.length;
  }, sel);
  if (count < 0) { modalNotOpened.push(sel); continue; }
  for (let i = 0; i < count; i++) {
    const before = { e: errs.length, c: consoleErrors.length };
    const info = await p.evaluate(key => {
      window.__rejections = [];
      const el = document.querySelector(`[data-audit-m="${key}"]`);
      if (!el || !(el.getBoundingClientRect().width > 0)) return null;
      const label = (el.getAttribute('aria-label') || el.innerText || el.id || '').toString().replace(/\s+/g, ' ').trim().slice(0, 50);
      try { el.click(); } catch (e) { return { label, thrown: String(e && e.message) }; }
      return { label };
    }, `${sel}:${i}`);
    if (!info) { await resetTo('view-home'); await open(); await sleep(250); continue; }
    modalClicks++;
    await sleep(250);
    const rej = await p.evaluate(() => window.__rejections.splice(0));
    const newErrs = errs.slice(before.e).concat(consoleErrors.slice(before.c), rej, info.thrown ? [info.thrown] : []);
    if (newErrs.length) problems.push(`${sel} · "${info.label}": ${newErrs[0].slice(0, 160)}`);
    (await handlerCheck()).forEach(x => missingAll.add(x));
    // pencere kapandıysa yeniden aç
    const stillOpen = await p.evaluate(s => { const r = document.querySelector(s); return Boolean(r) && !r.classList.contains('hidden') && !r.hidden && getComputedStyle(r).display !== 'none'; }, sel);
    if (!stillOpen) { await resetTo('view-home'); await open(); await sleep(250); }
  }
}
log('Tüm pencereler kendi fonksiyonuyla açılıyor', modalNotOpened.length === 0, modalNotOpened.join(', '));
console.log(`Pencere içinde tıklanan öğe: ${modalClicks} (${MODALS.length} pencere)`);
console.log(`Tıklanan öğe: ${clicked} (${views.length} görünüm)`);
log('Tanımsız fonksiyon çağıran düğme/olay işleyici yok', missingAll.size === 0, [...missingAll].slice(0, 8).join(' | '));
log('Hiçbir tıklama sayfa/konsol hatası veya yakalanmamış Promise hatası üretmiyor', problems.length === 0, '\n   ' + problems.slice(0, 25).join('\n   '));
log('Genel sayfa hatası yok', errs.length === 0, errs.slice(0, 5).join(' | '));
console.log('ÖZET', results.filter(Boolean).length + '/' + results.length);
await b.close(); process.exit(0);
