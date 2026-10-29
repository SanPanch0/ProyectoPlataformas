# Estado de las APIs — Guía Global de Viajes

Fecha de la revisión: 24 de octubre de 2026.

## Aviso importante sobre cómo se verificó

El entorno donde se desarrolló el proyecto **no tenía salida a Internet hacia las APIs** (las conexiones a `restcountries.com`, `api.frankfurter.dev`, `api.unsplash.com` y `rapidapi.com` fueron rechazadas por el proxy del entorno). Por eso:

- La **documentación oficial** sí se consultó en línea (ver enlaces).
- **Ningún endpoint real se ejecutó** desde el entorno de desarrollo. No se declara ninguna API como "FUNCIONA" sin esa prueba.
- La lógica se probó con **37 pruebas automáticas** contra un servidor simulado que reproduce la forma documentada de cada respuesta, incluidos los errores 400, 401, 403, 404, 422, 429, 500, JSON inválido y tiempo agotado.
- La interfaz se abrió en **Chromium (sin pantalla)** en escritorio (1280 px) y móvil (390 px) contra ese servidor simulado: búsqueda de Perú, Japón y España, conversión USD↔PEN en ambos sentidos, importe inválido y país inexistente. Sin errores de JavaScript; sin desbordamiento horizontal en móvil.

Para completar la verificación real, ejecuta en tu PC: `npm run verificar-apis` (ver sección final).

## Resumen

| Nombre | Función | Documentación oficial | Endpoint usado | Estado de la prueba | ¿Requiere API Key? | ¿Plan gratuito confirmado? | Límites conocidos | Acción pendiente del usuario |
|---|---|---|---|---|---|---|---|---|
| REST Countries **v5** | Datos del país | https://restcountries.com/docs/countries | `GET https://api.restcountries.com/countries/v5/codes.alpha_2/{CC}` | REQUIERE CREDENCIALES · ALTERNATIVA IMPLEMENTADA (countries.dev) | Sí (Bearer) | Sí, según documentación (≈500 peticiones/mes según un tercero; verificar en el panel) | 20 peticiones / 10 s; `limit` máx. 100; CORS bloqueado por defecto | Crear cuenta y clave; ejecutar `npm run verificar-apis` |
| REST Countries v3.1 (la del informe) | — | https://restcountries.com/docs/countries/api-versions | `https://restcountries.com/v3.1/...` | **RETIRADA**: devuelve un objeto de error en lugar de países | — | — | — | Ninguna: ya no se usa |
| countries.dev | Alternativa sin clave para países | https://countries.dev/docs | `GET https://countries.dev/alpha/{CC}` | PENDIENTE DEL USUARIO (no probado en real) | No | Sí, según su web | No publicados | Verificar con `npm run verificar-apis` |
| Frankfurter **v2** | Tipos de cambio | https://frankfurter.dev/ | `GET https://api.frankfurter.dev/v2/rates?base=USD&quotes=PEN,JPY` | PENDIENTE DEL USUARIO (no probado en real; PEN figura en https://frankfurter.dev/currencies/pen/) | No | Sí (sin cuotas, con límite anti-abuso) | Actualización diaria; sin conversión directa (se multiplica) | Verificar con `npm run verificar-apis` |
| Unsplash | Fotografías | https://unsplash.com/documentation | `GET https://api.unsplash.com/search/photos?query=...` | REQUIERE CREDENCIALES · ALTERNATIVA IMPLEMENTADA (Wikimedia Commons) | Sí (Access Key) | Sí, modo demo | 50 peticiones/hora en demo; 1 000/hora en producción (requiere aprobación) | Crear aplicación y obtener Access Key |
| Wikimedia Commons | Alternativa sin clave para fotos | https://www.mediawiki.org/wiki/API:Main_page | `GET https://commons.wikimedia.org/w/api.php?generator=search...` | PENDIENTE DEL USUARIO (no probado en real) | No | Sí | Uso razonable; exige User-Agent descriptivo (incluido) | Verificar con `npm run verificar-apis` |
| Booking.com vía RapidAPI (**booking-com15**, DataCrawler) | Hoteles con precio, puntuación y foto | https://rapidapi.com/DataCrawler/api/booking-com15 | `searchDestination` → `searchHotels` | REQUIERE CREDENCIALES · ACCESO RESTRINGIDO (suscripción) | Sí (`x-rapidapi-key`) | Hay plan BASIC gratuito según guías de terceros; **cuotas no confirmadas** | Cuota mensual y por minuto del plan | Registrarse, suscribirse al plan BASIC y copiar la clave |
| booking-com21 (ExtractEdge, la del informe) | — | https://rapidapi.com/ExtractEdge/api/booking-com21 | — | **NO VERIFICABLE**: no se encontró documentación vigente | — | No confirmado | — | Si quieres usarla, revisa si sigue publicada; el código acepta cambiar el host en `RAPIDAPI_BOOKING_HOST` solo si sus endpoints son iguales |
| Booking.com Demand API (oficial) | — | https://developers.booking.com/demand | — | ACCESO RESTRINGIDO: solo socios afiliados aprobados | Sí | No (no hay alta libre) | — | No aplicable a un proyecto académico |
| OpenStreetMap (Overpass API) | Alternativa sin clave: alojamientos reales sin precios | https://wiki.openstreetmap.org/wiki/Overpass_API | `POST https://overpass-api.de/api/interpreter` | PENDIENTE DEL USUARIO (no probado en real) | No | Sí | Uso razonable; puede ser lento | Verificar con `npm run verificar-apis` |

## Bloques de intervención

### API pendiente: REST Countries v5

**Motivo:** la versión v3.1 que cita el informe fue retirada; ahora devuelve un objeto de aviso en lugar de la lista de países. La versión vigente es la v5, con nueva URL (`api.restcountries.com/countries/v5`), nueva forma de respuesta (`data.objects`) y **clave obligatoria**. Sin clave, la app usa countries.dev automáticamente.

**Enlace oficial:** https://restcountries.com/sign-up · documentación: https://restcountries.com/docs/countries

**Qué debo hacer:**
1. Abre https://restcountries.com/sign-up y crea una cuenta con tu correo.
2. Entra al panel y abre la sección **API Keys**.
3. Crea una clave nueva (no uses la clave de demostración `rc_live_demo`: devuelve datos de ejemplo, no reales).
4. No hace falta configurar orígenes CORS, porque la app llama desde el servidor, no desde el navegador.

**Qué credencial necesito:** API Key (se envía como `Authorization: Bearer ...`).

**Dónde configurarla:** archivo `.env` → `RESTCOUNTRIES_API_KEY=` (en Vercel: *Settings → Environment Variables*).

**Cómo comprobarla:** `npm run verificar-apis` (muestra el código HTTP, nunca la clave). Debe aparecer `✔ REST Countries v5 (JP): 200 OK`.

**Estado actual del código:** implementado en `api/country.js` (búsqueda por código ISO y por texto, normalización tolerante de campos, caché de 24 h para ahorrar cuota) y su alternativa countries.dev. Pendiente: probar contra la API real y, si algún nombre de campo difiere, ajustar `lib/normalize.js` (la documentación pública no detalla todos los subcampos de `languages`).

### API pendiente: Unsplash

**Motivo:** la API exige una Access Key de una aplicación registrada.

**Enlace oficial:** https://unsplash.com/developers · https://unsplash.com/oauth/applications

**Qué debo hacer:**
1. Inicia sesión o regístrate en Unsplash.
2. Ve a https://unsplash.com/oauth/applications y pulsa **New Application**.
3. Acepta las condiciones de la API (lee las directrices: atribución obligatoria y uso directo de las URL de las imágenes).
4. Escribe un nombre (por ejemplo `guia_global_de_viajes`) y una descripción.
5. En la página de la aplicación, copia la **Access Key** (no la *Secret Key*).

**Qué credencial necesito:** Access Key.

**Dónde configurarla:** `.env` → `UNSPLASH_ACCESS_KEY=` y, opcionalmente, `UNSPLASH_APP_NAME=` con el nombre de tu aplicación (se usa en los enlaces de atribución).

**Cómo comprobarla:** `npm run verificar-apis` → `✔ Unsplash search/photos: 200 OK`.

**Estado actual del código:** implementado en `api/photos.js` con atribución al fotógrafo y a Unsplash (enlaces con `utm_source`), texto alternativo, carga progresiva y control de imágenes rotas. Si falta la clave, falla o se agota la cuota (429), usa Wikimedia Commons mostrando autor y licencia.

### API pendiente: Booking.com vía RapidAPI

**Motivo:** la API del informe (`booking-com21` de ExtractEdge) no pudo verificarse: no se encontró documentación vigente. Se eligió la API **"Booking COM" de DataCrawler** (`booking-com15.p.rapidapi.com`), la más documentada, orientada a viajeros que buscan hoteles (no a la gestión de alojamientos). La API oficial de Booking (Demand API) solo es para socios aprobados.

**Enlace oficial:** https://rapidapi.com/DataCrawler/api/booking-com15 (precios: pestaña **Pricing**).

**Qué debo hacer:**
1. Crea una cuenta en https://rapidapi.com/auth/sign-up.
2. Abre https://rapidapi.com/DataCrawler/api/booking-com15 y entra en **Pricing**.
3. Elige el plan **BASIC** ($0) y pulsa **Subscribe**. Revisa la cuota mensual que indique: no se pudo confirmar desde aquí. Si pide tarjeta, decide tú si continuar; no es necesario para el resto de la app.
4. Ve a **Playground**: la clave aparece en el campo `X-RapidAPI-Key` (también en https://rapidapi.com/developer/apps).

**Qué credencial necesito:** RapidAPI Key.

**Dónde configurarla:** `.env` → `RAPIDAPI_KEY=` y `RAPIDAPI_BOOKING_HOST=booking-com15.p.rapidapi.com`.

**Cómo comprobarla:** `npm run verificar-apis` → `✔ Booking (RapidAPI booking-com15.p.rapidapi.com) searchDestination: 200 OK`. Un `403` significa que la clave existe pero falta la suscripción al plan.

**Estado actual del código:** implementado en `api/hotels.js` (destino → hoteles, precio total y por noche, puntuación, foto, enlace de búsqueda en Booking). Sin clave o ante cualquier error, muestra alojamientos reales de OpenStreetMap **sin precios** (lo indica en pantalla), y si eso también falla, solo enlaces externos claramente etiquetados. Nunca se inventan hoteles ni precios.

### Frankfurter (sin intervención obligatoria)

No necesita clave. El informe usa la v1 (`/latest?from=...`); la versión vigente es la **v2**, que reúne 105 bancos centrales y fuentes oficiales y cubre 223 monedas, incluido el sol peruano. Solo falta confirmar la respuesta real con `npm run verificar-apis`.

## Cómo verificar todo en tu computadora

```bash
cp .env.example .env      # en Windows: copy .env.example .env
# (rellena las claves que tengas; las vacías usan la alternativa)
npm run verificar-apis
```

El script prueba cada API directamente y luego el flujo completo para Perú, Japón y España, más una moneda no admitida. Si algo falla, copia la salida (no contiene claves) y revisa la sección de problemas comunes de `GUIA_INSTALACION_Y_APIS.md`.
