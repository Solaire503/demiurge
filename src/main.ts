import { BLESS_RADIUS, CHANNEL_INTERVAL_MS, SIM_INTERVAL_MAX_MS, SIM_INTERVAL_MIN_MS, SIM_INTERVAL_MS, TEMP_SHIFT_RADIUS } from "./constants";
import { addRipple, render, type Overlay, type RenderMode } from "./render";
import { blessFertility, shiftTemperature, tick } from "./sim";
import { SEASONS, createWorld, cultureOf, describeLocation, idx, isWater, type Pop } from "./world";

const world = createWorld(20260819);

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
let displayThreshold = 1;
const MAX_PANEL_ENTRIES = 400;

function thresholdFor(b: number): number {
  return b >= 40 ? 3 : b >= 4 ? 2 : 1;
}

type Verb = "observe" | "bless" | "warm" | "cool";
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
    const animating = render(world, canvas, ctx, overlay, mode);
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
    if (e.importance >= displayThreshold) entriesEl.append(entryDiv(e));
  }
  trimPanel();
  if (nearBottom) entriesEl.scrollTop = entriesEl.scrollHeight;
}

function rebuildChronicle(): void {
  entriesEl.replaceChildren();
  for (const e of world.events) {
    if (e.importance >= displayThreshold) entriesEl.append(entryDiv(e));
  }
  trimPanel();
  flushedEvents = world.events.length;
  entriesEl.scrollTop = entriesEl.scrollHeight;
}

// --- Controls ---
function setActive(group: string, button: HTMLElement): void {
  document.querySelectorAll(`button[data-group="${group}"]`).forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
}

for (const [id, b] of [["btn-pause", 0], ["btn-season", 1], ["btn-year", 4], ["btn-decade", 40]] as const) {
  const el = document.getElementById(id)!;
  el.dataset.group = "speed";
  el.addEventListener("click", () => {
    batch = b;
    setActive("speed", el);
    if (b > 0 && thresholdFor(b) !== displayThreshold) {
      displayThreshold = thresholdFor(b);
      rebuildChronicle();
    }
  });
}

for (const [id, v] of [["btn-observe", "observe"], ["btn-bless", "bless"], ["btn-warm", "warm"], ["btn-cool", "cool"]] as const) {
  const el = document.getElementById(id)!;
  el.dataset.group = "verb";
  el.addEventListener("click", () => {
    verb = v;
    setActive("verb", el);
    canvas.classList.toggle("verb", v !== "observe");
  });
}
for (const o of ["terrain", "temperature", "moisture", "fertility"] as const) {
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

function applyVerb(cell: { x: number; y: number }, announce: boolean): void {
  if (verb === "bless") {
    blessFertility(world, cell.x, cell.y, announce);
    addRipple(cell.x, cell.y, BLESS_RADIUS, "#7bd389");
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
}

canvas.addEventListener("mousedown", (ev) => {
  if (verb === "observe" || ev.button !== 0) return;
  const cell = cellFromEvent(ev);
  if (!cell) return;
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

function popMood(pop: Pop): string {
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
  where.textContent = `${describeLocation(world, x, y)} · ${x}, ${y}`;
  const climate = document.createElement("div");
  const temp = `${world.temperature[i].toFixed(1)}°C`;
  climate.textContent = isWater(world, x, y)
    ? `open water · ${temp}`
    : `${temp} · moisture ${world.moisture[i].toFixed(2)} · fertility ${world.fertility[i].toFixed(2)}`;
  inspectEl.replaceChildren(where, climate);
  const nearby = world.pops
    .filter((p) => Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1)
    .sort((a, b) => b.count - a.count);
  const pop = nearby[0];
  if (pop) {
    const who = document.createElement("div");
    who.className = "who";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = cultureOf(world, pop).color;
    const others = nearby.length > 1 ? ` (+${nearby.length - 1} more)` : "";
    who.append(
      dot,
      `${pop.culture} — ${pop.count.toLocaleString("en-US")} souls · ${popMood(pop)}${others}`,
    );
    inspectEl.prepend(who);
  }
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

resize();
requestAnimationFrame(frame);
