/**
 * Motor WSOLA (Waveform Similarity Overlap-Add) 100% TypeScript, costo $0 y cero dependencias.
 *
 * Permite acelerar o desacelerar la voz (`1x`, `1.15x`, `1.25x` o velocidades por beat)
 * preservando el pitch y los formantes naturales del hablante (elimina el efecto "voz de ardilla").
 *
 * - Usa ventana Hann con solapamiento del 50% (propiedad COLA exacta: suma de ganancia = 1.0).
 * - Busca el desplazamiento de correlación cruzada óptimo (±10 ms) en el canal guía y aplica
 *   el mismo desplazamiento a todos los canales para mantener coherencia estéreo perfecta.
 * - Ejecuta en un Web Worker inline cuando está disponible para no bloquear la UI, con fallback
 *   transparente en el hilo principal y caché WeakMap para reutilizar buffers entre preview y MP4.
 */

interface WsolaRawResult {
  channels: Float32Array[];
  sampleRate: number;
  length: number;
}

/**
 * Núcleo puro WSOLA sobre canales PCM Float32Array (ejecutable tanto en Worker como en main thread).
 */
export function timeStretchChannelsWsolaSync(
  channels: Float32Array[],
  sampleRate: number,
  rate: number
): WsolaRawResult {
  const numChannels = channels.length;
  const inputLen = channels[0]?.length ?? 0;

  if (numChannels === 0 || inputLen === 0 || !Number.isFinite(rate) || Math.abs(rate - 1.0) < 0.008) {
    return {
      channels: channels.map((ch) => new Float32Array(ch)),
      sampleRate,
      length: inputLen,
    };
  }

  const clampedRate = Math.max(0.5, Math.min(2.0, rate));
  // Ventana de 24 ms (número par de muestras para 50% COLA exacto con ventana Hann)
  let winSize = Math.round(sampleRate * 0.024);
  if (winSize % 2 !== 0) winSize += 1;
  winSize = Math.max(256, Math.min(2048, winSize));

  const halfWin = winSize >> 1; // Synthesis hop Hs (50% overlap)
  const searchDelta = Math.max(64, Math.round(sampleRate * 0.01)); // ±10 ms búsqueda de período pitch
  const corrStride = sampleRate >= 44100 ? 4 : 2; // Submuestreo ligero en correlación (4x más rápido, misma alineación de fase)

  const targetLen = Math.max(winSize, Math.round(inputLen / clampedRate));
  const outChannels = Array.from({ length: numChannels }, () => new Float32Array(targetLen));
  const normBuffer = new Float32Array(targetLen);

  // Ventana Hann simétrica
  const hann = new Float32Array(winSize);
  const twoPiOverN = (2 * Math.PI) / winSize;
  for (let i = 0; i < winSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos(twoPiOverN * i));
  }

  const guide = channels[0];

  // Primer bloque sin desplazamiento (ancla exacta en muestra 0)
  const firstCopy = Math.min(winSize, inputLen, targetLen);
  for (let i = 0; i < firstCopy; i++) {
    const w = hann[i];
    normBuffer[i] += w;
    for (let c = 0; c < numChannels; c++) {
      outChannels[c][i] += channels[c][i] * w;
    }
  }

  let prevAnalysisPos = 0;
  let synthPos = halfWin;

  while (synthPos < targetLen) {
    const nominalAnalysis = Math.round(synthPos * clampedRate);
    // Continuación natural de la fase desde el bloque previo
    const naturalRefPos = prevAnalysisPos + halfWin;

    let bestPos = Math.max(0, Math.min(inputLen - winSize, nominalAnalysis));

    if (naturalRefPos >= 0 && naturalRefPos + halfWin < inputLen) {
      const minCand = Math.max(0, nominalAnalysis - searchDelta);
      const maxCand = Math.min(inputLen - winSize, nominalAnalysis + searchDelta);

      if (maxCand > minCand) {
        let bestScore = -Infinity;
        let bestCand = bestPos;

        for (let cand = minCand; cand <= maxCand; cand += 2) {
          let cross = 0;
          let energyCand = 1e-9;
          for (let j = 0; j < halfWin; j += corrStride) {
            const refSample = guide[naturalRefPos + j];
            const candSample = guide[cand + j];
            cross += refSample * candSample;
            energyCand += candSample * candSample;
          }
          // Correlación normalizada para evitar sesgo hacia regiones más ruidosas
          const score = cross / Math.sqrt(energyCand);
          if (score > bestScore) {
            bestScore = score;
            bestCand = cand;
          }
        }
        bestPos = bestCand;
      }
    }

    const availIn = Math.max(0, inputLen - bestPos);
    const availOut = Math.max(0, targetLen - synthPos);
    const frameLen = Math.min(winSize, availIn, availOut);

    if (frameLen <= 0) break;

    for (let i = 0; i < frameLen; i++) {
      const w = hann[i];
      const outIdx = synthPos + i;
      const inIdx = bestPos + i;
      normBuffer[outIdx] += w;
      for (let c = 0; c < numChannels; c++) {
        outChannels[c][outIdx] += channels[c][inIdx] * w;
      }
    }

    prevAnalysisPos = bestPos;
    synthPos += halfWin;
  }

  // Normalizar bordes y aplicar limitación suave anti-clipping
  for (let i = 0; i < targetLen; i++) {
    const weight = normBuffer[i];
    const inv = weight > 1e-4 ? 1 / weight : 1;
    for (let c = 0; c < numChannels; c++) {
      const val = outChannels[c][i] * inv;
      outChannels[c][i] = val > 0.99 ? 0.99 : val < -0.99 ? -0.99 : val;
    }
  }

  return {
    channels: outChannels,
    sampleRate,
    length: targetLen,
  };
}

// Worker inline reutilizable para procesar WSOLA fuera del hilo principal sin dependencias externas
const WSOLA_WORKER_SOURCE = `
self.onmessage = function(ev) {
  const { id, channels, sampleRate, rate } = ev.data;
  try {
    const numChannels = channels.length;
    const inputLen = channels[0] ? channels[0].length : 0;
    if (numChannels === 0 || inputLen === 0 || Math.abs(rate - 1.0) < 0.008) {
      self.postMessage({ id, channels, sampleRate, length: inputLen });
      return;
    }
    const clampedRate = Math.max(0.5, Math.min(2.0, rate));
    let winSize = Math.round(sampleRate * 0.024);
    if (winSize % 2 !== 0) winSize += 1;
    winSize = Math.max(256, Math.min(2048, winSize));
    const halfWin = winSize >> 1;
    const searchDelta = Math.max(64, Math.round(sampleRate * 0.01));
    const corrStride = sampleRate >= 44100 ? 4 : 2;
    const targetLen = Math.max(winSize, Math.round(inputLen / clampedRate));

    const outChannels = [];
    for (let c = 0; c < numChannels; c++) {
      outChannels.push(new Float32Array(targetLen));
    }
    const normBuffer = new Float32Array(targetLen);
    const hann = new Float32Array(winSize);
    const twoPiOverN = (2 * Math.PI) / winSize;
    for (let i = 0; i < winSize; i++) {
      hann[i] = 0.5 * (1 - Math.cos(twoPiOverN * i));
    }

    const guide = channels[0];
    const firstCopy = Math.min(winSize, inputLen, targetLen);
    for (let i = 0; i < firstCopy; i++) {
      const w = hann[i];
      normBuffer[i] += w;
      for (let c = 0; c < numChannels; c++) {
        outChannels[c][i] += channels[c][i] * w;
      }
    }

    let prevAnalysisPos = 0;
    let synthPos = halfWin;
    while (synthPos < targetLen) {
      const nominalAnalysis = Math.round(synthPos * clampedRate);
      const naturalRefPos = prevAnalysisPos + halfWin;
      let bestPos = Math.max(0, Math.min(inputLen - winSize, nominalAnalysis));

      if (naturalRefPos >= 0 && naturalRefPos + halfWin < inputLen) {
        const minCand = Math.max(0, nominalAnalysis - searchDelta);
        const maxCand = Math.min(inputLen - winSize, nominalAnalysis + searchDelta);
        if (maxCand > minCand) {
          let bestScore = -Infinity;
          let bestCand = bestPos;
          for (let cand = minCand; cand <= maxCand; cand += 2) {
            let cross = 0;
            let energyCand = 1e-9;
            for (let j = 0; j < halfWin; j += corrStride) {
              const refSample = guide[naturalRefPos + j];
              const candSample = guide[cand + j];
              cross += refSample * candSample;
              energyCand += candSample * candSample;
            }
            const score = cross / Math.sqrt(energyCand);
            if (score > bestScore) {
              bestScore = score;
              bestCand = cand;
            }
          }
          bestPos = bestCand;
        }
      }

      const availIn = Math.max(0, inputLen - bestPos);
      const availOut = Math.max(0, targetLen - synthPos);
      const frameLen = Math.min(winSize, availIn, availOut);
      if (frameLen <= 0) break;

      for (let i = 0; i < frameLen; i++) {
        const w = hann[i];
        const outIdx = synthPos + i;
        const inIdx = bestPos + i;
        normBuffer[outIdx] += w;
        for (let c = 0; c < numChannels; c++) {
          outChannels[c][outIdx] += channels[c][inIdx] * w;
        }
      }
      prevAnalysisPos = bestPos;
      synthPos += halfWin;
    }

    for (let i = 0; i < targetLen; i++) {
      const weight = normBuffer[i];
      const inv = weight > 1e-4 ? 1 / weight : 1;
      for (let c = 0; c < numChannels; c++) {
        const val = outChannels[c][i] * inv;
        outChannels[c][i] = val > 0.99 ? 0.99 : val < -0.99 ? -0.99 : val;
      }
    }

    const transferables = outChannels.map((c) => c.buffer);
    self.postMessage({ id, channels: outChannels, sampleRate, length: targetLen }, transferables);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
`;

let wsolaWorker: Worker | null = null;
let workerDisabled = false;
let nextWorkerReqId = 1;
const workerPending = new Map<
  number,
  { resolve: (res: WsolaRawResult) => void; reject: (err: Error) => void }
>();

function getWsolaWorker(): Worker | null {
  if (workerDisabled || typeof Worker === 'undefined' || typeof Blob === 'undefined') {
    return null;
  }
  if (wsolaWorker) return wsolaWorker;
  try {
    const blob = new Blob([WSOLA_WORKER_SOURCE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);

    worker.onmessage = (ev: MessageEvent) => {
      const { id, channels, sampleRate, length, error } = ev.data || {};
      const pending = workerPending.get(id);
      if (!pending) return;
      workerPending.delete(id);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve({ channels, sampleRate, length });
      }
    };
    worker.onerror = () => {
      workerDisabled = true;
      wsolaWorker = null;
      for (const [, p] of workerPending) {
        p.reject(new Error('WSOLA worker failed'));
      }
      workerPending.clear();
    };
    wsolaWorker = worker;
    return worker;
  } catch {
    workerDisabled = true;
    return null;
  }
}

// Caché WeakMap por AudioBuffer fuente -> Map<rateKey, AudioBuffer estirado>
const stretchedBufferCache = new WeakMap<AudioBuffer, Map<string, AudioBuffer>>();

function createAudioBufferFromChannels(
  channels: Float32Array[],
  sampleRate: number
): AudioBuffer {
  const len = Math.max(1, channels[0]?.length ?? 1);
  if (typeof AudioBuffer === 'function') {
    try {
      const buf = new AudioBuffer({
        length: len,
        numberOfChannels: channels.length,
        sampleRate,
      });
      for (let c = 0; c < channels.length; c++) {
        buf.copyToChannel(channels[c] as Float32Array<ArrayBuffer>, c);
      }
      return buf;
    } catch {
      // Fallback con OfflineAudioContext
    }
  }
  const tmpCtx = new OfflineAudioContext(channels.length, len, sampleRate);
  const buf = tmpCtx.createBuffer(channels.length, len, sampleRate);
  for (let c = 0; c < channels.length; c++) {
    buf.copyToChannel(channels[c] as Float32Array<ArrayBuffer>, c);
  }
  return buf;
}

/**
 * Estira temporalmente un `AudioBuffer` con algoritmo WSOLA preservando el pitch natural de la voz.
 * - Si `rate` es ~1.0, devuelve el buffer original sin coste.
 * - Reutiliza resultados en caché WeakMap para compartirlos entre Preview en vivo y Exportación MP4.
 */
export async function stretchAudioBufferPitchPreserving(
  source: AudioBuffer,
  rate: number
): Promise<AudioBuffer> {
  const clampedRate = Math.max(0.5, Math.min(2.0, Number(rate) || 1));
  if (Math.abs(clampedRate - 1.0) < 0.008) {
    return source;
  }

  const rateKey = clampedRate.toFixed(3);
  let byRate = stretchedBufferCache.get(source);
  if (byRate?.has(rateKey)) {
    return byRate.get(rateKey)!;
  }

  const channels: Float32Array[] = [];
  for (let c = 0; c < source.numberOfChannels; c++) {
    channels.push(new Float32Array(source.getChannelData(c)));
  }

  let rawResult: WsolaRawResult;
  const worker = getWsolaWorker();

  if (worker) {
    try {
      const reqId = nextWorkerReqId++;
      const transferables = channels.map((ch) => ch.buffer);
      rawResult = await new Promise<WsolaRawResult>((resolve, reject) => {
        workerPending.set(reqId, { resolve, reject });
        worker.postMessage(
          {
            id: reqId,
            channels,
            sampleRate: source.sampleRate,
            rate: clampedRate,
          },
          transferables
        );
      });
    } catch {
      // Fallback silencioso en hilo principal si el Worker falla
      const freshChannels: Float32Array[] = [];
      for (let c = 0; c < source.numberOfChannels; c++) {
        freshChannels.push(source.getChannelData(c));
      }
      rawResult = timeStretchChannelsWsolaSync(freshChannels, source.sampleRate, clampedRate);
    }
  } else {
    rawResult = timeStretchChannelsWsolaSync(channels, source.sampleRate, clampedRate);
  }

  const outputBuffer = createAudioBufferFromChannels(rawResult.channels, rawResult.sampleRate);
  if (!byRate) {
    byRate = new Map<string, AudioBuffer>();
    stretchedBufferCache.set(source, byRate);
  }
  byRate.set(rateKey, outputBuffer);
  return outputBuffer;
}
