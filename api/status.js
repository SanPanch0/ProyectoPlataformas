// GET /api/status
// Indica qué credenciales están configuradas (solo sí/no, nunca el valor).
import { sendJson, env } from '../lib/upstream.js';

export default function handler(req, res) {
  sendJson(res, 200, {
    restCountries: Boolean(env('RESTCOUNTRIES_API_KEY')),
    unsplash: Boolean(env('UNSPLASH_ACCESS_KEY')),
    bookingRapidApi: Boolean(env('RAPIDAPI_KEY')),
    tripadvisor: Boolean(env('TRIPADVISOR_API_KEY')),
    frankfurter: true,
  });
}
