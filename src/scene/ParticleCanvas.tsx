import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ParticleAudioEngine } from '../audio/audioEngine';
import { HEART_CENTER_Y, WATER_PLANE_Y } from '../simulation/heartPlanet';
import { getPaletteById, hexToRgbTuple } from '../simulation/palettes';
import { createSeededRandom, ParticleSimulation } from '../simulation/particleSystem';
import {
  MAX_PARTICLES,
  type AudioReactiveState,
  type PointerFieldState,
  type SimulationParams,
} from '../simulation/types';
import {
  AMBIENT_DUST_FRAGMENT_SHADER,
  AMBIENT_DUST_VERTEX_SHADER,
  AURA_FRAGMENT_SHADER,
  AURA_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
} from './particleShaders';

export interface ParticleCanvasHandle {
  triggerCenterPulse: () => void;
  resetCamera: () => void;
  captureSnapshot: () => string | null;
}

interface ParticleCanvasProps {
  params: SimulationParams;
  audioEngine: ParticleAudioEngine;
  onPulseTriggered?: () => void;
  onAudioBands?: (bass: number, mid: number, treble: number) => void;
}

const MAX_SHOCKWAVE_RINGS = 6;

const HEART_GLOW_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HEART_GLOW_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    if (r > 1.0) discard;
    float glow = exp(-r * r * 3.8);
    gl_FragColor = vec4(uColor, glow * uOpacity);
  }
`;

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const ParticleCanvas = forwardRef<ParticleCanvasHandle, ParticleCanvasProps>(
  function ParticleCanvas({ params, audioEngine, onPulseTriggered, onAudioBands }, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const paramsRef = useRef<SimulationParams>(params);
    const audioEngineRef = useRef<ParticleAudioEngine>(audioEngine);
    const onPulseRef = useRef(onPulseTriggered);
    const onAudioBandsRef = useRef(onAudioBands);
    const [contextError, setContextError] = useState(false);

    // Imperative hooks wired inside the mount effect
    const triggerPulseFnRef = useRef<(() => void) | null>(null);
    const resetCameraFnRef = useRef<(() => void) | null>(null);
    const captureFnRef = useRef<(() => string | null) | null>(null);

    paramsRef.current = params;
    audioEngineRef.current = audioEngine;
    onPulseRef.current = onPulseTriggered;
    onAudioBandsRef.current = onAudioBands;

    useImperativeHandle(ref, () => ({
      triggerCenterPulse: () => triggerPulseFnRef.current?.(),
      resetCamera: () => resetCameraFnRef.current?.(),
      captureSnapshot: () => captureFnRef.current?.() ?? null,
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareWebGL();
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          alpha: false,
          preserveDrawingBuffer: false,
        });
      } catch {
        setContextError(true);
        return;
      }

      const pixelRatio = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = false;

      const canvas = renderer.domElement;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.touchAction = 'none';
      canvas.setAttribute('data-testid', 'particle-canvas');
      canvas.setAttribute('aria-label', '交互式三维悬浮粒子流场画布，移动鼠标搅动粒子，点击释放脉冲波');
      container.appendChild(canvas);

      // Scene & Camera
      const initialPalette = getPaletteById(paramsRef.current.paletteId);
      const scene = new THREE.Scene();
      const bgColor = new THREE.Color(initialPalette.backgroundHex);
      const targetBgColor = new THREE.Color(initialPalette.backgroundHex);
      scene.background = bgColor;
      scene.fog = new THREE.FogExp2(initialPalette.fogHex, 0.028);

      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
      const initialIsHeart = paramsRef.current.flowMode === 'heartPlanet';
      camera.position.set(0, initialIsHeart ? 2.6 : 0.35, initialIsHeart ? 12.6 : 11.8);
      camera.lookAt(0, initialIsHeart ? -0.45 : 0, 0);

      // Initialize pure simulation engine and pre-warm 35 steps so frame 1 is immediately flowing
      const sim = new ParticleSimulation(MAX_PARTICLES, 202604);
      const pointer: PointerFieldState = {
        active: false,
        pressed: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
      };
      const audioState: AudioReactiveState = {
        active: false,
        bass: 0,
        mid: 0,
        treble: 0,
        level: 0,
        beat: 0,
        sensitivity: paramsRef.current.musicSensitivity,
      };
      for (let w = 0; w < 35; w++) {
        sim.step(0.025, paramsRef.current, pointer, audioState);
      }

      // Primary flowing particle system geometry
      const particleGeo = new THREE.BufferGeometry();
      const positionAttr = new THREE.BufferAttribute(sim.positions, 3);
      positionAttr.setUsage(THREE.DynamicDrawUsage);
      const energyAttr = new THREE.BufferAttribute(sim.energies, 1);
      energyAttr.setUsage(THREE.DynamicDrawUsage);

      particleGeo.setAttribute('position', positionAttr);
      particleGeo.setAttribute('aSize', new THREE.BufferAttribute(sim.sizes, 1));
      particleGeo.setAttribute('aSeed', new THREE.BufferAttribute(sim.seeds, 1));
      particleGeo.setAttribute('aColorIdx', new THREE.BufferAttribute(sim.colorIndices, 1));
      particleGeo.setAttribute('aEnergy', energyAttr);
      particleGeo.setDrawRange(0, paramsRef.current.particleCount);

      const paletteColors = initialPalette.colors.map((hex) => new THREE.Color(hex));
      const targetPaletteColors = initialPalette.colors.map((hex) => new THREE.Color(hex));

      const particleMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: pixelRatio },
          uBaseSize: { value: 8.6 },
          uColor0: { value: paletteColors[0] },
          uColor1: { value: paletteColors[1] },
          uColor2: { value: paletteColors[2] },
          uColor3: { value: paletteColors[3] },
          uIsLight: { value: initialPalette.isLight ? 1.0 : 0.0 },
        },
        vertexShader: PARTICLE_VERTEX_SHADER,
        fragmentShader: PARTICLE_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: initialPalette.isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
      });

      const particlesPoints = new THREE.Points(particleGeo, particleMat);
      particlesPoints.frustumCulled = false;
      scene.add(particlesPoints);

      // Soft warm inner core glow for the floating Heart Planet (pulses with music bass!)
      const heartGlowGeo = new THREE.PlaneGeometry(5.8, 5.8);
      const heartGlowMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(initialPalette.colors[0]) },
          uOpacity: { value: initialIsHeart && !initialPalette.isLight ? 0.28 : 0 },
        },
        vertexShader: HEART_GLOW_VERTEX_SHADER,
        fragmentShader: HEART_GLOW_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const heartGlowMesh = new THREE.Mesh(heartGlowGeo, heartGlowMat);
      heartGlowMesh.position.set(0, HEART_CENTER_Y, 0);
      heartGlowMesh.visible = initialIsHeart && !initialPalette.isLight;
      scene.add(heartGlowMesh);

      // Subtle atmospheric deep-water reflection bed beneath the bottom ripple layer
      const waterBedGeo = new THREE.PlaneGeometry(18.5, 18.5);
      const waterBedMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(initialPalette.colors[2]) },
          uOpacity: { value: initialIsHeart && !initialPalette.isLight ? 0.2 : 0 },
        },
        vertexShader: HEART_GLOW_VERTEX_SHADER,
        fragmentShader: HEART_GLOW_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const waterBedMesh = new THREE.Mesh(waterBedGeo, waterBedMat);
      waterBedMesh.position.set(0, WATER_PLANE_Y - 0.25, 0);
      waterBedMesh.rotation.x = -Math.PI / 2;
      waterBedMesh.visible = initialIsHeart && !initialPalette.isLight;
      scene.add(waterBedMesh);

      // Subtle velocity flow trails (single draw call for 720 hero particles)
      const trailCount = 720;
      const trailPositions = new Float32Array(trailCount * 2 * 3);
      const trailColors = new Float32Array(trailCount * 2 * 3);
      const trailGeo = new THREE.BufferGeometry();
      const trailPosAttr = new THREE.BufferAttribute(trailPositions, 3);
      trailPosAttr.setUsage(THREE.DynamicDrawUsage);
      const trailColAttr = new THREE.BufferAttribute(trailColors, 3);
      trailColAttr.setUsage(THREE.DynamicDrawUsage);
      trailGeo.setAttribute('position', trailPosAttr);
      trailGeo.setAttribute('color', trailColAttr);

      const trailMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: initialPalette.isLight ? 0.24 : 0.34,
        depthWrite: false,
        blending: initialPalette.isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
      });
      const flowTrails = new THREE.LineSegments(trailGeo, trailMat);
      flowTrails.frustumCulled = false;
      scene.add(flowTrails);

      // Ambient distant micro-dust for 3D depth parallax
      const dustCount = 420;
      const dustPos = new Float32Array(dustCount * 3);
      const dustSeeds = new Float32Array(dustCount);
      const dustRand = createSeededRandom(918273);
      for (let i = 0; i < dustCount; i++) {
        dustPos[i * 3] = (dustRand() - 0.5) * 34;
        dustPos[i * 3 + 1] = (dustRand() - 0.5) * 22;
        dustPos[i * 3 + 2] = -6 - dustRand() * 18;
        dustSeeds[i] = dustRand();
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
      dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeeds, 1));
      const dustMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: pixelRatio },
          uDustColor: { value: new THREE.Color(initialPalette.colors[2]) },
        },
        vertexShader: AMBIENT_DUST_VERTEX_SHADER,
        fragmentShader: AMBIENT_DUST_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: initialPalette.isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
      });
      const ambientDust = new THREE.Points(dustGeo, dustMat);
      ambientDust.frustumCulled = false;
      scene.add(ambientDust);

      // Pointer force-field aura mesh
      const auraGeo = new THREE.PlaneGeometry(2, 2);
      const auraMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(initialPalette.ringHex) },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uMode: { value: 0 },
        },
        vertexShader: AURA_VERTEX_SHADER,
        fragmentShader: AURA_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: initialPalette.isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
      });
      const auraMesh = new THREE.Mesh(auraGeo, auraMat);
      auraMesh.visible = false;
      scene.add(auraMesh);

      // Pooled shockwave pulse rings
      const ringGeo = new THREE.RingGeometry(0.92, 1.0, 56);
      const shockwaveMeshes: THREE.Mesh[] = [];
      for (let i = 0; i < MAX_SHOCKWAVE_RINGS; i++) {
        const ringMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(initialPalette.ringHex),
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: initialPalette.isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(ringGeo, ringMat);
        mesh.visible = false;
        scene.add(mesh);
        shockwaveMeshes.push(mesh);
      }

      // Reusable scratch math objects (zero GC in loop)
      const raycaster = new THREE.Raycaster();
      const pointerNdc = new THREE.Vector2();
      const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersectPoint = new THREE.Vector3();
      const camNormal = new THREE.Vector3();
      const originPoint = new THREE.Vector3(0, 0, 0);
      const tempColor = new THREE.Color();

      // Camera spherical orbit & smooth pointer parallax state
      let orbitAzimuth = 0;
      let targetAzimuth = 0;
      let orbitElevation = initialIsHeart ? 0.24 : 0.04;
      let targetElevation = initialIsHeart ? 0.24 : 0.04;
      let cameraDistance = initialIsHeart ? 12.6 : 11.8;
      let targetDistance = initialIsHeart ? 12.6 : 11.8;
      let lookTargetY = initialIsHeart ? -0.45 : 0;
      let parallaxX = 0;
      let parallaxY = 0;
      let isRightDragging = false;
      let lastDragX = 0;
      let lastDragY = 0;
      let auraOpacity = 0;
      let lastPaletteId = initialPalette.id;
      let lastFlowMode = paramsRef.current.flowMode;
      let lastAudioReportMs = 0;

      const projectPointerToWorld = (clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
        pointerNdc.set(nx, ny);
        parallaxX = nx;
        parallaxY = ny;

        // Intersect plane passing through origin facing the camera
        camera.getWorldDirection(camNormal).negate();
        interactionPlane.setFromNormalAndCoplanarPoint(camNormal, originPoint);
        raycaster.setFromCamera(pointerNdc, camera);

        if (raycaster.ray.intersectPlane(interactionPlane, intersectPoint)) {
          const prevX = pointer.active ? pointer.x : intersectPoint.x;
          const prevY = pointer.active ? pointer.y : intersectPoint.y;
          pointer.vx = THREE.MathUtils.clamp((intersectPoint.x - prevX) * 26, -18, 18);
          pointer.vy = THREE.MathUtils.clamp((intersectPoint.y - prevY) * 26, -18, 18);
          pointer.x = intersectPoint.x;
          pointer.y = intersectPoint.y;
          pointer.z = intersectPoint.z;
          pointer.active = true;
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        if (isRightDragging) {
          const dx = e.clientX - lastDragX;
          const dy = e.clientY - lastDragY;
          lastDragX = e.clientX;
          lastDragY = e.clientY;
          targetAzimuth -= dx * 0.0055;
          targetElevation = THREE.MathUtils.clamp(targetElevation + dy * 0.0045, -0.75, 0.75);
          return;
        }
        projectPointerToWorld(e.clientX, e.clientY);
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.button === 2) {
          isRightDragging = true;
          lastDragX = e.clientX;
          lastDragY = e.clientY;
          return;
        }
        projectPointerToWorld(e.clientX, e.clientY);
        pointer.pressed = true;
        sim.triggerPulse(pointer.x, pointer.y, pointer.z, 17.5);
        onPulseRef.current?.();
      };

      const onPointerUp = () => {
        pointer.pressed = false;
        isRightDragging = false;
      };

      const onPointerLeave = () => {
        pointer.active = false;
        pointer.pressed = false;
        isRightDragging = false;
        parallaxX = 0;
        parallaxY = 0;
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        targetDistance = THREE.MathUtils.clamp(targetDistance + e.deltaY * 0.006, 6.8, 18.5);
      };

      const onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
      };

      const onContextLost = (e: Event) => {
        e.preventDefault();
        setContextError(true);
      };

      const onContextRestored = () => {
        setContextError(false);
      };

      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('contextmenu', onContextMenu);
      canvas.addEventListener('webglcontextlost', onContextLost);
      canvas.addEventListener('webglcontextrestored', onContextRestored);

      const onResize = () => {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      // Expose imperative handles
      triggerPulseFnRef.current = () => {
        const isHeart = paramsRef.current.flowMode === 'heartPlanet';
        sim.triggerPulse(0, isHeart ? WATER_PLANE_Y : 0, 0, 19.0);
        onPulseRef.current?.();
      };

      resetCameraFnRef.current = () => {
        const isHeart = paramsRef.current.flowMode === 'heartPlanet';
        targetAzimuth = 0;
        targetElevation = isHeart ? 0.24 : 0.04;
        targetDistance = isHeart ? 12.6 : 11.8;
      };

      captureFnRef.current = () => {
        try {
          renderer.render(scene, camera);
          return canvas.toDataURL('image/png');
        } catch {
          return null;
        }
      };

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      // Animation loop with software-WebGL afterDraw pacing
      let disposed = false;
      let rafId = 0;
      let timerId = 0;
      let lastTimestamp = performance.now();

      const afterDraw = (cb: () => void) => {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) {
              if (sync) gl.deleteSync(sync);
              return;
            }
            const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
            if (status === gl.UNSIGNALED) {
              timerId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              timerId = window.setTimeout(cb, 80);
            }
          };
          timerId = window.setTimeout(poll, 5);
        } else {
          timerId = window.setTimeout(cb, 80);
        }
      };

      const tick = () => {
        if (disposed) return;

        const now = performance.now();
        const wallDt = Math.max(0.001, (now - lastTimestamp) / 1000);
        const dt = Math.min(0.05, wallDt);
        lastTimestamp = now;

        const currentParams = paramsRef.current;
        const palette = getPaletteById(currentParams.paletteId);

        // Smooth palette transitions (use wallDt so theme switches finish swiftly even on software WebGL)
        if (palette.id !== lastPaletteId) {
          lastPaletteId = palette.id;
          targetBgColor.set(palette.backgroundHex);
          for (let c = 0; c < 4; c++) {
            targetPaletteColors[c].set(palette.colors[c]);
          }
          const blending = palette.isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
          particleMat.blending = blending;
          trailMat.blending = blending;
          trailMat.opacity = palette.isLight ? 0.22 : 0.34;
          dustMat.blending = blending;
          auraMat.blending = blending;
          for (const ring of shockwaveMeshes) {
            (ring.material as THREE.MeshBasicMaterial).blending = blending;
          }
          particleMat.needsUpdate = true;
          trailMat.needsUpdate = true;
          dustMat.needsUpdate = true;
          auraMat.needsUpdate = true;
        }

        const colorLerp = 1 - Math.exp(-9.5 * Math.min(wallDt, 0.25));
        bgColor.lerp(targetBgColor, colorLerp);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.copy(bgColor);
        }
        for (let c = 0; c < 4; c++) {
          paletteColors[c].lerp(targetPaletteColors[c], colorLerp);
        }
        particleMat.uniforms.uIsLight.value = THREE.MathUtils.lerp(
          particleMat.uniforms.uIsLight.value,
          palette.isLight ? 1.0 : 0.0,
          colorLerp,
        );
        tempColor.set(palette.colors[2]);
        dustMat.uniforms.uDustColor.value.lerp(tempColor, colorLerp);
        tempColor.set(palette.ringHex);
        auraMat.uniforms.uColor.value.lerp(tempColor, colorLerp);

        // Adapt camera framing smoothly when entering/leaving Heart Planet scene
        if (currentParams.flowMode !== lastFlowMode) {
          lastFlowMode = currentParams.flowMode;
          if (currentParams.flowMode === 'heartPlanet') {
            targetElevation = 0.24;
            targetDistance = 12.6;
          } else {
            targetElevation = 0.04;
            targetDistance = 11.8;
          }
        }

        // Sample real-time music spectrum & beat envelope
        audioEngineRef.current.sample(dt, currentParams.musicSensitivity, audioState);
        if (onAudioBandsRef.current && now - lastAudioReportMs >= 95) {
          lastAudioReportMs = now;
          onAudioBandsRef.current(audioState.bass, audioState.mid, audioState.treble);
        }

        // Decay pointer velocity smoothly between move events
        pointer.vx *= Math.exp(-9 * dt);
        pointer.vy *= Math.exp(-9 * dt);

        // Step simulation
        const effectiveParams =
          prefersReducedMotion && !currentParams.paused
            ? { ...currentParams, flowSpeed: currentParams.flowSpeed * 0.45 }
            : currentParams;
        sim.step(dt, effectiveParams, pointer, audioState);

        // Sync active draw count & GPU buffers
        const drawCount = Math.min(MAX_PARTICLES, Math.max(100, Math.floor(currentParams.particleCount)));
        particleGeo.setDrawRange(0, drawCount);
        positionAttr.needsUpdate = true;
        energyAttr.needsUpdate = true;

        // Update floating Heart Planet warm core glow & deep water-floor reflection bed
        const isHeartMode = currentParams.flowMode === 'heartPlanet';
        const showHeartGlow = isHeartMode && !palette.isLight;
        heartGlowMesh.visible = showHeartGlow;
        waterBedMesh.visible = showHeartGlow;
        if (showHeartGlow) {
          const sens = audioState.active ? audioState.sensitivity : 0;
          const heartPulse = 1 + (audioState.bass * 0.22 + audioState.beat * 0.18) * sens;
          const bobY = Math.sin(sim.time * 1.15) * 0.2 + audioState.beat * sens * 0.24;
          heartGlowMesh.position.set(0, HEART_CENTER_Y + bobY, 0);
          heartGlowMesh.quaternion.copy(camera.quaternion);
          heartGlowMesh.scale.set(heartPulse, heartPulse, 1);
          heartGlowMat.uniforms.uColor.value.copy(paletteColors[0]);
          heartGlowMat.uniforms.uOpacity.value = Math.min(
            0.38,
            0.18 + (audioState.bass * 0.14 + audioState.beat * 0.12) * sens,
          );

          const bedScale = 1 + (audioState.bass * 0.16 + audioState.beat * 0.12) * sens;
          waterBedMesh.scale.set(bedScale, bedScale, 1);
          waterBedMat.uniforms.uColor.value.copy(paletteColors[2]);
          waterBedMat.uniforms.uOpacity.value = Math.min(
            0.34,
            0.18 + (audioState.bass * 0.12 + audioState.beat * 0.08) * sens,
          );
        }

        // Update velocity-aligned light filaments for directional flow clarity
        const activeTrails = Math.min(trailCount, drawCount);
        const stride = Math.max(1, Math.floor(drawCount / activeTrails));
        const pCol0 = paletteColors[0];
        const pCol2 = paletteColors[2];
        const bgR = bgColor.r;
        const bgG = bgColor.g;
        const bgB = bgColor.b;
        for (let t = 0; t < activeTrails; t++) {
          const idx = t * stride;
          const i3 = idx * 3;
          const t6 = t * 6;
          const px = sim.positions[i3];
          const py = sim.positions[i3 + 1];
          const pz = sim.positions[i3 + 2];
          const vx = sim.velocities[i3];
          const vy = sim.velocities[i3 + 1];
          const vz = sim.velocities[i3 + 2];
          const trailLen = 0.22 + sim.energies[idx] * 0.26;

          trailPositions[t6] = px;
          trailPositions[t6 + 1] = py;
          trailPositions[t6 + 2] = pz;
          trailPositions[t6 + 3] = px - vx * trailLen;
          trailPositions[t6 + 4] = py - vy * trailLen;
          trailPositions[t6 + 5] = pz - vz * trailLen;

          const mixT = sim.colorIndices[idx];
          const cr = pCol0.r * (1 - mixT) + pCol2.r * mixT;
          const cg = pCol0.g * (1 - mixT) + pCol2.g * mixT;
          const cb = pCol0.b * (1 - mixT) + pCol2.b * mixT;

          // Head bright, tail fades smoothly to background / zero
          trailColors[t6] = cr;
          trailColors[t6 + 1] = cg;
          trailColors[t6 + 2] = cb;
          trailColors[t6 + 3] = palette.isLight ? bgR : 0;
          trailColors[t6 + 4] = palette.isLight ? bgG : 0;
          trailColors[t6 + 5] = palette.isLight ? bgB : 0;
        }
        trailGeo.setDrawRange(0, activeTrails * 2);
        trailPosAttr.needsUpdate = true;
        trailColAttr.needsUpdate = true;

        particleMat.uniforms.uTime.value = sim.time;
        dustMat.uniforms.uTime.value = sim.time;

        // Update subtle cursor aura
        const targetAuraOpacity = pointer.active ? (pointer.pressed ? 0.58 : 0.34) : 0;
        auraOpacity = THREE.MathUtils.damp(auraOpacity, targetAuraOpacity, 8, dt);
        if (auraOpacity > 0.01) {
          auraMesh.visible = true;
          auraMesh.position.set(pointer.x, pointer.y, pointer.z);
          auraMesh.quaternion.copy(camera.quaternion);
          const auraScale = currentParams.interactionRadius * (pointer.pressed ? 0.72 : 0.58);
          auraMesh.scale.set(auraScale, auraScale, 1);
          auraMat.uniforms.uOpacity.value = auraOpacity;
          auraMat.uniforms.uTime.value = sim.time;
          auraMat.uniforms.uMode.value =
            currentParams.interactionMode === 'swirl'
              ? 0
              : currentParams.interactionMode === 'attract'
                ? 1
                : 2;
        } else {
          auraMesh.visible = false;
        }

        // Update pooled shockwave pulse rings
        const [rr, rg, rb] = hexToRgbTuple(palette.ringHex);
        for (let i = 0; i < MAX_SHOCKWAVE_RINGS; i++) {
          const ring = shockwaveMeshes[i];
          const pulse = sim.pulses[i];
          if (pulse) {
            ring.visible = true;
            ring.position.set(pulse.x, pulse.y, pulse.z);
            // Lay beat/water pulses flat on the horizontal water plane in heartPlanet mode
            if (isHeartMode && Math.abs(pulse.y - WATER_PLANE_Y) < 0.35) {
              ring.rotation.set(-Math.PI / 2, 0, 0);
            } else {
              ring.quaternion.copy(camera.quaternion);
            }
            const s = Math.max(0.15, pulse.radius);
            ring.scale.set(s, s, 1);
            const mat = ring.material as THREE.MeshBasicMaterial;
            mat.color.setRGB(rr, rg, rb);
            const life = Math.max(0, 1 - pulse.age / pulse.duration);
            mat.opacity = life * life * (palette.isLight ? 0.42 : 0.55);
          } else {
            ring.visible = false;
          }
        }

        // Smooth camera orbit + subtle pointer parallax
        if (currentParams.autoOrbit && !currentParams.paused && !isRightDragging && !prefersReducedMotion) {
          targetAzimuth += dt * 0.075;
        }
        orbitAzimuth = THREE.MathUtils.damp(orbitAzimuth, targetAzimuth, 5.2, dt);
        orbitElevation = THREE.MathUtils.damp(orbitElevation, targetElevation, 5.2, dt);
        cameraDistance = THREE.MathUtils.damp(cameraDistance, targetDistance, 5.2, dt);
        lookTargetY = THREE.MathUtils.damp(lookTargetY, isHeartMode ? -0.45 : 0, 5.2, dt);

        const finalAzimuth = orbitAzimuth + parallaxX * 0.14;
        const finalElevation = THREE.MathUtils.clamp(orbitElevation + parallaxY * 0.1, -0.85, 0.85);
        camera.position.x = Math.sin(finalAzimuth) * Math.cos(finalElevation) * cameraDistance;
        camera.position.y = Math.sin(finalElevation) * cameraDistance;
        camera.position.z = Math.cos(finalAzimuth) * Math.cos(finalElevation) * cameraDistance;
        camera.lookAt(0, lookTargetY, 0);

        renderer.render(scene, camera);

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          rafId = requestAnimationFrame(tick);
        }
      };

      tick();

      return () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        clearTimeout(timerId);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('contextmenu', onContextMenu);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);

        particleGeo.dispose();
        particleMat.dispose();
        heartGlowGeo.dispose();
        heartGlowMat.dispose();
        waterBedGeo.dispose();
        waterBedMat.dispose();
        trailGeo.dispose();
        trailMat.dispose();
        dustGeo.dispose();
        dustMat.dispose();
        auraGeo.dispose();
        auraMat.dispose();
        ringGeo.dispose();
        for (const ring of shockwaveMeshes) {
          (ring.material as THREE.Material).dispose();
        }
        renderer.dispose();
        if (canvas.parentElement === container) {
          container.removeChild(canvas);
        }
      };
    }, []);

    const palette = getPaletteById(params.paletteId);

    return (
      <div
        className="relative w-full h-full overflow-hidden"
        style={{ backgroundColor: palette.backgroundHex }}
      >
        {/* Dedicated empty mount div for Three.js WebGL canvas */}
        <div ref={mountRef} className="w-full h-full" />

        {/* Graceful fallback if WebGL context is unavailable */}
        {contextError && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
            style={{
              background: palette.isLight
                ? 'radial-gradient(circle at center, #FAF8F2 0%, #ECE6D8 100%)'
                : 'radial-gradient(circle at center, #121A33 0%, #060913 100%)',
              color: palette.isLight ? '#1E293B' : '#F8FAFC',
            }}
          >
            <h2 className="text-xl font-semibold mb-2">WebGL 渲染上下文暂不可用</h2>
            <p className="text-sm opacity-75 max-w-md">
              当前浏览器环境未能初始化三维图形上下文，请检查硬件加速设置或刷新页面重试。
            </p>
          </div>
        )}
      </div>
    );
  },
);
