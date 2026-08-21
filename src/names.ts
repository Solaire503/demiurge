import type { Rng } from "./rng";
import { pick } from "./rng";

const ONSETS = ["V", "T", "K", "S", "M", "R", "D", "N", "Th", "Br", "Kal", "Or", "Esh", "Ul"];
const VOWELS = ["a", "e", "i", "o", "u", "ae", "ia", "ei"];
const LINKS = ["n", "r", "l", "s", "th", "sh", "v", "d", "m"];
const ENDINGS = ["i", "ai", "a", "un", "eth", "or", "ish", "ar", "u"];

export function cultureName(rng: Rng): string {
  let name = pick(rng, ONSETS) + pick(rng, VOWELS);
  if (rng() < 0.6) name += pick(rng, LINKS) + pick(rng, VOWELS);
  name += pick(rng, LINKS) + pick(rng, ENDINGS);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export type Temperament = "warlike" | "peaceable" | "ambitious" | "cunning";

const EPITHETS: Record<Temperament, string[]> = {
  warlike: ["the Grim", "the Red", "Ironhand", "the Unyielding", "Bonebreaker", "the Wrathful"],
  peaceable: ["the Kind", "the Gentle", "Peaceweaver", "the Patient", "Openhand", "the Quiet"],
  ambitious: ["the Bold", "Farstrider", "the Hungry", "Skyreacher", "the Restless", "Landtaker"],
  cunning: ["the Fox", "the Subtle", "Halftongue", "the Watchful", "Shadowstep", "the Clever"],
};

const HERO_EPITHETS = ["the Brave", "Giantsbane", "the Shield", "Stormborn", "the Deathless", "Oathkeeper"];

export function personName(rng: Rng): string {
  let name = pick(rng, ONSETS) + pick(rng, VOWELS);
  if (rng() < 0.4) name += pick(rng, LINKS) + pick(rng, VOWELS);
  name += pick(rng, LINKS);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function leaderName(rng: Rng, temperament: Temperament): string {
  return `${personName(rng)} ${pick(rng, EPITHETS[temperament])}`;
}

export function heroName(rng: Rng): string {
  return `${personName(rng)} ${pick(rng, HERO_EPITHETS)}`;
}

// Wars get names so history can hold them: "the War of Ashes" is a container
// a reader can retell; forty log lines are not
const WAR_NOUNS = [
  "Ashes", "Salt", "Crowns", "Thorns", "Embers", "Iron", "Sorrows",
  "Long Knives", "Broken Oaths", "the Marches", "Spears", "Ravens",
  "the Twin Banners", "Cinders", "the Red Fields", "Smoke", "Graves",
];

export function warName(rng: Rng): string {
  return `the War of ${pick(rng, WAR_NOUNS)}`;
}

// Epithets earned in blood — a hero's second great kill remakes their name
export const EARNED_EPITHETS = [
  "the Deathless", "Heroesbane", "the Red-Handed", "Twice-Famed",
  "Doomhand", "the Pitiless", "the Ruin of Hosts", "Skullkeeper",
];

// The beasts of the world get names men whisper
const BEAST_EPITHETS: Record<string, string[]> = {
  giant: ["the Hill-Tall", "Stonejaw", "the Roof-Breaker", "the Hungry", "Oxbane", "the Grey Walker"],
  troll: ["of the Deep Ford", "Mossback", "the Night-Walker", "Bonegnawer", "of the Under-Bridge"],
  dragon: ["the Old Fire", "Ember-Wing", "the Gilded Terror", "Ashmaw", "the Undying Coil", "Hoard-Warden"],
};

export function beastName(rng: Rng, kind: string): string {
  return `${personName(rng)} ${pick(rng, BEAST_EPITHETS[kind] ?? BEAST_EPITHETS.giant)}`;
}

// Forgotten beasts are generated, each unlike anything before it
const FORGOTTEN_FORMS = [
  "a towering amalgam of ash and antlers",
  "a shape of roots and old iron",
  "a hollow colossus of bone and river-clay",
  "a crawling shadow with a thousand teeth",
  "a headless thing wearing a crown of embers",
  "a serpent of smoke and grave-soil",
  "a mountain of feathers that has never flown",
];
const FORGOTTEN_HUNGERS = [
  "the works of hands",
  "warm hearths",
  "the names of the living",
  "bells and prayers",
  "the light of morning",
  "the marrow of kings",
];

export function forgottenDesc(rng: Rng): string {
  return `${pick(rng, FORGOTTEN_FORMS)}, which hungers for ${pick(rng, FORGOTTEN_HUNGERS)}`;
}

// Named treasures: a blade gets a name of its own; regalia carry their maker's
const BLADE_FIRST = ["Doom", "Oath", "Dawn", "Grave", "Storm", "Ember", "Winter", "Raven", "Sorrow", "Star"];
const BLADE_LAST = ["whisper", "binder", "song", "bite", "brand", "mourner", "edge", "fang", "wake"];
const REGALIA_ADJ = ["Iron", "Ashen", "Sun", "Antler", "Pale", "Ember", "Salt", "Raven"];

export function artifactName(rng: Rng, kind: string, maker: string): string {
  if (kind === "crown") return `the ${pick(rng, REGALIA_ADJ)} Crown of the ${maker}`;
  if (kind === "banner") return `the ${pick(rng, REGALIA_ADJ)} Banner of the ${maker}`;
  if (kind === "idol") return `the ${pick(rng, ["Sleeping", "Hollow", "Gilded", "Weeping", "Horned"])} Idol of the ${maker}`;
  return pick(rng, BLADE_FIRST) + pick(rng, BLADE_LAST);
}

// A daughter culture's name keeps the parent's stem: Veshi begets Veshari.
// The stem is capped so lineages don't concatenate into monsters.
export function derivedName(rng: Rng, parent: string): string {
  let stem = parent.replace(/[aeiouy]+$/i, "");
  if (stem.length > 6) stem = stem.slice(0, 4 + Math.floor(rng() * 3)).replace(/[^a-z]+$/i, "");
  return stem + pick(rng, VOWELS) + pick(rng, LINKS) + pick(rng, ENDINGS);
}
