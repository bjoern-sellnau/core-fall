/**
 * Procedurally synthesized, Descent-style driving loop (Web Audio API).
 * No external assets: bass + arpeggio lead + drums on a 16-step sequencer.
 * Must be started from a user gesture (browser autoplay policy).
 */

const BPM = 138;

// MIDI note patterns over 16 sixteenth-steps (null = rest). Key: A minor.
const BASS: (number | null)[] = [
  33, null, 33, 33, null, 33, 36, null,
  33, null, 33, 33, 40, null, 38, null,
];
const LEAD: (number | null)[] = [
  69, 72, 76, 72, 74, 77, 81, 77,
  69, 72, 76, 72, 67, 71, 74, 71,
];
const KICK = [0, 4, 8, 12];
const SNARE = [4, 12];

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private delay!: DelayNode;
  private noise!: AudioBuffer;

  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private muted = false;

  private readonly lookahead = 0.1; // seconds scheduled ahead
  private readonly tick = 25; // scheduler poll (ms)

  /** Lazily builds the audio graph and starts the loop. Call from a gesture. */
  start() {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
    if (this.timer === null) {
      this.nextNoteTime = this.ctx!.currentTime + 0.06;
      this.step = 0;
      this.timer = window.setInterval(this.scheduler, this.tick);
    }
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) {
      const g = this.master.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.linearRampToValueAtTime(
        this.muted ? 0.0001 : 0.26,
        this.ctx.currentTime + 0.25,
      );
    }
    return this.muted;
  }

  private build() {
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.26;
    this.master.connect(this.ctx.destination);

    // Stereo-ish slap delay for the lead.
    this.delay = this.ctx.createDelay(0.5);
    this.delay.delayTime.value = (60 / BPM) * 0.75;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.32;
    const delayMix = this.ctx.createGain();
    delayMix.gain.value = 0.35;
    this.delay.connect(feedback);
    feedback.connect(this.delay);
    this.delay.connect(delayMix);
    delayMix.connect(this.master);

    // One-shot white-noise buffer reused for drums.
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private scheduler = () => {
    const ctx = this.ctx!;
    const sixteenth = 60 / BPM / 4;
    while (this.nextNoteTime < ctx.currentTime + this.lookahead) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += sixteenth;
      this.step = (this.step + 1) % 16;
    }
  };

  private scheduleStep(step: number, t: number) {
    const bass = BASS[step];
    if (bass !== null) this.playBass(t, midiToFreq(bass));

    const lead = LEAD[step];
    if (lead !== null) this.playLead(t, midiToFreq(lead));

    if (KICK.includes(step)) this.playKick(t);
    if (SNARE.includes(step)) this.playSnare(t);
    this.playHat(t, step % 2 === 1); // accent offbeats
  }

  private playBass(t: number, freq: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(freq * 8, t);
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

  private playLead(t: number, freq: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 600;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.004);
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

  private playSnare(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.18);
  }

  private playHat(t: number, accent: boolean) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;

    const g = ctx.createGain();
    const peak = accent ? 0.16 : 0.07;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (accent ? 0.06 : 0.03));

    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.08);
  }
}
