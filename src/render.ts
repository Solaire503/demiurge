import * as C from "./constants";
import type { World } from "./world";
import { idx } from "./world";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function terrainColor(world: World, i: number): string {
  const elev = world.elevation[i];
  if (elev < C.SEA_LEVEL) {
    const depth = elev / C.SEA_LEVEL; // 0 deep, 1 shore
    return `rgb(${lerp(8, 28, depth)}, ${lerp(30, 84, depth)}, ${lerp(74, 138, depth)})`;
  }
  const fert = Math.min(1, world.fertility[i]);
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

export function render(
  world: World,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  overlay: Overlay = "terrain",
): void {
  const cellW = canvas.width / world.width;
  const cellH = canvas.height / world.height;

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      ctx.fillStyle = overlayColor(world, idx(world, x, y), overlay);
      // Overdraw by rounding out to avoid seams between cells
      ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW), Math.ceil(cellH));
    }
  }

  for (const pop of world.pops) {
    const px = (pop.x + 0.5) * cellW;
    const py = (pop.y + 0.5) * cellH;
    const radius = Math.min(cellW * 2.2, 2 + Math.sqrt(pop.count) / 14);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = pop.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = pop.inFamine ? "#000" : "#ffffffcc";
    ctx.stroke();
  }
}
