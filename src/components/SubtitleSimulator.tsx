import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns2,
  Copy,
  Download,
  FileText,
  Film,
  Layers,
  LayoutTemplate,
  Loader2,
  Lock,
  Maximize2,
  Mic,
  Minimize2,
  Music,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { isCommercialStudioMode } from '../data/commercialPresets';
import { getStyle3DById, HUMAN_VOICE_PROFILES } from '../data/presets';
import { USER_VIDEO_SOFT_LIMIT_BYTES } from '../services/userMediaIngestionService';
import type {
  BackgroundMusicId,
  GeneratedVideoItem,
  HumanVoiceProfile,
  RenderQualityMode,
  SafeZonePlatform,
  SceneMediaMap,
  ScriptScene,
  ShotVariationType,
  SubtitleConfig,
  SubtitlePositionY,
  SubtitleSize,
  SubtitleStyleId,
  VideoAspectRatio,
  VideoExportFormat,
  ViralScript,
} from '../types';
import {
  blobToDataUrl,
  stopCurrentAudio,
  unlockAudioPlayback,
} from '../utils/audioPlayer';
import {
  buildCompleteScriptAndFlowPackTxt,
  slugifyFilename,
  triggerFileDownload,
} from '../utils/exportScript';
import {
  buildAllGoogleFlowPromptsBundle,
  buildGoogleFlowPrompt,
  isLegacyFlatSvgDataUrl,
} from '../utils/flowPromptBuilder';
import { useScriptArtReadiness } from '../utils/aiImageQueue';
import {
  computeSceneVoiceRmsTrack,
  loadRenderQualityMode,
  saveRenderQualityMode,
} from '../utils/cinematicCompositor';
import { hashSeed32 } from '../utils/deterministicPrng';
import {
  localDepthEngine,
  useDepthEngineSnapshot,
} from '../utils/localDepthEngine';
import {
  DEFAULT_SFX_VOLUME_DB,
  ProceduralFoleyEngine,
  sfxVolumeDbToGain,
} from '../utils/proceduralFoleyEngine';
import { getSceneVisualBadgeLabel } from '../utils/proceduralStageEngine';
import { getEffectivePacingProfile } from '../utils/retentionEngine';
import { WebGLSceneRenderer } from '../utils/webglSceneRenderer';
import {
  BACKGROUND_MUSIC_TRACKS,
  playLiveSfx,
  previewMusicTrack,
  scheduleDuckedBackgroundMusic,
  scheduleKeywordSfx,
  stopMusicPreview,
} from '../utils/soundtrackEngine';
import { createStudioAudioGraph, type StudioAudioGraph } from '../utils/studioAudioMixer';
import { mediaStorageService } from '../utils/mediaStorageService';
import { objectUrlRegistry, registerActiveExport } from '../engine/storage';
import {
  decodeDataUrlToStudioBuffer,
  playUnifiedVoiceAudition,
  stopUnifiedVoiceAudition,
  synthesizeUnifiedVoiceBuffer,
} from '../utils/unifiedVoiceEngine';
import {
  renderAudiovisualWebm,
  type AudioTelemetryTrack,
  type ExportProgressInfo,
} from '../utils/videoExporter';
import {
  analyzeBeatEnergyHeatmap,
  auditSafeZoneCollisions,
} from '../utils/viralStressTest';
import { stretchAudioBufferPitchPreserving } from '../utils/wsolaTimeStretch';
import {
  buildTimedWordTokens,
  estimateSpeechDurationSec,
  extractSceneHudMetric,
  findWordIndexForTime,
  getSceneVisualKeywords,
  type TimedWordToken,
} from '../utils/visualKeywords';
import { AiSceneThumbnail } from './AiSceneThumbnail';
import { HookFactoryModal } from './HookFactoryModal';
import { ImageStudioTool, PhotoToVideoTool } from './MediaCreationTools';
import { ProceduralSceneCanvas } from './ProceduralSceneCanvas';
import { RetentionHeatmapTimeline } from './RetentionHeatmapTimeline';
import { SafeZoneOverlaySvg } from './SafeZoneOverlaySvg';
import { ThumbnailStudioTool } from './ThumbnailStudioTool';

export type VideoStudioSubMode = 'story_video' | 'photo_video' | 'image_studio' | 'thumbnail';

interface SubtitleSimulatorProps {
  script: ViralScript;
  sceneMedia: SceneMediaMap;
  aspectRatio: VideoAspectRatio;
  selectedVoiceId: string;
  backgroundMusicId: BackgroundMusicId;
  subtitleConfig: SubtitleConfig;
  studioSubMode: VideoStudioSubMode;
  autoProduceNonce: number;
  generatedVideos: GeneratedVideoItem[];
  generatingArtIds: Record<string, boolean>;
  isBatchGeneratingArt: boolean;
  isOptimizingFlowPrompts: boolean;
  isBatchGeneratingAudio: boolean;
  audioProgressLabel: string | null;
  onChangeAspectRatio: (ratio: VideoAspectRatio) => void;
  onChangeVoiceId: (id: string) => void;
  onChangeBackgroundMusicId: (id: BackgroundMusicId) => void;
  onChangeSubtitleConfig: (cfg: SubtitleConfig) => void;
  onChangeStudioSubMode: (mode: VideoStudioSubMode) => void;
  onVideoCreated: (video: GeneratedVideoItem, blob: Blob) => void;
  onDeleteVideo: (videoId: string) => void;
  onUploadSceneImage: (sceneId: string, dataUrl: string) => void;
  onUploadSceneClip: (sceneId: string, file: File) => void;
  onClearSceneVisual: (sceneId: string) => void;
  onOptimizeFlowPrompts: (aspectRatio: VideoAspectRatio) => Promise<void>;
  onGenerateSceneArt: (
    scene: ScriptScene,
    options?: {
      shotType?: ShotVariationType;
      appendVariation?: boolean;
      aspectRatio?: VideoAspectRatio;
    }
  ) => Promise<SceneMediaMap>;
  onGenerateAllSceneArt: (aspectRatio?: VideoAspectRatio) => Promise<SceneMediaMap>;
  onGenerateAllAudio: (voice: HumanVoiceProfile) => Promise<SceneMediaMap>;
  onGenerateSingleVoiceLine: (text: string, voice: HumanVoiceProfile) => Promise<string>;
  onSaveCustomSceneAudio: (
    sceneId: string,
    audioDataUrl: string,
    source: 'custom_mic' | 'custom_file',
    fileName?: string
  ) => Promise<void>;
  onClearSceneAudio: (sceneId: string) => void;
  onRegenerateSceneImage: (sceneId: string) => void;
  onOpenProGuide: () => void;
  onBackToEditor: () => void;
}

const SUBTITLE_STYLES: Array<{ id: SubtitleStyleId; label: string }> = [
  { id: 'impacto', label: 'Impacto' },
  { id: 'cine', label: 'Suave' },
  { id: 'contraste', label: 'Caja clara' },
];

const SUBTITLE_POSITIONS: Array<{ id: SubtitlePositionY; label: string }> = [
  { id: 'bottom', label: 'Abajo' },
  { id: 'lower_mid', label: 'Medio-bajo' },
  { id: 'center', label: 'Centro' },
];

const SUBTITLE_SIZES: Array<{ id: SubtitleSize; label: string }> = [
  { id: 'sm', label: 'S' },
  { id: 'md', label: 'M' },
  { id: 'lg', label: 'L' },
];

const SUBTITLE_COLORS = ['#F97316', '#FACC15', '#22C55E', '#38BDF8', '#F43F5E', '#FFFFFF'];

const SAFE_ZONES: Array<{ id: SafeZonePlatform; label: string }> = [
  { id: 'none', label: 'Sin guía' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'reels', label: 'Reels' },
];

export function SubtitleSimulator({
  script,
  sceneMedia,
  aspectRatio,
  selectedVoiceId,
  backgroundMusicId,
  subtitleConfig,
  studioSubMode,
  autoProduceNonce,
  generatedVideos,
  isBatchGeneratingArt,
  isOptimizingFlowPrompts,
  isBatchGeneratingAudio,
  audioProgressLabel,
  onChangeAspectRatio,
  onChangeVoiceId,
  onChangeBackgroundMusicId,
  onChangeSubtitleConfig,
  onChangeStudioSubMode,
  onVideoCreated,
  onDeleteVideo,
  onUploadSceneClip,
  onClearSceneVisual,
  onOptimizeFlowPrompts,
  onGenerateAllAudio,
  onGenerateSingleVoiceLine,
  onSaveCustomSceneAudio,
  onClearSceneAudio,
  onRegenerateSceneImage,
  onOpenProGuide,
  onBackToEditor,
}: SubtitleSimulatorProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.15 | 1.25>(1);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [safeZone, setSafeZone] = useState<SafeZonePlatform>('none');
  const [musicVolume, setMusicVolume] = useState(0.28);
  const [enableAutoSfx, setEnableAutoSfx] = useState(true);
  const [sfxVolumeDb, setSfxVolumeDb] = useState<number>(DEFAULT_SFX_VOLUME_DB);
  const sfxVolumeDbRef = useRef<number>(DEFAULT_SFX_VOLUME_DB);
  const [isScrollTestActive, setIsScrollTestActive] = useState(false);
  const [isHookFactoryOpen, setIsHookFactoryOpen] = useState(false);
  const [isDualExporting, setIsDualExporting] = useState(false);
  const [isPreviewingMusic, setIsPreviewingMusic] = useState(false);
  const [exportFormat, setExportFormat] = useState<VideoExportFormat>('mp4');
  const [renderQualityMode, setRenderQualityMode] = useState<RenderQualityMode>(loadRenderQualityMode);
  const [bgTabWarning, setBgTabWarning] = useState(false);
  const webgl2Supported = useMemo(() => WebGLSceneRenderer.isWebGL2Supported(), []);
  const depthSnapshot = useDepthEngineSnapshot();

  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [copiedAllPrompts, setCopiedAllPrompts] = useState(false);
  const [flowNotice, setFlowNotice] = useState<string | null>(null);
  const [isAdvancedFlowOpen, setIsAdvancedFlowOpen] = useState(false);
  const [showPublishingKit, setShowPublishingKit] = useState(false);
  const [copiedKitId, setCopiedKitId] = useState<string | null>(null);
  const [photoVideoSeedImage, setPhotoVideoSeedImage] = useState<string | null>(null);

  // Modo de vista previa inmersiva en pantalla completa
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenHud, setShowFullscreenHud] = useState(true);

  const [isFullPipelineRunning, setIsFullPipelineRunning] = useState(false);
  const [pipelineStageLabel, setPipelineStageLabel] = useState('');
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [renderPercent, setRenderPercent] = useState(0);
  const [renderLabel, setRenderLabel] = useState('');
  const [renderProgressInfo, setRenderProgressInfo] = useState<ExportProgressInfo | null>(null);
  const [exportFallbackNotice, setExportFallbackNotice] = useState<string | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);
  const lastAudioTelemetryRef = useRef<AudioTelemetryTrack | null>(null);

  const [decodedAudioDurations, setDecodedAudioDurations] = useState<Record<string, number>>({});
  const [isPreparingPlaybackAudio, setIsPreparingPlaybackAudio] = useState(false);
  const [auditionLoadingId, setAuditionLoadingId] = useState<string | null>(null);

  const lastSceneIdRef = useRef<string | null>(null);
  const currentTimeRef = useRef<number>(0);
  const renderAbortRef = useRef<AbortController | null>(null);
  const lastAutoNonceRef = useRef<number>(autoProduceNonce);
  const fullscreenOverlayRef = useRef<HTMLDivElement | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTimerRef = useRef<number | null>(null);

  // Motor determinista de audio 48 kHz Estéreo (misma pista en vista previa y .MP4 final)
  const sceneBuffersRef = useRef<Record<string, AudioBuffer>>({});
  const sceneVoiceRmsTracksRef = useRef<Record<string, Float32Array>>({});
  const liveGraphRef = useRef<StudioAudioGraph | null>(null);
  const liveSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const liveAnchorRef = useRef<{
    startOffsetSec: number;
    startAudioCtxTime: number;
    playbackRate: number;
    totalDuration: number;
  } | null>(null);
  const playbackSessionRef = useRef<number>(0);
  const autoAudioPrepKeyRef = useRef<string>('');

  const artReadiness = useScriptArtReadiness(script, aspectRatio, sceneMedia);

  const isCommercial = isCommercialStudioMode(script.studioMode);
  const styleInfo = getStyle3DById(script.estilo3D);
  const selectedVoice =
    HUMAN_VOICE_PROFILES.find((v) => v.id === selectedVoiceId) ?? HUMAN_VOICE_PROFILES[0];

  const getSceneBufferKey = useCallback(
    (sceneId: string) => {
      const asset = sceneMedia[sceneId];
      if (
        asset?.audioDataUrl &&
        (asset.audioSource === 'custom_mic' || asset.audioSource === 'custom_file')
      ) {
        return `${sceneId}::custom::${asset.audioDataUrl.length}`;
      }
      return `${sceneId}::${selectedVoice.id}`;
    },
    [sceneMedia, selectedVoice.id]
  );

  // Decodifica automáticamente en memoria (AudioBuffer 48 kHz) las pistas ya persistidas en IndexedDB
  useEffect(() => {
    let cancelled = false;
    const decodeMissing = async () => {
      const updates: Record<string, number> = {};
      for (const sc of script.escenas) {
        const asset = sceneMedia[sc.id];
        if (!asset?.audioDataUrl) continue;
        const isCustom =
          asset.audioSource === 'custom_mic' || asset.audioSource === 'custom_file';
        const matchesVoice = asset.voiceProfileId === selectedVoice.id;
        if (!isCustom && !matchesVoice) continue;

        const key = getSceneBufferKey(sc.id);
        if (sceneBuffersRef.current[key]) {
          updates[key] = Number(sceneBuffersRef.current[key].duration.toFixed(3));
          continue;
        }
        const decoded = await decodeDataUrlToStudioBuffer(asset.audioDataUrl);
        if (cancelled) return;
        if (decoded) {
          sceneBuffersRef.current[key] = decoded;
          sceneVoiceRmsTracksRef.current[key] = computeSceneVoiceRmsTrack(decoded, 30);
          updates[key] = Number(decoded.duration.toFixed(3));
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setDecodedAudioDurations((prev) => {
          let changed = false;
          for (const [k, v] of Object.entries(updates)) {
            if (prev[k] !== v) {
              changed = true;
              break;
            }
          }
          return changed ? { ...prev, ...updates } : prev;
        });
      }
    };
    void decodeMissing();
    return () => {
      cancelled = true;
    };
  }, [script.escenas, sceneMedia, selectedVoice.id, getSceneBufferKey]);

  const audioReadiness = useMemo(() => {
    const totalCount = script.escenas.length;
    let readyCount = 0;
    for (const sc of script.escenas) {
      const key = getSceneBufferKey(sc.id);
      if (Boolean(decodedAudioDurations[key]) && Boolean(sceneBuffersRef.current[key])) {
        readyCount += 1;
      }
    }
    return {
      readyCount,
      totalCount,
      allReady: totalCount > 0 && readyCount >= totalCount,
    };
  }, [script.escenas, getSceneBufferKey, decodedAudioDurations]);

  const isExportUnlocked = artReadiness.allReady && audioReadiness.allReady;

  // Preparación automática en segundo plano de las pistas 48 kHz para la voz activa (sin intervención manual)
  useEffect(() => {
    const prepKey = `${script.id}::${selectedVoice.id}`;
    if (audioReadiness.allReady || isBatchGeneratingAudio || isRenderingVideo) return;
    if (autoAudioPrepKeyRef.current === prepKey) return;

    const missingInMedia = script.escenas.some((sc) => {
      const asset = sceneMedia[sc.id];
      if (!asset?.audioDataUrl) return true;
      if (asset.audioSource === 'custom_mic' || asset.audioSource === 'custom_file') return false;
      return asset.voiceProfileId !== selectedVoice.id;
    });

    if (!missingInMedia) return;
    autoAudioPrepKeyRef.current = prepKey;
    void onGenerateAllAudio(selectedVoice).catch(() => {
      // Silencioso; el usuario también puede pulsar "Preparar voces 48 kHz"
    });
  }, [
    script.id,
    script.escenas,
    sceneMedia,
    selectedVoice,
    audioReadiness.allReady,
    isBatchGeneratingAudio,
    isRenderingVideo,
    onGenerateAllAudio,
  ]);

  const voicedCount = audioReadiness.readyCount;
  const uploadedClipsCount = script.escenas.filter((s) =>
    Boolean(sceneMedia[s.id]?.videoClipUrl || s.mediaSource === 'user_video')
  ).length;

  // Línea de tiempo determinista por micro-escena ajustada a velocidad global + BeatV2 pacingProfile
  const effectiveTimeline = useMemo(() => {
    let cursor = 0;
    return script.escenas.map((scene) => {
      const pacing = getEffectivePacingProfile(scene);
      const beatRate = Math.max(0.75, Math.min(1.5, Number((playbackRate * pacing.speedMultiplier).toFixed(3))));
      const prePauseSec = Math.max(0, Math.min(0.45, pacing.prePauseMs / 1000));
      const key = getSceneBufferKey(scene.id);
      const exactBufferDur = decodedAudioDurations[key];
      const recordedDur = sceneMedia[scene.id]?.audioDurationSec;
      const rawDur =
        exactBufferDur && exactBufferDur > 0.25
          ? Math.max(exactBufferDur + 0.08, 1.4)
          : recordedDur && recordedDur > 0.25
            ? Math.max(recordedDur + 0.08, 1.4)
            : estimateSpeechDurationSec(scene.narracion, 1);
      const dur = prePauseSec + rawDur / beatRate;
      const startSec = cursor;
      cursor += dur;
      return {
        scene,
        startSec,
        endSec: cursor,
        durationSec: dur,
        prePauseSec,
        beatRate,
        musicDuckLevel: pacing.musicDuckLevel,
      };
    });
  }, [script.escenas, sceneMedia, decodedAudioDurations, getSceneBufferKey, playbackRate]);

  const effectiveTimelineRef = useRef(effectiveTimeline);
  useEffect(() => {
    effectiveTimelineRef.current = effectiveTimeline;
  }, [effectiveTimeline]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const totalDuration = useMemo(() => {
    const last = effectiveTimeline[effectiveTimeline.length - 1];
    return Math.max(1, last ? last.endSec : script.duracionSegundos / playbackRate);
  }, [effectiveTimeline, script.duracionSegundos, playbackRate]);

  const estimatedWordsDurationSec = useMemo(() => {
    return Math.max(
      1,
      Math.round(
        script.escenas.reduce(
          (acc, sc) => acc + estimateSpeechDurationSec(sc.narracion, 1) / playbackRate,
          0
        )
      )
    );
  }, [script.escenas, playbackRate]);

  const activeBeatIndex = useMemo(() => {
    const idx = effectiveTimeline.findIndex(
      (entry) => currentTime >= entry.startSec && currentTime < entry.endSec
    );
    return idx >= 0 ? idx : Math.max(0, effectiveTimeline.length - 1);
  }, [effectiveTimeline, currentTime]);

  const activeEntry = effectiveTimeline[activeBeatIndex];
  const activeScene = activeEntry?.scene;

  const realDisplaySec = audioReadiness.allReady
    ? Math.round(totalDuration)
    : estimatedWordsDurationSec;
  const isAllVoiced = audioReadiness.allReady;
  const meetsTikTok60 = realDisplaySec >= 60;
  const missingFor60 = Math.max(0, 60 - realDisplaySec);

  const stopLiveMasterAudio = useCallback(() => {
    playbackSessionRef.current += 1;
    for (const src of liveSourcesRef.current) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // Ya detenido
      }
    }
    liveSourcesRef.current = [];
    liveAnchorRef.current = null;
    if (liveGraphRef.current) {
      const g = liveGraphRef.current;
      liveGraphRef.current = null;
      void g.dispose();
    }
  }, []);

  const stopActiveAudio = useCallback(() => {
    stopLiveMasterAudio();
    stopUnifiedVoiceAudition();
    stopCurrentAudio();
    setPlayingVoiceId(null);
    setAuditionLoadingId(null);
  }, [stopLiveMasterAudio]);

  // Motor Maestro Determinista (AudioContext 48 kHz Estéreo con limitador -1 dBFS)
  // El reloj hardware audioCtx.currentTime gobierna escenas, micro-cortes y subtítulos (cero desfase).
  const startDeterministicPlayback = useCallback(
    async (requestedOffsetSec: number) => {
      stopActiveAudio();
      stopMusicPreview();
      setIsPreviewingMusic(false);
      unlockAudioPlayback();

      const sessionId = ++playbackSessionRef.current;
      const scriptLang = script.idioma ?? 'es';

      // 1) Garantizar que todas las escenas tengan su AudioBuffer en memoria antes de arrancar el reloj maestro
      const missingScenes = script.escenas.filter((sc) => {
        const key = getSceneBufferKey(sc.id);
        return !sceneBuffersRef.current[key];
      });

      if (missingScenes.length > 0) {
        setIsPreparingPlaybackAudio(true);
        try {
          const freshDurations: Record<string, number> = {};
          for (const sc of missingScenes) {
            if (playbackSessionRef.current !== sessionId) return;
            const asset = sceneMedia[sc.id];
            const isCustom =
              Boolean(asset?.audioDataUrl) &&
              (asset?.audioSource === 'custom_mic' || asset?.audioSource === 'custom_file');
            const reuseUrl =
              isCustom || asset?.voiceProfileId === selectedVoice.id
                ? asset?.audioDataUrl
                : undefined;

            const result = await synthesizeUnifiedVoiceBuffer({
              text: sc.narracion,
              voice: selectedVoice,
              language: scriptLang,
              existingAudioDataUrl: reuseUrl,
              isCustomUserAudio: isCustom,
            });
            if (playbackSessionRef.current !== sessionId) return;
            const key = getSceneBufferKey(sc.id);
            sceneBuffersRef.current[key] = result.buffer;
            sceneVoiceRmsTracksRef.current[key] = computeSceneVoiceRmsTrack(result.buffer, 30);
            freshDurations[key] = result.durationSec;
          }
          if (Object.keys(freshDurations).length > 0) {
            setDecodedAudioDurations((prev) => ({ ...prev, ...freshDurations }));
          }
        } finally {
          setIsPreparingPlaybackAudio(false);
        }
      }

      if (playbackSessionRef.current !== sessionId) return;

      // 2) Construir línea de tiempo determinista con preservación de tono WSOLA + BeatV2 pacingProfile
      let cursor = 0;
      const scheduleItems: Array<{
        scene: ScriptScene;
        buffer: AudioBuffer | null;
        startSec: number;
        endSec: number;
        durationSec: number;
        prePauseSec: number;
        musicDuckLevel: number;
      }> = [];

      for (const sc of script.escenas) {
        const pacing = getEffectivePacingProfile(sc);
        const beatRate = Math.max(0.75, Math.min(1.5, Number((playbackRate * pacing.speedMultiplier).toFixed(3))));
        const prePauseSec = Math.max(0, Math.min(0.45, pacing.prePauseMs / 1000));
        const key = getSceneBufferKey(sc.id);
        const rawBuffer = sceneBuffersRef.current[key] ?? null;
        const stretchedBuffer =
          rawBuffer && Math.abs(beatRate - 1.0) >= 0.008
            ? await stretchAudioBufferPitchPreserving(rawBuffer, beatRate)
            : rawBuffer;
        if (playbackSessionRef.current !== sessionId) return;

        const padSec = 0.08 / beatRate;
        const minDur = 1.4 / beatRate;
        const voiceDur = stretchedBuffer
          ? Math.max(stretchedBuffer.duration + padSec, minDur)
          : estimateSpeechDurationSec(sc.narracion, 1) / beatRate;
        const dur = prePauseSec + voiceDur;
        const startSec = cursor;
        cursor += dur;
        scheduleItems.push({
          scene: sc,
          buffer: stretchedBuffer,
          startSec,
          endSec: cursor,
          durationSec: dur,
          prePauseSec,
          musicDuckLevel: pacing.musicDuckLevel,
        });
      }

      const exactTotalDuration = Math.max(1, cursor);
      const startOffsetSec =
        requestedOffsetSec >= exactTotalDuration - 0.08
          ? 0
          : Math.max(0, requestedOffsetSec);

      // 3) Crear Bus de Mezcla de Estudio a 48 kHz Estéreo con limitador suave (-1 dBFS)
      const graph = createStudioAudioGraph({
        connectToSpeakers: true,
        createMediaDestination: false,
        musicGainValue: backgroundMusicId === 'none' ? 0 : Math.min(1.6, musicVolume / 0.28),
        sfxGainValue: enableAutoSfx ? sfxVolumeDbToGain(sfxVolumeDbRef.current) : 0,
      });
      if (graph.audioCtx.state === 'suspended') {
        await graph.audioCtx.resume().catch(() => {});
      }
      if (playbackSessionRef.current !== sessionId) {
        void graph.dispose();
        return;
      }

      graph.voiceBus.gain.value = voiceEnabled ? 1.05 : 0;
      liveGraphRef.current = graph;

      const audioOrigin = graph.audioCtx.currentTime + 0.05;
      const projectSeed = hashSeed32(script.id || 'gortex-default');
      const scheduledSources: AudioBufferSourceNode[] = [];
      const speechWindowsScaled: Array<{ startSec: number; endSec: number; duckLevel?: number }> = [];

      // 4) Programar narración exacta en voiceBus (WSOLA pitch-preserved + prePauseMs) + Audio Director Procedural determinista
      for (let i = 0; i < scheduleItems.length; i++) {
        const item = scheduleItems[i];
        if (item.endSec <= startOffsetSec) continue;

        const voiceStartAbs = item.startSec + item.prePauseSec;
        const clippedVoiceStart = Math.max(voiceStartAbs, startOffsetSec);
        const relVoiceStartReal = Math.max(0, clippedVoiceStart - startOffsetSec);
        const relEndReal = Math.max(relVoiceStartReal, item.endSec - startOffsetSec);
        if (relEndReal > relVoiceStartReal) {
          speechWindowsScaled.push({
            startSec: relVoiceStartReal,
            endSec: relEndReal,
            duckLevel: item.musicDuckLevel,
          });
        }

        if (item.buffer && item.endSec > startOffsetSec) {
          const bufferOffset = Math.max(0, startOffsetSec - voiceStartAbs);
          if (bufferOffset < item.buffer.duration - 0.02) {
            const src = graph.audioCtx.createBufferSource();
            src.buffer = item.buffer;
            src.playbackRate.value = 1.0;
            src.connect(graph.voiceBus);
            src.start(audioOrigin + relVoiceStartReal, bufferOffset);
            scheduledSources.push(src);
          }
        }

        if (enableAutoSfx) {
          ProceduralFoleyEngine.scheduleBeatFoley({
            ctx: graph.audioCtx,
            destination: graph.sfxBus,
            projectSeed,
            beat: {
              scene: item.scene,
              beatIndex: i,
              startSec: item.startSec,
              durationSec: item.durationSec,
              prePauseSec: item.prePauseSec,
              nextBeatStartSec: scheduleItems[i + 1]?.startSec ?? item.endSec,
            },
            playbackOffsetSec: startOffsetSec,
            baseContextTimeSec: audioOrigin,
            intensity: 1.0,
          });

          // SFX temáticos en palabras clave visuales sincronizados al ritmo real
          const tokens = buildTimedWordTokens(item.scene, item.durationSec, {
            prePauseSec: item.prePauseSec,
          });
          let lastKwAt = -1;
          for (const tok of tokens) {
            if (tok.isKeyword && tok.sfxType) {
              const absKwSec = item.startSec + tok.startSec;
              if (absKwSec <= startOffsetSec) continue;
              if (absKwSec - lastKwAt >= 0.7) {
                lastKwAt = absKwSec;
                scheduleKeywordSfx({
                  audioCtx: graph.audioCtx,
                  destination: graph.sfxBus,
                  atTime: audioOrigin + (absKwSec - startOffsetSec),
                  type: tok.sfxType,
                });
              }
            }
          }
        }
      }

      // 5) Programar música ambiental con Auto-Ducking real (12% voz / 28% pausas) en musicBus
      const remainingRealSec = Math.max(0.5, exactTotalDuration - startOffsetSec);
      if (backgroundMusicId !== 'none') {
        const musicSrc = scheduleDuckedBackgroundMusic({
          audioCtx: graph.audioCtx,
          destination: graph.musicBus,
          trackId: backgroundMusicId,
          startTime: audioOrigin,
          totalDurationSec: remainingRealSec,
          baseVolume: 0.28,
          speechWindows: speechWindowsScaled,
        });
        if (musicSrc) scheduledSources.push(musicSrc);
      }

      liveSourcesRef.current = scheduledSources;
      liveAnchorRef.current = {
        startOffsetSec,
        startAudioCtxTime: audioOrigin,
        playbackRate,
        totalDuration: exactTotalDuration,
      };
      setCurrentTime(startOffsetSec);
      setIsPlaying(true);
    },
    [
      backgroundMusicId,
      enableAutoSfx,
      getSceneBufferKey,
      musicVolume,
      playbackRate,
      sceneMedia,
      script.id,
      script.escenas,
      script.idioma,
      selectedVoice,
      stopActiveAudio,
      voiceEnabled,
    ]
  );

  const handleTogglePlay = useCallback(() => {
    setIsScrollTestActive(false);
    if (isPlaying) {
      stopLiveMasterAudio();
      setIsPlaying(false);
    } else {
      void startDeterministicPlayback(currentTimeRef.current);
    }
  }, [isPlaying, startDeterministicPlayback, stopLiveMasterAudio]);

  const handleToggleScrollTest = useCallback(() => {
    setIsScrollTestActive((prev) => {
      const next = !prev;
      stopActiveAudio();
      stopMusicPreview();
      setIsPreviewingMusic(false);
      setIsPlaying(false);
      if (next) {
        setCurrentTime(0);
      }
      return next;
    });
  }, [stopActiveAudio]);

  const handleSeekTimeline = useCallback(
    (targetSec: number) => {
      setIsScrollTestActive(false);
      const clamped = Math.max(0, Math.min(totalDuration, targetSec));
      setCurrentTime(clamped);
      if (isPlaying) {
        void startDeterministicPlayback(clamped);
      }
    },
    [isPlaying, startDeterministicPlayback, totalDuration]
  );

  const handleChangePlaybackRate = useCallback(
    (nextRate: 1 | 1.15 | 1.25) => {
      if (nextRate === playbackRate) return;
      const ratio = playbackRate / nextRate;
      const scaledPosition = currentTimeRef.current * ratio;
      currentTimeRef.current = scaledPosition;
      setCurrentTime(scaledPosition);
      setPlaybackRate(nextRate);
    },
    [playbackRate]
  );

  // Control de volumen de música ambiental EN VIVO sin reiniciar la reproducción
  useEffect(() => {
    const graph = liveGraphRef.current;
    if (!graph || graph.audioCtx.state === 'closed') return;
    const targetGain = backgroundMusicId === 'none' ? 0 : Math.min(1.6, musicVolume / 0.28);
    graph.musicBus.gain.setTargetAtTime(targetGain, graph.audioCtx.currentTime, 0.04);
  }, [musicVolume, backgroundMusicId]);

  // Control de volumen de SFX / Foley Procedural EN VIVO (dB relativos a la voz)
  useEffect(() => {
    sfxVolumeDbRef.current = sfxVolumeDb;
    const graph = liveGraphRef.current;
    if (!graph || graph.audioCtx.state === 'closed') return;
    const targetGain = enableAutoSfx ? sfxVolumeDbToGain(sfxVolumeDb) : 0;
    graph.sfxBus.gain.setTargetAtTime(targetGain, graph.audioCtx.currentTime, 0.04);
  }, [sfxVolumeDb, enableAutoSfx]);

  // Silenciar/activar voz en vivo instantáneamente desde el bus de voz
  useEffect(() => {
    const graph = liveGraphRef.current;
    if (!graph || graph.audioCtx.state === 'closed') return;
    graph.voiceBus.gain.setTargetAtTime(voiceEnabled ? 1.05 : 0, graph.audioCtx.currentTime, 0.03);
  }, [voiceEnabled]);

  // Re-programar mezcla en vivo si el usuario cambia velocidad, pista musical o voz mientras reproduce
  const prevMixKeyRef = useRef(
    `${playbackRate}::${backgroundMusicId}::${enableAutoSfx}::${selectedVoice.id}`
  );
  useEffect(() => {
    const nextKey = `${playbackRate}::${backgroundMusicId}::${enableAutoSfx}::${selectedVoice.id}`;
    if (nextKey !== prevMixKeyRef.current) {
      prevMixKeyRef.current = nextKey;
      if (isPlaying) {
        void startDeterministicPlayback(currentTimeRef.current);
      }
    }
  }, [
    playbackRate,
    backgroundMusicId,
    enableAutoSfx,
    selectedVoice.id,
    isPlaying,
    startDeterministicPlayback,
  ]);

  const revealHudTemporarily = useCallback(() => {
    setShowFullscreenHud(true);
    if (hudTimerRef.current !== null) {
      window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = null;
    }
    if (isPlaying) {
      hudTimerRef.current = window.setTimeout(() => {
        setShowFullscreenHud(false);
      }, 2600);
    }
  }, [isPlaying]);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setShowFullscreenHud(true);
    if (hudTimerRef.current !== null) {
      window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = null;
    }
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        // Ignorar si ya salió de pantalla completa nativa
      });
    }
  }, []);

  const enterFullscreen = useCallback(() => {
    unlockAudioPlayback();
    setIsFullscreen(true);
    setShowFullscreenHud(true);
    window.setTimeout(() => {
      const target = fullscreenOverlayRef.current;
      if (target && typeof target.requestFullscreen === 'function') {
        void target.requestFullscreen().catch(() => {
          // Respaldo: el overlay fixed inset-0 cubre toda la pantalla igualmente
        });
      }
    }, 20);
  }, []);

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    setIsScrollTestActive(false);
    lastSceneIdRef.current = null;
    stopActiveAudio();
  }, [script.id, stopActiveAudio]);

  useEffect(() => {
    // Solicitar persistencia OPFS/Storage sin bloquear y limpiar temporales huérfanos de sesiones pasadas
    void mediaStorageService.requestPersistence();
    void mediaStorageService.cleanupOrphanedTempExports();

    return () => {
      stopActiveAudio();
      stopMusicPreview();
      renderAbortRef.current?.abort();
      if (hudTimerRef.current !== null) {
        window.clearTimeout(hudTimerRef.current);
      }
    };
  }, [stopActiveAudio]);

  useEffect(() => {
    if (!isFullscreen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        exitFullscreen();
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
        setShowFullscreenHud(true);
      } else if (e.key.toLowerCase() === 'm') {
        setVoiceEnabled((v) => !v);
        setShowFullscreenHud(true);
      }
    };

    const onNativeFsChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onNativeFsChange);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onNativeFsChange);
    };
  }, [isFullscreen, exitFullscreen, handleTogglePlay]);

  useEffect(() => {
    if (!isFullscreen) return;
    if (!isPlaying) {
      setShowFullscreenHud(true);
      if (hudTimerRef.current !== null) {
        window.clearTimeout(hudTimerRef.current);
        hudTimerRef.current = null;
      }
      return;
    }
    revealHudTemporarily();
  }, [isFullscreen, isPlaying, revealHudTemporarily]);

  // Bucle RAF gobernado 100% por el reloj hardware audioCtx.currentTime (cero deriva / cero setTimeout)
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;

    const tick = () => {
      const graph = liveGraphRef.current;
      const anchor = liveAnchorRef.current;
      if (!graph || !anchor) return;

      const elapsedAudioSec = Math.max(0, graph.audioCtx.currentTime - anchor.startAudioCtxTime);
      const masterTimeSec = anchor.startOffsetSec + elapsedAudioSec;

      if (masterTimeSec >= anchor.totalDuration) {
        void startDeterministicPlayback(0);
        return;
      }

      setCurrentTime(masterTimeSec);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, startDeterministicPlayback]);

  // Bucle silencioso Scroll Test (2.5s Mute) para evaluar gancho visual puro en feed móvil
  useEffect(() => {
    if (!isScrollTestActive) return;
    let rafId = 0;
    const loopDurationSec = Math.max(0.8, Math.min(2.5, totalDuration));
    let startMs = performance.now();

    const tick = (nowMs: number) => {
      const elapsedSec = (nowMs - startMs) / 1000;
      if (elapsedSec >= loopDurationSec) {
        startMs = nowMs;
        setCurrentTime(0);
      } else {
        setCurrentTime(elapsedSec);
      }
      rafId = requestAnimationFrame(tick);
    };

    setCurrentTime(0);
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isScrollTestActive, totalDuration]);

  // Rastrear escena activa (la transición visual de 120ms cross-dissolve la ejecuta el lienzo 2.5D sin flashes bruscos)
  useEffect(() => {
    if (!activeScene) return;
    lastSceneIdRef.current = activeScene.id;
  }, [activeScene?.id]);

  const activeWordChunks = useMemo(() => {
    if (!activeEntry) {
      return {
        tokens: [] as TimedWordToken[],
        activeWordIdx: 0,
        globalWordIdx: 0,
        currentToken: null as TimedWordToken | null,
      };
    }
    const allTokens = buildTimedWordTokens(activeEntry.scene, activeEntry.durationSec, {
      prePauseSec: activeEntry.prePauseSec,
    });
    if (allTokens.length === 0) {
      return {
        tokens: [] as TimedWordToken[],
        activeWordIdx: 0,
        globalWordIdx: 0,
        currentToken: null as TimedWordToken | null,
      };
    }

    const localElapsed = Math.max(0, currentTime - activeEntry.startSec);
    const currentWordIdx = findWordIndexForTime(allTokens, localElapsed);

    const windowStart = Math.floor(currentWordIdx / 4) * 4;
    const chunkTokens = allTokens.slice(windowStart, windowStart + 4);
    const activeLocal = currentWordIdx - windowStart;
    return {
      tokens: chunkTokens,
      activeWordIdx: activeLocal,
      globalWordIdx: currentWordIdx,
      currentToken: chunkTokens[activeLocal] ?? null,
    };
  }, [activeEntry, currentTime]);

  const formatTimecode = (sec: number) => {
    const clamped = Math.max(0, Math.floor(sec));
    const m = Math.floor(clamped / 60);
    const s = clamped % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const stopMicResources = useCallback(() => {
    if (micTimerRef.current !== null) {
      window.clearInterval(micTimerRef.current);
      micTimerRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((tr) => tr.stop());
      micStreamRef.current = null;
    }
    micRecorderRef.current = null;
    setIsRecordingMic(false);
    setRecordingSec(0);
  }, []);

  useEffect(() => {
    return () => {
      stopMicResources();
    };
  }, [stopMicResources]);

  const handleToggleMicRecording = async (targetScene: ScriptScene) => {
    if (isRecordingMic) {
      try {
        if (micRecorderRef.current && micRecorderRef.current.state === 'recording') {
          micRecorderRef.current.stop();
        } else {
          stopMicResources();
        }
      } catch {
        stopMicResources();
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStudioError('Tu navegador no permite grabar micrófono aquí. Puedes subir un archivo .MP3 o .WAV.');
      return;
    }

    setStudioError(null);
    setIsPlaying(false);
    stopActiveAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      micRecorderRef.current = recorder;

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        stopMicResources();
        if (blob.size > 200) {
          try {
            const dataUrl = await blobToDataUrl(blob);
            await onSaveCustomSceneAudio(
              targetScene.id,
              dataUrl,
              'custom_mic',
              `Micrófono · Escena ${targetScene.orden}`
            );
          } catch {
            // Silencioso
          }
        }
      };

      setIsRecordingMic(true);
      setRecordingSec(0);
      micTimerRef.current = window.setInterval(() => {
        setRecordingSec((prev) => prev + 1);
      }, 1000);
      recorder.start(200);
    } catch {
      stopMicResources();
      setStudioError('No se concedió permiso de micrófono. También puedes subir tu voz en .MP3 o .WAV.');
    }
  };

  const handleUploadCustomVoiceFile = async (scene: ScriptScene, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setStudioError('Selecciona un archivo de audio válido (.MP3, .WAV, .M4A o .OGG).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setStudioError('El archivo de audio es demasiado pesado (máximo 25 MB).');
      return;
    }
    setStudioError(null);
    try {
      const dataUrl = await blobToDataUrl(file);
      await onSaveCustomSceneAudio(scene.id, dataUrl, 'custom_file', file.name);
    } catch {
      setStudioError('No se pudo cargar ese archivo de audio.');
    }
  };

  const handleAuditionVoice = async (profile: HumanVoiceProfile) => {
    setStudioError(null);

    if (playingVoiceId === profile.id || auditionLoadingId === profile.id) {
      stopActiveAudio();
      return;
    }

    setIsPlaying(false);
    stopActiveAudio();
    stopMusicPreview();
    setIsPreviewingMusic(false);
    unlockAudioPlayback();
    setAuditionLoadingId(profile.id);

    const sampleText =
      script.idioma && script.idioma !== 'es'
        ? script.escenas[0]?.narracion || profile.sampleLine
        : profile.sampleLine;

    try {
      setPlayingVoiceId(profile.id);
      await playUnifiedVoiceAudition({
        text: sampleText,
        voice: profile,
        language: script.idioma ?? 'es',
        onEnded: () => {
          setPlayingVoiceId((cur) => (cur === profile.id ? null : cur));
        },
      });
    } catch {
      setPlayingVoiceId((cur) => (cur === profile.id ? null : cur));
    } finally {
      setAuditionLoadingId((cur) => (cur === profile.id ? null : cur));
    }
  };

  const handleCopyFlowPrompt = async (scene: ScriptScene) => {
    const promptEn = buildGoogleFlowPrompt(
      scene,
      script,
      aspectRatio,
      sceneMedia[scene.id]?.flowPromptEn
    );
    try {
      await navigator.clipboard.writeText(promptEn);
      setCopiedPromptId(scene.id);
      setFlowNotice(`Prompt 3D en inglés de la Escena ${scene.orden} copiado para Google Flow.`);
      window.setTimeout(() => {
        setCopiedPromptId((cur) => (cur === scene.id ? null : cur));
      }, 2200);
    } catch {
      setStudioError('No se pudo copiar al portapapeles. Intenta de nuevo.');
    }
  };

  const handleCopyAllFlowPrompts = async () => {
    const bundle = buildAllGoogleFlowPromptsBundle(script, sceneMedia, aspectRatio);
    try {
      await navigator.clipboard.writeText(bundle);
      setCopiedAllPrompts(true);
      setFlowNotice(
        `Se copiaron los ${script.escenas.length} prompts en inglés listos para pegar en Google Flow.`
      );
      window.setTimeout(() => setCopiedAllPrompts(false), 2500);
    } catch {
      setStudioError('No se pudieron copiar los prompts al portapapeles.');
    }
  };

  const handleDownloadCompleteTxtPack = () => {
    const content = buildCompleteScriptAndFlowPackTxt(script, sceneMedia, aspectRatio);
    triggerFileDownload(
      `${slugifyFilename(script.tituloViral)}-paquete-google-flow.txt`,
      content,
      'text/plain;charset=utf-8'
    );
    setFlowNotice(
      'Paquete completo (.txt) descargado con el guion escena por escena y todos los prompts 3D para Google Flow.'
    );
  };

  const handleOptimizeAllFlowPrompts = async () => {
    setStudioError(null);
    setFlowNotice(null);
    try {
      await onOptimizeFlowPrompts(aspectRatio);
      setFlowNotice(
        'Prompts en inglés mejorados con Gemini 2.5 Flash (capa gratuita) para máximo detalle 3D en Google Flow.'
      );
    } catch (err: unknown) {
      setStudioError(
        err instanceof Error ? err.message : 'No se pudieron optimizar los prompts para Google Flow.'
      );
    }
  };

  const handleBatchAudio = async () => {
    setStudioError(null);
    try {
      await onGenerateAllAudio(selectedVoice);
    } catch {
      // 100% silencioso en errores de síntesis
    }
  };

  const handleToggleMusicPreview = async () => {
    if (isPreviewingMusic) {
      stopMusicPreview();
      setIsPreviewingMusic(false);
      return;
    }
    if (backgroundMusicId === 'none') return;
    stopActiveAudio();
    setIsPlaying(false);
    setIsPreviewingMusic(true);
    try {
      await previewMusicTrack(backgroundMusicId, musicVolume, () => {
        setIsPreviewingMusic(false);
      });
    } catch {
      setIsPreviewingMusic(false);
    }
  };

  const handleUploadSceneFile = (sceneId: string, file?: File) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      setStudioError(
        'Selecciona un clip de video (MP4, WebM, MOV) o una fotografía válida (JPG, PNG, WebP).'
      );
      return;
    }
    setStudioError(null);
    onUploadSceneClip(sceneId, file);
    if (isVideo && file.size > USER_VIDEO_SOFT_LIMIT_BYTES) {
      setFlowNotice(
        `Clip "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) guardado en OPFS. Aviso: los clips mayores a 150 MB pueden tardar más al exportar.`
      );
    } else {
      setFlowNotice(
        isVideo
          ? `Clip "${file.name}" guardado en OPFS con encuadre 1.0x y duración adaptada automáticamente.`
          : `Foto real "${file.name}" optimizada en WebP (OPFS) con profundidad TrueDepth 2.5D.`
      );
    }
  };

  const runVideoRender = async (
    mediaSnapshot: SceneMediaMap,
    scenesSubset?: ScriptScene[],
    scopeLabel = 'Historia completa',
    aspectRatioOverride?: VideoAspectRatio
  ) => {
    const targetAspectRatio = aspectRatioOverride ?? aspectRatio;
    setIsPlaying(false);
    setIsScrollTestActive(false);
    stopActiveAudio();
    stopMusicPreview();
    setIsPreviewingMusic(false);
    setBgTabWarning(false);
    setExportFallbackNotice(null);
    setIsRenderingVideo(true);
    setRenderPercent(2);
    setRenderLabel(`Iniciando renderizado ${targetAspectRatio} (.${exportFormat.toUpperCase()})...`);
    setRenderProgressInfo({
      percent: 2,
      phase: 'audio',
      label: `Iniciando renderizado ${targetAspectRatio} (.${exportFormat.toUpperCase()})...`,
    });

    const controller = new AbortController();
    renderAbortRef.current = controller;
    const unregisterExport = registerActiveExport(script.id, controller);

    try {
      const result = await renderAudiovisualWebm({
        script,
        scenesSubset,
        sceneMedia: mediaSnapshot,
        selectedVoice,
        fallbackImageUrl: styleInfo.imageUrl,
        aspectRatio: targetAspectRatio,
        subtitleConfig,
        backgroundMusicId,
        musicVolume,
        enableTransitionSfx: enableAutoSfx,
        sfxVolumeDb,
        exportFormat,
        playbackRate,
        renderQuality: webgl2Supported ? renderQualityMode : 'classic_2d',
        signal: controller.signal,
        onBackgroundWarning: (hidden) => setBgTabWarning(hidden),
        onProgress: (pct, label) => {
          setRenderPercent(pct);
          setRenderLabel(label);
        },
        onProgressInfo: (info) => {
          setRenderProgressInfo(info);
        },
      });

      if (result.fallbackNotice) {
        setExportFallbackNotice(result.fallbackNotice);
      }

      if (result.telemetry) {
        lastAudioTelemetryRef.current = result.telemetry;
        // Exponer contrato AudioTelemetryTrack para módulos futuros e inspección de diagnóstico
        (
          window as unknown as { __GORTEX_LAST_AUDIO_TELEMETRY__?: AudioTelemetryTrack }
        ).__GORTEX_LAST_AUDIO_TELEMETRY__ = result.telemetry;
      }

      objectUrlRegistry.register(script.id, result.videoUrl);

      const newVideo: GeneratedVideoItem = {
        id: `vid-${Date.now()}`,
        scriptId: script.id,
        title:
          scenesSubset && scenesSubset.length === 1
            ? `${script.tituloViral} · Escena ${scenesSubset[0].orden}`
            : script.tituloViral,
        scopeLabel: playbackRate !== 1 ? `${scopeLabel} · ${playbackRate}x` : scopeLabel,
        aspectRatio: result.aspectRatio,
        videoUrl: result.videoUrl,
        durationSec: result.durationSec,
        voiceLabel: selectedVoice.name,
        extension: result.extension,
        mimeType: result.mimeType,
        createdAt: new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      onVideoCreated(newVideo, result.blob);

      // Mostrar el Kit de Publicación Viral listo para copiar y descargar automáticamente el archivo final
      if (!scenesSubset || scenesSubset.length === 0) {
        setShowPublishingKit(true);
        try {
          const a = document.createElement('a');
          a.href = result.videoUrl;
          a.download = `${slugifyFilename(script.tituloViral)}-${result.aspectRatio.replace(':', 'x')}.${result.extension}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch {
          // El archivo también queda disponible en la galería de Videos generados
        }
      }
    } finally {
      unregisterExport();
      setIsRenderingVideo(false);
      setRenderProgressInfo(null);
      setBgTabWarning(false);
      renderAbortRef.current = null;
    }
  };

  const publishingKitData = useMemo(() => {
    const rawTitles = script.metadatosPublicacion?.titulosAlternativos ?? [];
    const uniqueTitles = Array.from(
      new Set([script.tituloViral, ...rawTitles].map((t) => (t || '').trim()).filter(Boolean))
    );
    while (uniqueTitles.length < 3) {
      uniqueTitles.push(
        uniqueTitles.length === 1
          ? `Lo que nadie te contó sobre ${script.tituloViral}`
          : `${script.tituloViral} (explicado en segundos)`
      );
    }
    const hashtags = (script.metadatosPublicacion?.hashtags ?? [])
      .map((h) => (h.startsWith('#') ? h : `#${h.replace(/\s+/g, '')}`))
      .filter(Boolean);
    const hashtagsLine =
      hashtags.length > 0 ? hashtags.join(' ') : '#shorts #curiosidades #documental #viral';
    const description =
      (script.metadatosPublicacion?.descripcionSeo || '').trim() ||
      `${script.ganchoInicial3Seg.fraseApertura} ¿Qué opinas de este fenómeno? Te leemos en los comentarios.`;
    const biblePrefix = script.visualBible?.fixedPrefixPrompt || script.guiaEstilo3D || '';
    const coverPrompt =
      (script.metadatosPublicacion?.promptPortada || '').trim() ||
      `${biblePrefix}, iconic viral cover thumbnail for "${script.tituloViral}", dramatic volumetric rim lighting, centered focal subject, ultra-clean 8K cinema render, no text, no watermark`.trim();

    return {
      titles: uniqueTitles.slice(0, 3),
      description,
      hashtagsLine,
      fullDescriptionWithTags: `${description}\n\n${hashtagsLine}`,
      coverPrompt,
    };
  }, [script]);

  const handleCopyKitItem = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKitId(id);
      window.setTimeout(() => {
        setCopiedKitId((cur) => (cur === id ? null : cur));
      }, 2200);
    } catch {
      setStudioError('No se pudo copiar al portapapeles.');
    }
  };

  const handleFullAutoProduction = async () => {
    if (!artReadiness.allReady || !audioReadiness.allReady) {
      setStudioError(
        `Bloqueo de seguridad activo: verifica que el 100% de imágenes AI (${artReadiness.readyCount}/${artReadiness.totalCount}) y audios 48 kHz (${audioReadiness.readyCount}/${audioReadiness.totalCount}) estén cargados en memoria antes de descargar.`
      );
      return;
    }
    setStudioError(null);
    setIsFullPipelineRunning(true);
    try {
      setPipelineStageLabel(
        `Ensamblando video ${aspectRatio} (30 fps CFR + Audio 48 kHz Estéreo ${selectedVoice.name} + subtítulos sincronizados)...`
      );
      await runVideoRender(sceneMedia, undefined, 'Historia completa');
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== 'Renderizado cancelado.') {
        setStudioError(err.message);
      }
    } finally {
      setIsFullPipelineRunning(false);
      setPipelineStageLabel('');
    }
  };

  // Disparo automático cuando el usuario eligió "Crear y producir video" desde la pantalla Crear
  useEffect(() => {
    if (autoProduceNonce > 0 && autoProduceNonce !== lastAutoNonceRef.current) {
      lastAutoNonceRef.current = autoProduceNonce;
      if (studioSubMode === 'story_video' && !isFullPipelineRunning) {
        void handleFullAutoProduction();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoProduceNonce, script.id]);

  const handleRenderSingleSceneClip = async (scene: ScriptScene) => {
    setStudioError(null);
    try {
      await runVideoRender(sceneMedia, [scene], `Clip escena ${scene.orden}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== 'Renderizado cancelado.') {
        setStudioError(err.message);
      }
    }
  };

  const handleDualExport = async () => {
    if (!artReadiness.allReady || !audioReadiness.allReady) {
      setStudioError(
        `Bloqueo de seguridad activo: verifica que el 100% de imágenes AI (${artReadiness.readyCount}/${artReadiness.totalCount}) y audios 48 kHz (${audioReadiness.readyCount}/${audioReadiness.totalCount}) estén listos antes de la Exportación Dual.`
      );
      return;
    }
    setStudioError(null);
    setIsDualExporting(true);
    setIsFullPipelineRunning(true);
    try {
      setPipelineStageLabel(
        'Exportación Dual (1/2): Renderizando versión Vertical 9:16 con Smart Reframe...'
      );
      await runVideoRender(sceneMedia, undefined, 'Dual 9:16 (Smart Reframe)', '9:16');

      setPipelineStageLabel(
        'Exportación Dual (2/2): Renderizando versión Horizontal 16:9 reutilizando arte + Smart Reframe...'
      );
      await runVideoRender(sceneMedia, undefined, 'Dual 16:9 (Smart Reframe)', '16:9');
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== 'Renderizado cancelado.') {
        setStudioError(err.message);
      }
    } finally {
      setIsDualExporting(false);
      setIsFullPipelineRunning(false);
      setPipelineStageLabel('');
    }
  };

  // Auditoría Viral Stress-Test: Zonas Seguras + Mapa de Calor de Energía y Zonas Muertas
  const safeZoneAudit = useMemo(
    () =>
      auditSafeZoneCollisions(
        safeZone,
        aspectRatio,
        subtitleConfig,
        Boolean(activeScene && extractSceneHudMetric(activeScene))
      ),
    [safeZone, aspectRatio, subtitleConfig, activeScene]
  );

  const beatEnergyMetrics = useMemo(() => {
    const rmsBySceneId: Record<string, Float32Array> = {};
    for (const entry of effectiveTimeline) {
      const key = getSceneBufferKey(entry.scene.id);
      const track = sceneVoiceRmsTracksRef.current[key];
      if (track) {
        rmsBySceneId[entry.scene.id] = track;
      }
    }
    return analyzeBeatEnergyHeatmap(
      effectiveTimeline.map((e, index) => ({
        scene: e.scene,
        index,
        startSec: e.startSec,
        endSec: e.endSec,
        durationSec: e.durationSec,
      })),
      rmsBySceneId
    );
  }, [effectiveTimeline, getSceneBufferKey, decodedAudioDurations]);

  const localElapsedInScene = activeEntry
    ? Math.max(0, currentTime - activeEntry.startSec)
    : 0;
  const activeSceneDuration = activeEntry ? Math.max(0.5, activeEntry.durationSec) : 3;
  const twistEntries = effectiveTimeline.filter((e) => e.scene.esGiro30s);
  const anyBusy =
    isFullPipelineRunning ||
    isDualExporting ||
    isBatchGeneratingArt ||
    isOptimizingFlowPrompts ||
    isBatchGeneratingAudio ||
    isRenderingVideo;

  const subtitlePositionClass =
    subtitleConfig.positionY === 'center'
      ? 'top-1/2 -translate-y-1/2'
      : subtitleConfig.positionY === 'lower_mid'
        ? aspectRatio === '9:16'
          ? 'bottom-[26%]'
          : 'bottom-[20%]'
        : aspectRatio === '9:16'
          ? 'bottom-[14%]'
          : 'bottom-8';

  const subtitleSizeClass =
    subtitleConfig.size === 'sm'
      ? 'text-base sm:text-lg'
      : subtitleConfig.size === 'lg'
        ? 'text-2xl sm:text-3xl'
        : 'text-xl sm:text-2xl';

  const fullscreenSubtitleSizeClass =
    subtitleConfig.size === 'sm'
      ? 'text-xl sm:text-2xl'
      : subtitleConfig.size === 'lg'
        ? 'text-3xl sm:text-5xl'
        : 'text-2xl sm:text-4xl';

  return (
    <div className="space-y-6">
      {/* Barra de modos del Estudio Multimedia */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center p-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => onChangeStudioSubMode('story_video')}
            className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              studioSubMode === 'story_video'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Video de historia
          </button>
          <button
            type="button"
            onClick={() => onChangeStudioSubMode('photo_video')}
            className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              studioSubMode === 'photo_video'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Animar foto a video
          </button>
          <button
            type="button"
            onClick={() => onChangeStudioSubMode('image_studio')}
            className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              studioSubMode === 'image_studio'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Crear y editar imágenes
          </button>
          <button
            type="button"
            onClick={() => onChangeStudioSubMode('thumbnail')}
            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              studioSubMode === 'thumbnail'
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <LayoutTemplate className="w-3.5 h-3.5 text-[#F97316]" />
            <span>Portada / Miniatura</span>
          </button>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onBackToEditor}
            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ver guion completo
          </button>
        </div>
      </div>

      {/* Sub-modo 1: Video de historia completo */}
      {studioSubMode === 'story_video' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Izquierda: Vista previa interactiva 9:16 o 16:9 (el lienzo de video permanece oscuro en ambos temas) */}
          <div className="xl:col-span-5 flex flex-col items-center bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="w-full flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Vista previa ({aspectRatio})
                </h2>
                <p className="text-xs text-[var(--text-secondary)] tabular-nums">
                  {voicedCount > 0
                    ? `Voz humana activa (${selectedVoice.name})`
                    : `Voz seleccionada: ${selectedVoice.name}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
                  {(['9:16', '16:9'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => onChangeAspectRatio(ratio)}
                      className={`min-h-[34px] px-2.5 py-1 text-[11px] font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        aspectRatio === ratio
                          ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={enterFullscreen}
                  title="Ver resultado final en pantalla completa"
                  aria-label="Abrir vista previa en pantalla completa"
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-[#F97316]" />
                  <span className="hidden sm:inline">Pantalla completa</span>
                </button>
              </div>
            </div>

            {/* Lienzo 9:16 / 16:9 — siempre negro cinematográfico sin verse afectado por el tema claro/oscuro */}
            <div
              className={`group relative w-full rounded-2xl overflow-hidden border bg-[#07090D] shadow-lg select-none transition-all duration-300 ${
                isScrollTestActive
                  ? 'border-[#F97316] ring-2 ring-[#F97316]/35 ' +
                    (aspectRatio === '9:16' ? 'max-w-[235px] aspect-[9/16]' : 'max-w-[360px] aspect-video')
                  : 'border-[#2A3142] ' +
                    (aspectRatio === '9:16' ? 'max-w-[300px] aspect-[9/16]' : 'aspect-video')
              }`}
            >
              <ProceduralSceneCanvas
                scene={activeScene}
                script={script}
                beatIndex={activeBeatIndex}
                sceneMedia={sceneMedia}
                media={activeScene ? sceneMedia[activeScene.id] : undefined}
                aspectRatio={aspectRatio}
                localElapsed={localElapsedInScene}
                sceneDuration={activeSceneDuration}
                isPlaying={isPlaying || isScrollTestActive}
                accentColor={subtitleConfig.accentColor}
                renderQuality={webgl2Supported ? renderQualityMode : 'classic_2d'}
                globalTimeSec={currentTime}
                prePauseSec={activeEntry?.prePauseSec ?? 0}
                beatRate={activeEntry?.beatRate ?? playbackRate}
                voiceRmsTrack={
                  activeScene
                    ? sceneVoiceRmsTracksRef.current[getSceneBufferKey(activeScene.id)] ?? null
                    : null
                }
              />

              <div className="absolute top-3.5 left-4 right-3 flex items-center justify-between text-xs font-mono text-white/90 tabular-nums z-30">
                <div className="flex items-center gap-1.5">
                  {isScrollTestActive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F97316] text-[10px] font-semibold text-white uppercase tracking-wide">
                      <VolumeX className="w-3 h-3" />
                      <span>Scroll Test {currentTime.toFixed(1)}s / 2.5s</span>
                    </span>
                  ) : (
                    <span>
                      {formatTimecode(currentTime)} / {formatTimecode(totalDuration)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      activeScene?.esGiro30s ? 'text-[#F97316] font-semibold' : 'text-white/80'
                    }
                  >
                    {activeScene?.esGiro30s ? 'CLAVE' : `Escena ${activeScene?.orden ?? 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={enterFullscreen}
                    aria-label="Pantalla completa"
                    className="p-1.5 rounded-md bg-black/55 hover:bg-black/80 text-white/90 hover:text-white transition-colors cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Guía SVG translúcida de Zonas Seguras (solo vista previa 9:16, NUNCA se exporta) */}
              <SafeZoneOverlaySvg
                platform={safeZone}
                aspectRatio={aspectRatio}
                audit={safeZoneAudit}
              />

              <div
                className={`absolute inset-x-5 flex flex-col items-center text-center z-10 ${subtitlePositionClass}`}
              >
                {activeScene && (
                  <div
                    className={
                      isCommercial
                        ? `bg-slate-950/75 backdrop-blur-md border border-white/15 px-3.5 py-2 rounded-xl font-sans font-semibold ${subtitleSizeClass} tracking-normal leading-snug shadow-lg`
                        : subtitleConfig.style === 'impacto'
                          ? `font-display font-extrabold ${subtitleSizeClass} uppercase tracking-tight leading-tight drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)]`
                          : subtitleConfig.style === 'cine'
                            ? `font-display font-semibold ${subtitleSizeClass} tracking-wide leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]`
                            : `bg-black/85 px-3.5 py-2 rounded-lg font-display font-bold ${subtitleSizeClass} uppercase tracking-tight leading-snug`
                    }
                  >
                    {activeWordChunks.tokens.map((tok, idx) => {
                      const isCurrent = idx === activeWordChunks.activeWordIdx;
                      const isImpactStyle = !isCommercial && subtitleConfig.style === 'impacto';
                      const sem = tok.semanticStyle ?? 'normal';
                      const isDanger = !isCommercial && sem === 'danger';
                      const isEmphasis = sem === 'emphasis';
                      const isStat = sem === 'stat';
                      const isWhisper = !isCommercial && sem === 'whisper';

                      const textColor = isCommercial
                        ? isCurrent
                          ? '#FDBA74'
                          : isEmphasis || isStat
                            ? '#FFF7ED'
                            : '#FFFFFF'
                        : isDanger
                          ? isCurrent
                            ? '#FF3B1F'
                            : '#F59E0B'
                          : isStat
                            ? isCurrent
                              ? '#38BDF8'
                              : '#7DD3FC'
                            : isEmphasis
                              ? isCurrent
                                ? subtitleConfig.accentColor
                                : '#FDBA74'
                              : isWhisper
                                ? isCurrent
                                  ? '#E2E8F0'
                                  : '#CBD5E1'
                                : tok.isKeyword
                                  ? isCurrent
                                    ? '#FF3B1F'
                                    : '#FF5A1F'
                                  : isCurrent
                                    ? subtitleConfig.accentColor
                                    : '#FFFFFF';

                      const studioShadow = isCommercial
                        ? '0 1px 4px rgba(0,0,0,0.55)'
                        : isDanger && isImpactStyle
                          ? isCurrent
                            ? '0 3px 0 rgba(0,0,0,0.96), 0 0 20px rgba(255, 45, 22, 0.96), 0 5px 12px rgba(0,0,0,0.96)'
                            : '0 3px 0 rgba(0,0,0,0.94), 0 0 12px rgba(245, 158, 11, 0.78), 0 4px 10px rgba(0,0,0,0.95)'
                          : isStat && isImpactStyle
                            ? isCurrent
                              ? '0 3px 0 rgba(0,0,0,0.96), 0 0 16px rgba(56, 189, 248, 0.92), 0 5px 12px rgba(0,0,0,0.95)'
                              : '0 3px 0 rgba(0,0,0,0.94), 0 0 10px rgba(56, 189, 248, 0.55), 0 4px 10px rgba(0,0,0,0.92)'
                            : isImpactStyle
                              ? isCurrent || isEmphasis
                                ? `0 3px 0 rgba(0,0,0,0.96), 0 0 14px ${subtitleConfig.accentColor}99, 0 5px 12px rgba(0,0,0,0.95)`
                                : '0 3px 0 rgba(0,0,0,0.94), 0 4px 10px rgba(0,0,0,0.92)'
                              : '0 2px 8px rgba(0,0,0,0.95)';

                      const semanticClass = isCommercial
                        ? isStat
                          ? 'tabular-nums'
                          : ''
                        : isStat
                          ? 'font-mono tabular-nums tracking-normal'
                          : isWhisper
                            ? 'italic opacity-75 scale-90 font-semibold'
                            : isEmphasis
                              ? 'scale-[1.12]'
                              : '';

                      return (
                        <span
                          key={`${tok.word}-${tok.index}-${isCurrent ? 'on' : 'off'}`}
                          style={{
                            color: textColor,
                            textShadow: studioShadow,
                            WebkitTextStroke: isImpactStyle ? '1.5px rgba(0,0,0,0.94)' : undefined,
                            paintOrder: isImpactStyle ? 'stroke fill' : undefined,
                          }}
                          className={`inline-block mx-1 ${semanticClass} ${
                            isCurrent && !isCommercial ? 'subtitle-spring-active' : ''
                          }`}
                        >
                          {tok.word}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="absolute bottom-0 inset-x-0 h-1 bg-white/15">
                <div
                  className="h-full bg-[#F97316] transition-all duration-100"
                  style={{ width: `${Math.min(100, (currentTime / totalDuration) * 100)}%` }}
                />
              </div>
            </div>

            {/* Medidor de duración real y monetización +60s */}
            <div className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
              <div className="flex items-center gap-1.5 text-[var(--text-body)]">
                <span className="text-[var(--text-secondary)]">
                  {isAllVoiced ? 'Duración real grabada:' : 'Duración estimada:'}
                </span>
                <strong className="font-mono text-[var(--text-primary)]">
                  {isAllVoiced ? `${realDisplaySec}s` : `~${realDisplaySec}s`}
                </strong>
              </div>
              {meetsTikTok60 ? (
                <span className="inline-flex items-center gap-1 text-[#16A34A] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Apto TikTok +60s</span>
                </span>
              ) : script.plataforma === 'tiktok_creativity' || script.duracionSegundos >= 60 ? (
                <span className="inline-flex items-center gap-1 text-[#D97706] dark:text-[#FBBF24] font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Faltan {missingFor60}s para +60s</span>
                </span>
              ) : (
                <span className="text-[var(--text-secondary)]">Formato corto ágil</span>
              )}
            </div>

            {/* Audio Director Procedural (Foley + SFX sincronizados a foleyCue y HUD) */}
            <div className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                    <Zap className="w-3.5 h-3.5 text-[#F97316]" />
                    <span>Audio Director Procedural (SFX / Foley)</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Sub-drop, risers con clímax antes del corte, whoosh estéreo, latido y HUD clicks.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableAutoSfx}
                  onClick={() => {
                    const next = !enableAutoSfx;
                    setEnableAutoSfx(next);
                    if (next) playLiveSfx('word_pop');
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                    enableAutoSfx ? 'bg-[#F97316]' : 'bg-[var(--border-strong)]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      enableAutoSfx ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {enableAutoSfx && (
                <div className="flex items-center justify-between gap-2.5 pt-1 border-t border-[var(--border-subtle)] text-[11px]">
                  <span className="text-[var(--text-secondary)] shrink-0">
                    Volumen SFX (vs. voz)
                  </span>
                  <input
                    type="range"
                    min={-18}
                    max={0}
                    step={1}
                    value={sfxVolumeDb}
                    aria-label="Volumen SFX en decibelios respecto a la voz"
                    onChange={(e) => setSfxVolumeDb(Number(e.target.value))}
                    className="flex-1 accent-[#F97316] cursor-pointer"
                  />
                  <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums w-12 text-right shrink-0">
                    {sfxVolumeDb} dB
                  </span>
                </div>
              )}
            </div>

            {/* Selector de motor gráfico: Cine 3D (WebGL2 + TrueDepth) vs Rápido (2D Clásico) */}
            <div className="w-full rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                  <Layers className="w-3.5 h-3.5 text-[#F97316]" />
                  <span>Motor visual</span>
                </div>
                <div className="flex items-center p-0.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg">
                  <button
                    type="button"
                    disabled={!webgl2Supported || isRenderingVideo}
                    onClick={() => {
                      setRenderQualityMode('cine_3d');
                      saveRenderQualityMode('cine_3d');
                    }}
                    title={
                      webgl2Supported
                        ? 'Shaders WebGL2 3D con paralaje por profundidad, DoF, iluminación reactiva al audio y partículas con Z-test'
                        : 'WebGL2 no disponible en este dispositivo; usando 2D Clásico'
                    }
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                      webgl2Supported && renderQualityMode === 'cine_3d'
                        ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Cine 3D (WebGL2 + TrueDepth)
                  </button>
                  <button
                    type="button"
                    disabled={isRenderingVideo}
                    onClick={() => {
                      setRenderQualityMode('classic_2d');
                      saveRenderQualityMode('classic_2d');
                    }}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                      !webgl2Supported || renderQualityMode === 'classic_2d'
                        ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Rápido (2D Clásico)
                  </button>
                </div>
              </div>

              {webgl2Supported && renderQualityMode === 'cine_3d' ? (
                <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-[var(--border-subtle)]">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-[var(--text-body)]">
                      TrueDepth IA local (Depth Anything V2)
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] tabular-nums truncate">
                      {!depthSnapshot.trueDepthEnabled
                        ? 'Profundidad instantánea heurística activa (Modo ligero)'
                        : depthSnapshot.phase === 'loading_model'
                          ? `Descargando modelo a caché local (${depthSnapshot.modelLoadProgress}%) · Depth instantáneo activo`
                          : depthSnapshot.phase === 'computing'
                            ? `Calculando TrueDepth (${depthSnapshot.backend.toUpperCase()}) · ${depthSnapshot.aiDepthCount} listas`
                            : depthSnapshot.phase === 'fallback'
                              ? 'Usando profundidad instantánea heurística (<15ms)'
                              : depthSnapshot.aiDepthCount > 0
                                ? `TrueDepth IA listo (${depthSnapshot.backend.toUpperCase()}) · ${depthSnapshot.aiDepthCount} mapas en caché`
                                : 'Listo · Profundidad instantánea + refuerzo IA en segundo plano'}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Activar o desactivar TrueDepth IA local"
                    aria-checked={depthSnapshot.trueDepthEnabled}
                    onClick={() => localDepthEngine.setTrueDepthEnabled(!depthSnapshot.trueDepthEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                      depthSnapshot.trueDepthEnabled ? 'bg-[#F97316]' : 'bg-[var(--border-strong)]'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        depthSnapshot.trueDepthEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-[var(--text-secondary)]">
                  {webgl2Supported
                    ? 'Modo 2D clásico de bajo consumo para equipos ligeros (idéntico en vista previa y MP4).'
                    : 'Este navegador no soporta WebGL2; usando automáticamente el motor 2D clásico.'}
                </p>
              )}
            </div>

            {/* Controles de Zonas seguras + Personalización de Subtítulos */}
            <div className="w-full space-y-3">
              {aspectRatio === '9:16' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <Shield className="w-3.5 h-3.5 text-[#F97316]" />
                      <span>Zonas seguras</span>
                    </span>
                    <div className="flex items-center p-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
                      {SAFE_ZONES.map((sz) => (
                        <button
                          key={sz.id}
                          type="button"
                          onClick={() => setSafeZone(sz.id)}
                          className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            safeZone === sz.id
                              ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {sz.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {safeZone !== 'none' && safeZoneAudit.hasCollision && (
                    <div className="rounded-lg border border-red-500/45 bg-red-500/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Colisión detectada en {safeZone.toUpperCase()}</span>
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] leading-snug">
                          {safeZoneAudit.warnings[0]}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeSubtitleConfig(safeZoneAudit.recommendedSubtitleConfig)
                        }
                        className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-[10px] font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      >
                        <Wand2 className="w-3 h-3" />
                        <span>Auto-ajustar a Zona Segura</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-[var(--text-secondary)]">Estilo subtítulo</span>
                <div className="flex items-center p-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
                  {SUBTITLE_STYLES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => onChangeSubtitleConfig({ ...subtitleConfig, style: st.id })}
                      className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        subtitleConfig.style === st.id
                          ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center p-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
                  {SUBTITLE_POSITIONS.map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() =>
                        onChangeSubtitleConfig({ ...subtitleConfig, positionY: pos.id })
                      }
                      className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        subtitleConfig.positionY === pos.id
                          ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center p-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
                    {SUBTITLE_SIZES.map((sz) => (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() => onChangeSubtitleConfig({ ...subtitleConfig, size: sz.id })}
                        className={`px-2 py-1 text-[11px] font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                          subtitleConfig.size === sz.id
                            ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {sz.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    {SUBTITLE_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() =>
                          onChangeSubtitleConfig({ ...subtitleConfig, accentColor: hex })
                        }
                        aria-label={`Color de acento ${hex}`}
                        style={{ backgroundColor: hex }}
                        className={`w-4 h-4 rounded-full cursor-pointer border transition-transform ${
                          subtitleConfig.accentColor === hex
                            ? 'border-[var(--text-primary)] scale-115'
                            : 'border-slate-400/50 opacity-85 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative pt-1 space-y-2.5">
                <div>
                  <input
                    type="range"
                    min={0}
                    max={totalDuration}
                    step={0.1}
                    value={Math.min(currentTime, totalDuration)}
                    aria-label="Línea de tiempo audiovisual"
                    onChange={(e) => handleSeekTimeline(Number(e.target.value))}
                    className="w-full accent-[#F97316] cursor-pointer"
                  />
                  <div className="relative h-4 text-[10px] font-mono text-[var(--text-secondary)] tabular-nums">
                    <span className="absolute left-0">0:00</span>
                    {twistEntries.map((tw) => (
                      <button
                        key={tw.scene.id}
                        type="button"
                        onClick={() => handleSeekTimeline(tw.startSec)}
                        style={{ left: `${(tw.startSec / totalDuration) * 100}%` }}
                        className="absolute -translate-x-1/2 text-[#F97316] hover:text-[#EA580C] font-semibold cursor-pointer"
                      >
                        {formatTimecode(tw.startSec)}
                      </button>
                    ))}
                    <span className="absolute right-0">{formatTimecode(totalDuration)}</span>
                  </div>
                </div>

                {/* Mini-Timeline de Energía y Retención (Heatmap + Zonas Muertas) */}
                <RetentionHeatmapTimeline
                  metrics={beatEnergyMetrics}
                  activeBeatIndex={activeBeatIndex}
                  totalDurationSec={totalDuration}
                  onJumpToBeat={(beat) => {
                    setIsScrollTestActive(false);
                    handleSeekTimeline(beat.startSec);
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isPreparingPlaybackAudio}
                    onClick={handleTogglePlay}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-70 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isPreparingPlaybackAudio ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isPreparingPlaybackAudio
                        ? 'Preparando 48 kHz...'
                        : isPlaying
                          ? 'Pausar'
                          : 'Reproducir'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleScrollTest}
                    title="Reproduce en bucle los primeros 2.5 segundos en silencio a escala de feed móvil para probar el gancho visual puro"
                    className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isScrollTestActive
                        ? 'bg-[#F97316]/15 border-[#F97316] text-[#F97316]'
                        : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-strong)] text-[var(--text-primary)]'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[#F97316]" />
                    <span>{isScrollTestActive ? 'Detener Scroll Test' : 'Scroll Test (2.5s Mute)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsScrollTestActive(false);
                      setCurrentTime(0);
                      setIsPlaying(false);
                      stopActiveAudio();
                    }}
                    className="min-h-[40px] inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reiniciar</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVoiceEnabled((v) => !v)}
                    className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      voiceEnabled
                        ? 'bg-[#F97316]/10 border-[#F97316] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {voiceEnabled ? (
                      <Volume2 className="w-3.5 h-3.5 text-[#F97316]" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5" />
                    )}
                    <span>Voz</span>
                  </button>

                  <div className="flex items-center p-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
                    {([1, 1.15, 1.25] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => handleChangePlaybackRate(rate)}
                        title={`Velocidad real ${rate}x (aplica a vista previa y .MP4 exportado)`}
                        className={`min-h-[34px] px-2 py-1 text-[11px] font-mono rounded-md transition-colors cursor-pointer tabular-nums ${
                          playbackRate === rate
                            ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Derecha: Producción completa */}
          <div className="xl:col-span-7 space-y-6">
            <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 sm:p-6 space-y-6">
              <div className="space-y-1">
                <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                  Estudio de Producción Directa ({aspectRatio})
                </h1>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Flujo autónomo listo para TikTok, Shorts y Reels: micro-escenas 2.5D con paralaje,
                  color grading de cine, tarjetas HUD animadas, auto-ducking real (12% voz / 28%
                  pausas) y exportación nativa a{' '}
                  <strong className="text-[var(--text-primary)] font-semibold">.MP4</strong>.
                </p>
              </div>

              {/* Acción maestra 1-clic con Bloqueo de Seguridad Dual (100% Arte AI + 100% Audios 48 kHz en memoria) */}
              <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      Producción y descarga segura (.MP4 30fps · 48 kHz Estéreo)
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {pipelineStageLabel ||
                        (isExportUnlocked
                          ? `100% verificado en memoria (${artReadiness.readyCount}/${artReadiness.totalCount} imágenes AI + ${audioReadiness.readyCount}/${audioReadiness.totalCount} audios 48 kHz ${selectedVoice.name}) · Cero desfase.`
                          : !artReadiness.allReady
                            ? `Bloqueo de seguridad: esperando arte AI (${artReadiness.readyCount}/${artReadiness.totalCount} · ~${artReadiness.estimatedRemainingSec}s) y audio 48 kHz (${audioReadiness.readyCount}/${audioReadiness.totalCount}).`
                            : `Bloqueo de seguridad: preparando pistas de audio 48 kHz (${audioReadiness.readyCount}/${audioReadiness.totalCount}) para ${selectedVoice.name}.`)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {artReadiness.allReady && !audioReadiness.allReady && !isBatchGeneratingAudio && (
                      <button
                        type="button"
                        onClick={handleBatchAudio}
                        className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[#F97316] text-xs font-semibold text-[#F97316] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Mic className="w-4 h-4" />
                        <span>Preparar voces 48 kHz</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleFullAutoProduction}
                      disabled={anyBusy || !isExportUnlocked}
                      title={
                        isExportUnlocked
                          ? 'Ensamblar pista unificada 48 kHz + micro-cortes 3.4s + subtítulos sincronizados y descargar video completo'
                          : `Bloqueo de seguridad: Arte ${artReadiness.readyCount}/${artReadiness.totalCount} · Audio ${audioReadiness.readyCount}/${audioReadiness.totalCount}`
                      }
                      className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isFullPipelineRunning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : !isExportUnlocked ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      <span>
                        {isFullPipelineRunning
                          ? 'Produciendo...'
                          : !artReadiness.allReady
                            ? `Esperando arte (${artReadiness.readyCount}/${artReadiness.totalCount})`
                            : !audioReadiness.allReady
                              ? `Esperando audio (${audioReadiness.readyCount}/${audioReadiness.totalCount})`
                              : 'Descargar video completo'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] tabular-nums">
                      <span
                        className={
                          artReadiness.allReady
                            ? 'text-[#16A34A] font-semibold inline-flex items-center gap-1'
                            : 'text-[var(--text-secondary)] font-medium inline-flex items-center gap-1'
                        }
                      >
                        {artReadiness.allReady ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                        )}
                        <span>
                          Arte AI: {artReadiness.readyCount}/{artReadiness.totalCount}
                          {!artReadiness.allReady && artReadiness.estimatedRemainingSec > 0
                            ? ` (~${artReadiness.estimatedRemainingSec}s)`
                            : ' listo'}
                        </span>
                      </span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {Math.round(
                          (artReadiness.readyCount / Math.max(1, artReadiness.totalCount)) * 100
                        )}
                        %
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--bg-card)] overflow-hidden border border-[var(--border-subtle)]">
                      <div
                        className={`h-full transition-all duration-300 ${
                          artReadiness.allReady ? 'bg-[#16A34A]' : 'bg-[#F97316]'
                        }`}
                        style={{
                          width: `${Math.round(
                            (artReadiness.readyCount / Math.max(1, artReadiness.totalCount)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] tabular-nums">
                      <span
                        className={
                          audioReadiness.allReady
                            ? 'text-[#16A34A] font-semibold inline-flex items-center gap-1'
                            : 'text-[var(--text-secondary)] font-medium inline-flex items-center gap-1'
                        }
                      >
                        {audioReadiness.allReady ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                        )}
                        <span>
                          Audio 48 kHz ({selectedVoice.name}): {audioReadiness.readyCount}/
                          {audioReadiness.totalCount}
                        </span>
                      </span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {Math.round(
                          (audioReadiness.readyCount / Math.max(1, audioReadiness.totalCount)) * 100
                        )}
                        %
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--bg-card)] overflow-hidden border border-[var(--border-subtle)]">
                      <div
                        className={`h-full transition-all duration-300 ${
                          audioReadiness.allReady ? 'bg-[#16A34A]' : 'bg-[#F97316]'
                        }`}
                        style={{
                          width: `${Math.round(
                            (audioReadiness.readyCount / Math.max(1, audioReadiness.totalCount)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {studioError && (
                <div
                  role="alert"
                  className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-3.5 py-2.5 text-xs text-[var(--text-danger)]"
                >
                  {studioError}
                </div>
              )}

              {/* Paso 1: Rejilla compacta de Micro-Escenas 2.5D (flujo autónomo directo en Gortex) */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        01. Micro-Escenas Cinematográficas 2.5D (Beats 3–4s)
                      </h2>
                      <p className="text-xs text-[var(--text-secondary)] tabular-nums">
                        <strong className="text-[var(--text-primary)] font-semibold">
                          {artReadiness.readyCount} de {artReadiness.totalCount} escenas listas
                        </strong>{' '}
                        · ~{(totalDuration / Math.max(1, script.escenas.length)).toFixed(1)}s por corte
                        {uploadedClipsCount > 0 ? ` · ${uploadedClipsCount} clips externos` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                      {!artReadiness.allReady && artReadiness.estimatedRemainingSec > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[#F97316]">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Cola rápida (~{artReadiness.estimatedRemainingSec}s)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#16A34A] font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>100% listo</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Barra global de progreso de la cola de micro-escenas */}
                  <div className="h-1.5 w-full rounded-full bg-[var(--bg-surface)] overflow-hidden border border-[var(--border-subtle)]">
                    <div
                      className={`h-full transition-all duration-300 ${
                        artReadiness.allReady ? 'bg-[#16A34A]' : 'bg-[#F97316]'
                      }`}
                      style={{
                        width: `${Math.round(
                          (artReadiness.readyCount / Math.max(1, artReadiness.totalCount)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {flowNotice && (
                  <p className="text-xs text-[var(--text-accent-soft)] leading-relaxed">
                    {flowNotice}
                  </p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[540px] overflow-y-auto pr-1">
                  {effectiveTimeline.map(({ scene: sc, startSec, endSec }) => {
                    const media = sceneMedia[sc.id];
                    const isCurrent = activeScene?.id === sc.id;
                    const hasVideoClip = Boolean(media?.videoClipUrl);
                    const hasCustomPhoto = Boolean(
                      !hasVideoClip &&
                        media?.imageDataUrl &&
                        !isLegacyFlatSvgDataUrl(media.imageDataUrl)
                    );
                    const hudMetric = extractSceneHudMetric(sc);
                    const kwList = getSceneVisualKeywords(sc).slice(0, 2);

                    return (
                      <div
                        key={sc.id}
                        className={`rounded-xl border p-2 flex flex-col gap-2 transition-colors bg-[var(--bg-surface)] ${
                          isCurrent
                            ? 'border-[#F97316] ring-1 ring-[#F97316]/30'
                            : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        {/* Encabezado compacto: número de beat + rango exacto (0:00–0:04) */}
                        <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums">
                          <span
                            className={`font-bold ${
                              sc.esGiro30s ? 'text-[#F97316]' : 'text-[var(--text-primary)]'
                            }`}
                          >
                            #{String(sc.orden).padStart(2, '0')}
                            {sc.esGiro30s ? ' · GIRO' : ''}
                          </span>
                          <span className="text-[var(--text-secondary)]">
                            {formatTimecode(startSec)}–{formatTimecode(endSec)}
                          </span>
                        </div>

                        {/* Miniatura viva clicable (Arte AI 2.5D o Clip externo) */}
                        <button
                          type="button"
                          onClick={() => handleSeekTimeline(startSec)}
                          title={`Saltar al corte #${sc.orden} (${formatTimecode(startSec)}–${formatTimecode(endSec)})`}
                          className={`relative w-full rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[#07090D] cursor-pointer ${
                            aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[4/5]'
                          }`}
                        >
                          {hasVideoClip && media?.videoClipUrl ? (
                            <video
                              src={media.videoClipUrl}
                              muted
                              loop
                              autoPlay
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <AiSceneThumbnail
                              scene={sc}
                              script={script}
                              aspectRatio={aspectRatio}
                              overrideSeed={media?.imageSeed}
                              customImageUrl={hasCustomPhoto ? media?.imageDataUrl : undefined}
                              alt={`Micro-escena ${sc.orden}: ${sc.subtituloDinamico}`}
                            />
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/35 to-transparent px-1.5 py-1 flex items-center justify-between text-[10px] text-white">
                            <span className="truncate font-medium">
                              {hasVideoClip
                                ? 'Clip externo'
                                : hasCustomPhoto
                                  ? 'Foto propia'
                                  : getSceneVisualBadgeLabel(sc, script)}
                            </span>
                            {hasVideoClip && <Video className="w-3 h-3 text-[#F97316] shrink-0" />}
                          </div>
                        </button>

                        {/* Texto breve del beat + dato HUD automático */}
                        <div className="space-y-1 flex-1">
                          <p className="text-[11px] text-[var(--text-body)] line-clamp-2 leading-snug">
                            {sc.narracion}
                          </p>
                          {(hudMetric || kwList.length > 0) && (
                            <div className="text-[10px] font-mono text-[var(--text-secondary)] truncate tabular-nums">
                              {hudMetric ? (
                                <span className="font-semibold text-[#EA580C] dark:text-[#FDBA74]">
                                  HUD {hudMetric.displayFull}
                                </span>
                              ) : (
                                <span className="text-[#EA580C] dark:text-[#FF7A4D]">
                                  {kwList.join(' · ')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Acción limpia de estudio: regenerar variante 2.5D o volver a arte AI */}
                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          {hasVideoClip || hasCustomPhoto ? (
                            <button
                              type="button"
                              onClick={() => onClearSceneVisual(sc.id)}
                              className="min-h-[28px] w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                              <span>Volver a arte AI</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onRegenerateSceneImage(sc.id);
                                setFlowNotice(
                                  `Regenerando arte AI para la micro-escena #${sc.orden}...`
                                );
                              }}
                              title="Regenerar nueva variante visual AI para esta micro-escena"
                              className="min-h-[28px] w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] text-[10px] font-medium text-[var(--text-secondary)] hover:text-[#F97316] transition-colors cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Nueva variante</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Paso 2: Voces en español 100% gratuitas + Micrófono / Subir MP3 */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      02. Motor de Voz Unificado 48 kHz (idéntica en Probar, Vista Previa y .MP4)
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)] tabular-nums">
                      {audioProgressLabel ||
                        `${audioReadiness.readyCount} de ${audioReadiness.totalCount} pistas AudioBuffer 48 kHz en memoria · Limitador suave -1 dBFS`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBatchAudio}
                    disabled={anyBusy}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] disabled:opacity-50 text-xs font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isBatchGeneratingAudio ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                    ) : (
                      <Mic className="w-3.5 h-3.5 text-[#F97316]" />
                    )}
                    <span>
                      {isBatchGeneratingAudio
                        ? 'Preparando 48 kHz...'
                        : `Sincronizar voz (${selectedVoice.name})`}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {HUMAN_VOICE_PROFILES.map((profile) => {
                    const active = selectedVoiceId === profile.id;
                    const isVoicePlaying = playingVoiceId === profile.id;
                    const isVoiceLoading = auditionLoadingId === profile.id;
                    return (
                      <div
                        key={profile.id}
                        className={`rounded-lg border px-3 py-2.5 flex items-start justify-between gap-2 transition-colors ${
                          active
                            ? 'bg-[#F97316]/10 border-[#F97316]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onChangeVoiceId(profile.id)}
                          className="text-left min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {profile.label}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                            {profile.description}
                          </div>
                        </button>

                        <button
                          type="button"
                          disabled={isRenderingVideo}
                          onClick={() => void handleAuditionVoice(profile)}
                          className={`min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded border disabled:opacity-50 text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            isVoicePlaying
                              ? 'bg-[#F97316]/15 border-[#F97316] text-[var(--text-accent-soft)]'
                              : 'bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-strong)] text-[var(--text-primary)]'
                          }`}
                        >
                          {isVoiceLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin text-[#F97316]" />
                          ) : isVoicePlaying ? (
                            <Square className="w-3 h-3 fill-current text-[#F97316]" />
                          ) : (
                            <Volume2 className="w-3 h-3 text-[#F97316]" />
                          )}
                          <span>
                            {isVoiceLoading ? 'Cargando' : isVoicePlaying ? 'Detener' : 'Probar'}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Opción local para grabar voz propia con micrófono o subir un .MP3/.WAV */}
                {activeScene && (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        Tu propia voz · Escena {activeScene.orden}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">
                        {sceneMedia[activeScene.id]?.audioSource === 'custom_mic' ||
                        sceneMedia[activeScene.id]?.audioSource === 'custom_file'
                          ? `Audio cargado: ${sceneMedia[activeScene.id]?.audioFileName || 'Voz propia'}`
                          : 'Graba con tu micrófono o sube un .MP3 / .WAV para incluirlo en el video'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isRenderingVideo}
                        onClick={() => void handleToggleMicRecording(activeScene)}
                        className={`min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          isRecordingMic
                            ? 'bg-red-500/15 border-red-500 text-red-600 dark:text-red-300'
                            : 'bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-strong)] text-[var(--text-primary)]'
                        }`}
                      >
                        {isRecordingMic ? (
                          <Square className="w-3 h-3 fill-current" />
                        ) : (
                          <Mic className="w-3.5 h-3.5 text-[#F97316]" />
                        )}
                        <span className="tabular-nums">
                          {isRecordingMic ? `Detener (${formatTimecode(recordingSec)})` : 'Grabar micrófono'}
                        </span>
                      </button>

                      <label className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-[11px] font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-[#F97316]" />
                        <span>Subir .MP3</span>
                        <input
                          type="file"
                          accept="audio/*"
                          className="sr-only"
                          onChange={(e) => {
                            void handleUploadCustomVoiceFile(activeScene, e.target.files?.[0]);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>

                      {(sceneMedia[activeScene.id]?.audioSource === 'custom_mic' ||
                        sceneMedia[activeScene.id]?.audioSource === 'custom_file') && (
                        <button
                          type="button"
                          onClick={() => onClearSceneAudio(activeScene.id)}
                          title="Quitar voz personalizada y volver a la voz automática"
                          className="min-h-[34px] inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Quitar</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Paso 3: Música libre de derechos y efectos de sonido */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      03. Música libre de copyright y efectos de sonido
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Música sintetizada 100% original (cero reclamos) con ducking automático cuando
                      entra la voz.
                    </p>
                  </div>
                  {backgroundMusicId !== 'none' && (
                    <button
                      type="button"
                      onClick={() => void handleToggleMusicPreview()}
                      className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isPreviewingMusic
                          ? 'bg-[#F97316]/15 border-[#F97316] text-[var(--text-accent-soft)]'
                          : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-strong)] text-[var(--text-primary)]'
                      }`}
                    >
                      {isPreviewingMusic ? (
                        <Square className="w-3 h-3 fill-current text-[#F97316]" />
                      ) : (
                        <Music className="w-3.5 h-3.5 text-[#F97316]" />
                      )}
                      <span>{isPreviewingMusic ? 'Detener música' : 'Probar música'}</span>
                    </button>
                  )}
                </div>

                {/* Accesos rápidos de música ambiental cinematográfica */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'suspenso_abisal', label: 'Suspenso Abisal' },
                      { id: 'misterio_espacial', label: 'Misterio Espacial' },
                      { id: 'tension_cinematografica', label: 'Tensión Cinematográfica' },
                      { id: 'none', label: 'Ninguna' },
                    ] as const
                  ).map((preset) => {
                    const active = backgroundMusicId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          stopMusicPreview();
                          setIsPreviewingMusic(false);
                          onChangeBackgroundMusicId(preset.id);
                        }}
                        className={`min-h-[34px] px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#F97316]/12 border-[#F97316] text-[#EA580C] dark:text-[#FDBA74] font-semibold'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-6">
                    <select
                      aria-label="Música de fondo libre de copyright"
                      value={backgroundMusicId}
                      onChange={(e) => {
                        stopMusicPreview();
                        setIsPreviewingMusic(false);
                        onChangeBackgroundMusicId(e.target.value as BackgroundMusicId);
                      }}
                      className="w-full min-h-[42px] rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#F97316]"
                    >
                      {BACKGROUND_MUSIC_TRACKS.map((track) => (
                        <option key={track.id} value={track.id}>
                          {track.label} — {track.mood}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-6 flex flex-wrap items-center justify-between gap-3">
                    {backgroundMusicId !== 'none' && (
                      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] flex-1 min-w-[150px]">
                        <span className="shrink-0 tabular-nums">
                          Vol. música: {Math.round(musicVolume * 100)}%
                        </span>
                        <input
                          type="range"
                          min={0.04}
                          max={0.45}
                          step={0.02}
                          value={musicVolume}
                          onChange={(e) => setMusicVolume(Number(e.target.value))}
                          className="flex-1 accent-[#F97316] cursor-pointer"
                        />
                      </label>
                    )}

                    <label className="inline-flex items-center gap-2 text-xs text-[var(--text-body)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={enableAutoSfx}
                        onChange={(e) => {
                          setEnableAutoSfx(e.target.checked);
                          if (e.target.checked) playLiveSfx('word_pop');
                        }}
                        className="accent-[#F97316] w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Audio Director Procedural ({sfxVolumeDb} dB · auto-ducking 12% voz)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Paso 4: Renderizar video completo (.MP4 universal o .WEBM) */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      04. Exportar video nativo ({aspectRatio} · .{exportFormat.toUpperCase()}
                      {playbackRate !== 1 ? ` · ${playbackRate}x` : ''})
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Ensamblado determinista con mp4-muxer (H.264 30fps + AAC 48 kHz Estéreo a{' '}
                      {playbackRate}x con limitador -1 dBFS), cross-dissolve 120ms y subtítulos
                      listos para TikTok, Shorts e iOS.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center p-0.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
                      <button
                        type="button"
                        disabled={isRenderingVideo}
                        onClick={() => setExportFormat('mp4')}
                        className={`min-h-[36px] px-2.5 py-1 text-[11px] font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                          exportFormat === 'mp4'
                            ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        .MP4 Universal
                      </button>
                      <button
                        type="button"
                        disabled={isRenderingVideo}
                        onClick={() => setExportFormat('webm')}
                        className={`min-h-[36px] px-2.5 py-1 text-[11px] font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                          exportFormat === 'webm'
                            ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-xs'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        .WEBM Rápido
                      </button>
                    </div>

                    {isRenderingVideo ? (
                      <button
                        type="button"
                        onClick={() => renderAbortRef.current?.abort()}
                        className="min-h-[42px] px-4 py-2 rounded-lg bg-[#DC2626]/15 border border-[#DC2626]/50 text-xs font-semibold text-[var(--text-danger)] hover:bg-[#DC2626]/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Cancelar exportación
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={anyBusy || !isExportUnlocked}
                        title={
                          isExportUnlocked
                            ? `Renderizar y descargar video .${exportFormat.toUpperCase()} a ${playbackRate}x (H.264 30fps CFR + 48 kHz Estéreo)`
                            : `Bloqueo de seguridad: Arte ${artReadiness.readyCount}/${artReadiness.totalCount} · Audio ${audioReadiness.readyCount}/${audioReadiness.totalCount}`
                        }
                        onClick={() => void handleFullAutoProduction()}
                        className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isExportUnlocked ? (
                          <Film className="w-4 h-4" />
                        ) : (
                          <Lock className="w-4 h-4" />
                        )}
                        <span>
                          {isExportUnlocked
                            ? `Renderizar y descargar .${exportFormat.toUpperCase()}${playbackRate !== 1 ? ` (${playbackRate}x)` : ''}`
                            : !artReadiness.allReady
                              ? `Bloqueado (${artReadiness.readyCount}/${artReadiness.totalCount} arte)`
                              : `Bloqueado (${audioReadiness.readyCount}/${audioReadiness.totalCount} audio)`}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {bgTabWarning && isRenderingVideo && (
                  <div className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3.5 py-2.5 text-xs text-[var(--text-warning)] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Modo de respaldo en tiempo real activo: mantén esta pestaña visible mientras
                      termina la grabación.
                    </span>
                  </div>
                )}

                {exportFallbackNotice && !isRenderingVideo && (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-[11px] text-[var(--text-secondary)] flex items-center justify-between gap-2">
                    <span>{exportFallbackNotice}</span>
                    <button
                      type="button"
                      onClick={() => setExportFallbackNotice(null)}
                      aria-label="Cerrar aviso"
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {isRenderingVideo && (
                  <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                      <span className="font-medium text-[var(--text-primary)]">
                        {renderProgressInfo?.label || renderLabel}
                      </span>
                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        {typeof renderProgressInfo?.speedMultiplier === 'number' && (
                          <span className="text-[var(--text-secondary)]">
                            {renderProgressInfo.speedMultiplier.toFixed(1)}x tiempo real
                          </span>
                        )}
                        {typeof renderProgressInfo?.etaSec === 'number' && (
                          <span className="text-[var(--text-secondary)]">
                            ~{renderProgressInfo.etaSec}s restantes
                          </span>
                        )}
                        <span className="font-semibold text-[#F97316]">{renderPercent}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--bg-card)] overflow-hidden border border-[var(--border-subtle)]">
                      <div
                        className="h-full bg-[#F97316] transition-all duration-150"
                        style={{ width: `${renderPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Exportación Dual Smart Reframe (9:16 + 16:9) y Hook Factory (3 Variantes A/B en lote) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={anyBusy || !isExportUnlocked}
                    onClick={() => void handleDualExport()}
                    title="Exporta 9:16 (TikTok/Shorts/Reels) y 16:9 (YouTube) en secuencia reutilizando las mismas imágenes con Smart Reframe por mapa de profundidad"
                    className="min-h-[44px] flex items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] disabled:opacity-50 disabled:cursor-not-allowed text-left transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                        {isDualExporting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                        ) : (
                          <Columns2 className="w-3.5 h-3.5 text-[#F97316]" />
                        )}
                        <span>
                          {isDualExporting
                            ? 'Exportando Dual...'
                            : 'Exportar Dual (9:16 + 16:9)'}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--text-secondary)] truncate">
                        Smart Reframe por profundidad · Sin regenerar imágenes
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={anyBusy || !isExportUnlocked || script.escenas.length < 2}
                    onClick={() => {
                      setIsPlaying(false);
                      setIsScrollTestActive(false);
                      stopActiveAudio();
                      setIsHookFactoryOpen(true);
                    }}
                    title="Genera 3 versiones del mismo video con ganchos A/B/C en los primeros 2 beats y descarga un pack .ZIP sin re-renderizar el cuerpo"
                    className="min-h-[44px] flex items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border border-[#F97316]/50 disabled:opacity-50 disabled:cursor-not-allowed text-left transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                        <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
                        <span>Hook Factory (3 Variantes A/B)</span>
                      </div>
                      <p className="text-[10px] text-[var(--text-secondary)] truncate">
                        3 MP4 (Ganchos A/B/C) + Pack .ZIP en 1 pasada
                      </p>
                    </div>
                  </button>
                </div>

                {/* Acceso rápido al Kit de Publicación Viral (se abre automáticamente al terminar el .MP4) */}
                <div className="pt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    ¿Listo para subirlo a TikTok, Shorts o Reels?
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPublishingKit((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F97316] hover:text-[#EA580C] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {showPublishingKit
                        ? 'Ocultar Kit de Publicación Viral'
                        : 'Ver Kit de Publicación Viral'}
                    </span>
                  </button>
                </div>
              </div>
            </section>

            {/* Kit de Publicación Viral (3 títulos CTR + Descripción con hashtags + Prompt de portada visualBible) */}
            {showPublishingKit && (
              <section className="bg-[var(--bg-card)] border border-[#F97316]/45 shadow-[var(--shadow-card)] rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F97316]">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Kit de Publicación Viral listo para copiar</span>
                    </div>
                    <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
                      Títulos de alto CTR, descripción persuasiva y portada alineada al estilo
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPublishingKit(false)}
                    aria-label="Cerrar Kit de Publicación Viral"
                    className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 1. Tres títulos de alto CTR */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    1. 3 Títulos de alto CTR
                  </div>
                  <div className="space-y-1.5">
                    {publishingKitData.titles.map((titleText, idx) => {
                      const copyKey = `title-${idx}`;
                      return (
                        <div
                          key={copyKey}
                          className="flex items-center justify-between gap-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2"
                        >
                          <p className="text-xs font-medium text-[var(--text-primary)] leading-snug">
                            <span className="font-mono text-[#F97316] mr-1.5">{idx + 1}.</span>
                            {titleText}
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleCopyKitItem(copyKey, titleText)}
                            className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {copiedKitId === copyKey ? (
                              <Check className="w-3 h-3 text-[#16A34A]" />
                            ) : (
                              <Copy className="w-3 h-3 text-[#F97316]" />
                            )}
                            <span>{copiedKitId === copyKey ? 'Copiado' : 'Copiar'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Descripción persuasiva + hashtags estratégicos */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      2. Descripción persuasiva y hashtags (TikTok / Shorts / Reels)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyKitItem('desc-full', publishingKitData.fullDescriptionWithTags)
                      }
                      className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedKitId === 'desc-full' ? (
                        <Check className="w-3 h-3 text-[#16A34A]" />
                      ) : (
                        <Copy className="w-3 h-3 text-[#F97316]" />
                      )}
                      <span>{copiedKitId === 'desc-full' ? 'Copiada' : 'Copiar todo'}</span>
                    </button>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 space-y-2">
                    <p className="text-xs text-[var(--text-body)] leading-relaxed">
                      {publishingKitData.description}
                    </p>
                    <p className="text-[11px] font-mono text-[#F97316] leading-relaxed break-words">
                      {publishingKitData.hashtagsLine}
                    </p>
                  </div>
                </div>

                {/* 3. Prompt optimizado de Portada / Miniatura alineado al visualBible */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      3. Prompt de portada / miniatura (alineado al estilo visual)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopyKitItem('cover-prompt', publishingKitData.coverPrompt)
                        }
                        className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedKitId === 'cover-prompt' ? (
                          <Check className="w-3 h-3 text-[#16A34A]" />
                        ) : (
                          <Copy className="w-3 h-3 text-[#F97316]" />
                        )}
                        <span>{copiedKitId === 'cover-prompt' ? 'Copiado' : 'Copiar prompt'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeStudioSubMode('thumbnail')}
                        className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F97316] hover:bg-[#EA580C] text-[11px] font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <LayoutTemplate className="w-3 h-3" />
                        <span>Crear portada</span>
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3">
                    <p className="text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed">
                      {publishingKitData.coverPrompt}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Panel secundario colapsado por defecto: Google Flow / Clips externos opcionales */}
            <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
              <button
                type="button"
                aria-expanded={isAdvancedFlowOpen}
                onClick={() => setIsAdvancedFlowOpen((open) => !open)}
                className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <SlidersHorizontal className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      Opciones Avanzadas / Reemplazar con Google Flow (Opcional)
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] truncate">
                      Prompts en inglés para herramientas externas y carga manual de clips{' '}
                      {uploadedClipsCount > 0 ? `· ${uploadedClipsCount} cargados` : ''}
                    </div>
                  </div>
                </div>
                {isAdvancedFlowOpen ? (
                  <ChevronUp className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                )}
              </button>

              {isAdvancedFlowOpen && (
                <div className="px-5 pb-5 pt-3 border-t border-[var(--border-subtle)] space-y-4">
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    No necesitas herramientas externas: Gortex ya renderiza cada micro-escena en
                    2.5D con paralaje, HUD y sonido de estudio. Usa estas herramientas solo si
                    deseas sustituir escenas concretas con clips de Google Flow o subir fotos
                    propias.
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyAllFlowPrompts()}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedAllPrompts ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-[#F97316]" />
                      )}
                      <span>
                        {copiedAllPrompts
                          ? 'Todos copiados'
                          : `Copiar ${script.escenas.length} prompts Flow`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadCompleteTxtPack}
                      title="Descarga el guion completo y todos los prompts de Google Flow en un único archivo .txt"
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#F97316]" />
                      <span>Paquete (.txt)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleOptimizeAllFlowPrompts()}
                      disabled={anyBusy}
                      title="Reescribe los prompts en inglés con Gemini 2.5 Flash (gratis)"
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] disabled:opacity-50 text-xs font-medium text-[var(--text-body)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isOptimizingFlowPrompts ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F97316]" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
                      )}
                      <span>
                        {isOptimizingFlowPrompts ? 'Optimizando...' : 'Optimizar prompts'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={onOpenProGuide}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#F97316]" />
                      <span>Guía Gortex + Flow</span>
                    </button>
                  </div>

                  {/* Lista compacta por micro-escena para copiar Prompt Flow o subir ↑ Clip */}
                  <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[300px] overflow-y-auto">
                    {effectiveTimeline.map(({ scene: sc, startSec, endSec }) => {
                      const media = sceneMedia[sc.id];
                      const hasVideoClip = Boolean(media?.videoClipUrl);
                      const hasCustomPhoto = Boolean(
                        !hasVideoClip &&
                          media?.imageDataUrl &&
                          !isLegacyFlatSvgDataUrl(media.imageDataUrl)
                      );
                      const isCopied = copiedPromptId === sc.id;

                      return (
                        <div
                          key={`flow-${sc.id}`}
                          className="px-3 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--text-secondary)] tabular-nums">
                              <span className="font-bold text-[var(--text-primary)]">
                                #{String(sc.orden).padStart(2, '0')}
                              </span>
                              <span>
                                {formatTimecode(startSec)}–{formatTimecode(endSec)}
                              </span>
                              {hasVideoClip && (
                                <span className="text-[#16A34A] font-semibold">· Clip activo</span>
                              )}
                              {hasCustomPhoto && (
                                <span className="text-[#F97316] font-semibold">· Foto activa</span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--text-body)] truncate">
                              {sc.narracion}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => void handleCopyFlowPrompt(sc)}
                              title="Copiar prompt en inglés de esta micro-escena para Google Flow"
                              className={`min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[10px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                isCopied
                                  ? 'bg-[#16A34A]/15 border-[#16A34A] text-[#15803D] dark:text-[#86EFAC]'
                                  : 'bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border-[var(--border-strong)] text-[var(--text-primary)]'
                              }`}
                            >
                              {isCopied ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                <Copy className="w-3 h-3 text-[#F97316]" />
                              )}
                              <span>{isCopied ? 'Copiado' : 'Copiar Prompt Flow'}</span>
                            </button>

                            <label
                              title="Reemplazar esta micro-escena con un clip de video (MP4/WebM/MOV) o foto"
                              className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--bg-card)] hover:bg-[var(--bg-elevated-hover)] border border-[var(--border-strong)] text-[10px] font-semibold text-[var(--text-primary)] transition-colors whitespace-nowrap cursor-pointer"
                            >
                              <Upload className="w-3 h-3 text-[#F97316]" />
                              <span>↑ Clip</span>
                              <input
                                type="file"
                                accept="video/*,image/*"
                                className="sr-only"
                                onChange={(e) => {
                                  handleUploadSceneFile(sc.id, e.target.files?.[0]);
                                  e.currentTarget.value = '';
                                }}
                              />
                            </label>

                            {(hasVideoClip || hasCustomPhoto) && (
                              <button
                                type="button"
                                onClick={() => onClearSceneVisual(sc.id)}
                                title="Quitar archivo externo y volver a arte AI"
                                aria-label={`Quitar clip de escena ${sc.orden}`}
                                className="min-h-[30px] inline-flex items-center justify-center px-2 py-1 rounded-md bg-[var(--bg-card)] hover:bg-[#DC2626]/10 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[#DC2626] transition-colors cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Sub-modo 2: Animar foto a video */}
      {studioSubMode === 'photo_video' && (
        <PhotoToVideoTool
          script={script}
          sceneMedia={sceneMedia}
          selectedVoiceId={selectedVoiceId}
          initialImageUrl={photoVideoSeedImage}
          onChangeVoiceId={onChangeVoiceId}
          onGenerateVoiceAudio={onGenerateSingleVoiceLine}
          onVideoCreated={onVideoCreated}
        />
      )}

      {/* Sub-modo 3: Crear y editar imágenes */}
      {studioSubMode === 'image_studio' && (
        <ImageStudioTool
          defaultStyle={script.estilo3D}
          onSendToPhotoVideo={(imgUrl) => {
            setPhotoVideoSeedImage(imgUrl);
            onChangeStudioSubMode('photo_video');
          }}
        />
      )}

      {/* Sub-modo 4: Estudio de Portadas y Miniaturas de Alto CTR */}
      {studioSubMode === 'thumbnail' && (
        <ThumbnailStudioTool
          script={script}
          sceneMedia={sceneMedia}
          fallbackImageUrl={styleInfo.imageUrl}
          defaultAspectRatio={aspectRatio}
        />
      )}

      {/* Galería compartida de todos los videos generados (persistidos en IndexedDB) */}
      {generatedVideos.length > 0 && (
        <section className="bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] rounded-xl p-5 sm:p-6 space-y-4">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Videos generados ({generatedVideos.length})
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Se guardan automáticamente en tu dispositivo para que no los pierdas al recargar.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {generatedVideos.map((vid) => {
              const ext = vid.extension || 'webm';
              return (
                <div
                  key={vid.id}
                  className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] tabular-nums">
                      <span className="text-[#F97316] font-medium truncate">{vid.scopeLabel}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono uppercase text-[var(--text-body)]">
                          {ext} · {vid.aspectRatio} · {vid.durationSec}s
                        </span>
                        <button
                          type="button"
                          onClick={() => onDeleteVideo(vid.id)}
                          title="Eliminar video guardado"
                          aria-label={`Eliminar ${vid.title}`}
                          className="p-1 rounded text-[var(--text-muted)] hover:text-[#DC2626] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-center bg-black rounded-lg overflow-hidden border border-[var(--border-subtle)]">
                      <video
                        src={vid.videoUrl}
                        controls
                        playsInline
                        className={
                          vid.aspectRatio === '9:16'
                            ? 'h-64 aspect-[9/16] object-contain'
                            : 'w-full aspect-video object-contain'
                        }
                      />
                    </div>
                    <div className="text-xs font-medium text-[var(--text-primary)] line-clamp-1">
                      {vid.title}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Voz: {vid.voiceLabel} · Creado {vid.createdAt}
                    </div>
                  </div>

                  <a
                    href={vid.videoUrl}
                    download={`${slugifyFilename(vid.title)}-${vid.aspectRatio.replace(':', 'x')}.${ext}`}
                    className="min-h-[42px] inline-flex items-center justify-center gap-1.5 w-full px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar video (.{ext.toUpperCase()})</span>
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Modo de vista previa inmersiva en pantalla completa (siempre cinematográfico oscuro) */}
      {isFullscreen && (
        <div
          ref={fullscreenOverlayRef}
          onPointerMove={revealHudTemporarily}
          onClick={revealHudTemporarily}
          className="fixed inset-0 z-50 bg-black flex items-center justify-center p-2 sm:p-6 select-none"
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa inmersiva del video"
        >
          {/* Barra superior flotante auto-ocultable */}
          <div
            onClick={(e) => e.stopPropagation()}
            className={`fixed top-0 inset-x-0 z-20 flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 bg-gradient-to-b from-black/85 via-black/45 to-transparent transition-opacity duration-300 ${
              showFullscreenHud ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="min-w-0 flex items-center gap-3">
              <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[55vw]">
                {script.tituloViral}
              </span>
              <span className="hidden sm:inline text-xs font-mono text-white/70 tabular-nums">
                {aspectRatio} · {formatTimecode(currentTime)} / {formatTimecode(totalDuration)}
              </span>
            </div>

            <button
              type="button"
              onClick={exitFullscreen}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Salir (Esc)</span>
            </button>
          </div>

          {/* Lienzo de video final a escala completa */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePlay();
              revealHudTemporarily();
            }}
            className={`relative overflow-hidden bg-[#07090D] rounded-xl sm:rounded-2xl shadow-2xl border border-white/10 cursor-pointer ${
              aspectRatio === '9:16'
                ? 'h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-4rem)] max-w-[96vw] aspect-[9/16]'
                : 'w-[min(96vw,1520px)] max-h-[88dvh] aspect-video'
            }`}
          >
            <ProceduralSceneCanvas
              scene={activeScene}
              script={script}
              beatIndex={activeBeatIndex}
              sceneMedia={sceneMedia}
              media={activeScene ? sceneMedia[activeScene.id] : undefined}
              aspectRatio={aspectRatio}
              localElapsed={localElapsedInScene}
              sceneDuration={activeSceneDuration}
              isPlaying={isPlaying}
              accentColor={subtitleConfig.accentColor}
              renderQuality={webgl2Supported ? renderQualityMode : 'classic_2d'}
              globalTimeSec={currentTime}
              prePauseSec={activeEntry?.prePauseSec ?? 0}
              beatRate={activeEntry?.beatRate ?? playbackRate}
              voiceRmsTrack={
                activeScene
                  ? sceneVoiceRmsTracksRef.current[getSceneBufferKey(activeScene.id)] ?? null
                  : null
              }
            />

            {/* Subtítulos dinámicos sincronizados en escala inmersiva */}
            <div
              className={`pointer-events-none absolute inset-x-6 sm:inset-x-10 flex flex-col items-center text-center ${subtitlePositionClass}`}
            >
              {activeScene && (
                <div
                  className={
                    isCommercial
                      ? `bg-slate-950/75 backdrop-blur-md border border-white/15 px-5 py-2.5 rounded-xl font-sans font-semibold ${fullscreenSubtitleSizeClass} tracking-normal leading-snug shadow-lg`
                      : subtitleConfig.style === 'impacto'
                        ? `font-display font-extrabold ${fullscreenSubtitleSizeClass} uppercase tracking-tight leading-tight drop-shadow-[0_4px_14px_rgba(0,0,0,0.95)]`
                        : subtitleConfig.style === 'cine'
                          ? `font-display font-semibold ${fullscreenSubtitleSizeClass} tracking-wide leading-snug text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)]`
                          : `bg-black/85 px-4 py-2.5 rounded-xl font-display font-bold ${fullscreenSubtitleSizeClass} uppercase tracking-tight leading-snug`
                  }
                >
                  {activeWordChunks.tokens.map((tok, idx) => {
                    const isCurrent = idx === activeWordChunks.activeWordIdx;
                    const isImpactStyle = !isCommercial && subtitleConfig.style === 'impacto';
                    const sem = tok.semanticStyle ?? 'normal';
                    const isDanger = !isCommercial && sem === 'danger';
                    const isEmphasis = sem === 'emphasis';
                    const isStat = sem === 'stat';
                    const isWhisper = !isCommercial && sem === 'whisper';

                    const textColor = isCommercial
                      ? isCurrent
                        ? '#FDBA74'
                        : isEmphasis || isStat
                          ? '#FFF7ED'
                          : '#FFFFFF'
                      : isDanger
                        ? isCurrent
                          ? '#FF3B1F'
                          : '#F59E0B'
                        : isStat
                          ? isCurrent
                            ? '#38BDF8'
                            : '#7DD3FC'
                          : isEmphasis
                            ? isCurrent
                              ? subtitleConfig.accentColor
                              : '#FDBA74'
                            : isWhisper
                              ? isCurrent
                                ? '#E2E8F0'
                                : '#CBD5E1'
                              : tok.isKeyword
                                ? isCurrent
                                  ? '#FF3B1F'
                                  : '#FF5A1F'
                                : isCurrent
                                  ? subtitleConfig.accentColor
                                  : '#FFFFFF';

                    const studioShadow = isCommercial
                      ? '0 1px 5px rgba(0,0,0,0.55)'
                      : isDanger && isImpactStyle
                        ? isCurrent
                          ? '0 4px 0 rgba(0,0,0,0.96), 0 0 24px rgba(255, 45, 22, 0.96), 0 6px 14px rgba(0,0,0,0.96)'
                          : '0 4px 0 rgba(0,0,0,0.94), 0 0 14px rgba(245, 158, 11, 0.78), 0 5px 12px rgba(0,0,0,0.95)'
                        : isStat && isImpactStyle
                          ? isCurrent
                            ? '0 4px 0 rgba(0,0,0,0.96), 0 0 18px rgba(56, 189, 248, 0.92), 0 6px 14px rgba(0,0,0,0.95)'
                            : '0 4px 0 rgba(0,0,0,0.94), 0 0 12px rgba(56, 189, 248, 0.55), 0 5px 12px rgba(0,0,0,0.92)'
                          : isImpactStyle
                            ? isCurrent || isEmphasis
                              ? `0 4px 0 rgba(0,0,0,0.96), 0 0 16px ${subtitleConfig.accentColor}99, 0 6px 14px rgba(0,0,0,0.95)`
                              : '0 4px 0 rgba(0,0,0,0.94), 0 5px 12px rgba(0,0,0,0.92)'
                            : '0 3px 12px rgba(0,0,0,0.95)';

                    const semanticClass = isCommercial
                      ? isStat
                        ? 'tabular-nums'
                        : ''
                      : isStat
                        ? 'font-mono tabular-nums tracking-normal'
                        : isWhisper
                          ? 'italic opacity-75 scale-90 font-semibold'
                          : isEmphasis
                            ? 'scale-[1.12]'
                            : '';

                    return (
                      <span
                        key={`${tok.word}-${tok.index}-${isCurrent ? 'on' : 'off'}`}
                        style={{
                          color: textColor,
                          textShadow: studioShadow,
                          WebkitTextStroke: isImpactStyle ? '2px rgba(0,0,0,0.94)' : undefined,
                          paintOrder: isImpactStyle ? 'stroke fill' : undefined,
                        }}
                        className={`inline-block mx-1.5 ${semanticClass} ${
                          isCurrent && !isCommercial ? 'subtitle-spring-active' : ''
                        }`}
                      >
                        {tok.word}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {!isPlaying && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-black/65 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">
                  <Play className="w-7 h-7 fill-white translate-x-0.5" />
                </div>
              </div>
            )}

            <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20 pointer-events-none">
              <div
                className="h-full bg-[#F97316] transition-all duration-100"
                style={{ width: `${(currentTime / totalDuration) * 100}%` }}
              />
            </div>
          </div>

          {/* Controles mínimos de reproducción flotantes auto-ocultables */}
          <div
            onClick={(e) => e.stopPropagation()}
            className={`fixed bottom-4 sm:bottom-6 inset-x-4 sm:inset-x-auto z-20 sm:w-[min(92vw,560px)] rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 px-4 py-3 space-y-2.5 transition-opacity duration-300 ${
              showFullscreenHud ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-white/80 tabular-nums shrink-0">
                {formatTimecode(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={totalDuration}
                step={0.1}
                value={currentTime}
                aria-label="Línea de tiempo pantalla completa"
                onChange={(e) => handleSeekTimeline(Number(e.target.value))}
                className="flex-1 accent-[#F97316] cursor-pointer"
              />
              <span className="text-[11px] font-mono text-white/60 tabular-nums shrink-0">
                {formatTimecode(totalDuration)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isPreparingPlaybackAudio}
                  onClick={handleTogglePlay}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-70 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isPreparingPlaybackAudio ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isPreparingPlaybackAudio
                      ? 'Preparando...'
                      : isPlaying
                        ? 'Pausar'
                        : 'Reproducir'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTime(0);
                    setIsPlaying(false);
                    stopActiveAudio();
                  }}
                  aria-label="Reiniciar reproducción"
                  className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVoiceEnabled((v) => !v)}
                  className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    voiceEnabled
                      ? 'bg-white/15 border-[#F97316] text-white'
                      : 'bg-white/5 border-white/15 text-white/70 hover:text-white'
                  }`}
                >
                  {voiceEnabled ? (
                    <Volume2 className="w-3.5 h-3.5 text-[#F97316]" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{voiceEnabled ? 'Voz' : 'Silencio'}</span>
                </button>

                <div className="flex items-center p-0.5 bg-white/10 rounded-lg">
                  {([1, 1.15, 1.25] as const).map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => handleChangePlaybackRate(rate)}
                      className={`min-h-[32px] px-2 py-1 text-[11px] font-mono rounded-md transition-colors cursor-pointer tabular-nums ${
                        playbackRate === rate
                          ? 'bg-[#F97316] text-white'
                          : 'text-white/75 hover:text-white'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Hook Factory: Exportación por lotes de 3 Variantes A/B/C + Pack .ZIP */}
      <HookFactoryModal
        isOpen={isHookFactoryOpen}
        onClose={() => setIsHookFactoryOpen(false)}
        script={script}
        sceneMedia={sceneMedia}
        fallbackImageUrl={styleInfo.imageUrl}
        aspectRatio={aspectRatio}
        subtitleConfig={subtitleConfig}
        backgroundMusicId={backgroundMusicId}
        musicVolume={musicVolume}
        enableTransitionSfx={enableAutoSfx}
        sfxVolumeDb={sfxVolumeDb}
        playbackRate={playbackRate}
        renderQuality={webgl2Supported ? renderQualityMode : 'classic_2d'}
        selectedVoice={selectedVoice}
        onVideoCreated={onVideoCreated}
      />
    </div>
  );
}
