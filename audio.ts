// Tiny WebAudio synth: all sound effects are generated at runtime (no assets).

export type SfxName =
  | "shoot"
  | "hit"
  | "kill"
  | "bigkill"
  | "echo"
  | "bounce"
  | "hurt"
  | "pickup"
  | "wave"
  | "combo"
  | "graze"
  | "start"
  | "over"
  | "ui"
  | "pause";

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last: Partial<Record<SfxName, number>> = {};
  muted = false;

  init() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.32;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private noise(dur: number, vol: number, cutoff: number, delay = 0) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff * 0.2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
    src.stop(t + dur + 0.05);
  }

  play(name: SfxName) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const gap: Record<SfxName, number> = {
      shoot: 45,
      hit: 35,
      kill: 40,
      bigkill: 80,
      echo: 60,
      bounce: 60,
      hurt: 120,
      pickup: 60,
      wave: 300,
      combo: 150,
      graze: 70,
      start: 0,
      over: 0,
      ui: 0,
      pause: 0,
    };
    const prev = this.last[name] ?? -1e9;
    if (now - prev < gap[name]) return;
    this.last[name] = now;

    switch (name) {
      case "shoot":
        this.tone(980, 0.07, "square", 0.035, 240);
        break;
      case "hit":
        this.tone(520, 0.05, "triangle", 0.12, 260);
        break;
      case "kill":
        this.noise(0.22, 0.22, 2400);
        this.tone(640, 0.16, "sawtooth", 0.07, 120);
        break;
      case "bigkill":
        this.noise(0.45, 0.35, 3200);
        this.tone(330, 0.4, "sawtooth", 0.08, 50);
        this.tone(660, 0.22, "triangle", 0.08, 120, 0.04);
        break;
      case "echo":
        this.tone(1320, 0.18, "sine", 0.1, 1980);
        this.tone(1760, 0.22, "sine", 0.06, 2600, 0.07);
        break;
      case "bounce":
        this.tone(1560, 0.06, "sine", 0.06, 2100);
        break;
      case "hurt":
        this.noise(0.4, 0.35, 900);
        this.tone(220, 0.35, "sawtooth", 0.14, 40);
        break;
      case "pickup":
        this.tone(660, 0.08, "triangle", 0.12);
        this.tone(990, 0.08, "triangle", 0.12, undefined, 0.06);
        this.tone(1320, 0.14, "triangle", 0.12, undefined, 0.12);
        break;
      case "wave":
        this.tone(261, 0.4, "triangle", 0.1);
        this.tone(329, 0.4, "triangle", 0.1, undefined, 0.08);
        this.tone(392, 0.5, "triangle", 0.1, undefined, 0.16);
        break;
      case "combo":
        this.tone(880, 0.1, "square", 0.05);
        this.tone(1174, 0.14, "square", 0.05, undefined, 0.05);
        break;
      case "graze":
        this.tone(2200, 0.05, "sine", 0.04, 1600);
        break;
      case "start":
        this.tone(440, 0.12, "square", 0.06);
        this.tone(660, 0.12, "square", 0.06, undefined, 0.1);
        this.tone(880, 0.25, "square", 0.07, undefined, 0.2);
        break;
      case "over":
        this.tone(392, 0.5, "sawtooth", 0.1, 196);
        this.tone(311, 0.7, "sawtooth", 0.1, 98, 0.25);
        this.noise(0.8, 0.2, 800, 0.1);
        break;
      case "ui":
        this.tone(740, 0.05, "triangle", 0.08);
        break;
      case "pause":
        this.tone(600, 0.08, "triangle", 0.1, 300);
        break;
    }
  }
}

export const sfx = new Sfx();
