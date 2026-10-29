// GET /api/country?code=JP      (código ISO alfa-2, recomendado)
// GET /api/country?q=japan      (texto libre, si el navegador no pudo resolver el código)
//
// Proveedor principal: REST Countries v5 (requiere RESTCOUNTRIES_API_KEY).
// Alternativa sin clave: countries.dev (datos de GeoNames, CC BY 4.0).
import { fetchJson, getQuery, sendJson, sendError, env, cached, UpstreamError } from '../lib/upstream.js';
import { extractCountryList, normalizeCountry } from '../lib/normalize.js';

const DAY = 24 * 60 * 60 * 1000;

const FIELDS = [
  'names.common', 'names.official', 'names.native', 'codes.alpha_2', 'codes.alpha_3',
  'capitals', 'languages', 'population', 'timezones', 'currencies', 'flag',
  'region', 'subregion', 'coordinates', 'latlng',
].join(',');

async function fromRestCountries({ code, q }) {
  const key = env('RESTCOUNTRIES_API_KEY');
  if (!key) throw new UpstreamError('MISSING_KEY', 'Falta RESTCOUNTRIES_API_KEY.', 503);
  const base = env('RESTCOUNTRIES_BASE_URL', 'https://api.restcountries.com/countries/v5');
  const headers = { Authorization: `Bearer ${key}` };
  const params = `response_fields=${encodeURIComponent(FIELDS)}`;

  let payload;
  if (code) {
    try {
      payload = await fetchJson(`${base}/codes.alpha_2/${encodeURIComponent(code)}?${params}`, { headers });
    } catch (err) {
      if (err.status !== 404) throw err;
      // Plan B documentado: filtro por propiedad sobre el listado.
      payload = await fetchJson(`${base}?codes.alpha_2=${encodeURIComponent(code)}&${params}`, { headers });
    }
  } else {
    // Búsqueda agregada por nombre (common, official, alternates, native).
    payload = await fetchJson(`${base}/name?q=${encodeURIComponent(q)}&limit=5&${params}`, { headers });
  }
  const list = extractCountryList(payload);
  if (payload?.data?._demo) {
    // Las claves de demostración devuelven datos de ejemplo: no son datos reales.
    throw new UpstreamError('DEMO_KEY', 'La clave configurada es de demostración y no devuelve datos reales.', 503);
  }
  return list.map((c) => normalizeCountry(c, 'REST Countries v5'));
}

async function fromCountriesDev({ code, q }) {
  const base = env('COUNTRIESDEV_BASE_URL', 'https://countries.dev');
  const url = code ? `${base}/alpha/${encodeURIComponent(code)}` : `${base}/name/${encodeURIComponent(q)}`;
  const payload = await fetchJson(url);
  return extractCountryList(payload).map((c) => normalizeCountry(c, 'countries.dev (GeoNames)'));
}

function pickBest(list, { code, q }) {
  const valid = list.filter((c) => c && c.name.common);
  if (!valid.length) return null;
  if (code) return valid.find((c) => c.codes.alpha2 === code) || valid[0];
  const needle = q.toLowerCase();
  return valid.find((c) => c.name.common.toLowerCase() === needle) || valid[0];
}

export async function resolveCountry({ code, q }) {
  const warnings = [];
  let country = null;
  let primaryError = null;

  try {
    country = pickBest(await fromRestCountries({ code, q }), { code, q });
  } catch (err) {
    primaryError = err;
    if (err.code === 'MISSING_KEY') warnings.push('REST Countries no está configurado (falta la clave); se usó la alternativa countries.dev.');
    else warnings.push(`REST Countries falló (${err.message}); se usó la alternativa countries.dev.`);
  }

  if (!country && primaryError?.status === 404) {
    // REST Countries respondió bien pero no encontró el país: no hace falta la alternativa.
    throw new UpstreamError('COUNTRY_NOT_FOUND', 'No se encontró ningún país con ese nombre.', 404);
  }

  if (!country) {
    try {
      country = pickBest(await fromCountriesDev({ code, q }), { code, q });
    } catch (err) {
      if (err.status === 404) throw new UpstreamError('COUNTRY_NOT_FOUND', 'No se encontró ningún país con ese nombre.', 404);
      // Ambos proveedores fallaron: devolvemos el error más útil.
      const e = new UpstreamError('COUNTRY_UNAVAILABLE', 'No se pudo obtener la información del país en este momento.', 502);
      e.details = [primaryError?.message, err.message].filter(Boolean).join(' | ');
      throw e;
    }
  }

  if (!country) throw new UpstreamError('COUNTRY_NOT_FOUND', 'No se encontró ningún país con ese nombre.', 404);
  return { country, warnings };
}

export default async function handler(req, res) {
  try {
    const query = getQuery(req);
    const code = (query.code || '').trim().toUpperCase();
    const q = (query.q || '').trim();
    if (code && !/^[A-Z]{2}$/.test(code)) {
      return sendJson(res, 400, { error: { code: 'BAD_CODE', message: 'El código de país debe tener dos letras (ISO 3166-1 alfa-2).' } });
    }
    if (!code && !q) {
      return sendJson(res, 400, { error: { code: 'EMPTY_QUERY', message: 'Escribe el nombre de un país.' } });
    }
    if (q.length > 80) {
      return sendJson(res, 400, { error: { code: 'QUERY_TOO_LONG', message: 'El nombre es demasiado largo.' } });
    }
    const result = await cached(`country:${code || q.toLowerCase()}`, DAY, () => resolveCountry({ code, q }));
    return sendJson(res, 200, result, { cacheSeconds: 3600 });
  } catch (err) {
    return sendError(res, err);
  }
}
