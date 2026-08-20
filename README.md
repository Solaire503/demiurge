# Demiurge

*An ambient god-game where the world keeps living whether you touch it or not.*

The pitch: SimEarth crossed with Dwarf Fortress legends. You're an overdeity
looking down on a living world. Climate shifts, rivers carve and dry up, six
races wake, build, fight, and pray. You can bless, scorch, drown, heal, smite,
raise mountains, or wake new peoples with a word. Or you can just watch,
because watching is the game too.

## The idea

Most god-games turn into management games sooner or later: alert badges, task
queues, fail states, a world that freezes when you stop clicking. Demiurge is
built against that. The world hums along on its own and never asks you for
anything.

Five pillars, none negotiable:

1. **Ambient, not management.** No alerts, no quests, no fail states. The
   world asks nothing of its god.
2. **Pops, not people.** Mortals are populations: cultures, settlements,
   migrations. Never micromanaged villagers. The rare named figure (a queen,
   a hero) persists and matters, but history is made by peoples.
3. **Sim inputs, not scripted fixes.** Every divine verb writes into the same
   layers the simulation reads. A blessing is fertility. Wrath is dead souls.
   Raise a mountain range and it casts a real rain shadow next year, because
   the water cycle is real.
4. **Watching is playing.** Peoples cope, adapt, migrate, schism, feud, and
   endure on their own, visibly.
5. **The chronicle is the score.** The world writes its own history as
   readable events. There are no points. The story is the reward.

## What's in the world right now

- **A breathing planet.** Wind-band water cycle, rain shadows behind the
  mountains, rivers that redraw their courses as the climate shifts, warm
  ages and cold ages, coasts that feed, ore veins in the high country.
- **Six races.** Humans, dwarves, elves, orcs, goblins, and gnomes, each with
  their own biome affinities, growth rates, battle temper, plague resistance,
  and leader lifespans. Dwarves wake among the peaks and eat from their
  mines. Elves run boom-or-bust forest realms under leaders who reign for
  centuries. Goblins swarm and get culled. Any race can dominate a world,
  and any race can vanish from one.
- **Cultures with inner lives.** They adapt to their homes, schism into
  daughter peoples, gather camps into towns and cities, hold grudges that
  turn into vendettas, and want things: harvests, warmth, deliverance,
  distant lands, a rival's valleys, the ore under the mountain.
- **A god they react to.** Answer prayers and faith grows until they raise
  standing stones. Mock them (freeze the people praying for warmth) and
  their faith curdles until their fires burn to darker powers. Ignore them
  and they harden into stoics who expect nothing from the heavens and endure
  anyway. Every path is a story. None of them is a fail state.
- **Nations.** Cultures that grow big enough proclaim named polities, with
  government flavor set by their founder: warbands and hordes, councils and
  commonwealths, principalities and empires, compacts and leagues. Rank has
  to be earned with size, land, and years. Nations swear alliances, and
  their names sit right on the map over their capitals.
- **War.** Declared wars fought by hosts levied out of real settlement
  populations, so a long war visibly hollows out the homeland. Allies march
  in beside their sworn friends while a war is young. Armies meet at
  fronts, towns fall and change hands instead of being erased, and refugees
  run for their kin.
- **The memory of nations.** Every war, sack, slaughter, and enslavement is
  a recorded deed with its own half-life. Nations declare vengeance wars
  over wounds their grandparents took, refuse alliances across unforgotten
  history, and conquer according to who their leader is: the warlike put
  towns to the sword, the cunning take thralls, the peaceable rule gently.
  Conquered peoples wear the yoke without accepting it: given a distracted
  master they revolt, and a revolt can raise a fallen people's banner back
  from extinction.
- **Races with personalities, not just stats.** Orc leaders come up warlike
  and the whole tribe marches. Humans dream of empire. Elves are ancient:
  wounds done to them outlive the doer's dynasty, and burned land heals
  fast under their care. Dwarves keep their oaths and their grudges.
  Goblins tire of any oath, even to kin. Gnomes want no part of your war.
- **Disasters.** Fire spreads on its own, eats by biome, and burns out into
  char that heals into ash-fattened soil. Dry lightning kindles wildfires;
  old peaks erupt on their own. The god can raise a volcano or call down a
  meteor, and a meteor crater fills into a lake, because the hydrology is
  real.
- **Ruins.** Dead settlements leave their bones on the map for centuries.
  Descendants drift back and raise the old stones anew; strangers who
  build on another people's dead are not forgiven.
- **Named figures.** Leaders whose temperaments steer their people's dice,
  heroes who shield their armies. They age, fall, and get succeeded, and
  their deaths are history, not flavor.
- **A browsable world.** Tabbed sidebar: the chronicle, a nations panel
  where every people has a dossier (leader, bonds, wars, grudges, and what
  they remember), a wars panel with every host afield, and a figures panel
  of the living names. Every name anywhere is a link.
- **Seven flavors of world at genesis.** Temperate, scorched, frozen,
  sodden, parched, island seas, one great land.
- **Genesis in your hands.** Pick from generated worlds, start one silent
  and wake its peoples yourself, sculpt mountains and seas and watch the
  hydrology settle around what you did.
- **A chronicle that filters to your altitude.** Watch seasons and get local
  color. Watch decades and only the big beats surface. Follow one people and
  read their whole saga.

Rendered as a page of living ASCII (Dwarf Fortress says hi), with a tile
mode and overlays for temperature, moisture, fertility, and wind.

## Where it's going

In rough order: **mythical creatures** (common beasts in the deep wilds,
rare dragons with hoards and dragonfear, procedurally generated forgotten
beasts drawn to forsaken lands), **magic** (the necromancer arc: a dark
figure out of a forsaken people, spreading blight, armies of the dead, a
hero's ending, a world that has to heal), deities that walk the earth,
strange biomes, trade and economy, and eventually a long SimEarth-style
tech ladder from first fires to the stars. See [ROADMAP.md](ROADMAP.md)
for the full picture.

## Running it

```
npm install
npm run dev
```

TypeScript + Vite + raw canvas, zero runtime dependencies. Worlds are
seeded: `?seed=12345` pins the terrain, and every load rolls a fresh history
onto it. Add `&run=M` (the number is shown in the page title) to replay one
history exactly, or `&quiet=1` for a world that sleeps until you wake its
peoples yourself.

## License

All rights reserved, see [LICENSE](LICENSE). The source is public to read
and run locally, but this is not (yet) an open-source project: no copies,
forks-for-release, or derivative games without permission.

---

*Built by Steve Burns, with Claude as sim-engineering partner.*
