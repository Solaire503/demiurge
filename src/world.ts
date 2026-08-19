import * as C from "./constants";
import type { Rng } from "./rng";
import { mulberry32 } from "./rng";
import { cultureName } from "./names";

export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;

export interface Pop {
  id: number;
  culture: string;
  color: string;
  x: number;
  y: number;
  count: number;
  foodSat: number; // smoothed food satisfaction, ~0..1.5
  safety: number; // 0..1 comfort with the local climate
  inFamine: boolean;
  target: { x: number; y: number } | null; // migration destination
}

// 1 = local color (settlings), 2 = struggles and journeys, 3 = the big beats
export type Importance = 1 | 2 | 3;

export interface ChronicleEntry {
  year: number;
  season: number;
  text: string;
  importance: Importance;
}

export interface World {
  width: number;
  height: number;
  elevation: Float32Array;
  moisture: Float32Array; // static: latitude bands + noise
  baseTemperature: Float32Array; // annual mean from latitude + elevation
  meanTemperature: Float32Array; // base + divine offset (no season) — pops judge by this
  temperature: Float32Array; // mean + seasonal swing — plants and snow follow this
  tempOffset: Float32Array; // divine warmth/chill, relaxes toward 0
  fertility: Float32Array; // derived each season from temperature + moisture
  fertilityBonus: Float32Array; // divine blessing, decays slowly
  claims: Uint16Array; // how many pops work each cell, rebuilt each season
  cultureMilestones: Map<string, number>; // next unrecorded C.MILESTONES index per culture
  pops: Pop[];
  year: number;
  season: number;
  events: ChronicleEntry[];
  nextPopId: number;
  rng: Rng;
}

export function idx(world: World, x: number, y: number): number {
  return y * world.width + x;
}

export function isWater(world: World, x: number, y: number): boolean {
  return world.elevation[idx(world, x, y)] < C.SEA_LEVEL;
}

export function logEvent(world: World, text: string, importance: Importance = 2): void {
  world.events.push({ year: world.year, season: world.season, text, importance });
}

// 0 at equator (middle row), 1 at either pole
function latitude(world: World, y: number): number {
  return Math.abs((2 * (y + 0.5)) / world.height - 1);
}

function generateElevation(world: World): void {
  const rng = world.rng;
  // Layered sines with random phases: dummy terrain, but varied per seed
  const layers = Array.from({ length: 5 }, (_, i) => ({
    fx: (i + 1) * 1.7 + rng() * 1.5,
    fy: (i + 1) * 1.3 + rng() * 1.5,
    px: rng() * Math.PI * 2,
    py: rng() * Math.PI * 2,
    amp: 1 / (i + 1.5),
  }));
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const nx = x / world.width;
      const ny = y / world.height;
      let v = 0;
      for (const l of layers) {
        v += Math.sin(nx * Math.PI * l.fx + l.px) * Math.cos(ny * Math.PI * l.fy + l.py) * l.amp;
      }
      world.elevation[idx(world, x, y)] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  for (let i = 0; i < world.elevation.length; i++) {
    world.elevation[i] = (world.elevation[i] - min) / (max - min);
  }
}

function generateMoisture(world: World): void {
  const rng = world.rng;
  const phase = rng() * Math.PI * 2;
  for (let y = 0; y < world.height; y++) {
    const lat = latitude(world, y);
    // Wet equator, dry subtropical band around lat 0.4, drier again at the poles
    const desertBand = Math.exp(-((lat - 0.4) ** 2) / (2 * 0.12 ** 2));
    const polarDrying = Math.max(0, (lat - 0.7) / 0.3) * 0.25;
    const band = 0.78 - 0.45 * desertBand - polarDrying;
    for (let x = 0; x < world.width; x++) {
      const noise =
        Math.sin((x / world.width) * Math.PI * 5.3 + phase) *
        Math.sin((y / world.height) * Math.PI * 4.1 + phase * 1.7) *
        0.15;
      world.moisture[idx(world, x, y)] = Math.min(1, Math.max(0.05, band + noise));
    }
  }
}

function computeBaseTemperature(world: World): void {
  for (let y = 0; y < world.height; y++) {
    const lat = latitude(world, y);
    const seaLevelTemp = C.EQUATOR_TEMP + (C.POLE_TEMP - C.EQUATOR_TEMP) * lat;
    for (let x = 0; x < world.width; x++) {
      const i = idx(world, x, y);
      const heightAboveSea = Math.max(0, world.elevation[i] - C.SEA_LEVEL) / (1 - C.SEA_LEVEL);
      world.baseTemperature[i] = seaLevelTemp - heightAboveSea * C.LAPSE_RATE;
    }
  }
}

// Seasonal multiplier: +1 in summer, -1 in winter (flipped in the southern hemisphere)
function seasonPhase(world: World, y: number): number {
  const phases = [0, 1, 0, -1];
  const southern = y >= world.height / 2;
  return phases[world.season] * (southern ? -1 : 1);
}

export function fertilityFromClimate(temp: number, moist: number, elev: number): number {
  if (elev < C.SEA_LEVEL) return 0;
  const tempFactor = Math.exp(-((temp - C.FERT_OPTIMAL_TEMP) ** 2) / (2 * C.FERT_TEMP_TOLERANCE ** 2));
  const rock = elev > C.MOUNTAIN_ROCK_START ? Math.max(0, 1 - (elev - C.MOUNTAIN_ROCK_START) / (1 - C.MOUNTAIN_ROCK_START)) : 1;
  return tempFactor * moist * rock;
}

export function recomputeClimate(world: World): void {
  const t = world.year + world.season / 4;
  let globalDrift = 0;
  for (const c of C.CLIMATE_CYCLES) {
    globalDrift += c.amp * Math.sin((2 * Math.PI * t) / c.period);
  }
  for (let y = 0; y < world.height; y++) {
    const lat = latitude(world, y);
    const swing = C.SEASON_SWING_BASE + C.SEASON_SWING_POLAR * lat;
    const seasonal = seasonPhase(world, y) * swing;
    for (let x = 0; x < world.width; x++) {
      const i = idx(world, x, y);
      world.meanTemperature[i] = world.baseTemperature[i] + globalDrift + world.tempOffset[i];
      world.temperature[i] = world.meanTemperature[i] + seasonal;
      const base = fertilityFromClimate(world.temperature[i], world.moisture[i], world.elevation[i]);
      world.fertility[i] = Math.min(1.5, base + world.fertilityBonus[i]);
    }
  }
}

// Sum of fertility in the 3x3 around a cell — the land a pop works.
// When shared, each cell's yield is split among every pop that claims it.
export function harvestAround(world: World, x: number, y: number, shared = false): number {
  let sum = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx < 0 || cx >= world.width || cy < 0 || cy >= world.height) continue;
      const i = idx(world, cx, cy);
      sum += shared ? world.fertility[i] / Math.max(1, world.claims[i]) : world.fertility[i];
    }
  }
  return sum;
}

const NS = ["north", "", "south"];
const EW = ["west", "", "east"];

export function describeLocation(world: World, x: number, y: number): string {
  const ns = NS[Math.min(2, Math.floor((y / world.height) * 3))];
  const ew = EW[Math.min(2, Math.floor((x / world.width) * 3))];
  if (!ns && !ew) return "the heartlands";
  if (ns && ew) return `the ${ns}${ew}`;
  return `the ${ns || ew}`;
}

export function describeDirection(dx: number, dy: number): string {
  const ns = dy < 0 ? "north" : dy > 0 ? "south" : "";
  const ew = dx < 0 ? "west" : dx > 0 ? "east" : "";
  return ns + ew || "nearby";
}

const CULTURE_COLORS = ["#e4572e", "#f0c419", "#9b5de5", "#00bbf9", "#f15bb5", "#7bd389"];

function seedPops(world: World): void {
  // Rank land cells by harvest * comfort, then settle the best with spacing
  const candidates: { x: number; y: number; score: number }[] = [];
  for (let y = 2; y < world.height - 2; y++) {
    for (let x = 2; x < world.width - 2; x++) {
      if (isWater(world, x, y)) continue;
      const t = world.meanTemperature[idx(world, x, y)];
      const comfort = Math.max(0, 1 - Math.max(0, Math.abs(t - C.COMFORT_TEMP) - C.COMFORT_TOLERANCE) / C.COMFORT_FALLOFF);
      candidates.push({ x, y, score: harvestAround(world, x, y) * comfort });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const minSpacing = 18;
  for (const c of candidates) {
    if (world.pops.length >= C.STARTING_POPS) break;
    if (world.pops.some((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) < minSpacing)) continue;
    const pop: Pop = {
      id: world.nextPopId++,
      culture: cultureName(world.rng),
      color: CULTURE_COLORS[world.pops.length % CULTURE_COLORS.length],
      x: c.x,
      y: c.y,
      count: C.STARTING_COUNT,
      foodSat: 1,
      safety: 1,
      inFamine: false,
      target: null,
    };
    world.pops.push(pop);
    world.cultureMilestones.set(pop.culture, 0);
    logEvent(world, `The ${pop.culture} wake in ${describeLocation(world, c.x, c.y)}.`, 3);
  }
}

export function createWorld(seed: number): World {
  const size = C.GRID_WIDTH * C.GRID_HEIGHT;
  const world: World = {
    width: C.GRID_WIDTH,
    height: C.GRID_HEIGHT,
    elevation: new Float32Array(size),
    moisture: new Float32Array(size),
    baseTemperature: new Float32Array(size),
    meanTemperature: new Float32Array(size),
    temperature: new Float32Array(size),
    tempOffset: new Float32Array(size),
    fertility: new Float32Array(size),
    fertilityBonus: new Float32Array(size),
    claims: new Uint16Array(size),
    cultureMilestones: new Map(),
    pops: [],
    year: 1,
    season: 0,
    events: [],
    nextPopId: 1,
    rng: mulberry32(seed),
  };
  generateElevation(world);
  generateMoisture(world);
  computeBaseTemperature(world);
  recomputeClimate(world);
  logEvent(world, "In the beginning, the world lay quiet.", 3);
  seedPops(world);
  return world;
}
