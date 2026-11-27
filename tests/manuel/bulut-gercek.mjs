/* MANUEL — gerçek Supabase projesine karşı bulut girişi doğrulaması (normal test turlarında çalıştırılmaz).
   Takma ad/e-posta kaydı (onaysız anında oturum), profil tetikleyicisi, RLS (kendi verisi / başkası adına yazamaz),
   "Beni hatırla" kapalıyken oturumun yalnız sekmede tutulması, Türkçe hata iletileri.
   Ön koşul (Dashboard): Email provider AÇIK, Confirm email KAPALI (auth/v1/settings → mailer_autoconfirm: true).
   Çalıştırma: VT_PORT=8090 node tests/manuel/bulut-gercek.mjs
   SONRA test kullanıcılarını silin (Supabase SQL):
     delete from auth.users where email like 'vt\_test\_%@hesap.vitatakip.com.tr' or email like 'vt.test.%@vitatakip.com.tr'; */
import { boot, sleep } from '../lib.mjs';
const { b, p, errs } = await boot({ register: false });
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const tag = Date.now().toString(36).slice(-6);
const r = await p.evaluate(async (tag) => {
  const out = {};
  localStorage.setItem('vitatakip_remember_me', 'false');
  out.libBefore = !!window.supabase;
  const uname = 'vt_test_' + tag;
  out.uname = uname;
  const s1 = await VitaCloud.signUp({ kind: 'username', username: uname.toUpperCase(), fullName: 'Test Takma Ad', password: 'testpass123' });
  out.signupUser = { ok: s1.ok, err: s1.error, code: s1.code, hasSession: !!s1.session, email: s1.user && s1.user.email, needsConfirmation: s1.needsConfirmation };
  out.libAfter = !!window.supabase;
  out.tokenInSession = sessionStorage.getItem('vitatakip-bulut-oturum') !== null;
  out.tokenInLocal = localStorage.getItem('vitatakip-bulut-oturum') !== null;
  const c = await VitaCloud.getClient();
  const prof = await c.from('profiles').select('username, full_name, account_type');
  out.profile = { data: prof.data, err: prof.error && prof.error.message };
  const uid = s1.user && s1.user.id;
  const ins = await c.from('user_stores').upsert({ user_id: uid, store: 'supplements', data: [{ name: 'D3' }] });
  out.ownWrite = ins.error ? ins.error.message : 'ok';
  const rd = await c.from('user_stores').select('store, data').eq('user_id', uid);
  out.ownRead = rd.data;
  const other = await c.from('user_stores').insert({ user_id: '00000000-0000-0000-0000-000000000001', store: 'labs', data: [] });
  out.otherWrite = other.error ? 'engellendi: ' + other.error.code : 'ACIK';
  out.signout = (await VitaCloud.signOut()).ok;
  out.tokenAfterSignout = sessionStorage.getItem('vitatakip-bulut-oturum') !== null || localStorage.getItem('vitatakip-bulut-oturum') !== null;
  const bad = await VitaCloud.signIn(uname, 'yanlis-sifre');
  out.badLogin = bad.ok ? 'ACIK' : bad.code + ' | ' + bad.error;
  const good = await VitaCloud.signIn('  ' + uname.toUpperCase() + ' ', 'testpass123');
  out.goodLogin = good.ok ? good.user.email : good.error;
  const dup = await VitaCloud.signUp({ kind: 'username', username: uname, fullName: 'Kopya', password: 'testpass123' });
  out.dup = dup.ok ? 'ACIK' : dup.code + ' | ' + dup.error;
  await VitaCloud.signOut();
  const em = 'vt.test.' + tag + '@vitatakip.com.tr';
  const s2 = await VitaCloud.signUp({ kind: 'email', email: em, fullName: 'Test E-posta', password: 'testpass123' });
  out.signupEmail = { ok: s2.ok, err: s2.error, code: s2.code, hasSession: !!s2.session };
  const c2 = await VitaCloud.getClient();
  const prof2 = await c2.from('profiles').select('username, full_name');
  out.profile2 = prof2.data;
  await VitaCloud.signOut();
  const badUser = await VitaCloud.signUp({ kind: 'username', username: 'a b!', fullName: 'X Y', password: 'testpass123' });
  out.badUsername = badUser.ok ? 'ACIK' : badUser.code;
  return out;
}, tag);
console.log(JSON.stringify(r, null, 1));
log('Kütüphane yalnız bulut kullanılınca yüklenir', r.libBefore === false && r.libAfter === true);
log('Takma adla kayıt: onaysız anında oturum, adres hesap.vitatakip.com.tr', r.signupUser.ok && r.signupUser.hasSession && r.signupUser.email === r.uname + '@hesap.vitatakip.com.tr');
log('"Beni hatırla" kapalı: oturum yalnız sekmede (sessionStorage)', r.tokenInSession && !r.tokenInLocal);
log('Tetikleyici profili oluşturdu (takma ad küçük harf, hasta)', r.profile.data && r.profile.data.length === 1 && r.profile.data[0].username === r.uname && r.profile.data[0].account_type === 'patient');
log('Kendi verisini yazar/okur, başkası adına yazamaz', r.ownWrite === 'ok' && r.ownRead && r.ownRead.length === 1 && /engellendi/.test(r.otherWrite));
log('Çıkışta belirteç silinir', r.signout && !r.tokenAfterSignout);
log('Yanlış şifre → Türkçe hata', /^invalid_credentials/.test(r.badLogin));
log('Takma ad büyük harf/boşlukla da giriş', r.goodLogin === r.uname + '@hesap.vitatakip.com.tr');
log('Aynı takma adla ikinci kayıt reddedilir', /^user_already_exists/.test(r.dup));
log('E-postayla kayıt: anında oturum, profil (takma ad boş)', r.signupEmail.ok && r.signupEmail.hasSession && r.profile2 && r.profile2.length === 1 && r.profile2[0].username === null);
log('Geçersiz takma ad istemcide reddedilir', r.badUsername === 'identifier');
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
