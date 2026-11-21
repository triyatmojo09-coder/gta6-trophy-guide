# Leonida Legend — GTA VI Trophy Guide & Tracker

![make.fun bounty](https://make.fun/badge/gta6-trophy-guide-01.svg)
![rank](https://make.fun/badge/gta6-trophy-guide-01/triyatmojo09-coder/gta6-trophy-guide/rank.svg)
![reward](https://make.fun/badge/gta6-trophy-guide-01/triyatmojo09-coder/gta6-trophy-guide/reward.svg)

An offline guide and tracker for all **55 PlayStation 5 trophies of Grand Theft Auto VI**, built for the [make.fun GTA 6 trophy guide bounty](https://make.fun/bounty/gta6-trophy-guide-01). Open `app/index.html` through any static file server and it runs with the network off — no build step, no accounts, nothing loaded from anywhere else.

## What it does

- **The full official list** — every trophy with the name, description and grade PlayStation publishes (1 platinum, 2 gold, 6 silver, 46 bronze; 28 hidden), plus its recorded rarity from Exophase's launch recording of the trophy page.
- **A guide to every trophy, in our own words**, each citing its sources (the official PlayStation list, Exophase, PSNProfiles) — what to do, where the official description puts it, and when it can be missed.
- **Missable flags with reasons** — four trophies flagged from their own descriptions (a one-time VCIA departure, a scripted partnership moment, an unchangeable choice count, a second-attempt trophy), each with the evidence quoted in its guide.
- **A six-phase roadmap to the platinum** — story first with the missables watched, stranger strands closed before the endgame, then the collection, activity and crime sweeps, and 100% completion last.
- **A real tracker** — check off earned trophies, keep counters for the counted trophies (250 stunts, 42 range golds, $250,000 laundered…; reaching a target marks the trophy earned), and watch the platinum progress ring and per-grade counts update. Progress saves in the browser's local storage and can be **exported to a file and imported back**.
- **Filters and a spoiler shield** — filter by kind (story, missable, collectibles, activities), grade and earned status, search by name or mission, sort by list order, rarity or name. The spoiler shield hides the names and descriptions of hidden trophies until you earn them, exactly as PlayStation does. The official list has no online trophies, so there is deliberately no online filter.

## Layout

- `app/` — the guide itself: `index.html`, `style.css`, `app.js`, and `data/trophies.json` (the trophies, their guides, the roadmap and the source legend).
- `screenshots/` — four real renders of the app: the tracker, an open missable guide, the roadmap, and the missable filter with the spoiler shield on.
- `main.ts` — the entry program: it validates the trophy data (55 trophies, every guide present, roadmap complete), copies `app/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored library in `vendor/makefun-frontend.ts`, which is the kit's file, unchanged.
- `serve.ts` — a tiny local server for trying the guide: `node serve.ts`, then open http://localhost:8080.

Leonida Legend is an unofficial fan work: it uses no Rockstar Games logo, artwork or screenshots, and its look is its own.
