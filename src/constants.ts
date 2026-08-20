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
export const SCORCH_TEMP = 38; // °C above which land renders scorched — heat should look like murder

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

// --- Murmurs: the peoples pray, and a god may answer ---
export const WANT_HUNGER = 0.85; // average food satisfaction below this begets prayers for harvest
export const WANT_EXPOSURE = 0.72; // average climate comfort below this begets prayers for warmth or relief
export const WANT_LOG_YEARS = 12; // per culture, murmured prayers chronicle at most this often
export const PRAYER_RADIUS = 8; // a verb answers a prayer if it lands within this of a praying pop
export const HEARD_COOLDOWN_YEARS = 4; // a culture counts its god's answers at most this often
export const FAITH_SAFETY = 0.02; // safety per point of faith — belief steadies a people, dread unmoors them
export const FAITH_SAFETY_CAP = 0.1; // bound in both directions
export const FAITH_MONUMENT = 3; // answered prayers before a people raises stones; -this and they forsake their god
export const SPURNED_COOLDOWN_YEARS = 2; // cruelty registers more readily than grace
export const UNHEARD_SEASONS = 60; // seasons of unanswered prayer before faith quietly erodes
export const NEGLECT_FLOOR = -1; // silence alone never drives a people to forsake — only spite does

// --- Inner lives: grit, ambitions, and the verbs that answer them ---
export const GRIT_MIN_SEASONS = 8; // a hardship must be endured this long, unanswered, to temper a people
export const GRIT_MAX = 5;
export const GRIT_RESILIENCE = 0.04; // starvation/exposure mortality reduced per point of grit
export const GRIT_RESILIENCE_CAP = 0.18;
export const GRIT_LOG_YEARS = 15; // per culture, self-reliance chronicles at most this often
export const GRIT_STOIC = 3; // endured hardships before a people is stoic — the counterweight to devotion
export const HEAL_RADIUS = 5; // cells swept clean of pestilence
export const SMITE_RADIUS = 3; // cells struck by divine wrath
export const SMITE_FRACTION = 0.12; // fraction of each struck pop that perishes per pulse

// --- Sculpting: the god reshapes the earth itself ---
export const SCULPT_STRENGTH = 0.05; // elevation change at the center per channel pulse
export const SCULPT_RADIUS = 3; // cells
export const FLOOD_SURVIVAL = 0.85; // fraction of a pop that escapes when its ground drowns

// --- Disasters: fire, the mountain, and the falling star ---
export const FIRE_SUBSTEPS = 5; // spread iterations per season — fire is quick-simmed relative to play speed
export const FIRE_SPREAD = 0.33; // per substep, per neighbor: chance scaled by intensity and flammability
export const FIRE_BURNOUT = 0.4; // intensity a burning cell loses per substep — fires are fast and hungry
export const FIRE_MOISTURE_DAMP = 0.85; // wet country resists burning
export const CHAR_DECAY = 0.06; // per season — burned land heals over a few years
export const ASH_FERTILITY = 0.3; // fraction of healing char returned as fertility — fire ecology
export const LIGHTNING_TRIES = 4; // cells tested per season for dry lightning
export const LIGHTNING_TEMP = 20; // °C — strikes kindle only in warm country...
export const LIGHTNING_DRYNESS = 0.5; // ...that is dry enough to catch
export const LIGHTNING_CHANCE = 0.12; // chance an eligible strike kindles
export const FIRE_MORTALITY = 0.25; // per season, for a pop whose ground is burning
export const FIRE_FLEE_RADIUS = 8; // how far a burning people looks for unburned ground
export const WILDFIRE_LOG_YEARS = 8; // per culture, fire-flight chronicles at most this often
export const VOLCANO_RADIUS = 2; // cells of new cone
export const VOLCANO_LIFT = 0.45; // elevation raised at the cone's heart
export const VOLCANO_KILL_RADIUS = 3;
export const VOLCANO_KILL = 0.5; // fraction of nearby pops lost to the eruption
export const VOLCANO_FIRE_RADIUS = 4; // cells set alight around the cone
export const VOLCANO_ASH_RADIUS = 6; // volcanic soils: long-lived fertility in the fallout ring
export const VOLCANO_ASH = 0.3;
export const ERUPTION_TRIES = 8; // peak cells tested per year for natural eruptions
export const ERUPTION_MIN_ELEVATION = 0.88; // only the oldest, tallest bones hold deep fire
export const ERUPTION_CHANCE = 0.5; // chance a tested peak wakes
export const NATURAL_ERUPT_LIFT = 0.04; // a waking mountain grows a little
export const METEOR_RADIUS = 3; // crater size
export const METEOR_DEPTH = 0.42; // elevation lost at the crater's heart — deep enough to drown
export const METEOR_KILL_RADIUS = 4;
export const METEOR_KILL = 0.75; // fraction of nearby pops lost to the impact

// --- Ruins: dead settlements leave bones ---
export const RUIN_MIN_TIER = 2; // a faded people leaves ruins only where a town or better stood
export const RUIN_WAR_MIN_TIER = 1; // annihilation leaves bones even of villages
export const RUIN_LIFETIME = 250; // years before the old stones sink into the grass
export const RUIN_RECLAIM_RADIUS = 1; // settling this close to ancestral ruins raises them anew
export const RECLAIM_PULL = 0.6; // site-score bonus on ancestral ruins — the old country calls
export const RUIN_TRESPASS_GRUDGE = 1.5; // hatred earned by building on another people's dead

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
export const GRUDGE_CAP = 10; // hatred saturates — grudges past this add no further brutality
export const GRUDGE_DECAY_PER_YEAR = 0.05; // hatred cools slowly
export const VENDETTA_LOSS_MULT = 0.15; // extra casualties per point of grudge
export const ANNIHILATION_COUNT = 250; // under vendetta, a beaten pop this small is destroyed

// --- Nations: named polities and the bonds between them ---
export const POLITY_MIN_POP = 5000; // souls before a people may proclaim a nation (plus a town and a leader)
export const POLITY_RANK2_POP = 20000; // souls and held cells together raise a nation's rank...
export const POLITY_RANK2_CELLS = 70;
export const POLITY_RANK3_POP = 55000; // ...to the imperial tier, the mark of an age
export const POLITY_RANK3_CELLS = 150;
export const POLITY_RANK2_YEARS = 25; // years a founding must stand before it can rise —
export const POLITY_RANK3_YEARS = 50; // size alone is a boom; standing is a history
export const ALLIANCE_CHANCE = 0.15; // per year, when a shared vendetta drives two nations together
export const ALLIANCE_KIN_CHANCE = 0.03; // per year, for kin nations — blood is patient
export const ALLIANCE_GRUDGE_MAX = 1; // more accumulated hatred than this and no alliance forms
export const ALLIANCE_MAX_PER = 3; // bonds a nation can keep sworn at once — diplomacy has bandwidth
export const ALLIANCE_SUPPORT = 0.5; // each allied soul in range weighs this much in a battle
export const ALLIANCE_RANGE = 10; // cells within which an ally's pops can lend their weight
export const ALLIANCE_LAPSE_CHANCE = 0.08; // per year, once a shared enemy no longer binds the pact

// --- War: declared wars, hosts in the field, conquest ---
export const WAR_GRUDGE_MIN = 2; // hatred a nation needs before it declares formal war
export const WAR_DECLARE_CHANCE = 0.3; // per year, once a conquest-hungry nation qualifies
export const WAR_EXHAUSTION_YEARS = 12; // wars this old begin rolling for weary peace
export const WAR_PEACE_CHANCE = 0.35; // per year past exhaustion
export const WAR_TRUCE_YEARS = 20; // peace bought by a war's end
export const MUSTER_MIN_POP = 800; // settlements smaller than this are not levied
export const MUSTER_FRACTION = 0.18; // share of each settlement's souls called to the banner
export const ARMY_MIN = 600; // a levy smaller than this never marches
export const ARMY_BREAK = 250; // a host ground below this scatters for home
export const ARMY_SPEED = 2; // cells per season — hosts outpace wagon trains
export const ARMY_INTERCEPT = 8; // cells within which a host marches to meet an enemy host, not past it
export const ARMY_ATTRITION = 0.02; // souls lost per season afield — campaigns eat their hosts
export const CONQUEST_RATIO = 1.8; // a host must outweigh the defenders by this to take the town
export const SACK_LOSS = 0.2; // fraction of a taken settlement that dies in the sack
export const REFUGEE_FRACTION = 0.35; // fraction of the survivors who flee to kin rather than bow
export const GRUDGE_SACK = 2; // extra hatred a sack earns — some things are not forgotten...
export const DEED_GRUDGE_FLOOR = 1; // ...and a pair with remembered deeds never cools below this
export const ALLY_JOIN_CHANCE = 0.15; // per year, chance a sworn ally marches into a standing war
export const ALLY_JOIN_WINDOW = 8; // years — fresh wars draw allies; old slogs are theirs alone

// --- The yoke: conquered pops remember who they were ---
export const YOKE_ASSIMILATION_YEARS = 35; // a generation or two, and the old name is only a story
export const YOKE_REVOLT_CHANCE = 0.012; // per year, base — rises when the masters are weak
export const YOKE_REVOLT_WAR_MULT = 3; // masters at war are masters distracted
export const YOKE_REVOLT_HARDSHIP_MULT = 2; // hungry or unsafe subjects have little to lose
export const YOKE_REVOLT_GRUDGE = 2; // hatred a revolt rekindles between the two peoples
export const CONDUCT_HATE_ESCALATION = 8; // grudge past this sharpens any conqueror's conduct

// --- Conduct: what conquest means depends on who conquers ---
export const SLAUGHTER_LOSS = 0.42; // warlike conquerors put the fallen to the sword
export const ENSLAVE_LOSS = 0.1; // cunning conquerors keep the souls; they are valuable
export const OCCUPY_LOSS = 0.05; // peaceable conquerors take the town, not the people
export const ALLIANCE_MEMORY_MAX = 1.5; // remembered deeds heavier than this block an alliance
export const WAR_MEMORY_MIN = 2; // remembered deeds heavy enough to justify a vengeance war
export const WAR_REASON_WEIGHT = 1; // a memory this heavy gets named in the declaration

// --- Pestilence: crowding breeds its own cull ---
export const PLAGUE_CHANCE = 0.0008; // per-season base risk, scaled by size and crowding
export const PLAGUE_CROWD_SCALE = 5000; // pop count at which base risk fully applies
export const PLAGUE_SEASONS_MIN = 4; // shortest outbreak
export const PLAGUE_SEASONS_MAX = 10; // longest outbreak
export const PLAGUE_MORTALITY = 0.06; // extra decline per season while pestilence walks
export const PLAGUE_SPREAD_RADIUS = 5; // cells pestilence can jump between pops
export const PLAGUE_SPREAD_CHANCE = 0.04; // per-season chance per nearby pop

// --- Territory: land held, not merely worked ---
export const INFLUENCE_BASE_RADIUS = 4; // cells a camp's presence reaches; +2 per settlement tier
export const CLAIM_THRESHOLD = 2.5; // influence needed to claim unclaimed land
export const TERRITORY_TENACITY = 1.6; // a rival's influence must exceed the holder's by this to flip a cell
export const TERRITORY_FADE = 0.4; // fraction of the claim threshold below which held ground slips away
export const TERRITORY_MILESTONES = [40, 120]; // held cells worth chronicling
export const BORDER_PUSH_MIN = 6; // cells taken from one people in a year worth chronicling
export const BORDER_PUSH_LOG_YEARS = 15; // per culture pair
export const FOREIGN_TERRITORY_PENALTY = 0.45; // site-score multiplier inside another people's borders

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
export const SIM_INTERVAL_MS = 2500; // default cadence of sim steps — slow enough to read the world; the slider speeds it up
export const SIM_INTERVAL_MIN_MS = 250; // fastest the pace slider allows
export const SIM_INTERVAL_MAX_MS = 4000; // slowest the pace slider allows
export const SPEED_BATCHES = [0, 1, 4, 40] as const; // ticks per sim step: pause/season/year/decade
