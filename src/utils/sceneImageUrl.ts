import type {
  ScriptScene,
  Style3DId,
  VideoAspectRatio,
  ViralScript,
  VisualMoodPalette,
} from '../types';
import {
  drawCommercialCtaOverlay,
  drawCommercialSpecsHud,
} from './commercialCanvasOverlay';
import {
  deriveBeatSeed,
  deterministicFbm1D,
  deterministicNoise1D,
  hashSeed32,
  mulberry32,
  mulberry32At,
  PRNG_CHANNEL,
} from './deterministicPrng';
import { extractSceneHudMetric } from './visualKeywords';

const STYLE_PROMPT_SUFFIX: Record<Style3DId, string> = {
  viral_meme_3d:
    'stylized 3D Pixar-meme animation, expressive exaggerated characters, vibrant saturated colors, cinematic volumetric lighting, Octane render, ultra crisp detail',
  soft_storybook:
    'soft matte 3D storybook illustration, warm golden sunlight, charming rounded Pixar-inspired diorama, painterly textures, cozy cinematic lighting',
  flat_kids:
    'clean vibrant 3D vector-inspired educational illustration, bright friendly lighting, polished soft clay shading, crisp modern storytelling',
  paper_diorama:
    'handcrafted layered paper diorama art, tactile miniature shadows, warm theatrical spotlighting, intricate depth of field',
  pixar_dark:
    'cinematic dark Pixar 3D thriller animation, dramatic moody rim lighting, atmospheric mist, high-contrast film look, Octane render',
  ue5_realism:
    'photorealistic Unreal Engine 5 cinematic shot, volumetric fog, ultra detailed textures, dramatic 35mm film lens lighting',
  clay_suspense:
    'tactile stop-motion claymation 3D diorama, moody dramatic side lighting, handcrafted fingerprint textures, cinematic depth',
  stylized_thriller:
    'stylized Spider-Verse inspired 3D noir animation, dramatic chiaroscuro lighting, bold cinematic color palette, dynamic angle',
};

const MOOD_ATMOSPHERE: Record<
  VisualMoodPalette,
  { bgTop: string; bgBottom: string; glow: string; particle: string; speedLines: boolean }
> = {
  warm_energy: {
    bgTop: '#1F130B',
    bgBottom: '#0B090C',
    glow: 'rgba(249, 115, 22, 0.34)',
    particle: '#FDBA74',
    speedLines: false,
  },
  neon_science: {
    bgTop: '#0B122A',
    bgBottom: '#070912',
    glow: 'rgba(56, 189, 248, 0.34)',
    particle: '#7DD3FC',
    speedLines: false,
  },
  crimson_pulse: {
    bgTop: '#240A12',
    bgBottom: '#09070B',
    glow: 'rgba(244, 63, 94, 0.36)',
    particle: '#FDA4AF',
    speedLines: true,
  },
  emerald_vitality: {
    bgTop: '#081F1A',
    bgBottom: '#070B0D',
    glow: 'rgba(16, 185, 129, 0.32)',
    particle: '#6EE7B7',
    speedLines: false,
  },
  golden_history: {
    bgTop: '#23190B',
    bgBottom: '#0A0908',
    glow: 'rgba(245, 158, 11, 0.35)',
    particle: '#FDE68A',
    speedLines: false,
  },
  alert_stress: {
    bgTop: '#260C0B',
    bgBottom: '#09080B',
    glow: 'rgba(239, 68, 68, 0.42)',
    particle: '#FCA5A5',
    speedLines: true,
  },
  cosmic_indigo: {
    bgTop: '#120C2B',
    bgBottom: '#060711',
    glow: 'rgba(139, 92, 246, 0.38)',
    particle: '#C4B5FD',
    speedLines: false,
  },
  wealth_gold: {
    bgTop: '#191A0B',
    bgBottom: '#080A09',
    glow: 'rgba(234, 179, 8, 0.35)',
    particle: '#FEF08A',
    speedLines: false,
  },
  calm_storybook: {
    bgTop: '#111A29',
    bgBottom: '#090D14',
    glow: 'rgba(96, 165, 250, 0.3)',
    particle: '#BAE6FD',
    speedLines: false,
  },
  cyber_cyan: {
    bgTop: '#071D26',
    bgBottom: '#060A0F',
    glow: 'rgba(6, 182, 212, 0.36)',
    particle: '#67E8F9',
    speedLines: true,
  },
};

// Utilidades de semilla delegadas a hashSeed32 en deterministicPrng.ts

export function computeDefaultSceneSeed(scriptId: string, sceneId: string, order: number): number {
  const hashed = hashSeed32(`${scriptId}:${sceneId}:${order}:gortex`);
  return (hashed % 899999) + 100001;
}

export function generateRandomSceneSeed(previousSeed?: number): number {
  const base = previousSeed && Number.isFinite(previousSeed) ? Math.floor(previousSeed) : 197731;
  const rng = mulberry32(deriveBeatSeed(base, 1, 97));
  let next = Math.floor(100000 + rng() * 899999);
  if (previousSeed && next === previousSeed) {
    next = ((next + 7919) % 899999) + 100000;
  }
  return next;
}

export function resolveSceneSeed(
  scene: ScriptScene,
  scriptId: string,
  overrideSeed?: number
): number {
  if (typeof overrideSeed === 'number' && Number.isFinite(overrideSeed) && overrideSeed > 0) {
    return Math.floor(overrideSeed);
  }
  if (typeof scene.imageSeed === 'number' && Number.isFinite(scene.imageSeed) && scene.imageSeed > 0) {
    return Math.floor(scene.imageSeed);
  }
  return computeDefaultSceneSeed(scriptId, scene.id, scene.orden);
}

export const MICRO_CUT_PERIOD_SEC = 3.4;

export function buildSceneImagePrompt(
  scene: ScriptScene,
  script: ViralScript,
  aspectRatio: VideoAspectRatio
): string {
  const rawBase =
    (scene.imagePrompt && scene.imagePrompt.trim()) ||
    (scene.visualSpec?.flowPrompt && scene.visualSpec.flowPrompt.trim()) ||
    (scene.promptVisual3D && scene.promptVisual3D.trim()) ||
    `${scene.narracion} — cinematic 3D scene`;

  const cleanBase = rawBase
    .replace(/\s+/g, ' ')
    .replace(/["`]/g, '')
    .trim();

  // Inyección automática de visualBible (Character & World Lock) para consistencia total entre escenas
  const biblePrefix = script.visualBible?.fixedPrefixPrompt
    ?.replace(/\s+/g, ' ')
    .replace(/["`]/g, '')
    .trim();
  const baseWithBible =
    biblePrefix &&
    biblePrefix.length >= 12 &&
    !cleanBase.toLowerCase().includes(biblePrefix.slice(0, 28).toLowerCase())
      ? `${biblePrefix}, ${cleanBase}`
      : cleanBase;

  const framingNote =
    aspectRatio === '16:9' ? 'widescreen 16:9 composition' : 'vertical 9:16 composition';

  // En modo Comercial & Bienes Raíces: siempre fotografía editorial/arquitectónica fotorrealista (nunca Pixar/3D cartoon)
  if (script.studioMode === 'commercial_real_estate') {
    const commercialSuffix =
      'editorial real estate and commercial photography, golden-hour natural daylight, 16mm architectural lens clarity, ultra sharp natural textures, photorealistic, no text, no logos, no watermark';
    const hasPhotoKeywords = /photorealistic|architectural digest|editorial photography|commercial photography|16mm|golden hour/i.test(
      baseWithBible
    );
    const combinedCommercial = hasPhotoKeywords
      ? `${baseWithBible}, ${framingNote}, natural daylight, crisp lens, no text, no watermark`
      : `${baseWithBible}, ${commercialSuffix}, ${framingNote}`;
    return combinedCommercial.length > 420
      ? `${combinedCommercial.slice(0, 416).trim()}...`
      : combinedCommercial;
  }

  const styleSuffix = STYLE_PROMPT_SUFFIX[script.estilo3D] ?? STYLE_PROMPT_SUFFIX.viral_meme_3d;
  const hasStyleKeywords = /3d|pixar|diorama|unreal|clay|octane|storybook|illustration/i.test(
    baseWithBible
  );

  const combined = hasStyleKeywords
    ? `${baseWithBible}, ${framingNote}, rich cinematic lighting, no text, no watermark`
    : `${baseWithBible}, ${styleSuffix}, ${framingNote}, no text, no watermark`;

  return combined.length > 420 ? `${combined.slice(0, 416).trim()}...` : combined;
}

export function buildPollinationsSceneImageUrl(
  scene: ScriptScene,
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  overrideSeed?: number,
  options?: { thumbnail?: boolean; useProxy?: boolean }
): string {
  const prompt = buildSceneImagePrompt(scene, script, aspectRatio);
  const seed = resolveSceneSeed(scene, script.id, overrideSeed);
  const isThumb = Boolean(options?.thumbnail);
  const width = aspectRatio === '16:9' ? (isThumb ? 640 : 1280) : isThumb ? 432 : 720;
  const height = aspectRatio === '16:9' ? (isThumb ? 360 : 720) : isThumb ? 768 : 1280;

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

export function getSceneMoodColors(scene?: ScriptScene) {
  const palette: VisualMoodPalette = scene?.visualSpec?.moodPalette ?? 'warm_energy';
  return MOOD_ATMOSPHERE[palette] ?? MOOD_ATMOSPHERE.warm_energy;
}

// Patrón procedural de micro-grano 35mm sembrado determinísticamente con Mulberry32
let cachedFilmGrainCanvas: HTMLCanvasElement | null = null;
function getFilmGrainTile(): HTMLCanvasElement | null {
  if (cachedFilmGrainCanvas) return cachedFilmGrainCanvas;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const gctx = tile.getContext('2d');
  if (!gctx) return null;
  const imgData = gctx.createImageData(size, size);
  const data = imgData.data;
  const rng = mulberry32(0x19770815);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.floor(rng() * 256);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 28;
  }
  gctx.putImageData(imgData, 0, 0);
  cachedFilmGrainCanvas = tile;
  return tile;
}

type ForegroundParticleTheme = 'abyss_bubbles' | 'space_static' | 'ember_sparks' | 'luminous_dust';

function resolveForegroundParticleTheme(scene?: ScriptScene, script?: ViralScript): ForegroundParticleTheme {
  const env = scene?.visualSpec?.environment;
  const palette = scene?.visualSpec?.moodPalette;
  const textHint = `${scene?.narracion ?? ''} ${script?.tituloViral ?? ''} ${script?.nicho ?? ''}`.toLowerCase();

  if (env === 'ocean_deep' || /submar|implosi|oc[eé]ano|abisal|profund|agua/.test(textHint)) {
    return 'abyss_bubbles';
  }
  if (
    env === 'space_cosmos' ||
    env === 'tech_studio' ||
    palette === 'cyber_cyan' ||
    palette === 'neon_science' ||
    palette === 'cosmic_indigo' ||
    /sagitario|big ear|espacio|radio|se[ñn]al|estrella|6equj5|galaxia/.test(textHint)
  ) {
    return 'space_static';
  }
  if (palette === 'alert_stress' || palette === 'crimson_pulse' || scene?.esGiro30s) {
    return 'ember_sparks';
  }
  return 'luminous_dust';
}

export type RenderableImageSource = ImageBitmap | HTMLImageElement;

function getImageSourceDimensions(src: RenderableImageSource | null | undefined): {
  width: number;
  height: number;
} {
  if (!src) return { width: 0, height: 0 };
  if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) {
    return { width: src.width, height: src.height };
  }
  const img = src as HTMLImageElement;
  return { width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 };
}

function drawCoverImageRotated(
  ctx: CanvasRenderingContext2D,
  img: RenderableImageSource,
  canvasW: number,
  canvasH: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  rotationRad: number,
  focalPoint?: { x: number; y: number }
) {
  const { width: srcW, height: srcH } = getImageSourceDimensions(img);
  if (srcW <= 0 || srcH <= 0) return;

  const imgRatio = srcW / Math.max(1, srcH);
  const canvasRatio = canvasW / canvasH;
  let drawW = canvasW;
  let drawH = canvasH;
  if (imgRatio > canvasRatio) {
    drawH = canvasH;
    drawW = canvasH * imgRatio;
  } else {
    drawW = canvasW;
    drawH = canvasW / imgRatio;
  }

  const scaledW = drawW * scale;
  const scaledH = drawH * scale;

  // Smart Reframe focal offset clamped safely so edges never expose black bars
  const fx = focalPoint?.x ?? 0.5;
  const fy = focalPoint?.y ?? 0.44;
  const maxShiftX = Math.max(0, (scaledW - canvasW) * 0.46);
  const maxShiftY = Math.max(0, (scaledH - canvasH) * 0.46);
  const focalShiftX = Math.max(-maxShiftX, Math.min(maxShiftX, (0.5 - fx) * scaledW));
  const focalShiftY = Math.max(-maxShiftY, Math.min(maxShiftY, (0.5 - fy) * scaledH));

  ctx.save();
  ctx.translate(canvasW / 2 + offsetX + focalShiftX, canvasH / 2 + offsetY + focalShiftY);
  if (Math.abs(rotationRad) > 0.0001) {
    ctx.rotate(rotationRad);
  }
  ctx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
  ctx.restore();
}

/**
 * Post-procesado y Color Grading unificado de estudio 3D (100% determinista en función de t):
 * - Split-toning sutil (sombras frías azul-petróleo + altas luces cálidas/acento)
 * - Bloom / Glow volumétrico evaluado vía noise(t) sembrado con Mulberry32
 * - Viñeta cinematográfica dinámica
 * - Micro-grano 35mm cuantizado a 24fps deterministas con offsets Mulberry32
 */
export function applyStudioPostProcessing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: {
    moodGlow: string;
    accentColor: string;
    normalizedT: number;
    sceneDuration: number;
    projectSeed: number;
    beatIndex: number;
    wordPulse: number;
    tensionBoost?: number;
    isCommercial?: boolean;
  }
) {
  const {
    moodGlow,
    accentColor,
    normalizedT,
    sceneDuration,
    projectSeed,
    beatIndex,
    wordPulse,
    tensionBoost = 0,
    isCommercial = false,
  } = opts;

  if (isCommercial) {
    // Acabado editorial luminoso (luz natural cálida + scrim inferior suave para legibilidad de subtítulos, cero grano oscuro)
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const warmGrad = ctx.createLinearGradient(0, 0, width, height);
    warmGrad.addColorStop(0, 'rgba(255, 244, 224, 0.14)');
    warmGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.04)');
    warmGrad.addColorStop(1, 'rgba(251, 191, 36, 0.10)');
    ctx.fillStyle = warmGrad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    const softScrim = ctx.createLinearGradient(0, 0, 0, height);
    softScrim.addColorStop(0, 'rgba(15, 23, 42, 0.12)');
    softScrim.addColorStop(0.22, 'rgba(15, 23, 42, 0)');
    softScrim.addColorStop(0.66, 'rgba(15, 23, 42, 0.02)');
    softScrim.addColorStop(0.84, 'rgba(15, 23, 42, 0.24)');
    softScrim.addColorStop(1, 'rgba(15, 23, 42, 0.44)');
    ctx.fillStyle = softScrim;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const t = Math.max(0, Math.min(1, normalizedT));
  const beatTimeSec = t * Math.max(0.5, sceneDuration);
  const lightSeed = deriveBeatSeed(projectSeed, beatIndex, PRNG_CHANNEL.LIGHTING);
  const grainSeed = deriveBeatSeed(projectSeed, beatIndex, PRNG_CHANNEL.FILM_GRAIN);

  // 1) Color Grading unificado (contraste cinematográfico suave)
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const gradeGrad = ctx.createLinearGradient(0, 0, width * 0.25, height);
  gradeGrad.addColorStop(0, 'rgba(38, 92, 138, 0.22)');
  gradeGrad.addColorStop(0.52, 'rgba(18, 22, 34, 0.08)');
  gradeGrad.addColorStop(1, 'rgba(249, 115, 22, 0.16)');
  ctx.fillStyle = gradeGrad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // 2) Bloom / Glow volumétrico con fluctuaciones suaves deterministas noise(t)
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const bloomDriftX = deterministicFbm1D(lightSeed, t * 2.2) * 0.085;
  const bloomDriftY = deterministicFbm1D(lightSeed + 31, t * 1.8 + 4.1) * 0.055;
  const lightFlicker = deterministicNoise1D(lightSeed + 73, t * 6.5) * 0.045;
  const bloomX = width * (0.5 + bloomDriftX);
  const bloomY = height * (0.34 + bloomDriftY);
  const bloomR = Math.max(width, height) * (0.48 + wordPulse * 0.06);
  const bloomGrad = ctx.createRadialGradient(bloomX, bloomY, width * 0.02, bloomX, bloomY, bloomR);
  bloomGrad.addColorStop(0, moodGlow);
  bloomGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.055)');
  bloomGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = Math.max(0.18, Math.min(0.65, 0.34 + lightFlicker + wordPulse * 0.18 + tensionBoost * 0.12));
  ctx.fillStyle = bloomGrad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // 3) Viñeta cinematográfica dinámica (radial) + scrim inferior para legibilidad 4.5:1
  const vigInner = Math.min(width, height) * (0.34 - tensionBoost * 0.04);
  const vigOuter = Math.hypot(width, height) * 0.64;
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.46,
    vigInner,
    width * 0.5,
    height * 0.48,
    vigOuter
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.68, 'rgba(4, 6, 12, 0.24)');
  vignette.addColorStop(1, `rgba(2, 4, 9, ${(0.72 + tensionBoost * 0.1).toFixed(2)})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const scrim = ctx.createLinearGradient(0, 0, 0, height);
  scrim.addColorStop(0, 'rgba(0, 0, 0, 0.36)');
  scrim.addColorStop(0.22, 'rgba(0, 0, 0, 0.02)');
  scrim.addColorStop(0.62, 'rgba(0, 0, 0, 0.08)');
  scrim.addColorStop(0.8, 'rgba(0, 0, 0, 0.48)');
  scrim.addColorStop(1, 'rgba(0, 0, 0, 0.84)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, height);

  // 4) Micro-grano de película 35mm determinista (24fps cuantizado desde t, desplazado con Mulberry32)
  const grainTile = getFilmGrainTile();
  if (grainTile) {
    const grainFrame = Math.floor(beatTimeSec * 24);
    const gx = -Math.floor(mulberry32At(grainSeed, grainFrame * 2) * 128);
    const gy = -Math.floor(mulberry32At(grainSeed, grainFrame * 2 + 1) * 128);
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.globalCompositeOperation = 'overlay';
    const pattern = ctx.createPattern(grainTile, 'repeat');
    if (pattern) {
      ctx.translate(gx, gy);
      ctx.fillStyle = pattern;
      ctx.fillRect(-gx, -gy, width + 128, height + 128);
    }
    ctx.restore();
  }

  // Destello de borde cromático ultra-sutil en impactos fuertes
  if (wordPulse > 0.55) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (wordPulse - 0.55) * 0.22;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = Math.max(2, width * 0.005);
    ctx.strokeRect(2, 2, width - 4, height - 4);
    ctx.restore();
  }
}

/**
 * Capa frontal (Plano 3) de partículas atmosféricas cercanas a la lente con paralaje 1.85x,
 * 100% determinista vía Mulberry32(projectSeed + beatIndex) y tiempo normalizado `t`.
 */
function drawForegroundAtmosphericParticles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: {
    theme: ForegroundParticleTheme;
    projectSeed: number;
    beatIndex: number;
    normalizedT: number;
    sceneDuration: number;
    wordPulse: number;
    cameraPanX: number;
    cameraPanY: number;
    particleColor: string;
    accentColor: string;
  }
) {
  const {
    theme,
    projectSeed,
    beatIndex,
    normalizedT,
    sceneDuration,
    wordPulse,
    cameraPanX,
    cameraPanY,
    particleColor,
    accentColor,
  } = opts;

  const t = Math.max(0, Math.min(1, normalizedT));
  const beatTimeSec = t * Math.max(0.5, sceneDuration);
  const particleSeed = deriveBeatSeed(projectSeed, beatIndex, PRNG_CHANNEL.PARTICLES);
  const rng = mulberry32(particleSeed);

  const scaleRef = width / 720;
  const parallaxX = -cameraPanX * 1.85;
  const parallaxY = -cameraPanY * 1.65;

  ctx.save();

  if (theme === 'abyss_bubbles') {
    for (let i = 0; i < 18; i++) {
      const baseX = rng();
      const baseY = rng();
      const phaseOffset = rng() * 10;
      const radiusVar = rng();
      const depthLayer = i < 6 ? 1.55 : 0.9;
      const speed = (0.055 + (i % 5) * 0.018) * depthLayer;
      const yNorm = (((baseY - beatTimeSec * speed) % 1) + 1) % 1;
      const xDrift = deterministicNoise1D(particleSeed + i * 17, t * 2.6 + phaseOffset) * 0.036;
      const xNorm = baseX + xDrift;
      const px =
        ((((xNorm * width + parallaxX * depthLayer) % (width + 40)) + (width + 40)) % (width + 40)) -
        20;
      const py =
        ((((yNorm * height + parallaxY * depthLayer) % (height + 40)) + (height + 40)) %
          (height + 40)) -
        20;
      const r = (i < 6 ? 5.2 + radiusVar * 6.2 : 1.6 + radiusVar * 3.2) * scaleRef;

      ctx.globalAlpha = (i < 6 ? 0.24 : 0.34) + wordPulse * 0.14;
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.85)';
      ctx.lineWidth = Math.max(1, 1.3 * scaleRef);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(224, 242, 254, 0.55)';
      ctx.beginPath();
      ctx.arc(px - r * 0.32, py - r * 0.32, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === 'space_static') {
    for (let i = 0; i < 24; i++) {
      const baseX = rng();
      const baseY = rng();
      const twinklePhase = rng() * 8;
      const radiusVar = rng();
      const nearLens = i < 6;
      const speed = nearLens ? 0.05 : 0.022 + (i % 4) * 0.008;
      const yNorm = (((baseY - beatTimeSec * speed) % 1) + 1) % 1;
      const xNorm = (((baseX + beatTimeSec * (nearLens ? 0.015 : 0.004)) % 1) + 1) % 1;
      const px = xNorm * width + parallaxX * (nearLens ? 1.35 : 0.65);
      const py = yNorm * height + parallaxY * (nearLens ? 1.25 : 0.6);
      const r =
        (nearLens ? 3.8 + radiusVar * 4.4 : 1.1 + radiusVar * 1.5) *
        scaleRef *
        (1 + wordPulse * 0.3);

      const twinkle = 0.5 + 0.5 * deterministicNoise1D(particleSeed + i * 23, t * 4.2 + twinklePhase);
      if (nearLens) {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.4);
        g.addColorStop(0, i % 2 === 0 ? '#67E8F9' : accentColor);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.16 + twinkle * 0.18 + wordPulse * 0.15;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.18 + twinkle * 0.38;
        ctx.fillStyle = i % 4 === 0 ? '#67E8F9' : '#E2E8F0';
        ctx.fillRect(px, py, r * 1.4, r * 1.4);
      }
    }

    if (wordPulse > 0.25) {
      ctx.globalAlpha = wordPulse * 0.2;
      ctx.fillStyle = '#67E8F9';
      const scanStep = Math.floor(beatTimeSec * 24);
      for (let s = 0; s < 3; s++) {
        const sy = mulberry32At(particleSeed + 911, scanStep * 3 + s) * height;
        ctx.fillRect(0, sy, width, Math.max(1, 1.8 * scaleRef));
      }
    }
  } else if (theme === 'ember_sparks') {
    for (let i = 0; i < 20; i++) {
      const baseX = rng();
      const baseY = rng();
      const turbPhase = rng() * 12;
      const radiusVar = rng();
      const nearLens = i < 5;
      const speed = (0.075 + (i % 5) * 0.024) * (nearLens ? 1.4 : 1);
      const yNorm = (((baseY - beatTimeSec * speed) % 1) + 1) % 1;
      const xDrift = deterministicNoise1D(particleSeed + i * 19, t * 3.4 + turbPhase) * 0.048;
      const xNorm = baseX + xDrift;
      const px = xNorm * width + parallaxX * (nearLens ? 1.4 : 0.8);
      const py = yNorm * height + parallaxY * (nearLens ? 1.3 : 0.75);
      const r = (nearLens ? 4.4 + radiusVar * 3.6 : 1.4 + radiusVar * 1.8) * scaleRef;

      ctx.globalAlpha = (0.24 + wordPulse * 0.28) * (1 - yNorm * 0.3);
      ctx.fillStyle = i % 2 === 0 ? '#FF5A1F' : '#FDE047';
      ctx.beginPath();
      ctx.ellipse(px, py, r * 0.85, r * 1.65, 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (let i = 0; i < 18; i++) {
      const baseX = rng();
      const baseY = rng();
      const driftPhase = rng() * 10;
      const radiusVar = rng();
      const nearLens = i < 5;
      const speed = (0.032 + (i % 5) * 0.012) * (nearLens ? 1.45 : 1);
      const yNorm = (((baseY - beatTimeSec * speed) % 1) + 1) % 1;
      const xDrift = deterministicNoise1D(particleSeed + i * 13, t * 2.0 + driftPhase) * 0.036;
      const xNorm = baseX + xDrift;
      const px = xNorm * width + parallaxX * (nearLens ? 1.4 : 0.75);
      const py = yNorm * height + parallaxY * (nearLens ? 1.3 : 0.7);
      const r = (nearLens ? 5.5 + radiusVar * 5.2 : 1.4 + radiusVar * 2.4) * scaleRef;

      if (nearLens) {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2);
        g.addColorStop(0, i % 2 === 0 ? accentColor : particleColor);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.14 + wordPulse * 0.14;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r * 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const shimmer = deterministicNoise1D(particleSeed + i * 29, t * 3.1 + driftPhase);
        ctx.globalAlpha = 0.22 + shimmer * 0.12 + wordPulse * 0.15;
        ctx.fillStyle = i % 3 === 0 ? accentColor : particleColor;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

/**
 * Motion Graphics automático: Tarjeta HUD 3D oscura animada en la zona superior segura
 * con conteo rápido sincronizado al inicio de cada micro-escena que contenga cifras o códigos.
 */
export function drawSceneHudMetricCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: ScriptScene | undefined,
  localElapsed: number,
  sceneDuration: number,
  wordPulse: number
) {
  const metric = extractSceneHudMetric(scene);
  if (!metric) return;

  const isLandscape = width > height;
  const scaleRef = isLandscape ? width / 1280 : width / 720;

  // Curva de entrada con rebote elástico suave (0..0.34s) y salida limpia en últimos 0.22s
  const enterT = Math.min(1, Math.max(0, localElapsed / 0.34));
  const springScale =
    enterT < 1
      ? 0.78 + 0.22 * (1 - Math.exp(-7 * enterT) * Math.cos(enterT * Math.PI * 2.1))
      : 1 + wordPulse * 0.03;
  const exitT =
    sceneDuration > 1.2 && localElapsed > sceneDuration - 0.22
      ? Math.max(0, (sceneDuration - localElapsed) / 0.22)
      : 1;
  const alpha = Math.min(1, enterT * 2.4) * exitT;
  if (alpha <= 0.02) return;

  // Animación de conteo rápido al ritmo de la voz (primeros 0.72s del corte)
  const countT = Math.min(1, Math.max(0, localElapsed / 0.72));
  const easedCount = 1 - Math.pow(1 - countT, 3);

  let renderedValue = metric.displayFull;
  if (metric.numericTarget !== null) {
    const startBase =
      metric.numericTarget >= 1900 && metric.numericTarget <= 2035
        ? Math.max(1900, metric.numericTarget - 55)
        : 0;
    const curVal = startBase + (metric.numericTarget - startBase) * easedCount;
    const formatted =
      metric.decimals > 0
        ? curVal.toFixed(metric.decimals)
        : metric.useThousandsSep
          ? Math.round(curVal).toLocaleString('en-US')
          : String(Math.round(curVal));
    renderedValue = `${metric.prefix}${formatted}${metric.suffix}`;
  } else if (countT < 1) {
    // Decodificación rápida carácter por carácter para códigos (ej. 6EQUJ5)
    const glyphs = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const revealCount = Math.floor(easedCount * metric.displayFull.length);
    let scrambled = '';
    for (let i = 0; i < metric.displayFull.length; i++) {
      if (i < revealCount) {
        scrambled += metric.displayFull[i];
      } else {
        const idx = Math.abs(Math.floor(localElapsed * 38 + i * 7)) % glyphs.length;
        scrambled += glyphs[idx];
      }
    }
    renderedValue = scrambled;
  }

  const palette =
    metric.accentType === 'crimson'
      ? { border: 'rgba(255, 77, 45, 0.75)', glow: 'rgba(255, 59, 31, 0.42)', text: '#FF5A36' }
      : metric.accentType === 'cyan'
        ? { border: 'rgba(56, 189, 248, 0.78)', glow: 'rgba(6, 182, 212, 0.38)', text: '#67E8F9' }
        : { border: 'rgba(249, 115, 22, 0.78)', glow: 'rgba(249, 115, 22, 0.36)', text: '#FDBA74' };

  const valueFontSize = Math.round((isLandscape ? 42 : 44) * scaleRef);
  const kickerFontSize = Math.round((isLandscape ? 13 : 13.5) * scaleRef);
  const unitFontSize = Math.round((isLandscape ? 12 : 12.5) * scaleRef);

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.font = `800 ${valueFontSize}px "JetBrains Mono", "Plus Jakarta Sans", monospace`;
  const valWidth = ctx.measureText(renderedValue).width;
  ctx.font = `700 ${unitFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  const unitWidth = ctx.measureText(metric.unitLabel).width;

  const padX = Math.round(28 * scaleRef);
  const cardW = Math.min(width * 0.84, Math.max(valWidth, unitWidth, 160 * scaleRef) + padX * 2);
  const cardH = Math.round((isLandscape ? 92 : 98) * scaleRef);

  // Zona superior segura (debajo de barra superior de TikTok/Shorts/Reels)
  const centerX = width * 0.5;
  const targetY = height * (isLandscape ? 0.145 : 0.175);
  const slideOffset = (1 - enterT) * (-22 * scaleRef);

  ctx.translate(centerX, targetY + slideOffset);
  ctx.scale(springScale, springScale);

  const bx = -cardW / 2;
  const by = -cardH / 2;
  const radius = Math.round(16 * scaleRef);

  // Sombra 3D profunda + halo neón suave detrás de la tarjeta HUD
  ctx.save();
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = Math.round(26 * scaleRef);
  ctx.shadowOffsetY = Math.round(10 * scaleRef);

  const bgGrad = ctx.createLinearGradient(0, by, 0, by + cardH);
  bgGrad.addColorStop(0, 'rgba(15, 20, 32, 0.92)');
  bgGrad.addColorStop(1, 'rgba(6, 9, 16, 0.95)');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(bx, by, cardW, cardH, radius);
  } else {
    ctx.rect(bx, by, cardW, cardH);
  }
  ctx.fill();
  ctx.restore();

  // Borde biselado 3D + reflejo especular superior
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = Math.max(1.5, 2 * scaleRef);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(bx, by, cardW, cardH, radius);
  } else {
    ctx.rect(bx, by, cardW, cardH);
  }
  ctx.stroke();

  const gloss = ctx.createLinearGradient(bx, by, bx, by + cardH * 0.48);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gloss;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(bx + 2, by + 2, cardW - 4, cardH * 0.46, Math.max(6, radius - 2));
  } else {
    ctx.rect(bx + 2, by + 2, cardW - 4, cardH * 0.46);
  }
  ctx.fill();

  // Kicker superior (ej. REGISTRO / ARCHIVO)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${kickerFontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = palette.text;
  ctx.fillText(metric.kickerLabel, 0, by + cardH * 0.21);

  // Valor numérico gigante tabular con resplandor
  ctx.save();
  ctx.font = `800 ${valueFontSize}px "JetBrains Mono", "Plus Jakarta Sans", monospace`;
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = Math.round(14 * scaleRef);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(renderedValue, 0, by + cardH * 0.56);
  ctx.restore();

  // Etiqueta descriptiva inferior
  ctx.font = `600 ${unitFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(226, 232, 240, 0.82)';
  ctx.fillText(metric.unitLabel, 0, by + cardH * 0.84);

  ctx.restore();
}

export interface CinematicImageMotionOptions {
  width: number;
  height: number;
  image: RenderableImageSource | null;
  previousImage?: RenderableImageSource | null;
  crossDissolveDurationSec?: number;
  imageOpacity?: number;
  scene?: ScriptScene;
  previousScene?: ScriptScene;
  script?: ViralScript;
  beatIndex?: number;
  localElapsed: number;
  sceneDuration: number;
  wordPulse: number;
  accentColor?: string;
  isLoading?: boolean;
  showHudMetric?: boolean;
  focalPoint?: { x: number; y: number };
  previousFocalPoint?: { x: number; y: number };
}

function easeInOutSine(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return -(Math.cos(Math.PI * clamped) - 1) / 2;
}

/**
 * Motor de Composición Cinematográfica 2.5D Determinista Bit-a-Bit:
 * - Cero Math.random(), Date.now() o performance.now()
 * - Sembrado vía Mulberry32(projectSeed + beatIndex) y evaluado puramente en función de `t`
 * - Soporta ImageBitmap directamente desde la ventana deslizante N=3
 * - Cross-dissolve suave de 120ms entre micro-escenas + Ken Burns easeInOutSine (1.00 -> 1.07)
 */
export function drawCinematicImageMotionFrame(
  ctx: CanvasRenderingContext2D,
  opts: CinematicImageMotionOptions
) {
  const {
    width,
    height,
    image,
    previousImage = null,
    crossDissolveDurationSec = 0.12,
    imageOpacity = 1,
    scene,
    previousScene,
    script,
    beatIndex: explicitBeatIndex,
    localElapsed,
    sceneDuration,
    wordPulse,
    accentColor = '#F97316',
    isLoading = false,
    showHudMetric = true,
    focalPoint,
    previousFocalPoint,
  } = opts;

  const isCommercial = script?.studioMode === 'commercial_real_estate';
  const aiMicroCropScale =
    !scene?.mediaSource || scene.mediaSource === 'ai_generated' ? 1.05 : 1.0;
  const prevAiMicroCropScale = previousScene
    ? !previousScene.mediaSource || previousScene.mediaSource === 'ai_generated'
      ? 1.05
      : 1.0
    : aiMicroCropScale;

  const mood = getSceneMoodColors(scene);
  const beatIndex =
    typeof explicitBeatIndex === 'number'
      ? Math.max(0, explicitBeatIndex)
      : Math.max(0, (scene?.orden ?? 1) - 1);
  const projectSeed = hashSeed32(script?.id || 'gortex-default');
  const safeDur = Math.max(0.6, sceneDuration);

  // Tiempo normalizado puro t ∈ [0, 1] — idéntico en scrubbing, pausa, preview y MP4
  const clampedElapsed = Math.max(0, Math.min(safeDur, localElapsed));
  const t = clampedElapsed / safeDur;
  const smoothEase = easeInOutSine(t);

  const cameraSeed = deriveBeatSeed(projectSeed, beatIndex, PRNG_CHANNEL.CAMERA);
  const lightSeed = deriveBeatSeed(projectSeed, beatIndex, PRNG_CHANNEL.LIGHTING);
  const isClimaxScene = !isCommercial && Boolean(scene?.esGiro30s);
  const isViralStyle =
    !isCommercial &&
    (script?.estilo3D === 'viral_meme_3d' ||
      script?.publicoObjetivo === 'viral_meme' ||
      isClimaxScene);

  // Fondo base cinematográfico oscuro
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, mood.bgTop);
  bgGrad.addColorStop(0.55, '#070B14');
  bgGrad.addColorStop(1, mood.bgBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const imgDims = getImageSourceDimensions(image);
  const prevDims = getImageSourceDimensions(previousImage);

  const hasValidImage = Boolean(
    image && imgDims.width > 0 && imgDims.height > 0 && imageOpacity > 0.01
  );
  const hasValidPrevImage = Boolean(
    previousImage &&
      previousImage !== image &&
      prevDims.width > 0 &&
      prevDims.height > 0 &&
      crossDissolveDurationSec > 0 &&
      clampedElapsed >= 0 &&
      clampedElapsed < crossDissolveDurationSec
  );

  // Atmósfera profunda determinista mientras carga el arte AI
  if ((!hasValidImage && !hasValidPrevImage) || (imageOpacity < 0.99 && !hasValidPrevImage)) {
    const cx = width * (0.5 + deterministicNoise1D(lightSeed, t * 1.4) * 0.12);
    const cy = height * (0.42 + deterministicNoise1D(lightSeed + 19, t * 1.2 + 2.3) * 0.08);
    const radial = ctx.createRadialGradient(
      cx,
      cy,
      width * 0.03,
      width * 0.5,
      height * 0.45,
      Math.max(width, height) * 0.68
    );
    radial.addColorStop(0, mood.glow);
    radial.addColorStop(0.55, 'rgba(14, 24, 48, 0.22)');
    radial.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let r = 0; r < 3; r++) {
      const rayNoise = deterministicNoise1D(lightSeed + 41 + r * 11, t * 1.1);
      const rayX = width * (0.2 + r * 0.3 + rayNoise * 0.06);
      const rayW = width * (0.18 + (r % 2) * 0.08);
      const rayGrad = ctx.createLinearGradient(rayX, 0, rayX + rayW * 0.5, height * 0.85);
      rayGrad.addColorStop(0, mood.glow);
      rayGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.14 + wordPulse * 0.05;
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(rayX - rayW * 0.35, 0);
      ctx.lineTo(rayX + rayW * 0.35, 0);
      ctx.lineTo(rayX + rayW * 1.1, height * 0.9);
      ctx.lineTo(rayX - rayW * 0.2, height * 0.9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    if (isLoading) {
      const sweepPos = ((t * 1.6) % 1.8) - 0.4;
      const shimmer = ctx.createLinearGradient(
        width * (sweepPos - 0.22),
        0,
        width * (sweepPos + 0.22),
        height * 0.65
      );
      shimmer.addColorStop(0, 'rgba(255,255,255,0)');
      shimmer.addColorStop(0.5, 'rgba(255,255,255,0.045)');
      shimmer.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shimmer;
      ctx.fillRect(0, 0, width, height);
    }
  }

  let activeCamPanX = 0;
  let activeCamPanY = 0;

  // Cross-dissolve de 120ms puramente en función de clampedElapsed
  const dissolveRatio = hasValidPrevImage
    ? easeInOutSine(Math.min(1, Math.max(0, clampedElapsed / crossDissolveDurationSec)))
    : 1;

  if (hasValidPrevImage && previousImage) {
    const outgoingAlpha = Math.max(0, Math.min(1, 1 - dissolveRatio));
    if (outgoingAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = outgoingAlpha;
      drawCoverImageRotated(
        ctx,
        previousImage,
        width,
        height,
        1.03 * prevAiMicroCropScale,
        0,
        0,
        0,
        previousFocalPoint
      );
      ctx.restore();
    }
  }

  if (hasValidImage && image) {
    const shotPlan = beatIndex % 4;
    const maxPanX = width * 0.026;
    const maxPanY = height * 0.016;

    let baseScale = 1.0;
    let panX = 0;
    let panY = 0;
    let planTilt = 0;

    if (shotPlan === 0) {
      baseScale = 1.0 + smoothEase * 0.068;
      panX = (smoothEase - 0.5) * -maxPanX * 0.65;
      panY = (smoothEase - 0.5) * -maxPanY * 0.5;
    } else if (shotPlan === 1) {
      baseScale = 1.035 + smoothEase * 0.033;
      panX = (smoothEase - 0.5) * maxPanX * 1.45;
      panY = -height * 0.006 - smoothEase * (height * 0.008);
    } else if (shotPlan === 2) {
      baseScale = 1.068 - smoothEase * 0.058;
      const dir = beatIndex % 2 === 0 ? 1 : -1;
      panX = (smoothEase - 0.5) * -maxPanX * 1.15 * dir;
      panY = (smoothEase - 0.5) * maxPanY * 0.45;
      planTilt = 0.004 * dir * (smoothEase - 0.5);
    } else {
      baseScale = 1.01 + smoothEase * 0.06;
      panX = Math.sin(smoothEase * Math.PI) * maxPanX * 0.55;
      panY = (smoothEase - 0.5) * -maxPanY * 0.7;
    }

    // Deriva de lente y sacudida de clímax (suavizadas a gimbal limpio en modo comercial)
    const handheldX =
      deterministicFbm1D(cameraSeed, t * 2.4) * (width * (isCommercial ? 0.0008 : 0.0024));
    const handheldY =
      deterministicFbm1D(cameraSeed + 53, t * 2.1 + 3.7) * (height * (isCommercial ? 0.0006 : 0.002));

    const climaxPulse = isClimaxScene && wordPulse > 0.35 ? (wordPulse - 0.35) / 0.65 : 0;
    const climaxShakeAmp = climaxPulse * (width * 0.0055);
    const shakeX =
      climaxShakeAmp > 0 ? deterministicNoise1D(cameraSeed + 109, t * 28.0) * climaxShakeAmp : 0;
    const shakeY =
      climaxShakeAmp > 0
        ? deterministicNoise1D(cameraSeed + 157, t * 25.0 + 7.1) * climaxShakeAmp
        : 0;

    // Clamping cinematográfico [1.00, 1.07] multiplicado por micro-crop ~5% SOLO en imágenes generadas por IA (1.0 en fotos reales)
    const rawHeroScale = isCommercial
      ? Math.max(1.0, Math.min(1.055, baseScale))
      : Math.max(1.0, Math.min(1.07, baseScale + climaxPulse * 0.012));
    const heroScale = rawHeroScale * aiMicroCropScale;
    const heroOffsetX = panX + handheldX + shakeX;
    const heroOffsetY = panY + handheldY + shakeY;
    const microRot = isCommercial
      ? planTilt * 0.25
      : planTilt + deterministicNoise1D(cameraSeed + 211, t * 1.8) * 0.0028;

    activeCamPanX = heroOffsetX;
    activeCamPanY = heroOffsetY;

    const incomingAlpha = Math.max(
      0,
      Math.min(1, imageOpacity * (hasValidPrevImage ? dissolveRatio : 1))
    );

    if (isCommercial) {
      // En modo Comercial: encuadre arquitectónico limpio sin viñeta elíptica ni desenfoque artificial en bordes
      ctx.save();
      ctx.globalAlpha = incomingAlpha;
      drawCoverImageRotated(
        ctx,
        image,
        width,
        height,
        heroScale,
        heroOffsetX,
        heroOffsetY,
        microRot,
        focalPoint
      );
      ctx.restore();
    } else {
      // PLANO 1 (FONDO PARALAJE 2.5D)
      ctx.save();
      ctx.globalAlpha = incomingAlpha;
      ctx.filter = 'blur(7px) brightness(0.76) saturate(1.16)';
      drawCoverImageRotated(
        ctx,
        image,
        width,
        height,
        Math.max(1.08 * aiMicroCropScale, heroScale * 1.05),
        heroOffsetX * 0.36 - panX * 0.2,
        heroOffsetY * 0.36 - panY * 0.16,
        microRot * 0.4,
        focalPoint
      );
      ctx.restore();

      // PLANO 2 (SUJETO PRINCIPAL ENFOCO)
      ctx.save();
      ctx.globalAlpha = incomingAlpha;
      ctx.beginPath();
      ctx.ellipse(
        width * 0.5,
        height * 0.48,
        width * 0.58,
        height * 0.56,
        0,
        0,
        Math.PI * 2
      );
      ctx.clip();
      drawCoverImageRotated(
        ctx,
        image,
        width,
        height,
        heroScale,
        heroOffsetX,
        heroOffsetY,
        microRot,
        focalPoint
      );
      ctx.restore();
    }

    // Resplandor ambiental sutil solo en clímax narrativos
    if (isClimaxScene && climaxPulse > 0.2 && incomingAlpha > 0.7) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const glowAlpha = climaxPulse * 0.16;
      const glowGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        0,
        width * 0.5,
        height * 0.45,
        Math.max(width, height) * 0.65
      );
      glowGrad.addColorStop(0, `rgba(255, 255, 255, ${glowAlpha.toFixed(3)})`);
      glowGrad.addColorStop(0.55, mood.glow);
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  // PLANO 3 (PRIMER PLANO ATMOSFÉRICO): Solo en modo Viral/Storytelling (nunca partículas sobre arquitectura comercial)
  if (!isCommercial) {
    const particleTheme = resolveForegroundParticleTheme(scene, script);
    drawForegroundAtmosphericParticles(ctx, width, height, {
      theme: particleTheme,
      projectSeed,
      beatIndex,
      normalizedT: t,
      sceneDuration: safeDur,
      wordPulse,
      cameraPanX: activeCamPanX,
      cameraPanY: activeCamPanY,
      particleColor: mood.particle,
      accentColor,
    });

    // Líneas cinéticas sutiles en golpes de palabra clave o momentos virales
    if ((mood.speedLines || isViralStyle) && wordPulse > 0.24) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = Math.max(1.2, width * 0.0022);
      ctx.globalAlpha = wordPulse * 0.38;
      const cx = width * 0.5;
      const cy = height * 0.46;
      const outerR = Math.hypot(width, height) * 0.62;
      const innerR = Math.min(width, height) * 0.36;
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + beatIndex * 0.35;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * innerR, cy + Math.sin(ang) * innerR);
        ctx.lineTo(cx + Math.cos(ang) * outerR, cy + Math.sin(ang) * outerR);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // POST-PROCESADO UNIFICADO DETERMINISTA (Editorial limpio en Comercial; Grading + Bloom + Viñeta + Grano 35mm en Viral)
  applyStudioPostProcessing(ctx, width, height, {
    moodGlow: mood.glow,
    accentColor,
    normalizedT: t,
    sceneDuration: safeDur,
    projectSeed,
    beatIndex,
    wordPulse,
    tensionBoost: !isCommercial && scene?.esGiro30s ? 0.55 : 0,
    isCommercial,
  });

  // MOTION GRAPHICS AUTOMÁTICO: Fichas/CTA editoriales en Comercial, o Tarjeta HUD oscura en Viral
  if (showHudMetric) {
    if (isCommercial) {
      drawCommercialSpecsHud(ctx, width, height, scene, script, clampedElapsed, safeDur);
      drawCommercialCtaOverlay(ctx, width, height, scene, script, clampedElapsed, safeDur);
    } else {
      drawSceneHudMetricCard(ctx, width, height, scene, clampedElapsed, safeDur, wordPulse);
    }
  }
}

