#!/usr/bin/env bash
# ============================================================================
# TRIKIPELUDOS — respaldo completo al cierre del evento (RNF-7)
# Uso: bash src/trk/scripts/respaldo.sh [destino]
# Lee DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME y TRK_FOTOS_PATH (o .env).
# MYSQL / MYSQLDUMP permiten usar binarios de un contenedor (pruebas).
# ============================================================================
set -euo pipefail
umask 077   # el respaldo contiene datos personales: solo el propietario

if [ -f .env ]; then set -a; . ./.env; set +a; fi

DESTINO="${1:-$HOME/respaldos/trikipeludos}"
FOTOS="${TRK_FOTOS_PATH:-$(pwd)/uploads/trk/fotos}"
MYSQL_BIN="${MYSQL:-mysql}"
MYSQLDUMP_BIN="${MYSQLDUMP:-mysqldump}"
export MYSQL_PWD="${DB_PASSWORD}"   # evita exponer la clave en la lista de procesos
CONEXION=(-h "${DB_HOST}" -P "${DB_PORT:-3306}" -u "${DB_USER}")

CARPETA="${DESTINO}/trikipeludos-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${CARPETA}"

# shellcheck disable=SC2086
OBJETOS=$(${MYSQL_BIN} "${CONEXION[@]}" -N -B -e \
  "SELECT table_name FROM information_schema.tables WHERE table_schema = '${DB_NAME}' AND table_name LIKE 'trk\\_%' ORDER BY table_type, table_name")
if [ -z "${OBJETOS}" ]; then echo "No hay tablas trk_* en ${DB_NAME}" >&2; exit 1; fi

# shellcheck disable=SC2086
${MYSQLDUMP_BIN} "${CONEXION[@]}" --single-transaction --routines --triggers "${DB_NAME}" ${OBJETOS} > "${CARPETA}/trk_tablas.sql"

# Roles TRK_* y solo los usuarios que pertenecen a esos roles (usuarios operativos).
# shellcheck disable=SC2086
{
  ${MYSQLDUMP_BIN} "${CONEXION[@]}" --single-transaction --no-create-info --where="nombre LIKE 'TRK\\_%'" "${DB_NAME}" roles
  ${MYSQLDUMP_BIN} "${CONEXION[@]}" --single-transaction --no-create-info --where="rol_id IN (SELECT id FROM roles WHERE nombre LIKE 'TRK\\_%')" "${DB_NAME}" usuarios
} > "${CARPETA}/trk_roles_usuarios.sql"

if [ -d "${FOTOS}" ]; then
  tar -czf "${CARPETA}/fotos.tar.gz" -C "$(dirname "${FOTOS}")" "$(basename "${FOTOS}")"
else
  echo "Aviso: no existe la carpeta de fotos ${FOTOS}" >&2
fi

(
  cd "${CARPETA}"
  ARCHIVOS=(trk_tablas.sql trk_roles_usuarios.sql)
  [ -f fotos.tar.gz ] && ARCHIVOS+=(fotos.tar.gz)
  if command -v sha256sum >/dev/null; then sha256sum "${ARCHIVOS[@]}"; else shasum -a 256 "${ARCHIVOS[@]}"; fi > SHA256SUMS
)
echo "${CARPETA}"
