// Tripadvisor Terra API (reemplaza a la Content API, cerrada el 31-ago-2026).
// Documentación: https://docs.terra.tripadvisor.com/
//   GET https://terra.tripadvisor.com/api/locations/nearby
//       ?version=1&lat=..&lon=..&radius=5&unit=KM&category=HOTEL&include_photo=true&size=8&locale=es
//   Cabecera: X-API-Key: <clave>
// Una sola llamada devuelve hoteles cercanos con su foto (cuida la cuota gratuita).
// Límite de búsqueda "nearby": 1 petición por segundo; por eso el resultado se guarda en caché.
//
// IMPORTANTE: la documentación pública no detalla todos los campos de cada lugar (dice
// "representación completa de Location"), y los campos vacíos se omiten. Por eso la lectura
// es tolerante: busca cada dato por varios nombres posibles y nunca inventa valores.
// Si las tarjetas salen vacías, ejecuta `npm run probar-tripadvisor` y revisa los nombres reales.
import { fetchJson, env } from './upstream.js';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Busca la primera clave (a cualquier profundidad) cuyo nombre esté en `keys`. */
export function deepFind(node, keys, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return undefined;
  if (!Array.isArray(node)) {
    for (const k of keys) if (node[k] !== undefined && node[k] !== null) return node[k];
  }
  for (const child of Array.isArray(node) ? node : Object.values(node)) {
    const hit = deepFind(child, keys, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Texto traducido: acepta "texto", [{locale,value}], {es:"texto"} o {es:{value:"texto"}}. */
export function pickText(v, depth = 0) {
  if (v === undefined || v === null || depth > 4) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) {
    for (const item of v) {
      const t = pickText(item, depth + 1);
      if (t) return t;
    }
    return null;
  }
  if (isObj(v)) {
    for (const k of ['value', 'text', 'name', 'full', 'address_string', 'formatted']) {
      const t = pickText(v[k], depth + 1);
      if (t) return t;
    }
    for (const val of Object.values(v)) {
      const t = pickText(val, depth + 1);
      if (t) return t;
    }
  }
  return null;
}

const toNum = (v) => {
  if (isObj(v)) return toNum(v.value ?? v.rating ?? v.overall ?? v.average);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function normalizeTerraHotel(item) {
  const name = pickText(item?.names) || pickText(item?.name);
  if (!name) return null;
  const ratings = item.traveler_ratings;
  const rating = toNum(ratings?.overall ?? ratings?.rating ?? ratings);
  const reviews = toNum(deepFind(ratings, ['review_count', 'reviews_count', 'num_reviews', 'total_reviews', 'count', 'total']));
  const photo = deepFind(item.photo ?? item.photos ?? item, ['original_size_url', 'large_url', 'url_large']) || null;
  const url = deepFind(item, ['web_url', 'webUrl']) || `https://www.tripadvisor.com/Search?q=${encodeURIComponent(name)}`;
  const km = toNum(item.distance_kilometers);
  return {
    name,
    type: 'Hotel',
    stars: null,
    address: pickText(item.addresses) || pickText(item.address),
    location: km !== null ? `A ${km.toFixed(1).replace('.', ',')} km del centro` : null,
    score: rating,
    scoreWord: rating !== null ? 'en Tripadvisor' : null,
    reviewCount: reviews,
    photo: typeof photo === 'string' && /^https:\/\//.test(photo) ? photo : null,
    price: null,
    url,
    urlLabel: 'Ver en Tripadvisor',
    source: 'Tripadvisor',
  };
}

export async function fetchTripadvisorHotels({ city, lat, lng, limit = 8 }) {
  const key = env('TRIPADVISOR_API_KEY');
  if (!key) return { missingKey: true, hotels: [] };
  if (lat === null || lng === null) return { hotels: [], noCoordinates: true };
  const base = env('TRIPADVISOR_BASE_URL', 'https://terra.tripadvisor.com');
  const params = new URLSearchParams({
    version: '1',
    lat: String(lat),
    lon: String(lng),
    radius: '5',
    unit: 'KM',
    category: 'HOTEL',
    include_photo: 'true',
    sort: 'rating,desc',
    size: String(limit),
    locale: 'es',
  });
  const payload = await fetchJson(`${base}/api/locations/nearby?${params}`, {
    headers: { 'X-API-Key': key },
    timeoutMs: 10000,
  });
  const list = Array.isArray(payload?.data) ? payload.data : [];
  return { hotels: list.map(normalizeTerraHotel).filter(Boolean).slice(0, limit), city };
}
