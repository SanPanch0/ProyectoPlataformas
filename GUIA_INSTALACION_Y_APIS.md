# Guía de instalación y de APIs — Guía Global de Viajes

Proyecto del curso *Plataformas para el Desarrollo de Aplicaciones* (Universidad Andina del Cusco).

La persona escribe un país y la aplicación muestra, en una sola página y sin recargarla: ficha del país, moneda y conversor frente al sol (PEN) y al dólar (USD), galería de fotos y alojamientos en la capital.

---

## 1. Requisitos previos

- **Node.js 18.17 o superior** (recomendado 20 o 22). Descarga: https://nodejs.org/es — comprueba con `node -v`.
- Un navegador moderno (Chrome, Edge, Firefox o Safari).
- **No hace falta instalar dependencias**: el proyecto no usa librerías externas, solo Node.js y JavaScript del navegador.
- Opcional: claves de REST Countries, Unsplash y RapidAPI (ver sección 6). **Sin ninguna clave la app funciona** usando alternativas gratuitas.

## 2. Estructura del proyecto

```
guia-global-viajes/
├── public/                     ← Frontend (lo que ve el usuario)
│   ├── index.html              ← Página única (SPA)
│   ├── css/styles.css          ← Estilos responsive, modo claro/oscuro
│   └── js/
│       ├── app.js              ← Punto de entrada: flujo y eventos
│       └── modules/
│           ├── http.js         ← Peticiones, tiempo límite y gestión de errores
│           ├── countryNames.js ← "Japón" → JP (nombres en español sin gastar peticiones)
│           ├── countries.js    ← Consulta de países
│           ├── currency.js     ← Tipos de cambio y conversión
│           ├── photos.js       ← Fotografías
│           ├── hotels.js       ← Alojamientos
│           └── ui.js           ← Interfaz (renderizado seguro con textContent)
├── api/                        ← Backend mínimo: una función por API (guarda las claves)
│   ├── country.js              ← REST Countries v5  (+ countries.dev)
│   ├── rates.js                ← Frankfurter v2
│   ├── photos.js               ← Unsplash         (+ Wikimedia Commons)
│   ├── hotels.js               ← Booking/RapidAPI (+ OpenStreetMap)
│   └── status.js               ← Qué claves hay configuradas (solo sí/no)
├── lib/
│   ├── upstream.js             ← fetch con tiempo límite, códigos HTTP, caché
│   └── normalize.js            ← Convierte cada proveedor a un formato común
├── scripts/
│   ├── verificar-apis.js       ← Prueba las APIs reales desde tu PC
│   └── check-syntax.js         ← Revisa la sintaxis de todos los .js
├── tests/                      ← 37 pruebas automáticas (node:test)
├── server.js                   ← Servidor local sin dependencias
├── .env.example                ← Plantilla de variables (sin claves)
├── .gitignore                  ← Impide subir .env a GitHub
├── vercel.json                 ← Configuración de despliegue
├── ESTADO_APIS.md              ← Estado de cada API y lo que debes hacer
└── GUIA_INSTALACION_Y_APIS.md  ← Este documento
```

### ¿Por qué hay un pequeño backend si el informe decía "solo frontend"?

Al investigar las APIs vigentes se encontró que **tres de las cuatro requieren clave** (REST Countries v5, Unsplash y RapidAPI). Una clave escrita en un archivo JavaScript del navegador es visible para cualquiera que abra las herramientas de desarrollo. Por eso las claves viven solo en el servidor (`server.js` en local, funciones `/api` en Vercel) y el navegador llama a `/api/...`. Además, REST Countries v5 bloquea por defecto las llamadas desde navegadores (CORS). El frontend sigue siendo HTML, CSS y JavaScript puros.

## 3. Instalación

```bash
# 1. Descomprime el proyecto y entra en la carpeta
cd guia-global-viajes

# 2. (Opcional) crea tu archivo de claves
cp .env.example .env          # Windows (cmd): copy .env.example .env

# 3. No hay "npm install": el proyecto no tiene dependencias.
```

## 4. Ejecutar la aplicación

```bash
npm start
```

Abre **http://localhost:3000**. La terminal muestra qué claves están cargadas (solo `true/false`) y cada petición a `/api` con su código y tiempo.

> No abras `index.html` con doble clic (`file://`): las funciones `/api` no existirían. La app lo detecta y lo avisa.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Igual que `start`, pero reinicia al guardar cambios |
| `npm test` | Ejecuta las 37 pruebas automáticas (no necesita Internet) |
| `npm run check` | Revisa la sintaxis de todos los archivos JavaScript |
| `npm run verificar-apis` | Prueba las APIs **reales** (necesita Internet) |

## 5. Cómo funciona (flujo)

1. El usuario escribe "Japón" y pulsa **Buscar** o **Enter**. Se valida que no esté vacío.
2. `countryNames.js` convierte el nombre a su código ISO (`JP`) usando `Intl.DisplayNames` del navegador: funciona con tildes, sin tildes, en español o en inglés ("Japón", "japon", "Japan", "Costa de Marfil", "Côte d'Ivoire").
3. `GET /api/country?code=JP` → ficha del país (capital, idiomas, población, zonas horarias, monedas, bandera, región).
4. Con la capital y la moneda se lanzan **en paralelo** tres consultas independientes con `Promise.allSettled()`:
   - `GET /api/rates?currencies=JPY`
   - `GET /api/photos?query=Tokyo Japan`
   - `GET /api/hotels?city=Tokyo&country=Japan&lat=...&lng=...`

   Se usa `allSettled` en lugar de `all` para que, si falla una (por ejemplo, los hoteles), las otras se sigan mostrando. La ficha del país se muestra antes, en cuanto llega.
5. Cada sección tiene su propio indicador de carga, mensaje de error con botón **Reintentar** y fuente de datos visible.

## 6. Las cuatro APIs

### 6.1 REST Countries — información del país

- **Hallazgo:** la v3.1 del informe está **retirada**. La vigente es la **v5**, que exige clave.
- **Endpoint usado:** `GET https://api.restcountries.com/countries/v5/codes.alpha_2/{CC}?response_fields=...`
  Cabecera: `Authorization: Bearer <RESTCOUNTRIES_API_KEY>`.
  Si el usuario escribe algo que no se reconoce como país: `GET /countries/v5/name?q=<texto>`.
- **Devuelve** (según su README; la respuesta va dentro de `data.objects`):

```json
{
  "data": {
    "objects": [{
      "names": { "common": "Canada", "official": "Canada" },
      "codes": { "alpha_2": "CA", "alpha_3": "CAN" },
      "capitals": [{ "name": "Ottawa", "attributes": { "primary": true }, "coordinates": { "lat": 45.4247, "lng": -75.695 } }],
      "currencies": [{ "code": "CAD", "name": "Canadian dollar", "symbol": "$" }],
      "region": "Americas", "subregion": "North America", "population": 41575585,
      "flag": { "emoji": "🇨🇦", "url_svg": "https://flagcdn.com/ca.svg" }
    }]
  }
}
```
  *Ejemplo tomado del README oficial (recortado). **No verificado con una petición real** desde el entorno de desarrollo.*
- **Límites:** 20 peticiones cada 10 s; cuota mensual del plan gratuito (consúltala en tu panel). La app guarda en caché cada país 24 h.
- **Alternativa sin clave:** `GET https://countries.dev/alpha/{CC}` (datos de GeoNames, CC BY 4.0). Puede no traer población o zonas horarias; en ese caso la app muestra "No disponible".

### 6.2 Frankfurter — tipos de cambio

- **Hallazgo:** la versión vigente es la **v2** (la v1 sigue activa pero está obsoleta). Ahora reúne 105 bancos centrales y cubre 223 monedas, incluido el **sol peruano (PEN)**. No requiere clave.
- **Endpoint usado:** `GET https://api.frankfurter.dev/v2/rates?base=USD&quotes=PEN,JPY`
- **Devuelve** una fila por moneda (según la documentación oficial):

```json
[
  { "date": "2026-07-17", "base": "USD", "quote": "EUR", "rate": 0.8739 }
]
```
  *Forma tomada de la documentación oficial de Frankfurter. **No verificada con una petición real.***
- **Cálculo de la conversión:** se pide todo con base USD en una sola petición y se calcula el cruce:
  `tasa(A → B) = (USD → B) / (USD → A)`. Ejemplo con valores de prueba: si 1 USD = 3,5 PEN y 1 USD = 150 JPY, entonces 1 JPY = 3,5 / 150 = 0,0233 PEN.
- **Monedas no admitidas:** si Frankfurter rechaza una moneda (422/404), el servidor la reintenta por separado, la marca como `unsupported` y la app avisa; USD ↔ PEN sigue funcionando.
- **Importante:** son tasas de referencia (punto medio) que se actualizan **una vez al día**; no son en tiempo real ni el precio de una casa de cambio. La app muestra siempre la fecha del dato.

### 6.3 Unsplash — fotografías

- **Endpoint usado:** `GET https://api.unsplash.com/search/photos?query=Tokyo%20Japan&per_page=9&orientation=landscape&content_filter=high`
  Cabecera: `Authorization: Client-ID <UNSPLASH_ACCESS_KEY>`.
- **Devuelve** `results[]` con `urls.small/regular`, `alt_description`, `user.name`, `user.links.html`, `links.html`.
- **Condiciones cumplidas:** las imágenes se muestran directamente desde `images.unsplash.com` (hotlinking, obligatorio), con "Foto de *Autor* en Unsplash" y enlaces con `utm_source` y `utm_medium=referral`. La app no descarga fotos, así que no necesita llamar al endpoint de descarga.
- **Límites:** 50 peticiones/hora en modo demo. La app guarda cada búsqueda en caché 1 h.
- **Alternativa sin clave:** Wikimedia Commons (`commons.wikimedia.org/w/api.php`), solo fotos JPEG/WebP, con autor y licencia (por ejemplo CC BY-SA 4.0) enlazados.

### 6.4 Booking.com vía RapidAPI — alojamientos

- **Hallazgo:** no se pudo verificar que `booking-com21` (ExtractEdge) siga disponible. Se usa **"Booking COM" de DataCrawler** (`booking-com15.p.rapidapi.com`). La API oficial de Booking (Demand API) es solo para socios afiliados aprobados.
- **Endpoints usados** (cabeceras `x-rapidapi-key` y `x-rapidapi-host`):
  1. `GET /api/v1/hotels/searchDestination?query=Tokyo, Japan` → `dest_id`, `search_type`
  2. `GET /api/v1/hotels/searchHotels?dest_id=...&search_type=CITY&arrival_date=2026-11-23&departure_date=2026-11-25&adults=2&room_qty=1&currency_code=USD&languagecode=es`
- **Campos usados:** `data.hotels[].property.name`, `reviewScore`, `reviewScoreWord`, `reviewCount`, `propertyClass`, `photoUrls[0]`, `priceBreakdown.grossPrice.value/currency`. El precio es el **total de la estancia**; la app lo divide entre las noches y lo indica como aproximado.
  *Nombres tomados de guías de terceros sobre esta API. **No verificados con una petición real.***
- **Enlace de reserva:** la API no garantiza un enlace directo, así que se muestra un enlace de **búsqueda** en Booking.com con el nombre del hotel y las fechas, etiquetado como tal.
- **Alternativa sin clave:** OpenStreetMap (Overpass API): hoteles, hostales y casas de huéspedes reales a 6 km del centro de la capital, **sin precios ni puntuaciones** (OSM no los tiene). La app lo dice expresamente. Si todo falla, solo muestra enlaces externos de búsqueda, marcados como "no son resultados de esta aplicación".

## 7. Obtener las claves

Pasos detallados (con enlaces, botones y cómo comprobarlas) en **`ESTADO_APIS.md`**. Resumen:

| Variable en `.env` | Dónde se obtiene |
|---|---|
| `RESTCOUNTRIES_API_KEY` | https://restcountries.com/sign-up → panel → **API Keys** |
| `UNSPLASH_ACCESS_KEY` | https://unsplash.com/oauth/applications → **New Application** → *Access Key* |
| `RAPIDAPI_KEY` | https://rapidapi.com/DataCrawler/api/booking-com15 → **Pricing** → plan BASIC → **Subscribe**; la clave está en *Playground* |

Reglas de seguridad:
- Las claves van **solo** en `.env` (local) o en las variables de entorno de Vercel. Nunca en `public/`.
- `.env` está en `.gitignore`: no se sube a GitHub. Comprueba con `git status` que no aparece.
- Si una clave se filtra, revócala en el panel del proveedor y crea otra.
- `/api/status` solo dice si cada clave existe (`true/false`), nunca su valor. Los mensajes de error tampoco la incluyen (hay una prueba automática que lo comprueba).

## 8. Comprobar que cada API funciona

```bash
npm run verificar-apis
```

Salida esperada (los números dependerán del día):

```
=== 1. Peticiones directas a cada API ===
  ✔ Frankfurter v2 (USD→PEN, sin clave): 200 OK
  ✔ REST Countries v5 (JP): 200 OK
  ✘ REST Countries v3.1 (versión del informe): ...      ← esperado: está retirada
  ...
=== 2. Flujo completo de la aplicación (Perú, Japón, España) ===
  ✔ PE: Peru · capital Lima · PEN · fuente REST Countries v5
     Tipo de cambio (AAAA-MM-DD): ...
```

También puedes abrir en el navegador, con la app en marcha:
- http://localhost:3000/api/status
- http://localhost:3000/api/country?code=PE
- http://localhost:3000/api/rates?currencies=JPY
- http://localhost:3000/api/photos?query=Lima%20Peru
- http://localhost:3000/api/hotels?city=Lima&country=Peru&lat=-12.05&lng=-77.05

## 9. Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| "No se pudo conectar con el servidor de la aplicación" | El servidor no está en marcha | Ejecuta `npm start` y abre http://localhost:3000 |
| "La respuesta no es JSON válido" | Abriste el HTML con doble clic | Usa `npm start` |
| Aviso "REST Countries falló (401…)" | Clave mal copiada, revocada o caducada | Revisa `RESTCOUNTRIES_API_KEY` (sin espacios ni comillas) y reinicia |
| Aviso "…(403…)" en REST Countries | Cuota mensual agotada o cuenta congelada | Revisa el panel; mientras tanto se usa countries.dev |
| Aviso "…(403…)" en Booking | Tienes clave pero no estás suscrito al plan | Suscríbete al plan BASIC en la pestaña Pricing |
| Aviso "…(429…)" | Límite de peticiones | Espera; la caché reduce las repeticiones |
| Fotos de Wikimedia en lugar de Unsplash | Falta o falla `UNSPLASH_ACCESS_KEY` | Configúrala y reinicia el servidor |
| "La moneda XXX no está disponible" | Frankfurter no publica esa moneda | Convierte entre USD y PEN; es un límite de la fuente |
| Cambié `.env` y no pasa nada | El servidor lee `.env` al arrancar | Detén (Ctrl + C) y vuelve a ejecutar `npm start` |
| `SyntaxError: Cannot use import statement` | Node.js antiguo | Instala Node 18.17 o superior |

## 10. Publicar la aplicación (Vercel, gratuito)

Como hay funciones `/api`, el hosting debe admitir funciones serverless. **GitHub Pages no sirve** para la versión con claves (solo aloja archivos estáticos).

1. Sube el proyecto a GitHub (comprueba que `.env` **no** se sube).
2. Entra en https://vercel.com, inicia sesión con GitHub y pulsa **Add New → Project**.
3. Importa el repositorio. Framework: **Other**. No pongas comando de build.
4. En **Environment Variables** añade `RESTCOUNTRIES_API_KEY`, `UNSPLASH_ACCESS_KEY`, `UNSPLASH_APP_NAME`, `RAPIDAPI_KEY` y `RAPIDAPI_BOOKING_HOST` (las que tengas).
5. Pulsa **Deploy**. Comprueba `https://tu-proyecto.vercel.app/api/status`.

`vercel.json` indica que la web está en `public/` y da hasta 60 s a las funciones (la búsqueda de hoteles puede tardar). *Este despliegue no se probó desde el entorno de desarrollo; si Vercel muestra un error de configuración, revisa que el proyecto use Node 18 o superior.*

## 11. Limitaciones

- **Verificación real pendiente:** ningún endpoint real se ejecutó durante el desarrollo (el entorno no tenía acceso a esas APIs). Todo se probó con respuestas simuladas que siguen la documentación. Ejecuta `npm run verificar-apis`.
- Los nombres de algunos subcampos de REST Countries v5 (idiomas, traducciones) no están completamente documentados; el normalizador acepta varias formas posibles.
- Tipos de cambio diarios, no en tiempo real.
- Las cuotas gratuitas de RapidAPI y REST Countries son pequeñas; la caché en memoria ayuda en local, pero en Vercel cada instancia tiene la suya.
- OpenStreetMap no tiene precios ni puntuaciones de hoteles.
- La capital se muestra con el nombre que da la API (en inglés: "Tokyo").
- Las tasas de cambio en la interfaz se muestran con el formato numérico de Perú (es-PE: coma de miles, punto decimal).

## 12. Funcionalidades que requieren credenciales

| Funcionalidad | Sin clave | Con clave |
|---|---|---|
| Ficha del país | countries.dev (puede faltar población/zona horaria) | REST Countries v5 completa |
| Conversor de divisas | **Completo** (Frankfurter no usa clave) | — |
| Galería | Wikimedia Commons | Unsplash |
| Alojamientos | OpenStreetMap, sin precios | Booking.com con precio, puntuación y foto |
