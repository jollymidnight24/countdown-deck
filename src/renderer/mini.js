'use strict';
const pad = (n) => String(n).padStart(2, '0');
const $ = (id) => document.getElementById(id);

let items = [];
let currentId = null;
let manualIndex = null;   // null = follow the app's selection; set by scrolling

$('close').addEventListener('click', () => window.aux.closeMini());

// Scroll wheel / trackpad cycles through the countdowns (throttled so a
// trackpad's many small deltas advance one at a time).
let wheelAccum = 0;
let lastWheel = 0;
window.addEventListener('wheel', (e) => {
  if (!items.length) return;
  e.preventDefault();
  const now = Date.now();
  if (now - lastWheel > 250) wheelAccum = 0;
  lastWheel = now;
  wheelAccum += e.deltaY;
  if (Math.abs(wheelAccum) < 18) return;
  const dir = wheelAccum > 0 ? 1 : -1;
  wheelAccum = 0;
  const base = displayIndex();
  manualIndex = (base + dir + items.length) % items.length;
  render();
}, { passive: false });

function applyProg(prog) {
  prog = prog || {};
  document.body.dataset.progress = prog.style || 'rounded';
  document.body.style.setProperty('--progress-h', (Number(prog.height) || 8) + 'px');
  if (prog.color) document.body.style.setProperty('--progress-color', prog.color);
  else document.body.style.removeProperty('--progress-color');
}

function displayIndex() {
  if (!items.length) return 0;
  if (manualIndex != null) return Math.min(manualIndex, items.length - 1);
  const i = items.findIndex((x) => x.id === currentId);
  return i >= 0 ? i : 0;
}

window.aux.onMini((payload) => {
  payload = payload || {};
  items = Array.isArray(payload.items) ? payload.items : [];
  currentId = payload.currentId;
  applyProg(payload.prog);
  // If a manually-selected item disappears, fall back to following the app.
  if (manualIndex != null && manualIndex >= items.length) manualIndex = null;
  render();
});

function unit(n, l) { return `<div class="u"><div class="n">${n}</div><div class="l">${l}</div></div>`; }

function render() {
  if (!items.length) {
    $('icon').textContent = '';
    $('title').textContent = 'No countdowns';
    $('timer').innerHTML = '<div class="empty">Nothing counting down</div>';
    $('pfill').style.width = '0%';
    $('dots').innerHTML = '';
    document.body.style.setProperty('--accent', '#3a4256');
    return;
  }
  const idx = displayIndex();
  const d = items[idx];
  document.body.style.setProperty('--accent', d.color || '#5b8cff');
  $('icon').innerHTML = d.iconUrl ? `<img src="${d.iconUrl}" alt="">` : (d.icon || '');
  $('title').textContent = d.title;
  $('timer').innerHTML = unit(d.d, 'Days') + unit(pad(d.h), 'Hrs') + unit(pad(d.m), 'Min') + unit(pad(d.s), 'Sec');
  $('pfill').style.width = (d.progress == null ? 0 : Math.round(d.progress * 100)) + '%';
  $('dots').innerHTML = items.slice(0, 8).map((_, i) => `<span class="dot${i === idx ? ' on' : ''}"></span>`).join('');
}
