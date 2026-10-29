// npm run probar-tripadvisor [lat] [lon]
// Hace UNA llamada a la Terra API de Tripadvisor y muestra la forma real de la respuesta
// (sin imprimir tu clave), para comprobar que las tarjetas de hoteles leen bien los campos.
// Por defecto usa el centro de Londres. Gasta 1 llamada de tu cuota gratuita.
import { loadEnv } from '../server.js';

loadEnv();
const key = process.env.TRIPADVISOR_API_KEY;
if (!key) {
  console.error('Falta TRIPADVISOR_API_KEY en el archivo .env');
  process.exit(1);
}
const [lat = '51.5074', lon = '-0.1278'] = process.argv.slice(2);
const base = process.env.TRIPADVISOR_BASE_URL || 'https://terra.tripadvisor.com';
const params = new URLSearchParams({ version: '1', lat, lon, radius: '3', unit: 'KM', category: 'HOTEL', include_photo: 'true', size: '2', locale: 'es' });

const res = await fetch(`${base}/api/locations/nearby?${params}`, { headers: { 'X-API-Key': key, Accept: 'application/json' } });
const text = await res.text();
console.log(`HTTP ${res.status} ${res.statusText}`);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, 4000));
} catch {
  console.log(text.slice(0, 1500));
}
if (res.status === 401 || res.status === 403) console.log('\nLa clave fue rechazada: revisa que sea una clave de la Terra API (las claves de la Content API antigua ya no funcionan).');
if (res.ok) console.log('\nCopia este resultado y compártelo si las tarjetas salen sin foto o sin puntuación.');
