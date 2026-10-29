// GET /api/weather?lat=35.68&lng=139.69
//
// Open-Meteo (sin clave): https://open-meteo.com/en/docs
//   GET https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..
//       &current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code
//       &daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5
import { fetchJson, getQuery, sendJson, sendError, env, cached, UpstreamError } from '../lib/upstream.js';

const HALF_HOUR = 30 * 60 * 1000;

// Códigos WMO que devuelve Open-Meteo -> texto en español + emoji.
const WMO = [
  [[0], 'Despejado', '☀️'],
  [[1], 'Mayormente despejado', '🌤️'],
  [[2], 'Parcialmente nublado', '⛅'],
  [[3], 'Nublado', '☁️'],
  [[45, 48], 'Niebla', '🌫️'],
  [[51, 53, 55, 56, 57], 'Llovizna', '🌦️'],
  [[61, 63, 65, 66, 67], 'Lluvia', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'Nieve', '❄️'],
  [[80, 81, 82], 'Chubascos', '🌧️'],
  [[95, 96, 99], 'Tormenta', '⛈️'],
];

export function describeWeather(code) {
  const hit = WMO.find(([codes]) => codes.includes(Number(code)));
  return hit ? { label: hit[1], icon: hit[2] } : { label: 'Sin datos', icon: '🌡️' };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normalizeWeather(data) {
  const cur = data?.current;
  const daily = data?.daily;
  if (!cur || !daily || !Array.isArray(daily.time)) {
    throw new UpstreamError('INVALID_RESPONSE', 'Open-Meteo devolvió una respuesta con una forma inesperada.', 502);
  }
  return {
    provider: 'Open-Meteo',
    providerUrl: 'https://open-meteo.com/',
    timezone: data.timezone || null,
    current: {
      temp: num(cur.temperature_2m),
      humidity: num(cur.relative_humidity_2m),
      wind: num(cur.wind_speed_10m),
      ...describeWeather(cur.weather_code),
    },
    days: daily.time.map((date, i) => ({
      date,
      max: num(daily.temperature_2m_max?.[i]),
      min: num(daily.temperature_2m_min?.[i]),
      ...describeWeather(daily.weather_code?.[i]),
    })),
  };
}

// Si el país no trae coordenadas de la capital (pasa con countries.dev), se busca la ciudad
// por nombre en el geocodificador gratuito de Open-Meteo.
export async function geocodeCity(city, country) {
  const api = env('GEOCODING_BASE_URL', 'https://geocoding-api.open-meteo.com');
  const params = new URLSearchParams({ name: city, count: '5', language: 'es', format: 'json' });
  const data = await fetchJson(`${api}/v1/search?${params}`, { timeoutMs: 8000 });
  const list = Array.isArray(data?.results) ? data.results : [];
  const wanted = String(country || '').toLowerCase();
  const hit = list.find((r) => wanted && String(r.country || '').toLowerCase() === wanted) || list[0];
  if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) {
    throw new UpstreamError('UPSTREAM_404', 'No se encontró la ubicación de la capital para consultar el clima.', 404, 404);
  }
  return { lat: hit.latitude, lng: hit.longitude };
}

const validCoords = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export default async function handler(req, res) {
  try {
    const q = getQuery(req);
    const hasCoords = q.lat !== undefined && q.lat !== '' && q.lng !== undefined && q.lng !== '';
    let lat = hasCoords ? Number(q.lat) : NaN;
    let lng = hasCoords ? Number(q.lng) : NaN;
    const city = String(q.city || '').trim();
    if (hasCoords && !validCoords(lat, lng)) {
      return sendJson(res, 400, { error: { code: 'BAD_COORDINATES', message: 'Las coordenadas no son válidas para consultar el clima.' } });
    }
    if (!hasCoords) {
      if (!city || city.length > 80) {
        return sendJson(res, 400, { error: { code: 'BAD_COORDINATES', message: 'Faltan coordenadas o el nombre de la capital para consultar el clima.' } });
      }
      ({ lat, lng } = await cached(`geo:${city.toLowerCase()}:${String(q.country || '').toLowerCase()}`, 7 * 24 * 60 * 60 * 1000, () => geocodeCity(city, String(q.country || '').trim())));
    }
    const api = env('OPENMETEO_BASE_URL', 'https://api.open-meteo.com');
    const params = new URLSearchParams({
      latitude: lat.toFixed(3),
      longitude: lng.toFixed(3),
      current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: '5',
    });
    const key = `weather:${lat.toFixed(2)},${lng.toFixed(2)}`;
    const result = await cached(key, HALF_HOUR, async () => normalizeWeather(await fetchJson(`${api}/v1/forecast?${params}`, { timeoutMs: 8000 })));
    return sendJson(res, 200, result, { cacheSeconds: 900 });
  } catch (err) {
    return sendError(res, err);
  }
}
