// GET /api/hotels?city=Tokyo&country=Japan&lat=35.68&lng=139.69&currency=USD&checkin=2026-11-23&checkout=2026-11-25
//
// Proveedor principal: Booking.com vía RapidAPI (requiere RAPIDAPI_KEY y suscripción
// a la API "Booking COM" del proveedor DataCrawler, host booking-com15.p.rapidapi.com).
//   1) GET /api/v1/hotels/searchDestination?query=<ciudad>      -> dest_id, search_type
//   2) GET /api/v1/hotels/searchHotels?dest_id=...&search_type=...&arrival_date=...&departure_date=...
//
// Alternativas sin clave: OpenStreetMap (Overpass API, varios servidores) y, si falla,
// Nominatim. Devuelven alojamientos reales cerca del centro de la capital,
// SIN precios ni puntuaciones (OSM no los tiene).
import { fetchJson, getQuery, sendJson, sendError, env, cached, UpstreamError } from '../lib/upstream.js';
import { normalizeBookingHotels, normalizeOsmHotels, normalizeNominatimHotels } from '../lib/normalize.js';
import { fetchTripadvisorHotels } from '../lib/tripadvisor.js';

const HOUR = 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function defaultDates(now = new Date()) {
  const checkin = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30));
  const checkout = new Date(checkin.getTime() + 2 * 24 * 60 * 60 * 1000);
  return { checkin: isoDate(checkin), checkout: isoDate(checkout) };
}

export function externalLinks({ city, country, checkin, checkout }) {
  const place = [city, country].filter(Boolean).join(', ');
  const booking = new URL('https://www.booking.com/searchresults.es.html');
  booking.searchParams.set('ss', place);
  booking.searchParams.set('checkin', checkin);
  booking.searchParams.set('checkout', checkout);
  booking.searchParams.set('group_adults', '2');
  const google = new URL('https://www.google.com/travel/search');
  google.searchParams.set('q', `hoteles en ${place}`);
  const osm = new URL('https://www.openstreetmap.org/search');
  osm.searchParams.set('query', `hotel ${place}`);
  return [
    { label: 'Buscar en Booking.com', url: booking.toString() },
    { label: 'Buscar en Google Hoteles', url: google.toString() },
    { label: 'Ver hoteles en OpenStreetMap', url: osm.toString() },
  ];
}

async function fromBooking({ city, country, currency, checkin, checkout, nights }) {
  const key = env('RAPIDAPI_KEY');
  if (!key) throw new UpstreamError('MISSING_KEY', 'Falta RAPIDAPI_KEY.', 503);
  const host = env('RAPIDAPI_BOOKING_HOST', 'booking-com15.p.rapidapi.com');
  const base = env('RAPIDAPI_BOOKING_BASE_URL', `https://${host}`);
  const headers = { 'x-rapidapi-key': key, 'x-rapidapi-host': host };

  const dest = await fetchJson(`${base}/api/v1/hotels/searchDestination?query=${encodeURIComponent(`${city}, ${country}`)}`, { headers });
  if (dest && dest.status === false) {
    throw new UpstreamError('BOOKING_ERROR', `Booking (RapidAPI) respondió con un error: ${String(dest.message || 'sin detalle').slice(0, 120)}`, 502);
  }
  const options = Array.isArray(dest?.data) ? dest.data : [];
  const chosen = options.find((d) => String(d.search_type || d.dest_type).toLowerCase() === 'city') || options[0];
  if (!chosen?.dest_id) {
    return { hotels: [], destination: null };
  }

  const params = new URLSearchParams({
    dest_id: String(chosen.dest_id),
    search_type: String(chosen.search_type || chosen.dest_type || 'CITY').toUpperCase(),
    arrival_date: checkin,
    departure_date: checkout,
    adults: '2',
    room_qty: '1',
    page_number: '1',
    languagecode: 'es',
    currency_code: currency,
  });
  const result = await fetchJson(`${base}/api/v1/hotels/searchHotels?${params}`, { headers, timeoutMs: 15000 });
  if (result && result.status === false) {
    throw new UpstreamError('BOOKING_ERROR', `Booking (RapidAPI) respondió con un error: ${String(result.message || 'sin detalle').slice(0, 120)}`, 502);
  }
  return {
    hotels: normalizeBookingHotels(result, { city, checkin, checkout, nights }).slice(0, 12),
    destination: { name: chosen.name || chosen.label || city, id: String(chosen.dest_id) },
  };
}

// El servidor principal (overpass-api.de) está saturado en 2026 y responde 502
// cuando no tiene capacidad, así que se prueban varios servidores en orden.
const DEFAULT_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

function sortUseful(hotels) {
  // Primero los que tienen estrellas o web propia.
  return hotels.sort((a, b) => Number(Boolean(b.stars)) - Number(Boolean(a.stars)) || Number(!b.url.includes('openstreetmap')) - Number(!a.url.includes('openstreetmap')));
}

async function fromOverpass({ city, lat, lng }) {
  if (lat === null || lng === null) {
    throw new UpstreamError('NO_COORDINATES', 'no hay coordenadas de la capital', 422);
  }
  const custom = env('OVERPASS_URLS', env('OVERPASS_URL'));
  const urls = custom ? custom.split(',').map((u) => u.trim()).filter(Boolean) : DEFAULT_OVERPASS;
  // Consulta ligera (radio 3 km) para que los servidores no la rechacen.
  const query = `[out:json][timeout:15];
nwr["tourism"~"^(hotel|hostel|guest_house|apartment|motel)$"]["name"](around:3000,${lat},${lng});
out center 40;`;
  // Todos los servidores se consultan A LA VEZ y gana el primero que responde bien
  // (antes se probaban uno tras otro: con 3 servidores caídos eran hasta 45 s de espera).
  const errors = [];
  const attempts = urls.map(async (url) => {
    try {
      const payload = await fetchJson(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeoutMs: 9000,
      });
      return { hotels: sortUseful(normalizeOsmHotels(payload, city)).slice(0, 12) };
    } catch (err) {
      errors.push(`${new URL(url).hostname}: ${err.upstreamStatus || err.code}`);
      throw err;
    }
  });
  try {
    return await Promise.any(attempts);
  } catch {
    throw new UpstreamError('OVERPASS_UNAVAILABLE', `ningún servidor de Overpass respondió (${errors.join(', ')})`, 502);
  }
}

// Segundo respaldo sin clave: Nominatim (buscador oficial de OpenStreetMap).
async function fromNominatim({ city, country, lat, lng }) {
  const api = env('NOMINATIM_URL', 'https://nominatim.openstreetmap.org/search');
  const params = new URLSearchParams({ format: 'jsonv2', limit: '30', extratags: '1', 'accept-language': 'es' });
  if (lat !== null && lng !== null) {
    const d = 0.05; // unos 5 km alrededor del centro de la capital
    params.set('q', '[hotel]');
    params.set('viewbox', `${lng - d},${lat + d},${lng + d},${lat - d}`);
    params.set('bounded', '1');
  } else {
    params.set('q', `hotel in ${city}, ${country}`);
  }
  const payload = await fetchJson(`${api}?${params}`, { timeoutMs: 12000 });
  return { hotels: sortUseful(normalizeNominatimHotels(payload, city)).slice(0, 12) };
}

export async function resolveHotels(params) {
  const warnings = [];
  const links = externalLinks(params);
  try {
    const { hotels, destination } = await fromBooking(params);
    if (hotels.length) {
      return {
        provider: 'Booking.com vía RapidAPI',
        kind: 'prices',
        notice: `Precios totales para ${params.nights} noches (${params.checkin} → ${params.checkout}), 2 adultos, 1 habitación. Pueden cambiar al reservar.`,
        destination,
        hotels,
        externalLinks: links,
        warnings,
      };
    }
    warnings.push('Booking (RapidAPI) no devolvió alojamientos para esta ciudad; se consultó OpenStreetMap.');
  } catch (err) {
    warnings.push(err.code === 'MISSING_KEY'
      ? 'Booking (RapidAPI) no está configurado (falta RAPIDAPI_KEY); se muestran alojamientos de OpenStreetMap sin precios.'
      : `Booking (RapidAPI) falló (${err.message}); se muestran alojamientos de OpenStreetMap sin precios.`);
  }

  // 2) Tripadvisor Terra API (opcional, con TRIPADVISOR_API_KEY): foto y puntuación, sin precios por noche.
  try {
    const ta = await fetchTripadvisorHotels(params);
    if (ta.hotels.length) {
      return {
        provider: 'Tripadvisor (Terra API)',
        kind: 'ratings',
        notice: 'Alojamientos cercanos al centro de la capital con puntuación y fotografía de Tripadvisor. Tripadvisor no publica precios por noche: consúltalos en el enlace de cada hotel.',
        hotels: ta.hotels,
        externalLinks: links,
        warnings,
      };
    }
  } catch (err) {
    warnings.push(`Tripadvisor falló (${err.message}); se muestran alojamientos de OpenStreetMap sin precios.`);
  }

  const directory = (provider, hotels) => ({
    provider,
    kind: 'directory',
    notice: 'Alojamientos reales registrados en OpenStreetMap cerca del centro de la capital. OpenStreetMap no publica precios, puntuaciones ni disponibilidad: consúltalos en los enlaces externos.',
    hotels,
    externalLinks: links,
    warnings,
  });

  // 1) Overpass (varios servidores)
  let overpassError;
  try {
    const { hotels } = await fromOverpass(params);
    if (hotels.length) return directory('OpenStreetMap (Overpass API)', hotels);
  } catch (err) {
    overpassError = err;
  }

  // 2) Nominatim
  try {
    const { hotels } = await fromNominatim(params);
    if (overpassError) warnings.push(`Overpass no respondió (${overpassError.message}); se usó el buscador Nominatim de OpenStreetMap.`);
    if (hotels.length) return directory('OpenStreetMap (Nominatim)', hotels);
    return { ...directory('OpenStreetMap', []), notice: 'OpenStreetMap no tiene alojamientos registrados cerca del centro de esta capital. Puedes buscarlos en los enlaces externos (no son resultados de esta aplicación).' };
  } catch (err) {
    // 3) Si todo falla: solo enlaces externos
    warnings.push(`OpenStreetMap no respondió (Overpass: ${overpassError?.message || 'sin resultados'}; Nominatim: ${err.message}).`);
    return {
      provider: null,
      kind: 'links-only',
      notice: 'No se pudieron obtener alojamientos desde ninguna API. Puedes buscarlos en los enlaces externos (no son resultados de esta aplicación).',
      hotels: [],
      externalLinks: links,
      warnings,
    };
  }
}

export default async function handler(req, res) {
  try {
    const q = getQuery(req);
    const city = (q.city || '').trim();
    const country = (q.country || '').trim();
    if (!city) return sendJson(res, 400, { error: { code: 'EMPTY_CITY', message: 'Falta la ciudad para buscar alojamientos.' } });
    if (city.length > 80 || country.length > 80) return sendJson(res, 400, { error: { code: 'QUERY_TOO_LONG', message: 'Parámetros demasiado largos.' } });

    const currency = /^[A-Z]{3}$/.test((q.currency || '').toUpperCase()) ? q.currency.toUpperCase() : 'USD';
    const defaults = defaultDates();
    const checkin = DATE_RE.test(q.checkin || '') ? q.checkin : defaults.checkin;
    const checkout = DATE_RE.test(q.checkout || '') ? q.checkout : defaults.checkout;
    const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
    if (!(nights >= 1 && nights <= 30)) {
      return sendJson(res, 400, { error: { code: 'BAD_DATES', message: 'Las fechas no son válidas (entre 1 y 30 noches).' } });
    }
    const lat = Number.isFinite(Number(q.lat)) && q.lat !== '' ? Number(q.lat) : null;
    const lng = Number.isFinite(Number(q.lng)) && q.lng !== '' ? Number(q.lng) : null;

    const params = { city, country, currency, checkin, checkout, nights, lat, lng };
    const key = `hotels:${city.toLowerCase()}:${country.toLowerCase()}:${currency}:${checkin}:${checkout}`;
    // No guardamos en caché los resultados degradados, para reintentar la API en la siguiente búsqueda.
    const result = await cached(key, HOUR, () => resolveHotels(params), (r) => r.kind !== 'links-only');
    return sendJson(res, 200, result, { cacheSeconds: 1800 });
  } catch (err) {
    return sendError(res, err);
  }
}