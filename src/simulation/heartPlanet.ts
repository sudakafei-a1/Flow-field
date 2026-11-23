import type { AudioReactiveState, Vec3Out } from './types';

export type HeartPlanetRole = 'water' | 'heart' | 'ring';

export const WATER_PLANE_Y = -3.05;
export const HEART_CENTER_Y = 1.2;

/**
 * Implicit Taubin 3D algebraic heart function:
 * F(x, y, z) = (x^2 + (9/4)z^2 + y^2 - 1)^3 - x^2 y^3 - (9/80)z^2 y^3
 * F < 0 inside the heart, F = 0 on the exact smooth 3D heart surface.
 */
function taubinHeartField(x: number, y: number, z: number): number {
  const x2 = x * x;
  const y2 = y * y;
  const z2 = z * z;
  const a = x2 + 2.25 * z2 + y2 - 1;
  const y3 = y2 * y;
  return a * a * a - x2 * y3 - 0.1125 * z2 * y3;
}

/**
 * Evaluates a seamless point on the sculptural 3D Taubin heart surface
 * using spherical direction (u = azimuth, v = cos(polar)) + bisection.
 * Produces a plump, artifact-free 3D heart planet from every angle.
 */
export function evaluateHeartSurfacePoint(
  u: number,
  v: number,
  shellJitter: number,
  out: Vec3Out,
): void {
  // Direction on unit sphere
  const sinPhi = Math.sqrt(Math.max(0, 1 - v * v));
  const dx = sinPhi * Math.cos(u);
  const dy = v;
  const dz = sinPhi * Math.sin(u);

  // Bisect along ray (s * dx, s * dy, s * dz) to find exact F = 0 surface
  let lo = 0;
  let hi = 1.85;
  for (let iter = 0; iter < 14; iter++) {
    const mid = (lo + hi) * 0.5;
    if (taubinHeartField(mid * dx, mid * dy, mid * dz) <= 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Slight organic shell thickness so the planet feels like dense glowing stardust
  const radius = lo * (0.9 + shellJitter * 0.14);
  const worldScale = 1.98;
  out.x = dx * radius * worldScale;
  out.y = dy * radius * worldScale;
  // Give Z a slightly richer plumpness so the planet reads volumetric from 3/4 views
  out.z = dz * radius * worldScale * 1.15;
}

/**
 * Deterministically assigns each particle in [0..capacity) an anchor in the
 * Heart Planet scene:
 *  - 60% (12/20) dense, multi-layered water-ripple ground plane ("厚重" liquid-light sea)
 *  - 30% (6/20) floating 3D sculptural heart-shaped planet
 *  - 10% (2/20) tilted planetary orbital halo ring
 */
export function buildHeartPlanetAnchors(
  capacity: number,
  rand: () => number,
): {
  roles: Uint8Array; // 0 = water, 1 = heart, 2 = ring
  anchorA: Float32Array;
  anchorB: Float32Array;
  anchorC: Float32Array;
  /** Extra vertical depth stratification for multi-layer water-floor thickness */
  waterDepth: Float32Array;
} {
  const roles = new Uint8Array(capacity);
  const anchorA = new Float32Array(capacity);
  const anchorB = new Float32Array(capacity);
  const anchorC = new Float32Array(capacity);
  const waterDepth = new Float32Array(capacity);

  const tmp: Vec3Out = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < capacity; i++) {
    // Interleave uniformly across every 20 particles so any particleCount preserves exact balance
    const slot = i % 20;

    if (slot < 12) {
      // Dense, layered water-ripple ground plane (12/20 = 60%)
      roles[i] = 0;

      // Blend continuous dense field (65%) with prominent concentric ripple bands (35%)
      // so concentric water rings look thick, weighty, and unmistakable
      let radius: number;
      if (rand() < 0.38) {
        const ringBand = Math.floor(rand() * 7) + 1; // 7 luminous concentric ripple rings
        radius = ringBand * 1.38 + (rand() - 0.5) * 0.42;
      } else {
        const rNorm = Math.pow(rand(), 0.56);
        radius = 0.25 + rNorm * 10.6;
      }

      const angle = rand() * Math.PI * 2;
      const phase = rand() * Math.PI * 2;
      // Multi-layer vertical thickness: bright crest surface + thick luminous sub-surface bed
      const layerRoll = rand();
      const depth =
        layerRoll < 0.48
          ? (rand() - 0.35) * 0.18 // crisp upper wave surface
          : -0.15 - Math.pow(rand(), 0.78) * 0.85; // rich deep undercurrent sediment layer

      anchorA[i] = radius;
      anchorB[i] = angle;
      anchorC[i] = phase;
      waterDepth[i] = depth;
    } else if (slot < 18) {
      // Floating 3D Taubin heart planet (6/20 = 30%)
      roles[i] = 1;
      const u = rand() * Math.PI * 2;
      const v = rand() * 2 - 1;
      evaluateHeartSurfacePoint(u, v, rand(), tmp);
      anchorA[i] = tmp.x;
      anchorB[i] = tmp.y;
      anchorC[i] = tmp.z;
      waterDepth[i] = 0;
    } else {
      // Tilted planetary halo ring (2/20 = 10%)
      roles[i] = 2;
      const ringRadius = 3.15 + rand() * 1.2;
      const angle = rand() * Math.PI * 2;
      const thickness = (rand() - 0.5) * 0.24;
      anchorA[i] = ringRadius;
      anchorB[i] = angle;
      anchorC[i] = thickness;
      waterDepth[i] = 0;
    }
  }

  return { roles, anchorA, anchorB, anchorC, waterDepth };
}

/**
 * Computes the target world position for a single particle in the Heart Planet scene,
 * driven by time, turbulence, and real-time music reactivity (bass/mid/treble/beat).
 */
export function sampleHeartPlanetTarget(
  roleCode: number,
  a: number,
  b: number,
  c: number,
  depthOffset: number,
  seed: number,
  time: number,
  turbulence: number,
  audio: AudioReactiveState,
  out: Vec3Out,
): number {
  const sens = audio.sensitivity;
  const bass = audio.active ? audio.bass * sens : 0;
  const mid = audio.active ? audio.mid * sens : 0;
  const treble = audio.active ? audio.treble * sens : 0;
  const beat = audio.active ? audio.beat * sens : 0;

  if (roleCode === 0) {
    // Thick, multi-layered water-ripple particle sea laid flat across XZ
    const baseR = a;
    const depthFactor = 1 + depthOffset * 0.45; // deeper particles drift slightly slower for oceanic weight
    const angle = b + time * (0.045 + 0.065 / (1 + baseR * 0.35)) * Math.max(0.45, depthFactor);
    const radialBreath = Math.sin(baseR * 1.45 - time * 2.15 + c * 0.2) * (0.1 + bass * 0.24);
    const r = baseR + radialBreath;

    const wx = Math.cos(angle) * r;
    const wz = Math.sin(angle) * r;

    // Rich concentric wave ripples radiating outward from directly below the floating heart
    const waveSpeed = 2.55 + bass * 1.4;
    const wavePhase = r * 2.15 - time * waveSpeed;
    const primaryRipple =
      Math.sin(wavePhase) *
      (0.32 + bass * 0.65 + beat * 0.42) *
      Math.exp(-r * 0.062);

    const secondaryRipple =
      Math.cos(wx * 0.65 + time * 1.2) *
      Math.sin(wz * 0.65 - time * 1.0) *
      (0.14 + mid * 0.25) *
      Math.max(0.3, turbulence * 0.8);

    const microWave = Math.sin(r * 4.6 - time * 4.8 + c) * (0.04 + treble * 0.14);

    // Deeper sub-surface layers follow slightly attenuated ripples, creating tangible volume
    const rippleAtten = Math.max(0.55, 1 + depthOffset * 0.35);
    out.x = wx;
    out.y =
      WATER_PLANE_Y +
      depthOffset +
      (primaryRipple + secondaryRipple + microWave) * rippleAtten;
    out.z = wz;

    // Rich luminous wave crests + warm core reflection directly beneath the heart
    const centerReflection = Math.exp(-r * r * 0.085) * 0.32;
    const crestBoost = Math.max(0, Math.sin(wavePhase)) * 0.45 + bass * 0.38 + beat * 0.25;
    const surfaceBonus = depthOffset > -0.15 ? 0.18 : 0.08;
    return Math.min(0.95, surfaceBonus + centerReflection + crestBoost);
  }

  if (roleCode === 1) {
    // Floating 3D heart-shaped planet above the water plane
    const idlePulse = 1.0 + Math.sin(time * 2.35) * 0.035 + Math.sin(time * 4.7) * 0.015;
    const musicPulse = 1.0 + bass * 0.22 + beat * 0.2;
    const scale = idlePulse * musicPulse;

    // Graceful gentle sway (±34 deg) so the full heart silhouette stays unmistakable from front views
    const rotY = Math.sin(time * 0.42) * 0.58;
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);

    const lx = a * scale;
    const ly = b * scale;
    const lz = c * scale;

    const surfaceWave =
      1 +
      Math.sin(time * 3.0 + seed * 12.56 + ly * 1.4) *
        (0.016 * turbulence + mid * 0.045 + treble * 0.035);

    const rx = (lx * cosY + lz * sinY) * surfaceWave;
    const rz = (-lx * sinY + lz * cosY) * surfaceWave;
    const ry = ly * surfaceWave;

    const bobY = Math.sin(time * 1.15) * 0.2 + beat * 0.24;

    out.x = rx;
    out.y = HEART_CENTER_Y + ry + bobY;
    out.z = rz;

    // Balanced luminescence so the rose-gold / coral heart texture stays rich without washing out
    return Math.min(0.85, 0.22 + bass * 0.42 + beat * 0.32);
  }

  // roleCode === 2: Tilted planetary orbital ring circling the floating heart
  const ringR = a * (1.0 + bass * 0.14 + beat * 0.1);
  const orbitAngle = b + time * (0.55 + mid * 0.45);
  const px = Math.cos(orbitAngle) * ringR;
  const pz = Math.sin(orbitAngle) * ringR;
  const py = c + Math.sin(orbitAngle * 3.0 + time * 2.4) * (0.08 + treble * 0.22);

  const tiltX = 0.38;
  const tiltZ = -0.24;
  const cosX = Math.cos(tiltX);
  const sinX = Math.sin(tiltX);
  const cosZ = Math.cos(tiltZ);
  const sinZ = Math.sin(tiltZ);

  const y1 = py * cosX - pz * sinX;
  const z1 = py * sinX + pz * cosX;
  const x2 = px * cosZ - y1 * sinZ;
  const y2 = px * sinZ + y1 * cosZ;

  const bobY = Math.sin(time * 1.15) * 0.2 + beat * 0.18;

  out.x = x2;
  out.y = HEART_CENTER_Y + y2 + bobY;
  out.z = z1;

  return Math.min(0.92, 0.22 + treble * 0.55 + beat * 0.28);
}
