# Portería — Despliegue en producción (runbook para TI)

Módulo de control de ingresos y salidas de vehículos. Backend dentro de Mantix (`/api/porteria/v1`), front en `https://losolivoscucuta.com/porteria/`.

Orden: **1 → 9**. Cada paso dice cómo comprobarlo y cómo deshacerlo. Hasta el paso 7, Mantix funciona igual que hoy: sin las variables `PORTERIA_*` el módulo responde 503 y nada más cambia.

## 1. Grupos del AD

Crear dos grupos de seguridad (nombres sugeridos; si se usan otros, ponerlos en el paso 6):

- `Porteria-Guardas`: guardas de las casetas.
- `Porteria-Admin`: quienes administran motivos, proveedores y consultan reportes.

Agregar los usuarios del piloto. El rol se decide por el CN exacto del grupo y solo con la pertenencia directa (`memberOf` del usuario): un usuario que entra a `Porteria-Guardas` a través de otro grupo anidado no cuenta; hay que agregarlo directamente. Un usuario en los dos grupos entra como administrador. Los miembros del grupo de administración general que ya usa Mantix (`LDAP_GROUP_ADMIN`) también entran a Portería como administradores, sin estar en `Porteria-Admin`.

Deshacer: borrar los grupos.

## 2. Publicar el código (deploy de Mantix)

El código ya está en `origin/main` de `ebor94/mantix`. En srv-backend:

```bash
bash ~/apps/mantix/mantix-backend/scripts/deploy-mantix.sh
```

Si `HEAD` ya es igual a `origin/main`, el script imprime "sin cambios remotos … Salgo sin reiniciar." y termina sin tocar nada. El sha anterior (para un deshacer manual) queda en la línea `actualizando: <sha anterior> -> <sha nuevo>`.

Comprobar: el script termina en "deploy exitoso"; `curl -s https://mantix-api.losolivoscucuta.com:8444/api/porteria/v1/health` responde **503** con `"motivo":"PORTERIA_DESHABILITADO"` (es lo esperado todavía) y las demás pantallas de Mantix funcionan.

Deshacer: el script hace rollback solo si el health check de Mantix falla. A mano: `git reset --hard <sha anterior>` en `~/apps/mantix/mantix-backend`, `npm ci --omit=dev` si cambió `package.json` (o `package-lock.json`) entre los dos sha y `pm2 restart mantix-backend --update-env`.

## 3. Verificar la base (solo lectura)

Desde `~/apps/mantix/mantix-backend`, con el usuario y la base de Mantix (los del `.env`):

```bash
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < src/porteria/scripts/verificarProduccion.sql
```

- `version` debe ser **SI** (MySQL ≥ 8.0.1). Si es **NO**, detener: corregir y anular registros fallarían.
- `exequias.fecha` debe ser **SI**. Cualquier chequeo en **NO** (incluido `collation_vehiculos.placa` con `NO EXISTE`) detiene el despliegue.
- Anotar `time_zone_global`, `innodb_lock_wait_timeout`, las collations y `placas_con_espacios_raros` y enviarlos al equipo de desarrollo si alguno dice **REVISAR**.
- En `SHOW GRANTS` el usuario debe tener `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `INDEX`, `DROP`, `REFERENCES` y `CREATE VIEW` sobre la base (o `ALL PRIVILEGES`). `DROP` lo necesitan la migración 003 (que reemplaza la vista) y los pasos de deshacer; `INSERT` las migraciones que cargan datos de fábrica; `SELECT` la vista, que lee `sedes` y `vehiculos`. Si los privilegios llegan por roles de MySQL, `SHOW GRANTS` solo muestra los roles: usar `SHOW GRANTS FOR CURRENT_USER USING <rol>;` para ver los privilegios efectivos.

## 4. Migraciones

En `~/apps/mantix/mantix-backend`:

```bash
npm run porteria:migrate
```

Esperado: `aplicada 001_esquema.sql` … `aplicada 007_admin_e_idempotencia.sql` y `7 migración(es) aplicada(s)`. Una segunda corrida dice `Sin migraciones pendientes`.

Las migraciones solo crean tablas `por_*` y la vista `v_por_movimientos`. No tocan tablas de H360.

Si falla a la mitad: las migraciones 005 (tres `ALTER`) y 007 (dos `ALTER`) no son atómicas, y una migración que falla no queda registrada, así que reintentar repetiría los `ALTER` que sí se aplicaron. Antes de reintentar, revisar qué quedó: `SHOW CREATE TABLE por_estado_vehiculo` (columna `sembrado_at`), `SHOW CREATE TABLE por_eventos` (`inconsistencia_tipo`, columna `clave_cliente` e índice `uq_por_eventos_clave`) y `SHOW CREATE TABLE por_auditoria` (`SEMBRAR` y `ELIMINAR` en `accion`), y avisar al equipo de desarrollo.

Deshacer (solo si se abandona el módulo): `DROP VIEW v_por_movimientos;` y `DROP TABLE` de `por_auditoria, por_eventos, por_estado_vehiculo, por_vehiculos_externos, por_motivos, por_migraciones`, en ese orden.

## 5. Siembra de la sede piloto

Marca como **dentro** de la sede a los vehículos de la empresa que están allí el día de arranque. Primero obtener el id de la sede piloto:

```sql
SELECT id, nombre FROM sedes WHERE activo = 1;
```

Luego simular:

```bash
npm run porteria:sembrar -- --sede <id_sede> --placas ABC123,XYZ789 --simular
```

Revisar la salida: `Se sembrarían en la sede <id>: N (placas)` y una línea `Omitido <placa>: <razón>` por cada placa que no se sembraría; termina con `Simulación: no se escribió nada.` El comando imprime primero la base (`Base: host/base`) y la sede (`Sede: id — nombre`): comprobar que esa línea `Sede:` es la sede piloto antes de seguir. Sale con código 2 si una placa no es un vehículo activo de la empresa. Luego, sin `--simular`:

```bash
npm run porteria:sembrar -- --sede <id_sede> --placas ABC123,XYZ789
```

`--todos` (en lugar de `--placas`) siembra en esa sede **todos** los propios activos sin estado: usarlo solo si toda la flota arranca en esa sede. Se puede repetir sin duplicar. Nunca pisa un estado existente.

Deshacer (solo filas sin eventos; las filas de `por_auditoria` con acción `SEMBRAR` se conservan como historial):

```sql
DELETE FROM por_estado_vehiculo WHERE sede_id = <id_sede> AND ultimo_evento_id IS NULL AND sembrado_at IS NOT NULL;
```

## 6. Variables del módulo

En el `.env` de `~/apps/mantix/mantix-backend` agregar:

```
PORTERIA_JWT_SECRET=<48+ caracteres aleatorios, distinto de JWT_SECRET, IDENTIDAD_JWT_SECRET y TRK_JWT_SECRET>
PORTERIA_JWT_EXPIRES=12h
LDAP_GROUP_PORTERIA_GUARDA=Porteria-Guardas
LDAP_GROUP_PORTERIA_ADMIN=Porteria-Admin
```

Generar el secreto con `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"`.

CORS: si el `.env` define `CORS_ORIGIN`, agregarle `https://losolivoscucuta.com` (separado por comas). Si no lo define, ese origen ya está permitido por defecto.

## 7. Habilitar

```bash
pm2 restart mantix-backend --update-env
curl -s https://mantix-api.losolivoscucuta.com:8444/api/porteria/v1/health
```

Esperado: `{"success":true,"data":{"estado":"ok","bd":"ok"}}`. Si sigue el 503, el motivo lo escribe `logger.error` como `porteria deshabilitado: <motivo>`, **una sola vez por arranque** y al llegar la primera petición al módulo (el `curl` de arriba la genera). Con `NODE_ENV=production` el logger no escribe en consola, solo en archivo; por eso buscar primero ahí (la ruta `logs/` es relativa a la carpeta desde la que corre pm2, normalmente la del backend):

```bash
grep "porteria deshabilitado" ~/apps/mantix/mantix-backend/logs/error.log
```

y en segundo lugar `pm2 logs mantix-backend --lines 50` (solo aparecerá si el proceso no corre con `NODE_ENV=production`). El motivo puede ser una variable faltante (`Faltan variables: …`), que `PORTERIA_JWT_SECRET` sea igual a `JWT_SECRET`, `IDENTIDAD_JWT_SECRET` o `TRK_JWT_SECRET`, o un `PORTERIA_JWT_EXPIRES` inválido (usar p. ej. `12h`).

Swagger: `https://mantix-api.losolivoscucuta.com:8444/api-docs` muestra las rutas de Portería.

Avisar al equipo de desarrollo: con el health en 200 se publica el front (`https://losolivoscucuta.com/porteria/`).

Deshacer: quitar `PORTERIA_JWT_SECRET` del `.env` y `pm2 restart mantix-backend --update-env` (el módulo vuelve a 503; los datos quedan).

## 8. Primer ingreso

1. Un administrador entra en `https://losolivoscucuta.com/porteria/` con su usuario del AD: llega a "Administración". Revisar Motivos (12 de fábrica) y Proveedores.
2. Un guarda entra, elige la sede piloto y ve en "Vehículos" los sembrados como dentro.

Si el login responde "Tu usuario no tiene acceso a Portería. Contacta a TI.", el usuario no está en ninguno de los dos grupos (revisar el CN exacto del paso 1).

## 9. Checklist del piloto (sede piloto, primer turno)

- [ ] Instalar la app en la tablet o el celular de la caseta (Chrome → "Instalar app" / "Agregar a pantalla principal") y abrirla desde el ícono.
- [ ] Registrar una salida y un ingreso reales de un vehículo de la empresa (con conductor, motivo y km) y uno de un proveedor (guardando la placa en el catálogo).
- [ ] Ver el viaje en Administración → Movimientos y descargar el Excel (desde un computador).
- [ ] Recargar el navegador en una pantalla interna (p. ej. Vehículos): debe seguir en esa pantalla.
- [ ] Modo avión: la app abre y avisa "Sin conexión"; al volver la red, "Reintentar" funciona.
- [ ] Con el backend detenido unos segundos (`pm2 stop mantix-backend`, solo en una ventana acordada): la app avisa que el servidor no responde; al iniciarlo (`pm2 start mantix-backend`) vuelve a funcionar.
- [ ] Con el AD caído o una contraseña errada: el login muestra el error correcto.
- [ ] Al vencer la sesión (12 h, o con `PORTERIA_JWT_EXPIRES=5m` en una prueba), la app vuelve al login con "Tu sesión venció. Vuelve a entrar."
- [ ] Un registro forzado ("Registrar igual") aparece marcado como inconsistente en Movimientos.

Anotar cualquier diferencia y enviarla al equipo de desarrollo.
