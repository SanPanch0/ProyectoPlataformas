// GET /api/about?title=Japón
//
// Wikipedia en español (sin clave): resumen y miniatura de la página del país.
//   GET https://es.wikipedia.org/api/rest_v1/page/summary/{título}
import { fetchJson, getQuery, sendJson, sendError, env, cached, UpstreamError } from '../lib/upstream.js';

const DAY = 24 * 60 * 60 * 1000;

async function summary(base, title) {
  const slug = encodeURIComponent(title.trim().replace(/\s+/g, '_'));
  return fetchJson(`${base}/api/rest_v1/page/summary/${slug}?redirect=true`, { timeoutMs: 8000 });
}

export function normalizeAbout(data) {
  const extract = typeof data?.extract === 'string' ? data.extract.trim() : '';
  if (!extract || data.type === 'disambiguation') return null;
  return {
    provider: 'Wikipedia',
    title: data.title || null,
    extract: extract.length > 650 ? `${extract.slice(0, 650).replace(/\s+\S*$/, '')}…` : extract,
    thumbnail: data.thumbnail?.source || null,
    url: data.content_urls?.desktop?.page || null,
    license: 'CC BY-SA 4.0',
  };
}

export default async function handler(req, res) {
  try {
    const title = String(getQuery(req).title || '').trim();
    if (!title || title.length > 80) {
      return sendJson(res, 400, { error: { code: 'BAD_TITLE', message: 'Falta el nombre del país.' } });
    }
    const base = env('WIKIPEDIA_BASE_URL', 'https://es.wikipedia.org');
    const result = await cached(`about:${title.toLowerCase()}`, DAY, async () => {
      // Algunos nombres son ambiguos (p. ej. "Georgia"): se reintenta con "(país)".
      for (const candidate of [title, `${title} (país)`]) {
        try {
          const about = normalizeAbout(await summary(base, candidate));
          if (about) return about;
        } catch (err) {
          if (err.upstreamStatus !== 404) throw err;
        }
      }
      throw new UpstreamError('UPSTREAM_404', 'No se encontró una reseña de este país en Wikipedia.', 404, 404);
    });
    return sendJson(res, 200, result, { cacheSeconds: 3600 });
  } catch (err) {
    return sendError(res, err);
  }
}
