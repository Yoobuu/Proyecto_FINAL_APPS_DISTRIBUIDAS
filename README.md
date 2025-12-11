# Sistema de Subastas Distribuidas – Proyecto Final

Plataforma de subastas remotas de obras de arte que consta de dos microservicios:

- **Servicio Manejador (puerto 8080):** Permite a un administrador configurar las subastas. Esto incluye definir el orden secuencial de las mismas, establecer el precio inicial, el incremento mínimo por puja y la duración de cada una. El servicio calcula automáticamente los tiempos de inicio y fin (`startAt`, `endAt`) para que las subastas se ejecuten una tras otra sin superposición.

- **Servicio de Postores (puerto 8081):** Es la interfaz para los usuarios finales. Consume la configuración del manejador para mostrar el listado de subastas, su estado en tiempo real (esperando, activa, cerrada) y un temporizador de cuenta regresiva. Los usuarios pueden registrarse en subastas de su interés y realizar pujas en tiempo real a través de WebSockets.

La aplicación sigue las especificaciones del enunciado del proyecto final: no utiliza base de datos y está construida con Node.js + Express en el backend, React en el frontend, y Docker para la contenerización. La comunicación entre servicios se realiza vía REST, mientras que las actualizaciones en tiempo real hacia los clientes (temporizadores, pujas, registros, etc.) se manejan con WebSockets (Socket.io).

---

## Cómo ejecutar el sistema

### Requisitos previos
- Docker Desktop instalado y corriendo en Windows.
- Puertos `8080` y `8081` libres en la máquina local.

### Levantar servicios con Docker Compose
Desde la carpeta raíz donde se encuentre el archivo docker-compose.yml, ejecutar en consola:

```powershell
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

## Funcionalidad Principal

El sistema implementa el ciclo completo de una subasta remota:

1.  **Configuración de Subastas (Manejador):**
    - En `http://localhost:8080`, el administrador puede reordenar las obras, y definir para cada una:
      - Precio inicial (debe ser mayor o igual al precio base sugerido).
      - Incremento mínimo por puja (debe ser mayor a cero).
      - Duración en segundos (debe ser al menos 1).
    - Al guardar, el sistema calcula los tiempos de inicio y fin secuenciales y envía la configuración al servicio de postores.

2.  **Visualización y Estados en Tiempo Real (Postores):**
    - En `http://localhost:8081`, los usuarios ven la lista de subastas con su estado: `Esperando`, `Activa` o `Cerrada`.
    - Un **temporizador (countdown)** muestra en vivo los segundos que faltan para que cada subasta comience o termine.
    - La primera subasta en la secuencia tiene un tiempo de espera de 0 segundos una vez que la configuración es guardada.

3.  **Registro de Postores:**
    - Los usuarios deben registrarse con un nombre en la página de detalle de cada subasta en la que deseen participar.
    - La lista de postores registrados se actualiza en tiempo real para todos los clientes que estén viendo esa subasta, gracias a WebSockets.

4.  **Pujas en Tiempo Real:**
    - El formulario de pujas solo se habilita cuando la subasta está en estado `Activa`.
    - El sistema valida que cada puja cumpla con el incremento mínimo (`monto >= precioActual + incrementoMinimo`).
    - Las pujas válidas se transmiten inmediatamente a todos los usuarios a través de WebSockets, actualizando el precio actual y el historial de pujas.
    - Las pujas inválidas son rechazadas y el sistema notifica al usuario que intentó realizarla.

5.  **Cierre de Subasta y Anuncio del Ganador:**
    - Cuando el temporizador de una subasta llega a cero, esta se cierra automáticamente y no se permiten más pujas.
    - El sistema determina al ganador (el autor de la última y más alta puja).
    - El nombre del ganador y el monto final se anuncian inmediatamente a todos los usuarios conectados a través de un evento de WebSocket.
    - El historial de pujas se mantiene visible incluso después de que la subasta ha cerrado.

---

## Checklist de Entregables del Proyecto Final

A continuación se presenta el checklist de los requerimientos para el proyecto final y su estado de cumplimiento en esta implementación.

- [x] **1. Las subastas se activan en el orden configurado por el manejador.**
  - El manejador define la secuencia, y el servicio de postores la ejecuta mediante un sistema de estados y temporizadores.

- [x] **2. Las subastas tienen un temporizador que muestra el número de segundos que falta para que se desactive.**
  - El backend calcula el tiempo restante y lo emite vía WebSocket (`countdown`), y el frontend lo renderiza en tiempo real.

- [x] **3. Las subastas no permiten que los postores hagan ofertas después de que se desactivan.**
  - Se implementa una doble validación: el frontend oculta el formulario y el backend rechaza la petición si la subasta no está `ACTIVA`.

- [x] **4. Las pujas de cada postor en cada subasta se registran y se mantienen después de que la subasta se desactiva.**
  - Las pujas se guardan en un array en memoria en el objeto de cada subasta. Este array persiste mientras el servidor esté en ejecución y no se limpia al cerrar la subasta.

- [x] **5. Las pujas se actualizan en tiempo real durante la subasta por medio de WebSockets.**
  - Al recibir una puja, el servidor emite un evento `bid:placed` a todos los clientes, que actualizan su UI de forma instantánea para reflejar la nueva puja.

- [x] **6. El ganador o ganadora de la subasta es inmediatamente publicado a todos los registrados en aquella subasta.**
  - Al cerrar la subasta, el servidor emite un evento `auction:closed` que contiene los datos del ganador. Esta información se muestra inmediatamente en la UI de todos los clientes conectados.

---

## Guía rápida de pruebas

1.  **Configurar subastas (manejador):**
    - Abrir `http://localhost:8080`.
    - Ordenar las obras y definir precio inicial, incremento mínimo y duración para cada una.
    - Guardar la configuración.
2.  **Ver configuración y temporizadores (postores):**
    - Abrir `http://localhost:8081` en una o más pestañas.
    - Confirmar que las subastas aparecen en el orden configurado y que los temporizadores de inicio corren en tiempo real.
3.  **Registrarse en una subasta:**
    - Entrar al detalle de una subasta.
    - Registrar un nombre de usuario. Si tienes la misma página abierta en otra pestaña, el nombre debe aparecer en la lista de registros al instante.
4.  **Realizar pujas:**
    - Esperar a que la subasta se ponga `Activa`.
    - Realizar una puja. El precio actual y el historial deben actualizarse para todos los clientes al instante.
    - Intentar realizar una puja por debajo del mínimo requerido y verificar que es rechazada.
5.  **Verificar cierre y ganador:**
    - Esperar a que el temporizador de la subasta llegue a cero.
    - Verificar que el formulario de puja se deshabilita y que se anuncia al ganador correctamente.

---

## Estructura del proyecto

```
apps_distribuidas_proyecto_final/
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

## Variables de entorno

- `POSTORES_URL` (en el manejador) → URL interna hacia el servicio de postores, por defecto `http://postores:8081` en Docker.
- `MANEJADOR_URL` (en postores) → URL interna hacia el manejador, por defecto `http://manejador:8080` en Docker.
- `WS_URL` (opcional para los clientes React) → URL del servidor de WebSockets; por defecto se usa el mismo origen.
- `PORT` → puerto de escucha dentro del contenedor (ya mapeado a 8080/8081 en la máquina host).

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
- Pruebas manuales y documentación de este README.
