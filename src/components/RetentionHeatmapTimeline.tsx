import { useMemo, useState } from 'react';
import { AlertTriangle, Flame, Zap } from 'lucide-react';
import type { BeatEnergyMetric } from '../types';

interface RetentionHeatmapTimelineProps {
  metrics: BeatEnergyMetric[];
  activeBeatIndex: number;
  totalDurationSec: number;
  onJumpToBeat: (beat: BeatEnergyMetric) => void;
}

function getEnergyBarColor(metric: BeatEnergyMetric, isActive: boolean): string {
  if (metric.isDeadZone) {
    return isActive ? 'bg-red-500 ring-2 ring-red-300/80' : 'bg-red-500/70 hover:bg-red-500';
  }
  if (metric.level === 'climax') {
    return isActive ? 'bg-[#F97316] ring-2 ring-orange-200' : 'bg-[#F97316] hover:bg-orange-400';
  }
  if (metric.level === 'high') {
    return isActive ? 'bg-amber-400 ring-2 ring-amber-200' : 'bg-amber-500/85 hover:bg-amber-400';
  }
  if (metric.level === 'medium') {
    return isActive ? 'bg-sky-400 ring-2 ring-sky-200' : 'bg-sky-500/70 hover:bg-sky-400';
  }
  return isActive ? 'bg-slate-400 ring-2 ring-slate-200' : 'bg-slate-500/55 hover:bg-slate-400/80';
}

/**
 * Mini-Timeline de Energía y Retención (Heatmap):
 * Muestra cada micro-escena coloreada por intensidad rítmica/sonora/visual,
 * señala "Zonas Muertas" (> 2 beats sin variación) y permite saltar al beat exacto con un clic.
 */
export function RetentionHeatmapTimeline({
  metrics,
  activeBeatIndex,
  totalDurationSec,
  onJumpToBeat,
}: RetentionHeatmapTimelineProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const stats = useMemo(() => {
    if (metrics.length === 0) {
      return { avgEnergy: 0, deadZoneCount: 0, peakCount: 0 };
    }
    const avgEnergy = Math.round(
      metrics.reduce((acc, m) => acc + m.energyScore, 0) / metrics.length
    );
    const deadZoneCount = metrics.filter((m) => m.isDeadZone).length;
    const peakCount = metrics.filter((m) => m.level === 'climax' || m.level === 'high').length;
    return { avgEnergy, deadZoneCount, peakCount };
  }, [metrics]);

  if (metrics.length === 0) return null;

  const inspectedMetric =
    hoveredIdx !== null
      ? metrics[hoveredIdx]
      : metrics[Math.max(0, Math.min(metrics.length - 1, activeBeatIndex))];

  const safeTotal = Math.max(0.5, totalDurationSec);

  return (
    <div className="mt-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Flame className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
          <span className="text-[11px] font-semibold text-[var(--text-primary)] tracking-tight">
            Curva de Energía y Retención
          </span>
          <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
            {stats.avgEnergy}/100
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px]">
          <span className="inline-flex items-center gap-1 text-[var(--text-secondary)] tabular-nums">
            <Zap className="w-3 h-3 text-[#F97316]" />
            {stats.peakCount} picos
          </span>
          {stats.deadZoneCount > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-red-500 tabular-nums">
              <AlertTriangle className="w-3 h-3" />
              {stats.deadZoneCount} {stats.deadZoneCount === 1 ? 'zona muerta' : 'zonas muertas'}
            </span>
          ) : (
            <span className="font-medium text-emerald-500">Sin zonas muertas</span>
          )}
        </div>
      </div>

      {/* Barra segmentada proporcional por duración de beat */}
      <div
        className="flex items-end gap-[2px] h-7 w-full select-none"
        role="group"
        aria-label="Mapa de calor de retención por beat"
      >
        {metrics.map((metric) => {
          const dur = Math.max(0.4, metric.endSec - metric.startSec);
          const widthPct = Math.max(2.5, (dur / safeTotal) * 100);
          const heightPct = Math.max(28, Math.min(100, metric.energyScore));
          const isActive = metric.beatIndex === activeBeatIndex;

          return (
            <button
              key={metric.sceneId}
              type="button"
              onClick={() => onJumpToBeat(metric)}
              onMouseEnter={() => setHoveredIdx(metric.beatIndex)}
              onMouseLeave={() => setHoveredIdx(null)}
              onFocus={() => setHoveredIdx(metric.beatIndex)}
              onBlur={() => setHoveredIdx(null)}
              style={{ width: `${widthPct}%`, height: `${heightPct}%` }}
              title={
                metric.isDeadZone
                  ? `Beat ${metric.orden} · ${metric.deadZoneReason}`
                  : `Beat ${metric.orden} (${metric.energyScore}/100) · ${metric.summary}`
              }
              className={`relative rounded-t-[3px] transition-all cursor-pointer flex items-start justify-center ${getEnergyBarColor(
                metric,
                isActive
              )}`}
            >
              {metric.isDeadZone && (
                <AlertTriangle className="w-2.5 h-2.5 text-white drop-shadow -mt-1" />
              )}
            </button>
          );
        })}
      </div>

      {/* Línea de diagnóstico del beat activo o inspeccionado */}
      {inspectedMetric && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] border-t border-[var(--border-subtle)] pt-1.5">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums shrink-0">
              Beat {inspectedMetric.orden}
            </span>
            <span className="text-[var(--text-muted)] font-mono tabular-nums shrink-0">
              {inspectedMetric.startSec.toFixed(1)}s
            </span>
            <span className="text-[var(--text-subtle)]">·</span>
            {inspectedMetric.isDeadZone ? (
              <span className="text-red-500 font-medium truncate">
                {inspectedMetric.deadZoneReason}
              </span>
            ) : (
              <span className="text-[var(--text-secondary)] truncate">
                {inspectedMetric.summary} · {inspectedMetric.wordDensityWps} pal/s
              </span>
            )}
          </div>
          <span className="font-mono font-semibold tabular-nums text-[var(--text-muted)] shrink-0">
            Energía {inspectedMetric.energyScore}%
          </span>
        </div>
      )}
    </div>
  );
}
