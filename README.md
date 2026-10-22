# Transforma Party — Lobby multijugador 0.1

Primera versión funcional del lobby. Permite crear salas temporales, generar un código y un QR, entrar desde teléfonos, escoger nombre/color, ver los jugadores conectados en tiempo real y activar el estado de inicio.

> Esta versión desarrolla el lobby. El tablero y las reglas del minijuego todavía no están integrados; al pulsar **Empezar partida**, los dispositivos reciben la señal de inicio y muestran una pantalla de transición.

## Requisitos

- Node.js 20 o superior.
- Conexión a internet para cargar la librería de QR y las fuentes desde CDN.

## Ejecutar en tu computador

1. Descomprime la carpeta.
2. Abre una terminal dentro de la carpeta `transforma-party-lobby`.
3. Ejecuta `npm install`.
4. Ejecuta `npm start`.
5. Abre `http://localhost:3000`.

Para probar desde teléfonos conectados a la misma red Wi‑Fi, abre el puerto 3000 en la red local y entra a la dirección IP local de tu computador (por ejemplo, `http://192.168.1.20:3000`). No uses `localhost` en el teléfono, porque apuntaría al propio teléfono.

## Publicar para usar QR fuera de tu red

El proyecto incluye `render.yaml` para facilitar el despliegue en Render. También puedes subir la carpeta a un repositorio GitHub y crear un **Web Service** en Render con:

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

Cuando esté publicado con una URL HTTPS, el QR llevará directamente a esa sala y podrán entrar los teléfonos con datos móviles o Wi‑Fi.

**Importante sobre el plan gratuito:** Render puede suspender servicios gratuitos tras 15 minutos sin tráfico entrante; al reactivarse puede demorar alrededor de un minuto. Para una clase, abre y prueba el enlace antes de que entren los estudiantes. Las salas y jugadores de esta versión se guardan en memoria y se pierden si el servidor se reinicia o suspende.

## Qué incluye

- Crear una sala de profesor con código aleatorio de 4 caracteres.
- QR y enlace directo a la sala; botones para copiar enlace y código.
- Entrada por QR o con código manual.
- Nombre de hasta 20 caracteres y elección de 10 colores.
- Sincronización en tiempo real con Socket.IO.
- Lista de jugadores con estado de conexión; hasta 40 jugadores por sala.
- Controles de profesor: cerrar/reabrir ingreso, empezar, volver al lobby y terminar sala.
- Reconexión básica tras refrescar una pestaña.

## Privacidad y uso

No se solicitan cuentas, correos ni datos personales. Los nombres y colores se mantienen en la memoria del servidor mientras la sala esté activa. Recomienda a los estudiantes usar nombre o apodo apropiado para el curso.
