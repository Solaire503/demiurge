import * as C from "./constants";
import type { Rng } from "./rng";
import { mulberry32 } from "./rng";
import { cultureName } from "./names";
import { fbm, ridgedFbm } from "./noise";
import { heroName, leaderName } from "./names";
import { pick } from "./rng";

const TEMPERAMENTS = ["warlike", "peaceable", "ambitious", "cunning"] as const;

// Leaders are born grown (25-40); their temperament steers their people's dice
export function mintFigure(world: World, culture: string, role: "leader" | "hero"): Figure {
  const temperament = pick(world.rng, TEMPERAMENTS);
  const figure: Figure = {
    id: world.nextFigureId++,
    name: role === "leader" ? leaderName(world.rng, temperament) : heroName(world.rng),
    culture,
    role,
    temperament,
    born: world.year - 25 - Math.floor(world.rng() * 15),
    alive: true,
  };
  world.figures.push(figure);
  return figure;
}

export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;

import type { Temperament } from "./names";

// A named figure persists: they lead, fight, shape their people's choices,
// and their deaths are history. Not flavor — entities.
export interface Figure {
  id: number;
  name: string; // "Vekor the Grim"
  culture: string;
  role: "leader" | "hero";
  temperament: Temperament;
  born: number; // year
  alive: boolean;
}

export interface Culture {
  name: string;
  color: string;
  comfortTemp: number; // adapted ideal °C — drifts toward the home climate
  parent: string | null; // culture this one schismed from
  adaptedNote: -1 | 0 | 1; // which extreme (cold/none/heat) the chronicle last noted
}

export interface Pop {
  id: number;
  culture: string; // key into world.cultures
  x: number;
  y: number;
  count: number;
  foodSat: number; // smoothed food satisfaction, ~0..1.5
  safety: number; // 0..1 comfort with the local climate
  inFamine: boolean;
  isolation: number; // consecutive seasons spent far from all kin
  feud: { rivalId: number; seasons: number } | null; // standoff with a rival pop
  plagueSeasons: number; // seasons of pestilence remaining, 0 when healthy
  tier: number; // settlement tier last seen: 0 camp, 1 village, 2 town, 3 city
  target: { x: number; y: number } | null; // migration destination
}

// 1 = local color (settlings), 2 = struggles and journeys, 3 = the big beats
export type Importance = 1 | 2 | 3;

export interface ChronicleEntry {
  year: number;
  season: number;
  text: string;
  importance: Importance;
  subjects?: string[]; // cultures this entry is about — powers follow-a-people
  at?: { x: number; y: number }; // where it happened — powers map pinpointing
}

export interface World {
  width: number;
  height: number;
  elevation: Float32Array;
  moisture: Float32Array; // static: rain carried inland by prevailing winds
  lakes: Uint8Array; // 1 where rivers pooled in a depression
  isRiver: Uint8Array; // 1 where accumulated flow runs to the sea
  coastal: Uint8Array; // 1 where land touches water — the sea feeds
  windHumidity: Float32Array; // moisture riding the winds, for the debug overlay
  resources: Uint8Array; // 0 none, else index into RESOURCE_NAMES — veins in the rock
  moistureSeed: number; // noise seed reused so rainfall recomputes deterministically
  rainScale: number; // fixed at genesis so warm ages read as genuinely wetter
  riverLog: Map<string, number>; // culture -> year a river change was last chronicled
  baseTemperature: Float32Array; // annual mean from latitude + elevation
  meanTemperature: Float32Array; // base + divine offset (no season) — pops judge by this
  temperature: Float32Array; // mean + seasonal swing — plants and snow follow this
  tempOffset: Float32Array; // divine warmth/chill, relaxes toward 0
  fertility: Float32Array; // derived each season from temperature + moisture — what pops harvest
  meanFertility: Float32Array; // annual-basis fertility — what renderers draw, so the map doesn't flicker
  fertilityBonus: Float32Array; // divine blessing, decays slowly
  claims: Uint16Array; // how many pops work each cell, rebuilt each season
  cultures: Map<string, Culture>;
  cultureMilestones: Map<string, number>; // next unrecorded C.MILESTONES index per culture
  contestMemory: Map<string, number>; // culture-pair key -> year a contest was last chronicled
  truces: Map<string, number>; // culture-pair key -> year the truce expires
  movementLog: Map<string, number>; // culture -> year routine movement was last chronicled
  plagueLog: Map<string, number>; // culture -> year an outbreak was last chronicled
  unwoken: { pop: Pop; year: number }[]; // seeded peoples who have not yet woken
  figures: Figure[];
  nextFigureId: number;
  grudges: Map<string, number>; // culture-pair key -> accumulated hatred from battles
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
  const i = idx(world, x, y);
  return world.elevation[i] < C.SEA_LEVEL || world.lakes[i] === 1;
}

export function logEvent(
  world: World,
  text: string,
  importance: Importance = 2,
  extra?: { subjects?: string[]; at?: { x: number; y: number } },
): void {
  world.events.push({
    year: world.year,
    season: world.season,
    text,
    importance,
    subjects: extra?.subjects,
    at: extra?.at,
  });
}

// 0 at equator (middle row), 1 at either pole
function latitude(world: World, y: number): number {
  return Math.abs((2 * (y + 0.5)) / world.height - 1);
}

function noiseSeed(rng: Rng): number {
  return Math.floor(rng() * 0x7fffffff);
}

function generateElevation(world: World): void {
  const continentSeed = noiseSeed(world.rng);
  const ridgeSeed = noiseSeed(world.rng);
  const CONTINENT_SCALE = 1 / 26; // cells per continental noise feature
  const RIDGE_SCALE = 1 / 30;
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const base = fbm(x * CONTINENT_SCALE, y * CONTINENT_SCALE, continentSeed, 5);
      // Ridges weighted by the continental base: mountain chains rise on land, not mid-ocean
      const ridge = ridgedFbm(x * RIDGE_SCALE, y * RIDGE_SCALE, ridgeSeed, 4);
      const v = base + ridge * base * 0.65;
      world.elevation[idx(world, x, y)] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  // Normalize, then sink the map rim so the world reads as bounded by sea
  const FALLOFF = 6; // cells
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const i = idx(world, x, y);
      // The power curve sinks lowlands, trading land for ocean and inland seas
      let e = ((world.elevation[i] - min) / (max - min)) ** 1.45;
      const edge = Math.min(x, world.width - 1 - x, y, world.height - 1 - y);
      if (edge < FALLOFF) {
        const t = edge / FALLOFF;
        e *= 0.15 + 0.85 * t * t * (3 - 2 * t);
      }
      world.elevation[i] = e;
    }
  }
}

// Global temperature drift from the long climate cycles — warm ages and cold ages
export function globalDrift(world: World): number {
  const t = world.year + world.season / 4;
  let drift = 0;
  for (const c of C.CLIMATE_CYCLES) {
    drift += c.amp * Math.sin((2 * Math.PI * t) / c.period);
  }
  return drift;
}

// Prevailing winds carry evaporated ocean moisture inland; rising ground wrings
// it out as rain, leaving rain shadows behind mountains and deserts deep inland.
// Re-runnable: rainfall follows the living climate, including divine warmth.
export function simulateWaterCycle(world: World): void {
  const { width, height } = world;
  const drift = globalDrift(world);
  const rain = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const lat = latitude(world, y);
    // Earth-like bands: trade easterlies near the equator, westerlies in the
    // middle latitudes, polar easterlies at the crown of the world
    const westerly = lat > 0.3 && lat < 0.75;
    const descent = Math.exp(-((lat - 0.38) ** 2) / (2 * 0.1 ** 2));
    const rainRate = C.RAIN_RATE * (1 - C.SUBTROPIC_DRYING * descent);
    let humidity = 0;
    let prevElev = C.SEA_LEVEL;
    const x0 = westerly ? 0 : width - 1;
    const step = westerly ? 1 : -1;
    for (let k = 0, x = x0; k < width; k++, x += step) {
      const i = idx(world, x, y);
      const e = world.elevation[i];
      if (e < C.SEA_LEVEL) {
        const seaTemp = world.baseTemperature[i] + world.tempOffset[i] + drift;
        const warmth = Math.max(0, (seaTemp + 5) / 35);
        humidity = Math.min(C.HUMIDITY_CAP, humidity + warmth * C.EVAPORATION_RATE);
        prevElev = C.SEA_LEVEL;
        world.windHumidity[i] = humidity;
        continue;
      }
      const uplift = Math.max(0, e - prevElev);
      const fall = Math.min(humidity, humidity * (rainRate + uplift * C.OROGRAPHIC_RAIN));
      humidity -= fall;
      rain[i] = fall;
      prevElev = e;
      world.windHumidity[i] = humidity;
    }
  }

  // Normalize land rainfall against a high percentile so one orographic
  // downpour doesn't parch the rest of the world by comparison. The scale is
  // fixed at genesis so climate ages read as genuinely wetter or drier.
  if (world.rainScale === 0) {
    const landRain = [];
    for (let i = 0; i < rain.length; i++) {
      if (world.elevation[i] >= C.SEA_LEVEL) landRain.push(rain[i]);
    }
    landRain.sort((a, b) => a - b);
    world.rainScale = Math.max(1e-6, landRain[Math.floor(landRain.length * 0.85)]);
  }
  for (let i = 0; i < rain.length; i++) {
    world.moisture[i] = Math.min(1, Math.max(0.03, rain[i] / world.rainScale));
  }
  for (let pass = 0; pass < C.MOISTURE_BLUR_PASSES; pass++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(world, x, y);
        world.moisture[i] =
          world.moisture[i] * 0.5 + world.moisture[i - width] * 0.25 + world.moisture[i + width] * 0.25;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(world, x, y);
      const noise = (fbm(x / 12, y / 12, world.moistureSeed, 3) - 0.5) * 2 * C.MOISTURE_NOISE;
      world.moisture[i] = Math.min(1, Math.max(0.03, world.moisture[i] + noise));
    }
  }
}

// Rain runs downhill: each land cell drains to its lowest neighbor, flow
// accumulates into rivers, and water with nowhere to go pools into lakes.
// Re-runnable: as rainfall shifts, rivers swell, shrink, and change course.
export function carveRivers(world: World): void {
  const { width, height } = world;
  world.isRiver.fill(0);
  world.lakes.fill(0);
  const flow = new Float32Array(width * height);
  const order: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(world, x, y);
      if (world.elevation[i] >= C.SEA_LEVEL) {
        flow[i] = world.moisture[i];
        order.push(i);
      }
    }
  }
  order.sort((a, b) => world.elevation[b] - world.elevation[a]);
  for (const i of order) {
    const x = i % width;
    const y = (i / width) | 0;
    let lowest = -1;
    let lowestElev = world.elevation[i];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const j = ny * width + nx;
        if (world.elevation[j] < lowestElev) {
          lowestElev = world.elevation[j];
          lowest = j;
        }
      }
    }
    if (lowest !== -1) {
      flow[lowest] += flow[i];
      continue;
    }
    // A depression: water seeks lower ground nearby and tunnels through;
    // only truly landlocked pits become lakes
    let outlet = -1;
    let outletElev = world.elevation[i];
    for (let r = 2; r <= 4 && outlet === -1; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const j = ny * width + nx;
          if (world.elevation[j] < outletElev) {
            outletElev = world.elevation[j];
            outlet = j;
          }
        }
      }
    }
    if (outlet !== -1) flow[outlet] += flow[i];
    else world.lakes[i] = 1;
  }
  for (const i of order) {
    if (!world.lakes[i] && flow[i] > C.RIVER_THRESHOLD) world.isRiver[i] = 1;
  }

  // Land beside rivers and lakes drinks from them
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(world, x, y);
      if (world.elevation[i] < C.SEA_LEVEL || world.isRiver[i] || world.lakes[i]) continue;
      let wet = false;
      for (let dy = -1; dy <= 1 && !wet; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const j = ny * width + nx;
          if (world.isRiver[j] || world.lakes[j]) {
            wet = true;
            break;
          }
        }
      }
      if (wet) world.moisture[i] = Math.min(1, world.moisture[i] + C.RIVER_MOISTURE_BONUS);
    }
  }
}

export const RESOURCE_NAMES = ["", "iron", "copper", "gold", "gems"] as const;

// Ore sleeps in the high country: veins scattered by elevation and chance,
// clustered so a strike is worth following
function generateResources(world: World): void {
  const { width, height } = world;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(world, x, y);
      const e = world.elevation[i];
      if (e < C.VEIN_MIN_ELEVATION || world.resources[i]) continue;
      const chance = C.VEIN_CHANCE * ((e - C.VEIN_MIN_ELEVATION) / (1 - C.VEIN_MIN_ELEVATION) + 0.3);
      if (world.rng() >= chance) continue;
      const roll = world.rng();
      const kind = roll < 0.4 ? 1 : roll < 0.7 ? 2 : roll < 0.9 ? 3 : 4;
      world.resources[i] = kind;
      // The vein runs on: a neighbor or two shares the strike
      for (let n = 0; n < 2; n++) {
        if (world.rng() < 0.5) continue;
        const nx = x + Math.floor(world.rng() * 3) - 1;
        const ny = y + Math.floor(world.rng() * 3) - 1;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const j = ny * width + nx;
        if (world.elevation[j] >= C.VEIN_MIN_ELEVATION) world.resources[j] = kind;
      }
    }
  }
}

// Where land meets water, the sea feeds — computed after lakes are known
function computeCoastal(world: World): void {
  const { width, height } = world;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(world, x, y);
      if (isWater(world, x, y)) continue;
      let coast = 0;
      for (let dy = -1; dy <= 1 && !coast; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (isWater(world, nx, ny)) {
            coast = 1;
            break;
          }
        }
      }
      world.coastal[i] = coast;
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
  const drift = globalDrift(world);
  for (let y = 0; y < world.height; y++) {
    const lat = latitude(world, y);
    const swing = C.SEASON_SWING_BASE + C.SEASON_SWING_POLAR * lat;
    const seasonal = seasonPhase(world, y) * swing;
    for (let x = 0; x < world.width; x++) {
      const i = idx(world, x, y);
      world.meanTemperature[i] = world.baseTemperature[i] + drift + world.tempOffset[i];
      world.temperature[i] = world.meanTemperature[i] + seasonal;
      if (world.lakes[i]) {
        world.fertility[i] = 0;
        world.meanFertility[i] = 0;
        continue;
      }
      // Floodplains bloom, and the sea feeds its shores
      const riverBoost = world.isRiver[i] ? 1 + C.RIVER_FERTILITY_BONUS : 1;
      const fishing = world.coastal[i] ? C.COASTAL_FISHING : 0;
      const base = fertilityFromClimate(world.temperature[i], world.moisture[i], world.elevation[i]);
      world.fertility[i] = Math.min(1.5, base * riverBoost + fishing + world.fertilityBonus[i]);
      const meanBase = fertilityFromClimate(world.meanTemperature[i], world.moisture[i], world.elevation[i]);
      world.meanFertility[i] = Math.min(1.5, meanBase * riverBoost + fishing + world.fertilityBonus[i]);
    }
  }
}

export const TIER_NAMES = ["camp", "village", "town", "city"] as const;

export function tierOf(count: number): number {
  let tier = 0;
  while (tier < C.TIER_THRESHOLDS.length && count >= C.TIER_THRESHOLDS[tier]) tier++;
  return tier;
}

// Sum of fertility around a cell — the land a settlement works. Radius grows
// with tier: a camp gleans its 3x3, a city feeds on 7x7.
// When shared, each cell's yield is split among every pop that claims it.
export function harvestAround(world: World, x: number, y: number, shared = false, radius = 1): number {
  let sum = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
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
  if (world.lakes[idx(world, x, y)]) {
    return ns || ew ? `the ${ns}${ew}ern lakes` : "the inland lakes";
  }
  if (isWater(world, x, y)) {
    return ns || ew ? `the ${ns}${ew}ern sea` : "the open sea";
  }
  if (!ns && !ew) return "the heartlands";
  if (ns && ew) return `the ${ns}${ew}`;
  return `the ${ns || ew}`;
}

// The land's character — derived live so climate shifts move the biomes
export const BIOME_NAMES = [
  "deep sea",
  "coastal waters",
  "lake",
  "high mountains",
  "mountains",
  "ice fields",
  "tundra",
  "desert",
  "cold barrens",
  "taiga",
  "steppe",
  "jungle",
  "forest",
  "grassland",
] as const;

export function biomeIdAt(world: World, i: number): number {
  if (world.lakes[i]) return 2;
  const e = world.elevation[i];
  if (e < C.SEA_LEVEL) return e < C.SEA_LEVEL * 0.55 ? 0 : 1;
  const t = world.meanTemperature[i];
  const m = world.moisture[i];
  if (e > C.MOUNTAIN_ROCK_START + 0.1) return 3;
  if (e > C.MOUNTAIN_ROCK_START) return 4;
  if (t < -8) return 5;
  if (t < 2) return 6;
  if (m < 0.16) return t > 16 ? 7 : 8;
  if (t < 8) return 9;
  if (m < 0.35) return 10;
  if (t > 23 && m > 0.55) return 11;
  if (m > 0.5) return 12;
  return 13;
}

export function biomeAt(world: World, x: number, y: number): string {
  const i = idx(world, x, y);
  const base = BIOME_NAMES[biomeIdAt(world, i)];
  return world.isRiver[i] ? `${base} river valley` : base;
}

export function describeDirection(dx: number, dy: number): string {
  const ns = dy < 0 ? "north" : dy > 0 ? "south" : "";
  const ew = dx < 0 ? "west" : dx > 0 ? "east" : "";
  return ns + ew || "nearby";
}

const CULTURE_COLORS = ["#e4572e", "#f0c419", "#9b5de5", "#00bbf9", "#f15bb5", "#7bd389"];

export function cultureOf(world: World, pop: Pop): Culture {
  return world.cultures.get(pop.culture)!;
}

export function leaderOf(world: World, culture: string): Figure | undefined {
  return world.figures.find((f) => f.alive && f.role === "leader" && f.culture === culture);
}

export function heroOf(world: World, culture: string): Figure | undefined {
  return world.figures.find((f) => f.alive && f.role === "hero" && f.culture === culture);
}

// A daughter culture wears a recognizably shifted shade of its parent's color
export function shiftColor(rng: Rng, hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 0) {
    if (max === r / 255) h = (((g - b) / 255 / d) % 6) * 60;
    else if (max === g / 255) h = ((b - r) / 255 / d + 2) * 60;
    else h = ((r - g) / 255 / d + 4) * 60;
  }
  h = (h + 360 + (rng() < 0.5 ? -1 : 1) * (25 + rng() * 20)) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const xx = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [rr, gg, bb] =
    h < 60 ? [c, xx, 0] : h < 120 ? [xx, c, 0] : h < 180 ? [0, c, xx] : h < 240 ? [0, xx, c] : h < 300 ? [xx, 0, c] : [c, 0, xx];
  const to255 = (v: number) => Math.round((v + m) * 255);
  return `#${((to255(rr) << 16) | (to255(gg) << 8) | to255(bb)).toString(16).padStart(6, "0")}`;
}

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
  const seeded = (): Pop[] => [...world.pops, ...world.unwoken.map((u) => u.pop)];
  for (const c of candidates) {
    if (seeded().length >= C.STARTING_POPS) break;
    if (seeded().some((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) < minSpacing)) continue;
    const name = cultureName(world.rng);
    world.cultures.set(name, {
      name,
      color: CULTURE_COLORS[world.pops.length % CULTURE_COLORS.length],
      comfortTemp: C.COMFORT_TEMP,
      parent: null,
      adaptedNote: 0,
    });
    const pop: Pop = {
      id: world.nextPopId++,
      culture: name,
      x: c.x,
      y: c.y,
      count: C.STARTING_COUNT_MIN + Math.floor(world.rng() * (C.STARTING_COUNT_MAX - C.STARTING_COUNT_MIN)),
      foodSat: 1,
      safety: 1,
      inFamine: false,
      isolation: 0,
      feud: null,
      plagueSeasons: 0,
      tier: 0,
      target: null,
    };
    world.cultureMilestones.set(pop.culture, 0);
    // The first people wake at once; the rest stir across the early years
    if (world.pops.length === 0 && world.unwoken.length === 0) {
      world.pops.push(pop);
      const leader = mintFigure(world, pop.culture, "leader");
      logEvent(
        world,
        `The ${pop.culture} wake in ${describeLocation(world, c.x, c.y)}, led by ${leader.name}.`,
        3,
        { subjects: [pop.culture], at: { x: c.x, y: c.y } },
      );
    } else {
      world.unwoken.push({ pop, year: 2 + Math.floor(world.rng() * C.WAKE_SPREAD_YEARS) });
    }
  }
}

export function createWorld(seed: number): World {
  const size = C.GRID_WIDTH * C.GRID_HEIGHT;
  const world: World = {
    width: C.GRID_WIDTH,
    height: C.GRID_HEIGHT,
    elevation: new Float32Array(size),
    moisture: new Float32Array(size),
    lakes: new Uint8Array(size),
    isRiver: new Uint8Array(size),
    coastal: new Uint8Array(size),
    windHumidity: new Float32Array(size),
    resources: new Uint8Array(size),
    moistureSeed: 0,
    rainScale: 0,
    riverLog: new Map(),
    baseTemperature: new Float32Array(size),
    meanTemperature: new Float32Array(size),
    temperature: new Float32Array(size),
    tempOffset: new Float32Array(size),
    fertility: new Float32Array(size),
    meanFertility: new Float32Array(size),
    fertilityBonus: new Float32Array(size),
    claims: new Uint16Array(size),
    cultures: new Map(),
    cultureMilestones: new Map(),
    contestMemory: new Map(),
    truces: new Map(),
    movementLog: new Map(),
    plagueLog: new Map(),
    unwoken: [],
    figures: [],
    nextFigureId: 1,
    grudges: new Map(),
    pops: [],
    year: 1,
    season: 0,
    events: [],
    nextPopId: 1,
    rng: mulberry32(seed),
  };
  generateElevation(world);
  computeBaseTemperature(world);
  world.moistureSeed = noiseSeed(world.rng);
  simulateWaterCycle(world);
  carveRivers(world);
  computeCoastal(world);
  generateResources(world);
  recomputeClimate(world);
  logEvent(world, "In the beginning, the world lay quiet.", 3);
  seedPops(world);
  return world;
}
