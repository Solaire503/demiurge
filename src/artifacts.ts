import * as C from "./constants";
import { artifactName } from "./names";
import type { Artifact, World } from "./world";
import { areKin, describeLocation, logEvent } from "./world";

// --- Named artifacts with provenance. A treasure is made once, then moves
// only by recorded events: looted in a sack, returned with a peace, lost
// when its people pass into memory, raised from the rubble by descendants.
// The provenance chain is the story; a looted treasure held by strangers is
// a standing grievance that does not fade while it is held.

export function mintArtifact(
  world: World,
  kind: Artifact["kind"],
  maker: string,
  note: string,
  at?: { x: number; y: number },
  announce = true,
): Artifact {
  const artifact: Artifact = {
    id: world.nextArtifactId++,
    name: artifactName(world.rng, kind, maker),
    kind,
    maker,
    made: world.year,
    holder: maker,
    lostAt: null,
    provenance: [{ year: world.year, note }],
  };
  world.artifacts.push(artifact);
  if (announce) {
    logEvent(world, `${note.charAt(0).toUpperCase()}${note.slice(1)}: ${artifact.name}.`, 2, {
      subjects: [maker],
      at,
    });
  }
  return artifact;
}

export function heldBy(world: World, culture: string): Artifact[] {
  return world.artifacts.filter((a) => a.holder === culture);
}

// A sacked settlement gives up a treasure — at most one per sack
export function lootArtifacts(world: World, from: string, to: string, where: string, at: { x: number; y: number }): void {
  const prize = world.artifacts.find((a) => a.holder === from);
  if (!prize || world.rng() >= C.ARTIFACT_LOOT_CHANCE) return;
  prize.holder = to;
  prize.provenance.push({ year: world.year, note: `torn from the ${from} in the sack of ${where}` });
  logEvent(world, `${prize.name} is torn from the ${from}; the ${to} carry it home.`, 2, {
    subjects: [from, to],
    at,
  });
}

// Peace can send stolen things home — closure the chronicle loves
export function peaceReturns(world: World, attackers: string[], defenders: string[]): void {
  const sideA = new Set(attackers);
  const sideB = new Set(defenders);
  for (const artifact of world.artifacts) {
    if (!artifact.holder || artifact.holder === artifact.maker) continue;
    const holderA = sideA.has(artifact.holder);
    const makerB = sideB.has(artifact.maker);
    const holderB = sideB.has(artifact.holder);
    const makerA = sideA.has(artifact.maker);
    if (!((holderA && makerB) || (holderB && makerA))) continue;
    if (world.rng() >= C.ARTIFACT_RETURN_CHANCE) continue;
    const from = artifact.holder;
    artifact.holder = artifact.maker;
    artifact.provenance.push({ year: world.year, note: `returned to the ${artifact.maker} with the peace` });
    logEvent(world, `With the peace, ${artifact.name} is returned to the ${artifact.maker} by the ${from}.`, 2, {
      subjects: [artifact.maker, from],
    });
  }
}

// A people passes into memory; what they held falls where they fell
export function strandArtifacts(world: World, culture: string, at: { x: number; y: number }): void {
  for (const artifact of world.artifacts) {
    if (artifact.holder !== culture) continue;
    artifact.holder = null;
    artifact.lostAt = { ...at };
    artifact.provenance.push({ year: world.year, note: `lost when the ${culture} passed into memory` });
    logEvent(world, `${artifact.name} lies lost in ${describeLocation(world, at.x, at.y)}, and none now hold it.`, 2, {
      subjects: [culture],
      at,
    });
  }
}

// Descendants who return to old ground may raise more than stones from it
export function recoverArtifacts(world: World, culture: string, x: number, y: number): void {
  for (const artifact of world.artifacts) {
    if (artifact.holder !== null || !artifact.lostAt) continue;
    if (Math.max(Math.abs(artifact.lostAt.x - x), Math.abs(artifact.lostAt.y - y)) > C.ARTIFACT_RECOVER_RADIUS) continue;
    if (artifact.maker !== culture && !areKin(world, artifact.maker, culture)) continue;
    artifact.holder = culture;
    artifact.lostAt = null;
    artifact.provenance.push({ year: world.year, note: `raised from the rubble by the ${culture}` });
    logEvent(world, `Raised from the rubble: ${artifact.name} returns to the hands of the ${culture}.`, 3, {
      subjects: [culture],
      at: { x, y },
    });
  }
}

// Master smiths: great nations at their height sometimes add to the world's
// treasure on their own — a yearly whisper of a chance per imperial forge
export function forgeTick(world: World): void {
  if (world.artifacts.length >= C.ARTIFACT_CAP) return;
  const living = new Set(world.pops.map((p) => p.culture));
  for (const name of living) {
    const culture = world.cultures.get(name);
    if (!culture?.polity || culture.polity.rank < 2) continue;
    if (!world.pops.some((p) => p.culture === name && p.tier >= 3)) continue;
    if (world.rng() >= C.ARTIFACT_FORGE_CHANCE) continue;
    const seat = world.pops.filter((p) => p.culture === name).sort((a, b) => b.count - a.count)[0];
    mintArtifact(
      world,
      world.rng() < 0.6 ? "blade" : "idol",
      name,
      `in the forges of the ${name}, a master's work is finished`,
      seat ? { x: seat.x, y: seat.y } : undefined,
    );
  }
}
