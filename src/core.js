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
          face: random() < 0.5 ? -1 : 1,
          hp: ENEMY_HP[kind] || 100,
          maxHp: ENEMY_HP[kind] || 100,
          vy: 0,
          phase: 0,
          dead: false,
        };
      });
    return {
      changes: {},
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
      });
    }
    this.s.hp = 100;
    this.s.ap = this.maxAp;
    this.s.portal = null;
    this.dig = null;
    this.effects = [];
    this.s.visited[key] = true;
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
  fits(x, y, half = 14, height = 29) {
    return (
      !this.solid(Math.floor((x - half) / TILE), Math.floor((y - 1) / TILE)) &&
      !this.solid(Math.floor((x + half) / TILE), Math.floor((y - 1) / TILE)) &&
      !this.solid(
        Math.floor((x - half) / TILE),
        Math.floor((y - height) / TILE),
      ) &&
      !this.solid(
        Math.floor((x + half) / TILE),
        Math.floor((y - height) / TILE),
      )
    );
  }
  move(body, dx, dy, half = 14, height = 29) {
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
  tick(input = {}) {
    if (!this.running || !this.s || this.s.complete) return;
    const s = this.s,
      p = s.p,
      w = this.world;
    s.tick++;
    p.invulnerable = Math.max(0, p.invulnerable - 1);
    const wasGrounded = p.grounded;
    p.grounded = !this.fits(p.x, p.y + 1);
    p.anim = "idle";
    this.currentInput = input;
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0),
      dx = dir * 7;
    if (dir) p.face = dir;
    if (input.up) {
      p.vy = p.grounded
        ? -2
        : p.vy < -this.boost
          ? -this.boost + 1
          : p.vy - this.boost / 20;
      p.anim = "boost";
    } else p.vy = Math.min(21, p.vy + 1);
    if (s.stage === 2 && p.grounded && !input.down) {
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
    this.updateOxygen();
    this.updateBombs();
    this.updateEnemies();
    this.updateProjectiles();
    this.updateDrops();
    this.reveal();
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
    const hardness =
      (this.s.stage === 3 ? 6 : this.s.stage === 2 ? 4 : 2) +
      (y >= 300 ? 2 : y >= 150 ? 1 : 0);
    const duration = 6 * Math.max(1, hardness - this.digSpeed + 1);
    this.dig.progress += 1 / duration;
    if (this.dig.progress >= 1) {
      this.breakTile(x, y, true);
      this.dig = null;
    }
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
    if (!(this.s.inventory[code] > 0)) return { ok: false, key: "noItem" };
    if ([21, 22, 23].includes(code)) {
      if (this.world.bombs.length >= 1) return { ok: false, key: "bombLimit" };
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
        x: this.s.p.x,
        y: this.s.p.y,
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
      b.ttl--;
      if (b.ttl > 0) continue;
      const radius = b.code === 23 ? 90 : b.code === 22 ? 130 : 95,
        damage = b.code === 22 ? 200 : 100;
      if (b.code !== 23) {
        const target = w.entities
          .filter(
            (e) =>
              !e.dead &&
              Math.hypot(e.x - b.x, e.y - b.y) <
                radius + (e.kind.includes("Boss") ? 45 : 10),
          )
          .sort(
            (a, c) =>
              Math.hypot(a.x - b.x, a.y - b.y) -
              Math.hypot(c.x - b.x, c.y - b.y),
          )[0];
        if (target) this.hitEnemy(target, damage);
      }
      if (b.code === 23) {
        const cx = Math.floor(b.x / TILE),
          cy = Math.floor((b.y + 1) / TILE);
        this.breakTile(cx, cy, false, true);
      }
      this.emit("explosion", { x: b.x, y: b.y, radius });
      this.emit("sound", { name: b.code === 22 ? "bomb2" : "bomb1" });
    }
    w.bombs = w.bombs.filter((b) => b.ttl > 0);
  }
  updateEnemies() {
    const p = this.s.p;
    for (const e of this.world.entities) {
      if (e.dead || Math.abs(e.y - p.y) > 650 || Math.abs(e.x - p.x) > 1000)
        continue;
      e.phase++;
      const boss = e.kind === "Boss" || e.kind === "SubBoss";
      if (boss) {
        e.face = p.x > e.x ? 1 : -1;
        const cycle = e.phase % 162,
          active = this.world.entities.filter(
            (x) => !x.dead && !x.kind.includes("Boss"),
          ).length;
        e.attacking = cycle > 101;
        if (!e.attacking && Math.abs(p.x - e.x) > 50)
          this.move(e, e.face * 3, 0, 45, 70);
        if (
          !e.attacking &&
          e.y > p.y + 100 &&
          this.move(e, 0, 1, 45, 70).blockedY
        )
          e.vy = -21;
        if (cycle === 102) {
          e.summoning = e.kind === "Boss" && e.hp < e.maxHp * 0.7 && active < 3;
          this.emit("bossWarning", { x: e.x, y: e.y });
        }
        if (e.attacking && e.summoning && cycle % 4 === 0 && active < 8) {
          this.world.entities.push({
            id: 1000 + e.phase,
            kind: ["Dragon", "Dragon2", "Dragon3"][e.phase % 3],
            x: e.x + ((e.phase % 3) - 1) * 42,
            y: e.y - 210,
            homeX: e.x,
            face: e.phase % 2 ? 1 : -1,
            hp: 100,
            maxHp: 100,
            vy: -14,
            phase: 0,
            dead: false,
          });
        }
        if (e.attacking && !e.summoning && cycle === 115) {
          this.world.projectiles ??= [];
          this.world.projectiles.push({
            x: e.x + e.face * 35,
            y: e.y - 91,
            angle: e.face === 1 ? 0 : Math.PI,
            age: 0,
            speed: 3 + (e.phase % 2),
            turn: ((1 + (e.phase % 4)) * Math.PI) / 180,
            life: 220,
          });
        }
        e.x = clamp(e.x, 160, 1090);
      } else {
        const speed = 2;
        const hit = this.move(e, e.face * speed, 0);
        if (hit.blockedX || Math.abs(e.x - e.homeX) > 200) e.face *= -1;
      }
      e.vy = Math.min(21, e.vy + 1);
      if (this.move(e, 0, e.vy, boss ? 45 : 14, boss ? 70 : 29).blockedY)
        e.vy = 0;
      if (
        Math.abs(p.x - e.x) < (boss ? 68 : 30) &&
        Math.abs(p.y - e.y) < (boss ? 65 : 36)
      )
        this.damage(boss ? 40 : 30, "enemy", e.x);
    }
  }
  updateProjectiles() {
    const list = this.world.projectiles || [],
      p = this.s.p;
    for (const a of list) {
      const dt = STEP / (1000 / 30);
      a.age += dt;
      a.life -= dt;
      if (a.age < 30) {
        const target = Math.atan2(p.y - 15 - a.y, p.x - a.x),
          diff = Math.atan2(
            Math.sin(target - a.angle),
            Math.cos(target - a.angle),
          );
        a.angle += clamp(diff, -a.turn * dt, a.turn * dt);
      }
      a.x += Math.cos(a.angle) * a.speed * dt;
      a.y += Math.sin(a.angle) * a.speed * dt;
      if (Math.hypot(p.x - a.x, p.y - 15 - a.y) < 25) {
        this.damage(30, "enemy", a.x);
        a.life = 0;
      }
    }
    this.world.projectiles = list.filter((a) => a.life > 0);
  }
  hitEnemy(e, damage) {
    if (e.dead) return;
    e.hp -= damage;
    e.hitAt = this.s.tick;
    if (e.hp > 0) return;
    e.dead = true;
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
      this.world.drops.push({ code: 82, x: e.x, y: e.y }); // Guaranteed drop fixes the original probability edge case.
    else if (this.data.loot[e.kind]) {
      const loot = this.data.loot[e.kind],
        r = rng(this.s.seed + e.id + this.s.tick)() * 100;
      let total = 0;
      for (let i = 0; i < loot.weights.length; i++) {
        total += loot.weights[i];
        if (r < total) {
          const reward = loot.rewards[i];
          if (reward.money) {
            this.s.money += reward.money;
            this.emit("money", { amount: reward.money, x: e.x, y: e.y });
          } else this.world.drops.push({ code: reward.item, x: e.x, y: e.y });
          break;
        }
      }
    }
    if (this.inTutorial && this.s.tutorial === 3) {
      this.s.tutorialProgress++;
      this.checkTutorial();
    }
    if (e.kind === "SubBoss") {
      this.s.unlocked = Math.max(this.s.unlocked, 2);
      this.emit("advance", { stage: 2, story: "quest3" });
    }
    if (e.kind === "Boss") {
      this.s.complete = true;
      this.s.ending = this.s.special.every(Boolean) ? "happy" : "normal";
      this.running = false;
      this.emit("ending", { kind: this.s.ending });
      this.emit("checkpoint");
    }
  }
  updateDrops() {
    for (const d of this.world.drops) {
      if (d.taken) continue;
      if (
        Math.hypot(d.x - this.s.p.x, d.y - this.s.p.y) < 48 &&
        this.collectItem(d.code, d.x, d.y)
      ) {
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
      this.move(this.s.p, (this.s.p.x > fromX ? 1 : -1) * 14, 0);
    }
    this.emit("damage", { amount });
    this.emit("sound", { name: "hit" });
  }
  die() {
    if (this.takeItem(83)) {
      this.s.hp = 100;
      this.s.ap = this.maxAp;
      this.s.p.invulnerable = 110;
      this.emit("hint", { key: "revived" });
      this.emit("sound", { name: "rebirth" });
      return;
    }
    this.running = false;
    this.emit("dead");
    this.emit("sound", { name: "playerdie" });
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
      this.emit("story", { id: bossFor === 1 ? "subboss" : "boss" });
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
  advance(stage) {
    this.s.tutorial = 0;
    this.s.stage = stage;
    this.s.unlocked = Math.max(stage, this.s.unlocked);
    this.loadMap(`stage${stage}_map`);
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
        if (!this.catalog.has(d.code) || ![d.x, d.y].every(Number.isFinite))
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
    this.events = [];
    this.s = s;
    this.dig = null;
    this.running = !s.complete;
    this.tutorialNotified = this.tutorialDone;
    this.emit("map", { name: s.map });
    return true;
  }
}
