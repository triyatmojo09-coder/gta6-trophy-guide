/* Leonida Legend — tracker logic.
   Loads data/trophies.json, renders the checklist, the roadmap and the sources,
   and keeps all progress in localStorage. No network calls beyond the data file. */
'use strict';

const STORAGE_KEY = 'leonida-legend-progress-v1';
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

const GRADE_LABEL = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
const GRADE_TOTAL = { platinum: 1, gold: 2, silver: 6, bronze: 46 };
const KIND_LABEL = { story: 'Story', missable: 'Missable', collectibles: 'Collectibles', activities: 'Activities' };

const state = {
  data: null,
  earned: new Set(),
  counts: new Map(),
  revealed: new Set(),
  shield: true,
  openGuide: null,
  view: 'tracker',
  filters: { query: '', kind: 'all', grade: 'all', status: 'all', sort: 'list' },
};

const $ = (sel) => document.querySelector(sel);

/* ---------- persistence ---------- */

function saveProgress() {
  const payload = {
    earned: [...state.earned],
    counts: Object.fromEntries(state.counts),
    revealed: [...state.revealed],
    shield: state.shield,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    $('#save-note').textContent = 'Progress saved in this browser just now.';
  } catch (err) {
    $('#save-note').textContent = 'This browser refused local storage; progress will not persist.';
  }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    state.earned = new Set(Array.isArray(payload.earned) ? payload.earned : []);
    state.counts = new Map(Object.entries(payload.counts || {}).map(([k, v]) => [Number(k), Number(v) || 0]));
    state.revealed = new Set(Array.isArray(payload.revealed) ? payload.revealed : []);
    if (typeof payload.shield === 'boolean') state.shield = payload.shield;
  } catch (err) {
    /* A corrupt save simply starts fresh. */
  }
}

function exportProgress() {
  const payload = {
    app: 'Leonida Legend',
    version: 1,
    exportedAt: new Date().toISOString(),
    earned: [...state.earned].sort((a, b) => a - b),
    counts: Object.fromEntries(state.counts),
    revealed: [...state.revealed],
    shield: state.shield,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leonida-legend-progress.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    try {
      const payload = JSON.parse(String(reader.result));
      if (!payload || !Array.isArray(payload.earned)) throw new Error('shape');
      state.earned = new Set(payload.earned.map(Number));
      state.counts = new Map(Object.entries(payload.counts || {}).map(([k, v]) => [Number(k), Number(v) || 0]));
      state.revealed = new Set(Array.isArray(payload.revealed) ? payload.revealed.map(Number) : []);
      if (typeof payload.shield === 'boolean') state.shield = payload.shield;
      syncCountDrivenEarned();
      saveProgress();
      renderAll();
      $('#save-note').textContent = 'Progress imported from file.';
    } catch (err) {
      $('#save-note').textContent = 'That file did not look like a Leonida Legend export; nothing was changed.';
    }
  });
  reader.readAsText(file);
}

/* ---------- trophy helpers ---------- */

function trophyById(id) {
  return state.data.trophies.find((t) => t.id === id);
}

function isVeiled(trophy) {
  if (!state.shield) return false;
  if (state.earned.has(trophy.id) || state.revealed.has(trophy.id)) return false;
  return trophy.hidden === true || trophy.kind === 'story';
}

function formatCount(trophy, value) {
  const prefix = trophy.count && trophy.count.prefix ? trophy.count.prefix : '';
  return prefix + value.toLocaleString('en-US');
}

function syncCountDrivenEarned() {
  for (const trophy of state.data.trophies) {
    if (!trophy.count) continue;
    const value = state.counts.get(trophy.id) || 0;
    if (value >= trophy.count.target) state.earned.add(trophy.id);
    else if (value > 0 || state.counts.has(trophy.id)) state.earned.delete(trophy.id);
  }
}

function setCount(trophy, value) {
  const clamped = Math.max(0, Math.min(trophy.count.target, Math.floor(value) || 0));
  state.counts.set(trophy.id, clamped);
  if (clamped >= trophy.count.target) state.earned.add(trophy.id);
  else state.earned.delete(trophy.id);
  saveProgress();
  renderAll();
}

function setEarned(trophy, on) {
  if (on) state.earned.add(trophy.id);
  else state.earned.delete(trophy.id);
  saveProgress();
  renderAll();
}

/* ---------- header / progress ---------- */

function renderProgress() {
  const total = state.data.trophies.length;
  const earned = state.earned.size;
  const pct = total === 0 ? 0 : Math.round((earned / total) * 100);
  $('#ring-pct').textContent = pct + '%';
  $('#ring-count').textContent = earned + ' / ' + total;
  $('#ring-fill').style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - earned / total));
  for (const grade of Object.keys(GRADE_TOTAL)) {
    const got = state.data.trophies.filter((t) => t.grade === grade && state.earned.has(t.id)).length;
    $('#count-' + grade).textContent = got + ' / ' + GRADE_TOTAL[grade];
  }
}

/* ---------- trophy cards ---------- */

function trophyIcon(grade) {
  return '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M14 4h20v6h8v4c0 6.2-4.6 11.4-10.6 12.3A13 13 0 0 1 27 33.9V38h6v6H15v-6h6v-4.1a13 13 0 0 1-4.4-7.6C10.6 25.4 6 20.2 6 14V10h8V4zm-4 10c.2 3.4 2.3 6.3 5.3 7.5A17.4 17.4 0 0 1 14 14h-4zm28 0h-4c-.2 2.6-.7 5.1-1.3 7.5 3-1.2 5.1-4.1 5.3-7.5z"/></svg>';
}

function sourceName(key) {
  const found = state.data.sources.find((s) => s.key === key);
  return found ? found.name : key;
}

function guidePanel(trophy) {
  const parts = [];
  if (trophy.missable) {
    parts.push('<div class="missable-warning"><strong>Missable — read before you play on</strong>' +
      escapeHtml(trophy.missableReason || 'This trophy can be permanently missed in a single playthrough.') + '</div>');
  }
  parts.push('<p>' + escapeHtml(trophy.guide) + '</p>');
  const links = trophy.sources.map((key) => {
    const src = state.data.sources.find((s) => s.key === key);
    return src ? '<a href="' + escapeAttr(src.url) + '" target="_blank" rel="noopener">' + escapeHtml(src.name) + '</a>' : escapeHtml(key);
  });
  parts.push('<p class="guide-sources">Sources: ' + links.join(' · ') + '</p>');
  return '<div class="guide-panel">' + parts.join('') + '</div>';
}

function counterHtml(trophy) {
  const value = state.counts.get(trophy.id) || 0;
  const pct = Math.min(100, Math.round((value / trophy.count.target) * 100));
  return '<div class="counter" data-counter="' + trophy.id + '">' +
    '<button type="button" data-step="-1" aria-label="Decrease count">−</button>' +
    '<output>' + formatCount(trophy, value) + ' / ' + formatCount(trophy, trophy.count.target) + '</output>' +
    '<button type="button" data-step="1" aria-label="Increase count">+</button>' +
    '<span class="unit">' + escapeHtml(trophy.count.unit) + '</span>' +
    '<span class="counter-bar"><i style="width:' + pct + '%"></i></span></div>';
}

function cardHtml(trophy) {
  const earned = state.earned.has(trophy.id);
  const veiled = isVeiled(trophy);
  const open = state.openGuide === trophy.id && !veiled;
  const classes = ['card', 'grade-' + trophy.grade];
  if (earned) classes.push('is-earned');
  if (veiled) classes.push('veiled');
  if (open) classes.push('is-open');

  const badges = [];
  badges.push('<span class="badge badge-grade ' + trophy.grade + '">' + GRADE_LABEL[trophy.grade] + '</span>');
  badges.push('<span class="badge badge-kind">' + KIND_LABEL[trophy.kind] + '</span>');
  if (trophy.hidden) badges.push('<span class="badge badge-hidden">Hidden</span>');
  if (trophy.missable) badges.push('<span class="badge badge-missable">Missable</span>');
  badges.push('<span class="badge badge-rarity">' + trophy.rarity.toFixed(2) + '% · ' + escapeHtml(trophy.rarityBand) + '</span>');

  let body = '';
  if (veiled) {
    body = '<div class="veil-note"><span>The spoiler shield is hiding this trophy\'s name and description until you earn it.</span>' +
      '<button type="button" class="reveal-btn" data-reveal="' + trophy.id + '">Reveal anyway</button></div>';
  } else {
    if (trophy.count) body += counterHtml(trophy);
    body += '<button type="button" class="guide-toggle" data-guide="' + trophy.id + '" aria-expanded="' + open + '">' +
      (open ? 'Hide guide' : 'Read guide') + '</button>';
    if (open) body += guidePanel(trophy);
  }

  return '<article class="' + classes.join(' ') + '" id="trophy-' + trophy.id + '">' +
    '<div class="card-head">' +
      '<span class="trophy-icon grade-' + trophy.grade + '">' + trophyIcon(trophy.grade) + '</span>' +
      '<div class="card-title"><h3>' + escapeHtml(trophy.name) + '</h3>' +
      '<p class="desc">' + escapeHtml(trophy.description) + '</p></div>' +
      '<label class="earn-toggle"><input type="checkbox" data-earn="' + trophy.id + '"' + (earned ? ' checked' : '') + '>Earned</label>' +
    '</div>' +
    '<div class="badges">' + badges.join('') + '</div>' +
    body +
  '</article>';
}

function visibleTrophies() {
  const f = state.filters;
  let list = state.data.trophies.slice();
  if (f.kind !== 'all') list = list.filter((t) => t.kind === f.kind);
  if (f.grade !== 'all') list = list.filter((t) => t.grade === f.grade);
  if (f.status === 'earned') list = list.filter((t) => state.earned.has(t.id));
  if (f.status === 'unearned') list = list.filter((t) => !state.earned.has(t.id));
  if (f.query) {
    const q = f.query.toLowerCase();
    list = list.filter((t) => (t.name + ' ' + t.description + ' ' + t.guide).toLowerCase().includes(q));
  }
  if (f.sort === 'rarity-desc') list.sort((a, b) => b.rarity - a.rarity || a.id - b.id);
  else if (f.sort === 'rarity-asc') list.sort((a, b) => a.rarity - b.rarity || a.id - b.id);
  else if (f.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  else list.sort((a, b) => a.id - b.id);
  return list;
}

function renderGrid() {
  const list = visibleTrophies();
  $('#trophy-grid').innerHTML = list.map(cardHtml).join('');
  $('#empty-state').hidden = list.length > 0;
  $('#result-line').textContent = 'Showing ' + list.length + ' of ' + state.data.trophies.length +
    ' trophies · ' + state.earned.size + ' earned · rarity: ' + state.data.raritySnapshot.label + '.';
}

/* ---------- roadmap ---------- */

function renderRoadmap() {
  $('#roadmap-list').innerHTML = state.data.roadmap.map((phase) => {
    const trophies = phase.trophyIds.map(trophyById).filter(Boolean);
    const done = trophies.filter((t) => state.earned.has(t.id)).length;
    const pct = trophies.length === 0 ? 0 : Math.round((done / trophies.length) * 100);
    const chips = trophies.map((t) => {
      const classes = ['phase-chip'];
      if (state.earned.has(t.id)) classes.push('is-earned');
      return '<button type="button" class="' + classes.join(' ') + '" data-jump="' + t.id + '">' +
        '<span class="mini-dot dot-' + t.grade + '"></span>' + escapeHtml(t.name) +
        (t.missable ? '<span class="flag">MISSABLE</span>' : '') + '</button>';
    }).join('');
    return '<section class="phase">' +
      '<div class="phase-head"><span class="phase-num">Phase ' + phase.phase + '</span>' +
      '<h3>' + escapeHtml(phase.title) + '</h3>' +
      '<span class="phase-progress">' + done + ' / ' + trophies.length + ' earned</span></div>' +
      '<div class="phase-bar"><i style="width:' + pct + '%"></i></div>' +
      '<p>' + escapeHtml(phase.blurb) + '</p>' +
      '<div class="phase-chips">' + chips + '</div></section>';
  }).join('');
}

/* ---------- sources ---------- */

function renderSources() {
  $('#source-list').innerHTML = state.data.sources.map((src) =>
    '<article class="source-card"><h3>' + escapeHtml(src.name) + '</h3>' +
    '<a href="' + escapeAttr(src.url) + '" target="_blank" rel="noopener">' + escapeHtml(src.url) + '</a>' +
    '<p>' + escapeHtml(src.note) + '</p></article>').join('');
  const snap = state.data.raritySnapshot;
  $('#rarity-about').textContent = snap.note + ' Snapshot: ' + snap.label + '.';
  $('#snapshot-note').textContent = 'Rarity: ' + snap.label + ' — a launch snapshot, not a live figure.';
  $('#band-key').innerHTML = state.data.rarityBands.map((band, i) => {
    const next = state.data.rarityBands[i - 1];
    const range = next ? 'from ' + band.min + '% up to ' + next.min + '%' : band.min + '% and above';
    return '<li><strong>' + escapeHtml(band.label) + '</strong> — earned by ' + range + ' of tracked players.</li>';
  }).join('');
}

/* ---------- views, hash, events ---------- */

function showView(view) {
  state.view = view;
  for (const name of ['tracker', 'roadmap', 'sources']) {
    $('#view-' + name).hidden = name !== view;
  }
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === view);
  });
}

function openTrophy(id, scroll) {
  const trophy = trophyById(id);
  if (!trophy) return;
  state.filters = { query: '', kind: 'all', grade: 'all', status: 'all', sort: 'list' };
  $('#search').value = '';
  $('#filter-grade').value = 'all';
  $('#filter-status').value = 'all';
  $('#sort-by').value = 'list';
  document.querySelectorAll('#kind-chips .chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.kind === 'all');
  });
  showView('tracker');
  if (!isVeiled(trophy)) state.openGuide = id;
  renderGrid();
  const el = document.getElementById('trophy-' + id);
  if (el && scroll !== false) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function applyHash() {
  const hash = window.location.hash || '';
  if (hash === '#roadmap') { showView('roadmap'); return; }
  if (hash === '#sources') { showView('sources'); return; }
  const match = /^#trophy-(\d+)$/.exec(hash);
  if (match) openTrophy(Number(match[1]));
}

function renderAll() {
  renderProgress();
  renderGrid();
  renderRoadmap();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function escapeAttr(text) {
  return escapeHtml(text);
}

function bindEvents() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      showView(tab.dataset.view);
      window.location.hash = tab.dataset.view === 'tracker' ? '' : '#' + tab.dataset.view;
    });
  });

  $('#search').addEventListener('input', (ev) => { state.filters.query = ev.target.value.trim(); renderGrid(); });
  $('#filter-grade').addEventListener('change', (ev) => { state.filters.grade = ev.target.value; renderGrid(); });
  $('#filter-status').addEventListener('change', (ev) => { state.filters.status = ev.target.value; renderGrid(); });
  $('#sort-by').addEventListener('change', (ev) => { state.filters.sort = ev.target.value; renderGrid(); });
  $('#kind-chips').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-kind]');
    if (!chip) return;
    state.filters.kind = chip.dataset.kind;
    document.querySelectorAll('#kind-chips .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    renderGrid();
  });
  $('#shield').addEventListener('change', (ev) => {
    state.shield = ev.target.checked;
    saveProgress();
    renderGrid();
  });

  $('#trophy-grid').addEventListener('change', (ev) => {
    const box = ev.target.closest('[data-earn]');
    if (box) setEarned(trophyById(Number(box.dataset.earn)), box.checked);
  });
  $('#trophy-grid').addEventListener('click', (ev) => {
    const stepBtn = ev.target.closest('[data-step]');
    if (stepBtn) {
      const wrap = stepBtn.closest('[data-counter]');
      const trophy = trophyById(Number(wrap.dataset.counter));
      const next = (state.counts.get(trophy.id) || 0) + Number(stepBtn.dataset.step) * trophy.count.step;
      setCount(trophy, next);
      return;
    }
    const revealBtn = ev.target.closest('[data-reveal]');
    if (revealBtn) {
      state.revealed.add(Number(revealBtn.dataset.reveal));
      saveProgress();
      renderGrid();
      return;
    }
    const guideBtn = ev.target.closest('[data-guide]');
    if (guideBtn) {
      const id = Number(guideBtn.dataset.guide);
      state.openGuide = state.openGuide === id ? null : id;
      renderGrid();
      const el = document.getElementById('trophy-' + id);
      if (el) el.scrollIntoView({ block: 'center' });
    }
  });

  $('#roadmap-list').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-jump]');
    if (chip) {
      window.location.hash = '#trophy-' + chip.dataset.jump;
      openTrophy(Number(chip.dataset.jump));
    }
  });

  $('#btn-export').addEventListener('click', exportProgress);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (ev) => {
    if (ev.target.files && ev.target.files[0]) importProgress(ev.target.files[0]);
    ev.target.value = '';
  });
  $('#btn-reset').addEventListener('click', () => {
    if (!window.confirm('Reset all Leonida Legend progress in this browser?')) return;
    state.earned.clear();
    state.counts.clear();
    state.revealed.clear();
    state.openGuide = null;
    saveProgress();
    renderAll();
  });

  window.addEventListener('hashchange', applyHash);
}

/* ---------- boot ---------- */

async function boot() {
  loadProgress();
  $('#shield').checked = state.shield;
  try {
    const res = await fetch('data/trophies.json');
    if (!res.ok) throw new Error('http ' + res.status);
    state.data = await res.json();
  } catch (err) {
    $('#result-line').textContent = 'The trophy data could not be loaded. Serve this folder over HTTP (for example with the kit\'s serve.ts) rather than opening the file directly.';
    return;
  }
  syncCountDrivenEarned();
  bindEvents();
  renderSources();
  renderAll();
  applyHash();
}

document.addEventListener('DOMContentLoaded', boot);
