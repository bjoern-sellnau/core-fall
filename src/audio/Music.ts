/**
 * Procedurally synthesized COREFALL music (Web Audio API), no assets.
 * Two scenes: a calm atmospheric MENU track and a driving GAME track
 * with setIntensity() escalation. Start from a user gesture.
 */

type Pat = (number | null)[];
interface Bar {
  bass: Pat;
  lead: Pat;
}
interface SceneCfg {
  bpm: number;
  bars: Bar[];
  arr: number[];
  gain: number;
  drums: boolean;
  pad: boolean; // use slow pad voice instead of plucky lead
}

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// --- GAME: driving A-minor track ---
const G_A: Bar = {
  bass: [33, null, 33, 33, null, 33, 36, null, 33, null, 33, 33, 40, null, 38, null],
  lead: [null, null, 76, null, null, 72, null, null, null, null, 79, null, 76, null, 72, null],
};
const G_B: Bar = {
  bass: [33, null, 36, null, 38, null, 40, null, 43, null, 40, null, 38, null, 36, null],
  lead: [69, 72, 76, 72, 74, 77, 81, 77, 69, 72, 76, 72, 67, 71, 74, 71],
};
const G_C: Bar = {
  bass: [33, 33, null, 33, 36, 36, null, 36, 40, 40, null, 40, 38, null, 43, null],
  lead: [76, 79, 83, 79, 81, 84, 88, 84, 76, 79, 83, 79, 74, 78, 81, 85],
};
const G_D: Bar = {
  bass: [33, 33, 36, 36, 40, 40, 38, 38, 33, 33, 36, 36, 43, 43, 40, 38],
  lead: [81, 84, 88, 84, 81, 84, 88, 91, 79, 83, 86, 83, 76, 79, 83, 88],
};

// --- MENU: slow, sparse, atmospheric ---
const M_A: Bar = {
  bass: [28, null, null, null, null, null, null, null, 33, null, null, null, null, null, null, null],
  lead: [69, null, null, null, null, null, 72, null, null, null, null, null, 76, null, null, null],
};
const M_B: Bar = {
  bass: [31, null, null, null, null, null, null, null, 26, null, null, null, null, null, null, null],
  lead: [72, null, null, null, null, null, 67, null, null, null, null, null, 71, null, null, null],
};

// --- DEATH: very slow, dark, mournful ---
const D_A: Bar = {
  bass: [21, null, null, null, null, null, null, null, 24, null, null, null, null, null, null, null],
  lead: [60, null, null, null, null, null, null, null, 63, null, null, null, null, null, null, null],
};
const D_B: Bar = {
  bass: [19, null, null, null, null, null, null, null, 16, null, null, null, null, null, null, null],
  lead: [59, null, null, null, null, null, 56, null, null, null, null, null, 53, null, null, null],
};

const GAME: SceneCfg = {
  bpm: 138,
  bars: [G_A, G_B, G_C, G_D],
  arr: [0, 0, 1, 0, 0, 1, 2, 2, 0, 0, 1, 0, 2, 3, 3, 1],
  gain: 0.24,
  drums: true,
  pad: false,
};
const MENU: SceneCfg = {
  bpm: 84,
  bars: [M_A, M_B],
  arr: [0, 1, 0, 1],
  gain: 0.2,
  drums: false,
  pad: true,
};
const DEATH: SceneCfg = {
  bpm: 52,
  bars: [D_A, D_B],
  arr: [0, 1],
  gain: 0.22,
  drums: false,
  pad: true,
};

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private delay!: DelayNode;
  private noise!: AudioBuffer;

  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private barPos = 0;
  private muted = false;

  private intensity = 0;
  private intensityTarget = 0;
  private cfg: SceneCfg = MENU;

  private readonly lookahead = 0.1;
  private readonly tick = 25;

  start() {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
    if (this.timer === null) {
      this.nextNoteTime = this.ctx!.currentTime + 0.06;
      this.step = 0;
      this.barPos = 0;
      this.timer = window.setInterval(this.scheduler, this.tick);
    }
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Switch between the menu, game and death tracks. */
  setScene(scene: "menu" | "game" | "death") {
    const next =
      scene === "game" ? GAME : scene === "death" ? DEATH : MENU;
    if (next === this.cfg) return;
    this.cfg = next;
    this.step = 0;
    this.barPos = 0;
    if (scene !== "game") this.intensityTarget = 0;
  }

  setIntensity(x: number) {
    this.intensityTarget = Math.max(0, Math.min(1, x));
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) {
      const g = this.master.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.linearRampToValueAtTime(
        this.muted ? 0.0001 : this.targetGain(),
        this.ctx.currentTime + 0.25,
      );
    }
    return this.muted;
  }

  private targetGain() {
    return this.cfg.gain + this.intensity * 0.1;
  }

  private build() {
    const Ctx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.cfg.gain;
    this.master.connect(this.ctx.destination);

    this.delay = this.ctx.createDelay(0.6);
    this.delay.delayTime.value = 0.32;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.34;
    const delayMix = this.ctx.createGain();
    delayMix.gain.value = 0.35;
    this.delay.connect(feedback);
    feedback.connect(this.delay);
    this.delay.connect(delayMix);
    delayMix.connect(this.master);

    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private scheduler = () => {
    const ctx = this.ctx!;
    while (this.nextNoteTime < ctx.currentTime + this.lookahead) {
      this.intensity += (this.intensityTarget - this.intensity) * 0.06;
      if (!this.muted) {
        const g = this.master.gain;
        g.cancelScheduledValues(this.nextNoteTime);
        g.linearRampToValueAtTime(this.targetGain(), this.nextNoteTime + 0.05);
      }
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += 60 / this.cfg.bpm / 4;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.barPos = (this.barPos + 1) % this.cfg.arr.length;
      }
    }
  };

  private scheduleStep(step: number, t: number) {
    const bar = this.cfg.bars[this.cfg.arr[this.barPos]];
    const it = this.intensity;

    const bn = bar.bass[step];
    if (bn !== null) {
      if (this.cfg.pad) this.playSub(t, midiToFreq(bn));
      else this.playBass(t, midiToFreq(bn), it);
    }

    const ln = bar.lead[step];
    if (ln !== null) {
      if (this.cfg.pad) {
        this.playPad(t, midiToFreq(ln));
      } else {
        this.playLead(t, midiToFreq(ln), 0.14);
        if (it > 0.45) this.playLead(t, midiToFreq(ln + 12), 0.07 * it);
      }
    }

    if (this.cfg.drums) {
      if (step % 4 === 0) this.playKick(t);
      if (it > 0.6 && step === 14) this.playKick(t);
      if (step === 4 || step === 12) this.playSnare(t, 0.4);
      if (it > 0.55 && (step === 7 || step === 15)) this.playSnare(t, 0.18);
      const offbeat = step % 2 === 1;
      if (offbeat || it > 0.5) this.playHat(t, offbeat, it);
    }
  }

  private playSub(t: number, freq: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.7);
  }

  private playPad(t: number, freq: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const det = ctx.createOscillator();
    det.type = "sine";
    det.frequency.value = freq * 1.005;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.9);

    osc.connect(lp);
    det.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    g.connect(this.delay);
    osc.start(t);
    det.start(t);
    osc.stop(t + 2);
    det.stop(t + 2);
  }

  private playBass(t: number, freq: number, it: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(freq * (8 + it * 6), t);
    lp.frequency.exponentialRampToValueAtTime(freq * 2.5, t + 0.18);
    lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private playLead(t: number, freq: number, peak: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    g.connect(this.delay);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  private playKick(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private playSnare(t: number, peak: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.18);
  }

  private playHat(t: number, accent: boolean, it: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    const peak = (accent ? 0.16 : 0.07) * (0.7 + it * 0.6);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (accent ? 0.06 : 0.03));
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.08);
  }
}
