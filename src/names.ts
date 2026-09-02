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

// The menagerie: lesser beasts get names men warn each other with
const PACK_ADJ = ["Winter", "Grey", "Red-Eyed", "Hollow-Bellied", "Howling", "Black-Snow", "Long-Shadow"];
const LESSER_EPITHETS: Record<string, string[]> = {
  wyvern: ["Redscale", "the Herd-Taker", "Sun-Wing", "Cliffshadow", "the Lean Drake"],
  basilisk: ["the Marsh-King", "Stillwater", "Rotmaw", "Who Looks Back", "the Fever-Eye"],
  hydra: ["Many-Mouths", "of the Reeds", "the Unending", "Fordwarden", "Nine-Necks"],
  ogre: ["Child-Taker", "Broadback", "the Bog-Lord", "Two-Teeth", "the Cradle-Robber"],
  griffin: ["Goldclaw", "the Eyrie-Lord", "Skyrender", "Crownthief", "the High Watcher"],
  wight: ["the Unresting", "Barrow-Cold", "Who Was Buried", "the Grave-Warden", "of the Old Stones"],
  serpent: ["the Coil", "Deepback", "Netbreaker", "the Grey Swell", "Tide-Mother"],
  manticore: ["Roadwarden", "the Sand-Stalker", "Thorntail", "Who Waits by the Milestones", "the Red Grin"],
};

export function lesserName(rng: Rng, kind: string): string {
  if (kind === "wolves") return `the ${pick(rng, PACK_ADJ)} Pack`;
  return `${personName(rng)} ${pick(rng, LESSER_EPITHETS[kind] ?? LESSER_EPITHETS.ogre)}`;
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

// Demons are princes of the powers beneath, and wear a face
const DEMON_EPITHETS = ["of the Ashes", "the Hollow King", "Who Was Cast Down", "the Smiling", "Lord of Flies", "the Unnamed", "the Gilded Worm"];
const DEMON_FACES = ["a drowned king", "a child", "an old friend", "the last leader they buried", "no one at all", "a beautiful stranger", "a burned man"];

export function demonName(rng: Rng): string {
  return `${personName(rng)} ${pick(rng, DEMON_EPITHETS)}`;
}

export function demonDesc(rng: Rng): string {
  return `a prince of the powers beneath, wearing the face of ${pick(rng, DEMON_FACES)}`;
}

// Angels come down on the devout, and stand
const ANGEL_EPITHETS = ["of the Morning", "the Bright", "Sword-of-Dawn", "Who Stands", "the Sentinel", "of the Seven Lights", "the Unsleeping"];

export function angelName(rng: Rng): string {
  return `${personName(rng)} ${pick(rng, ANGEL_EPITHETS)}`;
}

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

// --- The god's names. The peoples draw the god's face from what they have
// seen it do, and every face gets a name: what a people calls its god is
// the most legible thing about how that people has been treated.
const CREED_TITLES: Record<string, string[]> = {
  life: ["the Giver of Bread", "the Green Hand", "the Rain-Mother", "the Healer Above", "the Warm Breath", "the Lord of Harvests"],
  wrath: ["the Burning One", "the Sky-Hammer", "the Red Eye", "the Terrible", "the Judge Above", "the Thunderer"],
  land: ["the Mountain-Shaper", "the Hand Beneath the Hills", "the World-Wright", "the Sea-Caller", "the Earth-Mover"],
  peace: ["the Peace-Giver", "the Quiet Voice", "the Reconciler", "the Whisperer", "the Still Hand"],
  war: ["the Iron Whisper", "the Spear-Giver", "the Kingmaker", "the Champion's Star", "the Lord of Banners"],
};
const CURSED_TITLES: Record<string, string[]> = {
  life: ["the Fickle Giver", "the Withholder", "the False Spring"],
  wrath: ["the Mocker", "the Cruel Sky", "the Eater of Villages", "the Enemy Above", "the Hateful Star"],
  land: ["the Breaker of Coasts", "the Drowner", "the Unmaker"],
  peace: ["the False Peace", "the Silencer", "the Liar Above"],
  war: ["the Warmonger", "the Setter of Brothers", "the Iron Liar"],
};

export function creedTitle(rng: Rng, aspect: string, cursed: boolean): string {
  return pick(rng, (cursed ? CURSED_TITLES : CREED_TITLES)[aspect] ?? CREED_TITLES.life);
}

const PROPHET_EPITHETS = ["the Voice", "the Seer", "who Hears", "of the Long Sight", "the Listener", "the Hollow-Eyed", "Sky-Touched"];
const DARK_PROPHET_EPITHETS = ["the Accuser", "of the Ashes", "who Curses", "the Unbowed", "Ember-Tongue", "the Bitter"];

export function prophetName(rng: Rng, dark: boolean): string {
  return `${personName(rng)} ${pick(rng, dark ? DARK_PROPHET_EPITHETS : PROPHET_EPITHETS)}`;
}

// What a prophet says the god will do. Each is a kind of act the god can
// actually perform; the prophecy is proven when the god performs it in sight.
const PROPHECIES: Record<string, string[]> = {
  life: ["{g} will make the fields heavy before many winters pass", "{g} will breathe on the sick and the earth alike; the land will bloom at it", "a blessing is coming from {g}; the granaries will not hold it"],
  wrath: ["{g} will strike the proud; fire will fall from a clear sky", "the hand of {g} will fall on this land, and the dead will not be counted", "{g} is angry; a reckoning comes"],
  land: ["the bones of the earth will move at the word of {g}", "{g} will raise the hills, or drown them; the maps will lie", "{g} will remake the shape of the land before this generation is old"],
  peace: ["{g} will still the spears; old hatreds will cool at its touch", "a calm is coming from {g}; enemies will lay down their arms", "{g} will put out the feud-fires"],
  war: ["{g} will raise a champion among us, or wake the old angers of our enemies", "{g} will whet the spears; there is iron in the wind", "a favor is coming from {g}, and it will be spent in blood"],
};
const DARK_PROPHECIES = [
  "{g} will strike us yet; make your fires to the powers beneath",
  "{g} is not done with us; the sky will fall on our houses again",
  "look for no mercy from {g}; its hand is already raised",
];

export function prophecyText(rng: Rng, aspect: string, godName: string, dark: boolean): string {
  return pick(rng, dark ? DARK_PROPHECIES : (PROPHECIES[aspect] ?? PROPHECIES.life)).replace("{g}", godName);
}
