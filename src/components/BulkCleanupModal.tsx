import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  Loader2,
  RefreshCw,
  Square,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { GarbageCollectionReport, ProjectSummary } from '../types';
import { formatBytes } from '../engine/storage';

type BulkFilterPreset = 'old_drafts' | 'non_favorites' | 'manual';

interface BulkCleanupModalProps {
  isOpen: boolean;
  summaries: ProjectSummary[];
  initialSelectedIds: Set<string>;
  isRunningGc: boolean;
  onClose: () => void;
  onConfirmBulkDelete: (
    projectIds: string[],
    options: { deleteEmptySaga: boolean }
  ) => Promise<void>;
  onRunOrphanPurge: () => Promise<GarbageCollectionReport>;
  onEnterManualSelectionMode: () => void;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function BulkCleanupModal({
  isOpen,
  summaries,
  initialSelectedIds,
  isRunningGc,
  onClose,
  onConfirmBulkDelete,
  onRunOrphanPurge,
  onEnterManualSelectionMode,
}: BulkCleanupModalProps) {
  const [preset, setPreset] = useState<BulkFilterPreset>(
    initialSelectedIds.size > 0 ? 'manual' : 'old_drafts'
  );
  const [manualIds, setManualIds] = useState<Set<string>>(() => new Set(initialSelectedIds));
  const [deleteEmptySaga, setDeleteEmptySaga] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [orphanResult, setOrphanResult] = useState<GarbageCollectionReport | null>(null);

  const oldDraftTargets = useMemo(() => {
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    return summaries.filter((p) => {
      if (p.isFavorite) return false;
      const lastTouch = p.lastOpenedAt || Date.parse(p.creadoEn) || 0;
      return p.isDraft && lastTouch < cutoff;
    });
  }, [summaries]);

  const nonFavoriteTargets = useMemo(
    () => summaries.filter((p) => !p.isFavorite),
    [summaries]
  );

  const manualTargets = useMemo(
    () => summaries.filter((p) => manualIds.has(p.id)),
    [summaries, manualIds]
  );

  const activeTargets = useMemo(() => {
    if (preset === 'old_drafts') return oldDraftTargets;
    if (preset === 'non_favorites') return nonFavoriteTargets;
    return manualTargets;
  }, [preset, oldDraftTargets, nonFavoriteTargets, manualTargets]);

  const totalReclaimBytes = useMemo(
    () => activeTargets.reduce((sum, p) => sum + (p.estimatedSizeBytes || 0), 0),
    [activeTargets]
  );

  if (!isOpen) return null;

  const toggleManualId = (id: string) => {
    setManualIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (activeTargets.length === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirmBulkDelete(
        activeTargets.map((p) => p.id),
        { deleteEmptySaga }
      );
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePurgeOrphans = async () => {
    const report = await onRunOrphanPurge();
    setOrphanResult(report);
  };

  const presets: Array<{
    id: BulkFilterPreset;
    title: string;
    subtitle: string;
    count: number;
    bytes: number;
  }> = [
    {
      id: 'old_drafts',
      title: 'Borradores y pruebas antiguas (>7 días, sin estrella)',
      subtitle: 'Proyectos en estado borrador sin exportar ni marcar como favoritos.',
      count: oldDraftTargets.length,
      bytes: oldDraftTargets.reduce((s, p) => s + (p.estimatedSizeBytes || 0), 0),
    },
    {
      id: 'non_favorites',
      title: 'Todos los proyectos no favoritos',
      subtitle: 'Conserva únicamente los proyectos protegidos con estrella.',
      count: nonFavoriteTargets.length,
      bytes: nonFavoriteTargets.reduce((s, p) => s + (p.estimatedSizeBytes || 0), 0),
    },
    {
      id: 'manual',
      title: 'Selección manual',
      subtitle: 'Elige exactamente qué proyectos eliminar con casillas.',
      count: manualTargets.length,
      bytes: manualTargets.reduce((s, p) => s + (p.estimatedSizeBytes || 0), 0),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-cleanup-title"
    >
      <div className="w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h2
              id="bulk-cleanup-title"
              className="text-base font-bold text-[var(--text-primary)] tracking-tight"
            >
              Limpieza masiva y purga de disco
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Previsualiza exactamente cuántos proyectos y megabytes se liberarán antes de confirmar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Cerrar modal"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Purga de archivos huérfanos independiente */}
          <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Purgar archivos huérfanos y temporales (OPFS / IndexedDB)
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Elimina restos de exportaciones canceladas (&gt;5 min), blobs sin proyecto y repara
                referencias rotas de Sagas. Protege siempre tus modelos IA.
              </p>
              {orphanResult && (
                <p className="text-[11px] font-medium text-[#F97316] tabular-nums pt-0.5">
                  Resultado: {formatBytes(orphanResult.reclaimedBytes)} liberados ·{' '}
                  {orphanResult.orphanedEntriesRemoved} archivos huérfanos eliminados ·{' '}
                  {orphanResult.brokenSagaRefsFixed} referencias de Saga reparadas.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handlePurgeOrphans()}
              disabled={isRunningGc || isDeleting}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isRunningGc ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-[#F97316]" />
              )}
              <span>Purgar archivos huérfanos ahora</span>
            </button>
          </div>

          {/* Filtros rápidos de 1 clic */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              1. Elige un criterio de limpieza
            </div>
            <div className="grid grid-cols-1 gap-2">
              {presets.map((item) => {
                const selected = preset === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPreset(item.id)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                      selected
                        ? 'bg-[#F97316]/10 border-[#F97316]'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {item.subtitle}
                      </div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-xs font-bold text-[var(--text-primary)]">
                        {item.count} {item.count === 1 ? 'proyecto' : 'proyectos'}
                      </div>
                      <div className="text-[11px] font-mono text-[#F97316]">
                        {formatBytes(item.bytes)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vista previa en tiempo real o selección manual */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                2. Vista previa ({activeTargets.length}{' '}
                {activeTargets.length === 1 ? 'proyecto a eliminar' : 'proyectos a eliminar'} ·{' '}
                <span className="text-[#F97316] font-mono">{formatBytes(totalReclaimBytes)}</span>)
              </div>
              {preset === 'manual' && (
                <button
                  type="button"
                  onClick={() => {
                    onEnterManualSelectionMode();
                    onClose();
                  }}
                  className="text-[11px] font-medium text-[#F97316] hover:underline cursor-pointer"
                >
                  Seleccionar con casillas en la Biblioteca →
                </button>
              )}
            </div>

            {preset === 'manual' ? (
              <div className="max-h-52 overflow-y-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
                {summaries.map((proj) => {
                  const checked = manualIds.has(proj.id);
                  return (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => toggleManualId(proj.id)}
                      className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-[#F97316] shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[var(--text-primary)] truncate flex items-center gap-1.5">
                            {proj.isFavorite && (
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                            )}
                            <span className="truncate">{proj.tituloViral}</span>
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                            {proj.isDraft ? 'Borrador' : 'Exportado'} · {proj.nicho}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-[var(--text-secondary)] shrink-0 tabular-nums">
                        {formatBytes(proj.estimatedSizeBytes)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : activeTargets.length === 0 ? (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-center text-xs text-[var(--text-secondary)]">
                Ningún proyecto coincide con este criterio ahora mismo.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
                {activeTargets.map((proj) => (
                  <div
                    key={proj.id}
                    className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-[var(--text-primary)] truncate">
                        {proj.tituloViral}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        {proj.isDraft ? 'Borrador' : 'Exportado'} · {proj.nicho} ·{' '}
                        {new Date(proj.creadoEn).toLocaleDateString('es-ES')}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-[var(--text-secondary)] shrink-0 tabular-nums">
                      {formatBytes(proj.estimatedSizeBytes)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-body)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deleteEmptySaga}
              onChange={(e) => setDeleteEmptySaga(e.target.checked)}
              className="accent-[#F97316] rounded cursor-pointer"
            />
            <span>Eliminar también las Sagas que queden sin episodios</span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
            <span>Esta acción libera disco en OPFS/IndexedDB y no se puede deshacer.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={activeTargets.length === 0 || isDeleting}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-40 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>
                Eliminar {activeTargets.length} · Liberar {formatBytes(totalReclaimBytes)}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
