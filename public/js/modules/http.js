// Módulo de gestión de errores y peticiones HTTP del navegador.
// Todas las llamadas pasan por aquí: tiempo límite, códigos HTTP,
// JSON inválido y mensajes comprensibles para el usuario.

export class AppError extends Error {
  constructor(message, { code = 'ERROR', status = null } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

const FRIENDLY = {
  400: 'La búsqueda no es válida. Revisa lo que escribiste.',
  401: 'El servicio rechazó la credencial configurada.',
  403: 'El servicio denegó el acceso (permisos o cuota agotada).',
  404: 'No se encontraron resultados.',
  422: 'El servicio no pudo procesar la petición.',
  429: 'Se hicieron demasiadas consultas. Espera un momento y vuelve a intentarlo.',
  500: 'El servidor de la aplicación tuvo un error.',
  502: 'Un servicio externo no está disponible en este momento.',
  503: 'El servicio no está configurado o no está disponible.',
  504: 'Un servicio externo tardó demasiado en responder.',
};

export function friendlyMessage(status) {
  return FRIENDLY[status] || `Ocurrió un error inesperado (${status}).`;
}

// ---------- Caché en el navegador (rapidez + modo sin Internet) ----------
// - Si la respuesta tiene menos de FRESH_MS, se usa al instante, sin pedirla otra vez.
// - Si no hay Internet o el servidor falla, se usa la última copia guardada (aunque sea vieja)
//   y se avisa con el evento "app:cache-used" para mostrar el aviso de modo sin conexión.
const FRESH_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 60;
const PREFIX = 'ggv:';
const CACHEABLE = /^\/api\/(country|rates|photos|hotels|weather|about)\b/;

function readCache(path) {
  try {
    const raw = localStorage.getItem(PREFIX + path);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(path, data) {
  try {
    localStorage.setItem(PREFIX + path, JSON.stringify({ t: Date.now(), data }));
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
    if (keys.length > MAX_ENTRIES) {
      const oldest = keys
        .map((k) => [k, (JSON.parse(localStorage.getItem(k) || '{}').t) || 0])
        .sort((a, b) => a[1] - b[1])
        .slice(0, keys.length - MAX_ENTRIES);
      oldest.forEach(([k]) => localStorage.removeItem(k));
    }
  } catch { /* almacenamiento lleno o bloqueado: la app funciona igual */ }
}

/**
 * GET a la API propia (/api/...). Devuelve el JSON o lanza AppError.
 * Usa la caché del navegador (ver arriba).
 */
export async function getJson(path, options = {}) {
  if (!CACHEABLE.test(path)) return fetchJson(path, options);
  const hit = readCache(path);
  if (hit && Date.now() - hit.t < FRESH_MS) return hit.data;
  try {
    const data = await fetchJson(path, options);
    writeCache(path, data);
    return data;
  } catch (err) {
    const recoverable = ['OFFLINE', 'NETWORK', 'TIMEOUT'].includes(err.code) || err.status >= 500;
    if (hit && recoverable) {
      window.dispatchEvent(new CustomEvent('app:cache-used', { detail: { path, savedAt: hit.t } }));
      return hit.data;
    }
    throw err;
  }
}

async function fetchJson(path, { timeoutMs = 20000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const onAbort = () => controller.abort('cancelled');
  signal?.addEventListener('abort', onAbort, { once: true });

  let res;
  try {
    res = await fetch(path, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    if (signal?.aborted) throw new AppError('Búsqueda cancelada.', { code: 'CANCELLED' });
    if (controller.signal.aborted) throw new AppError('La consulta tardó demasiado. Inténtalo de nuevo.', { code: 'TIMEOUT' });
    if (!navigator.onLine) throw new AppError('No hay conexión a Internet.', { code: 'OFFLINE' });
    throw new AppError('No se pudo conectar con el servidor de la aplicación. ¿Está en ejecución?', { code: 'NETWORK' });
  }
  clearTimeout(timer);
  signal?.removeEventListener('abort', onAbort);

  let data = null;
  const text = await res.text().catch(() => '');
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new AppError('El servidor devolvió una respuesta que no es JSON válido. Comprueba que ejecutas la app con "npm start" y no abriendo el HTML directamente.', { code: 'INVALID_JSON', status: res.status });
  }

  if (!res.ok) {
    const msg = data?.error?.message || friendlyMessage(res.status);
    throw new AppError(msg, { code: data?.error?.code || `HTTP_${res.status}`, status: res.status });
  }
  return data;
}
