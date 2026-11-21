// Leonida Legend — tracker, roadmap and guide logic.
// State lives in localStorage; the app loads only its own files and works fully offline.

const STORAGE_KEY = 'leonida-legend-progress-v1';
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

const state = loadState();
let guide = null; // parsed app/data/trophies.json
let selectedId = null;
let revealedSpoilers = new Set();
const filters = { search: '', grade: 'all', status: 'all', kind: 'all', sort: 'official' };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        earned: parsed.earned || {},
        auto: parsed.auto || {},
        counters: parsed.counters || {},
        spoilers: Boolean(parsed.spoilers),
      };
    }
  } catch { /* a corrupt save falls back to a fresh one */ }
  return { earned: {}, auto: {}, counters: {}, spoilers: false };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function esc(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function rarityBand(rarity) {
  if (rarity == null) return '';
  if (rarity < 5) return 'Ultra Rare';
  if (rarity < 10) return 'Very Rare';
  if (rarity < 25) return 'Rare';
  return 'Common';
}

function isEarned(trophy) {
  return Boolean(state.earned[trophy.id]);
}

function isVeiled(trophy) {
  // The spoiler shield hides hidden trophies (the ones PlayStation keeps secret,
  // story trophies among them) until they are earned or explicitly revealed.
  return state.spoilers && trophy.hidden && !isEarned(trophy) && !revealedSpoilers.has(trophy.id);
}

function counterOf(trophy) {
  return Math.min(state.counters[trophy.id] || 0, trophy.count || 0);
}

async function loadGuide() {
  const response = await fetch('data/trophies.json');
  guide = await response.json();
  document.getElementById('spoilerToggle').checked = state.spoilers;
  renderAll();
  const fromHash = /^#trophy-(\d+)$/.exec(location.hash);
  if (fromHash) selectTrophy(Number(fromHash[1]), false);
}

function renderAll() {
  renderProgress();
  renderGrid();
  renderRoadmap();
  renderSources();
}

/* ---------- Progress header ---------- */

function renderProgress() {
  const trophies = guide.trophies;
  const earned = trophies.filter(isEarned);
  const pct = Math.round((earned.length / trophies.length) * 100);
  document.getElementById('earnedCount').textContent = String(earned.length);
  document.getElementById('ringPct').textContent = `${pct}%`;
  document.getElementById('ringFill').style.strokeDasharray = String(RING_CIRCUMFERENCE);
  document.getElementById('ringFill').style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - earned.length / trophies.length));

  const byGrade = {};
  for (const trophy of trophies) {
    byGrade[trophy.grade] = byGrade[trophy.grade] || { done: 0, total: 0 };
    byGrade[trophy.grade].total += 1;
    if (isEarned(trophy)) byGrade[trophy.grade].done += 1;
  }
  const order = ['platinum', 'gold', 'silver', 'bronze'];
  document.getElementById('gradeCounts').textContent = order
    .filter((grade) => byGrade[grade])
    .map((grade) => `${grade}: ${byGrade[grade].done}/${byGrade[grade].total}`)
    .join(' · ');

  const missableLeft = trophies.find((t) => t.missable && !isEarned(t));
  const next = trophies.find((t) => !isEarned(t) && t.grade !== 'platinum');
  const hint = document.getElementById('nextUp');
  if (earned.length === trophies.length) hint.textContent = 'Platinum earned. You are a Leonida Legend.';
  else if (missableLeft) hint.textContent = `Watch out: “${missableLeft.name}” is missable — see its guide before you play on.`;
  else if (next) hint.textContent = `Next up in list order: “${next.name}”.`;
}

/* ---------- Tracker grid ---------- */

function trophyMatches(trophy) {
  if (filters.grade !== 'all' && trophy.grade !== filters.grade) return false;
  if (filters.status === 'earned' && !isEarned(trophy)) return false;
  if (filters.status === 'unearned' && isEarned(trophy)) return false;
  if (filters.kind === 'missable' && !trophy.missable) return false;
  if (filters.kind !== 'all' && filters.kind !== 'missable' && trophy.kind !== filters.kind) return false;
  if (filters.search) {
    const haystack = `${trophy.name} ${trophy.description} ${trophy.group} ${trophy.guide}`.toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  return true;
}

function sortedTrophies(list) {
  const copy = [...list];
  if (filters.sort === 'rarity') copy.sort((a, b) => (a.rarity ?? 101) - (b.rarity ?? 101) || a.id - b.id);
  if (filters.sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
  return copy;
}

function counterStep(trophy) {
  if (trophy.count >= 1000) return 5000;
  if (trophy.count >= 100) return 10;
  if (trophy.count >= 25) return 5;
  return 1;
}

function counterHtml(trophy) {
  if (!trophy.count) return '';
  const value = counterOf(trophy);
  const shown = trophy.count >= 1000 ? value.toLocaleString('en-US') : String(value);
  const target = trophy.count.toLocaleString('en-US');
  const step = counterStep(trophy);
  return `<span class="counter" data-counter-for="${trophy.id}">
    <button type="button" data-count="-1" aria-label="Decrease counter">−</button>
    <span><strong>${shown}</strong> / ${target} ${esc(trophy.countLabel || '')}</span>
    <button type="button" data-count="1" aria-label="Increase counter">+</button>
    ${step > 1 ? `<button type="button" data-count="step" aria-label="Increase counter by ${step}">+${step}</button>` : ''}
  </span>`;
}

function cardHtml(trophy) {
  const veiled = isVeiled(trophy);
  const earned = isEarned(trophy);
  const name = veiled ? 'Hidden trophy' : trophy.name;
  const desc = veiled ? 'Earn it to reveal what PlayStation keeps secret.' : trophy.description;
  const badges = [
    `<span class="badge badge-grade grade-${trophy.grade}">${trophy.grade}</span>`,
    `<span class="badge">${esc(trophy.group)}</span>`,
  ];
  if (trophy.missable) badges.push('<span class="badge badge-missable">Missable</span>');
  if (trophy.hidden && !veiled) badges.push('<span class="badge badge-hidden">Hidden</span>');
  if (!veiled && trophy.rarity != null) {
    badges.push(`<span class="badge badge-rarity">${trophy.rarity}% · ${rarityBand(trophy.rarity)}</span>`);
  }
  return `<div class="trophy-card grade-${trophy.grade} ${earned ? 'is-earned' : ''} ${selectedId === trophy.id ? 'is-selected' : ''}" data-card="${trophy.id}" role="button" tabindex="0" aria-label="${esc(name)}">
    <div class="card-top">
      <span class="trophy-cup" aria-hidden="true">♛</span>
      <div>
        <h3 class="card-name ${veiled ? 'spoiler-veil' : ''}">${esc(name)}</h3>
        <p class="card-desc ${veiled ? 'spoiler-veil' : ''}">${esc(desc)}</p>
      </div>
    </div>
    <div class="card-meta">${badges.join('')}</div>
    ${veiled ? '<p class="spoiler-note">Spoiler shield is on — earn it, or open it and choose “Reveal anyway”.</p>' : ''}
    <div class="card-foot">
      <label class="earn-toggle"><input type="checkbox" data-earn="${trophy.id}" ${earned ? 'checked' : ''}> Earned</label>
      ${counterHtml(trophy)}
    </div>
  </div>`;
}

function renderGrid() {
  const list = sortedTrophies(guide.trophies.filter(trophyMatches));
  document.getElementById('trophyGrid').innerHTML = list.map(cardHtml).join('');
  const earnedShown = list.filter(isEarned).length;
  document.getElementById('resultLine').textContent =
    `Showing ${list.length} of ${guide.trophies.length} trophies · ${earnedShown} earned in this view · progress saves automatically in this browser.`;
}

/* ---------- Detail panel ---------- */

function sourceListHtml(trophy) {
  const items = (trophy.sources || []).map((key) => {
    const label = guide.sources[key] || key;
    const url = /https?:\/\/\S+/.exec(label);
    if (url) {
      const text = label.replace(url[0], '').replace(/:\s*$/, '').trim();
      return `<li>${esc(text)} — <a href="${esc(url[0])}" target="_blank" rel="noreferrer">${esc(url[0])}</a></li>`;
    }
    return `<li>${esc(label)}</li>`;
  });
  return `<ul class="source-list">${items.join('')}</ul>`;
}

function selectTrophy(id, pushHash = true) {
  selectedId = id;
  const trophy = guide.trophies.find((t) => t.id === id);
  if (!trophy) return;
  if (pushHash) history.replaceState(null, '', `#trophy-${id}`);
  renderGridSelection();
  const veiled = isVeiled(trophy);
  const body = document.getElementById('detailBody');
  document.getElementById('detailEmpty').hidden = true;
  body.hidden = false;
  const counterBlock = trophy.count
    ? `<div class="detail-section"><h3>Your count</h3><p>${counterOf(trophy).toLocaleString('en-US')} of ${trophy.count.toLocaleString('en-US')} ${esc(trophy.countLabel || '')}. Reaching the target marks the trophy earned automatically.</p>${counterHtml(trophy)}</div>`
    : '';
  body.innerHTML = `
    <p class="brand-kicker">${esc(trophy.group)} · ${trophy.grade}${trophy.hidden ? ' · hidden on PlayStation' : ''}</p>
    <h2 class="${veiled ? 'spoiler-veil' : ''}">${esc(veiled ? 'Hidden trophy' : trophy.name)}</h2>
    <p class="card-desc ${veiled ? 'spoiler-veil' : ''}">${esc(veiled ? 'Earn it to reveal what PlayStation keeps secret.' : trophy.description)}</p>
    ${veiled ? '<p class="spoiler-note">The spoiler shield is hiding this trophy. Earn it in game, switch the shield off, or reveal it here:</p><div class="detail-actions"><button type="button" id="revealBtn">Reveal anyway</button></div>' : `
    ${trophy.missable ? `<div class="missable-box"><h3>Missable — read before you play on</h3><p>${esc(trophy.missableNote || '')}</p></div>` : ''}
    <div class="detail-section"><h3>The guide</h3><p>${esc(trophy.guide)}</p></div>
    ${trophy.rarity != null ? `<div class="detail-section"><h3>Recorded rarity</h3><p>${trophy.rarity}% of tracked players had earned it in Exophase's launch recording (${rarityBand(trophy.rarity)}). ${esc(guide.rarityNote)}</p></div>` : ''}
    ${counterBlock}
    <div class="detail-section"><h3>Sources</h3>${sourceListHtml(trophy)}</div>
    <div class="detail-actions">
      <button type="button" id="detailEarnBtn">${isEarned(trophy) ? 'Mark as not earned' : 'Mark as earned'}</button>
    </div>`}`;
  const reveal = document.getElementById('revealBtn');
  if (reveal) reveal.addEventListener('click', () => { revealedSpoilers.add(id); selectTrophy(id, false); });
  const earnBtn = document.getElementById('detailEarnBtn');
  if (earnBtn) earnBtn.addEventListener('click', () => { setEarned(trophy, !isEarned(trophy)); selectTrophy(id, false); });
}

function renderGridSelection() {
  document.querySelectorAll('.trophy-card').forEach((card) => {
    card.classList.toggle('is-selected', Number(card.dataset.card) === selectedId);
  });
}

/* ---------- Earning and counters ---------- */

function setEarned(trophy, value, automatic = false) {
  if (value) {
    state.earned[trophy.id] = true;
    if (automatic) state.auto[trophy.id] = true;
    else delete state.auto[trophy.id];
  } else {
    delete state.earned[trophy.id];
    delete state.auto[trophy.id];
  }
  saveState();
  renderProgress();
  renderGrid();
  renderRoadmap();
  if (selectedId === trophy.id) selectTrophy(trophy.id, false);
}

function stepCounter(trophy, delta) {
  const change = delta === 'step' ? counterStep(trophy) : delta;
  const next = Math.max(0, Math.min(trophy.count, counterOf(trophy) + change));
  state.counters[trophy.id] = next;
  if (next >= trophy.count && !isEarned(trophy)) setEarned(trophy, true, true);
  else if (next < trophy.count && state.auto[trophy.id]) setEarned(trophy, false, true);
  else { saveState(); renderGrid(); if (selectedId === trophy.id) selectTrophy(trophy.id, false); }
}

/* ---------- Roadmap ---------- */

function renderRoadmap() {
  const byId = new Map(guide.trophies.map((t) => [t.id, t]));
  document.getElementById('roadmapList').innerHTML = guide.roadmap.map((phase) => {
    const trophies = phase.trophyIds.map((id) => byId.get(id)).filter(Boolean);
    const done = trophies.filter(isEarned).length;
    const chips = trophies.map((t) =>
      `<button type="button" class="phase-trophy ${isEarned(t) ? 'is-earned' : ''} ${t.missable ? 'is-missable' : ''}" data-open="${t.id}">${isEarned(t) ? '✓ ' : ''}${esc(t.name)}${t.missable ? ' ⚠' : ''}</button>`,
    ).join('');
    return `<article class="phase">
      <div class="phase-head">
        <span class="phase-num">${phase.phase}</span>
        <h3>${esc(phase.title)}</h3>
        <span class="phase-hours">${esc(phase.hours)}</span>
        <span class="phase-progress">${done}/${trophies.length} earned</span>
      </div>
      <p>${esc(phase.text)}</p>
      <div class="phase-trophies">${chips}</div>
    </article>`;
  }).join('');
}

/* ---------- Sources view ---------- */

function renderSources() {
  const legend = Object.values(guide.sources).map((label) => {
    const url = /https?:\/\/\S+/.exec(label);
    if (url) {
      const text = label.replace(url[0], '').replace(/:\s*$/, '').trim();
      return `<li>${esc(text)} — <a href="${esc(url[0])}" target="_blank" rel="noreferrer">${esc(url[0])}</a></li>`;
    }
    return `<li>${esc(label)}</li>`;
  }).join('');
  document.getElementById('sourcesBody').innerHTML = `
    <p>Every guide in this app is written for this entry, in its own words. Facts are drawn from the official trophy list itself — the names, descriptions, grades, counts and story structure PlayStation publishes — and each trophy's guide names its sources beside it, as the list below does for the whole app.</p>
    <h3>The sources</h3>
    <ul>${legend}</ul>
    <h3>How the missable flags were decided</h3>
    <p>A trophy is flagged missable only where its own official description shows a one-time window: a departure tied to the story's single VCIA visit (Catch Me If You Can), a scripted partnership moment (Personal Best), a count of choices that cannot be unmade (Actions Speak Louder), and a trophy whose description demands a second attempt (Bad Luck, I Guess). Every other description describes something the open world keeps offering after the credits, so nothing else is flagged — and the roadmap still closes the stranger strands before the endgame as cheap insurance.</p>
    <h3>How the kinds were decided</h3>
    <p>Story: the campaign's chapters and named missions, plus the stranger-strand finales that the campaign unlocks. Collectibles: the sets and sweeps — cards, WAiNK locations, meditation spots, areas and vehicles. Activities: everything else, from the shooting range to the robbery set. The official list contains no online trophies, so there is no online kind to filter by.</p>
    <h3>About the rarity figures</h3>
    <p>${esc(guide.rarityNote)}</p>
    <h3>Offline by design</h3>
    <p>The app is static files and loads nothing over the network; the links above open only if you choose to follow them. Your progress never leaves this browser unless you export it.</p>`;
}

/* ---------- Export / import / reset ---------- */

function exportProgress() {
  const payload = JSON.stringify({ app: 'leonida-legend', version: 1, earned: state.earned, counters: state.counters }, null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  link.download = 'leonida-legend-progress.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function importProgress(file) {
  file.text().then((text) => {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.earned !== 'object' || typeof parsed.counters !== 'object') throw new Error('shape');
      state.earned = parsed.earned || {};
      state.counters = parsed.counters || {};
      state.auto = {};
      saveState();
      renderAll();
      if (selectedId) selectTrophy(selectedId, false);
    } catch {
      document.getElementById('resultLine').textContent = 'That file is not a Leonida Legend progress export — nothing was imported.';
    }
  });
}

/* ---------- Wiring ---------- */

function switchView(name) {
  document.querySelectorAll('#viewTabs .tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === name));
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('is-active', view.id === `view-${name}`));
}

function wireControls() {
  document.querySelectorAll('#viewTabs .tab').forEach((tab) =>
    tab.addEventListener('click', () => switchView(tab.dataset.view)));
  document.getElementById('search').addEventListener('input', (e) => { filters.search = e.target.value; renderGrid(); });
  document.getElementById('gradeFilter').addEventListener('change', (e) => { filters.grade = e.target.value; renderGrid(); });
  document.getElementById('statusFilter').addEventListener('change', (e) => { filters.status = e.target.value; renderGrid(); });
  document.getElementById('sortOrder').addEventListener('change', (e) => { filters.sort = e.target.value; renderGrid(); });
  document.querySelectorAll('#kindFilters .chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      document.querySelectorAll('#kindFilters .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
      filters.kind = chip.dataset.kind;
      renderGrid();
    }));
  document.getElementById('spoilerToggle').addEventListener('change', (e) => {
    state.spoilers = e.target.checked;
    saveState();
    renderGrid();
    if (selectedId) selectTrophy(selectedId, false);
  });
  document.getElementById('exportBtn').addEventListener('click', exportProgress);
  document.getElementById('importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importProgress(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    state.earned = {}; state.auto = {}; state.counters = {};
    saveState();
    renderAll();
    if (selectedId) selectTrophy(selectedId, false);
  });

  document.getElementById('trophyGrid').addEventListener('click', (e) => {
    const counterBtn = e.target.closest('[data-count]');
    if (counterBtn) {
      const holder = counterBtn.closest('[data-counter-for]');
      const trophy = guide.trophies.find((t) => t.id === Number(holder.dataset.counterFor));
      stepCounter(trophy, counterBtn.dataset.count === 'step' ? 'step' : Number(counterBtn.dataset.count));
      return;
    }
    if (e.target.closest('[data-earn]')) return; // the checkbox handles itself via change
    const card = e.target.closest('[data-card]');
    if (card) selectTrophy(Number(card.dataset.card));
  });
  document.getElementById('trophyGrid').addEventListener('change', (e) => {
    const box = e.target.closest('[data-earn]');
    if (box) {
      const trophy = guide.trophies.find((t) => t.id === Number(box.dataset.earn));
      setEarned(trophy, box.checked);
    }
  });
  document.getElementById('trophyGrid').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const card = e.target.closest('[data-card]');
      if (card) selectTrophy(Number(card.dataset.card));
    }
  });
  document.getElementById('detailBody').addEventListener('click', (e) => {
    const counterBtn = e.target.closest('[data-count]');
    if (counterBtn) {
      const holder = counterBtn.closest('[data-counter-for]');
      const trophy = guide.trophies.find((t) => t.id === Number(holder.dataset.counterFor));
      stepCounter(trophy, counterBtn.dataset.count === 'step' ? 'step' : Number(counterBtn.dataset.count));
    }
  });
  document.getElementById('roadmapList').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-open]');
    if (chip) { switchView('tracker'); selectTrophy(Number(chip.dataset.open)); }
  });
}

wireControls();
loadGuide().catch(() => {
  document.getElementById('resultLine').textContent = 'The trophy data failed to load — serve this folder with any static HTTP server (opening via a server, not the file path, lets the app fetch its data).';
});
