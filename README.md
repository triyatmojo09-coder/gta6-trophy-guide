# Leonida Legend — a GTA VI trophy guide & tracker

[![Competition](https://make.fun/badge/gta6-trophy-guide-01.svg)](https://make.fun/bounty/gta6-trophy-guide-01)
[![Rank](https://make.fun/badge/gta6-trophy-guide-01/triyatmojo09-coder/gta6-trophy-guide/rank.svg)](https://make.fun/bounty/gta6-trophy-guide-01)
[![Reward](https://make.fun/badge/gta6-trophy-guide-01/triyatmojo09-coder/gta6-trophy-guide/reward.svg)](https://make.fun/bounty/gta6-trophy-guide-01)

An entry for the make.fun bounty [Build the best GTA 6 trophy guide](https://make.fun/bounty/gta6-trophy-guide-01).

**Leonida Legend** is an offline, single-page guide and tracker for all 55 PlayStation 5 trophies of
Grand Theft Auto VI. Open `app/index.html` (served by any static file server) and everything works with the
network off: no accounts, no build step, no external assets — the whole look is CSS and SVG.

## What it does

- **The full official list.** All 55 trophies with their official names, descriptions and grades
  (1 platinum, 2 gold, 6 silver, 46 bronze), the 28 hidden trophies flagged, and each trophy's recorded
  rarity with a rarity band. Rarity is labelled in-app as what it is: a launch snapshot recorded by
  Exophase on 2026-11-19 across 638 tracked players.
- **An original guide for every trophy** (40–80 words each), written for this app, with the sources it
  rests on named beside it — the official PlayStation list, Exophase and PSNProfiles, linked in the
  Sources view.
- **Missable warnings.** The four trophies that can be lost in a single playthrough — *Catch Me If You
  Can*, *Personal Best*, *Actions Speak Louder* and *Bad Luck, I Guess* — carry a warning box explaining
  exactly why (the game has no mission replay), so you meet them before they pass.
- **A tracker that remembers.** Tick trophies off as you earn them; progress, including the counters
  below, is saved in your browser's localStorage. Export progress to a JSON file, import it back on
  another machine, or reset. A progress ring and per-grade counts sit at the top, and every trophy has a
  deep link (`#trophy-<id>`) you can bookmark or share.
- **Counters for the 19 counted trophies.** Stunts (250), Shooting Range golds (42), choices (500),
  laundered Marked Bills ($250,000) and fifteen more get steppers with a progress bar; reaching the
  target ticks the trophy off automatically.
- **Filters and a spoiler shield.** Filter by kind (Story / Missable / Collectibles / Activities), grade
  and earned status, search by name or keyword, and sort by list order, rarity or name. With the spoiler
  shield on (the default), hidden and story trophies stay veiled — name and description blurred, guide
  withheld — until you earn them or choose to reveal them.
- **A six-phase platinum roadmap.** From *Touchdown in Leonida* through *The Long Road*, the roadmap
  orders all 55 trophies exactly once, shows per-phase progress, flags the missables in place, and every
  chip deep-links into that trophy's guide.

## Layout

- `app/` — the guide itself: `index.html`, `style.css`, `app.js`, and `data/trophies.json` (the trophy
  data, including guides, roadmap and sources).
- `screenshots/` — four captures of the running app, described by `shots.json` and produced by
  `capture-screenshots.mjs` (`node capture-screenshots.mjs`, `--verify` for a console-error and
  counter check).
- `main.ts` — the hand-in program: it validates the trophy data (55 trophies, guide lengths, roadmap
  completeness), copies `app/` and `screenshots/` to the output directory and writes `dossier.json`
  with `vendor/makefun-frontend.ts`. Run it with `MAKEFUN_OUTPUT_DIR=out node main.ts`.
- `serve.ts` — the kit's static server for trying the app locally at http://localhost:8080.
- `vendor/makefun-frontend.ts` — make.fun's dossier library, byte-identical to the kit's copy.

## Notes

Leonida Legend is a fan-made guide, not affiliated with Rockstar Games or Take-Two Interactive. It uses
no official artwork or logos; trophy names and descriptions are quoted from the official PlayStation
list, and all guide text is original.
