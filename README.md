# Demiurge

*An ambient god-game where the world lives whether you touch it or not.*

**SimEarth marries Dwarf Fortress legends.** You are an overdeity above a
living world: climate breathes, rivers carve and fail, six races wake and
build and war and pray. You may bless, scorch, drown, heal, smite, raise
mountains, or wake new peoples with a word — or you may simply watch,
because watching is playing.

## The idea

Most god-games eventually become management games: alert badges, task
queues, fail states, a world that stops moving when you stop clicking.
Demiurge is built against that. The world murmurs; it never tickets you.

Five pillars, none negotiable:

1. **Ambient, not management.** No alerts, no quests, no fail states. The
   world asks nothing of its god.
2. **Pops, not people.** Mortals are populations — cultures, settlements,
   migrations — never micromanaged villagers. The rare *named figure*
   (a queen, a hero) persists and matters, but history is made by peoples.
3. **Sim inputs, not scripted fixes.** Every divine verb writes into the
   same layers the simulation reads. A blessing is fertility. Wrath is
   dead souls. A raised mountain range casts a real rain shadow next year,
   because the water cycle is real.
4. **Watching is playing.** Non-intervention is interesting: peoples cope,
   adapt, migrate, schism, feud, and endure — visibly, on their own.
5. **The chronicle is the score.** The world writes its own history as
   readable events. There are no points. The story is the reward.

## What lives in the world today

- **A breathing planet** — wind-band water cycle, orographic rain and rain
  shadows, rivers that recarve their courses as climate shifts, warm ages
  and cold ages, coasts that feed, ore veins in the high country.
- **Six races** — humans, dwarves, elves, orcs, goblins, gnomes — each with
  its own biome affinities, growth, battle temper, plague resistance, and
  leader lifespans. Dwarves wake among peaks and eat from their mines;
  elves run boom-or-bust forest realms under leaders who reign for
  centuries; goblins swarm and are culled. Every race can dominate a
  world; every race can vanish from one.
- **Cultures with inner lives** — they adapt to their homes, schism into
  daughter peoples, consolidate camps into towns and cities, remember
  wars as grudges that become vendettas, and *want things*: they pray for
  harvests, warmth, deliverance — and dream of distant lands, covet a
  rival's valleys, sink shafts after ore.
- **A god they react to** — answer prayers and faith rises until they
  raise standing stones. Mock them (freeze the people begging for warmth)
  and their faith curdles until their fires burn to darker powers. Ignore
  them entirely and they harden into stoics who expect nothing from the
  heavens — and endure. Every path is a story; none is a fail state.
- **Borders** — land held, not merely worked. Influence radiates from
  settlements; realms have shapes, frontiers churn, expansion respects
  dominion. The chronicle notices when one people presses into another's
  lands.
- **Named figures** — leaders whose temperaments steer their peoples'
  dice, heroes who shield their armies, all of whom age, fall, and are
  succeeded. Their deaths are history, not flavor.
- **Genesis in your hands** — choose from generated worlds, begin one
  silent and wake its peoples yourself, sculpt its mountains and seas
  while the hydrology answers.
- **A chronicle** that filters to your altitude: watch seasons and hear
  local color; watch decades and see only the big beats; follow one
  people and read their whole saga.

Rendered as a page of living ASCII (Dwarf Fortress sends its regards),
with a tile mode and debug overlays for temperature, moisture, fertility,
and wind.

## Where it's going

In rough order: **nations** (named polities, governments, alliances,
provinces and states) → **actual war** (conquest and occupation, refugees,
ruins and reclamation of ancestral lands) → **disasters** (volcanoes,
meteors, spreading fires — all landscape-first) → **deities that walk the
earth**, empowered by peoples the player-god forsook → biomes fun and
strange (evil, good, wild) → a long tech ladder, SimEarth-style, from
first fires toward the stars.

## Running it

```
npm install
npm run dev
```

TypeScript + Vite + raw canvas. Zero runtime dependencies. Every world is
seeded — pin one with `?seed=12345` to return to it; add `&quiet=1` for a
world that sleeps until you wake its peoples yourself.

## License

All rights reserved — see [LICENSE](LICENSE). The source is public to
read and run locally, but this is not (yet) an open-source project: no
copies, forks-for-release, or derivative games without permission.

---

*Built by Steve Burns, with Claude as sim-engineering partner.*
