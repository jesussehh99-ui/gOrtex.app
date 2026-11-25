import { STUDIO_SAMPLE_RATE } from './studioAudioMixer';

export interface ExportCapabilities {
  canNativeMp4: boolean;
  hasWebCodecsVideo: boolean;
  hasWebCodecsAudio: boolean;
  hasOpfs: boolean;
  hasOffscreenCanvas: boolean;
  evenWidth: number;
  evenHeight: number;
  videoConfig: VideoEncoderConfig | null;
  audioConfig: AudioEncoderConfig | null;
  audioCodecMode: 'aac' | 'opus' | 'fallback';
  fallbackReason?: string;
}

const H264_CODEC_CANDIDATES = [
  'avc1.640028', // High Profile Level 4.0 (preferido: máxima calidad y compatibilidad)
  'avc1.4d002a', // Main Profile Level 4.2
  'avc1.42001f', // Baseline Level 3.1 (fallback universal exigido)
  'avc1.42E01E', // Constrained Baseline Level 3.0
];

/**
 * Garantiza dimensiones pares obligatorias para codificadores H.264 YUV 4:2:0.
 */
export function ensureEvenDimensions(
  width: number,
  height: number
): { width: number; height: number } {
  const evenW = Math.max(2, Math.floor(width / 2) * 2);
  const evenH = Math.max(2, Math.floor(height / 2) * 2);
  return { width: evenW, height: evenH };
}

/**
 * CapabilityDetector: Valida de forma segura el soporte real del navegador para
 * WebCodecs (H.264 + AAC 48kHz/128kbps), Opus, OPFS y OffscreenCanvas.
 */
export class CapabilityDetector {
  public static async detectVideoConfig(
    width: number,
    height: number,
    fps = 30,
    bitrate = 4_500_000
  ): Promise<VideoEncoderConfig | null> {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      return null;
    }
    const { width: evenW, height: evenH } = ensureEvenDimensions(width, height);

    for (const codec of H264_CODEC_CANDIDATES) {
      const candidate: VideoEncoderConfig = {
        codec,
        width: evenW,
        height: evenH,
        bitrate,
        framerate: fps,
        avc: { format: 'avc' },
      };
      try {
        const support = await VideoEncoder.isConfigSupported(candidate);
        if (support.supported) {
          return support.config ?? candidate;
        }
      } catch {
        // Probar siguiente perfil H.264
      }
    }
    return null;
  }

  public static async detectAudioConfig(): Promise<{
    config: AudioEncoderConfig | null;
    mode: 'aac' | 'opus' | 'fallback';
  }> {
    if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
      return { config: null, mode: 'fallback' };
    }

    // Prioridad 1: AAC-LC universal 48 kHz Estéreo @ 128 kbps (estándar TikTok/Shorts/Reels/iOS)
    const aacCandidates: AudioEncoderConfig[] = [
      {
        codec: 'mp4a.40.2',
        sampleRate: STUDIO_SAMPLE_RATE,
        numberOfChannels: 2,
        bitrate: 128_000,
      },
      {
        codec: 'mp4a.40.2',
        sampleRate: STUDIO_SAMPLE_RATE,
        numberOfChannels: 2,
        bitrate: 192_000,
      },
    ];

    for (const cfg of aacCandidates) {
      try {
        const support = await AudioEncoder.isConfigSupported(cfg);
        if (support.supported) {
          return { config: support.config ?? cfg, mode: 'aac' };
        }
      } catch {
        // Continuar al siguiente candidato
      }
    }

    // Prioridad 2 (Linux/Firefox sin AAC en WebCodecs): Opus 48 kHz Estéreo @ 128 kbps dentro de MP4
    const opusCandidate: AudioEncoderConfig = {
      codec: 'opus',
      sampleRate: STUDIO_SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: 128_000,
    };
    try {
      const support = await AudioEncoder.isConfigSupported(opusCandidate);
      if (support.supported) {
        return { config: support.config ?? opusCandidate, mode: 'opus' };
      }
    } catch {
      // Caer a fallback controlado
    }

    return { config: null, mode: 'fallback' };
  }

  public static async detect(
    width: number,
    height: number,
    fps = 30
  ): Promise<ExportCapabilities> {
    const { width: evenWidth, height: evenHeight } = ensureEvenDimensions(width, height);
    const hasOpfs =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.storage) &&
      typeof navigator.storage.getDirectory === 'function';
    const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

    const [videoConfig, audioProbe] = await Promise.all([
      CapabilityDetector.detectVideoConfig(evenWidth, evenHeight, fps),
      CapabilityDetector.detectAudioConfig(),
    ]);

    const hasWebCodecsVideo = Boolean(videoConfig);
    const hasWebCodecsAudio = Boolean(audioProbe.config);
    const canNativeMp4 = hasWebCodecsVideo && hasWebCodecsAudio;

    let fallbackReason: string | undefined;
    if (!hasWebCodecsVideo) {
      fallbackReason =
        'Este navegador no dispone de codificador H.264 en WebCodecs; usando exportación de respaldo compatible.';
    } else if (!hasWebCodecsAudio) {
      fallbackReason =
        'Codificación AAC/Opus de WebCodecs no disponible en este sistema; usando exportación de respaldo compatible.';
    } else if (audioProbe.mode === 'opus') {
      fallbackReason =
        'AAC no disponible en este navegador; empaquetando audio Opus 48 kHz de alta calidad en el MP4.';
    }

    return {
      canNativeMp4,
      hasWebCodecsVideo,
      hasWebCodecsAudio,
      hasOpfs,
      hasOffscreenCanvas,
      evenWidth,
      evenHeight,
      videoConfig,
      audioConfig: audioProbe.config,
      audioCodecMode: audioProbe.mode,
      fallbackReason,
    };
  }
}
