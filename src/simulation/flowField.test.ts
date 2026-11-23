import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCurlNoise,
  computePointerForce,
  computeShockwaveForce,
  sampleFlowField,
} from './flowField';
import type { FlowMode, PointerFieldState, ShockwavePulse, Vec3Out } from './types';

test('computeCurlNoise outputs finite smooth 3D vectors', () => {
  const out: Vec3Out = { x: 0, y: 0, z: 0 };
  computeCurlNoise(1.2, -0.8, 2.5, 4.0, 0.3, out);

  assert.equal(Number.isFinite(out.x), true);
  assert.equal(Number.isFinite(out.y), true);
  assert.equal(Number.isFinite(out.z), true);
  assert.ok(Math.hypot(out.x, out.y, out.z) > 0.01);
});

test('sampleFlowField produces valid finite steering vectors for all 5 presets', () => {
  const modes: FlowMode[] = ['nebula', 'aurora', 'orbital', 'lattice', 'fountain'];
  const out: Vec3Out = { x: 0, y: 0, z: 0 };

  for (const mode of modes) {
    sampleFlowField(mode, 2.0, 0.5, -1.5, 1.0, 0.0, -1.0, 0.42, 3.5, 1.0, out);
    assert.equal(Number.isFinite(out.x), true, `${mode}.x must be finite`);
    assert.equal(Number.isFinite(out.y), true, `${mode}.y must be finite`);
    assert.equal(Number.isFinite(out.z), true, `${mode}.z must be finite`);
  }

  // Aurora streams horizontally in +X direction
  sampleFlowField('aurora', 0, 0, 0, 0, 0, 0, 0.5, 1.0, 0.5, out);
  assert.ok(out.x > 0.5, 'aurora flow should drift in +X direction');

  // Fountain rises upward in +Y direction
  sampleFlowField('fountain', 0.4, -3.0, 0.2, 0, 0, 0, 0.5, 1.0, 0.5, out);
  assert.ok(out.y > 0.8, 'fountain flow should rise upward');
});

test('computePointerForce applies repel, attract, and swirl in expected directions', () => {
  const out: Vec3Out = { x: 0, y: 0, z: 0 };
  const pointer: PointerFieldState = {
    active: true,
    pressed: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
  };

  // Particle sits at (+1.5, 0, 0) within radius 4.0
  const repelEnergy = computePointerForce(1.5, 0, 0, pointer, 'repel', 4.0, out);
  assert.ok(out.x > 0, 'repel must push particle away in +X');
  assert.ok(repelEnergy > 0);

  const attractEnergy = computePointerForce(1.5, 0, 0, pointer, 'attract', 4.0, out);
  assert.ok(out.x < 0, 'attract must pull particle toward origin in -X');
  assert.ok(attractEnergy > 0);

  const swirlEnergy = computePointerForce(1.5, 0, 0, pointer, 'swirl', 4.0, out);
  assert.ok(out.y > 0, 'swirl must apply tangential +Y rotation at (+X, 0)');
  assert.ok(swirlEnergy > 0);

  // Outside interaction radius produces zero force
  const zeroEnergy = computePointerForce(6.0, 0, 0, pointer, 'repel', 4.0, out);
  assert.equal(zeroEnergy, 0);
  assert.equal(out.x, 0);
  assert.equal(out.y, 0);
  assert.equal(out.z, 0);
});

test('computeShockwaveForce pushes particles radially along expanding wavefront', () => {
  const out: Vec3Out = { x: 0, y: 0, z: 0 };
  const pulses: ShockwavePulse[] = [
    {
      id: 1,
      x: 0,
      y: 0,
      z: 0,
      radius: 2.0,
      maxRadius: 9.0,
      strength: 18.0,
      age: 0.3,
      duration: 1.5,
    },
  ];

  // Particle directly on the ring at (2.0, 0, 0)
  const hitEnergy = computeShockwaveForce(2.0, 0, 0, pulses, out);
  assert.ok(out.x > 5.0, 'wavefront should push particle radially outward');
  assert.ok(hitEnergy > 0.5);

  // Particle far outside the wavefront thickness
  const missEnergy = computeShockwaveForce(6.0, 0, 0, pulses, out);
  assert.equal(missEnergy, 0);
  assert.equal(out.x, 0);
});
