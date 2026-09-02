import { spawnBeast } from "./beasts";
import * as C from "./constants";
import { personName } from "./names";
import { nearRoad } from "./roads";
import type { Beast, BeastKind, Figure, Pop, World } from "./world";
import { biomeIdAt, describeLocation, heroOf, idx, isWater, logEvent, mintFigure, recordKill } from "./world";

// --- The menagerie. Lesser beasts: noteworthy, not world-ending. They live
// closer to the towns than giants do, there are more of them, and each has
// its own mischief hooked into a system the world already runs: wolves
// take the hamlets in winter, wyverns take the herds, basilisks breed
// pestilence, hydras grow when a hunt fails, ogres carry off children,
// griffins steal named treasures, barrow-wights haunt ruins and hold back
// homecomings, sea serpents empty the fisheries, manticores harry roads
// and marching hosts. Heroes ride against them readily, and a nation with
// no hero can send hunters: the one who strikes the killing blow is a
// hero after. That is where most of a world's champions will come from. ---

export const LESSER = new Set<BeastKind>(["wolves", "wyvern", "basilisk", "hydra", "ogre", "griffin", "wight", "serpent", "manticore"]);

export const LESSER_NOUN: Partial<Record<BeastKind, string>> = {
  wolves: "wolf pack",
  wyvern: "wyvern",
  basilisk: "basilisk",
  hydra: "hydra",
  ogre: "ogre",
  griffin: "griffin",
  wight: "barrow-wight",
  serpent: "sea serpent",
  manticore: "manticore",
};

// Where each kind lairs, as a cell predicate over the living biome map
const HABITAT: Partial<Record<BeastKind, (world: World, i: number) => boolean>> = {
  wolves: (w, i) => [5, 6, 9, 12].includes(biomeIdAt(w, i)),
  wyvern: (w, i) => biomeIdAt(w, i) === 3 || biomeIdAt(w, i) === 4,
  basilisk: (w, i) => biomeIdAt(w, i) === 11 || (biomeIdAt(w, i) === 12 && w.moisture[i] > 0.6 && w.meanTemperature[i] > 16),
  hydra: (w, i) => w.elevation[i] >= C.SEA_LEVEL && !w.lakes[i] && (w.isRiver[i] === 1 || w.lakes[i - 1] === 1 || w.lakes[i + 1] === 1 || w.lakes[i - w.width] === 1 || w.lakes[i + w.width] === 1),
  ogre: (w, i) => w.elevation[i] > 0.5 && w.elevation[i] < C.MOUNTAIN_ROCK_START && [4, 9, 10, 12, 13].includes(biomeIdAt(w, i)),
  griffin: (w, i) => biomeIdAt(w, i) === 3 || biomeIdAt(w, i) === 4,
  serpent: (w, i) => biomeIdAt(w, i) === 1, // coastal waters
  // Manticores are roadwardens: dry country, or anywhere a road runs
  manticore: (w, i) => biomeIdAt(w, i) === 7 || biomeIdAt(w, i) === 10 || (w.elevation[i] >= C.SEA_LEVEL && !w.lakes[i] && nearRoad(w, i % w.width, Math.floor(i / w.width))),
};

const SPAWN_WEIGHT: Partial<Record<BeastKind, number>> = {
  wolves: 3,
  ogre: 2,
  wyvern: 1.5,
  manticore: 1.5,
  basilisk: 1,
  hydra: 1,
  griffin: 1,
  serpent: 1,
};

function habitatSpot(world: World, kind: BeastKind, tries = 80): { x: number; y: number } | null {
  const pred = HABITAT[kind];
  if (!pred) return null;
  for (let t = 0; t < tries; t++) {
    const x = 2 + Math.floor(world.rng() * (world.width - 4));
    const y = 2 + Math.floor(world.rng() * (world.height - 4));
    const i = idx(world, x, y);
    if (!pred(world, i)) continue;
    let nearest = Infinity;
    for (const p of world.pops) nearest = Math.min(nearest, Math.max(Math.abs(p.x - x), Math.abs(p.y - y)));
    if (nearest < C.LESSER_MIN_DIST) continue;
    if (nearest > C.BEAST_WILDERNESS + 6) continue; // deep wilderness belongs to the giants; these want neighbors
    return { x, y };
  }
  return null;
}

const ARRIVALS: Partial<Record<BeastKind, (b: Beast, where: string) => string>> = {
  wolves: (b, where) => `${b.name} is heard at night in ${where}; the herders bring the flocks in early.`,
  wyvern: (b, where) => `A lean drake, ${b.name}, takes a crag above ${where} and watches the herds.`,
  basilisk: (b, where) => `Something with a fever-eye lairs in the marshes of ${where}: ${b.name}, the herders say, and they stop going that way.`,
  hydra: (b, where) => `The fords of ${where} are not safe: ${b.name} lies in the reeds there, and it has more than one mouth.`,
  ogre: (b, where) => `${b.name}, an ogre, comes down into ${where}; the villages bar their doors at dusk.`,
  griffin: (b, where) => `A griffin, ${b.name}, makes its eyrie on the heights above ${where}, and it likes bright things.`,
  serpent: (b, where) => `The fishers of ${where} come back with their nets torn: ${b.name} is in the water.`,
  manticore: (b, where) => `${b.name} takes up its watch by the road through ${where}; travelers go by in companies now.`,
};

// Yearly: the menagerie fills in around the towns. Barrow-wights are the
// exception: they rise where the dead lie, and readiest under strangers' roofs.
export function lesserSpawnTick(world: World): void {
  const count = world.beasts.filter((b) => b.alive && LESSER.has(b.kind)).length;
  if (count >= C.LESSER_CAP) return;
  // Wights first: a ruin that strangers have built on calls its dead up
  if (world.pops.length) {
    for (const ruin of world.ruins.values()) {
      if (ruin.tier < 2) continue;
      if (world.beasts.some((b) => b.alive && b.kind === "wight" && Math.max(Math.abs(b.lairX - ruin.x), Math.abs(b.lairY - ruin.y)) <= 1)) continue;
      const chance = 0.01 * (ruin.desecrated ? C.WIGHT_DESECRATED_MULT : 1);
      if (world.rng() >= chance) continue;
      const wight = spawnBeast(world, "wight", ruin.x, ruin.y, true);
      logEvent(
        world,
        ruin.desecrated
          ? `The dead of the ${ruin.culture} do not rest under strangers' roofs: ${wight.name} walks the old stones of ${describeLocation(world, ruin.x, ruin.y)} by night.`
          : `In the ruins of the ${ruin.culture} in ${describeLocation(world, ruin.x, ruin.y)}, something that was buried gets up: ${wight.name}.`,
        2,
        { subjects: [ruin.culture], at: { x: ruin.x, y: ruin.y } },
      );
      return;
    }
  }
  if (world.rng() >= C.LESSER_SPAWN_CHANCE) return;
  let total = 0;
  for (const w of Object.values(SPAWN_WEIGHT)) total += w;
  let roll = world.rng() * total;
  let kind: BeastKind = "wolves";
  for (const [k, w] of Object.entries(SPAWN_WEIGHT) as [BeastKind, number][]) {
    roll -= w;
    if (roll <= 0) {
      kind = k;
      break;
    }
  }
  const spot = habitatSpot(world, kind);
  if (!spot) return;
  const beast = spawnBeast(world, kind, spot.x, spot.y, true);
  logEvent(world, ARRIVALS[kind]!(beast, describeLocation(world, spot.x, spot.y)), 2, { at: spot });
}

export function wightNear(world: World, x: number, y: number): boolean {
  return world.beasts.some((b) => b.alive && b.kind === "wight" && Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) <= 1);
}

function nearRiver(world: World, p: Pop): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;
      const i = idx(world, x, y);
      if (world.isRiver[i] || world.lakes[i]) return true;
    }
  }
  return false;
}

function raidLine(beast: Beast, pop: Pop, where: string, loss: number): string {
  const n = loss.toLocaleString("en-US");
  switch (beast.kind) {
    case "wolves":
      return `${beast.name} come down on the ${pop.culture} of ${where} in the snow; ${n} souls are not found in the morning.`;
    case "wyvern":
      return `${beast.name} stoops on the ${pop.culture} of ${where} and takes the herds; ${n} souls die defending them.`;
    case "hydra":
      return `${beast.name} comes up out of the water at ${where}; ${n} of the ${pop.culture} are dragged under.`;
    case "ogre":
      return `${beast.name} breaks the doors of the ${pop.culture} in ${where}; ${n} souls are taken.`;
    case "griffin":
      return `${beast.name} falls on the ${pop.culture} of ${where} out of the sun; ${n} souls are carried off.`;
    case "wight":
      return `The dead walk in ${where}: ${beast.name} comes among the ${pop.culture} by night, and ${n} do not wake.`;
    case "serpent":
      return `${beast.name} takes the boats of the ${pop.culture} off ${where}; ${n} souls go down with them.`;
    case "manticore":
      return `${beast.name} takes travelers on the road through ${where}; ${n} of the ${pop.culture} are found in pieces.`;
    default:
      return `${beast.name} falls upon the ${pop.culture} of ${where}; ${n} souls are taken.`;
  }
}

// Each season: a lesser beast roams within its habitat, raids what it
// prefers, and does its particular mischief
export function lesserBehavior(world: World, beast: Beast): void {
  // Roam: wights hold their barrow; serpents keep to the water; the rest walk the land
  if (beast.kind !== "wight") {
    const dx = Math.floor(world.rng() * 3) - 1;
    const dy = Math.floor(world.rng() * 3) - 1;
    const nx = beast.x + dx;
    const ny = beast.y + dy;
    if (nx >= 1 && nx < world.width - 1 && ny >= 1 && ny < world.height - 1 && Math.max(Math.abs(nx - beast.lairX), Math.abs(ny - beast.lairY)) <= C.LESSER_ROAM) {
      const water = isWater(world, nx, ny);
      if (beast.kind === "serpent" ? water : !water) {
        beast.x = nx;
        beast.y = ny;
      }
    }
  }
  // Civilization at the lair: the lesser withdraw too, but not far
  if (beast.kind !== "wight" && world.territory[idx(world, beast.lairX, beast.lairY)] !== 0 && world.rng() < 0.08) {
    const spot = habitatSpot(world, beast.kind, 40);
    if (spot) {
      beast.lairX = spot.x;
      beast.lairY = spot.y;
      beast.x = spot.x;
      beast.y = spot.y;
      return;
    }
  }

  const R = C.BEAST_RAID_RADIUS[beast.kind];
  let prey = world.pops.filter((p) => !p.target && Math.max(Math.abs(p.x - beast.x), Math.abs(p.y - beast.y)) <= R);

  // Basilisks do not raid; they breed sickness in the marsh air
  if (beast.kind === "basilisk") {
    if (!prey.length || world.rng() >= C.BASILISK_PLAGUE_CHANCE) return;
    const victim = prey.filter((p) => p.plagueSeasons === 0).sort((a, b) => b.count - a.count)[0];
    if (!victim) return;
    victim.plagueSeasons = C.BASILISK_PLAGUE_SEASONS;
    const last = world.beastLog.get(beast.id);
    if (last === undefined || world.year - last >= C.BEAST_LOG_YEARS) {
      world.beastLog.set(beast.id, world.year);
      logEvent(world, `A sickness comes out of the marsh where ${beast.name} lairs, and the ${victim.culture} of ${describeLocation(world, victim.x, victim.y)} take to their beds.`, 2, {
        subjects: [victim.culture],
        at: { x: victim.x, y: victim.y },
      });
    }
    beast.kills += 1; // enough to be hunted for
    return;
  }

  // Griffins covet: once a year they may carry a named treasure off to the eyrie
  if (beast.kind === "griffin" && world.season === 0 && beast.hoard === null && world.rng() < C.GRIFFIN_THEFT_CHANCE) {
    const near = new Set(world.pops.filter((p) => Math.max(Math.abs(p.x - beast.x), Math.abs(p.y - beast.y)) <= R + 2).map((p) => p.culture));
    const art = world.artifacts.find((a) => a.holder !== null && near.has(a.holder));
    if (art) {
      const from = art.holder!;
      art.holder = null;
      art.lostAt = { x: beast.lairX, y: beast.lairY };
      art.provenance.push({ year: world.year, note: `carried off to the eyrie of ${beast.name}` });
      beast.hoard = art.id;
      beast.kills += 1;
      logEvent(world, `${beast.name} comes down on the halls of the ${from} and carries ${art.name} off to its eyrie above ${describeLocation(world, beast.lairX, beast.lairY)}.`, 3, {
        subjects: [from],
        at: { x: beast.lairX, y: beast.lairY },
      });
      return;
    }
  }

  // Sea serpents empty the fisheries around them, raid or no raid
  if (beast.kind === "serpent") {
    for (let y = Math.max(0, beast.y - 3); y <= Math.min(world.height - 1, beast.y + 3); y++) {
      for (let x = Math.max(0, beast.x - 3); x <= Math.min(world.width - 1, beast.x + 3); x++) {
        const i = idx(world, x, y);
        if (world.coastal[i]) world.fertilityBonus[i] = Math.max(-0.3, world.fertilityBonus[i] - C.SERPENT_FISHERY_LOSS);
      }
    }
    prey = prey.filter((p) => world.coastal[idx(world, p.x, p.y)]);
  }

  // What each kind prefers to raid
  if (beast.kind === "wolves") prey = prey.filter((p) => p.tier <= 1);
  if (beast.kind === "manticore" && prey.some((p) => nearRoad(world, p.x, p.y))) prey = prey.filter((p) => nearRoad(world, p.x, p.y));
  if (beast.kind === "hydra" && prey.some((p) => nearRiver(world, p))) prey = prey.filter((p) => nearRiver(world, p));
  if (beast.kind === "wight") prey = prey.filter((p) => Math.max(Math.abs(p.x - beast.lairX), Math.abs(p.y - beast.lairY)) <= 2);
  if (!prey.length) return;

  let chance = C.LESSER_RAID_CHANCE;
  if (beast.kind === "wolves") chance *= world.season === 3 ? C.WOLF_WINTER_MULT : 0.6;
  if (world.rng() >= chance) return;

  const pop = prey.sort((a, b) => b.count - a.count)[0];
  const guarded = heroOf(world, pop.culture)?.nature === "angel" ? C.ANGEL_SHIELD : 1;
  const loss = Math.min(Math.round(pop.count * C.LESSER_RAID_FRACTION * guarded), Math.round(beast.power * 0.5));
  pop.count -= loss;
  beast.kills += loss;
  beast.power += Math.round(loss * C.BEAST_FEED);
  const where = describeLocation(world, pop.x, pop.y);

  if (beast.kind === "wyvern") {
    // The herds are the point: the fields around go lean
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = pop.x + dx;
        const y = pop.y + dy;
        if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;
        world.fertilityBonus[idx(world, x, y)] -= C.WYVERN_HERD_LOSS;
      }
    }
  }
  if (beast.kind === "ogre" && !beast.hostage && world.rng() < C.OGRE_HOSTAGE_CHANCE) {
    beast.hostage = { name: personName(world.rng), culture: pop.culture };
    logEvent(world, `${beast.name} carries a child of the ${pop.culture} off into the hills: ${beast.hostage.name}, whom the village will not stop speaking of.`, 2, {
      subjects: [pop.culture],
      at: { x: pop.x, y: pop.y },
    });
  }

  const last = world.beastLog.get(beast.id);
  if (last === undefined || world.year - last >= C.BEAST_LOG_YEARS) {
    const first = last === undefined;
    world.beastLog.set(beast.id, world.year);
    logEvent(world, raidLine(beast, pop, where, loss), first ? 2 : 1, { subjects: [pop.culture], at: { x: pop.x, y: pop.y } });
  }
}

// A hero slays a lesser beast: hostages come home, treasures come down
// from the eyrie (into the slayer's hands, whoever made them)
export function lesserHuntWon(world: World, beast: Beast, hero: Figure): void {
  if (beast.hostage) {
    logEvent(world, `${hero.name} brings ${beast.hostage.name} home to the ${beast.hostage.culture} out of the lair of ${beast.name}, thin but living.`, 3, {
      subjects: [hero.culture, beast.hostage.culture],
      at: { x: beast.x, y: beast.y },
    });
    beast.hostage = null;
  }
  if (beast.hoard !== null) {
    const art = world.artifacts.find((a) => a.id === beast.hoard);
    if (art && art.holder === null) {
      art.holder = hero.culture;
      art.lostAt = null;
      art.provenance.push({ year: world.year, note: `brought down from the eyrie of ${beast.name} by ${hero.name} of the ${hero.culture}` });
      logEvent(
        world,
        art.maker === hero.culture
          ? `${hero.name} brings ${art.name} down from the eyrie of ${beast.name}; it returns to the ${hero.culture}.`
          : `${hero.name} brings ${art.name} down from the eyrie of ${beast.name}, and the ${hero.culture} keep it; its makers, the ${art.maker}, hear of it.`,
        3,
        { subjects: [hero.culture, art.maker], at: { x: beast.lairX, y: beast.lairY } },
      );
    }
    beast.hoard = null;
  }
  if (beast.kind === "wight") {
    logEvent(world, `With ${beast.name} laid to rest, the old stones of ${describeLocation(world, beast.lairX, beast.lairY)} are quiet again.`, 1, {
      at: { x: beast.lairX, y: beast.lairY },
    });
  }
}

// A hunt fails: some beasts come out of it worse for the hunter
export function lesserHuntLost(world: World, beast: Beast): void {
  if (beast.kind === "hydra") {
    beast.power = Math.round(beast.power * C.HYDRA_REGROW);
    logEvent(world, `Where ${beast.name} was cut, two heads grow.`, 2, { at: { x: beast.x, y: beast.y } });
  }
}

// Yearly: a nation without a hero, raided by a lesser beast, sends hunters.
// Run it to ground and the one who struck the killing blow is a hero after;
// fail, and the hunters do not come back, and the beast eats well.
export function nationHunts(world: World): void {
  for (const beast of world.beasts) {
    if (!beast.alive || !LESSER.has(beast.kind) || beast.kills <= 0) continue;
    const R = C.BEAST_RAID_RADIUS[beast.kind] + 2;
    const raided = world.pops.filter((p) => !p.target && Math.max(Math.abs(p.x - beast.x), Math.abs(p.y - beast.y)) <= R);
    const candidates = new Map<string, Pop>();
    for (const p of raided) {
      const c = world.cultures.get(p.culture);
      if (!c?.polity || heroOf(world, p.culture)) continue;
      const cur = candidates.get(p.culture);
      if (!cur || p.count > cur.count) candidates.set(p.culture, p);
    }
    if (!candidates.size || world.rng() >= C.NATION_HUNT_CHANCE) continue;
    const [name, seat] = [...candidates.entries()][Math.floor(world.rng() * candidates.size)];
    const where = describeLocation(world, beast.x, beast.y);
    const zeal = world.cultures.get(name)!.creed?.aspect === "war" || world.cultures.get(name)!.creed?.aspect === "wrath" ? 0.15 : 0;
    if (world.rng() < C.NATION_HUNT_WIN + zeal) {
      beast.alive = false;
      const hero = mintFigure(world, name, "hero");
      logEvent(world, `Hunters of the ${name} run ${beast.name} to ground in ${where}. ${hero.name}, who struck the killing blow, is named champion of their people.`, 3, {
        subjects: [name],
        at: { x: beast.x, y: beast.y },
      });
      recordKill(world, hero, beast.kind === "wolves" ? beast.name : `${beast.name} the ${LESSER_NOUN[beast.kind]}`);
      lesserHuntWon(world, beast, hero);
    } else {
      seat.count -= Math.round(seat.count * C.NATION_HUNT_LOSS);
      beast.power += Math.round(beast.power * 0.1);
      logEvent(world, `Hunters of the ${name} go out after ${beast.name} in ${where}, and do not come back.`, 2, {
        subjects: [name],
        at: { x: beast.x, y: beast.y },
      });
    }
  }
}

