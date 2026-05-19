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

// --- Extra motif palettes so every mission has a distinct song ---
// DOOM: slow, heavy, Phrygian dread.
const DM_A: Bar = {
  bass: [29, null, null, 29, null, null, 30, null, 29, null, null, null, 34, null, 29, null],
  lead: [65, null, null, null, 64, null, null, null, 65, null, 68, null, null, null, 63, null],
};
const DM_B: Bar = {
  bass: [29, 29, null, 36, null, 34, null, 30, 29, 29, null, 36, 41, null, 34, null],
  lead: [72, null, 71, null, 68, null, 65, null, 70, null, 68, null, 64, null, 63, null],
};
// HERO: bright, anthemic major.
const HR_A: Bar = {
  bass: [40, null, 40, 47, null, 45, 43, null, 38, null, 38, 45, null, 43, 40, null],
  lead: [76, 79, 83, 79, 81, 84, 88, 84, 74, 78, 81, 78, 76, 79, 83, 86],
};
const HR_B: Bar = {
  bass: [45, 45, 43, 43, 40, 40, 38, 38, 47, 47, 45, 45, 43, 43, 40, 47],
  lead: [83, 86, 90, 86, 88, 91, 95, 91, 81, 84, 88, 84, 79, 83, 86, 90],
};
// RUSH: fast, relentless 16th arpeggios.
const RU_A: Bar = {
  bass: [45, 45, 45, 45, 43, 43, 43, 43, 48, 48, 48, 48, 46, 46, 44, 43],
  lead: [81, 84, 88, 93, 88, 84, 81, 84, 79, 83, 86, 91, 86, 83, 79, 83],
};
const RU_B: Bar = {
  bass: [50, 50, 48, 48, 46, 46, 45, 45, 43, 43, 45, 45, 48, 48, 50, 53],
  lead: [88, 91, 95, 100, 95, 91, 88, 91, 86, 90, 93, 98, 93, 90, 86, 90],
};
// NEON: syncopated electro city groove.
const NE_A: Bar = {
  bass: [38, null, 38, 38, null, 45, null, 38, 41, null, 41, null, 43, null, 45, null],
  lead: [78, null, 81, null, 78, null, 73, 76, 78, null, 83, null, 81, null, 76, null],
};
const NE_B: Bar = {
  bass: [43, null, 43, 50, null, 43, 48, null, 41, null, 41, 48, null, 41, 46, null],
  lead: [85, null, 83, 81, null, 78, 81, null, 88, null, 85, 83, null, 81, 78, null],
};
// STORM: aggressive chromatic tension.
const ST_A: Bar = {
  bass: [35, 35, 36, 35, 41, null, 40, 35, 35, 35, 36, 35, 42, 41, 40, 35],
  lead: [80, null, 79, 80, 83, null, 80, 79, 75, null, 76, 75, 80, null, 79, 83],
};
const ST_B: Bar = {
  bass: [35, 38, 35, 41, 36, 42, 40, 35, 35, 38, 35, 41, 43, 42, 40, 38],
  lead: [83, 84, 83, 87, 80, 79, 80, 83, 88, 87, 83, 80, 79, 80, 83, 88],
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

// --- MENU V2: poppy, upbeat (default) ---
const P_A: Bar = {
  bass: [36, null, 36, null, 43, null, 36, null, 41, null, 41, null, 43, null, 43, null],
  lead: [72, 76, 79, 76, 81, 79, 76, 72, 74, 76, 79, 81, 79, 76, 74, 72],
};
const P_B: Bar = {
  bass: [41, null, 41, null, 36, null, 36, null, 43, null, 43, null, 45, null, 43, null],
  lead: [81, 79, 76, 79, 72, 74, 76, 79, 84, 81, 79, 76, 79, 76, 74, 72],
};

// --- VICTORY: bright triumphant fanfare ---
const V_A: Bar = {
  bass: [36, 36, 43, 43, 41, 41, 43, 43, 36, 36, 43, 43, 48, null, 43, null],
  lead: [84, 88, 91, 96, 91, 88, 84, 88, 86, 89, 93, 96, 93, 89, 86, 84],
};
const V_B: Bar = {
  bass: [41, 41, 45, 45, 43, 43, 48, 48, 36, 36, 43, 43, 48, 48, 43, 43],
  lead: [89, 93, 96, 100, 96, 93, 89, 93, 84, 88, 91, 96, 91, 96, 100, 96],
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

// --- Per-level GAME tracks: distinct motif + key + tempo + groove per
// mission. Missions 1-10 are the dark mine; 11-20 the Earth act. ---
const transposeBar = (b: Bar, n: number): Bar => ({
  bass: b.bass.map((x) => (x === null ? null : x + n)),
  lead: b.lead.map((x) => (x === null ? null : x + n)),
});
const GAME_ARRS: number[][] = [
  [0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1],
  [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1],
  [0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1],
];
const MINE_4 = [G_A, G_B, G_C, G_D];
interface TrackSpec {
  m: Bar[]; // motif bars
  bpm: number;
  tr: number; // transpose (semitones)
  a: number; // GAME_ARRS index
}
// 20 missions, each a different feel. Adjacent levels never share a motif.
const TRACK_SPECS: TrackSpec[] = [
  { m: MINE_4, bpm: 138, tr: 0, a: 0 }, // 1 The Mine
  { m: [ST_A, ST_B], bpm: 132, tr: -2, a: 1 }, // 2
  { m: [DM_A, DM_B], bpm: 96, tr: 0, a: 2 }, // 3
  { m: MINE_4, bpm: 146, tr: 5, a: 1 }, // 4
  { m: [ST_A, ST_B], bpm: 150, tr: 3, a: 0 }, // 5
  { m: [DM_A, DM_B], bpm: 104, tr: -4, a: 1 }, // 6
  { m: MINE_4, bpm: 142, tr: 7, a: 2 }, // 7
  { m: [ST_A, ST_B], bpm: 156, tr: -5, a: 1 }, // 8
  { m: [DM_A, DM_B], bpm: 100, tr: 2, a: 0 }, // 9
  { m: MINE_4, bpm: 152, tr: -7, a: 2 }, // 10
  { m: [HR_A, HR_B], bpm: 128, tr: 0, a: 0 }, // 11 Earth act
  { m: [NE_A, NE_B], bpm: 122, tr: 0, a: 1 }, // 12
  { m: [RU_A, RU_B], bpm: 160, tr: 0, a: 2 }, // 13
  { m: [HR_A, HR_B], bpm: 134, tr: 5, a: 1 }, // 14
  { m: [NE_A, NE_B], bpm: 126, tr: -3, a: 0 }, // 15
  { m: [RU_A, RU_B], bpm: 168, tr: 3, a: 1 }, // 16
  { m: [HR_A, HR_B], bpm: 140, tr: -2, a: 2 }, // 17
  { m: [NE_A, NE_B], bpm: 130, tr: 7, a: 1 }, // 18
  { m: [RU_A, RU_B], bpm: 172, tr: -5, a: 0 }, // 19
  { m: [HR_A, HR_B], bpm: 148, tr: 4, a: 2 }, // 20 Earth Core
];
const GAME_TRACKS: SceneCfg[] = TRACK_SPECS.map((s) => ({
  bpm: s.bpm,
  bars: s.m.map((b) => transposeBar(b, s.tr)),
  arr: GAME_ARRS[s.a],
  gain: 0.24,
  drums: true,
  pad: false,
}));
const MENU_V1: SceneCfg = {
  bpm: 84,
  bars: [M_A, M_B],
  arr: [0, 1, 0, 1],
  gain: 0.2,
  drums: false,
  pad: true,
};
const MENU_V2: SceneCfg = {
  bpm: 120,
  bars: [P_A, P_B],
  arr: [0, 0, 1, 0],
  gain: 0.22,
  drums: true,
  pad: false,
};
const VICTORY: SceneCfg = {
  bpm: 132,
  bars: [V_A, V_B],
  arr: [0, 1, 0, 1],
  gain: 0.27,
  drums: true,
  pad: false,
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
  private cfg: SceneCfg = MENU_V2;
  private menuVariant: 1 | 2 = 2;
  private gameVariant = 0;

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

  private menuCfg() {
    return this.menuVariant === 2 ? MENU_V2 : MENU_V1;
  }

  /** Select which per-level game song plays (0-based mission index). */
  setLevel(i: number) {
    const v = ((i % GAME_TRACKS.length) + GAME_TRACKS.length) %
      GAME_TRACKS.length;
    if (v === this.gameVariant) return;
    this.gameVariant = v;
    if (GAME_TRACKS.includes(this.cfg)) {
      this.cfg = GAME_TRACKS[this.gameVariant];
      this.step = 0;
      this.barPos = 0;
    }
  }

  /** Switch between the menu, game, death and victory tracks. */
  setScene(scene: "menu" | "game" | "death" | "victory") {
    const next =
      scene === "game"
        ? GAME_TRACKS[this.gameVariant]
        : scene === "death"
          ? DEATH
          : scene === "victory"
            ? VICTORY
            : this.menuCfg();
    if (next === this.cfg) return;
    this.cfg = next;
    this.step = 0;
    this.barPos = 0;
    if (scene !== "game") this.intensityTarget = 0;
  }

  get menuTheme(): 1 | 2 {
    return this.menuVariant;
  }

  /** Pick the menu theme; if a menu track is playing, switch live. */
  setMenuTheme(v: 1 | 2) {
    if (this.menuVariant === v) return;
    this.menuVariant = v;
    if (this.cfg === MENU_V1 || this.cfg === MENU_V2) {
      this.cfg = this.menuCfg();
      this.step = 0;
      this.barPos = 0;
    }
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
