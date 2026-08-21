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

- **Disasters, first cut**: fire as the first propagating process. Spreads
  on its own (5 substeps per season), eats by biome flammability damped by
  moisture, burns out to char that suppresses harvest then heals into
  ash-fattened soil. Dry lightning kindles wildfires (~1 per 30 years per
  world); old peaks erupt naturally (~1 per 100 years). Two new verbs:
  Volcano (cone, fire ring, volcanic-soil fallout ring, sometimes new ore)
  and Meteor (crater that becomes a lake when hydrology settles, rim,
  fires). Cataclysms the god calls make the struck know whose hand it was.
- **Ruins and reclamation**: dead towns and annihilated villages leave an
  Ω on the map for ~250 years. Ancestral ruins pull descendants back (site
  score bonus), homecomings are big chronicle beats, strangers building on
  another people's dead earn a grudge, and untouched stones sink into the
  grass. Meteors leave ruin-rimmed crater lakes emergently.
- **World flavors at genesis**: each world card rolls a character
  (temperate, scorched, frozen, sodden, parched, island seas, one great
  land) via three worldgen levers: land exponent, temp bias, rain mult.
  Land 25-65%, all races viable in all flavors. Pinned in the URL as
  &flavor=key.
- **Coalitions and the full sidebar**: wars have sides now, not just two
  names. Sworn allies of belligerents march in while a war is young (8-yr
  window), peace binds every cross pair, and world wars emerge in warlike
  eras (one soak: 21 wars, 37 oath-joinings; another: 3 and 4; worlds
  have personalities). Conduct escalates under deep hatred (grudge 8+:
  no occupations, no thralls). Cross-race conquest sends far more souls
  fleeing than converting, which keeps races from assimilating away in
  war eras. Sidebar grew Wars (each war's sides and hosts afield) and
  Figures (living leaders and champions by nation) tabs.
- **The yoke**: conquered pops remember who they were. Under quiet rule
  the old name fades in ~35 years; under a distracted (at war, 3x) or
  cruel (famine/unsafe, 2x) master they revolt and rejoin their people.
  A revolt can resurrect an extinct culture: the banner of the fallen
  rises again with a fresh-minted leader. Warmongering empires cannot
  hold what they take; peaceful ones digest it.
- **Race personalities (Steve's direction)**: races differ in disposition,
  not just stats. Leader temperament rolls are race-weighted (orcs 55%
  warlike, humans most ambitious, gnomes 15% warlike). Deed half-lives
  stretch by the victim's memory (elves 2.2x, so a wrong outlives its
  doer's dynasty; goblins 0.5x). Oath-keeping varies (dwarves 0.4x lapse;
  goblins 2.5x, even kin-oaths tire, and the fickle rarely swear at all).
  Conduct escalation shifts by race cruelty (orcs slaughter early, gnomes
  and elves essentially never). Muster shares differ (whole orc tribe vs
  reluctant gnome levies). Elves tend the land: char heals 2x under their
  dominion. Gnome "inventors" parked as their tech-ladder hook.
- **The sea answers (SimEarth pass)**: a meteor into the ocean raises a
  tsunami that sweeps low coasts and salts the fields. Volcanoes under
  water birth islands ("a smoking isle rises"). Two hotspots per world
  erupt and drift for centuries, building island chains no genesis map
  showed (5-8 births per 300 years), which peoples then colonize. Great
  land eruptions and meteor strikes throw an ash veil: global volcanic
  winter, ~0.7-1.9°C, fading over years, with the darkened sun and its
  return both chronicled.

## The plan, reorganized (2026-08-20, after two research deep-dives)

Two sub-agent research passes fed this plan: one into SimEarth's full
mechanics, one into DF world-gen and Legends mode. The headline finding:
the two halves of the pitch patch each other's failure modes. SimEarth's
planetary loops were right but its drama was invisible and its failures
undramatic (Wright himself: failure was "a dead lump of rock"; the game
had graphs but no narrative memory). DF's generated histories are
legendary but unreadable at native scale (the community treats
third-party legends viewers as mandatory; DF proves the data model, not
the reading experience). Our chronicle and dossier UI is the shared fix.
Every feature below must land as all three: a sim input, a chronicle
output, and a place to read it.

### Phase 1: the Legends pass — SHIPPED 2026-08-20 (except noted)

Cheap, high story-ROI, mostly UI and naming over existing state.
Shipped: named wars with counters and a wars-past ledger, duels between
champions, figure kill-lists and earned epithets ("Eshir Skullkeeper"),
Ages of the world with hysteresis (soaked arcs read Wandering ->
Founding -> Nations -> Empires, with the Long Peace and the Age of
Blood trading places), the World tab as the Gaia window (age, sky,
souls by race, powers, land), figure pages, and the age in the date
line. Perf resolved by discovery: the 13ms tick was tsx interop
overhead in the headless harness; the real bundled build ticks at
1.7ms (decade step 68ms vs 250ms budget). Headless soaks now bundle
with esbuild first. Still open from phase 1: relation stance labels,
refugee food strain, avenging deeds, strip graphs with pinned events.

- **Named wars as containers**: every war gets a generated name ("the
  War of Salt") and a page aggregating its battles, sacks, duels, and
  what changed hands. DF's chronicle is tellable because a war is a
  container with a beginning, members, and an end.
- **"Because" links**: events triggered by remembered deeds say so in
  one clause ("...for the burning of Tessel, year 198") and click
  through. Turns the deeds ledger from invisible weight into readable
  motive. Flat diction stays; one subordinate clause max.
- **Figure kill-lists, duels, epithets**: heroes' notable kills listed
  on a small figure page; named duels when champions meet in battle;
  epithets minted from the record (Wyrmsbane, Oathbreaker). What makes
  figures quotable is one legible number on one page.
- **Ages of the world**, named from sim state (Age of Giants once
  creatures land, the Long Peace, the Age of Ash): chapters for the
  chronicle, a table of contents for a whole history.
- **World tab as the Gaia window**: planetary vital signs (mean temp,
  ash veil, souls by race, standing nations, era) plus an ambient mood
  reading, SimEarth's best UI idea. Later: strip graphs over time with
  chronicle events pinned to them.
- **Perf pass**: decade step ~390ms vs 250ms budget at the fastest
  slider; pressure and territory passes have easy O(n^2) wins.
- Smaller: relation stance labels, refugee arrivals straining host food,
  avenging deeds (reclamation clears or inverts a memory).

### Phase 2: mythical creatures — SHIPPED 2026-08-20

All three tiers live. Giants and trolls haunt the deep wilds (cap 5,
lairs, roaming, raids), withdrawing as civilization covers their haunts
(the taming of the land: ~12 withdrawals per soaked 300 years). Dragons
(two per world, ever) roost on gold in the high country, raid in actual
spreading fire, and project wide dragonfear; a slain dragon's hoard
comes home in a hundred wagons as a golden age. Forgotten beasts are
generated uniques ("a hollow colossus of bone and river-clay, which
hungers for bells and prayers"), one abroad at a time, called up 4x
faster where fires burn to darker powers. Fear rides the border
pressure machinery so flight happens free; raids on heroless peoples
raise heroes from the fight; hunts end in sung deeds (and earned
epithets via the kill ledger) or broken champions. Peoples in a
beast's shadow pray, and a god's smite that breaks the beast is an
answered prayer. Unleash verb with a beast picker. Beasts appear in
the inspect card, the Figures panel (abroad + beasts of legend), and
the World panel.

Original design (kept for reference):

A third force that is neither people nor climate. Creatures are Figures
with a body on the map: named, persistent, deaths are history. Every
behavior writes into existing sim layers: fear is border-style safety
pressure (pops flee for free), raids reuse battle loss math, dragonfire
is the fire system, prayers for deliverance are the want/faith machinery.

1. **Common beasts** (giants, trolls): several per world, spawn in deep
   wilderness, lair + roam radius, raid nearby camps. As civilization's
   influence covers a lair the beast fights or retreats deeper: the
   taming of the land, watchable over centuries.
2. **Rare** (dragons): one or two per world ever. Mountain lair near
   gold (hoard), wide dragonfear, razes with actual spreading fire.
   Slaying one is the hero system's crown; the hoard holds artifacts.
3. **Forgotten beasts**: procedurally generated uniques (name, form,
   hunger), at most one waking per era, drawn to forsaken lands. Per
   the research: seed them from figures whose "never die" ambition goes
   wrong, not from nothing. Stepping stone to walking deities.

Plus, from the DF research: **beast-slaying manufactures heroes**. A
nobody who fells a giant is promoted into the named-figure layer with
an epithet (DF's promotion-from-pops trick). Player gets an **Unleash
verb** (Wake pattern, beast picker). Reactions come free from existing
state: warlike cultures hunt for glory, dwarves covet hoards, the
devout pray, stoics endure, a shared beast forges alliances.

### Phase 2.5: angels and demons (Steve's direction, designed)

Demons operate like forgotten beasts — randomly generated, one horror
at a time — but they are INTELLIGENT. A demon that reaches the capital
of a weak or forsaken nation may usurp its throne (DF's law-givers):
it becomes that culture's leader-figure via the new Figure.nature
field, and everything leadership already drives follows for free —
cruelest conduct, conquest wants, hosts of the damned, faith curdling
under a ruler none dare name. Deposing it is a hero quest or a god's
wrath, and its reign is an era the chronicle can bracket. Angels are
the counterpart born of monument-faith: guardians drawn to devout
peoples, shielding them in battle and against beasts, departing if
faith fails. Both ride the beast body machinery plus Figure office.
Foundation shipped: Figure.nature ("mortal" | "demon" | "angel").

Beast interaction layer shipped alongside: beasts that cross paths
fight (winner feeds, "the hills echo with it"), same-blood pairs may
mate instead — one departs beyond the maps, and a brood stirs in the
earth years later ("something young and terrible comes of age").
Dragons choose raid targets by avarice: settlement tiers and gold
veins, the wealth proxy the economy will later replace.

### Phase 3: artifacts, dynasties, and the Cacame engine — PART 1 SHIPPED

Shipped 2026-08-20: named artifacts with full provenance (crowns and
banners minted at proclamations, blades named after duels, treasures
drawn from dragon hoards, master works from imperial forges). Sacks
carry treasures off, peaces send them home, extinction strands them
where the last holder fell, and kin homecomings raise them from the
rubble. A looted treasure held by strangers adds remembered weight
that never fades while held. One soaked crown: made y30, looted y123,
traded through wars for 160 years, returned with the peace of y290.
Dynasties: successions stay in the line ~60% of the time ("of Vekor's
line" vs "the line is broken"), figure pages show lineage, and slaying
a leader is a regicide deed the line remembers for a century.

Part 2 shipped same day: the Cacame engine (sacks may take a child of
promise who rises 15+ years later to lead the captor's people — "taken
from the X in childhood, now leads the Y" — and may later abandon them
to return to their blood); personal ambitions (leaders state dreams of
conquest, dynasty, renown, or the never-granted immortality; dreams
bias dice and pay off as epitaphs: "They dreamed of never dying, and
died as all things die"); monuments and tombs (victory stones for
named wars, tombs for the twice-famed, † on the map, desecration
grudges when strangers hold the ground, remembrance when it is
retaken).

- **Named artifacts with provenance**: crowns, blades, and banners
  minted at rare moments (coronations, dragon hoards, master smiths);
  every change of hands is an event (gifted, looted in a sack, lost
  with a fallen hero, demanded as war terms, recovered in a
  homecoming). An artifact's page is its provenance chain. Holding a
  looted relic is a standing grievance that does not decay while held.
- **Dynasties and succession**: leaders get heirs; successions are
  events; the child of a slain king inherits the grudge with a fresh
  half-life. A revolt led by the grandson of the deposed queen reads
  ten times better than one led by a fresh name.
- **The Cacame engine**: figures captured in sacks are raised under the
  captor culture and can rise in it, later leading its hosts against
  their birth-kin, or defecting home. Category-violating figures (an
  elf king of dwarves) are the most retold stories DF ever produced.
- **Personal ambitions**: each figure draws one dream (found a dynasty,
  avenge a parent, never die), stated once in the chronicle, biasing
  their dice, paid off decades later as triumph or tragedy.
- **Monuments and tombs**: victories and heroes remembered in-world;
  a culture reoccupying a site that holds its dead re-ups the faded
  memory. History with spatial context, DF's engraving lesson.

### Phase 4: economy v0 — SHIPPED 2026-08-20

Trade along alliances: when one sworn nation runs a surplus and its
ally in wagon range runs a deficit, grain flows into the same foodSat
the sim reads (capped lift, and the seller eats better too). Trade is
crisis relief by design: routes open in famines, not constantly.
"Wagons roll between the X and the Y"; severed alliances get "the
wagons roll no more". Wealth is a real ledger now (towns, gold veins,
trade activity), shown in dossiers, and dragons read it when choosing
victims. Battery: 3-14 routes chronicled per world per 300y.

Balance battery (5 seeds + 2 flavors, 300y each): souls 360-732k,
cultures 16-39, races 4-6/6 (harsh flavors cost more), 82-89% claimed,
chronicle 9-24 lines/yr, wars 1-16 per world. All systems firing:
captives rise and defect, tombs and desecrations, looted artifacts
held as grievances, trade routes opening and severing.

### Roads and the peopled countryside — SHIPPED 2026-08-20

Steve's call: DF maps feel alive because of hamlets, and ROADS. Both
in. Nations lay roads settlement-to-settlement (tree-like out of the
capital); allied capitals whose wagons roll (or whose oath is ten
years old) are bound by wagon roads that hug coastlines around bays.
Roads are sim inputs: armies march faster on them, wagons trade
farther along them, settlers prefer roadside ground so hamlets string
along the roads on their own, and unclaimed roads are swallowed by
grass. Density pass alongside: closer packing, smaller consolidation,
eager splitting. Soaks: 220-420 settlements per world (130-280
hamlets), 1,400-2,800 road cells, races held at 5-6/6 after easing
border pressure for the denser countryside.

### The god's reach (Steve's direction: more involvement, always)

First wave shipped: three verbs that reach into hearts, not just land.
Soothe (grudges cool, feuds unclench, truces form; answers prayers for
peace), Provoke (a whisper of iron between the two greatest peoples in
earshot; spites prayers for peace), Anoint (bless a people's champion
or raise one from nothing; the favor is spent on their next duel or
hunt, and the people know whose hand it was).

Standing audit of watch-only systems, for future verb waves:
- Artifacts: no way to gift, curse, or reveal a lost treasure.
- Yoke: no way to break chains or harden a master's grip.
- Trade: no way to bless a road or blight a route.
- Figures: no way to send a dream (set an ambition), no way to
  lengthen or shorten a life short of area smiting.
- Wars: no way to embolden or dishearten a host in the field.
- Beasts: Unleash exists; no way to becalm or redirect one.
- Weather: warm/cool exist; no storm-calling until the Gaia pass.
Rule for all of them: verbs write into layers the sim already reads,
and the affected know whose hand it was (faith reacts).

### Phase 5: the Gaia pass (SimEarth's loops, made visible and local)

The SimEarth research's top picks. Planet-scale feedback, all landing
as consequences the chronicle can narrate.

- **Global carbon and dust budget**: volcanoes and fires emit, forests
  and jungles drink, global temperature follows. Climate ages become
  emergent consequences instead of scheduled sine waves.
- **Ice caps and sea level**: cold ages expose land bridges (migration
  and invasion routes), warm ages drown coasts. The political map
  redraws itself without a single scripted event.
- **Albedo feedback, done locally** (Daisyworld's lesson): snow
  reflects and cools, dark forest absorbs and warms. Tipping points
  and near-runaways, checked by the carbon loop.
- **Buried biomass**: lush aeons accumulate coal for whoever
  industrializes there someday. Deep time made load-bearing; the
  pre-civilization epochs the player watched start to matter.
- **Plague as a traveling entity** on the fire pattern; **pollution**
  diffusing downwind and downriver once industry exists.

### Phase 6 and beyond

- **MAGIC (Steve's direction)**: the necromancer arc as anchor: a dark
  figure out of a forsaken people (or a "never die" ambition curdling),
  blight on the fire pattern that does not heal while its source lives,
  armies of the dead, a hero's ending, a world that has to heal. Rides
  creatures + figures + fire. Later: archmages, enchanted biomes.
- **Deities that walk the earth**, empowered by forsaken peoples.
- **Tech ladder with stage metabolism**: stone through atomic, each
  stage with an energy source and an externality (industry pollutes
  and emits carbon; atomic makes war existential; nuclear winter
  reuses the ash veil verbatim). National budgets stay hidden
  temperaments, never player micromanagement.
- **Terminal arcs and successor states**: a dead civilization is a
  page turn, never a dead rock. Remnants, rival golden ages, and
  someday machine life. The direct fix for SimEarth's dramaturgy.
- **Monolith verb**: a costly gamble of uplift, SimEarth's homage kept
  (a chance of a development leap, or nothing, or a cargo cult).
- **Storms** riding the wind bands, quakes; **fun biomes**; multi-cell
  settlements; parked: name syllable pools, weather verbs.

### Watch list (soak notes)

- Race viability is volatile: individual seeds can lose a race by y300.
  The cross-race refugee rule helped; keep watching.
- Conquest conduct skews to slaughter since warlike leaders start the
  wars. Coherent, but revisit as conduct gains inputs.
- Chronicle volume runs ~12-30 lines/yr by world size; Steve has
  flagged busyness before. Ages and named wars (phase 1) should help
  by adding structure rather than lines.

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
