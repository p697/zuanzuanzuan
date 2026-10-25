import { actorGeometry } from "./actor-geometry.js";

export const NATIVE_FRAME_MS = 1000 / 30;
export function actorKey(body) {
  if (body.kind === "ItemDragon") return "bigDragon2";
  return body.kind ? body.kind[0].toLowerCase() + body.kind.slice(1) : "player";
}
const ordinaryStates = { idle: 0, move: 1, dead: 2 };
const bossStates = { move: 0, dead: 1, idle: 2, jump: 3, attack: 4, summon: 5 };
export function pose(body) {
  const key = actorKey(body),
    actor = actorGeometry[key];
  const state = body.state || (body.dead ? "dead" : "move");
  const index =
    key === "player"
      ? 0
      : ((["Boss", "SubBoss"].includes(body.kind)
          ? bossStates
          : ordinaryStates)[state] ?? 0);
  const animation = actor.states[index] || actor.states[0];
  const frame = Math.floor((body.animTime || 0) * 30);
  return animation.frames[
    animation.loop
      ? frame % animation.frames.length
      : Math.min(frame, animation.frames.length - 1)
  ];
}
export function worldRect(rect, body, angle = 0) {
  const face = body.face || 1,
    flipY = body.flipY || 1,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const points = [
    [rect[0], rect[1]],
    [rect[2], rect[1]],
    [rect[0], rect[3]],
    [rect[2], rect[3]],
  ].map(([x, y]) => [
    body.x + x * face * c - y * flipY * s,
    body.y + x * face * s + y * flipY * c,
  ]);
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
}
export function overlaps(a, b) {
  return a && b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}
export function hitRects(body) {
  const frame = pose(body);
  return frame.hit.map((r) =>
    worldRect(r, body, body.kind === "BossArm" ? body.angle : 0),
  );
}
export function contactRects(body) {
  if (body.kind?.includes("Boss") || body.kind === "BossArm")
    return hitRects(body);
  return [worldRect(pose(body).body, body)];
}
export function playerRect(p) {
  return worldRect(actorGeometry.player.states[0].frames[0].hit[0], p);
}
export function blastRect(bomb) {
  const index = Math.min(
    actorGeometry.explosion.states.length - 1,
    Math.floor((bomb.blastAge || 0) * 30),
  );
  const r = actorGeometry.explosion.states[index].frames[0].body;
  const scale = bomb.code === 22 ? 1.2 : 1;
  return r
    ? worldRect(
        r.map((v) => v * scale),
        {
          x: bomb.x - (bomb.code === 22 ? 37 : 31),
          y: bomb.y - (bomb.code === 22 ? 59 : 53),
          face: 1,
        },
      )
    : null;
}
export function state(body, next) {
  if (body.state !== next) {
    body.state = next;
    body.animTime = 0;
  }
}
const TILE = 42;
const MS = 27;
function grounded(e, body, half = 15) {
  return !e.fits(body.x, body.y + 1, half, 29);
}
function fall(e, body, half = 15) {
  body.vy = Math.min(21, body.vy + 1);
  const result = e.move(body, 0, body.vy, half, 29);
  if (result.blockedY) {
    body.airborne = body.vy < 0;
    body.vy = 0;
  } else body.airborne = true;
}
function touchPlayer(e, body) {
  if (contactRects(body).some((r) => overlaps(r, playerRect(e.s.p))))
    e.damage(30, "enemy", body.x);
}
function spawn(e, boss, kind, x, y, direction, vy) {
  const id = e.nextEntityId();
  e.world.entities.push({
    id,
    aiVersion: 2,
    kind,
    x,
    y,
    homeX: x,
    face: Math.sign(direction),
    direction,
    hp: 100,
    maxHp: 100,
    vy,
    phase: 0,
    dead: false,
    airborne: vy !== 0,
    state: "move",
    animTime: 0,
    summoner: boss.id,
  });
}
function bossAction(e, b) {
  const p = e.s.p;
  b.attackDelay = (b.attackDelay || 0) + 1;
  b.spawnCount ??= b.kind === "Boss" ? -1 : 0;
  const live = () =>
    e.world.entities.filter((m) => !m.dead && m.summoner === b.id).length;
  if (b.kind === "SubBoss") {
    b.spawnCount++;
    if (b.spawnCount > 500 && b.spawnCount % 200 === 0 && live() < 7)
      spawn(
        e,
        b,
        "Dragon",
        Math.floor(b.x / TILE) * TILE + 21,
        Math.floor(b.y / TILE) * TILE,
        1,
        0,
      );
  } else if (b.spawnCount >= 0) {
    b.spawnCount++;
    if (b.spawnCount % 4 === 0) {
      if (live() < 8)
        spawn(
          e,
          b,
          ["Dragon", "Dragon2", "Dragon3"][e.randomInt(3)],
          (Math.floor(b.x / TILE) - 1 + e.randomInt(3)) * TILE + 21,
          (Math.floor(b.y / TILE) - 4) * TILE,
          (1 + e.randomInt(2)) * (e.randomInt(2) ? -1 : 1),
          -14 - e.randomInt(3),
        );
      else b.spawnCount = -1;
    }
  }
  touchPlayer(e, b);
  if (b.attacking) {
    if (
      b.kind === "Boss" &&
      b.state === "attack" &&
      !b.fistFired &&
      b.animTime * 30 >= 10
    ) {
      b.fistFired = true;
      e.world.projectiles.push({
        id: e.nextEntityId(),
        kind: "BossArm",
        flipY: b.face < 0 ? -1 : 1,
        x: b.x + b.face * 35,
        y: b.y - 91,
        face: 1,
        angle: b.face > 0 ? 0 : Math.PI,
        age: 0,
        animTime: 0,
        state: "move",
        speed: 3 + e.randomInt(2),
        turn: ((1 + e.randomInt(4)) * Math.PI) / 180,
        life: 200 + e.randomInt(50),
        clock: 0,
      });
    }
    b.attackTimer--;
    if (b.attackTimer < 0) {
      b.attacking = false;
      state(b, "move");
    }
  } else if (b.attackDelay > 100) {
    b.attackDelay = 0;
    b.attacking = true;
    b.fistFired = false;
    const special =
      b.kind === "Boss"
        ? b.hp < b.maxHp * 0.7 && live() < 3
        : b.hp < b.maxHp * 0.4;
    state(b, special ? "summon" : "attack");
    b.attackTimer = special ? 60 : 30;
    if (special && b.kind === "Boss") b.spawnCount = 0;
  } else {
    if (b.y > p.y + 100 && !b.airborne) {
      state(b, "jump");
      b.vy = -21;
      b.airborne = true;
      b.jumpDir = b.x < p.x - 50 ? 1 : b.x > p.x + 50 ? -1 : 0;
    }
    if (!b.airborne) {
      const direction = b.x < p.x - 50 ? 1 : b.x > p.x + 50 ? -1 : 0;
      if (direction) {
        b.face = direction;
        e.move(b, direction * 3, 0, 70, 29);
        state(b, "move");
      } else state(b, "idle");
    }
  }
  b.x = Math.max(160, Math.min(1090, b.x));
  if (!b.airborne && !grounded(e, b, 70)) {
    b.airborne = true;
    b.vy = 0;
  }
  if (b.airborne) {
    if (b.jumpDir) e.move(b, b.jumpDir * 9, 0, 70, 29);
    fall(e, b, 70);
    if (!b.airborne) e.emit("slam", { x: b.x, y: b.y });
  }
}
function ordinaryAction(e, b) {
  const big = b.kind.startsWith("Big") || b.kind === "ItemDragon";
  touchPlayer(e, b);
  b.airborne ??= !grounded(e, b);
  const direction = b.direction || b.face || 1;
  if (b.airborne) {
    if (!big) e.move(b, direction * 2, 0);
    fall(e, b);
  } else {
    const result = e.move(b, direction * 2, 0);
    const left = Math.floor((b.x - 16) / TILE),
      right = Math.floor((b.x + 15) / TILE),
      below = Math.floor(b.y / TILE);
    if (big && result.blockedX)
      e.digEnemy(
        b,
        Math.floor((b.x + (direction > 0 ? 16 : -17)) / TILE),
        Math.floor((b.y - 1) / TILE),
      );
    if (!grounded(e, b)) {
      b.airborne = true;
      b.vy = 0;
    }
    if (big) {
      let random = 0;
      if (b.nextTurnAt === undefined || e.s.tick >= b.nextTurnAt) {
        b.nextTurnAt = e.s.tick + Math.ceil(1000 / MS);
        random = e.randomInt(1000000) / 1000000;
        if (b.x - e.s.p.x < 50 && b.y - e.s.p.y < 5 && random < 0.4) random = 1;
      }
      if (
        e.solid(left, below - 2) ||
        e.solid(right, below - 2) ||
        result.blockedX ||
        random > 0.8
      )
        b.direction = -direction;
    } else if (
      !e.solid(left, below) ||
      !e.solid(right, below) ||
      result.blockedX
    ) {
      b.doubleCount ??= 0;
      if (b.doubleCount < 2) {
        b.doubleCount++;
        b.direction = -direction;
      }
    } else b.doubleCount = 0;
  }
  b.face = Math.sign(b.direction || direction);
  state(b, "move");
}
export function updateNativeEnemies(e) {
  const camera = e.s.camera || { y: e.s.p.y - 300 };
  for (const b of [...e.world.entities]) {
    if (b.dead) {
      b.animTime = (b.animTime || 0) + MS / 1000;
      continue;
    }
    // Original TileView activates the visible vertical band, including offscreen X.
    if (b.y < camera.y || b.y >= camera.y + 480) continue;
    b.phase++;
    b.animTime = (b.animTime || 0) + MS / 1000;
    if (b.kind === "Boss" || b.kind === "SubBoss") bossAction(e, b);
    else ordinaryAction(e, b);
  }
}
export function updateNativeProjectiles(e) {
  for (const p of e.world.projectiles) {
    p.kind = "BossArm";
    p.face = 1;
    p.animTime = (p.animTime || 0) + MS / 1000;
    p.clock = (p.clock || 0) + MS;
    while (p.clock >= NATIVE_FRAME_MS) {
      p.clock -= NATIVE_FRAME_MS;
      if (p.state === "dead") {
        p.deathFrames = (p.deathFrames || 0) + 1;
        continue;
      }
      p.life--;
      p.age++;
      if (p.age < 30) {
        const target = Math.atan2(e.s.p.y - p.y, e.s.p.x - p.x),
          diff = Math.atan2(
            Math.sin(target - p.angle),
            Math.cos(target - p.angle),
          );
        p.angle += Math.max(-p.turn, Math.min(p.turn, diff));
      }
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed;
      const hit = hitRects(p).some((r) => overlaps(r, playerRect(e.s.p)));
      // A fist only explodes on contact if the original damage call accepts the hit.
      if ((hit && !e.s.p.invulnerable) || p.life <= 0) {
        if (hit) e.damage(30, "enemy", p.x);
        state(p, "dead");
      }
    }
  }
  e.world.projectiles = e.world.projectiles.filter(
    (p) => (p.deathFrames || 0) < 34,
  );
}
