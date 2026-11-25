/// <reference lib="webworker" />

/**
 * depthWorker.ts — Worker dedicado de estimación de profundidad monocular 100% local (Costo $0).
 *
 * - Usa `@huggingface/transformers` (ONNX Runtime Web) con `onnx-community/depth-anything-v2-small`.
 * - Prioriza `device: 'webgpu'` (fp16/q8) y cae automáticamente a `device: 'wasm'` (q8).
 * - Cachea los pesos del modelo en Cache Storage del navegador (descarga única).
 * - Normaliza la profundidad (percentiles 2%–98%) y devuelve un Blob WebP en escala de grises
 *   redimensionado a 512px lado mayor para almacenamiento eficiente en OPFS.
 */

interface DepthRequestMessage {
  type: 'estimate';
  id: number;
  key: string;
  imageBlob: Blob;
  maxDim?: number;
}

interface DepthWarmupMessage {
  type: 'warmup';
}

type WorkerInMessage = DepthRequestMessage | DepthWarmupMessage;

type DepthBackend = 'webgpu' | 'wasm';

interface RawDepthResult {
  depth?: {
    data: Uint8Array | Uint8ClampedArray | Float32Array;
    width: number;
    height: number;
    channels?: number;
  };
  predicted_depth?: {
    data: Float32Array | Uint8Array | number[];
    dims: number[];
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let depthPipelinePromise: Promise<{ estimator: any; backend: DepthBackend }> | null = null;
let resolvedBackend: DepthBackend | null = null;

function postStatus(status: string, progress?: number, backend?: DepthBackend) {
  self.postMessage({
    type: 'status',
    status,
    progress,
    backend: backend ?? resolvedBackend ?? undefined,
  });
}

async function hasUsableWebGpu(): Promise<boolean> {
  try {
    const nav = self.navigator as Navigator & {
      gpu?: { requestAdapter?: () => Promise<unknown | null> };
    };
    if (!nav?.gpu || typeof nav.gpu.requestAdapter !== 'function') {
      return false;
    }
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function getDepthPipeline(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  estimator: any;
  backend: DepthBackend;
}> {
  if (depthPipelinePromise) return depthPipelinePromise;

  depthPipelinePromise = (async () => {
    try {
      const transformers = await import('@huggingface/transformers');
      const { pipeline, env } = transformers;

      // CRÍTICO: impedir búsqueda de /models/.../config.json en el servidor SPA local (evita <!doctype html>)
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.useBrowserCache = true;

      const modelId = 'onnx-community/depth-anything-v2-small';
      const canWebGpu = await hasUsableWebGpu();

      const attempts: Array<{ device: DepthBackend; dtype: 'fp16' | 'q8' }> = canWebGpu
        ? [
            { device: 'webgpu', dtype: 'fp16' },
            { device: 'webgpu', dtype: 'q8' },
            { device: 'wasm', dtype: 'q8' },
          ]
        : [{ device: 'wasm', dtype: 'q8' }];

      let lastError: unknown = null;

      for (const attempt of attempts) {
        try {
          postStatus('loading_model', 0, attempt.device);
          const estimator = await pipeline('depth-estimation', modelId, {
            device: attempt.device,
            dtype: attempt.dtype,
            progress_callback: (info: { status?: string; progress?: number }) => {
              if (typeof info?.progress === 'number') {
                postStatus('loading_model', Math.min(100, Math.round(info.progress)), attempt.device);
              }
            },
          });
          resolvedBackend = attempt.device;
          postStatus('ready', 100, attempt.device);
          return { estimator, backend: attempt.device };
        } catch (err) {
          lastError = err;
        }
      }

      depthPipelinePromise = null;
      postStatus('fallback', 0);
      throw lastError ?? new Error('No se pudo inicializar el modelo local Depth Anything V2.');
    } catch (err) {
      depthPipelinePromise = null;
      postStatus('fallback', 0);
      throw err;
    }
  })();

  return depthPipelinePromise;
}

/**
 * Normaliza un mapa de profundidad crudo usando percentiles 2%..98% para maximizar el rango dinámico
 * (0 = fondo lejano, 255 = primer plano cercano) y lo codifica en WebP gris <= 512px.
 */
async function encodeNormalizedDepthBlob(
  result: RawDepthResult,
  maxDim: number
): Promise<{ blob: Blob; width: number; height: number }> {
  let srcW = 0;
  let srcH = 0;
  let floatValues: Float32Array;

  if (result?.predicted_depth?.data && Array.isArray(result.predicted_depth.dims)) {
    const dims = result.predicted_depth.dims;
    srcH = dims[dims.length - 2] || 0;
    srcW = dims[dims.length - 1] || 0;
    const raw = result.predicted_depth.data;
    const len = srcW * srcH;
    floatValues = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      floatValues[i] = Number(raw[i] ?? 0);
    }
  } else if (result?.depth?.data && result.depth.width > 0 && result.depth.height > 0) {
    srcW = result.depth.width;
    srcH = result.depth.height;
    const channels = Math.max(1, result.depth.channels ?? Math.floor(result.depth.data.length / (srcW * srcH)));
    const len = srcW * srcH;
    floatValues = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      floatValues[i] = Number(result.depth.data[i * channels] ?? 0);
    }
  } else {
    throw new Error('Salida de profundidad vacía.');
  }

  // Muestreo ligero (hasta 4096 muestras equidistantes) para percentiles robustos 2%..98%
  const totalPx = srcW * srcH;
  const sampleStep = Math.max(1, Math.floor(totalPx / 4096));
  const samples: number[] = [];
  for (let i = 0; i < totalPx; i += sampleStep) {
    const v = floatValues[i];
    if (Number.isFinite(v)) samples.push(v);
  }
  samples.sort((a, b) => a - b);
  const pLow = samples[Math.floor(samples.length * 0.02)] ?? 0;
  const pHigh = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.98))] ?? 1;
  const invRange = 1 / Math.max(1e-5, pHigh - pLow);

  const rgba = new Uint8ClampedArray(totalPx * 4);
  for (let i = 0; i < totalPx; i++) {
    const norm = Math.max(0, Math.min(1, (floatValues[i] - pLow) * invRange));
    const byte = Math.round(norm * 255);
    const o = i * 4;
    rgba[o] = byte;
    rgba[o + 1] = byte;
    rgba[o + 2] = byte;
    rgba[o + 3] = 255;
  }

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const outW = Math.max(32, Math.round(srcW * scale));
  const outH = Math.max(32, Math.round(srcH * scale));

  const srcCanvas = new OffscreenCanvas(srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('OffscreenCanvas 2D no disponible en depthWorker.');
  srcCtx.putImageData(new ImageData(rgba, srcW, srcH), 0, 0);

  let targetCanvas = srcCanvas;
  if (outW !== srcW || outH !== srcH) {
    targetCanvas = new OffscreenCanvas(outW, outH);
    const outCtx = targetCanvas.getContext('2d');
    if (outCtx) {
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';
      outCtx.drawImage(srcCanvas, 0, 0, outW, outH);
    }
  }

  let blob: Blob;
  try {
    blob = await targetCanvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
    if (!blob || blob.size === 0) {
      blob = await targetCanvas.convertToBlob({ type: 'image/png' });
    }
  } catch {
    blob = await targetCanvas.convertToBlob({ type: 'image/png' });
  }

  return { blob, width: outW, height: outH };
}

self.onmessage = async (ev: MessageEvent<WorkerInMessage>) => {
  const msg = ev.data;
  if (!msg) return;

  if (msg.type === 'warmup') {
    try {
      await getDepthPipeline();
    } catch (err) {
      self.postMessage({
        type: 'status',
        status: 'fallback',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === 'estimate') {
    const { id, key, imageBlob, maxDim = 512 } = msg;
    try {
      const { estimator, backend } = await getDepthPipeline();
      const { RawImage } = await import('@huggingface/transformers');
      postStatus('computing', undefined, backend);

      const rawImg = await RawImage.fromBlob(imageBlob);
      const output = (await estimator(rawImg)) as RawDepthResult;
      const encoded = await encodeNormalizedDepthBlob(output, maxDim);

      self.postMessage({
        type: 'result',
        id,
        key,
        depthBlob: encoded.blob,
        width: encoded.width,
        height: encoded.height,
        backend,
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        id,
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
