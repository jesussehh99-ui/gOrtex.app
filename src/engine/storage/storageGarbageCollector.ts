import type { GarbageCollectionReport, ViralScript } from '../../types';
import { getSavedVideoIds, sweepLegacyOrphans } from '../../utils/mediaStorage';
import { mediaStorageService } from '../../utils/mediaStorageService';
import {
  getActiveSessionController,
  SCRIPTS_STORAGE_KEY,
} from './projectLifecycleService';
import { SagaIntegrityManager } from './sagaIntegrityManager';
import { computeAllProjectSizes } from './storageTelemetryService';

let isGcRunning = false;

function loadScriptsSnapshot(): ViralScript[] {
  const controller = getActiveSessionController();
  if (controller) {
    return controller.getScripts();
  }
  try {
    const raw = localStorage.getItem(SCRIPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ViralScript[]) : [];
  } catch {
    return [];
  }
}

/**
 * StorageGarbageCollector:
 * Ejecuta una auditoría no bloqueante de disco (OPFS + IndexedDB) y consistencia de Sagas:
 * 1. Construye el conjunto autorizado de `projectId` válidos en la Biblioteca.
 * 2. Ejecuta `SagaIntegrityManager.reconcileSagaReferences` (auto-reparación de `episodeIds` y `sagaId` rotos).
 * 3. Elimina archivos y directorios huérfanos en OPFS e IndexedDB + temporales `tmp-exports`/`.tmp`/`.part` > 5 min
 *    (respetando exportaciones activas y el proyecto abierto).
 * 4. Recalcula en segundo plano `estimatedSizeBytes` faltantes para la Biblioteca.
 * 5. NUNCA toca ni borra los pesos de modelos IA locales (`Depth Anything V2`) en `Cache Storage`.
 */
export async function runStartupGarbageCollection(
  activeProjectId?: string
): Promise<GarbageCollectionReport> {
  if (isGcRunning) {
    return {
      orphanedEntriesRemoved: 0,
      reclaimedBytes: 0,
      brokenSagaRefsFixed: 0,
      deferredOrphans: mediaStorageService.getDeferredOrphans(),
      sizesBackfilled: 0,
    };
  }

  isGcRunning = true;
  try {
    const scripts = loadScriptsSnapshot();
    const validProjectIds = new Set<string>(scripts.map((s) => s.id));
    if (activeProjectId) {
      validProjectIds.add(activeProjectId);
    }

    // 1) Reconciliación autorreparable de Sagas
    const reconciliation = SagaIntegrityManager.reconcileSagaReferences(validProjectIds, scripts);
    let workingScripts = reconciliation.scripts;
    let scriptsMutated = reconciliation.scriptsChanged;

    // 2) Barrido de huérfanos en OPFS + IndexedDB (respetando videos guardados y exportaciones activas)
    const activeVideoIds = await getSavedVideoIds();
    const [opfsSweep, legacySweep] = await Promise.all([
      mediaStorageService.sweepOrphans(validProjectIds, {
        tempMaxAgeMs: 5 * 60 * 1000,
        activeVideoIds,
      }),
      sweepLegacyOrphans(validProjectIds),
    ]);

    // 3) Recalcular en segundo plano `estimatedSizeBytes` si algún proyecto no lo tiene actualizado
    const realSizes = await computeAllProjectSizes(workingScripts);
    let sizesBackfilled = 0;

    workingScripts = workingScripts.map((script) => {
      const measured = realSizes[script.id];
      if (typeof measured === 'number' && measured > 0) {
        const prev = script.estimatedSizeBytes ?? 0;
        if (prev === 0 || Math.abs(measured - prev) > 32 * 1024) {
          sizesBackfilled += 1;
          scriptsMutated = true;
          return {
            ...script,
            estimatedSizeBytes: measured,
          };
        }
      }
      return script;
    });

    if (scriptsMutated || reconciliation.sagasChanged) {
      try {
        localStorage.setItem(SCRIPTS_STORAGE_KEY, JSON.stringify(workingScripts));
      } catch {
        // Silencioso
      }
      getActiveSessionController()?.commitReconciliationState?.(
        workingScripts,
        reconciliation.sagas
      );
    }

    return {
      orphanedEntriesRemoved:
        opfsSweep.orphanedEntriesRemoved + legacySweep.orphanedEntriesRemoved,
      reclaimedBytes: opfsSweep.reclaimedBytes + legacySweep.reclaimedBytes,
      brokenSagaRefsFixed: reconciliation.brokenSagaRefsFixed,
      deferredOrphans: opfsSweep.deferredOrphans,
      sizesBackfilled,
    };
  } finally {
    isGcRunning = false;
  }
}

/**
 * Programa el Recolector de Basura al arrancar la app mediante `requestIdleCallback`
 * (fallback `setTimeout(..., 2000)`) para nunca impactar el tiempo de carga inicial.
 */
export function scheduleStartupGarbageCollection(
  getActiveProjectId: () => string | undefined,
  onComplete?: (report: GarbageCollectionReport) => void
): () => void {
  let cancelled = false;
  let idleId: number | null = null;
  let timeoutId: number | null = null;

  const execute = () => {
    if (cancelled) return;
    void runStartupGarbageCollection(getActiveProjectId()).then((report) => {
      if (!cancelled) {
        onComplete?.(report);
      }
    });
  };

  if (typeof window !== 'undefined') {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(execute, { timeout: 3500 });
    } else {
      timeoutId = globalThis.setTimeout(execute, 2000) as unknown as number;
    }
  }

  return () => {
    cancelled = true;
    if (typeof window !== 'undefined') {
      const win = window as Window & {
        cancelIdleCallback?: (id: number) => void;
      };
      if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    }
  };
}

export const StorageGarbageCollector = {
  runStartupGarbageCollection,
  scheduleStartupGarbageCollection,
};
