import * as C from "./constants";
import type { Culture, Pop, World } from "./world";
import { derivedName } from "./names";
import {
  carveRivers,
  cultureOf,
  describeDirection,
  describeLocation,
  heroOf,
  idx,
  isWater,
  leaderOf,
  logEvent,
  mintFigure,
  raceHarvestAround,
  raceOf,
  recomputeClimate,
  shiftColor,
  simulateWaterCycle,
  tierOf,
} from "./world";

function comfortAt(world: World, x: number, y: number, comfortTemp: number): number {
  const t = world.meanTemperature[idx(world, x, y)];
  const strain = Math.max(0, Math.abs(t - comfortTemp) - C.COMFORT_TOLERANCE);
  return Math.max(0, 1 - strain / C.COMFORT_FALLOFF);
}

// Cultures adapted to cold country partially unlock its larder — herding,
// ice-fishing, mountain terraces — so tundra can feed the people it forged.
function adaptFactor(world: World, comfortTemp: number, x: number, y: number): number {
  const t = world.meanTemperature[idx(world, x, y)];
  const coldness = Math.min(1, Math.max(0, (C.COMFORT_TEMP - t) / 20));
  if (coldness === 0) return 1;
  const closeness = Math.max(0, 1 - Math.abs(t - comfortTemp) / C.ADAPT_HARVEST_RANGE);
  return 1 + C.ADAPT_HARVEST_BONUS * closeness * coldness;
}

function siteScore(world: World, x: number, y: number, culture: Culture): number {
  const pioneer = world.claims[idx(world, x, y)] === 0 ? 1 + C.PIONEER_BONUS : 1;
  return (
    raceHarvestAround(world, raceOf(world, culture.name), x, y, true) *
    comfortAt(world, x, y, culture.comfortTemp) *
    adaptFactor(world, culture.comfortTemp, x, y) *
    pioneer
  );
}

// Routine movement (splits, migrations, settlings) chronicles at most once per
// culture per MOVEMENT_LOG_YEARS — expansion is one story, not a hundred lines.
// Exoduses, routs, and schisms bypass this: those are events, not chatter.
function logMovement(
  world: World,
  culture: string,
  text: string,
  importance: 1 | 2 | 3,
  at?: { x: number; y: number },
): void {
  const last = world.movementLog.get(culture);
  if (last !== undefined && world.year - last < C.MOVEMENT_LOG_YEARS) return;
  world.movementLog.set(culture, world.year);
  logEvent(world, text, importance, { subjects: [culture], at });
}

function nearRiver(world: World, pop: Pop): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = pop.x + dx;
      const ny = pop.y + dy;
      if (nx < 0 || nx >= world.width || ny < 0 || ny >= world.height) continue;
      if (world.isRiver[idx(world, nx, ny)]) return true;
    }
  }
  return false;
}

function crowded(world: World, x: number, y: number, selfId: number): boolean {
  return world.pops.some(
    (p) => p.id !== selfId && (p.x - x) ** 2 + (p.y - y) ** 2 <= C.POP_SPACING ** 2,
  );
}

function harvestRadius(pop: Pop): number {
  return C.TIER_HARVEST_RADIUS[tierOf(pop.count)];
}

function rebuildClaims(world: World): void {
  world.claims.fill(0);
  for (const pop of world.pops) {
    const r = harvestRadius(pop);
    for (let y = Math.max(0, pop.y - r); y <= Math.min(world.height - 1, pop.y + r); y++) {
      for (let x = Math.max(0, pop.x - r); x <= Math.min(world.width - 1, pop.x + r); x++) {
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
  const culture = cultureOf(world, pop);
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
        siteScore(world, x, y, culture) * (1 - C.SITE_JITTER / 2 + world.rng() * C.SITE_JITTER);
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
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function underTruce(world: World, a: string, b: string): boolean {
  const expires = world.truces.get(pairKey(a, b));
  return expires !== undefined && world.year < expires;
}

function computePressure(world: World): Map<number, { ratio: number; rival: Pop }> {
  const pressures = new Map<number, { ratio: number; rival: Pop }>();
  for (const pop of world.pops) {
    let rivalCount = 0;
    let strongest: Pop | null = null;
    for (const p of world.pops) {
      if (p.culture === pop.culture) continue;
      if (Math.max(Math.abs(p.x - pop.x), Math.abs(p.y - pop.y)) > C.RIVALRY_DISTANCE) continue;
      if (underTruce(world, pop.culture, p.culture)) continue;
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
    logEvent(world, `The ${a} and the ${b} contest ${describeLocation(world, pop.x, pop.y)}.`, 2, {
      subjects: [a, b],
      at: { x: pop.x, y: pop.y },
    });
  }
}

function updatePop(world: World, pop: Pop, pressure: number): void {
  const culture = cultureOf(world, pop);
  const race = raceOf(world, pop.culture);
  const capacity =
    raceHarvestAround(world, race, pop.x, pop.y, true, harvestRadius(pop)) *
    C.CAPACITY_PER_FERTILITY *
    adaptFactor(world, culture.comfortTemp, pop.x, pop.y);
  const rawSat = Math.min(1.5, capacity / Math.max(1, pop.count));
  pop.foodSat = pop.foodSat * 0.8 + rawSat * 0.2;
  const squeeze = Math.min(C.PRESSURE_CAP, pressure * C.PRESSURE_FACTOR);
  pop.safety = comfortAt(world, pop.x, pop.y, culture.comfortTemp) * (1 - squeeze);

  // Growth: surplus food grows the pop, want and harsh climate shrink it.
  // Each race breeds at its own pace — goblins swarm, elves linger.
  let r = C.BASE_GROWTH * (Math.min(C.GROWTH_SURPLUS_CAP, pop.foodSat) - 1);
  if (r > 0) r *= race.growth;
  r -= (1 - pop.safety) * C.SAFETY_MORTALITY;
  if (pop.target) r -= 0.01; // the road is hard
  r = Math.min(C.MAX_GROWTH, Math.max(C.MAX_DECLINE, r));
  // Catastrophe pierces the ordinary floor: starvation and exposure kill fast
  r -= Math.max(0, 0.5 - pop.foodSat) * 2 * C.STARVATION_DECLINE;
  r -= Math.max(0, 0.25 - pop.safety) * 4 * C.EXPOSURE_DECLINE;
  if (pop.plagueSeasons > 0) {
    r -= C.PLAGUE_MORTALITY;
    pop.plagueSeasons--;
    if (pop.plagueSeasons === 0 && !world.pops.some((p) => p !== pop && p.culture === pop.culture && p.plagueSeasons > 0)) {
      logEvent(world, `The pestilence releases its grip on the ${pop.culture}.`, 1, {
        subjects: [pop.culture],
        at: { x: pop.x, y: pop.y },
      });
    }
  }
  pop.count = Math.round(pop.count * (1 + r));

  // Reaching a settlement tier for the first time is a chronicle beat;
  // pop.tier is a high-water mark so a city that dips and recovers isn't news twice
  const tier = tierOf(pop.count);
  if (tier > pop.tier) {
    const where = describeLocation(world, pop.x, pop.y);
    const extra = { subjects: [pop.culture], at: { x: pop.x, y: pop.y } };
    if (tier === 2) logEvent(world, `The ${pop.culture} raise a town in ${where}.`, 2, extra);
    else if (tier === 3) logEvent(world, `A great city of the ${pop.culture} rises in ${where}.`, 3, extra);
    pop.tier = tier;
  }

  // Famine is an ongoing condition, chronicled per culture at its turning points
  if (!pop.inFamine && pop.foodSat < C.FAMINE_THRESHOLD) {
    const alreadyFamished = world.pops.some((p) => p !== pop && p.culture === pop.culture && p.inFamine);
    pop.inFamine = true;
    if (!alreadyFamished) {
      logEvent(world, `Famine gnaws at the ${pop.culture}.`, 2, {
        subjects: [pop.culture],
        at: { x: pop.x, y: pop.y },
      });
    }
  } else if (pop.inFamine && pop.foodSat > C.FAMINE_RECOVERY) {
    pop.inFamine = false;
    const stillFamished = world.pops.some((p) => p.culture === pop.culture && p.inFamine);
    if (!stillFamished) {
      logEvent(world, `The lean years of the ${pop.culture} come to an end.`, 2, {
        subjects: [pop.culture],
        at: { x: pop.x, y: pop.y },
      });
    }
  }

  if (pop.target) {
    // One cell per season toward the promised land
    pop.x += Math.sign(pop.target.x - pop.x);
    pop.y += Math.sign(pop.target.y - pop.y);
    if (pop.x === pop.target.x && pop.y === pop.target.y) {
      pop.target = null;
      logMovement(world, pop.culture, `The ${pop.culture} settle in ${describeLocation(world, pop.x, pop.y)}.`, 1, {
        x: pop.x,
        y: pop.y,
      });
    }
    return;
  }

  // Hardship pushes pops to seek better land; ruin drives them anywhere at all
  const desperate = pop.foodSat < 0.5 || pop.safety < 0.25;
  if ((pop.inFamine || pop.safety < 0.45) && world.rng() < (desperate ? 0.6 : 0.35)) {
    const here = siteScore(world, pop.x, pop.y, culture);
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
      if (desperate) {
        logEvent(world, `Fleeing ruin, the ${pop.culture} abandon their lands for the ${dir}.`, 2, {
          subjects: [pop.culture],
          at: { x: pop.x, y: pop.y },
        });
      } else {
        logMovement(world, pop.culture, `Hard seasons press the ${pop.culture} to seek new lands to the ${dir}.`, 1, {
          x: pop.x,
          y: pop.y,
        });
      }
      return;
    }
  }

  // Plenty pushes pops to spread — only well-fed pops send out bands.
  // An ambitious leader hungers for horizons; some blood is restless by nature.
  const splitChance =
    C.SPLIT_CHANCE *
    race.splitMult *
    (leaderOf(world, pop.culture)?.temperament === "ambitious" ? C.AMBITIOUS_SPLIT_MULT : 1);
  if (
    pop.count > C.SPLIT_MIN_COUNT &&
    pop.count > capacity * C.SPLIT_CROWDING &&
    pop.foodSat > 0.9 &&
    world.rng() < splitChance
  ) {
    const site = findBestSite(world, pop, 6, 20, siteScore(world, pop.x, pop.y, culture) * 0.5);
    if (site) {
      const leaving = Math.min(C.SPLIT_MAX_LEAVING, Math.round(pop.count * C.SPLIT_FRACTION));
      pop.count -= leaving;
      world.pops.push({
        ...pop,
        id: world.nextPopId++,
        count: leaving,
        target: site,
        inFamine: false,
        isolation: 0,
        feud: null,
        tier: tierOf(leaving),
      });
      logMovement(world, pop.culture, `A band of the ${pop.culture} strikes out for distant lands.`, 2, {
        x: site.x,
        y: site.y,
      });
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
    // Humans remake themselves in a few generations; elves change like stone does
    culture.comfortTemp += (homeTemp - culture.comfortTemp) * C.ADAPT_RATE * raceOf(world, name).adaptMult;
    culture.comfortTemp = Math.min(C.COMFORT_TEMP_MAX, Math.max(C.COMFORT_TEMP_MIN, culture.comfortTemp));
    const drift = culture.comfortTemp - C.COMFORT_TEMP;
    if (drift < -C.ADAPT_NOTE_DELTA && culture.adaptedNote !== -1) {
      culture.adaptedNote = -1;
      logEvent(world, `The ${name} have grown hardy against the cold.`, 3, { subjects: [name] });
    } else if (drift > C.ADAPT_NOTE_DELTA && culture.adaptedNote !== 1) {
      culture.adaptedNote = 1;
      logEvent(world, `The ${name} have grown accustomed to the sun's fierce heat.`, 3, { subjects: [name] });
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
      logEvent(world, `Their hearts turning homeward, a band of the ${pop.culture} abandons the far country.`, 2, {
        subjects: [pop.culture],
        at: { x: pop.x, y: pop.y },
      });
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
        race: parent.race, // daughters keep their blood
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
      const newLeader = mintFigure(world, name, "leader");
      logEvent(
        world,
        `Long sundered from their kin, the ${parent.name} of ${describeLocation(world, pop.x, pop.y)} now call themselves the ${name}. ${newLeader.name} leads them.`,
        3,
        { subjects: [parent.name, name], at: { x: pop.x, y: pop.y } },
      );
    }
  }
}

// --- Pestilence: crowding breeds its own cull. Some blood sickens easily ---
function pestilence(world: World): void {
  const newly: Pop[] = [];
  for (const pop of world.pops) {
    if (pop.plagueSeasons > 0) {
      for (const p of world.pops) {
        if (
          p.plagueSeasons === 0 &&
          !newly.includes(p) &&
          Math.max(Math.abs(p.x - pop.x), Math.abs(p.y - pop.y)) <= C.PLAGUE_SPREAD_RADIUS &&
          world.rng() < C.PLAGUE_SPREAD_CHANCE * raceOf(world, p.culture).plagueResist
        ) {
          newly.push(p);
        }
      }
    } else if (!newly.includes(pop)) {
      const crowd = world.claims[idx(world, pop.x, pop.y)] > 1 ? 1.5 : 1;
      const risk =
        C.PLAGUE_CHANCE *
        Math.min(2, pop.count / C.PLAGUE_CROWD_SCALE) *
        crowd *
        raceOf(world, pop.culture).plagueResist;
      if (world.rng() < risk) newly.push(pop);
    }
  }
  for (const pop of newly) {
    const first = !world.pops.some((p) => p !== pop && p.culture === pop.culture && p.plagueSeasons > 0);
    pop.plagueSeasons =
      C.PLAGUE_SEASONS_MIN + Math.floor(world.rng() * (C.PLAGUE_SEASONS_MAX - C.PLAGUE_SEASONS_MIN + 1));
    const last = world.plagueLog.get(pop.culture);
    if (first && (last === undefined || world.year - last >= C.PLAGUE_LOG_YEARS)) {
      world.plagueLog.set(pop.culture, world.year);
      logEvent(world, `Pestilence walks among the ${pop.culture}.`, 2, {
        subjects: [pop.culture],
        at: { x: pop.x, y: pop.y },
      });
    }
  }
}

// --- Figures: they age, sicken, fall, and are succeeded ---
function figuresTick(world: World): void {
  const living = new Set(world.pops.map((p) => p.culture));
  for (const f of world.figures) {
    if (!f.alive) continue;
    if (!living.has(f.culture)) {
      f.alive = false; // their people's extinction is their epitaph
      continue;
    }
    const age = world.year - f.born;
    // An elf-lord outlives dynasties of orc chieftains
    const oldAge = C.LEADER_OLD_AGE + raceOf(world, f.culture).leaderSpan;
    let death: string | null = null;
    if (age > oldAge && world.rng() < C.LEADER_OLD_DEATH_CHANCE) {
      death = "dies full of years";
    } else if (
      world.pops.some((p) => p.culture === f.culture && p.plagueSeasons > 0) &&
      world.rng() < C.LEADER_PLAGUE_DEATH_CHANCE
    ) {
      death = "is taken by the pestilence";
    }
    if (!death) continue;
    f.alive = false;
    if (f.role === "leader") {
      const heir = mintFigure(world, f.culture, "leader");
      logEvent(world, `${f.name} of the ${f.culture} ${death}. ${heir.name} leads the ${f.culture} now.`, 3, {
        subjects: [f.culture],
      });
    } else {
      logEvent(world, `${f.name}, hero of the ${f.culture}, ${death}.`, 2, { subjects: [f.culture] });
    }
  }
}

// --- Contest resolution: standoffs end in blood, accord, or merging ---

function lineageOf(world: World, name: string): Set<string> {
  const seen = new Set<string>();
  let cur: string | null = name;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    cur = world.cultures.get(cur)?.parent ?? null;
  }
  return seen;
}

function areKin(world: World, a: string, b: string): boolean {
  const la = lineageOf(world, a);
  for (const n of lineageOf(world, b)) if (la.has(n)) return true;
  return false;
}

// Returns the id of an annihilated pop, if the war ended in extermination
function resolveContest(world: World, a: Pop, b: Pop): number | null {
  const key = pairKey(a.culture, b.culture);
  const kin = areKin(world, a.culture, b.culture);
  const roll = world.rng();
  const where = describeLocation(world, a.x, a.y);
  const [small, big] = a.count <= b.count ? [a, b] : [b, a];
  const grudge = world.grudges.get(key) ?? 0;
  const vendetta = grudge >= C.GRUDGE_VENDETTA;
  const leaderA = leaderOf(world, a.culture);
  const leaderB = leaderOf(world, b.culture);
  a.feud = null;
  b.feud = null;

  if (kin && roll < C.MERGE_CHANCE_KIN) {
    // Kin remember they are kin: the smaller rejoins the larger, and old wounds close
    const oldCulture = small.culture;
    small.culture = big.culture;
    world.grudges.delete(key);
    const last = !world.pops.some((p) => p.culture === oldCulture);
    logEvent(
      world,
      last
        ? `The ${oldCulture} are no more; their kin walk now among the ${big.culture}.`
        : `The ${oldCulture} of ${where} take up the ways of the ${big.culture}.`,
      3,
      { subjects: [oldCulture, big.culture], at: { x: small.x, y: small.y } },
    );
    return null;
  }

  // Leaders steer the dice: peaceable voices raise the odds of peace, warlike lower them.
  // Under vendetta there is no talking at all.
  let accord = kin ? C.ACCORD_THRESHOLD_KIN : C.ACCORD_THRESHOLD;
  for (const l of [leaderA, leaderB]) {
    if (l?.temperament === "peaceable") accord += C.TEMPERAMENT_ACCORD_SHIFT;
    if (l?.temperament === "warlike") accord -= C.TEMPERAMENT_ACCORD_SHIFT;
  }
  if (!vendetta && roll < accord) {
    world.truces.set(key, world.year + C.TRUCE_YEARS);
    logEvent(world, `Elders of the ${a.culture} and the ${b.culture} divide the land of ${where} in peace.`, 2, {
      subjects: [a.culture, b.culture],
      at: { x: a.x, y: a.y },
    });
    return null;
  }

  // Battle. Heroes shield their people; grudges make every battle bloodier;
  // race decides how hard a people hits and how well it endures being hit.
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const brutality = 1 + grudge * C.VENDETTA_LOSS_MULT;
  const raceA = raceOf(world, a.culture);
  const raceB = raceOf(world, b.culture);
  const shieldA = heroOf(world, a.culture) ? C.HERO_LOSS_REDUCTION : 1;
  const shieldB = heroOf(world, b.culture) ? C.HERO_LOSS_REDUCTION : 1;
  const fracA = Math.min(
    0.5,
    (C.BATTLE_LOSS_BASE + world.rng() * C.BATTLE_LOSS_SPREAD) *
      clamp(b.count / a.count, 0.5, 2) *
      brutality *
      shieldA *
      raceB.battleDealt *
      raceA.battleTaken,
  );
  const fracB = Math.min(
    0.5,
    (C.BATTLE_LOSS_BASE + world.rng() * C.BATTLE_LOSS_SPREAD) *
      clamp(a.count / b.count, 0.5, 2) *
      brutality *
      shieldB *
      raceA.battleDealt *
      raceB.battleTaken,
  );
  const lossA = Math.round(a.count * fracA);
  const lossB = Math.round(b.count * fracB);
  a.count -= lossA;
  b.count -= lossB;
  const loser = fracA > fracB ? a : b;
  const winner = loser === a ? b : a;
  const fallen = (lossA + lossB).toLocaleString("en-US");
  const extra = { subjects: [a.culture, b.culture], at: { x: a.x, y: a.y } };

  // Hatred accrues; warlike leaders feed it. Crossing the line is itself history.
  let gained = C.GRUDGE_PER_BATTLE;
  for (const l of [leaderA, leaderB]) if (l?.temperament === "warlike") gained += C.GRUDGE_WARLIKE_BONUS;
  const newGrudge = grudge + gained;
  world.grudges.set(key, newGrudge);
  if (grudge < C.GRUDGE_VENDETTA && newGrudge >= C.GRUDGE_VENDETTA) {
    logEvent(
      world,
      `There will be no peace between the ${a.culture} and the ${b.culture}: the war becomes a hunt.`,
      3,
      extra,
    );
  }

  // Under vendetta: no truce, and a broken people may be destroyed outright
  if (vendetta && loser.count < C.ANNIHILATION_COUNT) {
    const last = !world.pops.some((p) => p !== loser && p.culture === loser.culture);
    logEvent(
      world,
      last
        ? `The ${winner.culture} show no mercy: the ${loser.culture} are wiped from the earth at ${where}.`
        : `The ${winner.culture} show no mercy: the ${loser.culture} of ${where} are put to the sword.`,
      3,
      extra,
    );
    return loser.id;
  }
  if (!vendetta) world.truces.set(key, world.year + C.BATTLE_TRUCE_YEARS);

  // Leaders can fall with their people; victories can raise heroes
  const losingLeader = leaderOf(world, loser.culture);
  if (losingLeader && world.rng() < C.LEADER_BATTLE_DEATH_CHANCE) {
    losingLeader.alive = false;
    const heir = mintFigure(world, loser.culture, "leader");
    logEvent(world, `${losingLeader.name} falls in the fighting at ${where}. ${heir.name} leads the ${loser.culture} now.`, 3, {
      subjects: [loser.culture],
      at: { x: loser.x, y: loser.y },
    });
  }
  for (const [side, chance] of [
    [loser, C.HERO_DEATH_LOSING],
    [winner, C.HERO_DEATH_WINNING],
  ] as const) {
    const hero = heroOf(world, side.culture);
    if (hero && world.rng() < chance) {
      hero.alive = false;
      logEvent(world, `${hero.name} falls in battle; the ${side.culture} mourn.`, 2, {
        subjects: [side.culture],
        at: { x: side.x, y: side.y },
      });
    }
  }
  if (!heroOf(world, winner.culture) && world.rng() < C.HERO_MINT_CHANCE) {
    const hero = mintFigure(world, winner.culture, "hero");
    logEvent(world, `${hero.name} of the ${winner.culture} wins renown in the blood of ${where}.`, 2, {
      subjects: [winner.culture],
      at: { x: winner.x, y: winner.y },
    });
  }

  const refuge = findBestSite(world, loser, 4, C.DESPERATE_RADIUS, 0);
  if (refuge) {
    loser.target = refuge;
    const dir = describeDirection(refuge.x - loser.x, refuge.y - loser.y);
    logEvent(
      world,
      `Blood is shed between the ${a.culture} and the ${b.culture} in ${where}; ${fallen} souls fall, and the ${loser.culture} are driven to the ${dir}.`,
      3,
      extra,
    );
  } else {
    logEvent(
      world,
      `Blood is shed between the ${a.culture} and the ${b.culture} in ${where}; ${fallen} souls fall, and neither yields.`,
      3,
      extra,
    );
  }
  return null;
}

function resolveContests(world: World, pressures: Map<number, { ratio: number; rival: Pop }>): void {
  const annihilated: number[] = [];
  for (const pop of world.pops) {
    if (annihilated.includes(pop.id)) continue;
    const p = pressures.get(pop.id);
    if (!p || p.ratio < C.CONTEST_RATIO || underTruce(world, pop.culture, p.rival.culture)) {
      pop.feud = null;
      continue;
    }
    if (annihilated.includes(p.rival.id)) continue;
    if (pop.feud && pop.feud.rivalId === p.rival.id) pop.feud.seasons++;
    else pop.feud = { rivalId: p.rival.id, seasons: 1 };
    if (pop.feud.seasons < C.FEUD_MIN_SEASONS) continue;
    const chance = Math.min(C.FEUD_CHANCE_MAX, (pop.feud.seasons - C.FEUD_MIN_SEASONS) * C.FEUD_CHANCE_RAMP);
    if (world.rng() < chance) {
      const destroyed = resolveContest(world, pop, p.rival);
      if (destroyed !== null) annihilated.push(destroyed);
    }
  }
  if (annihilated.length) world.pops = world.pops.filter((p) => !annihilated.includes(p.id));
}

// Neighboring settlements of one culture gather into a single, larger one —
// growth turns vertical instead of tiling the map with camps.
function consolidate(world: World): void {
  const absorbed = new Set<number>();
  for (const a of world.pops) {
    if (absorbed.has(a.id) || a.target) continue;
    for (const b of world.pops) {
      if (b === a || absorbed.has(b.id) || b.target || b.culture !== a.culture) continue;
      if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) > C.CONSOLIDATE_DISTANCE) continue;
      const [small, big] = a.count <= b.count ? [a, b] : [b, a];
      big.count += small.count;
      big.plagueSeasons = Math.max(big.plagueSeasons, small.plagueSeasons);
      absorbed.add(small.id);
      logMovement(
        world,
        big.culture,
        `The ${big.culture} of ${describeLocation(world, big.x, big.y)} gather into one settlement.`,
        1,
        { x: big.x, y: big.y },
      );
      if (absorbed.has(a.id)) break;
    }
  }
  if (absorbed.size) world.pops = world.pops.filter((p) => !absorbed.has(p.id));
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

  // Peoples still sleeping stir when their year comes
  if (world.unwoken.length) {
    const due = world.unwoken.filter((u) => u.year <= world.year);
    if (due.length) {
      world.unwoken = world.unwoken.filter((u) => u.year > world.year);
      for (const u of due) {
        world.pops.push(u.pop);
        const leader = mintFigure(world, u.pop.culture, "leader");
        const race = raceOf(world, u.pop.culture).name;
        logEvent(
          world,
          `The ${u.pop.culture} — a people of ${race} — wake in ${describeLocation(world, u.pop.x, u.pop.y)}, led by ${leader.name}.`,
          3,
          { subjects: [u.pop.culture], at: { x: u.pop.x, y: u.pop.y } },
        );
      }
    }
  }

  // Divine influence fades back toward the world's own equilibrium
  for (let i = 0; i < world.tempOffset.length; i++) {
    world.tempOffset[i] *= 1 - C.TEMP_RELAX;
    world.fertilityBonus[i] *= 1 - C.BLESS_DECAY;
  }

  // The water cycle lives: rainfall follows the shifting climate each year,
  // and every few years the rivers redraw their courses to match
  if (world.season === 0) {
    simulateWaterCycle(world);
    if (world.year % C.RIVER_RECARVE_YEARS === 0) {
      const hadRiver = new Map(world.pops.map((p) => [p.id, nearRiver(world, p)]));
      carveRivers(world);
      for (const pop of world.pops) {
        const now = nearRiver(world, pop);
        const before = hadRiver.get(pop.id);
        if (now === before) continue;
        const last = world.riverLog.get(pop.culture);
        if (last !== undefined && world.year - last < C.RIVER_LOG_YEARS) continue;
        world.riverLog.set(pop.culture, world.year);
        logEvent(
          world,
          now
            ? `New waters carve through the lands of the ${pop.culture}.`
            : `The river fails the ${pop.culture}; its bed lies dry.`,
          2,
          { subjects: [pop.culture], at: { x: pop.x, y: pop.y } },
        );
      }
    }
  }
  recomputeClimate(world);
  rebuildClaims(world);

  const pressures = computePressure(world);
  chronicleContests(world, pressures);
  for (const pop of world.pops) updatePop(world, pop, pressures.get(pop.id)?.ratio ?? 0);
  pestilence(world);
  resolveContests(world, pressures);
  consolidate(world);
  figuresTick(world);

  // Old hatreds cool, slowly
  if (world.season === 0) {
    for (const [key, g] of world.grudges) {
      const cooled = g - C.GRUDGE_DECAY_PER_YEAR;
      if (cooled <= 0) world.grudges.delete(key);
      else world.grudges.set(key, cooled);
    }
  }

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
        { subjects: [pop.culture], at: { x: pop.x, y: pop.y } },
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
    logEvent(world, `Your blessing sinks into the soil of ${describeLocation(world, cx, cy)}.`, 3, {
    at: { x: cx, y: cy },
  });
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
    logEvent(world, `You ${verb} ${describeLocation(world, cx, cy)}.`, 3, { at: { x: cx, y: cy } });
  }
}
