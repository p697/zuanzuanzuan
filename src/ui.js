import { InstrumentHUD } from "./hud.js";
import { translate, itemName, stories } from "./i18n.js";
const profile =
  new URLSearchParams(location.search).get("profile") === "qa" ? ".qa" : "";
export const SAVE_KEY = "digger-boy-native.save.v1" + profile,
  BACKUP_KEY = "digger-boy-native.backup.v1" + profile;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export class UI {
  constructor(engine, assets, renderer, audio) {
    this.engine = engine;
    this.assets = assets;
    this.renderer = renderer;
    this.audio = audio;
    this.locale = "zh-CN";
    this.mode = "title";
    this.menuContext = true;
    this.modal = document.querySelector("#modal");
    this.hud = document.querySelector("#hud");
    this.instruments = new InstrumentHUD(
      document.querySelector("#instrument-hud"),
      assets,
    );
    this.selected = 0;
    this.shopTab = "supplies";
    this.pending = null;
    this.toastTimer = null;
    this.lastQuick = "";
    this.settings = { music: 0.35, effects: 0.6, shake: true };
    try {
      Object.assign(
        this.settings,
        JSON.parse(localStorage.getItem("digger-boy.settings") || "{}"),
      );
    } catch {}
    this.settings.music = Math.max(
      0,
      Math.min(1, Number(this.settings.music) || 0),
    );
    this.settings.effects = Math.max(
      0,
      Math.min(1, Number(this.settings.effects) || 0),
    );
    this.audio.settings = this.settings;
    this.renderer.motion = this.settings.shake;
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-action]");
      if (b && !b.disabled) this.action(b.dataset.action, b.dataset);
    });
    document.querySelector("#help-link").onclick = () => this.help();
    document.querySelector("#sound-toggle").onclick = () => {
      this.audio.muted = !this.audio.muted;
      this.audio.apply();
      document.querySelector("#sound-toggle").textContent = this.audio.muted
        ? "♪̸"
        : "♫";
    };
    document.querySelector("#full-toggle").onclick = () => {
      const f = document.querySelector("#game-frame");
      if (document.fullscreenElement) document.exitFullscreen();
      else f.requestFullscreen?.().catch(() => {});
    };
    document.querySelector("#save-file").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        if (f.size > 5_000_000) throw new Error("saveInvalid");
        const text = await f.text();
        this.engine.restore(text);
        this.menuContext = false;
        this.save(false);
        if (this.engine.s.complete) this.ending();
        else this.close();
        this.toast(this.t("imported"));
      } catch {
        this.toast(this.t("saveInvalid"));
      }
      e.target.value = "";
    };
    this.modal.addEventListener("input", (e) => {
      const name = e.target.dataset.setting;
      if (!name) return;
      this.settings[name] =
        e.target.type === "checkbox"
          ? e.target.checked
          : Number(e.target.value);
      this.audio.apply();
      this.renderer.motion = this.settings.shake;
      try {
        localStorage.setItem(
          "digger-boy.settings",
          JSON.stringify(this.settings),
        );
      } catch {}
    });
    this.modal.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusable = [
        ...this.modal.querySelectorAll(
          'button:not(:disabled),input,select,[tabindex="0"]',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }
  t(key, params) {
    return translate(this.locale, key, params);
  }
  name(code) {
    return itemName(this.engine.data, code, this.locale);
  }
  description(item) {
    const level = item.code % 10,
      params = this.engine.data.equipment;
    if (item.type === 4) {
      const x = params.helmet[level - 1];
      return `最大氧气 ${x.maxAp} · 防御 ${x.defence}`;
    }
    if (item.type === 5)
      return `挖掘力 ${params.drill[level].digSpeed} · 购买后自动装备`;
    if (item.type === 6)
      return `喷气力 ${params.boots[level - 1].boost} · 上升更快`;
    return (
      item.description[this.locale] ||
      item.description["zh-CN"] ||
      `出售价格：${item.price.toLocaleString()} 金币`
    );
  }
  image(code) {
    return this.assets.manifest.images[`item${code}`]?.src || "";
  }
  icon(code) {
    const src = this.image(code);
    return src ? `<img src="${esc(src)}" alt="">` : "";
  }
  button(label, action, extra = "", kind = "") {
    return `<button class="btn ${kind}" data-action="${action}" ${extra}>${esc(this.t(label))}</button>`;
  }
  open(mode, html, { className = "" } = {}) {
    this.mode = mode;
    this.engine.running = false;
    this.modal.className = `modal ${className}`;
    this.modal.innerHTML = html;
    if (["dead", "tutorial-retry", "tutorial-complete"].includes(mode))
      this.modal.querySelector(".close-modal")?.remove();
    this.modal.hidden = false;
    document.querySelector("#touch-controls").style.visibility = "hidden";
    this.modal
      .querySelector("button:not(:disabled)")
      ?.focus({ preventScroll: true });
    this.audio.select(
      mode === "shop" ? "shopbgm" : mode === "title" ? "startMenu" : null,
    );
  }
  panel(title, body, buttons = "", extra = "") {
    return `<section class="panel ${extra}"><button class="close-modal" data-action="close" aria-label="关闭">×</button><h2 id="modal-title">${esc(this.t(title))}</h2>${body}${buttons ? `<div class="buttons">${buttons}</div>` : ""}</section>`;
  }
  close() {
    if (!this.engine.s || this.menuContext) {
      this.title();
      return;
    }
    this.mode = "play";
    this.modal.hidden = true;
    this.engine.running = !this.engine.s.complete;
    this.hud.hidden = false;
    document.querySelector("#touch-controls").style.visibility = "visible";
    document.querySelector("#game").focus({ preventScroll: true });
    this.music();
  }
  title() {
    this.menuContext = true;
    this.engine.running = false;
    this.hud.hidden = true;
    let hasSave = false;
    try {
      hasSave = !!localStorage.getItem(SAVE_KEY);
    } catch {}
    this.open(
      "title",
      `<div class="title-card"><h1 id="modal-title">${this.t("title")}</h1><p class="tagline">${this.t("subtitle")}</p><div class="title-actions">${this.button("continue", "continue", hasSave ? "" : "disabled", "primary")}${this.button("newGame", "new", "", "")}${this.button("howTo", "help", "", "quiet")}${this.button("settings", "settings", "", "quiet")}</div><p class="menu-hint">${this.t("menuHint")}</p></div>`,
      { className: "title-screen" },
    );
  }
  newGame() {
    let saved = false;
    try {
      saved = !!localStorage.getItem(SAVE_KEY);
    } catch {}
    this.open(
      "new",
      this.panel(
        saved ? "newConfirm" : "newGame",
        `<p>${saved ? this.t("newConfirmBody") : "带上钻头，从博士的训练开始，穿过三个矿区，把小雪带回地面。"}</p><label class="small-note"><input type="checkbox" id="skip-tutorial"> ${this.t("skipTutorial")}</label>`,
        this.button("start", "start", "", "primary") +
          this.button("cancel", "title", "", "quiet"),
      ),
    );
  }
  start() {
    const tutorial = !document.querySelector("#skip-tutorial")?.checked;
    try {
      const old = localStorage.getItem(SAVE_KEY);
      if (old) localStorage.setItem(BACKUP_KEY, old);
    } catch {}
    this.engine.newGame({ tutorial });
    this.menuContext = false;
    this.lastQuick = "";
    this.close();
  }
  continueGame() {
    try {
      const text = localStorage.getItem(SAVE_KEY);
      if (!text) throw new Error();
      this.engine.restore(text);
      this.menuContext = false;
      if (this.engine.s.complete) {
        this.ending();
        return;
      }
      if (this.engine.s.hp <= 0) {
        this.dead();
        return;
      }
      this.close();
    } catch {
      this.toast(this.t("saveInvalid"));
    }
  }
  save(notify = true) {
    if (!this.engine.s) return;
    try {
      const data = this.engine.serialize(),
        old = localStorage.getItem(SAVE_KEY);
      if (old && old !== data) localStorage.setItem(BACKUP_KEY, old);
      localStorage.setItem(SAVE_KEY, data);
      document.querySelector("#save-status").textContent =
        `已保存 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
      if (notify) this.toast(this.t("saved"));
      return true;
    } catch {
      document.querySelector("#save-status").textContent = this.t("saveFailed");
      this.toast(this.t("saveFailed"));
      return false;
    }
  }
  export() {
    let text = this.engine.s ? this.engine.serialize() : null;
    try {
      text ??= localStorage.getItem(SAVE_KEY);
    } catch {}
    if (!text) {
      this.toast(this.t("continueLocked"));
      return;
    }
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `挖地小子-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  pause() {
    if (!this.engine.s) return;
    this.save(false);
    this.open(
      "pause",
      this.panel(
        "paused",
        `<p>${this.t("safetySave")}</p>`,
        this.button("resume", "close", "", "primary") +
          this.button("save", "save") +
          this.button("settings", "settings") +
          this.button("howTo", "help") +
          this.button("toTitle", "leave", "", "quiet"),
      ),
    );
  }
  story(id) {
    const s = stories[id];
    if (!s) return;
    const scene = this.assets.manifest.cutscenes?.[s.image];
    const first = Array.isArray(scene) ? scene[0] : scene?.frames?.[0];
    const image = typeof first === "string" ? first : first?.src;
    this.open(
      "story",
      `<section class="panel story-panel">${image ? `<img class="story-image" src="${esc(image)}" alt="${esc(s.title)}">` : ""}<div class="story-content"><div class="speaker">${esc(s.speaker)}</div><h2 id="modal-title">${esc(s.title)}</h2><p>${esc(s.body)}</p><div class="buttons">${this.button("start", "close", "", "primary")}</div></div></section>`,
    );
  }
  tutorialComplete() {
    this.open(
      "tutorial-complete",
      this.panel(
        "tutorialComplete",
        `<p>${this.t("shiftTutorial")}</p>`,
        this.button(
          this.engine.s.tutorial === 3 ? "beginAdventure" : "nextLesson",
          "next-tutorial",
          "",
          "primary",
        ) + this.button("resume", "close", "", "quiet"),
      ),
    );
  }
  dead() {
    this.open(
      "dead",
      this.panel(
        "gameOver",
        `<p>${this.t("deathBody")}</p>`,
        this.button("rescue", "rescue", "", "primary") +
          this.button("continue", "continue", "", "quiet"),
      ),
    );
  }
  tutorialRetry() {
    this.open(
      "tutorial-retry",
      this.panel(
        "tutorialRetry",
        `<p>${this.t("tutorialRetryBody")}</p>`,
        this.button("retry", "retry-tutorial", "", "primary"),
      ),
    );
  }
  shop(tab = this.shopTab) {
    this.shopTab = tab;
    const e = this.engine,
      s = e.s;
    const groups = {
      supplies: (i) => i.type === 2,
      equipment: (i) => i.type >= 4 && i.type <= 6,
      special: (i) => i.type === 3,
    };
    const items = e.data.items.filter(groups[tab] || groups.supplies);
    const grid = items
      .map((i) => {
        const group =
            i.type === 4
              ? "head"
              : i.type === 5
                ? "drill"
                : i.type === 6
                  ? "boots"
                  : null,
          owned = group && s.gear[group] >= i.code % 10;
        return `<div class="shop-item"><div class="item-image">${this.icon(i.code)}</div><div><h3>${esc(this.name(i.code))}</h3><small>${esc(this.description(i))}</small><span class="price">◆ ${i.price.toLocaleString()}</span></div>${this.button(owned ? "owned" : group ? "equip" : "buy", "buy", `data-code="${i.code}" ${owned || s.money < i.price ? "disabled" : ""}`)}</div>`;
      })
      .join("");
    const total = Object.entries(s.inventory)
      .filter(([c]) => +c < 10)
      .reduce((a, [c, n]) => a + e.catalog.get(+c).price * n, 0);
    this.open(
      "shop",
      `<section class="panel shop-panel"><button class="close-modal" data-action="close" aria-label="关闭">×</button><div class="panel-head"><h2 id="modal-title">${this.t("shop")}</h2><span class="wallet">◆ ${s.money.toLocaleString()}</span></div><div class="tabs">${["supplies", "equipment", "special"].map((k) => `<button class="tab ${tab === k ? "active" : ""}" data-action="shop-tab" data-tab="${k}">${this.t(k)}</button>`).join("")}</div><div class="shop-grid">${grid}</div><div class="shop-summary"><span>${this.t("bag", { used: e.usedSlots, max: e.capacity })}<br>可售矿物：${total.toLocaleString()} 金币</span>${this.button("sell", "sell", total ? "" : "disabled", "primary")}</div><div class="buttons">${this.button("resume", "close")}${this.button("inventory", "inventory")}${this.button("save", "save")}${s.stage > 0 && e.depth < 4 ? this.button("travel", "travel", "", "quiet") : ""}</div></section>`,
    );
  }
  inventory(selected = this.selected) {
    this.selected = +selected;
    const e = this.engine,
      s = e.s;
    const stacks = [];
    for (const [code, count] of Object.entries(s.inventory)) {
      const max = +code < 10 ? 5 : 1;
      for (let left = count; left > 0; left -= max)
        stacks.push({ code: +code, n: Math.min(max, left) });
    }
    let grid = stacks
      .map(
        ({ code, n }) =>
          `<button class="slot ${code === this.selected ? "selected" : ""}" data-action="select-item" data-code="${code}" aria-label="${esc(this.name(code))} ${n}">${this.icon(code)}<b>${n}</b></button>`,
      )
      .join("");
    for (let n = stacks.length; n < e.capacity; n++)
      grid += '<div class="slot empty"></div>';
    const item = e.catalog.get(this.selected),
      canUse = item?.type === 2;
    const detail = item
      ? `<div class="item-image">${this.icon(item.code)}</div><h3>${esc(this.name(item.code))}</h3><p>${esc(this.description(item))}</p>${canUse ? `<div class="buttons">${this.button("use", "use", `data-code="${item.code}"`, "primary")}</div><p class="small-note">${this.t("quickHint")}</p><div class="buttons">${["A", "S", "D", "F", "G"].map((k, i) => `<button class="btn quiet" data-action="assign" data-slot="${i}" data-code="${item.code}">${k}</button>`).join("")}</div>` : ""}${item.code !== 82 && item.code !== 83 ? `<div class="buttons">${this.button("fullBagDelete", "discard", `data-code="${item.code}"`, "quiet")}</div>` : ""}`
      : `<h3>${this.t("inventory")}</h3><p>选择道具查看说明。普通矿物每 5 个占一格，特殊矿石单独保存。</p>`;
    this.open(
      "inventory",
      `<section class="panel inventory-panel"><button class="close-modal" data-action="close" aria-label="关闭">×</button><div class="panel-head"><h2 id="modal-title">${this.t("inventory")}</h2><span class="wallet">${e.usedSlots} / ${e.capacity} 格</span></div><div class="inventory-layout"><div class="inventory-grid">${grid}</div><div class="item-detail">${detail}</div></div><div class="gear-row"><div class="gear-stat">钻头 Lv.${s.gear.drill}<b>挖掘力 ${e.digSpeed}</b></div><div class="gear-stat">头盔 Lv.${s.gear.head}<b>氧气 ${e.maxAp}</b></div><div class="gear-stat">喷气靴 Lv.${s.gear.boots}<b>喷气力 ${e.boost}</b></div></div>${this.specialRow()}<div class="buttons">${this.button("resume", "close", "", "primary")}${this.button("save", "save")}${this.button("export", "export", "", "quiet")}</div></section>`,
    );
  }
  specialRow() {
    return `<div class="special-row">特殊矿石 ${[0, 1, 2].map((i) => `<span class="rare-item ${this.engine.s.special[i] ? "found" : ""}">${this.icon(i + 10)} ${this.t("specialNames")[i]}</span>`).join("")}</div>`;
  }
  map() {
    const e = this.engine;
    this.open(
      "map",
      this.panel(
        "map",
        `<div class="map-content"><div class="map-scroll"><canvas id="map-canvas" aria-label="矿区已探索地图"></canvas></div><div class="map-legend"><b>${this.sector()}</b><p class="small-note">${this.t("mapLegend")}</p><div>🔴 ${this.t("you")}</div><div>◆ ${this.t("shop")}</div><div>◆ ${this.t("bossRoom")}</div><div>◇ ${this.t("rare")}</div><div>● ${this.t("airStation")}</div><p class="small-note">当前深度<br><b>${e.depth} m</b></p></div></div>`,
        this.button("close", "close", "", "primary"),
      ),
    );
    const y = this.renderer.drawMap(document.querySelector("#map-canvas"), e);
    const box = this.modal.querySelector(".map-scroll");
    box.scrollTop = y - box.clientHeight / 2;
  }
  travel() {
    const e = this.engine;
    this.open(
      "travel",
      this.panel(
        "travel",
        `<p>${this.t("travelBody")}</p><div class="buttons">${[1, 2, 3].map((n) => this.button(`sector${n}`, "travel-to", `data-stage="${n}" ${n > e.s.unlocked ? "disabled" : ""}`)).join("")}</div>`,
        this.button("back", "shop", "", "quiet"),
      ),
    );
  }
  help() {
    this.open(
      "help",
      this.panel(
        "howTo",
        `<div class="controls-list">${["keysMove", "keysUp", "keysDown", "keysUse", "keysUi"].map((k) => `<div>${this.t(k)}</div>`).join("")}</div><ol class="help-list">${["tip1", "tip2", "tip3", "tip4", "tip5"].map((k) => `<li>${this.t(k)}</li>`).join("")}</ol>`,
        this.button(
          this.engine.s ? "resume" : "back",
          this.engine.s ? "close" : "title",
          "",
          "primary",
        ),
      ),
    );
  }
  settingsPanel() {
    this.open(
      "settings",
      this.panel(
        "settings",
        `<div class="settings-row"><span>${this.t("music")}</span><input aria-label="音乐音量" data-setting="music" type="range" min="0" max="1" step=".05" value="${this.settings.music}"></div><div class="settings-row"><span>${this.t("effects")}</span><input aria-label="音效音量" data-setting="effects" type="range" min="0" max="1" step=".05" value="${this.settings.effects}"></div><div class="settings-row"><span>${this.t("motion")}</span><input aria-label="屏幕震动" data-setting="shake" type="checkbox" ${this.settings.shake ? "checked" : ""}></div><div class="settings-row"><span>${this.t("language")}</span><select aria-label="语言"><option>简体中文</option></select></div><p class="small-note">${this.t("autoSaveNote")}</p><div class="buttons">${this.button("export", "export")}${this.button("import", "import")}${this.button("backup", "backup", "", "quiet")}</div>`,
        this.button("back", this.engine.s ? "pause" : "title", "", "primary"),
      ),
    );
  }
  ending() {
    const e = this.engine,
      s = e.s,
      happy = s.ending === "happy";
    const entry =
      this.assets.manifest.cutscenes?.[happy ? "ending_happy" : "ending_not"];
    const frame = Array.isArray(entry) ? entry[0] : entry?.frames?.[0],
      src = typeof frame === "string" ? frame : frame?.src;
    this.open(
      "ending",
      `<section class="panel story-panel">${src ? `<img class="story-image" src="${esc(src)}" alt="结局">` : ""}<div class="story-content"><div class="eyebrow">${happy ? "圆满结局" : "冒险完成"}</div><h2 id="modal-title">${this.t(happy ? "perfect" : "normalEnding")}</h2><p>${this.t(happy ? "perfectBody" : "normalBody")}</p><div class="ending-stats"><div>开采矿块<b>${s.stats.mined}</b></div><div>击败怪物<b>${s.stats.kills}</b></div><div>特殊矿石<b>${s.special.filter(Boolean).length} / 3</b></div></div><div class="buttons">${this.button("explore", "explore", "", "primary")}${this.button("export", "export")}${this.button("playAgain", "new", "", "quiet")}</div></div></section>`,
    );
  }
  toast(text) {
    const el = document.querySelector("#toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 3000);
  }
  sector() {
    const s = this.engine.s;
    return this.t(
      s.map === "boss_map"
        ? s.bossFor === 1
          ? "boss1"
          : "boss2"
        : s.tutorial
          ? `tutorial${s.tutorial}`
          : `sector${s.stage}`,
    );
  }
  update() {
    const e = this.engine,
      s = e.s;
    if (!s) return;
    const set = (id, v) => {
      const n = document.getElementById(id);
      if (n.textContent !== String(v)) n.textContent = v;
    };
    if (!this.hud.hidden) this.instruments.draw(e);
    set("hp-value", `${this.t("life")} ${Math.ceil(s.hp)}/${e.maxHp}`);
    set("ap-value", `${this.t("air")} ${Math.ceil(s.ap)}/${e.maxAp}`);
    for (const [id, key, value, max] of [
      ["hp", "life", s.hp, e.maxHp],
      ["ap", "air", s.ap, e.maxAp],
    ]) {
      const meter = document.getElementById(`${id}-meter`);
      meter.setAttribute("aria-label", this.t(key));
      meter.setAttribute("aria-valuemax", max);
      meter.setAttribute("aria-valuenow", Math.ceil(value));
      meter.title = `${this.t(key)} ${Math.ceil(value)}/${max}`;
    }
    set("money-value", s.money.toLocaleString());
    set("depth-value", `${e.depth} m`);
    set("sector-label", this.sector());
    set(
      "objective-text",
      this.t(
        s.map === "boss_map"
          ? "objectiveBoss"
          : s.tutorial
            ? `objective${s.tutorial}`
            : `objectiveStage${s.stage}`,
      ),
    );
    set(
      "objective-progress",
      s.tutorial
        ? `${s.tutorialProgress}/${s.tutorial === 1 ? 2 : s.tutorial === 2 ? 10 : 1} · ${this.t("timeLeft", { seconds: Math.ceil(s.tutorialTime) })}`
        : `背包 ${e.usedSlots}/${e.capacity} · 特殊矿石 ${s.special.filter(Boolean).length}/3`,
    );
    const hash = JSON.stringify([s.inventory, s.quick]);
    if (hash !== this.lastQuick) {
      this.lastQuick = hash;
      document.querySelector("#quick-slots").innerHTML = s.quick
        .map(
          (code, i) =>
            `<button class="quick-slot" data-action="use" data-code="${code}" aria-label="${["A", "S", "D", "F", "G"][i]} ${esc(this.name(code))} ${s.inventory[code] || 0}">${this.icon(code)}<b>${s.inventory[code] || 0}</b></button>`,
        )
        .join("");
    }
    const b = document.querySelector("#interact-button");
    let hint = e.nearest("Shop", 115)
      ? "enterShop"
      : e.nearest("BossRoom", 90)
        ? "enterBoss"
        : e.nearest("Doctor", 85)
          ? "talk"
          : null;
    if (
      !hint &&
      e.world.portal &&
      (e.depth < 4 ||
        Math.hypot(e.world.portal.x - s.p.x, e.world.portal.y - s.p.y) < 70)
    )
      hint = "returnPortal";
    b.hidden = !hint || this.mode !== "play";
    if (hint) b.innerHTML = `<kbd>E</kbd>${this.t(hint)}`;
    document.querySelector("#game-frame").dataset.phase = s.map;
    document.querySelector("#game-frame").dataset.depth = String(e.depth);
  }
  music() {
    if (this.mode !== "play") return;
    this.audio.select(
      this.engine.s?.map === "boss_map"
        ? "bossbgm"
        : this.engine.inTutorial
          ? "questbgm"
          : "normalbgm",
    );
  }
  action(name, d = {}) {
    this.audio.unlock();
    const e = this.engine;
    if (name === "new") {
      this.newGame();
      return;
    }
    if (name === "start") {
      this.start();
      return;
    }
    if (name === "continue") {
      this.continueGame();
      return;
    }
    if (name === "title") {
      this.title();
      return;
    }
    if (name === "leave") {
      this.save(false);
      this.title();
      return;
    }
    if (name === "close") {
      this.close();
      return;
    }
    if (name === "help") {
      this.help();
      return;
    }
    if (name === "settings") {
      this.settingsPanel();
      return;
    }
    if (name === "export") {
      this.export();
      return;
    }
    if (name === "import") {
      document.querySelector("#save-file").click();
      return;
    }
    if (name === "backup") {
      try {
        const raw = localStorage.getItem(BACKUP_KEY);
        if (!raw) {
          this.toast(this.t("noBackup"));
          return;
        }
        this.pending = () => {
          e.restore(raw);
          this.save(false);
          this.close();
        };
        this.open(
          "confirm",
          this.panel(
            "backup",
            `<p>${this.t("backupConfirm")}</p>`,
            this.button("confirm", "confirm", "", "primary") +
              this.button("cancel", "settings"),
          ),
        );
      } catch {
        this.toast(this.t("saveInvalid"));
      }
      return;
    }
    if (name === "confirm") {
      const fn = this.pending;
      this.pending = null;
      try {
        fn?.();
      } catch {
        this.toast(this.t("saveInvalid"));
      }
      return;
    }
    if (!e.s) return;
    switch (name) {
      case "pause":
        this.pause();
        break;
      case "save":
        this.save();
        break;
      case "inventory":
        this.inventory();
        break;
      case "select-item":
        this.inventory(d.code);
        break;
      case "map":
        this.map();
        break;
      case "shop":
        this.shop();
        break;
      case "shop-tab":
        this.shop(d.tab);
        break;
      case "buy": {
        const r = e.buy(+d.code);
        if (r.ok) this.assets.loadHelmet(e.s.gear.head);
        this.shop();
        this.toast(this.t(r.key));
        break;
      }
      case "sell": {
        const amount = e.sell();
        this.shop();
        this.toast(
          amount
            ? this.t("sold", { money: amount.toLocaleString() })
            : this.t("nothingToSell"),
        );
        break;
      }
      case "use":
      case "bomb": {
        const code = name === "bomb" ? 21 : +d.code;
        const r = e.use(code);
        if (!r.ok) this.toast(this.t(r.key));
        else {
          if ([21, 22, 23, 27, 28].includes(code)) this.close();
          else if (this.mode === "inventory") this.inventory();
        }
        break;
      }
      case "assign":
        e.s.quick[+d.slot] = +d.code;
        this.save(false);
        this.toast(
          this.t("assign", { key: ["A", "S", "D", "F", "G"][+d.slot] }),
        );
        break;
      case "discard":
        this.pending = () => {
          e.takeItem(+d.code);
          this.inventory();
        };
        this.open(
          "confirm",
          this.panel(
            "fullBagDelete",
            `<p>${esc(this.t("discardConfirm", { name: this.name(+d.code) }))}</p>`,
            this.button("confirm", "confirm", "", "danger") +
              this.button("cancel", "inventory"),
          ),
        );
        break;
      case "interact":
        e.interact();
        break;
      case "next-tutorial":
        this.close();
        e.finishTutorial();
        break;
      case "retry-tutorial":
        e.retryTutorial();
        this.close();
        break;
      case "rescue":
        e.rescue();
        this.close();
        break;
      case "travel":
        this.travel();
        break;
      case "travel-to":
        if (+d.stage <= e.s.unlocked && e.depth < 4) {
          e.advance(+d.stage);
          this.close();
        }
        break;
      case "explore":
        e.s.complete = false;
        this.close();
        e.advance(3);
        break;
    }
    this.update();
  }
}
