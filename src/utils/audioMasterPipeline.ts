import type { BackgroundMusicId, ScriptScene } from '../types';
import { hashSeed32 } from './deterministicPrng';
import {
  DEFAULT_SFX_VOLUME_DB,
  ProceduralFoleyEngine,
  sfxVolumeDbToGain,
} from './proceduralFoleyEngine';
import { getEffectivePacingProfile } from './retentionEngine';
import { buildRoyaltyFreeMusicBuffer, scheduleKeywordSfx } from './soundtrackEngine';
import { STUDIO_SAMPLE_RATE } from './studioAudioMixer';
import {
  buildTimedWordTokens,
  estimateSpeechDurationSec,
  type TimedWordToken,
} from './visualKeywords';
import { stretchAudioBufferPitchPreserving } from './wsolaTimeStretch';

/**
 * Contrato de Telemetría de Audio para módulos futuros (audio-reactividad, cámara reactiva,
 * beat sync y visualización de energía por fotograma).
 */
export interface AudioTelemetryTrack {
  fps: number;                    // ej. 30
  totalDurationSec: number;
  voiceRms: Float32Array;         // energía normalizada [0..1] por frame de la pista de voz
  impactTransients: Float32Array; // picos normalizados [0..1] por frame de foley/bajos
  masterBuffer: AudioBuffer;      // mezcla final estéreo 48kHz
}

export interface AudioPipelineClipInput {
  scene: ScriptScene;
  audioBuffer: AudioBuffer | null;
  /** Sobrescritura opcional de velocidad por beat (si se omite usa `globalPlaybackRate`). */
  beatPlaybackRate?: number;
}

export interface ResolvedAudioPipelineClip {
  scene: ScriptScene;
  stretchedVoiceBuffer: AudioBuffer | null;
  appliedPlaybackRate: number;
  prePauseSec: number;
  musicDuckLevel: number;
  startSec: number;
  durationSec: number;
  timedTokens: TimedWordToken[];
}

export interface AudioMasterPipelineResult {
  telemetry: AudioTelemetryTrack;
  resolvedClips: ResolvedAudioPipelineClip[];
  totalDurationSec: number;
}

/**
 * Construye la curva continua de auto-ducking para `AudioParam.setValueCurveAtTime`:
 * - 12% (0.12 escalado) durante las ventanas de voz hablada.
 * - 28% (0.28 escalado) en pausas entre frases o micro-escenas.
 * - Ataque suave (~55ms) y liberación orgánica (~180ms) sin clicks ni bombeo brusco.
 */
export function buildAutoDuckingCurve(options: {
  totalDurationSec: number;
  baseVolume: number;
  speechWindows: Array<{ startSec: number; endSec: number; duckLevel?: number }>;
  controlRateHz?: number;
}): Float32Array {
  const { totalDurationSec, baseVolume, speechWindows, controlRateHz = 50 } = options;
  const safeDur = Math.max(0.2, totalDurationSec);
  const numPoints = Math.max(4, Math.ceil(safeDur * controlRateHz) + 1);
  const curve = new Float32Array(numPoints);

  const scaleFactor = Math.max(0.15, Math.min(1.6, baseVolume / 0.28));
  const pauseVol = Math.min(0.45, 0.28 * scaleFactor);
  const voiceDuckVol = Math.min(0.2, 0.12 * scaleFactor);

  // Marcar qué muestras de control caen dentro de una ventana de voz (con 45ms de lookahead)
  const sorted = [...speechWindows]
    .filter((w) => w.endSec > w.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  const dt = safeDur / (numPoints - 1);
  const attackAlpha = 1 - Math.exp(-dt / 0.055);
  const releaseAlpha = 1 - Math.exp(-dt / 0.18);

  let currentGain = pauseVol;
  let winCursor = 0;

  for (let i = 0; i < numPoints; i++) {
    const t = i * dt;
    while (winCursor < sorted.length && sorted[winCursor].endSec + 0.03 < t) {
      winCursor += 1;
    }
    const win = sorted[winCursor];
    const inSpeech = Boolean(win && t >= win.startSec - 0.05 && t <= win.endSec + 0.03);
    const beatDuckTarget =
      typeof win?.duckLevel === 'number'
        ? Math.min(0.24, Math.max(0.025, win.duckLevel * scaleFactor))
        : voiceDuckVol;
    const target = inSpeech ? beatDuckTarget : pauseVol;
    const alpha = target < currentGain ? attackAlpha : releaseAlpha;
    currentGain += (target - currentGain) * alpha;
    curve[i] = Math.max(0.0001, currentGain);
  }

  return curve;
}

/**
 * Calcula un track normalizado [0..1] por frame (RMS o pico transiente) desde un AudioBuffer
 * con precisión exacta de muestra (`samplesPerFrame = sampleRate / fps`).
 */
function computePerFrameEnergy(
  buffer: AudioBuffer,
  totalFrames: number,
  fps: number,
  mode: 'rms' | 'transient'
): Float32Array {
  const out = new Float32Array(totalFrames);
  const sampleRate = buffer.sampleRate;
  const samplesPerFrame = sampleRate / fps;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const bufLen = buffer.length;

  let peakVal = 1e-6;
  let prevEnergy = 0;

  for (let f = 0; f < totalFrames; f++) {
    const startSample = Math.floor(f * samplesPerFrame);
    const endSample = Math.min(bufLen, Math.floor((f + 1) * samplesPerFrame));
    if (startSample >= bufLen || endSample <= startSample) {
      out[f] = 0;
      continue;
    }

    let sumSq = 0;
    let maxAbs = 0;
    const count = endSample - startSample;

    for (let s = startSample; s < endSample; s++) {
      const v = 0.5 * (ch0[s] + ch1[s]);
      const av = Math.abs(v);
      sumSq += v * v;
      if (av > maxAbs) maxAbs = av;
    }

    const rms = Math.sqrt(sumSq / count);
    if (mode === 'rms') {
      out[f] = rms;
      if (rms > peakVal) peakVal = rms;
    } else {
      // Combinar pico de amplitud + derivada positiva de energía para detectar impactos/transientes
      const flux = Math.max(0, rms - prevEnergy);
      const transient = maxAbs * 0.65 + flux * 1.35;
      prevEnergy = rms * 0.7 + prevEnergy * 0.3;
      out[f] = transient;
      if (transient > peakVal) peakVal = transient;
    }
  }

  // Normalizar al rango exacto [0..1] (evitando amplificar silencio absoluto)
  const normDivisor = Math.max(0.025, peakVal);
  for (let f = 0; f < totalFrames; f++) {
    out[f] = Math.max(0, Math.min(1, out[f] / normDivisor));
  }

  return out;
}

/**
 * AudioMasterPipeline:
 * Motor offline 100% determinista a 48000 Hz Estéreo con:
 * 1) Preservación de pitch/formantes vía WSOLA (global + velocidad por beat).
 * 2) Recálculo dinámico de la línea de tiempo y timestamps palabra por palabra a precisión de muestra.
 * 3) Auto-ducking preciso mediante `AudioParam.setValueCurveAtTime` (12% voz / 28% pausas).
 * 4) Masterización mediante `DynamicsCompressorNode` (-1.0 dBFS).
 * 5) Generación del contrato `AudioTelemetryTrack` (`voiceRms`, `impactTransients`, `masterBuffer`).
 */
export class AudioMasterPipeline {
  public static async renderMaster(options: {
    clips: AudioPipelineClipInput[];
    globalPlaybackRate?: number;
    backgroundMusicId: BackgroundMusicId;
    musicVolume: number;
    enableTransitionSfx: boolean;
    sfxVolumeDb?: number;
    projectSeed?: number;
    fps?: number;
    signal?: AbortSignal;
    onProgress?: (percent: number, label: string) => void;
  }): Promise<AudioMasterPipelineResult> {
    const {
      clips,
      globalPlaybackRate = 1,
      backgroundMusicId,
      musicVolume,
      enableTransitionSfx,
      sfxVolumeDb = DEFAULT_SFX_VOLUME_DB,
      projectSeed = hashSeed32(clips[0]?.scene?.id || 'gortex-master'),
      fps = 30,
      signal,
      onProgress,
    } = options;

    const safeGlobalRate = Math.max(0.75, Math.min(1.5, Number(globalPlaybackRate) || 1));
    const sampleRate = STUDIO_SAMPLE_RATE;

    // 1) Aplicar WSOLA preservando pitch sobre cada pista de voz y recalcular la línea de tiempo exacta
    const resolvedClips: ResolvedAudioPipelineClip[] = [];
    let cursorSamples = 0;

    for (let i = 0; i < clips.length; i++) {
      if (signal?.aborted) {
        throw new Error('Renderizado cancelado.');
      }
      const item = clips[i];
      const pacing = getEffectivePacingProfile(item.scene);
      const baseRate = Number(item.beatPlaybackRate ?? safeGlobalRate) || safeGlobalRate;
      const beatRate = Math.max(0.75, Math.min(1.5, Number((baseRate * pacing.speedMultiplier).toFixed(3))));
      const prePauseSec = Math.max(0, Math.min(0.45, pacing.prePauseMs / 1000));

      let stretchedVoice: AudioBuffer | null = null;
      if (item.audioBuffer) {
        if (Math.abs(beatRate - 1.0) >= 0.008) {
          onProgress?.(
            Math.min(10, 4 + Math.round(((i + 1) / Math.max(1, clips.length)) * 6)),
            `Ajustando ritmo ${beatRate.toFixed(2)}x con preservación de tono WSOLA (${i + 1}/${clips.length})...`
          );
        }
        stretchedVoice = await stretchAudioBufferPitchPreserving(item.audioBuffer, beatRate);
      }

      // Duración exacta a precisión de muestra (incluyendo pausa dramática prePauseMs + respiración escalada)
      const padSec = 0.08 / beatRate;
      const minBeatSec = 1.4 / beatRate;
      const voiceDurSec = stretchedVoice
        ? Math.max(stretchedVoice.duration + padSec, minBeatSec)
        : estimateSpeechDurationSec(item.scene.narracion, 1) / beatRate;
      const exactDurSec = prePauseSec + voiceDurSec;

      const durSamples = Math.max(1, Math.round(exactDurSec * sampleRate));
      const startSec = cursorSamples / sampleRate;
      const quantizedDurSec = durSamples / sampleRate;
      cursorSamples += durSamples;

      // Recalcular timestamps palabra por palabra respetando el silencio inicial prePauseSec
      const timedTokens = buildTimedWordTokens(item.scene, quantizedDurSec, { prePauseSec });

      resolvedClips.push({
        scene: item.scene,
        stretchedVoiceBuffer: stretchedVoice,
        appliedPlaybackRate: beatRate,
        prePauseSec,
        musicDuckLevel: pacing.musicDuckLevel,
        startSec,
        durationSec: quantizedDurSec,
        timedTokens,
      });
    }

    const totalDurationSec = Math.max(1, cursorSamples / sampleRate);
    const totalSamples = Math.max(sampleRate, Math.ceil((totalDurationSec + 0.08) * sampleRate));
    const totalFrames = Math.max(1, Math.ceil(totalDurationSec * fps));

    if (signal?.aborted) {
      throw new Error('Renderizado cancelado.');
    }

    onProgress?.(12, 'Mezclando audio 48 kHz Estéreo (Audio Director Procedural + ducking)...');

    // 2) Crear contextos offline paralelos: Mezcla Maestra Estéreo + Stems ligeros para Telemetría real
    const masterCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
    const sfxTelemetryCtx = new OfflineAudioContext(1, totalSamples, sampleRate);

    const voiceBus = masterCtx.createGain();
    voiceBus.gain.value = 1.05;

    const sfxBus = masterCtx.createGain();
    sfxBus.gain.value = sfxVolumeDbToGain(sfxVolumeDb);

    const musicBus = masterCtx.createGain();
    musicBus.gain.value = 1.0;

    // Limitador suave de estudio a -1.0 dBFS
    const masterLimiter = masterCtx.createDynamicsCompressor();
    masterLimiter.threshold.value = -1.0;
    masterLimiter.knee.value = 6.0;
    masterLimiter.ratio.value = 12.0;
    masterLimiter.attack.value = 0.003;
    masterLimiter.release.value = 0.12;

    const masterGain = masterCtx.createGain();
    masterGain.gain.value = 0.96;

    voiceBus.connect(masterLimiter);
    sfxBus.connect(masterLimiter);
    musicBus.connect(masterLimiter);
    masterLimiter.connect(masterGain);
    masterGain.connect(masterCtx.destination);

    // Stem de voz en memoria para calcular `voiceRms` con precisión de muestra sin un 3er OfflineAudioContext
    const voiceStemBuffer = masterCtx.createBuffer(1, totalSamples, sampleRate);
    const voiceStemData = voiceStemBuffer.getChannelData(0);

    const speechWindows: Array<{ startSec: number; endSec: number; duckLevel?: number }> = [];

    for (let i = 0; i < resolvedClips.length; i++) {
      const clip = resolvedClips[i];
      const nextClip = resolvedClips[i + 1];
      const voiceStartSec = clip.startSec + clip.prePauseSec;

      if (clip.stretchedVoiceBuffer) {
        // Reproducir a playbackRate = 1.0 porque WSOLA ya aplicó el time-stretch preservando el pitch
        const src = masterCtx.createBufferSource();
        src.buffer = clip.stretchedVoiceBuffer;
        src.playbackRate.value = 1.0;
        src.connect(voiceBus);
        src.start(voiceStartSec);

        speechWindows.push({
          startSec: voiceStartSec,
          endSec: voiceStartSec + clip.stretchedVoiceBuffer.duration,
          duckLevel: clip.musicDuckLevel,
        });

        // Acumular en voiceStemData en el instante exacto post-prePauseSec para cálculo de voiceRms
        const startIdx = Math.round(voiceStartSec * sampleRate);
        const vCh0 = clip.stretchedVoiceBuffer.getChannelData(0);
        const vCh1 =
          clip.stretchedVoiceBuffer.numberOfChannels > 1
            ? clip.stretchedVoiceBuffer.getChannelData(1)
            : vCh0;
        const copyLen = Math.min(vCh0.length, Math.max(0, totalSamples - startIdx));
        for (let s = 0; s < copyLen; s++) {
          voiceStemData[startIdx + s] += 0.5 * (vCh0[s] + vCh1[s]);
        }
      }

      if (enableTransitionSfx) {
        const beatSpec = {
          scene: clip.scene,
          beatIndex: i,
          startSec: clip.startSec,
          durationSec: clip.durationSec,
          prePauseSec: clip.prePauseSec,
          nextBeatStartSec: nextClip ? nextClip.startSec : clip.startSec + clip.durationSec,
        };

        const scheduleOnBus = (ctx: BaseAudioContext, dest: AudioNode) => {
          ProceduralFoleyEngine.scheduleBeatFoley({
            ctx,
            destination: dest,
            projectSeed,
            beat: beatSpec,
            intensity: 1.0,
          });

          if (clip.timedTokens.length > 0) {
            let lastKwSec = -10;
            for (let tIdx = 0; tIdx < clip.timedTokens.length; tIdx++) {
              const tok = clip.timedTokens[tIdx];
              const prevTok = tIdx > 0 ? clip.timedTokens[tIdx - 1] : null;
              if (
                tok.isKeyword &&
                tok.sfxType &&
                (!prevTok?.isKeyword || tok.startSec - lastKwSec >= 0.85) &&
                tok.startSec - lastKwSec >= 0.65
              ) {
                lastKwSec = tok.startSec;
                scheduleKeywordSfx({
                  audioCtx: ctx,
                  destination: dest,
                  atTime: clip.startSec + tok.startSec,
                  type: tok.sfxType,
                });
              }
            }
          }
        };

        scheduleOnBus(masterCtx, sfxBus);
        scheduleOnBus(sfxTelemetryCtx, sfxTelemetryCtx.destination);
      }
    }

    // 3) Música ambiental procedural + Vocal Pocket EQ + Auto-Ducking preciso vía setValueCurveAtTime
    const effectiveMusicId =
      backgroundMusicId !== 'none'
        ? backgroundMusicId
        : speechWindows.length === 0
          ? 'misterio_espacial'
          : 'none';
    const effectiveMusicVol = backgroundMusicId !== 'none' ? musicVolume : 0.16;

    if (effectiveMusicId !== 'none' && effectiveMusicVol > 0.005) {
      const musicBuffer = buildRoyaltyFreeMusicBuffer(
        masterCtx,
        effectiveMusicId,
        totalDurationSec + 0.5
      );
      if (musicBuffer) {
        const musicSrc = masterCtx.createBufferSource();
        musicSrc.buffer = musicBuffer;

        const vocalPocketEq = masterCtx.createBiquadFilter();
        vocalPocketEq.type = 'peaking';
        vocalPocketEq.frequency.value = 1850;
        vocalPocketEq.Q.value = 1.1;
        vocalPocketEq.gain.value = -3.2;

        const duckGain = masterCtx.createGain();
        const duckCurve = buildAutoDuckingCurve({
          totalDurationSec,
          baseVolume: effectiveMusicVol,
          speechWindows,
          controlRateHz: 50,
        });
        try {
          duckGain.gain.setValueCurveAtTime(duckCurve, 0, totalDurationSec);
        } catch {
          duckGain.gain.setValueAtTime(duckCurve[0] ?? 0.28, 0);
        }

        musicSrc.connect(vocalPocketEq);
        vocalPocketEq.connect(duckGain);
        duckGain.connect(musicBus);
        musicSrc.start(0);
        musicSrc.stop(totalDurationSec + 0.35);
      }
    }

    // 4) Renderizar mezcla maestra 48 kHz + stem de SFX/Foley en paralelo
    const [masterBuffer, sfxStemBuffer] = await Promise.all([
      masterCtx.startRendering(),
      sfxTelemetryCtx.startRendering(),
    ]);

    if (signal?.aborted) {
      throw new Error('Renderizado cancelado.');
    }

    // 5) Calcular AudioTelemetryTrack (voiceRms e impactTransients normalizados [0..1] por frame)
    const voiceRms = computePerFrameEnergy(voiceStemBuffer, totalFrames, fps, 'rms');
    const impactTransients = computePerFrameEnergy(sfxStemBuffer, totalFrames, fps, 'transient');

    const telemetry: AudioTelemetryTrack = {
      fps,
      totalDurationSec,
      voiceRms,
      impactTransients,
      masterBuffer,
    };

    return {
      telemetry,
      resolvedClips,
      totalDurationSec,
    };
  }
}
