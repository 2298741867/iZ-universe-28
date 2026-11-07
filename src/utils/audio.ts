/**
 * Procedural Web Audio API Synthesizer for Antigravity & Planetary Infrastructure
 */

class WebAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private shieldOsc: OscillatorNode | null = null;
  private shieldGain: GainNode | null = null;

  public init(): void {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();

    try {
      // Ambient spatial flight drone
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(60, this.ctx.currentTime);
      this.engineGain.gain.setValueAtTime(0.02, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, this.ctx.currentTime);

      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();

      // Shield humming tone
      this.shieldOsc = this.ctx.createOscillator();
      this.shieldGain = this.ctx.createGain();
      this.shieldOsc.type = 'sine';
      this.shieldOsc.frequency.setValueAtTime(260, this.ctx.currentTime);
      this.shieldGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      const shieldFilter = this.ctx.createBiquadFilter();
      shieldFilter.type = 'bandpass';
      shieldFilter.frequency.setValueAtTime(450, this.ctx.currentTime);
      shieldFilter.Q.setValueAtTime(4.0, this.ctx.currentTime);

      this.shieldOsc.connect(shieldFilter);
      shieldFilter.connect(this.shieldGain);
      this.shieldGain.connect(this.ctx.destination);
      this.shieldOsc.start();
    } catch {
      // Audio context may be restricted before user interaction
    }
  }

  public setShieldHum(active: boolean, energyRatio: number): void {
    if (!this.ctx || !this.enabled || !this.shieldGain || !this.shieldOsc) return;
    const now = this.ctx.currentTime;
    if (active && energyRatio > 0) {
      this.shieldGain.gain.setTargetAtTime(0.08, now, 0.05);
      this.shieldOsc.frequency.setTargetAtTime(260 + (1 - energyRatio) * 180, now, 0.05);
    } else {
      this.shieldGain.gain.setTargetAtTime(0.0, now, 0.08);
    }
  }

  public playNearMiss(): void {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.16); // C6
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  public playReroutePulse(): void {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.18);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playExplosion(): void {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.7;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(550, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + 0.7);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.ctx && this.engineGain) {
      if (!this.enabled) {
        this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
      } else {
        this.engineGain.gain.setValueAtTime(0.02, this.ctx.currentTime);
      }
    }
    return this.enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}

export const audioSynth = new WebAudioSynthesizer();
