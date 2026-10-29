// Pruebas de integración del servidor (/api/*) contra un servidor SIMULADO
// que imita a cada API externa. Permite probar sin Internet los casos de
// error: 401, 403, 404, 422, 429, 500, JSON inválido, tiempo agotado y falta de claves.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { rcV5, wrapV5, countriesDev, fxRows, unsplash, wikimedia, bookingDest, bookingHotels, overpass, openMeteo, wikipedia, taNearby } from './fixtures.js';

const mode = {};
const calls = [];
let mock;
let app;
let base;

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function special(res, m) {
  if (!m) return false;
  if (m === 'timeout') return true; // nunca responde
  if (m === 'invalid') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('<html>no es json'); return true; }
  reply(res, Number(m), { errors: [{ message: `simulado ${m}` }], message: `simulado ${m}` });
  return true;
}

before(async () => {
  mock = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    calls.push({ path: url.pathname, auth: req.headers.authorization || req.headers['x-rapidapi-key'] || null });
    const p = url.pathname;
    if (p.startsWith('/rc/')) {
      if (special(res, mode.rc)) return;
      const code = p.split('/').pop();
      if (rcV5[code]) return reply(res, 200, wrapV5([rcV5[code]]));
      if (url.searchParams.get('q')?.toLowerCase() === 'japan') return reply(res, 200, wrapV5([rcV5.JP]));
      return reply(res, 404, { errors: [{ message: 'Not found' }] });
    }
    if (p.startsWith('/cd/')) {
      if (special(res, mode.cd)) return;
      const code = p.split('/').pop();
      return countriesDev[code] ? reply(res, 200, countriesDev[code]) : reply(res, 404, { message: 'not found' });
    }
    if (p === '/fx/v2/rates') {
      if (special(res, mode.fx)) return;
      const quotes = (url.searchParams.get('quotes') || '').split(',');
      if (quotes.some((q) => !['PEN', 'JPY', 'EUR'].includes(q))) return reply(res, 422, { status: 422, message: 'invalid currency' });
      return reply(res, 200, fxRows(quotes));
    }
    if (p === '/us/search/photos') {
      if (special(res, mode.us)) return;
      return reply(res, 200, unsplash);
    }
    if (p === '/wm') {
      if (special(res, mode.wm)) return;
      return reply(res, 200, wikimedia);
    }
    if (p === '/bk/api/v1/hotels/searchDestination') {
      if (special(res, mode.bk)) return;
      return reply(res, 200, bookingDest);
    }
    if (p === '/bk/api/v1/hotels/searchHotels') {
      if (special(res, mode.bkHotels)) return;
      return reply(res, 200, bookingHotels);
    }
    if (p === '/op') {
      if (special(res, mode.op)) return;
      if (mode.opEmptyFirst && (mode.opCalls = (mode.opCalls || 0) + 1) === 1) return reply(res, 200, { elements: [] });
      return reply(res, 200, overpass);
    }
    if (p === '/geo/v1/search') {
      if (special(res, mode.geo)) return;
      return reply(res, 200, url.searchParams.get('name') === 'Tokyo' ? { results: [{ name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan' }] } : {});
    }
    if (p === '/ta/api/locations/nearby') {
      if (special(res, mode.ta)) return;
      calls[calls.length - 1].auth = req.headers['x-api-key'] || null;
      calls[calls.length - 1].query = url.search;
      return reply(res, 200, taNearby);
    }
    if (p === '/om/v1/forecast') {
      if (special(res, mode.om)) return;
      return reply(res, 200, openMeteo);
    }
    if (p.startsWith('/wp/api/rest_v1/page/summary/')) {
      if (special(res, mode.wp)) return;
      const title = decodeURIComponent(p.split('/').pop()).replace(/_/g, ' ');
      if (wikipedia[title]) return reply(res, 200, wikipedia[title]);
      return reply(res, 404, { type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found', title: 'Not found.' });
    }
    reply(res, 404, {});
  });
  await new Promise((r) => mock.listen(0, r));
  const m = `http://127.0.0.1:${mock.address().port}`;
  Object.assign(process.env, {
    RESTCOUNTRIES_BASE_URL: `${m}/rc/countries/v5`,
    COUNTRIESDEV_BASE_URL: `${m}/cd`,
    FRANKFURTER_BASE_URL: `${m}/fx`,
    UNSPLASH_BASE_URL: `${m}/us`,
    WIKIMEDIA_API_URL: `${m}/wm`,
    RAPIDAPI_BOOKING_BASE_URL: `${m}/bk`,
    OVERPASS_URL: `${m}/op`,
    OPENMETEO_BASE_URL: `${m}/om`,
    GEOCODING_BASE_URL: `${m}/geo`,
    TRIPADVISOR_BASE_URL: `${m}/ta`,
    WIKIPEDIA_BASE_URL: `${m}/wp`,
  });
  const { createServer } = await import('../server.js');
  app = createServer();
  await new Promise((r) => app.listen(0, r));
  base = `http://127.0.0.1:${app.address().port}`;
});

after(() => {
  app?.closeAllConnections?.();
  mock?.closeAllConnections?.();
  app?.close();
  mock?.close();
});

beforeEach(async () => {
  for (const k of Object.keys(mode)) delete mode[k];
  calls.length = 0;
  const { clearCache } = await import('../lib/upstream.js');
  clearCache();
  process.env.RESTCOUNTRIES_API_KEY = 'clave-de-prueba-rc';
  process.env.UNSPLASH_ACCESS_KEY = 'clave-de-prueba-us';
  process.env.RAPIDAPI_KEY = 'clave-de-prueba-rapid';
  delete process.env.TRIPADVISOR_API_KEY;
});

const get = async (path) => {
  const res = await fetch(base + path);
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text), text, headers: res.headers };
};

// ---------- Países ----------

test('País: Perú, Japón y España con REST Countries v5', async () => {
  for (const [code, capital, cur] of [['PE', 'Lima', 'PEN'], ['JP', 'Tokyo', 'JPY'], ['ES', 'Madrid', 'EUR']]) {
    const r = await get(`/api/country?code=${code}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.country.capital.name, capital);
    assert.equal(r.body.country.currencies[0].code, cur);
    assert.equal(r.body.country.source, 'REST Countries v5');
  }
  assert.equal(calls[0].auth, 'Bearer clave-de-prueba-rc');
});

test('País: búsqueda por texto libre', async () => {
  const r = await get('/api/country?q=japan');
  assert.equal(r.status, 200);
  assert.equal(r.body.country.codes.alpha2, 'JP');
});

test('País: entrada vacía (400) y código no válido (400)', async () => {
  assert.equal((await get('/api/country')).status, 400);
  assert.equal((await get('/api/country?code=JPN')).status, 400);
});

test('País inexistente -> 404 con mensaje claro', async () => {
  const r = await get('/api/country?code=QQ');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'COUNTRY_NOT_FOUND');
});

test('País: falta la clave -> alternativa countries.dev con aviso', async () => {
  delete process.env.RESTCOUNTRIES_API_KEY;
  const r = await get('/api/country?code=JP');
  assert.equal(r.status, 200);
  assert.equal(r.body.country.source, 'countries.dev (GeoNames)');
  assert.match(r.body.warnings[0], /falta la clave/);
  assert.ok(!calls.some((c) => c.path.startsWith('/rc/')), 'no debe llamar a REST Countries sin clave');
});

for (const m of ['401', '403', '429', '500', 'invalid']) {
  test(`País: REST Countries responde ${m} -> alternativa countries.dev`, async () => {
    mode.rc = m;
    const r = await get('/api/country?code=PE');
    assert.equal(r.status, 200);
    assert.equal(r.body.country.source, 'countries.dev (GeoNames)');
    assert.ok(r.body.warnings.length);
  });
}

test('País: ambos proveedores caídos -> 502 sin exponer claves', async () => {
  mode.rc = '500';
  mode.cd = '500';
  const r = await get('/api/country?code=PE');
  assert.equal(r.status, 502);
  assert.equal(r.body.error.code, 'COUNTRY_UNAVAILABLE');
  assert.ok(!r.text.includes('clave-de-prueba'));
});

test('País: tiempo agotado en REST Countries -> alternativa', { timeout: 20000 }, async () => {
  mode.rc = 'timeout';
  const r = await get('/api/country?code=JP');
  assert.equal(r.status, 200);
  assert.match(r.body.warnings[0], /no respondió a tiempo/);
});

// ---------- Tipos de cambio ----------

test('Tasas: JPY con PEN y USD, fecha de referencia', async () => {
  const r = await get('/api/rates?currencies=JPY');
  assert.equal(r.status, 200);
  assert.equal(r.body.rates.USD, 1);
  assert.equal(r.body.rates.PEN, 3.5);
  assert.equal(r.body.rates.JPY, 150);
  assert.equal(r.body.date, '2026-10-23');
  assert.deepEqual(r.body.unsupported, []);
});

test('Tasas: moneda no admitida se informa sin romper USD/PEN', async () => {
  const r = await get('/api/rates?currencies=XXX');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.unsupported, ['XXX']);
  assert.equal(r.body.rates.PEN, 3.5);
});

test('Tasas: código mal formado -> 400', async () => {
  assert.equal((await get('/api/rates?currencies=JP1')).status, 400);
  assert.equal((await get('/api/rates?currencies=EURO')).status, 400);
  // "yen" en minúsculas pasa a "YEN": formato válido, pero moneda inexistente -> no admitida.
  const r = await get('/api/rates?currencies=yen');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.unsupported, ['YEN']);
});

test('Tasas: Frankfurter caído -> 502; límite -> 429', async () => {
  mode.fx = '500';
  assert.equal((await get('/api/rates?currencies=EUR')).status, 502);
  mode.fx = '429';
  const r = await get('/api/rates?currencies=EUR');
  assert.equal(r.status, 429);
  assert.match(r.body.error.message, /límite/);
});

// ---------- Fotos ----------

test('Fotos: Unsplash con clave y Client-ID', async () => {
  const r = await get('/api/photos?query=Tokyo%20Japan');
  assert.equal(r.status, 200);
  assert.equal(r.body.provider, 'Unsplash');
  assert.equal(r.body.photos.length, 2);
  assert.equal(calls.find((c) => c.path === '/us/search/photos').auth, 'Client-ID clave-de-prueba-us');
});

test('Fotos: sin clave o con 401/429 -> Wikimedia Commons', async () => {
  delete process.env.UNSPLASH_ACCESS_KEY;
  let r = await get('/api/photos?query=Lima');
  assert.equal(r.body.provider, 'Wikimedia Commons');
  process.env.UNSPLASH_ACCESS_KEY = 'x';
  for (const m of ['401', '429']) {
    mode.us = m;
    r = await get(`/api/photos?query=Lima${m}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.provider, 'Wikimedia Commons');
  }
});

test('Fotos: consulta vacía -> 400; ambos caídos -> 502', async () => {
  assert.equal((await get('/api/photos?query=')).status, 400);
  mode.us = '500';
  mode.wm = '500';
  assert.equal((await get('/api/photos?query=Madrid')).status, 502);
});

// ---------- Alojamientos ----------

test('Hoteles: Booking (RapidAPI) con precios y cabeceras correctas', async () => {
  const r = await get('/api/hotels?city=Tokyo&country=Japan&lat=35.68&lng=139.75&checkin=2026-11-23&checkout=2026-11-25');
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, 'prices');
  assert.equal(r.body.hotels[0].price.perNight, 150);
  assert.equal(calls.find((c) => c.path.endsWith('searchDestination')).auth, 'clave-de-prueba-rapid');
  assert.equal(r.body.externalLinks.length, 3);
});

test('Hoteles: sin clave -> OpenStreetMap sin precios, con aviso', async () => {
  delete process.env.RAPIDAPI_KEY;
  const r = await get('/api/hotels?city=Tokyo&country=Japan&lat=35.68&lng=139.75');
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, 'directory');
  assert.ok(r.body.hotels.every((h) => h.price === null));
  assert.match(r.body.warnings[0], /falta RAPIDAPI_KEY/);
});

test('Hoteles: RapidAPI 403 (sin suscripción) -> OpenStreetMap', async () => {
  mode.bk = '403';
  const r = await get('/api/hotels?city=Tokyo&country=Japan&lat=35.68&lng=139.75');
  assert.equal(r.body.kind, 'directory');
  assert.match(r.body.warnings[0], /403/);
});

test('Hoteles: todo caído -> solo enlaces externos, sin inventar hoteles', async () => {
  mode.bk = '500';
  mode.op = '500';
  const r = await get('/api/hotels?city=Tokyo&country=Japan&lat=35.68&lng=139.75');
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, 'links-only');
  assert.deepEqual(r.body.hotels, []);
  assert.ok(r.body.externalLinks.length > 0);
});

test('Hoteles: fechas inválidas y ciudad vacía -> 400', async () => {
  assert.equal((await get('/api/hotels?city=Lima&checkin=2026-11-25&checkout=2026-11-20')).status, 400);
  assert.equal((await get('/api/hotels?city=')).status, 400);
});

// ---------- Varios ----------

test('Estado: solo indica sí/no, nunca el valor de la clave', async () => {
  const r = await get('/api/status');
  assert.deepEqual(r.body, { restCountries: true, unsplash: true, bookingRapidApi: true, tripadvisor: false, frankfurter: true });
  assert.ok(!r.text.includes('clave-de-prueba'));
});

test('Archivos estáticos, ruta inexistente y salida de carpeta bloqueada', async () => {
  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Guía Global de Viajes/);
  assert.equal((await fetch(base + '/api/nada')).status, 404);
  const env = await fetch(base + '/../.env.example');
  assert.notEqual(env.status, 200);
  const js = await fetch(base + '/js/app.js');
  assert.match(js.headers.get('content-type'), /javascript/);
});

// ---------- Clima (Open-Meteo) ----------

test('Clima: pronóstico normalizado con textos en español', async () => {
  const r = await get('/api/weather?lat=35.68&lng=139.75');
  assert.equal(r.status, 200);
  assert.equal(r.body.provider, 'Open-Meteo');
  assert.equal(r.body.current.temp, 17.4);
  assert.equal(r.body.current.label, 'Parcialmente nublado');
  assert.equal(r.body.days.length, 3);
  assert.equal(r.body.days[1].label, 'Lluvia');
  assert.equal(r.body.days[2].label, 'Tormenta');
  assert.equal(r.body.days[2].min, null, 'un valor ausente no debe convertirse en 0');
});

test('Clima: coordenadas ausentes o fuera de rango (400)', async () => {
  assert.equal((await get('/api/weather')).status, 400);
  assert.equal((await get('/api/weather?lat=abc&lng=1')).status, 400);
  assert.equal((await get('/api/weather?lat=95&lng=1')).status, 400);
  assert.equal(calls.length, 0, 'no se debe llamar a la API externa con datos inválidos');
});

test('Clima: errores de la API externa (500 y JSON inválido)', async () => {
  mode.om = '500';
  assert.equal((await get('/api/weather?lat=1&lng=1')).status, 502);
  mode.om = 'invalid';
  assert.equal((await get('/api/weather?lat=2&lng=2')).status, 502);
});

test('Clima: se guarda en caché (una sola llamada externa)', async () => {
  await get('/api/weather?lat=10&lng=10');
  await get('/api/weather?lat=10&lng=10');
  assert.equal(calls.filter((c) => c.path === '/om/v1/forecast').length, 1);
});

// ---------- Reseña (Wikipedia) ----------

test('Reseña: resumen y miniatura de Wikipedia', async () => {
  const r = await get(`/api/about?title=${encodeURIComponent('Japón')}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.provider, 'Wikipedia');
  assert.match(r.body.extract, /Asia oriental/);
  assert.equal(r.body.license, 'CC BY-SA 4.0');
});

test('Reseña: nombre ambiguo se reintenta con "(país)"', async () => {
  const r = await get('/api/about?title=Georgia');
  assert.equal(r.status, 200);
  assert.match(r.body.extract, /Cáucaso/);
});

test('Reseña: sin título (400) y página inexistente (404)', async () => {
  assert.equal((await get('/api/about')).status, 400);
  assert.equal((await get('/api/about?title=Narnia')).status, 404);
});

test('Clima: sin coordenadas, busca la capital por nombre (countries.dev no trae coordenadas)', async () => {
  const r = await get('/api/weather?city=Tokyo&country=Japan');
  assert.equal(r.status, 200);
  assert.equal(r.body.current.temp, 17.4);
  assert.ok(calls.some((c) => c.path === '/geo/v1/search'));
  assert.equal((await get('/api/weather?city=Ciudadinexistente&country=Nada')).status, 404);
  mode.geo = '500';
  assert.equal((await get('/api/weather?city=OtraCiudad')).status, 502);
});

// ---------- Hoteles: Tripadvisor (opcional) ----------

test('Hoteles: sin clave de Tripadvisor no se llama a su API', async () => {
  mode.bk = '403';
  const r = await get('/api/hotels?city=Tokyo&country=Japan&lat=35.68&lng=139.75');
  assert.equal(r.status, 200);
  assert.ok(!calls.some((c) => c.path.startsWith('/ta/')));
});

test('Hoteles: con clave, Terra aporta puntuación, foto y enlace (sin precios)', async () => {
  process.env.TRIPADVISOR_API_KEY = 'clave-de-prueba-ta';
  mode.bk = '403';
  const r = await get('/api/hotels?city=Tokyo&country=Japan&lat=35.68&lng=139.75');
  assert.equal(r.status, 200);
  assert.equal(r.body.provider, 'Tripadvisor (Terra API)');
  assert.equal(r.body.kind, 'ratings');
  const call = calls.find((c) => c.path === '/ta/api/locations/nearby');
  assert.equal(call.auth, 'clave-de-prueba-ta', 'la clave viaja en la cabecera X-API-Key');
  assert.match(call.query, /category=HOTEL/);
  assert.match(call.query, /include_photo=true/);
  assert.equal(calls.filter((c) => c.path.startsWith('/ta/')).length, 1, 'una sola llamada por búsqueda');
  const [uno, dos] = r.body.hotels;
  assert.equal(r.body.hotels.length, 2, 'un lugar sin nombre se descarta');
  assert.equal(uno.name, 'Hotel TA Uno');
  assert.equal(uno.score, 4.5);
  assert.equal(uno.reviewCount, 812);
  assert.equal(uno.photo, 'https://media-cdn.tripadvisor.com/1001.jpg');
  assert.equal(uno.address, 'Calle 1, Tokio');
  assert.equal(uno.price, null, 'no se inventan precios');
  assert.equal(dos.name, 'Hotel TA Dos');
  assert.equal(dos.score, 3.5, 'acepta la valoración como objeto {value}');
  assert.equal(dos.photo, null);
  assert.match(dos.url, /tripadvisor\.com\/Search\?q=Hotel%20TA%20Dos/);
  assert.ok(!JSON.stringify(r.body).includes('clave-de-prueba-ta'), 'la clave nunca llega al navegador');
});

test('Hoteles: si Tripadvisor falla (401), se usa OpenStreetMap', async () => {
  process.env.TRIPADVISOR_API_KEY = 'clave-mala';
  mode.bk = '403';
  mode.ta = '401';
  const r = await get('/api/hotels?city=Tokyo&country=Japan&lat=35.68&lng=139.75');
  assert.equal(r.status, 200);
  assert.match(r.body.provider, /OpenStreetMap/);
  assert.ok(r.body.warnings.some((w) => /Tripadvisor/.test(w)));
});

// ---------- Hoteles: países sin resultados ----------

test('Hoteles: si el radio de 3 km está vacío, amplía a 10 km', async () => {
  mode.bk = '403';
  mode.opEmptyFirst = true;
  const r = await get('/api/hotels?city=Tokyo&country=Japan&lat=35.68&lng=139.75');
  assert.equal(r.status, 200);
  assert.match(r.body.provider, /Overpass/);
  assert.ok(r.body.hotels.length > 0);
  assert.equal(calls.filter((c) => c.path === '/op').length, 2, 'una consulta por radio');
});

test('Hoteles: sin coordenadas, las busca por el nombre de la capital', async () => {
  mode.bk = '403';
  const r = await get('/api/hotels?city=Tokyo&country=Japan');
  assert.equal(r.status, 200);
  assert.ok(calls.some((c) => c.path === '/geo/v1/search'), 'consulta el geocodificador');
  assert.match(r.body.provider, /Overpass/);
  assert.ok(r.body.hotels.length > 0);
});
