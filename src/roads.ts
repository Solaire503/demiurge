import * as C from "./constants";
import { polityName } from "./nations";
import { creedKnob } from "./faith";
import type { Pop, World } from "./world";
import { idx, isWater, logEvent } from "./world";

// --- Roads: where trade flows and armies march. The network is a set of
// persistent LINKS between settlements, not paint. A nation lays one new
// link a year (construction takes time); a link's pavement is refreshed
// while both ends live and stay worthy; an abandoned road is not erased
// but stops being maintained, and grass swallows it over decades. The map
// carries fresh highways, working roads, and the fading ghosts of old ones.

// Walk a road from A toward B, preferring the straight line and hugging
// coasts around bays; fords cross rivers, nothing crosses the open sea.
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
    if (!isWater(world, x, y)) world.roads[i] = C.ROAD_WEAR_MAX; // fords lay no stone
  }
  return x === bx && y === by;
}

export function roadsTick(world: World): void {
  // Grass works at every road, always; maintenance below outruns it.
  // The sea works faster: pavement on drowned ground is simply gone.
  for (let i = 0; i < world.roads.length; i++) {
    if (world.roads[i] === 0) continue;
    if (world.elevation[i] < C.SEA_LEVEL || world.lakes[i]) {
      world.roads[i] = 0;
      continue;
    }
    world.roads[i] = Math.max(0, world.roads[i] - C.ROAD_WEAR_DECAY);
  }

  const popById = new Map<number, Pop>();
  for (const pop of world.pops) popById.set(pop.id, pop);

  // Links survive while both ends live, stay kin, stay worthy, stay near.
  // A dropped link is not erased — its pavement simply stops being kept.
  world.roadLinks = world.roadLinks.filter((link) => {
    const a = popById.get(link.a);
    const b = popById.get(link.b);
    if (!a || !b || a.culture !== b.culture) return false;
    if (a.count < C.ROAD_LINK_MIN || b.count < C.ROAD_LINK_MIN) return false;
    if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) > C.ROAD_MAX_LEG + 4) return false;
    return true;
  });
  const linked = new Set<number>();
  for (const link of world.roadLinks) linked.add(link.a);

  const byCulture = new Map<string, Pop[]>();
  for (const pop of world.pops) {
    if (pop.target) continue;
    const list = byCulture.get(pop.culture);
    if (list) list.push(pop);
    else byCulture.set(pop.culture, [pop]);
  }

  // One new link per nation per year: the unlinked village nearest to a
  // larger settlement gets its road. Networks grow, they do not appear.
  for (const [name, pops] of byCulture) {
    const culture = world.cultures.get(name);
    if (!culture?.polity) continue;
    const towns = pops.filter((p) => p.count >= C.TIER_THRESHOLDS[0]);
    if (towns.length < 2) continue;
    let built = 0;
    const builds = Math.max(C.ROAD_BUILDS_PER_YEAR, Math.round(creedKnob(world, name, "roads"))); // the Mountain-Shaper's people build
    for (const pop of towns) {
      if (built >= builds) break;
      if (linked.has(pop.id)) continue;
      let target: Pop | null = null;
      let best = Infinity;
      for (const other of towns) {
        if (other === pop || other.count <= pop.count) continue;
        const d = Math.max(Math.abs(other.x - pop.x), Math.abs(other.y - pop.y));
        if (d < best) {
          best = d;
          target = other;
        }
      }
      if (!target || best > C.ROAD_MAX_LEG || best < 2) continue;
      world.roadLinks.push({ a: pop.id, b: target.id });
      linked.add(pop.id);
      built++;
      if (!world.roadLog.has(name)) {
        world.roadLog.set(name, world.year);
        logEvent(world, `The ${polityName(culture)} lay roads between their settlements.`, 1, {
          subjects: [name],
          at: { x: pop.x, y: pop.y },
        });
      }
    }
  }

  // Maintenance: every living link's pavement is kept fresh
  for (const link of world.roadLinks) {
    const a = popById.get(link.a)!;
    const b = popById.get(link.b)!;
    carveRoad(world, a.x, a.y, b.x, b.y);
  }

  // Where the wagons already roll — or the oath has stood ten years —
  // allied capitals keep a wagon road between kingdoms
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
}

// Is there road under or beside this cell? Settlers and armies ask.
export function nearRoad(world: World, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= world.width || ny < 0 || ny >= world.height) continue;
      if (world.roads[ny * world.width + nx] > 0) return true;
    }
  }
  return false;
}
