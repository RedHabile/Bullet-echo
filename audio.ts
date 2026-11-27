// ── THE HOLLOW · procedural horror audio (WebAudio, zero assets) ────────────

export class HorrorAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private hbTimer = 0;
  private duck = 1;
  muted = false;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 8;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);
    // noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.startDrone();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx)
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.9, this.ctx.currentTime + 0.1);
  }

  setDuck(v: number) { this.duck = v; this.applyDrone(); }
  private applyDrone() {
    if (this.droneGain && this.ctx)
      this.droneGain.gain.linearRampToValueAtTime(0.16 * this.duck, this.ctx.currentTime + 0.4);
  }

  private startDrone() {
    const ctx = this.ctx; if (!ctx || !this.master || !this.noiseBuf) return;
    const g = ctx.createGain(); g.gain.value = 0.16; g.connect(this.master);
    this.droneGain = g;
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = 48;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = 51.3;
    const og = ctx.createGain(); og.gain.value = 0.5;
    o1.connect(og); o2.connect(og); og.connect(g);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 220; f.Q.value = 2;
    const ng = ctx.createGain(); ng.gain.value = 0.35;
    n.connect(f); f.connect(ng); ng.connect(g);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 90;
    lfo.connect(lg); lg.connect(f.frequency);
    o1.start(); o2.start(); n.start(); lfo.start();
  }

  private env(gainNode: GainNode, t: number, a: number, peak: number, d: number) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private osc(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, dest?: AudioNode) {
    const ctx = this.ctx; if (!ctx || !this.master) return;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.008, peak, dur);
    o.connect(g); g.connect(dest ?? this.master);
    o.start(t); o.stop(t + dur + 0.1);
  }

  private noise(t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number, q = 1) {
    const ctx = this.ctx; if (!ctx || !this.master || !this.noiseBuf) return;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    n.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.01, peak, dur);
    n.connect(f); f.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + dur + 0.1);
  }

  private now() { return this.ctx ? this.ctx.currentTime : 0; }
  private ok() { return !!this.ctx && !this.muted; }

  // heartbeat: lub-dub, rate & volume scale with danger
  tick(dt: number, danger: number) {
    if (!this.ok() || danger < 0.04) { this.hbTimer = Math.min(this.hbTimer, 0.25); return; }
    this.hbTimer -= dt;
    if (this.hbTimer <= 0) {
      const t = this.now();
      const v = 0.14 + danger * 0.4;
      this.osc("sine", 70, 38, t, 0.14, v);
      this.osc("sine", 62, 34, t + 0.16, 0.12, v * 0.7);
      this.hbTimer = 1.15 - danger * 0.78;
    }
  }

  step(sprint: boolean, killer: boolean) {
    if (!this.ok()) return;
    const t = this.now();
    this.noise(t, 0.07, killer ? 0.14 : sprint ? 0.11 : 0.06, "bandpass", killer ? 160 : 340, 120, 1.5);
    if (killer) this.osc("sine", 55, 30, t, 0.09, 0.1);
  }

  pickup(chain: number) {
    if (!this.ok()) return;
    const t = this.now();
    const base = 523 * Math.pow(1.059, Math.min(chain, 6));
    this.osc("sine", base, base, t, 0.5, 0.22);
    this.osc("sine", base * 1.189, base * 1.189, t, 0.45, 0.12); // minor third — unsettling but pretty
    this.osc("sine", base * 3, base * 3, t + 0.03, 0.3, 0.07);
    this.noise(t, 0.12, 0.06, "highpass", 4000, 8000);
  }

  sting() {
    if (!this.ok()) return;
    const t = this.now();
    for (let i = 0; i < 3; i++)
      this.osc("sawtooth", 210 + i * 47, 920 + i * 60, t, 0.55, 0.09);
    this.noise(t, 0.7, 0.12, "highpass", 1800, 5200, 2);
    this.osc("sine", 130, 40, t, 0.6, 0.25);
  }

  kill() {
    if (!this.ok()) return;
    const t = this.now();
    this.noise(t, 1.0, 0.5, "bandpass", 2400, 300, 3);
    this.osc("sawtooth", 780, 62, t, 1.0, 0.3);
    this.osc("sawtooth", 830, 55, t + 0.02, 1.0, 0.25);
    this.osc("sine", 120, 26, t, 1.2, 0.5);
    this.noise(t + 0.05, 0.5, 0.3, "highpass", 3000, 900, 2);
  }

  swing() {
    if (!this.ok()) return;
    this.noise(this.now(), 0.16, 0.14, "bandpass", 900, 2600, 2);
  }

  gate() {
    if (!this.ok()) return;
    const t = this.now();
    this.noise(t, 1.6, 0.35, "lowpass", 300, 70);
    this.osc("sine", 82, 123, t + 0.2, 1.4, 0.25);
    this.osc("sine", 164, 246, t + 0.5, 1.2, 0.12);
  }

  escape() {
    if (!this.ok()) return;
    const t = this.now();
    const chord = [220, 261.6, 329.6, 440];
    chord.forEach((f, i) => this.osc("sine", f, f, t + i * 0.09, 2.2, 0.14));
    this.noise(t, 2.0, 0.05, "highpass", 5000, 9000);
  }

  hide() {
    if (!this.ok()) return;
    const t = this.now();
    this.osc("sine", 95, 50, t, 0.13, 0.22);
    this.noise(t, 0.09, 0.12, "lowpass", 600, 200);
  }

  rip() {
    if (!this.ok()) return;
    const t = this.now();
    this.osc("sawtooth", 380, 1250, t, 0.32, 0.2);
    this.noise(t, 0.35, 0.25, "bandpass", 1200, 3200, 4);
  }

  sense() {
    if (!this.ok()) return;
    const t = this.now();
    this.noise(t, 0.45, 0.12, "bandpass", 300, 2100, 3);
    this.osc("sine", 1180, 1180, t + 0.15, 0.5, 0.08);
  }

  click() {
    if (!this.ok()) return;
    this.osc("square", 760, 520, this.now(), 0.06, 0.05);
  }

  timeLow() {
    if (!this.ok()) return;
    const t = this.now();
    this.osc("sine", 440, 440, t, 0.12, 0.12);
    this.osc("sine", 440, 440, t + 0.2, 0.12, 0.12);
  }

  taser() {
    if (!this.ok()) return;
    const t = this.now();
    for (let i = 0; i < 5; i++)
      this.osc("sawtooth", 1900 + i * 260, 320, t + i * 0.035, 0.06, 0.12);
    this.noise(t, 0.3, 0.2, "highpass", 2600, 6200, 3);
    this.osc("sine", 150, 45, t, 0.25, 0.2);
  }

  flare() {
    if (!this.ok()) return;
    const t = this.now();
    this.noise(t, 0.12, 0.25, "bandpass", 900, 2400, 2);
    this.noise(t + 0.08, 1.6, 0.12, "highpass", 3400, 7200, 1.5);
    this.osc("sine", 220, 90, t, 0.15, 0.14);
  }

  weapon() {
    if (!this.ok()) return;
    const t = this.now();
    this.osc("square", 620, 480, t, 0.05, 0.08);
    this.osc("square", 840, 660, t + 0.08, 0.05, 0.08);
    this.noise(t, 0.06, 0.08, "bandpass", 1500, 900, 2);
  }
}
