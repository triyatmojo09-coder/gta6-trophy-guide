// Leonida Legend — GTA VI trophy guide & tracker (gta6-trophy-guide-01 entry).
// The guide itself is this directory's app/ folder: plain static files (ES modules, CSS, no build step)
// that open at app/index.html and load nothing over the network. Its trophy list, guides, roadmap and
// sources are app/data/trophies.json. This program hands the entry in: before copying anything it
// validates the trophy data (all 55 official trophies named, every guide non-blank, the roadmap
// covering the whole list), then it copies app/ and screenshots/ to /output and writes
// /output/dossier.json with the vendored make.fun library, byte for byte as the scorer rebuilds it.
// Leave vendor/makefun-frontend.ts exactly as the kit ships it.
//
// Serve the guide locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Authored guard: a guide that names fewer than the 55 official trophies, or leaves one guideless,
// is refused by the gate — catch it here, where the message can still say which trophy is missing.
const data = JSON.parse(readFileSync(join(here, 'app', 'data', 'trophies.json'), 'utf8'));
const trophies: { name?: unknown; guide?: unknown }[] = Array.isArray(data) ? data : data.trophies;
if (!Array.isArray(trophies) || trophies.length !== 55) {
  throw new Error(`trophies.json must hold the 55 official trophies; found ${Array.isArray(trophies) ? trophies.length : 'none'}`);
}
const unguided = trophies.filter((t) => typeof t.name !== 'string' || typeof t.guide !== 'string' || !t.guide.trim());
if (unguided.length > 0) throw new Error(`trophies.json: ${unguided.length} trophies are missing a name or a guide`);
const roadmapIds = new Set((data.roadmap ?? []).flatMap((phase: { trophyIds?: number[] }) => phase.trophyIds ?? []));
if (roadmapIds.size !== 55) throw new Error(`the roadmap must cover all 55 trophies; it covers ${roadmapIds.size}`);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files and directories in app/ or
// 48 MiB of app files: app/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 50331648 }),
);

console.log(`leonida legend: handed in ${trophies.length} trophies, roadmap phases ${(data.roadmap ?? []).length}, dossier written to ${join(out, 'dossier.json')}`);
