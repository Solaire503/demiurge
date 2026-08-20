# Demiurge — Roadmap

Working document. Updated 2026-08-20. CLAUDE.md holds the design pillars
(they gate everything); this file holds where we are and where we're going.

## Where we are

Shipped and playable, in order of arrival:

- **Milestone 1 core** — climate grid, pop buckets, bless/warm/cool verbs,
  chronicle, speed controls. Long since surpassed.
- **Living world (Phase A)** — wind-band water cycle, orographic rain,
  recarving rivers, live biomes, warm/cold ages, coastal fishing, ore veins.
- **Races (Phase B)** — six races with biome affinities and stat multipliers;
  vein harvest feeds miners; genesis "longing" sites racial homelands.
- **Society v1** — schisms, contests → battles/accords/mergers, grudges and
  vendettas, plagues, settlement tiers, consolidation, named leaders and
  heroes with temperaments that steer dice.
- **Genesis update** — world-select screen, sleeping worlds, Wake-a-People
  verb, Raise/Carve terrain sculpting with settling hydrology, floods.
- **Murmurs & faith** — wants derived from lived state; prayers answered
  (faith, monuments), mocked (forsaking, "darker powers"), or endured
  (grit, stoic peoples). Heal and Smite verbs. Ambitions (horizon /
  conquest / delving) telegraph what civs are about to do.
- **Borders (Nations stage 1)** — territory layer, sticky influence-based
  ownership, drawn borders, expansion respects dominion.

## Next up: Nations, stage 2

Cultures crossing a threshold (population / city / leader) coalesce into
**named polities** — "the Kalathi Kingdom" — with:

- Government flavor from leader temperament (warlike → horde/warband,
  cunning → merchant league, peaceable → council, ambitious → empire).
- Diplomacy consolidated to the nation level: grudges, truces, kinship
  roll up into relations; **alliances** between kin nations and mutual
  enemies of vendetta targets.
- Steve's "fun realm": gradations of polity — province vs state vs empire.
- Colonization must stay healthy while this deepens (borders stage 1
  verified ~90% land claimed by y300; keep checking in soaks).

## Then: Nations, stage 3 — actual war

- Declared wars between polities with front lines, not just pop scuffles.
- **Conquest and occupation** of settlements instead of annihilation-only.
- **Refugees** streaming to kin/allied lands, straining hosts' food.
- **Ruins & reclamation** (long-specced): sacked settlements leave bones;
  foreigners occupying ruins anger the origin culture; descendants
  retaking ancestral ground is its own chronicle beat.

## The longer arc, in rough order

1. **Disasters** — SimEarth-style: plop a volcano, call a meteor. All
   landscape-first (terrain actually changes), with **propagating
   processes**: a meteor in a forest starts a fire that spreads on its
   own, quick-simmed relative to player speed. Fire spread is the first
   propagating mechanic to build.
2. **Deities that walk the earth** — empowered by peoples the player-god
   forsook (the faith system's "darker powers" line is the deliberate
   hook). More impactful, or crueler, as their followings grow.
3. **Fun biomes** — evil, good, wild; DF-style regional character. Plus
   continued realistic biome responses (scorch shipped; more to come).
4. **Multi-cell settlements** — cities that span cells, so wars conquer
   districts and gods erase them.
5. **Tech ladder** — from first fires toward a space age, SimEarth-style.
   Very long horizon.
6. **Economy, trade** — after nations make partners possible.
7. Nice-to-haves parked: race-flavored name syllable pools; relics and
   artifacts; more divine verbs (weather manipulation is Phase D per the
   original plan — partially arrived via sculpting's rain shadows).

## Standing engineering notes

- **All tunables live in `src/constants.ts`** — every balance pass starts
  there.
- **Balance methodology**: headless 300-year soaks via
  `npx -y tsx <scratch script>` importing `createWorld`/`tick` with
  absolute paths. Benchmarks at y300: ~300–650k souls, 25–40 living
  cultures, ~2 battles/yr, every race viable somewhere, no race safe
  everywhere. Compare absent-god vs attentive-god vs cruel-god runs when
  touching faith/grit.
- **Chronicle hygiene rule**: expansion-class events are one story per
  culture per era (cooldown maps on `world`); big beats importance 3,
  struggles 2, local color 1. Volume at year-speed currently ~20-26
  lines/yr in a mature world — watch it, Steve has flagged busyness.
- **Determinism**: seeded rng only, no Date.now in sim; `?seed=N` pins a
  world, `&quiet=1` starts it with peoples asleep.
- **Pillar 3 discipline**: every new verb writes into sim layers the
  simulation already reads. No special-case miracle logic. When adding a
  system, ask "what does the sim read?" first.
- Known latent items: extinct cultures' territory takes a year to fade
  (fine); genesis previews cost one extra worldgen per card (fine);
  border-push chronicle uses last-flipped cell for its map pin.

## The north star

"SimEarth marries Dwarf Fortress legends." The world must stay interesting
to *watch* before anything else is added — every feature earns its place
by making non-intervention more dramatic, never by demanding attention.
