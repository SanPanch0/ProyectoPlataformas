import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCountryList, normalizeCountry, normalizeRates, normalizeUnsplash, normalizeWikimedia, normalizeBookingHotels, normalizeOsmHotels } from '../lib/normalize.js';
import { convert, crossRate, parseAmount, formatMoney } from '../public/js/modules/currency.js';
import { resolveCountryCode, spanishCountryName, normalizeText } from '../public/js/modules/countryNames.js';
import { rcV5, wrapV5, countriesDev, fxRows, unsplash, wikimedia, bookingHotels, overpass } from './fixtures.js';

test('REST Countries v5: extrae data.objects y normaliza Japón', () => {
  const [c] = extractCountryList(wrapV5([rcV5.JP])).map((x) => normalizeCountry(x, 'REST Countries v5'));
  assert.equal(c.name.common, 'Japan');
  assert.equal(c.codes.alpha2, 'JP');
  assert.equal(c.capital.name, 'Tokyo');
  assert.equal(c.capital.lat, 35.68);
  assert.deepEqual(c.currencies, [{ code: 'JPY', name: 'Japanese yen', symbol: '¥' }]);
  assert.deepEqual(c.languages, [{ code: 'ja', name: 'Japanese' }]);
  assert.equal(c.population, 123000000);
  assert.equal(c.flag.svg, 'https://flagcdn.com/jp.svg');
  assert.equal(c.region, 'Asia');
});

test('Formato antiguo v3.1 también se normaliza (monedas y capital)', () => {
  const v3 = { name: { common: 'Peru', official: 'Republic of Peru' }, cca2: 'PE', cca3: 'PER', capital: ['Lima'], capitalInfo: { latlng: [-12.05, -77.05] }, currencies: { PEN: { name: 'Peruvian sol', symbol: 'S/ ' } }, languages: { spa: 'Spanish', que: 'Quechua' }, population: 1, timezones: ['UTC-05:00'], flags: { png: 'p.png', svg: 'p.svg', alt: 'alt' }, translations: { spa: { common: 'Perú' } } };
  const c = normalizeCountry(v3, 'v3');
  assert.equal(c.capital.name, 'Lima');
  assert.equal(c.currencies[0].code, 'PEN');
  assert.equal(c.name.es, 'Perú');
  assert.equal(c.languages.length, 2);
});

test('countries.dev (plano) no inventa campos ausentes', () => {
  const c = normalizeCountry(countriesDev.PE, 'countries.dev');
  assert.equal(c.capital.name, 'Lima');
  assert.equal(c.flag.emoji, '🇵🇪');
  assert.equal(c.population, null);
  assert.deepEqual(c.timezones, []);
  assert.equal(c.subregion, null);
});

test('Frankfurter v2: filas -> mapa de tasas con fecha; v1 también aceptado', () => {
  const r = normalizeRates(fxRows(['PEN', 'JPY']), 'usd');
  assert.deepEqual(r.rates, { PEN: 3.5, JPY: 150 });
  assert.equal(r.date, '2026-10-23');
  const v1 = normalizeRates({ base: 'USD', date: '2026-10-22', rates: { PEN: 3.6 } }, 'USD');
  assert.equal(v1.rates.PEN, 3.6);
  assert.equal(v1.date, '2026-10-22');
});

test('Conversión USD ↔ PEN en ambos sentidos y cruces vía USD', () => {
  const rates = { USD: 1, PEN: 3.5, JPY: 150 };
  assert.equal(convert(100, rates, 'USD', 'PEN').result, 350);
  assert.equal(convert(350, rates, 'PEN', 'USD').result, 100);
  assert.ok(Math.abs(crossRate(rates, 'JPY', 'PEN') - 3.5 / 150) < 1e-12);
  assert.equal(crossRate(rates, 'JPY', 'JPY'), 1);
  assert.throws(() => convert(10, rates, 'XXX', 'PEN'), /No hay tipo de cambio disponible para XXX/);
  assert.throws(() => convert(-5, rates, 'USD', 'PEN'), /negativo/);
});

test('parseAmount admite formatos peruanos y anglosajones', () => {
  assert.equal(parseAmount('1.250,50'), 1250.5);
  assert.equal(parseAmount('1,250.50'), 1250.5);
  assert.equal(parseAmount('99,9'), 99.9);
  assert.equal(parseAmount('1 000'), 1000);
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('')));
  assert.match(formatMoney(350, 'PEN'), /PEN/);
});

test('Nombres en español, inglés, sin tildes y con caracteres especiales', () => {
  assert.equal(resolveCountryCode('Perú'), 'PE');
  assert.equal(resolveCountryCode('peru'), 'PE');
  assert.equal(resolveCountryCode('Japón'), 'JP');
  assert.equal(resolveCountryCode('JAPON'), 'JP');
  assert.equal(resolveCountryCode('España'), 'ES');
  assert.equal(resolveCountryCode('spain'), 'ES');
  assert.equal(resolveCountryCode('Estados Unidos'), 'US');
  assert.equal(resolveCountryCode('EEUU'), 'US');
  assert.equal(resolveCountryCode("Côte d'Ivoire"), 'CI');
  assert.equal(resolveCountryCode('Costa de Marfil'), 'CI');
  assert.equal(resolveCountryCode('Corea del Sur'), 'KR');
  assert.equal(resolveCountryCode('  nueva   zelanda '), 'NZ');
  assert.equal(resolveCountryCode('la india'), 'IN');
  assert.equal(resolveCountryCode('Narnia'), null);
  assert.equal(resolveCountryCode(''), null);
  assert.equal(spanishCountryName('JP'), 'Japón');
  assert.equal(normalizeText('Côte d’Ivoire'), 'cote divoire');
});

test('Unsplash: atribución con UTM, alt por defecto', () => {
  const photos = normalizeUnsplash(unsplash, 'mi_app');
  assert.equal(photos.length, 2);
  assert.match(photos[0].authorUrl, /utm_source=mi_app/);
  assert.match(photos[0].authorUrl, /utm_medium=referral/);
  assert.equal(photos[0].author, 'Ana Foto');
  assert.equal(photos[1].alt, 'Fotografía del destino');
});

test('Wikimedia: solo fotos JPEG, autor sin HTML y licencia', () => {
  const photos = normalizeWikimedia(wikimedia);
  assert.equal(photos.length, 1);
  assert.equal(photos[0].author, 'Usuario X');
  assert.equal(photos[0].license, 'CC BY-SA 4.0');
});

test('Booking (RapidAPI): precio por noche calculado, campos ausentes en null', () => {
  const hotels = normalizeBookingHotels(bookingHotels, { city: 'Tokyo', checkin: '2026-11-23', checkout: '2026-11-25', nights: 2 });
  assert.equal(hotels.length, 2);
  assert.equal(hotels[0].price.perNight, 150);
  assert.equal(hotels[0].score, 8.6);
  assert.equal(hotels[0].photo, 'https://cf.bstatic.com/x.jpg');
  assert.match(hotels[0].url, /booking\.com\/searchresults/);
  assert.equal(hotels[1].price, null);
  assert.equal(hotels[1].score, null);
  assert.equal(hotels[1].photo, null);
});

test('OpenStreetMap: sin precios, sin duplicados ni alojamientos sin nombre', () => {
  const hotels = normalizeOsmHotels(overpass, 'Tokyo');
  assert.equal(hotels.length, 2);
  assert.equal(hotels[0].price, null);
  assert.equal(hotels[0].url, 'https://example.org');
  assert.equal(hotels[1].type, 'Hostal');
  assert.equal(hotels[1].url, 'https://www.openstreetmap.org/way/2');
  assert.equal(hotels[1].address, 'Calle 1 5');
});
