import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAudioSmoothingMemory,
  extractAudioMetrics,
  formatAudioTime,
} from './audioMetrics';
import type { AudioReactiveState } from '../simulation/types';

test('extractAudioMetrics separates bass, mid, and treble frequency bands accurately', () => {
  const sampleRate = 48000; // Nyquist = 24000 Hz
  const binCount = 256; // ~93.75 Hz per bin
  const out: AudioReactiveState = {
    active: false,
    bass: 0,
    mid: 0,
    treble: 0,
    level: 0,
    beat: 0,
    sensitivity: 1.0,
  };

  // Inject pure low-frequency bass energy (bins 1..2 -> ~94Hz..188Hz)
  const bassBins = new Uint8Array(binCount);
  bassBins[1] = 240;
  bassBins[2] = 220;

  const memBass = createAudioSmoothingMemory();
  for (let i = 0; i < 5; i++) {
    extractAudioMetrics(bassBins, sampleRate, memBass, 0.03, 1.2, out);
  }

  assert.equal(out.active, true);
  assert.ok(out.bass > 0.6, `expected strong bass, got ${out.bass}`);
  assert.ok(out.mid < 0.05, `expected near-zero mid, got ${out.mid}`);
  assert.ok(out.treble < 0.05, `expected near-zero treble, got ${out.treble}`);
  assert.ok(out.beat > 0.2, 'sudden bass onset should trigger beat pulse');

  // Inject high-frequency treble energy (bins 40..90 -> ~3.75kHz..8.4kHz)
  const trebleBins = new Uint8Array(binCount);
  for (let b = 40; b <= 90; b++) {
    trebleBins[b] = 230;
  }
  const memTreble = createAudioSmoothingMemory();
  for (let i = 0; i < 8; i++) {
    extractAudioMetrics(trebleBins, sampleRate, memTreble, 0.03, 1.0, out);
  }
  assert.ok(out.treble > 0.4, `expected strong treble, got ${out.treble}`);
  assert.ok(out.bass < 0.05, `expected near-zero bass, got ${out.bass}`);
});

test('extractAudioMetrics handles empty buffer gracefully', () => {
  const mem = createAudioSmoothingMemory();
  const out: AudioReactiveState = {
    active: true,
    bass: 1,
    mid: 1,
    treble: 1,
    level: 1,
    beat: 1,
    sensitivity: 1,
  };
  extractAudioMetrics(new Uint8Array(0), 48000, mem, 0.016, 1.0, out);
  assert.equal(out.active, false);
  assert.equal(out.bass, 0);
  assert.equal(out.level, 0);
});

test('formatAudioTime formats seconds as MM:SS safely', () => {
  assert.equal(formatAudioTime(0), '00:00');
  assert.equal(formatAudioTime(65), '01:05');
  assert.equal(formatAudioTime(195.8), '03:15');
  assert.equal(formatAudioTime(-5), '00:00');
  assert.equal(formatAudioTime(Number.NaN), '00:00');
});
