/**
 * Bus de Mezcla de Estudio a 48 kHz Estéreo para Gortex:
 * - Conecta voz narrada, efectos de sonido (SFX) y música ambiental a un
 *   DynamicsCompressorNode (limitador suave a -1 dBFS para evitar clipping/distorsión).
 * - Enruta idénticamente a audioCtx.destination (escucha en vivo) y/o a
 *   MediaStreamAudioDestinationNode (grabación/exportación de video).
 */

import { DEFAULT_SFX_VOLUME_DB, sfxVolumeDbToGain } from './proceduralFoleyEngine';

export const STUDIO_SAMPLE_RATE = 48_000;

export interface StudioAudioGraph {
  audioCtx: AudioContext;
  voiceBus: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  masterLimiter: DynamicsCompressorNode;
  masterGain: GainNode;
  mediaDest: MediaStreamAudioDestinationNode | null;
  dispose: () => Promise<void>;
}

export function createStudioAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    throw new Error('Tu navegador no soporta Web Audio API.');
  }
  try {
    return new Ctor({ sampleRate: STUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
  } catch {
    return new Ctor();
  }
}

export function createStudioAudioGraph(options?: {
  audioCtx?: AudioContext;
  connectToSpeakers?: boolean;
  createMediaDestination?: boolean;
  musicGainValue?: number;
  sfxGainValue?: number;
}): StudioAudioGraph {
  const ownsContext = !options?.audioCtx;
  const audioCtx = options?.audioCtx ?? createStudioAudioContext();

  const voiceBus = audioCtx.createGain();
  voiceBus.gain.value = 1.05;

  const sfxBus = audioCtx.createGain();
  sfxBus.gain.value = options?.sfxGainValue ?? sfxVolumeDbToGain(DEFAULT_SFX_VOLUME_DB);

  const musicBus = audioCtx.createGain();
  musicBus.gain.value = options?.musicGainValue ?? 1.0;

  // Limitador suave de estudio a -1.0 dBFS para prevenir saturación/clipping en mezclas densas
  const masterLimiter = audioCtx.createDynamicsCompressor();
  masterLimiter.threshold.value = -1.0;
  masterLimiter.knee.value = 6.0;
  masterLimiter.ratio.value = 12.0;
  masterLimiter.attack.value = 0.003;
  masterLimiter.release.value = 0.12;

  const masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.96;

  voiceBus.connect(masterLimiter);
  sfxBus.connect(masterLimiter);
  musicBus.connect(masterLimiter);
  masterLimiter.connect(masterGain);

  if (options?.connectToSpeakers) {
    masterGain.connect(audioCtx.destination);
  }

  let mediaDest: MediaStreamAudioDestinationNode | null = null;
  if (options?.createMediaDestination) {
    mediaDest = audioCtx.createMediaStreamDestination();
    // Asegurar 2 canales estéreo en el destino de grabación
    try {
      mediaDest.channelCount = 2;
      mediaDest.channelCountMode = 'explicit';
    } catch {
      // Algunos navegadores fijan 2 canales por defecto
    }
    masterGain.connect(mediaDest);
  }

  return {
    audioCtx,
    voiceBus,
    sfxBus,
    musicBus,
    masterLimiter,
    masterGain,
    mediaDest,
    dispose: async () => {
      try {
        voiceBus.disconnect();
        sfxBus.disconnect();
        musicBus.disconnect();
        masterLimiter.disconnect();
        masterGain.disconnect();
      } catch {
        // Silencioso
      }
      if (ownsContext && audioCtx.state !== 'closed') {
        await audioCtx.close().catch(() => {});
      }
    },
  };
}

/**
 * Codifica cualquier AudioBuffer en un archivo WAV PCM 16-bit válido (data:audio/wav;base64,...)
 * para guardarlo en IndexedDB y reproducirlo/exportarlo de forma determinista.
 */
export function audioBufferToWavDataUrl(buffer: AudioBuffer): string {
  const numChannels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}
