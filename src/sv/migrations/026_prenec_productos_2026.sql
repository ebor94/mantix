-- =====================================================================
-- SerVentas CRM — Migración 026: catálogo de Prenecesidad 2026
--
-- 78 productos de la "Lista de precios 2026" y 17 filas "por definir" (una por
-- cada tipo con más de un producto, y Exhumación de cenizarios, que no tiene).
-- PRE-OSR, PRE-CNZ, PRE-CLM y PRE-PRR ya existen: pasan a ser la fila de su tipo, así los
-- clientes que las tienen no pierden el interés. Los demás productos de PRENEC se desactivan.
-- Los intereses ya elegidos sobre unos y otros quedan sin precio ofrecido.
-- "Inhumación nivel 1A para lote triple" queda en 0: la lista 2026 no trae su precio.
-- Solo datos. Requiere la 025. Idempotente, pero correrla de nuevo devuelve los precios a
-- los de 2026: es de una sola vez.
-- =====================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT INTO sv_cfg_productos
  (prod_area_id, prod_codigo, prod_nombre, prod_descripcion, prod_categoria, prod_tipo,
   prod_es_generico, prod_precio_base, prod_activo, prod_orden_display)
SELECT a.area_id, p.codigo, p.nombre, p.descripcion, p.categoria, p.tipo, p.generico, p.precio, 1, p.orden
  FROM sv_cfg_areas_negocio a
  JOIN (
    SELECT 'PRE-UT' AS codigo, 'Usos temporales' AS nombre, CAST(NULL AS CHAR) AS descripcion, 'Usos temporales' AS categoria, 'Usos temporales' AS tipo, 1 AS generico, CAST(NULL AS DECIMAL(12,2)) AS precio, 1100 AS orden
    UNION ALL SELECT 'PRE-UT-01', 'Uso temporal de lote, sector Olivos, 5 años', 'Incluye inhumación y exhumación. Sectores A1, A2, A3, A4, A5, A6, A7, SB1, H4, H5, H6, LF1, C6, C1, C3, C5, E1, E2, E3, E4, H1, H2 y H3.', 'Usos temporales', 'Usos temporales', 0, 9190000, 1101
    UNION ALL SELECT 'PRE-UT-02', 'Uso temporal de lote, sector Olivos, 10 años', 'Incluye inhumación y exhumación. Sectores A1, A2, A3, A4, A5, A6, A7, SB1, H4, H5, H6, LF1, C6, C1, C3, C5, E1, E2, E3, E4, H1, H2 y H3.', 'Usos temporales', 'Usos temporales', 0, 13850000, 1102
    UNION ALL SELECT 'PRE-UT-03', 'Uso temporal de lote, sector San José, 5 años', 'Incluye inhumación y exhumación. Sectores C2, C4, F1, F2, F3, F4, F5, SC1, SC2, D1, D2, D3, D4, G1, G2, G3 y G4.', 'Usos temporales', 'Usos temporales', 0, 8650000, 1103
    UNION ALL SELECT 'PRE-UT-04', 'Uso temporal de lote, sector San José, 10 años', 'Incluye inhumación y exhumación. Sectores C2, C4, F1, F2, F3, F4, F5, SC1, SC2, D1, D2, D3, D4, G1, G2, G3 y G4.', 'Usos temporales', 'Usos temporales', 0, 13050000, 1104
    UNION ALL SELECT 'PRE-UT-05', 'Uso temporal de lote, sector Cristo Rey, 5 años', 'Incluye inhumación y exhumación. Sectores J1, J2, J3, I1, I2, I3, I4 y D5.', 'Usos temporales', 'Usos temporales', 0, 7890000, 1105
    UNION ALL SELECT 'PRE-UT-06', 'Uso temporal de lote, sector Cristo Rey, 10 años', 'Incluye inhumación y exhumación. Sectores J1, J2, J3, I1, I2, I3, I4 y D5.', 'Usos temporales', 'Usos temporales', 0, 11850000, 1106
    UNION ALL SELECT 'PRE-PRR', 'Prórrogas', NULL, 'Usos temporales', 'Prórrogas', 1, NULL, 1200
    UNION ALL SELECT 'PRE-PRR-01', 'Prórroga, sector Olivos, 1 año', 'No incluye el valor de la exhumación. Sectores A1, A2, A3, A4, A5, A6, A7, SB1, H4, H5, H6, LF1, C6, C1, C3, C5, E1, E2, E3, E4, H1, H2 y H3.', 'Usos temporales', 'Prórrogas', 0, 2365000, 1201
    UNION ALL SELECT 'PRE-PRR-02', 'Prórroga, sector Olivos, 4 años', 'No incluye el valor de la exhumación. Sectores A1, A2, A3, A4, A5, A6, A7, SB1, H4, H5, H6, LF1, C6, C1, C3, C5, E1, E2, E3, E4, H1, H2 y H3.', 'Usos temporales', 'Prórrogas', 0, 7865000, 1202
    UNION ALL SELECT 'PRE-PRR-03', 'Prórroga, sector Olivos, 10 años', 'No incluye el valor de la exhumación. Sectores A1, A2, A3, A4, A5, A6, A7, SB1, H4, H5, H6, LF1, C6, C1, C3, C5, E1, E2, E3, E4, H1, H2 y H3.', 'Usos temporales', 'Prórrogas', 0, 13310000, 1203
    UNION ALL SELECT 'PRE-PRR-04', 'Prórroga, sector San José, 1 año', 'No incluye el valor de la exhumación. Sectores C2, C4, F1, F2, F3, F4, F5, SC1, SC2, D1, D2, D3, D4, G1, G2, G3 y G4.', 'Usos temporales', 'Prórrogas', 0, 2255000, 1204
    UNION ALL SELECT 'PRE-PRR-05', 'Prórroga, sector San José, 4 años', 'No incluye el valor de la exhumación. Sectores C2, C4, F1, F2, F3, F4, F5, SC1, SC2, D1, D2, D3, D4, G1, G2, G3 y G4.', 'Usos temporales', 'Prórrogas', 0, 6655000, 1205
    UNION ALL SELECT 'PRE-PRR-06', 'Prórroga, sector San José, 10 años', 'No incluye el valor de la exhumación. Sectores C2, C4, F1, F2, F3, F4, F5, SC1, SC2, D1, D2, D3, D4, G1, G2, G3 y G4.', 'Usos temporales', 'Prórrogas', 0, 12100000, 1206
    UNION ALL SELECT 'PRE-PRR-07', 'Prórroga, sector Cristo Rey, 1 año', 'No incluye el valor de la exhumación. Sectores J1, J2, J3, I1, I2, I3, I4 y D5.', 'Usos temporales', 'Prórrogas', 0, 2145000, 1207
    UNION ALL SELECT 'PRE-PRR-08', 'Prórroga, sector Cristo Rey, 4 años', 'No incluye el valor de la exhumación. Sectores J1, J2, J3, I1, I2, I3, I4 y D5.', 'Usos temporales', 'Prórrogas', 0, 5445000, 1208
    UNION ALL SELECT 'PRE-PRR-09', 'Prórroga, sector Cristo Rey, 10 años', 'No incluye el valor de la exhumación. Sectores J1, J2, J3, I1, I2, I3, I4 y D5.', 'Usos temporales', 'Prórrogas', 0, 10890000, 1209
    UNION ALL SELECT 'PRE-PRR-10', 'Prórroga cuerpo momificado, sector Olivos, 1 año', 'No incluye el valor de la exhumación. Se vende con autorización previa del jefe inmediato. Mínimo 1 año y máximo 2. Sectores A1, A2, A3, A4, A5, A6, A7, SB1, H4, H5, H6, LF1, C6, C1, C3, C5, E1, E2, E3, E4, H1, H2 y H3.', 'Usos temporales', 'Prórrogas', 0, 1950000, 1210
    UNION ALL SELECT 'PRE-PRR-11', 'Prórroga cuerpo momificado, sector San José, 1 año', 'No incluye el valor de la exhumación. Se vende con autorización previa del jefe inmediato. Mínimo 1 año y máximo 2. Sectores C2, C4, F1, F2, F3, F4, F5, SC1, SC2, D1, D2, D3, D4, G1, G2, G3 y G4.', 'Usos temporales', 'Prórrogas', 0, 1850000, 1211
    UNION ALL SELECT 'PRE-PRR-12', 'Prórroga cuerpo momificado, sector Cristo Rey, 1 año', 'No incluye el valor de la exhumación. Se vende con autorización previa del jefe inmediato. Mínimo 1 año y máximo 2. Sectores J1, J2, J3, I1, I2, I3, I4 y D5.', 'Usos temporales', 'Prórrogas', 0, 1250000, 1212
    UNION ALL SELECT 'PRE-PRR-13', 'Prórroga bóveda Cementerio Central, 1 año', 'Uso temporal en bóvedas del Cementerio Central.', 'Usos temporales', 'Prórrogas', 0, 1200000, 1213
    UNION ALL SELECT 'PRE-LOT', 'Lotes', NULL, 'Mausoleos', 'Lotes', 1, NULL, 2100
    UNION ALL SELECT 'PRE-LOT-01', 'Lote sencillo (otros parques privados)', 'No incluye el valor del traspaso.', 'Mausoleos', 'Lotes', 0, 13950000, 2101
    UNION ALL SELECT 'PRE-LOT-02', 'Lote doble (otros parques privados)', 'No incluye el valor del traspaso.', 'Mausoleos', 'Lotes', 0, 18950000, 2102
    UNION ALL SELECT 'PRE-OSR', 'Osarios', NULL, 'Mausoleos', 'Osarios', 1, NULL, 2200
    UNION ALL SELECT 'PRE-OSR-01', 'Osario mural sector A2 (Memorial), sencillo', NULL, 'Mausoleos', 'Osarios', 0, 10150000, 2201
    UNION ALL SELECT 'PRE-OSR-02', 'Osario mural mármol sector A2, sencillo', NULL, 'Mausoleos', 'Osarios', 0, 8770000, 2202
    UNION ALL SELECT 'PRE-OSR-03', 'Osario mural mármol sector F1 (Monumento San Martín), sencillo', NULL, 'Mausoleos', 'Osarios', 0, 6380000, 2203
    UNION ALL SELECT 'PRE-OSR-04', 'Osario cerámica (Monumento SC y EV), sencillo', NULL, 'Mausoleos', 'Osarios', 0, 5780000, 2204
    UNION ALL SELECT 'PRE-OSR-05', 'Osario mural en cerámica, sencillo', NULL, 'Mausoleos', 'Osarios', 0, 8140000, 2205
    UNION ALL SELECT 'PRE-OSR-06', 'Osario mural Cementerio Central', NULL, 'Mausoleos', 'Osarios', 0, 1950000, 2206
    UNION ALL SELECT 'PRE-OSR-07', 'Boveditas Cementerio Central', NULL, 'Mausoleos', 'Osarios', 0, 1980000, 2207
    UNION ALL SELECT 'PRE-CNV', 'Conversiones', NULL, 'Mausoleos', 'Conversiones', 1, NULL, 2300
    UNION ALL SELECT 'PRE-CNV-01', 'Conversión de lote sencillo a doble', 'No aplica en el sector G5.', 'Mausoleos', 'Conversiones', 0, 7650000, 2301
    UNION ALL SELECT 'PRE-CNV-02', 'Conversión de lote doble a triple', 'No aplica en los sectores D2, D3, D4, F5, G2, G5, H1, H5, I2, J1, J2 y SC.', 'Mausoleos', 'Conversiones', 0, 9750000, 2302
    UNION ALL SELECT 'PRE-CNV-03', 'Conversión de lote sencillo a triple', 'No aplica en los sectores D2, D3, D4, F5, G2, G5, H1, H5, I2, J1, J2 y SC.', 'Mausoleos', 'Conversiones', 0, 12500000, 2303
    UNION ALL SELECT 'PRE-CNV-04', 'Conversión de osario en tierra, de sencillo a doble', NULL, 'Mausoleos', 'Conversiones', 0, 1760000, 2304
    UNION ALL SELECT 'PRE-CNV-05', 'Conversión de cenizario en cerámica, de sencillo a doble', NULL, 'Mausoleos', 'Conversiones', 0, 1760000, 2305
    UNION ALL SELECT 'PRE-CLM', 'Columbarios', NULL, 'Mausoleos', 'Columbarios', 1, NULL, 2400
    UNION ALL SELECT 'PRE-CLM-01', 'Columbario', NULL, 'Mausoleos', 'Columbarios', 0, 4785000, 2401
    UNION ALL SELECT 'PRE-CLM-02', '1 columbario + inhumación', NULL, 'Mausoleos', 'Columbarios', 0, 5315000, 2402
    UNION ALL SELECT 'PRE-CLM-03', '4 columbarios + inhumación', NULL, 'Mausoleos', 'Columbarios', 0, 19850000, 2403
    UNION ALL SELECT 'PRE-CLM-04', '6 columbarios + inhumación', NULL, 'Mausoleos', 'Columbarios', 0, 29405000, 2404
    UNION ALL SELECT 'PRE-CLM-05', '8 columbarios + inhumación', NULL, 'Mausoleos', 'Columbarios', 0, 38710000, 2405
    UNION ALL SELECT 'PRE-CNZ', 'Cenizarios', NULL, 'Mausoleos', 'Cenizarios', 1, NULL, 2500
    UNION ALL SELECT 'PRE-CNZ-01', 'Cenizario mural sector A2 Memorial, sencillo', NULL, 'Mausoleos', 'Cenizarios', 0, 7480000, 2501
    UNION ALL SELECT 'PRE-CNZ-02', 'Cenizario mármol sector O (Monumento Niña María), doble', NULL, 'Mausoleos', 'Cenizarios', 0, 6550000, 2502
    UNION ALL SELECT 'PRE-CNZ-03', 'Cenizario mármol sector F1 (Monumento San Martín), doble', NULL, 'Mausoleos', 'Cenizarios', 0, 5230000, 2503
    UNION ALL SELECT 'PRE-CNZ-04', 'Cenizario mural cerámica, doble', NULL, 'Mausoleos', 'Cenizarios', 0, 6540000, 2504
    UNION ALL SELECT 'PRE-CNZ-05', 'Cenizario mural cerámica, sencillo', NULL, 'Mausoleos', 'Cenizarios', 0, 5330000, 2505
    UNION ALL SELECT 'PRE-CRT', 'Cremación tradicional', NULL, 'Cremaciones', 'Tradicional', 1, NULL, 3100
    UNION ALL SELECT 'PRE-CRT-01', 'Cremación tradicional, cofre clásico', NULL, 'Cremaciones', 'Tradicional', 0, 2180000, 3101
    UNION ALL SELECT 'PRE-CRT-02', 'Cremación niños hasta 12 meses tradicional, cofre clásico', NULL, 'Cremaciones', 'Tradicional', 0, 1020000, 3102
    UNION ALL SELECT 'PRE-CRP', 'Cremación plus', NULL, 'Cremaciones', 'Plus', 1, NULL, 3200
    UNION ALL SELECT 'PRE-CRP-01', 'Cremación tradicional plus, cofre presidencial', NULL, 'Cremaciones', 'Plus', 0, 2475000, 3201
    UNION ALL SELECT 'PRE-CRP-02', 'Cremación niños hasta 12 meses tradicional plus, cofre presidencial', NULL, 'Cremaciones', 'Plus', 0, 1380000, 3202
    UNION ALL SELECT 'PRE-CRR', 'Cremación de restos', NULL, 'Cremaciones', 'Restos', 1, NULL, 3300
    UNION ALL SELECT 'PRE-CRR-01', 'Cremación de restos tradicional, cofre clásico', NULL, 'Cremaciones', 'Restos', 0, 1200000, 3301
    UNION ALL SELECT 'PRE-CRR-02', 'Cremación de restos tradicional plus, cofre presidencial', NULL, 'Cremaciones', 'Restos', 0, 1695000, 3302
    UNION ALL SELECT 'PRE-CMM-01', 'Cremación de cuerpo momificado, cofre clásico', 'Se vende con autorización previa del jefe inmediato.', 'Cremaciones', 'Cuerpo momificado', 0, 715000, 3401
    UNION ALL SELECT 'PRE-SJE-01', 'Servicio exequial Jericó', 'En sala de velación.', 'Servicios exequiales', 'Jericó', 0, 10950000, 4101
    UNION ALL SELECT 'PRE-SSG', 'Servicio San Gabriel', NULL, 'Servicios exequiales', 'San Gabriel', 1, NULL, 4200
    UNION ALL SELECT 'PRE-SSG-01', 'Servicio exequial San Gabriel Gold (para cremación)', 'En sala de velación.', 'Servicios exequiales', 'San Gabriel', 0, 9160000, 4201
    UNION ALL SELECT 'PRE-SSG-02', 'Servicio exequial San Gabriel (para cremación)', 'En sala de velación.', 'Servicios exequiales', 'San Gabriel', 0, 6650000, 4202
    UNION ALL SELECT 'PRE-SED-01', 'Servicio exequial Edén', 'En sala de velación.', 'Servicios exequiales', 'Edén', 0, 8900000, 4301
    UNION ALL SELECT 'PRE-SOL-01', 'Servicio exequial Olivos', 'En sala de velación.', 'Servicios exequiales', 'Olivos', 0, 7150000, 4401
    UNION ALL SELECT 'PRE-SSJ-01', 'Servicio exequial San José (San Martín, San José y Santísima Trinidad)', 'En sala de velación.', 'Servicios exequiales', 'San José', 0, 6765000, 4501
    UNION ALL SELECT 'PRE-SSI-01', 'Servicio exequial Sinaí Olivos', 'En residencia.', 'Servicios exequiales', 'Sinaí', 0, 5950000, 4601
    UNION ALL SELECT 'PRE-SCR-01', 'Servicio exequial + cremación', 'En sala de velación.', 'Servicios exequiales', 'Servicio + cremación', 0, 7950000, 4701
    UNION ALL SELECT 'PRE-INL', 'Inhumación de lotes', NULL, 'Inhumaciones', 'Lotes', 1, NULL, 5100
    UNION ALL SELECT 'PRE-INL-01', 'Inhumación 1 parte, lote', NULL, 'Inhumaciones', 'Lotes', 0, 4650000, 5101
    UNION ALL SELECT 'PRE-INL-02', 'Inhumación 2 parte, lote', NULL, 'Inhumaciones', 'Lotes', 0, 3950000, 5102
    UNION ALL SELECT 'PRE-INL-03', 'Inhumación nivel 1A para lote triple', 'Sin precio en la lista 2026.', 'Inhumaciones', 'Lotes', 0, 0, 5103
    UNION ALL SELECT 'PRE-INO', 'Inhumación de osarios', NULL, 'Inhumaciones', 'Osarios', 1, NULL, 5200
    UNION ALL SELECT 'PRE-INO-01', 'Inhumación osario tierra, 1 parte', NULL, 'Inhumaciones', 'Osarios', 0, 1550000, 5201
    UNION ALL SELECT 'PRE-INO-02', 'Inhumación osario tierra, 2 parte', NULL, 'Inhumaciones', 'Osarios', 0, 1200000, 5202
    UNION ALL SELECT 'PRE-INO-03', 'Inhumación osario mural cerámica, sencilla', NULL, 'Inhumaciones', 'Osarios', 0, 876000, 5203
    UNION ALL SELECT 'PRE-INO-04', 'Inhumación simultánea osario mural cerámica, doble', NULL, 'Inhumaciones', 'Osarios', 0, 980000, 5204
    UNION ALL SELECT 'PRE-INO-05', 'Inhumación osario mármol', NULL, 'Inhumaciones', 'Osarios', 0, 876000, 5205
    UNION ALL SELECT 'PRE-INO-06', 'Inhumación simultánea osario mármol, doble', NULL, 'Inhumaciones', 'Osarios', 0, 980000, 5206
    UNION ALL SELECT 'PRE-INC', 'Inhumación de cenizarios', NULL, 'Inhumaciones', 'Cenizarios', 1, NULL, 5300
    UNION ALL SELECT 'PRE-INC-01', 'Inhumación cenizario cerámica', NULL, 'Inhumaciones', 'Cenizarios', 0, 876000, 5301
    UNION ALL SELECT 'PRE-INC-02', 'Inhumación cenizario mármol', NULL, 'Inhumaciones', 'Cenizarios', 0, 876000, 5302
    UNION ALL SELECT 'PRE-INC-03', 'Inhumación simultánea cenizario mármol, doble', NULL, 'Inhumaciones', 'Cenizarios', 0, 980000, 5303
    UNION ALL SELECT 'PRE-INB-01', 'Inhumación columbario', NULL, 'Inhumaciones', 'Columbarios', 0, 876000, 5401
    UNION ALL SELECT 'PRE-EXL', 'Exhumación de lotes', NULL, 'Exhumaciones', 'Lotes', 1, NULL, 6100
    UNION ALL SELECT 'PRE-EXL-01', 'Exhumación 1 parte completa tradicional', NULL, 'Exhumaciones', 'Lotes', 0, 3950000, 6101
    UNION ALL SELECT 'PRE-EXL-02', 'Exhumación 2 parte completa tradicional', NULL, 'Exhumaciones', 'Lotes', 0, 3270000, 6102
    UNION ALL SELECT 'PRE-EXL-03', 'Exhumación fosa', NULL, 'Exhumaciones', 'Lotes', 0, 230000, 6103
    UNION ALL SELECT 'PRE-EXO', 'Exhumación de osarios', NULL, 'Exhumaciones', 'Osarios', 1, NULL, 6200
    UNION ALL SELECT 'PRE-EXO-01', 'Exhumación osario mural / cenizario completa tradicional', NULL, 'Exhumaciones', 'Osarios', 0, 650000, 6201
    UNION ALL SELECT 'PRE-EXO-02', 'Exhumación osario tierra, 1 parte completa tradicional', NULL, 'Exhumaciones', 'Osarios', 0, 870000, 6202
    UNION ALL SELECT 'PRE-EXO-03', 'Exhumación osario tierra, 2 parte completa tradicional', NULL, 'Exhumaciones', 'Osarios', 0, 750000, 6203
    UNION ALL SELECT 'PRE-EXC', 'Exhumación de cenizarios', NULL, 'Exhumaciones', 'Cenizarios', 1, NULL, 6300
    UNION ALL SELECT 'PRE-EXB-01', 'Exhumación columbario', NULL, 'Exhumaciones', 'Columbarios', 0, 350000, 6401
  ) p
 WHERE a.area_codigo = 'PRENEC'
ON DUPLICATE KEY UPDATE
  prod_nombre        = p.nombre,
  prod_descripcion   = p.descripcion,
  prod_categoria     = p.categoria,
  prod_tipo          = p.tipo,
  prod_es_generico   = p.generico,
  prod_precio_base   = p.precio,
  prod_activo        = 1,
  prod_orden_display = p.orden;

UPDATE sv_cfg_productos pr
  JOIN sv_cfg_areas_negocio a ON a.area_id = pr.prod_area_id
   SET pr.prod_activo = 0
 WHERE a.area_codigo = 'PRENEC'
   AND pr.prod_codigo NOT IN (
     'PRE-UT', 'PRE-UT-01', 'PRE-UT-02', 'PRE-UT-03', 'PRE-UT-04', 'PRE-UT-05', 'PRE-UT-06', 'PRE-PRR',
     'PRE-PRR-01', 'PRE-PRR-02', 'PRE-PRR-03', 'PRE-PRR-04', 'PRE-PRR-05', 'PRE-PRR-06', 'PRE-PRR-07',
     'PRE-PRR-08', 'PRE-PRR-09', 'PRE-PRR-10', 'PRE-PRR-11', 'PRE-PRR-12', 'PRE-PRR-13', 'PRE-LOT',
     'PRE-LOT-01', 'PRE-LOT-02', 'PRE-OSR', 'PRE-OSR-01', 'PRE-OSR-02', 'PRE-OSR-03', 'PRE-OSR-04',
     'PRE-OSR-05', 'PRE-OSR-06', 'PRE-OSR-07', 'PRE-CNV', 'PRE-CNV-01', 'PRE-CNV-02', 'PRE-CNV-03',
     'PRE-CNV-04', 'PRE-CNV-05', 'PRE-CLM', 'PRE-CLM-01', 'PRE-CLM-02', 'PRE-CLM-03', 'PRE-CLM-04',
     'PRE-CLM-05', 'PRE-CNZ', 'PRE-CNZ-01', 'PRE-CNZ-02', 'PRE-CNZ-03', 'PRE-CNZ-04', 'PRE-CNZ-05',
     'PRE-CRT', 'PRE-CRT-01', 'PRE-CRT-02', 'PRE-CRP', 'PRE-CRP-01', 'PRE-CRP-02', 'PRE-CRR',
     'PRE-CRR-01', 'PRE-CRR-02', 'PRE-CMM-01', 'PRE-SJE-01', 'PRE-SSG', 'PRE-SSG-01', 'PRE-SSG-02',
     'PRE-SED-01', 'PRE-SOL-01', 'PRE-SSJ-01', 'PRE-SSI-01', 'PRE-SCR-01', 'PRE-INL', 'PRE-INL-01',
     'PRE-INL-02', 'PRE-INL-03', 'PRE-INO', 'PRE-INO-01', 'PRE-INO-02', 'PRE-INO-03', 'PRE-INO-04',
     'PRE-INO-05', 'PRE-INO-06', 'PRE-INC', 'PRE-INC-01', 'PRE-INC-02', 'PRE-INC-03', 'PRE-INB-01',
     'PRE-EXL', 'PRE-EXL-01', 'PRE-EXL-02', 'PRE-EXL-03', 'PRE-EXO', 'PRE-EXO-01', 'PRE-EXO-02',
     'PRE-EXO-03', 'PRE-EXC', 'PRE-EXB-01'
   );

-- Lo elegido antes sobre un producto que ahora es "por definir", o que se retira, guardó el
-- precio de la lista vieja: no es un precio ofrecido vigente.
UPDATE sv_crm_prospectos_productos pp
  JOIN sv_cfg_productos pr     ON pr.prod_id = pp.pp_prod_id
  JOIN sv_cfg_areas_negocio a  ON a.area_id = pr.prod_area_id
   SET pp.pp_precio_ofrecido = NULL
 WHERE a.area_codigo = 'PRENEC'
   AND (pr.prod_es_generico = 1 OR pr.prod_tipo IS NULL OR pr.prod_tipo = '');

COMMIT;
