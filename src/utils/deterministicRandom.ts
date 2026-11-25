import { findWordIndexForTime, type TimedWordToken } from './visualKeywords';

/**
 * Canales deterministas separados por subsistema visual y sonoro para garantizar
 * cero correlación indeseada entre partículas, grano 35mm, cámara, iluminación y foley.
 */
export const PRNG_CHANNEL = {
  PARTICLES: 101,
  FILM_GRAIN: 211,
  CAMERA: 307,
  LIGHTING: 401,
  HUD: 503,
  AUDIO_FOLEY: 613,
} as const;

export interface DeterministicFrameContext {
  projectId: string;
  projectSeed: number;
  beatIndex: number;
  beatSeed: number;
  fps: number;
  frameIndex: number;
  tSeconds: number;
  normalizedT: number;
}

/**
 * Hash FNV-1a de 32 bits sin signo (determinista bit a bit en cualquier motor JS).
 * Deriva automáticamente `projectSeed` a partir del `projectId`.
 */
export function hashSeed32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Mezcla determinista de 32 bits para derivar la semilla exacta de cada micro-escena:
 * `projectId + beatIndex` con dispersión avalancha por canal.
 */
export function deriveBeatSeed(
  projectSeed: number,
  beatIndex: number,
  channel = 0
): number {
  let s = ((projectSeed >>> 0) + Math.imul((beatIndex | 0) + 1, 0x9e3779b1)) >>> 0;
  s = (s + Math.imul((channel | 0) + 1, 0x85ebca6b)) >>> 0;
  s ^= s >>> 16;
  s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15;
  s = Math.imul(s, 0x846ca68b) >>> 0;
  s ^= s >>> 16;
  return s >>> 0;
}

/**
 * Construye el contexto puro de reloj determinista `(tSeconds, frameIndex, seed)`
 * a partir de `projectId + beatIndex`.
 */
export function createDeterministicFrameContext(
  projectId: string,
  beatIndex: number,
  tSeconds: number,
  sceneDurationSec: number,
  fps = 30
): DeterministicFrameContext {
  const safeDur = Math.max(0.5, sceneDurationSec);
  const clampedT = Math.max(0, Math.min(safeDur, tSeconds));
  const frameIndex = Math.max(0, Math.floor(clampedT * fps));
  const projectSeed = hashSeed32(projectId || 'gortex-default');
  const beatSeed = deriveBeatSeed(projectSeed, beatIndex, 0);
  return {
    projectId,
    projectSeed,
    beatIndex,
    beatSeed,
    fps,
    frameIndex,
    tSeconds: clampedT,
    normalizedT: clampedT / safeDur,
  };
}

/**
 * Generador Pseudoaleatorio Determinista Mulberry32 (estado de 32 bits).
 * Produce la misma secuencia bit a bit en todos los navegadores sin Math.random().
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Evalúa un valor determinista Mulberry32 en un índice entero `stepIndex` en O(1),
 * permitiendo acceso aleatorio puro sin depender del orden de fotogramas ni de reloj externo.
 */
export function mulberry32At(seed: number, stepIndex: number): number {
  const mixed = ((seed >>> 0) + Math.imul(stepIndex | 0, 0x6d2b79f5)) >>> 0;
  let t = Math.imul(mixed ^ (mixed >>> 15), 1 | mixed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Hash determinista 2D sobre una rejilla entera `(ix, iy)` para Value Noise 2D.
 */
function hashGrid2D(seed: number, ix: number, iy: number): number {
  let h = (seed >>> 0) ^ Math.imul(ix | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h ^= Math.imul(iy | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function quinticFade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Value Noise 1D suave y 100% determinista `noise1D(seed, x)` en el rango [-1, 1],
 * usando interpolación quíntica (C2 continua, estilo Perlin) sobre nodos Mulberry32.
 */
export function deterministicNoise1D(seed: number, x: number): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const u = quinticFade(xf);
  const v0 = mulberry32At(seed, xi) * 2 - 1;
  const v1 = mulberry32At(seed, xi + 1) * 2 - 1;
  return v0 + (v1 - v0) * u;
}

/**
 * Value Noise 2D suave y 100% determinista `noise2D(seed, x, y)` en el rango [-1, 1]
 * para turbulencia atmosférica, neblina volumétrica, grano 35mm y drift espacial de cámara.
 */
export function deterministicNoise2D(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = quinticFade(fx);
  const uy = quinticFade(fy);

  const n00 = hashGrid2D(seed, ix, iy) * 2 - 1;
  const n10 = hashGrid2D(seed, ix + 1, iy) * 2 - 1;
  const n01 = hashGrid2D(seed, ix, iy + 1) * 2 - 1;
  const n11 = hashGrid2D(seed, ix + 1, iy + 1) * 2 - 1;

  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

/**
 * Ruido fractal determinista 1D de 2 octavas (fBM) en [-1, 1] para movimientos
 * orgánicos de cámara, fluctuaciones de iluminación y sacudidas de clímax.
 */
export function deterministicFbm1D(seed: number, x: number): number {
  const n1 = deterministicNoise1D(seed, x);
  const n2 = deterministicNoise1D(deriveBeatSeed(seed, 7, 13), x * 2.07 + 11.3);
  return n1 * 0.68 + n2 * 0.32;
}

/**
 * Ruido fractal determinista 2D de 2 octavas (fBM 2D) en [-1, 1].
 */
export function deterministicFbm2D(seed: number, x: number, y: number): number {
  const n1 = deterministicNoise2D(seed, x, y);
  const n2 = deterministicNoise2D(
    deriveBeatSeed(seed, 19, 29),
    x * 2.03 + 7.1,
    y * 2.03 - 4.7
  );
  return n1 * 0.68 + n2 * 0.32;
}

/**
 * Evalúa el pulso de palabra (`wordPulse`) y el índice de palabra activa de forma
 * 100% pura a partir de `(timedTokens, localElapsed)`.
 * Garantiza resultados idénticos en scrubbing, pausa, preview en vivo y exportación MP4.
 */
export function computeDeterministicWordPulse(
  timedTokens: TimedWordToken[],
  localElapsed: number
): { wordIdx: number; wordPulse: number; isKeyword: boolean } {
  if (!timedTokens || timedTokens.length === 0) {
    return { wordIdx: 0, wordPulse: 0, isKeyword: false };
  }
  const safeElapsed = Math.max(0, localElapsed);
  const wordIdx = findWordIndexForTime(timedTokens, safeElapsed);
  const token = timedTokens[wordIdx];
  if (!token) {
    return { wordIdx: 0, wordPulse: 0, isKeyword: false };
  }
  const dt = Math.max(0, safeElapsed - token.startSec);
  const isKeyword = Boolean(token.isKeyword);
  const decayWindow = isKeyword ? 0.28 : 0.18;
  const rawPulse = Math.max(0, 1 - dt / decayWindow);
  const wordPulse = isKeyword ? Math.min(1, rawPulse * 1.32) : rawPulse * 0.85;
  return { wordIdx, wordPulse, isKeyword };
}
