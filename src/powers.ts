import * as C from "./constants";
import { kindPhrase } from "./beasts";
import { angelName } from "./names";
import { polityName } from "./nations";
import type { Beast, Culture, Figure, Pop, World } from "./world";
import { describeLocation, heroOf, leaderOf, logEvent, mintFigure, noteFaith, recordKill } from "./world";

// --- Angels and demons: intelligent powers that hold office. A demon is a
// beast with a body AND a mind: it walks toward the towns, and a weak or
// forsaken throne it reaches, it takes. Enthroned, it IS that nation's
// leader-figure, and everything leadership already drives follows: the
// cruelest conduct, hosts of the damned, faith curdling under a king none
// dare name. Deposing it is a champion's quest or the god's wrath, and its
// reign is an era the chronicle brackets. Angels are the counterpart, born
// of temple-faith: guardians who stand as a devout people's champion,
// shield them from beasts, and depart if the faith that called them fails. ---

function seatOf(world: World, name: string): Pop | undefined {
  return world.pops.filter((p) => p.culture === name && !p.target).sort((a, b) => b.count - a.count)[0];
}

function demonKingOf(world: World, culture: string): Beast | undefined {
  return world.beasts.find((b) => b.alive && b.kind === "demon" && b.throne === culture);
}

// A demon takes a throne: the old ruler is cast down, the demon becomes the
// leader-figure, and the people's fires turn dark whether they will or no
function usurp(world: World, demon: Beast, culture: Culture, seat: Pop): void {
  const old = leaderOf(world, culture.name);
  if (old) old.alive = false;
  const king = mintFigure(world, culture.name, "leader");
  king.name = demon.name;
  king.nature = "demon";
  king.temperament = "warlike";
  king.ambition = "conquest";
  king.born = world.year - 1000; // ageless; the figures pass skips the death rolls for the unmortal
  king.birthCulture = null;
  demon.throne = culture.name;
  demon.enthroned = world.year;
  demon.x = seat.x;
  demon.y = seat.y;
  demon.lairX = seat.x;
  demon.lairY = seat.y;
  culture.faith = Math.min(culture.faith, -C.FAITH_MONUMENT);
  logEvent(
    world,
    old
      ? `${demon.name} walks into ${describeLocation(world, seat.x, seat.y)} and takes the throne of the ${polityName(culture)}; ${old.name} is cast down, and none dare speak the new king's name.`
      : `${demon.name} walks into ${describeLocation(world, seat.x, seat.y)} and takes the empty throne of the ${polityName(culture)}; none dare speak the new king's name.`,
    3,
    { subjects: [culture.name], at: { x: seat.x, y: seat.y }, epochal: true },
  );
  noteFaith(world, culture);
}

// A demon king is cast down: by a champion, by the god, or it tires and goes
// beneath. The people come out of their houses; a mortal takes the seat.
export function dethrone(world: World, demon: Beast, by: string, byGod = false): void {
  const name = demon.throne;
  demon.throne = null;
  demon.alive = false;
  const king = world.figures.find((f) => f.alive && f.nature === "demon" && f.culture === name);
  if (king) king.alive = false;
  if (!name) return;
  const culture = world.cultures.get(name);
  const seat = seatOf(world, name);
  if (!culture || !world.pops.some((p) => p.culture === name)) return;
  const heir = mintFigure(world, name, "leader");
  const at = seat ? { x: seat.x, y: seat.y } : undefined;
  logEvent(
    world,
    by === "weariness"
      ? `${demon.name} tires of the throne of the ${polityName(culture)} and goes back beneath; ${heir.name} takes the empty seat, and the people come out of their houses.`
      : `${demon.name} is cast down from the throne of the ${polityName(culture)} by ${by}; ${heir.name} takes the seat, and the people come out of their houses.`,
    3,
    { subjects: [name], at, epochal: true },
  );
  if (byGod) {
    // Delivered by the sky they cursed: some of them look up again
    culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + 3);
    logEvent(world, `The ${name} know whose hand cast the demon down; some among them look up at the sky again.`, 2, { subjects: [name], at });
    noteFaith(world, culture);
  } else {
    culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + 1);
  }
}

// A champion rides against a demon king: a duel at the gates
function challenge(world: World, demon: Beast, hero: Figure): void {
  const throne = world.cultures.get(demon.throne!)!;
  const favor = (hero.blessed ? C.ANOINT_BLESSING : 0) + (hero.nature === "angel" ? C.ANGEL_EDGE : 0);
  hero.blessed = false;
  const where = describeLocation(world, demon.x, demon.y);
  if (world.rng() < C.HUNT_WIN.demon + favor) {
    recordKill(world, hero, `${demon.name}, the demon king of the ${throne.name}`);
    dethrone(world, demon, hero.culture === throne.name ? `${hero.name}, their own champion` : `${hero.name} of the ${hero.culture}`);
  } else {
    hero.alive = false;
    logEvent(
      world,
      hero.nature === "angel"
        ? `${hero.name} comes against ${demon.name} at the gates of ${where}, and the light goes out; the demon king keeps his seat.`
        : `${hero.name} of the ${hero.culture} rides against ${demon.name} at the gates of ${where}, and does not ride back.`,
      3,
      { subjects: [hero.culture, throne.name], at: { x: demon.x, y: demon.y } },
    );
  }
}

// A guardian comes down on a devout people: it stands as their champion
export function descendAngel(world: World, culture: Culture, byGod = false): Figure | null {
  const seat = seatOf(world, culture.name);
  if (!seat || !culture.creed) return null;
  const angel = mintFigure(world, culture.name, "hero");
  angel.name = angelName(world.rng);
  angel.nature = "angel";
  angel.born = world.year - 1000;
  angel.ambition = null;
  angel.birthCulture = null;
  angel.blessed = byGod;
  logEvent(
    world,
    byGod
      ? `At your touch a light comes down on ${describeLocation(world, seat.x, seat.y)}: ${angel.name}, a guardian of ${culture.creed.title}, stands over the ${culture.name}.`
      : `A light comes down on ${describeLocation(world, seat.x, seat.y)}: ${angel.name}, a guardian of ${culture.creed.title}, stands over the ${culture.name}.`,
    3,
    { subjects: [culture.name], at: { x: seat.x, y: seat.y } },
  );
  return angel;
}

// Yearly: demons walk to thrones and sit on them, or tire of them; champions
// ride against demon kings; guardians descend on the devout and depart from
// the faithless
export function powersTick(world: World): void {
  const living = new Set(world.pops.map((p) => p.culture));

  for (const demon of world.beasts) {
    if (!demon.alive || demon.kind !== "demon") continue;
    if (demon.throne) {
      const culture = world.cultures.get(demon.throne);
      if (!culture || !living.has(demon.throne)) {
        // The nation died under it; the demon goes back beneath
        demon.throne = null;
        demon.alive = false;
        const king = world.figures.find((f) => f.alive && f.nature === "demon" && f.culture === culture?.name);
        if (king) king.alive = false;
        logEvent(world, `With no one left to rule, ${demon.name} goes back beneath.`, 2, { at: { x: demon.x, y: demon.y } });
        continue;
      }
      // The reign: fires curdle further each year; the seat follows the people
      culture.faith = Math.max(-2 * C.FAITH_MONUMENT, culture.faith - 1);
      const seat = seatOf(world, demon.throne);
      if (seat) {
        demon.x = seat.x;
        demon.y = seat.y;
      }
      if (world.year - demon.enthroned >= C.DEMON_TIRE_YEARS && world.rng() < C.DEMON_TIRE_CHANCE) {
        dethrone(world, demon, "weariness");
        continue;
      }
      // Champions in reach ride against it: their own, or a devout neighbor's
      const challengers: Figure[] = [];
      for (const [name, c] of world.cultures) {
        if (!living.has(name)) continue;
        const hero = heroOf(world, name);
        if (!hero) continue;
        if (name !== demon.throne && c.creed?.stance !== "devout") continue;
        const s = seatOf(world, name);
        if (!s || Math.max(Math.abs(s.x - demon.x), Math.abs(s.y - demon.y)) > C.CHALLENGE_REACH) continue;
        challengers.push(hero);
      }
      if (challengers.length && world.rng() < C.CHALLENGE_CHANCE) {
        // Guardians go first; the sky and the pit have business
        const angel = challengers.find((h) => h.nature === "angel");
        challenge(world, demon, angel ?? challengers[Math.floor(world.rng() * challengers.length)]);
      }
      continue;
    }
    // Abroad: it looks for a throne. A nation's seat in reach, weak or forsaken, is taken.
    for (const [name, culture] of world.cultures) {
      if (!culture.polity || !living.has(name)) continue;
      const seat = seatOf(world, name);
      if (!seat || Math.max(Math.abs(seat.x - demon.x), Math.abs(seat.y - demon.y)) > C.DEMON_REACH) continue;
      const leader = leaderOf(world, name);
      // Forsaken, leaderless, or championless without the stones to steady them
      const weak = culture.faith <= -C.CREED_MIN_FAITH || !leader || (heroOf(world, name) === undefined && culture.faith < C.FAITH_MONUMENT);
      if (!weak || world.rng() >= C.DEMON_USURP_CHANCE) continue;
      usurp(world, demon, culture, seat);
      break;
    }
    if (demon.throne) continue;
    // Not yet: it walks toward the nearest seat
    let target: Pop | null = null;
    let best = Infinity;
    for (const [name, culture] of world.cultures) {
      if (!culture.polity || !living.has(name)) continue;
      const seat = seatOf(world, name);
      if (!seat) continue;
      const d = Math.max(Math.abs(seat.x - demon.x), Math.abs(seat.y - demon.y));
      if (d < best) {
        best = d;
        target = seat;
      }
    }
    if (target) {
      demon.x += Math.sign(target.x - demon.x) * Math.min(2, Math.abs(target.x - demon.x));
      demon.y += Math.sign(target.y - demon.y) * Math.min(2, Math.abs(target.y - demon.y));
      demon.lairX = demon.x;
      demon.lairY = demon.y;
    }
  }

  // Angels: sent to the devout who have raised a house and have no champion;
  // departing from those whose faith has failed
  let abroad = 0;
  for (const f of world.figures) if (f.alive && f.nature === "angel") abroad++;
  for (const f of world.figures) {
    if (!f.alive || f.nature !== "angel") continue;
    const culture = world.cultures.get(f.culture);
    if (!culture || !living.has(f.culture)) {
      f.alive = false;
      continue;
    }
    if (culture.faith < C.CREED_MIN_FAITH || culture.creed?.stance === "forsaken") {
      f.alive = false;
      abroad--;
      const seat = seatOf(world, f.culture);
      logEvent(world, `The guardian ${f.name} departs the ${f.culture}; the light goes out of their halls.`, 3, {
        subjects: [f.culture],
        at: seat ? { x: seat.x, y: seat.y } : undefined,
      });
    }
  }
  for (const [name, culture] of world.cultures) {
    if (abroad >= C.ANGEL_CAP) break;
    if (!living.has(name) || culture.temple === null || culture.faith < C.FAITH_MONUMENT) continue;
    if (!culture.creed || culture.creed.stance !== "devout") continue;
    if (heroOf(world, name)) continue;
    if (world.rng() >= C.ANGEL_CHANCE) continue;
    if (descendAngel(world, culture)) abroad++;
  }
}

export { demonKingOf, kindPhrase };
