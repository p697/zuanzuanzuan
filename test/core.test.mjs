import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { Engine, STEP } from "../src/core.js";
const data = JSON.parse(
  await readFile(new URL("../public/data/original.json", import.meta.url)),
);
const fresh = (tutorial = false) => {
  const e = new Engine(data);
  e.newGame({ tutorial, seed: 87591 });
  e.drain();
  return e;
};
const ticks = (e, n, input = {}) => {
  for (let i = 0; i < n; i++) e.tick(input);
};
const place = (e, x, y) => {
  Object.assign(e.s.p, {
    x: x * 42 + 21,
    y: (y + 1) * 42,
    vy: 0,
    vx: 0,
    grounded: true,
    invulnerable: 0,
  });
};

test("原始地图数据完整、主矿区与守门怪位置可靠", () => {
  for (const m of Object.values(data.maps)) {
    assert.equal(m.tiles.length, m.width * m.height);
    assert.equal(m.prop1.length, m.tiles.length);
    assert.equal(m.prop2.length, m.tiles.length);
    assert.ok(m.start.x < m.width);
  }
  const e = fresh();
  assert.equal(
    e.world.entities.filter((x) => x.kind === "ItemDragon").length,
    1,
  );
  assert.equal(
    e.world.entities.find((x) => x.kind === "ItemDragon").x,
    44 * 42 + 21,
  );
});
test("真实输入能挖穿教程土层并收集两块煤，喷气可以原路返回", () => {
  const e = fresh(true);
  ticks(e, 90, { down: true });
  ticks(e, 25, { left: true });
  assert.ok(e.s.tutorialProgress >= 2);
  assert.ok(e.s.stats.mined >= 4);
  assert.ok(e.depth >= 4);
  ticks(e, 7, { right: true });
  ticks(e, 110, { up: true });
  assert.ok(e.depth <= 1);
  assert.equal(e.s.hp, 100);
});
test("矿物每五个占一格，背包满时不销毁尚未采集的矿物", () => {
  const e = fresh();
  e.s.inventory = { 1: 5 };
  assert.equal(e.usedSlots, 1);
  e.addItem(1);
  assert.equal(e.usedSlots, 2);
  e.s.inventory = { 1: 90 };
  assert.equal(e.usedSlots, 18);
  assert.equal(e.canAdd(2), false);
  const i = e.source.tiles.findIndex((t) => t === 81),
    x = i % e.source.width,
    y = Math.floor(i / e.source.width);
  assert.equal(e.breakTile(x, y, true), false);
  assert.equal(e.tile(x, y).tile, 81);
});
test("商店交易原价扣款、购买即装备且禁止降级；特殊矿石不可出售", () => {
  const e = fresh();
  const shop = e.source.entities.find((x) => x.type === "Shop");
  place(e, shop.x, shop.y);
  e.s.money = 1000000;
  assert.equal(e.buy(65).ok, true);
  assert.equal(e.s.money, 650000);
  assert.equal(e.digSpeed, 6);
  assert.equal(e.buy(61).ok, false);
  e.s.inventory = { 9: 5, 21: 2 };
  e.s.special = [true, false, false];
  assert.equal(e.sell(), 25000);
  assert.equal(e.s.inventory[21], 2);
  assert.deepEqual(e.s.special, [true, false, false]);
  assert.equal(e.buy(55).ok, true);
  assert.equal(e.maxAp, 700);
  assert.equal(e.defence, 6);
});
test("喷气与挖掘分别遵循27ms规则、原始装备加成", () => {
  assert.equal(STEP, 27);
  const e = fresh();
  assert.equal(e.boost, 7);
  e.s.gear.boots = 5;
  assert.equal(e.boost, 25);
  e.s.gear.head = 3;
  assert.equal(e.maxAp, 500);
});
test("地面补氧、深度与挖掘增加耗氧，氧气归零持续损血", () => {
  const e = fresh();
  e.s.ap = 10;
  ticks(e, 10);
  assert.equal(e.s.ap, 100);
  place(e, 25, 250);
  let index = 250 * e.source.width + 25;
  e.world.changes[index] = [45, 20];
  e.s.ap = 100;
  e.dig = null;
  e.updateOxygen();
  const idle = 100 - e.s.ap;
  e.s.ap = 100;
  e.dig = { index };
  e.updateOxygen();
  assert.ok(100 - e.s.ap > idle);
  e.s.ap = 0;
  e.s.hp = 100;
  e.updateOxygen();
  assert.equal(e.s.hp, 99.8);
});
test("炸弹引信不受渲染帧率影响，不自伤，一次只命中一个敌人", () => {
  const e = fresh();
  e.s.inventory = { 21: 2 };
  e.world.entities = [
    {
      id: 1,
      kind: "Dragon",
      x: e.s.p.x + 20,
      y: e.s.p.y,
      hp: 100,
      maxHp: 100,
      vy: 0,
      face: 1,
      phase: 0,
      homeX: e.s.p.x,
    },
  ];
  assert.equal(e.use(21).ok, true);
  assert.equal(e.use(21).ok, false);
  const ttl = e.world.bombs[0].ttl;
  assert.equal(ttl, 59);
  for (let i = 0; i < ttl - 1; i++) e.updateBombs();
  assert.equal(e.world.entities[0].dead, undefined);
  e.updateBombs();
  assert.equal(e.world.entities[0].dead, true);
  assert.equal(e.s.hp, 100);
});
test("超威力炸弹只能破脚下岩石，不破边界", () => {
  const e = fresh();
  e.s.inventory = { 23: 2 };
  const x = 20,
    y = 50;
  e.world.changes[y * 60 + x] = [16, 0];
  place(e, x, y - 1);
  assert.equal(e.use(23).ok, true);
  for (let i = 0; i < 60; i++) e.updateBombs();
  assert.equal(e.tile(x, y).prop1, 20);
  place(e, x, e.source.height - 3);
  assert.equal(e.use(23).ok, false);
});
test("钥匙可靠掉落，满背包可稍后拾取，Boss重试不重复收费", () => {
  const e = fresh(),
    guardian = e.world.entities.find((x) => x.kind === "ItemDragon");
  e.s.inventory = { 1: 90 };
  e.hitEnemy(guardian, 200);
  assert.equal(e.world.drops.at(-1).code, 82);
  Object.assign(e.s.p, { x: guardian.x, y: guardian.y });
  e.updateDrops();
  assert.equal(e.s.inventory[82], undefined);
  e.takeItem(1, 5);
  e.updateDrops();
  assert.equal(e.s.inventory[82], 1);
  const door = e.source.entities.find((x) => x.type === "BossRoom");
  place(e, door.x, door.y);
  assert.equal(e.interact(), "boss");
  assert.equal(e.s.inventory[82], undefined);
  assert.equal(e.s.map, "boss_map");
  e.rescue();
  place(e, door.x, door.y);
  assert.equal(e.interact(), "boss");
});
test("Boss房氧气站提供可持续炸弹补给，避免弹药耗尽软锁", () => {
  const e = fresh();
  e.loadMap("boss_map", { bossFor: 1 });
  place(e, 7, 23);
  e.s.tick = 124;
  e.s.ap = 1;
  e.tick({});
  assert.ok(e.s.ap > 1);
  assert.equal(e.s.inventory[21], 1);
});
test("完整关键流程：教程→矿区1→守关Boss→矿区2→矿区3→圆满结局", () => {
  const e = fresh(true);
  for (let i = 0; i < 3; i++) {
    e.s.tutorialProgress = i === 0 ? 2 : i === 1 ? 10 : 1;
    e.finishTutorial();
  }
  assert.equal(e.s.map, "stage1_map");
  assert.equal(e.s.money, 300);
  e.collectSpecial(0);
  const g = e.world.entities.find((x) => x.kind === "ItemDragon");
  e.hitEnemy(g, 200);
  Object.assign(e.s.p, { x: g.x, y: g.y });
  e.updateDrops();
  const door = e.source.entities.find((x) => x.type === "BossRoom");
  place(e, door.x, door.y);
  e.interact();
  const boss = e.world.entities.find((x) => x.kind === "SubBoss");
  assert.equal(boss.hp, 1000);
  e.hitEnemy(boss, 1000);
  assert.ok(e.drain().some((x) => x.type === "advance" && x.stage === 2));
  e.advance(2);
  const point = e.world.special;
  assert.equal(point, 389 * 60 + 15);
  e.breakTile(15, 389, true);
  assert.equal(e.s.special[1], true);
  assert.ok(e.drain().some((x) => x.type === "advance" && x.stage === 3));
  e.advance(3);
  e.collectSpecial(2);
  e.loadMap("boss_map", { bossFor: 2 });
  const final = e.world.entities.find((x) => x.kind === "Boss");
  assert.equal(final.hp, 3000);
  e.hitEnemy(final, 3000);
  assert.equal(e.s.ending, "happy");
  assert.equal(e.s.complete, true);
});
test("缺少特殊矿石时保留普通结局分支", () => {
  const e = fresh();
  e.s.stage = 3;
  e.loadMap("boss_map", { bossFor: 2 });
  e.hitEnemy(
    e.world.entities.find((x) => x.kind === "Boss"),
    3000,
  );
  assert.equal(e.s.ending, "normal");
});

test("真实逻辑时钟下使用有限炸弹与急救箱可击败最终Boss，没有无敌或直接扣Boss血", () => {
  const e = fresh();
  e.newGame({ tutorial: false, seed: 1 });
  e.s.stage = 3;
  e.s.gear = { head: 5, drill: 5, boots: 5 };
  e.s.bagRows = 6;
  e.s.inventory = { 21: 10, 22: 20, 24: 5, 26: 1 };
  e.s.special = [true, true, true];
  e.loadMap("boss_map", { bossFor: 2 });
  let bombs = 0;
  for (let n = 0; n < 6000 && !e.s.complete && e.running; n++) {
    const boss = e.world.entities.find((x) => x.kind === "Boss");
    if (e.s.hp < 50 && e.s.inventory[24]) e.use(24);
    if (e.s.ap < 200 && e.s.inventory[26]) e.use(26);
    if (
      Math.abs(boss.x - e.s.p.x) < 90 &&
      !e.world.bombs.length &&
      e.use(e.s.inventory[22] ? 22 : 21).ok
    )
      bombs++;
    e.tick({});
    e.drain();
  }
  assert.equal(e.s.ending, "happy");
  assert.ok(e.s.hp > 0);
  assert.ok(bombs >= 15);
  assert.ok(e.s.tick > 500);
});
test("保存恢复保留已挖地图、敌人、道具、特殊矿和位置；损坏存档原子拒绝", () => {
  const e = fresh();
  e.s.inventory = { 21: 3 };
  e.s.special[0] = true;
  const i = e.source.tiles.findIndex((t) => t === 56);
  e.breakTile(i % 60, Math.floor(i / 60), true);
  e.world.entities[0].hp = 50;
  const text = e.serialize(),
    other = fresh();
  other.restore(text);
  assert.deepEqual(other.s, e.s);
  const before = other.serialize();
  for (const mutation of [
    (s) => {
      s.gear.drill = 9;
    },
    (s) => {
      s.quick = null;
    },
    (s) => {
      s.worlds.stage1_map.changes[9999999] = [45, 20];
    },
    (s) => {
      s.p.x = -1;
    },
  ]) {
    const bad = JSON.parse(text);
    mutation(bad.state);
    assert.throws(() => other.restore(JSON.stringify(bad)));
    assert.equal(
      other.serialize().replace(/"savedAt":"[^"]+"/, ""),
      before.replace(/"savedAt":"[^"]+"/, ""),
    );
  }
});
test("救援只奖励一次，所有物品表至少具备中文与韩文数据", () => {
  const e = fresh();
  e.advance(2);
  place(e, 6, 239);
  e.interact();
  assert.equal(e.s.money, 100000);
  e.interact();
  assert.equal(e.s.money, 100000);
  for (const i of data.items) assert.ok(i.name["zh-CN"] && i.name.ko);
});
