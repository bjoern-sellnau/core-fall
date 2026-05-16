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
