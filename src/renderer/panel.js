'use strict';
const pad = (n) => String(n).padStart(2, '0');
const list = document.getElementById('list');

document.getElementById('open').addEventListener('click', () => window.aux.openApp());

window.aux.onPanel((items) => {
  if (!items || !items.length) {
    list.innerHTML = '<div class="empty">No active countdowns</div>';
    return;
  }
  list.innerHTML = '';
  for (const c of items) {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML =
      `<span class="dot" style="background:${c.color || '#5b8cff'}"></span>` +
      `<div class="it"><div class="t"></div><div class="r">${c.d}d ${pad(c.h)}h ${pad(c.m)}m ${pad(c.s)}s</div></div>`;
    row.querySelector('.t').textContent = c.title;
    row.addEventListener('click', () => window.aux.focus(c.id));
    list.appendChild(row);
  }
});
