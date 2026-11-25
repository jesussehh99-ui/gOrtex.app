let sharedAudioCtx: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let activeFallbackAudio: HTMLAudioElement | null = null;
let activeBlobUrl: string | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new Ctor();
  }
  return sharedAudioCtx;
}

/**
 * Call synchronously inside a click/tap handler BEFORE any async work.
 * Unlocks browser audio playback on Safari, iOS, Chrome, and embedded iframes.
 */
export function unlockAudioPlayback(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {
      // Silencioso
    });
  }
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Silencioso
  }
}

let activeUtterance: SpeechSynthesisUtterance | null = null;

export function isBrowserTtsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

export function stopBrowserTts(): void {
  if (!isBrowserTtsSupported()) return;
  try {
    if (activeUtterance) {
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
      activeUtterance = null;
    }
    window.speechSynthesis.cancel();
  } catch {
    // Silencioso
  }
}

export function stopCurrentAudio(): void {
  stopBrowserTts();
  if (activeSource) {
    try {
      activeSource.onended = null;
      activeSource.stop();
      activeSource.disconnect();
    } catch {
      // Ya detenido
    }
    activeSource = null;
  }
  if (activeFallbackAudio) {
    try {
      activeFallbackAudio.pause();
      activeFallbackAudio.currentTime = 0;
    } catch {
      // Silencioso
    }
    activeFallbackAudio = null;
  }
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = null;
  }
}

async function loadBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isBrowserTtsSupported()) return [];
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return existing;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener?.('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener?.('voiceschanged', finish);
    window.setTimeout(finish, 300);
  });
}

/**
 * Selecciona la mejor voz natural disponible en español (Google Español, Microsoft Helena,
 * Sabina, Pablo, Dalia, Jorge, Paulina, Mónica, etc.) adaptada a cada personaje:
 * Lucía (Kore), Mateo (Puck), Sofía (Zephyr), Diego (Charon) y Bruno (Fenrir).
 */
function pickBestBrowserVoice(
  voices: SpeechSynthesisVoice[],
  language: 'es' | 'en' | 'pt',
  voiceName?: string
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const langMatches = voices.filter((v) => v.lang.toLowerCase().startsWith(language));
  const pool = langMatches.length > 0 ? langMatches : voices;

  const rankedByProfileEs: Record<string, string[]> = {
    // Lucía · Natural cotidiana (femenina expresiva)
    Kore: [
      'google español',
      'microsoft helena',
      'microsoft dalia',
      'microsoft sabina',
      'microsoft elvira',
      'paulina',
      'monica',
      'mónica',
      'lucia',
      'lucía',
      'laura',
      'elena',
      'paloma',
      'female',
    ],
    // Sofía · Cálida familiar (femenina dulce)
    Zephyr: [
      'microsoft sabina',
      'microsoft helena',
      'paulina',
      'microsoft dalia',
      'google español',
      'laura',
      'sofia',
      'sofía',
      'monica',
      'mónica',
      'elvira',
      'female',
    ],
    // Mateo · Amigo espontáneo (masculina joven/ágil)
    Puck: [
      'microsoft pablo',
      'microsoft jorge',
      'microsoft alvaro',
      'microsoft raul',
      'google español de estados unidos',
      'jorge',
      'diego',
      'pablo',
      'carlos',
      'alvaro',
      'álvaro',
      'juan',
      'google español',
      'male',
    ],
    // Diego · Sereno y real (masculina pausada/grave)
    Charon: [
      'microsoft pablo',
      'microsoft raul',
      'microsoft alvaro',
      'microsoft jorge',
      'diego',
      'jorge',
      'pablo',
      'raul',
      'raúl',
      'carlos',
      'tomas',
      'tomás',
      'google español',
      'male',
    ],
    // Bruno · Ágil conversacional (masculina energética)
    Fenrir: [
      'microsoft jorge',
      'microsoft pablo',
      'microsoft tomas',
      'google español de estados unidos',
      'jorge',
      'carlos',
      'pablo',
      'diego',
      'alvaro',
      'google español',
      'male',
    ],
  };

  const rankedByProfileEn: Record<string, string[]> = {
    Kore: ['microsoft aria', 'microsoft jenny', 'google us english', 'samantha', 'karen', 'female'],
    Zephyr: ['microsoft jenny', 'microsoft aria', 'samantha', 'google uk english female', 'female'],
    Puck: ['microsoft guy', 'microsoft christopher', 'google uk english male', 'alex', 'daniel', 'male'],
    Charon: ['microsoft davis', 'microsoft guy', 'google uk english male', 'daniel', 'david', 'male'],
    Fenrir: ['microsoft guy', 'microsoft davis', 'google us english', 'alex', 'daniel', 'male'],
  };

  const rankedMap = language === 'en' ? rankedByProfileEn : rankedByProfileEs;
  const priorities = (voiceName && rankedMap[voiceName]) || rankedMap.Kore;

  // 1) Coincidencia exacta por orden de prioridad (preferir Online/Natural/Google primero)
  for (const hint of priorities) {
    const exactNatural = pool.find((v) => {
      const lower = v.name.toLowerCase();
      return (
        lower.includes(hint) &&
        (lower.includes('natural') || lower.includes('neural') || lower.includes('online') || lower.includes('google'))
      );
    });
    if (exactNatural) return exactNatural;

    const match = pool.find((v) => v.name.toLowerCase().includes(hint));
    if (match) return match;
  }

  // 2) Cualquier voz natural/Google en el idioma
  const anyNatural = pool.find((v) => {
    const lower = v.name.toLowerCase();
    return lower.includes('google') || lower.includes('natural') || lower.includes('neural') || lower.includes('microsoft');
  });
  return anyNatural ?? pool[0] ?? null;
}

export async function speakWithBrowserTts(
  text: string,
  options?: {
    voiceName?: string;
    language?: 'es' | 'en' | 'pt';
    rate?: number;
    onBoundary?: (charIndex: number) => void;
    onMeasuredDuration?: (durationSec: number) => void;
    onEnded?: () => void;
  }
): Promise<void> {
  if (!isBrowserTtsSupported() || !text.trim()) {
    options?.onEnded?.();
    return;
  }

  stopCurrentAudio();

  try {
    const language = options?.language ?? 'es';
    const voices = await loadBrowserVoices();
    const chosenVoice = pickBestBrowserVoice(voices, language, options?.voiceName);

    const profileTuning: Record<string, { pitch: number; rateMult: number }> = {
      Kore: { pitch: 1.05, rateMult: 1.02 }, // Lucía
      Zephyr: { pitch: 1.12, rateMult: 0.95 }, // Sofía
      Puck: { pitch: 0.96, rateMult: 1.08 }, // Mateo
      Charon: { pitch: 0.84, rateMult: 0.94 }, // Diego
      Fenrir: { pitch: 0.9, rateMult: 1.1 }, // Bruno
    };
    const tuning = (options?.voiceName && profileTuning[options.voiceName]) || {
      pitch: 1.0,
      rateMult: 1.0,
    };

    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = language === 'en' ? 'en-US' : language === 'pt' ? 'pt-BR' : 'es-MX';
    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang || utterance.lang;
    }
    utterance.pitch = tuning.pitch;
    const effectiveRate = Math.min(1.6, Math.max(0.75, (options?.rate ?? 1) * tuning.rateMult));
    utterance.rate = effectiveRate;

    activeUtterance = utterance;
    let startedAtMs = 0;

    utterance.onstart = () => {
      startedAtMs = performance.now();
    };
    utterance.onboundary = (ev) => {
      if (activeUtterance !== utterance) return;
      if (typeof ev.charIndex === 'number' && ev.charIndex >= 0) {
        options?.onBoundary?.(ev.charIndex);
      }
    };
    utterance.onend = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
      }
      if (startedAtMs > 0) {
        const realElapsedSec = ((performance.now() - startedAtMs) / 1000) * (options?.rate ?? 1);
        if (realElapsedSec >= 0.8) {
          options?.onMeasuredDuration?.(Number(realElapsedSec.toFixed(2)));
        }
      }
      options?.onEnded?.();
    };
    utterance.onerror = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
      }
      options?.onEnded?.();
    };

    window.speechSynthesis.speak(utterance);
  } catch {
    // 100% silencioso en errores
    options?.onEnded?.();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('No se pudo leer el archivo de audio.'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo de audio.'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToUint8Array(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Formato de audio inválido.');
  }
  const mime = match[1] || 'audio/mpeg';
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, mime };
}

export async function playAudioDataUrl(
  dataUrl: string,
  options?: { playbackRate?: number; onEnded?: () => void }
): Promise<void> {
  stopCurrentAudio();
  const rate = options?.playbackRate ?? 1;
  const ctx = getAudioContext();

  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const { bytes } = dataUrlToUint8Array(dataUrl);
      const copyBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      const decoded = await ctx.decodeAudioData(copyBuffer);
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.value = rate;
      source.connect(ctx.destination);
      source.onended = () => {
        if (activeSource === source) {
          activeSource = null;
        }
        options?.onEnded?.();
      };
      activeSource = source;
      source.start(0);
      return;
    } catch {
      // Intentar respaldo mediante Blob + HTMLAudioElement
    }
  }

  const { bytes, mime } = dataUrlToUint8Array(dataUrl);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
  const blobUrl = URL.createObjectURL(blob);
  activeBlobUrl = blobUrl;

  const audio = new Audio(blobUrl);
  audio.playbackRate = rate;
  audio.onended = () => {
    if (activeFallbackAudio === audio) {
      activeFallbackAudio = null;
    }
    options?.onEnded?.();
  };
  activeFallbackAudio = audio;
  await audio.play();
}

/**
 * Calcula la duración exacta en segundos de un audio WAV/MP3/WebM/base64.
 */
export async function getAudioDurationSec(dataUrl: string): Promise<number | null> {
  try {
    const { bytes } = dataUrlToUint8Array(dataUrl);
    if (
      bytes.length >= 44 &&
      bytes[0] === 0x52 && // R
      bytes[1] === 0x49 && // I
      bytes[2] === 0x46 && // F
      bytes[3] === 0x46 // F
    ) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const byteRate = view.getUint32(28, true);
      if (byteRate > 0) {
        let offset = 12;
        while (offset + 8 <= bytes.length) {
          const id =
            String.fromCharCode(bytes[offset]) +
            String.fromCharCode(bytes[offset + 1]) +
            String.fromCharCode(bytes[offset + 2]) +
            String.fromCharCode(bytes[offset + 3]);
          const chunkSize = view.getUint32(offset + 4, true);
          if (id === 'data' && chunkSize > 0) {
            return Number((chunkSize / byteRate).toFixed(2));
          }
          offset += 8 + chunkSize;
        }
        return Number(((bytes.length - 44) / byteRate).toFixed(2));
      }
    }

    const ctx = getAudioContext();
    if (!ctx) return null;
    const copyBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const decoded = await ctx.decodeAudioData(copyBuffer);
    return Number(decoded.duration.toFixed(2));
  } catch {
    return null;
  }
}
