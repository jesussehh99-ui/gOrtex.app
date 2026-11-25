import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Film,
  FolderArchive,
  Layers,
  Loader2,
  Lock,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type {
  BackgroundMusicId,
  FoleyCueType,
  GeneratedVideoItem,
  HookFactoryVariant,
  HookVariantId,
  HumanVoiceProfile,
  RenderQualityMode,
  SceneMediaMap,
  SubtitleConfig,
  VideoAspectRatio,
  ViralScript,
} from '../types';
import { FOLEY_CUE_LABELS } from '../utils/retentionEngine';
import { slugifyFilename } from '../utils/exportScript';
import {
  buildInitialHookFactoryVariants,
  exportHookFactoryBatch,
  type HookFactoryBatchProgress,
  type HookFactoryBatchResult,
} from '../utils/hookFactoryExporter';

interface HookFactoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  script: ViralScript;
  sceneMedia: SceneMediaMap;
  fallbackImageUrl: string;
  aspectRatio: VideoAspectRatio;
  subtitleConfig: SubtitleConfig;
  backgroundMusicId: BackgroundMusicId;
  musicVolume: number;
  enableTransitionSfx: boolean;
  sfxVolumeDb: number;
  playbackRate: number;
  renderQuality: RenderQualityMode;
  selectedVoice: HumanVoiceProfile;
  onVideoCreated: (video: GeneratedVideoItem, blob: Blob) => void;
}

const FOLEY_OPTIONS: FoleyCueType[] = [
  'sub_drop',
  'thunder_impact',
  'riser_tension',
  'whoosh_cut',
  'heartbeat',
  'analog_glitch',
  'hud_click',
  'none',
];

export function HookFactoryModal({
  isOpen,
  onClose,
  script,
  sceneMedia,
  fallbackImageUrl,
  aspectRatio,
  subtitleConfig,
  backgroundMusicId,
  musicVolume,
  enableTransitionSfx,
  sfxVolumeDb,
  playbackRate,
  renderQuality,
  selectedVoice,
  onVideoCreated,
}: HookFactoryModalProps) {
  const [variants, setVariants] = useState<HookFactoryVariant[]>(() =>
    buildInitialHookFactoryVariants(script)
  );
  const [activeTab, setActiveTab] = useState<HookVariantId>('A');
  const [isExporting, setIsExporting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [progress, setProgress] = useState<HookFactoryBatchProgress | null>(null);
  const [result, setResult] = useState<HookFactoryBatchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setVariants(buildInitialHookFactoryVariants(script));
    setResult(null);
    setErrorMsg(null);
    setActiveTab('A');
  }, [script.id]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const activeVariant = useMemo(
    () => variants.find((v) => v.id === activeTab) ?? variants[0],
    [variants, activeTab]
  );

  if (!isOpen) return null;

  const sharedBodyCount = Math.max(0, script.escenas.length - 2);

  const updateVariant = (id: HookVariantId, patch: Partial<HookFactoryVariant>) => {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const handleUploadCustomImage = (variantId: HookVariantId, file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateVariant(variantId, { customImageDataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunBatchExport = async () => {
    setErrorMsg(null);
    setResult(null);
    setIsExporting(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const batchRes = await exportHookFactoryBatch({
        script,
        variants,
        sceneMedia,
        fallbackImageUrl,
        aspectRatio,
        subtitleConfig,
        backgroundMusicId,
        musicVolume,
        enableTransitionSfx,
        sfxVolumeDb,
        playbackRate,
        renderQuality,
        selectedVoice,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });

      setResult(batchRes);

      // Registrar las 3 variantes en la galería de Videos Generados del proyecto
      const nowLabel = new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      });
      for (const item of batchRes.items) {
        onVideoCreated(
          {
            id: `vid-hf-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: `${script.tituloViral} · Hook ${item.id}`,
            scopeLabel: `Hook ${item.id} (${item.angleTag})`,
            aspectRatio,
            videoUrl: item.videoUrl,
            durationSec: item.durationSec,
            voiceLabel: selectedVoice.name,
            extension: item.extension,
            mimeType: item.extension === 'mp4' ? 'video/mp4' : 'video/webm',
            createdAt: nowLabel,
          },
          item.blob
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== 'Renderizado cancelado.') {
        setErrorMsg(err.message);
      }
    } finally {
      setIsExporting(false);
      abortRef.current = null;
    }
  };

  const handleDownloadSingle = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadZipPack = async () => {
    if (!result) return;
    setIsZipping(true);
    try {
      const zipBlob = await result.createZipBlob();
      const zipUrl = URL.createObjectURL(zipBlob);
      const baseSlug = slugifyFilename(script.tituloViral || 'proyecto');
      handleDownloadSingle(zipUrl, `${baseSlug}_hook_factory_AB.zip`);
      window.setTimeout(() => URL.revokeObjectURL(zipUrl), 15000);
    } catch {
      setErrorMsg('No se pudo empaquetar el archivo .ZIP en el navegador.');
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Hook Factory: Exportar 3 Variantes A/B"
    >
      <div className="w-full max-w-3xl rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F97316]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Hook Factory · Exportación por Lote A/B/C</span>
            </div>
            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              3 Ganchos distintos sobre un mismo cuerpo renderizado una sola vez
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Edita únicamente Beats 1 y 2 para cada variante. Beats 3–{script.escenas.length} se
              reutilizan a nivel de flujo H.264 sin re-renderizar.
            </p>
          </div>
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            aria-label="Cerrar Hook Factory"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Selector de Variantes A / B / C + botón Reset */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={isExporting}
                  onClick={() => setActiveTab(v.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === v.id
                      ? 'bg-[#F97316] text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Hook {v.id}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={isExporting}
              onClick={() => setVariants(buildInitialHookFactoryVariants(script))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restaurar sugerencias A/B</span>
            </button>
          </div>

          {/* Editor de la variante seleccionada (Beats 1 y 2) */}
          {activeVariant && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">
                    {activeVariant.label}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Ángulo viral: <strong className="text-[var(--text-primary)]">{activeVariant.angleTag}</strong>
                  </div>
                </div>
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] text-[11px] font-medium text-[var(--text-primary)] cursor-pointer">
                  <Upload className="w-3 h-3 text-[#F97316]" />
                  <span>
                    {activeVariant.customImageDataUrl ? 'Imagen Beat 1 personalizada' : 'Cambiar imagen Beat 1 (opcional)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={isExporting}
                    onChange={(e) => {
                      handleUploadCustomImage(activeVariant.id, e.target.files?.[0]);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>

              {/* Beat 1 */}
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Beat 1 (Gancho 0:00 – 0:03)
                </label>
                <textarea
                  rows={2}
                  disabled={isExporting}
                  value={activeVariant.beat1Narration}
                  onChange={(e) =>
                    updateVariant(activeVariant.id, { beat1Narration: e.target.value })
                  }
                  placeholder="Frase de apertura rompe-scroll (8 a 12 palabras)..."
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
                      Título 3D detrás del sujeto (depthTitleText)
                    </label>
                    <input
                      type="text"
                      disabled={isExporting}
                      maxLength={28}
                      value={activeVariant.beat1DepthTitle}
                      onChange={(e) =>
                        updateVariant(activeVariant.id, { beat1DepthTitle: e.target.value })
                      }
                      placeholder="Ej. 3800 METROS"
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-mono uppercase text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
                      Efecto Foley Procedural (0:00)
                    </label>
                    <select
                      disabled={isExporting}
                      value={activeVariant.beat1FoleyCue}
                      onChange={(e) =>
                        updateVariant(activeVariant.id, {
                          beat1FoleyCue: e.target.value as FoleyCueType,
                        })
                      }
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                    >
                      {FOLEY_OPTIONS.map((cue) => (
                        <option key={cue} value={cue}>
                          {FOLEY_CUE_LABELS[cue]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Beat 2 (si el guion tiene >= 2 escenas) */}
              {script.escenas.length >= 2 && (
                <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Beat 2 (Puente de tensión 0:03 – 0:06)
                  </label>
                  <textarea
                    rows={2}
                    disabled={isExporting}
                    value={activeVariant.beat2Narration}
                    onChange={(e) =>
                      updateVariant(activeVariant.id, { beat2Narration: e.target.value })
                    }
                    placeholder="Continuación inmediata que conecta con el cuerpo común..."
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
                        Título 3D Beat 2 (opcional)
                      </label>
                      <input
                        type="text"
                        disabled={isExporting}
                        maxLength={28}
                        value={activeVariant.beat2DepthTitle}
                        onChange={(e) =>
                          updateVariant(activeVariant.id, { beat2DepthTitle: e.target.value })
                        }
                        placeholder="Opcional"
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-mono uppercase text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--text-secondary)] mb-1">
                        Efecto Foley Beat 2
                      </label>
                      <select
                        disabled={isExporting}
                        value={activeVariant.beat2FoleyCue}
                        onChange={(e) =>
                          updateVariant(activeVariant.id, {
                            beat2FoleyCue: e.target.value as FoleyCueType,
                          })
                        }
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                      >
                        {FOLEY_OPTIONS.map((cue) => (
                          <option key={cue} value={cue}>
                            {FOLEY_CUE_LABELS[cue]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Indicador de Cuerpo Común Bloqueado */}
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="inline-flex items-center gap-2 text-[var(--text-body)]">
              <Lock className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
              <span>
                <strong>Cuerpo común bloqueado:</strong>{' '}
                {sharedBodyCount > 0
                  ? `Beats 3 a ${script.escenas.length} (${sharedBodyCount} escenas)`
                  : 'Guion corto (menos de 3 beats)'}
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--text-secondary)]">
              <Layers className="w-3 h-3 text-[#F97316]" />
              {aspectRatio} · {playbackRate}x · {selectedVoice.name}
            </span>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-500">
              {errorMsg}
            </div>
          )}

          {/* Progreso del lote */}
          {isExporting && progress && (
            <div className="rounded-xl border border-[#F97316]/40 bg-[var(--bg-surface)] p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                <span className="font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                  {progress.label}
                </span>
                <span className="font-mono font-bold text-[#F97316]">
                  {progress.overallPercent}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--bg-card)] overflow-hidden border border-[var(--border-subtle)]">
                <div
                  className="h-full bg-[#F97316] transition-all duration-150"
                  style={{ width: `${progress.overallPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Resultados listos para descarga individual o .ZIP */}
          {result && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/8 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    3 Variantes A/B generadas ({result.totalReusedBodyFrames > 0
                      ? `${result.totalReusedBodyFrames} frames de cuerpo reutilizados sin re-codificar`
                      : 'renderizado completo'})
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isZipping}
                  onClick={() => void handleDownloadZipPack()}
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-xs font-semibold text-white cursor-pointer"
                >
                  {isZipping ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FolderArchive className="w-3.5 h-3.5" />
                  )}
                  <span>Descargar Pack .ZIP (3 MP4 + Kit Viral)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {result.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">
                        Hook {item.id}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)] truncate">
                        {item.angleTag} · {item.durationSec}s
                      </div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] truncate mt-0.5">
                        {item.filename}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadSingle(item.videoUrl, item.filename)}
                      className="w-full min-h-[32px] inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] text-[11px] font-semibold text-[var(--text-primary)] cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-[#F97316]" />
                      <span>Descargar .{item.extension.toUpperCase()}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-secondary)]">
            100% local en navegador · Sin costo de servidor
          </span>
          <div className="flex items-center gap-2">
            {isExporting ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-red-600/15 border border-red-500/40 text-xs font-semibold text-red-500 hover:bg-red-600/25 cursor-pointer"
              >
                Cancelar lote
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[38px] px-3.5 py-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunBatchExport()}
                  className="min-h-[38px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white cursor-pointer"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Exportar 3 Variantes A/B</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
