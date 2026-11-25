import type { HumanVoiceProfile, ScriptLanguage, VoiceName } from '../types';
import {
  audioBufferToWavDataUrl,
  createStudioAudioContext,
  createStudioAudioGraph,
  STUDIO_SAMPLE_RATE,
} from './studioAudioMixer';
import { estimateSpeechDurationSec } from './visualKeywords';

export interface UnifiedVoiceResult {
  buffer: AudioBuffer;
  durationSec: number;
  audioDataUrl: string;
  engine: 'studio_neural' | 'kokoro_wasm' | 'offline_synth' | 'cached_custom';
}

// Mapeo de perfiles de voz Gortex a voces neuronales Kokoro (WebAssembly/WebGPU) en español e inglés
export const KOKORO_VOICE_MAP: Record<
  VoiceName,
  { es: string; en: string; pt: string; basePitchHz: number }
> = {
  Kore: { es: 'ef_dora', en: 'af_bella', pt: 'pf_dora', basePitchHz: 215 }, // Lucía
  Zephyr: { es: 'ef_dora', en: 'af_heart', pt: 'pf_dora', basePitchHz: 235 }, // Sofía
  Puck: { es: 'em_alex', en: 'am_michael', pt: 'pm_alex', basePitchHz: 145 }, // Mateo
  Charon: { es: 'em_santa', en: 'am_adam', pt: 'pm_santa', basePitchHz: 112 }, // Diego
  Fenrir: { es: 'em_alex', en: 'am_fenrir', pt: 'pm_alex', basePitchHz: 132 }, // Bruno
};

let decodeAudioCtx: AudioContext | null = null;
const memoryBufferCache = new Map<string, UnifiedVoiceResult>();
const inFlightSynth = new Map<string, Promise<UnifiedVoiceResult>>();

let auditionGraph: ReturnType<typeof createStudioAudioGraph> | null = null;
let auditionSource: AudioBufferSourceNode | null = null;

function getSharedDecodeContext(): AudioContext {
  if (!decodeAudioCtx || decodeAudioCtx.state === 'closed') {
    decodeAudioCtx = createStudioAudioContext();
  }
  return decodeAudioCtx;
}

function hashText(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function buildVoiceCacheKey(
  text: string,
  voiceId: string,
  language: ScriptLanguage
): string {
  return `${voiceId}::${language}::${hashText(text.trim())}`;
}

export async function decodeDataUrlToStudioBuffer(
  dataUrl: string,
  targetCtx?: AudioContext
): Promise<AudioBuffer | null> {
  try {
    const ctx = targetCtx ?? getSharedDecodeContext();
    const res = await fetch(dataUrl);
    const arr = await res.arrayBuffer();
    if (arr.byteLength < 64) return null;
    return await ctx.decodeAudioData(arr.slice(0));
  } catch {
    return null;
  }
}

/**
 * Respaldo local 100% offline en AudioBuffer (48 kHz Estéreo) usando síntesis de formantes
 * silábicos suaves por personaje si la red o el motor neuronal fallan.
 * Garantiza cero silencio y duración exacta determinista incluso sin conexión.
 */
function buildOfflineFormantVoiceBuffer(
  ctx: BaseAudioContext,
  text: string,
  voiceName: VoiceName
): AudioBuffer {
  const sampleRate = ctx.sampleRate || STUDIO_SAMPLE_RATE;
  const durSec = Math.max(1.6, estimateSpeechDurationSec(text, 1));
  const totalSamples = Math.ceil(durSec * sampleRate);
  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const profile = KOKORO_VOICE_MAP[voiceName] ?? KOKORO_VOICE_MAP.Kore;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const totalWords = Math.max(1, words.length);
  const wordDur = durSec / totalWords;

  const vowelFormants: Array<[number, number]> = [
    [730, 1090], // a
    [530, 1840], // e
    [270, 2290], // i
    [570, 840], // o
    [300, 870], // u
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const wIdx = Math.min(totalWords - 1, Math.floor(t / wordDur));
    const localT = (t % wordDur) / Math.max(0.08, wordDur);
    const word = words[wIdx] || 'voz';
    const seed = word.charCodeAt(0) + wIdx * 17;
    const formant = vowelFormants[seed % vowelFormants.length];

    // Contorno silábico natural dentro de cada palabra
    const syllables = Math.max(1, Math.min(4, Math.ceil(word.length / 3)));
    const sylPhase = (localT * syllables) % 1;
    const sylEnv = Math.sin(sylPhase * Math.PI) * Math.min(1, localT * 7) * Math.min(1, (1 - localT) * 7);

    // Prosodia descendente al final de la frase
    const prosody = 1 + Math.sin(t * 2.6 + seed) * 0.06 - (t / durSec) * 0.08;
    const f0 = profile.basePitchHz * prosody;

    const carrier =
      Math.sin(2 * Math.PI * f0 * t) * 0.55 +
      Math.sin(2 * Math.PI * formant[0] * t) * 0.25 +
      Math.sin(2 * Math.PI * formant[1] * t) * 0.14;

    const sample = carrier * sylEnv * 0.26;
    left[i] = sample;
    right[i] = sample;
  }

  return buffer;
}

// Cargador opcional y perezoso de Kokoro-JS (WebAssembly / WebGPU en el cliente) como motor neuronal de respaldo
interface KokoroTtsInstance {
  generate: (
    text: string,
    opts: { voice: string }
  ) => Promise<{ audio: Float32Array; sampling_rate: number }>;
}

let kokoroInstancePromise: Promise<KokoroTtsInstance | null> | null = null;

async function trySynthesizeWithKokoroWasm(
  text: string,
  voiceName: VoiceName,
  language: ScriptLanguage,
  ctx: AudioContext
): Promise<AudioBuffer | null> {
  try {
    if (!kokoroInstancePromise) {
      kokoroInstancePromise = (async () => {
        try {
          const cdnUrl = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
          const mod = (await import(/* @vite-ignore */ cdnUrl)) as {
            KokoroTTS?: {
              from_pretrained: (
                id: string,
                opts: { dtype: string; device: string }
              ) => Promise<KokoroTtsInstance>;
            };
          };
          if (!mod?.KokoroTTS?.from_pretrained) return null;
          // Asegurar que @huggingface/transformers nunca busque /models/... en el servidor SPA local
          try {
            const tf = await import('@huggingface/transformers');
            if (tf?.env) {
              tf.env.allowLocalModels = false;
              tf.env.allowRemoteModels = true;
              tf.env.useBrowserCache = true;
            }
          } catch {
            // Silencioso
          }
          const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
          return await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
            dtype: 'q8',
            device: hasWebGpu ? 'webgpu' : 'wasm',
          });
        } catch {
          return null;
        }
      })();
    }

    const tts = await kokoroInstancePromise;
    if (!tts) return null;

    const map = KOKORO_VOICE_MAP[voiceName] ?? KOKORO_VOICE_MAP.Kore;
    const kokoroVoice = language === 'en' ? map.en : language === 'pt' ? map.pt : map.es;
    const out = await tts.generate(text.trim(), { voice: kokoroVoice });
    if (!out?.audio || out.audio.length === 0) return null;

    const sr = out.sampling_rate || 24000;
    const buf = ctx.createBuffer(2, out.audio.length, sr);
    buf.getChannelData(0).set(out.audio);
    buf.getChannelData(1).set(out.audio);
    return buf;
  } catch {
    return null;
  }
}

/**
 * Motor Unificado de Voz en AudioBuffer (mismo timbre, cadencia y duración exacta en
 * "Probar", vista previa 9:16 y exportación .MP4 final).
 */
export async function synthesizeUnifiedVoiceBuffer(options: {
  text: string;
  voice: HumanVoiceProfile;
  language?: ScriptLanguage;
  existingAudioDataUrl?: string;
  isCustomUserAudio?: boolean;
  preferKokoroWasm?: boolean;
}): Promise<UnifiedVoiceResult> {
  const {
    text,
    voice,
    language = 'es',
    existingAudioDataUrl,
    isCustomUserAudio = false,
  } = options;

  const ctx = getSharedDecodeContext();

  // 1) Si el usuario grabó micrófono o subió un .MP3/.WAV propio, usarlo tal cual
  if (isCustomUserAudio && existingAudioDataUrl) {
    const customBuf = await decodeDataUrlToStudioBuffer(existingAudioDataUrl, ctx);
    if (customBuf) {
      return {
        buffer: customBuf,
        durationSec: Number(customBuf.duration.toFixed(3)),
        audioDataUrl: existingAudioDataUrl,
        engine: 'cached_custom',
      };
    }
  }

  const cacheKey = buildVoiceCacheKey(text, voice.id, language);
  const memHit = memoryBufferCache.get(cacheKey);
  if (memHit) return memHit;

  // 2) Si ya está persistido en IndexedDB con el mismo perfil de voz, decodificar al instante
  if (existingAudioDataUrl) {
    const decoded = await decodeDataUrlToStudioBuffer(existingAudioDataUrl, ctx);
    if (decoded) {
      const result: UnifiedVoiceResult = {
        buffer: decoded,
        durationSec: Number(decoded.duration.toFixed(3)),
        audioDataUrl: existingAudioDataUrl,
        engine: 'studio_neural',
      };
      memoryBufferCache.set(cacheKey, result);
      return result;
    }
  }

  const existingPromise = inFlightSynth.get(cacheKey);
  if (existingPromise) return existingPromise;

  const task = (async (): Promise<UnifiedVoiceResult> => {
    try {
      // Motor neuronal 100% client-side: Kokoro WebAssembly/WebGPU
      const kokoroBuf = await trySynthesizeWithKokoroWasm(text, voice.voiceName, language, ctx);
      if (kokoroBuf) {
        const wavUrl = audioBufferToWavDataUrl(kokoroBuf);
        const result: UnifiedVoiceResult = {
          buffer: kokoroBuf,
          durationSec: Number(kokoroBuf.duration.toFixed(3)),
          audioDataUrl: wavUrl,
          engine: 'kokoro_wasm',
        };
        memoryBufferCache.set(cacheKey, result);
        return result;
      }

      // Respaldo 3 garantizado 100% offline: AudioBuffer local sintetizado en memoria
      const offlineBuf = buildOfflineFormantVoiceBuffer(ctx, text, voice.voiceName);
      const offlineWav = audioBufferToWavDataUrl(offlineBuf);
      const result: UnifiedVoiceResult = {
        buffer: offlineBuf,
        durationSec: Number(offlineBuf.duration.toFixed(3)),
        audioDataUrl: offlineWav,
        engine: 'offline_synth',
      };
      memoryBufferCache.set(cacheKey, result);
      return result;
    } finally {
      inFlightSynth.delete(cacheKey);
    }
  })();

  inFlightSynth.set(cacheKey, task);
  return task;
}

export function stopUnifiedVoiceAudition(): void {
  if (auditionSource) {
    try {
      auditionSource.onended = null;
      auditionSource.stop();
      auditionSource.disconnect();
    } catch {
      // Ya detenido
    }
    auditionSource = null;
  }
}

/**
 * Reproduce la muestra del botón "Probar" usando EXACTAMENTE el mismo AudioBuffer y
 * bus limitador a 48 kHz (-1 dBFS) que el video exportado final.
 */
export async function playUnifiedVoiceAudition(options: {
  text: string;
  voice: HumanVoiceProfile;
  language?: ScriptLanguage;
  onEnded?: () => void;
}): Promise<UnifiedVoiceResult> {
  stopUnifiedVoiceAudition();
  const result = await synthesizeUnifiedVoiceBuffer({
    text: options.text,
    voice: options.voice,
    language: options.language ?? 'es',
  });

  const ctx = getSharedDecodeContext();
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }

  if (!auditionGraph || auditionGraph.audioCtx !== ctx) {
    auditionGraph = createStudioAudioGraph({
      audioCtx: ctx,
      connectToSpeakers: true,
      createMediaDestination: false,
    });
  }

  const src = ctx.createBufferSource();
  src.buffer = result.buffer;
  src.connect(auditionGraph.voiceBus);
  src.onended = () => {
    if (auditionSource === src) {
      auditionSource = null;
    }
    options.onEnded?.();
  };
  auditionSource = src;
  src.start(0);
  return result;
}
