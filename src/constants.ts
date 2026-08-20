// All tunable knobs live here. Units noted per constant.

export const GRID_WIDTH = 128;
export const GRID_HEIGHT = 64;

// --- Terrain ---
export const SEA_LEVEL = 0.3; // elevation below this is water

// --- Water cycle: winds carry ocean moisture inland ---
export const EVAPORATION_RATE = 0.12; // humidity gained per ocean cell crossed, scaled by warmth
export const HUMIDITY_CAP = 3; // most water the air can hold
export const RAIN_RATE = 0.055; // fraction of humidity that falls per land cell
export const OROGRAPHIC_RAIN = 1.6; // extra rain per unit of rising ground — mountains wring the air dry
export const SUBTROPIC_DRYING = 0.55; // rain suppression at the descending-air band (lat ~0.38)
export const MOISTURE_BLUR_PASSES = 3; // vertical mixing between wind bands
export const MOISTURE_NOISE = 0.08; // local variation on top of the cycle

// --- Rivers ---
export const RIVER_THRESHOLD = 10; // accumulated flow before a stream is a river
export const RIVER_FERTILITY_BONUS = 0.5; // floodplains bloom
export const RIVER_MOISTURE_BONUS = 0.18; // land beside rivers and lakes drinks from them
export const COASTAL_FISHING = 0.18; // fertility bonus where land meets water — the sea feeds

// --- Minerals: veins in the rock, table-setting for mining and tech ---
export const VEIN_CHANCE = 0.12; // per highland cell, scaled by elevation — dense enough that ore country can feed its miners
export const VEIN_MIN_ELEVATION = 0.55; // ore likes high country
export const RIVER_RECARVE_YEARS = 5; // rivers redraw their courses this often as rainfall shifts
export const RIVER_LOG_YEARS = 10; // per culture, river-change events at most this often

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
export const FERT_TEMP_TOLERANCE = 15; // gaussian width of the growth curve
export const MOUNTAIN_ROCK_START = 0.75; // elevation where soil thins to rock

// --- Divine influence ---
export const BLESS_STRENGTH = 0.45; // fertility added at the center of a blessing
export const BLESS_RADIUS = 4; // cells
export const BLESS_DECAY = 0.0015; // fraction of blessing that fades per season — a god's gift should outlive a generation
export const TEMP_SHIFT = 7; // °C applied at the center of a temperature shift
export const TEMP_SHIFT_RADIUS = 5; // cells
export const TEMP_RELAX = 0.01; // fraction of divine warmth/chill that fades per season
export const CHANNEL_INTERVAL_MS = 200; // holding the mouse re-applies a verb this often

// --- Sculpting: the god reshapes the earth itself ---
export const SCULPT_STRENGTH = 0.05; // elevation change at the center per channel pulse
export const SCULPT_RADIUS = 3; // cells
export const FLOOD_SURVIVAL = 0.85; // fraction of a pop that escapes when its ground drowns

// --- Pops ---
export const CAPACITY_PER_FERTILITY = 900; // people supported per point of 3x3 fertility
export const BASE_GROWTH = 0.08; // fractional growth per season per unit of food surplus
export const GROWTH_SURPLUS_CAP = 1.5; // food satisfaction beyond this stops boosting growth
export const MAX_GROWTH = 0.05; // clamp on per-season growth
export const MAX_DECLINE = -0.08; // clamp on ordinary per-season decline
export const STARVATION_DECLINE = 0.25; // extra decline as food satisfaction falls below 0.5
export const EXPOSURE_DECLINE = 0.15; // extra decline as safety falls below 0.25
export const SAFETY_MORTALITY = 0.04; // extra decline per season at zero safety
export const COMFORT_TEMP = 16; // °C mean temperature pops find ideal
export const COMFORT_TOLERANCE = 9; // ±°C band with no safety penalty
export const COMFORT_FALLOFF = 22; // °C beyond the band until safety hits zero
export const FAMINE_THRESHOLD = 0.8; // smoothed food satisfaction that begins famine
export const FAMINE_RECOVERY = 0.95; // smoothed food satisfaction that ends famine
export const MIGRATION_SEARCH_RADIUS = 12; // cells scanned for a refuge
export const MIGRATION_GAIN = 1.3; // refuge must score this multiple of home
export const DESPERATE_RADIUS = 20; // exodus range when starving or freezing
export const SITE_JITTER = 0.4; // random swing applied to site scores — breaks lattice settlement
export const SPLIT_MIN_COUNT = 1200; // people before a band may strike out
export const SPLIT_CROWDING = 0.65; // fraction of capacity that triggers splitting
export const SPLIT_CHANCE = 0.12; // per-season chance once crowded
export const SPLIT_FRACTION = 0.4; // share of the pop that leaves
export const EXTINCTION_COUNT = 20; // below this, a pop passes into memory
export const STARTING_POPS = 6; // one people per race
export const STARTING_COUNT_MIN = 180; // waking bands vary in size...
export const STARTING_COUNT_MAX = 450;
export const WAKE_SPREAD_YEARS = 14; // ...and in when they wake, after the first

export const MILESTONES = [1000, 5000, 20000, 100000, 500000]; // culture populations worth recording

// --- Cultures ---
export const ADAPT_RATE = 0.006; // fraction of the home-climate gap a culture's comfort closes per season
export const COMFORT_TEMP_MIN = -5; // °C floor for adapted comfort
export const ADAPT_HARVEST_BONUS = 1.2; // max harvest multiplier bonus for cultures adapted to cold lands
export const ADAPT_HARVEST_RANGE = 16; // °C between culture comfort and local climate before the bonus fades
export const PIONEER_BONUS = 0.6; // site-score bonus for wholly unclaimed land — emptiness calls to the crowded
export const COMFORT_TEMP_MAX = 30; // °C ceiling for adapted comfort
export const ADAPT_NOTE_DELTA = 4; // °C of drift from baseline worth chronicling
export const SCHISM_DISTANCE = 16; // cells from nearest kin to count as sundered
export const PROVINCE_DISTANCE = 26; // cells from the culture's heartland to count as a far province
export const SCHISM_GROUP_RADIUS = 8; // kin within this range of a schism join the new culture

// --- Contested ground ---
export const RIVALRY_DISTANCE = 6; // cells within which another culture's pop exerts pressure
export const PRESSURE_FACTOR = 0.15; // safety lost per unit of outnumbering ratio
export const PRESSURE_CAP = 0.5; // most safety that border pressure can strip
export const CONTEST_RATIO = 0.8; // outnumbering ratio worth chronicling
export const CONTEST_COOLDOWN_YEARS = 40; // years between chronicled contests per culture pair

// --- Contest resolution: standoffs end in blood, accord, or merging ---
export const FEUD_MIN_SEASONS = 8; // seasons of standoff before resolution dice begin
export const FEUD_CHANCE_RAMP = 0.012; // resolution chance gained per season past the minimum
export const FEUD_CHANCE_MAX = 0.08; // per-season cap
export const MERGE_CHANCE_KIN = 0.45; // kin contests: chance the smaller takes up the larger's ways
export const ACCORD_THRESHOLD_KIN = 0.85; // kin roll under this (past merging) ends in peace
export const ACCORD_THRESHOLD = 0.55; // stranger roll under this ends in peace
export const TRUCE_YEARS = 15; // peace bought by an accord
export const BATTLE_TRUCE_YEARS = 8; // exhaustion after a battle
export const BATTLE_LOSS_BASE = 0.08; // minimum fraction each side loses in battle
export const BATTLE_LOSS_SPREAD = 0.17; // additional random fraction lost

// --- Figures: leaders and heroes who persist, act, and die ---
export const LEADER_OLD_AGE = 58; // years before age begins rolling for a figure's death
export const LEADER_OLD_DEATH_CHANCE = 0.015; // per season past old age
export const LEADER_BATTLE_DEATH_CHANCE = 0.12; // when their people lose a battle
export const LEADER_PLAGUE_DEATH_CHANCE = 0.004; // per season while their people sicken
export const HERO_MINT_CHANCE = 0.25; // chance a victory raises a hero
export const HERO_LOSS_REDUCTION = 0.7; // casualty multiplier for a people with a living hero
export const HERO_DEATH_LOSING = 0.25; // hero death chance on the losing side of a battle
export const HERO_DEATH_WINNING = 0.08; // heroes sometimes fall even in victory
export const AMBITIOUS_SPLIT_MULT = 1.6; // ambitious leaders push their people outward
export const TEMPERAMENT_ACCORD_SHIFT = 0.125; // per leader: peaceable adds, warlike subtracts

// --- Grudges: wars remember ---
export const GRUDGE_PER_BATTLE = 1; // hatred earned by each battle
export const GRUDGE_WARLIKE_BONUS = 1; // extra when a warlike leader commands
export const GRUDGE_VENDETTA = 3; // at this, war becomes a hunt: no truces, no accords
export const GRUDGE_DECAY_PER_YEAR = 0.05; // hatred cools slowly
export const VENDETTA_LOSS_MULT = 0.15; // extra casualties per point of grudge
export const ANNIHILATION_COUNT = 250; // under vendetta, a beaten pop this small is destroyed

// --- Pestilence: crowding breeds its own cull ---
export const PLAGUE_CHANCE = 0.0008; // per-season base risk, scaled by size and crowding
export const PLAGUE_CROWD_SCALE = 5000; // pop count at which base risk fully applies
export const PLAGUE_SEASONS_MIN = 4; // shortest outbreak
export const PLAGUE_SEASONS_MAX = 10; // longest outbreak
export const PLAGUE_MORTALITY = 0.06; // extra decline per season while pestilence walks
export const PLAGUE_SPREAD_RADIUS = 5; // cells pestilence can jump between pops
export const PLAGUE_SPREAD_CHANCE = 0.04; // per-season chance per nearby pop

// --- Settlements ---
export const TIER_THRESHOLDS = [1000, 5000, 15000]; // souls to become a village, town, city
export const TIER_HARVEST_RADIUS = [1, 1, 2, 3]; // cells worked outward per tier — cities feed on 7x7
export const CONSOLIDATE_DISTANCE = 4; // same-culture settlements this close gather into one (must exceed POP_SPACING)
export const SPLIT_MAX_LEAVING = 1500; // the largest band a settlement sends out

// --- Chronicle hygiene ---
export const MOVEMENT_LOG_YEARS = 10; // per culture, routine strikes-out/settle/migration lines at most this often
export const PLAGUE_LOG_YEARS = 8; // per culture, outbreak announcements at most this often
// Sundered bands roll dice each season: early on they may give up and turn home;
// the longer they endure, the likelier their identity hardens into a new culture.
export const SCHISM_MIN_SEASONS = 40; // seasons sundered before a new identity can form
export const SCHISM_CHANCE_RAMP = 0.0004; // schism chance gained per season beyond the minimum
export const SCHISM_CHANCE_MAX = 0.03; // per-season cap
export const HOMESICK_SEASONS = 60; // window in which a sundered band may give up
export const HOMESICK_CHANCE = 0.004; // per-season chance to abandon the far country
export const POP_SPACING = 3.4; // euclidean distance pops keep from each other when settling

// --- Time ---
export const SIM_INTERVAL_MS = 1000; // default cadence of sim steps, independent of framerate
export const SIM_INTERVAL_MIN_MS = 250; // fastest the pace slider allows
export const SIM_INTERVAL_MAX_MS = 4000; // slowest the pace slider allows
export const SPEED_BATCHES = [0, 1, 4, 40] as const; // ticks per sim step: pause/season/year/decade
