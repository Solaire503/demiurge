import * as C from "./constants";
import { allied, alliedSupport, polityName } from "./nations";
import { RACES } from "./races";
import type { Army, Pop, War, World } from "./world";
import {
  areKin,
  describeLocation,
  heroOf,
  isWater,
  logEvent,
  pairKey,
  recordDeed,
  tierOf,
  TIER_NAMES,
} from "./world";

// --- Nations, stage 3 (first cut): declared wars and the hosts that fight
// them. Armies are levied out of settlement counts — the same souls, marched
// somewhere terrible — so a long war visibly hollows out the homeland. They
// die afield or they come home; no soldier is conjured from nothing.

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function popsOf(world: World, culture: string): Pop[] {
  return world.pops.filter((p) => p.culture === culture);
}

function enemyOf(war: War, culture: string): string {
  return culture === war.attacker ? war.defender : war.attacker;
}

// Survivors of a scattered host walk home into the nearest settlement of
// their people; a host whose home is gone settles where it stands
function scatterHome(world: World, army: Army): void {
  let nearest: Pop | null = null;
  let nearestDist = Infinity;
  for (const p of world.pops) {
    if (p.culture !== army.culture) continue;
    const d = Math.max(Math.abs(p.x - army.x), Math.abs(p.y - army.y));
    if (d < nearestDist) {
      nearestDist = d;
      nearest = p;
    }
  }
  if (nearest) {
    nearest.count += army.count;
  } else if (army.count >= C.EXTINCTION_COUNT) {
    // A host with no home left plants its spears — on land, never the open sea
    let sx = army.x;
    let sy = army.y;
    if (isWater(world, sx, sy)) {
      let best = Infinity;
      for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
          if (isWater(world, x, y)) continue;
          const d = Math.max(Math.abs(x - army.x), Math.abs(y - army.y));
          if (d < best) {
            best = d;
            sx = x;
            sy = y;
          }
        }
      }
      if (isWater(world, sx, sy)) return; // a world with no land keeps its dead
    }
    world.pops.push({
      id: world.nextPopId++,
      culture: army.culture,
      x: sx,
      y: sy,
      count: army.count,
      foodSat: 0.7,
      safety: 0.5,
      inFamine: false,
      isolation: 0,
      feud: null,
      plagueSeasons: 0,
      tier: tierOf(army.count),
      target: null,
      journey: null,
    });
    logEvent(world, `Their homes gone, the host of the ${army.culture} plants its spears and settles where it stands.`, 2, {
      subjects: [army.culture],
      at: { x: sx, y: sy },
    });
  }
}

function disbandWar(world: World, key: string): void {
  const going = world.armies.filter((a) => a.war === key);
  for (const army of going) scatterHome(world, army);
  world.armies = world.armies.filter((a) => a.war !== key);
}

// Levy a host: every settled settlement of the culture gives up a share of
// its souls. The army stages at the settlement nearest the enemy.
function muster(world: World, culture: string, war: War, key: string): void {
  const sources = popsOf(world, culture).filter((p) => !p.target && p.count >= C.MUSTER_MIN_POP);
  if (!sources.length) return;
  const enemyPops = popsOf(world, enemyOf(war, culture));
  if (!enemyPops.length) return;
  let planned = 0;
  for (const p of sources) planned += Math.round(p.count * C.MUSTER_FRACTION);
  if (planned < C.ARMY_MIN) return; // too few spears to be worth the marching
  let total = 0;
  for (const p of sources) {
    const levy = Math.round(p.count * C.MUSTER_FRACTION);
    p.count -= levy;
    total += levy;
  }
  let staging = sources[0];
  let best = Infinity;
  for (const p of sources) {
    for (const e of enemyPops) {
      const d = Math.max(Math.abs(p.x - e.x), Math.abs(p.y - e.y));
      if (d < best) {
        best = d;
        staging = p;
      }
    }
  }
  world.armies.push({ id: world.nextArmyId++, culture, count: total, x: staging.x, y: staging.y, war: key });
  const culture2 = world.cultures.get(culture)!;
  if (!war.marched.has(culture)) {
    war.marched.add(culture);
    logEvent(
      world,
      `A host of ${total.toLocaleString("en-US")} spears marches beneath the banners of the ${polityName(culture2)}.`,
      2,
      { subjects: [culture], at: { x: staging.x, y: staging.y } },
    );
  } else {
    logEvent(world, `The ${culture} raise fresh spears for the war.`, 1, {
      subjects: [culture],
      at: { x: staging.x, y: staging.y },
    });
  }
}

// Yearly: wars end in extinction or weary peace, standing wars keep a host
// afield per side, and nations with vendetta in their hearts declare new ones
export function warsTick(world: World): void {
  const living = new Set(world.pops.map((p) => p.culture));

  for (const [key, war] of world.wars) {
    if (!living.has(war.attacker) || !living.has(war.defender)) {
      world.wars.delete(key);
      disbandWar(world, key);
      continue;
    }
    if (world.year - war.since >= C.WAR_EXHAUSTION_YEARS && world.rng() < C.WAR_PEACE_CHANCE) {
      world.wars.delete(key);
      world.truces.set(key, world.year + C.WAR_TRUCE_YEARS);
      disbandWar(world, key);
      logEvent(world, `Weary of blood, the ${war.attacker} and the ${war.defender} lay down their arms.`, 3, {
        subjects: [war.attacker, war.defender],
      });
      continue;
    }
    for (const side of [war.attacker, war.defender]) {
      if (world.armies.some((a) => a.war === key && a.culture === side)) continue;
      muster(world, side, war, key);
    }
  }

  // Declarations: a nation whose heart is set on conquest, against a people
  // it already hates past forgiveness. Formal war needs a polity to declare
  // it — leaderless mobs keep to the old skirmishing.
  for (const [name, culture] of world.cultures) {
    if (!culture.polity || culture.want !== "conquest" || !culture.wantTarget) continue;
    if (!living.has(name) || !living.has(culture.wantTarget)) continue;
    const target = culture.wantTarget;
    const key = pairKey(name, target);
    if (world.wars.has(key) || allied(world, name, target)) continue;
    const truce = world.truces.get(key);
    if (truce !== undefined && world.year < truce) continue;
    if ((world.grudges.get(key) ?? 0) < C.WAR_GRUDGE_MIN) continue;
    if (world.rng() >= C.WAR_DECLARE_CHANCE) continue;
    world.wars.set(key, { attacker: name, defender: target, since: world.year, marched: new Set() });
    recordDeed(world, "war", name, target);
    logEvent(
      world,
      `The ${polityName(culture)} declares war upon the ${polityName(world.cultures.get(target)!)}.`,
      3,
      { subjects: [name, target] },
    );
  }
}

// Two hosts meet in the field. The same loss arithmetic settlements use,
// weighted by nearby allied settlements on either side.
function fieldBattle(world: World, a: Army, b: Army): void {
  const raceA = RACES[world.cultures.get(a.culture)!.race];
  const raceB = RACES[world.cultures.get(b.culture)!.race];
  const grudge = world.grudges.get(pairKey(a.culture, b.culture)) ?? 0;
  const brutality = 1 + grudge * C.VENDETTA_LOSS_MULT;
  const weightA = a.count + alliedSupport(world, a.culture, a.x, a.y).strength;
  const weightB = b.count + alliedSupport(world, b.culture, b.x, b.y).strength;
  const fracA = Math.min(
    0.6,
    (C.BATTLE_LOSS_BASE + world.rng() * C.BATTLE_LOSS_SPREAD) *
      clamp(weightB / weightA, 0.5, 2) *
      brutality *
      raceB.battleDealt *
      raceA.battleTaken,
  );
  const fracB = Math.min(
    0.6,
    (C.BATTLE_LOSS_BASE + world.rng() * C.BATTLE_LOSS_SPREAD) *
      clamp(weightA / weightB, 0.5, 2) *
      brutality *
      raceA.battleDealt *
      raceB.battleTaken,
  );
  const lossA = Math.round(a.count * fracA);
  const lossB = Math.round(b.count * fracB);
  a.count -= lossA;
  b.count -= lossB;
  world.grudges.set(pairKey(a.culture, b.culture), grudge + C.GRUDGE_PER_BATTLE);
  const where = describeLocation(world, a.x, a.y);
  logEvent(
    world,
    `The hosts of the ${a.culture} and the ${b.culture} meet in ${where}; ${(lossA + lossB).toLocaleString("en-US")} souls fall.`,
    3,
    { subjects: [a.culture, b.culture], at: { x: a.x, y: a.y } },
  );
}

// A host falls upon a settlement. Defenders fight with their hero's shield
// and their allies' weight. Win badly enough and the town is not destroyed
// but taken: some die in the sack, some flee to kin, the rest bow.
function assault(world: World, army: Army, pop: Pop): void {
  const attCulture = world.cultures.get(army.culture)!;
  const defCulture = world.cultures.get(pop.culture)!;
  const raceAtt = RACES[attCulture.race];
  const raceDef = RACES[defCulture.race];
  const key = pairKey(army.culture, pop.culture);
  const grudge = world.grudges.get(key) ?? 0;
  const brutality = 1 + grudge * C.VENDETTA_LOSS_MULT;
  const shield = heroOf(world, pop.culture) ? C.HERO_LOSS_REDUCTION : 1;
  const weightAtt = army.count + alliedSupport(world, army.culture, army.x, army.y).strength;
  const weightDef = pop.count + alliedSupport(world, pop.culture, pop.x, pop.y).strength;
  const fracAtt = Math.min(
    0.6,
    (C.BATTLE_LOSS_BASE + world.rng() * C.BATTLE_LOSS_SPREAD) *
      clamp(weightDef / weightAtt, 0.5, 2) *
      brutality *
      raceDef.battleDealt *
      raceAtt.battleTaken,
  );
  const fracDef = Math.min(
    0.6,
    (C.BATTLE_LOSS_BASE + world.rng() * C.BATTLE_LOSS_SPREAD) *
      clamp(weightAtt / weightDef, 0.5, 2) *
      brutality *
      shield *
      raceAtt.battleDealt *
      raceDef.battleTaken,
  );
  army.count -= Math.round(army.count * fracAtt);
  pop.count -= Math.round(pop.count * fracDef);
  world.grudges.set(key, (world.grudges.get(key) ?? 0) + C.GRUDGE_PER_BATTLE);
  const where = describeLocation(world, pop.x, pop.y);
  const tierName = TIER_NAMES[Math.min(pop.tier, TIER_NAMES.length - 1)];

  if (army.count <= pop.count * C.CONQUEST_RATIO) {
    // The defense holds — this season
    logEvent(
      world,
      pop.tier >= 2
        ? `The host of the ${army.culture} assails the ${tierName} of the ${pop.culture} in ${where}, and is thrown back from its walls.`
        : `The host of the ${army.culture} falls upon the ${pop.culture} of ${where}, and is driven off.`,
      2,
      { subjects: [army.culture, pop.culture], at: { x: pop.x, y: pop.y } },
    );
    return;
  }

  // The town falls. Sack, flight, and submission — conquest, not erasure.
  const oldCulture = pop.culture;
  pop.count = Math.round(pop.count * (1 - C.SACK_LOSS));
  const fleeing = Math.round(pop.count * C.REFUGEE_FRACTION);
  pop.count -= fleeing;
  if (fleeing >= C.EXTINCTION_COUNT) {
    // Refugees run for the nearest settlement of their people, their kin,
    // or their sworn allies — straining whoever takes them in
    let refuge: Pop | null = null;
    let refDist = Infinity;
    for (const p of world.pops) {
      if (p === pop || p.culture === army.culture) continue;
      const kinOrAlly =
        p.culture === oldCulture || areKin(world, p.culture, oldCulture) || allied(world, p.culture, oldCulture);
      if (!kinOrAlly) continue;
      const d = Math.max(Math.abs(p.x - pop.x), Math.abs(p.y - pop.y));
      if (d < refDist) {
        refDist = d;
        refuge = p;
      }
    }
    world.pops.push({
      id: world.nextPopId++,
      culture: oldCulture,
      x: pop.x,
      y: pop.y,
      count: fleeing,
      foodSat: 0.7,
      safety: 0.4,
      inFamine: false,
      isolation: 0,
      feud: null,
      plagueSeasons: pop.plagueSeasons, // pestilence travels with the desperate
      tier: tierOf(fleeing),
      target: refuge ? { x: refuge.x, y: refuge.y } : null,
      journey: "refugees",
    });
  }
  pop.culture = army.culture;
  pop.feud = null;
  pop.inFamine = false;
  // A camp overrun is the countryside changing hands; a sacked town is a
  // deed remembered for generations. Importance and memory scale with tier.
  if (pop.tier >= 1) {
    recordDeed(world, "sack", army.culture, oldCulture);
    world.grudges.set(key, (world.grudges.get(key) ?? 0) + C.GRUDGE_SACK);
  }
  logEvent(
    world,
    `The ${tierName} of the ${oldCulture} in ${where} falls to the ${polityName(attCulture)}; ${fleeing > 0 ? `${fleeing.toLocaleString("en-US")} souls flee, and ` : ""}those who remain bow to new masters.`,
    pop.tier >= 2 ? 3 : pop.tier === 1 ? 2 : 1,
    { subjects: [army.culture, oldCulture], at: { x: pop.x, y: pop.y } },
  );
}

// Each season: hosts march, hunger, fight, and break
export function armiesTick(world: World): void {
  const scattered = new Set<number>();
  for (const army of world.armies) {
    const war = world.wars.get(army.war);
    if (!war) {
      scatterHome(world, army);
      scattered.add(army.id);
      continue;
    }
    // Campaigns eat their hosts — attrition is the clock on every siege
    army.count = Math.round(army.count * (1 - C.ARMY_ATTRITION));
    if (army.count < C.ARMY_BREAK) {
      logEvent(world, `The broken host of the ${army.culture} scatters for home.`, 2, {
        subjects: [army.culture],
        at: { x: army.x, y: army.y },
      });
      scatterHome(world, army);
      scattered.add(army.id);
      continue;
    }
    const enemy = enemyOf(war, army.culture);

    // An enemy host nearby is met in the field, not marched past — hosts
    // intercept, so wars have fronts instead of mutual raiding
    let foe: Army | null = null;
    let foeDist = Infinity;
    for (const b of world.armies) {
      if (scattered.has(b.id) || b.war !== army.war || b.culture !== enemy) continue;
      const d = Math.max(Math.abs(b.x - army.x), Math.abs(b.y - army.y));
      if (d < foeDist) {
        foeDist = d;
        foe = b;
      }
    }
    if (foe && foeDist <= 1) {
      fieldBattle(world, army, foe);
      continue;
    }
    if (foe && foeDist <= C.ARMY_INTERCEPT) {
      for (let step = 0; step < C.ARMY_SPEED && Math.max(Math.abs(foe.x - army.x), Math.abs(foe.y - army.y)) > 1; step++) {
        army.x += Math.sign(foe.x - army.x);
        army.y += Math.sign(foe.y - army.y);
      }
      continue;
    }

    // March on the nearest enemy settlement
    let targetPop: Pop | null = null;
    let best = Infinity;
    for (const p of world.pops) {
      if (p.culture !== enemy) continue;
      const d = Math.max(Math.abs(p.x - army.x), Math.abs(p.y - army.y));
      if (d < best) {
        best = d;
        targetPop = p;
      }
    }
    if (!targetPop) {
      scatterHome(world, army);
      scattered.add(army.id);
      continue;
    }
    if (best <= 1) {
      assault(world, army, targetPop);
      continue;
    }
    for (let step = 0; step < C.ARMY_SPEED && (army.x !== targetPop.x || army.y !== targetPop.y); step++) {
      army.x += Math.sign(targetPop.x - army.x);
      army.y += Math.sign(targetPop.y - army.y);
    }
  }
  // Broken hosts leave the field; so do hosts ground down to nothing in battle
  world.armies = world.armies.filter((a) => !scattered.has(a.id) && a.count >= C.EXTINCTION_COUNT);
}
