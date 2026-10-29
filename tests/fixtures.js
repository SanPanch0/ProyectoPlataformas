// Respuestas de ejemplo con la FORMA documentada por cada proveedor.
// Los valores numéricos (tasas, población, precios) son de prueba, NO datos reales.
// Fuentes de la forma: README de REST Countries v5, docs de Frankfurter v2,
// documentación de Unsplash, API de Wikimedia, Booking COM (DataCrawler) y Overpass.

export const rcV5 = {
  JP: {
    names: { common: 'Japan', official: 'Japan', native: { jpn: { common: '日本', official: '日本' } } },
    codes: { alpha_2: 'JP', alpha_3: 'JPN' },
    capitals: [{ name: 'Tokyo', attributes: { primary: true }, coordinates: { lat: 35.68, lng: 139.75 } }],
    currencies: [{ code: 'JPY', name: 'Japanese yen', symbol: '¥' }],
    languages: [{ iso639_1: 'ja', name: 'Japanese' }],
    population: 123000000,
    timezones: ['UTC+09:00'],
    region: 'Asia',
    subregion: 'Eastern Asia',
    flag: { emoji: '🇯🇵', url_svg: 'https://flagcdn.com/jp.svg', url_png: 'https://flagcdn.com/w320/jp.png' },
  },
  PE: {
    names: { common: 'Peru', official: 'Republic of Peru' },
    codes: { alpha_2: 'PE', alpha_3: 'PER' },
    capitals: [{ name: 'Lima', attributes: { primary: true }, coordinates: { lat: -12.05, lng: -77.05 } }],
    currencies: [{ code: 'PEN', name: 'Peruvian sol', symbol: 'S/' }],
    languages: [{ iso639_1: 'es', name: 'Spanish' }, { iso639_3: 'que', name: 'Quechua' }, { iso639_1: 'ay', name: 'Aymara' }],
    population: 34000000,
    timezones: ['UTC-05:00'],
    region: 'Americas',
    subregion: 'South America',
    flag: { emoji: '🇵🇪', url_svg: 'https://flagcdn.com/pe.svg' },
  },
  ES: {
    names: { common: 'Spain', official: 'Kingdom of Spain' },
    codes: { alpha_2: 'ES', alpha_3: 'ESP' },
    capitals: [{ name: 'Madrid', attributes: { primary: true }, coordinates: { lat: 40.4, lng: -3.68 } }],
    currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }],
    languages: [{ iso639_1: 'es', name: 'Spanish' }],
    population: 48000000,
    timezones: ['UTC', 'UTC+01:00'],
    region: 'Europe',
    subregion: 'Southern Europe',
    flag: { emoji: '🇪🇸', url_svg: 'https://flagcdn.com/es.svg' },
  },
};

export const wrapV5 = (objs) => ({ data: { objects: objs, meta: { total: objs.length, count: objs.length, limit: 25, offset: 0, more: false } } });

// countries.dev: formato plano (name, capital, flag, currencies[], languages[])
export const countriesDev = {
  JP: { name: 'Japan', alpha2: 'JP', alpha3: 'JPN', capital: 'Tokyo', flag: '🇯🇵', currencies: [{ code: 'JPY', name: 'Japanese yen', symbol: '¥' }], languages: [{ iso639_1: 'ja', iso639_2: 'jpn', name: 'Japanese' }], population: 123000000, region: 'Asia' },
  PE: { name: 'Peru', alpha2: 'PE', alpha3: 'PER', capital: 'Lima', flag: '🇵🇪', currencies: [{ code: 'PEN', name: 'Peruvian sol', symbol: 'S/' }], languages: [{ iso639_1: 'es', iso639_2: 'spa', name: 'Spanish' }] },
};

// Tasas de PRUEBA con base USD (no son valores reales).
export const testUsdRates = { PEN: 3.5, JPY: 150, EUR: 0.9 };
export const fxRows = (quotes) => quotes.map((q) => ({ date: '2026-10-23', base: 'USD', quote: q, rate: testUsdRates[q] }));

export const unsplash = {
  total: 2,
  total_pages: 1,
  results: [
    { id: 'abc', width: 4000, height: 3000, color: '#a0b0c0', alt_description: 'Templo en Tokio', urls: { small: 'https://images.unsplash.com/photo-1?w=400', regular: 'https://images.unsplash.com/photo-1?w=1080' }, links: { html: 'https://unsplash.com/photos/abc' }, user: { name: 'Ana Foto', links: { html: 'https://unsplash.com/@ana' } } },
    { id: 'def', width: 4000, height: 3000, color: 'red;background:url(x)', alt_description: null, urls: { small: 'https://images.unsplash.com/photo-2?w=400' }, links: { html: 'https://unsplash.com/photos/def' }, user: { name: 'Luis', links: { html: 'https://unsplash.com/@luis' } } },
  ],
};

export const wikimedia = {
  query: {
    pages: [
      { pageid: 1, index: 1, title: 'File:Tokyo Tower.jpg', imageinfo: [{ mime: 'image/jpeg', url: 'https://upload.wikimedia.org/a.jpg', thumburl: 'https://upload.wikimedia.org/thumb/a.jpg', thumbwidth: 960, thumbheight: 640, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Tokyo_Tower.jpg', extmetadata: { Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:X">Usuario X</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } } }] },
      { pageid: 2, index: 2, title: 'File:Japan map.png', imageinfo: [{ mime: 'image/png', url: 'https://upload.wikimedia.org/map.png', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Japan_map.png', extmetadata: {} }] },
    ],
  },
};

export const bookingDest = { status: true, message: 'Success', data: [{ dest_id: '-246227', search_type: 'CITY', name: 'Tokyo', label: 'Tokyo, Tokyo Prefecture, Japan' }] };
export const bookingHotels = {
  status: true,
  message: 'Success',
  data: {
    hotels: [
      { hotel_id: 111, property: { name: 'Hotel de Prueba Shinjuku', reviewScore: 8.6, reviewScoreWord: 'Fabuloso', reviewCount: 1520, propertyClass: 4, photoUrls: ['https://cf.bstatic.com/x.jpg'], latitude: 35.69, longitude: 139.7, priceBreakdown: { grossPrice: { value: 300, currency: 'USD' } } } },
      { hotel_id: 222, property: { name: 'Hostal sin precio', photoUrls: [] } },
    ],
  },
};

export const overpass = {
  elements: [
    { type: 'node', id: 1, lat: 35.68, lon: 139.76, tags: { tourism: 'hotel', name: 'Hotel OSM Uno', stars: '4', website: 'https://example.org' } },
    { type: 'way', id: 2, center: { lat: 35.67, lon: 139.75 }, tags: { tourism: 'hostel', name: 'Hostal OSM Dos', 'addr:street': 'Calle 1', 'addr:housenumber': '5' } },
    { type: 'node', id: 3, lat: 35.6, lon: 139.7, tags: { tourism: 'hotel', name: 'Hotel OSM Uno' } },
    { type: 'node', id: 4, lat: 35.6, lon: 139.7, tags: { tourism: 'hotel' } },
  ],
};

// Open-Meteo: forma documentada de /v1/forecast (valores de PRUEBA).
export const openMeteo = {
  timezone: 'Asia/Tokyo',
  current: { time: '2026-10-29T10:00', temperature_2m: 17.4, relative_humidity_2m: 62, wind_speed_10m: 9.6, weather_code: 2 },
  daily: {
    time: ['2026-10-29', '2026-10-30', '2026-10-31'],
    weather_code: [2, 61, 95],
    temperature_2m_max: [20.1, 18.7, 19],
    temperature_2m_min: [12.3, 11, null],
  },
};

// Wikipedia REST: resumen de página (texto de PRUEBA).
export const wikipedia = {
  'Japón': { type: 'standard', title: 'Japón', extract: 'Japón es un país insular de Asia oriental.', thumbnail: { source: 'https://upload.wikimedia.org/jp.jpg' }, content_urls: { desktop: { page: 'https://es.wikipedia.org/wiki/Jap%C3%B3n' } } },
  'Georgia': { type: 'disambiguation', title: 'Georgia', extract: 'Georgia puede referirse a:' },
  'Georgia (país)': { type: 'standard', title: 'Georgia (país)', extract: 'Georgia es un país del Cáucaso.' },
};

// Tripadvisor Terra API: la documentación no detalla todos los campos, así que estas formas
// son SUPUESTAS (valores de PRUEBA). Se prueban dos variantes para comprobar la lectura tolerante.
export const taNearby = {
  data: [
    { id: 1001, names: [{ locale: 'es', value: 'Hotel TA Uno' }], addresses: [{ locale: 'es', value: 'Calle 1, Tokio' }], traveler_ratings: { overall: 4.5, review_count: 812 }, photo: { original_size_url: 'https://media-cdn.tripadvisor.com/1001.jpg' }, distance_kilometers: 0.84 },
    { id: 1002, names: 'Hotel TA Dos', traveler_ratings: { overall: { value: 3.5 } } },
    { id: 1003 },
  ],
  pagination: { page: 1, size: 8, total_elements: 3, total_pages: 1 },
};
