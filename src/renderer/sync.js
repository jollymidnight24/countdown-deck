'use strict';
/*
 * Countdown Deck — cross-device sync via Supabase (Auth + PostgREST), using
 * plain fetch (no external library). Shared verbatim by the desktop app and
 * the PWA. Model: one row per user holding the whole countdown list as JSON,
 * last-write-wins. The host supplies getData/setData/onStatus callbacks.
 *
 *   window.createCDSync({ getData, setData, onStatus })
 */
window.createCDSync = function createCDSync(opts) {
  const LS = window.localStorage;
  const KEY_URL = 'cd_sb_url', KEY_ANON = 'cd_sb_key', KEY_SESSION = 'cd_sb_session', KEY_META = 'cd_sb_meta';
  let pushTimer = null;

  const getConfig = () => ({ url: (LS.getItem(KEY_URL) || '').replace(/\/+$/, ''), key: LS.getItem(KEY_ANON) || '' });
  const setConfig = (url, key) => { LS.setItem(KEY_URL, url || ''); LS.setItem(KEY_ANON, key || ''); };
  const configured = () => { const c = getConfig(); return !!(c.url && c.key); };
  const session = () => { try { return JSON.parse(LS.getItem(KEY_SESSION) || 'null'); } catch (_) { return null; } };
  const setSession = (s) => { if (s) LS.setItem(KEY_SESSION, JSON.stringify(s)); else LS.removeItem(KEY_SESSION); };
  const meta = () => { try { return JSON.parse(LS.getItem(KEY_META) || '{}'); } catch (_) { return {}; } };
  const setMeta = (m) => LS.setItem(KEY_META, JSON.stringify(m));
  const isLoggedIn = () => !!session();
  const currentEmail = () => (session() || {}).email || '';

  function status(extra) {
    if (opts.onStatus) opts.onStatus(Object.assign({ loggedIn: isLoggedIn(), email: currentEmail(), syncedAt: meta().syncedAt || null }, extra || {}));
  }

  async function authReq(path, body) {
    const c = getConfig();
    const res = await fetch(`${c.url}${path}`, {
      method: 'POST',
      headers: { apikey: c.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error_description || json.msg || json.error || `HTTP ${res.status}`);
    return json;
  }

  function storeFromToken(t) {
    setSession({
      access_token: t.access_token, refresh_token: t.refresh_token,
      expires_at: Date.now() + (t.expires_in || 3600) * 1000,
      user_id: t.user && t.user.id, email: t.user && t.user.email
    });
  }

  async function signUp(email, password) {
    const j = await authReq('/auth/v1/signup', { email, password });
    if (j.access_token) { storeFromToken(j); status(); return { confirmed: true }; }
    // email confirmation is on — account created, must confirm via email
    status();
    return { confirmed: false };
  }
  async function signIn(email, password) {
    const j = await authReq('/auth/v1/token?grant_type=password', { email, password });
    storeFromToken(j);
    status();
    await pull();
  }
  function signOut() { setSession(null); setMeta({}); status(); }

  async function ensureToken() {
    const s = session();
    if (!s) throw new Error('Not logged in');
    if (Date.now() < s.expires_at - 60000) return s.access_token;
    const j = await authReq('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    storeFromToken(j);
    return j.access_token;
  }

  async function rest(path, init) {
    init = init || {};
    const c = getConfig();
    const token = await ensureToken();
    const headers = Object.assign(
      { apikey: c.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      init.headers || {}
    );
    const res = await fetch(`${c.url}/rest/v1${path}`, Object.assign({}, init, { headers }));
    if (res.status === 401) { signOut(); throw new Error('Session expired — please log in again.'); }
    return res;
  }

  // Pull remote; adopt it if newer than what we last synced.
  async function pull() {
    if (!isLoggedIn() || !configured()) return;
    try {
      const uid = session().user_id;
      const res = await rest(`/decks?user_id=eq.${uid}&select=data,updated_at`, { method: 'GET' });
      const rows = await res.json();
      const row = Array.isArray(rows) && rows[0];
      if (row && row.updated_at && row.updated_at !== meta().syncedAt) {
        if (Array.isArray(row.data)) opts.setData(row.data);
        setMeta({ syncedAt: row.updated_at });
        status({ note: 'Pulled latest' });
      } else if (!row) {
        await push(); // first time — seed the cloud with local data
      } else {
        status();
      }
    } catch (e) { status({ error: e.message }); }
  }

  // Push the whole local list (last-write-wins).
  async function push() {
    if (!isLoggedIn() || !configured()) return;
    try {
      const uid = session().user_id;
      const updated_at = new Date().toISOString();
      await rest('/decks', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: uid, data: opts.getData(), updated_at })
      });
      setMeta({ syncedAt: updated_at });
      status({ note: 'Synced' });
    } catch (e) { status({ error: e.message }); }
  }

  function pushSoon() { if (pushTimer) clearTimeout(pushTimer); pushTimer = setTimeout(push, 1500); }
  async function syncNow() { await pull(); }

  function startAuto() {
    if (isLoggedIn()) pull();
    window.addEventListener('focus', () => { if (isLoggedIn()) pull(); });
    setInterval(() => { if (isLoggedIn()) pull(); }, 60000);
  }

  return { getConfig, setConfig, configured, isLoggedIn, currentEmail, signUp, signIn, signOut, pull, push, pushSoon, syncNow, startAuto, status };
};
