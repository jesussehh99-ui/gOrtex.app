import type { BeatMediaSource, MultimodalPhotoInput } from '../types';
import { localDepthEngine } from '../utils/localDepthEngine';
import { mediaStorageService } from '../utils/mediaStorageService';

export const USER_VIDEO_SOFT_LIMIT_BYTES = 150 * 1024 * 1024; // 150 MB

export interface IngestedUserPhotoResult {
  mediaSource: 'user_photo';
  userMediaKey: string;
  mimeType: 'image/webp';
  width: number;
  height: number;
  aspectRatio: number;
  sizeBytes: number;
  webpBlob: Blob;
  thumbBlob: Blob;
  previewDataUrl: string;
}

export interface IngestedUserVideoResult {
  mediaSource: 'user_video';
  userMediaKey: string;
  mimeType: string;
  width: number;
  height: number;
  aspectRatio: number;
  durationSec: number;
  sizeBytes: number;
  sizeWarning: string | null;
  previewObjectUrl: string;
}

export interface PendingBatchMediaItem {
  id: string;
  file: File;
  kind: 'photo' | 'video';
  name: string;
  sizeBytes: number;
  previewUrl: string;
  aspectRatio?: number;
  sizeWarning?: string | null;
}

function blobToBase64Pure(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(blob);
  });
}

function blobToDataUrlSafe(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo convertir el Blob.'));
    reader.readAsDataURL(blob);
  });
}

async function decodeImageFileToBitmap(file: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo decodificar la imagen.'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 1280;
    canvas.height = img.naturalHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(img, 0, 0);
    return createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToBlobSafe(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error(`No se pudo codificar la imagen en ${mimeType}.`));
      },
      mimeType,
      quality
    );
  });
}

/**
 * Genera una miniatura JPEG temporal en memoria (máx 512px, calidad 0.72)
 * exclusiva para enviar a Gemini 2.5 Flash en modalidad multimodal sin agotar RAM ni tokens.
 */
export async function createMultimodalThumbnail(
  file: Blob,
  index: number,
  fileName?: string
): Promise<MultimodalPhotoInput> {
  const bitmap = await decodeImageFileToBitmap(file);
  try {
    const srcW = Math.max(1, bitmap.width);
    const srcH = Math.max(1, bitmap.height);
    const maxDim = 512;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No se pudo inicializar el lienzo para miniatura multimodal.');
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const jpegBlob = await canvasToBlobSafe(canvas, 'image/jpeg', 0.72);
    const base64Jpeg = await blobToBase64Pure(jpegBlob);
    return {
      index,
      label: `Foto ${index}`,
      fileName,
      base64Jpeg,
      aspectRatio: Number((srcW / srcH).toFixed(3)),
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Redimensiona una foto real del usuario a máximo 1920px en su lado mayor
 * y la convierte a WebP (calidad 0.88) + miniatura ligera WebP (240px) para listas de escenas.
 * Libera inmediatamente el ImageBitmap temporal con `bitmap.close()`.
 */
export async function compressUserPhotoToWebp(file: Blob): Promise<{
  webpBlob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
  aspectRatio: number;
}> {
  const bitmap = await decodeImageFileToBitmap(file);
  try {
    const srcW = Math.max(1, bitmap.width);
    const srcH = Math.max(1, bitmap.height);
    const maxEdge = 1920;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo inicializar el lienzo de compresión WebP.');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    let webpBlob: Blob;
    try {
      webpBlob = await canvasToBlobSafe(canvas, 'image/webp', 0.88);
    } catch {
      webpBlob = await canvasToBlobSafe(canvas, 'image/jpeg', 0.88);
    }

    // Miniatura ligera WebP (240px) para UI sin decodificar full-res
    const thumbScale = Math.min(1, 240 / Math.max(targetW, targetH));
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = Math.max(1, Math.round(targetW * thumbScale));
    thumbCanvas.height = Math.max(1, Math.round(targetH * thumbScale));
    const tCtx = thumbCanvas.getContext('2d');
    if (tCtx) {
      tCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    }
    let thumbBlob: Blob;
    try {
      thumbBlob = await canvasToBlobSafe(thumbCanvas, 'image/webp', 0.78);
    } catch {
      thumbBlob = webpBlob;
    }

    return {
      webpBlob,
      thumbBlob,
      width: targetW,
      height: targetH,
      aspectRatio: Number((targetW / targetH).toFixed(3)),
    };
  } finally {
    bitmap.close();
  }
}

export function buildUserBeatMediaFileName(beatId: string, kind: 'photo' | 'video'): string {
  const cleanBeat = beatId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return kind === 'photo' ? `user_beat_${cleanBeat}.webp` : `user_beat_${cleanBeat}.mp4`;
}

export function buildUserPhotoArtCacheKey(projectId: string, userMediaKey: string): string {
  return `userphoto::${projectId}::${userMediaKey}`;
}

/**
 * Ingesta una foto real del usuario para un beat:
 * 1) Redimensiona a máx 1920px + WebP 0.88
 * 2) Persiste en OPFS `gortex-media/projects/<projectId>/user_beat_<beatId>.webp`
 * 3) Encola mapa de profundidad TrueDepth 2.5D en `LocalDepthEngine` para paralaje real
 */
export async function ingestUserPhotoForBeat(
  projectId: string,
  beatId: string,
  file: Blob
): Promise<IngestedUserPhotoResult> {
  const compressed = await compressUserPhotoToWebp(file);
  const fileName = buildUserBeatMediaFileName(beatId, 'photo');
  const stored = await mediaStorageService.putProjectFile(projectId, fileName, compressed.webpBlob);

  // Encolar TrueDepth 2.5D sobre la foto real para animación de cámara cinematográfica
  const depthKey = buildUserPhotoArtCacheKey(projectId, stored.key);
  localDepthEngine.enqueueSceneDepth(depthKey, projectId, compressed.webpBlob, true);

  // Miniatura compacta en dataUrl para tarjetas de escena (ligera, ~12-25 KB)
  const previewDataUrl = await blobToDataUrlSafe(compressed.thumbBlob);

  return {
    mediaSource: 'user_photo',
    userMediaKey: stored.key,
    mimeType: 'image/webp',
    width: compressed.width,
    height: compressed.height,
    aspectRatio: compressed.aspectRatio,
    sizeBytes: stored.sizeBytes,
    webpBlob: compressed.webpBlob,
    thumbBlob: compressed.thumbBlob,
    previewDataUrl,
  };
}

async function probeVideoFileMetadata(
  blob: Blob
): Promise<{ width: number; height: number; durationSec: number }> {
  const tempUrl = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';

      let settled = false;
      const done = (width: number, height: number, durationSec: number) => {
        if (settled) return;
        settled = true;
        video.removeAttribute('src');
        video.load();
        resolve({ width, height, durationSec });
      };

      video.onloadedmetadata = () => {
        const w = Math.max(1, video.videoWidth || 1280);
        const h = Math.max(1, video.videoHeight || 720);
        const d =
          Number.isFinite(video.duration) && video.duration > 0 ? Number(video.duration.toFixed(2)) : 4;
        done(w, h, d);
      };
      video.onerror = () => done(1280, 720, 4);
      window.setTimeout(() => done(1280, 720, 4), 3500);
      video.src = tempUrl;
    });
  } finally {
    URL.revokeObjectURL(tempUrl);
  }
}

/**
 * Ingesta un clip de video real del usuario para un beat:
 * - Nunca extrae todos los frames a RAM.
 * - Valida límite blando de 150 MB (aviso no bloqueante).
 * - Guarda directamente el Blob en OPFS `gortex-media/projects/<projectId>/user_beat_<beatId>.mp4`.
 */
export async function ingestUserVideoForBeat(
  projectId: string,
  beatId: string,
  file: Blob
): Promise<IngestedUserVideoResult> {
  const sizeWarning =
    file.size > USER_VIDEO_SOFT_LIMIT_BYTES
      ? `Clip pesado (${(file.size / (1024 * 1024)).toFixed(1)} MB). Recomendamos clips menores a 150 MB para exportación rápida.`
      : null;

  const meta = await probeVideoFileMetadata(file);
  const fileName = buildUserBeatMediaFileName(beatId, 'video');
  const stored = await mediaStorageService.putProjectFile(projectId, fileName, file);
  const previewObjectUrl = URL.createObjectURL(file);

  return {
    mediaSource: 'user_video',
    userMediaKey: stored.key,
    mimeType: file.type || 'video/mp4',
    width: meta.width,
    height: meta.height,
    aspectRatio: Number((meta.width / Math.max(1, meta.height)).toFixed(3)),
    durationSec: meta.durationSec,
    sizeBytes: stored.sizeBytes,
    sizeWarning,
    previewObjectUrl,
  };
}

export async function loadUserMediaBlob(
  projectId: string,
  userMediaKey: string
): Promise<Blob | null> {
  if (!projectId || !userMediaKey) return null;
  return mediaStorageService.getProjectFile(projectId, userMediaKey);
}

export async function deleteUserMediaForBeat(
  projectId: string,
  userMediaKey?: string
): Promise<void> {
  if (!projectId || !userMediaKey) return;
  await mediaStorageService.deleteProjectFile(projectId, userMediaKey);
}

export function isUserMediaBeat(mediaSource?: BeatMediaSource): boolean {
  return mediaSource === 'user_photo' || mediaSource === 'user_video';
}

interface ActiveVideoSlot {
  beatIndex: number;
  signature: string;
  objectUrl: string | null;
  video: HTMLVideoElement;
  readyPromise: Promise<HTMLVideoElement | null>;
  isReady: boolean;
}

export interface SlidingWindowVideoSource {
  signature: string;
  /** URL directa existente (ej. clip en memoria) o función para leer el Blob desde OPFS */
  directUrl?: string;
  loadBlob?: () => Promise<Blob | null>;
}

/**
 * Pool deslizante estricto N = 3 para clips de video reales del usuario (`[beatIndex - 1, beatIndex, beatIndex + 1]`).
 * - Revoca inmediatamente los ObjectURLs y descarga `<video>` al salir de la ventana.
 * - Garantiza `<video muted playsInline preload="auto">` para que `AudioMasterPipeline` siga siendo el reloj maestro.
 */
export class SlidingWindowVideoPool {
  private readonly slots = new Map<number, ActiveVideoSlot>();

  public async ensureWindowForBeat(
    beatIndex: number,
    totalBeats: number,
    resolveSource: (idx: number) => SlidingWindowVideoSource | null
  ): Promise<HTMLVideoElement | null> {
    const keepIndices = new Set<number>();
    for (let offset = -1; offset <= 1; offset++) {
      const idx = beatIndex + offset;
      if (idx >= 0 && idx < totalBeats) {
        keepIndices.add(idx);
      }
    }

    // 1) Evictar inmediatamente cualquier slot fuera de [beatIndex - 1, beatIndex, beatIndex + 1]
    for (const [idx, slot] of Array.from(this.slots.entries())) {
      if (!keepIndices.has(idx)) {
        this.disposeSlot(slot);
        this.slots.delete(idx);
      }
    }

    // 2) Asegurar carga únicamente de los slots en ventana
    for (const idx of keepIndices) {
      const src = resolveSource(idx);
      const existing = this.slots.get(idx);
      if (!src) {
        if (existing) {
          this.disposeSlot(existing);
          this.slots.delete(idx);
        }
        continue;
      }
      if (existing && existing.signature === src.signature) {
        continue;
      }
      if (existing) {
        this.disposeSlot(existing);
        this.slots.delete(idx);
      }

      const slot = this.createSlot(idx, src);
      this.slots.set(idx, slot);
    }

    const activeSlot = this.slots.get(beatIndex);
    if (!activeSlot) return null;
    if (activeSlot.isReady) return activeSlot.video;
    return activeSlot.readyPromise;
  }

  public getVideoSync(beatIndex: number): HTMLVideoElement | null {
    const slot = this.slots.get(beatIndex);
    if (!slot || !slot.isReady || slot.video.readyState < 2) return null;
    return slot.video;
  }

  private createSlot(beatIndex: number, source: SlidingWindowVideoSource): ActiveVideoSlot {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';

    const slot: ActiveVideoSlot = {
      beatIndex,
      signature: source.signature,
      objectUrl: null,
      video,
      isReady: false,
      readyPromise: Promise.resolve(null),
    };

    slot.readyPromise = (async () => {
      try {
        let srcUrl = source.directUrl || '';
        if (!srcUrl && source.loadBlob) {
          const blob = await source.loadBlob();
          if (!blob) return null;
          // Verificar que el slot no haya sido evictado mientras cargaba el blob
          if (this.slots.get(beatIndex) !== slot) return null;
          srcUrl = URL.createObjectURL(blob);
          slot.objectUrl = srcUrl;
        }
        if (!srcUrl) return null;

        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          video.onloadeddata = done;
          video.onerror = done;
          window.setTimeout(done, 4500);
          video.src = srcUrl;
          video.load();
        });

        if (this.slots.get(beatIndex) !== slot) {
          this.disposeSlot(slot);
          return null;
        }
        slot.isReady = video.readyState >= 2;
        return slot.isReady ? video : null;
      } catch {
        return null;
      }
    })();

    return slot;
  }

  private disposeSlot(slot: ActiveVideoSlot): void {
    try {
      slot.video.pause();
      slot.video.onloadeddata = null;
      slot.video.onerror = null;
      slot.video.removeAttribute('src');
      slot.video.load();
    } catch {
      // Silencioso
    }
    if (slot.objectUrl) {
      try {
        URL.revokeObjectURL(slot.objectUrl);
      } catch {
        // Silencioso
      }
      slot.objectUrl = null;
    }
    slot.isReady = false;
  }

  public dispose(): void {
    for (const slot of this.slots.values()) {
      this.disposeSlot(slot);
    }
    this.slots.clear();
  }
}
