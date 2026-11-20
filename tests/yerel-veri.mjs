/* Local-first veri akışı: profil, takviyeler, tahliller, belirti seçimleri ve Gemini API anahtarı yalnızca
   tarayıcı hafızasına (localStorage; IndexedDB yalnızca aynı verinin yerel yedeği) hesaba özel yazılır,
   yenilemeden sonra oradan okunur; çerez kullanılmaz, hiçbir dış sunucuya istek gitmez. */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const external = new Set();
await p.setRequestInterception(true);
p.on('request', r => {
  const u = r.url();
  // Anahtar kaydedilirken yapılan doğrulama isteği sahte yanıtla karşılanır (gerçek Google'a gidilmez)
  if (u.startsWith('https://generativelanguage.googleapis.com/')) {
    return r.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, contentType: 'application/json', body: '{"models":[]}' });
  }
  if (/^https?:/.test(u) && !u.startsWith('http://localhost:8080')) external.add(new URL(u).host);
  r.continue();
});
p.on('dialog', d => d.accept());
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });

/* Arayüz üzerinden veri gir */
await p.evaluate(() => { openProfileModal(false); document.getElementById('modalInputAge').value = 38; document.getElementById('modalInputGender').value = 'K'; document.getElementById('modalInputHeight').value = 168; document.getElementById('modalInputWeight').value = 61; document.getElementById('modalCustomMedications').value = 'Levotiroksin'; saveUserProfileFromModal(); });
await sleep(400);
await p.evaluate(() => { state.supplements = [{ id: 'y1', name: 'Yerel Demir', timing: 'Sabah', taken: false }]; saveState(); });
await p.evaluate(() => navigateToView('view-labs')); await sleep(300);
await p.evaluate(() => { const e = document.getElementById('inputLabFerritin'); e.value = '11'; e.dispatchEvent(new Event('input', { bubbles: true })); saveCurrentLabRecordWithDate(); });
await sleep(400);
const sym = await p.evaluate(async () => { navigateToView('view-neyim'); await new Promise(r => setTimeout(r, 300)); const c = document.querySelector('[onclick*="toggleAnamnesisCard"]'); c.click(); saveState(); return c.getAttribute('onclick').match(/'([a-z_]+)'/)[1]; });
await p.evaluate(async () => { navigateToView('view-settings'); await new Promise(r => setTimeout(r, 300)); await saveGeminiApiKey('AIzaYEREL_test_anahtari_12345'); });
await sleep(300);

/* Depolamayı incele */
const st = await p.evaluate(sym => {
  const uid = activeUserId;
  const ls = k => localStorage.getItem(k);
  return {
    uid,
    profile: JSON.parse(ls('vitatakip_user_' + uid) || '{}').age,
    sups: (JSON.parse(ls('vitatakip_supplements_' + uid) || '[]')).map(s => s.name).join(','),
    ferritin: (JSON.parse(ls('vitatakip_labhistory_' + uid) || '[]'))[0]?.values?.ferritin ?? JSON.parse(ls('vitatakip_labs_' + uid) || '{}').ferritin,
    symptoms: JSON.parse(ls('vitatakip_symptoms_' + uid) || '[]'),
    key: ls('vita_gemini_api_key_' + uid),
    sharedKey: ls('vita_gemini_api_key'),
    cookie: document.cookie,
    sessionKeys: Object.keys(sessionStorage)
  };
}, sym);
log('Profil localStorage\'da hesaba özel', st.profile == 38, String(st.profile));
log('Takviyeler localStorage\'da', /Yerel Demir/.test(st.sups), st.sups);
log('Tahliller localStorage\'da', Number(st.ferritin) === 11, String(st.ferritin));
log('Belirti seçimi localStorage\'da', st.symptoms.includes(sym), JSON.stringify(st.symptoms));
log('Gemini API anahtarı yalnızca bu tarayıcıda, hesaba özel', st.key === 'AIzaYEREL_test_anahtari_12345' && st.sharedKey === null);
log('Çerez kullanılmıyor; oturum deposunda yalnızca oturum kimliği', st.cookie === '' && st.sessionKeys.every(k => /^vitatakip_(active_session_id|session_storage_diagnostic)$/.test(k)), `${JSON.stringify(st.cookie)} ${st.sessionKeys.join(',')}`);

/* Yenile: hepsi localStorage'dan geri okunur */
await p.reload({ waitUntil: 'networkidle2' }); await sleep(1800);
const back = await p.evaluate(sym => ({ age: state.user?.age, sup: state.supplements.map(s => s.name).join(','), sym: state.selectedSymptoms.has(sym), key: getGeminiApiKey(), labs: Number(state.labValues?.ferritin) }), sym);
log('Yenilemeden sonra profil, takviye, tahlil, belirti ve anahtar geri okunur', back.age == 38 && /Yerel Demir/.test(back.sup) && back.sym && back.labs === 11 && back.key === 'AIzaYEREL_test_anahtari_12345', JSON.stringify(back));
log('Hiçbir dış sunucuya istek yok (anahtar doğrulaması hariç, o da sahte)', external.size === 0, [...external].join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log('ÖZET', results.filter(Boolean).length + '/' + results.length);
await b.close(); process.exit(0);
