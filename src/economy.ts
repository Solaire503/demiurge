import * as C from "./constants";
import { allied } from "./nations";
import { LESSER } from "./menagerie";
import type { Culture, Good, Pop, Route, World } from "./world";
import { GOODS, biomeIdAt, describeLocation, idx, isWater, logEvent, pairKey, tierOf } from "./world";

// --- Economy v1. The land yields goods to whoever works it: timber out of
// the forests, ore and gold out of the veins, furs out of the cold, fish
// off the coast, and grain, which is the harvest the sim already reads. A
// people wants goods in proportion to what it has built and mustered.
// Surplus meets shortage along wagon routes between any two nations at
// peace, and the wagons are bodies on the map: they can be watched, and
// taken. Wealth is a rate (what a people makes) and a treasury (what it
// lays by), and gold buys things the sim reads: granaries against famine,
// market towns, and sellswords for a war. Prosperity feeds back into the
// same numbers the pops live on. Nothing here is a score; it is all fuel. ---

// Which races draw more from which ground
const YIELD_MULT: Record<string, Partial<Record<Good, number>>> = {
  dwarves: { ore: 1.6, gold: 1.4, timber: 0.8 },
  elves: { timber: 1.3, furs: 1.2 },
  gnomes: { ore: 1.2, gold: 1.3 },
  orcs: { furs: 1.2, timber: 0.9 },
  goblins: { ore: 0.9 },
  humans: {},
};

function seatOf(world: World, name: string): Pop | undefined {
  return world.pops.filter((p) => p.culture === name && !p.target).sort((a, b) => b.count - a.count)[0];
}

// What a settlement draws out of the ground it works
function yieldAround(world: World, pop: Pop, mult: Partial<Record<Good, number>>, out: Record<Good, number>): void {
  const r = C.TIER_HARVEST_RADIUS[tierOf(pop.count)];
  for (let y = Math.max(0, pop.y - r); y <= Math.min(world.height - 1, pop.y + r); y++) {
    for (let x = Math.max(0, pop.x - r); x <= Math.min(world.width - 1, pop.x + r); x++) {
      const i = idx(world, x, y);
      if (isWater(world, x, y)) continue;
      const biome = biomeIdAt(world, i);
      if (biome === 9 || biome === 11 || biome === 12) out.timber += 1 * (mult.timber ?? 1);
      if (world.resources[i] === 1 || world.resources[i] === 2) out.ore += 2 * (mult.ore ?? 1);
      if (world.resources[i] >= 3) out.gold += 2 * (mult.gold ?? 1);
      if (biome === 5 || biome === 6 || biome === 8 || biome === 9) out.furs += 0.6 * (mult.furs ?? 1);
      if (world.coastal[i]) out.fish += 0.8 * (mult.fish ?? 1);
    }
  }
}

export function armsMult(world: World, culture: string): number {
  const e = world.cultures.get(culture)?.economy;
  if (!e) return 1;
  return C.ARMS_MIN + C.ARMS_SPAN * Math.min(1, e.sat.ore);
}

// The richest nation in wagon range that is not sworn to this one
export function richestNeighbor(world: World, name: string): string | null {
  const seat = seatOf(world, name);
  if (!seat) return null;
  let best: string | null = null;
  let bestWealth = 0;
  for (const [other, c] of world.cultures) {
    if (other === name || !c.polity || allied(world, name, other)) continue;
    const s = seatOf(world, other);
    if (!s || Math.max(Math.abs(s.x - seat.x), Math.abs(s.y - seat.y)) > C.TRADE_RANGE) continue;
    const w = world.wealth.get(other) ?? 0;
    if (w > bestWealth) {
      bestWealth = w;
      best = other;
    }
  }
  return best;
}

function atWar(world: World, a: string, b: string): boolean {
  for (const war of world.wars.values()) {
    const sideA = war.attackers.includes(a) ? 1 : war.defenders.includes(a) ? 2 : 0;
    const sideB = war.attackers.includes(b) ? 1 : war.defenders.includes(b) ? 2 : 0;
    if (sideA && sideB && sideA !== sideB) return true;
  }
  return false;
}

const GOOD_PHRASE: Record<Good, string> = { grain: "grain", timber: "timber", ore: "iron", gold: "gold", furs: "furs", fish: "salt fish" };

function tradeRange(world: World, popsA: Pop[], popsB: Pop[], a: string, b: string): boolean {
  let best = Infinity;
  for (const pa of popsA) {
    for (const pb of popsB) {
      const d = Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
      if (d < best) best = d;
    }
  }
  const roaded = popsA.some((p) => world.roads[p.y * world.width + p.x]) && popsB.some((p) => world.roads[p.y * world.width + p.x]);
  let range = C.TRADE_RANGE * (roaded ? C.ROAD_TRADE_MULT : 1);
  if (allied(world, a, b)) range *= 1.3; // sworn friends send wagons farther
  return best <= range;
}

// Yearly: yields, needs, the wagons, the ledger, and what gold buys
export function economyTick(world: World): void {
  world.tradeBoost.clear();
  world.wealth.clear();

  const byCulture = new Map<string, Pop[]>();
  for (const pop of world.pops) {
    const list = byCulture.get(pop.culture);
    if (list) list.push(pop);
    else byCulture.set(pop.culture, [pop]);
  }
  const hostsOf = new Map<string, number>();
  for (const a of world.armies) hostsOf.set(a.culture, (hostsOf.get(a.culture) ?? 0) + a.count);

  // 1. What each people makes and wants
  for (const [name, pops] of byCulture) {
    const culture = world.cultures.get(name)!;
    const e = culture.economy;
    for (const g of GOODS) {
      e.produce[g] = 0;
      e.need[g] = 0;
    }
    const mult = YIELD_MULT[culture.race] ?? {};
    let food = 0;
    let souls = 0;
    let cold = 0;
    let coastalTowns = 0;
    for (const pop of pops) {
      if (pop.target) continue;
      yieldAround(world, pop, mult, e.produce);
      food += pop.foodSat * pop.count;
      souls += pop.count;
      const tier = tierOf(pop.count);
      e.need.timber += (tier + 1) * 1.5;
      e.need.ore += tier * 1.2;
      if (world.meanTemperature[idx(world, pop.x, pop.y)] < 5) cold += tier + 1;
      if (world.coastal[idx(world, pop.x, pop.y)]) coastalTowns++;
    }
    e.produce.grain = souls ? food / souls - 1 : 0; // surplus per soul, as the old wagons measured it
    e.need.ore += (hostsOf.get(name) ?? 0) / 500;
    e.need.gold += (souls / 4000) * (1 + (culture.polity?.rank ?? 0));
    e.need.furs += cold;
    e.need.fish += coastalTowns;
    for (const g of GOODS) {
      if (g === "grain") e.sat.grain = 1 + e.produce.grain;
      else e.sat[g] = e.need[g] > 0 ? Math.min(2, e.produce[g] / e.need[g]) : 1.5;
    }
  }

  // 2. The wagons: existing routes first (they keep their volume while the
  // surplus and shortage that opened them last), then new ones
  const nations = [...byCulture.keys()].filter((n) => world.cultures.get(n)?.polity);
  const routeCount = new Map<string, number>();
  for (const r of world.routes) {
    routeCount.set(r.a, (routeCount.get(r.a) ?? 0) + 1);
    routeCount.set(r.b, (routeCount.get(r.b) ?? 0) + 1);
  }
  const income = new Map<string, number>();
  const flow = (route: Route, opening = false): boolean => {
    const seller = world.cultures.get(route.a)?.economy;
    const buyer = world.cultures.get(route.b)?.economy;
    if (!seller || !buyer) return false;
    const g = route.good;
    const margin = opening ? C.ROUTE_SELL_MIN : C.ROUTE_KEEP_MIN; // routes are sticky: easier to keep than to open
    if (g === "grain") {
      if (seller.produce.grain < C.TRADE_SURPLUS_MIN || buyer.produce.grain > C.TRADE_DEFICIT_MAX) return false;
      const lift = Math.min(C.TRADE_CAP, seller.produce.grain * 0.4);
      world.tradeBoost.set(route.b, (world.tradeBoost.get(route.b) ?? 0) + lift);
      world.tradeBoost.set(route.a, (world.tradeBoost.get(route.a) ?? 0) + C.TRADE_PROSPER);
      buyer.sat.grain += lift;
      route.volume = Math.round(lift * 100);
      income.set(route.a, (income.get(route.a) ?? 0) + 4);
      return true;
    }
    const excess = seller.produce[g] - seller.need[g] * margin;
    const short = buyer.need[g] * margin - buyer.produce[g];
    if (excess <= 0 || short <= 0 || buyer.sat[g] > (opening ? C.ROUTE_BUY_MAX : 1)) return false;
    const moved = Math.min(excess, short);
    buyer.produce[g] += moved;
    buyer.sat[g] = buyer.need[g] > 0 ? Math.min(2, buyer.produce[g] / buyer.need[g]) : 1.5;
    seller.produce[g] -= moved;
    seller.sat[g] = seller.need[g] > 0 ? Math.min(2, seller.produce[g] / seller.need[g]) : 1.5;
    route.volume = Math.round(moved);
    const price = C.PRICE[g] * (1 + Math.max(0, 1 - buyer.sat[g])); // scarcity is the seller's friend
    income.set(route.a, (income.get(route.a) ?? 0) + moved * price * 0.5);
    return true;
  };
  const closed: Route[] = [];
  for (const route of world.routes) {
    const popsA = byCulture.get(route.a);
    const popsB = byCulture.get(route.b);
    if (!popsA || !popsB || atWar(world, route.a, route.b) || !tradeRange(world, popsA, popsB, route.a, route.b)) {
      closed.push(route);
      if (popsA && popsB) {
        logEvent(
          world,
          atWar(world, route.a, route.b)
            ? `War closes the road: the wagons of ${GOOD_PHRASE[route.good]} between the ${route.a} and the ${route.b} roll no more.`
            : `The wagons of ${GOOD_PHRASE[route.good]} between the ${route.a} and the ${route.b} roll no more; the road is too long now.`,
          atWar(world, route.a, route.b) ? 2 : 1,
          { subjects: [route.a, route.b] },
        );
      }
      continue;
    }
    if (flow(route)) {
      route.idle = 0;
    } else {
      route.idle++;
      route.volume = 0;
      if (route.idle >= C.ROUTE_IDLE_CLOSE) {
        closed.push(route);
        logEvent(world, `The wagons of ${GOOD_PHRASE[route.good]} between the ${route.a} and the ${route.b} roll no more; the ${route.b} have ${GOOD_PHRASE[route.good]} enough of their own now.`, 1, {
          subjects: [route.a, route.b],
        });
      }
    }
  }
  if (closed.length) {
    world.routes = world.routes.filter((r) => !closed.includes(r));
    for (const r of closed) {
      routeCount.set(r.a, (routeCount.get(r.a) ?? 0) - 1);
      routeCount.set(r.b, (routeCount.get(r.b) ?? 0) - 1);
    }
  }
  for (let i = 0; i < nations.length; i++) {
    for (let j = 0; j < nations.length; j++) {
      if (i === j) continue;
      const a = nations[i];
      const b = nations[j];
      if ((routeCount.get(a) ?? 0) >= C.ROUTES_PER_NATION || (routeCount.get(b) ?? 0) >= C.ROUTES_PER_NATION) continue;
      if (atWar(world, a, b) || (world.grudges.get(pairKey(a, b)) ?? 0) >= C.GRUDGE_VENDETTA) continue;
      const popsA = byCulture.get(a)!;
      const popsB = byCulture.get(b)!;
      if (!tradeRange(world, popsA, popsB, a, b)) continue;
      const seller = world.cultures.get(a)!.economy;
      const buyer = world.cultures.get(b)!.economy;
      for (const g of GOODS) {
        if (world.routes.some((r) => r.a === a && r.b === b && r.good === g)) continue;
        const match =
          g === "grain"
            ? seller.produce.grain >= C.TRADE_SURPLUS_MIN && buyer.produce.grain <= C.TRADE_DEFICIT_MAX
            : seller.sat[g] >= C.ROUTE_SELL_MIN && buyer.sat[g] <= C.ROUTE_BUY_MAX && buyer.need[g] > 0;
        if (!match || world.rng() >= C.ROUTE_OPEN_CHANCE) continue;
        const route: Route = { a, b, good: g, since: world.year, volume: 0, idle: 0 };
        if (!flow(route, true)) continue;
        world.routes.push(route);
        routeCount.set(a, (routeCount.get(a) ?? 0) + 1);
        routeCount.set(b, (routeCount.get(b) ?? 0) + 1);
        const wantBack = GOODS.filter((h) => h !== g && buyer.sat[h] >= C.ROUTE_SELL_MIN && seller.sat[h] <= 1)[0];
        // The first wagons between two peoples are news; more roads between old partners are local color
        const pair = pairKey(a, b);
        const firstRoad = !world.tradeLog.has(pair);
        world.tradeLog.set(pair, world.year);
        logEvent(
          world,
          `Wagons roll between the ${a} and the ${b}: ${GOOD_PHRASE[g]}${wantBack ? ` against ${GOOD_PHRASE[wantBack]}` : " for gold"}.`,
          firstRoad ? 2 : 1,
          { subjects: [a, b] },
        );
        break; // one new route per pair per year
      }
    }
  }

  // 3. Prosperity, the ledger, and the treasury
  for (const [name, pops] of byCulture) {
    const culture = world.cultures.get(name)!;
    const e = culture.economy;
    let sum = 0;
    let n = 0;
    for (const g of GOODS) {
      if (g === "grain" || e.need[g] <= 0) continue;
      sum += Math.min(1.5, e.sat[g]);
      n++;
    }
    let routes = 0;
    for (const r of world.routes) if (r.a === name || r.b === name) routes++;
    const raw = (n ? sum / n : 1) * 0.8 + Math.min(1, e.sat.grain) * 0.2 + Math.min(0.3, routes * 0.075);
    e.prosperity = e.prosperity * 0.7 + raw * 0.3;
    if (e.prosperity > 1) {
      world.tradeBoost.set(name, (world.tradeBoost.get(name) ?? 0) + Math.min(C.PROSPERITY_FOOD_CAP, (e.prosperity - 1) * C.PROSPERITY_FOOD));
    }
    // The ledger: what a people makes this year
    let w = 0;
    for (const pop of pops) w += tierOf(pop.count) * 2;
    w += e.produce.gold * 1.5;
    if (culture.temple !== null) w += C.TEMPLE_WEALTH;
    if (e.market !== null) w += C.MARKET_WEALTH;
    w += income.get(name) ?? 0;
    for (const pop of pops) if (pop.yoke && pop.yoke.of !== name) w += C.TRIBUTE_PER_SETTLEMENT; // tribute from the conquered
    e.treasury = Math.min(C.TREASURY_CAP, e.treasury + w * C.TREASURY_RATE);
    world.wealth.set(name, Math.round(w + e.treasury / 4));

    // Booms and busts are chronicled once per crossing
    const seat = seatOf(world, name);
    const at = seat ? { x: seat.x, y: seat.y } : undefined;
    const noteDue = world.year - e.boomYear >= C.BOOM_NOTE_YEARS;
    if (e.prosperity >= C.PROSPERITY_BOOM && e.boomNote !== 1 && noteDue) {
      e.boomNote = 1;
      e.boomYear = world.year;
      logEvent(world, `The ${name} grow rich; their markets are full of strangers and their granaries of grain.`, 2, { subjects: [name], at });
    } else if (e.prosperity <= C.PROSPERITY_BUST && e.boomNote !== -1 && noteDue) {
      e.boomNote = -1;
      e.boomYear = world.year;
      const dear = GOODS.filter((g) => g !== "grain" && e.need[g] > 0 && e.sat[g] < 0.5).map((g) => GOOD_PHRASE[g]);
      logEvent(world, `Hard years for the ${name}: ${dear.length ? `${dear.join(" and ")} ${dear.length > 1 ? "are" : "is"} dear` : "little comes to market"}, and the stalls stand empty.`, 2, {
        subjects: [name],
        at,
      });
    } else if (e.prosperity > C.PROSPERITY_BUST + 0.2 && e.prosperity < C.PROSPERITY_BOOM - 0.2) {
      e.boomNote = 0;
    }
  }

  // 4. What gold buys: granaries, market towns, sellswords
  for (const name of nations) {
    const culture = world.cultures.get(name)!;
    const e = culture.economy;
    const seat = seatOf(world, name);
    if (!seat) continue;
    // A market town: the seat, once two roads meet there
    if (e.market !== null) {
      const m = world.markets.get(e.market);
      const standing = m && m.culture === name && world.pops.some((p) => p.culture === name && !p.target && idx(world, p.x, p.y) === e.market);
      if (!standing) {
        if (m && m.culture === name) world.markets.delete(e.market);
        e.market = null;
      }
    }
    let routes = 0;
    for (const r of world.routes) if (r.a === name || r.b === name) routes++;
    if (e.market === null && routes >= 2 && e.treasury >= C.MARKET_COST && seat.tier >= 2 && !world.markets.has(idx(world, seat.x, seat.y))) {
      e.treasury -= C.MARKET_COST;
      e.market = idx(world, seat.x, seat.y);
      world.markets.set(e.market, { culture: name, year: world.year });
      logEvent(world, `The seat of the ${name} in ${describeLocation(world, seat.x, seat.y)} becomes a market town; wagons from ${routes} roads unload there.`, 2, {
        subjects: [name],
        at: { x: seat.x, y: seat.y },
      });
      continue;
    }
    // Granaries: the lean years answered in advance, bought when grain runs short or gold runs long
    if (e.granaries < C.GRANARY_MAX && e.treasury >= C.GRANARY_COST && (e.sat.grain < 0.95 || e.treasury >= C.TREASURY_CAP * 0.8)) {
      e.treasury -= C.GRANARY_COST;
      e.granaries++;
      logEvent(world, `The ${name} raise ${e.granaries === 1 ? "a granary" : "another granary"} against the lean years.`, 1, { subjects: [name], at: { x: seat.x, y: seat.y } });
      continue;
    }
    // Sellswords: a nation at war with gold to spend hires spears out of a neutral neighbor
    if (e.treasury >= C.MERC_COST && world.rng() < C.MERC_CHANCE) hireMercenaries(world, name, seat, byCulture);
  }

  // 5. The wagons on the map follow the routes
  syncCaravans(world);
}

function hireMercenaries(world: World, name: string, seat: Pop, byCulture: Map<string, Pop[]>): void {
  let warKey: string | null = null;
  for (const [key, war] of world.wars) {
    if (war.attackers.includes(name) || war.defenders.includes(name)) {
      warKey = key;
      break;
    }
  }
  if (!warKey) return;
  const war = world.wars.get(warKey)!;
  const enemies = war.attackers.includes(name) ? war.defenders : war.attackers;
  const last = world.mercLog.get(name);
  if (last !== undefined && world.year - last < 5) return;
  // A neutral people in range with a settlement big enough to sell spears
  let source: Pop | null = null;
  for (const [other, pops] of byCulture) {
    if (other === name || enemies.includes(other) || atWar(world, name, other) || enemies.some((e) => allied(world, other, e))) continue;
    for (const p of pops) {
      if (p.target || p.count < C.MUSTER_MIN_POP * 2) continue;
      if (Math.max(Math.abs(p.x - seat.x), Math.abs(p.y - seat.y)) > C.TRADE_RANGE) continue;
      if (!source || p.count > source.count) source = p;
    }
  }
  if (!source) return;
  const spears = Math.round(source.count * C.MERC_FRACTION);
  if (spears < C.ARMY_MIN) return;
  const hirer = world.cultures.get(name)!.economy;
  const seller = world.cultures.get(source.culture)!.economy;
  hirer.treasury -= C.MERC_COST;
  seller.treasury = Math.min(C.TREASURY_CAP, seller.treasury + C.MERC_COST);
  source.count -= spears;
  world.armies.push({ id: world.nextArmyId++, culture: name, count: spears, x: source.x, y: source.y, war: warKey, morale: 1 });
  world.mercLog.set(name, world.year);
  logEvent(
    world,
    `The ${name} hire ${spears.toLocaleString("en-US")} spears out of the ${source.culture} with gold; the sellswords march under the ${name}'s banner against the ${enemies[0]}.`,
    2,
    { subjects: [name, source.culture], at: { x: source.x, y: source.y } },
  );
}

// One caravan per route, walking the line between the two seats
function syncCaravans(world: World): void {
  world.caravans = world.caravans.filter((c) => c.route < world.routes.length);
  const have = new Set(world.caravans.map((c) => c.route));
  for (let i = 0; i < world.routes.length; i++) {
    if (have.has(i)) continue;
    const seat = seatOf(world, world.routes[i].a);
    if (!seat) continue;
    world.caravans.push({ id: world.nextCaravanId++, route: i, x: seat.x, y: seat.y, dir: 1 });
  }
  // Routes were filtered this year; caravans keep their index by matching pairs
}

// Each season: the wagons move between the seats, and beasts in reach take them
export function caravansTick(world: World): void {
  if (!world.caravans.length) return;
  for (const c of world.caravans) {
    const route = world.routes[c.route];
    if (!route) continue;
    const target = seatOf(world, c.dir === 1 ? route.b : route.a);
    if (!target) continue;
    for (let s = 0; s < C.CARAVAN_SPEED; s++) {
      if (c.x === target.x && c.y === target.y) {
        c.dir = c.dir === 1 ? -1 : 1;
        break;
      }
      c.x += Math.sign(target.x - c.x);
      c.y += Math.sign(target.y - c.y);
    }
    // Something on the road: wolves, manticores, ogres, anything hungry
    const beast = world.beasts.find(
      (b) => b.alive && !b.throne && b.sleepUntil <= world.year && b.kind !== "serpent" && Math.max(Math.abs(b.x - c.x), Math.abs(b.y - c.y)) <= 2,
    );
    if (beast && world.rng() < C.CARAVAN_RAID_CHANCE) {
      const seller = world.cultures.get(route.a)?.economy;
      if (seller) seller.treasury = Math.max(0, seller.treasury - 3);
      beast.kills += 5;
      const key = pairKey(route.a, route.b);
      const last = world.caravanLog.get(key);
      if (last === undefined || world.year - last >= C.CARAVAN_LOG_YEARS) {
        world.caravanLog.set(key, world.year);
        logEvent(world, `${beast.name} takes the wagons of the ${route.a} on the road to the ${route.b}; the ${GOOD_PHRASE[route.good]} is scattered in ${describeLocation(world, c.x, c.y)}.`, LESSER.has(beast.kind) ? 1 : 2, {
          subjects: [route.a, route.b],
          at: { x: c.x, y: c.y },
        });
      }
    }
    // Or an enemy host: plunder, and the goods change banners
    const host = world.armies.find((a) => a.culture !== route.a && a.culture !== route.b && atWar(world, a.culture, route.a) && Math.max(Math.abs(a.x - c.x), Math.abs(a.y - c.y)) <= 1);
    if (host) {
      const seller = world.cultures.get(route.a)?.economy;
      const taker = world.cultures.get(host.culture)?.economy;
      if (seller && taker) {
        const take = Math.min(5, seller.treasury);
        seller.treasury -= take;
        taker.treasury = Math.min(C.TREASURY_CAP, taker.treasury + take);
      }
      const key = pairKey(route.a, host.culture);
      const last = world.caravanLog.get(key);
      if (last === undefined || world.year - last >= C.CARAVAN_LOG_YEARS) {
        world.caravanLog.set(key, world.year);
        logEvent(world, `The host of the ${host.culture} falls on the wagons of the ${route.a} in ${describeLocation(world, c.x, c.y)}; the ${GOOD_PHRASE[route.good]} goes to the ${host.culture}.`, 2, {
          subjects: [host.culture, route.a],
          at: { x: c.x, y: c.y },
        });
      }
    }
  }
}

export function prosperityWord(e: Culture["economy"]): string {
  if (e.prosperity >= C.PROSPERITY_BOOM) return "flourishing";
  if (e.prosperity >= 1) return "prosperous";
  if (e.prosperity >= C.PROSPERITY_BUST + 0.2) return "getting by";
  if (e.prosperity >= C.PROSPERITY_BUST) return "hard years";
  return "destitute";
}

export { GOOD_PHRASE };
