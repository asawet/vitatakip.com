/* Geri bildirim "Direkt Gönder": FormSubmit.co AJAX (sahte sunucu). Başarıda yeşil onay + yerel geçmiş + form sıfırlanır;
   hata/çevrimdışında kırmızı uyarı, form korunur, klasik e-posta yedeği sunulur. Gerçek FormSubmit'e istek gitmez. */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
p.setDefaultTimeout(20000); p.on('dialog', d => d.dismiss());
await p.evaluate(() => closeProfileModal()); await sleep(1200);
await p.evaluate(() => document.getElementById('vitaSpotlightLayer')?.classList.add('hidden'));
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };

const NET = { mode: 'ok', reqs: [], other: [], mailto: [], delay: 300 };
await p.setRequestInterception(true);
p.on('request', async r => {
  const u = r.url();
  if (u.startsWith('mailto:')) { NET.mailto.push(u); return r.abort('aborted'); }
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (u.startsWith('https://formsubmit.co/')) {
    if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: cors });
    NET.reqs.push({ url: u, headers: r.headers(), body: JSON.parse(r.postData() || '{}') });
    await new Promise(res => setTimeout(res, NET.delay));
    // Gerçek FormSubmit gibi: Referer yoksa reddeder (canlıda yaşanan hata).
    if (!r.headers().referer) return r.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: 'false', message: 'Make sure you open this page through a web server, FormSubmit will not work in pages browsed as HTML files.' }) });
    if (NET.mode === 'activation') return r.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: 'false', message: "This form needs Activation. We've sent you an email containing an 'Activate Form' link." }) });
    if (NET.mode === 'fail') return r.respond({ status: 500, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: 'false', message: 'Server error' }) });
    if (NET.mode === 'offline') return r.abort('internetdisconnected');
    return r.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: 'true', message: 'The form was submitted successfully.' }) });
  }
  if (!/^https?:\/\/localhost[:/]/.test(u) && !u.startsWith('data:') && !u.startsWith('blob:')) NET.other.push(u);
  r.continue();
});

await p.evaluate(() => openVitaFeedback()); await sleep(400);
const ui = await p.evaluate(() => ({ text: document.getElementById('feedbackModal').innerText, btn: document.getElementById('btnSubmitVitaFeedback').innerText.trim(), line: document.getElementById('vitaFeedbackSenderLine').innerText }));
log('Pencerede e-posta adresi görünmüyor', !/gmail|@/.test(ui.text), (ui.text.match(/\S*@\S*/) || [''])[0]);
log('Gönder düğmesinin adı "Direkt Gönder"', ui.btn === 'Direkt Gönder', ui.btn);

/* 1) Başarılı gönderim */
await p.evaluate(() => { document.getElementById('vitaFeedbackType').value = 'Hata'; document.getElementById('vitaFeedbackArea').value = 'VitaAI'; document.getElementById('vitaFeedbackRating').value = '4'; });
await p.type('#vitaFeedbackMessage', 'Test mesajı: her şey çalışıyor mu?');
await p.evaluate(() => document.getElementById('vitaFeedbackForm').requestSubmit());
await sleep(80);
const busy = await p.evaluate(() => { const b = document.getElementById('btnSubmitVitaFeedback'); return { disabled: b.disabled, text: b.innerText.trim(), spin: !!b.querySelector('.fa-spin') }; });
log('Gönderim sürerken düğme pasif, "Gönderiliyor..." ve yüklenme simgesi', busy.disabled && busy.text === 'Gönderiliyor...' && busy.spin, JSON.stringify(busy));
await sleep(700);
const req = NET.reqs[0] || {};
log('İstek FormSubmit AJAX adresine POST + JSON başlıklarıyla gider', req.url === 'https://formsubmit.co/ajax/sxgsawet@gmail.com' && /application\/json/.test(req.headers?.['content-type'] || '') && /application\/json/.test(req.headers?.accept || ''), req.url);
log('İstekte yalnızca site adresi Referer olarak gider (FormSubmit bunu ister; sayfa yolu gönderilmez)', req.headers?.referer === 'http://localhost:8080/', req.headers?.referer);
const body = req.body || {};
log('Gövdede Türkçe anahtarlarla tüm alanlar ve konu var', body['Gönderen'] === 'Test Kullanici' && body['Kullanım kolaylığı puanı'] === '4 / 5' && body['Bildirim türü'] === 'Hata' && body['İlgili bölüm'] === 'VitaAI' && /çalışıyor/.test(body['Açıklama']) && body._subject === '[VitaTakip] Yeni Geri Bildirim', JSON.stringify(body));
const ok = await p.evaluate(() => { const s = document.getElementById('vitaFeedbackDeliveryStatus'); return { status: s.innerText.trim(), cls: s.className, visible: !s.classList.contains('hidden'), msg: document.getElementById('vitaFeedbackMessage').value, entries: getVitaFeedbackEntries().map(e => ({ m: e.message, d: e.delivered })), hist: document.getElementById('vitaFeedbackHistoryList').innerText, btn: document.getElementById('btnSubmitVitaFeedback').disabled }; });
log('Başarıda yeşil onay: "Geri bildiriminiz doğrudan geliştiriciye iletildi. Teşekkürler!"', ok.visible && /vita-fb-ok/.test(ok.cls) && ok.status === 'Geri bildiriminiz doğrudan geliştiriciye iletildi. Teşekkürler!', ok.status);
log('Başarıda yerel geçmişe kaydedilir ve form sıfırlanır; düğme yeniden etkin', ok.entries.length === 1 && ok.entries[0].d === 'direct' && /çalışıyor/.test(ok.entries[0].m) && ok.msg === '' && !ok.btn && /Geliştiriciye iletildi/.test(ok.hist), JSON.stringify(ok.entries));
log('Harici e-posta uygulaması açılmaz', NET.mailto.length === 0);

/* 2) Sunucu hatası: kırmızı uyarı, form korunur, e-posta yedeği */
NET.mode = 'fail';
await p.type('#vitaFeedbackMessage', 'İkinci mesaj: sunucu hatası denemesi');
await p.evaluate(() => document.getElementById('vitaFeedbackForm').requestSubmit()); await sleep(900);
const fail = await p.evaluate(() => { const s = document.getElementById('vitaFeedbackDeliveryStatus'); return { status: s.innerText.replace(/\s+/g, ' ').trim(), cls: s.className, msg: document.getElementById('vitaFeedbackMessage').value, n: getVitaFeedbackEntries().length, buttons: Array.from(s.querySelectorAll('button')).map(x => x.innerText.trim()) }; });
log('Sunucu hatasında kırmızı uyarı, yazılanlar silinmez, kayıt "iletildi" sayılmaz', /vita-fb-error/.test(fail.cls) && /gönderilemedi/.test(fail.status) && /İkinci mesaj/.test(fail.msg) && fail.n === 1, fail.status);
log('Hata durumunda "Tekrar dene" ve "E-posta uygulamasıyla gönder" seçenekleri', fail.buttons.includes('Tekrar dene') && fail.buttons.includes('E-posta uygulamasıyla gönder'), JSON.stringify(fail.buttons));

/* 2b) Form henüz etkinleştirilmemiş: ne yapılacağını söyleyen uyarı */
NET.mode = 'activation';
await p.evaluate(() => document.getElementById('vitaFeedbackForm').requestSubmit()); await sleep(900);
const act = await p.evaluate(() => document.getElementById('vitaFeedbackDeliveryStatus').innerText);
log('Etkinleştirilmemiş formda "Activate Form" bağlantısı anlatılır', /etkinleştirilmemiş/.test(act) && /Activate Form/.test(act) && !/@/.test(act), act.slice(0, 120));

/* 3) İnternet yok: kırmızı uyarı */
NET.mode = 'offline';
await p.evaluate(() => document.getElementById('vitaFeedbackForm').requestSubmit()); await sleep(900);
const off = await p.evaluate(() => ({ status: document.getElementById('vitaFeedbackDeliveryStatus').innerText, msg: document.getElementById('vitaFeedbackMessage').value, btn: document.getElementById('btnSubmitVitaFeedback').innerText.trim() }));
log('Bağlantı kesintisinde kırmızı uyarı; düğme eski hâline döner', /gönderilemedi/.test(off.status) && /İkinci mesaj/.test(off.msg) && off.btn === 'Direkt Gönder', off.status.slice(0, 90));

/* 4) Yedek: klasik e-posta */
await p.evaluate(() => Array.from(document.querySelectorAll('#vitaFeedbackDeliveryStatus button')).find(b => /E-posta/.test(b.innerText)).click()); await sleep(500);
const mail = await p.evaluate(() => ({ list: getVitaFeedbackEntries().map(e => e.delivered), toast: document.body.innerText.includes('E-posta uygulaması açıldı'), src: String(sendVitaFeedbackViaEmailClient) }));
// Başsız tarayıcı mailto: gezintisini istek olarak göstermez; e-posta uygulamasının açıldığı bildirim ve kodla doğrulanır.
log('Yedek e-posta seçeneği e-posta uygulamasını açar ve kaydı geçmişe ekler', mail.toast && /mailto:\$\{VITA_DEVELOPER_FEEDBACK_EMAIL\}/.test(mail.src) && mail.list[0] === 'mailto', JSON.stringify(mail.list));

/* 5) Çift gönderim engeli */
NET.mode = 'ok'; NET.delay = 800; NET.reqs.length = 0;
await p.evaluate(() => { document.getElementById('vitaFeedbackMessage').value = 'Üçüncü mesaj: çift tıklama'; const f = document.getElementById('vitaFeedbackForm'); f.requestSubmit(); f.requestSubmit(); }); await sleep(1300);
log('Gönderim sürerken ikinci tıklama yeni istek oluşturmaz', NET.reqs.length === 1, String(NET.reqs.length));

log('FormSubmit dışında hiçbir dış sunucuya istek gitmedi', NET.other.length === 0, NET.other.join(', '));
log('Hata yok', errs.length === 0, errs.join('|'));
console.log('ÖZET', results.filter(Boolean).length + '/' + results.length);
await b.close(); process.exit(0);
