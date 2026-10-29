// GET /api/rates?currencies=JPY,EUR
//
// Frankfurter v2 (sin clave): https://api.frankfurter.dev/v2/rates?base=USD&quotes=PEN,JPY
// Pedimos todo con base USD y el navegador calcula los cruces:
//   tasa(A -> B) = (USD -> B) / (USD -> A)
// Así una sola petición cubre USD, PEN y la moneda del país.
import { fetchJson, getQuery, sendJson, sendError, env, cached } from '../lib/upstream.js';
import { normalizeRates } from '../lib/normalize.js';

const HOUR = 60 * 60 * 1000;
const BASE = 'USD';

async function getUsdRates(quotes) {
  const api = env('FRANKFURTER_BASE_URL', 'https://api.frankfurter.dev');
  const url = `${api}/v2/rates?base=${BASE}&quotes=${quotes.join(',')}`;
  return normalizeRates(await fetchJson(url), BASE);
}

export async function resolveRates(requested) {
  const wanted = [...new Set(['PEN', ...requested].filter((c) => c !== BASE))];
  const unsupported = [];
  let result;
  try {
    result = await getUsdRates(wanted);
  } catch (err) {
    // 404/422 = alguna moneda no está admitida. Probamos una por una.
    if (![400, 404, 422].includes(err.upstreamStatus)) throw err;
    const rates = {};
    const dates = [];
    for (const code of wanted) {
      try {
        const r = await getUsdRates([code]);
        if (r.rates[code]) {
          rates[code] = r.rates[code];
          if (r.date) dates.push(r.date);
        } else unsupported.push(code);
      } catch (e) {
        if ([400, 404, 422].includes(e.upstreamStatus)) unsupported.push(code);
        else throw e;
      }
    }
    dates.sort();
    result = { base: BASE, rates, date: dates.at(-1) || null, oldestDate: dates[0] || null };
  }
  for (const code of wanted) {
    if (!result.rates[code] && !unsupported.includes(code)) unsupported.push(code);
  }
  result.rates[BASE] = 1;
  return {
    ...result,
    unsupported,
    provider: 'Frankfurter (api.frankfurter.dev, v2)',
    note: 'Tipos de cambio de referencia publicados por bancos centrales y fuentes oficiales; se actualizan a diario, no en tiempo real.',
  };
}

export default async function handler(req, res) {
  try {
    const { currencies = '' } = getQuery(req);
    const list = currencies
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (list.some((c) => !/^[A-Z]{3}$/.test(c)) || list.length > 6) {
      return sendJson(res, 400, { error: { code: 'BAD_CURRENCY', message: 'Códigos de moneda no válidos (usa códigos ISO 4217 de tres letras).' } });
    }
    const key = `rates:${[...list].sort().join(',')}`;
    const result = await cached(key, HOUR, () => resolveRates(list));
    return sendJson(res, 200, result, { cacheSeconds: 1800 });
  } catch (err) {
    return sendError(res, err);
  }
}
