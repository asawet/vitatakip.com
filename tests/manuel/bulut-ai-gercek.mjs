/* MANUEL — gerçek "ai-proxy" Edge Function + gerçek Gemini (VitaTakip'in ücretsiz anahtarı; 1-2 istek harcar).
   Kayıt → soru (ad ayıklanarak) → yanıt + model + kota sayacı → hesabı uygulama içinden siler (kendi kendini temizler).
   Çalıştırma: VT_PORT=8090 node tests/manuel/bulut-ai-gercek.mjs */
import { boot, sleep } from '../lib.mjs';
const { b, p, errs } = await boot({ register: false });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(60000);
p.on('dialog', d => (d.type() === 'prompt' ? d.accept('SİL') : d.accept()));
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const uname = 'vt_ai_' + Date.now().toString(36).slice(-6);
await p.evaluate(u => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setKind('username'); cloudInputFullName.value = 'Zeynep Deneme'; cloudInputIdentifier.value = u; cloudInputPassword.value = 'testpass123'; cloudInputPasswordConfirm.value = 'testpass123'; cloudConsentCheckbox.checked = true; }, uname);
await p.click('#cloudSubmitBtn'); await sleep(6000);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} });

const r1 = await p.evaluate(async () => {
  const t0 = Date.now();
  try {
    const r = await vitaGeminiGenerate(getVitaAIKeyOrProxy(), { contents: [{ role: 'user', parts: [{ text: 'Merhaba, ben Zeynep Deneme. Tek cümleyle: D vitamini neden önemlidir?' }] }], generationConfig: { maxOutputTokens: 120, temperature: 0.2 } }, { timeoutMs: 60000 });
    return { ok: true, text: r.text.slice(0, 160), model: r.model, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, err: e.message, status: e.status, q: e.proxyQuota, up: e.proxyUpstream }; }
});
log('Gerçek proxy → Gemini yanıt verdi (ücretsiz anahtar, model sırası)', r1.ok && r1.text.length > 10, JSON.stringify(r1));
const usage = await p.evaluate(async () => { await VitaAIProxy.refreshUsage(); return document.getElementById('aiProxyUsage').textContent; });
log('Kota sayacı düştü (ai_usage, yalnız kendi satırı okunur)', /Bugün kalan: 9 \/ 10 soru/.test(usage), usage);

await p.evaluate(() => deleteMyAccountData()); await sleep(6000);
log('Test hesabı silindi', await p.evaluate(() => activeUserId === null));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
