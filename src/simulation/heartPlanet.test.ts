import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeartPlanetAnchors,
  evaluateHeartSurfacePoint,
  HEART_CENTER_Y,
  sampleHeartPlanetTarget,
  WATER_PLANE_Y,
} from './heartPlanet';
import { createSeededRandom, ParticleSimulation } from './particleSystem';
import {
  DEFAULT_SIMULATION_PARAMS,
  SILENT_AUDIO_STATE,
  type AudioReactiveState,
  type Vec3Out,
} from './types';

test('evaluateHeartSurfacePoint generates symmetric finite 3D Taubin heart volume', () => {
  const right: Vec3Out = { x: 0, y: 0, z: 0 };
  const left: Vec3Out = { x: 0, y: 0, z: 0 };
  const front: Vec3Out = { x: 0, y: 0, z: 0 };
  const back: Vec3Out = { x: 0, y: 0, z: 0 };

  evaluateHeartSurfacePoint(0, 0.2, 0.5, right);
  evaluateHeartSurfacePoint(Math.PI, 0.2, 0.5, left);
  evaluateHeartSurfacePoint(Math.PI * 0.5, 0.1, 0.5, front);
  evaluateHeartSurfacePoint(Math.PI * 1.5, 0.1, 0.5, back);

  assert.ok(right.x > 1.5 && left.x < -1.5, 'heart should have wide left/right lobes');
  assert.ok(Math.abs(right.x + left.x) < 1e-4, 'heart lobes must be left/right symmetric');
  assert.ok(front.z > 0.8 && back.z < -0.8, '3D heart planet must have volumetric front/back depth');
  assert.ok(Math.abs(front.z + back.z) < 1e-4, 'front and back hemispheres must be symmetric');
});

test('buildHeartPlanetAnchors allocates 60% dense multi-layer water floor, 30% heart, 10% ring', () => {
  const rand = createSeededRandom(42);
  const { roles, waterDepth } = buildHeartPlanetAnchors(500, rand);

  let water = 0;
  let heart = 0;
  let ring = 0;
  let minDepth = Infinity;
  let maxDepth = -Infinity;

  for (let i = 0; i < roles.length; i++) {
    if (roles[i] === 0) {
      water++;
      minDepth = Math.min(minDepth, waterDepth[i]);
      maxDepth = Math.max(maxDepth, waterDepth[i]);
    } else if (roles[i] === 1) {
      heart++;
    } else if (roles[i] === 2) {
      ring++;
    }
  }

  assert.equal(water, 300);
  assert.equal(heart, 150);
  assert.equal(ring, 50);
  assert.ok(maxDepth - minDepth > 0.65, 'water floor should have multi-layer vertical thickness');
});

test('sampleHeartPlanetTarget expands heart and heightens water ripples under music bass', () => {
  const quietHeart: Vec3Out = { x: 0, y: 0, z: 0 };
  const bassHeart: Vec3Out = { x: 0, y: 0, z: 0 };
  const loudAudio: AudioReactiveState = {
    active: true,
    bass: 0.9,
    mid: 0.5,
    treble: 0.6,
    level: 0.75,
    beat: 0.85,
    sensitivity: 1.4,
  };

  const quietEnergy = sampleHeartPlanetTarget(
    1,
    1.5,
    0.4,
    0.2,
    0,
    0.5,
    1.0,
    1.0,
    SILENT_AUDIO_STATE,
    quietHeart,
  );
  const loudEnergy = sampleHeartPlanetTarget(
    1,
    1.5,
    0.4,
    0.2,
    0,
    0.5,
    1.0,
    1.0,
    loudAudio,
    bassHeart,
  );

  const quietRadius = Math.hypot(quietHeart.x, quietHeart.y - HEART_CENTER_Y, quietHeart.z);
  const loudRadius = Math.hypot(bassHeart.x, bassHeart.y - HEART_CENTER_Y, bassHeart.z);
  assert.ok(loudRadius > quietRadius * 1.2, 'heart planet should expand strongly on music bass');
  assert.ok(loudEnergy > quietEnergy, 'music bass should boost particle luminescence energy');

  const waterOut: Vec3Out = { x: 0, y: 0, z: 0 };
  sampleHeartPlanetTarget(0, 3.0, 0.5, 0.2, -0.4, 0.5, 0.4, 1.0, loudAudio, waterOut);
  assert.ok(
    Math.abs(waterOut.y - WATER_PLANE_Y) < 2.2,
    'water particles must stay anchored to the multi-layered water ripple floor',
  );
});

test('ParticleSimulation stays stable in heartPlanet mode with music beats', () => {
  const sim = new ParticleSimulation(400, 123);
  const loudAudio: AudioReactiveState = {
    active: true,
    bass: 0.85,
    mid: 0.6,
    treble: 0.7,
    level: 0.75,
    beat: 0.9,
    sensitivity: 1.5,
  };

  for (let i = 0; i < 30; i++) {
    sim.step(
      0.025,
      { ...DEFAULT_SIMULATION_PARAMS, flowMode: 'heartPlanet', particleCount: 400 },
      { active: false, pressed: false, x: 0, y: 0, z: 0, vx: 0, vy: 0 },
      loudAudio,
    );
  }

  assert.ok(sim.pulses.length >= 1, 'strong music beat should spawn concentric water pulse');
  for (let i = 0; i < 400 * 3; i++) {
    assert.equal(Number.isFinite(sim.positions[i]), true);
  }
});
