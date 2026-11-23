// Procedural Web Audio API sound effects for Three Kingdoms War Scene Theater
// Zero external audio assets required; gracefully no-ops when muted or unavailable.

class BattleAudioEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /** Deep Chinese Zhangu (战鼓) war drum beat */
  public playWarDrum(volume = 0.28): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.28);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);

    // Subtle drum skin transient
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(ctx, 0.08);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 260;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(volume * 0.35, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
  }

  /** Arrow volley whoosh rain */
  public playArrowVolley(volume = 0.14): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 4; i++) {
      const start = now + i * 0.065;
      const src = ctx.createBufferSource();
      src.buffer = this.createNoiseBuffer(ctx, 0.22);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2200 + i * 320, start);
      filter.frequency.exponentialRampToValueAtTime(750, start + 0.2);
      filter.Q.value = 3.2;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.21);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(start);
    }
  }

  /** Metallic sword & halberd clash */
  public playSteelClash(volume = 0.14): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [1420, 2190, 3180];

    for (const f of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f + Math.random() * 140, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.82, now + 0.18);

      gain.gain.setValueAtTime(volume * 0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  }

  /** Black Powder / Fire Bomb thunderous explosion */
  public playExplosion(volume = 0.28): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Low boom
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(86, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.55);
    oGain.gain.setValueAtTime(volume * 0.65, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    osc.connect(oGain);
    oGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);

    // Crackle blast noise
    const src = ctx.createBufferSource();
    src.buffer = this.createNoiseBuffer(ctx, 0.65);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.62);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(volume, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.64);
    src.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
  }

  /** Hero Signature Skill dramatic chime/gong surge */
  public playSkillSurge(volume = 0.22): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [330, 495, 660, 990];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      gain.gain.setValueAtTime(0.001, now + idx * 0.04);
      gain.gain.linearRampToValueAtTime(volume * 0.45, now + idx * 0.04 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + 0.75);
    });
  }

  /** Victory or Defeat bronze war horn */
  public playOutcomeHorn(victory: boolean, volume = 0.18): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord = victory ? [220, 277.18, 329.63, 440] : [196, 185, 146.83];

    chord.forEach((freq, idx) => {
      const start = now + idx * 0.08;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(volume * 0.35, start + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.85);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.9);
    });
  }
}

export const battleAudio = new BattleAudioEngine();
