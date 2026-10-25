import { validCutscene } from "./story-flow.js";
import {
  updateNativeEnemies,
  updateNativeProjectiles,
  overlaps,
  hitRects,
  blastRect,
  state as actorState,
} from "./native-mechanics.js";
// Independently implemented simulation. Source data is read-only; saves contain deltas.
export const TILE = 42;
export const STEP = 27; // Original TileView timer, distinct from its 30 fps animation clock.
export const SAVE_VERSION = 1;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const ENEMY_HP = {
  Dragon: 100,
  Dragon2: 100,
  Dragon3: 100,
  BigDragon: 200,
  BigDragon2: 200,
  ItemDragon: 200,
  SubBoss: 1000,
  Boss: 3000,
};
const MAPS = [
  "tutorial1_map",
  "tutorial2_map",
  "tutorial3_map",
  "stage1_map",
  "stage2_map",
  "stage3_map",
];
export class Engine {
  constructor(data) {
    this.data = data;
    this.catalog = new Map(data.items.map((i) => [i.code, i]));
    this.events = [];
    this.running = false;
    this.s = null;
  }
  emit(type, detail = {}) {
    this.events.push({ type, ...detail });
  }
  drain() {
    return this.events.splice(0);
  }
  newGame({ tutorial = true, seed = Date.now() >>> 0 } = {}) {
    this.events = [];
    this.tutorialNotified = false;
    this.s = {
      version: SAVE_VERSION,
      seed,
      randomState: seed || 1,
      stage: tutorial ? -1 : 1,
      tutorial: tutorial ? 1 : 0,
      map: "",
      tick: 0,
      money: 0,
      score: 0,
      hp: 100,
      ap: 100,
      gear: { head: 0, drill: 0, boots: 0 },
      bagRows: 3,
      inventory: {},
      special: [false, false, false],
      worlds: {},
      unlocked: 1,
      rescued: false,
      complete: false,
      ending: null,
      portal: null,
      bossFor: 0,
      quick: [24, 25, 21, 22, 23],
      stats: { mined: 0, kills: 0, depth: 0 },
      tutorialProgress: 0,
      tutorialTime: 120,
      p: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        face: 1,
        grounded: false,
        invulnerable: 0,
        anim: "idle",
      },
      visited: {},
    };
    this.loadMap(tutorial ? "tutorial1_map" : "stage1_map");
    this.running = true;
    if (tutorial) this.emit("story", { id: "tutorial1" });
    else this.emit("story", { id: "opening" });
    this.emit("checkpoint");
  }
  get maxHp() {
    return 100;
  }
  get maxAp() {
    return [100, 200, 300, 500, 600, 700][this.s.gear.head];
  }
  get digSpeed() {
    return this.s.gear.drill + 1;
  }
  get boost() {
    return [7, 10, 15, 18, 21, 25][this.s.gear.boots];
  }
  get defence() {
    return [0, 1, 2, 4, 5, 6][this.s.gear.head];
  }
  get depth() {
    return this.s.map === "boss_map"
      ? 666
      : Math.max(0, Math.floor((this.s.p.y - 1) / TILE) - this.source.start.y);
  }
  get source() {
    return this.data.maps[this.s.map];
  }
  get world() {
    return this.s.worlds[this.worldKey];
  }
  get worldKey() {
    return this.s.map === "boss_map" ? `boss${this.s.bossFor}` : this.s.map;
  }
  get capacity() {
    return this.s.bagRows * 6;
  }
  get usedSlots() {
    return Object.entries(this.s.inventory).reduce(
      (a, [code, n]) => a + (+code < 10 ? Math.ceil(n / 5) : n),
      0,
    );
  }
  get inTutorial() {
    return this.s.tutorial > 0;
  }
  makeWorld(name, bossFor = 0) {
    const m = this.data.maps[name],
      random = rng(this.s.seed + MAPS.indexOf(name) * 9871),
      soil = [];
    for (let i = 0; i < m.tiles.length; i++)
      if (m.tiles[i] >= 56 && m.tiles[i] <= 59) soil.push(i);
    const special =
      name === "stage2_map"
        ? 389 * m.width + 15
        : soil.length
          ? soil[
              Math.floor((soil.length * 2) / 3) +
                Math.floor(random() * Math.floor(soil.length / 3))
            ]
          : -1;
    const entities = (m.runtimeEntities || m.entities)
      .filter((e) => ENEMY_HP[e.type] || e.code === 100)
      .map((e, i) => {
        const kind =
          e.code === 100 ? (bossFor === 1 ? "SubBoss" : "Boss") : e.type;
        return {
          id: i,
          kind,
          x: e.x * TILE + 21,
          y: (e.y + 1) * TILE,
          homeX: e.x * TILE + 21,
          face: 1,
          direction: 1,
          aiVersion: 2,
          state: "idle",
          animTime: 0,
          hp: ENEMY_HP[kind] || 100,
          maxHp: ENEMY_HP[kind] || 100,
          vy: 0,
          phase: 0,
          dead: false,
        };
      });
    return {
      changes: {},
      drilling: {},
      special,
      entities,
      bombs: [],
      projectiles: [],
      drops: [],
      portal: null,
      discovered: {},
    };
  }
  loadMap(name, { bossFor = 0, restorePosition = false } = {}) {
    if (!this.data.maps[name]) throw new Error("Unknown map");
    this.s.map = name;
    this.s.bossFor = bossFor;
    const key = this.worldKey;
    if (!this.s.worlds[key]) this.s.worlds[key] = this.makeWorld(name, bossFor);
    if (!restorePosition) {
      const start = this.source.start;
      Object.assign(this.s.p, {
        x: start.x * TILE + 21,
        y: (start.y + 1) * TILE,
        vx: 0,
        vy: 0,
        grounded: false,
        invulnerable: 50,
        anim: "idle",
        animTime: 0,
        lastAnim: "idle",
        stunMs: 0,
        deathMs: 0,
        reviveMs: 0,
        rebirthPending: false,
      });
    }
    this.s.hp = 100;
    this.s.ap = this.maxAp;
    this.s.portal = null;
    this.dig = null;
    this.effects = [];
    this.s.visited[key] = true;
    this.s.transition = null;
    this.resetCamera();
    this.emit("map", { name });
  }
  tile(x, y) {
    const m = this.source;
    if (x < 0 || y < 0 || x >= m.width || y >= m.height)
      return { tile: 16, prop1: 0, prop2: 0, index: -1 };
    const i = y * m.width + x,
      c = this.world.changes[i];
    return {
      index: i,
      tile: c?.[0] ?? m.tiles[i],
      prop1: c?.[1] ?? m.prop1[i],
      prop2: m.prop2[i],
    };
  }
  solid(x, y) {
    return this.tile(x, y).prop1 < 20;
  }
  fits(x, y, half = 15, height = 29) {
    return (
      !this.solid(
        Math.floor((x - half - 1) / TILE),
        Math.floor((y - 1) / TILE),
      ) &&
      !this.solid(Math.floor((x + half) / TILE), Math.floor((y - 1) / TILE)) &&
      !this.solid(
        Math.floor((x - half - 1) / TILE),
        Math.floor((y - height) / TILE),
      ) &&
      !this.solid(
        Math.floor((x + half) / TILE),
        Math.floor((y - height) / TILE),
      )
    );
  }
  move(body, dx, dy, half = 15, height = 29) {
    let blockedX = false,
      blockedY = false;
    const advance = (delta, axis) => {
      let left = Math.abs(delta),
        sign = Math.sign(delta);
      while (left > 0) {
        let d = Math.min(1, left) * sign;
        const x = body.x + (axis === "x" ? d : 0),
          y = body.y + (axis === "y" ? d : 0);
        if (!this.fits(x, y, half, height)) {
          if (axis === "x") blockedX = true;
          else blockedY = true;
          break;
        }
        body[axis] += d;
        left -= Math.abs(d);
      }
    };
    advance(dx, "x");
    advance(dy, "y");
    return { blockedX, blockedY };
  }
  randomInt(max) {
    let x = this.s.randomState ?? (this.s.seed || 1);
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s.randomState = x >>> 0;
    return Math.floor((this.s.randomState / 4294967296) * max);
  }
  nextEntityId() {
    return (
      1 +
      Math.max(
        0,
        ...this.world.entities.map((e) => e.id),
        ...this.world.projectiles.map((e) => e.id || 0),
      )
    );
  }
  resetCamera() {
    this.s.camera = {
      x: clamp(
        this.s.p.x - 340,
        0,
        Math.max(0, this.source.width * TILE - 640),
      ),
      y: Math.max(0, this.s.p.y - 300),
    };
  }
  updateCamera() {
    if (!this.s.camera) this.resetCamera();
    const c = this.s.camera,
      p = this.s.p,
      width = this.source.width * TILE;
    if (p.x < 150) c.x = 0;
    else if (p.x > width - 300) c.x = width - 640;
    else if (p.x - c.x > 340) c.x = p.x - 340;
    else if (p.x - c.x < 150) c.x = p.x - 150;
    const dy = Math.trunc(p.y - 300 - c.y);
    if (p.y > 200 && dy) c.y += Math.trunc(dy / 10) || Math.sign(dy);
    c.y = Math.max(0, c.y);
    c.x = clamp(c.x, 0, Math.max(0, width - 640));
  }
  finishTransition() {
    const transition = this.s.transition;
    if (!transition) return;
    transition.remaining -= STEP;
    if (transition.remaining > 0) return;
    this.s.transition = null;
    if (transition.kind === "ending") {
      this.s.complete = true;
      this.s.ending = this.s.special.every(Boolean) ? "happy" : "normal";
      this.running = false;
      this.emit("ending", { kind: this.s.ending });
    } else this.emit("advance", { stage: 2, story: "quest3" });
    this.emit("checkpoint");
  }
  tick(input = {}) {
    if (!this.running || !this.s || this.s.complete) return;
    const s = this.s,
      p = s.p,
      w = this.world;
    s.tick++;
    if (p.deathMs > 0) {
      p.animTime = (p.animTime || 0) + STEP / 1000;
      p.deathMs = Math.max(0, p.deathMs - STEP);
      if (!p.deathMs) {
        if (p.rebirthPending) {
          p.rebirthPending = false;
          s.hp = 100;
          s.ap = this.maxAp;
          p.invulnerable = 110;
          p.anim = "revive";
          p.animTime = 0;
          p.reviveMs = (34 / 30) * 1000;
          this.emit("sound", { name: "rebirth" });
          this.emit("hint", { key: "revived" });
        } else {
          this.running = false;
          this.emit("dead");
        }
        this.emit("checkpoint");
      }
      return;
    }
    if (p.reviveMs > 0) {
      p.reviveMs = Math.max(0, p.reviveMs - STEP);
      p.animTime += STEP / 1000;
      return;
    }
    this.updateCamera();
    if ((p.stunMs || 0) > 0) {
      p.stunMs = Math.max(0, p.stunMs - STEP);
      input = {};
      p.vx = 0;
    }
    p.invulnerable = Math.max(0, p.invulnerable - 1);
    const wasGrounded = p.grounded;
    p.grounded = !this.fits(p.x, p.y + 1);
    p.anim = "idle";
    this.currentInput = input;
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0),
      dx = dir * 7;
    if (input.down && p.grounded && !input.up) {
      dir = 0;
      dx = 0;
    }
    if (dir) p.face = dir;
    if (input.up) {
      p.vy = p.grounded
        ? -2
        : p.vy < -this.boost
          ? -this.boost + 1
          : p.vy - this.boost / 20;
      p.anim = "boost";
    } else p.vy = Math.min(21, p.vy + 1);
    if (s.stage === 2 && p.grounded && !input.down && !input.up) {
      p.vx = dir ? clamp(p.vx + dir * 0.5, -10.5, 10.5) : p.vx * 0.95;
      dx = p.vx;
    } else p.vx = dx;
    const mx = this.move(p, dx, 0);
    if (mx.blockedX) {
      p.vx = 0;
      if (dir && !input.up && p.grounded)
        this.digAt(
          Math.floor((p.x + dir * 18) / TILE),
          Math.floor((p.y - 15) / TILE),
          "digside",
        );
    } else if (dir) p.anim = "run";
    if (input.down && p.grounded && !input.up) {
      p.x += clamp(Math.floor(p.x / TILE) * TILE + 21 - p.x, -4, 4);
      this.digAt(
        Math.floor(p.x / TILE),
        Math.floor((p.y + 1) / TILE),
        "digdown",
      );
    }
    if (p.vy < 0 && !this.fits(p.x, p.y + p.vy)) {
      const center = Math.floor(p.x / TILE) * TILE + 21;
      if (Math.abs(center - p.x) <= 17 && this.fits(center, p.y + p.vy))
        p.x = center;
    }
    const fallSpeed = p.vy,
      my = this.move(p, 0, p.vy);
    if (my.blockedY) {
      p.vy = 0;
      if (fallSpeed > 0) {
        p.grounded = true;
        if (!wasGrounded && fallSpeed === 21) this.damage(20, "fall");
      }
    }
    if (p.anim !== "digside" && p.anim !== "digdown") this.dig = null;
    if (input.up && p.y < this.source.start.y * TILE - 80)
      p.vy = Math.max(p.vy, 0);
    if (p.stunMs > 0) p.anim = "hurt";
    if (p.lastAnim !== p.anim) {
      p.lastAnim = p.anim;
      p.animTime = 0;
    } else p.animTime = (p.animTime || 0) + STEP / 1000;
    this.updateOxygen();
    this.updateBombs();
    this.updateEnemies();
    this.updateProjectiles();
    this.updateDrops();
    this.reveal();
    this.finishTransition();
    if (
      s.stage === 2 &&
      this.depth >= 200 &&
      !s.visited.rescueIntro &&
      !s.rescued
    ) {
      s.visited.rescueIntro = true;
      this.emit("story", { id: "rescueIntro" });
    }
    s.stats.depth = Math.max(s.stats.depth, this.depth);
    if (this.inTutorial) {
      s.tutorialTime = Math.max(0, s.tutorialTime - STEP / 1000);
      if (s.tutorialTime === 0) {
        this.emit("tutorialRetry");
        this.running = false;
      }
    }
    if (s.hp <= 0) this.die();
    if (s.tick % 1100 === 0) this.emit("autosave");
  }
  digAt(x, y, anim) {
    const t = this.tile(x, y);
    if (t.index < 0 || t.prop1 >= 20) return;
    if (t.tile === 16 || t.tile === 50) {
      if (this.s.tick % 65 === 0) this.emit("hint", { key: "rock" });
      return;
    }
    const mineral = t.tile >= 80 && t.tile <= 88 ? t.tile - 79 : 0;
    if (mineral && !this.canAdd(mineral)) {
      if (this.s.tick % 40 === 0) this.emit("hint", { key: "bagFull" });
      return;
    }
    this.s.p.anim = anim;
    this.s.p.vx = 0;
    if (!this.dig || this.dig.index !== t.index) {
      this.dig = { index: t.index, progress: 0, oldTile: t.tile };
      this.emit("sound", { name: "drill" });
    }
    this.advanceDrilling(t, this.digSpeed, this.dig, true);
  }
  advanceDrilling(tile, power, tool, collect) {
    const y = Math.floor(tile.index / this.source.width),
      x = tile.index % this.source.width;
    const hardness =
      (this.s.stage === 3 ? 6 : this.s.stage === 2 ? 4 : 2) +
      (y >= 300 ? 2 : y >= 150 ? 1 : 0);
    if (tool.counter === undefined) {
      tool.counter = 0;
      tool.landLife = 2;
      return;
    }
    if (tool.counter++ < Math.max(0, (tool.landLife ?? 2) - power)) return;
    tool.counter = 0;
    tool.landLife = hardness;
    this.world.drilling ??= {};
    const strokes = (this.world.drilling[tile.index] || 0) + 1;
    this.world.drilling[tile.index] = strokes;
    tool.progress = strokes / 7;
    if (strokes >= 7) {
      this.breakTile(x, y, collect);
      if (!collect) this.awardScore(this.depth);
      delete this.world.drilling[tile.index];
      if (collect) this.dig = null;
    }
  }
  digEnemy(enemy, x, y) {
    const tile = this.tile(x, y);
    if (
      tile.index < 0 ||
      tile.prop1 >= 20 ||
      tile.tile === 16 ||
      tile.tile === 50
    )
      return;
    enemy.tool ??= {};
    this.advanceDrilling(tile, 3, enemy.tool, false);
  }
  awardScore(amount, x, y) {
    if (amount <= 0) return;
    this.s.score += amount;
    if (Number.isFinite(x) && Number.isFinite(y))
      this.emit("score", { amount, x, y });
  }
  collectItem(code, x, y) {
    if (!this.addItem(code)) return false;
    // Buying or restoring inventory must never award pickup points.
    if (code >= 1 && code <= 9)
      this.awardScore(this.catalog.get(code).price, x, y);
    this.emit("collected", { code, x, y });
    return true;
  }
  breakTile(x, y, collect = false, rock = false) {
    const t = this.tile(x, y);
    if (t.index < 0 || t.prop1 >= 20 || (t.tile === 16 && !rock)) return false;
    const mineral = t.tile >= 80 && t.tile <= 88 ? t.tile - 79 : 0;
    if (collect && mineral && !this.canAdd(mineral)) return false;
    this.world.changes[t.index] = [45, 20];
    if (this.world.drilling) delete this.world.drilling[t.index];
    this.s.stats.mined++;
    // MapData.dig awards current depth on completed drilling, without a popup.
    if (collect) this.awardScore(this.depth);
    if (mineral) {
      if (collect) {
        this.collectItem(mineral, x * TILE + 21, y * TILE);
      } else
        this.world.drops.push({
          code: mineral,
          x: x * TILE + 21,
          y: (y + 1) * TILE,
        });
    }
    if (
      this.world.special === t.index &&
      this.s.stage > 0 &&
      !this.s.special[this.s.stage - 1]
    )
      this.collectSpecial(this.s.stage - 1);
    if (this.inTutorial && this.s.tutorial < 3) {
      this.s.tutorialProgress = this.s.inventory[1] || 0;
      this.checkTutorial();
    }
    this.emit("dust", { x: x * TILE + 21, y: y * TILE + 21 });
    return true;
  }
  collectSpecial(index) {
    if (this.s.special[index]) return;
    this.s.special[index] = true;
    this.awardScore(this.catalog.get(index + 10).price, this.s.p.x, this.s.p.y);
    this.emit("special", { index });
    this.emit("sound", { name: "special" });
    this.emit("checkpoint");
    if (index === 1 && !this.s.visited.stage3_map)
      this.emit("advance", { stage: 3, story: "quest4" });
  }
  updateOxygen() {
    const s = this.s,
      t = this.tile(Math.floor(s.p.x / TILE), Math.floor((s.p.y - 15) / TILE));
    const nearAir = this.nearest("AirStation", 70);
    if (t.prop1 === 30 || nearAir) {
      s.ap = Math.min(this.maxAp, s.ap + 10);
      if (
        nearAir &&
        s.map === "boss_map" &&
        s.tick % 125 === 0 &&
        !this.world.drops.some((d) => d.station)
      )
        this.world.drops.push({
          code: 21,
          x: nearAir.x * TILE + 21,
          y: (nearAir.y + 1) * TILE,
          station: true,
        });
      return;
    }
    let amount = 0,
      deep = this.depth;
    if (this.inTutorial)
      amount = s.tutorial === 2 ? -0.3 : s.tutorial === 3 ? -0.1 : 0;
    else if (s.map === "boss_map") amount = -0.3;
    else if (deep >= 5) {
      if (s.stage === 3) deep += 100;
      const rate = [0, -0.015, -0.02, -0.035][s.stage];
      amount =
        rate * Math.pow(deep / (this.dig ? 30 : 100), this.dig ? 1.1 : 0.8);
    }
    s.ap = Math.max(0, s.ap + amount);
    if (s.ap <= 0) s.hp = Math.max(0, s.hp - 0.2);
    if (s.ap < Math.min(25, this.maxAp * 0.15) && s.tick % 180 === 0)
      this.emit("hint", { key: "lowAir" });
  }
  canAdd(code, n = 1) {
    if (code >= 10 && code <= 12) return true;
    const current = this.s.inventory[code] || 0;
    const extra =
      code < 10 ? Math.ceil((current + n) / 5) - Math.ceil(current / 5) : n;
    return this.usedSlots + extra <= this.capacity;
  }
  addItem(code, n = 1) {
    if (!this.canAdd(code, n)) return false;
    this.s.inventory[code] = (this.s.inventory[code] || 0) + n;
    return true;
  }
  takeItem(code, n = 1) {
    if ((this.s.inventory[code] || 0) < n) return false;
    this.s.inventory[code] -= n;
    if (!this.s.inventory[code]) delete this.s.inventory[code];
    return true;
  }
  buy(code) {
    const i = this.catalog.get(code);
    if (!i || !this.nearest("Shop", 115) || this.s.money < i.price)
      return {
        ok: false,
        key: this.s.money < (i?.price || 0) ? "notEnoughMoney" : "onlyAtShop",
      };
    const group =
      i.type === 4
        ? "head"
        : i.type === 5
          ? "drill"
          : i.type === 6
            ? "boots"
            : null;
    const level = code % 10;
    if (group && this.s.gear[group] >= level)
      return { ok: false, key: "alreadyEquipped" };
    if (code === 81 && this.s.bagRows >= 6) return { ok: false, key: "bagMax" };
    if (!group && code !== 81 && !this.canAdd(code))
      return { ok: false, key: "bagFull" };
    this.s.money -= i.price;
    if (group) this.s.gear[group] = level;
    else if (code === 81) this.s.bagRows++;
    else this.addItem(code);
    this.emit("sound", { name: "buyitem" });
    this.emit("checkpoint");
    return { ok: true, key: group ? "equipped" : "purchased" };
  }
  sell() {
    if (!this.nearest("Shop", 115)) return 0;
    let total = 0;
    for (let code = 1; code <= 9; code++) {
      total +=
        (this.s.inventory[code] || 0) * (this.catalog.get(code)?.price || 0);
      delete this.s.inventory[code];
    }
    this.s.money += total;
    this.emit("sound", { name: "exchange" });
    this.emit("checkpoint");
    return total;
  }
  use(code) {
    if (this.s.p.deathMs > 0 || this.s.p.reviveMs > 0)
      return { ok: false, key: "actionLocked" };
    if (!(this.s.inventory[code] > 0)) return { ok: false, key: "noItem" };
    if ([21, 22, 23].includes(code)) {
      if (this.world.bombs.some((b) => b.blastAge === undefined))
        return { ok: false, key: "bombLimit" };
      if (code === 23) {
        const y = Math.floor((this.s.p.y + 1) / TILE),
          t = this.tile(Math.floor(this.s.p.x / TILE), y);
        if (
          t.tile !== 16 ||
          y >= this.source.height - 6 ||
          this.s.map === "boss_map"
        )
          return { ok: false, key: "dynamiteRock" };
      }
      this.world.bombs.push({
        x: Math.floor(this.s.p.x / TILE) * TILE + 21,
        y: Math.floor(this.s.p.y / TILE) * TILE + (code === 23 ? TILE : 0),
        vy: 0,
        age: 0,
        code,
        ttl: Math.round((((code === 23 ? 41 : 48) / 30) * 1000) / STEP),
      });
      // Original Dinamite awards points when successfully planted, not on blast.
      if (code === 23) this.awardScore(5000);
      this.emit("sound", { name: "bombinstall" });
    } else if (code === 24) {
      if (this.s.hp >= 100) return { ok: false, key: "healthFull" };
      this.s.hp = 100;
    } else if (code === 25 || code === 26) {
      if (this.s.ap >= this.maxAp) return { ok: false, key: "airFull" };
      this.s.ap = Math.min(
        this.maxAp,
        this.s.ap + (code === 25 ? 100 : this.maxAp),
      );
      this.emit("sound", { name: "airup" });
    } else if (code === 27) {
      if (this.s.map === "boss_map")
        return { ok: false, key: "bossNoTeleport" };
      this.returnSurface();
    } else if (code === 28) {
      if (this.s.map === "boss_map")
        return { ok: false, key: "bossNoTeleport" };
      this.world.portal = { x: this.s.p.x, y: this.s.p.y };
      this.returnSurface();
    } else return { ok: false, key: "passiveItem" };
    this.takeItem(code);
    return { ok: true };
  }
  updateBombs() {
    const w = this.world;
    for (const b of w.bombs) {
      b.age = (b.age || 0) + STEP / 1000;
      if (b.blastAge === undefined) {
        if (b.code !== 23) {
          b.vy = Math.min(21, (b.vy || 0) + 1);
          if (this.move(b, 0, b.vy).blockedY) b.vy = 0;
        }
        b.ttl--;
        if (b.ttl > 0) continue;
        b.blastAge = 0;
        if (b.code === 23) {
          const x = Math.floor(b.x / TILE),
            y = Math.floor((b.y - 1) / TILE);
          this.breakTile(x, y, false, true);
        }
        this.emit("explosion", { x: b.x, y: b.y });
        this.emit("sound", { name: b.code === 22 ? "bomb2" : "bomb1" });
      } else b.blastAge += STEP / 1000;
      if (!b.hit) {
        const rect = blastRect(b);
        const targets = [
          ...w.entities,
          ...w.projectiles.filter((p) => p.state !== "dead"),
        ].sort((a, b) => b.id - a.id);
        for (const target of targets)
          if (
            !target.dead &&
            hitRects(target).some((hit) => overlaps(rect, hit))
          ) {
            b.hit = true;
            if (target.kind === "BossArm") actorState(target, "dead");
            else this.hitEnemy(target, b.code === 22 ? 200 : 100);
            break;
          }
      }
    }
    w.bombs = w.bombs.filter(
      (b) => b.blastAge === undefined || b.blastAge < 34 / 30,
    );
  }
  updateEnemies() {
    updateNativeEnemies(this);
  }
  updateProjectiles() {
    updateNativeProjectiles(this);
  }
  hitEnemy(e, damage) {
    if (e.dead) return;
    e.hp -= damage;
    e.hitAt = this.s.tick;
    if (e.hp > 0) return;
    e.dead = true;
    actorState(e, "dead");
    e.animTime = 0;
    this.s.stats.kills++;
    const points = e.kind.includes("Boss")
      ? 10000
      : e.kind.startsWith("Big") || e.kind === "ItemDragon"
        ? 1000
        : this.s.map === "boss_map"
          ? 0
          : 300;
    this.awardScore(points, e.x, e.y);
    this.emit("sound", { name: "enemydie" });
    this.emit("enemyDeath", { x: e.x, y: e.y });
    if (e.kind === "ItemDragon" && !this.s.inventory[82])
      this.world.drops.push({
        code: 82,
        x: e.x,
        y: e.y,
        readyAt: this.s.tick + Math.ceil(((31 / 30) * 1000) / STEP),
        loot: true,
      });
    // Guaranteed drop fixes the original probability edge case.
    else if (this.data.loot[e.kind]) {
      const loot = this.data.loot[e.kind],
        r = rng(this.s.seed + e.id + this.s.tick)() * 100;
      let total = 0;
      for (let i = 0; i < loot.weights.length; i++) {
        total += loot.weights[i];
        if (r < total) {
          const reward = loot.rewards[i];
          this.world.drops.push({
            code: reward.item || 0,
            money: reward.money || 0,
            x: e.x,
            y: e.y,
            readyAt: this.s.tick + Math.ceil(((31 / 30) * 1000) / STEP),
            loot: true,
          });
          break;
        }
      }
    }
    if (this.inTutorial && this.s.tutorial === 3) {
      this.s.tutorialProgress++;
      this.checkTutorial();
    }
    if (e.kind === "SubBoss" || e.kind === "Boss") {
      for (const summoned of this.world.entities)
        if (summoned.summoner === e.id && !summoned.dead) {
          summoned.dead = true;
          actorState(summoned, "dead");
        }
      if (e.kind === "SubBoss") this.s.unlocked = Math.max(this.s.unlocked, 2);
      this.s.transition = {
        kind: e.kind === "Boss" ? "ending" : "advance",
        remaining: 5000,
      };
    }
  }
  updateDrops() {
    for (const d of this.world.drops) {
      if (d.taken || this.s.tick < (d.readyAt || 0)) continue;
      if (
        Math.hypot(d.x - this.s.p.x, d.y - this.s.p.y) < 48 &&
        (d.money > 0 || this.collectItem(d.code, d.x, d.y))
      ) {
        if (d.money > 0) {
          this.s.money += d.money;
          this.emit("money", { amount: d.money, x: d.x, y: d.y });
        }
        d.taken = true;
      }
    }
    this.world.drops = this.world.drops.filter((d) => !d.taken);
  }
  damage(amount, kind, fromX) {
    if (this.s.p.invulnerable || amount <= 0) return;
    this.s.hp = Math.max(0, this.s.hp - Math.max(1, amount - 3 * this.defence));
    this.s.p.invulnerable = kind === "fall" ? 19 : 95;
    if (kind === "enemy") {
      this.s.p.vy = -7;
      this.s.p.stunMs = 500;
      this.s.p.anim = "hurt";
    }
    this.emit("damage", { amount });
    this.emit("sound", { name: "hit" });
  }
  die() {
    const p = this.s.p;
    if (p.deathMs > 0) return;
    p.rebirthPending = !!this.takeItem(83);
    p.deathMs = 2000;
    p.anim = "dead";
    p.animTime = 0;
    p.face = 1;
    p.invulnerable = 0;
    this.emit("sound", { name: "playerdie" });
    this.emit("checkpoint");
  }
  rescue() {
    // Recovery costs a tenth of the carried minerals, never equipment or story items.
    for (let i = 1; i <= 9; i++)
      if (this.s.inventory[i])
        this.s.inventory[i] = Math.floor(this.s.inventory[i] * 0.9);
    if (this.s.map === "boss_map")
      this.loadMap(`stage${this.s.bossFor === 1 ? 1 : 3}_map`);
    this.returnSurface();
    this.s.hp = 100;
    this.s.ap = this.maxAp;
    this.running = true;
    this.emit("checkpoint");
  }
  returnSurface() {
    const start = this.source.start;
    Object.assign(this.s.p, {
      x: start.x * TILE + 21,
      y: (start.y + 1) * TILE,
      vy: 0,
      vx: 0,
      invulnerable: 60,
    });
    this.dig = null;
    this.emit("sound", { name: "portal" });
  }
  nearest(type, distance = 90) {
    return this.source.entities.find(
      (e) =>
        (e.type === type || (type === "Doctor" && e.code === 20)) &&
        Math.hypot(
          e.x * TILE + 21 - this.s.p.x,
          (e.y + 1) * TILE - this.s.p.y,
        ) < distance,
    );
  }
  interact() {
    if (this.s.p.deathMs > 0 || this.s.p.reviveMs > 0) return;
    if (this.world.portal) {
      const portal = this.world.portal,
        nearPortal =
          Math.hypot(portal.x - this.s.p.x, portal.y - this.s.p.y) < 70;
      if (nearPortal) this.returnSurface();
      else if (this.depth < 4) {
        Object.assign(this.s.p, { x: portal.x, y: portal.y, vy: 0, vx: 0 });
        this.emit("sound", { name: "portal" });
        return "portal";
      }
    }
    if (this.nearest("Shop", 115)) {
      if (this.inTutorial && this.tutorialDone) {
        this.finishTutorial();
        return "doctor";
      }
      this.emit("shop");
      return "shop";
    }
    if (this.nearest("BossRoom", 90)) {
      const key = this.s.stage === 1 ? "boss1" : "boss2",
        previous = this.s.worlds[key];
      if (!previous && !this.takeItem(82)) {
        this.emit("hint", { key: "needKey" });
        return "locked";
      }
      if (previous?.entities.some((e) => e.kind.includes("Boss") && e.dead))
        delete this.s.worlds[key];
      const bossFor = this.s.stage === 1 ? 1 : 2;
      this.loadMap("boss_map", { bossFor });

      this.emit("checkpoint");
      return "boss";
    }
    if (this.nearest("Doctor", 85)) {
      if (this.inTutorial) {
        if (this.tutorialDone) this.finishTutorial();
        else this.emit("story", { id: `tutorial${this.s.tutorial}` });
      } else if (this.s.stage === 2 && !this.s.rescued) {
        this.s.rescued = true;
        this.s.money += 100000;
        this.emit("story", { id: "rescue" });
        this.emit("checkpoint");
      }
      return "doctor";
    }
    if (this.nearest("AirStation", 90)) {
      this.s.ap = this.maxAp;
      this.emit("hint", { key: "airRestored" });
      return "air";
    }
    return null;
  }
  get tutorialDone() {
    return (
      this.s.tutorialProgress >=
      (this.s.tutorial === 1 ? 2 : this.s.tutorial === 2 ? 10 : 1)
    );
  }
  checkTutorial() {
    if (this.tutorialDone && !this.tutorialNotified) {
      this.tutorialNotified = true;
      this.emit("tutorialComplete");
    }
  }
  finishTutorial() {
    this.s.money += 100;
    for (let i = 1; i <= 9; i++) delete this.s.inventory[i];
    this.s.tutorialProgress = 0;
    this.s.tutorialTime = 120;
    this.tutorialNotified = false;
    if (this.s.tutorial < 3) {
      this.s.tutorial++;
      this.loadMap(`tutorial${this.s.tutorial}_map`);
      if (this.s.tutorial === 3) this.addItem(21, 3);
      this.emit("story", { id: `tutorial${this.s.tutorial}` });
    } else {
      this.s.tutorial = 0;
      this.advance(1);
    }
    this.emit("checkpoint");
  }
  retryTutorial() {
    const name = this.s.map;
    delete this.s.worlds[name];
    this.s.tutorialProgress = 0;
    this.s.tutorialTime = 120;
    this.tutorialNotified = false;
    for (let i = 1; i <= 9; i++) delete this.s.inventory[i];
    this.loadMap(name);
    if (this.s.tutorial === 3) this.s.inventory[21] = 3;
    this.running = true;
  }
  advance(stage, { playStory = !this.s.visited[`stage${stage}_map`] } = {}) {
    this.s.tutorial = 0;
    this.s.stage = stage;
    this.s.unlocked = Math.max(stage, this.s.unlocked);
    this.loadMap(`stage${stage}_map`);
    if (playStory)
      this.emit("story", {
        id: stage === 1 ? "opening" : stage === 2 ? "quest3" : "quest4",
      });
    this.emit("checkpoint");
  }
  reveal() {
    const p = this.s.p,
      x = Math.floor(p.x / TILE),
      y = Math.floor(p.y / TILE);
    for (
      let yy = Math.max(0, y - 6);
      yy <= Math.min(this.source.height - 1, y + 6);
      yy++
    )
      for (
        let xx = Math.max(0, x - 8);
        xx <= Math.min(this.source.width - 1, x + 8);
        xx++
      )
        this.world.discovered[yy * this.source.width + xx] = 1;
  }
  serialize() {
    return JSON.stringify({
      format: "digger-boy-native",
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      state: this.s,
    });
  }
  restore(text) {
    if (typeof text !== "string" || text.length > 5_000_000)
      throw new Error("saveInvalid");
    const parsed = JSON.parse(text),
      s = parsed.state;
    if (
      parsed.format !== "digger-boy-native" ||
      parsed.version !== SAVE_VERSION ||
      !s ||
      !this.data.maps[s.map] ||
      !Number.isInteger(s.seed) ||
      !Number.isInteger(s.stage) ||
      s.stage < -1 ||
      s.stage > 3 ||
      !Number.isInteger(s.tutorial) ||
      s.tutorial < 0 ||
      s.tutorial > 3
    )
      throw new Error("saveInvalid");
    for (const k of ["money", "hp", "ap", "tick", "score"])
      if (!Number.isFinite(s[k]) || s[k] < 0 || s[k] > 1e10)
        throw new Error("saveInvalid");
    if (
      !s.p ||
      ![s.p.x, s.p.y, s.p.vx, s.p.vy, s.p.face, s.p.invulnerable].every(
        Number.isFinite,
      ) ||
      !s.gear ||
      !s.inventory ||
      !s.worlds ||
      !Array.isArray(s.special) ||
      s.special.length !== 3 ||
      !s.special.every((v) => typeof v === "boolean") ||
      !s.stats ||
      !s.visited ||
      !Array.isArray(s.quick) ||
      s.quick.length !== 5 ||
      !s.quick.every((c) => this.catalog.has(c))
    )
      throw new Error("saveInvalid");
    for (const g of ["head", "drill", "boots"])
      if (!Number.isInteger(s.gear[g]) || s.gear[g] < 0 || s.gear[g] > 5)
        throw new Error("saveInvalid");
    if (!Number.isInteger(s.bagRows) || s.bagRows < 3 || s.bagRows > 6)
      throw new Error("saveInvalid");
    for (const [code, n] of Object.entries(s.inventory))
      if (
        !this.catalog.has(+code) ||
        !Number.isInteger(n) ||
        n < 0 ||
        n > 99999
      )
        throw new Error("saveInvalid");
    if (
      ![
        s.tutorialProgress,
        s.tutorialTime,
        s.unlocked,
        s.stats.mined,
        s.stats.kills,
        s.stats.depth,
      ].every(Number.isFinite) ||
      s.unlocked < 1 ||
      s.unlocked > 3 ||
      s.hp > 100 ||
      s.ap > [100, 200, 300, 500, 600, 700][s.gear.head] ||
      (s.tutorial > 0 &&
        (s.stage !== -1 || s.map !== `tutorial${s.tutorial}_map`)) ||
      (s.tutorial === 0 &&
        (s.stage < 1 ||
          (s.map !== "boss_map" && s.map !== `stage${s.stage}_map`))) ||
      (s.map === "boss_map" && ![1, 2].includes(s.bossFor))
    )
      throw new Error("saveInvalid");
    for (const [key, w] of Object.entries(s.worlds)) {
      if (!MAPS.includes(key) && !["boss1", "boss2"].includes(key))
        throw new Error("saveInvalid");
      const map = this.data.maps[key.startsWith("boss") ? "boss_map" : key];
      if (
        !map ||
        !w ||
        !w.changes ||
        !w.discovered ||
        !Array.isArray(w.entities) ||
        w.entities.length > 3000 ||
        !Array.isArray(w.bombs) ||
        w.bombs.length > 8 ||
        !Array.isArray(w.drops)
      )
        throw new Error("saveInvalid");
      for (const [idx, v] of Object.entries(w.changes))
        if (
          !/^\d+$/.test(idx) ||
          +idx >= map.width * map.height ||
          !Array.isArray(v) ||
          v.length !== 2 ||
          !v.every(Number.isFinite) ||
          v[0] < 0 ||
          v[0] > 255 ||
          v[1] < 0 ||
          v[1] > 255
        )
          throw new Error("saveInvalid");
      if (
        w.drilling !== undefined &&
        (!w.drilling ||
          typeof w.drilling !== "object" ||
          Array.isArray(w.drilling) ||
          Object.entries(w.drilling).some(
            ([key, value]) =>
              !/^\d+$/.test(key) ||
              +key >= map.width * map.height ||
              !Number.isInteger(value) ||
              value < 1 ||
              value > 6,
          ))
      )
        throw new Error("saveInvalid");
      for (const e of w.entities)
        if (
          !ENEMY_HP[e.kind] ||
          ![e.x, e.y, e.hp, e.maxHp, e.vy, e.phase, e.face].every(
            Number.isFinite,
          )
        )
          throw new Error("saveInvalid");
      for (const b of w.bombs)
        if (
          ![21, 22, 23].includes(b.code) ||
          ![b.x, b.y, b.ttl].every(Number.isFinite)
        )
          throw new Error("saveInvalid");
      for (const d of w.drops)
        if (
          (!this.catalog.has(d.code) &&
            !(
              d.code === 0 &&
              Number.isFinite(d.money) &&
              d.money > 0 &&
              d.money <= 1e7
            )) ||
          ![d.x, d.y].every(Number.isFinite) ||
          (d.readyAt !== undefined &&
            (!Number.isFinite(d.readyAt) || d.readyAt < 0))
        )
          throw new Error("saveInvalid");
      if (w.portal && ![w.portal.x, w.portal.y].every(Number.isFinite))
        throw new Error("saveInvalid");
      if (
        w.projectiles !== undefined &&
        (!Array.isArray(w.projectiles) ||
          w.projectiles.length > 100 ||
          !w.projectiles.every((p) =>
            [p.x, p.y, p.angle, p.age, p.speed, p.turn, p.life].every(
              Number.isFinite,
            ),
          ))
      )
        throw new Error("saveInvalid");
    }
    const map = this.data.maps[s.map];
    if (
      s.p.x < 0 ||
      s.p.y < 0 ||
      s.p.x > map.width * TILE ||
      s.p.y > map.height * TILE
    )
      throw new Error("saveInvalid");
    const wk = s.map === "boss_map" ? `boss${s.bossFor}` : s.map;
    if (!s.worlds[wk]) throw new Error("saveInvalid");
    if (
      s.transition &&
      (!["ending", "advance"].includes(s.transition.kind) ||
        !Number.isFinite(s.transition.remaining) ||
        s.transition.remaining < 0 ||
        s.transition.remaining > 5000)
    )
      throw new Error("saveInvalid");
    if (s.camera && ![s.camera.x, s.camera.y].every(Number.isFinite))
      throw new Error("saveInvalid");
    for (const w of Object.values(s.worlds))
      for (const e of w.entities) {
        for (const key of [
          "animTime",
          "attackDelay",
          "attackTimer",
          "spawnCount",
          "turnClock",
          "nextTurnAt",
          "direction",
          "jumpDir",
          "summoner",
        ])
          if (
            e[key] !== undefined &&
            (!Number.isFinite(e[key]) || Math.abs(e[key]) > 1e10)
          )
            throw new Error("saveInvalid");
        if (e.aiVersion !== 2) {
          e.aiVersion = 2;
          e.attacking = false;
          e.attackDelay = 0;
          e.state = e.dead ? "dead" : "idle";
          e.animTime = 0;
          e.direction = e.face || 1;
          delete e.spawnCount;
        }
      }
    if (!validCutscene(s.cutscene)) throw new Error("saveInvalid");
    for (const key of ["animTime", "stunMs", "deathMs", "reviveMs"])
      if (
        s.p[key] !== undefined &&
        (!Number.isFinite(s.p[key]) || s.p[key] < 0 || s.p[key] > 1e10)
      )
        throw new Error("saveInvalid");
    this.events = [];
    this.s = s;
    this.dig = null;
    this.running = !s.complete;
    this.tutorialNotified = this.tutorialDone;
    this.emit("map", { name: s.map });
    return true;
  }
}
