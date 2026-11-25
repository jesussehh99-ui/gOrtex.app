import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Brain,
  Camera,
  Check,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  FileText,
  Film,
  Flame,
  Gauge,
  Globe,
  HelpCircle,
  ImagePlus,
  Laugh,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Subtitles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { isCommercialStudioMode } from '../data/commercialPresets';
import { AUDIENCES, getStyle3DById, PLATFORMS } from '../data/presets';
import {
  analyzeScriptRetention,
  buildHookOptionsForScript,
  type HookOptionPreview,
} from '../data/viralIdeasBank';
import { isUserMediaBeat } from '../services/userMediaIngestionService';
import type {
  HookStyleId,
  SagaBible,
  SceneMediaMap,
  ScriptLanguage,
  ScriptScene,
  ShotVariationType,
  VideoAspectRatio,
  ViralScript,
} from '../types';
import {
  buildAllOrganizedClipboard,
  buildCompleteScriptAndFlowPackTxt,
  buildMarkdownPack,
  buildSrtContent,
  buildVoiceoverText,
  downloadImageAsPng,
  slugifyFilename,
  triggerFileDownload,
} from '../utils/exportScript';
import { isLegacyFlatSvgDataUrl } from '../utils/flowPromptBuilder';
import {
  CAMERA_MOTION_LABELS,
  evaluatePredictiveRetention,
  FOLEY_CUE_LABELS,
  getBlueprintInfo,
  RETENTION_ROLE_LABELS,
  SHOT_TYPE_LABELS,
} from '../utils/retentionEngine';
import { AiSceneThumbnail } from './AiSceneThumbnail';
import { BatchMediaDropzone } from './BatchMediaDropzone';

interface ScriptBlueprintViewProps {
  script: ViralScript;
  sceneMedia: SceneMediaMap;
  aspectRatio: VideoAspectRatio;
  isGenerating: boolean;
  isTranslating: boolean;
  isOptimizingWeakBeats?: boolean;
  isGeneratingSeries: boolean;
  generatingArtIds: Record<string, boolean>;
  isBatchGeneratingArt: boolean;
  sagaBible?: SagaBible;
  onOpenAudiovisual: () => void;
  onApplyHook: (hook: HookOptionPreview) => void;
  onOptimizeWeakBeats?: (weakBeatIndices: number[]) => Promise<void>;
  onGenerateSceneArt: (
    scene: ScriptScene,
    options?: { shotType?: ShotVariationType; appendVariation?: boolean }
  ) => Promise<SceneMediaMap>;
  onGenerateAllSceneArt: () => Promise<SceneMediaMap>;
  onUploadSceneImage: (sceneId: string, dataUrl: string) => void;
  onUploadBeatUserMedia?: (sceneId: string, file: File) => Promise<void>;
  onBatchUploadBeatUserMedia?: (
    files: File[],
    options: { preserveExistingUserMedia: boolean }
  ) => Promise<void>;
  onRevertBeatToAi?: (sceneId: string) => Promise<void>;
  onPromoteSceneImage: (sceneId: string, altIndex: number) => void;
  onRemoveSceneImage: (sceneId: string, index: number) => void;
  onRefineScene: (scene: ScriptScene, instruction: string) => Promise<void>;
  onUpdateSceneInline: (sceneId: string, patch: Partial<ScriptScene>) => void;
  onUpdateSceneDuration: (sceneId: string, newDurationSec: number) => void;
  onRegenerateSceneImage: (sceneId: string) => void;
  onOpenProGuide: () => void;
  onAddScene: () => void;
  onDeleteScene: (sceneId: string) => void;
  onMoveScene: (sceneId: string, direction: 'up' | 'down') => void;
  onTranslateScript: (lang: ScriptLanguage) => Promise<void>;
  onGenerateSeriesNext: (options?: { includeMicroRecap?: boolean }) => Promise<void>;
}

const QUICK_REFINEMENTS = [
  'Haz la narración más natural y cotidiana, como alguien contando una historia real',
  'Haz este giro más sorprendente e ingenioso',
  'Cambia el encuadre y prompt visual para que destaque mejor la acción',
  'Acelera la transición y haz el subtítulo más llamativo',
];

export function ScriptBlueprintView({
  script,
  sceneMedia,
  aspectRatio,
  isGenerating,
  isTranslating,
  isOptimizingWeakBeats = false,
  isGeneratingSeries,
  generatingArtIds,
  isBatchGeneratingArt,
  sagaBible,
  onOpenAudiovisual,
  onApplyHook,
  onOptimizeWeakBeats,
  onGenerateSceneArt,
  onGenerateAllSceneArt,
  onUploadSceneImage,
  onUploadBeatUserMedia,
  onBatchUploadBeatUserMedia,
  onRevertBeatToAi,
  onPromoteSceneImage,
  onRemoveSceneImage,
  onRefineScene,
  onUpdateSceneInline,
  onUpdateSceneDuration,
  onRegenerateSceneImage,
  onOpenProGuide,
  onAddScene,
  onDeleteScene,
  onMoveScene,
  onTranslateScript,
  onGenerateSeriesNext,
}: ScriptBlueprintViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'twists' | 'narrative'>('all');
  const [refiningSceneId, setRefiningSceneId] = useState<string | null>(null);
  const [openRefineId, setOpenRefineId] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState('');
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [appliedHookId, setAppliedHookId] = useState<HookStyleId | null>(null);
  const [includeMicroRecapNext, setIncludeMicroRecapNext] = useState(true);
  const [showBatchMediaPanel, setShowBatchMediaPanel] = useState(() =>
    isCommercialStudioMode(script.studioMode)
  );
  const [isApplyingBatchMedia, setIsApplyingBatchMedia] = useState(false);
  const [uploadingBeatId, setUploadingBeatId] = useState<string | null>(null);

  const userMediaBeatsCount = useMemo(
    () => script.escenas.filter((s) => isUserMediaBeat(s.mediaSource)).length,
    [script.escenas]
  );

  const styleInfo = getStyle3DById(script.estilo3D);
  const platformInfo = PLATFORMS.find((p) => p.id === script.plataforma) ?? PLATFORMS[0];
  const audienceInfo = AUDIENCES.find((a) => a.id === script.publicoObjetivo) ?? AUDIENCES[0];
  const blueprintInfo = getBlueprintInfo(script.narrativeBlueprint);
  const twistScenes = script.escenas.filter((s) => s.esGiro30s);
  const hookOptions = useMemo(() => buildHookOptionsForScript(script), [script]);
  const retention = useMemo(() => analyzeScriptRetention(script), [script]);
  const predictiveRetention = useMemo(() => evaluatePredictiveRetention(script), [script]);
  const weakBeatMap = useMemo(() => {
    const map = new Map<string, (typeof predictiveRetention.weakBeats)[number]>();
    for (const wb of predictiveRetention.weakBeats) {
      map.set(wb.sceneId, wb);
    }
    return map;
  }, [predictiveRetention]);

  const totalImagesCount = script.escenas.reduce((acc, s) => {
    const m = sceneMedia[s.id];
    const customMain = m?.imageDataUrl && !isLegacyFlatSvgDataUrl(m.imageDataUrl) ? 1 : 0;
    return acc + Math.max(1, customMain) + (m?.altImageDataUrls?.length ?? 0);
  }, 0);

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2200);
    } catch {
      setActionError('No se pudo acceder al portapapeles del navegador.');
    }
  };

  const handleDownloadSrt = () => {
    const content = buildSrtContent(script);
    triggerFileDownload(
      `${slugifyFilename(script.tituloViral)}.srt`,
      content,
      'text/plain;charset=utf-8'
    );
  };

  const handleDownloadTxtPack = () => {
    const content = buildCompleteScriptAndFlowPackTxt(script, sceneMedia, aspectRatio);
    triggerFileDownload(
      `${slugifyFilename(script.tituloViral)}-guion-y-prompts-flow.txt`,
      content,
      'text/plain;charset=utf-8'
    );
  };

  const handleDownloadMarkdown = () => {
    const content = buildMarkdownPack(script);
    triggerFileDownload(
      `${slugifyFilename(script.tituloViral)}-produccion.md`,
      content,
      'text/markdown;charset=utf-8'
    );
  };

  const handleSelectHook = (option: HookOptionPreview) => {
    onApplyHook(option);
    setAppliedHookId(option.id);
  };

  const handleRunRefine = async (scene: ScriptScene, instruction: string) => {
    if (!instruction.trim()) return;
    setActionError(null);
    setRefiningSceneId(scene.id);
    try {
      await onRefineScene(scene, instruction.trim());
      setOpenRefineId(null);
      setCustomInstruction('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'No se pudo mejorar esta escena.');
    } finally {
      setRefiningSceneId(null);
    }
  };

  const handleSceneArtClick = async (scene: ScriptScene, appendVariation = false) => {
    setActionError(null);
    const existingCount =
      (sceneMedia[scene.id]?.imageDataUrl ? 1 : 0) +
      (sceneMedia[scene.id]?.altImageDataUrls?.length ?? 0);
    const shotTypes: ShotVariationType[] = ['principal', 'reaccion', 'plano_abierto'];
    const shotType = shotTypes[existingCount % shotTypes.length];

    try {
      await onGenerateSceneArt(scene, { shotType, appendVariation });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'No se pudo generar la imagen.');
    }
  };

  const handleBatchArtClick = async () => {
    setActionError(null);
    try {
      await onGenerateAllSceneArt();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudieron generar todas las imágenes.'
      );
    }
  };

  const handleUploadFile = async (sceneId: string, file?: File) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isImage && !isVideo) {
      setActionError('Selecciona una foto válida (JPG, PNG, WebP) o un clip de video (MP4, WebM, MOV).');
      return;
    }
    setActionError(null);
    if (onUploadBeatUserMedia) {
      setUploadingBeatId(sceneId);
      try {
        await onUploadBeatUserMedia(sceneId, file);
      } catch (err: unknown) {
        setActionError(
          err instanceof Error ? err.message : 'No se pudo cargar el archivo en este beat.'
        );
      } finally {
        setUploadingBeatId(null);
      }
      return;
    }

    if (!isImage) {
      setActionError('Selecciona una imagen válida (PNG, JPG o WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUploadSceneImage(sceneId, reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBatchApplyToBeats = async (
    files: File[],
    options: { preserveExistingUserMedia: boolean }
  ) => {
    if (!onBatchUploadBeatUserMedia || files.length === 0) return;
    setActionError(null);
    setIsApplyingBatchMedia(true);
    try {
      await onBatchUploadBeatUserMedia(files, options);
    } finally {
      setIsApplyingBatchMedia(false);
    }
  };

  const handleTranslateClick = async (lang: ScriptLanguage) => {
    setActionError(null);
    try {
      await onTranslateScript(lang);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'No se pudo traducir el guion.');
    }
  };

  const handleSeriesNextClick = async () => {
    setActionError(null);
    try {
      await onGenerateSeriesNext({ includeMicroRecap: includeMicroRecapNext });
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo crear la siguiente parte.'
      );
    }
  };

  const handleOptimizeWeakBeatsClick = async () => {
    if (!onOptimizeWeakBeats || predictiveRetention.weakBeats.length === 0) return;
    setActionError(null);
    try {
      await onOptimizeWeakBeats(predictiveRetention.weakBeats.map((w) => w.index));
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudieron optimizar los beats débiles.'
      );
    }
  };

  const scrollToScene = (sceneId: string) => {
    if (viewMode === 'narrative') setViewMode('all');
    setTimeout(() => {
      const el = document.getElementById(`scene-row-${sceneId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 30);
  };

  const visibleScenes =
    viewMode === 'twists'
      ? script.escenas.filter(
          (s) => s.esGiro30s || s.orden === 1 || s.orden === script.escenas.length
        )
      : script.escenas;

  if (isGenerating) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-6 space-y-6">
        <div className="space-y-3">
          <div className="h-4 w-48 bg-[var(--bg-elevated)] rounded animate-pulse" />
          <div className="h-8 w-3/4 bg-[var(--bg-elevated)] rounded animate-pulse" />
          <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
            <span>
              Escribiendo guion fiel a tu idea, narración natural por escenas y prompts visuales
              distintos...
            </span>
          </div>
        </div>
        <div className="h-12 w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((row) => (
            <div
              key={row}
              className="h-32 w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Probador de 3 Ganchos Virales (A/B Hook Tester) — Recalcula SOLO la Micro-escena 1 */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
              Probador A/B de 3 Ganchos Virales (primeros 3 segundos)
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Alterna entre 3 aperturas psicológicas con un clic: recalcula únicamente la
              Micro-escena 1 (texto, palabras clave, prompt visual y voz) sin perder el resto del
              proyecto.
            </p>
          </div>
          {appliedHookId && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#16A34A]">
              <Check className="w-3.5 h-3.5" />
              <span>Micro-escena 1 actualizada</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {hookOptions.map((option, idx) => {
            const isSelected =
              appliedHookId === option.id ||
              script.ganchoInicial3Seg.fraseApertura === option.fraseApertura;
            const Icon =
              option.id === 'dato_perturbador' || option.id === 'curiosidad'
                ? AlertTriangle
                : option.id === 'escenario_pov' || option.id === 'polemica'
                  ? Eye
                  : Brain;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelectHook(option)}
                className={`text-left rounded-xl border p-3.5 space-y-2 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#F97316]/10 border-[#F97316]'
                    : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                    <Icon className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                    <span>
                      {idx + 1}. {option.label}
                    </span>
                  </span>
                  {isSelected && (
                    <span className="text-[10px] font-mono font-semibold text-[#F97316] shrink-0">
                      ACTIVO
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                  {option.subtitle}
                </p>
                <p className="text-xs text-[var(--text-body)] line-clamp-2 leading-snug font-medium">
                  “{option.fraseApertura}”
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Panel de Score de Retención Predictivo (Crítico de Retención + Optimizar beats débiles) */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F97316]">
                <Gauge className="w-3.5 h-3.5" />
                <span>Score de Retención Predictivo</span>
              </span>
              {script.narrativeBlueprint && (
                <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                  · {blueprintInfo.label}
                </span>
              )}
              {sagaBible && (
                <span className="text-[11px] font-mono text-[var(--text-primary)] font-semibold">
                  · Saga Ep.{script.episodeNumber ?? script.serieNumero ?? 1}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] tabular-nums">
              {predictiveRetention.totalWords} palabras · {predictiveRetention.avgWordsPerBeat}{' '}
              pal/beat · {retention.totalDurationSec}s · Re-Hook en Beat #
              {predictiveRetention.reHookBeatIndex + 1}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onOptimizeWeakBeats && predictiveRetention.weakBeats.length > 0 && (
              <button
                type="button"
                disabled={isOptimizingWeakBeats || isGenerating}
                onClick={() => void handleOptimizeWeakBeatsClick()}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F97316]/12 hover:bg-[#F97316]/20 border border-[#F97316]/45 text-xs font-semibold text-[#EA580C] dark:text-[#FDBA74] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isOptimizingWeakBeats ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 text-[#F97316]" />
                )}
                <span>
                  {isOptimizingWeakBeats
                    ? 'Optimizando beats...'
                    : `Optimizar beats débiles (${predictiveRetention.weakBeats.length})`}
                </span>
              </button>
            )}

            <div className="flex items-baseline gap-1.5 tabular-nums">
              <span
                className={`font-display text-2xl font-extrabold tracking-tight ${
                  predictiveRetention.overallScore >= 82
                    ? 'text-[#16A34A]'
                    : predictiveRetention.overallScore >= 68
                      ? 'text-[#F97316]'
                      : 'text-[#DC2626]'
                }`}
              >
                {predictiveRetention.overallScore}
              </span>
              <span className="text-xs font-mono text-[var(--text-muted)]">/ 100</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span>Velocidad Hook</span>
              <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                {predictiveRetention.hookVelocityScore}%
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-snug">
              {retention.hookSummary}
            </p>
          </div>

          <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span>Ritmo y Re-Hook</span>
              <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                {predictiveRetention.pacingScore}%
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-snug">
              {predictiveRetention.reHookInTargetBand
                ? `Re-Hook en zona óptima (Beat #${predictiveRetention.reHookBeatIndex + 1}).`
                : `Ajusta un giro fuerte entre el 35%–45% del guion.`}
            </p>
          </div>

          <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span>Variedad de Planos</span>
              <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                {predictiveRetention.visualVarietyScore}%
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-snug">
              {predictiveRetention.consecutiveShotDuplicates === 0
                ? 'Shot Continuity Graph limpio: 0 planos repetidos.'
                : `${predictiveRetention.consecutiveShotDuplicates} plano(s) consecutivo(s) repetido(s).`}
            </p>
          </div>

          <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span>Sutura de Loop</span>
              <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                {predictiveRetention.loopScore}%
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-snug line-clamp-2">
              {predictiveRetention.loopSeamText}
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
          <p className="text-xs text-[var(--text-body)] leading-relaxed">
            <span className="font-semibold text-[#F97316] mr-1.5">Pattern Interrupts:</span>
            {predictiveRetention.patternInterruptSummary}
          </p>
          {predictiveRetention.weakBeats.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
              <span className="font-semibold text-[#D97706] dark:text-[#FBBF24]">
                Beats a reforzar:
              </span>
              {predictiveRetention.weakBeats.map((wb) => (
                <button
                  key={wb.sceneId}
                  type="button"
                  onClick={() => scrollToScene(wb.sceneId)}
                  className="underline decoration-dotted hover:text-[var(--text-primary)] cursor-pointer"
                  title={wb.reasons.join(' · ')}
                >
                  Beat #{wb.orden} ({wb.reasons[0] || 'Reforzar'})
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Cabecera */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-6 space-y-5">
        <div className="flex flex-col gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] tabular-nums">
              <span>{audienceInfo.label}</span>
              <span aria-hidden="true">·</span>
              <span>{styleInfo.shortLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{script.duracionSegundos}s</span>
              <span aria-hidden="true">·</span>
              <span>{platformInfo.label}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#F97316] font-medium">
                {twistScenes.length > 0
                  ? `${twistScenes.length} ${twistScenes.length === 1 ? 'punto clave' : 'puntos clave'}`
                  : `${script.escenas.length} escenas`}
              </span>
              {script.serieNumero && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--text-primary)] font-semibold">
                    Parte {script.serieNumero}
                  </span>
                </>
              )}
              {script.idioma && script.idioma !== 'es' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono uppercase text-[#0284C7] dark:text-[#38BDF8]">
                    {script.idioma === 'en' ? 'Inglés (EN)' : 'Portugués (PT)'}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight leading-snug">
              {script.tituloViral}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => copyText('copy-all-organized', buildAllOrganizedClipboard(script))}
              className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F97316]"
            >
              {copiedId === 'copy-all-organized' ? (
                <ClipboardCheck className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>
                {copiedId === 'copy-all-organized'
                  ? 'Todo copiado y organizado'
                  : 'Copiar todo organizado'}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenAudiovisual}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Film className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Ir a Video y Google Flow</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTxtPack}
              title="Descarga el guion completo y todos los prompts 3D de Google Flow en un archivo .txt"
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Descargar Paquete (.txt)</span>
            </button>

            <button
              type="button"
              onClick={onOpenProGuide}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#F97316]" />
              <span>Guía Gortex + Flow</span>
            </button>

            <div className="inline-flex items-center gap-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-strong)] px-2.5 py-1">
              <button
                type="button"
                disabled={isGeneratingSeries || isTranslating}
                onClick={() => void handleSeriesNextClick()}
                title="Genera el siguiente episodio heredando SagaBible (estilo visual bloqueado, personajes y bucles)"
                className="min-h-[30px] inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-body)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isGeneratingSeries ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-[#F97316]" />
                )}
                <span>
                  {isGeneratingSeries
                    ? 'Creando episodio...'
                    : `Crear Ep. ${(script.episodeNumber ?? script.serieNumero ?? 1) + 1}`}
                </span>
              </button>
              <label
                title="Añadir un Micro-Recap de 2s en el Beat 1 ('En la parte anterior...')"
                className="inline-flex items-center gap-1 pl-2 border-l border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] cursor-pointer select-none whitespace-nowrap"
              >
                <input
                  type="checkbox"
                  checked={includeMicroRecapNext}
                  onChange={(e) => setIncludeMicroRecapNext(e.target.checked)}
                  className="accent-[#F97316] rounded cursor-pointer"
                />
                <span>Recap 2s</span>
              </label>
            </div>

            {script.idioma !== 'en' && (
              <button
                type="button"
                disabled={isTranslating || isGeneratingSeries}
                onClick={() => void handleTranslateClick('en')}
                title="Dobla este guion a inglés conservando todas tus imágenes (3x–5x mayor RPM)"
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] disabled:opacity-50 text-xs font-medium text-[var(--text-body)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isTranslating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0284C7] dark:text-[#38BDF8]" />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-[#0284C7] dark:text-[#38BDF8]" />
                )}
                <span>Doblar a Inglés (Alto RPM)</span>
              </button>
            )}

            {script.idioma !== 'pt' && (
              <button
                type="button"
                disabled={isTranslating || isGeneratingSeries}
                onClick={() => void handleTranslateClick('pt')}
                title="Adapta este guion a portugués conservando todas tus imágenes"
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] disabled:opacity-50 text-xs font-medium text-[var(--text-body)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-[#16A34A]" />
                <span>Portugués</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadSrt}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-body)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Subtitles className="w-3.5 h-3.5" />
              <span>Subtítulos .SRT</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-body)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar .MD</span>
            </button>
          </div>
        </div>

        {/* Línea de tiempo del video */}
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--text-body)]">Línea de tiempo del video</span>
            <span className="font-mono text-[var(--text-secondary)] tabular-nums">
              0:00 → {Math.floor(script.duracionSegundos / 60)}:
              {String(script.duracionSegundos % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="flex w-full h-9 rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            {script.escenas.map((scene) => {
              const span = Math.max(1, scene.segundoFin - scene.segundoInicio);
              const widthPct = (span / script.duracionSegundos) * 100;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => scrollToScene(scene.id)}
                  style={{ width: `${widthPct}%` }}
                  title={`Escena ${scene.orden}: ${scene.tiempoInicio}–${scene.tiempoFin} (${scene.fase})`}
                  className={`relative h-full border-r border-[var(--border-subtle)] last:border-r-0 flex flex-col justify-center px-1.5 text-left transition-colors cursor-pointer overflow-hidden ${
                    scene.esGiro30s
                      ? 'bg-[#F97316]/20 hover:bg-[#F97316]/30 text-[var(--text-accent-soft)]'
                      : scene.orden === 1
                        ? 'bg-[var(--bg-elevated-hover)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] text-[var(--text-secondary)]'
                  }`}
                >
                  <span className="text-[10px] font-mono tabular-nums truncate">
                    {scene.tiempoInicio}
                  </span>
                  {scene.esGiro30s && (
                    <span className="text-[10px] font-semibold text-[#F97316] truncate">
                      Clave
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Gancho + Guía visual + Monetización */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4 border-t border-[var(--border-subtle)]">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[#F97316]">
              01. Gancho inicial (0:00 – 0:03)
            </h3>
            <p className="text-sm text-[var(--text-primary)] font-medium leading-snug">
              “{script.ganchoInicial3Seg.fraseApertura}”
            </p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-body)] font-semibold">Visual:</strong>{' '}
              {script.ganchoInicial3Seg.impactoVisual}
            </p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-body)] font-semibold">Sonido:</strong>{' '}
              {script.ganchoInicial3Seg.sonidoRompeScroll}
            </p>
          </div>

          <div className="space-y-2 lg:border-l lg:border-[var(--border-subtle)] lg:pl-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-[var(--text-body)]">
                02. Guía de estilo visual
              </h3>
              <button
                type="button"
                onClick={() => copyText('master-3d', script.guiaEstilo3D)}
                className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedId === 'master-3d' ? (
                  <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedId === 'master-3d' ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
            <p className="text-xs font-mono text-[var(--text-body)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-3 leading-relaxed">
              {script.guiaEstilo3D}
            </p>
          </div>

          <div className="space-y-2 lg:border-l lg:border-[var(--border-subtle)] lg:pl-6">
            <h3 className="text-xs font-semibold text-[var(--text-body)]">
              03. Estrategia de monetización
            </h3>
            <p className="text-xs text-[var(--text-body)] leading-relaxed">
              {script.estrategiaMonetizacion.anguloRpm}
            </p>
            <div className="text-xs text-[var(--text-secondary)] space-y-1">
              <p>
                <strong className="text-[var(--text-body)] font-semibold">Retención meta:</strong>{' '}
                {script.estrategiaMonetizacion.retencionObjetivo}
              </p>
              <p>
                <strong className="text-[var(--text-body)] font-semibold">CTA orgánico:</strong>{' '}
                {script.estrategiaMonetizacion.ctaOrganico}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Escaleta / Guion corrido e imágenes múltiples */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Guion narrativo, prompts e imágenes por escena
            </h2>
            <p className="text-xs text-[var(--text-secondary)] tabular-nums">
              {script.escenas.length} escenas · {totalImagesCount}{' '}
              {totalImagesCount === 1 ? 'imagen creada' : 'imágenes creadas'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleBatchArtClick}
              disabled={isBatchGeneratingArt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] disabled:opacity-50 text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isBatchGeneratingArt ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
              ) : (
                <ImagePlus className="w-3.5 h-3.5 text-[#F97316]" />
              )}
              <span>
                {isBatchGeneratingArt ? 'Creando imágenes...' : 'Generar imágenes distintas'}
              </span>
            </button>

            <div className="flex items-center p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'all'
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Escenas ({script.escenas.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('twists')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'twists'
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Puntos clave
              </button>
              <button
                type="button"
                onClick={() => setViewMode('narrative')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'narrative'
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Guion corrido
              </button>
            </div>
            {onBatchUploadBeatUserMedia && (
              <button
                type="button"
                onClick={() => setShowBatchMediaPanel((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showBatchMediaPanel
                    ? 'bg-[#F97316]/10 border-[#F97316] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-strong)] text-[var(--text-body)]'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-[#F97316]" />
                <span>
                  Lote de fotos / clips
                  {userMediaBeatsCount > 0 ? ` (${userMediaBeatsCount})` : ''}
                </span>
              </button>
            )}
          </div>
        </div>

        {showBatchMediaPanel && onBatchUploadBeatUserMedia && (
          <div className="px-6 pt-4">
            <BatchMediaDropzone
              mode="beats"
              beatCount={script.escenas.length}
              existingUserMediaCount={userMediaBeatsCount}
              isApplying={isApplyingBatchMedia}
              onApplyToBeats={handleBatchApplyToBeats}
            />
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="mx-6 mt-4 rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-3.5 py-2.5 text-xs text-[var(--text-danger)]"
          >
            {actionError}
          </div>
        )}

        {viewMode === 'narrative' ? (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-[var(--text-secondary)]">
                Lectura fluida del guion completo para locución humana o revisión narrativa.
              </p>
              <button
                type="button"
                onClick={() => copyText('full-voiceover', buildVoiceoverText(script))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-elevated-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedId === 'full-voiceover' ? (
                  <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedId === 'full-voiceover' ? 'Guion copiado' : 'Copiar guion'}</span>
              </button>
            </div>
            <div className="space-y-4 max-w-3xl">
              {script.escenas.map((sc) => (
                <div key={sc.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)] tabular-nums">
                    <span>
                      {sc.tiempoInicio} – {sc.tiempoFin}
                    </span>
                    <span>·</span>
                    <span className={sc.esGiro30s ? 'text-[#F97316] font-semibold' : ''}>
                      {sc.fase}
                    </span>
                  </div>
                  <p className="text-base text-[var(--text-primary)] leading-relaxed">
                    {sc.narracion}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {visibleScenes.map((scene) => {
              const isRefining = refiningSceneId === scene.id;
              const isRefineOpen = openRefineId === scene.id;
              const isEditing = editingSceneId === scene.id;
              const isGeneratingArt = Boolean(generatingArtIds[scene.id]);
              const media = sceneMedia[scene.id];
              const customImages = [
                ...(media?.imageDataUrl && !isLegacyFlatSvgDataUrl(media.imageDataUrl)
                  ? [media.imageDataUrl]
                  : []),
                ...(media?.altImageDataUrls ?? []).filter((u) => !isLegacyFlatSvgDataUrl(u)),
              ];
              const sceneDurSec = Math.max(2, scene.segundoFin - scene.segundoInicio);
              const weakDiag = weakBeatMap.get(scene.id);

              return (
                <article
                  key={scene.id}
                  id={`scene-row-${scene.id}`}
                  className={`px-6 py-5 transition-colors ${
                    scene.esGiro30s ? 'bg-[var(--bg-highlight-row)]' : 'bg-transparent'
                  } ${weakDiag ? 'border-l-2 border-l-[#F59E0B]' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                      <span className="font-mono font-semibold text-[var(--text-primary)]">
                        {scene.tiempoInicio} – {scene.tiempoFin}
                      </span>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ({sceneDurSec}s)
                      </span>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        /
                      </span>
                      <span className="text-[var(--text-secondary)]">Beat {scene.orden}</span>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={
                          scene.esGiro30s || scene.retentionRole === 're_hook'
                            ? 'font-semibold text-[#F97316]'
                            : 'font-medium text-[var(--text-body)]'
                        }
                      >
                        {scene.retentionRole ? RETENTION_ROLE_LABELS[scene.retentionRole] : scene.fase}
                      </span>
                      {scene.shotType && (
                        <>
                          <span className="text-[var(--text-muted)]" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                            {SHOT_TYPE_LABELS[scene.shotType]}
                          </span>
                        </>
                      )}
                      {scene.mediaSource === 'user_photo' && (
                        <span className="px-2 py-0.5 rounded bg-[#16A34A]/12 border border-[#16A34A]/35 text-[11px] font-medium text-[#15803D] dark:text-[#4ADE80]">
                          Foto real · TrueDepth 2.5D
                        </span>
                      )}
                      {scene.mediaSource === 'user_video' && (
                        <span className="px-2 py-0.5 rounded bg-[#0284C7]/12 border border-[#0284C7]/35 text-[11px] font-medium text-[#0369A1] dark:text-[#38BDF8]">
                          Clip real · OPFS
                        </span>
                      )}
                      {scene.isCtaBeat && (
                        <span className="px-2 py-0.5 rounded bg-[#F97316]/12 border border-[#F97316]/35 text-[11px] font-semibold text-[#EA580C] dark:text-[#FDBA74]">
                          CTA Final
                        </span>
                      )}
                      {weakDiag && (
                        <span
                          title={weakDiag.reasons.join(' · ')}
                          className="text-[11px] font-medium text-[#D97706] dark:text-[#FBBF24]"
                        >
                          · {weakDiag.reasons[0]}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {isUserMediaBeat(scene.mediaSource) && onRevertBeatToAi ? (
                        <button
                          type="button"
                          onClick={() => void onRevertBeatToAi(scene.id)}
                          title="Eliminar foto o clip real de OPFS y volver a generar arte AI"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-[#F97316]" />
                          <span>Volver a IA</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onRegenerateSceneImage(scene.id)}
                          title="Generar nueva variante visual AI única para esta escena (gratis)"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-[#F97316]" />
                          <span>Regenerar imagen</span>
                        </button>
                      )}

                      {!isUserMediaBeat(scene.mediaSource) &&
                        customImages.length > 0 &&
                        customImages.length < 3 && (
                          <button
                            type="button"
                            onClick={() => handleSceneArtClick(scene, true)}
                            disabled={isGeneratingArt}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] disabled:opacity-50 text-xs text-[var(--text-body)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#F97316]" />
                            <span>Otra toma</span>
                          </button>
                        )}

                      <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-body)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer">
                        {uploadingBeatId === scene.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                        ) : (
                          <Upload className="w-3.5 h-3.5 text-[#F97316]" />
                        )}
                        <span>{uploadingBeatId === scene.id ? 'Guardando...' : 'Foto / Clip'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                          className="sr-only"
                          onChange={(e) => {
                            void handleUploadFile(scene.id, e.target.files?.[0]);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setEditingSceneId(isEditing ? null : scene.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>{isEditing ? 'Listo' : 'Editar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOpenRefineId(isRefineOpen ? null : scene.id);
                          setCustomInstruction('');
                        }}
                        disabled={isRefining}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-[#F97316] hover:bg-[#F97316]/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {isRefining ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="w-3.5 h-3.5" />
                        )}
                        <span>{isRefining ? 'Mejorando...' : 'Mejorar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => copyText(`prompt-${scene.id}`, scene.promptVisual3D)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-[var(--text-body)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedId === `prompt-${scene.id}` ? (
                          <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedId === `prompt-${scene.id}` ? 'Copiado' : 'Prompt'}</span>
                      </button>

                      <div className="flex items-center gap-0.5 pl-1 border-l border-[var(--border-subtle)]">
                        <button
                          type="button"
                          disabled={scene.orden <= 1}
                          onClick={() => onMoveScene(scene.id, 'up')}
                          title="Subir escena"
                          aria-label={`Subir escena ${scene.orden}`}
                          className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={scene.orden >= script.escenas.length}
                          onClick={() => onMoveScene(scene.id, 'down')}
                          title="Bajar escena"
                          aria-label={`Bajar escena ${scene.orden}`}
                          className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={script.escenas.length <= 1}
                          onClick={() => onDeleteScene(scene.id)}
                          title="Eliminar escena"
                          aria-label={`Eliminar escena ${scene.orden}`}
                          className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    <div className="lg:col-span-5 space-y-3">
                      {isEditing ? (
                        <div className="space-y-2.5">
                          <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                            Narración (Voz en off)
                          </label>
                          <textarea
                            rows={3}
                            value={scene.narracion}
                            onChange={(e) =>
                              onUpdateSceneInline(scene.id, { narracion: e.target.value })
                            }
                            className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                                Subtítulo dinámico
                              </label>
                              <input
                                type="text"
                                value={scene.subtituloDinamico}
                                onChange={(e) =>
                                  onUpdateSceneInline(scene.id, {
                                    subtituloDinamico: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                                Palabra destacada
                              </label>
                              <input
                                type="text"
                                value={scene.palabraDestacada}
                                onChange={(e) =>
                                  onUpdateSceneInline(scene.id, {
                                    palabraDestacada: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                                Duración (seg)
                              </label>
                              <input
                                type="number"
                                min={2}
                                max={45}
                                value={sceneDurSec}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  if (Number.isFinite(val) && val >= 2 && val <= 45) {
                                    onUpdateSceneDuration(scene.id, Math.round(val));
                                  }
                                }}
                                className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] tabular-nums focus:outline-none focus:border-[#F97316]"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-[15px] text-[var(--text-primary)] leading-relaxed">
                            {scene.narracion}
                          </p>
                          <div className="text-xs text-[var(--text-secondary)]">
                            <span className="text-[var(--text-muted)] mr-2">Subtítulo:</span>
                            <span className="font-display font-bold tracking-tight text-[var(--text-primary)]">
                              {renderHighlightedSubtitle(
                                scene.subtituloDinamico,
                                scene.palabraDestacada
                              )}
                            </span>
                          </div>
                        </>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)] pt-1">
                        <span>
                          <strong className="text-[var(--text-body)] font-semibold">Cámara:</strong>{' '}
                          {scene.cameraMotion
                            ? `${CAMERA_MOTION_LABELS[scene.cameraMotion]} · ${scene.movimientoCamara}`
                            : scene.movimientoCamara}
                        </span>
                        <span className="text-[var(--text-muted)]" aria-hidden="true">
                          ·
                        </span>
                        <span>
                          <strong className="text-[var(--text-body)] font-semibold">Foley:</strong>{' '}
                          {scene.foleyCue && scene.foleyCue !== 'none'
                            ? FOLEY_CUE_LABELS[scene.foleyCue]
                            : scene.disenoSonoro}
                        </span>
                        {scene.pacingProfile &&
                          (scene.pacingProfile.prePauseMs > 0 ||
                            Math.abs(scene.pacingProfile.speedMultiplier - 1) >= 0.03) && (
                            <>
                              <span className="text-[var(--text-muted)]" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-mono text-[11px] text-[#F97316]">
                                {scene.pacingProfile.speedMultiplier.toFixed(2)}x
                                {scene.pacingProfile.prePauseMs > 0
                                  ? ` · pausa +${scene.pacingProfile.prePauseMs}ms`
                                  : ''}
                              </span>
                            </>
                          )}
                      </div>
                      {(scene.hudData?.value || scene.worldStateDelta) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                          {scene.hudData?.value && (
                            <span className="font-mono text-[#0284C7] dark:text-[#38BDF8]">
                              HUD: {scene.hudData.label} {scene.hudData.value}
                              {scene.hudData.unit ? ` ${scene.hudData.unit}` : ''}
                            </span>
                          )}
                          {scene.worldStateDelta && (
                            <span className="text-[var(--text-muted)]">
                              <strong className="text-[var(--text-body)] font-medium">
                                Continuidad:
                              </strong>{' '}
                              {scene.worldStateDelta}
                            </span>
                          )}
                        </div>
                      )}
                      {scene.commercialSpecs && scene.commercialSpecs.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {scene.commercialSpecs.map((spec, sIdx) => (
                            <span
                              key={`${spec.label}-${sIdx}`}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[11px] text-[var(--text-primary)]"
                            >
                              <span className="text-[var(--text-muted)]">{spec.label}:</span>
                              <span className="font-semibold">{spec.value}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {scene.isCtaBeat && scene.ctaOverlay && (
                        <div className="mt-1.5 rounded-lg bg-[var(--bg-surface)] border border-[#F97316]/35 px-3 py-2 text-xs">
                          <div className="font-semibold text-[var(--text-primary)]">
                            Tarjeta CTA final: {scene.ctaOverlay.headline}
                          </div>
                          {(scene.ctaOverlay.subheadline || scene.ctaOverlay.contactLine) && (
                            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                              {[scene.ctaOverlay.subheadline, scene.ctaOverlay.contactLine]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="lg:col-span-4 space-y-1.5">
                      <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                        Prompt de arte AI y Google Flow (EN)
                      </div>
                      {isEditing ? (
                        <textarea
                          rows={4}
                          value={scene.imagePrompt || scene.promptVisual3D}
                          onChange={(e) =>
                            onUpdateSceneInline(scene.id, {
                              imagePrompt: e.target.value,
                              promptVisual3D: e.target.value,
                            })
                          }
                          className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-[#F97316]"
                        />
                      ) : (
                        <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-xs font-mono text-[var(--text-body)] leading-relaxed">
                          {scene.imagePrompt || scene.promptVisual3D}
                        </div>
                      )}
                    </div>

                    {/* Vista previa real (video OPFS, foto real OPFS o arte AI único por escena) */}
                    <div className="lg:col-span-3 flex flex-wrap gap-2 justify-start lg:justify-end">
                      {scene.mediaSource === 'user_video' ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <div
                            className={`relative rounded-lg overflow-hidden border border-[#0284C7]/60 bg-[#0B0D11] flex flex-col items-center justify-center p-2 text-center ${
                              aspectRatio === '16:9' ? 'w-36 aspect-video' : 'w-24 aspect-[9/16]'
                            }`}
                          >
                            <Film className="w-6 h-6 text-[#38BDF8] mb-1.5" />
                            <span className="text-[10px] font-semibold text-white line-clamp-2 break-all">
                              {media?.videoClipName || 'Clip real'}
                            </span>
                            {media?.videoClipDurationSec ? (
                              <span className="mt-1 text-[9px] font-mono text-white/70">
                                {media.videoClipDurationSec.toFixed(1)}s · 1.0x
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">
                            Clip real · OPFS
                          </span>
                        </div>
                      ) : customImages.length > 0 ? (
                        customImages.map((imgUrl, imgIdx) => (
                          <div key={imgIdx} className="flex flex-col items-center gap-1">
                            <div
                              className={`relative group rounded-lg overflow-hidden border ${
                                imgIdx === 0 ? 'border-[#F97316]/70' : 'border-[var(--border-strong)]'
                              } bg-[#0B0D11] ${
                                aspectRatio === '16:9'
                                  ? 'w-32 aspect-video'
                                  : 'w-20 aspect-[9/16]'
                              }`}
                            >
                              <img
                                src={imgUrl}
                                alt={`Escena ${scene.orden} toma ${imgIdx + 1}`}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (scene.mediaSource === 'user_photo' && onRevertBeatToAi) {
                                    void onRevertBeatToAi(scene.id);
                                  } else {
                                    onRemoveSceneImage(scene.id, imgIdx);
                                  }
                                }}
                                title="Quitar esta foto y volver al arte AI"
                                aria-label={`Quitar toma ${imgIdx + 1}`}
                                className="absolute top-1 right-1 p-1 rounded bg-black/75 text-white/80 hover:text-[#FCA5A5] opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                              {imgIdx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => onPromoteSceneImage(scene.id, imgIdx - 1)}
                                  title="Usar como toma principal"
                                  className="absolute bottom-1 inset-x-1 py-0.5 rounded bg-black/80 text-[9px] font-semibold text-[#FDBA74] hover:text-white inline-flex items-center justify-center gap-0.5 opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                                >
                                  <Star className="w-2.5 h-2.5" />
                                  <span>Principal</span>
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                downloadImageAsPng(
                                  imgUrl,
                                  `${slugifyFilename(script.tituloViral)}-escena-${scene.orden}-toma-${imgIdx + 1}.png`
                                )
                              }
                              className="inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Download className="w-2.5 h-2.5" />
                              <span>
                                {scene.mediaSource === 'user_photo'
                                  ? 'Foto real'
                                  : imgIdx === 0
                                    ? 'Principal'
                                    : `Toma ${imgIdx + 1}`}
                              </span>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="flex flex-col items-center gap-1.5">
                          <div
                            className={`relative rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[#07090D] ${
                              aspectRatio === '16:9' ? 'w-36 aspect-video' : 'w-24 aspect-[9/16]'
                            }`}
                          >
                            <AiSceneThumbnail
                              scene={scene}
                              script={script}
                              aspectRatio={aspectRatio}
                              overrideSeed={media?.imageSeed}
                              alt={`Arte AI Escena ${scene.orden}`}
                            />
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">
                            Arte AI · Escena {scene.orden}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {isRefineOpen && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_REFINEMENTS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            disabled={isRefining}
                            onClick={() => handleRunRefine(scene, preset)}
                            className="px-2.5 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-strong)] hover:border-[#F97316] text-xs text-[var(--text-body)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={customInstruction}
                          onChange={(e) => setCustomInstruction(e.target.value)}
                          placeholder="Indicación personalizada para reescribir esta escena..."
                          className="flex-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#F97316]"
                        />
                        <button
                          type="button"
                          disabled={isRefining || !customInstruction.trim()}
                          onClick={() => handleRunRefine(scene, customInstruction)}
                          className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            <div className="px-6 py-4 bg-[var(--bg-surface)] flex items-center justify-center">
              <button
                type="button"
                onClick={onAddScene}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#F97316]" />
                <span>Agregar nueva escena al final</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Plan de ejecución, Loop final y SEO */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Plan rápido de producción
          </h3>
          <ol className="space-y-2 text-sm text-[var(--text-body)]">
            {script.estrategiaMonetizacion.planEjecucionRapida.map((step, idx) => (
              <li key={idx} className="flex gap-3 leading-relaxed">
                <span className="font-mono text-xs text-[#F97316] pt-1 tabular-nums shrink-0">
                  0{idx + 1}.
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-1">
            <div className="text-xs font-semibold text-[var(--text-body)]">
              Conexión de loop final
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {script.loopFinal}
            </p>
          </div>
        </div>

        <div className="space-y-4 lg:border-l lg:border-[var(--border-subtle)] lg:pl-8">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Títulos alternativos A/B
            </h3>
            <ul className="space-y-1.5 text-sm text-[var(--text-body)]">
              {script.metadatosPublicacion.titulosAlternativos.map((t, idx) => (
                <li key={idx} className="flex items-start justify-between gap-3">
                  <span className="leading-snug">{t}</span>
                  <button
                    type="button"
                    onClick={() => copyText(`title-${idx}`, t)}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedId === `title-${idx}` ? 'Copiado' : 'Copiar'}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5 pt-3 border-t border-[var(--border-subtle)]">
            <div className="text-xs font-semibold text-[var(--text-body)]">
              Descripción y hashtags
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {script.metadatosPublicacion.descripcionSeo}
            </p>
            <div className="text-xs text-[var(--text-secondary)] pt-1">
              {script.metadatosPublicacion.hashtags.join(' · ')}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function renderHighlightedSubtitle(subtitle: string, highlight: string) {
  if (!highlight) return subtitle;
  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = subtitle.split(regex);

  return parts.map((part, idx) =>
    part.toLowerCase() === highlight.toLowerCase() ? (
      <span key={idx} className="text-[#F97316]">
        {part}
      </span>
    ) : (
      <span key={idx}>{part}</span>
    )
  );
}
