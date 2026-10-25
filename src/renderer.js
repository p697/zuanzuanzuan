import { TILE, clamp } from "./core.js";
export class Assets {
  constructor(manifest) {
    this.manifest = manifest;
    this.images = new Map();
    this.pending = new Map();
  }
  ensure(src) {
    if (!src) return;
    const ready = this.images.get(src);
    if (ready) return ready;
    if (!this.pending.has(src)) {
      const im = new Image();
      this.pending.set(src, im);
      im.onload = () => this.images.set(src, im);
      im.src = src;
    }
    return undefined;
  }
  loadHelmet(level) {
    const states = this.manifest.sprites.player.helmetVariants?.[level];
    if (states)
      for (const a of Object.values(states))
        a.frames.forEach((src) => this.ensure(src));
  }
  async load(onProgress) {
    const urls = new Set();
    const visit = (v) => {
      if (typeof v === "string" && /\.(png|jpg|jpeg|webp)$/.test(v))
        urls.add(v);
      else if (v && typeof v === "object")
        Object.entries(v).forEach(([k, value]) => {
          if (k !== "helmetVariants") visit(value);
        });
    };
    visit(this.manifest.sprites);
    visit(this.manifest.hud);
    visit(this.manifest.cutscenes);
    for (const [key, v] of Object.entries(this.manifest.images))
      if (
        /^(item\d|tilemap|sky|title|inventoryPanel|shopPanel|hudPanel)/.test(
          key,
        )
      )
        visit(v);
    let done = 0;
    await Promise.all(
      [...urls].map(
        (src) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              this.images.set(src, image);
              onProgress(++done / urls.size);
              resolve();
            };
            image.onerror = () => reject(new Error(`无法加载 ${src}`));
            image.src = src;
          }),
      ),
    );
  }
  image(key) {
    const entry = this.manifest.images[key];
    return this.ensure(entry ? entry.src : key);
  }
  sprite(key, state) {
    const s = this.manifest.sprites[key];
    return state && s?.states?.[state] ? s.states[state] : s;
  }
}
export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.assets = assets;
    this.camera = { x: 0, y: 0 };
    this.particles = [];
    this.floating = [];
    this.shake = 0;
    this.time = 0;
    this.mapCache = null;
    this.motion = true;
  }
  reset(engine) {
    if (!engine.s.camera) engine.resetCamera();
    this.camera = { ...engine.s.camera };
    this.particles = [];
    this.floating = [];
  }
  sprite(
    key,
    x,
    y,
    {
      state,
      time = this.time,
      face = 1,
      scale = 1,
      flipY = 1,
      alpha = 1,
      filter = "none",
      helmet = 0,
      rotation = 0,
    } = {},
  ) {
    const a =
      key === "player" && helmet
        ? this.assets.manifest.sprites.player.helmetVariants?.[helmet]?.[
            state
          ] || this.assets.sprite(key, state)
        : this.assets.sprite(key, state);
    if (!a?.frames?.length) return;
    const index = Math.floor(time * (a.fps || 30));
    const frame =
        a.frames[
          a.loop === false
            ? Math.min(index, a.frames.length - 1)
            : index % a.frames.length
        ],
      im = this.assets.ensure(frame);
    if (!im) return;
    const c = this.ctx;
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.rotate(rotation);
    c.scale(face * scale, flipY * scale);
    c.globalAlpha = alpha;
    c.filter = filter;
    c.drawImage(im, -a.anchor.x, -a.anchor.y);
    c.restore();
  }
  title(time) {
    const c = this.ctx;
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.fillStyle = "#18251b";
    c.fillRect(0, 0, 640, 480);
    const bg = this.assets.image("titleBackdrop");
    if (bg) c.drawImage(bg, 0, 0, 640, 480);
    this.time = time;
    this.sprite("titleMachine", 320, 302, { time });
    this.sprite("player", 130, 302, { state: "idle", time });
    this.sprite("girlfriend", 510, 302, { time });
    const shade = c.createLinearGradient(0, 0, 0, 480);
    shade.addColorStop(0, "#08140f45");
    shade.addColorStop(0.45, "transparent");
    shade.addColorStop(1, "#091a15b0");
    c.fillStyle = shade;
    c.fillRect(0, 0, 640, 480);
  }
  draw(engine, time, delta) {
    this.time = time;
    const c = this.ctx,
      s = engine.s,
      p = s.p,
      m = engine.source,
      cam = this.camera;
    if (engine.s.camera) Object.assign(cam, engine.s.camera);
    if (!engine.running) delta = 0;
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.fillStyle = "#57442c";
    c.fillRect(0, 0, 640, 480);
    const shake = this.motion ? this.shake : 0;
    this.shake *= 0.8;
    c.save();
    c.translate(
      shake ? Math.sin(time * 91) * shake : 0,
      shake ? Math.cos(time * 73) * shake * 0.5 : 0,
    );
    const sky =
      this.assets.image(`sky${Math.max(1, s.stage)}`) ||
      this.assets.image("sky1");
    const surface = (m.start.y + 1) * TILE - cam.y;
    if (surface > 0 && sky)
      c.drawImage(
        sky,
        0,
        0,
        sky.width,
        sky.height,
        -(cam.x * 0.08) % 640,
        Math.min(-30, surface - 500),
        750,
        550,
      );
    const baseColors =
      s.stage === 2
        ? ["#35474a", "#29383b"]
        : s.stage === 3
          ? ["#433c39", "#322726"]
          : ["#796648", "#56472e"];
    const gradient = c.createLinearGradient(0, 0, 0, 480);
    gradient.addColorStop(0, baseColors[0]);
    gradient.addColorStop(1, baseColors[1]);
    c.fillStyle = gradient;
    c.fillRect(0, Math.max(0, surface), 640, 480);
    const startX = Math.max(0, Math.floor(cam.x / TILE)),
      endX = Math.min(m.width - 1, Math.ceil((cam.x + 640) / TILE)),
      startY = Math.max(0, Math.floor(cam.y / TILE)),
      endY = Math.min(m.height - 1, Math.ceil((cam.y + 480) / TILE));
    const atlas = this.assets.image(
      s.stage === 2 ? "tilemap2" : s.stage === 3 ? "tilemap3" : "tilemap",
    );
    for (let y = startY; y <= endY; y++)
      for (let x = startX; x <= endX; x++) {
        const t = engine.tile(x, y),
          px = Math.round(x * TILE - cam.x),
          py = Math.round(y * TILE - cam.y);
        if (t.prop1 === 30 && t.tile === 0) continue;
        let tile = t.tile;
        if (engine.world.changes[t.index] && t.prop1 === 20)
          tile = this.edgeTile(engine, x, y);
        if (engine.world.drilling?.[t.index])
          tile = 73 + Math.min(5, engine.world.drilling[t.index] - 1);
        if (atlas && tile < 96)
          c.drawImage(
            atlas,
            (tile % 16) * TILE,
            Math.floor(tile / 16) * TILE,
            TILE,
            TILE,
            px,
            py,
            TILE,
            TILE,
          );
        if (y >= 150) {
          c.fillStyle = y >= 300 ? "#0006" : "#0003";
          c.fillRect(px, py, TILE, TILE);
        }
        if (
          s.stage > 0 &&
          engine.world.special === t.index &&
          !s.special[s.stage - 1]
        ) {
          const icon = this.assets.image(`item${s.stage + 9}`);
          if (icon) {
            c.save();
            c.globalAlpha = 0.7 + 0.2 * Math.sin(time * 3);
            c.shadowColor = "#e9d36f";
            c.shadowBlur = 8;
            c.drawImage(icon, px + 9, py + 11, 25, 25);
            c.restore();
          }
        }
      }
    const buildings = m.runtimeEntities || m.entities;
    for (const e of buildings) {
      const x = e.x * TILE + 21 - cam.x,
        y = (e.y + 1) * TILE - cam.y;
      if (x < -200 || x > 840 || y < -50 || y > 700) continue;
      const key =
        e.type === "Shop"
          ? "shop"
          : e.type === "AirStation"
            ? "airStation"
            : e.type === "BossRoom"
              ? "bossRoom"
              : e.code === 20
                ? "doctor"
                : e.code === 21
                  ? "girlfriend"
                  : null;
      if (key) {
        this.sprite(key, x, y);
        if (e.code === 20 || e.type === "Shop" || e.type === "BossRoom") {
          const near =
            Math.hypot(e.x * TILE + 21 - p.x, (e.y + 1) * TILE - p.y) < 120;
          if (near) {
            c.fillStyle = "#ffe4a5";
            c.font = "bold 11px system-ui";
            c.textAlign = "center";
            c.fillText(
              "E",
              x,
              y - (key === "shop" ? 235 : key === "bossRoom" ? 110 : 62),
            );
          }
        }
      }
    }
    if (engine.world.portal) {
      const a = engine.world.portal;
      this.sprite("portal", a.x - cam.x, a.y - cam.y);
      const st = m.start;
      this.sprite(
        "portal",
        st.x * TILE + 21 - cam.x,
        (st.y + 1) * TILE - cam.y,
      );
    }
    for (const e of engine.world.entities) {
      if (Math.abs(e.y - p.y) > 650) continue;
      const key =
        e.kind === "ItemDragon"
          ? "bigDragon2"
          : e.kind[0].toLowerCase() + e.kind.slice(1);
      const state = e.dead ? "dead" : e.state || "move";
      const clip = this.assets.sprite(key, state);
      if (e.dead && (e.animTime || 0) > clip.frames.length / (clip.fps || 30))
        continue;
      const hitAge = (s.tick - e.hitAt) * 0.027;
      const flash = Math.floor(hitAge / 0.1) % 2 === 1;
      const boss = e.kind.includes("Boss");
      this.sprite(key, e.x - cam.x, e.y - cam.y, {
        face: e.face,
        state,
        time: e.animTime || 0,
        alpha: !e.dead && !boss && hitAge < 2 && flash ? 0.5 : 1,
        filter:
          !e.dead && boss && hitAge < 1 && !flash ? "brightness(0.5)" : "none",
      });
      if (e.kind.includes("Boss") && !e.dead && e.hp < e.maxHp * 0.4) {
        const final = e.kind === "Boss";
        this.sprite(
          "bossRage",
          e.x - cam.x + e.face * (final ? 41.05 : 29.05),
          e.y - cam.y - (final ? 156.05 : 126.05),
          { face: -e.face, time: s.tick * 0.027 },
        );
      }
    }
    for (const d of engine.world.drops) {
      if (s.tick < (d.readyAt || 0)) continue;
      if (d.loot) {
        this.sprite("bonusBox", d.x - cam.x, d.y - cam.y, { time: 0 });
        continue;
      }
      const im = this.assets.image(`item${d.code}`);
      if (im) c.drawImage(im, d.x - cam.x - 14, d.y - cam.y - 31, 28, 28);
    }
    for (const b of engine.world.bombs) {
      if (b.blastAge !== undefined) {
        const scale = b.code === 22 ? 1.2 : 1;
        this.sprite(
          "explosion",
          b.x - cam.x - (b.code === 22 ? 37 : 31),
          b.y - cam.y - (b.code === 22 ? 59 : 53),
          { time: b.blastAge, scale },
        );
      } else
        this.sprite(
          b.code === 22 ? "superBomb" : b.code === 23 ? "dynamite" : "bomb",
          b.x - cam.x,
          b.y - cam.y,
          { time: b.age || 0 },
        );
    }
    for (const a of engine.world.projectiles || [])
      this.sprite("bossArm", a.x - cam.x, a.y - cam.y, {
        state: a.state === "dead" ? "dead" : "move",
        time: a.animTime || 0,
        rotation: a.angle,
        flipY: a.flipY || 1,
      });
    {
      const state =
        {
          digside: "digSide",
          digdown: "digDown",
          run: "run",
          boost: "boost",
          idle: "idle",
          hurt: "hurt",
          dead: "dead",
          revive: "revive",
        }[p.anim] || "idle";
      this.sprite("player", p.x - cam.x, p.y - cam.y, {
        state,
        face: p.face,
        helmet: s.gear.head,
        time: p.animTime || 0,
        alpha: p.invulnerable > 0 && Math.floor(s.tick / 3) % 2 ? 0.4 : 1,
      });
    }
    this.effects(delta, cam);
    const boss = engine.world.entities.find((e) => e.kind.includes("Boss"));
    if (boss)
      this.sprite("bossHp", 40, 410, {
        time: Math.round((1 - clamp(boss.hp / boss.maxHp, 0, 1)) * 49) / 30,
      });
    if (s.ap < this.maxWarning(engine) && surface < 0) {
      const v = c.createRadialGradient(320, 240, 150, 320, 240, 410);
      v.addColorStop(0, "transparent");
      v.addColorStop(1, `rgba(130,35,28,${0.25 + 0.1 * Math.sin(time * 4)})`);
      c.fillStyle = v;
      c.fillRect(0, 0, 640, 480);
    }
    c.restore();
  }
  maxWarning(engine) {
    return Math.min(25, engine.maxAp * 0.15);
  }
  edgeTile(engine, x, y) {
    const patterns = engine.data.digPatterns;
    if (!patterns) return 45;
    const offsets = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ];
    const values = offsets.map(([dx, dy]) =>
      engine.solid(x + dx, y + dy) ? 1 : 0,
    );
    let tile = 45;
    for (const p of patterns)
      if (p.neighbors.every((n, i) => n === 2 || n === values[i]))
        tile = p.tile;
    return tile;
  }
  event(e) {
    if (e.type === "dust") {
      for (let i = 0; i < 8; i++)
        this.particles.push({
          x: e.x,
          y: e.y,
          vx: (Math.random() - 0.5) * 90,
          vy: -Math.random() * 80,
          life: 0.5,
          size: 2 + Math.random() * 2,
          color: "#c4a573",
        });
    }
    if (e.type === "explosion") {
      this.shake = 6;
    }
    if (e.type === "slam") {
      this.shake = 8;
      for (let i = 0; i < 18; i++)
        this.particles.push({
          x: e.x + (Math.random() - 0.5) * 300,
          y: e.y,
          vx: (Math.random() - 0.5) * 180,
          vy: -Math.random() * 180,
          life: 0.7,
          size: 3,
          color: "#d5b087",
        });
    }
    if (e.type === "damage") this.shake = 3;
  }
  score(amount, x, y) {
    // ScoreBox: 50 frames at 30 fps, rises 1px/frame, alpha starts at 150%.
    this.floating.push({
      text: `+${amount}`,
      x,
      y,
      color: "#e7d084",
      life: 50 / 30,
    });
  }
  effects(dt, cam) {
    const c = this.ctx;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt;
      c.globalAlpha = Math.min(1, p.life * 2);
      c.fillStyle = p.color;
      c.fillRect(p.x - cam.x, p.y - cam.y, p.size, p.size);
    }
    c.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);
    c.font = "bold 12px system-ui";
    c.textAlign = "center";
    for (const f of this.floating) {
      f.life -= dt;
      f.y -= 30 * dt;
      c.globalAlpha = clamp(f.life * 0.9, 0, 1);
      c.fillStyle = "#1a2119";
      c.fillText(f.text, f.x - cam.x + 1, f.y - cam.y + 1);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x - cam.x, f.y - cam.y);
    }
    c.globalAlpha = 1;
    this.floating = this.floating.filter((f) => f.life > 0);
  }
  drawMap(canvas, engine) {
    const m = engine.source,
      scale = 4,
      c = canvas.getContext("2d");
    canvas.width = m.width * scale;
    canvas.height = m.height * scale;
    c.fillStyle = "#0b1511";
    c.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < m.tiles.length; i++) {
      if (!engine.world.discovered[i] && m.prop1[i] !== 30) continue;
      const x = i % m.width,
        y = Math.floor(i / m.width),
        t = engine.tile(x, y);
      c.fillStyle =
        t.prop1 === 30
          ? "#4c8590"
          : t.prop1 >= 20
            ? "#b6a27d"
            : t.tile === 16
              ? "#77796e"
              : t.tile >= 80
                ? "#e6be6b"
                : "#4c5035";
      c.fillRect(x * scale, y * scale, scale, scale);
    }
    for (const e of m.entities) {
      if (
        ["Shop", "BossRoom", "AirStation"].includes(e.type) ||
        e.code === 20
      ) {
        c.fillStyle = e.type === "AirStation" ? "#7be0d0" : "#f0bf59";
        c.fillRect(e.x * scale - 2, e.y * scale - 2, 8, 8);
      }
    }
    if (
      engine.world.special >= 0 &&
      !engine.s.special[engine.s.stage - 1] &&
      engine.s.stage > 0
    ) {
      const i = engine.world.special;
      c.fillStyle = "#fff099";
      c.beginPath();
      c.moveTo((i % m.width) * scale, Math.floor(i / m.width) * scale - 5);
      c.lineTo((i % m.width) * scale + 5, Math.floor(i / m.width) * scale);
      c.lineTo((i % m.width) * scale, Math.floor(i / m.width) * scale + 5);
      c.lineTo((i % m.width) * scale - 5, Math.floor(i / m.width) * scale);
      c.fill();
    }
    c.fillStyle = "#ff7272";
    const x = (engine.s.p.x / TILE) * scale,
      y = (engine.s.p.y / TILE) * scale;
    c.beginPath();
    c.arc(x, y, 4, 0, 7);
    c.fill();
    return y;
  }
}
