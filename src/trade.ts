import * as C from "./constants";
import type { Pop, World } from "./world";
import { logEvent, pairKey, tierOf } from "./world";

// --- Economy v0: trade along alliances. Grain flows from surplus to
// deficit between sworn nations in wagon range, lifting the hungry side's
// foodSat — the same number the sim already reads — and enriching the
// seller. Wealth is a real ledger now: towns, gold, and active trade.
// Dragons read it. Severed wagons are how famines and wars begin.

function goldNear(world: World, pop: Pop): number {
  let gold = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = pop.x + dx;
      const ny = pop.y + dy;
      if (nx < 0 || nx >= world.width || ny < 0 || ny >= world.height) continue;
      if (world.resources[ny * world.width + nx] >= 3) gold++;
    }
  }
  return gold;
}

// Yearly: rebuild wealth, then let the wagons roll between allies
export function tradeTick(world: World): void {
  world.tradeBoost.clear();
  world.wealth.clear();

  const byCulture = new Map<string, Pop[]>();
  for (const pop of world.pops) {
    const list = byCulture.get(pop.culture);
    if (list) list.push(pop);
    else byCulture.set(pop.culture, [pop]);
  }

  // Wealth: what a people has built and dug — trade adds to it below
  for (const [name, pops] of byCulture) {
    let w = 0;
    for (const pop of pops) w += tierOf(pop.count) * 2 + goldNear(world, pop) * 3;
    world.wealth.set(name, w);
  }

  const avgSurplus = (pops: Pop[]): number => {
    let food = 0;
    let n = 0;
    for (const pop of pops) {
      food += pop.foodSat * pop.count;
      n += pop.count;
    }
    return n ? food / n - 1 : 0;
  };

  for (const key of world.alliances.keys()) {
    const [a, b] = key.split("|");
    const popsA = byCulture.get(a);
    const popsB = byCulture.get(b);
    if (!popsA || !popsB) continue;
    // Wagons have a range: the nearest settlements must be reachable
    let best = Infinity;
    for (const pa of popsA) {
      for (const pb of popsB) {
        const d = Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
        if (d < best) best = d;
      }
    }
    // Roads carry wagons farther than mud does
    const roaded =
      popsA.some((p) => world.roads[p.y * world.width + p.x]) &&
      popsB.some((p) => world.roads[p.y * world.width + p.x]);
    if (best > C.TRADE_RANGE * (roaded ? C.ROAD_TRADE_MULT : 1)) continue;
    const sA = avgSurplus(popsA);
    const sB = avgSurplus(popsB);
    let from: string | null = null;
    let to: string | null = null;
    if (sA >= C.TRADE_SURPLUS_MIN && sB <= C.TRADE_DEFICIT_MAX) [from, to] = [a, b];
    else if (sB >= C.TRADE_SURPLUS_MIN && sA <= C.TRADE_DEFICIT_MAX) [from, to] = [b, a];
    if (!from || !to) continue;
    const lift = Math.min(C.TRADE_CAP, (from === a ? sA : sB) * 0.4);
    world.tradeBoost.set(to, (world.tradeBoost.get(to) ?? 0) + lift);
    world.tradeBoost.set(from, (world.tradeBoost.get(from) ?? 0) + C.TRADE_PROSPER);
    world.wealth.set(from, (world.wealth.get(from) ?? 0) + 4); // selling grain buys gold
    world.wealth.set(to, (world.wealth.get(to) ?? 0) + 1);
    const last = world.tradeLog.get(key);
    if (last === undefined || world.year - last >= C.TRADE_LOG_YEARS) {
      world.tradeLog.set(key, world.year);
      logEvent(world, `Wagons roll between the ${from} and the ${to}: grain against iron, iron against grain.`, last === undefined ? 2 : 1, {
        subjects: [from, to],
      });
    }
  }
}

// An alliance that carried wagons ends, and the road goes quiet — called
// by the diplomacy that severs it, so the chronicle closes the loop
export function stopTradeNote(world: World, a: string, b: string): void {
  const key = pairKey(a, b);
  if (!world.tradeLog.has(key)) return;
  world.tradeLog.delete(key);
  logEvent(world, `The wagons between the ${a} and the ${b} roll no more.`, 2, { subjects: [a, b] });
}
