import type { GeneratedVideoItem, SceneMediaMap } from '../types';
import { objectUrlRegistry } from '../engine/storage/objectUrlRegistry';
import { mediaStorageService } from './mediaStorageService';

export { mediaStorageService };

const DB_NAME = 'corte30_media_storage_v1';
const DB_VERSION = 2;
const STORE_SCENE_MEDIA = 'scene_media';
const STORE_VIDEOS = 'rendered_videos';
const STORE_AI_ART_CACHE = 'ai_art_cache';

interface StoredSceneMediaRecord {
  scriptId: string;
  media: SceneMediaMap;
  updatedAt: number;
}

interface StoredAiArtRecord {
  key: string;
  scriptId: string;
  sceneId: string;
  blob: Blob;
  savedAt: number;
}

interface StoredVideoRecord {
  id: string;
  scriptId?: string;
  title: string;
  scopeLabel: string;
  aspectRatio: GeneratedVideoItem['aspectRatio'];
  durationSec: number;
  voiceLabel: string;
  createdAt: string;
  extension?: GeneratedVideoItem['extension'];
  mimeType?: string;
  blob: Blob;
  savedAt: number;
}

function estimateSceneMediaMapBytes(media: SceneMediaMap): number {
  let bytes = 0;
  for (const asset of Object.values(media)) {
    if (!asset) continue;
    if (asset.imageDataUrl) {
      bytes += Math.round(asset.imageDataUrl.length * 0.75);
    }
    if (asset.altImageDataUrls) {
      for (const alt of asset.altImageDataUrls) {
        bytes += Math.round((alt?.length || 0) * 0.75);
      }
    }
    if (asset.audioDataUrl) {
      bytes += Math.round(asset.audioDataUrl.length * 0.75);
    }
    if (asset.videoClipBlob instanceof Blob) {
      bytes += asset.videoClipBlob.size;
    }
  }
  return bytes;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_SCENE_MEDIA)) {
          db.createObjectStore(STORE_SCENE_MEDIA, { keyPath: 'scriptId' });
        }
        if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
          db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_AI_ART_CACHE)) {
          const artStore = db.createObjectStore(STORE_AI_ART_CACHE, { keyPath: 'key' });
          artStore.createIndex('by_script', 'scriptId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

export async function loadCachedAiArt(key: string): Promise<Blob | null> {
  // 1) Intentar primero desde OPFS / MediaStorageService
  const opfsOrServiceBlob = await mediaStorageService.getBlob('ai-art', key);
  if (opfsOrServiceBlob) {
    return opfsOrServiceBlob;
  }

  // 2) Compatibilidad con caché legado almacenado directamente en IndexedDB
  const db = await openMediaDb();
  if (!db || !db.objectStoreNames.contains(STORE_AI_ART_CACHE)) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_AI_ART_CACHE, 'readonly');
      const req = tx.objectStore(STORE_AI_ART_CACHE).get(key);
      req.onsuccess = () => {
        const row = req.result as StoredAiArtRecord | undefined;
        resolve(row?.blob instanceof Blob ? row.blob : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveCachedAiArt(
  key: string,
  scriptId: string,
  sceneId: string,
  blob: Blob
): Promise<void> {
  // Guardar blob binario en OPFS (o fallback automático de MediaStorageService)
  const backend = await mediaStorageService.putBlob('ai-art', key, blob, scriptId);
  if (backend === 'opfs') {
    return;
  }

  // Si cayó a fallback, también reflejar en el store legado por consistencia si está abierto
  const db = await openMediaDb();
  if (!db || !db.objectStoreNames.contains(STORE_AI_ART_CACHE)) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_AI_ART_CACHE, 'readwrite');
      const store = tx.objectStore(STORE_AI_ART_CACHE);
      const record: StoredAiArtRecord = {
        key,
        scriptId,
        sceneId,
        blob,
        savedAt: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function deleteCachedAiArtByScript(scriptId: string): Promise<void> {
  await mediaStorageService.deleteProjectAssets(scriptId, ['ai-art', 'depth-maps', 'audio']);

  const db = await openMediaDb();
  if (!db || !db.objectStoreNames.contains(STORE_AI_ART_CACHE)) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_AI_ART_CACHE, 'readwrite');
      const store = tx.objectStore(STORE_AI_ART_CACHE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredAiArtRecord[]) ?? [];
        for (const row of rows) {
          if (row.scriptId === scriptId) {
            store.delete(row.key);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadAllSceneMedia(): Promise<Record<string, SceneMediaMap>> {
  const db = await openMediaDb();
  if (!db) return {};

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SCENE_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_SCENE_MEDIA);
      const req = store.getAll();
      req.onsuccess = () => {
        const result: Record<string, SceneMediaMap> = {};
        const rows = (req.result as StoredSceneMediaRecord[]) ?? [];
        for (const row of rows) {
          if (row?.scriptId && row?.media) {
            const hydrated: SceneMediaMap = {};
            for (const [sceneId, asset] of Object.entries(row.media)) {
              if (!asset) continue;
              const nextAsset = { ...asset };
              if (nextAsset.videoClipBlob instanceof Blob) {
                nextAsset.videoClipUrl = objectUrlRegistry.create(
                  row.scriptId,
                  nextAsset.videoClipBlob
                );
              } else if (nextAsset.videoClipUrl?.startsWith('blob:')) {
                // Un blob URL de una sesión previa ya expiró si no tiene Blob asociado
                delete nextAsset.videoClipUrl;
              }
              hydrated[sceneId] = nextAsset;
            }
            result[row.scriptId] = hydrated;
          }
        }
        resolve(result);
      };
      req.onerror = () => resolve({});
    } catch {
      resolve({});
    }
  });
}

export async function saveScriptSceneMedia(scriptId: string, media: SceneMediaMap): Promise<void> {
  const db = await openMediaDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SCENE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_SCENE_MEDIA);
      const record: StoredSceneMediaRecord = {
        scriptId,
        media,
        updatedAt: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function deleteScriptSceneMedia(scriptId: string): Promise<void> {
  const db = await openMediaDb();
  if (!db) return;
  void deleteCachedAiArtByScript(scriptId);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SCENE_MEDIA, 'readwrite');
      tx.objectStore(STORE_SCENE_MEDIA).delete(scriptId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadSavedVideos(): Promise<GeneratedVideoItem[]> {
  const db = await openMediaDb();
  if (!db) return [];

  const rows = await new Promise<StoredVideoRecord[]>((resolve) => {
    try {
      const tx = db.transaction(STORE_VIDEOS, 'readonly');
      const req = tx.objectStore(STORE_VIDEOS).getAll();
      req.onsuccess = () => {
        const sorted = ((req.result as StoredVideoRecord[]) ?? []).sort(
          (a, b) => (b.savedAt || 0) - (a.savedAt || 0)
        );
        resolve(sorted);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });

  const items: GeneratedVideoItem[] = [];
  for (const r of rows) {
    // Resolver el Blob desde OPFS primero o desde el registro legado de IndexedDB
    const blob =
      (await mediaStorageService.getBlob('videos', r.id)) ??
      (r?.blob instanceof Blob ? r.blob : null);
    if (!blob) continue;

    items.push({
      id: r.id,
      scriptId: r.scriptId,
      title: r.title,
      scopeLabel: r.scopeLabel,
      aspectRatio: r.aspectRatio,
      videoUrl: objectUrlRegistry.create(r.scriptId || 'rendered-videos', blob),
      durationSec: r.durationSec,
      voiceLabel: r.voiceLabel,
      createdAt: r.createdAt,
      extension: r.extension || (r.mimeType?.includes('mp4') ? 'mp4' : 'webm'),
      mimeType: r.mimeType,
    });
  }

  return items;
}

export async function saveRenderedVideo(item: GeneratedVideoItem, blob: Blob): Promise<void> {
  // Almacenar el binario pesado del MP4 en OPFS (o fallback IndexedDB con auto-LRU si falta cuota)
  const backend = await mediaStorageService.putBlob('videos', item.id, blob, 'rendered-videos');

  const db = await openMediaDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_VIDEOS, 'readwrite');
      const store = tx.objectStore(STORE_VIDEOS);
      const record: StoredVideoRecord = {
        id: item.id,
        scriptId: item.scriptId,
        title: item.title,
        scopeLabel: item.scopeLabel,
        aspectRatio: item.aspectRatio,
        durationSec: item.durationSec,
        voiceLabel: item.voiceLabel,
        createdAt: item.createdAt,
        extension: item.extension,
        mimeType: item.mimeType,
        // Si el binario ya vive en OPFS, guardar solo un placeholder vacío en IDB para no duplicar disco
        blob: backend === 'opfs' ? new Blob([], { type: item.mimeType || 'video/mp4' }) : blob,
        savedAt: Date.now(),
      };
      store.put(record);

      // Mantener un máximo de 12 videos guardados en el dispositivo para no saturar espacio
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const rows = ((allReq.result as StoredVideoRecord[]) ?? []).sort(
          (a, b) => (b.savedAt || 0) - (a.savedAt || 0)
        );
        if (rows.length > 12) {
          for (const extra of rows.slice(12)) {
            store.delete(extra.id);
            void mediaStorageService.deleteBlob('videos', extra.id);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function deleteRenderedVideo(videoId: string): Promise<void> {
  await mediaStorageService.deleteBlob('videos', videoId);
  const db = await openMediaDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_VIDEOS, 'readwrite');
      tx.objectStore(STORE_VIDEOS).delete(videoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getSavedVideoIds(): Promise<Set<string>> {
  const db = await openMediaDb();
  if (!db || !db.objectStoreNames.contains(STORE_VIDEOS)) return new Set();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_VIDEOS, 'readonly');
      const req = tx.objectStore(STORE_VIDEOS).getAllKeys();
      req.onsuccess = () => {
        const keys = (req.result as string[]) ?? [];
        resolve(new Set(keys));
      };
      req.onerror = () => resolve(new Set());
    } catch {
      resolve(new Set());
    }
  });
}

export async function getLegacyProjectSizes(): Promise<Record<string, number>> {
  const db = await openMediaDb();
  if (!db) return {};
  const sizes: Record<string, number> = {};

  if (db.objectStoreNames.contains(STORE_SCENE_MEDIA)) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_SCENE_MEDIA, 'readonly');
        const req = tx.objectStore(STORE_SCENE_MEDIA).getAll();
        req.onsuccess = () => {
          const rows = (req.result as StoredSceneMediaRecord[]) ?? [];
          for (const row of rows) {
            if (!row?.scriptId || !row.media) continue;
            sizes[row.scriptId] = (sizes[row.scriptId] ?? 0) + estimateSceneMediaMapBytes(row.media);
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  if (db.objectStoreNames.contains(STORE_AI_ART_CACHE)) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_AI_ART_CACHE, 'readonly');
        const req = tx.objectStore(STORE_AI_ART_CACHE).getAll();
        req.onsuccess = () => {
          const rows = (req.result as StoredAiArtRecord[]) ?? [];
          for (const row of rows) {
            if (!row?.scriptId || !(row.blob instanceof Blob)) continue;
            sizes[row.scriptId] = (sizes[row.scriptId] ?? 0) + row.blob.size;
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  return sizes;
}

/**
 * Purga físicamente los registros legados en `corte30_media_storage_v1` (`scene_media` y `ai_art_cache`)
 * para un `projectId` y devuelve los bytes recuperados.
 */
export async function deleteProjectLegacyMedia(projectId: string): Promise<number> {
  const db = await openMediaDb();
  if (!db) return 0;
  let freedBytes = 0;

  if (db.objectStoreNames.contains(STORE_SCENE_MEDIA)) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_SCENE_MEDIA, 'readwrite');
        const store = tx.objectStore(STORE_SCENE_MEDIA);
        const getReq = store.get(projectId);
        getReq.onsuccess = () => {
          const rec = getReq.result as StoredSceneMediaRecord | undefined;
          if (rec?.media) {
            freedBytes += estimateSceneMediaMapBytes(rec.media);
            store.delete(projectId);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  if (db.objectStoreNames.contains(STORE_AI_ART_CACHE)) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_AI_ART_CACHE, 'readwrite');
        const store = tx.objectStore(STORE_AI_ART_CACHE);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = (req.result as StoredAiArtRecord[]) ?? [];
          for (const row of rows) {
            if (row.scriptId === projectId) {
              freedBytes += row.blob instanceof Blob ? row.blob.size : 0;
              store.delete(row.key);
            }
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  return freedBytes;
}

/**
 * Elimina registros huérfanos en `scene_media` y `ai_art_cache` cuyos `scriptId` no existan en `validProjectIds`.
 */
export async function sweepLegacyOrphans(
  validProjectIds: Set<string>
): Promise<{ orphanedEntriesRemoved: number; reclaimedBytes: number }> {
  const db = await openMediaDb();
  if (!db) return { orphanedEntriesRemoved: 0, reclaimedBytes: 0 };

  let orphanedEntriesRemoved = 0;
  let reclaimedBytes = 0;

  if (db.objectStoreNames.contains(STORE_SCENE_MEDIA)) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_SCENE_MEDIA, 'readwrite');
        const store = tx.objectStore(STORE_SCENE_MEDIA);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = (req.result as StoredSceneMediaRecord[]) ?? [];
          for (const row of rows) {
            if (!row?.scriptId || !validProjectIds.has(row.scriptId)) {
              reclaimedBytes += row?.media ? estimateSceneMediaMapBytes(row.media) : 0;
              orphanedEntriesRemoved += 1;
              if (row?.scriptId) store.delete(row.scriptId);
            }
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  if (db.objectStoreNames.contains(STORE_AI_ART_CACHE)) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_AI_ART_CACHE, 'readwrite');
        const store = tx.objectStore(STORE_AI_ART_CACHE);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = (req.result as StoredAiArtRecord[]) ?? [];
          for (const row of rows) {
            if (!row?.scriptId || !validProjectIds.has(row.scriptId)) {
              reclaimedBytes += row.blob instanceof Blob ? row.blob.size : 0;
              orphanedEntriesRemoved += 1;
              if (row?.key) store.delete(row.key);
            }
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  return { orphanedEntriesRemoved, reclaimedBytes };
}
