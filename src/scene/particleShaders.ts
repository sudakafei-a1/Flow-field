export const PARTICLE_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uBaseSize;
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uIsLight;

  attribute float aSize;
  attribute float aSeed;
  attribute float aColorIdx;
  attribute float aEnergy;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vEnergy;
  varying float vSoftness;

  vec3 samplePalette(float t) {
    float x = clamp(t, 0.0, 1.0) * 3.0;
    if (x < 1.0) {
      return mix(uColor0, uColor1, x);
    } else if (x < 2.0) {
      return mix(uColor1, uColor2, x - 1.0);
    }
    return mix(uColor2, uColor3, x - 2.0);
  }

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(1.2, -mvPosition.z);

    // Subtle organic shimmer
    float twinkle = 0.78 + 0.22 * sin(uTime * (1.4 + aSeed * 1.8) + aSeed * 62.8318);

    // Shift color slightly along palette with kinetic energy
    vec3 baseCol = samplePalette(fract(aColorIdx + aEnergy * 0.14));
    vec3 boostCol = mix(uColor1, vec3(1.0, 0.98, 0.95), 0.65);
    vColor = uIsLight > 0.5
      ? mix(baseCol, uColor2, aEnergy * 0.55)
      : mix(baseCol, boostCol, aEnergy * 0.6);

    // Depth-of-field bokeh softness: mid-plane crisp, far/near softly diffused
    float focusDist = 11.5;
    float defocus = clamp(abs(dist - focusDist) / 11.0, 0.0, 1.0);
    vSoftness = 0.16 + defocus * 0.36;

    float depthFade = smoothstep(26.0, 6.2, dist) * smoothstep(1.4, 4.0, dist);
    float baseAlpha = uIsLight > 0.5 ? 0.72 : 0.88;
    vAlpha = clamp(depthFade * twinkle * (baseAlpha + aEnergy * 0.25), 0.0, 1.0);
    vEnergy = aEnergy;

    float themeScale = uIsLight > 0.5 ? 0.62 : 1.0;
    float pointSize = (uBaseSize * themeScale * aSize * (1.0 + aEnergy * 0.42)) * (13.0 / dist) * uPixelRatio;
    gl_PointSize = clamp(pointSize, 1.4, 24.0 * uPixelRatio);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uIsLight;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vEnergy;
  varying float vSoftness;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float r = length(centered) * 2.0;
    if (r > 1.0) discard;

    if (uIsLight > 0.5) {
      // Crisp, delicate floating ink & bronze dust specks on warm paper
      float core = 1.0 - smoothstep(0.0, 0.58, r);
      float rim = (1.0 - smoothstep(0.35, 1.0, r)) * 0.32;
      float alpha = (core * 0.82 + rim) * vAlpha;
      gl_FragColor = vec4(vColor, alpha);
    } else {
      // Incandescent pinpoint core + delicate optical bokeh halo
      float halo = exp(-r * r * (4.6 - vSoftness * 1.6));
      float core = exp(-r * r * 16.5);
      float intensity = halo * 0.52 + core * (0.85 + vEnergy * 0.55);
      vec3 finalCol = vColor * (0.98 + core * 0.55 + vEnergy * 0.35);
      gl_FragColor = vec4(finalCol, clamp(intensity * vAlpha, 0.0, 1.0));
    }
  }
`;

export const AMBIENT_DUST_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    pos.y += sin(uTime * 0.25 + aSeed * 18.0) * 0.35;
    pos.x += cos(uTime * 0.2 + aSeed * 14.0) * 0.35;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float dist = max(3.0, -mvPosition.z);
    vAlpha = (0.18 + 0.22 * sin(uTime * 0.9 + aSeed * 31.4)) * smoothstep(38.0, 10.0, dist);
    gl_PointSize = clamp((16.0 / dist) * uPixelRatio, 1.0, 5.0 * uPixelRatio);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const AMBIENT_DUST_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uDustColor;
  varying float vAlpha;

  void main() {
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (r > 1.0) discard;
    float a = (1.0 - r * r) * vAlpha;
    gl_FragColor = vec4(uDustColor, a);
  }
`;

export const AURA_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const AURA_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uMode; // 0 = swirl, 1 = attract, 2 = repel
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;

    float angle = atan(p.y, p.x);
    float ring = exp(-pow((r - 0.72) * 8.5, 2.0));
    float innerGlow = exp(-r * r * 5.0) * 0.22;

    float pattern = 1.0;
    if (uMode < 0.5) {
      // Swirl arcs
      pattern = 0.65 + 0.35 * sin(angle * 3.0 - uTime * 3.2);
    } else if (uMode < 1.5) {
      // Attract subtle concentric ripple
      pattern = 0.6 + 0.4 * sin(r * 12.0 + uTime * 4.0);
    } else {
      // Repel crisp outer boundary
      pattern = 0.7 + 0.3 * cos(r * 10.0 - uTime * 4.5);
    }

    float alpha = (ring * 0.52 * pattern + innerGlow) * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;
