'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let countdowns = [];          // [{ id, title, target (ISO string), color }]
let editingId = null;         // id currently being edited, or null when adding
let tickHandle = null;

const PRESETS = [
  { title: 'New Year 2027', target: '2027-01-01T00:00:00', color: '#ffd166' },
  { title: 'Summer Solstice 2026', target: '2026-06-21T00:00:00', color: '#ffb05b' },
  { title: 'Black Friday 2026', target: '2026-11-27T00:00:00', color: '#5b8cff' },
  { title: 'My next birthday', target: '2027-01-01T00:00:00', color: '#c45bff' }
];

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const grid = document.getElementById('grid');
const emptyState = document.getElementById('emptyState');
const presetRow = document.getElementById('presetRow');
const modalPresetRow = document.getElementById('modalPresetRow');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const form = document.getElementById('countdownForm');
const titleInput = document.getElementById('titleInput');
const dateInput = document.getElementById('dateInput');
const colorInput = document.getElementById('colorInput');
const versionTag = document.getElementById('versionTag');
const updateBadge = document.getElementById('updateBadge');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatTarget(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function breakdown(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { done: true, d: 0, h: 0, m: 0, s: 0 };
  const s = Math.floor(diff / 1000);
  return {
    done: false,
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
async function persist() {
  await window.api.saveCountdowns(countdowns);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  emptyState.classList.toggle('hidden', countdowns.length !== 0);
  grid.classList.toggle('hidden', countdowns.length === 0);

  grid.innerHTML = '';
  for (const c of countdowns) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.setProperty('--card-accent', c.color || '#5b8cff');
    card.dataset.id = c.id;

    card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title"></div>
          <div class="card-target"></div>
        </div>
        <div class="card-menu">
          <button class="btn ghost tiny" data-action="edit">Edit</button>
          <button class="btn ghost tiny" data-action="remove">Remove</button>
        </div>
      </div>
      <div class="timer">
        <div class="unit"><div class="num" data-u="d">--</div><div class="lbl">Days</div></div>
        <div class="unit"><div class="num" data-u="h">--</div><div class="lbl">Hours</div></div>
        <div class="unit"><div class="num" data-u="m">--</div><div class="lbl">Min</div></div>
        <div class="unit"><div class="num" data-u="s">--</div><div class="lbl">Sec</div></div>
      </div>
      <div class="done-banner hidden">&#127881; It's here!</div>
    `;

    card.querySelector('.card-title').textContent = c.title;
    card.querySelector('.card-target').textContent = formatTarget(c.target);
    grid.appendChild(card);
  }
  tick();
}

function tick() {
  for (const c of countdowns) {
    const card = grid.querySelector(`.card[data-id="${c.id}"]`);
    if (!card) continue;
    const b = breakdown(c.target);
    card.classList.toggle('done', b.done);
    card.querySelector('.done-banner').classList.toggle('hidden', !b.done);
    card.querySelector('[data-u="d"]').textContent = b.done ? '0' : String(b.d);
    card.querySelector('[data-u="h"]').textContent = pad(b.h);
    card.querySelector('[data-u="m"]').textContent = pad(b.m);
    card.querySelector('[data-u="s"]').textContent = pad(b.s);
  }
}

// ---------------------------------------------------------------------------
// Modal handling
// ---------------------------------------------------------------------------
function openModal(editId = null) {
  editingId = editId;
  if (editId) {
    const c = countdowns.find((x) => x.id === editId);
    modalTitle.textContent = 'Edit countdown';
    titleInput.value = c.title;
    dateInput.value = toLocalInputValue(c.target);
    colorInput.value = c.color || '#5b8cff';
  } else {
    modalTitle.textContent = 'Add countdown';
    form.reset();
    colorInput.value = '#5b8cff';
    // Default to one week out for convenience.
    const wk = new Date(Date.now() + 7 * 86400000);
    dateInput.value = toLocalInputValue(wk.toISOString());
  }
  modal.classList.remove('hidden');
  titleInput.focus();
}

function closeModal() {
  modal.classList.add('hidden');
  editingId = null;
}

function toLocalInputValue(iso) {
  // Convert an ISO/date string to the value format datetime-local expects.
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function upsertFromForm(evt) {
  evt.preventDefault();
  const title = titleInput.value.trim();
  const target = new Date(dateInput.value).toISOString();
  const color = colorInput.value;
  if (!title || !dateInput.value) return;

  if (editingId) {
    const c = countdowns.find((x) => x.id === editingId);
    Object.assign(c, { title, target, color });
  } else {
    countdowns.push({ id: uid(), title, target, color });
  }
  await persist();
  closeModal();
  render();
}

async function removeCountdown(id) {
  countdowns = countdowns.filter((c) => c.id !== id);
  await persist();
  render();
}

async function addPreset(preset) {
  countdowns.push({ id: uid(), title: preset.title, target: new Date(preset.target).toISOString(), color: preset.color });
  await persist();
  render();
}

// ---------------------------------------------------------------------------
// Presets UI
// ---------------------------------------------------------------------------
function buildPresetChips(container, withLabel) {
  // Keep any existing label, clear the rest.
  container.querySelectorAll('.preset-chip').forEach((el) => el.remove());
  for (const p of PRESETS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'preset-chip';
    chip.textContent = p.title;
    chip.addEventListener('click', () => addPreset(p));
    container.appendChild(chip);
  }
}

// ---------------------------------------------------------------------------
// Auto-update UI
// ---------------------------------------------------------------------------
function showUpdate(text, { actionable = false, warn = false } = {}) {
  updateBadge.textContent = text;
  updateBadge.classList.remove('hidden');
  updateBadge.classList.toggle('actionable', actionable);
  updateBadge.classList.toggle('warn', warn);
}

function wireUpdates() {
  window.api.onUpdateStatus((p) => {
    switch (p.state) {
      case 'checking': showUpdate('Checking for updates…'); break;
      case 'available': showUpdate(`Update ${p.version} found — downloading…`); break;
      case 'downloading': showUpdate(`Downloading update… ${p.percent}%`); break;
      case 'none': showUpdate('Up to date'); setTimeout(() => updateBadge.classList.add('hidden'), 3000); break;
      case 'ready':
        showUpdate(`Update ${p.version} ready — click to restart`, { actionable: true });
        updateBadge.onclick = () => window.api.installUpdate();
        break;
      case 'error': showUpdate('Update check failed', { warn: true }); break;
    }
  });

  document.getElementById('checkUpdatesBtn').addEventListener('click', async () => {
    showUpdate('Checking for updates…');
    const res = await window.api.checkForUpdates();
    if (res.status === 'dev') showUpdate('Updates only in packaged app', {});
    if (res.status === 'error') showUpdate('Update check failed', { warn: true });
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  const stored = await window.api.loadCountdowns();
  countdowns = Array.isArray(stored) ? stored : [
    { id: uid(), title: 'New Year 2027', target: new Date('2027-01-01T00:00:00').toISOString(), color: '#ffd166' }
  ];

  versionTag.textContent = 'v' + (await window.api.getVersion());

  buildPresetChips(presetRow, false);
  buildPresetChips(modalPresetRow, true);

  document.getElementById('addBtn').addEventListener('click', () => openModal());
  document.getElementById('emptyAddBtn').addEventListener('click', () => openModal());
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  form.addEventListener('submit', upsertFromForm);

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('.card').dataset.id;
    if (btn.dataset.action === 'edit') openModal(id);
    if (btn.dataset.action === 'remove') removeCountdown(id);
  });

  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  wireUpdates();
  render();

  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(tick, 1000);
}

window.addEventListener('DOMContentLoaded', init);
