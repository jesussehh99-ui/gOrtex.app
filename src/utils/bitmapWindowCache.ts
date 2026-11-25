/**
 * Gestor de Memoria Gráfica de Ventana Deslizante (Sliding-Window Cache, N = 3)
 * y compresión de recursos a Blob WebP.
 *
 * Reglas estrictas de ingeniería:
 * 1. Todos los recursos de imagen se almacenan comprimidos como `Blob` WebP (nunca <img> globales en RAM).
 * 2. Como máximo 3 fotogramas residen decodificados vía `createImageBitmap(blob)` en GPU/VRAM:
 *    `[beatIndex - 1, beatIndex, beatIndex + 1]`.
 * 3. Cualquier `ImageBitmap` que sale de la ventana activa (o que termina de decodificarse
 *    cuando la ventana ya avanzó) recibe obligatoriamente `bitmap.close()` para liberar VRAM al instante.
 */

export interface WebpCompressionResult {
  webpBlob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
}

function canvasToWebpBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/webp',
        quality
      );
    } catch {
      resolve(null);
    }
  });
}

async function encodeBitmapToWebp(
  bitmap: ImageBitmap,
  targetW: number,
  targetH: number,
  quality: number
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const offscreen = new OffscreenCanvas(targetW, targetH);
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);
        const blob = await offscreen.convertToBlob({ type: 'image/webp', quality });
        if (blob && blob.size > 0) return blob;
      }
    } catch {
      // Respaldo con HTMLCanvasElement si OffscreenCanvas no soporta image/webp
    }
  }

  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  return canvasToWebpBlob(canvas, quality);
}

/**
 * Clasificador rápido (64x64) de carteles amarillos de límite de tasa usando
 * un `ImageBitmap` temporal (sin crear elementos <img> DOM).
 */
export function isYellowRateLimitBitmap(bitmap: ImageBitmap): boolean {
  if (!bitmap.width || !bitmap.height) return true;
  if (bitmap.width < 128 || bitmap.height < 128) return true;

  try {
    const sampleW = 64;
    const sampleH = 64;
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    ctx.drawImage(bitmap, 0, 0, sampleW, sampleH);
    const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
    const totalPixels = sampleW * sampleH;

    let yellowPixels = 0;
    let pureDarkOrLight = 0;
    let flatPairs = 0;
    let totalPairs = 0;

    for (let y = 0; y < sampleH; y++) {
      for (let x = 0; x < sampleW; x++) {
        const idx = (y * sampleW + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (r >= 195 && g >= 150 && b <= 105 && r - b >= 105 && Math.abs(r - g) <= 75) {
          yellowPixels += 1;
        }
        if ((r <= 32 && g <= 32 && b <= 32) || (r >= 232 && g >= 232 && b >= 232)) {
          pureDarkOrLight += 1;
        }

        if (x + 1 < sampleW) {
          const nIdx = idx + 4;
          const diff =
            Math.abs(r - data[nIdx]) +
            Math.abs(g - data[nIdx + 1]) +
            Math.abs(b - data[nIdx + 2]);
          if (diff <= 10) flatPairs += 1;
          totalPairs += 1;
        }
      }
    }

    const yellowRatio = yellowPixels / totalPixels;
    const flatRatio = totalPairs > 0 ? flatPairs / totalPairs : 0;
    const monoRatio = pureDarkOrLight / totalPixels;

    if (yellowRatio >= 0.34 && flatRatio >= 0.52) return true;
    if (yellowRatio >= 0.14 && flatRatio >= 0.74 && yellowRatio + monoRatio >= 0.72) return true;
    if (flatRatio >= 0.94 && (yellowRatio >= 0.08 || monoRatio >= 0.9)) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Normaliza y comprime cualquier Blob de imagen (PNG/JPEG/WebP) a un Blob WebP compacto
 * junto con una miniatura WebP ligera (~220px) para las tarjetas de escenas.
 * Cierra inmediatamente el ImageBitmap temporal al terminar.
 */
export async function compressImageBlobToWebp(
  rawBlob: Blob,
  options?: {
    checkRateLimitBanner?: boolean;
    fullQuality?: number;
    thumbMaxDim?: number;
    thumbQuality?: number;
  }
): Promise<WebpCompressionResult | null> {
  const fullQuality = options?.fullQuality ?? 0.86;
  const thumbMaxDim = options?.thumbMaxDim ?? 220;
  const thumbQuality = options?.thumbQuality ?? 0.76;

  let tempBitmap: ImageBitmap | null = null;
  try {
    tempBitmap = await createImageBitmap(rawBlob);
    if (options?.checkRateLimitBanner && isYellowRateLimitBitmap(tempBitmap)) {
      return null;
    }

    const width = tempBitmap.width;
    const height = tempBitmap.height;

    const webpBlob =
      rawBlob.type === 'image/webp' && rawBlob.size <= 350_000
        ? rawBlob
        : (await encodeBitmapToWebp(tempBitmap, width, height, fullQuality)) ?? rawBlob;

    const thumbScale = Math.min(1, thumbMaxDim / Math.max(width, height));
    const thumbW = Math.max(32, Math.round(width * thumbScale));
    const thumbH = Math.max(32, Math.round(height * thumbScale));
    const thumbBlob =
      (await encodeBitmapToWebp(tempBitmap, thumbW, thumbH, thumbQuality)) ?? webpBlob;

    return { webpBlob, thumbBlob, width, height };
  } catch {
    return null;
  } finally {
    if (tempBitmap) {
      try {
        tempBitmap.close();
      } catch {
        // Silencioso
      }
    }
  }
}

// Caché comprimido de data URLs personalizadas -> Blob WebP (cero bitmaps decodificados aquí)
const customDataUrlBlobCache = new Map<string, Blob>();

export async function dataUrlToCompressedWebpBlob(dataUrl: string): Promise<Blob | null> {
  const cached = customDataUrlBlobCache.get(dataUrl);
  if (cached) return cached;

  try {
    const res = await fetch(dataUrl);
    const rawBlob = await res.blob();
    const compressed = await compressImageBlobToWebp(rawBlob, {
      checkRateLimitBanner: false,
      fullQuality: 0.86,
    });
    const finalBlob = compressed?.webpBlob ?? rawBlob;
    // Acotar caché de blobs personalizados a máximo 48 entradas
    if (customDataUrlBlobCache.size >= 48) {
      const oldestKey = customDataUrlBlobCache.keys().next().value;
      if (oldestKey) customDataUrlBlobCache.delete(oldestKey);
    }
    customDataUrlBlobCache.set(dataUrl, finalBlob);
    return finalBlob;
  } catch {
    return null;
  }
}

interface DecodedSlot {
  signature: string;
  bitmap: ImageBitmap;
}

export interface SlidingWindowResolver {
  getSignature: (beatIndex: number) => string | null;
  resolveBlob: (beatIndex: number) => Promise<Blob | null> | Blob | null;
}

export interface SceneBitmapCacheStats {
  openBitmapCount: number;
  maxWindowSize: number;
  activeIndices: number[];
}

/**
 * SceneBitmapCache (Sliding-Window Cache, N = 3):
 * Mantiene en VRAM únicamente los ImageBitmap de `[beatIndex - 1, beatIndex, beatIndex + 1]`.
 * Al mover la ventana, ejecuta obligatoriamente `bitmap.close()` de inmediato sobre los frames salientes.
 */
export class SceneBitmapCache {
  private static readonly activeInstances = new Set<SceneBitmapCache>();

  private readonly slots = new Map<number, DecodedSlot>();
  private readonly inflight = new Map<number, { signature: string; promise: Promise<ImageBitmap | null> }>();
  private activeIndices = new Set<number>();
  private disposed = false;
  private onChange?: () => void;
  private boundProjectId: string | null = null;

  constructor(onChange?: () => void, projectId?: string) {
    this.onChange = onChange;
    this.boundProjectId = projectId ?? null;
    SceneBitmapCache.activeInstances.add(this);
  }

  public setProjectId(projectId: string | null): void {
    this.boundProjectId = projectId;
  }

  /**
   * Evicción global de VRAM: invoca `bitmap.close()` inmediatamente sobre todos los
   * `ImageBitmap` abiertos pertenecientes a `projectId` en todas las instancias activas.
   */
  public static evictProject(projectId: string): number {
    let closedCount = 0;
    for (const instance of Array.from(SceneBitmapCache.activeInstances)) {
      closedCount += instance.evictProject(projectId);
    }
    return closedCount;
  }

  /**
   * Cierra (`bitmap.close()`) todos los slots decodificados pertenecientes a `projectId`.
   */
  public evictProject(projectId: string): number {
    if (!projectId) return 0;
    let closedCount = 0;
    const matchesWholeInstance = this.boundProjectId === projectId;

    for (const [idx, slot] of Array.from(this.slots.entries())) {
      if (matchesWholeInstance || slot.signature.includes(projectId)) {
        try {
          slot.bitmap.close();
          closedCount += 1;
        } catch {
          // Ya cerrado
        }
        this.slots.delete(idx);
      }
    }

    for (const [idx, req] of Array.from(this.inflight.entries())) {
      if (matchesWholeInstance || req.signature.includes(projectId)) {
        this.inflight.delete(idx);
      }
    }

    if (matchesWholeInstance) {
      this.activeIndices.clear();
    }

    if (closedCount > 0) {
      this.onChange?.();
    }
    return closedCount;
  }

  private computeWindowIndices(beatIndex: number, totalBeats: number): Set<number> {
    const next = new Set<number>();
    if (totalBeats <= 0) return next;
    const clamped = Math.max(0, Math.min(totalBeats - 1, beatIndex));
    for (let offset = -1; offset <= 1; offset++) {
      const idx = clamped + offset;
      if (idx >= 0 && idx < totalBeats) {
        next.add(idx);
      }
    }
    return next;
  }

  private evictOutsideWindow(allowed: Set<number>, resolver: SlidingWindowResolver): boolean {
    let changed = false;
    for (const [idx, slot] of Array.from(this.slots.entries())) {
      const currentSig = allowed.has(idx) ? resolver.getSignature(idx) : null;
      if (!allowed.has(idx) || !currentSig || currentSig !== slot.signature) {
        try {
          slot.bitmap.close();
        } catch {
          // Ya cerrado
        }
        this.slots.delete(idx);
        changed = true;
      }
    }
    return changed;
  }

  private decodeSlot(
    idx: number,
    signature: string,
    resolver: SlidingWindowResolver
  ): Promise<ImageBitmap | null> {
    const existing = this.slots.get(idx);
    if (existing && existing.signature === signature) {
      return Promise.resolve(existing.bitmap);
    }

    const currentInflight = this.inflight.get(idx);
    if (currentInflight && currentInflight.signature === signature) {
      return currentInflight.promise;
    }

    const entry: { signature: string; promise: Promise<ImageBitmap | null> } = {
      signature,
      promise: Promise.resolve(null),
    };

    entry.promise = (async (): Promise<ImageBitmap | null> => {
      let decoded: ImageBitmap | null = null;
      try {
        const blob = await resolver.resolveBlob(idx);
        if (!blob || this.disposed || !this.activeIndices.has(idx)) {
          return null;
        }
        decoded = await createImageBitmap(blob);

        // Verificar nuevamente tras el await: si el beat ya salió de la ventana N=3, liberar VRAM ya
        const latestSig = resolver.getSignature(idx);
        if (this.disposed || !this.activeIndices.has(idx) || latestSig !== signature) {
          decoded.close();
          return null;
        }

        const prev = this.slots.get(idx);
        if (prev && prev.bitmap !== decoded) {
          try {
            prev.bitmap.close();
          } catch {
            // Silencioso
          }
        }
        this.slots.set(idx, { signature, bitmap: decoded });
        this.onChange?.();
        return decoded;
      } catch {
        if (decoded) {
          try {
            decoded.close();
          } catch {
            // Silencioso
          }
        }
        return null;
      } finally {
        if (this.inflight.get(idx) === entry) {
          this.inflight.delete(idx);
        }
      }
    })();

    this.inflight.set(idx, entry);
    return entry.promise;
  }

  /**
   * Actualiza la ventana deslizante a `[beatIndex - 1, beatIndex, beatIndex + 1]`:
   * 1) Cierra inmediatamente (`bitmap.close()`) cualquier bitmap fuera de la ventana.
   * 2) Inicia `createImageBitmap(blob)` en segundo plano para los 3 slots activos.
   */
  public syncWindow(
    beatIndex: number,
    totalBeats: number,
    resolver: SlidingWindowResolver
  ): void {
    if (this.disposed) return;
    const allowed = this.computeWindowIndices(beatIndex, totalBeats);
    this.activeIndices = allowed;

    const evicted = this.evictOutsideWindow(allowed, resolver);

    // Priorizar el beat actual, luego el siguiente (+1) y el anterior (-1)
    const ordered = [beatIndex, beatIndex + 1, beatIndex - 1].filter((i) => allowed.has(i));
    for (const idx of ordered) {
      const sig = resolver.getSignature(idx);
      if (!sig) continue;
      const existing = this.slots.get(idx);
      if (!existing || existing.signature !== sig) {
        void this.decodeSlot(idx, sig, resolver);
      }
    }

    if (evicted) {
      this.onChange?.();
    }
  }

  /**
   * Garantiza que `beatIndex` (y `beatIndex - 1` para el cross-dissolve de 120ms)
   * estén decodificados antes de renderizar un fotograma de exportación determinista,
   * precargando `beatIndex + 1` y cerrando inmediatamente todo lo que sale de N = 3.
   */
  public async ensureWindowReadyForBeat(
    beatIndex: number,
    totalBeats: number,
    resolver: SlidingWindowResolver
  ): Promise<{ current: ImageBitmap | null; previous: ImageBitmap | null }> {
    if (this.disposed) return { current: null, previous: null };
    const allowed = this.computeWindowIndices(beatIndex, totalBeats);
    this.activeIndices = allowed;
    this.evictOutsideWindow(allowed, resolver);

    const curSig = allowed.has(beatIndex) ? resolver.getSignature(beatIndex) : null;
    const prevIdx = beatIndex - 1;
    const prevSig = allowed.has(prevIdx) ? resolver.getSignature(prevIdx) : null;
    const nextIdx = beatIndex + 1;
    const nextSig = allowed.has(nextIdx) ? resolver.getSignature(nextIdx) : null;

    const [current, previous] = await Promise.all([
      curSig ? this.decodeSlot(beatIndex, curSig, resolver) : Promise.resolve(null),
      prevSig ? this.decodeSlot(prevIdx, prevSig, resolver) : Promise.resolve(null),
    ]);

    // Pre-decodificar beatIndex + 1 sin bloquear el fotograma actual
    if (nextSig) {
      void this.decodeSlot(nextIdx, nextSig, resolver);
    }

    return { current, previous };
  }

  public getBitmap(beatIndex: number): ImageBitmap | null {
    return this.slots.get(beatIndex)?.bitmap ?? null;
  }

  public getOpenBitmapCount(): number {
    return this.slots.size;
  }

  public getStats(): SceneBitmapCacheStats {
    return {
      openBitmapCount: this.slots.size,
      maxWindowSize: 3,
      activeIndices: Array.from(this.activeIndices).sort((a, b) => a - b),
    };
  }

  public dispose(): void {
    this.disposed = true;
    SceneBitmapCache.activeInstances.delete(this);
    this.activeIndices.clear();
    this.inflight.clear();
    for (const slot of this.slots.values()) {
      try {
        slot.bitmap.close();
      } catch {
        // Silencioso
      }
    }
    this.slots.clear();
  }
}

export { SceneBitmapCache as SlidingWindowBitmapCache };
