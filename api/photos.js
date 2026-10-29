// GET /api/photos?query=Tokyo%20Japan
//
// Proveedor principal: Unsplash API (requiere UNSPLASH_ACCESS_KEY).
// Alternativa sin clave: Wikimedia Commons (fotos con licencia libre y autoría).
import { fetchJson, getQuery, sendJson, sendError, env, cached, UpstreamError } from '../lib/upstream.js';
import { normalizeUnsplash, normalizeWikimedia } from '../lib/normalize.js';

const HOUR = 60 * 60 * 1000;
const PER_PAGE = 9;

async function fromUnsplash(query) {
  const key = env('UNSPLASH_ACCESS_KEY');
  if (!key) throw new UpstreamError('MISSING_KEY', 'Falta UNSPLASH_ACCESS_KEY.', 503);
  const api = env('UNSPLASH_BASE_URL', 'https://api.unsplash.com');
  const appName = env('UNSPLASH_APP_NAME', 'guia_global_de_viajes');
  const url = `${api}/search/photos?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&orientation=landscape&content_filter=high`;
  const payload = await fetchJson(url, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } });
  return normalizeUnsplash(payload, appName);
}

async function fromWikimedia(query) {
  const api = env('WIKIMEDIA_API_URL', 'https://commons.wikimedia.org/w/api.php');
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(PER_PAGE + 6),
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '960',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription',
  });
  const payload = await fetchJson(`${api}?${params}`);
  return normalizeWikimedia(payload).slice(0, PER_PAGE);
}

export async function resolvePhotos(query) {
  const warnings = [];
  try {
    const photos = await fromUnsplash(query);
    if (photos.length) return { provider: 'Unsplash', photos, warnings };
    warnings.push('Unsplash no devolvió fotografías para esta búsqueda; se consultó Wikimedia Commons.');
  } catch (err) {
    warnings.push(err.code === 'MISSING_KEY'
      ? 'Unsplash no está configurado (falta la Access Key); se usó Wikimedia Commons.'
      : `Unsplash falló (${err.message}); se usó Wikimedia Commons.`);
  }
  const photos = await fromWikimedia(query);
  return { provider: 'Wikimedia Commons', photos, warnings };
}

export default async function handler(req, res) {
  try {
    const query = (getQuery(req).query || '').trim();
    if (!query) return sendJson(res, 400, { error: { code: 'EMPTY_QUERY', message: 'Falta el destino a buscar.' } });
    if (query.length > 100) return sendJson(res, 400, { error: { code: 'QUERY_TOO_LONG', message: 'La búsqueda es demasiado larga.' } });
    const result = await cached(`photos:${query.toLowerCase()}`, HOUR, () => resolvePhotos(query));
    return sendJson(res, 200, result, { cacheSeconds: 3600 });
  } catch (err) {
    return sendError(res, err);
  }
}
