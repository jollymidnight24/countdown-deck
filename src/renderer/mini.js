'use strict';
const pad = (n) => String(n).padStart(2, '0');
const timer = document.getElementById('timer');
const titleEl = document.getElementById('title');

document.getElementById('close').addEventListener('click', () => window.aux.closeMini());

window.aux.onMini((d) => {
  if (!d) {
    titleEl.textContent = 'No countdowns';
    timer.innerHTML = '<div class="empty">Nothing counting down</div>';
    document.body.style.setProperty('--accent', '#3a4256');
    return;
  }
  document.body.style.setProperty('--accent', d.color || '#5b8cff');
  titleEl.textContent = d.title;
  timer.innerHTML =
    unit(d.d, 'Days') + unit(pad(d.h), 'Hrs') + unit(pad(d.m), 'Min') + unit(pad(d.s), 'Sec');
});

function unit(n, l) { return `<div class="u"><div class="n">${n}</div><div class="l">${l}</div></div>`; }
