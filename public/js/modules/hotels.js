// Módulo de alojamientos (Booking.com vía RapidAPI, con alternativa OpenStreetMap, vía /api/hotels).
import { getJson, AppError } from './http.js';

export async function fetchHotels(country, { currency = 'USD', checkin, checkout, signal } = {}) {
  const city = country.capital?.name;
  if (!city) throw new AppError('Este país no tiene una capital registrada para buscar alojamientos.', { code: 'NO_CAPITAL' });
  const lat = country.capital.lat ?? country.coordinates?.lat;
  const lng = country.capital.lng ?? country.coordinates?.lng;
  const params = new URLSearchParams({ city, country: country.name.common, currency });
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  }
  if (checkin) params.set('checkin', checkin);
  if (checkout) params.set('checkout', checkout);
  return getJson(`/api/hotels?${params}`, { signal, timeoutMs: 60000 });
}
