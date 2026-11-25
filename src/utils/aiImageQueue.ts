import { useEffect, useState } from 'react';
import type { ScriptScene, VideoAspectRatio, ViralScript } from '../types';
import { compressImageBlobToWebp } from './bitmapWindowCache';
import { localDepthEngine } from './localDepthEngine';
import { loadCachedAiArt, saveCachedAiArt } from './mediaStorage';
import {
  buildPollinationsSceneImageUrl,
  buildSceneImagePrompt,
  resolveSceneSeed,
} from './sceneImageUrl';

export type SceneArtStatus = 'idle' | 'queued' | 'generating' | 'retrying' | 'ready';

export interface SceneArtQueueSnapshot {
  status: SceneArtStatus;
  queuePosition: number;
  queueTotal: number;
  waitRemainingSec: number;
  hasBlob: boolean;
  webpBlob?: Blob;
  thumbBlob?: Blob;
  attempt: number;
}

interface InternalJob {
  key: string;
  scriptId: string;
  sceneId: string;
  sceneOrder: number;
  proxyUrl: string;
  status: SceneArtStatus;
  attempt: number;
  nextEligibleAtMs: number;
  startedAtMs: number;
  /** Únicamente Blobs WebP comprimidos en memoria — cero HTMLImageElement / bitmaps permanentes */
  webpBlob?: Blob;
  thumbBlob?: Blob;
}

const OPTIMISTIC_COOLDOWN_MS = 2_600;
const RATE_LIMIT_COOLDOWN_MS = 46_000;
const MAX_RETRY_ATTEMPTS = 6;

const jobs = new Map<string, InternalJob>();
const pendingKeys: string[] = [];
const listeners = new Set<() => void>();

let activeKey: string | null = null;
let activeFetchAbortController: AbortController | null = null;
let lastUpstreamRequestMs = 0;
let activeCooldownMs = OPTIMISTIC_COOLDOWN_MS;
let currentScriptId: string | null = null;
let processorTimer: number | null = null;
let countdownInterval: number | null = null;
const cancelledProjectIds = new Set<string>();

function notifyAll(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Silencioso
    }
  });
}

function hashQuick(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function buildSceneArtCacheKey(
  scene: ScriptScene,
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  overrideSeed?: number
): string {
  const seed = resolveSceneSeed(scene, script.id, overrideSeed);
  const prompt = buildSceneImagePrompt(scene, script, aspectRatio);
  return `${script.id}::${scene.id}::${aspectRatio}::${seed}::${hashQuick(prompt)}`;
}

function ensureCountdownTicker(): void {
  const hasWork = Boolean(activeKey) || pendingKeys.length > 0;
  if (hasWork && countdownInterval === null) {
    countdownInterval = window.setInterval(() => {
      if (!activeKey && pendingKeys.length === 0) {
        if (countdownInterval !== null) {
          window.clearInterval(countdownInterval);
          countdownInterval = null;
        }
        return;
      }
      notifyAll();
    }, 1000);
  } else if (!hasWork && countdownInterval !== null) {
    window.clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function scheduleNextTick(delayMs: number): void {
  if (processorTimer !== null) {
    window.clearTimeout(processorTimer);
    processorTimer = null;
  }
  processorTimer = window.setTimeout(() => {
    processorTimer = null;
    void processQueue();
  }, Math.max(50, delayMs));
}

function sortPendingQueue(): void {
  pendingKeys.sort((aKey, bKey) => {
    const a = jobs.get(aKey);
    const b = jobs.get(bKey);
    if (!a || !b) return 0;
    const aActive = a.scriptId === currentScriptId ? 0 : 1;
    const bActive = b.scriptId === currentScriptId ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.sceneOrder - b.sceneOrder;
  });
}

async function processQueue(): Promise<void> {
  if (activeKey !== null) return;
  if (pendingKeys.length === 0) {
    ensureCountdownTicker();
    return;
  }

  sortPendingQueue();
  const nextKey = pendingKeys[0];
  const job = jobs.get(nextKey);
  if (!job || job.status === 'ready') {
    pendingKeys.shift();
    void processQueue();
    return;
  }

  const now = Date.now();
  const cooldownUntil = lastUpstreamRequestMs > 0 ? lastUpstreamRequestMs + activeCooldownMs : 0;
  const targetStartMs = Math.max(cooldownUntil, job.nextEligibleAtMs);

  if (targetStartMs > now) {
    ensureCountdownTicker();
    notifyAll();
    scheduleNextTick(targetStartMs - now + 100);
    return;
  }

  pendingKeys.shift();
  activeKey = job.key;
  job.status = 'generating';
  job.startedAtMs = Date.now();
  job.attempt += 1;
  lastUpstreamRequestMs = Date.now();
  ensureCountdownTicker();
  notifyAll();

  let rateLimited = false;

  const abortController = new AbortController();
  activeFetchAbortController = abortController;

  try {
    const fetchUrl =
      job.attempt > 1
        ? `${job.proxyUrl}${job.proxyUrl.includes('?') ? '&' : '?'}nocache=1`
        : job.proxyUrl;
    const response = await fetch(fetchUrl, {
      mode: 'cors',
      cache: 'no-store',
      signal: abortController.signal,
    });

    if (cancelledProjectIds.has(job.scriptId) || !jobs.has(job.key)) {
      return;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const isServerCacheHit = response.headers.get('x-gortex-cache') === 'HIT';

    if (response.status === 429 || response.status === 503 || !contentType.startsWith('image/')) {
      rateLimited = true;
    } else if (!response.ok) {
      rateLimited = true;
    } else {
      const rawBlob = await response.blob();
      if (cancelledProjectIds.has(job.scriptId) || !jobs.has(job.key)) {
        return;
      }
      // Validar (sin carteles amarillos) y comprimir a Blob WebP + miniatura WebP ligera cerrando el bitmap temporal
      const compressed = await compressImageBlobToWebp(rawBlob, {
        checkRateLimitBanner: true,
        fullQuality: 0.86,
        thumbMaxDim: 220,
        thumbQuality: 0.76,
      });

      if (cancelledProjectIds.has(job.scriptId) || !jobs.has(job.key)) {
        return;
      }

      if (!compressed) {
        rateLimited = true;
      } else {
        job.webpBlob = compressed.webpBlob;
        job.thumbBlob = compressed.thumbBlob;
        job.status = 'ready';
        // Persistir Blob WebP comprimido en OPFS/IndexedDB y encolar mapa de profundidad TrueDepth en segundo plano
        void saveCachedAiArt(job.key, job.scriptId, job.sceneId, compressed.webpBlob);
        localDepthEngine.enqueueSceneDepth(job.key, job.scriptId, compressed.webpBlob, job.sceneOrder === 1);
        if (isServerCacheHit) {
          lastUpstreamRequestMs = 0;
        } else {
          activeCooldownMs = OPTIMISTIC_COOLDOWN_MS;
        }
      }
    }
  } catch (err) {
    if ((err as { name?: string })?.name !== 'AbortError') {
      rateLimited = true;
    }
  } finally {
    if (activeFetchAbortController === abortController) {
      activeFetchAbortController = null;
    }
    activeKey = null;

    if (jobs.has(job.key) && !cancelledProjectIds.has(job.scriptId) && job.status !== 'ready') {
      if (rateLimited && job.attempt < MAX_RETRY_ATTEMPTS) {
        activeCooldownMs = RATE_LIMIT_COOLDOWN_MS;
        lastUpstreamRequestMs = Date.now();
        job.status = 'retrying';
        job.nextEligibleAtMs = lastUpstreamRequestMs + RATE_LIMIT_COOLDOWN_MS;
        if (!pendingKeys.includes(job.key)) {
          pendingKeys.push(job.key);
        }
      } else {
        job.status = 'queued';
        job.nextEligibleAtMs = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      }
    }

    ensureCountdownTicker();
    notifyAll();

    if (pendingKeys.length > 0) {
      const waitMs =
        lastUpstreamRequestMs > 0
          ? Math.max(200, lastUpstreamRequestMs + activeCooldownMs - Date.now() + 80)
          : 150;
      scheduleNextTick(waitMs);
    }
  }
}

/**
 * Registra todas las escenas de un guion en orden secuencial estricto (1, 2, 3...)
 * almacenando únicamente Blobs WebP comprimidos.
 */
export function enqueueScriptScenesSequentially(
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  seedOverrides?: Record<string, number | undefined>,
  skipSceneIds?: Set<string>
): void {
  if (currentScriptId && currentScriptId !== script.id) {
    for (let i = pendingKeys.length - 1; i >= 0; i--) {
      const k = pendingKeys[i];
      const existing = jobs.get(k);
      if (existing && existing.scriptId !== script.id && existing.status !== 'ready') {
        pendingKeys.splice(i, 1);
      }
    }
  }
  currentScriptId = script.id;

  const sortedScenes = [...script.escenas].sort((a, b) => a.orden - b.orden);
  for (const scene of sortedScenes) {
    if (skipSceneIds?.has(scene.id)) continue;
    if (scene.mediaSource === 'user_photo' || scene.mediaSource === 'user_video') continue;
    enqueueSingleScene(scene, script, aspectRatio, seedOverrides?.[scene.id], false);
  }
}

export function cancelAndEvictProjectFromImageQueue(projectId: string): number {
  if (!projectId) return 0;
  cancelledProjectIds.add(projectId);

  if (activeKey) {
    const activeJob = jobs.get(activeKey);
    if (activeJob && activeJob.scriptId === projectId) {
      try {
        activeFetchAbortController?.abort();
      } catch {
        // Silencioso
      }
      activeFetchAbortController = null;
      activeKey = null;
    }
  }

  let evictedCount = 0;
  for (let i = pendingKeys.length - 1; i >= 0; i--) {
    const k = pendingKeys[i];
    const j = jobs.get(k);
    if (!j || j.scriptId === projectId) {
      pendingKeys.splice(i, 1);
    }
  }

  for (const [k, j] of Array.from(jobs.entries())) {
    if (j.scriptId === projectId) {
      j.webpBlob = undefined;
      j.thumbBlob = undefined;
      jobs.delete(k);
      evictedCount += 1;
    }
  }

  if (currentScriptId === projectId) {
    currentScriptId = null;
  }

  ensureCountdownTicker();
  notifyAll();
  return evictedCount;
}

export function enqueueSingleScene(
  scene: ScriptScene,
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  overrideSeed?: number,
  prioritize = false
): string {
  cancelledProjectIds.delete(script.id);
  currentScriptId = script.id;
  const key = buildSceneArtCacheKey(scene, script, aspectRatio, overrideSeed);
  const existing = jobs.get(key);

  if (existing) {
    if (
      existing.status !== 'ready' &&
      activeKey !== key &&
      !pendingKeys.includes(key)
    ) {
      if (prioritize) {
        pendingKeys.unshift(key);
      } else {
        pendingKeys.push(key);
      }
      void processQueue();
    }
    return key;
  }

  const proxyUrl = buildPollinationsSceneImageUrl(scene, script, aspectRatio, overrideSeed, {
    useProxy: true,
    thumbnail: false,
  });

  const job: InternalJob = {
    key,
    scriptId: script.id,
    sceneId: scene.id,
    sceneOrder: scene.orden,
    proxyUrl,
    status: 'queued',
    attempt: 0,
    nextEligibleAtMs: 0,
    startedAtMs: 0,
  };

  jobs.set(key, job);
  if (prioritize) {
    pendingKeys.unshift(key);
  } else {
    pendingKeys.push(key);
  }

  ensureCountdownTicker();
  notifyAll();

  // Hidratar primero desde IndexedDB como Blob WebP comprimido (sin decodificar permanentemente en VRAM)
  void loadCachedAiArt(key)
    .then(async (cachedBlob) => {
      if (!cachedBlob || job.status === 'ready') {
        void processQueue();
        return;
      }
      try {
        const compressed = await compressImageBlobToWebp(cachedBlob, {
          checkRateLimitBanner: true,
          fullQuality: 0.86,
          thumbMaxDim: 220,
          thumbQuality: 0.76,
        });
        if (compressed) {
          job.webpBlob = compressed.webpBlob;
          job.thumbBlob = compressed.thumbBlob;
          job.status = 'ready';
          if (cachedBlob.type !== 'image/webp') {
            void saveCachedAiArt(key, job.scriptId, job.sceneId, compressed.webpBlob);
          }
          localDepthEngine.enqueueSceneDepth(key, job.scriptId, compressed.webpBlob, job.sceneOrder === 1);
          const pIdx = pendingKeys.indexOf(key);
          if (pIdx >= 0) pendingKeys.splice(pIdx, 1);
          ensureCountdownTicker();
          notifyAll();
          void processQueue();
          return;
        }
      } catch {
        // Continuar con cola normal si falla
      }
      void processQueue();
    })
    .catch(() => {
      void processQueue();
    });

  return key;
}

export function preloadFirstSceneArt(
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  seedOverride?: number
): void {
  const firstScene = [...script.escenas].sort((a, b) => a.orden - b.orden)[0];
  if (!firstScene) return;
  enqueueSingleScene(firstScene, script, aspectRatio, seedOverride, true);
}

export function preloadScriptBeatsFromEditor(
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  seedOverrides?: Record<string, number | undefined>,
  skipSceneIds?: Set<string>
): void {
  void hydrateScriptArtFromCache(script, aspectRatio, seedOverrides).finally(() => {
    enqueueScriptScenesSequentially(script, aspectRatio, seedOverrides, skipSceneIds);
  });
}

/**
 * Hidrata desde IndexedDB los Blobs WebP comprimidos de un proyecto sin mantener
 * bitmaps decodificados simultáneamente en VRAM.
 */
export async function hydrateScriptArtFromCache(
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  seedOverrides?: Record<string, number | undefined>
): Promise<number> {
  let hydrated = 0;
  const sorted = [...script.escenas].sort((a, b) => a.orden - b.orden);

  for (const scene of sorted) {
    const seed = seedOverrides?.[scene.id];
    const key = buildSceneArtCacheKey(scene, script, aspectRatio, seed);
    const existing = jobs.get(key);
    if (existing?.status === 'ready' && existing.webpBlob) {
      hydrated += 1;
      continue;
    }
    const cachedBlob = await loadCachedAiArt(key);
    if (!cachedBlob) continue;
    try {
      const compressed = await compressImageBlobToWebp(cachedBlob, {
        checkRateLimitBanner: true,
        fullQuality: 0.86,
        thumbMaxDim: 220,
        thumbQuality: 0.76,
      });
      if (!compressed) continue;
      if (cachedBlob.type !== 'image/webp') {
        void saveCachedAiArt(key, script.id, scene.id, compressed.webpBlob);
      }
      const proxyUrl = buildPollinationsSceneImageUrl(scene, script, aspectRatio, seed, {
        useProxy: true,
        thumbnail: false,
      });
      jobs.set(key, {
        key,
        scriptId: script.id,
        sceneId: scene.id,
        sceneOrder: scene.orden,
        proxyUrl,
        status: 'ready',
        attempt: 1,
        nextEligibleAtMs: 0,
        startedAtMs: 0,
        webpBlob: compressed.webpBlob,
        thumbBlob: compressed.thumbBlob,
      });
      localDepthEngine.enqueueSceneDepth(key, script.id, compressed.webpBlob, scene.orden === 1);
      const pIdx = pendingKeys.indexOf(key);
      if (pIdx >= 0) pendingKeys.splice(pIdx, 1);
      hydrated += 1;
    } catch {
      // Ignorar si el blob está corrupto
    }
  }

  if (hydrated > 0) {
    ensureCountdownTicker();
    notifyAll();
  }
  return hydrated;
}

export function getSceneArtSnapshot(
  scene: ScriptScene | undefined,
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  overrideSeed?: number
): SceneArtQueueSnapshot {
  const totalScenes = Math.max(1, script.escenas.length);
  if (!scene) {
    return {
      status: 'idle',
      queuePosition: 1,
      queueTotal: totalScenes,
      waitRemainingSec: 0,
      hasBlob: false,
      attempt: 0,
    };
  }

  const key = buildSceneArtCacheKey(scene, script, aspectRatio, overrideSeed);
  const job = jobs.get(key);
  const sceneOrder = Math.max(1, scene.orden);
  const estPerBeatSec = Math.max(4, Math.ceil(activeCooldownMs / 1000) + 2);

  if (!job) {
    return {
      status: 'queued',
      queuePosition: sceneOrder,
      queueTotal: totalScenes,
      waitRemainingSec: Math.max(0, (sceneOrder - 1) * estPerBeatSec),
      hasBlob: false,
      attempt: 0,
    };
  }

  if (job.status === 'ready' && job.webpBlob) {
    return {
      status: 'ready',
      queuePosition: sceneOrder,
      queueTotal: totalScenes,
      waitRemainingSec: 0,
      hasBlob: true,
      webpBlob: job.webpBlob,
      thumbBlob: job.thumbBlob ?? job.webpBlob,
      attempt: job.attempt,
    };
  }

  const now = Date.now();
  const baseCooldownRemainingMs =
    lastUpstreamRequestMs > 0
      ? Math.max(0, lastUpstreamRequestMs + activeCooldownMs - now)
      : 0;

  if (job.status === 'generating') {
    const elapsedSec = Math.floor((now - job.startedAtMs) / 1000);
    const estRemaining = Math.max(2, Math.min(45, estPerBeatSec + 4 - elapsedSec));
    return {
      status: 'generating',
      queuePosition: sceneOrder,
      queueTotal: totalScenes,
      waitRemainingSec: estRemaining,
      hasBlob: false,
      attempt: job.attempt,
    };
  }

  const pendingIdx = pendingKeys.indexOf(key);
  const jobsAhead = pendingIdx >= 0 ? pendingIdx : 0;
  const activeOffsetMs = activeKey ? Math.max(3_000, baseCooldownRemainingMs) : baseCooldownRemainingMs;
  const totalWaitMs = Math.max(
    job.nextEligibleAtMs - now,
    activeOffsetMs + jobsAhead * (activeCooldownMs + 2_000)
  );

  return {
    status: job.status === 'retrying' ? 'retrying' : 'queued',
    queuePosition: sceneOrder,
    queueTotal: totalScenes,
    waitRemainingSec: Math.max(1, Math.ceil(totalWaitMs / 1000)),
    hasBlob: false,
    attempt: job.attempt,
  };
}

/**
 * Devuelve el Blob WebP comprimido si la escena ya está lista en la cola secuencial.
 * Nunca devuelve elementos DOM ni mantiene bitmaps decodificados globales.
 */
export function getCachedSceneArtBlob(
  scene: ScriptScene,
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  overrideSeed?: number
): Blob | null {
  const key = buildSceneArtCacheKey(scene, script, aspectRatio, overrideSeed);
  const job = jobs.get(key);
  if (job?.status === 'ready' && job.webpBlob) {
    return job.webpBlob;
  }
  return null;
}

export interface ResolvedSceneArtBlob {
  blob: Blob;
  artCacheKey: string;
  sourceAspectRatio: VideoAspectRatio;
}

/**
 * Busca el Blob WebP en el formato preferido y, si no existe aún, reutiliza
 * instantáneamente el Blob ya generado del formato alterno (`9:16` ↔ `16:9`)
 * para habilitar Smart Reframe y Exportación Dual sin regenerar imágenes.
 */
export function getCachedSceneArtBlobWithFallback(
  scene: ScriptScene,
  script: ViralScript,
  preferredAspectRatio: VideoAspectRatio,
  overrideSeed?: number
): ResolvedSceneArtBlob | null {
  const primaryKey = buildSceneArtCacheKey(scene, script, preferredAspectRatio, overrideSeed);
  const primaryJob = jobs.get(primaryKey);
  if (primaryJob?.status === 'ready' && primaryJob.webpBlob) {
    return {
      blob: primaryJob.webpBlob,
      artCacheKey: primaryKey,
      sourceAspectRatio: preferredAspectRatio,
    };
  }

  const altRatio: VideoAspectRatio = preferredAspectRatio === '9:16' ? '16:9' : '9:16';
  const altKey = buildSceneArtCacheKey(scene, script, altRatio, overrideSeed);
  const altJob = jobs.get(altKey);
  if (altJob?.status === 'ready' && altJob.webpBlob) {
    return {
      blob: altJob.webpBlob,
      artCacheKey: altKey,
      sourceAspectRatio: altRatio,
    };
  }

  return null;
}

/**
 * Versión asíncrona que además consulta OPFS/IndexedDB en ambos formatos (`9:16` y `16:9`)
 * para Exportación Dual y Hook Factory sin regenerar arte.
 */
export async function loadCachedSceneArtBlobWithFallback(
  scene: ScriptScene,
  script: ViralScript,
  preferredAspectRatio: VideoAspectRatio,
  overrideSeed?: number
): Promise<ResolvedSceneArtBlob | null> {
  const inMemory = getCachedSceneArtBlobWithFallback(
    scene,
    script,
    preferredAspectRatio,
    overrideSeed
  );
  if (inMemory) return inMemory;

  const altRatio: VideoAspectRatio = preferredAspectRatio === '9:16' ? '16:9' : '9:16';
  const candidates: Array<{ ratio: VideoAspectRatio; key: string }> = [
    { ratio: preferredAspectRatio, key: buildSceneArtCacheKey(scene, script, preferredAspectRatio, overrideSeed) },
    { ratio: altRatio, key: buildSceneArtCacheKey(scene, script, altRatio, overrideSeed) },
  ];

  for (const c of candidates) {
    const persisted = await loadCachedAiArt(c.key);
    if (persisted) {
      return {
        blob: persisted,
        artCacheKey: c.key,
        sourceAspectRatio: c.ratio,
      };
    }
  }
  return null;
}

export function subscribeSceneArtQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSceneArtQueue(
  scene: ScriptScene | undefined,
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  overrideSeed?: number,
  skipQueue = false
): SceneArtQueueSnapshot {
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribeSceneArtQueue(() => setTick((t) => t + 1));
  }, []);

  useEffect(() => {
    if (skipQueue || !scene) return;
    enqueueSingleScene(scene, script, aspectRatio, overrideSeed, false);
  }, [
    skipQueue,
    scene?.id,
    scene?.orden,
    scene?.imagePrompt,
    scene?.promptVisual3D,
    scene?.imageSeed,
    script.id,
    script.estilo3D,
    aspectRatio,
    overrideSeed,
  ]);

  if (skipQueue || !scene) {
    return {
      status: 'idle',
      queuePosition: scene?.orden ?? 1,
      queueTotal: Math.max(1, script.escenas.length),
      waitRemainingSec: 0,
      hasBlob: false,
      attempt: 0,
    };
  }

  return getSceneArtSnapshot(scene, script, aspectRatio, overrideSeed);
}

export interface ScriptArtReadiness {
  readyCount: number;
  totalCount: number;
  allReady: boolean;
  estimatedRemainingSec: number;
  missingSceneOrders: number[];
}

export function useScriptArtReadiness(
  script: ViralScript,
  aspectRatio: VideoAspectRatio,
  sceneMedia: Record<
    string,
    { imageDataUrl?: string; videoClipUrl?: string; imageSeed?: number } | undefined
  >
): ScriptArtReadiness {
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribeSceneArtQueue(() => setTick((t) => t + 1));
  }, []);

  const totalCount = script.escenas.length;
  let readyCount = 0;
  let maxWaitSec = 0;
  const missingSceneOrders: number[] = [];

  for (const scene of script.escenas) {
    const asset = sceneMedia[scene.id];
    const hasUploadedVisual = Boolean(
      (scene.mediaSource === 'user_photo' || scene.mediaSource === 'user_video') &&
        scene.userMediaKey
    ) || Boolean(
      asset?.videoClipUrl ||
        (asset?.imageDataUrl && !asset.imageDataUrl.startsWith('data:image/svg+xml'))
    );
    if (hasUploadedVisual) {
      readyCount += 1;
      continue;
    }

    const snap = getSceneArtSnapshot(scene, script, aspectRatio, asset?.imageSeed);
    if (snap.status === 'ready' && snap.hasBlob) {
      readyCount += 1;
    } else {
      missingSceneOrders.push(scene.orden);
      if (snap.waitRemainingSec > maxWaitSec) {
        maxWaitSec = snap.waitRemainingSec;
      }
    }
  }

  return {
    readyCount,
    totalCount,
    allReady: totalCount > 0 && readyCount >= totalCount,
    estimatedRemainingSec: maxWaitSec,
    missingSceneOrders,
  };
}
