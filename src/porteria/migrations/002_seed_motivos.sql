-- Motivos iniciales (editables desde el admin). Todos aplican a ingreso y salida.
INSERT INTO por_motivos
  (codigo, nombre, aplica_propio, aplica_proveedor_asistencia, aplica_proveedor,
   tipo_referencia, referencia_obligatoria, orden, updated_by)
VALUES
  ('SERES_QUERIDOS',             'Seres queridos (asistencia)',             1, 0, 0, 'ASISTENCIA', 1,  10, 'seed'),
  ('EXEQUIAS',                   'Exequias',                                1, 0, 0, 'EXEQUIA',    1,  20, 'seed'),
  ('TRASLADOS',                  'Traslados',                               1, 0, 0, 'TEXTO',      1,  30, 'seed'),
  ('RECOGIDA_COFRES',            'Recogida de cofres',                      1, 0, 0, 'NINGUNA',    0,  40, 'seed'),
  ('EQUIPOS_VELACION',           'Equipos de velación',                     1, 0, 0, 'NINGUNA',    0,  50, 'seed'),
  ('TANQUEO',                    'Tanqueo',                                 1, 0, 0, 'NINGUNA',    0,  60, 'seed'),
  ('LAVADO',                     'Lavado',                                  1, 0, 0, 'NINGUNA',    0,  70, 'seed'),
  ('MANTENIMIENTO',              'Mantenimiento',                           1, 0, 0, 'NINGUNA',    0,  80, 'seed'),
  ('SERES_QUERIDOS_TERCERIZADA', 'Seres queridos (asistencia tercerizada)', 0, 1, 0, 'ASISTENCIA', 1,  90, 'seed'),
  ('ENTREGA_MERCANCIA',          'Entrega de mercancía',                    0, 0, 1, 'NINGUNA',    0, 100, 'seed'),
  ('MANTENIMIENTO_SERVICIO',     'Mantenimiento / servicio técnico',        0, 0, 1, 'NINGUNA',    0, 110, 'seed'),
  ('OTRO',                       'Otro',                                    0, 1, 1, 'TEXTO',      1, 120, 'seed');
