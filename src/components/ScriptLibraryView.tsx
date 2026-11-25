import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  Copy,
  FileText,
  FolderOpen,
  HardDrive,
  Layers,
  Loader2,
  Play,
  Search,
  Sparkles,
  Square,
  Star,
  Subtitles,
  Trash2,
  X,
} from 'lucide-react';
import { getStyle3DById, PLATFORMS } from '../data/presets';
import type {
  DeletionReport,
  GarbageCollectionReport,
  PlatformId,
  ProjectSummary,
  SagaBible,
  StorageTelemetry,
} from '../types';
import { formatBytes, SagaIntegrityManager } from '../engine/storage';
import { BulkCleanupModal } from './BulkCleanupModal';
import { StorageHealthBar } from './StorageHealthBar';

interface ScriptLibraryViewProps {
  summaries: ProjectSummary[];
  sagas?: SagaBible[];
  activeScriptId: string;
  telemetry: StorageTelemetry | null;
  isLoadingTelemetry: boolean;
  isRunningGc: boolean;
  lastGcReport: GarbageCollectionReport | null;
  onSelectProject: (projectId: string) => void;
  onSimulateProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onExportPromptsTxt: (projectId: string) => void;
  onExportSrt: (projectId: string) => void;
  onToggleFavorite: (projectId: string) => void;
  onCreateSequel: (projectId: string, options?: { includeMicroRecap?: boolean }) => void;
  creatingSequelId?: string | null;
  onDeleteProjectAtomically: (
    projectId: string,
    options?: { deleteEmptySaga?: boolean }
  ) => Promise<DeletionReport>;
  onDeleteSagaCompletely: (sagaId: string) => Promise<DeletionReport>;
  onBulkDeleteProjects: (
    projectIds: string[],
    options?: { deleteEmptySaga?: boolean }
  ) => Promise<DeletionReport>;
  onRunManualGc: () => Promise<GarbageCollectionReport>;
  onClearAiModelsCache: () => Promise<void>;
  onCreateNew: () => void;
}

type StatusQuickFilter = 'all' | 'favorites' | 'drafts';

export function ScriptLibraryView({
  summaries,
  sagas = [],
  activeScriptId,
  telemetry,
  isLoadingTelemetry,
  isRunningGc,
  lastGcReport,
  onSelectProject,
  onSimulateProject,
  onDuplicateProject,
  onExportPromptsTxt,
  onExportSrt,
  onToggleFavorite,
  onCreateSequel,
  creatingSequelId,
  onDeleteProjectAtomically,
  onDeleteSagaCompletely,
  onBulkDeleteProjects,
  onRunManualGc,
  onClearAiModelsCache,
  onCreateNew,
}: ScriptLibraryViewProps) {
  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | PlatformId>('all');
  const [statusFilter, setStatusFilter] = useState<StatusQuickFilter>('all');
  const [expandedSagaScriptId, setExpandedSagaScriptId] = useState<string | null>(null);
  const [includeMicroRecap, setIncludeMicroRecap] = useState(true);

  // Modo selección múltiple + modal limpieza masiva
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Modal confirmación borrado individual
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<ProjectSummary | null>(null);
  const [deleteEmptySagaChecked, setDeleteEmptySagaChecked] = useState(true);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);

  // Modal confirmación borrado de Saga completa
  const [confirmDeleteSaga, setConfirmDeleteSaga] = useState<{
    saga: SagaBible;
    episodeCount: number;
    totalBytes: number;
  } | null>(null);
  const [isDeletingSaga, setIsDeletingSaga] = useState(false);

  const summaryById = useMemo(() => {
    const map = new Map<string, ProjectSummary>();
    for (const s of summaries) {
      map.set(s.id, s);
    }
    return map;
  }, [summaries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return summaries.filter((s) => {
      if (platformFilter !== 'all' && s.plataforma !== platformFilter) return false;
      if (statusFilter === 'favorites' && !s.isFavorite) return false;
      if (statusFilter === 'drafts' && !s.isDraft) return false;
      if (!q) return true;
      return (
        s.tituloViral.toLowerCase().includes(q) ||
        s.nicho.toLowerCase().includes(q) ||
        s.premisa.toLowerCase().includes(q)
      );
    });
  }, [summaries, query, platformFilter, statusFilter]);

  const filteredIdSet = useMemo(() => new Set(filtered.map((f) => f.id)), [filtered]);

  // Agrupar episodios pertenecientes a Sagas + proyectos independientes
  const { sagaGroups, standaloneProjects } = useMemo(() => {
    const assignedProjectIds = new Set<string>();
    const groups: Array<{
      saga: SagaBible;
      episodes: ProjectSummary[];
      allEpisodesCount: number;
      totalBytes: number;
    }> = [];

    for (const saga of sagas) {
      const allValidEpIds = saga.episodeIds.filter((id) => summaryById.has(id));
      const matchingEpisodes: ProjectSummary[] = [];
      for (const epId of allValidEpIds) {
        assignedProjectIds.add(epId);
        if (filteredIdSet.has(epId)) {
          const item = summaryById.get(epId);
          if (item) matchingEpisodes.push(item);
        }
      }

      // También incluir cualquier proyecto con sagaId apuntando a esta saga
      for (const proj of filtered) {
        if (proj.sagaId === saga.sagaId && !assignedProjectIds.has(proj.id)) {
          assignedProjectIds.add(proj.id);
          matchingEpisodes.push(proj);
        }
      }

      const isEmptyTemplate = allValidEpIds.length === 0;
      const matchesEmptyTemplateQuery =
        isEmptyTemplate &&
        platformFilter === 'all' &&
        statusFilter === 'all' &&
        (!query.trim() || saga.title.toLowerCase().includes(query.trim().toLowerCase()));

      if (matchingEpisodes.length > 0 || matchesEmptyTemplateQuery) {
        const totalBytes = allValidEpIds.reduce(
          (sum, id) => sum + (summaryById.get(id)?.estimatedSizeBytes ?? 0),
          0
        );
        groups.push({
          saga,
          episodes: matchingEpisodes,
          allEpisodesCount: allValidEpIds.length,
          totalBytes,
        });
      }
    }

    const standalone = filtered.filter((item) => !assignedProjectIds.has(item.id));
    return { sagaGroups: groups, standaloneProjects: standalone };
  }, [sagas, summaryById, filtered, filteredIdSet, platformFilter, statusFilter, query]);

  const selectedBytes = useMemo(() => {
    let sum = 0;
    for (const id of selectedIds) {
      sum += summaryById.get(id)?.estimatedSizeBytes ?? 0;
    }
    return sum;
  }, [selectedIds, summaryById]);

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openSingleDeleteModal = (item: ProjectSummary) => {
    setDeleteEmptySagaChecked(true);
    setConfirmDeleteProject(item);
  };

  const handleConfirmSingleDelete = async () => {
    if (!confirmDeleteProject || isDeletingSingle) return;
    setIsDeletingSingle(true);
    try {
      await onDeleteProjectAtomically(confirmDeleteProject.id, {
        deleteEmptySaga: deleteEmptySagaChecked,
      });
      setSelectedIds((prev) => {
        if (!prev.has(confirmDeleteProject.id)) return prev;
        const next = new Set(prev);
        next.delete(confirmDeleteProject.id);
        return next;
      });
      setConfirmDeleteProject(null);
    } finally {
      setIsDeletingSingle(false);
    }
  };

  const handleConfirmSagaDelete = async () => {
    if (!confirmDeleteSaga || isDeletingSaga) return;
    setIsDeletingSaga(true);
    try {
      const sagaEpSet = new Set(confirmDeleteSaga.saga.episodeIds);
      await onDeleteSagaCompletely(confirmDeleteSaga.saga.sagaId);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        sagaEpSet.forEach((id) => next.delete(id));
        return next;
      });
      setConfirmDeleteSaga(null);
    } finally {
      setIsDeletingSaga(false);
    }
  };

  const singleDeleteSagaImpact = useMemo(() => {
    if (!confirmDeleteProject) return null;
    return SagaIntegrityManager.getSagaImpactForProject(confirmDeleteProject.id, sagas);
  }, [confirmDeleteProject, sagas]);

  const renderProjectRow = (item: ProjectSummary, sagaContext?: SagaBible) => {
    const style = getStyle3DById(item.estilo3D);
    const isCurrent = item.id === activeScriptId;
    const dateLabel = new Date(item.creadoEn).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    });
    const itemSaga =
      sagaContext ??
      sagas.find((sg) => sg.sagaId === item.sagaId || sg.episodeIds.includes(item.id));
    const currentEpNum = item.episodeNumber ?? item.serieNumero ?? 1;
    const nextEpNum = currentEpNum + 1;
    const isSagaDrawerOpen = expandedSagaScriptId === item.id;
    const isChecked = selectedIds.has(item.id);

    return (
      <article
        key={item.id}
        className={`px-5 sm:px-6 py-4 space-y-3 transition-colors ${
          isCurrent ? 'bg-[var(--bg-highlight-row)]' : 'hover:bg-[var(--bg-card-hover)]'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0 flex items-start gap-3 flex-1">
            {selectionMode && (
              <button
                type="button"
                onClick={() => toggleSelectId(item.id)}
                aria-label={isChecked ? 'Deseleccionar proyecto' : 'Seleccionar proyecto'}
                className="mt-0.5 text-[var(--text-secondary)] hover:text-[#F97316] shrink-0 cursor-pointer"
              >
                {isChecked ? (
                  <CheckSquare className="w-4 h-4 text-[#F97316]" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
            )}

            <div className="min-w-0 space-y-1 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] tabular-nums">
                {itemSaga && (
                  <>
                    <span className="font-mono font-semibold text-[#F97316]">
                      Ep. {currentEpNum}
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                {!itemSaga && (item.episodeNumber || item.serieNumero) && (
                  <>
                    <span className="font-mono font-semibold text-[var(--text-primary)]">
                      Ep. {currentEpNum}
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>{item.nicho}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{item.duracionSegundos}s</span>
                <span aria-hidden="true">·</span>
                <span>{style.shortLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--text-body)]">{item.sceneCount} beats</span>
                <span aria-hidden="true">·</span>
                <span>{dateLabel}</span>
                <span aria-hidden="true">·</span>
                <span
                  title="Espacio ocupado en OPFS/IndexedDB por este proyecto"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-primary)]"
                >
                  <HardDrive className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                  {formatBytes(item.estimatedSizeBytes)}
                </span>
                {item.isDraft && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/12 border border-amber-500/35 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Borrador
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {item.tituloViral}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-1">{item.premisa}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onToggleFavorite(item.id)}
              title={
                item.isFavorite
                  ? 'Quitar de favoritos (protegido contra limpieza masiva)'
                  : 'Marcar como favorito (protege contra limpieza masiva)'
              }
              aria-label={item.isFavorite ? 'Quitar favorito' : 'Marcar como favorito'}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                item.isFavorite
                  ? 'text-amber-500 bg-amber-500/12 hover:bg-amber-500/20'
                  : 'text-[var(--text-muted)] hover:text-amber-500 hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-amber-500' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => onSelectProject(item.id)}
              className="min-h-[34px] px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Abrir estudio
            </button>

            <button
              type="button"
              onClick={() =>
                setExpandedSagaScriptId((cur) => (cur === item.id ? null : item.id))
              }
              disabled={Boolean(creatingSequelId)}
              title="Continuar serie heredando SagaBible (visualBible bloqueado, personajes y misterios abiertos)"
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#F97316]/12 hover:bg-[#F97316]/20 border border-[#F97316]/40 text-xs font-semibold text-[#F97316] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {creatingSequelId === item.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>
                {creatingSequelId === item.id
                  ? `Creando Ep. ${nextEpNum}...`
                  : `Continuar · Ep. ${nextEpNum}`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSimulateProject(item.id)}
              className="min-h-[34px] inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs text-[var(--text-body)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3 h-3 text-[#F97316]" />
              <span>{item.formatoVideo}</span>
            </button>

            <button
              type="button"
              onClick={() => onExportPromptsTxt(item.id)}
              title="Exportar guion completo y todos los prompts de Google Flow (.txt)"
              className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Prompts</span>
            </button>

            <button
              type="button"
              onClick={() => onExportSrt(item.id)}
              title="Descargar subtítulos .SRT"
              aria-label="Descargar subtítulos SRT"
              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            >
              <Subtitles className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onDuplicateProject(item.id)}
              title="Duplicar proyecto"
              aria-label="Duplicar guion"
              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            >
              <Copy className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => openSingleDeleteModal(item)}
              title="Eliminar proyecto y liberar archivos en OPFS/IndexedDB"
              aria-label="Eliminar proyecto"
              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-danger)] hover:bg-[#DC2626]/15 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isSagaDrawerOpen && (
          <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] p-3.5 space-y-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Continuidad de Saga (SagaBible) → Episodio {nextEpNum}
              </div>
              {itemSaga && (
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  <strong className="text-[var(--text-body)]">Bloqueo visual:</strong>{' '}
                  {itemSaga.visualBible.artStyle}
                </p>
              )}
              {itemSaga && itemSaga.unresolvedLoops.length > 0 && (
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  <strong className="text-[var(--text-body)]">
                    Bucle a resolver ({itemSaga.unresolvedLoops.length}):
                  </strong>{' '}
                  {itemSaga.unresolvedLoops[0]}
                </p>
              )}
              {itemSaga && itemSaga.recurringCharacters.length > 0 && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  Personajes/mundo: {itemSaga.recurringCharacters.slice(0, 3).join(' · ')}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
              <label className="inline-flex items-center gap-2 text-xs text-[var(--text-body)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeMicroRecap}
                  onChange={(e) => setIncludeMicroRecap(e.target.checked)}
                  className="accent-[#F97316] rounded cursor-pointer"
                />
                <span>
                  Incluir Micro-Recap de 2s en Beat 1 (“En la parte anterior...”)
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedSagaScriptId(null)}
                  className="min-h-[32px] px-3 py-1 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={Boolean(creatingSequelId)}
                  onClick={() => {
                    setExpandedSagaScriptId(null);
                    onCreateSequel(item.id, { includeMicroRecap });
                  }}
                  className="min-h-[32px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generar Episodio {nextEpNum}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-6">
      {/* Barra de Salud de Almacenamiento (OPFS/IndexedDB + Modelos IA + GC) */}
      <StorageHealthBar
        telemetry={telemetry}
        isLoadingTelemetry={isLoadingTelemetry}
        isRunningGc={isRunningGc}
        lastGcReport={lastGcReport}
        onRunManualGc={async () => {
          await onRunManualGc();
        }}
        onOpenBulkCleanup={() => setIsBulkModalOpen(true)}
        onClearAiModelsCache={onClearAiModelsCache}
      />

      {/* Cabecera y controles de búsqueda / filtrado */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              Biblioteca de proyectos y sagas
            </h1>
            <p className="text-sm text-[var(--text-secondary)] tabular-nums">
              {summaries.length}{' '}
              {summaries.length === 1 ? 'proyecto guardado' : 'proyectos guardados'}
              {sagas.length > 0 && ` · ${sagas.length} ${sagas.length === 1 ? 'saga activa' : 'sagas activas'}`}
              {' · '}Marca favoritos con estrella para protegerlos de la limpieza masiva.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectionMode((prev) => {
                  if (prev) setSelectedIds(new Set());
                  return !prev;
                });
              }}
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                selectionMode
                  ? 'bg-[#F97316]/12 border-[#F97316] text-[#F97316]'
                  : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-strong)] text-[var(--text-primary)]'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{selectionMode ? 'Salir de selección' : 'Seleccionar varios'}</span>
            </button>

            <button
              type="button"
              onClick={onCreateNew}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Crear nuevo guion
            </button>
          </div>
        </div>

        {/* Barra de acción para selección múltiple */}
        {selectionMode && (
          <div className="rounded-lg bg-[var(--bg-surface)] border border-[#F97316]/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[var(--text-primary)] tabular-nums">
              <strong>{selectedIds.size}</strong>{' '}
              {selectedIds.size === 1 ? 'proyecto seleccionado' : 'proyectos seleccionados'} ·{' '}
              <span className="font-mono font-semibold text-[#F97316]">
                {formatBytes(selectedBytes)}
              </span>{' '}
              a liberar
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(filtered.map((f) => f.id)))}
                className="px-2.5 py-1 rounded-md border border-[var(--border-strong)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Seleccionar visibles ({filtered.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1 rounded-md border border-[var(--border-strong)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Limpiar selección
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => setIsBulkModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-40 text-xs font-semibold text-white cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar seleccionados</span>
              </button>
            </div>
          </div>
        )}

        {/* Búsqueda y filtros funcionales */}
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título, nicho o premisa..."
                className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] pl-9 pr-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg w-fit">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'favorites', label: 'Favoritos' },
                  { id: 'drafts', label: 'Borradores' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
            <button
              type="button"
              onClick={() => setPlatformFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                platformFilter === 'all'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Todas
            </button>
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatformFilter(p.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  platformFilter === p.id
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {p.id === 'tiktok_creativity'
                  ? 'TikTok +60s'
                  : p.id === 'youtube_shorts'
                    ? 'YouTube Shorts'
                    : p.id === 'youtube_long'
                      ? 'YouTube 16:9'
                      : 'Reels'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Estado vacío */}
      {sagaGroups.length === 0 && standaloneProjects.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-10 text-center space-y-3">
          <FolderOpen className="w-7 h-7 text-[var(--text-muted)] mx-auto" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            No se encontraron proyectos con ese filtro
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Prueba limpiando la búsqueda o genera un nuevo guion viral desde la pestaña Crear.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Sagas agrupadas con integridad referencial */}
          {sagaGroups.map(({ saga, episodes, allEpisodesCount, totalBytes }) => (
            <section
              key={saga.sagaId}
              className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl overflow-hidden"
            >
              <div className="px-5 sm:px-6 py-4 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-[#F97316]">
                      <BookOpen className="w-3.5 h-3.5" />
                      SAGA
                    </span>
                    <span className="text-[var(--text-muted)]" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-medium text-[var(--text-secondary)]">
                      {allEpisodesCount}{' '}
                      {allEpisodesCount === 1 ? 'episodio' : 'episodios'}
                    </span>
                    <span className="text-[var(--text-muted)]" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono font-semibold text-[var(--text-primary)]">
                      {formatBytes(totalBytes)}
                    </span>
                    {allEpisodesCount === 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[10px] font-semibold text-[var(--text-secondary)]">
                        Plantilla reutilizable
                      </span>
                    )}
                  </div>

                  <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {saga.title}
                  </h2>
                  <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1">
                    {saga.visualBible.artStyle}
                    {saga.establishedLore.length > 0
                      ? ` · ${saga.establishedLore.length} hitos de lore bloqueados`
                      : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setConfirmDeleteSaga({
                      saga,
                      episodeCount: allEpisodesCount,
                      totalBytes,
                    })
                  }
                  className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--bg-card)] hover:bg-[#DC2626]/12 border border-[var(--border-strong)] hover:border-[#DC2626]/40 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-danger)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Saga completa</span>
                </button>
              </div>

              {episodes.length > 0 ? (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {episodes.map((ep) => renderProjectRow(ep, saga))}
                </div>
              ) : (
                <div className="px-6 py-4 text-xs text-[var(--text-secondary)]">
                  Esta Saga conserva su <strong>VisualBible</strong>, personajes y lore como
                  plantilla sin episodios activos.
                </div>
              )}
            </section>
          ))}

          {/* Proyectos independientes */}
          {standaloneProjects.length > 0 && (
            <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl overflow-hidden">
              {sagaGroups.length > 0 && (
                <div className="px-5 sm:px-6 py-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                  <Layers className="w-3.5 h-3.5 text-[#F97316]" />
                  <span>Proyectos independientes ({standaloneProjects.length})</span>
                </div>
              )}
              <div className="divide-y divide-[var(--border-subtle)]">
                {standaloneProjects.map((item) => renderProjectRow(item))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Modal: Confirmación de eliminación individual con protección de Saga */}
      {confirmDeleteProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
        >
          <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
                <h2 id="delete-project-title">Eliminar proyecto permanentemente</h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteProject(null)}
                disabled={isDeletingSingle}
                className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-[var(--text-body)] leading-relaxed">
                Vas a eliminar{' '}
                <strong className="text-[var(--text-primary)]">
                  “{confirmDeleteProject.tituloViral}”
                </strong>{' '}
                y purgar sus imágenes WebP, mapas de profundidad, audios y archivos temporales en
                OPFS/IndexedDB.
              </p>

              <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 flex items-center justify-between tabular-nums">
                <span className="text-[var(--text-secondary)]">Espacio a recuperar:</span>
                <strong className="font-mono text-[#F97316]">
                  {formatBytes(confirmDeleteProject.estimatedSizeBytes)}
                </strong>
              </div>

              {singleDeleteSagaImpact && !singleDeleteSagaImpact.isLastEpisode && (
                <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/30 p-3 text-[11px] text-[var(--text-body)] leading-relaxed">
                  <strong className="text-[var(--text-primary)]">
                    Integridad de Saga protegida:
                  </strong>{' '}
                  Este episodio se desvinculará de{' '}
                  <strong>“{singleDeleteSagaImpact.saga.title}”</strong>, pero la{' '}
                  <code>SagaBible</code> (estilo visual bloqueado, personajes y lore) se mantendrá
                  intacta para los{' '}
                  <strong>{singleDeleteSagaImpact.remainingEpisodeCount}</strong> episodios
                  restantes.
                </div>
              )}

              {singleDeleteSagaImpact && singleDeleteSagaImpact.isLastEpisode && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/35 p-3 space-y-2.5 text-[11px]">
                  <p className="text-[var(--text-body)] leading-relaxed">
                    <strong className="text-[var(--text-primary)]">
                      Último episodio de la Saga “{singleDeleteSagaImpact.saga.title}”:
                    </strong>{' '}
                    al eliminarlo, la Saga quedará sin episodios.
                  </p>
                  <label className="inline-flex items-center gap-2 text-xs text-[var(--text-primary)] font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={deleteEmptySagaChecked}
                      onChange={(e) => setDeleteEmptySagaChecked(e.target.checked)}
                      className="accent-[#F97316] rounded cursor-pointer"
                    />
                    <span>Eliminar también la Saga vacía</span>
                  </label>
                  {!deleteEmptySagaChecked && (
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Se conservará la <code>SagaBible</code> como plantilla reutilizable con su
                      estilo visual y lore.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteProject(null)}
                disabled={isDeletingSingle}
                className="min-h-[34px] px-3 py-1.5 rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSingleDelete()}
                disabled={isDeletingSingle}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
              >
                {isDeletingSingle ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Eliminar y liberar espacio</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de eliminación de Saga completa */}
      {confirmDeleteSaga && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-saga-title"
        >
          <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
                <h2 id="delete-saga-title">Eliminar Saga completa</h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteSaga(null)}
                disabled={isDeletingSaga}
                className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-[var(--text-body)] leading-relaxed">
                Esta acción eliminará la Saga{' '}
                <strong className="text-[var(--text-primary)]">
                  “{confirmDeleteSaga.saga.title}”
                </strong>
                , su <code>SagaBible</code> (estilo visual, personajes y lore) y todos sus episodios
                junto con sus activos multimedia en OPFS/IndexedDB.
              </p>

              <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 space-y-1.5 tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Episodios a eliminar:</span>
                  <strong className="font-mono text-[var(--text-primary)]">
                    {confirmDeleteSaga.episodeCount}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Espacio total a liberar:</span>
                  <strong className="font-mono text-[#F97316]">
                    {formatBytes(confirmDeleteSaga.totalBytes)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteSaga(null)}
                disabled={isDeletingSaga}
                className="min-h-[34px] px-3 py-1.5 rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSagaDelete()}
                disabled={isDeletingSaga}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
              >
                {isDeletingSaga ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Eliminar Saga ({confirmDeleteSaga.episodeCount} ep.)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Limpieza Masiva */}
      <BulkCleanupModal
        isOpen={isBulkModalOpen}
        summaries={summaries}
        initialSelectedIds={selectedIds}
        isRunningGc={isRunningGc}
        onClose={() => setIsBulkModalOpen(false)}
        onConfirmBulkDelete={async (ids, opts) => {
          await onBulkDeleteProjects(ids, opts);
          setSelectedIds(new Set());
          setSelectionMode(false);
        }}
        onRunOrphanPurge={onRunManualGc}
        onEnterManualSelectionMode={() => setSelectionMode(true)}
      />
    </div>
  );
}
