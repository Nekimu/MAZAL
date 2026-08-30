#!/usr/bin/env bash
# ==============================================================================
# MAZAL POS & ERP - RESPALDO AUTOMATIZADO MYSQL (LINUX / CRON)
# ==============================================================================

set -e

DB_NAME="mazal_bd"
DB_USER="${DB_USER:-mazal_app}"
DB_PASS="${DB_PASS:-MazalLocal_2026!Sec}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/../backups"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/mazal_bd_${TIMESTAMP}.sql"

echo "==================================================="
echo "[MAZAL] Generando respaldo local de base de datos..."
echo "Archivo: ${BACKUP_FILE}"

if [ -z "${DB_PASS}" ]; then
    mysqldump -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" --single-transaction --quick --routines --triggers "${DB_NAME}" > "${BACKUP_FILE}"
else
    mysqldump -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASS}" --single-transaction --quick --routines --triggers "${DB_NAME}" > "${BACKUP_FILE}"
fi

echo "✅ [EXITO] Respaldo generado correctamente."

# Rotación de respaldos: conservar últimos 14 días
find "${BACKUP_DIR}" -name "mazal_bd_*.sql" -type f -mtime +14 -exec rm -f {} \;
echo "🧹 [ROTACION] Limpieza de respaldos antiguos (>14 días) completada."
echo "==================================================="
