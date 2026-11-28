/* Yapay zekâ proxy'si istemci tarafı (js/bulut-ai.js + vitaGeminiGenerate yönlendirmesi). Gerçek Supabase/Gemini'ye BAĞLANMAZ:
   sahte bulut (tests/bulut-sahte.mjs) + sahte "ai-proxy" (fetch yakalanır; kota ve hata durumları canlandırılır).
   Çalıştırma: VT_PORT=8090 node tests/bulut-ai.mjs */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const preload = () => {
  window.__ai = { calls: [], mode: 'ok', used: 0, limit: 10 };
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    if (String(url).includes('/functions/v1/ai-proxy')) {
      const body = JSON.parse(init.body);
      window.__ai.calls.push({ auth: init.headers.Authorization, body });
      const J = (o, s) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
      if (!String(init.headers.Authorization || '').startsWith('Bearer ')) return J({ error: 'unauthorized' }, 401);
      if (window.__ai.mode === 'upstream') return J({ error: 'upstream_quota', status: 429 }, 503);
      if (window.__ai.used >= window.__ai.limit) return J({ error: 'quota_user', used: window.__ai.used, limit: window.__ai.limit }, 429);
      window.__ai.used++;
      return J({ text: 'PROXY_YANIT: D3 düzeyiniz için hekiminize danışın.', model: 'gemini-3.5-flash-lite', used: window.__ai.used, limit: window.__ai.limit }, 200);
    }
    return realFetch(url, init);
  };
};

// İki preload: sahte bulut + sahte proxy (boot tek preload alır; birleştirilir)
const both = new Function('(' + fakeCloudPreload.toString() + ')(); (' + preload.toString() + ')();');
const r = await boot({ register: false, preload: both });
const page = r.p, browser = r.b, perrs = r.errs;
await page.setViewport({ width: 390, height: 844 });
page.setDefaultTimeout(20000);
page.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const fill = (id, v) => page.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);

/* Hazırlık: bulut hesabı "Ayşe Bulut", kendi Gemini anahtarı YOK, tahlil + onay */
await page.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setKind('username'); });
await fill('cloudInputFullName', 'Ayşe Bulut'); await fill('cloudInputIdentifier', 'ai_test'); await fill('cloudInputPassword', 'sifre1234'); await fill('cloudInputPasswordConfirm', 'sifre1234');
await page.evaluate(() => { cloudConsentCheckbox.checked = true; });
await page.click('#cloudSubmitBtn'); await sleep(900);
await page.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });

/* 1) Kullanılabilirlik ve Ayarlar açıklaması */
const s1 = await page.evaluate(() => ({ avail: isVitaAIAvailable(), key: getVitaAIKeyOrProxy(), own: getGeminiApiKey(), notice: !document.getElementById('aiProxyNotice').classList.contains('hidden'), noticeText: document.getElementById('aiProxyNotice').innerText }));
log('Bulut hesabı, anahtar yok: yapay zekâ kullanılabilir, istekler proxy\'ye yönlenir', s1.avail && s1.key === 'vita-bulut-proxy' && !s1.own, JSON.stringify({ avail: s1.avail, key: s1.key }));
log('Ayarlar > Yapay zekâ: proxy açıklaması görünür (ücretsiz hizmet, Google inceleyebilir, adınız gönderilmez)', s1.notice && /ücretsiz/.test(s1.noticeText) && /Google gönderilen içeriği inceleyebilir/.test(s1.noticeText) && /adınız gönderilmez/.test(s1.noticeText), s1.noticeText.slice(0, 80));

/* 2) Sohbet: onay verilince soru proxy'den yanıtlanır */
await page.evaluate(() => { document.getElementById('aiHealthDataConsent').checked = true; VitaAIChat.handleConsentChange(true); });
await page.evaluate(() => { VitaAIChat.toggle(true); VitaAIChat.sendPreset('tahlil'); });
await page.waitForFunction(() => window.__ai.calls.length >= 1 && /PROXY_YANIT/.test(document.getElementById('ai-chat-messages').innerText), { timeout: 15000 }).catch(() => {});
const s2 = await page.evaluate(() => ({ token: JSON.parse(VitaCloud.authStorage.getItem('vitatakip-bulut-oturum')).access_token, calls: window.__ai.calls.length, auth: (window.__ai.calls[0] || {}).auth, chat: /PROXY_YANIT/.test(document.getElementById('ai-chat-messages').innerText), sent: JSON.stringify((window.__ai.calls[0] || {}).body || {}) }));
log('Sohbet sorusu proxy\'den (oturum belirteciyle) yanıtlanır', s2.calls >= 1 && s2.auth === 'Bearer ' + s2.token && s2.chat, JSON.stringify({ calls: s2.calls, chat: s2.chat }));
log('Proxy\'ye giden istekte ad soyad YOK ("Ayşe", "Bulut" ayıklanır)', s2.calls >= 1 && !/Ayşe|Bulut/i.test(s2.sent), s2.sent.slice(0, 160));

/* 3) Ad ayıklama: tam ad, ad, soyad, ekli hâl; başka kelimeler bozulmaz */
const s3 = await page.evaluate(() => VitaAIProxy.scrubName({ contents: [{ role: 'user', parts: [{ text: "Merhaba Ayşe Bulut. Ayşe'nin D3 değeri 18; Bulutlar ve bulutsuz gökyüzü." }] }], systemInstruction: { parts: [{ text: 'Hasta: Ayşe Bulut' }] } }));
const t3 = s3.contents[0].parts[0].text, si3 = s3.systemInstruction.parts[0].text;
log('Ad ayıklama: "Ayşe Bulut" / "Ayşe\'nin" → "Kullanıcı"; "Bulutlar", "bulutsuz" bozulmaz', !/Ayşe/.test(t3) && /Merhaba Kullanıcı\./.test(t3) && /Kullanıcı'nin D3/.test(t3) && /Bulutlar ve bulutsuz/.test(t3) && si3 === 'Hasta: Kullanıcı', JSON.stringify({ t3, si3 }));

/* 4) Günlük hak doldu → yerel motor + açıklama; hak bilgisi Ayarlar'da */
await page.evaluate(() => { window.__ai.used = window.__ai.limit; });
let e4 = await page.evaluate(async () => { try { await vitaGeminiGenerate(getVitaAIKeyOrProxy(), { contents: [{ parts: [{ text: 'soru' }] }] }); return null; } catch (e) { return { q: e.proxyQuota, s: e.status }; } });
await page.evaluate(() => { VitaAIChat.sendPreset('oneri'); });
await page.waitForFunction(() => /Bugünkü yapay zekâ hakkınız doldu/.test(document.getElementById('ai-chat-messages').innerText), { timeout: 15000 }).catch(() => {});
const s4 = await page.evaluate(() => ({ chat: /Bugünkü yapay zekâ hakkınız doldu \(10\/10 soru\)/.test(document.getElementById('ai-chat-messages').innerText), local: /Yerel Bilgi Modu/.test(document.getElementById('ai-chat-messages').innerText), usage: document.getElementById('aiProxyUsage').textContent }));
log('Günlük hak dolunca hata değil yerel motor yanıtı + "Bugünkü yapay zekâ hakkınız doldu (10/10 soru)"', e4 && e4.q === 'user' && e4.s === 429 && s4.chat && s4.local, JSON.stringify({ e4, s4 }));
log('Ayarlar\'da "Bugün kalan: 0 / 10 soru"', s4.usage === 'Bugün kalan: 0 / 10 soru', s4.usage);

/* 5) Ücretsiz hizmet yoğun (503) → yerel motor, "hakkınız düşülmedi" */
await page.evaluate(() => { window.__ai.used = 0; window.__ai.mode = 'upstream'; VitaAIChat.sendPreset('etkilesim'); });
await page.waitForFunction(() => /hakkınız düşülmedi/.test(document.getElementById('ai-chat-messages').innerText), { timeout: 15000 }).catch(() => {});
log('Google yanıt veremezse: "yoğun… hakkınız düşülmedi", yerel motor yanıtlar', await page.evaluate(() => /Ücretsiz yapay zekâ hizmeti şu an yoğun veya yanıt veremiyor; hakkınız düşülmedi/.test(document.getElementById('ai-chat-messages').innerText)));
await page.evaluate(() => { window.__ai.mode = 'ok'; });

/* 6) Kendi anahtarı varsa proxy kullanılmaz */
const s6 = await page.evaluate(() => { safeLocalStorageSetItem('vita_gemini_api_key_' + activeUserId, 'AIzaSyTESTTESTTESTTESTTESTTESTTEST12345'); VitaAIProxy.updateNotice(); return { key: getVitaAIKeyOrProxy(), notice: !document.getElementById('aiProxyNotice').classList.contains('hidden') }; });
await page.evaluate(() => safeLocalStorageRemoveItem('vita_gemini_api_key_' + activeUserId));
log('Kendi Gemini anahtarı girilmişse o kullanılır, proxy açıklaması gizlenir', s6.key.startsWith('AIza') && !s6.notice, JSON.stringify(s6));

/* 7) Yerel hesapta proxy yok */
await page.evaluate(() => handleLogout()); await sleep(300);
await page.evaluate(() => { VitaAuthUI.showLocal(); switchAuthMode('register'); const cb = document.getElementById('authRememberMeCheckbox'); cb.checked = false; syncRememberMeButtonUI(false); });
await fill('authInputFullName', 'Yerel Kisi'); await fill('authInputPassword', 'yerel12345'); await fill('authInputPasswordConfirm', 'yerel12345');
await page.click('#authSubmitBtn'); await sleep(1500);
const s7 = await page.evaluate(() => ({ avail: isVitaAIAvailable(), key: getVitaAIKeyOrProxy(), notice: !document.getElementById('aiProxyNotice').classList.contains('hidden') }));
log('Yerel hesap: proxy kullanılamaz (anahtar yoksa yerel motor), açıklama gizli', !s7.avail && s7.key === '' && !s7.notice, JSON.stringify(s7));

const kvkk = await page.evaluate(() => document.getElementById('kvkkInfoBody').innerText);
log('KVKK: proxy ve ücretsiz hizmet koşulu yazılı', /VitaTakip sunucusu \(Supabase, Frankfurt\) üzerinden Google Gemini'nin ücretsiz hizmetine/.test(kvkk) && /adınız gönderilmez/.test(kvkk));

const diag = await page.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', perrs.length === 0, perrs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await browser.close();
