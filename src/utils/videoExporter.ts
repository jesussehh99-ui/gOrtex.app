import type {
  BackgroundMusicId,
  HumanVoiceProfile,
  RenderQualityMode,
  SceneMediaMap,
  ScriptScene,
  SubtitleConfig,
  SubtitleStyleId,
  VideoAspectRatio,
  VideoExportFormat,
  ViralScript,
} from '../types';
import {
  buildUserPhotoArtCacheKey,
  loadUserMediaBlob,
  SlidingWindowVideoPool,
  type SlidingWindowVideoSource,
} from '../services/userMediaIngestionService';
import {
  buildSceneArtCacheKey,
  loadCachedSceneArtBlobWithFallback,
} from './aiImageQueue';
import {
  AudioMasterPipeline,
  type AudioTelemetryTrack,
} from './audioMasterPipeline';
import {
  dataUrlToCompressedWebpBlob,
  SceneBitmapCache,
  type SlidingWindowResolver,
} from './bitmapWindowCache';
import { renderUnifiedCinematicFrame } from './cinematicCompositor';
import {
  drawCommercialCtaOverlay,
  drawCommercialSpecsHud,
} from './commercialCanvasOverlay';
import {
  computeDeterministicWordPulse,
  deriveBeatSeed,
  deterministicFbm1D,
  hashSeed32,
  PRNG_CHANNEL,
} from './deterministicRandom';
import { isLegacyFlatSvgDataUrl } from './flowPromptBuilder';
import { localDepthEngine } from './localDepthEngine';
import {
  exportNativeMp4WithMuxer,
  type ExportProgressInfo,
  WebCodecsMp4UnsupportedError,
} from './mp4MuxerExporter';
import {
  applyStudioPostProcessing,
  drawSceneHudMetricCard,
  getSceneMoodColors,
} from './sceneImageUrl';
import { scheduleDuckedBackgroundMusic } from './soundtrackEngine';
import { createStudioAudioGraph } from './studioAudioMixer';
import { synthesizeUnifiedVoiceBuffer } from './unifiedVoiceEngine';
import { getEffectivePacingProfile } from './retentionEngine';
import {
  buildTimedWordTokens,
  estimateSpeechDurationSec,
  findWordIndexForTime,
  type TimedWordToken,
} from './visualKeywords';
import { WebGLSceneRenderer } from './webglSceneRenderer';

export type { AudioTelemetryTrack, ExportProgressInfo };

export type RenderSubtitleStyle = SubtitleStyleId;

export const DEFAULT_SUBTITLE_CONFIG: SubtitleConfig = {
  style: 'impacto',
  positionY: 'bottom',
  size: 'md',
  accentColor: '#F97316',
};

export interface RenderedVideoResult {
  videoUrl: string;
  blob: Blob;
  mimeType: string;
  extension: VideoExportFormat;
  durationSec: number;
  aspectRatio: VideoAspectRatio;
  telemetry?: AudioTelemetryTrack;
  storageBackend?: 'opfs' | 'memory-chunks';
  fallbackNotice?: string;
}

interface TimelineClip {
  scene: ScriptScene;
  videoEl: HTMLVideoElement | null;
  userVideoKey?: string;
  videoClipUrl?: string;
  imageBlobs: Blob[];
  artCacheKey?: string;
  audioBuffer: AudioBuffer | null;
  beatPlaybackRate?: number;
  startSec: number;
  durationSec: number;
  timedTokens: TimedWordToken[];
}

function loadImage(src: string, timeoutMs = 22000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let settled = false;
    const finish = (res: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };
    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch {
        // Silencioso si ya está decodificada
      }
      finish(img);
    };
    img.onerror = () => finish(null);
    window.setTimeout(() => finish(null), timeoutMs);
    img.src = src;
  });
}

export function drawCoverVideo(
  ctx: CanvasRenderingContext2D,
  vid: HTMLVideoElement,
  canvasW: number,
  canvasH: number,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const vidRatio = vid.videoWidth / Math.max(1, vid.videoHeight);
  const canvasRatio = canvasW / canvasH;
  let drawW = canvasW;
  let drawH = canvasH;
  if (vidRatio > canvasRatio) {
    drawH = canvasH;
    drawW = canvasH * vidRatio;
  } else {
    drawW = canvasW;
    drawH = canvasW / vidRatio;
  }
  const scaledW = drawW * scale;
  const scaledH = drawH * scale;
  const x = (canvasW - scaledW) / 2 + offsetX;
  const y = (canvasH - scaledH) / 2 + offsetY;
  ctx.drawImage(vid, x, y, scaledW, scaledH);
}

async function decodeDataUrlAudio(
  ctx: AudioContext,
  audioDataUrl: string
): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(audioDataUrl);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr.slice(0));
  } catch {
    return null;
  }
}

async function acquireWakeLock(): Promise<{ release: () => Promise<void> } | null> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock && typeof nav.wakeLock.request === 'function') {
      return await nav.wakeLock.request('screen');
    }
  } catch {
    // No soportado o denegado por el dispositivo
  }
  return null;
}

function pickRecorderMime(preferredFormat: VideoExportFormat): {
  mimeType: string;
  isNativeMp4: boolean;
} {
  if (preferredFormat === 'mp4') {
    const mp4Candidates = [
      'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
    ];
    const nativeMp4 = mp4Candidates.find((m) => MediaRecorder.isTypeSupported(m));
    if (nativeMp4) {
      return { mimeType: nativeMp4, isNativeMp4: true };
    }
  }

  const webmCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const selected = webmCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
  return { mimeType: selected, isNativeMp4: false };
}

async function transcodeWebmToMp4(
  webmBlob: Blob,
  _signal?: AbortSignal
): Promise<{ blob: Blob; mimeType: string; extension: VideoExportFormat }> {
  // Gortex es 100% client-side: la exportación MP4 principal se ejecuta con WebCodecs + mp4-muxer.
  // Si el navegador cae al respaldo MediaRecorder WebM, se entrega el WebM directamente sin llamar a ningún servidor.
  return { blob: webmBlob, mimeType: webmBlob.type || 'video/webm', extension: 'webm' };
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
  const canvasRatio = canvasW / canvasH;

  let drawW = canvasW;
  let drawH = canvasH;
  if (imgRatio > canvasRatio) {
    drawH = canvasH;
    drawW = canvasH * imgRatio;
  } else {
    drawW = canvasW;
    drawH = canvasW / imgRatio;
  }

  const scaledW = drawW * scale;
  const scaledH = drawH * scale;
  const x = (canvasW - scaledW) / 2 + offsetX;
  const y = (canvasH - scaledH) / 2 + offsetY;
  ctx.drawImage(img, x, y, scaledW, scaledH);
}

function evalSpringPop(timeSinceWordStartSec: number, isKeyword: boolean): number {
  const t = Math.max(0, Math.min(1, timeSinceWordStartSec / 0.19));
  const targetPeak = isKeyword ? 1.12 : 1.07;
  if (t >= 1) return targetPeak;
  // Curva de resorte amortiguado: 0.86 -> 1.19 (overshoot) -> targetPeak
  const damped = 1 - Math.exp(-9.5 * t) * Math.cos(t * Math.PI * 2.15);
  return 0.86 + (targetPeak - 0.86) * damped + Math.sin(t * Math.PI) * (isKeyword ? 0.11 : 0.08);
}

export function drawDynamicSubtitles(
  ctx: CanvasRenderingContext2D,
  timedTokens: TimedWordToken[],
  activeGlobalWordIdx: number,
  config: SubtitleConfig,
  canvasW: number,
  canvasH: number,
  isLandscape: boolean,
  localElapsed?: number,
  isCommercial = false
) {
  if (timedTokens.length === 0) return;

  const currentWordIdx = Math.min(timedTokens.length - 1, Math.max(0, activeGlobalWordIdx));
  const chunkSize = isLandscape ? 6 : 4;
  const windowStart = Math.floor(currentWordIdx / chunkSize) * chunkSize;
  const chunkTokens = timedTokens.slice(windowStart, windowStart + chunkSize);
  const activeLocalIdx = currentWordIdx - windowStart;

  const sizeMultiplier = config.size === 'sm' ? 0.84 : config.size === 'lg' ? 1.18 : 1;
  const baseFontSize = isCommercial
    ? isLandscape
      ? 34
      : 38
    : isLandscape
      ? config.style === 'impacto'
        ? 42
        : 36
      : config.style === 'impacto'
        ? 46
        : config.style === 'cine'
          ? 40
          : 42;
  const fontSize = Math.round(baseFontSize * sizeMultiplier);
  const fontWeight = isCommercial ? '600' : config.style === 'cine' ? '600' : '800';
  ctx.font = `${fontWeight} ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  const displayItems = chunkTokens.map((tok, idx) => ({
    text: isCommercial || config.style === 'cine' ? tok.word : tok.word.toUpperCase(),
    idx,
    isKeyword: tok.isKeyword,
    semanticStyle: tok.semanticStyle ?? 'normal',
    startSec: tok.startSec,
  }));
  const spacing = Math.round((isCommercial ? 13 : 15) * sizeMultiplier);

  // Respetar margen derecho en vertical 9:16 para zonas seguras de TikTok/Shorts/Reels
  const sideMargin = isLandscape ? 160 : 124;
  const maxLineWidth = canvasW - sideMargin;
  const lines: Array<
    Array<{
      text: string;
      idx: number;
      isKeyword: boolean;
      semanticStyle: TimedWordToken['semanticStyle'];
      startSec: number;
    }>
  > = [[]];
  let currentLineWidth = 0;

  displayItems.forEach((item) => {
    const w = ctx.measureText(item.text).width;
    if (lines[lines.length - 1].length > 0 && currentLineWidth + spacing + w > maxLineWidth) {
      lines.push([item]);
      currentLineWidth = w;
    } else {
      lines[lines.length - 1].push(item);
      currentLineWidth += (lines[lines.length - 1].length > 1 ? spacing : 0) + w;
    }
  });

  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;

  let baseY: number;
  if (config.positionY === 'center') {
    baseY = canvasH * 0.5 - totalHeight / 2 + lineHeight / 2;
  } else if (config.positionY === 'lower_mid') {
    baseY = canvasH * (isLandscape ? 0.72 : 0.66) - totalHeight / 2 + lineHeight / 2;
  } else {
    // Zona segura inferior (evita solaparse con barra de descripción en TikTok/Reels)
    const bottomOffset = isLandscape ? 105 : 290;
    baseY = canvasH - bottomOffset - totalHeight / 2;
  }

  if (config.style === 'contraste' || isCommercial) {
    const boxPadX = isCommercial ? 24 : 28;
    const boxPadY = isCommercial ? 14 : 18;
    const widestLine = Math.max(
      140,
      ...lines.map((line) => {
        const ws = line.reduce((acc, it) => acc + ctx.measureText(it.text).width, 0);
        return ws + spacing * Math.max(0, line.length - 1);
      })
    );
    const boxW = Math.min(canvasW - 64, widestLine + boxPadX * 2);
    const boxH = totalHeight + boxPadY * 2;
    const bx = (canvasW - boxW) / 2;
    const by = baseY - lineHeight / 2 - boxPadY;
    ctx.fillStyle = isCommercial ? 'rgba(15, 23, 42, 0.72)' : 'rgba(0, 0, 0, 0.86)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(bx, by, boxW, boxH, isCommercial ? 14 : 16);
    } else {
      ctx.rect(bx, by, boxW, boxH);
    }
    ctx.fill();
    if (isCommercial) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }

  const accentHex = config.accentColor || '#F97316';
  const isImpactStyle = !isCommercial && config.style === 'impacto';
  const defaultFont = `${fontWeight} ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  const statFont = `800 ${fontSize}px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace`;
  const whisperFont = `italic 600 ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;

  lines.forEach((line, lineIdx) => {
    const widths = line.map((item) => ctx.measureText(item.text).width);
    const lineTotalW = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, line.length - 1);
    let cursorX = (canvasW - lineTotalW) / 2;
    const y = baseY + lineIdx * lineHeight;

    line.forEach((item, i) => {
      const isActive = item.idx === activeLocalIdx;
      const sem = item.semanticStyle;
      const isDanger = !isCommercial && sem === 'danger';
      const isEmphasis = sem === 'emphasis';
      const isStat = sem === 'stat';
      const isWhisper = !isCommercial && sem === 'whisper';
      const isHighEnergy = isDanger || isEmphasis || item.isKeyword;
      const wordW = widths[i];
      const centerX = cursorX + wordW / 2;

      const timeSinceWordStart =
        typeof localElapsed === 'number' ? Math.max(0, localElapsed - item.startSec) : 0.09;
      let popScale = isActive
        ? isCommercial
          ? 1.03
          : evalSpringPop(timeSinceWordStart, isHighEnergy)
        : 1.0;
      if (!isCommercial && isEmphasis) popScale *= 1.12;
      else if (isWhisper) popScale *= 0.9;

      ctx.save();
      ctx.translate(centerX, y);
      if (Math.abs(popScale - 1) > 0.002) {
        ctx.scale(popScale, popScale);
      }
      ctx.textAlign = 'center';
      ctx.font = isCommercial
        ? isActive
          ? `700 ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`
          : defaultFont
        : isStat
          ? statFont
          : isWhisper
            ? whisperFont
            : defaultFont;
      if (isWhisper) {
        ctx.globalAlpha = isActive ? 0.86 : 0.68;
      }

      if (isCommercial) {
        ctx.shadowColor = 'rgba(15, 23, 42, 0.55)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = isActive ? '#FDE68A' : isEmphasis || isStat ? '#FFFFFF' : 'rgba(248, 250, 252, 0.92)';
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
        cursorX += wordW + spacing;
        return;
      }

      // Sombra dura de estudio (offset sólido detrás del contorno) para contraste extremo sobre cualquier fondo
      if (isImpactStyle) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.96)';
        ctx.fillText(item.text, 4, 6);
      }

      if (isDanger && isImpactStyle) {
        ctx.shadowColor = isActive ? 'rgba(255, 45, 22, 0.98)' : 'rgba(245, 158, 11, 0.82)';
        ctx.shadowBlur = isActive ? 28 : 16;
        ctx.shadowOffsetY = 3;
      } else if (isStat && isImpactStyle) {
        ctx.shadowColor = isActive ? 'rgba(56, 189, 248, 0.95)' : 'rgba(56, 189, 248, 0.55)';
        ctx.shadowBlur = isActive ? 22 : 12;
        ctx.shadowOffsetY = 3;
      } else if ((isEmphasis || item.isKeyword || isActive) && isImpactStyle) {
        ctx.shadowColor = accentHex;
        ctx.shadowBlur = isActive ? 22 : 14;
        ctx.shadowOffsetY = 3;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 4;
      }

      if (isImpactStyle) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = isHighEnergy && isActive ? 9 : 8;
        ctx.strokeStyle = 'rgba(0,0,0,0.96)';
        ctx.strokeText(item.text, 0, 0);
      }

      if (isDanger) {
        ctx.fillStyle = isActive ? '#FF3B1F' : '#F59E0B';
      } else if (isStat) {
        ctx.fillStyle = isActive ? '#38BDF8' : '#7DD3FC';
      } else if (isEmphasis) {
        ctx.fillStyle = isActive ? accentHex : '#FDBA74';
      } else if (isWhisper) {
        ctx.fillStyle = isActive ? '#E2E8F0' : '#CBD5E1';
      } else if (item.isKeyword) {
        ctx.fillStyle = isActive ? '#FF3B1F' : '#FF5A1F';
      } else {
        ctx.fillStyle = isActive ? accentHex : '#FFFFFF';
      }
      ctx.fillText(item.text, 0, 0);
      ctx.restore();

      cursorX += wordW + spacing;
    });
  });
}

export async function renderAudiovisualWebm(options: {
  script: ViralScript;
  scenesSubset?: ScriptScene[];
  sceneMedia: SceneMediaMap;
  fallbackImageUrl: string;
  aspectRatio: VideoAspectRatio;
  subtitleStyle?: RenderSubtitleStyle;
  subtitleConfig?: SubtitleConfig;
  backgroundMusicId?: BackgroundMusicId;
  musicVolume?: number;
  enableTransitionSfx?: boolean;
  sfxVolumeDb?: number;
  exportFormat?: VideoExportFormat;
  playbackRate?: number;
  renderQuality?: RenderQualityMode;
  selectedVoice?: HumanVoiceProfile;
  onProgress?: (percent: number, label: string) => void;
  onProgressInfo?: (info: ExportProgressInfo) => void;
  onBackgroundWarning?: (hidden: boolean) => void;
  signal?: AbortSignal;
}): Promise<RenderedVideoResult> {
  const {
    script,
    scenesSubset,
    sceneMedia,
    aspectRatio,
    subtitleStyle,
    subtitleConfig,
    backgroundMusicId = 'none',
    musicVolume = 0.28,
    enableTransitionSfx = true,
    sfxVolumeDb,
    exportFormat = 'mp4',
    playbackRate = 1,
    renderQuality = 'cine_3d',
    selectedVoice,
    onProgress,
    onProgressInfo,
    onBackgroundWarning,
    signal,
  } = options;
  const safePlaybackRate = Math.max(0.75, Math.min(1.5, Number(playbackRate) || 1));

  const emitProgress = (info: ExportProgressInfo) => {
    onProgress?.(info.percent, info.label);
    onProgressInfo?.(info);
  };

  const resolvedSubConfig: SubtitleConfig = subtitleConfig ?? {
    ...DEFAULT_SUBTITLE_CONFIG,
    style: subtitleStyle ?? 'impacto',
  };

  if (exportFormat !== 'mp4' && typeof MediaRecorder === 'undefined') {
    throw new Error('Tu navegador no soporta la grabación audiovisual directa (MediaRecorder).');
  }

  const targetScenes = scenesSubset && scenesSubset.length > 0 ? scenesSubset : script.escenas;
  const isLandscape = aspectRatio === '16:9';
  const canvasW = isLandscape ? 1280 : 720;
  const canvasH = isLandscape ? 720 : 1280;

  emitProgress({
    percent: 4,
    phase: 'audio',
    label: 'Preparando activos WebP y pistas de voz 48 kHz...',
  });

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el lienzo de renderizado.');
  }

  const wakeLock = await acquireWakeLock();
  // Solo alertar por pestaña en segundo plano si cae al fallback MediaRecorder en tiempo real
  let usesRealtimeRecorder = false;
  const handleVisibility = () => {
    if (usesRealtimeRecorder) {
      onBackgroundWarning?.(document.hidden);
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Bus de Mezcla de Estudio 48 kHz Estéreo + Limitador suave (-1 dBFS)
  const studioGraph = createStudioAudioGraph({
    connectToSpeakers: false,
    createMediaDestination: true,
    musicGainValue: 1.0,
  });
  const audioCtx = studioGraph.audioCtx;
  const dest = studioGraph.mediaDest!;

  try {
    const clips: TimelineClip[] = [];
    let cursorSec = 0;

    for (let i = 0; i < targetScenes.length; i++) {
      if (signal?.aborted) {
        throw new Error('Renderizado cancelado.');
      }
      const scene = targetScenes[i];
      const media = sceneMedia[scene.id];

      // 1) Referencia a clip de video real (OPFS o URL en memoria) para SlidingWindowVideoPool (N = 3) sin saturar RAM
      const userVideoKey =
        scene.mediaSource === 'user_video' && scene.userMediaKey ? scene.userMediaKey : undefined;
      const videoClipUrl = media?.videoClipUrl;
      const hasVideoClip = Boolean(userVideoKey || videoClipUrl);
      const videoEl: HTMLVideoElement | null = null;

      // 2) Recolectar Blobs WebP comprimidos (priorizando foto real full-res en OPFS sobre miniatura de UI)
      const imageBlobs: Blob[] = [];
      let resolvedArtCacheKey: string | undefined;

      if (!hasVideoClip && scene.mediaSource === 'user_photo' && scene.userMediaKey) {
        const opfsPhotoBlob = await loadUserMediaBlob(script.id, scene.userMediaKey);
        if (opfsPhotoBlob) {
          imageBlobs.push(opfsPhotoBlob);
          resolvedArtCacheKey = buildUserPhotoArtCacheKey(script.id, scene.userMediaKey);
        }
      }

      if (!hasVideoClip && imageBlobs.length === 0) {
        const imageSources: string[] = [];
        if (media?.imageDataUrl && !isLegacyFlatSvgDataUrl(media.imageDataUrl)) {
          imageSources.push(media.imageDataUrl);
        }
        if (media?.altImageDataUrls && media.altImageDataUrls.length > 0) {
          for (const altUrl of media.altImageDataUrls) {
            if (!isLegacyFlatSvgDataUrl(altUrl)) {
              imageSources.push(altUrl);
            }
          }
        }
        for (const src of imageSources) {
          const compressed = await dataUrlToCompressedWebpBlob(src);
          if (compressed) imageBlobs.push(compressed);
        }
      }

      if (!hasVideoClip && imageBlobs.length === 0) {
        onProgress?.(
          Math.min(14, 4 + Math.round(((i + 1) / Math.max(1, targetScenes.length)) * 8)),
          `Preparando escena ${scene.orden} de ${targetScenes.length}...`
        );
        // Reutiliza el Blob WebP ya verificado (incluyendo formato alterno 9:16 ↔ 16:9 vía Smart Reframe)
        const cachedAi = await loadCachedSceneArtBlobWithFallback(
          scene,
          script,
          aspectRatio,
          media?.imageSeed
        );
        if (cachedAi) {
          imageBlobs.push(cachedAi.blob);
          resolvedArtCacheKey = cachedAi.artCacheKey;
        }
      }

      let audioBuffer = media?.audioDataUrl
        ? await decodeDataUrlAudio(audioCtx, media.audioDataUrl)
        : null;

      // Garantizar AudioBuffer real del Motor Unificado si aún no existía en media (100% idéntico a la vista previa)
      if (!audioBuffer && selectedVoice) {
        const synth = await synthesizeUnifiedVoiceBuffer({
          text: scene.narracion,
          voice: selectedVoice,
          language: script.idioma ?? 'es',
          existingAudioDataUrl: media?.audioDataUrl,
          isCustomUserAudio:
            media?.audioSource === 'custom_mic' || media?.audioSource === 'custom_file',
        });
        audioBuffer =
          (await decodeDataUrlAudio(audioCtx, synth.audioDataUrl)) ?? synth.buffer;
      }

      // Duración determinista por micro-escena ajustada a velocidad global + pacingProfile del beat
      const pacing = getEffectivePacingProfile(scene);
      const effectiveBeatRate = Math.max(
        0.75,
        Math.min(1.5, safePlaybackRate * pacing.speedMultiplier)
      );
      const prePauseSec = Math.max(0, Math.min(0.45, pacing.prePauseMs / 1000));
      const rawClipDuration = audioBuffer
        ? Math.max(audioBuffer.duration + 0.08, 1.4)
        : estimateSpeechDurationSec(scene.narracion);
      const clipDuration = prePauseSec + rawClipDuration / effectiveBeatRate;

      const timedTokens = buildTimedWordTokens(scene, clipDuration, { prePauseSec });

      const artCacheKey =
        resolvedArtCacheKey ??
        (!hasVideoClip && media?.imageDataUrl && !isLegacyFlatSvgDataUrl(media.imageDataUrl)
          ? `custom::${script.id}::${scene.id}::${media.imageDataUrl.length}::${media.imageDataUrl.slice(-24)}`
          : buildSceneArtCacheKey(scene, script, aspectRatio, media?.imageSeed));

      clips.push({
        scene,
        videoEl,
        userVideoKey,
        videoClipUrl,
        imageBlobs,
        artCacheKey,
        audioBuffer,
        startSec: cursorSec,
        durationSec: clipDuration,
        timedTokens,
      });
      cursorSec += clipDuration;
    }

    const totalDurationSec = Math.max(1, cursorSec);
    let fallbackNotice: string | undefined;

    // Ruta principal offline no bloqueante (.MP4 WebCodecs + Backpressure + OPFS StreamTarget + AudioTelemetryTrack)
    if (exportFormat === 'mp4') {
      try {
        const nativeResult = await exportNativeMp4WithMuxer({
          script,
          clips,
          totalDurationSec,
          aspectRatio,
          canvasW,
          canvasH,
          subtitleConfig: resolvedSubConfig,
          backgroundMusicId,
          musicVolume,
          enableTransitionSfx,
          sfxVolumeDb,
          playbackRate: safePlaybackRate,
          renderQuality,
          drawSubtitles: drawDynamicSubtitles,
          drawCoverVideo,
          onProgress,
          onProgressInfo,
          signal,
        });

        emitProgress({
          percent: 100,
          phase: 'muxing',
          label: 'MP4 listo (WebCodecs H.264 30fps + 48 kHz Estéreo)',
        });

        return {
          videoUrl: URL.createObjectURL(nativeResult.blob),
          blob: nativeResult.blob,
          mimeType: 'video/mp4',
          extension: 'mp4',
          durationSec: Math.round(nativeResult.telemetry.totalDurationSec),
          aspectRatio,
          telemetry: nativeResult.telemetry,
          storageBackend: nativeResult.storageBackend,
          fallbackNotice: nativeResult.fallbackNotice,
        };
      } catch (err) {
        if (err instanceof WebCodecsMp4UnsupportedError) {
          fallbackNotice = err.reason || err.message;
          emitProgress({
            percent: 14,
            phase: 'fallback',
            label: 'WebCodecs no disponible; usando codificador de respaldo compatible...',
          });
        } else {
          throw err;
        }
      }
    }

    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Tu navegador no soporta ni WebCodecs ni MediaRecorder para exportar video.');
    }

    // Fallback controlado: usar AudioMasterPipeline (WSOLA + setValueCurveAtTime + AudioTelemetryTrack)
    // para mezclar la pista maestra exacta y reproducirla a MediaRecorder en tiempo real.
    usesRealtimeRecorder = true;
    if (document.hidden) {
      onBackgroundWarning?.(true);
    }

    const fallbackAudioMaster = await AudioMasterPipeline.renderMaster({
      clips: clips.map((c) => ({
        scene: c.scene,
        audioBuffer: c.audioBuffer,
        beatPlaybackRate: c.beatPlaybackRate,
      })),
      globalPlaybackRate: safePlaybackRate,
      backgroundMusicId,
      musicVolume,
      enableTransitionSfx,
      sfxVolumeDb,
      projectSeed: hashSeed32(script.id || 'gortex-default'),
      fps: 30,
      signal,
      onProgress: (pct, label) => {
        emitProgress({ percent: pct, phase: 'audio', label });
      },
    });

    const fallbackClips: TimelineClip[] = fallbackAudioMaster.resolvedClips.map((rc, idx) => ({
      scene: rc.scene,
      videoEl: clips[idx]?.videoEl ?? null,
      userVideoKey: clips[idx]?.userVideoKey,
      videoClipUrl: clips[idx]?.videoClipUrl,
      imageBlobs: clips[idx]?.imageBlobs ?? [],
      artCacheKey: clips[idx]?.artCacheKey,
      audioBuffer: rc.stretchedVoiceBuffer,
      beatPlaybackRate: rc.appliedPlaybackRate,
      startSec: rc.startSec,
      durationSec: rc.durationSec,
      timedTokens: rc.timedTokens,
    }));
    const fallbackTotalDurationSec = fallbackAudioMaster.totalDurationSec;

    const { mimeType: selectedMime, isNativeMp4 } = pickRecorderMime(exportFormat);

    const canvasStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 4_200_000,
    });

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data);
      }
    };

    const recordingFinished = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: selectedMime }));
      recorder.onerror = () => reject(new Error('Error durante la codificación del video.'));
    });

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const startAudioTime = audioCtx.currentTime + 0.12;

    // Reproducir directamente el masterBuffer pre-mezclado (48kHz Estéreo + WSOLA + ducking + limitador)
    const masterSource = audioCtx.createBufferSource();
    masterSource.buffer = fallbackAudioMaster.telemetry.masterBuffer;
    masterSource.connect(studioGraph.masterGain);
    masterSource.start(startAudioTime);

    // Caché deslizante N = 3 para el respaldo MediaRecorder (libera VRAM y ObjectURLs al avanzar de beat)
    const fallbackBitmapCache = new SceneBitmapCache(undefined, script.id);
    const fallbackDepthCache = new SceneBitmapCache(undefined, script.id);
    const fallbackVideoPool = new SlidingWindowVideoPool();
    const resolveFallbackVideoSource = (idx: number): SlidingWindowVideoSource | null => {
      const clip = fallbackClips[idx];
      if (!clip) return null;
      if (clip.userVideoKey) {
        const key = clip.userVideoKey;
        return {
          signature: `rec-opfs-video::${script.id}::${clip.scene.id}::${key}`,
          directUrl: clip.videoClipUrl,
          loadBlob: () => loadUserMediaBlob(script.id, key),
        };
      }
      if (clip.videoClipUrl) {
        return {
          signature: `rec-url-video::${clip.scene.id}::${clip.videoClipUrl}`,
          directUrl: clip.videoClipUrl,
        };
      }
      return null;
    };
    const fallbackSubShotByClip = new Map<number, number>();
    const fallbackResolver: SlidingWindowResolver = {
      getSignature: (idx: number) => {
        const clip = fallbackClips[idx];
        if (!clip || clip.imageBlobs.length === 0) return null;
        const subIdx = fallbackSubShotByClip.get(idx) ?? 0;
        const blob = clip.imageBlobs[subIdx] ?? clip.imageBlobs[0];
        if (!blob) return null;
        return `rec::${clip.scene.id}::${subIdx}::${blob.size}::${blob.type}`;
      },
      resolveBlob: (idx: number) => {
        const clip = fallbackClips[idx];
        if (!clip || clip.imageBlobs.length === 0) return null;
        const subIdx = fallbackSubShotByClip.get(idx) ?? 0;
        return clip.imageBlobs[subIdx] ?? clip.imageBlobs[0] ?? null;
      },
    };
    const fallbackDepthResolver: SlidingWindowResolver = {
      getSignature: (idx: number) => {
        if (renderQuality !== 'cine_3d') return null;
        const key = fallbackClips[idx]?.artCacheKey;
        return key ? `recdepth::${key}` : null;
      },
      resolveBlob: (idx: number) => {
        if (renderQuality !== 'cine_3d') return null;
        const key = fallbackClips[idx]?.artCacheKey;
        return key ? localDepthEngine.loadPersistedDepthBlob(key) : null;
      },
    };

    let fallbackWebgl: WebGLSceneRenderer | null = null;
    if (renderQuality === 'cine_3d' && WebGLSceneRenderer.isWebGL2Supported()) {
      try {
        fallbackWebgl = new WebGLSceneRenderer(canvasW, canvasH, false);
        if (!fallbackWebgl.isAvailable()) {
          fallbackWebgl.dispose();
          fallbackWebgl = null;
        }
      } catch {
        fallbackWebgl = null;
      }
    }

    try {
      // Pre-decodificar ventana inicial [0, 1] antes de iniciar la grabación para cero frames vacíos
      await Promise.all([
        fallbackBitmapCache.ensureWindowReadyForBeat(0, fallbackClips.length, fallbackResolver),
        fallbackDepthCache.ensureWindowReadyForBeat(0, fallbackClips.length, fallbackDepthResolver),
        fallbackVideoPool.ensureWindowForBeat(0, fallbackClips.length, resolveFallbackVideoSource),
      ]);

      recorder.start(250);
      const isCommercial = script.studioMode === 'commercial_real_estate';
      const isViralMode =
        !isCommercial &&
        (script.publicoObjetivo === 'viral_meme' || script.estilo3D === 'viral_meme_3d');
      const projectSeed = hashSeed32(script.id || 'gortex-default');
      const maxRenderPct = exportFormat === 'mp4' && !isNativeMp4 ? 84 : 98;

      let activePlayingVideo: HTMLVideoElement | null = null;
      let lastSceneKey = '';

      await new Promise<void>((resolve, reject) => {
        const renderFrame = () => {
          if (signal?.aborted) {
            if (recorder.state === 'recording') recorder.stop();
            reject(new Error('Renderizado cancelado.'));
            return;
          }

          // Reloj Maestro determinista gobernado por el hardware del AudioContext (cero desfase)
          const elapsedSec = Math.max(0, audioCtx.currentTime - startAudioTime);
          if (elapsedSec >= fallbackTotalDurationSec) {
            if (recorder.state === 'recording') recorder.stop();
            resolve();
            return;
          }

          const foundClipIdx = fallbackClips.findIndex(
            (c) => elapsedSec >= c.startSec && elapsedSec < c.startSec + c.durationSec
          );
          const activeClipIdx =
            foundClipIdx >= 0 ? foundClipIdx : Math.max(0, fallbackClips.length - 1);
          const activeClip = fallbackClips[activeClipIdx];

          const safeDur = Math.max(0.6, activeClip.durationSec);
          const localElapsed = Math.max(0, Math.min(safeDur, elapsedSec - activeClip.startSec));
          const normalizedT = localElapsed / safeDur;

          // Sincronizar pool deslizante N = 3 de clips de video al entrar en la escena
          if (activeClip.scene.id !== lastSceneKey) {
            lastSceneKey = activeClip.scene.id;
            void fallbackVideoPool.ensureWindowForBeat(
              activeClipIdx,
              fallbackClips.length,
              resolveFallbackVideoSource
            );
            const nextVid =
              activeClip.videoEl ?? fallbackVideoPool.getVideoSync(activeClipIdx);
            if (activePlayingVideo && activePlayingVideo !== nextVid) {
              activePlayingVideo.pause();
            }
            if (nextVid) {
              activePlayingVideo = nextVid;
              const naturalDur =
                Number.isFinite(nextVid.duration) && nextVid.duration > 0.2
                  ? nextVid.duration
                  : 0;
              nextVid.loop = naturalDur > 0 ? naturalDur < activeClip.durationSec : true;
              try {
                nextVid.currentTime = 0;
              } catch {
                // Ignorar
              }
              void nextVid.play().catch(() => {});
            } else {
              activePlayingVideo = null;
            }
          }

          const {
            wordIdx,
            wordPulse: baseWordPulse,
            isKeyword,
          } = computeDeterministicWordPulse(activeClip.timedTokens, localElapsed);
          const wordPulse =
            isKeyword || isViralMode || activeClip.scene.esGiro30s
              ? Math.min(1, baseWordPulse * 1.2)
              : baseWordPulse;

          const blobCount = activeClip.imageBlobs.length;
          const subShotIdx =
            blobCount > 1 ? Math.min(blobCount - 1, Math.floor(normalizedT * blobCount)) : 0;
          fallbackSubShotByClip.set(activeClipIdx, subShotIdx);
          if (activeClipIdx > 0) {
            const prevClip = fallbackClips[activeClipIdx - 1];
            if (prevClip && prevClip.imageBlobs.length > 0) {
              fallbackSubShotByClip.set(activeClipIdx - 1, prevClip.imageBlobs.length - 1);
            }
          }

          // Mantener estrictamente [activeClipIdx - 1, activeClipIdx, activeClipIdx + 1] en VRAM
          fallbackBitmapCache.syncWindow(activeClipIdx, fallbackClips.length, fallbackResolver);
          fallbackDepthCache.syncWindow(activeClipIdx, fallbackClips.length, fallbackDepthResolver);

          const activeVideoEl =
            activeClip.videoEl ?? fallbackVideoPool.getVideoSync(activeClipIdx);

          if (activeVideoEl && activeVideoEl.readyState >= 2) {
            ctx.fillStyle = '#07090D';
            ctx.fillRect(0, 0, canvasW, canvasH);

            const cameraSeed = deriveBeatSeed(projectSeed, activeClipIdx, PRNG_CHANNEL.CAMERA);
            const scale = isCommercial ? 1.0 : 1.02 + Math.sin(normalizedT * Math.PI) * 0.014;
            const driftX = isCommercial
              ? 0
              : deterministicFbm1D(cameraSeed, normalizedT * 2.4 + 0.5) * 3.0;
            const driftY = isCommercial
              ? 0
              : deterministicFbm1D(cameraSeed + 59, normalizedT * 2.1 + 3.7) * 2.2;
            drawCoverVideo(ctx, activeVideoEl, canvasW, canvasH, scale, driftX, driftY);

            const clipMood = getSceneMoodColors(activeClip.scene);
            applyStudioPostProcessing(ctx, canvasW, canvasH, {
              moodGlow: clipMood.glow,
              accentColor: resolvedSubConfig.accentColor || '#F97316',
              normalizedT,
              sceneDuration: safeDur,
              projectSeed,
              beatIndex: activeClipIdx,
              wordPulse,
              tensionBoost: !isCommercial && activeClip.scene.esGiro30s ? 0.6 : 0,
              isCommercial,
            });
            if (isCommercial) {
              drawCommercialSpecsHud(
                ctx,
                canvasW,
                canvasH,
                activeClip.scene,
                script,
                localElapsed,
                safeDur
              );
              drawCommercialCtaOverlay(
                ctx,
                canvasW,
                canvasH,
                activeClip.scene,
                script,
                localElapsed,
                safeDur
              );
            } else {
              drawSceneHudMetricCard(
                ctx,
                canvasW,
                canvasH,
                activeClip.scene,
                localElapsed,
                safeDur,
                wordPulse
              );
            }
          } else {
            const activeBitmap = fallbackBitmapCache.getBitmap(activeClipIdx);
            const prevBitmap =
              activeClipIdx > 0 ? fallbackBitmapCache.getBitmap(activeClipIdx - 1) : null;
            const activeDepthBitmap = fallbackDepthCache.getBitmap(activeClipIdx);
            const prevDepthBitmap =
              activeClipIdx > 0 ? fallbackDepthCache.getBitmap(activeClipIdx - 1) : null;
            const frameIdxRec = Math.floor(elapsedSec * 30);
            const voiceRms = fallbackAudioMaster.telemetry.voiceRms[frameIdxRec] ?? 0;
            const impactTransient = Math.max(
              fallbackAudioMaster.telemetry.impactTransients[frameIdxRec] ?? 0,
              wordPulse * (activeClip.scene.esGiro30s ? 0.85 : 0.45)
            );
            const curArtKey = activeClip.artCacheKey || `rec-beat-${activeClipIdx}-${subShotIdx}`;
            const prevArtKey =
              activeClipIdx > 0
                ? fallbackClips[activeClipIdx - 1]?.artCacheKey || `rec-beat-${activeClipIdx - 1}`
                : '';
            const previousScene =
              activeClipIdx > 0 ? fallbackClips[activeClipIdx - 1]?.scene : undefined;

            renderUnifiedCinematicFrame({
              targetCtx: ctx,
              webglRenderer: fallbackWebgl,
              renderQuality,
              width: canvasW,
              height: canvasH,
              currentSlot: {
                key: `${curArtKey}::${subShotIdx}`,
                colorSource: activeBitmap,
                depthSource: activeDepthBitmap,
              },
              previousSlot: prevBitmap
                ? {
                    key: prevArtKey,
                    colorSource: prevBitmap,
                    depthSource: prevDepthBitmap,
                  }
                : null,
              scene: activeClip.scene,
              previousScene,
              script,
              beatIndex: activeClipIdx,
              frameIndex: frameIdxRec,
              localElapsed,
              sceneDuration: safeDur,
              wordPulse,
              voiceRms,
              impactTransient,
              accentColor: resolvedSubConfig.accentColor || '#F97316',
              showHudMetric: true,
            });
          }

          drawDynamicSubtitles(
            ctx,
            activeClip.timedTokens,
            wordIdx,
            resolvedSubConfig,
            canvasW,
            canvasH,
            isLandscape,
            localElapsed,
            isCommercial
          );

          const pctTotal = Math.min(1, elapsedSec / fallbackTotalDurationSec);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(0, 0, canvasW, 6);
          ctx.fillStyle = resolvedSubConfig.accentColor || '#F97316';
          ctx.fillRect(0, 0, canvasW * pctTotal, 6);

          const curFrame = Math.floor(elapsedSec * 30);
          const totalF = Math.ceil(fallbackTotalDurationSec * 30);
          emitProgress({
            percent: Math.min(maxRenderPct, Math.round(16 + pctTotal * (maxRenderPct - 16))),
            phase: 'video',
            label: `Renderizando frames ${curFrame}/${totalF}`,
            currentFrame: curFrame,
            totalFrames: totalF,
            etaSec: Math.max(0, Math.ceil(fallbackTotalDurationSec - elapsedSec)),
            speedMultiplier: 1.0,
          });

          requestAnimationFrame(renderFrame);
        };

        requestAnimationFrame(renderFrame);
      });
    } finally {
      fallbackBitmapCache.dispose();
      fallbackDepthCache.dispose();
      fallbackVideoPool.dispose();
      fallbackWebgl?.dispose();
    }

    const recordedBlob = await recordingFinished;
    let finalBlob = recordedBlob;
    let finalMime = selectedMime;
    let finalExt: VideoExportFormat = isNativeMp4 ? 'mp4' : 'webm';

    if (exportFormat === 'mp4' && !isNativeMp4) {
      emitProgress({
        percent: 88,
        phase: 'muxing',
        label: 'Empaquetando MP4 universal (respaldo compatible)...',
      });
      const converted = await transcodeWebmToMp4(recordedBlob, signal);
      finalBlob = converted.blob;
      finalMime = converted.mimeType;
      finalExt = converted.extension;
    }

    emitProgress({
      percent: 100,
      phase: 'muxing',
      label: `Video .${finalExt.toUpperCase()} listo`,
    });

    return {
      videoUrl: URL.createObjectURL(finalBlob),
      blob: finalBlob,
      mimeType: finalMime,
      extension: finalExt,
      durationSec: Math.round(fallbackTotalDurationSec),
      aspectRatio,
      telemetry: fallbackAudioMaster.telemetry,
      fallbackNotice,
    };
  } finally {
    document.removeEventListener('visibilitychange', handleVisibility);
    onBackgroundWarning?.(false);
    await wakeLock?.release().catch(() => {});
    await studioGraph.dispose().catch(() => {});
  }
}

export async function renderPhotoToVideoWebm(options: {
  imageDataUrl: string;
  aspectRatio: VideoAspectRatio;
  durationSec: number;
  motionPreset: 'zoom_cine' | 'pan_horizontal' | 'pov_impacto' | 'flotante_suave';
  colorGrade: 'original' | 'calido' | 'cine' | 'vibrante';
  captionText?: string;
  audioDataUrl?: string;
  backgroundMusicId?: BackgroundMusicId;
  exportFormat?: VideoExportFormat;
  onProgress?: (percent: number, label: string) => void;
  signal?: AbortSignal;
}): Promise<RenderedVideoResult> {
  const {
    imageDataUrl,
    aspectRatio,
    durationSec,
    motionPreset,
    colorGrade,
    captionText,
    audioDataUrl,
    backgroundMusicId = 'none',
    exportFormat = 'mp4',
    onProgress,
    signal,
  } = options;

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Tu navegador no soporta la grabación directa de video (MediaRecorder).');
  }

  const isLandscape = aspectRatio === '16:9';
  const canvasW = isLandscape ? 1280 : 720;
  const canvasH = isLandscape ? 720 : 1280;

  onProgress?.(6, 'Preparando imagen y pista de audio...');

  const img = await loadImage(imageDataUrl);
  if (!img) {
    throw new Error('No se pudo cargar la imagen seleccionada para animar.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el lienzo de video.');
  }

  const wakeLock = await acquireWakeLock();
  const studioGraph = createStudioAudioGraph({
    connectToSpeakers: false,
    createMediaDestination: true,
    musicGainValue: 1.0,
  });
  const audioCtx = studioGraph.audioCtx;
  const dest = studioGraph.mediaDest!;

  try {
    const audioBuffer = audioDataUrl ? await decodeDataUrlAudio(audioCtx, audioDataUrl) : null;
    const finalDurationSec = audioBuffer
      ? Math.max(durationSec, Math.min(25, audioBuffer.duration + 0.4))
      : Math.max(4, Math.min(20, durationSec));

    const { mimeType: selectedMime, isNativeMp4 } = pickRecorderMime(exportFormat);
    const canvasStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 4_200_000,
    });

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const finished = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: selectedMime }));
      recorder.onerror = () => reject(new Error('Error al codificar el video animado.'));
    });

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const photoAudioStart = audioCtx.currentTime + 0.1;
    const silentPhotoBuf = audioCtx.createBuffer(2, audioCtx.sampleRate, audioCtx.sampleRate);
    const keepalivePhoto = audioCtx.createBufferSource();
    keepalivePhoto.buffer = silentPhotoBuf;
    keepalivePhoto.loop = true;
    const keepalivePhotoGain = audioCtx.createGain();
    keepalivePhotoGain.gain.value = 0.0001;
    keepalivePhoto.connect(keepalivePhotoGain);
    keepalivePhotoGain.connect(studioGraph.masterGain);
    keepalivePhoto.start(photoAudioStart);
    keepalivePhoto.stop(photoAudioStart + finalDurationSec + 0.5);

    const speechWindows: Array<{ startSec: number; endSec: number }> = [];
    if (audioBuffer) {
      const src = audioCtx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(studioGraph.voiceBus);
      src.start(photoAudioStart);
      speechWindows.push({ startSec: 0, endSec: audioBuffer.duration });
    }

    if (backgroundMusicId !== 'none') {
      scheduleDuckedBackgroundMusic({
        audioCtx,
        destination: studioGraph.musicBus,
        trackId: backgroundMusicId,
        startTime: photoAudioStart,
        totalDurationSec: finalDurationSec,
        baseVolume: 0.24,
        speechWindows,
      });
    }

    const filterMap: Record<typeof colorGrade, string> = {
      original: 'none',
      calido: 'saturate(1.16) sepia(0.14) contrast(1.04)',
      cine: 'contrast(1.16) saturate(0.92) brightness(0.96)',
      vibrante: 'saturate(1.32) contrast(1.08) brightness(1.03)',
    };

    const cleanCaption = (captionText || '').trim();
    const syntheticScene: ScriptScene | null = cleanCaption
      ? {
          id: 'photo-caption',
          orden: 1,
          tiempoInicio: '0:00',
          tiempoFin: `0:${String(Math.round(finalDurationSec)).padStart(2, '0')}`,
          segundoInicio: 0,
          segundoFin: Math.round(finalDurationSec),
          fase: 'Gancho',
          esGiro30s: false,
          narracion: cleanCaption,
          subtituloDinamico: cleanCaption.toUpperCase(),
          palabraDestacada: cleanCaption.split(/\s+/)[0] || '',
          promptVisual3D: '',
          movimientoCamara: '',
          transicionRapida: '',
          disenoSonoro: '',
        }
      : null;
    const syntheticTokens = syntheticScene
      ? buildTimedWordTokens(syntheticScene, finalDurationSec)
      : [];

    recorder.start(250);
    const maxPct = exportFormat === 'mp4' && !isNativeMp4 ? 84 : 98;

    await new Promise<void>((resolve, reject) => {
      const renderFrame = () => {
        if (signal?.aborted) {
          if (recorder.state === 'recording') recorder.stop();
          reject(new Error('Renderizado cancelado.'));
          return;
        }

        const elapsedSec = Math.max(0, audioCtx.currentTime - photoAudioStart);
        if (elapsedSec >= finalDurationSec) {
          if (recorder.state === 'recording') recorder.stop();
          resolve();
          return;
        }

        const progress = Math.min(1, Math.max(0, elapsedSec / finalDurationSec));
        const ease = 0.5 - Math.cos(progress * Math.PI) / 2;

        let scale = 1.04;
        let panX = 0;
        let panY = 0;

        if (motionPreset === 'zoom_cine') {
          scale = 1.03 + ease * 0.16;
          panY = (ease - 0.5) * -18;
        } else if (motionPreset === 'pan_horizontal') {
          scale = 1.16;
          panX = (ease - 0.5) * (isLandscape ? -130 : -90);
        } else if (motionPreset === 'pov_impacto') {
          const snap = Math.min(1, elapsedSec / 0.45);
          scale = 1.02 + snap * 0.14 + progress * 0.08;
          if (elapsedSec < 0.45) {
            const decay = 1 - elapsedSec / 0.45;
            panX = Math.sin(elapsedSec * 65) * 14 * decay;
            panY = Math.cos(elapsedSec * 52) * 10 * decay;
          }
        } else {
          scale = 1.08 + Math.sin(progress * Math.PI) * 0.06;
          panX = Math.sin(progress * Math.PI * 2) * 20;
          panY = Math.cos(progress * Math.PI * 2) * 12;
        }

        ctx.fillStyle = '#0B0D11';
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.save();
        ctx.filter = filterMap[colorGrade];
        drawCoverImage(ctx, img, canvasW, canvasH, scale, panX, panY);
        ctx.restore();

        const scrim = ctx.createLinearGradient(0, 0, 0, canvasH);
        scrim.addColorStop(0, 'rgba(0,0,0,0.22)');
        scrim.addColorStop(0.55, 'rgba(0,0,0,0.06)');
        scrim.addColorStop(1, cleanCaption ? 'rgba(0,0,0,0.78)' : 'rgba(0,0,0,0.34)');
        ctx.fillStyle = scrim;
        ctx.fillRect(0, 0, canvasW, canvasH);

        if (syntheticTokens.length > 0) {
          drawDynamicSubtitles(
            ctx,
            syntheticTokens,
            findWordIndexForTime(syntheticTokens, elapsedSec),
            DEFAULT_SUBTITLE_CONFIG,
            canvasW,
            canvasH,
            isLandscape,
            elapsedSec
          );
        }

        onProgress?.(
          Math.min(maxPct, Math.round(10 + progress * (maxPct - 10))),
          `Animando video ${aspectRatio} (${Math.ceil(finalDurationSec - elapsedSec)}s restantes)...`
        );

        requestAnimationFrame(renderFrame);
      };

      requestAnimationFrame(renderFrame);
    });

    const recordedBlob = await finished;
    let finalBlob = recordedBlob;
    let finalMime = selectedMime;
    let finalExt: VideoExportFormat = isNativeMp4 ? 'mp4' : 'webm';

    if (exportFormat === 'mp4' && !isNativeMp4) {
      onProgress?.(88, 'Convirtiendo clip a .MP4 universal...');
      const converted = await transcodeWebmToMp4(recordedBlob, signal);
      finalBlob = converted.blob;
      finalMime = converted.mimeType;
      finalExt = converted.extension;
    }

    onProgress?.(100, `Video .${finalExt.toUpperCase()} listo`);

    return {
      videoUrl: URL.createObjectURL(finalBlob),
      blob: finalBlob,
      mimeType: finalMime,
      extension: finalExt,
      durationSec: Math.round(finalDurationSec),
      aspectRatio,
    };
  } finally {
    await wakeLock?.release().catch(() => {});
    await studioGraph.dispose().catch(() => {});
  }
}
