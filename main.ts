// Leonida Legend — hand-in program for the GTA 6 trophy guide bounty.
//
// What it does, in order:
//   1. Validates app/data/trophies.json against the shape this entry promises:
//      all 55 official trophies with names, descriptions and grades, an original
//      guide of 40-80 words for each, the 28 hidden trophies, the 4 missable
//      trophies with their reasons, the counted trophies with their targets,
//      and a six-phase roadmap that covers every trophy exactly once.
//   2. Copies app/ and screenshots/ from this repository into the output
//      directory (MAKEFUN_OUTPUT_DIR, or /output when the variable is unset),
//      in sorted path order, so two runs write byte-identical trees.
//   3. Writes dossier.json into the output directory with buildDossier from
//      vendor/makefun-frontend.ts, capped the way this competition's gate caps
//      it, and refuses if the dossier would pass 1.5 MiB.
//
// Node standard library only; no network; deterministic.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DOSSIER_MAX_BYTES = 1_572_864; // 1.5 MiB, this competition's dossier cap.
const TEXT_MAX_BYTES = 163_840; // The dossier text cap the gate scores with.

const EXPECTED = {
  trophies: 55,
  grades: { platinum: 1, gold: 2, silver: 6, bronze: 46 },
  hidden: 28,
  missable: ['Catch Me If You Can', 'Personal Best', 'Actions Speak Louder', 'Bad Luck, I Guess'],
  counted: 19,
  roadmapPhases: 6,
  guideWords: { min: 40, max: 80 },
};

function fail(message: string): never {
  throw new Error('leonida-legend: ' + message);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function validateData(): void {
  const dataPath = join(repoRoot, 'app', 'data', 'trophies.json');
  const data = JSON.parse(readFileSync(dataPath, 'utf8'));
  const trophies = data.trophies;
  if (!Array.isArray(trophies)) fail('trophies.json holds no "trophies" array');
  if (trophies.length !== EXPECTED.trophies) fail(`expected ${EXPECTED.trophies} trophies, found ${trophies.length}`);

  const ids = new Set<number>();
  const gradeCounts: Record<string, number> = {};
  let hidden = 0;
  let counted = 0;
  const missableNames: string[] = [];

  for (const trophy of trophies) {
    const label = `trophy ${trophy.id} (${trophy.name ?? '?'})`;
    if (!Number.isInteger(trophy.id) || trophy.id < 1 || trophy.id > 55) fail(`${label}: id out of range`);
    if (ids.has(trophy.id)) fail(`${label}: duplicate id`);
    ids.add(trophy.id);
    if (typeof trophy.name !== 'string' || trophy.name.trim() === '') fail(`${label}: blank name`);
    if (typeof trophy.description !== 'string' || trophy.description.trim() === '') fail(`${label}: blank description`);
    if (!(trophy.grade in EXPECTED.grades)) fail(`${label}: unknown grade ${trophy.grade}`);
    gradeCounts[trophy.grade] = (gradeCounts[trophy.grade] ?? 0) + 1;
    if (typeof trophy.guide !== 'string' || trophy.guide.trim() === '') fail(`${label}: blank guide`);
    const words = wordCount(trophy.guide);
    if (words < EXPECTED.guideWords.min || words > EXPECTED.guideWords.max) {
      fail(`${label}: guide is ${words} words, outside ${EXPECTED.guideWords.min}-${EXPECTED.guideWords.max}`);
    }
    if (typeof trophy.rarity !== 'number' || trophy.rarity < 0 || trophy.rarity > 100) fail(`${label}: bad rarity`);
    if (typeof trophy.rarityBand !== 'string' || trophy.rarityBand === '') fail(`${label}: no rarity band`);
    if (!Array.isArray(trophy.sources) || trophy.sources.length === 0) fail(`${label}: cites no source`);
    if (trophy.hidden === true) hidden += 1;
    if (trophy.count !== undefined) {
      counted += 1;
      if (!Number.isInteger(trophy.count.target) || trophy.count.target <= 0) fail(`${label}: bad count target`);
      if (!Number.isInteger(trophy.count.step) || trophy.count.step <= 0) fail(`${label}: bad count step`);
    }
    if (trophy.missable === true) {
      missableNames.push(trophy.name);
      if (typeof trophy.missableReason !== 'string' || trophy.missableReason.trim() === '') {
        fail(`${label}: missable without a reason`);
      }
    }
  }

  for (const [grade, total] of Object.entries(EXPECTED.grades)) {
    if (gradeCounts[grade] !== total) fail(`expected ${total} ${grade} trophies, found ${gradeCounts[grade] ?? 0}`);
  }
  if (hidden !== EXPECTED.hidden) fail(`expected ${EXPECTED.hidden} hidden trophies, found ${hidden}`);
  if (counted !== EXPECTED.counted) fail(`expected ${EXPECTED.counted} counted trophies, found ${counted}`);
  missableNames.sort();
  const expectedMissable = EXPECTED.missable.slice().sort();
  if (JSON.stringify(missableNames) !== JSON.stringify(expectedMissable)) {
    fail(`missable set differs: found ${missableNames.join(' | ')}`);
  }

  const roadmap = data.roadmap;
  if (!Array.isArray(roadmap) || roadmap.length !== EXPECTED.roadmapPhases) {
    fail(`roadmap must hold ${EXPECTED.roadmapPhases} phases`);
  }
  const covered = new Set<number>();
  for (const phase of roadmap) {
    if (!Array.isArray(phase.trophyIds) || phase.trophyIds.length === 0) fail(`phase ${phase.phase}: no trophies`);
    for (const id of phase.trophyIds) {
      if (!ids.has(id)) fail(`phase ${phase.phase}: unknown trophy id ${id}`);
      if (covered.has(id)) fail(`phase ${phase.phase}: trophy ${id} appears twice in the roadmap`);
      covered.add(id);
    }
  }
  if (covered.size !== EXPECTED.trophies) fail(`roadmap covers ${covered.size} of ${EXPECTED.trophies} trophies`);

  const sourceKeys = new Set((data.sources ?? []).map((s: { key: string }) => s.key));
  for (const trophy of trophies) {
    for (const key of trophy.sources) {
      if (!sourceKeys.has(key)) fail(`trophy ${trophy.id}: cites unknown source "${key}"`);
    }
  }
}

function copyTree(name: string): void {
  const from = join(repoRoot, name);
  const to = join(outputDir, name);
  if (!existsSync(from)) fail(`repository holds no ${name}/ directory`);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

function main(): void {
  validateData();
  mkdirSync(outputDir, { recursive: true });
  copyTree('app');
  copyTree('screenshots');

  const dossier = buildDossier(outputDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: 4, max_bytes: 262_144 },
    app_max_files: 993,
    app_max_bytes: 50_331_648,
    app_path_max_bytes: 1000,
  });
  const bytes = Buffer.byteLength(dossier, 'utf8');
  if (bytes > DOSSIER_MAX_BYTES) fail(`dossier is ${bytes} bytes, over the ${DOSSIER_MAX_BYTES} cap`);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);

  const appBytes = statSync(join(outputDir, 'app', 'data', 'trophies.json')).size;
  console.log(`leonida-legend: validated 55 trophies, roadmap complete; dossier ${bytes} bytes (data file ${appBytes} bytes)`);
}

main();
