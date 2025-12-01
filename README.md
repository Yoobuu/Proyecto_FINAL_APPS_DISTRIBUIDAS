# Sistema de Subastas Distribuidas – Deber 3 · Deber 4 · Proyecto Final

Plataforma con dos servicios:
- **manejador (8080):** configura orden, precio inicial, incremento mínimo y duración; genera `startAt`/`endAt` secuenciales desde t=0.
- **postores (8081):** consume la configuración, muestra countdowns, registra interesados y gestiona pujas en vivo con WebSockets.

## Cómo levantar con Docker
```bash
docker compose up --build
```
Navega:
- Manejador: http://localhost:8080
- Postores: http://localhost:8081

Comandos útiles: `docker compose ps`, `docker compose logs -f`, `docker compose down`.

## Estructura
```
apps_distribuidas_deber3/
  manejador/
    server/ (Express)
    client/ (React)
    Dockerfile
  postores/
    server/ (Express + Socket.io)
    client/ (React + React Router)
    Dockerfile
  docker-compose.yml
  scripts/
```

## Deber 3 (configuración)
1) En http://localhost:8080 ordenar las obras y editar reglas.
2) Validaciones: precioInicial ≥ precioBase, incrementoMinimo > 0, duración ≥ 1s.
3) Guardar: se calcula `startAt` (t=0 primera subasta) y `endAt` secuencialmente y se envía a postores.
4) En http://localhost:8081 se refleja el mismo orden y reglas.

## Deber 4 (registro + countdown)
1) En postores se muestran estados: esperando, activa, cerrada.
2) Countdown de inicio y cierre en tiempo real (WebSocket `countdown`).
3) Registro de interesados por subasta (`/api/auctions/:id/register`) validando nombre y mostrando errores visibles.

## Proyecto Final (pujas + ganador)
1) Solo se puede pujar cuando la subasta está **ACTIVE** y antes de `endAt`; después se bloquea.
2) Validación de monto: `monto >= currentPrice + minIncrement`; rechazos con `bid:rejected`.
3) Eventos WebSocket:
   - `countdown` (inicio/fin y estado)
   - `nuevo-registro`
   - `bid:placed` / `bid:rejected`
   - `auction:opened` / `auction:closed`
   - `auction:updated`
4) Historial global persiste tras cierre (`/api/history-global`).
5) Ganador se determina automáticamente al cerrar (última puja).

## Endpoints clave
**Manejador (8080)**
- `GET /api/obras`
- `POST /api/config`
- `GET /api/config`
- `POST /api/reset`
- `GET /api/auctions`
- `GET /api/auctions/:id`
- `GET /api/health`

**Postores (8081)**
- `GET /api/auctions`
- `POST /api/auctions/:id/register`
- `GET /api/auctions/:id/registers`
- `POST /api/auctions/:id/bid`
- `GET /api/history-global`
- `POST /api/reset`

## Variables de entorno
- `POSTORES_URL` (manejador) → http://postores:8081
- `MANEJADOR_URL` (postores) → http://manejador:8080
- `WS_URL` opcional para clientes (por defecto usa mismo origen)
- `PORT` (ya expuesto 8080/8081)

## Frontend
- **manejador:** formulario con validaciones y botón “Reset config”; mensajes claros de error/éxito.
- **postores:** Subasta.jsx muestra estado, countdown de inicio y cierre, formularios bloqueados si no está ACTIVE, historial y registros en vivo.

## Scripts
- `scripts/clean.sh`: limpia node_modules locales.
- `scripts/test.sh`: HEAD básico de endpoints.
- `scripts/seed.sh`: configuración y tráfico de ejemplo con curl.

## Tips de prueba
- Si cambia código: `docker compose up --build`.
- Verifica puertos 8080/8081 libres antes de levantar.
- Si algo falla en frontend, revisa que `server/public` contenga el build de React.
