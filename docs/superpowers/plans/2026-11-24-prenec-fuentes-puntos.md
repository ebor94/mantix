# Fuentes y puntos de Prenecesidad — pasos en producción

> **Para quien ejecute:** la migración `src/sv/migrations/024_prenec_fuentes_puntos.sql` ya está escrita y probada. Estos pasos los hace el usuario en el servidor, dentro de `mantix-backend`.

**Goal:** dejar las ocho fuentes de Prenecesidad y los cuatro puntos de atención. **Spec:** `docs/superpowers/specs/2026-11-24-prenec-fuentes-puntos-design.md`

- [ ] **Paso 1: Respaldo**

```bash
mysqldump -u root -p --no-create-info --replace --complete-insert serfuweb sv_cfg_fuentes_prospecto sv_cfg_puntos_atencion > ~/respaldo-catalogos-20261124.sql
```

- [ ] **Paso 2: Ver qué se va a desactivar.** Debe listar solo lo esperado; si aparece un punto que otra área usa, detenerse.

```sql
SELECT 'fuente' AS que, f.fuente_codigo AS codigo, f.fuente_nombre AS nombre,
       (SELECT COUNT(*) FROM sv_crm_prospectos p WHERE p.prosp_fuente_id = f.fuente_id) AS prospectos
  FROM sv_cfg_fuentes_prospecto f
  JOIN sv_cfg_areas_negocio a ON a.area_id = f.fuente_area_id
 WHERE a.area_codigo = 'PRENEC' AND f.fuente_activa = 1
   AND f.fuente_codigo NOT IN ('LISTA_TELE','REFERIDO','R-95','ENCUESTA','TITULO','BASE_EXHUMACIONES','R-116','OTROS')
UNION ALL
SELECT 'punto', pt.punto_codigo, pt.punto_nombre,
       (SELECT COUNT(*) FROM sv_crm_prospectos p WHERE p.prosp_punto_id = pt.punto_id)
  FROM sv_cfg_puntos_atencion pt
 WHERE pt.punto_activo = 1 AND pt.punto_codigo NOT IN ('SJ','GC','PARQUE','KIOSCO');
```

- [ ] **Paso 3: Migración**

```bash
git fetch origin && git show origin/main:src/sv/migrations/024_prenec_fuentes_puntos.sql | mysql -u root -p --default-character-set=utf8mb4 serfuweb
```

- [ ] **Paso 4: Verificar.** Deben salir ocho fuentes y cuatro puntos, con sus tildes.

```sql
SELECT f.fuente_orden, f.fuente_nombre, f.fuente_es_masiva
  FROM sv_cfg_fuentes_prospecto f JOIN sv_cfg_areas_negocio a ON a.area_id = f.fuente_area_id
 WHERE a.area_codigo = 'PRENEC' AND f.fuente_activa = 1 ORDER BY f.fuente_orden;
SELECT punto_codigo, punto_nombre FROM sv_cfg_puntos_atencion WHERE punto_activo = 1 ORDER BY punto_codigo;
```

- [ ] **Paso 5: Smoke.** Recargar GenFlow (Cmd/Ctrl+Shift+R) y, en Prenecesidad → Nuevo cliente, revisar los dos selectores. "Cargar lista masiva" debe ofrecer Telemercadeo, Títulos y Base de exhumaciones. Atender un homenaje en Salas debe seguir creando el cliente con fuente "Sala de velación".

- [ ] **Reversión**

```bash
mysql -u root -p --default-character-set=utf8mb4 serfuweb < ~/respaldo-catalogos-20261124.sql
```

El respaldo devuelve las filas que existían. Las nuevas quedan; se desactivan desde Administración o con `UPDATE … SET fuente_activa = 0`.
