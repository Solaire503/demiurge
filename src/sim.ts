import * as C from "./constants";
import type { Pop, World } from "./world";
import { derivedName } from "./names";
import {
  cultureOf,
  describeDirection,
  describeLocation,
  harvestAround,
  idx,
  isWater,
  logEvent,
  recomputeClimate,
  shiftColor,
} from "./world";

function comfortAt(world: World, x: number, y: number, comfortTemp: number): number {
  const t = world.meanTemperature[idx(world, x, y)];
  const strain = Math.max(0, Math.abs(t - comfortTemp) - C.COMFORT_TOLERANCE);
  return Math.max(0, 1 - strain / C.COMFORT_FALLOFF);
}

function siteScore(world: World, x: number, y: number, comfortTemp: number): number {
  return harvestAround(world, x, y, true) * comfortAt(world, x, y, comfortTemp);
}

function crowded(world: World, x: number, y: number, selfId: number): boolean {
  return world.pops.some(
    (p) => p.id !== selfId && (p.x - x) ** 2 + (p.y - y) ** 2 <= C.POP_SPACING ** 2,
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
  const comfortTemp = cultureOf(world, pop).comfortTemp;
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
      // Jitter breaks the lattice: settlement spreads organically, not on a grid
      const score =
        siteScore(world, x, y, comfortTemp) * (1 - C.SITE_JITTER / 2 + world.rng() * C.SITE_JITTER);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

// Border pressure: rival cultures close by erode safety in proportion to how
// badly a pop is outnumbered. Migration and decline already follow from low
// safety, so displacement emerges without any combat mechanics.
function computePressure(world: World): Map<number, { ratio: number; rival: Pop }> {
  const pressures = new Map<number, { ratio: number; rival: Pop }>();
  for (const pop of world.pops) {
    let rivalCount = 0;
    let strongest: Pop | null = null;
    for (const p of world.pops) {
      if (p.culture === pop.culture) continue;
      if (Math.max(Math.abs(p.x - pop.x), Math.abs(p.y - pop.y)) > C.RIVALRY_DISTANCE) continue;
      rivalCount += p.count;
      if (!strongest || p.count > strongest.count) strongest = p;
    }
    if (strongest) pressures.set(pop.id, { ratio: rivalCount / Math.max(1, pop.count), rival: strongest });
  }
  return pressures;
}

function chronicleContests(world: World, pressures: Map<number, { ratio: number; rival: Pop }>): void {
  for (const pop of world.pops) {
    const p = pressures.get(pop.id);
    if (!p || p.ratio < C.CONTEST_RATIO) continue;
    const pair = [pop.culture, p.rival.culture].sort().join("|");
    const last = world.contestMemory.get(pair);
    if (last !== undefined && world.year - last < C.CONTEST_COOLDOWN_YEARS) continue;
    world.contestMemory.set(pair, world.year);
    const [a, b] = [pop.culture, p.rival.culture].sort();
    logEvent(world, `The ${a} and the ${b} contest ${describeLocation(world, pop.x, pop.y)}.`);
  }
}

function updatePop(world: World, pop: Pop, pressure: number): void {
  const culture = cultureOf(world, pop);
  const capacity = harvestAround(world, pop.x, pop.y, true) * C.CAPACITY_PER_FERTILITY;
  const rawSat = Math.min(1.5, capacity / Math.max(1, pop.count));
  pop.foodSat = pop.foodSat * 0.8 + rawSat * 0.2;
  const squeeze = Math.min(C.PRESSURE_CAP, pressure * C.PRESSURE_FACTOR);
  pop.safety = comfortAt(world, pop.x, pop.y, culture.comfortTemp) * (1 - squeeze);

  // Growth: surplus food grows the pop, want and harsh climate shrink it
  let r = C.BASE_GROWTH * (Math.min(C.GROWTH_SURPLUS_CAP, pop.foodSat) - 1);
  r -= (1 - pop.safety) * C.SAFETY_MORTALITY;
  if (pop.target) r -= 0.01; // the road is hard
  r = Math.min(C.MAX_GROWTH, Math.max(C.MAX_DECLINE, r));
  // Catastrophe pierces the ordinary floor: starvation and exposure kill fast
  r -= Math.max(0, 0.5 - pop.foodSat) * 2 * C.STARVATION_DECLINE;
  r -= Math.max(0, 0.25 - pop.safety) * 4 * C.EXPOSURE_DECLINE;
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

  // Hardship pushes pops to seek better land; ruin drives them anywhere at all
  const desperate = pop.foodSat < 0.5 || pop.safety < 0.25;
  if ((pop.inFamine || pop.safety < 0.45) && world.rng() < (desperate ? 0.6 : 0.35)) {
    const here = siteScore(world, pop.x, pop.y, culture.comfortTemp);
    const refuge = findBestSite(
      world,
      pop,
      3,
      desperate ? C.DESPERATE_RADIUS : C.MIGRATION_SEARCH_RADIUS,
      here * (desperate ? 1 : C.MIGRATION_GAIN),
    );
    if (refuge) {
      pop.target = refuge;
      const dir = describeDirection(refuge.x - pop.x, refuge.y - pop.y);
      logEvent(
        world,
        desperate
          ? `Fleeing ruin, the ${pop.culture} abandon their lands for the ${dir}.`
          : `Hard seasons press the ${pop.culture} to seek new lands to the ${dir}.`,
        desperate ? 2 : 1,
      );
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
    const site = findBestSite(world, pop, 6, 20, siteScore(world, pop.x, pop.y, culture.comfortTemp) * 0.5);
    if (site) {
      const leaving = Math.round(pop.count * C.SPLIT_FRACTION);
      pop.count -= leaving;
      world.pops.push({
        ...pop,
        id: world.nextPopId++,
        count: leaving,
        target: site,
        inFamine: false,
        isolation: 0,
      });
      logEvent(world, `A band of the ${pop.culture} strikes out for distant lands.`);
    }
  }
}

// Cultures slowly become creatures of their home climate
function adaptCultures(world: World): void {
  const homes = new Map<string, { tempSum: number; count: number }>();
  for (const pop of world.pops) {
    const h = homes.get(pop.culture) ?? { tempSum: 0, count: 0 };
    h.tempSum += world.meanTemperature[idx(world, pop.x, pop.y)] * pop.count;
    h.count += pop.count;
    homes.set(pop.culture, h);
  }
  for (const [name, h] of homes) {
    const culture = world.cultures.get(name)!;
    const homeTemp = h.tempSum / h.count;
    culture.comfortTemp += (homeTemp - culture.comfortTemp) * C.ADAPT_RATE;
    culture.comfortTemp = Math.min(C.COMFORT_TEMP_MAX, Math.max(C.COMFORT_TEMP_MIN, culture.comfortTemp));
    const drift = culture.comfortTemp - C.COMFORT_TEMP;
    if (drift < -C.ADAPT_NOTE_DELTA && culture.adaptedNote !== -1) {
      culture.adaptedNote = -1;
      logEvent(world, `The ${name} have grown hardy against the cold.`, 3);
    } else if (drift > C.ADAPT_NOTE_DELTA && culture.adaptedNote !== 1) {
      culture.adaptedNote = 1;
      logEvent(world, `The ${name} have grown accustomed to the sun's fierce heat.`, 3);
    }
  }
}

function uniqueDerivedName(world: World, parent: string): string {
  for (let tries = 0; tries < 8; tries++) {
    const name = derivedName(world.rng, parent);
    if (name !== parent && !world.cultures.has(name)) return name;
  }
  return `${parent}-kin`;
}

// A band drifts toward its own identity when it is sundered from all kin, or
// when it lives as a far province of a sprawling culture. Sundered bands may
// instead turn for home; far provinces are connected and never homesick.
// All of it is dice, not destiny.
function schisms(world: World): void {
  const centroids = new Map<string, { x: number; y: number; count: number }>();
  for (const pop of world.pops) {
    const c = centroids.get(pop.culture) ?? { x: 0, y: 0, count: 0 };
    c.x += pop.x * pop.count;
    c.y += pop.y * pop.count;
    c.count += pop.count;
    centroids.set(pop.culture, c);
  }

  for (const pop of world.pops) {
    let nearestKin: Pop | null = null;
    let nearestDist = Infinity;
    for (const p of world.pops) {
      if (p === pop || p.culture !== pop.culture) continue;
      const d = Math.max(Math.abs(p.x - pop.x), Math.abs(p.y - pop.y));
      if (d < nearestDist) {
        nearestDist = d;
        nearestKin = p;
      }
    }
    if (!nearestKin) {
      pop.isolation = 0;
      continue;
    }
    // A culture born this very season has no centroid yet — it sits this pass out
    const heart = centroids.get(pop.culture);
    if (!heart) continue;
    const heartDist = Math.max(
      Math.abs(pop.x - heart.x / heart.count),
      Math.abs(pop.y - heart.y / heart.count),
    );
    const sundered = nearestDist > C.SCHISM_DISTANCE;
    if (!sundered && heartDist <= C.PROVINCE_DISTANCE) {
      pop.isolation = 0;
      continue;
    }
    pop.isolation++;

    if (sundered && pop.isolation < C.HOMESICK_SEASONS && world.rng() < C.HOMESICK_CHANCE) {
      pop.target = { x: nearestKin.x, y: nearestKin.y };
      pop.isolation = 0;
      logEvent(world, `Their hearts turning homeward, a band of the ${pop.culture} abandons the far country.`);
      continue;
    }

    const chance = Math.min(
      C.SCHISM_CHANCE_MAX,
      Math.max(0, pop.isolation - C.SCHISM_MIN_SEASONS) * C.SCHISM_CHANCE_RAMP,
    );
    if (world.rng() < chance) {
      const parent = cultureOf(world, pop);
      const name = uniqueDerivedName(world, parent.name);
      world.cultures.set(name, {
        name,
        color: shiftColor(world.rng, parent.color),
        comfortTemp: parent.comfortTemp,
        parent: parent.name,
        adaptedNote: parent.adaptedNote,
      });
      // The whole regional cluster converts together: a people, not one bucket
      const converts = world.pops.filter(
        (p) =>
          p.culture === pop.culture &&
          Math.max(Math.abs(p.x - pop.x), Math.abs(p.y - pop.y)) <= C.SCHISM_GROUP_RADIUS,
      );
      let total = 0;
      for (const p of converts) {
        p.culture = name;
        p.isolation = 0;
        total += p.count;
      }
      let next = 0;
      while (next < C.MILESTONES.length && total >= C.MILESTONES[next]) next++;
      world.cultureMilestones.set(name, next);
      logEvent(
        world,
        `Long sundered from their kin, the ${parent.name} of ${describeLocation(world, pop.x, pop.y)} now call themselves the ${name}.`,
        3,
      );
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

  const pressures = computePressure(world);
  chronicleContests(world, pressures);
  for (const pop of world.pops) updatePop(world, pop, pressures.get(pop.id)?.ratio ?? 0);

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
  adaptCultures(world);
  schisms(world);
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

// `announce` lets a held-down channeling stream chronicle once, not once per pulse
export function blessFertility(world: World, cx: number, cy: number, announce = true): void {
  applyRadial(world, world.fertilityBonus, cx, cy, C.BLESS_RADIUS, C.BLESS_STRENGTH);
  recomputeClimate(world);
  if (announce) {
    logEvent(world, `Your blessing sinks into the soil of ${describeLocation(world, cx, cy)}.`, 3);
  }
}

export function shiftTemperature(
  world: World,
  cx: number,
  cy: number,
  direction: 1 | -1,
  announce = true,
): void {
  applyRadial(world, world.tempOffset, cx, cy, C.TEMP_SHIFT_RADIUS, C.TEMP_SHIFT * direction);
  recomputeClimate(world);
  if (announce) {
    const verb = direction > 0 ? "breathe warmth over" : "draw a chill across";
    logEvent(world, `You ${verb} ${describeLocation(world, cx, cy)}.`, 3);
  }
}
