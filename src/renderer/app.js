'use strict';

// ===========================================================================
// State
// ===========================================================================
let countdowns = [];   // see normalize() for shape
let settings = { theme: 'dark', sort: 'manual', alwaysOnTop: false, tmdbApiKey: '' };
let editingId = null;
let dragId = null;
let tickHandle = null;
let tickCount = 0;

const PRESETS = [
  { title: 'New Year 2027', target: '2027-01-01T00:00', color: '#ffd166', category: 'Holidays' },
  { title: 'Black Friday 2026', target: '2026-11-27T00:00', color: '#5b8cff', category: 'Shopping' },
  { title: 'Summer Solstice 2026', target: '2026-06-21T00:00', color: '#ffb05b', category: 'Seasons' }
];

// ===========================================================================
// DOM refs
// ===========================================================================
const $ = (id) => document.getElementById(id);
const grid = $('grid');
const emptyState = $('emptyState');
const searchInput = $('searchInput');
const sortSelect = $('sortSelect');
const categoryFilter = $('categoryFilter');

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

// settings modal
const settingsModal = $('settingsModal');
const alwaysOnTopInput = $('alwaysOnTopInput');
const tmdbKeyInput = $('tmdbKeyInput');

// ===========================================================================
// Helpers
// ===========================================================================
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');

function normalize(c) {
  return {
    id: c.id || uid(),
    title: String(c.title || 'Untitled'),
    target: c.target,
    color: c.color || '#5b8cff',
    pinned: !!c.pinned,
    category: c.category || '',
    recurrence: ['weekly', 'monthly', 'yearly'].includes(c.recurrence) ? c.recurrence : 'none',
    mode: c.mode === 'up' ? 'up' : 'down',
    notified: !!c.notified,
    lastOcc: c.lastOcc || null
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
  if (diff <= 0) return { done: true, mode: 'down', d: 0, h: 0, m: 0, s: 0 };
  return Object.assign({ done: false, mode: 'down' }, unitsFromMs(diff));
}

function formatTarget(c) {
  const ms = effectiveTargetMs(c, Date.now());
  const d = new Date(ms);
  const base = d.toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const verb = c.mode === 'up' ? 'Since' : 'Target';
  const rep = c.recurrence !== 'none' ? ` · repeats ${c.recurrence}` : '';
  return `${verb}: ${base}${rep}`;
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
function render() {
  refreshCategoryControls();
  const list = visibleCountdowns();
  emptyState.classList.toggle('hidden', countdowns.length !== 0);
  grid.classList.toggle('hidden', countdowns.length === 0);

  grid.innerHTML = '';
  for (const c of list) {
    const card = document.createElement('div');
    card.className = 'card' + (c.pinned ? ' pinned' : '');
    card.style.setProperty('--card-accent', c.color);
    card.dataset.id = c.id;
    card.draggable = true;

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
      <div class="done-banner hidden">🎉 It's here!</div>`;

    card.querySelector('.t-text').textContent = c.title;
    card.querySelector('.t-target').textContent = formatTarget(c);
    grid.appendChild(card);
  }
  tick();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function tick() {
  const now = Date.now();
  let changed = false;

  for (const c of countdowns) {
    const b = breakdown(c, now);

    // Notifications + recurrence roll-over -------------------------------
    if (c.mode === 'down' && c.recurrence === 'none') {
      if (b.done && !c.notified) {
        c.notified = true; changed = true;
        window.api.notify('Countdown reached!', `${c.title} is here.`);
      } else if (!b.done && c.notified) {
        c.notified = false; changed = true; // target moved into the future via edit
      }
    } else if (c.recurrence !== 'none') {
      const occ = effectiveTargetMs(c, now);
      if (c.lastOcc == null) {
        c.lastOcc = occ; changed = true;
      } else if (occ !== c.lastOcc) {
        c.lastOcc = occ; changed = true;
        window.api.notify('Recurring countdown', `${c.title} just occurred. Next one is counting down.`);
      }
    }

    // DOM update ---------------------------------------------------------
    const card = grid.querySelector(`.card[data-id="${c.id}"]`);
    if (!card) continue;
    const done = b.done;
    card.classList.toggle('done', done);
    card.querySelector('.done-banner').classList.toggle('hidden', !done);
    card.querySelector('[data-u="d"]').textContent = String(b.d);
    card.querySelector('[data-u="h"]').textContent = pad(b.h);
    card.querySelector('[data-u="m"]').textContent = pad(b.m);
    card.querySelector('[data-u="s"]').textContent = pad(b.s);
  }

  if (changed) persist();

  // Tray / menu-bar summary (throttled) ---------------------------------
  if (tickCount % 5 === 0) updateTray(now);
  tickCount++;
}

function updateTray(now) {
  const summaries = countdowns
    .filter((c) => c.mode === 'down')
    .map((c) => ({ c, ms: effectiveTargetMs(c, now) - now }))
    .filter((x) => x.ms > 0)
    .sort((a, b) => a.ms - b.ms)
    .slice(0, 6)
    .map(({ c, ms }) => {
      const u = unitsFromMs(ms);
      return `${c.title}: ${u.d}d ${pad(u.h)}h ${pad(u.m)}m`;
    });
  window.api.updateTray(summaries);
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
// Add / edit
// ===========================================================================
function openModal(editId = null) {
  editingId = editId;
  $('tmdbResults').innerHTML = '';
  $('tmdbQuery').value = '';
  if (editId) {
    const c = countdowns.find((x) => x.id === editId);
    modalTitle.textContent = 'Edit countdown';
    titleInput.value = c.title;
    dateInput.value = toLocalInputValue(c.target);
    modeInput.value = c.mode;
    recurrenceInput.value = c.recurrence;
    categoryInput.value = c.category;
    colorInput.value = c.color;
  } else {
    modalTitle.textContent = 'Add countdown';
    form.reset();
    colorInput.value = '#5b8cff';
    modeInput.value = 'down';
    recurrenceInput.value = 'none';
    dateInput.value = toLocalInputValue(new Date(Date.now() + 7 * 86400000).toISOString());
  }
  modal.classList.remove('hidden');
  titleInput.focus();
}

function closeModal() { modal.classList.add('hidden'); editingId = null; }

function saveFromForm(evt) {
  evt.preventDefault();
  if (!titleInput.value.trim() || !dateInput.value) return;
  const data = {
    title: titleInput.value.trim(),
    target: new Date(dateInput.value).toISOString(),
    mode: modeInput.value,
    recurrence: recurrenceInput.value,
    category: categoryInput.value.trim(),
    color: colorInput.value
  };
  if (editingId) {
    const c = countdowns.find((x) => x.id === editingId);
    Object.assign(c, data, { notified: false, lastOcc: null });
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
function applyTheme() {
  document.body.dataset.theme = settings.theme;
  $('themeBtn').innerHTML = settings.theme === 'dark' ? '&#9788;' : '&#9790;'; // sun / moon
}

function openSettings() {
  alwaysOnTopInput.checked = !!settings.alwaysOnTop;
  tmdbKeyInput.value = settings.tmdbApiKey || '';
  settingsModal.classList.remove('hidden');
}
function closeSettings() { settingsModal.classList.add('hidden'); }

function saveSettings() {
  settings.alwaysOnTop = alwaysOnTopInput.checked;
  settings.tmdbApiKey = tmdbKeyInput.value.trim();
  persistSettings();
  window.api.setAlwaysOnTop(settings.alwaysOnTop);
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
        .filter((c) => c && c.title && c.target && !isNaN(new Date(c.target).getTime()))
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
// TMDB lookup
// ===========================================================================
async function runTmdbSearch() {
  const q = $('tmdbQuery').value.trim();
  const box = $('tmdbResults');
  if (!q) return;
  box.innerHTML = '<div class="tmdb-empty">Searching…</div>';
  const res = await window.api.tmdbSearch(q);
  if (res.error === 'no-key') {
    box.innerHTML = '<div class="tmdb-empty">No TMDB API key set. Add one in Settings (⚙) to enable lookups.</div>';
    return;
  }
  if (res.error) { box.innerHTML = `<div class="tmdb-empty">Lookup failed (${res.error}).</div>`; return; }
  const results = (res.results || []).filter((r) => r.date);
  if (!results.length) { box.innerHTML = '<div class="tmdb-empty">No dated results found.</div>'; return; }
  box.innerHTML = '';
  for (const r of results.slice(0, 12)) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tmdb-item';
    item.innerHTML = `<div>${escapeHtml(r.title)} <span class="t-date">(${r.type === 'tv' ? 'TV' : 'Movie'} · ${r.date})</span></div>`;
    item.addEventListener('click', () => {
      titleInput.value = r.title;
      dateInput.value = `${r.date}T00:00`;
      box.innerHTML = '';
    });
    box.appendChild(item);
  }
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
  sortSelect.value = settings.sort;

  // preset chips
  for (const container of [$('presetRow'), $('modalPresetRow')]) {
    for (const p of PRESETS) {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'preset-chip'; chip.textContent = p.title;
      chip.addEventListener('click', () => addPreset(p));
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
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    persistSettings(); applyTheme();
  });

  // add/edit modal
  $('cancelBtn').addEventListener('click', closeModal);
  form.addEventListener('submit', saveFromForm);
  $('tmdbSearchBtn').addEventListener('click', runTmdbSearch);
  $('tmdbQuery').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runTmdbSearch(); } });

  // settings modal
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsCloseBtn').addEventListener('click', closeSettings);
  $('settingsSaveBtn').addEventListener('click', saveSettings);
  $('exportBtn').addEventListener('click', exportCountdowns);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => { if (e.target.files[0]) importCountdowns(e.target.files[0]); e.target.value = ''; });

  // card actions
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('.card').dataset.id;
    if (btn.dataset.action === 'edit') openModal(id);
    else if (btn.dataset.action === 'remove') removeCountdown(id);
    else if (btn.dataset.action === 'pin') togglePin(id);
  });
  wireDrag();

  // overlays
  for (const m of [modal, settingsModal]) m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSettings(); } });

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
