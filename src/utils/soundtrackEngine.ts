import type { BackgroundMusicId, FoleyCueType, ScriptScene } from '../types';
import { deriveBeatSeed, mulberry32, PRNG_CHANNEL } from './deterministicRandom';

export interface MusicTrackOption {
  id: BackgroundMusicId;
  label: string;
  mood: string;
}

export const BACKGROUND_MUSIC_TRACKS: MusicTrackOption[] = [
  { id: 'none', label: 'Ninguna', mood: 'Solo narración limpia' },
  {
    id: 'commercial_lounge',
    label: 'Lounge Editorial / Inmobiliaria',
    mood: 'Acordes cálidos limpios para tours y anuncios',
  },
  { id: 'suspenso_abisal', label: 'Suspenso Abisal', mood: 'Dron profundo y tensión submarina' },
  { id: 'misterio_espacial', label: 'Misterio Espacial', mood: 'Atmósfera cósmica y pulsos de radio' },
  {
    id: 'tension_cinematografica',
    label: 'Tensión Cinematográfica',
    mood: 'Ostinato oscuro de alto impacto',
  },
  { id: 'curiosidad', label: 'Curiosidad / Sabías qué', mood: 'Pulso cálido moderno' },
  { id: 'epico', label: 'Épico / Inspirador', mood: 'Acordes amplios de alto impacto' },
  { id: 'suspenso', label: 'Suspenso Clásico', mood: 'Tensión atmosférica grave' },
  { id: 'alegre', label: 'Alegre / Familiar', mood: 'Acústico suave positivo' },
  { id: 'comedia', label: 'Comedia / Meme 3D', mood: 'Ritmo ágil juguetón' },
];

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Genera un buffer de música 100% libre de derechos de autor en memoria usando síntesis limpia.
 * Cero riesgo de reclamaciones de copyright en YouTube, TikTok o Reels.
 */
export function buildRoyaltyFreeMusicBuffer(
  ctx: BaseAudioContext,
  trackId: BackgroundMusicId,
  durationSec: number
): AudioBuffer | null {
  if (trackId === 'none') return null;
  const sampleRate = ctx.sampleRate;
  const totalSamples = Math.max(1, Math.ceil(durationSec * sampleRate));
  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Síntesis editorial limpia para Modo Comercial & Bienes Raíces (Lounge cálido 96 BPM, sin frecuencias agresivas)
  if (trackId === 'commercial_lounge') {
    const chords = [
      [53, 57, 60, 64, 67], // Fmaj9 cálido
      [50, 57, 60, 64, 69], // Dm9 elegante
      [48, 55, 59, 62, 67], // Cmaj9 luminoso
      [55, 59, 62, 64, 69], // G6/9 abierto
    ];
    const barDur = 2.5; // 96 BPM (4 negras = 2.5s)
    const beatDur = barDur / 4;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const globalEnv = Math.min(1, t / 0.7) * Math.min(1, Math.max(0, (durationSec - t) / 1.0));
      const barIdx = Math.floor(t / barDur) % chords.length;
      const barLocal = t % barDur;
      const beatLocal = t % beatDur;
      const chord = chords[barIdx];

      // Pad eléctrico estilo Rhodes cálido con envolvente suave por compás
      const chordEnv = Math.min(1, barLocal / 0.14) * Math.exp(-barLocal * 0.42);
      let rhodesL = 0;
      let rhodesR = 0;
      for (let n = 0; n < chord.length; n++) {
        const f = midiToFreq(chord[n]);
        const fundamental = Math.sin(2 * Math.PI * f * t);
        const tine = Math.sin(2 * Math.PI * f * 2 * t) * 0.16 * Math.exp(-barLocal * 2.2);
        const voice = (fundamental + tine) * 0.085 * chordEnv;
        const pan = (n / Math.max(1, chord.length - 1)) * 0.5 + 0.25;
        rhodesL += voice * (1 - pan * 0.45);
        rhodesR += voice * (0.55 + pan * 0.45);
      }

      // Bajo suave cálido redondeado en el pulso 1 y 3
      const bassFreq = midiToFreq(chord[0] - 12);
      const bassLocal = t % (beatDur * 2);
      const bassEnv = Math.min(1, bassLocal / 0.03) * Math.exp(-bassLocal * 1.45);
      const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.16 * bassEnv;

      // Arpegio cristalino sutil en corcheas
      const arpStepDur = beatDur / 2;
      const arpStep = Math.floor(t / arpStepDur) % chord.length;
      const arpLocal = t % arpStepDur;
      const arpFreq = midiToFreq(chord[arpStep] + 12);
      const arpEnv = Math.min(1, arpLocal / 0.012) * Math.exp(-arpLocal * 6.5);
      const arp = Math.sin(2 * Math.PI * arpFreq * t) * 0.045 * arpEnv;

      // Pulso rítmico minimalista muy sutil (bombo suave)
      const kickEnv = Math.exp(-beatLocal * 18.0);
      const kick = Math.sin(2 * Math.PI * (52 + 45 * kickEnv) * beatLocal) * 0.09 * kickEnv;

      const outL = (rhodesL + bass + arp * 0.8 + kick) * globalEnv;
      const outR = (rhodesR + bass + arp * 1.15 + kick) * globalEnv;
      left[i] = Math.max(-0.82, Math.min(0.82, outL));
      right[i] = Math.max(-0.82, Math.min(0.82, outR));
    }
    return buffer;
  }

  // Síntesis atmosférica dedicada para las 3 bandas sonoras ambientales cinematográficas
  if (
    trackId === 'suspenso_abisal' ||
    trackId === 'misterio_espacial' ||
    trackId === 'tension_cinematografica'
  ) {
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const globalEnv = Math.min(1, t / 0.8) * Math.min(1, Math.max(0, (durationSec - t) / 1.1));
      let outL = 0;
      let outR = 0;

      if (trackId === 'suspenso_abisal') {
        // Dron abisal ultra-profundo (D1/A1) + oleaje de presión + eco de sonar distante cada 4.8s
        const swell = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.14 * t);
        const subDrone =
          Math.sin(2 * Math.PI * 36.71 * t) * 0.34 +
          Math.sin(2 * Math.PI * 55.0 * t + Math.sin(t * 0.6) * 0.4) * 0.18;
        const abyssPadL = Math.sin(2 * Math.PI * 110.0 * t + Math.sin(t * 0.25) * 0.8) * 0.11 * swell;
        const abyssPadR = Math.sin(2 * Math.PI * 116.54 * t + Math.cos(t * 0.21) * 0.8) * 0.11 * swell;
        const sonarPeriod = 4.8;
        const sonarLocal = t % sonarPeriod;
        const sonarEnv = Math.exp(-sonarLocal * 2.4) * Math.min(1, sonarLocal / 0.02);
        const sonarPing =
          (Math.sin(2 * Math.PI * 740 * t) * 0.12 + Math.sin(2 * Math.PI * 1480 * t) * 0.04) *
          sonarEnv;
        outL = (subDrone + abyssPadL + sonarPing * 0.82) * globalEnv;
        outR = (subDrone + abyssPadR + sonarPing * 1.15) * globalEnv;
      } else if (trackId === 'misterio_espacial') {
        // Quinta abierta cósmica flotante (C2-G2-D3-Bb3) + pulso armónico de radiotelescopio
        const breath = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.11 * t);
        const shimmer = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.23 * t + 1.1);
        const root = Math.sin(2 * Math.PI * 65.41 * t) * 0.22;
        const fifthL = Math.sin(2 * Math.PI * 98.0 * t + Math.sin(t * 0.35) * 0.5) * 0.16 * breath;
        const fifthR = Math.sin(2 * Math.PI * 146.83 * t + Math.cos(t * 0.29) * 0.5) * 0.14 * breath;
        const starGlassL = Math.sin(2 * Math.PI * 466.16 * t) * 0.055 * shimmer;
        const starGlassR = Math.sin(2 * Math.PI * 523.25 * t) * 0.05 * (1 - shimmer * 0.5);
        const radioLocal = t % 3.2;
        const radioEnv = Math.exp(-radioLocal * 4.5) * Math.min(1, radioLocal / 0.015);
        const radioPulse = Math.sin(2 * Math.PI * 1046.5 * t) * 0.07 * radioEnv;
        outL = (root + fifthL + starGlassL + radioPulse * 1.1) * globalEnv;
        outR = (root + fifthR + starGlassR + radioPulse * 0.85) * globalEnv;
      } else {
        // Tensión Cinematográfica: ostinato rítmico oscuro (112 BPM) + pulso sub-grave + cuerda tensa
        const pulseDur = 60 / 112 / 2; // corcheas
        const pulseIdx = Math.floor(t / pulseDur) % 8;
        const pulseLocal = t % pulseDur;
        const ostinatoNotes = [45, 45, 48, 45, 50, 45, 48, 44]; // A2 menor tenso
        const ostFreq = midiToFreq(ostinatoNotes[pulseIdx]);
        const ostEnv = Math.exp(-pulseLocal * 11.5) * Math.min(1, pulseLocal / 0.008);
        const ostinato =
          (Math.sin(2 * Math.PI * ostFreq * t) * 0.65 +
            Math.sin(2 * Math.PI * ostFreq * 2 * t) * 0.25) *
          ostEnv *
          0.26;
        const braamPeriod = 4.28;
        const braamLocal = t % braamPeriod;
        const braamEnv = Math.exp(-braamLocal * 1.6) * Math.min(1, braamLocal / 0.08);
        const subBraam =
          (Math.sin(2 * Math.PI * 55 * t) * 0.28 + Math.sin(2 * Math.PI * 110 * t) * 0.1) *
          braamEnv;
        const stringL = Math.sin(2 * Math.PI * 220 * t) * 0.075 * (0.65 + 0.35 * Math.sin(t * 0.7));
        const stringR =
          Math.sin(2 * Math.PI * 261.63 * t) * 0.07 * (0.65 + 0.35 * Math.cos(t * 0.65));
        outL = (ostinato * 0.94 + subBraam + stringL) * globalEnv;
        outR = (ostinato * 1.06 + subBraam + stringR) * globalEnv;
      }

      left[i] = Math.max(-0.85, Math.min(0.85, outL));
      right[i] = Math.max(-0.85, Math.min(0.85, outR));
    }
    return buffer;
  }

  const configs: Record<
    Exclude<
      BackgroundMusicId,
      'none' | 'suspenso_abisal' | 'misterio_espacial' | 'tension_cinematografica' | 'commercial_lounge'
    >,
    {
      bpm: number;
      chords: number[][];
      melody: number[];
      bass: number[];
      padGain: number;
      pluckGain: number;
      bassGain: number;
      bright: number;
    }
  > = {
    curiosidad: {
      bpm: 108,
      chords: [
        [60, 64, 67, 71],
        [57, 60, 64, 69],
        [53, 57, 60, 65],
        [55, 59, 62, 67],
      ],
      melody: [72, 76, 79, 76, 74, 72, 71, 74],
      bass: [48, 45, 41, 43],
      padGain: 0.14,
      pluckGain: 0.22,
      bassGain: 0.16,
      bright: 0.45,
    },
    alegre: {
      bpm: 118,
      chords: [
        [62, 66, 69],
        [57, 61, 64],
        [59, 62, 66],
        [55, 59, 62],
      ],
      melody: [74, 78, 81, 78, 76, 74, 73, 76],
      bass: [50, 45, 47, 43],
      padGain: 0.13,
      pluckGain: 0.24,
      bassGain: 0.15,
      bright: 0.55,
    },
    suspenso: {
      bpm: 84,
      chords: [
        [50, 53, 57],
        [48, 52, 55],
        [46, 50, 53],
        [45, 49, 52],
      ],
      melody: [62, 0, 65, 0, 64, 0, 61, 57],
      bass: [38, 36, 34, 33],
      padGain: 0.2,
      pluckGain: 0.15,
      bassGain: 0.24,
      bright: 0.25,
    },
    epico: {
      bpm: 96,
      chords: [
        [57, 60, 64, 69],
        [53, 57, 60, 65],
        [60, 64, 67, 72],
        [55, 59, 62, 67],
      ],
      melody: [69, 72, 76, 72, 77, 76, 72, 71],
      bass: [45, 41, 48, 43],
      padGain: 0.22,
      pluckGain: 0.18,
      bassGain: 0.22,
      bright: 0.5,
    },
    comedia: {
      bpm: 132,
      chords: [
        [60, 64, 67],
        [65, 69, 72],
        [62, 65, 69],
        [67, 71, 74],
      ],
      melody: [72, 76, 79, 84, 79, 76, 74, 79],
      bass: [48, 53, 50, 55],
      padGain: 0.08,
      pluckGain: 0.28,
      bassGain: 0.2,
      bright: 0.65,
    },
  };

  const cfg = configs[trackId];
  const beatDur = 60 / cfg.bpm;
  const barDur = beatDur * 4;
  const stepDur = beatDur / 2;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.floor(t / barDur) % cfg.chords.length;
    const barTime = t % barDur;
    const stepIdx = Math.floor(t / stepDur) % cfg.melody.length;
    const stepTime = t % stepDur;

    // 1. Pad armónico suave (con ligero estéreo)
    const chord = cfg.chords[barIdx];
    const padEnv = Math.min(1, barTime / 0.18) * Math.min(1, (barDur - barTime) / 0.18);
    let padL = 0;
    let padR = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = midiToFreq(chord[c]);
      const phase = 2 * Math.PI * f * t;
      const wave = Math.sin(phase) * 0.7 + Math.sin(phase * 2) * (0.2 * cfg.bright);
      const pan = c % 2 === 0 ? 0.65 : 0.35;
      padL += wave * pan;
      padR += wave * (1 - pan);
    }
    padL = (padL / chord.length) * cfg.padGain * padEnv;
    padR = (padR / chord.length) * cfg.padGain * padEnv;

    // 2. Arpegio / pluck rítmico tipo marimba o pizzicato
    let pluck = 0;
    const melMidi = cfg.melody[stepIdx];
    if (melMidi > 0) {
      const f = midiToFreq(melMidi);
      const env = Math.exp(-stepTime * (trackId === 'comedia' ? 14 : 8.5));
      pluck =
        (Math.sin(2 * Math.PI * f * t) + 0.32 * cfg.bright * Math.sin(2 * Math.PI * f * 2 * t)) *
        env *
        cfg.pluckGain;
    }

    // 3. Bajo pulso cálido
    const bassFreq = midiToFreq(cfg.bass[barIdx]);
    const beatTime = t % beatDur;
    const bassEnv = Math.exp(-beatTime * (trackId === 'suspenso' ? 3.2 : 5.5));
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * bassEnv * cfg.bassGain;

    // Fade-in inicial y fade-out final limpio
    const globalEnv = Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (durationSec - t) / 1.0));
    const outL = Math.max(-0.85, Math.min(0.85, (padL + pluck * 0.92 + bass) * globalEnv));
    const outR = Math.max(-0.85, Math.min(0.85, (padR + pluck * 1.08 + bass) * globalEnv));

    left[i] = outL;
    right[i] = outR;
  }

  return buffer;
}

/**
 * Programa la música de fondo en un AudioContext aplicando Auto-Ducking Real (sidechain envelope):
 * - Baja automáticamente al 12% mientras la voz narra (espacio limpio para claridad vocal).
 * - Sube suavemente al 28% en las pausas entre frases o micro-escenas.
 */
export function scheduleDuckedBackgroundMusic(options: {
  audioCtx: BaseAudioContext;
  destination: AudioNode;
  trackId: BackgroundMusicId;
  startTime: number;
  totalDurationSec: number;
  baseVolume: number; // Escala del slider del usuario (0.28 = estándar de estudio)
  speechWindows: Array<{ startSec: number; endSec: number; duckLevel?: number }>;
}): AudioBufferSourceNode | null {
  const { audioCtx, destination, trackId, startTime, totalDurationSec, baseVolume, speechWindows } =
    options;
  if (trackId === 'none' || baseVolume <= 0.005) return null;

  const musicBuffer = buildRoyaltyFreeMusicBuffer(audioCtx, trackId, totalDurationSec + 0.6);
  if (!musicBuffer) return null;

  const source = audioCtx.createBufferSource();
  source.buffer = musicBuffer;

  // Ecualizador de bolsillo vocal (cut sutil en 1.8 kHz para que la voz corte la mezcla sin esfuerzo)
  const vocalPocketEq = audioCtx.createBiquadFilter();
  vocalPocketEq.type = 'peaking';
  vocalPocketEq.frequency.value = 1850;
  vocalPocketEq.Q.value = 1.1;
  vocalPocketEq.gain.value = -3.2;

  const gainNode = audioCtx.createGain();
  // Curva de auto-ducking determinista vía setValueCurveAtTime: 12% voz (o duckLevel por beat) / 28% pausas
  const scaleFactor = Math.max(0.15, Math.min(1.6, baseVolume / 0.28));
  const pauseVol = Math.min(0.45, 0.28 * scaleFactor);
  const voiceDuckVol = Math.min(0.2, 0.12 * scaleFactor);
  const safeDur = Math.max(0.2, totalDurationSec);
  const sorted = [...speechWindows]
    .filter((w) => w.endSec > w.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  const numPoints = Math.max(4, Math.ceil(safeDur * 40) + 1);
  const duckCurve = new Float32Array(numPoints);
  const dt = safeDur / (numPoints - 1);
  const attackAlpha = 1 - Math.exp(-dt / 0.055);
  const releaseAlpha = 1 - Math.exp(-dt / 0.18);
  let curGain = pauseVol;
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
    curGain += (target - curGain) * (target < curGain ? attackAlpha : releaseAlpha);
    duckCurve[i] = Math.max(0.0001, curGain);
  }
  try {
    gainNode.gain.setValueCurveAtTime(duckCurve, startTime, safeDur);
  } catch {
    gainNode.gain.setValueAtTime(pauseVol, startTime);
  }

  source.connect(vocalPocketEq);
  vocalPocketEq.connect(gainNode);
  gainNode.connect(destination);
  source.start(startTime);
  source.stop(startTime + totalDurationSec + 0.4);
  return source;
}

/**
 * Programa efectos de sonido (SFX) limpios de transición (whoosh / pop / golpe clave)
 */
export function scheduleTransitionSfx(options: {
  audioCtx: BaseAudioContext;
  destination: AudioNode;
  atTime: number;
  type: 'whoosh' | 'key_moment';
}) {
  const { audioCtx, destination, atTime, type } = options;

  if (type === 'whoosh') {
    const dur = 0.22;
    const len = Math.floor(audioCtx.sampleRate * dur);
    const noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    const rng = mulberry32(deriveBeatSeed(104729, Math.round(atTime * 1000), PRNG_CHANNEL.AUDIO_FOLEY));
    for (let i = 0; i < len; i++) {
      const env = Math.sin((i / len) * Math.PI);
      data[i] = (rng() * 2 - 1) * env * 0.25;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuf;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, atTime);
    filter.frequency.exponentialRampToValueAtTime(1600, atTime + dur * 0.55);
    filter.frequency.exponentialRampToValueAtTime(420, atTime + dur);
    filter.Q.value = 1.6;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.24, atTime);
    gain.gain.exponentialRampToValueAtTime(0.001, atTime + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    noise.start(atTime);
    noise.stop(atTime + dur + 0.02);
    return;
  }

  // Golpe suave + chispa melódica en momentos clave
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(150, atTime);
  osc.frequency.exponentialRampToValueAtTime(52, atTime + 0.24);
  gain.gain.setValueAtTime(0.22, atTime);
  gain.gain.exponentialRampToValueAtTime(0.001, atTime + 0.28);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(atTime);
  osc.stop(atTime + 0.3);

  const chime = audioCtx.createOscillator();
  const chimeGain = audioCtx.createGain();
  chime.type = 'sine';
  chime.frequency.setValueAtTime(587.33, atTime);
  chime.frequency.exponentialRampToValueAtTime(880, atTime + 0.14);
  chimeGain.gain.setValueAtTime(0.08, atTime);
  chimeGain.gain.exponentialRampToValueAtTime(0.001, atTime + 0.24);
  chime.connect(chimeGain);
  chimeGain.connect(destination);
  chime.start(atTime);
  chime.stop(atTime + 0.26);
}

/**
 * Programa un barrido whip-pan rápido y sutil (140ms) para los micro-cortes de alta retención cada ~3.4s.
 */
export function scheduleWhipCutSfx(options: {
  audioCtx: BaseAudioContext;
  destination: AudioNode;
  atTime: number;
}): void {
  const { audioCtx, destination, atTime } = options;
  const dur = 0.14;
  const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
  const noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  const rng = mulberry32(deriveBeatSeed(224737, Math.round(atTime * 1000), PRNG_CHANNEL.AUDIO_FOLEY));
  for (let i = 0; i < len; i++) {
    const env = Math.sin((i / len) * Math.PI);
    data[i] = (rng() * 2 - 1) * env * 0.16;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuf;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(520, atTime);
  filter.frequency.exponentialRampToValueAtTime(2200, atTime + dur * 0.5);
  filter.frequency.exponentialRampToValueAtTime(640, atTime + dur);
  filter.Q.value = 2.0;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.14, atTime);
  gain.gain.exponentialRampToValueAtTime(0.001, atTime + dur);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  noise.start(atTime);
  noise.stop(atTime + dur + 0.02);
}

let previewMusicCtx: AudioContext | null = null;
let previewMusicSource: AudioBufferSourceNode | null = null;

export function stopMusicPreview(): void {
  if (previewMusicSource) {
    try {
      previewMusicSource.onended = null;
      previewMusicSource.stop();
      previewMusicSource.disconnect();
    } catch {
      // Ya detenido
    }
    previewMusicSource = null;
  }
}

export async function previewMusicTrack(
  trackId: BackgroundMusicId,
  volume = 0.35,
  onEnded?: () => void
): Promise<void> {
  stopMusicPreview();
  if (trackId === 'none' || typeof window === 'undefined') return;

  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  if (!previewMusicCtx || previewMusicCtx.state === 'closed') {
    previewMusicCtx = new Ctor();
  }
  if (previewMusicCtx.state === 'suspended') {
    await previewMusicCtx.resume();
  }

  const buffer = buildRoyaltyFreeMusicBuffer(previewMusicCtx, trackId, 8);
  if (!buffer) return;

  const source = previewMusicCtx.createBufferSource();
  source.buffer = buffer;
  const gain = previewMusicCtx.createGain();
  gain.gain.value = Math.max(0.08, Math.min(0.6, volume));

  source.connect(gain);
  gain.connect(previewMusicCtx.destination);
  source.onended = () => {
    if (previewMusicSource === source) {
      previewMusicSource = null;
    }
    onEnded?.();
  };
  previewMusicSource = source;
  source.start(0);
}

let liveSfxCtx: AudioContext | null = null;
let lastPopPlayedAt = 0;

/**
 * Reproduce efectos de sonido ligeros en tiempo real (Web Audio API, 100% gratis)
 * sincronizados con palabras resaltadas y cambios de escena en la vista previa.
 */
export function playLiveSfx(type: 'word_pop' | 'scene_whoosh' | 'impact'): void {
  if (typeof window === 'undefined') return;
  const nowMs = performance.now();
  // Evitar saturación si las palabras cambian demasiado rápido
  if (type === 'word_pop' && nowMs - lastPopPlayedAt < 110) return;
  if (type === 'word_pop') lastPopPlayedAt = nowMs;

  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  try {
    if (!liveSfxCtx || liveSfxCtx.state === 'closed') {
      liveSfxCtx = new Ctor();
    }
    if (liveSfxCtx.state === 'suspended') {
      void liveSfxCtx.resume().catch(() => {});
    }

    const ctx = liveSfxCtx;
    const t = ctx.currentTime;

    if (type === 'word_pop') {
      // Pop sutil y limpio de retención (~55ms)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(760, t + 0.045);
      gain.gain.setValueAtTime(0.055, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
      return;
    }

    if (type === 'scene_whoosh') {
      scheduleTransitionSfx({
        audioCtx: ctx,
        destination: ctx.destination,
        atTime: t,
        type: 'whoosh',
      });
      return;
    }

    scheduleTransitionSfx({
      audioCtx: ctx,
      destination: ctx.destination,
      atTime: t,
      type: 'key_moment',
    });
  } catch {
    // Ignorar silenciosamente si el navegador aún bloquea audio antes de interacción
  }
}

export type KeywordSfxKind = 'sonar' | 'em_pulse' | 'bass_impact';

/**
 * Programa un efecto de sonido cinematográfico sincronizado con palabras clave visuales:
 * - 'sonar': ping de sonar / radiotelescopio con cola resonante en espacio profundo
 * - 'em_pulse': pulso electromagnético sci-fi de banda estrecha
 * - 'bass_impact': impacto grave sub-bass de alto suspenso
 */
export function scheduleKeywordSfx(options: {
  audioCtx: BaseAudioContext;
  destination: AudioNode;
  atTime: number;
  type: KeywordSfxKind;
}): void {
  const { audioCtx, destination, atTime, type } = options;

  if (type === 'sonar') {
    const osc = audioCtx.createOscillator();
    const harmonic = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const harmGain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1180, atTime);
    osc.frequency.exponentialRampToValueAtTime(1140, atTime + 0.45);
    gain.gain.setValueAtTime(0.001, atTime);
    gain.gain.linearRampToValueAtTime(0.16, atTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, atTime + 0.55);

    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(2360, atTime);
    harmGain.gain.setValueAtTime(0.045, atTime);
    harmGain.gain.exponentialRampToValueAtTime(0.001, atTime + 0.25);

    osc.connect(gain);
    harmonic.connect(harmGain);
    gain.connect(destination);
    harmGain.connect(destination);

    osc.start(atTime);
    harmonic.start(atTime);
    osc.stop(atTime + 0.58);
    harmonic.stop(atTime + 0.28);
    return;
  }

  if (type === 'em_pulse') {
    const carrier = audioCtx.createOscillator();
    const mod = audioCtx.createOscillator();
    const modGain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(220, atTime);
    carrier.frequency.exponentialRampToValueAtTime(940, atTime + 0.14);
    carrier.frequency.exponentialRampToValueAtTime(160, atTime + 0.34);

    mod.type = 'sine';
    mod.frequency.setValueAtTime(42, atTime);
    modGain.gain.setValueAtTime(95, atTime);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1250, atTime);
    filter.Q.value = 3.2;

    gain.gain.setValueAtTime(0.001, atTime);
    gain.gain.linearRampToValueAtTime(0.18, atTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, atTime + 0.36);

    carrier.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    carrier.start(atTime);
    mod.start(atTime);
    carrier.stop(atTime + 0.38);
    mod.stop(atTime + 0.38);
    return;
  }

  // 'bass_impact': golpe cinematográfico grave sub-bass + transiente sutil
  const sub = audioCtx.createOscillator();
  const subGain = audioCtx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(125, atTime);
  sub.frequency.exponentialRampToValueAtTime(36, atTime + 0.32);
  subGain.gain.setValueAtTime(0.001, atTime);
  subGain.gain.linearRampToValueAtTime(0.28, atTime + 0.012);
  subGain.gain.exponentialRampToValueAtTime(0.001, atTime + 0.36);
  sub.connect(subGain);
  subGain.connect(destination);
  sub.start(atTime);
  sub.stop(atTime + 0.38);
}

let lastKeywordSfxAt = 0;

export function playLiveKeywordSfx(type: KeywordSfxKind): void {
  if (typeof window === 'undefined') return;
  const nowMs = performance.now();
  if (nowMs - lastKeywordSfxAt < 240) return;
  lastKeywordSfxAt = nowMs;

  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  try {
    if (!liveSfxCtx || liveSfxCtx.state === 'closed') {
      liveSfxCtx = new Ctor();
    }
    if (liveSfxCtx.state === 'suspended') {
      void liveSfxCtx.resume().catch(() => {});
    }
    scheduleKeywordSfx({
      audioCtx: liveSfxCtx,
      destination: liveSfxCtx.destination,
      atTime: liveSfxCtx.currentTime,
      type,
    });
  } catch {
    // Silencioso
  }
}

/**
 * Foley Atmosférico Procedural sincronizado con cada corte de micro-escena:
 * - Estática de radio / telemetría en escenas de señales, códigos o ciencia
 * - Pulso de sonar abisal / cósmico en océano profundo o espacio
 * - Whoosh cinematográfico en cortes de cámara rápidos (Whip-Zoom)
 * - Golpe grave Sub-Bass (boom) en clímax, giros 30s o tensión máxima
 */
export function scheduleContextualSceneFoley(options: {
  audioCtx: BaseAudioContext;
  destination: AudioNode;
  atTime: number;
  scene: ScriptScene;
  sceneIndex: number;
}): void {
  const { audioCtx, destination, atTime, scene, sceneIndex } = options;
  const text = `${scene.narracion} ${scene.disenoSonoro ?? ''} ${scene.fase ?? ''}`.toLowerCase();
  const env = scene.visualSpec?.environment;
  const palette = scene.visualSpec?.moodPalette;

  const isClimax =
    scene.esGiro30s ||
    /cl[ií]max|giro|gancho|impacto|implosi|detona|hel[oó]|6equj5|wow/.test(text) ||
    palette === 'crimson_pulse' ||
    palette === 'alert_stress';

  const isRadioOrTech =
    env === 'tech_studio' ||
    /radio|est[aá]tica|frecuencia|banda|osciloscopio|pulso|se[ñn]al|impresora|6equj5/.test(text);

  const isSonarEnv =
    env === 'ocean_deep' ||
    env === 'space_cosmos' ||
    /sonar|abisal|submar|sagitario|big ear|telescop|vac[ií]o|silencio/.test(text);

  // 1) Whoosh cinematográfico base en cada corte (excepto beat 0)
  if (sceneIndex > 0) {
    scheduleWhipCutSfx({ audioCtx, destination, atTime });
    if (sceneIndex % 3 === 0) {
      scheduleTransitionSfx({ audioCtx, destination, atTime, type: 'whoosh' });
    }
  }

  // 2) Golpe grave Sub-Bass en clímax, gancho inicial o giros de retención
  if (isClimax || sceneIndex === 0) {
    const sub = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(112, atTime);
    sub.frequency.exponentialRampToValueAtTime(32, atTime + 0.42);
    subGain.gain.setValueAtTime(0.001, atTime);
    subGain.gain.linearRampToValueAtTime(scene.esGiro30s ? 0.3 : 0.22, atTime + 0.015);
    subGain.gain.exponentialRampToValueAtTime(0.001, atTime + 0.46);
    sub.connect(subGain);
    subGain.connect(destination);
    sub.start(atTime);
    sub.stop(atTime + 0.48);
  }

  // 3) Estática de radio filtrada (burst corto de 180ms muy orgánico)
  if (isRadioOrTech) {
    const dur = 0.19;
    const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const staticBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const ch = staticBuf.getChannelData(0);
    const rng = mulberry32(deriveBeatSeed(350377, sceneIndex + Math.round(atTime * 100), PRNG_CHANNEL.AUDIO_FOLEY));
    for (let i = 0; i < len; i++) {
      const envShape = Math.sin((i / len) * Math.PI);
      const crackle = rng() > 0.86 ? (rng() * 2 - 1) * 0.45 : (rng() * 2 - 1) * 0.14;
      ch[i] = crackle * envShape;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = staticBuf;

    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, atTime);
    bp.frequency.exponentialRampToValueAtTime(1400, atTime + dur);
    bp.Q.value = 2.8;

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.11, atTime);
    g.gain.exponentialRampToValueAtTime(0.001, atTime + dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(destination);
    src.start(atTime);
    src.stop(atTime + dur + 0.02);
  } else if (isSonarEnv && sceneIndex % 2 === 0) {
    // 4) Pulso de sonar atmosférico en cortes pares de océano/espacio
    scheduleKeywordSfx({
      audioCtx,
      destination,
      atTime: atTime + 0.03,
      type: 'sonar',
    });
  }
}

/**
 * Sintetiza los 8 FoleyCueType del Director Cinematográfico (Módulo 2) de forma 100% determinista
 * mediante Web Audio API + Mulberry32 (cero archivos externos, cero Math.random).
 */
export function scheduleBeatFoleyCue(options: {
  audioCtx: BaseAudioContext;
  destination: AudioNode;
  atTime: number;
  cue: FoleyCueType;
  seed?: number;
}): void {
  const { audioCtx, destination, atTime, cue, seed = 42 } = options;
  if (!cue || cue === 'none') return;
  const safeAt = Math.max(0, atTime);

  if (cue === 'whoosh_cut') {
    scheduleTransitionSfx({ audioCtx, destination, atTime: safeAt, type: 'whoosh' });
    return;
  }

  if (cue === 'sub_drop') {
    const sub = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(118, safeAt);
    sub.frequency.exponentialRampToValueAtTime(30, safeAt + 0.48);
    gain.gain.setValueAtTime(0.001, safeAt);
    gain.gain.linearRampToValueAtTime(0.32, safeAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, safeAt + 0.54);
    sub.connect(gain);
    gain.connect(destination);
    sub.start(safeAt);
    sub.stop(safeAt + 0.56);
    return;
  }

  if (cue === 'riser_tension') {
    const dur = 0.62;
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, safeAt);
    osc.frequency.exponentialRampToValueAtTime(420, safeAt + dur);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(240, safeAt);
    filter.frequency.exponentialRampToValueAtTime(1850, safeAt + dur);
    filter.Q.value = 2.4;
    gain.gain.setValueAtTime(0.001, safeAt);
    gain.gain.exponentialRampToValueAtTime(0.16, safeAt + dur * 0.88);
    gain.gain.exponentialRampToValueAtTime(0.001, safeAt + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    osc.start(safeAt);
    osc.stop(safeAt + dur + 0.02);
    return;
  }

  if (cue === 'hud_click') {
    // Doble micro-click táctil de telemetría digital (45ms)
    const freqs = [1680, 2420];
    freqs.forEach((f, idx) => {
      const t0 = safeAt + idx * 0.042;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t0);
      osc.frequency.exponentialRampToValueAtTime(f * 0.68, t0 + 0.032);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(idx === 0 ? 0.12 : 0.09, t0 + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.036);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(t0);
      osc.stop(t0 + 0.04);
    });
    return;
  }

  if (cue === 'heartbeat') {
    // Doble latido grave lub-dub (0ms y +190ms)
    const beats = [
      { offset: 0, startFreq: 78, endFreq: 38, peak: 0.28 },
      { offset: 0.19, startFreq: 68, endFreq: 34, peak: 0.21 },
    ];
    beats.forEach((b) => {
      const t0 = safeAt + b.offset;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(b.startFreq, t0);
      osc.frequency.exponentialRampToValueAtTime(b.endFreq, t0 + 0.16);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(b.peak, t0 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    });
    return;
  }

  if (cue === 'thunder_impact') {
    // Sub-golpe + cola de ruido grave filtrado paso-bajo
    const sub = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(145, safeAt);
    sub.frequency.exponentialRampToValueAtTime(28, safeAt + 0.55);
    subGain.gain.setValueAtTime(0.001, safeAt);
    subGain.gain.linearRampToValueAtTime(0.32, safeAt + 0.012);
    subGain.gain.exponentialRampToValueAtTime(0.001, safeAt + 0.62);
    sub.connect(subGain);
    subGain.connect(destination);
    sub.start(safeAt);
    sub.stop(safeAt + 0.64);

    const dur = 0.58;
    const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    const rng = mulberry32(deriveBeatSeed(seed, Math.round(safeAt * 1000), PRNG_CHANNEL.AUDIO_FOLEY));
    for (let i = 0; i < len; i++) {
      const decay = Math.exp(-(i / len) * 3.2);
      ch[i] = (rng() * 2 - 1) * decay * 0.45;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuf;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(680, safeAt);
    lp.frequency.exponentialRampToValueAtTime(160, safeAt + dur);
    const nGain = audioCtx.createGain();
    nGain.gain.setValueAtTime(0.24, safeAt);
    nGain.gain.exponentialRampToValueAtTime(0.001, safeAt + dur);
    noise.connect(lp);
    lp.connect(nGain);
    nGain.connect(destination);
    noise.start(safeAt);
    noise.stop(safeAt + dur + 0.02);
    return;
  }

  if (cue === 'analog_glitch') {
    // Ráfaga corta de interferencia analógica cuantizada (160ms)
    const dur = 0.16;
    const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const ch = buf.getChannelData(0);
    const rng = mulberry32(deriveBeatSeed(seed ^ 0x51a3, Math.round(safeAt * 1000), PRNG_CHANNEL.AUDIO_FOLEY));
    let held = 0;
    for (let i = 0; i < len; i++) {
      if (i % 14 === 0) {
        held = rng() > 0.35 ? (rng() * 2 - 1) * 0.5 : 0;
      }
      const gate = Math.sin((i / len) * Math.PI);
      ch[i] = held * gate;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2100, safeAt);
    bp.frequency.exponentialRampToValueAtTime(980, safeAt + dur);
    bp.Q.value = 3.0;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.16, safeAt);
    g.gain.exponentialRampToValueAtTime(0.001, safeAt + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(destination);
    src.start(safeAt);
    src.stop(safeAt + dur + 0.02);
  }
}




