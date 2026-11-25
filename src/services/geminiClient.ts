import { GoogleGenAI, Type } from '@google/genai';

export { Type };

export const PRIMARY_GEMINI_MODEL = 'gemini-2.5-flash';
const TEXT_MODEL_CANDIDATES = [PRIMARY_GEMINI_MODEL, 'gemini-3.1-flash-lite'] as const;

let activeModelIndex = 0;
let cachedClient: GoogleGenAI | null = null;
let cachedApiKey = '';

// Cola ligera de espaciado client-side para evitar ráfagas simultáneas hacia Gemini
let lastGeminiCallAt = 0;
let geminiQueueTail: Promise<void> = Promise.resolve();
const MIN_CALL_SPACING_MS = 550;

export class GeminiApiError extends Error {
  status: number;
  isRateLimit: boolean;
  isAuthError: boolean;
  isMissingKey: boolean;

  constructor(
    message: string,
    options?: {
      status?: number;
      isRateLimit?: boolean;
      isAuthError?: boolean;
      isMissingKey?: boolean;
    }
  ) {
    super(message);
    this.name = 'GeminiApiError';
    this.status = options?.status ?? 500;
    this.isRateLimit = Boolean(options?.isRateLimit || this.status === 429);
    this.isAuthError = Boolean(options?.isAuthError || this.status === 401 || this.status === 403);
    this.isMissingKey = Boolean(options?.isMissingKey);
  }
}

/**
 * Resuelve la clave de API de Gemini 100% en navegador sin riesgo de ReferenceError: process is not defined.
 * Orden de prioridad:
 * 1) import.meta.env.VITE_GEMINI_API_KEY
 * 2) process.env.GEMINI_API_KEY / process.env.API_KEY (inyectado por Vite define)
 * 3) localStorage opcional ('gortex_gemini_api_key' / 'GEMINI_API_KEY')
 */
export function resolveGeminiApiKey(): string {
  try {
    const viteKey = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
      ?.VITE_GEMINI_API_KEY;
    if (typeof viteKey === 'string' && viteKey.trim().length > 0) {
      return viteKey.trim();
    }
  } catch {
    // Continuar con siguientes fuentes
  }

  try {
    if (typeof process !== 'undefined' && process && process.env) {
      const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (typeof envKey === 'string' && envKey.trim().length > 0) {
        return envKey.trim();
      }
    }
  } catch {
    // Continuar con siguientes fuentes
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedKey =
        window.localStorage.getItem('gortex_gemini_api_key') ||
        window.localStorage.getItem('GEMINI_API_KEY');
      if (typeof storedKey === 'string' && storedKey.trim().length > 0) {
        return storedKey.trim();
      }
    }
  } catch {
    // localStorage bloqueado o no disponible
  }

  return '';
}

export function hasGeminiApiKey(): boolean {
  return resolveGeminiApiKey().length > 0;
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new GeminiApiError(
      'Falta la clave de Gemini (VITE_GEMINI_API_KEY o GEMINI_API_KEY). Configúrala en Settings > Secrets o en tu archivo .env y recarga Gortex.',
      { status: 401, isAuthError: true, isMissingKey: true }
    );
  }

  if (cachedClient && cachedApiKey === apiKey) {
    return cachedClient;
  }

  cachedApiKey = apiKey;
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

function paceGeminiRequest<T>(task: () => Promise<T>): Promise<T> {
  const scheduled = geminiQueueTail.then(async () => {
    const elapsed = Date.now() - lastGeminiCallAt;
    if (elapsed < MIN_CALL_SPACING_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_CALL_SPACING_MS - elapsed));
    }
    lastGeminiCallAt = Date.now();
    return task();
  });

  geminiQueueTail = scheduled.then(
    () => undefined,
    () => undefined
  );

  return scheduled;
}

function extractErrorStatus(err: unknown): number {
  if (err instanceof GeminiApiError) return err.status;
  if (typeof err === 'object' && err !== null) {
    if ('status' in err && Number.isFinite(Number((err as { status?: unknown }).status))) {
      return Number((err as { status?: unknown }).status);
    }
    if ('code' in err && Number.isFinite(Number((err as { code?: unknown }).code))) {
      return Number((err as { code?: unknown }).code);
    }
  }
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) return 429;
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return 403;
  }
  if (raw.includes('404') || raw.includes('NOT_FOUND')) return 404;
  return 0;
}

export function formatGeminiError(err: unknown): GeminiApiError {
  if (err instanceof GeminiApiError) return err;

  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Error desconocido con Gemini.';
  const status = extractErrorStatus(err);

  if (status === 401 || raw.includes('API key not valid') || raw.includes('API_KEY_INVALID')) {
    return new GeminiApiError(
      'La clave de Gemini es inválida o fue rechazada. Verifica tu clave en Settings > Secrets o .env.',
      { status: 403, isAuthError: true }
    );
  }

  if (status === 403 || raw.includes('PERMISSION_DENIED')) {
    return new GeminiApiError(
      'Permiso denegado por la API de Gemini. Revisa que tu clave tenga acceso habilitado a gemini-2.5-flash en Google AI Studio.',
      { status: 403, isAuthError: true }
    );
  }

  if (status === 429 || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('quota')) {
    return new GeminiApiError(
      'Se alcanzó temporalmente el límite gratuito de solicitudes de Gemini (HTTP 429). Espera 15–30 segundos e inténtalo de nuevo.',
      { status: 429, isRateLimit: true }
    );
  }

  if (status === 404 || raw.includes('NOT_FOUND')) {
    return new GeminiApiError(
      'El modelo gemini-2.5-flash no está disponible temporalmente para esta clave de API.',
      { status: 404 }
    );
  }

  if (raw.toLowerCase().includes('failed to fetch') || raw.toLowerCase().includes('networkerror')) {
    return new GeminiApiError(
      'No se pudo conectar directamente con la API de Gemini. Verifica tu conexión a internet o bloqueadores de red.',
      { status: 503 }
    );
  }

  return new GeminiApiError(raw, {
    status: status >= 400 && status < 600 ? status : 500,
  });
}

async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await paceGeminiRequest(fn);
    } catch (err: unknown) {
      lastError = err;
      const status = extractErrorStatus(err);
      const rawMsg = err instanceof Error ? err.message : String(err ?? '');
      const isRateLimit = status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED');
      const isAuth =
        status === 401 ||
        status === 403 ||
        rawMsg.includes('API_KEY_INVALID') ||
        rawMsg.includes('PERMISSION_DENIED');
      const isNotFound = status === 404 || rawMsg.includes('NOT_FOUND');

      if (isAuth || isNotFound || attempt === maxRetries) {
        throw err;
      }

      const isRetryable = isRateLimit || status >= 500 || status === 0;
      if (!isRetryable) {
        throw err;
      }

      const waitMs = isRateLimit ? 2000 * (attempt + 1) : 750 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

export type GenerateContentRequest = Omit<
  Parameters<GoogleGenAI['models']['generateContent']>[0],
  'model'
> & {
  model?: string;
};

export async function generateContentWithGemini(params: GenerateContentRequest) {
  const ai = getGeminiClient();
  const { model: requestedModel, ...rest } = params;

  if (requestedModel) {
    try {
      return await withGeminiRetry(() =>
        ai.models.generateContent({
          ...rest,
          model: requestedModel,
        })
      );
    } catch (err: unknown) {
      throw formatGeminiError(err);
    }
  }

  let lastErr: unknown;
  for (let offset = 0; offset < TEXT_MODEL_CANDIDATES.length; offset++) {
    const idx = (activeModelIndex + offset) % TEXT_MODEL_CANDIDATES.length;
    const model = TEXT_MODEL_CANDIDATES[idx];
    try {
      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          ...rest,
          model,
        })
      );
      activeModelIndex = idx;
      return response;
    } catch (err: unknown) {
      lastErr = err;
      const status = extractErrorStatus(err);
      const rawMsg = err instanceof Error ? err.message : String(err ?? '');
      const isModelNotFound = status === 404 || rawMsg.includes('NOT_FOUND');
      if (!isModelNotFound) {
        throw formatGeminiError(err);
      }
    }
  }

  throw formatGeminiError(lastErr);
}

/**
 * Extrae JSON limpio incluso si el modelo envuelve la respuesta en bloques ```json ... ```
 */
export function extractJsonString(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export async function generateJsonWithGemini<T>(params: {
  contents: GenerateContentRequest['contents'];
  systemInstruction?: string;
  responseSchema?: Record<string, unknown>;
  model?: string;
}): Promise<T> {
  const response = await generateContentWithGemini({
    model: params.model,
    contents: params.contents,
    config: {
      ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
      responseMimeType: 'application/json',
      ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new GeminiApiError(
      'Gemini devolvió una respuesta vacía. Intenta generar nuevamente.',
      { status: 502 }
    );
  }

  try {
    return JSON.parse(extractJsonString(rawText)) as T;
  } catch {
    throw new GeminiApiError(
      'La respuesta de Gemini no pudo interpretarse como JSON válido. Intenta generar nuevamente.',
      { status: 502 }
    );
  }
}

export function utf8ToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export function extractAndSanitizeSvg(raw: string): string {
  const cleaned = raw.trim();
  const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) {
    throw new GeminiApiError(
      'No se pudo extraer una ilustración SVG válida de la respuesta de Gemini.',
      { status: 502 }
    );
  }
  let svg = match[0];
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  svg = svg.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  svg = svg.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  svg = svg.replace(
    /(?:xlink:)?href\s*=\s*(?:"\s*(?:javascript:|https?:|\/\/)[^"]*"|'\s*(?:javascript:|https?:|\/\/)[^']*')/gi,
    ''
  );
  if (!/xmlns=/i.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}

// Re-exportar servicios de dominio Gortex desde el cliente centralizado
export {
  editSceneSvgArt,
  generateBatchSceneSvgArt,
  generateFlowPromptsForScript,
  generateRandomViralIdea,
  generateSceneSvgArt,
  generateSeriesNextEpisode,
  generateViralScript,
  optimizeWeakBeats,
  refineSingleScene,
  scanViralTrends,
  translateViralScript,
} from './gortexAiService';
