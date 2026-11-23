import {
  computePointerForce,
  computeShockwaveForce,
  sampleFlowField,
} from './flowField';
import {
  buildHeartPlanetAnchors,
  computeHeartBobY,
  computeHeartOuterRadius,
  HEART_CENTER_Y,
  sampleHeartPlanetTarget,
  WATER_PLANE_Y,
} from './heartPlanet';
import {
  MAX_PARTICLES,
  SILENT_AUDIO_STATE,
  type AudioReactiveState,
  type PointerFieldState,
  type ShockwavePulse,
  type SimulationParams,
  type Vec3Out,
} from './types';

/**
 * Deterministic Mulberry32 PRNG so initial cloud distributions are repeatable
 * and unit tests produce deterministic results.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ParticleSimulation {
  readonly capacity: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly homes: Float32Array;
  readonly seeds: Float32Array;
  readonly sizes: Float32Array;
  readonly colorIndices: Float32Array;
  readonly energies: Float32Array;

  // Heart Planet scene anchors (0 = water ripple floor, 1 = heart planet, 2 = planetary ring)
  readonly heartRoles: Uint8Array;
  readonly heartAnchorA: Float32Array;
  readonly heartAnchorB: Float32Array;
  readonly heartAnchorC: Float32Array;
  readonly heartWaterDepth: Float32Array;

  time = 0;
  pulses: ShockwavePulse[] = [];
  private nextPulseId = 1;
  private beatPulseCooldown = 0;

  // Scratch vectors reused across every particle step (zero GC)
  private readonly flowVec: Vec3Out = { x: 0, y: 0, z: 0 };
  private readonly ptrVec: Vec3Out = { x: 0, y: 0, z: 0 };
  private readonly waveVec: Vec3Out = { x: 0, y: 0, z: 0 };

  constructor(capacity = MAX_PARTICLES, seed = 202604) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.homes = new Float32Array(capacity * 3);
    this.seeds = new Float32Array(capacity);
    this.sizes = new Float32Array(capacity);
    this.colorIndices = new Float32Array(capacity);
    this.energies = new Float32Array(capacity);

    const anchorRand = createSeededRandom(seed ^ 0x51a7c3);
    const anchors = buildHeartPlanetAnchors(capacity, anchorRand);
    this.heartRoles = anchors.roles;
    this.heartAnchorA = anchors.anchorA;
    this.heartAnchorB = anchors.anchorB;
    this.heartAnchorC = anchors.anchorC;
    this.heartWaterDepth = anchors.waterDepth;

    this.initializeParticles(seed);
  }

  initializeParticles(seed = 202604): void {
    const rand = createSeededRandom(seed);
    // Compute lattice grid dimensions for structured 'lattice' mode home positions
    const cols = 30;
    const rows = 20;
    const layers = Math.ceil(this.capacity / (cols * rows));

    for (let i = 0; i < this.capacity; i++) {
      const i3 = i * 3;
      const role = this.heartRoles[i];

      // Initialize positions directly in the Heart Planet formation so frame 1 is immediately iconic
      sampleHeartPlanetTarget(
        role,
        this.heartAnchorA[i],
        this.heartAnchorB[i],
        this.heartAnchorC[i],
        this.heartWaterDepth[i],
        rand(),
        0,
        1.0,
        SILENT_AUDIO_STATE,
        this.flowVec,
      );

      this.positions[i3] = this.flowVec.x;
      this.positions[i3 + 1] = this.flowVec.y;
      this.positions[i3 + 2] = this.flowVec.z;

      this.velocities[i3] = (rand() - 0.5) * 0.15;
      this.velocities[i3 + 1] = (rand() - 0.5) * 0.15;
      this.velocities[i3 + 2] = (rand() - 0.5) * 0.15;

      // Structured 3D grid home position for 'lattice' preset
      const layer = Math.floor(i / (cols * rows));
      const rem = i % (cols * rows);
      const row = Math.floor(rem / cols);
      const col = rem % cols;

      const hx = (col / (cols - 1) - 0.5) * 13.5;
      const hz = (row / (rows - 1) - 0.5) * 9.0;
      const hy = (layer / Math.max(1, layers - 1) - 0.5) * 4.2;

      this.homes[i3] = hx;
      this.homes[i3 + 1] = hy;
      this.homes[i3 + 2] = hz;

      this.seeds[i] = rand();
      // Power-law size distribution with slightly weightier presence for water-floor particles
      const sizeRoll = rand();
      const baseSize =
        sizeRoll > 0.91 ? 1.85 + rand() * 1.15 : 0.72 + Math.pow(sizeRoll, 1.38) * 1.08;
      this.sizes[i] = role === 0 ? baseSize * 1.24 : role === 1 ? baseSize * 0.92 : baseSize * 0.95;

      // Color stratification gives natural warm/cool separation between heart, ring, and water floor
      if (role === 1) {
        // Heart planet: warm primary + luminous highlight stops [0.00..0.38]
        this.colorIndices[i] = rand() * 0.38;
      } else if (role === 2) {
        // Planetary orbital ring: champagne/highlight shimmer [0.28..0.58]
        this.colorIndices[i] = 0.28 + rand() * 0.3;
      } else {
        // Water-ripple ground: rich twilight/secondary stops with occasional warm reflections
        this.colorIndices[i] = rand() < 0.18 ? 0.12 + rand() * 0.28 : 0.52 + rand() * 0.48;
      }

      this.energies[i] = 0;
    }
  }

  triggerPulse(x: number, y: number, z = 0, strength = 16.5): ShockwavePulse {
    const pulse: ShockwavePulse = {
      id: this.nextPulseId++,
      x,
      y,
      z,
      radius: 0.15,
      maxRadius: 9.5,
      strength,
      age: 0,
      duration: 1.55,
    };
    this.pulses.push(pulse);
    if (this.pulses.length > 6) {
      this.pulses.shift();
    }
    return pulse;
  }

  step(
    dtRaw: number,
    params: SimulationParams,
    pointer: PointerFieldState,
    audio: AudioReactiveState = SILENT_AUDIO_STATE,
  ): void {
    const dt = Math.min(Math.max(dtRaw, 0), 0.05);
    if (dt <= 0) return;

    if (params.paused) {
      return;
    }

    const audioSens = audio.active ? audio.sensitivity : 0;
    const bassBoost = audio.active ? audio.bass * audioSens : 0;
    const midBoost = audio.active ? audio.mid * audioSens : 0;
    const beatBoost = audio.active ? audio.beat * audioSens : 0;

    // Auto-trigger a gentle concentric water pulse on strong music beats
    this.beatPulseCooldown = Math.max(0, this.beatPulseCooldown - dt);
    if (audio.active && audio.beat > 0.68 && this.beatPulseCooldown <= 0) {
      this.beatPulseCooldown = 0.46;
      const pulseY = params.flowMode === 'heartPlanet' ? WATER_PLANE_Y : 0;
      this.triggerPulse(0, pulseY, 0, 9.5 + bassBoost * 5.5);
    }

    const speed = Math.max(0.1, Math.min(3.0, params.flowSpeed)) * (1 + midBoost * 0.25);
    const simDt = dt * speed;
    this.time += simDt;

    for (let p = this.pulses.length - 1; p >= 0; p--) {
      const pulse = this.pulses[p];
      pulse.age += dt;
      pulse.radius = (pulse.age / pulse.duration) * pulse.maxRadius;
      if (pulse.age >= pulse.duration) {
        this.pulses.splice(p, 1);
      }
    }

    const activeCount = Math.min(this.capacity, Math.max(100, Math.floor(params.particleCount)));
    const drag = Math.exp(-(params.flowMode === 'heartPlanet' ? 3.85 : 2.65) * dt);
    const energyDecay = Math.exp(-3.4 * dt);

    const pos = this.positions;
    const vel = this.velocities;
    const homes = this.homes;
    const seeds = this.seeds;
    const energies = this.energies;

    const heartRoles = this.heartRoles;
    const heartA = this.heartAnchorA;
    const heartB = this.heartAnchorB;
    const heartC = this.heartAnchorC;
    const heartDepth = this.heartWaterDepth;

    const flow = this.flowVec;
    const ptr = this.ptrVec;
    const wave = this.waveVec;

    const mode = params.flowMode;
    const interactionMode = params.interactionMode;
    const turbulence = params.turbulence * (1 + midBoost * 0.45);
    const radius = params.interactionRadius;
    const time = this.time;
    const heartCenterY =
      mode === 'heartPlanet' ? HEART_CENTER_Y + computeHeartBobY(time, audio) : HEART_CENTER_Y;
    const ringMinShellRadius =
      mode === 'heartPlanet' ? computeHeartOuterRadius(time, turbulence, audio) + 0.42 : 0;

    for (let i = 0; i < activeCount; i++) {
      const i3 = i * 3;
      let px = pos[i3];
      let py = pos[i3 + 1];
      let pz = pos[i3 + 2];

      let vx = vel[i3];
      let vy = vel[i3 + 1];
      let vz = vel[i3 + 2];

      let musicEnergy = 0;

      if (mode === 'heartPlanet') {
        musicEnergy = sampleHeartPlanetTarget(
          heartRoles[i],
          heartA[i],
          heartB[i],
          heartC[i],
          heartDepth[i],
          seeds[i],
          time,
          turbulence,
          audio,
          flow,
        );
        // Spring-like steering toward moving heart / ring / water-ripple target
        const stiffness = heartRoles[i] === 2 ? 6.4 : heartRoles[i] === 1 ? 5.8 : 4.8;
        flow.x = (flow.x - px) * stiffness;
        flow.y = (flow.y - py) * stiffness;
        flow.z = (flow.z - pz) * stiffness;
      } else {
        sampleFlowField(
          mode,
          px,
          py,
          pz,
          homes[i3],
          homes[i3 + 1],
          homes[i3 + 2],
          seeds[i],
          time,
          turbulence,
          flow,
        );
        // Subtle radial music breathing across all other 5 flow presets too
        if (audio.active && (bassBoost > 0.05 || beatBoost > 0.05)) {
          const r = Math.hypot(px, py, pz) + 0.001;
          const radialPulse = (bassBoost * 0.65 + beatBoost * 1.1) * Math.sin(r * 0.85 - time * 3.5);
          flow.x += (px / r) * radialPulse;
          flow.y += (py / r) * radialPulse;
          flow.z += (pz / r) * radialPulse;
          musicEnergy = Math.min(1, bassBoost * 0.55 + beatBoost * 0.45);
        }
      }

      const ptrEnergy = computePointerForce(
        px,
        py,
        pz,
        pointer,
        interactionMode,
        radius,
        ptr,
      );

      const waveEnergy =
        this.pulses.length > 0
          ? computeShockwaveForce(px, py, pz, this.pulses, wave)
          : ((wave.x = 0), (wave.y = 0), (wave.z = 0), 0);

      // Blend velocity toward flow field + additive interactive impulses
      const steerRate =
        mode === 'heartPlanet' ? 5.2 : mode === 'lattice' ? 3.2 : 2.35;
      vx += (flow.x - vx) * steerRate * Math.min(0.12, simDt) + (ptr.x + wave.x) * dt;
      vy += (flow.y - vy) * steerRate * Math.min(0.12, simDt) + (ptr.y + wave.y) * dt;
      vz += (flow.z - vz) * steerRate * Math.min(0.12, simDt) + (ptr.z + wave.z) * dt;

      // Damping & soft velocity clamp for silky stability
      vx *= drag;
      vy *= drag;
      vz *= drag;

      const speedSq = vx * vx + vy * vy + vz * vz;
      if (speedSq > 100) {
        const inv = 10 / Math.sqrt(speedSq);
        vx *= inv;
        vy *= inv;
        vz *= inv;
      }

      px += vx * simDt;
      py += vy * simDt;
      pz += vz * simDt;

      // Mode-specific seamless spatial recycling
      if (mode === 'aurora') {
        if (px > 10.5) {
          px = -10.5;
          py = (seeds[i] - 0.5) * 6.0;
          pz = (((seeds[i] * 7.13) % 1) - 0.5) * 5.0;
          vx *= 0.4;
          vy *= 0.4;
          vz *= 0.4;
        } else if (px < -10.8) {
          px = 10.2;
        }
      } else if (mode === 'fountain') {
        if (py > 5.8 || Math.hypot(px, pz) > 10.5) {
          const angle = seeds[i] * Math.PI * 2 + time * 1.7;
          const r = 0.15 + ((seeds[i] * 13.37) % 1) * 1.35;
          px = Math.cos(angle) * r;
          pz = Math.sin(angle) * r;
          py = -5.4 - ((seeds[i] * 5.1) % 1) * 1.2;
          vx = Math.cos(angle) * 0.25;
          vy = 1.45;
          vz = Math.sin(angle) * 0.25;
        }
      } else if (mode !== 'heartPlanet') {
        if (px > 11.5) px = -11.2;
        else if (px < -11.5) px = 11.2;

        if (py > 8.0) py = -7.8;
        else if (py < -8.0) py = 7.8;

        if (pz > 8.5) pz = -8.2;
        else if (pz < -8.5) pz = 8.2;
      } else {
        // Keep orbital gravity ring particles strictly outside the pulsing heart shell
        if (heartRoles[i] === 2) {
          const rx = px;
          const ry = py - heartCenterY;
          const rz = pz;
          const dist = Math.hypot(rx, ry, rz);
          if (dist < ringMinShellRadius) {
            let nx: number;
            let ny: number;
            let nz: number;
            if (dist > 1e-4) {
              nx = rx / dist;
              ny = ry / dist;
              nz = rz / dist;
            } else {
              nx = 1;
              ny = 0;
              nz = 0;
            }
            px = nx * ringMinShellRadius;
            py = heartCenterY + ny * ringMinShellRadius;
            pz = nz * ringMinShellRadius;
            const inwardRadialSpeed = vx * nx + vy * ny + vz * nz;
            if (inwardRadialSpeed < 0) {
              vx -= nx * inwardRadialSpeed;
              vy -= ny * inwardRadialSpeed;
              vz -= nz * inwardRadialSpeed;
            }
          }
        }
        // Gentle bounding clamp for heartPlanet so extreme clicks smoothly spring back
        px = Math.max(-13.5, Math.min(13.5, px));
        py = Math.max(-6.5, Math.min(7.5, py));
        pz = Math.max(-13.5, Math.min(13.5, pz));
      }

      pos[i3] = px;
      pos[i3 + 1] = py;
      pos[i3 + 2] = pz;

      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;

      const speedGlow = Math.min(0.6, Math.sqrt(speedSq) * 0.075);
      const targetEnergy = Math.min(1, Math.max(ptrEnergy, waveEnergy, musicEnergy, speedGlow));
      const prevEnergy = energies[i] * energyDecay;
      energies[i] = Math.max(prevEnergy, targetEnergy);
    }
  }
}
