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
  const mkSession = u => ({ access_token: 't', refresh_token: 'r', expires_at: 9e9, user: { id: u.id, email: u.email, user_metadata: u.meta } });
  const fake = {
    auth: {
      async signUp({ email, password, options }) {
        if (users[email]) return { data: {}, error: { code: 'user_already_exists', status: 422, message: 'User already registered' } };
        const u = { id: crypto.randomUUID(), email, password, meta: (options && options.data) || {} }; users[email] = u; localStorage.setItem('__fakeUsers', JSON.stringify(users));
        const s = mkSession(u); VitaCloud.authStorage.setItem(KEY, JSON.stringify(s)); return { data: { user: { ...s.user, identities: [{}] }, session: s }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = users[email]; if (!u || u.password !== password) return { data: {}, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } };
        const s = mkSession(u); VitaCloud.authStorage.setItem(KEY, JSON.stringify(s)); return { data: { user: s.user, session: s }, error: null };
      },
      async signOut() { VitaCloud.authStorage.removeItem(KEY); return { error: null }; },
      async getSession() { const raw = VitaCloud.authStorage.getItem(KEY); return { data: { session: raw ? JSON.parse(raw) : null } }; },
      async getUser() { net(); const raw = VitaCloud.authStorage.getItem(KEY); return { data: { user: raw ? JSON.parse(raw).user : null }, error: null }; }
    },
    functions: {
      // hesap-sil Edge Function: oturum sahibini ve tüm satırlarını siler (cascade). __deleteFails ile hata canlandırılır.
      async invoke(name) {
        net(); window.__calls.push(['invoke', name]);
        if (window.__deleteFails) return { data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code' } };
        const uid = curUid(); if (!uid) return { data: null, error: { message: 'unauthorized' } };
        Object.keys(users).forEach(e => { if (users[e].id === uid) delete users[e]; }); localStorage.setItem('__fakeUsers', JSON.stringify(users));
        window.__dbSave(window.__db().filter(r => r.user_id !== uid));
        return { data: { ok: true }, error: null };
      }
    },
    from(table) {
      return {
        select() { return { async eq(col, uid) { net(); window.__calls.push(['select']); if (uid !== curUid()) return { data: [], error: null }; return { data: window.__db().filter(r => r.user_id === uid).map(r => ({ store: r.store, data: r.data, updated_at: r.updated_at })), error: null }; } }; },
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
  let vc; Object.defineProperty(window, 'VitaCloud', { configurable: true, get: () => vc, set: v => { vc = v; v.setClientForTests(fake); } });
};
