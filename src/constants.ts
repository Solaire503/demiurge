// All tunable knobs live here. Units noted per constant.

export const GRID_WIDTH = 128;
export const GRID_HEIGHT = 64;

// --- Terrain ---
export const SEA_LEVEL = 0.3; // elevation below this is water

// --- Climate ---
export const EQUATOR_TEMP = 32; // °C annual mean at sea level, equator
export const POLE_TEMP = -22; // °C annual mean at sea level, poles
export const LAPSE_RATE = 40; // °C lost across the full land elevation range
export const SEASON_SWING_BASE = 3; // °C seasonal swing at the equator
export const SEASON_SWING_POLAR = 16; // additional °C swing at the poles
export const SNOW_TEMP = -2; // °C below which land renders as snow

// Long climate cycles: warm ages and cold ages keep the world restless at equilibrium.
// Superimposed sines — period in years, amplitude in °C applied globally.
export const CLIMATE_CYCLES = [
  { period: 130, amp: 2.6 },
  { period: 41, amp: 1.4 },
];

// Fertility response to climate
export const FERT_OPTIMAL_TEMP = 18; // °C where plant growth peaks
export const FERT_TEMP_TOLERANCE = 13; // gaussian width of the growth curve
export const MOUNTAIN_ROCK_START = 0.75; // elevation where soil thins to rock

// --- Divine influence ---
export const BLESS_STRENGTH = 0.35; // fertility added at the center of a blessing
export const BLESS_RADIUS = 4; // cells
export const BLESS_DECAY = 0.004; // fraction of blessing that fades per season
export const TEMP_SHIFT = 7; // °C applied at the center of a temperature shift
export const TEMP_SHIFT_RADIUS = 5; // cells
export const TEMP_RELAX = 0.02; // fraction of divine warmth/chill that fades per season
export const CHANNEL_INTERVAL_MS = 200; // holding the mouse re-applies a verb this often

// --- Pops ---
export const CAPACITY_PER_FERTILITY = 900; // people supported per point of 3x3 fertility
export const BASE_GROWTH = 0.05; // max fractional growth per season at full surplus
export const MAX_GROWTH = 0.035; // clamp on per-season growth
export const MAX_DECLINE = -0.08; // clamp on per-season decline
export const SAFETY_MORTALITY = 0.04; // extra decline per season at zero safety
export const COMFORT_TEMP = 16; // °C mean temperature pops find ideal
export const COMFORT_TOLERANCE = 9; // ±°C band with no safety penalty
export const COMFORT_FALLOFF = 22; // °C beyond the band until safety hits zero
export const FAMINE_THRESHOLD = 0.8; // smoothed food satisfaction that begins famine
export const FAMINE_RECOVERY = 0.95; // smoothed food satisfaction that ends famine
export const MIGRATION_SEARCH_RADIUS = 12; // cells scanned for a refuge
export const MIGRATION_GAIN = 1.3; // refuge must score this multiple of home
export const SPLIT_MIN_COUNT = 1500; // people before a band may strike out
export const SPLIT_CROWDING = 0.85; // fraction of capacity that triggers splitting
export const SPLIT_CHANCE = 0.12; // per-season chance once crowded
export const SPLIT_FRACTION = 0.4; // share of the pop that leaves
export const EXTINCTION_COUNT = 20; // below this, a pop passes into memory
export const STARTING_POPS = 4;
export const STARTING_COUNT = 300;

export const MILESTONES = [1000, 5000, 20000, 100000, 500000]; // culture populations worth recording
export const POP_SPACING = 3; // chebyshev distance pops keep from each other when settling

// --- Time ---
export const SIM_INTERVAL_MS = 1000; // default cadence of sim steps, independent of framerate
export const SIM_INTERVAL_MIN_MS = 250; // fastest the pace slider allows
export const SIM_INTERVAL_MAX_MS = 4000; // slowest the pace slider allows
export const SPEED_BATCHES = [0, 1, 4, 40] as const; // ticks per sim step: pause/season/year/decade
