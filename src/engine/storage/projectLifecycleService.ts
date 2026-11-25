import type { DeletionReport, ProjectSummary, SagaBible, ViralScript } from '../../types';
import { cancelAndEvictProjectFromImageQueue } from '../../utils/aiImageQueue';
import { stopCurrentAudio } from '../../utils/audioPlayer';
import { SceneBitmapCache } from '../../utils/bitmapWindowCache';
import { localDepthEngine } from '../../utils/localDepthEngine';
import { deleteProjectLegacyMedia } from '../../utils/mediaStorage';
import { mediaStorageService } from '../../utils/mediaStorageService';
import { getSagaById, loadAllSagas } from '../../utils/sagaBibleStorage';
import { stopMusicPreview } from '../../utils/soundtrackEngine';
import { stopUnifiedVoiceAudition } from '../../utils/unifiedVoiceEngine';
import { objectUrlRegistry } from './objectUrlRegistry';
import { SagaIntegrityManager } from './sagaIntegrityManager';

export const SCRIPTS_STORAGE_KEY = 'corte30_saved_scripts_v2';

export interface ActiveSessionController {
  getScripts: () => ViralScript[];
  getActiveProjectId: () => string;
  /**
   * Detiene reproducción/preview y desmonta el proyecto del editor/simulador ANTES de borrar archivos.
   */
  unmountProjectBeforeDelete: (projectId: string) => void;
  /**
   * Aplica en el estado React la eliminación definitiva de uno o varios proyectos y las sagas actualizadas.
   */
  commitDeletionState: (deletedProjectIds: string[], updatedSagas: SagaBible[]) => void;
  /**
   * Aplica cambios de reconciliación o recálculo de tamaños desde el Garbage Collector.
   */
  commitReconciliationState?: (scripts: ViralScript[], sagas: SagaBible[]) => void;
}

let sessionController: ActiveSessionController | null = null;
const activeExportControllers = new Map<string, Set<AbortController>>();

export function registerActiveSessionController(controller: ActiveSessionController): () => void {
  sessionController = controller;
  return () => {
    if (sessionController === controller) {
      sessionController = null;
    }
  };
}

export function getActiveSessionController(): ActiveSessionController | null {
  return sessionController;
}

export function registerActiveExport(projectId: string, controller: AbortController): () => void {
  let set = activeExportControllers.get(projectId);
  if (!set) {
    set = new Set<AbortController>();
    activeExportControllers.set(projectId, set);
  }
  set.add(controller);
  return () => {
    const cur = activeExportControllers.get(projectId);
    if (!cur) return;
    cur.delete(controller);
    if (cur.size === 0) {
      activeExportControllers.delete(projectId);
    }
  };
}

export function abortExportsForProject(projectId: string): number {
  const set = activeExportControllers.get(projectId);
  if (!set || set.size === 0) return 0;
  let aborted = 0;
  for (const ctrl of Array.from(set)) {
    try {
      ctrl.abort();
      aborted += 1;
    } catch {
      // Silencioso
    }
  }
  activeExportControllers.delete(projectId);
  return aborted;
}

/**
 * Proyección ligera `ProjectSummary` para la Biblioteca:
 * evita pasar arrays pesados de beats, blobs, audios o mapas de profundidad a las tarjetas de lista.
 */
export function buildProjectSummary(
  script: ViralScript,
  measuredSizeBytes?: number
): ProjectSummary {
  const createdTs = Date.parse(script.creadoEn) || Date.now();
  const isDraft =
    typeof script.isDraft === 'boolean'
      ? script.isDraft
      : !script.hasBeenExported;
  return {
    id: script.id,
    tituloViral: script.tituloViral,
    premisa: script.premisa,
    nicho: script.nicho,
    duracionSegundos: script.duracionSegundos,
    estilo3D: script.estilo3D,
    plataforma: script.plataforma,
    formatoVideo: script.formatoVideo || '9:16',
    creadoEn: script.creadoEn,
    sceneCount: script.escenas.length,
    sagaId: script.sagaId,
    episodeNumber: script.episodeNumber,
    serieNumero: script.serieNumero,
    isFavorite: Boolean(script.isFavorite),
    isDraft,
    estimatedSizeBytes:
      typeof measuredSizeBytes === 'number' && measuredSizeBytes > 0
        ? measuredSizeBytes
        : script.estimatedSizeBytes ?? 0,
    lastOpenedAt: script.lastOpenedAt ?? createdTs,
    hasVisualBible: Boolean(script.visualBible?.fixedPrefixPrompt),
  };
}

function readScriptsFromLocalStorage(): ViralScript[] {
  try {
    const raw = localStorage.getItem(SCRIPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ViralScript[]) : [];
  } catch {
    return [];
  }
}

function writeScriptsToLocalStorage(scripts: ViralScript[]): void {
  try {
    localStorage.setItem(SCRIPTS_STORAGE_KEY, JSON.stringify(scripts));
  } catch {
    // Silencioso
  }
}

/**
 * Eliminación atómica en 4 pasos estrictamente ordenados:
 * 1) Cancelar y desmontar trabajo activo (exportaciones, cola de imágenes, depth worker, audio/preview y cambio seguro de editor).
 * 2) Liberar RAM y VRAM al instante (`SceneBitmapCache.evictProject` -> `bitmap.close()`, `ObjectUrlRegistry.revokeProject`).
 * 3) Actualizar `SagaBible` (salvo `skipSagaUpdate`) y eliminar metadatos del proyecto.
 * 4) Purgar físicamente OPFS + IndexedDB (con reintento ante `NoModificationAllowedError` y tracking de huérfanos diferidos).
 */
export async function deleteProjectAtomically(
  projectId: string,
  options?: { skipSagaUpdate?: boolean; deleteEmptySaga?: boolean }
): Promise<DeletionReport> {
  if (!projectId) {
    return {
      deletedProjectIds: [],
      updatedSagaIds: [],
      deletedSagaIds: [],
      reclaimedBytes: 0,
      deferredOrphans: [],
    };
  }

  // --- PASO 1: Cancelación y desmontaje seguro ANTES de tocar archivos ---
  abortExportsForProject(projectId);
  cancelAndEvictProjectFromImageQueue(projectId);
  localDepthEngine.evictProject(projectId);

  if (sessionController?.getActiveProjectId() === projectId) {
    try {
      stopCurrentAudio();
      stopUnifiedVoiceAudition();
      stopMusicPreview();
    } catch {
      // Silencioso
    }
    sessionController.unmountProjectBeforeDelete(projectId);
    // Ceder un micro-tick para que los hooks de Canvas/WebGL desmonten y cierren handles activos
    await new Promise((r) => setTimeout(r, 24));
  }

  // --- PASO 2: Liberación inmediata de RAM y VRAM ---
  SceneBitmapCache.evictProject(projectId);
  objectUrlRegistry.revokeProject(projectId);

  // --- PASO 3: Integridad de SagaBible y metadatos del proyecto ---
  let updatedSagaIds: string[] = [];
  let deletedSagaIds: string[] = [];
  let nextSagas: SagaBible[] = loadAllSagas();

  if (!options?.skipSagaUpdate) {
    const sagaRes = SagaIntegrityManager.removeEpisodeFromSagas(projectId, {
      deleteEmptySaga: options?.deleteEmptySaga ?? true,
    });
    updatedSagaIds = sagaRes.updatedSagaIds;
    deletedSagaIds = sagaRes.deletedSagaIds;
    nextSagas = sagaRes.sagas;
  }

  const currentScripts = sessionController?.getScripts() ?? readScriptsFromLocalStorage();
  const remainingScripts = currentScripts.filter((s) => s.id !== projectId);
  writeScriptsToLocalStorage(remainingScripts);
  sessionController?.commitDeletionState([projectId], nextSagas);

  // --- PASO 4: Purga física en OPFS + IndexedDB (fallback + legacy) ---
  const [binaryPurge, legacyFreedBytes] = await Promise.all([
    mediaStorageService.deleteProjectAssetsAtomic(projectId),
    deleteProjectLegacyMedia(projectId),
  ]);

  const metaBytesEstimate = 4096;
  const reclaimedBytes = binaryPurge.freedBytes + legacyFreedBytes + metaBytesEstimate;

  return {
    deletedProjectIds: [projectId],
    updatedSagaIds,
    deletedSagaIds,
    reclaimedBytes,
    deferredOrphans: binaryPurge.deferredOrphans,
  };
}

/**
 * Elimina una Saga completa: purga atómicamente todos sus episodios en secuencia segura
 * (`skipSagaUpdate: true`) y finalmente elimina el registro `SagaBible`.
 */
export async function deleteSagaCompletely(sagaId: string): Promise<DeletionReport> {
  const saga = getSagaById(sagaId);
  const allScripts = sessionController?.getScripts() ?? readScriptsFromLocalStorage();

  // Reunir tanto los IDs en saga.episodeIds como cualquier script que aún apunte a sagaId
  const episodeIdSet = new Set<string>(saga?.episodeIds ?? []);
  for (const script of allScripts) {
    if (script.sagaId === sagaId) {
      episodeIdSet.add(script.id);
    }
  }
  const episodeIds = Array.from(episodeIdSet);

  const deletedProjectIds: string[] = [];
  const deferredOrphans: string[] = [];
  let reclaimedBytes = 0;

  for (const epId of episodeIds) {
    const rep = await deleteProjectAtomically(epId, { skipSagaUpdate: true });
    deletedProjectIds.push(...rep.deletedProjectIds);
    reclaimedBytes += rep.reclaimedBytes;
    deferredOrphans.push(...rep.deferredOrphans);
  }

  const sagaDelete = SagaIntegrityManager.deleteSagaRecord(sagaId);
  sessionController?.commitDeletionState(deletedProjectIds, sagaDelete.sagas);

  return {
    deletedProjectIds,
    updatedSagaIds: [],
    deletedSagaIds: sagaDelete.deleted ? [sagaId] : [],
    reclaimedBytes,
    deferredOrphans,
  };
}

/**
 * Eliminación masiva segura de múltiples proyectos seleccionados.
 */
export async function deleteProjectsBatch(
  projectIds: string[],
  options?: { deleteEmptySaga?: boolean }
): Promise<DeletionReport> {
  const uniqueIds = Array.from(new Set(projectIds.filter(Boolean)));
  const deletedProjectIds: string[] = [];
  const updatedSagaIds = new Set<string>();
  const deletedSagaIds = new Set<string>();
  const deferredOrphans: string[] = [];
  let reclaimedBytes = 0;

  for (const pid of uniqueIds) {
    const rep = await deleteProjectAtomically(pid, {
      skipSagaUpdate: false,
      deleteEmptySaga: options?.deleteEmptySaga ?? true,
    });
    deletedProjectIds.push(...rep.deletedProjectIds);
    rep.updatedSagaIds.forEach((id) => updatedSagaIds.add(id));
    rep.deletedSagaIds.forEach((id) => {
      deletedSagaIds.add(id);
      updatedSagaIds.delete(id);
    });
    reclaimedBytes += rep.reclaimedBytes;
    deferredOrphans.push(...rep.deferredOrphans);
  }

  return {
    deletedProjectIds,
    updatedSagaIds: Array.from(updatedSagaIds),
    deletedSagaIds: Array.from(deletedSagaIds),
    reclaimedBytes,
    deferredOrphans,
  };
}

export const ProjectLifecycleService = {
  registerActiveSessionController,
  registerActiveExport,
  abortExportsForProject,
  buildProjectSummary,
  deleteProjectAtomically,
  deleteSagaCompletely,
  deleteProjectsBatch,
};
