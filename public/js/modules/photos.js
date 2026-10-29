// Módulo de fotografías (Unsplash, con alternativa Wikimedia Commons, vía /api/photos).
import { getJson } from './http.js';

export function photoQuery(country) {
  const capital = country.capital?.name;
  const name = country.name.common;
  return capital && capital !== name ? `${capital} ${name}` : name;
}

export async function fetchPhotos(country, { signal } = {}) {
  return getJson(`/api/photos?query=${encodeURIComponent(photoQuery(country))}`, { signal, timeoutMs: 20000 });
}
