import { mintArtifact } from "./artifacts";
import { stopTradeNote } from "./trade";
import * as C from "./constants";
import type { Temperament } from "./names";
import { RACES } from "./races";
import type { Culture, Deed, Pop, World } from "./world";
import { agedWeight, areKin, leaderOf, logEvent, pairKey, tierOf } from "./world";
import { sameCreed } from "./faith";

// --- The memory of nations. The weights, half-lives, and aging live in
// world.ts now (recordDeed needs them to settle avenged ledgers); what
// follows here is how that memory is read.

// How heavily the past sits between two peoples, in either direction.
// A looted treasure is a grievance that does not fade while it is held —
// the crown in the stranger's hall keeps the wound open.
export function rememberedWeight(world: World, a: string, b: string): number {
  let sum = 0;
  const deeds = world.deeds.get(pairKey(a, b));
  if (deeds) for (const d of deeds) sum += agedWeight(world, d);
  for (const art of world.artifacts) {
    if (!art.holder || art.holder === art.maker) continue;
    if ((art.maker === a && art.holder === b) || (art.maker === b && art.holder === a)) {
      sum += C.ARTIFACT_GRIEVANCE;
    }
  }
  return sum;
}

// The heaviest thing `by` has done to `to` that still weighs on the living
export function heaviestDeed(world: World, by: string, to: string): { deed: Deed; weight: number } | null {
  const deeds = world.deeds.get(pairKey(by, to));
  if (!deeds) return null;
  let best: { deed: Deed; weight: number } | null = null;
  for (const d of deeds) {
    if (d.by !== by || d.to !== to) continue;
    const w = agedWeight(world, d);
    if (!best || w > best.weight) best = { deed: d, weight: w };
  }
  return best;
}

// The heaviest living memory of wrongs done TO this people, by anyone
export function worstMemory(world: World, victim: string): { deed: Deed; weight: number } | null {
  let best: { deed: Deed; weight: number } | null = null;
  for (const deeds of world.deeds.values()) {
    for (const d of deeds) {
      if (d.to !== victim) continue;
      const w = agedWeight(world, d);
      if (!best || w > best.weight) best = { deed: d, weight: w };
    }
  }
  return best;
}

// Every living memory involving this people, heaviest first — deeds done to
// them and deeds done in their name. Fuel for the nations panel.
export function memoriesOf(world: World, name: string): { deed: Deed; weight: number }[] {
  const out: { deed: Deed; weight: number }[] = [];
  for (const [key, deeds] of world.deeds) {
    if (!key.split("|").includes(name)) continue;
    for (const d of deeds) {
      const w = agedWeight(world, d);
      if (w >= 0.25) out.push({ deed: d, weight: w }); // faded past this, it is folklore, not politics
    }
  }
  return out.sort((a, b) => b.weight - a.weight);
}

export { DEED_PHRASES } from "./world";

// --- Nations, stage 2: cultures that grow past kinship coalesce into named
// polities. The government's form is set once, at founding, by the founder's
// temperament; the rank climbs as souls and dominion grow. All of it is a
// reading of the sim — a nation is what a culture already is, given a name.

// Rank titles per form, indexed by rank-1: the gradations of polity
const TITLES: Record<Temperament, [string, string, string]> = {
  warlike: ["Warband", "Horde", "Dominion"],
  peaceable: ["Council", "Commonwealth", "Concord"],
  ambitious: ["Principality", "Kingdom", "Empire"],
  cunning: ["Compact", "League", "Hegemony"],
};

// "Kalathi" while a mere people; "Kalathi Kingdom" once they are a nation
export function polityName(culture: Culture): string {
  if (!culture.polity) return culture.name;
  return `${culture.name} ${TITLES[culture.polity.form][culture.polity.rank - 1]}`;
}

const FOUNDING: Record<Temperament, (people: string, title: string, leader: string) => string> = {
  warlike: (p, t, l) => `${l} binds the spears of the ${p} beneath one banner: the ${t} is proclaimed.`,
  peaceable: (p, t, l) => `The elders of the ${p} gather into one voice, ${l} first among them: the ${t} is proclaimed.`,
  ambitious: (p, t, l) => `${l} takes the high seat of the ${p} and proclaims the ${t}.`,
  cunning: (p, t, l) => `${l} draws the roads and markets of the ${p} into one hand: the ${t} is proclaimed.`,
};

export function allied(world: World, a: string, b: string): boolean {
  return world.alliances.has(pairKey(a, b));
}

// Allies within marching range lend their weight to a battle — souls counted
// at a discount, fed into the same loss arithmetic every contest already uses
export function alliedSupport(
  world: World,
  culture: string,
  x: number,
  y: number,
): { strength: number; names: Set<string> } {
  let strength = 0;
  const names = new Set<string>();
  for (const pop of world.pops) {
    if (pop.culture === culture || !allied(world, culture, pop.culture)) continue;
    if (Math.max(Math.abs(pop.x - x), Math.abs(pop.y - y)) > C.ALLIANCE_RANGE) continue;
    strength += pop.count * C.ALLIANCE_SUPPORT;
    names.add(pop.culture);
  }
  return { strength, names };
}

// The cultures a name is sworn to — for the inspect card's telling
export function alliesOf(world: World, culture: string): string[] {
  const out: string[] = [];
  for (const key of world.alliances.keys()) {
    const [a, b] = key.split("|");
    if (a === culture) out.push(b);
    else if (b === culture) out.push(a);
  }
  return out;
}

// Runs yearly, after territory settles: foundings, promotions, and the
// slow weaving and fraying of alliances
export function politiesTick(world: World): void {
  const souls = new Map<string, number>();
  const bestTier = new Map<string, number>();
  const seats = new Map<string, Pop>();
  for (const pop of world.pops) {
    souls.set(pop.culture, (souls.get(pop.culture) ?? 0) + pop.count);
    const tier = tierOf(pop.count);
    if (tier > (bestTier.get(pop.culture) ?? 0)) bestTier.set(pop.culture, tier);
    const seat = seats.get(pop.culture);
    if (!seat || pop.count > seat.count) seats.set(pop.culture, pop);
  }
  const cellsById = new Map<number, number>();
  for (let i = 0; i < world.territory.length; i++) {
    const id = world.territory[i];
    if (id) cellsById.set(id, (cellsById.get(id) ?? 0) + 1);
  }

  for (const [name, total] of souls) {
    const culture = world.cultures.get(name)!;
    const held = cellsById.get(culture.id) ?? 0;
    const seat = seats.get(name)!;
    if (!culture.polity) {
      // Founding asks for souls enough, a town to rule from, and a hand to rule
      if (total < C.POLITY_MIN_POP || (bestTier.get(name) ?? 0) < 2) continue;
      const leader = leaderOf(world, name);
      if (!leader) continue;
      culture.polity = { form: leader.temperament, rank: 1, founded: world.year, risen: world.year };
      logEvent(world, FOUNDING[leader.temperament](name, polityName(culture), leader.name), 3, {
        subjects: [name],
        at: { x: seat.x, y: seat.y },
        epochal: true,
      });
      // A nation needs regalia: the coronation mints a crown or a banner
      mintArtifact(
        world,
        culture.polity.form === "warlike" ? "banner" : "crown",
        name,
        `for the proclamation, the smiths of the ${name} make a great work`,
        { x: seat.x, y: seat.y },
      );
      continue;
    }
    // Standing is souls, dominion, and years together: a horde without land is
    // a mob, a wide realm of empty hills is no empire, and a boom is not a history
    const p = culture.polity;
    const stood = world.year - p.risen;
    if (
      p.rank === 1 &&
      stood >= C.POLITY_RANK2_YEARS &&
      total >= C.POLITY_RANK2_POP &&
      held >= C.POLITY_RANK2_CELLS
    ) {
      const old = polityName(culture);
      p.rank = 2;
      p.risen = world.year;
      logEvent(world, `The ${old} has outgrown its name: the chronicles speak now of the ${polityName(culture)}.`, 3, {
        subjects: [name],
        at: { x: seat.x, y: seat.y },
      });
    } else if (
      p.rank === 2 &&
      stood >= C.POLITY_RANK3_YEARS &&
      total >= C.POLITY_RANK3_POP &&
      held >= C.POLITY_RANK3_CELLS
    ) {
      p.rank = 3;
      p.risen = world.year;
      logEvent(world, `An age takes its shape: all roads bend now toward the ${polityName(culture)}.`, 3, {
        subjects: [name],
        at: { x: seat.x, y: seat.y },
      });
    }
  }

  alliancesTick(world, souls);
}

// Every culture this name holds a vendetta-hot grudge against
function swornEnemies(world: World, name: string, living: Map<string, number>): Set<string> {
  const out = new Set<string>();
  for (const [key, g] of world.grudges) {
    if (g < C.GRUDGE_VENDETTA) continue;
    const [a, b] = key.split("|");
    const other = a === name ? b : b === name ? a : null;
    if (other && living.has(other)) out.add(other);
  }
  return out;
}

function alliancesTick(world: World, souls: Map<string, number>): void {
  // Standing bonds: kin alliances hold by blood; those forged against an
  // enemy fray once the enemy no longer binds them
  for (const [key, bond] of world.alliances) {
    const [a, b] = key.split("|");
    if (!souls.has(a) || !souls.has(b)) {
      world.alliances.delete(key); // a dead partner releases the living one
      continue;
    }
    // How well an oath holds depends on whose mouths swore it
    const fickle = Math.max(
      RACES[world.cultures.get(a)!.race].fickle,
      RACES[world.cultures.get(b)!.race].fickle,
    );
    if (bond.against === null) {
      // Kin-oaths hold by blood — unless the blood is fickle. Goblins are goblins.
      if (fickle > 1 && world.rng() < C.ALLIANCE_LAPSE_CHANCE * (fickle - 1)) {
        world.alliances.delete(key);
        const fickleA = RACES[world.cultures.get(a)!.race].fickle;
        const fickleB = RACES[world.cultures.get(b)!.race].fickle;
        const [tired, kept] = fickleA >= fickleB ? [a, b] : [b, a];
        logEvent(world, `The ${tired} tire of their oaths to the ${kept}; the alliance quietly dies.`, 2, {
          subjects: [tired, kept],
        });
        stopTradeNote(world, a, b);
      }
      continue;
    }
    const enemyAlive = souls.has(bond.against);
    const stillBound =
      enemyAlive &&
      (world.grudges.get(pairKey(a, bond.against)) ?? 0) >= C.GRUDGE_VENDETTA / 2 &&
      (world.grudges.get(pairKey(b, bond.against)) ?? 0) >= C.GRUDGE_VENDETTA / 2;
    if (stillBound || world.rng() >= C.ALLIANCE_LAPSE_CHANCE * fickle) continue;
    world.alliances.delete(key);
    logEvent(
      world,
      `Their common enemy ${enemyAlive ? "humbled" : "gone"}, the alliance of the ${a} and the ${b} fades into courteous distance.`,
      2,
      { subjects: [a, b] },
    );
    stopTradeNote(world, a, b);
  }

  // New bonds are sworn only between nations: kin who remember their blood,
  // or strangers driven together by a shared vendetta. Diplomacy has
  // bandwidth — a nation keeps only so many oaths alive at once.
  const sworn = new Map<string, number>();
  for (const key of world.alliances.keys()) {
    for (const n of key.split("|")) sworn.set(n, (sworn.get(n) ?? 0) + 1);
  }
  const nations = [...souls.keys()]
    .map((n) => world.cultures.get(n)!)
    .filter((c) => c.polity !== null);
  for (let i = 0; i < nations.length; i++) {
    for (let j = i + 1; j < nations.length; j++) {
      const a = nations[i];
      const b = nations[j];
      if ((sworn.get(a.name) ?? 0) >= C.ALLIANCE_MAX_PER || (sworn.get(b.name) ?? 0) >= C.ALLIANCE_MAX_PER) continue;
      const key = pairKey(a.name, b.name);
      if (world.alliances.has(key)) continue;
      if ((world.grudges.get(key) ?? 0) > C.ALLIANCE_GRUDGE_MAX) continue; // too much blood between them
      // And some history cannot be papered over with envoys
      if (rememberedWeight(world, a.name, b.name) > C.ALLIANCE_MEMORY_MAX) continue;
      const kin = areKin(world, a.name, b.name);
      // One god makes kin of strangers: peoples who name the god alike
      // swear oaths without needing a common enemy
      const faithful = !kin && sameCreed(world, a.name, b.name);
      let against: string | null = null;
      if (!kin && !faithful) {
        const enemiesA = swornEnemies(world, a.name, souls);
        for (const e of swornEnemies(world, b.name, souls)) {
          if (enemiesA.has(e)) {
            against = e;
            break;
          }
        }
        if (!against) continue;
      }
      // War makes urgent partners; kinship is patient — and the fickle
      // rarely bother swearing at all (squared: known oath-breakers are
      // also poor partners), which spares everyone the churn
      const swearFickle = Math.max(RACES[a.race].fickle, RACES[b.race].fickle, 1) ** 2;
      const zeal = sameCreed(world, a.name, b.name) ? C.SHARED_CREED_ALLY_MULT : 1;
      if (world.rng() >= ((kin ? C.ALLIANCE_KIN_CHANCE : faithful ? C.ALLIANCE_KIN_CHANCE : C.ALLIANCE_CHANCE) * zeal) / swearFickle) continue;
      world.alliances.set(key, { since: world.year, against });
      sworn.set(a.name, (sworn.get(a.name) ?? 0) + 1);
      sworn.set(b.name, (sworn.get(b.name) ?? 0) + 1);
      logEvent(
        world,
        kin
          ? `Blood remembers blood: the ${polityName(a)} and the ${polityName(b)} swear alliance.`
          : faithful
            ? `In the name of ${a.creed!.title}, the ${polityName(a)} and the ${polityName(b)} swear alliance; one god makes kin of them.`
            : `Envoys pass between the ${polityName(a)} and the ${polityName(b)}: an alliance is sworn against the ${against}.`,
        3,
        { subjects: [a.name, b.name] },
      );
    }
  }
}
