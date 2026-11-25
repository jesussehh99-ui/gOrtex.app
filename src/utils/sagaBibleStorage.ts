import type { SagaBible, ViralScript, VisualBible } from '../types';

const SAGA_STORAGE_KEY = 'gortex_saga_bibles_v1';

function buildFallbackVisualBible(script: ViralScript): VisualBible {
  if (script.visualBible && script.visualBible.fixedPrefixPrompt) {
    return script.visualBible;
  }
  const base = script.guiaEstilo3D || 'Cinematic stylized 3D narrative lighting and cohesive world design';
  return {
    artStyle: base,
    lightingPalette: 'Dramatic atmospheric lighting with unified cinema color grading',
    characterOrWorldLock: `Consistent protagonist, wardrobe, and world of "${script.tituloViral}"`,
    fixedPrefixPrompt: base,
  };
}

function dedupeStrings(items: string[], maxItems = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const clean = raw.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function loadAllSagas(): SagaBible[] {
  try {
    const raw = localStorage.getItem(SAGA_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SagaBible[]) : [];
  } catch {
    return [];
  }
}

export function saveAllSagas(sagas: SagaBible[]): void {
  try {
    localStorage.setItem(SAGA_STORAGE_KEY, JSON.stringify(sagas));
  } catch {
    // Ignorar límite de cuota localStorage
  }
}

export function getSagaById(sagaId?: string): SagaBible | undefined {
  if (!sagaId) return undefined;
  return loadAllSagas().find((s) => s.sagaId === sagaId);
}

export function getSagaForScript(script: ViralScript): SagaBible | undefined {
  const sagas = loadAllSagas();
  if (script.sagaId) {
    const byId = sagas.find((s) => s.sagaId === script.sagaId);
    if (byId) return byId;
  }
  return sagas.find((s) => s.episodeIds.includes(script.id));
}

/**
 * Construye una `SagaBible` inicial desde un episodio existente (Parte 1) si todavía
 * no pertenece a ninguna saga guardada.
 */
export function ensureSagaBibleForScript(script: ViralScript): SagaBible {
  const existing = getSagaForScript(script);
  if (existing) return existing;

  const visualBible = buildFallbackVisualBible(script);
  const mem = script.sagaMemoryUpdate;
  const derivedCharacters =
    mem?.recurringCharacters && mem.recurringCharacters.length > 0
      ? mem.recurringCharacters
      : [visualBible.characterOrWorldLock.slice(0, 140)];

  const derivedLore =
    mem?.establishedLore && mem.establishedLore.length > 0
      ? mem.establishedLore
      : [
          `Premisa base: ${script.premisa.slice(0, 160)}`,
          ...(script.escenas.length > 0
            ? [`Evento clave Ep.1: ${script.escenas[Math.floor(script.escenas.length / 2)]?.narracion ?? ''}`]
            : []),
        ].filter(Boolean);

  const derivedLoops = dedupeStrings(
    [
      ...(mem?.newUnresolvedLoop ? [mem.newUnresolvedLoop] : []),
      script.loopFinal
        ? `Misterio abierto tras Ep.1: ${script.loopFinal.slice(0, 140)}`
        : `Consecuencia aún sin resolver de "${script.tituloViral}"`,
    ],
    6
  );

  const created: SagaBible = {
    sagaId: script.sagaId || `saga-${Date.now()}`,
    title: script.serieTitulo || script.tituloViral.replace(/\s*\(Parte \d+\)/i, '').trim(),
    visualBible,
    recurringCharacters: dedupeStrings(derivedCharacters, 8),
    establishedLore: dedupeStrings(derivedLore, 12),
    unresolvedLoops: derivedLoops,
    episodeIds: [script.id],
    updatedAt: new Date().toISOString(),
  };

  const all = loadAllSagas();
  saveAllSagas([created, ...all.filter((s) => s.sagaId !== created.sagaId)]);
  return created;
}

/**
 * Actualiza una `SagaBible` existente al generar un nuevo episodio (Parte 2, 3, ...),
 * preservando el `visualBible` bloqueado, cerrando el bucle resuelto y añadiendo el nuevo misterio.
 */
export function appendEpisodeToSagaBible(
  baseSaga: SagaBible,
  newEpisode: ViralScript
): SagaBible {
  const mem = newEpisode.sagaMemoryUpdate;

  let nextUnresolved = [...baseSaga.unresolvedLoops];
  if (mem?.resolvedLoop) {
    const resolvedNorm = mem.resolvedLoop.toLowerCase().trim();
    const filtered = nextUnresolved.filter(
      (loop) =>
        !loop.toLowerCase().includes(resolvedNorm.slice(0, 22)) &&
        !resolvedNorm.includes(loop.toLowerCase().slice(0, 22))
    );
    // Si ninguno coincidió por texto exacto, retirar el más antiguo ya que el episodio resolvió uno
    nextUnresolved =
      filtered.length < nextUnresolved.length ? filtered : nextUnresolved.slice(1);
  }
  if (mem?.newUnresolvedLoop) {
    nextUnresolved.push(mem.newUnresolvedLoop);
  } else if (newEpisode.loopFinal) {
    nextUnresolved.push(
      `Bucle abierto Ep.${newEpisode.episodeNumber ?? newEpisode.serieNumero ?? baseSaga.episodeIds.length + 1}: ${newEpisode.loopFinal.slice(0, 130)}`
    );
  }

  const nextLore = dedupeStrings(
    [
      ...baseSaga.establishedLore,
      ...(mem?.establishedLore ?? []),
      ...(mem?.resolvedLoop ? [`Resuelto en Ep.${newEpisode.episodeNumber ?? baseSaga.episodeIds.length + 1}: ${mem.resolvedLoop}`] : []),
    ],
    14
  );

  const nextChars = dedupeStrings(
    [...baseSaga.recurringCharacters, ...(mem?.recurringCharacters ?? [])],
    8
  );

  const updated: SagaBible = {
    ...baseSaga,
    recurringCharacters: nextChars,
    establishedLore: nextLore,
    unresolvedLoops: dedupeStrings(nextUnresolved, 8),
    episodeIds: dedupeStrings([...baseSaga.episodeIds, newEpisode.id], 50),
    updatedAt: new Date().toISOString(),
  };

  const all = loadAllSagas();
  saveAllSagas([updated, ...all.filter((s) => s.sagaId !== updated.sagaId)]);
  return updated;
}

export function removeEpisodeFromSagas(scriptId: string): void {
  const all = loadAllSagas();
  const updated = all
    .map((saga) => ({
      ...saga,
      episodeIds: saga.episodeIds.filter((id) => id !== scriptId),
    }))
    .filter((saga) => saga.episodeIds.length > 0);
  saveAllSagas(updated);
}
