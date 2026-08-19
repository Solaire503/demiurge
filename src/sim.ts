import * as C from "./constants";
import type { Pop, World } from "./world";
import {
  describeDirection,
  describeLocation,
  harvestAround,
  idx,
  isWater,
  logEvent,
  recomputeClimate,
} from "./world";

function comfortAt(world: World, x: number, y: number): number {
  const t = world.meanTemperature[idx(world, x, y)];
  const strain = Math.max(0, Math.abs(t - C.COMFORT_TEMP) - C.COMFORT_TOLERANCE);
  return Math.max(0, 1 - strain / C.COMFORT_FALLOFF);
}

function siteScore(world: World, x: number, y: number): number {
  return harvestAround(world, x, y, true) * comfortAt(world, x, y);
}

function crowded(world: World, x: number, y: number, selfId: number): boolean {
  return world.pops.some(
    (p) => p.id !== selfId && Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= C.POP_SPACING,
  );
}

function rebuildClaims(world: World): void {
  world.claims.fill(0);
  for (const pop of world.pops) {
    for (let y = Math.max(0, pop.y - 1); y <= Math.min(world.height - 1, pop.y + 1); y++) {
      for (let x = Math.max(0, pop.x - 1); x <= Math.min(world.width - 1, pop.x + 1); x++) {
        world.claims[idx(world, x, y)]++;
      }
    }
  }
}

function findBestSite(
  world: World,
  pop: Pop,
  rMin: number,
  rMax: number,
  minScore: number,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = minScore;
  const x0 = Math.max(1, pop.x - rMax);
  const x1 = Math.min(world.width - 2, pop.x + rMax);
  const y0 = Math.max(1, pop.y - rMax);
  const y1 = Math.min(world.height - 2, pop.y + rMax);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.max(Math.abs(x - pop.x), Math.abs(y - pop.y));
      if (dist < rMin || dist > rMax) continue;
      if (isWater(world, x, y) || crowded(world, x, y, pop.id)) continue;
      const score = siteScore(world, x, y);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

function updatePop(world: World, pop: Pop): void {
  const capacity = harvestAround(world, pop.x, pop.y, true) * C.CAPACITY_PER_FERTILITY;
  const rawSat = Math.min(1.5, capacity / Math.max(1, pop.count));
  pop.foodSat = pop.foodSat * 0.8 + rawSat * 0.2;
  pop.safety = comfortAt(world, pop.x, pop.y);

  // Growth: surplus food grows the pop, want and harsh climate shrink it
  let r = C.BASE_GROWTH * (Math.min(1.25, pop.foodSat) - 1);
  r -= (1 - pop.safety) * C.SAFETY_MORTALITY;
  if (pop.target) r -= 0.01; // the road is hard
  r = Math.min(C.MAX_GROWTH, Math.max(C.MAX_DECLINE, r));
  pop.count = Math.round(pop.count * (1 + r));

  // Famine is an ongoing condition, chronicled per culture at its turning points
  if (!pop.inFamine && pop.foodSat < C.FAMINE_THRESHOLD) {
    const alreadyFamished = world.pops.some((p) => p !== pop && p.culture === pop.culture && p.inFamine);
    pop.inFamine = true;
    if (!alreadyFamished) logEvent(world, `Famine gnaws at the ${pop.culture}.`);
  } else if (pop.inFamine && pop.foodSat > C.FAMINE_RECOVERY) {
    pop.inFamine = false;
    const stillFamished = world.pops.some((p) => p.culture === pop.culture && p.inFamine);
    if (!stillFamished) logEvent(world, `The lean years of the ${pop.culture} come to an end.`);
  }

  if (pop.target) {
    // One cell per season toward the promised land
    pop.x += Math.sign(pop.target.x - pop.x);
    pop.y += Math.sign(pop.target.y - pop.y);
    if (pop.x === pop.target.x && pop.y === pop.target.y) {
      pop.target = null;
      logEvent(world, `The ${pop.culture} settle in ${describeLocation(world, pop.x, pop.y)}.`, 1);
    }
    return;
  }

  // Hardship pushes pops to seek better land
  if ((pop.inFamine || pop.safety < 0.45) && world.rng() < 0.35) {
    const here = siteScore(world, pop.x, pop.y);
    const refuge = findBestSite(world, pop, 3, C.MIGRATION_SEARCH_RADIUS, here * C.MIGRATION_GAIN);
    if (refuge) {
      pop.target = refuge;
      const dir = describeDirection(refuge.x - pop.x, refuge.y - pop.y);
      logEvent(world, `Hard seasons press the ${pop.culture} to seek new lands to the ${dir}.`);
      return;
    }
  }

  // Plenty pushes pops to spread — only well-fed pops send out bands
  if (
    pop.count > C.SPLIT_MIN_COUNT &&
    pop.count > capacity * C.SPLIT_CROWDING &&
    pop.foodSat > 0.9 &&
    world.rng() < C.SPLIT_CHANCE
  ) {
    const site = findBestSite(world, pop, 6, 20, siteScore(world, pop.x, pop.y) * 0.5);
    if (site) {
      const leaving = Math.round(pop.count * C.SPLIT_FRACTION);
      pop.count -= leaving;
      world.pops.push({
        ...pop,
        id: world.nextPopId++,
        count: leaving,
        target: site,
        inFamine: false,
      });
      logEvent(world, `A band of the ${pop.culture} strikes out for distant lands.`);
    }
  }
}

function recordCultureMilestones(world: World): void {
  const totals = new Map<string, number>();
  for (const pop of world.pops) {
    totals.set(pop.culture, (totals.get(pop.culture) ?? 0) + pop.count);
  }
  for (const [culture, total] of totals) {
    let next = world.cultureMilestones.get(culture) ?? 0;
    while (next < C.MILESTONES.length && total >= C.MILESTONES[next]) {
      logEvent(world, `The ${culture} number ${C.MILESTONES[next].toLocaleString("en-US")} souls.`, 3);
      next++;
    }
    world.cultureMilestones.set(culture, next);
  }
}

export function tick(world: World): void {
  world.season++;
  if (world.season === 4) {
    world.season = 0;
    world.year++;
  }

  // Divine influence fades back toward the world's own equilibrium
  for (let i = 0; i < world.tempOffset.length; i++) {
    world.tempOffset[i] *= 1 - C.TEMP_RELAX;
    world.fertilityBonus[i] *= 1 - C.BLESS_DECAY;
  }
  recomputeClimate(world);
  rebuildClaims(world);

  for (const pop of world.pops) updatePop(world, pop);

  const dead = world.pops.filter((p) => p.count < C.EXTINCTION_COUNT);
  if (dead.length) {
    world.pops = world.pops.filter((p) => p.count >= C.EXTINCTION_COUNT);
    for (const pop of dead) {
      const survives = world.pops.some((p) => p.culture === pop.culture);
      logEvent(
        world,
        survives
          ? `A band of the ${pop.culture} dwindles and is gone.`
          : `The last of the ${pop.culture} pass into memory.`,
        survives ? 1 : 3,
      );
    }
  }
  recordCultureMilestones(world);
}

// --- Divine verbs: both write into the same layers the sim reads. ---

function applyRadial(
  world: World,
  layer: Float32Array,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
): void {
  for (let y = Math.max(0, cy - radius); y <= Math.min(world.height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(world.width - 1, cx + radius); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > radius) continue;
      layer[idx(world, x, y)] += strength * (1 - d / radius);
    }
  }
}

export function blessFertility(world: World, cx: number, cy: number): void {
  applyRadial(world, world.fertilityBonus, cx, cy, C.BLESS_RADIUS, C.BLESS_STRENGTH);
  recomputeClimate(world);
  logEvent(world, `Your blessing sinks into the soil of ${describeLocation(world, cx, cy)}.`, 3);
}

export function shiftTemperature(world: World, cx: number, cy: number, direction: 1 | -1): void {
  applyRadial(world, world.tempOffset, cx, cy, C.TEMP_SHIFT_RADIUS, C.TEMP_SHIFT * direction);
  recomputeClimate(world);
  const verb = direction > 0 ? "breathe warmth over" : "draw a chill across";
  logEvent(world, `You ${verb} ${describeLocation(world, cx, cy)}.`, 3);
}
