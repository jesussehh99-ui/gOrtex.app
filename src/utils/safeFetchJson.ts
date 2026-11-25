/**
 * safeFetchJson.ts — Cliente HTTP JSON seguro con detección de HTML/SPA fallback,
 * diagnóstico claro por módulo y reintentos automáticos ante errores transitorios de red/gateway.
 */

export class SafeFetchJsonError extends Error {
  public readonly status: number;
  public readonly url: string;
  public readonly serviceName: string;
  public readonly isHtmlResponse: boolean;

  constructor(options: {
    message: string;
    status: number;
    url: string;
    serviceName: string;
    isHtmlResponse?: boolean;
  }) {
    super(options.message);
    this.name = 'SafeFetchJsonError';
    this.status = options.status;
    this.url = options.url;
    this.serviceName = options.serviceName;
    this.isHtmlResponse = Boolean(options.isHtmlResponse);
  }
}

export interface SafeFetchJsonConfig {
  /** Nombre legible del módulo/servicio para mensajes de diagnóstico claros */
  serviceName: string;
  /** Reintentos automáticos en 502/503/504 o respuestas HTML transitorias (por defecto: 1) */
  retries?: number;
  /** Tiempo base de espera entre reintentos en ms (por defecto: 650) */
  retryDelayMs?: number;
  /** Mensaje de respaldo si el servidor devuelve un error HTTP sin campo `error` */
  fallbackErrorMessage?: string;
}

function looksLikeHtml(text: string): boolean {
  const sample = text.trimStart().slice(0, 120).toLowerCase();
  return (
    sample.startsWith('<!doctype') ||
    sample.startsWith('<html') ||
    sample.startsWith('<head') ||
    sample.startsWith('<body') ||
    sample.startsWith('<?xml') ||
    sample.startsWith('<')
  );
}

function isJsonContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes('application/json') || ct.includes('+json');
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Ejecuta `fetch(url, init)` verificando estrictamente `Content-Type` JSON y `res.ok`.
 * Si el servidor o proxy devuelve HTML (por ejemplo `<!doctype html>` por 404 SPA o 502/504),
 * nunca intenta un `JSON.parse` ciego: reintenta si es transitorio o lanza un error descriptivo
 * con el módulo, URL y código HTTP exacto.
 */
export async function safeFetchJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit = {},
  config: SafeFetchJsonConfig
): Promise<T> {
  const {
    serviceName,
    retries = 1,
    retryDelayMs = 650,
    fallbackErrorMessage,
  } = config;

  const mergedHeaders = new Headers(init.headers);
  if (!mergedHeaders.has('Accept')) {
    mergedHeaders.set('Accept', 'application/json');
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: mergedHeaders,
      });

      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();
      const htmlDetected =
        contentType.toLowerCase().includes('text/html') || looksLikeHtml(rawText);

      // Caso crítico: se recibió HTML en lugar de JSON (típico fallback SPA 404 o 502/504 de proxy)
      if (htmlDetected) {
        const shouldRetry =
          attempt < retries &&
          (response.status >= 500 || response.status === 0 || response.status === 429);

        const htmlErr = new SafeFetchJsonError({
          message: `[${serviceName}] ${url} devolvió HTML (HTTP ${response.status}) en vez de JSON. Verifica que el servidor de Gortex esté activo y no haya ocurrido un timeout.`,
          status: response.status,
          url,
          serviceName,
          isHtmlResponse: true,
        });

        if (shouldRetry) {
          lastError = htmlErr;
          await sleep(retryDelayMs * (attempt + 1), init.signal);
          continue;
        }
        throw htmlErr;
      }

      // Intentar parsear JSON de forma segura si el cuerpo no está vacío
      let parsed: unknown = null;
      if (rawText.trim().length > 0) {
        if (!isJsonContentType(contentType)) {
          // Algunos servidores omiten Content-Type en respuestas pequeñas; intentamos parsear y si falla damos diagnóstico claro
          try {
            parsed = JSON.parse(rawText);
          } catch {
            throw new SafeFetchJsonError({
              message: `[${serviceName}] ${url} devolvió formato no JSON (${contentType || 'sin Content-Type'}, HTTP ${response.status}).`,
              status: response.status,
              url,
              serviceName,
              isHtmlResponse: false,
            });
          }
        } else {
          try {
            parsed = JSON.parse(rawText);
          } catch {
            throw new SafeFetchJsonError({
              message: `[${serviceName}] ${url} devolvió JSON truncado o inválido (HTTP ${response.status}).`,
              status: response.status,
              url,
              serviceName,
              isHtmlResponse: false,
            });
          }
        }
      }

      if (!response.ok) {
        const serverErrorMsg =
          parsed &&
          typeof parsed === 'object' &&
          'error' in parsed &&
          typeof (parsed as { error?: unknown }).error === 'string' &&
          (parsed as { error: string }).error.trim().length > 0
            ? (parsed as { error: string }).error.trim()
            : fallbackErrorMessage ||
              `[${serviceName}] Error HTTP ${response.status} al consultar ${url}.`;

        const httpErr = new SafeFetchJsonError({
          message: serverErrorMsg,
          status: response.status,
          url,
          serviceName,
          isHtmlResponse: false,
        });

        const shouldRetry = attempt < retries && response.status >= 500;
        if (shouldRetry) {
          lastError = httpErr;
          await sleep(retryDelayMs * (attempt + 1), init.signal);
          continue;
        }
        throw httpErr;
      }

      if (parsed === null) {
        throw new SafeFetchJsonError({
          message: `[${serviceName}] ${url} devolvió una respuesta vacía (HTTP ${response.status}).`,
          status: response.status,
          url,
          serviceName,
          isHtmlResponse: false,
        });
      }

      return parsed as T;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      if (err instanceof SafeFetchJsonError) {
        throw err;
      }
      lastError = err;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1), init.signal);
        continue;
      }
      throw new SafeFetchJsonError({
        message: `[${serviceName}] Error de red al consultar ${url}: ${
          err instanceof Error ? err.message : 'conexión interrumpida'
        }`,
        status: 0,
        url,
        serviceName,
        isHtmlResponse: false,
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new SafeFetchJsonError({
        message: `[${serviceName}] No se pudo completar la solicitud a ${url}.`,
        status: 0,
        url,
        serviceName,
      });
}
