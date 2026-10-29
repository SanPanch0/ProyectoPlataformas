// Normalizadores: convierten la respuesta de cada proveedor a un formato
// único que entiende el frontend. Son tolerantes: si un campo no existe,
// queda como null o [] y el frontend muestra "No disponible".
// Nunca se inventan datos.

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

// ---------------- Países ----------------

/** Extrae la lista de objetos de país de cualquier envoltorio conocido. */
export function extractCountryList(payload) {
  if (Array.isArray(payload)) return payload;
  if (isObj(payload)) {
    if (Array.isArray(payload.data?.objects)) return payload.data.objects; // REST Countries v5
    if (isObj(payload.data?.object)) return [payload.data.object];
    if (Array.isArray(payload.data)) return payload.data;
    if (isObj(payload.data) && (payload.data.names || payload.data.name)) return [payload.data];
    if (Array.isArray(payload.countries)) return payload.countries;
    if (payload.names || payload.name) return [payload];
  }
  return [];
}

function normalizeCurrencies(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((c) => (typeof c === 'string' ? { code: c.toUpperCase(), name: null, symbol: null } : {
        code: str(c?.code)?.toUpperCase() || str(c?.iso_4217)?.toUpperCase() || null,
        name: str(c?.name) || str(c?.name_es) || null,
        symbol: str(c?.symbol) || null,
      }))
      .filter((c) => c.code && /^[A-Z]{3}$/.test(c.code));
  }
  if (isObj(raw)) {
    // Formato antiguo (v3.1): { PEN: { name, symbol } }
    return Object.entries(raw)
      .filter(([code]) => /^[A-Z]{3}$/i.test(code))
      .map(([code, c]) => ({ code: code.toUpperCase(), name: str(c?.name), symbol: str(c?.symbol) }));
  }
  if (typeof raw === 'string' && /^[A-Z]{3}$/i.test(raw)) return [{ code: raw.toUpperCase(), name: null, symbol: null }];
  return [];
}

function normalizeLanguages(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((l) => {
        if (typeof l === 'string') return { code: null, name: l };
        if (!isObj(l)) return null;
        const name = str(l.name_en) || str(l.english_name) || str(l.name) || str(l.english) || (isObj(l.names) ? str(l.names.eng) || str(l.names.en) : null) || str(l.native_name) || str(l.native);
        const code = str(l.iso639_1) || str(l.iso_639_1) || str(l.bcp47) || str(l.bcp_47) || str(l.iso639_3) || str(l.iso_639_3) || str(l.iso639_2) || str(l.code);
        return name || code ? { code, name: name || code } : null;
      })
      .filter(Boolean);
  }
  if (isObj(raw)) {
    // Formato antiguo: { spa: "Spanish", que: "Quechua" }
    return Object.entries(raw).map(([code, name]) => ({ code, name: str(name) || code }));
  }
  return [];
}

function normalizeCapital(c) {
  // v5: capitals: [{ name, coordinates: { lat, lng }, attributes: { primary } }]
  if (Array.isArray(c.capitals) && c.capitals.length) {
    const primary = c.capitals.find((x) => x?.attributes?.primary) || c.capitals[0];
    const name = typeof primary === 'string' ? primary : str(primary?.name);
    const lat = num(primary?.coordinates?.lat ?? primary?.coordinates?.latitude ?? primary?.lat);
    const lng = num(primary?.coordinates?.lng ?? primary?.coordinates?.lon ?? primary?.coordinates?.longitude ?? primary?.lng);
    return { name, lat, lng, all: c.capitals.map((x) => (typeof x === 'string' ? x : str(x?.name))).filter(Boolean) };
  }
  // v3.1 / otros: capital: "Lima" o ["Lima"]; capitalInfo.latlng
  const cap = Array.isArray(c.capital) ? c.capital : (c.capital ? [c.capital] : []);
  const capName = cap.map((x) => (typeof x === 'string' ? x : str(x?.name))).filter(Boolean);
  const latlng = c.capitalInfo?.latlng;
  return {
    name: capName[0] || null,
    lat: Array.isArray(latlng) ? num(latlng[0]) : null,
    lng: Array.isArray(latlng) ? num(latlng[1]) : null,
    all: capName,
  };
}

function normalizeFlag(c) {
  const f = c.flag;
  const flags = c.flags;
  return {
    emoji: (isObj(f) ? str(f.emoji) : str(f)) || null,
    png: (isObj(f) ? str(f.url_png) || str(f.png) : null) || (isObj(flags) ? str(flags.png) : null),
    svg: (isObj(f) ? str(f.url_svg) || str(f.svg) : null) || (isObj(flags) ? str(flags.svg) : null),
    alt: (isObj(f) ? str(f.description) || str(f.alt) : null) || (isObj(flags) ? str(flags.alt) : null),
  };
}

function spanishName(c) {
  const t = c.names?.translations || c.translations;
  if (isObj(t)) {
    const es = t.spa || t.es;
    if (typeof es === 'string') return es;
    if (isObj(es)) return str(es.common) || str(es.official);
  }
  const native = c.names?.native || c.name?.nativeName;
  if (isObj(native?.spa)) return str(native.spa.common);
  return null;
}

/** Convierte un país de cualquier proveedor al formato de la aplicación. */
export function normalizeCountry(c, source) {
  if (!isObj(c)) return null;
  const nameObj = isObj(c.names) ? c.names : isObj(c.name) ? c.name : null;
  const common = str(nameObj?.common) || str(c.name) || null;
  const codes = isObj(c.codes) ? c.codes : {};
  const alpha2 = str(codes.alpha_2) || str(c.cca2) || str(c.alpha2) || str(c.alpha2Code) || str(c.iso2) || str(c.code);
  const alpha3 = str(codes.alpha_3) || str(c.cca3) || str(c.alpha3) || str(c.alpha3Code) || str(c.iso3);
  const capital = normalizeCapital(c);
  const latlng = Array.isArray(c.latlng) ? c.latlng : null;
  const timezones = Array.isArray(c.timezones) ? c.timezones.filter((t) => typeof t === 'string') : (typeof c.timezone === 'string' ? [c.timezone] : []);
  return {
    source,
    name: {
      common,
      official: str(nameObj?.official) || null,
      es: spanishName(c),
    },
    codes: { alpha2: alpha2 ? alpha2.toUpperCase() : null, alpha3: alpha3 ? alpha3.toUpperCase() : null },
    capital,
    languages: normalizeLanguages(c.languages),
    population: num(c.population),
    timezones,
    currencies: normalizeCurrencies(c.currencies),
    flag: normalizeFlag(c),
    region: str(c.region) || str(c.continent) || null,
    subregion: str(c.subregion) || null,
    coordinates: {
      lat: latlng ? num(latlng[0]) : num(c.coordinates?.lat ?? c.lat),
      lng: latlng ? num(latlng[1]) : num(c.coordinates?.lng ?? c.lng),
    },
  };
}

// ---------------- Tipos de cambio (Frankfurter) ----------------

/**
 * Frankfurter v2 /v2/rates devuelve un arreglo de filas
 *   [{ date, base, quote, rate }, ...]
 * La v1 devolvía { base, date, rates: { PEN: 3.7 } }. Aceptamos ambos.
 */
export function normalizeRates(payload, base) {
  const rates = {};
  const dates = new Set();
  if (Array.isArray(payload)) {
    for (const row of payload) {
      const quote = str(row?.quote)?.toUpperCase();
      const rate = num(row?.rate);
      if (quote && rate !== null && rate > 0) {
        rates[quote] = rate;
        if (str(row.date)) dates.add(row.date);
      }
    }
  } else if (isObj(payload) && isObj(payload.rates)) {
    for (const [q, r] of Object.entries(payload.rates)) {
      const rate = num(r);
      if (rate !== null && rate > 0) rates[q.toUpperCase()] = rate;
    }
    if (str(payload.date)) dates.add(payload.date);
  } else if (isObj(payload) && str(payload.quote) && num(payload.rate) !== null) {
    rates[payload.quote.toUpperCase()] = num(payload.rate);
    if (str(payload.date)) dates.add(payload.date);
  }
  const sorted = [...dates].sort();
  return {
    base: base.toUpperCase(),
    rates,
    date: sorted.length ? sorted[sorted.length - 1] : null,
    oldestDate: sorted.length ? sorted[0] : null,
  };
}

// ---------------- Fotos ----------------

export function withUtm(url, appName) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', appName);
    u.searchParams.set('utm_medium', 'referral');
    return u.toString();
  } catch {
    return url;
  }
}

export function normalizeUnsplash(payload, appName) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results
    .filter((p) => p?.urls?.small || p?.urls?.regular)
    .map((p) => ({
      id: String(p.id),
      thumb: p.urls.small || p.urls.regular,
      src: p.urls.regular || p.urls.small,
      width: num(p.width),
      height: num(p.height),
      color: str(p.color),
      alt: str(p.alt_description) || str(p.description) || 'Fotografía del destino',
      author: str(p.user?.name) || 'Autor de Unsplash',
      authorUrl: withUtm(p.user?.links?.html, appName),
      pageUrl: withUtm(p.links?.html, appName),
      license: 'Licencia de Unsplash',
      licenseUrl: withUtm('https://unsplash.com/license', appName),
      provider: 'Unsplash',
      providerUrl: withUtm('https://unsplash.com/', appName),
    }));
}

function stripHtml(html) {
  if (typeof html !== 'string') return null;
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
  return text || null;
}

export function normalizeWikimedia(payload) {
  const pages = payload?.query?.pages;
  const list = Array.isArray(pages) ? pages : isObj(pages) ? Object.values(pages) : [];
  return list
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => {
      const info = Array.isArray(p.imageinfo) ? p.imageinfo[0] : null;
      if (!info) return null;
      const mime = str(info.mime) || '';
      // Solo fotografías (JPEG/WebP): así se evitan mapas, banderas y diagramas en PNG/SVG.
      if (mime && !/^image\/(jpeg|webp)$/.test(mime)) return null;
      const meta = info.extmetadata || {};
      const title = str(p.title)?.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '') || null;
      return {
        id: String(p.pageid ?? p.title),
        thumb: str(info.thumburl) || str(info.url),
        src: str(info.thumburl) || str(info.url),
        width: num(info.thumbwidth) || num(info.width),
        height: num(info.thumbheight) || num(info.height),
        color: null,
        alt: stripHtml(meta.ImageDescription?.value)?.slice(0, 160) || title || 'Fotografía del destino',
        author: stripHtml(meta.Artist?.value) || 'Autor en Wikimedia Commons',
        authorUrl: str(info.descriptionurl),
        pageUrl: str(info.descriptionurl),
        license: stripHtml(meta.LicenseShortName?.value) || 'Ver licencia en Wikimedia Commons',
        licenseUrl: str(meta.LicenseUrl?.value) || str(info.descriptionurl),
        provider: 'Wikimedia Commons',
        providerUrl: 'https://commons.wikimedia.org/',
      };
    })
    .filter((p) => p && p.src);
}

// ---------------- Alojamientos ----------------

/** Booking.com (RapidAPI, proveedor DataCrawler, host booking-com15). */
export function normalizeBookingHotels(payload, { city, checkin, checkout, nights }) {
  const hotels = Array.isArray(payload?.data?.hotels) ? payload.data.hotels : Array.isArray(payload?.data) ? payload.data : [];
  return hotels
    .map((h) => {
      const p = isObj(h.property) ? h.property : h;
      const name = str(p.name) || str(h.hotel_name) || str(h.name);
      if (!name) return null;
      const gross = p.priceBreakdown?.grossPrice || h.priceBreakdown?.grossPrice || null;
      const total = num(gross?.value);
      const currency = str(gross?.currency) || str(p.currency);
      const photos = Array.isArray(p.photoUrls) ? p.photoUrls : Array.isArray(h.photoUrls) ? h.photoUrls : [];
      const photo = str(photos[0]) || str(p.main_photo_url) || str(h.max_photo_url) || null;
      const searchUrl = new URL('https://www.booking.com/searchresults.es.html');
      searchUrl.searchParams.set('ss', `${name}, ${city}`);
      if (checkin) searchUrl.searchParams.set('checkin', checkin);
      if (checkout) searchUrl.searchParams.set('checkout', checkout);
      searchUrl.searchParams.set('group_adults', '2');
      return {
        id: String(h.hotel_id ?? p.id ?? name),
        name,
        type: null,
        price: total !== null && currency
          ? { total, currency, nights, perNight: nights > 0 ? total / nights : null }
          : null,
        score: num(p.reviewScore ?? h.review_score),
        scoreWord: str(p.reviewScoreWord) || str(h.review_score_word),
        reviewCount: num(p.reviewCount ?? h.review_nr),
        stars: num(p.propertyClass ?? p.accuratePropertyClass ?? h.class),
        photo,
        location: str(p.wishlistName) || city,
        address: null,
        lat: num(p.latitude ?? h.latitude),
        lng: num(p.longitude ?? h.longitude),
        url: searchUrl.toString(),
        urlLabel: 'Buscar en Booking.com',
        source: 'Booking.com vía RapidAPI',
      };
    })
    .filter(Boolean);
}

const OSM_TYPES = {
  hotel: 'Hotel',
  hostel: 'Hostal',
  guest_house: 'Casa de huéspedes',
  apartment: 'Apartamento turístico',
  motel: 'Motel',
};

/** OpenStreetMap (Overpass): directorio real de alojamientos, sin precios. */
export function normalizeOsmHotels(payload, city) {
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const seen = new Set();
  return elements
    .map((e) => {
      const t = e.tags || {};
      const name = str(t.name) || str(t['name:es']) || str(t['name:en']);
      if (!name || seen.has(name.toLowerCase())) return null;
      seen.add(name.toLowerCase());
      const addr = [t['addr:street'] && `${t['addr:street']} ${t['addr:housenumber'] || ''}`.trim(), t['addr:city']].filter(Boolean).join(', ');
      const website = str(t.website) || str(t['contact:website']) || null;
      return {
        id: `${e.type}/${e.id}`,
        name,
        type: OSM_TYPES[t.tourism] || 'Alojamiento',
        price: null,
        score: null,
        scoreWord: null,
        reviewCount: null,
        stars: num(t.stars),
        photo: null,
        location: city,
        address: addr || null,
        lat: num(e.lat ?? e.center?.lat),
        lng: num(e.lon ?? e.center?.lon),
        url: website && /^https?:\/\//i.test(website) ? website : `https://www.openstreetmap.org/${e.type}/${e.id}`,
        urlLabel: website ? 'Sitio web del alojamiento' : 'Ver en OpenStreetMap',
        source: 'OpenStreetMap',
      };
    })
    .filter(Boolean);
}
/** OpenStreetMap (Nominatim, formato jsonv2): misma forma que Overpass, sin precios. */
export function normalizeNominatimHotels(payload, city) {
  const list = Array.isArray(payload) ? payload : [];
  const elements = list
    .filter((r) => (r.category || r.class) === 'tourism' && OSM_TYPES[r.type])
    .map((r) => ({
      type: r.osm_type,
      id: r.osm_id,
      lat: num(r.lat),
      lon: num(r.lon),
      tags: {
        tourism: r.type,
        name: str(r.name) || str(r.display_name)?.split(',')[0],
        stars: r.extratags?.stars,
        website: r.extratags?.website || r.extratags?.['contact:website'],
        'addr:street': r.address?.road,
        'addr:housenumber': r.address?.house_number,
      },
    }));
  return normalizeOsmHotels({ elements }, city);
}