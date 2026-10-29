// Resuelve el nombre que escribe el usuario (en español o en inglés)
// a un código ISO 3166-1 alfa-2, usando los nombres de países que ya
// trae el navegador (Intl.DisplayNames). Así "Japón", "japon",
// "Estados Unidos" o "Côte d'Ivoire" funcionan sin gastar peticiones.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// Códigos que Intl conoce pero que no son países (regiones, reservados).
const EXCLUDED = new Set(['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'XK', 'ZZ', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA', 'CQ']);

// Alias frecuentes que Intl no incluye.
const ALIASES = {
  eeuu: 'US', eua: 'US', usa: 'US', 'estados unidos de america': 'US', 'united states of america': 'US', america: 'US',
  uk: 'GB', inglaterra: 'GB', 'gran bretana': 'GB', escocia: 'GB', gales: 'GB', 'great britain': 'GB', england: 'GB',
  holanda: 'NL', 'paises bajos': 'NL', holland: 'NL',
  'corea': 'KR', 'corea del sur': 'KR', 'south korea': 'KR', 'corea del norte': 'KP', 'north korea': 'KP',
  rusia: 'RU', 'republica checa': 'CZ', chequia: 'CZ', 'czech republic': 'CZ',
  'costa de marfil': 'CI', 'ivory coast': 'CI',
  birmania: 'MM', burma: 'MM', 'emiratos arabes': 'AE', 'emiratos': 'AE', uae: 'AE',
  'republica dominicana': 'DO', 'el vaticano': 'VA', vaticano: 'VA', 'ciudad del vaticano': 'VA',
  'macedonia': 'MK', 'suazilandia': 'SZ', swaziland: 'SZ', 'timor oriental': 'TL', 'east timor': 'TL',
  'cabo verde': 'CV', 'cape verde': 'CV', turquia: 'TR', turkey: 'TR', 'turkiye': 'TR',
};

export function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

let index = null;
let displayEs = null;

function buildIndex() {
  index = new Map();
  let dnEs;
  let dnEn;
  try {
    dnEs = new Intl.DisplayNames(['es'], { type: 'region', fallback: 'none' });
    dnEn = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    displayEs = dnEs;
  } catch {
    return index; // Navegador muy antiguo: se buscará como texto libre.
  }
  for (const a of LETTERS) {
    for (const b of LETTERS) {
      const code = a + b;
      if (EXCLUDED.has(code)) continue;
      let es;
      let en;
      try {
        es = dnEs.of(code);
        en = dnEn.of(code);
      } catch {
        continue;
      }
      for (const name of [es, en]) {
        if (!name || name === code) continue;
        const key = normalizeText(name);
        if (key && !index.has(key)) index.set(key, code);
        // Variante sin el texto entre paréntesis: "Congo (Brazzaville)" -> "congo"
        const short = normalizeText(name.replace(/\(.*?\)/g, ''));
        if (short && !index.has(short)) index.set(short, code);
      }
    }
  }
  for (const [alias, code] of Object.entries(ALIASES)) index.set(normalizeText(alias), code);
  return index;
}

/** Devuelve el código alfa-2 o null si no se reconoce el nombre. */
export function resolveCountryCode(input) {
  if (!index) buildIndex();
  const key = normalizeText(input);
  if (!key) return null;
  if (/^[a-z]{2}$/.test(key) && index.size) {
    // Permite escribir directamente "PE", "JP"…
    const code = key.toUpperCase();
    const known = [...index.values()].includes(code);
    if (known) return code;
  }
  if (index.has(key)) return index.get(key);
  // Quita artículos iniciales: "el salvador" se mantiene porque existe; "la india" -> "india"
  const noArticle = key.replace(/^(el|la|los|las|the|republica de|republic of)\s+/, '');
  if (index.has(noArticle)) return index.get(noArticle);
  return null;
}

/** Nombre del país en español a partir del código (o null). */
export function spanishCountryName(code) {
  if (!code) return null;
  if (!index) buildIndex();
  try {
    const name = displayEs?.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** Sugerencias para el datalist del buscador. */
export function countrySuggestions() {
  if (!index) buildIndex();
  if (!displayEs) return [];
  const names = new Set();
  for (const code of new Set(index.values())) {
    const n = spanishCountryName(code);
    if (n) names.add(n);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'es'));
}
