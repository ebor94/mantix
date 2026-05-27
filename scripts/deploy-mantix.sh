#!/usr/bin/env bash
# ============================================================================
# deploy-mantix.sh
# Deploy de mantix-backend: pull desde origin/main, instala dependencias solo si
# package.json cambio, restart de PM2 y health check con rollback automatico.
#
# Uso:
#   bash ~/apps/mantix/mantix-backend/scripts/deploy-mantix.sh
#
# Para reemplazar el alias actual y dejar el comando como antes:
#   alias deploy-mantix='bash ~/apps/mantix/mantix-backend/scripts/deploy-mantix.sh'
# ============================================================================

set -euo pipefail

# ── Configuracion ───────────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-$HOME/apps/mantix/mantix-backend}"
PM2_NAME="${PM2_NAME:-mantix-backend}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3020/api-docs/}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-5}"

# Colores para output (solo si stdout es TTY)
if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_RESET=$'\033[0m'
else
  C_GREEN=""; C_YELLOW=""; C_RED=""; C_RESET=""
fi

log()  { echo "${C_GREEN}[deploy]${C_RESET} $*"; }
warn() { echo "${C_YELLOW}[deploy]${C_RESET} $*"; }
err()  { echo "${C_RED}[deploy]${C_RESET} $*" >&2; }

# ── 1. Cambio a directorio del proyecto ─────────────────────────────────────
cd "$APP_DIR"
log "directorio: $APP_DIR"

# ── 2. Pull desde origin ────────────────────────────────────────────────────
log "git fetch origin"
git fetch origin --quiet

PREV_SHA=$(git rev-parse HEAD)
TARGET_SHA=$(git rev-parse "origin/$BRANCH")

if [ "$PREV_SHA" = "$TARGET_SHA" ]; then
  log "sin cambios remotos (HEAD=$PREV_SHA). Salgo sin reiniciar."
  exit 0
fi

log "actualizando: $PREV_SHA -> $TARGET_SHA"
git reset --hard "origin/$BRANCH"

# ── 3. Instalar dependencias solo si cambio package.json o lock ─────────────
if ! git diff --quiet "$PREV_SHA" "$TARGET_SHA" -- package.json package-lock.json; then
  log "dependencias cambiaron — corriendo npm ci --omit=dev"
  npm ci --omit=dev
else
  log "sin cambios en package.json — salto npm install"
fi

# ── 4. Restart PM2 ──────────────────────────────────────────────────────────
log "pm2 restart $PM2_NAME (con --update-env)"
pm2 restart "$PM2_NAME" --update-env

# ── 5. Health check ─────────────────────────────────────────────────────────
log "esperando ${HEALTH_WAIT_SECONDS}s antes del health check..."
sleep "$HEALTH_WAIT_SECONDS"

HTTP_CODE=$(curl -fsS -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" 2>&1 || echo "FAIL")

if [[ "$HTTP_CODE" =~ ^(200|301|302)$ ]]; then
  log "${C_GREEN}OK${C_RESET} — app respondio HTTP $HTTP_CODE en $HEALTH_URL"
  log "deploy exitoso: $PREV_SHA -> $TARGET_SHA"
  exit 0
fi

# ── 6. Rollback automatico si fallo el health check ─────────────────────────
err "FAIL — app no respondio bien (HTTP=$HTTP_CODE). Haciendo rollback a $PREV_SHA"
git reset --hard "$PREV_SHA"
pm2 restart "$PM2_NAME" --update-env

err "logs del intento fallido:"
pm2 logs "$PM2_NAME" --lines 50 --nostream || true

err "rollback completado. Revisar el commit $TARGET_SHA antes de reintentar."
exit 1
