import { TILE, clamp } from "./core.js";

// All positions use the original 640 × 480 stage, independent of display size.
// Original art is static; state, scrolling and interaction are native HTML5.
export class InstrumentHUD {
  constructor(canvas, assets) {
    this.ctx = canvas.getContext("2d");
    this.assets = assets;
  }
  art(name, x, y, frame = 0) {
    const a = this.assets.manifest.hud[name];
    const im = this.assets.ensure(a.src);
    if (!im) return;
    this.ctx.drawImage(
      im,
      (frame % (a.columns || 1)) * a.width,
      Math.floor(frame / (a.columns || 1)) * a.height,
      a.width,
      a.height,
      x,
      y,
      a.width,
      a.height,
    );
  }
  digits(name, value, x, y, padded = 0) {
    const text = String(Math.max(0, Math.floor(value)));
    const all = text.padStart(padded, "0");
    const advance = name === "score-digits" ? 12 : 14;
    for (let i = 0; i < all.length; i++)
      this.art(
        name,
        x + i * advance,
        y,
        name === "score-digits" && i < all.length - text.length
          ? 10
          : Number(all[i]),
      );
  }
  draw(engine) {
    const c = this.ctx,
      s = engine.s;
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, 640, 480);
    this.art("score-label", 3, 6);
    this.digits("score-digits", s.score, 63, 6, 10);
    const blue = c.createLinearGradient(0, 0, 0, 34);
    blue.addColorStop(0, "#0872b6");
    blue.addColorStop(1, "#15557c");
    c.fillStyle = blue;
    c.fillRect(216, 0, 175, 34);
    this.art("quick", 198, -0.5);
    this.art("panel", 380, -45);
    this.minimap(engine);
    const depth = String(engine.depth);
    this.digits("depth-digits", engine.depth, 605 - depth.length * 14, 104);
    const hp = this.assets.ensure(this.assets.manifest.hud.hp.src);
    if (hp) {
      const ratio = clamp(s.hp / engine.maxHp, 0, 1);
      if (ratio)
        c.drawImage(
          hp,
          0,
          0,
          hp.width * ratio,
          hp.height,
          524,
          151,
          hp.width * ratio,
          hp.height,
        );
    }
    c.fillStyle = "#fffac1";
    c.font = "bold 10px Arial";
    c.textAlign = "center";
    c.fillText(`${Math.ceil(s.hp)}/${engine.maxHp}`, 568, 161);
    this.art(
      "air",
      509,
      173,
      Math.round(clamp(s.ap / engine.maxAp, 0, 1) * 100),
    );
    this.art("inventory", 596, 280);
  }
  minimap(engine) {
    const c = this.ctx,
      m = engine.source,
      p = engine.s.p;
    const px = p.x / TILE,
      py = p.y / TILE;
    const ox = Math.max(0, px * 2 - 40),
      oy = py * 2 - 40;
    c.save();
    c.beginPath();
    c.rect(514, 18, 107, 85);
    c.clip();
    c.fillStyle = "#252619";
    c.fillRect(514, 18, 107, 85);
    for (
      let y = Math.max(0, Math.floor(oy / 2));
      y < Math.min(m.height, Math.ceil((oy + 85) / 2));
      y++
    ) {
      for (
        let x = Math.floor(ox / 2);
        x < Math.min(m.width, Math.ceil((ox + 107) / 2));
        x++
      ) {
        const t = engine.tile(x, y);
        if (t.prop1 !== 30 && !engine.world.discovered[t.index]) continue;
        c.fillStyle =
          t.prop1 === 30
            ? "#438ac0"
            : t.prop1 >= 20
              ? "#a58b53"
              : t.tile === 16
                ? "#6e7565"
                : t.tile >= 80
                  ? "#e5bf55"
                  : "#665638";
        c.fillRect(514 + x * 2 - ox, 18 + y * 2 - oy, 2, 2);
      }
    }
    // The glass grid remains visible over revealed terrain, like the original CRT.
    c.fillStyle = "#1c291b35";
    for (let x = 514; x < 621; x += 2) c.fillRect(x, 18, 0.5, 85);
    for (let y = 18; y < 103; y += 2) c.fillRect(514, y, 107, 0.5);
    c.fillStyle = "#3cf12d";
    c.fillRect(
      Math.round(514 + px * 2 - ox) - 2,
      Math.round(18 + py * 2 - oy) - 2,
      5,
      5,
    );
    c.restore();
  }
}
