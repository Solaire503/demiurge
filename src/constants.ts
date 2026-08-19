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

// --- Cultures ---
export const ADAPT_RATE = 0.006; // fraction of the home-climate gap a culture's comfort closes per season
export const COMFORT_TEMP_MIN = 0; // °C floor for adapted comfort
export const COMFORT_TEMP_MAX = 30; // °C ceiling for adapted comfort
export const ADAPT_NOTE_DELTA = 4; // °C of drift from baseline worth chronicling
export const SCHISM_DISTANCE = 16; // cells from nearest kin to count as sundered
export const PROVINCE_DISTANCE = 26; // cells from the culture's heartland to count as a far province
export const SCHISM_GROUP_RADIUS = 8; // kin within this range of a schism join the new culture

// --- Contested ground ---
export const RIVALRY_DISTANCE = 4; // cells within which another culture's pop exerts pressure
export const PRESSURE_FACTOR = 0.15; // safety lost per unit of outnumbering ratio
export const PRESSURE_CAP = 0.5; // most safety that border pressure can strip
export const CONTEST_COOLDOWN_YEARS = 25; // years between chronicled contests per culture pair
// Sundered bands roll dice each season: early on they may give up and turn home;
// the longer they endure, the likelier their identity hardens into a new culture.
export const SCHISM_MIN_SEASONS = 40; // seasons sundered before a new identity can form
export const SCHISM_CHANCE_RAMP = 0.0004; // schism chance gained per season beyond the minimum
export const SCHISM_CHANCE_MAX = 0.03; // per-season cap
export const HOMESICK_SEASONS = 60; // window in which a sundered band may give up
export const HOMESICK_CHANCE = 0.004; // per-season chance to abandon the far country
export const POP_SPACING = 3; // chebyshev distance pops keep from each other when settling

// --- Time ---
export const SIM_INTERVAL_MS = 1000; // default cadence of sim steps, independent of framerate
export const SIM_INTERVAL_MIN_MS = 250; // fastest the pace slider allows
export const SIM_INTERVAL_MAX_MS = 4000; // slowest the pace slider allows
export const SPEED_BATCHES = [0, 1, 4, 40] as const; // ticks per sim step: pause/season/year/decade
