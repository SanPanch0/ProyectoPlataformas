// Módulo de clima (Open-Meteo) y reseña del país (Wikipedia), vía /api/weather y /api/about.
import { getJson, AppError } from './http.js';

export function fetchWeather(country, { signal } = {}) {
  const city = country.capital?.name;
  const lat = country.capital?.lat ?? country.coordinates?.lat;
  const lng = country.capital?.lng ?? country.coordinates?.lng;
  const params = new URLSearchParams();
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  } else if (city) {
    // Sin coordenadas (p. ej. countries.dev): el servidor busca la ciudad por nombre.
    params.set('city', city);
    params.set('country', country.name.common);
  } else {
    throw new AppError('Este país no tiene una capital registrada para consultar el clima.', { code: 'NO_CAPITAL' });
  }
  return getJson(`/api/weather?${params}`, { signal, timeoutMs: 15000 });
}

export function fetchAbout(country, { signal } = {}) {
  return getJson(`/api/about?title=${encodeURIComponent(country.displayName)}`, { signal, timeoutMs: 15000 });
}
