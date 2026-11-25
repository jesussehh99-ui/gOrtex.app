import type {
  CameraMotionPreset,
  ScriptScene,
  ShotType,
  ViralScript,
} from '../types';
import { hashSeed32 } from './deterministicPrng';
import { generateFallbackDepthMap } from './localDepthEngine';

export type CinematicColorGradeId =
  | 'teal_noir'
  | 'bleach_bypass'
  | 'warm_kodak'
  | 'cyber_cold';

export type ShaderTransitionMode = 'whip_pan' | 'zoom_through' | 'light_leak';

export interface WebGLBeatVisualSlot {
  key: string;
  colorSource: ImageBitmap | HTMLCanvasElement | OffscreenCanvas | null;
  depthSource?: ImageBitmap | HTMLCanvasElement | OffscreenCanvas | null;
}

export interface WebGLSceneRenderInput {
  width: number;
  height: number;
  currentSlot: WebGLBeatVisualSlot;
  transitionSlot?: WebGLBeatVisualSlot | null;
  /** Progreso normalizado [0..1] de la transición física saliente->entrante (0 = sin transición o ya terminada). */
  transitionProgress: number;
  transitionMode?: ShaderTransitionMode;
  scene?: ScriptScene;
  script?: ViralScript;
  beatIndex: number;
  frameIndex: number;
  localElapsed: number;
  sceneDuration: number;
  voiceRms: number;
  impactTransient: number;
  accentColor: string;
  focalPointA?: { x: number; y: number };
  focalPointB?: { x: number; y: number };
  /** Modo comercial editorial (luz cálida limpia, sin grano oscuro ni aberración cromática) */
  isCommercial?: boolean;
  /** Micro-crop ~5% (1.05) solo en imágenes generadas por IA; 1.0 en fotos reales del usuario */
  aiMicroCropA?: number;
  aiMicroCropB?: number;
}

const CAMERA_PRESET_INDEX: Record<CameraMotionPreset, number> = {
  dolly_in: 0,
  dolly_out: 1,
  orbit_left: 2,
  orbit_right: 3,
  handheld_tension: 4,
  rack_focus_reveal: 5,
  push_impact: 6,
};

const SHOT_TYPE_INDEX: Record<ShotType, number> = {
  WIDE_ESTABLISHING: 0,
  MEDIUM_ACTION: 1,
  CLOSE_UP_EMOTION: 2,
  EXTREME_CLOSE_UP: 3,
  LOW_ANGLE_DRAMATIC: 4,
  OVER_THE_SHOULDER: 5,
  POV_FIRST_PERSON: 6,
};

const COLOR_GRADE_INDEX: Record<CinematicColorGradeId, number> = {
  teal_noir: 0,
  bleach_bypass: 1,
  warm_kodak: 2,
  cyber_cold: 3,
};

const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;

const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);

out vec2 v_uv;

void main() {
  vec2 pos = POSITIONS[gl_VertexID];
  v_uv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_colorTexA;
uniform sampler2D u_depthTexA;
uniform sampler2D u_colorTexB;
uniform sampler2D u_depthTexB;
uniform sampler2D u_titleTex;

uniform vec2  u_resolution;
uniform float u_imageAspectA;
uniform float u_imageAspectB;
uniform vec2  u_focalPointA;
uniform vec2  u_focalPointB;
uniform float u_time;             // t normalizado [0..1] en el beat
uniform float u_beatElapsedSec;   // segundos locales en el beat
uniform float u_frameIndex;       // índice de frame entero a 30fps (determinista)
uniform float u_seed;             // semilla determinista derivada de projectSeed + beatIndex
uniform float u_voiceRms;         // [0..1] energía de narración
uniform float u_impactTransient;  // [0..1] picos de foley / impacto

uniform int   u_cameraPreset;     // 0..6 BeatV2.cameraMotion
uniform int   u_shotType;         // 0..6 BeatV2.shotType
uniform float u_focusDepth;       // [0..1] plano focal
uniform float u_aperture;         // [0..1] intensidad DoF
uniform int   u_colorGradeMode;   // 0 Teal&Noir, 1 Bleach, 2 WarmKodak, 3 CyberCold
uniform int   u_particleTheme;    // 0 dust, 1 bubbles, 2 space, 3 embers
uniform vec3  u_moodGlowColor;
uniform vec3  u_accentColor;

uniform float u_hasTransition;    // 0 o 1
uniform float u_transitionT;      // 0..1 (0 = saliente B, 1 = entrante A)
uniform int   u_transitionMode;   // 0 whip_pan, 1 zoom_through, 2 light_leak

uniform float u_hasDepthTitle;    // 0 o 1
uniform float u_titleOpacity;     // 0..1 entrada/salida suave
uniform float u_titleMaskThresh;  // 0.58 umbral de oclusión de primer plano
uniform float u_isCommercial;     // 1.0 en modo Comercial & Bienes Raíces, 0.0 en Viral
uniform float u_aiMicroCropA;     // 1.05 en imágenes IA, 1.0 en fotos reales del usuario
uniform float u_aiMicroCropB;     // 1.05 en imágenes IA previas, 1.0 en fotos reales

const float PI = 3.14159265359;

// -------------------------------------------------------------------------
// Funciones hash / ruido Perlin deterministas (cero Math.random / time)
// -------------------------------------------------------------------------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float valueNoise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i + vec2(0.0, 0.0));
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

float fbm2(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    v += amp * valueNoise2D(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}

float easeInOutSine(float x) {
  float c = clamp(x, 0.0, 1.0);
  return -(cos(PI * c) - 1.0) * 0.5;
}

// Mapeo Cover (mantiene relación de aspecto sin deformación) + Smart Reframe focal + Overscan (~6%) + Micro-crop IA opcional
vec2 toCoverOverscanUV(vec2 screenUv, float imgAspect, float canvasAspect, vec2 focalPoint, float aiMicroCrop) {
  vec2 uv = screenUv;
  // Invertir Y porque las texturas 2D de Canvas/ImageBitmap tienen origen arriba-izquierda
  uv.y = 1.0 - uv.y;
  vec2 span = vec2(1.0);
  if (imgAspect > canvasAspect) {
    span.x = canvasAspect / max(0.01, imgAspect);
  } else {
    span.y = imgAspect / max(0.01, canvasAspect);
  }
  // Overscan de 6% para paralaje limpio + micro-crop (~5%) aplicado exclusivamente a imágenes IA (1.0 en fotos reales)
  span *= (0.94 / max(1.0, aiMicroCrop));
  vec2 halfSpan = span * 0.5;
  vec2 minCenter = min(vec2(0.5), halfSpan + vec2(0.008));
  vec2 maxCenter = max(vec2(0.5), vec2(1.0) - halfSpan - vec2(0.008));
  vec2 safeCenter = clamp(focalPoint, minCenter, maxCenter);
  return safeCenter + (uv - 0.5) * span;
}

// Mirror/clamp suave en bordes para cero estiramientos o costuras al desplazar UV
vec2 mirrorClampUV(vec2 uv) {
  vec2 m = abs(mod(uv + 1.0, 2.0) - 1.0);
  return clamp(m, vec2(0.002), vec2(0.998));
}

// -------------------------------------------------------------------------
// Presets de cámara BeatV2 + respiración Perlin determinista
// Devuelve: xy = offset de paralaje de cámara, z = zoom, w = rotación sutil
// -------------------------------------------------------------------------
vec4 evaluateCameraRig(float t, float seed, int preset, float impact) {
  float e = easeInOutSine(t);
  float breathX = fbm2(vec2(t * 1.9 + seed * 0.13, seed * 0.37)) * 0.0055;
  float breathY = fbm2(vec2(t * 1.6 + seed * 0.29, seed * 0.71 + 4.1)) * 0.0045;
  float rot = fbm2(vec2(t * 1.3 + seed * 0.51, 2.7)) * 0.004;

  vec2 cam = vec2(breathX, breathY);
  float zoom = 1.0;

  if (preset == 0) {
    // dolly_in
    zoom = 1.0 + e * 0.075;
    cam += vec2((e - 0.5) * -0.016, (e - 0.5) * -0.010);
  } else if (preset == 1) {
    // dolly_out
    zoom = 1.078 - e * 0.068;
    cam += vec2((e - 0.5) * 0.014, (e - 0.5) * 0.009);
  } else if (preset == 2) {
    // orbit_left
    zoom = 1.03 + sin(e * PI) * 0.025;
    cam += vec2((e - 0.5) * -0.056, (e - 0.5) * -0.008);
    rot += (e - 0.5) * -0.007;
  } else if (preset == 3) {
    // orbit_right
    zoom = 1.03 + sin(e * PI) * 0.025;
    cam += vec2((e - 0.5) * 0.056, (e - 0.5) * -0.008);
    rot += (e - 0.5) * 0.007;
  } else if (preset == 4) {
    // handheld_tension
    float hx = fbm2(vec2(t * 5.2 + seed * 0.17, seed * 0.61)) * (0.016 + impact * 0.014);
    float hy = fbm2(vec2(t * 4.7 + seed * 0.43, seed * 0.89)) * (0.013 + impact * 0.012);
    zoom = 1.035 + e * 0.032 + impact * 0.014;
    cam += vec2(hx, hy);
    rot += hx * 0.45;
  } else if (preset == 5) {
    // rack_focus_reveal
    zoom = 1.015 + e * 0.048;
    cam += vec2(sin(e * PI) * 0.022, (e - 0.5) * -0.014);
  } else {
    // push_impact (6)
    float punch = pow(e, 0.72);
    zoom = 1.01 + punch * 0.082 + impact * 0.022;
    float shakeX = valueNoise2D(vec2(t * 24.0 + seed, 1.3)) * impact * 0.012;
    float shakeY = valueNoise2D(vec2(t * 21.0 + seed, 7.9)) * impact * 0.010;
    cam += vec2((punch - 0.5) * 0.022 + shakeX, (punch - 0.5) * -0.016 + shakeY);
  }

  if (u_isCommercial > 0.5) {
    // Modo Comercial & Bienes Raíces: estabilizador gimbal suave y elegante (sin temblores ni golpes)
    float smoothZoom = 1.005 + e * 0.052;
    vec2 gimbalPan = vec2(0.0);
    if (preset == 1) {
      smoothZoom = 1.058 - e * 0.05;
      gimbalPan = vec2((e - 0.5) * 0.014, (e - 0.5) * 0.006);
    } else if (preset == 2) {
      smoothZoom = 1.02 + sin(e * PI) * 0.018;
      gimbalPan = vec2((e - 0.5) * -0.036, (e - 0.5) * -0.004);
    } else if (preset == 3) {
      smoothZoom = 1.02 + sin(e * PI) * 0.018;
      gimbalPan = vec2((e - 0.5) * 0.036, (e - 0.5) * -0.004);
    } else {
      gimbalPan = vec2((e - 0.5) * -0.012, (e - 0.5) * -0.006);
    }
    return vec4(gimbalPan + vec2(breathX, breathY) * 0.35, smoothZoom, rot * 0.25);
  }

  return vec4(cam, zoom, rot);
}

// -------------------------------------------------------------------------
// Parallax Occlusion Mapping (POM 6 pasos + refinamiento)
// -------------------------------------------------------------------------
vec3 sampleParallaxScene(
  sampler2D colorTex,
  sampler2D depthTex,
  vec2 baseUv,
  vec2 camOffset,
  float parallaxScale,
  out float outDepth,
  out vec2 outUv
) {
  const int STEPS = 6;
  vec2 maxShift = camOffset * parallaxScale;
  float bestDepth = 0.0;
  vec2 bestUv = baseUv;

  // Marcha desde primer plano (1.0) hacia el fondo (0.0) buscando la primera intersección
  float prevDiff = 1.0;
  vec2 prevUv = baseUv;
  float prevLayerD = 1.0;

  for (int i = 0; i <= STEPS; i++) {
    float layerD = 1.0 - float(i) / float(STEPS);
    // Desplazamiento relativo al plano medio (0.48) para pivote 3D natural
    vec2 probeUv = mirrorClampUV(baseUv - maxShift * (layerD - 0.48));
    float sampledD = texture(depthTex, probeUv).r;
    float diff = layerD - sampledD;
    if (diff <= 0.0) {
      // Interpolación lineal fina entre el paso actual y el anterior
      float weight = clamp(prevDiff / max(0.0001, prevDiff - diff), 0.0, 1.0);
      bestUv = mix(prevUv, probeUv, weight);
      bestDepth = mix(prevLayerD, layerD, weight);
      break;
    }
    prevDiff = diff;
    prevUv = probeUv;
    prevLayerD = layerD;
    bestUv = probeUv;
    bestDepth = sampledD;
  }

  outUv = mirrorClampUV(bestUv);
  outDepth = texture(depthTex, outUv).r;
  return texture(colorTex, outUv).rgb;
}

// -------------------------------------------------------------------------
// Depth-of-Field ligero (8-tap Poisson disk en GPU ponderado por profundidad)
// -------------------------------------------------------------------------
vec3 applySelectiveDof(
  sampler2D colorTex,
  sampler2D depthTex,
  vec2 uv,
  vec3 centerCol,
  float centerDepth,
  float focusDepth,
  float aperture
) {
  float coc = abs(centerDepth - focusDepth) * aperture;
  if (coc < 0.0018) return centerCol;

  const vec2 POISSON[8] = vec2[8](
    vec2(-0.613392,  0.617481),
    vec2( 0.751946,  0.453352),
    vec2( 0.170019, -0.040254),
    vec2(-0.299417,  0.791925),
    vec2( 0.645680, -0.493210),
    vec2(-0.651784, -0.717887),
    vec2( 0.421003, -0.870687),
    vec2(-0.817194,  0.071096)
  );

  vec2 texel = vec2(1.0) / max(u_resolution, vec2(1.0));
  float blurPx = clamp(coc * 14.0, 0.0, 9.5);
  vec3 accum = centerCol;
  float totalW = 1.0;

  for (int i = 0; i < 8; i++) {
    vec2 sampleUv = mirrorClampUV(uv + POISSON[i] * texel * blurPx);
    float sDepth = texture(depthTex, sampleUv).r;
    // Evitar sangrado de un primer plano enfocado sobre el fondo desenfocado
    float sCoc = abs(sDepth - focusDepth) * aperture;
    float w = smoothstep(0.0, 0.012, sCoc + 0.004);
    if (sDepth > centerDepth + 0.09 && sCoc < coc * 0.55) {
      w *= 0.18;
    }
    accum += texture(colorTex, sampleUv).rgb * w;
    totalW += w;
  }

  return accum / max(0.001, totalW);
}

// -------------------------------------------------------------------------
// Normales aproximadas Sobel 3x3 sobre u_depthTex -> Re-iluminación 3D reactiva
// -------------------------------------------------------------------------
vec3 computePseudoNormal(sampler2D depthTex, vec2 uv) {
  vec2 t = vec2(2.2) / max(u_resolution, vec2(1.0));
  float tl = texture(depthTex, mirrorClampUV(uv + vec2(-t.x, -t.y))).r;
  float tc = texture(depthTex, mirrorClampUV(uv + vec2( 0.0, -t.y))).r;
  float tr = texture(depthTex, mirrorClampUV(uv + vec2( t.x, -t.y))).r;
  float ml = texture(depthTex, mirrorClampUV(uv + vec2(-t.x,  0.0))).r;
  float mr = texture(depthTex, mirrorClampUV(uv + vec2( t.x,  0.0))).r;
  float bl = texture(depthTex, mirrorClampUV(uv + vec2(-t.x,  t.y))).r;
  float bc = texture(depthTex, mirrorClampUV(uv + vec2( 0.0,  t.y))).r;
  float br = texture(depthTex, mirrorClampUV(uv + vec2( t.x,  t.y))).r;

  float gx = -tl + tr - 2.0 * ml + 2.0 * mr - bl + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return normalize(vec3(-gx * 3.4, -gy * 3.4, 1.0));
}

// -------------------------------------------------------------------------
// Partículas y niebla volumétrica con Z-Testing real contra sceneDepth
// -------------------------------------------------------------------------
vec3 renderZTestedAtmosphere(
  vec3 baseCol,
  vec2 screenUv,
  float sceneDepth,
  vec2 camOffset,
  float canvasAspect
) {
  // 1) Niebla volumétrica estratificada por profundidad (más densa detrás del sujeto)
  float bgMistFactor = smoothstep(0.68, 0.12, sceneDepth);
  float mistWave = 0.5 + 0.5 * fbm2(screenUv * vec2(2.8, 2.2) + vec2(u_beatElapsedSec * 0.08, -u_beatElapsedSec * 0.05) + u_seed * 0.07);
  float mistAmount = bgMistFactor * mistWave * (0.14 + u_voiceRms * 0.06);
  vec3 col = mix(baseCol, baseCol + u_moodGlowColor * 0.55, mistAmount);

  // 2) 24 partículas deterministas con coordenada Z propia [0.16..0.95]
  vec3 particleAccum = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float s0 = hash11(u_seed * 0.37 + fi * 13.71);
    float s1 = hash11(u_seed * 0.73 + fi * 29.13);
    float s2 = hash11(u_seed * 0.19 + fi * 47.29);
    float s3 = hash11(u_seed * 0.53 + fi * 71.83);

    // Profundidad real de la partícula: mitad detrás del sujeto (0.18..0.56), mitad cerca de lente (0.60..0.95)
    float pZ = mix(0.18, 0.95, s2);
    float speedY = mix(0.025, 0.095, s3) * (0.65 + pZ * 0.75);
    float driftX = sin(u_beatElapsedSec * (0.7 + s3 * 1.4) + s0 * 6.2831) * (0.018 + pZ * 0.016);

    float py = fract(s1 + u_beatElapsedSec * speedY);
    float px = fract(s0 + driftX);

    // Paralaje coherente con la cámara según pZ
    vec2 pUv = vec2(px, py) - camOffset * (pZ - 0.48) * 1.65;
    pUv = fract(pUv);

    vec2 delta = screenUv - pUv;
    delta.x *= canvasAspect;
    float dist = length(delta);

    float baseRadius = mix(0.0026, 0.0105, pow(pZ, 1.8)) * (0.75 + s3 * 0.6);
    if (u_particleTheme == 1) {
      // Burbujas abisales: anillo fino + núcleo suave
      baseRadius *= 1.35;
    } else if (u_particleTheme == 3) {
      // Chispas ascendentes
      baseRadius *= 0.85;
    }

    if (dist < baseRadius * 2.6) {
      // Z-TEST REAL contra el depth map de la escena:
      // Si pZ < sceneDepth, la partícula queda ocluida DETRÁS del protagonista.
      float zVisibility = smoothstep(sceneDepth - 0.035, sceneDepth + 0.045, pZ);
      if (zVisibility > 0.01) {
        float soft = exp(-pow(dist / max(0.0005, baseRadius), 2.1));
        if (u_particleTheme == 1) {
          float ring = smoothstep(baseRadius * 1.05, baseRadius * 0.78, dist) *
                       smoothstep(baseRadius * 0.45, baseRadius * 0.78, dist);
          soft = soft * 0.35 + ring * 0.85;
        }
        float twinkle = 0.65 + 0.35 * sin(u_beatElapsedSec * (2.5 + s3 * 4.0) + fi * 2.1);
        vec3 pTint = mix(u_moodGlowColor * 1.4 + vec3(0.35), u_accentColor * 1.15 + vec3(0.25), step(0.65, s0));
        if (u_particleTheme == 2) {
          pTint = mix(vec3(0.45, 0.9, 1.0), vec3(0.95, 0.97, 1.0), s0);
        } else if (u_particleTheme == 3) {
          pTint = mix(vec3(1.0, 0.36, 0.12), vec3(1.0, 0.85, 0.25), s0);
        }
        float alpha = soft * zVisibility * twinkle * mix(0.26, 0.46, pZ) * (1.0 + u_impactTransient * 0.35);
        particleAccum += pTint * alpha;
      }
    }
  }

  return col + particleAccum;
}

// -------------------------------------------------------------------------
// Color Grading cinematográfico por nicho (4 paletas calibradas)
// -------------------------------------------------------------------------
vec3 applyNicheColorGrade(vec3 c, int mode) {
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (mode == 0) {
    // Teal & Noir: sombras frías azul-petróleo + altas luces cálidas + contraste fílmico
    vec3 shadows = vec3(0.02, 0.08, 0.13);
    vec3 highlights = vec3(1.05, 0.96, 0.88);
    vec3 graded = mix(c + shadows * (1.0 - luma), c * highlights, smoothstep(0.25, 0.85, luma));
    graded = mix(vec3(luma), graded, 1.12);
    return clamp((graded - 0.5) * 1.1 + 0.5, 0.0, 1.0);
  } else if (mode == 1) {
    // Bleach Bypass: desaturación metálica de thriller + alto contraste
    vec3 desat = mix(vec3(luma), c, 0.62);
    vec3 contrast = smoothstep(vec3(0.03), vec3(0.97), desat);
    return clamp(mix(desat, contrast, 0.58) * vec3(0.96, 0.99, 1.04), 0.0, 1.0);
  } else if (mode == 2) {
    // Warm Kodak: película 35mm cálida dorada
    vec3 warm = c * vec3(1.07, 1.01, 0.91) + vec3(0.015, 0.008, -0.005);
    warm = mix(vec3(luma), warm, 1.14);
    return clamp((warm - 0.5) * 1.06 + 0.5, 0.0, 1.0);
  } else {
    // Cyber Cold: cian espacial / documental científico
    vec3 cold = c * vec3(0.90, 1.02, 1.12) + vec3(0.0, 0.012, 0.025) * (1.0 - luma);
    cold = mix(vec3(luma), cold, 1.16);
    return clamp((cold - 0.5) * 1.12 + 0.5, 0.0, 1.0);
  }
}

void main() {
  float canvasAspect = u_resolution.x / max(1.0, u_resolution.y);
  vec4 rig = evaluateCameraRig(u_time, u_seed, u_cameraPreset, u_impactTransient);
  vec2 camOffset = rig.xy;
  float camZoom = rig.z;
  float camRot = rig.w;

  // Aplicar zoom y micro-rotación alrededor del centro
  vec2 centeredScreen = v_uv - 0.5;
  float cs = cos(camRot);
  float sn = sin(camRot);
  vec2 rotScreen = vec2(
    centeredScreen.x * cs - centeredScreen.y * sn,
    centeredScreen.x * sn + centeredScreen.y * cs
  ) / max(0.85, camZoom) + 0.5;

  // Coordenada base para textura A (escena actual) con Smart Reframe focal + micro-crop solo para IA
  vec2 baseUvA = toCoverOverscanUV(rotScreen, u_imageAspectA, canvasAspect, u_focalPointA, u_aiMicroCropA);

  // Intensidad de paralaje 2.5D ajustada por preset de cámara (más contenida y limpia en modo comercial)
  float baseParallax = (u_cameraPreset == 2 || u_cameraPreset == 3) ? 0.52 : 0.42;
  float parallaxStrength = mix(baseParallax, 0.30, u_isCommercial);
  float sceneDepth = 0.5;
  vec2 displacedUv = baseUvA;
  vec3 color = sampleParallaxScene(
    u_colorTexA,
    u_depthTexA,
    baseUvA,
    camOffset,
    parallaxStrength,
    sceneDepth,
    displacedUv
  );

  // Depth-of-Field selectivo (8-tap Poisson disk en GPU)
  if (u_aperture > 0.01) {
    color = applySelectiveDof(
      u_colorTexA,
      u_depthTexA,
      displacedUv,
      color,
      sceneDepth,
      u_focusDepth,
      u_aperture
    );
  }

  // Transiciones físicas en shader entre beatB (saliente) y beatA (entrante) durante ~0.35s
  float transitionBlurBoost = 0.0;
  if (u_hasTransition > 0.5 && u_transitionT < 0.999) {
    float tr = clamp(u_transitionT, 0.0, 1.0);
    float trEase = easeInOutSine(tr);
    float peak = sin(tr * PI); // 0 en extremos, 1 en el punto medio del corte
    transitionBlurBoost = peak;

    vec2 baseUvB = toCoverOverscanUV(v_uv, u_imageAspectB, canvasAspect, u_focalPointB, u_aiMicroCropB);
    vec3 colB = vec3(0.0);
    vec3 colA = color;

    if (u_transitionMode == 0) {
      // Whip-pan con motion blur direccional (7 taps)
      float dir = mod(u_seed, 2.0) < 1.0 ? 1.0 : -1.0;
      float slideA = (1.0 - trEase) * 0.24 * dir;
      float slideB = -trEase * 0.24 * dir;
      vec2 blurVec = vec2(peak * 0.032 * dir, 0.0);
      vec3 accA = vec3(0.0);
      vec3 accB = vec3(0.0);
      for (int k = -3; k <= 3; k++) {
        float fk = float(k) / 3.0;
        accA += texture(u_colorTexA, mirrorClampUV(displacedUv + vec2(slideA, 0.0) + blurVec * fk)).rgb;
        accB += texture(u_colorTexB, mirrorClampUV(baseUvB + vec2(slideB, 0.0) + blurVec * fk)).rgb;
      }
      colA = accA / 7.0;
      colB = accB / 7.0;
      color = mix(colB, colA, trEase);
    } else if (u_transitionMode == 1) {
      // Zoom-through radial hacia el siguiente beat
      vec2 radialDir = (v_uv - 0.5) * peak * 0.06;
      vec3 accA = vec3(0.0);
      vec3 accB = vec3(0.0);
      vec2 zUvA = (displacedUv - 0.5) * mix(1.16, 1.0, trEase) + 0.5;
      vec2 zUvB = (baseUvB - 0.5) * mix(1.0, 0.84, trEase) + 0.5;
      for (int k = 0; k < 5; k++) {
        float fk = (float(k) / 4.0 - 0.5);
        accA += texture(u_colorTexA, mirrorClampUV(zUvA + radialDir * fk)).rgb;
        accB += texture(u_colorTexB, mirrorClampUV(zUvB + radialDir * fk)).rgb;
      }
      colA = accA / 5.0;
      colB = accB / 5.0;
      color = mix(colB, colA, trEase);
    } else {
      // Light-leak anamórfico horizontal barriendo el corte
      colB = texture(u_colorTexB, mirrorClampUV(baseUvB)).rgb;
      color = mix(colB, colA, trEase);
      float streakPos = mix(-0.15, 1.15, trEase);
      float streakBand = exp(-pow((v_uv.x - streakPos) * 4.2, 2.0)) *
                         exp(-pow((v_uv.y - 0.48) * 1.4, 2.0));
      float horizFlare = exp(-pow((v_uv.y - 0.48) * 9.0, 2.0)) * peak * 0.45;
      vec3 leakTint = mix(u_accentColor, vec3(1.0, 0.86, 0.62), 0.5);
      color += leakTint * (streakBand * peak * 0.65 + horizFlare);
    }

    float depthB = texture(u_depthTexB, mirrorClampUV(baseUvB)).r;
    sceneDepth = mix(depthB, sceneDepth, trEase);
  }

  // -------------------------------------------------------------------------
  // Re-iluminación 3D reactiva al audio (Normales Sobel 3x3 + Rim Light)
  // -------------------------------------------------------------------------
  vec3 N = computePseudoNormal(u_depthTexA, displacedUv);
  float lightAngle = u_time * 1.4 + u_seed * 0.21;
  vec3 L = normalize(vec3(cos(lightAngle) * 0.72, sin(lightAngle) * 0.42 + 0.35, 0.78));
  vec3 V = vec3(0.0, 0.0, 1.0);
  float ndotl = max(dot(N, L), 0.0);
  float fresnelRim = pow(1.0 - max(dot(N, V), 0.0), 2.35);

  float audioEnergy = clamp(u_voiceRms * 0.75 + u_impactTransient * 1.15, 0.0, 1.35);
  float fgMask = smoothstep(0.32, 0.86, sceneDepth);
  vec3 keyLightTint = mix(u_moodGlowColor * 1.15 + vec3(0.25), u_accentColor, 0.42);

  // Reflejo direccional sutil + rim light sincronizado con picos de voz (suavizado en modo comercial)
  float relightScale = mix(1.0, 0.25, u_isCommercial);
  color += keyLightTint * ndotl * fgMask * (0.055 + u_voiceRms * 0.095) * relightScale;
  color += mix(u_accentColor, vec3(1.0, 0.96, 0.9), 0.35) * fresnelRim * fgMask * (0.08 + audioEnergy * 0.26) * relightScale;

  // -------------------------------------------------------------------------
  // Depth-Masked Kinetic Title (renderizado DETRÁS del sujeto si depth > 0.58)
  // -------------------------------------------------------------------------
  if (u_hasDepthTitle > 0.5 && u_titleOpacity > 0.01) {
    // Paralaje en plano medio (depth = 0.56) para anclar el título en el espacio 3D
    vec2 titleUv = vec2(v_uv.x, 1.0 - v_uv.y) - camOffset * (0.56 - 0.48) * 0.9;
    if (titleUv.x >= 0.0 && titleUv.x <= 1.0 && titleUv.y >= 0.0 && titleUv.y <= 1.0) {
      vec4 titleSample = texture(u_titleTex, titleUv);
      if (titleSample.a > 0.01) {
        // Sujeto en primer plano (> 0.58) ocluye el título dejando un 12% de legibilidad fantasma
        float fgOcclusion = smoothstep(u_titleMaskThresh - 0.04, u_titleMaskThresh + 0.05, sceneDepth);
        float visibleTitleAlpha = titleSample.a * u_titleOpacity * mix(1.0, 0.12, fgOcclusion);
        color = mix(color, titleSample.rgb, visibleTitleAlpha);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Partículas atmosféricas + niebla volumétrica con Z-Testing real (desactivado en modo comercial)
  // -------------------------------------------------------------------------
  if (u_isCommercial < 0.5) {
    color = renderZTestedAtmosphere(color, v_uv, sceneDepth, camOffset, canvasAspect);
  }

  // -------------------------------------------------------------------------
  // Post-Procesado GPU Single-Pass:
  // 1) Aberración cromática radial (desactivada en modo comercial para nitidez arquitectónica)
  // -------------------------------------------------------------------------
  vec2 radial = v_uv - 0.5;
  float radialDistSq = dot(radial, radial);
  float caStrength = (0.0014 + transitionBlurBoost * 0.0075 + u_impactTransient * 0.0065) * radialDistSq * 3.0 * (1.0 - u_isCommercial);
  if (caStrength > 0.00025) {
    vec2 caShift = radial * caStrength;
    float rShift = texture(u_colorTexA, mirrorClampUV(displacedUv + caShift)).r;
    float bShift = texture(u_colorTexA, mirrorClampUV(displacedUv - caShift)).b;
    float blendCa = clamp(0.32 + transitionBlurBoost * 0.45 + u_impactTransient * 0.35, 0.0, 0.85);
    color.r = mix(color.r, rShift, blendCa * 0.55);
    color.b = mix(color.b, bShift, blendCa * 0.55);
  }

  // 2) Bloom selectivo en altas luces (luma > 0.80)
  vec2 bloomStep = vec2(4.0) / max(u_resolution, vec2(1.0));
  vec3 bloomAcc = vec3(0.0);
  vec2 bOff[4] = vec2[4](
    vec2( bloomStep.x,  bloomStep.y),
    vec2(-bloomStep.x,  bloomStep.y),
    vec2( bloomStep.x, -bloomStep.y),
    vec2(-bloomStep.x, -bloomStep.y)
  );
  for (int b = 0; b < 4; b++) {
    vec3 sCol = texture(u_colorTexA, mirrorClampUV(displacedUv + bOff[b])).rgb;
    float sLum = dot(sCol, vec3(0.2126, 0.7152, 0.0722));
    bloomAcc += sCol * smoothstep(0.80, 1.0, sLum);
  }
  float centerLum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  bloomAcc = (bloomAcc + color * smoothstep(0.80, 1.0, centerLum)) * 0.2;
  float bloomGain = mix(0.38 + u_voiceRms * 0.16 + u_impactTransient * 0.24, 0.14, u_isCommercial);
  color += bloomAcc * bloomGain;

  // 3) Color Grading: Editorial Luz Dorada limpia en Comercial, o 4 paletas cinematográficas en Viral
  if (u_isCommercial > 0.5) {
    float cLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 editorial = color * vec3(1.028, 1.012, 0.985) + vec3(0.012, 0.010, 0.006);
    editorial = mix(vec3(cLuma), editorial, 1.06);
    color = clamp((editorial - 0.5) * 1.04 + 0.5, 0.0, 1.0);
  } else {
    color = applyNicheColorGrade(color, u_colorGradeMode);
  }

  // 4) Viñeta dinámica + Scrim inferior suave para legibilidad de subtítulos
  float vigDist = length((v_uv - vec2(0.5, 0.47)) * vec2(1.05, 1.18));
  float vig = smoothstep(0.36, 0.96, vigDist);
  float vigDarkness = mix(0.34, 0.84, u_isCommercial);
  float vigWeight = mix(0.76 + u_impactTransient * 0.14, 0.32, u_isCommercial);
  color *= mix(1.0, vigDarkness, vig * vigWeight);

  // Scrim superior/inferior discreto para zona segura de HUD y subtítulos
  float topScrim = smoothstep(0.80, 1.0, v_uv.y) * mix(0.34, 0.12, u_isCommercial);
  float botScrim = smoothstep(0.34, 0.0, v_uv.y) * mix(0.72, 0.38, u_isCommercial);
  color *= (1.0 - max(topScrim, botScrim));

  // 5) Grano fílmico 35mm procedural 100% determinista (casi invisible en modo comercial)
  float grainFrame = floor(u_frameIndex * 0.8); // ~24fps fílmico determinista
  float grain = hash12(gl_FragCoord.xy + vec2(grainFrame * 19.31 + u_seed * 0.11, grainFrame * 7.13));
  color += (grain - 0.5) * mix(0.042, 0.005, u_isCommercial);

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

function hexToRgbVec3(hex: string): [number, number, number] {
  const clean = (hex || '#F97316').replace('#', '').trim();
  const full =
    clean.length === 3
      ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
      : clean.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num)) return [0.976, 0.451, 0.086];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function resolveColorGradeMode(scene?: ScriptScene, script?: ViralScript): CinematicColorGradeId {
  const palette = scene?.visualSpec?.moodPalette;
  const nicheHint = `${script?.nicho ?? ''} ${script?.estilo3D ?? ''}`.toLowerCase();

  if (
    palette === 'cyber_cyan' ||
    palette === 'neon_science' ||
    palette === 'cosmic_indigo' ||
    /espacio|ciencia|tech|futuro|cosmos|misterio/.test(nicheHint)
  ) {
    return palette === 'cosmic_indigo' ? 'teal_noir' : 'cyber_cold';
  }
  if (
    palette === 'alert_stress' ||
    palette === 'crimson_pulse' ||
    script?.estilo3D === 'stylized_thriller' ||
    script?.estilo3D === 'clay_suspense' ||
    /terror|crimen|expediente|supervivencia|psicol/.test(nicheHint)
  ) {
    return 'bleach_bypass';
  }
  if (
    palette === 'golden_history' ||
    palette === 'warm_energy' ||
    palette === 'wealth_gold' ||
    script?.estilo3D === 'soft_storybook' ||
    /historia|dinero|finanza|antigu|curios/.test(nicheHint)
  ) {
    return 'warm_kodak';
  }
  return 'teal_noir';
}

function resolveMoodGlowVec3(scene?: ScriptScene): [number, number, number] {
  const palette = scene?.visualSpec?.moodPalette ?? 'warm_energy';
  const map: Record<string, [number, number, number]> = {
    warm_energy: [0.97, 0.45, 0.09],
    neon_science: [0.22, 0.74, 0.97],
    crimson_pulse: [0.95, 0.25, 0.37],
    emerald_vitality: [0.06, 0.72, 0.51],
    golden_history: [0.96, 0.62, 0.04],
    alert_stress: [0.94, 0.27, 0.27],
    cosmic_indigo: [0.55, 0.36, 0.96],
    wealth_gold: [0.92, 0.7, 0.03],
    calm_storybook: [0.38, 0.65, 0.98],
    cyber_cyan: [0.02, 0.71, 0.83],
  };
  return map[palette] ?? map.warm_energy;
}

function resolveParticleThemeIndex(scene?: ScriptScene, script?: ViralScript): number {
  const env = scene?.visualSpec?.environment;
  const palette = scene?.visualSpec?.moodPalette;
  const hint = `${scene?.narracion ?? ''} ${script?.tituloViral ?? ''} ${script?.nicho ?? ''}`.toLowerCase();
  if (env === 'ocean_deep' || /submar|implosi|oc[eé]ano|abisal|profund|agua/.test(hint)) return 1;
  if (
    env === 'space_cosmos' ||
    env === 'tech_studio' ||
    palette === 'cyber_cyan' ||
    palette === 'neon_science' ||
    palette === 'cosmic_indigo' ||
    /espacio|radio|se[ñn]al|estrella|galaxia|6equj5/.test(hint)
  ) {
    return 2;
  }
  if (palette === 'alert_stress' || palette === 'crimson_pulse' || scene?.esGiro30s) return 3;
  return 0;
}

function resolveCameraPresetIndex(scene: ScriptScene | undefined, beatIndex: number): number {
  if (scene?.cameraMotion && scene.cameraMotion in CAMERA_PRESET_INDEX) {
    return CAMERA_PRESET_INDEX[scene.cameraMotion];
  }
  const fallbackOrder: CameraMotionPreset[] = [
    'dolly_in',
    'orbit_right',
    'dolly_out',
    'orbit_left',
    'rack_focus_reveal',
    'push_impact',
  ];
  return CAMERA_PRESET_INDEX[fallbackOrder[beatIndex % fallbackOrder.length]];
}

function resolveShotTypeIndex(scene: ScriptScene | undefined): number {
  if (scene?.shotType && scene.shotType in SHOT_TYPE_INDEX) {
    return SHOT_TYPE_INDEX[scene.shotType];
  }
  return SHOT_TYPE_INDEX.MEDIUM_ACTION;
}

function resolveTransitionModeIndex(
  explicitMode: ShaderTransitionMode | undefined,
  beatIndex: number,
  scene?: ScriptScene
): number {
  if (explicitMode === 'whip_pan') return 0;
  if (explicitMode === 'zoom_through') return 1;
  if (explicitMode === 'light_leak') return 2;
  if (scene?.esGiro30s || scene?.cameraMotion === 'push_impact') return 1;
  return beatIndex % 3;
}

interface CachedTextureSlot {
  key: string;
  colorTex: WebGLTexture;
  depthTex: WebGLTexture;
  aspect: number;
  hasAiDepth: boolean;
  lastUsedStep: number;
}

/**
 * WebGLSceneRenderer:
 * Compositor cinematográfico 100% WebGL2 (GLSL ES 3.00 puro, cero Three.js) que funciona
 * tanto sobre `<canvas>` en Preview como sobre `OffscreenCanvas` / `<canvas>` en Exportación MP4.
 *
 * - Mantiene caché GPU de ventana deslizante (`N <= 4`) llamando a `gl.deleteTexture()` al evictar.
 * - Maneja `webglcontextlost` y `webglcontextrestored` reconstruyendo programa y texturas sin fallos.
 * - Si WebGL2 no está disponible o falla la compilación, `isAvailable()` es `false` para fallback 2D limpio.
 */
export class WebGLSceneRenderer {
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniforms = new Map<string, WebGLUniformLocation | null>();

  private readonly textureSlots = new Map<string, CachedTextureSlot>();
  private fallbackBlackTex: WebGLTexture | null = null;
  private fallbackMidDepthTex: WebGLTexture | null = null;

  private titleCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private titleTex: WebGLTexture | null = null;
  private lastTitleKey = '';

  private useStepCounter = 0;
  private contextLost = false;
  private disposed = false;

  private readonly handleContextLost = (ev: Event) => {
    ev.preventDefault();
    this.contextLost = true;
    this.textureSlots.clear();
    this.program = null;
    this.vao = null;
    this.fallbackBlackTex = null;
    this.fallbackMidDepthTex = null;
    this.titleTex = null;
    this.lastTitleKey = '';
  };

  private readonly handleContextRestored = () => {
    this.contextLost = false;
    if (!this.disposed) {
      this.initGlResources();
    }
  };

  public static isWebGL2Supported(): boolean {
    if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') {
      return false;
    }
    try {
      const testCanvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(4, 4)
          : document.createElement('canvas');
      const ctx = testCanvas.getContext('webgl2');
      return Boolean(ctx);
    } catch {
      return false;
    }
  }

  constructor(width: number, height: number, preferOffscreen = false) {
    if (preferOffscreen && typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(Math.max(2, width), Math.max(2, height));
    } else if (typeof document !== 'undefined') {
      const el = document.createElement('canvas');
      el.width = Math.max(2, width);
      el.height = Math.max(2, height);
      el.addEventListener('webglcontextlost', this.handleContextLost, false);
      el.addEventListener('webglcontextrestored', this.handleContextRestored, false);
      this.canvas = el;
    } else if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(Math.max(2, width), Math.max(2, height));
    } else {
      throw new Error('No hay superficie Canvas/OffscreenCanvas disponible para WebGL2.');
    }

    this.initGlResources();
  }

  public isAvailable(): boolean {
    return !this.disposed && !this.contextLost && Boolean(this.gl && this.program && this.vao);
  }

  public getSurface(): HTMLCanvasElement | OffscreenCanvas {
    return this.canvas;
  }

  private initGlResources(): void {
    try {
      const gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      }) as WebGL2RenderingContext | null;

      if (!gl) {
        this.gl = null;
        return;
      }

      const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
      const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
      if (!vs || !fs) {
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
        this.gl = null;
        return;
      }

      const prog = gl.createProgram();
      if (!prog) {
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        this.gl = null;
        return;
      }

      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.deleteProgram(prog);
        this.gl = null;
        return;
      }

      const vao = gl.createVertexArray();
      if (!vao) {
        gl.deleteProgram(prog);
        this.gl = null;
        return;
      }

      this.gl = gl;
      this.program = prog;
      this.vao = vao;
      this.uniforms.clear();

      // Texturas de respaldo 1x1 para evitar bindings incompletos en GPU
      this.fallbackBlackTex = this.createSolidTexture(gl, 8, 12, 20, 255);
      this.fallbackMidDepthTex = this.createSolidTexture(gl, 128, 128, 128, 255);

      const uniformNames = [
        'u_colorTexA',
        'u_depthTexA',
        'u_colorTexB',
        'u_depthTexB',
        'u_titleTex',
        'u_resolution',
        'u_imageAspectA',
        'u_imageAspectB',
        'u_focalPointA',
        'u_focalPointB',
        'u_time',
        'u_beatElapsedSec',
        'u_frameIndex',
        'u_seed',
        'u_voiceRms',
        'u_impactTransient',
        'u_cameraPreset',
        'u_shotType',
        'u_focusDepth',
        'u_aperture',
        'u_colorGradeMode',
        'u_particleTheme',
        'u_moodGlowColor',
        'u_accentColor',
        'u_hasTransition',
        'u_transitionT',
        'u_transitionMode',
        'u_hasDepthTitle',
        'u_titleOpacity',
        'u_titleMaskThresh',
        'u_isCommercial',
        'u_aiMicroCropA',
        'u_aiMicroCropB',
      ];
      for (const name of uniformNames) {
        this.uniforms.set(name, gl.getUniformLocation(prog, name));
      }
    } catch {
      this.gl = null;
      this.program = null;
      this.vao = null;
    }
  }

  private compileShader(
    gl: WebGL2RenderingContext,
    type: number,
    src: string
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createSolidTexture(
    gl: WebGL2RenderingContext,
    r: number,
    g: number,
    b: number,
    a: number
  ): WebGLTexture | null {
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([r, g, b, a])
    );
    return tex;
  }

  private createUploadedTexture(
    gl: WebGL2RenderingContext,
    source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas
  ): WebGLTexture | null {
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source as TexImageSource
    );
    return tex;
  }

  private ensureSlotTextures(
    gl: WebGL2RenderingContext,
    slot: WebGLBeatVisualSlot
  ): CachedTextureSlot | null {
    if (!slot.colorSource || !slot.key) return null;
    const hasAiDepth = Boolean(slot.depthSource);
    const existing = this.textureSlots.get(slot.key);

    if (existing) {
      existing.lastUsedStep = ++this.useStepCounter;
      // Si acaba de llegar un mapa TrueDepth IA, actualizar la textura de profundidad en caliente
      if (hasAiDepth && !existing.hasAiDepth && slot.depthSource) {
        gl.bindTexture(gl.TEXTURE_2D, existing.depthTex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          slot.depthSource as TexImageSource
        );
        existing.hasAiDepth = true;
      }
      return existing;
    }

    const colorTex = this.createUploadedTexture(gl, slot.colorSource);
    if (!colorTex) return null;

    const depthVisual =
      slot.depthSource ?? generateFallbackDepthMap(slot.colorSource, 192);
    const depthTex = this.createUploadedTexture(gl, depthVisual);
    if (!depthTex) {
      gl.deleteTexture(colorTex);
      return null;
    }

    const aspect = slot.colorSource.width / Math.max(1, slot.colorSource.height);
    const created: CachedTextureSlot = {
      key: slot.key,
      colorTex,
      depthTex,
      aspect,
      hasAiDepth,
      lastUsedStep: ++this.useStepCounter,
    };
    this.textureSlots.set(slot.key, created);
    this.evictStaleTextures(gl, 4);
    return created;
  }

  /**
   * Libera explícitamente texturas GPU (`gl.deleteTexture`) fuera de la ventana deslizante (N <= 4).
   */
  private evictStaleTextures(gl: WebGL2RenderingContext, maxSlots: number): void {
    if (this.textureSlots.size <= maxSlots) return;
    const ordered = Array.from(this.textureSlots.values()).sort(
      (a, b) => a.lastUsedStep - b.lastUsedStep
    );
    const toRemove = ordered.slice(0, this.textureSlots.size - maxSlots);
    for (const slot of toRemove) {
      gl.deleteTexture(slot.colorTex);
      gl.deleteTexture(slot.depthTex);
      this.textureSlots.delete(slot.key);
    }
  }

  /**
   * Dibuja en una textura transparente el título cinético grande (`depthTitleText`) que el shader
   * enmascarará DETRÁS del sujeto en primer plano (`depth > 0.58`).
   */
  private ensureDepthTitleTexture(
    gl: WebGL2RenderingContext,
    text: string,
    width: number,
    height: number,
    accentColor: string
  ): WebGLTexture | null {
    const clean = text.trim().toUpperCase().slice(0, 34);
    if (!clean) return null;
    const titleKey = `${clean}::${width}x${height}::${accentColor}`;
    if (this.titleTex && this.lastTitleKey === titleKey) {
      return this.titleTex;
    }

    if (!this.titleCanvas) {
      this.titleCanvas =
        typeof document !== 'undefined'
          ? document.createElement('canvas')
          : new OffscreenCanvas(width, height);
    }
    if (this.titleCanvas.width !== width || this.titleCanvas.height !== height) {
      this.titleCanvas.width = width;
      this.titleCanvas.height = height;
    }

    const ctx = this.titleCanvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return null;

    ctx.clearRect(0, 0, width, height);

    const isLandscape = width > height;
    const words = clean.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    if (words.length <= 2) {
      lines.push(clean);
    } else {
      const mid = Math.ceil(words.length / 2);
      lines.push(words.slice(0, mid).join(' '));
      lines.push(words.slice(mid).join(' '));
    }

    const maxTextWidth = width * 0.9;
    let fontSize = Math.round(isLandscape ? height * 0.22 : width * 0.21);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Ajustar tamaño para llenar con impacto cinematográfico sin recortar bordes
    for (let attempt = 0; attempt < 6; attempt++) {
      ctx.font = `900 ${fontSize}px "Plus Jakarta Sans", Impact, system-ui, sans-serif`;
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
      if (widest <= maxTextWidth) break;
      fontSize = Math.max(28, Math.floor(fontSize * (maxTextWidth / widest)));
    }

    const lineHeight = fontSize * 1.02;
    const centerY = height * (isLandscape ? 0.34 : 0.31);
    const startY = centerY - ((lines.length - 1) * lineHeight) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = Math.round(fontSize * 0.22);
    ctx.shadowOffsetY = Math.round(fontSize * 0.06);

    lines.forEach((line, idx) => {
      const y = startY + idx * lineHeight;
      const grad = ctx.createLinearGradient(0, y - fontSize * 0.5, 0, y + fontSize * 0.5);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.75, '#F8FAFC');
      grad.addColorStop(1, accentColor || '#F97316');
      ctx.fillStyle = grad;
      ctx.fillText(line, width * 0.5, y);

      ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.025));
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.strokeText(line, width * 0.5, y);
    });
    ctx.restore();

    if (!this.titleTex) {
      this.titleTex = this.createUploadedTexture(gl, this.titleCanvas);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.titleTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.titleCanvas as TexImageSource
      );
    }
    this.lastTitleKey = titleKey;
    return this.titleTex;
  }

  /**
   * Renderiza 1 fotograma determinista en WebGL2.
   * Devuelve `true` si se renderizó correctamente; `false` si debe aplicarse fallback Canvas 2D.
   */
  public renderFrame(input: WebGLSceneRenderInput): boolean {
    if (!this.isAvailable() || !this.gl || !this.program || !this.vao) {
      return false;
    }
    if (!input.currentSlot?.colorSource) {
      return false;
    }

    const gl = this.gl;
    const width = Math.max(2, Math.floor(input.width));
    const height = Math.max(2, Math.floor(input.height));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const slotA = this.ensureSlotTextures(gl, input.currentSlot);
    if (!slotA) return false;

    const hasTransition =
      Boolean(input.transitionSlot?.colorSource) &&
      input.transitionProgress > 0.001 &&
      input.transitionProgress < 0.999;

    const slotB =
      hasTransition && input.transitionSlot
        ? this.ensureSlotTextures(gl, input.transitionSlot)
        : null;

    const safeDur = Math.max(0.6, input.sceneDuration);
    const clampedElapsed = Math.max(0, Math.min(safeDur, input.localElapsed));
    const normalizedT = clampedElapsed / safeDur;

    const projectSeed = hashSeed32(input.script?.id || 'gortex-default');
    const seedFloat = ((projectSeed + input.beatIndex * 7919) % 10000) / 10.0;

    const cameraPreset = resolveCameraPresetIndex(input.scene, input.beatIndex);
    const shotType = resolveShotTypeIndex(input.scene);
    const colorGrade = COLOR_GRADE_INDEX[resolveColorGradeMode(input.scene, input.script)];
    const particleTheme = resolveParticleThemeIndex(input.scene, input.script);
    const moodGlow = resolveMoodGlowVec3(input.scene);
    const accentRgb = hexToRgbVec3(input.accentColor);
    const transitionMode = resolveTransitionModeIndex(
      input.transitionMode,
      input.beatIndex,
      input.scene
    );

    // Depth-of-Field dinámico: Rack Focus en rack_focus_reveal, o bokeh sutil en CLOSE_UP_EMOTION
    let focusDepth = 0.72;
    let aperture = 0.0;
    if (cameraPreset === 5) {
      // rack_focus_reveal: enfoca progresivamente del fondo (0.24) al sujeto (0.78)
      const easeRack = -(Math.cos(Math.PI * Math.min(1, normalizedT * 1.15)) - 1) * 0.5;
      focusDepth = 0.24 + easeRack * 0.54;
      aperture = 0.52;
    } else if (shotType === SHOT_TYPE_INDEX.CLOSE_UP_EMOTION || shotType === SHOT_TYPE_INDEX.EXTREME_CLOSE_UP) {
      focusDepth = 0.76;
      aperture = 0.36;
    } else if (shotType === SHOT_TYPE_INDEX.POV_FIRST_PERSON) {
      focusDepth = 0.68;
      aperture = 0.22;
    } else if (shotType === SHOT_TYPE_INDEX.MEDIUM_ACTION) {
      focusDepth = 0.70;
      aperture = 0.14;
    }

    const isCommercial =
      typeof input.isCommercial === 'boolean'
        ? input.isCommercial
        : input.script?.studioMode === 'commercial_real_estate';
    const isAiSourceA =
      !input.scene?.mediaSource || input.scene.mediaSource === 'ai_generated';
    const aiMicroCropA =
      typeof input.aiMicroCropA === 'number'
        ? input.aiMicroCropA
        : isAiSourceA
          ? 1.05
          : 1.0;
    const aiMicroCropB =
      typeof input.aiMicroCropB === 'number' ? input.aiMicroCropB : aiMicroCropA;

    // En modo comercial, priorizar fichas técnicas y CTA limpios sin título gigante detrás del sujeto
    const suppressDepthTitleForCommercial =
      isCommercial &&
      Boolean(
        input.scene?.isCtaBeat ||
          (Array.isArray(input.scene?.commercialSpecs) && input.scene.commercialSpecs.length > 0)
      );
    const rawDepthTitle = suppressDepthTitleForCommercial
      ? ''
      : (input.scene?.depthTitleText || '').trim();
    const titleTex = rawDepthTitle
      ? this.ensureDepthTitleTexture(gl, rawDepthTitle, width, height, input.accentColor)
      : null;
    const enterTitle = Math.min(1, clampedElapsed / 0.28);
    const exitTitle =
      safeDur > 0.9 && clampedElapsed > safeDur - 0.26
        ? Math.max(0, (safeDur - clampedElapsed) / 0.26)
        : 1;
    const titleOpacity = titleTex ? enterTitle * exitTitle : 0;

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Bind texturas (unidades 0..4)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, slotA.colorTex);
    gl.uniform1i(this.uniforms.get('u_colorTexA') ?? null, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, slotA.depthTex);
    gl.uniform1i(this.uniforms.get('u_depthTexA') ?? null, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, slotB?.colorTex ?? this.fallbackBlackTex);
    gl.uniform1i(this.uniforms.get('u_colorTexB') ?? null, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, slotB?.depthTex ?? this.fallbackMidDepthTex);
    gl.uniform1i(this.uniforms.get('u_depthTexB') ?? null, 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, titleTex ?? this.fallbackBlackTex);
    gl.uniform1i(this.uniforms.get('u_titleTex') ?? null, 4);

    // Uniforms deterministas (cero Math.random / performance.now)
    gl.uniform2f(this.uniforms.get('u_resolution') ?? null, width, height);
    gl.uniform1f(this.uniforms.get('u_imageAspectA') ?? null, slotA.aspect);
    gl.uniform1f(this.uniforms.get('u_imageAspectB') ?? null, slotB?.aspect ?? slotA.aspect);
    gl.uniform2f(
      this.uniforms.get('u_focalPointA') ?? null,
      input.focalPointA?.x ?? 0.5,
      input.focalPointA?.y ?? 0.44
    );
    gl.uniform2f(
      this.uniforms.get('u_focalPointB') ?? null,
      input.focalPointB?.x ?? 0.5,
      input.focalPointB?.y ?? 0.44
    );
    gl.uniform1f(this.uniforms.get('u_time') ?? null, normalizedT);
    gl.uniform1f(this.uniforms.get('u_beatElapsedSec') ?? null, clampedElapsed);
    gl.uniform1f(this.uniforms.get('u_frameIndex') ?? null, Math.max(0, Math.floor(input.frameIndex)));
    gl.uniform1f(this.uniforms.get('u_seed') ?? null, seedFloat);
    gl.uniform1f(
      this.uniforms.get('u_voiceRms') ?? null,
      Math.max(0, Math.min(1, Number(input.voiceRms) || 0))
    );
    gl.uniform1f(
      this.uniforms.get('u_impactTransient') ?? null,
      Math.max(0, Math.min(1, Number(input.impactTransient) || 0))
    );

    gl.uniform1i(this.uniforms.get('u_cameraPreset') ?? null, cameraPreset);
    gl.uniform1i(this.uniforms.get('u_shotType') ?? null, shotType);
    gl.uniform1f(this.uniforms.get('u_focusDepth') ?? null, focusDepth);
    gl.uniform1f(this.uniforms.get('u_aperture') ?? null, aperture);
    gl.uniform1i(this.uniforms.get('u_colorGradeMode') ?? null, colorGrade);
    gl.uniform1i(this.uniforms.get('u_particleTheme') ?? null, particleTheme);
    gl.uniform3f(this.uniforms.get('u_moodGlowColor') ?? null, moodGlow[0], moodGlow[1], moodGlow[2]);
    gl.uniform3f(this.uniforms.get('u_accentColor') ?? null, accentRgb[0], accentRgb[1], accentRgb[2]);

    gl.uniform1f(this.uniforms.get('u_hasTransition') ?? null, slotB ? 1.0 : 0.0);
    gl.uniform1f(
      this.uniforms.get('u_transitionT') ?? null,
      slotB ? Math.max(0, Math.min(1, input.transitionProgress)) : 1.0
    );
    gl.uniform1i(this.uniforms.get('u_transitionMode') ?? null, transitionMode);

    gl.uniform1f(this.uniforms.get('u_hasDepthTitle') ?? null, titleTex ? 1.0 : 0.0);
    gl.uniform1f(this.uniforms.get('u_titleOpacity') ?? null, titleOpacity);
    gl.uniform1f(this.uniforms.get('u_titleMaskThresh') ?? null, 0.58);
    gl.uniform1f(this.uniforms.get('u_isCommercial') ?? null, isCommercial ? 1.0 : 0.0);
    gl.uniform1f(this.uniforms.get('u_aiMicroCropA') ?? null, aiMicroCropA);
    gl.uniform1f(this.uniforms.get('u_aiMicroCropB') ?? null, aiMicroCropB);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  public dispose(): void {
    this.disposed = true;
    if (typeof HTMLCanvasElement !== 'undefined' && this.canvas instanceof HTMLCanvasElement) {
      this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    }

    if (this.gl && !this.contextLost) {
      const gl = this.gl;
      for (const slot of this.textureSlots.values()) {
        gl.deleteTexture(slot.colorTex);
        gl.deleteTexture(slot.depthTex);
      }
      if (this.fallbackBlackTex) gl.deleteTexture(this.fallbackBlackTex);
      if (this.fallbackMidDepthTex) gl.deleteTexture(this.fallbackMidDepthTex);
      if (this.titleTex) gl.deleteTexture(this.titleTex);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
    }

    this.textureSlots.clear();
    this.fallbackBlackTex = null;
    this.fallbackMidDepthTex = null;
    this.titleTex = null;
    this.titleCanvas = null;
    this.vao = null;
    this.program = null;
    this.gl = null;
  }
}
