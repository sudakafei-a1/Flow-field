import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleSimulation } from './particleSystem';
import { DEFAULT_SIMULATION_PARAMS, type PointerFieldState } from './types';

const IDLE_POINTER: PointerFieldState = {
  active: false,
  pressed: false,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
};

test('ParticleSimulation advances positions over time and respects pause', () => {
  const sim = new ParticleSimulation(400, 12345);
  const initialX = sim.positions[0];
  const initialY = sim.positions[1];

  // Stepping while paused must keep time and positions unchanged
  sim.step(0.03, { ...DEFAULT_SIMULATION_PARAMS, particleCount: 400, paused: true }, IDLE_POINTER);
  assert.equal(sim.time, 0);
  assert.equal(sim.positions[0], initialX);
  assert.equal(sim.positions[1], initialY);

  // Stepping while running advances time and moves particles smoothly
  for (let i = 0; i < 20; i++) {
    sim.step(0.025, { ...DEFAULT_SIMULATION_PARAMS, particleCount: 400, paused: false }, IDLE_POINTER);
  }
  assert.ok(sim.time > 0.4);
  const movedDist = Math.hypot(sim.positions[0] - initialX, sim.positions[1] - initialY);
  assert.ok(movedDist > 0.05, 'particles should visibly flow after simulation steps');
});

test('ParticleSimulation shockwave pulses expand and expire cleanly', () => {
  const sim = new ParticleSimulation(200, 99);
  sim.triggerPulse(0, 0, 0, 16);
  assert.equal(sim.pulses.length, 1);

  // Advance past pulse duration (1.55s)
  for (let i = 0; i < 70; i++) {
    sim.step(0.03, { ...DEFAULT_SIMULATION_PARAMS, particleCount: 200 }, IDLE_POINTER);
  }

  assert.equal(sim.pulses.length, 0, 'expired shockwave pulse should be cleaned up');
});

test('ParticleSimulation stays finite and bounded across all flow modes under active interaction', () => {
  const sim = new ParticleSimulation(300, 777);
  const activePointer: PointerFieldState = {
    active: true,
    pressed: true,
    x: 1.0,
    y: -0.5,
    z: 0,
    vx: 4.5,
    vy: -3.2,
  };

  sim.triggerPulse(1.0, -0.5, 0, 20);
  const modes = ['nebula', 'aurora', 'orbital', 'lattice', 'fountain'] as const;

  for (const flowMode of modes) {
    for (let step = 0; step < 30; step++) {
      sim.step(
        0.025,
        {
          ...DEFAULT_SIMULATION_PARAMS,
          flowMode,
          particleCount: 300,
          flowSpeed: 1.8,
          turbulence: 1.6,
        },
        activePointer,
      );
    }

    for (let i = 0; i < 300 * 3; i++) {
      assert.equal(
        Number.isFinite(sim.positions[i]),
        true,
        `position[${i}] must remain finite in mode ${flowMode}`,
      );
      assert.ok(
        Math.abs(sim.positions[i]) < 20,
        `position[${i}] must remain bounded in mode ${flowMode}`,
      );
    }
  }
});
