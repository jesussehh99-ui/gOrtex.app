import type { FoleyCueType, ScriptScene } from '../types';
import { deriveBeatSeed, mulberry32, PRNG_CHANNEL } from './deterministicPrng';
import { extractSceneHudMetric } from './visualKeywords';

/**
 * Nivel de volumen SFX por defecto respecto a la voz (-6 dB).
 * `voiceBus` opera a ganancia 1.05 en el mezclador maestro.
 */
export const DEFAULT_SFX_VOLUME_DB = -6;
export const VOICE_REFERENCE_GAIN = 1.05;

export function sfxVolumeDbToGain(db: number): number {
  const clampedDb = Math.max(-24, Math.min(3, Number.isFinite(db) ? db : DEFAULT_SFX_VOLUME_DB));
  if (clampedDb <= -23.5) return 0;
  return VOICE_REFERENCE_GAIN * Math.pow(10, clampedDb / 20);
}

export interface ProceduralFoleyBeatSpec {
  scene: ScriptScene;
  beatIndex: number;
  startSec: number;
  durationSec: number;
  prePauseSec?: number;
  nextBeatStartSec?: number;
}

export interface ScheduleBeatFoleyOptions {
  ctx: BaseAudioContext;
  destination: AudioNode;
  projectSeed: number;
  beat: ProceduralFoleyBeatSpec;
  /** Offset en segundos de inicio en el timeline (para reproducción en vivo desde un punto de seek) */
  playbackOffsetSec?: number;
  /** Tiempo `ctx.currentTime` correspondiente a `playbackOffsetSec` (0 en OfflineAudioContext) */
  baseContextTimeSec?: number;
  /** Multiplicador de intensidad global (default 1.0) */
  intensity?: number;
}

const SOFT_SATURATION_CURVE = (() => {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const drive = 2.6;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
})();

/**
 * Genera un AudioBuffer de ruido blanco o rosa 100% determinista usando Mulberry32.
 * Prohibido `Math.random()`: preview y exportación MP4 sintetizan exactamente las mismas muestras.
 */
function createDeterministicNoiseBuffer(
  ctx: BaseAudioContext,
  durationSec: number,
  seed: number,
  color: 'white' | 'pink'
): AudioBuffer {
  const sampleRate = ctx.sampleRate || 48000;
  const frameCount = Math.max(64, Math.floor(sampleRate * Math.max(0.05, durationSec)));
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);
  const rng = mulberry32(seed);

  if (color === 'white') {
    for (let i = 0; i < frameCount; i++) {
      data[i] = rng() * 2 - 1;
    }
    return buffer;
  }

  // Filtro Paul Kellet determinista para ruido rosa suave
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < frameCount; i++) {
    const white = rng() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    data[i] = Math.max(-1, Math.min(1, pink));
  }
  return buffer;
}

function createStereoPannerSafe(ctx: BaseAudioContext, initialPan = 0): StereoPannerNode | null {
  if (typeof ctx.createStereoPanner !== 'function') return null;
  try {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, initialPan));
    return panner;
  } catch {
    return null;
  }
}

function toContextTime(
  timelineSec: number,
  playbackOffsetSec: number,
  baseContextTimeSec: number
): number | null {
  const rel = timelineSec - playbackOffsetSec;
  if (rel < -0.025) return null;
  return baseContextTimeSec + Math.max(0.002, rel);
}

/**
 * 1) `sub_drop`: Oscilador senoidal con barrido exponencial 110 Hz → 32 Hz en 0.7s
 *    + saturación suave (`WaveShaperNode`) para pegada sub-grave limpia en móvil.
 */
function synthesizeSubDrop(
  ctx: BaseAudioContext,
  destination: AudioNode,
  t: number,
  intensity: number
) {
  const dur = 0.7;
  const osc = ctx.createOscillator();
  const shaper = ctx.createWaveShaper();
  const lp = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(32, t + dur);

  shaper.curve = SOFT_SATURATION_CURVE;
  shaper.oversample = '2x';

  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(220, t);
  lp.frequency.exponentialRampToValueAtTime(85, t + dur);

  const peak = 0.44 * intensity;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.016);
  gain.gain.exponentialRampToValueAtTime(peak * 0.42, t + 0.28);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.connect(shaper);
  shaper.connect(lp);
  lp.connect(gain);
  gain.connect(destination);

  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/**
 * 2) `riser_tension`: Ruido filtrado pasa-banda con barrido 200 Hz → 3800 Hz
 *    calculado para clímax exacto en `nextBeatStartSec - 0.05s`.
 */
function synthesizeRiserTension(
  ctx: BaseAudioContext,
  destination: AudioNode,
  peakContextTime: number,
  riserDurationSec: number,
  seed: number,
  intensity: number
) {
  const dur = Math.max(0.45, Math.min(2.2, riserDurationSec));
  const startT = Math.max(0.002, peakContextTime - dur);
  const actualDur = Math.max(0.18, peakContextTime - startT);

  const noise = ctx.createBufferSource();
  noise.buffer = createDeterministicNoiseBuffer(ctx, actualDur + 0.08, seed, 'white');

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.setValueAtTime(2.8, startT);
  bp.frequency.setValueAtTime(200, startT);
  bp.frequency.exponentialRampToValueAtTime(3800, startT + actualDur);

  const shimmerOsc = ctx.createOscillator();
  shimmerOsc.type = 'triangle';
  shimmerOsc.frequency.setValueAtTime(190, startT);
  shimmerOsc.frequency.exponentialRampToValueAtTime(760, startT + actualDur);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, startT);
  oscGain.gain.exponentialRampToValueAtTime(0.065 * intensity, startT + actualDur * 0.94);
  oscGain.gain.linearRampToValueAtTime(0.0001, startT + actualDur + 0.03);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startT);
  gain.gain.exponentialRampToValueAtTime(0.24 * intensity, startT + actualDur * 0.92);
  gain.gain.linearRampToValueAtTime(0.0001, startT + actualDur + 0.04);

  noise.connect(bp);
  bp.connect(gain);
  gain.connect(destination);

  shimmerOsc.connect(oscGain);
  oscGain.connect(destination);

  noise.start(startT);
  noise.stop(startT + actualDur + 0.06);
  shimmerOsc.start(startT);
  shimmerOsc.stop(startT + actualDur + 0.05);
}

/**
 * 3) `whoosh_cut`: Ruido rosa/blanco con filtro pasa-banda dinámico
 *    y paneo estéreo (-0.7 → +0.7 o viceversa) alineado al corte visual.
 */
function synthesizeWhooshCut(
  ctx: BaseAudioContext,
  destination: AudioNode,
  t: number,
  beatIndex: number,
  seed: number,
  intensity: number
) {
  const dur = 0.26;
  const noise = ctx.createBufferSource();
  noise.buffer = createDeterministicNoiseBuffer(ctx, dur + 0.04, seed, 'pink');

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.setValueAtTime(1.5, t);
  bp.frequency.setValueAtTime(260, t);
  bp.frequency.exponentialRampToValueAtTime(2450, t + dur * 0.45);
  bp.frequency.exponentialRampToValueAtTime(380, t + dur);

  const gain = ctx.createGain();
  const peak = 0.28 * intensity;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + dur * 0.36);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const dir = beatIndex % 2 === 0 ? 1 : -1;
  const panner = createStereoPannerSafe(ctx, -0.7 * dir);
  noise.connect(bp);
  bp.connect(gain);
  if (panner) {
    panner.pan.setValueAtTime(-0.7 * dir, t);
    panner.pan.linearRampToValueAtTime(0.7 * dir, t + dur);
    gain.connect(panner);
    panner.connect(destination);
  } else {
    gain.connect(destination);
  }

  noise.start(t);
  noise.stop(t + dur + 0.03);
}

/**
 * 4) `hud_click`: Doble micro-pulso agudo (1800 Hz y 2600 Hz, 25 ms cada uno).
 *    Se dispara automáticamente en cualquier beat con tarjeta de datos HUD.
 */
function synthesizeHudClick(
  ctx: BaseAudioContext,
  destination: AudioNode,
  t: number,
  intensity: number
) {
  const freqs = [1800, 2600];
  freqs.forEach((freq, idx) => {
    const start = t + idx * 0.042;
    const dur = 0.025;
    const osc = ctx.createOscillator();
    const hp = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.08, start + dur);

    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1200, start);

    const peak = (idx === 0 ? 0.14 : 0.17) * intensity;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(hp);
    hp.connect(gain);
    gain.connect(destination);

    osc.start(start);
    osc.stop(start + dur + 0.01);
  });
}

/**
 * 5) `heartbeat`: Doble pulso grave amortiguado (55 Hz) en beats de suspenso.
 */
function synthesizeHeartbeat(
  ctx: BaseAudioContext,
  destination: AudioNode,
  t: number,
  intensity: number
) {
  const offsets = [
    { dt: 0, startFreq: 66, endFreq: 48, peak: 0.4 * intensity, dur: 0.18 },
    { dt: 0.22, startFreq: 58, endFreq: 42, peak: 0.29 * intensity, dur: 0.16 },
  ];
  for (const p of offsets) {
    const start = t + p.dt;
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(p.startFreq, start);
    osc.frequency.exponentialRampToValueAtTime(p.endFreq, start + p.dur);

    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(140, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(p.peak, start + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + p.dur);

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(destination);

    osc.start(start);
    osc.stop(start + p.dur + 0.02);
  }
}

/**
 * 6) `thunder_impact`: Golpe sub-grave + crujido atmosférico determinista (Mulberry32).
 */
function synthesizeThunderImpact(
  ctx: BaseAudioContext,
  destination: AudioNode,
  t: number,
  seed: number,
  intensity: number
) {
  synthesizeSubDrop(ctx, destination, t, intensity * 0.9);

  const dur = 0.85;
  const noise = ctx.createBufferSource();
  noise.buffer = createDeterministicNoiseBuffer(ctx, dur + 0.05, seed, 'pink');

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1850, t);
  lp.frequency.exponentialRampToValueAtTime(160, t + dur);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.32 * intensity, t + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.09 * intensity, t + 0.28);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  noise.connect(lp);
  lp.connect(gain);
  gain.connect(destination);

  noise.start(t);
  noise.stop(t + dur + 0.04);
}

/**
 * 7) `analog_glitch`: Ráfagas deterministas de ruido cuantizado + salto estéreo (Mulberry32).
 */
function synthesizeAnalogGlitch(
  ctx: BaseAudioContext,
  destination: AudioNode,
  t: number,
  seed: number,
  intensity: number
) {
  const rng = mulberry32(seed ^ 0x51f23a9);
  const bursts = 4;
  for (let i = 0; i < bursts; i++) {
    const start = t + i * 0.036 + rng() * 0.012;
    const dur = 0.026 + rng() * 0.024;
    const noise = ctx.createBufferSource();
    noise.buffer = createDeterministicNoiseBuffer(ctx, dur + 0.01, seed + i * 97, 'white');

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900 + rng() * 3200, start);
    bp.Q.setValueAtTime(3.2, start);

    const gain = ctx.createGain();
    const peak = (0.19 + rng() * 0.09) * intensity;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    const panner = createStereoPannerSafe(ctx, (rng() * 2 - 1) * 0.8);
    noise.connect(bp);
    bp.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(destination);
    } else {
      gain.connect(destination);
    }

    noise.start(start);
    noise.stop(start + dur + 0.015);
  }
}

export class ProceduralFoleyEngine {
  /**
   * Programa todos los eventos SFX procedurales de un beat con precisión sample-accurate.
   * Compatible de forma idéntica con `AudioContext` (preview) y `OfflineAudioContext` (export).
   */
  static scheduleBeatFoley(options: ScheduleBeatFoleyOptions): void {
    const {
      ctx,
      destination,
      projectSeed,
      beat,
      playbackOffsetSec = 0,
      baseContextTimeSec = 0,
      intensity = 1.0,
    } = options;

    if (intensity <= 0.001) return;

    const { scene, beatIndex, startSec, durationSec } = beat;
    const prePauseSec = Math.max(0, beat.prePauseSec ?? 0);
    const nextBeatStartSec = beat.nextBeatStartSec ?? startSec + durationSec;
    const foleySeed = deriveBeatSeed(projectSeed, beatIndex, PRNG_CHANNEL.AUDIO_FOLEY);

    // Determinar cue efectivo (respetando `foleyCue` explícito de BeatV2)
    let cue: FoleyCueType = scene.foleyCue ?? 'none';
    if (!scene.foleyCue) {
      if (beatIndex === 0 || scene.esGiro30s || scene.retentionRole === 're_hook') {
        cue = 'sub_drop';
      } else if (scene.retentionRole === 'climax') {
        cue = 'thunder_impact';
      } else if (beatIndex > 0) {
        cue = 'whoosh_cut';
      }
    }

    // 1. Transición visual automática de entrada (whoosh sutil al entrar un corte cuando el cue no es whoosh ni none)
    if (beatIndex > 0 && cue !== 'whoosh_cut' && cue !== 'riser_tension' && cue !== 'none') {
      const cutT = toContextTime(Math.max(0, startSec - 0.03), playbackOffsetSec, baseContextTimeSec);
      if (cutT !== null) {
        synthesizeWhooshCut(ctx, destination, cutT, beatIndex, foleySeed ^ 0x101, intensity * 0.55);
      }
    }

    // 2. Cue principal del Beat
    const impactTimelineSec = startSec + Math.min(prePauseSec, 0.14);
    switch (cue) {
      case 'sub_drop': {
        const t = toContextTime(impactTimelineSec, playbackOffsetSec, baseContextTimeSec);
        if (t !== null) {
          synthesizeSubDrop(ctx, destination, t, intensity);
        }
        break;
      }
      case 'riser_tension': {
        // Clímax exacto en `nextBeatStartSec - 0.05s`
        const climaxTimelineSec = Math.max(startSec + 0.35, nextBeatStartSec - 0.05);
        const riserDuration = Math.min(1.65, Math.max(0.55, durationSec * 0.55));
        const peakT = toContextTime(climaxTimelineSec, playbackOffsetSec, baseContextTimeSec);
        if (peakT !== null) {
          synthesizeRiserTension(
            ctx,
            destination,
            peakT,
            riserDuration,
            foleySeed ^ 0x202,
            intensity
          );
        }
        break;
      }
      case 'whoosh_cut': {
        const cutTimelineSec = beatIndex > 0 ? Math.max(0, startSec - 0.035) : startSec + 0.02;
        const t = toContextTime(cutTimelineSec, playbackOffsetSec, baseContextTimeSec);
        if (t !== null) {
          synthesizeWhooshCut(ctx, destination, t, beatIndex, foleySeed ^ 0x303, intensity);
        }
        break;
      }
      case 'hud_click': {
        const t = toContextTime(startSec + 0.12, playbackOffsetSec, baseContextTimeSec);
        if (t !== null) {
          synthesizeHudClick(ctx, destination, t, intensity);
        }
        break;
      }
      case 'heartbeat': {
        const t = toContextTime(impactTimelineSec, playbackOffsetSec, baseContextTimeSec);
        if (t !== null) {
          synthesizeHeartbeat(ctx, destination, t, intensity);
        }
        break;
      }
      case 'thunder_impact': {
        const t = toContextTime(impactTimelineSec, playbackOffsetSec, baseContextTimeSec);
        if (t !== null) {
          synthesizeThunderImpact(ctx, destination, t, foleySeed ^ 0x404, intensity);
        }
        break;
      }
      case 'analog_glitch': {
        const t = toContextTime(impactTimelineSec + 0.02, playbackOffsetSec, baseContextTimeSec);
        if (t !== null) {
          synthesizeAnalogGlitch(ctx, destination, t, foleySeed ^ 0x505, intensity);
        }
        break;
      }
      case 'none':
      default:
        break;
    }

    // 3. Disparo automático de `hud_click` siempre que el beat tenga tarjeta HUD activa
    if (cue !== 'hud_click' && extractSceneHudMetric(scene) !== null) {
      const hudT = toContextTime(startSec + 0.14, playbackOffsetSec, baseContextTimeSec);
      if (hudT !== null) {
        synthesizeHudClick(ctx, destination, hudT, intensity * 0.92);
      }
    }
  }

  /**
   * Programa la pista foley completa para una línea de tiempo de beats.
   */
  static scheduleTimelineFoley(options: {
    ctx: BaseAudioContext;
    destination: AudioNode;
    projectSeed: number;
    beats: ProceduralFoleyBeatSpec[];
    playbackOffsetSec?: number;
    baseContextTimeSec?: number;
    intensity?: number;
  }): void {
    const {
      ctx,
      destination,
      projectSeed,
      beats,
      playbackOffsetSec = 0,
      baseContextTimeSec = 0,
      intensity = 1.0,
    } = options;

    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      const next = beats[i + 1];
      ProceduralFoleyEngine.scheduleBeatFoley({
        ctx,
        destination,
        projectSeed,
        beat: {
          ...b,
          nextBeatStartSec: b.nextBeatStartSec ?? (next ? next.startSec : b.startSec + b.durationSec),
        },
        playbackOffsetSec,
        baseContextTimeSec,
        intensity,
      });
    }
  }
}

/**
 * Curva determinista de impacto SFX para el Preview (espejo de `AudioTelemetryTrack.impactTransients`),
 * asegurando micro-sacudidas de cámara y destellos de luz sincronizados al `ProceduralFoleyEngine`.
 */
export function sampleProceduralFoleyImpactAt(
  scene: ScriptScene | undefined,
  beatIndex: number,
  localElapsed: number,
  beatDurationSec: number,
  prePauseSec: number
): number {
  if (!scene) return 0;
  let cue: FoleyCueType = scene.foleyCue ?? 'none';
  if (!scene.foleyCue) {
    if (beatIndex === 0 || scene.esGiro30s || scene.retentionRole === 're_hook') {
      cue = 'sub_drop';
    } else if (scene.retentionRole === 'climax') {
      cue = 'thunder_impact';
    } else if (beatIndex > 0) {
      cue = 'whoosh_cut';
    }
  }

  const impactStart = Math.min(Math.max(0, prePauseSec), 0.14);
  const dt = localElapsed - impactStart;
  let energy = 0;

  if (cue === 'sub_drop' || cue === 'thunder_impact') {
    if (dt >= 0 && dt < 0.65) {
      energy = Math.max(energy, Math.exp(-dt * 4.8) * (cue === 'thunder_impact' ? 1.0 : 0.88));
    }
  } else if (cue === 'heartbeat') {
    if (dt >= 0 && dt < 0.22) {
      energy = Math.max(energy, Math.exp(-dt * 12.0) * 0.72);
    }
    const dt2 = dt - 0.22;
    if (dt2 >= 0 && dt2 < 0.2) {
      energy = Math.max(energy, Math.exp(-dt2 * 13.0) * 0.56);
    }
  } else if (cue === 'riser_tension') {
    const climaxAt = Math.max(0.35, beatDurationSec - 0.05);
    const riserSpan = Math.min(1.5, beatDurationSec * 0.52);
    const dist = climaxAt - localElapsed;
    if (dist >= 0 && dist <= riserSpan) {
      const p = 1 - dist / Math.max(0.1, riserSpan);
      energy = Math.max(energy, p * p * 0.78);
    }
  } else if (cue === 'analog_glitch') {
    if (dt >= 0.02 && dt < 0.22) {
      energy = Math.max(energy, Math.exp(-(dt - 0.02) * 10.0) * 0.7);
    }
  } else if (cue === 'whoosh_cut') {
    if (localElapsed >= 0 && localElapsed < 0.24) {
      energy = Math.max(energy, Math.exp(-localElapsed * 11.0) * 0.52);
    }
  }

  if (extractSceneHudMetric(scene) !== null) {
    const hudDt = localElapsed - 0.14;
    if (hudDt >= 0 && hudDt < 0.14) {
      energy = Math.max(energy, Math.exp(-hudDt * 18.0) * 0.36);
    }
  }

  return Math.max(0, Math.min(1, energy));
}
