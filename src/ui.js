import { Cinematics } from "./cinematics.js";
import { storyQueues } from "./story-flow.js";
import { InstrumentHUD } from "./hud.js";
import { translate, itemName, itemDescription, stories } from "./i18n.js";
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
  constructor(engine, assets, renderer, audio, movies) {
    this.engine = engine;
    this.assets = assets;
    this.renderer = renderer;
    this.audio = audio;
    this.locale = "zh-CN";
    this.cinematics = new Cinematics(this, movies);
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
      if (this.cinematics.video) this.cinematics.video.muted = this.audio.muted;
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
        if (this.engine.s.cutscene) this.cinematics.show();
        else if (this.engine.s.complete) this.ending();
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
    return itemDescription(this.engine.data, item, this.locale);
  }
  closeButton() {
    return `<button class="close-modal" data-action="close" aria-label="${esc(this.t("close"))}">×</button>`;
  }
  equipmentGroup(item) {
    return { 4: "head", 5: "drill", 6: "boots" }[item.type];
  }
  portrait(kind = "player") {
    const level = this.engine.s?.gear.head || 0;
    const sprite =
      kind === "player"
        ? this.assets.manifest.sprites.player.helmetVariants?.[level]?.idle ||
          this.assets.manifest.sprites.player.states.idle
        : this.assets.manifest.sprites.doctor;
    return `<img class="character-portrait" src="${esc(sprite.frames[0])}" alt="${esc(this.t(kind === "player" ? "minerName" : "doctor"))}">`;
  }
  equipmentSummary() {
    const e = this.engine,
      gear = e.s.gear;
    return `<div class="miner-profile"><div class="profile-readings">
      <div><span>${this.t("life")}</span><b class="life-value">${Math.ceil(e.s.hp)} / ${e.maxHp}</b></div>
      <div><span>${this.t("air")}</span><b class="air-value">${Math.ceil(e.s.ap)} / ${e.maxAp}</b></div>
      <div><span>${this.t("digPower")}</span><b>${e.digSpeed}</b></div>
      <div><span>${this.t("boostPower")}</span><b>${e.boost}</b></div>
      <div><span>${this.t("defence")}</span><b>${e.defence}</b></div>
      </div><div class="miner-avatar">${this.portrait()}</div>
      <div class="equipped-items">${[
        ["head", 50, "helmet"],
        ["drill", 60, "drill"],
        ["boots", 40, "boots"],
      ]
        .map(
          ([key, base, label]) =>
            `<div title="${esc(this.t(label))}">${gear[key] ? this.icon(base + gear[key]) : `<span>${this.t(label)}</span>`}<b>${this.t("level", { level: gear[key] })}</b></div>`,
        )
        .join("")}</div></div>`;
  }
  inventorySlots() {
    const e = this.engine,
      stacks = [];
    for (const [code, count] of Object.entries(e.s.inventory)) {
      const size = +code < 10 ? 5 : 1;
      for (let left = count; left > 0; left -= size)
        stacks.push({ code: +code, count: Math.min(size, left) });
    }
    return Array.from({ length: 36 }, (_, n) => {
      const stack = stacks[n];
      if (stack)
        return `<button class="slot ${stack.code === this.selected ? "selected" : ""}" data-action="select-item" data-code="${stack.code}" aria-pressed="${stack.code === this.selected}" aria-label="${esc(this.name(stack.code))} × ${stack.count}" title="${esc(this.name(stack.code))}">${this.icon(stack.code)}<b>${stack.count}</b></button>`;
      return `<div class="slot ${n >= e.capacity ? "locked" : "empty"}" ${n >= e.capacity ? `title="${esc(this.t("lockedSlot"))}"` : ""}></div>`;
    }).join("");
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
    this.cinematics.dispose();
    const previousControl =
      this.mode === mode && this.modal.contains(document.activeElement)
        ? { ...document.activeElement.dataset }
        : null;
    this.mode = mode;
    this.engine.running = false;
    this.modal.className = `modal ${className}`;
    this.modal.dataset.mode = mode;
    this.modal.innerHTML = html;
    if (["dead", "tutorial-retry", "tutorial-complete"].includes(mode))
      this.modal.querySelector(".close-modal")?.remove();
    this.modal.hidden = false;
    document.querySelector("#touch-controls").style.visibility = "hidden";
    const restoredControl = previousControl?.action
      ? [...this.modal.querySelectorAll("button:not(:disabled)")].find(
          (button) =>
            Object.entries(previousControl).every(
              ([key, value]) => button.dataset[key] === value,
            ),
        )
      : null;
    (
      restoredControl || this.modal.querySelector("button:not(:disabled)")
    )?.focus({ preventScroll: true });
    this.audio.select(
      mode === "shop" ? "shopbgm" : mode === "title" ? "startMenu" : null,
    );
  }
  panel(title, body, buttons = "", extra = "") {
    return `<section class="panel ${extra}">${this.closeButton()}<h2 id="modal-title">${esc(this.t(title))}</h2>${body}${buttons ? `<div class="buttons">${buttons}</div>` : ""}</section>`;
  }
  close() {
    if (!this.engine.s || this.menuContext) {
      this.title();
      return;
    }
    if (this.engine.s.cutscene) {
      this.cinematics.show();
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
    this.inventoryFromShop = false;
    this.menuContext = true;
    this.engine.running = false;
    this.hud.hidden = true;
    let hasSave = false;
    try {
      hasSave = !!localStorage.getItem(SAVE_KEY);
    } catch {}
    this.open(
      "title",
      `<div class="title-card"><h1 id="modal-title">${this.t("title")}</h1><p class="tagline">${this.t("subtitle")}</p><div class="title-actions">${this.button("newGame", "new", "", "primary")}${this.button("continue", "continue", hasSave ? "" : "disabled", "")}${this.button("howTo", "help", "", "quiet")}</div><div class="title-settings">${this.button("settings", "settings", "", "quiet")}</div><p class="menu-hint">${this.t("menuHint")}</p></div>`,
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
        `<p>${saved ? this.t("newConfirmBody") : this.t("newGameBody")}</p><label class="small-note"><input type="checkbox" id="skip-tutorial"> ${this.t("skipTutorial")}</label>`,
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
      if (this.engine.s.cutscene) {
        this.cinematics.show();
        return;
      }
      if (this.engine.s.complete) {
        this.ending();
        return;
      }
      if (this.engine.s.hp <= 0 && !this.engine.s.p.deathMs) {
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
      document.querySelector("#save-status").textContent = this.t("savedAt", {
        time: new Date().toLocaleTimeString(this.locale, {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
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
    const saved = this.save(false);
    this.open(
      "pause",
      this.panel(
        "paused",
        `<p>${this.t(saved ? "safetySave" : "saveFailed")}</p>`,
        this.button("resume", "close", "", "primary") +
          this.button("save", "save") +
          this.button("settings", "settings") +
          this.button("howTo", "help") +
          this.button("toTitle", "leave", "", "quiet"),
      ),
    );
  }
  story(id) {
    if (storyQueues[id]) {
      this.cinematics.start(id);
      return;
    }
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
  shop(tab = this.shopTab, selected = this.shopSelected) {
    this.shopTab = tab;
    const e = this.engine,
      s = e.s;
    const groups = {
      supplies: (i) => i.type === 2,
      equipment: (i) => i.type >= 4 && i.type <= 6,
      special: (i) => i.type === 3,
    };
    const items = e.data.items.filter(groups[tab] || groups.supplies);
    const item = items.find((i) => i.code === +selected) || items[0];
    this.shopSelected = item.code;
    const group = this.equipmentGroup(item);
    const owned = group && s.gear[group] >= item.code % 10;
    const full = !group && item.code !== 81 && !e.canAdd(item.code);
    const maxBag = item.code === 81 && s.bagRows >= 6;
    const short = Math.max(0, item.price - s.money);
    const blocked = owned || maxBag || short || full;
    const reason = owned
      ? this.t("equippedOrBetter")
      : maxBag
        ? this.t("bagMax")
        : short
          ? this.t("coinsShort", { amount: short.toLocaleString() })
          : full
            ? this.t("purchaseBagFull")
            : group
              ? this.t("equipHint")
              : item.code === 81
                ? this.t("expandHint")
                : this.t("buyHint");
    const grid = items
      .map((i) => {
        const g = this.equipmentGroup(i),
          equipped = g && s.gear[g] >= i.code % 10;
        return `<button class="shop-item ${i.code === item.code ? "selected" : ""}" data-action="shop-select" data-code="${i.code}" aria-pressed="${i.code === item.code}"><span class="item-image">${this.icon(i.code)}</span><span class="shop-item-name">${esc(this.name(i.code))}</span><span class="price">${equipped ? this.t(s.gear[g] === i.code % 10 ? "owned" : "betterEquipped") : `◆ ${i.price.toLocaleString()}`}</span></button>`;
      })
      .join("");
    const total = Object.entries(s.inventory)
      .filter(([code]) => +code < 10)
      .reduce((sum, [code, n]) => sum + e.catalog.get(+code).price * n, 0);
    const comparison = group
      ? `<div class="equipment-comparison"><span>${this.t("currentEquipment")}</span><strong>${this.t("level", { level: s.gear[group] })} / ${this.t("level", { level: item.code % 10 })}</strong></div>`
      : `<div class="equipment-comparison"><span>${this.t(item.code === 81 ? "capacity" : "ownedCount")}</span><strong>${item.code === 81 ? this.t("slotCount", { count: e.capacity }) : this.t("itemCount", { count: s.inventory[item.code] || 0 })}</strong></div>`;
    this.open(
      "shop",
      `<section class="panel shop-panel">${this.closeButton()}
      <div class="shop-case"><h2 id="modal-title" class="case-title">${this.t("shop")}</h2>
        <div class="shop-welcome">${this.portrait("doctor")}<div><b>${this.t("doctorWelcome")}</b><p>${this.t("doctorShopHint")}</p></div></div>
        <div class="tabs" aria-label="${this.t("shopCategories")}">${["supplies", "equipment", "special"].map((key) => `<button class="tab ${tab === key ? "active" : ""}" data-action="shop-tab" data-tab="${key}" aria-pressed="${tab === key}">${this.t(key)}</button>`).join("")}</div>
        <div class="shop-grid">${grid}</div>
        <div class="shop-summary"><div><span>${this.t("sellableMinerals")}</span><b>◆ ${total.toLocaleString()}</b><small>${this.t("sellHint")}</small></div>${this.button("sell", "sell", total ? "" : "disabled", "primary")}</div>
        <div class="buttons case-footer">${this.button("inventory", "inventory")}${s.stage > 0 && e.depth < 4 ? this.button("travel", "travel") : ""}</div>
      </div>
      <aside class="shop-inspector metal-card"><h3 class="plate-title">${this.t("itemDetails")}</h3>
        <div class="wallet"><span>${this.t("money")}</span><b>◆ ${s.money.toLocaleString()}</b></div>
        <div class="item-detail"><div class="product-heading"><div class="item-image featured">${this.icon(item.code)}</div><h3>${esc(this.name(item.code))}</h3></div><p>${esc(this.description(item))}</p>${comparison}<div class="purchase-price"><span>${this.t("price")}</span><strong>◆ ${item.price.toLocaleString()}</strong></div>
        ${this.button(owned ? (s.gear[group] === item.code % 10 ? "owned" : "betterEquipped") : group ? "equip" : "buyOne", "buy", `data-code="${item.code}" ${blocked ? "disabled" : ""}`, "primary")}
        <p class="purchase-hint ${blocked ? "unavailable" : ""}">${reason}</p></div>
        <div class="inspector-footer"><span>${this.t("bag", { used: e.usedSlots, max: e.capacity })}</span>${this.button("leaveShop", "close", "", "exit")}</div>
      </aside></section>`,
      { className: "equipment-screen" },
    );
  }
  inventory(selected = this.selected) {
    if (this.mode !== "inventory" && this.mode !== "confirm")
      this.inventoryFromShop = this.mode === "shop";
    const e = this.engine,
      s = e.s;
    this.selected = s.inventory[+selected]
      ? +selected
      : Number(Object.keys(s.inventory)[0] || 0);
    const item = e.catalog.get(this.selected),
      canUse = item?.type === 2;
    const discardButton =
      item && item.code !== 82 && item.code !== 83
        ? this.button(
            "fullBagDelete",
            "discard",
            `data-code="${item.code}"`,
            "quiet",
          )
        : "";
    const detail = item
      ? `<div class="product-heading"><div class="item-image featured">${this.icon(item.code)}</div><h3>${esc(this.name(item.code))}</h3></div><p>${esc(this.description(item))}</p><div class="equipment-comparison"><span>${this.t("ownedCount")}</span><strong>${this.t(item.type === 1 ? "mineralCount" : "itemCount", { count: s.inventory[item.code] })}</strong></div>
      ${canUse ? `<div class="item-actions">${this.button("use", "use", `data-code="${item.code}"`, "primary")}${discardButton}</div><p class="quick-label">${this.t("quickHint")}</p><div class="assign-slots">${["A", "S", "D", "F", "G"].map((key, i) => `<button class="${s.quick[i] === item.code ? "assigned" : ""}" data-action="assign" data-slot="${i}" data-code="${item.code}" aria-label="${this.t("assign", { key })}" aria-pressed="${s.quick[i] === item.code}">${key}</button>`).join("")}</div>` : item.type === 1 ? "" : `<p class="small-note">${this.t("passiveHint")}</p>`}
      ${!canUse && discardButton ? `<div class="discard-action">${discardButton}</div>` : ""}`
      : `<div class="empty-bag-icon">${this.icon(81)}</div><h3>${this.t("emptyBagTitle")}</h3><p>${this.t("emptyBagBody")}</p>`;
    this.open(
      "inventory",
      `<section class="panel inventory-panel">${this.closeButton()}
      <aside class="inventory-inspector metal-card"><h3 class="plate-title">${this.t("itemDetails")}</h3><div class="item-detail">${detail}</div>${this.specialRow()}<div class="buttons">${this.button("save", "save")}${this.button("export", "export", "", "quiet")}</div></aside>
      <div class="inventory-case"><h2 id="modal-title" class="case-title">${this.t("inventory")}</h2>${this.equipmentSummary()}
        <div class="inventory-summary"><span class="wallet">◆ ${s.money.toLocaleString()}</span><span>${this.t("bag", { used: e.usedSlots, max: e.capacity })}</span></div>
        <div class="inventory-grid" aria-label="${this.t("inventorySlots")}">${this.inventorySlots()}</div>
        <div class="inventory-footer"><small>${this.t(s.bagRows < 6 ? "expandBagHint" : "bagExpanded")}</small>${this.button(this.inventoryFromShop ? "backShop" : "resume", this.inventoryFromShop ? "shop" : "close", "", "exit")}</div>
      </div></section>`,
      { className: "equipment-screen" },
    );
  }
  specialRow() {
    return `<div class="special-collection"><h4>${this.t("specialMinerals")}</h4><div class="special-row">${[0, 1, 2].map((i) => `<span class="rare-item ${this.engine.s.special[i] ? "found" : ""}" title="${this.t(this.engine.s.special[i] ? "found" : "notFound")}">${this.icon(i + 10)}<span>${this.t("specialNames")[i]}<small>${this.t(this.engine.s.special[i] ? "found" : "notFound")}</small></span></span>`).join("")}</div></div>`;
  }
  map() {
    const e = this.engine;
    this.open(
      "map",
      this.panel(
        "map",
        `<div class="map-content"><div class="map-scroll"><canvas id="map-canvas" aria-label="${this.t("exploredMap")}"></canvas></div><div class="map-legend"><b>${this.sector()}</b><p class="small-note">${this.t("mapLegend")}</p><div>🔴 ${this.t("you")}</div><div>◆ ${this.t("shop")}</div><div>◆ ${this.t("bossRoom")}</div><div>◇ ${this.t("rare")}</div><div>● ${this.t("airStation")}</div><p class="small-note">${this.t("currentDepth")}<br><b>${e.depth} m</b></p></div></div>`,
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
          this.engine.s && !this.menuContext ? "resume" : "back",
          this.engine.s && !this.menuContext ? "close" : "title",
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
        `<div class="settings-row"><span>${this.t("music")}</span><input aria-label="${this.t("music")}" data-setting="music" type="range" min="0" max="1" step=".05" value="${this.settings.music}"></div><div class="settings-row"><span>${this.t("effects")}</span><input aria-label="${this.t("effects")}" data-setting="effects" type="range" min="0" max="1" step=".05" value="${this.settings.effects}"></div><div class="settings-row"><span>${this.t("motion")}</span><input aria-label="${this.t("motion")}" data-setting="shake" type="checkbox" ${this.settings.shake ? "checked" : ""}></div><div class="settings-row"><span>${this.t("language")}</span><select aria-label="${this.t("language")}"><option>${this.t("chinese")}</option></select></div><p class="small-note">${this.t("autoSaveNote")}</p><div class="buttons">${this.button("export", "export")}${this.button("import", "import")}${this.button("backup", "backup", "", "quiet")}</div>`,
        this.button(
          "back",
          this.engine.s && !this.menuContext ? "pause" : "title",
          "",
          "primary",
        ),
      ),
    );
  }
  ending() {
    if (!this.engine.s.endingWatched) {
      this.cinematics.start(
        this.engine.s.ending === "happy" ? "ending_happy" : "ending_not",
      );
      return;
    }
    const e = this.engine,
      s = e.s,
      happy = s.ending === "happy";
    const entry =
      this.assets.manifest.cutscenes?.[happy ? "ending_happy" : "ending_not"];
    const frame = Array.isArray(entry) ? entry[0] : entry?.frames?.[0],
      src = typeof frame === "string" ? frame : frame?.src;
    this.open(
      "ending",
      `<section class="panel story-panel">${src ? `<img class="story-image" src="${esc(src)}" alt="${this.t("ending")}">` : ""}<div class="story-content"><div class="eyebrow">${this.t(happy ? "happyEnding" : "adventureComplete")}</div><h2 id="modal-title">${this.t(happy ? "perfect" : "normalEnding")}</h2><p>${this.t(happy ? "perfectBody" : "normalBody")}</p><div class="ending-stats"><div>${this.t("minedCount")}<b>${s.stats.mined}</b></div><div>${this.t("killCount")}<b>${s.stats.kills}</b></div><div>${this.t("specialMinerals")}<b>${s.special.filter(Boolean).length} / 3</b></div></div><div class="buttons">${this.button("movieReplay", "replay-ending")}${this.button("explore", "explore", "", "primary")}${this.button("export", "export")}${this.button("playAgain", "new", "", "quiet")}</div></div></section>`,
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
        : this.t("explorationProgress", {
            used: e.usedSlots,
            max: e.capacity,
            count: s.special.filter(Boolean).length,
          }),
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
    if (name === "replay-ending") {
      this.engine.s.endingWatched = false;
      this.ending();
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
      case "shop-select":
        this.shop(this.shopTab, +d.code);
        break;
      case "shop-tab":
        this.shop(d.tab, 0);
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
        this.inventory();
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
          e.advance(+d.stage, { playStory: false });
          this.close();
        }
        break;
      case "explore":
        e.s.complete = false;
        this.close();
        e.advance(3, { playStory: false });
        break;
    }
    this.update();
  }
}
