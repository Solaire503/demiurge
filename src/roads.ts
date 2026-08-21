import * as C from "./constants";
import { polityName } from "./nations";
import type { Pop, World } from "./world";
import { idx, isWater, logEvent } from "./world";

// --- Roads: where trade flows and armies march. Nations lay them between
// their own settlements; allied nations whose wagons already roll lay them
// capital to capital. Rivers are forded, seas are not crossed, and settlers
// prefer roadside ground — so hamlets string along the roads on their own,
// and the countryside fills in the way DF maps do.

// Walk a road from A toward B, greedy, fording rivers but never the sea.
// Returns false (and lays nothing new past the block) if open water stops it.
function carveRoad(world: World, ax: number, ay: number, bx: number, by: number): boolean {
  let x = ax;
  let y = ay;
  let steps = 0;
  const limit = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 3 + 8;
  const passable = (px: number, py: number): boolean => {
    if (px < 0 || px >= world.width || py < 0 || py >= world.height) return false;
    const i = idx(world, px, py);
    return !isWater(world, px, py) || world.isRiver[i] === 1 || world.lakes[i] === 1;
  };
  while ((x !== bx || y !== by) && steps++ < limit) {
    const dx = Math.sign(bx - x);
    const dy = Math.sign(by - y);
    // Prefer the straight line; failing that, hug the coast around the bay
    let nx = x + dx;
    let ny = y + dy;
    if (!passable(nx, ny)) {
      if (dx !== 0 && passable(x + dx, y)) {
        nx = x + dx;
        ny = y;
      } else if (dy !== 0 && passable(x, y + dy)) {
        nx = x;
        ny = y + dy;
      } else if (passable(x + dx, y - dy)) {
        nx = x + dx;
        ny = y - dy;
      } else if (passable(x - dx, y + dy)) {
        nx = x - dx;
        ny = y + dy;
      } else {
        return false; // the open sea ends the road
      }
    }
    x = nx;
    y = ny;
    const i = idx(world, x, y);
    if (!isWater(world, x, y)) world.roads[i] = 1; // fords and ferries lay no stone
  }
  return x === bx && y === by;
}

export function roadsTick(world: World): void {
  const byCulture = new Map<string, Pop[]>();
  for (const pop of world.pops) {
    if (pop.target) continue; // wanderers do not pave
    const list = byCulture.get(pop.culture);
    if (list) list.push(pop);
    else byCulture.set(pop.culture, [pop]);
  }

  // Nations bind their settlements: each settlement roads to the nearest
  // larger one, so networks grow tree-like out of the capital
  for (const [name, pops] of byCulture) {
    const culture = world.cultures.get(name);
    if (!culture?.polity || pops.length < 2) continue;
    for (const pop of pops) {
      let target: Pop | null = null;
      let best = Infinity;
      for (const other of pops) {
        if (other === pop || other.count <= pop.count) continue;
        const d = Math.max(Math.abs(other.x - pop.x), Math.abs(other.y - pop.y));
        if (d < best) {
          best = d;
          target = other;
        }
      }
      if (!target || best > C.ROAD_MAX_LEG || best < 2) continue;
      carveRoad(world, pop.x, pop.y, target.x, target.y);
    }
    const last = world.roadLog.get(name);
    if (last === undefined) {
      world.roadLog.set(name, world.year);
      logEvent(world, `The ${polityName(culture)} lay roads between their settlements.`, 1, {
        subjects: [name],
        at: { x: pops[0].x, y: pops[0].y },
      });
    }
  }

  // Where the wagons already roll — or the oath has stood ten years —
  // allied capitals are bound by road
  for (const [key, bond] of world.alliances) {
    if (!world.tradeLog.has(key) && world.year - bond.since < 10) continue;
    const [a, b] = key.split("|");
    const popsA = byCulture.get(a);
    const popsB = byCulture.get(b);
    if (!popsA?.length || !popsB?.length) continue;
    const capA = [...popsA].sort((x, y) => y.count - x.count)[0];
    const capB = [...popsB].sort((x, y) => y.count - x.count)[0];
    const d = Math.max(Math.abs(capA.x - capB.x), Math.abs(capA.y - capB.y));
    if (d > C.ROAD_INTER_RANGE) continue;
    const roadKey = `road|${key}`;
    const done = world.roadLog.has(roadKey);
    if (carveRoad(world, capA.x, capA.y, capB.x, capB.y) && !done) {
      world.roadLog.set(roadKey, world.year);
      logEvent(world, `A wagon road now runs from the ${a} to the ${b}; it will outlast the oath that built it.`, 2, {
        subjects: [a, b],
        at: { x: capA.x, y: capA.y },
      });
    }
  }

  // Grass swallows the roads no one keeps
  for (let i = 0; i < world.roads.length; i++) {
    if (!world.roads[i]) continue;
    if (world.territory[i] !== 0) continue;
    if (world.rng() < C.ROAD_DECAY_CHANCE) world.roads[i] = 0;
  }
}

// Is there road under or beside this cell? Settlers and armies ask.
export function nearRoad(world: World, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= world.width || ny < 0 || ny >= world.height) continue;
      if (world.roads[ny * world.width + nx]) return true;
    }
  }
  return false;
}
