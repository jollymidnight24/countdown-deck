'use strict';

// ===========================================================================
// State
// ===========================================================================
let countdowns = [];   // see normalize() for shape
let settings = {
  theme: 'dark', sort: 'manual', alwaysOnTop: false, tmdbApiKey: '',
  trayMode: 'soonest', trayId: '', trayCycleSecs: 6,
  dateFormat: 'system', clock: 'auto', timeZone: '',
  uiFont: 'system', uiScale: 1, dashboardBg: 'preset:nebula', dnd: false,
  quietHoursEnabled: false, quietStart: '22:00', quietEnd: '07:00', snoozeMinutes: 5,
  accent: '', viewMode: 'cards', groupByCategory: false, collapsedGroups: [], onboarded: false
};
let lastTraySig = '';
let focusId = null;
let editingId = null;
let dragId = null;
let tickHandle = null;
let tickCount = 0;

const PRESETS = [
  { title: 'New Year 2027', target: '2027-01-01T00:00', color: '#ffd166', category: 'Holidays' },
  { title: 'Black Friday 2026', target: '2026-11-27T00:00', color: '#5b8cff', category: 'Shopping' },
  { title: 'Summer Solstice 2026', target: '2026-06-21T00:00', color: '#ffb05b', category: 'Seasons' }
];

// ---------------------------------------------------------------------------
// Appearance catalogs
// ---------------------------------------------------------------------------
const FONTS = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  condensed: '"Avenir Next Condensed", "Arial Narrow", system-ui, sans-serif'
};
const FONT_LABELS = { system: 'System sans', rounded: 'Rounded', serif: 'Serif', mono: 'Monospace', condensed: 'Condensed' };

const PRESET_BGS = [
  { id: 'aurora', name: 'Aurora' }, { id: 'nebula', name: 'Nebula' }, { id: 'sunset', name: 'Sunset' },
  { id: 'ocean', name: 'Ocean' }, { id: 'mesh', name: 'Mesh' }, { id: 'cyber', name: 'Cyber grid' },
  { id: 'forest', name: 'Forest' }, { id: 'rose', name: 'Rose' }, { id: 'mono', name: 'Mono' }, { id: 'sunrise', name: 'Sunrise' }
];
const ANIM_BGS = [
  { id: 'aurora', name: 'Aurora (animated)' }, { id: 'ocean', name: 'Ocean (animated)' },
  { id: 'ember', name: 'Ember (animated)' }, { id: 'twilight', name: 'Twilight (animated)' }
];
const CANVAS_BGS = [{ id: 'stars', name: 'Starfield (animated)' }, { id: 'particles', name: 'Particles (animated)' }];

// ---------------------------------------------------------------------------
// Trading sessions: exchanges, holidays, and next-occurrence math
// ---------------------------------------------------------------------------
// US market (NYSE/Nasdaq) holidays are rule-based, so we COMPUTE them for any
// year instead of hard-coding — self-maintaining, offline, no API key.
function dowUTC(y, mo, d) { return new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); }
function shiftYMD(y, mo, d, delta) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}
function nthWeekday(y, mo, weekday, n) {
  const first = dowUTC(y, mo, 1);
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}
function lastWeekday(y, mo, weekday) {
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const last = dowUTC(y, mo, days);
  return days - ((last - weekday + 7) % 7);
}
function easterSunday(y) { // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return [y, month, day];
}
// Weekend holidays observed Fri/Mon — but New Year's on Saturday is NOT
// observed on the preceding Friday (NYSE rule).
function observed(y, mo, d, isNewYear) {
  const dow = dowUTC(y, mo, d);
  if (dow === 6) return isNewYear ? null : shiftYMD(y, mo, d, -1);
  if (dow === 0) return shiftYMD(y, mo, d, 1);
  return [y, mo, d];
}
const _calCache = new Map();
function usCalendar(year) {
  if (_calCache.has(year)) return _calCache.get(year);
  const holidays = new Set(), halfDays = new Set();
  const add = (t) => { if (t) holidays.add(ymdKey(t[0], t[1], t[2])); };

  add(observed(year, 1, 1, true));                       // New Year's
  add([year, 1, nthWeekday(year, 1, 1, 3)]);             // MLK (3rd Mon Jan)
  add([year, 2, nthWeekday(year, 2, 1, 3)]);             // Washington (3rd Mon Feb)
  add(shiftYMD(...easterSunday(year), -2));              // Good Friday
  add([year, 5, lastWeekday(year, 5, 1)]);               // Memorial (last Mon May)
  if (year >= 2022) add(observed(year, 6, 19));          // Juneteenth
  add(observed(year, 7, 4));                             // Independence Day
  add([year, 9, nthWeekday(year, 9, 1, 1)]);             // Labor (1st Mon Sep)
  const thanks = nthWeekday(year, 11, 4, 4);             // Thanksgiving (4th Thu Nov)
  add([year, 11, thanks]);
  add(observed(year, 12, 25));                           // Christmas

  // Early-close half-days (1pm ET)
  halfDays.add(ymdKey(year, 11, thanks + 1));            // day after Thanksgiving
  if (dowUTC(year, 7, 4) >= 1 && dowUTC(year, 7, 4) <= 5 && dowUTC(year, 7, 3) >= 1 && dowUTC(year, 7, 3) <= 5)
    halfDays.add(ymdKey(year, 7, 3));                    // July 3 before a weekday July 4
  const dec24 = dowUTC(year, 12, 24);
  if (dec24 >= 1 && dec24 <= 5 && !holidays.has(ymdKey(year, 12, 24)))
    halfDays.add(ymdKey(year, 12, 24));                  // Christmas Eve (when a normal trading day)

  const cal = { holidays, halfDays };
  _calCache.set(year, cal);
  return cal;
}
function isUSHoliday(y, mo, d) { return usCalendar(y).holidays.has(ymdKey(y, mo, d)); }
function usHalfDay(y, mo, d) { return usCalendar(y).halfDays.has(ymdKey(y, mo, d)); }

const SESSION_LABEL = { pre: 'Pre-market open', open: 'Market open', close: 'Market close', post: 'Post-market close' };

const EXCHANGES = [
  { id: 'nyse', name: 'NYSE (New York)', tz: 'America/New_York', holidays: 'us', sessions: { pre: '04:00', open: '09:30', close: '16:00', post: '20:00' } },
  { id: 'nasdaq', name: 'Nasdaq (New York)', tz: 'America/New_York', holidays: 'us', sessions: { pre: '04:00', open: '09:30', close: '16:00', post: '20:00' } },
  { id: 'tsx', name: 'TSX (Toronto)', tz: 'America/Toronto', holidays: null, sessions: { open: '09:30', close: '16:00' } },
  { id: 'lse', name: 'LSE (London)', tz: 'Europe/London', holidays: null, sessions: { open: '08:00', close: '16:30' } },
  { id: 'xetra', name: 'XETRA (Frankfurt)', tz: 'Europe/Berlin', holidays: null, sessions: { open: '09:00', close: '17:30' } },
  { id: 'euronext', name: 'Euronext (Paris)', tz: 'Europe/Paris', holidays: null, sessions: { open: '09:00', close: '17:30' } },
  { id: 'tse', name: 'TSE (Tokyo)', tz: 'Asia/Tokyo', holidays: null, sessions: { open: '09:00', close: '15:00' } },
  { id: 'hkex', name: 'HKEX (Hong Kong)', tz: 'Asia/Hong_Kong', holidays: null, sessions: { open: '09:30', close: '16:00' } },
  { id: 'sse', name: 'SSE (Shanghai)', tz: 'Asia/Shanghai', holidays: null, sessions: { open: '09:30', close: '15:00' } },
  { id: 'nse', name: 'NSE (India)', tz: 'Asia/Kolkata', holidays: null, sessions: { open: '09:15', close: '15:30' } },
  { id: 'asx', name: 'ASX (Sydney)', tz: 'Australia/Sydney', holidays: null, sessions: { open: '10:00', close: '16:00' } }
];
const exchangeById = (id) => EXCHANGES.find((e) => e.id === id);

function getZoned(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  let h = +p.hour; if (h === 24) h = 0;
  return { y: +p.year, mo: +p.month, d: +p.day, h, mi: +p.minute, s: +p.second };
}
function tzOffsetMs(date, tz) {
  const z = getZoned(date, tz);
  return Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s) - date.getTime();
}
function wallToUtc(y, mo, d, h, mi, tz) {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) guess = Date.UTC(y, mo - 1, d, h, mi) - tzOffsetMs(new Date(guess), tz);
  return guess;
}
function ymdKey(y, mo, d) { return `${y}-${pad(mo)}-${pad(d)}`; }
function isTradingDay(y, mo, d, ex) {
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (ex.holidays === 'us' && isUSHoliday(y, mo, d)) return false;
  return true;
}
// Session start time for a given day, applying US early-close half-days.
function sessionTimeFor(ex, sessionKey, y, mo, d) {
  let hhmm = ex.sessions[sessionKey];
  if (!hhmm) return null;
  if (ex.holidays === 'us' && usHalfDay(y, mo, d)) {
    if (sessionKey === 'close') hhmm = '13:00';
    else if (sessionKey === 'post') hhmm = '17:00';
  }
  return hhmm;
}
function nextSessionMs(ex, sessionKey, fromMs) {
  if (!ex || !ex.sessions[sessionKey]) return NaN;
  const z = getZoned(new Date(fromMs), ex.tz);
  let y = z.y, mo = z.mo, d = z.d;
  for (let i = 0; i < 400; i++) {
    if (isTradingDay(y, mo, d, ex)) {
      const [sh, sm] = sessionTimeFor(ex, sessionKey, y, mo, d).split(':').map(Number);
      const inst = wallToUtc(y, mo, d, sh, sm, ex.tz);
      if (inst > fromMs) return inst;
    }
    const nx = new Date(Date.UTC(y, mo - 1, d));
    nx.setUTCDate(nx.getUTCDate() + 1);
    y = nx.getUTCFullYear(); mo = nx.getUTCMonth() + 1; d = nx.getUTCDate();
  }
  return NaN;
}
// Most recent past occurrence of a session (used as the progress-bar start).
function prevSessionMs(ex, sessionKey, fromMs) {
  if (!ex || !ex.sessions[sessionKey]) return NaN;
  const z = getZoned(new Date(fromMs), ex.tz);
  let y = z.y, mo = z.mo, d = z.d;
  for (let i = 0; i < 400; i++) {
    if (isTradingDay(y, mo, d, ex)) {
      const [sh, sm] = sessionTimeFor(ex, sessionKey, y, mo, d).split(':').map(Number);
      const inst = wallToUtc(y, mo, d, sh, sm, ex.tz);
      if (inst < fromMs) return inst;
    }
    const nx = new Date(Date.UTC(y, mo - 1, d));
    nx.setUTCDate(nx.getUTCDate() - 1);
    y = nx.getUTCFullYear(); mo = nx.getUTCMonth() + 1; d = nx.getUTCDate();
  }
  return NaN;
}

// ===========================================================================
// DOM refs
// ===========================================================================
const $ = (id) => document.getElementById(id);
const grid = $('grid');
const emptyState = $('emptyState');
const searchInput = $('searchInput');
const sortSelect = $('sortSelect');
const categoryFilter = $('categoryFilter');
const viewSelect = $('viewSelect');

// add/edit modal
const modal = $('modal');
const modalTitle = $('modalTitle');
const form = $('countdownForm');
const titleInput = $('titleInput');
const dateInput = $('dateInput');
const modeInput = $('modeInput');
const recurrenceInput = $('recurrenceInput');
const categoryInput = $('categoryInput');
const colorInput = $('colorInput');
const categoryList = $('categoryList');
const kindInput = $('kindInput');
const exchangeInput = $('exchangeInput');
const sessionInput = $('sessionInput');
const bgInput = $('bgInput');
const fontInput = $('fontInput');
const fontScaleInput = $('fontScaleInput');
const bgFile = $('bgFile');
const bgDimInput = $('bgDimInput');
const bgBlurInput = $('bgBlurInput');
const alertSoundInput = $('alertSoundInput');
const alertSoundFile = $('alertSoundFile');
const alertBannerInput = $('alertBannerInput');
const alertFlashInput = $('alertFlashInput');
const msInputs = { 1440: $('ms1440'), 60: $('ms60'), 10: $('ms10') };
const quietEnabledInput = $('quietEnabledInput');
const quietStartInput = $('quietStartInput');
const quietEndInput = $('quietEndInput');
const snoozeMinutesInput = $('snoozeMinutesInput');

// settings modal
const settingsModal = $('settingsModal');
const alwaysOnTopInput = $('alwaysOnTopInput');
const tmdbKeyInput = $('tmdbKeyInput');
const trayModeInput = $('trayModeInput');
const trayIdInput = $('trayIdInput');
const trayCycleInput = $('trayCycleInput');
const uiFontInput = $('uiFontInput');
const uiScaleInput = $('uiScaleInput');
const dashboardBgInput = $('dashboardBgInput');
const dashboardBgFile = $('dashboardBgFile');
const dateFormatInput = $('dateFormatInput');
const clockInput = $('clockInput');
const timeZoneInput = $('timeZoneInput');
const paletteInput = $('paletteInput');
const accentInput = $('accentInput');

// ===========================================================================
// Helpers
// ===========================================================================
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');

function normalize(c) {
  return {
    id: c.id || uid(),
    kind: c.kind === 'trading' ? 'trading' : 'date',
    exchange: c.exchange || '',
    session: c.session || 'open',
    title: String(c.title || 'Untitled'),
    target: c.target,
    color: c.color || '#5b8cff',
    pinned: !!c.pinned,
    category: c.category || '',
    recurrence: ['weekly', 'monthly', 'yearly'].includes(c.recurrence) ? c.recurrence : 'none',
    mode: c.mode === 'up' ? 'up' : 'down',
    notified: !!c.notified,
    lastOcc: c.lastOcc || null,
    bg: c.bg || 'auto',
    fontFamily: c.fontFamily || '',
    fontScale: Number(c.fontScale) || 1,
    alertSound: c.alertSound || 'none',
    alertBanner: c.alertBanner !== false,   // default on (preserves prior behavior)
    alertFlash: !!c.alertFlash,
    milestones: Array.isArray(c.milestones) ? c.milestones : [],   // minutes-before-end reminders
    createdAt: c.createdAt || Date.now(),
    bgDim: c.bgDim == null ? 60 : Number(c.bgDim),
    bgBlur: c.bgBlur == null ? 0 : Number(c.bgBlur)
  };
}

function targetMs(iso) { return new Date(iso).getTime(); }

// Next occurrence at or after `fromMs` for a recurring item.
function nextOccurrence(baseISO, rec, fromMs) {
  const d = new Date(baseISO);
  if (rec === 'none' || isNaN(d.getTime())) return d.getTime();
  let guard = 0;
  while (d.getTime() <= fromMs && guard++ < 5000) {
    if (rec === 'weekly') d.setDate(d.getDate() + 7);
    else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (rec === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else break;
  }
  return d.getTime();
}

function effectiveTargetMs(c, nowMs) {
  if (c.kind === 'trading') return nextSessionMs(exchangeById(c.exchange), c.session, nowMs);
  if (c.recurrence !== 'none') return nextOccurrence(c.target, c.recurrence, nowMs);
  return targetMs(c.target);
}

function unitsFromMs(ms) {
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

function breakdown(c, nowMs) {
  if (c.mode === 'up') {
    const diff = Math.max(0, nowMs - targetMs(c.target));
    return Object.assign({ done: false, mode: 'up' }, unitsFromMs(diff));
  }
  const diff = effectiveTargetMs(c, nowMs) - nowMs;
  if (!isFinite(diff)) return { done: false, mode: 'down', d: 0, h: 0, m: 0, s: 0 };
  if (diff <= 0) return { done: true, mode: 'down', d: 0, h: 0, m: 0, s: 0 };
  return Object.assign({ done: false, mode: 'down' }, unitsFromMs(diff));
}

// Fraction elapsed (0..1) toward the target, or null if not applicable.
function progressStart(c, target) {
  if (c.kind === 'trading') {
    const p = prevSessionMs(exchangeById(c.exchange), c.session, Date.now());
    return isFinite(p) ? p : null;
  }
  if (c.recurrence !== 'none') {
    const d = new Date(target);
    if (c.recurrence === 'weekly') d.setDate(d.getDate() - 7);
    else if (c.recurrence === 'monthly') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
  }
  return new Date(c.createdAt || Date.now()).getTime();
}
function progressFraction(c, nowMs) {
  if (c.mode !== 'down') return null;
  const target = effectiveTargetMs(c, nowMs);
  if (!isFinite(target)) return null;
  const start = progressStart(c, target);
  if (start == null || target <= start) return null;
  return Math.min(1, Math.max(0, (nowMs - start) / (target - start)));
}

// Quiet hours
function hhmmToMin(s) { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function isQuietNow() {
  if (!settings.quietHoursEnabled) return false;
  const d = new Date();
  const cur = d.getHours() * 60 + d.getMinutes();
  const s = hhmmToMin(settings.quietStart), e = hhmmToMin(settings.quietEnd);
  if (s === e) return false;
  return s < e ? (cur >= s && cur < e) : (cur >= s || cur < e);
}

function fmtOptions() {
  const clock = settings.clock;
  const h12 = clock === '12' ? true : clock === '24' ? false : undefined;
  let o;
  switch (settings.dateFormat) {
    case 'us': o = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: h12 === undefined ? true : h12 }; break;
    case 'eu': o = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: h12 === undefined ? false : h12 }; break;
    case 'long': o = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: h12 }; break;
    default: o = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: h12 };
  }
  if (settings.timeZone) { o.timeZone = settings.timeZone; o.timeZoneName = 'short'; }
  return o;
}

function formatInstant(ms) {
  if (!isFinite(ms)) return '—';
  const d = new Date(ms);
  if (settings.dateFormat === 'iso') {
    const tz = settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const z = getZoned(d, tz);
    return `${z.y}-${pad(z.mo)}-${pad(z.d)} ${pad(z.h)}:${pad(z.mi)}`;
  }
  return new Intl.DateTimeFormat(undefined, fmtOptions()).format(d);
}

function formatTarget(c) {
  const ms = effectiveTargetMs(c, Date.now());
  if (c.kind === 'trading') {
    const ex = exchangeById(c.exchange);
    const sess = SESSION_LABEL[c.session] || c.session;
    let early = '';
    if (ex && ex.holidays === 'us' && (c.session === 'close' || c.session === 'post') && isFinite(ms)) {
      const z = getZoned(new Date(ms), ex.tz);
      if (usHalfDay(z.y, z.mo, z.d)) early = ' · early close';
    }
    return `${sess} · ${formatInstant(ms)}${early} · each trading day`;
  }
  const verb = c.mode === 'up' ? 'Since' : 'Target';
  const rep = c.recurrence !== 'none' ? ` · repeats ${c.recurrence}` : '';
  return `${verb}: ${formatInstant(ms)}${rep}`;
}

function toLocalInputValue(iso) {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const persist = () => window.api.saveCountdowns(countdowns);
const persistSettings = () => window.api.saveSettings(settings);

// ===========================================================================
// Derived views (search / filter / sort / pin)
// ===========================================================================
function visibleCountdowns() {
  const q = searchInput.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  let list = countdowns.filter((c) => {
    if (cat && c.category !== cat) return false;
    if (q && !(`${c.title} ${c.category}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const now = Date.now();
  const sorter = {
    soonest: (a, b) => effectiveTargetMs(a, now) - effectiveTargetMs(b, now),
    name: (a, b) => a.title.localeCompare(b.title),
    manual: () => 0
  }[settings.sort] || (() => 0);

  // Stable sort with pinned first.
  list = list.map((c, i) => [c, i]).sort((A, B) => {
    if (A[0].pinned !== B[0].pinned) return A[0].pinned ? -1 : 1;
    const r = sorter(A[0], B[0]);
    return r !== 0 ? r : A[1] - B[1];
  }).map((p) => p[0]);

  return list;
}

// ===========================================================================
// Rendering
// ===========================================================================
function createCard(c) {
  const card = document.createElement('div');
  card.className = 'card' + (c.pinned ? ' pinned' : '');
  card.style.setProperty('--card-accent', c.color);
  card.dataset.id = c.id;
  card.draggable = !settings.groupByCategory;

  const tag = c.category ? `<span class="tag">${escapeHtml(c.category)}</span>` : '';
  const modePill = c.mode === 'up' ? '<span class="mode-pill">counting up</span>' : '';
  card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title">
            <span class="drag-handle" title="Drag to reorder">⠿</span>
            <span class="pin-dot">${c.pinned ? '📌' : ''}</span>
            <span class="t-text"></span>
          </div>
          <div class="card-meta">
            <span class="t-target"></span> ${tag} ${modePill}
          </div>
        </div>
        <div class="card-menu">
          <button class="btn ghost tiny" data-action="test" title="Test this countdown's alerts">🔔</button>
          <button class="btn ghost tiny" data-action="pin">${c.pinned ? 'Unpin' : 'Pin'}</button>
          <button class="btn ghost tiny" data-action="edit">Edit</button>
          <button class="btn ghost tiny" data-action="remove">✕</button>
        </div>
      </div>
      <div class="timer">
        <div class="unit"><div class="num" data-u="d">--</div><div class="lbl">Days</div></div>
        <div class="unit"><div class="num" data-u="h">--</div><div class="lbl">Hours</div></div>
        <div class="unit"><div class="num" data-u="m">--</div><div class="lbl">Min</div></div>
        <div class="unit"><div class="num" data-u="s">--</div><div class="lbl">Sec</div></div>
      </div>
      <div class="done-banner hidden">🎉 It's here!</div>
      <div class="card-progress"><div class="card-progress-fill"></div></div>`;

  card.querySelector('.t-text').textContent = c.title;
  card.querySelector('.t-target').textContent = formatTarget(c);
  applyCardAppearance(card, c);
  return card;
}

function render() {
  refreshCategoryControls();
  const list = visibleCountdowns();
  emptyState.classList.toggle('hidden', countdowns.length !== 0);
  grid.classList.toggle('hidden', countdowns.length === 0);
  grid.innerHTML = '';

  const viewClass = settings.viewMode === 'compact' ? 'view-compact' : settings.viewMode === 'list' ? 'view-list' : '';

  if (settings.groupByCategory) {
    grid.className = 'grid grouped';                 // container holds sections
    const groups = new Map();
    for (const c of list) {
      const key = c.category || 'Uncategorized';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    for (const [name, items] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const collapsed = (settings.collapsedGroups || []).includes(name);
      const section = document.createElement('div');
      section.className = 'group' + (collapsed ? ' collapsed' : '');
      section.dataset.group = name;
      const head = document.createElement('div');
      head.className = 'group-head';
      head.innerHTML = `<span class="chev">▾</span> <span>${escapeHtml(name)}</span> <span class="group-count">${items.length}</span>`;
      head.addEventListener('click', () => toggleGroup(name));
      const inner = document.createElement('div');
      inner.className = 'grid ' + viewClass;
      for (const c of items) inner.appendChild(createCard(c));
      section.appendChild(head);
      section.appendChild(inner);
      grid.appendChild(section);
    }
  } else {
    grid.className = 'grid ' + viewClass;
    for (const c of list) grid.appendChild(createCard(c));
  }
  tick();
}

function toggleGroup(name) {
  const set = new Set(settings.collapsedGroups || []);
  if (set.has(name)) set.delete(name); else set.add(name);
  settings.collapsedGroups = [...set];
  persistSettings(); render();
}

// Apply a countdown's background + font choices to its card element.
function applyCardAppearance(card, c) {
  card.style.setProperty('--card-scale', c.fontScale || 1);
  card.style.setProperty('--card-dim', (c.bgDim == null ? 60 : c.bgDim) + '%');
  card.style.setProperty('--card-blur', (c.bgBlur || 0) + 'px');
  card.style.fontFamily = c.fontFamily && FONTS[c.fontFamily] ? FONTS[c.fontFamily] : '';

  // reset
  card.classList.remove('has-bg', 'animbg-aurora', 'animbg-ocean', 'animbg-ember', 'animbg-twilight');
  card.style.backgroundImage = '';
  const old = card.querySelector('.card-media');
  if (old) old.remove();

  const spec = c.bg || 'auto';
  if (spec === 'none') return;

  if (spec === 'auto') {
    card.classList.add('has-bg');
    card.style.backgroundImage = `radial-gradient(120% 120% at 80% 0%, ${c.color}55 0%, transparent 60%)`;
    return;
  }
  const [type, val] = spec.split(':');
  if (type === 'preset') {
    // use a media <img> so blur/dim apply uniformly
    card.classList.add('has-bg');
    const img = document.createElement('img');
    img.className = 'card-media';
    img.src = `assets/backgrounds/${val}.jpg`;
    card.insertBefore(img, card.firstChild);
  } else if (type === 'anim') {
    card.classList.add('has-bg', 'animbg-' + val);
  } else if (type === 'media') {
    const url = mediaUrl(val);
    if (url) {
      card.classList.add('has-bg');
      const isVid = /\.(mp4|webm)$/i.test(url);
      const el = document.createElement(isVid ? 'video' : 'img');
      el.className = 'card-media';
      el.src = url;
      if (isVid) { el.autoplay = true; el.loop = true; el.muted = true; el.playsInline = true; }
      card.insertBefore(el, card.firstChild);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Update a digit element, animating only when the value actually changes.
function setNum(el, text) {
  if (!el || el.textContent === text) return;
  el.textContent = text;
  el.classList.remove('flip');
  void el.offsetWidth;   // restart the CSS animation
  el.classList.add('flip');
}

function tick() {
  const now = Date.now();
  let changed = false;

  for (const c of countdowns) {
    const b = breakdown(c, now);

    // Notifications + roll-over (recurring and trading re-arm automatically)
    const isRolling = c.recurrence !== 'none' || c.kind === 'trading';
    if (c.mode === 'down' && !isRolling) {
      if (b.done && !c.notified) {
        c.notified = true; changed = true;
        fireAlerts(c);
      } else if (!b.done && c.notified) {
        c.notified = false; changed = true; // target moved into the future via edit
      }
    } else if (isRolling) {
      const occ = effectiveTargetMs(c, now);
      if (c.lastOcc == null) {
        c.lastOcc = occ; changed = true;          // first observation: arm without alerting
      } else if (occ !== c.lastOcc) {
        c.lastOcc = occ; changed = true;
        fireAlerts(c);
      }
    }

    // Milestone (pre-end) reminders --------------------------------------
    if (c.mode === 'down' && c.milestones && c.milestones.length) {
      const occ = effectiveTargetMs(c, now);
      const remMin = (occ - now) / 60000;
      if (c._msOcc !== occ) {                       // new occurrence: re-arm
        c._msOcc = occ; c._msFired = {};
        for (const m of c.milestones) if (remMin <= m) c._msFired[m] = true; // skip already-passed
      }
      for (const m of c.milestones) {
        if (!c._msFired[m] && remMin > 0 && remMin <= m) {
          c._msFired[m] = true;
          fireMilestone(c, m);
        }
      }
    }

    // DOM update ---------------------------------------------------------
    const card = grid.querySelector(`.card[data-id="${c.id}"]`);
    if (!card) continue;
    const done = b.done;
    card.classList.toggle('done', done);
    card.querySelector('.done-banner').classList.toggle('hidden', !done);
    setNum(card.querySelector('[data-u="d"]'), String(b.d));
    setNum(card.querySelector('[data-u="h"]'), pad(b.h));
    setNum(card.querySelector('[data-u="m"]'), pad(b.m));
    setNum(card.querySelector('[data-u="s"]'), pad(b.s));

    // urgency color shift as zero nears (down mode only)
    let soon = false, imminent = false;
    if (c.mode === 'down' && !done) {
      const rem = effectiveTargetMs(c, now) - now;
      imminent = rem > 0 && rem <= 60000;
      soon = rem > 60000 && rem <= 3600000;
    }
    card.classList.toggle('urgent-now', imminent);
    card.classList.toggle('urgent-soon', soon);

    const frac = progressFraction(c, now);
    const bar = card.querySelector('.card-progress');
    if (frac == null) { bar.style.display = 'none'; }
    else { bar.style.display = ''; card.querySelector('.card-progress-fill').style.width = (frac * 100).toFixed(1) + '%'; }
  }

  if (focusId) updateFocus(now);
  if (changed) persist();
  updateTray(now);
  tickCount++;
}

// ===========================================================================
// Focus mode (single countdown, full screen)
// ===========================================================================
function openFocus(id) {
  const c = countdowns.find((x) => x.id === id);
  if (!c) return;
  focusId = id;
  $('focusTitle').textContent = c.title;
  $('focusTitle').style.color = c.color || '';
  $('focusOverlay').classList.remove('hidden');
  updateFocus(Date.now());
}
function closeFocus() { focusId = null; $('focusOverlay').classList.add('hidden'); }
function updateFocus(now) {
  const c = countdowns.find((x) => x.id === focusId);
  if (!c) { closeFocus(); return; }
  const b = breakdown(c, now);
  $('focusOverlay').querySelector('[data-fu="d"]').textContent = String(b.d);
  $('focusOverlay').querySelector('[data-fu="h"]').textContent = pad(b.h);
  $('focusOverlay').querySelector('[data-fu="m"]').textContent = pad(b.m);
  $('focusOverlay').querySelector('[data-fu="s"]').textContent = pad(b.s);
  $('focusTarget').textContent = formatTarget(c);
}

// Active (still-counting-down) entries, soonest first.
function trayEntries(now) {
  return countdowns
    .filter((c) => c.mode === 'down')
    .map((c) => ({ id: c.id, title: c.title, ms: effectiveTargetMs(c, now) - now }))
    .filter((x) => x.ms > 0)
    .sort((a, b) => a.ms - b.ms)
    .map((x) => {
      const u = unitsFromMs(x.ms);
      return { id: x.id, label: `${x.title}: ${u.d}d ${pad(u.h)}h ${pad(u.m)}m` };
    });
}

function updateTray(now) {
  const entries = trayEntries(now);
  const items = entries.slice(0, 8).map((e) => e.label);

  let title = '';
  if (entries.length) {
    if (settings.trayMode === 'specific') {
      const e = entries.find((x) => x.id === settings.trayId);
      title = (e || entries[0]).label;          // fall back if the chosen one elapsed
    } else if (settings.trayMode === 'cycle') {
      const secs = Math.min(120, Math.max(2, Number(settings.trayCycleSecs) || 6));
      const idx = Math.floor(now / (secs * 1000)) % entries.length;
      title = entries[idx].label;
    } else {
      title = entries[0].label;                 // soonest
    }
  }

  const sig = title + '|' + items.join('§');
  if (sig === lastTraySig) return;              // avoid redundant IPC every second
  lastTraySig = sig;
  window.api.updateTray({ title, items });
}

function refreshCategoryControls() {
  const cats = [...new Set(countdowns.map((c) => c.category).filter(Boolean))].sort();
  const cur = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="">All categories</option>' +
    cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (cats.includes(cur)) categoryFilter.value = cur;
  categoryList.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
}

// ===========================================================================
// Media + appearance helpers
// ===========================================================================
const mediaUrl = (file) => (file ? `cdmedia://media/${file}` : '');

// ===========================================================================
// Alarm sounds (Web Audio synth — no bundled files) + uploads + flash
// ===========================================================================
const SOUND_LABELS = { none: 'None (silent)', beep: 'Beep', digital: 'Digital alarm', chime: 'Chime', bell: 'Bell', radar: 'Radar', pulse: 'Pulse' };
let _ac = null;
let _currentAudio = null;
function audioCtx() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  if (_ac.state === 'suspended') _ac.resume();
  return _ac;
}
function tone(ctx, freq, start, dur, type, peak) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  o.connect(g); g.connect(ctx.destination);
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak || 0.25, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.03);
}
function playBuiltin(id) {
  const ctx = audioCtx();
  if (id === 'beep') { for (let i = 0; i < 6; i++) tone(ctx, 880, i * 0.32, 0.18, 'square', 0.2); }
  else if (id === 'digital') { for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) tone(ctx, 1175, r * 0.7 + i * 0.11, 0.07, 'triangle', 0.18); }
  else if (id === 'chime') { [659, 587, 440].forEach((f, i) => tone(ctx, f, i * 0.42, 0.6, 'sine', 0.3)); }
  else if (id === 'bell') { for (let r = 0; r < 2; r++) { tone(ctx, 660, r * 1.1, 1.1, 'sine', 0.3); tone(ctx, 1320, r * 1.1, 1.0, 'sine', 0.12); } }
  else if (id === 'radar') { for (let r = 0; r < 3; r++) { tone(ctx, 500, r * 0.55, 0.22, 'sawtooth', 0.16); tone(ctx, 760, r * 0.55 + 0.18, 0.22, 'sawtooth', 0.16); } }
  else if (id === 'pulse') { for (let i = 0; i < 5; i++) tone(ctx, i % 2 ? 784 : 587, i * 0.26, 0.2, 'square', 0.18); }
}
function stopSound() {
  if (_currentAudio) { try { _currentAudio.pause(); } catch (_) {} _currentAudio = null; }
}
function playSound(spec) {
  if (!spec || spec === 'none') return;
  stopSound();
  if (spec.startsWith('media:')) {
    const url = mediaUrl(spec.slice(6));
    if (url) { _currentAudio = new Audio(url); _currentAudio.play().catch(() => {}); }
  } else {
    playBuiltin(spec);
  }
}

let flashTimer = null;
let flashCountdownId = null;
const SNOOZE_MS = 5 * 60 * 1000;

function showFlash(c) {
  const o = $('flashOverlay');
  flashCountdownId = c.id;
  $('flashTitle').textContent = c.title;
  $('flashSnooze').textContent = `Snooze ${Math.round(snoozeMs() / 60000)} min`;
  o.style.setProperty('--flash-color', c.color || '#5b8cff');
  o.classList.remove('hidden');
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(dismissFlash, 12000);
}
function dismissFlash() {
  $('flashOverlay').classList.add('hidden');
  if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
  flashCountdownId = null;
  stopSound();
}
function snoozeMs() { return Math.min(120, Math.max(1, Number(settings.snoozeMinutes) || 5)) * 60000; }
function snoozeFlash() {
  const c = countdowns.find((x) => x.id === flashCountdownId);
  dismissFlash();
  if (c) setTimeout(() => fireAlerts(c, { snooze: true }), snoozeMs());
}

// A gentle pre-end reminder (banner only), respecting DND / quiet hours.
function fireMilestone(c, minutes) {
  if (settings.dnd || isQuietNow()) return;
  const label = minutes >= 1440 ? `${Math.round(minutes / 1440)} day${minutes >= 2880 ? 's' : ''}`
    : minutes >= 60 ? `${Math.round(minutes / 60)} hour${minutes >= 120 ? 's' : ''}`
      : `${minutes} minutes`;
  window.api.notify(`${label} left`, c.title);
}

// Fire the alerts a countdown is configured for (banner / sound / flash).
// `test` bypasses Do Not Disturb and quiet hours; otherwise both suppress.
function fireAlerts(c, opts = {}) {
  if ((settings.dnd || isQuietNow()) && !opts.test) return;
  if (c.alertBanner !== false || opts.test) {
    const title = c.kind === 'trading' ? 'Trading session' : (c.recurrence !== 'none' ? 'Recurring countdown' : 'Countdown reached!');
    const suffix = opts.snooze ? ' (snoozed)' : '';
    const body = (c.kind === 'trading' ? `${c.title} — session time.` : `${c.title} is here.`) + suffix;
    if (c.alertBanner !== false) window.api.notify(title, body);
  }
  if (c.alertSound && c.alertSound !== 'none') playSound(c.alertSound);
  if (c.alertFlash || opts.test) showFlash(c);
}

function applyUiFont() { document.body.style.setProperty('--ui-font', FONTS[settings.uiFont] || FONTS.system); }
function applyUiScale() { window.api.setZoom(Number(settings.uiScale) || 1); }

let canvasRAF = null;
function stopCanvas() { if (canvasRAF) cancelAnimationFrame(canvasRAF); canvasRAF = null; }

function startCanvas(kind) {
  const canvas = $('bgCanvas');
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.onresize = resize;
  const n = kind === 'particles' ? 70 : 220;
  const pts = Array.from({ length: n }, () => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    r: kind === 'particles' ? 1 + Math.random() * 3 : Math.random() * 1.6 + 0.3,
    vx: (Math.random() - 0.5) * (kind === 'particles' ? 0.3 : 0.08),
    vy: (Math.random() - 0.5) * (kind === 'particles' ? 0.3 : 0.08) + (kind === 'stars' ? 0.05 : 0),
    a: 0.3 + Math.random() * 0.7
  }));
  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x += canvas.width; if (p.x > canvas.width) p.x -= canvas.width;
      if (p.y < 0) p.y += canvas.height; if (p.y > canvas.height) p.y -= canvas.height;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = kind === 'particles' ? `rgba(120,160,255,${p.a * 0.6})` : `rgba(255,255,255,${p.a})`;
      ctx.fill();
    }
    canvasRAF = requestAnimationFrame(frame);
  }
  frame();
}

const ANIM_CLASSES = ['animbg-aurora', 'animbg-ocean', 'animbg-ember', 'animbg-twilight'];

function applyDashboardBg() {
  const layer = $('bgLayer');
  const spec = settings.dashboardBg || '';
  stopCanvas();
  layer.className = '';
  layer.style.backgroundImage = '';
  const oldMedia = layer.querySelector('.bg-media');
  if (oldMedia) oldMedia.remove();
  if (!spec || spec === 'none') return;

  const [type, val] = spec.split(':');
  if (type === 'preset') {
    layer.classList.add('has-media');
    layer.style.backgroundImage = `url("assets/backgrounds/${val}.jpg")`;
  } else if (type === 'anim') {
    layer.classList.add('has-media', 'animbg-' + val);
  } else if (type === 'canvas') {
    layer.classList.add('has-media', 'anim-canvas');
    startCanvas(val);
  } else if (type === 'media') {
    const url = mediaUrl(val);
    if (url) {
      layer.classList.add('has-media');
      const isVid = /\.(mp4|webm)$/i.test(url);
      const el = document.createElement(isVid ? 'video' : 'img');
      el.className = 'bg-media';
      el.src = url;
      if (isVid) { el.autoplay = true; el.loop = true; el.muted = true; el.playsInline = true; }
      layer.insertBefore(el, layer.firstChild);
    }
  }
}

// Build a background <select> with grouped options.
function buildBgSelect(sel, { includeAuto }) {
  const groups = [];
  const basic = [];
  if (includeAuto) basic.push(['auto', 'Auto (from accent color)']);
  basic.push(['none', 'None']);
  groups.push(['Basic', basic]);
  groups.push(['Generated images', PRESET_BGS.map((b) => ['preset:' + b.id, b.name])]);
  groups.push(['Animated gradients', ANIM_BGS.map((b) => ['anim:' + b.id, b.name])]);
  groups.push(['Animated canvas', CANVAS_BGS.map((b) => ['canvas:' + b.id, b.name])]);
  groups.push(['Custom', [['upload', 'Upload image / GIF / video…']]]);
  sel.innerHTML = groups.map(([label, opts]) =>
    `<optgroup label="${label}">` + opts.map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('') + '</optgroup>'
  ).join('');
}

function buildFontSelect(sel, includeInherit) {
  const opts = (includeInherit ? [['', 'Match UI font']] : []).concat(Object.keys(FONTS).map((k) => [k, FONT_LABELS[k]]));
  sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('');
}

function buildSoundSelect(sel) {
  const builtins = ['none', 'beep', 'digital', 'chime', 'bell', 'radar', 'pulse'];
  sel.innerHTML = builtins.map((k) => `<option value="${k}">${SOUND_LABELS[k]}</option>`).join('') +
    '<option value="upload">Upload sound…</option>';
}
const soundValueOrNone = (v) => (v === 'upload' ? 'none' : v);

function buildTimeZoneSelect(sel) {
  const zones = ['', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];
  sel.innerHTML = zones.map((z) => `<option value="${z}">${z ? z.replace('_', ' ') : 'Local (this computer)'}</option>`).join('');
}

function buildExchangeSelect() {
  exchangeInput.innerHTML = EXCHANGES.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
}
function buildSessionSelect(exId) {
  const ex = exchangeById(exId) || EXCHANGES[0];
  sessionInput.innerHTML = Object.keys(ex.sessions).map((k) => `<option value="${k}">${SESSION_LABEL[k]}</option>`).join('');
}

// When an upload option is chosen, import the file and swap in a concrete value.
async function handleMediaPick(fileInput, sel, wrap) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const res = await window.api.saveMedia(reader.result, ext);
    if (res && res.url && res.file) {
      const opt = document.createElement('option');
      opt.value = 'media:' + res.file;
      opt.textContent = 'Uploaded: ' + file.name.slice(0, 28);
      sel.appendChild(opt);
      sel.value = opt.value;
      if (wrap) wrap.classList.add('hidden');
    } else {
      alert('Could not import that file.');
    }
  };
  reader.readAsDataURL(file);
}

// ===========================================================================
// Add / edit
// ===========================================================================
function syncKindFields() {
  const trading = kindInput.value === 'trading';
  $('tradingFields').classList.toggle('hidden', !trading);
  $('dateFields').classList.toggle('hidden', trading);
  $('tmdbBox').classList.toggle('hidden', trading);
}

let lastSuggestedTitle = '';
// Auto-fill a sensible title for trading countdowns without clobbering a custom one.
function suggestTradingTitle(force) {
  if (kindInput.value !== 'trading') return;
  const ex = exchangeById(exchangeInput.value) || EXCHANGES[0];
  const suggestion = `${ex.name.replace(/\s*\(.*\)$/, '')} · ${SESSION_LABEL[sessionInput.value] || ''}`.trim();
  if (force || !titleInput.value.trim() || titleInput.value === lastSuggestedTitle) {
    titleInput.value = suggestion;
    lastSuggestedTitle = suggestion;
  }
}

function openModal(editId = null) {
  editingId = editId;
  $('tmdbResults').innerHTML = '';
  $('tmdbQuery').value = '';
  buildBgSelect(bgInput, { includeAuto: true });
  buildFontSelect(fontInput, true);
  buildSoundSelect(alertSoundInput);
  buildExchangeSelect();
  $('bgUploadWrap').classList.add('hidden');
  $('alertUploadWrap').classList.add('hidden');

  if (editId) {
    const c = countdowns.find((x) => x.id === editId);
    modalTitle.textContent = 'Edit countdown';
    kindInput.value = c.kind;
    titleInput.value = c.title;
    dateInput.value = c.target ? toLocalInputValue(c.target) : '';
    modeInput.value = c.mode;
    recurrenceInput.value = c.recurrence;
    categoryInput.value = c.category;
    colorInput.value = c.color;
    buildSessionSelect(c.exchange || EXCHANGES[0].id);
    if (c.exchange) exchangeInput.value = c.exchange;
    sessionInput.value = c.session;
    // appearance (add a concrete option if it's an uploaded media spec)
    if (c.bg && c.bg.startsWith('media:')) {
      const opt = document.createElement('option');
      opt.value = c.bg; opt.textContent = 'Current uploaded media';
      bgInput.appendChild(opt);
    }
    bgInput.value = c.bg || 'auto';
    fontInput.value = c.fontFamily || '';
    fontScaleInput.value = String(c.fontScale || 1);
    bgDimInput.value = c.bgDim == null ? 60 : c.bgDim;
    bgBlurInput.value = c.bgBlur || 0;
    if (c.alertSound && c.alertSound.startsWith('media:')) {
      const o = document.createElement('option');
      o.value = c.alertSound; o.textContent = 'Current uploaded sound';
      alertSoundInput.appendChild(o);
    }
    alertSoundInput.value = c.alertSound || 'none';
    alertBannerInput.checked = c.alertBanner !== false;
    alertFlashInput.checked = !!c.alertFlash;
    for (const m of [1440, 60, 10]) msInputs[m].checked = (c.milestones || []).includes(m);
  } else {
    modalTitle.textContent = 'Add countdown';
    form.reset();
    kindInput.value = 'date';
    colorInput.value = '#5b8cff';
    modeInput.value = 'down';
    recurrenceInput.value = 'none';
    dateInput.value = toLocalInputValue(new Date(Date.now() + 7 * 86400000).toISOString());
    buildSessionSelect(EXCHANGES[0].id);
    bgInput.value = 'auto';
    fontInput.value = '';
    fontScaleInput.value = '1';
    bgDimInput.value = 60;
    bgBlurInput.value = 0;
    alertSoundInput.value = 'none';
    alertBannerInput.checked = true;
    alertFlashInput.checked = false;
    for (const m of [1440, 60, 10]) msInputs[m].checked = false;
  }
  syncKindFields();
  modal.classList.remove('hidden');
  titleInput.focus();
}

function closeModal() { modal.classList.add('hidden'); editingId = null; stopSound(); }

function bgValueOrDefault(v) { return v === 'upload' ? 'auto' : v; }

function saveFromForm(evt) {
  evt.preventDefault();
  const trading = kindInput.value === 'trading';
  if (!titleInput.value.trim()) return;
  if (!trading && !dateInput.value) return;

  const appearance = {
    bg: bgValueOrDefault(bgInput.value),
    fontFamily: fontInput.value,
    fontScale: Number(fontScaleInput.value) || 1,
    bgDim: Number(bgDimInput.value),
    bgBlur: Number(bgBlurInput.value),
    alertSound: soundValueOrNone(alertSoundInput.value),
    alertBanner: alertBannerInput.checked,
    alertFlash: alertFlashInput.checked,
    milestones: [1440, 60, 10].filter((m) => msInputs[m].checked)
  };

  let data;
  if (trading) {
    data = Object.assign({
      kind: 'trading',
      exchange: exchangeInput.value,
      session: sessionInput.value,
      title: titleInput.value.trim(),
      target: '',
      mode: 'down',
      recurrence: 'none',
      category: categoryInput.value.trim() || 'Markets',
      color: colorInput.value
    }, appearance);
  } else {
    data = Object.assign({
      kind: 'date',
      title: titleInput.value.trim(),
      target: new Date(dateInput.value).toISOString(),
      mode: modeInput.value,
      recurrence: recurrenceInput.value,
      category: categoryInput.value.trim(),
      color: colorInput.value
    }, appearance);
  }

  if (editingId) {
    const c = countdowns.find((x) => x.id === editingId);
    Object.assign(c, data, { notified: false, lastOcc: null, _msOcc: null, _msFired: {} });
  } else {
    countdowns.push(normalize(data));
  }
  persist(); closeModal(); render();
}

function removeCountdown(id) {
  countdowns = countdowns.filter((c) => c.id !== id);
  persist(); render();
}

function togglePin(id) {
  const c = countdowns.find((x) => x.id === id);
  if (c) { c.pinned = !c.pinned; persist(); render(); }
}

function addPreset(p) {
  countdowns.push(normalize({ ...p, target: new Date(p.target).toISOString() }));
  persist(); render();
}

const TRADING_PRESETS = [
  { exchange: 'nyse', session: 'open', color: '#46d39a' },
  { exchange: 'nyse', session: 'close', color: '#ff8c5b' },
  { exchange: 'lse', session: 'open', color: '#5b8cff' },
  { exchange: 'tse', session: 'open', color: '#ff5b7a' }
];
function tradingPresetLabel(p) {
  const ex = exchangeById(p.exchange);
  return `${ex.name.replace(/\s*\(.*\)$/, '')} ${p.session === 'open' ? 'open' : p.session === 'close' ? 'close' : p.session}`;
}
function addTradingPreset(p) {
  const ex = exchangeById(p.exchange);
  countdowns.push(normalize({
    kind: 'trading', exchange: p.exchange, session: p.session, mode: 'down',
    title: `${ex.name.replace(/\s*\(.*\)$/, '')} · ${SESSION_LABEL[p.session]}`,
    category: 'Markets', color: p.color || '#46d39a'
  }));
  persist(); render();
}

// ===========================================================================
// Drag to reorder
// ===========================================================================
function wireDrag() {
  grid.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    dragId = card.dataset.id;
    card.classList.add('dragging');
  });
  grid.addEventListener('dragend', (e) => {
    const card = e.target.closest('.card');
    if (card) card.classList.remove('dragging');
    grid.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
  });
  grid.addEventListener('dragover', (e) => {
    e.preventDefault();
    const card = e.target.closest('.card');
    grid.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    if (card && card.dataset.id !== dragId) card.classList.add('drag-over');
  });
  grid.addEventListener('drop', (e) => {
    e.preventDefault();
    const card = e.target.closest('.card');
    if (!card || !dragId || card.dataset.id === dragId) return;
    const from = countdowns.findIndex((c) => c.id === dragId);
    const to = countdowns.findIndex((c) => c.id === card.dataset.id);
    if (from < 0 || to < 0) return;
    const [moved] = countdowns.splice(from, 1);
    countdowns.splice(to, 0, moved);
    settings.sort = 'manual'; sortSelect.value = 'manual'; persistSettings();
    dragId = null; persist(); render();
  });
}

// ===========================================================================
// Settings + import/export
// ===========================================================================
const LIGHT_PALETTES = ['light', 'rose'];
function currentAccentHex() {
  const v = getComputedStyle(document.body).getPropertyValue('--accent').trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : '#5b8cff';
}
function applyTheme() {
  document.body.dataset.theme = settings.theme;
  // accent override (empty = palette default)
  if (settings.accent) document.body.style.setProperty('--accent', settings.accent);
  else document.body.style.removeProperty('--accent');
  // toggle button shows what it'll switch to; reflects current light/dark base
  const isLight = LIGHT_PALETTES.includes(settings.theme);
  $('themeBtn').innerHTML = isLight ? '&#9790;' : '&#9788;'; // moon when light, sun when dark
}

function applyDnd() {
  const btn = $('dndBtn');
  btn.innerHTML = settings.dnd ? '&#128277;' : '&#128276;'; // 🔕 muted / 🔔 active
  btn.classList.toggle('active', settings.dnd);
  btn.title = settings.dnd ? 'Alerts muted (Do Not Disturb) — click to unmute' : 'Mute all alerts (Do Not Disturb)';
}

function syncTrayWraps() {
  $('trayPickWrap').classList.toggle('hidden', trayModeInput.value !== 'specific');
  $('trayCycleWrap').classList.toggle('hidden', trayModeInput.value !== 'cycle');
}

function syncDashUploadWrap() {
  $('dashUploadWrap').classList.toggle('hidden', dashboardBgInput.value !== 'upload');
}

function openSettings() {
  alwaysOnTopInput.checked = !!settings.alwaysOnTop;
  tmdbKeyInput.value = settings.tmdbApiKey || '';

  // Appearance
  paletteInput.value = settings.theme || 'dark';
  accentInput.value = settings.accent || currentAccentHex();
  buildFontSelect(uiFontInput, false);
  uiFontInput.value = settings.uiFont || 'system';
  uiScaleInput.value = String(settings.uiScale || 1);
  buildBgSelect(dashboardBgInput, { includeAuto: false });
  if (settings.dashboardBg && settings.dashboardBg.startsWith('media:')) {
    const opt = document.createElement('option');
    opt.value = settings.dashboardBg; opt.textContent = 'Current uploaded media';
    dashboardBgInput.appendChild(opt);
  }
  dashboardBgInput.value = settings.dashboardBg || 'preset:nebula';
  $('dashUploadWrap').classList.add('hidden');

  // Date & time
  buildTimeZoneSelect(timeZoneInput);
  dateFormatInput.value = settings.dateFormat || 'system';
  clockInput.value = settings.clock || 'auto';
  timeZoneInput.value = settings.timeZone || '';

  // Alerts (quiet hours + snooze)
  quietEnabledInput.checked = !!settings.quietHoursEnabled;
  quietStartInput.value = settings.quietStart || '22:00';
  quietEndInput.value = settings.quietEnd || '07:00';
  snoozeMinutesInput.value = settings.snoozeMinutes || 5;

  // Tray picker
  const opts = countdowns.filter((c) => c.mode === 'down');
  trayIdInput.innerHTML = opts.length
    ? opts.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('')
    : '<option value="">(no countdowns yet)</option>';
  trayModeInput.value = settings.trayMode || 'soonest';
  if (settings.trayId) trayIdInput.value = settings.trayId;
  trayCycleInput.value = settings.trayCycleSecs || 6;
  syncTrayWraps();

  settingsModal.classList.remove('hidden');
}
function closeSettings() { settingsModal.classList.add('hidden'); }

function saveSettings() {
  settings.alwaysOnTop = alwaysOnTopInput.checked;
  settings.tmdbApiKey = tmdbKeyInput.value.trim();
  settings.trayMode = trayModeInput.value;
  settings.trayId = trayIdInput.value || '';
  settings.trayCycleSecs = Math.min(120, Math.max(2, Number(trayCycleInput.value) || 6));
  settings.uiFont = uiFontInput.value || 'system';
  settings.uiScale = Number(uiScaleInput.value) || 1;
  settings.dashboardBg = bgValueOrDefault(dashboardBgInput.value);
  settings.dateFormat = dateFormatInput.value;
  settings.clock = clockInput.value;
  settings.timeZone = timeZoneInput.value || '';
  settings.quietHoursEnabled = quietEnabledInput.checked;
  settings.quietStart = quietStartInput.value || '22:00';
  settings.quietEnd = quietEndInput.value || '07:00';
  settings.snoozeMinutes = Math.min(120, Math.max(1, Number(snoozeMinutesInput.value) || 5));
  persistSettings();

  window.api.setAlwaysOnTop(settings.alwaysOnTop);
  applyUiFont();
  applyUiScale();
  applyDashboardBg();
  lastTraySig = '';
  render();                    // re-render so format/timezone changes show everywhere
  updateTray(Date.now());
  closeSettings();
}

function exportCountdowns() {
  const blob = new Blob([JSON.stringify(countdowns, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'countdown-deck-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importCountdowns(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      const added = parsed
        .filter((c) => c && c.title && (c.kind === 'trading' || (c.target && !isNaN(new Date(c.target).getTime()))))
        .map((c) => normalize({ ...c, id: uid() }));
      countdowns = countdowns.concat(added);
      persist(); render();
      alert(`Imported ${added.length} countdown(s).`);
    } catch (_) {
      alert('Could not import: the file is not a valid Countdown Deck export.');
    }
  };
  reader.readAsText(file);
}

// ===========================================================================
// Auto-find lookup: TVmaze for TV (exact air times), TMDB for movies
// ===========================================================================
async function runLookup() {
  const q = $('tmdbQuery').value.trim();
  const box = $('tmdbResults');
  if (!q) return;
  box.innerHTML = '<div class="tmdb-empty">Searching…</div>';

  const [tv, movies] = await Promise.all([
    window.api.tvmazeSearch(q),
    settings.tmdbApiKey ? window.api.tmdbSearch(q) : Promise.resolve({ results: [] })
  ]);

  const items = [];
  if (tv && tv.results) {
    for (const s of tv.results.slice(0, 10)) {
      const since = s.premiered ? ' · since ' + s.premiered.slice(0, 4) : '';
      items.push({ source: 'tvmaze', id: s.id, title: s.name, sub: `TV · ${s.network || s.status || 'show'}${since}` });
    }
  }
  if (movies && movies.results) {
    for (const m of movies.results.filter((r) => r.type === 'movie').slice(0, 8)) {
      items.push({ source: 'tmdb', id: m.id, title: m.title, date: m.date, sub: `Movie${m.date ? ' · ' + m.date : ''}` });
    }
  }

  if (!items.length) {
    box.innerHTML = (tv && tv.error)
      ? `<div class="tmdb-empty">Lookup failed (${tv.error}).</div>`
      : '<div class="tmdb-empty">No matches found.</div>';
    return;
  }

  box.innerHTML = '';
  for (const it of items) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tmdb-item';
    el.innerHTML = `<div>${escapeHtml(it.title)} <span class="t-date">(${escapeHtml(it.sub)})</span></div>`;
    el.addEventListener('click', () => selectResult(it, box));
    box.appendChild(el);
  }
}

// On selection, fetch the precise date: TVmaze next-episode airstamp (exact
// time + timezone) for TV, or TMDB release date for movies.
async function selectResult(it, box) {
  box.innerHTML = '<div class="tmdb-empty">Finding the exact date…</div>';
  let title = it.title;
  let localValue = '';
  let note = '';

  if (it.source === 'tvmaze') {
    const r = await window.api.tvmazeNext(it.id);
    if (r && r.error) {
      note = `Lookup failed (${r.error}).`;
    } else if (r && r.airstamp) {
      title = `${it.title} — S${r.season}E${r.episode}`;
      localValue = toLocalInputValue(r.airstamp);   // airstamp carries the timezone
      note = `Exact air time set from TVmaze${r.epName ? ` · “${r.epName}”` : ''}, shown in your local time.`;
    } else {
      note = 'No upcoming episode is scheduled on TVmaze yet — set the date manually.';
    }
  } else {
    const det = await window.api.tmdbDetail('movie', it.id);
    const dateStr = (det && !det.error && det.date) ? det.date : it.date;
    title = (det && det.name) ? det.name : it.title;
    if (dateStr) {
      localValue = `${dateStr}T20:00`;   // movies have no set time; sensible default
      note = 'Release date from TMDB — movies have no set time, so adjust if needed.';
    } else {
      note = 'No release date found for this movie.';
    }
  }

  titleInput.value = title;
  modeInput.value = 'down';
  if (localValue) dateInput.value = localValue;
  box.innerHTML = `<div class="tmdb-empty">Filled in “${escapeHtml(title)}”. ${escapeHtml(note)}</div>`;
}

// ===========================================================================
// Init
// ===========================================================================
async function init() {
  const [storedC, storedS, version] = await Promise.all([
    window.api.loadCountdowns(), window.api.loadSettings(), window.api.getVersion()
  ]);

  countdowns = Array.isArray(storedC)
    ? storedC.map(normalize)
    : [normalize({ title: 'New Year 2027', target: new Date('2027-01-01T00:00').toISOString(), color: '#ffd166', category: 'Holidays' })];
  settings = Object.assign(settings, storedS || {});

  $('versionTag').textContent = 'v' + version;
  applyTheme();
  applyDnd();
  applyUiFont();
  applyUiScale();
  applyDashboardBg();
  sortSelect.value = settings.sort;
  viewSelect.value = settings.viewMode || 'cards';
  $('groupBtn').classList.toggle('active', settings.groupByCategory);

  // preset chips (date presets + trading-session presets)
  for (const container of [$('presetRow'), $('modalPresetRow')]) {
    for (const p of PRESETS) {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'preset-chip'; chip.textContent = p.title;
      chip.addEventListener('click', () => addPreset(p));
      container.appendChild(chip);
    }
    for (const p of TRADING_PRESETS) {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'preset-chip'; chip.textContent = '📈 ' + tradingPresetLabel(p);
      chip.addEventListener('click', () => addTradingPreset(p));
      container.appendChild(chip);
    }
  }

  // toolbar
  $('addBtn').addEventListener('click', () => openModal());
  $('emptyAddBtn').addEventListener('click', () => openModal());
  searchInput.addEventListener('input', render);
  categoryFilter.addEventListener('change', render);
  sortSelect.addEventListener('change', () => { settings.sort = sortSelect.value; persistSettings(); render(); });
  $('themeBtn').addEventListener('click', () => {
    settings.theme = LIGHT_PALETTES.includes(settings.theme) ? 'dark' : 'light';
    persistSettings(); applyTheme();
  });
  viewSelect.addEventListener('change', () => { settings.viewMode = viewSelect.value; persistSettings(); render(); });
  $('groupBtn').addEventListener('click', () => {
    settings.groupByCategory = !settings.groupByCategory;
    $('groupBtn').classList.toggle('active', settings.groupByCategory);
    persistSettings(); render();
  });
  paletteInput.addEventListener('change', () => { settings.theme = paletteInput.value; persistSettings(); applyTheme(); });
  accentInput.addEventListener('input', () => { settings.accent = accentInput.value; persistSettings(); applyTheme(); });
  $('accentReset').addEventListener('click', () => {
    settings.accent = ''; persistSettings(); applyTheme();
    accentInput.value = currentAccentHex();
  });
  $('welcomeClose').addEventListener('click', () => { $('welcomeOverlay').classList.add('hidden'); settings.onboarded = true; persistSettings(); });
  $('dndBtn').addEventListener('click', () => {
    settings.dnd = !settings.dnd;
    persistSettings(); applyDnd();
  });
  $('flashSnooze').addEventListener('click', snoozeFlash);
  $('focusClose').addEventListener('click', closeFocus);
  $('focusOverlay').addEventListener('click', (e) => { if (e.target.id === 'focusOverlay') closeFocus(); });

  // add/edit modal
  $('cancelBtn').addEventListener('click', closeModal);
  form.addEventListener('submit', saveFromForm);
  $('tmdbSearchBtn').addEventListener('click', runLookup);
  $('tmdbQuery').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runLookup(); } });
  kindInput.addEventListener('change', () => { syncKindFields(); suggestTradingTitle(); });
  exchangeInput.addEventListener('change', () => { buildSessionSelect(exchangeInput.value); suggestTradingTitle(true); });
  sessionInput.addEventListener('change', () => suggestTradingTitle(true));
  bgInput.addEventListener('change', () => {
    $('bgUploadWrap').classList.toggle('hidden', bgInput.value !== 'upload');
    if (bgInput.value === 'upload') bgFile.click();
  });
  bgFile.addEventListener('change', () => handleMediaPick(bgFile, bgInput, $('bgUploadWrap')));
  alertSoundInput.addEventListener('change', () => {
    $('alertUploadWrap').classList.toggle('hidden', alertSoundInput.value !== 'upload');
    if (alertSoundInput.value === 'upload') alertSoundFile.click();
    else playSound(soundValueOrNone(alertSoundInput.value));   // audition on pick
  });
  alertSoundFile.addEventListener('change', () => handleMediaPick(alertSoundFile, alertSoundInput, $('alertUploadWrap')));
  $('alertPreviewBtn').addEventListener('click', () => playSound(soundValueOrNone(alertSoundInput.value)));
  $('flashDismiss').addEventListener('click', dismissFlash);

  // settings modal
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsCloseBtn').addEventListener('click', closeSettings);
  $('settingsSaveBtn').addEventListener('click', saveSettings);
  trayModeInput.addEventListener('change', syncTrayWraps);
  dashboardBgInput.addEventListener('change', () => {
    syncDashUploadWrap();
    if (dashboardBgInput.value === 'upload') dashboardBgFile.click();
  });
  dashboardBgFile.addEventListener('change', () => handleMediaPick(dashboardBgFile, dashboardBgInput, $('dashUploadWrap')));
  $('exportBtn').addEventListener('click', exportCountdowns);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => { if (e.target.files[0]) importCountdowns(e.target.files[0]); e.target.value = ''; });

  // card actions
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) {
      const card = e.target.closest('.card');
      if (card) openFocus(card.dataset.id);   // click card body → focus mode
      return;
    }
    const id = btn.closest('.card').dataset.id;
    if (btn.dataset.action === 'edit') openModal(id);
    else if (btn.dataset.action === 'remove') removeCountdown(id);
    else if (btn.dataset.action === 'pin') togglePin(id);
    else if (btn.dataset.action === 'test') { const c = countdowns.find((x) => x.id === id); if (c) fireAlerts(c, { test: true }); }
  });
  wireDrag();

  // overlays
  for (const m of [modal, settingsModal]) m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSettings(); dismissFlash(); closeFocus(); } });
  // Global shortcuts: N = new, / = search (ignored while typing or in a modal)
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!modal.classList.contains('hidden') || !settingsModal.classList.contains('hidden')) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openModal(); }
    else if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
  });

  // updates
  window.api.onUpdateStatus(handleUpdateStatus);
  $('checkUpdatesBtn').addEventListener('click', async () => {
    showUpdate('Checking for updates…');
    const res = await window.api.checkForUpdates();
    if (res.status === 'dev') showUpdate('Updates only run in the installed app');
    if (res.status === 'error') showUpdate('Update check failed', { warn: true });
  });

  window.api.setAlwaysOnTop(settings.alwaysOnTop);
  render();
  if (!settings.onboarded) $('welcomeOverlay').classList.remove('hidden');
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(tick, 1000);
}

// ---- update badge ----------------------------------------------------------
function showUpdate(text, { actionable = false, warn = false } = {}) {
  const b = $('updateBadge');
  b.textContent = text;
  b.classList.remove('hidden');
  b.classList.toggle('actionable', actionable);
  b.classList.toggle('warn', warn);
}
function handleUpdateStatus(p) {
  switch (p.state) {
    case 'checking': showUpdate('Checking for updates…'); break;
    case 'available': showUpdate(`Update ${p.version} found — downloading…`); break;
    case 'downloading': showUpdate(`Downloading update… ${p.percent}%`); break;
    case 'none': showUpdate('Up to date'); setTimeout(() => $('updateBadge').classList.add('hidden'), 3000); break;
    case 'ready':
      showUpdate(`Update ${p.version} ready — click to restart`, { actionable: true });
      $('updateBadge').onclick = () => window.api.installUpdate();
      break;
    case 'error': showUpdate('Update check failed', { warn: true }); break;
  }
}

window.addEventListener('DOMContentLoaded', init);
