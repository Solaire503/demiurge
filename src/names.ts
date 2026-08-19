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

// A daughter culture's name keeps the parent's stem: Veshi begets Veshari.
// The stem is capped so lineages don't concatenate into monsters.
export function derivedName(rng: Rng, parent: string): string {
  let stem = parent.replace(/[aeiouy]+$/i, "");
  if (stem.length > 6) stem = stem.slice(0, 4 + Math.floor(rng() * 3)).replace(/[^a-z]+$/i, "");
  return stem + pick(rng, VOWELS) + pick(rng, LINKS) + pick(rng, ENDINGS);
}
