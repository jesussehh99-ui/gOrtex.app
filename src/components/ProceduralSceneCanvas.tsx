import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RenderQualityMode,
  SceneMediaAsset,
  SceneMediaMap,
  ScriptScene,
  VideoAspectRatio,
  ViralScript,
} from '../types';
import {
  buildUserPhotoArtCacheKey,
  isUserMediaBeat,
  loadUserMediaBlob,
  SlidingWindowVideoPool,
  type SlidingWindowVideoSource,
} from '../services/userMediaIngestionService';
import {
  buildSceneArtCacheKey,
  enqueueScriptScenesSequentially,
  getCachedSceneArtBlobWithFallback,
  subscribeSceneArtQueue,
  useSceneArtQueue,
} from '../utils/aiImageQueue';
import {
  dataUrlToCompressedWebpBlob,
  SlidingWindowBitmapCache,
  type SlidingWindowResolver,
} from '../utils/bitmapWindowCache';
import {
  renderUnifiedCinematicFrame,
  sampleDeterministicPreviewTelemetry,
} from '../utils/cinematicCompositor';
import {
  drawCommercialCtaOverlay,
  drawCommercialSpecsHud,
} from '../utils/commercialCanvasOverlay';
import {
  computeDeterministicWordPulse,
  deriveBeatSeed,
  deterministicFbm1D,
  hashSeed32,
  PRNG_CHANNEL,
} from '../utils/deterministicPrng';
import { isLegacyFlatSvgDataUrl } from '../utils/flowPromptBuilder';
import { localDepthEngine } from '../utils/localDepthEngine';
import {
  applyStudioPostProcessing,
  drawSceneHudMetricCard,
  getSceneMoodColors,
} from '../utils/sceneImageUrl';
import { buildTimedWordTokens } from '../utils/visualKeywords';
import { WebGLSceneRenderer } from '../utils/webglSceneRenderer';

interface ProceduralSceneCanvasProps {
  scene: ScriptScene | undefined;
  script: ViralScript;
  beatIndex: number;
  sceneMedia: SceneMediaMap;
  media?: SceneMediaAsset;
  aspectRatio: VideoAspectRatio;
  localElapsed: number;
  sceneDuration: number;
  isPlaying: boolean;
  accentColor: string;
  renderQuality?: RenderQualityMode;
  globalTimeSec?: number;
  prePauseSec?: number;
  beatRate?: number;
  voiceRmsTrack?: Float32Array | null;
}

function drawCoverVideo(
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

/**
 * Lienzo de vista previa determinista bit-a-bit con Sliding-Window Cache (N = 3)
 * y Compositor WebGL2 Cinematográfico (TrueDepth IA + Fallback heurístico + Fallback Canvas 2D):
 * - Almacena imágenes y mapas de profundidad como Blobs WebP comprimidos y mantiene decodificados
 *   en VRAM estrictamente 3 slots: `[beatIndex - 1, beatIndex, beatIndex + 1]`,
 *   ejecutando `bitmap.close()` de inmediato sobre los frames salientes.
 * - Cero `Math.random()`, `Date.now()` o `performance.now()`: al pausar o hacer scrubbing,
 *   se congela exactamente en el fotograma `t` con paridad píxel-a-píxel respecto al .MP4.
 */
export function ProceduralSceneCanvas({
  scene,
  script,
  beatIndex,
  sceneMedia,
  media,
  aspectRatio,
  localElapsed,
  sceneDuration,
  isPlaying,
  accentColor,
  renderQuality = 'cine_3d',
  globalTimeSec = 0,
  prePauseSec = 0,
  beatRate = 1,
  voiceRmsTrack = null,
}: ProceduralSceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoPoolRef = useRef<SlidingWindowVideoPool | null>(null);
  const bitmapCacheRef = useRef<SlidingWindowBitmapCache | null>(null);
  const depthBitmapCacheRef = useRef<SlidingWindowBitmapCache | null>(null);
  const webglRendererRef = useRef<WebGLSceneRenderer | null>(null);

  const [bitmapVersion, setBitmapVersion] = useState(0);
  const [depthVersion, setDepthVersion] = useState(0);
  const [queueRevision, setQueueRevision] = useState(0);
  const [videoReadyTick, setVideoReadyTick] = useState(0);

  // Instanciar cachés deslizantes N = 3 (color, depth y video pool) una sola vez por montaje y liberar VRAM/ObjectURLs al desmontar
  if (!bitmapCacheRef.current) {
    bitmapCacheRef.current = new SlidingWindowBitmapCache(() => {
      setBitmapVersion((v) => v + 1);
    }, script.id);
  }
  if (!depthBitmapCacheRef.current) {
    depthBitmapCacheRef.current = new SlidingWindowBitmapCache(() => {
      setDepthVersion((v) => v + 1);
    }, script.id);
  }
  if (!videoPoolRef.current) {
    videoPoolRef.current = new SlidingWindowVideoPool();
  }

  useEffect(() => {
    bitmapCacheRef.current?.setProjectId(script.id);
    depthBitmapCacheRef.current?.setProjectId(script.id);
  }, [script.id]);

  useEffect(() => {
    const colorCache = bitmapCacheRef.current;
    const depthCache = depthBitmapCacheRef.current;
    const videoPool = videoPoolRef.current;
    return () => {
      colorCache?.dispose();
      bitmapCacheRef.current = null;
      depthCache?.dispose();
      depthBitmapCacheRef.current = null;
      videoPool?.dispose();
      videoPoolRef.current = null;
      webglRendererRef.current?.dispose();
      webglRendererRef.current = null;
    };
  }, []);

  // Gestionar ciclo de vida del contexto WebGL2 según modo Cine 3D vs Rápido 2D
  useEffect(() => {
    if (renderQuality !== 'cine_3d') {
      if (webglRendererRef.current) {
        webglRendererRef.current.dispose();
        webglRendererRef.current = null;
      }
      return;
    }
    if (!webglRendererRef.current && WebGLSceneRenderer.isWebGL2Supported()) {
      const initW = aspectRatio === '16:9' ? 640 : 405;
      const initH = aspectRatio === '16:9' ? 360 : 720;
      try {
        webglRendererRef.current = new WebGLSceneRenderer(initW, initH, false);
      } catch {
        webglRendererRef.current = null;
      }
    }
  }, [renderQuality, aspectRatio]);

  const isUserMedia = isUserMediaBeat(scene?.mediaSource);
  const isUserVideoBeat = Boolean(
    media?.videoClipUrl || (scene?.mediaSource === 'user_video' && scene?.userMediaKey)
  );
  const hasUserPhotoBeat = Boolean(scene?.mediaSource === 'user_photo' && scene?.userMediaKey);
  const customPhotoUrl =
    !isUserVideoBeat &&
    !hasUserPhotoBeat &&
    media?.imageDataUrl &&
    !isLegacyFlatSvgDataUrl(media.imageDataUrl)
      ? media.imageDataUrl
      : undefined;

  const queueState = useSceneArtQueue(
    scene,
    script,
    aspectRatio,
    media?.imageSeed,
    Boolean(isUserVideoBeat || hasUserPhotoBeat || customPhotoUrl || isUserMedia)
  );

  // Suscripción a actualizaciones de la cola de imágenes WebP y al motor TrueDepth IA
  useEffect(() => {
    const unsubArt = subscribeSceneArtQueue(() => {
      setQueueRevision((r) => r + 1);
    });
    const unsubDepth = localDepthEngine.subscribe(() => {
      setDepthVersion((v) => v + 1);
    });
    return () => {
      unsubArt();
      unsubDepth();
    };
  }, []);

  // Asegurar que todas las escenas del guion activo se encolen estrictamente en orden 1..N (1 a la vez)
  useEffect(() => {
    enqueueScriptScenesSequentially(script, aspectRatio);
  }, [script.id, script.escenas.length, aspectRatio]);

  const getSceneArtKey = useCallback(
    (idx: number): string | null => {
      const sc = script.escenas[idx];
      if (!sc) return null;
      const asset = sceneMedia[sc.id];
      if (asset?.videoClipUrl || (sc.mediaSource === 'user_video' && sc.userMediaKey)) {
        return null;
      }
      if (sc.mediaSource === 'user_photo' && sc.userMediaKey) {
        return buildUserPhotoArtCacheKey(script.id, sc.userMediaKey);
      }
      if (asset?.imageDataUrl && !isLegacyFlatSvgDataUrl(asset.imageDataUrl)) {
        return `custom::${script.id}::${sc.id}::${asset.imageDataUrl.length}::${asset.imageDataUrl.slice(-24)}`;
      }
      const resolved = getCachedSceneArtBlobWithFallback(sc, script, aspectRatio, asset?.imageSeed);
      if (resolved) return resolved.artCacheKey;
      return buildSceneArtCacheKey(sc, script, aspectRatio, asset?.imageSeed);
    },
    [script, aspectRatio, sceneMedia]
  );

  // Resolver determinista de Blobs WebP de color (OPFS fotos reales + custom + IA con Smart Reframe)
  const windowResolver = useMemo<SlidingWindowResolver>(
    () => ({
      getSignature: (idx: number) => {
        const sc = script.escenas[idx];
        if (!sc) return null;
        const asset = sceneMedia[sc.id];
        if (asset?.videoClipUrl || (sc.mediaSource === 'user_video' && sc.userMediaKey)) {
          return null;
        }
        if (sc.mediaSource === 'user_photo' && sc.userMediaKey) {
          return `userphoto::${script.id}::${sc.id}::${sc.userMediaKey}`;
        }
        if (asset?.imageDataUrl && !isLegacyFlatSvgDataUrl(asset.imageDataUrl)) {
          return `custom::${sc.id}::${asset.imageDataUrl.length}::${asset.imageDataUrl.slice(-24)}`;
        }
        const resolved = getCachedSceneArtBlobWithFallback(sc, script, aspectRatio, asset?.imageSeed);
        if (!resolved) return null;
        return `ai::${resolved.artCacheKey}::${resolved.blob.size}`;
      },
      resolveBlob: async (idx: number) => {
        const sc = script.escenas[idx];
        if (!sc) return null;
        const asset = sceneMedia[sc.id];
        if (asset?.videoClipUrl || (sc.mediaSource === 'user_video' && sc.userMediaKey)) {
          return null;
        }
        if (sc.mediaSource === 'user_photo' && sc.userMediaKey) {
          const blob = await loadUserMediaBlob(script.id, sc.userMediaKey);
          const photoKey = buildUserPhotoArtCacheKey(script.id, sc.userMediaKey);
          if (blob) {
            localDepthEngine.enqueueSceneDepth(photoKey, script.id, blob, idx === beatIndex);
            return blob;
          }
          // Respaldo a miniatura en memoria si el archivo OPFS aún se está sincronizando
          if (asset?.imageDataUrl && !isLegacyFlatSvgDataUrl(asset.imageDataUrl)) {
            return dataUrlToCompressedWebpBlob(asset.imageDataUrl);
          }
          return null;
        }
        if (asset?.imageDataUrl && !isLegacyFlatSvgDataUrl(asset.imageDataUrl)) {
          const blob = await dataUrlToCompressedWebpBlob(asset.imageDataUrl);
          const customKey = getSceneArtKey(idx);
          if (blob && customKey) {
            localDepthEngine.enqueueSceneDepth(customKey, script.id, blob, idx === beatIndex);
          }
          return blob;
        }
        return getCachedSceneArtBlobWithFallback(sc, script, aspectRatio, asset?.imageSeed)?.blob ?? null;
      },
    }),
    [script, aspectRatio, sceneMedia, getSceneArtKey, beatIndex]
  );

  // Resolver deslizante N = 3 para los mapas de profundidad TrueDepth IA ya listos en memoria/OPFS
  const depthWindowResolver = useMemo<SlidingWindowResolver>(
    () => ({
      getSignature: (idx: number) => {
        if (renderQuality !== 'cine_3d') return null;
        const artKey = getSceneArtKey(idx);
        if (!artKey) return null;
        const depthBlob = localDepthEngine.getCachedDepthBlob(artKey);
        if (!depthBlob) return null;
        return `depth::${artKey}::${depthBlob.size}`;
      },
      resolveBlob: (idx: number) => {
        if (renderQuality !== 'cine_3d') return null;
        const artKey = getSceneArtKey(idx);
        if (!artKey) return null;
        return localDepthEngine.loadPersistedDepthBlob(artKey);
      },
    }),
    [renderQuality, getSceneArtKey]
  );

  // Sincronizar ventanas deslizantes estrictas [beatIndex - 1, beatIndex, beatIndex + 1] (N = 3)
  useEffect(() => {
    const cache = bitmapCacheRef.current;
    if (cache) {
      cache.syncWindow(beatIndex, script.escenas.length, windowResolver);
    }
    const depthCache = depthBitmapCacheRef.current;
    if (depthCache) {
      depthCache.syncWindow(beatIndex, script.escenas.length, depthWindowResolver);
    }
  }, [beatIndex, script.escenas.length, windowResolver, depthWindowResolver, queueRevision, depthVersion]);

  const resolveVideoWindowSource = useCallback(
    (idx: number): SlidingWindowVideoSource | null => {
      const sc = script.escenas[idx];
      if (!sc) return null;
      const asset = sceneMedia[sc.id];
      if (sc.mediaSource === 'user_video' && sc.userMediaKey) {
        const key = sc.userMediaKey;
        return {
          signature: `opfs-video::${script.id}::${sc.id}::${key}`,
          directUrl: asset?.videoClipUrl,
          loadBlob: () => loadUserMediaBlob(script.id, key),
        };
      }
      if (asset?.videoClipUrl) {
        return {
          signature: `clip-video::${sc.id}::${asset.videoClipUrl}`,
          directUrl: asset.videoClipUrl,
        };
      }
      return null;
    },
    [script, sceneMedia]
  );

  // Sincronizar pool deslizante N = 3 de clips de video reales (OPFS + ObjectURL) con revocación inmediata
  useEffect(() => {
    const pool = videoPoolRef.current;
    if (!pool) return;
    let cancelled = false;
    void pool
      .ensureWindowForBeat(beatIndex, script.escenas.length, resolveVideoWindowSource)
      .then((vid) => {
        if (!cancelled && vid) {
          setVideoReadyTick((v) => v + 1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [beatIndex, script.escenas.length, resolveVideoWindowSource]);

  // Sincronizar reproducción / pausa / scrubbing exacto del clip de video activo en el pool deslizante
  useEffect(() => {
    const vid = videoPoolRef.current?.getVideoSync(beatIndex) ?? null;
    if (!vid) return;
    vid.muted = true;
    if (isPlaying) {
      void vid.play().catch(() => {});
    } else {
      vid.pause();
      if (vid.readyState >= 1) {
        const naturalDur =
          Number.isFinite(vid.duration) && vid.duration > 0.15 ? vid.duration : 0;
        const target =
          naturalDur > 0 ? Math.max(0, localElapsed) % naturalDur : Math.max(0, localElapsed);
        if (Math.abs(vid.currentTime - target) > 0.04) {
          try {
            vid.currentTime = target;
          } catch {
            // Silencioso
          }
        }
      }
    }
  }, [isPlaying, localElapsed, beatIndex, videoReadyTick]);

  const timedTokens = useMemo(
    () => (scene ? buildTimedWordTokens(scene, sceneDuration, { prePauseSec }) : []),
    [scene, sceneDuration, prePauseSec]
  );

  const hasFallbackReadyArt = Boolean(
    scene && getCachedSceneArtBlobWithFallback(scene, script, aspectRatio, media?.imageSeed)
  );
  const isWaitingAi =
    !isUserVideoBeat &&
    !hasUserPhotoBeat &&
    !customPhotoUrl &&
    !isUserMedia &&
    !hasFallbackReadyArt &&
    queueState.status !== 'ready';

  // Render determinista puro en función de `(beatIndex, localElapsed, sceneDuration, globalTimeSec)`
  const drawDeterministicFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const targetW = aspectRatio === '16:9' ? 640 : 405;
    const targetH = aspectRatio === '16:9' ? 360 : 720;
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const safeDur = Math.max(0.6, sceneDuration);
    const clampedElapsed = Math.max(0, Math.min(safeDur, localElapsed));
    const normalizedT = clampedElapsed / safeDur;

    const { wordPulse: baseWordPulse, isKeyword } = computeDeterministicWordPulse(
      timedTokens,
      clampedElapsed
    );
    const isViralMode =
      script.publicoObjetivo === 'viral_meme' || script.estilo3D === 'viral_meme_3d';
    const wordPulse =
      isKeyword || isViralMode || Boolean(scene?.esGiro30s)
        ? Math.min(1, baseWordPulse * 1.2)
        : baseWordPulse;

    const isCommercial = script.studioMode === 'commercial_real_estate';
    const projectSeed = hashSeed32(script.id || 'gortex-default');
    const vid = videoPoolRef.current?.getVideoSync(beatIndex) ?? null;

    if (vid && vid.readyState >= 2) {
      ctx.fillStyle = '#07090D';
      ctx.fillRect(0, 0, targetW, targetH);

      // Encuadre 100% íntegro (scale 1.0) en clips reales del usuario sin micro-crop artificial
      const cameraSeed = deriveBeatSeed(projectSeed, beatIndex, PRNG_CHANNEL.CAMERA);
      const scale = isCommercial ? 1.0 : 1.02 + Math.sin(normalizedT * Math.PI) * 0.014;
      const driftX = isCommercial ? 0 : deterministicFbm1D(cameraSeed, normalizedT * 2.4 + 0.5) * 2.2;
      const driftY = isCommercial ? 0 : deterministicFbm1D(cameraSeed + 59, normalizedT * 2.1 + 3.7) * 1.8;
      drawCoverVideo(ctx, vid, targetW, targetH, scale, driftX, driftY);

      const clipMood = getSceneMoodColors(scene);
      applyStudioPostProcessing(ctx, targetW, targetH, {
        moodGlow: clipMood.glow,
        accentColor: accentColor || '#F97316',
        normalizedT,
        sceneDuration: safeDur,
        projectSeed,
        beatIndex,
        wordPulse,
        tensionBoost: !isCommercial && scene?.esGiro30s ? 0.6 : 0,
        isCommercial,
      });
      if (isCommercial) {
        drawCommercialSpecsHud(ctx, targetW, targetH, scene, script, clampedElapsed, safeDur);
        drawCommercialCtaOverlay(ctx, targetW, targetH, scene, script, clampedElapsed, safeDur);
      } else {
        drawSceneHudMetricCard(
          ctx,
          targetW,
          targetH,
          scene,
          clampedElapsed,
          safeDur,
          wordPulse
        );
      }
      return;
    }

    const colorCache = bitmapCacheRef.current;
    const depthCache = depthBitmapCacheRef.current;
    const currentBitmap = colorCache ? colorCache.getBitmap(beatIndex) : null;
    const previousBitmap = colorCache && beatIndex > 0 ? colorCache.getBitmap(beatIndex - 1) : null;
    const currentDepthBitmap = depthCache ? depthCache.getBitmap(beatIndex) : null;
    const previousDepthBitmap =
      depthCache && beatIndex > 0 ? depthCache.getBitmap(beatIndex - 1) : null;

    const currentArtKey = getSceneArtKey(beatIndex) || `beat-${beatIndex}`;
    const prevArtKey = beatIndex > 0 ? getSceneArtKey(beatIndex - 1) || `beat-${beatIndex - 1}` : '';
    const previousScene = beatIndex > 0 ? script.escenas[beatIndex - 1] : undefined;

    const { voiceRms, impactTransient } = sampleDeterministicPreviewTelemetry({
      scene,
      beatIndex,
      sceneDuration: safeDur,
      localElapsed: clampedElapsed,
      prePauseSec,
      beatRate,
      wordPulse,
      voiceRmsTrack,
      fps: 30,
    });

    const frameIndex = Math.max(0, Math.floor((globalTimeSec || clampedElapsed) * 30));

    renderUnifiedCinematicFrame({
      targetCtx: ctx,
      webglRenderer: webglRendererRef.current,
      renderQuality,
      width: targetW,
      height: targetH,
      currentSlot: {
        key: currentArtKey,
        colorSource: currentBitmap,
        depthSource: currentDepthBitmap,
      },
      previousSlot: previousBitmap
        ? {
            key: prevArtKey,
            colorSource: previousBitmap,
            depthSource: previousDepthBitmap,
          }
        : null,
      scene,
      previousScene,
      script,
      beatIndex,
      frameIndex,
      localElapsed: clampedElapsed,
      sceneDuration: safeDur,
      wordPulse,
      voiceRms,
      impactTransient,
      accentColor: accentColor || '#F97316',
      isLoading: isWaitingAi,
      showHudMetric: true,
    });
  }, [
    aspectRatio,
    sceneDuration,
    localElapsed,
    timedTokens,
    script,
    scene,
    beatIndex,
    accentColor,
    isWaitingAi,
    bitmapVersion,
    depthVersion,
    videoReadyTick,
    renderQuality,
    globalTimeSec,
    prePauseSec,
    beatRate,
    voiceRmsTrack,
    getSceneArtKey,
  ]);

  // Dibujar inmediatamente en cada cambio de `t`, beat, modo WebGL2 o bitmap decodificado (congelación exacta al pausar/scrubbing)
  useEffect(() => {
    drawDeterministicFrame();
  }, [drawDeterministicFrame]);

  // Solo mantener un RAF secundario mientras se reproduce activamente un clip <video> subido
  useEffect(() => {
    if (!isPlaying || !isUserVideoBeat) return;
    let rafId = 0;
    const tick = () => {
      drawDeterministicFrame();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isUserVideoBeat, drawDeterministicFrame]);

  const showQueueBadge =
    !isUserVideoBeat &&
    !hasUserPhotoBeat &&
    !customPhotoUrl &&
    !isUserMedia &&
    !hasFallbackReadyArt &&
    Boolean(scene) &&
    queueState.status !== 'ready';

  const queueBadgeLabel =
    queueState.status === 'generating'
      ? `Generando arte AI... (~${Math.max(5, queueState.waitRemainingSec)}s)`
      : `En cola (turno ${queueState.queuePosition} de ${queueState.queueTotal}) · ~${queueState.waitRemainingSec}s`;

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        aria-label={
          scene ? `Escena ${scene.orden}: ${scene.subtituloDinamico}` : 'Lienzo de vista previa AI'
        }
        className="w-full h-full block object-cover"
      />
      {showQueueBadge && (
        <div className="pointer-events-none absolute top-11 inset-x-0 flex justify-center px-3">
          <span className="px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 text-[10px] font-medium text-white/85">
            {queueBadgeLabel}
          </span>
        </div>
      )}
    </div>
  );
}
