import type {
  RenderQualityMode,
  ScriptScene,
  ViralScript,
} from '../types';
import {
  drawCommercialCtaOverlay,
  drawCommercialSpecsHud,
} from './commercialCanvasOverlay';
import { sampleProceduralFoleyImpactAt } from './proceduralFoleyEngine';
import {
  drawCinematicImageMotionFrame,
  drawSceneHudMetricCard,
} from './sceneImageUrl';
import { SmartReframeAnalyzer } from './smartReframeAnalyzer';
import {
  WebGLSceneRenderer,
  type WebGLBeatVisualSlot,
} from './webglSceneRenderer';

export const RENDER_QUALITY_STORAGE_KEY = 'gortex_render_quality_mode_v1';
export const BEAT_TRANSITION_DURATION_SEC = 0.35;

export function loadRenderQualityMode(): RenderQualityMode {
  try {
    const raw = localStorage.getItem(RENDER_QUALITY_STORAGE_KEY);
    if (raw === 'classic_2d') return 'classic_2d';
    if (raw === 'cine_3d') return 'cine_3d';
  } catch {
    // Silencioso
  }
  return WebGLSceneRenderer.isWebGL2Supported() ? 'cine_3d' : 'classic_2d';
}

export function saveRenderQualityMode(mode: RenderQualityMode): void {
  try {
    localStorage.setItem(RENDER_QUALITY_STORAGE_KEY, mode);
  } catch {
    // Silencioso
  }
}

/**
 * Calcula una envolvente determinista normalizada [0..1] a 30fps a partir de un AudioBuffer
 * para que la vista previa tenga exactamente la misma respuesta lumínica reactiva a la voz
 * que `AudioTelemetryTrack.voiceRms` en la exportación MP4.
 */
export function computeSceneVoiceRmsTrack(
  buffer: AudioBuffer,
  fps = 30
): Float32Array {
  const totalFrames = Math.max(1, Math.ceil(buffer.duration * fps));
  const out = new Float32Array(totalFrames);
  const sampleRate = buffer.sampleRate;
  const samplesPerFrame = sampleRate / fps;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const len = buffer.length;

  let peak = 0.025;
  for (let f = 0; f < totalFrames; f++) {
    const s0 = Math.floor(f * samplesPerFrame);
    const s1 = Math.min(len, Math.floor((f + 1) * samplesPerFrame));
    if (s0 >= len || s1 <= s0) {
      out[f] = 0;
      continue;
    }
    let sumSq = 0;
    for (let s = s0; s < s1; s++) {
      const v = 0.5 * (ch0[s] + ch1[s]);
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / (s1 - s0));
    out[f] = rms;
    if (rms > peak) peak = rms;
  }

  for (let f = 0; f < totalFrames; f++) {
    out[f] = Math.max(0, Math.min(1, out[f] / peak));
  }
  return out;
}

/**
 * Estima de forma 100% determinista `(voiceRms, impactTransient)` en vista previa
 * combinando el track RMS real de la escena (si existe), `wordPulse` y el `foleyCue` del beat.
 */
export function sampleDeterministicPreviewTelemetry(options: {
  scene?: ScriptScene;
  beatIndex?: number;
  sceneDuration?: number;
  localElapsed: number;
  prePauseSec: number;
  beatRate: number;
  wordPulse: number;
  voiceRmsTrack?: Float32Array | null;
  fps?: number;
}): { voiceRms: number; impactTransient: number } {
  const {
    scene,
    beatIndex = 0,
    sceneDuration = 3.5,
    localElapsed,
    prePauseSec,
    beatRate,
    wordPulse,
    voiceRmsTrack,
    fps = 30,
  } = options;

  let voiceRms = 0;
  const voiceLocalSec = localElapsed - prePauseSec;
  if (voiceRmsTrack && voiceRmsTrack.length > 0 && voiceLocalSec >= 0) {
    const sourceFrame = Math.floor(voiceLocalSec * beatRate * fps);
    if (sourceFrame >= 0 && sourceFrame < voiceRmsTrack.length) {
      voiceRms = voiceRmsTrack[sourceFrame];
    }
  } else if (voiceLocalSec >= 0) {
    // Envolvente determinista suave si el audio aún se está preparando
    voiceRms = Math.min(1, 0.22 + wordPulse * 0.62);
  }

  // Impulso determinista exacto del Audio Director Procedural (Módulo 4)
  const foleyImpact = sampleProceduralFoleyImpactAt(
    scene,
    beatIndex,
    localElapsed,
    sceneDuration,
    prePauseSec
  );

  const impactTransient = Math.max(
    0,
    Math.min(1, Math.max(foleyImpact, wordPulse * (scene?.esGiro30s ? 0.92 : 0.68)))
  );

  return { voiceRms, impactTransient };
}

export interface UnifiedCompositeFrameOptions {
  targetCtx: CanvasRenderingContext2D;
  webglRenderer: WebGLSceneRenderer | null;
  renderQuality: RenderQualityMode;
  width: number;
  height: number;
  currentSlot: WebGLBeatVisualSlot;
  previousSlot?: WebGLBeatVisualSlot | null;
  scene?: ScriptScene;
  previousScene?: ScriptScene;
  script?: ViralScript;
  beatIndex: number;
  frameIndex: number;
  localElapsed: number;
  sceneDuration: number;
  wordPulse: number;
  voiceRms: number;
  impactTransient: number;
  accentColor: string;
  isLoading?: boolean;
  showHudMetric?: boolean;
}

/**
 * Compositor Unificado Multicapa (compartido entre Preview y Exportación MP4):
 * 1) Si `renderQuality === 'cine_3d'` y WebGL2 está activo + imagen lista:
 *    - Renderiza la escena 3D en `WebGLSceneRenderer` (paralaje POM, DoF, iluminación Sobel
 *      reactiva al audio, partículas con Z-Testing, título cinético detrás del sujeto,
 *      transiciones físicas de 0.35s, color grading, bloom, aberración cromática y grano 35mm).
 *    - Transfiere el resultado al canvas 2D objetivo (`drawImage`).
 * 2) Si `renderQuality === 'classic_2d'` o WebGL2 no está disponible / aún carga la imagen:
 *    - Cae automáticamente al motor Canvas 2D existente (`drawCinematicImageMotionFrame`) sin errores.
 * 3) Dibuja encima (en capa 2D nítida, nunca afectada por blur ni aberración cromática)
 *    las tarjetas HUD animadas (y en exportación, el llamador dibuja los subtítulos Spring Karaoke encima).
 */
export function renderUnifiedCinematicFrame(
  opts: UnifiedCompositeFrameOptions
): 'webgl2' | 'canvas2d' {
  const {
    targetCtx,
    webglRenderer,
    renderQuality,
    width,
    height,
    currentSlot,
    previousSlot = null,
    scene,
    previousScene,
    script,
    beatIndex,
    frameIndex,
    localElapsed,
    sceneDuration,
    wordPulse,
    voiceRms,
    impactTransient,
    accentColor,
    isLoading = false,
    showHudMetric = true,
  } = opts;

  const isCommercial = script?.studioMode === 'commercial_real_estate';
  const aiMicroCropA = !scene?.mediaSource || scene.mediaSource === 'ai_generated' ? 1.05 : 1.0;
  const aiMicroCropB = previousScene
    ? !previousScene.mediaSource || previousScene.mediaSource === 'ai_generated'
      ? 1.05
      : 1.0
    : aiMicroCropA;

  const safeDur = Math.max(0.6, sceneDuration);
  const clampedElapsed = Math.max(0, Math.min(safeDur, localElapsed));

  // Transición física de 0.35s al iniciar cada beat (cuando existe imagen del beat anterior)
  const hasPrev = Boolean(
    previousSlot?.colorSource &&
      previousSlot.colorSource !== currentSlot.colorSource &&
      clampedElapsed >= 0 &&
      clampedElapsed < BEAT_TRANSITION_DURATION_SEC
  );
  const transitionProgress = hasPrev
    ? Math.max(0, Math.min(1, clampedElapsed / BEAT_TRANSITION_DURATION_SEC))
    : 1;

  // Smart Reframe (Módulo 4): calcular centroide focal desde mapa de profundidad + contraste
  const focalPointA = SmartReframeAnalyzer.analyze(
    currentSlot.key || `beat-${beatIndex}`,
    currentSlot.colorSource,
    currentSlot.depthSource,
    Boolean(currentSlot.depthSource)
  );
  const focalPointB =
    hasPrev && previousSlot?.colorSource
      ? SmartReframeAnalyzer.analyze(
          previousSlot.key || `beat-${Math.max(0, beatIndex - 1)}`,
          previousSlot.colorSource,
          previousSlot.depthSource,
          Boolean(previousSlot.depthSource)
        )
      : focalPointA;

  if (
    renderQuality === 'cine_3d' &&
    webglRenderer &&
    webglRenderer.isAvailable() &&
    currentSlot.colorSource
  ) {
    const rendered = webglRenderer.renderFrame({
      width,
      height,
      currentSlot,
      transitionSlot: hasPrev ? previousSlot : null,
      transitionProgress,
      scene,
      script,
      beatIndex,
      frameIndex,
      localElapsed: clampedElapsed,
      sceneDuration: safeDur,
      voiceRms,
      impactTransient,
      accentColor,
      focalPointA,
      focalPointB,
      isCommercial,
      aiMicroCropA,
      aiMicroCropB,
    });

    if (rendered) {
      targetCtx.drawImage(
        webglRenderer.getSurface() as CanvasImageSource,
        0,
        0,
        width,
        height
      );

      // Capa superior nítida: Fichas/CTA editoriales en Comercial, o Tarjeta HUD animada en Viral
      if (showHudMetric) {
        if (isCommercial) {
          drawCommercialSpecsHud(
            targetCtx,
            width,
            height,
            scene,
            script,
            clampedElapsed,
            safeDur
          );
          drawCommercialCtaOverlay(
            targetCtx,
            width,
            height,
            scene,
            script,
            clampedElapsed,
            safeDur
          );
        } else {
          drawSceneHudMetricCard(
            targetCtx,
            width,
            height,
            scene,
            clampedElapsed,
            safeDur,
            wordPulse
          );
        }
      }
      return 'webgl2';
    }
  }

  // Fallback automático e invisible a Canvas 2D clásico (también guiado por Smart Reframe)
  const colorBitmap =
    typeof ImageBitmap !== 'undefined' && currentSlot.colorSource instanceof ImageBitmap
      ? currentSlot.colorSource
      : null;
  const prevBitmap =
    typeof ImageBitmap !== 'undefined' && previousSlot?.colorSource instanceof ImageBitmap
      ? previousSlot.colorSource
      : null;

  drawCinematicImageMotionFrame(targetCtx, {
    width,
    height,
    image: colorBitmap,
    previousImage: prevBitmap,
    crossDissolveDurationSec: 0.12,
    imageOpacity: 1,
    scene,
    previousScene,
    script,
    beatIndex,
    localElapsed: clampedElapsed,
    sceneDuration: safeDur,
    wordPulse,
    accentColor,
    isLoading,
    showHudMetric,
    focalPoint: focalPointA,
    previousFocalPoint: focalPointB,
  });

  return 'canvas2d';
}
