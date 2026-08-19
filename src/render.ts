import * as C from "./constants";
import type { World } from "./world";
import { cultureOf, idx } from "./world";

const TERRITORY_ALPHA = 0.16; // tint strength of a culture's worked land

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function terrainColor(world: World, i: number): string {
  const elev = world.elevation[i];
  if (elev < C.SEA_LEVEL) {
    const depth = elev / C.SEA_LEVEL; // 0 deep, 1 shore
    return `rgb(${lerp(8, 28, depth)}, ${lerp(30, 84, depth)}, ${lerp(74, 138, depth)})`;
  }
  const fert = Math.min(1, world.meanFertility[i]);
  // Barren tan to lush green by fertility, brightened slightly with altitude
  let r = lerp(164, 52, fert);
  let g = lerp(148, 122, fert);
  let b = lerp(105, 46, fert);
  const relief = 0.85 + ((elev - C.SEA_LEVEL) / (1 - C.SEA_LEVEL)) * 0.35;
  r *= relief;
  g *= relief;
  b *= relief;
  // Cold land whitens into snow
  const t = world.temperature[i];
  if (t < C.SNOW_TEMP) {
    const snow = Math.min(1, (C.SNOW_TEMP - t) / 10);
    r = lerp(r, 236, snow);
    g = lerp(g, 240, snow);
    b = lerp(b, 245, snow);
  }
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

export type Overlay = "terrain" | "temperature" | "moisture" | "fertility";

// Debug ramps: value in [0,1] between two anchor colors, water dimmed for coastline reference
function ramp(v: number, from: [number, number, number], to: [number, number, number], dim: boolean): string {
  const t = Math.min(1, Math.max(0, v));
  let r = lerp(from[0], to[0], t);
  let g = lerp(from[1], to[1], t);
  let b = lerp(from[2], to[2], t);
  if (dim) {
    r *= 0.45;
    g *= 0.45;
    b *= 0.45;
  }
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

function overlayColor(world: World, i: number, overlay: Overlay): string {
  const water = world.elevation[i] < C.SEA_LEVEL;
  switch (overlay) {
    case "temperature":
      return ramp((world.temperature[i] + 30) / 70, [40, 80, 216], [216, 58, 44], water);
    case "moisture":
      return ramp(world.moisture[i], [184, 169, 120], [33, 102, 172], water);
    case "fertility":
      return ramp(world.fertility[i] / 1.5, [138, 122, 92], [29, 122, 29], water);
    default:
      return terrainColor(world, i);
  }
}

// Divine touch feedback: an expanding, fading ring where a verb landed.
// Cell coordinates so rings survive window resizes mid-animation.
interface Ripple {
  x: number;
  y: number;
  cellRadius: number;
  color: string;
  start: number;
}

const RIPPLE_MS = 900;
const ripples: Ripple[] = [];

export function addRipple(x: number, y: number, cellRadius: number, color: string): void {
  ripples.push({ x: x + 0.5, y: y + 0.5, cellRadius, color, start: performance.now() });
}

function drawRipples(ctx: CanvasRenderingContext2D, cellW: number, cellH: number): void {
  const now = performance.now();
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    const t = (now - r.start) / RIPPLE_MS;
    if (t >= 1) {
      ripples.splice(i, 1);
      continue;
    }
    const eased = 1 - (1 - t) ** 3;
    const radius = eased * r.cellRadius * Math.max(cellW, cellH);
    ctx.beginPath();
    ctx.arc(r.x * cellW, r.y * cellH, radius, 0, Math.PI * 2);
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.strokeStyle = r.color;
    ctx.stroke();
    ctx.globalAlpha = (1 - t) * 0.15;
    ctx.fillStyle = r.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export type RenderMode = "tiles" | "ascii";

// --- ASCII mode: the world as a page of living text, DF-style ---

interface Glyph {
  ch: string;
  color: string;
}

function glyphFor(world: World, i: number): Glyph {
  const elev = world.elevation[i];
  if (elev < C.SEA_LEVEL) {
    const depth = elev / C.SEA_LEVEL;
    const color = `rgb(${lerp(30, 60, depth) | 0}, ${lerp(70, 130, depth) | 0}, ${lerp(140, 200, depth) | 0})`;
    return { ch: depth < 0.55 ? "~" : "≈", color };
  }
  const fert = Math.min(1, world.meanFertility[i]);
  let r = lerp(150, 70, fert);
  let g = lerp(130, 190, fert);
  let b = lerp(90, 70, fert);
  const relief = 0.8 + ((elev - C.SEA_LEVEL) / (1 - C.SEA_LEVEL)) * 0.4;
  r *= relief;
  g *= relief;
  b *= relief;
  const t = world.temperature[i];
  if (t < C.SNOW_TEMP) {
    const snow = Math.min(1, (C.SNOW_TEMP - t) / 10);
    r = lerp(r, 235, snow);
    g = lerp(g, 240, snow);
    b = lerp(b, 248, snow);
  }
  const color = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
  if (elev > 0.88) return { ch: "▲", color };
  if (elev > C.MOUNTAIN_ROCK_START) return { ch: "^", color };
  if (fert > 0.75) return { ch: "♣", color };
  if (fert > 0.5) return { ch: '"', color };
  if (fert > 0.25) return { ch: ",", color };
  return { ch: ".", color };
}

function renderAscii(world: World, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const cellW = canvas.width / world.width;
  const cellH = canvas.height / world.height;
  ctx.fillStyle = "#0a0c10";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Territory tint sits behind the text like illumination on a manuscript
  ctx.globalAlpha = 0.22;
  for (const pop of world.pops) {
    ctx.fillStyle = cultureOf(world, pop).color;
    ctx.fillRect(
      Math.floor((pop.x - 1) * cellW),
      Math.floor((pop.y - 1) * cellH),
      Math.ceil(cellW * 3),
      Math.ceil(cellH * 3),
    );
  }
  ctx.globalAlpha = 1;

  ctx.font = `${Math.ceil(cellH * 0.95)}px "Menlo", "Consolas", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const g = glyphFor(world, idx(world, x, y));
      ctx.fillStyle = g.color;
      ctx.fillText(g.ch, (x + 0.5) * cellW, (y + 0.5) * cellH);
    }
  }

  // Pops are their culture's initial: uppercase settled, lowercase on the move
  ctx.font = `bold ${Math.ceil(cellH * 1.1)}px "Menlo", "Consolas", monospace`;
  for (const pop of world.pops) {
    const px = (pop.x + 0.5) * cellW;
    const py = (pop.y + 0.5) * cellH;
    if (pop.inFamine) {
      ctx.fillStyle = "#7a1414";
      ctx.fillRect(Math.floor(pop.x * cellW), Math.floor(pop.y * cellH), Math.ceil(cellW), Math.ceil(cellH));
    }
    const letter = pop.culture.charAt(0);
    ctx.fillStyle = cultureOf(world, pop).color;
    ctx.fillText(pop.target ? letter.toLowerCase() : letter.toUpperCase(), px, py);
  }
}

// Returns true while an animation is running and another frame is needed
export function render(
  world: World,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  overlay: Overlay = "terrain",
  mode: RenderMode = "tiles",
): boolean {
  const cellW = canvas.width / world.width;
  const cellH = canvas.height / world.height;

  if (mode === "ascii" && overlay === "terrain") {
    renderAscii(world, canvas, ctx);
    drawRipples(ctx, cellW, cellH);
    return ripples.length > 0;
  }

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      ctx.fillStyle = overlayColor(world, idx(world, x, y), overlay);
      // Overdraw by rounding out to avoid seams between cells
      ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW), Math.ceil(cellH));
    }
  }

  // Territory: each culture's worked 3x3 tinted with its color, so peoples
  // read as regions with borders that move. Terrain view only — the debug
  // overlays should show raw data.
  if (overlay === "terrain") {
    ctx.globalAlpha = TERRITORY_ALPHA;
    for (const pop of world.pops) {
      ctx.fillStyle = cultureOf(world, pop).color;
      ctx.fillRect(
        Math.floor((pop.x - 1) * cellW),
        Math.floor((pop.y - 1) * cellH),
        Math.ceil(cellW * 3),
        Math.ceil(cellH * 3),
      );
    }
    ctx.globalAlpha = 1;
  }

  for (const pop of world.pops) {
    const px = (pop.x + 0.5) * cellW;
    const py = (pop.y + 0.5) * cellH;
    const radius = Math.min(cellW * 2.2, 2 + Math.sqrt(pop.count) / 14);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = cultureOf(world, pop).color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = pop.inFamine ? "#000" : "#ffffffcc";
    ctx.stroke();
  }

  drawRipples(ctx, cellW, cellH);
  return ripples.length > 0;
}
