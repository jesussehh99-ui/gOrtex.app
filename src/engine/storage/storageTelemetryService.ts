import type { StorageTelemetry, ViralScript } from '../../types';
import { getLegacyProjectSizes } from '../../utils/mediaStorage';
import { mediaStorageService } from '../../utils/mediaStorageService';

const AI_MODEL_CACHE_PATTERNS = [
  'transformers',
  'huggingface',
  'onnx',
  'depth-anything',
  'xenova',
  'kokoro',
  'ort-wasm',
  'webllm',
  'mlc',
];

function isAiModelCacheName(cacheName: string): boolean {
  const lower = cacheName.toLowerCase();
  return AI_MODEL_CACHE_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function formatBytes(bytes: number): string {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safe < 1024) return `${Math.round(safe)} B`;
  const kb = safe / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 100 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Mide el tamaño real de los pesos de modelos IA locales (p. ej. Depth Anything V2 / ONNX)
 * almacenados en `Cache Storage` sin mezclarlos con el consumo de proyectos del usuario.
 */
export async function estimateAiModelsCacheBytes(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  let totalBytes = 0;

  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!isAiModelCacheName(name)) continue;
      try {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const req of keys) {
          try {
            const res = await cache.match(req);
            if (!res) continue;
            const lenHeader = res.headers.get('content-length');
            if (lenHeader) {
              const parsed = Number(lenHeader);
              if (Number.isFinite(parsed) && parsed > 0) {
                totalBytes += parsed;
                continue;
              }
            }
            const cloned = res.clone();
            const blob = await cloned.blob();
            totalBytes += blob.size;
          } catch {
            // Ignorar entradas opacas o en tránsito
          }
        }
      } catch {
        // Silencioso
      }
    }
  } catch {
    // Cache Storage no disponible
  }

  return totalBytes;
}

/**
 * Limpia EXPLÍCITAMENTE únicamente la caché de pesos de modelos IA en `Cache Storage`.
 * Nunca se invoca desde el Garbage Collector automático; solo bajo confirmación explícita del usuario.
 */
export async function clearAiModelsCache(): Promise<{ deletedCaches: string[]; freedBytes: number }> {
  if (typeof caches === 'undefined') {
    return { deletedCaches: [], freedBytes: 0 };
  }
  const freedBytes = await estimateAiModelsCacheBytes();
  const deletedCaches: string[] = [];

  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!isAiModelCacheName(name)) continue;
      try {
        const ok = await caches.delete(name);
        if (ok) deletedCaches.push(name);
      } catch {
        // Silencioso
      }
    }
  } catch {
    // Silencioso
  }

  return { deletedCaches, freedBytes };
}

/**
 * Calcula el peso real (bytes) por `projectId` combinando:
 * 1) OPFS + IndexedDB (`MediaStorageService`: arte WebP, mapas de profundidad, audio, directorios)
 * 2) IndexedDB legado (`scene_media` + `ai_art_cache`)
 * 3) Metadatos JSON del guion (`ViralScript`)
 */
export async function computeAllProjectSizes(
  scripts: ViralScript[]
): Promise<Record<string, number>> {
  const [binaryMap, legacyMap] = await Promise.all([
    mediaStorageService.getProjectSizesMap(),
    getLegacyProjectSizes(),
  ]);

  const result: Record<string, number> = {};

  for (const script of scripts) {
    let metaBytes = 4096;
    try {
      metaBytes = new Blob([JSON.stringify(script)]).size;
    } catch {
      metaBytes = 4096;
    }
    const binBytes = binaryMap[script.id] ?? 0;
    const legBytes = legacyMap[script.id] ?? 0;
    result[script.id] = binBytes + legBytes + metaBytes;
  }

  return result;
}

export async function getStorageTelemetry(scripts: ViralScript[]): Promise<StorageTelemetry> {
  const [health, aiModelsCacheBytes, projectSizeMap] = await Promise.all([
    mediaStorageService.getStorageHealth(),
    estimateAiModelsCacheBytes(),
    computeAllProjectSizes(scripts),
  ]);

  const projectsBytes = Object.values(projectSizeMap).reduce((sum, n) => sum + n, 0);
  const totalUsageBytes = Math.max(health.usageBytes, projectsBytes + aiModelsCacheBytes);
  const quotaBytes = health.quotaBytes;
  const usagePercent =
    quotaBytes > 0 ? Math.min(100, Math.round((totalUsageBytes / quotaBytes) * 1000) / 10) : 0;

  const pressure: StorageTelemetry['pressure'] =
    usagePercent >= 85 ? 'critical' : usagePercent >= 70 ? 'warning' : 'normal';

  return {
    totalUsageBytes,
    quotaBytes,
    usagePercent,
    projectsBytes,
    aiModelsCacheBytes,
    isPersisted: health.persisted,
    storageBackend: health.backend,
    pressure,
    projectSizeMap,
  };
}
