# Demiurge (working title)

An ambient god-game sandbox in the spirit of SimEarth. The world
grows on its own and never demands the player's attention. The
player is an overdeity who may poke, prod, bless, or simply watch.

## Design pillars (do not violate these)

1. AMBIENT, NOT MANAGEMENT. The world murmurs, it never tickets
   the player. No alert badges, no task queues, no fail states.
2. POPS, NOT PEOPLE. Mortals are population buckets (culture,
   region, count, needs). Never individual named villagers.
3. SIM INPUTS, NOT SCRIPTED FIXES. Divine actions modify the same
   underlying cell/pop values the sim uses. No special-case
   miracle logic that bypasses the simulation.
4. WATCHING IS PLAYING. Non-intervention must be interesting:
   pops visibly cope, migrate, adapt, and struggle.
5. THE CHRONICLE IS THE SCORE. The world records its history as
   readable events. No point totals in Milestone 1.

## Milestone 1 scope (nothing else gets built until this is fun)

- 128x64 cell grid: elevation, temperature, moisture, fertility
- Climate from latitude + elevation, tunable constants
- Pop buckets with food + safety needs, growth, migration
- Two divine verbs: bless fertility (region), shift temperature (region)
- Plain text event log panel
- Pause / 1x / fast speed controls

## Explicitly out of scope for Milestone 1

Deities, worship, religion, tectonics, oceans/currents, disasters,
individual agents, 3D, sound, save files.

## Stack

TypeScript + Vite, canvas rendering, no game engine, no heavy
dependencies without discussion.
