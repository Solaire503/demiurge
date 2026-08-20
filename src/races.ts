// The peoples of the world. A race is a bundle of leanings — where a people
// thrives, how fast it breeds, how it fights, how long its leaders live,
// and now HOW IT IS: what kind of leaders it raises, how long it remembers,
// whether its oaths hold, how cruel its conquests run. All of it applied as
// weights and multipliers on the same sim every culture runs.
//
// Affinity keys are biome ids from biomeIdAt: 3 high mountains, 4 mountains,
// 7 desert, 8 cold barrens, 9 taiga, 10 steppe, 11 jungle, 12 forest, 13 grassland.

import type { Temperament } from "./names";

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
  veinHarvest: number; // fertility a worked ore cell adds — mines feed miners
  // --- Personality: how a race carries itself ---
  temperaments: Record<Temperament, number>; // weights on the leaders it raises
  memoryMult: number; // how slowly deeds done to them fade — elves never forget
  fickle: number; // multiplier on alliance lapse — oath-keepers near zero, goblins high
  cruelty: number; // shift on the hate threshold that sharpens conduct; negative = crueler sooner
  musterMult: number; // share of the levy that actually marches
  tendsLand: boolean; // burned ground heals faster under their dominion
}

export const RACES: Record<string, Race> = {
  humans: {
    name: "humans",
    growth: 1.05,
    splitMult: 1.2, // restless colonizers — emptiness calls loudest to them
    battleDealt: 1,
    battleTaken: 1,
    plagueResist: 1,
    adaptMult: 1.8,
    leaderSpan: 0,
    comfortShift: 0,
    affinities: {},
    veinHarvest: 0.15,
    temperaments: { warlike: 1, peaceable: 1, ambitious: 2.2, cunning: 1 }, // empire is a human dream
    memoryMult: 1,
    fickle: 1,
    cruelty: 0,
    musterMult: 1,
    tendsLand: false,
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
    comfortShift: -8, // the deep halls are warm no matter the peaks above
    affinities: { 3: 6, 4: 5 },
    veinHarvest: 0.6, // deep-farms and trade turn ore into bread
    temperaments: { warlike: 1.3, peaceable: 0.8, ambitious: 0.8, cunning: 1.3 },
    memoryMult: 1.8, // the Book of Grudges is not a metaphor
    fickle: 0.4, // oath-keepers
    cruelty: 0,
    musterMult: 1,
    tendsLand: false,
  },
  elves: {
    name: "elves",
    growth: 0.8,
    splitMult: 0.7,
    battleDealt: 1.1,
    battleTaken: 0.8,
    plagueResist: 0.6,
    adaptMult: 0.8,
    leaderSpan: 180,
    comfortShift: 2,
    affinities: { 12: 1.9, 11: 1.7, 9: 1.5 },
    veinHarvest: 0,
    temperaments: { warlike: 0.6, peaceable: 1.8, ambitious: 0.6, cunning: 1.4 },
    memoryMult: 2.2, // ancient — a wrong done to elves outlives its doer's dynasty
    fickle: 0.6,
    cruelty: 4, // they do not put towns to the sword
    musterMult: 0.9,
    tendsLand: true, // burned country heals fast under elven dominion
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
    affinities: { 8: 1.4, 7: 1.3, 10: 1.2 },
    veinHarvest: 0.1,
    temperaments: { warlike: 2.5, peaceable: 0.4, ambitious: 1, cunning: 0.8 },
    memoryMult: 0.8,
    fickle: 1.2,
    cruelty: -3, // the sword comes out early
    musterMult: 1.25, // the whole tribe fights
    tendsLand: false,
  },
  goblins: {
    name: "goblins",
    growth: 1.25,
    splitMult: 1.4,
    battleDealt: 0.8,
    battleTaken: 1.25,
    plagueResist: 1.3,
    adaptMult: 1.2,
    leaderSpan: -15,
    comfortShift: 0,
    affinities: {},
    veinHarvest: 0.15,
    temperaments: { warlike: 1.6, peaceable: 0.4, ambitious: 1, cunning: 1.8 },
    memoryMult: 0.5, // quick to forget, quick to knife
    fickle: 2.5, // goblins are goblins — even kin-oaths tire
    cruelty: -2,
    musterMult: 1.1,
    tendsLand: false,
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
    veinHarvest: 0.4, // gem-cutters and tinkers
    temperaments: { warlike: 0.4, peaceable: 1.8, ambitious: 0.9, cunning: 1.6 },
    memoryMult: 1.2,
    fickle: 0.7,
    cruelty: 5, // they have no stomach for slaughter
    musterMult: 0.6, // reluctant, small levies
    tendsLand: false,
  },
};

export const RACE_KEYS = Object.keys(RACES);
