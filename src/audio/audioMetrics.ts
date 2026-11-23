import type { AudioReactiveState } from '../simulation/types';

export interface AudioSmoothingMemory {
  bass: number;
  mid: number;
  treble: number;
  level: number;
  bassAvg: number;
  beat: number;
}

export function createAudioSmoothingMemory(): AudioSmoothingMemory {
  return {
    bass: 0,
    mid: 0,
    treble: 0,
    level: 0,
    bassAvg: 0,
    beat: 0,
  };
}

/**
 * Pure frequency-domain band extractor converting Web Audio AnalyserNode
 * Uint8Array byte frequency data into normalized [0..1] bass, mid, treble,
 * overall level, and transient beat pulse signals.
 */
export function extractAudioMetrics(
  freqBins: Uint8Array,
  sampleRate: number,
  memory: AudioSmoothingMemory,
  dt: number,
  sensitivity: number,
  out: AudioReactiveState,
): void {
  const n = freqBins.length;
  if (n === 0 || sampleRate <= 0) {
    out.active = false;
    out.bass = 0;
    out.mid = 0;
    out.treble = 0;
    out.level = 0;
    out.beat = 0;
    out.sensitivity = sensitivity;
    return;
  }

  const nyquist = sampleRate * 0.5;
  const hzPerBin = nyquist / n;

  let bassSum = 0;
  let bassCount = 0;
  let midSum = 0;
  let midCount = 0;
  let trebleSum = 0;
  let trebleCount = 0;

  for (let i = 0; i < n; i++) {
    const hz = i * hzPerBin;
    const v = freqBins[i] / 255;

    if (hz >= 25 && hz < 220) {
      bassSum += v;
      bassCount++;
    } else if (hz >= 220 && hz < 2200) {
      midSum += v;
      midCount++;
    } else if (hz >= 2200 && hz <= 12000) {
      trebleSum += v;
      trebleCount++;
    }
  }

  const rawBass = bassCount > 0 ? bassSum / bassCount : 0;
  const rawMid = midCount > 0 ? midSum / midCount : 0;
  const rawTreble = trebleCount > 0 ? trebleSum / trebleCount : 0;
  const rawLevel = rawBass * 0.45 + rawMid * 0.35 + rawTreble * 0.2;

  // Slightly punchier curve for musical visual dynamics
  const shapedBass = Math.min(1, Math.pow(rawBass, 1.15) * 1.15);
  const shapedMid = Math.min(1, Math.pow(rawMid, 1.1) * 1.1);
  const shapedTreble = Math.min(1, Math.pow(rawTreble, 1.05) * 1.2);

  const safeDt = Math.min(0.1, Math.max(0.004, dt));
  const attack = 1 - Math.exp(-20 * safeDt);
  const release = 1 - Math.exp(-7.5 * safeDt);

  memory.bass += (shapedBass - memory.bass) * (shapedBass > memory.bass ? attack : release);
  memory.mid += (shapedMid - memory.mid) * (shapedMid > memory.mid ? attack : release);
  memory.treble +=
    (shapedTreble - memory.treble) * (shapedTreble > memory.treble ? attack : release);
  memory.level += (rawLevel - memory.level) * (rawLevel > memory.level ? attack : release);

  // Beat transient detection against moving bass average
  const avgAlpha = 1 - Math.exp(-2.2 * safeDt);
  memory.bassAvg += (shapedBass - memory.bassAvg) * avgAlpha;

  const bassDelta = shapedBass - memory.bassAvg;
  if (bassDelta > 0.14 && shapedBass > 0.28) {
    memory.beat = Math.min(1, Math.max(memory.beat, Math.min(1, bassDelta * 3.2)));
  } else {
    memory.beat *= Math.exp(-6.5 * safeDt);
  }

  out.active = true;
  out.bass = Math.max(0, Math.min(1, memory.bass));
  out.mid = Math.max(0, Math.min(1, memory.mid));
  out.treble = Math.max(0, Math.min(1, memory.treble));
  out.level = Math.max(0, Math.min(1, memory.level));
  out.beat = Math.max(0, Math.min(1, memory.beat));
  out.sensitivity = sensitivity;
}

/**
 * Formats seconds as MM:SS for tabular display in the music bar.
 */
export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
