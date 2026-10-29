// Módulo de tipos de cambio (Frankfurter v2 a través de /api/rates).
// El servidor devuelve tasas con base USD; aquí se calculan los cruces:
//   tasa(A -> B) = (USD -> B) / (USD -> A)
import { getJson, AppError } from './http.js';

export async function fetchRates(currencyCodes, { signal } = {}) {
  const list = [...new Set(currencyCodes.filter((c) => /^[A-Z]{3}$/.test(c)))].slice(0, 5);
  return getJson(`/api/rates?currencies=${list.join(',')}`, { signal });
}

export function crossRate(rates, from, to) {
  if (from === to) return 1;
  const a = rates[from];
  const b = rates[to];
  if (!(a > 0) || !(b > 0)) return null;
  return b / a;
}

export function convert(amount, rates, from, to) {
  const value = Number(amount);
  if (!Number.isFinite(value)) throw new AppError('Introduce un importe numérico.', { code: 'BAD_AMOUNT' });
  if (value < 0) throw new AppError('El importe no puede ser negativo.', { code: 'BAD_AMOUNT' });
  if (value > 1e12) throw new AppError('El importe es demasiado grande.', { code: 'BAD_AMOUNT' });
  const rate = crossRate(rates, from, to);
  if (rate === null) {
    const missing = [from, to].filter((c) => !(rates[c] > 0)).join(' y ');
    throw new AppError(`No hay tipo de cambio disponible para ${missing}.`, { code: 'MISSING_RATE' });
  }
  return { result: value * rate, rate };
}

/** Lee un importe escrito como "1.234,56", "1234.56" o "1 234". */
export function parseAmount(raw) {
  let s = String(raw ?? '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) {
    // El último separador es el decimal.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

export function formatMoney(value, currency, { exact = false, locale = 'es-PE' } = {}) {
  try {
    // exact: muestra el importe tal como lo escribió el usuario (p. ej. 1.250,50 JPY sin redondear a 1.251).
    const opts = { style: 'currency', currency, currencyDisplay: 'code' };
    if (exact) Object.assign(opts, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return new Intl.NumberFormat(locale, opts).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatRate(value) {
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: digits, minimumFractionDigits: Math.min(2, digits) }).format(value);
}

export function currencyName(code) {
  try {
    const n = new Intl.DisplayNames(['es'], { type: 'currency' }).of(code);
    return n && n !== code ? n : code;
  } catch {
    return code;
  }
}
