// Verifica las APIs reales desde tu computadora:  npm run verificar-apis
// Muestra el código HTTP y un resumen de cada respuesta. NUNCA imprime las claves.
import { loadEnv } from '../server.js';
import { resolveCountry } from '../api/country.js';
import { resolveRates } from '../api/rates.js';
import { resolvePhotos } from '../api/photos.js';
import { resolveHotels, defaultDates } from '../api/hotels.js';

loadEnv();

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;

async function raw(name, url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
    const text = await res.text();
    const line = `${res.status} ${res.statusText}`;
    console.log(`  ${res.ok ? ok('✔') : bad('✘')} ${name}: ${line}`);
    if (!res.ok) console.log(`     ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
    return res.ok;
  } catch (err) {
    console.log(`  ${bad('✘')} ${name}: sin conexión (${err.cause?.code || err.message})`);
    return false;
  }
}

const has = (k) => Boolean(process.env[k] && process.env[k].trim());

console.log('\n=== 1. Peticiones directas a cada API ===');
await raw('Frankfurter v2 (USD→PEN, sin clave)', 'https://api.frankfurter.dev/v2/rates?base=USD&quotes=PEN,JPY,EUR');
if (has('RESTCOUNTRIES_API_KEY')) {
  await raw('REST Countries v5 (JP)', 'https://api.restcountries.com/countries/v5/codes.alpha_2/JP?response_fields=names.common,capitals,currencies', { Authorization: `Bearer ${process.env.RESTCOUNTRIES_API_KEY.trim()}` });
} else console.log(`  ${warn('•')} REST Countries v5: falta RESTCOUNTRIES_API_KEY (se usará countries.dev)`);
await raw('REST Countries v3.1 (versión del informe)', 'https://restcountries.com/v3.1/name/peru');
await raw('countries.dev (alternativa sin clave)', 'https://countries.dev/alpha/PE');
if (has('UNSPLASH_ACCESS_KEY')) {
  await raw('Unsplash search/photos', 'https://api.unsplash.com/search/photos?query=Lima%20Peru&per_page=1', { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY.trim()}` });
} else console.log(`  ${warn('•')} Unsplash: falta UNSPLASH_ACCESS_KEY (se usará Wikimedia Commons)`);
await raw('Wikimedia Commons (alternativa sin clave)', 'https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=Lima&srnamespace=6&srlimit=1');
if (has('RAPIDAPI_KEY')) {
  const host = process.env.RAPIDAPI_BOOKING_HOST?.trim() || 'booking-com15.p.rapidapi.com';
  await raw(`Booking (RapidAPI ${host}) searchDestination`, `https://${host}/api/v1/hotels/searchDestination?query=Lima`, { 'x-rapidapi-key': process.env.RAPIDAPI_KEY.trim(), 'x-rapidapi-host': host });
} else console.log(`  ${warn('•')} Booking (RapidAPI): falta RAPIDAPI_KEY (se usará OpenStreetMap)`);

console.log('\n=== 2. Flujo completo de la aplicación (Perú, Japón, España) ===');
for (const code of ['PE', 'JP', 'ES']) {
  try {
    const { country, warnings } = await resolveCountry({ code });
    const cur = country.currencies.map((c) => c.code);
    console.log(`  ${ok('✔')} ${code}: ${country.name.common} · capital ${country.capital.name} · ${cur.join(',')} · fuente ${country.source}`);
    warnings.forEach((w) => console.log(`     ${warn(w)}`));

    const rates = await resolveRates(cur);
    const c = cur[0];
    const toPen = rates.rates.PEN / rates.rates[c];
    console.log(`     Tipo de cambio (${rates.date}): 1 ${c} = ${toPen.toFixed(4)} PEN · 1 USD = ${rates.rates.PEN} PEN · 1 PEN = ${(1 / rates.rates.PEN).toFixed(4)} USD`);
    if (rates.unsupported.length) console.log(`     ${warn('Monedas no admitidas: ' + rates.unsupported.join(','))}`);

    const photos = await resolvePhotos(`${country.capital.name} ${country.name.common}`);
    console.log(`     Fotos: ${photos.photos.length} de ${photos.provider}`);

    const { checkin, checkout } = defaultDates();
    const hotels = await resolveHotels({ city: country.capital.name, country: country.name.common, currency: 'USD', checkin, checkout, nights: 2, lat: country.capital.lat, lng: country.capital.lng });
    console.log(`     Alojamientos: ${hotels.hotels.length} de ${hotels.provider || 'ninguna API'} (${hotels.kind})`);
    hotels.warnings.forEach((w) => console.log(`     ${warn(w)}`));
  } catch (err) {
    console.log(`  ${bad('✘')} ${code}: ${err.message}${err.details ? ` (${err.details})` : ''}`);
  }
}

console.log('\n=== 3. Moneda no admitida (debe aparecer en "unsupported") ===');
try {
  const r = await resolveRates(['XXX']);
  console.log(`  ${r.unsupported.includes('XXX') ? ok('✔') : bad('✘')} unsupported = ${JSON.stringify(r.unsupported)}`);
} catch (err) {
  console.log(`  ${bad('✘')} ${err.message}`);
}
console.log('');
