-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — R-34 Contratación de servicios
--
-- Reemplaza la hoja de cálculo donde se llevaban a mano los 10.644 R-34
-- emitidos desde septiembre de 2024. Un R-34 es la orden que se le manda a un
-- proveedor por un servicio del contrato: coro, carroza, transporte de
-- acompañantes, ramos o transporte de flores.
--
-- Los datos del servicio salen del ERP (Karingsoft) y no se copian aquí más
-- que como constancia de lo que se envió: si mañana el ERP cambia la
-- observación o el proveedor, el R-34 que firmó el proveedor sigue diciendo lo
-- que decía. Por eso esta tabla guarda el documento, no una referencia.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Consecutivos ───────────────────────────────────────────────────────────
-- El número del R-34 es parte del registro de calidad y viene impreso en el
-- formato, así que la serie continúa donde la dejó la hoja: SERV-10644.
--
-- Tabla aparte y no MAX(..)+1 porque dos usuarios generando al mismo tiempo se
-- llevarían el mismo número: aquí el UPDATE bloquea la fila y los serializa.
CREATE TABLE IF NOT EXISTS h360_consecutivos (
  clave      VARCHAR(30) NOT NULL PRIMARY KEY,
  ultimo     INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO h360_consecutivos (clave, ultimo) VALUES ('R34', 10644)
  ON DUPLICATE KEY UPDATE clave = clave;

-- ── El R-34 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS h360_r34 (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  consecutivo        VARCHAR(20)  NOT NULL,          -- SERV-10645
  consecutivo_num    INT UNSIGNED NOT NULL,          -- 10645, para ordenar y seguir la serie

  -- De qué servicio del contrato se trata. `item` es el contador de la línea
  -- en el ERP: con el contrato identifica la línea exacta.
  contrato           VARCHAR(20)  NOT NULL,
  item               INT          NULL,
  codigo_servicio    VARCHAR(10)  NULL,
  grupo              VARCHAR(40)  NOT NULL,          -- CORO | CARROZA | TRANSPORTE_ACOMPANANTES | RAMOS | TRANSPORTE_FLORES
  servicio_desc      VARCHAR(200) NULL,
  cantidad           DECIMAL(10,2) NULL,

  proveedor_nit      VARCHAR(30)  NULL,
  proveedor_nombre   VARCHAR(200) NULL,
  proveedor_email    VARCHAR(200) NULL,

  -- Lo que va impreso en el formato
  ser_querido        VARCHAR(200) NULL,
  contratante        VARCHAR(200) NULL,
  direccion_homenaje VARCHAR(200) NULL,
  telefono_cliente   VARCHAR(60)  NULL,
  fecha_entrega      DATE         NULL,
  hora_prestacion    VARCHAR(20)  NULL,              -- texto: en la hoja escriben "10:00 A.M", "3:30 PM"
  lugar_exequias     VARCHAR(150) NULL,
  cementerio         VARCHAR(150) NULL,
  observaciones      TEXT         NULL,

  autoriza_usuario   VARCHAR(50)  NOT NULL,
  autoriza_nombre    VARCHAR(150) NULL,

  -- Envío al proveedor. Se puede generar sin enviar: a veces se imprime y se
  -- entrega en mano.
  enviado_at         TIMESTAMP    NULL,
  enviado_a          VARCHAR(300) NULL,
  envio_resultado    JSON         NULL,

  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_r34_consecutivo (consecutivo),
  UNIQUE KEY uk_r34_consecutivo_num (consecutivo_num),
  -- Se consulta por contrato al abrir la pantalla, y por línea para avisar
  -- que esa ya tiene R-34. No es único: reemitir uno es legítimo.
  KEY idx_r34_contrato (contrato, item),
  KEY idx_r34_proveedor (proveedor_nit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Correos de proveedores que el ERP no tiene ─────────────────────────────
-- 321 de 598 proveedores tienen correo en Karingsoft, y entre los que faltan
-- hay dos de los de más volumen. En vez de pedirlo cada vez, el que escriban
-- queda aquí y la próxima vez viene prellenado. No se escribe en el ERP: H360
-- no toca Karingsoft.
CREATE TABLE IF NOT EXISTS h360_proveedor_contacto (
  nit         VARCHAR(30)  NOT NULL PRIMARY KEY,
  nombre      VARCHAR(200) NULL,
  email       VARCHAR(200) NULL,
  actualizado_por VARCHAR(50) NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
