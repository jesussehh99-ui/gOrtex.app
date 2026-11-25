/**
 * MediaStorageService: Almacenamiento binario eficiente 100% client-side (Costo $0).
 *
 * - Usa OPFS (`navigator.storage.getDirectory()`) para blobs pesados (imágenes WebP/JPEG,
 *   audio sintetizado, videos renderizados y chunks temporales de exportación MP4).
 * - Fallback transparente a IndexedDB cuando OPFS no está disponible (navegadores antiguos
 *   o modo incógnito restringido).
 * - Solicita persistencia con `navigator.storage.persist()` sin bloquear la UI.
 * - Expone `getStorageHealth()` vía `navigator.storage.estimate()` y limpieza LRU
 *   de proyectos antiguos para prevenir `QuotaExceededError`.
 */

export type StorageBackendKind = 'opfs' | 'indexeddb';
export type BinaryAssetNamespace = 'ai-art' | 'depth-maps' | 'audio' | 'videos' | 'tmp-exports';

export interface StorageHealthReport {
  backend: StorageBackendKind;
  opfsAvailable: boolean;
  persisted: boolean;
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  pressure: 'ok' | 'warning' | 'critical';
}

export interface TempExportStreamHandle {
  id: string;
  backend: 'opfs' | 'memory-chunks';
  writeChunk: (data: Uint8Array, position: number) => Promise<void>;
  finalizeToBlob: (mimeType: string) => Promise<Blob>;
  abortAndCleanup: () => Promise<void>;
}

interface BinaryMetaEntry {
  key: string;
  namespace: BinaryAssetNamespace;
  fileName: string;
  projectId: string;
  sizeBytes: number;
  mimeType: string;
  lastAccessedAt: number;
  savedAt: number;
}

const META_DB_NAME = 'gortex_binary_storage_v1';
const META_DB_VERSION = 1;
const STORE_META = 'binary_meta';
const STORE_FALLBACK_BLOBS = 'fallback_blobs';

function sanitizeFileName(rawKey: string): string {
  // Hash FNV-1a + prefijo legible para evitar caracteres inválidos y límites de longitud en OPFS
  let h = 2166136261 >>> 0;
  for (let i = 0; i < rawKey.length; i++) {
    h ^= rawKey.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const safePrefix = rawKey
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 42);
  return `${safePrefix}_${h.toString(36)}.bin`;
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name || '';
  const msg = (err as { message?: string }).message || '';
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(msg)
  );
}

export class MediaStorageService {
  private metaDbPromise: Promise<IDBDatabase | null> | null = null;
  private opfsRootPromise: Promise<FileSystemDirectoryHandle | null> | null = null;
  private persistenceRequested = false;
  private isPersisted = false;
  private readonly activeExportIds = new Set<string>();
  private readonly deferredOrphans = new Set<string>();

  private static isLockedError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const name = (err as { name?: string }).name || '';
    const msg = (err as { message?: string }).message || '';
    return name === 'NoModificationAllowedError' || /NoModificationAllowedError|locked|in use/i.test(msg);
  }

  private async measureDirectoryRecursive(dir: FileSystemDirectoryHandle): Promise<number> {
    let total = 0;
    try {
      const iterable = dir as unknown as {
        entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
      };
      if (typeof iterable.entries !== 'function') return 0;
      for await (const [, handle] of iterable.entries()) {
        if (handle.kind === 'file') {
          try {
            const f = await (handle as FileSystemFileHandle).getFile();
            total += f.size;
          } catch {
            // Silencioso
          }
        } else if (handle.kind === 'directory') {
          total += await this.measureDirectoryRecursive(handle as FileSystemDirectoryHandle);
        }
      }
    } catch {
      // Silencioso
    }
    return total;
  }

  private async removeOpfsEntryWithRetry(
    dir: FileSystemDirectoryHandle,
    name: string,
    options?: { recursive?: boolean }
  ): Promise<{ removed: boolean; locked: boolean }> {
    const attempt = async () => {
      await dir.removeEntry(name, options?.recursive ? { recursive: true } : undefined);
    };
    try {
      await attempt();
      return { removed: true, locked: false };
    } catch (err) {
      if ((err as { name?: string })?.name === 'NotFoundError') {
        return { removed: false, locked: false };
      }
      if (MediaStorageService.isLockedError(err)) {
        await new Promise((r) => setTimeout(r, 150));
        try {
          await attempt();
          return { removed: true, locked: false };
        } catch (retryErr) {
          if (MediaStorageService.isLockedError(retryErr)) {
            return { removed: false, locked: true };
          }
          return { removed: false, locked: false };
        }
      }
      return { removed: false, locked: false };
    }
  }

  public getDeferredOrphans(): string[] {
    return Array.from(this.deferredOrphans);
  }

  public isExportActive(exportIdOrFileName: string): boolean {
    if (this.activeExportIds.size === 0) return false;
    for (const activeId of this.activeExportIds) {
      const safe = activeId.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (exportIdOrFileName.includes(activeId) || exportIdOrFileName.includes(safe)) {
        return true;
      }
    }
    return false;
  }

  public async getBackendKind(): Promise<StorageBackendKind> {
    const root = await this.getOpfsRoot();
    return root ? 'opfs' : 'indexeddb';
  }

  /**
   * Solicita almacenamiento persistente sin bloquear la aplicación si el navegador lo rechaza.
   */
  public async requestPersistence(): Promise<boolean> {
    if (this.persistenceRequested) return this.isPersisted;
    this.persistenceRequested = true;
    if (typeof navigator === 'undefined' || !navigator.storage) {
      return false;
    }
    try {
      if (typeof navigator.storage.persisted === 'function') {
        const already = await navigator.storage.persisted();
        if (already) {
          this.isPersisted = true;
          return true;
        }
      }
      if (typeof navigator.storage.persist === 'function') {
        this.isPersisted = await navigator.storage.persist();
        return this.isPersisted;
      }
    } catch {
      // Silencioso: nunca bloquear por políticas de navegador
    }
    return false;
  }

  private async getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
    if (this.opfsRootPromise) return this.opfsRootPromise;
    this.opfsRootPromise = (async () => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.storage ||
        typeof navigator.storage.getDirectory !== 'function'
      ) {
        return null;
      }
      try {
        const root = await navigator.storage.getDirectory();
        const appDir = await root.getDirectoryHandle('gortex-media', { create: true });
        return appDir;
      } catch {
        return null;
      }
    })();
    return this.opfsRootPromise;
  }

  private async getNamespaceDir(
    namespace: BinaryAssetNamespace
  ): Promise<FileSystemDirectoryHandle | null> {
    const root = await this.getOpfsRoot();
    if (!root) return null;
    try {
      return await root.getDirectoryHandle(namespace, { create: true });
    } catch {
      return null;
    }
  }

  private openMetaDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (this.metaDbPromise) return this.metaDbPromise;

    this.metaDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(META_DB_NAME, META_DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_META)) {
            const metaStore = db.createObjectStore(STORE_META, { keyPath: 'key' });
            metaStore.createIndex('by_project', 'projectId', { unique: false });
            metaStore.createIndex('by_namespace', 'namespace', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_FALLBACK_BLOBS)) {
            db.createObjectStore(STORE_FALLBACK_BLOBS, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.metaDbPromise;
  }

  private async putMeta(entry: BinaryMetaEntry): Promise<void> {
    const db = await this.openMetaDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_META, 'readwrite');
        tx.objectStore(STORE_META).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private async getMeta(key: string): Promise<BinaryMetaEntry | null> {
    const db = await this.openMetaDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_META, 'readonly');
        const req = tx.objectStore(STORE_META).get(key);
        req.onsuccess = () => resolve((req.result as BinaryMetaEntry | undefined) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async getAllMeta(): Promise<BinaryMetaEntry[]> {
    const db = await this.openMetaDb();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_META, 'readonly');
        const req = tx.objectStore(STORE_META).getAll();
        req.onsuccess = () => resolve((req.result as BinaryMetaEntry[]) ?? []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  private async deleteMeta(key: string): Promise<void> {
    const db = await this.openMetaDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_META, 'readwrite');
        tx.objectStore(STORE_META).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private async writeFallbackBlob(key: string, blob: Blob): Promise<void> {
    const db = await this.openMetaDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_FALLBACK_BLOBS, 'readwrite');
        tx.objectStore(STORE_FALLBACK_BLOBS).put({ key, blob });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IDB write failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  private async readFallbackBlob(key: string): Promise<Blob | null> {
    const db = await this.openMetaDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_FALLBACK_BLOBS, 'readonly');
        const req = tx.objectStore(STORE_FALLBACK_BLOBS).get(key);
        req.onsuccess = () => {
          const row = req.result as { key: string; blob?: Blob } | undefined;
          resolve(row?.blob instanceof Blob ? row.blob : null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async deleteFallbackBlob(key: string): Promise<void> {
    const db = await this.openMetaDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_FALLBACK_BLOBS, 'readwrite');
        tx.objectStore(STORE_FALLBACK_BLOBS).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Almacena un Blob binario pesado en OPFS (o fallback transparente a IndexedDB).
   * Si se produce `QuotaExceededError`, ejecuta una limpieza LRU de proyectos antiguos y reintenta.
   */
  public async putBlob(
    namespace: BinaryAssetNamespace,
    rawKey: string,
    blob: Blob,
    projectId = 'global'
  ): Promise<StorageBackendKind> {
    const fullKey = `${namespace}::${rawKey}`;
    const fileName = sanitizeFileName(rawKey);
    const now = Date.now();

    const writeOnce = async (): Promise<StorageBackendKind> => {
      const dir = await this.getNamespaceDir(namespace);
      if (dir) {
        try {
          const fileHandle = await dir.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          try {
            await writable.write(blob);
          } finally {
            await writable.close();
          }
          await this.putMeta({
            key: fullKey,
            namespace,
            fileName,
            projectId,
            sizeBytes: blob.size,
            mimeType: blob.type || 'application/octet-stream',
            lastAccessedAt: now,
            savedAt: now,
          });
          return 'opfs';
        } catch (err) {
          if (isQuotaError(err)) throw err;
          // Si OPFS falla por otra causa (p.ej. createWritable no soportado), caer a IndexedDB
        }
      }

      await this.writeFallbackBlob(fullKey, blob);
      await this.putMeta({
        key: fullKey,
        namespace,
        fileName,
        projectId,
        sizeBytes: blob.size,
        mimeType: blob.type || 'application/octet-stream',
        lastAccessedAt: now,
        savedAt: now,
      });
      return 'indexeddb';
    };

    try {
      return await writeOnce();
    } catch (err) {
      if (isQuotaError(err)) {
        await this.evictOldProjectsLru({ keepProjectIds: [projectId], maxProjectsToKeep: 3 });
        try {
          return await writeOnce();
        } catch {
          return 'indexeddb';
        }
      }
      return 'indexeddb';
    }
  }

  /**
   * Recupera un Blob binario desde OPFS (o fallback IndexedDB) y actualiza su marca LRU.
   */
  public async getBlob(
    namespace: BinaryAssetNamespace,
    rawKey: string
  ): Promise<Blob | null> {
    const fullKey = `${namespace}::${rawKey}`;
    const fileName = sanitizeFileName(rawKey);

    const dir = await this.getNamespaceDir(namespace);
    if (dir) {
      try {
        const handle = await dir.getFileHandle(fileName);
        const file = await handle.getFile();
        const meta = await this.getMeta(fullKey);
        if (meta) {
          meta.lastAccessedAt = Date.now();
          void this.putMeta(meta);
        }
        const mime = meta?.mimeType || file.type || 'application/octet-stream';
        return file.type === mime ? file : file.slice(0, file.size, mime);
      } catch {
        // Puede existir en IndexedDB de una sesión/fallback previo
      }
    }

    const fallbackBlob = await this.readFallbackBlob(fullKey);
    if (fallbackBlob) {
      const meta = await this.getMeta(fullKey);
      if (meta) {
        meta.lastAccessedAt = Date.now();
        void this.putMeta(meta);
      }
    }
    return fallbackBlob;
  }

  public async deleteBlob(namespace: BinaryAssetNamespace, rawKey: string): Promise<void> {
    const fullKey = `${namespace}::${rawKey}`;
    const fileName = sanitizeFileName(rawKey);
    const dir = await this.getNamespaceDir(namespace);
    if (dir) {
      try {
        await dir.removeEntry(fileName);
      } catch {
        // No existía en OPFS
      }
    }
    await this.deleteFallbackBlob(fullKey);
    await this.deleteMeta(fullKey);
  }

  /**
   * Almacena un archivo binario del usuario (foto WebP o clip MP4/WebM) directamente bajo
   * `gortex-media/projects/<projectId>/<fileName>` en OPFS (con fallback a IndexedDB etiquetado con `projectId`).
   * Integrado automáticamente con `getProjectSizesMap`, `deleteProjectAssetsAtomic` y `sweepOrphans`.
   */
  public async putProjectFile(
    projectId: string,
    fileName: string,
    blob: Blob
  ): Promise<{ key: string; backend: 'opfs' | 'indexeddb'; sizeBytes: number }> {
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fallbackKey = `project-file::${safeProjectId}::${safeFileName}`;

    void this.requestPersistence();
    const opfsRoot = await this.getOpfsRoot();
    if (opfsRoot) {
      try {
        const projectsDir = await opfsRoot.getDirectoryHandle('projects', { create: true });
        const projDir = await projectsDir.getDirectoryHandle(projectId, { create: true });
        const fileHandle = await projDir.getFileHandle(safeFileName, { create: true });
        const writable = await fileHandle.createWritable();
        try {
          await writable.write(blob);
          await writable.close();
        } catch (err) {
          try {
            await writable.abort();
          } catch {
            // Silencioso
          }
          throw err;
        }
        return {
          key: safeFileName,
          backend: 'opfs',
          sizeBytes: blob.size,
        };
      } catch {
        // Fallback silencioso a IndexedDB
      }
    }

    const now = Date.now();
    await this.writeFallbackBlob(fallbackKey, blob);
    await this.putMeta({
      key: fallbackKey,
      namespace: 'ai-art',
      projectId,
      fileName: safeFileName,
      mimeType: blob.type || 'application/octet-stream',
      sizeBytes: blob.size,
      lastAccessedAt: now,
      savedAt: now,
    });
    return {
      key: safeFileName,
      backend: 'indexeddb',
      sizeBytes: blob.size,
    };
  }

  /**
   * Lee un archivo de proyecto almacenado en `gortex-media/projects/<projectId>/<fileName>` (o fallback IDB).
   */
  public async getProjectFile(projectId: string, fileName: string): Promise<Blob | null> {
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fallbackKey = `project-file::${safeProjectId}::${safeFileName}`;

    const opfsRoot = await this.getOpfsRoot();
    if (opfsRoot) {
      try {
        const projectsDir = await opfsRoot.getDirectoryHandle('projects', { create: false });
        const projDir = await projectsDir.getDirectoryHandle(projectId, { create: false });
        const fileHandle = await projDir.getFileHandle(safeFileName, { create: false });
        const file = await fileHandle.getFile();
        if (file && file.size > 0) {
          return file;
        }
      } catch {
        // Intentar fallback IDB
      }
    }

    return this.readFallbackBlob(fallbackKey);
  }

  /**
   * Elimina un archivo específico del proyecto en `gortex-media/projects/<projectId>/<fileName>` (y fallback IDB).
   */
  public async deleteProjectFile(projectId: string, fileName: string): Promise<void> {
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fallbackKey = `project-file::${safeProjectId}::${safeFileName}`;

    const opfsRoot = await this.getOpfsRoot();
    if (opfsRoot) {
      try {
        const projectsDir = await opfsRoot.getDirectoryHandle('projects', { create: false });
        const projDir = await projectsDir.getDirectoryHandle(projectId, { create: false });
        await this.removeOpfsEntryWithRetry(projDir, safeFileName);
      } catch {
        // Puede no existir en OPFS
      }
    }

    await this.deleteFallbackBlob(fallbackKey);
    await this.deleteMeta(fallbackKey);
  }

  public async getProjectSizesMap(): Promise<Record<string, number>> {
    const all = await this.getAllMeta();
    const map: Record<string, number> = {};
    for (const entry of all) {
      if (!entry.projectId || entry.projectId === 'global' || entry.projectId === 'rendered-videos') {
        continue;
      }
      map[entry.projectId] = (map[entry.projectId] ?? 0) + (entry.sizeBytes || 0);
    }

    // También contabilizar directorios directos en OPFS `gortex-media/projects/<projectId>` si existen
    const opfsRoot = await this.getOpfsRoot();
    if (opfsRoot) {
      try {
        const projectsDir = await opfsRoot.getDirectoryHandle('projects', { create: false });
        const iterable = projectsDir as unknown as {
          entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
        };
        if (typeof iterable.entries === 'function') {
          for await (const [projName, handle] of iterable.entries()) {
            if (handle.kind === 'directory') {
              const dirBytes = await this.measureDirectoryRecursive(
                handle as FileSystemDirectoryHandle
              );
              map[projName] = (map[projName] ?? 0) + dirBytes;
            }
          }
        }
      } catch {
        // El directorio `projects` puede no existir aún
      }
    }

    return map;
  }

  public async getProjectSizeBytes(projectId: string): Promise<number> {
    const map = await this.getProjectSizesMap();
    return map[projectId] ?? 0;
  }

  public async deleteProjectAssets(
    projectId: string,
    namespaces?: BinaryAssetNamespace[]
  ): Promise<number> {
    const res = await this.deleteProjectAssetsAtomic(projectId, namespaces);
    return res.freedBytes;
  }

  /**
   * Eliminación física atómica de todos los activos binarios de un proyecto:
   * - Archivos OPFS en todos los namespaces registrados en `binary_meta`
   * - Directorio OPFS `gortex-media/projects/<projectId>` si existe
   * - Temporales `tmp-exports` asociados al `projectId`
   * - Filas en `fallback_blobs` y `binary_meta` de IndexedDB
   * Incluye reintento tras 150ms ante `NoModificationAllowedError` y registro de huérfanos diferidos.
   */
  public async deleteProjectAssetsAtomic(
    projectId: string,
    namespaces?: BinaryAssetNamespace[]
  ): Promise<{ freedBytes: number; deferredOrphans: string[] }> {
    const all = await this.getAllMeta();
    const targets = all.filter(
      (entry) =>
        entry.projectId === projectId &&
        (!namespaces || namespaces.includes(entry.namespace))
    );
    let freedBytes = 0;
    const lockedEntries: string[] = [];

    for (const entry of targets) {
      const dir = await this.getNamespaceDir(entry.namespace);
      if (dir) {
        const removal = await this.removeOpfsEntryWithRetry(dir, entry.fileName);
        if (removal.locked) {
          const orphanTag = `opfs:${entry.namespace}/${entry.fileName}`;
          lockedEntries.push(orphanTag);
          this.deferredOrphans.add(orphanTag);
          continue;
        }
      }
      await this.deleteFallbackBlob(entry.key);
      await this.deleteMeta(entry.key);
      freedBytes += entry.sizeBytes || 0;
    }

    // Purgar directorio OPFS `gortex-media/projects/<projectId>` si existe
    const opfsRoot = await this.getOpfsRoot();
    if (opfsRoot && (!namespaces || namespaces.length === 0)) {
      try {
        const projectsDir = await opfsRoot.getDirectoryHandle('projects', { create: false });
        try {
          const projHandle = await projectsDir.getDirectoryHandle(projectId, { create: false });
          const dirBytes = await this.measureDirectoryRecursive(projHandle);
          const removal = await this.removeOpfsEntryWithRetry(projectsDir, projectId, {
            recursive: true,
          });
          if (removal.locked) {
            const orphanTag = `opfs:projects/${projectId}`;
            lockedEntries.push(orphanTag);
            this.deferredOrphans.add(orphanTag);
          } else if (removal.removed) {
            freedBytes += dirBytes;
          }
        } catch {
          // No existe subdirectorio para este proyecto
        }
      } catch {
        // No existe `projects/`
      }

      // Limpiar cualquier archivo temporal de exportación asociado al proyecto
      const tmpDir = await this.getNamespaceDir('tmp-exports');
      if (tmpDir) {
        const safeProj = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
        try {
          const iterable = tmpDir as unknown as {
            entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
          };
          if (typeof iterable.entries === 'function') {
            for await (const [name, handle] of iterable.entries()) {
              if (!name.includes(projectId) && !name.includes(safeProj)) continue;
              let fileSize = 0;
              if (handle.kind === 'file') {
                try {
                  fileSize = (await (handle as FileSystemFileHandle).getFile()).size;
                } catch {
                  // Silencioso
                }
              }
              const removal = await this.removeOpfsEntryWithRetry(tmpDir, name, {
                recursive: handle.kind === 'directory',
              });
              if (removal.locked) {
                const orphanTag = `opfs:tmp-exports/${name}`;
                lockedEntries.push(orphanTag);
                this.deferredOrphans.add(orphanTag);
              } else if (removal.removed) {
                freedBytes += fileSize;
              }
            }
          }
        } catch {
          // Silencioso
        }
      }
    }

    return { freedBytes, deferredOrphans: lockedEntries };
  }

  private async getAllFallbackBlobKeys(): Promise<Array<{ key: string; size: number }>> {
    const db = await this.openMetaDb();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_FALLBACK_BLOBS, 'readonly');
        const req = tx.objectStore(STORE_FALLBACK_BLOBS).getAll();
        req.onsuccess = () => {
          const rows = (req.result as Array<{ key: string; blob?: Blob }>) ?? [];
          resolve(
            rows.map((r) => ({
              key: r.key,
              size: r.blob instanceof Blob ? r.blob.size : 0,
            }))
          );
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /**
   * Barrido profundo de huérfanos en OPFS + IndexedDB (`binary_meta` y `fallback_blobs`)
   * y archivos temporales de exportación (`tmp-exports`, `.tmp`, `.part`) con más de 5 minutos
   * de antigüedad, respetando siempre exportaciones activas y sin tocar jamás `Cache Storage`.
   */
  public async sweepOrphans(
    validProjectIds: Set<string>,
    options?: { tempMaxAgeMs?: number; activeVideoIds?: Set<string> }
  ): Promise<{ orphanedEntriesRemoved: number; reclaimedBytes: number; deferredOrphans: string[] }> {
    const tempMaxAgeMs = options?.tempMaxAgeMs ?? 5 * 60 * 1000;
    const activeVideoIds = options?.activeVideoIds;
    const now = Date.now();
    let orphanedEntriesRemoved = 0;
    let reclaimedBytes = 0;
    const deferred: string[] = [];

    // 1) Auditar `binary_meta`: eliminar entradas cuyo projectId ya no existe en Biblioteca
    const allMeta = await this.getAllMeta();
    const validFileNamesByNs = new Map<BinaryAssetNamespace, Set<string>>();
    const validMetaKeys = new Set<string>();

    for (const entry of allMeta) {
      let isOrphan = false;
      if (entry.projectId === 'rendered-videos') {
        if (activeVideoIds) {
          const rawVideoId = entry.key.replace(/^videos::/, '');
          if (!activeVideoIds.has(rawVideoId)) {
            isOrphan = true;
          }
        }
      } else if (entry.projectId && entry.projectId !== 'global') {
        if (!validProjectIds.has(entry.projectId)) {
          isOrphan = true;
        }
      }

      if (isOrphan) {
        const dir = await this.getNamespaceDir(entry.namespace);
        if (dir) {
          const removal = await this.removeOpfsEntryWithRetry(dir, entry.fileName);
          if (removal.locked) {
            const tag = `opfs:${entry.namespace}/${entry.fileName}`;
            deferred.push(tag);
            this.deferredOrphans.add(tag);
            continue;
          }
        }
        await this.deleteFallbackBlob(entry.key);
        await this.deleteMeta(entry.key);
        orphanedEntriesRemoved += 1;
        reclaimedBytes += entry.sizeBytes || 0;
      } else {
        validMetaKeys.add(entry.key);
        let nsSet = validFileNamesByNs.get(entry.namespace);
        if (!nsSet) {
          nsSet = new Set<string>();
          validFileNamesByNs.set(entry.namespace, nsSet);
        }
        nsSet.add(entry.fileName);
      }
    }

    // 2) Auditar `fallback_blobs` huérfanos sin metadato correspondiente en `binary_meta`
    const allFallback = await this.getAllFallbackBlobKeys();
    for (const row of allFallback) {
      if (!validMetaKeys.has(row.key)) {
        await this.deleteFallbackBlob(row.key);
        orphanedEntriesRemoved += 1;
        reclaimedBytes += row.size;
      }
    }

    // 3) Auditar sistema de archivos OPFS: archivos sin referencia en cada namespace + `projects/` + `tmp-exports/`
    const opfsRoot = await this.getOpfsRoot();
    if (opfsRoot) {
      const trackedNamespaces: BinaryAssetNamespace[] = ['ai-art', 'depth-maps', 'audio', 'videos'];
      for (const ns of trackedNamespaces) {
        const dir = await this.getNamespaceDir(ns);
        if (!dir) continue;
        const knownFiles = validFileNamesByNs.get(ns) ?? new Set<string>();
        try {
          const iterable = dir as unknown as {
            entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
          };
          if (typeof iterable.entries !== 'function') continue;
          for await (const [name, handle] of iterable.entries()) {
            if (handle.kind === 'file' && knownFiles.has(name)) continue;
            let bytes = 0;
            if (handle.kind === 'file') {
              try {
                bytes = (await (handle as FileSystemFileHandle).getFile()).size;
              } catch {
                // Silencioso
              }
            } else if (handle.kind === 'directory') {
              bytes = await this.measureDirectoryRecursive(handle as FileSystemDirectoryHandle);
            }
            const removal = await this.removeOpfsEntryWithRetry(dir, name, {
              recursive: handle.kind === 'directory',
            });
            if (removal.locked) {
              const tag = `opfs:${ns}/${name}`;
              deferred.push(tag);
              this.deferredOrphans.add(tag);
            } else if (removal.removed) {
              orphanedEntriesRemoved += 1;
              reclaimedBytes += bytes;
            }
          }
        } catch {
          // Silencioso
        }
      }

      // 3b) Auditar `gortex-media/projects/*` (cualquier directorio de proyecto inexistente)
      try {
        const projectsDir = await opfsRoot.getDirectoryHandle('projects', { create: false });
        const iterable = projectsDir as unknown as {
          entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
        };
        if (typeof iterable.entries === 'function') {
          for await (const [name, handle] of iterable.entries()) {
            if (validProjectIds.has(name)) continue;
            let bytes = 0;
            if (handle.kind === 'directory') {
              bytes = await this.measureDirectoryRecursive(handle as FileSystemDirectoryHandle);
            } else if (handle.kind === 'file') {
              try {
                bytes = (await (handle as FileSystemFileHandle).getFile()).size;
              } catch {
                // Silencioso
              }
            }
            const removal = await this.removeOpfsEntryWithRetry(projectsDir, name, {
              recursive: handle.kind === 'directory',
            });
            if (removal.locked) {
              const tag = `opfs:projects/${name}`;
              deferred.push(tag);
              this.deferredOrphans.add(tag);
            } else if (removal.removed) {
              orphanedEntriesRemoved += 1;
              reclaimedBytes += bytes;
            }
          }
        }
      } catch {
        // `projects/` puede no existir
      }

      // 3c) Auditar `gortex-media/tmp-exports/*` con antigüedad > tempMaxAgeMs (ignorando exportaciones activas)
      const tmpDir = await this.getNamespaceDir('tmp-exports');
      if (tmpDir) {
        try {
          const iterable = tmpDir as unknown as {
            entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
          };
          if (typeof iterable.entries === 'function') {
            for await (const [name, handle] of iterable.entries()) {
              if (this.isExportActive(name)) continue;
              let bytes = 0;
              let lastMod = 0;
              if (handle.kind === 'file') {
                try {
                  const file = await (handle as FileSystemFileHandle).getFile();
                  bytes = file.size;
                  lastMod = file.lastModified || 0;
                } catch {
                  // Silencioso
                }
              } else if (handle.kind === 'directory') {
                bytes = await this.measureDirectoryRecursive(handle as FileSystemDirectoryHandle);
              }
              if (lastMod > 0 && now - lastMod < tempMaxAgeMs) {
                continue;
              }
              const removal = await this.removeOpfsEntryWithRetry(tmpDir, name, {
                recursive: handle.kind === 'directory',
              });
              if (removal.locked) {
                const tag = `opfs:tmp-exports/${name}`;
                deferred.push(tag);
                this.deferredOrphans.add(tag);
              } else if (removal.removed) {
                orphanedEntriesRemoved += 1;
                reclaimedBytes += bytes;
              }
            }
          }
        } catch {
          // Silencioso
        }
      }

      // 3d) Auditar raíz OPFS (`navigator.storage.getDirectory()`) por archivos temporales sueltos (`tmp_export_*`, `.tmp`, `.part`) o carpetas huérfanas bajo `projects/`
      try {
        const rootStorage = await navigator.storage.getDirectory();
        const iterable = rootStorage as unknown as {
          entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
        };
        if (typeof iterable.entries === 'function') {
          for await (const [name, handle] of iterable.entries()) {
            if (name === 'gortex-media') continue;
            const isTempName =
              name.startsWith('tmp_export_') ||
              name.endsWith('.tmp') ||
              name.endsWith('.part');
            if (isTempName && !this.isExportActive(name)) {
              let bytes = 0;
              let lastMod = 0;
              if (handle.kind === 'file') {
                try {
                  const f = await (handle as FileSystemFileHandle).getFile();
                  bytes = f.size;
                  lastMod = f.lastModified || 0;
                } catch {
                  // Silencioso
                }
              }
              if (lastMod > 0 && now - lastMod < tempMaxAgeMs) continue;
              const removal = await this.removeOpfsEntryWithRetry(rootStorage, name, {
                recursive: handle.kind === 'directory',
              });
              if (removal.locked) {
                const tag = `opfs:root/${name}`;
                deferred.push(tag);
                this.deferredOrphans.add(tag);
              } else if (removal.removed) {
                orphanedEntriesRemoved += 1;
                reclaimedBytes += bytes;
              }
            } else if (name === 'projects' && handle.kind === 'directory') {
              const rootProjDir = handle as FileSystemDirectoryHandle;
              const projIter = rootProjDir as unknown as {
                entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
              };
              if (typeof projIter.entries === 'function') {
                for await (const [pName, pHandle] of projIter.entries()) {
                  if (validProjectIds.has(pName)) continue;
                  const bytes =
                    pHandle.kind === 'directory'
                      ? await this.measureDirectoryRecursive(pHandle as FileSystemDirectoryHandle)
                      : 0;
                  const removal = await this.removeOpfsEntryWithRetry(rootProjDir, pName, {
                    recursive: pHandle.kind === 'directory',
                  });
                  if (removal.locked) {
                    const tag = `opfs:root/projects/${pName}`;
                    deferred.push(tag);
                    this.deferredOrphans.add(tag);
                  } else if (removal.removed) {
                    orphanedEntriesRemoved += 1;
                    reclaimedBytes += bytes;
                  }
                }
              }
            }
          }
        }
      } catch {
        // Silencioso
      }
    }

    // Limpiar deferredOrphans previos que ya hayan desaparecido
    for (const tag of Array.from(this.deferredOrphans)) {
      if (!deferred.includes(tag)) {
        this.deferredOrphans.delete(tag);
      }
    }

    return {
      orphanedEntriesRemoved,
      reclaimedBytes,
      deferredOrphans: deferred,
    };
  }

  /**
   * Consulta el estado de almacenamiento del navegador (`navigator.storage.estimate()`)
   * para diagnosticar presión de cuota y backend activo.
   */
  public async getStorageHealth(): Promise<StorageHealthReport> {
    const opfsRoot = await this.getOpfsRoot();
    const opfsAvailable = Boolean(opfsRoot);
    let persisted = this.isPersisted;
    let usageBytes = 0;
    let quotaBytes = 0;

    if (typeof navigator !== 'undefined' && navigator.storage) {
      try {
        if (typeof navigator.storage.persisted === 'function') {
          persisted = await navigator.storage.persisted();
          this.isPersisted = persisted;
        }
      } catch {
        // Silencioso
      }
      try {
        if (typeof navigator.storage.estimate === 'function') {
          const est = await navigator.storage.estimate();
          usageBytes = est.usage ?? 0;
          quotaBytes = est.quota ?? 0;
        }
      } catch {
        // Silencioso
      }
    }

    const usagePercent =
      quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10) : 0;
    const pressure: StorageHealthReport['pressure'] =
      usagePercent >= 85 ? 'critical' : usagePercent >= 65 ? 'warning' : 'ok';

    return {
      backend: opfsAvailable ? 'opfs' : 'indexeddb',
      opfsAvailable,
      persisted,
      usageBytes,
      quotaBytes,
      usagePercent,
      pressure,
    };
  }

  /**
   * Limpieza LRU opcional de proyectos antiguos + archivos temporales huérfanos
   * para prevenir errores `QuotaExceededError` en sesiones con proyectos largos.
   */
  public async evictOldProjectsLru(options?: {
    keepProjectIds?: string[];
    maxProjectsToKeep?: number;
  }): Promise<{ evictedProjects: string[]; freedBytes: number }> {
    const keepSet = new Set(options?.keepProjectIds ?? []);
    const maxProjectsToKeep = options?.maxProjectsToKeep ?? 5;

    // 1) Limpiar primero cualquier archivo temporal huérfano en tmp-exports
    await this.cleanupOrphanedTempExports();

    // 2) Agrupar entradas por projectId y ordenar por último acceso (más antiguo primero)
    const all = await this.getAllMeta();
    const projectStats = new Map<string, { lastAccessed: number; totalBytes: number }>();

    for (const entry of all) {
      if (!entry.projectId || entry.projectId === 'global' || keepSet.has(entry.projectId)) {
        continue;
      }
      const prev = projectStats.get(entry.projectId);
      const ts = entry.lastAccessedAt || entry.savedAt || 0;
      if (!prev) {
        projectStats.set(entry.projectId, { lastAccessed: ts, totalBytes: entry.sizeBytes || 0 });
      } else {
        prev.lastAccessed = Math.max(prev.lastAccessed, ts);
        prev.totalBytes += entry.sizeBytes || 0;
      }
    }

    const sortedProjects = Array.from(projectStats.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );

    const excessCount = Math.max(0, sortedProjects.length - maxProjectsToKeep);
    const toEvict = sortedProjects.slice(0, excessCount);
    const evictedProjects: string[] = [];
    let freedBytes = 0;

    for (const [projectId] of toEvict) {
      freedBytes += await this.deleteProjectAssets(projectId);
      evictedProjects.push(projectId);
    }

    return { evictedProjects, freedBytes };
  }

  /**
   * Limpia archivos temporales en `tmp-exports/` sobrantes de sesiones anteriores o canceladas.
   */
  public async cleanupOrphanedTempExports(activeExportId?: string): Promise<void> {
    const dir = await this.getNamespaceDir('tmp-exports');
    if (!dir) return;
    try {
      const iterableDir = dir as unknown as {
        entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
      };
      if (typeof iterableDir.entries !== 'function') return;
      for await (const [name] of iterableDir.entries()) {
        if (activeExportId && name.includes(activeExportId)) continue;
        try {
          await dir.removeEntry(name);
        } catch {
          // Silencioso
        }
      }
    } catch {
      // Silencioso
    }
  }

  /**
   * Crea un stream de escritura incremental para `StreamTarget` de `mp4-muxer`:
   * - En OPFS: escribe cada chunk directamente a disco en `tmp-exports/` (cero ArrayBuffer gigante en RAM).
   * - Fallback: acumula chunks pequeños en memoria y los ensambla en un `Blob` al finalizar.
   */
  public async createTempExportStream(exportId: string): Promise<TempExportStreamHandle> {
    const safeName = `export_${exportId.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
    const dir = await this.getNamespaceDir('tmp-exports');
    this.activeExportIds.add(exportId);

    if (dir) {
      try {
        const fileHandle = await dir.getFileHandle(safeName, { create: true });
        const writable = await fileHandle.createWritable();
        let closed = false;
        let writeChain: Promise<void> = Promise.resolve();

        return {
          id: exportId,
          backend: 'opfs',
          writeChunk: (data: Uint8Array, position: number) => {
            // Copiar slice estable para evitar mutación concurrente mientras el stream escribe
            const copy = new Uint8Array(data.byteLength);
            copy.set(data);
            writeChain = writeChain.then(async () => {
              if (closed) return;
              await writable.write({
                type: 'write',
                position,
                data: copy,
              });
            });
            return writeChain;
          },
          finalizeToBlob: async (mimeType: string) => {
            try {
              await writeChain;
              if (!closed) {
                closed = true;
                await writable.close();
              }
              const file = await fileHandle.getFile();
              // `file.slice` mantiene el respaldo en disco de OPFS con el tipo MIME correcto sin duplicar RAM
              return file.slice(0, file.size, mimeType);
            } finally {
              this.activeExportIds.delete(exportId);
            }
          },
          abortAndCleanup: async () => {
            try {
              await writeChain.catch(() => {});
              if (!closed) {
                closed = true;
                await writable.abort().catch(() => writable.close().catch(() => {}));
              }
            } finally {
              this.activeExportIds.delete(exportId);
              try {
                await this.removeOpfsEntryWithRetry(dir, safeName);
              } catch {
                // Silencioso
              }
            }
          },
        };
      } catch {
        // Fallback silencioso a chunks en memoria si createWritable no está soportado (ej. Safari antiguo)
      }
    }

    // Fallback en memoria basado en chunks posicionados (sin realocar un único buffer en cada paquete)
    const positionedChunks: Array<{ position: number; data: Uint8Array }> = [];
    let maxEnd = 0;

    return {
      id: exportId,
      backend: 'memory-chunks',
      writeChunk: async (data: Uint8Array, position: number) => {
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);
        positionedChunks.push({ position, data: copy });
        const end = position + copy.byteLength;
        if (end > maxEnd) maxEnd = end;
      },
      finalizeToBlob: async (mimeType: string) => {
        try {
          const out = new Uint8Array(maxEnd);
          for (const chunk of positionedChunks) {
            out.set(chunk.data, chunk.position);
          }
          positionedChunks.length = 0;
          return new Blob([out.buffer], { type: mimeType });
        } finally {
          this.activeExportIds.delete(exportId);
        }
      },
      abortAndCleanup: async () => {
        positionedChunks.length = 0;
        maxEnd = 0;
        this.activeExportIds.delete(exportId);
      },
    };
  }
}

export const mediaStorageService = new MediaStorageService();
