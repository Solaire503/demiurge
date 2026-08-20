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

// A daughter culture's name keeps the parent's stem: Veshi begets Veshari.
// The stem is capped so lineages don't concatenate into monsters.
export function derivedName(rng: Rng, parent: string): string {
  let stem = parent.replace(/[aeiouy]+$/i, "");
  if (stem.length > 6) stem = stem.slice(0, 4 + Math.floor(rng() * 3)).replace(/[^a-z]+$/i, "");
  return stem + pick(rng, VOWELS) + pick(rng, LINKS) + pick(rng, ENDINGS);
}
