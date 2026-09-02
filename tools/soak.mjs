// Headless soak. From the repo root:
//   node tools/soak.mjs years=300 seeds=1,2,3 god=absent|kind|cruel|mixed|split|verbs "grep=phrase;phrase" show=2 tail=20
// god policies: absent does nothing; kind blesses, heals, soothes, anoints; cruel smites, provokes, chills;
// mixed flips a coin; split is kind in the west and cruel in the east; verbs exercises the second-wave verbs.
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const here = new URL(".", import.meta.url).pathname;
execSync(`npx esbuild ${here}soak-entry.ts --bundle --format=esm --platform=node --log-level=error --outfile=${here}.soak-bundle.mjs`);
const S = await import(pathToFileURL(`${here}.soak-bundle.mjs`).href + `?t=${Date.now()}`);
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")));
const years = Number(args.years ?? 300);
const seeds = (args.seeds ?? "1,2,3").split(",").map(Number);
const god = args.god ?? "absent";
const greps = (args.grep ?? "").split(";").filter(Boolean);
const showN = Number(args.show ?? 0);
const verbose = args.verbose === "1";

function pickPop(w, rng) { return w.pops.length ? w.pops[Math.floor(rng() * w.pops.length)] : null; }

for (const seed of seeds) {
  const w = S.createWorld(seed);
  const t0 = performance.now();
  let rngState = seed * 7919;
  const rng = () => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState / 0x7fffffff; };
  for (let y = 0; y < years; y++) {
    for (let s = 0; s < 4; s++) S.tick(w);
    if (god !== "absent" && god !== "verbs" && y % 3 === 0) {
      const p = pickPop(w, rng);
      if (!p) continue;
      const kind = god === "mixed" ? (rng() < 0.5 ? "kind" : "cruel") : god === "split" ? (p.x < w.width / 2 ? "kind" : "cruel") : god;
      if (kind === "kind") {
        const r = rng();
        if (r < 0.4) S.blessFertility(w, p.x, p.y);
        else if (r < 0.6) S.healPestilence(w, p.x, p.y);
        else if (r < 0.8) S.soothe(w, p.x, p.y);
        else S.anoint(w, p.x, p.y);
      } else {
        const r = rng();
        if (r < 0.5) S.smite(w, p.x, p.y);
        else if (r < 0.8) S.provoke(w, p.x, p.y);
        else S.shiftTemperature(w, p.x, p.y, -1);
      }
    }
    if (god === "verbs" && y % 2 === 0) {
      const r = rng();
      const p = pickPop(w, rng);
      if (!p) continue;
      if (r < 0.15) S.dream(w, p.x, p.y, ["conquest","dynasty","renown","immortality"][Math.floor(rng()*4)]);
      else if (r < 0.3) { const yk = w.pops.filter(q => q.yoke); const t = yk.length ? yk[Math.floor(rng()*yk.length)] : p; S.unyoke(w, t.x, t.y); }
      else if (r < 0.45) { const a = w.armies.length ? w.armies[Math.floor(rng()*w.armies.length)] : null; S.embolden(w, a ? a.x : p.x, a ? a.y : p.y); }
      else if (r < 0.6) { const lost = w.artifacts.filter(a => a.holder === null && a.lostAt); const ru = [...w.ruins.values()].filter(r => r.tier >= 2 && !r.plundered); const t = lost.length ? lost[Math.floor(rng()*lost.length)].lostAt : ru.length ? ru[Math.floor(rng()*ru.length)] : p; S.reveal(w, t.x, t.y); }
      else if (r < 0.75) { const bs = w.beasts.filter(b => b.alive); const b = bs.length ? bs[Math.floor(rng()*bs.length)] : null; S.becalm(w, b ? b.x : p.x, b ? b.y : p.y); }
      else if (r < 0.85) S.callStorm(w, p.x, p.y);
      else if (r < 0.92) S.unleashBeast(w, "demon", p.x, p.y);
      else S.smite(w, p.x, p.y);
    }
  }
  const ms = performance.now() - t0;
  let souls = 0; for (const p of w.pops) souls += p.count;
  const living = new Set(w.pops.map((p) => p.culture));
  const races = new Set([...living].map((c) => w.cultures.get(c).race));
  let nations = 0; for (const c of living) if (w.cultures.get(c)?.polity) nations++;
  const lpy = (w.events.length / years).toFixed(1);
  const big = w.events.filter((e) => e.importance === 3).length;
  console.log(`\n=== seed ${seed} · ${years}y · ${(ms/1000).toFixed(1)}s · god=${god} ===`);
  console.log(`souls ${souls.toLocaleString()} · cultures ${living.size} · races ${races.size}/6 (${[...races].join(",")}) · nations ${nations} · pops ${w.pops.length}`);
  console.log(`wars now ${w.wars.size} · past wars ${w.pastWars.length} · alliances ${w.alliances.size} · beasts alive ${w.beasts.filter(b=>b.alive).length} · artifacts ${w.artifacts.length} · age: ${w.age}`);
  console.log(`chronicle ${w.events.length} lines (${lpy}/yr) · big beats ${big} · figures alive ${w.figures.filter(f=>f.alive).length}`);
  const faiths = [...living].map((c) => w.cultures.get(c)).map((c) => `${c.name}:${c.faith}`);
  if (verbose) console.log("faith:", faiths.join(" "));
  for (const g of greps) {
    const re = new RegExp(g, "i");
    const hits = w.events.filter((e) => re.test(e.text));
    console.log(`  grep "${g}": ${hits.length}`);
    for (const e of hits.slice(0, showN)) console.log(`    y${e.year}: ${e.text}`);
  }
  if (args.tail) {
    for (const e of w.events.filter((e) => e.importance === 3).slice(-Number(args.tail))) console.log(`  y${e.year}: ${e.text}`);
  }
}
