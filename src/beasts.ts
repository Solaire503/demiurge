import * as C from "./constants";
import { beastName, forgottenDesc } from "./names";
import { ignite } from "./disasters";
import type { Beast, BeastKind, Pop, World } from "./world";
import {
  describeLocation,
  heroOf,
  idx,
  isWater,
  logEvent,
  mintFigure,
  recordKill,
} from "./world";

// --- The third force. Beasts are Figures with bodies: named, persistent,
// their deaths are history. Fear rides the same pressure machinery borders
// use; raids use battle losses; dragonfire is the fire system; slaying one
// goes on a hero's kill-ledger and can remake a nobody into a name.

function kindPhrase(beast: Beast): string {
  if (beast.kind === "forgotten") return `${beast.name}, ${beast.desc}`;
  return `${beast.name} the ${beast.kind}`;
}

// Deep wilderness: land, far from every settlement
function wildSpot(world: World, tries = 60, minDist = C.BEAST_WILDERNESS): { x: number; y: number } | null {
  for (let t = 0; t < tries; t++) {
    const x = 2 + Math.floor(world.rng() * (world.width - 4));
    const y = 2 + Math.floor(world.rng() * (world.height - 4));
    if (isWater(world, x, y)) continue;
    if (world.pops.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) < minDist)) continue;
    return { x, y };
  }
  return null;
}

function spawnBeast(world: World, kind: BeastKind, x: number, y: number, announce: boolean): Beast {
  const beast: Beast = {
    id: world.nextBeastId++,
    kind,
    name: kind === "forgotten" ? beastName(world.rng, "giant").split(" ")[0] : beastName(world.rng, kind),
    desc: kind === "forgotten" ? forgottenDesc(world.rng) : null,
    x,
    y,
    lairX: x,
    lairY: y,
    power: C.BEAST_POWER[kind],
    kills: 0,
    born: world.year,
    alive: true,
  };
  world.beasts.push(beast);
  if (announce) {
    const where = describeLocation(world, x, y);
    logEvent(
      world,
      kind === "dragon"
        ? `A shadow crosses the peaks: the dragon ${beast.name} has come to roost in ${where}.`
        : kind === "forgotten"
          ? `Out of the deep places comes ${beast.name}: ${beast.desc}. The world has no name for what walks in ${where}.`
          : `Word spreads of ${beast.name}, a ${kind} haunting ${where}.`,
      kind === "giant" || kind === "troll" ? 2 : 3,
      { at: { x, y } },
    );
  }
  return beast;
}

// Genesis: the wilds are not empty when the peoples wake
export function seedBeasts(world: World): void {
  for (let n = 0; n < C.BEAST_GENESIS; n++) {
    const spot = wildSpot(world);
    if (!spot) return;
    spawnBeast(world, world.rng() < 0.5 ? "giant" : "troll", spot.x, spot.y, false);
  }
}

// The Unleash verb: a beast rises where the god points
export function unleashBeast(world: World, kind: BeastKind, x: number, y: number): Beast | null {
  if (isWater(world, x, y)) return null;
  const beast = spawnBeast(world, kind, x, y, false);
  if (kind === "dragon") world.dragonsBorn++;
  logEvent(world, `At your word, ${kindPhrase(beast)} rises in ${describeLocation(world, x, y)}.`, 3, {
    at: { x, y },
  });
  return beast;
}

// A dragon seeks high country near gold; failing that, any high country
function dragonRoost(world: World): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = 0;
  for (let t = 0; t < 80; t++) {
    const x = 2 + Math.floor(world.rng() * (world.width - 4));
    const y = 2 + Math.floor(world.rng() * (world.height - 4));
    const i = idx(world, x, y);
    if (world.elevation[i] < 0.7) continue;
    let gold = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= world.width || ny < 0 || ny >= world.height) continue;
        if (world.resources[ny * world.width + nx] >= 3) gold++;
      }
    }
    const score = world.elevation[i] + gold * 0.5 + world.rng() * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

// The god's wrath can break a beast — smite, meteor, volcano all call this
export function smiteBeasts(world: World, cx: number, cy: number, radius: number, damage: number): boolean {
  let broke = false;
  for (const beast of world.beasts) {
    if (!beast.alive || Math.max(Math.abs(beast.x - cx), Math.abs(beast.y - cy)) > radius) continue;
    beast.power -= damage;
    if (beast.power <= 0) {
      beast.alive = false;
      broke = true;
      logEvent(world, `Your wrath breaks ${kindPhrase(beast)}; the land is quit of it.`, 3, {
        at: { x: beast.x, y: beast.y },
      });
    }
  }
  return broke;
}

// A raid on a heroless people can raise a hero out of the fight — the
// promotion trick: history chooses its actors at the moment of need
function maybeRaiseHero(world: World, pop: Pop, beast: Beast): void {
  if (heroOf(world, pop.culture)) return;
  if (world.rng() >= C.HERO_RISES_CHANCE) return;
  const hero = mintFigure(world, pop.culture, "hero");
  logEvent(world, `In the ruin of ${beast.name}'s coming, ${hero.name} of the ${pop.culture} takes up arms.`, 2, {
    subjects: [pop.culture],
    at: { x: pop.x, y: pop.y },
  });
}

function raid(world: World, beast: Beast, pop: Pop): void {
  const loss = Math.min(Math.round(pop.count * C.BEAST_RAID_FRACTION), Math.round(beast.power * 0.8));
  pop.count -= loss;
  beast.kills += loss;
  beast.power += Math.round(loss * C.BEAST_FEED);
  // Dragonfire: the raid is also an ignition — the fire system takes it from here
  if (beast.kind === "dragon") {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = pop.x + dx;
        const ny = pop.y + dy;
        if (nx < 0 || nx >= world.width || ny < 0 || ny >= world.height) continue;
        ignite(world, ny * world.width + nx);
      }
    }
  }
  const last = world.beastLog.get(beast.id);
  if (last === undefined || world.year - last >= C.BEAST_LOG_YEARS) {
    world.beastLog.set(beast.id, world.year);
    logEvent(
      world,
      beast.kind === "dragon"
        ? `${beast.name} descends in fire upon the ${pop.culture} of ${describeLocation(world, pop.x, pop.y)}; ${loss.toLocaleString("en-US")} souls burn.`
        : `${beast.name} falls upon the ${pop.culture} of ${describeLocation(world, pop.x, pop.y)}; ${loss.toLocaleString("en-US")} souls are taken.`,
      2,
      { subjects: [pop.culture], at: { x: pop.x, y: pop.y } },
    );
  }
  maybeRaiseHero(world, pop, beast);
}

// A hero rides out against the beast: renown or a grave
function hunt(world: World, beast: Beast, pop: Pop): void {
  const hero = heroOf(world, pop.culture);
  if (!hero) return;
  const where = describeLocation(world, beast.x, beast.y);
  if (world.rng() < C.HUNT_WIN[beast.kind]) {
    beast.alive = false;
    logEvent(
      world,
      `${hero.name} of the ${pop.culture} slays ${kindPhrase(beast)} in ${where}; the deed will be sung for generations.`,
      3,
      { subjects: [pop.culture], at: { x: beast.x, y: beast.y } },
    );
    recordKill(world, hero, kindPhrase(beast));
    if (beast.kind === "dragon") {
      // The hoard comes home in a hundred wagons — wealth becomes plenty
      const seat = world.pops.filter((p) => p.culture === pop.culture).sort((a, b) => b.count - a.count)[0];
      if (seat) {
        const R = 3;
        for (let y = Math.max(0, seat.y - R); y <= Math.min(world.height - 1, seat.y + R); y++) {
          for (let x = Math.max(0, seat.x - R); x <= Math.min(world.width - 1, seat.x + R); x++) {
            world.fertilityBonus[idx(world, x, y)] += 0.25 * (1 - Math.hypot(x - seat.x, y - seat.y) / (R + 1));
          }
        }
        logEvent(world, `The hoard of ${beast.name} is carried home in a hundred wagons; the ${pop.culture} enter a golden age.`, 3, {
          subjects: [pop.culture],
          at: { x: seat.x, y: seat.y },
        });
      }
    }
  } else {
    hero.alive = false;
    logEvent(world, `${beast.name} breaks ${hero.name} of the ${pop.culture} in ${where}; the songs end where the bones lie.`, 3, {
      subjects: [pop.culture],
      at: { x: beast.x, y: beast.y },
    });
  }
}

// Each season: beasts roam, raid, are hunted; each year the wilds may birth
// more, dragons come to roost, and forsaken fires may call up worse
export function beastsTick(world: World): void {
  if (world.season === 0) {
    const commons = world.beasts.filter((b) => b.alive && (b.kind === "giant" || b.kind === "troll")).length;
    if (commons < C.BEAST_CAP && world.rng() < C.BEAST_SPAWN_CHANCE) {
      const spot = wildSpot(world);
      if (spot) spawnBeast(world, world.rng() < 0.5 ? "giant" : "troll", spot.x, spot.y, true);
    }
    if (world.dragonsBorn < C.DRAGON_MAX && world.rng() < C.DRAGON_CHANCE) {
      const roost = dragonRoost(world);
      if (roost) {
        world.dragonsBorn++;
        spawnBeast(world, "dragon", roost.x, roost.y, true);
      }
    }
    if (!world.beasts.some((b) => b.alive && b.kind === "forgotten")) {
      const forsaken = [...world.cultures.values()].some(
        (c) => c.faith <= -C.FAITH_MONUMENT && world.pops.some((p) => p.culture === c.name),
      );
      const chance = C.FORGOTTEN_CHANCE * (forsaken ? C.FORGOTTEN_FORSAKEN_MULT : 1);
      if (world.rng() < chance) {
        // It comes up where the fires burn to darker powers, if anywhere does
        let at = wildSpot(world, 60, 6);
        if (forsaken) {
          const dark = world.pops.filter((p) => (world.cultures.get(p.culture)?.faith ?? 0) <= -C.FAITH_MONUMENT);
          const near = dark[Math.floor(world.rng() * dark.length)];
          if (near) {
            const spot = wildSpot(world, 40, 4);
            at = spot ?? { x: near.x, y: near.y };
          }
        }
        if (at) spawnBeast(world, "forgotten", at.x, at.y, true);
      }
    }
  }

  for (const beast of world.beasts) {
    if (!beast.alive) continue;

    // Civilization at the lair door: withdraw deeper, or turn on the settlers
    if (world.territory[idx(world, beast.lairX, beast.lairY)] !== 0 && world.rng() < 0.5) {
      const spot = wildSpot(world, 40);
      if (spot) {
        beast.lairX = spot.x;
        beast.lairY = spot.y;
        beast.x = spot.x;
        beast.y = spot.y;
        logEvent(world, `Driven from its haunts, ${beast.name} withdraws into ${describeLocation(world, spot.x, spot.y)}.`, 1, {
          at: { x: spot.x, y: spot.y },
        });
        continue;
      }
    }

    // Roam around the lair; dragons range on the wing
    const speed = beast.kind === "dragon" ? 2 : 1;
    for (let s = 0; s < speed; s++) {
      const dx = Math.floor(world.rng() * 3) - 1;
      const dy = Math.floor(world.rng() * 3) - 1;
      const nx = beast.x + dx;
      const ny = beast.y + dy;
      if (nx < 1 || nx >= world.width - 1 || ny < 1 || ny >= world.height - 1) continue;
      if (Math.max(Math.abs(nx - beast.lairX), Math.abs(ny - beast.lairY)) > C.BEAST_ROAM) continue;
      if (beast.kind !== "dragon" && isWater(world, nx, ny)) continue;
      beast.x = nx;
      beast.y = ny;
    }

    // Prey in reach: raid. A hero in reach: the hunt may come to the beast.
    const raidR = C.BEAST_RAID_RADIUS[beast.kind];
    const prey = world.pops.filter(
      (p) => !p.target && Math.max(Math.abs(p.x - beast.x), Math.abs(p.y - beast.y)) <= raidR,
    );
    if (!prey.length) continue;
    if (world.rng() < C.BEAST_RAID_CHANCE) {
      raid(world, beast, prey.sort((a, b) => b.count - a.count)[0]);
      if (!beast.alive) continue;
    }
    const hunters = prey.filter((p) => heroOf(world, p.culture));
    if (hunters.length && world.rng() < C.HUNT_CHANCE) {
      hunt(world, beast, hunters[Math.floor(world.rng() * hunters.length)]);
    }
  }
}
