import { useEffect, useState } from 'react';
import type { DepthEngineBackend, DepthMapSource } from '../types';
import { mediaStorageService } from './mediaStorageService';

export type DepthEnginePhase =
  | 'idle'
  | 'loading_model'
  | 'computing'
  | 'ready'
  | 'fallback';

export interface DepthEngineSnapshot {
  trueDepthEnabled: boolean;
  phase: DepthEnginePhase;
  backend: DepthEngineBackend;
  modelLoadProgress: number;
  aiDepthCount: number;
  pendingCount: number;
  lastError?: string;
}

interface PendingDepthJob {
  key: string;
  scriptId: string;
  imageBlob: Blob;
  priority: boolean;
}

const TRUE_DEPTH_STORAGE_KEY = 'gortex_truedepth_enabled_v1';

function loadInitialTrueDepthPref(): boolean {
  try {
    const raw = localStorage.getItem(TRUE_DEPTH_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Generador rápido y 100% determinista de mapa de profundidad heurístico (<15 ms):
 * Combina saliencia central elíptica + plano de suelo vertical + magnitud de bordes Sobel
 * + contraste de luminancia + doble suavizado separable para lograr paralaje 2.5D limpio
 * sin desgarros mientras el modelo TrueDepth IA procesa en segundo plano o en Modo Ligero.
 */
export function generateFallbackDepthMap(
  source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas,
  maxDim = 192
): HTMLCanvasElement | OffscreenCanvas {
  const srcW = Math.max(1, source.width);
  const srcH = Math.max(1, source.height);
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(32, Math.round(srcW * scale));
  const h = Math.max(32, Math.round(srcH * scale));

  const createSurface = (width: number, height: number): HTMLCanvasElement | OffscreenCanvas => {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c;
    }
    return new OffscreenCanvas(width, height);
  };

  const canvas = createSurface(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return canvas;

  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const total = w * h;

  const luma = new Float32Array(total);
  const sat = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const r = data[o] / 255;
    const g = data[o + 1] / 255;
    const b = data[o + 2] / 255;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    luma[i] = y;
    sat[i] = maxC > 0.001 ? (maxC - minC) / maxC : 0;
  }

  // Mapa de profundidad crudo combinando saliencia focal central + gradiente de suelo + bordes Sobel
  const rawDepth = new Float32Array(total);
  for (let y = 0; y < h; y++) {
    const ny = y / Math.max(1, h - 1); // 0 arriba (cielo/fondo), 1 abajo (suelo/primer plano)
    // Plano de perspectiva vertical suave (abajo más cercano, techo/cielo más lejano)
    const verticalRamp = Math.pow(ny, 1.35) * 0.42;

    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const nx = x / Math.max(1, w - 1);

      // Saliencia central elíptica (sujeto protagonista suele ocupar zona central-media)
      const dx = (nx - 0.5) / 0.38;
      const dy = (ny - 0.47) / 0.42;
      const radialDistSq = dx * dx + dy * dy;
      const centerSaliency = Math.exp(-radialDistSq * 1.15);

      // Detección rápida de bordes Sobel 3x3 (los objetos enfocados tienen mayor nitidez/frecuencia)
      let edgeEnergy = 0;
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        const tl = luma[idx - w - 1];
        const tc = luma[idx - w];
        const tr = luma[idx - w + 1];
        const ml = luma[idx - 1];
        const mr = luma[idx + 1];
        const bl = luma[idx + w - 1];
        const bc = luma[idx + w];
        const br = luma[idx + w + 1];
        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        edgeEnergy = Math.min(1, Math.hypot(gx, gy) * 1.45);
      }

      // Contraste y saturación local refuerzan la separación del protagonista sobre fondos suaves
      const subjectBoost = centerSaliency * (0.36 + edgeEnergy * 0.32 + sat[idx] * 0.14);
      const highlightLift = luma[idx] * 0.12 * centerSaliency;
      const d = 0.1 + verticalRamp + subjectBoost + highlightLift;
      rawDepth[idx] = Math.max(0.04, Math.min(0.98, d));
    }
  }

  // Suavizado separable rápido (2 pasadas con radio 4) para normales Sobel limpias sin escalonamiento
  const temp = new Float32Array(total);
  const smoothed = new Float32Array(total);
  const boxBlurPass = (src: Float32Array, dst: Float32Array, radius: number) => {
    const winSize = radius * 2 + 1;
    // Horizontal
    for (let y = 0; y < h; y++) {
      const rowOff = y * w;
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        acc += src[rowOff + Math.max(0, Math.min(w - 1, k))];
      }
      for (let x = 0; x < w; x++) {
        temp[rowOff + x] = acc / winSize;
        const removeX = Math.max(0, x - radius);
        const addX = Math.min(w - 1, x + radius + 1);
        acc += src[rowOff + addX] - src[rowOff + removeX];
      }
    }
    // Vertical
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        acc += temp[Math.max(0, Math.min(h - 1, k)) * w + x];
      }
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = acc / winSize;
        const removeY = Math.max(0, y - radius);
        const addY = Math.min(h - 1, y + radius + 1);
        acc += temp[addY * w + x] - temp[removeY * w + x];
      }
    }
  };

  boxBlurPass(rawDepth, smoothed, 4);
  boxBlurPass(smoothed, rawDepth, 3);

  // Normalizar contraste al rango [0.06..0.96] para paralaje consistente
  let minD = 1;
  let maxD = 0;
  for (let i = 0; i < total; i++) {
    if (rawDepth[i] < minD) minD = rawDepth[i];
    if (rawDepth[i] > maxD) maxD = rawDepth[i];
  }
  const invSpan = 1 / Math.max(0.05, maxD - minD);

  for (let i = 0; i < total; i++) {
    const norm = Math.max(0, Math.min(1, (rawDepth[i] - minD) * invSpan));
    // Curva S suave para reforzar la separación fondo vs primer plano (>0.58 para títulos detrás del sujeto)
    const shaped = norm * norm * (3 - 2 * norm);
    const byte = Math.round((0.06 + shaped * 0.9) * 255);
    const o = i * 4;
    data[o] = byte;
    data[o + 1] = byte;
    data[o + 2] = byte;
    data[o + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * LocalDepthEngine:
 * Orquesta la generación silenciosa en segundo plano de mapas de profundidad TrueDepth IA
 * (`onnx-community/depth-anything-v2-small` en `depthWorker.ts` con WebGPU/WASM),
 * los persiste como WebP 512px en OPFS (`mediaStorageService` namespace `'depth-maps'`),
 * y provee fallback heurístico instantáneo (<15ms) si el modelo aún no termina o está desactivado.
 */
class LocalDepthEngineManager {
  private worker: Worker | null = null;
  private workerFailed = false;
  private trueDepthEnabled = loadInitialTrueDepthPref();
  private phase: DepthEnginePhase = 'idle';
  private backend: DepthEngineBackend = 'heuristic';
  private modelLoadProgress = 0;
  private lastError: string | undefined;

  private readonly depthBlobs = new Map<string, Blob>();
  private readonly queuedKeys = new Set<string>();
  private readonly queue: PendingDepthJob[] = [];
  private readonly cancelledProjectIds = new Set<string>();
  private activeJob: { id: number; key: string; scriptId: string } | null = null;
  private nextRequestId = 1;
  private readonly listeners = new Set<() => void>();

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // Silencioso
      }
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public isTrueDepthEnabled(): boolean {
    return this.trueDepthEnabled;
  }

  public setTrueDepthEnabled(enabled: boolean): void {
    if (this.trueDepthEnabled === enabled) return;
    this.trueDepthEnabled = enabled;
    try {
      localStorage.setItem(TRUE_DEPTH_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // Silencioso
    }
    if (!enabled) {
      this.queue.length = 0;
      this.queuedKeys.clear();
      if (!this.activeJob) {
        this.phase = 'idle';
      }
    } else if (!this.workerFailed) {
      void this.processNext();
    }
    this.notify();
  }

  public getSnapshot(): DepthEngineSnapshot {
    return {
      trueDepthEnabled: this.trueDepthEnabled,
      phase: this.phase,
      backend: this.trueDepthEnabled && !this.workerFailed ? this.backend : 'heuristic',
      modelLoadProgress: this.modelLoadProgress,
      aiDepthCount: this.depthBlobs.size,
      pendingCount: this.queue.length + (this.activeJob ? 1 : 0),
      lastError: this.lastError,
    };
  }

  public getCachedDepthBlob(artKey: string): Blob | null {
    return this.depthBlobs.get(artKey) ?? null;
  }

  public getDepthSource(artKey: string): DepthMapSource {
    return this.depthBlobs.has(artKey) ? 'ai_truedepth' : 'heuristic';
  }

  /**
   * Intenta cargar primero desde OPFS (`depth-maps`), y si no existe en disco,
   * devuelve `null` (el motor gráfico usará `generateFallbackDepthMap` al instante sin esperar).
   */
  public async loadPersistedDepthBlob(artKey: string): Promise<Blob | null> {
    const existing = this.depthBlobs.get(artKey);
    if (existing) return existing;
    try {
      const persisted = await mediaStorageService.getBlob('depth-maps', artKey);
      if (persisted && persisted.size > 64) {
        this.depthBlobs.set(artKey, persisted);
        this.notify();
        return persisted;
      }
    } catch {
      // Silencioso
    }
    return null;
  }

  /**
   * Cancela tareas pendientes y evicta de RAM los mapas de profundidad de un proyecto eliminado.
   * También impide que un job en vuelo vuelva a persistirse en OPFS al finalizar.
   */
  public evictProject(projectId: string): number {
    if (!projectId) return 0;
    this.cancelledProjectIds.add(projectId);

    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].scriptId === projectId) {
        this.queuedKeys.delete(this.queue[i].key);
        this.queue.splice(i, 1);
      }
    }

    let evicted = 0;
    for (const key of Array.from(this.depthBlobs.keys())) {
      if (key.startsWith(`${projectId}::`)) {
        this.depthBlobs.delete(key);
        evicted += 1;
      }
    }

    this.notify();
    return evicted;
  }

  /**
   * Encola de forma silenciosa y no bloqueante la estimación TrueDepth IA para una escena.
   */
  public enqueueSceneDepth(
    artKey: string,
    scriptId: string,
    imageBlob: Blob,
    priority = false
  ): void {
    if (!artKey || !imageBlob || imageBlob.size < 64) return;
    this.cancelledProjectIds.delete(scriptId);
    if (this.depthBlobs.has(artKey)) return;
    if (this.queuedKeys.has(artKey) || this.activeJob?.key === artKey) return;

    // Primero intentar hidratación instantánea desde OPFS aunque TrueDepth esté pausado
    void mediaStorageService
      .getBlob('depth-maps', artKey)
      .then((persisted) => {
        if (persisted && persisted.size > 64) {
          this.depthBlobs.set(artKey, persisted);
          this.notify();
          return;
        }
        if (!this.trueDepthEnabled || this.workerFailed) return;
        if (this.depthBlobs.has(artKey) || this.queuedKeys.has(artKey) || this.activeJob?.key === artKey) {
          return;
        }
        this.queuedKeys.add(artKey);
        const job: PendingDepthJob = { key: artKey, scriptId, imageBlob, priority };
        if (priority) {
          this.queue.unshift(job);
        } else {
          this.queue.push(job);
        }
        this.notify();
        void this.processNext();
      })
      .catch(() => {
        // Silencioso
      });
  }

  private ensureWorker(): Worker | null {
    if (this.workerFailed || typeof Worker === 'undefined') {
      return null;
    }
    if (this.worker) return this.worker;

    try {
      const worker = new Worker(new URL('../workers/depthWorker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as
          | {
              type: 'status';
              status?: DepthEnginePhase;
              progress?: number;
              backend?: DepthEngineBackend;
              error?: string;
            }
          | {
              type: 'result';
              id: number;
              key: string;
              depthBlob: Blob;
              backend?: DepthEngineBackend;
            }
          | {
              type: 'error';
              id: number;
              key: string;
              error?: string;
            };

        if (!msg) return;

        if (msg.type === 'status') {
          if (msg.backend) this.backend = msg.backend;
          if (typeof msg.progress === 'number') this.modelLoadProgress = msg.progress;
          if (msg.status) this.phase = msg.status;
          if (msg.error) this.lastError = msg.error;
          this.notify();
          return;
        }

        if (msg.type === 'result') {
          if (msg.backend) this.backend = msg.backend;
          const finishedJob = this.activeJob;
          this.activeJob = null;

          const isCancelled =
            Boolean(finishedJob?.scriptId && this.cancelledProjectIds.has(finishedJob.scriptId)) ||
            Array.from(this.cancelledProjectIds).some((pid) => msg.key.startsWith(`${pid}::`));

          if (!isCancelled && msg.depthBlob && msg.depthBlob.size > 64) {
            this.depthBlobs.set(msg.key, msg.depthBlob);
            const projId = finishedJob?.scriptId || 'global';
            void mediaStorageService.putBlob('depth-maps', msg.key, msg.depthBlob, projId);
          }

          this.phase = this.queue.length > 0 ? 'computing' : 'ready';
          this.notify();
          void this.processNext();
          return;
        }

        if (msg.type === 'error') {
          const errText = (msg.error || '').toLowerCase();
          this.lastError = msg.error;
          this.activeJob = null;
          const isFatalModelError =
            this.depthBlobs.size === 0 ||
            this.phase === 'loading_model' ||
            errText.includes('<!doctype') ||
            errText.includes('unexpected token') ||
            errText.includes('wasm') ||
            errText.includes('webgpu') ||
            errText.includes('failed to fetch');
          // Si falla la carga del modelo o la inferencia local, degradar silenciosamente a generateFallbackDepthMap
          if (isFatalModelError) {
            this.workerFailed = true;
            this.backend = 'heuristic';
            this.phase = 'fallback';
            this.queue.length = 0;
            this.queuedKeys.clear();
            try {
              worker.terminate();
            } catch {
              // Silencioso
            }
            this.worker = null;
          } else {
            this.phase = this.queue.length > 0 ? 'computing' : 'ready';
          }
          this.notify();
          void this.processNext();
        }
      };

      worker.onerror = (err) => {
        this.workerFailed = true;
        this.backend = 'heuristic';
        this.phase = 'fallback';
        this.lastError = err?.message || 'Worker TrueDepth no disponible; usando profundidad instantánea.';
        this.activeJob = null;
        this.queue.length = 0;
        this.queuedKeys.clear();
        try {
          worker.terminate();
        } catch {
          // Silencioso
        }
        this.worker = null;
        this.notify();
      };

      this.worker = worker;
      return worker;
    } catch (err) {
      this.workerFailed = true;
      this.backend = 'heuristic';
      this.phase = 'fallback';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.notify();
      return null;
    }
  }

  private async processNext(): Promise<void> {
    if (!this.trueDepthEnabled || this.workerFailed) return;
    if (this.activeJob || this.queue.length === 0) return;

    const worker = this.ensureWorker();
    if (!worker) return;

    const next = this.queue.shift();
    if (!next) return;
    this.queuedKeys.delete(next.key);

    if (this.depthBlobs.has(next.key)) {
      void this.processNext();
      return;
    }

    const reqId = this.nextRequestId++;
    this.activeJob = { id: reqId, key: next.key, scriptId: next.scriptId };
    if (this.phase === 'idle' || this.phase === 'ready') {
      this.phase = 'computing';
    }
    this.notify();

    try {
      worker.postMessage({
        type: 'estimate',
        id: reqId,
        key: next.key,
        imageBlob: next.imageBlob,
        maxDim: 512,
      });
    } catch {
      this.activeJob = null;
      this.workerFailed = true;
      this.phase = 'fallback';
      this.backend = 'heuristic';
      this.notify();
    }
  }
}

export const localDepthEngine = new LocalDepthEngineManager();

export function useDepthEngineSnapshot(): DepthEngineSnapshot {
  const [snap, setSnap] = useState<DepthEngineSnapshot>(() => localDepthEngine.getSnapshot());
  useEffect(() => {
    return localDepthEngine.subscribe(() => {
      setSnap(localDepthEngine.getSnapshot());
    });
  }, []);
  return snap;
}
