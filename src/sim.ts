import * as C from "./constants";
import type { Culture, Pop, Want, World } from "./world";
import { derivedName } from "./names";
import { forgeTick, recoverArtifacts, strandArtifacts } from "./artifacts";
import { nearRoad, roadsTick } from "./roads";
import { tradeTick } from "./trade";
import { becalmBeasts, beastsTick, smiteBeasts } from "./beasts";
import { mintArtifact } from "./artifacts";
import { ignite, naturalDisasters, tickFires } from "./disasters";
import { allied, alliedSupport, politiesTick, polityName } from "./nations";
import { armiesTick, atWar, warsTick } from "./war";
import { creedKnob, creedTick, regard } from "./faith";
import type { Aspect, Figure } from "./world";
import { AMBITION_TEXT, latitude } from "./world";
import {
  ancestralRuinNear,
  areKin,
  carveRivers,
  computeBaseTemperature,
  cultureOf,
  describeDirection,
  describeLocation,
  globalDrift,
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
  recordKill,
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
  // higher for them, so descendants drift back to ancestral land.
  // And the road calls too — hamlets string along it on their own.
  const ancestry = ancestralRuinNear(world, culture.name, x, y) ? 1 + C.RECLAIM_PULL : 1;
  const roadside = nearRoad(world, x, y) ? 1 + C.ROAD_SETTLE_BONUS : 1;
  return (
    raceHarvestAround(world, raceOf(world, culture.name), x, y, true) *
    comfortAt(world, x, y, culture.comfortTemp) *
    adaptFactor(world, culture.comfortTemp, x, y) *
    standing *
    ancestry *
    roadside
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
  // A beast in reach is a terror on the same scale as a rival host — fear
  // rides the pressure machinery, so flight and decline follow for free
  for (const beast of world.beasts) {
    if (!beast.alive || beast.sleepUntil > world.year) continue; // a sleeping terror is no terror
    const R = C.BEAST_FEAR_RADIUS[beast.kind];
    for (const pop of world.pops) {
      if (Math.max(Math.abs(pop.x - beast.x), Math.abs(pop.y - beast.y)) > R) continue;
      const dread = (beast.power / Math.max(1, pop.count)) * C.BEAST_FEAR_FACTOR;
      const cur = pressures.get(pop.id);
      if (cur) cur.ratio += dread;
      else pressures.set(pop.id, { ratio: dread, rival: pop }); // rival unused for pure dread
    }
  }
  return pressures;
}

function chronicleContests(world: World, pressures: Map<number, { ratio: number; rival: Pop }>): void {
  for (const pop of world.pops) {
    const p = pressures.get(pop.id);
    if (!p || p.ratio < C.CONTEST_RATIO || p.rival.id === pop.id) continue; // pure beast-dread is not a border contest
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
  // Allied wagons top up the larder — trade writes into the same number
  const rawSat = Math.min(1.5, capacity / Math.max(1, pop.count) + (world.tradeBoost.get(pop.culture) ?? 0));
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
      // Arriving refugees keep their journey mark one beat longer: the
      // arrivals pass merges them into whoever takes them in
      if (pop.journey === "refugees") return;
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

// Refugees who reach kin or sworn friends do not pitch a camp next door —
// they crowd in. The host takes their souls and their hunger in one motion:
// same fields, more mouths, and the larder math does the rest.
function refugeeArrivals(world: World): void {
  const taken = new Set<number>();
  for (const pop of world.pops) {
    if (pop.target || pop.journey !== "refugees" || taken.has(pop.id)) continue;
    pop.journey = null;
    let host: Pop | null = null;
    for (const p of world.pops) {
      if (p === pop || p.target || taken.has(p.id)) continue;
      if (Math.max(Math.abs(p.x - pop.x), Math.abs(p.y - pop.y)) > 1) continue;
      const shelter =
        p.culture === pop.culture || areKin(world, p.culture, pop.culture) || allied(world, p.culture, pop.culture);
      if (!shelter) continue;
      if (!host || p.count > host.count) host = p;
    }
    if (!host) {
      logMovement(world, pop.culture, `The ${pop.culture} settle in ${describeLocation(world, pop.x, pop.y)}.`, 1, {
        x: pop.x,
        y: pop.y,
      });
      continue;
    }
    const strained = (host.foodSat * host.count + pop.foodSat * pop.count) / Math.max(1, host.count + pop.count);
    if (pop.count >= host.count * 0.2) {
      const strainNote = strained < 0.9 ? "; there are more mouths now than bread" : "";
      logEvent(
        world,
        host.culture === pop.culture
          ? `Refugees of the ${pop.culture} crowd in among their own in ${describeLocation(world, host.x, host.y)}${strainNote}.`
          : `Refugees of the ${pop.culture} find shelter among the ${host.culture}${strainNote}.`,
        1,
        { subjects: [pop.culture, host.culture], at: { x: host.x, y: host.y } },
      );
    }
    host.foodSat = strained;
    host.count += pop.count;
    host.plagueSeasons = Math.max(host.plagueSeasons, pop.plagueSeasons); // pestilence walks in with them
    taken.add(pop.id);
  }
  if (taken.size) world.pops = world.pops.filter((p) => !taken.has(p.id));
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
  beast: (n, t) => `The ${n} bar their doors at dusk; they pray their god drive ${t} from the land.`,
  peace: (n) => `The ${n} pray for peace at their borders.`,
  victory: (n) => `The ${n} sharpen iron and call on their god for victory.`,
  horizon: (n) => `The ${n} look past their borders and dream of distant lands.`,
  conquest: (n, t) => `The ${n} covet the lands of the ${t}; iron whispers in their halls.`,
  delving: (n) => `The ${n} sink shafts into the earth, hunting the veins' glitter.`,
};

// Hardship prayers — the kind a god can answer, the kind that erode faith when
// ignored, and the kind that temper a people into stoics when endured alone
const HARDSHIPS: ReadonlySet<Want> = new Set(["harvest", "warmth", "relief", "deliverance", "beast"]);
const LOUD_WANTS: ReadonlySet<Want> = new Set(["deliverance", "beast", "victory", "conquest"]);

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
    let terror: string | null = null;
    for (const beast of world.beasts) {
      if (!beast.alive || beast.sleepUntil > world.year) continue;
      const R = C.BEAST_FEAR_RADIUS[beast.kind];
      if (pops.some((p) => Math.max(Math.abs(p.x - beast.x), Math.abs(p.y - beast.y)) <= R)) {
        terror = beast.name;
        break;
      }
    }
    if (plague) want = "deliverance";
    else if (terror) {
      want = "beast";
      culture.wantTarget = terror;
    } else if (food < C.WANT_HUNGER) want = "harvest";
    else if (comfort < C.WANT_EXPOSURE && strain < 0) want = "warmth";
    else if (comfort < C.WANT_EXPOSURE && strain > 0) want = "relief";
    else if (feud) want = leader?.temperament === "warlike" ? "victory" : "peace";
    else if (leader?.temperament === "warlike" || leader?.ambition === "conquest") {
      // A warlike people at leisure remembers its grudges — the deepest
      // first. A leader who dreams of banners taken reads the same list.
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
      // A people with a great house bears the silence longer: the rites go on
      if (culture.unheard >= C.UNHEARD_SEASONS * (culture.temple !== null ? C.TEMPLE_PATIENCE : 1)) {
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
function hearPrayers(world: World, cx: number, cy: number, kind: Want): boolean {
  let heard = false;
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
    heard = true;
    logEvent(world, `The ${name} rejoice: the heavens have answered their prayers.`, 2, {
      subjects: [name],
      at: { x: cx, y: cy },
    });
    noteFaith(world, culture);
  }
  return heard;
}

// The opposite of an answer: a verb that lands on a praying people and gives
// them the very thing they begged against. Cruelty cuts deeper than silence.
function spitePrayers(world: World, cx: number, cy: number, kind: Want): boolean {
  let spited = false;
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
    spited = true;
    logEvent(world, `The ${name} cry out: the heavens answer their prayers with mockery.`, 2, {
      subjects: [name],
      at: { x: cx, y: cy },
    });
    noteFaith(world, culture);
  }
  return spited;
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
        regard: { ...parent.regard }, // the same god, seen with the same eyes
        creed: parent.creed ? { ...parent.creed } : null,
        temple: null,
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
        raceOf(world, pop.culture).plagueResist *
        creedKnob(world, pop.culture, "plague"); // the Healer's people keep their houses clean
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

// What a life amounts to, weighed against its stated dream
function ambitionEpitaph(world: World, f: import("./world").Figure, dynastic: boolean): string {
  if (!f.ambition) return "";
  if (f.ambition === "dynasty") {
    return dynastic ? " Their dream stands: the line endures." : " Their dream dies with them: the line is ended.";
  }
  if (f.ambition === "renown") {
    return f.kills.length >= 2 ? " The name will be sung, as they dreamed." : " The songs they dreamed of were never made.";
  }
  if (f.ambition === "conquest") {
    const took = world.pops.some((p) => p.culture === f.culture && p.yoke !== null);
    return took ? " They died holding what they dreamed of taking." : " The banners they dreamed of taking were never taken.";
  }
  return " They dreamed of never dying, and died as all things die.";
}

// --- Figures: they age, sicken, fall, are succeeded — and sometimes go home ---
function figuresTick(world: World): void {
  const living = new Set(world.pops.map((p) => p.culture));
  for (const f of world.figures) {
    if (!f.alive) continue;
    if (!living.has(f.culture)) {
      f.alive = false; // their people's extinction is their epitaph
      continue;
    }
    // The Cacame engine's second act: a risen captive may return to their blood
    if (
      f.birthCulture &&
      f.birthCulture !== f.culture &&
      living.has(f.birthCulture) &&
      !heroOf(world, f.birthCulture) &&
      world.rng() < C.CAPTIVE_DEFECT_CHANCE
    ) {
      const captor = f.culture;
      const wasLeader = f.role === "leader";
      f.culture = f.birthCulture;
      f.role = "hero";
      logEvent(
        world,
        `${f.name} abandons the ${captor} and returns to the blood of the ${f.birthCulture}; they are received as one come home.`,
        3,
        { subjects: [captor, f.birthCulture] },
      );
      if (wasLeader) {
        const heir = mintFigure(world, captor, "leader");
        logEvent(world, `The ${captor}'s seat stands empty; ${heir.name} takes it.`, 2, { subjects: [captor] });
      }
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
      // Most crowns pass down a line; sometimes an outsider takes the reins.
      // A dreamed-of dynasty holds a little harder.
      const heir = mintFigure(world, f.culture, "leader");
      const dynastic = world.rng() < C.DYNASTY_CHANCE + (f.ambition === "dynasty" ? 0.25 : 0);
      if (dynastic) heir.parent = f.id;
      logEvent(
        world,
        (dynastic
          ? `${f.name} of the ${f.culture} ${death}. ${heir.name}, of ${f.name.split(" ")[0]}'s line, leads the ${f.culture} now.`
          : `${f.name} of the ${f.culture} ${death}. The line is broken; ${heir.name} takes the reins.`) +
          ambitionEpitaph(world, f, dynastic),
        3,
        { subjects: [f.culture] },
      );
    } else if (f.role === "prophet") {
      logEvent(
        world,
        f.prophecy && f.prophecy.fulfilled === null
          ? `${f.name}, prophet of the ${f.culture}, ${death} with their word unproven.`
          : `${f.name}, prophet of the ${f.culture}, ${death}.`,
        2,
        { subjects: [f.culture] },
      );
    } else {
      logEvent(world, `${f.name}, hero of the ${f.culture}, ${death}.${ambitionEpitaph(world, f, false)}`, 2, {
        subjects: [f.culture],
      });
    }
    // The famed are laid in stone — and stone remembers
    if (f.kills.length >= C.TOMB_KILLS) {
      const seat = world.pops.filter((p) => p.culture === f.culture).sort((a, b) => b.count - a.count)[0];
      if (seat) {
        const i = idx(world, seat.x, seat.y);
        if (!world.monuments.has(i)) {
          world.monuments.set(i, {
            kind: "tomb",
            culture: f.culture,
            note: `the tomb of ${f.name}`,
            year: world.year,
            desecrated: false,
          });
          logEvent(world, `The ${f.culture} lay ${f.name} in a tomb of stone.`, 1, {
            subjects: [f.culture],
            at: { x: seat.x, y: seat.y },
          });
        }
      }
    }
  }
}

// --- Monuments: standing on another people's dead is not forgiven, and
// standing again at your own is remembering ---
function monumentsTick(world: World): void {
  for (const [i, m] of world.monuments) {
    const maker = world.cultures.get(m.culture);
    if (!maker) continue;
    const ownerId = world.territory[i];
    const owner = ownerId === 0 ? null : [...world.cultures.values()].find((c) => c.id === ownerId);
    const foreign = owner && owner.name !== m.culture && !areKin(world, owner.name, m.culture);
    if (foreign && !m.desecrated) {
      m.desecrated = true;
      if (world.pops.some((p) => p.culture === m.culture)) {
        const key = pairKey(owner.name, m.culture);
        world.grudges.set(key, Math.min(C.GRUDGE_CAP, (world.grudges.get(key) ?? 0) + 1));
        logEvent(world, `The ${owner.name} hold the ground where ${m.note} stands; the ${m.culture} do not forgive it.`, 2, {
          subjects: [owner.name, m.culture],
          at: { x: i % world.width, y: (i / world.width) | 0 },
        });
      }
    } else if (!foreign && m.desecrated && owner?.name === m.culture) {
      m.desecrated = false;
      logEvent(world, `The ${m.culture} stand again at ${m.note}; the old wrongs are remembered.`, 2, {
        subjects: [m.culture],
        at: { x: i % world.width, y: (i / world.width) | 0 },
      });
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
  // And the god each side knows: the Quiet Voice's people talk, the Burning One's do not
  accord += creedKnob(world, a.culture, "accord") + creedKnob(world, b.culture, "accord");
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
    logEvent(
      world,
      last
        ? `The ${winner.culture} show no mercy: the ${loser.culture} are wiped from the earth at ${where}.`
        : `The ${winner.culture} show no mercy: the ${loser.culture} of ${where} are put to the sword.`,
      3,
      { ...extra, epochal: last },
    );
    recordDeed(world, "annihilation", winner.culture, loser.culture); // after the telling, so an avenge line follows its cause
    return loser.id;
  }
  if (!vendetta) world.truces.set(key, world.year + C.BATTLE_TRUCE_YEARS);

  // Leaders can fall with their people; victories can raise heroes
  const losingLeader = leaderOf(world, loser.culture);
  if (losingLeader && world.rng() < C.LEADER_BATTLE_DEATH_CHANCE) {
    losingLeader.alive = false;
    // A fallen leader goes on the enemy champion's ledger, if one stood
    // there — and a slain king is a deed his line remembers for a century
    const slayer = heroOf(world, winner.culture);
    if (slayer) recordKill(world, slayer, `${losingLeader.name}, who led the ${loser.culture}`);
    const heir = mintFigure(world, loser.culture, "leader");
    if (world.rng() < C.DYNASTY_CHANCE) heir.parent = losingLeader.id;
    logEvent(world, `${losingLeader.name} falls in the fighting at ${where}. ${heir.name} leads the ${loser.culture} now.`, 3, {
      subjects: [loser.culture],
      at: { x: loser.x, y: loser.y },
    });
    recordDeed(world, "regicide", winner.culture, loser.culture); // after the telling, so an avenge line follows its cause
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
  if (!heroOf(world, winner.culture) && world.rng() < C.HERO_MINT_CHANCE * creedKnob(world, winner.culture, "hero")) {
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
    if (!p || p.ratio < C.CONTEST_RATIO || p.rival.id === pop.id || underTruce(world, pop.culture, p.rival.culture)) {
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
      recoverArtifacts(world, heir.culture, ruin.x, ruin.y); // the rubble may hold more than stones
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

// --- The yoke: conquered pops remember who they were. Given a generation
// or two of quiet rule, the old name becomes a story and the yoke dissolves.
// Given a distracted or cruel master, it becomes a banner. A revolt can
// even raise a fallen people from extinction — the name never died, only
// the ones who carried it.
function yokeTick(world: World): void {
  for (const pop of world.pops) {
    if (!pop.yoke) continue;
    const origin = pop.yoke.of;
    if (origin === pop.culture || !world.cultures.has(origin)) {
      pop.yoke = null;
      continue;
    }
    if (world.year - pop.yoke.since >= C.YOKE_ASSIMILATION_YEARS) {
      pop.yoke = null;
      logEvent(world, `In ${describeLocation(world, pop.x, pop.y)}, none now remember another name than the ${pop.culture}.`, 1, {
        subjects: [pop.culture, origin],
        at: { x: pop.x, y: pop.y },
      });
      continue;
    }
    // Weak masters invite bold subjects
    let chance = C.YOKE_REVOLT_CHANCE;
    const masterAtWar = [...world.wars.values()].some(
      (w) => w.attackers.includes(pop.culture) || w.defenders.includes(pop.culture),
    );
    if (masterAtWar) chance *= C.YOKE_REVOLT_WAR_MULT;
    if (pop.inFamine || pop.safety < 0.5) chance *= C.YOKE_REVOLT_HARDSHIP_MULT;
    if (world.rng() >= chance) continue;
    revolt(world, pop);
  }
}

// A conquered people casts off its masters: the same souls, the old name.
// The yoke tick rolls for it; the Unyoke verb commands it.
function revolt(world: World, pop: Pop, byGod = false): void {
  const origin = pop.yoke!.of;
  const master = pop.culture;
  const originAlive = world.pops.some((p) => p !== pop && p.culture === origin);
  pop.culture = origin;
  pop.yoke = null;
  pop.feud = null;
  const key = pairKey(master, origin);
  world.grudges.set(key, Math.min(C.GRUDGE_CAP, (world.grudges.get(key) ?? 0) + C.YOKE_REVOLT_GRUDGE));
  const how = byGod ? "at the god's word" : "";
  if (!originAlive && !leaderOf(world, origin)) {
    const leader = mintFigure(world, origin, "leader");
    logEvent(
      world,
      `In ${describeLocation(world, pop.x, pop.y)}, the banner of the fallen ${origin} rises again${how ? ` ${how}` : ""}; ${leader.name} leads them out from under the ${master}'s yoke.`,
      3,
      { subjects: [origin, master], at: { x: pop.x, y: pop.y } },
    );
  } else {
    logEvent(
      world,
      `The ${origin} of ${describeLocation(world, pop.x, pop.y)} cast off the ${master}'s yoke${how ? ` ${how}` : ""}.`,
      3,
      { subjects: [origin, master], at: { x: pop.x, y: pop.y } },
    );
  }
}

// --- Ages: the chronicle gets chapters. The name of the age is derived
// from the state of the world, held for a few years before it is
// proclaimed, so history has a table of contents instead of a scroll.
function candidateAge(world: World): string {
  let souls = 0;
  const living = new Set<string>();
  for (const pop of world.pops) {
    souls += pop.count;
    living.add(pop.culture);
  }
  if (souls < C.AGE_MIN_SOULS) return "the Age of Beginnings";
  if (world.wars.size >= C.AGE_BLOOD_WARS) return "the Age of Blood";
  let nations = 0;
  let imperial = false;
  for (const name of living) {
    const p = world.cultures.get(name)?.polity;
    if (!p) continue;
    nations++;
    if (p.rank === 3) imperial = true;
  }
  // A peace is only Long if war has ever darkened the world at all
  if (nations >= 2 && world.lastWarYear > 0 && world.year - world.lastWarYear >= C.LONG_PEACE_YEARS) {
    return "the Long Peace";
  }
  if (imperial) return "the Age of Empires";
  if (nations >= 3) return "the Age of Nations";
  if (nations >= 1) return "the Age of Founding";
  return "the Age of Wandering";
}

function agesTick(world: World): void {
  const cand = candidateAge(world);
  if (cand === world.age) {
    world.agePending = null;
    return;
  }
  if (world.agePending?.name === cand) world.agePending.years++;
  else world.agePending = { name: cand, years: 1 };
  if (world.agePending.years < C.AGE_HYSTERESIS_YEARS) return;
  world.age = cand;
  world.ageSince = world.year;
  world.agePending = null;
  logEvent(world, `An age turns: these years will be called ${cand}.`, 3, { epochal: true });
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
  // Ash settles out of the sky, and the chronicle marks the sun's return
  world.ashVeil *= C.ASH_VEIL_DECAY;
  if (world.ashNote && world.ashVeil < 0.3) {
    world.ashNote = false;
    logEvent(world, "The skies clear at last; the sun returns in its strength.", 2);
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
  stormsTick(world); // called weather rides the wind: rain, surge, lightning
  tickFires(world); // lightning, spreading fire, healing char — before anyone harvests
  rebuildClaims(world);
  if (world.season === 0) {
    naturalDisasters(world); // old peaks sometimes wake on their own
    tradeTick(world); // the wagons roll where oaths and roads allow
    roadsTick(world); // and the roads follow the wagons
    updateTerritory(world);
    politiesTick(world); // nations read the fresh borders: foundings, ranks, alliances
    warsTick(world); // declarations, musters, and weary peaces
    ruinsTick(world); // homecomings, desecrations, and stones sinking into grass
    yokeTick(world); // conquered peoples assimilate — or cast off their masters
    forgeTick(world); // imperial smiths sometimes add to the world's treasure
    monumentsTick(world); // stone remembers, and remembers being stood upon
    creedTick(world); // the peoples name their god by what they have seen it do
    agesTick(world); // and the chronicle turns its chapters
  }
  floods(world);

  const pressures = computePressure(world);
  chronicleContests(world, pressures);
  for (const pop of world.pops) updatePop(world, pop, pressures.get(pop.id)?.ratio ?? 0);
  refugeeArrivals(world); // the desperate crowd in with kin, and are counted at the table
  pestilence(world);
  resolveContests(world, pressures);
  armiesTick(world); // hosts march, hunger, fight, and break
  beastsTick(world); // the third force roams, raids, and is hunted
  consolidate(world);
  figuresTick(world);

  // Old hatreds cool, slowly — but a pair with remembered deeds between them
  // never cools all the way. A sacked city is a story told to grandchildren.
  if (world.season === 0) {
    // The world takes its own pulse once a year — souls and the warmth of
    // the age, the raw material of the world panel's strip graphs
    let souls = 0;
    for (const p of world.pops) souls += p.count;
    world.history.push({ year: world.year, souls, drift: globalDrift(world) });
    for (const [key, g] of world.grudges) {
      const floor = world.deeds.has(key) ? C.DEED_GRUDGE_FLOOR : 0;
      // The Peace-Giver's people let go sooner
      const [ga, gb] = key.split("|");
      const cool = Math.max(creedKnob(world, ga, "grudgeCool"), creedKnob(world, gb, "grudgeCool"));
      const cooled = Math.min(C.GRUDGE_CAP, Math.max(floor, g - C.GRUDGE_DECAY_PER_YEAR * cool));
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
      // What the last of a people held falls where they fell
      if (!survives) strandArtifacts(world, pop.culture, { x: pop.x, y: pop.y });
      logEvent(
        world,
        survives
          ? `A band of the ${pop.culture} dwindles and is gone.`
          : wasNation
            ? `The last of the ${pop.culture} pass into memory; the ${polityName(world.cultures.get(pop.culture)!)} is no more.`
            : `The last of the ${pop.culture} pass into memory.`,
        survives ? 1 : 3,
        { subjects: [pop.culture], at: { x: pop.x, y: pop.y }, epochal: !survives },
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
    regard(world, cx, cy, "life");
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
    const mocked = spitePrayers(world, cx, cy, direction > 0 ? "relief" : "warmth");
    regard(world, cx, cy, mocked ? "wrath" : "life", mocked ? 1.5 : 1);
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
      regard(world, cx, cy, "life");
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
  // Wrath falls on the named too: a figure at a smitten seat may be struck down
  if (announce) {
    for (const name of struck) {
      const seat = world.pops.filter((p) => p.culture === name).sort((a, b) => b.count - a.count)[0];
      if (!seat || Math.max(Math.abs(seat.x - cx), Math.abs(seat.y - cy)) > C.SMITE_RADIUS) continue;
      strikeFigures(world, name, cx, cy);
    }
  }
  // Wrath falls on beasts too — and a beast broken by the god answers the
  // prayers of everyone who barred their doors against it
  const brokeBeast = smiteBeasts(world, cx, cy, C.SMITE_RADIUS, C.SMITE_BEAST_DAMAGE);
  if (brokeBeast && announce) hearPrayers(world, cx, cy, "beast");
  if (!announce) return;
  regard(world, cx, cy, "wrath", 1.5); // wrath is remembered more sharply than grace
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

// Soothe: the god's calm settles on a region. Grudges cool, feuds unclench,
// truces form — written into the exact layers diplomacy already reads.
export function soothe(world: World, cx: number, cy: number, announce = true): void {
  const near = new Set<string>();
  for (const pop of world.pops) {
    if (Math.max(Math.abs(pop.x - cx), Math.abs(pop.y - cy)) <= C.SOOTHE_RADIUS) {
      near.add(pop.culture);
      pop.feud = null;
    }
  }
  const names = [...near];
  let calmed = false;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const key = pairKey(names[i], names[j]);
      const g = world.grudges.get(key);
      if (g !== undefined) {
        calmed = true;
        const cooled = g - C.SOOTHE_GRUDGE;
        if (cooled <= 0) world.grudges.delete(key);
        else world.grudges.set(key, cooled);
      }
      world.truces.set(key, Math.max(world.truces.get(key) ?? 0, world.year + C.SOOTHE_TRUCE_YEARS));
    }
  }
  if (!announce) return;
  const where = describeLocation(world, cx, cy);
  logEvent(
    world,
    calmed
      ? `Your calm settles over ${where}; old angers cool, and spears are lowered.`
      : `Your calm settles over ${where}, and finds little anger to cool.`,
    3,
    { at: { x: cx, y: cy } },
  );
  hearPrayers(world, cx, cy, "peace");
  regard(world, cx, cy, "peace");
}

// Provoke: a whisper of iron. The two greatest peoples in earshot find
// their old angers waking — the same grudge layer war already reads.
export function provoke(world: World, cx: number, cy: number, announce = true): void {
  const counts = new Map<string, number>();
  for (const pop of world.pops) {
    if (Math.max(Math.abs(pop.x - cx), Math.abs(pop.y - cy)) <= C.PROVOKE_RADIUS) {
      counts.set(pop.culture, (counts.get(pop.culture) ?? 0) + pop.count);
    }
  }
  const two = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const where = describeLocation(world, cx, cy);
  if (two.length < 2) {
    if (announce) logEvent(world, `Your whisper of iron passes over ${where}, and finds no rivals to wake.`, 3, { at: { x: cx, y: cy } });
    return;
  }
  const [a, b] = [two[0][0], two[1][0]];
  const key = pairKey(a, b);
  world.grudges.set(key, Math.min(C.GRUDGE_CAP, (world.grudges.get(key) ?? 0) + C.PROVOKE_GRUDGE));
  world.truces.delete(key);
  if (!announce) return;
  logEvent(world, `A whisper of iron runs through ${where}; between the ${a} and the ${b}, old angers wake.`, 3, {
    subjects: [a, b],
    at: { x: cx, y: cy },
  });
  spitePrayers(world, cx, cy, "peace");
  regard(world, cx, cy, "war");
}

// Anoint: the god's touch falls on a people's champion — or raises one.
// The favor is real and is spent: an edge in their next duel or hunt.
export function anoint(world: World, cx: number, cy: number, announce = true): void {
  const pop = world.pops
    .filter((p) => Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy)) <= C.ANOINT_RADIUS)
    .sort((a, b) => b.count - a.count)[0];
  if (!pop) {
    if (announce) logEvent(world, `Your favor falls on the empty land of ${describeLocation(world, cx, cy)}, and is wasted.`, 3, { at: { x: cx, y: cy } });
    return;
  }
  const culture = world.cultures.get(pop.culture)!;
  const hero = heroOf(world, pop.culture);
  if (hero) {
    hero.blessed = true;
    if (announce) {
      logEvent(world, `Your favor settles on ${hero.name} of the ${pop.culture}; there is a light on their blade.`, 3, {
        subjects: [pop.culture],
        at: { x: pop.x, y: pop.y },
      });
    }
  } else {
    const champion = mintFigure(world, pop.culture, "hero");
    champion.blessed = true;
    if (announce) {
      logEvent(world, `At your touch, ${champion.name} of the ${pop.culture} takes up arms — a champion anointed by heaven.`, 3, {
        subjects: [pop.culture],
        at: { x: pop.x, y: pop.y },
      });
    }
  }
  // They know whose hand this was
  culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + 1);
  noteFaith(world, culture);
  hearPrayers(world, cx, cy, "victory");
  hearPrayers(world, cx, cy, "beast");
  regard(world, cx, cy, "war");
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
    regard(world, cx, cy, "land");
  }
}

// The sky's wrath reaches the named: leaders, champions, and prophets at a
// smitten seat may be struck down. A slain leader is succeeded; a slain
// prophet is a martyr whose word is remembered harder.
function strikeFigures(world: World, culture: string, cx: number, cy: number): void {
  for (const f of world.figures) {
    if (!f.alive || f.culture !== culture || world.rng() >= C.SMITE_FIGURE_CHANCE) continue;
    f.alive = false;
    if (f.role === "leader") {
      const heir = mintFigure(world, culture, "leader");
      if (world.rng() < C.DYNASTY_CHANCE) heir.parent = f.id;
      logEvent(world, `${f.name} of the ${culture} is struck down by the sky. ${heir.name} takes the seat, and does not look up.`, 3, {
        subjects: [culture],
        at: { x: cx, y: cy },
      });
    } else if (f.role === "prophet") {
      const c = world.cultures.get(culture)!;
      if (c.creed?.stance === "forsaken") c.faith = Math.max(-2 * C.FAITH_MONUMENT, c.faith - 1); // the accuser proven right in death
      logEvent(world, `${f.name}, who spoke for the ${culture}, is struck down by the very sky they spoke of. The ${culture} will not forget it.`, 3, {
        subjects: [culture],
        at: { x: cx, y: cy },
      });
    } else {
      logEvent(world, `${f.name}, champion of the ${culture}, is struck down by the sky.`, 2, { subjects: [culture], at: { x: cx, y: cy } });
    }
  }
}

// Dream: the god sends a leader a dream, and the dream becomes their
// ambition. Ambitions already steer dice (conquest wants, dynasty holds,
// renown hunts); the dream of never dying is the one no god should send.
export function dream(world: World, cx: number, cy: number, ambition: NonNullable<Figure["ambition"]>): void {
  const pop = world.pops
    .filter((p) => Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy)) <= C.DREAM_RADIUS)
    .sort((a, b) => b.count - a.count)[0];
  const leader = pop ? leaderOf(world, pop.culture) : undefined;
  if (!pop || !leader) {
    logEvent(world, `Your dream drifts over ${describeLocation(world, cx, cy)} and finds no sleeper to receive it.`, 3, { at: { x: cx, y: cy } });
    return;
  }
  const old = leader.ambition;
  leader.ambition = ambition;
  logEvent(
    world,
    old && old !== ambition
      ? `A dream comes to ${leader.name} of the ${pop.culture}. They wake dreaming ${AMBITION_TEXT[ambition]}, and forget that they ever dreamed ${AMBITION_TEXT[old]}.`
      : `A dream comes to ${leader.name} of the ${pop.culture}. They wake dreaming ${AMBITION_TEXT[ambition]}.`,
    3,
    { subjects: [pop.culture], at: { x: pop.x, y: pop.y } },
  );
  const aspect: Aspect | null = ambition === "conquest" || ambition === "renown" ? "war" : ambition === "dynasty" ? "life" : null;
  if (aspect) regard(world, cx, cy, aspect, 0.5); // a dream is a private thing; the people feel only its edge
}

// Unyoke: every conquered people in reach casts off its masters at once.
// The freed rejoice; the masters know whose hand it was.
export function unyoke(world: World, cx: number, cy: number): void {
  const chained = world.pops.filter((p) => p.yoke && Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy)) <= C.UNYOKE_RADIUS);
  const where = describeLocation(world, cx, cy);
  if (!chained.length) {
    logEvent(world, `Your hand passes over ${where} and finds no chains to break.`, 3, { at: { x: cx, y: cy } });
    return;
  }
  logEvent(world, `Your word goes out over ${where}: let the chained go free.`, 3, { at: { x: cx, y: cy } });
  const masters = new Set<string>();
  const freed = new Set<string>();
  for (const pop of chained) {
    masters.add(pop.culture);
    freed.add(pop.yoke!.of);
    revolt(world, pop, true);
  }
  for (const name of freed) {
    const culture = world.cultures.get(name);
    if (!culture) continue;
    culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + 1);
    noteFaith(world, culture);
  }
  for (const name of masters) {
    const culture = world.cultures.get(name);
    if (!culture || freed.has(name)) continue;
    culture.faith = Math.max(-2 * C.FAITH_MONUMENT, culture.faith - 1);
    logEvent(world, `The ${name} know whose hand loosed their thralls.`, 2, { subjects: [name], at: { x: cx, y: cy } });
    noteFaith(world, culture);
  }
  regard(world, cx, cy, "peace");
}

// Embolden: the god's voice in the ears of a host. The greatest people's
// hosts in reach march as men who cannot lose, for a season or two; the
// battle math reads morale as weight.
export function embolden(world: World, cx: number, cy: number): void {
  const near = world.armies.filter((a) => Math.max(Math.abs(a.x - cx), Math.abs(a.y - cy)) <= C.EMBOLDEN_RADIUS);
  const where = describeLocation(world, cx, cy);
  if (!near.length) {
    logEvent(world, `Your voice rolls over ${where}, and no host is there to hear it.`, 3, { at: { x: cx, y: cy } });
    return;
  }
  const spears = new Map<string, number>();
  for (const a of near) spears.set(a.culture, (spears.get(a.culture) ?? 0) + a.count);
  const chosen = [...spears.entries()].sort((a, b) => b[1] - a[1])[0][0];
  for (const a of near) if (a.culture === chosen) a.morale = C.EMBOLDEN_MORALE;
  logEvent(world, `Your voice is in the ears of the host of the ${chosen} in ${where}; they march as men who cannot lose.`, 3, {
    subjects: [chosen],
    at: { x: cx, y: cy },
  });
  const culture = world.cultures.get(chosen)!;
  culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + 1);
  noteFaith(world, culture);
  hearPrayers(world, cx, cy, "victory");
  regard(world, cx, cy, "war");
}

// Reveal: the earth gives up what it holds. Lost treasures in reach come to
// the nearest people, whoever made them: a stranger's crown in your hands
// is a grievance to its makers, and that is the god's doing too.
export function reveal(world: World, cx: number, cy: number): void {
  const where = describeLocation(world, cx, cy);
  const lost = world.artifacts.filter(
    (a) => a.holder === null && a.lostAt && Math.max(Math.abs(a.lostAt.x - cx), Math.abs(a.lostAt.y - cy)) <= C.REVEAL_RADIUS,
  );
  if (!lost.length) {
    // No named thing lies lost here. But the ruins of a dead town kept
    // something of their own: the god may make the stones give it up
    const ruin = [...world.ruins.values()]
      .filter((r) => !r.plundered && r.tier >= 2 && Math.max(Math.abs(r.x - cx), Math.abs(r.y - cy)) <= C.REVEAL_RADIUS)
      .sort((a, b) => b.tier - a.tier)[0];
    const finder = ruin
      ? world.pops
          .filter((p) => !p.target)
          .sort((a, b) => Math.max(Math.abs(a.x - ruin.x), Math.abs(a.y - ruin.y)) - Math.max(Math.abs(b.x - ruin.x), Math.abs(b.y - ruin.y)))[0]
      : undefined;
    if (!ruin || !finder || world.artifacts.length >= C.ARTIFACT_CAP) {
      logEvent(world, `Your light passes over ${where} and finds nothing hidden there.`, 3, { at: { x: cx, y: cy } });
      return;
    }
    ruin.plundered = true;
    const art = mintArtifact(world, "idol", ruin.culture, `kept in the ruins of the ${ruin.culture} since year ${ruin.year}`, { x: ruin.x, y: ruin.y }, false);
    art.holder = finder.culture;
    art.provenance.push({ year: world.year, note: `given up by the stones at the god's word, into the hands of the ${finder.culture}` });
    logEvent(
      world,
      finder.culture === ruin.culture || areKin(world, finder.culture, ruin.culture)
        ? `At your word the ruins of ${describeLocation(world, ruin.x, ruin.y)} give up what they kept: ${art.name}. The ${finder.culture} carry their forebears' treasure home.`
        : `At your word the ruins of ${describeLocation(world, ruin.x, ruin.y)} give up what they kept: ${art.name}. It is the ${finder.culture} who carry it off.`,
      3,
      { subjects: [finder.culture, ruin.culture], at: { x: ruin.x, y: ruin.y } },
    );
    const culture = world.cultures.get(finder.culture)!;
    culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + 1);
    noteFaith(world, culture);
    regard(world, cx, cy, "land");
    return;
  }
  for (const art of lost) {
    const finder = world.pops
      .filter((p) => !p.target)
      .sort(
        (a, b) =>
          Math.max(Math.abs(a.x - art.lostAt!.x), Math.abs(a.y - art.lostAt!.y)) -
          Math.max(Math.abs(b.x - art.lostAt!.x), Math.abs(b.y - art.lostAt!.y)),
      )[0];
    if (!finder) continue;
    art.holder = finder.culture;
    const at = art.lostAt!;
    art.lostAt = null;
    art.provenance.push({ year: world.year, note: `given up by the earth at the god's word, into the hands of the ${finder.culture}` });
    logEvent(
      world,
      finder.culture === art.maker
        ? `At your word the earth gives up ${art.name}; the ${finder.culture} carry their own treasure home.`
        : `At your word the earth gives up ${art.name}${art.name.includes(art.maker) ? "" : `, made by the ${art.maker}`}; it is the ${finder.culture} who carry it home.`,
      3,
      { subjects: [finder.culture, art.maker], at },
    );
    const culture = world.cultures.get(finder.culture)!;
    culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + 1);
    noteFaith(world, culture);
  }
  regard(world, cx, cy, "land");
}

// Becalm: beasts in reach lie down and sleep for a span of years. No fear,
// no raids; the prayers of the besieged are answered. A sleeping beast is
// also a hero's opportunity, and the songs will say so.
export function becalm(world: World, cx: number, cy: number): void {
  const where = describeLocation(world, cx, cy);
  const calmed = becalmBeasts(world, cx, cy, C.BECALM_RADIUS);
  if (!calmed.length) {
    logEvent(world, `Your calm settles over ${where}, and nothing there was awake to be stilled.`, 3, { at: { x: cx, y: cy } });
    return;
  }
  for (const b of calmed) {
    logEvent(world, `At your word ${b.name} lies down in ${describeLocation(world, b.x, b.y)} and sleeps; the land is quiet for a span of years.`, 3, {
      at: { x: b.x, y: b.y },
    });
  }
  hearPrayers(world, cx, cy, "beast");
  regard(world, cx, cy, "peace");
}

// Storm: the god gathers the clouds. The storm rides the wind band it was
// born in for a few seasons: rain that the fields drink, fires put out and
// fires kindled, a surge on the coasts. Weather, not a miracle: every
// effect lands in a layer the sim already reads.
export function callStorm(world: World, cx: number, cy: number): void {
  world.storms.push({ id: world.nextStormId++, x: cx, y: cy, seasonsLeft: C.STORM_SEASONS, lastLog: -100 });
  logEvent(world, `You call the clouds together over ${describeLocation(world, cx, cy)}; a storm gathers and the wind takes it.`, 3, { at: { x: cx, y: cy } });
  hearPrayers(world, cx, cy, "harvest");
  hearPrayers(world, cx, cy, "relief");
  regard(world, cx, cy, "life", 0.7);
  regard(world, cx, cy, "wrath", 0.7);
}

function stormsTick(world: World): void {
  if (!world.storms.length) return;
  const R = C.STORM_RADIUS;
  for (const storm of world.storms) {
    // Rain, and what rain does
    let landfall: Pop | null = null;
    for (let y = Math.max(0, storm.y - R); y <= Math.min(world.height - 1, storm.y + R); y++) {
      for (let x = Math.max(0, storm.x - R); x <= Math.min(world.width - 1, storm.x + R); x++) {
        const d = Math.hypot(x - storm.x, y - storm.y);
        if (d > R + 0.5) continue;
        const i = idx(world, x, y);
        if (isWater(world, x, y)) continue;
        world.fertilityBonus[i] += C.STORM_RAIN * (1 - d / (R + 1));
        world.fire[i] = 0; // the rain puts out what burns
        // Dry lightning where the country is warm and parched
        if (world.temperature[i] > C.LIGHTNING_TEMP && world.moisture[i] < C.LIGHTNING_DRYNESS && world.rng() < C.STORM_LIGHTNING) ignite(world, i);
      }
    }
    for (const pop of world.pops) {
      if (Math.max(Math.abs(pop.x - storm.x), Math.abs(pop.y - storm.y)) > R) continue;
      if (world.coastal[idx(world, pop.x, pop.y)]) pop.count -= Math.round(pop.count * C.STORM_SURGE_LOSS); // the surge takes roofs
      if (!landfall || pop.count > landfall.count) landfall = pop;
    }
    if (landfall && world.year - storm.lastLog >= C.STORM_LOG_YEARS) {
      storm.lastLog = world.year;
      const coast = world.coastal[idx(world, landfall.x, landfall.y)];
      logEvent(
        world,
        coast
          ? `The storm breaks over the ${landfall.culture} of ${describeLocation(world, landfall.x, landfall.y)}; the sea comes up the streets, and the fields drink.`
          : `The storm breaks over the ${landfall.culture} of ${describeLocation(world, landfall.x, landfall.y)}; roofs go, and the fields drink.`,
        2,
        { subjects: [landfall.culture], at: { x: landfall.x, y: landfall.y } },
      );
    }
    // Then the wind carries it on
    const lat = latitude(world, storm.y);
    const westerly = lat > 0.3 && lat < 0.75;
    storm.x += westerly ? C.STORM_SPEED : -C.STORM_SPEED;
    storm.y += Math.floor(world.rng() * 3) - 1;
    storm.seasonsLeft--;
  }
  const spent = world.storms.filter((s) => s.seasonsLeft <= 0 || s.x < 0 || s.x >= world.width || s.y < 0 || s.y >= world.height);
  for (const s of spent) {
    const x = Math.min(world.width - 1, Math.max(0, s.x));
    const y = Math.min(world.height - 1, Math.max(0, s.y));
    logEvent(world, `The storm blows itself out over ${describeLocation(world, x, y)}.`, 1, { at: { x, y } });
  }
  if (spent.length) world.storms = world.storms.filter((s) => !spent.includes(s));
  recomputeClimate(world);
}
