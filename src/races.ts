// The peoples of the world. A race is a bundle of leanings — where a people
// thrives, how fast it breeds, how it fights, how long its leaders live —
// applied as multipliers on the same sim every culture runs.
//
// Affinity keys are biome ids from biomeIdAt: 3 high mountains, 4 mountains,
// 7 desert, 8 cold barrens, 9 taiga, 10 steppe, 11 jungle, 12 forest, 13 grassland.

export interface Race {
  name: string;
  growth: number; // multiplier on positive growth
  splitMult: number; // eagerness to send out bands
  battleDealt: number; // casualties inflicted
  battleTaken: number; // casualties suffered
  plagueResist: number; // multiplier on outbreak and spread risk
  adaptMult: number; // how fast comfort drifts toward the home climate
  leaderSpan: number; // years added to a leader's old age
  comfortShift: number; // °C offset on the founding comfort temperature
  affinities: Record<number, number>; // biomeId -> harvest multiplier
}

export const RACES: Record<string, Race> = {
  humans: {
    name: "humans",
    growth: 1,
    splitMult: 1,
    battleDealt: 1,
    battleTaken: 1,
    plagueResist: 1,
    adaptMult: 1.6,
    leaderSpan: 0,
    comfortShift: 0,
    affinities: {},
  },
  dwarves: {
    name: "dwarves",
    growth: 0.85,
    splitMult: 0.8,
    battleDealt: 1.15,
    battleTaken: 0.85,
    plagueResist: 1,
    adaptMult: 1,
    leaderSpan: 25,
    comfortShift: -4,
    affinities: { 3: 5, 4: 4 },
  },
  elves: {
    name: "elves",
    growth: 0.7,
    splitMult: 0.7,
    battleDealt: 1.1,
    battleTaken: 0.8,
    plagueResist: 0.6,
    adaptMult: 0.8,
    leaderSpan: 180,
    comfortShift: 2,
    affinities: { 12: 1.8, 11: 1.6, 9: 1.4 },
  },
  orcs: {
    name: "orcs",
    growth: 1.15,
    splitMult: 1.1,
    battleDealt: 1.3,
    battleTaken: 1.15,
    plagueResist: 1.2,
    adaptMult: 1,
    leaderSpan: -10,
    comfortShift: 0,
    affinities: { 8: 1.6, 7: 1.4, 10: 1.3 },
  },
  goblins: {
    name: "goblins",
    growth: 1.35,
    splitMult: 1.5,
    battleDealt: 0.8,
    battleTaken: 1.25,
    plagueResist: 1.3,
    adaptMult: 1.2,
    leaderSpan: -15,
    comfortShift: 0,
    affinities: {},
  },
  gnomes: {
    name: "gnomes",
    growth: 0.9,
    splitMult: 0.9,
    battleDealt: 0.85,
    battleTaken: 0.8,
    plagueResist: 0.5,
    adaptMult: 1.2,
    leaderSpan: 40,
    comfortShift: 0,
    affinities: { 13: 1.3, 10: 1.2 },
  },
};

export const RACE_KEYS = Object.keys(RACES);
