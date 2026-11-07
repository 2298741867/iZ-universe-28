/**
 * Advanced Procedural Web Audio API Synthesizer
 * Ambient Synthwave / Cyberpunk Generative Music & Spatial SFX
 * Zero external audio files (100% procedurally synthesized, no 404s)
 */

class WebAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  // Master Gain nodes
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Volumes
  private masterVolume: number = 0.8;
  private musicVolume: number = 0.55;
  private sfxVolume: number = 0.75;

  // Continuous loop nodes
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private gravityOsc: OscillatorNode | null = null;
  private gravityGain: GainNode | null = null;

  private shieldOsc: OscillatorNode | null = null;
  private shieldGain: GainNode | null = null;

  // Synthwave Music Sequencer
  private isMusicPlaying: boolean = false;
  private musicTimerId: number | null = null;
  private step: number = 0;

  // Synthwave Chord Progression in D Minor: Dm, Bb, F, C
  private bassNotes: number[] = [73.42, 58.27, 87.31, 65.41]; // D2, Bb1, F2, C2
  private arpScales: number[][] = [
    [293.66, 349.23, 440.0, 523.25, 587.33, 698.46], // Dm: D4, F4, A4, C5, D5, F5
    [233.08, 293.66, 349.23, 466.16, 587.33, 698.46], // Bb: Bb3, D4, F4, Bb4, D5, F5
    [349.23, 440.0, 523.25, 698.46, 880.0, 1046.5],   // F: F4, A4, C5, F5, A5, C6
    [261.63, 329.63, 392.0, 523.25, 659.25, 783.99],  // C: C4, E4, G4, C5, E5, G5
  ];

  public init(): void {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();

    try {
      // Master Bus
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.enabled ? this.masterVolume : 0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Music Bus
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      // SFX Bus
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // 1. Engine Drone
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineFilter = this.ctx.createBiquadFilter();

      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(58, this.ctx.currentTime);

      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(160, this.ctx.currentTime);

      this.engineGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.sfxGain);
      this.engineOsc.start();

      // 2. Gravitational Pull Vortex Drone
      this.gravityOsc = this.ctx.createOscillator();
      this.gravityGain = this.ctx.createGain();
      this.gravityOsc.type = 'triangle';
      this.gravityOsc.frequency.setValueAtTime(42, this.ctx.currentTime);
      this.gravityGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      const gravFilter = this.ctx.createBiquadFilter();
      gravFilter.type = 'lowpass';
      gravFilter.frequency.setValueAtTime(110, this.ctx.currentTime);

      this.gravityOsc.connect(gravFilter);
      gravFilter.connect(this.gravityGain);
      this.gravityGain.connect(this.sfxGain);
      this.gravityOsc.start();

      // 3. Shield Continuous Hum
      this.shieldOsc = this.ctx.createOscillator();
      this.shieldGain = this.ctx.createGain();
      this.shieldOsc.type = 'sine';
      this.shieldOsc.frequency.setValueAtTime(260, this.ctx.currentTime);
      this.shieldGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      const shieldFilter = this.ctx.createBiquadFilter();
      shieldFilter.type = 'bandpass';
      shieldFilter.frequency.setValueAtTime(450, this.ctx.currentTime);
      shieldFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

      this.shieldOsc.connect(shieldFilter);
      shieldFilter.connect(this.shieldGain);
      this.shieldGain.connect(this.sfxGain);
      this.shieldOsc.start();

      // Start the generative Synthwave music background track
      this.startSynthwaveBGM();
    } catch {
      // AudioContext requires user gesture
    }
  }

  // --- Synthwave / Cyberpunk Ambient Background Music Sequencer ---
  public startSynthwaveBGM(): void {
    if (this.isMusicPlaying || !this.ctx) return;
    this.isMusicPlaying = true;
    this.step = 0;

    const tempo = 124; // BPM
    const stepDuration = (60 / tempo) / 4; // 16th note in seconds

    const scheduleTick = () => {
      if (!this.isMusicPlaying || !this.ctx || !this.musicGain) return;

      const now = this.ctx.currentTime;
      const bar = Math.floor(this.step / 16);
      const stepInBar = this.step % 16;
      const chordIndex = bar % 4;

      // 1. Synthwave Bassline (every 8th note, driving syncopation)
      if (stepInBar % 2 === 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(this.bassNotes[chordIndex], now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(380, now);
        filter.frequency.exponentialRampToValueAtTime(70, now + stepDuration * 1.8);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + stepDuration * 1.9);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);

        osc.start(now);
        osc.stop(now + stepDuration * 2);
      }

      // 2. Cyber Arpeggio (16th notes)
      const scale = this.arpScales[chordIndex];
      const note = scale[stepInBar % scale.length];
      if (stepInBar % 2 === 1 || stepInBar % 4 === 2) {
        const arpOsc = this.ctx.createOscillator();
        const arpGain = this.ctx.createGain();
        const arpFilter = this.ctx.createBiquadFilter();

        arpOsc.type = 'square';
        arpOsc.frequency.setValueAtTime(note, now);

        arpFilter.type = 'bandpass';
        arpFilter.frequency.setValueAtTime(800 + Math.sin(this.step * 0.2) * 400, now);
        arpFilter.Q.setValueAtTime(2.5, now);

        arpGain.gain.setValueAtTime(0.06, now);
        arpGain.gain.exponentialRampToValueAtTime(0.001, now + stepDuration * 0.9);

        arpOsc.connect(arpFilter);
        arpFilter.connect(arpGain);
        arpGain.connect(this.musicGain);

        arpOsc.start(now);
        arpOsc.stop(now + stepDuration);
      }

      // 3. Subtle Cyber Hi-hat on offbeats
      if (stepInBar % 4 === 2) {
        const bufferSize = this.ctx.sampleRate * 0.04;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const hatFilter = this.ctx.createBiquadFilter();
        hatFilter.type = 'highpass';
        hatFilter.frequency.setValueAtTime(7000, now);

        const hatGain = this.ctx.createGain();
        hatGain.gain.setValueAtTime(0.035, now);
        hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        noise.connect(hatFilter);
        hatFilter.connect(hatGain);
        hatGain.connect(this.musicGain);

        noise.start(now);
      }

      // 4. Subtle Electro Kick on beats 0, 4, 8, 12
      if (stepInBar % 4 === 0) {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();

        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(130, now);
        kickOsc.frequency.exponentialRampToValueAtTime(35, now + 0.12);

        kickGain.gain.setValueAtTime(0.16, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

        kickOsc.connect(kickGain);
        kickGain.connect(this.musicGain);

        kickOsc.start(now);
        kickOsc.stop(now + 0.14);
      }

      this.step++;
      this.musicTimerId = window.setTimeout(scheduleTick, stepDuration * 1000);
    };

    scheduleTick();
  }

  public stopSynthwaveBGM(): void {
    this.isMusicPlaying = false;
    if (this.musicTimerId !== null) {
      clearTimeout(this.musicTimerId);
      this.musicTimerId = null;
    }
  }

  // --- Dynamic Sound Effects ---

  // Ship Plasma Blaster Shoot
  public playLaserShot(): void {
    if (!this.ctx || !this.enabled || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.14);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.14);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Planet / Gravity Well Destroyed by Blasters
  public playPlanetExplosion(): void {
    if (!this.ctx || !this.enabled || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // Sub-bass thud
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(110, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.45);

    subGain.gain.setValueAtTime(0.35, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(now);
    subOsc.stop(now + 0.5);

    // Debris noise crackle
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.4);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  // Laser Impact on Planet Core (Non-fatal hit)
  public playPlanetHit(): void {
    if (!this.ctx || !this.enabled || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Ship Dynamic Acceleration & Lateral Banking
  public updateShipAudio(forwardSpeed: number, lateralVelocity: number): void {
    if (!this.ctx || !this.enabled || !this.engineOsc || !this.engineFilter || !this.engineGain) return;
    const now = this.ctx.currentTime;

    const targetFreq = 54 + Math.min(forwardSpeed * 1.5, 45) + Math.abs(lateralVelocity) * 2.5;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);

    const filterFreq = 160 + Math.abs(lateralVelocity) * 18;
    this.engineFilter.frequency.setTargetAtTime(filterFreq, now, 0.08);

    const targetGain = 0.035 + (forwardSpeed / 30) * 0.02 + (Math.abs(lateralVelocity) / 20) * 0.015;
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);
  }

  // Proximity to Nearest Gravity Well (Gravitational Pull Audio)
  public updateGravityPullAudio(closestDistance: number): void {
    if (!this.ctx || !this.enabled || !this.gravityGain || !this.gravityOsc) return;
    const now = this.ctx.currentTime;

    if (closestDistance < 7.0) {
      // Swelling ominous vortex drone
      const intensity = Math.max(0, 1 - closestDistance / 7.0);
      const gainVal = intensity * 0.22;
      const freqVal = 38 + intensity * 40;

      this.gravityGain.gain.setTargetAtTime(gainVal, now, 0.06);
      this.gravityOsc.frequency.setTargetAtTime(freqVal, now, 0.06);
    } else {
      this.gravityGain.gain.setTargetAtTime(0.0, now, 0.1);
    }
  }

  // Shield Repulsion Activation & Hum
  public setShieldHum(active: boolean, energyRatio: number): void {
    if (!this.ctx || !this.enabled || !this.shieldGain || !this.shieldOsc) return;
    const now = this.ctx.currentTime;
    if (active && energyRatio > 0) {
      this.shieldGain.gain.setTargetAtTime(0.12, now, 0.05);
      this.shieldOsc.frequency.setTargetAtTime(260 + (1 - energyRatio) * 180, now, 0.05);
    } else {
      this.shieldGain.gain.setTargetAtTime(0.0, now, 0.08);
    }
  }

  // Shield Depleted Alarm Buzz
  public playShieldDepleted(): void {
    if (!this.ctx || !this.enabled || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.setValueAtTime(110, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  // Near-Miss Bonus Chime
  public playNearMiss(): void {
    if (!this.ctx || !this.enabled || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.16); // C6

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  // Tutorial Step Progression Chime
  public playStepChime(): void {
    if (!this.ctx || !this.enabled || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(659.25, now + 0.1);
    osc.frequency.setValueAtTime(880, now + 0.2);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  // Reroute Pulse / Gravitational Surge
  public playReroutePulse(): void {
    if (!this.ctx || !this.enabled || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.18);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  // Game Over Singularity Detonation
  public playExplosion(): void {
    if (!this.ctx || !this.enabled || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.8;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(40, now + 0.8);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  // Comms Open/Close Radio Chirp
  public playRadioChirp(opening: boolean = true): void {
    if (!this.ctx || !this.enabled || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const startFreq = opening ? 880 : 1320;
    const endFreq = opening ? 1320 : 880;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // Voice Command Acknowledged Chime
  public playVoiceAck(): void {
    if (!this.ctx || !this.enabled || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const noteTime = now + idx * 0.05;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.15, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.15);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(noteTime);
      osc.stop(noteTime + 0.16);
    });
  }

  // --- Volume & Master Controls ---
  public setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.enabled ? this.masterVolume : 0, this.ctx.currentTime);
    }
  }

  public setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.musicGain) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
    }
  }

  public setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.sfxGain) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.enabled ? this.masterVolume : 0, this.ctx.currentTime);
    }
    return this.enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
  public getMasterVolume(): number { return this.masterVolume; }
  public getMusicVolume(): number { return this.musicVolume; }
  public getSfxVolume(): number { return this.sfxVolume; }
}

export const audioSynth = new WebAudioSynthesizer();
