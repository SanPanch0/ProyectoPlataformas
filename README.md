# Guía Global de Viajes

Escribe un país y obtén, en una sola página: ficha del país, conversor de su moneda frente al sol (PEN) y al dólar (USD), galería de fotos y alojamientos en su capital.

```bash
npm start          # http://localhost:3000  (Node.js 18.17+, sin dependencias)
npm test           # 37 pruebas automáticas
npm run verificar-apis   # prueba las APIs reales desde tu PC
```

- Instalación, APIs, claves, despliegue y problemas comunes: **[GUIA_INSTALACION_Y_APIS.md](GUIA_INSTALACION_Y_APIS.md)**
- Estado de cada API y acciones pendientes: **[ESTADO_APIS.md](ESTADO_APIS.md)**
- Las capturas en `capturas/` se tomaron con **datos simulados** (sin conexión a las APIs reales); por eso las imágenes aparecen como "no se pudo cargar".

## Diagnóstico inicial

No se recibió código previo: solo el informe del proyecto (PDF) y el prompt de trabajo. El proyecto se construyó desde cero siguiendo la arquitectura del informe (SPA en HTML, CSS y JavaScript, `fetch` + `async/await`, consultas en paralelo), con un cambio justificado: un backend mínimo para no exponer claves.

| Aspecto | Resultado |
|---|---|
| Funcionalidades existentes | Ninguna (no había código) |
| APIs del informe | REST Countries v3.1, Unsplash, Frankfurter (v1), Booking.com vía RapidAPI (booking-com21) |
| Errores encontrados en el planteamiento | REST Countries v3.1 retirada y v5 con clave; Frankfurter v1 obsoleta (vigente v2); booking-com21 no verificable; tres APIs requieren clave, imposible ocultarla en un frontend puro |
| Credenciales necesarias | `RESTCOUNTRIES_API_KEY`, `UNSPLASH_ACCESS_KEY`, `RAPIDAPI_KEY` (todas opcionales gracias a las alternativas) |
