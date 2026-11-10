# Agenda de Masajes — Despliegue (runbook para TI)

Backend dentro de Mantix (`/api/masajes/v1`, rama `feature/masajes`). Front en el repositorio `agendaPromax/masajes-web`, servido en `/masajes/`.

Orden: **0 → 12**. Cada paso dice cómo comprobarlo y cómo deshacerlo. Hasta el paso 8, Mantix funciona igual que hoy: sin las variables de Masajes el módulo responde 503 (`MSJ-SIS-000`) y nada más cambia. Los jobs no corren hasta el paso 11.

## 0. Requisito previo: dependencias corregidas

Fusionar primero la rama **`fix/npm-audit`** (commit `31a18f8`) a `main` y desplegarla. Sube `jws` a 3.2.3: la versión actual (3.2.2) tiene un aviso de verificación HMAC que afecta el token de Masajes. Luego rebasar `feature/masajes` sobre `main` y correr `npm ci` y las pruebas.

Comprobar: `npm audit --omit=dev` sin `jws` en la lista.

## 1. Verificar la base (solo lectura)

```bash
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < docs/masajes/verificarProduccion.sql
```

- `version`: **SI** (MySQL ≥ 8.0.16). Con **REVISAR** (8.0.1–8.0.15) el módulo funciona, pero los `CHECK` de la base se ignoran sin avisar y queda solo la validación del código: decidir y anotar. **NO** detiene el despliegue.
- `tablas_msj_existentes` debe ser 0; `sql_mode_estricto` **SI**. Anotar lo que diga **REVISAR**.

## 2. Grupo del AD

Crear el grupo de administradores (sugerido `GG-Masajes-Admin`) y anotar su **DN completo** (`CN=…,OU=…,DC=olivos,DC=local`): se compara exacto, no por nombre. Agregar a Talento Humano y TIC. La pertenencia debe ser directa (`memberOf`).

Deshacer: borrar el grupo.

## 3. Google Workspace

1. Proyecto GCP dedicado; cuenta de servicio sin roles IAM; generar una llave JSON.
2. Consola de administración de Workspace → Seguridad → Acceso a la API → Delegación de todo el dominio: autorizar el client ID de la cuenta de servicio **solo** con el scope `https://www.googleapis.com/auth/calendar.events`.
3. Crear o elegir la cuenta de agenda (p. ej. `agenda.bienestar@losolivos.co`) y su calendario.
4. Copiar la llave a srv-backend **fuera del repo**, con dueño el usuario de pm2 y `chmod 600`. Registrar quién la tiene; rotarla cada 90 días.

Deshacer: revocar la delegación y borrar la llave en GCP.

## 4. Háblame

En el panel de Háblame generar la API key (v5). Confirmar que hay saldo. La URL es `https://www.hablame.co/api/sms/v5/send`.

## 5. Publicar el código

Desplegar Mantix como siempre (`scripts/deploy-mantix.sh`) con la rama fusionada.

Comprobar: `curl -s https://<api>/api/masajes/v1/health` → **503** `MSJ-SIS-000` (esperado: aún sin variables) y el resto de Mantix funciona.

## 6. Migraciones (con `DB_USER`, que tiene DDL)

```bash
npm run masajes:migrate
```

Esperado: `aplicada 001_esquema.sql`, `aplicada 002_historial_beneficiarios.sql`. Una segunda corrida: `Sin migraciones pendientes`.

Si la 002 falla a mitad (son tres `ALTER`): revisar `SHOW CREATE TABLE msj_cita_historial` (ENUM `accion` y `CHECK ck_msj_historial_cita`) y avisar a desarrollo antes de reintentar.

Deshacer (solo si se abandona el módulo): `DROP TABLE msj_notificaciones, msj_cita_historial, msj_citas, msj_bloqueos, msj_semanas, msj_beneficiarios, msj_migraciones;` en ese orden.

## 7. Usuario de BD de mínimo privilegio

Ejecutar `docs/masajes/permisos-bd.sql` (con `<BASE>`, `<HOST_BACKEND>` y una contraseña larga). Comprobar con `SHOW GRANTS`: el historial solo tiene `SELECT, INSERT`.

## 8. Variables en `.env` de srv-backend

Ver `src/masajes/masajes.env.example`. Obligatorias para que el módulo arranque: `MASAJES_JWT_SECRET` (`openssl rand -base64 48`, distinto de los demás secretos), `MSJ_GRUPO_ADMIN_DN` y las `LDAP_*` (ya existen por H360). Recomendadas: `MSJ_DB_USER` y `MSJ_DB_PASSWORD` (paso 7). Integraciones: `MSJ_SPA_*`, `MSJ_GOOGLE_*`, `MSJ_HABLAME_URL` y `MSJ_HABLAME_API_KEY`. Agregar el origen del front a `CORS_ORIGIN`. `MSJ_JOBS_ENABLED=false` por ahora.

`pm2 restart mantix-backend --update-env`.

Comprobar: `/api/masajes/v1/health` → **200**. Si sigue en 503, el motivo exacto está en el log de pm2 (`masajes deshabilitado: …`).

## 9. Cargar el listado

```bash
npm run masajes:importar -- "LISTADO MASAJES 53 BONOS.xlsx" --actor <usuario_ti> --simular
```

Revisar errores y avisos (solo números de fila y motivo). Los avisos de `CELULAR_INVALIDO` o `CORREO_INVALIDO` importan a la persona sin ese dato. Con los errores en 0, correrlo **sin** `--simular`. Después, vincular desde el panel de admin a quienes no se autovinculen (buzones compartidos y correos personales).

## 10. Front

En `masajes-web`: `cp .env.production.example .env.production` (URL https de la API), `npm ci && npm run build` y copiar `dist/` a `www/masajes` de AppServ (incluye `.htaccess`).

Comprobar: `https://<front>/masajes/` muestra el login. En las cabeceras de respuesta aparecen `X-Frame-Options: DENY` y `X-Content-Type-Options: nosniff`, y el HTML trae la meta de CSP.

## 11. Jobs

En **una sola** instancia de pm2: `MSJ_JOBS_ENABLED=true` y `pm2 restart … --update-env`. El log debe mostrar `masajes: jobs programados`. Si faltan integraciones, el outbox avisa una vez (`masajes outbox detenido: …`) y no envía nada.

Deshacer: `MSJ_JOBS_ENABLED=false`. Lo pendiente queda en `msj_notificaciones` y sale al reactivarlos.

## 12. Prueba de aceptación (spec §16), con 2–3 usuarios TIC

Anotar evidencia de cada punto:

1. Agendar en una semana publicada: en menos de 3 minutos llega el evento de Google Calendar y el correo al spa.
2. Dos personas en la misma franja: solo una la obtiene; la otra ve "Esa franja acaba de ser tomada".
3. Una segunda cita en el mismo mes: "Ya tienes una sesión agendada para ese mes".
4. Con menos de 24 h, el empleado no puede reprogramar ni cancelar; el admin sí, y el admin debe escribir motivo.
5. Recordatorio de 2 días por correo y **SMS real a un celular TIC**: confirmar aquí el formato del número que acepta Háblame. Correo "¡Es hoy!". Ninguno se duplica.
6. Un festivo nunca aparece disponible.
7. Un usuario del AD que no está en el listado recibe `NO_BENEFICIARIO`.
8. Un empleado no ve, reprograma ni cancela la cita de otro, aunque cambie el id en la URL.
