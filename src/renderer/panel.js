'use strict';
const pad = (n) => String(n).padStart(2, '0');
const list = document.getElementById('list');

document.getElementById('open').addEventListener('click', () => window.aux.openApp());

function applyProg(prog) {
  prog = prog || {};
  document.body.style.setProperty('--progress-h', (Number(prog.height) || 6) + 'px');
  if (prog.color) document.body.style.setProperty('--progress-color', prog.color);
  else document.body.style.removeProperty('--progress-color');
}

window.aux.onPanel((payload) => {
  payload = payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  applyProg(payload.prog);
  if (!items.length) {
    list.innerHTML = '<div class="empty">No active countdowns</div>';
    return;
  }
  list.innerHTML = '';
  for (const c of items) {
    const row = document.createElement('div');
    row.className = 'item';
    row.style.setProperty('--dot', c.color || '#5b8cff');
    const iconHtml = c.iconUrl ? `<img src="${c.iconUrl}" alt="">` : (c.icon || `<span class="dot" style="background:${c.color || '#5b8cff'}"></span>`);
    const pct = c.progress == null ? 0 : Math.round(c.progress * 100);
    row.innerHTML =
      `<span class="ic">${iconHtml}</span>` +
      `<div class="it"><div class="t"></div><div class="r">${c.d}d ${pad(c.h)}h ${pad(c.m)}m ${pad(c.s)}s</div>` +
      `<div class="pbar"><div class="pfill" style="width:${pct}%"></div></div></div>`;
    row.querySelector('.t').textContent = c.title;
    row.addEventListener('click', () => window.aux.focus(c.id));
    list.appendChild(row);
  }
});
