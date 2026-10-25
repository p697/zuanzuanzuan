import { Engine, STEP } from "./core.js";
import { Assets, Renderer } from "./renderer.js";
import { UI } from "./ui.js";
import { AudioManager } from "./audio.js";

const canvas = document.querySelector("#game");
async function boot() {
  const [data, manifest] = await Promise.all(
    ["/data/original.json", "/assets/manifest.json"].map(async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(url);
      return r.json();
    }),
  );
  const assets = new Assets(manifest);
  await assets.load((r) => {
    document.querySelector("#load-progress").style.width =
      `${Math.round(r * 100)}%`;
  });
  const engine = new Engine(data),
    renderer = new Renderer(canvas, assets),
    audio = new AudioManager(manifest),
    ui = new UI(engine, assets, renderer, audio);
  const input = {};
  let last = performance.now(),
    accumulator = 0,
    hudTime = 0;
  document.querySelector("#loading").hidden = true;
  ui.title();
  const clear = () => {
    for (const k of Object.keys(input)) delete input[k];
  };
  const arrows = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };
  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input,select,textarea")) return;
    const key = event.key;
    if (arrows[key] && ui.mode === "play") {
      event.preventDefault();
      input[arrows[key]] = true;
      audio.unlock();
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      clear();
      if (ui.mode === "play") ui.pause();
      else if (
        [
          "pause",
          "inventory",
          "map",
          "help",
          "settings",
          "shop",
          "travel",
        ].includes(ui.mode)
      )
        ui.close();
      return;
    }
    if (ui.mode !== "play") {
      if ((key === "Enter" || key === " ") && event.target === document.body) {
        event.preventDefault();
        ui.modal.querySelector(".primary")?.click();
      }
      return;
    }
    if (event.repeat) return;
    const code = key.toLowerCase(),
      slot = "asdfg".indexOf(code);
    if (slot >= 0) {
      event.preventDefault();
      ui.action("use", { code: engine.s.quick[slot] });
    } else if (code === "b" || code === "i") {
      event.preventDefault();
      clear();
      ui.inventory();
    } else if (code === "m") {
      event.preventDefault();
      clear();
      ui.map();
    } else if (code === "e" || key === " ") {
      event.preventDefault();
      ui.action("interact");
    }
  });
  document.addEventListener("keyup", (event) => {
    if (arrows[event.key]) {
      event.preventDefault();
      delete input[arrows[event.key]];
    }
  });
  window.addEventListener("blur", () => {
    clear();
    if (ui.mode === "play") ui.pause();
    audio.suspend();
  });
  window.addEventListener("focus", () => audio.resume());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clear();
      if (ui.mode === "play") ui.pause();
      audio.suspend();
    } else {
      last = performance.now();
      accumulator = 0;
      audio.resume();
    }
  });
  window.addEventListener("pagehide", () => ui.save(false));
  document.querySelectorAll("[data-key]").forEach((button) => {
    const key = button.dataset.key;
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      if (ui.mode === "play") {
        input[key] = true;
        audio.unlock();
      }
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(type, () => delete input[key]);
  });
  canvas.addEventListener("click", (ev) => {
    audio.unlock();
    if (ui.mode !== "play") return;
    canvas.focus();
    const rect = canvas.getBoundingClientRect(),
      x = ((ev.clientX - rect.left) / rect.width) * 640 + renderer.camera.x,
      y = ((ev.clientY - rect.top) / rect.height) * 480 + renderer.camera.y;
    for (const obj of engine.source.entities) {
      if (
        ["Shop", "BossRoom", "AirStation"].includes(obj.type) ||
        obj.code === 20
      ) {
        if (
          Math.abs(x - (obj.x * 42 + 21)) < 110 &&
          y < (obj.y + 1) * 42 &&
          y > (obj.y + 1) * 42 - 240
        ) {
          engine.interact();
          break;
        }
      }
    }
  });
  function events() {
    for (const e of engine.drain()) {
      renderer.event(e);
      switch (e.type) {
        case "map":
          renderer.reset(engine);
          ui.music();
          break;
        case "sound":
          audio.sound(e.name);
          break;
        case "story":
          clear();
          ui.story(e.id);
          break;
        case "shop":
          clear();
          ui.shop();
          break;
        case "hint":
          ui.toast(ui.t(e.key));
          break;
        case "collected":
          audio.sound("mineral");
          renderer.text(`+ ${ui.name(e.code)}`, e.x, e.y);
          if (e.code === 82) ui.toast(ui.t("keyFound"));
          break;
        case "money":
          renderer.text(`+${e.amount}`, e.x, e.y);
          break;
        case "special":
          ui.toast(
            ui.t("specialFound") + " · " + ui.t("specialNames")[e.index],
          );
          break;
        case "advance":
          clear();
          engine.advance(e.stage);
          break;
        case "tutorialComplete":
          clear();
          audio.sound("successquest");
          ui.tutorialComplete();
          break;
        case "tutorialRetry":
          clear();
          ui.tutorialRetry();
          break;
        case "dead":
          clear();
          ui.dead();
          break;
        case "ending":
          clear();
          audio.select("introbgm");
          ui.ending();
          break;
        case "checkpoint":
        case "autosave":
          ui.save(false);
          break;
      }
    }
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    events();
    if (ui.mode === "play" && engine.running) {
      accumulator += dt * 1000;
      let steps = 0;
      while (accumulator >= STEP && steps++ < 5) {
        engine.tick(input);
        accumulator -= STEP;
        events();
        if (ui.mode !== "play") {
          clear();
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
      clear();
    }
    if (ui.mode === "title" || !engine.s || ui.mode === "new")
      renderer.title(now / 1000);
    else renderer.draw(engine, now / 1000, dt);
    hudTime += dt;
    if (hudTime > 0.06) {
      ui.update();
      hudTime = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
boot().catch((error) => {
  console.error(error);
  document.querySelector("#load-label").textContent =
    `加载失败：${error.message}。请刷新重试。`;
  document.querySelector("#loading").setAttribute("data-failed", "true");
});
