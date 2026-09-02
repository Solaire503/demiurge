import * as C from "./constants";
import { polityName } from "./nations";
import type { World } from "./world";
import { biomeIdAt, cultureOf, idx, tierOf } from "./world";

// Per-biome character: base land color and ASCII glyph, indexed by biomeIdAt.
// Water entries (0-2) are unused — water is handled before biome lookup.
const BIOME_STYLE: { color: [number, number, number]; glyph: string }[] = [
  { color: [0, 0, 0], glyph: "~" }, // deep sea
  { color: [0, 0, 0], glyph: "≈" }, // coastal waters
  { color: [0, 0, 0], glyph: "≈" }, // lake
  { color: [172, 168, 162], glyph: "▲" }, // high mountains
  { color: [130, 120, 108], glyph: "^" }, // mountains
  { color: [225, 230, 238], glyph: "*" }, // ice fields
  { color: [152, 148, 132], glyph: "-" }, // tundra
  { color: [204, 182, 128], glyph: "·" }, // desert
  { color: [156, 146, 122], glyph: "·" }, // cold barrens
  { color: [80, 106, 90], glyph: "♠" }, // taiga
  { color: [188, 168, 96], glyph: '"' }, // steppe
  { color: [40, 104, 46], glyph: "♠" }, // jungle
  { color: [78, 122, 60], glyph: "♣" }, // forest
  { color: [138, 160, 84], glyph: "," }, // grassland
];

const TERRITORY_ALPHA = 0.16; // tint strength of a culture's worked land

// Pops sharing a cell fan out inside it so no one hides behind a neighbor.
// Offsets in cell units; at most four are shown, largest first.
const SPREAD: [number, number][][] = [
  [[0, 0]],
  [[-0.22, 0], [0.24, 0]],
  [[-0.22, -0.2], [0.24, -0.2], [0, 0.24]],
  [[-0.22, -0.22], [0.24, -0.22], [-0.22, 0.24], [0.24, 0.24]],
];

function spreadPops(world: World): { pop: import("./world").Pop; ox: number; oy: number; stacked: boolean }[] {
  const byCell = new Map<number, import("./world").Pop[]>();
  for (const pop of world.pops) {
    const key = pop.y * world.width + pop.x;
    const list = byCell.get(key);
    if (list) list.push(pop);
    else byCell.set(key, [pop]);
  }
  const out: { pop: import("./world").Pop; ox: number; oy: number; stacked: boolean }[] = [];
  for (const list of byCell.values()) {
    list.sort((a, b) => b.count - a.count);
    const shown = list.slice(0, SPREAD.length);
    const offsets = SPREAD[shown.length - 1];
    shown.forEach((pop, i) => out.push({ pop, ox: offsets[i][0], oy: offsets[i][1], stacked: list.length > 1 }));
  }
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Living flame: white-hot at full intensity, guttering red as it dies
function fireColor(intensity: number): { r: number; g: number; b: number } {
  return { r: 255, g: lerp(70, 190, intensity), b: lerp(20, 60, intensity) };
}

function terrainColor(world: World, i: number): string {
  const elev = world.elevation[i];
  if (world.lakes[i]) return "rgb(36, 96, 150)";
  if (elev < C.SEA_LEVEL) {
    const depth = elev / C.SEA_LEVEL; // 0 deep, 1 shore
    return `rgb(${lerp(8, 28, depth)}, ${lerp(30, 84, depth)}, ${lerp(74, 138, depth)})`;
  }
  if (world.fire[i] > 0) {
    const f = fireColor(world.fire[i]);
    return `rgb(${f.r}, ${f.g | 0}, ${f.b | 0})`;
  }
  if (world.isRiver[i]) return "rgb(52, 118, 168)";
  // Each biome wears its own colors, deepened by fertility and lit by altitude
  const [br, bg, bb] = BIOME_STYLE[biomeIdAt(world, i)].color;
  const fert = Math.min(1, world.meanFertility[i]);
  let r = lerp(br, br * 0.55, fert * 0.7);
  let g = lerp(bg, Math.min(255, bg * 1.15), fert * 0.7);
  let b = lerp(bb, bb * 0.55, fert * 0.7);
  const relief = 0.85 + ((elev - C.SEA_LEVEL) / (1 - C.SEA_LEVEL)) * 0.35;
  r *= relief;
  g *= relief;
  b *= relief;
  // Cold land whitens into snow — annual mean, so the snow line marks climate
  // rather than strobing with the seasons. Great heat chars it the other way:
  // green gives way to scorched umber, then to cracked black earth.
  const t = world.meanTemperature[i];
  if (t < C.SNOW_TEMP) {
    const snow = Math.min(1, (C.SNOW_TEMP - t) / 10);
    r = lerp(r, 236, snow);
    g = lerp(g, 240, snow);
    b = lerp(b, 245, snow);
  } else if (t > C.SCORCH_TEMP) {
    const scorch = Math.min(1, (t - C.SCORCH_TEMP) / 25);
    r = lerp(r, lerp(122, 46, scorch), scorch);
    g = lerp(g, lerp(82, 34, scorch), scorch);
    b = lerp(b, lerp(48, 28, scorch), scorch);
  }
  // Burned ground is char-dark until it heals
  const char = world.char[i];
  if (char > 0) {
    r = lerp(r, 30, char * 0.85);
    g = lerp(g, 26, char * 0.85);
    b = lerp(b, 24, char * 0.85);
  }
  return `rgb(${Math.min(255, r) | 0}, ${Math.min(255, g) | 0}, ${Math.min(255, b) | 0})`;
}

// Territory: each people's held land tinted with their color, edged with a
// drawn border where dominion meets dominion, wilderness, or the sea.
// When following a people, everyone else's lands fade into the page.
function drawTerritory(
  world: World,
  ctx: CanvasRenderingContext2D,
  cellW: number,
  cellH: number,
  followed: string | null,
  tintAlpha: number,
): void {
  const colorById = new Map<number, string>();
  const dimById = new Map<number, boolean>();
  for (const c of world.cultures.values()) {
    colorById.set(c.id, c.color);
    dimById.set(c.id, followed !== null && c.name !== followed);
  }
  const owner = (x: number, y: number): number =>
    x < 0 || x >= world.width || y < 0 || y >= world.height ? 0 : world.territory[y * world.width + x];
  const lw = Math.max(1, Math.min(cellW, cellH) * 0.14);
  ctx.lineWidth = lw;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const o = world.territory[idx(world, x, y)];
      if (!o) continue;
      const color = colorById.get(o);
      if (!color) continue;
      const dim = dimById.get(o);
      const px = x * cellW;
      const py = y * cellH;
      ctx.globalAlpha = dim ? 0.035 : tintAlpha;
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(cellW), Math.ceil(cellH));
      // Border edges, inset so two dominions each draw their own side
      const edges =
        (owner(x - 1, y) !== o ? 1 : 0) |
        (owner(x + 1, y) !== o ? 2 : 0) |
        (owner(x, y - 1) !== o ? 4 : 0) |
        (owner(x, y + 1) !== o ? 8 : 0);
      if (!edges) continue;
      ctx.globalAlpha = dim ? 0.07 : 0.55;
      ctx.strokeStyle = color;
      ctx.beginPath();
      if (edges & 1) {
        ctx.moveTo(px + lw / 2, py);
        ctx.lineTo(px + lw / 2, py + cellH);
      }
      if (edges & 2) {
        ctx.moveTo(px + cellW - lw / 2, py);
        ctx.lineTo(px + cellW - lw / 2, py + cellH);
      }
      if (edges & 4) {
        ctx.moveTo(px, py + lw / 2);
        ctx.lineTo(px + cellW, py + lw / 2);
      }
      if (edges & 8) {
        ctx.moveTo(px, py + cellH - lw / 2);
        ctx.lineTo(px + cellW, py + cellH - lw / 2);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// Ruins in tile mode: the same Ω the ASCII page uses, quiet and stone-gray
function drawRuins(world: World, ctx: CanvasRenderingContext2D, cellW: number, cellH: number): void {
  if (!world.ruins.size) return;
  ctx.font = `${Math.ceil(cellH * 0.85)}px "Menlo", "Consolas", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(210, 200, 182, 0.85)";
  for (const ruin of world.ruins.values()) {
    ctx.fillText("Ω", (ruin.x + 0.5) * cellW, (ruin.y + 0.5) * cellH);
  }
}

// Monuments and tombs: a small † at the cell's shoulder, in both modes —
// it shares ground with settlements, so it perches rather than covers
function drawMonuments(world: World, ctx: CanvasRenderingContext2D, cellW: number, cellH: number): void {
  if (!world.monuments.size) return;
  ctx.font = `${Math.ceil(cellH * 0.7)}px "Menlo", "Consolas", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(222, 214, 194, 0.8)";
  for (const [i, m] of world.monuments) {
    // Temples wear a different mark: a house, not a grave
    ctx.fillText(m.kind === "temple" ? "∆" : "†", ((i % world.width) + 0.8) * cellW, (((i / world.width) | 0) + 0.22) * cellH);
  }
}

// Beasts wear DF's oldest costume: a single letter that means terror.
// G giant, T troll, D dragon, & the thing with no proper name.
const BEAST_GLYPHS: Record<string, { ch: string; color: string }> = {
  giant: { ch: "G", color: "#d4b06a" },
  troll: { ch: "T", color: "#8fbf7a" },
  dragon: { ch: "D", color: "#ff5533" },
  forgotten: { ch: "&", color: "#c05ae0" },
  demon: { ch: "Ð", color: "#ff3b8b" },
};

function drawBeasts(world: World, ctx: CanvasRenderingContext2D, cellW: number, cellH: number): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const beast of world.beasts) {
    if (!beast.alive) continue;
    const g = BEAST_GLYPHS[beast.kind];
    const px = (beast.x + 0.5) * cellW;
    const py = (beast.y + 0.5) * cellH;
    ctx.font = `bold ${Math.ceil(cellH * 1.3)}px "Menlo", "Consolas", monospace`;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(10, 12, 16, 0.9)";
    ctx.globalAlpha = beast.sleepUntil > world.year ? 0.45 : 1; // a sleeping terror fades into the hills
    ctx.strokeText(g.ch, px, py);
    ctx.fillStyle = g.color;
    ctx.fillText(g.ch, px, py);
    ctx.globalAlpha = 1;
  }
}

// Called weather: a soft grey-blue mass with rain marks, riding the wind
function drawStorms(world: World, ctx: CanvasRenderingContext2D, cellW: number, cellH: number): void {
  if (!world.storms.length) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const s of world.storms) {
    const px = (s.x + 0.5) * cellW;
    const py = (s.y + 0.5) * cellH;
    ctx.beginPath();
    ctx.arc(px, py, 2.6 * Math.max(cellW, cellH), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(120, 140, 190, 0.28)";
    ctx.fill();
    ctx.font = `bold ${Math.ceil(cellH * 1.2)}px "Menlo", "Consolas", monospace`;
    ctx.fillStyle = "rgba(200, 215, 245, 0.9)";
    ctx.fillText("≋", px, py);
  }
}

// Hosts in the field: a culture's letter on a blood-dark field, so a marching
// war reads at a glance against the quiet letters of settled life
function drawArmies(
  world: World,
  ctx: CanvasRenderingContext2D,
  cellW: number,
  cellH: number,
  followed: string | null,
): void {
  for (const army of world.armies) {
    const px = (army.x + 0.5) * cellW;
    const py = (army.y + 0.5) * cellH;
    ctx.globalAlpha = !followed || army.culture === followed ? 1 : 0.3;
    ctx.fillStyle = "#5a1010";
    ctx.fillRect(Math.floor(army.x * cellW), Math.floor(army.y * cellH), Math.ceil(cellW), Math.ceil(cellH));
    ctx.font = `bold ${Math.ceil(cellH * 1.1)}px "Menlo", "Consolas", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const glyph = army.culture.charAt(0).toUpperCase();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#e04444";
    ctx.strokeText(glyph, px, py);
    ctx.fillStyle = world.cultures.get(army.culture)?.color ?? "#fff";
    ctx.fillText(glyph, px, py);
  }
  ctx.globalAlpha = 1;
}

// Nations wear their names on the map: each polity's title hangs over its
// greatest settlement, in its own color. Peoples without nationhood stay
// unlabeled — the map itself shows who has become a power.
function drawPolityLabels(
  world: World,
  ctx: CanvasRenderingContext2D,
  cellW: number,
  cellH: number,
  followed: string | null,
): void {
  const seats = new Map<string, import("./world").Pop>();
  for (const pop of world.pops) {
    if (!cultureOf(world, pop).polity) continue;
    const seat = seats.get(pop.culture);
    if (!seat || pop.count > seat.count) seats.set(pop.culture, pop);
  }
  if (!seats.size) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = `600 ${Math.max(9, Math.ceil(cellH * 0.72))}px "Menlo", "Consolas", monospace`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(10, 12, 16, 0.85)";
  for (const [name, seat] of seats) {
    const culture = world.cultures.get(name)!;
    const label = polityName(culture).toUpperCase();
    const half = ctx.measureText(label).width / 2;
    const px = Math.min(world.width * cellW - half - 4, Math.max(half + 4, (seat.x + 0.5) * cellW));
    const py = Math.max(cellH * 1.4, (seat.y - 0.7) * cellH);
    ctx.globalAlpha = followed && name !== followed ? 0.12 : 0.85;
    ctx.strokeText(label, px, py);
    ctx.fillStyle = culture.color;
    ctx.fillText(label, px, py);
  }
  ctx.globalAlpha = 1;
}

// Roads: thin dust-colored threads binding settlements, drawn under
// everything that lives — segments between adjacent road cells
function drawRoads(world: World, ctx: CanvasRenderingContext2D, cellW: number, cellH: number): void {
  ctx.lineWidth = Math.max(1, Math.min(cellW, cellH) * 0.12);
  const road = (x: number, y: number): number =>
    x >= 0 && x < world.width && y >= 0 && y < world.height ? world.roads[y * world.width + x] : 0;
  // Three passes by wear: kept roads read solid, neglected ones faint,
  // and abandoned ones are ghosts the grass is taking back
  const passes: [number, number, string][] = [
    [40, 255, "rgba(188, 158, 108, 0.42)"],
    [15, 39, "rgba(188, 158, 108, 0.22)"],
    [1, 14, "rgba(188, 158, 108, 0.1)"],
  ];
  for (const [lo, hi, style] of passes) {
    ctx.strokeStyle = style;
    ctx.beginPath();
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const w = road(x, y);
        if (w < lo || w > hi) continue;
        const px = (x + 0.5) * cellW;
        const py = (y + 0.5) * cellH;
        // Orthogonal joins always; a diagonal only when no orthogonal path
        // makes the same connection — this is what kills the crosshatch
        for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
          if (road(x + dx, y + dy) > 0) {
            ctx.moveTo(px, py);
            ctx.lineTo((x + dx + 0.5) * cellW, (y + dy + 0.5) * cellH);
          }
        }
        if (road(x + 1, y + 1) > 0 && !road(x + 1, y) && !road(x, y + 1)) {
          ctx.moveTo(px, py);
          ctx.lineTo((x + 1.5) * cellW, (y + 1.5) * cellH);
        }
        if (road(x - 1, y + 1) > 0 && !road(x - 1, y) && !road(x, y + 1)) {
          ctx.moveTo(px, py);
          ctx.lineTo((x - 0.5) * cellW, (y + 1.5) * cellH);
        }
      }
    }
    ctx.stroke();
  }
}

// A small portrait of a world, one filled rect per cell — the genesis screen
// shows these so the god may choose the world worth shaping
export function renderThumbnail(world: World, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  const cw = canvas.width / world.width;
  const ch = canvas.height / world.height;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      ctx.fillStyle = terrainColor(world, idx(world, x, y));
      ctx.fillRect(Math.floor(x * cw), Math.floor(y * ch), Math.ceil(cw), Math.ceil(ch));
    }
  }
}

export type Overlay = "terrain" | "temperature" | "moisture" | "fertility" | "wind";

const ORE_COLORS = ["", "rgb(158, 96, 64)", "rgb(190, 126, 74)", "rgb(216, 178, 60)", "rgb(176, 96, 208)"];

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
    case "wind":
      // Moisture riding the winds: dark where the air is wrung dry
      return ramp(world.windHumidity[i] / C.HUMIDITY_CAP, [24, 28, 44], [96, 210, 230], false);
    default:
      return terrainColor(world, i);
  }
}

// Band arrows showing which way the winds blow at each latitude
function drawWindArrows(world: World, ctx: CanvasRenderingContext2D, cellW: number, cellH: number): void {
  ctx.strokeStyle = "#ffffffaa";
  ctx.fillStyle = "#ffffffaa";
  ctx.lineWidth = 1.5;
  for (let y = 3; y < world.height; y += 6) {
    const lat = Math.abs((2 * (y + 0.5)) / world.height - 1);
    const westerly = lat > 0.3 && lat < 0.75;
    const dir = westerly ? 1 : -1;
    for (let x = 8; x < world.width - 8; x += 16) {
      const px = (x + 0.5) * cellW;
      const py = (y + 0.5) * cellH;
      const len = cellW * 5;
      ctx.beginPath();
      ctx.moveTo(px - (dir * len) / 2, py);
      ctx.lineTo(px + (dir * len) / 2, py);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + (dir * len) / 2, py);
      ctx.lineTo(px + (dir * len) / 2 - dir * cellW, py - cellH * 0.35);
      ctx.lineTo(px + (dir * len) / 2 - dir * cellW, py + cellH * 0.35);
      ctx.fill();
    }
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
  if (world.lakes[i]) return { ch: "≈", color: "rgb(80, 150, 205)" };
  if (elev < C.SEA_LEVEL) {
    const depth = elev / C.SEA_LEVEL;
    const color = `rgb(${lerp(30, 60, depth) | 0}, ${lerp(70, 130, depth) | 0}, ${lerp(140, 200, depth) | 0})`;
    return { ch: depth < 0.55 ? "~" : "≈", color };
  }
  if (world.fire[i] > 0) {
    // The page itself burns
    const f = fireColor(world.fire[i]);
    return { ch: world.fire[i] > 0.5 ? "▲" : "*", color: `rgb(${f.r}, ${f.g | 0}, ${f.b | 0})` };
  }
  // The bones of a dead settlement stand in the grass
  if (world.ruins.has(i)) return { ch: "Ω", color: "rgb(148, 140, 126)" };
  if (world.isRiver[i]) return { ch: "~", color: "rgb(96, 168, 220)" };
  // Each biome speaks its own glyph in its own colors
  const style = BIOME_STYLE[biomeIdAt(world, i)];
  const [br, bg, bb] = style.color;
  const fert = Math.min(1, world.meanFertility[i]);
  let r = lerp(br, br * 0.6, fert * 0.6);
  let g = lerp(bg, Math.min(255, bg * 1.2), fert * 0.6);
  let b = lerp(bb, bb * 0.6, fert * 0.6);
  const relief = 0.8 + ((elev - C.SEA_LEVEL) / (1 - C.SEA_LEVEL)) * 0.4;
  r *= relief;
  g *= relief;
  b *= relief;
  const t = world.meanTemperature[i];
  if (t < C.SNOW_TEMP) {
    const snow = Math.min(1, (C.SNOW_TEMP - t) / 10);
    r = lerp(r, 235, snow);
    g = lerp(g, 240, snow);
    b = lerp(b, 248, snow);
  } else if (t > C.SCORCH_TEMP) {
    // Char: the page burns where a god's anger lingers
    const scorch = Math.min(1, (t - C.SCORCH_TEMP) / 25);
    r = lerp(r, lerp(122, 46, scorch), scorch);
    g = lerp(g, lerp(82, 34, scorch), scorch);
    b = lerp(b, lerp(48, 28, scorch), scorch);
  }
  // Burned ground reads as ash and cinders until it heals
  const char = world.char[i];
  if (char > 0.15) {
    return {
      ch: char > 0.55 ? "▒" : ",",
      color: `rgb(${lerp(r, 64, char) | 0}, ${lerp(g, 58, char) | 0}, ${lerp(b, 54, char) | 0})`,
    };
  }
  // A vein glints through the rock
  if (world.resources[i]) {
    return { ch: style.glyph, color: ORE_COLORS[world.resources[i]] };
  }
  const color = `rgb(${Math.min(255, r) | 0}, ${Math.min(255, g) | 0}, ${Math.min(255, b) | 0})`;
  return { ch: style.glyph, color };
}

function renderAscii(
  world: World,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  followed: string | null,
): void {
  const cellW = canvas.width / world.width;
  const cellH = canvas.height / world.height;
  ctx.fillStyle = "#0a0c10";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Held lands sit behind the text like illumination on a manuscript,
  // edged where dominion ends — and the roads thread through beneath
  drawTerritory(world, ctx, cellW, cellH, followed, 0.14);
  drawRoads(world, ctx, cellW, cellH);

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

  // Pops are their culture's initial: uppercase settled, lowercase on the move.
  // Letter size follows settlement size — camps whisper, cities shout.
  for (const { pop, ox, oy, stacked } of spreadPops(world)) {
    const px = (pop.x + 0.5 + ox) * cellW;
    const py = (pop.y + 0.5 + oy) * cellH;
    ctx.globalAlpha = !followed || pop.culture === followed ? 1 : 0.3;
    if (pop.plagueSeasons > 0) {
      ctx.fillStyle = "#3d1454";
      ctx.fillRect(Math.floor(pop.x * cellW), Math.floor(pop.y * cellH), Math.ceil(cellW), Math.ceil(cellH));
    } else if (pop.inFamine) {
      ctx.fillStyle = "#7a1414";
      ctx.fillRect(Math.floor(pop.x * cellW), Math.floor(pop.y * cellH), Math.ceil(cellW), Math.ceil(cellH));
    }
    const tier = tierOf(pop.count);
    const size = stacked ? 0.75 : [0.8, 1.05, 1.35, 1.65][tier];
    ctx.font = `bold ${Math.ceil(cellH * size)}px "Menlo", "Consolas", monospace`;
    const letter = pop.culture.charAt(0);
    const glyph = pop.target ? letter.toLowerCase() : letter.toUpperCase();
    ctx.fillStyle = cultureOf(world, pop).color;
    ctx.fillText(glyph, px, py);
    if (tier === 3 && !stacked) {
      // A city catches the light
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#ffffffbb";
      ctx.strokeText(glyph, px, py);
    }
  }
  ctx.globalAlpha = 1;
  drawMonuments(world, ctx, cellW, cellH);
  drawArmies(world, ctx, cellW, cellH, followed);
  drawBeasts(world, ctx, cellW, cellH);
  drawStorms(world, ctx, cellW, cellH);
  drawPolityLabels(world, ctx, cellW, cellH, followed);
}

// A pulsing marker pinpointing where a hovered chronicle entry happened
function drawFlash(
  ctx: CanvasRenderingContext2D,
  flash: { x: number; y: number },
  cellW: number,
  cellH: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
  const r = Math.max(cellW, cellH) * (1.5 + pulse * 1.2);
  const px = (flash.x + 0.5) * cellW;
  const py = (flash.y + 0.5) * cellH;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = 0.55 + pulse * 0.45;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, r * 0.45, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Returns true while an animation is running and another frame is needed
export function render(
  world: World,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  overlay: Overlay = "terrain",
  mode: RenderMode = "tiles",
  followed: string | null = null,
  flash: { x: number; y: number } | null = null,
): boolean {
  const cellW = canvas.width / world.width;
  const cellH = canvas.height / world.height;

  if (mode === "ascii" && overlay === "terrain") {
    renderAscii(world, canvas, ctx, followed);
    drawRipples(ctx, cellW, cellH);
    if (flash) drawFlash(ctx, flash, cellW, cellH);
    return ripples.length > 0 || flash !== null;
  }

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      ctx.fillStyle =
        overlay === "terrain" && world.resources[idx(world, x, y)]
          ? ORE_COLORS[world.resources[idx(world, x, y)]]
          : overlayColor(world, idx(world, x, y), overlay);
      // Overdraw by rounding out to avoid seams between cells
      ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW), Math.ceil(cellH));
    }
  }

  // Held lands tinted and bordered — terrain view only; the debug overlays
  // should show raw data
  if (overlay === "terrain") {
    drawTerritory(world, ctx, cellW, cellH, followed, TERRITORY_ALPHA);
    drawRoads(world, ctx, cellW, cellH);
  }

  for (const { pop, ox, oy, stacked } of spreadPops(world)) {
    const px = (pop.x + 0.5 + ox) * cellW;
    const py = (pop.y + 0.5 + oy) * cellH;
    const radius = Math.min(cellW * 2.2, 2 + Math.sqrt(pop.count) / 14) * (stacked ? 0.65 : 1);
    ctx.globalAlpha = !followed || pop.culture === followed ? 1 : 0.3;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = cultureOf(world, pop).color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = pop.plagueSeasons > 0 ? "#b14ad6" : pop.inFamine ? "#000" : "#ffffffcc";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (overlay === "terrain") {
    drawRuins(world, ctx, cellW, cellH);
    drawMonuments(world, ctx, cellW, cellH);
    drawArmies(world, ctx, cellW, cellH, followed);
    drawStorms(world, ctx, cellW, cellH);
    drawBeasts(world, ctx, cellW, cellH);
    drawPolityLabels(world, ctx, cellW, cellH, followed);
  }
  if (overlay === "wind") drawWindArrows(world, ctx, cellW, cellH);

  drawRipples(ctx, cellW, cellH);
  if (flash) drawFlash(ctx, flash, cellW, cellH);
  return ripples.length > 0 || flash !== null;
}
