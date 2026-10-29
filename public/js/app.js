// Punto de entrada del frontend: une los módulos y controla el flujo.
//   1) Buscar el país (REST Countries).
//   2) Con la capital y la moneda, lanzar EN PARALELO las tres consultas
//      independientes (tipo de cambio, fotos y alojamientos) con Promise.allSettled():
//      si una falla, las demás se muestran igual.
import { fetchCountry } from './modules/countries.js';
import { countrySuggestions } from './modules/countryNames.js';
import { fetchRates, convert, crossRate, parseAmount, formatMoney } from './modules/currency.js';
import { fetchPhotos } from './modules/photos.js';
import { fetchHotels } from './modules/hotels.js';
import { fetchWeather, fetchAbout } from './modules/weather.js';
import { getJson } from './modules/http.js';
import {
  $, el, showLoading, showError, showEmpty, hideState, renderNotices, renderCountry,
  fillCurrencySelects, renderQuickRates, renderGallery, renderHotels, renderExternalLinks,
  renderWeather, renderAbout,
} from './modules/ui.js';

const state = {
  country: null,
  rates: null, // { base:'USD', rates:{...}, date, unsupported:[] }
  notices: [],
  controller: null,
};

// ---------------- Búsqueda ----------------

function setSearching(on) {
  const btn = $('#search-btn');
  btn.disabled = on;
  btn.classList.toggle('is-loading', on);
  $('#search-input').setAttribute('aria-busy', String(on));
}

function searchError(message) {
  const p = $('#search-error');
  p.textContent = message || '';
  p.hidden = !message;
}

async function search(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) {
    searchError('Escribe el nombre de un país para empezar.');
    $('#search-input').focus();
    return;
  }
  searchError('');
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const { signal } = controller;

  setSearching(true);
  try {
    const { country, warnings } = await fetchCountry(input, { signal });
    if (signal.aborted) return;
    state.country = country;
    state.notices = [...warnings];
    showResults(country);
    history.replaceState(null, '', `?pais=${encodeURIComponent(country.displayName)}`);

    // Consultas independientes en paralelo.
    await Promise.allSettled([
      loadRates(country, signal), loadPhotos(country, signal), loadHotels(country, signal),
      loadWeather(country, signal), loadAbout(country, signal),
    ]);
  } catch (err) {
    if (err.code === 'CANCELLED') return;
    searchError(err.message);
  } finally {
    if (state.controller === controller) setSearching(false);
  }
}

function showResults(country) {
  $('#resultados').hidden = false;
  $('#subnav').hidden = false;
  $('#hero-title').textContent = country.displayName;
  $('#hero-subtitle').textContent = [country.capital.name && `Capital: ${country.capital.name}`, country.region].filter(Boolean).join(' · ');
  document.title = `${country.displayName} · Guía Global de Viajes`;
  $('#hero-bg').style.backgroundImage = '';
  $('#hero').classList.remove('has-photo');
  $('#hero-credit').hidden = true;
  renderCountry(country);
  renderNotices(state.notices);
  $('#resultados').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function addNotices(list = []) {
  state.notices.push(...list);
  renderNotices(state.notices);
}

// ---------------- Tipos de cambio ----------------

async function loadRates(country, signal) {
  const form = $('#fx-form');
  const box = $('#fx-state');
  form.hidden = true;
  showLoading(box, 'Consultando tipos de cambio…');
  const own = country.currencies.map((c) => c.code);
  try {
    const data = await fetchRates(own, { signal });
    if (signal.aborted) return;
    state.rates = data;
    hideState(box);
    setupConverter(country, data);
  } catch (err) {
    if (err.code === 'CANCELLED') return;
    showError(box, `No se pudo obtener el tipo de cambio: ${err.message}`, () => loadRates(country, state.controller?.signal || new AbortController().signal));
  }
}

function setupConverter(country, data) {
  const own = country.currencies.map((c) => c.code);
  const supportedOwn = own.filter((c) => data.rates[c] > 0);
  const codes = [...new Set([...supportedOwn, 'PEN', 'USD'])].filter((c) => data.rates[c] > 0);
  const from = supportedOwn.find((c) => c !== 'PEN') || 'USD';
  const to = from === 'PEN' ? 'USD' : 'PEN';
  fillCurrencySelects(codes, from, to);
  $('#fx-form').hidden = false;

  const unsupported = own.filter((c) => !(data.rates[c] > 0));
  const meta = [];
  if (unsupported.length) {
    meta.push(`La moneda ${unsupported.join(', ')} no está disponible en Frankfurter: solo se puede convertir entre las monedas de la lista.`);
  }
  meta.push(`Fecha de referencia: ${formatDate(data.date)}${data.oldestDate && data.oldestDate !== data.date ? ` (algunas tasas del ${formatDate(data.oldestDate)})` : ''}.`);
  meta.push('Tipos de cambio de referencia (bancos centrales), con actualización diaria; no son en tiempo real ni el precio de una casa de cambio.');
  $('#fx-meta').textContent = meta.join(' ');

  const quick = [];
  for (const c of supportedOwn.filter((c) => c !== 'PEN' && c !== 'USD')) {
    quick.push({ from: c, to: 'PEN', rate: crossRate(data.rates, c, 'PEN') });
    quick.push({ from: c, to: 'USD', rate: crossRate(data.rates, c, 'USD') });
  }
  quick.push({ from: 'USD', to: 'PEN', rate: crossRate(data.rates, 'USD', 'PEN') });
  quick.push({ from: 'PEN', to: 'USD', rate: crossRate(data.rates, 'PEN', 'USD') });
  renderQuickRates(quick.filter((q) => q.rate));
  runConversion();
}

function formatDate(iso) {
  if (!iso) return 'no indicada';
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function runConversion() {
  const out = $('#fx-result');
  const errorBox = $('#fx-error');
  errorBox.hidden = true;
  if (!state.rates) return;
  const from = $('#fx-from').value;
  const to = $('#fx-to').value;
  const raw = $('#fx-amount').value;
  const amount = parseAmount(raw);
  try {
    if (!String(raw).trim()) throw new Error('Introduce un importe.');
    if (Number.isNaN(amount)) throw new Error('El importe no es un número válido (ejemplo: 150 o 1.250,50).');
    const { result, rate } = convert(amount, state.rates.rates, from, to);
    out.replaceChildren(
      el('span', { class: 'fx__from', text: formatMoney(amount, from, { exact: true }) }),
      el('span', { class: 'fx__eq', text: '=' }),
      el('strong', { class: 'fx__to', text: formatMoney(result, to) }),
      el('span', { class: 'fx__rate', text: `1 ${from} = ${rate.toLocaleString('es-PE', { maximumFractionDigits: 6 })} ${to}` })
    );
  } catch (err) {
    out.replaceChildren();
    errorBox.textContent = err.message;
    errorBox.hidden = false;
  }
}

// ---------------- Clima y reseña ----------------

async function loadWeather(country, signal) {
  const box = $('#weather-state');
  $('#weather-body').replaceChildren();
  $('#weather-source').textContent = '';
  showLoading(box, 'Consultando el clima…');
  try {
    const data = await fetchWeather(country, { signal });
    if (signal.aborted) return;
    hideState(box);
    renderWeather(data);
  } catch (err) {
    if (err.code === 'CANCELLED') return;
    showError(box, `No se pudo obtener el clima: ${err.message}`, () => loadWeather(country, state.controller?.signal || new AbortController().signal));
  }
}

async function loadAbout(country, signal) {
  const box = $('#about-state');
  $('#about-body').replaceChildren();
  $('#about-source').textContent = '';
  showLoading(box, 'Buscando la reseña del país…');
  try {
    const data = await fetchAbout(country, { signal });
    if (signal.aborted) return;
    hideState(box);
    renderAbout(data);
  } catch (err) {
    if (err.code === 'CANCELLED') return;
    if (err.status === 404) return showEmpty(box, 'No hay reseña disponible para este país.');
    showError(box, `No se pudo cargar la reseña: ${err.message}`, () => loadAbout(country, state.controller?.signal || new AbortController().signal));
  }
}

// ---------------- Modo sin conexión ----------------

function setupOffline() {
  const banner = $('#offline-banner');
  const show = (text) => { banner.textContent = text; banner.hidden = false; };
  const refresh = () => {
    if (!navigator.onLine) show('Sin conexión a Internet: se muestran los últimos datos guardados en este equipo. Puedes volver a buscar los países que ya consultaste.');
    else banner.hidden = true;
  };
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  window.addEventListener('app:cache-used', (e) => {
    const when = new Date(e.detail.savedAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
    show(`No se pudo actualizar algún dato; se muestra la copia guardada el ${when}.`);
  });
  refresh();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* la app funciona igual sin modo offline */ });
  }
}

// ---------------- Fotografías ----------------

async function loadPhotos(country, signal) {
  const box = $('#gallery-state');
  $('#gallery').replaceChildren();
  $('#gallery-source').textContent = '';
  showLoading(box, 'Buscando fotografías…');
  try {
    const data = await fetchPhotos(country, { signal });
    if (signal.aborted) return;
    addNotices(data.warnings);
    $('#gallery-source').textContent = data.provider;
    if (!data.photos.length) {
      showEmpty(box, 'No se encontraron fotografías de este destino.');
      return;
    }
    hideState(box);
    renderGallery(data.photos, setHeroPhoto);
  } catch (err) {
    if (err.code === 'CANCELLED') return;
    showError(box, `No se pudieron cargar las fotografías: ${err.message}`, () => loadPhotos(country, state.controller?.signal || new AbortController().signal));
  }
}

function setHeroPhoto(photo) {
  const img = new Image();
  img.onload = () => {
    $('#hero-bg').style.backgroundImage = `url("${photo.src.replace(/"/g, '%22')}")`;
    $('#hero').classList.add('has-photo');
    const credit = $('#hero-credit');
    credit.replaceChildren('Foto de ', el('a', { href: photo.authorUrl || photo.pageUrl, target: '_blank', rel: 'noopener', text: photo.author }), ' en ', el('a', { href: photo.providerUrl, target: '_blank', rel: 'noopener', text: photo.provider }));
    credit.hidden = false;
  };
  img.src = photo.src;
}

// ---------------- Alojamientos ----------------

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function initDates() {
  const today = new Date().toISOString().slice(0, 10);
  const checkin = addDays(today, 30);
  $('#checkin').value = checkin;
  $('#checkin').min = today;
  $('#checkout').value = addDays(checkin, 2);
  $('#checkout').min = addDays(today, 1);
}

// Presupuesto por noche: convierte a USD (moneda en que se piden los precios), marca cada hotel
// como dentro/fuera del presupuesto y recomienda primero los mejor puntuados que sí caben.
function showHotels() {
  const summary = $('#budget-summary');
  const list = (state.hotels || []).map((h) => ({ ...h, budgetFit: undefined }));
  summary.hidden = true;
  const raw = $('#budget')?.value.trim();
  const amount = raw ? parseAmount(raw) : NaN;
  if (raw && !(amount > 0)) {
    summary.textContent = 'Escribe un presupuesto numérico mayor que 0 (por ejemplo 150).';
    summary.hidden = false;
  } else if (amount > 0) {
    const cur = $('#budget-cur').value;
    const rate = cur === 'USD' ? 1 : state.rates ? crossRate(state.rates.rates, cur, 'USD') : null;
    if (!rate) {
      summary.textContent = 'No hay tipo de cambio disponible para convertir tu presupuesto; usa dólares (USD).';
      summary.hidden = false;
    } else {
      const limit = amount * rate;
      for (const h of list) {
        const night = h.price ? (h.price.perNight ?? h.price.total) : null;
        h.budgetFit = night === null ? 'unknown' : night <= limit ? 'ok' : 'over';
      }
      const rank = { ok: 0, unknown: 1, over: 2 };
      list.sort((a, b) => rank[a.budgetFit] - rank[b.budgetFit] || (b.score ?? 0) - (a.score ?? 0));
      const ok = list.filter((h) => h.budgetFit === 'ok').length;
      const unknown = list.filter((h) => h.budgetFit === 'unknown').length;
      summary.textContent = ok
        ? `Con ${formatMoney(amount, cur, { exact: true })} por noche, ${ok} alojamiento(s) entran en tu presupuesto. Te mostramos primero los mejor valorados.`
        : unknown
          ? 'Ningún alojamiento con precio entra en tu presupuesto. Los demás no tienen precio en esta fuente: revisa sus enlaces.'
          : 'Ningún alojamiento entra en tu presupuesto. Prueba con otro monto o con otras fechas.';
      summary.hidden = false;
    }
  }
  renderHotels(list, formatMoney);
}

async function loadHotels(country, signal) {
  const box = $('#hotels-state');
  const notice = $('#hotels-notice');
  $('#hotels').replaceChildren();
  $('#hotels-source').textContent = '';
  notice.hidden = true;
  renderExternalLinks([]);

  const checkin = $('#checkin').value;
  const checkout = $('#checkout').value;
  if (!checkin || !checkout || checkout <= checkin) {
    showError(box, 'La fecha de salida debe ser posterior a la de entrada.');
    return;
  }
  state.hotelsDates = [checkin, checkout];
  state.hotels = null;
  $('#budget-summary').hidden = true;
  showLoading(box, 'Buscando alojamientos en la capital…');
  try {
    const data = await fetchHotels(country, { currency: 'USD', checkin, checkout, signal });
    if (signal.aborted) return;
    addNotices(data.warnings);
    $('#hotels-source').textContent = data.provider || 'Sin proveedor';
    notice.textContent = data.notice;
    notice.hidden = !data.notice;
    notice.dataset.kind = data.kind;
    renderExternalLinks(data.externalLinks || []);
    if (!data.hotels.length) {
      showEmpty(box, data.kind === 'links-only' ? 'No hay resultados de alojamiento desde las APIs.' : 'No se encontraron alojamientos para esta capital.');
      return;
    }
    hideState(box);
    state.hotels = data.hotels;
    showHotels();
  } catch (err) {
    if (err.code === 'CANCELLED') return;
    showError(box, `No se pudieron cargar los alojamientos: ${err.message}`, () => loadHotels(country, state.controller?.signal || new AbortController().signal));
  }
}

// ---------------- Eventos ----------------

function bindEvents() {
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    search($('#search-input').value);
  });
  // El formulario ya busca con Enter (submit); también limpiamos el error al escribir.
  $('#search-input').addEventListener('input', () => searchError(''));

  document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
    $('#search-input').value = chip.dataset.country;
    search(chip.dataset.country);
  }));

  $('#fx-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runConversion();
  });
  $('#fx-amount').addEventListener('input', runConversion);
  $('#fx-from').addEventListener('change', runConversion);
  $('#fx-to').addEventListener('change', runConversion);
  $('#fx-swap').addEventListener('click', () => {
    const from = $('#fx-from');
    const to = $('#fx-to');
    [from.value, to.value] = [to.value, from.value];
    runConversion();
  });

  $('#hotel-dates').addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.hotels && state.country && $('#checkin').value === state.hotelsDates?.[0] && $('#checkout').value === state.hotelsDates?.[1]) { showHotels(); return; }
    if (state.country) loadHotels(state.country, state.controller?.signal || new AbortController().signal);
  });
  $('#checkin').addEventListener('change', () => {
    const ci = $('#checkin').value;
    if (ci && $('#checkout').value <= ci) $('#checkout').value = addDays(ci, 2);
    $('#checkout').min = ci ? addDays(ci, 1) : '';
  });
}

async function showApiStatus() {
  try {
    const s = await getJson('/api/status', { timeoutMs: 5000 });
    const part = (ok, yes, no) => (ok ? yes : no);
    $('#api-status').textContent = [
      part(s.restCountries, 'Países: REST Countries v5', 'Países: alternativa countries.dev (falta clave de REST Countries)'),
      part(s.unsplash, 'Fotos: Unsplash', 'Fotos: Wikimedia Commons (falta clave de Unsplash)'),
      part(s.bookingRapidApi, 'Hoteles: Booking (RapidAPI)', s.tripadvisor ? 'Hoteles: Tripadvisor' : 'Hoteles: OpenStreetMap (sin clave de RapidAPI ni Tripadvisor)'),
      'Clima: Open-Meteo',
      'Reseña: Wikipedia',
    ].join(' · ');
  } catch (err) {
    $('#api-status').textContent = `No se pudo consultar el estado del servidor: ${err.message}`;
  }
}

function init() {
  if (location.protocol === 'file:') {
    searchError('Abre la aplicación con "npm start" (http://localhost:3000). Abrir el HTML directamente no permite usar las APIs.');
  }
  const list = $('#country-list');
  list.replaceChildren(...countrySuggestions().map((name) => el('option', { value: name })));
  initDates();
  bindEvents();
  setupOffline();
  showApiStatus();
  const initial = new URLSearchParams(location.search).get('pais');
  if (initial) {
    $('#search-input').value = initial;
    search(initial);
  }
}

init();
