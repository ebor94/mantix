-- ─────────────────────────────────────────────────────────────────────────────
-- Migración de causa_fallecimiento + nueva columna categoria_sanitaria (H360)
--
--   causa_fallecimiento ENUM:
--     ('natural','terminal','viral','violenta','estudio')
--     → ('violenta','no_violenta','estudio')
--
--   categoria_sanitaria ENUM (columna nueva, nullable):
--     ('1','2')
--
--   Mapeo de datos existentes:
--     natural  → no_violenta
--     terminal → no_violenta
--     viral    → no_violenta + categoria_sanitaria='2'  (viral implica infecciosa)
--     violenta → violenta   (sin cambio)
--     estudio  → estudio    (sin cambio)
--
-- Requisito: haber desplegado el backend y frontend con los nuevos valores
--            ANTES de correr este script (o inmediatamente después, con la
--            app fuera de servicio durante la migración).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Snapshot ANTES ────────────────────────────────────────────────────────
SELECT causa_fallecimiento, COUNT(*) AS n FROM asistencias GROUP BY causa_fallecimiento;

-- ── 2. Agregar la columna nueva (nullable, sin default) ─────────────────────
ALTER TABLE asistencias ADD COLUMN categoria_sanitaria ENUM('1','2') NULL DEFAULT NULL AFTER causa_fallecimiento;

-- ── 3. Expandir ENUM causa_fallecimiento para admitir 'no_violenta' junto a los viejos
ALTER TABLE asistencias MODIFY COLUMN causa_fallecimiento
  ENUM('natural','terminal','viral','violenta','estudio','no_violenta') NULL DEFAULT NULL;

-- ── 4. Migración de datos ────────────────────────────────────────────────────
START TRANSACTION;

UPDATE asistencias SET causa_fallecimiento = 'no_violenta'
 WHERE causa_fallecimiento IN ('natural','terminal');

UPDATE asistencias SET causa_fallecimiento = 'no_violenta', categoria_sanitaria = '2'
 WHERE causa_fallecimiento = 'viral';

-- ── 5. Verificación ─────────────────────────────────────────────────────────
SELECT 'DESPUES — restos viejos' AS info, causa_fallecimiento, COUNT(*) AS n
FROM asistencias
WHERE causa_fallecimiento IN ('natural','terminal','viral')
GROUP BY causa_fallecimiento;

COMMIT;

-- ── 6. Contraer ENUM causa_fallecimiento a los 3 valores finales ────────────
ALTER TABLE asistencias MODIFY COLUMN causa_fallecimiento
  ENUM('violenta','no_violenta','estudio') NULL DEFAULT NULL;

-- ── SNAPSHOT FINAL ──────────────────────────────────────────────────────────
SELECT causa_fallecimiento, categoria_sanitaria, COUNT(*) AS n
FROM asistencias
GROUP BY causa_fallecimiento, categoria_sanitaria
ORDER BY causa_fallecimiento, categoria_sanitaria;
