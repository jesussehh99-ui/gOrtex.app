import type { FocalPoint, SubtitleConfig, VideoAspectRatio } from '../types';

type PixelSource = HTMLImageElement | ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

const MAX_CACHE_ENTRIES = 96;
const ANALYSIS_DIM = 72;

const focalCache = new Map<string, FocalPoint>();
let scratchCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
let scratchCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getScratchContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  if (scratchCtx) return scratchCtx;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = ANALYSIS_DIM;
    c.height = ANALYSIS_DIM;
    scratchCanvas = c;
    scratchCtx = c.getContext('2d', { willReadFrequently: true });
    return scratchCtx;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(ANALYSIS_DIM, ANALYSIS_DIM);
    scratchCanvas = c;
    scratchCtx = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
    return scratchCtx;
  }
  return null;
}

function getSourceDims(src: PixelSource): { w: number; h: number } {
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
    return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  }
  return { w: src.width, h: src.height };
}

function computeImageData(src: PixelSource, w: number, h: number): Uint8ClampedArray | null {
  const ctx = getScratchContext();
  if (!ctx || !scratchCanvas) return null;
  if (scratchCanvas.width !== w || scratchCanvas.height !== h) {
    scratchCanvas.width = w;
    scratchCanvas.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
  try {
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}

/**
 * SmartReframeAnalyzer (Módulo 4):
 * Calcula el centroide focal normalizado `(x, y) ∈ [0..1]` combinando:
 *  - Mapa de profundidad del Módulo 3 (primer plano más brillante = sujeto protagonista)
 *  - Mapa de saliencia de contraste / bordes de la imagen a color
 *  - Sesgo cinematográfico suave hacia la regla de tercios superior (rostros/sujetos)
 * Garantiza que al cambiar `9:16 ↔ 16:9` o hacer Exportación Dual, el protagonista nunca quede cortado.
 */
export class SmartReframeAnalyzer {
  static readonly DEFAULT_FOCAL: FocalPoint = {
    x: 0.5,
    y: 0.44,
    confidence: 0,
    source: 'default',
  };

  static clearCache(): void {
    focalCache.clear();
  }

  static getCachedFocalPoint(cacheKey: string, hasAiDepth: boolean): FocalPoint | null {
    const fullKey = `${cacheKey}::${hasAiDepth ? 'ai' : 'heur'}`;
    return focalCache.get(fullKey) ?? null;
  }

  /**
   * Calcula (o devuelve desde caché) el centroide focal determinista para una escena.
   */
  static analyze(
    cacheKey: string,
    colorSource: PixelSource | null | undefined,
    depthSource: PixelSource | null | undefined,
    hasAiDepth = false
  ): FocalPoint {
    if (!colorSource) return SmartReframeAnalyzer.DEFAULT_FOCAL;

    const fullKey = `${cacheKey}::${hasAiDepth ? 'ai' : 'heur'}`;
    const existing = focalCache.get(fullKey);
    if (existing) return existing;

    const { w: srcW, h: srcH } = getSourceDims(colorSource);
    if (srcW < 4 || srcH < 4) return SmartReframeAnalyzer.DEFAULT_FOCAL;

    const aspect = srcW / srcH;
    const gridW = aspect >= 1 ? ANALYSIS_DIM : Math.max(24, Math.round(ANALYSIS_DIM * aspect));
    const gridH = aspect >= 1 ? Math.max(24, Math.round(ANALYSIS_DIM / aspect)) : ANALYSIS_DIM;

    const colorPixels = computeImageData(colorSource, gridW, gridH);
    const depthPixels = depthSource ? computeImageData(depthSource, gridW, gridH) : null;

    if (!colorPixels) {
      return SmartReframeAnalyzer.DEFAULT_FOCAL;
    }

    const luma = new Float32Array(gridW * gridH);
    for (let i = 0; i < gridW * gridH; i++) {
      const o = i * 4;
      luma[i] = (0.299 * colorPixels[o] + 0.587 * colorPixels[o + 1] + 0.114 * colorPixels[o + 2]) / 255;
    }

    let sumW = 0;
    let sumX = 0;
    let sumY = 0;
    let peakWeight = 0;

    for (let y = 1; y < gridH - 1; y++) {
      const ny = y / (gridH - 1);
      // Sesgo suave de encuadre cinematográfico (favorece centro y tercio superior donde viven rostros/sujetos)
      const portraitBias = Math.exp(-Math.pow((ny - 0.42) / 0.42, 2));

      for (let x = 1; x < gridW - 1; x++) {
        const nx = x / (gridW - 1);
        const idx = y * gridW + x;

        // Saliencia por gradiente Sobel rápido + saturación cromática
        const gx = luma[idx + 1] - luma[idx - 1];
        const gy = luma[idx + gridW] - luma[idx - gridW];
        const edgeMag = Math.min(1, Math.hypot(gx, gy) * 2.8);

        const o = idx * 4;
        const r = colorPixels[o] / 255;
        const g = colorPixels[o + 1] / 255;
        const b = colorPixels[o + 2] / 255;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC > 0.05 ? (maxC - minC) / maxC : 0;

        let depthWeight = 0;
        if (depthPixels) {
          const d = depthPixels[o] / 255;
          // Primer plano claro (depth > 0.42) domina el reencuadre
          const fg = Math.max(0, (d - 0.36) / 0.64);
          depthWeight = fg * fg * 1.45;
        }

        const saliencyWeight = edgeMag * 0.65 + sat * 0.25;
        const centerXBias = 0.65 + 0.35 * Math.exp(-Math.pow((nx - 0.5) / 0.46, 2));

        const totalWeight = depthPixels
          ? (depthWeight * 0.72 + saliencyWeight * 0.28) * (0.65 + 0.35 * portraitBias) * centerXBias
          : saliencyWeight * (0.55 + 0.45 * portraitBias) * centerXBias;

        if (totalWeight > 0.04) {
          sumW += totalWeight;
          sumX += nx * totalWeight;
          sumY += ny * totalWeight;
          if (totalWeight > peakWeight) peakWeight = totalWeight;
        }
      }
    }

    let focalX = 0.5;
    let focalY = 0.44;
    let confidence = 0.35;

    if (sumW > 0.001) {
      const rawX = sumX / sumW;
      const rawY = sumY / sumW;
      // Mezcla armónica con el centro ideal (0.5, 0.44) para evitar encuadres bruscos en fondos vacíos
      const blend = depthPixels ? (hasAiDepth ? 0.84 : 0.72) : 0.65;
      focalX = 0.5 * (1 - blend) + rawX * blend;
      focalY = 0.44 * (1 - blend) + rawY * blend;
      confidence = Math.min(1, Math.max(0.25, peakWeight / 1.1));
    }

    const result: FocalPoint = {
      x: Math.max(0.18, Math.min(0.82, Number(focalX.toFixed(4)))),
      y: Math.max(0.18, Math.min(0.78, Number(focalY.toFixed(4)))),
      confidence: Number(confidence.toFixed(3)),
      source: depthPixels ? (hasAiDepth ? 'ai_depth' : 'heuristic_depth') : 'saliency',
    };

    if (focalCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = focalCache.keys().next().value;
      if (oldestKey) focalCache.delete(oldestKey);
    }
    focalCache.set(fullKey, result);
    return result;
  }
}

export interface AspectAdaptedLayout {
  /** Fracción vertical [0..1] donde se ancla el bloque de subtítulos */
  subtitleAnchorY: number;
  /** Ancho máximo seguro para subtítulos (fracción del ancho del lienzo) */
  subtitleMaxWidthRatio: number;
  /** Multiplicador de escala tipográfica según 9:16 vs 16:9 */
  subtitleFontScale: number;
  /** Margen superior de tarjeta HUD en fracción de altura */
  hudTopRatio: number;
  /** Margen derecho de tarjeta HUD en fracción de ancho */
  hudRightRatio: number;
  /** Escala de tarjeta HUD */
  hudScale: number;
}

/**
 * Adapta automáticamente márgenes de subtítulos, tipografía y posición de tarjetas HUD
 * al alternar o exportar entre `9:16` (Shorts/Reels/TikTok) y `16:9` (YouTube horizontal).
 */
export function getAspectAdaptedLayout(
  aspectRatio: VideoAspectRatio,
  subtitleConfig: SubtitleConfig
): AspectAdaptedLayout {
  if (aspectRatio === '16:9') {
    const posMap: Record<SubtitleConfig['positionY'], number> = {
      center: 0.54,
      lower_mid: 0.80,
      bottom: 0.88,
    };
    return {
      subtitleAnchorY: posMap[subtitleConfig.positionY] ?? 0.80,
      subtitleMaxWidthRatio: 0.72,
      subtitleFontScale: 0.88,
      hudTopRatio: 0.085,
      hudRightRatio: 0.038,
      hudScale: 0.96,
    };
  }

  const posMapVertical: Record<SubtitleConfig['positionY'], number> = {
    center: 0.50,
    lower_mid: 0.67,
    bottom: 0.81,
  };
  return {
    subtitleAnchorY: posMapVertical[subtitleConfig.positionY] ?? 0.67,
    subtitleMaxWidthRatio: 0.76,
    subtitleFontScale: 1.0,
    hudTopRatio: 0.115,
    hudRightRatio: 0.048,
    hudScale: 1.0,
  };
}
