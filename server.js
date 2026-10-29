// Servidor local sin dependencias (Node.js 18 o superior).
// - Sirve los archivos estáticos de /public.
// - Expone /api/* (las mismas funciones que se despliegan como serverless en Vercel).
// - Lee las claves desde el archivo .env, que NUNCA se envía al navegador.
//
// Uso:  npm start      ->  http://localhost:3000
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');

// --- Carga mínima de .env (sin librerías) ---
export function loadEnv(file = join(ROOT, '.env')) {
  if (!existsSync(file)) return false;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const ROUTES = {
  '/api/country': () => import('./api/country.js'),
  '/api/rates': () => import('./api/rates.js'),
  '/api/photos': () => import('./api/photos.js'),
  '/api/hotels': () => import('./api/hotels.js'),
  '/api/status': () => import('./api/status.js'),
  '/api/weather': () => import('./api/weather.js'),
  '/api/about': () => import('./api/about.js'),
};

async function serveStatic(pathname, res) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Prohibido');
    return;
  }
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const started = Date.now();
    res.on('finish', () => {
      if (pathname.startsWith('/api/')) console.log(`${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started} ms)`);
    });
    try {
      if (ROUTES[pathname]) {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 'METHOD', message: 'Solo GET.' } }));
          return;
        }
        const mod = await ROUTES[pathname]();
        await mod.default(req, res);
        return;
      }
      if (pathname.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Ruta de API inexistente.' } }));
        return;
      }
      await serveStatic(pathname, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error interno');
    }
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1]);
if (isMain) {
  const hadEnv = loadEnv();
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    console.log(`\nGuía Global de Viajes en http://localhost:${port}`);
    console.log(hadEnv ? 'Archivo .env cargado.' : 'Sin archivo .env: se usarán las alternativas sin clave.');
    console.log('Credenciales configuradas:', {
      RESTCOUNTRIES_API_KEY: Boolean(process.env.RESTCOUNTRIES_API_KEY),
      UNSPLASH_ACCESS_KEY: Boolean(process.env.UNSPLASH_ACCESS_KEY),
      RAPIDAPI_KEY: Boolean(process.env.RAPIDAPI_KEY),
    });
  });
}
