import { storyQueues } from "./story-flow.js";

// Native video playback: exported original timelines, no Flash runtime or script execution.
export class Cinematics {
  constructor(ui, manifest) {
    this.ui = ui;
    this.manifest = manifest;
  }
  start(id) {
    const ui = this.ui;
    ui.engine.s.cutscene = { id, index: 0, time: 0 };
    ui.save(false);
    this.show();
  }
  show() {
    const ui = this.ui,
      scene = ui.engine.s.cutscene;
    if (!scene) return;
    const queue = storyQueues[scene.id],
      name = queue[scene.index];
    const clip = this.manifest[name][ui.locale] || this.manifest[name]["zh-CN"];
    ui.open(
      "cinematic",
      `<section class="cinema"><h2 id="modal-title" class="cinema-heading">${ui.t("movieTitles")[name]}</h2><video playsinline preload="auto" aria-label="${ui.t("movieTitles")[name]}"></video><div class="cinema-controls"><span class="cinema-progress" aria-live="polite">${scene.index + 1} / ${queue.length}</span><span class="cinema-status" role="status"></span><button class="btn" data-movie="pause">${ui.t("moviePause")}</button><button class="btn" data-movie="next">${ui.t("movieSkip")}</button></div></section>`,
      { className: "cinema-modal" },
    );
    ui.hud.hidden = true;
    ui.audio.cinematic = true;
    ui.audio.suspend();
    const video = (this.video = ui.modal.querySelector("video"));
    const status = ui.modal.querySelector(".cinema-status");
    const button = ui.modal.querySelector('[data-movie="pause"]');
    video.volume = ui.settings.effects;
    video.muted = ui.audio.muted;
    video.src = clip.src;
    const update = () => {
      button.textContent = ui.t(video.paused ? "movieResume" : "moviePause");
    };
    video.onpause = () => {
      update();
      scene.time = video.currentTime;
      ui.save(false);
    };
    video.onplay = () => {
      status.textContent = "";
      update();
    };
    video.ontimeupdate = () => {
      if (ui.engine.s.cutscene === scene) scene.time = video.currentTime;
    };
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(
        scene.time,
        Math.max(0, video.duration - 0.05),
      );
      this.play();
    };
    video.onerror = () => {
      status.textContent = ui.t("movieError");
      button.textContent = ui.t("retry");
    };
    video.onended = () => this.next();
    button.onclick = () => {
      if (video.error) {
        video.load();
        return;
      }
      if (video.paused) this.play();
      else video.pause();
    };
    ui.modal.querySelector('[data-movie="next"]').onclick = () => this.next();
  }
  play() {
    const video = this.video;
    video?.play().catch(() => {
      if (this.video === video) {
        this.ui.modal.querySelector(".cinema-status").textContent =
          this.ui.t("movieTap");
        this.ui.modal.querySelector('[data-movie="pause"]').textContent =
          this.ui.t("movieResume");
      }
    });
  }
  pause() {
    this.video?.pause();
  }
  dispose() {
    if (!this.video) return;
    const video = this.video;
    this.video = null;
    video.onended =
      video.ontimeupdate =
      video.onloadedmetadata =
      video.onerror =
      video.onpause =
      video.onplay =
        null;
    video.pause();
    video.removeAttribute("src");
    video.load();
    this.ui.audio.cinematic = false;
  }
  next() {
    const ui = this.ui,
      scene = ui.engine.s.cutscene;
    if (!scene) return;
    scene.index++;
    scene.time = 0;
    if (scene.index < storyQueues[scene.id].length) {
      ui.save(false);
      this.show();
      return;
    }
    const ending = scene.id.startsWith("ending_");
    this.dispose();
    ui.engine.s.cutscene = null;
    if (ending) ui.engine.s.endingWatched = true;
    ui.save(false);
    if (ending) ui.ending();
    else ui.close();
  }
}
