import { ANOINT_RADIUS, BECALM_RADIUS, BLESS_RADIUS, CHANNEL_INTERVAL_MS, DREAM_RADIUS, EMBOLDEN_RADIUS, HEAL_RADIUS, METEOR_KILL_RADIUS, PROVOKE_RADIUS, REVEAL_RADIUS, SCULPT_RADIUS, SMITE_RADIUS, SIM_INTERVAL_MAX_MS, SIM_INTERVAL_MIN_MS, SIM_INTERVAL_MS, SOOTHE_RADIUS, STORM_RADIUS, TEMP_SHIFT_RADIUS, UNYOKE_RADIUS, VOLCANO_FIRE_RADIUS } from "./constants";
import { kindPhrase, unleashBeast } from "./beasts";
import { meteor, volcano } from "./disasters";
import { RACE_KEYS } from "./races";
import { addRipple, BEAST_GLYPHS, render, renderThumbnail, view, type Overlay, type RenderMode } from "./render";
import { alliesOf, DEED_PHRASES, memoriesOf, polityName, rememberedWeight } from "./nations";
import { atWar } from "./war";
import { creedCensus, prophetOf } from "./faith";
import { anoint, becalm, blessFertility, callStorm, dream, embolden, enrich, healPestilence, provoke, reveal, sculptLand, shiftTemperature, smite, soothe, tick, unyoke } from "./sim";
import { GOOD_PHRASE, prosperityWord } from "./economy";
import { GOODS } from "./world";
import { RESOURCE_NAMES, SEASONS, TIER_NAMES, WORLD_FLAVORS, biomeAt, createWorld, cultureOf, describeLocation, globalDrift, heroOf, idx, isWater, leaderOf, raceOf, settleHydrology, tierOf, wakePeople, type FlavorKey, type Pop, type World } from "./world";
import { SEA_LEVEL } from "./constants";

// A pinned URL (?seed=N) boots straight into that world; otherwise the genesis
// screen offers worlds to choose from. &quiet=1 keeps the peoples asleep so
// the god may wake them by hand.
let world: World;

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const entriesEl = document.getElementById("entries")!;
const dateEl = document.getElementById("date")!;
const inspectEl = document.getElementById("inspect")!;
const nationsEl = document.getElementById("nations")!;
const warsEl = document.getElementById("wars")!;
const figuresEl = document.getElementById("figures")!;
const worldEl = document.getElementById("world")!;
const followNote = document.getElementById("follow-note")!;

// --- Time: fixed-cadence sim steps, decoupled from rendering. ---
// Every intervalMs the sim advances `batch` seasons; rAF only draws.
let batch = 1; // ticks per sim step: 0 pause, 1 season, 4 year, 40 decade
let intervalMs = SIM_INTERVAL_MS; // pace slider adjusts this at runtime
let simClock = 0;
let lastFrame = performance.now();
let dirty = true;
let flushedEvents = 0;

// The chronicle records everything; the panel filters to match your altitude.
// Watching seasons shows all, years hide local color, decades show only the big beats.
// Following a culture shows that people's full story instead, at any speed.
let displayThreshold = 1;
let followedCulture: string | null = null;
let flashLoc: { x: number; y: number } | null = null;
const MAX_PANEL_ENTRIES = 400;

function thresholdFor(b: number): number {
  return b >= 40 ? 3 : b >= 4 ? 2 : 1;
}

function entryVisible(e: (typeof world.events)[number]): boolean {
  if (followedCulture) return e.subjects?.includes(followedCulture) ?? false;
  return e.importance >= displayThreshold;
}

type Verb =
  | "observe"
  | "bless"
  | "warm"
  | "cool"
  | "heal"
  | "smite"
  | "raise"
  | "carve"
  | "volcano"
  | "meteor"
  | "wake"
  | "unleash"
  | "soothe"
  | "provoke"
  | "anoint"
  | "dream"
  | "storm"
  | "reveal"
  | "becalm"
  | "unyoke"
  | "embolden"
  | "enrich";
let verb: Verb = "observe";
let overlay: Overlay = "terrain";
let mode: RenderMode = "ascii";

function frame(now: number): void {
  simClock += now - lastFrame;
  lastFrame = now;

  if (batch > 0) {
    // Catch up on missed steps, but never stall the frame
    let steps = Math.floor(simClock / intervalMs);
    simClock -= steps * intervalMs;
    steps = Math.min(steps, 3);
    for (let s = 0; s < steps; s++) {
      for (let t = 0; t < batch; t++) tick(world);
      dirty = true;
    }
  } else {
    simClock = 0;
  }

  if (dirty) {
    const animating = render(world, canvas, ctx, overlay, mode, followedCulture, flashLoc);
    flushChronicle();
    updateInspect();
    renderActivePanel();
    dateEl.textContent = `Year ${world.year}, ${SEASONS[world.season]} · ${world.age}`;
    dirty = animating; // keep drawing while a divine ripple plays out
  }
  requestAnimationFrame(frame);
}

function entryDiv(e: (typeof world.events)[number]): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "entry";
  const when = document.createElement("div");
  when.className = "when";
  when.textContent = `Year ${e.year}, ${SEASONS[e.season]}`;
  const text = document.createElement("div");
  text.textContent = e.text;
  div.append(when, text);
  // Who is this about? Colored chips name each subject's race, so "the
  // Theviiathu" reads as a people, not a mystery
  if (e.subjects?.length) {
    const tags = document.createElement("div");
    tags.className = "tags";
    for (const s of e.subjects) {
      const c = world.cultures.get(s);
      if (!c) continue;
      const tag = document.createElement("span");
      tag.className = "tag";
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = c.color;
      tag.append(dot, `${s} · ${c.race}`);
      tag.title = `open the ${s} in the nations panel`;
      tag.addEventListener("click", () => openDossier(s));
      tags.append(tag);
    }
    if (tags.childElementCount) div.append(tags);
  }
  if (e.at) {
    // Hovering an entry pinpoints where it happened on the map
    const at = e.at;
    div.classList.add("placed");
    div.addEventListener("mouseenter", () => {
      flashLoc = at;
      dirty = true;
    });
    div.addEventListener("mouseleave", () => {
      flashLoc = null;
      dirty = true;
    });
  }
  return div;
}

function trimPanel(): void {
  while (entriesEl.childElementCount > MAX_PANEL_ENTRIES) entriesEl.firstElementChild!.remove();
}

function flushChronicle(): void {
  if (flushedEvents === world.events.length) return;
  const nearBottom =
    entriesEl.scrollTop + entriesEl.clientHeight >= entriesEl.scrollHeight - 40;
  for (; flushedEvents < world.events.length; flushedEvents++) {
    const e = world.events[flushedEvents];
    if (entryVisible(e)) entriesEl.append(entryDiv(e));
  }
  trimPanel();
  if (nearBottom) entriesEl.scrollTop = entriesEl.scrollHeight;
}

function rebuildChronicle(): void {
  entriesEl.replaceChildren();
  for (const e of world.events) {
    if (entryVisible(e)) entriesEl.append(entryDiv(e));
  }
  trimPanel();
  flushedEvents = world.events.length;
  entriesEl.scrollTop = entriesEl.scrollHeight;
  followNote.hidden = !followedCulture;
  followNote.textContent = followedCulture
    ? `following the ${followedCulture} · click open land to let go`
    : "";
}

// --- Sidebar panels: the chronicle, and the ledgers behind it ---
const TABS = ["chronicle", "nations", "wars", "figures", "world"] as const;
type Tab = (typeof TABS)[number];
let activeTab: Tab = "chronicle";
let dossier: string | null = null; // the culture whose page is open, if any

function renderActivePanel(): void {
  if (activeTab === "nations") renderNations();
  else if (activeTab === "wars") renderWars();
  else if (activeTab === "figures") renderFigures();
  else if (activeTab === "world") renderWorldPanel();
}

function setTab(tab: Tab): void {
  activeTab = tab;
  for (const t of TABS) document.getElementById(`tab-${t}`)!.classList.toggle("active", t === tab);
  entriesEl.hidden = tab !== "chronicle";
  followNote.hidden = tab !== "chronicle" || !followedCulture;
  nationsEl.hidden = tab !== "nations";
  warsEl.hidden = tab !== "wars";
  figuresEl.hidden = tab !== "figures";
  worldEl.hidden = tab !== "world";
  if (tab === "chronicle") entriesEl.scrollTop = entriesEl.scrollHeight;
  renderActivePanel();
}
for (const t of TABS) document.getElementById(`tab-${t}`)!.addEventListener("click", () => setTab(t));

function grudgeLabel(g: number): string {
  return g >= 6 ? "undying hatred" : g >= 3 ? "vendetta" : g >= 1.5 ? "hatred" : "old rancor";
}

// Every name is a door: click any people, anywhere, and their page opens
function openDossier(name: string): void {
  dossier = name;
  setTab("nations");
}

function cultureLink(name: string, label?: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "clink";
  span.textContent = label ?? name;
  span.addEventListener("click", () => openDossier(name));
  return span;
}

// A fact line mixing plain text and clickable people
function factLine(cls: string, ...parts: (string | Node)[]): HTMLDivElement {
  const div = document.createElement("div");
  div.className = cls;
  div.append(...parts);
  return div;
}

function dotFor(color: string): HTMLSpanElement {
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = color;
  return dot;
}

function line(cls: string, text: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = cls;
  div.textContent = text;
  return div;
}

function renderNations(): void {
  if (!world) return; // the genesis screen has no peoples to list yet
  const souls = new Map<string, number>();
  const settlements = new Map<string, number>();
  for (const pop of world.pops) {
    souls.set(pop.culture, (souls.get(pop.culture) ?? 0) + pop.count);
    settlements.set(pop.culture, (settlements.get(pop.culture) ?? 0) + 1);
  }
  // Extinct peoples keep their pages — their memories are lore, not garbage
  if (dossier && world.cultures.has(dossier)) {
    renderDossier(dossier, souls, settlements);
    return;
  }
  dossier = null;
  const living = [...souls.keys()]
    .map((n) => world.cultures.get(n)!)
    .sort((a, b) => (souls.get(b.name) ?? 0) - (souls.get(a.name) ?? 0));
  const frag = document.createDocumentFragment();
  for (const listed of [true, false]) {
    const group = living.filter((c) => (c.polity !== null) === listed);
    if (!group.length) continue;
    frag.append(line("shead", listed ? "nations" : "peoples"));
    for (const c of group) {
      const row = document.createElement("div");
      row.className = listed ? "nrow" : "nrow minor";
      const name = document.createElement("span");
      name.className = "nname";
      name.textContent = polityName(c);
      const meta = document.createElement("span");
      meta.className = "nmeta";
      meta.textContent = `${c.race} · ${(souls.get(c.name) ?? 0).toLocaleString("en-US")}`;
      row.append(dotFor(c.color), name, meta);
      row.addEventListener("click", () => {
        dossier = c.name;
        renderNations();
      });
      frag.append(row);
    }
  }
  nationsEl.replaceChildren(frag);
}

function renderDossier(name: string, souls: Map<string, number>, settlements: Map<string, number>): void {
  const culture = world.cultures.get(name)!;
  const frag = document.createDocumentFragment();
  const back = document.createElement("button");
  back.className = "back";
  back.textContent = "← all peoples";
  back.addEventListener("click", () => {
    dossier = null;
    renderNations();
  });
  frag.append(back);

  const h = document.createElement("h3");
  h.append(dotFor(culture.color), polityName(culture));
  frag.append(h);
  frag.append(
    line(
      "sub",
      culture.polity
        ? `a nation of ${culture.race} · proclaimed in year ${culture.polity.founded}`
        : `a people of ${culture.race} · not yet a nation`,
    ),
  );

  const alive = (souls.get(name) ?? 0) > 0;
  if (!alive) {
    frag.append(line("sub", "they have passed into memory"));
  } else {
    let held = 0;
    for (let i = 0; i < world.territory.length; i++) if (world.territory[i] === culture.id) held++;
    const wealth = world.wealth.get(name) ?? 0;
    frag.append(
      line(
        "fact",
        `${(souls.get(name) ?? 0).toLocaleString("en-US")} souls · ${settlements.get(name) ?? 0} settlements · ${held} cells of dominion · wealth ${wealth}`,
      ),
    );
  }

  const leader = leaderOf(world, name);
  const hero = heroOf(world, name);
  if (leader || hero) {
    const parts = [];
    if (leader) parts.push(leader.nature === "demon" ? `ruled by ${leader.name}, a demon on the throne` : `led by ${leader.name} (${leader.temperament})`);
    if (hero) parts.push(hero.nature === "angel" ? `guardian: ${hero.name}, an angel` : `champion: ${hero.name}`);
    frag.append(line("fact", parts.join(" · ")));
  }
  let lostPlaces = 0;
  for (const ruin of world.ruins.values()) if (ruin.culture === name) lostPlaces++;
  if (lostPlaces) {
    frag.append(line("fact", `${lostPlaces} ruined ${lostPlaces === 1 ? "settlement" : "settlements"} of their people lie abandoned`));
  }

  const temper = [];
  if (culture.faith >= 3) temper.push("a devout people");
  else if (culture.faith <= -3) temper.push("a people forsaken of their god");
  else if (culture.grit >= 3) temper.push("a stoic people");
  if (culture.want) {
    temper.push(
      culture.want === "conquest" && culture.wantTarget
        ? `${WANT_PHRASES.conquest} the ${culture.wantTarget}`
        : WANT_PHRASES[culture.want],
    );
  }
  if (temper.length) frag.append(line("fact", temper.join(" · ")));

  // How they know their god: the name, the house, the voice
  frag.append(line("shead", "their god"));
  if (culture.creed) {
    const c = culture.creed;
    frag.append(
      line(
        "fact",
        c.stance === "forsaken"
          ? `they curse ${c.title} · since year ${c.since} · their fires burn to darker powers`
          : c.stance === "witness"
            ? `they have seen ${c.title} at work, and wait to see whose side it is on · since year ${c.since}`
            : `they name their god ${c.title} · since year ${c.since}`,
      ),
    );
    const temple = culture.temple !== null ? world.monuments.get(culture.temple) : undefined;
    if (temple) frag.append(line("fact", `${temple.note} stands at their seat · raised year ${temple.year}`));
    const prophet = prophetOf(world, name);
    if (prophet) {
      frag.append(
        line(
          "memory",
          prophet.prophecy
            ? prophet.prophecy.fulfilled !== null
              ? `${prophet.name} spoke true in year ${prophet.prophecy.fulfilled}`
              : `${prophet.name} foretells: "${prophet.prophecy.text}" · by year ${prophet.prophecy.until}`
            : prophet.spent
              ? `${prophet.name}, whose word came to nothing`
              : `${prophet.name}, a proven voice, waits to speak again`,
        ),
      );
    }
  } else {
    const seen = Object.entries(culture.regard).sort((a, b) => b[1] - a[1])[0];
    frag.append(
      line(
        "none",
        seen && seen[1] >= 1
          ? `no name yet · they have seen a hand of ${seen[0]} at work, and wonder`
          : culture.grit >= 3
            ? "none · they expect nothing of the sky"
            : "none · the sky has not shown them a face",
      ),
    );
  }

  // The larder and the ledger: what they make, what is dear, where the wagons go
  if (alive) {
    frag.append(line("shead", "trade"));
    const e = culture.economy;
    const goods = GOODS.filter((g) => g !== "grain" && e.need[g] > 0)
      .map((g) => `${GOOD_PHRASE[g]} ×${e.sat[g].toFixed(1)}${e.sat[g] < 0.5 ? " (dear)" : e.sat[g] >= 1.25 ? " (plenty)" : ""}`)
      .join(" · ");
    frag.append(line("fact", `${prosperityWord(e)} · treasury ${Math.round(e.treasury)}${e.granaries ? ` · ${e.granaries} ${e.granaries === 1 ? "granary" : "granaries"}` : ""}${e.market !== null ? " · a market town" : ""}`));
    if (goods) frag.append(line("fact", goods));
    const routes = world.routes.filter((r) => r.a === name || r.b === name);
    if (routes.length) {
      for (const r of routes) {
        const other = r.a === name ? r.b : r.a;
        frag.append(factLine("memory", r.a === name ? `wagons of ${GOOD_PHRASE[r.good]} to the ` : `wagons of ${GOOD_PHRASE[r.good]} from the `, cultureLink(other), ` · since year ${r.since}`));
      }
    } else {
      frag.append(line("none", "no wagons · they trade with no one"));
    }
  }

  // Every section always shows, so a curious player learns what CAN be here.
  // An empty ledger is information too. One row per people, one stance word:
  // war outranks oath, oath outranks hatred, hatred outranks a cold peace.
  frag.append(line("shead", "standing"));
  const standings = new Map<string, { rank: number; label: string }>();
  const consider = (other: string, rank: number, label: string): void => {
    if (other === name || !world.cultures.has(other)) return;
    if ((souls.get(other) ?? 0) <= 0) return; // the dead keep no standing, only memories
    const cur = standings.get(other);
    if (!cur || rank > cur.rank) standings.set(other, { rank, label });
  };
  for (const war of world.wars.values()) {
    const side = war.attackers.includes(name) ? war.attackers : war.defenders.includes(name) ? war.defenders : null;
    if (!side) continue;
    for (const foe of side === war.attackers ? war.defenders : war.attackers) {
      consider(foe, 6, `open war · since year ${war.since}`);
    }
  }
  for (const other of alliesOf(world, name)) consider(other, 5, "sworn allies");
  for (const [key, g] of world.grudges) {
    const [a, b] = key.split("|");
    const other = a === name ? b : b === name ? a : null;
    if (other && g >= 1) consider(other, 3 + Math.min(1.9, g / 5), grudgeLabel(g));
  }
  for (const [key, until] of world.truces) {
    const [a, b] = key.split("|");
    const other = a === name ? b : b === name ? a : null;
    if (other && until > world.year) consider(other, 2, `uneasy truce · until year ${until}`);
  }
  for (const key of world.deeds.keys()) {
    const [a, b] = key.split("|");
    const other = a === name ? b : b === name ? a : null;
    if (!other || atWar(world, name, other)) continue;
    if (rememberedWeight(world, name, other) >= 0.75) consider(other, 1, "a cold peace · old wounds unhealed");
  }
  if (standings.size) {
    const ranked = [...standings.entries()].sort((a, b) => b[1].rank - a[1].rank).slice(0, 10);
    for (const [other, s] of ranked) frag.append(factLine("fact", "the ", cultureLink(other), ` · ${s.label}`));
  } else {
    frag.append(line("none", "none · they stand alone, at peace with all"));
  }

  frag.append(line("shead", "what is remembered"));
  const memories = memoriesOf(world, name).slice(0, 7);
  if (memories.length) {
    for (const { deed } of memories) {
      const settled = deed.avenged !== undefined ? ` · avenged in year ${deed.avenged}` : "";
      frag.append(
        deed.to === name
          ? factLine("memory", `they remember ${DEED_PHRASES[deed.kind]} of year ${deed.year}, by the `, cultureLink(deed.by), settled)
          : factLine("memory", `done in their name: ${DEED_PHRASES[deed.kind]} of year ${deed.year}, upon the `, cultureLink(deed.to), settled),
      );
    }
  } else {
    frag.append(line("none", "nothing · their ledger is clean"));
  }

  frag.append(line("shead", "treasures"));
  const held = world.artifacts.filter((a) => a.holder === name);
  if (held.length) {
    for (const art of held) {
      frag.append(
        art.maker !== name
          ? factLine("memory", `${art.name} · made by the `, cultureLink(art.maker), " · held, not owned")
          : line("memory", `${art.name} · made year ${art.made}`),
      );
      for (const p of art.provenance.slice(-3)) frag.append(line("none", `year ${p.year}: ${p.note}`));
    }
  } else {
    frag.append(line("none", "none · no named thing rests in their halls"));
  }
  // What was theirs and is elsewhere — grievances and losses, visible
  for (const art of world.artifacts) {
    if (art.maker !== name) continue;
    if (art.holder && art.holder !== name) {
      frag.append(factLine("memory", `in strangers' hands: ${art.name}, held by the `, cultureLink(art.holder)));
    } else if (!art.holder) {
      frag.append(line("none", `lost to the world: ${art.name}`));
    }
  }

  const follow = document.createElement("button");
  follow.className = "follow-btn";
  follow.textContent = followedCulture === name ? "following their story · let go" : "follow their story";
  follow.addEventListener("click", () => {
    followedCulture = followedCulture === name ? null : name;
    rebuildChronicle();
    if (followedCulture) setTab("chronicle");
    dirty = true;
  });
  frag.append(follow);

  nationsEl.replaceChildren(frag);
}

// --- Wars panel: every banner raised, every host afield ---
function renderWars(): void {
  if (!world) return;
  const frag = document.createDocumentFragment();
  if (!world.wars.size) {
    frag.append(line("shead", "wars"));
    frag.append(line("none", "the world is at peace — no banners raised, no hosts afield"));
  }
  const sideParts = (names: string[]): (string | Node)[] => {
    const out: (string | Node)[] = [];
    names.forEach((n, i) => {
      if (i) out.push(" and the ");
      const c = world.cultures.get(n);
      out.push(cultureLink(n, c ? polityName(c) : n));
    });
    return out;
  };
  for (const [key, war] of world.wars) {
    frag.append(line("shead", `${war.name} · since year ${war.since}`));
    const title = document.createElement("h3");
    title.append("the ", ...sideParts(war.attackers), " against the ", ...sideParts(war.defenders));
    frag.append(title);
    if (war.battles > 0) {
      frag.append(line("fact", `${war.battles} battles · ${war.conquests} places taken · ${war.fallen.toLocaleString("en-US")} fallen`));
    }
    const hosts = world.armies.filter((a) => a.war === key);
    if (hosts.length) {
      for (const army of hosts) {
        frag.append(
          factLine(
            "fact",
            dotFor(world.cultures.get(army.culture)?.color ?? "#fff"),
            "host of the ",
            cultureLink(army.culture),
            ` — ${army.count.toLocaleString("en-US")} spears`,
          ),
        );
      }
    } else {
      frag.append(line("none", "the banners are raised, but no host is yet afield"));
    }
  }
  // Old storms, remembered
  if (world.pastWars.length) {
    frag.append(line("shead", "wars past"));
    for (const w of [...world.pastWars].reverse().slice(0, 8)) {
      frag.append(
        factLine(
          "fact",
          `${w.name} (${w.since}–${w.ended}): the `,
          cultureLink(w.attackers[0]),
          " against the ",
          cultureLink(w.defenders[0]),
          ` · ${w.fallen.toLocaleString("en-US")} fallen`,
        ),
      );
    }
  }
  warsEl.replaceChildren(frag);
}

// --- Figures panel: the living names history is currently written by.
// Click a name and their page opens: who they are and whom they have slain.
let figurePage: number | null = null;

function renderFigures(): void {
  if (!world) return;
  if (figurePage !== null) {
    const f = world.figures.find((x) => x.id === figurePage);
    if (f) {
      renderFigurePage(f);
      return;
    }
    figurePage = null;
  }
  const souls = new Map<string, number>();
  for (const pop of world.pops) souls.set(pop.culture, (souls.get(pop.culture) ?? 0) + pop.count);
  const frag = document.createDocumentFragment();
  const cultures = [...souls.keys()].sort((a, b) => (souls.get(b) ?? 0) - (souls.get(a) ?? 0));
  let any = false;
  for (const name of cultures) {
    const figures = world.figures.filter((f) => f.alive && f.culture === name);
    if (!figures.length) continue;
    any = true;
    const culture = world.cultures.get(name)!;
    const row = document.createElement("div");
    row.className = "nrow";
    const nm = document.createElement("span");
    nm.className = "nname";
    nm.textContent = polityName(culture);
    row.append(dotFor(culture.color), nm);
    row.addEventListener("click", () => openDossier(name));
    frag.append(row);
    for (const f of figures) {
      const fl = factLine(
        "fact",
        `${f.nature === "demon" ? "&" : f.nature === "angel" ? "✧" : f.role === "leader" ? "♔" : f.role === "prophet" ? "☼" : "⚔"} `,
        (() => {
          const s = document.createElement("span");
          s.className = "clink";
          s.textContent = f.name;
          s.addEventListener("click", () => {
            figurePage = f.id;
            renderFigures();
          });
          return s;
        })(),
        ` · ${f.nature === "demon" ? "a demon on the throne" : f.nature === "angel" ? "a guardian angel" : f.role === "leader" ? f.temperament : f.role === "prophet" ? (f.prophecy?.fulfilled !== null && f.prophecy ? "prophet, proven" : f.spent ? "prophet, shamed" : "prophet") : "champion"} · ${f.nature === "mortal" ? `${world.year - f.born} years` : "ageless"}${f.kills.length ? ` · ${f.kills.length} famed kills` : ""}`,
      );
      frag.append(fl);
    }
  }
  if (!any) {
    frag.append(line("shead", "figures"));
    frag.append(line("none", "no names yet — history has not chosen its actors"));
  }
  // The beasts abroad, and the beasts of legend
  const abroad = world.beasts.filter((b) => b.alive);
  frag.append(line("shead", "beasts abroad"));
  if (abroad.length) {
    for (const b of abroad) {
      frag.append(
        line(
          "memory",
          b.kind === "forgotten"
            ? `? ${b.name} — ${b.desc} · ${b.kills.toLocaleString("en-US")} souls taken`
            : b.kind === "demon"
              ? `& ${b.name} — ${b.desc}${b.throne ? ` · on the throne of the ${b.throne} since year ${b.enthroned}` : " · abroad, looking for a throne"}`
              : `${BEAST_GLYPHS[b.kind]?.ch ?? "?"} ${kindPhrase(b)} · abroad since year ${b.born} · ${b.kills.toLocaleString("en-US")} souls taken${b.hostage ? ` · holds ${b.hostage.name} of the ${b.hostage.culture}` : ""}${b.hoard !== null ? ` · keeps ${world.artifacts.find((a) => a.id === b.hoard)?.name ?? "a treasure"} in its lair` : ""}`,
        ),
      );
    }
  } else {
    frag.append(line("none", "none · the wilds are quiet, for now"));
  }
  const legends = world.beasts.filter((b) => !b.alive && b.kills >= 300);
  if (legends.length) {
    frag.append(line("shead", "beasts of legend"));
    for (const b of legends) {
      frag.append(line("none", `${b.name}, ${b.kind} · ${b.born}–? · ${b.kills.toLocaleString("en-US")} souls taken before the end`));
    }
  }
  figuresEl.replaceChildren(frag);
}

function renderFigurePage(f: import("./world").Figure): void {
  const frag = document.createDocumentFragment();
  const back = document.createElement("button");
  back.className = "back";
  back.textContent = "← all figures";
  back.addEventListener("click", () => {
    figurePage = null;
    renderFigures();
  });
  frag.append(back);
  const culture = world.cultures.get(f.culture);
  const h = document.createElement("h3");
  h.append(dotFor(culture?.color ?? "#fff"), `${f.nature === "demon" ? "& " : f.nature === "angel" ? "✧ " : f.role === "leader" ? "♔ " : f.role === "prophet" ? "☼ " : "⚔ "}${f.name}`);
  frag.append(h);
  frag.append(
    factLine(
      "sub",
      `${f.nature === "demon" ? "sits the throne of" : f.nature === "angel" ? "stands guardian over" : f.role === "leader" ? "leads" : f.role === "prophet" ? "prophet of" : "champion of"} the `,
      cultureLink(f.culture),
      ` · ${f.nature === "demon" ? "a prince of the powers beneath" : f.nature === "angel" ? "a light come down" : f.temperament} · ${f.alive ? (f.nature === "mortal" ? `${world.year - f.born} years old` : "ageless") : "dead"}`,
    ),
  );
  if (f.parent !== null) {
    const forebear = world.figures.find((x) => x.id === f.parent);
    if (forebear) frag.append(line("sub", `of the line of ${forebear.name}`));
  }
  if (f.birthCulture && f.birthCulture !== f.culture) {
    frag.append(factLine("sub", "born of the ", cultureLink(f.birthCulture), ", taken in childhood"));
  }
  if (f.ambition) {
    const dreams: Record<string, string> = {
      conquest: "dreams of banners taken and lands won",
      dynasty: "dreams of a line that will outlast the stones",
      renown: "dreams of a name that will be sung",
      immortality: "dreams of never dying",
    };
    frag.append(line("memory", dreams[f.ambition]));
  }
  if (f.role === "prophet") {
    frag.append(line("shead", "their word"));
    if (f.prophecy) {
      frag.append(line("memory", `"${f.prophecy.text}"`));
      frag.append(
        line(
          f.prophecy.fulfilled !== null ? "fact" : "none",
          f.prophecy.fulfilled !== null ? `fulfilled in year ${f.prophecy.fulfilled}` : `unproven · the years run until ${f.prophecy.until}`,
        ),
      );
    } else if (f.spent) {
      frag.append(line("none", "their word came to nothing, and they speak no more"));
    } else {
      frag.append(line("none", "a proven voice, silent for now"));
    }
  }
  frag.append(line("shead", "famed kills"));
  if (f.kills.length) {
    for (const k of f.kills) frag.append(line("memory", `year ${k.year}: slew ${k.what}`));
  } else {
    frag.append(line("none", "none yet · their legend is unwritten"));
  }
  figuresEl.replaceChildren(frag);
}

// --- World panel: the Gaia window. Planetary vital signs, never a demand ---
// --- Strip graphs: the world's vital signs over the whole run of years,
// with the chronicle's big beats pinned beneath them. The graphs SimEarth
// had, given the narrative memory it lacked. ---
const STRIP_W = 300;
const STRIP_H = 40;

function stripX(year: number): number {
  const hist = world.history;
  const y0 = hist[0].year;
  const y1 = hist[hist.length - 1].year;
  return ((year - y0) / Math.max(1, y1 - y0)) * (STRIP_W - 2) + 1;
}

function stripGraph(
  title: string,
  value: (h: World["history"][number]) => number,
  fmt: (v: number) => string,
  zeroLine = false,
): HTMLDivElement {
  const hist = world.history;
  const wrap = document.createElement("div");
  wrap.className = "strip";
  const head = document.createElement("div");
  head.className = "striphead";
  const t = document.createElement("span");
  t.textContent = title;
  const val = document.createElement("span");
  val.className = "val";
  val.textContent = fmt(value(hist[hist.length - 1]));
  head.append(t, val);
  const cv = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  cv.width = STRIP_W * dpr;
  cv.height = STRIP_H * dpr;
  cv.style.width = `${STRIP_W}px`;
  cv.style.height = `${STRIP_H}px`;
  const g = cv.getContext("2d")!;
  g.scale(dpr, dpr);
  let lo = Infinity;
  let hi = -Infinity;
  for (const h of hist) {
    const v = value(h);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (zeroLine) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (hi - lo < 1e-9) hi = lo + 1;
  const py = (v: number) => STRIP_H - 3 - ((v - lo) / (hi - lo)) * (STRIP_H - 6);
  if (zeroLine) {
    g.strokeStyle = "#2a2f3d";
    g.beginPath();
    g.moveTo(0, py(0));
    g.lineTo(STRIP_W, py(0));
    g.stroke();
  }
  g.strokeStyle = "#8b95a8";
  g.lineWidth = 1.2;
  g.beginPath();
  hist.forEach((h, i) => {
    const x = stripX(h.year);
    const y = py(value(h));
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.stroke();
  wrap.append(head, cv);
  return wrap;
}

// The epochal beats of the chronicle — ages turning, wars beginning and
// ending, nations proclaimed, peoples passing — pinned beneath the strips
// they share an axis with. Rest the cursor on a dot to read what the year
// held. Ordinary importance-3 events are too common to pin: a long history
// would smear them into a solid bar.
function stripPins(): HTMLDivElement {
  const pins = document.createElement("div");
  pins.className = "pins";
  const y0 = world.history[0].year;
  const buckets = new Map<number, string[]>();
  for (const e of world.events) {
    if (!e.epochal || e.year < y0) continue;
    const x = Math.round(stripX(e.year) / 4) * 4;
    const list = buckets.get(x);
    if (list) list.push(`y${e.year}: ${e.text}`);
    else buckets.set(x, [`y${e.year}: ${e.text}`]);
  }
  for (const [x, texts] of buckets) {
    const pin = document.createElement("span");
    pin.className = "pin";
    pin.style.left = `${x}px`;
    pin.title = texts.length > 5 ? `${texts.slice(0, 5).join("\n")}\n…and ${texts.length - 5} more` : texts.join("\n");
    pins.append(pin);
  }
  return pins;
}

function renderWorldPanel(): void {
  if (!world) return;
  const frag = document.createDocumentFragment();

  frag.append(line("shead", "the age"));
  frag.append(line("fact", `${world.age} · since year ${world.ageSince}`));
  frag.append(line("fact", `world ${WORLD_FLAVORS[world.flavor].name} · year ${world.year}`));

  frag.append(line("shead", "the sky"));
  const drift = globalDrift(world);
  const climate = drift > 1 ? "a warm age" : drift < -1 ? "a cold age" : "a temperate span";
  frag.append(line("fact", `${climate} · global drift ${drift >= 0 ? "+" : ""}${drift.toFixed(1)}°C`));
  if (world.ashVeil > 0.05) {
    frag.append(line("memory", `ash veils the sun: ${world.ashVeil.toFixed(1)}°C of darkness, fading`));
  }

  frag.append(line("shead", "the living"));
  const byRace = new Map<string, number>();
  let souls = 0;
  for (const pop of world.pops) {
    const race = raceOf(world, pop.culture).name;
    byRace.set(race, (byRace.get(race) ?? 0) + pop.count);
    souls += pop.count;
  }
  frag.append(line("fact", `${souls.toLocaleString("en-US")} souls in the world`));
  for (const [race, n] of [...byRace.entries()].sort((a, b) => b[1] - a[1])) {
    frag.append(line("fact", `${race} · ${n.toLocaleString("en-US")}`));
  }

  // How the peoples know their god: the names they use, weighed in souls
  frag.append(line("shead", "the god"));
  const census = creedCensus(world);
  let named = 0;
  for (const c of census) named += c.souls;
  const unnamed = souls - named;
  if (census.length) {
    for (const c of census.slice(0, 5)) {
      frag.append(
        line(
          c.stance === "forsaken" ? "memory" : "fact",
          c.stance === "forsaken"
            ? `${c.souls.toLocaleString("en-US")} souls curse you as ${c.title}`
            : c.stance === "witness"
              ? `${c.souls.toLocaleString("en-US")} souls have seen ${c.title} and wait`
              : `to ${c.souls.toLocaleString("en-US")} souls you are ${c.title}`,
        ),
      );
    }
    if (unnamed > 0) frag.append(line("none", `${unnamed.toLocaleString("en-US")} souls have no name for you`));
  } else {
    frag.append(line("none", "no people has a name for you yet · they name what they see"));
  }
  const temples = [...world.monuments.values()].filter((m) => m.kind === "temple").length;
  const prophets = world.figures.filter((f) => f.alive && f.role === "prophet").length;
  if (temples || prophets) frag.append(line("fact", `${temples} great houses raised · ${prophets} prophets speaking`));

  frag.append(line("shead", "the wagons"));
  frag.append(line("fact", `${world.routes.length} wagon roads open · ${world.markets.size} market ${world.markets.size === 1 ? "town" : "towns"}`));
  const richest = [...world.wealth.entries()].filter(([n]) => world.cultures.get(n)?.polity).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (richest.length) frag.append(line("fact", `richest: ${richest.map(([n, w]) => `${n} (${w})`).join(" · ")}`));

  frag.append(line("shead", "the powers"));
  const living = new Set(world.pops.map((p) => p.culture));
  let nations = 0;
  for (const name of living) if (world.cultures.get(name)?.polity) nations++;
  frag.append(line("fact", `${living.size} living peoples · ${nations} nations`));
  frag.append(line("fact", `${world.alliances.size} sworn bonds · ${world.wars.size} wars burning · ${world.armies.length} hosts afield`));
  const beastsAbroad = world.beasts.filter((b) => b.alive && b.kind !== "demon").length;
  if (beastsAbroad) frag.append(line("memory", `${beastsAbroad} beasts abroad in the wilds`));
  const thrones = world.beasts.filter((b) => b.alive && b.kind === "demon" && b.throne);
  const demonsAbroad = world.beasts.filter((b) => b.alive && b.kind === "demon" && !b.throne).length;
  const guardians = world.figures.filter((f) => f.alive && f.nature === "angel").length;
  if (thrones.length) frag.append(line("memory", `${thrones.length === 1 ? "a demon sits" : `${thrones.length} demons sit`} on the throne of the ${thrones.map((t) => t.throne).join(", the ")}`));
  if (demonsAbroad) frag.append(line("memory", `${demonsAbroad === 1 ? "a demon walks" : `${demonsAbroad} demons walk`} toward the towns`));
  if (guardians) frag.append(line("fact", `${guardians} ${guardians === 1 ? "guardian stands" : "guardians stand"} over the devout`));

  frag.append(line("shead", "the land"));
  let land = 0;
  let claimed = 0;
  let burning = 0;
  for (let i = 0; i < world.territory.length; i++) {
    if (world.fire[i] > 0) burning++;
    if (world.elevation[i] < SEA_LEVEL || world.lakes[i]) continue;
    land++;
    if (world.territory[i]) claimed++;
  }
  frag.append(line("fact", `${((claimed / Math.max(1, land)) * 100).toFixed(0)}% of the land under dominion`));
  frag.append(line("fact", `${world.ruins.size} ruins standing · ${world.islesBorn} islands risen from the sea`));
  if (burning > 0) frag.append(line("memory", `${burning} cells burn`));

  if (world.history.length >= 2) {
    frag.append(line("shead", "the pulse"));
    frag.append(stripGraph("souls in the world", (h) => h.souls, (v) => v.toLocaleString("en-US")));
    frag.append(
      stripGraph("warmth of the age", (h) => h.drift, (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}°C`, true),
    );
    frag.append(stripPins());
    frag.append(line("none", `years ${world.history[0].year}–${world.year} · each dot a turning of the world; rest on one to read it`));
  }

  worldEl.replaceChildren(frag);
}

// --- Controls ---
function setActive(group: string, button: HTMLElement): void {
  document.querySelectorAll(`button[data-group="${group}"]`).forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
}

function setSpeed(b: number, el: HTMLElement): void {
  batch = b;
  setActive("speed", el);
  if (b > 0 && thresholdFor(b) !== displayThreshold) {
    displayThreshold = thresholdFor(b);
    rebuildChronicle();
  }
}

for (const [id, b] of [["btn-pause", 0], ["btn-season", 1], ["btn-year", 4], ["btn-decade", 40]] as const) {
  const el = document.getElementById(id)!;
  el.dataset.group = "speed";
  el.addEventListener("click", () => setSpeed(b, el));
}

// Spacebar holds and releases the flow of time
let resumeBatch = 1;
window.addEventListener("keydown", (ev) => {
  if (ev.code !== "Space" || ev.repeat) return;
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLButtonElement) return;
  ev.preventDefault();
  if (batch > 0) {
    resumeBatch = batch;
    setSpeed(0, document.getElementById("btn-pause")!);
  } else {
    const id = resumeBatch >= 40 ? "btn-decade" : resumeBatch >= 4 ? "btn-year" : "btn-season";
    setSpeed(resumeBatch, document.getElementById(id)!);
  }
});

const racesEl = document.getElementById("races")!;
const beastsRowEl = document.getElementById("beasts-row")!;
const dreamsRowEl = document.getElementById("dreams-row")!;
for (const [id, v] of [["btn-observe", "observe"], ["btn-bless", "bless"], ["btn-warm", "warm"], ["btn-cool", "cool"], ["btn-heal", "heal"], ["btn-storm", "storm"], ["btn-soothe", "soothe"], ["btn-provoke", "provoke"], ["btn-anoint", "anoint"], ["btn-dream", "dream"], ["btn-smite", "smite"], ["btn-raise", "raise"], ["btn-carve", "carve"], ["btn-volcano", "volcano"], ["btn-meteor", "meteor"], ["btn-reveal", "reveal"], ["btn-enrich", "enrich"], ["btn-wake", "wake"], ["btn-unleash", "unleash"], ["btn-becalm", "becalm"], ["btn-unyoke", "unyoke"], ["btn-embolden", "embolden"]] as const) {
  const el = document.getElementById(id)!;
  el.dataset.group = "verb";
  el.addEventListener("click", () => {
    verb = v;
    setActive("verb", el);
    canvas.classList.toggle("verb", v !== "observe");
    racesEl.hidden = v !== "wake"; // the race picker rides with the Wake verb
    beastsRowEl.hidden = v !== "unleash"; // and the beast picker with Unleash
    dreamsRowEl.hidden = v !== "dream"; // and the dream picker with Dream
    resize(); // the bar's height changed; the map takes up the slack
  });
}

// The dream picker: what the god whispers to a sleeping ruler
const DREAM_KINDS = ["conquest", "dynasty", "renown", "immortality"] as const;
const DREAM_LABELS: Record<(typeof DREAM_KINDS)[number], string> = {
  conquest: "banners taken",
  dynasty: "a line that endures",
  renown: "a name that is sung",
  immortality: "never dying",
};
let selectedDream: (typeof DREAM_KINDS)[number] = "conquest";
for (const kind of DREAM_KINDS) {
  const b = document.createElement("button");
  b.textContent = DREAM_LABELS[kind];
  b.title = kind;
  b.dataset.group = "dream";
  if (kind === selectedDream) b.classList.add("active");
  b.addEventListener("click", () => {
    selectedDream = kind;
    setActive("dream", b);
  });
  dreamsRowEl.append(b);
}

// The beast picker: what the Unleash verb calls out of the dark
const BEAST_KINDS = ["giant", "troll", "dragon", "forgotten", "demon", "wolves", "wyvern", "basilisk", "hydra", "ogre", "griffin", "wight", "serpent", "manticore"] as const;
let selectedBeast: (typeof BEAST_KINDS)[number] = "giant";
for (const kind of BEAST_KINDS) {
  const b = document.createElement("button");
  b.textContent = kind;
  b.dataset.group = "beast";
  if (kind === selectedBeast) b.classList.add("active");
  b.addEventListener("click", () => {
    selectedBeast = kind;
    setActive("beast", b);
  });
  beastsRowEl.append(b);
}

// The race picker: which people the Wake verb calls out of the earth
let selectedRace = RACE_KEYS[0];
for (const key of RACE_KEYS) {
  const b = document.createElement("button");
  b.textContent = key;
  b.dataset.group = "race";
  if (key === selectedRace) b.classList.add("active");
  b.addEventListener("click", () => {
    selectedRace = key;
    setActive("race", b);
  });
  racesEl.append(b);
}
for (const o of ["terrain", "temperature", "moisture", "fertility", "wind"] as const) {
  const el = document.getElementById(`btn-ov-${o}`)!;
  el.dataset.group = "overlay";
  el.addEventListener("click", () => {
    overlay = o;
    setActive("overlay", el);
    dirty = true;
  });
}

const paceSlider = document.getElementById("tick-ms") as HTMLInputElement;
const paceLabel = document.getElementById("tick-label")!;
paceSlider.min = String(SIM_INTERVAL_MIN_MS);
paceSlider.max = String(SIM_INTERVAL_MAX_MS);
paceSlider.step = "250";
paceSlider.value = String(SIM_INTERVAL_MS);
function updatePace(): void {
  intervalMs = Number(paceSlider.value);
  paceLabel.textContent = `${(intervalMs / 1000).toFixed(2).replace(/0$/, "")}s`;
}
paceSlider.addEventListener("input", updatePace);
updatePace();

const modeBtn = document.getElementById("btn-mode")!;
function updateModeBtn(): void {
  modeBtn.textContent = mode === "ascii" ? "Aa" : "▦";
  modeBtn.classList.toggle("active", mode === "ascii");
}
modeBtn.addEventListener("click", () => {
  mode = mode === "ascii" ? "tiles" : "ascii";
  updateModeBtn();
  dirty = true;
});
updateModeBtn();

document.getElementById("btn-season")!.classList.add("active");
document.getElementById("btn-observe")!.classList.add("active");
document.getElementById("btn-ov-terrain")!.classList.add("active");

function cellFromEvent(ev: MouseEvent): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((((ev.clientX - rect.left) / rect.width) * world.width) / view.zoom + view.ox);
  const y = Math.floor((((ev.clientY - rect.top) / rect.height) * world.height) / view.zoom + view.oy);
  if (x < 0 || x >= world.width || y < 0 || y >= world.height) return null;
  return { x, y };
}

// --- The viewport: zoom toward a cell, pan, and never show past the edge ---
const ZOOMS = [1, 1.5, 2, 3, 4];
function clampView(): void {
  if (!world) return;
  view.ox = Math.max(0, Math.min(world.width - world.width / view.zoom, view.ox));
  view.oy = Math.max(0, Math.min(world.height - world.height / view.zoom, view.oy));
  if (view.zoom === 1) {
    view.ox = 0;
    view.oy = 0;
  }
  dirty = true;
}
function zoomTo(zoom: number, anchor?: { x: number; y: number }): void {
  // Keep the cell under the cursor under the cursor
  const fx = anchor ? (anchor.x - view.ox) / (world.width / view.zoom) : 0.5;
  const fy = anchor ? (anchor.y - view.oy) / (world.height / view.zoom) : 0.5;
  const cx = anchor ? anchor.x : view.ox + world.width / view.zoom / 2;
  const cy = anchor ? anchor.y : view.oy + world.height / view.zoom / 2;
  view.zoom = zoom;
  view.ox = cx - fx * (world.width / view.zoom);
  view.oy = cy - fy * (world.height / view.zoom);
  clampView();
}
function zoomStep(dir: 1 | -1, anchor?: { x: number; y: number }): void {
  const i = ZOOMS.indexOf(view.zoom);
  const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i === -1 ? 0 : i) + dir))];
  zoomTo(next, anchor);
}
function pan(dx: number, dy: number): void {
  view.ox += dx;
  view.oy += dy;
  clampView();
}
document.getElementById("btn-zoom-in")!.addEventListener("click", () => zoomStep(1));
document.getElementById("btn-zoom-out")!.addEventListener("click", () => zoomStep(-1));
document.getElementById("btn-zoom-reset")!.addEventListener("click", () => zoomTo(1));
canvas.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    const cell = cellFromEvent(ev) ?? undefined;
    zoomStep(ev.deltaY < 0 ? 1 : -1, cell);
  },
  { passive: false },
);
canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
let dragFrom: { x: number; y: number; ox: number; oy: number } | null = null;
canvas.addEventListener("mousedown", (ev) => {
  if (ev.button !== 2) return;
  dragFrom = { x: ev.clientX, y: ev.clientY, ox: view.ox, oy: view.oy };
});
window.addEventListener("mousemove", (ev) => {
  if (!dragFrom) return;
  const rect = canvas.getBoundingClientRect();
  const cellsPerPx = world.width / view.zoom / rect.width;
  view.ox = dragFrom.ox - (ev.clientX - dragFrom.x) * cellsPerPx;
  view.oy = dragFrom.oy - (ev.clientY - dragFrom.y) * (world.height / view.zoom / rect.height);
  clampView();
});
window.addEventListener("mouseup", () => {
  dragFrom = null;
});
window.addEventListener("keydown", (ev) => {
  if (ev.target instanceof HTMLInputElement) return;
  const step = Math.max(2, Math.round(8 / view.zoom));
  if (ev.key === "ArrowLeft" || ev.key === "a") pan(-step, 0);
  else if (ev.key === "ArrowRight" || ev.key === "d") pan(step, 0);
  else if (ev.key === "ArrowUp" || ev.key === "w") pan(0, -step);
  else if (ev.key === "ArrowDown" || ev.key === "s") pan(0, step);
  else if (ev.key === "+" || ev.key === "=") zoomStep(1);
  else if (ev.key === "-" || ev.key === "_") zoomStep(-1);
  else if (ev.key === "0") zoomTo(1);
  else return;
  ev.preventDefault();
});

// Hold to channel: power pulses into the land under the cursor until release.
// Only the first pulse is chronicled — one act, however long you pour into it.
let channelTimer: number | null = null;

let sculpted = false; // any earth moved this channel — hydrology settles on release

function applyVerb(cell: { x: number; y: number }, announce: boolean): void {
  if (verb === "bless") {
    blessFertility(world, cell.x, cell.y, announce);
    addRipple(cell.x, cell.y, BLESS_RADIUS, "#7bd389");
  } else if (verb === "heal") {
    healPestilence(world, cell.x, cell.y, announce);
    addRipple(cell.x, cell.y, HEAL_RADIUS, "#d8f0dc");
  } else if (verb === "smite") {
    smite(world, cell.x, cell.y, announce);
    addRipple(cell.x, cell.y, SMITE_RADIUS, "#e04444");
  } else if (verb === "raise" || verb === "carve") {
    sculptLand(world, cell.x, cell.y, verb === "raise" ? 1 : -1, announce);
    sculpted = true;
    addRipple(cell.x, cell.y, SCULPT_RADIUS, verb === "raise" ? "#b09a7a" : "#5a8fb8");
  } else {
    shiftTemperature(world, cell.x, cell.y, verb === "warm" ? 1 : -1, announce);
    addRipple(cell.x, cell.y, TEMP_SHIFT_RADIUS, verb === "warm" ? "#e8894e" : "#7db8e8");
  }
  dirty = true;
}

function stopChanneling(): void {
  if (channelTimer !== null) {
    clearInterval(channelTimer);
    channelTimer = null;
  }
  if (sculpted) {
    // The god's hand lifts: winds recross the new land, rivers recarve,
    // coasts redraw — the world absorbs what was done to it
    settleHydrology(world);
    sculpted = false;
    dirty = true;
  }
}

canvas.addEventListener("mousedown", (ev) => {
  if (ev.button !== 0) return;
  const cell = cellFromEvent(ev);
  if (!cell) return;
  if (verb === "observe") {
    // Click a people and their page opens; click empty land or sea to let go
    // of everything — the follow, the open page
    const near = world.pops
      .filter((p) => Math.max(Math.abs(p.x - cell.x), Math.abs(p.y - cell.y)) <= 3)
      .sort((a, b) => b.count - a.count)[0];
    if (near) {
      openDossier(near.culture);
    } else {
      if (followedCulture) {
        followedCulture = null;
        rebuildChronicle();
      }
      if (dossier) {
        dossier = null;
        if (activeTab === "nations") renderNations();
      }
    }
    dirty = true;
    return;
  }
  if (verb === "wake") {
    // A single act, not a channel: one click, one people
    const pop = wakePeople(world, selectedRace, cell.x, cell.y);
    if (pop) {
      addRipple(cell.x, cell.y, 4, cultureOf(world, pop).color);
      dirty = true;
    }
    return;
  }
  if (verb === "unleash") {
    // One click, one horror
    const beast = unleashBeast(world, selectedBeast, cell.x, cell.y);
    if (beast) {
      addRipple(cell.x, cell.y, 4, "#c05ae0");
      dirty = true;
    }
    return;
  }
  if (verb === "soothe" || verb === "provoke" || verb === "anoint") {
    // Single acts of the heart, not channels
    if (verb === "soothe") {
      soothe(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, SOOTHE_RADIUS, "#9fd8c8");
    } else if (verb === "provoke") {
      provoke(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, PROVOKE_RADIUS, "#c86a4a");
    } else {
      anoint(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, ANOINT_RADIUS, "#ffe9a0");
    }
    dirty = true;
    return;
  }
  if (verb === "dream" || verb === "storm" || verb === "reveal" || verb === "becalm" || verb === "unyoke" || verb === "embolden" || verb === "enrich") {
    // The second wave: single acts that reach into figures, hosts, chains, treasures, beasts, and weather
    if (verb === "dream") {
      dream(world, cell.x, cell.y, selectedDream);
      addRipple(cell.x, cell.y, DREAM_RADIUS, "#c9b8ff");
    } else if (verb === "storm") {
      callStorm(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, STORM_RADIUS + 1, "#8fa8d8");
    } else if (verb === "reveal") {
      reveal(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, REVEAL_RADIUS, "#ffd86a");
    } else if (verb === "becalm") {
      becalm(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, BECALM_RADIUS, "#b8c8d8");
    } else if (verb === "unyoke") {
      unyoke(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, UNYOKE_RADIUS, "#f0d0a0");
    } else if (verb === "enrich") {
      enrich(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, 2, "#ffd700");
    } else {
      embolden(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, EMBOLDEN_RADIUS, "#ff9a6a");
    }
    dirty = true;
    return;
  }
  if (verb === "volcano" || verb === "meteor") {
    // Cataclysms are single acts too — and the earth changes, so the
    // waters find their level at once (craters become lakes)
    if (verb === "volcano") {
      volcano(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, VOLCANO_FIRE_RADIUS, "#ff7733");
    } else {
      meteor(world, cell.x, cell.y);
      addRipple(cell.x, cell.y, METEOR_KILL_RADIUS, "#ffe9b0");
    }
    settleHydrology(world);
    dirty = true;
    return;
  }
  applyVerb(cell, true);
  stopChanneling();
  channelTimer = window.setInterval(() => {
    if (hover) applyVerb(hover, false); // follows the cursor as it moves
  }, CHANNEL_INTERVAL_MS);
});
window.addEventListener("mouseup", stopChanneling);
canvas.addEventListener("mouseleave", stopChanneling);

// --- Inspect readout: what the eye rests on ---
let hover: { x: number; y: number } | null = null;

const WANT_PHRASES: Record<NonNullable<import("./world").Want>, string> = {
  harvest: "they pray for a bountiful earth",
  warmth: "they pray for warmth",
  relief: "they pray the sun relent",
  deliverance: "they pray for deliverance",
  beast: "they pray the beast be driven from the land",
  peace: "they pray for peace",
  victory: "they call on their god for victory",
  horizon: "they dream of distant lands",
  conquest: "they covet the lands of",
  delving: "they hunt the veins of the earth",
};

function popMood(pop: Pop): string {
  if (pop.plagueSeasons > 0) return "plague-stricken";
  if (pop.inFamine) return "famished";
  if (pop.target) return pop.journey === "refugees" ? "fleeing" : "on the road";
  if (pop.safety < 0.5) return "hard-pressed";
  if (pop.foodSat > 1.1) return "flourishing";
  return "content";
}

// A people on the move is not a town that happens to walk — name the road they're on
const JOURNEY_NAMES: Record<NonNullable<Pop["journey"]>, string> = {
  settlers: "settlers",
  migrants: "migrants",
  refugees: "refugees",
  homeward: "homeward band",
};

function popKind(pop: Pop): string {
  if (pop.target && pop.journey) return JOURNEY_NAMES[pop.journey];
  if (pop.target) return "wanderers";
  return TIER_NAMES[tierOf(pop.count)];
}

function updateInspect(): void {
  if (!hover) {
    inspectEl.replaceChildren();
    return;
  }
  const { x, y } = hover;
  const i = idx(world, x, y);
  const where = document.createElement("div");
  let holding = "";
  if (world.territory[i]) {
    for (const c of world.cultures.values()) {
      if (c.id === world.territory[i]) {
        holding = ` · lands of the ${polityName(c)}`;
        break;
      }
    }
  }
  where.textContent = `${describeLocation(world, x, y)}${holding} · ${x}, ${y}`;
  // The bones underfoot, and the stones that remember
  const ruin = world.ruins.get(i);
  const ruinLine = ruin
    ? line("who", `ruins of a ${ruin.culture} ${TIER_NAMES[Math.min(ruin.tier, TIER_NAMES.length - 1)]} · fallen year ${ruin.year}`)
    : null;
  const monument = world.monuments.get(i);
  const monumentLine = monument
    ? line("who", `† ${monument.note} (${monument.culture}, year ${monument.year})${monument.desecrated ? " · in foreign hands" : ""}`)
    : null;
  const climate = document.createElement("div");
  const temp = `${world.temperature[i].toFixed(1)}°C`;
  const ore = world.resources[i] ? ` · ${RESOURCE_NAMES[world.resources[i]]} vein` : "";
  climate.textContent = isWater(world, x, y)
    ? `${biomeAt(world, x, y)} · ${temp}`
    : `${biomeAt(world, x, y)}${ore} · ${temp} · moisture ${world.moisture[i].toFixed(2)} · fertility ${world.fertility[i].toFixed(2)}`;
  // A beast under the cursor announces itself
  const beastLines = world.beasts
    .filter((b) => b.alive && Math.abs(b.x - x) <= 1 && Math.abs(b.y - y) <= 1)
    .map((b) => {
      const div = document.createElement("div");
      div.className = "who";
      const asleep = b.sleepUntil > world.year ? ` · asleep until year ${b.sleepUntil}` : "";
      div.textContent =
        b.kind === "demon"
          ? `${b.name} — ${b.desc}${b.throne ? ` · king of the ${b.throne}` : " · walking toward the towns"}`
          : b.kind === "forgotten"
          ? `${b.name} — ${b.desc} · ${b.kills.toLocaleString("en-US")} souls taken${asleep}`
          : `${kindPhrase(b)} — ${b.kills.toLocaleString("en-US")} souls taken${asleep}${b.hostage ? ` · holds ${b.hostage.name}` : ""}${b.hoard !== null ? " · keeps a stolen treasure" : ""}`;
      div.style.color = "#e0a0ff";
      return div;
    });
  const caravanLines = world.caravans
    .filter((c) => Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1 && world.routes[c.route])
    .map((c) => {
      const r = world.routes[c.route]!;
      const div = document.createElement("div");
      div.className = "who";
      div.textContent = `wagons of the ${r.a} · ${c.dir === 1 ? `bound for the ${r.b} with ${GOOD_PHRASE[r.good]}` : "homeward, paid in gold"}`;
      div.style.color = "#e8c060";
      return div;
    });
  const market = world.markets.get(i);
  const marketLine = market ? line("who", `$ market town of the ${market.culture} · since year ${market.year}`) : null;
  const stormLines = world.storms
    .filter((s) => Math.abs(s.x - x) <= STORM_RADIUS && Math.abs(s.y - y) <= STORM_RADIUS)
    .map((s) => {
      const div = document.createElement("div");
      div.className = "who";
      div.textContent = `a storm you called · ${s.seasonsLeft} ${s.seasonsLeft === 1 ? "season" : "seasons"} left in it`;
      div.style.color = "#c8d8f8";
      return div;
    });
  // Hosts in the field get their own line — spears, not souls
  const armyLines = world.armies
    .filter((a) => Math.abs(a.x - x) <= 1 && Math.abs(a.y - y) <= 1)
    .map((army) => {
      const div = document.createElement("div");
      div.className = "who";
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = world.cultures.get(army.culture)?.color ?? "#fff";
      const war = world.wars.get(army.war);
      const enemy = war ? (war.attackers.includes(army.culture) ? war.defenders[0] : war.attackers[0]) : null;
      div.append(
        dot,
        `host of the ${army.culture} — ${army.count.toLocaleString("en-US")} spears${enemy ? ` · marching against the ${enemy}` : ""}${army.morale > 1.05 ? " · heartened" : ""}`,
      );
      return div;
    });
  // Every pop near the cursor gets its own line, largest first
  const nearby = world.pops
    .filter((p) => Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1)
    .sort((a, b) => b.count - a.count);
  const lines = nearby.flatMap((pop) => {
    const who = document.createElement("div");
    who.className = "who";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = cultureOf(world, pop).color;
    who.append(
      dot,
      `${pop.culture} ${popKind(pop)} (${raceOf(world, pop.culture).name}) — ${pop.count.toLocaleString("en-US")} souls · ${popMood(pop)}`,
    );
    const out = [who];
    const leader = leaderOf(world, pop.culture);
    const hero = heroOf(world, pop.culture);
    if (leader || hero) {
      const court = document.createElement("div");
      const parts = [];
      if (leader) parts.push(leader.nature === "demon" ? `ruled by ${leader.name}, a demon on the throne` : `led by ${leader.name} (${leader.temperament})`);
      if (hero) parts.push(hero.nature === "angel" ? `guardian: ${hero.name}, an angel` : `champion: ${hero.name}`);
      court.textContent = parts.join(" · ");
      out.push(court);
    }
    // The people's present yearning and their temper toward the heavens
    const culture = cultureOf(world, pop);
    const parts2: string[] = [];
    if (culture.creed) {
      parts2.push(
        culture.creed.stance === "forsaken"
          ? `they curse ${culture.creed.title}`
          : culture.creed.stance === "witness"
            ? `they have seen ${culture.creed.title} at work`
            : `they name their god ${culture.creed.title}`,
      );
    } else if (culture.faith >= 3) parts2.push("a devout people");
    else if (culture.faith <= -3) parts2.push("a forsaken people");
    else if (culture.grit >= 3) parts2.push("a stoic people");
    const allies = alliesOf(world, pop.culture);
    if (allies.length) parts2.push(`sworn to the ${allies.join(", the ")}`);
    if (pop.yoke) parts2.push(`under the yoke, they still whisper the name ${pop.yoke.of}`);
    if (culture.want) {
      parts2.push(
        culture.want === "conquest" && culture.wantTarget
          ? `${WANT_PHRASES.conquest} the ${culture.wantTarget}`
          : culture.want === "beast" && culture.wantTarget
            ? `they pray ${culture.wantTarget} be driven from the land`
            : WANT_PHRASES[culture.want],
      );
    }
    if (parts2.length) {
      const prayer = document.createElement("div");
      prayer.className = "prayer";
      prayer.textContent = parts2.join(" · ");
      out.push(prayer);
    }
    return out;
  });
  inspectEl.replaceChildren(
    ...stormLines,
    ...beastLines,
    ...armyLines,
    ...caravanLines,
    ...lines,
    ...(ruinLine ? [ruinLine] : []),
    ...(monumentLine ? [monumentLine] : []),
    ...(marketLine ? [marketLine] : []),
    where,
    climate,
  );
}

canvas.addEventListener("mousemove", (ev) => {
  hover = cellFromEvent(ev);
  // The card steps out from under the cursor: near the bottom-right it flips top
  const rect = canvas.getBoundingClientRect();
  inspectEl.classList.toggle(
    "flip",
    ev.clientX - rect.left > rect.width * 0.5 && ev.clientY - rect.top > rect.height * 0.42,
  );
  updateInspect();
});
canvas.addEventListener("mouseleave", () => {
  hover = null;
  updateInspect();
});

function resize(): void {
  // The canvas fills whatever the controls bar leaves it — measure the
  // element itself, after layout, never the whole view column
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  dirty = true;
}
window.addEventListener("resize", resize);

// --- Genesis: choose a world, then begin ---
const genesisEl = document.getElementById("genesis")!;
const worldsEl = document.getElementById("worlds")!;
const chkWake = document.getElementById("chk-wake") as HTMLInputElement;

// The seed makes the bones; the flavor bends them; the run makes the story.
// A URL with only ?seed regrows the same world but rolls a NEW history onto
// it every load — pinning &run=M by hand reproduces one history exactly
// (the title shows the number).
function startWorld(seed: number, quiet: boolean, run?: number, flavor: FlavorKey = "temperate"): void {
  const pinned = new URLSearchParams(location.search); // read before the URL is rewritten below
  const runSeed = run ?? Math.floor(Math.random() * 2 ** 31) + 1;
  world = createWorld(seed, { peoples: quiet ? "sleep" : "wake", run: runSeed, flavor });
  const flavorName = WORLD_FLAVORS[flavor].name;
  document.title = `Demiurge · world ${seed}${flavor !== "temperate" ? ` (${flavorName})` : ""} · run ${runSeed}`;
  history.replaceState(
    null,
    "",
    `?seed=${seed}${flavor !== "temperate" ? `&flavor=${flavor}` : ""}${run !== undefined ? `&run=${run}` : ""}${quiet ? "&quiet=1" : ""}`,
  );
  genesisEl.hidden = true;
  resize();
  // A pinned view: &zoom=2&at=x,y opens the world already leaned in
  const z = Number(pinned.get("zoom"));
  const at = (pinned.get("at") ?? "").split(",").map(Number);
  view.zoom = 1;
  view.ox = 0;
  view.oy = 0;
  if (ZOOMS.includes(z)) zoomTo(z, at.length === 2 && !at.some(isNaN) ? { x: at[0], y: at[1] } : undefined);
  lastFrame = performance.now();
  requestAnimationFrame(frame);
}

// Each card is a fully generated world, shown before its peoples are seeded —
// the same seed and flavor regrow the same terrain when one is chosen.
// Flavors are rolled per card, temperate most often, so every genesis offers
// a spread of characters: a frozen world, island seas, a parched expanse.
const FLAVOR_KEYS = Object.keys(WORLD_FLAVORS) as FlavorKey[];
function rollFlavor(): FlavorKey {
  if (Math.random() < 0.4) return "temperate";
  return FLAVOR_KEYS[1 + Math.floor(Math.random() * (FLAVOR_KEYS.length - 1))];
}

function rollWorlds(): void {
  worldsEl.replaceChildren();
  for (let k = 0; k < 4; k++) {
    const s = Math.floor(Math.random() * 2 ** 31) + 1;
    const flavor = rollFlavor();
    const preview = createWorld(s, { peoples: "sleep", flavor });
    const card = document.createElement("div");
    card.className = "card";
    const cv = document.createElement("canvas");
    cv.width = 320;
    cv.height = 160;
    renderThumbnail(preview, cv);
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = `world ${s} · ${WORLD_FLAVORS[flavor].name}`;
    card.append(cv, name);
    card.addEventListener("click", () => startWorld(s, !chkWake.checked, undefined, flavor));
    worldsEl.append(card);
  }
}

document.getElementById("btn-reroll")!.addEventListener("click", rollWorlds);
document.getElementById("btn-new")!.addEventListener("click", () => {
  location.href = location.pathname; // leave this world; genesis offers new ones
});

const params = new URLSearchParams(location.search);
const urlSeed = Number(params.get("seed"));
const urlRun = Number(params.get("run"));
const urlFlavor = params.get("flavor");
if (Number.isInteger(urlSeed) && urlSeed > 0) {
  startWorld(
    urlSeed,
    params.get("quiet") === "1",
    Number.isInteger(urlRun) && urlRun > 0 ? urlRun : undefined,
    urlFlavor && urlFlavor in WORLD_FLAVORS ? (urlFlavor as FlavorKey) : "temperate",
  );
} else {
  genesisEl.hidden = false;
  rollWorlds();
}
