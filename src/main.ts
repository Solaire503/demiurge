import { BLESS_RADIUS, CHANNEL_INTERVAL_MS, SCULPT_RADIUS, SIM_INTERVAL_MAX_MS, SIM_INTERVAL_MIN_MS, SIM_INTERVAL_MS, TEMP_SHIFT_RADIUS } from "./constants";
import { RACE_KEYS } from "./races";
import { addRipple, render, renderThumbnail, type Overlay, type RenderMode } from "./render";
import { blessFertility, sculptLand, shiftTemperature, tick } from "./sim";
import { RESOURCE_NAMES, SEASONS, TIER_NAMES, biomeAt, createWorld, cultureOf, describeLocation, heroOf, idx, isWater, leaderOf, raceOf, settleHydrology, tierOf, wakePeople, type Pop, type World } from "./world";

// A pinned URL (?seed=N) boots straight into that world; otherwise the genesis
// screen offers worlds to choose from. &quiet=1 keeps the peoples asleep so
// the god may wake them by hand.
let world: World;

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const view = document.getElementById("view")!;
const entriesEl = document.getElementById("entries")!;
const dateEl = document.getElementById("date")!;
const inspectEl = document.getElementById("inspect")!;

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

type Verb = "observe" | "bless" | "warm" | "cool" | "raise" | "carve" | "wake";
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
    dateEl.textContent = `Year ${world.year}, ${SEASONS[world.season]}`;
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
  document.querySelector("#log h2")!.textContent = followedCulture
    ? `Chronicle · the ${followedCulture}`
    : "Chronicle";
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
for (const [id, v] of [["btn-observe", "observe"], ["btn-bless", "bless"], ["btn-warm", "warm"], ["btn-cool", "cool"], ["btn-raise", "raise"], ["btn-carve", "carve"], ["btn-wake", "wake"]] as const) {
  const el = document.getElementById(id)!;
  el.dataset.group = "verb";
  el.addEventListener("click", () => {
    verb = v;
    setActive("verb", el);
    canvas.classList.toggle("verb", v !== "observe");
    racesEl.hidden = v !== "wake"; // the race picker rides with the Wake verb
  });
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
  const x = Math.floor(((ev.clientX - rect.left) / rect.width) * world.width);
  const y = Math.floor(((ev.clientY - rect.top) / rect.height) * world.height);
  if (x < 0 || x >= world.width || y < 0 || y >= world.height) return null;
  return { x, y };
}

// Hold to channel: power pulses into the land under the cursor until release.
// Only the first pulse is chronicled — one act, however long you pour into it.
let channelTimer: number | null = null;

let sculpted = false; // any earth moved this channel — hydrology settles on release

function applyVerb(cell: { x: number; y: number }, announce: boolean): void {
  if (verb === "bless") {
    blessFertility(world, cell.x, cell.y, announce);
    addRipple(cell.x, cell.y, BLESS_RADIUS, "#7bd389");
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
    // Click a people to follow their story; click empty land or sea to let go
    const near = world.pops
      .filter((p) => Math.max(Math.abs(p.x - cell.x), Math.abs(p.y - cell.y)) <= 3)
      .sort((a, b) => b.count - a.count)[0];
    const next = near ? near.culture : null;
    followedCulture = next === followedCulture ? null : next;
    rebuildChronicle();
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
  peace: "they pray for peace",
  victory: "they call on their god for victory",
};

function popMood(pop: Pop): string {
  if (pop.plagueSeasons > 0) return "plague-stricken";
  if (pop.inFamine) return "famished";
  if (pop.target) return "wandering";
  if (pop.safety < 0.5) return "hard-pressed";
  if (pop.foodSat > 1.1) return "flourishing";
  return "content";
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
        holding = ` · lands of the ${c.name}`;
        break;
      }
    }
  }
  where.textContent = `${describeLocation(world, x, y)}${holding} · ${x}, ${y}`;
  const climate = document.createElement("div");
  const temp = `${world.temperature[i].toFixed(1)}°C`;
  const ore = world.resources[i] ? ` · ${RESOURCE_NAMES[world.resources[i]]} vein` : "";
  climate.textContent = isWater(world, x, y)
    ? `${biomeAt(world, x, y)} · ${temp}`
    : `${biomeAt(world, x, y)}${ore} · ${temp} · moisture ${world.moisture[i].toFixed(2)} · fertility ${world.fertility[i].toFixed(2)}`;
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
      `${pop.culture} ${TIER_NAMES[tierOf(pop.count)]} (${raceOf(world, pop.culture).name}) — ${pop.count.toLocaleString("en-US")} souls · ${popMood(pop)}`,
    );
    const out = [who];
    const leader = leaderOf(world, pop.culture);
    const hero = heroOf(world, pop.culture);
    if (leader || hero) {
      const court = document.createElement("div");
      const parts = [];
      if (leader) parts.push(`led by ${leader.name} (${leader.temperament})`);
      if (hero) parts.push(`champion: ${hero.name}`);
      court.textContent = parts.join(" · ");
      out.push(court);
    }
    // The people's present yearning, in present tense — the world murmurs it
    const want = cultureOf(world, pop).want;
    if (want) {
      const prayer = document.createElement("div");
      prayer.className = "prayer";
      prayer.textContent = WANT_PHRASES[want];
      out.push(prayer);
    }
    return out;
  });
  inspectEl.replaceChildren(...lines, where, climate);
}

canvas.addEventListener("mousemove", (ev) => {
  hover = cellFromEvent(ev);
  updateInspect();
});
canvas.addEventListener("mouseleave", () => {
  hover = null;
  updateInspect();
});

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(view.clientWidth * dpr);
  canvas.height = Math.floor(view.clientHeight * dpr);
  dirty = true;
}
window.addEventListener("resize", resize);

// --- Genesis: choose a world, then begin ---
const genesisEl = document.getElementById("genesis")!;
const worldsEl = document.getElementById("worlds")!;
const chkWake = document.getElementById("chk-wake") as HTMLInputElement;

function startWorld(seed: number, quiet: boolean): void {
  world = createWorld(seed, { peoples: quiet ? "sleep" : "wake" });
  document.title = `Demiurge · world ${seed}`;
  history.replaceState(null, "", `?seed=${seed}${quiet ? "&quiet=1" : ""}`);
  genesisEl.hidden = true;
  resize();
  lastFrame = performance.now();
  requestAnimationFrame(frame);
}

// Each card is a fully generated world, shown before its peoples are seeded —
// the same seed regrows the same terrain when one is chosen
function rollWorlds(): void {
  worldsEl.replaceChildren();
  for (let k = 0; k < 4; k++) {
    const s = Math.floor(Math.random() * 2 ** 31) + 1;
    const preview = createWorld(s, { peoples: "sleep" });
    const card = document.createElement("div");
    card.className = "card";
    const cv = document.createElement("canvas");
    cv.width = 320;
    cv.height = 160;
    renderThumbnail(preview, cv);
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = `world ${s}`;
    card.append(cv, name);
    card.addEventListener("click", () => startWorld(s, !chkWake.checked));
    worldsEl.append(card);
  }
}

document.getElementById("btn-reroll")!.addEventListener("click", rollWorlds);
document.getElementById("btn-new")!.addEventListener("click", () => {
  location.href = location.pathname; // leave this world; genesis offers new ones
});

const params = new URLSearchParams(location.search);
const urlSeed = Number(params.get("seed"));
if (Number.isInteger(urlSeed) && urlSeed > 0) {
  startWorld(urlSeed, params.get("quiet") === "1");
} else {
  genesisEl.hidden = false;
  rollWorlds();
}
