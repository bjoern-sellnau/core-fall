/**
 * Procedural sound effects (Web Audio API), no external assets.
 * Shares the autoplay-gesture lifecycle with MusicEngine via start().
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;

  /** Build/resume the audio graph. Call from a user gesture. */
  start() {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
  }

  private build() {
    const Ctx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Short zappy descending laser blip. */
  laser() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(1250, t);
    osc.frequency.exponentialRampToValueAtTime(190, t + 0.12);

    const detune = ctx.createOscillator();
    detune.type = "sawtooth";
    detune.frequency.setValueAtTime(1180, t);
    detune.frequency.exponentialRampToValueAtTime(160, t + 0.12);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    osc.connect(lp);
    detune.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    detune.start(t);
    osc.stop(t + 0.18);
    detune.stop(t + 0.18);
  }

  /** Short metallic tick for a bolt striking rock/metal. */
  impact() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 1.6;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

    const ping = ctx.createOscillator();
    ping.type = "triangle";
    ping.frequency.setValueAtTime(1500, t);
    ping.frequency.exponentialRampToValueAtTime(700, t + 0.06);

    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.18, t);
    pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    ping.connect(pg);
    pg.connect(this.master);

    src.start(t);
    src.stop(t + 0.12);
    ping.start(t);
    ping.stop(t + 0.1);
  }

  /** Bright rising two-tone confirm for collecting a pickup. */
  pickup() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    g.connect(this.master);

    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.setValueAtTime(660, t);
    o1.frequency.setValueAtTime(990, t + 0.08);
    o1.connect(g);
    o1.start(t);
    o1.stop(t + 0.24);
  }

  /** Rocket launch whoosh. */
  rocket() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
    bp.Q.value = 0.9;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.32);
  }

  /** Dull enemy plasma shot. */
  enemyShot() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /** Harsh hit taken by the player. */
  hit() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.18);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    osc.connect(g);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.24);
    src.start(t);
    src.stop(t + 0.24);
  }

  /** Servo whir for a door opening / closing. */
  door(open: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(open ? 110 : 200, t);
    osc.frequency.exponentialRampToValueAtTime(open ? 240 : 90, t + 0.35);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1300;
    lp.Q.value = 4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
    g.gain.setValueAtTime(0.22, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);

    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.45);

    if (!open) {
      // Closing thunk.
      const k = ctx.createOscillator();
      k.type = "sine";
      k.frequency.setValueAtTime(120, t + 0.34);
      k.frequency.exponentialRampToValueAtTime(45, t + 0.46);
      const kg = ctx.createGain();
      kg.gain.setValueAtTime(0.0001, t + 0.34);
      kg.gain.exponentialRampToValueAtTime(0.5, t + 0.36);
      kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      k.connect(kg);
      kg.connect(this.master);
      k.start(t + 0.34);
      k.stop(t + 0.52);
    }
  }

  /** Warp-in materialise for (re)spawning, Descent-ish. */
  spawn() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.5);

    const sh = ctx.createOscillator();
    sh.type = "square";
    sh.frequency.setValueAtTime(420, t);
    sh.frequency.exponentialRampToValueAtTime(1700, t + 0.55);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(4200, t + 0.5);
    lp.Q.value = 6;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.1);
    g.gain.setValueAtTime(0.32, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);

    osc.connect(lp);
    sh.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    sh.start(t);
    osc.stop(t + 0.65);
    sh.stop(t + 0.65);
  }

  /** Two-tone select blip for switching weapons. */
  weaponSelect() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    g.connect(this.master);

    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(740, t);
    o.frequency.setValueAtTime(1180, t + 0.06);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.16);
  }

  /** Noisy boom with a low thump; scale ~1 default, larger = bigger. */
  explosion(scale = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 0.45 * scale;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(110, t + dur);
    lp.Q.value = 1.2;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(95, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + dur * 0.7);

    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.7, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    thump.connect(tg);
    tg.connect(this.master);

    src.start(t);
    src.stop(t + dur + 0.05);
    thump.start(t);
    thump.stop(t + dur + 0.05);
  }
}
