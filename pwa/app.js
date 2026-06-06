'use strict';
// Countdown Deck — PWA mobile companion (core features, localStorage-backed).

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------------------------------------------------------------------------
// Timezone + trading engine (portable subset of the desktop app)
// ---------------------------------------------------------------------------
function getZoned(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {}; for (const x of dtf.formatToParts(date)) p[x.type] = x.value;
  let h = +p.hour; if (h === 24) h = 0;
  return { y: +p.year, mo: +p.month, d: +p.day, h, mi: +p.minute, s: +p.second };
}
function tzOff(date, tz) { const z = getZoned(date, tz); return Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s) - date.getTime(); }
function wallToUtc(y, mo, d, h, mi, tz) { let g = Date.UTC(y, mo - 1, d, h, mi); for (let i = 0; i < 2; i++) g = Date.UTC(y, mo - 1, d, h, mi) - tzOff(new Date(g), tz); return g; }
function ymd(y, mo, d) { return `${y}-${pad(mo)}-${pad(d)}`; }
function dowUTC(y, mo, d) { return new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); }
function shiftYMD(y, mo, d, n) { const dt = new Date(Date.UTC(y, mo - 1, d)); dt.setUTCDate(dt.getUTCDate() + n); return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]; }
function nthWeekday(y, mo, wd, n) { const f = dowUTC(y, mo, 1); return 1 + ((wd - f + 7) % 7) + (n - 1) * 7; }
function lastWeekday(y, mo, wd) { const days = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return days - ((dowUTC(y, mo, days) - wd + 7) % 7); }
function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451); return [y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1]; }
function observed(y, mo, d, ny) { const dow = dowUTC(y, mo, d); if (dow === 6) return ny ? null : shiftYMD(y, mo, d, -1); if (dow === 0) return shiftYMD(y, mo, d, 1); return [y, mo, d]; }
const _cal = new Map();
function usCal(year) {
  if (_cal.has(year)) return _cal.get(year);
  const H = new Set(), HD = new Set(); const add = (t) => { if (t) H.add(ymd(t[0], t[1], t[2])); };
  add(observed(year, 1, 1, true)); add([year, 1, nthWeekday(year, 1, 1, 3)]); add([year, 2, nthWeekday(year, 2, 1, 3)]);
  add(shiftYMD(...easter(year), -2)); add([year, 5, lastWeekday(year, 5, 1)]); if (year >= 2022) add(observed(year, 6, 19));
  add(observed(year, 7, 4)); add([year, 9, nthWeekday(year, 9, 1, 1)]); const th = nthWeekday(year, 11, 4, 4); add([year, 11, th]); add(observed(year, 12, 25));
  HD.add(ymd(year, 11, th + 1));
  if (dowUTC(year, 7, 4) >= 1 && dowUTC(year, 7, 4) <= 5 && dowUTC(year, 7, 3) >= 1 && dowUTC(year, 7, 3) <= 5) HD.add(ymd(year, 7, 3));
  const d24 = dowUTC(year, 12, 24); if (d24 >= 1 && d24 <= 5 && !H.has(ymd(year, 12, 24))) HD.add(ymd(year, 12, 24));
  const cal = { H, HD }; _cal.set(year, cal); return cal;
}
const EXCHANGES = [
  { id: 'nyse', name: 'NYSE (New York)', tz: 'America/New_York', us: true, s: { pre: '04:00', open: '09:30', close: '16:00', post: '20:00' } },
  { id: 'nasdaq', name: 'Nasdaq (New York)', tz: 'America/New_York', us: true, s: { pre: '04:00', open: '09:30', close: '16:00', post: '20:00' } },
  { id: 'lse', name: 'LSE (London)', tz: 'Europe/London', us: false, s: { open: '08:00', close: '16:30' } },
  { id: 'xetra', name: 'XETRA (Frankfurt)', tz: 'Europe/Berlin', us: false, s: { open: '09:00', close: '17:30' } },
  { id: 'tse', name: 'TSE (Tokyo)', tz: 'Asia/Tokyo', us: false, s: { open: '09:00', close: '15:00' } },
  { id: 'hkex', name: 'HKEX (Hong Kong)', tz: 'Asia/Hong_Kong', us: false, s: { open: '09:30', close: '16:00' } },
  { id: 'asx', name: 'ASX (Sydney)', tz: 'Australia/Sydney', us: false, s: { open: '10:00', close: '16:00' } }
];
const exById = (id) => EXCHANGES.find((e) => e.id === id);
const SESSION_LABEL = { pre: 'Pre-market open', open: 'Market open', close: 'Market close', post: 'Post-market close' };
function tradingDay(y, mo, d, ex) { const dow = dowUTC(y, mo, d); if (dow === 0 || dow === 6) return false; if (ex.us && usCal(y).H.has(ymd(y, mo, d))) return false; return true; }
function sessTime(ex, key, y, mo, d) { let t = ex.s[key]; if (!t) return null; if (ex.us && usCal(y).HD.has(ymd(y, mo, d))) { if (key === 'close') t = '13:00'; else if (key === 'post') t = '17:00'; } return t; }
function nextSession(ex, key, from) { if (!ex || !ex.s[key]) return NaN; const z = getZoned(new Date(from), ex.tz); let y = z.y, mo = z.mo, d = z.d; for (let i = 0; i < 400; i++) { if (tradingDay(y, mo, d, ex)) { const [h, m] = sessTime(ex, key, y, mo, d).split(':').map(Number); const inst = wallToUtc(y, mo, d, h, m, ex.tz); if (inst > from) return inst; } const nx = new Date(Date.UTC(y, mo - 1, d)); nx.setUTCDate(nx.getUTCDate() + 1); y = nx.getUTCFullYear(); mo = nx.getUTCMonth() + 1; d = nx.getUTCDate(); } return NaN; }
function prevSession(ex, key, from) { if (!ex || !ex.s[key]) return NaN; const z = getZoned(new Date(from), ex.tz); let y = z.y, mo = z.mo, d = z.d; for (let i = 0; i < 400; i++) { if (tradingDay(y, mo, d, ex)) { const [h, m] = sessTime(ex, key, y, mo, d).split(':').map(Number); const inst = wallToUtc(y, mo, d, h, m, ex.tz); if (inst < from) return inst; } const nx = new Date(Date.UTC(y, mo - 1, d)); nx.setUTCDate(nx.getUTCDate() - 1); y = nx.getUTCFullYear(); mo = nx.getUTCMonth() + 1; d = nx.getUTCDate(); } return NaN; }
function marketStatus(c, now) { const ex = exById(c.exchange); if (!ex) return null; const z = getZoned(new Date(now), ex.tz); if (!tradingDay(z.y, z.mo, z.d, ex)) return { s: 'closed', l: 'Closed' }; const inst = (k) => { const t = sessTime(ex, k, z.y, z.mo, z.d); if (!t) return null; const [h, m] = t.split(':').map(Number); return wallToUtc(z.y, z.mo, z.d, h, m, ex.tz); }; const open = inst('open'), close = inst('close'), pre = inst('pre'), post = inst('post'); if (pre && now < pre) return { s: 'closed', l: 'Closed' }; if (pre && now < open) return { s: 'pre', l: 'Pre-market' }; if (!pre && now < open) return { s: 'closed', l: 'Closed' }; if (now < close) return { s: 'open', l: 'Open' }; if (post && now < post) return { s: 'after', l: 'After-hours' }; return { s: 'closed', l: 'Closed' }; }
function nextOccurrence(baseISO, rec, from) { const d = new Date(baseISO); if (rec === 'none' || isNaN(d.getTime())) return d.getTime(); let g = 0; while (d.getTime() <= from && g++ < 5000) { if (rec === 'weekly') d.setDate(d.getDate() + 7); else if (rec === 'monthly') d.setMonth(d.getMonth() + 1); else if (rec === 'yearly') d.setFullYear(d.getFullYear() + 1); else break; } return d.getTime(); }
function effectiveTarget(c, now) { if (c.kind === 'trading') return nextSession(exById(c.exchange), c.session, now); if (c.recurrence !== 'none') return nextOccurrence(c.target, c.recurrence, now); return new Date(c.target).getTime(); }
function units(ms) { const s = Math.floor(ms / 1000); return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }; }
function breakdown(c, now) { if (c.mode === 'up') { return Object.assign({ done: false }, units(Math.max(0, now - new Date(c.target).getTime()))); } const diff = effectiveTarget(c, now) - now; if (!isFinite(diff)) return { done: false, d: 0, h: 0, m: 0, s: 0 }; if (diff <= 0) return { done: true, d: 0, h: 0, m: 0, s: 0 }; return Object.assign({ done: false }, units(diff)); }
function progress(c, now) { if (c.mode !== 'down' || c.kind === 'clock') return null; const target = effectiveTarget(c, now); if (!isFinite(target)) return null; let start; if (c.kind === 'trading') { const p = prevSession(exById(c.exchange), c.session, now); start = isFinite(p) ? p : null; } else if (c.recurrence !== 'none') { const d = new Date(target); if (c.recurrence === 'weekly') d.setDate(d.getDate() - 7); else if (c.recurrence === 'monthly') d.setMonth(d.getMonth() - 1); else d.setFullYear(d.getFullYear() - 1); start = d.getTime(); } else start = new Date(c.createdAt || now).getTime(); if (start == null || target <= start) return null; return Math.min(1, Math.max(0, (now - start) / (target - start))); }

// Natural-language date parser (subset)
const NL_HOL = { christmas: [11, 25], 'new year': [0, 1], 'new years': [0, 1], halloween: [9, 31], valentine: [1, 14] };
const NL_MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseNL(input, now) {
  if (!input || !input.trim()) return null; let s = ' ' + input.trim().toLowerCase() + ' '; const N = new Date(now); let hour = null, min = 0, m;
  if (/\bnoon\b/.test(s)) { hour = 12; s = s.replace(/\bnoon\b/, ' '); } else if (/\bmidnight\b/.test(s)) { hour = 0; s = s.replace(/\bmidnight\b/, ' '); }
  if (hour === null && (m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/))) { hour = +m[1] % 12; if (m[3] === 'pm') hour += 12; min = m[2] ? +m[2] : 0; s = s.replace(m[0], ' '); }
  else if (hour === null && (m = s.match(/\b(\d{1,2}):(\d{2})\b/))) { hour = +m[1]; min = +m[2]; s = s.replace(m[0], ' '); }
  else if (hour === null && (m = s.match(/\bat\s+(\d{1,2})\b/))) { hour = +m[1]; s = s.replace(m[0], ' '); }
  const tonight = /\btonight\b/.test(s); if (tonight && hour === null) hour = 20;
  const sod = (d) => { d.setHours(0, 0, 0, 0); return d; }; const setHM = (d) => { d.setHours(hour === null ? 9 : hour, min, 0, 0); return d; };
  if ((m = s.match(/\bin\s+(\d+)\s*(min(?:ute)?s?|hours?|hrs?|days?|weeks?|months?|years?)\b/))) { const n = +m[1], u = m[2], d = new Date(N); if (/^min/.test(u)) d.setMinutes(d.getMinutes() + n); else if (/^h/.test(u)) d.setHours(d.getHours() + n); else if (/^day/.test(u)) { d.setDate(d.getDate() + n); if (hour !== null) setHM(d); } else if (/^week/.test(u)) { d.setDate(d.getDate() + 7 * n); if (hour !== null) setHM(d); } else if (/^month/.test(u)) { d.setMonth(d.getMonth() + n); if (hour !== null) setHM(d); } else { d.setFullYear(d.getFullYear() + n); if (hour !== null) setHM(d); } return d; }
  let base = null;
  if (/\btomorrow\b/.test(s)) { base = sod(new Date(N)); base.setDate(base.getDate() + 1); }
  else if (/\btoday\b/.test(s) || tonight) { base = sod(new Date(N)); }
  else if ((m = s.match(/\bnext\s+(week|month|year)\b/))) { base = new Date(N); if (m[1] === 'week') base.setDate(base.getDate() + 7); else if (m[1] === 'month') base.setMonth(base.getMonth() + 1); else base.setFullYear(base.getFullYear() + 1); sod(base); }
  if (!base) for (const k in NL_HOL) { if (s.includes(k)) { const [mo, day] = NL_HOL[k]; let d = new Date(N.getFullYear(), mo, day); if (d.getTime() < now) d = new Date(N.getFullYear() + 1, mo, day); base = sod(d); break; } }
  if (!base && (m = s.match(/\b(next\s+|this\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/))) { const wd = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }[m[2]]; const d = sod(new Date(N)); let a = (wd - d.getDay() + 7) % 7; if (a === 0) a = 7; d.setDate(d.getDate() + a); base = d; }
  if (!base && (m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/))) { const mo = NL_MON.indexOf(m[1]), day = +m[2]; let y = m[3] ? +m[3] : N.getFullYear(); let d = new Date(y, mo, day); if (!m[3] && d.getTime() < now) d = new Date(y + 1, mo, day); base = sod(d); }
  if (!base) { if (hour !== null) { const c = setHM(sod(new Date(N))); if (c.getTime() <= now) c.setDate(c.getDate() + 1); return c; } return null; }
  return setHM(base);
}

// Icons
const ICONS = ['🚀', '💲', '📈', '📺', '🎬', '🎉', '🎂', '🏆', '✈️', '🗓️', '🛍️', '⏰', '❤️', '🔥', '🌙', '⭐'];
const CAT_ICONS = [[/(market|trading|stock|nyse|nasdaq|ipo|finance|crypto)/i, '💲'], [/(space|rocket|launch|spacex)/i, '🚀'], [/(tv|show|series|movie|film|season)/i, '📺'], [/(holiday|christmas|new year)/i, '🎉'], [/(birthday)/i, '🎂'], [/(sport|game|cup|final)/i, '🏆'], [/(travel|trip|flight)/i, '✈️']];
function autoIcon(c) { if (c.kind === 'trading') return '💲'; if (c.kind === 'clock') return '🕐'; const hay = `${c.category} ${c.title}`; for (const [re, e] of CAT_ICONS) if (re.test(hay)) return e; return '⏳'; }
function iconFor(c) { if (c.icon === 'none') return ''; if (c.icon && c.icon !== 'auto') return c.icon; return autoIcon(c); }

// ---------------------------------------------------------------------------
// State + persistence
// ---------------------------------------------------------------------------
let countdowns = [];
let settings = { theme: 'dark' };
let editingId = null;
const TZS = ['', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];

function load() {
  try { countdowns = JSON.parse(localStorage.getItem('cd_countdowns') || '[]'); } catch (_) { countdowns = []; }
  try { settings = Object.assign(settings, JSON.parse(localStorage.getItem('cd_settings') || '{}')); } catch (_) {}
}
function save() { localStorage.setItem('cd_countdowns', JSON.stringify(countdowns)); if (window.cdSync) window.cdSync.pushSoon(); }
function applyRemote(arr) { countdowns = arr.map(normalize); localStorage.setItem('cd_countdowns', JSON.stringify(countdowns)); render(); }
function renderSyncStatus(st) {
  const el = $('syncStatus'); if (!el) return;
  if (st.error) el.textContent = '⚠ ' + st.error;
  else if (st.loggedIn) el.textContent = `Signed in as ${st.email}${st.syncedAt ? ' · synced ' + new Date(st.syncedAt).toLocaleTimeString() : ''}${st.note ? ' · ' + st.note : ''}`;
  else el.textContent = 'Not signed in.';
  $('syncLoginBtn').classList.toggle('hidden', st.loggedIn);
  $('syncSignupBtn').classList.toggle('hidden', st.loggedIn);
  $('syncNowBtn').classList.toggle('hidden', !st.loggedIn);
  $('syncLogoutBtn').classList.toggle('hidden', !st.loggedIn);
}
function saveSettings() { localStorage.setItem('cd_settings', JSON.stringify(settings)); }

function normalize(c) {
  return {
    id: c.id || uid(), kind: ['trading', 'clock'].includes(c.kind) ? c.kind : 'date',
    title: String(c.title || 'Untitled'), target: c.target || '', color: c.color || '#5b8cff',
    category: c.category || '', recurrence: ['weekly', 'monthly', 'yearly'].includes(c.recurrence) ? c.recurrence : 'none',
    mode: c.mode === 'up' ? 'up' : 'down', exchange: c.exchange || 'nyse', session: c.session || 'open',
    clockTz: c.clockTz || '', icon: c.icon || 'auto', notified: !!c.notified, createdAt: c.createdAt || Date.now()
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function fmtTarget(c) {
  const ms = effectiveTarget(c, Date.now());
  if (!isFinite(ms)) return '';
  const d = new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (c.kind === 'trading') return `${SESSION_LABEL[c.session]} · ${d}`;
  if (c.mode === 'up') return `Since ${new Date(c.target).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  if (c.recurrence !== 'none') return `Next: ${d} · ${c.recurrence}`;
  return d;
}
function esc(s) { return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

function render() {
  const q = $('search').value.trim().toLowerCase();
  const list = countdowns.filter((c) => !q || `${c.title} ${c.category}`.toLowerCase().includes(q));
  $('empty').classList.toggle('hidden', countdowns.length !== 0);
  const grid = $('grid'); grid.innerHTML = '';
  for (const c of list) {
    const card = document.createElement('div'); card.className = 'card'; card.dataset.id = c.id; card.style.setProperty('--accent2', c.color);
    const ic = iconFor(c);
    const body = c.kind === 'clock'
      ? `<div class="clock-face"><div class="clock-time" data-clock>--:--:--</div><div class="clock-zone">${esc((c.clockTz || 'Local').split('/').pop().replace('_', ' '))}</div></div>`
      : `<div class="timer"><div class="u"><div class="n" data-u="d">--</div><div class="l">Days</div></div><div class="u"><div class="n" data-u="h">--</div><div class="l">Hrs</div></div><div class="u"><div class="n" data-u="m">--</div><div class="l">Min</div></div><div class="u"><div class="n" data-u="s">--</div><div class="l">Sec</div></div></div><div class="progress"><div data-fill></div></div>`;
    const badge = c.kind === 'trading' ? '<span class="badge" data-badge></span>' : '';
    card.innerHTML = `<div class="card-actions"><div class="menu"><button data-act="edit">Edit</button><button data-act="del">✕</button></div></div><div class="title-row"><span class="ic">${ic ? esc(ic) : ''}</span><span class="t"></span></div><div class="meta"><span class="tg"></span> ${c.category ? `<span class="badge">${esc(c.category)}</span>` : ''} ${badge}</div>${body}`;
    if (!ic) { const e = card.querySelector('.ic'); if (e) e.remove(); }
    card.querySelector('.t').textContent = c.title;
    if (c.kind !== 'clock') card.querySelector('.tg').textContent = fmtTarget(c);
    grid.appendChild(card);
  }
  tick();
}

function tick() {
  const now = Date.now(); let changed = false;
  for (const c of countdowns) {
    const card = $('grid').querySelector(`.card[data-id="${c.id}"]`); if (!card) continue;
    if (c.kind === 'clock') { const z = getZoned(new Date(now), c.clockTz || Intl.DateTimeFormat().resolvedOptions().timeZone); const el = card.querySelector('[data-clock]'); if (el) el.textContent = `${pad(z.h)}:${pad(z.mi)}:${pad(z.s)}`; continue; }
    const b = breakdown(c, now);
    if (c.mode === 'down' && c.recurrence === 'none' && c.kind === 'date') {
      if (b.done && !c.notified) { c.notified = true; changed = true; notify(c); }
      else if (!b.done && c.notified) { c.notified = false; changed = true; }
    }
    const set = (k, v) => { const e = card.querySelector(`[data-u="${k}"]`); if (e) e.textContent = v; };
    set('d', String(b.d)); set('h', pad(b.h)); set('m', pad(b.m)); set('s', pad(b.s));
    const fill = card.querySelector('[data-fill]'); const fr = progress(c, now);
    if (fill) fill.style.width = (fr == null ? 0 : Math.round(fr * 100)) + '%';
    const bd = card.querySelector('[data-badge]'); if (bd) { const st = marketStatus(c, now); if (st) { bd.textContent = st.l; bd.dataset.s = st.s; } }
  }
  if (changed) save();
}

function notify(c) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification('Countdown reached!', { body: `${c.title} is here.`, icon: 'icons/icon-192.png' }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Add / edit sheet
// ---------------------------------------------------------------------------
function fillSelect(sel, opts) { sel.innerHTML = opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join(''); }
function buildTzOptions() { return TZS.map((z) => [z, z ? z.replace('_', ' ') : 'Local (this device)']); }
function buildSessions(exId) { const ex = exById(exId) || EXCHANGES[0]; fillSelect($('session'), Object.keys(ex.s).map((k) => [k, SESSION_LABEL[k]])); }
function syncKind() { const k = $('kind').value; $('dateFields').classList.toggle('hidden', k !== 'date'); $('tradingFields').classList.toggle('hidden', k !== 'trading'); $('clockFields').classList.toggle('hidden', k !== 'clock'); }

function openSheet(id) {
  editingId = id || null;
  fillSelect($('exchange'), EXCHANGES.map((e) => [e.id, e.name]));
  fillSelect($('clockTz'), buildTzOptions());
  fillSelect($('icon'), [['auto', 'Auto (by category)'], ['none', 'None']].concat(ICONS.map((e) => [e, e])));
  $('nl').value = ''; $('nlPreview').textContent = '';
  if (id) {
    const c = countdowns.find((x) => x.id === id);
    $('sheetTitle').textContent = 'Edit countdown'; $('kind').value = c.kind; $('title').value = c.title;
    $('date').value = c.target ? toLocalInput(c.target) : ''; $('mode').value = c.mode; $('recurrence').value = c.recurrence;
    buildSessions(c.exchange); $('exchange').value = c.exchange; $('session').value = c.session; $('clockTz').value = c.clockTz || '';
    $('category').value = c.category; $('color').value = c.color; $('icon').value = c.icon || 'auto';
  } else {
    $('sheetTitle').textContent = 'Add countdown'; $('kind').value = 'date'; $('title').value = '';
    $('date').value = toLocalInput(new Date(Date.now() + 7 * 86400000).toISOString()); $('mode').value = 'down'; $('recurrence').value = 'none';
    buildSessions('nyse'); $('exchange').value = 'nyse'; $('clockTz').value = ''; $('category').value = ''; $('color').value = '#5b8cff'; $('icon').value = 'auto';
  }
  syncKind(); $('sheet').classList.remove('hidden');
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
}
function closeSheet() { $('sheet').classList.add('hidden'); editingId = null; }
function toLocalInput(iso) { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

function saveSheet() {
  const kind = $('kind').value; const title = $('title').value.trim(); if (!title) return;
  if (kind === 'date' && !$('date').value) return;
  let data;
  if (kind === 'trading') data = { kind, exchange: $('exchange').value, session: $('session').value, title, target: '', mode: 'down', recurrence: 'none', category: $('category').value.trim() || 'Markets', color: $('color').value, icon: $('icon').value };
  else if (kind === 'clock') data = { kind, clockTz: $('clockTz').value, title, target: '', mode: 'down', recurrence: 'none', category: $('category').value.trim() || 'Clocks', color: $('color').value, icon: $('icon').value };
  else data = { kind: 'date', title, target: new Date($('date').value).toISOString(), mode: $('mode').value, recurrence: $('recurrence').value, category: $('category').value.trim(), color: $('color').value, icon: $('icon').value };
  if (editingId) { const c = countdowns.find((x) => x.id === editingId); Object.assign(c, data, { notified: false }); }
  else countdowns.push(normalize(data));
  save(); closeSheet(); render();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function applyTheme() { document.body.dataset.theme = settings.theme; $('themeBtn').innerHTML = settings.theme === 'dark' ? '&#9788;' : '&#9790;'; }

function init() {
  load();
  if (!countdowns.length) countdowns = [normalize({ title: 'New Year 2027', target: new Date('2027-01-01T00:00').toISOString(), color: '#ffd166', category: 'Holidays' })];
  countdowns = countdowns.map(normalize);
  applyTheme();

  $('addBtn').addEventListener('click', () => openSheet());
  $('emptyAdd').addEventListener('click', () => openSheet());
  $('homeBtn').addEventListener('click', () => { $('search').value = ''; render(); });
  $('themeBtn').addEventListener('click', () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; saveSettings(); applyTheme(); });
  $('search').addEventListener('input', render);
  $('cancel').addEventListener('click', closeSheet);
  $('save').addEventListener('click', saveSheet);
  $('kind').addEventListener('change', syncKind);
  $('exchange').addEventListener('change', () => buildSessions($('exchange').value));
  $('nl').addEventListener('input', () => { const d = parseNL($('nl').value, Date.now()); if (d) { $('date').value = toLocalInput(d.toISOString()); $('nlPreview').textContent = '→ ' + d.toLocaleString(); } else $('nlPreview').textContent = $('nl').value.trim() ? "Couldn't read that." : ''; });
  $('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
  $('grid').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]'); if (!btn) return;
    const id = btn.closest('.card').dataset.id;
    if (btn.dataset.act === 'edit') openSheet(id);
    else if (btn.dataset.act === 'del') { countdowns = countdowns.filter((c) => c.id !== id); save(); render(); }
  });

  // Cloud sync
  window.cdSync = createCDSync({ getData: () => countdowns, setData: applyRemote, onStatus: renderSyncStatus });
  const openAcct = () => {
    const cfg = window.cdSync.getConfig();
    $('syncUrlInput').value = cfg.url || ''; $('syncKeyInput').value = cfg.key || '';
    window.cdSync.status(); $('acctSheet').classList.remove('hidden');
  };
  const saveCfg = () => window.cdSync.setConfig($('syncUrlInput').value.trim(), $('syncKeyInput').value.trim());
  const creds = () => ({ email: $('syncEmailInput').value.trim(), pw: $('syncPasswordInput').value });
  $('accountBtn').addEventListener('click', openAcct);
  $('acctClose').addEventListener('click', () => $('acctSheet').classList.add('hidden'));
  $('acctSheet').addEventListener('click', (e) => { if (e.target.id === 'acctSheet') $('acctSheet').classList.add('hidden'); });
  $('syncSignupBtn').addEventListener('click', async () => { saveCfg(); const { email, pw } = creds(); try { const r = await window.cdSync.signUp(email, pw); $('syncStatus').textContent = r.confirmed ? 'Account created and signed in.' : 'Account created — confirm via email, then log in.'; } catch (e) { $('syncStatus').textContent = '⚠ ' + e.message; } });
  $('syncLoginBtn').addEventListener('click', async () => { saveCfg(); const { email, pw } = creds(); try { await window.cdSync.signIn(email, pw); } catch (e) { $('syncStatus').textContent = '⚠ ' + e.message; } });
  $('syncLogoutBtn').addEventListener('click', () => window.cdSync.signOut());
  $('syncNowBtn').addEventListener('click', () => window.cdSync.syncNow());
  window.cdSync.startAuto();

  render();
  setInterval(tick, 1000);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.addEventListener('DOMContentLoaded', init);
