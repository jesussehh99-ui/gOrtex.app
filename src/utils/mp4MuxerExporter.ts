import { Muxer, StreamTarget } from 'mp4-muxer';
import type {
  BackgroundMusicId,
  RenderQualityMode,
  ScriptScene,
  SubtitleConfig,
  VideoAspectRatio,
  ViralScript,
} from '../types';
import {
  loadUserMediaBlob,
  SlidingWindowVideoPool,
  type SlidingWindowVideoSource,
} from '../services/userMediaIngestionService';
import {
  AudioMasterPipeline,
  type AudioTelemetryTrack,
} from './audioMasterPipeline';
import {
  SceneBitmapCache,
  type SlidingWindowResolver,
} from './bitmapWindowCache';
import { CapabilityDetector } from './capabilityDetector';
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
import { localDepthEngine } from './localDepthEngine';
import { mediaStorageService } from './mediaStorageService';
import {
  applyStudioPostProcessing,
  drawSceneHudMetricCard,
  getSceneMoodColors,
} from './sceneImageUrl';
import { STUDIO_SAMPLE_RATE } from './studioAudioMixer';
import type { TimedWordToken } from './visualKeywords';
import { WebGLSceneRenderer } from './webglSceneRenderer';

export interface MuxerTimelineClip {
  scene: ScriptScene;
  videoEl: HTMLVideoElement | null;
  /** Clave OPFS para video real del usuario cargado bajo demanda con SlidingWindowVideoPool (N = 3) */
  userVideoKey?: string;
  /** URL directa opcional de clip de video en memoria */
  videoClipUrl?: string;
  imageBlobs: Blob[];
  artCacheKey?: string;
  audioBuffer: AudioBuffer | null;
  beatPlaybackRate?: number;
  startSec: number;
  durationSec: number;
  timedTokens: TimedWordToken[];
}

export type ExportProgressPhase = 'audio' | 'video' | 'muxing' | 'fallback';

export interface ExportProgressInfo {
  percent: number;
  phase: ExportProgressPhase;
  label: string;
  currentFrame?: number;
  totalFrames?: number;
  etaSec?: number;
  speedMultiplier?: number;
}

export interface EncodedBodyVideoChunk {
  data: Uint8Array;
  type: 'key' | 'delta';
  relTimestampUs: number;
  durationUs: number;
}

export interface CachedEncodedBodySegment {
  splitBeatIndex: number;
  offsetAfterBeatStartSec: number;
  videoChunks: EncodedBodyVideoChunk[];
  totalBodyFrames: number;
}

export interface NativeMp4ExportResult {
  blob: Blob;
  telemetry: AudioTelemetryTrack;
  storageBackend: 'opfs' | 'memory-chunks';
  audioCodecMode: 'aac' | 'opus';
  fallbackNotice?: string;
  capturedBodySegment?: CachedEncodedBodySegment;
  reusedBodyFrames?: number;
}

export interface DrawSubtitlesFn {
  (
    ctx: CanvasRenderingContext2D,
    tokens: TimedWordToken[],
    activeIdx: number,
    config: SubtitleConfig,
    canvasW: number,
    canvasH: number,
    isLandscape: boolean,
    localElapsed?: number,
    isCommercial?: boolean
  ): void;
}

export interface DrawCoverVideoFn {
  (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    canvasW: number,
    canvasH: number,
    scale: number,
    offsetX: number,
    offsetY: number
  ): void;
}

export class WebCodecsMp4UnsupportedError extends Error {
  public readonly reason?: string;
  constructor(message: string, reason?: string) {
    super(message);
    this.name = 'WebCodecsMp4UnsupportedError';
    this.reason = reason;
  }
}

const TARGET_FPS = 30;
const MAX_VIDEO_ENCODE_QUEUE = 5;
const MAX_AUDIO_ENCODE_QUEUE = 12;

/**
 * Cede el control al event loop mediante `MessageChannel` (inmune al throttling de 1s de
 * `setTimeout` y a la pausa de `requestAnimationFrame` cuando el usuario cambia de pestaña).
 */
function yieldWithoutBackgroundThrottling(): Promise<void> {
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        ch.port2.close();
        resolve();
      };
      ch.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Espera activa de backpressure sobre `VideoEncoder` / `AudioEncoder`:
 * se resuelve en cuanto dispara `ondequeue` o tras un micro-respaldo de 8ms (nunca bloquea ni satura RAM).
 */
function waitForEncoderDrain(
  encoder: VideoEncoder | AudioEncoder,
  maxQueueSize: number,
  signal?: AbortSignal
): Promise<void> {
  if (encoder.encodeQueueSize <= maxQueueSize) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Renderizado cancelado.'));
      return;
    }
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(fallbackTimer);
      encoder.removeEventListener('dequeue', onDequeue);
      signal?.removeEventListener('abort', onAbort);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Renderizado cancelado.'));
    };

    const onDequeue = () => {
      if (encoder.encodeQueueSize <= maxQueueSize) {
        finish();
      }
    };

    const fallbackTimer = window.setTimeout(finish, 8);
    signal?.addEventListener('abort', onAbort, { once: true });
    encoder.addEventListener('dequeue', onDequeue);
  });
}

/**
 * Busca con precisión un instante exacto dentro de un clip de video HTML5 (Google Flow ↑ Clip)
 * para renderizado determinista cuadro por cuadro en Canvas.
 */
async function seekVideoDeterministically(
  video: HTMLVideoElement,
  targetTimeSec: number
): Promise<void> {
  const naturalDur =
    Number.isFinite(video.duration) && video.duration > 0.15 ? video.duration : 0;
  const wrapped = naturalDur > 0 ? targetTimeSec % naturalDur : Math.max(0, targetTimeSec);
  if (Math.abs(video.currentTime - wrapped) < 0.015 && video.readyState >= 2) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 180);
    video.addEventListener(
      'seeked',
      () => {
        window.clearTimeout(timer);
        finish();
      },
      { once: true }
    );
    try {
      video.currentTime = wrapped;
    } catch {
      window.clearTimeout(timer);
      finish();
    }
  });
}

/**
 * Exportador Nativo MP4 Offline No Bloqueante (WebCodecs + Backpressure + OPFS StreamTarget):
 * - Desacoplado 100% de `requestAnimationFrame`: inmune al throttling de pestañas en segundo plano.
 * - Valida capacidades vía `CapabilityDetector` (H.264 con dimensiones pares + AAC 48kHz/128kbps o Opus).
 * - Usa `AudioMasterPipeline` (WSOLA pitch-preserving + `setValueCurveAtTime` ducking + `AudioTelemetryTrack`).
 * - Mantiene `SceneBitmapCache` estrictamente en `N = 3` (`bitmap.close()` inmediato).
 * - Aplica backpressure real (`videoEncoder.encodeQueueSize > 5` -> `ondequeue`).
 * - Escribe chunks incrementalmente a OPFS mediante `StreamTarget` (cero ArrayBuffer gigante en RAM).
 */
export async function exportNativeMp4WithMuxer(options: {
  script: ViralScript;
  clips: MuxerTimelineClip[];
  totalDurationSec: number;
  aspectRatio: VideoAspectRatio;
  canvasW: number;
  canvasH: number;
  subtitleConfig: SubtitleConfig;
  backgroundMusicId: BackgroundMusicId;
  musicVolume: number;
  enableTransitionSfx: boolean;
  sfxVolumeDb?: number;
  playbackRate?: number;
  renderQuality?: RenderQualityMode;
  /** Optimización Hook Factory: captura chunks H.264 codificados desde este índice de beat (ej. 2 = Beat 3) */
  captureBodyFromBeatIndex?: number;
  /** Optimización Hook Factory: reutiliza chunks H.264 ya codificados para Beats 3..N sin re-renderizar */
  reuseEncodedBody?: CachedEncodedBodySegment;
  drawSubtitles: DrawSubtitlesFn;
  drawCoverVideo: DrawCoverVideoFn;
  onProgress?: (percent: number, label: string) => void;
  onProgressInfo?: (info: ExportProgressInfo) => void;
  signal?: AbortSignal;
}): Promise<NativeMp4ExportResult> {
  const {
    script,
    clips,
    aspectRatio,
    canvasW: rawCanvasW,
    canvasH: rawCanvasH,
    subtitleConfig,
    backgroundMusicId,
    musicVolume,
    enableTransitionSfx,
    sfxVolumeDb,
    playbackRate = 1,
    renderQuality = 'cine_3d',
    captureBodyFromBeatIndex,
    reuseEncodedBody,
    drawSubtitles,
    drawCoverVideo,
    onProgress,
    onProgressInfo,
    signal,
  } = options;

  const emitProgress = (info: ExportProgressInfo) => {
    onProgress?.(info.percent, info.label);
    onProgressInfo?.(info);
  };

  // 1) Detección de capacidades WebCodecs (dimensiones pares obligatorias H.264 + AAC/Opus)
  const caps = await CapabilityDetector.detect(rawCanvasW, rawCanvasH, TARGET_FPS);
  if (!caps.canNativeMp4 || !caps.videoConfig || !caps.audioConfig || caps.audioCodecMode === 'fallback') {
    throw new WebCodecsMp4UnsupportedError(
      caps.fallbackReason || 'WebCodecs H.264/AAC no disponible en este navegador.',
      caps.fallbackReason
    );
  }

  const canvasW = caps.evenWidth;
  const canvasH = caps.evenHeight;
  const safePlaybackRate = Math.max(0.75, Math.min(1.5, Number(playbackRate) || 1));
  const projectSeedForAudio = hashSeed32(script.id || 'gortex-default');

  // 2) Pipeline de Audio Offline Determinista (48kHz Estéreo + WSOLA pitch-preserving + AudioTelemetryTrack)
  emitProgress({
    percent: 8,
    phase: 'audio',
    label: `Mezclando audio 48kHz (${safePlaybackRate}x WSOLA + Audio Director Procedural)...`,
  });

  const masterResult = await AudioMasterPipeline.renderMaster({
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
    projectSeed: projectSeedForAudio,
    fps: TARGET_FPS,
    signal,
    onProgress: (pct, label) => {
      emitProgress({ percent: pct, phase: 'audio', label });
    },
  });

  if (signal?.aborted) {
    throw new Error('Renderizado cancelado.');
  }

  const { telemetry, resolvedClips, totalDurationSec } = masterResult;
  const mixedAudioBuffer = telemetry.masterBuffer;

  // Fusionar la línea de tiempo exacta recalculada post-WSOLA con los Blobs de imagen/video de cada beat
  const timelineClips: MuxerTimelineClip[] = resolvedClips.map((rc, idx) => ({
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

  const totalVideoFrames = Math.max(1, Math.ceil(totalDurationSec * TARGET_FPS));
  const frameDurationUs = Math.round(1_000_000 / TARGET_FPS);

  // Punto de empalme limpio post-transición (0.40s dentro del Beat 3) para reutilización de cuerpo en Hook Factory
  const BODY_TRANSITION_MARGIN_SEC = 0.4;
  const canCaptureBody =
    typeof captureBodyFromBeatIndex === 'number' &&
    captureBodyFromBeatIndex > 0 &&
    captureBodyFromBeatIndex < timelineClips.length &&
    !reuseEncodedBody;
  const captureSplitClip = canCaptureBody ? timelineClips[captureBodyFromBeatIndex] : null;
  const captureSplitFrameIdx = captureSplitClip
    ? Math.min(
        totalVideoFrames - 1,
        Math.ceil((captureSplitClip.startSec + BODY_TRANSITION_MARGIN_SEC) * TARGET_FPS)
      )
    : -1;
  const captureSplitTimestampUs =
    captureSplitFrameIdx >= 0 ? Math.round((captureSplitFrameIdx * 1_000_000) / TARGET_FPS) : -1;
  const capturedBodyChunks: EncodedBodyVideoChunk[] = [];

  const canReuseBody =
    Boolean(reuseEncodedBody && reuseEncodedBody.videoChunks.length > 0) &&
    reuseEncodedBody!.splitBeatIndex > 0 &&
    reuseEncodedBody!.splitBeatIndex < timelineClips.length;
  const reuseSplitClip = canReuseBody ? timelineClips[reuseEncodedBody!.splitBeatIndex] : null;
  const framesToRenderLocally =
    canReuseBody && reuseSplitClip
      ? Math.min(
          totalVideoFrames,
          Math.ceil(
            (reuseSplitClip.startSec + reuseEncodedBody!.offsetAfterBeatStartSec) * TARGET_FPS
          )
        )
      : totalVideoFrames;

  const expectedVideoChunksTotal = canReuseBody
    ? framesToRenderLocally + reuseEncodedBody!.videoChunks.length + 48
    : totalVideoFrames + 32;

  const totalAudioFrames = mixedAudioBuffer.length;
  const audioChunkSize = caps.audioCodecMode === 'opus' ? 960 : 1024;
  const expectedAudioChunks = Math.ceil(totalAudioFrames / audioChunkSize) + 128;

  // 3) Crear archivo temporal incremental en OPFS (o fallback en chunks) para StreamTarget
  const exportId = `${script.id}_${Date.now()}`;
  const tempStream = await mediaStorageService.createTempExportStream(exportId);
  let streamWriteError: Error | null = null;
  let exportCompleted = false;

  const target = new StreamTarget({
    chunked: true,
    chunkSize: 1024 * 1024, // 1 MiB por escritura incremental a OPFS
    onData: (data, position) => {
      void tempStream.writeChunk(data, position).catch((err) => {
        streamWriteError = err instanceof Error ? err : new Error(String(err));
      });
    },
  });

  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width: canvasW,
      height: canvasH,
      frameRate: TARGET_FPS,
    },
    audio: {
      codec: caps.audioCodecMode,
      numberOfChannels: 2,
      sampleRate: STUDIO_SAMPLE_RATE,
    },
    // Reserva cabecera moov al inicio + transmite mdat directo a OPFS (cero ArrayBuffer gigante en RAM)
    fastStart: {
      expectedVideoChunks: expectedVideoChunksTotal,
      expectedAudioChunks,
    },
    firstTimestampBehavior: 'offset',
  });

  let encodeError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
      if (canCaptureBody && captureSplitTimestampUs >= 0 && chunk.timestamp >= captureSplitTimestampUs - 1000) {
        const copyBuf = new Uint8Array(chunk.byteLength);
        chunk.copyTo(copyBuf);
        capturedBodyChunks.push({
          data: copyBuf,
          type: chunk.type,
          relTimestampUs: Math.max(0, chunk.timestamp - captureSplitTimestampUs),
          durationUs: chunk.duration ?? frameDurationUs,
        });
      }
    },
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err));
    },
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      muxer.addAudioChunk(chunk, meta);
    },
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err));
    },
  });

  videoEncoder.configure(caps.videoConfig);
  audioEncoder.configure(caps.audioConfig);

  // Usar OffscreenCanvas si está disponible o HTMLCanvasElement estándar
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    try {
      videoEncoder.close();
      audioEncoder.close();
    } catch {
      // Silencioso
    }
    await tempStream.abortAndCleanup();
    throw new Error('No se pudo crear el lienzo 2D para mp4-muxer.');
  }

  const isLandscape = aspectRatio === '16:9';
  const isCommercial = script.studioMode === 'commercial_real_estate';
  const isViralMode =
    !isCommercial &&
    (script.publicoObjetivo === 'viral_meme' || script.estilo3D === 'viral_meme_3d');
  const projectSeed = hashSeed32(script.id || 'gortex-default');

  // Caché estricta de Ventana Deslizante (N = 3): solo [beatIndex - 1, beatIndex, beatIndex + 1] en VRAM y VideoPool
  const bitmapCache = new SceneBitmapCache(undefined, script.id);
  const depthBitmapCache = new SceneBitmapCache(undefined, script.id);
  const videoPool = new SlidingWindowVideoPool();
  const resolveVideoPoolSource = (idx: number): SlidingWindowVideoSource | null => {
    const clip = timelineClips[idx];
    if (!clip) return null;
    if (clip.userVideoKey) {
      const key = clip.userVideoKey;
      return {
        signature: `mux-opfs-video::${script.id}::${clip.scene.id}::${key}`,
        directUrl: clip.videoClipUrl,
        loadBlob: () => loadUserMediaBlob(script.id, key),
      };
    }
    if (clip.videoClipUrl) {
      return {
        signature: `mux-url-video::${clip.scene.id}::${clip.videoClipUrl}`,
        directUrl: clip.videoClipUrl,
      };
    }
    return null;
  };
  const activeSubShotByClip = new Map<number, number>();
  const resolver: SlidingWindowResolver = {
    getSignature: (idx: number) => {
      const clip = timelineClips[idx];
      if (!clip || clip.imageBlobs.length === 0) return null;
      const subIdx = activeSubShotByClip.get(idx) ?? 0;
      const blob = clip.imageBlobs[subIdx] ?? clip.imageBlobs[0];
      if (!blob) return null;
      return `mux::${clip.scene.id}::${subIdx}::${blob.size}::${blob.type}`;
    },
    resolveBlob: (idx: number) => {
      const clip = timelineClips[idx];
      if (!clip || clip.imageBlobs.length === 0) return null;
      const subIdx = activeSubShotByClip.get(idx) ?? 0;
      return clip.imageBlobs[subIdx] ?? clip.imageBlobs[0] ?? null;
    },
  };
  const depthResolver: SlidingWindowResolver = {
    getSignature: (idx: number) => {
      if (renderQuality !== 'cine_3d') return null;
      const key = timelineClips[idx]?.artCacheKey;
      if (!key) return null;
      return `muxdepth::${key}`;
    },
    resolveBlob: (idx: number) => {
      if (renderQuality !== 'cine_3d') return null;
      const key = timelineClips[idx]?.artCacheKey;
      if (!key) return null;
      return localDepthEngine.loadPersistedDepthBlob(key);
    },
  };

  let webglRenderer: WebGLSceneRenderer | null = null;
  if (renderQuality === 'cine_3d' && WebGLSceneRenderer.isWebGL2Supported()) {
    try {
      webglRenderer = new WebGLSceneRenderer(canvasW, canvasH, true);
      if (!webglRenderer.isAvailable()) {
        webglRenderer.dispose();
        webglRenderer = null;
      }
    } catch {
      webglRenderer = null;
    }
  }

  try {
    // 4) Codificar toda la pista de audio 48 kHz Estéreo con backpressure controlado
    emitProgress({
      percent: 16,
      phase: 'audio',
      label: `Codificando audio 48kHz (${caps.audioCodecMode.toUpperCase()} 128 kbps)...`,
    });

    const leftData = mixedAudioBuffer.getChannelData(0);
    const rightData =
      mixedAudioBuffer.numberOfChannels > 1 ? mixedAudioBuffer.getChannelData(1) : leftData;

    for (let offset = 0; offset < totalAudioFrames; offset += audioChunkSize) {
      if (signal?.aborted) {
        throw new Error('Renderizado cancelado.');
      }
      if (encodeError) throw encodeError;
      if (streamWriteError) throw streamWriteError;

      if (audioEncoder.encodeQueueSize > MAX_AUDIO_ENCODE_QUEUE) {
        await waitForEncoderDrain(audioEncoder, MAX_AUDIO_ENCODE_QUEUE, signal);
      }

      const frames = Math.min(audioChunkSize, totalAudioFrames - offset);
      const planar = new Float32Array(frames * 2);
      planar.set(leftData.subarray(offset, offset + frames), 0);
      planar.set(rightData.subarray(offset, offset + frames), frames);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: STUDIO_SAMPLE_RATE,
        numberOfFrames: frames,
        numberOfChannels: 2,
        timestamp: Math.round((offset / STUDIO_SAMPLE_RATE) * 1_000_000),
        data: planar,
      });
      try {
        audioEncoder.encode(audioData);
      } finally {
        audioData.close();
      }
    }

    // 5) Bucle offline determinista 30.000 fps CFR (inmune a cambio de pestaña + backpressure estricto)
    const videoLoopStartMs = performance.now();

    for (let frameIdx = 0; frameIdx < framesToRenderLocally; frameIdx++) {
      if (signal?.aborted) {
        throw new Error('Renderizado cancelado.');
      }
      if (encodeError) throw encodeError;
      if (streamWriteError) throw streamWriteError;

      // Control estricto de backpressure: si encodeQueueSize > 5, esperar drain antes de renderizar
      if (videoEncoder.encodeQueueSize > MAX_VIDEO_ENCODE_QUEUE) {
        await waitForEncoderDrain(videoEncoder, MAX_VIDEO_ENCODE_QUEUE, signal);
      }

      const elapsedSec = frameIdx / TARGET_FPS;
      const foundClipIdx = timelineClips.findIndex(
        (c) => elapsedSec >= c.startSec && elapsedSec < c.startSec + c.durationSec
      );
      const activeClipIdx =
        foundClipIdx >= 0 ? foundClipIdx : Math.max(0, timelineClips.length - 1);
      const activeClip = timelineClips[activeClipIdx];

      const safeDur = Math.max(0.6, activeClip.durationSec);
      const localElapsed = Math.max(0, Math.min(safeDur, elapsedSec - activeClip.startSec));
      const normalizedT = localElapsed / safeDur;

      const {
        wordIdx,
        wordPulse: baseWordPulse,
        isKeyword,
      } = computeDeterministicWordPulse(activeClip.timedTokens, localElapsed);
      const wordPulse =
        isKeyword || isViralMode || activeClip.scene.esGiro30s
          ? Math.min(1, baseWordPulse * 1.2)
          : baseWordPulse;

      const hasPooledVideo = Boolean(activeClip.userVideoKey || activeClip.videoClipUrl);
      const pooledVideoEl = hasPooledVideo
        ? await videoPool.ensureWindowForBeat(
            activeClipIdx,
            timelineClips.length,
            resolveVideoPoolSource
          )
        : null;
      const activeVideoEl = activeClip.videoEl ?? pooledVideoEl;

      if (activeVideoEl && activeVideoEl.readyState >= 2) {
        bitmapCache.syncWindow(activeClipIdx, timelineClips.length, resolver);
        await seekVideoDeterministically(
          activeVideoEl,
          localElapsed * (activeClip.beatPlaybackRate ?? safePlaybackRate)
        );
        ctx.fillStyle = '#07090D';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Encuadre íntegro 1.0x para clips reales del usuario (sin micro-crop artificial)
        const cameraSeed = deriveBeatSeed(projectSeed, activeClipIdx, PRNG_CHANNEL.CAMERA);
        const scale = isCommercial ? 1.0 : 1.02 + Math.sin(normalizedT * Math.PI) * 0.014;
        const driftX = isCommercial ? 0 : deterministicFbm1D(cameraSeed, normalizedT * 2.4 + 0.5) * 3.0;
        const driftY = isCommercial ? 0 : deterministicFbm1D(cameraSeed + 59, normalizedT * 2.1 + 3.7) * 2.2;
        drawCoverVideo(ctx, activeVideoEl, canvasW, canvasH, scale, driftX, driftY);

        const clipMood = getSceneMoodColors(activeClip.scene);
        applyStudioPostProcessing(ctx, canvasW, canvasH, {
          moodGlow: clipMood.glow,
          accentColor: subtitleConfig.accentColor || '#F97316',
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
        // Mantener el pool de video alineado con la ventana deslizante incluso en beats de foto/IA
        if (timelineClips.some((c) => Boolean(c.userVideoKey || c.videoClipUrl))) {
          void videoPool.ensureWindowForBeat(
            activeClipIdx,
            timelineClips.length,
            resolveVideoPoolSource
          );
        }

        const blobCount = activeClip.imageBlobs.length;
        const subShotIdx =
          blobCount > 1 ? Math.min(blobCount - 1, Math.floor(normalizedT * blobCount)) : 0;
        activeSubShotByClip.set(activeClipIdx, subShotIdx);

        if (activeClipIdx > 0) {
          const prevClip = timelineClips[activeClipIdx - 1];
          if (prevClip && prevClip.imageBlobs.length > 0) {
            activeSubShotByClip.set(activeClipIdx - 1, prevClip.imageBlobs.length - 1);
          }
        }

        const [{ current: activeBitmap, previous: prevBitmap }, { current: activeDepthBitmap, previous: prevDepthBitmap }] =
          await Promise.all([
            bitmapCache.ensureWindowReadyForBeat(
              activeClipIdx,
              timelineClips.length,
              resolver
            ),
            depthBitmapCache.ensureWindowReadyForBeat(
              activeClipIdx,
              timelineClips.length,
              depthResolver
            ),
          ]);

        const voiceRms = telemetry.voiceRms[frameIdx] ?? 0;
        const impactTransient = Math.max(
          telemetry.impactTransients[frameIdx] ?? 0,
          wordPulse * (activeClip.scene.esGiro30s ? 0.85 : 0.45)
        );
        const curArtKey = activeClip.artCacheKey || `mux-beat-${activeClipIdx}-${subShotIdx}`;
        const prevArtKey =
          activeClipIdx > 0
            ? timelineClips[activeClipIdx - 1]?.artCacheKey || `mux-beat-${activeClipIdx - 1}`
            : '';
        const previousScene = activeClipIdx > 0 ? timelineClips[activeClipIdx - 1]?.scene : undefined;

        renderUnifiedCinematicFrame({
          targetCtx: ctx,
          webglRenderer,
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
          frameIndex: frameIdx,
          localElapsed,
          sceneDuration: safeDur,
          wordPulse,
          voiceRms,
          impactTransient,
          accentColor: subtitleConfig.accentColor || '#F97316',
          showHudMetric: true,
        });
      }

      drawSubtitles(
        ctx,
        activeClip.timedTokens,
        wordIdx,
        subtitleConfig,
        canvasW,
        canvasH,
        isLandscape,
        localElapsed,
        isCommercial
      );

      // Barra de progreso superior
      const pctTotal = Math.min(1, elapsedSec / Math.max(0.1, totalDurationSec));
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, 0, canvasW, 6);
      ctx.fillStyle = subtitleConfig.accentColor || '#F97316';
      ctx.fillRect(0, 0, canvasW * pctTotal, 6);

      const timestampUs = Math.round((frameIdx * 1_000_000) / TARGET_FPS);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });
      const forceBodyKeyframe = canCaptureBody && frameIdx === captureSplitFrameIdx;
      try {
        videoEncoder.encode(videoFrame, {
          keyFrame: forceBodyKeyframe || frameIdx % (TARGET_FPS * 2) === 0,
        });
      } finally {
        videoFrame.close();
      }

      if (frameIdx % 6 === 0 || frameIdx === framesToRenderLocally - 1) {
        const wallElapsedSec = Math.max(0.05, (performance.now() - videoLoopStartMs) / 1000);
        const renderedMediaSec = (frameIdx + 1) / TARGET_FPS;
        const speedMultiplier = Math.max(0.1, renderedMediaSec / wallElapsedSec);
        const remainingMediaSec = Math.max(0, framesToRenderLocally / TARGET_FPS - renderedMediaSec);
        const etaSec = Math.max(0, Math.ceil(remainingMediaSec / speedMultiplier));
        const pct = Math.min(
          94,
          20 + Math.round(((frameIdx + 1) / Math.max(1, framesToRenderLocally)) * 74)
        );

        emitProgress({
          percent: pct,
          phase: 'video',
          label: canReuseBody
            ? `Renderizando Gancho ${frameIdx + 1}/${framesToRenderLocally} (+ cuerpo reutilizado)`
            : `Renderizando frames ${frameIdx + 1}/${framesToRenderLocally}`,
          currentFrame: frameIdx + 1,
          totalFrames: framesToRenderLocally,
          etaSec,
          speedMultiplier,
        });

        // Micro-cesión inmune a pestaña en segundo plano (mantiene la UI y botón Cancelar reactivos)
        await yieldWithoutBackgroundThrottling();
      }
    }

    // 6) Vaciar encoders y, si aplica Hook Factory, empalmar los chunks H.264 del cuerpo común (Beats 3..N) sin re-codificar
    emitProgress({
      percent: 96,
      phase: 'muxing',
      label: canReuseBody
        ? 'Empalmando cuerpo común (Beats 3..N) + faststart...'
        : 'Empaquetando MP4 (faststart)...',
      currentFrame: framesToRenderLocally,
      totalFrames: framesToRenderLocally,
      etaSec: 1,
    });

    await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
    if (encodeError) throw encodeError;
    if (streamWriteError) throw streamWriteError;

    let reusedBodyFrames = 0;
    if (canReuseBody && reuseEncodedBody) {
      const bodyOffsetUs = Math.round((framesToRenderLocally * 1_000_000) / TARGET_FPS);
      for (const chunk of reuseEncodedBody.videoChunks) {
        muxer.addVideoChunkRaw(
          chunk.data,
          chunk.type,
          bodyOffsetUs + chunk.relTimestampUs,
          chunk.durationUs
        );
      }
      reusedBodyFrames = reuseEncodedBody.totalBodyFrames;
    }

    muxer.finalize();
    const finalBlob = await tempStream.finalizeToBlob('video/mp4');
    exportCompleted = true;

    const capturedBodySegment: CachedEncodedBodySegment | undefined =
      canCaptureBody && capturedBodyChunks.length > 0 && capturedBodyChunks[0].type === 'key'
        ? {
            splitBeatIndex: captureBodyFromBeatIndex!,
            offsetAfterBeatStartSec: BODY_TRANSITION_MARGIN_SEC,
            videoChunks: capturedBodyChunks,
            totalBodyFrames: Math.max(0, totalVideoFrames - captureSplitFrameIdx),
          }
        : undefined;

    return {
      blob: finalBlob,
      telemetry,
      storageBackend: tempStream.backend,
      audioCodecMode: caps.audioCodecMode,
      fallbackNotice: caps.fallbackReason,
      capturedBodySegment,
      reusedBodyFrames,
    };
  } finally {
    bitmapCache.dispose();
    depthBitmapCache.dispose();
    videoPool.dispose();
    webglRenderer?.dispose();
    try {
      if (videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      // Silencioso
    }
    try {
      if (audioEncoder.state !== 'closed') audioEncoder.close();
    } catch {
      // Silencioso
    }
    if (!exportCompleted) {
      await tempStream.abortAndCleanup().catch(() => {});
    }
  }
}
