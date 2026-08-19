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
