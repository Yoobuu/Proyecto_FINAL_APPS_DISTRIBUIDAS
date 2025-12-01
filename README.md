# Sistema de Subastas Distribuidas – Deber 3 · Deber 4

Plataforma de subastas remotas de obras de arte con dos servicios:
- **manejador (8080):** configura el orden de las subastas, precio inicial, incremento mínimo y duración; calcula los tiempos `startAt` y `endAt` secuenciales (primera subasta en t = 0).
- **postores (8081):** consume la configuración del manejador, muestra countdowns, permite registrar postores y (para el proyecto final) gestionar pujas en vivo mediante WebSockets.

La aplicación sigue las especificaciones del enunciado (sin base de datos, usando Node.js + Express en el servidor, React en el cliente, comunicación REST entre servicios y WebSockets para actualizaciones en tiempo real).

---

## Cómo ejecutar el sistema

### Requisitos previos
- Docker Desktop instalado y corriendo en Windows.
- Puertos `8080` y `8081` libres en la máquina local.

### Levantar servicios con Docker Compose
Desde la carpeta raíz `apps_distribuidas_deber3/`:

```powershell
cd "c:\Users\andre\Desktop\Aplicaciones Distribuidas\Deber 4\apps_distribuidas_deber3\apps_distribuidas_deber3"
docker compose up --build
```

Esto levanta:
- **Manejador** en `http://localhost:8080` (servicio de administración de subastas).
- **Postores** en `http://localhost:8081` (servicio usado por los usuarios postores).

Comandos útiles:

```powershell
docker compose ps
docker compose logs -f
docker compose down
```

---

## Estructura del proyecto

```
apps_distribuidas_deber3/
  manejador/
   server/   (Node.js + Express, lógica de configuración de subastas)
   client/   (React, UI del manejador)
   Dockerfile
  postores/
   server/   (Node.js + Express + Socket.io, lógica de postores y WebSockets)
   client/   (React + React Router, UI de postores)
   Dockerfile
  docker-compose.yml
  scripts/
   clean.sh
   seed.sh
   test.sh
```

---

## Deber 3 – Configuración de subastas

Corresponde a los entregables de configuración del enunciado.

### Funcionalidad principal
1. **Orden y reglas de subastas (manejador):**
  - En `http://localhost:8080` se muestra la lista de obras de arte.
  - El manejador puede **reordenar** las subastas y editar:
    - Precio inicial de cada subasta.
    - Incremento mínimo permitido.
    - Duración de la subasta en segundos.
2. **Validaciones de negocio:**
  - `precioInicial ≥ precioBase` (del enunciado).
  - `incrementoMinimo > 0`.
  - `duracion ≥ 1` segundo.
3. **Cálculo de tiempos:**
  - Al guardar la configuración se calculan `startAt` y `endAt` de cada subasta de forma secuencial.
  - La **primera subasta** inicia en `t = 0` segundos; las siguientes comienzan cuando termina la anterior.
4. **Exposición al servicio de postores:**
  - El manejador expone la configuración completa vía REST.
  - El servicio de postores consume esta configuración para mostrar el mismo orden, reglas y tiempos.

### Endpoints relevantes – Deber 3

**Manejador (8080)**
- `GET /api/obras` – Lista de obras con sus datos base.
- `POST /api/config` – Guarda la configuración de subastas (orden, reglas, tiempos).
- `GET /api/config` – Devuelve la configuración actual.
- `GET /api/auctions` – Lista de subastas con `startAt`/`endAt`.
- `GET /api/auctions/:id` – Detalle de una subasta.
- `POST /api/reset` – Restablece configuración a estado inicial.
- `GET /api/health` – Comprobación rápida del servicio.

**Postores (8081)**
- `GET /api/auctions` – Lista las subastas que ve el postor con el mismo orden definido en el manejador.

---

## Deber 4 – Registro de postores y countdown de inicio

Corresponde a los entregables de Deber 4 del enunciado.

### Lo que se implementa
1. **Estados de subasta en el cliente de postores:**
  - En `http://localhost:8081` cada subasta muestra su estado en tiempo real: `esperando`, `activa` o `cerrada`.
2. **Temporizador de inicio secuencial:**
  - Cada subasta tiene un **countdown** que muestra el número de segundos que faltan para que comience, una vez que el manejador terminó la configuración.
  - El contador decrece en tiempo real en la interfaz de postores.
  - La **primera subasta** inicia con tiempo de espera **0 segundos**.
3. **Registro de postores por subasta:**
  - Desde la página de detalle de cada subasta (por ejemplo `/auction/:id`) un usuario ingresa su nombre y se registra.
  - El backend valida que el nombre sea no vacío y responde con errores visibles en caso contrario.
4. **Actualización en tiempo real (WebSockets):**
  - Cuando un postor se registra en una subasta, la lista de usuarios registrados se actualiza **en vivo** en todas las pestañas conectadas a esa subasta (sin recargar la página).
  - Esto cumple con el requerimiento de “ver los nombres de usuario de los postores registrados en tiempo real en la página de la subasta”.

### Endpoints relevantes – Deber 4

**Postores (8081)**
- `POST /api/auctions/:id/register` – Registra un nuevo postor en la subasta indicada.
- `GET /api/auctions/:id/registers` – Devuelve la lista de postores inscritos a esa subasta.

**Eventos WebSocket** (canal postores):
- `countdown` – Actualiza contadores de inicio de las subastas.
- `nuevo-registro` (u otro nombre equivalente en código) – Notifica nuevas inscripciones a todos los clientes conectados.

---

## (Avance hacia Proyecto Final – Pujas y ganador)

Aunque no todo es requerido para Deber 4, se dejó preparada parte de la funcionalidad del proyecto final:

1. Las subastas solo aceptan pujas cuando su estado es **ACTIVE** y antes de `endAt`.
2. Se valida que `monto >= currentPrice + minIncrement`; pujas inválidas son rechazadas e informadas al cliente.
3. Se manejan eventos WebSocket para:
  - Actualizar countdown de inicio y cierre.
  - Difundir nuevas pujas y rechazos.
  - Notificar apertura y cierre de subastas.
4. Se mantiene historial de pujas por subasta e historial global accesible por API.

---

## Variables de entorno

- `POSTORES_URL` (en el manejador) → URL interna hacia el servicio de postores, por defecto `http://postores:8081` en Docker.
- `MANEJADOR_URL` (en postores) → URL interna hacia el manejador, por defecto `http://manejador:8080` en Docker.
- `WS_URL` (opcional para los clientes React) → URL del servidor de WebSockets; por defecto se usa el mismo origen.
- `PORT` → puerto de escucha dentro del contenedor (ya mapeado a 8080/8081 en la máquina host).

---

## Guía rápida de pruebas (Deber 3 y 4)

1. **Configurar subastas (manejador):**
  - Abrir `http://localhost:8080`.
  - Ordenar las obras y definir precio inicial, incremento mínimo y duración.
  - Intentar guardar valores inválidos para comprobar las validaciones.
2. **Ver configuración en postores:**
  - Abrir `http://localhost:8081`.
  - Confirmar que se respeta el mismo orden, precios iniciales, incrementos mínimos y duraciones.
3. **Ver countdown de inicio:**
  - Observar que cada subasta muestra cuántos segundos faltan para comenzar y que el valor decrece en tiempo real.
  - Comprobar que la primera subasta tiene tiempo de espera 0.
4. **Registro en tiempo real:**
  - Abrir la misma subasta en dos pestañas distintas del navegador.
  - Registrar un nombre de usuario en una pestaña y verificar que aparece automáticamente en la otra.
  - Probar registros inválidos (nombre vacío) y verificar los mensajes de error.

---

## Repartición de trabajo (resumen)

> Nota: la distribución es referencial para documentar aportes individuales.

### 👤 Paulo Cantos
- Configuración de puertos y Docker Compose.
- Implementación de endpoints base del manejador (`/api/obras`, `/api/auctions`, `/api/config`).
- Cálculo de `startAt`/`endAt` y validaciones de reglas de negocio.

### 👤Gian Tituaña
- Cliente React del manejador: formulario de configuración, validaciones de formulario y mensajes de error/éxito.
- Exposición del orden de subastas hacia el servicio de postores.
- Scripts de soporte (`clean.sh`, `seed.sh`, `test.sh`).

### 👤 Sebastian Encalada
- Servicio de postores (Express + Socket.io): endpoints de registro y obtención de inscritos.
- Integración entre postores y manejador vía REST.
- Implementación de WebSockets para countdown y actualización de registros en tiempo real.

### 👤 Andres Bohorquez
- Cliente React de postores: listado de subastas, páginas de detalle, visualización de estados.
- Implementación de countdowns en la UI y bloqueo/desbloqueo de formularios según estado.
- Pruebas manuales de Deber 3 y Deber 4, y documentación de este README.

