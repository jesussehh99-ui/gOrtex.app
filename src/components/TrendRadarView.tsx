import { useState } from 'react';
import {
  ArrowUpRight,
  ExternalLink,
  Loader2,
  Radar,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { VIRAL_NICHE_PLAYBOOKS, type ViralNichePlaybook } from '../data/viralIdeasBank';
import type { TrendItem, TrendRadarResult } from '../types';

interface TrendRadarViewProps {
  radarData: TrendRadarResult | null;
  isLoading: boolean;
  cooldownSec?: number;
  errorMessage: string | null;
  onScanTrends: (region: string, category: string) => void;
  onUseTrend: (trend: TrendItem) => void;
  onUseFormulaInComposer: (playbook: ViralNichePlaybook) => void;
}

const REGIONS = [
  'Hispanoamérica y EE.UU. (Mercado Bilingüe)',
  'Estados Unidos (RPM Máximo)',
  'México y Latinoamérica',
  'España y Europa',
];

const CATEGORIES = [
  '¿Sabías qué?, datos curiosos e información de interés general',
  'Consejos útiles, salud, hábitos diarios y finanzas personales',
  'Trucos de tecnología, IA práctica y productividad',
  'Psicología cotidiana, relaciones y superación personal',
  'Comedia 3D viral y escenarios "¿Qué pasaría si...?"',
  'Misterios históricos, ciencia explicada y casos reales',
];

export function TrendRadarView({
  radarData,
  isLoading,
  cooldownSec = 0,
  errorMessage,
  onScanTrends,
  onUseTrend,
  onUseFormulaInComposer,
}: TrendRadarViewProps) {
  const [region, setRegion] = useState(REGIONS[0]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [rpmFilter, setRpmFilter] = useState<'all' | 'Muy Alto' | 'Alto' | 'Viral Masivo'>('all');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || cooldownSec > 0) return;
    onScanTrends(region, category);
  };

  const visiblePlaybooks =
    rpmFilter === 'all'
      ? VIRAL_NICHE_PLAYBOOKS
      : VIRAL_NICHE_PLAYBOOKS.filter((p) => p.rpmLevel === rpmFilter);

  return (
    <div className="space-y-6">
      {/* Barra de escaneo web en vivo */}
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              Radar de nichos rentables y tendencias en vivo
            </h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              Explora las fórmulas probadas de los 8 nichos más virales abajo o escanea búsquedas
              web en tiempo real con Gemini 2.5 Flash para detectar oportunidades de hoy.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading || cooldownSec > 0}
            className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analizando tendencias web...</span>
              </>
            ) : cooldownSec > 0 ? (
              <>
                <Radar className="w-4 h-4" />
                <span>Espera {cooldownSec}s...</span>
              </>
            ) : (
              <>
                <Radar className="w-4 h-4" />
                <span>Escanear tendencias en vivo</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--border-subtle)]">
          <div className="space-y-1.5">
            <label htmlFor="trend-region" className="block text-xs font-medium text-[var(--text-body)]">
              Mercado y región objetivo
            </label>
            <select
              id="trend-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="trend-category" className="block text-xs font-medium text-[var(--text-body)]">
              Categoría de alto rendimiento
            </label>
            <select
              id="trend-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-3.5 py-2.5 text-xs text-[var(--text-danger)]"
          >
            {errorMessage}
          </div>
        )}
      </form>

      {/* Estado de carga del escáner web */}
      {isLoading && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-6 space-y-4">
          <div className="h-5 w-64 bg-[var(--bg-surface)] rounded animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>
      )}

      {/* Resultados del radar web en tiempo real (cuando el usuario escanea) */}
      {!isLoading && radarData && (
        <div className="space-y-5">
          {radarData.resumenMercado && (
            <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-1.5">
              <div className="text-xs text-[var(--text-secondary)] tabular-nums">
                Pulso del mercado en vivo · {radarData.region}
              </div>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                {radarData.resumenMercado}
              </p>
            </section>
          )}

          <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Oportunidades web detectadas hoy ({radarData.tendencias.length})
              </h2>
              <span className="text-xs text-[var(--text-secondary)]">
                Ordenadas por potencial de retención y monetización
              </span>
            </div>

            <div className="divide-y divide-[var(--border-subtle)]">
              {radarData.tendencias.map((trend, idx) => (
                <article
                  key={trend.id || idx}
                  className="px-6 py-5 flex flex-col lg:flex-row lg:items-start justify-between gap-5"
                >
                  <div className="space-y-2.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] tabular-nums">
                      <span className="font-mono text-[#F97316] font-semibold">0{idx + 1}.</span>
                      <span>{trend.nicho}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[var(--text-primary)] font-medium">
                        {trend.rpmEstimado}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{trend.duracionRecomendada}s</span>
                    </div>

                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                      {trend.tema}
                    </h3>

                    <p className="text-sm text-[var(--text-body)] leading-relaxed">
                      <strong className="text-[var(--text-primary)] font-medium">
                        Por qué monetiza:
                      </strong>{' '}
                      {trend.porQueMonetiza}
                    </p>

                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      <strong className="text-[var(--text-body)] font-medium">
                        Ángulo visual 3D:
                      </strong>{' '}
                      {trend.anguloViral3D}
                    </p>

                    <p className="text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2">
                      <span className="text-[#F97316] font-medium mr-1.5">Gancho 3s:</span>“
                      {trend.ganchoEjemplo}”
                    </p>
                  </div>

                  <div className="shrink-0 flex lg:flex-col items-end justify-end">
                    <button
                      type="button"
                      onClick={() => onUseTrend(trend)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Producir guion</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {radarData.fuentes.length > 0 && (
            <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-2.5">
              <h3 className="text-xs font-semibold text-[var(--text-body)]">
                Fuentes consultadas en tiempo real ({radarData.fuentes.length})
              </h3>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {radarData.fuentes.map((src, i) => (
                  <li key={`${src.uri}-${i}`}>
                    <a
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[#F97316] transition-colors truncate max-w-full"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{src.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* Siempre poblado: Radar de los 8 nichos más rentables y virales */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F97316]">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Guía de los 8 Nichos más Rentables y Virales</span>
            </div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
              Fórmulas listas para producir en TikTok +60s, Shorts y Reels
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Cada tarjeta incluye RPM estimado, estructura de retención, fórmulas de ganchos y
              consejos 3D. Pulsa “Usar esta fórmula” para cargarla directo en Crear.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg self-start sm:self-auto">
            {(['all', 'Muy Alto', 'Alto', 'Viral Masivo'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setRpmFilter(lvl)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  rpmFilter === lvl
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {lvl === 'all' ? 'Todos (8)' : lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visiblePlaybooks.map((playbook) => (
            <article
              key={playbook.id}
              className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3.5">
                {/* Encabezado y métricas sin píldoras decorativas */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <span aria-hidden="true">{playbook.emoji}</span>
                      <span>{playbook.title}</span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-secondary)] tabular-nums">
                      <span className="font-semibold text-[#F97316]">{playbook.rpmRange}</span>
                      <span aria-hidden="true">·</span>
                      <span>Retención {playbook.avgRetention}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{playbook.recommendedDuration}s</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--text-body)] shrink-0">
                    RPM: {playbook.rpmLevel}
                  </span>
                </div>

                {/* Estructura recomendada */}
                <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 space-y-1">
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                    Estructura de guion recomendada
                  </div>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                    {playbook.scriptStructure}
                  </p>
                </div>

                {/* Fórmulas de títulos/ganchos */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                    Fórmulas probadas de ganchos (0:00 – 0:03)
                  </div>
                  <ul className="space-y-1">
                    {playbook.hookFormulas.map((formula) => (
                      <li
                        key={formula}
                        className="text-xs text-[var(--text-body)] leading-snug pl-2.5 border-l border-[var(--border-strong)]"
                      >
                        {formula}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Consejo de edición 3D */}
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  <strong className="text-[var(--text-body)] font-semibold">Edición 3D:</strong>{' '}
                  {playbook.editingTips3D}
                </p>
              </div>

              {/* Acciones */}
              <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onUseFormulaInComposer(playbook)}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Usar esta fórmula</span>
                </button>

                <button
                  type="button"
                  onClick={() => onUseTrend(playbook.readyTrend)}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Generar guion directo</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#F97316]" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
