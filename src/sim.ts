import * as C from "./constants";
import type { Culture, Pop, Want, World } from "./world";
import { derivedName } from "./names";
import { naturalDisasters, tickFires } from "./disasters";
import { allied, alliedSupport, politiesTick, polityName } from "./nations";
import { armiesTick, atWar, warsTick } from "./war";
import {
  ancestralRuinNear,
  areKin,
  carveRivers,
  computeBaseTemperature,
  cultureOf,
  describeDirection,
  describeLocation,
  heroOf,
  idx,
  isWater,
  leaderOf,
  leaveRuin,
  logEvent,
  mintFigure,
  noteFaith,
  pairKey,
  recordDeed,
  raceHarvestAround,
  raceOf,
  recomputeClimate,
  shiftColor,
  simulateWaterCycle,
  tierOf,
  updateTerritory,
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
  const i = idx(world, x, y);
  // Expansion respects dominion: unclaimed emptiness calls to the crowded,
  // while settling inside another people's borders invites what follows
  const owner = world.territory[i];
  const standing =
    owner === 0
      ? world.claims[i] === 0
        ? 1 + C.PIONEER_BONUS
        : 1
      : owner === culture.id
        ? 1
        : C.FOREIGN_TERRITORY_PENALTY;
  // The old country calls: ground where a people's own ruins stand scores
  // higher for them, so descendants drift back to ancestral land
  const ancestry = ancestralRuinNear(world, culture.name, x, y) ? 1 + C.RECLAIM_PULL : 1;
  return (
    raceHarvestAround(world, raceOf(world, culture.name), x, y, true) *
    comfortAt(world, x, y, culture.comfortTemp) *
    adaptFactor(world, culture.comfortTemp, x, y) *
    standing *
    ancestry
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
      // Truce stays a rival's hand for a while; an alliance sets it down entirely
      if (underTruce(world, pop.culture, p.culture) || allied(world, pop.culture, p.culture)) continue;
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
  // Belief steadies a people: a heard god is a warm hearth in a cold land.
  // A god known to be cruel is a cold wind through every wall.
  const solace = Math.max(-C.FAITH_SAFETY_CAP, Math.min(C.FAITH_SAFETY_CAP, culture.faith * C.FAITH_SAFETY));
  pop.safety = Math.max(0, Math.min(1, comfortAt(world, pop.x, pop.y, culture.comfortTemp) * (1 - squeeze) + solace));

  // Growth: surplus food grows the pop, want and harsh climate shrink it.
  // Each race breeds at its own pace — goblins swarm, elves linger.
  let r = C.BASE_GROWTH * (Math.min(C.GROWTH_SURPLUS_CAP, pop.foodSat) - 1);
  if (r > 0) r *= race.growth;
  r -= (1 - pop.safety) * C.SAFETY_MORTALITY;
  if (pop.target) r -= 0.01; // the road is hard
  r = Math.min(C.MAX_GROWTH, Math.max(C.MAX_DECLINE, r));
  // Catastrophe pierces the ordinary floor: starvation and exposure kill fast.
  // A stoic people, tempered by unanswered hardship, endures it better.
  const tough = 1 - Math.min(C.GRIT_RESILIENCE_CAP, culture.grit * C.GRIT_RESILIENCE);
  r -= Math.max(0, 0.5 - pop.foodSat) * 2 * C.STARVATION_DECLINE * tough;
  r -= Math.max(0, 0.25 - pop.safety) * 4 * C.EXPOSURE_DECLINE * tough;
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
      pop.journey = null;
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
      pop.journey = desperate ? "refugees" : "migrants";
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
        journey: "settlers",
      });
      logMovement(world, pop.culture, `A band of the ${pop.culture} strikes out for distant lands.`, 2, {
        x: site.x,
        y: site.y,
      });
    }
  }
}

// Ground can drown — a god may carve the sea across it, or a shifting river
// pool a lake where a village stood. Survivors flee if there is anywhere to
// go; otherwise the waters close over them.
function floods(world: World): void {
  const drowned: number[] = [];
  for (const pop of world.pops) {
    // Bands in transit are on the road, fording as they go — only settled
    // ground can drown beneath a people
    if (pop.target) continue;
    if (!isWater(world, pop.x, pop.y)) continue;
    const refuge = findBestSite(world, pop, 1, C.DESPERATE_RADIUS, 0);
    if (refuge) {
      pop.x = refuge.x;
      pop.y = refuge.y;
      pop.count = Math.round(pop.count * C.FLOOD_SURVIVAL);
      logEvent(world, `Rising waters drive the ${pop.culture} to higher ground.`, 2, {
        subjects: [pop.culture],
        at: { x: refuge.x, y: refuge.y },
      });
    } else {
      drowned.push(pop.id);
      const last = !world.pops.some((p) => p.id !== pop.id && p.culture === pop.culture);
      logEvent(
        world,
        last
          ? `The waters close over the ${pop.culture}; nothing of them remains.`
          : `The waters close over a settlement of the ${pop.culture}.`,
        3,
        { subjects: [pop.culture], at: { x: pop.x, y: pop.y } },
      );
    }
  }
  if (drowned.length) world.pops = world.pops.filter((p) => !drowned.includes(p.id));
}

// --- Murmurs: what each people yearns for, derived from their lived state.
// Wants surface as whispered prayers and as the inspect card's present tense;
// they are murmurs, never quests — the world asks nothing of its god.
const WHISPERS: Record<Want, (name: string, target: string) => string> = {
  harvest: (n) => `Over thin fields, the ${n} pray for a bountiful earth.`,
  warmth: (n) => `The ${n} huddle at their fires and pray for warmth.`,
  relief: (n) => `The ${n} pray for the merciless sun to relent.`,
  deliverance: (n) => `The ${n} burn sweet herbs and pray for deliverance from the pestilence.`,
  peace: (n) => `The ${n} pray for peace at their borders.`,
  victory: (n) => `The ${n} sharpen iron and call on their god for victory.`,
  horizon: (n) => `The ${n} look past their borders and dream of distant lands.`,
  conquest: (n, t) => `The ${n} covet the lands of the ${t}; iron whispers in their halls.`,
  delving: (n) => `The ${n} sink shafts into the earth, hunting the veins' glitter.`,
};

// Hardship prayers — the kind a god can answer, the kind that erode faith when
// ignored, and the kind that temper a people into stoics when endured alone
const HARDSHIPS: ReadonlySet<Want> = new Set(["harvest", "warmth", "relief", "deliverance"]);
const LOUD_WANTS: ReadonlySet<Want> = new Set(["deliverance", "victory", "conquest"]);

function nearOre(world: World, pops: Pop[]): boolean {
  for (const pop of pops) {
    for (let y = Math.max(0, pop.y - 2); y <= Math.min(world.height - 1, pop.y + 2); y++) {
      for (let x = Math.max(0, pop.x - 2); x <= Math.min(world.width - 1, pop.x + 2); x++) {
        if (world.resources[idx(world, x, y)]) return true;
      }
    }
  }
  return false;
}

function computeWants(world: World): void {
  const byCulture = new Map<string, Pop[]>();
  for (const pop of world.pops) {
    const list = byCulture.get(pop.culture);
    if (list) list.push(pop);
    else byCulture.set(pop.culture, [pop]);
  }
  for (const [name, culture] of world.cultures) {
    const pops = byCulture.get(name);
    if (!pops) {
      culture.want = null;
      culture.wantTarget = null;
      continue;
    }
    let food = 0;
    let strain = 0;
    let comfort = 0;
    let n = 0;
    let plague = false;
    let feud = false;
    for (const pop of pops) {
      food += pop.foodSat * pop.count;
      strain += (world.meanTemperature[idx(world, pop.x, pop.y)] - culture.comfortTemp) * pop.count;
      comfort += comfortAt(world, pop.x, pop.y, culture.comfortTemp) * pop.count;
      n += pop.count;
      if (pop.plagueSeasons > 0) plague = true;
      if (pop.feud) feud = true;
    }
    food /= n;
    strain /= n;
    comfort /= n;

    const prev = culture.want;
    const endured = culture.unheard;
    const leader = leaderOf(world, name);
    let want: Want | null = null;
    culture.wantTarget = null;
    // Needs speak first; ambitions fill the quiet
    // Climate prayers fire on real suffering, not the thermometer: a dwarf
    // hold at -5°C is content in a way no lowlander could be
    if (plague) want = "deliverance";
    else if (food < C.WANT_HUNGER) want = "harvest";
    else if (comfort < C.WANT_EXPOSURE && strain < 0) want = "warmth";
    else if (comfort < C.WANT_EXPOSURE && strain > 0) want = "relief";
    else if (feud) want = leader?.temperament === "warlike" ? "victory" : "peace";
    else if (leader?.temperament === "warlike") {
      // A warlike people at leisure remembers its grudges — the deepest first
      let mostHated: string | null = null;
      let deepest = 0;
      for (const [key, g] of world.grudges) {
        const [a, b] = key.split("|");
        const other = a === name ? b : b === name ? a : null;
        if (!other || !byCulture.has(other) || allied(world, name, other)) continue;
        if (g > deepest) {
          deepest = g;
          mostHated = other;
        }
      }
      if (mostHated) {
        want = "conquest";
        culture.wantTarget = mostHated;
      }
    } else if (leader?.temperament === "ambitious" && pops.some((p) => p.count > C.SPLIT_MIN_COUNT)) {
      want = "horizon";
    } else if (leader?.temperament === "cunning" && nearOre(world, pops)) {
      want = "delving";
    }
    culture.want = want;

    // A hardship endured long and resolved without help tempers a people.
    // The loop closes without the god: no answer was ever owed.
    if (prev && HARDSHIPS.has(prev) && (!want || !HARDSHIPS.has(want)) && endured >= C.GRIT_MIN_SEASONS) {
      culture.grit = Math.min(C.GRIT_MAX, culture.grit + 1);
      const last = world.gritLog.get(name);
      if (last === undefined || world.year - last >= C.GRIT_LOG_YEARS) {
        world.gritLog.set(name, world.year);
        const at = pops[0];
        logEvent(world, `Unanswered, the ${name} find their own way through hardship.`, 2, {
          subjects: [name],
          at: { x: at.x, y: at.y },
        });
      }
      if (!culture.stoicNote && culture.grit >= C.GRIT_STOIC) {
        culture.stoicNote = true;
        logEvent(
          world,
          `The ${name} have learned to expect nothing from the heavens — and to endure.`,
          3,
          { subjects: [name] },
        );
      }
    }

    if (!want || !HARDSHIPS.has(want)) {
      culture.unheard = 0;
      if (!want) continue;
    } else {
      // Long silence erodes belief — gently, and never into forsaking.
      // Only deliberate cruelty can do that.
      culture.unheard++;
      if (culture.unheard >= C.UNHEARD_SEASONS) {
        culture.unheard = 0;
        if (culture.faith > C.NEGLECT_FLOOR) {
          culture.faith--;
          logEvent(world, `The ${name} wonder if their god listens at all.`, 2, { subjects: [name] });
        }
      }
    }
    const last = world.wantLog.get(name);
    if (last !== undefined && world.year - last < C.WANT_LOG_YEARS) continue;
    world.wantLog.set(name, world.year);
    const at = pops[0];
    // Plague and war are drama; the rest is ambient color
    logEvent(world, WHISPERS[want](name, culture.wantTarget ?? ""), LOUD_WANTS.has(want) ? 2 : 1, {
      subjects: [name],
      at: { x: at.x, y: at.y },
    });
  }
}

// A verb that lands near a praying people, and answers what they prayed for,
// is heard. Faith is the memory of being heard; enough of it raises stones.
function hearPrayers(world: World, cx: number, cy: number, kind: Want): void {
  for (const [name, culture] of world.cultures) {
    if (culture.want !== kind) continue;
    const near = world.pops.some(
      (p) => p.culture === name && Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy)) <= C.PRAYER_RADIUS,
    );
    if (!near) continue;
    const last = world.heardLog.get(name);
    if (last !== undefined && world.year - last < C.HEARD_COOLDOWN_YEARS) continue;
    world.heardLog.set(name, world.year);
    culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + 1);
    culture.unheard = 0;
    logEvent(world, `The ${name} rejoice: the heavens have answered their prayers.`, 2, {
      subjects: [name],
      at: { x: cx, y: cy },
    });
    noteFaith(world, culture);
  }
}

// The opposite of an answer: a verb that lands on a praying people and gives
// them the very thing they begged against. Cruelty cuts deeper than silence.
function spitePrayers(world: World, cx: number, cy: number, kind: Want): void {
  for (const [name, culture] of world.cultures) {
    if (culture.want !== kind) continue;
    const near = world.pops.some(
      (p) => p.culture === name && Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy)) <= C.PRAYER_RADIUS,
    );
    if (!near) continue;
    const last = world.spurnedLog.get(name);
    if (last !== undefined && world.year - last < C.SPURNED_COOLDOWN_YEARS) continue;
    world.spurnedLog.set(name, world.year);
    culture.faith = Math.max(-2 * C.FAITH_MONUMENT, culture.faith - 1);
    logEvent(world, `The ${name} cry out: the heavens answer their prayers with mockery.`, 2, {
      subjects: [name],
      at: { x: cx, y: cy },
    });
    noteFaith(world, culture);
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
    // Drift is measured from the race's own baseline — dwarves are not
    // "hardy against the cold" for merely being dwarves
    const drift = culture.comfortTemp - (C.COMFORT_TEMP + raceOf(world, name).comfortShift);
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
      pop.journey = "homeward";
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
        id: world.nextCultureId++,
        race: parent.race, // daughters keep their blood
        color: shiftColor(world.rng, parent.color),
        comfortTemp: parent.comfortTemp,
        parent: parent.name,
        adaptedNote: parent.adaptedNote,
        want: null,
        wantTarget: null,
        faith: Math.floor(parent.faith / 2), // they carry half-remembered rites
        faithNote: 0,
        unheard: 0,
        grit: Math.floor(parent.grit / 2), // and half the calluses
        stoicNote: false,
        polity: null, // nationhood is not inherited — it must be earned again
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
  // Allies within marching range add their weight to the scales — the battle
  // is fought at nation scale even as the losses fall on the pops at hand.
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const brutality = 1 + grudge * C.VENDETTA_LOSS_MULT;
  const raceA = raceOf(world, a.culture);
  const raceB = raceOf(world, b.culture);
  const shieldA = heroOf(world, a.culture) ? C.HERO_LOSS_REDUCTION : 1;
  const shieldB = heroOf(world, b.culture) ? C.HERO_LOSS_REDUCTION : 1;
  const supA = alliedSupport(world, a.culture, a.x, a.y);
  const supB = alliedSupport(world, b.culture, b.x, b.y);
  const weightA = a.count + supA.strength;
  const weightB = b.count + supB.strength;
  const fracA = Math.min(
    0.5,
    (C.BATTLE_LOSS_BASE + world.rng() * C.BATTLE_LOSS_SPREAD) *
      clamp(weightB / weightA, 0.5, 2) *
      brutality *
      shieldA *
      raceB.battleDealt *
      raceA.battleTaken,
  );
  const fracB = Math.min(
    0.5,
    (C.BATTLE_LOSS_BASE + world.rng() * C.BATTLE_LOSS_SPREAD) *
      clamp(weightA / weightB, 0.5, 2) *
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
  const extra = {
    subjects: [a.culture, b.culture, ...supA.names, ...supB.names],
    at: { x: a.x, y: a.y },
  };
  // Allies who marched are part of the story — one clause, not their own line
  const allyClauses: string[] = [];
  if (supA.names.size) allyClauses.push(`the ${[...supA.names].join(" and the ")} fighting beside the ${a.culture}`);
  if (supB.names.size) allyClauses.push(`the ${[...supB.names].join(" and the ")} beside the ${b.culture}`);
  const allyNote = allyClauses.length ? ` — ${allyClauses.join(", ")}` : "";

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

  // Under vendetta: no truce, and a broken people may be destroyed outright.
  // Where a village or better stood, its bones stay on the land.
  if (vendetta && loser.count < C.ANNIHILATION_COUNT) {
    const last = !world.pops.some((p) => p !== loser && p.culture === loser.culture);
    if (loser.tier >= C.RUIN_WAR_MIN_TIER) leaveRuin(world, loser);
    recordDeed(world, "annihilation", winner.culture, loser.culture);
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
    loser.journey = "refugees";
    const dir = describeDirection(refuge.x - loser.x, refuge.y - loser.y);
    logEvent(
      world,
      `Blood is shed between the ${a.culture} and the ${b.culture} in ${where}${allyNote}; ${fallen} souls fall, and the ${loser.culture} are driven to the ${dir}.`,
      3,
      extra,
    );
  } else {
    logEvent(
      world,
      `Blood is shed between the ${a.culture} and the ${b.culture} in ${where}${allyNote}; ${fallen} souls fall, and neither yields.`,
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
    // A declared war is fought by hosts, not by feud dice — the armies carry it
    if (atWar(world, pop.culture, p.rival.culture)) {
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

// --- Ruins: the bones of dead settlements, and who stands on them ---
// Descendants who settle beside their people's ruins raise them anew — a
// homecoming worth history. Strangers who build on another people's dead
// earn a grudge that feeds everything grudges feed. Untouched, the old
// stones sink into the grass.
function ruinsTick(world: World): void {
  for (const [i, ruin] of world.ruins) {
    if (world.year - ruin.year > C.RUIN_LIFETIME || isWater(world, ruin.x, ruin.y)) {
      world.ruins.delete(i);
      if (!isWater(world, ruin.x, ruin.y)) {
        logEvent(world, `The old stones of the ${ruin.culture} in ${describeLocation(world, ruin.x, ruin.y)} sink at last into the grass.`, 1, {
          subjects: [ruin.culture],
          at: { x: ruin.x, y: ruin.y },
        });
      }
      continue;
    }
    const near = world.pops.filter(
      (p) => !p.target && Math.max(Math.abs(p.x - ruin.x), Math.abs(p.y - ruin.y)) <= C.RUIN_RECLAIM_RADIUS,
    );
    if (!near.length) continue;
    const heir = near.find((p) => p.culture === ruin.culture || areKin(world, p.culture, ruin.culture));
    if (heir) {
      world.ruins.delete(i);
      logEvent(
        world,
        ruin.culture === heir.culture
          ? `The ${heir.culture} return to the ruins of their fathers in ${describeLocation(world, ruin.x, ruin.y)}; the old stones are raised anew.`
          : `The ${heir.culture} raise anew the old stones of their kin, the ${ruin.culture}, in ${describeLocation(world, ruin.x, ruin.y)}.`,
        3,
        { subjects: [heir.culture, ruin.culture], at: { x: ruin.x, y: ruin.y } },
      );
      continue;
    }
    if (!ruin.desecrated) {
      ruin.desecrated = true;
      const squatter = near.sort((a, b) => b.count - a.count)[0];
      if (world.pops.some((p) => p.culture === ruin.culture)) {
        const key = pairKey(squatter.culture, ruin.culture);
        world.grudges.set(key, Math.min(C.GRUDGE_CAP, (world.grudges.get(key) ?? 0) + C.RUIN_TRESPASS_GRUDGE));
        logEvent(
          world,
          `The ${squatter.culture} build their homes on the bones of the ${ruin.culture}'s dead; it will not be forgiven.`,
          2,
          { subjects: [squatter.culture, ruin.culture], at: { x: ruin.x, y: ruin.y } },
        );
      } else {
        logEvent(world, `Strangers of the ${squatter.culture} raise their roofs among the ruins of the ${ruin.culture}.`, 1, {
          subjects: [squatter.culture, ruin.culture],
          at: { x: ruin.x, y: ruin.y },
        });
      }
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
  tickFires(world); // lightning, spreading fire, healing char — before anyone harvests
  rebuildClaims(world);
  if (world.season === 0) {
    naturalDisasters(world); // old peaks sometimes wake on their own
    updateTerritory(world);
    politiesTick(world); // nations read the fresh borders: foundings, ranks, alliances
    warsTick(world); // declarations, musters, and weary peaces
    ruinsTick(world); // homecomings, desecrations, and stones sinking into grass
  }
  floods(world);

  const pressures = computePressure(world);
  chronicleContests(world, pressures);
  for (const pop of world.pops) updatePop(world, pop, pressures.get(pop.id)?.ratio ?? 0);
  pestilence(world);
  resolveContests(world, pressures);
  armiesTick(world); // hosts march, hunger, fight, and break
  consolidate(world);
  figuresTick(world);

  // Old hatreds cool, slowly — but a pair with remembered deeds between them
  // never cools all the way. A sacked city is a story told to grandchildren.
  if (world.season === 0) {
    for (const [key, g] of world.grudges) {
      const floor = world.deeds.has(key) ? C.DEED_GRUDGE_FLOOR : 0;
      const cooled = Math.min(C.GRUDGE_CAP, Math.max(floor, g - C.GRUDGE_DECAY_PER_YEAR));
      if (cooled <= 0) world.grudges.delete(key);
      else world.grudges.set(key, cooled);
    }
  }

  const dead = world.pops.filter((p) => p.count < C.EXTINCTION_COUNT);
  if (dead.length) {
    world.pops = world.pops.filter((p) => p.count >= C.EXTINCTION_COUNT);
    for (const pop of dead) {
      const survives = world.pops.some((p) => p.culture === pop.culture);
      // Where a town or better faded, its bones stay on the land
      if (pop.tier >= C.RUIN_MIN_TIER) leaveRuin(world, pop);
      // A nation's fall belongs in the same breath as its people's passing
      const wasNation = !survives && world.cultures.get(pop.culture)?.polity;
      logEvent(
        world,
        survives
          ? `A band of the ${pop.culture} dwindles and is gone.`
          : wasNation
            ? `The last of the ${pop.culture} pass into memory; the ${polityName(world.cultures.get(pop.culture)!)} is no more.`
            : `The last of the ${pop.culture} pass into memory.`,
        survives ? 1 : 3,
        { subjects: [pop.culture], at: { x: pop.x, y: pop.y } },
      );
    }
  }
  adaptCultures(world);
  schisms(world);
  recordCultureMilestones(world);
  computeWants(world);
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
    hearPrayers(world, cx, cy, "harvest");
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
    hearPrayers(world, cx, cy, direction > 0 ? "warmth" : "relief");
    // The same breath that answers one prayer can mock its opposite:
    // freeze the people begging for warmth and they will know it was you
    spitePrayers(world, cx, cy, direction > 0 ? "relief" : "warmth");
  }
}

// Heal: the god's breath drives out pestilence. Pure sim input — it clears
// the plague counters the outbreak logic set, nothing more.
export function healPestilence(world: World, cx: number, cy: number, announce = true): void {
  let cured = false;
  for (const pop of world.pops) {
    if (
      pop.plagueSeasons > 0 &&
      Math.max(Math.abs(pop.x - cx), Math.abs(pop.y - cy)) <= C.HEAL_RADIUS
    ) {
      pop.plagueSeasons = 0;
      cured = true;
    }
  }
  if (announce) {
    if (cured) {
      logEvent(world, `Your breath sweeps ${describeLocation(world, cx, cy)}, and the pestilence flees before it.`, 3, {
        at: { x: cx, y: cy },
      });
      hearPrayers(world, cx, cy, "deliverance");
    } else {
      logEvent(world, `Your breath passes over ${describeLocation(world, cx, cy)}, finding no sickness there.`, 3, {
        at: { x: cx, y: cy },
      });
    }
  }
}

// Smite: divine wrath falls on a place. The struck know whose hand it was —
// faith curdles — while their sworn enemies, praying for victory, rejoice.
export function smite(world: World, cx: number, cy: number, announce = true): void {
  let slain = 0;
  const struck = new Set<string>();
  for (const pop of world.pops) {
    if (Math.max(Math.abs(pop.x - cx), Math.abs(pop.y - cy)) > C.SMITE_RADIUS) continue;
    const loss = Math.round(pop.count * C.SMITE_FRACTION);
    pop.count -= loss;
    slain += loss;
    struck.add(pop.culture);
  }
  if (!announce) return;
  const where = describeLocation(world, cx, cy);
  logEvent(
    world,
    slain > 0
      ? `Your wrath falls upon ${where}; ${slain.toLocaleString("en-US")} souls perish.`
      : `Your wrath scars the empty land of ${where}.`,
    3,
    { at: { x: cx, y: cy } },
  );
  for (const name of struck) {
    const culture = world.cultures.get(name)!;
    const last = world.spurnedLog.get(name);
    if (last !== undefined && world.year - last < C.SPURNED_COOLDOWN_YEARS) continue;
    world.spurnedLog.set(name, world.year);
    culture.faith = Math.max(-2 * C.FAITH_MONUMENT, culture.faith - 1);
    logEvent(world, `The ${name} know their god's hand in the slaughter.`, 2, {
      subjects: [name],
      at: { x: cx, y: cy },
    });
    noteFaith(world, culture);
  }
  // Word of wrath travels: enemies of the struck take it as their answer
  for (const [name, culture] of world.cultures) {
    if (culture.want !== "victory" && culture.want !== "conquest") continue;
    if (![...struck].some((h) => h !== name && world.grudges.has(pairKey(name, h)))) continue;
    const last = world.heardLog.get(name);
    if (last !== undefined && world.year - last < C.HEARD_COOLDOWN_YEARS) continue;
    world.heardLog.set(name, world.year);
    culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + 1);
    logEvent(world, `The ${name} rejoice: the heavens strike at their enemy.`, 2, {
      subjects: [name],
      at: { x: cx, y: cy },
    });
    noteFaith(world, culture);
  }
}

// The god reshapes the bones of the earth. Elevation is the root of every
// derived layer, so climate follows at once; winds, rivers, and coasts settle
// when the channeling ends (the UI calls settleHydrology on release).
export function sculptLand(
  world: World,
  cx: number,
  cy: number,
  direction: 1 | -1,
  announce = true,
): void {
  const r = C.SCULPT_RADIUS;
  const where = describeLocation(world, cx, cy);
  for (let y = Math.max(0, cy - r); y <= Math.min(world.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(world.width - 1, cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const i = idx(world, x, y);
      world.elevation[i] = Math.min(
        1,
        Math.max(0, world.elevation[i] + C.SCULPT_STRENGTH * direction * (1 - d / r)),
      );
      if (world.elevation[i] < C.SEA_LEVEL) world.resources[i] = 0; // drowned veins are lost to the deep
    }
  }
  computeBaseTemperature(world);
  recomputeClimate(world);
  if (announce) {
    logEvent(
      world,
      direction > 0
        ? `You raise the bones of the earth in ${where}.`
        : `You bid the waters swallow ${where}.`,
      3,
      { at: { x: cx, y: cy } },
    );
  }
}
