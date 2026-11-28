/* Testler için sahte bulut: Supabase istemcisi (kayıt/giriş/çıkış/oturum) + user_stores tablosu (sunucu zaman damgası,
   RLS: yalnız kendi satırı). Sayfa betiklerinden önce çalışır (boot({ preload })); VitaCloud tanımlandığı anda kurulur.
   Yardımcılar: window.__db(), __serverWrite(uid, store, value, agoMs), __calls, __netDown, __clockSkew. */
export const fakeCloudPreload = () => {
  const KEY = 'vitatakip-bulut-oturum';
  const J = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch (_) { return fb; } };
  const users = J('__fakeUsers', {});
  window.__db = () => J('__fakeDb', []);
  window.__dbSave = rows => localStorage.setItem('__fakeDb', JSON.stringify(rows));
  window.__calls = [];
  let clock = 0; const serverNow = () => { clock = Math.max(Date.now() + (window.__clockSkew || 0), clock + 1); return new Date(clock).toISOString(); };
  const curUid = () => { const raw = VitaCloud.authStorage.getItem(KEY); return raw ? JSON.parse(raw).user.id : null; };
  const net = () => { if (window.__netDown || !navigator.onLine) throw new TypeError('Failed to fetch'); };
  // Doktor paneli (sunucudaki RLS'in taklidi): onaylı doktor = __verifiedDoctors içinde ya da __fakeDoctors'ta verified
  const LINKS = () => J('__fakeLinks', []);
  const DOCTOR_STORES = ['user', 'supplements', 'medications', 'labhistory', 'labs', 'labreferences', 'symptoms', 'resolved_symptoms', 'notes', 'recheck'];
  const findDoctor = code => {
    const f = (window.__fakeDoctors || {})[code]; if (f) return f;
    const u = Object.values(users).find(x => x.doctorCode === code);
    return u ? { id: u.id, full_name: u.meta.full_name || '', verified: (window.__verifiedDoctors || []).includes(u.id) } : null;
  };
  const doctorVerified = id => (window.__verifiedDoctors || []).includes(id) || Object.values(window.__fakeDoctors || {}).some(d => d.id === id && d.verified);
  const isDoctorOf = (doctorId, patientId) => doctorVerified(doctorId) && LINKS().some(l => l.doctor_id === doctorId && l.patient_id === patientId && l.status === 'active');
  const userName = id => { const u = Object.values(users).find(x => x.id === id); return u ? (u.meta.full_name || '') : ''; };
  const mkSession = u => ({ access_token: 't', refresh_token: 'r', expires_at: 9e9, user: { id: u.id, email: u.email, user_metadata: u.meta } });
  const fake = {
    auth: {
      async signUp({ email, password, options }) {
        window.__calls.push(['signUp', email, options && options.data]);
        if (users[email]) return { data: {}, error: { code: 'user_already_exists', status: 422, message: 'User already registered' } };
        const u = { id: crypto.randomUUID(), email, password, meta: (options && options.data) || {} };
        if (u.meta.account_type === 'doctor') u.doctorCode = 'DR-' + (1000 + Object.keys(users).length); // sunucu tetikleyicisi gibi
        users[email] = u; localStorage.setItem('__fakeUsers', JSON.stringify(users));
        const s = mkSession(u); VitaCloud.authStorage.setItem(KEY, JSON.stringify(s)); return { data: { user: { ...s.user, identities: [{}] }, session: s }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = users[email]; if (!u || u.password !== password) return { data: {}, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } };
        const s = mkSession(u); VitaCloud.authStorage.setItem(KEY, JSON.stringify(s)); return { data: { user: s.user, session: s }, error: null };
      },
      async signOut() { VitaCloud.authStorage.removeItem(KEY); return { error: null }; },
      async getSession() { const raw = VitaCloud.authStorage.getItem(KEY); return { data: { session: raw ? JSON.parse(raw) : null } }; },
      async getUser() { net(); const raw = VitaCloud.authStorage.getItem(KEY); return { data: { user: raw ? JSON.parse(raw).user : null }, error: null }; },
      // Şifre sıfırlama (e-posta): bağlantı belirteci __fakeResetTokens'ta; test __lastResetToken ile "e-postadaki bağlantıyı" açar
      async resetPasswordForEmail(email, opts) {
        net(); window.__calls.push(['resetPasswordForEmail', email, opts && opts.redirectTo]);
        if (users[email]) { const t = 'tok_' + crypto.randomUUID().replace(/-/g, ''); const all = J('__fakeResetTokens', {}); all[t] = email; localStorage.setItem('__fakeResetTokens', JSON.stringify(all)); window.__lastResetToken = t; }
        return { data: {}, error: null }; // hesap olsun olmasın aynı yanıt
      },
      async verifyOtp({ token_hash, type }) {
        net(); window.__calls.push(['verifyOtp', type]);
        const all = J('__fakeResetTokens', {}); const email = all[token_hash];
        if (type !== 'recovery' || !email || !users[email]) return { data: {}, error: { code: 'otp_expired', status: 403, message: 'Email link is invalid or has expired' } };
        delete all[token_hash]; localStorage.setItem('__fakeResetTokens', JSON.stringify(all)); // tek kullanımlık
        const s = mkSession(users[email]); VitaCloud.authStorage.setItem(KEY, JSON.stringify(s)); return { data: { session: s, user: s.user }, error: null };
      },
      async updateUser({ password }) {
        net(); window.__calls.push(['updateUser']);
        const uid = curUid(); const u = Object.values(users).find(x => x.id === uid);
        if (!u) return { data: {}, error: { code: 'session_not_found', status: 401, message: 'Auth session missing!' } };
        if (u.password === password) return { data: {}, error: { code: 'same_password', status: 422, message: 'New password should be different from the old password.' } };
        u.password = password; localStorage.setItem('__fakeUsers', JSON.stringify(users));
        return { data: { user: mkSession(u).user }, error: null };
      }
    },
    // my_profile (SECURITY INVOKER; yalnız kendi satırı). __verifiedDoctors: onaylı doktor kimlikleri
    async rpc(name, args) {
      net(); window.__calls.push(['rpc', name]);
      const uid = curUid(); const u = Object.values(users).find(x => x.id === uid);
      // Doktor paneli: __fakeDoctors = { 'DR-4829': { id, full_name, verified } }; bağlantılar/notlar localStorage'da
      const links = J('__fakeLinks', []); const saveLinks = l => localStorage.setItem('__fakeLinks', JSON.stringify(l));
      if (name === 'grant_doctor_access') {
        let c = String((args || {}).p_code || '').trim().toUpperCase();
        if (!/^DR-?\d{4,6}$/.test(c)) return { data: { ok: false, reason: 'bad_code' }, error: null };
        if (!c.startsWith('DR-')) c = 'DR-' + c.slice(2);
        const d = findDoctor(c);
        if (!d) return { data: { ok: false, reason: 'not_found' }, error: null };
        if (!d.verified) return { data: { ok: false, reason: 'not_verified', full_name: d.full_name }, error: null };
        const i = links.findIndex(l => l.patient_id === uid && l.doctor_id === d.id);
        const row = { patient_id: uid, doctor_id: d.id, status: 'active', granted_at: new Date().toISOString(), code: c, name: d.full_name };
        if (i >= 0) links[i] = row; else links.push(row); saveLinks(links);
        return { data: { ok: true, doctor_id: d.id, full_name: d.full_name }, error: null };
      }
      if (name === 'revoke_doctor_access') {
        const id = (args || {}).p_doctor; let ch = false;
        links.forEach(l => { if (l.patient_id === uid && l.doctor_id === id && l.status === 'active') { l.status = 'revoked'; ch = true; } }); saveLinks(links);
        return { data: ch, error: null };
      }
      if (name === 'my_doctors') return { data: links.filter(l => l.patient_id === uid && l.status === 'active').map(l => ({ doctor_id: l.doctor_id, full_name: l.name, doctor_code: l.code, status: l.status, granted_at: l.granted_at })), error: null };
      if (name === 'my_patients') {
        if (!doctorVerified(uid)) return { data: [], error: null };
        const db = window.__db();
        return { data: links.filter(l => l.doctor_id === uid && l.status === 'active').map(l => ({ patient_id: l.patient_id, full_name: userName(l.patient_id), granted_at: l.granted_at,
          last_update: db.filter(r => r.user_id === l.patient_id).map(r => r.updated_at).sort().pop() || null })), error: null };
      }
      if (name === 'my_profile') return { data: u ? [{ id: u.id, full_name: u.meta.full_name || '', account_type: u.meta.account_type === 'doctor' ? 'doctor' : 'patient', doctor_code: u.doctorCode || null, doctor_verified: (window.__verifiedDoctors || []).includes(u.id) }] : [], error: null };
      return { data: null, error: { message: 'bilinmeyen rpc: ' + name } };
    },
    functions: {
      // hesap-sil Edge Function: oturum sahibini ve tüm satırlarını siler (cascade). __deleteFails ile hata canlandırılır.
      async invoke(name, opts) {
        net(); window.__calls.push(['invoke', name]);
        // sifre-kurtar: takma ad + kurtarma kodu (özet __fakeRecovery'de) + yeni şifre; 5 hatalı denemede kilit
        if (name === 'sifre-kurtar') {
          const b = (opts && opts.body) || {}; const err = (code, status) => ({ data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => ({ error: code }) } } });
          const fails = J('__fakeRecoveryFails', {}); const un = String(b.username || '');
          if ((fails[un] || 0) >= 5) return err('too_many_attempts', 429);
          const u = users[un + '@hesap.vitatakip.com.tr']; const rec = J('__fakeRecovery', {});
          const ok = u && rec[u.id] && rec[u.id] === await VitaCloud.hashRecoveryCode(b.code);
          if (!ok) { fails[un] = (fails[un] || 0) + 1; localStorage.setItem('__fakeRecoveryFails', JSON.stringify(fails)); return err('invalid', 400); }
          u.password = b.password; localStorage.setItem('__fakeUsers', JSON.stringify(users));
          const fresh = VitaCloud.generateRecoveryCode(); rec[u.id] = await VitaCloud.hashRecoveryCode(fresh); localStorage.setItem('__fakeRecovery', JSON.stringify(rec));
          return { data: { ok: true, code: fresh }, error: null };
        }
        if (window.__deleteFails) return { data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code' } };
        const uid = curUid(); if (!uid) return { data: null, error: { message: 'unauthorized' } };
        Object.keys(users).forEach(e => { if (users[e].id === uid) delete users[e]; }); localStorage.setItem('__fakeUsers', JSON.stringify(users));
        window.__dbSave(window.__db().filter(r => r.user_id !== uid));
        return { data: { ok: true }, error: null };
      }
    },
    from(table) {
      // recovery_codes (RLS: yalnız kendi satırı); yalnız özet saklanır
      if (table === 'recovery_codes') {
        const rec = () => J('__fakeRecovery', {}); const at = () => J('__fakeRecoveryAt', {});
        return {
          async upsert(row) {
            net(); window.__calls.push(['recovery-upsert']); const me = curUid();
            if (!me || row.user_id !== me) return { error: { code: '42501', message: 'new row violates row-level security policy' } };
            if (!/^[0-9a-f]{64}$/.test(row.code_hash)) return { error: { code: '23514', message: 'check constraint' } };
            const r = rec(); r[me] = row.code_hash; localStorage.setItem('__fakeRecovery', JSON.stringify(r));
            const a = at(); a[me] = row.created_at || new Date().toISOString(); localStorage.setItem('__fakeRecoveryAt', JSON.stringify(a));
            return { error: null };
          },
          select() { return { eq(col, uid) { return { async maybeSingle() { net(); const me = curUid(); if (uid !== me || !rec()[uid]) return { data: null, error: null }; return { data: { created_at: at()[uid] || new Date().toISOString() }, error: null }; } }; } }; }
        };
      }
      if (table === 'doctor_notes') {
        const rows = () => J('__fakeNotes', []); const save = r => localStorage.setItem('__fakeNotes', JSON.stringify(r));
        return {
          select() { return { eq(col, v) { return { order() { return { async limit() { net(); const me = curUid(); return { data: rows().filter(n => (n.doctor_id === me || n.patient_id === me) && n[col] === v).sort((a, b) => b.created_at.localeCompare(a.created_at)), error: null }; } }; } }; } }; },
          insert(obj) { return { async select() {
            net(); const me = curUid(); window.__calls.push(['note-insert', obj.patient_id]);
            if (obj.doctor_id !== me || !isDoctorOf(me, obj.patient_id)) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "doctor_notes"' } };
            const n = { id: crypto.randomUUID(), doctor_id: me, patient_id: obj.patient_id, body: obj.body, doctor_label: userName(me), created_at: new Date().toISOString() };
            const r = rows(); r.push(n); save(r); return { data: [{ id: n.id }], error: null };
          } }; },
          delete() { return { async eq(col, v) { net(); const me = curUid(); save(rows().filter(n => !(n[col] === v && n.doctor_id === me))); return { error: null }; } }; }
        };
      }
      return {
        select() { return { async eq(col, uid) { net(); window.__calls.push(['select']); const me = curUid(); if (uid !== me && !isDoctorOf(me, uid)) return { data: [], error: null }; return { data: window.__db().filter(r => r.user_id === uid && (uid === me || DOCTOR_STORES.includes(r.store))).map(r => ({ store: r.store, data: r.data, updated_at: r.updated_at })), error: null }; } }; },
        upsert(rows) {
          return { async select() {
            net(); window.__calls.push(['upsert', rows.map(r => r.store)]);
            const uid = curUid(); if (rows.some(r => r.user_id !== uid)) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
            const db = window.__db(); const out = [];
            rows.forEach(r => { const at = serverNow(); const i = db.findIndex(x => x.user_id === r.user_id && x.store === r.store); const row = { user_id: r.user_id, store: r.store, data: r.data, updated_at: at }; if (i >= 0) db[i] = row; else db.push(row); out.push({ store: r.store, updated_at: at }); });
            window.__dbSave(db); return { data: out, error: null };
          } };
        },
        delete() { return { eq(c, uid) { return { async in(c2, list) { net(); window.__calls.push(['delete', list]); window.__dbSave(window.__db().filter(r => !(r.user_id === uid && list.includes(r.store)))); return { error: null }; } }; } }; }
      };
    }
  };
  window.__serverWrite = (uid, store, value, agoMs) => { // "başka cihaz": sunucudaki satırı değiştirir
    const db = window.__db(); const at = agoMs === undefined ? serverNow() : new Date(Date.now() - agoMs).toISOString();
    const i = db.findIndex(x => x.user_id === uid && x.store === store); const row = { user_id: uid, store, data: { v: value }, updated_at: at };
    if (i >= 0) db[i] = row; else db.push(row); window.__dbSave(db); return at;
  };
  // Takma adla kayıttan sonraki kurtarma kodu adımı: bu adımı sınamayan testlerde otomatik onaylanır
  // (tests/sifre-sifirlama.mjs window.__autoAckRecovery = false ile kapatır ve adımı kendisi sınar).
  if (window.__autoAckRecovery === undefined) window.__autoAckRecovery = true;
  setInterval(() => {
    if (window.__autoAckRecovery === false) return;
    const box = document.getElementById('recoveryCodeBox'), cb = document.getElementById('recoveryAckCheckbox'), btn = document.getElementById('recoveryContinueBtn');
    if (!box || box.classList.contains('hidden') || !cb || !btn) return;
    cb.checked = true; btn.disabled = false; btn.click();
  }, 60);
  let vc; Object.defineProperty(window, 'VitaCloud', { configurable: true, get: () => vc, set: v => { vc = v; v.setClientForTests(fake); } });
};
