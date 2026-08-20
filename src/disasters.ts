import * as C from "./constants";
import type { Pop, World } from "./world";
import {
  biomeIdAt,
  computeBaseTemperature,
  describeLocation,
  idx,
  isWater,
  logEvent,
  noteFaith,
  recomputeClimate,
} from "./world";

// --- Disasters: the world's own violence, and the god's heaviest hands.
// Fire is the first propagating process: it spreads on its own, quick-simmed
// relative to player speed, eats what it can burn, and leaves char that
// heals into ash-fattened soil. Everything here is landscape-first — the
// terrain actually changes, and every derived layer follows.

// How readily each biome burns, indexed by biomeIdAt
const FLAMMABILITY = [0, 0, 0, 0, 0.1, 0, 0.15, 0.05, 0.1, 0.75, 0.55, 0.5, 0.85, 0.65];

function flammability(world: World, i: number): number {
  if (world.elevation[i] < C.SEA_LEVEL || world.lakes[i]) return 0;
  const base = FLAMMABILITY[biomeIdAt(world, i)] ?? 0;
  return base * Math.max(0, 1 - world.moisture[i] * C.FIRE_MOISTURE_DAMP);
}

export function ignite(world: World, i: number): void {
  if (world.fire[i] === 0 && world.char[i] < 0.6 && flammability(world, i) > 0.05) {
    world.fire[i] = 1;
  }
}

// A burning people runs for unburned ground
function fleeFire(world: World, pop: Pop): void {
  if (pop.target) return;
  let best = -1;
  let bestScore = 0;
  const R = C.FIRE_FLEE_RADIUS;
  for (let y = Math.max(0, pop.y - R); y <= Math.min(world.height - 1, pop.y + R); y++) {
    for (let x = Math.max(0, pop.x - R); x <= Math.min(world.width - 1, pop.x + R); x++) {
      const i = idx(world, x, y);
      if (isWater(world, x, y) || world.fire[i] > 0 || world.char[i] > 0.3) continue;
      const dist = Math.max(Math.abs(x - pop.x), Math.abs(y - pop.y));
      if (dist < 3) continue; // out from under the smoke, not next door
      const score = world.fertility[i] + 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
  }
  if (best !== -1) {
    pop.target = { x: best % world.width, y: (best / world.width) | 0 };
    pop.journey = "refugees";
  }
}

// Runs every season: lightning kindles, fires spread and gutter, char heals
// into ash, and the people in the smoke suffer and run
export function tickFires(world: World): void {
  const size = world.width * world.height;

  // Dry lightning: hot, dry country catches — warm ages are fire ages
  for (let t = 0; t < C.LIGHTNING_TRIES; t++) {
    const i = Math.floor(world.rng() * size);
    if (
      world.fire[i] === 0 &&
      world.char[i] < 0.3 &&
      world.temperature[i] >= C.LIGHTNING_TEMP &&
      world.moisture[i] <= C.LIGHTNING_DRYNESS &&
      flammability(world, i) > 0.2 &&
      world.rng() < C.LIGHTNING_CHANCE
    ) {
      world.fire[i] = 1;
      const x = i % world.width;
      const y = (i / world.width) | 0;
      const near = world.pops.some(
        (p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= 6,
      );
      logEvent(world, `Dry lightning kindles fire in ${describeLocation(world, x, y)}.`, near ? 2 : 1, {
        at: { x, y },
      });
    }
  }

  // Spread and burn, several beats per season — fire is faster than harvests
  for (let s = 0; s < C.FIRE_SUBSTEPS; s++) {
    const caught: number[] = [];
    for (let i = 0; i < size; i++) {
      const f = world.fire[i];
      if (f <= 0) continue;
      const x = i % world.width;
      const y = (i / world.width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= world.width || ny < 0 || ny >= world.height) continue;
          const j = ny * world.width + nx;
          if (world.fire[j] > 0 || world.char[j] >= 0.6) continue;
          const diag = dx !== 0 && dy !== 0 ? 0.6 : 1;
          if (world.rng() < C.FIRE_SPREAD * f * flammability(world, j) * diag) caught.push(j);
        }
      }
      world.fire[i] = f - C.FIRE_BURNOUT;
      if (world.fire[i] <= 0.05) {
        world.fire[i] = 0;
        world.char[i] = Math.min(1, world.char[i] + 0.9);
      }
    }
    for (const j of caught) world.fire[j] = 1;
  }

  // Char heals, and the ash feeds what grows back
  for (let i = 0; i < size; i++) {
    if (world.char[i] <= 0) continue;
    const dec = Math.min(world.char[i], C.CHAR_DECAY);
    world.char[i] -= dec;
    world.fertilityBonus[i] += dec * C.ASH_FERTILITY;
  }

  // The people in the smoke: losses, and flight
  for (const pop of world.pops) {
    const i = idx(world, pop.x, pop.y);
    let burning = world.fire[i] > 0;
    if (!burning) {
      for (let dy = -1; dy <= 1 && !burning; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = pop.x + dx;
          const ny = pop.y + dy;
          if (nx < 0 || nx >= world.width || ny < 0 || ny >= world.height) continue;
          if (world.fire[ny * world.width + nx] > 0.5) {
            burning = true;
            break;
          }
        }
      }
    }
    if (!burning) continue;
    pop.count = Math.round(pop.count * (1 - C.FIRE_MORTALITY));
    fleeFire(world, pop);
    const last = world.wildfireLog.get(pop.culture);
    if (last === undefined || world.year - last >= C.WILDFIRE_LOG_YEARS) {
      world.wildfireLog.set(pop.culture, world.year);
      logEvent(world, `Fire sweeps the lands of the ${pop.culture}; they flee before the smoke.`, 2, {
        subjects: [pop.culture],
        at: { x: pop.x, y: pop.y },
      });
    }
  }
}

// Those the cataclysm struck know whose hand called it down
function divineWrathFallout(world: World, struck: Set<string>, cx: number, cy: number, what: string): void {
  for (const name of struck) {
    const culture = world.cultures.get(name);
    if (!culture) continue;
    const last = world.spurnedLog.get(name);
    if (last !== undefined && world.year - last < C.SPURNED_COOLDOWN_YEARS) continue;
    world.spurnedLog.set(name, world.year);
    culture.faith = Math.max(-2 * C.FAITH_MONUMENT, culture.faith - 1);
    logEvent(world, `The ${name} know their god's hand in ${what}.`, 2, {
      subjects: [name],
      at: { x: cx, y: cy },
    });
    noteFaith(world, culture);
  }
}

function killAround(world: World, cx: number, cy: number, radius: number, fraction: number): { slain: number; struck: Set<string> } {
  let slain = 0;
  const struck = new Set<string>();
  for (const pop of world.pops) {
    if (Math.max(Math.abs(pop.x - cx), Math.abs(pop.y - cy)) > radius) continue;
    const loss = Math.round(pop.count * fraction);
    pop.count -= loss;
    slain += loss;
    struck.add(pop.culture);
  }
  return { slain, struck };
}

// The mountain wakes — or is called out of the earth by a god. A cone rises,
// fire rings it, ash falls, and in time the fallout ring is the best farmland
// in the region: volcanic soil, the classic bargain.
export function volcano(world: World, cx: number, cy: number, natural = false): void {
  const lift = natural ? C.NATURAL_ERUPT_LIFT : C.VOLCANO_LIFT;
  const r = C.VOLCANO_RADIUS;
  for (let y = Math.max(0, cy - r); y <= Math.min(world.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(world.width - 1, cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const i = idx(world, x, y);
      world.elevation[i] = Math.min(1, world.elevation[i] + lift * (1 - d / r));
    }
  }
  // Fire rings the cone; ash falls in a wider circle and feeds it for years
  for (let y = Math.max(0, cy - C.VOLCANO_ASH_RADIUS); y <= Math.min(world.height - 1, cy + C.VOLCANO_ASH_RADIUS); y++) {
    for (let x = Math.max(0, cx - C.VOLCANO_ASH_RADIUS); x <= Math.min(world.width - 1, cx + C.VOLCANO_ASH_RADIUS); x++) {
      const d = Math.hypot(x - cx, y - cy);
      const i = idx(world, x, y);
      if (d <= C.VOLCANO_FIRE_RADIUS) ignite(world, i);
      if (d > r && d <= C.VOLCANO_ASH_RADIUS) {
        world.fertilityBonus[i] += C.VOLCANO_ASH * (1 - d / C.VOLCANO_ASH_RADIUS);
      }
    }
  }
  // New rock sometimes bares new veins — volcanic country is mineral country
  for (let n = 0; n < 3; n++) {
    const x = cx + Math.floor(world.rng() * (2 * r + 1)) - r;
    const y = cy + Math.floor(world.rng() * (2 * r + 1)) - r;
    if (x < 0 || x >= world.width || y < 0 || y >= world.height) continue;
    const i = idx(world, x, y);
    if (world.elevation[i] >= C.VEIN_MIN_ELEVATION && !world.resources[i] && world.rng() < 0.4) {
      world.resources[i] = world.rng() < 0.5 ? 1 : world.rng() < 0.6 ? 2 : world.rng() < 0.8 ? 3 : 4;
    }
  }
  const { slain, struck } = killAround(world, cx, cy, C.VOLCANO_KILL_RADIUS, C.VOLCANO_KILL);
  computeBaseTemperature(world);
  recomputeClimate(world);
  const where = describeLocation(world, cx, cy);
  logEvent(
    world,
    natural
      ? `The mountain in ${where} wakes in fire; ash darkens the sky${slain ? `, and ${slain.toLocaleString("en-US")} souls perish` : ""}.`
      : `At your word the earth splits: a mountain of fire rises in ${where}${slain ? `, and ${slain.toLocaleString("en-US")} souls perish in its birth` : ""}.`,
    3,
    { at: { x: cx, y: cy } },
  );
  if (!natural) divineWrathFallout(world, struck, cx, cy, "the mountain's fury");
}

// A star falls. The land is struck into a crater, fire takes what stands
// around it — and when the waters settle, craters become lakes.
export function meteor(world: World, cx: number, cy: number): void {
  const r = C.METEOR_RADIUS;
  for (let y = Math.max(0, cy - r - 1); y <= Math.min(world.height - 1, cy + r + 1); y++) {
    for (let x = Math.max(0, cx - r - 1); x <= Math.min(world.width - 1, cx + r + 1); x++) {
      const d = Math.hypot(x - cx, y - cy);
      const i = idx(world, x, y);
      if (d <= r) {
        world.elevation[i] = Math.max(0, world.elevation[i] - C.METEOR_DEPTH * (1 - d / (r + 0.5)));
        world.char[i] = 1;
        world.fire[i] = 0;
        if (world.elevation[i] < C.SEA_LEVEL) world.resources[i] = 0;
      } else if (d <= r + 1) {
        world.elevation[i] = Math.min(1, world.elevation[i] + 0.05); // the thrown rim
        ignite(world, i);
      }
    }
  }
  for (let y = Math.max(0, cy - r - 2); y <= Math.min(world.height - 1, cy + r + 2); y++) {
    for (let x = Math.max(0, cx - r - 2); x <= Math.min(world.width - 1, cx + r + 2); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 1 && d <= r + 2) ignite(world, idx(world, x, y));
    }
  }
  const { slain, struck } = killAround(world, cx, cy, C.METEOR_KILL_RADIUS, C.METEOR_KILL);
  computeBaseTemperature(world);
  recomputeClimate(world);
  const where = describeLocation(world, cx, cy);
  logEvent(
    world,
    `A star falls upon ${where}; the earth opens where it strikes${slain ? `, and ${slain.toLocaleString("en-US")} souls are no more` : ""}.`,
    3,
    { at: { x: cx, y: cy } },
  );
  divineWrathFallout(world, struck, cx, cy, "the fallen star");
}

// Yearly: the deep fire finds old peaks on its own
export function naturalDisasters(world: World): void {
  const size = world.width * world.height;
  for (let t = 0; t < C.ERUPTION_TRIES; t++) {
    const i = Math.floor(world.rng() * size);
    if (world.elevation[i] < C.ERUPTION_MIN_ELEVATION) continue;
    if (world.rng() >= C.ERUPTION_CHANCE) continue;
    volcano(world, i % world.width, (i / world.width) | 0, true);
    break; // one waking mountain a year is drama enough
  }
}
