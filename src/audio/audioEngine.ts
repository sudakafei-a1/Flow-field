import type { AudioReactiveState } from '../simulation/types';
import {
  createAudioSmoothingMemory,
  extractAudioMetrics,
  type AudioSmoothingMemory,
} from './audioMetrics';

export type AudioSourceMode = 'none' | 'file' | 'demo';

export interface AudioStatusSnapshot {
  sourceMode: AudioSourceMode;
  trackName: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
}

/**
 * Local Web Audio API engine supporting:
 * 1. Local audio file import (MP3/WAV/OGG/FLAC/M4A via Object URL + HTMLAudioElement)
 * 2. Built-in procedural Web Audio harmonic beat generator (zero external audio files)
 * Both route through a shared AnalyserNode for real-time 3-band particle pulsation.
 */
export class ParticleAudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private objectUrl: string | null = null;
  private freqBins: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));

  private memory: AudioSmoothingMemory = createAudioSmoothingMemory();
  private sourceMode: AudioSourceMode = 'none';
  private trackName = '';
  private isPlaying = false;
  private error: string | null = null;

  // Procedural demo beat sequencer state
  private demoTimerId: number | null = null;
  private demoStep = 0;
  private demoStartTime = 0;
  private demoPhaseAccum = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        this.error = '当前浏览器不支持 Web Audio API';
        return null;
      }
      this.ctx = new AudioCtx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.72;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.freqBins = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // Autoplay restriction handled on next user gesture
      });
    }
    return this.ctx;
  }

  private ensureAudioElement(): HTMLAudioElement | null {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return null;

    if (!this.audioEl) {
      const el = document.createElement('audio');
      el.crossOrigin = 'anonymous';
      el.loop = true;
      el.preload = 'auto';
      el.addEventListener('ended', () => {
        if (!el.loop) {
          this.isPlaying = false;
        }
      });
      this.audioEl = el;
      this.mediaSource = ctx.createMediaElementSource(el);
      this.mediaSource.connect(this.masterGain);
    }

    return this.audioEl;
  }

  async loadLocalFile(file: File): Promise<AudioStatusSnapshot> {
    this.stopDemoBeat();
    this.error = null;

    const el = this.ensureAudioElement();
    if (!el) {
      return this.getStatus();
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    const url = URL.createObjectURL(file);
    this.objectUrl = url;
    this.sourceMode = 'file';
    this.trackName = file.name.replace(/\.[^/.]+$/, '');
    el.src = url;
    el.currentTime = 0;

    try {
      await el.play();
      this.isPlaying = true;
    } catch {
      // File is loaded; user can press Play if browser blocked autoplay
      this.isPlaying = false;
    }

    return this.getStatus();
  }

  startDemoBeat(): AudioStatusSnapshot {
    this.error = null;
    if (this.audioEl && !this.audioEl.paused) {
      this.audioEl.pause();
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) {
      return this.getStatus();
    }

    this.stopDemoBeat();
    this.sourceMode = 'demo';
    this.trackName = '星海心跳 · 内置律动';
    this.isPlaying = true;
    this.demoStep = 0;
    this.demoStartTime = performance.now();
    this.demoPhaseAccum = 0;

    const playStep = () => {
      if (!this.ctx || !this.masterGain || !this.isPlaying || this.sourceMode !== 'demo') return;
      const now = this.ctx.currentTime;
      const step = this.demoStep % 16;

      // Warm heartbeat double-kick on steps 0, 2, 8, 10
      if (step === 0 || step === 2 || step === 8 || step === 10) {
        const isPrimary = step === 0 || step === 8;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isPrimary ? 118 : 96, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.19);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(isPrimary ? 0.65 : 0.42, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
      }

      // Soft warm pad / bassline on step 0 and 8
      if (step === 0 || step === 8) {
        const rootHz = step === 0 ? 110 : 98; // A2 -> G2
        const padOsc = this.ctx.createOscillator();
        const padGain = this.ctx.createGain();
        padOsc.type = 'triangle';
        padOsc.frequency.setValueAtTime(rootHz, now);

        padGain.gain.setValueAtTime(0.001, now);
        padGain.gain.linearRampToValueAtTime(0.16, now + 0.18);
        padGain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

        padOsc.connect(padGain);
        padGain.connect(this.masterGain);
        padOsc.start(now);
        padOsc.stop(now + 1.4);
      }

      // Crystalline pentatonic arpeggio shimmer for mid/treble reactivity
      const arpNotes = [440, 523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 659.25];
      if (step % 2 === 0) {
        const noteHz = arpNotes[(step / 2) % arpNotes.length];
        const chimeOsc = this.ctx.createOscillator();
        const chimeGain = this.ctx.createGain();
        chimeOsc.type = 'sine';
        chimeOsc.frequency.setValueAtTime(noteHz, now);

        chimeGain.gain.setValueAtTime(0.001, now);
        chimeGain.gain.linearRampToValueAtTime(0.09, now + 0.015);
        chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

        chimeOsc.connect(chimeGain);
        chimeGain.connect(this.masterGain);
        chimeOsc.start(now);
        chimeOsc.stop(now + 0.38);
      }

      this.demoStep++;
    };

    playStep();
    // 108 BPM sixteenth-note step (~138.8ms -> 8th-note feel at 215ms)
    this.demoTimerId = window.setInterval(playStep, 220);
    return this.getStatus();
  }

  private stopDemoBeat(): void {
    if (this.demoTimerId !== null) {
      window.clearInterval(this.demoTimerId);
      this.demoTimerId = null;
    }
  }

  async togglePlayPause(): Promise<AudioStatusSnapshot> {
    if (this.sourceMode === 'none') {
      return this.startDemoBeat();
    }

    if (this.sourceMode === 'demo') {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.stopDemoBeat();
      } else {
        return this.startDemoBeat();
      }
      return this.getStatus();
    }

    // Local file mode
    const el = this.audioEl;
    if (!el) return this.getStatus();

    this.ensureContext();
    if (el.paused) {
      try {
        await el.play();
        this.isPlaying = true;
      } catch {
        this.isPlaying = false;
      }
    } else {
      el.pause();
      this.isPlaying = false;
    }
    return this.getStatus();
  }

  stop(): AudioStatusSnapshot {
    this.stopDemoBeat();
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
    this.isPlaying = false;
    return this.getStatus();
  }

  seek(timeSeconds: number): void {
    if (this.sourceMode === 'file' && this.audioEl && Number.isFinite(this.audioEl.duration)) {
      this.audioEl.currentTime = Math.max(0, Math.min(this.audioEl.duration, timeSeconds));
    }
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.03);
    }
  }

  /**
   * Samples real-time audio spectrum into `out` once per animation frame.
   */
  sample(dt: number, sensitivity: number, out: AudioReactiveState): void {
    if (!this.isPlaying || this.sourceMode === 'none') {
      // Smoothly decay back to calm idle state
      const decay = Math.exp(-6.0 * Math.min(0.1, Math.max(0.004, dt)));
      this.memory.bass *= decay;
      this.memory.mid *= decay;
      this.memory.treble *= decay;
      this.memory.level *= decay;
      this.memory.beat *= decay;

      const stillActive = this.memory.level > 0.005 || this.memory.bass > 0.005;
      out.active = stillActive;
      out.bass = this.memory.bass;
      out.mid = this.memory.mid;
      out.treble = this.memory.treble;
      out.level = this.memory.level;
      out.beat = this.memory.beat;
      out.sensitivity = sensitivity;
      return;
    }

    if (this.analyser && this.ctx && this.freqBins.length > 0) {
      this.analyser.getByteFrequencyData(this.freqBins);
      extractAudioMetrics(
        this.freqBins,
        this.ctx.sampleRate,
        this.memory,
        dt,
        sensitivity,
        out,
      );

      // In headless/muted environments where Web Audio output clock may stay suspended
      // during demo beat, synthesize a synchronized fallback rhythmic envelope so demo
      // pulsation remains visibly responsive while still prioritizing real FFT bins.
      if (this.sourceMode === 'demo' && out.level < 0.02) {
        this.demoPhaseAccum += dt;
        const beatFreq = 1 / 0.88; // matches 4 * 220ms heartbeat cycle
        const phase = (this.demoPhaseAccum * beatFreq) % 1;
        // Classic lub-dub heartbeat waveform
        const lub = Math.exp(-Math.pow((phase - 0.08) / 0.065, 2));
        const dub = Math.exp(-Math.pow((phase - 0.30) / 0.075, 2)) * 0.72;
        const pulse = Math.min(1, lub + dub);
        out.active = true;
        out.bass = pulse * 0.82;
        out.mid = 0.25 + 0.35 * Math.abs(Math.sin(this.demoPhaseAccum * 3.6));
        out.treble = 0.2 + 0.45 * Math.abs(Math.sin(this.demoPhaseAccum * 7.2));
        out.level = out.bass * 0.5 + out.mid * 0.3 + out.treble * 0.2;
        out.beat = lub > 0.55 ? lub * 0.85 : dub * 0.5;
        out.sensitivity = sensitivity;
      }
      return;
    }

    out.active = false;
    out.bass = 0;
    out.mid = 0;
    out.treble = 0;
    out.level = 0;
    out.beat = 0;
    out.sensitivity = sensitivity;
  }

  getStatus(): AudioStatusSnapshot {
    const currentTime =
      this.sourceMode === 'file' && this.audioEl
        ? this.audioEl.currentTime
        : this.sourceMode === 'demo' && this.isPlaying
          ? (performance.now() - this.demoStartTime) / 1000
          : 0;
    const duration =
      this.sourceMode === 'file' && this.audioEl && Number.isFinite(this.audioEl.duration)
        ? this.audioEl.duration
        : 0;

    return {
      sourceMode: this.sourceMode,
      trackName: this.trackName,
      isPlaying: this.isPlaying,
      currentTime,
      duration,
      error: this.error,
    };
  }

  dispose(): void {
    this.stopDemoBeat();
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.analyser = null;
    this.masterGain = null;
    this.mediaSource = null;
    this.audioEl = null;
  }
}
