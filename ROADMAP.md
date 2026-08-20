# Demiurge Roadmap

Working document. Updated 2026-08-20. CLAUDE.md holds the design pillars
(they gate everything); this file holds where we are and where we're going.

## Where we are

Shipped and playable, in order of arrival:

- **Milestone 1 core**: climate grid, pop buckets, bless/warm/cool verbs,
  chronicle, speed controls. Long since surpassed.
- **Living world (Phase A)**: wind-band water cycle, orographic rain,
  recarving rivers, live biomes, warm/cold ages, coastal fishing, ore veins.
- **Races (Phase B)**: six races with biome affinities and stat multipliers.
  Vein harvest feeds miners, and genesis "longing" sites racial homelands.
- **Society v1**: schisms, contests that end in battles, accords, or
  mergers, grudges and vendettas, plagues, settlement tiers, consolidation,
  named leaders and heroes with temperaments that steer the dice.
- **Genesis update**: world-select screen, sleeping worlds, Wake-a-People
  verb, Raise/Carve terrain sculpting with settling hydrology, floods.
- **Murmurs and faith**: wants derived from lived state. Prayers get
  answered (faith, monuments), mocked (forsaking, "darker powers"), or
  endured (grit, stoic peoples). Heal and Smite verbs. Ambitions (horizon,
  conquest, delving) telegraph what civs are about to do.
- **Borders (Nations stage 1)**: territory layer, sticky influence-based
  ownership, drawn borders, expansion respects dominion.
- **Named polities (Nations stage 2)**: cultures with enough souls, a town,
  and a leader proclaim nations. Government form comes from the founder's
  temperament (Warband/Horde/Dominion, Council/Commonwealth/Concord,
  Principality/Kingdom/Empire, Compact/League/Hegemony). Rank takes size
  AND years held, so empires are a mid-game beat (~y95+ in soaks).
  Alliances form between kin nations or shared-vendetta partners: no border
  pressure between allies, allied souls weigh into battle losses, capped at
  3 bonds per nation. Nation names label their capitals on the map.
- **War, first cut (Nations stage 3a)**: declared wars between polities
  (vendetta + conquest ambition + a polity to declare it). Hosts are levied
  out of settlement counts, so long wars hollow the homeland. Soldiers die
  afield or come home; none are conjured. Hosts intercept each other, so
  wars have fronts. Conquest: a beaten settlement is sacked, sheds refugees
  toward kin and allies, and the rest bow to new masters. Not
  annihilation-only anymore. Pops on the road are named journeys now
  (settlers / migrants / refugees / homeward), not "town (wandering)".
  Deeds ledger: wars, sacks, and annihilations recorded per culture pair.
  A pair with remembered deeds never cools below a grudge floor.

- **Deep politics v1**: war conduct comes from the conqueror's leader
  (warlike slaughters, cunning enslaves, peaceable occupies, ambitious
  sacks), each writing a distinct deed with its own weight and half-life
  (a raid fades in 40 years, slaughter takes 200, annihilation ~forever).
  Memory drives behavior: vengeance wars fire on remembered deeds even
  after hot grudges cool, and the declaration names the wound ("They have
  not forgotten the massacre of year 221"). Vendetta-deep hatred casts
  truces into the fire. Alliances refuse to form across heavy unforgotten
  deeds. Conquest ambitions aim at the most-hated rival. Grudges cap at 10.

- **UI scaffolding v1**: tabbed sidebar (Chronicle | Nations). The Nations
  tab lists every living people (nations first, ranked by souls) and
  clicking one opens a dossier: leader, souls, settlements, dominion,
  bonds, wars, grudges with labels, and the memory ledger in both
  directions ("they remember" / "done in their name"), plus a follow
  button that jumps to their filtered chronicle.

## Next up

- **Coalitions and the full sidebar**: wars have sides now, not just two
  names. Sworn allies of belligerents march in while a war is young (8-yr
  window), peace binds every cross pair, and world wars emerge in warlike
  eras (one soak: 21 wars, 37 oath-joinings; another: 3 and 4 — worlds
  have personalities). Conduct escalates under deep hatred (grudge 8+:
  no occupations, no thralls). Cross-race conquest sends far more souls
  fleeing than converting, which keeps races from assimilating away in
  war eras. Sidebar grew Wars (each war's sides and hosts afield) and
  Figures (living leaders and champions by nation) tabs.

## Next up

- **Deep politics next steps**: avenging deeds (reclamation clears or
  inverts a memory), relation stances surfaced as labels, occupation
  discontent (occupied pops remember who they were).
- **UI**: a world tab (climate age, total souls, era summary); figure
  pages with deeds and succession chains.
- **Stage 3 leftovers**: refugee arrivals straining host food explicitly.
- Soak note: race viability is volatile. Individual seeds lose a race
  entirely by y300 (orcs on 7, elves on 99001). Predates nations; watch it.
- Soak note: conquest conduct skews to slaughter, since warlike leaders
  are the ones who start conquest wars. Coherent, but revisit when conduct
  gets more inputs.

- **Ruins and reclamation**: dead towns and annihilated villages leave an
  Ω on the map for ~250 years. Ancestral ruins pull descendants back (site
  score bonus), homecomings are big chronicle beats, strangers building on
  another people's dead earn a grudge, and untouched stones sink into the
  grass. Meteors leave ruin-rimmed crater lakes emergently.
- **World flavors at genesis**: each world card rolls a character —
  temperate, scorched, frozen, sodden, parched, island seas, one great
  land — via three worldgen levers (land exponent, temp bias, rain mult).
  Land 25-65%, all races viable in all flavors. Pinned in the URL as
  &flavor=key.
- **Disasters, first cut**: fire as the first propagating process. Spreads
  on its own (5 substeps per season), eats by biome flammability damped by
  moisture, burns out to char that suppresses harvest then heals into
  ash-fattened soil. Dry lightning kindles wildfires (~1 per 30 years per
  world); old peaks erupt naturally (~1 per 100 years). Two new verbs:
  Volcano (cone, fire ring, volcanic-soil fallout ring, sometimes new ore)
  and Meteor (crater that becomes a lake when hydrology settles, rim,
  fires). Cataclysms the god calls make the struck know whose hand it was.

## The longer arc, in rough order

1. **Disasters, deeper**: quakes, floods-as-events, plagues that travel
   trade routes someday. More propagating processes on the fire pattern.
2. **Deities that walk the earth**, empowered by peoples the player-god
   forsook (the faith system's "darker powers" line is the deliberate
   hook). More impactful, or crueler, as their followings grow.
3. **Fun biomes**: evil, good, wild; DF-style regional character. Plus
   continued realistic biome responses (scorch shipped; more to come).
4. **Multi-cell settlements**: cities that span cells, so wars conquer
   districts and gods erase them.
5. **Tech ladder**: from first fires toward a space age, SimEarth-style.
   Very long horizon.
6. **Economy, trade**: now that nations make partners possible. Likely
   v0 is trade along alliances (surplus food and ore moving between sworn
   nations, feeding the same foodSat the sim already reads), which makes
   alliances materially matter and gives wars stakes worth fighting over.
7. Nice-to-haves parked: race-flavored name syllable pools, relics and
   artifacts, more divine verbs (weather manipulation is Phase D per the
   original plan; partially arrived via sculpting's rain shadows).

## Standing engineering notes

- **All tunables live in `src/constants.ts`**. Every balance pass starts
  there.
- **Balance methodology**: headless 300-year soaks via
  `npx -y tsx <scratch script>` importing `createWorld`/`tick` with
  absolute paths. Benchmarks at y300: ~300-650k souls, 25-40 living
  cultures, ~2 battles/yr, every race viable somewhere, no race safe
  everywhere. Compare absent-god vs attentive-god vs cruel-god runs when
  touching faith or grit.
- **Chronicle hygiene rule**: expansion-class events are one story per
  culture per era (cooldown maps on `world`). Big beats importance 3,
  struggles 2, local color 1. Volume at year-speed currently ~20-26
  lines/yr in a mature world. Watch it; Steve has flagged busyness.
- **Determinism**: seeded rng only, no Date.now in sim. The seed makes the
  bones, the run makes the story: `?seed=N` pins the terrain but rolls a
  fresh history every load; add `&run=M` (shown in the page title) to pin
  one history exactly. `&quiet=1` starts with peoples asleep. Headless
  `createWorld(seed)` defaults run=seed and stays fully deterministic.
- **Pillar 3 discipline**: every new verb writes into sim layers the
  simulation already reads. No special-case miracle logic. When adding a
  system, ask "what does the sim read?" first.
- **Writing style (Steve's preference)**: no em dashes in repo docs. Keep
  the prose plain and direct.
- Known latent items: extinct cultures' territory takes a year to fade
  (fine); genesis previews cost one extra worldgen per card (fine);
  border-push chronicle uses last-flipped cell for its map pin.

## The north star

"SimEarth marries Dwarf Fortress legends." The world must stay interesting
to *watch* before anything else is added. Every feature earns its place by
making non-intervention more dramatic, never by demanding attention.
