import type {
  FlowMode,
  InteractionMode,
  PointerFieldState,
  ShockwavePulse,
  Vec3Out,
} from './types';

/**
 * Smooth, allocation-free 3D trigonometric pseudo-curl noise field.
 * Produces organic, divergence-like swirling streamlines that stay smooth
 * and responsive across all frame rates without expensive permutation lookups.
 */
export function computeCurlNoise(
  x: number,
  y: number,
  z: number,
  time: number,
  scale: number,
  out: Vec3Out,
): void {
  const sx = x * scale;
  const sy = y * scale;
  const sz = z * scale;
  const t = time * 0.35;

  const ax = Math.sin(sy * 1.17 + t) * Math.cos(sz * 0.93 - t * 0.7);
  const ay = Math.sin(sz * 1.13 - t * 0.8) * Math.cos(sx * 0.97 + t * 0.6);
  const az = Math.sin(sx * 1.09 + t * 0.65) * Math.cos(sy * 1.03 - t * 0.85);

  const bx = Math.cos(sz * 1.85 + sy * 0.72 + t * 1.15) * 0.55;
  const by = Math.cos(sx * 1.79 + sz * 0.68 - t * 1.05) * 0.55;
  const bz = Math.cos(sy * 1.91 + sx * 0.74 + t * 0.95) * 0.55;

  out.x = ax + bx;
  out.y = ay + by;
  out.z = az + bz;
}

/**
 * Computes the desired base flow velocity / steering force at (x, y, z)
 * for the selected flow preset.
 */
export function sampleFlowField(
  mode: FlowMode,
  x: number,
  y: number,
  z: number,
  homeX: number,
  homeY: number,
  homeZ: number,
  seed: number,
  time: number,
  turbulence: number,
  out: Vec3Out,
): void {
  const turb = Math.max(0.05, turbulence);

  if (mode === 'nebula') {
    computeCurlNoise(x, y, z, time, 0.28, out);
    // Gentle helical swirl around Y axis + subtle radial cohesion so cloud stays lush
    const distXZ = Math.hypot(x, z) + 0.0001;
    const swirlFactor = 0.55 / (1 + distXZ * 0.08);
    const tangentX = (-z / distXZ) * swirlFactor;
    const tangentZ = (x / distXZ) * swirlFactor;

    const r = Math.hypot(x, y, z);
    const pull = r > 5.8 ? -0.32 * (r - 5.8) / (r + 0.001) : 0;

    out.x = out.x * 1.15 * turb + tangentX + x * pull;
    out.y = out.y * 0.95 * turb + Math.sin(time * 0.5 + seed * 6.2831) * 0.18 + y * pull;
    out.z = out.z * 1.15 * turb + tangentZ + z * pull;
    return;
  }

  if (mode === 'aurora') {
    // 3 flowing silk ribbon bands undulate horizontally across X
    const bandIndex = Math.floor(seed * 3); // 0, 1, 2
    const bandY = (bandIndex - 1) * 2.15;
    const bandZ = (bandIndex - 1) * 1.45;
    const waveY =
      bandY +
      Math.sin(x * 0.48 + time * 1.15 + bandIndex * 1.6) * (0.95 + 0.35 * turb) +
      Math.cos(z * 0.65 - time * 0.7) * 0.35 * turb;
    const waveZ =
      bandZ +
      Math.cos(x * 0.36 - time * 0.85 + bandIndex * 2.1) * (1.25 + 0.3 * turb);

    computeCurlNoise(x, y, z, time * 1.2, 0.34, out);
    out.x = 1.65 + out.x * 0.45 * turb;
    out.y = (waveY - y) * 1.35 + out.y * 0.55 * turb;
    out.z = (waveZ - z) * 1.15 + out.z * 0.55 * turb;
    return;
  }

  if (mode === 'orbital') {
    // Tilted planetary ring system orbiting center
    const tilt = 0.42;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    // Rotate into ring plane
    const ry = y * cosT - z * sinT;
    const rz = y * sinT + z * cosT;

    const targetRadius = 2.0 + (seed * 4.8);
    const radialDist = Math.hypot(x, rz) + 0.0001;
    const orbitalSpeed = (2.6 / Math.pow(radialDist, 0.42)) * (0.85 + 0.3 * seed);

    const radialError = targetRadius - radialDist;
    const vxPlane = (-rz / radialDist) * orbitalSpeed + (x / radialDist) * radialError * 1.15;
    const vzPlane = (x / radialDist) * orbitalSpeed + (rz / radialDist) * radialError * 1.15;
    const vyPlane = -ry * 1.6 + Math.sin(time * 1.4 + radialDist * 1.3 + seed * 6.2831) * 0.25 * turb;

    // Rotate back to world coordinates
    computeCurlNoise(x, y, z, time, 0.32, out);
    const worldVy = vyPlane * cosT + vzPlane * sinT;
    const worldVz = -vyPlane * sinT + vzPlane * cosT;

    out.x = vxPlane + out.x * 0.35 * turb;
    out.y = worldVy + out.y * 0.35 * turb;
    out.z = worldVz + out.z * 0.35 * turb;
    return;
  }

  if (mode === 'lattice') {
    // Undulating 3D wave sheet anchored to structured home coordinates
    const waveOffset =
      Math.sin(homeX * 0.65 + time * 1.35) * 0.72 * turb +
      Math.cos(homeZ * 0.65 - time * 1.1) * 0.72 * turb;
    const targetX = homeX + Math.sin(time * 0.6 + homeY * 0.8) * 0.18 * turb;
    const targetY = homeY + waveOffset;
    const targetZ = homeZ + Math.cos(time * 0.55 + homeX * 0.8) * 0.18 * turb;

    out.x = (targetX - x) * 2.1;
    out.y = (targetY - y) * 2.1;
    out.z = (targetZ - z) * 2.1;
    return;
  }

  // 'fountain': Buoyant glowing embers rising from center-bottom and blooming outward
  computeCurlNoise(x, y, z, time * 1.15, 0.36, out);
  const distXZ = Math.hypot(x, z) + 0.0001;
  const heightNorm = Math.max(0, Math.min(1, (y + 5.2) / 10.4));
  // Narrow funnel at bottom, graceful radial spread near top
  const spreadForce = (heightNorm - 0.28) * 1.35;
  const swirl = 0.62 * (1 - heightNorm * 0.45);

  out.x = (x / distXZ) * spreadForce + (-z / distXZ) * swirl + out.x * 0.85 * turb;
  out.y = 1.35 + (1 - heightNorm) * 0.85 + out.y * 0.45 * turb;
  out.z = (z / distXZ) * spreadForce + (x / distXZ) * swirl + out.z * 0.85 * turb;
}

/**
 * Computes interactive pointer force (swirl / attract / repel) on a single particle.
 * Returns normalized energy excitement [0..1] contributed by the pointer.
 */
export function computePointerForce(
  px: number,
  py: number,
  pz: number,
  pointer: PointerFieldState,
  mode: InteractionMode,
  radius: number,
  out: Vec3Out,
): number {
  out.x = 0;
  out.y = 0;
  out.z = 0;

  if (!pointer.active || radius <= 0.01) {
    return 0;
  }

  const dx = px - pointer.x;
  const dy = py - pointer.y;
  const dz = (pz - pointer.z) * 0.65; // Slightly softer Z falloff for gratifying 3D reach
  const distSq = dx * dx + dy * dy + dz * dz;
  const radiusSq = radius * radius;

  if (distSq >= radiusSq || distSq < 1e-8) {
    return 0;
  }

  const dist = Math.sqrt(distSq);
  const falloff = 1 - dist / radius;
  const smoothFalloff = falloff * falloff * (3 - 2 * falloff);
  const pressBoost = pointer.pressed ? 2.15 : 1.0;

  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;

  if (mode === 'repel') {
    const strength = 14.5 * smoothFalloff * pressBoost;
    out.x = nx * strength + pointer.vx * 0.35 * smoothFalloff;
    out.y = ny * strength + pointer.vy * 0.35 * smoothFalloff;
    out.z = nz * strength * 0.6;
  } else if (mode === 'attract') {
    // Gentle core equilibrium so particles orbit closely rather than collapsing into 1 pixel
    const coreDamp = dist < 0.45 ? -0.4 : 1.0;
    const strength = 11.5 * smoothFalloff * pressBoost * coreDamp;
    // Slight tangent spin keeps attracted clouds alive and luminous
    const spin = 3.2 * smoothFalloff * pressBoost;
    out.x = -nx * strength - ny * spin + pointer.vx * 0.4 * smoothFalloff;
    out.y = -ny * strength + nx * spin + pointer.vy * 0.4 * smoothFalloff;
    out.z = -nz * strength * 0.55;
  } else {
    // 'swirl': Tangential vortex + gentle inward containment + cursor wake drag
    const tangential = 13.0 * smoothFalloff * pressBoost;
    const radialPull = (dist > radius * 0.38 ? -3.4 : 2.6) * smoothFalloff * pressBoost;
    out.x = -ny * tangential + nx * radialPull + pointer.vx * 0.55 * smoothFalloff;
    out.y = nx * tangential + ny * radialPull + pointer.vy * 0.55 * smoothFalloff;
    out.z = (-nz * 2.2 + Math.sin(dist * 2.4) * 1.4) * smoothFalloff * pressBoost;
  }

  return Math.min(1, smoothFalloff * (pointer.pressed ? 1.35 : 0.95));
}

/**
 * Computes expanding 3D shockwave ring force from click/tap pulses.
 * Returns normalized energy excitement [0..1].
 */
export function computeShockwaveForce(
  px: number,
  py: number,
  pz: number,
  pulses: readonly ShockwavePulse[],
  out: Vec3Out,
): number {
  out.x = 0;
  out.y = 0;
  out.z = 0;
  let energy = 0;

  for (let i = 0; i < pulses.length; i++) {
    const pulse = pulses[i];
    const dx = px - pulse.x;
    const dy = py - pulse.y;
    const dz = (pz - pulse.z) * 0.7;
    const dist = Math.hypot(dx, dy, dz) + 0.0001;

    const ringThickness = 1.45;
    const delta = Math.abs(dist - pulse.radius);
    if (delta < ringThickness) {
      const lifeRatio = Math.max(0, 1 - pulse.age / pulse.duration);
      const waveProfile = 1 - delta / ringThickness;
      const impulse = pulse.strength * lifeRatio * waveProfile * waveProfile;

      out.x += (dx / dist) * impulse;
      out.y += (dy / dist) * impulse;
      out.z += (dz / dist) * impulse * 0.65;
      energy = Math.max(energy, lifeRatio * waveProfile);
    }
  }

  return Math.min(1, energy);
}
