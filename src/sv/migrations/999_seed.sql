-- =====================================================================
-- SerVentas CRM — SEED (datos iniciales)
-- Ejecutar DESPUES de 001_cfg.sql y 002_org.sql.
-- Las contraseñas se rellenan por src/sv/scripts/setup.js
-- (bcrypt rounds=10 con clave 'serventas2026').
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. ÁREAS DE NEGOCIO
-- ============================================================
INSERT IGNORE INTO sv_cfg_areas_negocio (area_codigo, area_nombre, area_descripcion, area_color_hex, area_icono, area_tipo_cliente) VALUES
('PRENEC',   'Prenecesidad',            'Venta individual de servicios funerarios por telemercadeo', '#C8902A', '🕊️', 'individual'),
('PREV-EMP', 'Previsión Empresariales', 'Convenios y planes colectivos con empresas (B2B)',          '#1A5C8A', '🏢',  'empresa'),
('PREV-PAP', 'Previsión PAP',           'Venta masiva puerta a puerta de planes exequiales',         '#2A6E47', '🚶', 'individual'),
('SVC',      'Servicio al Cliente',     'Gestión de casos, PQRS y seguimiento postventa',            '#5A3E9E', '🎧', 'contrato');

-- ============================================================
-- 2. PUNTOS DE ATENCIÓN
-- ============================================================
INSERT IGNORE INTO sv_cfg_puntos_atencion (punto_codigo, punto_nombre, punto_direccion) VALUES
('GC',  'Gran Colombia',  'Av. Gran Colombia #5-35, Cúcuta'),
('LO',  'Los Olivos',     'Cll 2N #7E-22, Cúcuta'),
('SJ',  'San José',       'Cra 5 #12-10, Cúcuta'),
('TRC', 'Torcoroma',      'Cll 18 #9-45, Cúcuta');

-- ============================================================
-- 3. GRUPOS DE TRABAJO
-- ============================================================
INSERT IGNORE INTO sv_cfg_grupos_trabajo (grupo_area_id, grupo_codigo, grupo_nombre, grupo_tipo_venta, grupo_meta_default) VALUES
(1, 'TELEMERCADEO',  'Telemercadeo',      'individual', 10),
(2, 'EMPRESARIALES', 'Empresariales B2B', 'b2b',         5),
(3, 'PAP',           'PAP — Campo',       'masivo',     20),
(4, 'SVC-AGENTES',   'Agentes SVC',       'postventa',   0);

-- ============================================================
-- 4. PRODUCTOS POR ÁREA
-- ============================================================
-- Prenecesidad (area_id=1)
INSERT IGNORE INTO sv_cfg_productos (prod_area_id, prod_codigo, prod_nombre, prod_categoria, prod_precio_base, prod_orden_display) VALUES
(1, 'PRE-OSR', 'Osario',     'Inhumación',  3500000, 1),
(1, 'PRE-EXH', 'Exhumación', 'Inhumación',  2800000, 2),
(1, 'PRE-CRM', 'Cremación',  'Cremación',   4200000, 3),
(1, 'PRE-CNZ', 'Cenizario',  'Cremación',   1800000, 4),
(1, 'PRE-CLM', 'Columbario', 'Inhumación',  5500000, 5),
(1, 'PRE-VLC', 'Velación',   'Servicio',    1200000, 6),
(1, 'PRE-PRR', 'Prórroga',   'Servicio',     800000, 7),
(1, 'PRE-INH', 'Inhumación', 'Inhumación',  2200000, 8);

-- Previsión Empresariales (area_id=2)
INSERT IGNORE INTO sv_cfg_productos (prod_area_id, prod_codigo, prod_nombre, prod_categoria, prod_precio_base, prod_requiere_empresa, prod_orden_display) VALUES
(2, 'EMP-PEC', 'Plan Exequial Colectivo',   'Colectivo', 35000, 1, 1),
(2, 'EMP-PGR', 'Plan Grupal Premium',       'Colectivo', 55000, 1, 2),
(2, 'EMP-SVG', 'Seguro de Vida Grupal',     'Seguro',    28000, 1, 3),
(2, 'EMP-COF', 'Cobertura Familiar',        'Colectivo', 45000, 1, 4),
(2, 'EMP-CNV', 'Convenio Corporativo Full', 'Convenio',  75000, 1, 5);

-- Previsión PAP (area_id=3)
INSERT IGNORE INTO sv_cfg_productos (prod_area_id, prod_codigo, prod_nombre, prod_categoria, prod_precio_base, prod_orden_display) VALUES
(3, 'PAP-BAS', 'Plan Básico Familiar',  'Individual', 18000, 1),
(3, 'PAP-PRE', 'Plan Premium',          'Individual', 32000, 2),
(3, 'PAP-DUO', 'Plan Dúo',              'Individual', 28000, 3),
(3, 'PAP-IND', 'Afiliación Individual', 'Individual', 15000, 4);

-- ============================================================
-- 5. ESTADOS DE GESTIÓN (PIPELINE) POR GRUPO
-- ============================================================
-- Telemercadeo (grupo_id=1)
INSERT IGNORE INTO sv_cfg_estados_gestion (estado_grupo_id, estado_codigo, estado_nombre, estado_color_hex, estado_es_final, estado_es_ganado, estado_requiere_fecha, estado_orden) VALUES
(1, 'NUEVO',      'Nuevo',                '#8A6A52', 0, 0, 0, 1),
(1, 'CONTACTADO', 'Contactado',           '#C97B1A', 0, 0, 1, 2),
(1, 'INTERESADO', 'Interesado',           '#1A5C8A', 0, 0, 1, 3),
(1, 'EN_PROCESO', 'En proceso de cierre', '#5A3E9E', 0, 0, 1, 4),
(1, 'CERRADO',    'Contrato cerrado',     '#2A6E47', 1, 1, 0, 5),
(1, 'DESCARTADO', 'Descartado',           '#B83227', 1, 0, 0, 6);

-- Empresariales (grupo_id=2)
INSERT IGNORE INTO sv_cfg_estados_gestion (estado_grupo_id, estado_codigo, estado_nombre, estado_color_hex, estado_es_final, estado_es_ganado, estado_requiere_fecha, estado_orden) VALUES
(2, 'PROSP_EMP',    'Prospecto empresa',  '#8A6A52', 0, 0, 0, 1),
(2, 'CONTACTO_INI', 'Contacto inicial',   '#C97B1A', 0, 0, 1, 2),
(2, 'PRESENTACION', 'Presentación',       '#1A5C8A', 0, 0, 1, 3),
(2, 'COTIZACION',   'Cotización enviada', '#3A2880', 0, 0, 1, 4),
(2, 'NEGOCIACION',  'Negociación',        '#5A3E9E', 0, 0, 1, 5),
(2, 'CONVENIO',     'Convenio firmado',   '#2A6E47', 1, 1, 0, 6),
(2, 'PERDIDO',      'Perdido',            '#B83227', 1, 0, 0, 7);

-- PAP (grupo_id=3)
INSERT IGNORE INTO sv_cfg_estados_gestion (estado_grupo_id, estado_codigo, estado_nombre, estado_color_hex, estado_es_final, estado_es_ganado, estado_requiere_fecha, estado_orden) VALUES
(3, 'VISITADO',   'Visitado',         '#8A6A52', 0, 0, 0, 1),
(3, 'INTERESADO', 'Interesado',       '#C97B1A', 0, 0, 1, 2),
(3, 'AFILIADO',   'Afiliado hoy',     '#2A6E47', 1, 1, 0, 3),
(3, 'VOLVER',     'Volver a visitar', '#1A5C8A', 0, 0, 1, 4),
(3, 'NO_INTERES', 'No interesado',    '#B83227', 1, 0, 0, 5);

-- SVC (grupo_id=4)
INSERT IGNORE INTO sv_cfg_estados_gestion (estado_grupo_id, estado_codigo, estado_nombre, estado_color_hex, estado_es_final, estado_es_ganado, estado_requiere_fecha, estado_orden) VALUES
(4, 'ABIERTO',    'Abierto',    '#1A5C8A', 0, 0, 0, 1),
(4, 'EN_GESTION', 'En gestión', '#C97B1A', 0, 0, 0, 2),
(4, 'ESCALADO',   'Escalado',   '#5A3E9E', 0, 0, 1, 3),
(4, 'RESUELTO',   'Resuelto',   '#2A6E47', 1, 1, 0, 4),
(4, 'CERRADO',    'Cerrado',    '#8A6A52', 1, 0, 0, 5);

-- ============================================================
-- 6. RESULTADOS DE GESTIÓN POR GRUPO
-- ============================================================
-- Telemercadeo (grupo_id=1)
INSERT IGNORE INTO sv_cfg_resultados_gestion (resultado_grupo_id, resultado_codigo, resultado_nombre, resultado_icono, resultado_es_positivo, resultado_requiere_fecha, resultado_orden) VALUES
(1, 'NO_CONTESTA',     'No contesta',                '📵', 0, 1, 1),
(1, 'OCUPADO',         'Ocupado / volver a llamar',  '🔄', 0, 1, 2),
(1, 'NUM_EQUIVOCADO',  'Número equivocado',          '❌', 0, 0, 3),
(1, 'NO_INTERESADO',   'No interesado',              '🚫', 0, 0, 4),
(1, 'INTERESADO_INFO', 'Interesado — enviar info',   '📩', 1, 1, 5),
(1, 'INTERESADO_VIS',  'Interesado — agendar visita','📅', 1, 1, 6),
(1, 'CONTRATO',        'Contrato firmado',           '✅', 1, 0, 7);

-- Empresariales (grupo_id=2)
INSERT IGNORE INTO sv_cfg_resultados_gestion (resultado_grupo_id, resultado_codigo, resultado_nombre, resultado_icono, resultado_es_positivo, resultado_requiere_fecha, resultado_orden) VALUES
(2, 'NO_CONTESTA',      'No contesta',           '📵', 0, 1, 1),
(2, 'REUNION_AGEND',    'Reunión agendada',      '📅', 1, 1, 2),
(2, 'COTIZ_ENVIADA',    'Cotización enviada',    '📄', 1, 1, 3),
(2, 'EN_REVISION',      'En revisión interna',   '⏳', 1, 1, 4),
(2, 'CONTRAOFERTA',     'Contraoferta recibida', '🤝', 1, 1, 5),
(2, 'CONVENIO_FIRMADO', 'Convenio firmado',      '✅', 1, 0, 6),
(2, 'PERDIDO',          'Oportunidad perdida',   '❌', 0, 0, 7);

-- PAP (grupo_id=3)
INSERT IGNORE INTO sv_cfg_resultados_gestion (resultado_grupo_id, resultado_codigo, resultado_nombre, resultado_icono, resultado_es_positivo, resultado_requiere_fecha, resultado_orden) VALUES
(3, 'AFILIADO_HOY',  'Afiliado hoy',                  '✅', 1, 0, 1),
(3, 'INTERESADO',    'Interesado',                    '💬', 1, 1, 2),
(3, 'VOLVER',        'Volver después',                '🔁', 0, 1, 3),
(3, 'NO_INTERESADO', 'No interesado',                 '🚫', 0, 0, 4),
(3, 'SIN_RESPUESTA', 'Sin respuesta / nadie en casa', '🏠', 0, 0, 5);

-- SVC (grupo_id=4)
INSERT IGNORE INTO sv_cfg_resultados_gestion (resultado_grupo_id, resultado_codigo, resultado_nombre, resultado_icono, resultado_es_positivo, resultado_requiere_fecha, resultado_orden) VALUES
(4, 'GESTIONANDO',   'En gestión activa',     '⚙️', 1, 0, 1),
(4, 'ESCALADO',      'Escalado a otra área',  '⬆️', 0, 1, 2),
(4, 'INFO_BRINDADA', 'Información brindada',  '💬', 1, 0, 3),
(4, 'RESUELTO',      'Caso resuelto',         '✅', 1, 0, 4),
(4, 'SIN_SOLUCION',  'Sin solución posible',  '❌', 0, 0, 5);

-- ============================================================
-- 7. FUENTES DE PROSPECTO POR ÁREA
-- ============================================================
-- Prenecesidad (area_id=1)
INSERT IGNORE INTO sv_cfg_fuentes_prospecto (fuente_area_id, fuente_codigo, fuente_nombre, fuente_es_masiva, fuente_orden) VALUES
(1, 'LISTA_TELE', 'Lista Telemercadeo',  1, 1),
(1, 'ENCUESTA',   'Encuesta',            0, 2),
(1, 'PARQUE',     'Evento / Parque',     0, 3),
(1, 'REFERIDO',   'Referido',            0, 4),
(1, 'TITULO',     'Título de Propiedad', 1, 5),
(1, 'CAMPO',      'Campo / Visita',      0, 6);

-- Empresariales (area_id=2)
INSERT IGNORE INTO sv_cfg_fuentes_prospecto (fuente_area_id, fuente_codigo, fuente_nombre, fuente_es_masiva, fuente_orden) VALUES
(2, 'DIR_DIAN',   'Directorio DIAN',      1, 1),
(2, 'CAMARA_COM', 'Cámara de Comercio',   1, 2),
(2, 'REF_CORP',   'Referido Corporativo', 0, 3),
(2, 'EVENTO_EMP', 'Evento Empresarial',   0, 4),
(2, 'COLD_CALL',  'Prospección directa',  0, 5);

-- PAP (area_id=3)
INSERT IGNORE INTO sv_cfg_fuentes_prospecto (fuente_area_id, fuente_codigo, fuente_nombre, fuente_es_masiva, fuente_orden) VALUES
(3, 'ZONA_ASIG',  'Zona asignada',              1, 1),
(3, 'REF_VECINO', 'Referido vecino',            0, 2),
(3, 'FERIA_COM',  'Feria / Evento comunitario', 0, 3);

-- SVC (area_id=4)
INSERT IGNORE INTO sv_cfg_fuentes_prospecto (fuente_area_id, fuente_codigo, fuente_nombre, fuente_es_masiva, fuente_orden) VALUES
(4, 'CONTRATO_SAP', 'Búsqueda por contrato SAP', 0, 1),
(4, 'LLAMADA_ENT',  'Llamada entrante',          0, 2),
(4, 'PQRS_WEB',     'PQRS Web',                  0, 3),
(4, 'DERIVADO',     'Derivado de otra área',     0, 4);

-- ============================================================
-- 8. ROLES
-- ============================================================
INSERT IGNORE INTO sv_org_roles (rol_codigo, rol_nombre, rol_nivel, rol_permisos) VALUES
('SUPER_ADMIN', 'Super Administrador',          1, '{"areas":["*"],"crm":["read","write","delete"],"admin":["read","write"],"reportes":["read","export"],"auditoria":["read"],"sap_config":["read","write"]}'),
('ADMIN_AREA',  'Administrador de Área',        2, '{"crm":["read","write"],"admin":["read","write"],"reportes":["read","export"]}'),
('SUPERVISOR',  'Supervisor de Grupo',          3, '{"crm":["read","write"],"admin":["read"],"reportes":["read","export"]}'),
('ASESOR',      'Asesor Comercial',             4, '{"crm":["read","write"],"reportes":["read"]}'),
('AGENTE_SVC',  'Agente Servicio al Cliente',   4, '{"svc":["read","write"],"reportes":["read"]}');

-- ============================================================
-- 9. USUARIOS DE PRUEBA
-- Contraseña inicial de todos: 'serventas2026' (la rellenan en src/sv/scripts/setup.js)
-- ============================================================
INSERT IGNORE INTO sv_org_usuarios (usr_rol_id, usr_email, usr_nombre, usr_apellido, usr_password_hash, usr_telefono) VALUES
(1, 'admin@serfunorte.com', 'Super', 'Admin', 'PENDING', '300 000 0001');

INSERT IGNORE INTO sv_org_usuarios (usr_area_id, usr_grupo_id, usr_rol_id, usr_punto_id, usr_email, usr_nombre, usr_apellido, usr_password_hash, usr_telefono) VALUES
(1, 1, 2, 1, 'admin.prenec@serfunorte.com',     'Admin',    'Prenecesidad', 'PENDING', '300 000 0002'),
(1, 1, 3, 1, 'supervisor.tele@serfunorte.com',  'Patricia', 'Vargas',       'PENDING', '301 111 0001'),
(1, 1, 4, 1, 'carmen.contreras@serfunorte.com', 'Carmen',   'Contreras',    'PENDING', '311 222 3344'),
(1, 1, 4, 1, 'denis.ramirez@serfunorte.com',    'Denis',    'Ramírez',      'PENDING', '311 222 3345'),
(1, 1, 4, 2, 'angelica.mora@serfunorte.com',    'Angélica', 'Mora',         'PENDING', '311 222 3346'),
(2, 2, 4, 1, 'carlos.mendoza@serfunorte.com',   'Carlos',   'Mendoza',      'PENDING', '312 333 4455'),
(2, 2, 4, 1, 'jose.martinez@serfunorte.com',    'José',     'Martínez',     'PENDING', '312 333 4456'),
(3, 3, 4, 3, 'luis.perez@serfunorte.com',       'Luis',     'Pérez',        'PENDING', '313 444 5566'),
(3, 3, 4, 3, 'diana.silva@serfunorte.com',      'Diana',    'Silva',        'PENDING', '313 444 5567'),
(4, 4, 5, 1, 'andrea.suarez@serfunorte.com',    'Andrea',   'Suárez',       'PENDING', '314 555 6677');

-- ============================================================
-- 10. METAS DE PRUEBA (Febrero 2026)
-- Asume usr_id 4=Carmen, 5=Denis, 6=Angélica, 7=Carlos, 8=José, 9=Luis, 10=Diana
-- ============================================================
INSERT IGNORE INTO sv_org_metas (meta_usuario_id, meta_anio, meta_mes, meta_contratos, meta_gestiones, meta_valor_cop, meta_created_by) VALUES
(4,  2026, 2, 10, 200, 45000000, 3),
(5,  2026, 2, 10, 200, 45000000, 3),
(6,  2026, 2, 10, 200, 45000000, 3),
(7,  2026, 2,  5,  80,  0,       2),
(8,  2026, 2,  5,  80,  0,       2),
(9,  2026, 2, 20, 400,  0,       2),
(10, 2026, 2, 20, 400,  0,       2);

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT 'Areas'      AS tabla, COUNT(*) AS registros FROM sv_cfg_areas_negocio
UNION ALL SELECT 'Puntos',     COUNT(*) FROM sv_cfg_puntos_atencion
UNION ALL SELECT 'Grupos',     COUNT(*) FROM sv_cfg_grupos_trabajo
UNION ALL SELECT 'Productos',  COUNT(*) FROM sv_cfg_productos
UNION ALL SELECT 'Estados',    COUNT(*) FROM sv_cfg_estados_gestion
UNION ALL SELECT 'Resultados', COUNT(*) FROM sv_cfg_resultados_gestion
UNION ALL SELECT 'Fuentes',    COUNT(*) FROM sv_cfg_fuentes_prospecto
UNION ALL SELECT 'Roles',      COUNT(*) FROM sv_org_roles
UNION ALL SELECT 'Usuarios',   COUNT(*) FROM sv_org_usuarios
UNION ALL SELECT 'Metas',      COUNT(*) FROM sv_org_metas;
