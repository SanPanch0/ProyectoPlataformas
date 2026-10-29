// Módulo de consulta de países (REST Countries v5 a través de /api/country).
import { getJson, AppError } from './http.js';
import { resolveCountryCode, spanishCountryName } from './countryNames.js';

export async function fetchCountry(input, { signal } = {}) {
  const text = String(input || '').trim();
  if (!text) throw new AppError('Escribe el nombre de un país.', { code: 'EMPTY_QUERY' });
  if (text.length > 80) throw new AppError('El nombre es demasiado largo.', { code: 'QUERY_TOO_LONG' });

  const code = resolveCountryCode(text);
  const url = code ? `/api/country?code=${code}` : `/api/country?q=${encodeURIComponent(text)}`;
  try {
    const { country, warnings = [] } = await getJson(url, { signal });
    const es = spanishCountryName(country.codes.alpha2) || country.name.es || country.name.common;
    return { country: { ...country, displayName: es }, warnings };
  } catch (err) {
    if (err.status === 404) {
      throw new AppError(`No encontramos ningún país llamado «${text}». Revisa la ortografía o prueba con otro nombre.`, { code: 'COUNTRY_NOT_FOUND', status: 404 });
    }
    throw err;
  }
}
