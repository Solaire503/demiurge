import * as C from "./constants";
import { creedTitle, prophecyText, prophetName } from "./names";
import { allied, alliesOf, polityName } from "./nations";
import type { Aspect, Culture, Figure, Pop, Stance, World } from "./world";
import { describeLocation, idx, logEvent, mintFigure, noteFaith, pairKey } from "./world";

// --- The god has a face, and the peoples draw it. Every divine act is seen
// by whoever lives in earshot, and what they see accumulates as REGARD: a
// weight on each aspect of the god (life, wrath, land, peace, war). Regard
// plus faith becomes a CREED: the name a people gives its god and the rites
// it shapes to that name. The creed is a sim input: it tilts the leaders a
// people raises, the oaths it swears, the wars it fights and how, the roads
// it lays. So the god's own conduct, read by the peoples, comes back to it
// as religion, and no two gods get the same world. ---

export const ASPECTS: Aspect[] = ["life", "wrath", "land", "peace", "war"];

export function emptyRegard(): Record<Aspect, number> {
  return { life: 0, wrath: 0, land: 0, peace: 0, war: 0 };
}

// What the god does is seen. Every people with a settlement in earshot
// remembers what kind of hand it was; a living prophet who foretold exactly
// this kind of act is proven true.
export function regard(world: World, cx: number, cy: number, aspect: Aspect, weight = 1): void {
  const seen = new Set<string>();
  for (const pop of world.pops) {
    if (Math.max(Math.abs(pop.x - cx), Math.abs(pop.y - cy)) > C.PRAYER_RADIUS) continue;
    if (seen.has(pop.culture)) continue;
    seen.add(pop.culture);
    const culture = world.cultures.get(pop.culture);
    if (!culture) continue;
    culture.regard[aspect] = Math.min(C.REGARD_CAP, culture.regard[aspect] + weight);
    fulfilProphecy(world, culture, aspect, cx, cy);
  }
}

export function creedOf(world: World, name: string): Culture["creed"] {
  return world.cultures.get(name)?.creed ?? null;
}

// How strongly a creed bends the dice: the devout and the forsaken feel it
// in full, witnesses (who have seen much and been given nothing) by half
function creedForce(creed: NonNullable<Culture["creed"]>): number {
  return creed.stance === "witness" ? 0.5 : 1;
}

function scaled(mult: number, force: number): number {
  return 1 + (mult - 1) * force;
}

// The leaders a people raises follow the god they know: a people of the
// Burning One raises warlords; a people of the Quiet Voice raises peacemakers
const CREED_TEMPERAMENT: Record<Aspect, Partial<Record<string, number>>> = {
  life: { peaceable: 1.5 },
  wrath: { warlike: 1.7 },
  land: { cunning: 1.3, ambitious: 1.2 },
  peace: { peaceable: 1.8, warlike: 0.6 },
  war: { warlike: 1.4, ambitious: 1.3 },
};
const FORSAKEN_TEMPERAMENT: Partial<Record<string, number>> = { warlike: 1.4, cunning: 1.2 };

export function creedTemperamentMult(creed: Culture["creed"], temperament: string): number {
  if (!creed) return 1;
  const table = creed.stance === "forsaken" ? FORSAKEN_TEMPERAMENT : CREED_TEMPERAMENT[creed.aspect];
  return scaled(table[temperament] ?? 1, creedForce(creed));
}

// A knob the rest of the sim reads: "how does this people's creed bend X?"
export type CreedKnob = "muster" | "accord" | "plague" | "hero" | "duel" | "cruelty" | "roads" | "grudgeCool";

const KNOBS: Record<CreedKnob, Partial<Record<Aspect | "forsaken", number>>> = {
  muster: { wrath: 1.15, war: 1.15, peace: 0.85, forsaken: 1.1 },
  accord: { peace: 0.1, wrath: -0.05, war: -0.05, forsaken: -0.05 }, // additive shifts on the accord threshold
  plague: { life: 0.8 },
  hero: { war: 1.5, wrath: 1.2 },
  duel: { war: 1.5 },
  cruelty: { wrath: -2, war: -1, forsaken: -2, peace: 2, life: 1 }, // additive shift on the hate threshold; negative is crueler sooner
  roads: { land: 2 }, // road links laid per year
  grudgeCool: { peace: 1.5 },
};

export function creedKnob(world: World, name: string, knob: CreedKnob): number {
  const creed = creedOf(world, name);
  const additive = knob === "accord" || knob === "cruelty";
  if (!creed) return additive ? 0 : 1;
  const table = KNOBS[knob];
  const raw = (creed.stance === "forsaken" ? table.forsaken : table[creed.aspect]) ?? (additive ? 0 : 1);
  const force = creedForce(creed);
  return additive ? raw * force : scaled(raw, force);
}

export function sameCreed(world: World, a: string, b: string): boolean {
  const ca = creedOf(world, a);
  const cb = creedOf(world, b);
  return !!ca && !!cb && ca.stance !== "forsaken" && cb.stance !== "forsaken" && ca.aspect === cb.aspect;
}

export function prophetOf(world: World, culture: string): Figure | undefined {
  return world.figures.find((f) => f.alive && f.role === "prophet" && f.culture === culture);
}

// A prophet's word comes true: the god did the kind of thing they foretold,
// where their people could see it
function fulfilProphecy(world: World, culture: Culture, aspect: Aspect, cx: number, cy: number): void {
  const prophet = prophetOf(world, culture.name);
  if (!prophet?.prophecy || prophet.prophecy.fulfilled !== null || prophet.prophecy.aspect !== aspect) return;
  prophet.prophecy.fulfilled = world.year;
  prophet.renowned = true;
  const dark = culture.creed?.stance === "forsaken";
  if (dark) {
    // The curse they foretold has fallen; the fires beneath burn brighter
    culture.faith = Math.max(-2 * C.FAITH_MONUMENT, culture.faith - 1);
    logEvent(world, `It is as ${prophet.name} foretold: the sky strikes the ${culture.name}. They turn further from it, and make their fires to the powers beneath.`, 3, {
      subjects: [culture.name],
      at: { x: cx, y: cy },
    });
  } else {
    culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + C.PROPHECY_FAITH);
    culture.regard[aspect] = Math.min(C.REGARD_CAP, culture.regard[aspect] + C.PROPHECY_REGARD);
    logEvent(world, `The word of ${prophet.name} is fulfilled: ${prophet.prophecy.text}. The ${culture.name} fall to their knees.`, 3, {
      subjects: [culture.name],
      at: { x: cx, y: cy },
    });
  }
  noteFaith(world, culture);
}

function seatOf(world: World, name: string): Pop | undefined {
  return world.pops.filter((p) => p.culture === name && !p.target).sort((a, b) => b.count - a.count)[0];
}

function stanceOf(culture: Culture, total: number): Stance | null {
  if (culture.faith >= C.CREED_MIN_FAITH) return "devout";
  if (culture.faith <= -C.CREED_MIN_FAITH) return "forsaken";
  if (total >= C.CREED_WITNESS_REGARD) return "witness";
  return null;
}

// Yearly: regard fades, creeds form and shift, temples rise, rites pass
// between friends, prophets rise and are proven or shamed, and peoples who
// name the god differently find it hard to keep the peace
export function creedTick(world: World): void {
  const living = new Map<string, Pop[]>();
  for (const pop of world.pops) {
    const list = living.get(pop.culture);
    if (list) list.push(pop);
    else living.set(pop.culture, [pop]);
  }

  for (const [name, culture] of world.cultures) {
    if (!living.has(name)) continue;
    let total = 0;
    let dominant: Aspect = "life";
    for (const a of ASPECTS) {
      culture.regard[a] *= C.REGARD_DECAY;
      total += culture.regard[a];
      if (culture.regard[a] > culture.regard[dominant]) dominant = a;
    }
    const stance = stanceOf(culture, total);
    const old = culture.creed;

    // A creed needs a stance toward the god and enough seen to name it
    if (!stance || culture.regard[dominant] < C.CREED_MIN_REGARD) {
      if (old && total < 1 && world.year - old.since >= C.CREED_LAPSE_YEARS && stance === null) {
        culture.creed = null;
        logEvent(world, `The ${name} no longer speak the name ${old.title}; the sky is only sky to them now.`, 2, { subjects: [name] });
      }
      continue;
    }
    const shift =
      old &&
      old.aspect !== dominant &&
      culture.regard[dominant] > culture.regard[old.aspect] * C.CREED_SHIFT_MARGIN &&
      world.year - old.since >= C.CREED_MIN_YEARS;
    const turn = old && old.stance !== stance && (stance === "forsaken" || old.stance === "forsaken");
    if (old && !shift && !turn) {
      if (old.stance === "witness" && stance === "devout") old.stance = "devout"; // faith caught up with what they saw
      continue;
    }
    const aspect = shift || !old ? dominant : old.aspect;
    const title = creedTitle(world.rng, aspect, stance === "forsaken");
    culture.creed = { aspect, stance, title, since: world.year };
    const seat = seatOf(world, name);
    const at = seat ? { x: seat.x, y: seat.y } : undefined;
    if (!old) {
      logEvent(
        world,
        stance === "forsaken"
          ? `The ${name} have a name for the god that mocks them: ${title}. They curse it at their fires.`
          : `The ${name} come to know their god: they name it ${title}, and shape their rites to it.`,
        3,
        { subjects: [name], at },
      );
    } else if (turn) {
      logEvent(
        world,
        stance === "forsaken"
          ? `To the ${name}, ${old.title} has become ${title}. Its altars are cast down.`
          : `The ${name} forgive the sky: ${old.title} they curse no more, and name it ${title}.`,
        3,
        { subjects: [name], at },
      );
      if (culture.temple !== null) {
        const t = world.monuments.get(culture.temple);
        if (t && t.kind === "temple") t.note = stance === "forsaken" ? `the dark house of ${title}` : `the House of ${title}`;
      }
    } else {
      logEvent(world, `The ${name} no longer call their god ${old.title}; they name it ${title} now, for that is the hand they have seen.`, 2, {
        subjects: [name],
        at,
      });
      if (culture.temple !== null) {
        const t = world.monuments.get(culture.temple);
        if (t && t.kind === "temple") t.note = `the House of ${title}`;
      }
    }
  }

  temples(world, living);
  spreadRites(world, living);
  prophets(world, living);
  holyStrife(world, living);
}

// The devout raise a great house at their seat. It is a monument (stone
// remembers; strangers on it are a desecration) and a sim input: pilgrims
// bring wealth, and a people with a temple keeps faith longer in silence.
function temples(world: World, living: Map<string, Pop[]>): void {
  for (const [name, culture] of world.cultures) {
    if (culture.temple !== null) {
      const t = world.monuments.get(culture.temple);
      if (!t || t.kind !== "temple" || t.culture !== name) culture.temple = null; // fallen, or the ground was lost
      else continue;
    }
    if (!living.has(name) || !culture.creed || culture.creed.stance !== "devout") continue;
    if (culture.faith < C.FAITH_MONUMENT) continue;
    const seat = living.get(name)!.filter((p) => !p.target && p.tier >= 2).sort((a, b) => b.count - a.count)[0];
    if (!seat) continue;
    const i = idx(world, seat.x, seat.y);
    if (world.monuments.has(i)) continue;
    world.monuments.set(i, {
      kind: "temple",
      culture: name,
      note: `the House of ${culture.creed.title}`,
      year: world.year,
      desecrated: false,
    });
    culture.temple = i;
    logEvent(
      world,
      `In ${describeLocation(world, seat.x, seat.y)}, the ${name} raise a great house to ${culture.creed.title}; pilgrims come to it from every village of theirs.`,
      3,
      { subjects: [name], at: { x: seat.x, y: seat.y } },
    );
  }
}

// Rites travel along oaths: a devout people's sworn friends take up its god
function spreadRites(world: World, living: Map<string, Pop[]>): void {
  for (const [name, culture] of world.cultures) {
    if (!living.has(name) || !culture.creed || culture.creed.stance !== "devout") continue;
    const zeal = culture.temple !== null ? 2 : 1;
    for (const other of alliesOf(world, name)) {
      const target = world.cultures.get(other);
      if (!target || !living.has(other)) continue;
      if (target.creed && target.creed.stance !== "witness") continue; // they have their own god, or their own curse
      const last = world.conversionLog.get(other);
      if (last !== undefined && world.year - last < C.CREED_SPREAD_COOLDOWN) continue;
      if (world.rng() >= C.CREED_SPREAD_CHANCE * zeal) continue;
      world.conversionLog.set(other, world.year);
      target.regard[culture.creed.aspect] = Math.min(C.REGARD_CAP, target.regard[culture.creed.aspect] + C.CREED_SPREAD_REGARD);
      target.faith = Math.max(target.faith, C.CREED_MIN_FAITH);
      const seat = seatOf(world, other);
      logEvent(
        world,
        `The rites of ${culture.creed.title} pass from the ${polityName(culture)} to the ${polityName(target)}; the ${other} raise altars to the god their friends name.`,
        2,
        { subjects: [name, other], at: seat ? { x: seat.x, y: seat.y } : undefined },
      );
    }
  }
}

// Prophets: a people that knows its god raises a voice for it. The voice
// says what the god will do next. If the god does it, in their sight, the
// prophecy is fulfilled and faith leaps. If the years pass in silence, the
// prophet is shamed. Forsaken peoples raise dark prophets who foretell the
// sky's wrath; those the god leaves alone begin, slowly, to wonder.
function prophets(world: World, living: Map<string, Pop[]>): void {
  for (const f of world.figures) {
    if (!f.alive || f.role !== "prophet" || !f.prophecy || f.prophecy.fulfilled !== null) continue;
    if (world.year < f.prophecy.until) continue;
    const culture = world.cultures.get(f.culture);
    if (!culture || !living.has(f.culture)) continue;
    const dark = culture.creed?.stance === "forsaken";
    f.prophecy = null;
    f.spent = true;
    if (dark) {
      culture.faith = Math.min(4 * C.FAITH_MONUMENT, culture.faith + 1);
      logEvent(world, `The wrath ${f.name} foretold never came. Some among the ${f.culture} wonder if the sky has forgotten them, or forgiven them.`, 2, {
        subjects: [f.culture],
      });
    } else {
      culture.faith = Math.max(-2 * C.FAITH_MONUMENT, culture.faith - 1);
      if (world.rng() < 0.5) {
        f.alive = false;
        logEvent(world, `The years pass and the word of ${f.name} comes to nothing. They go into the wilderness, and the ${f.culture} do not look for them.`, 2, {
          subjects: [f.culture],
        });
      } else {
        logEvent(world, `The years pass and the word of ${f.name} comes to nothing; the ${f.culture} remember it against them.`, 2, {
          subjects: [f.culture],
        });
      }
    }
    noteFaith(world, culture);
  }

  for (const [name, culture] of world.cultures) {
    if (!living.has(name) || !culture.creed || culture.creed.stance === "witness") continue;
    const dark = culture.creed.stance === "forsaken";
    const standing = prophetOf(world, name);
    if (standing) {
      // A proven prophet may speak again, after a rest
      if (standing.prophecy || standing.spent || !standing.renowned) continue;
      if (world.rng() >= C.PROPHECY_AGAIN_CHANCE) continue;
      standing.prophecy = utter(world, culture, standing, dark);
      continue;
    }
    const lastRose = world.prophetLog.get(name);
    if (lastRose !== undefined && world.year - lastRose < C.PROPHET_COOLDOWN_YEARS) continue;
    if (world.rng() >= C.PROPHET_CHANCE * (culture.temple !== null ? 2 : 1)) continue;
    world.prophetLog.set(name, world.year);
    const prophet = mintFigure(world, name, "prophet");
    prophet.name = prophetName(world.rng, dark);
    prophet.prophecy = utter(world, culture, prophet, dark, true);
  }
}

function utter(world: World, culture: Culture, prophet: Figure, dark: boolean, rising = false): NonNullable<Figure["prophecy"]> {
  const creed = culture.creed!;
  // Dark prophets foretell only wrath; the devout mostly foretell the hand they know
  const aspect: Aspect = dark ? "wrath" : world.rng() < C.PROPHECY_OWN_ASPECT ? creed.aspect : ASPECTS[Math.floor(world.rng() * ASPECTS.length)];
  const years = C.PROPHECY_MIN_YEARS + Math.floor(world.rng() * C.PROPHECY_SPREAD_YEARS);
  const text = prophecyText(world.rng, aspect, creed.title, dark);
  const seat = seatOf(world, culture.name);
  logEvent(
    world,
    rising
      ? dark
        ? `${prophet.name} rises among the ${culture.name}, crying against ${creed.title}: "${text}"`
        : `${prophet.name} rises among the ${culture.name}, a prophet of ${creed.title}: "${text}"`
      : `${prophet.name} speaks again to the ${culture.name}: "${text}"`,
    3,
    { subjects: [culture.name], at: seat ? { x: seat.x, y: seat.y } : undefined },
  );
  return { aspect, text, until: world.year + years, fulfilled: null };
}

// Peoples who name the god differently do not keep the peace easily; the
// devout look on forsaken fires with loathing. Written into the grudge
// layer war already reads, so holy wars come out of the same machinery.
function holyStrife(world: World, living: Map<string, Pop[]>): void {
  const names = [...living.keys()].filter((n) => {
    const c = world.cultures.get(n);
    return c?.polity && c.creed && c.creed.stance !== "witness";
  });
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = world.cultures.get(names[i])!;
      const b = world.cultures.get(names[j])!;
      const ca = a.creed!;
      const cb = b.creed!;
      if (ca.stance === cb.stance && ca.aspect === cb.aspect) continue; // one god, one peace
      if (ca.stance === "forsaken" && cb.stance === "forsaken") continue; // the dark keeps its own counsel
      if (allied(world, a.name, b.name)) continue;
      const near = living.get(a.name)!.some((p) =>
        living.get(b.name)!.some((q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= C.HOLY_RANGE),
      );
      if (!near) continue;
      const crusade = ca.stance !== cb.stance; // devout against forsaken
      if (world.rng() >= (crusade ? C.HOLY_STRIFE_CHANCE * 2 : C.HOLY_STRIFE_CHANCE)) continue;
      const key = pairKey(a.name, b.name);
      world.grudges.set(key, Math.min(C.GRUDGE_CAP, (world.grudges.get(key) ?? 0) + C.HOLY_STRIFE_GRUDGE));
      const last = world.holyLog.get(key);
      if (last !== undefined && world.year - last < C.HOLY_LOG_YEARS) continue;
      const firstTime = last === undefined; // the first sermon is news; the rest is local color
      world.holyLog.set(key, world.year);
      const [devout, dark] = ca.stance === "forsaken" ? [b, a] : [a, b];
      logEvent(
        world,
        crusade
          ? `The ${polityName(devout)} look on the dark fires of the ${polityName(dark)} with loathing; the priests of ${devout.creed!.title} preach against them.`
          : `The ${polityName(a)} hold that the god is ${ca.title}; the ${polityName(b)} know it as ${cb.title}. On both sides the priests call the other blasphemers.`,
        firstTime ? 2 : 1,
        { subjects: [a.name, b.name] },
      );
    }
  }
}

// For the war declaration: what a devout attacker says it marches for
export function holyReason(world: World, attacker: string, target: string): string | null {
  const ca = creedOf(world, attacker);
  const cb = creedOf(world, target);
  if (!ca || ca.stance !== "devout") return null;
  if (cb?.stance === "forsaken") return `They march to put out the dark fires of the ${target}, in the name of ${ca.title}.`;
  if (cb && cb.stance !== "witness" && cb.aspect !== ca.aspect) return `They march in the name of ${ca.title}, against those who name the god falsely.`;
  return null;
}

// The world panel asks: how do the peoples know their god?
export function creedCensus(world: World): { title: string; souls: number; stance: string }[] {
  const souls = new Map<string, { souls: number; stance: string }>();
  for (const pop of world.pops) {
    const creed = world.cultures.get(pop.culture)?.creed;
    if (!creed) continue;
    const cur = souls.get(creed.title) ?? { souls: 0, stance: creed.stance };
    cur.souls += pop.count;
    souls.set(creed.title, cur);
  }
  return [...souls.entries()].map(([title, v]) => ({ title, ...v })).sort((a, b) => b.souls - a.souls);
}

// Leaders of the devout carry their god's name into the telling
export function creedPhrase(world: World, name: string): string {
  const c = creedOf(world, name);
  if (!c) return "";
  return c.stance === "forsaken" ? `who curse ${c.title}` : `who name their god ${c.title}`;
}

