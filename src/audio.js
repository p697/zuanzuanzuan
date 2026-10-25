export class AudioManager {
  constructor(manifest) {
    this.urls = manifest.sounds;
    this.settings = { music: 0.35, effects: 0.6 };
    this.muted = false;
    this.ready = false;
    this.music = null;
    this.name = null;
    this.wanted = "startMenu";
    this.last = new Map();
    this.voices = [];
  }
  unlock() {
    if (this.ready) return;
    this.ready = true;
    this.select(this.wanted);
  }
  select(name) {
    if (name === null) return;
    this.wanted = name;
    if (!this.ready || name === this.name) return;
    if (this.music) {
      this.music.pause();
      this.music.src = "";
    }
    this.name = name;
    const src = this.urls[name];
    if (!src) return;
    this.music = new Audio(src);
    this.music.loop = true;
    this.apply();
    this.music.play().catch(() => {});
  }
  sound(name) {
    if (!this.ready || this.muted || !this.urls[name]) return;
    const now = performance.now();
    if (now - (this.last.get(name) || 0) < (name === "drill" ? 220 : 70))
      return;
    this.last.set(name, now);
    const a = new Audio(this.urls[name]);
    a.volume = this.settings.effects;
    this.voices.push(a);
    a.onended = () => {
      this.voices = this.voices.filter((v) => v !== a);
    };
    if (this.voices.length > 12) this.voices.shift().pause();
    a.play().catch(() => {});
  }
  apply() {
    if (this.music) this.music.volume = this.muted ? 0 : this.settings.music;
    for (const a of this.voices)
      a.volume = this.muted ? 0 : this.settings.effects;
  }
  suspend() {
    this.music?.pause();
    for (const a of this.voices) a.pause();
  }
  resume() {
    if (this.ready) this.music?.play().catch(() => {});
  }
}
