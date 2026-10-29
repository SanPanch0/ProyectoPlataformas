// Utilidades compartidas por las funciones del servidor (/api/*).
// Hacen la petición a la API externa con tiempo límite, controlan los
// códigos HTTP y el JSON inválido, y nunca devuelven claves al navegador.

export const USER_AGENT =
  'GuiaGlobalDeViajes/1.0 (proyecto academico; Universidad Andina del Cusco)';

export class UpstreamError extends Error {
  /**
   * @param {string} code   Código interno estable (p. ej. 'UPSTREAM_401').
   * @param {string} message Mensaje legible, sin datos sensibles.
   * @param {number} status Código HTTP que devolveremos al navegador.
   * @param {number|null} upstreamStatus Código HTTP original de la API externa.
   */
  constructor(code, message, status = 502, upstreamStatus = null) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code;
    this.status = status;
    this.upstreamStatus = upstreamStatus;
  }
}

const STATUS_MESSAGES = {
  400: 'La API externa rechazó la petición (400: parámetros no válidos).',
  401: 'La API externa rechazó la credencial (401: clave ausente o no válida).',
  403: 'La API externa denegó el acceso (403: sin permiso, suscripción o cuota agotada).',
  404: 'La API externa no encontró el recurso solicitado (404).',
  410: 'La versión de la API externa ya no está activa (410).',
  422: 'La API externa no pudo procesar la petición (422).',
  429: 'Se superó el límite de peticiones de la API externa (429). Inténtalo más tarde.',
  500: 'La API externa tuvo un error interno (500).',
  502: 'La API externa no está disponible temporalmente (502).',
  503: 'La API externa no está disponible temporalmente (503).',
  504: 'La API externa tardó demasiado en responder (504).',
};

export function messageForStatus(status) {
  return (
    STATUS_MESSAGES[status] ||
    `La API externa respondió con un error (${status}).`
  );
}

/**
 * Pide JSON a una API externa con tiempo límite.
 * Lanza UpstreamError con un código claro ante cualquier fallo.
 */
export async function fetchJson(url, { headers = {}, timeoutMs = 12000, method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      body,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new UpstreamError('TIMEOUT', 'La API externa no respondió a tiempo.', 504);
    }
    throw new UpstreamError('NETWORK', 'No se pudo conectar con la API externa.', 502);
  }

  let text;
  try {
    text = await response.text();
  } catch {
    clearTimeout(timer);
    throw new UpstreamError('NETWORK', 'La conexión con la API externa se interrumpió.', 502);
  }
  clearTimeout(timer);

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new UpstreamError('INVALID_JSON', 'La API externa devolvió una respuesta que no es JSON válido.', 502, response.status);
      }
    }
  }

  if (!response.ok) {
    const status = response.status;
    // 429 y 404 se devuelven tal cual; el resto se resume como 502.
    const outStatus = [400, 401, 403, 404, 422, 429].includes(status) ? status : 502;
    const err = new UpstreamError(`UPSTREAM_${status}`, messageForStatus(status), outStatus, status);
    err.details = extractUpstreamMessage(data);
    throw err;
  }
  return data;
}

function extractUpstreamMessage(data) {
  if (!data || typeof data !== 'object') return undefined;
  if (Array.isArray(data.errors) && data.errors[0]?.message) return String(data.errors[0].message).slice(0, 200);
  if (typeof data.message === 'string') return data.message.slice(0, 200);
  if (Array.isArray(data.errors) && typeof data.errors[0] === 'string') return data.errors[0].slice(0, 200);
  return undefined;
}

// ---------- Utilidades HTTP para las funciones /api ----------

export function getQuery(req) {
  const url = new URL(req.url, 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

export function sendJson(res, status, payload, { cacheSeconds = 0 } = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    cacheSeconds > 0 && status === 200 ? `public, max-age=${cacheSeconds}` : 'no-store'
  );
  res.end(JSON.stringify(payload));
}

export function sendError(res, err) {
  if (err instanceof UpstreamError) {
    return sendJson(res, err.status, {
      error: { code: err.code, message: err.message, upstreamStatus: err.upstreamStatus, details: err.details },
    });
  }
  console.error('[api] error inesperado:', err);
  return sendJson(res, 500, { error: { code: 'INTERNAL', message: 'Error interno del servidor.' } });
}

export function env(name, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

// Caché en memoria muy simple para ahorrar cuota de las APIs con límite.
const cache = new Map();
export async function cached(key, ttlMs, producer, shouldCache = () => true) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await producer();
  if (!shouldCache(value)) return value;
  cache.set(key, { value, expires: Date.now() + ttlMs });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}
export function clearCache() {
  cache.clear();
}
