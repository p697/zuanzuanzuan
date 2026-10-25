import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { Engine } from "../src/core.js";
import {
  hitRects,
  playerRect,
  state,
  overlaps,
} from "../src/native-mechanics.js";
import { storyQueues } from "../src/story-flow.js";
const data = JSON.parse(
  await readFile(new URL("../public/data/original.json", import.meta.url)),
);
function fresh(boss) {
  const e = new Engine(data);
  e.newGame({ tutorial: false, seed: 1 });
  if (boss) e.loadMap("boss_map", { bossFor: boss });
  e.drain();
  return e;
}
function actions(e, n) {
  for (let i = 0; i < n; i++) e.updateEnemies();
}
function room(kind = 2) {
  const e = fresh(kind),
    b = e.world.entities.find((x) => x.kind.includes("Boss"));
  e.s.p.x = 200;
  e.s.p.y = b.y;
  e.s.camera.y = b.y - 300;
  e.s.p.invulnerable = 999;
  return [e, b];
}
test("原始受击框与地形探测分离；首领挥臂使用逐帧碰撞框", () => {
  assert.deepEqual(
    playerRect({ x: 100, y: 100, face: 1 }),
    [88, 73.5, 110, 95.5],
  );
  const b = {
    kind: "SubBoss",
    x: 500,
    y: 400,
    face: 1,
    state: "summon",
    animTime: 0,
  };
  const frames = Array.from({ length: 48 }, (_, i) => {
    b.animTime = i / 30;
    return hitRects(b);
  });
  assert.ok(new Set(frames.map(JSON.stringify)).size > 10);
  assert.ok(frames.some((rs) => rs.some((r) => r[2] > 700 || r[0] < 300)));
  const p = { x: 100, y: 100, face: 1 };
  assert.ok(!overlaps([100, 97, 105, 100], playerRect(p)));
});
test("攻击第101逻辑帧启动，普通攻击31帧结束；飞拳由动作第11帧生成", () => {
  const [e, b] = room();
  actions(e, 100);
  assert.ok(!b.attacking);
  actions(e, 1);
  assert.equal(b.state, "attack");
  actions(e, 12);
  assert.equal(e.world.projectiles.length, 0);
  actions(e, 1);
  assert.equal(e.world.projectiles.length, 1);
  actions(e, 17);
  assert.equal(b.attacking, true);
  actions(e, 1);
  assert.equal(b.attacking, false);
  assert.equal(b.attackDelay, 31);
});
test("最终Boss低于70%召唤，每4帧一只、最多8只，普通召唤怪不计分", () => {
  const [e, b] = room();
  b.hp = 2000;
  actions(e, 101);
  assert.equal(b.state, "summon");
  actions(e, 3);
  assert.equal(e.world.entities.filter((x) => x.summoner === b.id).length, 0);
  actions(e, 1);
  assert.equal(e.world.entities.filter((x) => x.summoner === b.id).length, 1);
  actions(e, 28);
  assert.equal(e.world.entities.filter((x) => x.summoner === b.id).length, 8);
  actions(e, 29);
  assert.equal(b.attacking, false);
  const mob = e.world.entities.find((x) => x.summoner === b.id);
  assert.equal(mob.aiVersion, 2);
  e.hitEnemy(mob, 100);
  assert.equal(e.s.score, 0);
});
test("守关Boss第600帧开始召唤，之后每200帧；40%以下使用长挥臂", () => {
  const [e, b] = room(1);
  actions(e, 599);
  assert.equal(e.world.entities.filter((x) => x.summoner === b.id).length, 0);
  actions(e, 1);
  assert.equal(e.world.entities.filter((x) => x.summoner === b.id).length, 1);
  actions(e, 200);
  assert.equal(e.world.entities.filter((x) => x.summoner === b.id).length, 2);
  b.hp = 399;
  b.attacking = false;
  b.attackDelay = 100;
  actions(e, 1);
  assert.equal(b.state, "summon");
  assert.equal(b.attackTimer, 60);
});
test("怪物按可见纵向带激活，横向画外怪物仍活动；大型怪物腾空不横移", () => {
  const e = fresh(),
    b = e.world.entities.find((x) => x.kind === "BigDragon");
  e.world.entities = [b];
  b.y = e.s.p.y;
  b.x = 1000;
  b.airborne = true;
  b.vy = -5;
  e.s.camera = { x: 0, y: b.y - 300 };
  const x = b.x;
  actions(e, 1);
  assert.equal(b.x, x);
  assert.notEqual(b.vy, -5);
  const phase = b.phase;
  e.s.camera.y = b.y + 1;
  actions(e, 1);
  assert.equal(b.phase, phase);
  b.kind = "Dragon";
  e.s.camera.y = b.y - 300;
  b.airborne = true;
  actions(e, 1);
  assert.equal(b.x, x + 2);
});
test("挖掘裂纹可续挖和存档，玩家与怪物共享7段破土进度", () => {
  const e = fresh();
  const idx = e.source.tiles.findIndex(
      (t, i) => t !== 16 && t !== 50 && t < 73 && e.source.prop1[i] < 20,
    ),
    x = idx % 60,
    y = Math.floor(idx / 60);
  assert.ok(idx >= 0);
  for (let i = 0; i < 5; i++) e.digAt(x, y, "digside");
  const n = e.world.drilling[idx];
  assert.ok(n > 0 && n < 7);
  e.dig = null;
  const saved = e.serialize(),
    other = fresh();
  other.restore(saved);
  assert.equal(other.world.drilling[idx], n);
  const mob = {};
  for (let i = 0; i < 40 && other.tile(x, y).prop1 < 20; i++)
    other.digEnemy(mob, x, y);
  assert.equal(other.tile(x, y).prop1, 20);
  assert.equal(other.world.drilling[idx], undefined);
});
test("受击不瞬移，500ms动作锁、2550ms保护；墙地探测防止穿块", () => {
  const e = fresh();
  const x = e.s.p.x;
  e.s.p.invulnerable = 0;
  e.damage(30, "enemy", x + 100);
  assert.equal(e.s.p.x, x);
  assert.equal(e.s.p.vy, -7);
  assert.equal(e.s.p.stunMs, 500);
  assert.equal(e.s.p.invulnerable, 95);
  const hp = e.s.hp;
  e.damage(30, "enemy", x);
  assert.equal(e.s.hp, hp);
  e.tick({ right: true });
  assert.equal(e.s.p.x, x);
  e.world.changes[20 * 60 + 20] = [16, 0];
  const body = { x: 20 * 42 - 20, y: 21 * 42 };
  e.move(body, 100, 0);
  assert.ok(body.x + 15 < 20 * 42);
  assert.ok(e.fits(body.x, body.y));
});
test("飞拳无敌接触不消失，30fps追踪结束后直飞，死亡动画34帧", () => {
  const e = fresh();
  e.s.p.invulnerable = 100;
  const p = {
    id: 999,
    kind: "BossArm",
    x: e.s.p.x,
    y: e.s.p.y - 15,
    face: 1,
    angle: 0,
    age: 29,
    speed: 3,
    turn: 0.05,
    life: 200,
    clock: 0,
    state: "move",
    animTime: 0,
  };
  e.world.projectiles = [p];
  e.updateProjectiles();
  e.updateProjectiles();
  assert.equal(p.angle, 0);
  assert.equal(p.state, "move");
  state(p, "dead");
  for (let i = 0; i < 40; i++) e.updateProjectiles();
  assert.equal(e.world.projectiles.length, 1);
  for (let i = 0; i < 3; i++) e.updateProjectiles();
  assert.equal(e.world.projectiles.length, 0);
});
test("剧情顺序包含全部13段，文件存在；保存原子拒绝伪造章节及进度", async () => {
  const movies = JSON.parse(
    await readFile(new URL("../public/data/movies.json", import.meta.url)),
  );
  assert.equal(Object.keys(movies).length, 13);
  assert.deepEqual(storyQueues.quest3, [
    "quest2",
    "loading1",
    "loading3",
    "quest3",
  ]);
  assert.deepEqual(storyQueues.rescue, ["quest6"]);
  for (const id of new Set(Object.values(storyQueues).flat())) {
    const m = movies[id]["zh-CN"];
    assert.equal(m.fps, 30);
    assert.equal(m.frames / m.fps, m.duration);
    assert.ok(
      (await stat(new URL("../public" + m.src, import.meta.url))).size > 100000,
    );
  }
  const e = fresh();
  e.s.cutscene = { id: "opening", index: 0, time: 21.5 };
  const saved = e.serialize(),
    other = fresh();
  other.restore(saved);
  assert.deepEqual(other.s.cutscene, e.s.cutscene);
  for (const bad of [
    { id: "unknown", index: 0, time: 0 },
    { id: "opening", index: 2, time: 0 },
    { id: "opening", index: 0, time: -1 },
  ]) {
    const s = JSON.parse(saved);
    s.state.cutscene = bad;
    assert.throws(() => other.restore(JSON.stringify(s)));
    assert.deepEqual(other.s.cutscene, e.s.cutscene);
  }
});
test("死亡完整播放两秒后结算，复活道具先死亡再复活动作且可续档", () => {
  const e = fresh();
  e.s.hp = 0;
  e.die();
  assert.equal(e.s.p.anim, "dead");
  e.s.inventory[24] = 1;
  assert.equal(e.use(24).ok, false);
  assert.equal(e.s.inventory[24], 1);
  assert.ok(e.running);
  for (let i = 0; i < 74; i++) e.tick();
  assert.ok(!e.drain().some((x) => x.type === "dead"));
  e.tick();
  assert.ok(e.drain().some((x) => x.type === "dead"));
  assert.equal(e.running, false);
  const r = fresh();
  r.s.inventory[83] = 1;
  r.s.hp = 0;
  r.die();
  const restored = fresh();
  restored.restore(r.serialize());
  for (let i = 0; i < 75; i++) restored.tick();
  assert.equal(restored.s.hp, 100);
  assert.equal(restored.s.p.anim, "revive");
  assert.equal(restored.s.inventory[83], undefined);
  for (let i = 0; i < 43; i++) restored.tick();
  assert.equal(restored.s.p.reviveMs, 0);
  assert.ok(restored.running);
});
test("首次推进播放原版章节，回访矿区和结局后继续探索不重复剧情", () => {
  const e = fresh();
  e.advance(2);
  assert.deepEqual(
    e
      .drain()
      .filter((x) => x.type === "story")
      .map((x) => x.id),
    ["quest3"],
  );
  e.advance(1);
  assert.equal(e.drain().filter((x) => x.type === "story").length, 0);
  e.advance(2);
  assert.equal(e.drain().filter((x) => x.type === "story").length, 0);
  e.advance(3, { playStory: false });
  assert.equal(e.drain().filter((x) => x.type === "story").length, 0);
});
test("怪物碰到天花板后转为下落，不误判落地或穿越墙体", () => {
  const e = fresh(),
    b = e.world.entities.find((x) => x.kind === "BigDragon");
  e.world.entities = [b];
  b.x = 20 * 42 + 21;
  b.y = 21 * 42 + 30;
  b.vy = -12;
  b.airborne = true;
  e.s.camera.y = b.y - 300;
  for (let x = 19; x <= 21; x++) {
    e.world.changes[20 * 60 + x] = [16, 0];
    e.world.changes[21 * 60 + x] = [45, 20];
    e.world.changes[22 * 60 + x] = [45, 20];
  }
  e.updateEnemies();
  assert.equal(b.vy, 0);
  assert.equal(b.airborne, true);
  const y = b.y;
  e.updateEnemies();
  assert.ok(b.y > y);
  assert.ok(!e.drain().some((x) => x.type === "slam"));
});
