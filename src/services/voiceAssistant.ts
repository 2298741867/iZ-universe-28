/**
 * In-Flight Pollux AI Voice Assistant
 * Hands-free speech recognition (STT) and voice speech synthesis (TTS)
 * Allows pilot to speak tactical commands and chat with Pollux while flying.
 */

import { audioSynth } from '../utils/audio';

export interface FlightTelemetryContext {
  score: number;
  distance: number;
  nearMisses: number;
  shieldEnergy: number;
  speed: number;
  difficultyTier: number;
  isGameOver?: boolean;
}

export type VoiceActionType =
  | 'FIRE_LASERS'
  | 'ACTIVATE_SHIELD'
  | 'DEACTIVATE_SHIELD'
  | 'STATUS_REPORT'
  | 'RELAUNCH_GAME'
  | 'SAVE_TO_DRIVE'
  | 'TOGGLE_AUDIO'
  | 'AI_CONVERSATION';

export interface VoiceCommandResult {
  action: VoiceActionType;
  spokenReply: string;
  badge: string;
}

export class PolluxVoiceSystem {
  private recognition: any = null;
  private isListening: boolean = false;
  private isSpeaking: boolean = false;
  private shouldKeepListening: boolean = false;
  private telemetryProvider: () => FlightTelemetryContext = () => ({
    score: 0,
    distance: 0,
    nearMisses: 0,
    shieldEnergy: 1.0,
    speed: 14.0,
    difficultyTier: 1
  });

  // Action Handlers registered by the game engine
  private onFireLasers: () => void = () => {};
  private onTriggerShield: (active: boolean) => void = () => {};
  private onRelaunchGame: () => void = () => {};
  private onSaveToDrive: () => void = () => {};
  private onToggleAudio: () => void = () => {};

  // Event Listeners for UI HUD
  private onListeningChangeCallbacks: Array<(listening: boolean) => void> = [];
  private onSpeakingChangeCallbacks: Array<(speaking: boolean) => void> = [];
  private onTranscriptCallbacks: Array<(transcript: string, isFinal: boolean) => void> = [];
  private onPolluxReplyCallbacks: Array<(reply: string, badge?: string) => void> = [];

  constructor() {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition(): void {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      console.warn('SpeechRecognition API is not supported in this browser environment.');
      return;
    }

    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.notifyListening(true);
        audioSynth.playRadioChirp(true);
      };

      this.recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcriptChunk;
          } else {
            interim += transcriptChunk;
          }
        }

        if (interim) {
          this.notifyTranscript(interim.trim(), false);
        }

        if (final) {
          const cleaned = final.trim();
          this.notifyTranscript(cleaned, true);
          this.processVoiceCommand(cleaned);
        }
      };

      this.recognition.onerror = (event: any) => {
        // 'no-speech' is normal during silence, avoid console pollution
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Pollux Voice Recognition Error:', event.error);
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.notifyListening(false);
        // If user left voice comms toggled on, auto-restart gracefully
        if (this.shouldKeepListening) {
          setTimeout(() => {
            if (this.shouldKeepListening && !this.isListening) {
              try {
                this.recognition.start();
              } catch {
                // Ignore start races
              }
            }
          }, 350);
        }
      };
    } catch (e) {
      console.error('Failed to initialize speech recognition:', e);
    }
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  public setTelemetryProvider(provider: () => FlightTelemetryContext): void {
    this.telemetryProvider = provider;
  }

  public setActionHandlers(handlers: {
    onFireLasers?: () => void;
    onTriggerShield?: (active: boolean) => void;
    onRelaunchGame?: () => void;
    onSaveToDrive?: () => void;
    onToggleAudio?: () => void;
  }): void {
    if (handlers.onFireLasers) this.onFireLasers = handlers.onFireLasers;
    if (handlers.onTriggerShield) this.onTriggerShield = handlers.onTriggerShield;
    if (handlers.onRelaunchGame) this.onRelaunchGame = handlers.onRelaunchGame;
    if (handlers.onSaveToDrive) this.onSaveToDrive = handlers.onSaveToDrive;
    if (handlers.onToggleAudio) this.onToggleAudio = handlers.onToggleAudio;
  }

  public toggleComms(): boolean {
    if (!this.recognition) {
      this.initSpeechRecognition();
    }
    if (!this.recognition) return false;

    if (this.isListening || this.shouldKeepListening) {
      this.stopComms();
      return false;
    } else {
      this.startComms();
      return true;
    }
  }

  public startComms(): void {
    if (!this.recognition) return;
    this.shouldKeepListening = true;
    try {
      this.recognition.start();
    } catch {
      // Already running
    }
  }

  public stopComms(): void {
    this.shouldKeepListening = false;
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
    }
    audioSynth.playRadioChirp(false);
  }

  /**
   * Process spoken command or prompt from the pilot
   */
  public async processVoiceCommand(rawText: string): Promise<void> {
    const text = rawText.toLowerCase().trim();
    if (!text) return;

    const telemetry = this.telemetryProvider();

    // 1. FIRE WEAPONS / LASERS
    if (
      text.includes('fire') ||
      text.includes('shoot') ||
      text.includes('blaster') ||
      text.includes('laser') ||
      text.includes('attack') ||
      text.includes('pew')
    ) {
      this.onFireLasers();
      audioSynth.playVoiceAck();
      this.speak("Firing dual plasma blasters!", "💥 LASERS FIRED");
      return;
    }

    // 2. ACTIVATE SHIELD
    if (
      text.includes('shield up') ||
      text.includes('activate shield') ||
      text.includes('shields up') ||
      text.includes('shield on') ||
      text.includes('repel') ||
      text === 'shield' ||
      text.includes('repulsion')
    ) {
      this.onTriggerShield(true);
      audioSynth.playVoiceAck();
      this.speak("Antigravity shield engaged!", "🛡️ SHIELD ENGAGED");
      return;
    }

    // 3. DROP SHIELD
    if (
      text.includes('shield down') ||
      text.includes('drop shield') ||
      text.includes('deactivate shield') ||
      text.includes('shield off')
    ) {
      this.onTriggerShield(false);
      audioSynth.playVoiceAck();
      this.speak("Shield dropped. Conserving energy.", "🛡️ SHIELD DISENGAGED");
      return;
    }

    // 4. STATUS REPORT / DIAGNOSTICS
    if (
      text.includes('status') ||
      text.includes('report') ||
      text.includes('diagnostic') ||
      text.includes('systems check') ||
      text.includes('check system') ||
      text.includes('how are we doing')
    ) {
      audioSynth.playVoiceAck();
      const shieldPct = Math.round(telemetry.shieldEnergy * 100);
      const distKm = telemetry.distance.toFixed(1);
      const reply = `Status nominal, Commander. Shields at ${shieldPct} percent. Distance ${distKm} AU. Graviton tier ${telemetry.difficultyTier}. Evaded ${telemetry.score} wells.`;
      this.speak(reply, "📊 STATUS REPORT");
      return;
    }

    // 5. RELAUNCH / RESTART
    if (
      text.includes('restart') ||
      text.includes('relaunch') ||
      text.includes('try again') ||
      text.includes('play again') ||
      text.includes('respawn') ||
      text.includes('engage flight')
    ) {
      this.onRelaunchGame();
      audioSynth.playVoiceAck();
      this.speak("Initiating warp trajectory. Relaunching AGP-1!", "🚀 RELAUNCH");
      return;
    }

    // 6. SAVE TO GOOGLE DRIVE
    if (
      text.includes('save to drive') ||
      text.includes('save flight') ||
      text.includes('export telemetry') ||
      text.includes('save log') ||
      text.includes('backup flight') ||
      text.includes('google drive')
    ) {
      this.onSaveToDrive();
      audioSynth.playVoiceAck();
      this.speak("Accessing Google Drive. Flight telemetry ready for synchronization.", "📁 DRIVE SYNC");
      return;
    }

    // 7. TOGGLE AUDIO / SOUND
    if (
      text.includes('mute sound') ||
      text.includes('mute audio') ||
      text.includes('unmute') ||
      text.includes('toggle sound') ||
      text.includes('toggle audio')
    ) {
      this.onToggleAudio();
      audioSynth.playVoiceAck();
      this.speak("Audio output toggled.", "🔊 AUDIO TOGGLED");
      return;
    }

    // 8. TACTICAL AI QUERY / NATURAL CONVERSATION WITH POLLUX
    try {
      this.notifyTranscript(rawText, true);
      this.notifyPolluxReply("Pollux thinking...", "🤖 TACTICAL LINK");

      const response = await fetch('/api/pollux/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: rawText }],
          flightTelemetry: {
            ...telemetry,
            userSpoken: true
          }
        })
      });

      if (!response.ok) {
        throw new Error('Copilot link failure');
      }

      const data = await response.json();
      const replyText = data.reply || "Copilot link online. Vectors steady.";
      this.speak(replyText, "🤖 POLLUX");
    } catch {
      const fallback = "Pollux here, Commander! Comms array nominal. Maintain trajectory and keep clear of well event horizons.";
      this.speak(fallback, "🤖 POLLUX");
    }
  }

  /**
   * Speak output aloud using SpeechSynthesis with sci-fi voice tuning
   */
  public speak(text: string, badge?: string): void {
    this.notifyPolluxReply(text, badge);

    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1.06;
      utterance.rate = 1.08;

      // Select futuristic sounding voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') ||
            v.name.includes('Google') ||
            v.name.includes('Samantha') ||
            v.name.includes('Daniel') ||
            v.name.includes('Arthur'))
      );
      if (preferred) {
        utterance.voice = preferred;
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.notifySpeaking(true);
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.notifySpeaking(false);
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.notifySpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      this.isSpeaking = false;
      this.notifySpeaking(false);
    }
  }

  public stopSpeaking(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.notifySpeaking(false);
    }
  }

  // Observers
  public onListeningChange(cb: (listening: boolean) => void): () => void {
    this.onListeningChangeCallbacks.push(cb);
    return () => {
      this.onListeningChangeCallbacks = this.onListeningChangeCallbacks.filter((c) => c !== cb);
    };
  }

  public onSpeakingChange(cb: (speaking: boolean) => void): () => void {
    this.onSpeakingChangeCallbacks.push(cb);
    return () => {
      this.onSpeakingChangeCallbacks = this.onSpeakingChangeCallbacks.filter((c) => c !== cb);
    };
  }

  public onTranscript(cb: (text: string, isFinal: boolean) => void): () => void {
    this.onTranscriptCallbacks.push(cb);
    return () => {
      this.onTranscriptCallbacks = this.onTranscriptCallbacks.filter((c) => c !== cb);
    };
  }

  public onPolluxReply(cb: (reply: string, badge?: string) => void): () => void {
    this.onPolluxReplyCallbacks.push(cb);
    return () => {
      this.onPolluxReplyCallbacks = this.onPolluxReplyCallbacks.filter((c) => c !== cb);
    };
  }

  private notifyListening(listening: boolean): void {
    this.onListeningChangeCallbacks.forEach((cb) => cb(listening));
  }

  private notifySpeaking(speaking: boolean): void {
    this.onSpeakingChangeCallbacks.forEach((cb) => cb(speaking));
  }

  private notifyTranscript(text: string, isFinal: boolean): void {
    this.onTranscriptCallbacks.forEach((cb) => cb(text, isFinal));
  }

  private notifyPolluxReply(reply: string, badge?: string): void {
    this.onPolluxReplyCallbacks.forEach((cb) => cb(reply, badge));
  }
}

export const polluxVoice = new PolluxVoiceSystem();
