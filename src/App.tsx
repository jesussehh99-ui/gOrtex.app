import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clapperboard,
  Copy,
  Film,
  FolderKanban,
  Moon,
  Radar,
  Share2,
  Sparkles,
  Sun,
} from 'lucide-react';
import { IdeaComposerHome } from './components/IdeaComposerHome';
import { ProFlowGuideModal } from './components/ProFlowGuideModal';
import { ScriptBlueprintView } from './components/ScriptBlueprintView';
import { ScriptGeneratorPanel } from './components/ScriptGeneratorPanel';
import { ScriptLibraryView } from './components/ScriptLibraryView';
import { SubtitleSimulator, type VideoStudioSubMode } from './components/SubtitleSimulator';
import { TrendRadarView } from './components/TrendRadarView';
import type { HookOptionPreview, ViralNichePlaybook } from './data/viralIdeasBank';
import {
  DEFAULT_COMMERCIAL_BRIEF,
  getCommercialSectorById,
  isCommercialStudioMode,
} from './data/commercialPresets';
import {
  getStyle3DById,
  MONETIZATION_NICHES,
  STARTER_SCRIPT,
  SUBMARINE_IMPLOSION_SCRIPT,
  WOW_SIGNAL_1977_SCRIPT,
} from './data/presets';
import {
  createMultimodalThumbnail,
  deleteUserMediaForBeat,
  ingestUserPhotoForBeat,
  ingestUserVideoForBeat,
  isUserMediaBeat,
  type PendingBatchMediaItem,
} from './services/userMediaIngestionService';
import type {
  AudienceId,
  BackgroundMusicId,
  ChannelPreset,
  CommercialBrief,
  CommercialSector,
  DeletionReport,
  DurationOption,
  GarbageCollectionReport,
  GeneratedVideoItem,
  GenerateScriptPayload,
  HumanVoiceProfile,
  MultimodalPhotoInput,
  NarrativeBlueprintSelection,
  PlatformId,
  ProjectSummary,
  SagaBible,
  SceneMediaMap,
  ScriptLanguage,
  ScriptScene,
  ShotVariationType,
  StorageTelemetry,
  StudioMode,
  Style3DId,
  SubtitleConfig,
  TrendItem,
  TrendRadarResult,
  VideoAspectRatio,
  ViralScript,
} from './types';
import {
  appendEpisodeToSagaBible,
  ensureSagaBibleForScript,
  loadAllSagas,
} from './utils/sagaBibleStorage';
import {
  buildAllOrganizedClipboard,
  buildCompleteScriptAndFlowPackTxt,
  buildSrtContent,
  slugifyFilename,
  triggerFileDownload,
} from './utils/exportScript';
import {
  hydrateScriptArtFromCache,
  preloadScriptBeatsFromEditor,
} from './utils/aiImageQueue';
import {
  GeminiApiError,
  generateBatchSceneSvgArt,
  generateFlowPromptsForScript,
  generateSceneSvgArt,
  generateSeriesNextEpisode,
  generateViralScript,
  optimizeWeakBeats,
  refineSingleScene,
  scanViralTrends,
  translateViralScript,
} from './services/geminiClient';
import {
  deleteRenderedVideo,
  loadAllSceneMedia,
  loadSavedVideos,
  saveRenderedVideo,
  saveScriptSceneMedia,
} from './utils/mediaStorage';
import {
  buildProjectSummary,
  clearAiModelsCache,
  deleteProjectAtomically,
  deleteProjectsBatch,
  deleteSagaCompletely,
  formatBytes,
  getStorageTelemetry,
  objectUrlRegistry,
  registerActiveSessionController,
  runStartupGarbageCollection,
  scheduleStartupGarbageCollection,
} from './engine/storage';
import { generateRandomSceneSeed } from './utils/sceneImageUrl';
import { synthesizeUnifiedVoiceBuffer } from './utils/unifiedVoiceEngine';
import { DEFAULT_SUBTITLE_CONFIG } from './utils/videoExporter';

type WorkspaceTab = 'create' | 'studio' | 'simulator' | 'trends' | 'library';

const STORAGE_KEY = 'corte30_saved_scripts_v2';
const CHANNEL_PRESETS_KEY = 'corte30_channel_presets_v1';
const WOW_SIGNAL_SEED_FLAG = 'gortex_seeded_wow_1977_beats_v2';

function loadSavedScripts(): { scripts: ViralScript[]; freshlySeeded: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const alreadySeeded = localStorage.getItem(WOW_SIGNAL_SEED_FLAG) === '1';
    let list: ViralScript[] = [SUBMARINE_IMPLOSION_SCRIPT, STARTER_SCRIPT];

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = parsed;
      }
    }

    if (!alreadySeeded) {
      const filtered = list.filter((item) => item.id !== WOW_SIGNAL_1977_SCRIPT.id);
      const next = [WOW_SIGNAL_1977_SCRIPT, ...filtered];
      try {
        localStorage.setItem(WOW_SIGNAL_SEED_FLAG, '1');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignorar si almacenamiento está restringido
      }
      return { scripts: next, freshlySeeded: true };
    }

    return { scripts: list, freshlySeeded: false };
  } catch {
    return {
      scripts: [WOW_SIGNAL_1977_SCRIPT, SUBMARINE_IMPLOSION_SCRIPT, STARTER_SCRIPT],
      freshlySeeded: true,
    };
  }
}

function loadChannelPresets(): ChannelPreset[] {
  try {
    const raw = localStorage.getItem(CHANNEL_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatSecStamp(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function recalculateSceneTimings(scenes: ScriptScene[], totalSec: number): ScriptScene[] {
  if (scenes.length === 0) return scenes;
  const safeTotal = Math.max(scenes.length * 3, totalSec);
  const perScene = safeTotal / scenes.length;
  return scenes.map((sc, idx) => {
    const start = Math.round(idx * perScene);
    const end = idx === scenes.length - 1 ? safeTotal : Math.round((idx + 1) * perScene);
    return {
      ...sc,
      orden: idx + 1,
      segundoInicio: start,
      segundoFin: Math.max(start + 1, end),
      tiempoInicio: formatSecStamp(start),
      tiempoFin: formatSecStamp(Math.max(start + 1, end)),
    };
  });
}

const THEME_STORAGE_KEY = 'corte30_theme';

function loadInitialTheme(): 'light' | 'dark' {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export default function App() {
  const [initialBoot] = useState(loadSavedScripts);
  const [theme, setTheme] = useState<'light' | 'dark'>(loadInitialTheme);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    initialBoot.freshlySeeded ? 'simulator' : 'create'
  );
  const [studioSubMode, setStudioSubMode] = useState<VideoStudioSubMode>('story_video');
  const [headerCopied, setHeaderCopied] = useState(false);
  const [isProGuideOpen, setIsProGuideOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignorar si almacenamiento está restringido
    }
  }, [theme]);

  const [scripts, setScripts] = useState<ViralScript[]>(initialBoot.scripts);
  const [activeScriptId, setActiveScriptId] = useState<string>(initialBoot.scripts[0].id);

  // Medios generados en memoria por guion (imágenes múltiples + audios WAV humanos)
  const [mediaByScript, setMediaByScript] = useState<Record<string, SceneMediaMap>>({});
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideoItem[]>([]);
  const [generatingArtIds, setGeneratingArtIds] = useState<Record<string, boolean>>({});
  const [isBatchGeneratingArt, setIsBatchGeneratingArt] = useState(false);
  const [isOptimizingFlowPrompts, setIsOptimizingFlowPrompts] = useState(false);
  const [isBatchGeneratingAudio, setIsBatchGeneratingAudio] = useState(false);
  const [audioProgressLabel, setAudioProgressLabel] = useState<string | null>(null);
  const [autoProduceNonce, setAutoProduceNonce] = useState(0);

  // Estado del compositor de ideas y generador individual (Viral / Storytelling + Comercial & Bienes Raíces)
  const [studioMode, setStudioMode] = useState<StudioMode>('viral_storytelling');
  const [commercialSector, setCommercialSector] = useState<CommercialSector>('luxury_home_apartment');
  const [commercialBrief, setCommercialBrief] = useState<CommercialBrief>(DEFAULT_COMMERCIAL_BRIEF);
  const [pendingComposerMedia, setPendingComposerMedia] = useState<PendingBatchMediaItem[]>([]);
  const [audience, setAudience] = useState<AudienceId>(
    initialBoot.freshlySeeded ? 'suspense' : 'educational'
  );
  const [premise, setPremise] = useState('');
  const [niche, setNiche] = useState(
    initialBoot.freshlySeeded ? 'Lore y Misterios' : MONETIZATION_NICHES[0].label
  );
  const [durationSec, setDurationSec] = useState<DurationOption>(90);
  const [style3D, setStyle3D] = useState<Style3DId>(
    initialBoot.freshlySeeded ? 'pixar_dark' : MONETIZATION_NICHES[0].defaultStyle
  );
  const [platform, setPlatform] = useState<PlatformId>('tiktok_creativity');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('9:16');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    initialBoot.freshlySeeded ? 'diego_sereno' : 'lucia_cotidiana'
  );
  const [backgroundMusicId, setBackgroundMusicId] = useState<BackgroundMusicId>(
    initialBoot.freshlySeeded ? 'misterio_espacial' : 'curiosidad'
  );
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleConfig>(DEFAULT_SUBTITLE_CONFIG);
  const [monetizationGoal, setMonetizationGoal] = useState(MONETIZATION_NICHES[0].goal);
  const [narrativeBlueprint, setNarrativeBlueprint] = useState<NarrativeBlueprintSelection>('auto');
  const [channelPresets, setChannelPresets] = useState<ChannelPreset[]>(loadChannelPresets);
  const [sagas, setSagas] = useState<SagaBible[]>(loadAllSagas);

  const [isGenerating, setIsGenerating] = useState(false);
  const [scriptCooldownSec, setScriptCooldownSec] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isOptimizingWeakBeats, setIsOptimizingWeakBeats] = useState(false);
  const [isGeneratingSeries, setIsGeneratingSeries] = useState(false);
  const [creatingSequelId, setCreatingSequelId] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  // Estado de telemetría de almacenamiento, GC automático/manual y notificaciones sutiles
  const [storageTelemetry, setStorageTelemetry] = useState<StorageTelemetry | null>(null);
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(false);
  const [isRunningGc, setIsRunningGc] = useState(false);
  const [lastGcReport, setLastGcReport] = useState<GarbageCollectionReport | null>(null);
  const [storageToast, setStorageToast] = useState<string | null>(null);
  const storageToastTimerRef = useRef<number | null>(null);

  const scriptLockRef = useRef(false);
  const trendsLockRef = useRef(false);
  const scriptsRef = useRef(scripts);
  const activeScriptIdRef = useRef(activeScriptId);
  scriptsRef.current = scripts;
  activeScriptIdRef.current = activeScriptId;

  const showStorageToast = useCallback((message: string) => {
    setStorageToast(message);
    if (storageToastTimerRef.current !== null) {
      window.clearTimeout(storageToastTimerRef.current);
    }
    storageToastTimerRef.current = window.setTimeout(() => {
      setStorageToast(null);
      storageToastTimerRef.current = null;
    }, 5200);
  }, []);

  const refreshStorageTelemetry = useCallback(async (overrideScripts?: ViralScript[]) => {
    setIsLoadingTelemetry(true);
    try {
      const targetScripts = overrideScripts ?? scriptsRef.current;
      const snap = await getStorageTelemetry(targetScripts);
      setStorageTelemetry(snap);
    } finally {
      setIsLoadingTelemetry(false);
    }
  }, []);

  // Estado del radar de tendencias
  const [radarData, setRadarData] = useState<TrendRadarResult | null>(null);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [trendsCooldownSec, setTrendsCooldownSec] = useState(0);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  useEffect(() => {
    if (scriptCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setScriptCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [scriptCooldownSec]);

  useEffect(() => {
    if (trendsCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setTrendsCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [trendsCooldownSec]);

  const activeScript = scripts.find((s) => s.id === activeScriptId) ?? scripts[0] ?? STARTER_SCRIPT;
  const activeSceneMedia: SceneMediaMap = mediaByScript[activeScript.id] ?? {};
  const supportsNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // Hidratar imágenes, audios WAV y videos renderizados guardados en IndexedDB
  useEffect(() => {
    let active = true;
    void loadAllSceneMedia().then((storedMedia) => {
      if (active && Object.keys(storedMedia).length > 0) {
        setMediaByScript((prev) => ({ ...storedMedia, ...prev }));
      }
    });
    void loadSavedVideos().then((storedVideos) => {
      if (active && storedVideos.length > 0) {
        setGeneratedVideos((prev) => {
          const existingIds = new Set(prev.map((v) => v.id));
          return [...prev, ...storedVideos.filter((v) => !existingIds.has(v.id))];
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Registrar controlador de sesión activa para eliminación atómica (Paso 1 -> 4) y programar GC al arrancar
  useEffect(() => {
    const unregister = registerActiveSessionController({
      getScripts: () => scriptsRef.current,
      getActiveProjectId: () => activeScriptIdRef.current,
      unmountProjectBeforeDelete: (projectId: string) => {
        if (activeScriptIdRef.current !== projectId) return;
        const nextSafe = scriptsRef.current.find((s) => s.id !== projectId);
        const safeId = nextSafe?.id ?? STARTER_SCRIPT.id;
        activeScriptIdRef.current = safeId;
        setActiveScriptId(safeId);
      },
      commitDeletionState: (deletedProjectIds: string[], updatedSagas: SagaBible[]) => {
        const deletedSet = new Set(deletedProjectIds);
        setSagas(updatedSagas);
        setMediaByScript((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const pid of deletedProjectIds) {
            if (next[pid]) {
              delete next[pid];
              changed = true;
            }
          }
          return changed ? next : prev;
        });
        setGeneratedVideos((prev) => {
          const remaining = prev.filter((v) => {
            if (v.scriptId && deletedSet.has(v.scriptId)) {
              objectUrlRegistry.revokeUrl(v.videoUrl);
              void deleteRenderedVideo(v.id);
              return false;
            }
            return true;
          });
          return remaining.length === prev.length ? prev : remaining;
        });
        setScripts((prev) => {
          const remaining = prev.filter((s) => !deletedSet.has(s.id));
          if (remaining.length === 0) {
            setActiveScriptId(STARTER_SCRIPT.id);
            return [STARTER_SCRIPT];
          }
          if (deletedSet.has(activeScriptIdRef.current)) {
            setActiveScriptId(remaining[0].id);
          }
          return remaining;
        });
      },
      commitReconciliationState: (reconciledScripts: ViralScript[], reconciledSagas: SagaBible[]) => {
        setScripts(reconciledScripts);
        setSagas(reconciledSagas);
      },
    });

    const cancelIdleGc = scheduleStartupGarbageCollection(
      () => activeScriptIdRef.current,
      (report) => {
        setLastGcReport(report);
        if (report.reclaimedBytes >= 1024 * 1024) {
          showStorageToast(
            `Limpieza automática: ${formatBytes(report.reclaimedBytes)} de archivos temporales/huérfanos liberados`
          );
        }
        void refreshStorageTelemetry();
      }
    );

    return () => {
      unregister();
      cancelIdleGc();
      if (storageToastTimerRef.current !== null) {
        window.clearTimeout(storageToastTimerRef.current);
      }
    };
  }, [refreshStorageTelemetry, showStorageToast]);

  // Refrescar telemetría real en disco cada vez que el usuario entra a la pestaña Biblioteca
  useEffect(() => {
    if (activeTab === 'library') {
      void refreshStorageTelemetry();
    }
  }, [activeTab, scripts.length, refreshStorageTelemetry]);

  const mediaByScriptRef = useRef(mediaByScript);
  useEffect(() => {
    mediaByScriptRef.current = mediaByScript;
  }, [mediaByScript]);

  // Hidratar instantáneamente imágenes AI cacheadas en IndexedDB al cambiar de proyecto
  useEffect(() => {
    const scriptMedia = mediaByScriptRef.current[activeScript.id] ?? {};
    const seedOverrides: Record<string, number | undefined> = {};
    for (const sc of activeScript.escenas) {
      if (scriptMedia[sc.id]?.imageSeed !== undefined) {
        seedOverrides[sc.id] = scriptMedia[sc.id]?.imageSeed;
      }
    }
    void hydrateScriptArtFromCache(activeScript, aspectRatio, seedOverrides);
  }, [activeScript, aspectRatio]);

  // Precarga inteligente en segundo plano de todas las micro-escenas mientras el usuario revisa el Guion
  useEffect(() => {
    if (activeTab !== 'studio') return;
    if (activeScript.escenas.length === 0) return;
    const scriptMedia = mediaByScriptRef.current[activeScript.id] ?? {};
    const seedOverrides: Record<string, number | undefined> = {};
    const skipSceneIds = new Set<string>();
    for (const sc of activeScript.escenas) {
      const m = scriptMedia[sc.id];
      if (m?.imageSeed !== undefined) {
        seedOverrides[sc.id] = m.imageSeed;
      }
      if (m?.videoClipUrl || m?.imageDataUrl || isUserMediaBeat(sc.mediaSource)) {
        skipSceneIds.add(sc.id);
      }
    }
    preloadScriptBeatsFromEditor(activeScript, aspectRatio, seedOverrides, skipSceneIds);
  }, [activeTab, activeScript, aspectRatio]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
    } catch {
      // Ignorar límite de localStorage
    }
  }, [scripts]);

  useEffect(() => {
    try {
      localStorage.setItem(CHANNEL_PRESETS_KEY, JSON.stringify(channelPresets));
    } catch {
      // Ignorar límite de localStorage
    }
  }, [channelPresets]);

  const handleChangeStudioMode = (nextMode: StudioMode) => {
    setStudioMode(nextMode);
    if (nextMode === 'commercial_real_estate') {
      const sectorPreset = getCommercialSectorById(commercialSector);
      setNarrativeBlueprint(sectorPreset.defaultBlueprint);
      setBackgroundMusicId('commercial_lounge');
      setNiche(sectorPreset.nicheName);
      setMonetizationGoal(sectorPreset.monetizationGoal);
      setSubtitleConfig((prev) => ({ ...prev, style: 'contraste' }));
    } else {
      setNarrativeBlueprint('auto');
      setBackgroundMusicId((prev) => (prev === 'commercial_lounge' ? 'curiosidad' : prev));
      if (niche.startsWith('Bienes Raíces') || niche.startsWith('Comercial')) {
        setNiche(MONETIZATION_NICHES[0].label);
        setMonetizationGoal(MONETIZATION_NICHES[0].goal);
      }
    }
  };

  const handleGenerateScript = async (
    payload: GenerateScriptPayload,
    options?: { autoProduceVideo?: boolean }
  ) => {
    if (scriptLockRef.current || scriptCooldownSec > 0) return;
    scriptLockRef.current = true;
    setIsGenerating(true);
    setGenError(null);
    let hitRateLimit = false;
    const attachedMedia = [...pendingComposerMedia];
    try {
      const effectiveStudioMode = payload.studioMode ?? studioMode;
      const isCommercial = isCommercialStudioMode(effectiveStudioMode);

      // Generar miniaturas JPEG temporales (máx. 512px) de fotos subidas para Visión Multimodal Gemini 2.5 Flash
      const multimodalPhotos: MultimodalPhotoInput[] = [];
      for (let i = 0; i < attachedMedia.length; i++) {
        const item = attachedMedia[i];
        if (item.kind !== 'photo') continue;
        try {
          const thumb = await createMultimodalThumbnail(item.file, i + 1, item.name);
          multimodalPhotos.push(thumb);
        } catch {
          // Continuar si una miniatura falló
        }
      }

      const createdRaw: ViralScript = await generateViralScript({
        ...payload,
        studioMode: effectiveStudioMode,
        commercialSector:
          payload.commercialSector ?? (isCommercial ? commercialSector : undefined),
        commercialBrief:
          payload.commercialBrief ?? (isCommercial ? { ...commercialBrief, sector: commercialSector } : undefined),
        multimodalPhotos: multimodalPhotos.length > 0 ? multimodalPhotos : undefined,
        aspectRatio: payload.aspectRatio ?? aspectRatio,
        voiceProfileId: payload.voiceProfileId ?? selectedVoiceId,
        narrativeBlueprint: payload.narrativeBlueprint ?? narrativeBlueprint,
      });

      let created: ViralScript = createdRaw;

      // Mapear 1 a 1 fotos y clips reales subidos en el compositor a los beats del guion en OPFS
      if (attachedMedia.length > 0 && createdRaw.escenas.length > 0) {
        const initialSceneMedia: SceneMediaMap = {};
        const patchedScenes = [...createdRaw.escenas];
        let oversizedClipCount = 0;

        const mapCount = Math.min(attachedMedia.length, patchedScenes.length);
        for (let i = 0; i < mapCount; i++) {
          const item = attachedMedia[i];
          const beat = patchedScenes[i];
          if (item.kind === 'photo') {
            const ingested = await ingestUserPhotoForBeat(createdRaw.id, beat.id, item.file);
            patchedScenes[i] = {
              ...beat,
              mediaSource: 'user_photo',
              userMediaKey: ingested.userMediaKey,
              userMediaMimeType: ingested.mimeType,
              userMediaAspectRatio: ingested.aspectRatio,
            };
            initialSceneMedia[beat.id] = {
              imageDataUrl: ingested.previewDataUrl,
            };
          } else {
            const ingested = await ingestUserVideoForBeat(createdRaw.id, beat.id, item.file);
            if (ingested.sizeWarning) oversizedClipCount += 1;
            objectUrlRegistry.register(createdRaw.id, ingested.previewObjectUrl);
            patchedScenes[i] = {
              ...beat,
              mediaSource: 'user_video',
              userMediaKey: ingested.userMediaKey,
              userMediaMimeType: ingested.mimeType,
              userMediaAspectRatio: ingested.aspectRatio,
            };
            initialSceneMedia[beat.id] = {
              videoClipUrl: ingested.previewObjectUrl,
              videoClipName: item.name,
              videoClipDurationSec: ingested.durationSec,
            };
          }
        }

        created = {
          ...createdRaw,
          escenas: patchedScenes,
        };

        setMediaByScript((prev) => ({
          ...prev,
          [created.id]: initialSceneMedia,
        }));
        void saveScriptSceneMedia(created.id, initialSceneMedia);

        // Liberar ObjectURLs temporales del compositor y limpiar la cola
        for (const item of attachedMedia) {
          if (item.previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(item.previewUrl);
          }
        }
        setPendingComposerMedia([]);

        if (oversizedClipCount > 0) {
          showStorageToast(
            `${mapCount} archivos reales guardados en OPFS (${oversizedClipCount} clip(s) >150 MB: exportación algo más lenta).`
          );
        } else {
          showStorageToast(`${mapCount} archivos reales vinculados 1 a 1 en OPFS (encuadre 1.0x).`);
        }
      }

      setScripts((prev) => [created, ...prev]);
      setActiveScriptId(created.id);
      if (created.formatoVideo) setAspectRatio(created.formatoVideo);
      if (created.vozPreferidaId) setSelectedVoiceId(created.vozPreferidaId);
      if (isCommercialStudioMode(created.studioMode)) {
        setBackgroundMusicId('commercial_lounge');
      }

      if (options?.autoProduceVideo) {
        setStudioSubMode('story_video');
        setActiveTab('simulator');
        setAutoProduceNonce((n) => n + 1);
      } else {
        setActiveTab('studio');
      }
    } catch (err: unknown) {
      if (err instanceof GeminiApiError && err.isRateLimit) {
        hitRateLimit = true;
      }
      setGenError(err instanceof Error ? err.message : 'Error de red al generar el guion.');
    } finally {
      setIsGenerating(false);
      scriptLockRef.current = false;
      setScriptCooldownSec(hitRateLimit ? 12 : 4);
    }
  };

  const handleGenerateSceneArt = async (
    scene: ScriptScene,
    options?: {
      shotType?: ShotVariationType;
      appendVariation?: boolean;
      aspectRatio?: VideoAspectRatio;
    }
  ): Promise<SceneMediaMap> => {
    const targetScriptId = activeScript.id;
    const existingSceneMedia = mediaByScript[targetScriptId]?.[scene.id];
    const currentCount =
      (existingSceneMedia?.imageDataUrl ? 1 : 0) +
      (existingSceneMedia?.altImageDataUrls?.length ?? 0);

    setGeneratingArtIds((prev) => ({ ...prev, [scene.id]: true }));
    try {
      const imageDataUrl = await generateSceneSvgArt({
        promptVisual3D: scene.promptVisual3D,
        narration: scene.narracion,
        style3D: activeScript.estilo3D,
        audience: activeScript.publicoObjetivo || 'general',
        sceneOrder: scene.orden,
        shotType: options?.shotType ?? 'principal',
        aspectRatio: options?.aspectRatio ?? aspectRatio,
        variationIndex: currentCount + 1,
      });

      let updatedScriptMedia: SceneMediaMap = {};
      setMediaByScript((prev) => {
        const scriptMap = prev[targetScriptId] ?? {};
        const prevScene = scriptMap[scene.id] ?? {};
        const nextScene =
          options?.appendVariation && prevScene.imageDataUrl
            ? {
                ...prevScene,
                altImageDataUrls: [...(prevScene.altImageDataUrls ?? []), imageDataUrl],
              }
            : {
                ...prevScene,
                imageDataUrl,
              };

        updatedScriptMedia = {
          ...scriptMap,
          [scene.id]: nextScene,
        };

        void saveScriptSceneMedia(targetScriptId, updatedScriptMedia);

        return {
          ...prev,
          [targetScriptId]: updatedScriptMedia,
        };
      });

      return updatedScriptMedia;
    } finally {
      setGeneratingArtIds((prev) => ({ ...prev, [scene.id]: false }));
    }
  };

  const handleGenerateAllSceneArt = async (
    targetRatio: VideoAspectRatio = aspectRatio
  ): Promise<SceneMediaMap> => {
    const targetScriptId = activeScript.id;
    setIsBatchGeneratingArt(true);
    let latestMap: SceneMediaMap = { ...(mediaByScript[targetScriptId] ?? {}) };
    const chunkSize = 4;

    try {
      for (let start = 0; start < activeScript.escenas.length; start += chunkSize) {
        const chunk = activeScript.escenas.slice(start, start + chunkSize);
        if (start > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        const busyPatch: Record<string, boolean> = {};
        for (const sc of chunk) busyPatch[sc.id] = true;
        setGeneratingArtIds((prev) => ({ ...prev, ...busyPatch }));

        try {
          const imagesBySceneId = await generateBatchSceneSvgArt({
            scenes: chunk.map((sc) => ({
              id: sc.id,
              orden: sc.orden,
              promptVisual3D: sc.promptVisual3D,
              narracion: sc.narracion,
            })),
            style3D: activeScript.estilo3D,
            audience: activeScript.publicoObjetivo || 'general',
            aspectRatio: targetRatio,
          });

          for (const sc of chunk) {
            const url = imagesBySceneId[sc.id];
            if (url) {
              latestMap = {
                ...latestMap,
                [sc.id]: {
                  ...(latestMap[sc.id] ?? {}),
                  imageDataUrl: url,
                },
              };
            }
          }

          setMediaByScript((prev) => {
            const merged: SceneMediaMap = {
              ...(prev[targetScriptId] ?? {}),
              ...latestMap,
            };
            void saveScriptSceneMedia(targetScriptId, merged);
            return {
              ...prev,
              [targetScriptId]: merged,
            };
          });
        } finally {
          const clearPatch: Record<string, boolean> = {};
          for (const sc of chunk) clearPatch[sc.id] = false;
          setGeneratingArtIds((prev) => ({ ...prev, ...clearPatch }));
        }
      }
      return latestMap;
    } finally {
      setIsBatchGeneratingArt(false);
    }
  };

  const handleGenerateSingleVoiceLine = async (
    text: string,
    voice: HumanVoiceProfile,
    language?: ScriptLanguage
  ): Promise<string> => {
    try {
      const result = await synthesizeUnifiedVoiceBuffer({
        text,
        voice,
        language: language ?? activeScript.idioma ?? 'es',
      });
      return result.audioDataUrl;
    } catch {
      return '';
    }
  };

  const handleSaveCustomSceneAudio = async (
    sceneId: string,
    audioDataUrl: string,
    audioSource: 'custom_mic' | 'custom_file',
    audioFileName?: string
  ): Promise<void> => {
    const targetScriptId = activeScript.id;
    let audioDurationSec: number | undefined;
    try {
      const res = await fetch(audioDataUrl);
      const arr = await res.arrayBuffer();
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        const decoded = await ctx.decodeAudioData(arr.slice(0));
        audioDurationSec = Number(decoded.duration.toFixed(3));
        await ctx.close().catch(() => {});
      }
    } catch {
      audioDurationSec = undefined;
    }
    setMediaByScript((prev) => {
      const nextScriptMap: SceneMediaMap = {
        ...(prev[targetScriptId] ?? {}),
        [sceneId]: {
          ...(prev[targetScriptId]?.[sceneId] ?? {}),
          audioDataUrl,
          audioDurationSec,
          audioSource,
          audioFileName,
        },
      };
      void saveScriptSceneMedia(targetScriptId, nextScriptMap);
      return {
        ...prev,
        [targetScriptId]: nextScriptMap,
      };
    });
  };

  const handleClearSceneAudio = (sceneId: string): void => {
    const targetScriptId = activeScript.id;
    setMediaByScript((prev) => {
      const cur = prev[targetScriptId]?.[sceneId];
      if (!cur) return prev;
      const nextScriptMap: SceneMediaMap = {
        ...(prev[targetScriptId] ?? {}),
        [sceneId]: {
          ...cur,
          audioDataUrl: undefined,
          audioDurationSec: undefined,
          voiceProfileId: undefined,
          audioSource: undefined,
          audioFileName: undefined,
        },
      };
      void saveScriptSceneMedia(targetScriptId, nextScriptMap);
      return {
        ...prev,
        [targetScriptId]: nextScriptMap,
      };
    });
  };

  const handleGenerateAllAudio = async (voice: HumanVoiceProfile): Promise<SceneMediaMap> => {
    const targetScriptId = activeScript.id;
    const scriptLang = activeScript.idioma ?? 'es';
    setIsBatchGeneratingAudio(true);

    let latestMap: SceneMediaMap = { ...(mediaByScriptRef.current[targetScriptId] ?? {}) };

    try {
      for (let i = 0; i < activeScript.escenas.length; i++) {
        const scene = activeScript.escenas[i];
        const existing = latestMap[scene.id];
        // Conservar siempre grabaciones de micrófono o archivos .mp3 subidos por el usuario
        if (
          existing?.audioDataUrl &&
          (existing.audioSource === 'custom_mic' || existing.audioSource === 'custom_file')
        ) {
          continue;
        }
        setAudioProgressLabel(
          `Sintetizando audio 48 kHz (${voice.name}) · escena ${i + 1} de ${activeScript.escenas.length}...`
        );
        const reuseUrl =
          existing?.audioDataUrl && existing.voiceProfileId === voice.id
            ? existing.audioDataUrl
            : undefined;
        const result = await synthesizeUnifiedVoiceBuffer({
          text: scene.narracion,
          voice,
          language: scriptLang,
          existingAudioDataUrl: reuseUrl,
        });
        if (!result.audioDataUrl) continue;

        latestMap = {
          ...latestMap,
          [scene.id]: {
            ...(latestMap[scene.id] ?? {}),
            audioDataUrl: result.audioDataUrl,
            audioDurationSec: result.durationSec,
            voiceProfileId: voice.id,
            audioSource: 'synth',
            audioFileName: undefined,
          },
        };

        setMediaByScript((prev) => {
          const nextScriptMap: SceneMediaMap = {
            ...(prev[targetScriptId] ?? {}),
            [scene.id]: {
              ...(prev[targetScriptId]?.[scene.id] ?? {}),
              audioDataUrl: result.audioDataUrl,
              audioDurationSec: result.durationSec,
              voiceProfileId: voice.id,
              audioSource: 'synth',
              audioFileName: undefined,
            },
          };
          void saveScriptSceneMedia(targetScriptId, nextScriptMap);
          return {
            ...prev,
            [targetScriptId]: nextScriptMap,
          };
        });
      }
      setAudioProgressLabel(null);
      return latestMap;
    } finally {
      setAudioProgressLabel(null);
      setIsBatchGeneratingAudio(false);
    }
  };

  const handleScanTrends = async (region: string, category: string) => {
    if (trendsLockRef.current || trendsCooldownSec > 0) return;
    trendsLockRef.current = true;
    setIsLoadingTrends(true);
    setTrendsError(null);
    let hitRateLimit = false;
    try {
      const result = await scanViralTrends({ region, category });
      setRadarData(result);
    } catch (err: unknown) {
      if (err instanceof GeminiApiError && err.isRateLimit) {
        hitRateLimit = true;
      }
      setTrendsError(
        err instanceof Error ? err.message : 'Error de red al consultar tendencias.'
      );
    } finally {
      setIsLoadingTrends(false);
      trendsLockRef.current = false;
      setTrendsCooldownSec(hitRateLimit ? 12 : 4);
    }
  };

  const handleUseTrend = (trend: TrendItem) => {
    const validDuration: DurationOption = [30, 60, 90, 120, 180].includes(
      trend.duracionRecomendada
    )
      ? trend.duracionRecomendada
      : 90;
    const validStyle: Style3DId = [
      'soft_storybook',
      'flat_kids',
      'paper_diorama',
      'viral_meme_3d',
      'pixar_dark',
      'ue5_realism',
      'clay_suspense',
      'stylized_thriller',
    ].includes(trend.estiloRecomendado)
      ? trend.estiloRecomendado
      : 'soft_storybook';

    const inferredAudience: AudienceId =
      validStyle === 'viral_meme_3d'
        ? 'viral_meme'
        : validStyle === 'pixar_dark' || validStyle === 'stylized_thriller'
          ? 'suspense'
          : 'educational';

    setPremise(trend.premisaLista);
    setNiche(trend.nicho);
    setAudience(inferredAudience);
    setDurationSec(validDuration);
    setStyle3D(validStyle);
    setMonetizationGoal(`${trend.porQueMonetiza} (${trend.rpmEstimado})`);
    setActiveTab('studio');

    void handleGenerateScript({
      premise: trend.premisaLista,
      niche: trend.nicho,
      audience: inferredAudience,
      durationSec: validDuration,
      style3D: validStyle,
      platform,
      aspectRatio,
      voiceProfileId: selectedVoiceId,
      narrativeBlueprint,
      monetizationGoal: `${trend.porQueMonetiza} (${trend.rpmEstimado})`,
    });
  };

  const handleRefineScene = async (scene: ScriptScene, instruction: string) => {
    const idx = activeScript.escenas.findIndex((s) => s.id === scene.id);
    const prevNarration = idx > 0 ? activeScript.escenas[idx - 1].narracion : undefined;
    const nextNarration =
      idx >= 0 && idx < activeScript.escenas.length - 1
        ? activeScript.escenas[idx + 1].narracion
        : undefined;

    const styleObj = getStyle3DById(activeScript.estilo3D);
    const updatedScene: ScriptScene = await refineSingleScene({
      scriptTitle: activeScript.tituloViral,
      style3DLabel: styleObj.label,
      guide3D: activeScript.guiaEstilo3D,
      scene,
      instruction,
      prevNarration,
      nextNarration,
    });
    setScripts((prev) =>
      prev.map((item) =>
        item.id === activeScript.id
          ? {
              ...item,
              escenas: item.escenas.map((s) => (s.id === scene.id ? updatedScene : s)),
            }
          : item
      )
    );
  };

  const handleUseFormulaInComposer = (playbook: ViralNichePlaybook) => {
    setPremise(playbook.readyTrend.premisaLista);
    setNiche(playbook.readyTrend.nicho);
    setAudience(playbook.audience);
    setDurationSec(playbook.recommendedDuration);
    setStyle3D(playbook.recommendedStyle);
    setMonetizationGoal(
      `${playbook.readyTrend.porQueMonetiza} (${playbook.rpmRange})`
    );
    setActiveTab('create');
  };

  const handleUpdateSceneInline = (sceneId: string, patch: Partial<ScriptScene>) => {
    setScripts((prev) =>
      prev.map((item) =>
        item.id === activeScript.id
          ? {
              ...item,
              escenas: item.escenas.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
            }
          : item
      )
    );
  };

  const handleUpdateSceneDuration = (sceneId: string, newDurationSec: number) => {
    const safeDur = Math.max(2, Math.min(45, Math.round(newDurationSec)));
    setScripts((prev) =>
      prev.map((item) => {
        if (item.id !== activeScript.id) return item;
        let cursor = 0;
        const recalculated = item.escenas.map((sc, idx) => {
          const prevDur = Math.max(2, sc.segundoFin - sc.segundoInicio);
          const dur = sc.id === sceneId ? safeDur : prevDur;
          const start = cursor;
          const end = start + dur;
          cursor = end;
          return {
            ...sc,
            orden: idx + 1,
            segundoInicio: start,
            segundoFin: end,
            tiempoInicio: formatSecStamp(start),
            tiempoFin: formatSecStamp(end),
          };
        });
        return {
          ...item,
          escenas: recalculated,
        };
      })
    );
  };

  const handleRegenerateSceneImage = (sceneId: string) => {
    const targetScriptId = activeScript.id;
    const prevSeed = mediaByScript[targetScriptId]?.[sceneId]?.imageSeed;
    const nextSeed = generateRandomSceneSeed(prevSeed);
    setMediaByScript((prev) => {
      const scriptMap = prev[targetScriptId] ?? {};
      const curScene = scriptMap[sceneId] ?? {};
      const nextScriptMap: SceneMediaMap = {
        ...scriptMap,
        [sceneId]: {
          ...curScene,
          imageSeed: nextSeed,
          imageDataUrl: undefined,
          altImageDataUrls: undefined,
        },
      };
      void saveScriptSceneMedia(targetScriptId, nextScriptMap);
      return {
        ...prev,
        [targetScriptId]: nextScriptMap,
      };
    });
  };

  const handleUploadSceneImage = (sceneId: string, dataUrl: string) => {
    const targetScriptId = activeScript.id;
    setMediaByScript((prev) => {
      const scriptMap = prev[targetScriptId] ?? {};
      const prevScene = scriptMap[sceneId] ?? {};
      const nextAlts = prevScene.imageDataUrl
        ? [prevScene.imageDataUrl, ...(prevScene.altImageDataUrls ?? [])].slice(0, 2)
        : prevScene.altImageDataUrls ?? [];
      const nextScriptMap: SceneMediaMap = {
        ...scriptMap,
        [sceneId]: {
          ...prevScene,
          imageDataUrl: dataUrl,
          altImageDataUrls: nextAlts,
          videoClipUrl: undefined,
          videoClipBlob: undefined,
          videoClipName: undefined,
        },
      };
      void saveScriptSceneMedia(targetScriptId, nextScriptMap);
      return {
        ...prev,
        [targetScriptId]: nextScriptMap,
      };
    });
  };

  const handleApplyHook = (hook: HookOptionPreview) => {
    const targetScriptId = activeScript.id;
    const firstSceneId = activeScript.escenas[0]?.id;

    // Extraer palabras clave frescas de la nueva frase del gancho
    const rawWords = hook.fraseApertura
      .replace(/[¿?¡!"“”.,;:()]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    const derivedKeywords = Array.from(new Set(rawWords.slice(0, 3)));
    const highlightedWord = derivedKeywords[0] ?? hook.fraseApertura.split(/\s+/)[0] ?? '';

    setScripts((prev) =>
      prev.map((item) => {
        if (item.id !== targetScriptId) return item;
        const biblePrefix = item.visualBible?.fixedPrefixPrompt || item.guiaEstilo3D || '';
        const nextScenes = item.escenas.map((sc, idx) => {
          if (idx !== 0) return sc;
          const nextImgPrompt = hook.imagePrompt
            ? hook.imagePrompt
            : biblePrefix
              ? `${biblePrefix}, ${hook.impactoVisual}, extreme cinematic depth, no text, no watermark`
              : sc.imagePrompt;
          return {
            ...sc,
            narracion: hook.fraseApertura,
            subtituloDinamico: hook.fraseApertura.split(/\s+/).slice(0, 6).join(' '),
            palabraDestacada: highlightedWord || sc.palabraDestacada,
            visualKeywords: derivedKeywords.length > 0 ? derivedKeywords : sc.visualKeywords,
            disenoSonoro: hook.sonidoRompeScroll || sc.disenoSonoro,
            promptVisual3D: hook.impactoVisual || sc.promptVisual3D,
            imagePrompt: nextImgPrompt || sc.imagePrompt,
            imageSeed: Math.floor(10000 + Math.random() * 89000),
          };
        });
        return {
          ...item,
          ganchoInicial3Seg: {
            fraseApertura: hook.fraseApertura,
            impactoVisual: hook.impactoVisual,
            sonidoRompeScroll: hook.sonidoRompeScroll,
          },
          escenas: nextScenes,
        };
      })
    );

    // Invalidar SOLO el audio en caché de la Micro-escena 1 para recalcular su voz/timing exacto sin perder el resto del proyecto
    if (firstSceneId) {
      setMediaByScript((prev) => {
        const scriptMap = prev[targetScriptId];
        if (!scriptMap || !scriptMap[firstSceneId]) return prev;
        const prevFirst = scriptMap[firstSceneId];
        const nextScriptMap: SceneMediaMap = {
          ...scriptMap,
          [firstSceneId]: {
            ...prevFirst,
            audioDataUrl: undefined,
            audioDurationSec: undefined,
            audioSource: undefined,
            audioFileName: undefined,
            voiceProfileId: undefined,
            imageSeed: Math.floor(10000 + Math.random() * 89000),
          },
        };
        void saveScriptSceneMedia(targetScriptId, nextScriptMap);
        return {
          ...prev,
          [targetScriptId]: nextScriptMap,
        };
      });
    }
  };

  const handleUploadBeatUserMedia = async (sceneId: string, file: File): Promise<void> => {
    const targetScriptId = activeScript.id;
    const prevBeat = activeScript.escenas.find((s) => s.id === sceneId);
    const prevKey = prevBeat?.userMediaKey;

    if (file.type.startsWith('video/')) {
      const ingested = await ingestUserVideoForBeat(targetScriptId, sceneId, file);
      if (prevKey && prevKey !== ingested.userMediaKey) {
        void deleteUserMediaForBeat(targetScriptId, prevKey);
      }
      objectUrlRegistry.register(targetScriptId, ingested.previewObjectUrl);

      setScripts((prev) =>
        prev.map((item) => {
          if (item.id !== targetScriptId) return item;
          return {
            ...item,
            escenas: item.escenas.map((sc) =>
              sc.id === sceneId
                ? {
                    ...sc,
                    mediaSource: 'user_video',
                    userMediaKey: ingested.userMediaKey,
                    userMediaMimeType: ingested.mimeType,
                    userMediaAspectRatio: ingested.aspectRatio,
                  }
                : sc
            ),
          };
        })
      );

      setMediaByScript((prev) => {
        const scriptMap = prev[targetScriptId] ?? {};
        const prevScene = scriptMap[sceneId] ?? {};
        if (prevScene.videoClipUrl?.startsWith('blob:')) {
          objectUrlRegistry.revokeUrl(prevScene.videoClipUrl);
        }
        const nextScriptMap: SceneMediaMap = {
          ...scriptMap,
          [sceneId]: {
            ...prevScene,
            videoClipUrl: ingested.previewObjectUrl,
            videoClipBlob: undefined,
            videoClipName: file.name,
            videoClipDurationSec: ingested.durationSec,
            imageDataUrl: undefined,
            altImageDataUrls: undefined,
          },
        };
        void saveScriptSceneMedia(targetScriptId, nextScriptMap);
        return {
          ...prev,
          [targetScriptId]: nextScriptMap,
        };
      });

      if (ingested.sizeWarning) {
        showStorageToast(ingested.sizeWarning);
      } else {
        showStorageToast(`Clip real "${file.name}" guardado en OPFS (encuadre 1.0x).`);
      }
      return;
    }

    if (file.type.startsWith('image/')) {
      const ingested = await ingestUserPhotoForBeat(targetScriptId, sceneId, file);
      if (prevKey && prevKey !== ingested.userMediaKey) {
        void deleteUserMediaForBeat(targetScriptId, prevKey);
      }

      setScripts((prev) =>
        prev.map((item) => {
          if (item.id !== targetScriptId) return item;
          return {
            ...item,
            escenas: item.escenas.map((sc) =>
              sc.id === sceneId
                ? {
                    ...sc,
                    mediaSource: 'user_photo',
                    userMediaKey: ingested.userMediaKey,
                    userMediaMimeType: ingested.mimeType,
                    userMediaAspectRatio: ingested.aspectRatio,
                  }
                : sc
            ),
          };
        })
      );

      setMediaByScript((prev) => {
        const scriptMap = prev[targetScriptId] ?? {};
        const prevScene = scriptMap[sceneId] ?? {};
        if (prevScene.videoClipUrl?.startsWith('blob:')) {
          objectUrlRegistry.revokeUrl(prevScene.videoClipUrl);
        }
        const nextScriptMap: SceneMediaMap = {
          ...scriptMap,
          [sceneId]: {
            ...prevScene,
            imageDataUrl: ingested.previewDataUrl,
            altImageDataUrls: undefined,
            videoClipUrl: undefined,
            videoClipBlob: undefined,
            videoClipName: undefined,
            videoClipDurationSec: undefined,
          },
        };
        void saveScriptSceneMedia(targetScriptId, nextScriptMap);
        return {
          ...prev,
          [targetScriptId]: nextScriptMap,
        };
      });

      showStorageToast(`Foto real "${file.name}" guardada en OPFS con TrueDepth 2.5D.`);
    }
  };

  const handleBatchUploadBeatUserMedia = async (
    files: File[],
    options: { preserveExistingUserMedia: boolean }
  ): Promise<void> => {
    const targetScript = activeScript;
    const targetScenes = options.preserveExistingUserMedia
      ? targetScript.escenas.filter((sc) => !isUserMediaBeat(sc.mediaSource))
      : targetScript.escenas;

    const count = Math.min(files.length, targetScenes.length);
    if (count === 0) {
      showStorageToast('No hay beats disponibles para asignar con la opción actual.');
      return;
    }

    const beatPatches = new Map<string, Partial<ScriptScene>>();
    const mediaPatches: SceneMediaMap = {};
    let oversizedCount = 0;

    for (let i = 0; i < count; i++) {
      const file = files[i];
      const beat = targetScenes[i];
      const prevKey = beat.userMediaKey;

      if (file.type.startsWith('video/')) {
        const ingested = await ingestUserVideoForBeat(targetScript.id, beat.id, file);
        if (ingested.sizeWarning) oversizedCount += 1;
        if (prevKey && prevKey !== ingested.userMediaKey) {
          void deleteUserMediaForBeat(targetScript.id, prevKey);
        }
        objectUrlRegistry.register(targetScript.id, ingested.previewObjectUrl);
        beatPatches.set(beat.id, {
          mediaSource: 'user_video',
          userMediaKey: ingested.userMediaKey,
          userMediaMimeType: ingested.mimeType,
          userMediaAspectRatio: ingested.aspectRatio,
        });
        mediaPatches[beat.id] = {
          videoClipUrl: ingested.previewObjectUrl,
          videoClipBlob: undefined,
          videoClipName: file.name,
          videoClipDurationSec: ingested.durationSec,
          imageDataUrl: undefined,
          altImageDataUrls: undefined,
        };
      } else if (file.type.startsWith('image/')) {
        const ingested = await ingestUserPhotoForBeat(targetScript.id, beat.id, file);
        if (prevKey && prevKey !== ingested.userMediaKey) {
          void deleteUserMediaForBeat(targetScript.id, prevKey);
        }
        beatPatches.set(beat.id, {
          mediaSource: 'user_photo',
          userMediaKey: ingested.userMediaKey,
          userMediaMimeType: ingested.mimeType,
          userMediaAspectRatio: ingested.aspectRatio,
        });
        mediaPatches[beat.id] = {
          imageDataUrl: ingested.previewDataUrl,
          altImageDataUrls: undefined,
          videoClipUrl: undefined,
          videoClipBlob: undefined,
          videoClipName: undefined,
          videoClipDurationSec: undefined,
        };
      }
    }

    if (beatPatches.size === 0) return;

    setScripts((prev) =>
      prev.map((item) => {
        if (item.id !== targetScript.id) return item;
        return {
          ...item,
          escenas: item.escenas.map((sc) => {
            const patch = beatPatches.get(sc.id);
            return patch ? { ...sc, ...patch } : sc;
          }),
        };
      })
    );

    setMediaByScript((prev) => {
      const scriptMap = prev[targetScript.id] ?? {};
      const nextMap: SceneMediaMap = { ...scriptMap };
      for (const [sceneId, patch] of Object.entries(mediaPatches)) {
        const existing = nextMap[sceneId] ?? {};
        if (existing.videoClipUrl?.startsWith('blob:') && existing.videoClipUrl !== patch.videoClipUrl) {
          objectUrlRegistry.revokeUrl(existing.videoClipUrl);
        }
        nextMap[sceneId] = {
          ...existing,
          ...patch,
        };
      }
      void saveScriptSceneMedia(targetScript.id, nextMap);
      return {
        ...prev,
        [targetScript.id]: nextMap,
      };
    });

    showStorageToast(
      oversizedCount > 0
        ? `${beatPatches.size} archivos asignados en OPFS (${oversizedCount} clip(s) >150 MB).`
        : `${beatPatches.size} archivos reales asignados a los beats en OPFS.`
    );
  };

  const handleRevertBeatToAi = async (sceneId: string): Promise<void> => {
    const targetScriptId = activeScript.id;
    const targetScene = activeScript.escenas.find((s) => s.id === sceneId);
    if (targetScene?.userMediaKey) {
      await deleteUserMediaForBeat(targetScriptId, targetScene.userMediaKey);
    }

    setScripts((prev) =>
      prev.map((item) => {
        if (item.id !== targetScriptId) return item;
        return {
          ...item,
          escenas: item.escenas.map((sc) =>
            sc.id === sceneId
              ? {
                  ...sc,
                  mediaSource: 'ai_generated',
                  userMediaKey: undefined,
                  userMediaMimeType: undefined,
                  userMediaAspectRatio: undefined,
                }
              : sc
          ),
        };
      })
    );

    setMediaByScript((prev) => {
      const scriptMap = prev[targetScriptId] ?? {};
      const prevScene = scriptMap[sceneId];
      if (!prevScene) return prev;
      if (prevScene.videoClipUrl?.startsWith('blob:')) {
        objectUrlRegistry.revokeUrl(prevScene.videoClipUrl);
      }
      const nextScriptMap: SceneMediaMap = {
        ...scriptMap,
        [sceneId]: {
          ...prevScene,
          videoClipUrl: undefined,
          videoClipBlob: undefined,
          videoClipName: undefined,
          videoClipDurationSec: undefined,
          imageDataUrl: undefined,
          altImageDataUrls: undefined,
        },
      };
      void saveScriptSceneMedia(targetScriptId, nextScriptMap);
      return {
        ...prev,
        [targetScriptId]: nextScriptMap,
      };
    });
  };

  const handleUploadSceneClip = (sceneId: string, file: File) => {
    void handleUploadBeatUserMedia(sceneId, file);
  };

  const handleClearSceneVisual = (sceneId: string) => {
    void handleRevertBeatToAi(sceneId);
  };

  const handleOptimizeFlowPrompts = async (targetAspectRatio: VideoAspectRatio): Promise<void> => {
    if (isOptimizingFlowPrompts) return;
    const targetScriptId = activeScript.id;
    setIsOptimizingFlowPrompts(true);
    try {
      const map: Record<string, string> = await generateFlowPromptsForScript({
        script: activeScript,
        aspectRatio: targetAspectRatio,
      });
      setMediaByScript((prev) => {
        const scriptMap = prev[targetScriptId] ?? {};
        const nextScriptMap: SceneMediaMap = { ...scriptMap };
        for (const [sceneId, promptEn] of Object.entries(map)) {
          nextScriptMap[sceneId] = {
            ...(nextScriptMap[sceneId] ?? {}),
            flowPromptEn: promptEn,
          };
        }
        void saveScriptSceneMedia(targetScriptId, nextScriptMap);
        return {
          ...prev,
          [targetScriptId]: nextScriptMap,
        };
      });
    } finally {
      setIsOptimizingFlowPrompts(false);
    }
  };

  const handlePromoteSceneImage = (sceneId: string, altIndex: number) => {
    const targetScriptId = activeScript.id;
    setMediaByScript((prev) => {
      const scriptMap = prev[targetScriptId] ?? {};
      const prevScene = scriptMap[sceneId];
      if (!prevScene?.altImageDataUrls?.[altIndex]) return prev;
      const promoted = prevScene.altImageDataUrls[altIndex];
      const nextAlts = [...prevScene.altImageDataUrls];
      if (prevScene.imageDataUrl) {
        nextAlts[altIndex] = prevScene.imageDataUrl;
      } else {
        nextAlts.splice(altIndex, 1);
      }
      const nextScriptMap: SceneMediaMap = {
        ...scriptMap,
        [sceneId]: {
          ...prevScene,
          imageDataUrl: promoted,
          altImageDataUrls: nextAlts,
        },
      };
      void saveScriptSceneMedia(targetScriptId, nextScriptMap);
      return {
        ...prev,
        [targetScriptId]: nextScriptMap,
      };
    });
  };

  const handleRemoveSceneImage = (sceneId: string, index: number) => {
    const targetScriptId = activeScript.id;
    setMediaByScript((prev) => {
      const scriptMap = prev[targetScriptId] ?? {};
      const prevScene = scriptMap[sceneId];
      if (!prevScene) return prev;
      let nextPrimary = prevScene.imageDataUrl;
      const nextAlts = [...(prevScene.altImageDataUrls ?? [])];
      if (index === 0) {
        nextPrimary = nextAlts.shift();
      } else {
        nextAlts.splice(index - 1, 1);
      }
      const nextScriptMap: SceneMediaMap = {
        ...scriptMap,
        [sceneId]: {
          ...prevScene,
          imageDataUrl: nextPrimary,
          altImageDataUrls: nextAlts,
        },
      };
      void saveScriptSceneMedia(targetScriptId, nextScriptMap);
      return {
        ...prev,
        [targetScriptId]: nextScriptMap,
      };
    });
  };

  const handleAddScene = () => {
    setScripts((prev) =>
      prev.map((item) => {
        if (item.id !== activeScript.id) return item;
        const lastScene = item.escenas[item.escenas.length - 1];
        const newScene: ScriptScene = {
          id: `scene-${Date.now()}`,
          orden: item.escenas.length + 1,
          tiempoInicio: lastScene?.tiempoFin ?? '0:00',
          tiempoFin: formatSecStamp((lastScene?.segundoFin ?? 0) + 10),
          segundoInicio: lastScene?.segundoFin ?? 0,
          segundoFin: (lastScene?.segundoFin ?? 0) + 10,
          fase: 'Desarrollo',
          esGiro30s: false,
          narracion: 'Escribe aquí la narración de esta nueva escena para continuar tu historia.',
          subtituloDinamico: 'Nueva escena de la historia',
          palabraDestacada: 'Nueva',
          promptVisual3D: `${item.guiaEstilo3D}, nueva escena acorde a la historia, encuadre claro y atractivo, iluminación cuidada`,
          movimientoCamara: 'Zoom suave hacia el sujeto principal',
          transicionRapida: 'Corte limpio',
          disenoSonoro: 'Transición suave',
        };
        const updatedScenes = recalculateSceneTimings(
          [...item.escenas, newScene],
          item.duracionSegundos
        );
        return { ...item, escenas: updatedScenes };
      })
    );
  };

  const handleDeleteScene = (sceneId: string) => {
    setScripts((prev) =>
      prev.map((item) => {
        if (item.id !== activeScript.id || item.escenas.length <= 1) return item;
        const remaining = item.escenas.filter((s) => s.id !== sceneId);
        return {
          ...item,
          escenas: recalculateSceneTimings(remaining, item.duracionSegundos),
        };
      })
    );
  };

  const handleMoveScene = (sceneId: string, direction: 'up' | 'down') => {
    setScripts((prev) =>
      prev.map((item) => {
        if (item.id !== activeScript.id) return item;
        const idx = item.escenas.findIndex((s) => s.id === sceneId);
        if (idx === -1) return item;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= item.escenas.length) return item;
        const copy = [...item.escenas];
        const [moved] = copy.splice(idx, 1);
        copy.splice(targetIdx, 0, moved);
        return {
          ...item,
          escenas: recalculateSceneTimings(copy, item.duracionSegundos),
        };
      })
    );
  };

  const handleTranslateScript = async (targetLanguage: ScriptLanguage) => {
    setIsTranslating(true);
    try {
      const translated: ViralScript = await translateViralScript({
        script: activeScript,
        targetLanguage,
      });

      // Conservar todas las imágenes ya generadas para el guion doblado (sin audios del idioma anterior)
      const sourceMedia = mediaByScript[activeScript.id];
      if (sourceMedia) {
        const clonedVisualMedia: SceneMediaMap = {};
        for (const sc of translated.escenas) {
          const prevAsset = sourceMedia[sc.id];
          if (prevAsset?.imageDataUrl || prevAsset?.altImageDataUrls?.length) {
            clonedVisualMedia[sc.id] = {
              imageDataUrl: prevAsset.imageDataUrl,
              altImageDataUrls: prevAsset.altImageDataUrls
                ? [...prevAsset.altImageDataUrls]
                : undefined,
            };
          }
        }
        if (Object.keys(clonedVisualMedia).length > 0) {
          setMediaByScript((prev) => ({
            ...prev,
            [translated.id]: clonedVisualMedia,
          }));
          void saveScriptSceneMedia(translated.id, clonedVisualMedia);
        }
      }

      setScripts((prev) => [translated, ...prev]);
      setActiveScriptId(translated.id);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleOptimizeWeakBeats = async (weakBeatIndices: number[]) => {
    if (isOptimizingWeakBeats || weakBeatIndices.length === 0) return;
    const targetScriptId = activeScript.id;
    setIsOptimizingWeakBeats(true);
    try {
      const data = await optimizeWeakBeats({
        script: activeScript,
        weakBeatIndices,
      });
      const updatedScript: ViralScript = data.script;
      const optimizedIndices: number[] =
        data.optimizedIndices.length > 0 ? data.optimizedIndices : weakBeatIndices;

      setScripts((prev) =>
        prev.map((item) => (item.id === targetScriptId ? updatedScript : item))
      );

      // Invalidar únicamente el audio cacheado de los beats reescritos para recalcular voz/timing sin tocar el resto
      const modifiedIds = new Set(
        optimizedIndices
          .map((idx) => updatedScript.escenas[idx]?.id)
          .filter((id): id is string => Boolean(id))
      );
      if (modifiedIds.size > 0) {
        setMediaByScript((prev) => {
          const scriptMap = prev[targetScriptId];
          if (!scriptMap) return prev;
          const nextMap: SceneMediaMap = { ...scriptMap };
          for (const sceneId of modifiedIds) {
            const cur = nextMap[sceneId];
            if (!cur) continue;
            nextMap[sceneId] = {
              ...cur,
              audioDataUrl: undefined,
              audioDurationSec: undefined,
              audioSource: undefined,
              audioFileName: undefined,
              voiceProfileId: undefined,
            };
          }
          void saveScriptSceneMedia(targetScriptId, nextMap);
          return {
            ...prev,
            [targetScriptId]: nextMap,
          };
        });
      }
    } finally {
      setIsOptimizingWeakBeats(false);
    }
  };

  const handleGenerateSeriesNext = async (
    targetScript?: ViralScript,
    options?: { includeMicroRecap?: boolean }
  ) => {
    const sourceScript = targetScript ?? activeScript;
    setIsGeneratingSeries(true);
    setCreatingSequelId(sourceScript.id);
    try {
      const baseSaga = ensureSagaBibleForScript(sourceScript);
      if (!sourceScript.sagaId || !sourceScript.episodeNumber) {
        setScripts((prev) =>
          prev.map((s) =>
            s.id === sourceScript.id
              ? {
                  ...s,
                  sagaId: baseSaga.sagaId,
                  episodeNumber: s.episodeNumber ?? s.serieNumero ?? 1,
                }
              : s
          )
        );
      }

      const generatedNext = await generateSeriesNextEpisode({
        script: {
          ...sourceScript,
          sagaId: baseSaga.sagaId,
          episodeNumber: sourceScript.episodeNumber ?? sourceScript.serieNumero ?? 1,
        },
        sagaBible: baseSaga,
        includeMicroRecap: Boolean(options?.includeMicroRecap),
      });
      const nextPart: ViralScript = {
        ...generatedNext,
        sagaId: generatedNext.sagaId || baseSaga.sagaId,
        episodeNumber:
          generatedNext.episodeNumber ??
          generatedNext.serieNumero ??
          (sourceScript.episodeNumber ?? sourceScript.serieNumero ?? 1) + 1,
      };
      appendEpisodeToSagaBible(baseSaga, nextPart);
      setSagas(loadAllSagas());

      setScripts((prev) => [nextPart, ...prev]);
      setActiveScriptId(nextPart.id);
      setPremise(nextPart.premisa);
      if (nextPart.formatoVideo) setAspectRatio(nextPart.formatoVideo);
      if (targetScript) {
        setActiveTab('studio');
      }
    } finally {
      setIsGeneratingSeries(false);
      setCreatingSequelId(null);
    }
  };

  const handleSaveChannelPreset = (name: string) => {
    const preset: ChannelPreset = {
      id: `preset-${Date.now()}`,
      name,
      audience,
      style3D,
      aspectRatio,
      platform,
      durationSec,
      voiceProfileId: selectedVoiceId,
      musicId: backgroundMusicId,
      subtitleConfig: { ...subtitleConfig },
    };
    setChannelPresets((prev) => [preset, ...prev].slice(0, 8));
  };

  const handleApplyChannelPreset = (preset: ChannelPreset) => {
    setAudience(preset.audience);
    setStyle3D(preset.style3D);
    setAspectRatio(preset.aspectRatio);
    setPlatform(preset.platform);
    setDurationSec(preset.durationSec);
    setSelectedVoiceId(preset.voiceProfileId);
    setBackgroundMusicId(preset.musicId);
    setSubtitleConfig({ ...preset.subtitleConfig });
  };

  const handleDeleteChannelPreset = (id: string) => {
    setChannelPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const touchProjectLastOpened = useCallback((projectId: string) => {
    const now = Date.now();
    setScripts((prev) =>
      prev.map((s) => (s.id === projectId ? { ...s, lastOpenedAt: now } : s))
    );
  }, []);

  const handleVideoCreated = (vid: GeneratedVideoItem, blob: Blob) => {
    const enrichedVid: GeneratedVideoItem = {
      ...vid,
      scriptId: vid.scriptId ?? activeScriptIdRef.current,
    };
    objectUrlRegistry.register(enrichedVid.scriptId || 'rendered-videos', enrichedVid.videoUrl);
    setGeneratedVideos((prev) => [enrichedVid, ...prev]);
    void saveRenderedVideo(enrichedVid, blob);

    if (enrichedVid.scriptId) {
      const targetId = enrichedVid.scriptId;
      const now = Date.now();
      setScripts((prev) =>
        prev.map((s) =>
          s.id === targetId
            ? { ...s, isDraft: false, hasBeenExported: true, lastOpenedAt: now }
            : s
        )
      );
    }
  };

  const handleDeleteVideo = (videoId: string) => {
    setGeneratedVideos((prev) => {
      const found = prev.find((v) => v.id === videoId);
      if (found?.videoUrl?.startsWith('blob:')) {
        objectUrlRegistry.revokeUrl(found.videoUrl);
      }
      return prev.filter((v) => v.id !== videoId);
    });
    void deleteRenderedVideo(videoId);
  };

  const handleDuplicateScript = (script: ViralScript) => {
    const now = Date.now();
    const copy: ViralScript = {
      ...script,
      id: `script-${now}`,
      creadoEn: new Date(now).toISOString(),
      tituloViral: `${script.tituloViral} (Copia)`,
      isDraft: true,
      hasBeenExported: false,
      isFavorite: false,
      lastOpenedAt: now,
      estimatedSizeBytes: undefined,
      sagaId: undefined,
    };
    setScripts((prev) => [copy, ...prev]);
    setActiveScriptId(copy.id);
  };

  const handleToggleFavoriteProject = (projectId: string) => {
    setScripts((prev) =>
      prev.map((s) => (s.id === projectId ? { ...s, isFavorite: !s.isFavorite } : s))
    );
  };

  const handleDeleteProjectAtomically = async (
    projectId: string,
    options?: { deleteEmptySaga?: boolean }
  ): Promise<DeletionReport> => {
    const report = await deleteProjectAtomically(projectId, options);
    await refreshStorageTelemetry();
    if (report.reclaimedBytes > 0) {
      showStorageToast(
        `Proyecto eliminado · ${formatBytes(report.reclaimedBytes)} liberados del almacenamiento local`
      );
    }
    return report;
  };

  const handleDeleteSagaCompletely = async (sagaId: string): Promise<DeletionReport> => {
    const report = await deleteSagaCompletely(sagaId);
    await refreshStorageTelemetry();
    showStorageToast(
      `Saga eliminada (${report.deletedProjectIds.length} ep.) · ${formatBytes(report.reclaimedBytes)} liberados`
    );
    return report;
  };

  const handleBulkDeleteProjects = async (
    projectIds: string[],
    options?: { deleteEmptySaga?: boolean }
  ): Promise<DeletionReport> => {
    const report = await deleteProjectsBatch(projectIds, options);
    await refreshStorageTelemetry();
    showStorageToast(
      `Limpieza masiva: ${report.deletedProjectIds.length} proyectos eliminados · ${formatBytes(report.reclaimedBytes)} liberados`
    );
    return report;
  };

  const handleRunManualGc = async (): Promise<GarbageCollectionReport> => {
    setIsRunningGc(true);
    try {
      const report = await runStartupGarbageCollection(activeScriptIdRef.current);
      setLastGcReport(report);
      await refreshStorageTelemetry();
      if (report.orphanedEntriesRemoved > 0 || report.brokenSagaRefsFixed > 0) {
        showStorageToast(
          `Limpieza profunda: ${formatBytes(report.reclaimedBytes)} liberados (${report.orphanedEntriesRemoved} huérfanos, ${report.brokenSagaRefsFixed} refs reparadas)`
        );
      } else {
        showStorageToast('Limpieza profunda completada: almacenamiento local optimizado (0 huérfanos)');
      }
      return report;
    } finally {
      setIsRunningGc(false);
    }
  };

  const handleClearAiModelsCache = async (): Promise<void> => {
    const res = await clearAiModelsCache();
    await refreshStorageTelemetry();
    showStorageToast(
      res.freedBytes > 0
        ? `Caché de Modelos IA limpiada (${formatBytes(res.freedBytes)} liberados)`
        : 'Caché de Modelos IA limpiada'
    );
  };

  const projectSummaries: ProjectSummary[] = useMemo(() => {
    const sizeMap = storageTelemetry?.projectSizeMap;
    return scripts.map((script) => buildProjectSummary(script, sizeMap?.[script.id]));
  }, [scripts, storageTelemetry?.projectSizeMap]);

  const handleCopyOrShare = async () => {
    const content = buildAllOrganizedClipboard(activeScript);
    if (supportsNativeShare && window.innerWidth < 768) {
      try {
        await navigator.share({
          title: activeScript.tituloViral,
          text: content,
        });
        return;
      } catch {
        // Si cancela, copiar al portapapeles
      }
    }
    try {
      await navigator.clipboard.writeText(content);
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 2000);
    } catch {
      // Silencioso
    }
  };

  const navItems: Array<{
    id: WorkspaceTab;
    label: string;
    mobileLabel: string;
    icon: typeof Sparkles;
  }> = [
    { id: 'create', label: 'Crear', mobileLabel: 'Crear', icon: Sparkles },
    { id: 'studio', label: 'Guion', mobileLabel: 'Guion', icon: Clapperboard },
    { id: 'simulator', label: 'Video y Fotos', mobileLabel: 'Video', icon: Film },
    { id: 'trends', label: 'Tendencias', mobileLabel: 'Radar', icon: Radar },
    { id: 'library', label: 'Biblioteca', mobileLabel: 'Archivo', icon: FolderKanban },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col transition-colors">
      {/* Barra superior 3 zonas (Escritorio/Tablet 64px, Móvil compacto 56px) */}
      <header className="h-14 md:h-16 px-4 sm:px-6 lg:px-8 border-b border-[var(--border-subtle)] bg-[var(--header-bg)] backdrop-blur-md sticky top-0 z-30">
        <div className="h-full max-w-[1400px] mx-auto flex items-center justify-between gap-4 sm:gap-8">
          {/* Zona 1: Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            aria-label="Gortex Inicio"
            className="inline-flex items-center gap-2 font-display text-lg font-extrabold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="w-6 h-6 rounded-md bg-[#F97316] text-white inline-flex items-center justify-center text-xs font-black tracking-tighter">
              G
            </span>
            <span>
              Gor<span className="text-[#F97316]">tex</span>
            </span>
          </button>

          {/* Zona 2: Enlaces de navegación limpia (Escritorio y Tablet) */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Navegación principal">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-[var(--text-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{item.label}</span>
                  {active && (
                    <span className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-[#F97316]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zona 3: Interruptor Claro/Oscuro + 1 acción primaria */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              title={theme === 'light' ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro'}
              aria-label={theme === 'light' ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro'}
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-[var(--text-body)]" />
              ) : (
                <Sun className="w-4 h-4 text-[#F97316]" />
              )}
            </button>

            {activeTab === 'create' ? (
              <button
                type="button"
                onClick={() => {
                  setStudioSubMode('story_video');
                  setActiveTab('simulator');
                }}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Film className="w-3.5 h-3.5" />
                <span>Estudio de video</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleCopyOrShare()}
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {headerCopied ? (
                  <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                ) : supportsNativeShare ? (
                  <Share2 className="w-3.5 h-3.5 md:hidden" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {!headerCopied && supportsNativeShare && (
                  <Copy className="w-3.5 h-3.5 hidden md:inline" />
                )}
                <span>{headerCopied ? 'Copiado' : 'Copiar todo'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Contenido principal adaptable a celular, tablet y escritorio */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-20 md:py-7">
        {activeTab === 'create' && (
          <IdeaComposerHome
            studioMode={studioMode}
            commercialSector={commercialSector}
            commercialBrief={commercialBrief}
            pendingComposerMedia={pendingComposerMedia}
            premise={premise}
            niche={niche}
            audience={audience}
            durationSec={durationSec}
            style3D={style3D}
            platform={platform}
            aspectRatio={aspectRatio}
            selectedVoiceId={selectedVoiceId}
            monetizationGoal={monetizationGoal}
            narrativeBlueprint={narrativeBlueprint}
            isGenerating={isGenerating}
            cooldownSec={scriptCooldownSec}
            errorMessage={genError}
            recentScripts={scripts}
            channelPresets={channelPresets}
            onChangeStudioMode={handleChangeStudioMode}
            onChangeCommercialSector={setCommercialSector}
            onChangeCommercialBrief={setCommercialBrief}
            onChangePendingComposerMedia={setPendingComposerMedia}
            onChangePremise={setPremise}
            onChangeNiche={setNiche}
            onChangeAudience={setAudience}
            onChangeDuration={setDurationSec}
            onChangeStyle3D={setStyle3D}
            onChangePlatform={setPlatform}
            onChangeAspectRatio={setAspectRatio}
            onChangeVoiceId={setSelectedVoiceId}
            onChangeMonetizationGoal={setMonetizationGoal}
            onChangeNarrativeBlueprint={setNarrativeBlueprint}
            onSaveChannelPreset={handleSaveChannelPreset}
            onApplyChannelPreset={handleApplyChannelPreset}
            onDeleteChannelPreset={handleDeleteChannelPreset}
            onGenerateOnly={(payload) => void handleGenerateScript(payload)}
            onGenerateAndProduce={(payload) =>
              void handleGenerateScript(payload, { autoProduceVideo: true })
            }
            onOpenTool={(tool) => {
              if (tool === 'trends') {
                setActiveTab('trends');
              } else {
                setStudioSubMode(tool);
                setActiveTab('simulator');
              }
            }}
            onOpenProGuide={() => setIsProGuideOpen(true)}
            onSelectRecentScript={(sc, goToVideo) => {
              setActiveScriptId(sc.id);
              setPremise(sc.premisa);
              if (sc.formatoVideo) setAspectRatio(sc.formatoVideo);
              if (sc.vozPreferidaId) setSelectedVoiceId(sc.vozPreferidaId);
              if (sc.studioMode) setStudioMode(sc.studioMode);
              if (sc.commercialSector) setCommercialSector(sc.commercialSector);
              if (sc.commercialBrief) setCommercialBrief(sc.commercialBrief);
              if (isCommercialStudioMode(sc.studioMode)) {
                setBackgroundMusicId('commercial_lounge');
              }
              if (goToVideo) {
                setStudioSubMode('story_video');
                setActiveTab('simulator');
              } else {
                setActiveTab('studio');
              }
            }}
          />
        )}

        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="xl:col-span-4 xl:sticky xl:top-22">
              <ScriptGeneratorPanel
                studioMode={studioMode}
                commercialSector={commercialSector}
                commercialBrief={commercialBrief}
                premise={premise}
                niche={niche}
                audience={audience}
                durationSec={durationSec}
                style3D={style3D}
                platform={platform}
                monetizationGoal={monetizationGoal}
                narrativeBlueprint={narrativeBlueprint}
                isGenerating={isGenerating}
                cooldownSec={scriptCooldownSec}
                errorMessage={genError}
                onChangeStudioMode={handleChangeStudioMode}
                onChangeCommercialSector={setCommercialSector}
                onChangeCommercialBrief={setCommercialBrief}
                onChangePremise={setPremise}
                onChangeNiche={setNiche}
                onChangeAudience={setAudience}
                onChangeDuration={setDurationSec}
                onChangeStyle3D={setStyle3D}
                onChangePlatform={setPlatform}
                onChangeMonetizationGoal={setMonetizationGoal}
                onChangeNarrativeBlueprint={setNarrativeBlueprint}
                onSubmit={(payload) => void handleGenerateScript(payload)}
              />
            </div>
            <div className="xl:col-span-8 min-w-0">
              <ScriptBlueprintView
                script={activeScript}
                sceneMedia={activeSceneMedia}
                aspectRatio={aspectRatio}
                isGenerating={isGenerating}
                isTranslating={isTranslating}
                isOptimizingWeakBeats={isOptimizingWeakBeats}
                isGeneratingSeries={isGeneratingSeries}
                generatingArtIds={generatingArtIds}
                isBatchGeneratingArt={isBatchGeneratingArt}
                sagaBible={sagas.find(
                  (sg) => sg.sagaId === activeScript.sagaId || sg.episodeIds.includes(activeScript.id)
                )}
                onOpenAudiovisual={() => {
                  setStudioSubMode('story_video');
                  setActiveTab('simulator');
                }}
                onApplyHook={handleApplyHook}
                onOptimizeWeakBeats={handleOptimizeWeakBeats}
                onGenerateSceneArt={handleGenerateSceneArt}
                onGenerateAllSceneArt={() => handleGenerateAllSceneArt(aspectRatio)}
                onUploadSceneImage={handleUploadSceneImage}
                onUploadBeatUserMedia={handleUploadBeatUserMedia}
                onBatchUploadBeatUserMedia={handleBatchUploadBeatUserMedia}
                onRevertBeatToAi={handleRevertBeatToAi}
                onPromoteSceneImage={handlePromoteSceneImage}
                onRemoveSceneImage={handleRemoveSceneImage}
                onRefineScene={handleRefineScene}
                onUpdateSceneInline={handleUpdateSceneInline}
                onUpdateSceneDuration={handleUpdateSceneDuration}
                onRegenerateSceneImage={handleRegenerateSceneImage}
                onOpenProGuide={() => setIsProGuideOpen(true)}
                onAddScene={handleAddScene}
                onDeleteScene={handleDeleteScene}
                onMoveScene={handleMoveScene}
                onTranslateScript={handleTranslateScript}
                onGenerateSeriesNext={(opts) => handleGenerateSeriesNext(undefined, opts)}
              />
            </div>
          </div>
        )}

        {activeTab === 'simulator' && (
          <SubtitleSimulator
            script={activeScript}
            sceneMedia={activeSceneMedia}
            aspectRatio={aspectRatio}
            selectedVoiceId={selectedVoiceId}
            backgroundMusicId={backgroundMusicId}
            subtitleConfig={subtitleConfig}
            studioSubMode={studioSubMode}
            autoProduceNonce={autoProduceNonce}
            generatedVideos={generatedVideos}
            generatingArtIds={generatingArtIds}
            isBatchGeneratingArt={isBatchGeneratingArt}
            isOptimizingFlowPrompts={isOptimizingFlowPrompts}
            isBatchGeneratingAudio={isBatchGeneratingAudio}
            audioProgressLabel={audioProgressLabel}
            onChangeAspectRatio={setAspectRatio}
            onChangeVoiceId={setSelectedVoiceId}
            onChangeBackgroundMusicId={setBackgroundMusicId}
            onChangeSubtitleConfig={setSubtitleConfig}
            onChangeStudioSubMode={setStudioSubMode}
            onVideoCreated={handleVideoCreated}
            onDeleteVideo={handleDeleteVideo}
            onUploadSceneImage={handleUploadSceneImage}
            onUploadSceneClip={handleUploadSceneClip}
            onClearSceneVisual={handleClearSceneVisual}
            onOptimizeFlowPrompts={handleOptimizeFlowPrompts}
            onGenerateSceneArt={handleGenerateSceneArt}
            onGenerateAllSceneArt={handleGenerateAllSceneArt}
            onGenerateAllAudio={handleGenerateAllAudio}
            onGenerateSingleVoiceLine={handleGenerateSingleVoiceLine}
            onSaveCustomSceneAudio={handleSaveCustomSceneAudio}
            onClearSceneAudio={handleClearSceneAudio}
            onRegenerateSceneImage={handleRegenerateSceneImage}
            onOpenProGuide={() => setIsProGuideOpen(true)}
            onBackToEditor={() => setActiveTab('studio')}
          />
        )}

        {activeTab === 'trends' && (
          <TrendRadarView
            radarData={radarData}
            isLoading={isLoadingTrends}
            cooldownSec={trendsCooldownSec}
            errorMessage={trendsError}
            onScanTrends={handleScanTrends}
            onUseTrend={handleUseTrend}
            onUseFormulaInComposer={handleUseFormulaInComposer}
          />
        )}

        {activeTab === 'library' && (
          <ScriptLibraryView
            summaries={projectSummaries}
            sagas={sagas}
            activeScriptId={activeScript.id}
            telemetry={storageTelemetry}
            isLoadingTelemetry={isLoadingTelemetry}
            isRunningGc={isRunningGc}
            lastGcReport={lastGcReport}
            onSelectProject={(projectId) => {
              const sc = scripts.find((item) => item.id === projectId);
              if (!sc) return;
              touchProjectLastOpened(sc.id);
              setActiveScriptId(sc.id);
              setPremise(sc.premisa);
              if (sc.formatoVideo) setAspectRatio(sc.formatoVideo);
              setActiveTab('studio');
            }}
            onSimulateProject={(projectId) => {
              const sc = scripts.find((item) => item.id === projectId);
              if (!sc) return;
              touchProjectLastOpened(sc.id);
              setActiveScriptId(sc.id);
              if (sc.formatoVideo) setAspectRatio(sc.formatoVideo);
              setStudioSubMode('story_video');
              setActiveTab('simulator');
            }}
            onDuplicateProject={(projectId) => {
              const sc = scripts.find((item) => item.id === projectId);
              if (sc) handleDuplicateScript(sc);
            }}
            onExportPromptsTxt={(projectId) => {
              const sc = scripts.find((item) => item.id === projectId);
              if (!sc) return;
              const mediaMap = mediaByScript[sc.id] ?? {};
              const ratio = sc.formatoVideo || '9:16';
              const content = buildCompleteScriptAndFlowPackTxt(sc, mediaMap, ratio);
              triggerFileDownload(
                `${slugifyFilename(sc.tituloViral)}-prompts-google-flow.txt`,
                content,
                'text/plain;charset=utf-8'
              );
            }}
            onExportSrt={(projectId) => {
              const sc = scripts.find((item) => item.id === projectId);
              if (!sc) return;
              triggerFileDownload(
                `${slugifyFilename(sc.tituloViral)}.srt`,
                buildSrtContent(sc),
                'text/plain;charset=utf-8'
              );
            }}
            onToggleFavorite={handleToggleFavoriteProject}
            onDeleteProjectAtomically={handleDeleteProjectAtomically}
            onDeleteSagaCompletely={handleDeleteSagaCompletely}
            onBulkDeleteProjects={handleBulkDeleteProjects}
            onRunManualGc={handleRunManualGc}
            onClearAiModelsCache={handleClearAiModelsCache}
            onCreateSequel={(projectId, opts) => {
              const sc = scripts.find((item) => item.id === projectId);
              if (sc) void handleGenerateSeriesNext(sc, opts);
            }}
            creatingSequelId={creatingSequelId}
            onCreateNew={() => setActiveTab('create')}
          />
        )}
      </main>

      <ProFlowGuideModal isOpen={isProGuideOpen} onClose={() => setIsProGuideOpen(false)} />

      {/* Notificación discreta de limpieza automática / purga */}
      {storageToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 md:bottom-5 right-4 sm:right-6 z-50 max-w-sm rounded-lg bg-[var(--bg-card)] border border-[#F97316]/45 shadow-xl px-4 py-3 flex items-center gap-2.5 text-xs text-[var(--text-primary)]"
        >
          <Sparkles className="w-4 h-4 text-[#F97316] shrink-0" />
          <span className="leading-snug">{storageToast}</span>
        </div>
      )}

      {/* Navegación inferior ergonómica en zona del pulgar para celular (< md, 56px altura) */}
      <nav
        aria-label="Navegación móvil"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-[var(--header-bg)] backdrop-blur-md border-t border-[var(--border-subtle)] grid grid-cols-5"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                active ? 'text-[#F97316]' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-medium tracking-tight leading-none">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
