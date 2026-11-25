import { useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { GarbageCollectionReport, StorageTelemetry } from '../types';
import { formatBytes } from '../engine/storage';

interface StorageHealthBarProps {
  telemetry: StorageTelemetry | null;
  isLoadingTelemetry: boolean;
  isRunningGc: boolean;
  lastGcReport: GarbageCollectionReport | null;
  onRunManualGc: () => Promise<void>;
  onOpenBulkCleanup: () => void;
  onClearAiModelsCache: () => Promise<void>;
}

export function StorageHealthBar({
  telemetry,
  isLoadingTelemetry,
  isRunningGc,
  lastGcReport,
  onRunManualGc,
  onOpenBulkCleanup,
  onClearAiModelsCache,
}: StorageHealthBarProps) {
  const [confirmClearAi, setConfirmClearAi] = useState(false);
  const [isClearingAi, setIsClearingAi] = useState(false);

  const usagePercent = telemetry?.usagePercent ?? 0;
  const pressure = telemetry?.pressure ?? 'normal';

  const barFillClass =
    pressure === 'critical'
      ? 'bg-[#DC2626]'
      : pressure === 'warning'
        ? 'bg-[#F59E0B]'
        : 'bg-[#F97316]';

  const statusToneClass =
    pressure === 'critical'
      ? 'text-[#DC2626]'
      : pressure === 'warning'
        ? 'text-[#D97706] dark:text-[#FBBF24]'
        : 'text-[var(--text-secondary)]';

  const handleConfirmClearAi = async () => {
    setIsClearingAi(true);
    try {
      await onClearAiModelsCache();
      setConfirmClearAi(false);
    } finally {
      setIsClearingAi(false);
    }
  };

  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <HardDrive className="w-4 h-4 text-[#F97316] shrink-0" />
            <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
              Salud del almacenamiento local
            </h2>
            {telemetry && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[11px] font-mono font-semibold text-[var(--text-body)]">
                <Database className="w-3 h-3 text-[#F97316]" />
                {telemetry.storageBackend === 'opfs' ? 'OPFS Activo' : 'IndexedDB'}
              </span>
            )}
            {telemetry?.isPersisted && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="w-3 h-3" />
                Persistente
              </span>
            )}
          </div>

          <p className={`text-xs tabular-nums ${statusToneClass}`}>
            {isLoadingTelemetry && !telemetry ? (
              'Calculando uso real en disco...'
            ) : telemetry ? (
              <>
                <strong className="font-semibold text-[var(--text-primary)]">
                  {formatBytes(telemetry.totalUsageBytes)}
                </strong>{' '}
                usados de{' '}
                <strong className="font-semibold text-[var(--text-primary)]">
                  {telemetry.quotaBytes > 0 ? formatBytes(telemetry.quotaBytes) : 'cuota local'}
                </strong>{' '}
                disponibles ({usagePercent.toFixed(1)}%)
                {pressure === 'critical' && ' · Espacio crítico: recomienda liberar espacio'}
                {pressure === 'warning' && ' · Uso elevado: considera limpiar borradores antiguos'}
              </>
            ) : (
              'Telemetría de cuota no disponible en este navegador.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {pressure === 'critical' && (
            <button
              type="button"
              onClick={onOpenBulkCleanup}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Liberar espacio</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void onRunManualGc()}
            disabled={isRunningGc}
            title="Audita y elimina archivos huérfanos en OPFS/IndexedDB, temporales vencidos y referencias rotas de Sagas sin tocar los modelos IA"
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            {isRunningGc ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[#F97316]" />
            )}
            <span>{isRunningGc ? 'Limpiando...' : 'Ejecutar limpieza profunda (GC)'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenBulkCleanup}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#F97316]" />
            <span>Limpieza masiva</span>
          </button>
        </div>
      </div>

      {/* Barra de progreso de cuota real */}
      <div className="space-y-2">
        <div
          className="w-full h-2 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(usagePercent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Uso de almacenamiento local"
        >
          <div
            className={`h-full transition-all duration-300 ${barFillClass}`}
            style={{ width: `${Math.max(usagePercent > 0 ? 1.5 : 0, Math.min(100, usagePercent))}%` }}
          />
        </div>

        {/* Desglose compacto: Proyectos vs Caché de Modelos IA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 tabular-nums text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-[#F97316] shrink-0" />
              <span>Proyectos y activos:</span>
              <strong className="font-mono text-[var(--text-primary)]">
                {formatBytes(telemetry?.projectsBytes ?? 0)}
              </strong>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              <span>Caché de Modelos IA (TrueDepth):</span>
              <strong className="font-mono text-[var(--text-primary)]">
                {formatBytes(telemetry?.aiModelsCacheBytes ?? 0)}
              </strong>
              <span className="text-[11px] text-[var(--text-muted)]">(protegido del GC)</span>
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {lastGcReport && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
                <Sparkles className="w-3 h-3 text-[#F97316]" />
                {lastGcReport.orphanedEntriesRemoved > 0 || lastGcReport.brokenSagaRefsFixed > 0
                  ? `GC: ${formatBytes(lastGcReport.reclaimedBytes)} liberados · ${lastGcReport.orphanedEntriesRemoved} huérfanos · ${lastGcReport.brokenSagaRefsFixed} refs reparadas`
                  : 'GC verificado: disco limpio (0 huérfanos)'}
              </span>
            )}

            {(telemetry?.aiModelsCacheBytes ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClearAi(true)}
                className="text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-danger)] underline underline-offset-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                Limpiar caché IA
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmación explícita y separada para borrar pesos de modelos IA */}
      {confirmClearAi && (
        <div className="rounded-lg bg-[var(--bg-surface)] border border-[#DC2626]/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 text-xs">
            <div className="font-semibold text-[var(--text-primary)]">
              ¿Eliminar caché de Modelos IA locales ({formatBytes(telemetry?.aiModelsCacheBytes ?? 0)})?
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Tus proyectos y sagas permanecerán intactos, pero el modelo local de profundidad
              (Depth Anything V2) deberá descargarse de nuevo la próxima vez que uses Cine 3D.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmClearAi(false)}
              disabled={isClearingAi}
              className="min-h-[32px] px-3 py-1 rounded-md border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmClearAi()}
              disabled={isClearingAi}
              className="min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#DC2626] hover:bg-[#B91C1C] text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
            >
              {isClearingAi && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirmar limpieza IA</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
