/* Gemini API anahtarı biçimleri (klasik AIza… + yeni AQ.…), aktif model göstergesi (yalnızca Ayarlar, salt okunur,
   otomatik geçişte güncellenir), veri paylaşım onayının Ayarlar'a taşınması ve sohbette sesle yazma.
   Gerçek Google'a gidilmez: sahte Gemini sunucusu ve sahte SpeechRecognition kullanılır. */
import { boot, sleep } from './lib.mjs';
const KEY_NEW = 'AQ.Ab8RN6Lx_k2-Qp9zWv3yTt5uIo7pAs1dFg4hJk6lZx8cVb0nM.q';
const KEY_OLD = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K-L_mNoPqRsTu';
const { b, p, errs } = await boot({ preload: () => {
  // Sahte konuşma tanıma: start → dinliyor; önce ara sonuç, sonra kesin sonuç; stop → bitti.
  class FakeRecognition {
    constructor() { window.__rec = this; this.lang = ''; this.continuous = false; this.interimResults = false; }
    start() {
      setTimeout(() => this.onstart && this.onstart(), 20);
      setTimeout(() => this.onresult && this.onresult({ results: [Object.assign([{ transcript: 'D vitaminim' }], { isFinal: false })] }), 80);
      setTimeout(() => this.onresult && this.onresult({ results: [Object.assign([{ transcript: 'D vitaminim düşük çıktı' }], { isFinal: true })] }), 160);
    }
    stop() { setTimeout(() => this.onend && this.onend(), 20); }
  }
  // Yeni Chrome öneksiz SpeechRecognition da sunar; ikisi de sahtesiyle değiştirilir.
  window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechRecognition = FakeRecognition;
} });
p.setDefaultTimeout(30000);
let dialogs = 0; p.on('dialog', d => { dialogs++; d.accept(); });
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };

const G = { reqs: [], failModels: new Set() };
await p.setRequestInterception(true);
p.on('request', req => {
  const url = req.url();
  if (!url.startsWith('https://generativelanguage.googleapis.com/')) return req.continue();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const key = req.headers()['x-goog-api-key'] || '';
  G.reqs.push({ url, key, body: req.postData() ? JSON.parse(req.postData()) : null });
  const json = (status, obj) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(obj) });
  if (key !== KEY_NEW && key !== KEY_OLD) return json(400, { error: { message: 'API key not valid', status: 'INVALID_ARGUMENT' } });
  if (url.includes('/models?')) return json(200, { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
  const model = (url.match(/models\/([^:]+):generateContent/) || [])[1] || '';
  if (G.failModels.has(model)) return json(429, { error: { message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' } });
  return json(200, { candidates: [{ content: { parts: [{ text: 'GEMINI_YANITI: D vitamini düşük görünüyor.' }] } }] });
});

await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-settings'); });
await sleep(600);
const fb = () => p.evaluate(() => (document.getElementById('geminiApiSaveFeedbackBox')?.innerText || '').replace(/\s+/g, ' ').trim());
const saved = () => p.evaluate(() => getGeminiApiKey());

/* 1) Anahtar biçimleri */
G.reqs.length = 0;
await p.evaluate(k => saveGeminiApiKey(`  ${k}\r\n`), KEY_NEW); await sleep(600);
const n1 = { saved: await saved(), fb: await fb(), header: G.reqs.at(-1)?.key, url: G.reqs.at(-1)?.url || '' };
log('Yeni AQ.… anahtarı (54 karakter, nokta içerir) baştaki/sondaki boşluk ve satır sonu temizlenerek kaydedilir', n1.saved === KEY_NEW && /doğrulandı ve kaydedildi/.test(n1.fb), JSON.stringify(n1));
log('AQ.… anahtarı x-goog-api-key başlığında noktalar bozulmadan gider, URL\'de anahtar yok', n1.header === KEY_NEW && !/[?&]key=/.test(n1.url) && !n1.url.includes(KEY_NEW), n1.url);

await p.evaluate(k => saveGeminiApiKey(k), KEY_OLD); await sleep(600);
log('Klasik AIza… anahtarı (39 karakter) kaydedilir ve doğrulanır', (await saved()) === KEY_OLD && /doğrulandı ve kaydedildi/.test(await fb()));

const bad = [];
for (const [input, expect] of [
  ['AIzaSy A1b2C3d4E5f6G7h8I9j0K-L_mNoPqRs', /boşluk/],
  ['AQ.Ab8RN6Lx_k2/Qp9zWv3yTt5uIo7pAs1dFg4h', /karakter/],
  ['AIza123', /kısa/]
]) {
  G.reqs.length = 0;
  await p.evaluate(k => saveGeminiApiKey(k), input); await sleep(300);
  const f = await fb();
  if (!expect.test(f) || G.reqs.length !== 0 || (await saved()) !== KEY_OLD) bad.push(`${input} → ${f} (istek ${G.reqs.length})`);
}
log('Boşluklu / geçersiz karakterli / çok kısa anahtar Google\'a gönderilmeden açık mesajla reddedilir, eski anahtar korunur', bad.length === 0, bad.join(' | '));
await p.evaluate(() => { document.getElementById('drawerGeminiApiKeyInput').value = ''; return saveGeminiApiKey(''); }); await sleep(200);
const emptyMsg = await fb();
log('Boş girişte mevcut anahtar aktif mesajı; eski "benzemiyor" uyarısı hiç çıkmaz', /aktif/.test(emptyMsg) && !/benzemiyor|fazladan/i.test(emptyMsg), emptyMsg);
await p.evaluate(() => { clearGeminiApiKeyFromSettings(); return saveGeminiApiKey(''); }); await sleep(200);
const emptyMsg2 = await fb();
log('Anahtar yokken boş giriş her iki biçimi anlatır', /AIza/.test(emptyMsg2) && /AQ\./.test(emptyMsg2), emptyMsg2);
const ph = await p.evaluate(() => document.getElementById('drawerGeminiApiKeyInput').placeholder);
log('Giriş kutusu ipucu iki biçimi de gösterir', /AIza/.test(ph) && /AQ\./.test(ph), ph);

/* 2) Onay Ayarlar'da; sohbette yalnızca küçük tek satır */
await p.evaluate(k => saveGeminiApiKey(k), KEY_NEW); await sleep(600);
const place = await p.evaluate(() => ({
  inSettings: Boolean(document.querySelector('#view-settings #aiHealthDataConsent')),
  inChat: Boolean(document.querySelector('#vita-ai-chatbox #aiHealthDataConsent, #vita-ai-chatbox #aiHealthDataConsentPanel')),
  checked: document.getElementById('aiHealthDataConsent').checked
}));
log('Veri paylaşım onayı Ayarlar\'da; sohbet ekranında onay kutusu/metni yok', place.inSettings && !place.inChat && !place.checked, JSON.stringify(place));
await p.evaluate(() => { navigateToView('view-home'); VitaAIChat.toggle(true); }); await sleep(400);
const hint = await p.evaluate(() => {
  const h = document.getElementById('aiConsentHint'); const r = h.getBoundingClientRect(); const cs = getComputedStyle(h);
  const box = document.getElementById('vita-ai-chatbox').getBoundingClientRect();
  return { visible: !h.classList.contains('hidden') && r.height > 0, height: Math.round(r.height), font: cs.fontSize, color: cs.color, atBottom: Math.abs(box.bottom - r.bottom) < 4, text: h.innerText.replace(/\s+/g, ' ') };
});
log('Onay yokken sohbetin en altında soluk, küçük (≤11px), tek satır bilgi görünür', hint.visible && parseFloat(hint.font) <= 11 && hint.height <= 22 && hint.atBottom && /Ayarlar/.test(hint.text), JSON.stringify(hint));

G.reqs.length = 0; dialogs = 0;
await p.evaluate(() => { document.getElementById('ai-user-input').value = 'D vitaminim düşük mü?'; document.querySelector('#vita-ai-chatbox form').requestSubmit(); }); await sleep(1500);
const gen0 = G.reqs.filter(r => r.url.includes(':generateContent')).length;
log('Onay yokken soru Gemini\'ye gitmez ve açılır pencereyle onay istenmez (yerel yanıt)', gen0 === 0 && dialogs === 0, `istek=${gen0} pencere=${dialogs}`);

await p.evaluate(() => document.querySelector('#aiConsentHint button').click()); await sleep(900);
const nav = await p.evaluate(() => { const c = document.getElementById('aiHealthDataConsentSettings').getBoundingClientRect(); return { view: state.activeTab, chatHidden: document.getElementById('vita-ai-chatbox').classList.contains('hidden'), cardInView: c.top >= 0 && c.bottom <= innerHeight + 2 }; });
log('Bilgi satırındaki "Ayarlar" onay bölümünü açar ve gösterir', nav.view === 'view-settings' && nav.chatHidden && nav.cardInView, JSON.stringify(nav));

await p.evaluate(() => { const c = document.getElementById('aiHealthDataConsent'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
const afterConsent = await p.evaluate(() => ({ hintHidden: document.getElementById('aiConsentHint').classList.contains('hidden'), stored: localStorage.getItem(`vita_ai_consent_${activeUserId}`), status: document.getElementById('aiHealthDataConsentStatus').innerText }));
log('Ayarlar\'dan onay verilince kaydedilir ve sohbetteki küçük yazı gizlenir', afterConsent.hintHidden && afterConsent.stored === 'true' && /Onay verildi/.test(afterConsent.status), JSON.stringify(afterConsent));

/* 3) Aktif model: yalnızca Ayarlar'da, salt okunur, otomatik geçişte güncellenir */
const firstModel = await p.evaluate(() => VitaAIChat.getModelConfig().primary);
G.failModels = new Set([firstModel]); G.reqs.length = 0;
await p.evaluate(() => { navigateToView('view-home'); VitaAIChat.toggle(true); document.getElementById('ai-user-input').value = 'Ferritin nedir?'; document.querySelector('#vita-ai-chatbox form').requestSubmit(); });
await sleep(2500);
const gens = G.reqs.filter(r => r.url.includes(':generateContent')).map(r => r.url.match(/models\/([^:]+):/)[1]);
const used = gens.at(-1);
const chat = await p.evaluate(() => ({ text: document.getElementById('vita-ai-chatbox').innerText, gemini: /GEMINI_YANITI/.test(document.getElementById('ai-chat-messages').innerText) }));
log('Onaydan sonra soru Gemini\'ye gider; ilk model kota hatası verince yedek modele geçilir', chat.gemini && gens[0] === firstModel && used && used !== firstModel, gens.join(' → '));
log('Sohbet ekranında model adı gösterilmez', !/gemini-\d/.test(chat.text));
const badge = await p.evaluate(() => { const el = document.getElementById('geminiActiveModelBadge'); return { text: el.textContent, note: document.getElementById('geminiActiveModelNote').textContent, tag: el.tagName, ro: el.getAttribute('aria-readonly'), inSettings: Boolean(el.closest('#view-settings')), editable: el.isContentEditable }; });
log('Ayarlar\'daki aktif model rozeti geçilen modeli gösterir ve geçişi belirtir', badge.text === used && /geçildi/.test(badge.note) && badge.inSettings, JSON.stringify(badge));
log('Aktif model göstergesi salt okunur (giriş/seçim alanı değil)', badge.tag === 'SPAN' && badge.ro === 'true' && !badge.editable);
G.failModels = new Set();
await p.evaluate(() => { document.getElementById('ai-user-input').value = 'Peki B12?'; document.querySelector('#vita-ai-chatbox form').requestSubmit(); }); await sleep(1500);
const badge2 = await p.evaluate(() => ({ text: document.getElementById('geminiActiveModelBadge').textContent, note: document.getElementById('geminiActiveModelNote').textContent }));
log('Sonraki istekte çalışan model kullanılır ve rozet "otomatik seçildi" olur', badge2.text === used && /Otomatik seçildi/.test(badge2.note), JSON.stringify(badge2));

/* 4) Sesle yazma */
await p.evaluate(() => { document.getElementById('ai-user-input').value = ''; });
const mic0 = await p.evaluate(() => { const bt = document.getElementById('ai-voice-btn'); const r = bt.getBoundingClientRect(); return { visible: r.width > 0 && !bt.classList.contains('hidden'), statusHidden: document.getElementById('ai-voice-status').classList.contains('hidden') }; });
log('Mesaj kutusunun yanında mikrofon düğmesi görünür; durum satırı boşta gizli', mic0.visible && mic0.statusHidden, JSON.stringify(mic0));
await p.evaluate(() => document.getElementById('ai-voice-btn').click()); await sleep(110);
const mic1 = await p.evaluate(() => ({ cls: document.getElementById('ai-voice-btn').className, pressed: document.getElementById('ai-voice-btn').getAttribute('aria-pressed'), lang: window.__rec.lang, cont: window.__rec.continuous, interim: window.__rec.interimResults, text: document.getElementById('ai-user-input').value, status: document.getElementById('ai-voice-status').innerText }));
log('Dinlerken düğme kırmızı yanıp sönen kayıt görünümüne geçer (tr-TR, sürekli, ara sonuçlar)', /is-listening/.test(mic1.cls) && /bg-rose-600/.test(mic1.cls) && mic1.pressed === 'true' && mic1.lang === 'tr-TR' && mic1.cont === true && mic1.interim === true && /Dinleniyor/.test(mic1.status), JSON.stringify(mic1));
log('Konuşma anlık olarak (ara sonuç) mesaj kutusuna yazılır', mic1.text === 'D vitaminim', mic1.text);
await sleep(200);
const mic2 = await p.evaluate(() => document.getElementById('ai-user-input').value);
log('Kesin sonuç mesaj kutusuna yazılır', mic2 === 'D vitaminim düşük çıktı', mic2);
await p.evaluate(() => document.getElementById('ai-voice-btn').click()); await sleep(200);
const mic3 = await p.evaluate(() => ({ cls: document.getElementById('ai-voice-btn').className, pressed: document.getElementById('ai-voice-btn').getAttribute('aria-pressed'), text: document.getElementById('ai-user-input').value }));
log('Tekrar basınca dinleme durur, metin kutuda kalır (otomatik gönderilmez)', !/is-listening/.test(mic3.cls) && mic3.pressed === 'false' && mic3.text === 'D vitaminim düşük çıktı', JSON.stringify(mic3));
const css = await p.evaluate(() => { const bt = document.getElementById('ai-voice-btn'); bt.classList.add('is-listening'); const a = getComputedStyle(bt).animationName; const dot = getComputedStyle(bt, '::after').backgroundColor; bt.classList.remove('is-listening'); return { a, dot }; });
log('Kayıt göstergesi animasyonlu (nabız + kırmızı nokta)', /vitaMicPulse/.test(css.a) && /239, 68, 68/.test(css.dot), JSON.stringify(css));

await p.evaluate(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; document.getElementById('ai-voice-btn').click(); }); await sleep(300);
const un = await p.evaluate(() => ({ status: document.getElementById('ai-voice-status').innerText, toast: document.body.innerText.includes('Sesle yazma kullanılamıyor') }));
log('Tarayıcı desteklemiyorsa nazik uyarı gösterilir', /desteklemiyor/.test(un.status) && un.toast, un.status);

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
