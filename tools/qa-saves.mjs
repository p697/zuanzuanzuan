// Explicit test fixtures, imported through the same visible file flow as player saves.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { Engine } from "../src/core.js";
const data = JSON.parse(
  await readFile(new URL("../public/data/original.json", import.meta.url)),
);
const out = new URL("../test/fixtures/", import.meta.url);
await mkdir(out, { recursive: true });
for (const name of ["shop", "ice", "lava", "boss", "ending"]) {
  const e = new Engine(data);
  e.newGame({ tutorial: false, seed: 1928 });
  e.s.money = 150000;
  e.s.gear = { head: 3, drill: 3, boots: 3 };
  e.s.bagRows = 6;
  e.s.inventory = {
    1: 10,
    9: 10,
    21: 12,
    22: 8,
    24: 2,
    25: 2,
    26: 2,
    23: 2,
    27: 1,
  };
  e.s.special = [true, true, false];
  e.s.unlocked = 3;
  if (name === "ice") e.advance(2);
  if (name === "lava") e.advance(3);
  if (name === "boss" || name === "ending") {
    e.s.stage = 3;
    e.s.special = [true, true, true];
    e.loadMap("boss_map", { bossFor: 2 });
    if (name === "ending")
      e.hitEnemy(
        e.world.entities.find((x) => x.kind === "Boss"),
        3000,
      );
  }
  if (name === "shop") {
    const p = e.source.entities.find((x) => x.type === "Shop");
    e.s.p.x = p.x * 42 + 21;
    e.s.p.y = (p.y + 1) * 42;
  }
  await writeFile(new URL(name + ".json", out), e.serialize());
}
console.log(
  "QA saves written to test/fixtures; use ?profile=qa to isolate browser save storage.",
);
