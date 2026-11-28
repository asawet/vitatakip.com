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
  const saveLinksGlobal = l => localStorage.setItem('__fakeLinks', JSON.stringify(l));
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
        const u = { id: crypto.randomUUID(), email, password, meta: (options && options.data) || {}, createdAt: new Date().toISOString(), lastSignIn: new Date().toISOString() };
        if (u.meta.account_type === 'doctor') u.doctorCode = 'DR-' + (1000 + Object.keys(users).length); // sunucu tetikleyicisi gibi
        users[email] = u; localStorage.setItem('__fakeUsers', JSON.stringify(users));
        const s = mkSession(u); VitaCloud.authStorage.setItem(KEY, JSON.stringify(s)); return { data: { user: { ...s.user, identities: [{}] }, session: s }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = users[email]; if (!u || u.password !== password) return { data: {}, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } };
        u.lastSignIn = new Date().toISOString(); localStorage.setItem('__fakeUsers', JSON.stringify(users));
        const s = mkSession(u); VitaCloud.authStorage.setItem(KEY, JSON.stringify(s)); return { data: { user: s.user, session: s }, error: null };
      },
      async signOut() { VitaCloud.authStorage.removeItem(KEY); return { error: null }; },
      async getSession() { const raw = VitaCloud.authStorage.getItem(KEY); return { data: { session: raw ? JSON.parse(raw) : null } }; },
      async getUser() { net(); const raw = VitaCloud.authStorage.getItem(KEY); return { data: { user: raw ? JSON.parse(raw).user : null }, error: null }; },
      // Şifre sıfırlama (e-posta): bağlantı belirteci __fakeResetTokens'ta; test __lastResetToken ile "e-postadaki bağlantıyı" açar
      async resetPasswordForEmail(email, opts) {
        net(); window.__calls.push(['resetPasswordForEmail', email, opts && opts.redirectTo]);
        if (window.__smtpFails) return { data: {}, error: { code: 'unexpected_failure', status: 500, message: 'Error sending recovery email' } };
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
      if (name === 'my_profile') return { data: u ? [{ id: u.id, full_name: u.meta.full_name || '', account_type: u.meta.account_type === 'doctor' ? 'doctor' : 'patient', doctor_code: u.doctorCode || null, doctor_verified: (window.__verifiedDoctors || []).includes(u.id), is_admin: (window.__admins || []).includes(u.id) }] : [], error: null };
      // Doktor rehberi + erişim istekleri (sunucu kurallarının taklidi; istekler __fakeRequests'te)
      const reqs = () => J('__fakeRequests', []); const saveReqs = r => localStorage.setItem('__fakeRequests', JSON.stringify(r));
      if (name === 'verified_doctors') return { data: Object.values(users).filter(x => x.meta.account_type === 'doctor' && x.doctorCode && doctorVerified(x.id) && x.id !== uid).map(x => ({ id: x.id, full_name: x.meta.full_name || '', doctor_code: x.doctorCode })).sort((a, b) => a.full_name.localeCompare(b.full_name)), error: null };
      if (name === 'request_patient_access') {
        const no = reason => ({ data: { ok: false, reason }, error: null });
        if (!u || u.meta.account_type !== 'doctor') return no('not_doctor');
        if (!doctorVerified(uid)) return no('not_verified');
        let id = String((args || {}).p_identifier || '').trim().toLowerCase().replace(/^@/, '');
        if (!id) return no('bad_identifier');
        if (reqs().filter(r => r.doctor_id === uid && Date.now() - Date.parse(r.created_at) < 864e5).length >= 30) return no('rate_limit');
        let pt;
        if (id.includes('@')) pt = users[id];
        else { if (!/^[a-z0-9_]{3,20}$/.test(id)) return no('bad_identifier'); pt = users[id + '@hesap.vitatakip.com.tr']; }
        if (!pt || pt.meta.account_type === 'doctor') return no('not_found');
        if (links.some(l => l.patient_id === pt.id && l.doctor_id === uid && l.status === 'active')) return no('already_linked');
        const all = reqs();
        if (all.some(r => r.patient_id === pt.id && r.doctor_id === uid && r.status === 'pending')) return no('already_pending');
        if (all.some(r => r.patient_id === pt.id && r.doctor_id === uid && r.status === 'declined' && Date.now() - Date.parse(r.responded_at) < 7 * 864e5)) return no('recently_declined');
        all.push({ id: crypto.randomUUID(), doctor_id: uid, patient_id: pt.id, doctor_label: (u.meta.full_name || '') + ' (' + u.doctorCode + ')', requested_as: id, status: 'pending', created_at: new Date().toISOString(), responded_at: null });
        saveReqs(all); return { data: { ok: true }, error: null };
      }
      if (name === 'respond_access_request') {
        const all = reqs(); const r = all.find(x => x.id === (args || {}).p_request && x.patient_id === uid);
        if (!r) return { data: { ok: false, reason: 'not_found' }, error: null };
        if (r.status !== 'pending') return { data: { ok: false, reason: 'not_pending' }, error: null };
        if (args.p_accept) {
          if (!doctorVerified(r.doctor_id)) return { data: { ok: false, reason: 'not_verified' }, error: null };
          const d = Object.values(users).find(x => x.id === r.doctor_id);
          const i = links.findIndex(l => l.patient_id === uid && l.doctor_id === r.doctor_id);
          const row = { patient_id: uid, doctor_id: r.doctor_id, status: 'active', granted_at: new Date().toISOString(), code: d && d.doctorCode, name: d ? d.meta.full_name : '' };
          if (i >= 0) links[i] = row; else links.push(row); saveLinks(links);
          r.status = 'accepted';
        } else r.status = 'declined';
        r.responded_at = new Date().toISOString(); saveReqs(all);
        return { data: { ok: true, doctor_label: r.doctor_label }, error: null };
      }
      if (name === 'cancel_access_request') {
        const all = reqs(); const r = all.find(x => x.id === (args || {}).p_request && x.doctor_id === uid && x.status === 'pending');
        if (!r) return { data: false, error: null };
        r.status = 'cancelled'; r.responded_at = new Date().toISOString(); saveReqs(all); return { data: true, error: null };
      }
      // Yönetici paneli (SECURITY DEFINER + yönetici denetimi taklidi): __admins = yönetici kimlikleri; işlem kaydı __audit
      if (name.startsWith('admin_')) {
        if (!(window.__admins || []).includes(uid)) return { data: null, error: { code: '42501', message: 'Bu işlem yalnız yöneticiler içindir.' } };
        const docs = Object.values(users).filter(x => x.meta.account_type === 'doctor');
        if (name === 'admin_list_doctors') return { data: docs.map(x => ({ id: x.id, full_name: x.meta.full_name || '', doctor_code: x.doctorCode || null, doctor_verified: doctorVerified(x.id),
          created_at: x.createdAt || new Date().toISOString(), login: /@hesap\.vitatakip\.com\.tr$/.test(x.email) ? '@' + (x.meta.username || '') : x.email,
          pledge_at: x.meta.doctor_pledge_at || null, active_patients: links.filter(l => l.doctor_id === x.id && l.status === 'active').length }))
          .sort((a, b) => Number(a.doctor_verified) - Number(b.doctor_verified)), error: null };
        if (name === 'admin_set_doctor_verified') {
          const d = docs.find(x => x.id === (args || {}).p_doctor); if (!d) return { data: { ok: false, reason: 'not_found' }, error: null };
          const v = (window.__verifiedDoctors = window.__verifiedDoctors || []); const was = v.includes(d.id);
          if (was === Boolean(args.p_verified)) return { data: { ok: true, changed: false }, error: null };
          if (args.p_verified) v.push(d.id); else v.splice(v.indexOf(d.id), 1);
          (window.__audit = window.__audit || []).unshift({ at: new Date().toISOString(), admin_label: u ? u.meta.full_name : '', action: args.p_verified ? 'doctor_verify' : 'doctor_unverify', target_label: (d.meta.full_name || '') + ' (' + (d.doctorCode || '—') + ')' });
          return { data: { ok: true, changed: true }, error: null };
        }
        if (name === 'admin_audit_recent') return { data: (window.__audit || []).slice(0, (args || {}).p_limit || 20).map(a => ({ note: '', ...a })), error: null };
        const all = Object.values(users); const db = window.__db(); const loginOf = x => /@hesap\.vitatakip\.com\.tr$/.test(x.email) ? '@' + (x.meta.username || '') : x.email;
        const rec = J('__fakeRecovery', {}); const isDoc = x => x.meta.account_type === 'doctor';
        if (name === 'admin_stats') return { data: {
          users_total: all.length, patients: all.filter(x => !isDoc(x)).length, doctors_verified: all.filter(x => isDoc(x) && doctorVerified(x.id)).length,
          doctors_pending: all.filter(x => isDoc(x) && !doctorVerified(x.id)).length, admins: all.filter(x => (window.__admins || []).includes(x.id)).length,
          username_accounts: all.filter(x => /@hesap\./.test(x.email)).length, no_recovery_code: all.filter(x => /@hesap\./.test(x.email) && !rec[x.id]).length,
          new_7d: all.length, new_30d: all.length, active_7d: all.length, links_active: links.filter(l => l.status === 'active').length,
          requests_pending: J('__fakeRequests', []).filter(r => r.status === 'pending').length, notes_total: J('__fakeNotes', []).length,
          cloud_users: new Set(db.map(r => r.user_id)).size, cloud_bytes: db.reduce((n, r) => n + JSON.stringify(r.data).length, 0), ai_today: 0, ai_users_today: 0 }, error: null };
        if (name === 'admin_list_users') return { data: all.map(x => ({ id: x.id, full_name: x.meta.full_name || '', login: loginOf(x), account_type: isDoc(x) ? 'doctor' : 'patient',
          is_admin: (window.__admins || []).includes(x.id), doctor_code: x.doctorCode || null, doctor_verified: doctorVerified(x.id), created_at: x.createdAt, last_sign_in_at: x.lastSignIn,
          store_count: db.filter(r => r.user_id === x.id).length, data_bytes: db.filter(r => r.user_id === x.id).reduce((n, r) => n + JSON.stringify(r.data).length, 0),
          links_active: links.filter(l => l.status === 'active' && (l.patient_id === x.id || l.doctor_id === x.id)).length, has_recovery_code: Boolean(rec[x.id]),
          username_account: /@hesap\./.test(x.email) })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), error: null };
      }
      return { data: null, error: { message: 'bilinmeyen rpc: ' + name } };
    },
    functions: {
      // hesap-sil Edge Function: oturum sahibini ve tüm satırlarını siler (cascade). __deleteFails ile hata canlandırılır.
      async invoke(name, opts) {
        net(); window.__calls.push(['invoke', name]);
        // sifre-kurtar: takma ad + kurtarma kodu (özet __fakeRecovery'de) + yeni şifre; 5 hatalı denemede kilit
        // yonetici-islem: hesap silme (yönetici; kendisi / başka yönetici olamaz; giriş bilgisi eşleşmeli); kayıt __audit
        if (name === 'yonetici-islem') {
          const b = (opts && opts.body) || {}; const me = curUid();
          const err = (code, status) => ({ data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => ({ error: code }) } } });
          if (!(window.__admins || []).includes(me)) return err('forbidden', 403);
          if (b.user_id === me) return err('self', 400);
          const key = Object.keys(users).find(k => users[k].id === b.user_id); if (!key) return err('not_found', 404);
          const t = users[key]; if ((window.__admins || []).includes(t.id)) return err('target_admin', 400);
          const login = /@hesap\.vitatakip\.com\.tr$/.test(t.email) ? '@' + t.meta.username : t.email;
          if (String(b.confirm || '').trim().toLowerCase().replace(/^@/, '') !== login.toLowerCase().replace(/^@/, '')) return err('confirm_mismatch', 400);
          const meU = Object.values(users).find(x => x.id === me);
          const label = (t.meta.full_name || '') + ' (' + login + ', ' + (t.meta.account_type === 'doctor' ? 'doktor' : 'hasta') + ')';
          (window.__audit = window.__audit || []).unshift({ at: new Date().toISOString(), admin_label: meU ? meU.meta.full_name : '', action: 'user_delete', target_label: label, note: String(b.note || '') });
          delete users[key]; localStorage.setItem('__fakeUsers', JSON.stringify(users));
          window.__dbSave(window.__db().filter(r => r.user_id !== t.id));
          saveLinksGlobal(J('__fakeLinks', []).filter(l => l.patient_id !== t.id && l.doctor_id !== t.id));
          return { data: { ok: true, label }, error: null };
        }
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
      // access_requests (RLS: doktor ve hasta yalnız kendi isteklerini okur; yazma yalnız fonksiyonlarla)
      if (table === 'access_requests') {
        return { select() { return { async eq(col, v) { net(); const me = curUid(); return { data: J('__fakeRequests', []).filter(r => (r.doctor_id === me || r.patient_id === me) && r[col] === v), error: null }; } }; } };
      }
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
