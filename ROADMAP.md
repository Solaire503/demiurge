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
- **Named polities (Nations stage 2)** — cultures with souls enough, a
  town, and a leader proclaim nations; government form from the founder's
  temperament (Warband/Horde/Dominion, Council/Commonwealth/Concord,
  Principality/Kingdom/Empire, Compact/League/Hegemony); rank asks for
  size *and* years held, so empires are a mid-game beat (~y95+ in soaks).
  Alliances between kin nations or shared-vendetta partners: no border
  pressure between allies, allied souls weigh into battle losses, capped
  at 3 bonds per nation. Nation names label their capitals on the map.

- **War, first cut (Nations stage 3a)** — declared wars between polities
  (vendetta + conquest-hungry + polity to declare it); **hosts levied out
  of settlement counts** so long wars hollow the homeland — soldiers die
  afield or come home, none are conjured; hosts intercept each other so
  wars have fronts; **conquest**: a beaten settlement is sacked, sheds
  refugees toward kin/allies, and the rest bow to new masters — not
  annihilation-only. Pops on the road are named journeys now (settlers /
  migrants / refugees / homeward), not "town (wandering)". **Deeds
  ledger**: wars, sacks, annihilations recorded per culture pair; a pair
  with remembered deeds never cools below a grudge floor.

## Next up

- **Deep politics (Steve's direction, 2026-08-20)**: relations must be
  DEEP — grudges lasting decades/centuries, atrocity memory (occupy vs
  enslave vs slaughter vs raze as distinct deeds with distinct weights),
  responses shaped by the ledger for generations. The `deeds` map is the
  seed of this: next pass derives nation-level relations from deeds +
  grudges + kinship + alliances, surfaces it in the inspect card, and
  makes war conduct choices (sack vs occupy gently) read from leader
  temperament and write back into memory.
- **Stage 3 leftovers**: ruins & reclamation (sacked settlements leave
  bones; descendants retaking ancestral ground); allies joining declared
  wars as co-belligerents; refugee arrival straining host food explicitly.
- Full relations roll-up readout ("how do these two nations stand").
- Soak note: race viability is volatile — individual seeds lose a race
  entirely by y300 (orcs on 7, elves on 99001). Predates nations; watch.

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
- **Determinism**: seeded rng only, no Date.now in sim. The seed makes the
  bones, the run makes the story: `?seed=N` pins the terrain but rolls a
  fresh history every load; add `&run=M` (shown in the page title) to pin
  one history exactly. `&quiet=1` starts with peoples asleep. Headless
  `createWorld(seed)` defaults run=seed and stays fully deterministic.
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
