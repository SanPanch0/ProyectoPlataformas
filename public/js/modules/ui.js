// Módulo de interfaz: crea el HTML de cada sección a partir de los datos.
// Todo el texto externo se inserta con textContent (nunca innerHTML) para evitar inyecciones.
import { currencyName, formatRate } from './currency.js';

export const $ = (sel) => document.querySelector(sel);

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const NA = 'No disponible';
const nf = new Intl.NumberFormat('es-PE');

// ---------- Estados (carga / error / vacío) ----------

export function showLoading(container, label = 'Cargando…') {
  container.hidden = false;
  container.replaceChildren(
    el('div', { class: 'state__loading', role: 'status' }, [el('span', { class: 'spinner spinner--dark', 'aria-hidden': 'true' }), el('span', { text: label })]),
    document.getElementById('tpl-skeleton').content.cloneNode(true)
  );
}

export function showError(container, message, onRetry) {
  container.hidden = false;
  container.replaceChildren(
    el('div', { class: 'state__error', role: 'alert' }, [
      el('p', { text: message }),
      onRetry ? el('button', { type: 'button', class: 'btn btn--ghost', text: 'Reintentar', onclick: onRetry }) : null,
    ])
  );
}

export function showEmpty(container, message) {
  container.hidden = false;
  container.replaceChildren(el('p', { class: 'state__empty', text: message }));
}

export function hideState(container) {
  container.hidden = true;
  container.replaceChildren();
}

// Avisos: en vez de varias barras amarillas, un único panel plegable y en tono informativo.
// Los mensajes técnicos (p. ej. servidores de Overpass caídos) se dejan solo en la consola.
const TECHNICAL = /overpass|nominatim|timeout|502/i;

export function renderNotices(messages) {
  const box = $('#notices');
  const unique = [...new Set(messages.filter(Boolean))];
  const visible = unique.filter((m) => !TECHNICAL.test(m));
  unique.filter((m) => TECHNICAL.test(m)).forEach((m) => console.info('[aviso técnico]', m));
  if (!visible.length) {
    box.replaceChildren();
    return;
  }
  box.replaceChildren(
    el('details', { class: 'notice-panel' }, [
      el('summary', {}, [
        el('span', { class: 'notice-panel__icon', 'aria-hidden': 'true', text: 'ℹ' }),
        el('span', { text: `Algunos datos usan fuentes gratuitas de respaldo (${visible.length}). ` }),
        el('span', { class: 'notice-panel__more', text: 'Ver detalle' }),
      ]),
      el('ul', {}, visible.map((m) => el('li', { text: m }))),
    ])
  );
}

// ---------- Ficha del país ----------

function languageName(lang) {
  if (lang.code) {
    try {
      const n = new Intl.DisplayNames(['es'], { type: 'language' }).of(lang.code);
      if (n && n.toLowerCase() !== lang.code.toLowerCase()) return n.charAt(0).toUpperCase() + n.slice(1);
    } catch { /* código no reconocido */ }
  }
  return lang.name;
}

/** "UTC+09:00" -> hora local actual en ese desfase. */
export function localTimeFor(offset, now = new Date()) {
  const m = /^UTC(?:([+-−])(\d{1,2})(?::?(\d{2}))?)?$/.exec(String(offset).trim());
  if (!m) return null;
  const sign = m[1] === '-' || m[1] === '−' ? -1 : 1;
  const minutes = m[1] ? sign * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  const t = new Date(now.getTime() + minutes * 60000);
  return t.toISOString().slice(11, 16);
}

function row(label, value, extra) {
  return el('div', { class: 'kv' }, [el('dt', { text: label }), el('dd', {}, [value ?? NA, extra || null])]);
}

export function renderCountry(country) {
  $('#country-source').textContent = country.source;
  const flag = country.flag.svg || country.flag.png;
  const head = el('div', { class: 'country__head' }, [
    flag
      ? el('img', { class: 'country__flag', src: flag, alt: country.flag.alt || `Bandera de ${country.displayName}`, width: 96, height: 64, loading: 'lazy', onerror: (e) => e.target.replaceWith(el('span', { class: 'country__emoji', text: country.flag.emoji || '🏳️' })) })
      : el('span', { class: 'country__emoji', text: country.flag.emoji || '🏳️', role: 'img', 'aria-label': `Bandera de ${country.displayName}` }),
    el('div', {}, [
      el('p', { class: 'country__name', text: country.displayName }),
      el('p', { class: 'country__official', text: [country.name.official, country.codes.alpha2 && country.codes.alpha3 ? `${country.codes.alpha2} · ${country.codes.alpha3}` : null].filter(Boolean).join(' · ') }),
    ]),
  ]);

  const tz = country.timezones;
  const tzText = tz.length ? (tz.length > 3 ? `${tz.slice(0, 3).join(', ')} y ${tz.length - 3} más` : tz.join(', ')) : null;
  const firstTime = tz.length ? localTimeFor(tz[0]) : null;

  const langs = country.languages.map(languageName).filter(Boolean);
  const currencies = country.currencies.map((c) => `${currencyName(c.code) !== c.code ? currencyName(c.code) : c.name || c.code} (${c.code}${c.symbol ? `, ${c.symbol}` : ''})`);

  const list = el('dl', { class: 'kv-list' }, [
    row('Capital', country.capital.name),
    row('Región', [country.region, country.subregion].filter(Boolean).join(' · ') || null),
    row('Idiomas', langs.length ? langs.join(', ') : null),
    row('Población', country.population !== null ? nf.format(country.population) : null),
    row('Zona horaria', tzText, firstTime && tz.length === 1 ? el('span', { class: 'muted', text: ` · ahora ${firstTime}` }) : null),
    row('Moneda', currencies.length ? currencies.join(' · ') : null),
  ]);
  $('#country-body').replaceChildren(head, list);
}

// ---------- Conversor ----------

export function fillCurrencySelects(codes, from, to) {
  for (const [id, selected] of [['#fx-from', from], ['#fx-to', to]]) {
    const select = $(id);
    select.replaceChildren(...codes.map((code) => el('option', { value: code, selected: code === selected, text: `${code} — ${currencyName(code)}` })));
  }
}

export function renderQuickRates(items) {
  $('#fx-quick').replaceChildren(
    ...items.map(({ from, to, rate }) => el('li', {}, [el('strong', { text: `1 ${from}` }), ` = ${formatRate(rate)} ${to}`]))
  );
}

// ---------- Clima y reseña ----------

const dayFmt = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const deg = (n) => (n === null || n === undefined ? '–' : `${Math.round(n)}°`);

export function renderWeather(w) {
  $('#weather-source').textContent = w.provider;
  const now = w.current;
  $('#weather-body').replaceChildren(
    el('div', { class: 'wx__now' }, [
      el('span', { class: 'wx__icon', 'aria-hidden': 'true', text: now.icon }),
      el('div', {}, [
        el('p', { class: 'wx__temp', text: now.temp === null ? '–' : `${Math.round(now.temp)} °C` }),
        el('p', { class: 'muted', text: [now.label, now.humidity !== null ? `humedad ${Math.round(now.humidity)} %` : null, now.wind !== null ? `viento ${Math.round(now.wind)} km/h` : null].filter(Boolean).join(' · ') }),
      ]),
    ]),
    el('ul', { class: 'wx__days' }, w.days.map((d) => el('li', {}, [
      el('span', { class: 'wx__day', text: dayFmt.format(new Date(`${d.date}T12:00:00Z`)) }),
      el('span', { class: 'wx__dicon', title: d.label, role: 'img', 'aria-label': d.label, text: d.icon }),
      el('span', { class: 'wx__range' }, [el('strong', { text: deg(d.max) }), el('span', { class: 'muted', text: ` ${deg(d.min)}` })]),
    ]))),
    el('p', { class: 'fine', text: 'Pronóstico a 5 días para la capital. Datos de referencia.' })
  );
}

export function renderAbout(a) {
  $('#about-source').textContent = a.provider;
  $('#about-body').replaceChildren(
    el('div', { class: 'about' }, [
      a.thumbnail ? el('img', { class: 'about__img', src: a.thumbnail, alt: `Imagen de ${a.title}`, loading: 'lazy', width: 120, height: 120, onerror: (e) => e.target.remove() }) : null,
      el('div', {}, [
        el('p', { class: 'about__text', text: a.extract }),
        a.url ? el('p', { class: 'fine' }, [el('a', { href: a.url, target: '_blank', rel: 'noopener', text: 'Seguir leyendo en Wikipedia ↗' }), ` · Texto bajo licencia ${a.license}`]) : null,
      ]),
    ])
  );
}

// ---------- Galería ----------

export function renderGallery(photos, onFirstImage) {
  const grid = $('#gallery');
  grid.replaceChildren(
    ...photos.map((p, i) => {
      const img = el('img', {
        src: p.thumb,
        alt: p.alt,
        loading: i < 3 ? 'eager' : 'lazy',
        decoding: 'async',
        width: p.width || 400,
        height: p.height || 300,
      });
      const fig = el('figure', { class: 'photo', style: /^#[0-9a-f]{6}$/i.test(p.color || '') ? `background:${p.color}` : null }, [
        el('a', { href: p.pageUrl || p.src, target: '_blank', rel: 'noopener', 'aria-label': `Ver la foto «${p.alt}» en ${p.provider}` }, img),
        el('figcaption', {}, [
          'Foto de ',
          p.authorUrl ? el('a', { href: p.authorUrl, target: '_blank', rel: 'noopener', text: p.author }) : p.author,
          ' en ',
          el('a', { href: p.providerUrl, target: '_blank', rel: 'noopener', text: p.provider }),
          p.provider !== 'Unsplash' && p.license ? el('span', { class: 'muted' }, [' · ', p.licenseUrl ? el('a', { href: p.licenseUrl, target: '_blank', rel: 'noopener', text: p.license }) : p.license]) : null,
        ]),
      ]);
      img.addEventListener('load', () => fig.classList.add('is-loaded'), { once: true });
      img.addEventListener('error', () => {
        fig.classList.add('is-broken');
        img.replaceWith(el('div', { class: 'photo__broken', text: 'La imagen no se pudo cargar' }));
      }, { once: true });
      if (i === 0) onFirstImage?.(p);
      return fig;
    })
  );
}

// ---------- Alojamientos ----------

function stars(n) {
  if (!(n > 0)) return null;
  const k = Math.min(5, Math.round(n));
  return el('span', { class: 'stars', title: `${k} estrellas`, 'aria-label': `${k} estrellas`, text: '★'.repeat(k) });
}

export function renderHotels(hotels, formatMoney) {
  $('#hotels').replaceChildren(
    ...hotels.map((h) => {
      const placeholder = () => el('div', { class: 'hotel__noimg', 'aria-hidden': 'true' }, [
        el('span', { class: 'hotel__initial', text: (h.name || '?').trim().charAt(0).toUpperCase() }),
        el('span', { class: 'hotel__kind', text: h.type || 'Alojamiento' }),
      ]);
      const media = h.photo
        ? el('img', { src: h.photo, alt: `Fotografía de ${h.name}`, loading: 'lazy', decoding: 'async', onerror: (e) => e.target.replaceWith(placeholder()) })
        : placeholder();

      // Enlaces útiles por hotel (no son resultados de la API): precios en Booking y mapa.
      const place = [h.name, h.location || h.address].filter(Boolean).join(', ');
      const bookingUrl = new URL('https://www.booking.com/searchresults.es.html');
      bookingUrl.searchParams.set('ss', place);
      if ($('#checkin')?.value) bookingUrl.searchParams.set('checkin', $('#checkin').value);
      if ($('#checkout')?.value) bookingUrl.searchParams.set('checkout', $('#checkout').value);
      bookingUrl.searchParams.set('group_adults', '2');
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
      const hasPrice = Boolean(h.price);
      const actions = el('div', { class: 'hotel__actions' }, [
        hasPrice ? null : el('a', { class: 'btn btn--primary btn--small', href: bookingUrl.toString(), target: '_blank', rel: 'noopener', text: 'Ver precios en Booking ↗' }),
        el('a', { class: 'btn btn--ghost btn--small', href: mapUrl, target: '_blank', rel: 'noopener', text: 'Mapa ↗' }),
      ]);

      const priceEl = h.price
        ? el('p', { class: 'hotel__price' }, [
            el('strong', { text: formatMoney(h.price.perNight ?? h.price.total, h.price.currency) }),
            el('span', { class: 'muted', text: h.price.perNight ? ' / noche (aprox.)' : ' total' }),
            h.price.perNight ? el('span', { class: 'muted block', text: `Total ${h.price.nights} noches: ${formatMoney(h.price.total, h.price.currency)}` }) : null,
          ])
        : null;

      const scoreEl = h.score !== null && h.score !== undefined
        ? el('p', { class: 'hotel__score' }, [
            el('span', { class: 'badge', text: String(h.score).replace('.', ',') }),
            ' ',
            [h.scoreWord, h.reviewCount ? `${nf.format(h.reviewCount)} opiniones` : null].filter(Boolean).join(' · '),
          ])
        : null;

      return el('article', { class: 'hotel' }, [
        el('div', { class: 'hotel__media' }, media),
        el('div', { class: 'hotel__body' }, [
          el('p', { class: 'hotel__type' }, [h.type || null, stars(h.stars)]),
          el('h3', { class: 'hotel__name', text: h.name }),
          el('p', { class: 'hotel__loc muted', text: h.address || h.location || '' }),
          scoreEl,
          priceEl,
          h.url && !/openstreetmap\.org/.test(h.url) ? el('a', { class: 'hotel__link', href: h.url, target: '_blank', rel: 'noopener', text: `${h.urlLabel || 'Sitio web'} ↗` }) : null,
          actions,
          el('p', { class: 'hotel__src fine', text: `Fuente: ${h.source}` }),
        ]),
      ]);
    })
  );
}

export function renderExternalLinks(links) {
  const box = $('#hotels-links');
  box.hidden = !links.length;
  $('#hotels-links-list').replaceChildren(
    ...links.map((l) => el('a', { class: 'btn btn--ghost btn--small', href: l.url, target: '_blank', rel: 'noopener', text: `${l.label} ↗` }))
  );
}
