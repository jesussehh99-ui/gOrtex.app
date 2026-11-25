import type { SagaBible, ViralScript } from '../../types';
import { loadAllSagas, saveAllSagas } from '../../utils/sagaBibleStorage';

export interface SagaImpactInfo {
  saga: SagaBible;
  isLastEpisode: boolean;
  remainingEpisodeCount: number;
  episodePosition: number;
}

export interface RemoveEpisodeSagaResult {
  updatedSagaIds: string[];
  deletedSagaIds: string[];
  sagas: SagaBible[];
}

export interface SagaReconciliationResult {
  sagas: SagaBible[];
  scripts: ViralScript[];
  sagasChanged: boolean;
  scriptsChanged: boolean;
  brokenSagaRefsFixed: number;
}

/**
 * SagaIntegrityManager:
 * Protege la integridad referencial entre episodios (`ViralScript`) y sus
 * `SagaBible` (series con `visualBible`, `recurringCharacters`, `establishedLore` y `episodeIds[]`).
 */
export const SagaIntegrityManager = {
  /**
   * Calcula el impacto sobre la Saga antes de confirmar la eliminación de un episodio.
   */
  getSagaImpactForProject(projectId: string, sagasOverride?: SagaBible[]): SagaImpactInfo | null {
    const sagas = sagasOverride ?? loadAllSagas();
    const saga = sagas.find((s) => s.episodeIds.includes(projectId));
    if (!saga) return null;
    const episodePosition = saga.episodeIds.indexOf(projectId);
    const remainingEpisodeCount = Math.max(0, saga.episodeIds.length - 1);
    return {
      saga,
      isLastEpisode: remainingEpisodeCount === 0,
      remainingEpisodeCount,
      episodePosition,
    };
  },

  /**
   * Elimina `projectId` de `saga.episodeIds[]` preservando el orden exacto de los episodios restantes
   * y manteniendo intactos `visualBible`, `recurringCharacters`, `establishedLore` y `unresolvedLoops`
   * incluso si se elimina el Episodio 1.
   *
   * Si el episodio eliminado era el último (`episodeIds.length === 0`):
   * - `deleteEmptySaga: true` (por defecto) elimina también la `SagaBible`.
   * - `deleteEmptySaga: false` conserva la `SagaBible` como plantilla reutilizable.
   */
  removeEpisodeFromSagas(
    projectId: string,
    options?: { deleteEmptySaga?: boolean }
  ): RemoveEpisodeSagaResult {
    const deleteEmptySaga = options?.deleteEmptySaga ?? true;
    const current = loadAllSagas();
    const updatedSagaIds: string[] = [];
    const deletedSagaIds: string[] = [];
    const nextSagas: SagaBible[] = [];

    for (const saga of current) {
      if (!saga.episodeIds.includes(projectId)) {
        nextSagas.push(saga);
        continue;
      }

      const nextEpisodeIds = saga.episodeIds.filter((id) => id !== projectId);

      if (nextEpisodeIds.length === 0 && deleteEmptySaga) {
        deletedSagaIds.push(saga.sagaId);
        continue;
      }

      updatedSagaIds.push(saga.sagaId);
      nextSagas.push({
        ...saga,
        // Preservar íntegramente visualBible, recurringCharacters, establishedLore y unresolvedLoops
        episodeIds: nextEpisodeIds,
        updatedAt: new Date().toISOString(),
      });
    }

    if (updatedSagaIds.length > 0 || deletedSagaIds.length > 0) {
      saveAllSagas(nextSagas);
    }

    return {
      updatedSagaIds,
      deletedSagaIds,
      sagas: nextSagas,
    };
  },

  /**
   * Elimina únicamente el registro `SagaBible` indicado (usado al finalizar `deleteSagaCompletely`).
   */
  deleteSagaRecord(sagaId: string): { deleted: boolean; sagas: SagaBible[] } {
    const current = loadAllSagas();
    const next = current.filter((s) => s.sagaId !== sagaId);
    const deleted = next.length !== current.length;
    if (deleted) {
      saveAllSagas(next);
    }
    return { deleted, sagas: next };
  },

  /**
   * Reconciliación autorreparable:
   * 1. Limpia `episodeIds[]` rotos en todas las `SagaBible` que apunten a proyectos inexistentes.
   * 2. Limpia `project.sagaId` colgantes que apunten a sagas eliminadas.
   * 3. Si un proyecto apunta a una saga válida pero faltaba en `saga.episodeIds[]`, lo sincroniza.
   */
  reconcileSagaReferences(
    validProjectIds: Set<string>,
    scripts: ViralScript[]
  ): SagaReconciliationResult {
    const currentSagas = loadAllSagas();
    let brokenSagaRefsFixed = 0;
    let sagasChanged = false;
    let scriptsChanged = false;

    const validSagaIds = new Set<string>(currentSagas.map((s) => s.sagaId));

    // 1) Limpiar episodeIds rotos y duplicados preservando orden y lore
    const reconciledSagas: SagaBible[] = currentSagas.map((saga) => {
      const seen = new Set<string>();
      const cleanedIds: string[] = [];
      for (const epId of saga.episodeIds) {
        if (!validProjectIds.has(epId)) {
          brokenSagaRefsFixed += 1;
          sagasChanged = true;
          continue;
        }
        if (seen.has(epId)) {
          sagasChanged = true;
          continue;
        }
        seen.add(epId);
        cleanedIds.push(epId);
      }

      if (cleanedIds.length !== saga.episodeIds.length) {
        return {
          ...saga,
          episodeIds: cleanedIds,
          updatedAt: new Date().toISOString(),
        };
      }
      return saga;
    });

    // 2) Limpiar project.sagaId colgantes o restaurar vínculo si existe en saga.episodeIds
    const sagaByEpisode = new Map<string, string>();
    for (const saga of reconciledSagas) {
      for (const epId of saga.episodeIds) {
        sagaByEpisode.set(epId, saga.sagaId);
      }
    }

    const reconciledScripts: ViralScript[] = scripts.map((script) => {
      if (script.sagaId && !validSagaIds.has(script.sagaId)) {
        brokenSagaRefsFixed += 1;
        scriptsChanged = true;
        const { sagaId: _removed, ...rest } = script;
        return rest;
      }
      const mappedSagaId = sagaByEpisode.get(script.id);
      if (!script.sagaId && mappedSagaId) {
        scriptsChanged = true;
        return { ...script, sagaId: mappedSagaId };
      }
      return script;
    });

    // 3) Si algún script tiene sagaId válido pero no estaba listado en saga.episodeIds, reinsertarlo al final
    for (const script of reconciledScripts) {
      if (!script.sagaId) continue;
      const targetSaga = reconciledSagas.find((s) => s.sagaId === script.sagaId);
      if (targetSaga && !targetSaga.episodeIds.includes(script.id)) {
        targetSaga.episodeIds = [...targetSaga.episodeIds, script.id];
        targetSaga.updatedAt = new Date().toISOString();
        sagasChanged = true;
      }
    }

    if (sagasChanged) {
      saveAllSagas(reconciledSagas);
    }

    return {
      sagas: reconciledSagas,
      scripts: reconciledScripts,
      sagasChanged,
      scriptsChanged,
      brokenSagaRefsFixed,
    };
  },
};
