# Despliegue del módulo Horno INCOL

Cada paso dice cómo comprobarlo y cómo deshacerlo.

## 1. Conectividad del servidor de mantix-api con el MySQL central

En el servidor de mantix-api:

```bash
nc -vz 192.9.17.30 3306
```

Debe decir `succeeded`/`open`. Si no, abrir el puerto 3306 del central hacia ese servidor. Sin esto el
módulo responde 503 en `/health`.

## 2. Usuario de solo lectura en el central

Ejecutar `mysql/05_usuario_incol_api.sql` (proyecto eserver) en 192.9.17.30 con root, cambiando la clave.
Comprobar: `SHOW GRANTS FOR 'incol_api'@'%';` muestra solo `SELECT ON horno.*`.
Deshacer: `DROP USER 'incol_api'@'%';`

## 3. Grupo del AD

Crear el grupo de seguridad `INCOL_APP` y agregar a los usuarios **directamente** (un grupo dentro del
grupo no da acceso). Deshacer: quitar al usuario del grupo (el token vigente vence en `HORNO_JWT_EXPIRES`).

## 4. Variables en el `.env` del backend

Copiar las de `src/horno/horno.env.example`, con `HORNO_DB_PASSWORD` del paso 2.

Para `HORNO_JWT_SECRET`, generar el valor en la shell con `openssl rand -hex 32` y pegar el resultado en el
`.env` como `HORNO_JWT_SECRET=<valor>`. No escribir `$(...)` en el archivo: dotenv no lo expande.

`CORS_ORIGIN` (lista separada por comas): si está vacía, Mantix usa sus valores por defecto
(`https://losolivoscucuta.com`, `http://localhost:5173`). Si está sin definir, escribir la lista completa con
los orígenes existentes más `http://192.9.17.11`, no solo el nuevo. Si ya tiene valores, agregar
`http://192.9.17.11` al final.

Deshacer: borrar las `HORNO_*` (el módulo queda en 503, Mantix sigue igual).

## 5. Código

```bash
cd /ruta/mantix-backend && ./scripts/deploy-mantix.sh
```

El script despliega `origin/main`, no `feat/horno`: la rama debe estar mergeada y subida a `main` antes de
ejecutarlo. Hace `git reset --hard origin/main`, `pm2 restart` y revierte solo si `/api-docs/` no responde
(ese es su único chequeo; el `/health` de abajo es el del módulo y no dispara rollback).

Si el script dice `sin cambios` (HEAD ya es `origin/main`), sale sin reiniciar pm2. Si editaste el `.env` en el
paso 4, reiniciar para que carguen las `HORNO_*`:

```bash
pm2 restart mantix-backend --update-env
```

Deshacer: el script imprime el SHA anterior. Para volver a mano: `git reset --hard <SHA anterior>` y
`pm2 restart mantix-backend --update-env`.

Comprobar:

```bash
curl -s http://localhost:3020/api/horno/v1/health      # {"success":true,"data":{"estado":"ok","bd":"ok"}}
curl -s -X POST http://localhost:3020/api/horno/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"usuario":"<usuario>","password":"<clave>"}'      # 200 con token (o 403 si no está en INCOL_APP)
```

Si `/health` da `HORNO_DESHABILITADO`, revisar el log de pm2: dice qué variable falta.

## 6. Frontend `incol-frontend`

```bash
npm ci && npm run build
```

Copiar el contenido de `dist/` (incluido `.htaccess`) a `\\192.9.17.11\AppServ\www\incol\`.
Apache necesita `mod_rewrite` y `AllowOverride All` para `www`. Comprobar abriendo
`http://192.9.17.11/incol/` y recargando en `/incol/registros` (no debe dar 404).
Deshacer: restaurar la carpeta anterior o borrar `incol`.
